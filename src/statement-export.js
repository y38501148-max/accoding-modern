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

function markStatementHeadings(root) {
  for(const heading of root.querySelectorAll('h1,h2')){
    const text=heading.textContent.trim();
    if(!text||(text.startsWith('【')&&text.endsWith('】')))continue;
    heading.classList.add('oic-brackets');
  }
}

function markStatementCodeLines(root, doc) {
  for(const pre of root.querySelectorAll('pre')){
    const code=pre.querySelector(':scope > code');
    if(!code||code.querySelector('.code-line'))continue;
    const text=code.textContent.replace(/\r\n?/g,'\n');
    if(!text)continue;
    const lines=text.replace(/\n$/,'').split('\n');
    code.textContent='';
    for(let index=0;index<lines.length;index++){
      const line=doc.createElement('span');
      line.className='code-line';line.dataset.line=String(index+1);line.textContent=lines[index];
      code.append(line);
    }
  }
}

function compactStatementTables(root) {
  for(const table of root.querySelectorAll('table')){
    if((table.rows[0]?.cells.length||0)>=7)table.classList.add('compact');
  }
}

function clearLazyFontRanges(math) {
  const fonts=math.OutputJax?.SVG?.FONTDATA?.FONTS;
  if(!fonts)return false;
  // All SVG glyph tables are bundled. Stale lazy-load ranges in 2.7.7 otherwise
  // try to fetch CJK/fallback glyphs from the invalid offline root and hang.
  for(const font of Object.values(fonts)){
    if(!font||typeof font!=='object')continue;
    try{delete font.Ranges;}catch{}
  }
  return true;
}

// HTML-CSS output lives in the page's MathJax styles. Copy those into the
// preview iframe so the copied formulas keep their fonts and metrics.
function copyPageMathStyles(doc) {
  for(const node of document.querySelectorAll('style,link[rel="stylesheet"]')){
    const id=node.id||'',text=node.textContent||'';
    if(!/^MathJax/.test(id)&&!/MathJax|MJX_|mjx-/.test(text.slice(0,20000))&&!(node.tagName==='LINK'&&/MathJax/i.test(node.href||'')))continue;
    const copy=doc.importNode(node,true);
    copy.setAttribute('data-am-math-style','');
    doc.head.append(copy);
  }
}

