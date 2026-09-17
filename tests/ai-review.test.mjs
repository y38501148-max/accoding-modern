import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReviewCore} from '../src/ai-review-core.mjs';
const core=createAiReviewCore();
test('only completed inference explicitly flagged by the model is visible',()=>{
  const base={state:'completed',inference_performed:true,review_priority:'review'};
  assert.equal(core.hasFlaggedReview(base),true);
  assert.equal(core.hasFlaggedReview({...base,review_priority:'priority'}),true);
  for(const review_priority of ['normal','insufficient_context',null,undefined])assert.equal(core.hasFlaggedReview({...base,review_priority}),false);
  for(const state of Object.keys(core.states).filter(s=>s!=='completed'))assert.equal(core.hasFlaggedReview({...base,state}),false);
  assert.equal(core.hasFlaggedReview({...base,inference_performed:false}),false);
  assert.equal(core.hasFlaggedReview({state:'completed',review_priority:'review'}),false);
  assert.equal(core.hasFlaggedReview({...base,batch:{selection:'rules_only'}}),true);
  assert.equal(core.hasFlaggedReview({state:'completed',model_result:{inference_performed:true,result:{review_priority:'priority'}}}),true);
  assert.equal(core.hasFlaggedReview({state:'completed',model_result:{inference_performed:true,result:{review_priority:'normal',signals:[{kind:'dialogue_comment'}]}}}),false);
});
test('only uniquely matched members contribute submissions',()=>{
  const members=[{status:'matched',userId:'11',name:'A'},{status:'ambiguous',userId:'22',name:'B'},{status:'missing',name:'C'}];
  const records=[{id:1,creator_id:11},{id:2,creator_id:22},{id:3,creator_id:33},{id:'bad',creator_id:11}];
  assert.deepEqual(core.classSubmissions(records,members).map(s=>s.id),['1']);
  assert.deepEqual(core.batches(Array.from({length:501},(_,i)=>i+1)).map(b=>b.length),[250,250,1]);
});
test('read client omits cookies, never queues, and refresh bypasses completed cache',async()=>{
  const calls=[];
  const c=core.client(()=> 't'.repeat(48),async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({reviews:JSON.parse(options.body).submission_ids.map(id=>({submission_id:id,state:'completed'}))})};});
  await c.query(['1']);await c.query(['1']);assert.equal(calls.length,1);
  await c.query(['1'],undefined,true);assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.url.endsWith('/reviews/query')&&c.options.credentials==='omit'));
});
test('missing response IDs are errors, not clean reviews',async()=>{
  const c=core.client(()=>'token',async()=>({ok:true,json:async()=>({reviews:[]})}));
  await assert.rejects(()=>c.query(['1']),/缺少/);
});
test('batch coverage distinguishes sampled, rules-only, pending and skipped inference within class',()=>{
  const reviews=[
    {data_exists:true,state:'completed',batch:{batch_id:'b',batch_name:'C1',selection:'candidate',state:'completed'}},
    {data_exists:true,state:'waiting_model',batch:{batch_id:'b',batch_name:'C1',selection:'sample',state:'waiting_model'}},
    {data_exists:true,state:'context_limited',batch:{batch_id:'b',batch_name:'C1',selection:'sample',state:'context_limited'}},
    {data_exists:true,state:'completed',batch:{batch_id:'b',batch_name:'C1',selection:'rules_only',state:'rules_only'}},
    {data_exists:false,state:'not_collected'}
  ];
  assert.deepEqual(core.coverage(reviews),{total:5,rules:4,candidate:1,sample:2,rules_only:1,unbatched:1,model:{completed:1,waiting_model:1,context_limited:1},batches:[{id:'b',name:'C1'}]});
  assert.equal(core.coverage([reviews[0]]).total,1);
  assert.equal(core.viewState(reviews[3]),'rules_only');
});
