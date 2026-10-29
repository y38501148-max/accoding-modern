import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createAiReviewCore} from '../src/ai-review-core.mjs';

const script=await readFile(new URL('../accoding-modern.user.js',import.meta.url),'utf8');
const guard='if (!ACCODING_MODERN_IS_APP) return;';
assert.ok(script.includes(guard));
const context={location:{origin:'https://fixture.invalid',pathname:'/'},URL,TextEncoder,TextDecoder,
  crypto:webcrypto,structuredClone,DOMException,AbortController,AbortSignal,setTimeout,clearTimeout};
vm.runInNewContext(script.replace(guard,'globalThis.__reviewCore=createAiReviewCore(); return;'),context,{timeout:3000});

for(const [kind,core] of [['source',createAiReviewCore()],['distributed',context.__reviewCore]]){
  const fact={version:'indentation-style-observation-v2-20261029',observation_only:true,candidate:false,
    outlier_observation:true,baseline_style:'tab',target_style:'space',baseline_problem_count:4,
    target_profile:{eligible_lines:25,space_lines:22,evidence_lines:[{line:8,style:'space',prefix_visualized:'····'}],
      template_exclusions:{matches:[{name:'gcd',start_line:1,end_line:5}]}}};
  const record=value=>({result:{label:['输入失败防护']},rule_metadata:{indentation_outlier:value}});
  test(`${kind}: indentation observations explain their limited role and keep raw evidence`,()=>{
    const narrative=core.indentationNarrative(record(fact));
    assert.equal(narrative.title,'跨题缩进习惯观察');
    assert.match(narrative.notice,/不单独进入核查名单/);assert.match(narrative.notice,/不计分/);
    assert.equal(narrative.lines[0].prefix_visualized,'····');assert.equal(narrative.templates[0].name,'gcd');
    assert.match(narrative.text,/22\/25/);assert.match(narrative.scope,/可能包含较晚提交/);
  });
  test(`${kind}: non-outliers and insufficient samples are not titled as indentation anomalies`,()=>{
    for(const sample_status of ['sufficient','insufficient'])assert.equal(core.indentationNarrative(record({...fact,outlier_observation:false,sample_status})),null);
    assert.equal(core.indentationNarrative(record({candidate:false,sample_status:'insufficient'})),null);
    assert.equal(core.indentationNarrative(record({})),null);
    assert.equal(core.indentationNarrative({}),null);
  });
  test(`${kind}: setting switches remain observations without a new anomaly label`,()=>{
    const narrative=core.indentationNarrative(record({...fact,outlier_observation:false,setting_switch_observation:true}));
    assert.equal(narrative.title,'跨题缩进习惯观察');assert.ok(narrative.notice);
    assert.equal(core.indentationNarrative(record({...fact,observation_only:undefined})).title,'跨题缩进习惯观察');
  });
  test(`${kind}: frozen historical hits retain their original title and explanation`,()=>{
    const old={...fact,version:'indentation-style-outlier-v1-20261028',observation_only:undefined,
      candidate:true,outlier_observation:undefined,explanation:'原始冻结解释'};
    const narrative=core.indentationNarrative(record(old));
    assert.equal(narrative.title,'跨题缩进习惯异常');assert.equal(narrative.text,'原始冻结解释');assert.equal(narrative.notice,'');
    const withoutCandidate={result:{label:['跨题缩进习惯异常']},rule_metadata:{indentation_outlier:{...old,candidate:undefined}}};
    assert.equal(core.indentationNarrative(withoutCandidate).title,'跨题缩进习惯异常');
  });
}
