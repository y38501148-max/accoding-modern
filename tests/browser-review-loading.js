(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const settle=async check=>{for(let i=0;i<200;i++){if(check())return;await delay(5);}throw Error('UI did not settle');};
  const host=document.createElement('main');document.body.append(host);
  const core=createAiReviewCore(),code='int main(){return 0;}',oldCode='int main(){return 1;}';
  const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const hash=await digest(code),oldHash=await digest(oldCode);
  const run={run_id:'fixture',contest_id:1299,created_at:1,publication_ready:true,configuration_sha256:'a'.repeat(64)};
  const oldSource={submission_id:'9',creator_id:'12',contest_id:1299,problem_id:100,code_hash:oldHash,submitted_at:'2026-10-29T00:00:00+00:00',run_id:'fixture'};
  const record=id=>({...run,submission_id:id,creator_id:'12',problem_id:100,code_hash:hash,code,submitted_at:'2026-10-29T00:01:00+00:00',decision_kind:'unflagged',review_status:'rule_unmatched',annotation:null,feedback:{latest:null,history:[]},previous_submission:oldSource,reference_sources:[oldSource]});
  const nativeFetch=window.fetch,calls=[];let delayFirst=false,releaseFirst,firstStarted=false;
  window.fetch=async(url,options)=>{
    calls.push(String(url));const id=String(url).match(/submissions\/(\d+)/)?.[1]||'10';
    if(String(url)==='/submission/9')return new Response('<pre><code>'+oldCode+'</code></pre>');
    if(delayFirst&&id==='10'){firstStarted=true;await new Promise(resolve=>{releaseFirst=resolve;});}
    await delay(5);
    const body=String(url).includes('/runs?')?{runs:[run],review:record(id)}:String(url).includes('/feedback/')?{latest:null,history:[]}:record(id);
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  };
  let panel;
  try{
    // Source-only review on an OJ submission already has the source in its DOM.
    panel=createAiReviewPanel(host,core,()=>({generation:'standalone'}),null,{submissionId:'10',feedbackOnly:true,ojText:code});
    await panel.openDetail('10');assert(host.querySelector('textarea'),'standalone editor ready');
    assert(calls.length===1&&calls[0].includes('include_review=true'),'one standalone read and no duplicate current OJ source');
    panel.setActive(false);host.replaceChildren();calls.length=0;
    const context={generation:'normal',contest:{id:1299,problems:[{id:100,label:'A',title:'fixture'}]},summary:{rows:[{status:'matched',userId:'12'}]}};
    panel=createAiReviewPanel(host,core,()=>context,null);
    await panel.openDetail('10');await settle(()=>host.querySelector('[data-history-view] .ar-compare'));
    assert(calls.length===2&&calls.filter(url=>url.includes('oj-review-api')).length===1,'historical identity is bundled and only OJ reference text is fetched');
    const ojReads=calls.filter(url=>url==='/submission/9').length;
    await panel.openDetail('10');await settle(()=>host.querySelector('[data-history-view] .ar-compare'));
    assert(calls.filter(url=>url==='/submission/9').length===ojReads,'verified immutable historical source is reused');
    const note=host.querySelector('textarea');note.value='保留草稿';[...host.querySelectorAll('button')].find(b=>b.textContent==='刷新云端历史').click();await delay(25);
    assert(note.value==='保留草稿','fresh manual history preserves current draft');
    panel.setActive(false);host.replaceChildren();delayFirst=true;
    panel=createAiReviewPanel(host,core,()=>({generation:'race'}),null,{submissionId:'10',feedbackOnly:true,ojText:code});
    const first=panel.openDetail('10');await settle(()=>firstStarted);await panel.openDetail('20');
    const newDraft=host.querySelector('textarea');newDraft.value='当前提交草稿';releaseFirst();await first;
    assert(host.querySelector('textarea')===newDraft&&newDraft.value==='当前提交草稿','late old detail cannot overwrite current editor or draft');
    return {passed:true,standaloneCloudReads:1,detailCloudReads:1,referenceIdentityCloudReads:0,verifiedSourceReused:true,freshHistoryPreservesDraft:true,staleReplyIgnored:true};
  }finally{panel?.setActive(false);window.fetch=nativeFetch;host.remove();}
})()
