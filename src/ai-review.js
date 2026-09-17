function createAiReviewPanel(container,core,getContext,readMetadata,options={}) {
  const configKey='accoding-modern.ai-review.v1',noteKey='accoding-modern.ai-review.notes.v1';
  let token='';try{token=JSON.parse(localStorage.getItem(configKey)||'{}').token||'';}catch{}
  let version=0,controller=null,timer=null,rows=[],page=0,active=false,detailVersion=0,detailController=null;
  const client=core.client(()=>token);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  const select=(label,options)=>{const s=el('select');s.setAttribute('aria-label',label);for(const [value,text] of options){const o=el('option',text);o.value=value;s.append(o);}s.onchange=()=>{page=0;draw();};return s;};
  const heading=el('h2','代码复核');
  const controls=el('div');controls.className='row';
  const selections={candidate:'候选复核',sample:'未命中抽样',rules_only:'此前复核',unbatched:'单独复核'};
  const selection=select('批次选入方式',[['all','全部复核来源'],...Object.entries(selections)]);
  const feature=select('代码特征',[['all','全部特征'],['any','有规则标签'],['注释','注释'],['scanf','scanf 防护'],['短时','短时大改']]);
  const problem=select('复核题目',[['all','全部题目']]);
  const config=el('details');config.append(el('summary','复核设置'));
  const password=el('input');password.type='password';password.autocomplete='off';password.value=token;password.placeholder='填写共享只读令牌';password.setAttribute('aria-label','复核只读令牌');
  const settingStatus=el('span');
  config.append(el('p',core.api),password,button('保存令牌',()=>{try{localStorage.setItem(configKey,JSON.stringify({token:password.value.trim()}));token=password.value.trim();client.clear();settingStatus.textContent='已保存到当前浏览器。';if(options.submissionId)void openDetail(options.submissionId);else if(active)void refresh(true);}catch{settingStatus.textContent='保存失败，请检查浏览器存储权限。';}}),button('清除令牌',()=>{localStorage.removeItem(configKey);token=password.value='';client.clear();stop();rows=[];detail.replaceChildren();draw();settingStatus.textContent='已清除。';}),settingStatus);
  const message=el('p','读取比赛后，打开代码复核。');message.setAttribute('role','status');
  const coverage=el('p');coverage.setAttribute('aria-live','polite');
  const list=el('div');list.className='table-wrap';const pager=el('div');pager.className='pager';
  const detail=el('section');detail.className='panel';detail.hidden=true;
  controls.append(problem,feature,selection,button('刷新结果',()=>options.submissionId?void openDetail(options.submissionId):void refresh(true)),button('导出当前结果',exportRows));
  container.append(heading,config,controls,message,coverage,list,pager,detail);
  if(options.submissionId){problem.hidden=feature.hidden=selection.hidden=coverage.hidden=message.hidden=list.hidden=pager.hidden=true;controls.lastChild.hidden=true;}
  function contextKey(){const c=getContext();return `${c.classId||''}:${c.contest?.id||''}:${c.generation}`;}
  function stop(){version++;detailVersion++;controller?.abort();controller=null;detailController?.abort();detailController=null;clearTimeout(timer);timer=null;}
  function reset(){stop();rows=[];page=0;detail.hidden=true;detail.replaceChildren();list.replaceChildren();pager.replaceChildren();coverage.textContent='';message.textContent='读取比赛后，打开代码复核。';}
  async function refresh(force=false){
    stop();const v=version,key=contextKey(),c=getContext();detail.hidden=true;detail.replaceChildren();
    if(!active||!c.contest||!c.summary){message.textContent='请先读取比赛和榜单，再查看当前班级的代码复核。';return;}
    const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),90000);
    rows=[];draw();message.textContent='正在读取当前班级提交和已有复核结果…';
    try{
      const metadata=await readMetadata(c.contest.id,current.signal);
      if(v!==version||key!==contextKey())return;
      const records=core.classSubmissions(metadata,c.summary.rows);
      const results=await client.query(records.map(s=>s.id),current.signal,force);
      if(v!==version||key!==contextKey())return;
      rows=records.map((s,i)=>({...s,review:results[i]})).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||Number(b.id)-Number(a.id));
      const previous=problem.value;problem.replaceChildren();for(const [value,text] of [['all','全部题目'],...c.contest.problems.map(p=>[String(p.id),`${p.label} · ${p.title}`])]){const o=el('option',text);o.value=value;problem.append(o);}problem.value=[...problem.options].some(o=>o.value===previous)?previous:'all';
      message.textContent=`${c.className} · 模型标记需复核 ${rows.filter(s=>core.hasFlaggedReview(s.review)).length} 条提交。`;
      draw();if(rows.some(s=>['waiting_model','queued','running'].includes(s.review.state)))timer=setTimeout(()=>void refresh(),30000);
    }catch(e){if(v===version){rows=[];draw();message.textContent=e.name==='AbortError'?'读取超时，请刷新重试。':e.message;}}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  function filtered(){return rows.filter(s=>core.hasFlaggedReview(s.review)&&(problem.value==='all'||String(s.problem_id)===problem.value)&&(selection.value==='all'||(s.review.batch?.selection||'unbatched')===selection.value)&&(feature.value==='all'||(feature.value==='any'?s.review.labels.length>0:s.review.labels.some(x=>x.includes(feature.value)))));}
  function draw(){
    const covered=core.coverage(rows.filter(s=>core.hasFlaggedReview(s.review)).map(s=>s.review));
    coverage.textContent=covered.total?`候选复核 ${covered.candidate}；未命中抽样 ${covered.sample}；此前复核 ${covered.rules_only}；单独复核 ${covered.unbatched}。`:'';
    const shown=filtered();page=Math.min(page,Math.max(0,Math.ceil(shown.length/30)-1));
    const table=el('table'),thead=el('thead'),head=el('tr');['提交','学生','题目','提交时间','模型判断','规则标签','复核来源','详情'].forEach(t=>head.append(el('th',t)));thead.append(head);table.append(thead);
    const body=el('tbody');for(const s of shown.slice(page*30,page*30+30)){
      const p=getContext().contest?.problems.find(p=>String(p.id)===String(s.problem_id));const tr=el('tr');
      for(const text of [s.id,`${s.member.name} · ${s.member.studentId}`,p?`${p.label} · ${p.title}`:s.problem_id,new Date(s.created_at).toLocaleString(),core.priorities[core.reviewPriority(s.review)],s.review.labels.join('；')||'无规则标签',selections[s.review.batch?.selection||'unbatched']])tr.append(el('td',text));
      const td=el('td');td.append(button('查看复核',()=>void openDetail(s.id)));tr.append(td);body.append(tr);
    }table.append(body);list.replaceChildren(table);pager.replaceChildren(el('span',`共 ${shown.length} 条 · ${page+1} / ${Math.max(1,Math.ceil(shown.length/30))}`));
    const prev=button('上一页',()=>{page--;draw();}),next=button('下一页',()=>{page++;draw();});prev.disabled=page<=0;next.disabled=(page+1)*30>=shown.length;pager.append(prev,next);
  }
  async function openDetail(id){
    const n=++detailVersion,v=version,key=contextKey();detail.hidden=false;detail.replaceChildren(el('p','正在读取复核详情…'));
    detailController?.abort();const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);detailController=c;
    try{
      const data=await client.detail(String(id),c.signal);if(n!==detailVersion||v!==version||key!==contextKey())return;
      detail.replaceChildren(button('收起详情',()=>{detailVersion++;detail.hidden=true;}),el('h3',`提交 ${id}`));
      if(!core.hasFlaggedReview(data)||!data.model_result){detail.append(el('p','暂无模型标记需复核的结果。'));return;}
      detail.append(el('p',`模型判断：${core.priorities[core.reviewPriority(data)]}`));
      const pre=text=>{const p=el('pre',text);p.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7fb;padding:14px;max-height:500px;overflow:auto';return p;};
      const source=(title,s)=>{if(!s)return;detail.append(el('h3',title),pre(s.code.split('\n').map((line,i)=>`${i+1}  ${line}`).join('\n')));};
      if(data.batch)detail.append(el('p',`整场批次：${data.batch.batch_name}；${core.selections[data.batch.selection]}；本批状态：${core.states[data.batch.state]||data.batch.state}${data.batch.reused?'；复用相同上下文任务':''}${data.batch.feeder_state==='paused'?'；批次已暂停补入任务':''}`));
      if(data.batch?.sample_pair)detail.append(el('p',`成对抽样：${data.batch.sample_pair.previous_id} → ${data.batch.sample_pair.current_id}`));
      source('当前源码',data.source);source('前一版本',data.previous);
      if(data.revision)detail.append(el('h3','版本变化'),el('p',`${data.revision.seconds} 秒间隔；新增 ${data.revision.added_tokens} token，删除 ${data.revision.removed_tokens} token，改动比例 ${(data.revision.change_ratio*100).toFixed(1)}%`),pre(data.revision.diff));
      detail.append(el('h3','规则事实'),el('p',data.labels.join('；')||'未命中当前规则标签。'));
      const f=data.facts,m=f.comment_metrics;
      detail.append(el('p',`非空行 ${f.nonempty_lines}，原始注释行 ${f.raw_comment_lines}，原始密度 ${(f.raw_comment_ratio*100).toFixed(1)}%`));
      if(m)detail.append(el('p',`排除 IDE 说明 ${m.excluded_ide_lines} 行后，有效注释 ${m.meaningful_comment_lines} 行，分母 ${m.clean_denominator} 行，密度 ${(m.clean_ratio*100).toFixed(1)}%`));
      const returns=[['scanf_minus1','-1'],['scanf_zero','0'],['scanf_one','1']].filter(([key])=>f.features[key]).map(([,v])=>v);
      if(returns.length)detail.append(el('p','scanf 输入失败后立即 return：'+returns.join('、')));
      for(const e of data.evidence)detail.append(el('p',`规则证据 · 第 ${e.start_line}–${e.end_line} 行`),pre(e.evidence));
      if(data.model_result){const r=data.model_result.result;if(data.model_result.citation_method==='source_line_reference')detail.append(el('p','引用原文按模型选择的源码行读取；解释仍需人工核验。'));detail.append(el('h3',data.model_result.inference_performed===false?'未执行模型的原因':data.batch?.selection==='rules_only'?'此前模型解释（不计入本批覆盖）':'模型解释'));for(const e of r.signals)detail.append(el('p',`${core.signalKinds[e.kind]||'其他'} · ${e.source==='previous'?'前一版本':'当前源码'} · 第 ${e.start_line}–${e.end_line} 行：${e.explanation}`),pre(e.evidence));detail.append(el('h3','替代解释'),pre(r.alternative_explanations.join('\n')||'未提供'),el('h3','缺失上下文'),pre(r.missing_context.join('\n')||'未列出'));}else detail.append(el('p','尚无模型解释。'));
      detail.append(el('p',`规则：${data.rule_version}；源码：${data.code_hash}；模型：${data.model_digest||'未运行'}`),el('p',`样本来源：${data.provenance.join('、')||'普通冻结样本'}`));
      if(data.annotations?.length)detail.append(el('h3','集中人工记录'),pre(JSON.stringify(data.annotations,null,2)));
      const mark=select('人工复核标记',[['retained','保留复核'],['ordinary','普通写法'],['insufficient','信息不足']]);const note=el('textarea');note.placeholder='人工复核备注（仅保存在本机）';note.style.width='100%';note.maxLength=3000;
      const noteId=String(id)+':'+data.code_hash;let saved={};try{saved=JSON.parse(localStorage.getItem(noteKey)||'{}');}catch{}
      if(saved[noteId]){mark.value=saved[noteId].status;note.value=saved[noteId].note;}
      const feedback=el('p');detail.append(el('h3','本机人工记录'),mark,note,button('保存本机记录',()=>{try{const all=JSON.parse(localStorage.getItem(noteKey)||'{}');all[noteId]={submission_id:String(id),code_hash:data.code_hash,status:mark.value,note:note.value};localStorage.setItem(noteKey,JSON.stringify(all));feedback.textContent='已保存；可随结果导出，再由 Mac 导入。';}catch{feedback.textContent='保存失败，原记录未覆盖。';}}),feedback);
      detail.scrollIntoView({block:'start',behavior:'smooth'});
    }catch(e){if(n===detailVersion&&v===version)detail.replaceChildren(el('p',e.name==='AbortError'?'读取超时':e.message));}finally{clearTimeout(t);if(detailController===c)detailController=null;}
  }
  function exportRows(){
    const c=getContext();let notes={};try{notes=JSON.parse(localStorage.getItem(noteKey)||'{}');}catch{}
    const data=filtered().map(s=>({submission_id:s.id,name:s.member.name,student_id:s.member.studentId,review:s.review}));
    const payload={exported_at:new Date().toISOString(),class_name:c.className,reviews:data,annotations:data.map(s=>notes[s.submission_id+':'+s.review.code_hash]).filter(Boolean)};
    const link=el('a'),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));link.href=url;link.download='代码复核结果.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {reset,openDetail,setActive(value){active=value;if(value)void refresh(true);else stop();}};
}