// The LaTeX class adds the underdot to CJK bold text only; Latin bold stays plain.
function emphasizeStatementCjk(root) {
  const doc=root.ownerDocument,walker=doc.createTreeWalker(root,4),nodes=[];
  while(walker.nextNode()){
    const node=walker.currentNode,parent=node.parentElement;
    if(!parent||!parent.closest('strong,b')||parent.closest('.cjk-emphasis'))continue;
    if(parent.closest('pre,code,script,style,textarea,svg,.MathJax,.MathJax_SVG,.MathJax_CHTML,.MathJax_HTML,.MathJax_MathML,mjx-container'))continue;
    if(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(node.nodeValue||''))nodes.push(node);
  }
  for(const node of nodes){
    const fragment=doc.createDocumentFragment();
    for(const part of node.nodeValue.split(/([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+)/)){
      if(!part)continue;
      if(/^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+$/.test(part)){
        const span=doc.createElement('span');span.className='cjk-emphasis';span.textContent=part;fragment.append(span);
      }else fragment.append(doc.createTextNode(part));
    }
    node.replaceWith(fragment);
  }
}

function buildStatementCover(doc, statement) {
  const cover=doc.createElement('section');cover.className='cover';
  const title=doc.createElement('h1');title.className='cover-title';title.textContent=statement.contestTitle;
  const date=doc.createElement('p');date.className='cover-date';date.textContent=`时间：${statement.dateText}`;
  const table=doc.createElement('table');table.className='cover-table';
  const {columns,rows}=statementCoverTable(statement);
  const head=doc.createElement('thead'),headRow=doc.createElement('tr');
  for(const column of columns){const cell=doc.createElement('th');cell.scope='col';cell.textContent=column;headRow.append(cell);}
  head.append(headRow);
  const body=doc.createElement('tbody');
  for(const row of rows){
    const tr=doc.createElement('tr');
    for(const value of row){const cell=doc.createElement('td');cell.textContent=value;tr.append(cell);}
    body.append(tr);
  }
  table.append(head,body);cover.append(title,date,table);
  return cover;
}

function buildStatementProblem(doc, problem) {
  const section=doc.createElement('section');section.className='problem';
  const heading=doc.createElement('h1');heading.className='problem-title';heading.textContent=problem.heading;section.append(heading);
  const body=doc.createElement('div');body.className='markdown-body';
  const parsed=new DOMParser().parseFromString(pageWindow.markdown.toHTML(problem.description,'Maruku'),'text/html');
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
  body.append(...[...parsed.body.childNodes].map(n=>doc.importNode(n,true)));
  markStatementHeadings(body);markStatementCodeLines(body,doc);compactStatementTables(body);
  section.append(body);return section;
}

async function renderStatement(view, statement, isCurrent, onProgress) {
  const doc=view.document;
  doc.open();doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title></title></head><body></body></html>');doc.close();
  doc.title=statement.title;
  const style=doc.createElement('style');style.textContent=ACCODING_STATEMENT_CSS;doc.head.append(style);
  const pageStyle=doc.createElement('style');pageStyle.textContent=statementPageRules(statement);doc.head.append(pageStyle);
  const toolbar=doc.createElement('div');toolbar.className='toolbar';
  const print=doc.createElement('button');print.textContent='保存为 PDF';print.disabled=true;
  const status=doc.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');toolbar.append(print,status);doc.body.append(toolbar);
  const progress=text=>{status.textContent=text;onProgress(text);};
  const current=()=>{if(view.closed)throw new Error('Statement 窗口已关闭。');if(!isCurrent())throw new Error('已切换比赛，导出已停止。');};
  try{
    const main=doc.createElement('main');
    main.append(buildStatementCover(doc,statement));doc.body.append(main);
    for(const [index,p] of statement.problems.entries()){
      current();progress(`正在排版 ${p.heading}…`);
      const section=buildStatementProblem(doc,p);section.style.setProperty('page',`p${index}`);main.append(section);
    }
    progress('正在编译公式与加载图片…');
    const bodies=[...main.querySelectorAll('.markdown-body')];
    const pageMath=pageWindow.MathJax;
    if(!pageMath?.Hub?.Queue)throw new Error('页面 MathJax 未就绪，请刷新页面后重试。');
    clearLazyFontRanges(pageMath);
    // Reuse the MathJax already running on the OJ page. Typeset a hidden copy
    // in the page, then move the rendered formulas into the print iframe.
    const source=document.createElement('div');
    source.style.cssText='position:absolute;left:-100000px;top:0;width:160mm;font-family:"SimSun",serif;font-size:12pt;line-height:1.565';
    const clones=bodies.map(body=>{
      const clone=document.importNode(body,true);
      clone.classList.remove('markdown-body');clone.classList.add('am-statement-source-body');
      source.append(clone);return clone;
    });
    document.body.append(source);
    try{
      for(const [index,clone] of clones.entries()){
        progress(`正在复用页面公式 ${index+1}/${clones.length}…`);
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error(`公式编译超时（${statement.problems[index]?.heading||`第 ${index+1} 题`}），请重试。`)),60000);
          pageMath.Hub.Queue(['Typeset',pageMath.Hub,clone],()=>{clearTimeout(timeout);resolve();});
        });
      }
      copyPageMathStyles(doc);
      bodies.forEach((body,index)=>{body.innerHTML=clones[index].innerHTML;});
    }finally{source.remove();}
    emphasizeStatementCjk(main);
    const failed=[];
    await Promise.all([...main.querySelectorAll('img')].map(img=>new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);img.onload=img.onerror=null;if(!img.naturalWidth)failed.push(img.alt||img.src);resolve();};
      const timer=setTimeout(done,20000);img.loading='eager';img.onload=img.onerror=done;if(img.complete)done();
    })));
    await doc.fonts.ready;current();
    if(failed.length)throw new Error(`${failed.length} 张图片加载失败，未打开打印。请检查题面图片后重试：\n${failed.join('\n')}`);
    if(main.querySelector('.MathJax_Error'))throw new Error('题面中存在无法编译的公式，请检查后重试。');
    // Never print a silently broken statement when the OJ page's MathJax did not run.
    const mathText=[...main.querySelectorAll('.markdown-body p,.markdown-body li,.markdown-body td,.markdown-body th,.markdown-body h1,.markdown-body h2,.markdown-body h3')].some(node=>/\$[^$\n]+\$|\\\(|\\\[/.test(node.textContent));
    if(mathText&&!main.querySelector('.MathJax_SVG,.MathJax_CHTML,.MathJax_HTML,.MathJax_MathML,mjx-container'))throw new Error('题面公式未能渲染，请刷新页面后重试。');
    progress('排版完成。在打印窗口选择“另存为 PDF”，并关闭浏览器的“页眉和页脚”。');
    const printWithReminder=()=>{
      const message='打印窗口的“更多设置”中请取消勾选“页眉和页脚”，否则 PDF 会带上浏览器自带的日期、网址和页码。';
      if(view.confirm&&!view.confirm(message))return;
      printStatement(view,statement.title);
    };
    print.disabled=false;print.onclick=printWithReminder;printWithReminder();
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
