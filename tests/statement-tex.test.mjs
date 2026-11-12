import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStoredZip} from '../src/zip-core.mjs';
import {latexEscape,markdownToLatex,statementToLatex,createLatexProject,safeFilename} from '../src/statement-tex.mjs';

const templateClass=await readFile(new URL('../src/oicontest.cls',import.meta.url),'utf8');
const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

function unzipStored(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), end=bytes.length-22;
  assert.equal(view.getUint32(end,true),0x06054b50);
  const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), result=new Map();
  let pos=start, nextLocal=0;
  for(let i=0;i<count;i++){
    assert.equal(view.getUint32(pos,true),0x02014b50);
    const size=view.getUint32(pos+24,true), nameLength=view.getUint16(pos+28,true), offset=view.getUint32(pos+42,true);
    const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLength));
    assert.equal(offset,nextLocal);
    const dataStart=offset+30+nameLength+view.getUint16(offset+28,true);
    result.set(name,bytes.slice(dataStart,dataStart+size));
    nextLocal=dataStart+size;
    pos+=46+nameLength+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
  assert.equal(nextLocal,start);
  return result;
}

const statement=()=>({
  title:'C5-Statement',
  contestTitle:'C5 - 2026级程序设计基础第五次上机赛',
  dateText:'2026 年 10 月 20 日',
  problems:[
    {label:'A',title:'第一题',heading:'A 第一题',description:'## 题目描述\n\n给定 $x_i$，求 `a_b` 与 **粗体**。\n\n```cpp\nint main() { return 0; }\n```\n\n| 名称 | 数值 |\n|:---|---:|\n| 样例 | 1 |\n\n![示意图](/image/1.png)',timeLimitText:'1000 ms',memoryLimitText:'65536 KB'},
    {label:'B',title:'第二题',heading:'B 第二题',description:'## 输入格式\n\n- 第一项\n  - 嵌套\n- 第二项\n\n> 引用 & 文本\n',timeLimitText:'2000 ms',memoryLimitText:'131072 KB'}
  ]
});

