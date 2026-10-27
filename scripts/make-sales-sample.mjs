// 영업실적 분석용 가상 샘플 엑셀을 만든다.  실행: node scripts/make-sales-sample.mjs
// 결과: data/in/sales-analysis/demo-monthly-sales.xlsx  (건별: 월 · 화주 · 구분 · POD/POL · TEU, 2026-09 · 2026-10 두 달)
// 화주 이름은 모두 지어낸 이름이다. 10월은 노현석 「월간 영업 카드」 샘플(수출 241 · 수입 158 TEU)과 같은 숫자,
// 9월은 그 카드의 전월 합계(수출 220 · 수입 162 TEU, 화주별 · 항구별)와 맞게 짠 값이다. 설치할 것 없이 zlib 만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 화주별 항구별 TEU. 수출은 도착지(POD), 수입은 선적지(POL).
const DATA = {
  '2026-09': {
    수출: { 가온통상: { 상해: 31, 청도: 16 }, 동방철강: { 상해: 21, 나고야: 5 }, 대성오토파츠: { 천진: 19, 대련: 10 }, 한빛케미칼: { 하이퐁: 24, 호치민: 21 }, 미래플라스틱: { 자카르타: 15, 마닐라: 8 }, 누리전자: { 청도: 16, 하이퐁: 7 }, 서해제지: { 방콕: 16 }, 평택푸드: { 호치민: 11 } },
    수입: { 한결목재: { 호치민: 19, 자카르타: 12 }, 그린바이오: { 하이퐁: 8, 방콕: 14 }, 금강건자재: { 상해: 15, 청도: 10 }, 세원유통: { 청도: 27, 대련: 10 }, 가온통상: { 상해: 17 }, 태양산업: { 천진: 19 }, 바다수산: { 대련: 11 } },
  },
  '2026-10': {
    수출: { 가온통상: { 상해: 32, 청도: 14 }, 동방철강: { 상해: 28, 나고야: 9 }, 대성오토파츠: { 대련: 11, 천진: 22 }, 한빛케미칼: { 하이퐁: 17, 호치민: 15 }, 미래플라스틱: { 마닐라: 9, 자카르타: 19 }, 누리전자: { 청도: 13, 하이퐁: 13 }, 서해제지: { 방콕: 20 }, 하나기계: { 하이퐁: 10, 호치민: 9 } },
    수입: { 한결목재: { 호치민: 20, 자카르타: 13 }, 그린바이오: { 하이퐁: 10, 방콕: 22 }, 금강건자재: { 상해: 16, 청도: 9 }, 세원유통: { 청도: 17, 대련: 5 }, 가온통상: { 상해: 18 }, 태양산업: { 천진: 18 }, 우리상사: { 나고야: 10 } },
  },
};

// 합계를 건 크기(1~8 TEU)로 나눈다. 크기는 정해진 순서를 돌려 쓰므로 실행할 때마다 같은 파일이 나온다.
const SIZES = [4, 6, 2, 5, 3, 7, 1, 8];
let k = 0;
function split(total) {
  const out = [];
  let left = total;
  while (left > 0) { const n = Math.min(SIZES[k++ % SIZES.length], left); out.push(n); left -= n; }
  return out;
}

const aoa = [['월', '화주', '구분', 'POD/POL', 'TEU']];
for (const [month, kinds] of Object.entries(DATA)) {
  for (const [kind, shippers] of Object.entries(kinds)) {
    for (const [shipper, ports] of Object.entries(shippers)) {
      for (const [port, teu] of Object.entries(ports)) split(teu).forEach((n) => aoa.push([month, shipper, kind, port, n]));
    }
  }
}

// ── 아주 작은 xlsx 쓰기: 문자는 inlineStr, 숫자는 그대로, zip 은 압축 없이 저장 ──
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colName = (i) => String.fromCharCode(65 + i);
const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${aoa.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (typeof v === 'number'
  ? `<c r="${colName(j)}${i + 1}"><v>${v}</v></c>`
  : `<c r="${colName(j)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
const files = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="실적" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': sheetXml,
};

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const out = path.join(ROOT, 'data/in/sales-analysis/demo-monthly-sales.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zip(files));
console.log(`${path.relative(ROOT, out)} 만듦: ${aoa.length - 1}건`);
