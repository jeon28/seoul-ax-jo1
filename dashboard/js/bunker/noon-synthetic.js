// 가상 NOON REPORT 공급부. 선박명·코드는 실제(data/in/vessels.json), 속력·RPM·소모량·정박 기록은 전부 가상이다.
// 같은 선박 코드는 언제나 같은 값이 나온다(코드로 난수 시드를 고정). 실제 자료로 바꿀 때는 이 파일의 getHistory() 만 바꾼다:
//   입력  vessel = { code, name, teu }
//   출력  { vsl, name, rows(NoonRow[], outlier 표시 끝남), first, last, raw, duplicates, port:{ master, tdr, warnings } }
// 일부러 지저분한 행을 섞는다: 중복, 누적값 오타(이상치), 숫자가 아닌 속력, 정박 소모량 미입력/벙커링 미기록.
import { detectOutliers, toNum, toSpeed } from './performance.js';
import { summarizePort } from './portcalc.js';

/** 가상 자료의 기준일(마지막 NOON 날짜). 홈 카드의 기준일과 맞춘다 */
export const AS_OF = '20261015';

// 설계 TEU 등급별 가상 곡선 파라미터: vref(kn)에서 하루 fo(MT) 를 태운다. 소모량은 속력의 세제곱에 비례하게 만든다.
const CLASSES = [
  { min: 7000, vref: 20, fo: 110, rpm: 88, port: 9.5, vmax: 22 },
  { min: 2650, vref: 18, fo: 62, rpm: 92, port: 7.0, vmax: 20 },
  { min: 2300, vref: 17, fo: 52, rpm: 94, port: 6.5, vmax: 19 },
  { min: 1900, vref: 16.5, fo: 44, rpm: 96, port: 6.0, vmax: 18.5 },
  { min: 1700, vref: 16, fo: 38, rpm: 98, port: 5.5, vmax: 18 },
  { min: 1400, vref: 16, fo: 35, rpm: 100, port: 5.0, vmax: 17.5 },
  { min: 1050, vref: 15, fo: 27, rpm: 102, port: 4.5, vmax: 16.5 },
  { min: 850, vref: 15, fo: 25, rpm: 104, port: 4.2, vmax: 16.5 },
  { min: 600, vref: 14, fo: 20, rpm: 108, port: 3.6, vmax: 15.5 },
  { min: 450, vref: 13.5, fo: 17, rpm: 110, port: 3.2, vmax: 15 },
  { min: 0, vref: 13, fo: 15, rpm: 112, port: 3.0, vmax: 14.5 },
];
const classOf = (teu) => CLASSES.find((c) => (teu || 0) >= c.min) ?? CLASSES.at(-1);

