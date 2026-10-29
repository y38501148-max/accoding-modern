import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAiReviewCore} from '../src/ai-review-core.mjs';

const core=createAiReviewCore(),code='int main(){return 0;}',hash=createHash('sha256').update(code).digest('hex');
const run={run_id:'one',contest_id:1299,created_at:1,publication_ready:true,configuration_sha256:'a'.repeat(64)};
const record={...run,submission_id:'10',creator_id:'12',problem_id:100,code_hash:hash,code,decision_kind:'unflagged',review_status:'rule_unmatched',annotation:null,feedback:{latest:null,history:[]}};
const response=(body,status=200)=>({ok:status===200,status,json:async()=>structuredClone(body)});
function client(handler){const calls=[];const api=core.featureClient(()=>{throw Error('read credentials');},async(url,options)=>{calls.push(url);return handler(url,options);},4);return {api,calls};}

test('standalone opens selected complete review with feedback in one read',async()=>{
  const {api,calls}=client(()=>response({runs:[run],review:record}));
  assert.equal((await api.openReview('10','')).record.submission_id,'10');
  assert.equal(calls.length,1);assert.match(calls[0],/include_review=true/);
});
test('list resolves its selected run and reviews in one fresh request',async()=>{
  const query={contest_id:1299,creator_ids:['12'],limit:30};
  const {api,calls}=client((url,options)=>{assert.equal(JSON.parse(options.body).resolve_run,true);return response({runs:[run],run_id:'one',reviews:[record],total:1});});
  assert.equal((await api.openList(query,'latest')).reviews.length,1);assert.equal(calls.length,1);
  const wrong=client(()=>response({runs:[run],run_id:'other',reviews:[],total:0}));await assert.rejects(wrong.api.openList(query,'latest'),/运行无效/);
});
test('known run opens fresh detail and history in one read on every visit',async()=>{
  const {api,calls}=client(()=>response(record));
  await api.openReview('10','one');await api.openReview('10','one');
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.includes('include_feedback=true')));
});
test('pending and mismatched merged records cannot replace selected complete run',async()=>{
  for(const review of [null,{...record,run_id:'pending'},{...record,submission_id:'11'}]){
    const {api}=client(()=>response({runs:[run,{...run,run_id:'pending',created_at:2,publication_ready:false}],review}));
    await assert.rejects(api.openReview('10',''));
  }
});
test('a server without bundled reads falls back to the existing protocol',async()=>{
  const {api,calls}=client(url=>response(url.includes('/runs?')?{runs:[run]}:record));
  assert.equal((await api.openReview('10','')).record.run_id,'one');assert.equal(calls.length,2);
});
test('bundled reference identities eliminate discovery while rechecking hash and author',async()=>{
  const source={submission_id:'9',creator_id:'12',contest_id:1299,problem_id:100,code_hash:hash,run_id:'one'};
  const {api,calls}=client(()=>response({...record,reference_sources:[source]}));
  const {record:r}=await api.openReview('10','one');
  assert.deepEqual(await api.referenceSource({submission_id:'9',code_hash:hash},r),source);
  assert.equal(calls.length,1);
  await assert.rejects(api.referenceSource({submission_id:'9',code_hash:hash,creator_id:'99'},r),/不一致/);
});
test('feedback bundled for another source or revision is rejected',async()=>{
  const note={id:1,status:'uncertain',reason:'待复核',submission_id:'10',code_hash:hash};
  for(const patch of [{feedback:{latest:note,history:[note]}},{annotation:note,review_status:'reviewed_uncertain',feedback:{latest:{...note,code_hash:'b'.repeat(64)},history:[]}}]){
    const {api}=client(()=>response({...record,...patch}));await assert.rejects(api.openReview('10','one'),/不一致/);
  }
});
