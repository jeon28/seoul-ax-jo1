// Off hire 관리 계산 규칙(순수 함수 · node 에서도 돈다). 규칙 번호는 agents/offhire/skills/*/SKILL.md 와 같다.
// 입력: 사내 시스템의 "Off Hire & Vessel's UnderPerformance Claim" 엑셀(시트 1개)을 배열의 배열로 읽은 것.
//   1행 제목 → 'SEQ' 로 시작하는 머리글 행 → 건별 행 → 맨 아래 합계 행(SEQ 빈칸)
// 금액은 브라우저 안에서만 계산한다. 결과 파일(buildResult)에는 금액을 넣지 않는다.
export const RULES_VERSION = 'offhire-rules@v1';

// 허용 차이 숫자표
export const MONEY_TOL = 0.05; // 검산: 금액 허용 차이(센트 반올림)
export const DAYS_TOL = 0.0005; // 검산 1: Days 허용 차이(약 43초)
export const RATE_TOL = 0.01; // 점검 2: 건끼리 Hire·ADD.C·BRK·CEV 일 단가 허용 차이 1%
export const TIME_BEFORE_MIN = 45; // 건당 수작업(30~60분의 중간)
export const TIME_AFTER_MIN = 10;

const SEVERITY = { 일치: 0, '확인 필요': 1, '짝 없음': 2, 불일치: 3 };

// 머리글 이름 → 내부 키 (대소문자·공백 무시)
const COLS = {
  seq: 'SEQ', port: 'Port', voyage: 'Voyage', start: 'Start Date', end: 'End Date', days: 'Days',
  hire: 'Hire', addc: 'ADD.C', addcAmt: 'ADD.C AMT', brk: 'BRK', brkAmt: 'BRK AMT', hireTotal: 'Hire Total',
  foQty: 'F/O Qty', foPrice: 'F/O Price', foTotal: 'F/O Total',
  doQty: 'D/O Qty', doPrice: 'D/O Price', doTotal: 'D/O Total',
  cev: 'CEV AMT', lash: 'Lash/Material', vat: 'VAT', total: 'TOTAL', remark: 'Remark',
};
const LABEL = {
  days: 'Days', addcAmt: 'ADD.C AMT', brkAmt: 'BRK AMT', hireTotal: 'Hire Total',
  foTotal: 'F/O Total', doTotal: 'D/O Total', cev: 'CEV AMT', lash: 'Lash/Material', vat: 'VAT', total: 'TOTAL',
};
const SUM_KEYS = ['addcAmt', 'brkAmt', 'hireTotal', 'foTotal', 'doTotal', 'cev', 'lash', 'vat', 'total'];
const NUM_KEYS = ['days', 'hire', 'addc', 'addcAmt', 'brk', 'brkAmt', 'hireTotal', 'foQty', 'foPrice', 'foTotal',
  'doQty', 'doPrice', 'doTotal', 'cev', 'lash', 'vat', 'total'];

const fmtTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
function text(v) {
  if (v instanceof Date) return fmtTime(v.getTime() - v.getTimezoneOffset() * 60000);
  return v === null || v === undefined ? '' : String(v).trim();
}
const norm = (h) => text(h).toLowerCase().replace(/\s+/g, '');
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = text(v).replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const round = (n, d) => { const f = 10 ** d; return Math.round(n * f) / f; };
const pctDiff = (a, b) => (b === 0 ? (a === 0 ? 0 : 100) : (Math.abs(a - b) / Math.abs(b)) * 100);
const fmtPct = (p) => (p < 0.1 ? '0.1% 미만' : `${round(p, 1)}%`);

