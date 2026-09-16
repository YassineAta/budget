// Minimal dependency-free .xlsx reader: first worksheet → array of rows (arrays of cell values).
// Handles shared strings, inline strings and numbers — enough for the CMF daily NAV sheet.
import { inflateRawSync } from 'node:zlib';

function unzip(buf) {
  // Locate End Of Central Directory record
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files[name] = () => (method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

const textOf = (xml) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readFirstSheet(buf) {
  const files = unzip(buf);
  const shared = files['xl/sharedStrings.xml']
    ? [...files['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]))
    : [];
  const sheetName = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('no worksheet found');
  const rows = [];
  for (const rm of files[sheetName]().matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = null;
      if (type === 's') val = shared[+v] ?? null;
      else if (type === 'inlineStr') val = textOf(body);
      else if (type === 'str') val = v != null ? decode(v) : null;
      else if (v != null) val = Number(v);
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(row);
  }
  return rows;
}
