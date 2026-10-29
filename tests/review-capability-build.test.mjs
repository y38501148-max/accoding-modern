import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';

const script=await readFile(new URL('../accoding-modern.user.js',import.meta.url),'utf8');
const guard='if (!ACCODING_MODERN_IS_APP) return;';
assert.ok(script.includes(guard),'the actual distributed bundle has its runtime guard');
const context={location:{origin:'https://fixture.invalid',pathname:'/'},URL,TextEncoder,TextDecoder,
  crypto:webcrypto,structuredClone,DOMException,AbortController,AbortSignal,setTimeout,clearTimeout};
vm.runInNewContext(script.replace(guard,'globalThis.__reviewCore=createAiReviewCore(); return;'),context,{timeout:3000});
const core=context.__reviewCore;
const runId='capability-build',contestId=1335,code='\tint main(void){\n    return 0;\n}\n';
const digest=createHash('sha256').update(code).digest('hex');
const run={run_id:runId,contest_id:contestId,configuration_sha256:'b'.repeat(64),publication_ready:true,created_at:1};
const review={submission_id:'1',creator_id:'11',contest_id:contestId,problem_id:10,run_id:runId,
  decision_kind:'rule_feature_candidate',rule_version:'fixture-rules',call_id:null,code,code_hash:digest,
  configuration_sha256:run.configuration_sha256,review_status:'rule_hit_unreviewed',
  result:{ai_suspected:true,label:['跨题缩进习惯异常'],reason:'同场缩进对照线索，需人工核实。'},
  rule_metadata:{indentation_outlier:{baseline_style:'tab',target_style:'space',baseline_problem_count:4,
    target_profile:{space_lines:22,eligible_lines:25,evidence_lines:[{line:2,style:'space',prefix_visualized:'····'}],
      template_exclusions:{matches:[{name:'gcd',start_line:8,end_line:11}]}}}}};
const source={submission_id:'1',creator_id:'11',contest_id:contestId,problem_id:10,run_id:runId,code_hash:digest,code};
const similarity={run_id:runId,contest_id:contestId,submission_id:'1',creator_id:'11',problem_id:10,
  code_hash:digest,version:'same-contest-peer-tokens-v1',status:'no_match',matches:[],peer_count:0};
const query={run_id:runId,contest_id:contestId,creator_ids:['11'],offset:0,limit:30};
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});

test('the distributed core declares full v4 capability on lists, details, sources, exports and similarity reads',async()=>{
  const calls=[];
  const client=core.featureClient(()=>{throw Error('public reads must not request credentials');},async(url,options)=>{
    calls.push({url,options});const path=new URL(url).pathname;
    if(path.endsWith('/progress'))return reply({runs:[run]});
    if(path.endsWith('/reviews/search'))return reply({runs:[run],run_id:runId,total:1,reviews:[review],offset:0,limit:30});
    if(path.endsWith('/submissions/1'))return reply(review);
    if(path.endsWith('/sources/1'))return reply(source);
    if(path.endsWith('/evidence/export'))return reply({run_id:runId,total:1,items:[{source,rule_hit:{labels:review.result.label,metadata:review.rule_metadata}}],next_offset:null});
    if(path.endsWith('/feedback/export'))return reply({feedback:[],next_after:null});
    if(path.endsWith('/code-similarity/search'))return reply({run_id:runId,contest_id:contestId,version:similarity.version,total:1,records:[similarity]});
    if(path.endsWith('/code-similarity/1'))return reply(similarity);
    if(path.endsWith('/feedback/session'))return reply({review_state_protocol:2});
    throw Error('unexpected request: '+path);
  },4);
  assert.equal((await client.progress(contestId)).runs[0].run_id,runId);
  assert.equal((await client.openList(query,runId)).reviews[0].result.label[0],'跨题缩进习惯异常');
  assert.equal((await client.search(query)).reviews.length,1);
  const detail=(await client.openReview('1',runId)).record;
  assert.equal(detail.code,code,'raw tabs/newlines survive detail hash validation');
  assert.ok(core.hasReviewRecord(detail));
  const narrative=core.indentationNarrative(detail);
  assert.equal(narrative.lines[0].prefix_visualized,'····');
  assert.equal(narrative.templates[0].name,'gcd');
  assert.equal((await client.source('1',runId)).code,code);
  assert.equal((await client.exportEvidence(runId)).items[0].source.code_hash,digest);
  assert.equal((await client.exportFeedback(contestId)).feedback.length,0);
  assert.equal((await client.similaritySearch(query)).records[0].status,'no_match');
  assert.equal((await client.similarityDetail('1',runId,contestId)).status,'no_match');
  assert.equal((await client.session()).review_state_protocol,2);
  assert.equal(calls.length,10);
  for(const {options} of calls){
    assert.equal(options.headers['X-OJ-Review-Capabilities'],'indentation-style-v1');
    assert.equal(options.headers['X-Review-State-Protocol'],'2');
    assert.ok(!options.headers.Authorization);
    assert.equal(options.credentials,'omit');
  }
});

test('the distributed core keeps old labels and rejects an unknown rule without claiming it can render it',()=>{
  assert.ok(core.hasReviewRecord({...review,result:{...review.result,label:['讲解性注释']}}));
  assert.ok(!core.hasReviewRecord({...review,result:{...review.result,label:['future-unknown-rule']}}));
});

test('a server upgrade-required response is readable and has no cached successful substitute',async()=>{
  const detail='该运行需要新版插件，历史兼容运行仍可读取';
  const client=core.featureClient(()=>'',async()=>new Response(JSON.stringify({detail}),{status:409}),4);
  await assert.rejects(client.progress(contestId),error=>error.httpStatus===409&&error.message===detail);
});

for(const [baseline,target,count,word] of [['tab','space',22,'空格'],['space','tab',21,'Tab']]){
  test(`indentation fallback describes ${baseline} baseline and ${target} target accurately`,()=>{
    const fact={baseline_style:baseline,target_style:target,baseline_problem_count:4,
      target_profile:{eligible_lines:25,[target+'_lines']:count}};
    const text=core.indentationNarrative({rule_metadata:{indentation_outlier:fact}}).text;
    assert.ok(text.includes(`${count}/25`));assert.ok(text.endsWith(`使用${word}。`));
    assert.equal(core.indentationNarrative({rule_metadata:{indentation_outlier:{...fact,explanation:'原始冻结解释'}}}).text,'原始冻结解释');
  });
}
