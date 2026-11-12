// Browser-only PDF layout. Markdown code is never evaluated; TeX is rendered
// to SVG by the bundled MathJax. No document content is sent to a PDF service.
export function statementMathExtensions(normalizeMath = value => value) {
  const read = (source, block) => {
    const start = block ? /^(?: {0,3})(\$\$|\\\[)/.exec(source) : /^(\$\$|\$|\\\(|\\\[)/.exec(source);
    if (!start) return;
    const open = start[1], close = {'\\[':'\\]', '\\(':'\\)'}[open] || open;
    let end = source.indexOf(close, start[0].length);
    while (end >= 0 && source[end - 1] === '\\') end = source.indexOf(close, end + close.length);
    if (end < 0) return;
    const text = source.slice(start[0].length, end).trim();
    if (!text || (open === '$' && text.includes('\n'))) return;
    return {type:'amMath', raw:source.slice(0, end + close.length), text:normalizeMath(text), display:block || open === '$$' || open === '\\['};
  };
  return [
    {name:'amMath', level:'block', start:source=>source.search(/(?:^|\n) {0,3}(?:\$\$|\\\[)/), tokenizer:source=>read(source,true)},
    {name:'amMath', level:'inline', start:source=>source.search(/\$|\\[([]/), tokenizer:source=>read(source,false)}
  ];
}

export function collectStatementMath(tokens, result = []) {
  for (const token of tokens || []) {
    if (token.type === 'amMath') result.push(token);
    if (token.tokens) collectStatementMath(token.tokens,result);
    if (token.items) for (const item of token.items) collectStatementMath(item.tokens,result);
    if (token.type === 'table') for (const cell of [...token.header,...token.rows.flat()]) collectStatementMath(cell.tokens,result);
  }
  return result;
}

const PAGE_WIDTH = 595.28, MARGIN = 70.87, WIDTH = PAGE_WIDTH - MARGIN * 2;
const decode = value => String(value || '').replace(/&(?:amp|lt|gt|quot|#39);/g, v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[v]));

export async function statementPdfDefinition(statement, options) {
  const {lex, math, image, measure} = options;
  const blocks = statement.problems.map(p=>lex(p.description));
  const inline = async (tokens, style = {}) => {
    const result = [];
    for (const t of tokens || []) {
      if (t.type === 'amMath') result.push({...math(t),kind:'graphic',...style});
      else if (t.type === 'image') result.push({...await image(t.href),kind:'graphic',...style});
      else if (t.type === 'br') result.push({text:'\n',...style});
      else if (t.type === 'strong' || t.type === 'em' || t.type === 'del' || t.type === 'link') {
        const extra = t.type === 'strong' ? {font:'Hei'} : t.type === 'em' ? {italics:true} : t.type === 'del' ? {decoration:'lineThrough'} : /^https?:\/\//i.test(t.href) ? {link:t.href,decoration:'underline'} : {};
        result.push(...await inline(t.tokens,{...style,...extra}));
      } else if (t.type === 'codespan') result.push({text:decode(t.text),font:'Mono',fontSize:10,...style});
      else if (t.tokens) result.push(...await inline(t.tokens,style));
      else if (t.type === 'html') {
        if (/^<br\s*\/?/i.test(t.text)) result.push({text:'\n',...style});
        else if (!/^<[^>]+>$/.test(t.text)) throw new Error('题面包含暂不支持的 HTML 内容，请先转换为 Markdown。');
      } else result.push({text:decode(t.text ?? t.raw).replace(/\n/g,' '),...style});
    }
    return result;
  };

  // PDFMake's text runs cannot contain SVG. Lay out mixed paragraphs one line
  // at a time, keeping both text and SVG as PDF vectors and preventing clipping.
  async function paragraph(tokens, width = WIDTH, style = {}) {
    const parts = (await inline(tokens,style)).flatMap(part=>part.kind==='graphic'||part.font==='Mono'?[part]:String(part.text).split(/([\x00-\x7f]+)/).filter(Boolean).map(text=>({...part,text,font:/^[\x00-\x7f]+$/.test(text)?'Latin':part.font})));
    if (!parts.some(p=>p.kind === 'graphic')) return [{text:parts,margin:[0,2,0,6]}];
    const lines = []; let line = [], used = 0;
    const flush = () => {if (line.length) lines.push(line);line=[];used=0;};
    for (const part of parts) {
      if (part.kind === 'graphic') {
        const ratio = Math.min(1,width/part.width), p = {...part,width:part.width*ratio,height:part.height*ratio};
        if (used + p.width > width) flush();
        line.push(p); used += p.width; continue;
      }
      for (const segment of new Intl.Segmenter('zh',{granularity:'word'}).segment(part.text)) {
        const chars = measure(segment.segment,part) > width ? [...segment.segment] : [segment.segment];
        for (const text of chars) {
          if (text === '\n') {flush();continue;}
          const size = measure(text,part);
          if (used + size > width + 0.05) flush();
          if (!used && /^\s+$/.test(text)) continue;
          const last = line.at(-1);
          if (last && last.kind !== 'graphic' && last._style === part) {last.text += text;last.width += size;}
          else line.push({...part,text,width:size,_style:part});
          used += size;
        }
      }
    }
    flush();
    return lines.map((items,index)=>{
      const ascent=Math.max(9.6,...items.map(p=>p.ascent || (p.fontSize||12)*.8));
      const descent=Math.max(2.4,...items.map(p=>p.descent || (p.fontSize||12)*.2));
      const height=Math.max(17,ascent+descent);
      return {columns:items.map(({kind,height:h,ascent:a,descent:d,_style,...p})=>kind === 'graphic'
        ? {...p,height:h,margin:[0,ascent-(a||h),0,0]}
        : {...p,noWrap:true,lineHeight:1,margin:[0,ascent-(p.fontSize||12)*.8,0,Math.max(0,height-ascent-descent)]}),columnGap:0,margin:[0,1,0,index===lines.length-1?6:1],unbreakable:true};
    });
  }
  async function render(tokens,width = WIDTH,style = {}) {
    const result=[];
    for (const t of tokens) {
      if (t.type === 'space' || t.type === 'def') continue;
      if (t.type === 'heading') result.push({text:`【${decode(t.text)}】`,font:'Hei',fontSize:13,margin:[0,11,0,6],headlineLevel:2});
      else if (t.type === 'paragraph' || t.type === 'text') result.push(...await paragraph(t.tokens || [{type:'text',text:t.text}],width,style));
      else if (t.type === 'amMath') {
        const p=math(t),ratio=Math.min(1,width/p.width);
        result.push({...p,width:p.width*ratio,height:p.height*ratio,alignment:'center',margin:[0,7,0,7]});
      } else if (t.type === 'code') {
        const lines=t.text.replace(/\t/g,'    ').split('\n');
        result.push({table:{widths:[24,'*'],body:lines.map((line,index)=>[
          {text:String(index+1),font:'Mono',fontSize:8,color:'#888888',alignment:'right'},
          {text:(line || ' ').split(/([\u3400-\u9fff]+)/).filter(Boolean).map(text=>({text,font:/[\u3400-\u9fff]/.test(text)?'Song':'Mono'})),fontSize:10,preserveLeadingSpaces:true}
        ])},layout:{hLineWidth:(i,node)=>i===0||i===node.table.body.length?0.5:0,vLineWidth:i=>i===0||i===2?0.5:0,hLineColor:()=> '#2860a0',vLineColor:()=> '#2860a0',paddingTop:()=>2,paddingBottom:()=>2,paddingLeft:()=>5,paddingRight:()=>5},margin:[0,5,0,8]});
      } else if (t.type === 'blockquote') result.push({stack:await render(t.tokens,width-24,{...style,font:'Kai'}),margin:[18,3,6,6]});
      else if (t.type === 'list') {
        const items=await Promise.all(t.items.map(async item=>({stack:await render(item.tokens,width-22,style)})));
        result.push({[t.ordered?'ol':'ul']:items,...(t.ordered?{start:t.start}:{}),margin:[6,2,0,5]});
      } else if (t.type === 'table') {
        const cellWidth=(width-16*t.header.length)/t.header.length;
        const row=async(cells,heading)=>Promise.all(cells.map(async(cell,i)=>({stack:await paragraph(cell.tokens,cellWidth,{...style,...(heading?{font:'Hei'}:{})}),alignment:t.align[i] || 'left'})));
        const body=[await row(t.header,true)];for(const cells of t.rows)body.push(await row(cells,false));
        result.push({table:{headerRows:1,widths:Array(t.header.length).fill('*'),body},layout:'lightHorizontalLines',margin:[0,5,0,8]});
      } else if (t.type === 'hr') result.push({canvas:[{type:'line',x1:0,y1:0,x2:width,y2:0,lineWidth:0.5}],margin:[0,8,0,8]});
      else if (t.type === 'html') throw new Error('题面包含 HTML 块，请先转换为 Markdown 后导出。');
      else throw new Error(`无法排版题面内容：${t.type}`);
    }
    return result;
  }
  const content=[
    {text:statement.contestTitle,font:'Hei',fontSize:24,alignment:'center',margin:[0,10,0,22]},
    {text:`时间：${statement.dateText}`,font:'Hei',fontSize:14,alignment:'center',margin:[0,0,0,25]},
    {table:{headerRows:1,widths:[28,'*',72,78],body:[
      ['题号','题目名称','时间限制','空间限制'].map(text=>({text,font:'Hei'})),
      ...statement.problems.map(p=>[p.label,p.title,p.timeLimitText,p.memoryLimitText])
    ]},layout:{paddingTop:()=>7,paddingBottom:()=>7}}
  ];
  for (const [index,p] of statement.problems.entries()) {
    content.push({text:`${p.label}　${p.title}`,font:'Hei',fontSize:18,alignment:'center',pageBreak:'before',margin:[0,0,0,10],id:`problem-${index}`,headlineLevel:1});
    content.push({text:`时间限制：${p.timeLimitText}　　空间限制：${p.memoryLimitText}`,fontSize:10,alignment:'center',margin:[0,0,0,14]});
    try {content.push(...await render(blocks[index]));} catch(error) {throw new Error(`${p.heading}：${error.message}`);}
  }
  return {
    pageSize:'A4',pageMargins:[MARGIN, MARGIN, MARGIN, MARGIN],
    defaultStyle:{font:'Song',fontSize:12,lineHeight:1.3,color:'#111111'},
    info:{title:statement.title,author:'Accoding Modern',subject:statement.contestTitle},
    content,
    header:(page)=> page===1?null:{stack:[{columns:[{text:statement.contestTitle,width:'*'},{text:content.filter(node=>node.id?.startsWith('problem-') && node.positions?.[0]?.pageNumber<=page).at(-1)?.text?.replace('　',' ')||'',alignment:'right',width:140}],fontSize:8},
      {canvas:[{type:'line',x1:0,y1:6,x2:WIDTH,y2:6,lineWidth:0.2}]}],margin:[MARGIN,36,MARGIN,0]},
    footer:(page,count)=>page===1?null:{text:`第 ${page} 页　　共 ${count} 页`,fontSize:9,alignment:'center',margin:[0,25,0,0]},
    pageBreakBefore:(node,following)=>{
      return node.headlineLevel && following.length===0;
    }
  };
}
