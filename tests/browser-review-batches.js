// Evaluate alongside ai-review-core.mjs (without export) and ai-review.js in a disposable OJ tab.
(async()=>{
  document.querySelector('#oj-batch-fixture')?.remove();
  const host=document.createElement('section');host.id='oj-batch-fixture';host.style.cssText='position:fixed;inset:20px;background:white;z-index:2147483647;overflow:auto;padding:20px';document.body.append(host);
  const root=host.attachShadow({mode:'open'});root.innerHTML='<style>:host{font:14px/1.6 system-ui}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd}.row{display:flex;gap:10px;flex-wrap:wrap}button,select{padding:6px}pre{white-space:pre-wrap}</style>';
  const panelRoot=document.createElement('div');root.append(panelRoot);
  const core=createAiReviewCore();let calls=0;
  const reviews=[
    ['101','candidate','completed'],['102','sample','waiting_model'],['103','sample','context_limited'],['104','rules_only','completed']
  ].map(([id,selection,state])=>({submission_id:id,data_exists:true,state,labels:[],batch:{batch_id:'test-batch',batch_name:'C1 整场批次（合成验证）',selection,state:selection==='rules_only'?'rules_only':state}}));
  core.client=()=>({clear(){},query:async ids=>{calls++;return ids.map(id=>reviews.find(r=>r.submission_id===id));},detail:async()=>({data_exists:false,state:'not_collected'})});
  const metadata=reviews.map((r,i)=>({id:r.submission_id,creator_id:'u'+i,problem_id:1,created_at:'2026-09-15T11:00:00Z'}));
  metadata.push({id:'999',creator_id:'outside',problem_id:1,created_at:'2026-09-15T11:00:00Z'});
  const context={classId:'fixture',className:'合成班级',generation:1,contest:{id:1299,problems:[{id:1,label:'A',title:'测试题'}]},summary:{rows:reviews.map((r,i)=>({status:'matched',userId:'u'+i,studentId:'S'+i,name:i?'验证样本 '+i:'<img src=x onerror=alert(1)>'}))}};
  const panel=createAiReviewPanel(panelRoot,core,()=>context,async()=>metadata);panel.setActive(true);
  await new Promise(resolve=>setTimeout(resolve,100));
  const text=root.textContent;
  const checks={classScope:text.includes('规则已检查 4 / 4'),selectionCounts:text.includes('候选 1；抽样 2；仅规则 1'),waiting:text.includes('已选入批次，待调度 1'),limited:text.includes('上下文不足，未运行模型 1'),completed:text.includes('完成 1'),noHtmlInjection:!root.querySelector('img'),readCalls:calls};
  const select=root.querySelector('[aria-label="批次选入方式"]');select.value='sample';select.dispatchEvent(new Event('change'));
  checks.sampleRows=root.querySelectorAll('tbody tr').length===2;
  select.value='all';select.dispatchEvent(new Event('change'));
  window.ojBatchFixture={panel,host,checks};return checks;
})()
