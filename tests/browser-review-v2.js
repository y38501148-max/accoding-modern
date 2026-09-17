(async()=>{
  const checks={},calls=[];let empty=false,wrongClass=false;
  const root=document.createElement('div');root.id='review-v2-fixture';root.style='position:fixed;inset:20px;overflow:auto;z-index:2147483647;background:white;padding:24px;color:#25344b;font:14px system-ui';document.body.append(root);
  const basic={submission_id:'9900001',creator_id:'11',contest_id:1299,problem_id:1,submitted_at:'2026-09-15T12:00:00+00:00',ai_suspected:true,score:.9,threshold:.8,model_digest:'a'.repeat(64),labels:['讲解注释'],selection:'sample',batch_id:'fixture',code_hash:'b'.repeat(64)};
  const fakeFetch=async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('/progress'))return {ok:true,json:async()=>({batches:[{state:'paused',selected:805,completed:0,errors:0}]})};
    if(url.includes('/submissions/'))return {ok:true,json:async()=>({...basic,model_name:'fixture',code:'// <img src=x onerror="window.__reviewInjected=true">\nint main(void){return 0;}',evidence:[],explanation:'模型标记有 AI 生成嫌疑。'})};
    const q=JSON.parse(options.body);return {ok:true,json:async()=>({total:empty?0:31,reviews:empty?[]:[{...basic,submission_id:String(9900001+q.offset),creator_id:wrongClass?'22':'11'}]})};
  };
  const raw=window.__reviewV2Core();const core={...raw,client:()=>raw.client(()=>'fixture-token',fakeFetch)};
  const context={classId:'fixture',className:'测试班级',generation:1,contest:{id:1299,problems:[{id:1,label:'A',title:'测试题'}]},summary:{rows:[{status:'matched',userId:'11',name:'测试学生',studentId:'000001'}]}};
  let metadataCalls=0;const panel=window.__reviewV2Panel(root,core,()=>context,()=>{metadataCalls++;throw Error('Full metadata must not be requested');});
  const tick=()=>new Promise(resolve=>setTimeout(resolve,30));panel.setActive(true);await tick();
  checks.only_positive=root.querySelectorAll('tbody tr').length===1&&root.textContent.includes('有 AI 生成嫌疑');
  checks.no_full_metadata=metadataCalls===0;
  checks.member_query=calls.find(x=>x.body)?.body.creator_ids.join(',')==='11';
  checks.paused_visible=root.textContent.includes('已暂停');
  [...root.querySelectorAll('button')].find(x=>x.textContent==='下一页').click();await tick();
  checks.server_pagination=calls.some(x=>x.body?.offset===30)&&root.textContent.includes('9900031');
  [...root.querySelectorAll('button')].find(x=>x.textContent==='查看复核').click();await tick();
  checks.safe_source=root.textContent.includes('<img src=x')&&!root.querySelector('img')&&!window.__reviewInjected;
  empty=true;[...root.querySelectorAll('button')].find(x=>x.textContent==='刷新结果').click();await tick();
  checks.empty_keeps_pause=root.querySelectorAll('tbody tr').length===0&&root.textContent.includes('已暂停')&&root.textContent.includes('0 条提交');
  empty=false;wrongClass=true;[...root.querySelectorAll('button')].find(x=>x.textContent==='刷新结果').click();await tick();
  checks.mixed_class_is_error=root.textContent.includes('当前班级不一致')&&root.querySelectorAll('tbody tr').length===0;
  panel.setActive(false);root.remove();window.__reviewV2Checks=checks;
  return checks;
})();
