import test from 'node:test';
import assert from 'node:assert/strict';
import {createContestCore} from '../src/contest-core.mjs';
import {createStatementCore,statementCoverTable,statementPageRules} from '../src/statement-core.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

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
});
test('statement dates cross the Beijing day boundary as a range',()=>{
  const raw=fixture();raw.start_time='2026-10-20T20:00:00Z';raw.end_time='2026-10-21T20:00:00Z';
  assert.equal(service.compile(raw,1329).dateText,'2026 年 10 月 21 日 — 2026 年 10 月 22 日');
});
test('cover puts each problem number and name on one row without template file rows',()=>{
  const out=service.compile(fixture(),1329),table=statementCoverTable(out);
  assert.deepEqual(table.columns,['题号','题目名称','时间限制','空间限制']);
  assert.deepEqual(table.rows,[
    ['A','第一题','1000 ms','65536 KB'],
    ['B','第二题','3000 ms','131072 KB']
  ]);
  assert.ok(!/文件名|目录|可执行|测试点|等分|编译选项|下发文件/.test(JSON.stringify(table)));
});
test('page rules name every problem and escape CSS content strings',()=>{
  const raw=fixture();raw.title='C5 - 引号"与\\反斜杠';
  const css=statementPageRules(service.compile(raw,1329));
  assert.match(css,/@page\{size:A4;margin:25mm/);
  assert.match(css,/@page cover/);
  assert.match(css,/@page p0\{@top-right\{content:"A 第一题"/);
  assert.match(css,/@page p1\{@top-right\{content:"B 第二题"/);
  assert.match(css,/counter\(page\)/);
  assert.match(css,/counter\(pages\)/);
  assert.ok(css.includes('\u00a0\u00a0\u00a0\u00a0'));
  assert.match(css,/@top-center\{content:"";width:100%;margin-top:54pt;border-top:0\.2pt solid #000\}/);
  assert.match(css,/@page cover\{@top-left\{content:none\}@top-right\{content:none\}@top-center\{content:none;border-top:none\}/);
  assert.ok(css.includes('引号\\"与\\\\反斜杠'));
});
test('statement stylesheet keeps the OI template typography',async()=>{
  const css=await readFile(new URL('../src/statement.css',import.meta.url),'utf8');
  for(const token of ['SimSun','SimHei','Consolas','line-height:1.565','text-emphasis:dot','font-synthesis:none','page-break-before:always','margin:3pt 0 3pt 8.5pt','@media print'])assert.ok(css.includes(token),token);
  assert.match(css,/\.problem-title\{[^}]*font-weight:400/);
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
test('statement loads MathJax inside the preview iframe and typesets each problem separately',()=>{
  assert.match(exportSource,/SVG:\{font:'TeX',scale:80,useGlobalCache:false\}/);
  assert.match(exportSource,/const mathBootstrap=`MathJax=\$\{JSON\.stringify\(mathConfig\)\}/);
  assert.match(exportSource,/mathScript\.textContent=mathBootstrap/);
  assert.match(exportSource,/view\.Function\(mathBootstrap\)/);
  assert.match(exportSource,/copyPageMathStyles\(doc\)/);
  assert.match(exportSource,/pageMath\.Hub\.Queue/);
  assert.match(exportSource,/am-statement-source-body/);
  assert.match(exportSource,/waitForMath/);
  assert.ok(!exportSource.includes('view.eval(ACCODING_MATHJAX_SOURCE)'));
  assert.match(exportSource,/MathJax 未能在预览页初始化/);
  assert.match(exportSource,/公式编译超时/);
  assert.match(exportSource,/正在编译公式/);
  assert.match(exportSource,/60000/);
  assert.match(exportSource,/function clearLazyFontRanges/);
  assert.match(exportSource,/Register\.StartupHook\('End',clearRanges\)/);
  assert.match(exportSource,/typeof font!=='object'/);
  assert.match(exportSource,/题面公式未能渲染/);
});
for(const outcome of ['afterprint','close','throw'])test('PDF filename uses the contest title and restores the page after '+outcome,()=>{
  const owner={title:'管理页面'},dialog=new EventTarget(),view=new EventTarget();
  Object.assign(view,{parent:{document:owner},frameElement:{closest:()=>dialog},focus(){},print(){
    assert.equal(owner.title,'C5-Statement');
    if(outcome==='throw')throw new Error('打印失败');
  }});
  const context=vm.createContext({view});vm.runInContext(exportSource,context);
  const print=()=>vm.runInContext("printStatement(view,'C5-Statement')",context);
  if(outcome==='throw')assert.throws(print,/打印失败/);
  else{print();assert.equal(owner.title,'C5-Statement');(outcome==='close'?dialog:view).dispatchEvent(new Event(outcome));}
  assert.equal(owner.title,'管理页面');
});
