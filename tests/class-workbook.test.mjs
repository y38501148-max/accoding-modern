import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {readClassWorkbook} from '../src/class-workbook.mjs';
import {createClassCore} from '../src/class-core.mjs';
import {createClassXlsReader} from '../vendor/sheetjs/reader.mjs';

const core = createClassCore();
const namedFile = (parts, name) => Object.assign(new Blob(parts), {name});
const fixture = await readFile(new URL('fixtures/legacy-roster.xls', import.meta.url));

test('independent BIFF8 fixture: multiple sheets, title rows, continued Chinese strings and identifiers', async () => {
  const sheets = await readClassWorkbook(namedFile([fixture], '名单.xls'));
  assert.deepEqual(sheets.map(s => s.name), ['说明', '课程名单', '空白表']);
  assert.deepEqual(sheets[2].rows, []);
  const roster = core.roster(sheets[1].rows);
  assert.equal(roster.header, 3);
  assert.equal(roster.members.length, 400);
  assert.deepEqual(roster.warnings, []);
  assert.deepEqual(roster.members[0], {studentId:'00000001', name:'测试同学000甲乙丙丁', group:'测试教学班'});
  assert.equal(roster.members[1].studentId, '20260002');
  assert.equal(roster.members[2].name, '<img src=x onerror=alert(1)>');
  assert.equal(roster.members[399].name, '测试同学399甲乙丙丁');
  assert.ok(roster.members.every(m => Object.keys(m).join(',') === 'studentId,name,group'));
});

test('content detection accepts an XLS workbook even with an XLSX suffix', async () => {
  const sheets = await readClassWorkbook(namedFile([fixture], 'renamed.xlsx'));
  assert.equal(core.roster(sheets[1].rows).members.length, 400);
});

test('empty, renamed text, damaged and oversized files fail with actionable errors', async () => {
  for (const bytes of ['', '学号,姓名\n123,测试', '<html>不是工作簿</html>']) {
    await assert.rejects(readClassWorkbook(namedFile([bytes], 'invalid.xls')), /有效的 Excel/);
  }
  await assert.rejects(readClassWorkbook(new Blob([fixture.subarray(0, 100)])), /不完整/);
  await assert.rejects(readClassWorkbook(new Blob([fixture.subarray(0, 700)])), /损坏或加密/);
  await assert.rejects(readClassWorkbook({size: 12 * 1024 * 1024 + 1, arrayBuffer() {throw Error('must not read');}}), /12 MB/);
});

test('large XLS row ranges are rejected instead of silently truncating the roster', async () => {
  const xls = createClassXlsReader(), book = xls.utils.book_new();
  const sheet = xls.utils.aoa_to_sheet([['学号','姓名'], ['001','测试']]);
  sheet.A10002 = {t:'s',v:'002'}; sheet.B10002 = {t:'s',v:'最后一名'}; sheet['!ref']='A1:B10002';
  xls.utils.book_append_sheet(book, sheet, '名单');
  const bytes = xls.write(book, {type:'array',bookType:'biff8'});
  await assert.rejects(readClassWorkbook(new Blob([bytes])), /10001 行/);
});

test('small OLE workbooks preserve leading-zero text identifiers', async () => {
  const xls = createClassXlsReader(), book = xls.utils.book_new();
  const sheet = xls.utils.aoa_to_sheet([['学号','姓名'], ['000123','测试']]);
  xls.utils.book_append_sheet(book, sheet, '名单');
  const bytes = xls.write(book, {type:'array',bookType:'biff8'});
  const [result] = await readClassWorkbook(new Blob([bytes]));
  assert.deepEqual(core.roster(result.rows).members, [{studentId:'000123',name:'测试',group:''}]);
});

test('legacy reader stays local even on pages with XLSX, CommonJS and AMD globals', async () => {
  const source = await readFile(new URL('../vendor/sheetjs/reader.mjs', import.meta.url), 'utf8');
  const context = vm.createContext({window:{XLSX:{existing:true}}, exports:{existing:true}, module:{exports:{existing:true}}, define:()=>{throw Error('AMD must not run');}});
  context.define.amd = true;
  vm.runInContext(source.replace(/^export /gm, '') + '\nconst reader=createClassXlsReader(); if(reader.version!=="0.20.3")throw Error("version");', context);
  assert.equal(context.window.XLSX.existing, true);
  assert.equal(context.exports.existing, true);
  assert.equal(context.module.exports.existing, true);
  assert.equal(context.XLSX, undefined);
  const upstream = source.slice(source.indexOf('/*! xlsx.js'), source.lastIndexOf('\nreturn XLSX;')).replaceAll('\n+String(w)', '+String(w)');
  assert.equal(createHash('sha256').update(upstream).digest('hex'), 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
});
