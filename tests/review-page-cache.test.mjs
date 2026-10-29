import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewPageCache,createAiReviewCore} from '../src/ai-review-core.mjs';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
test('prefetch and page switch share a read; cancelling one viewer does not cancel the cache',async()=>{
  const cache=createReviewPageCache(),pending=deferred(),viewer=new AbortController();let calls=0;
  const load=async signal=>{calls++;await pending.promise;assert.equal(signal.aborted,false);return {rows:['next']};};
  const first=cache.read('class:run:filter:30',load,viewer.signal);const cancelled=assert.rejects(first,{name:'AbortError'});
  await Promise.resolve();viewer.abort();const next=cache.read('class:run:filter:30',load);pending.resolve();await cancelled;
  assert.deepEqual(await next,{rows:['next']});assert.equal(calls,1);
  const shown=await cache.read('class:run:filter:30',load);shown.rows.length=0;
  assert.deepEqual(await cache.read('class:run:filter:30',load),{rows:['next']});assert.equal(calls,1);
});
test('refresh/save invalidation discards old prefetch and cannot overwrite the new page',async()=>{
  const cache=createReviewPageCache(),pending=deferred();
  const old=cache.read('page',async()=>{await pending.promise;return 'old';});const rejected=assert.rejects(old,{name:'AbortError'});
  await Promise.resolve();cache.clear();assert.equal(await cache.read('page',async()=>'new'),'new');pending.resolve();await rejected;
  assert.equal(await cache.read('page',async()=>'wrong'),'new');
});
test('expiry, class/filter isolation and page capacity are bounded',async()=>{
  let time=0,calls=0;const cache=createReviewPageCache({ttl:10,limit:2,now:()=>time}),load=async()=>++calls;
  assert.equal(await cache.read('class-a:run-1:queue:0',load),1);
  assert.equal(await cache.read('class-b:run-1:queue:0',load),2);
  assert.equal(await cache.read('class-a:run-1:all:0',load),3);
  assert.equal(await cache.read('class-a:run-1:queue:0',load),4);
  time=11;assert.equal(await cache.read('class-a:run-1:queue:0',load),5);
});
test('failed prefetch can retry and is never cached as an empty list',async()=>{
  const cache=createReviewPageCache();await assert.rejects(cache.read('next',async()=>{throw Error('offline');}),/offline/);
  assert.deepEqual(await cache.read('next',async()=>({rows:[1]})),{rows:[1]});
});
test('blank human reasons roundtrip, export and save while machine explanations stay required',async()=>{
  const core=createAiReviewCore(),note={id:1,status:'uncertain',reason:'',submission_id:'1',code_hash:'a'.repeat(64)};
  assert.equal(core.feedbackPacket({latest:note,history:[note]}).latest.reason,'');
  assert.equal(core.exportTables([{submission_id:'1',review_status:'reviewed_uncertain',annotation:note}],[]).current_review[0].annotation.reason,'');
  const api=core.featureClient(()=>'writer',async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.reason,'');assert.equal(options.headers.Authorization,'Bearer writer');return {ok:true,json:async()=>({saved:true})};},4);
  await api.saveFeedback({status:'ordinary'});await api.saveFeedback({status:'suspected',reason:''});
  assert.equal(core.hasFeatureReview({decision_kind:'human_review',configuration_sha256:'b'.repeat(64),code_hash:note.code_hash,run_id:'one',result:null,human_status:'uncertain',annotation:note}),true);
});
