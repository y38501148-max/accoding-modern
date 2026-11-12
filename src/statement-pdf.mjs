import {normalizeStatementMath} from './statement-tex.mjs';

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
    return {type:'amMath', raw:source.slice(0, end + close.length), text:normalizeMath(text,block || open === '$$' || open === '\\['), display:block || open === '$$' || open === '\\['};
  };
  return [
    {name:'amMath', level:'block', start:source=>source.search(/(?:^|\n) {0,3}(?:\$\$|\\\[)/), tokenizer:source=>read(source,true)},
    {name:'amMath', level:'inline', start:source=>source.search(/\$|\\[([]/), tokenizer:source=>read(source,false)}
  ];
}

export function normalizeStatementPdfMath(text,display,fromOJ) {
  const delimiter=display?'$$':'$';
  return normalizeStatementMath(`${delimiter}${text}${delimiter}`,fromOJ).slice(delimiter.length,-delimiter.length);
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

// Font metrics are normalized to em units. PDFMake uses signed descenders for
// its line boxes; visual descents remain positive when aligning a baseline.
const statementFontMetrics={
  Song:{ascent:.8,descent:.2,box:.6},
  Hei:{ascent:.88,descent:.12,box:1},
  Kai:{ascent:.88,descent:.12,box:1},
  Latin:{ascent:1.127,descent:.28,box:1.407},
  Mono:{ascent:2146/2048,descent:555/2048,box:2701/2048}
};
const statementMetrics=font=>statementFontMetrics[font||'Song'];
const closingPunctuation=/^[,.;:!?，。；：！？、\]）》」』】〕〉”’%‰°]+$/u;
const openingPunctuation=/[（《「『【〔〈“‘(\[]$/u;

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
      } else if (t.type === 'codespan') result.push({...style,text:decode(t.text),font:style.font||'Song',fontSize:12});
      else if (t.tokens) result.push(...await inline(t.tokens,style));
      else if (t.type === 'html') {
        if (/^<br\s*\/?/i.test(t.text)) result.push({text:'\n',...style});
        else if (!/^<[^>]+>$/.test(t.text)) throw new Error('题面包含暂不支持的 HTML 内容，请先转换为 Markdown。');
      } else result.push({text:decode(t.text ?? t.raw).replace(/\n/g,' '),...style});
    }
    return result;
  };

  // Every fragment on a line uses one physical baseline. Native PDFMake
  // columns otherwise align their tops and shift Latin/code text downward.
  async function paragraph(tokens, width = WIDTH, style = {}) {
    const parts=(await inline(tokens,style)).flatMap(part=>part.kind==='graphic'||part.font==='Mono'?[part]:String(part.text).split(/([\x00-\x7f]+)/).filter(Boolean).map(text=>({...part,text,font:/^[\x00-\x7f]+$/.test(text)?'Latin':part.font})));
    const atoms=[];
    for(const part of parts) {
      if(part.kind==='graphic') {
        const ratio=Math.min(1,width/part.width);
        atoms.push({...part,width:part.width*ratio,height:part.height*ratio,ascent:(part.ascent??part.height)*ratio,descent:(part.descent??0)*ratio});
        continue;
      }
      const source=part.font==='Mono'?part.text:part.text.replace(/[^\S\n]+/g,' ');
      for(const segment of new Intl.Segmenter('zh',{granularity:'word'}).segment(source)) {
        const text=segment.segment;
        const chunks=/\p{Script=Han}/u.test(text)||measure(text,part)>width?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].map(p=>p.segment):[text];
        for(const value of chunks)atoms.push({...part,text:value,width:measure(value,part),_style:part});
      }
    }
    // Closing punctuation travels with the preceding glyph/formula; opening
    // punctuation travels with the following fragment, including across styles.
    const units=[];
    for(const atom of atoms) {
      const previous=units.at(-1);
      if(atom.text!=='\n'&&previous&&previous.at(-1).text!=='\n'&&
        (closingPunctuation.test(atom.text||'')||openingPunctuation.test(previous.at(-1).text||'')))previous.push(atom);
      else units.push([atom]);
    }
    const lines=[];let line=[],used=0;
    const flush=()=>{
      while(line.length&&/^\s+$/.test(line.at(-1).text||''))line.pop();
      if(line.length)lines.push(line);
      line=[];used=0;
    };
    for(const unit of units) {
      if(unit[0].text==='\n'){flush();continue;}
      let size=unit.reduce((sum,atom)=>sum+atom.width,0);
      if(size>width) {
        const graphic=unit.find(atom=>atom.kind==='graphic');
        if(graphic) {
          const target=Math.max(1,width-(size-graphic.width)),ratio=target/graphic.width;
          graphic.width=target;graphic.height*=ratio;graphic.ascent*=ratio;graphic.descent*=ratio;
          size=unit.reduce((sum,atom)=>sum+atom.width,0);
        }
      }
      if(used+size>width+.05)flush();
      if(!used&&unit.every(atom=>/^\s+$/.test(atom.text||'')))continue;
      for(const atom of unit) {
        const last=line.at(-1);
        if(last&&atom.kind!=='graphic'&&last.kind!=='graphic'&&last._style===atom._style){last.text+=atom.text;last.width+=atom.width;}
        else line.push({...atom});
      }
      used+=size;
    }
    flush();
    return lines.map((items,index)=>{
      const ascent=Math.max(12*statementMetrics('Latin').ascent,...items.map(p=>p.kind==='graphic'?p.ascent:statementMetrics(p.font).ascent*(p.fontSize||12)));
      const descent=Math.max(12*statementMetrics('Latin').descent,...items.map(p=>p.kind==='graphic'?p.descent:statementMetrics(p.font).descent*(p.fontSize||12)));
      const height=Math.max(17,ascent+descent);
      const columns=items.map(({kind,height:h,ascent:a,descent:d,_style,...p})=>{
        if(kind==='graphic')return {...p,height:h,margin:[0,ascent-a,0,height-(ascent-a)-h]};
        const size=p.fontSize||12,metrics=statementMetrics(p.font),top=ascent-metrics.ascent*size;
        return {...p,noWrap:true,preserveLeadingSpaces:true,preserveTrailingSpaces:true,lineHeight:1/metrics.box,margin:[0,top,0,Math.max(0,height-top-size)]};
      });
      return {columns,columnGap:0,margin:[0,index===0?2:0,0,index===lines.length-1?6:2],unbreakable:true,_statementBaseline:ascent+(index===0?2:0)};
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
        result.push({unbreakable:lines.length<=12,table:{dontBreakRows:true,widths:[24,'*'],body:lines.map((line,index)=>[
          {text:String(index+1),font:'Mono',fontSize:8,lineHeight:1.25/statementMetrics('Mono').box,color:'#888888',alignment:'right'},
          {text:(line || ' ').split(/([\u3400-\u9fff]+)/).filter(Boolean).map(text=>({text,font:/[\u3400-\u9fff]/.test(text)?'Song':'Mono',lineHeight:1.25/statementMetrics(/[\u3400-\u9fff]/.test(text)?'Song':'Mono').box})),fontSize:10,preserveLeadingSpaces:true}
        ])},layout:{hLineWidth:(i,node)=>i===0||i===node.table.body.length?0.5:0,vLineWidth:i=>i===0||i===2?0.5:0,hLineColor:()=> '#2860a0',vLineColor:()=> '#2860a0',paddingTop:()=>2,paddingBottom:()=>2,paddingLeft:()=>5,paddingRight:()=>5},margin:[0,5,0,8]});
      } else if (t.type === 'blockquote') result.push({stack:await render(t.tokens,width-24,{...style,font:'Kai'}),margin:[18,3,6,6]});
      else if (t.type === 'list') {
        for(const [index,item] of t.items.entries()) {
          const label=t.ordered?`${Number(t.start||1)+index}.`:'•';
          const markerWidth=t.ordered?Math.max(20,measure(label,{font:'Latin'})+6):18;
          const body=await render(item.tokens,width-markerWidth,style);
          const baseline=body[0]?._statementBaseline||15.5;
          const marker=t.ordered
            ? {text:label,font:'Latin',fontSize:12,lineHeight:1/statementMetrics('Latin').box,alignment:'right',margin:[0,baseline-statementMetrics('Latin').ascent*12,5,0]}
            : {canvas:[{type:'ellipse',x:6,y:baseline-3.5,r1:1.7,r2:1.7,color:'#111111'}]};
          result.push({columns:[{width:markerWidth,...marker},{width:width-markerWidth,stack:body}],columnGap:0,margin:[0,0,0,2]});
        }
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