// 'YYYY-MM-DD HH:MM' 글자 또는 Date → 같은 기준의 밀리초
export function parseTime(v) {
  if (v instanceof Date) return v.getTime() - v.getTimezoneOffset() * 60000;
  const m = text(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
export { fmtTime };

// 파일 이름 앞 4글자 선박 코드 (예: 'PCBJ Off hire.xls' → PCBJ)
export function vesselFromFileName(name) {
  const m = text(name).replace(/^.*[\\/]/, '').match(/^([A-Za-z0-9]{4})(?=[\s_\-.])/);
  return m ? m[1].toUpperCase() : '';
}

// 시트(배열의 배열) → { rows: 건별 행, totals: 합계 행 }
export function readSheet(aoa) {
  let hi = -1;
  for (let i = 0; i < aoa.length && i < 20; i++) {
    if (norm((aoa[i] || [])[0]) === 'seq') { hi = i; break; }
  }
  if (hi < 0) throw new Error("'SEQ'로 시작하는 머리글 행을 찾지 못했습니다.");
  const head = aoa[hi].map(norm);
  const idx = {};
  const missing = [];
  Object.keys(COLS).forEach((k) => {
    const j = head.indexOf(norm(COLS[k]));
    if (j < 0) missing.push(COLS[k]); else idx[k] = j;
  });
  if (missing.length) throw new Error(`머리글에 없는 칸: ${missing.join(', ')}`);
  const rows = [];
  let totals = null;
  for (let r = hi + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    const o = {};
    Object.keys(idx).forEach((k) => { o[k] = line[idx[k]]; });
    const hasNumber = SUM_KEYS.some((k) => num(o[k]) !== null);
    if (text(o.seq)) rows.push(o);
    else if (hasNumber && !text(o.start)) totals = o;
  }
  return { rows, totals };
}

// 여러 건에서 가장 많이 나온 값(건끼리 비교 기준). 두 번 이상 나온 값이 없으면 null
function mode(values) {
  const count = {};
  let best = null;
  let bestN = 0;
  values.forEach((v) => {
    if (v === null) return;
    const k = String(round(v, 4));
    count[k] = (count[k] || 0) + 1;
    if (count[k] > bestN) { bestN = count[k]; best = v; }
  });
  return bestN > 1 ? best : null;
}

/*
 * 스킬 1 · offhire 검산 (검산 1~6 + 점검 1~3)
 * 돌려주는 것: { table: 건별 행(금액 포함 — 화면 안에서만), totalsCheck, vessel }
 */
export function run(aoa, opts = {}) {
  const vessel = (opts.vessel || vesselFromFileName(opts.fileName) || '----').toUpperCase();
  const sheet = readSheet(aoa);
  const table = [];

  const addIssue = (row, status, item, why, rule) => {
    row.issues.push({ status, item, why, rule });
    if (SEVERITY[status] > SEVERITY[row.verdict]) row.verdict = status;
  };
  const moneyCheck = (row, key, calc, rule) => {
    const given = row.v[key];
    row.calc[key] = calc === null ? null : round(calc, 2);
    if (given === null || calc === null) return;
    if (Math.abs(given - calc) > MONEY_TOL) {
      addIssue(row, '불일치', LABEL[key], `${LABEL[key]} 기입값이 계산값과 ${fmtPct(pctDiff(given, calc))} 다름`, rule);
    }
  };

  sheet.rows.forEach((o) => {
    const row = {
      seq: text(o.seq), port: text(o.port), voyage: text(o.voyage),
      start: text(o.start), end: text(o.end), remark: text(o.remark),
      v: {}, calc: {}, verdict: '일치', issues: [],
    };
    NUM_KEYS.forEach((k) => { row.v[k] = num(o[k]); });
    const v = row.v;

    // 점검 1: 빈 칸·기간
    const need = { start: 'Start Date', end: 'End Date', days: 'Days', hire: 'Hire', total: 'TOTAL' };
    const blank = Object.keys(need).filter((k) => (k === 'start' || k === 'end' ? !row[k] : v[k] === null)).map((k) => need[k]);
    if (blank.length) addIssue(row, '확인 필요', '빈 칸', `${blank.join(', ')} 칸이 비어 있음`, '점검 1 빈 칸');
    if (!row.remark) addIssue(row, '확인 필요', 'Remark', 'Off-hire 사유(Remark)가 비어 있음', '점검 1 빈 칸');

    // 검산 1: Days
    const s = parseTime(o.start);
    const e = parseTime(o.end);
    row.s = s;
    row.e = e;
    if (s !== null && e !== null) {
      if (e <= s) addIssue(row, '확인 필요', '기간', 'End Date가 Start Date보다 빠르거나 같음', '점검 1 기간');
      else {
        row.calc.days = round((e - s) / 86400000, 4);
        if (v.days !== null && Math.abs(v.days - row.calc.days) > DAYS_TOL) {
          addIssue(row, '불일치', 'Days', `기입 ${v.days}일 / 계산 ${row.calc.days}일`, '검산 1 Days');
        }
      }
    }

    // 검산 2~5: 금액 — 기입된 Days 기준으로 계산해, Days 오류가 다른 칸으로 번지지 않게 한다
    const gross = v.days !== null && v.hire !== null ? v.days * v.hire : null;
    moneyCheck(row, 'addcAmt', gross !== null && v.addc !== null ? (gross * v.addc) / 100 : null, '검산 2 커미션');
    moneyCheck(row, 'brkAmt', gross !== null && v.brk !== null ? (gross * v.brk) / 100 : null, '검산 2 커미션');
    moneyCheck(row, 'hireTotal', gross !== null ? gross - (v.addcAmt || 0) - (v.brkAmt || 0) : null, '검산 3 Hire Total');
    moneyCheck(row, 'foTotal', v.foQty !== null && v.foPrice !== null ? v.foQty * v.foPrice : null, '검산 4 Bunker');
    moneyCheck(row, 'doTotal', v.doQty !== null && v.doPrice !== null ? v.doQty * v.doPrice : null, '검산 4 Bunker');
    moneyCheck(row, 'total', (v.hireTotal || 0) + (v.foTotal || 0) + (v.doTotal || 0) + (v.cev || 0) + (v.lash || 0) + (v.vat || 0), '검산 5 TOTAL');

    row.cevDaily = v.cev !== null && v.days ? v.cev / v.days : null;
    table.push(row);
  });

  // 점검 2: 건끼리 Hire·ADD.C·BRK·CEV 일 단가가 같은지(C/P 조건은 보통 같음)
  [['Hire(일 용선료)', (r) => r.v.hire], ['ADD.C %', (r) => r.v.addc], ['BRK %', (r) => r.v.brk], ['CEV 일 단가', (r) => r.cevDaily]].forEach(([label, pick]) => {
    const ref = mode(table.map(pick));
    if (ref === null) return;
    table.forEach((r) => {
      const x = pick(r);
      if (x !== null && pctDiff(x, ref) > RATE_TOL * 100) {
        addIssue(r, '확인 필요', label, `${label}이(가) 다른 건과 ${fmtPct(pctDiff(x, ref))} 다름. 용선료 변경·C/P 조건 확인`, '점검 2 건끼리 비교');
      }
    });
  });

  // 점검 3: 기간 겹침
  const sorted = table.filter((r) => r.s !== null && r.e !== null && r.e > r.s).sort((a, b) => a.s - b.s);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s < sorted[i - 1].e) addIssue(sorted[i], '확인 필요', '기간 겹침', `SEQ ${sorted[i - 1].seq}와 기간이 겹침`, '점검 3 기간 겹침');
  }

  // 검산 6: 합계 행 = 건별 합
  const totalsCheck = { found: !!sheet.totals, diffs: [] };
  if (sheet.totals) {
    SUM_KEYS.forEach((k) => {
      const given = num(sheet.totals[k]);
      if (given === null) return;
      const sum = table.reduce((a, r) => a + (r.v[k] || 0), 0);
      if (Math.abs(given - sum) > MONEY_TOL) totalsCheck.diffs.push({ key: k, label: LABEL[k], pct: pctDiff(given, sum) });
    });
  }
  return { table, totalsCheck, vessel };
}

