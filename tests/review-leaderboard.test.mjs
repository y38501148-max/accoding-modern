import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReviewCore} from '../src/ai-review-core.mjs';
import {reviewLeaderboardContests,reviewLeaderboardQuery,loadReviewLeaderboard} from '../src/review-leaderboard.mjs';
const core=createAiReviewCore(),members=Array.from({length:23},(_,i)=>({userId:String(i+1),studentId:String(i+1).padStart(8,'0'),name:'同学'+(i+1),group:'2601',status:'matched'}));
const context={summary:{rows:[...members,{name:'未匹配',status:'missing'}]},reviewContests:[{id:2,title:'C2'},{id:3,title:'E1'},{id:1,title:'C1'}]};
const query=reviewLeaderboardQuery(core,context);
const packet=()=>({rows:members.slice(0,10).map(m=>({...m,aiTotal:1,hitTotal:2,history:[{contestId:'1',ai:1,hits:2},{contestId:'2',ai:null,hits:null}]})),total:23,aiTotal:23,offset:0,limit:10,unmatched:1,revision:'a'.repeat(64),contests:[{id:'1',label:'C1'},{id:'2',label:'C2'}],packets:[{contestId:'1',runId:'r'},{contestId:'2',runId:null}]});

test('query sends scoped roster and C contests with ten-person server pagination',()=>{
  assert.deepEqual(reviewLeaderboardContests(context).map(c=>c.id),['1','2']);
  const request=reviewLeaderboardQuery(core,context,2,'b'.repeat(64));
  assert.equal(request.offset,20);assert.equal(request.limit,10);assert.equal(request.members.length,23);assert.equal(request.unmatched,1);
  assert.equal(request.members[0].studentId,'00000001');assert.equal(request.revision,'b'.repeat(64));
});
test('loading uses one server request and never downloads or aggregates review records',async()=>{
  let calls=0;const expected=packet();
  const client={leaderboard:async q=>{calls++;assert.deepEqual(q,query);return expected;},search:()=>assert.fail('must not read individual records'),progress:()=>assert.fail('must not resolve runs in browser')};
  assert.equal(await loadReviewLeaderboard(client,core,context),expected);assert.equal(calls,1);
});
test('class label uses administrative membership, then known teaching membership without guessing',()=>{
  const request=reviewLeaderboardQuery(core,{reviewContests:[],summary:{rows:[{...members[0],group:'2601班',teachingGroup:'甲老师班'},{...members[1],group:'',teachingGroup:'乙老师班'},{...members[2],group:''}]}});
  assert.deepEqual(request.members.map(m=>m.group),['2601班','乙老师班','']);
});
test('v4 paged summary preserves server order and omits writer credentials',async()=>{
  const server=packet();let request;
  const client=core.featureClient(()=>'writer',async(url,options)=>{request={url,options};return new Response(JSON.stringify(server));},4);
  const result=await client.leaderboard(query);
  assert.deepEqual(result,server);assert(request.url.endsWith('/leaderboard'));assert.equal(request.options.headers.Authorization,undefined);
  assert.equal(JSON.parse(request.options.body).limit,10);
});
test('wrong scope, partial page, invalid counts and missing summaries are refused',async()=>{
  for(const change of [p=>p.rows[0].userId='9999',p=>p.rows[0].studentId='bad',p=>p.rows[0].aiTotal=-1,p=>p.rows.pop(),p=>p.contests.reverse(),p=>p.packets[0].contestId='9']){
    const value=packet();change(value);const client=core.featureClient(()=>'',async()=>new Response(JSON.stringify(value)),4);
    await assert.rejects(client.leaderboard(query));
  }
});
test('export downloads the server workbook, and HTML or service errors do not become XLSX',async()=>{
  let request;const bytes=new Uint8Array([80,75,3,4,0,0]);
  const client=core.featureClient(()=>'writer',async(url,options)=>{request={url,options};return new Response(bytes);},4);
  assert.deepEqual(new Uint8Array(await(await client.exportLeaderboard({...query,revision:'a'.repeat(64)})).arrayBuffer()),bytes);
  assert(request.url.endsWith('/leaderboard/export'));assert.equal(request.options.headers.Authorization,undefined);
  for(const response of [new Response('<html>offline</html>'),new Response(JSON.stringify({detail:'榜单已更新'}),{status:409})]){
    const broken=core.featureClient(()=>'',async()=>response,4);await assert.rejects(broken.exportLeaderboard(query));
  }
});
