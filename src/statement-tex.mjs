// Markdown -> LaTeX for the statement export. This module is intentionally
// DOM-free so the converter and ZIP builder can be tested with node:test.
import {createStoredZip} from './zip-core.mjs';

const LATEX_SPECIALS = /[\\{}$&#^_%~<>]/g;
const LATEX_REPLACEMENTS = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '$': '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  '_': '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}'
};

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const IMAGE_SIZE = 25 * 1024 * 1024;
const IMAGE_MAX = 10 * 1024 * 1024;
const IMAGE_COUNT = 40;

export function latexEscape(value) {
  return String(value ?? '').replace(LATEX_SPECIALS, character => LATEX_REPLACEMENTS[character]);
}

function escapeCode(value) {
  return String(value ?? '').replace(/[\\{}$&#^_%~]/g, character => LATEX_REPLACEMENTS[character]);
}

export function safeFilename(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim().slice(0, 60) || 'Statement';
}

function decodeEntities(value) {
  const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'};
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      try { return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match; } catch { return match; }
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanHtml(value) {
  let text = String(value ?? '');
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<img\b([^>]*)>/gi, (match, attributes) => {
    const source = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    return source ? `![${alt?.[1] ?? alt?.[2] ?? alt?.[3] ?? ''}](${source[1] ?? source[2] ?? source[3] ?? ''})` : '';
  });
  text = text.replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (match, double, single, bare, label) => `[${label.replace(/<[^>]+>/g, '')}](${double ?? single ?? bare ?? ''})`);
  text = text.replace(/<(strong|b)\b[^>]*>/gi, '**').replace(/<\/(strong|b)\s*>/gi, '**');
  text = text.replace(/<(em|i)\b[^>]*>/gi, '*').replace(/<\/(em|i)\s*>/gi, '*');
  text = text.replace(/<code\b[^>]*>/gi, '`').replace(/<\/code\s*>/gi, '`');
  text = text.replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<(p|div|br|li|tr|h[1-6])\b[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  return decodeEntities(text);
}

function findClosing(text, start, close) {
  let index = start;
  while ((index = text.indexOf(close, index)) >= 0) {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
    if (slashes % 2 === 0) return index;
    index += close.length;
  }
  return -1;
}

function readBalanced(text, start, open, close) {
  let depth = 1, index = start + open.length;
  while (index < text.length) {
    if (text.startsWith(close, index)) {
      depth--;
      if (!depth) return {body: text.slice(start + open.length, index), end: index + close.length};
      index += close.length;
      continue;
    }
    if (text.startsWith(open, index)) { depth++; index += open.length; continue; }
    if (text[index] === '\\') { index += 2; continue; }
    index++;
  }
  return null;
}

function readInlineCode(text, start) {
  const run = text.slice(start).match(/^`+/)?.[0];
  if (!run) return null;
  const close = findClosing(text, start + run.length, run);
  if (close < 0) return null;
  return {body: text.slice(start + run.length, close), end: close + run.length};
}

function readImage(text, start) {
  if (!text.startsWith('![', start)) return null;
  const label = readBalanced(text, start + 1, '[', ']');
  if (!label) return null;
  const target = readBalanced(text, label.end, '(', ')');
  if (!target) return null;
  const body = target.body.trim();
  const match = /^(\S+?)(?:\s+["']([\s\S]*)["'])?$/.exec(body);
  if (!match) return null;
  return {alt: label.body, url: match[1].replace(/^<|>$/g, ''), end: target.end};
}

function readLink(text, start) {
  if (text[start] !== '[') return null;
  const label = readBalanced(text, start, '[', ']');
  if (!label || text[label.end] !== '(') return null;
  const target = readBalanced(text, label.end, '(', ')');
  if (!target) return null;
  return {label: label.body, url: target.body.trim().replace(/^<|>$/g, ''), end: target.end};
}

function mathAt(text, start) {
  if (text.startsWith('\\[', start)) return {open: '\\[', close: '\\]', display: true};
  if (text.startsWith('\\(', start)) return {open: '\\(', close: '\\)', display: false};
  if (text.startsWith('$$', start)) return {open: '$$', close: '$$', display: true};
  if (text[start] === '$' && /\S/.test(text[start + 1] || '')) return {open: '$', close: '$', display: false};
  return null;
}

function joinSoftLines(lines) {
  let result = '';
  for (const line of lines) {
    if (!result) { result = line; continue; }
    const left = result.at(-1) || '', right = line[0] || '';
    result += CJK.test(left) && CJK.test(right) ? line : ` ${line}`;
  }
  return result;
}

function soleImage(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('![')) return null;
  const image = readImage(trimmed, 0);
  return image && image.end === trimmed.length ? image : null;
}

function renderInline(source, state) {
  const text = cleanHtml(source), onlyImage = soleImage(text);
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '\n') { out += '\\newline{}\n'; i++; continue; }
    const math = mathAt(text, i);
    if (math) {
      const close = findClosing(text, i + math.open.length, math.close);
      if (close >= 0) {
        const body = text.slice(i + math.open.length, close);
        if (math.open === '$' && (body.includes('\n') || !body.trim())) {
          out += '\\$';
          i++;
          continue;
        }
        out += math.open === '$$' ? `\\[\n${body}\n\\]` : `${math.open}${body}${math.close}`;
        i = close + math.close.length;
        continue;
      }
      if (math.open !== '$') state.warnings.push('存在未闭合的公式定界符，已按普通文字导出。');
      out += latexEscape(math.open);
      i += math.open.length;
      continue;
    }
    if (text[i] === '\\' && i + 1 < text.length && /[\\`*_[\]()#+\-.!{}>~|$]/.test(text[i + 1])) {
      out += latexEscape(text[i + 1]);
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      const code = readInlineCode(text, i);
      if (code) {
        out += `\\texttt{${escapeCode(code.body)}}`;
        i = code.end;
        continue;
      }
    }
    if (text.startsWith('![', i)) {
      const image = readImage(text, i);
      if (image) {
        const entry = state.addImage(image.url, image.alt);
        out += onlyImage
          ? `\\par\\noindent\\begin{center}\\includegraphics[width=\\linewidth,height=0.75\\textheight,keepaspectratio]{images/${entry.index}}\\end{center}\\par\n`
          : `\\adjustimage{max width=\\linewidth,max height=0.75\\textheight,keepaspectratio}{images/${entry.index}}`;
        i = image.end;
        continue;
      }
    }
    if (text[i] === '[') {
      const link = readLink(text, i);
      if (link) {
        out += `\\href{${latexEscape(link.url)}}{${renderInline(link.label, state)}}`;
        i = link.end;
        continue;
      }
    }
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const marker = text.slice(i, i + 2), close = findClosing(text, i + 2, marker);
      if (close > i + 2) {
        out += `\\textbf{${renderInline(text.slice(i + 2, close), state)}}`;
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '*' || text[i] === '_') {
      const previous = text[i - 1] || ' ', next = text[i + 1] || ' ';
      if (next && !/\s/.test(next) && (text[i] === '*' || (!/[\w]/.test(previous) || !/[\w]/.test(next)))) {
        const close = findClosing(text, i + 1, text[i]);
        if (close > i + 1) {
          out += `\\emph{${renderInline(text.slice(i + 1, close), state)}}`;
          i = close + 1;
          continue;
        }
      }
    }
    if (text.startsWith('~~', i)) {
      const close = findClosing(text, i + 2, '~~');
      if (close > i + 2) {
        out += renderInline(text.slice(i + 2, close), state);
        i = close + 2;
        continue;
      }
    }
    if (/^https?:\/\//.test(text.slice(i))) {
      const url = text.slice(i).match(/^https?:\/\/[^\s<>]+/)?.[0];
      if (url) {
        out += `\\url{${latexEscape(url.replace(/[.,;:!?]+$/, ''))}}`;
        i += url.replace(/[.,;:!?]+$/, '').length;
        continue;
      }
    }
    out += latexEscape(text[i]);
    i++;
  }
  return out;
}

function isFence(line) {
  return /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
}

function isHr(line) {
  return /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
}

function isHeading(line) {
  return /^(#{1,6})\s+/.test(line);
}

function isList(line) {
  return /^(\s*)([-+*]|\d+[.)])\s+/.test(line);
}

function isTableSeparator(line) {
  return /\|/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  const cells = [];
  let cell = '', inCode = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '`') { inCode = !inCode; cell += value[i]; continue; }
    if (value[i] === '\\' && value[i + 1] === '|') { cell += '|'; i++; continue; }
    if (value[i] === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += value[i];
  }
  cells.push(cell.trim());
  return cells;
}