export const counts = (table) => {
  const c = { total: table.length, match: 0, diff: 0, check: 0 };
  table.forEach((r) => {
    if (r.verdict === '일치') c.match++;
    else if (r.verdict === '불일치') c.diff++;
    else c.check++;
  });
  return c;
};

// 협정 대장(History)의 상태별 건수. 상태를 안 적은 줄은 '미입력'
export function ledgerCounts(history) {
  const c = { 청구: 0, 반론: 0, 합의: 0, 정산: 0, 미입력: 0 };
  Object.values(history || {}).forEach((list) => (list || []).forEach((e) => { c[e.status in c ? e.status : '미입력']++; }));
  return c;
}

/*
 * 공통 결과 파일(lib/result-shape.md 꼴)로 만든다. 금액은 넣지 않고, 선박은 S01 로 가린다.
 * opts: { baseDate, ledger(ledgerCounts 결과), ledgerRows, sourceLabel, synthetic }
 */
export function buildResult(out, opts = {}) {
  const code = 'S01';
  const c = counts(out.table);
  const led = opts.ledger || ledgerCounts({});
  const totalsBad = out.totalsCheck.diffs.length ? 1 : 0;

  const review = [];
  const add = (reason, detail) => review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code, reason, detail });
  out.table.forEach((row) => row.issues.forEach((it) => add(`${it.item} ${it.status}`, `${code} SEQ ${row.seq} · ${it.why}`)));
  out.totalsCheck.diffs.forEach((d) => add(`합계 행 ${d.label} 불일치`, `${code} 합계 행이 건별 합과 ${fmtPct(d.pct)} 다름`));

  const rows = out.table.map((r) => [
    code, r.seq, r.port || '-', r.v.days === null ? '-' : r.v.days, r.verdict,
    [...new Set(r.issues.map((i) => i.item))].join(', ') || '-',
  ]);

  return {
    schema_version: 1,
    agent: 'offhire',
    owner: 'ijryu',
    bundle: 'D',
    as_of: opts.baseDate,
    headline: `Off-hire ${c.total}건 검산, 불일치 ${c.diff}건 · 확인 필요 ${c.check}건 · 협정 대장 청구 ${led.청구}건 · 반론 ${led.반론}건`,
    metrics: [
      { key: 'processed', label: '검산 건수', value: c.total, unit: '건' },
      { key: 'warn', label: '검산 경고', value: c.diff + c.check + totalsBad, unit: '건' },
      { key: 'claim', label: '청구', value: led.청구, unit: '건' },
      { key: 'dispute', label: '반론', value: led.반론, unit: '건' },
      { key: 'agreed', label: '합의', value: led.합의, unit: '건' },
      { key: 'settled', label: '정산', value: led.정산, unit: '건' },
    ],
    table: { columns: ['선박코드', 'SEQ', 'Port', 'Days', '판정', '확인 항목'], rows },
    review,
    time: { before_min: TIME_BEFORE_MIN, after_min: TIME_AFTER_MIN, runs_per_month: 4, basis: '추정' },
    source: { label: opts.sourceLabel || '가상 Off-hire 엑셀·협정 대장', rows: c.total + (opts.ledgerRows || 0) },
    rules_version: RULES_VERSION,
    synthetic: opts.synthetic !== false,
  };
}