// 문자열 → 32비트 시드, mulberry32 난수
function seedOf(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const asOfDate = () => new Date(Date.UTC(+AS_OF.slice(0, 4), +AS_OF.slice(4, 6) - 1, +AS_OF.slice(6, 8)));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

/** 포털 API 가 돌려주는 모양(문자열 섞임)의 가상 원본 행 */
function rawNoon(vessel) {
  const c = classOf(vessel.teu);
  const r = rng(seedOf('noon:' + vessel.code));
  const hull = 0.93 + r() * 0.14; // 선박마다 연료 효율이 조금 다르다
  const end = asOfDate();
  const rows = [];
  let voy = 2301 + Math.floor(r() * 90);
  for (let d = 1200; d >= 0; d--) {
    if (r() > 0.58) continue; // 항해 중 보고가 있는 날만
    const date = ymd(addDays(end, -d));
    if (d % 55 === 0) voy++;
    const atPort = r() < 0.1;
    let rh;
    let spd;
    const slip = gauss(r) * 3.2;
    if (atPort) {
      rh = Math.floor(r() * 7); // 입출항일: 짧은 보고
      spd = r() * 6;
    } else {
      const u = r();
      rh = u < 0.84 ? 24 : u < 0.9 ? 23 : u < 0.94 ? 25 : 8 + Math.floor(r() * 15);
      spd = Math.min(c.vmax, Math.max(8, c.vref - 1.6 + gauss(r) * 2.3)); // 감속 운항 쪽으로 치우침
    }
    spd = Math.round(spd * 10) / 10;
    const rpm = Math.max(0, c.rpm * (spd / c.vref) * (1 + gauss(r) * 0.015));
    const perDay = atPort ? c.port * (0.5 + r()) : c.fo * hull * (spd / c.vref) ** 3 * (1 + gauss(r) * 0.04);
    let ifo = (perDay * rh) / 24;
    const mgoPerDay = r() < 0.05 ? 0.4 + r() * 1.8 : 0;
    let mgo = (mgoPerDay * rh) / 24;
    // 입력 오류: 누적값/오타 (약 1.2%)
    if (!atPort && r() < 0.012) ifo *= 12 + r() * 28;
    if (!atPort && r() < 0.003) mgo = c.fo * (6 + r() * 10); // 선박 규모에 맞춘 MGO 오타
    let avg = spd.toFixed(1);
    if (r() < 0.006) avg = 'N/A'; // 숫자가 아닌 속력
    rows.push({
      NOON_DATE: date, NOONTIME: '12:00', VYG: `${pad(voy % 100)}${pad(1 + (voy % 52))}${r() < 0.5 ? 'E' : 'W'}`, RH: String(rh), AVG_SPD: avg,
      RPM: rpm.toFixed(1), SLIP: slip.toFixed(1), CONS_IFO: ifo.toFixed(1), CONS_MGO: mgo.toFixed(1),
    });
    if (r() < 0.01) rows.push({ ...rows.at(-1) }); // 똑같은 행 중복(약 1%)
  }
  return rows;
}

/** 원본 noon.ts 와 같은 정규화: 중복 제거 → 숫자 변환 → 이상치 표시 */
function normalizeNoon(vessel, api) {
  const seen = new Set();
  let duplicates = 0;
  const rows = [];
  for (const r of api) {
    const date = r.NOON_DATE;
    if (!date) continue;
    const key = [date, r.NOONTIME, r.VYG, r.RH, r.AVG_SPD, r.RPM, r.SLIP, r.CONS_IFO, r.CONS_MGO].join('|');
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    rows.push({ date, vyg: r.VYG || null, rh: toNum(r.RH), spd: toSpeed(r.AVG_SPD), rpm: toNum(r.RPM), slip: toNum(r.SLIP), ifo: toNum(r.CONS_IFO), mgo: toNum(r.CONS_MGO) });
  }
  const flagged = detectOutliers(rows);
  const dates = flagged.map((r) => r.date).sort();
  return { vsl: vessel.code, name: vessel.name, rows: flagged, first: dates[0] ?? null, last: dates.at(-1) ?? null, raw: api.length, duplicates };
}

/** 가상 TDR(입출항 기록) 최근 12개월 + 선박 제원의 Port MT */
function portInfo(vessel) {
  const c = classOf(vessel.teu);
  const r = rng(seedOf('port:' + vessel.code));
  const h = seedOf(vessel.code);
  const trueFo = c.port * (0.85 + r() * 0.3);
  const trueDo = 0.4 + r() * 0.8;
  const few = h % 11 === 0; // 기항 기록이 적어 참고용만 나오는 선박
  const nCalls = few ? 6 : 17 + Math.floor(r() * 7);
  const calls = [];
  const end = asOfDate();
  for (let i = 0; i < nCalls; i++) {
    const ta = addDays(end, -Math.floor(r() * 360));
    const hrs = 10 + Math.floor(r() * 30);
    const td = new Date(ta.getTime() + hrs * 3_600_000);
    const stamp = (d) => `${ymd(d)}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
    const afo = 700 + Math.floor(r() * 700);
    const ado = 120 + Math.floor(r() * 100);
    const pick = r();
    // 기록 상태: 정상 / 정박 소모량 미입력 / 벙커링 공급량 미기록 / 체류 4시간 미만
    const mode = few ? (i < 3 ? 'ok' : 'unentered') : pick < 0.1 ? 'unentered' : pick < 0.17 ? 'bunkering' : pick < 0.22 ? 'short' : 'ok';
    let dfo = afo - (trueFo * hrs) / 24;
    const ddo = ado - (trueDo * hrs) / 24;
    let tdOut = td;
    if (mode === 'unentered') dfo = afo; // 입항값을 그대로 복사해 둔 경우
    if (mode === 'bunkering') dfo = afo + 250 + Math.floor(r() * 300); // 벙커링했는데 SFO 를 안 적음
    if (mode === 'short') tdOut = new Date(ta.getTime() + 2 * 3_600_000);
    calls.push({ port: ['KRPUS', 'CNSHA', 'JPTYO', 'VNSGN', 'THLCH', 'INNSA'][Math.floor(r() * 6)], ta: stamp(ta), td: stamp(tdOut), afo, dfo: Math.round(dfo * 10) / 10, sfo: 0, ado, ddo: Math.round(ddo * 10) / 10, sdo: 0 });
  }
  const warnings = [];
  const masterOut = h % 8 === 0 ? null : { portMt: Math.round(c.port * (0.9 + r() * 0.3) * 10) / 10, sbyMt: Math.round(c.port * 0.4 * 10) / 10 };
  return { master: masterOut, tdr: summarizePort(calls), warnings };
}

const cache = new Map();
/** 선박 하나의 NOON REPORT 이력 + 정박 소모량 (포털 API 호출 자리) */
export async function getHistory(vessel) {
  if (!vessel) throw new Error('선박 코드를 확인하세요. 목록에 없는 코드입니다.');
  if (!cache.has(vessel.code)) {
    const h = normalizeNoon(vessel, rawNoon(vessel));
    cache.set(vessel.code, { ...h, port: portInfo(vessel) });
  }
  // 실제 API 처럼 약간의 지연(화면이 "조회 중…" 을 보여 주는지 확인용)
  await new Promise((res) => setTimeout(res, 120));
  return cache.get(vessel.code);
}
