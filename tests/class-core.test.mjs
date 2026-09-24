import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassCore} from '../src/class-core.mjs';
import {createContestCore} from '../src/contest-core.mjs';
const core=createClassCore();
test('course roster group aliases work with reordered headers and preserve administrative group priority',()=>{
  for(const label of ['班级名称','行政班级','班级']){
    assert.deepEqual(core.roster([[label,'序号','姓名','学号'],['测试班',1,'测试同学','00123456']]).members,[{studentId:'00123456',name:'测试同学',group:'测试班'}]);
  }
  assert.equal(core.roster([['班级名称','学号','姓名','班级'],['教学班','001','测试','行政班']]).members[0].group,'行政班');
});
test('class members sort by in-contest solved count, then student number; unmatched last',()=>{
  const rows=[{studentId:'002',userId:'2',accepted:3},{studentId:'000',userId:null,accepted:null},{studentId:'003',userId:'3',accepted:10},{studentId:'001',userId:'1',during:3,upsolved:7}];
  assert.deepEqual(core.sortMembers(rows).map(r=>r.studentId),['003','001','002','000']);
  assert.equal(rows[0].studentId,'002');
});
test('teaching roster header may follow metadata; only required columns survive',()=>{
  const result=core.roster([['点名册'],['2026秋'],['序号','学号','姓名','联系电话','班级'],[1,'00123456',' 张三 ','123456789','C1'],[2,'00123456','张三','secret','C1']]);
  assert.deepEqual(result.members,[{studentId:'00123456',name:'张三',group:'C1'}]);assert.equal(result.warnings.length,1);
});
test('conflicting student numbers and invalid roster fail rather than silently merging',()=>{
  assert.throws(()=>core.roster([['学号','姓名'],['123','甲'],['123','乙']]),/重复/);
  assert.throws(()=>core.roster([['学号','姓名'],['','甲']]),/有效学生/);
  assert.throws(()=>core.roster([['姓名'],['甲']]),/找不到/);
});
const members=[{studentId:'001',name:'同名'},{studentId:'002',name:'同名'},{studentId:'003',name:'未知'},{studentId:'004',name:'冲突'}];
const problems=[{id:'99',rankKey:'A'},{id:'98',rankKey:'B'}];
test('exact student numbers determine class membership; no nickname fallback',()=>{
  const result=core.summarize(members,[{user:{id:1,student_id:'001'},detail:{A:{result:'AC'},B:{result:'JG'}}},{user:{id:2,student_id:'002'},detail:{A:{result:'WA',wrong_count:100}}},{user:{id:9,student_id:'999',nickname:'未知'},detail:{B:{result:'AC'}}}],problems);
  assert.equal(result.matched,2);assert.equal(result.missing,2);assert.deepEqual(result.stats.map(p=>[p.accepted,p.tried]),[[1,2],[0,1]]);assert.equal(result.rows[2].accepted,null);
});
test('duplicate accounts with the same student number are excluded from totals',()=>{
  const result=core.summarize(members,[{user:{id:1,student_id:'004'},detail:{A:{result:'AC'}}},{user:{id:2,student_id:'004'},detail:{A:{result:'AC'}}}],problems);
  assert.equal(result.ambiguous,1);assert.equal(result.matched,0);assert.equal(result.stats[0].accepted,0);
});
test('unavailable rank is an error; valid empty rank keeps members unresolved',()=>{
  assert.throws(()=>core.summarize(members,{error:'denied'},problems));
  const result=core.summarize(members,[],problems);assert.equal(result.missing,4);assert.equal(result.rows[0].accepted,null);
});
test('submission selection uses account id, deduplicates and orders newest first',()=>{
  const rows=core.submissions([{id:1,creator_id:1},{id:2,creator:{id:1}},{id:3,creator_id:2},{id:2,creator_id:1}],'1');
  assert.deepEqual(rows.map(r=>r.id),[2,1]);
});
test('problem AC selection uses matched class accounts and exact problem IDs, keeps all AC attempts newest first',()=>{
  const students=[{studentId:'001',name:'同名',status:'matched',userId:'1'},{studentId:'002',name:'同名',status:'matched',userId:'2'},{studentId:'003',status:'ambiguous',userId:'3'},{studentId:'004',status:'missing',userId:null}];
  const raw=[
    {id:1,creator_id:1,problem_id:99,result:'AC'},
    {id:2,creator:{id:2},problem_id:'99',result:'AC'},
    {id:3,creator_id:'1',problem_id:'99',result:'AC'},
    {id:'3',creator_id:1,problem_id:99,result:'AC'},
    {id:4,creator_id:1,problem_id:99,result:'WA'},
    {id:5,creator_id:1,problem_id:99,result:'JG'},
    {id:6,creator_id:1,problem_id:98,result:'AC'},
    {id:7,creator_id:9,problem_id:99,result:'AC'},
    {id:8,creator_id:3,problem_id:99,result:'AC'},
    {id:9,creator_id:null,problem_id:99,result:'AC'},
    {id:'invalid',creator_id:1,problem_id:99,result:'AC'}
  ];
  assert.deepEqual(core.problemSubmissions(raw,students,'99').map(r=>[r.submission.id,r.member.studentId]),[[3,'001'],[2,'002'],[1,'001']]);
  assert.equal(raw[0].id,1);
  assert.deepEqual(core.problemSubmissions(raw,students,'100'),[]);
  assert.deepEqual(core.problemSubmissions(raw,[],'99'),[]);
  assert.throws(()=>core.problemSubmissions({error:'denied'},students,'99'),/格式/);
});
test('score matrix follows roster and contest order and agrees with summary counts',()=>{
  const roster=[{studentId:'003',name:'丙'},{studentId:'001',name:'甲'},{studentId:'002',name:'乙'},{studentId:'004',name:'冲突'}];
  const problems=createContestCore().normalizeContest({id:1,start_time:'2026-09-01T00:00:00Z',end_time:'2026-09-01T02:00:00Z',
    problems:Array.from({length:7},(_,i)=>({id:100-i,title:`题目 ${i}`,contest_problem_list:{order:i}})).reverse()}).problems;
  const summary=core.summarize(roster,[
    {user:{id:1,student_id:'001'},detail:{A:{result:'AC'},B:{result:'WA'},C:{result:'JG'},D:{result:'WT'},E:{},F:null}},
    {user:{id:2,student_id:'002'},detail:{A:{result:'RE'},B:{result:'CE'},C:{result:''},D:{result:null}}},
    {user:{id:3,student_id:'004'},detail:{A:{result:'AC'}}},
    {user:{id:4,student_id:'004'},detail:{A:{result:'AC'}}}
  ],problems);
  summary.rows.reverse(); // A sorted or filtered view must not change export order or roster identity.
  const before=JSON.stringify([roster,summary,problems]);
  const matrix=core.scoreMatrix(roster,summary,problems);
  assert.deepEqual(matrix.headers,['学号','姓名','通过题数','尝试题数',...['A','B','C','D','E','F','G'].map((v,i)=>`${v} · 题目 ${i}`)]);
  assert.deepEqual(matrix.rows,[
    ['003','丙',0,0,...Array(7).fill('未尝试')],
    ['001','甲',1,4,'AC','WA','WA','WA','未尝试','未尝试','未尝试'],
    ['002','乙',0,4,'WA','WA','WA','WA','未尝试','未尝试','未尝试'],
    ['004','冲突',0,0,...Array(7).fill('未尝试')]
  ]);
  for(const row of matrix.rows){
    const summaryRow=summary.rows.find(m=>m.studentId===row[0]);
    assert.equal(row[2],summaryRow.accepted??0);
    assert.equal(row[3],summaryRow.tried??0);
    assert.equal(row[2],row.slice(4).filter(s=>s==='AC').length);
    assert.equal(row[3],row.slice(4).filter(s=>s!=='未尝试').length);
  }
  assert.equal(JSON.stringify([roster,summary,problems]),before);
});