export function money(n) {
  return n === null || n === undefined ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const show = (n) => (n === null || n === undefined ? '-' : n);

// 스킬 2 · Claim 문구 초안(화면 글). 숫자는 엑셀 기입값을 그대로 쓴다. 보내기는 없다.
export function claimDraft(row, vessel) {
  const v = row.v;
  const hire = v.days !== null && v.hire !== null ? round(v.days * v.hire, 2) : null;
  return [
    'Dear Owners,',
    '',
    `Re: ${vessel} – Off-hire claim (SEQ ${row.seq}${row.voyage ? `, Voy. ${row.voyage}` : ''})`,
    '',
    'Please be advised that the vessel was off-hire as below. We hereby claim the corresponding deduction in accordance with the Charter Party [C/P clause].',
    '',
    `  Reason        : ${row.remark || '[reason]'}`,
    `  Port          : ${row.port || '-'}`,
    `  Period        : ${row.start} – ${row.end} [time zone per C/P]`,
    `  Off-hire days : ${show(v.days)}`,
    '',
    `  Hire          : ${money(hire)}  (${show(v.days)} days x ${money(v.hire)})`,
    `  Add. comm.    : -${money(v.addcAmt)}  (${show(v.addc)}%)`,
    `  Brokerage     : -${money(v.brkAmt)}  (${show(v.brk)}%)`,
    `  Hire total    : ${money(v.hireTotal)}`,
    `  F/O           : ${money(v.foTotal)}  (${show(v.foQty)} MT x ${money(v.foPrice)})`,
    `  D/O           : ${money(v.doTotal)}  (${show(v.doQty)} MT x ${money(v.doPrice)})`,
    `  CEV           : ${money(v.cev)}`,
    v.lash ? `  Lash/Material : ${money(v.lash)}` : null,
    v.vat ? `  VAT           : ${money(v.vat)}` : null,
    `  TOTAL         : ${money(v.total)}`,
    '',
    "Attachments: Master's statement of facts, engine log extract, ROB report.",
    '',
    'We look forward to your confirmation.',
    '',
    'Best regards,',
  ].filter((l) => l !== null).join('\n');
}

// ── Add off-hire Declaration ──────────────────────────────────────────
// 용선 리스트(사내 시스템 선박 정보 엑셀, 시트 1개)에서 선박별 CP 기간(L열 MIN / MAX)과 MAX.DATE(N열)를 읽는다.
// 머리글 이름으로 찾고, 못 찾으면 B·C·L·N열을 쓴다. 같은 선박이 여러 줄이면 MAX.DATE 가 더 늦은 줄을 쓴다.
export function readCharterList(aoa) {
  let hi = -1;
  for (let i = 0; i < aoa.length && i < 20; i++) {
    if ((aoa[i] || []).some((c) => norm(c) === '선박코드')) { hi = i; break; }
  }
  const head = hi >= 0 ? aoa[hi].map(norm) : [];
  const col = (name, fallback) => { const j = head.indexOf(norm(name)); return j >= 0 ? j : fallback; };
  const cCode = col('선박코드', 1);
  const cName = col('선박명', 2);
  const cMinMax = col('MIN / MAX', 11);
  const cMax = col('MAX.DATE', 13);
  const out = {};
  for (let r = hi + 1; r < aoa.length; r++) {
    const line = aoa[r] || [];
    const code = text(line[cCode]).toUpperCase();
    const maxMs = parseTime(line[cMax]);
    if (!/^[A-Z0-9]{4}$/.test(code) || maxMs === null) continue; // 머리글·척수 줄 등은 건너뜀
    const mm = text(line[cMinMax]);
    const m = mm.match(/(\d+)\s*Months?\s*~\s*(\d+)\s*Months?/i);
    const rec = { code, name: text(line[cName]), minMax: mm, min: m ? +m[1] : null, max: m ? +m[2] : null, maxDate: fmtTime(maxMs) };
    if (!out[code] || parseTime(out[code].maxDate) < maxMs) out[code] = rec;
  }
  return out;
}

// 두 시각(모두 GMT 로 봄) 사이 → { ms, d, h, m, text: '4D 04H 18M' }
export function offhireDuration(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null || e <= s) return null;
  const mins = Math.round((e - s) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const mi = mins % 60;
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  return { ms: e - s, d, h, m: mi, text: `${d}D ${p2(h)}H ${p2(mi)}M` };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// '2025-09-27 09:18' → '0918hours 27th September, 2025 (GMT)'
export function declDate(ms) {
  const dt = new Date(ms);
  const day = dt.getUTCDate();
  const suf = day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] || 'th');
  const hh = `0${dt.getUTCHours()}`.slice(-2);
  const mm = `0${dt.getUTCMinutes()}`.slice(-2);
  return `${hh}${mm}hours ${day}${suf} ${MONTHS[dt.getUTCMonth()]}, ${dt.getUTCFullYear()} (GMT)`;
}

