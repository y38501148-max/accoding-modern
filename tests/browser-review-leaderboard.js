import {createAiReviewCore} from '/src/ai-review-core.mjs';
import * as leaderboard from '/src/review-leaderboard.mjs';
Object.assign(window,leaderboard);
const host=document.querySelector('#fixture'),checks={};
const check=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
const settle=async predicate=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('等待界面超时');await new Promise(r=>setTimeout(r,5));}};
window.__leaderboardTest=(async()=>{
  let panel,calls=0,offline=false,slow=false;
  try{
    const [css,...sources]=await Promise.all(['/src/review.css','/src/code-similarity.js','/src/review-leaderboard.js','/src/ai-review.js'].map(p=>fetch(p).then(r=>r.text())));
    window.ACCODING_REVIEW_CSS=css;for(const source of sources)(0,eval)(source);
    const members=Array.from({length:23},(_,i)=>({userId:String(i+1),studentId:String(i+1).padStart(3,'0'),name:'同学'+(i+1),group:'2601',status:'matched'}));
    const ctx={classId:'a',className:'测试班',generation:1,summary:{rows:members},contest:{id:1,problems:[]},reviewContests:[{id:1,title:'C1'},{id:2,title:'C2'},{id:3,title:'E1'}]};
    const rows=members.flatMap((m,i)=>Array.from({length:i%4},(_,j)=>({submission_id:String(i*10+j+1),creator_id:m.userId,review_status:'reviewed_ai',decision_kind:'rule_feature_candidate',labels:['输入失败防护','讲解性注释']})));
    const ranked=members.map((m,i)=>({...m,aiTotal:i%4,hitTotal:i%4,history:[{contestId:'1',ai:i%4,hits:i%4},{contestId:'2',ai:null,hits:null}]})).sort((a,b)=>b.aiTotal-a.aiTotal||a.studentId.localeCompare(b.studentId));
    const client={openList:async q=>({runs:[],offset:q.offset,limit:q.limit,reviews:[],total:0}),leaderboard:async(q,signal)=>{calls++;if(slow)await new Promise(r=>setTimeout(r,50));signal?.throwIfAborted();if(offline)throw Error('offline');const ids=new Set(q.members.map(m=>m.userId)),filtered=ranked.filter(r=>ids.has(r.userId));return {rows:filtered.slice(q.offset,q.offset+10),total:filtered.length,offset:q.offset,limit:10,aiTotal:33,unmatched:0,revision:'a'.repeat(64),readAt:new Date().toISOString(),contests:[{id:'1',label:'C1'},{id:'2',label:'C2'}],packets:[{contestId:'1',runId:'r'},{contestId:'2',runId:null}]};},exportLeaderboard:async q=>{check('exportRequestsAllPagesFromServer',q.revision==='a'.repeat(64));return new Blob(['PKserver-workbook']);},search:()=>{throw Error('browser must not read reviews');},progress:()=>{throw Error('browser must not read runs');}};

    panel=createAiReviewPanel(host,{...createAiReviewCore(),featureClient:()=>client},()=>ctx,null);
    await panel.setActive(true);const find=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
    find('核查榜单').click();await settle(()=>host.querySelector('.ar-leaderboard-table'));
    const board=host.querySelector('.ar-leaderboard');
    check('tenStudentsPerPage',board.querySelectorAll('tbody tr').length===10);
    check('aiDescendingAndMissingExplicit',board.querySelector('tbody tr').textContent.includes('同学4')&&board.textContent.includes('未发布'));
    check('exportEnabledForCompletedScope',!find('导出榜单 XLSX').disabled);
    check('redundantExplanationRemoved',!board.textContent.includes('按已核查为 AI 次数降序')&&!board.textContent.includes('各比赛列为')&&!board.textContent.includes('读取于'));
    const before=calls;await panel.setActive(true);check('automaticDrawDoesNotRestart',calls===before);
    [...board.querySelectorAll('button')].find(b=>b.textContent==='下一页').click();await settle(()=>board.querySelector('tbody td')?.textContent==='11');check('pageTwoStartsAtEleven',board.querySelector('tbody td').textContent==='11');
    [...board.querySelectorAll('button')].find(b=>b.textContent==='下一页').click();await settle(()=>board.querySelectorAll('tbody tr').length===3);check('lastPageHasThree',board.querySelectorAll('tbody tr').length===3);
    const originalCreate=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;let exported;
    try{URL.createObjectURL=blob=>{exported=blob;return originalCreate(blob);};HTMLAnchorElement.prototype.click=function(){};await find('导出榜单 XLSX').onclick();check('serverWorkbookDownloaded',await exported.text()==='PKserver-workbook');}finally{URL.createObjectURL=originalCreate;HTMLAnchorElement.prototype.click=originalClick;}
    find('AI 特征复核').click();const previousCalls=calls;find('核查榜单').click();await settle(()=>board.querySelector('table'));check('reopenReadsServerSummary',calls===previousCalls+1);
    offline=true;find('刷新核查榜单').click();await settle(()=>board.textContent.includes('offline'));check('failureClearsRowsAndDisablesExport',!board.querySelector('table')&&find('导出榜单 XLSX').disabled);
    offline=false;slow=true;find('刷新核查榜单').click();await panel.setActive(false);ctx.classId='b';ctx.generation++;ctx.summary.rows=members.slice(0,1);panel.reset();await panel.setActive(true);await settle(()=>board.querySelector('table'));await new Promise(r=>setTimeout(r,100));check('scopeChangeDiscardsOldResponse',board.querySelectorAll('tbody tr').length===1&&board.querySelector('.pager').textContent.includes('共 1 人'));
    find('AI 特征复核').click();check('branchReturnRestoresAiControls',host.querySelector('[aria-label="代码状态"]').getClientRects().length>0&&board.hidden);
    const result={passed:true,checks};document.querySelector('#result').textContent=JSON.stringify(result,null,2);return result;
  }catch(error){const result={passed:false,error:error.stack,checks};document.querySelector('#result').textContent=JSON.stringify(result,null,2);return result;}
  finally{panel?.setActive(false);}
})();