function codeLanguage(value) {
  const language = String(value || '').trim().split(/\s+/, 1)[0].toLowerCase().replace(/^[.{}]+|[.{}]+$/g, '');
  const map = {
    'c++': 'cpp', cxx: 'cpp', cc: 'cpp', c: 'c', py: 'python', python3: 'python',
    js: 'javascript', ts: 'typescript', sh: 'bash', shell: 'bash', zsh: 'bash',
    txt: 'text', plain: 'text', '': 'text'
  };
  return map[language] || language;
}

function renderCode(code, language, state) {
  if (code.includes('\\end{minted}') || code.includes('\\end{Verbatim}')) {
    throw new Error('代码块包含 LaTeX 环境结束标记 `\\end{minted}`，无法安全导出。');
  }
  const content = code.endsWith('\n') ? code.slice(0, -1) : code;
  return `\n\\begin{minted}[breaklines]{${codeLanguage(language)}}\n${content}\n\\end{minted}\n`;
}

function renderTable(headerLine, separatorLine, bodyLines, state) {
  const header = splitTableRow(headerLine), separator = splitTableRow(separatorLine);
  if (header.length < 2 || separator.length !== header.length || !separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
    state.warnings.push('存在无法解析的表格，已按纯文本导出。');
    return [...[headerLine, separatorLine, ...bodyLines].map(line => `\\noindent ${latexEscape(line)}\\par`)].join('\n');
  }
  const rows = bodyLines.map(splitTableRow);
  if (rows.some(row => row.length !== header.length)) {
    state.warnings.push('存在列数不一致的表格，已按纯文本导出。');
    return [headerLine, separatorLine, ...bodyLines].map(line => `\\noindent ${latexEscape(line)}\\par`).join('\n');
  }
  const alignment = separator.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'c' : cell.endsWith(':') ? 'r' : 'l');
  const columns = alignment.map(align => align === 'c'
    ? '>{\\centering\\arraybackslash}X'
    : align === 'r' ? '>{\\raggedleft\\arraybackslash}X' : '>{\\raggedright\\arraybackslash}X').join('');
  const cell = value => renderInline(value, state);
  const headerRow = header.map(value => `\\textbf{${cell(value)}}`).join(' & ');
  const body = rows.map(row => row.map(cell).join(' & ') + ' \\\\').join('\n');
  return `\n${header.length >= 7 ? '\\small\n' : ''}\\begin{xltabular}{\\linewidth}{${columns}}\n\\toprule\n${headerRow} \\\\\n\\midrule\n\\endhead\n\\bottomrule\n\\endlastfoot\n${body}\n\\end{xltabular}\n`;
}

