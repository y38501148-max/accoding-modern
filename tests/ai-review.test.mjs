import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReviewCore} from '../src/ai-review-core.mjs';
import {webcrypto,createHash} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
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
const code='int main(){return 0;}';
const featurePositive={submission_id:'1',contest_id:1299,creator_id:'11',run_id:'run-one',decision_kind:'llm_feature_presence',configuration_sha256:'b'.repeat(64),model_digest:'a'.repeat(64),code_hash:createHash('sha256').update(code).digest('hex'),code,result:{ai_suspected:true,label:['讲解性注释'],reason:'current:1 讲解性注释。'}};
test('feature results require exact three fields and known unique labels without a score',()=>{
  assert.equal(core.hasFeatureReview(featurePositive),true);
  for(const change of [{ai_suspected:false},{ai_suspected:'true'},{label:[]},{label:['旧标签']},{label:['讲解性注释','讲解性注释']},{reason:''},{confidence:.9}])assert.equal(core.hasFeatureReview({...featurePositive,result:{...featurePositive.result,...change}}),false);
  assert.equal(core.hasFeatureReview(positive),false);
});
test('feature queries bind every returned item to the selected run and class',async()=>{
  const q={run_id:'run-one',contest_id:1299,creator_ids:['11'],limit:30};
  const request=reply=>core.featureClient(()=>'token',async(url,options)=>({ok:true,json:async()=>reply}));
  assert.equal((await request({run_id:q.run_id,total:1,reviews:[featurePositive]}).search(q)).total,1);
  for(const change of [{run_id:'run-two'},{contest_id:1304},{creator_id:'22'}])await assert.rejects(()=>request({run_id:q.run_id,total:1,reviews:[{...featurePositive,...change}]}).search(q),/当前运行或班级/);
  await assert.rejects(()=>request({run_id:'run-two',total:0,reviews:[]}).search(q),/运行无效/);
  await assert.rejects(()=>request({}).search({...q,run_id:undefined}),/选择核查运行/);
});
test('details and on-demand context require matching exact source hashes',async()=>{
  assert.equal(await core.verifySource(code,featurePositive.code_hash),code);
  await assert.rejects(()=>core.verifySource(code+'\n',featurePositive.code_hash),/哈希/);
  const request=value=>core.featureClient(()=>'token',async()=>({ok:true,json:async()=>value}));
  assert.deepEqual(await request(featurePositive).detail('1','run-one'),featurePositive);
  await assert.rejects(()=>request({...featurePositive,code:'changed'}).detail('1','run-one'),/哈希/);
  await assert.rejects(()=>request(featurePositive).detail('2','run-one'),/提交不一致/);
  await assert.rejects(()=>request(featurePositive).detail('1','run-two'),/运行或提交不一致/);
});
test('OJ metadata wrapper is removed only for the matching submission and frozen source hash',async()=>{
  const header='/* \n Author: fixture\n Result: AC Submission_id: 99\n Created at: fixture\n*/\n\n';
  assert.equal(await core.sourceFromOj(header+code,'99',featurePositive.code_hash),code);
  await assert.rejects(()=>core.sourceFromOj(header+code,'100',featurePositive.code_hash),/提交编号/);
  await assert.rejects(()=>core.sourceFromOj(header+code+'changed','99',featurePositive.code_hash),/哈希/);
});

