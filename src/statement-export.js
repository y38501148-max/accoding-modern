// Native PDF printing keeps Chinese text selectable and MathJax formulas sharp.
function printStatement(view, title) {
  // Chrome uses the top-level title for an iframe's default PDF filename.
  const owner=view.parent.document,previous=owner.title,dialog=view.frameElement?.closest('dialog');
  const restore=()=>{
    view.removeEventListener('afterprint',restore);dialog?.removeEventListener('close',restore);
    if(owner.title===title)owner.title=previous;
  };
  view.addEventListener('afterprint',restore);dialog?.addEventListener('close',restore);
  owner.title=title;
  try{view.focus();view.print();}catch(error){restore();throw error;}
}

async function renderStatement(view, statement, isCurrent, onProgress) {
  const doc=view.document;
  doc.open();doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title></title></head><body></body></html>');doc.close();
  doc.title=statement.title;
  const style=doc.createElement('style');style.textContent=`
    @page{size:A4;margin:0}
    *{box-sizing:border-box}body{margin:0;color:#111;background:white;font:11pt/1.65 "Noto Serif CJK SC","Songti SC","SimSun",serif}
    main{max-width:176mm;margin:24px auto;padding:0 4mm}h1{text-align:center;font-size:20pt;line-height:1.4;margin:0 0 22px}header h1{font-size:24pt;margin:0 0 28px}
    .problem+.problem{break-before:page;page-break-before:always}h2{font-size:15pt;margin:20px 0 8px}h3{font-size:12pt;margin:16px 0 6px}h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}
    p{margin:8px 0;overflow-wrap:anywhere}ul,ol{padding-left:2em}blockquote{margin:12px 0;padding:0 14px;border-left:3px solid #bbb;color:#444}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;padding:10px 12px;border:1px solid #ddd;background:#f7f7f7;line-height:1.5}code{font:9pt/1.5 ui-monospace,"SFMono-Regular",Consolas,monospace}pre code{white-space:inherit}pre,table,figure,img{break-inside:avoid;page-break-inside:avoid}
    img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border:1px solid #aaa}a{color:inherit;text-decoration:underline}svg{max-width:100%}.MathJax_SVG_Display{overflow:visible!important}
    .print-sheet{border:0;break-inside:auto;page-break-inside:auto}.print-sheet>tbody>tr>td,.print-sheet>thead>tr>td,.print-sheet>tfoot>tr>td{padding:0;border:0;vertical-align:top}.print-sheet>thead,.print-sheet>tfoot{display:none}
    .toolbar{position:sticky;top:0;padding:14px 20px;background:#edf3ff;border-bottom:1px solid #ccd7e6;font:14px/1.6 sans-serif}.toolbar button{font:inherit;padding:7px 14px;margin-right:12px;cursor:pointer}.toolbar [role=status]{white-space:pre-wrap}
    #MathJax_Message{display:none!important}
    @media print{main{max-width:none;margin:0;padding:0 17mm}.toolbar{display:none}a{text-decoration:none}.print-sheet>thead{display:table-header-group}.print-sheet>tfoot{display:table-footer-group}.print-sheet>thead>tr>td,.print-sheet>tfoot>tr>td{height:18mm}}
  `;doc.head.append(style);
  const toolbar=doc.createElement('div');toolbar.className='toolbar';
  const print=doc.createElement('button');print.textContent='保存为 PDF';print.disabled=true;
  const status=doc.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');toolbar.append(print,status);doc.body.append(toolbar);
  const progress=text=>{status.textContent=text;onProgress(text);};
  const current=()=>{if(view.closed)throw new Error('Statement 窗口已关闭。');if(!isCurrent())throw new Error('已切换比赛，导出已停止。');};
  try{
    const main=doc.createElement('main'),header=doc.createElement('header'),title=doc.createElement('h1');title.textContent=statement.title;header.append(title);
    // Repeated blank rows supply page margins without leaving room for the
    // browser's automatic URL, date and title headers/footers.
    const sheet=doc.createElement('table');sheet.className='print-sheet';sheet.innerHTML='<thead><tr><td></td></tr></thead><tbody><tr><td></td></tr></tbody><tfoot><tr><td></td></tr></tfoot>';
    const content=sheet.tBodies[0].rows[0].cells[0];content.append(header);main.append(sheet);doc.body.append(main);
    for(const p of statement.problems){
      current();progress(`正在排版 ${p.label} 题…`);
      const section=doc.createElement('section');section.className='problem';const heading=doc.createElement('h1');heading.textContent=`${p.label}  ${p.title}`;section.append(heading);
      const body=doc.createElement('div');body.className='markdown-body';
      const parsed=new DOMParser().parseFromString(pageWindow.markdown.toHTML(p.description,'Maruku'),'text/html');
      parsed.querySelectorAll('script,iframe,object,embed,link,meta,base,style,form,input,button,textarea').forEach(n=>n.remove());
      for(const node of parsed.body.querySelectorAll('*'))for(const attr of [...node.attributes]){
        if(/^on/i.test(attr.name)||['srcdoc','srcset'].includes(attr.name))node.removeAttribute(attr.name);
        if(['href','src','xlink:href'].includes(attr.name)){
          if(attr.name==='src'&&node.tagName==='IMG'&&/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(attr.value))continue;
          const url=new URL(attr.value,location.href);
          if(!['https:','http:'].includes(url.protocol))node.removeAttribute(attr.name);
          else{if(url.origin===location.origin)url.pathname=accodingPath(url.pathname);node.setAttribute(attr.name,url.href);}
        }
      }
      body.append(...[...parsed.body.childNodes].map(n=>doc.importNode(n,true)));section.append(body);content.append(section);
    }
    progress('正在编译公式与加载图片…');
    view.MathJax={root:'https://accoding-mathjax.invalid',skipStartupTypeset:true,showMathMenu:false,messageStyle:'none',jax:['input/TeX','output/SVG'],extensions:[],menuSettings:{renderer:'SVG',locale:'en'},tex2jax:{inlineMath:[['$','$'],['\\(','\\)']],displayMath:[['$$','$$'],['\\[','\\]']],processEscapes:true},SVG:{font:'TeX',useGlobalCache:false}};
    // Keep the bundled renderer offline, including glyph paths, on VPN routes.
    view.eval(ACCODING_MATHJAX_SOURCE);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('公式编译超时，请重试。')),20000);
      const math=view.MathJax;
      math.Hub.Queue(()=>{
        // All SVG glyph tables are already bundled. Stale lazy-load ranges in
        // 2.7.7 otherwise fail when a formula uses CJK or a fallback symbol.
        for(const font of Object.values(math.OutputJax.SVG.FONTDATA.FONTS))if(typeof font==='object')delete font.Ranges;
      },['Typeset',math.Hub,main],()=>{clearTimeout(timeout);resolve();});
    });
    const failed=[];
    await Promise.all([...main.querySelectorAll('img')].map(img=>new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);img.onload=img.onerror=null;if(!img.naturalWidth)failed.push(img.alt||img.src);resolve();};
      const timer=setTimeout(done,20000);img.loading='eager';img.onload=img.onerror=done;if(img.complete)done();
    })));
    await doc.fonts.ready;current();
    if(failed.length)throw new Error(`${failed.length} 张图片加载失败，未打开打印。请检查题面图片后重试：\n${failed.join('\n')}`);
    if(main.querySelector('.MathJax_Error'))throw new Error('题面中存在无法编译的公式，请检查后重试。');
    progress('排版完成。在打印窗口选择“另存为 PDF”。');
    print.disabled=false;print.onclick=()=>printStatement(view,statement.title);printStatement(view,statement.title);
  }catch(error){progress('导出失败：'+error.message);throw error;}
}

