import {createAiReviewCore} from '/src/ai-review-core.mjs';

window.__reviewCapabilityRun = (async () => {
  const checks = {}, calls = [], storageWrites = [];
  let panel;
  const host = document.getElementById('review-fixture');
  const check = (name, condition) => {checks[name] = !!condition; if (!condition) throw Error(name);};
  const until = async (predicate, description) => {
    const deadline = performance.now() + 2000;
    while (!predicate()) {
      if (performance.now() > deadline) throw Error('等待超时：' + description);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  try {
    const [reviewSource, similaritySource, css] = await Promise.all([
      '/src/ai-review.js', '/src/code-similarity.js', '/src/review.css'
    ].map(async path => {const response = await fetch(path); if (!response.ok) throw Error('无法加载 ' + path); return response.text();}));
    const code = ['#include <stdio.h>', 'int main(void) {', '\tint count = 3;',
      '    printf("%d\\n", count);', '\treturn 0;', '}'].join('\n');
    const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
    const codeHash = await digest(code), configHash = 'a'.repeat(64);
    const run = {run_id: 'fixture-capability', contest_id: 1335, created_at: 1,
      publication_ready: true, configuration_sha256: configHash};
    const record = (id, label, reason) => ({submission_id: id, creator_id: '12', problem_id: 100,
      contest_id: 1335, run_id: run.run_id, code, code_hash: codeHash, configuration_sha256: configHash,
      decision_kind: 'rule_feature_candidate', review_status: 'rule_hit_unreviewed', call_id: null,
      rule_version: 'fixture-rules-v23', raw_score: 60, evaluation_result: 'AC',
      submitted_at: '2026-10-29T12:10:00+00:00', result: {ai_suspected: true, label: [label], reason},
      evidence: [], annotation: null, feedback: {latest: null, history: []}, reference_sources: []});
    const explanation = '同场其他 3 题以 Tab 缩进为主，本题空格缩进占比异常；请结合原始代码人工核实。';
    const current = record('9101', '跨题缩进习惯异常', explanation);
    current.rule_metadata = {indentation_outlier: {
      explanation, baseline_style: 'tab', baseline_problem_count: 3,
      target_profile: {eligible_lines: 12, space_lines: 10, evidence_lines: [
        {line: 3, style: 'tab', prefix_visualized: '→'},
        {line: 4, style: 'space', prefix_visualized: '····'}
      ], template_exclusions: {matches: [{name: 'gcd', start_line: 20, end_line: 24, reason: 'registered-exact-token-template'}]}}
    }};
    const old = record('9102', '输入失败防护', '历史规则输入返回值检查线索。');
    const legacy = record('9103', '长变量命名', '冻结历史运行保留的旧命名标签。');
    const records = [current, old, legacy];
    let writes = 0;
    const response = value => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
    const mockFetch = async (url, options = {}) => {
      const parsed = new URL(url, location.href), path = parsed.pathname.replace('/oj-review-api/v4', '');
      const body = options.body ? JSON.parse(options.body) : null;
      const headers = new Headers(options.headers);
      calls.push({path, method: options.method || 'GET', capability: headers.get('X-OJ-Review-Capabilities'),
        protocol: headers.get('X-Review-State-Protocol'), body});
      if ((options.method || 'GET') !== 'GET' && path !== '/reviews/search' && path !== '/code-similarity/search') {
        writes++; throw Error('Fixture forbids write or identity requests: ' + path);
      }
      if (path === '/reviews/search') {
        const visible = records.filter(item => !body.label || item.result.label.includes(body.label));
        return response({runs: [run], run_id: run.run_id, reviews: structuredClone(visible.slice(body.offset, body.offset + body.limit)),
          total: visible.length, offset: body.offset, limit: body.limit});
      }
      const detail = /^\/runs\/fixture-capability\/submissions\/(\d+)$/.exec(path);
      if (detail) return response(structuredClone(records.find(item => item.submission_id === detail[1])));
      const similarity = /^\/runs\/fixture-capability\/code-similarity\/(\d+)$/.exec(path);
      if (similarity) return response({run_id: run.run_id, submission_id: similarity[1], creator_id: '12',
        contest_id: 1335, problem_id: 100, code_hash: codeHash, version: 'same-contest-peer-tokens-v1',
        status: 'no_match', peer_count: 0, matches: []});
      if (path === '/contests/1335/progress') return response({runs: [run]});
      if (path === '/code-similarity/search') return response({run_id: run.run_id, contest_id: 1335,
        version: 'same-contest-peer-tokens-v1', pair_view: true, pair_count: 0, source_count: 0, status_count: 0,
        records: [], total: 0});
      throw Error('Unexpected synthetic request: ' + path);
    };
    const storage = {getItem: () => null, setItem: (...args) => {storageWrites.push(args); throw Error('Fixture forbids persistent storage');}};
    const ui = new Function('fetch', 'localStorage', 'ACCODING_REVIEW_CSS',
      similaritySource + '\n' + reviewSource + '\nreturn {createAiReviewPanel, createCodeSimilarityPanel};')(mockFetch, storage, css);
    Object.assign(window, {createAiReviewCore, ...ui});
    const core = createAiReviewCore();
    const context = {generation: 1, classId: 'synthetic-class', className: '合成班',
      contest: {id: 1335, title: 'C6 合成比赛', problems: [{id: 100, label: 'F', title: '合成题目'}]},
      summary: {rows: [{userId: '12', studentId: '0001', name: '合成学生', status: 'matched'}]}};
    panel = ui.createAiReviewPanel(host, core, () => context, null);
    await panel.setActive(true);
    await until(() => host.querySelectorAll('.ar-table tbody tr').length === 3, '新旧标签列表');
    check('new_label_is_supported_by_actual_core', core.featureLabels.includes('跨题缩进习惯异常') && core.hasReviewRecord(current));
    check('new_and_old_labels_render_in_list', host.querySelector('.ar-table').textContent.includes('跨题缩进习惯异常') && host.querySelector('.ar-table').textContent.includes('输入失败防护'));
    const feature = host.querySelector('[aria-label="代码特征"]');
    check('new_label_available_in_filter', [...feature.options].some(option => option.value === '跨题缩进习惯异常'));
    feature.value = '跨题缩进习惯异常'; feature.dispatchEvent(new Event('change'));
    await until(() => host.querySelectorAll('.ar-table tbody tr').length === 1, '缩进标签筛选');
    check('new_label_filter_uses_real_client', calls.some(call => call.path === '/reviews/search' && call.body?.label === '跨题缩进习惯异常'));

    await panel.openDetail('9101');
    await until(() => host.querySelector('.ar-rule-details h4')?.textContent === '跨题缩进习惯异常', '缩进依据详情');
    const detail = host.querySelector('.ar-review-page'), facts = detail.querySelector('.ar-rule-details');
    facts.open = true;
    check('indentation_detail_title', detail.querySelector('h2').textContent === '代码复核 · 提交 #9101');
    check('indentation_explanation_rendered', facts.textContent.includes(explanation));
    check('same_contest_scope_and_later_submission_limit_rendered', facts.textContent.includes('同场其他题对照（可能包含较晚提交）'));
    check('raw_tab_and_space_evidence_rendered', [...facts.querySelectorAll('pre')].some(node => node.textContent === '第 3 行 · tab · →') && [...facts.querySelectorAll('pre')].some(node => node.textContent === '第 4 行 · space · ····'));
    const templateDetails = [...facts.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent === '模板排除证据');
    templateDetails.open = true;
    check('template_exclusion_evidence_rendered', templateDetails.textContent.includes('gcd') && templateDetails.textContent.includes('registered-exact-token-template'));
    const currentCode = [...detail.querySelectorAll('[data-current-source] .ar-code-line')].filter((_, index) => index % 2 === 0)
      .map(node => [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('')).join('\n');
    check('original_tabs_and_spaces_are_preserved', currentCode === code && currentCode.includes('\tint count') && currentCode.includes('    printf'));
    check('original_code_hash_remains_valid', await digest(currentCode) === codeHash && await core.verifySource(currentCode, codeHash) === code);
    check('unreviewed_human_choice_remains_empty', detail.querySelector('[aria-label="人工复核结论"]').value === '');
    const peerDetail = detail.querySelector('[data-code-similarity]');
    peerDetail.open = true;
    await until(() => peerDetail.textContent.includes('未发现嫌疑代码'), '真实查重详情界面');
    check('real_similarity_detail_still_works', peerDetail.textContent.includes('未发现嫌疑代码。'));

    await panel.openDetail('9102');
    check('previous_label_detail_remains_readable', host.querySelector('.ar-record-summary').textContent.includes('输入失败防护') && !host.querySelector('.ar-rule-details').textContent.includes('跨题缩进习惯异常'));
    await panel.openDetail('9103');
    check('retired_label_frozen_detail_remains_readable', host.querySelector('.ar-record-summary').textContent.includes('长变量命名'));
    const returnButton = [...host.querySelectorAll('button')].find(button => button.textContent === '返回列表');
    returnButton.click();
    const peerBranch = [...host.querySelectorAll('button')].find(button => button.textContent === '代码查重');
    peerBranch.click();
    await until(() => host.querySelector('.ar-similarity-panel').textContent.includes('本班涉及 0 对'), '真实查重分支');
    check('real_similarity_branch_remains_readable', calls.some(call => call.path === '/code-similarity/search'));
    check('all_read_requests_negotiate_indentation_capability', calls.length > 0 && calls.every(call => call.capability === 'indentation-style-v1' && call.protocol === '2'));
    check('no_feedback_writes_or_persistent_storage', writes === 0 && storageWrites.length === 0 && !calls.some(call => /^\/feedback(?:\/session)?$/.test(call.path)));
    window.__reviewCapabilityResult = {passed: true, checks, calls: calls.map(({path, method, capability, protocol}) => ({path, method, capability, protocol}))};
    document.getElementById('test-result').textContent = `${Object.keys(checks).length} 项通过\n` + Object.keys(checks).join('\n');
    return window.__reviewCapabilityResult;
  } catch (error) {
    window.__reviewCapabilityResult = {passed: false, checks, failure: error.stack || String(error)};
    document.getElementById('test-result').textContent = error.stack || String(error);
    return window.__reviewCapabilityResult;
  } finally {panel?.setActive(false);}
})();
window.__reviewCapabilityRun.catch(error => {
  window.__reviewCapabilityResult = {passed: false, checks: {}, failure: error.stack || String(error)};
  document.getElementById('test-result').textContent = error.stack || String(error);
});
