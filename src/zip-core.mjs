// Minimal stored (uncompressed) ZIP writer shared by the XLSX and LaTeX exports.
// Keeping it dependency-free lets both exports work offline in the userscript.
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

/** Create a ZIP with stored entries. Each entry is `{name, data}`. */
export function createStoredZip(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('ZIP 没有可写入的文件。');
  const encoder = new TextEncoder(), localParts = [], centralParts = [], names = new Set();
  let offset = 0;
  for (const file of files) {
    const name = String(file?.name || '');
    if (!name || names.has(name)) throw new Error('ZIP 文件名缺失或重复。');
    names.add(name);
    const encodedName = encoder.encode(name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    if (!(data instanceof Uint8Array)) throw new Error('ZIP 文件内容格式不正确。');
    const checksum = crc32(data), size = data.length;
    const local = joinBytes([u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(33), u32(checksum), u32(size), u32(size), u16(encodedName.length), u16(0), encodedName, data]);
    localParts.push(local);
    const central = joinBytes([u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(33), u32(checksum), u32(size), u32(size), u16(encodedName.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), encodedName]);
    centralParts.push(central);
    offset += local.length;
  }
  const central = joinBytes(centralParts), locals = joinBytes(localParts);
  return joinBytes([locals, central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(locals.length), u16(0)]);
}
