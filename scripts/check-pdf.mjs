import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const file=process.argv[2];
if(!file)throw new Error('用法：node scripts/check-pdf.mjs <browser-statement-pdf.html 生成的 PDF>');
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.error)throw result.error;assert.equal(result.status,0,result.stderr);return result.stdout;}
const info=run('pdfinfo',[file]),text=run('pdftotext',['-layout',file,'-']);
const pages=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);assert.ok(pages>=6,`题册页数不足：${pages}`);
for(const token of ['程序设计基础测试赛','矩阵与图片','跨页表格','跨页代码','1000 ms','65536 KB','中文注释','第 65 行测试内容','line_90','表格完整','代码完整'])assert.ok(text.includes(token),`内容缺失：${token}`);
const split=text.split('\f');assert.ok(split.filter(page=>/line_\d+/.test(page)).length>=2,'长代码没有跨页');assert.ok(split[0].includes('时间限制'));assert.ok(!split[0].includes('第1页'));
assert.ok(split.filter(page=>page.includes('序号')&&page.includes('内容')).length>=2,'跨页表格没有重复表头');
for(let i=1;i<pages;i++)assert.match(split[i],new RegExp(`第\\s*${i+1}\\s*页\\s*共\\s*${pages}\\s*页`));
console.log(`PDF OK: ${pages} 页，全部内容、重复表头及页码通过。`);
