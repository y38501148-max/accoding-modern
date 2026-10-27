function mountClassManager(core,contestCore,upsolveCore,upsolveReader,reviewCore){
  if(document.getElementById('am-classes'))return;
  const host=document.createElement('div');host.id='am-classes';document.body.append(host);
  const root=host.attachShadow({mode:'open'}),client=createTeachingClient();
  root.innerHTML=`<style>${ACCODING_TEACHING_CSS}\n${ACCODING_REVIEW_CSS}</style><button class="launch" type="button">教学工作台</button><section class="overlay" hidden aria-label="教学工作台"><div class="shell"><aside class="rail"><a class="brand" href="${accodingPath('/contest/index')}"><b>a/</b><span>OJ Modern<small>教学工作台</small></span></a><nav aria-label="教学导航"></nav><div class="rail-bottom"><a id="admin-link" target="_blank" rel="noopener noreferrer">管理后台 ↗</a></div></aside><div class="content"><header class="top"><div class="filters"><label>课程<select id="course-select" aria-label="课程"></select></label><label>类型<select id="class-type" aria-label="班级类型"><option value="teaching">教师班</option><option value="administrative">行政班</option></select></label><label>班级<select id="class-select" aria-label="当前班级"></select></label></div><div class="actions"><button id="connection-button" type="button">服务设置</button><button class="icon-button" id="close-workspace" type="button" aria-label="关闭教学工作台">关闭</button></div></header><main class="body"><div id="message" class="message" role="status" hidden></div><section id="connection" class="connection" hidden><h2>教学服务</h2><form><label>服务地址<input id="service-url" type="url" required></label><div class="actions"><button type="button" id="cancel-connect">取消</button><button class="primary" type="submit">保存</button></div></form></section><div id="workspace"><div class="heading"><div><h1 id="page-title">班级概览</h1><p id="page-meta"></p></div><div class="actions"><button id="refresh-data" type="button">刷新数据</button><button id="export-data" type="button">导出成绩</button><button id="project-data" type="button">投屏</button></div></div><div id="contest-toolbar" class="toolbar"><div class="filters"><label>比赛<select id="contest-select" aria-label="比赛"></select></label></div><div class="scope"><label><input id="include-retake" type="checkbox">含重修学生</label><label><input id="include-special" type="checkbox">含特殊比赛</label></div></div><div id="contest-tabs" class="tabs" role="tablist" aria-label="比赛分析"></div><div id="page-content"></div><section id="review-pane" class="panel" hidden></section></div></main></div></div><div id="student-drawer" class="drawer" hidden><section class="drawer-content" role="dialog" aria-modal="true" aria-label="学生详情"><header class="drawer-head"><div><h2 id="student-title"></h2><span id="student-id" class="muted"></span></div><button id="close-student">关闭</button></header><div id="student-body" class="drawer-body"></div></section></div><section id="projection" class="projection" hidden aria-label="比赛投屏"></section></section>`;
  const $=s=>root.querySelector(s),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const button=(text,fn,cls)=>{const b=make('button',text,cls);b.type='button';b.onclick=()=>run(fn);return b;};
  const select=(id,label,values)=>{const s=make('select');s.id=id;s.setAttribute('aria-label',label);for(const [v,t]of values)s.append(new Option(t,v));return s;};
  const link=(text,href)=>{const a=make('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const prefKey='accoding-modern.teaching.selection.v1';
  let saved=JSON.parse(localStorage.getItem(prefKey)||'{}'),bootstrap=null,members=[],contests=[],data=null,submissions=null,semesterData=null,outcomeData=null,curveData=null,acceptanceData=null;
  let course=saved.course||'',classId=saved.classId||'',type=saved.type||'teaching',cid=saved.cid||'',mode=saved.mode||'overview',tab=saved.tab||'overview';
  let includeRetake=!!saved.includeRetake,includeSpecial=!!saved.includeSpecial,generation=0,controller=null,studentVersion=0,upsolve=null,upsolveController=null,projectTimer=null,liveTimer=null,scoreOrder='score',opener=null,previousOverflow='',memberQuery='',page=0,problemId='',outcomeKind='all';
  const titles={overview:'班级概览',contest:'比赛分析',semester:'学期分析',upsolve:'补题排行榜',review:'代码复核'};
  const options=(s,rows,value)=>{s.replaceChildren(...rows.map(([v,t])=>new Option(t,v)));s.value=value;};
  const currentClass=()=>bootstrap?.classes.find(k=>k.id===classId),currentCourse=()=>bootstrap?.courses.find(c=>c.id===course);
  const classLabel=name=>bootstrap?.classes.find(k=>k.courseId===course&&k.type===type&&k.name===name)?.label||name;
  const isCollected=()=>['verified','live'].includes(contests.find(c=>c.id===cid)?.state);
  const selectedMembers=()=>members.filter(m=>includeRetake||!m.isRetake);
  const query=()=>({course,class_id:classId,klass_type:type,include_retake:includeRetake,include_special:includeSpecial});
  const save=()=>localStorage.setItem(prefKey,JSON.stringify({course,classId,type,cid,mode,tab,includeRetake,includeSpecial}));
  const number=(v,digits=1)=>v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:digits});
  const stamp=v=>v?new Date(/[zZ]|[+]\d\d:\d\d$/.test(v)?v:v.replace(' ','T')+'+08:00').toLocaleString('zh-CN',{hour12:false}):'尚未同步';
  function notice(text,error=false){$('#message').textContent=text;$('#message').hidden=!text;$('#message').classList.toggle('error',error);}
  async function run(fn){try{await fn();}catch(e){if(e.name!=='AbortError')notice(e.message,true);}}
  function reset(){clearTimeout(liveTimer);liveTimer=null;generation++;controller?.abort();controller=new AbortController();upsolveController?.abort();upsolveController=null;data=submissions=semesterData=outcomeData=curveData=acceptanceData=upsolve=null;studentVersion++;$('#student-drawer').hidden=true;review.setActive(false);review.reset();}
  function request(path,extra={}){return client.request(path,{query:query(),signal:controller?.signal,...extra});}
  function table(headers,rows){const wrap=make('div',null,'table-wrap'),t=make('table'),head=make('thead'),tr=make('tr'),body=make('tbody');headers.forEach(h=>tr.append(make('th',h)));head.append(tr);for(const values of rows){const tr=make('tr');for(const value of values){const td=make('td');if(value instanceof Node)td.append(value);else td.textContent=value??'—';tr.append(td);}body.append(tr);}if(!rows.length){const tr=make('tr'),td=make('td','暂无符合条件的记录','empty');td.colSpan=headers.length;tr.append(td);body.append(tr);}t.append(head,body);wrap.append(t);return wrap;}
  function panel(title,...children){const p=make('section',null,'panel');if(title){const head=make('div',null,'panel-head');head.append(make('h2',title));p.append(head);}p.append(...children);return p;}
  function metricCards(values){const cards=make('div',null,'cards');for(const [label,value,note]of values){const card=make('div',null,'metric');card.append(make('span',label),make('strong',value));if(note)card.append(make('small',note));cards.append(card);}return cards;}
  function tag(text,kind=''){return make('span',text,'tag '+kind);}
  function pagination(rows,render,size=20){const body=make('div');const draw=()=>{page=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1));body.replaceChildren(render(rows.slice(page*size,(page+1)*size)));const pager=make('div',null,'pager'),prev=button('上一页',()=>{page--;draw();}),next=button('下一页',()=>{page++;draw();});prev.disabled=page===0;next.disabled=(page+1)*size>=rows.length;pager.append(make('span',`共 ${rows.length} 条 · ${page+1} / ${Math.max(1,Math.ceil(rows.length/size))}`),prev,next);body.append(pager);};draw();return body;}
  const review=createAiReviewPanel($('#review-pane'),reviewCore,()=>({classId:classId||'course:'+course,className:currentClass()?.name||currentCourse()?.name,contest:modernContest(),summary:reviewSummary(),generation,contestNames:Object.fromEntries(contests.map(c=>[c.id,c.title]))}),null,{loadContestSubmissions:loadSubmissions});
  function modernContest(){return data?{id:cid,title:data.name,start:contestCore.time(data.start_time),end:contestCore.time(data.end_time),problems:data.problems.map(p=>({id:String(p.problem_id),label:p.order_letter,rankKey:p.order_letter,title:p.title,maxScore:p.max_score}))}:null;}
  function reviewSummary(){const byId=new Map((data?.scores||[]).map(r=>[r.student_id,r]));return {rows:selectedMembers().map(m=>{const details=data?.problemResults[m.studentId]||{},r=byId.get(m.studentId);return {...m,status:m.userId?'matched':'missing',details,accepted:Object.values(details).filter(p=>p.result==='AC').length,tried:Object.keys(details).length,totalScore:r?.total_score};})};}
  for(const [key,icon]of [['overview','grid'],['contest','contest'],['semester','submission'],['upsolve','problem'],['review','search']]){const b=button(titles[key],()=>{if(key==='review')review.setProblemScope(null);return navigate(key);});b.dataset.page=key;b.prepend(workspaceIcon(icon));$('.rail nav').append(b);}
  for(const [key,title]of [['overview','总览'],['scores','成绩表'],['problems','逐题分析'],['process','过程与对比']]){const b=button(title,async()=>{tab=key;page=0;save();await loadTab();draw();});b.dataset.tab=key;b.setAttribute('role','tab');$('#contest-tabs').append(b);}
  function updateSelectors(){
    options($('#course-select'),bootstrap.courses.map(c=>[c.id,c.name+(c.archived?' · 已归档':'')]),course);$('#class-type').value=type;
    const klasses=bootstrap.classes.filter(k=>k.courseId===course&&k.type===type&&!k.archived);
    if(!klasses.some(k=>k.id===classId))classId='';
    options($('#class-select'),[['',klasses.length?'全部班级':'暂无班级'],...klasses.map(k=>[k.id,k.label])],classId);
    options($('#contest-select'),contests.length?contests.map(c=>[c.id,c.title+(c.state==='live'?' · 进行中':c.state==='oj'?' · 未采集':'')]):[['','暂无比赛']],cid);
    $('#admin-link').href=client.base()+'/';
    $('#include-retake').checked=includeRetake;$('#include-special').checked=includeSpecial;
    host.dispatchEvent(new Event('am-class-change'));save();
  }
  async function connectExisting(){reset();const token=generation;notice('正在连接教学服务…');try{const [b,groups]=await Promise.all([client.request('/bootstrap',{signal:controller.signal}),client.groups(controller.signal)]);if(token!==generation)return;const visibleCourses=groups.map(g=>{const c=b.courses.find(c=>c.groupId===g.id);return c?{...c,name:g.name}:{id:'oj-group:'+g.id,groupId:g.id,name:g.name,pendingSync:true};});bootstrap={...b,courses:visibleCourses};if(!visibleCourses.some(c=>c.id===course))course=visibleCourses.find(c=>!c.archived&&b.classes.some(k=>k.courseId===c.id&&!k.archived))?.id||visibleCourses.find(c=>!c.archived)?.id||visibleCourses[0]?.id||'';$('#connection').hidden=true;$('#workspace').hidden=false;updateSelectors();await loadScope();}catch(e){if(token!==generation||e.name==='AbortError')return;bootstrap=null;members=[];contests=[];$('#workspace').hidden=true;showConnection();notice(e.message,true);}}
  function showConnection(){$('#connection').hidden=false;$('#service-url').value=client.base();$('#connection input').focus();}
  async function loadScope(){
    reset();const token=generation;page=0;notice('正在读取后台班级与比赛…');
    if(!course||currentCourse()?.pendingSync){members=[];contests=[];cid='';updateSelectors();notice(course?'':'暂无可管理小组');draw();return;}
    // Class selection is checked again after switching courses.
    if(!bootstrap.classes.some(k=>k.id===classId&&k.courseId===course&&k.type===type&&!k.archived))classId='';
    const [result,roster,discovered]=await Promise.all([request('/contests',{query:{course,include_special:true}}),request('/members',{query:{course,class_id:classId,include_retake:true}}),client.contests(currentCourse().groupId,controller.signal)]);if(token!==generation)return;contests=mergeTeachingContests(discovered,result.contests,includeSpecial);
    if(!contests.some(c=>c.id===cid))cid=contests.find(c=>['verified','live'].includes(c.state))?.id||contests[0]?.id||'';
    members=roster.members;updateSelectors();await loadPage(token);
  }
  const basicPage=()=>mode==='contest'&&tab!=='process';
  const running=()=>data&&contestCore.time(data.start_time)<=Date.now()&&Date.now()<contestCore.time(data.end_time);
  function applyRank(contest,rank){
    const fresh=createTeachingContest(contest,rank,selectedMembers(),currentCourse().groupId,contestCore);
    data={...data,...fresh,classes:data?.classes||[],syncedAt:data?.syncedAt,summary:{...data?.summary,...fresh.summary},liveAt:new Date().toISOString()};
    outcomeData=fresh.outcomes;members=members.map(m=>({...m,userId:fresh.identities[m.studentId]||m.userId}));
  }
  async function readRank(fresh=false){
    const token=generation,current=cid;
    const [contest,rank]=await Promise.all([client.oj('/api/contests/'+current,controller.signal,fresh),client.oj('/api/contests/'+current+'/rank',controller.signal,fresh)]);
    if(token!==generation||current!==cid)return false;applyRank(contest,rank);return true;
  }
  async function loadContest(){if(!cid)return;const token=generation;
    if(!data){
      if(isCollected()){const result=await request('/contests/'+cid);if(token!==generation)return;data=result;}
      else {await readRank();if(token!==generation)return;}
    }
    if(basicPage()&&!data.liveRead&&(running()||contests.find(c=>c.id===cid)?.state==='live')){await readRank(true);if(token===generation)data.liveRead=true;}
  }
  function scheduleLive(){
    clearTimeout(liveTimer);liveTimer=null;
    if(!data||$('.overlay').hidden||document.hidden||!$('#projection').hidden||!basicPage())return;
    const start=contestCore.time(data.start_time),end=contestCore.time(data.end_time),now=Date.now();
    if(now>=end&&(!data.liveAt||Date.parse(data.liveAt)>=end))return;
    liveTimer=setTimeout(()=>run(async()=>{
      if(document.hidden)return;
      if(Date.now()<start){scheduleLive();return;}
      try{if(await readRank(true))drawLive();}finally{scheduleLive();}
    }),now<start?Math.min(30000,start-now):15000);
  }
  function drawLive(){
    const out=$('#page-content'),open=[...out.querySelectorAll('.expand-problem[aria-expanded=true]')].map(b=>b.getAttribute('aria-label')),attendance=out.querySelector('.attendance-details')?.open;
    const focus=root.activeElement,key=focus?.getAttribute('aria-label'),caret=focus?.selectionStart;
    draw();for(const b of out.querySelectorAll('.expand-problem'))if(open.includes(b.getAttribute('aria-label')))b.click();
    const details=out.querySelector('.attendance-details');if(details)details.open=!!attendance;
    const next=key?[...out.querySelectorAll('input,select')].find(n=>n.getAttribute('aria-label')===key):null;
    if(next){next.focus();if(caret!=null)next.setSelectionRange(caret,caret);}
  }
  async function loadSubmissions(){if(submissions)return submissions;const token=generation;const result=await request('/contests/'+cid+'/submissions');if(token!==generation)throw new DOMException('已切换范围','AbortError');submissions=result.submissions;return submissions;}
  async function loadTab(){const token=generation;await loadContest();if(!data||token!==generation)return;if(mode==='contest'&&tab==='problems'&&classId&&!outcomeData){const result=await request('/contests/'+cid+'/problems');if(token===generation)outcomeData=result;}
    if(mode==='contest'&&tab==='problems'&&isCollected()&&!acceptanceData){const result=await request('/contests/'+cid+'/acceptance-curves');if(token===generation)acceptanceData=result;}
    if(mode==='contest'&&tab==='process'&&!curveData){const result=await request('/contests/'+cid+'/curves');if(token===generation)curveData=result;}}
  async function loadPage(token=generation){
    if(cid&&!isCollected()){if(['review','semester','upsolve'].includes(mode))mode='contest';if(tab==='process')tab='overview';save();}
    notice('正在读取教学数据…');$('#page-content').replaceChildren(make('div','正在加载…','empty'));
    try{if(mode==='semester'){const result=await request('/semester');if(token===generation)semesterData=result;}else if(cid){await loadTab();}if(token!==generation)return;notice('');draw();}
    catch(e){if(token!==generation||e.name==='AbortError')return;draw();notice(e.message,true);}
  }
  async function navigate(next){if(next==='review'&&mode!=='contest')review.setProblemScope(null);mode=next;page=0;save();await loadPage();}
  function draw(){
    scheduleLive();$('#page-title').textContent=titles[mode];$('#page-meta').textContent=[currentCourse()?.semester,currentClass()?.label||'全部班级',data?(basicPage()&&data.liveAt?`更新于 ${stamp(data.liveAt)}`:isCollected()?`同步于 ${stamp(data.syncedAt)}`:'OJ 榜单'):''].filter(Boolean).join(' · ');
    for(const b of root.querySelectorAll('[data-page]')){b.disabled=!!cid&&!isCollected()&&['review','semester','upsolve'].includes(b.dataset.page);if(b.dataset.page===mode)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    for(const b of root.querySelectorAll('[data-tab]')){b.disabled=b.dataset.tab==='process'&&!isCollected();b.setAttribute('aria-selected',String(b.dataset.tab===tab));}
    $('#contest-toolbar').hidden=mode==='overview';$('#contest-select').closest('label').hidden=mode==='semester';$('#contest-tabs').hidden=mode!=='contest';$('#review-pane').hidden=mode!=='review';$('#export-data').hidden=!['contest','semester'].includes(mode);$('#export-data').disabled=mode==='contest'&&(!data||!isCollected());$('#project-data').hidden=mode!=='contest';$('#project-data').disabled=!data||!isCollected();
    const out=$('#page-content');out.hidden=mode==='review';out.replaceChildren();
    review.setActive(mode==='review'&&!!data&&isCollected());
    if(!bootstrap?.classes.some(k=>k.courseId===course&&!k.archived)){const empty=make('div',null,'empty');empty.append(make('p',currentCourse()?.pendingSync?'暂无同步数据':'暂无班级'),currentCourse()?.pendingSync?link('在 OJ 中查看',accodingPath('/group/'+currentCourse().groupId+'/index')):link('前往管理后台',client.base()+'/'));out.append(empty);return;}
    if(mode==='overview')drawOverview(out);
    if(mode==='contest'){if(!data){out.append(make('div','暂无已同步比赛','empty'));return;}if(tab==='overview')drawContestOverview(out);if(tab==='scores')drawScores(out);if(tab==='problems')drawProblems(out);if(tab==='process')drawProcess(out);}
    if(mode==='semester')drawSemester(out);
    if(mode==='upsolve')drawUpsolve(out);
    if(mode==='review'&&!data)out.append(make('div','选择已同步的比赛后查看代码复核','empty'));
  }
  function drawOverview(out){const rows=selectedMembers(),matched=rows.filter(m=>m.userId).length;
    out.append(metricCards([['班级成员',rows.length],['已匹配 OJ',matched],['课程比赛',contests.length],['最近均分',number(data?.summary.average_score),data?data.name:'暂无比赛数据']]));
    const recent=make('div',null,'mini-list');for(const c of contests.slice(0,5)){const b=button('',async()=>{cid=c.id;reset();mode='contest';tab='overview';save();await loadPage();});b.append(make('span',c.title),tag(c.state==='verified'?'已核实':c.state==='live'?'进行中':'未采集',c.state==='verified'?'success':''));recent.append(b);}if(!contests.length)recent.append(make('p','暂无比赛','muted'));
    const col=make('div',null,'columns');col.append(panel('班级成员',memberList(rows)),panel('最近比赛',recent));out.append(col);
  }
  function studentAction(m){const b=button('查看学生',()=>showStudent(m),'link');b.disabled=!isCollected();return b;}
  function memberList(rows){const input=make('input');input.type='search';input.placeholder='搜索姓名、学号';input.setAttribute('aria-label','搜索成员');input.value=memberQuery;const body=make('div');const draw=()=>{const q=input.value.trim().toLowerCase();body.replaceChildren(pagination(rows.filter(m=>`${m.studentId} ${m.name}`.toLowerCase().includes(q)),items=>table(['学号','姓名','OJ 关联','操作'],items.map(m=>[m.studentId,m.name,m.userId?tag('已匹配','success'):tag('未匹配','warning'),studentAction(m)]))));};input.oninput=()=>{memberQuery=input.value;page=0;draw();};draw();const wrap=make('div');wrap.append(input,body);return wrap;}
  function summaryCards(){const s=data.summary;return metricCards([['应到人数',s.expected],['参与人数',s.participated],['未提交',s.unsubmitted],['平均分',number(s.average_score),`${number(s.contest_max_score)} 分制`]]);}
  function problemBars(){const chart=make('div',null,'problem-bars');const total=data.summary.expected;for(const p of data.problems){const row=make('div',null,'problem-row'),label=make('div',null,'problem-label'),bar=make('div',null,'bar'),tried=make('i'),ac=make('b');label.title=p.title;label.append(make('strong',p.order_letter),document.createTextNode(p.title));tried.style.width=(total?100*p.attempted/total:0)+'%';ac.style.width=(total?100*p.accepted/total:0)+'%';bar.title=`${p.accepted} 人通过 · ${p.attempted} 人尝试`;bar.append(tried,ac);row.append(label,bar,make('span',`${p.accepted} / ${p.attempted} 人`,'problem-count'));chart.append(row);}return chart;}
  function drawContestOverview(out){out.append(summaryCards());const chart=panel('逐题通过与尝试',problemBars());const legend=make('div',null,'legend');legend.append(make('span','通过'),make('span','尝试'));chart.querySelector('.panel-head').append(legend);out.append(chart);
    const missing=data.unsubmitted,unmatched=selectedMembers().filter(m=>!m.userId);
    if(missing.length||unmatched.length){
      const details=make('details',null,'attendance-details');
      details.append(make('summary',`未提交 ${missing.length} 人 · 账号未匹配 ${unmatched.length} 人`));
      details.append(table(['学号','姓名','状态','操作'],missing.map(r=>{const m=members.find(m=>m.studentId===r.student_id);return [r.student_id,r.name,!m?.userId?'OJ 账号未匹配':r.participated?'已参赛，零提交':'未参赛',studentAction(m)];})));
      out.append(panel('',details));
    }
  }
  function drawScores(out){
    const form=make('div',null,'toolbar'),input=make('input');input.type='search';input.placeholder='搜索姓名、学号';input.setAttribute('aria-label','搜索成绩');input.value=memberQuery;
    const state=select('score-status','成绩筛选',[['all','全部学生'],['missing','未提交'],['unmatched','学号未匹配']]);state.value=outcomeKind;
    const order=select('score-order','成绩排序',[['score','按总分 · 同分并列'],['oj','按 OJ 名次 · 含罚时']]);order.value=scoreOrder;form.append(input,state,order);
    const content=make('div'),byId=new Map(data.scores.map(r=>[r.student_id,r]));
    const ranked=()=>[...selectedMembers()].sort((a,b)=>{const x=byId.get(a.studentId),y=byId.get(b.studentId);return order.value==='oj'?(x?.rank??Infinity)-(y?.rank??Infinity)||a.studentId.localeCompare(b.studentId):(y?.total_score??-Infinity)-(x?.total_score??-Infinity)||(x?.rank??Infinity)-(y?.rank??Infinity)||a.studentId.localeCompare(b.studentId);});
    const draw=()=>{const all=ranked(),ranks=new Map();let previous=null;all.forEach((m,i)=>{const score=byId.get(m.studentId)?.total_score;if(score!=null)ranks.set(m.studentId,score===previous?ranks.get(all[i-1].studentId):i+1);previous=score;});
      const q=input.value.trim().toLowerCase(),rows=all.filter(m=>`${m.studentId} ${m.name}`.toLowerCase().includes(q)&&(state.value==='all'||state.value==='unmatched'&&!m.userId||state.value==='missing'&&data.unsubmitted.some(r=>r.student_id===m.studentId)));
      content.replaceChildren(pagination(rows,items=>table(['范围内位次','学号','姓名','总分 ↓','通过题数',...data.problems.map(p=>p.order_letter),'OJ 名次','操作'],items.map(m=>{const r=byId.get(m.studentId),details=data.problemResults[m.studentId]||{};return [order.value==='score'?ranks.get(m.studentId)??'—':all.indexOf(m)+1,m.studentId,m.name,r?number(r.total_score):'—',Object.values(details).filter(p=>p.result==='AC').length,...data.problems.map(p=>{const d=details[p.order_letter];return !d?make('span','—','muted'):make('span',`${number(d.score)}${d.result==='AC'?' ✓':d.result?' · '+d.result:''}`,d.result==='AC'?'ac':d.score>0?'partial':'bad');}),r?.rank??'—',studentAction(m)];}))));
    };input.oninput=state.onchange=order.onchange=()=>{memberQuery=input.value;outcomeKind=state.value;scoreOrder=order.value;page=0;draw();};draw();out.append(panel('',form,content));
  }
  function drawProblems(out){
    out.append(acceptanceChart());
    const grid=table(['','题号','标题','满分','提交人数','通过人数','通过率','平均分'],data.problems.map(p=>[
      classId?button('▸',()=>{},'expand-problem'):'',p.order_letter,p.title,number(p.max_score),p.attempted,p.accepted,number(100*p.accept_rate)+'%',number(p.average_score)+' / '+number(p.max_score)
    ]));
    grid.classList.add('problem-summary');
    const rows=[...grid.querySelectorAll('tbody>tr')];
    rows.forEach((row,index)=>{const toggle=row.querySelector('button');if(!toggle)return;const p=data.problems[index];toggle.setAttribute('aria-label','展开 '+p.order_letter+' 题');toggle.setAttribute('aria-expanded','false');
      toggle.onclick=()=>run(async()=>{
        const existing=row.nextElementSibling;if(existing?.classList.contains('problem-expanded')){existing.remove();toggle.textContent='▸';toggle.setAttribute('aria-expanded','false');return;}
        const detail=make('tr',null,'problem-expanded'),cell=make('td');cell.colSpan=8;detail.append(cell);row.after(detail);toggle.textContent='▾';toggle.setAttribute('aria-expanded','true');
        const buckets=outcomeData.problems.find(r=>r.order_letter===p.order_letter),columns=make('div',null,'problem-outcomes');
        for(const [key,label]of [['full','满分'],['partial','部分得分'],['zero','提交但未得分'],['missing','未提交']]){
          const box=make('section'),names=make('div',null,'outcome-tags');box.append(make('h3',`${label} · ${buckets[key].length} 人`));
          for(const r of buckets[key]){const m=members.find(m=>m.studentId===r.student_id),code=key==='partial'?r.best_result:r.last_result;let text=r.name;
            if(key==='full'&&r.attempts>1)text+=`（+${r.attempts-1}）`;
            if(key==='partial')text+=` ${code||''} · ${number(r.score_ratio*p.max_score)} 分`;
            if(key==='zero'&&code)text+=' '+code;
            const chip=button(text,()=>showStudent(m),'outcome-tag '+(key==='full'?'ac':key==='missing'?'muted':code==='AC'?'ac':'bad'));chip.title=r.student_id;chip.disabled=!isCollected();names.append(chip);
          }if(!buckets[key].length)names.append(make('span','无','muted'));box.append(names);columns.append(box);
        }
        cell.append(columns);if(!isCollected())return;const actions=make('div',null,'problem-actions'),records=make('details',null,'submission-details');records.append(make('summary','提交记录'));
        actions.append(button('本题代码复核',async()=>{const all=await loadSubmissions(),chosen=core.problemReviewSubmissions(all,reviewSummary().rows,String(p.problem_id));review.setProblemScope({problemId:String(p.problem_id),title:p.order_letter+' · '+p.title,submissionIds:chosen.map(r=>String(r.submission.id)),attemptedUsers:new Set(chosen.map(r=>r.member.userId)).size});await navigate('review');}));
        records.ontoggle=()=>run(async()=>{if(!records.open||records.childElementCount>1)return;const token=generation,all=await loadSubmissions();if(token!==generation||!records.isConnected)return;const submissions=all.filter(r=>String(r.problem_id)===String(p.problem_id));
          const result=select('problem-result-'+p.problem_id,'提交结果',[['ac','通过提交'],['all','全部提交'],['failed','未通过提交']]),scope=select('problem-ac-'+p.problem_id,'通过提交范围',[['latest','每人最新 AC'],['all','全部 AC']]),search=make('input'),list=make('div'),tools=make('div',null,'toolbar');search.type='search';search.placeholder='姓名、学号';search.setAttribute('aria-label','搜索提交学生');tools.append(result,scope,search);records.append(tools,list);
          const draw=()=>{scope.hidden=result.value!=='ac';let visible=submissions.filter(r=>(result.value==='all'||result.value==='ac'&&r.result==='AC'||result.value==='failed'&&r.result!=='AC')&&`${r.name} ${r.studentId}`.includes(search.value.trim()));if(result.value==='ac'&&scope.value==='latest'){const seen=new Set();visible=visible.filter(r=>{if(seen.has(r.studentId))return false;seen.add(r.studentId);return true;});}list.replaceChildren(pagination(visible,items=>submissionTable(items)));};result.onchange=scope.onchange=search.oninput=()=>{page=0;draw();};draw();
        });cell.append(records,actions);
      });
    });out.append(panel('逐题统计',grid));
  }
  const chartColors=['#275ad6','#16765d','#a35caf','#ce8125','#0095a8','#cd5264','#6e6bd4','#628d24','#965f42','#2683ba','#a28b15','#b74e91','#437e67','#a45e36','#6b829b'];
  let chartSerial=0,acceptanceProblemId='';
  function lineChart(labels,series,max=100,config={}){
    const wrap=make('div',null,'chart-wrap');if(!labels.length){wrap.append(make('p','暂无已核实的比赛数据','empty'));return wrap;}
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const bottom=config.tall?312:224,min=config.min||0;svg.setAttribute('viewBox',`0 0 800 ${bottom+56}`);if(config.tall)svg.classList.add('process-chart');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('line-chart');svg.setAttribute('role','group');svg.setAttribute('tabindex','0');svg.setAttribute('aria-label','趋势图。悬停或点击查看，方向键切换数据点。');
    if(config.minWidth)svg.style.minWidth=config.minWidth+'px';
    const node=(name,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,name);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;};
    const x=i=>48+(labels.length>1?i/(labels.length-1):.5)*732,y=v=>bottom-(Number(v)-min)/(max-min)*(bottom-32);
    for(const value of config.yTicks||[0,1,2,3,4].map(i=>max-(max-min)*i/4)){const yy=y(value);svg.append(node('line',{x1:48,y1:yy,x2:780,y2:yy,stroke:'#e8edf2'}),node('text',{x:38,y:yy+4,'text-anchor':'end'},number(value,1)));}
    svg.append(node('text',{x:48,y:16},config.unit||'%'));
    const clipId='am-chart-'+(++chartSerial),defs=node('defs',{}),clip=node('clipPath',{id:clipId});clip.append(node('rect',{x:48,y:32,width:732,height:bottom-32}));defs.append(clip);svg.append(defs);
    const lines=series.map((s,idx)=>{const g=node('g',{'clip-path':`url(#${clipId})`});let path='';s.values.forEach((v,i)=>{if(v==null){path+=' ';return;}path+=(i&&s.values[i-1]!=null?(config.step?'H'+x(i)+' V':'L'+x(i)+','):'M'+x(i)+',')+y(v)+' ';});g.append(node('path',{d:path,fill:'none',stroke:s.color||chartColors[idx%chartColors.length],'stroke-width':s.overall?2:2.3,'stroke-dasharray':s.overall?'6 5':s.dash||''}));if(labels.length===1&&s.values[0]!=null)g.append(node('circle',{cx:x(0),cy:y(s.values[0]),r:4,fill:s.color||chartColors[idx%chartColors.length]}));svg.append(g);return g;});
    labels.forEach((label,i)=>{if(config.tickEvery?i%config.tickEvery!==0:labels.length>10&&i%Math.ceil(labels.length/8)!==0&&i!==labels.length-1)return;svg.append(node('text',{x:x(i),y:bottom+28,'text-anchor':'middle'},label.length>12?label.slice(0,11)+'…':label));});
    svg.append(node('text',{x:414,y:bottom+51,'text-anchor':'middle'},config.axis||'比赛场次'));
    const cursor=node('g',{'clip-path':`url(#${clipId})`});cursor.style.display='none';svg.append(cursor);const tip=make('div',null,'chart-tooltip');tip.hidden=true;tip.setAttribute('role','status');wrap.append(svg,tip);
    let active=0;const enabled=series.map(()=>true);
    const show=(i,clientX,clientY)=>{active=i;cursor.replaceChildren(node('line',{x1:x(i),x2:x(i),y1:25,y2:bottom,stroke:'#8494ab','stroke-width':1}));cursor.style.display='';
      series.forEach((s,k)=>{if(enabled[k]&&s.values[i]!=null)cursor.append(node('circle',{cx:x(i),cy:y(s.values[i]),r:4,fill:s.color||chartColors[k%chartColors.length],stroke:'white','stroke-width':2}));});
      const rows=config.rowsAt?config.rowsAt(i):series.map((s,k)=>({label:s.name,value:s.values[i],color:s.color||chartColors[k%chartColors.length],enabled:enabled[k]})).filter(r=>r.enabled).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)).map(r=>[r.label,number(r.value,3)+(config.suffix||''),r.color]);
      tip.replaceChildren(make('strong',config.titleAt?config.titleAt(i):labels[i]));for(const [label,value,color]of rows){const row=make('div',null,'tooltip-row'),name=make('span',label);if(color){const dot=make('i');dot.style.background=color;name.prepend(dot);}row.append(name,make('b',value));tip.append(row);}tip.hidden=false;
      const rect=svg.getBoundingClientRect(),px=clientX??rect.left+x(i)/800*rect.width,py=clientY??rect.top+50;tip.style.left=Math.max(12,Math.min(px+18,window.innerWidth-tip.offsetWidth-16))+'px';tip.style.top=Math.max(12,Math.min(py+16,window.innerHeight-tip.offsetHeight-16))+'px';
    };
    svg.onpointermove=svg.onpointerdown=e=>{const r=svg.getBoundingClientRect();show(Math.max(0,Math.min(labels.length-1,Math.round(((e.clientX-r.left)/r.width*800-48)/732*(labels.length-1)))),e.clientX,e.clientY);};
    const hide=()=>{tip.hidden=true;cursor.style.display='none';};svg.onpointerleave=hide;svg.onblur=hide;svg.onfocus=()=>show(active);svg.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape')hide();else show(e.key==='Home'?0:e.key==='End'?labels.length-1:Math.max(0,Math.min(labels.length-1,active+(e.key==='ArrowLeft'?-1:1))));}};
    if(series.length>1){const legend=make('details',null,'chart-legend');legend.open=!!config.legendOpen;legend.append(make('summary',`图线开关 · ${series.length} 条`));const toggles=make('div',null,'filters');series.forEach((s,i)=>{const label=make('label'),check=make('input');check.type='checkbox';check.checked=true;label.style.color=s.color||chartColors[i%chartColors.length];label.append(check,document.createTextNode(s.name));check.onchange=()=>{enabled[i]=check.checked;lines[i].style.display=check.checked?'':'none';hide();};toggles.append(label);});legend.append(toggles);wrap.append(legend);}
    return wrap;
  }
  function acceptanceChart(){
    const box=panel('逐题过题曲线');box.id='problem-acceptance';
    if(!acceptanceData){box.append(make('p',isCollected()?'过题曲线尚未加载，请刷新数据。':'采集比赛后可查看过题曲线。','muted'));return box;}
    box.append(make('p','每人每题仅计赛内首次 AC · 每分钟累计','muted'));
    if(!acceptanceData.series.length)return box;
    if(!acceptanceData.series.some(p=>p.id===acceptanceProblemId))acceptanceProblemId=acceptanceData.series[0].id;
    const choose=select('acceptance-problem','过题曲线题目',acceptanceData.series.map(p=>[p.id,p.label+' · '+p.title]));choose.value=acceptanceProblemId;
    const label=make('label','题目');label.append(choose);box.querySelector('.panel-head').append(label);
    const content=make('div');box.append(content);
    const draw=()=>{const problem=acceptanceData.series.find(p=>p.id===choose.value);acceptanceProblemId=problem.id;
      const card=make('section',null,'acceptance-problem'),heading=make('div',null,'acceptance-problem-heading');
      heading.append(make('h3',problem.label+' · '+problem.title),make('span',problem.accepted+' 人通过','muted'));
      const scale=acceptanceAxis(problem.accepted);
      const chart=lineChart(acceptanceData.minutes.map(m=>m+' min'),[{name:problem.label+' 题',values:problem.values}],scale.max,{tall:true,tickEvery:10,yTicks:scale.ticks,minWidth:Math.max(800,Math.ceil(acceptanceData.minutes.at(-1)/10)*58),unit:'累计过题人数',suffix:' 人',axis:'比赛时间（分钟）',titleAt:i=>`${problem.label} 题 · 第 ${acceptanceData.minutes[i]} 分钟`});
      chart.querySelector('svg').setAttribute('aria-label',problem.label+' · '+problem.title+'过题曲线。悬停或点击查看，方向键切换分钟。');
      card.append(heading,chart);content.replaceChildren(card);
    };choose.onchange=draw;draw();
    return box;
  }
  function drawProcess(out){
    if(!curveData)return;
    const curves=curveData.curves,series=curves.map((c,i)=>({name:c.is_overall?'全体平均分':classLabel(c.klass),values:c.scores,overall:c.is_overall,color:c.is_overall?'#7c899b':chartColors[(i-1+chartColors.length)%chartColors.length]}));
    const max=Math.max(10,Math.ceil(Math.max(...curves.flatMap(c=>c.scores))/10)*10),finals=curves.filter(c=>!c.is_overall&&c.member_count).map(c=>c.final_score),zoomMin=finals.length?Math.max(0,Math.floor((Math.min(...finals)-5)/5)*5):0;
    const chart=make('div'),scale=select('curve-scale','纵轴范围',[['auto','自动'],['zoom','放大末段']]),tools=make('div',null,'chart-tools'),label=make('label','纵轴');label.append(scale);tools.append(label);
    const draw=()=>chart.replaceChildren(lineChart(curveData.minutes.map(m=>m+' 分'),series,max,{tall:true,min:scale.value==='zoom'?zoomMin:0,unit:'平均分',axis:'比赛时间（分钟）',titleAt:i=>`第 ${curveData.minutes[i]} 分钟 · ${stamp(new Date(new Date(curveData.start_time+'+08:00').getTime()+curveData.minutes[i]*60000).toISOString())}`}));scale.onchange=draw;draw();
    const ranking=make('aside',null,'curve-ranking');ranking.append(make('h3',`最新排名 · ${curves.filter(c=>!c.is_overall).length} 个班`));const ordered=curves.map((c,i)=>({...c,color:series[i].color})).filter(c=>!c.is_overall).sort((a,b)=>b.final_score-a.final_score);ordered.forEach((c,i)=>{const row=make('div',null,'ranking-row');if(c.klass===currentClass()?.name)row.classList.add('selected');const name=make('span',classLabel(c.klass));name.style.borderLeftColor=c.color;row.append(make('small',i+1),name,make('b',number(c.final_score,3)));ranking.append(row);});
    const layout=make('div',null,'curve-layout');layout.append(chart,ranking);out.append(panel('比赛进程 · 班级平均分',tools,layout));
    out.append(panel('班级对比',table(['班级','名册人数','参赛人数','均分','最高分','班级位次'],data.classes.map(c=>[classLabel(c.klass),c.member_count,c.participant_count,number(c.average_score),number(c.best_score),c.rank??'—']))));
  }
  function drawSemester(out){
    if(!semesterData)return;const points=semesterData.trajectory.points,values=points.map(p=>p.average_score==null||!p.contest_max_score?null:100*p.average_score/p.contest_max_score);
    out.append(panel('得分率',lineChart(points.map(p=>'第 '+p.ordinal+' 场'),[{name:'得分率',values}],100,{rowsAt:i=>{const p=points[i];return [['参赛均分 / 满分',number(p.average_score)+' / '+number(p.contest_max_score)],['得分率',number(values[i])+'%'],['参赛 / 名册',p.participant_count+' / '+p.member_count],['同课程班级位次',p.cohort_rank==null?'—':p.cohort_rank+' / '+p.cohort_size]];},titleAt:i=>points[i].contest_name})));
    out.append(panel('学期班级对比',make('p',`${semesterData.summary.contest_count} 场比赛 · 按各场班级位次取平均`,'muted'),table(['班级','名册人数','有效场次','平均班级位次 ↑','最好位次','最差位次'],[...semesterData.summary.rows].sort((a,b)=>(a.average_rank??Infinity)-(b.average_rank??Infinity)).map(r=>[classLabel(r.klass),r.member_count,r.contests,number(r.average_rank,2),r.best_rank??'—',r.worst_rank??'—']))));
    out.append(panel('比赛记录',table(['比赛','参赛均分 / 满分','得分率','参赛人数','班级位次'],points.map((p,i)=>[p.contest_name,number(p.average_score)+' / '+number(p.contest_max_score),values[i]==null?'—':number(values[i])+'%',p.participant_count,p.cohort_rank==null?'—':p.cohort_rank+' / '+p.cohort_size]))));
  }
  function submissionTable(rows){return table(['提交 ID','学生','题目','判定','分数','语言','时间','耗时 / 内存','代码'],rows.map(r=>[r.id,r.name||r.studentId||'—',data.problems.find(p=>String(p.problem_id)===String(r.problem_id))?.order_letter||r.problem_id,make('span',r.result,r.result==='AC'?'ac':'bad'),number(r.score),r.lang,stamp(r.created_at),`${r.time_cost??'—'} ms / ${r.memory_cost??'—'} KB`,link('查看代码',accodingPath('/submission/'+r.id))]));}
  async function showStudent(m){if(!m)return;const version=++studentVersion,token=generation;$('#student-drawer').hidden=false;$('#student-title').textContent=m.name;$('#student-id').textContent=m.studentId+(m.userId?' · OJ '+m.userId:' · OJ 未匹配');const body=$('#student-body');body.replaceChildren(make('div','正在读取学生数据…','empty'));$('#close-student').focus();const result=await request('/students/'+m.studentId,{query:{...query(),contest_id:cid}});if(version!==studentVersion||token!==generation)return;const points=result.trajectory.points,ratios=points.map(p=>p.average_score==null||!p.contest_max_score?null:100*p.average_score/p.contest_max_score);
    body.replaceChildren(panel('得分率',lineChart(points.map(p=>'第 '+p.ordinal+' 场'),[{name:m.name,values:ratios}],100,{titleAt:i=>points[i].contest_name,rowsAt:i=>{const p=points[i];return [['得分 / 满分',number(p.average_score)+' / '+number(p.contest_max_score)],['得分率',ratios[i]==null?'未参赛':number(ratios[i])+'%'],['分数位次（课程名册内）',p.rank_score==null?'—':p.rank_score+' / '+p.contest_participant_count],['OJ 名次（含罚时）',p.absolute_rank??'—'],['超越比例',p.percentile_score==null?'—':number(100*p.percentile_score)+'%']];}})));
    const historyDetails=make('details');historyDetails.append(make('summary','查看历次成绩'),table(['比赛','得分 / 满分','得分率','分数位次（同分并列）','OJ 名次'],points.map((p,i)=>[p.contest_name,number(p.average_score)+' / '+number(p.contest_max_score),ratios[i]==null?'未参赛':number(ratios[i])+'%',p.rank_score==null?'—':p.rank_score+' / '+p.contest_participant_count,p.absolute_rank??'—'])));body.append(panel('',historyDetails));
    const contestSelect=select('student-contest','学生比赛',contests.filter(c=>['verified','live'].includes(c.state)).map(c=>[c.id,c.title]));contestSelect.value=cid;const detail=panel('',contestSelect),records=make('div');detail.append(records);body.append(detail);
    const load=async()=>{const current=contestSelect.value;const [detailData,history]=await Promise.all([request('/students/'+m.studentId,{query:{...query(),contest_id:current}}),request('/contests/'+current+'/submissions')]);if(version!==studentVersion||token!==generation||current!==contestSelect.value)return;const problemSelect=select('student-problem','学生提交题目',[['','全部题目'],...(detailData.problems||[]).map(p=>[p.problem_id,p.order_letter+' · '+p.title])]);const resultSelect=select('student-result','学生提交结果',[['','全部判定'],['AC','通过'],['failed','未通过']]),list=make('div');const draw=()=>{const rows=history.submissions.filter(r=>r.studentId===m.studentId&&(!problemSelect.value||String(r.problem_id)===problemSelect.value)&&(!resultSelect.value||(resultSelect.value==='AC'?r.result==='AC':r.result!=='AC')));list.replaceChildren(pagination(rows,items=>table(['提交 ID','题目','判定','分数','语言','耗时','内存','时间','操作'],items.map(r=>[r.id,r.problem_id,r.result,number(r.score),r.lang,(r.time_cost??'—')+' ms',(r.memory_cost??'—')+' KB',stamp(r.created_at),makeStudentActions(r,current,m)]))));};const tools=make('div',null,'toolbar');tools.append(problemSelect,resultSelect);records.replaceChildren(table(['题目','最终判定','得分 / 满分'],(detailData.problems||[]).map(p=>[p.order_letter+' · '+p.title,p.result_label||'未提交',number(p.score)+' / '+number(p.max_score)])),tools,list);problemSelect.onchange=resultSelect.onchange=()=>{page=0;draw();};draw();};contestSelect.onchange=()=>run(load);if(cid)await load();
  }
  function makeStudentActions(r,current,m){const actions=make('div',null,'actions');actions.append(link('查看代码',accodingPath('/submission/'+r.id)),button('测试点',async()=>{const result=await request('/students/'+m.studentId+'/test-points',{query:{...query(),contest_id:current,problem_id:r.problem_id}});const record=result.submissions.find(s=>String(s.submit_id)===String(r.id));const detail=make('details');detail.open=true;detail.append(make('summary','提交 '+r.id+' · 测试点'),table(['测试点','结果','耗时','内存'],(record?.test_points||[]).map(p=>[p.position,p.label,p.time_ms+' ms',p.memory_kb+' KB'])));actions.replaceChildren(detail);}));return actions;}
  function drawUpsolve(out){const tools=make('div',null,'toolbar'),until=make('input');until.type='datetime-local';until.setAttribute('aria-label','补题截止时间');const order=select('ranking-order','补题排序',[['upsolved','按赛后补过排序'],['total','按累计通过排序']]),search=make('input');search.type='search';search.placeholder='搜索姓名、学号';search.setAttribute('aria-label','搜索补题学生');const box=panel('补题排行榜'),rows=make('div');const load=button('更新排行榜',async()=>{if(!data)throw Error('请先选择已同步比赛');const c=modernContest(),end=until.value?contestCore.time(until.value+':00'):Date.now();if(end<c.end||end>Date.now())throw Error('截止时间须在比赛结束后、当前时间之前');upsolveController?.abort();const ctl=new AbortController(),token=generation;upsolveController=ctl;load.disabled=true;try{const result=await upsolveReader.read(c,reviewSummary(),end,ctl.signal,p=>notice(`正在查询补题 · ${p.finished}/${p.total} 题 · ${p.pages} 页`));if(token!==generation)return;upsolve=upsolveCore.summarize(reviewSummary(),c,result.records,end,result.identities);notice('');draw();}finally{if(token===generation)load.disabled=false;}},'primary');load.disabled=!data;tools.append(until,order,search,load);box.append(tools,rows);const draw=()=>{if(!upsolve){rows.replaceChildren(make('div','设置截止时间后更新排行榜','empty'));return;}const list=upsolveCore.standings(upsolve.rows,order.value).filter(m=>`${m.studentId} ${m.name}`.toLowerCase().includes(search.value.toLowerCase()));rows.replaceChildren(make('p','截至 '+stamp(new Date(upsolve.until).toISOString()),'muted'),pagination(list,items=>table(['排名','学号','姓名','赛后补过','累计通过',...data.problems.map(p=>p.order_letter),'操作'],items.map(m=>[m.ranking,m.studentId,m.name,m.upsolved,m.total,...m.problems.map(p=>p.status==='upsolved'?link('补过',accodingPath('/submission/'+p.first.id)):p.status==='during'?'赛内 AC':'—'),studentAction(m)]))));};order.onchange=search.oninput=()=>{page=0;draw();};draw();out.append(box);}
  async function project(){if(!data)return;clearTimeout(liveTimer);const box=$('#projection');box.hidden=false;const draw=()=>{const head=make('div',null,'projection-header');head.append(make('h1',data.name),button('退出投屏',closeProjection));box.replaceChildren(head,tag(data.liveAt?'更新于 '+stamp(data.liveAt):'同步于 '+stamp(data.syncedAt)),summaryCards(),problemBars());};draw();await box.requestFullscreen?.();projectTimer=setInterval(()=>run(async()=>{if(document.hidden)return;const token=generation;if(running()||data.liveAt&&Date.parse(data.liveAt)<contestCore.time(data.end_time)){if(!await readRank(true))return;}else if(data.source!=='oj'){const next=await request('/contests/'+cid,{cache:false});if(token!==generation)return;data=next;}draw();if(Date.now()>=contestCore.time(data.end_time)){clearInterval(projectTimer);projectTimer=null;}}),15000);}
  function closeProjection(){clearInterval(projectTimer);projectTimer=null;$('#projection').hidden=true;if(document.fullscreenElement===host||document.fullscreenElement===null&&root.fullscreenElement)document.exitFullscreen?.();scheduleLive();}
  function close(){closeProjection();reset();$('.overlay').hidden=true;document.body.style.overflow=previousOverflow;opener?.focus();}
  $('.launch').onclick=()=>{opener=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';$('.overlay').hidden=false;$('#close-workspace').focus();run(connectExisting);};
  $('#close-workspace').onclick=close;$('#connection-button').onclick=showConnection;$('#cancel-connect').onclick=()=>$('#connection').hidden=true;
  $('#connection form').onsubmit=e=>{e.preventDefault();run(async()=>{const submit=e.target.querySelector('[type=submit]');submit.disabled=true;try{await client.connect($('#service-url').value);await connectExisting();}finally{submit.disabled=false;}});};
  $('#course-select').onchange=()=>{course=$('#course-select').value;classId=cid='';run(loadScope);};$('#class-type').onchange=()=>{type=$('#class-type').value;classId='';run(loadScope);};$('#class-select').onchange=()=>{classId=$('#class-select').value;run(loadScope);};$('#contest-select').onchange=()=>{cid=$('#contest-select').value;reset();save();run(loadPage);};
  $('#include-retake').onchange=()=>{includeRetake=$('#include-retake').checked;run(loadScope);};$('#include-special').onchange=()=>{includeSpecial=$('#include-special').checked;run(loadScope);};$('#refresh-data').onclick=()=>run(async()=>{await client.clearCache();await connectExisting();});
  $('#close-student').onclick=()=>{studentVersion++;$('#student-drawer').hidden=true;};$('#student-drawer').onclick=e=>{if(e.target===$('#student-drawer'))$('#close-student').click();};$('#project-data').onclick=()=>run(project);
  $('#export-data').onclick=()=>run(async()=>{const blob=await request('/export/'+(mode==='semester'?'semester':'contest'),{query:{...query(),contest_id:cid},blob:true});const url=URL.createObjectURL(blob),a=link('下载',url);a.download=(currentClass()?.name||currentCourse()?.name)+(mode==='semester'?'-学期分析':'-'+data.name)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#projection').hidden)closeProjection();else if(!$('#student-drawer').hidden)$('#close-student').click();else close();}if(e.key==='Tab'&&!$('.overlay').hidden){const scope=!$('#student-drawer').hidden?$('#student-drawer'):$('.overlay');const controls=[...scope.querySelectorAll('button,input,select,a[href],summary')].filter(n=>!n.disabled&&n.getClientRects().length),first=controls[0],last=controls.at(-1);if(e.shiftKey&&root.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&root.activeElement===last){e.preventDefault();first.focus();}}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&running()&&basicPage()&&!$('.overlay').hidden&&$('#projection').hidden)run(async()=>{if(await readRank(true))drawLive();});else scheduleLive();});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!$('#projection').hidden)closeProjection();});
  options($('#class-select'),[['','未连接教学服务']],'');$('#workspace').hidden=true;
}
