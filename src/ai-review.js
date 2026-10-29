function reviewFilter(select,text){
  const label=document.createElement('label');label.className='ar-filter';
  const title=document.createElement('span');title.textContent=text;label.append(title,select);return label;
}
function createAiReviewPanel(container,core,getContext,_readMetadata,options={}) {
  container.classList.add('ar-root');
  const noteKey='accoding-modern.ai-review.notes.v1';
  let writeToken='';
  let generation=0,controller=null,timer=null,rows=[],page=0,total=0,active=false,detailVersion=0,detailController=null,runs=[],runId='',counts=null,scope=null,listDirty=false,listPosition=null;
  let cursor=null,updateNavigation=()=>{},navigationBusy=false,saving=false,detailResize=null;
  const getToken=()=>writeToken;
  const client=core.featureClient(getToken,typeof reviewFetch==='function'?reviewFetch:fetch,4),size=30;
  const ojSources=new Map();
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  const refill=(s,values,keep=s.value)=>{s.replaceChildren();for(const [value,text] of values){const o=el('option',text);o.value=value;s.append(o);}if([...s.options].some(o=>o.value===keep))s.value=keep;};
  const select=(name,values)=>{const s=el('select');s.setAttribute('aria-label',name);refill(s,values);s.onchange=()=>{page=0;void reload();};return s;};
  const labels=core.humanLabels;
  const stateNames=core.reviewStates;
  const problem=select('复核题目',[['all','全部题目']]);
  const feature=select('代码特征',[['all','全部特征'],...core.featureLabels.map(x=>[x,x])]);
  const state=select('代码状态',options.problemList?[['all','全部代码状态'],...Object.entries(stateNames)]:[['queue','未核查、存疑与有 AI'],['rule_hit_unreviewed','规则命中/未核查'],['reviewed_uncertain','已核查为存疑'],['reviewed_ai','已核查为AI'],['all','全部代码状态'],['reviewed_no_ai','已核查为无AI']]);
  const runHistory=select('核查运行',[['latest','最新完整运行']]);
  const heading=el('h2','代码复核');
  const message=el('p','读取比赛后，打开代码复核。');message.setAttribute('role','status');
  const progress=el('div');progress.className='ar-progress';message.className='ar-message';progress.setAttribute('aria-live','polite');
  const list=el('div');list.className='table-wrap';const pager=el('div');pager.className='pager';const detail=el('section');detail.className='panel'+(options.feedbackOnly?' ar-inline-feedback':'');detail.hidden=true;
  const style=el('style');style.textContent=ACCODING_REVIEW_CSS;
  const controls=el('div');controls.className='ar-toolbar';controls.append(reviewFilter(problem,'题目'),reviewFilter(feature,'代码特征'),reviewFilter(state,'代码状态'),reviewFilter(runHistory,'核查运行'));
  const actions=el('div');actions.className='ar-actions';const exportButton=button('导出 XLSX',()=>void exportRows('xlsx')),jsonButton=button('导出 JSON',()=>void exportRows('json'));actions.append(button('刷新云端结果',()=>void reload()),exportButton,jsonButton);
  const branches=el('div');branches.className='ar-review-nav ar-branches';branches.setAttribute('role','tablist');branches.setAttribute('aria-label','代码复核分支');
  const similarityHost=el('section');similarityHost.hidden=true;similarityHost.id='am-similarity-'+Math.random().toString(36).slice(2);
  similarityHost.className='ar-similarity-panel';
  similarityHost.setAttribute('role','tabpanel');
  const similarityPanel=createCodeSimilarityPanel(similarityHost,core,client,getContext,()=>scope);
  let branch='ai';
  const aiBranch=button('AI 特征复核',()=>chooseBranch('ai')),peerBranch=button('代码查重',()=>chooseBranch('similarity'));
  for(const b of [aiBranch,peerBranch]){b.setAttribute('role','tab');branches.append(b);}
  aiBranch.setAttribute('aria-selected','true');peerBranch.setAttribute('aria-selected','false');peerBranch.setAttribute('aria-controls',similarityHost.id);
  peerBranch.id=similarityHost.id+'-tab';similarityHost.setAttribute('aria-labelledby',peerBranch.id);
  for(const node of [controls,actions,message,progress,list,pager])node.classList.add('ar-branch-content');
  const sidInput=el('input');sidInput.placeholder='提交 ID';sidInput.inputMode='numeric';sidInput.type='number';sidInput.min='1';sidInput.autocomplete='off';sidInput.setAttribute('aria-label','复核提交 ID');
  actions.append(sidInput,button('查看提交',()=>{if(/^[1-9]\d*$/.test(sidInput.value.trim()))void openDetail(sidInput.value.trim());else message.textContent='请输入有效的提交 ID。';}));
  sidInput.hidden=true;actions.lastElementChild.hidden=true;
  if(options.feedbackOnly)container.append(style,detail);
  else {const header=el('header');header.className='ar-panel-head';header.append(heading,actions);container.append(style,header,...(options.submissionId?[]:[branches]),controls,message,progress,list,pager,detail,similarityHost);}
  if(options.submissionId){controls.hidden=actions.hidden=message.hidden=list.hidden=pager.hidden=true;}
  function chooseBranch(value){
    if(value===branch)return;stop();branch=value;detail.hidden=true;
    const peer=value==='similarity';aiBranch.setAttribute('aria-selected',String(!peer));peerBranch.setAttribute('aria-selected',String(peer));
    for(const node of [controls,actions,message,progress,list,pager])node.hidden=peer;
    similarityHost.hidden=!peer;
    if(peer)void similarityPanel.setActive(active);else{similarityPanel.setActive(false);if(active)void refresh();}
  }
  function contextKey(){const c=getContext();return `${c.classId||''}:${c.contest?.id||''}:${c.generation}`;}
  function key(){return contextKey()+':v4:'+runId;}
  function reload(){return options.submissionId?openDetail(options.submissionId):refresh();}
  function stop(){saving=false;detailResize?.disconnect();cursor=null;updateNavigation=()=>{};generation++;controller?.abort();detailVersion++;detailController?.abort();clearTimeout(timer);}
  function reset(){stop();ojSources.clear();similarityPanel.reset();scope=null;listDirty=false;listPosition=null;heading.textContent='代码复核';problem.disabled=false;counts=null;rows=[];runs=[];total=page=0;runId='';refill(runHistory,[['latest','最新完整运行']]);detail.hidden=true;detail.replaceChildren();progress.textContent='';message.textContent='读取比赛后，打开代码复核。';draw();}
  function setProblemScope(next){stop();scope=next?{...next,submissionIds:[...next.submissionIds]}:null;page=0;state.value=(options.problemList||next)?'all':'queue';feature.value='all';problem.value=scope?.problemId||'all';problem.disabled=!!scope;heading.textContent=scope?`本题提交核查 · ${scope.title}`:'代码复核';detail.hidden=true;detail.replaceChildren();}
  function query(c,offset=page*size,limit=size){return {contest_id:Number(c.contest.id),creator_ids:[...core.members(c.summary.rows).keys()],offset,limit,run_id:runId,...(scope?{problem_id:Number(scope.problemId),submission_ids:scope.submissionIds}:problem.value==='all'?{}:{problem_id:Number(problem.value)}),...(feature.value==='all'?{}:{label:feature.value}),...(options.problemList||state.value==='all'||state.value==='reviewed_no_ai'?{}:{review_queue_only:true}),...(state.value==='queue'||state.value==='all'?{}:{review_status:state.value})};}
  function fillRuns(values){const selection=core.selectReviewRun(values,runHistory.value);runs=selection.runs;const next=selection.selected?.run_id||'';if(next!==runId)page=0;runId=next;refill(runHistory,[['latest','最新完整运行'],...runs.map(run=>[run.run_id,`${run.publication_ready===false?'待同步 · ':'历史运行 · '}${run.run_id}`])],selection.explicit?runId:'latest');}
  function selectedRun(){return runs.find(run=>run.run_id===runId);}
  function showProgress(){const pending=runs.filter(run=>run.publication_ready===false),notice=selectedRun()?.publication_ready===false?'当前历史运行待同步：源码、规则或查重尚未完整发布。':pending.length?`${pending.length} 个运行待同步；默认使用最近一次完整发布结果。`:'';progress.replaceChildren();if(notice)progress.append(el('span',notice));if(counts)for(const [key,label]of Object.entries(stateNames)){const pill=el('span',`${label} ${counts[key]||0}`);pill.className='ar-count-pill';pill.dataset.state=key;progress.append(pill);}}
  async function refresh(){
    stop();const v=generation,k=contextKey(),c=getContext();detail.hidden=true;detail.replaceChildren();
    if(!active||!c.contest||!c.summary){message.textContent='请先读取比赛和榜单。';return;}
    refill(problem,[['all','全部题目'],...c.contest.problems.map(p=>[String(p.id),`${p.label} · ${p.title}`])],scope?.problemId||problem.value);
    const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),120000);
    counts=null;showProgress();rows=[];total=0;draw();message.textContent='正在读取云端复核记录…';
    try{
      const combined=client.openList?await client.openList(query(c),runHistory.value,current.signal):null;
      const state=combined||await client.progress(c.contest.id,current.signal);if(v!==generation||k!==contextKey())return;
      fillRuns(state.runs);showProgress();if(!runId){message.textContent=runs.length?'新运行待同步，暂无完整发布结果。可从核查运行中查看同步中的历史。':'尚无核查结果，请先在核查系统发布比赛。';return;}
      if(combined&&combined.offset!==page*size){void refresh();return;}
      const requestKey=key(),result=combined||await client.search(query(c),current.signal);if(v!==generation||requestKey!==key())return;
      const memberMap=core.members(c.summary.rows);rows=result.reviews.map(r=>({...r,member:memberMap.get(String(r.creator_id))}));total=result.total;counts=result.counts||null;showProgress();
      if(total&&page*size>=total){page=Math.floor((total-1)/size);void refresh();return;}
      message.textContent=scope?`${scope.attemptedUsers} 位尝试者按 AC 或最近两次尝试选出 ${scope.submissionIds.length} 条 · 当前显示 ${total} 条`:`${c.className} · ${total} 条`;draw();
    }catch(e){if(v===generation){rows=[];total=0;draw();message.textContent=e.name==='AbortError'?'读取超时，请刷新重试。':e.message;}}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  function judgement(r){return stateNames[r.review_status]||'状态未知';}
  function draw(){
    const top=list.scrollTop,left=list.scrollLeft,table=el('table');table.className='ar-table';const thead=el('thead'),head=el('tr');['提交','学生','题目','提交时间','评测','规则分','代码状态','依据','详情'].forEach(t=>head.append(el('th',t)));thead.append(head);table.append(thead);
    const body=el('tbody');for(const r of rows){const p=getContext().contest?.problems.find(p=>String(p.id)===String(r.problem_id)),tr=el('tr');
      for(const text of [r.submission_id,`${r.member?.name||r.creator_id} · ${r.member?.studentId||''}`,p?`${p.label} · ${p.title}`:r.problem_id,core.beijingTime(r.submitted_at),r.evaluation_result||r.judge_result||r.verdict||r.oj_result||r.submission_result||'—',`${core.scoreSummary(r).raw??'—'}`,judgement(r),r.annotation?r.annotation.reason:(r.result?.label||r.labels||[]).join('；')]){const cell=el('td');if(tr.children.length===6){const state=el('span',text);state.className='ar-state';state.dataset.state=r.review_status;cell.append(state);}else cell.textContent=text;tr.append(cell);}
      const td=el('td');td.append(button('查看 / 修改',()=>void openDetail(r.submission_id)));tr.append(td);body.append(tr);}
    table.append(body);list.replaceChildren(table);list.scrollTop=top;list.scrollLeft=left;pager.replaceChildren(el('span',`共 ${total} 条 · ${page+1} / ${Math.max(1,Math.ceil(total/size))}`));
    const previous=button('上一页',()=>{page--;void refresh();}),next=button('下一页',()=>{page++;void refresh();});previous.disabled=page<=0;next.disabled=(page+1)*size>=total;pager.append(previous,next);
  }
  const pre=text=>{const p=el('pre',text);p.className='ar-source';return p;};
  function comparison(before,after,previousId,currentId,{diff=true,rightTitle,ariaLabel}={}){
    const box=el('div');box.className='ar-compare';box.setAttribute('aria-label',ariaLabel||'本次提交与同题上次提交逐行对照');
    box.append(el('div',`本次提交 #${currentId}`),el('div',rightTitle||(previousId?`上次提交 #${previousId}`:'当前核查快照中无更早提交')));for(const title of box.children)title.className='ar-compare-title';
    if(before!==null&&!diff){const current=after.split('\n'),reference=before.split('\n');for(let i=0;i<Math.max(current.length,reference.length);i++)box.append(cell(current[i]===undefined?null:{text:current[i]},i+1,''),cell(reference[i]===undefined?null:{text:reference[i]},i+1,''));return box;}
    const lines=before===null?after.split('\n').map((text,i)=>({kind:'equal',text,newLine:i+1,oldLine:null})):core.lineDiff(before,after);
    function cell(line,number,kind){const node=el('div');node.className='ar-code-line '+(kind||'');if(line){const num=el('span',String(number));num.className='num';node.append(num,document.createTextNode(line.text||' '));}else node.append(document.createTextNode(' '));return node;}
    let removed=[],added=[];
    function flush(){for(let i=0;i<Math.max(removed.length,added.length);i++)box.append(cell(added[i],added[i]?.newLine,added[i]?'add':''),cell(removed[i],removed[i]?.oldLine,removed[i]?'remove':''));removed=[];added=[];}
    for(const line of lines){if(line.kind==='add')added.push(line);else if(line.kind==='remove')removed.push(line);else{flush();box.append(cell(line,line.newLine,''),cell(before===null?null:line,line.oldLine,''));}}flush();return box;
  }
  async function readOj(id,hash,signal){
    signal?.throwIfAborted();const key=id+':'+hash;
    if(ojSources.has(key))return ojSources.get(key);
    const res=await fetch(`/submission/${id}`,{credentials:'same-origin',cache:'no-store',signal});if(!res.ok)throw Error('OJ 源码读取失败');
    const node=new DOMParser().parseFromString(await res.text(),'text/html').querySelector('pre code');if(!node)throw Error('OJ 未返回源码，请先登录 OJ。');
    const code=await core.sourceFromOj(node.textContent,id,hash);signal?.throwIfAborted();ojSources.set(key,code);
    if(ojSources.size>32)ojSources.delete(ojSources.keys().next().value);return code;
  }
  async function openDetail(id,continuing=false){
    if(!continuing)cursor=core.reviewCursor(rows,page*size,total);
    if(detail.hidden){const overlay=container.closest('.problem-review-page')||container.closest('.overlay');listPosition={listTop:list.scrollTop,listLeft:list.scrollLeft,overlayTop:overlay?.scrollTop||0};}
    saving=false;clearTimeout(timer);detailResize?.disconnect();const n=++detailVersion,base=contextKey();detail.classList.toggle('ar-review-page',!options.feedbackOnly);detail.hidden=false;detail.replaceChildren(el('p','正在读取核查运行…'));detailController?.abort();
    const c=new AbortController(),timeout=setTimeout(()=>c.abort(),120000);detailController=c;
    const valid=()=>n===detailVersion&&base===contextKey();
    try{
      let r;
      if(client.openReview){const opened=await client.openReview(String(id),options.submissionId?'':runId,c.signal);if(!valid())return;if(opened.runs){fillRuns(opened.runs);showProgress();}r=opened.record;}
      else{
        if(options.submissionId||!runId){const state=await client.submissionRuns(String(id),c.signal);if(!valid())return;fillRuns(state.runs);showProgress();}
        r=runId?await client.detail(String(id),runId,c.signal):null;
      }
      if(runId)detail.replaceChildren(el('p','正在读取本场核查结果…'));
      if(!valid())return;
      if(!r&&runId){const source=await client.source(String(id),runId,c.signal);r={...source,run_id:runId,decision_kind:'unflagged',review_status:'rule_unmatched',result:{label:[],reason:'规则未命中；可人工复核并填写理由。'},evidence:[],code:options.feedbackOnly?await core.sourceFromOj(options.ojText,id,source.code_hash):await readOj(id,source.code_hash,c.signal)};}
      if(!valid())return;
      if(r&&options.feedbackOnly)r.code=await core.sourceFromOj(options.ojText,id,r.code_hash);
      else if(r&&typeof r.code!=='string')r.code=await readOj(id,r.code_hash,c.signal);
      if(!valid())return;
      if(r&&!options.submissionId){const ctx=getContext();if(r.contest_id!==Number(ctx.contest.id)||!core.members(ctx.summary.rows).has(String(r.creator_id)))throw Error('详情与当前班级不一致');}
      if(options.feedbackOnly){
        detail.replaceChildren();
        if(selectedRun()?.publication_ready===false)detail.append(el('p','历史运行待同步：当前资料尚未完整发布。'));
        if(!r){detail.append(el('p',runs.some(run=>run.publication_ready===false)?'新运行待同步，当前完整版本中尚无此提交。':'此提交尚未纳入云端源码清单，暂时无法保存 AI 判定。'));return;}
        if(!valid())return;
        const label=el('p',judgement(r));label.dataset.reviewJudgement='1';label.className='ar-verdict';
        const reason=el('p',r.annotation?.reason||r.result?.reason||'规则未命中');reason.dataset.reviewReason='1';detail.append(label,reason);
        if(r.evidence?.length){const evidence=el('details');evidence.append(el('summary','查看规则依据'));for(const e of r.evidence)evidence.append(el('h4',`第 ${e.start_line}–${e.end_line} 行`),pre(e.quote));detail.append(evidence);}
        addSimilarityDetail(detail,r,c.signal,valid);
        await feedbackEditor(r,c.signal,valid);return;
      }
      const close=button('返回列表',()=>void closeDetail(c));
      const head=el('div');head.className='ar-review-head';const title=el('h2',`代码复核 · 提交 #${id}`),nav=el('div');nav.className='ar-review-nav';
      const badge=el('span',r?judgement(r):'状态未知');badge.className='ar-state';badge.dataset.state=r?.review_status||'';badge.dataset.reviewJudgement='1';
      const previous=button('上一份',()=>void turn(-1,id)),next=button('下一份',()=>void turn(1,id));
      updateNavigation=()=>{previous.disabled=saving||navigationBusy||!cursor?.has(id,-1);next.disabled=saving||navigationBusy||!cursor?.has(id,1);};updateNavigation();
      nav.append(previous,next);if(r&&options.loadContestSubmissions)nav.append(button('查看该同学本次比赛提交',()=>void showContestSubmissions(r,valid)));nav.append(button('人工复核',()=>{const editor=detail.querySelector('.ar-feedback-editor');editor?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});editor?.querySelector('.ar-note')?.focus({preventScroll:true});}),badge,close);head.append(title,nav);detail.replaceChildren(head);if(typeof ResizeObserver==='function'){detailResize=new ResizeObserver(()=>{if(!detail.hidden)detail.style.scrollPaddingTop=Math.ceil(head.getBoundingClientRect().height+12)+'px';});detailResize.observe(head);}
      if(!r){detail.append(el('p',runs.some(run=>run.publication_ready===false)?'新运行待同步，当前完整版本中尚无此提交。':'尚无可用结果。请先在核查系统同步此比赛的源码清单。'));return;}
      const content=el('div');content.className='ar-review-content ar-detail-grid';detail.append(content);if(selectedRun()?.publication_ready===false)content.append(el('p','历史运行待同步：当前资料尚未完整发布，请以最近一次完整结果为准。'));
      const member=getContext().summary?core.members(getContext().summary.rows).get(String(r.creator_id)):null;
      const problemName=pid=>{const p=getContext().contest?.problems.find(item=>String(item.id)===String(pid));return p?`${p.label} · ${p.title}`:`题目 ${pid}`;};
      const summary=el('section');summary.className='ar-record-summary';const workspace=el('div');workspace.className='ar-source-workspace';const inspector=el('aside');inspector.className='ar-inspector';content.append(summary,workspace,inspector);
      const meta=el('p',`用户 ${member?.name||r.creator_id} · ${problemName(r.problem_id)} · ${core.beijingTime(r.submitted_at)}`);
      meta.className='ar-record-meta';summary.append(meta,el('p',`评测结果：${r.evaluation_result||r.judge_result||r.verdict||r.oj_result||r.submission_result||'未提供'}`),el('p','命中事实：'+(r.result?.reason||'无')),el('p','规则特征：'+((r.result?.label||[]).join('；')||'无')));
      const compare=el('section'),editorTarget=el('section');editorTarget.className='ar-feedback-editor';workspace.append(el('h3','源码对照'),compare);inspector.append(editorTarget);
      renderScores(inspector,r);const facts=el('details');facts.className='ar-rule-details';facts.append(el('summary','规则依据'));renderRuleFacts(facts,r);inspector.append(facts);renderEvidenceChain(inspector,r);
      addSimilarityDetail(inspector,r,c.signal,valid);
      const editorReady=feedbackEditor(r,c.signal,valid,editorTarget).catch(error=>{if(valid())editorTarget.append(el('p','人工核查读取失败：'+error.message));});
      const pairInfo=core.contestPairNarrative(r),snapshots=[],seenSnapshots=new Set();
      const references=pairInfo?pairInfo.references:[...(r.context_references||[]),...(r.history_hits||[]),...(r.prior_accepted_submissions||[]),...(r.baseline_references||[]),...(r.evidence_chain||[]),...(r.previous_submission?[{...r.previous_submission,kind:'previous'}]:[])];
      for(const ref of references){
        if(!ref.submission_id||!ref.code_hash||String(ref.submission_id)===String(id))continue;
        const key=String(ref.submission_id)+':'+ref.code_hash;if(seenSnapshots.has(key))continue;seenSnapshots.add(key);snapshots.push(ref);
      }
      const currentView=el('div');currentView.dataset.currentSource='1';currentView.append(comparison(null,r.code,null,id,{rightTitle:snapshots.length?`展开${pairInfo?'配对':'历史'}代码对照后显示参考源码`:undefined}));compare.append(currentView);
      if(snapshots.length){
        const history=el('details');history.dataset.historyComparison='1';history.open=true;history.append(el('summary',`${pairInfo?'配对代码对照':'历史代码对照'}（${snapshots.length} 份）`));
        const nav=el('div');nav.className='ar-review-nav';const view=el('div'),position=el('span');view.dataset.historyView='1';view.setAttribute('aria-live','polite');let snapshotPage=0,snapshotVersion=0,historyController=null;
        const loaded=new Map(),backward=button('上一份对照',()=>void showSnapshot(snapshotPage-1)),forward=button('下一份对照',()=>void showSnapshot(snapshotPage+1));
        backward.disabled=true;forward.disabled=snapshots.length===1;position.textContent=`${pairInfo?'配对对照':'历史对照'} 1 / ${snapshots.length}`;
        nav.append(backward,position,forward);history.append(nav,view);compare.append(history);
        history.addEventListener('toggle',()=>{
          if(!valid())return;currentView.hidden=history.open;
          if(history.open)void showSnapshot(snapshotPage);
          else{snapshotVersion++;historyController?.abort();}
        });
        currentView.hidden=true;
        async function showSnapshot(nextPage){
          if(!valid()||!history.open||nextPage<0||nextPage>=snapshots.length)return;
          snapshotPage=nextPage;const version=++snapshotVersion,ref=snapshots[nextPage];historyController?.abort();historyController=new AbortController();
          const signal=AbortSignal.any([c.signal,historyController.signal,AbortSignal.timeout(20000)]),visible=()=>valid()&&history.open&&version===snapshotVersion;
          backward.disabled=nextPage===0;forward.disabled=nextPage===snapshots.length-1;position.textContent=`${pairInfo?'配对对照':'历史对照'} ${nextPage+1} / ${snapshots.length}`;view.dataset.historySubmission=String(ref.submission_id);
          view.replaceChildren(el('p',`正在读取${pairInfo?'配对':'历史'}提交 #${ref.submission_id}…`));
          try{
            let cached=loaded.get(nextPage);
            if(!cached){const [source,before]=await Promise.all([client.referenceSource(ref,r,signal),readOj(ref.submission_id,ref.code_hash,signal)]);if(!visible())return;cached={source,before};loaded.set(nextPage,cached);}
            if(!visible())return;const {source,before}=cached;
            const cross=String(source.problem_id)!==String(r.problem_id),kind=pairInfo?'contest_pair':cross?'cross':ref.kind||ref.role||'previous';
            const roleNames={contest_pair:'同场配对对照',cross:'跨题码风对照',previous:'同题上次提交',history:'较早命中',prior_ac:'前一份 AC',baseline:'稳定基线',early_ac:'早期 AC'};
            const title=String(source.contest_id)===String(r.contest_id)?problemName(source.problem_id):`题目 ${source.problem_id}`;
            const label=`${roleNames[kind]||'历史提交'} · ${core.contestLabel(source.contest_id,getContext().contestNames)} · ${title} · 提交 #${ref.submission_id}${source.evaluation_result?' · '+source.evaluation_result:''}`;
            view.replaceChildren(el('p',core.beijingTime(source.submitted_at)),comparison(before,r.code,ref.submission_id,id,{diff:!cross,rightTitle:`${roleNames[kind]||'历史提交'} #${ref.submission_id}`,ariaLabel:pairInfo?'本次提交与同场配对代码对照':undefined}));const check=el('details');check.className='ar-source-check';check.append(el('summary','对照信息与校验'),el('p',label),el('p',`源码 SHA-256：${ref.code_hash}`));view.append(check);
          }catch(error){
            if(!visible())return;const notice=el('p',error.name==='AbortError'?`${pairInfo?'配对':'历史'}对照读取超时，请重试。`:`${pairInfo?'配对':'历史'}对照暂时无法读取：`+error.message);notice.setAttribute('role','status');
            view.replaceChildren(notice,button('重试',()=>void showSnapshot(nextPage)),sourceLink(ref.submission_id,`打开${pairInfo?'配对':'历史'}原提交`),comparison(null,r.code,null,id,{rightTitle:pairInfo?'配对源码暂不可用':'历史源码暂不可用'}));
          }
        }
      }
      const evidence=el('section');evidence.className='ar-evidence';if(r.evidence?.length)workspace.append(evidence);
      for(const e of r.evidence||[])evidence.append(el('h3',`规则证据${e.start_line?` · 第 ${e.start_line}–${e.end_line||e.start_line} 行`:''}`),pre(e.quote||JSON.stringify(e,null,2)));
      if(r.parse_status&&r.parse_status!=='ok')content.append(el('p','解析状态：'+r.parse_status+'；差异估计可能不可靠，请核对原始源码。'));
      if(r.formatting_only)content.append(el('p','内容未变，单题码风未命中。'));
      const sourceCheck=el('details');sourceCheck.className='ar-source-check';sourceCheck.append(el('summary','源码校验信息'),el('p','规则版本：'+(r.rule_version||'历史运行')),el('p',`源码 SHA-256：${r.code_hash}`));workspace.append(sourceCheck);
      await editorReady;
      if(valid())detail.scrollTop=0;
    }catch(e){if(valid()){const error=el('p',e.name==='AbortError'?'读取超时，请重试。':e.message);if(options.feedbackOnly)detail.replaceChildren(error);else detail.replaceChildren(button('返回列表',()=>void closeDetail(c)),error);}}finally{clearTimeout(timeout);}
  }
  function sourceLink(id,text){const a=el('a',text||`提交 #${id}`);a.href=core.submissionUrl(id);a.target='_blank';a.rel='noopener noreferrer';return a;}
  function renderRuleFacts(target,r){
    const fact=r.rule_metadata;if(!fact)return;const box=el('section');box.append(el('h3','命中事实与历史解释'));
    const pair=core.contestPairNarrative(r);
    if(pair){
      const panel=el('section');panel.dataset.contestPair='1';
      const problemLabel=id=>{const found=getContext().contest?.problems?.find(item=>String(item.id)===String(id));return found?`${found.label} · ${found.title}`:`题目 ${id}`;};
      panel.append(el('h4',`同场第 ${pair.pairIndex??'—'} 对`),el('p',`配对已锁定：${pair.problemIds.map(problemLabel).join('、')}；本对只核查 ${problemLabel(pair.selectedProblemId)}。`),el('p',pair.chronology),el('p',pair.timing),el('p',pair.content),el('p','首次命中后固定核查题，另一题后续反向变化只作观察。'));
      for(const [index,ref] of pair.references.entries()){const line=el('p');line.append(index===0?'较早提交：':'较晚提交：',sourceLink(ref.submission_id),` · ${problemLabel(ref.problem_id)} · ${core.beijingTime(ref.created_at||ref.submitted_at)}`);panel.append(line);}
      const technical=el('details');technical.dataset.pairTechnical='1';technical.append(el('summary','配对技术详情'),pre(JSON.stringify(pair.technical,null,2)));panel.append(technical);box.append(panel);
    }
    if(fact.history_evidence_status==='unavailable')box.append(el('p',fact.history_evidence_explanation||'授权范围不足，部分历史证据暂不可查看。'));
    if(fact.change?.status==='unavailable')box.append(el('p',fact.change.explanation||'当前无法查看这组历史差异。'));
    else if(fact.change){const change=fact.change;box.append(el('p',`${change.difference_reliable===false?'不可靠的差异估计':'可执行代码差异'}：${((change.change_ratio||0)*100).toFixed(1)}%，增加 ${change.added_tokens??0}、删除 ${change.removed_tokens??0} 个 token；前版 ${change.previous_tokens??0}、当前 ${change.current_tokens??0} 个 token，间隔 ${change.seconds_between??'—'} 秒。`));}
    if(fact.style?.pure_formatting||fact.style_change?.pure_formatting||fact.style_signals?.pure_formatting||fact.pure_formatting)box.append(el('p','内容未变，单题码风未命中。'));
    if(fact.non_c_language?.candidate)box.append(el('p','CE：非 C 语法直接命中。请结合具体语法和来源作人工结论。'));
    if(fact.quick_pass?.status==='unavailable')box.append(el('p',fact.quick_pass.explanation||'当前无法查看通过间隔的历史证据。'));
    else if(fact.quick_pass){const quick=fact.quick_pass;box.append(el('p',`通过间隔 ${quick.seconds_between??quick.gap_seconds??'未提供'} 秒 · 本题首次尝试 ${core.beijingTime(quick.first_attempt_at)} · 已记录准备 ${quick.preparation_seconds??'未提供'} 秒`));for(const attempt of quick.attempt_timeline||[]){const row=el('p');row.append(sourceLink(attempt.submission_id),` · ${attempt.verdict} · ${core.beijingTime(attempt.created_at)}`);box.append(row);}if(quick.limitation)box.append(el('p',quick.limitation));}
    if(fact.profile_baseline?.status==='unavailable')box.append(el('p',fact.profile_baseline.explanation||'当前无法查看这组参照代码。'));
    else if(fact.profile_baseline){const base=fact.profile_baseline;box.append(el('p',`本份代码评估时基线：${base.sufficient?'样本充分':'样本不足'} · ${base.sample_count??0} 份更早代码，覆盖 ${base.problem_count??0} 题`));for(const ref of base.samples||[]){const row=el('p');row.append('更早样本：',sourceLink(ref.submission_id),` · ${core.beijingTime(ref.submitted_at||ref.created_at)}`);box.append(row);}}
    const repeated=fact.repeated_ac;if(repeated){box.append(el('h4','AC 后重复提交时间线'),el('p',repeated.explanation));for(const match of repeated.matches||[]){const row=el('p');row.append(sourceLink(match.earlier_submission_id),` · 早期 AC ${core.beijingTime(match.earlier_created_at)} → 当前 AC #${r.submission_id} · ${match.kind==='trace_cleanup'?'清理早期命中痕迹':'向历史风格回归'}`);box.append(row);for(const removed of match.removed_evidence||[])box.append(pre(typeof removed==='string'?removed:JSON.stringify(removed,null,2)));for(const ref of match.historical_style?.baseline_samples||[]){const sample=el('p');sample.append('基线：',sourceLink(ref.submission_id),` · ${core.contestLabel(ref.contest_id,getContext().contestNames)} · ${core.beijingTime(ref.created_at)}`);box.append(sample);}}}
    box.append(el('p','来源待人工核实；辅助分值只用于解释和排序。'));target.append(box);
  }
  function renderScores(target,r){
    const score=core.scoreSummary(r),box=el('section');box.append(el('h3','规则分值'),el('p',`规则分 ${score.raw??'未提供'}`));target.append(box);
  }
  function renderEvidenceChain(target,r){
    const pairMode=!!core.contestPairNarrative(r),sameProblem=ref=>ref.problem_id!=null&&String(ref.problem_id)===String(r.problem_id);
    const records=pairMode?[...(r.history_hits||[]).filter(ref=>ref.problem_id==null||sameProblem(ref)),...(r.prior_accepted_submissions||[]).filter(ref=>ref.problem_id==null||sameProblem(ref)),...(r.evidence_chain||[]).filter(sameProblem)]:[...(r.evidence_chain||[]),...(r.history_hits||[]),...(r.prior_accepted_submissions||[]),...(r.baseline_references||[])];
    if(!records.length)return;const box=el('details');if(pairMode)box.dataset.sameProblemTimeline='1';box.append(el('summary','同题命中与 AC 提交时间线'));
    for(const ref of records){const row=el('p');if(ref.submission_id)row.append(sourceLink(ref.submission_id));row.append(` · ${ref.judge_result||ref.result||ref.evaluation_result||'历史对照'} · ${core.beijingTime(ref.submitted_at||ref.created_at)} · ${ref.role||ref.kind||'历史命中'}`);if(ref.code_hash){const hash=el('small',' · SHA-256 '+ref.code_hash);hash.className='ar-evidence-meta';row.append(hash);}if(ref.annotation){row.append(' · '+labels[ref.annotation.status]);if(pairMode&&ref.annotation.reason)row.append(' · '+ref.annotation.reason);}box.append(row);}target.append(box);
  }
  async function closeDetail(controller){detailResize?.disconnect();detailVersion++;controller.abort();detail.hidden=true;detail.replaceChildren();if(listDirty){listDirty=false;await refresh();}if(listPosition){list.scrollTop=listPosition.listTop;list.scrollLeft=listPosition.listLeft;const overlay=container.closest('.problem-review-page')||container.closest('.overlay');if(overlay)overlay.scrollTop=listPosition.overlayTop;listPosition=null;}}
  async function turn(direction,id){
    if(navigationBusy||saving||!cursor?.has(id,direction))return;
    const currentCursor=cursor,version=detailVersion,base=contextKey();navigationBusy=true;updateNavigation();
    try{
      let target=currentCursor.neighbor(id,direction);
      if(!target){const request=currentCursor.request(direction);if(!request)return;
        const result=await client.search(query(getContext(),request.offset,request.limit),AbortSignal.any([detailController.signal,AbortSignal.timeout(20000)]));
        if(version!==detailVersion||base!==contextKey())return;
        currentCursor.extend(result,request,direction);target=currentCursor.neighbor(id,direction);
      }
      if(target)await openDetail(target,true);
    }catch(e){if(version===detailVersion){let message=detail.querySelector('[data-navigation-error]');if(!message){message=el('p');message.dataset.navigationError='1';detail.querySelector('.ar-review-head')?.append(message);}message.textContent='翻页失败，请重试：'+e.message;}}
    finally{navigationBusy=false;updateNavigation();}
  }
  async function showContestSubmissions(r,valid){
    if(detail.querySelector('.ar-student-page'))return;
    const ctx=getContext(),member=core.members(ctx.summary.rows).get(String(r.creator_id)),panel=el('section');panel.className='ar-student-page';panel.setAttribute('aria-label','该同学本次比赛提交');
    const header=el('div');header.className='ar-review-head';header.append(el('h2',`${member?.name||r.creator_id} · 本次比赛提交`),button('返回当前核查',()=>panel.remove()));
    const content=el('div','正在读取提交记录…');content.className='ar-review-content';panel.append(header,content);detail.append(panel);
    try{
      const records=(await options.loadContestSubmissions()).filter(s=>String(s.creator_id)===String(r.creator_id)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||Number(b.id)-Number(a.id));
      if(!valid()||!panel.isConnected)return;
      let currentPage=0;const problemFilter=el('select');problemFilter.setAttribute('aria-label','本次比赛提交题目');refill(problemFilter,[['all','全部题目'],...ctx.contest.problems.map(p=>[String(p.id),`${p.label} · ${p.title}`])]);
      const list=el('div');list.className='table-wrap';const pager=el('div');pager.className='pager';content.replaceChildren(el('p',`共 ${records.length} 次赛内提交 · 包含全部题目和评测结果`),problemFilter,list,pager);
      function drawSubmissions(){const filtered=records.filter(s=>problemFilter.value==='all'||String(s.problem_id)===problemFilter.value),table=el('table'),head=el('thead'),titles=el('tr');
        ['提交','题目','结果','得分','语言','提交时间','代码'].forEach(t=>titles.append(el('th',t)));head.append(titles);table.append(head);const body=el('tbody');
        for(const s of filtered.slice(currentPage*30,currentPage*30+30)){const row=el('tr'),problem=ctx.contest.problems.find(p=>String(p.id)===String(s.problem_id));if(String(s.id)===String(r.submission_id))row.className='ar-current-submission';
          [String(s.id)===String(r.submission_id)?`${s.id}（当前核查）`:s.id,problem?`${problem.label} · ${problem.title}`:s.problem_id,s.result||'待评测',s.score??'—',s.lang||'—',new Date(s.created_at).toLocaleString()].forEach(t=>row.append(el('td',t)));
          const cell=el('td');if(/^[1-9]\d*$/.test(String(s.id))){const link=el('a','查看代码');link.href=core.submissionUrl(s.id);link.target='_blank';link.rel='noopener noreferrer';cell.append(link);}row.append(cell);body.append(row);
        }
        table.append(body);list.replaceChildren(table);const previous=button('上一页',()=>{currentPage--;drawSubmissions();}),next=button('下一页',()=>{currentPage++;drawSubmissions();});previous.disabled=currentPage===0;next.disabled=(currentPage+1)*30>=filtered.length;pager.replaceChildren(el('span',`共 ${filtered.length} 条 · ${currentPage+1} / ${Math.max(1,Math.ceil(filtered.length/30))}`),previous,next);
      }
      problemFilter.onchange=()=>{currentPage=0;drawSubmissions();};drawSubmissions();
    }catch(e){if(valid()&&panel.isConnected)content.replaceChildren(el('p','提交读取失败：'+e.message),button('重试',()=>{panel.remove();void showContestSubmissions(r,valid);}));}
  }
  async function feedbackEditor(r,signal,valid,targetOverride=null){
    let history=r.feedback||await client.feedback(r.submission_id,r.code_hash,r.run_id,signal);if(!valid())return;
    const mark=el('select');mark.setAttribute('aria-label','人工复核结论');refill(mark,[['','请选择核查结论'],...Object.entries(labels)]);
    const note=el('textarea');note.className='ar-note';note.placeholder='填写核对理由';note.maxLength=3000;note.setAttribute('aria-label','人工复核理由');
    if(history.latest){mark.value=history.latest.status;note.value=history.latest.reason;}else{mark.value=r.annotation?.status||'';try{const notes=JSON.parse(localStorage.getItem(noteKey)||'{}'),old=notes[r.run_id+':'+r.submission_id+':'+r.code_hash]||notes[r.submission_id+':'+r.code_hash];if(old)note.value=old.note||'';}catch{}}
    const status=el('p'),historyBox=el('div'),bar=el('div');bar.className='ar-actions';status.setAttribute('role','status');let pending=null;
    function drawHistory(){historyBox.replaceChildren();for(const h of history.history){const item=el('div');item.className='ar-history';const title=el('strong',`${h.reviewer_name} · ${labels[h.status]} · ${new Date(h.created*1000).toLocaleString()}`);title.title=h.reviewer_id||'';item.append(title,el('p',h.reason));historyBox.append(item);void reviewHistoryName(h).then(name=>{if(valid()&&title.isConnected)title.textContent=`${name} · ${labels[h.status]} · ${new Date(h.created*1000).toLocaleString()}`;});}if(!history.history.length)historyBox.append(el('p','暂无核对记录。'));}
    async function saveWithIdentity(body){
      for(let attempt=0;attempt<2;attempt++){
        status.textContent='正在核实保存身份…';const token=await ensureReviewWriteAccess(r.contest_id,core);if(!valid())return;writeToken=token;
        try{const capability=await client.session(AbortSignal.timeout(15000),true);if(!valid())return;
          if(capability.write_authenticated===false){const error=new Error('当前身份没有保存本场核查结论的权限');error.httpStatus=403;throw error;}
          if(capability.review_state_protocol<2||!(capability.human_statuses||capability.manual_statuses||[]).includes('uncertain'))throw new Error('云端尚未支持三态协议，请更新后保存');
          status.textContent='正在保存核查结论…';await client.saveFeedback(body,AbortSignal.timeout(20000));return;
        }catch(error){if(attempt===0&&[401,403].includes(error.httpStatus)){await invalidateReviewWriteAccess(r.contest_id,token);if(writeToken===token)writeToken='';if(!valid())return;continue;}throw error;}
      }
    }
    const save=button('保存结论',async()=>{if(!Object.hasOwn(labels,mark.value)){status.textContent='请选择核查结论后保存。';mark.focus();return;}if(!note.value.trim()){status.textContent='请填写理由后保存。';note.focus();return;}const saveOperation={};save.disabled=true;saving=saveOperation;updateNavigation();const body={submission_id:r.submission_id,code_hash:r.code_hash,run_id:r.run_id,status:mark.value,reason:note.value.trim(),code:r.code,base_revision:history.latest?.id||0};const signature=JSON.stringify(body);if(pending?.signature!==signature)pending={signature,request_id:crypto.randomUUID()};try{await saveWithIdentity({...body,request_id:pending.request_id});if(!valid())return;history=await client.feedback(r.submission_id,r.code_hash,r.run_id,AbortSignal.timeout(15000));if(!valid())return;pending=null;r.annotation=history.latest;const oldState=r.review_status;r.profile_scores_valid=false;r.profile_stale=true;r.auxiliary_score=null;r.review_status=core.humanState(history.latest.status);if(counts){counts[oldState]=Math.max(0,(counts[oldState]||0)-1);counts[r.review_status]=(counts[r.review_status]||0)+1;showProgress();}const visible=core.inReviewFilter(r,state.value,options.problemList);cursor?.setVisible(r.submission_id,visible);listDirty=true;const rowIndex=rows.findIndex(x=>String(x.submission_id)===String(r.submission_id)&&x.code_hash===r.code_hash);if(rowIndex>=0){if(!visible){rows.splice(rowIndex,1);total=Math.max(0,total-1);}else{rows[rowIndex].annotation=history.latest;rows[rowIndex].review_status=r.review_status;rows[rowIndex].profile_scores_valid=false;rows[rowIndex].profile_stale=true;rows[rowIndex].auxiliary_score=null;}}draw();const label=detail.querySelector('[data-review-judgement]');if(label){label.textContent=judgement(r);label.dataset.state=r.review_status;}const reason=detail.querySelector('[data-review-reason]');if(reason)reason.textContent=history.latest.reason;drawHistory();status.textContent='已保存到云端。';}catch(e){if(valid())status.textContent=e.message+'；草稿已保留，可重试或先刷新历史。';}finally{save.disabled=false;if(saving===saveOperation){saving=false;updateNavigation();}}});save.className='primary';
    bar.append(mark,save,button('刷新云端历史',async()=>{try{history=await client.feedback(r.submission_id,r.code_hash,r.run_id,AbortSignal.timeout(15000));if(valid()){drawHistory();status.textContent='已刷新历史；当前理由草稿保留，请核对后再保存。';}}catch(e){if(valid())status.textContent=e.message;}}));
    const target=targetOverride||(options.feedbackOnly?detail:detail.querySelector('.ar-review-content')||detail);
    target.classList.add('ar-feedback-editor');const noteLabel=el('label','复核理由');note.id='ar-note-'+crypto.randomUUID();noteLabel.htmlFor=note.id;noteLabel.className='ar-field-label';const conclusion=el('label','复核结论');mark.id='ar-mark-'+crypto.randomUUID();conclusion.htmlFor=mark.id;conclusion.className='ar-field-label';const historyDetails=el('details');historyDetails.className='ar-feedback-history';historyDetails.append(el('summary','云端修改历史'),historyBox);target.append(el('h3','人工复核'),noteLabel,note,conclusion,bar,status,historyDetails);drawHistory();
  }
  async function exportRows(format='xlsx'){
    const c=getContext(),k=key();if(exportButton.disabled||!c.contest||!c.summary||!runId)return;const filterKey=()=>JSON.stringify(query(c,0,100)),filter=filterKey(),abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),180000);const valid=()=>k===key()&&filter===filterKey();exportButton.disabled=jsonButton.disabled=true;
    try{const all=[];let expected=Infinity;for(let offset=0;offset<expected;offset+=100){const r=await client.search(query(c,offset,100),abort.signal);if(!valid())return;expected=r.total;all.push(...r.reviews);if(!r.reviews.length)break;}
      const feedback=[];{let after=0;while(true){const packet=await client.exportFeedback(c.contest.id,after,abort.signal);if(!valid())return;feedback.push(...packet.feedback);if(!packet.feedback.length)break;after=packet.next_after;}}
      const complete=[];if(client.exportEvidence){let offset=0;do{const packet=await client.exportEvidence(runId,offset,abort.signal);if(!valid())return;if(packet.run_id!==runId||!Array.isArray(packet.items))throw Error('完整证据格式无效');for(const item of packet.items)core.feedbackPacket({latest:null,history:item.feedback_history||[]});complete.push(...packet.items.filter(item=>core.members(c.summary.rows).has(String(item.source?.creator_id))));if(packet.next_offset==null)break;if(!Number.isInteger(packet.next_offset)||packet.next_offset<=offset)throw Error('证据分页未前进');offset=packet.next_offset;message.textContent=`正在导出完整证据：${offset} / ${packet.total}`;}while(true);}
      const memberMap=core.members(c.summary.rows),tables=core.exportTables(all,feedback),payload={schema_version:'review-export-v2',state_protocol:2,exported_at:new Date().toISOString(),class_name:c.className,run_id:runId,filters:query(c),...tables,...(client.exportEvidence?{complete_evidence:complete}:{}),current_review:tables.current_review.map(r=>({...r,name:memberMap.get(String(r.creator_id))?.name,student_id:memberMap.get(String(r.creator_id))?.studentId}))};
      const result=format==='xlsx'?createAiReviewExport(tables.current_review,feedback,c,complete):{blob:new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),filename:'代码复核与完整证据.json'};const link=el('a'),url=URL.createObjectURL(result.blob);link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=`已导出 ${all.length} 条核查记录及 ${feedback.length} 条人工反馈。`;
    }catch(e){if(valid())message.textContent='导出失败：'+e.message;}finally{clearTimeout(timeout);exportButton.disabled=jsonButton.disabled=false;}
  }
  function addSimilarityDetail(target,record,signal,valid){
    const box=el('details'),content=el('div');box.dataset.codeSimilarity='1';box.append(el('summary','代码查重'),content);target.append(box);
    let loaded=false,loading=false;
    box.addEventListener('toggle',async()=>{
      if(!box.open||loaded||loading||!valid())return;loading=true;content.textContent='正在读取代码查重结果…';
      try{
        const problem=getContext().contest?.problems.find(p=>String(p.id)===String(record.problem_id));
        if(problem&&!codeSimilarityProblemAllowed(problem)){content.textContent='本题未开放查重。';loaded=true;return;}
        const value=await client.similarityDetail(record.submission_id,record.run_id,record.contest_id,signal);if(!valid())return;
        if(value.code_hash!==record.code_hash||String(value.creator_id)!==String(record.creator_id)||String(value.problem_id)!==String(record.problem_id))throw Error('查重详情与当前源码身份不一致');
        renderCodeSimilarity(content,value,core,client,{signal,valid,getContext});loaded=true;
      }catch(error){if(valid())content.textContent=error.httpStatus===404?'当前服务尚未提供此提交的代码查重结果。':error.message;}
      finally{loading=false;}
    });
  }
  return {reset,openDetail,setProblemScope,setActive(value){active=value;if(branch==='similarity'){stop();return similarityPanel.setActive(value);}similarityPanel.setActive(false);if(value)return refresh();stop();}};
}
