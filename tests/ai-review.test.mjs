import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReviewCore} from '../src/ai-review-core.mjs';
const core=createAiReviewCore();
const positive={submission_id:'1',contest_id:1299,creator_id:'11',ai_suspected:true,score:.9,threshold:.8,model_digest:'a'.repeat(64)};
test('visibility requires an explicit positive model decision, not old priorities',()=>{
  assert.equal(core.hasFlaggedReview(positive),true);
  for(const change of [{ai_suspected:false},{ai_suspected:'true'},{score:.7},{score:NaN},{model_digest:null},{threshold:undefined}])assert.equal(core.hasFlaggedReview({...positive,...change}),false);
  assert.equal(core.hasFlaggedReview({state:'completed',inference_performed:true,review_priority:'priority'}),false);
});
test('only uniquely matched member IDs are submitted to the class query',()=>{
  assert.deepEqual([...core.members([{status:'matched',userId:11},{status:'ambiguous',userId:22},{status:'matched',userId:'bad'}]).keys()],['11']);
});
test('class results are paginated directly without fetching submission metadata',async()=>{
  const calls=[];const c=core.client(()=>'t'.repeat(48),async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({total:31,reviews:[positive]})};});
  const q={contest_id:1299,creator_ids:['11'],offset:30,limit:30};assert.equal((await c.search(q)).total,31);
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/v2/reviews/search'));assert.deepEqual(JSON.parse(calls[0].options.body),q);assert.equal(calls[0].options.credentials,'omit');
});
test('wrong-class and nonpositive responses are errors, not silent empty results',async()=>{
  for(const r of [{...positive,creator_id:'22'},{...positive,contest_id:1304},{...positive,ai_suspected:false}]){
    const c=core.client(()=>'token',async()=>({ok:true,json:async()=>({total:1,reviews:[r]})}));
    await assert.rejects(()=>c.search({contest_id:1299,creator_ids:['11'],limit:30}),/当前班级/);
  }
});
test('a removed or absent detail is represented as absent, while auth errors remain errors',async()=>{
  const c=core.client(()=>'token',async()=>({ok:false,status:404}));assert.equal(await c.detail('1'),null);
  const denied=core.client(()=>'token',async()=>({ok:false,status:403}));await assert.rejects(()=>denied.detail('1'),/只读令牌/);
});
