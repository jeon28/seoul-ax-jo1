// 속력별 소모량 조회 화면(Speed Performance). operation-dashboard 의 PerformanceBoard 와 같은 구성:
//   선박 1·2(비교) → 기간/속력/RH/Slip 필터 → 속력별 평균 RPM·FO·MGO·TOTAL 표 → 정박 중 소모량 → FO 그래프 → CSV 저장.
// 계산은 performance.js · portcalc.js(규칙), 자료는 noon-synthetic.js(가상). 이 파일은 화면만 만든다.
import { el } from '../core.js';
import { analyze, toCsv, DEFAULT_FILTERS, MIN_SAMPLES } from './performance.js';
import { MIN_TDR_CALLS } from './portcalc.js';
import { getHistory, AS_OF } from './noon-synthetic.js';
import { lineChart } from './chart.js';

const PERIODS = [
  { label: '전체', months: 0 },
  { label: '최근 3년', months: 36 },
  { label: '최근 2년', months: 24 },
  { label: '최근 1년', months: 12 },
  { label: '최근 6개월', months: 6 },
];
const COLORS = ['#0a84ff', '#ff9f0a'];
const SPEEDS = Array.from({ length: 21 }, (_, i) => i + 5);
const fmtD = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '-');
const num = (s, fallback) => (String(s).trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : fallback);

// 기간 필터는 가상 자료의 기준일(AS_OF)에서 거꾸로 센다(실제 API 로 바꾸면 오늘 날짜로)
function fromDate(months) {
  if (!months) return undefined;
  const d = new Date(Date.UTC(+AS_OF.slice(0, 4), +AS_OF.slice(4, 6) - 1, +AS_OF.slice(6, 8)));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

// ── 선박 목록(실제 선박명·코드) ──
let fleetPromise;
const loadFleet = () =>
  (fleetPromise ??= fetch('../data/in/vessels.json').then((r) => {
    if (!r.ok) throw new Error('선박 목록(data/in/vessels.json)을 읽지 못했습니다');
    return r.json();
  }).then((j) => j.vessels));

export function searchVessels(fleet, q, limit = 12) {
  const needle = q.trim().toLowerCase();
  if (!needle) return fleet.slice(0, limit);
  const score = (v) => {
    const c = v.code.toLowerCase();
    const n = v.name.toLowerCase();
    if (c === needle) return 0;
    if (c.startsWith(needle)) return 1;
    if (n.startsWith(needle)) return 2;
    if (n.includes(needle) || c.includes(needle)) return 3;
    return 9;
  };
  return fleet.map((v) => ({ v, s: score(v) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s || a.v.name.localeCompare(b.v.name)).slice(0, limit).map((x) => x.v);
}

// ── 이 브라우저에만 저장하는 입력값 ──
const KEY = 'axdash.bunker.performance.v2'; // v2: 속력 기본값을 12~18 로 바꾸면서, 예전 저장값(10~22)이 새 기본값을 덮지 않게 키를 바꿈
const side = (code) => ({ code, rhMin: String(DEFAULT_FILTERS.rhMin), rhMax: String(DEFAULT_FILTERS.rhMax), slipMin: String(DEFAULT_FILTERS.slipMin), slipMax: String(DEFAULT_FILTERS.slipMax) });
const defaults = () => ({ months: 0, spdMin: DEFAULT_FILTERS.spdMin, spdMax: DEFAULT_FILTERS.spdMax, exclude: true, sides: [side('MEBG'), side('')] });
function readState() {
  const d = defaults();
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!j) return d;
    return { ...d, ...j, sides: [0, 1].map((i) => ({ ...d.sides[i], ...(j.sides?.[i] ?? {}) })) };
  } catch (e) {
    return d;
  }
}
const writeState = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장이 막혀도 동작 */ } };

