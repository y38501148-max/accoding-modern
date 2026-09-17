import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReviewCore} from '../src/ai-review-core.mjs';
const core=createAiReviewCore();
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
