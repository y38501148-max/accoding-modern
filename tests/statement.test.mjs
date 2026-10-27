import test from 'node:test';
import assert from 'node:assert/strict';
import {createContestCore} from '../src/contest-core.mjs';
import {createStatementCore} from '../src/statement-core.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const service=createStatementCore(createContestCore());
const fixture=()=>({id:1329,title:'C5 - 2026级程序设计基础第五次上机赛',start_time:'2026-10-20T11:00:00Z',end_time:'2026-10-20T13:00:00Z',problems:[
  {id:20,title:'第二题',description:'## 输入\n\n    * *\n     * \n    * *\n',contest_problem_list:{order:2}},
  {id:10,title:'第一题',description:'## 描述\n\n$a\\_i$ 和 $$\\sum x$$\n\n![图](/image/1.png)',contest_problem_list:{order:1}}
]});

test('statement uses contest order, matching titles, and preserves all source content',()=>{
  const raw=fixture(),out=service.compile(JSON.stringify(JSON.stringify(raw)),1329);
  assert.equal(out.title,'C5-Statement');
  assert.deepEqual(out.problems.map(p=>[p.label,p.id,p.title]),[['A','10','第一题'],['B','20','第二题']]);
  assert.equal(out.problems[0].description,raw.problems[1].description);
  assert.equal(out.problems[1].description,raw.problems[0].description);
  assert.equal(raw.problems[0].id,20);
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