// ── 작은 화면 조각 ──
function field(label, input) {
  const l = el('label', 'field');
  l.append(el('span', '', label), input);
  return l;
}
function select(options, value, onChange) {
  const sel = el('select', 'inp');
  options.forEach((o) => {
    const opt = el('option', '', o.label);
    opt.value = String(o.value);
    sel.append(opt);
  });
  sel.value = String(value);
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}
function textInput(value, width, onInput) {
  const i = el('input', 'inp');
  i.value = value;
  i.style.width = width + 'px';
  i.inputMode = 'decimal';
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function vesselPicker(label, fleetP, getCode, setCode) {
  const wrap = el('label', 'field suggest');
  const input = el('input', 'inp');
  input.value = getCode();
  input.placeholder = '예) MEBG 또는 MELBOURNE';
  input.autocomplete = 'off';
  const list = el('ul', 'suggestlist');
  list.hidden = true;
  let fleet = [];
  fleetP.then((f) => { fleet = f; }).catch(() => {});
  const draw = () => {
    list.replaceChildren();
    const hits = searchVessels(fleet, input.value);
    hits.forEach((v) => {
      const li = el('li');
      li.append(el('b', '', v.code), document.createTextNode(' ' + v.name + ' '), el('span', 'muted', `${v.teu?.toLocaleString() ?? '-'} TEU`));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = v.code; setCode(v.code); list.hidden = true; });
      list.append(li);
    });
    list.hidden = !hits.length;
  };
  input.addEventListener('input', () => { setCode(input.value.trim().toUpperCase()); draw(); });
  input.addEventListener('focus', draw);
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
  wrap.append(el('span', '', label), input, list);
  return { node: wrap };
}

function resultTable(a) {
  const t = el('table', 'tbl');
  const head = el('tr');
  ['속력(kn)', '건수', 'RPM', 'FO', 'MGO', 'TOTAL'].forEach((c) => head.append(el('th', 'num', c)));
  const th = el('thead');
  th.append(head);
  const tb = el('tbody');
  a.rows.forEach((r) => {
    const tr = el('tr');
    const cnt = el('td', 'num' + (r.count < MIN_SAMPLES ? ' lowsample' : ''), String(r.count));
    if (r.count < MIN_SAMPLES) cnt.title = `건수가 ${MIN_SAMPLES}건 미만이라 평균의 신뢰도가 낮습니다`;
    tr.append(el('td', 'num', String(r.spd)), cnt, el('td', 'num', r.rpm.toFixed(1)), el('td', 'num', r.fo.toFixed(1)), el('td', 'num', r.mgo.toFixed(1)));
    const tot = el('td', 'num');
    tot.append(el('b', '', r.total.toFixed(1)));
    tr.append(tot);
    tb.append(tr);
  });
  t.append(th, tb);
  const wrap = el('div', 'tablewrap');
  wrap.append(t);
  return wrap;
}

function portPanel(port) {
  const box = el('div', 'portbox');
  const h = el('h3', '', '정박 중 소모량 ');
  h.append(el('span', 'muted', '(MT/day)'));
  box.append(h);
  const tdr = port.tdr;
  const reliable = !!tdr && tdr.fo !== null && tdr.n >= MIN_TDR_CALLS;
  const master = port.master?.portMt ?? null;
  const skipped = tdr ? tdr.skipped.unentered + tdr.skipped.bunkering + tdr.skipped.invalid : 0;

  const t = el('table', 'tbl');
  const hr = el('tr');
  [['출처', ''], ['FO', 'num'], ['MGO', 'num'], ['근거', '']].forEach(([c, k]) => hr.append(el('th', k, c)));
  const th = el('thead');
  th.append(hr);
  const tb = el('tbody');

  const r1 = el('tr');
  const c1 = el('td', '', 'TDR 실적 (최근 12개월)');
  if (reliable) c1.append(el('b', '', ' ◀ 대표값'));
  r1.append(c1, el('td', 'num', tdr?.fo != null ? tdr.fo.toFixed(1) : '-'), el('td', 'num', tdr?.mgo != null ? tdr.mgo.toFixed(1) : '-'),
    el('td', 'muted', tdr ? `기항 ${tdr.calls}건 중 ${tdr.n}건 사용 (중앙값)${skipped ? ` · 제외 ${skipped}건: 미입력 ${tdr.skipped.unentered}, 벙커링 ${tdr.skipped.bunkering}, 오류 ${tdr.skipped.invalid}` : ''}` : '조회 실패'));

  const r2 = el('tr');
  const c2 = el('td', '', '선박 제원 (Port MT)');
  if (!reliable && master !== null) c2.append(el('b', '', ' ◀ 대표값'));
  r2.append(c2, el('td', 'num', master !== null ? master.toFixed(1) : '-'), el('td', 'num', '-'), el('td', 'muted', master !== null ? '선박 제원의 Port MT (유종 구분 없음)' : '제원에 입력되지 않음'));
  tb.append(r1, r2);
  t.append(th, tb);
  const wrap = el('div', 'tablewrap');
  wrap.append(t);
  box.append(wrap);
  if (tdr && tdr.n > 0 && tdr.n < MIN_TDR_CALLS) box.append(el('p', 'sub', `TDR 사용 가능 건수가 ${MIN_TDR_CALLS}건 미만이라 참고용입니다.`));
  if (!reliable && master === null) box.append(el('p', 'sub', '이 선박은 정박 소모량을 구할 수 있는 값이 없습니다. 직접 입력이 필요합니다.'));
  port.warnings.forEach((w) => box.append(el('p', 'sub warntext', w)));
  return box;
}