test('v4 reads omit writer credentials and account/proof work',async()=>{
  const calls=[];
  const client=core.featureClient(()=>'session',async(url,options)=>{
    calls.push({url,options});
    const reply=new URL(url).pathname.endsWith('/progress')||new URL(url).pathname.endsWith('/runs')?{runs:[{run_id:'run-one',contest_id:1299,configuration_sha256:'b'.repeat(64)}]}:
      url.endsWith('/search')?{run_id:'run-one',total:1,reviews:[{...featurePositive,review_status:'rule_hit_unreviewed'}]}:{...featurePositive,review_status:'rule_hit_unreviewed'};
    return {ok:true,json:async()=>reply};
  },4);
  await client.progress(1299);await client.submissionRuns('1');
  await client.search({run_id:'run-one',contest_id:1299,creator_ids:['11'],limit:30,review_queue_only:true});
  await client.detail('1','run-one');
  assert.equal(calls.length,4);
  for(const {url,options} of calls){assert.match(url,/\/oj-review-api\/v4\//);assert.equal(options.headers.Authorization,undefined);assert.equal(options.credentials,'omit');}
  const searchBody=JSON.parse(calls.find(x=>x.url.endsWith('/search')).options.body);
  assert.equal(searchBody.include_all,true);
  assert.equal(searchBody.review_queue_only,true);
});
test('review record validation accepts signed rules misses and rejects invented states',()=>{
  const miss={submission_id:'2',creator_id:'11',contest_id:1299,run_id:'run-one',decision_kind:'unflagged',configuration_sha256:'a'.repeat(64),code_hash:'b'.repeat(64),review_status:'rule_unmatched'};
  assert.equal(core.hasReviewRecord(miss),true);
  assert.equal(core.hasReviewRecord({...miss,review_status:'rule_hit_unreviewed'}),false);
  assert.equal(core.hasReviewRecord({...miss,review_status:'invented'}),false);
  assert.equal(core.hasReviewRecord({...miss,decision_kind:'rule_feature_unretained',review_status:'rule_hit_unreviewed'}),true);
  assert.equal(core.reviewStates.reviewed_no_ai,'已核查为无AI');
});

test('rule suspects share the review list without fabricated model receipts',()=>{
  const suspect={decision_kind:'rule_feature_candidate',rule_version:'rules-v7',call_id:null,
    configuration_sha256:'a'.repeat(64),code_hash:'b'.repeat(64),run_id:'e1',
    result:{ai_suspected:true,label:['代码结构大幅变化'],reason:'current:2-8 两次提交的结构发生明显变化。'}};
  assert.equal(core.hasFeatureReview(suspect),true);
  assert.equal(core.hasFeatureReview({...suspect,call_id:'fake-model'}),false);
  assert.equal(core.hasFeatureReview({...suspect,rule_version:''}),false);
  assert.equal(core.hasFeatureReview({...suspect,result:{...suspect.result,ai_suspected:false}}),false);
});

test('git-style line diff preserves both files and identifies unchanged lines',()=>{
  const before='int main() {\n  int a=1;\n  printf("%d",a);\n}',after='int main() {\n  int value=2;\n  printf("%d",value);\n}';
  const diff=core.lineDiff(before,after);
  assert.equal(diff.filter(r=>r.kind!=='add').map(r=>r.text).join('\n'),before);
  assert.equal(diff.filter(r=>r.kind!=='remove').map(r=>r.text).join('\n'),after);
  assert.deepEqual(diff.filter(r=>r.kind==='equal').map(r=>r.text),['int main() {','}']);
  assert.ok(diff.some(r=>r.kind==='remove')&&diff.some(r=>r.kind==='add'));
  for(const [a,b] of [['','x'],['a\na','a'],['x\ny','z\nx\ny\nz'],['a\nb\nc','a\nc\nb']]){
    const rows=core.lineDiff(a,b);
    assert.equal(rows.filter(r=>r.kind!=='add').map(r=>r.text).join('\n'),a);
    assert.equal(rows.filter(r=>r.kind!=='remove').map(r=>r.text).join('\n'),b);
  }
});

test('every v4 read omits bearer credentials even after authenticated writes',async()=>{
  const calls=[],client=core.featureClient(()=>{throw Error('read must not inspect credentials');},async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url.includes('/feedback/')?{latest:null,history:[]}:{} };},4);
  await client.session();await client.source('1','run-one');await client.feedback('1','a'.repeat(64),'run-one');await client.exportEvidence('run-one');await client.exportFeedback(1299);
  assert.equal(calls.length,5);
  for(const {url,opts} of calls){assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.credentials,'omit');assert.doesNotMatch(url,/\/access\//);}
});

test('TA credentials authenticate feedback without changing the original rule schema',async()=>{
  const calls=[],client=core.featureClient(()=> 'ta-secret',async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({saved:true})};},4);
  await client.saveFeedback({submission_id:'1',status:'ordinary',reason:'已核对'});
  assert.equal(calls[0].opts.headers.Authorization,'Bearer ta-secret');
  assert.equal(JSON.parse(calls[0].opts.body).reason,'已核对');
  assert.ok(calls[0].url.endsWith('/feedback'));
});

