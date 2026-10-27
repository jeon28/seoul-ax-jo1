// 일본 공이송 플래너 계산 규칙 = agents/japan-empty-transfer/skills 의 Python 스크립트 3개를 그대로 옮긴 것.
//   normalize.py(입력 정리) → plan.py(이송 후보 계산) → verify.py(검증·보고)
// DOM 을 쓰지 않는 순수 함수라 브라우저에서도 node 에서도 돈다. 엑셀 원본은 서버로 보내지 않고 이 안에서만 계산한다.
// 계산 결과는 Python 스크립트와 같아야 한다: node --test scripts/test-japan.mjs 가 data/out/japan-empty-transfer/out/ 의 최종 결과와 글자 단위로 대조한다.
// 숫자는 이 규칙이 계산하고 AI 는 계산하지 않는다. 표준 입력이 아니거나 값이 모호하면 맞다고 처리하지 않고 InputError 로 멈춘다.

export class InputError extends Error {}

// ───────── CSV 읽기 ─────────
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0] === ''));
}

// utf-8 을 먼저, 안 되면 cp949(euc-kr)로 읽는다(Python read_rows 와 같은 순서).
export function decodeBytes(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
}

// 헤더 이름 그대로 읽는 표(type_teu.csv · 원본 합계). 열이 없으면 멈춘다.
export function parseTable(text, need, label) {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new InputError(`${label}: 비어 있습니다`);
  const h = head.map((x) => x.trim());
  const miss = need.filter((k) => !h.includes(k));
  if (miss.length) throw new InputError(`${label}: 필수 열을 찾지 못함 ${JSON.stringify(miss)} (입력 헤더: ${JSON.stringify(h)})`);
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export const toCsv = (cols, rows) => [cols, ...rows].map((r) => r.map((v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n') + '\n';

// Python 의 %g 와 같은 숫자 글자(6자리까지, 끝의 0 없음)
const g = (x) => String(parseFloat(Number(x).toPrecision(6)));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const kk = (vessel, voyage) => `${vessel}\u0001${voyage}`;
const EPS = 1e-9;

// ───────── 1. 입력 정리 (normalize.py) ─────────
const ALIASES = {
  port: ['port', '포트', '항구', '지역', '디포', 'depot', 'location'],
  type: ['type', '타입', '컨테이너타입', 'cntr type', 'size/type'],
  size: ['size', '사이즈', '길이', 'feet', 'length'],
  onhand: ['onhand', '보유', '보유수량', '재고', 'empty', 'mty', 'stock'],
  required: ['required', '필요', '필요수량', '부킹', 'booking', 'demand'],
  vessel: ['vessel', '모선', '선박', '선박명', 'vsl'],
  voyage: ['voyage', '항차', 'voy'],
  seq: ['seq', '순서', '기항순서', 'call seq'],
  etd: ['etd', '출항', '출항일'],
  cutoff: ['cutoff', 'cut-off', 'cut off', '선적마감', '마감'],
  space: ['space', '스페이스', '잔여스페이스', '잔여', 'available', 'remaining'],
};
const TYPE_RE = /^(22|42|45)(GP|RE|UT|PC)$/;
// 시스템 코드: 22GP=20DC, 42GP=40DC, 45GP=40HC(40'HQ), 22RE/45RE=RF, 22UT/42UT=OT, 22PC/42PC=FR(플랫랙)
const TYPE_ALIAS = { '20DC': '22GP', '20GP': '22GP', '40DC': '42GP', '40GP': '42GP', '40HC': '45GP', '40HQ': '45GP' };
const SCHEMAS = {
  balance: [['port', 'type', 'onhand', 'required'], ['size']],
  schedule: [['vessel', 'voyage', 'seq', 'port'], ['etd', 'cutoff']],
  space: [['vessel', 'voyage', 'space'], []],
};
export const KIND_LABEL = { balance: '보유/필요', schedule: '모선 기항 순서', space: '잔여 스페이스' };

export function canonType(raw, size = '') {
  let t = raw.toUpperCase().replace(/[\s'"]|FEET|FT/g, '');
  t = t.replace(/HQ$/, 'HC');
  if (!/^\d/.test(t)) t = size.replace(/\D/g, '') + t;
  return Object.hasOwn(TYPE_ALIAS, t) ? TYPE_ALIAS[t] : t;
}

function mapHeader(header, need, optional, label) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const mapping = {};
  const missing = [];
  for (const key of [...need, ...optional]) {
    const idx = norm.findIndex((h) => ALIASES[key].includes(h));
    if (idx < 0) { if (need.includes(key)) missing.push(key); } else mapping[key] = idx;
  }
  if (missing.length) throw new InputError(`${label}: 필수 열을 찾지 못함 ${JSON.stringify(missing)} (입력 헤더: ${JSON.stringify(header)}) → 열 이름을 사람에게 확인하세요.`);
  return mapping;
}

const isNum = (v) => v !== '' && Number.isFinite(Number(v));
function toInt(v, n, col, label) {
  const s = v.trim().replace(/,/g, '');
  if (!isNum(s)) throw new InputError(`${label} ${n}행 '${col}' 값이 숫자가 아님: '${v}'`);
  return Math.trunc(Number(s));
}
function toNum(v, n, col, label) {
  const s = v.trim().replace(/,/g, '');
  if (!isNum(s)) throw new InputError(`${label} ${n}행 '${col}' 값이 숫자가 아님: '${v}'`);
  return Number(s);
}

// rows = parseCsv() 결과(첫 줄은 열 이름). 돌려주는 것: { kind, rows(객체), cols, totals(balance 만), warnings }
export function normalize(kind, rows) {
  const label = KIND_LABEL[kind];
  if (!rows.length) throw new InputError(`${label}: 비어 있습니다`);
  const [need, optional] = SCHEMAS[kind];
  const m = mapHeader(rows[0], need, optional, label);
  const out = [];
  const warnings = [];
  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    if (!r.some((c) => c.trim())) return;
    const get = (k) => (k in m && m[k] < r.length ? r[m[k]].trim() : '');
    if (kind === 'balance') {
      const type = canonType(get('type'), get('size'));
      if (!TYPE_RE.test(type)) warnings.push(`${n}행 표준 외 타입 '${type}' (그대로 사용, TEU 환산을 모르면 계산이 멈춤)`);
      const onhand = toInt(get('onhand'), n, 'onhand', label);
      const required = toInt(get('required'), n, 'required', label);
      out.push({ port: get('port'), type, onhand, required, net: onhand - required });
    } else if (kind === 'schedule') {
      out.push({ vessel: get('vessel'), voyage: get('voyage'), seq: toInt(get('seq'), n, 'seq', label), port: get('port'), etd: get('etd'), cutoff: get('cutoff') });
    } else {
      out.push({ vessel: get('vessel'), voyage: get('voyage'), space: toNum(get('space'), n, 'space', label) });
    }
  });
  const cols = { balance: ['port', 'type', 'onhand', 'required', 'net'], schedule: ['vessel', 'voyage', 'seq', 'port', 'etd', 'cutoff'], space: ['vessel', 'voyage', 'space'] }[kind];
  let totals = null;
  if (kind === 'balance') {
    const tot = new Map();
    for (const r of out) {
      const a = tot.get(r.type) ?? { onhand: 0, required: 0, net: 0 };
      a.onhand += r.onhand; a.required += r.required; a.net += r.net;
      tot.set(r.type, a);
    }
    totals = [...tot].sort((a, b) => cmp(a[0], b[0])).map(([type, a]) => ({ type, ...a }));
  }
  return { kind, rows: out, cols, totals, warnings };
}

// ───────── 2. 이송 후보 계산 (plan.py) ─────────
// teuTable: type_teu.csv 를 parseTable 로 읽은 것(type · teu · priority · special)
export function planTransfers({ balance, schedule, space, teuTable }) {
  const flags = [];
  const addFlag = (type, flag, target, detail) => flags.push({ type, flag, target, detail });

  const net = new Map(); // 타입 -> Map(포트 -> net)
  for (const r of balance) {
    if (!net.has(r.type)) net.set(r.type, new Map());
    const m = net.get(r.type);
    m.set(r.port, (m.get(r.port) ?? 0) + r.net);
  }

  const vessels = new Map();
  for (const r of schedule) {
    const key = kk(r.vessel, r.voyage);
    if (!vessels.has(key)) vessels.set(key, { vessel: r.vessel, voyage: r.voyage, rows: [] });
    vessels.get(key).rows.push(r);
  }
  const calls = new Map(); // 모선 -> { vessel, voyage, ports: [{ port, etd, cutoff }] }
  for (const [key, v] of vessels) {
    v.rows.sort((a, b) => a.seq - b.seq || cmp(a.port, b.port) || cmp(a.etd, b.etd) || cmp(a.cutoff, b.cutoff));
    const seen = new Set();
    const uniq = [];
    for (const r of v.rows) {
      if (seen.has(r.port)) { addFlag('-', 'DUP_PORT', `${v.vessel} ${v.voyage}`, `${r.port} 중복 기항, 첫 기항만 사용`); continue; }
      seen.add(r.port);
      uniq.push({ port: r.port, etd: r.etd, cutoff: r.cutoff });
    }
    uniq.forEach((c, n) => {
      if (c.cutoff) return;
      if (n === uniq.length - 1) { // 마지막 기항지는 선적 포트가 될 수 없다
        addFlag('-', 'CUTOFF_MISSING_NOIMPACT', `${v.vessel} ${v.voyage}`, `${c.port} Cut-off 없음 (마지막 기항지라 이번 이송안에는 영향 없음, 원본 확인)`);
      } else {
        addFlag('-', 'CUTOFF_MISSING', `${v.vessel} ${v.voyage}`, `${c.port} Cut-off 없음 → 이 포트에서 선적하는 이송은 배정하지 않음, 원본 확인 필요`);
      }
    });
    calls.set(key, { vessel: v.vessel, voyage: v.voyage, ports: uniq });
  }
  const minEtd = (c) => c.ports.map((p) => p.etd).filter(Boolean).reduce((a, b) => (b < a ? b : a), '9999');
  const order = [...calls.keys()].sort((a, b) => cmp(minEtd(calls.get(a)), minEtd(calls.get(b))) || cmp(calls.get(a).vessel, calls.get(b).vessel) || cmp(calls.get(a).voyage, calls.get(b).voyage));

  // TEU 환산: 표 우선, 없으면 타입명 앞의 길이(20=1, 40=2)로만 추정, 그 밖은 중단
  const table = new Map(teuTable.map((r) => [r.type.toUpperCase(), Number(r.teu)]));
  const factor = new Map();
  for (const t of net.keys()) {
    if (table.has(t)) { factor.set(t, table.get(t)); continue; }
    const m = /^(20|40)/.exec(t);
    if (!m) throw new InputError(`타입 '${t}'의 TEU 환산값을 모름 → type_teu.csv 에 추가하거나 사람에게 확인하세요.`);
    factor.set(t, m[1] === '20' ? 1 : 2);
  }

  const cap = new Map(); // 모선 -> 구간별 남은 TEU (모든 타입이 하나의 풀을 공유)
  for (const r of space) {
    const key = kk(r.vessel, r.voyage);
    if (!calls.has(key)) { addFlag('-', 'SPACE_UNKNOWN_VESSEL', `${r.vessel} ${r.voyage}`, '스케줄에 없는 모선'); continue; }
    cap.set(key, Array(Math.max(calls.get(key).ports.length - 1, 0)).fill(r.space));
  }
  for (const key of order) {
    if (!cap.has(key)) { const c = calls.get(key); addFlag('-', 'SPACE_MISSING', `${c.vessel} ${c.voyage}`, '잔여 스페이스 없음 → 이 모선은 배정하지 않음'); }
  }

  const prio = new Map(teuTable.map((r) => [r.type.toUpperCase(), parseInt(r.priority || '99', 10)]));
  const suffixPrio = { GP: 3, DC: 3, HC: 3, RF: 4, RE: 4, OT: 5, UT: 5, PC: 6, FR: 6 }; // 표에 없는 타입: Dry 계열은 표의 Dry 뒤, RF, OT 순
  const prioOf = (t) => {
    if (prio.has(t)) return prio.get(t);
    addFlag(t, 'TYPE_PRIORITY_UNSET', t, 'type_teu.csv에 우선순위가 없어 접미사로 추정 → 확인 필요');
    return suffixPrio[t.slice(-2)] ?? 99;
  };
  const special = new Set(teuTable.filter((r) => (r.special || '').toUpperCase() === 'Y').map((r) => r.type.toUpperCase()));
  const isSpecial = (t) => special.has(t) || (!prio.has(t) && ['RE', 'UT', 'PC', 'RF', 'OT', 'FR'].includes(t.slice(-2)));

  // 특수 컨테이너(RF/OT/FR)는 일본 내에 이송 가능한 Surplus가 있으면 Dry보다 먼저 스페이스를 쓴다.
  const types = [...net.keys()]
    .map((t) => ({ t, k: [isSpecial(t) && [...net.get(t).values()].some((v) => v > 0) ? 0 : 1, prioOf(t), t] }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || cmp(a.k[2], b.k[2]))
    .map((x) => x.t);
  const surplus = new Map(types.map((t) => [t, new Map([...net.get(t)].filter(([, v]) => v > 0))]));
  const deficit = new Map(types.map((t) => [t, new Map([...net.get(t)].filter(([, v]) => v < 0).map(([p, v]) => [p, -v]))]));

  // 포트 잉여의 "쓸 수 있는 곳" 수: (타입, 선적 포트) -> 그 잉여로 채울 수 있는 (모선, 부족 포트) 조합 수
  const opts = new Map();
  const optKey = (t, p) => `${t}\u0001${p}`;
  for (const k2 of order) {
    if (!cap.has(k2)) continue;
    const pl2 = calls.get(k2).ports;
    for (const t of types) {
      pl2.forEach((pj2, j2) => {
        if ((deficit.get(t).get(pj2.port) ?? 0) <= 0) return;
        for (let i2 = 0; i2 < j2; i2 += 1) {
          if ((surplus.get(t).get(pl2[i2].port) ?? 0) > 0 && pl2[i2].cutoff) opts.set(optKey(t, pl2[i2].port), (opts.get(optKey(t, pl2[i2].port)) ?? 0) + 1);
        }
      });
    }
  }

  const plan = [];
  const events = new Map(); // (타입, 모선) -> 스페이스 부족 이벤트
  const blocked = new Map(); // (모선, 선적 포트) -> Cut-off 없어 제외된 후보
  for (const key of order) {
    const legs = cap.get(key);
    if (!legs) continue;
    const c = calls.get(key);
    const pl = c.ports;
    for (const t of types) { // 타입 우선순위: 앞 타입이 모선 스페이스를 먼저 가져간다
      const f = factor.get(t);
      pl.forEach((pjObj, j) => {
        const pj = pjObj.port;
        if ((deficit.get(t).get(pj) ?? 0) <= 0) return;
        const idx = Array.from({ length: j }, (_, x) => x).sort((a, b) => (opts.get(optKey(t, pl[a].port)) ?? 0) - (opts.get(optKey(t, pl[b].port)) ?? 0) || b - a);
        for (const i of idx) {
          const pi = pl[i].port;
          if ((surplus.get(t).get(pi) ?? 0) <= 0 || (deficit.get(t).get(pj) ?? 0) <= 0) continue;
          const want = Math.min(surplus.get(t).get(pi), deficit.get(t).get(pj));
          if (!pl[i].cutoff) { // 선적 포트 Cut-off 없음 → 배정하지 않고 사람 확인
            const bk = `${key}\u0001${pi}`;
            if (!blocked.has(bk)) blocked.set(bk, { c, pi, list: [] });
            blocked.get(bk).list.push({ t, pj, want });
            continue;
          }
          const room = Math.min(...legs.slice(i, j)); // TEU
          const q = Math.min(want, Math.floor(room / f + EPS));
          if (q < want) {
            const ek = `${t}\u0001${key}`;
            if (!events.has(ek)) events.set(ek, { t, c, list: [] });
            events.get(ek).list.push({ pi, pj, want, q, room });
          }
          if (q > 0) {
            for (let x = i; x < j; x += 1) legs[x] -= q * f;
            surplus.get(t).set(pi, surplus.get(t).get(pi) - q);
            deficit.get(t).set(pj, deficit.get(t).get(pj) - q);
            plan.push({ vessel: c.vessel, voyage: c.voyage, type: t, from: pi, to: pj, qty: q, etd: pl[i].etd, cutoff: pl[i].cutoff, teu: q * f });
          }
        }
      });
    }
  }
  for (const { t, c, list } of events.values()) { // 스페이스 플래그는 타입·모선별로 한 줄로 묶는다
    const ex = list.slice(0, 3).map((e) => `${e.pi}→${e.pj} 필요 ${e.want} 중 ${e.q}`).join('; ');
    const more = list.length > 3 ? ` 외 ${list.length - 3}건` : '';
    const done = plan.filter((r) => r.vessel === c.vessel && r.voyage === c.voyage && r.type === t).reduce((a, r) => a + r.qty, 0);
    addFlag(t, 'SPACE_SHORT', `${c.vessel} ${c.voyage}`, `스페이스 부족으로 ${list.length}개 구간 조합 축소/제외 (이 타입 배정 ${done}개, 1개=${g(factor.get(t))} TEU). 예: ${ex}${more}`);
  }
  for (const { c, pi, list } of blocked.values()) {
    const ex = list.slice(0, 3).map((b) => `${b.t} ${pi}→${b.pj} ${b.want}개`).join('; ');
    const more = list.length > 3 ? ` 외 ${list.length - 3}건` : '';
    addFlag('-', 'CUTOFF_BLOCKED', `${c.vessel} ${c.voyage} ${pi}`, `Cut-off 없어 선적 후보 ${list.length}건 배정 제외. 예: ${ex}${more} → 최신 Cut-off 확인 후 다시 계산`);
  }
  const reach = new Set([...calls.values()].flatMap((c) => c.ports.map((p) => p.port)));
  for (const t of types) {
    for (const [p, d] of deficit.get(t)) {
      if (d <= 0) continue;
      if (!reach.has(p)) addFlag(t, 'NO_VESSEL', p, `Deficit ${d}, 내일 모선 기항 없음`);
      else if ([...surplus.get(t).values()].reduce((a, b) => a + b, 0) === 0) addFlag(t, 'NO_SURPLUS', p, `Deficit ${d} 남음, 역내 Surplus 소진 → 부산 공급 검토`);
      else addFlag(t, 'UNRESOLVED', p, `Deficit ${d} 남음 (Surplus는 남았으나 기항 순서·스페이스로 이송 불가)`);
    }
    for (const [p, s] of surplus.get(t)) if (s > 0) addFlag(t, 'SURPLUS_LEFT', p, `Surplus ${s} 남음 (정보)`);
  }

  const spaceEvents = [];
  for (const { t, c, list } of events.values()) for (const e of list) spaceEvents.push({ type: t, vessel: c.vessel, voyage: c.voyage, from: e.pi, to: e.pj, need: e.want, assigned: e.q, room_teu: g(e.room) });
  return { plan: plan.map((r) => ({ ...r, teu: g(r.teu) })), flags, spaceEvents };
}

export const PLAN_COLS = ['vessel', 'voyage', 'type', 'from', 'to', 'qty', 'etd', 'cutoff', 'teu'];
export const FLAG_COLS = ['type', 'flag', 'target', 'detail'];
export const EVENT_COLS = ['type', 'vessel', 'voyage', 'from', 'to', 'need', 'assigned', 'room_teu'];

// ───────── 3. 검증·보고 (verify.py) ─────────
// source: 사람이 시스템 수치를 옮겨 적은 합계 표(type · onhand · required) 또는 null
export function verify({ balance, schedule, space, plan, flags, teuTable, source, queriedAt = '' }) {
  const table = new Map(teuTable.map((r) => [r.type.toUpperCase(), Number(r.teu)]));
  const factorOf = (t) => {
    if (table.has(t)) return table.get(t);
    const m = /^(20|40)/.exec(t);
    if (!m) throw new InputError(`타입 '${t}'의 TEU 환산값을 모름`);
    return m[1] === '20' ? 1 : 2;
  };
  const results = []; // { name, ok(true|false|null), detail }

  const tot = new Map();
  const net = new Map();
  for (const r of balance) {
    const a = tot.get(r.type) ?? [0, 0];
    a[0] += r.onhand; a[1] += r.required;
    tot.set(r.type, a);
    const nk = `${r.type}\u0001${r.port}`;
    net.set(nk, (net.get(nk) ?? 0) + r.net);
  }
  const netOf = (t, p) => net.get(`${t}\u0001${p}`) ?? 0;
  if (source) {
    for (const r of source) {
      const t = r.type.toUpperCase();
      const got = tot.get(t) ?? [0, 0];
      const ok = got[0] === parseInt(r.onhand, 10) && got[1] === parseInt(r.required, 10);
      results.push({ name: `원본 합계 대조 ${t}`, ok, detail: `변환 [${got[0]}, ${got[1]}] / 원본 [${r.onhand}, ${r.required}]` });
    }
  } else {
    results.push({ name: '원본 합계 대조', ok: null, detail: '원본 합계 파일 없음 → 사람이 시스템 수치와 직접 대조' });
  }

  const outQ = new Map();
  const inQ = new Map();
  const order = new Map(); // 모선 -> Map(포트 -> 첫 seq)
  for (const r of schedule) {
    const key = kk(r.vessel, r.voyage);
    if (!order.has(key)) order.set(key, new Map());
    if (!order.get(key).has(r.port)) order.get(key).set(r.port, r.seq);
  }
  const occ = new Map();
  const bad = [];
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of plan) {
    const q = r.qty;
    add(outQ, `${r.type}\u0001${r.from}`, q);
    add(inQ, `${r.type}\u0001${r.to}`, q);
    const key = kk(r.vessel, r.voyage);
    const o = order.get(key) ?? new Map();
    const a = o.get(r.from);
    const b = o.get(r.to);
    if (a === undefined || b === undefined || a >= b) { bad.push(`('${r.vessel}', '${r.voyage}') ${r.from}→${r.to} 기항 순서 위반`); continue; }
    const ports = [...o.keys()].sort((x, y) => o.get(x) - o.get(y));
    for (let x = ports.indexOf(r.from); x < ports.indexOf(r.to); x += 1) add(occ, `${key}\u0002${x}`, q * factorOf(r.type));
  }
  const split = (k) => k.split('\u0001');
  const overS = [...outQ].filter(([k, q]) => q > Math.max(netOf(...split(k)), 0)).map(([k, q]) => { const [t, p] = split(k); return `${t} ${p}: 이송 ${q} > Surplus ${netOf(t, p)}`; });
  const overD = [...inQ].filter(([k, q]) => q > Math.max(-netOf(...split(k)), 0)).map(([k, q]) => { const [t, p] = split(k); return `${t} ${p}: 입고 ${q} > Deficit ${-netOf(t, p)}`; });
  const cap = new Map(space.map((r) => [kk(r.vessel, r.voyage), r.space]));
  const overC = [...occ].filter(([k, v]) => v > (cap.get(k.split('\u0002')[0]) ?? 0) + EPS).map(([k, v]) => {
    const [key, x] = k.split('\u0002');
    const [vessel, voyage] = split(key);
    return `${vessel} ${voyage} 구간${x}: 점유 ${g(v)} TEU > 스페이스 ${g(cap.get(key) ?? 0)} TEU`;
  });
  results.push({ name: '기항 순서', ok: !bad.length, detail: bad.join('; ') || '위반 없음' });
  const nocut = plan.filter((r) => !r.cutoff).map((r) => `${r.vessel} ${r.voyage} ${r.from}→${r.to}`);
  results.push({ name: '선적 포트 Cut-off 있음', ok: !nocut.length, detail: nocut.join('; ') || '이상 없음' });
  results.push({ name: 'Surplus 초과 이송 없음', ok: !overS.length, detail: overS.join('; ') || '이상 없음' });
  results.push({ name: 'Deficit 초과 입고 없음', ok: !overD.length, detail: overD.join('; ') || '이상 없음' });
  results.push({ name: '모선 스페이스 초과 없음', ok: !overC.length, detail: overC.join('; ') || '이상 없음' });

  const status = (ok) => (ok === null ? '확인 필요' : ok ? '통과' : '실패');
  const passed = results.every((r) => r.ok !== false);
  const hasUnknown = results.some((r) => r.ok === null);
  const ftypes = new Map();
  for (const f of flags) if (f.flag !== 'SURPLUS_LEFT') ftypes.set(f.flag, (ftypes.get(f.flag) ?? 0) + 1);
  const left = flags.filter((f) => f.flag === 'SURPLUS_LEFT');

  const L = ['# 일본 공이송 이송안 (초안)', '', '> 초안입니다. 최종 확정은 사람이 합니다.', ''];
  if (!passed) L.push('> **⚠ 수량 검증 실패 — 이 이송안은 사용하지 마세요.** 아래 \'수량 검증\' 표에서 실패 항목을 확인하세요.', '');
  L.push(`데이터 조회 시각: ${queriedAt || '미입력 (확인 필요)'}`, '', `## 이송안${passed ? '' : ' (검증 실패 — 사용 금지)'}`, '', '| 모선 | 항차 | 타입 | 출발 | 도착 | 수량(개) | TEU | ETD | Cut-off |', '|---|---|---|---|---|---:|---:|---|---|');
  for (const r of plan) L.push(`| ${r.vessel} | ${r.voyage} | ${r.type} | ${r.from} | ${r.to} | ${r.qty} | ${r.teu} | ${r.etd || '?'} | ${r.cutoff || '?'} |`);
  if (!plan.length) L.push('| (이송안 없음) | | | | | | | | |');
  L.push('', '## 수량 검증', '', '| 검사 | 결과 | 상세 |', '|---|---|---|');
  for (const r of results) L.push(`| ${r.name} | ${status(r.ok)} | ${r.detail} |`);
  L.push('', `**수량 검증 종합: ${!passed ? '실패' : hasUnknown ? '통과 (확인 필요 항목 있음)' : '통과'}** (스크립트 재검산, '확인 필요'는 사람 대조 대기)`, '', '## 예외 플래그', '');
  if (ftypes.size) {
    L.push(`건수: ${[...ftypes].map(([k, v]) => `${k} ${v}`).join(', ')}`, '', '| 타입 | 유형 | 대상 | 내용 |', '|---|---|---|---|');
    for (const f of flags) if (f.flag !== 'SURPLUS_LEFT') L.push(`| ${f.type} | ${f.flag} | ${f.target} | ${f.detail} |`);
  } else L.push('없음');
  L.push('', '## 남은 잉여 (정보, 플래그 건수에는 넣지 않음)', '');
  if (left.length) {
    L.push('| 타입 | 포트 | 내용 |', '|---|---|---|');
    for (const f of left) L.push(`| ${f.type} | ${f.target} | ${f.detail} |`);
  } else L.push('없음');
  L.push('', '## 사람이 원본과 대조할 체크리스트', '');
  const seen = new Set();
  for (const r of plan) {
    const key = kk(r.vessel, r.voyage);
    if (seen.has(key)) continue;
    seen.add(key);
    L.push(`- [ ] ${r.vessel} / ${r.voyage} — ETD ${r.etd || '?'}, Cut-off ${r.cutoff || '?'} 를 최신 스케줄과 대조`);
  }
  L.push('- [ ] 지역·타입별 보유/필요 합계를 시스템 수치와 대조', `- [ ] 조회 시각(${queriedAt || '미입력'})이 기준 시점과 맞는지 확인`, '- [ ] 대리점 발송 메일은 사람이 검토 후 발송');
  return { results: results.map((r) => ({ ...r, status: status(r.ok) })), passed, hasUnknown, report: L.join('\n') + '\n' };
}

// ───────── 한 번에: 입력 정리 → 이송 후보 → 검증·보고 ─────────
// raw = { balance, schedule, space }: parseCsv() 결과. sourceText 는 원본 합계 CSV 글자(없으면 null).
export function runPlanner({ raw, teuText, sourceText = null, queriedAt = '' }) {
  const teuTable = parseTable(teuText, ['type', 'teu'], 'type_teu.csv');
  const balance = normalize('balance', raw.balance);
  const schedule = normalize('schedule', raw.schedule);
  const space = normalize('space', raw.space);
  const source = sourceText ? parseTable(sourceText, ['type', 'onhand', 'required'], '원본 합계') : null;
  const calc = planTransfers({ balance: balance.rows, schedule: schedule.rows, space: space.rows, teuTable });
  const check = verify({ balance: balance.rows, schedule: schedule.rows, space: space.rows, plan: calc.plan, flags: calc.flags, teuTable, source, queriedAt });
  return { normalized: { balance, schedule, space }, ...calc, check };
}
