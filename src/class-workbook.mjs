import {readClassXlsx} from './class-xlsx.mjs';
import {createClassXlsReader} from '../vendor/sheetjs/reader.mjs';

let classXlsReader;

// Sniff the contents: renaming an Excel file must not choose the wrong decoder.
// The bundled legacy reader is initialized on the first XLS import only.
export async function readClassWorkbook(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('名册文件不能超过 12 MB。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error('名册文件不能超过 12 MB。');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
    return readClassXlsx(new Blob([bytes]));
  }
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (!signature.every((byte, i) => bytes[i] === byte)) {
    throw new Error('不是有效的 Excel 工作簿，请选择 .xls 或 .xlsx 文件。');
  }
  if (bytes.length < 512) throw new Error('XLS 工作簿内容不完整，请重新导出。');
  classXlsReader ||= createClassXlsReader();
  let workbook;
  try {
    workbook = classXlsReader.read(bytes, {
      type: 'array', dense: true, sheetRows: 10002,
      cellFormula: false, cellHTML: false, cellText: false, bookVBA: false
    });
  } catch {
    throw new Error('无法读取 XLS 工作簿，文件可能已损坏或加密。请取消密码保护后重新导出。');
  }
  if (!workbook.SheetNames?.length) throw new Error('没有可读取的工作表。');
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const ref = sheet['!fullref'] || sheet['!ref'];
    if (!ref) return {name, rows: []};
    const range = classXlsReader.utils.decode_range(ref);
    if (range.e.r > 10000) throw new Error('工作表超过 10001 行。');
    if (range.e.c > 255) throw new Error('工作表超过 256 列。');
    const data = sheet['!data'] || [];
    // Match the XLSX reader: cached scalar values only, no formulas, links or HTML.
    // Keep text identifiers verbatim; numeric cells use their raw values.
    const rows = Array.from({length: range.e.r + 1}, (_, r) =>
      Array.from({length: range.e.c + 1}, (_, c) => {
        const cell = data[r]?.[c];
        return !cell || cell.t === 'e' ? '' : String(cell.v ?? '');
      }));
    return {name, rows};
  });
}
