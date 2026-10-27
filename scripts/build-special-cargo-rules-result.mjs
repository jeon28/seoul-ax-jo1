// 스페셜화물 내규 판정의 결과 파일(data/out/special-cargo-rules.json)을 신청 자료에 금지 리스트 규칙을 돌려 만든다.
// 실행: node scripts/build-special-cargo-rules-result.mjs
//   자료: data/in/special-cargo-rules/prohibit-lists.json · requests.json   규칙: dashboard/js/dgdesk/rules.js (= lib/special-cargo-rules.md)
// 화면(DG 승인 데스크)과 같은 규칙 코드를 쓴다. 판정은 규칙이 하고 AI 는 계산·판정하지 않는다.
// 결과 파일에는 이름 가린 코드(Q·S·L)만 쓴다. 확인 필요(review)는 보류·불가 건과 같은 UN 번호의 최근 사고 이력이 있는 건이다.
//   사고 자료: data/in/special-cargo-rules/accident-cases.json (가상)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inDir = path.join(ROOT, 'data/in/special-cargo-rules');
const outPath = path.join(ROOT, 'data/out/special-cargo-rules.json');
const { RULES_VERSION, STATUS, ACCIDENT_MONTHS, compileLists, cleanRequests, cleanAccidents, judgeAll, accidentText } = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/dgdesk/rules.js')).href);

const read = (f) => JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'));
const old = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const lists = compileLists(read('prohibit-lists.json'));
const req = read('requests.json');
const { rows, skipped } = cleanRequests(req.requests);
if (!rows.length) throw new Error('신청 자료가 비었거나 형식이 맞지 않습니다');
const asOf = (req.snapshot_at || '').slice(0, 10) || old.as_of;
const acc = cleanAccidents(read('accident-cases.json').cases); // 기준일은 신청 처리 시점(asOf): 같은 자료면 언제 돌려도 같은 결과
const { items, count } = judgeAll(lists, rows, { accidents: acc.rows, asOf });
const withAcc = items.filter((x) => x.accident && x.accident.recent.length);
const cargoText = (x) => x.cargos.map((c) => `Class ${c.cls} / UN ${c.un}`).join(', ');

const review = [];
items.filter((x) => x.status !== 'ok').forEach((x) => {
  review.push({
    id: `R${String(review.length + 1).padStart(2, '0')}`,
    code: x.id,
    reason: x.status === 'hold' ? '조건 확인 필요(보류)' : '금지 리스트 해당(불가)',
    detail: `${x.id} ${cargoText(x)} · ${x.listName} · ${x.reason}`,
  });
});
// 같은 UN 번호의 최근 사고 이력: 판정이 가능이어도 사람이 확인한다(자동 승인하지 않음)
withAcc.forEach((x) => {
  const uns = [...new Set(x.accident.recent.map((a) => a.un))].join(', ');
  review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code: x.id, reason: '같은 UN 번호 최근 사고 이력', detail: `${x.id} UN ${uns} · ${accidentText(x.accident, ACCIDENT_MONTHS)} · 판정은 ${STATUS[x.status]}` });
});
if (acc.skipped) review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code: '자료', reason: '형식이 맞지 않는 사고 사례 행', detail: `사고 사례 표에서 형식이 맞지 않아 건너뛴 행 ${acc.skipped}개` });
if (skipped) review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code: '자료', reason: '형식이 맞지 않는 신청 행', detail: `신청 자료에서 형식이 맞지 않아 건너뛴 행 ${skipped}개` });

const doc = {
  schema_version: 1,
  agent: 'special-cargo-rules',
  owner: old.owner ?? '이병선',
  bundle: 'C',
  as_of: asOf,
  headline: `${items.length}건 판정: 가능 ${count.ok} · 불가 ${count.bad} · 검토 필요 ${count.hold}${withAcc.length ? `, 최근 사고 이력 ${withAcc.length}건` : ''}`,
  metrics: [
    { key: 'processed', label: '판정 건수', value: items.length, unit: '건' },
    { key: 'ok', label: '가능', value: count.ok, unit: '건' },
    { key: 'no', label: '불가', value: count.bad, unit: '건' },
    { key: 'check', label: '검토 필요', value: count.hold, unit: '건' },
    { key: 'accident', label: `최근 ${ACCIDENT_MONTHS}개월 사고 이력`, value: withAcc.length, unit: '건' },
  ],
  table: {
    columns: ['요청코드', '선박', '구간', 'UN·Class', '적용 리스트', '판정', '근거', '사고 이력'],
    rows: items.map((x) => [x.id, x.vessel, x.route, cargoText(x), x.listName, STATUS[x.status], x.reason, accidentText(x.accident, ACCIDENT_MONTHS)]),
  },
  review,
  time: old.time ?? { before_min: 1, after_min: 0.3, runs_per_month: 660, basis: '추정' },
  source: { label: '가상 DG 신청(공유본 스냅샷, 이름 가림) · 금지 리스트 VER.10/11 · 가상 사고 사례', rows: items.length },
  rules_version: RULES_VERSION,
  synthetic: true, // 선박·발신처를 코드로 가린 신청이라 true. 가리지 않은 실제 신청을 올리게 되면 false 로, 그리고 입장 비밀번호부터(CLAUDE.md)
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.headline);
console.log(`표 ${doc.table.rows.length}행, 확인 필요 ${review.length}건, 기준일 ${asOf} → data/out/special-cargo-rules.json`);
review.forEach((r) => console.log(` ${r.id} ${r.code} ${r.reason}: ${r.detail}`));