test('latex escaping covers every TeX special and keeps CJK',()=>{
  assert.equal(latexEscape('\\ { } $ & # ^ _ % ~ < > 中文'),'\\textbackslash{} \\{ \\} \\$ \\& \\# \\textasciicircum{} \\_ \\% \\textasciitilde{} \\textless{} \\textgreater{} 中文');
});
test('markdown converts headings, math, code, tables, lists, links, images and HTML',()=>{
  const result=markdownToLatex('# 标题\n\n段落 $x_i$ 与 \\(y\\)，`a_b`，[链接](https://example.com/a_b)。\n\n```python\nprint("<&>")\n```\n\n| A | B |\n|:---|---:|\n| 1 | 2 |\n\n- 一\n  - 二\n\n<br>![图](/img/a.png)',{normalizeMath:value=>value});
  assert.match(result.latex,/\\subsection\{标题\}/);
  assert.match(result.latex,/段落 \$x_i\$ 与 \\\(y\\\)，\\texttt\{a\\_b\}，\\href\{https:\/\/example\.com\/a\\_b\}\{链接\}/);
  assert.match(result.latex,/\\begin\{minted\}\[breaklines\]\{python\}\nprint\("<&>"\)\n\\end\{minted\}/);
  assert.match(result.latex,/\\begin\{xltabular\}[\s\S]*\\toprule/);
  assert.match(result.latex,/\\begin\{itemize\}[\s\S]*\\begin\{itemize\}/);
  assert.match(result.latex,/\\newline\{\}/);
  assert.deepEqual(result.images.map(image=>[image.index,image.url,image.alt]),[[1,'/img/a.png','图']]);
});
test('invalid tables and unclosed math fall back with warnings instead of disappearing',()=>{
  const result=markdownToLatex('| A | B |\n|---|---|---|\n| 1 | 2 |\n\n文字 \\(未闭合');
  assert.match(result.latex,/A \| B/);
  assert.ok(result.warnings.some(warning=>warning.includes('表格')));
  assert.ok(result.warnings.some(warning=>warning.includes('公式')));
});
test('statement document has the cover, problem order, page breaks and no file I/O sections',()=>{
  const result=statementToLatex(statement(),{normalizeMath:value=>value});
  assert.match(result.tex,/\\documentclass\{oicontest\}/);
  assert.match(result.tex,/\\title\{C5 - 2026级程序设计基础第五次上机赛\}/);
  assert.match(result.tex,/\\begin\{xltabular\}.*题号.*题目名称.*时间限制.*空间限制/s);
  assert.match(result.tex,/\nA & 第一题 & 1000 ms & 65536 KB/);
  assert.match(result.tex,/\nB & 第二题 & 2000 ms & 131072 KB/);
  assert.match(result.tex,/\\newcommand\{\\amproblem\}\[2\]\{\\clearpage\\section\{#1\\quad #2\}\}/);
  assert.match(result.tex,/\\amproblem\{A\}\{第一题\}/);
  assert.match(result.tex,/\\amproblem\{B\}\{第二题\}/);
  assert.ok(!/文件名|目录|可执行|测试点|等分|编译选项|下发文件/.test(result.tex));
  assert.deepEqual(result.images.map(image=>image.problem),['A 第一题']);
});
test('images from different problems get unique project filenames',async()=>{
  const raw=statement();
  raw.problems[1].description+='\n\n![第二张](/image/2.png)';
  const converted=statementToLatex(raw,{normalizeMath:value=>value});
  assert.deepEqual(converted.images.map(image=>[image.index,image.url,image.problem]),[[1,'/image/1.png','A 第一题'],[2,'/image/2.png','B 第二题']]);
  const project=await createLatexProject(raw,{templateClass,normalizeMath:value=>value,fetchImage:async()=>({bytes:png,contentType:'image/png'})});
  const files=unzipStored(new Uint8Array(await project.blob.arrayBuffer()));
  assert.ok(files.has('images/1.png'));
  assert.ok(files.has('images/2.png'));
});
test('project ZIP contains the source, class, build scripts and fetched images',async()=>{
  const seen=[];
  const project=await createLatexProject(statement(),{
    templateClass,
    normalizeMath:value=>value,
    fetchImage:async(url)=>{seen.push(url);return {bytes:png,contentType:'image/png'};},
    onProgress:event=>assert.equal(event.total,1)
  });
  assert.equal(project.filename,'C5-Statement-LaTeX.zip');
  assert.deepEqual(project.warnings,[]);
  assert.deepEqual(seen,['/image/1.png']);
  const files=unzipStored(new Uint8Array(await project.blob.arrayBuffer()));
  assert.deepEqual([...files.keys()].sort(),['README.md','build.bat','build.sh','images/1.png','latexmkrc','main.tex','oicontest.cls']);
  assert.match(new TextDecoder().decode(files.get('main.tex')),/\\includegraphics\[[^\]]*\]\{images\/1\}/);
  assert.deepEqual([...files.get('images/1.png')], [...png]);
  assert.match(new TextDecoder().decode(files.get('README.md')),/sh build\.sh/);
});
test('project writes warnings.txt when input is degraded',async()=>{
  const raw=statement();raw.problems[0].description='| A | B |\n|---|---|---|\n| 1 | 2 |';
  const project=await createLatexProject(raw,{templateClass,normalizeMath:value=>value,fetchImage:async()=>({bytes:png,contentType:'image/png'})});
  const files=unzipStored(new Uint8Array(await project.blob.arrayBuffer()));
  assert.ok(files.has('warnings.txt'));
  assert.ok(project.warnings.length);
});
test('image failures, unsupported types and oversized images stop the export',async()=>{
  await assert.rejects(createLatexProject(statement(),{templateClass,fetchImage:async()=>{throw new Error('404');}}),/404/);
  await assert.rejects(createLatexProject(statement(),{templateClass,fetchImage:async()=>({bytes:png,contentType:'image/svg+xml'})}),/不支持的图片格式/);
  await assert.rejects(createLatexProject(statement(),{templateClass,fetchImage:async()=>({bytes:new Uint8Array(10*1024*1024+1),contentType:'image/png'})}),/超过 10 MB/);
});
test('project rejects a missing template and supports filename cleanup',async()=>{
  await assert.rejects(createLatexProject(statement(),{fetchImage:async()=>null}),/模板/);
  assert.equal(safeFilename('C5 / 测试:Statement'),'C5 _ 测试_Statement');
  assert.equal(safeFilename(''),'Statement');
});
test('shared ZIP writer handles binary entries and rejects duplicates',()=>{
  const zip=createStoredZip([{name:'a.bin',data:png},{name:'b.txt',data:'文本'}]);
  const files=unzipStored(zip);
  assert.deepEqual([...files.keys()],['a.bin','b.txt']);
  assert.deepEqual([...files.get('a.bin')],[...png]);
  assert.equal(new TextDecoder().decode(files.get('b.txt')),'文本');
  assert.throws(()=>createStoredZip([{name:'a',data:'1'},{name:'a',data:'2'}]),/重复/);
});
