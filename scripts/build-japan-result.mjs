// 일본 공이송 플래너의 결과 파일(data/out/japan-empty-transfer.json)을 에이전트 실행 결과에서 만든다.
// 실행: node scripts/build-japan-result.mjs      (읽는 곳: data/out/japan-empty-transfer/ 의 balance · schedule · out/plan · out/flags · out/report.md)
// 이송안 계산은 agents/japan-empty-transfer/skills 의 Python 스크립트가 한다. 여기서는 그 결과를 읽어 대시보드 꼴로 옮기기만 하고, 수량을 새로 계산하지 않는다(TEU 합만 더함).
// 모선 이름은 schedule.csv 에 나온 순서대로 V01·V02 코드로 바꾼다(lib/mask 규칙). 항구 이름은 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'data/out/japan-empty-transfer');
const outPath = path.join(ROOT, 'data/out/japan-empty-transfer.json');
const old = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

// 따옴표 안의 쉼표를 지키는 작은 CSV 읽기. 첫 줄은 열 이름.
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const balance = readCsv(path.join(dir, 'balance.csv'));
const schedule = readCsv(path.join(dir, 'schedule.csv'));
const plan = readCsv(path.join(dir, 'out/plan.csv'));
const flags = readCsv(path.join(dir, 'out/flags.csv'));
const report = fs.readFileSync(path.join(dir, 'out/report.md'), 'utf8');

// 모선 코드: 같은 모선명의 여러 항차는 한 코드
const vcode = new Map();
for (const s of schedule) if (!vcode.has(s.vessel)) vcode.set(s.vessel, `V${String(vcode.size + 1).padStart(2, '0')}`);
const mask = (s) => [...vcode].reduce((t, [name, c]) => t.split(name).join(c), s);

const n = (v) => Number(v);
const sum = (rows, k) => rows.reduce((a, r) => a + n(r[k]), 0);
const moveTeu = sum(plan, 'teu');
const moveBox = sum(plan, 'qty');

// 검증 결과와 조회 시각은 report.md 에서 읽는다
const verified = /수량 검증 종합: 통과/.test(report);
const queried = (report.match(/데이터 조회 시각:\s*(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/) || []);
const asOf = queried[1] || old.as_of;

// 플래그 → 확인 필요. SURPLUS_LEFT 는 정보라 review 에 넣지 않는다.
const REASON = {
  SPACE_SHORT: '모선 잔여 스페이스 부족',
  UNRESOLVED: '이송 못 한 부족분',
  CUTOFF_MISSING: 'Cut-off 누락, 이송 배정 제외',
  CUTOFF_BLOCKED: 'Cut-off 누락으로 선적 후보 제외',
  CUTOFF_MISSING_NOIMPACT: 'Cut-off 비어 있음(이번 이송안엔 영향 없음)',
  NO_VESSEL: '내일 기항 모선 없음',
  NO_SURPLUS: '역내 잉여 소진',
  SPACE_MISSING: '모선 잔여 스페이스 값 없음',
  TYPE_PRIORITY_UNSET: '우선순위 표에 없는 타입',
};
const review = [];
const add = (code, reason, detail) => review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code, reason, detail });
for (const f of flags) {
  if (f.flag === 'SURPLUS_LEFT') continue;
  const target = mask(f.target); // "V01 101S" 또는 항구 이름
  const code = target.split(' ')[0];
  const typ = f.type && f.type !== '-' ? `${f.type} ` : '';
  add(code, REASON[f.flag] || f.flag, `${typ}${target}: ${mask(f.detail)}`);
}
// 영향 없는 안내(원본 확인만)는 맨 뒤로
review.sort((a, b) => Number(a.reason.startsWith('Cut-off 비어 있음')) - Number(b.reason.startsWith('Cut-off 비어 있음')));
review.forEach((r, i) => { r.id = `R${String(i + 1).padStart(2, '0')}`; });
if (!verified) add('검증', '수량 검증이 통과가 아님', 'report.md 의 수량 검증이 통과로 나오지 않음. 이 이송안은 쓰지 말고 원본 합계부터 확인');

const count = (flag) => flags.filter((f) => f.flag === flag).length;
const spaceShort = count('SPACE_SHORT');
const unresolved = count('UNRESOLVED');

const doc = {
  schema_version: 1,
  agent: 'japan-empty-transfer',
  owner: old.owner ?? '권도윤',
  bundle: 'A',
  as_of: asOf,
  headline: `이송안 ${plan.length}건 (${moveBox}개 · ${moveTeu} TEU), 스페이스 부족 ${spaceShort}건 · 이송 못 한 부족 ${unresolved}건, 수량 검증 ${verified ? '통과' : '실패'}`,
  metrics: [
    { key: 'processed', label: '이송안', value: plan.length, unit: '건' },
    { key: 'moved_teu', label: '이송 TEU', value: moveTeu, unit: 'TEU' },
    { key: 'space_short', label: '스페이스 부족', value: spaceShort, unit: '건' },
    { key: 'unresolved', label: '이송 못 한 부족', value: unresolved, unit: '건' },
  ],
  table: {
    columns: ['모선코드', '항차', '타입', '출발', '도착', '수량(개)', 'TEU', 'ETD', 'Cut-off'],
    rows: plan.map((p) => [vcode.get(p.vessel) ?? p.vessel, p.voyage, p.type, p.from, p.to, n(p.qty), n(p.teu), p.etd, p.cutoff]),
  },
  review,
  time: old.time ?? { before_min: 30, after_min: 10, runs_per_month: 22, basis: '가정' },
  source: { label: '가상 포트 현황·모선 기항·잔여 스페이스 (sim2)', rows: balance.length },
  rules_version: 'japan-repo-planner@2026-10-27',
  synthetic: true, // 가상 데이터. 실제 시스템 파일로 돌리면 false 로, 그리고 입장 비밀번호부터(CLAUDE.md)
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.headline);
console.log(`표 ${doc.table.rows.length}행, 확인 필요 ${review.length}건, 모선 ${[...vcode].map(([a, c]) => `${a}→${c}`).join(' · ')} → data/out/japan-empty-transfer.json`);
review.forEach((r) => console.log(` ${r.id} ${r.code} ${r.reason}: ${r.detail}`));
