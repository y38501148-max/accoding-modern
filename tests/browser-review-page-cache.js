(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const settle=async check=>{for(let i=0;i<250;i++){if(check())return;await delay(5);}throw Error('UI did not settle');};
  const core=createAiReviewCore(),host=document.createElement('main');document.body.append(host);
  const code='int main(){return 0;}',hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const run={run_id:'cached',contest_id:1,created_at:1,publication_ready:true},queries=[],writes=[];let latest=null,finished=0;
  const records=Array.from({length:65},(_,i)=>({submission_id:String(i+1),creator_id:'12',problem_id:100,contest_id:1,run_id:'cached',code,code_hash:hash,decision_kind:'unflagged',review_status:'rule_unmatched',submitted_at:'2026-10-29T00:00:00+00:00',result:{label:[],reason:'fixture'}}));
  const client={
    openList:async query=>{queries.push(structuredClone(query));await delay(15);finished++;return {runs:[run],run_id:'cached',total:65,offset:query.offset,limit:query.limit,reviews:structuredClone(records.slice(query.offset,query.offset+query.limit))};},
    openReview:async id=>({record:{...records.find(r=>r.submission_id===id),feedback:{latest,history:latest?[latest]:[]}}}),
    session:async()=>({write_authenticated:true,review_state_protocol:2,human_statuses:['ordinary','uncertain','suspected']}),
    feedback:async()=>({latest,history:latest?[latest]:[]}),
    saveFeedback:async body=>{writes.push(body);latest={...body,id:1,created:1,reviewer_name:'测试助教'};return {saved:true};},
  };
  const ctx={generation:1,classId:'class-a',className:'测试班',contest:{id:1,problems:[{id:100,label:'F',title:'fixture'}]},summary:{rows:[{userId:'12',status:'matched'}]}};
  const panel=createAiReviewPanel(host,{...core,featureClient:()=>client},()=>ctx,null);
  const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text),page=n=>host.querySelector('.pager')?.textContent.includes(n+' / 3');
  try{
    await panel.setActive(true);await settle(()=>finished===2);assert(queries.length===2,'initial page preloads exactly the next page');
    button('下一页').click();await settle(()=>page(2)&&finished===3);assert(queries.length===3,'page 2 uses prefetch and only starts page 3 prefetch');
    const count=queries.length;button('上一页').click();await settle(()=>page(1));button('下一页').click();await settle(()=>page(2));
    assert(queries.length===count,'visited page switches have zero fetches');
    await panel.openDetail('31');const mark=host.querySelector('[aria-label="人工复核结论"]');mark.value='uncertain';
    assert(host.querySelector('textarea').value==='','reason starts blank');await button('保存结论').onclick();
    assert(writes.length===1&&writes[0].reason==='','AI review saves an empty optional reason');
    button('返回列表').click();await settle(()=>queries.length>count);await delay(40);
    const afterSave=queries.length;button('刷新云端结果').click();await settle(()=>queries.length>afterSave);await delay(40);
    const beforeClass=queries.length;ctx.classId='class-b';ctx.generation++;await panel.setActive(true);assert(queries.length>beforeClass,'class switch cannot reuse the other class page');
    return {passed:true,prefetchNext:true,visitedPageFetches:0,saveInvalidates:true,manualRefreshInvalidates:true,classIsolation:true,blankAiReasonSaved:true};
  }finally{panel.setActive(false);host.remove();}
})()
