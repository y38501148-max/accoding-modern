function mountClassManager(core, contestCore, upsolveCore, upsolveReader, reviewCore) {
  if (document.getElementById('am-classes')) return;
  const host = document.createElement('div'); host.id = 'am-classes'; document.body.append(host);
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `<style>
    :host{all:initial;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#25344b}
    .problem-review-page{position:fixed;inset:0;z-index:2147483001;overflow:auto;background:#eef3f9;padding:20px max(20px,calc((100vw - 1600px)/2));box-sizing:border-box}.problem-review-page>.toolbar{background:#fff;border:1px solid #dfe7f0;border-radius:12px;padding:12px 18px;position:sticky;top:0;z-index:2}.problem-review-page>.panel{margin:14px 0}.overlay:has(.ar-review-page:not([hidden])),.problem-review-page:has(.ar-review-page:not([hidden])){overflow:hidden}@media(max-width:700px){.problem-review-page{padding:8px}}
    .toolbar>.row{gap:8px}.toolbar>h2,.toolbar>div:first-child h2{margin-bottom:0}.toolbar{row-gap:16px}.toolbar input,.toolbar select,.toolbar button{min-height:40px}.toolbar>.row select{min-width:150px}.student-head{flex-wrap:wrap}.student-head>.row{justify-content:flex-end;gap:8px}[role=tablist]{display:inline-flex;background:#e3eaf4;padding:5px;border-radius:12px;gap:4px}[role=tablist] button{border:0;background:transparent;min-width:115px}[role=tablist] button.primary{background:#fff;color:#235de4;box-shadow:0 2px 5px #17385912}textarea{font:inherit}@media(max-width:800px){.toolbar>.row{width:100%}.toolbar>.row>input,.toolbar>.row>select{flex:1;min-width:120px}.student-head>.row{justify-content:flex-start}[role=tablist]{display:flex}[role=tablist] button{flex:1;min-width:0}}
    *{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{outline-offset:3px}button{cursor:pointer;border:1px solid #d9e2ee;border-radius:9px;background:white;color:#334862;padding:8px 14px}button:hover{background:#edf4ff}button:disabled{opacity:.5;cursor:wait}button.primary{background:#235de4;color:white;border-color:#235de4}button.danger{color:#a43141}.launch{position:fixed;bottom:100px;right:26px;z-index:9998;box-shadow:0 8px 24px #18345322;background:#fff;color:#2458ca;font-weight:700}
    [hidden]{display:none!important}.overlay{position:fixed;inset:0;z-index:2147483000;background:#eef3f9;overflow:auto}.shell{max-width:1500px;margin:auto;padding:24px 32px 60px}.top,.toolbar,.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.top{justify-content:space-between;margin-bottom:22px}.eyebrow{font-size:12px;color:#4270bc;font-weight:700;letter-spacing:2px}h1{font-size:29px;line-height:1.3;margin:4px 0}h2{font-size:20px;margin:0 0 12px}h3{margin:0 0 10px;font-size:17px}p{margin:6px 0 14px}.muted{color:#6c7b91;font-size:13px}.tag{background:#e3ebfb;color:#385ca0;padding:4px 10px;border-radius:20px;font-size:12px}input,select{border:1px solid #ccd9e9;border-radius:8px;background:#fff;color:#25344b;padding:9px 11px;max-width:100%}input[type=file]{width:100%}label{display:flex;align-items:center;gap:8px}.panel{border:1px solid #dfe7f0;border-radius:16px;background:white;padding:22px;margin:18px 0;box-shadow:0 4px 16px #20335404}.toolbar{justify-content:space-between}.message{min-height:42px;padding:9px 12px;font-size:14px;color:#496680;background:#e8f0ff;border-radius:8px;margin-top:14px}.message.error{background:#fff0ed;color:#a33e36}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.metric{background:#fff;border:1px solid #dfe7f0;border-radius:14px;padding:18px}.metric strong{display:block;font-size:32px;line-height:1.3;color:#234f99}.chart{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(175px,1fr))}.problem{padding:16px;border:1px solid #e1e8f1;border-radius:12px}.problem b{font-size:25px}.problem small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#76869c}.bar{height:10px;border-radius:8px;background:#edf1f7;position:relative;margin:9px 0 5px}.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:#adc4f4}.bar em{position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:#2b68e8}.counts{display:flex;justify-content:space-between;font-size:13px}.counts span:first-child{color:#235de4;font-weight:700}.table-wrap{overflow:auto;max-height:560px}table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}th{text-align:left;position:sticky;top:0;background:#f5f8fc;z-index:1;color:#617189;font-weight:600}th,td{padding:12px;border-bottom:1px solid #e8edf4}td button{padding:4px 10px;font-size:13px}.ac{color:#16806b;font-weight:700}.pending{color:#997214}.bad{color:#c05b4d}.empty{text-align:center;padding:48px 16px;color:#687c98}.pager{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:14px}.preview{max-height:220px;overflow:auto;margin-top:14px}.student-head{display:flex;justify-content:space-between;gap:14px;align-items:center}.wide{min-width:260px}a{color:#235de4;text-decoration:none}dialog{border:1px solid #d7e2f0;border-radius:14px;max-width:440px;width:90%;padding:24px;color:#25344b}dialog::backdrop{background:#17253a77}
    #rank-table th,#rank-table td{padding:10px 8px}#rank-table .muted{font-size:12px}
    @media(max-width:800px){.shell{padding:18px 14px}.cards{grid-template-columns:repeat(2,1fr)}.panel{padding:16px}.launch{right:16px}.wide{min-width:0;width:100%}.chart{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
  <button class="launch" type="button">▦ 班级</button>
  <section class="overlay" hidden role="dialog" aria-modal="true" aria-label="班级管理">
    <div class="shell"><header class="top"><div><div class="eyebrow">ACCODING · CLASSROOM</div><h1>班级</h1><span class="tag">${ACCODING_MODERN_VERSION}</span></div><button data-action="close">← 返回 OJ</button></header>
    <div class="toolbar"><div class="row"><select id="class-select" aria-label="选择班级"></select><button data-action="import">＋ 导入名册</button></div><div class="row"><button data-action="rename">重命名</button><button data-action="export">导出名册 CSV</button><button class="danger" data-action="delete">删除班级</button></div></div>
    <div id="message" class="message" role="status" aria-live="polite" hidden></div>
    <section id="import-panel" class="panel" hidden><h2>从 Excel 创建班级</h2><div class="row"><input id="file" type="file" accept=".xls,.xlsx" aria-label="选择 XLS 或 XLSX 名册"><label>工作表 <select id="sheet" disabled></select></label><label>班级名称 <input id="class-name" maxlength="80" placeholder="例如：26 秋程设 · 王君臣"></label><button class="primary" data-action="create" disabled>确认创建</button><button data-action="cancel-import">取消</button></div><div id="preview" class="preview"></div></section>
    <div id="empty" class="panel empty">导入一份 XLS / XLSX 名册，开始查看班级学习情况。</div>
    <main id="workspace" hidden><section class="panel"><div class="toolbar"><div><h2>比赛学习情况</h2></div><div class="row"><select id="contest-select" class="wide" aria-label="选择比赛"><option value="">选择可见比赛</option></select><input id="contest-id" type="number" min="1" autocomplete="off" inputmode="numeric" placeholder="或输入比赛 ID" size="12" aria-label="比赛 ID"><button class="primary" data-action="load">读取比赛</button><button data-action="refresh">刷新统计</button><label>导出格式 <select id="score-export-format" aria-label="比赛成绩导出格式" disabled><option value="xlsx">XLSX</option><option value="csv">CSV</option></select></label><button data-action="export-score" disabled>导出比赛成绩</button></div></div><p id="contest-title" class="muted"></p></section><div class="row" role="tablist" aria-label="班级比赛页面"><button id="contest-tab" data-action="contest-tab" role="tab" aria-selected="true" aria-controls="contest-pane" class="primary">比赛统计</button><button id="upsolve-tab" data-action="upsolve-tab" role="tab" aria-selected="false" aria-controls="upsolve-pane">补题排行榜</button><button id="review-tab" data-action="review-tab" role="tab" aria-selected="false" aria-controls="review-pane">代码复核</button></div><section id="review-pane" class="panel" role="tabpanel" aria-labelledby="review-tab" hidden></section><div id="contest-pane" role="tabpanel" aria-labelledby="contest-tab">
    <div id="metrics" class="cards"></div><section id="stats-panel" class="panel" hidden><div class="toolbar"><h2>逐题通过情况</h2><span id="chart-legend" class="muted">蓝色：通过人数　浅蓝：尝试人数</span></div><div id="chart" class="chart"></div></section>
    <section id="accepted-panel" class="panel" hidden><div class="toolbar"><h2>按题查看通过提交</h2><div class="row"><select id="accepted-problem" aria-label="选择通过提交的题目"><option value="">选择一道题</option></select><input id="accepted-search" placeholder="搜索姓名、学号、班级" aria-label="搜索通过同学"><select id="accepted-mode" aria-label="通过提交显示方式"><option value="latest">每人最新一条 AC</option><option value="all">全部 AC 提交</option></select><button data-action="refresh-accepted" disabled>刷新通过提交</button><button data-action="review-problem" disabled>进入本题代码核查</button></div></div><p class="muted">仅显示本班同学在比赛时间内的 AC 提交。</p><p id="accepted-count" class="muted" role="status" aria-live="polite"></p><div id="accepted-table" class="table-wrap"></div><div id="accepted-pager" class="pager"></div></section>
    <section class="panel"><div class="toolbar"><h2>班级同学</h2><div class="row"><input id="search" placeholder="搜索姓名、学号、班级" aria-label="搜索学生"><select id="member-filter" aria-label="筛选学生"><option value="all">全部同学</option><option value="matched">已匹配</option><option value="missing">榜单未找到</option><option value="ambiguous">学号冲突</option></select></div></div><div id="members" class="table-wrap"></div><div id="member-pager" class="pager"></div></section>
    </div><section id="upsolve-pane" class="panel" role="tabpanel" aria-labelledby="upsolve-tab" hidden><div class="toolbar"><h2>补题排行榜</h2><div class="row"><label>截止时间 <input id="upsolve-until" type="datetime-local" step="1" aria-label="补题截止时间" title="留空查询至当前时间（北京时间）"></label><button data-action="upsolve" disabled class="primary">更新排行榜</button><button data-action="cancel-upsolve" hidden>取消查询</button></div></div><div class="toolbar" style="margin:12px 0"><div class="row"><select id="ranking-order" aria-label="排名依据"><option value="upsolved">按赛后补过排名</option><option value="total">按累计通过排名</option></select><input id="ranking-search" placeholder="搜索姓名、学号" aria-label="搜索排行榜学生"></div><span id="upsolve-time" class="muted"></span></div><div id="rank-table" class="table-wrap"><div class="empty">读取比赛后，更新补题排行榜。</div></div><div id="rank-pager" class="pager"></div></section>
    <section id="student-panel" class="panel" hidden><div class="student-head"><div><h2 id="student-title"></h2></div><div class="row"><select id="submission-scope" aria-label="提交范围"><option value="contest">赛内提交</option><option value="upsolve" disabled>赛后提交</option><option value="all" disabled>全部提交</option></select><select id="problem-filter" aria-label="筛选题目"><option value="all">全部题目</option></select><select id="result-filter" aria-label="筛选提交结果"><option value="all">全部结果</option><option value="AC">仅通过</option><option value="failed">未通过（已评测）</option><option value="pending">评测中</option></select><button data-action="refresh-submissions">刷新提交</button><button data-action="close-student">收起</button></div></div><div id="student-problems" class="table-wrap" hidden style="margin:16px 0"></div><div id="submissions" class="table-wrap"></div><div id="submission-pager" class="pager"></div></section></main>
    </div><section id="problem-review-page" class="problem-review-page" hidden aria-label="本题提交核查"><div class="toolbar"><h2>本题提交核查名单</h2><button data-action="close-problem-review">返回班级页面</button></div><div id="problem-review-content" class="panel"></div></section><dialog id="confirm-dialog"><h2 id="dialog-title"></h2><p id="dialog-text"></p><input id="dialog-input" maxlength="80" hidden><div class="pager"><button data-action="dialog-cancel">取消</button><button class="primary" data-action="dialog-confirm">确认</button></div></dialog>
  </section>`;
  const $ = selector => root.querySelector(selector);
  const key = 'accoding-modern.classes.v1';
  let classes = [], currentId = '', sheets = [], preview = null, contest = null, rank = null, summary = null;
  let activeStudent = null, submissionCache = null, memberPage = 0, submissionPage = 0, generation = 0;
  let rankController = null, subController = null, dialogAction = null, opener = null;
  let submissionRequest = null, submissionError = '', acceptedPage = 0;
  let clockOffset = 0;
  let upsolve = null, upsolveController = null, pageMode = 'contest', rankingPage = 0;
  const isUpsolve = () => pageMode === 'upsolve';
  let storageError = '';
  try {const saved = JSON.parse(localStorage.getItem(key) || '{"version":1,"classes":[]}');
    if (saved.version !== 1 || !Array.isArray(saved.classes) || saved.classes.some(c => !c.id || !c.name || !Array.isArray(c.members))) throw new Error('格式无效');
    classes = saved.classes;
  } catch (e) {storageError = '本地班级数据无法读取，已停止写入，避免覆盖原名册。请先备份浏览器数据。';}
  const selected = () => classes.find(c => c.id === currentId);
  function notice(text, error = false) {$('#message').textContent = text; $('#message').hidden = !text; $('#message').classList.toggle('error', error);}
  function persist(next) {
    if (storageError) throw new Error(storageError);
    localStorage.setItem(key, JSON.stringify({version:1, classes:next})); classes = next;
  }
  function el(tag, text, cls) {const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n;}
  function option(value, text) {const n = el('option', text); n.value = value; return n;}
  function button(text, action) {const n = el('button', text); n.type = 'button'; n.onclick = action; return n;}
  function table(headers, rows) {
    const t = el('table'), head = el('thead'), hr = el('tr'), body = el('tbody');
    headers.forEach(h => hr.append(el('th', h))); head.append(hr);
    for (const row of rows) {const tr = el('tr'); for (const cell of row) {const td = el('td'); td.append(cell instanceof Node ? cell : document.createTextNode(String(cell ?? '—'))); tr.append(td);} body.append(tr);}
    if (!rows.length) {const tr=el('tr'), td=el('td','没有符合条件的记录','empty');td.colSpan=headers.length;tr.append(td);body.append(tr);}
    t.append(head, body); return t;
  }
  function pager(target, count, page, change) {
    target.replaceChildren(); const pages = Math.max(1, Math.ceil(count / 30));
    const prev = button('上一页', () => change(page - 1)), next = button('下一页', () => change(page + 1));
    prev.disabled = page <= 0; next.disabled = page >= pages - 1;
    target.append(el('span', `共 ${count} 条 · ${page + 1} / ${pages}`, 'muted'), prev, next);
  }
  const reviewPanel=createAiReviewPanel($('#review-pane'),reviewCore,()=>({classId:currentId,className:selected()?.name,contest,summary,generation}),null,{loadContestSubmissions:reviewContestSubmissions});
  const problemReviewPanel=createAiReviewPanel($('#problem-review-content'),reviewCore,()=>({classId:currentId,className:selected()?.name,contest,summary,generation}),null,{problemList:true,loadContestSubmissions:reviewContestSubmissions});
  function resetContest() {
    reviewPanel.reset();
    problemReviewPanel.setActive(false);problemReviewPanel.reset();$('#problem-review-page').hidden=true;
    generation++; upsolveController?.abort();upsolveController=null;upsolve=null;rankingPage=0;drawStandings();$('#upsolve-time').textContent='';$('[data-action=upsolve]').disabled=true;$('[data-action=cancel-upsolve]').hidden=true;$('#submission-scope').value='contest';for(const o of $('#submission-scope').options)o.disabled=o.value!=='contest';$('#student-problems').hidden=true; rankController?.abort(); subController?.abort(); rankController = subController = null;
    contest = rank = summary = activeStudent = submissionCache = null; memberPage = submissionPage = 0;
    submissionRequest=null;submissionError='';acceptedPage=0;
    $('#accepted-panel').hidden=true;$('#accepted-problem').replaceChildren(option('','选择一道题'));
    $('#accepted-search').value='';drawAccepted();
    $('#student-panel').hidden = $('#stats-panel').hidden = true; $('#contest-title').textContent = '';
    $('#score-export-format').value = 'xlsx'; $('#score-export-format').disabled = true; $('[data-action="export-score"]').disabled = true;
    $('[data-action="load"]').disabled = $('[data-action="refresh"]').disabled = false;
  }
  function drawClasses() {
    if (!selected()) currentId = classes[0]?.id || '';
    $('#class-select').replaceChildren(...(classes.length ? classes.map(c => option(c.id, `${c.name} · ${c.members.length} 人`)) : [option('', '尚未创建班级')]));
    $('#class-select').value = currentId;
    $('#workspace').hidden = !selected(); $('#empty').hidden = !!selected();
    for (const action of ['rename','delete','export']) $(`[data-action="${action}"]`).disabled = !selected();
    drawMembers(); drawStats();
  }
  function drawStats() {
    const c = selected(); if (!c) return;
    const values = [['班级人数', c.members.length], ['榜单已匹配', summary ? summary.matched : '—'], ['有通过的同学', summary ? summary.rows.filter(m=>m.accepted > 0).length : '—'], ['待核对学号', summary ? summary.missing + summary.ambiguous : '—']];
    $('#metrics').replaceChildren(...values.map(([label,value]) => {const card=el('div',null,'metric'); card.append(el('span',label,'muted'),el('strong',value)); return card;}));
    const scoreReady = !!(contest && summary);
    $('#score-export-format').disabled = !scoreReady; $('[data-action="export-score"]').disabled = !scoreReady;
    $('#stats-panel').hidden = !summary || contestCore.phase(contest, Date.now() + clockOffset).key === 'upcoming';
    if (!summary) return;
    $('#chart-legend').textContent='蓝色：通过人数　浅蓝：尝试人数';
    $('#chart').replaceChildren(...summary.stats.map(p => {
      const card=el('div',null,'problem'), bar=el('div',null,'bar'), tried=el('i'), ac=el('em'), counts=el('div',null,'counts');
      tried.style.width=`${100*p.tried/c.members.length}%`; ac.style.width=`${100*p.accepted/c.members.length}%`; bar.append(tried,ac);
      counts.append(el('span',`${p.accepted} 人通过`),el('span',`${p.tried} 人尝试`));
      const view=button('查看通过提交',()=>{ $('#accepted-problem').value=p.id;$('#accepted-problem').dispatchEvent(new Event('change'));$('#accepted-panel').scrollIntoView({behavior:'smooth',block:'start'}); });
      view.style.marginTop='10px';view.setAttribute('aria-label',`查看 ${p.label} 题的通过提交`);
      card.append(el('b',p.label),el('small',p.title),bar,counts,view); card.title=p.title;return card;
    }));
  }
  function drawMembers() {
    const c=selected();if(!c)return;
    const q=$('#search').value.trim().toLowerCase(), filter=$('#member-filter').value;
    const all=summary?.rows || c.members.map(m=>({...m,status:'unloaded'}));
    const rows=core.sortMembers(all.filter(m=>(filter==='all'||m.status===filter)&&`${m.name} ${m.studentId} ${m.group}`.toLowerCase().includes(q)));
    memberPage=Math.min(memberPage,Math.max(0,Math.ceil(rows.length/30)-1));
    $('#members').replaceChildren(table(['学号','姓名','行政班级','匹配状态','赛时通过 / 尝试题数','提交记录'],rows.slice(memberPage*30,memberPage*30+30).map(m=>{
      const detail=button('查看提交',()=>showStudent(m));detail.disabled=!m.userId;
      return [m.studentId,m.name,m.group||'—',{matched:'已匹配',missing:'榜单未找到',ambiguous:'学号冲突',unloaded:'未读取比赛'}[m.status],m.userId?`${m.accepted} / ${m.tried}`:'—',detail];
    })));
    pager($('#member-pager'),rows.length,memberPage,page=>{memberPage=page;drawMembers();});
  }
  function switchPane(mode) {
    pageMode=mode;
    for(const name of ['contest','upsolve','review']){
      $(`#${name}-pane`).hidden=name!==mode;
      $(`#${name}-tab`).classList.toggle('primary',name===mode);
      $(`#${name}-tab`).setAttribute('aria-selected',String(name===mode));
    }
    activeStudent=null;$('#student-panel').hidden=true;
    const reviewReady=reviewPanel.setActive(mode==='review');
    if(mode==='upsolve')drawStandings();
    return reviewReady;
  }
  function drawStandings() {
    if(!upsolve){$('#rank-table').replaceChildren(el('div','读取比赛后，更新补题排行榜。','empty'));$('#rank-pager').replaceChildren();return;}
    const query=$('#ranking-search').value.trim().toLowerCase();
    const rows=upsolveCore.standings(upsolve.rows,$('#ranking-order').value).filter(m=>`${m.name} ${m.studentId}`.toLowerCase().includes(query));
    rankingPage=Math.min(rankingPage,Math.max(0,Math.ceil(rows.length/30)-1));
    $('#rank-table').replaceChildren(table(['排名','学号','姓名','赛后补过','累计通过','最后补过',...contest.problems.map(p=>p.label),'记录'],rows.slice(rankingPage*30,rankingPage*30+30).map(m=>{
      const details=button('查看补题',()=>showStudent(m));details.disabled=!m.userId;
      return [el('strong',m.ranking??'—'),m.studentId,m.name,el('strong',m.upsolved??'—','ac'),m.total??'—',m.lastUpsolved?new Date(m.lastUpsolved).toLocaleString():'—',...m.problems.map(p=>{
        if(p.status==='upsolved'){const a=codeLink(p.first.id);a.textContent='补过';a.className='ac';a.title=`${p.title} · ${new Date(p.first.timestamp).toLocaleString()}`;return a;}
        const cell=el('span',p.status==='during'?'赛内 AC':p.status==='unknown'?'待核对':'—',p.status==='during'?'muted':'');cell.title=p.title;return cell;
      }),details];
    })));
    pager($('#rank-pager'),rows.length,rankingPage,page=>{rankingPage=page;drawStandings();});
  }
  function exportScore() {
    if (!selected() || !contest || !summary) return;
    const matrix = core.scoreMatrix(selected().members, summary, contest.problems);
    const {blob, filename} = createClassScoreExport(matrix, selected().name, contest.title, $('#score-export-format').value);
    const url = URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = filename;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readJson(path, signal) {
    const res=await fetch(path,{credentials:'same-origin',cache:'no-store',signal});
    if(!res.ok)throw new Error(`读取失败（HTTP ${res.status}），请检查登录状态和比赛权限。`);
    let data;try{data=contestCore.decode(await res.text());}catch(e){throw new Error('原站未返回可用数据，请检查登录状态或比赛权限。');}
    if(data?.error)throw new Error(String(data.error));return data;
  }
  async function loadContest() {
    if(!selected())return;
    const id=$('#contest-id').value.trim()||$('#contest-select').value;
    if(!/^\d+$/.test(id)){notice('请选择比赛，或输入数字比赛 ID。',true);return;}
    resetContest();const token=generation;const controller=new AbortController();rankController=controller;
    $('[data-action="load"]').disabled=$('[data-action="refresh"]').disabled=true;
    notice('正在读取比赛和榜单…');drawMembers();drawStats();
    const timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const [raw, server]=await Promise.all([readJson(`/api/contests/${id}`,controller.signal),readJson('/api/contests/server_time',controller.signal)]);
      const c=contestCore.normalizeContest(raw), now=contestCore.time(server?.server_time);
      if(!Number.isFinite(now))throw new Error('无法读取服务器时间，请稍后重试。');
      clockOffset=now-Date.now();
      if(token!==generation)return;
      if(contestCore.phase(c,now).key==='upcoming'){
        contest=c;$('#contest-title').textContent=`${c.title} · 比赛未开始`;
        notice('比赛未开始，暂不展示过题统计。');return;
      }
      const data=await readJson(`/api/contests/${id}/rank`,controller.signal);
      if(token!==generation)return;
      const result=core.summarize(selected().members,data,c.problems);
      contest=c;rank=data;summary=result;
      $('#accepted-panel').hidden=false;
      $('#accepted-problem').replaceChildren(option('','选择一道题'),...c.problems.map(p=>option(p.id,p.label+' · '+p.title)));
      drawAccepted();
      if(pageMode==='review')reviewPanel.setActive(true);
      $('[data-action=upsolve]').disabled=Date.now()+clockOffset<c.end;
      $('#contest-title').textContent=`${c.title} · ${contestCore.phase(c,Date.now()+clockOffset).text} · ${new Date().toLocaleTimeString()} 更新`;
      notice('');
      drawStats();drawMembers();
    } catch(e){if(token===generation)notice(e.name==='AbortError'?'读取超时，请重试。':e.message,true);}
    finally{clearTimeout(timeout);if(token===generation){rankController=null;$('[data-action="load"]').disabled=$('[data-action="refresh"]').disabled=false;}}
  }
  async function discoverContests() {
    try {
      const res=await fetch('/contest/index',{credentials:'same-origin',cache:'no-store'});
      const doc=new DOMParser().parseFromString(await res.text(),'text/html'), seen=new Set();
      const items=[option('','选择可见比赛')];
      for(const a of doc.querySelectorAll('a[href]')){
        const url=new URL(a.getAttribute('href'),location.origin), id=url.pathname==='/contest-ng/index.html'?url.hash.match(/^#\/(\d+)/)?.[1]:url.pathname.match(/^\/contest\/(\d+)$/)?.[1];
        if(!id||seen.has(id))continue;seen.add(id);items.push(option(id,a.textContent.trim()));
      }
      $('#contest-select').replaceChildren(...items);
      const current=location.hash.match(/^#\/(\d+)/)?.[1]||location.pathname.match(/^\/contest\/(\d+)/)?.[1];
      if(current){if(!seen.has(current))$('#contest-select').append(option(current,`当前比赛 ${current}`));$('#contest-select').value=current;}
    }catch(e){notice('比赛列表暂时无法读取，可手动输入比赛 ID。',true);}
  }
  function codeLink(id) {
    if(!/^[1-9]\d*$/.test(String(id)))return el('span','—');
    const a=el('a','查看代码');a.href=`/submission/${id}`;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',`查看提交 ${id} 的代码`);return a;
  }
  function contestSubmissions() {
    return (submissionCache||[]).filter(s=>contestCore.time(s.created_at)>=contest.start&&contestCore.time(s.created_at)<contest.end);
  }
  function acceptedRows() {
    if(!summary||!submissionCache||!$('#accepted-problem').value)return [];
    const query=$('#accepted-search').value.trim().toLowerCase();
    return core.problemSubmissions(contestSubmissions(),summary.rows,$('#accepted-problem').value)
      .filter(({member:m})=>`${m.name} ${m.studentId} ${m.group||''}`.toLowerCase().includes(query));
  }
  function acceptedStudents(rows) {
    // Rows are newest first; each student receives one entry, regardless of AC count.
    const seen=new Set();
    return rows.filter(row=>{const id=row.member.userId;if(seen.has(id))return false;seen.add(id);return true;});
  }
  function drawAccepted() {
    const ready=!!(contest&&summary&&$('#accepted-problem').value);
    $('[data-action=refresh-accepted]').disabled=!ready||!!subController;
    $('[data-action=review-problem]').disabled=!ready||!!subController;
    $('#accepted-count').textContent='';$('#accepted-pager').replaceChildren();
    if(!ready||!submissionCache){
      $('#accepted-table').replaceChildren(el('p',!ready?'选择一道题，查看本班通过同学的提交记录。':submissionError||'正在读取本场比赛的提交记录…',submissionError&&ready?'bad':'muted'));
      return;
    }
    const all=acceptedRows(), students=acceptedStudents(all), rows=$('#accepted-mode').value==='all'?all:students;
    $('#accepted-count').textContent=`${students.length} 位同学 · ${all.length} 条 AC 提交 · 当前显示 ${rows.length} 条`;
    acceptedPage=Math.min(acceptedPage,Math.max(0,Math.ceil(rows.length/30)-1));
    $('#accepted-table').replaceChildren(table(['学号','姓名','行政班级','提交 ID','结果','语言','提交时间','代码','代码复核','记录'],rows.slice(acceptedPage*30,acceptedPage*30+30).map(({member:m,submission:s})=>[
      m.studentId,m.name,m.group||'—',s.id,el('span','AC','ac'),s.lang,new Date(s.created_at).toLocaleString(),codeLink(s.id),button('进入本题核查名单',()=>void openProblemReview()),button('查看该题全部提交',()=>showAcceptedStudent(m))
    ])));
    pager($('#accepted-pager'),rows.length,acceptedPage,page=>{acceptedPage=page;drawAccepted();});
  }
  function showAcceptedStudent(member) {
    void showStudent(member);
    $('#problem-filter').value=$('#accepted-problem').value;$('#result-filter').value='all';drawSubmissions();
  }
  async function showAccepted(force=false) {
    acceptedPage=0;
    if(!contest||!summary||!$('#accepted-problem').value){drawAccepted();return;}
    await loadSubmissionCache(force);
    drawAccepted();
  }
  async function openProblemReview() {
    if(!contest||!summary||!$('#accepted-problem').value)return;
    const token=generation,pid=$('#accepted-problem').value;
    await loadSubmissionCache();
    if(token!==generation||pid!==$('#accepted-problem').value)return;
    if(!submissionCache){notice(submissionError||'无法读取本题提交记录。',true);return;}
    const selected=core.problemReviewSubmissions(contestSubmissions(),summary.rows,pid);
    const p=contest.problems.find(p=>String(p.id)===pid);
    problemReviewPanel.setProblemScope({problemId:pid,submissionIds:selected.map(x=>String(x.submission.id)),title:p?`${p.label} · ${p.title}`:pid,attemptedUsers:new Set(selected.map(x=>String(x.member.userId))).size});
    $('#problem-review-page').hidden=false;$('#problem-review-page').scrollTop=0;
    await problemReviewPanel.setActive(true);
  }
  function drawStudentProblems() {
    const member=upsolve?.rows.find(m=>m.studentId===activeStudent?.studentId);
    $('#student-problems').hidden=!member||!isUpsolve();
    if(!member)return;
    $('#student-problems').replaceChildren(table(['题目','状态','首次赛后通过','代码'],member.problems.map(p=>[
      `${p.label} · ${p.title}`,el('span',{during:'赛内通过',upsolved:'赛后补过',unsolved:'仍未通过',unknown:'待核对'}[p.status],p.status==='upsolved'?'ac':p.status==='unsolved'?'bad':''),
      p.first?new Date(p.first.timestamp).toLocaleString():'—',p.first?codeLink(p.first.id):'—'
    ])));
  }
  async function loadUpsolve() {
    if(!contest||!summary||upsolveController)return;
    const token=generation, previousScope=isUpsolve()?$('#submission-scope').value:'upsolve', controller=new AbortController();upsolveController=controller;
    $('[data-action=upsolve]').disabled=true;$('[data-action=cancel-upsolve]').hidden=false;
    const timeout=setTimeout(()=>controller.abort(),300000);
    try {
      const server=await readJson('/api/contests/server_time',controller.signal), now=contestCore.time(server?.server_time);
      if(!Number.isFinite(now))throw new Error('无法读取服务器时间。');
      const input=$('#upsolve-until').value;
      const until=input?contestCore.time(input.length===16?input+':00':input):now;
      if(!Number.isFinite(until)||until<contest.end||until>now)throw new Error('截止时间须在比赛结束后、当前时间之前。');
      notice('正在查询补题…');
      const result=await upsolveReader.read(contest,summary,until,controller.signal,({pages,finished,total})=>{
        if(token===generation)notice(`查询补题：${finished} / ${total} 题 · ${pages} 页`);
      });
      if(token!==generation)return;
      upsolve=upsolveCore.summarize(summary,contest,result.records,until,result.identities);

      for(const o of $('#submission-scope').options)o.disabled=false;
      $('#upsolve-time').textContent=`截至 ${new Date(until).toLocaleString()}`;
      notice('');drawStandings();
      if(activeStudent){activeStudent=upsolve.rows.find(m=>m.studentId===activeStudent.studentId)||activeStudent;$('#submission-scope').value=previousScope;submissionPage=0;drawStudentProblems();drawSubmissions();}
    }catch(e){controller.abort();if(token===generation)notice(e.name==='AbortError'?'查询已取消或超时，未更新补题结果。':e.message,true);}
    finally{clearTimeout(timeout);if(token===generation){upsolveController=null;$('[data-action=upsolve]').disabled=false;$('[data-action=cancel-upsolve]').hidden=true;}}
  }
  $('#ranking-search').oninput=$('#ranking-order').onchange=()=>{rankingPage=0;drawStandings();};
  $('#submission-scope').onchange=()=>{if(activeStudent)void showStudent(activeStudent,false,true);};
  async function showStudent(member, force=false, preserveScope=false) {
    if(!contest||!member.userId)return;
    activeStudent=member;submissionPage=0;$('#student-panel').hidden=false;
    $('#student-title').textContent=`${member.name} · ${isUpsolve()?'补题记录':'提交记录'}`;
    $('#student-panel').scrollIntoView({behavior:'smooth',block:'start'});
    if(!preserveScope){$('#submission-scope').value=isUpsolve()?'upsolve':'contest';$('#problem-filter').replaceChildren(option('all','全部题目'),...contest.problems.map(p=>option(p.id,p.label+' · '+p.title)));}
    drawStudentProblems();
    if($('#submission-scope').value==='upsolve'&&upsolve){drawSubmissions();return;}
    await loadSubmissionCache(force);
    drawSubmissions();
  }
  async function reviewContestSubmissions(){await loadSubmissionCache();if(!submissionCache)throw Error(submissionError||'无法读取比赛提交');return contestSubmissions();}
  async function loadSubmissionCache(force=false) {
    if(submissionRequest&&!force)return submissionRequest;
    if(submissionCache&&!force)return;
    if(!contest||!summary)return;
    subController?.abort();const controller=new AbortController();subController=controller;const token=generation, cid=contest.id;
    submissionCache=null;submissionError='';drawAccepted();drawSubmissions();
    const timeout=setTimeout(()=>controller.abort(),45000);
    submissionRequest=(async()=>{try {
      // Original Angular factory requests latest=0 for its initial complete submission feed.
      const data=await readJson(`/api/contests/${cid}/submissions?latest=0`,controller.signal);
      if(token!==generation||subController!==controller)return;
      if(!Array.isArray(data))throw new Error('提交记录格式不匹配。');
      // Discard non-roster users and judge detail/source fields immediately.
      const ids=new Set(summary.rows.filter(m=>m.userId).map(m=>m.userId));
      submissionCache=data.filter(s=>ids.has(String(s.creator_id??s.creator?.id))).map(s=>({id:s.id,creator_id:s.creator_id??s.creator?.id,problem_id:s.problem_id,result:s.result,lang:s.lang,score:s.score,created_at:s.created_at}));
    }catch(e){if(token===generation&&subController===controller)submissionError=e.name==='AbortError'?'读取超时，请点击刷新重试。':e.message;}
    finally{clearTimeout(timeout);if(subController===controller){subController=null;submissionRequest=null;drawSubmissions();drawAccepted();}}
    })();
    return submissionRequest;
  }
  function drawSubmissions() {
    if(!activeStudent)return;
    const scope=$('#submission-scope').value;
    if(scope!=='upsolve'&&!submissionCache){$('#submissions').replaceChildren(el('p',submissionError||'正在读取本场比赛的提交记录…',submissionError?'bad':'muted'));$('#submission-pager').replaceChildren();return;}
    const filter=$('#result-filter').value;
    const post=upsolve?.records||[];
    const during=contestSubmissions();
    const all=core.submissions(scope==='upsolve'?post:scope==='all'?[...post,...during]:during,activeStudent.userId), pending=s=>['WT','JG'].includes(s.result)||!s.result;
    const rows=all.filter(s=>($('#problem-filter').value==='all'||String(s.problem_id)===$('#problem-filter').value)&&(filter==='all'||filter==='AC'&&s.result==='AC'||filter==='pending'&&pending(s)||filter==='failed'&&s.result!=='AC'&&!pending(s)));
    submissionPage=Math.min(submissionPage,Math.max(0,Math.ceil(rows.length/30)-1));
    $('#submissions').replaceChildren(table(['提交 ID','题目','结果','得分','语言','提交时间','代码','复核'],rows.slice(submissionPage*30,submissionPage*30+30).map(s=>{
      const p=contest.problems.find(p=>p.id===String(s.problem_id));
      const code=/^[1-9]\d*$/.test(String(s.id)) ? el('a','查看代码') : el('span','—');
      if(code.tagName==='A'){code.href=`/submission/${s.id}`;code.target='_blank';code.rel='noopener noreferrer';code.setAttribute('aria-label',`查看提交 ${s.id} 的代码`);}
      return [s.id,p?`${p.label} · ${p.title}`:String(s.problem_id),el('span',s.result||'待评测',s.result==='AC'?'ac':pending(s)?'pending':'bad'),s.score??'—',s.lang,new Date(s.created_at).toLocaleString(),code,button('查看复核',async()=>{await switchPane('review');await reviewPanel.openDetail(String(s.id));})];
    })));
    pager($('#submission-pager'),rows.length,submissionPage,page=>{submissionPage=page;drawSubmissions();});
  }
  function drawPreview() {
    preview=null;$('[data-action="create"]').disabled=true;
    try {preview=core.roster(sheets[Number($('#sheet').value)].rows);
      $('#preview').replaceChildren(el('p',`共 ${preview.members.length} 人。${preview.warnings.length?` ${preview.warnings.length} 条提示：${preview.warnings.slice(0,5).join('；')}`:''}`),table(['学号','姓名','班级'],preview.members.slice(0,5).map(m=>[m.studentId,m.name,m.group])));
      $('[data-action="create"]').disabled=false;
    }catch(e){$('#preview').replaceChildren(el('p',e.message,'bad'));}
  }
  $('#file').onchange=async()=>{
    preview=null;sheets=[];$('#preview').replaceChildren();$('#sheet').replaceChildren();$('#sheet').disabled=true;$('[data-action="create"]').disabled=true;
    const file=$('#file').files[0];if(!file)return;
    $('#preview').textContent='正在本地读取工作簿…';
    try {const result=await readClassWorkbook(file);if($('#file').files[0]!==file)return;sheets=result;
      $('#sheet').replaceChildren(...sheets.map((s,i)=>option(String(i),s.name)));$('#sheet').disabled=false;
      const index=sheets.findIndex(s=>{try{core.roster(s.rows);return true;}catch{return false;}});$('#sheet').value=String(Math.max(0,index));
      $('#class-name').value=file.name.replace(/\.xlsx?$/i,'');drawPreview();
    }catch(e){if($('#file').files[0]===file)$('#preview').textContent=e.message;}
  };
  $('#sheet').onchange=drawPreview;
  $('#class-select').onchange=()=>{currentId=$('#class-select').value;resetContest();drawClasses();};
  $('#contest-select').onchange=()=>{$('#contest-id').value='';resetContest();drawClasses();};
  $('#contest-id').oninput=()=>{resetContest();drawClasses();};
  $('#search').oninput=$('#member-filter').onchange=()=>{memberPage=0;drawMembers();};
  $('#result-filter').onchange=$('#problem-filter').onchange=()=>{submissionPage=0;drawSubmissions();};
  $('#accepted-problem').onchange=()=>{activeStudent=null;$('#student-panel').hidden=true;void showAccepted();};
  $('#accepted-search').oninput=$('#accepted-mode').onchange=()=>{acceptedPage=0;drawAccepted();};
  function showDialog(title,text,value,action){$('#dialog-title').textContent=title;$('#dialog-text').textContent=text;$('#dialog-input').hidden=value===null;$('#dialog-input').value=value||'';dialogAction=action;$('#confirm-dialog').showModal();if(value!==null)$('#dialog-input').focus();}
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
    try {
      if(action==='close'){$('.overlay').hidden=true;resetContest();opener?.focus();}
      if(action==='import'){$('#import-panel').hidden=false;$('#file').focus();}
      if(action==='cancel-import')$('#import-panel').hidden=true;
      if(action==='create'){
        const name=$('#class-name').value.trim();if(!preview||!name)throw new Error('请填写班级名称并选择有效名册。');
        const c={id:crypto.randomUUID(),name,members:preview.members,createdAt:new Date().toISOString()};persist([...classes,c]);currentId=c.id;resetContest();drawClasses();$('#import-panel').hidden=true;notice(`已创建“${name}”，共 ${c.members.length} 名学生，已保存在本机。`);
      }
      if(action==='rename'&&selected()){const id=currentId;showDialog('重命名班级','请输入新名称。',selected().name,value=>{if(!value.trim())throw new Error('班级名称不能为空。');persist(classes.map(c=>c.id===id?{...c,name:value.trim()}:c));drawClasses();});}
      if(action==='delete'&&selected()){const id=currentId;showDialog('删除本地班级',`删除“${selected().name}”的本地名册？此操作不会修改 OJ。`,null,()=>{persist(classes.filter(c=>c.id!==id));resetContest();drawClasses();notice('已删除本地班级。');});}
      if(action==='dialog-cancel')$('#confirm-dialog').close();
      if(action==='dialog-confirm'){dialogAction?.($('#dialog-input').value);$('#confirm-dialog').close();dialogAction=null;}
      if(action==='export'&&selected()){
        const cell=v=>'"'+String(/^[=+@\-\t\r]/.test(String(v))?"'"+v:v).replaceAll('"','""')+'"';
        const csv='\ufeff'+[['学号','姓名','班级'],...selected().members.map(m=>[m.studentId,m.name,m.group])].map(r=>r.map(cell).join(',')).join('\r\n');
        const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=selected().name.replace(/[\\/:*?"<>|]/g,'_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      if(action==='export-score')exportScore();
      if(action==='load'||action==='refresh')void loadContest();
      if(action==='refresh-submissions'&&activeStudent){if($('#submission-scope').value!=='contest')void loadUpsolve();else void showStudent(activeStudent,true,true);}
      if(action==='upsolve')void loadUpsolve();
      if(action==='refresh-accepted')void showAccepted(true);
      if(action==='review-problem')void openProblemReview();
      if(action==='close-problem-review'){problemReviewPanel.setActive(false);$('#problem-review-page').hidden=true;}
      if(['contest-tab','upsolve-tab','review-tab'].includes(action)){if(action==='review-tab')reviewPanel.setProblemScope(null);switchPane(action.replace('-tab',''));}
      if(action==='cancel-upsolve')upsolveController?.abort();
      if(action==='close-student'){$('#student-panel').hidden=true;activeStudent=null;}
    }catch(e){notice(e.message,true);}
  });
  $('.launch').onclick=()=>{opener=$('.launch');$('.overlay').hidden=false;drawClasses();$('[data-action="close"]').focus();void discoverContests();if(storageError)notice(storageError,true);};
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!$('#confirm-dialog').open){$('.overlay').hidden=true;resetContest();opener?.focus();}
    if(event.key==='Tab'&&!$('.overlay').hidden&&!$('#confirm-dialog').open){const controls=[...$('.overlay').querySelectorAll('button,input,select,a[href]')].filter(e=>!e.disabled&&e.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&root.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('storage',event=>{if(event.key===key){notice('其他页面修改了班级名册，请刷新页面后继续，避免覆盖。',true);storageError='请刷新页面，载入其他页面更新后的班级名册。';}});
}