test('review cursor continues after all 30 current-page records leave the queue',()=>{
  const rows=Array.from({length:65},(_,i)=>({submission_id:String(i+1)})),cursor=core.reviewCursor(rows.slice(0,30),0,65);
  for(let i=1;i<=30;i++){
    cursor.setVisible(String(i),false);
    assert.equal(cursor.has(String(i),1),true);
    assert.equal(cursor.neighbor(String(i),1),i<30?String(i+1):null);
  }
  const request=cursor.request(1);assert.deepEqual(request,{offset:0,limit:30});
  cursor.extend({reviews:rows.slice(30,60),total:35},request,1);
  assert.equal(cursor.neighbor('30',1),'31');assert.equal(cursor.has('31',-1),false);
  assert.deepEqual(cursor.request(1),{offset:30,limit:30});
});
test('review cursor preserves preceding records and fetches next page without skipping after mixed verdicts',()=>{
  const rows=Array.from({length:65},(_,i)=>({submission_id:String(i+1)})),cursor=core.reviewCursor(rows.slice(30,60),30,65);
  cursor.setVisible('60',false);cursor.setVisible('60',false);
  assert.equal(cursor.neighbor('60',-1),'59');assert.deepEqual(cursor.request(1),{offset:59,limit:30});
  cursor.extend({reviews:rows.slice(60),total:64},cursor.request(1),1);
  assert.equal(cursor.neighbor('60',1),'61');assert.equal(cursor.neighbor('61',-1),'59');assert.equal(cursor.has('65',1),false);
  const prior=cursor.request(-1);assert.deepEqual(prior,{offset:0,limit:30});cursor.extend({reviews:rows.slice(0,30),total:64},prior,-1);
  assert.equal(cursor.neighbor('31',-1),'30');assert.equal(cursor.has('1',-1),false);
  cursor.setVisible('60',true);assert.equal(cursor.neighbor('61',-1),'60');
});
test('review cursor handles a sole removed record and filtered AI verdicts',()=>{
  const cursor=core.reviewCursor([{submission_id:'1'}],0,1);cursor.setVisible('1',false);
  assert.equal(cursor.has('1',1),false);assert.equal(cursor.has('1',-1),false);
  cursor.setVisible('1',true);assert.equal(cursor.has('1',1),false);
});

test('quick-pass candidates work in v4 search and details without weakening scope or hash validation',async()=>{
  const record={...featurePositive,decision_kind:'rule_feature_candidate',rule_version:'api-candidates-v14-quick-pass-20260929',call_id:null,review_status:'rule_hit_unreviewed',
    result:{ai_suspected:true,label:['快速过题'],reason:'快速过题：F 题距上一道 H 题首次通过 180 秒，阈值 ≤ 5 分钟。'}};
  const query={run_id:record.run_id,contest_id:record.contest_id,creator_ids:[record.creator_id],limit:30};
  const client=value=>core.featureClient(()=>'',async url=>({ok:true,json:async()=>url.endsWith('/search')?{run_id:query.run_id,total:1,reviews:[value]}:value}),4);
  assert.equal(core.hasReviewRecord(record),true);
  assert.equal((await client(record).search(query)).reviews[0].result.label[0],'快速过题');
  assert.deepEqual(await client(record).detail(record.submission_id,record.run_id),record);
  for(const change of [{creator_id:'22'},{contest_id:1310},{run_id:'other-run'}]){
    await assert.rejects(()=>client({...record,...change}).search(query),/当前运行或班级不一致/);
  }
  await assert.rejects(()=>client({...record,code:'changed'}).detail(record.submission_id,record.run_id),/哈希/);
  const unknown={...record,result:{...record.result,label:['未来未知规则']}};
  assert.equal(core.hasReviewRecord(unknown),false);
  await assert.rejects(()=>client(unknown).search(query),/不支持的规则或格式.*更新插件/);
  await assert.rejects(()=>client(unknown).detail(record.submission_id,record.run_id),/不支持的规则或格式.*更新插件/);
});

