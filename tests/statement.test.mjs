import test from 'node:test';
import assert from 'node:assert/strict';
import {createContestCore} from '../src/contest-core.mjs';
import {createStatementCore} from '../src/statement-core.mjs';
import {readFile} from 'node:fs/promises';

const service=createStatementCore(createContestCore());
const fixture=()=>({id:1329,title:'C5 - 2026级程序设计基础第五次上机赛',start_time:'2026-10-20T11:00:00Z',end_time:'2026-10-20T13:00:00Z',problems:[
  {id:20,title:'第二题',description:'## 输入\n\n    * *\n     * \n    * *\n',test_setting:'{"time_limit":"3000","memory_limit":"131072"}',contest_problem_list:{order:2}},
  {id:10,title:'第一题',description:'## 描述\n\n$a\\_i$ 和 $$\\sum x$$\n\n![图](/image/1.png)',test_setting:'{"time_limit":"1000","memory_limit":"65536"}',contest_problem_list:{order:1}}
]});

test('statement uses contest order, matching titles, and preserves all source content',()=>{
  const raw=fixture(),out=service.compile(JSON.stringify(JSON.stringify(raw)),1329);
  assert.equal(out.title,'C5-Statement');
  assert.deepEqual(out.problems.map(p=>[p.label,p.id,p.title]),[['A','10','第一题'],['B','20','第二题']]);
  assert.equal(out.problems[0].description,raw.problems[1].description);
  assert.equal(out.problems[1].description,raw.problems[0].description);
  assert.equal(raw.problems[0].id,20);
  assert.deepEqual(out.problems.map(p=>[p.timeLimit,p.memoryLimit]),[[1000,65536],[3000,131072]]);
});
test('statement exposes the contest title, Beijing date, problem headings and OJ limits',()=>{
  const out=service.compile(JSON.stringify(JSON.stringify(fixture())),1329);
  assert.equal(out.contestTitle,'C5 - 2026级程序设计基础第五次上机赛');
  assert.equal(out.dateText,'2026 年 10 月 20 日');
  assert.deepEqual(out.problems.map(p=>[p.heading,p.timeLimitText,p.memoryLimitText]),[
    ['A 第一题','1000 ms','65536 KB'],
    ['B 第二题','3000 ms','131072 KB']
  ]);
  assert.ok(!/文件名|目录|可执行|测试点|等分|编译选项|下发文件/.test(JSON.stringify(out)));
});
test('statement dates cross the Beijing day boundary as a range',()=>{
  const raw=fixture();raw.start_time='2026-10-20T20:00:00Z';raw.end_time='2026-10-21T20:00:00Z';
  assert.equal(service.compile(raw,1329).dateText,'2026 年 10 月 21 日 — 2026 年 10 月 22 日');
});
test('statement reads numeric and string limits from decoded or JSON test settings',()=>{
  for(const encode of [value=>value,JSON.stringify,value=>JSON.stringify(JSON.stringify(value))]){
    const raw=fixture();raw.problems[1].test_setting=encode({time_limit:2500,memory_limit:' 2048 ',special_judge:'private checker',data:[{input:'private.in'}]});
    const problem=service.compile(raw,1329).problems[0];
    assert.equal(problem.timeLimit,2500);assert.equal(problem.memoryLimit,2048);
    assert.equal(problem.test_setting,undefined);assert.equal(problem.special_judge,undefined);assert.equal(problem.data,undefined);
  }
});
test('missing or malformed settings stop export with the affected problem label',()=>{
  for(const settings of [undefined,null,'','{broken','null','[]']){
    const raw=fixture();raw.problems[1].test_setting=settings;
    assert.throws(()=>service.compile(raw,1329),/A 题时间限制缺失或无效/);
  }
});
test('missing or invalid limits never become defaults or silently disappear',()=>{
  for(const [field,name]of [['time_limit','时间限制'],['memory_limit','空间限制']])for(const value of [undefined,null,'',' ',0,-1,1.5,'1e3','1000 ms',true,[],{},9007199254740992]){
    const raw=fixture();raw.problems[0].test_setting=JSON.stringify({time_limit:'1000',memory_limit:'65536',[field]:value});
    assert.throws(()=>service.compile(raw,1329),new RegExp(`B 题${name}缺失或无效`));
  }
});
for(const [name,title]of [[' E12-练习赛','E12-Statement'],['C6－上机','C6-Statement'],['E1—练习','E1-Statement'],['C7','C7-Statement']])test('statement name: '+name,()=>{
  assert.equal(service.compile({...fixture(),title:name},1329).title,title);
});
test('missing descriptions, empty contests, and mismatched identity fail before export',()=>{
  const raw=fixture();delete raw.problems[1].description;
  assert.throws(()=>service.compile(raw,1329),/A 题题面为空/);
  assert.throws(()=>service.compile({...fixture(),problems:[]},1329),/没有题目/);
  assert.throws(()=>service.compile(fixture(),1326),/ID 不匹配/);
});

const exportSource=await readFile(new URL('../src/statement-export.js',import.meta.url),'utf8');
test('statement UI exports a LaTeX project and no longer prints HTML',async()=>{
  assert.match(exportSource,/createLatexProject/);
  assert.match(exportSource,/ACCODING_OICONTEST_CLASS/);
  assert.match(exportSource,/fetchStatementImage/);
  const texSource=await readFile(new URL('../src/statement-tex.mjs',import.meta.url),'utf8');
  assert.match(texSource,/createStoredZip/);
  assert.match(exportSource,/导出 Statement/);
  assert.doesNotMatch(exportSource,/printStatement|view\.print|MathJax|ACCODING_STATEMENT_CSS|statementPageRules/);
});
test('bundled LaTeX class keeps the template style and has font fallbacks',async()=>{
  const source=await readFile(new URL('../src/oicontest.cls',import.meta.url),'utf8');
  for(const token of ['\\LoadClass[a4paper,12pt]{ctexart}','\\RequirePackage{minted}','\\pageref{LastPage}',
    '\\IfFontExistsTF{SimSun}','FandolSong-Regular.otf','FandolHei-Regular.otf','\\setCJKmainfont','\\setmonofont'])assert.ok(source.includes(token),token);
  assert.match(source,/\\fancyfoot\[C\]\{[^}]*\\pageref\{LastPage\}[^}]*\}/s);
  assert.ok(!source.includes('\\color{blue} \\pageref{LastPage}'));
});
test('old HTML statement stylesheet is removed',async()=>{
  await assert.rejects(readFile(new URL('../src/statement.css',import.meta.url),'utf8'),/ENOENT/);
});
