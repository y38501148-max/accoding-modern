const similarityReviewLabels={ordinary:'无抄袭',uncertain:'存疑',suspected:'有抄袭'};

function codeSimilarityProblemAllowed(problem){
  const label=String(problem?.label||'');
  return /^[A-Z]+$/.test(label)&&[...label].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)>=5;
}

function mountSimilarityFeedback(target,record,match,core,client,{signal,valid,onSaved}){
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
  target.className='ar-similarity-editor';
  const pair={run_id:record.run_id,submission_id:String(record.submission_id),code_hash:record.code_hash,reference_id:String(match.reference.submission_id),reference_hash:match.reference.code_hash};
  const draftKey='accoding-modern.similarity-note.'+record.run_id+':'+[[pair.submission_id,pair.code_hash],[pair.reference_id,pair.reference_hash]].sort((a,b)=>a[0].localeCompare(b[0])).flat().join(':');
  const mark=el('select');mark.setAttribute('aria-label','查重核对结论');
  for(const [value,title]of [['','选择结论'],...Object.entries(similarityReviewLabels)]){const option=el('option',title);option.value=value;mark.append(option);}
  const note=el('textarea');note.placeholder='核对理由（可选）';note.maxLength=3000;note.setAttribute('aria-label','查重核对理由');
  const save=el('button','保存核对'),refresh=el('button','刷新记录');save.type=refresh.type='button';save.disabled=true;
  const message=el('p','正在加载核对记录…'),historyBox=el('div'),actions=el('div');message.setAttribute('role','status');historyBox.className='ar-similarity-history';actions.className='ar-actions';actions.append(mark,save,refresh);
  target.append(el('h4','查重核对'),note,actions,message,el('h4','修改记录'),historyBox);
  let history=null,pending=null,busy=false;
  try{note.value=localStorage.getItem(draftKey)||'';}catch{}
  note.oninput=()=>{try{localStorage.setItem(draftKey,note.value);}catch{}};
  const requestSignal=()=>AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)]);
  function drawHistory(){
    historyBox.replaceChildren();
    for(const entry of history.history){const item=el('div');item.append(el('strong',`${entry.reviewer_name} · ${similarityReviewLabels[entry.status]} · ${core.beijingTime(new Date(entry.created*1000).toISOString())}`),el('p',entry.reason));historyBox.append(item);}
    if(!history.history.length)historyBox.append(el('p','暂无记录。'));
  }
  async function load(initial=false){
    if(busy)return;busy=true;refresh.disabled=save.disabled=true;
    try{
      const data=await client.similarityFeedback(pair,requestSignal());if(!valid())return;
      history=data;pending=null;
      if(initial&&data.latest){mark.value=data.latest.status;if(!note.value)note.value=data.latest.reason;}
      drawHistory();message.textContent=initial?'':'已刷新，填写的理由已保留。';
    }catch(error){if(valid())message.textContent=error.message;}
    finally{busy=false;if(valid()){refresh.disabled=false;save.disabled=!history;}}
  }
  save.onclick=async()=>{
    if(busy||!history)return;
    if(!Object.hasOwn(similarityReviewLabels,mark.value)){message.textContent='请选择结论。';mark.focus();return;}
    busy=true;save.disabled=refresh.disabled=true;message.textContent='正在保存…';
    const body={...pair,status:mark.value,reason:note.value.trim(),base_revision:history.latest?.id||0},signature=JSON.stringify(body);
    if(pending?.signature!==signature)pending={signature,request_id:crypto.randomUUID()};
    try{
      let result;
      for(let attempt=0;attempt<2;attempt++){
        const token=await ensureReviewWriteAccess(record.contest_id,core);if(!valid())return;
        try{result=await client.saveSimilarityFeedback({...body,request_id:pending.request_id},requestSignal(),token);break;}
        catch(error){if(attempt===0&&[401,403].includes(error.httpStatus)){await invalidateReviewWriteAccess(record.contest_id,token);if(!valid())return;continue;}throw error;}
      }
      if(!valid())return;
      history={latest:result.feedback,history:[result.feedback,...history.history.filter(n=>n.id!==result.feedback.id)]};pending=null;match.annotation=result.feedback;
      try{localStorage.removeItem(draftKey);}catch{}
      drawHistory();message.textContent='已保存。';onSaved(result.feedback);
    }catch(error){if(valid())message.textContent=error.message;}
    finally{busy=false;if(valid())save.disabled=refresh.disabled=false;}
  };
  refresh.onclick=()=>void load();void load(true);
}

