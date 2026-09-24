// Serve the repository on localhost, open browser-class-import.html, inspect
// window.__classImportRun. Storage and all production requests stay in this fixture.
window.__classImportRun = (async () => {
  const source = await (await fetch('../accoding-modern.user.js')).text();
  const bytes = await (await fetch('fixtures/legacy-roster.xls')).arrayBuffer();
  const checks = {}, requests = [], saved = new Map();
  const storage = {getItem: key => saved.get(key) ?? null, setItem: (key,value) => saved.set(key,value)};
  const originalXlsx = window.XLSX;
  const fetchStub = async (url, options) => {
    requests.push({url:String(url),method:options?.method || 'GET'});
    return new Response(String(url).includes('version.json') ? JSON.stringify({version:'1.19.1'}) : '<html></html>');
  };
  const expose = `window.__importHarness = {
    readClassWorkbook, createClassScoreXlsx,
    remount() {document.getElementById('am-classes').remove();mountClassManager(createClassCore(),createContestCore(),createUpsolveCore(),createUpsolveReader(createContestCore().time),createAiReviewCore());}
  };`;
  new Function('location','fetch','localStorage',source.replace(/\}\)\(\);\s*$/,expose+'\n})();'))(
    {origin:'https://accoding.buaa.edu.cn:4000',href:'https://accoding.buaa.edu.cn:4000/',pathname:'/',hash:''},fetchStub,storage);
  const h = window.__importHarness;
  h.saved = saved; h.requests = requests;
  const root = () => document.getElementById('am-classes').shadowRoot;
  const $ = selector => root().querySelector(selector);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const settle = async () => {for(let i=0;i<5;i++)await tick();};
  const check = (name, condition) => {checks[name]=!!condition;if(!condition)throw Error(name);};
  const select = async file => {
    const transfer = new DataTransfer(); transfer.items.add(file); $('#file').files=transfer.files;
    await $('#file').onchange();
  };
  h.select = select;
  $('.launch').click(); await settle(); $('[data-action=import]').click();
  check('both_file_extensions', $('#file').accept === '.xls,.xlsx');
  const requestsBefore = requests.length;
  await select(new File([bytes], '合成班级.xls'));
  check('auto_select_valid_sheet', $('#sheet').value === '1' && $('#sheet').options.length === 3);
  check('preview_400_students', $('#preview').textContent.includes('共 400 人') && !$('[data-action=create]').disabled);
  check('strip_xls_suffix', $('#class-name').value === '合成班级');
  check('preview_escapes_html', $('#preview').textContent.includes('<img src=x onerror=alert(1)>') && !$('#preview img'));
  check('no_reader_global', window.XLSX === originalXlsx);
  check('no_import_requests', requests.length === requestsBefore);
  $('#sheet').value='0'; $('#sheet').onchange();
  check('invalid_sheet_blocks_create', $('[data-action=create]').disabled && $('#preview').textContent.includes('找不到'));
  $('#sheet').value='1'; $('#sheet').onchange();
  $('[data-action=create]').click();
  const key='accoding-modern.classes.v1';
  const data=JSON.parse(saved.get(key));
  check('create_persists_members', data.classes.length===1 && data.classes[0].members.length===400 && data.classes[0].members[0].studentId==='00000001');
  check('only_roster_fields_saved', data.classes[0].members.every(m=>Object.keys(m).join(',')==='studentId,name,group'));
  h.remount(); $('.launch').click(); await settle();
  check('remount_retains_class', $('#class-select').selectedOptions[0].textContent.includes('合成班级') && $('#members').textContent.includes('00000001'));
  $('[data-action=import]').click();
  const xlsx=h.createClassScoreXlsx({headers:['学号','姓名'],rows:[['000456','XLSX 测试']]});
  await select(new File([xlsx], '新版名册.xlsx'));
  check('xlsx_import_compatible', $('#preview').textContent.includes('共 1 人') && $('#preview').textContent.includes('000456') && $('#class-name').value==='新版名册');
  await select(new File([xlsx], '改后缀.xls'));
  check('xlsx_content_with_xls_suffix', $('#preview').textContent.includes('共 1 人'));
  const old = new File(['invalid'], 'slow.xls');
  let rejectOld;
  old.arrayBuffer=()=>new Promise((resolve,reject)=>{rejectOld=reject;});
  const pending=select(old);
  await select(new File([xlsx], '当前.xlsx'));
  rejectOld(Error('过期错误')); await pending;
  check('stale_error_keeps_current_preview', $('#preview').textContent.includes('共 1 人') && !$('[data-action=create]').disabled);
  await select(new File(['not excel'], '损坏.xls'));
  check('invalid_file_clears_preview', $('[data-action=create]').disabled && $('#sheet').disabled && $('#sheet').options.length===0 && $('#preview').textContent.includes('不是有效'));
  check('invalid_import_preserves_saved_classes', saved.get(key)===JSON.stringify(data));
  document.getElementById('test-result').textContent=`${Object.keys(checks).length} 项浏览器检查通过`;
  return checks;
})();
window.__classImportRun.catch(error=>{document.getElementById('test-result').textContent=error.stack;});
