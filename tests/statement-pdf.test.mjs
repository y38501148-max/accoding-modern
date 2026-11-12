import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {statementMathExtensions,collectStatementMath,statementPdfDefinition} from '../src/statement-pdf.mjs';
const sandbox={};vm.runInNewContext(await readFile(new URL('../vendor/marked/marked.umd.js',import.meta.url),'utf8'),sandbox);
const parser=new sandbox.marked.Marked({gfm:true,extensions:statementMathExtensions()});
const lex=source=>parser.lexer(source);

test('PDF parser keeps spaced math and indented matrices intact while leaving code literal',()=>{
  const tokens=lex('给定 $ x_i $。\n\n$$\n\\begin{bmatrix}\n    1 & 2 \\\\\n    3 & 4\n\\end{bmatrix}\n$$\n\n```text\n$x_i$\n```');
  const math=collectStatementMath(tokens);
  assert.equal(math.length,2);assert.equal(math[0].text,'x_i');assert.match(math[1].text,/\\begin\{bmatrix\}/);assert.equal(math[1].display,true);
  assert.equal(tokens.find(t=>t.type==='code').text,'$x_i$');
});
test('PDF layout retains cover limits, nested lists, repeated table headers and code whitespace',async()=>{
  const definition=await statementPdfDefinition({title:'C8-Statement',contestTitle:'C8 测试',dateText:'2026 年 11 月 12 日',problems:[{label:'A',title:'测试',heading:'A 测试',timeLimitText:'1000 ms',memoryLimitText:'65536 KB',description:'## 输入\n\n- 一\n  - 二\n\n| 名称 | 值 |\n|---|---|\n| a | 1 |\n\n```c\n    // 中文\n    return 0;\n```'}]}, {lex,image:()=>{throw Error('unexpected image');},math:()=>{throw Error('unexpected math');},measure:s=>s.length*6});
  assert.equal(definition.pageSize,'A4');
  assert.match(JSON.stringify(definition.content),/1000 ms/);
  assert.equal(definition.content.find(n=>n.id==='problem-0').pageBreak,'before');
  const tables=definition.content.filter(n=>n.table);assert.equal(tables[1].table.headerRows,1);
  assert.match(JSON.stringify(tables[2]),/    /);assert.match(JSON.stringify(tables[2]),/中文/);
  assert.match(definition.footer(2,8).text,/共 8 页/);assert.equal(definition.footer(1,8),null);
});
test('unrenderable content stops export with its problem identity',async()=>{
  await assert.rejects(statementPdfDefinition({problems:[{heading:'B 第二题',description:'<script>alert(1)</script>'}]},{lex,measure:s=>s.length*6}),/B 第二题.*HTML/);
});
test('formula font outlines use original Computer Modern and reference size',async()=>{
  const data=JSON.parse(await readFile(new URL('../vendor/cm-math/glyphs.json',import.meta.url),'utf8'));
  assert.equal(data['MathJax_Math-italic'][110][2],584); // CMMI12 n advance, not MathJax's CM10 derivative.
  const source=await readFile(new URL('../src/statement-pdf-browser.js',import.meta.url),'utf8');
  assert.match(source,/12\*72\/72\.27\/1000/);assert.match(source,/blacker:0/);
});

test('OJ multiline matrix normalization preserves commands, subscripts and row separators',async()=>{
  const {normalizeStatementPdfMath}=await import('../src/statement-pdf.mjs');
  const {createMarkdownCore}=await import('../src/markdown-core.mjs');
  const fromOJ=createMarkdownCore().fromOJ;
  const common=String.raw`\begin{bmatrix}
    1 & \omega_n^k \\
    1 & -\omega_n^k
\end{bmatrix}`;
  const saved=common.replace(/\\/g,'\\\\').replace(/_/g,'\\_');
  const parser=new sandbox.marked.Marked({gfm:true,extensions:statementMathExtensions((text,display)=>normalizeStatementPdfMath(text,display,fromOJ))});
  const tokens=collectStatementMath(parser.lexer('$$\n'+saved+'\n$$'));
  assert.equal(tokens.length,1);assert.equal(tokens[0].display,true);assert.equal(tokens[0].text,common);
  assert.equal(normalizeStatementPdfMath(common,true,fromOJ),common);
  assert.equal(normalizeStatementPdfMath(String.raw`x\_i`,false,fromOJ),'x_i');
});


test('large images reserve their full height without drawing into previous paragraphs',async()=>{
  const definition=await statementPdfDefinition({title:'C8',contestTitle:'测试',dateText:'2026',problems:[{label:'A',title:'图',heading:'A 图',timeLimitText:'1000 ms',memoryLimitText:'65536 KB',description:'前文\n\n![图](test.png)\n\n后文'}]}, {lex,measure:s=>s.length*6,image:async()=>({image:'test-image',width:320,height:240})});
  const line=definition.content.find(node=>node.columns?.some(column=>column.image));
  const image=line.columns.find(column=>column.image);
  assert.equal(image.height,240);assert.ok(image.margin[1]>=0,JSON.stringify(image));
});