function listMarker(line) {
  const match = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  return {indent: match[1].replace(/\t/g, '    ').length, ordered: /^\d/.test(match[2]), start: /^\d/.test(match[2]) ? Number.parseInt(match[2], 10) : 1, text: match[3]};
}

function renderList(lines, start, state) {
  const first = listMarker(lines[start]);
  const base = first.indent, ordered = first.ordered, startNumber = first.start;
  const items = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next >= lines.length || listMarker(lines[next])?.indent < base || !/^\s+/.test(lines[next])) break;
      index = next;
      continue;
    }
    const marker = listMarker(line);
    if (!marker || marker.indent < base) break;
    if (marker.indent > base) {
      if (items.length) {
        const nested = renderList(lines, index, state);
        items.at(-1).children.push(nested.latex);
        index = nested.next;
        continue;
      }
      break;
    }
    if (marker.ordered !== ordered) break;
    if (items.length && marker.ordered !== ordered) break;
    const item = {parts: [marker.text], children: []};
    index++;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) break;
      const nested = listMarker(next);
      if (nested && nested.indent > base) {
        const child = renderList(lines, index, state);
        item.children.push(child.latex);
        index = child.next;
        continue;
      }
      if (nested && nested.indent <= base) break;
      if (/^\s+/.test(next)) { item.parts.push(next.trim()); index++; continue; }
      break;
    }
    items.push(item);
  }
  const environment = ordered ? 'enumerate' : 'itemize';
  const option = ordered && startNumber !== 1 ? `[start=${startNumber}]` : '';
  const body = items.map(item => {
    const content = renderInline(joinSoftLines(item.parts), state);
    return `  \\item ${content}${item.children.length ? '\n' + item.children.join('\n') : ''}`;
  }).join('\n');
  return {latex: `\\begin{${environment}}${option}\n${body}\n\\end{${environment}}`, next: index};
}

