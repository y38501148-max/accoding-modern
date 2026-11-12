// Local review only: serve the actual build against an isolated, in-memory OJ.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const port=Number(process.env.OJ_PREVIEW_PORT||18764);
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  try{
    let file,type;
    if(url.pathname==='/preview.user.js'){
      const source=(await readFile(new URL('accoding-modern.user.js',root),'utf8'))
        .replace('const ACCODING_MODERN_IS_APP = ACCODING_DIRECT_ORIGINS.has(location.origin) || Boolean(ACCODING_VPN_PREFIX);','const ACCODING_MODERN_IS_APP = true;');
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(source);return;
    }
    if(url.pathname==='/accoding-modern.user.js'){file='accoding-modern.user.js';type='text/javascript';}
    else if(['/preview.js','/review-data.js','/preview-start.js'].includes(url.pathname)){file='preview'+url.pathname;type='text/javascript';}
    else if(url.pathname==='/preview.css'){file='preview/preview.css';type='text/css';}
    else if(url.pathname.startsWith('/tests/')||url.pathname.startsWith('/src/')||url.pathname.startsWith('/vendor/')){
      if(url.pathname.includes('..'))throw Error('Invalid path');
      file=url.pathname.slice(1);type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.xls')?'application/vnd.ms-excel':'text/javascript';
    }else{file='preview/index.html';type='text/html';}
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(new URL(file,root)));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`OJ Modern preview: http://127.0.0.1:${port}/contest/index`));
