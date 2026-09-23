// Local OOXML reader: shared strings, inline strings, cached formula values, multiple sheets.
// No workbook bytes leave the browser. ZIP limits also bound decompression memory.
export async function readClassXlsx(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('名册文件不能超过 12 MB。');
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
  const u16 = n => view.getUint16(n, true), u32 = n => view.getUint32(n, true);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) {end = i; break;}
  }
  if (end < 0) throw new Error('不是有效的 XLSX 文件，请使用 Excel 另存为 .xlsx。');
  if (u16(end + 4) || u16(end + 6)) throw new Error('不支持分卷工作簿。');
  const count = u16(end + 10), entries = new Map(), decoder = new TextDecoder('utf-8');
  if (count > 2000) throw new Error('工作簿文件结构过大。');
  let pos = u32(end + 16), total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || u32(pos) !== 0x02014b50) throw new Error('工作簿 ZIP 目录损坏。');
    const flags = u16(pos + 8), method = u16(pos + 10), packed = u32(pos + 20), size = u32(pos + 24);
    const len = u16(pos + 28), extra = u16(pos + 30), comment = u16(pos + 32), offset = u32(pos + 42);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + len));
    total += size;
    if (flags & 1 || size > 24 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('工作簿已加密或解压后过大。');
    if (entries.has(name)) throw new Error('工作簿包含重复文件。');
    entries.set(name, {offset, packed, size, method});
    pos += 46 + len + extra + comment;
  }
  async function xml(name, optional = false) {
    const e = entries.get(name);
    if (!e) {if (optional) return null; throw new Error('工作簿缺少 ' + name);}
    if (e.offset + 30 > bytes.length || u32(e.offset) !== 0x04034b50) throw new Error('工作簿内容损坏。');
    const start = e.offset + 30 + u16(e.offset + 26) + u16(e.offset + 28);
    if (start + e.packed > bytes.length) throw new Error('工作簿内容不完整。');
    let content = bytes.subarray(start, start + e.packed);
    if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持 XLSX 解压，请更新浏览器。');
      const reader = new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = []; let length = 0;
      try {for (;;) {const {value, done} = await reader.read(); if (done) break; length += value.length;
        if (length > e.size) throw new Error('工作簿解压大小异常。'); chunks.push(value);}}
      finally {await reader.cancel();}
      content = new Uint8Array(length); let offset = 0; for (const c of chunks) {content.set(c, offset); offset += c.length;}
    } else if (e.method !== 0) throw new Error('不支持此工作簿的压缩方式。');
    if (content.length !== e.size) throw new Error('工作簿解压不完整。');
    const text = decoder.decode(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('工作簿 XML 包含不支持的声明。');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('工作簿 XML 无法解析。');
    return doc;
  }
  const tags = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const text = node => tags(node, 't').map(t => t.textContent).join('');
  const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels'), strings = await xml('xl/sharedStrings.xml', true);
  const shared = strings ? tags(strings, 'si').map(text) : [];
  const paths = new Map(tags(rels, 'Relationship').filter(r => r.getAttribute('TargetMode') !== 'External').map(r => {
    const url = new URL(r.getAttribute('Target'), 'https://xlsx.invalid/xl/workbook.xml');
    return [r.getAttribute('Id'), url.origin === 'https://xlsx.invalid' ? url.pathname.slice(1) : ''];
  }));
  const sheets = [];
  for (const sheet of tags(wb, 'sheet')) {
    const rid = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const path = paths.get(rid); if (!path) continue;
    const doc = await xml(path), rows = [];
    for (const row of tags(doc, 'row')) {
      const index = Number(row.getAttribute('r')) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 10000) throw new Error('工作表超过 10001 行或行号无效。');
      const cells = [];
      for (const c of tags(row, 'c')) {
        const ref = /^([A-Z]+)\d+$/.exec(c.getAttribute('r') || ''); if (!ref) continue;
        let col = 0; for (const letter of ref[1]) col = col * 26 + letter.charCodeAt(0) - 64;
        if (col > 256) throw new Error('工作表超过 256 列。');
        const type = c.getAttribute('t'), raw = tags(c, 'v')[0]?.textContent || '';
        cells[col - 1] = type === 'inlineStr' ? text(c) : type === 's' ? shared[Number(raw)] ?? '' : type === 'e' ? '' : raw;
      }
      rows[index] = cells;
    }
    sheets.push({name: sheet.getAttribute('name') || '工作表', rows: Array.from({length: rows.length}, (_, i) => rows[i] || [])});
  }
  if (!sheets.length) throw new Error('没有可读取的工作表。');
  return sheets;
}