function mountSubmissionReview(core){
  let current='',panel=null,host=null;
  const sync=()=>{
    const match=location.pathname.match(/^\/submission\/(\d+)(?:\/|$)/),id=match?.[1]||'';
    if(id===current)return;current=id;panel?.reset();host?.remove();host=null;if(!id)return;
    host=document.createElement('div');host.id='am-submission-review';document.body.append(host);const root=host.attachShadow({mode:'open'});
    root.innerHTML='<style>:host{font:14px/1.6 system-ui;color:#25344b}button,input,select,textarea{font:inherit;padding:7px;border:1px solid #cdd8e8;border-radius:7px;background:white;color:inherit}button{cursor:pointer}#launch{position:fixed;right:26px;bottom:150px;z-index:9999}#drawer{position:fixed;inset:40px 20px 20px auto;width:min(740px,90vw);overflow:auto;background:#fff;padding:20px;box-shadow:0 5px 50px #17253a55;z-index:2147483001} [hidden]{display:none!important}.row{display:flex;gap:8px;flex-wrap:wrap}table{font-size:12px}textarea{box-sizing:border-box}pre{font:13px/1.5 monospace}</style><button id="launch">代码复核</button><section id="drawer" hidden><button id="close">收起</button><div id="content"></div></section>';
    panel=createAiReviewPanel(root.querySelector('#content'),core,()=>({generation:id}),async()=>[],{submissionId:id});
    root.querySelector('#launch').onclick=()=>{root.querySelector('#drawer').hidden=false;void panel.openDetail(id);};
    root.querySelector('#close').onclick=()=>{root.querySelector('#drawer').hidden=true;panel.reset();};
  };
  sync();window.addEventListener('popstate',sync);new MutationObserver(sync).observe(document.body,{childList:true});
}
