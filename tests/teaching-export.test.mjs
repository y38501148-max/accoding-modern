import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeachingScoreExport} from '../src/teaching-export.mjs';
import {createTextXlsx} from '../src/class-xlsx.mjs';
import {createTeachingContest} from '../src/teaching-contest.mjs';
import {createContestCore} from '../src/contest-core.mjs';

const context = {contestId: '1326', courseName: '程序设计基础', className: '测试/班', includeRetake: false,
  observedAt: '2026-10-29T12:00:00Z', exportedAt: '2026-10-29T12:01:00Z'};
const members = [
  {studentId: '0003', name: '未提交'},
  {studentId: '0002', name: '零分'},
  {studentId: '0001', name: '=HYPERLINK("bad")'},
  {studentId: '0004', name: '重修同学', isRetake: true}
];
const view = {source: 'oj', contest_id: '1326', name: 'E4:练习赛',
  problems: [{order_letter: 'A', title: '第一题'}, {order_letter: 'B', title: '第二题'}],
  scores: [{student_id: '9999', total_score: 1000, rank: 1}, {student_id: '0001', total_score: 40, rank: 2},
    {student_id: '0002', total_score: 0, rank: 3}, {student_id: '0004', total_score: 20, rank: 4}],
  problemResults: {'0001': {A: {score: 30, result: 'AC'}, B: {score: 10, result: 'WA'}},
    '0002': {A: {score: 0, result: 'WA'}}, '0004': {B: {score: 20, result: 'AC'}}}};

