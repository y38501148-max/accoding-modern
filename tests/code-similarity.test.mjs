import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createAiReviewCore} from '../src/ai-review-core.mjs';

const source={submission_id:'100',creator_id:'101',contest_id:1326,problem_id:7,code_hash:'a'.repeat(64),submitted_at:'2026-10-19T00:00:00Z'};
const reference={...source,submission_id:'200',creator_id:'102',code_hash:'b'.repeat(64)};
const record={...source,run_id:'local-peers',version:'same-contest-peer-tokens-v1',status:'matched',token_count:100,peer_count:1,matches:[{reference,similarity:.95,matched_tokens:95,snippets:[]}]};
const query={run_id:'local-peers',contest_id:1326,creator_ids:['101','102'],offset:0,limit:30};
const packet={run_id:'local-peers',contest_id:1326,version:'same-contest-peer-tokens-v1',records:[record],total:1};
function client(body,status=200){const calls=[];const api=createAiReviewCore().featureClient(()=>{throw Error('anonymous read must not inspect writer identity');},async(url,options)=>{calls.push({url,options});assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);return {ok:status===200,status,json:async()=>body};},4);return {api,calls};}
test('similarity is an independent anonymous branch, even when the record has no AI verdict',async()=>{
 const {api,calls}=client(packet);const result=await api.similaritySearch(query);assert.equal(result.records[0].matches[0].reference.creator_id,'102');assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/code-similarity/search'));
});
for(const [name,change]of [
 ['self comparison',r=>r.matches[0].reference.creator_id='101'],['other problem',r=>r.matches[0].reference.problem_id=8],['other contest',r=>r.matches[0].reference.contest_id=1327],
 ['wrong hash',r=>r.matches[0].reference.code_hash='bad'],['below 95 percent',r=>r.matches[0].similarity=.949999],['nonfinite score',r=>r.matches[0].similarity=Infinity],['invalid quote',r=>r.matches[0].snippets=[{current:{start_line:1,end_line:2,quote:'one'},reference:{start_line:1,end_line:1,quote:'x'}}]]
])test('malformed peer evidence is rejected: '+name,async()=>{const changed=structuredClone(packet);change(changed.records[0]);await assert.rejects(client(changed).api.similaritySearch(query));});
test('class, run and current submission bindings cannot be replaced',async()=>{
 await assert.rejects(client({...packet,run_id:'other'}).api.similaritySearch(query),/运行/);
 const changed=structuredClone(packet);changed.records[0].creator_id='999';await assert.rejects(client(changed).api.similaritySearch(query),/班级/);
 await assert.rejects(client({...record,submission_id:'101'}).api.similarityDetail('100','local-peers',1326),/提交/);
});
test('class anchor may match a peer outside the selected class',async()=>{
 const one={...query,creator_ids:['101']};
 assert.equal((await client(packet).api.similaritySearch(one)).records[0].matches[0].reference.creator_id,'102');
});
test('peer source verifies the different author against the same frozen run',async()=>{
 const {api,calls}=client(reference);await api.peerSource(reference,record);assert.ok(calls[0].url.includes('/runs/local-peers/sources/200'));
 await assert.rejects(client({...reference,creator_id:'999'}).api.peerSource(reference,record),/身份/);
 await assert.rejects(api.peerSource({...reference,creator_id:'101'},record),/不同学生/);
});
test('the existing same-author historical reader remains strict',async()=>{const {api}=client(reference);await assert.rejects(api.referenceSource({...reference,run_id:'local-peers'},record),/作者/);});
test('old servers and incomplete runs remain errors, never empty clean reports',async()=>{
 for(const status of [404,409,500])await assert.rejects(client({detail:'尚无完整代码查重结果'},status).api.similaritySearch(query),e=>e.httpStatus===status);
});
test('pair list requires merged counts and a single comparison per card',async()=>{
 const q={...query,pair_view:true};
 const merged={...packet,pair_view:true,pair_count:1,source_count:2,status_count:0};
 assert.equal((await client(merged).api.similaritySearch(q)).source_count,2);
 await assert.rejects(client(packet).api.similaritySearch(q),/按代码对/);
 await assert.rejects(client({...merged,pair_count:2}).api.similaritySearch(q),/按代码对/);
});
const pair={run_id:'local-peers',submission_id:'100',code_hash:source.code_hash,reference_id:'200',reference_hash:reference.code_hash};
const note={...pair,id:1,status:'suspected',reason:'两人的错误分支完全相同。',reviewer_id:'ta',reviewer_name:'助教甲',created:1};
test('pair history is anonymous and checks both source identities in either order',async()=>{
 const reversed={...note,submission_id:'200',reference_id:'100',code_hash:reference.code_hash,reference_hash:source.code_hash};
 assert.equal((await client({latest:reversed,history:[reversed]}).api.similarityFeedback(pair)).latest.id,1);
 for(const change of [{run_id:'other'},{reference_id:'201'},{reference_hash:'c'.repeat(64)},{status:'ai'}])await assert.rejects(client({latest:{...note,...change},history:[]}).api.similarityFeedback(pair));
});
test('saving pair feedback uses the write session and its own endpoint',async()=>{
 const api=createAiReviewCore().featureClient(()=>'',async(url,options)=>{
  assert.ok(url.endsWith('/code-similarity/feedback'));assert.equal(options.headers.Authorization,'Bearer reviewer-token');
  const data=JSON.parse(options.body);assert.equal(data.reference_id,'200');assert.equal(data.status,'suspected');
  return {ok:true,json:async()=>({saved:true,feedback:note})};
 },4);
 assert.equal((await api.saveSimilarityFeedback({...pair,status:'suspected',reason:note.reason},undefined,'reviewer-token')).feedback.id,1);
 await assert.rejects(api.saveSimilarityFeedback({...pair,status:'unknown',reason:' '},undefined,'reviewer-token'),/选择结论/);
});

test('similarity problem scope starts at E inclusive',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../src/code-similarity.js',import.meta.url),'utf8'),context);
 for(const label of ['A','B','C','D',''])assert.equal(context.codeSimilarityProblemAllowed({label}),false);
 for(const label of ['E','F','Z','AA'])assert.equal(context.codeSimilarityProblemAllowed({label}),true);
});

test('empty pair reason remains a valid signed manual annotation',async()=>{
 const api=createAiReviewCore().featureClient(()=>'',async(url,options)=>({ok:true,json:async()=>({saved:true,feedback:{...note,reason:''}})}),4);
 assert.equal((await api.saveSimilarityFeedback({...pair,status:'suspected',reason:''},undefined,'writer')).feedback.reason,'');
});
