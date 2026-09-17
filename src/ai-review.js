function createAiReviewPanel(container,core,getContext,_readMetadata,options={}) {
  const configKey='accoding-modern.ai-review.v1',noteKey='accoding-modern.ai-review.notes.v1';
  let token='';try{token=JSON.parse(localStorage.getItem(configKey)||'{}').token||'';}catch{}
  let generation=0,controller=null,timer=null,rows=[],page=0,total=0,active=false,detailVersion=0,detailController=null;
  const client=core.client(()=>token),size=30;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  const select=(name,values)=>{const s=el('select');s.setAttribute('aria-label',name);for(const [value,text] of values){const o=el('option',text);o.value=value;s.append(o);}s.onchange=()=>{page=0;void refresh();};return s;};
  const problem=select('复核题目',[['all','全部题目']]);
  const feature=select('代码特征',[['all','全部特征'],...['长变量名','讲解注释','对答建议','过度防御','过度拆分','版本变化'].map(x=>[x,x])]);
  const selection=select('复核来源',[['all','全部复核来源'],...Object.entries(core.selections)]);
  const message=el('p','读取比赛后，打开代码复核。');message.setAttribute('role','status');
  const progress=el('p');progress.setAttribute('aria-live','polite');
  const config=el('details');config.append(el('summary','复核设置'));
  const password=el('input');password.type='password';password.autocomplete='off';password.value=token;password.placeholder='填写共享只读令牌';password.setAttribute('aria-label','复核只读令牌');
  const settingStatus=el('span');
  config.append(password,button('保存令牌',()=>{try{token=password.value.trim();localStorage.setItem(configKey,JSON.stringify({token}));settingStatus.textContent='已保存。';if(options.submissionId)void openDetail(options.submissionId);else if(active)void refresh();}catch{settingStatus.textContent='保存失败，请检查浏览器存储权限。';}}),button('清除令牌',()=>{localStorage.removeItem(configKey);token=password.value='';reset();settingStatus.textContent='已清除。';}),settingStatus);
  const list=el('div');list.className='table-wrap';const pager=el('div');pager.className='pager';const detail=el('section');detail.className='panel';detail.hidden=true;
  const controls=el('div');controls.className='row';controls.append(problem,feature,selection,button('刷新结果',()=>options.submissionId?void openDetail(options.submissionId):void refresh()),button('导出当前结果',()=>void exportRows()));
  container.append(el('h2','代码复核'),config,controls,message,progress,list,pager,detail);
  if(options.submissionId){problem.hidden=feature.hidden=selection.hidden=progress.hidden=message.hidden=list.hidden=pager.hidden=true;controls.lastChild.hidden=true;}
  function key(){const c=getContext();return `${c.classId||''}:${c.contest?.id||''}:${c.generation}`;}
  function stop(){generation++;controller?.abort();detailVersion++;detailController?.abort();clearTimeout(timer);}
  function reset(){stop();rows=[];total=page=0;detail.hidden=true;detail.replaceChildren();progress.textContent='';message.textContent='读取比赛后，打开代码复核。';draw();}
  function query(c,offset=page*size,limit=size){return {contest_id:Number(c.contest.id),creator_ids:[...core.members(c.summary.rows).keys()],offset,limit,...(problem.value==='all'?{}:{problem_id:Number(problem.value)}),...(feature.value==='all'?{}:{label:feature.value}),...(selection.value==='all'?{}:{selection:selection.value})};}
  async function refresh(){
    stop();const v=generation,k=key(),c=getContext();detail.hidden=true;detail.replaceChildren();
    if(!active||!c.contest||!c.summary){message.textContent='请先读取比赛和榜单，再查看当前班级的代码复核。';return;}
    const selectedProblem=problem.value;problem.replaceChildren();for(const [value,text] of [['all','全部题目'],...c.contest.problems.map(p=>[String(p.id),`${p.label} · ${p.title}`])]){const o=el('option',text);o.value=value;problem.append(o);}problem.value=[...problem.options].some(o=>o.value===selectedProblem)?selectedProblem:'all';
    const current=new AbortController();controller=current;const timeout=setTimeout(()=>current.abort(),20000);
    rows=[];draw();message.textContent='正在读取当前班级的模型疑似结果…';progress.textContent='';
    try{
      const [result,state]=await Promise.all([client.search(query(c),current.signal),client.progress(c.contest.id,current.signal)]);
      if(v!==generation||k!==key())return;
      const memberMap=core.members(c.summary.rows);rows=result.reviews.map(r=>({...r,member:memberMap.get(String(r.creator_id))}));total=result.total;
      if(!total)page=0;
      if(total&&page*size>=total){page=Math.floor((total-1)/size);void refresh();return;}
      message.textContent=`${c.className} · 模型标记有 AI 生成嫌疑 ${total} 条提交。`;
      const b=state.batches?.[0];progress.textContent=b?`整场复核${core.states[b.state]||b.state} · 已处理 ${b.completed} / ${b.selected} · 运行失败 ${b.errors}`:'尚无第二版复核批次结果。';
      draw();if(b?.state==='running')timer=setTimeout(()=>void refresh(),30000);
    }catch(e){if(v===generation){rows=[];total=0;draw();message.textContent=e.name==='AbortError'?'读取超时，请刷新重试。':e.message;}}
    finally{clearTimeout(timeout);if(controller===current)controller=null;}
  }
  function draw(){
    const table=el('table'),thead=el('thead'),head=el('tr');['提交','学生','题目','提交时间','模型判断','代码特征','复核来源','详情'].forEach(t=>head.append(el('th',t)));thead.append(head);table.append(thead);
    const body=el('tbody');for(const r of rows){
      const p=getContext().contest?.problems.find(p=>String(p.id)===String(r.problem_id));const tr=el('tr');
      for(const text of [r.submission_id,`${r.member.name} · ${r.member.studentId}`,p?`${p.label} · ${p.title}`:r.problem_id,new Date(r.submitted_at).toLocaleString(),'有 AI 生成嫌疑',r.labels.join('；')||'模型综合判断',core.selections[r.selection]])tr.append(el('td',text));
      const td=el('td');td.append(button('查看复核',()=>void openDetail(r.submission_id)));tr.append(td);body.append(tr);
    }
    table.append(body);list.replaceChildren(table);pager.replaceChildren(el('span',`共 ${total} 条 · ${page+1} / ${Math.max(1,Math.ceil(total/size))}`));
    const previous=button('上一页',()=>{page--;void refresh();}),next=button('下一页',()=>{page++;void refresh();});previous.disabled=page<=0;next.disabled=(page+1)*size>=total;pager.append(previous,next);
  }
  async function openDetail(id){
    const n=++detailVersion,k=key();detail.hidden=false;detail.replaceChildren(el('p','正在读取复核详情…'));
    detailController?.abort();const c=new AbortController(),timeout=setTimeout(()=>c.abort(),20000);detailController=c;
    try{
      const r=await client.detail(String(id),c.signal);if(n!==detailVersion||k!==key())return;
      detail.replaceChildren(button('收起详情',()=>{detailVersion++;detail.hidden=true;}),el('h3',`提交 ${id}`));
      if(!r){detail.append(el('p','暂无模型标记的疑似结果。'));return;}
      const pre=text=>{const p=el('pre',text);p.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7fb;padding:14px;max-height:500px;overflow:auto';return p;};
      detail.append(el('p','模型判断：有 AI 生成嫌疑'),el('p',r.explanation),el('h3','当前源码'),pre(r.code.split('\n').map((line,i)=>`${i+1}  ${line}`).join('\n')));
      if(r.previous_submission_id){
        const a=el('a',`打开前一次提交 ${r.previous_submission_id}`);a.href=`/submission/${r.previous_submission_id}`;a.target='_blank';a.rel='noopener';
        const previous=el('section');previous.hidden=true;
        const load=button('加载前版源码进行对比',async()=>{
          load.disabled=true;previous.hidden=false;previous.replaceChildren(el('p','正在从 OJ 读取前版源码…'));
          const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
          try{const res=await fetch(`/submission/${r.previous_submission_id}`,{credentials:'same-origin',cache:'no-store',signal:abort.signal});if(!res.ok)throw new Error('读取失败');const html=await res.text();if(n!==detailVersion||k!==key())return;
            const doc=new DOMParser().parseFromString(html,'text/html'),node=doc.querySelector('pre code');if(!node)throw new Error('原站没有返回可读取的源码，请使用提交链接查看');
            previous.replaceChildren(el('h3',`前版 ${r.previous_submission_id}`),pre(node.textContent.split('\n').map((line,i)=>`${i+1}  ${line}`).join('\n')));
          }catch(e){if(n===detailVersion)previous.replaceChildren(el('p',e.name==='AbortError'?'前版读取超时':e.message));}finally{clearTimeout(timer);load.disabled=false;}
        });detail.append(el('h3','前后版本核验'),load,a,previous);
      }
      for(const e of r.evidence)detail.append(el('h3',`${e.kind} · 第 ${e.start_line}–${e.end_line} 行`),el('p',e.explanation),pre(e.quote));
      detail.append(el('p',`模型：${r.model_name}；批次：${r.batch_id}`),el('p',`源码校验：${r.code_hash}`));
      const mark=el('select');mark.setAttribute('aria-label','人工复核标记');for(const [value,text] of [['retained','保留复核'],['ordinary','普通写法'],['insufficient','信息不足']]){const o=el('option',text);o.value=value;mark.append(o);}
      const note=el('textarea');note.placeholder='人工复核备注（仅保存在本机）';note.style.width='100%';note.maxLength=3000;
      const noteId=String(id)+':'+r.code_hash;let saved={};try{saved=JSON.parse(localStorage.getItem(noteKey)||'{}');}catch{}if(saved[noteId]){mark.value=saved[noteId].status;note.value=saved[noteId].note;}
      const feedback=el('p');detail.append(el('h3','本机人工记录'),mark,note,button('保存本机记录',()=>{try{const all=JSON.parse(localStorage.getItem(noteKey)||'{}');all[noteId]={submission_id:String(id),code_hash:r.code_hash,status:mark.value,note:note.value};localStorage.setItem(noteKey,JSON.stringify(all));feedback.textContent='已保存。';}catch{feedback.textContent='保存失败。';}}),feedback);
      detail.scrollIntoView({block:'start',behavior:'smooth'});
    }catch(e){if(n===detailVersion)detail.replaceChildren(el('p',e.name==='AbortError'?'读取超时':e.message));}finally{clearTimeout(timeout);}
  }
  async function exportRows(){
    const c=getContext(),k=key();if(!c.contest||!c.summary)return;const queryBase=query(c,0,100),abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),60000);
    try{
      const all=[];let expected=Infinity;
      for(let offset=0;offset<expected;offset+=100){const r=await client.search({...queryBase,offset},abort.signal);if(k!==key())return;expected=r.total;all.push(...r.reviews);if(!r.reviews.length)break;}
      const memberMap=core.members(c.summary.rows);let notes={};try{notes=JSON.parse(localStorage.getItem(noteKey)||'{}');}catch{}
      const data=all.map(r=>({name:memberMap.get(String(r.creator_id)).name,student_id:memberMap.get(String(r.creator_id)).studentId,review:r}));
      const payload={exported_at:new Date().toISOString(),class_name:c.className,reviews:data,annotations:all.map(r=>notes[r.submission_id+':'+r.code_hash]).filter(Boolean)};
      const link=el('a'),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));link.href=url;link.download='代码复核结果.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){message.textContent='导出失败：'+e.message;}finally{clearTimeout(timeout);}
  }
  return {reset,openDetail,setActive(value){active=value;if(value)void refresh();else stop();}};
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
