// Evaluate alongside ai-review-core.mjs (without export) and ai-review.js in a disposable OJ tab.
(async()=>{
  document.querySelector('#oj-batch-fixture')?.remove();
  const host=document.createElement('section');host.id='oj-batch-fixture';host.style.cssText='position:fixed;inset:20px;background:white;z-index:2147483647;overflow:auto;padding:20px';document.body.append(host);
  const root=host.attachShadow({mode:'open'});root.innerHTML='<style>:host{font:14px/1.6 system-ui}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd}.row{display:flex;gap:10px;flex-wrap:wrap}button,select{padding:6px}pre{white-space:pre-wrap}</style>';
  const panelRoot=document.createElement('div');root.append(panelRoot);
  const core=createAiReviewCore();let calls=0;
  const specs=[
    ['101','candidate','completed','review',true],['102','sample','completed','priority',true],
    ['103','sample','completed','normal',true],['104','rules_only','rules_only',null,false],
    ['105','sample','waiting_model',null,false],['106','sample','running',null,false],
    ['107','sample','context_limited','insufficient_context',false],['108','candidate','failed',null,false],
    ['109','candidate','stale','review',true],['110','candidate','completed','review',false],
    ['111','rules_only','completed','review',true]
  ];
  const reviews=specs.map(([id,selection,state,priority,performed])=>({submission_id:id,data_exists:true,state,review_priority:priority,inference_performed:performed,labels:['讲解注释'],batch:{batch_id:'test-batch',batch_name:'C1 合成验证',selection,state:selection==='rules_only'?'rules_only':state}}));
  const detail=id=>({...reviews.find(r=>r.submission_id===id),source:{code:'int main(){return 0;}'},facts:{nonempty_lines:1,raw_comment_lines:0,raw_comment_ratio:0,features:{}},evidence:[],provenance:[],annotations:[],model_result:{inference_performed:true,result:{review_priority:reviews.find(r=>r.submission_id===id).review_priority,signals:[{kind:'other',source:'current',start_line:1,end_line:1,explanation:'合成解释',evidence:'int main(){return 0;}'}],alternative_explanations:[],missing_context:[]}}});
  core.client=()=>({clear(){},query:async ids=>{calls++;return ids.map(id=>reviews.find(r=>r.submission_id===id));},detail:async id=>detail(id)});
  const metadata=reviews.map((r,i)=>({id:r.submission_id,creator_id:'u'+i,problem_id:1,created_at:'2026-09-15T11:00:00Z'}));
  metadata.push({id:'999',creator_id:'outside',problem_id:1,created_at:'2026-09-15T11:00:00Z'});
  const context={classId:'fixture',className:'合成班级',generation:1,contest:{id:1299,problems:[{id:1,label:'A',title:'测试题'}]},summary:{rows:reviews.map((r,i)=>({status:'matched',userId:'u'+i,studentId:'S'+i,name:i?'验证样本 '+i:'<img src=x onerror=alert(1)>'}))}};
  const panel=createAiReviewPanel(panelRoot,core,()=>context,async()=>metadata);panel.setActive(true);
  await new Promise(resolve=>setTimeout(resolve,100));
  const ids=()=>[...root.querySelectorAll('tbody tr')].map(r=>r.firstChild.textContent).sort();
  const text=root.textContent;
  const checks={onlyFlagged:JSON.stringify(ids())===JSON.stringify(['101','102','111']),counts:text.includes('模型标记需复核 3 条'),removedCopy:!text.includes('展示当前班级提交的代码特征'),noStateFilter:!root.querySelector('[aria-label="复核处理状态"]'),noHtmlInjection:!root.querySelector('img'),oneRead:calls===1};
  const select=root.querySelector('[aria-label="批次选入方式"]');select.value='sample';select.dispatchEvent(new Event('change'));
  checks.sampleOnlyFlagged=JSON.stringify(ids())==='["102"]';
  select.value='all';select.dispatchEvent(new Event('change'));
  const oldCreate=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;let blob;
  try{URL.createObjectURL=b=>{blob=b;return oldCreate(b);};HTMLAnchorElement.prototype.click=function(){};
    [...root.querySelectorAll('button')].find(b=>b.textContent==='导出当前结果').click();
  }finally{URL.createObjectURL=oldCreate;HTMLAnchorElement.prototype.click=oldClick;}
  const exported=JSON.parse(await blob.text());checks.exportOnlyFlagged=JSON.stringify(exported.reviews.map(r=>r.submission_id).sort())==='["101","102","111"]';
  await panel.openDetail('103');checks.normalDetailHidden=!root.textContent.includes('合成解释')&&root.textContent.includes('暂无模型标记需复核的结果');
  await panel.openDetail('101');checks.flaggedDetailVisible=root.textContent.includes('合成解释')&&root.textContent.includes('模型判断：需要复核');
  panel.setActive(false);window.ojBatchFixture={panel,host,checks};return checks;
})()
