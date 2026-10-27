import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeachingContest,mergeTeachingContests,acceptanceAxis} from '../src/teaching-contest.mjs';
import {createContestCore} from '../src/contest-core.mjs';
const core=createContestCore();
const contest={id:1326,group_id:124,title:'E4 练习赛',start_time:'2026-10-15T00:00:00Z',end_time:'2026-10-18T15:50:00Z',problems:[{id:2,title:'第二题',contest_problem_list:{order:1,score:20}},{id:1,title:'第一题',contest_problem_list:{order:0,score:30}}]};
const members=[{studentId:'001',name:'甲',userId:'11'},{studentId:'002',name:'乙',userId:null},{studentId:'003',name:'丙',userId:'13'},{studentId:'004',name:'丁',userId:null}];
const rank=[{user:{id:99,student_id:'999'},score:50,detail:{A:{result:'AC',score:30},B:{result:'AC',score:20}}},{user:{id:11,student_id:'001'},score:40,penalty:1000,detail:{A:{result:'AC',score:30,wrong_count:1},B:{result:'WA',score:10}}},{user:{id:12,student_id:'002'},score:0,detail:{A:{result:'WA',score:0}}}];
test('the group list includes E and uncollected C contests, with collected states preserved',()=>{
 const rows=mergeTeachingContests([{id:'1329',title:'C5 上机'},{id:'1326',title:'E4 练习'},{id:'1323',title:'C4 上机'},{id:'1317',title:'Special - 国庆'}],[{id:'1323',title:'旧标题',state:'verified'}],false);
 assert.deepEqual(rows.map(c=>[c.id,c.state]),[['1329','oj'],['1326','oj'],['1323','verified']]);assert.equal(rows[2].title,'C4 上机');
 assert.equal(mergeTeachingContests([{id:'1317',title:'Special - 国庆'}],[],true).length,1);
});
test('OJ rank produces roster-scoped overview, scores and four problem groups without submissions',()=>{
 const data=createTeachingContest(contest,rank,members,'124',core);
 assert.deepEqual(data.problems.map(p=>[p.order_letter,p.title,p.max_score]),[['A','第一题',30],['B','第二题',20]]);
 assert.equal(data.summary.expected,4);assert.equal(data.summary.participated,2);assert.equal(data.summary.average_score,20);assert.equal(data.summary.contest_max_score,50);
 assert.deepEqual(data.scores.map(r=>[r.student_id,r.rank,r.total_score]),[['001',2,40],['002',3,0]]);
 assert.equal(data.identities['002'],'12');assert.equal(data.problemResults['001'].B.score,10);assert.equal(data.problems[0].accept_rate,.25);
 const a=data.outcomes.problems[0];assert.deepEqual(a.full.map(r=>r.student_id),['001']);assert.equal(a.full[0].attempts,2);assert.deepEqual(a.zero.map(r=>r.student_id),['002']);assert.deepEqual(a.missing.map(r=>r.student_id),['003','004']);
 const b=data.outcomes.problems[1];assert.equal(b.partial[0].score_ratio,.5);assert.equal(data.problems[1].average_score,10);
 assert.deepEqual(data.unsubmitted.map(r=>r.student_id),['003','004']);assert.throws(()=>createTeachingContest(contest,rank,members,'123',core),/不属于当前课程/);
});

test('each problem axis fits its own accepted count with distinct integer ticks',()=>{
  for(const peak of [0,1,2,14,45,137,647]){
    const scale=acceptanceAxis(peak);
    assert.ok(scale.max>=peak&&scale.max>0);
    assert.equal(scale.ticks[0],0);
    assert.equal(scale.ticks.at(-1),scale.max);
    assert.ok(scale.ticks.every(Number.isInteger));
    assert.equal(new Set(scale.ticks).size,scale.ticks.length);
    assert.ok(scale.ticks.length<=6);
  }
  assert.deepEqual(acceptanceAxis(1),{max:1,ticks:[0,1]});
  assert.deepEqual(acceptanceAxis(2),{max:2,ticks:[0,1,2]});
  assert.ok(acceptanceAxis(14).max<acceptanceAxis(137).max);
});
