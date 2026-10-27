// Both OJ's escaped subscripts and ordinary TeX represent subscripts here.
export function createMarkdownCore() {
  const escaped = (s, i, fromOJ = false) => {
    let n = 0;
    while (i > 0 && s[--i] === '\\') n++;
    // Saved formula backslashes carry one extra Markdown escaping layer.
    if (fromOJ) n = Math.ceil(n / 2);
    return n % 2 === 1;
  };
  function mathBody(s, mode) {
    if (mode === 'from-oj') return s.replace(/\\([\\_])/g, '$1');
    const common = s.replace(/\\*_/g, run => {
      const n = run.length - 1;
      return n % 2 ? run.slice(1) : run;
    });
    // Escape the original backslashes before adding Markdown's subscript escapes.
    return mode === 'oj' ? common.replace(/\\/g, '\\\\').replace(/_/g, '\\_') : common;
  }
  function convert(source, mode = 'oj') {
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const s = source.replace(/\r\n/g, '\n');
    let out = '', i = 0;
    while (i < s.length) {
      const startLine = i === 0 || s[i - 1] === '\n';
      if (startLine) {
        const end = s.indexOf('\n', i), stop = end < 0 ? s.length : end;
        const line = s.slice(i, stop);
        const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence && !(fence[1][0] === '`' && fence[2].includes('`'))) {
          const rest = s.slice(end < 0 ? s.length : end + 1);
          const closing = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}[ \\t]*(?:\\n|$)', 'm').exec(rest);
          // An unfinished fence is a code block through EOF, as in CommonMark.
          const content = rest.slice(0, closing ? closing.index : rest.length);
          const consumed = (end < 0 ? s.length : end + 1) + (closing ? closing.index + closing[0].length : rest.length);
          if (mode === 'oj') {
            if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
            const lines = content.split('\n');
            if (content.endsWith('\n')) lines.pop();
            out += lines.map(line => '    ' + line).join('\n');
            // Keep following prose out of the indented code block.
            if (consumed < s.length) out += '\n\n';
            else if (s.endsWith('\n')) out += '\n';
          } else out += s.slice(i, consumed);
          i = consumed;
          continue;
        }
        // Existing code blocks are already portable; never touch their whitespace or TeX.
        if (/^( {4}|\t)/.test(line)) {
          out += s.slice(i, end < 0 ? s.length : end + 1);
          i = end < 0 ? s.length : end + 1;
          continue;
        }
      }
      // Raw HTML code and tag attributes, URL destinations and inline code are not math.
      const raw = s.slice(i).match(/^<(pre|code|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/i);
      if (raw) { out += raw[0]; i += raw[0].length; continue; }
      const tag = s[i] === '<' && s.slice(i).match(/^<[^>\n]+>/);
      if (tag) { out += tag[0]; i += tag[0].length; continue; }
      const url = s.slice(i).match(/^https?:\/\/[^\s<>]+/);
      if (url) { out += url[0]; i += url[0].length; continue; }
      if (s[i] === '`' && !escaped(s, i)) {
        const run = s.slice(i).match(/^`+/)[0];
        let j = i + run.length, close = -1;
        while ((j = s.indexOf(run, j)) >= 0) {
          if (s[j - 1] !== '`' && s[j + run.length] !== '`') { close = j; break; }
          j += run.length;
        }
        if (close >= 0) { const end = close + run.length; out += s.slice(i, end); i = end; continue; }
        out += run; i += run.length; continue;
      }
      const delim = !escaped(s, i) && (s.startsWith('\\[', i) ? ['\\[', '\\]', '$$'] : s.startsWith('\\(', i) ? ['\\(', '\\)', '$'] : s.startsWith('$$', i) ? ['$$', '$$', '$$'] : s[i] === '$' && /\S/.test(s[i + 1] || '') ? ['$', '$', '$'] : null);
      if (delim) {
        const [open, close, target] = delim;
        let j = i + open.length, found = -1;
        while ((j = s.indexOf(close, j)) >= 0) {
          if (!escaped(s, j, mode === 'from-oj') && (close !== '$' || (s[j - 1] !== '$' && s[j + 1] !== '$' && /\S/.test(s[j - 1])))) { found = j; break; }
          j += close.length;
        }
        if (found >= 0) {
          const body = s.slice(i + open.length, found);
          // Do not interpret separate paragraphs, code fences or inline code as a single formula.
          if (!/\n\s*\n|`/.test(body) && !(target === '$' && body.includes('\n'))) {
            out += target + mathBody(body, mode) + target;
            i = found + close.length;
            continue;
          }
        }
      }
      out += s[i++];
    }
    return eol === '\n' ? out : out.replace(/\n/g, eol);
  }
  return {
    toOJ: source => convert(source, 'oj'),
    toCommon: source => convert(source, 'common'),
    fromOJ: source => convert(source, 'from-oj')
  };
}
