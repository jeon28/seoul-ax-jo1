// 공통 도구: DOM 만들기, 숫자 꼴, 결과 파일 읽기. 화면 파일(home · agent-page · menus/*)이 함께 쓴다.
import { MENUS } from './menus.js';

export const BUNDLES = {
  A: { name: '컨테이너 재고·공이송', color: '#0a84ff' },
  B: { name: '반납·CY 재고 대조', color: '#30b158' },
  C: { name: '위험물·스페셜화물 확인', color: '#ff9f0a' },
  D: { name: '선박 운영 수치', color: '#bf5af2' },
  E: { name: '평택 스케줄·실적', color: '#ff375f' },
};

export const $ = (id) => document.getElementById(id);

// 항상 textContent 로 넣는다: 결과 파일 내용을 HTML 로 해석하지 않는다.
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(path, cls = 'ico') {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  s.append(p);
  return s;
}

export const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : String(n ?? ''));

export function fmtHours(h) {
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return { hh, mm, text: mm ? `${hh}시간 ${mm}분` : `${hh}시간` };
}

// 결과 파일이 비었거나 일부 칸이 빠져도 화면이 깨지지 않게 채운다.
export function normalize(d) {
  const o = d || {};
  return {
    ...o,
    headline: o.headline || '',
    metrics: Array.isArray(o.metrics) ? o.metrics : [],
    table: o.table && Array.isArray(o.table.columns) ? { columns: o.table.columns, rows: Array.isArray(o.table.rows) ? o.table.rows : [] } : { columns: [], rows: [] },
    review: Array.isArray(o.review) ? o.review : [],
    time: o.time || null,
    source: o.source || { label: '-', rows: 0 },
  };
}

// 결과 파일 꼴(lib/result-shape.md)과 다른 곳을 찾아 알려 준다. 조원이 파일을 고칠 때 보는 점검표.
export function checkShape(d) {
  if (!d) return ['결과 파일을 읽지 못했습니다'];
  const bad = [];
  if (d.schema_version !== 1) bad.push('schema_version 은 1 이어야 합니다');
  for (const k of ['agent', 'owner', 'bundle', 'as_of', 'headline', 'rules_version']) if (!d[k]) bad.push(`${k} 칸이 비었습니다`);
  if (d.bundle && !BUNDLES[d.bundle]) bad.push('bundle 은 A~E 중 하나여야 합니다');
  if (!Array.isArray(d.metrics) || !d.metrics.length) bad.push('metrics 가 비었습니다');
  else if (!d.metrics.some((m) => m.key === 'processed')) bad.push('metrics 에 key "processed" 가 없습니다(맨 위 요약에 쓰임)');
  if (!d.table || !Array.isArray(d.table.columns) || !Array.isArray(d.table.rows)) bad.push('table.columns · table.rows 가 필요합니다');
  if (!Array.isArray(d.review)) bad.push('review 는 목록이어야 합니다');
  if (!d.time || ['before_min', 'after_min', 'runs_per_month', 'basis'].some((k) => d.time[k] === undefined)) bad.push('time 에 before_min · after_min · runs_per_month · basis 가 필요합니다');
  if (d.synthetic !== true) bad.push('synthetic 이 true 가 아닙니다(실제 자료면 입장 비밀번호부터)');
  return bad;
}

// 월 절감 시간(시간) = (전 - 후) × 월 횟수 ÷ 60
export const saving = (d) => (d.time ? Math.max(0, ((d.time.before_min - d.time.after_min) * d.time.runs_per_month) / 60) : 0);
export const metricOf = (d, key) => (d.metrics.find((m) => m.key === key) || {}).value || 0;

const cache = new Map();
export async function loadDoc(menu) {
  if (cache.has(menu.slug)) return cache.get(menu.slug);
  let doc = null;
  try {
    const r = await fetch('../data/out/' + menu.file, { cache: 'no-cache' });
    if (r.ok) doc = await r.json();
  } catch (e) {
    doc = null;
  }
  cache.set(menu.slug, doc);
  return doc;
}

export async function loadAll() {
  const docs = await Promise.all(MENUS.map(loadDoc));
  return MENUS.map((m, i) => ({ menu: m, raw: docs[i], doc: normalize(docs[i]), problems: checkShape(docs[i]) }));
}

// 표 칸 색: 칸 전체가 이 말과 같을 때만 칩으로 바꾼다.
const BAD = ['불일치', '부족', '불가', '위반', '누락', '짝 없음', '이탈', '미회신'];
const WARN = ['과잉', '검토 필요', '확인 필요', '대기'];
const OK = ['일치', '적정', '가능', '완료', '확정', '확보'];
export function cellEl(v) {
  const s = fmt(v);
  const td = el('td');
  const tone = BAD.includes(s) ? 'bad' : WARN.includes(s) ? 'warn' : OK.includes(s) ? 'ok' : '';
  if (tone) td.append(el('span', 'pill ' + tone, s));
  else td.textContent = s;
  if (typeof v === 'number') td.className = 'num';
  return td;
}

export function tableEl(table, filterText = '') {
  const t = el('table', 'tbl');
  const head = el('tr');
  table.columns.forEach((c, i) => head.append(el('th', typeof (table.rows[0] || [])[i] === 'number' ? 'num' : '', c)));
  const thead = el('thead');
  thead.append(head);
  const tb = el('tbody');
  const q = filterText.trim().toLowerCase();
  table.rows
    .filter((r) => !q || r.some((c) => String(c).toLowerCase().includes(q)))
    .forEach((r) => {
      const tr = el('tr');
      r.forEach((c) => tr.append(cellEl(c)));
      tb.append(tr);
    });
  t.append(thead, tb);
  return t;
}

export function deltaEl(m) {
  if (m.prev === undefined || m.prev === null) return null;
  const d = m.value - m.prev;
  return el('span', 'delta ' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'eq'), d === 0 ? '±0' : (d > 0 ? '▲' : '▼') + fmt(Math.abs(Math.round(d * 10) / 10)));
}

export function metricTile(m) {
  const t = el('div', 'mtile');
  const v = el('div', 'mval', fmt(m.value));
  v.append(el('small', '', m.unit || ''));
  t.append(v, el('div', 'mlab', m.label));
  const dl = deltaEl(m);
  if (dl) t.append(dl);
  return t;
}

// 확인 완료 표시는 이 브라우저에만 저장한다(서버로 보내지 않음).
const KEY = 'axdash.reviewDone';
export function readDone() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); }
}
export function writeDone(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch (e) { /* 저장이 막혀도 화면은 동작 */ }
}
