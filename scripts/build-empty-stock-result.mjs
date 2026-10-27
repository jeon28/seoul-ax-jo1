// 일일 재고 현황의 결과 파일(data/out/empty-stock.json)을 항구 재고 자료에서 규칙으로 계산해 만든다.
// 실행: node scripts/build-empty-stock-result.mjs      (자료: data/in/empty-stock-ports.json)
// 합계·TEU 는 화면(dashboard/js/stock/board.js)과 같은 식: TEU = 22GP + 45GP × 2, 보고 없음(null)은 0 으로 더한다.
// 확인 필요(사람이 볼 것)는 비고와 기준일로 규칙이 걸러 낸다. 숫자를 AI 가 계산하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inPath = path.join(ROOT, 'data/in/empty-stock-ports.json');
const outPath = path.join(ROOT, 'data/out/empty-stock.json');
const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const old = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const n = (v) => (v == null ? 0 : v);
const teuOf = (p) => n(p.s22) + n(p.h22) + (n(p.s45) + n(p.h45)) * 2;
const rows = data.rows;
const latest = rows.map((p) => p.date).sort().at(-1);

const total = rows.reduce((a, p) => ({ s: a.s + n(p.s22) + n(p.s45), h: a.h + n(p.h22) + n(p.h45), teu: a.teu + teuOf(p) }), { s: 0, h: 0, teu: 0 });
const stale = rows.filter((p) => p.date < latest);

const review = [];
const add = (code, reason, detail) => review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code, reason, detail });
for (const p of rows) {
  const gaps = [p.s22 == null && p.s45 == null ? 'SKR' : null, p.h22 == null && p.h45 == null ? 'HAL' : null].filter(Boolean);
  if (gaps.length) add(p.code, '한쪽 선사 보고 없음', `${p.code} ${gaps.join('·')} 보고가 없어 0 으로 더함, 합계가 낮게 나올 수 있음`);
  if (p.note.includes('메일 미확인')) add(p.code, '메일로 확인되지 않은 값', `${p.code} 전달받은 표 값이고 메일로 확인하지 못함`);
  if (/미포함|제외/.test(p.note)) add(p.code, '집계에서 빠진 수량 있음', `${p.code} ${p.note.split('. ').filter((s) => /미포함|제외/.test(s)).join(' / ')}`);
  if (p.date < latest) add(p.code, '기준일이 오래됨', `${p.code} 기준일 ${p.date}, 가장 최신 ${latest} 보다 이전`);
}

const doc = {
  schema_version: 1,
  agent: 'empty-stock',
  owner: old.owner ?? 'hjung',
  bundle: 'A',
  as_of: latest,
  headline: `${rows.length}개 항구, 전체 ${total.teu.toLocaleString('ko-KR')} TEU (SKR ${total.s.toLocaleString('ko-KR')} · HAL ${total.h.toLocaleString('ko-KR')} 개), 확인 필요 ${review.length}건`,
  metrics: [
    { key: 'processed', label: '점검 항구', value: rows.length, unit: '곳' },
    { key: 'total_teu', label: '전체 TEU', value: total.teu, unit: 'TEU' },
    { key: 'stale', label: '기준일 지난 항구', value: stale.length, unit: '곳' },
  ],
  table: {
    columns: ['국가', '항구', '코드', 'SKR 22GP', 'SKR 45GP', 'HAL 22GP', 'HAL 45GP', 'TEU', '기준일'],
    rows: rows.map((p) => [p.country, p.name, p.code, p.s22 ?? '-', p.s45 ?? '-', p.h22 ?? '-', p.h45 ?? '-', teuOf(p), p.date]),
  },
  review,
  time: old.time ?? { before_min: 30, after_min: 10, runs_per_month: 22, basis: '가정' },
  source: { label: 'SKR+HAL 공컨테이너 재고 표(가상)', rows: rows.length },
  rules_version: 'aggregate@v1',
  synthetic: true, // 가상 데이터(담당자 확인). 실제 수량으로 바꾸면 false 로, 그리고 입장 비밀번호부터(CLAUDE.md)
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.headline);
console.log(`표 ${doc.table.rows.length}행, 확인 필요 ${review.length}건, 기준일 지난 항구 ${stale.length}곳 → data/out/empty-stock.json`);
review.forEach((r) => console.log(` ${r.id} ${r.code} ${r.reason}: ${r.detail}`));