test('score matrix retains absent or unresolved students even if summary contains misleading details',()=>{
  const summary={rows:[
    {studentId:'001',status:'missing',userId:'1',details:{A:{result:'AC'}}},
    {studentId:'002',status:'ambiguous',userId:'2',details:{A:{result:'AC'}}}
  ]};
  const matrix=core.scoreMatrix(members,summary,[{label:'A',title:'题名',rankKey:'A'}]);
  assert.deepEqual(matrix.rows,members.map(m=>[m.studentId,m.name,0,0,'未尝试']));
  assert.throws(()=>core.scoreMatrix(members,null,[]),/请先读取/);
  assert.deepEqual(core.scoreMatrix(members,core.summarize(members,[],[]),[]),{
    headers:['学号','姓名','通过题数','尝试题数'],rows:members.map(m=>[m.studentId,m.name,0,0])});
});

test('score matrix uses display labels and legacy rank keys independently beyond Z',()=>{
  const problems=createContestCore().normalizeContest({id:1,start_time:'2026-09-01T00:00:00Z',end_time:'2026-09-01T02:00:00Z',
    problems:Array.from({length:28},(_,i)=>({id:i+1,title:`题${i}`,contest_problem_list:{order:i}}))}).problems;
  const summary=core.summarize(members,[{user:{id:1,student_id:'001'},detail:{BA:{result:'AC'},BB:{result:'JG'}}}],problems);
  const matrix=core.scoreMatrix(members,summary,problems);
  assert.equal(matrix.headers[29],'Z · 题25');
  assert.deepEqual(matrix.headers.slice(30),['AA · 题26','AB · 题27']);
  assert.deepEqual(matrix.rows[0].slice(30),['AC','WA']);
  assert.deepEqual(matrix.rows[0].slice(2,4),[1,2]);
});

test('single problem review picks one AC or the latest two attempts per matched user',()=>{
  const students=[{studentId:'001',status:'matched',userId:'1'},{studentId:'002',status:'matched',userId:'2'},{studentId:'003',status:'matched',userId:'3'},{studentId:'004',status:'ambiguous',userId:'4'}];
  const raw=[
    {id:1,creator_id:1,problem_id:99,result:'WA'},
    {id:2,creator_id:1,problem_id:99,result:'AC'},
    {id:3,creator_id:1,problem_id:99,result:'AC'},
    {id:4,creator_id:1,problem_id:99,result:'WA'},
    {id:5,creator_id:2,problem_id:99,result:'WA'},
    {id:6,creator_id:2,problem_id:99,result:'CE'},
    {id:7,creator_id:2,problem_id:99,result:'JG'},
    {id:8,creator_id:3,problem_id:99,result:'WA'},
    {id:9,creator_id:4,problem_id:99,result:'AC'},
    {id:10,creator_id:1,problem_id:98,result:'AC'},
    {id:7,creator_id:2,problem_id:99,result:'JG'}
  ];
  assert.deepEqual(core.problemReviewSubmissions(raw,students,'99').map(x=>x.submission.id),[3,7,6,8]);
  assert.deepEqual(core.problemReviewSubmissions(raw,students,'98').map(x=>x.submission.id),[10]);
  assert.deepEqual(core.problemReviewSubmissions(raw,students,'100'),[]);
  assert.throws(()=>core.problemReviewSubmissions({},students,'99'),/格式/);
});