function renderCodeSimilarity(target,record,core,client,{signal,valid=()=>true,getContext=()=>({}),pairView=false,onSaved=()=>{}}={}) {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  target.replaceChildren();
  const context=getContext();
  if(context.summary){
    const members=core.members(context.summary.rows||[]);
    if(!members.has(String(record.creator_id))){target.append(el('p','此提交不属于当前班级。'));return;}

  }
  if(!target.getRootNode().querySelector('style[data-similarity-style]')){
    const style=el('style',`.ar-similarity-snippets{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin:12px 0}.ar-similarity-snippets>div{min-width:0}.ar-similarity-snippets pre{font:12px/1.6 ui-monospace,monospace;background:#f7f9fc;padding:10px;border:1px solid #dce3ed;max-height:500px;overflow:auto;white-space:pre}.ar-similarity-editor textarea{display:block;box-sizing:border-box;width:100%;min-height:90px;font:inherit;padding:10px;border:1px solid #ccd9e9;border-radius:7px}.ar-similarity-history p{white-space:pre-wrap}.ar-similarity-match{margin:12px 0}.ar-similarity-match summary{cursor:pointer;min-height:44px;padding:10px;background:#edf3ff;border-radius:7px}@media(max-width:700px){.ar-similarity-snippets{grid-template-columns:minmax(0,1fr)}.ar-similarity-editor .ar-actions>select{flex-basis:100%}.ar-similarity-editor .ar-actions>button{min-width:110px;white-space:nowrap}}`);style.dataset.similarityStyle='1';target.append(style);
  }
  const statuses={out_of_scope:'本题未开放查重。',no_match:'未发现嫌疑代码。',too_short:'代码太短，未查重。',unsupported:'此提交暂不支持查重。'};
  const exclusions=[];if(record.provided_tokens)exclusions.push('题面代码');if(record.common_tokens)exclusions.push('通用输入输出及声明');if(record.formula_tokens)exclusions.push('题目固定公式');
  if(exclusions.length)target.append(el('p','已扣除'+exclusions.join('、')+'，仅比较剩余实现。'));
  if(record.status!=='matched'){target.append(el('p',record.status==='too_short'&&exclusions.length?'扣除通用部分后，剩余代码不足以可靠查重。':statuses[record.status]));return;}
  if(!pairView)target.append(el('p',`与 ${record.peer_count} 位同学的代码相似${record.peer_count>record.matches.length?`，显示前 ${record.matches.length} 份`:''}。`));
  for(const match of record.matches){
    const ref=match.reference,ctx=getContext(),members=core.members(ctx.summary?.rows||[]),member=members.get(String(ref.creator_id)),current=members.get(String(record.creator_id));
    const currentName=current?.name||record.creator_name||'用户 '+record.creator_id,peerName=member?.name||ref.name||'用户 '+ref.creator_id;
    const details=el('details');details.className='ar-similarity-match';
    details.append(el('summary',`${(match.similarity*100).toFixed(1)}% · ${`${currentName} ↔ ${peerName} · 查看代码对照`}`));
    details.append(el('p',`提交时间：${core.beijingTime(record.submitted_at)} / ${core.beijingTime(ref.submitted_at)}`));
    
    for(const pair of match.snippets){
      const block=el('div');block.className='ar-similarity-snippets';
      for(const [alias,title]of [['current','当前提交'],['reference','对照提交']]){
        const s=pair[alias],side=el('div');side.append(el('strong',`${alias==='current'?currentName:peerName} · ${title} #${alias==='current'?record.submission_id:ref.submission_id} · 第 ${s.start_line}–${s.end_line} 行`),el('pre',s.quote));block.append(side);
      }
      details.append(block);
    }
    const actions=el('div');actions.className='ar-review-nav';
    const link=el('a','打开原提交');link.href=accodingPath('/submission/'+ref.submission_id);link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
    const full=el('button','查看完整代码');full.type='button';actions.append(full);details.append(actions);const view=el('div');details.append(view);
    full.onclick=async()=>{
      full.disabled=true;view.textContent='正在加载代码…';
      try{
        const requestSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)]);
        const peer=await client.peerSource(ref,record,requestSignal);if(!valid())return;
        const read=async source=>{
          const res=await fetch(accodingPath('/submission/'+source.submission_id),{credentials:'same-origin',cache:'no-store',signal:requestSignal});
          if(!res.ok)throw Error('OJ 源码读取失败');const node=new DOMParser().parseFromString(await res.text(),'text/html').querySelector('pre code');
          if(!node)throw Error('读不到源码，请检查 OJ 登录状态和查看权限。');
          return core.sourceFromOj(node.textContent,source.submission_id,source.code_hash);
        };
        const [currentCode,peerCode]=await Promise.all([read(record),read(peer)]);if(!valid())return;
        for(const pair of match.snippets)for(const [alias,code]of [['current',currentCode],['reference',peerCode]]){
          const s=pair[alias];if(code.split(/\r\n|\r|\n/).slice(s.start_line-1,s.end_line).join('\n')!==s.quote)throw Error('代码与查重时的记录不一致，请刷新。');
        }
        const box=el('div');box.className='ar-similarity-snippets';
        for(const [title,code]of [[`${currentName} · 当前提交 #${record.submission_id}`,currentCode],[`${peerName} · 对照提交 #${ref.submission_id}`,peerCode]]){
          const side=el('div');side.append(el('strong',title),el('pre',code.split('\n').map((line,i)=>`${String(i+1).padStart(4)}  ${line}`).join('\n')));box.append(side);
        }
        view.replaceChildren(box);full.hidden=true;
      }catch(error){if(valid())view.textContent='读取失败：'+error.message;}
      finally{full.disabled=false;}
    };
    const judgement=el('p',similarityReviewLabels[match.annotation?.status]||'未核对');judgement.className='ar-similarity-judgement';target.append(judgement,details);
    const editor=el('section');details.append(editor);let editorLoaded=false;
    details.addEventListener('toggle',()=>{if(details.open&&!editorLoaded){editorLoaded=true;mountSimilarityFeedback(editor,record,match,core,client,{signal,valid,onSaved:note=>{judgement.textContent=similarityReviewLabels[note.status];onSaved(note);}});}});
  }
}