function mountStatementExport(Core) {
  const root=document.getElementById('am-upsolve-activation')?.shadowRoot;
  if(!root)return;
  const action=document.createElement('button');action.type='button';action.className='statement-export';action.textContent='一键导出 Statement';action.title='汇编本场全部题面，编译公式并保存为 PDF';root.querySelector('.launch').append(action);
  const status=document.createElement('span');status.className='hint';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.querySelector('.launch').append(status);
  const id=()=>ACCODING_APP_PATHNAME.match(/^\/contest\/(\d+)(?:\/(?:index)?)?$/)?.[1]||location.hash.match(/^#\/(\d+)(?:\/|$)/)?.[1];
  action.addEventListener('click',async()=>{
    if(action.disabled)return;
    const progress=text=>{status.textContent=text;action.title=text;};
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:min(1000px,95vw);height:92vh;max-width:95vw;max-height:95vh;padding:0;border:1px solid #ccd7e6;border-radius:10px;background:white;overflow:hidden';
    const close=document.createElement('button');close.type='button';close.textContent='关闭 Statement';close.style.cssText='display:block;margin:8px 12px;padding:6px 12px;cursor:pointer';
    const frame=document.createElement('iframe');frame.title='Statement PDF 预览';frame.style.cssText='display:block;width:100%;height:calc(100% - 52px);border:0;background:white';
    dialog.append(close,frame);document.body.append(dialog);dialog.showModal();
    close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    const view=frame.contentWindow;
    const current=id();action.disabled=true;action.setAttribute('aria-busy','true');
    view.document.body.textContent='正在读取本场比赛题面…';
    try{
      if(!pageWindow.markdown?.toHTML)throw new Error('题面渲染器尚未加载，请刷新页面重试。');
      const value=await createUpsolveActivationIO().readContest(current);
      if(current!==id())throw new Error('已切换比赛，导出已停止。');
      await renderStatement(view,createStatementCore(Core).compile(value,current),()=>frame.isConnected&&current===id(),progress);
    }catch(error){progress('导出失败：'+error.message);if(!view.closed){const notice=view.document.createElement('p');notice.textContent='导出失败：'+error.message;view.document.body.prepend(notice);}}
    finally{action.disabled=false;action.removeAttribute('aria-busy');}
  });
}