test('manual uncertain records keep the machine result absent and reject invented or inconsistent states',()=>{
  const annotation={id:2,status:'uncertain',reason:'需要复查原始来源'},record={...featurePositive,decision_kind:'human_review',result:null,annotation,human_status:'uncertain',review_status:'reviewed_uncertain'};
  assert.equal(core.hasReviewRecord(record),true);
  assert.equal(core.hasReviewRecord({...record,result:{ai_suspected:false,label:[],reason:annotation.reason}}),false);
  assert.equal(core.hasReviewRecord({...record,human_status:'ordinary'}),false);
  assert.equal(core.hasReviewRecord({...record,review_status:'reviewed_no_ai'}),false);
  assert.equal(core.hasReviewRecord({...record,annotation:{...annotation,status:'unknown'}}),false);
  assert.deepEqual(Object.keys(core.humanLabels),['ordinary','uncertain','suspected']);
  assert.throws(()=>core.humanState('unknown'),/格式无效/);
});

test('uncertain remains in queue, explicit no-AI and all filters remain reachable',()=>{
  for(const state of ['rule_hit_unreviewed','reviewed_uncertain','reviewed_ai'])assert.equal(core.inReviewFilter({review_status:state}),true);
  assert.equal(core.inReviewFilter({review_status:'reviewed_no_ai'}),false);
  assert.equal(core.inReviewFilter({review_status:'reviewed_no_ai'},'all'),true);
  assert.equal(core.inReviewFilter({review_status:'reviewed_uncertain'},'reviewed_ai'),false);
  assert.equal(core.inReviewFilter({review_status:'reviewed_no_ai'},'reviewed_no_ai'),true);
  assert.throws(()=>core.inReviewFilter({review_status:'unknown'}),/格式无效/);
});

test('new labels remove naming selectors but retain readable legacy runs',()=>{
  assert.equal(core.featureLabels.includes('函数与变量命名'),false);
  assert.equal(core.featureLabels.includes('长变量命名'),false);
  for(const label of ['CE 使用非 C 语言语法','AC 后重复提交码风变化','快速过题'])assert.equal(core.hasFeatureReview({...featurePositive,result:{...featurePositive.result,label:[label]}}),true);
  assert.equal(core.hasFeatureReview({...featurePositive,result:{...featurePositive.result,label:['函数与变量命名']}}),true);
});

