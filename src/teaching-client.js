function teachingGroups(doc){
  const heading=[...doc.querySelectorAll('h1,h2,h3')].find(h=>h.textContent.trim()==='可管理的所有小组');
  if(!heading)throw Error('请先登录 OJ，再读取小组');
  const table=[...doc.querySelectorAll('table')].find(t=>heading.compareDocumentPosition(t)&4);
  return [...(table?.querySelectorAll('a[href]')||[])].flatMap(a=>{
    const url=new URL(a.getAttribute('href'),location.href),id=url.origin===location.origin?accodingPagePath(url).match(/^\/group\/(\d+)\/index$/)?.[1]:null;
    return id?[{id,name:a.textContent.trim()}]:[];
  });
}
function createTeachingClient() {
  const key='accoding-modern.teaching.connection.v1',cacheName='accoding-modern.teaching.responses.v2';
  const saved=JSON.parse((typeof GM_getValue==='function'?GM_getValue(key,''):localStorage.getItem(key))||'{}');
  let connection={url:saved.url},revision=0;
  const pending=new Map(),memory=new Map();
  const base=()=>connection.url||'https://muzermat.online:8443/oj-review-api/v4/teaching';
  async function clearCache(){revision++;pending.clear();memory.clear();await caches.delete(cacheName);}
  async function cachedRead(url,signal,load,fresh=false){
    const local=memory.get(url);if(!fresh&&local?.expires>Date.now())return local.value;
    const store=await caches.open(cacheName),version=revision,hit=await store.match(url);
    if(!fresh&&hit){const saved=await hit.json();if(saved.expires>Date.now()){memory.set(url,saved);return saved.value;}}
    const inFlight=pending.get(url);if(inFlight&&!inFlight.signal?.aborted)return inFlight.promise;
    const promise=(async()=>{const value=await load();if(version===revision){const saved={expires:Date.now()+300000,value};memory.set(url,saved);await store.put(url,new Response(JSON.stringify(saved)));}return value;})();
    pending.set(url,{promise,signal});
    try{return await promise;}finally{if(pending.get(url)?.promise===promise)pending.delete(url);}
  }
  async function request(path,{query={},body,method,signal,blob=false,cache=true}={}){
    const url=new URL(base().replace(/\/$/,'')+'/api/modern'+path);
    for(const [key,value] of Object.entries(query).sort(([a],[b])=>a.localeCompare(b)))if(value!==''&&value!=null)url.searchParams.set(key,String(value));
    const options={method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal};
    const load=async()=>{
      let response;
      if(url.origin!==location.origin&&typeof GM_xmlhttpRequest==='function'){
        response=await new Promise((resolve,reject)=>{
          const abort=()=>{handle.abort();reject(new DOMException('已取消','AbortError'));};
          const done=fn=>value=>{signal?.removeEventListener('abort',abort);fn(value);};
          const handle=GM_xmlhttpRequest({url:url.href,method:options.method,headers:options.headers,data:options.body,anonymous:true,timeout:30000,responseType:blob?'blob':'text',onload:done(r=>resolve(new Response(blob?r.response:r.responseText,{status:r.status}))),onerror:done(()=>reject(Error('教学服务连接失败，请检查地址和网络'))),ontimeout:done(()=>reject(Error('教学服务请求超时')))});
          signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
        });
      }else response=await fetch(url,{...options,credentials:'omit',cache:'no-store'});
      if(!response.ok){const data=await response.json();throw Error(data.detail||'教学服务请求失败（'+response.status+'）');}
      return blob?response.blob():response.json();
    };
    return cache&&!blob&&options.method==='GET'?cachedRead(url.href,signal,load):load();
  }
  async function groups(signal){
    const url=new URL(accodingPath('/group/index'),location.href),key=new URL(url);
    key.searchParams.set('am-account',reviewAccount(document)?.userId||'');
    return cachedRead(key.href,signal,async()=>{
      const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',signal});
      if(!response.ok)throw Error('读取 OJ 小组失败');
      return teachingGroups(new DOMParser().parseFromString(await response.text(),'text/html'));
    });
  }
  async function oj(path,signal,fresh=false){
    const url=new URL(accodingPath(path),location.href),key=new URL(url);key.searchParams.set('am-account',reviewAccount(document)?.userId||'');
    return cachedRead(key.href,signal,async()=>{
      const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',signal});
      if(!response.ok)throw Error('读取 OJ 比赛失败');
      return createContestCore().decode(await response.json());
    },fresh);
  }
  async function contests(groupId,signal){
    const url=new URL(accodingPath('/group/'+groupId+'/manage/contest'),location.href),key=new URL(url);key.searchParams.set('am-account',reviewAccount(document)?.userId||'');
    return cachedRead(key.href,signal,async()=>{
      const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store',signal});
      if(!response.ok)throw Error('读取 OJ 比赛列表失败');
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      if(doc.querySelector('input[type=password]'))throw Error('请先登录 OJ');
      return [...doc.querySelectorAll('input[name=contest_id]')].map(input=>{
        const links=[...input.closest('tr').querySelectorAll('a[href]')];
        const title=links.find(a=>accodingPagePath(new URL(a.getAttribute('href'),url)).match(new RegExp('^/contest/'+input.value+'(?:/index)?$'))&&a.textContent.trim()!==input.value);
        return {id:input.value,title:title?.textContent.trim()||'比赛 '+input.value};
      });
    });
  }
  async function connect(url=base()){
    await clearCache();connection={url:url.replace(/\/$/,'')};
    const text=JSON.stringify(connection);if(typeof GM_setValue==='function')GM_setValue(key,text);else localStorage.setItem(key,text);
    return request('/bootstrap');
  }
  return {request,base,connect,groups,contests,oj,clearCache};
}