/*
 * d: { minMax, min, max, start, end, startEvent, endEvent, place, prevMax, addedTimes, signature }
 * 시각은 모두 GMT 로 본다. 바뀐 Max date = prevMax + (end − start)
 */
export function declaration(d) {
  const dur = offhireDuration(d.start, d.end);
  const prev = parseTime(d.prevMax);
  const revised = dur && prev !== null ? prev + dur.ms : null;
  const period = d.min !== null && d.min !== undefined && d.max !== null && d.max !== undefined
    ? `min ${d.min}mos – max ${d.max}mos` : (d.minMax || '[min __mos – max __mos]');
  const times = +d.addedTimes || 0;
  const further = times > 0
    ? `Further to last, and in addition to the previously added ${times} time${times > 1 ? 's' : ''} off-hire period, please note this declaration shall be for the revised max-period as `
    : 'Please note this declaration shall be for the revised max-period as ';
  const body = [
    'Dear all,',
    '',
    `We have the option of adding such off-hire period to the optional period stipulated in ${period} on this Charter party`,
    '',
    'Therefore, we declare to add to the max optional period as much as the off-hire period below.',
    '',
    `1) ${text(d.start) || '[start]'} (GMT) – ${text(d.startEvent) || '[start event]'}`,
    `2) ${text(d.end) || '[end]'} (GMT) – ${text(d.endEvent) || '[end event]'}`,
    '',
    `TTL off-hire${text(d.place) ? ` (${text(d.place)})` : ''} : ${dur ? dur.text : '[duration]'}`,
    '',
    further + (revised !== null ? declDate(revised) : '[revised max date]'),
    '',
    "Please find attached relevant message for owner's ref.",
    '',
    'Tks N B.rgds,',
    text(d.signature) || '[signature]',
  ].join('\n');
  return { text: body, duration: dur, revisedMax: revised !== null ? fmtTime(revised) : '' };
}
