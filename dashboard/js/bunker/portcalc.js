// 정박 중 소모량(MT/day) — TDR 입출항 기록에서 계산. 순수 함수.
// operation-dashboard 의 lib/portcalc.ts 와 같은 규칙. 입항 ROB(AFO/ADO)와 출항 ROB(DFO/DDO)의 차이를 체류시간(TA→TD)으로 나눈다.
// 믿을 수 없는 행은 0 으로 두지 않고 건너뛴다:
//   · AFO == DFO 정확히 같음      → 정박 소모량을 입력하지 않고 입항값을 복사한 것
//   · DFO > AFO+20 이고 SFO = 0   → 벙커링이 있었는데 공급량을 적지 않음
//   · ROB 없음/0, 체류 4시간 미만, 감소량이 음수, 하루 60MT 초과 → 입력 오류
// 평균이 아니라 중앙값을 쓴다(한 건의 오타가 결과를 못 움직이게).

/** @typedef {{port:string, ta:string|null, td:string|null, afo:number|null, dfo:number|null, sfo:number|null, ado:number|null, ddo:number|null, sdo:number|null}} TdrCall  ta/td = YYYYMMDDHHMM */

/** TDR 실적은 이 건수 이상일 때만 대표값으로 쓴다 */
export const MIN_TDR_CALLS = 5;

const ms = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/** @param {TdrCall[]} input */
export function summarizePort(input) {
  const seen = new Set(); // 같은 기항이 두 번 올라올 수 있다
  const calls = input.filter((c) => {
    const k = `${c.port}|${c.ta}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const skipped = { unentered: 0, bunkering: 0, invalid: 0 };
  const fo = [];
  const mgo = [];
  for (const c of calls) {
    const hrs = c.ta && c.td ? (ms(c.td) - ms(c.ta)) / 3_600_000 : 0;
    if (!c.afo || !c.dfo || hrs < 4) { skipped.invalid++; continue; }
    const supply = c.sfo && c.sfo > 0 ? c.sfo : 0;
    if (!supply && c.dfo > c.afo + 20) { skipped.bunkering++; continue; }
    const drop = c.afo + supply - c.dfo;
    if (drop === 0) { skipped.unentered++; continue; }
    const perDay = (drop / hrs) * 24;
    if (drop < 0 || perDay > 60) { skipped.invalid++; continue; }
    fo.push(perDay);
    // MGO 는 같은 기항에서 벙커링하지 않았을 때만
    const aDo = c.ado ?? 0;
    const dDo = c.ddo ?? 0;
    const sDo = c.sdo && c.sdo > 0 ? c.sdo : 0;
    if (aDo > 0 && dDo > 0 && !(sDo === 0 && dDo > aDo + 5)) {
      const d = ((aDo + sDo - dDo) / hrs) * 24;
      if (d >= 0 && d <= 60) mgo.push(d);
    }
  }
  return { fo: r1(median(fo)), mgo: r1(median(mgo)), n: fo.length, calls: calls.length, skipped };
}
