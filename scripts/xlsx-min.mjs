// node 에서 .xlsx 첫 시트를 배열의 배열로 읽는 아주 작은 리더(설치할 것 없음). 가상 샘플 엑셀을 규칙에 넣을 때만 쓴다.
// 문자(inlineStr · sharedStrings)와 숫자 칸만 읽는다. 브라우저 화면은 SheetJS 를 쓰므로 이 파일과 무관하다.
import fs from 'node:fs';
import zlib from 'node:zlib';

function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('xlsx(zip)가 아닙니다');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const unesc = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref) => ref.replace(/\d+/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');

export function readXlsxAoa(file) {
  const files = unzip(fs.readFileSync(file));
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('시트를 찾지 못했습니다');
  const shared = files['xl/sharedStrings.xml']
    ? [...files['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const aoa = [];
  for (const row of files[sheetName].toString('utf8').matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const line = [];
    for (const c of row[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c[1])[1];
      const type = (/t="([^"]+)"/.exec(c[1]) || [])[1];
      const body = c[2] || '';
      let v = '';
      if (type === 'inlineStr') v = textOf(body);
      else if (type === 's') v = shared[+/<v>(\d+)<\/v>/.exec(body)?.[1]] ?? '';
      else if (type === 'str') v = unesc(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      else { const n = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]; v = n === undefined ? '' : Number(n); }
      line[colIndex(ref)] = v;
    }
    for (let i = 0; i < line.length; i++) if (line[i] === undefined) line[i] = '';
    aoa[+row[1] - 1] = line;
  }
  for (let i = 0; i < aoa.length; i++) if (!aoa[i]) aoa[i] = [];
  return aoa;
}