test('all v4 requests declare state protocol and source-scoped feedback preserves three states',async()=>{
  const calls=[],annotation={id:1,status:'uncertain',reason:'复查'},client=core.featureClient(()=>'token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({latest:annotation,history:[annotation]})};},4);
  assert.equal((await client.feedback('1','a'.repeat(64),'run')).latest.status,'uncertain');
  assert.equal(client.profile,undefined);
  for(const {options} of calls)assert.equal(options.headers['X-Review-State-Protocol'],'2');
  assert.ok(calls.every(({url})=>!url.includes('/profiles/')));
  const invalid=core.featureClient(()=>'token',async()=>({ok:true,json:async()=>({latest:{...annotation,status:'unknown'},history:[]})}),4);
  await assert.rejects(()=>invalid.feedback('1','a'.repeat(64),'run'),/格式无效/);
});

test('JSON export uses newest exact-source annotations and separates evidence from review counts',()=>{
  const hash=featurePositive.code_hash,note=(id,status)=>({id,submission_id:'1',code_hash:hash,status,reason:'核实来源'}),record={...featurePositive,review_status:'reviewed_ai',annotation:note(5,'suspected'),raw_score:60,auxiliary_score:40,previous_submission:{submission_id:'0',result:'WA'}};
  const tables=core.exportTables([record],[note(1,'ordinary'),note(6,'uncertain'),{...note(100,'ordinary'),code_hash:'x'}]);
  assert.equal(tables.current_review[0].review_status,'reviewed_uncertain');assert.equal(tables.counts.reviewed_uncertain,1);assert.equal(tables.counts.reviewed_no_ai,0);
  assert.equal(tables.complete_evidence[0].previous_submission.result,'WA');
  assert.deepEqual(tables.current_review[0].score_summary,{raw:60,adjusted:40});
  assert.equal(core.exportTables([record],[note(1,'ordinary')]).current_review[0].review_status,'reviewed_ai');
  assert.equal(tables.current_review[0].source_url,'https://accoding.buaa.edu.cn:4000/submission/1');
  assert.throws(()=>core.exportTables([record],[note(7,'unknown')]),/格式无效/);
});


test('stale or explicitly withheld auxiliary scores cannot fall back to legacy score fields',()=>{
  assert.deepEqual(core.scoreSummary({raw_score:60,auxiliary_score:null,scoring:{auxiliary_score:99}}),{raw:60,adjusted:null});
  assert.deepEqual(core.scoreSummary({raw_score:60,profile_scores_valid:false,auxiliary_score:99}),{raw:60,adjusted:null});
});


test('default run selection ignores incomplete publications and preserves explicit history access',()=>{
  const stable={run_id:'stable',created_at:100,publication_ready:true},uploading={run_id:'uploading',created_at:200,publication_ready:false};
  const values=[stable,uploading],selected=core.selectReviewRun(values);
  assert.equal(selected.selected.run_id,'stable');assert.equal(selected.latest.run_id,'stable');assert.deepEqual(selected.pending,[uploading]);assert.equal(selected.explicit,false);
  assert.equal(core.selectReviewRun(values,'uploading').selected.run_id,'uploading');assert.equal(core.selectReviewRun(values,'uploading').explicit,true);
  assert.equal(core.selectReviewRun(values,'unknown').selected.run_id,'stable');
  assert.equal(core.selectReviewRun([uploading]).selected,null);assert.equal(core.selectReviewRun([]).selected,null);
  assert.equal(core.selectReviewRun([stable,{...uploading,publication_ready:true}]).selected.run_id,'uploading');
  assert.deepEqual(values,[stable,uploading]);
});

test('legacy runs remain ready by default and ISO run timestamps sort chronologically',()=>{
  const older={run_id:'z',created_at:'2026-10-15T18:00:00+08:00'},newer={run_id:'a',created_at:'2026-10-16T09:00:00Z'};
  assert.equal(core.selectReviewRun([older,newer]).selected.run_id,'a');
  assert.equal(core.selectReviewRun([{...newer,publication_ready:false},older]).selected.run_id,'z');
});

test('profile summary uses course names, Beijing time and an explicit single-contest coverage gap',()=>{
  const snapshot={scope_contest_ids:[1327],permission_coverage:'full',cutoff:'2026-10-16T08:10:48Z',profile:{summary:{coverage:{contest_ids:[1327],source_count:10},baseline:{status:'provisional',sample_count:6,problem_count:6},habits:{comment:{present:0,applicable:6},input_guard:{present:0,applicable:6}}}}};
  const narrative=core.profileNarrative(snapshot,1327);
  assert.match(narrative.range,/C语言 C4.*10 份/);assert.match(narrative.gap,/仅能查看这一场.*跨场习惯还无法判断/);
  assert.match(narrative.baseline,/目前用于描述习惯.*6 份.*6 题.*尚未经人工确认/);
  assert.match(narrative.habits[0].text,/6 份可比较.*0 份包含说明性注释/);
  assert.match(narrative.habits[1].text,/6 份可比较.*0 份包含额外输入失败检查/);
  assert.match(narrative.updated,/2026-10-16 16:10:48.*北京时间/);
  assert.doesNotMatch([narrative.range,narrative.gap,narrative.baseline,narrative.updated].join(''),/1327|UTC|反馈水位|完整长期/);
});

test('profile coverage distinguishes uncollected scope, pending rebuild and inapplicable samples',()=>{
  const snapshot={scope_contest_ids:[1319,1327],scope_pending:true,cutoff:1,profile:{summary:{coverage:{contest_ids:[1319,1327],source_count:12,parse_failed:2},baseline:{status:'insufficient',sample_count:1,problem_count:1},habits:{input_guard:{present:0,applicable:0}}}}};
  const narrative=core.profileNarrative(snapshot,1327);
  assert.match(narrative.gap,/C语言 C1、C语言 C2尚未计入/);assert.match(narrative.gap,/正在汇总/);assert.match(narrative.gap,/2 份.*未用于习惯比较/);
  assert.match(narrative.baseline,/暂不能形成稳定对照/);assert.match(narrative.habits[0].text,/暂无可用于比较输入检查/);
  assert.equal(core.contestLabel(1299),'程序设计基础 C1');assert.equal(core.contestLabel(1304),'程序设计基础 E1');
  assert.equal(core.beijingTime('2026-10-16T08:10:48Z'),'2026-10-16 16:10:48');assert.equal(core.beijingTime('invalid'),'时间未提供');
  assert.equal(new Set(core.collectedContests().map(item=>item.id)).size,10);
});

test('explicit null scoped score never falls back to an old global rule score',()=>{
  assert.deepEqual(core.scoreSummary({raw_score:null,rule_score:65,scoring:{raw_score:65,score:65},auxiliary_score:null}),{raw:null,adjusted:null});
  assert.deepEqual(core.scoreSummary({raw_score:60,rule_score:65,auxiliary_score:60,needs_recompute:true,profile_scores_valid:true}),{raw:60,adjusted:60});
});
test('feedback-invalidated comparisons explain recomputation without changing independent scores',()=>{
  const changed={submission_id:'1',code_hash:'a'.repeat(64),needs_recompute:true,recompute_reason:'baseline_feedback_changed',scope_explanation:'历史参考后来被人工改判，该比较需重新核查并重跑；其他独立证据仍有效'};
  const snapshot={profile:{summary:{permission_projection:{needs_recompute_submissions:3}},evidence:[changed]}};
  assert.deepEqual(core.profileRecompute(snapshot,changed),{count:3,current:changed.scope_explanation});
  assert.deepEqual(core.profileRecompute(snapshot,{...changed,code_hash:'b'.repeat(64)}),{count:3,current:''});
  assert.equal(core.recomputeNotice({scope_explanation:'ordinary unrelated text'}),'');
  assert.match(core.recomputeNotice({scope_evidence_status:'baseline_feedback_changed'}),/重新核查并重跑/);
  assert.equal(core.profileRecompute({profile:{evidence:[changed]}},changed).count,1);
});

test('new clients negotiate indentation rule support and keep raw whitespace evidence',async()=>{
  const calls=[];const c=core.featureClient(()=>'',async(url,options)=>{calls.push(options);return {ok:true,json:async()=>({runs:[]})}},4);
  await c.progress(1299);
  assert.equal(calls[0].headers['X-OJ-Review-Capabilities'],'indentation-style-v1');
  assert.ok(core.featureLabels.includes('跨题缩进习惯异常'));
  const narrative=core.indentationNarrative({rule_metadata:{indentation_outlier:{candidate:true,baseline_problem_count:4,baseline_style:'tab',target_profile:{eligible_lines:25,space_lines:22,evidence_lines:[{line:8,style:'space',prefix_visualized:'····'}]}}}});
  assert.match(narrative.scope,/同场其他题/);assert.equal(narrative.lines[0].line,8);assert.match(narrative.text,/22\/25/);
});

for(const status of [503,530,200])test(`review HTML response HTTP ${status} produces a service error and the next attempt succeeds`,async()=>{
  let broken=true;
  const client=core.featureClient(()=>'',async()=>broken?new Response('<!DOCTYPE html><title>Service unavailable</title>',{status}):new Response('{"runs":[]}',{status:200}),4);
  await assert.rejects(client.progress(1299),error=>error.httpStatus===status&&error.code==='invalid_response'&&error.message.includes('HTTP '+status)&&!error.message.includes('Unexpected'));
  broken=false;assert.deepEqual(await client.progress(1299),{runs:[]});
});