function download(name, csv) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `performance_${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function speedPerformance() {
  const st = readState();
  const fleetP = loadFleet();
  const data = [null, null];
  const errors = [null, null];

  const root = el('div', 'perf');
  const controls = el('section', 'glass panel controls');
  const results = el('div', 'perfresults');
  const chartBox = el('div');
  root.append(controls, results, chartBox);

  const save = () => writeState(st);
  const patch = (i, p) => { Object.assign(st.sides[i], p); save(); };

  // 위쪽 공통 조건
  const top = el('div', 'row');
  top.append(
    field('기간', select(PERIODS.map((p) => ({ label: p.label, value: p.months })), st.months, (v) => { st.months = Number(v); save(); renderResults(); })),
    field('속력 (kn) 최소', select(SPEEDS.map((s) => ({ label: String(s), value: s })), st.spdMin, (v) => { st.spdMin = Number(v); save(); renderResults(); })),
    field('최대', select(SPEEDS.map((s) => ({ label: String(s), value: s })), st.spdMax, (v) => { st.spdMax = Number(v); save(); renderResults(); })),
  );
  const ck = el('label', 'ckrow');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = st.exclude;
  cb.addEventListener('change', () => { st.exclude = cb.checked; save(); renderResults(); });
  ck.append(cb, document.createTextNode(' 입력 오류 의심 행 제외'));
  top.append(ck);
  controls.append(top);

  // 선박 1·2
  const sides = el('div', 'grid2');
  const errEls = [];
  const btns = [];
  [0, 1].forEach((i) => {
    const col = el('div');
    const row = el('div', 'row');
    const picker = vesselPicker(i === 0 ? '선박 1' : '선박 2 (비교, 선택)', fleetP, () => st.sides[i].code, (c) => { patch(i, { code: c }); btns[i].disabled = !c.trim(); });
    const btn = el('button', 'btn primary', '조회');
    btn.type = 'button';
    btn.disabled = !st.sides[i].code.trim();
    btn.addEventListener('click', () => load(i));
    btns.push(btn);
    row.append(picker.node, btn);
    const filters = el('div', 'row');
    [['RH 최소', 'rhMin'], ['RH 최대', 'rhMax'], ['Slip 최소', 'slipMin'], ['Slip 최대', 'slipMax']].forEach(([lab, k]) => {
      filters.append(field(lab, textInput(st.sides[i][k], 72, (v) => { patch(i, { [k]: v }); renderResults(); })));
    });
    const err = el('div', 'err');
    err.hidden = true;
    errEls.push(err);
    col.append(row, filters, err);
    sides.append(col);
  });
  controls.append(sides);
  controls.append(el('p', 'sub', `선박명·코드는 실제, 속력·RPM·소모량·정박 기록은 전부 가상입니다(가상 NOON REPORT, 기준일 ${fmtD(AS_OF)}). 같은 선박은 항상 같은 값이 나옵니다.`));

  async function load(i) {
    const code = st.sides[i].code.trim().toUpperCase();
    if (!code) { errors[i] = '선박 코드를 입력하세요.'; data[i] = null; return renderResults(); }
    errors[i] = null;
    btns[i].disabled = true;
    btns[i].textContent = '조회 중…';
    try {
      const fleet = await fleetP;
      const v = fleet.find((x) => x.code === code);
      if (!v) throw new Error(`${code}: 선박 목록에 없는 코드입니다. 선박 코드를 확인하세요.`);
      data[i] = await getHistory(v);
      if (!data[i].rows.length) throw new Error(`${code}: NOON REPORT 데이터가 없습니다.`);
    } catch (e) {
      data[i] = null;
      errors[i] = e instanceof Error ? e.message : String(e);
    } finally {
      btns[i].disabled = !st.sides[i].code.trim();
      btns[i].textContent = '조회';
      renderResults();
    }
  }

  function renderResults() {
    errEls.forEach((e, i) => { e.hidden = !errors[i]; e.textContent = errors[i] || ''; });
    const analyses = st.sides.map((s, i) => (data[i]
      ? analyze(data[i].rows, {
        rhMin: num(s.rhMin, DEFAULT_FILTERS.rhMin), rhMax: num(s.rhMax, DEFAULT_FILTERS.rhMax),
        slipMin: num(s.slipMin, DEFAULT_FILTERS.slipMin), slipMax: num(s.slipMax, DEFAULT_FILTERS.slipMax),
        spdMin: st.spdMin, spdMax: st.spdMax, from: fromDate(st.months), excludeOutliers: st.exclude,
      })
      : null));

    results.replaceChildren();
    const grid = el('div', 'grid2');
    analyses.forEach((a, i) => {
      const d = data[i];
      if (!d || !a) return;
      const p = el('section', 'glass panel');
      const h = el('div', 'phead');
      const t = el('h2', '', `${d.vsl} ${d.name} `);
      t.append(el('span', 'muted', '속력별 평균 소모량 (MT/day)'));
      h.append(t);
      p.append(h);
      const note = [`NOON REPORT ${d.rows.length.toLocaleString()}건 (${fmtD(d.first)} ~ ${fmtD(d.last)}) 중 조건에 맞는 ${a.used.toLocaleString()}건 사용`];
      if (d.duplicates > 0) note.push(`중복 ${d.duplicates}건 제거`);
      if (a.outliersExcluded > 0) note.push(`입력 오류 의심 ${a.outliersExcluded}건 제외`);
      if (a.badSpeed > 0) note.push(`속력 값 오류 ${a.badSpeed}건 제외`);
      p.append(el('p', 'sub', note.join(' · ')));
      if (!a.rows.length) p.append(el('p', 'sub', '조건에 맞는 데이터가 없습니다. RH/Slip/기간/속력 범위를 넓혀 보세요.'));
      else p.append(resultTable(a));
      p.append(portPanel(d.port));
      const row = el('div', 'row');
      const dl = el('button', 'btn', 'CSV 저장 (Excel에서 열기)');
      dl.type = 'button';
      dl.disabled = !a.rows.length;
      dl.addEventListener('click', () => download(d.vsl, toCsv(d.vsl, a)));
      row.append(dl);
      p.append(row);
      grid.append(p);
    });
    results.append(grid);

    chartBox.replaceChildren();
    const series = analyses.map((a, i) => (a && data[i] && a.rows.length ? { name: `${data[i].vsl} FO`, color: COLORS[i], points: a.rows.map((r) => ({ x: r.spd, y: r.fo })) } : null)).filter(Boolean);
    if (series.length) {
      const p = el('section', 'glass panel');
      const h = el('div', 'phead');
      const t = el('h2', '', '속력별 FO 소모량 ');
      t.append(el('span', 'muted', '(MT/day)'));
      h.append(t);
      p.append(h, lineChart({ series, xUnit: ' kn', label: '속력별 FO 소모량 꺾은선 그래프' }));
      p.append(el('p', 'sub', '건수가 적은 속력(회색 숫자)은 평균의 신뢰도가 낮습니다. FO 는 한 종류로만 보고되어 VLSFO/HSFO 구분이 없습니다.'));
      chartBox.append(p);
    }
  }

  // 처음 열 때 저장된(없으면 기본) 선박을 바로 보여 준다
  [0, 1].forEach((i) => { if (st.sides[i].code.trim()) load(i); });
  renderResults();
  return root;
}
