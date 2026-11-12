// Libraries run only in a disposable same-origin frame when export is requested.
const statementFontCache = new Map();
async function loadStatementFont(name,signal) {
  if (statementFontCache.has(name)) return statementFontCache.get(name);
  const key=`accoding-modern.pdf-fonts.v1.${name}`;
  const cached=typeof GM_getValue==='function'?GM_getValue(key,''):'';
  if (cached) {statementFontCache.set(name,cached);return cached;}
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const url=local?`${location.origin}/vendor/statement-fonts/${name}`:`https://raw.githubusercontent.com/y38501148-max/accoding-modern/1.25.1/vendor/statement-fonts/${name}`;
  const bytes=await new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('已取消导出。','AbortError'));return;}
    let request;
    const abort=()=>{request?.abort();reject(new DOMException('已取消导出。','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    const done=()=>signal?.removeEventListener('abort',abort);
    if(!local&&typeof GM_xmlhttpRequest==='function') request=GM_xmlhttpRequest({method:'GET',url,responseType:'arraybuffer',anonymous:true,timeout:60000,
      onload:response=>{done();response.status===200?resolve(new Uint8Array(response.response)):reject(new Error(`字体读取失败（HTTP ${response.status}）。`));},
      onerror:()=>{done();reject(new Error('字体下载失败，请检查 GitHub 连接后重试。'));},ontimeout:()=>{done();reject(new Error('字体下载超时，请重试。'));}});
    else fetch(url,{signal,credentials:'omit'}).then(async response=>{if(!response.ok)throw new Error(`字体读取失败（HTTP ${response.status}）。`);return new Uint8Array(await response.arrayBuffer());}).then(resolve,reject).finally(done);
  });
  if(bytes.length<1000)throw new Error('字体文件不完整，请重试。');
  let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  const value=btoa(binary);statementFontCache.set(name,value);
  try{if(typeof GM_setValue==='function')GM_setValue(key,value);}catch{/* Memory cache remains available if storage is full. */}
  return value;
}

