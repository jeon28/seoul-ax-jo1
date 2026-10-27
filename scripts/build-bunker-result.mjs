// 소모량 분석 에이전트의 결과 파일(data/out/bunker-consumption.json)을 규칙으로 계산해 만든다.
// 실행: node scripts/build-bunker-result.mjs      (규칙: dashboard/js/bunker/performance.js · portcalc.js)
// 선박명·코드는 실제(data/in/vessels.json), 수치는 가상(noon-synthetic.js). 실제 NOON REPORT 로 바꿔도 이 스크립트는 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(path.join(ROOT, 'dashboard/js/bunker', p)).href);
const { getHistory, AS_OF } = await load('noon-synthetic.js');
const { analyze, DEFAULT_FILTERS, RULES_VERSION, MIN_SAMPLES } = await load('performance.js');
const { MIN_TDR_CALLS } = await load('portcalc.js');

// 오늘 처리할 선박(8000TEU급 Bridge 3척). 늘리려면 코드만 추가한다.
const CODES = ['MEBG', 'MBBG', 'SDBG'];
const TABLE_SPEEDS = [12, 14, 16, 18]; // 기본 속력 범위(12~18kn) 안의 짝수 속력
const PREV = { processed: 3, excluded_ratio: 6 }; // 전회 값(가상)

const fleet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/in/vessels.json'), 'utf8')).vessels;
const outPath = path.join(ROOT, 'data/out/bunker-consumption.json');
const old = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const rows = [];
const review = [];
let rawTotal = 0;
let excluded = 0;
const add = (code, reason, detail) => review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code, reason, detail });

for (const code of CODES) {
  const v = fleet.find((x) => x.code === code);
  if (!v) throw new Error(`선박 목록에 없는 코드: ${code}`);
  const h = await getHistory(v);
  const a = analyze(h.rows, DEFAULT_FILTERS);
  const outliers = h.rows.filter((r) => r.outlier).length;
  const badSpeed = h.rows.filter((r) => r.spd === null).length;
  rawTotal += h.raw;
  excluded += h.duplicates + outliers + badSpeed;

  for (const s of TABLE_SPEEDS) {
    const r = a.rows.find((x) => x.spd === s);
    if (r) rows.push([code, v.name, s, r.total, r.count]);
  }

  // 확인 필요: 규칙으로 걸러진 것만 사람에게 넘긴다
  const thin = a.rows.filter((r) => r.count < MIN_SAMPLES).map((r) => `${r.spd}kn(${r.count}건)`);
  if (thin.length) add(code, '표본이 적은 속도', `${code} ${thin.join(', ')} 는 ${MIN_SAMPLES}건 미만이라 평균의 신뢰도가 낮음`);
  if (a.outliersExcluded >= 5) add(code, '입력 오류 의심 행 많음', `${code} 입력 오류 의심 ${a.outliersExcluded}건을 평균에서 제외함, 원본 확인 필요`);
  const { tdr, master } = h.port;
  const reliable = tdr && tdr.fo !== null && tdr.n >= MIN_TDR_CALLS;
  if (!reliable && !master?.portMt) add(code, '정박 소모량 근거 없음', `${code} TDR 사용 ${tdr?.n ?? 0}건(기준 ${MIN_TDR_CALLS}건)이고 제원 Port MT 도 없음, 직접 입력 필요`);
  else if (reliable && master?.portMt && Math.abs(tdr.fo - master.portMt) / master.portMt > 0.5) add(code, '정박 소모량 두 출처 차이 큼', `${code} TDR ${tdr.fo}t/일 대 제원 ${master.portMt}t/일, 어느 쪽을 쓸지 확인`);
}

const ratio = Math.round((excluded / rawTotal) * 100);
const doc = {
  schema_version: 1,
  agent: 'bunker-consumption',
  owner: old.owner ?? '다니엘',
  bundle: 'D',
  as_of: `${AS_OF.slice(0, 4)}-${AS_OF.slice(4, 6)}-${AS_OF.slice(6, 8)}`,
  headline: `${CODES.length}척 처리, 제외 ${excluded}건(${ratio}%), 확인 필요 ${review.length}건`,
  metrics: [
    { key: 'processed', label: '처리 선박', value: CODES.length, unit: '척', prev: PREV.processed },
    { key: 'excluded_ratio', label: '제외 비율', value: ratio, unit: '%', prev: PREV.excluded_ratio },
    { key: 'excluded_days', label: '제외한 행', value: excluded, unit: '건' },
  ],
  table: { columns: ['선박코드', '선박명', '속도(kn)', '일일 소모량(t)', '건수'], rows },
  review,
  time: old.time ?? { before_min: 10, after_min: 2, runs_per_month: 30, basis: '추정' },
  source: { label: `가상 NOON REPORT (선박 ${CODES.length}척)`, rows: rawTotal },
  rules_version: RULES_VERSION,
  synthetic: true,
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.headline);
console.log(`표 ${rows.length}행, 확인 필요 ${review.length}건 → data/out/bunker-consumption.json`);
review.forEach((r) => console.log(` ${r.id} ${r.code} ${r.reason}: ${r.detail}`));
