// Local acceptance preview of the actual userscript and the embedded teaching API.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
const root=new URL('../',import.meta.url),port=Number(process.env.OJ_PEEKER_PREVIEW_PORT||18765);
const agentRoot=process.env.OJ_AGENT_ROOT||homedir()+'/.config/oj-review/agent';
const agent=process.env.OJ_AGENT_URL||'http://127.0.0.1:18798';
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  try{
    if(url.pathname==='/collector'){
      const token=(await readFile(agentRoot+'/session-token','utf8')).trim();
      const response=await fetch(agent+'/api/session-links',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({route:'home'})});
      const link=await response.json();if(!response.ok)throw Error(link.detail||'无法打开本机采集页');
      res.writeHead(302,{Location:link.url});res.end();return;
    }
    if(url.pathname.startsWith('/review-api/')){
      const headers={'User-Agent':'Mozilla/5.0'};for(const name of ['content-type','authorization','x-review-state-protocol'])if(req.headers[name])headers[name]=req.headers[name];
      const response=await fetch('https://muzermat.online:8443/oj-review-api/v4/'+url.pathname.slice('/review-api/'.length)+url.search,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half'});
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(/^\/submission\/\d+$/.test(url.pathname)){res.writeHead(302,{Location:'https://accoding.buaa.edu.cn:4000'+url.pathname});res.end();return;}
    if(url.pathname==='/submission/index'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const fields=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));fields.offset=url.searchParams.get('offset')||'0';
      const token=(await readFile(agentRoot+'/session-token','utf8')).trim();
      const response=await fetch(agent+'/api/teaching/submission-page',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(fields)});
      res.writeHead(response.status,{'Content-Type':'text/html; charset=utf-8'});res.end(await response.text());return;
    }
    if(/^\/group\/\d+\/manage\/contest$/.test(url.pathname)||/^\/api\/contests\/\d+(?:\/rank)?$/.test(url.pathname)){
      const token=(await readFile(agentRoot+'/session-token','utf8')).trim();
      const response=await fetch(agent+'/api/teaching/oj-read',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({path:url.pathname})});
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'text/html'});res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(url.pathname.startsWith('/teaching/')){
      const response=await fetch(agent+url.pathname+url.search,{method:req.method,headers:{...req.headers,host:'127.0.0.1:18798',origin:agent,'accept-encoding':'identity'},body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half'});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(url.pathname==='/preview.user.js'){
      let script=await readFile(new URL('preview/accoding-modern.preview.user.js',root),'utf8');
      script=script.replace('client.groups(controller.signal)',"client.request('/bootstrap',{signal:controller.signal}).then(b=>b.courses.map(c=>({id:c.groupId,name:c.name})))");
      script=script.replace('const ACCODING_MODERN_IS_APP = ACCODING_DIRECT_ORIGINS.has(location.origin) || Boolean(ACCODING_VPN_PREFIX);','const ACCODING_MODERN_IS_APP = true;');
      script=script.replace("function reviewFetch(url,options={}) {","function reviewFetch(url,options={}) { if(url.startsWith('https://muzermat.online:8443/oj-review-api/v4/'))return fetch('/review-api/'+url.slice('https://muzermat.online:8443/oj-review-api/v4/'.length),options);");
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(script);return;
    }
    if(url.pathname==='/config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end("if(JSON.parse(localStorage.getItem('accoding-modern.teaching.connection.v1')||'{}').url!==location.origin+'/teaching')localStorage.setItem('accoding-modern.teaching.connection.v1',JSON.stringify({url:location.origin+'/teaching'}));");return;}
    if(url.pathname==='/start.js'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end("document.querySelector('#am-classes').shadowRoot.querySelector('.launch').click();");return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OJ Modern · 教学工作台预览</title><style>body{margin:0;background:#f6f8fa;font-family:system-ui}body>p{padding:32px}</style></head><body><p>正在加载教学工作台…</p><script src="/config.js"></script><script src="/preview.user.js"></script><script src="/start.js"></script></body></html>`);
  }catch(error){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({detail:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Peeker preview: http://127.0.0.1:'+port+'/'));