async function createStatementPdf(statement,{signal,onProgress=()=>{}}={}) {
  const frame=document.createElement('iframe');
  frame.title='Statement PDF 排版';frame.style.cssText='position:fixed;left:-20000px;top:0;width:1000px;height:800px;border:0';
  document.body.append(frame);
  const current=()=>{if(signal?.aborted)throw new DOMException('已取消导出。','AbortError');};
  try{
    const view=frame.contentWindow,doc=view.document;
    doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');doc.close();
    onProgress('正在加载 PDF 字体（首次使用需要下载，之后复用缓存）…');
    const names=['FandolSong-Regular.otf','FandolHei-Regular.otf','FandolKai-Regular.otf','RobotoMono-Regular.ttf','lmroman12-regular.otf'];
    const values=await Promise.all(names.map(name=>loadStatementFont(name,signal)));current();
    view.eval(ACCODING_PDFMAKE_SOURCE);view.eval(ACCODING_MARKED_SOURCE);
    const families=['Song','Hei','Kai','Mono','Latin'];
    const fonts={};
    for(const [index,name] of names.entries()) {
      const bytes=Uint8Array.from(atob(values[index]),c=>c.charCodeAt(0));
      const face=new view.FontFace(families[index],bytes);await face.load();doc.fonts.add(face);
      fonts[families[index]]={normal:name,bold:name,italics:name,bolditalics:name};
    }
    await doc.fonts.ready;current();
    view.pdfMake.addVirtualFileSystem(Object.fromEntries(names.map((name,index)=>[name,values[index]])));
    const normalize=(text,display)=>normalizeStatementPdfMath(text,display,createMarkdownCore().fromOJ);
    const parser=new view.marked.Marked({gfm:true,extensions:statementMathExtensions(normalize)});
    const lex=source=>parser.lexer(String(source).replace(/\r\n?/g,'\n'));
    const formulae=statement.problems.flatMap(p=>collectStatementMath(lex(p.description)).map(t=>({...t,problem:p.heading})));
    const formulaMap=new Map();
    const container=doc.createElement('main');container.style.cssText='font-size:16px;width:605px';doc.body.append(container);
    for(const t of formulae) {
      const key=JSON.stringify([t.text,t.display]);if(formulaMap.has(key))continue;
      const span=doc.createElement('span'),script=doc.createElement('script');
      span.dataset.problem=t.problem;
      script.type=t.display?'math/tex; mode=display':'math/tex';script.textContent=t.text;span.append(script);container.append(span);formulaMap.set(key,span);
    }
    if(formulaMap.size){
      onProgress('正在编译公式…');
      view.MathJax={root:'https://accoding-mathjax.invalid',skipStartupTypeset:true,showMathMenu:false,messageStyle:'none',jax:['input/TeX','output/SVG'],extensions:[],menuSettings:{renderer:'SVG',locale:'en'},SVG:{font:'TeX',blacker:0,useGlobalCache:false}};
      view.eval(ACCODING_MATHJAX_SOURCE);
      view.MathJax.Hub.Register.StartupHook('End Cookie',()=>{
        view.MathJax.Hub.config.jax=['input/TeX','output/SVG'];
        view.MathJax.Hub.config.menuSettings.renderer='SVG';
      });
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('公式编译超时，请重试。')),30000);
        const math=view.MathJax;
        math.Hub.Queue(()=>{
          for(const [name,font] of Object.entries(math.OutputJax.SVG.FONTDATA.FONTS)) {
            if(typeof font!=='object')continue;
            delete font.Ranges;
            for(const [code,glyph] of Object.entries(ACCODING_CM_MATH[name]||{}))if(font[code])font[code]=[...glyph];
          }
        },['Typeset',math.Hub,container],()=>{clearTimeout(timer);resolve();});
      });
      current();
      for(const [key,span] of formulaMap) {
        const svg=span.querySelector('svg');
        if(!svg||span.querySelector('.MathJax_Error,.noError,merror,[data-mjx-error]')) {
          throw new Error(`${span.dataset.problem}：公式编译失败，请检查公式 ${JSON.parse(key)[0].slice(0,120)}`);
        }
        const copy=svg.cloneNode(true);
        // The reference uses 12 TeX points (11.955 PDF points). Avoid MathJax's
        // browser x-height enlargement, which made the first preview too large.
        const box=svg.getAttribute('viewBox').split(/\s+/).map(Number),em=12*72/72.27/1000;
        const width=box[2]*em,height=box[3]*em,ascent=-box[1]*em;

        // SVG-to-PDFKit needs explicit viewport dimensions, not MathJax's ex units.
        copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
        copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
        // MathJax creates namespaced hrefs with browser-generated prefixes.
        // SVG-to-PDFKit resolves the standard xlink prefix only.
        for(const use of copy.querySelectorAll('use')) {
          const href=use.getAttributeNS('http://www.w3.org/1999/xlink','href')||use.getAttribute('href');
          use.removeAttributeNS('http://www.w3.org/1999/xlink','href');
          use.setAttribute('xlink:href',href);
        }

        copy.querySelectorAll('[fill="currentColor"],[stroke="currentColor"]').forEach(el=>{for(const attr of ['fill','stroke'])if(el.getAttribute(attr)==='currentColor')el.setAttribute(attr,'#111111');});
        formulaMap.set(key,{svg:new view.XMLSerializer().serializeToString(copy),width,height,ascent,descent:height-ascent});
      }
    }
    const images=new Map();let imageTotal=0;
    const image=async url=>{
      if(images.has(url))return images.get(url);
      if(images.size>=40)throw new Error('题面图片超过 40 张。');
      current();onProgress(`正在读取图片 ${images.size+1}…`);
      const result=await fetchStatementImage(url,{signal});imageTotal+=result.bytes.length;
      if(imageTotal>25*1024*1024)throw new Error('图片总大小超过 25 MB。');
      const bitmap=await createImageBitmap(new Blob([result.bytes],{type:result.contentType}));
      const scale=Math.min(1,440/(bitmap.width*.75));
      let binary='';for(let i=0;i<result.bytes.length;i+=0x8000)binary+=String.fromCharCode(...result.bytes.subarray(i,i+0x8000));
      const node={image:`data:${result.contentType};base64,${btoa(binary)}`,width:bitmap.width*.75*scale,height:bitmap.height*.75*scale};bitmap.close();images.set(url,node);return node;
    };
    const context=doc.createElement('canvas').getContext('2d');
    const measure=(text,style)=>{context.font=`${(style.fontSize||12)/.75}px ${style.font||'Song'}`;return context.measureText(text).width*.75;};
    onProgress('正在分页并生成 PDF…');
    const definition=await statementPdfDefinition(statement,{lex,math:t=>formulaMap.get(JSON.stringify([t.text,t.display])),image,measure});current();
    const blob=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('PDF 生成超时，请重试。')),90000);
      const failure=event=>{event.preventDefault();cleanup();reject(new Error(`PDF 生成失败：${event.reason?.message||event.reason||event.message||'未知错误'}`));};
      const cleanup=()=>{clearTimeout(timer);view.removeEventListener('unhandledrejection',failure);view.removeEventListener('error',failure);};
      view.addEventListener('unhandledrejection',failure);view.addEventListener('error',failure);
      try{view.pdfMake.createPdf(definition,null,fonts).getBlob(value=>{cleanup();resolve(value);});}catch(error){cleanup();reject(error);}
    });
    current();return {filename:`${safeFilename(statement.title)}.pdf`,blob};
  }finally{frame.remove();}
}
