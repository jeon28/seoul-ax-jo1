// 영업실적 분석 규칙 = lib/aggregate.md 「영업실적」 장. 순수 함수만 둔다(화면·DOM 없음) — 브라우저와 node 에서 같이 돈다.
// 입력: 건별 실적 엑셀의 첫 시트(배열의 배열). 한 줄 = 한 건: 월 · 화주 · 수출/수입 · POD/POL · TEU.
// 하는 일: ① 엑셀 읽기·표기 통일 ② 월간 집계(화주별 · 항구별 · 전월 비교 · 신규/이탈) ③ 방문 목록 ④ 월별 추이·보고 문장 ⑤ 결과 파일(화주는 H01 로 가림).
// 숫자는 이 파일이 계산한다. AI 는 계산하지 않는다.

export const RULES_VERSION = 'aggregate@v1';

// 숫자표 — 바꾸면 RULES_VERSION 을 올리고 lib/aggregate.md 표도 같이 고친다.
export const NUMBERS = {
  changeMinTeu: 5, // 전월 대비 이만큼(TEU) 이상 늘면 증가, 이만큼 줄면 감소(비고)
  routeDropTeu: 5, // 항구(항로) 물량이 이만큼 줄면 방문 목록의 「줄어든 항로」에 올림
  topPorts: 3, // 영업 카드의 항구 상위 n
  maxPortCols: 8, // 보고서 표의 항구 칸: 이보다 많으면 위 (n-1)곳 + 기타
};
export const TIME = { before_min: 60, after_min: 15, runs_per_month: 22, basis: '추정' };

export const KINDS = ['수출', '수입'];
export const PORT_LABEL = { 수출: '도착지', 수입: '선적지' };

// ── 표기 통일 ──
const sq = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const hasLatinOnly = (s) => /^[\x20-\x7e]+$/.test(s);