function paragraph(lines, state) {
  const text = lines.map(line => line.trim()).filter(Boolean).join('\n');
  return `${renderInline(joinSoftLines(text.split('\n')), state)}\\par\n`;
}

function displayMathStart(line) {
  const match = /^ {0,3}(\$\$|\\\[)(.*)$/.exec(line);
  if (!match) return null;
  const close = match[1] === '$$' ? '$$' : '\\]';
  return match[2].includes(close) ? null : {close, rest: match[2]};
}

function renderDisplayMath(lines, index, state) {
  const start = displayMathStart(lines[index]);
  if (!start) return null;
  const chunks = [start.rest];
  let cursor = index + 1, closed = false;
  while (cursor < lines.length) {
    const line = lines[cursor], position = line.indexOf(start.close);
    if (position >= 0) {
      chunks.push(line.slice(0, position));
      closed = true;
      cursor++;
      break;
    }
    chunks.push(line);
    cursor++;
  }
  if (!closed) {
    state.warnings.push('存在未闭合的显示公式，已按普通文字导出。');
    return null;
  }
  return {latex: `\n\\[\n${chunks.join('\n').trim()}\n\\]\n`, next: cursor};
}

function renderBlocks(lines, state) {
  let out = '', index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = isFence(line);
    if (fence) {
      const marker = fence[1], language = fence[2].trim(), content = [];
      index++;
      while (index < lines.length) {
        const close = lines[index].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) { index++; break; }
        content.push(lines[index++]);
      }
      out += renderCode(content.join('\n'), language, state);
      continue;
    }
    const pre = line.match(/^\s*<pre\b[^>]*>([\s\S]*?)<\/pre\s*>\s*$/i);
    if (pre) {
      const code = decodeEntities(pre[1].replace(/<[^>]+>/g, ''));
      out += renderCode(code, 'text', state);
      index++;
      continue;
    }
    const displayMath = renderDisplayMath(lines, index, state);
    if (displayMath) {
      out += displayMath.latex;
      index = displayMath.next;
      continue;
    }
    if (isHeading(line)) {
      const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      const level = match[1].length;
      const content = cleanHtml(match[2]).replace(/^【|】$/g, '');
      if (content.trim()) out += `${level <= 2 ? '\\subsection' : '\\subsubsection'}{${renderInline(content, state)}}\n`;
      index++;
      continue;
    }
    if (isHr(line)) { out += '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n'; index++; continue; }
    if (line.trimStart().startsWith('>')) {
      const quote = [];
      while (index < lines.length && (lines[index].trimStart().startsWith('>') || !lines[index].trim())) {
        if (!lines[index].trim()) break;
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index++;
      }
      out += `\\begin{quote}\\kaishu\n${renderBlocks(quote, state)}\\end{quote}\n`;
      continue;
    }
    if (isList(line)) {
      const list = renderList(lines, index, state);
      out += `${list.latex}\n`;
      index = list.next;
      continue;
    }
    if (isTableSeparator(lines[index + 1] || '') && line.includes('|')) {
      const header = line, separator = lines[index + 1], body = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) body.push(lines[index++]);
      out += renderTable(header, separator, body, state);
      continue;
    }
    if (/^( {4}|\t)/.test(line)) {
      const code = [];
      while (index < lines.length && (/^( {4}|\t)/.test(lines[index]) || !lines[index].trim())) {
        if (!lines[index].trim()) { code.push(''); index++; continue; }
        code.push(lines[index].replace(/^( {4}|\t)/, ''));
        index++;
      }
      while (code.length && !code.at(-1)) code.pop();
      out += renderCode(code.join('\n'), 'text', state);
      continue;
    }
    const paragraphLines = [line];
    index++;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim() || isFence(next) || isHeading(next) || isHr(next) || isList(next) ||
          next.trimStart().startsWith('>') || displayMathStart(next) ||
          isTableSeparator(lines[index + 1] || '') && next.includes('|') ||
          /^( {4}|\t)/.test(next)) break;
      paragraphLines.push(next);
      index++;
    }
    out += paragraph(paragraphLines, state);
  }
  return out;
}

