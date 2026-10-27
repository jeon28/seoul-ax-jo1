// 속도별 소모량 계산(Speed Performance). 순수 함수만 있어서 브라우저와 node 어디서나 쓴다.
// operation-dashboard 의 lib/performance.ts 와 같은 규칙:
//   속도 = Math.round(AVG_SPD) 로 묶고, RPM/FO/MGO = 합 ÷ 묶음 행 수.
//   FO·MGO 는 MT/day(÷RH×24)로 바꾼다. RH=0 행은 0 으로 더하되 분모에는 남는다.
//   TOTAL = round1(FO) + round1(MGO) 를 다시 반올림.
// 이 파일의 숫자(DEFAULT_FILTERS · 5배 규칙)가 CLAUDE.md 의 「제외 규칙 숫자표」다. 바꾸면 rules_version 도 올린다.

/** @typedef {{date:string, vyg:string|null, rh:number, spd:number|null, rpm:number, slip:number, ifo:number, mgo:number, outlier:boolean}} NoonRow  date = YYYYMMDD, spd null = 숫자가 아닌 속력 */
/** @typedef {{rhMin:number, rhMax:number, slipMin:number, slipMax:number, spdMin:number, spdMax:number, from?:string, excludeOutliers:boolean}} Filters */

export const RULES_VERSION = 'aggregate@v1';

/** @type {Filters} */
export const DEFAULT_FILTERS = { rhMin: 23, rhMax: 25, slipMin: -10, slipMax: 10, spdMin: 10, spdMax: 22, excludeOutliers: true };

/** 이상치 기준: 그 선박 항해 중 일일 FO 중앙값의 몇 배부터 입력 오류로 보나 */
export const OUTLIER_FACTOR = 5;
/** 기준선(중앙값)을 만들려면 필요한 정상 항해 행 수 */
export const OUTLIER_MIN_BASE = 10;

/** parseFloat(x) || 0 */
export const toNum = (v) => parseFloat(String(v ?? '')) || 0;

/** 빈 값·0 은 0, 숫자가 아닌 문자열은 null (그 행은 속도 오류로 센다) */
export function toSpeed(v) {
  if (v === null || v === undefined || v === '' || v === 0) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * 하루 환산 FO 또는 MGO 가 그 선박 일일 FO 중앙값의 5배를 넘으면 입력 오류 의심(누적값·오타).
 * 연료는 속도의 세제곱 비슷하게 늘어 14→22kn 이 약 4배라서 5배면 정상 변동은 남기고 오타만 걸린다.
 */
export function detectOutliers(rows) {
  const base = rows.filter((r) => r.rh >= 20 && (r.spd ?? 0) >= 5 && r.ifo > 0).map((r) => (r.ifo / r.rh) * 24);
  const med = base.length >= OUTLIER_MIN_BASE ? median(base) : 0;
  const limit = med * OUTLIER_FACTOR;
  return rows.map((r) => ({ ...r, outlier: limit > 0 && r.rh > 0 && ((r.ifo / r.rh) * 24 > limit || (r.mgo / r.rh) * 24 > limit) }));
}

const r1 = (n) => n.toFixed(1);

/**
 * @param {NoonRow[]} rows
 * @param {Filters} f
 * @returns {{rows:{spd:number,count:number,rpm:number,fo:number,mgo:number,total:number}[], used:number, outliersExcluded:number, badSpeed:number}}
 */
export function analyze(rows, f) {
  const groups = new Map();
  let outliersExcluded = 0;
  let badSpeed = 0;
  for (const r of rows) {
    if (f.from && r.date < f.from) continue;
    if (r.rh < f.rhMin || r.rh > f.rhMax) continue;
    if (r.slip < f.slipMin || r.slip > f.slipMax) continue;
    if (r.spd === null) { badSpeed++; continue; }
    const s = Math.round(r.spd);
    if (s < f.spdMin || s > f.spdMax) continue;
    if (r.outlier && f.excludeOutliers) { outliersExcluded++; continue; }
    const g = groups.get(s);
    if (g) g.push(r); else groups.set(s, [r]);
  }
  const out = [];
  let used = 0;
  for (const [spd, g] of groups) {
    const c = g.length;
    used += c;
    const rpm = g.reduce((x, r) => x + r.rpm, 0) / c;
    const fo = g.reduce((x, r) => x + (r.rh > 0 ? (r.ifo / r.rh) * 24 : 0), 0) / c;
    const mgo = g.reduce((x, r) => x + (r.rh > 0 ? (r.mgo / r.rh) * 24 : 0), 0) / c;
    const foS = r1(fo);
    const mgoS = r1(mgo);
    out.push({ spd, count: c, rpm: Number(r1(rpm)), fo: Number(foS), mgo: Number(mgoS), total: Number(r1(parseFloat(foS) + parseFloat(mgoS))) });
  }
  out.sort((a, b) => b.spd - a.spd);
  return { rows: out, used, outliersExcluded, badSpeed };
}

export function toCsv(vessel, a) {
  const head = 'VESSEL,SPEED,N,RPM,FO(MT/day),MGO(MT/day),TOTAL(MT/day)';
  const body = a.rows.map((r) => [vessel, r.spd, r.count, r.rpm.toFixed(1), r.fo.toFixed(1), r.mgo.toFixed(1), r.total.toFixed(1)].join(','));
  return [head, ...body].join('\r\n');
}

/** 정박 중 소모량(portcalc)과 같이 쓰는 "신뢰할 만한 건수" 기준 */
export const MIN_SAMPLES = 3;
