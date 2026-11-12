import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {statementToLatex} from '../src/statement-tex.mjs';

const keep = process.argv.includes('--keep');
const directory = await mkdtemp(join(tmpdir(), 'accoding-statement-latex-'));
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const statement = {
  title: 'C5-Statement',
  contestTitle: 'C5 - 2026级程序设计基础第五次上机赛',
  dateText: '2026 年 10 月 20 日',
  problems: [
    {label: 'A', title: '第一题', heading: 'A 第一题', timeLimitText: '1000 ms', memoryLimitText: '65536 KB',
      description: '## 题目描述\n\n给定 $x_i$，求 `a_b` 与 **粗体**。\n\n```cpp\nint main() { return 0; }\n```\n\n| 名称 | 数值 |\n|:---|---:|\n| 样例 | 1 |\n\n![示意图](/image/1.png)'},
    {label: 'B', title: '第二题', heading: 'B 第二题', timeLimitText: '2000 ms', memoryLimitText: '131072 KB',
      description: '## 输入格式\n\n- 第一项\n  - 嵌套\n- 第二项\n\n> 引用 & 文本\n\n$$\\sum_{i=1}^n a_i$$'}
  ]
};

function run(command, args) {
  const result = spawnSync(command, args, {cwd: directory, encoding: 'utf8'});
  if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}`);
  return result;
}

try {
  const {tex, warnings} = statementToLatex(statement);
  assert.deepEqual(warnings, []);
  await mkdir(join(directory, 'images'));
  await writeFile(join(directory, 'main.tex'), tex);
  await writeFile(join(directory, 'oicontest.cls'), await readFile(new URL('../src/oicontest.cls', import.meta.url)));
  await writeFile(join(directory, 'images/1.png'), png);
  for (let pass = 1; pass <= 2; pass++) {
    const result = run('xelatex', ['-shell-escape', '-interaction=nonstopmode', 'main.tex']);
    if (result.status !== 0) {
      const log = await readFile(join(directory, 'main.log'), 'utf8').catch(() => '');
      throw new Error(`第 ${pass} 遍 xelatex 失败（退出码 ${result.status}）：\n${(log || result.stdout || '').slice(-8000)}`);
    }
  }
  const info = run('pdfinfo', ['main.pdf']);
  assert.equal(info.status, 0, info.stderr);
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1]);
  assert.ok(pages >= 3, `PDF 页数不足：${pages}`);
  const textResult = run('pdftotext', ['main.pdf', '-']);
  assert.equal(textResult.status, 0, textResult.stderr);
  const text = textResult.stdout;
  for (const token of ['C5 - 2026', '2026 年 10 月 20 日', '题号', '题目名称', '时间限制', '空间限制',
    'A', 'B', '第一题', '第二题', '【题目描述】', '【输入格式】', 'int main', '名称', '数值']) {
    assert.ok(text.includes(token), `PDF 缺少内容：${token}`);
  }
  assert.match(text, /第\s*2\s*页/);
  assert.match(text, /共\s*3\s*页/);
  assert.ok(!/文件名|目录|可执行|测试点|等分|编译选项|下发文件/.test(text), 'PDF 出现了排除的文件输入输出/测试点内容');
  console.log(`LaTeX OK: ${pages} 页，${directory}`);
} catch (error) {
  console.error(error.message);
  if (!keep) await rm(directory, {recursive: true, force: true});
  process.exit(1);
}
if (!keep) await rm(directory, {recursive: true, force: true});