/**
 * OJ stores every formula backslash twice. Plain Markdown (and TeX pasted
 * directly) does not. Decode only when a formula shows OJ's double escapes,
 * so a common matrix row separator `\\` is not collapsed into `\`.
 */
export function normalizeStatementMath(source, fromOJ) {
  const value = String(source ?? '');
  const escaped = /(^|[^\\])\\\\[\\_A-Za-z]|(^|[^\\])\\_/.test(value);
  return escaped && typeof fromOJ === 'function' ? fromOJ(value) : value;
}

export function markdownToLatex(markdown, options = {}) {
  const warnings = [], images = [], seen = new Map();
  const imageIndexStart = Number.isInteger(options.imageIndexStart) ? options.imageIndexStart : 0;
  const state = {
    warnings,
    addImage(url, alt) {
      const key = String(url || '').trim();
      if (!key) throw new Error('题面图片缺少地址。');
      if (!seen.has(key)) {
        if (images.length >= IMAGE_COUNT) throw new Error(`题面图片超过 ${IMAGE_COUNT} 张，未导出。`);
        const entry = {index: imageIndexStart + images.length + 1, url: key, alt: String(alt || '')};
        images.push(entry);
        seen.set(key, entry);
      }
      return seen.get(key);
    }
  };
  const source = String(markdown ?? '').replace(/\r\n?/g, '\n');
  const normalized = typeof options.normalizeMath === 'function' ? options.normalizeMath(source) : source;
  return {latex: renderBlocks(normalized.split('\n'), state).trim(), images, warnings};
}

export function statementToLatex(statement, options = {}) {
  if (!statement || !Array.isArray(statement.problems) || !statement.problems.length) throw new Error('没有可导出的题面。');
  const warnings = [], images = [];
  let imageIndexStart = 0;
  const body = statement.problems.map(problem => {
    const converted = markdownToLatex(problem.description, {normalizeMath: options.normalizeMath, imageIndexStart});
    imageIndexStart += converted.images.length;
    warnings.push(...converted.warnings.map(warning => `${problem.heading}：${warning}`));
    images.push(...converted.images.map(image => ({...image, problem: problem.heading})));
    return `\\amproblem{${latexEscape(problem.label)}}{${latexEscape(problem.title)}}\n${converted.latex}\n`;
  }).join('\n');
  const coverRows = statement.problems.map(problem =>
    `${latexEscape(problem.label)} & ${latexEscape(problem.title)} & ${latexEscape(problem.timeLimitText)} & ${latexEscape(problem.memoryLimitText)} \\\\ \\hline`
  ).join('\n');
  const tex = String.raw`\documentclass{oicontest}
\usepackage{booktabs}
\usepackage{xltabular}
\usepackage{adjustbox}
\graphicspath{{images/}}
\title{${latexEscape(statement.contestTitle)}}
\date{${latexEscape(statement.dateText)}}
\setlength{\emergencystretch}{2em}
\newcommand{\amproblem}[2]{\clearpage\section{#1\quad #2}}
\begin{document}
\thispagestyle{empty}
\begin{center}
{\heiti\bfseries\huge ${latexEscape(statement.contestTitle)}\par}
\vspace{1.5em}
{\heiti\large 时间：${latexEscape(statement.dateText)}\par}
\end{center}
\vspace{1em}
\begin{xltabular}{\linewidth}{|p{0.08\linewidth}|p{0.42\linewidth}|p{0.17\linewidth}|p{0.17\linewidth}|}
\hline
\textbf{题号} & \textbf{题目名称} & \textbf{时间限制} & \textbf{空间限制} \\ \hline
\endhead
${coverRows}
\end{xltabular}
\clearpage
${body}
\end{document}
`;
  return {tex, images, warnings: [...new Set(warnings)]};
}

