// Run on an isolated blank page with __mountClassProblemFixture(fetch, storage) and readClassXlsx.
// An external disposable-browser harness supplies these from the built userscript and runs the checks.
// The fixture uses synthetic rosters and responses; it never writes real browser storage.
window.__classProblemRun=(async()=>{
  const checks={}, calls=[];
  const members=Array.from({length:32},(_,i)=>({studentId:String(100+i).padStart(5,'0'),name:i===0?'<img src=x onerror=alert(1)>':`测试同学 ${i}`,group:'合成班'}));
  const unresolved=[{studentId:'00998',name:'未匹配',group:'合成班'},{studentId:'00999',name:'学号冲突',group:'合成班'}];
  const roster=[...members,...unresolved];
  const saved={version:1,classes:[{id:'one',name:'合成班一',members:roster},{id:'two',name:'合成班二',members:[members[1]]}]};
  const storage={getItem:()=>JSON.stringify(saved),setItem:()=>{throw Error('Must not write storage');}};
  const contest={id:77,title:'合成比赛',start_time:'2026-09-01T00:00:00Z',end_time:'2026-09-01T02:00:00Z',problems:[
    {id:91,title:'数组练习',contest_problem_list:{order:0}},
    {id:92,title:'循环练习',contest_problem_list:{order:1}},
    {id:93,title:'无人通过',contest_problem_list:{order:2}}
  ]};
  const rank=members.map((m,i)=>({user:{id:i+1,student_id:m.studentId},detail:{A:{result:'AC'},B:{result:i===0?'AC':'WA'}}}));
  rank.push(...[998,999].map(id=>({user:{id,student_id:'00999'},detail:{A:{result:'AC'}}})));
  const submission=(id,user,problem=91,result='AC',created_at='2026-09-01T01:00:00Z')=>({id,creator_id:user,problem_id:problem,result,created_at,lang:'C'});
  const records=[...members.map((_,i)=>submission(1000+i,i+1)),submission(2000,1),submission(2000,1),submission(3000,1,92),submission(4000,1,91,'WA'),submission(5000,999),submission(6000,1,91,'AC',contest.end_time),submission(7000,1,91,'AC','2026-08-31T23:59:59Z'),submission(8000,2,91,'AC',contest.start_time)];
  let fail=false,hold=false,release=null,heldSignal=null,rankReads=0;
  let failRank=false,holdRank=false,releaseRank=null,heldRankSignal=null,rankOverride=null;
  const response=data=>({ok:true,text:async()=>JSON.stringify(data)});
  const fetch=async(url,options={})=>{
    calls.push(url);
    if(url==='/contest/index')return {ok:true,text:async()=>'<a href="/contest/77">合成比赛</a><a href="/contest/78">另一比赛</a>'};
    if(url==='/api/contests/server_time')return response({server_time:'2026-09-02T00:00:00Z'});
    if(url.endsWith('/rank')){
      rankReads++;
      if(failRank)return {ok:false,status:403};
      if(holdRank){heldRankSignal=options.signal;return new Promise(resolve=>{releaseRank=()=>resolve(response(rank));});}
      return response(rankOverride??rank);
    }
    if(url.includes('/submissions?')){
      if(hold){heldSignal=options.signal;return new Promise(resolve=>{release=()=>resolve(response(records));});}
      if(fail)return {ok:false,status:403};
      return response(records);
    }
    return response({...contest,...(url==='/api/contests/78'?{id:78,title:'另一比赛'}:{})});
  };
  window.__mountClassProblemFixture(fetch,storage);
  const root=document.querySelector('#am-classes').shadowRoot, $=s=>root.querySelector(s);
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const settle=async()=>{for(let i=0;i<5;i++)await tick();};
  const change=(selector,value,event='change')=>{$(selector).value=value;$(selector).dispatchEvent(new Event(event));};
  const count=()=>$('#accepted-count').textContent;
  const ids=()=>[...root.querySelectorAll('#accepted-table tbody tr')].map(tr=>tr.children[3]?.textContent).filter(Boolean);
  const reads=()=>calls.filter(url=>url.includes('/submissions?')).length;
  const downloads=[], urls=new Map(), originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL, originalClick=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=blob=>{const url=originalCreate.call(URL,blob);urls.set(url,blob);return url;};
  URL.revokeObjectURL=url=>{urls.delete(url);originalRevoke.call(URL,url);};
  HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push({filename:this.download,blob:urls.get(this.href)});else originalClick.call(this);};
  const exportButton=$('[data-action=export-score]'), exportFormat=$('#score-export-format');
  const readExport=async()=>{const sheets=await readClassXlsx(downloads.at(-1).blob);return sheets;};
  const unavailable=()=>{const n=downloads.length;exportButton.click();return exportButton.disabled&&exportFormat.disabled&&downloads.length===n;};
  try {
  $('.launch').click();await settle();
  checks.export_initially_disabled=unavailable()&&exportFormat.value==='xlsx';
  change('#contest-id','77','input');$('[data-action=load]').click();
  checks.export_disabled_while_loading=unavailable();
  await settle();
  const callsBeforeExport=calls.length;
  exportButton.click();
  const sheets=await readExport(), scoreRows=sheets[0].rows;
  checks.export_default_xlsx=downloads.at(-1).filename==='合成班一-合成比赛-成绩.xlsx'&&downloads.at(-1).blob.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'&&sheets.length===1&&sheets[0].name==='比赛成绩';
  checks.export_headers=JSON.stringify(scoreRows[0])===JSON.stringify(['学号','姓名','通过题数','尝试题数','A · 数组练习','B · 循环练习','C · 无人通过']);
  checks.export_all_roster_in_order=scoreRows.length===35&&JSON.stringify(scoreRows.slice(1).map(r=>r.slice(0,2)))===JSON.stringify(roster.map(m=>[m.studentId,m.name]));
  checks.export_status_and_counts=scoreRows[1].slice(2).join('|')==='2|2|AC|AC|未尝试'&&scoreRows[2].slice(2).join('|')==='1|2|AC|WA|未尝试';
  checks.export_unresolved_zero=scoreRows.slice(-2).every(r=>r.slice(2).join('|')==='0|0|未尝试|未尝试|未尝试');
  change('#search','不匹配任何人','input');change('#member-filter','missing');
  change('#score-export-format','csv');exportButton.click();
  const csv=await downloads.at(-1).blob.text(), csvBytes=new Uint8Array(await downloads.at(-1).blob.arrayBuffer());
  checks.export_csv=downloads.at(-1).filename==='合成班一-合成比赛-成绩.csv'&&downloads.at(-1).blob.type==='text/csv;charset=utf-8'&&[...csvBytes.slice(0,3)].join(',')==='239,187,191';
  checks.export_ignores_search_and_pagination=csv.split('\r\n').length===35&&roster.every(m=>csv.includes(`"${m.studentId}"`));
  checks.export_uses_loaded_data=calls.length===callsBeforeExport;
  change('#search','','input');change('#member-filter','all');
  checks.lazy_read=!$('#accepted-panel').hidden&&reads()===0;
  change('#accepted-problem','91');await settle();
  checks.unique_latest_and_time_boundaries=count()==='32 位同学 · 34 条 AC 提交 · 当前显示 32 条'&&ids().length===30&&ids()[0]==='8000'&&ids().includes('2000')&&!ids().includes('1000')&&!ids().includes('6000')&&!ids().includes('7000');
  checks.safe_text=!root.querySelector('img')&&$('#accepted-table').textContent.includes('<img src=x');
  const link=$('#accepted-table a');checks.code_link=link.getAttribute('href')==='/submission/8000'&&link.target==='_blank';
  $('#accepted-pager button:last-child').click();checks.pagination=ids().length===2&&$('#accepted-pager').textContent.includes('2 / 2');
  change('#accepted-search','100','input');checks.search_resets_page=count().startsWith('1 位同学 · 2 条')&&ids().join(',')==='2000'&&$('#accepted-pager').textContent.includes('1 / 1');
  change('#accepted-mode','all');checks.all_ac=ids().join(',')==='2000,1000';
  $('#accepted-table tbody button').click();await settle();
  checks.student_attempt_history=$('#problem-filter').value==='91'&&$('#result-filter').value==='all'&&$('#submissions').textContent.includes('4000')&&!$('#submissions').textContent.includes('3000')&&reads()===1;
  checks.no_random_picker=!$('[data-action=pick-accepted]')&&!$('#accepted-pick')&&!$('#accepted-panel').textContent.includes('随机抽');
  change('#accepted-search','','input');
  change('#accepted-problem','92');await settle();checks.switch_reuses_cache=count().startsWith('1 位同学 · 1 条')&&ids().join(',')==='3000'&&$('#student-panel').hidden&&reads()===1;
  change('#accepted-problem','93');await settle();checks.empty_state=count().startsWith('0 位同学')&&ids().length===0&&$('#accepted-table').textContent.includes('没有符合条件');
  change('#accepted-problem','91');await settle();fail=true;$('[data-action=refresh-accepted]').click();await settle();
  checks.error_clears_candidates=$('#accepted-table').textContent.includes('403')&&ids().length===0&&!$('[data-action=refresh-accepted]').disabled;
  fail=false;$('[data-action=refresh-accepted]').click();await settle();checks.retry=count().startsWith('32 位同学')&&reads()===3;
  hold=true;$('[data-action=refresh-accepted]').click();await settle();change('#accepted-problem','92');await settle();
  checks.shared_inflight=reads()===4&&ids().length===0;
  release();await settle();checks.latest_selection_wins=ids().join(',')==='3000';
  $('[data-action=refresh-accepted]').click();await settle();change('#class-select','two');
  checks.export_class_switch_invalidates=unavailable()&&exportFormat.value==='xlsx';
  checks.switch_cancels=heldSignal.aborted&&$('#accepted-panel').hidden&&$('#accepted-problem').value==='';
  release();await settle();checks.stale_result_discarded=$('#accepted-panel').hidden&&count()==='';
  hold=false;$('[data-action=load]').click();await settle();change('#accepted-problem','91');await settle();checks.new_class_isolated=count().startsWith('1 位同学 · 2 条');
  exportButton.click();const newClassRows=(await readExport())[0].rows;
  checks.export_new_class_isolated=newClassRows.length===2&&newClassRows[1][0]===members[1].studentId&&downloads.at(-1).filename==='合成班二-合成比赛-成绩.xlsx';
  change('#contest-select','78');checks.export_contest_switch_invalidates=unavailable();
  $('[data-action=load]').click();await settle();exportButton.click();
  checks.export_new_contest=downloads.at(-1).filename==='合成班二-另一比赛-成绩.xlsx';
  change('#contest-id','77','input');checks.export_manual_id_invalidates=unavailable();
  $('[data-action=load]').click();await settle();failRank=true;$('[data-action=refresh]').click();
  checks.export_refresh_clears=unavailable();await settle();checks.export_rank_failure_disabled=unavailable()&&$('#message').textContent.includes('403');
  failRank=false;holdRank=true;$('[data-action=load]').click();await settle();change('#class-select','one');
  checks.export_pending_rank_canceled=heldRankSignal.aborted&&unavailable();
  releaseRank();await settle();checks.export_stale_rank_discarded=unavailable();
  holdRank=false;rankOverride=[];$('[data-action=load]').click();await settle();exportButton.click();
  const emptyRankRows=(await readExport())[0].rows;
  checks.export_empty_rank_keeps_roster=emptyRankRows.length===35&&emptyRankRows.slice(1).every(r=>r.slice(2).join('|')==='0|0|未尝试|未尝试|未尝试');
  rankOverride=null;
  $('[data-action=close]').click();checks.export_close_invalidates=unavailable();checks.close_clears=$('.overlay').hidden&&$('#accepted-panel').hidden;
  contest.start_time='2026-10-01T00:00:00Z';contest.end_time='2026-10-01T02:00:00Z';const before=rankReads;
  $('.launch').click();await settle();$('[data-action=load]').click();await settle();checks.upcoming_no_rank=rankReads===before&&$('#accepted-panel').hidden;
  checks.export_upcoming_disabled=unavailable();
  window.__classProblemChecks=checks;
  return checks;
  } finally {
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;HTMLAnchorElement.prototype.click=originalClick;
    for(const url of urls.keys())originalRevoke.call(URL,url);
  }
})();