export function normShipper(v) {
  return clean(String(v ?? '').replace(/\(주\)|㈜|주식회사/g, ''));
}
export function normPort(v) {
  const s = clean(v);
  return hasLatinOnly(s) ? s.toUpperCase() : s;
}
export function normKind(v) {
  const s = sq(v);
  if (['수출', 'exp', 'export', 'e', '출'].includes(s)) return '수출';
  if (['수입', 'imp', 'import', 'i', '입'].includes(s)) return '수입';
  return null;
}
export function parseMonth(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v) && v >= 200001 && v <= 299912 && v % 100 >= 1 && v % 100 <= 12) return `${Math.floor(v / 100)}-${String(v % 100).padStart(2, '0')}`;
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
    return null;
  }
  const m = /(\d{4})\D{0,3}(\d{1,2})/.exec(clean(v));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}`;
}
export function parseTeu(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/,/g, '').replace(/teu/i, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── ① 엑셀 읽기 ──
const HEAD = {
  month: ['월', '선적월', '기준월', '실적월', '일자', '선적일', '날짜', 'month', 'date'],
  shipper: ['화주', '화주명', '거래처', 'shipper', 'customer'],
  kind: ['구분', '수출입', '수출/수입', '수출수입', 'type', 'exp/imp', 'imp/exp'],
  port: ['pod/pol', 'pol/pod', '항구', '항', '상대항', 'port'],
  pod: ['pod', '도착지', '양하항'],
  pol: ['pol', '선적지', '선적항'],
  teu: ['teu', 'teu수', '물량', '물량(teu)'],
};
const SAMPLE_HEAD = '월 · 화주 · 구분(수출/수입) · POD/POL · TEU';

function findHeader(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 30); i++) {
    const cells = (aoa[i] || []).map(sq);
    const at = (key) => cells.findIndex((c) => HEAD[key].includes(c));
    const col = { month: at('month'), shipper: at('shipper'), kind: at('kind'), port: at('port'), pod: at('pod'), pol: at('pol'), teu: at('teu') };
    if (col.shipper >= 0 && col.teu >= 0 && col.kind >= 0) return { row: i, col };
  }
  return null;
}

// 반환: { rows[유효한 건], dropped[건너뛴 줄], months[정렬], rawByMonth{월:원본 TEU 합}, dataRows }
export function readSheet(aoa) {
  const h = findHeader(aoa);
  if (!h) throw new Error(`머리글을 찾지 못했습니다. 첫 시트에 ${SAMPLE_HEAD} 칸이 있어야 합니다.`);
  const { col } = h;
  const missing = [];
  if (col.month < 0) missing.push('월');
  if (col.port < 0 && (col.pod < 0 || col.pol < 0)) missing.push('POD/POL(또는 POD · POL 두 칸)');
  if (missing.length) throw new Error(`머리글에 없는 칸: ${missing.join(', ')}`);
  const rows = [];
  const dropped = [];
  const rawByMonth = {};
  let dataRows = 0;
  for (let i = h.row + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (r.every((c) => clean(c) === '')) continue;
    // 엑셀 맨 아래 합계 줄(월 칸이나 화주 칸에 「합계」)은 건이 아니므로 건너뛴다
    if ([r[col.month], r[col.shipper]].some((c) => /^(합계|총계|소계|total)$/i.test(clean(c)))) continue;
    dataRows++;
    const month = parseMonth(r[col.month]);
    const shipper = normShipper(r[col.shipper]);
    const kind = normKind(r[col.kind]);
    const portCell = col.port >= 0 ? r[col.port] : (kind === '수출' ? r[col.pod] : kind === '수입' ? r[col.pol] : '');
    const port = normPort(portCell);
    const teu = parseTeu(r[col.teu]);
    if (month && teu !== null) rawByMonth[month] = (rawByMonth[month] || 0) + teu;
    const why = [];
    if (!month) why.push('월을 읽지 못함');
    if (!shipper) why.push('화주가 비어 있음');
    if (!kind) why.push('수출/수입 구분을 읽지 못함');
    if (!port) why.push('POD/POL 이 비어 있음');
    if (teu === null || teu <= 0) why.push('TEU 가 숫자가 아니거나 0 이하');
    if (why.length) dropped.push({ line: i + 1, why: why.join(', '), teu: teu !== null && teu > 0 ? teu : null, month });
    else rows.push({ line: i + 1, month, shipper, kind, port, teu });
  }
  const months = [...new Set(rows.map((x) => x.month))].sort();
  return { rows, dropped, months, rawByMonth, dataRows };
}

// ── ② 월간 집계 ──
const ko = (a, b) => String(a).localeCompare(String(b), 'ko');
const eq = (a, b) => Math.abs(a - b) < 1e-6;
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

function groupShippers(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const e = m.get(r.shipper) || { total: 0, ports: {} };
    e.total += r.teu;
    e.ports[r.port] = (e.ports[r.port] || 0) + r.teu;
    m.set(r.shipper, e);
  });
  return m;
}
function groupPorts(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const e = m.get(r.port) || { total: 0, shippers: new Set() };
    e.total += r.teu;
    e.shippers.add(r.shipper);
    m.set(r.port, e);
  });
  return m;
}

export function noteOf(total, prev, hasPrev) {
  if (!hasPrev) return '';
  if (prev === 0 && total > 0) return '신규';
  if (total === 0 && prev > 0) return '이탈';
  const d = total - prev;
  if (d >= NUMBERS.changeMinTeu) return '증가';
  if (d <= -NUMBERS.changeMinTeu) return '감소';
  return '';
}

function kindBlock(rows, kind, month, prevMonth) {
  const hasPrev = !!prevMonth;
  const cur = rows.filter((r) => r.kind === kind && r.month === month);
  const prv = hasPrev ? rows.filter((r) => r.kind === kind && r.month === prevMonth) : [];
  const gc = groupShippers(cur);
  const gp = groupShippers(prv);
  const list = [...new Set([...gc.keys(), ...gp.keys()])].map((name) => {
    const c = gc.get(name) || { total: 0, ports: {} };
    const p = gp.get(name) || { total: 0, ports: {} };
    return { name, total: c.total, prev: hasPrev ? p.total : null, diff: hasPrev ? c.total - p.total : null, note: noteOf(c.total, p.total, hasPrev), ports: c.ports, prevPorts: p.ports };
  }).sort((a, b) => b.total - a.total || (a.total === 0 ? (b.prev ?? 0) - (a.prev ?? 0) : 0) || ko(a.name, b.name));

  // 항구별은 건에서 따로 한 번 더 묶는다(화주별 표와 맞는지 검산하려고)
  const pc = groupPorts(cur);
  const pp = groupPorts(prv);
  const ports = [...new Set([...pc.keys(), ...pp.keys()])].map((port) => {
    const c = pc.get(port);
    const total = c ? c.total : 0;
    const prev = hasPrev ? (pp.get(port) ? pp.get(port).total : 0) : null;
    return { port, total, prev, diff: hasPrev ? total - prev : null, shippers: c ? c.shippers.size : 0 };
  }).sort((a, b) => b.total - a.total || (a.total === 0 ? (b.prev ?? 0) - (a.prev ?? 0) : 0) || ko(a.port, b.port));

  return { kind, total: sum(list.map((x) => x.total)), prev_total: hasPrev ? sum(list.map((x) => x.prev)) : null, list, ports };
}

export function aggregate(parsed, month, prevMonth) {
  const prev = prevMonth && prevMonth !== month ? prevMonth : null;
  const ex = kindBlock(parsed.rows, '수출', month, prev);
  const im = kindBlock(parsed.rows, '수입', month, prev);
  const agg = { month, prev_month: prev, hasPrev: !!prev, export: ex, import: im };
  agg.checks = runChecks(parsed, agg);
  agg.dropped = parsed.dropped;
  return agg;
}

function runChecks(parsed, agg) {
  const months = [agg.month, agg.prev_month].filter(Boolean);
  const droppedTeu = (m) => sum(parsed.dropped.filter((d) => d.month === m && d.teu !== null).map((d) => d.teu));
  const items = [];
  const rawNow = parsed.rawByMonth[agg.month] || 0;
  const tableNow = agg.export.total + agg.import.total;
  const dNow = droppedTeu(agg.month);
  items.push({ name: '원본 합계', ok: eq(rawNow, tableNow + dNow), detail: `표 ${tableNow} + 뺀 줄 ${dNow} / 원본 ${rawNow}` });
  const badShippers = [];
  for (const b of [agg.export, agg.import]) b.list.forEach((s) => { if (!eq(s.total, sum(Object.values(s.ports)))) badShippers.push(s.name); });
  items.push({ name: '화주별 합계', ok: !badShippers.length, detail: badShippers.length ? `${badShippers.length}곳 다름` : '모두 일치' });
  for (const b of [agg.export, agg.import]) {
    const cells = sum(b.ports.map((p) => p.total));
    items.push({ name: `${b.kind} 항구 칸 합계`, ok: eq(cells, b.total), detail: `항구 칸 ${cells} / 표 합계 ${b.total}` });
  }
  if (agg.prev_month) {
    const rawPrev = parsed.rawByMonth[agg.prev_month] || 0;
    const tablePrev = agg.export.prev_total + agg.import.prev_total;
    const dPrev = droppedTeu(agg.prev_month);
    items.push({ name: '전월 합계', ok: eq(rawPrev, tablePrev + dPrev), detail: `표 ${tablePrev} + 뺀 줄 ${dPrev} / 전월 자료 ${rawPrev}` });
  }
  return { raw_total_match: items[0].ok, all_ok: items.every((i) => i.ok), items, months };
}

// 영업 카드: 항구 상위 n(이번 달 물량이 있는 곳만)
export const topPorts = (block, n = NUMBERS.topPorts) => block.ports.filter((p) => p.total > 0).slice(0, n);
// 보고서 표 항구 칸: 항구가 많으면 위 (n-1)곳 + 기타
export function portColumns(block) {
  const names = block.ports.filter((p) => p.total > 0).map((p) => p.port);
  const many = names.length > NUMBERS.maxPortCols;
  return { shown: many ? names.slice(0, NUMBERS.maxPortCols - 1) : names, other: many ? names.slice(NUMBERS.maxPortCols - 1) : [] };
}

// 변화 요약(영업 카드 칩): 비고별 화주 이름
export function changesOf(block) {
  const out = {};
  ['신규', '증가', '감소', '이탈'].forEach((n) => { out[n] = block.list.filter((s) => s.note === n).map((s) => s.name); });
  return out;
}

// ── 표시 꼴 ──
export const fmt = (n) => Number(n).toLocaleString('ko-KR');
const signOf = (n) => (n > 0 ? '+' : n < 0 ? '-' : '');
export const diffText = (n) => (n === null || n === undefined ? '확인 필요' : n === 0 ? '-' : signOf(n) + fmt(Math.abs(Math.round(n * 10) / 10)));
export const rateText = (total, prev) => (prev === null || prev === undefined ? '확인 필요' : !prev || total === prev ? '-' : `${signOf(total - prev)}${Math.abs(((total - prev) / prev) * 100).toFixed(1)}%`);
export const monthName = (m) => { const [y, mm] = String(m).split('-'); return `${y}년 ${Number(mm)}월`; };
const portDiffs = (s, take = 3) => Object.keys({ ...s.prevPorts, ...s.ports })
  .map((p) => ({ port: p, now: s.ports[p] || 0, was: s.prevPorts[p] || 0 })).filter((x) => x.now < x.was)
  .sort((a, b) => (a.now - a.was) - (b.now - b.was) || ko(a.port, b.port)).slice(0, take);
const mainPort = (ports) => Object.entries(ports).sort((a, b) => b[1] - a[1] || ko(a[0], b[0]))[0];

// ── ③ 영업 방문 목록 ──
const REASON_ORDER = { 이탈: 1, 감소: 2, 신규: 3, 증가: 4 };
const REASON_LABEL = { 이탈: '이탈', 감소: '큰 폭 감소', 신규: '신규', 증가: '증가' };

export function visitList(agg) {
  if (!agg.hasPrev) return { needsPrev: true, items: [], routes: [] };
  const items = [];
  for (const b of [agg.export, agg.import]) {
    for (const s of b.list) {
      if (!s.note) continue;
      let text;
      if (s.note === '이탈') {
        const mp = mainPort(s.prevPorts);
        text = `전월 ${fmt(s.prev)} TEU 였고 이번 달은 0 입니다${mp ? ` (주로 ${mp[0]} ${fmt(mp[1])})` : ''}. 다른 선사·다른 항으로 옮겼는지 먼저 확인`;
      } else if (s.note === '감소') {
        const pd = portDiffs(s);
        text = `전월 ${fmt(s.prev)} → ${fmt(s.total)} TEU (${diffText(s.diff)}, ${rateText(s.total, s.prev)}).${pd.length ? ` 줄어든 항로: ${pd.map((x) => `${x.port} ${fmt(x.was)}→${fmt(x.now)}`).join(', ')}.` : ''} 이유 확인`;
      } else if (s.note === '신규') {
        const mp = mainPort(s.ports);
        text = `이번 달 처음 ${fmt(s.total)} TEU${mp ? ` (주로 ${mp[0]} ${fmt(mp[1])})` : ''}. 관계를 만들 기회`;
      } else {
        text = `전월 ${fmt(s.prev)} → ${fmt(s.total)} TEU (${diffText(s.diff)}, ${rateText(s.total, s.prev)}). 늘어난 이유를 듣고 관계 유지`;
      }
      items.push({ kind: b.kind, shipper: s.name, reason: s.note, reasonLabel: REASON_LABEL[s.note], total: s.total, prev: s.prev, diff: s.diff, text });
    }
  }
  items.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]
    || (a.reason === '이탈' ? b.prev - a.prev : a.reason === '감소' ? a.diff - b.diff : b.total - a.total || b.diff - a.diff) || ko(a.shipper, b.shipper));
  items.forEach((x, i) => { x.rank = i + 1; });

  const routes = [];
  for (const b of [agg.export, agg.import]) {
    for (const p of b.ports) {
      if (p.diff > -NUMBERS.routeDropTeu) continue;
      const who = b.list.filter((s) => (s.ports[p.port] || 0) < (s.prevPorts[p.port] || 0)).map((s) => s.name);
      routes.push({ kind: b.kind, label: PORT_LABEL[b.kind], port: p.port, total: p.total, prev: p.prev, diff: p.diff, shippers: who });
    }
  }
  routes.sort((a, b) => a.diff - b.diff || ko(a.port, b.port));
  return { needsPrev: false, items, routes };
}

// ── ④ 월별 추이 · 보고 문장 ──
export function trend(parsed) {
  return parsed.months.map((m, i) => {
    const a = aggregate(parsed, m, i > 0 ? parsed.months[i - 1] : null);
    const count = (note) => [a.export, a.import].reduce((n, b) => n + b.list.filter((s) => s.note === note).length, 0);
    const total = a.export.total + a.import.total;
    const prevTotal = a.hasPrev ? a.export.prev_total + a.import.prev_total : null;
    return {
      month: m, export: a.export.total, import: a.import.total, total,
      prev_export: a.export.prev_total, prev_import: a.import.prev_total, prev_total: prevTotal,
      diff: prevTotal === null ? null : total - prevTotal, rate: rateText(total, prevTotal),
      new: a.hasPrev ? count('신규') : null, lost: a.hasPrev ? count('이탈') : null,
    };
  });
}

export function reportText(agg, vl) {
  const L = [];
  L.push(`평택사무소 ${monthName(agg.month)} 영업실적${agg.hasPrev ? ` (전월 ${monthName(agg.prev_month)} 대비)` : ''} — 단위 TEU`);
  L.push('');
  for (const b of [agg.export, agg.import]) {
    const head = agg.hasPrev ? `${b.kind} ${fmt(b.total)} TEU (전월 ${fmt(b.prev_total)}, ${diffText(b.total - b.prev_total)} / ${rateText(b.total, b.prev_total)})` : `${b.kind} ${fmt(b.total)} TEU`;
    L.push(`■ ${head}`);
    const tp = topPorts(b);
    if (tp.length) L.push(`  - 주요 ${PORT_LABEL[b.kind]}: ${tp.map((p) => `${p.port} ${fmt(p.total)}`).join(' · ')}`);
    if (agg.hasPrev) {
      const c = changesOf(b);
      const part = (label, names, withNum) => (names.length ? `${label} ${names.map((n) => { const s = b.list.find((x) => x.name === n); return withNum(s); }).join(', ')}` : '');
      const line = [
        part('늘어난 화주', c.증가, (s) => `${s.name} ${diffText(s.diff)}`),
        part('줄어든 화주', c.감소, (s) => `${s.name} ${diffText(s.diff)}`),
        part('신규', c.신규, (s) => `${s.name} ${fmt(s.total)}`),
        part('이탈', c.이탈, (s) => `${s.name}(전월 ${fmt(s.prev)})`),
      ].filter(Boolean);
      L.push(`  - ${line.length ? line.join(' / ') : '신규 · 이탈 · 큰 증감 없음'}`);
    }
    L.push('');
  }
  const total = agg.export.total + agg.import.total;
  if (agg.hasPrev) {
    const pt = agg.export.prev_total + agg.import.prev_total;
    L.push(`■ 합계 ${fmt(total)} TEU (전월 ${fmt(pt)}, ${diffText(total - pt)} / ${rateText(total, pt)})`);
  } else L.push(`■ 합계 ${fmt(total)} TEU (전월 자료 없음)`);
  if (vl && !vl.needsPrev) {
    const n = (r) => vl.items.filter((x) => x.reason === r).length;
    L.push(`■ 영업 방문 우선: 이탈 ${n('이탈')}곳 · 큰 폭 감소 ${n('감소')}곳 · 신규 ${n('신규')}곳${vl.routes.length ? ` · 줄어든 항로 ${vl.routes.length}곳` : ''} (방문 목록 참고)`);
  }
  return L.join('\n');
}

// ── ⑤ 결과 파일(lib/result-shape.md 꼴) — 화주는 H01…, 수출 도착지 D01…, 수입 선적지 O01… 로 가린다 ──
export function maskCodes(agg) {
  const shipper = new Map();
  [agg.export, agg.import].forEach((b) => b.list.forEach((s) => { if (!shipper.has(s.name)) shipper.set(s.name, `H${String(shipper.size + 1).padStart(2, '0')}`); }));
  const port = (b, letter) => new Map(b.ports.map((p, i) => [p.port, `${letter}${String(i + 1).padStart(2, '0')}`]));
  return { shipper, export: port(agg.export, 'D'), import: port(agg.import, 'O') };
}

export function buildResult(agg, vl, opts = {}) {
  const codes = maskCodes(agg);
  const people = (key) => new Set([agg.export, agg.import].flatMap((b) => b.list.filter((s) => (key === 'now' ? s.total : s.prev) > 0).map((s) => s.name))).size;
  const exT = agg.export.total;
  const imT = agg.import.total;
  const count = (note) => [agg.export, agg.import].reduce((n, b) => n + b.list.filter((s) => s.note === note).length, 0);
  const pct = (a, b) => (b ? `${a >= b ? '+' : '-'}${Math.abs(((a - b) / b) * 100).toFixed(1)}%` : '');
  const headline = agg.hasPrev
    ? `수출 ${fmt(exT)} TEU(${pct(exT, agg.export.prev_total)}) · 수입 ${fmt(imT)} TEU(${pct(imT, agg.import.prev_total)}), 신규 ${count('신규')} · 이탈 ${count('이탈')}`
    : `수출 ${fmt(exT)} TEU · 수입 ${fmt(imT)} TEU (전월 자료 없음)`;
  const metrics = [
    { key: 'processed', label: '거래처', value: people('now'), unit: '곳', ...(agg.hasPrev ? { prev: people('prev') } : {}) },
    { key: 'export_teu', label: '수출', value: exT, unit: 'TEU', ...(agg.hasPrev ? { prev: agg.export.prev_total } : {}) },
    { key: 'import_teu', label: '수입', value: imT, unit: 'TEU', ...(agg.hasPrev ? { prev: agg.import.prev_total } : {}) },
    { key: 'new', label: '신규 화주', value: count('신규'), unit: '곳' },
    { key: 'lost', label: '이탈 화주', value: count('이탈'), unit: '곳' },
  ];
  const rows = [];
  for (const b of [agg.export, agg.import]) {
    const pcodes = codes[b.kind === '수출' ? 'export' : 'import'];
    b.list.forEach((s) => {
      const mp = mainPort(s.total > 0 ? s.ports : s.prevPorts);
      rows.push([codes.shipper.get(s.name), b.kind, mp ? pcodes.get(mp[0]) : '-', s.total, s.diff === null ? '-' : s.diff === 0 ? '0' : `${s.diff > 0 ? '+' : '-'}${fmt(Math.abs(Math.round(s.diff * 10) / 10))}`, s.note]);
    });
  }
  const review = [];
  const add = (code, reason, detail) => review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code, reason, detail });
  if (agg.hasPrev) {
    const pick = (note) => [agg.export, agg.import].flatMap((b) => b.list.filter((s) => s.note === note).map((s) => ({ b, s })));
    pick('감소').sort((x, y) => x.s.diff - y.s.diff).forEach(({ b, s }) => add(codes.shipper.get(s.name), '전월 대비 큰 폭 감소', `${codes.shipper.get(s.name)} ${b.kind} TEU ${fmt(s.prev)}→${fmt(s.total)} (${diffText(s.diff)}), 방문 우선 검토`));
    pick('이탈').sort((x, y) => y.s.prev - x.s.prev).forEach(({ b, s }) => add(codes.shipper.get(s.name), '이탈 화주', `${codes.shipper.get(s.name)} ${b.kind} 이번 달 실적 0, 전월 ${fmt(s.prev)}`));
  }
  if (agg.dropped.length) add('입력행', '건너뛴 줄', `엑셀 ${agg.dropped.length}줄을 읽지 못해 집계에서 뺐음(월·화주·구분·항구·TEU 확인 필요)`);
  if (!agg.checks.all_ok) add('검산', '합계 불일치', `검산 ${agg.checks.items.filter((i) => !i.ok).map((i) => i.name).join(' · ')} 이(가) 맞지 않음`);
  return {
    schema_version: 1,
    agent: 'sales-analysis',
    owner: '노현석',
    bundle: 'E',
    as_of: opts.baseDate,
    headline,
    metrics,
    table: { columns: ['화주코드', '구분', '상대 항', 'TEU', '전월 대비', '비고'], rows },
    review,
    time: { ...TIME },
    source: { label: opts.sourceLabel || '월별 실적 엑셀', rows: opts.rows ?? 0 },
    rules_version: RULES_VERSION,
    synthetic: opts.synthetic !== false,
  };
}
