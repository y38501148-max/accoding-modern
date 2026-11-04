function createReviewLeaderboardPanel(host,core,client,getContext){
  let active=false,version=0,controller=null,result=null,page=0;
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);return node;};
  const button=(text,action)=>{const node=el('button',text);node.type='button';node.onclick=action;return node;};
  const toolbar=el('div'),message=el('p'),summary=el('div'),list=el('div'),pager=el('div'),head=el('div');
  toolbar.className='ar-actions ar-leaderboard-actions';message.className='ar-message';message.setAttribute('role','status');summary.className='ar-leaderboard-summary';list.className='table-wrap';pager.className='pager';
  const download=button('导出榜单 XLSX',async()=>{
    if(!result||download.disabled)return;const current=version,abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),30000);download.disabled=true;
    try{const blob=await client.exportLeaderboard(reviewLeaderboardQuery(core,getContext(),0,result.revision),abort.signal);if(current!==version)return;
      const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='核查榜单.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){if(current===version)message.textContent='导出失败：'+error.message;}
    finally{clearTimeout(timeout);if(current===version)download.disabled=false;}
  });
  toolbar.append(button('刷新核查榜单',()=>void refresh()),download);
  head.className='ar-leaderboard-head';head.append(summary,toolbar);host.append(head,message,list,pager);
  function stop(){version++;controller?.abort();controller=null;}
  function clear(){stop();result=null;download.disabled=true;download.title='';summary.replaceChildren();list.replaceChildren();pager.replaceChildren();message.textContent='';}
  function reset(){page=0;clear();}
  function show(loaded){
    result=loaded;const complete=result.packets.filter(p=>p.runId).length;
    summary.replaceChildren(el('strong',`${result.total} 位学生`),el('span',`${complete} / ${result.contests.length} 场已发布`),el('span',`已核查为 AI 合计 ${result.aiTotal} 次`));
    message.textContent=[result.unmatched?`${result.unmatched} 位学生未匹配 OJ 账号，未计入`:null,complete<result.contests.length?'合计仅含已发布场次':null].filter(Boolean).join(' · ');
    download.title=`数据读取于 ${core.beijingTime(result.readAt)}`;
    download.disabled=!complete||!result.total;draw();
  }
  function draw(){
    const table=el('table'),head=el('tr'),body=el('tbody');table.className='ar-table ar-leaderboard-table';
    for(const text of ['序号','姓名','班级','学号','已核查为 AI ↓','规则命中代码',...result.contests.map(c=>c.label)]){const th=el('th',text);if(text==='已核查为 AI ↓')th.setAttribute('aria-sort','descending');head.append(th);}
    const thead=el('thead');thead.append(head);table.append(thead);
    for(const [i,row]of result.rows.entries()){
      const tr=el('tr');for(const value of [page*10+i+1,row.name,row.leaderboardClass||row.group||'未分班',row.studentId,row.aiTotal,row.hitTotal,...row.history.map(h=>h.ai??'未发布')])tr.append(el('td',value));body.append(tr);
    }
    if(!body.children.length){const tr=el('tr'),td=el('td','暂无可统计的学生');td.colSpan=head.children.length;tr.append(td);body.append(tr);}
    table.append(body);list.replaceChildren(table);
    const previous=button('上一页',()=>{page--;void refresh();}),next=button('下一页',()=>{page++;void refresh();});previous.disabled=page===0;next.disabled=(page+1)*10>=result.total;
    pager.replaceChildren(el('span',`共 ${result.total} 人 · 每页 10 人 · ${page+1} / ${Math.max(1,Math.ceil(result.total/10))}`),previous,next);
  }
  async function refresh(){
    clear();if(!active)return;const context=getContext();if(!context.summary){message.textContent='请先读取班级名册。';return;}
    const current=version,abort=new AbortController();controller=abort;const timeout=setTimeout(()=>abort.abort(),30000);message.textContent='正在加载榜单…';
    try{
      const loaded=await loadReviewLeaderboard(client,core,context,abort.signal,page);
      if(current!==version||!active)return;show(loaded);
    }catch(error){if(current===version)message.textContent=error.name==='AbortError'?'读取超时，请刷新重试。':'榜单读取失败：'+error.message;}
    finally{clearTimeout(timeout);if(controller===abort)controller=null;}
  }
  return {reset,setActive(value){active=value;if(value)return refresh();stop();}};
}