function unzip(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  assert.equal(data.getUint32(end, true), 0x06054b50);
  const count = data.getUint16(end + 10, true), files = new Map();
  let offset = data.getUint32(end + 16, true);
  for (let index = 0; index < count; index++) {
    assert.equal(data.getUint32(offset, true), 0x02014b50);
    assert.equal(data.getUint16(offset + 10, true), 0);
    const nameLength = data.getUint16(offset + 28, true), size = data.getUint32(offset + 24, true);
    const local = data.getUint32(offset + 42, true);
    assert.equal(data.getUint32(local, true), 0x04034b50);
    const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true);
    const decoder = new TextDecoder();
    files.set(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)), decoder.decode(bytes.subarray(start, start + size)));
    offset += 46 + nameLength + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
  }
  assert.equal(offset, end);
  return files;
}
async function workbook(result) { return unzip(new Uint8Array(await result.blob.arrayBuffer())); }
const cell = (xml, ref) => xml.match(new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?</c>`))?.[0];

test('uncollected OJ export keeps roster scope, numeric scores, problem order and literal identity', async () => {
  const before = structuredClone({view, members});
  const result = createTeachingScoreExport(view, members.filter(member => !member.isRetake), context);
  assert.equal(result.filename, '测试_班-E4_练习赛-成绩.xlsx');
  assert.equal(result.blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = await workbook(result), xml = files.get('xl/worksheets/sheet1.xml');
  assert.match(files.get('xl/workbook.xml'), /name="成绩表"/);
  assert.match(files.get('xl/workbook.xml'), /name="统计范围"/);
  assert.match(xml, /autoFilter ref="A1:H4"/);
  assert.match(cell(xml, 'A2'), /t="inlineStr".*>0001<\/t>/);
  assert.match(cell(xml, 'B2'), /=HYPERLINK\(&quot;bad&quot;\)/);
  assert.doesNotMatch(xml, /<f[ >]/);
  for (const [ref, number] of [['C2', 40], ['D2', 2], ['E2', 30], ['G2', 10], ['C3', 0], ['E3', 0]]) {
    assert.match(cell(xml, ref), new RegExp(`t="n"[^>]*><v>${number}</v>`));
  }
  assert.match(cell(xml, 'E1'), /A · 第一题 · 分数/);
  assert.match(cell(xml, 'G1'), /B · 第二题 · 分数/);
  assert.match(cell(xml, 'F2'), />AC<\/t>/);
  assert.match(cell(xml, 'H2'), />WA<\/t>/);
  assert.match(cell(xml, 'A4'), />0003<\/t>/);
  assert.match(cell(xml, 'C4'), /t="inlineStr"[^>]*><is><t[^>]*><\/t>/);
  assert.match(cell(xml, 'H3'), />未提交<\/t>/);
  assert.doesNotMatch(xml, /9999|1000|重修同学|0004/);
  assert.deepEqual({view, members}, before);
});

test('metadata records source, roster filters, contest and both observation and export times', async () => {
  const files = await workbook(createTeachingScoreExport(view, members, {...context, includeRetake: true}));
  const meta = files.get('xl/worksheets/sheet2.xml'), scores = files.get('xl/worksheets/sheet1.xml');
  for (const value of ['OJ 当前可见榜单', '非云端赛内定稿', '补题成绩', '程序设计基础', '测试/班', '1326', 'E4:练习赛',
    '2026-10-29T12:00:00.000Z', '2026-10-29T12:01:00.000Z']) assert.ok(meta.includes(value), value);
  assert.match(cell(meta, 'B6'), />是<\/t>/);
  assert.match(scores, /autoFilter ref="A1:H5"/);
  assert.match(scores, /重修同学/);
  assert.match(cell(scores, 'A3'), />0004<\/t>/);
  assert.doesNotMatch(meta, /t="n"/);
});

test('equal scores use OJ rank, then student ID, with absent scores after actual zeroes', async () => {
  const fixture = structuredClone(view);
  fixture.scores = ['0001', '0002', '0004'].map(student_id => ({student_id, total_score: 0, rank: student_id === '0004' ? 1 : 2}));
  const xml = (await workbook(createTeachingScoreExport(fixture, members, context))).get('xl/worksheets/sheet1.xml');
  assert.deepEqual(['A2', 'A3', 'A4', 'A5'].map(ref => cell(xml, ref).match(/>(000\d)<\/t>/)[1]), ['0004', '0001', '0002', '0003']);
});

test('OJ identity mapping survives export without guessing duplicate student numbers', async () => {
  const roster = [{studentId: '0001', name: '已关联', userId: '11'}, {studentId: '0002', name: '唯一学号'},
    {studentId: '0003', name: '冲突学号'}];
  const contest = {id: 1326, group_id: 124, title: 'E4 练习', start_time: '2026-10-28T00:00:00Z',
    end_time: '2026-10-30T00:00:00Z', problems: [{id: 10, title: 'A', contest_problem_list: {order: 0, score: 100}}]};
  const rank = [
    {user: {id: 99, student_id: '9999'}, score: 1000, detail: {}},
    {user: {id: 11, student_id: '0001'}, score: 40, detail: {A: {score: 40, result: 'WA'}}},
    {user: {id: 12, student_id: '0002'}, score: 20, detail: {A: {score: 20, result: 'WA'}}},
    ...[13, 14].map(id => ({user: {id, student_id: '0003'}, score: 60, detail: {A: {score: 60, result: 'WA'}}}))
  ];
  const data = createTeachingContest(contest, rank, roster, '124', createContestCore());
  const xml = (await workbook(createTeachingScoreExport(data, roster, context))).get('xl/worksheets/sheet1.xml');
  assert.match(cell(xml, 'C2'), /t="n"[^>]*><v>40<\/v>/);
  assert.match(cell(xml, 'D3'), /t="n"[^>]*><v>3<\/v>/);
  assert.match(cell(xml, 'C4'), /t="inlineStr"[^>]*><is><t[^>]*><\/t>/);
  assert.match(cell(xml, 'F4'), />未提交<\/t>/);
  assert.doesNotMatch(xml, /9999|<v>60<\/v>|<v>1000<\/v>/);
});

test('numeric columns are opt-in and only finite Number values become numeric cells', () => {
  const files = unzip(createTextXlsx([
    {name: '既有文本', headers: ['值'], rows: [[60]], widths: [12]},
    {name: '数值', headers: ['值'], rows: [[60], ['61'], [Infinity], ['=1+1']], widths: [12], numericColumns: [0]}
  ]));
  assert.match(cell(files.get('xl/worksheets/sheet1.xml'), 'A2'), /t="inlineStr"/);
  const numeric = files.get('xl/worksheets/sheet2.xml');
  assert.match(cell(numeric, 'A2'), /t="n"[^>]*><v>60<\/v>/);
  for (const ref of ['A1', 'A3', 'A4', 'A5']) assert.match(cell(numeric, ref), /t="inlineStr"/);
  assert.doesNotMatch(numeric, /<f[ >]/);
});

test('source and context mismatches or incomplete timestamps refuse an export', () => {
  assert.throws(() => createTeachingScoreExport({...view, source: 'cloud'}, members, context), /来源或比赛不匹配/);
  assert.throws(() => createTeachingScoreExport(view, members, {...context, contestId: '1335'}), /来源或比赛不匹配/);
  assert.throws(() => createTeachingScoreExport(view, members, {...context, observedAt: ''}), /榜单读取时间无效/);
  assert.throws(() => createTeachingScoreExport(view, members, {...context, exportedAt: 'invalid'}), /导出时间无效/);
  assert.throws(() => createTeachingScoreExport({...view, scores: null}, members, context), /数据不完整/);
  assert.throws(() => createTeachingScoreExport(view, [{studentId: '', name: '缺失学号'}], context), /缺少学号/);
});
