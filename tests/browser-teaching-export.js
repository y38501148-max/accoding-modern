import {createClassCore} from '/src/class-core.mjs';
import {createContestCore} from '/src/contest-core.mjs';
import {acceptanceAxis, mergeTeachingContests, createTeachingContest} from '/src/teaching-contest.mjs';
import {createTeachingScoreExport} from '/src/teaching-export.mjs';
import {readClassXlsx} from '/src/class-xlsx.mjs';

// All service data and preferences are disposable fixture values. The actual
// class manager is loaded as a classic script with only localStorage substituted.
window.__teachingExportRun = (async () => {
  const checks = {}, calls = [], downloads = [], urls = new Map();
  const clone = value => structuredClone(value);
  const sourceResponse = await fetch('/src/class-manager.js');
  if (!sourceResponse.ok) throw Error('无法加载实际 class-manager.js');
  const source = await sourceResponse.text();
  const preferences = new Map([['accoding-modern.teaching.selection.v1', JSON.stringify({
    course: 'course-one', classId: 'class-one', type: 'teaching', cid: '9003', mode: 'contest', tab: 'scores'
  })]]);
  const storage = {getItem: key => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value)};
  const roster = [
    {studentId: '0001', name: '合成甲', userId: '11', classId: 'class-one', isRetake: false},
    {studentId: '0002', name: '合成重修', userId: '12', classId: 'class-one', isRetake: true},
    {studentId: '0003', name: '合成乙', userId: '13', classId: 'class-two', isRetake: false}
  ];
  const titles = {'9003': 'E3 未采集练习', '9002': 'E2 已采集练习', '9001': 'C3 未采集上机'};
  const bootstrap = {courses: [{id: 'course-one', groupId: '124', name: '合成课程', semester: '合成学期'}], classes: [
    {id: 'class-one', courseId: 'course-one', type: 'teaching', name: '合成一班', label: '合成一班'},
    {id: 'class-two', courseId: 'course-one', type: 'teaching', name: '合成二班', label: '合成二班'}
  ]};
  const rawContest = id => ({id: Number(id), group_id: 124, title: titles[id],
    start_time: '2026-10-01T00:00:00Z', end_time: '2026-10-01T02:00:00Z',
    problems: [{id: 91, title: '合成题目', contest_problem_list: {order: 0, score: 100}}]});
  const rawRank = fresh => roster.map((member, i) => ({
    user: {id: Number(member.userId), student_id: member.studentId},
    score: fresh ? [80, 60, 50][i] : [10, 20, 30][i], penalty: 1000,
    detail: {A: {score: fresh ? [80, 60, 50][i] : [10, 20, 30][i], result: 'WA', wrong_count: 1}}
  }));
  let failNextRank = false, holdNextRank = false, held = null;
  const selectedRoster = options => roster.filter(member => !options?.query?.class_id || member.classId === options.query.class_id);
  const client = {
    base: () => 'https://fixture.invalid', clearCache: async () => {},
    groups: async () => [{id: '124', name: '合成课程'}],
    contests: async () => Object.entries(titles).map(([id, title]) => ({id, title})),
    request: async (path, options = {}) => {
      calls.push({kind: 'service', path, query: clone(options.query || {})});
      if (path === '/bootstrap') return clone(bootstrap);
      if (path === '/contests') return {contests: [{id: '9002', title: titles['9002'], state: 'verified'}]};
      if (path === '/members') return {members: clone(selectedRoster(options))};
      if (path === '/contests/9002') {
        const view = createTeachingContest(rawContest('9002'), rawRank(true), selectedRoster(options), '124', createContestCore());
        return {...view, source: 'cloud', syncedAt: '2026-10-01T02:05:00Z'};
      }
      if (path === '/export/contest') return new Blob(['cloud-export'], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      throw Error('Unexpected fixture service path: ' + path);
    },
    oj: async (path, signal, fresh = false) => {
      calls.push({kind: 'oj', path, fresh, signal});
      const match = /^\/api\/contests\/(900[123])(\/rank)?$/.exec(path);
      if (!match) throw Error('Unexpected fixture OJ path: ' + path);
      if (!match[2]) return rawContest(match[1]);
      if (fresh && failNextRank) {failNextRank = false; throw Error('合成 fresh rank 失败');}
      if (fresh && holdNextRank) {
        holdNextRank = false;
        return new Promise(resolve => {held = {signal, release: () => resolve(rawRank(true))};});
      }
      return rawRank(fresh);
    }
  };
  Object.assign(window, {acceptanceAxis, mergeTeachingContests, createTeachingContest, createTeachingScoreExport,
    createTeachingClient: () => client,
    createAiReviewPanel: () => ({setActive() {}, reset() {}, setProblemScope() {}}),
    workspaceIcon: () => document.createElement('span'), accodingPath: path => path,
    ACCODING_TEACHING_CSS: ':host{font:14px sans-serif}.overlay{position:relative}.rail{display:none}.content{padding:12px}.filters,.actions,.tabs{display:flex;gap:10px}table{border-collapse:collapse}td,th{padding:6px;border:1px solid #ddd}',
    ACCODING_REVIEW_CSS: ''});
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = blob => {const url = originalCreate.call(URL, blob); urls.set(url, blob); return url;};
  URL.revokeObjectURL = url => {urls.delete(url); originalRevoke.call(URL, url);};
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return originalClick.call(this);
    downloads.push({filename: this.download, blob: urls.get(this.href), calls: calls.length});
  };
  const check = (name, condition) => {checks[name] = !!condition; if (!condition) throw Error(name);};
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const until = async (predicate, description) => {
    const end = performance.now() + 1500;
    while (!predicate()) {if (performance.now() > end) throw Error('等待超时：' + description); await tick();}
  };
  const settle = async () => {for (let i = 0; i < 5; i++) await tick();};
  let root;
  const $ = selector => root.querySelector(selector);
  const change = async (selector, value) => {
    const control = $(selector);
    if (control.type === 'checkbox') control.checked = value; else control.value = value;
    control.dispatchEvent(new Event('change', {bubbles: true})); await settle();
    await until(() => $('#message').hidden && $('#page-content table'), selector);
  };
  const exportLocal = async () => {
    const count = downloads.length;
    $('#export-data').click();
    await until(() => downloads.length === count + 1, '成绩下载');
    await until(() => !$('#export-data').disabled, '导出按钮恢复');
    const workbook = await readClassXlsx(downloads.at(-1).blob);
    return {workbook, rows: workbook[0].rows, download: downloads.at(-1)};
  };
  const ids = result => result.rows.slice(1).map(row => row[0]);
  try {
    const mount = new Function('localStorage', source + '\nreturn mountClassManager;')(storage);
    mount(createClassCore(), createContestCore(), {}, {}, {});
    root = document.getElementById('am-classes').shadowRoot;
    $('.launch').click();
    await until(() => !$('#export-data').disabled && $('#page-content table'), '未采集 E 成绩页');
    check('uncollected_E_export_enabled', $('#contest-select').value === '9003' && !$('#export-data').disabled);
    const before = calls.length, first = await exportLocal();
    const exportCalls = calls.slice(before, first.download.calls);
    check('fresh_rank_before_local_download', exportCalls.some(call => call.kind === 'oj' && call.path.endsWith('/rank') && call.fresh));
    check('uncollected_E_does_not_call_cloud_export', !exportCalls.some(call => call.path.startsWith('/export/')));
    check('actual_workbook_uses_fresh_rank', first.rows[1][0] === '0001' && first.rows[1][2] === '80');
    check('actual_workbook_filters_class_and_retake', ids(first).join(',') === '0001');
    check('actual_workbook_has_scope_metadata', first.workbook.length === 2 && first.workbook[1].rows.some(row => row[0] === '数据来源' && row[1] === 'OJ 当前可见榜单'));
    check('download_keeps_text_student_id', first.rows[1][0] === '0001' && first.download.filename.includes('E3'));

    await change('#include-retake', true);
    const retake = await exportLocal();
    check('retake_switch_changes_actual_workbook', ids(retake).join(',') === '0001,0002' && retake.workbook[1].rows.some(row => row[0] === '含重修' && row[1] === '是'));
    await change('#class-select', 'class-two');
    const secondClass = await exportLocal();
    check('class_switch_changes_actual_workbook', ids(secondClass).join(',') === '0003' && secondClass.download.filename.startsWith('合成二班-'));

    await change('#contest-select', '9002');
    const cloudBefore = calls.length, cloudCount = downloads.length;
    $('#export-data').click(); await until(() => downloads.length === cloudCount + 1, '云端导出'); await settle();
    const cloudCalls = calls.slice(cloudBefore);
    check('collected_E_keeps_cloud_export', cloudCalls.some(call => call.path === '/export/contest' && call.query.contest_id === '9002' && call.query.class_id === 'class-two'));
    check('collected_E_does_not_refresh_OJ_for_export', !cloudCalls.some(call => call.kind === 'oj'));
    check('collected_E_download_is_server_blob', await downloads.at(-1).blob.text() === 'cloud-export');

    await change('#contest-select', '9001');
    const disabledCount = downloads.length;
    $('#export-data').click(); await settle();
    check('uncollected_C_stays_disabled', $('#export-data').disabled && downloads.length === disabledCount);

    await change('#contest-select', '9003');
    failNextRank = true;
    const failCount = downloads.length;
    $('#export-data').click();
    await until(() => $('#message').textContent.includes('合成 fresh rank 失败') && !$('#export-data').disabled, 'fresh 失败提示');
    check('fresh_failure_never_downloads_stale_data', downloads.length === failCount);

    holdNextRank = true; held = null;
    $('#export-data').click(); await until(() => held !== null, '挂起榜单请求');
    const oldContest = held, oldContestCount = downloads.length;
    await change('#contest-select', '9001');
    oldContest.release(); await settle();
    check('contest_switch_aborts_export_rank', oldContest.signal.aborted);
    check('contest_switch_discards_late_export', downloads.length === oldContestCount && $('#export-data').disabled);

    await change('#contest-select', '9003');
    holdNextRank = true; held = null;
    $('#export-data').click(); await until(() => held !== null, '挂起班级切换请求');
    const oldClass = held, oldClassCount = downloads.length;
    await change('#class-select', 'class-one');
    oldClass.release(); await settle();
    check('class_switch_aborts_export_rank', oldClass.signal.aborted);
    check('class_switch_discards_late_export', downloads.length === oldClassCount && !$('#export-data').disabled);
    const restored = await exportLocal();
    check('export_after_stale_request_uses_current_scope', ids(restored).join(',') === '0001,0002');
    check('fixture_preferences_only_in_memory', preferences.size === 1);
    window.__teachingExportResult = {passed: true, checks, downloads: downloads.length};
    document.getElementById('test-result').textContent = `${Object.keys(checks).length} 项通过\n` + Object.keys(checks).join('\n');
    return window.__teachingExportResult;
  } catch (error) {
    window.__teachingExportResult = {passed: false, checks, failure: error.stack || String(error)};
    document.getElementById('test-result').textContent = error.stack || String(error);
    return window.__teachingExportResult;
  } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    HTMLAnchorElement.prototype.click = originalClick;
  }
})();
window.__teachingExportRun.catch(error => {
  window.__teachingExportResult = {passed: false, checks: {}, failure: error.stack || String(error)};
  document.getElementById('test-result').textContent = error.stack || String(error);
});