function scoreMatrixRows(matrix) {
  if (!matrix || !Array.isArray(matrix.headers) || !Array.isArray(matrix.rows)) throw new Error('成绩矩阵格式不匹配。');
  return [matrix.headers, ...matrix.rows];
}

function csvCell(value) {
  const text = String(value ?? '');
  // CSV has no cell types. An apostrophe prevents spreadsheet apps from evaluating
  // formula-like text. CSV consumers must import student IDs as text; quotes
  // alone cannot prevent Excel from converting 001 to a number.
  const safe = /^[\s]*[=+@\-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Serialize a score matrix as UTF-8 BOM CSV with CRLF rows. */
export function serializeClassScoreCsv(matrix) {
  return '\ufeff' + scoreMatrixRows(matrix).map(row => row.map(csvCell).join(',')).join('\r\n');
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '\ufffd').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;');
}

function columnName(number) {
  let result = '';
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

function scoreSheetXml(matrix) {
  const rows = scoreMatrixRows(matrix);
  const body = rows.map((row, rowIndex) => {
    const number = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${number}`;
      const numeric = rowIndex > 0 && (columnIndex === 2 || columnIndex === 3) && typeof value === 'number' && Number.isFinite(value);
      return numeric
        ? `<c r="${ref}" t="n"><v>${String(value)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${number}">${cells}</row>`;
  }).join('');
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const ref = `A1:${columnName(Math.max(1, width))}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${ref}"/><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255);
}

function u32(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function joinBytes(parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function zipStore(files) {
  const encoder = new TextEncoder(), localParts = [], centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const checksum = crc32(data), size = data.length;
    const local = joinBytes([u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(33), u32(checksum), u32(size), u32(size), u16(name.length), u16(0), name, data]);
    localParts.push(local);
    const central = joinBytes([u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(33), u32(checksum), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    centralParts.push(central);
    offset += local.length;
  }
  const central = joinBytes(centralParts), locals = joinBytes(localParts);
  return joinBytes([locals, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(locals.length), u16(0)]);
}

/** Create a minimal, dependency-free XLSX workbook as ZIP bytes. */
export function createClassScoreXlsx(matrix) {
  const sheet = scoreSheetXml(matrix);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="比赛成绩" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return zipStore([
    {name: '[Content_Types].xml', data: contentTypes},
    {name: '_rels/.rels', data: rootRels},
    {name: 'xl/workbook.xml', data: workbook},
    {name: 'xl/_rels/workbook.xml.rels', data: workbookRels},
    {name: 'xl/worksheets/sheet1.xml', data: sheet}
  ]);
}

export function createClassScoreExport(matrix, className, contestTitle, format = 'xlsx') {
  if (!['xlsx', 'csv'].includes(format)) throw new Error('不支持的成绩导出格式。');
  const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim().slice(0, 60) || '未命名';
  const filename = `${cleanName(className)}-${cleanName(contestTitle)}-成绩.${format}`;
  const content = format === 'csv' ? serializeClassScoreCsv(matrix) : createClassScoreXlsx(matrix);
  const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return {filename, blob: new Blob([content], {type})};
}

export const serializeClassScoreXlsx = createClassScoreXlsx;
export const buildClassScoreXlsx = createClassScoreXlsx;
export function createClassScoreXlsxBlob(matrix) { return new Blob([createClassScoreXlsx(matrix)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); }
