function createUpsolveActivationIO() {
  async function read(path,json=false,init={}) {
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...init});
    if(!response.ok)throw new Error(`读取或保存失败（HTTP ${response.status}），请检查登录与小组管理权限。`);
    const url=new URL(response.url||accodingPath(path),location.href);
    if(url.origin!==location.origin||/\/user\/login|\/login(?:\/|$)/.test(accodingPagePath(url)))throw new Error('登录已失效，请重新登录。');
    if(json){
      if(!response.headers.get('content-type')?.includes('json'))throw new Error('接口未返回比赛数据，请检查登录状态。');
      return response.json();
    }
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    if(doc.querySelector('input[type=password]'))throw new Error('登录已失效，请重新登录。');
    return doc;
  }
  function managementRows(doc,name) {
    const inputs=[...doc.querySelectorAll(`form input[name="${name}"]`)];
    if(!inputs.length||doc.querySelector('a[rel=next]'))throw new Error('无法完整读取小组管理列表，请检查管理权限。');
    const seen=new Set();
    return inputs.map(input=>{
      const access=input.closest('tr')?.querySelector('input[name=access_level]')?.value;
      if(!/^[1-9]\d*$/.test(input.value)||seen.has(input.value)||!['private','protect','public'].includes(access))throw new Error('小组权限列表格式不匹配。');
      seen.add(input.value);return {id:input.value,access};
    });
  }
  return {
    readContest:id=>read(`/api/contests/${id}`,true),
    readServerTime:()=>read('/api/contests/server_time',true),
    readGroupProblems:async group=>managementRows(await read(`/group/${group}/manage/problem`),'problem_id'),
    readGroupContests:async group=>managementRows(await read(`/group/${group}/manage/contest`),'contest_id').map(p=>p.id),
    savePermissions:async(group,problems)=>{
      // The OJ expects these exact field names and parallel arrays. JSON keeps
      // a single selected problem as an array without changing the field names.
      const body=JSON.stringify({problem_id:problems.map(p=>p.id),access_level:problems.map(p=>p.access)});
      const doc=await read(`/group/${group}/manage/problem`,false,{method:'POST',headers:{'Content-Type':'application/json'},body});
      const error=doc.querySelector('.alert-danger');
      if(error?.textContent.trim())throw new Error(error.textContent.trim());
    }
  };
}

function mountUpsolveActivation(Core) {
  if(!/^\/contest(?:-ng)?\//.test(ACCODING_APP_PATHNAME)||document.getElementById('am-upsolve-activation'))return;
  const id=()=>ACCODING_APP_PATHNAME.match(/^\/contest\/(\d+)(?:\/(?:index)?)?$/)?.[1]||(/^\/contest-ng\//.test(ACCODING_APP_PATHNAME)?location.hash.match(/^#\/(\d+)(?:\/|$)/)?.[1]:null);
  if(!/^\/contest-ng\//.test(ACCODING_APP_PATHNAME)&&!id())return;
  const host=document.createElement('div');host.id='am-upsolve-activation';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
  :host{font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#25344b}*{box-sizing:border-box}[hidden]{display:none!important}
  .launch{position:fixed;right:24px;bottom:156px;z-index:1040;max-width:calc(100vw - 32px);display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:10px 12px;background:white;border:1px solid #dfe7f0;border-radius:10px;box-shadow:0 6px 22px #18345318}.hint{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
  button{font:inherit;cursor:pointer;border:1px solid #2458d3;border-radius:7px;background:#2458d3;color:white;padding:9px 14px;min-height:44px}button:disabled{cursor:default;background:#edf1f7;color:#56667b;border-color:#d6dfeb}button:focus-visible{outline:2px solid #2458d3;outline-offset:3px}
  dialog{color:inherit;border:1px solid #dfe7f0;border-radius:14px;padding:24px;width:560px;max-width:calc(100vw - 32px);max-height:80vh;overflow:auto}dialog::backdrop{background:#17253a66}h2{margin:0 0 12px;font-size:20px}p{margin:8px 0}ul{padding-left:22px;overflow-wrap:anywhere}.close{margin-top:16px;background:white;color:#334862;border-color:#ccd7e6}
  @media(max-width:700px){.launch{right:16px;bottom:156px;flex-direction:column;gap:4px;align-items:stretch}}
  </style><div class="launch"><button type="button" disabled title="正在核验比赛状态…" aria-describedby="hint">一键开启补题</button><span class="hint" id="hint" role="status" aria-live="polite">正在核验比赛状态…</span></div><dialog aria-labelledby="result-title"><h2 id="result-title">开启补题结果</h2><div class="result"></div><button type="button" class="close">关闭</button></dialog>`;
  document.body.append(host);
  const action=root.querySelector('.launch button'),hint=root.querySelector('.hint'),dialog=root.querySelector('dialog'),result=root.querySelector('.result');
  const setHint=text=>{action.title=text;hint.textContent=text;};
  const service=createUpsolveActivation(Core,createUpsolveActivationIO());
  let generation=0,busy=false,statusTimer=null;
  root.querySelector('.close').addEventListener('click',()=>dialog.close());
  async function update(){
    if(busy)return;
    clearTimeout(statusTimer);
    const own=++generation,current=id();host.hidden=!current;action.disabled=true;
    if(!current)return;
    setHint('正在核验比赛状态…');
    try{
      const state=await service.check(current);if(own!==generation||current!==id())return;
      action.disabled=state.phase!=='finished';
      setHint(state.phase==='finished'?'将本场个人私有题目设为组内可见':state.phase==='upcoming'?'比赛未开始，不能开启补题':'比赛进行中，结束后可开启补题');
      if(state.phase!=='finished')statusTimer=setTimeout(update,Math.min(2147483647,Math.max(250,(state.phase==='upcoming'?state.contest.start:state.contest.end)-state.now+250)));
    }catch(error){if(own===generation)setHint(error.message);}
  }
  action.addEventListener('click',async()=>{
    if(busy)return;
    busy=true;generation++;action.disabled=true;action.setAttribute('aria-busy','true');
    const current=id();let outcome='';
    try{
      const report=await service.run(current,{isCurrent:()=>current===id(),onProgress:setHint});
      result.replaceChildren();
      const summary=document.createElement('p');summary.textContent=`成功 ${report.success.length} 题，跳过 ${report.skipped.length} 题，失败或待核验 ${report.failed.length} 题。`;result.append(summary);
      for(const [key,label]of [['success','成功'],['skipped','跳过'],['failed','失败或待核验']]){
        if(!report[key].length)continue;
        const list=document.createElement('ul');
        for(const p of report[key]){const li=document.createElement('li');li.textContent=`${label}：${p.label} · ${p.title}（#${p.id}）${p.reason?'：'+p.reason:''}`;list.append(li);}result.append(list);
      }
      if(current===id())dialog.showModal();
      outcome=`已处理：成功 ${report.success.length} 题，跳过 ${report.skipped.length} 题，失败或待核验 ${report.failed.length} 题`;
    }catch(error){outcome=error.message;}
    finally{busy=false;action.removeAttribute('aria-busy');await update();if(current===id()&&outcome)setHint(outcome);}
  });
  window.addEventListener('hashchange',()=>{if(!busy)update();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  update();
}