function createCodeSimilarityPanel(container,core,client,getContext,getScope=()=>null) {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  const controls=el('div');controls.className='ar-toolbar';
  const problem=el('select');problem.setAttribute('aria-label','查重题目');
  const run=el('select');run.setAttribute('aria-label','查重运行');
  const show=el('select');show.setAttribute('aria-label','查重结果范围');
  for(const [value,title]of [['matched','嫌疑代码'],['all','全部查重记录']]){const o=el('option',title);o.value=value;show.append(o);}
  const refresh=el('button','刷新查重结果');refresh.type='button';
  const review=el('select');review.setAttribute('aria-label','查重核对状态');
  for(const [value,title]of [['queue','待核对、存疑和有抄袭'],['unreviewed','待核对'],['ordinary','无抄袭'],['uncertain','存疑'],['suspected','有抄袭'],['all','全部核对状态']]){const o=el('option',title);o.value=value;review.append(o);}
  const status=el('p','');status.setAttribute('role','status');
  const list=el('div'),pager=el('div');pager.className='pager';
  const style=el('style');style.textContent=`.ar-similarity-record{border:1px solid #dfe7f0;border-radius:10px;padding:14px;margin:12px 0;background:white}.ar-similarity-record h3{font-size:16px;margin:6px 0}.ar-similarity-match{margin:12px 0}.ar-similarity-match summary{cursor:pointer;min-height:44px;padding:10px;background:#edf3ff;border-radius:7px}.ar-similarity-snippets{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin:12px 0}.ar-similarity-snippets>div{min-width:0}.ar-similarity-snippets pre{font:12px/1.6 ui-monospace,monospace;background:#f7f9fc;padding:10px;border:1px solid #dce3ed;max-height:500px;overflow:auto;white-space:pre}.ar-similarity-record button{min-height:44px}.ar-similarity-judgement{font-weight:600}.ar-similarity-editor textarea{display:block;box-sizing:border-box;width:100%;min-height:90px;font:inherit;padding:10px;border:1px solid #ccd9e9;border-radius:7px}.ar-similarity-editor h4{margin:18px 0 8px}.ar-similarity-history p{white-space:pre-wrap;margin:6px 0}@media(max-width:700px){.ar-similarity-snippets{grid-template-columns:minmax(0,1fr)}}`;
  controls.append(reviewFilter(problem,'题目'),reviewFilter(run,'核查运行'),reviewFilter(show,'查重范围'),reviewFilter(review,'核对状态'),refresh);container.append(style,controls,status,list,pager);
  const pageCache=core.createPageCache();
  let generation=0,controller=null,page=0,active=false;
  function stop(){generation++;controller?.abort();}
  function reset(){stop();pageCache.clear();page=0;run.replaceChildren();problem.replaceChildren();list.replaceChildren();pager.replaceChildren();status.textContent='';}
  function fill(select,values,keep=select.value){select.replaceChildren();for(const [value,title]of values){const o=el('option',title);o.value=value;select.append(o);}if(values.some(([v])=>v===keep))select.value=keep;}
  async function load(discover=false){
    stop();const version=generation,ctx=getContext(),scope=getScope(),current=ctx.contest?.id;
    if(!active||!current||!ctx.summary)return;
    const context=()=>`${getContext().classId}:${getContext().contest?.id}:${getContext().generation}`;
    const key=context(),valid=()=>version===generation&&key===context()&&active;
    controller=new AbortController();const signal=controller.signal,loadSignal=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
    refresh.disabled=true;controls.setAttribute('aria-busy','true');status.textContent='正在读取代码查重结果…';list.replaceChildren();pager.replaceChildren();
    try{
      const eligible=ctx.contest.problems.filter(codeSimilarityProblemAllowed);
      fill(problem,[['all','全部题目'],...eligible.map(p=>[String(p.id),`${p.label} · ${p.title}`])],scope?.problemId?String(scope.problemId):problem.value);problem.disabled=!!scope;
      if((scope&&!eligible.some(p=>String(p.id)===String(scope.problemId)))||!eligible.length){status.textContent='本题未开放查重。';return;}
      if(discover||!run.value){
        const packet=await client.progress(current,loadSignal);if(!valid())return;
        const chosen=core.selectReviewRun(packet.runs,run.value||'latest');
        fill(run,chosen.runs.filter(r=>r.publication_ready!==false).map(r=>[r.run_id,r.run_id]),chosen.selected?.run_id);
      }
      if(!run.value){status.textContent='暂无查重结果。';return;}
      const query={run_id:run.value,contest_id:Number(current),creator_ids:[...core.members(ctx.summary.rows).keys()],offset:page*30,limit:30,pair_view:true,review_status:review.value,matched_only:show.value==='matched',
        ...(scope?{problem_id:Number(scope.problemId),submission_ids:scope.submissionIds.map(String)}:problem.value==='all'?{}:{problem_id:Number(problem.value)})};
      const cacheKey=JSON.stringify([key,query]);
      const packet=await pageCache.read(cacheKey,shared=>client.similaritySearch(query,shared),loadSignal);if(!valid())return;
      if(packet.total&&page*30>=packet.total){page=Math.floor((packet.total-1)/30);void load();return;}
      status.textContent=`全场比较 · 本班涉及 ${packet.pair_count} 对嫌疑代码，涉及 ${packet.source_count} 份提交${show.value==='all'?` · 其他记录 ${packet.status_count} 份`:''}`;
      const members=core.members(ctx.summary.rows);
      for(const record of packet.records){
        const box=el('section');box.className='ar-similarity-record';const member=members.get(String(record.creator_id)),p=ctx.contest.problems.find(p=>String(p.id)===String(record.problem_id));
        const title=`${member?.name||record.creator_name||record.creator_id} · 提交 #${record.submission_id}`;
        const ref=record.matches[0]?.reference,peer=ref&&members.get(String(ref.creator_id));
        box.append(el('h3',ref?`${title} ↔ ${peer?.name||ref.name||'用户 '+ref.creator_id} · 提交 #${ref.submission_id}`:title),el('p',p?`${p.label} · ${p.title}`:record.problem_id));
        const content=el('div');box.append(content);list.append(box);
        renderCodeSimilarity(content,{...record,run_id:run.value},core,client,{signal,valid,getContext,pairView:true,onSaved:()=>{pageCache.clear();void load();}});
      }
      const back=el('button','上一页'),next=el('button','下一页');back.type=next.type='button';back.disabled=page===0;next.disabled=(page+1)*30>=packet.total;
      back.onclick=()=>{page--;void load();};next.onclick=()=>{page++;void load();};pager.append(el('span',`${page+1} / ${Math.max(1,Math.ceil(packet.total/30))}`),back,next);
      if((page+1)*30<packet.total){const nextQuery={...query,offset:(page+1)*30};void pageCache.read(JSON.stringify([key,nextQuery]),shared=>client.similaritySearch(nextQuery,shared)).catch(()=>{});}
    }catch(error){if(valid())status.textContent=error.httpStatus===404?'当前复核服务尚未提供代码查重分支。':error.message;}
    finally{if(valid()){refresh.disabled=false;controls.removeAttribute('aria-busy');}}
  }
  for(const s of [problem,run,show,review])s.onchange=()=>{page=0;void load();};
  refresh.onclick=()=>{pageCache.clear();page=0;void load(true);};
  return {reset,invalidate:()=>pageCache.clear(),setActive(value){active=value;if(value)return load(true);stop();}};
}