const README = `# Statement LaTeX 工程

本目录由 Accoding Modern 生成。它只包含当前账号有权读取的比赛题面，不会上传任何内容。

## 编译

需要 TeX Live（含 XeLaTeX、ctex、xeCJK、minted、Pygments、tabularray、tcolorbox、fancyhdr、lastpage、booktabs、xltabular、adjustbox）。

\`\`\`sh
sh build.sh
\`\`\`

或：

\`\`\`sh
latexmk -xelatex main.tex
\`\`\`

必须运行两次，页脚的总页数才会正确。代码块使用 minted，因此需要 \`-shell-escape\` 和 Python Pygments。

## 文件

- \`main.tex\`：题面正文。
- \`oicontest.cls\`：适配后的题面模板类。
- \`images/\`：题面引用的图片。
- \`build.sh\` / \`build.bat\`：编译脚本。

## 字体

模板优先使用 Windows 的 SimSun / SimHei / Consolas；没有时自动回退到 Songti SC / Heiti SC、Fandol 或 Noto CJK。ZIP 不包含任何专有字体文件。若本机缺少可用的中文 OpenType 字体，请安装 Fandol 或 Noto CJK 后重试。

## 说明

不生成文件输入输出、样例文件、目录、编译选项等 OJ 不存在的内容。
`;

const BUILD_SH = `#!/usr/bin/env sh
set -eu
xelatex -shell-escape -interaction=nonstopmode main.tex
xelatex -shell-escape -interaction=nonstopmode main.tex
`;

const BUILD_BAT = `@echo off
setlocal
xelatex -shell-escape -interaction=nonstopmode main.tex
if errorlevel 1 exit /b 1
xelatex -shell-escape -interaction=nonstopmode main.tex
if errorlevel 1 exit /b 1
`;

const LATEXMKRC = `$pdf_mode = 5;
$xelatex = 'xelatex -shell-escape %O %S';
$max_repeat = 5;
`;

function imageExtension(contentType) {
  const type = String(contentType || '').toLowerCase().split(';', 1)[0].trim();
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  throw new Error(`不支持的图片格式：${contentType || '未知'}。`);
}

function assertBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error('图片内容格式不正确。');
}

export async function createLatexProject(statement, options = {}) {
  if (typeof options.templateClass !== 'string' || !options.templateClass.trim()) throw new Error('缺少题面 LaTeX 模板。');
  if (typeof options.fetchImage !== 'function') throw new Error('缺少图片读取函数。');
  const converted = statementToLatex(statement, {normalizeMath: options.normalizeMath});
  const files = [
    {name: 'main.tex', data: converted.tex},
    {name: 'oicontest.cls', data: options.templateClass},
    {name: 'README.md', data: README},
    {name: 'build.sh', data: BUILD_SH},
    {name: 'build.bat', data: BUILD_BAT},
    {name: 'latexmkrc', data: LATEXMKRC}
  ];
  let total = files.reduce((size, file) => size + new TextEncoder().encode(file.data).length, 0);
  for (const [index, image] of converted.images.entries()) {
    if (options.signal?.aborted) throw new DOMException('已取消导出。', 'AbortError');
    let result;
    try {
      result = await options.fetchImage(image.url, {signal: options.signal});
      const bytes = assertBytes(result?.bytes);
      if (!bytes.length) throw new Error(`图片为空：${image.url}`);
      if (bytes.length > IMAGE_MAX) throw new Error(`图片超过 10 MB：${image.url}`);
      total += bytes.length;
      if (total > IMAGE_SIZE) throw new Error('图片总大小超过 25 MB，未导出。');
      const extension = imageExtension(result.contentType);
      files.push({name: `images/${image.index}.${extension}`, data: bytes});
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`${image.problem}：${error.message}`);
    }
    if (options.onProgress) options.onProgress({index: index + 1, total: converted.images.length, image});
  }
  if (options.signal?.aborted) throw new DOMException('已取消导出。', 'AbortError');
  if (converted.warnings.length) files.push({name: 'warnings.txt', data: converted.warnings.join('\n') + '\n'});
  const bytes = createStoredZip(files);
  return {
    filename: `${safeFilename(statement.title)}-LaTeX.zip`,
    blob: new Blob([bytes], {type: 'application/zip'}),
    warnings: converted.warnings
  };
}
