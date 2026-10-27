// 일일 재고 현황: SKR + HAL 공컨테이너(22GP / 45GP) 항구별 재고. 재고현황.html 의 시스템을 옮겨 온 것.
//   KPI → 국가 목록 → 항구 표(행 클릭) → 상세(SKR · HAL · 합계, 비율 막대, 비고).  단위: 개(BOX), Total TEU = 22GP + 45GP × 2.
// 자료는 data/in/empty-stock-ports.json. 이 파일이 바뀌면 화면이 1분 안에 따라온다(원본의 data.js 자동 갱신과 같은 동작).
import { el } from '../core.js';

const DATA_URL = '../data/in/empty-stock-ports.json';
const POLL_MS = 60_000;

const n = (v) => (v == null ? 0 : v);
const num = (v) => v.toLocaleString('ko-KR');
const cell = (v) => (v == null ? '-' : num(v)); // 보고 없음(null)은 0 이 아니라 '-'
const sum = (list) => list.reduce((a, p) => ({ s22: a.s22 + n(p.s22), s45: a.s45 + n(p.s45), h22: a.h22 + n(p.h22), h45: a.h45 + n(p.h45) }), { s22: 0, s45: 0, h22: 0, h45: 0 });
const t22 = (a) => a.s22 + a.h22;
const t45 = (a) => a.s45 + a.h45;
const teu = (a) => t22(a) + t45(a) * 2;

const todayStr = () => {
  const d = new Date();
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

/** 수량은 숫자 또는 null 만 인정, 문자열 칸은 문자열만. 형식이 안 맞는 행은 버리고 개수만 센다 */
function cleanRows(raw) {
  const rows = [];
  let skipped = 0;
  const q = (v) => (v === null || v === undefined ? null : Number.isFinite(v) ? v : NaN);
  for (const r of Array.isArray(raw) ? raw : []) {
    const p = r && { country: r.country, code: r.code, name: r.name, s22: q(r.s22), s45: q(r.s45), h22: q(r.h22), h45: q(r.h45), date: r.date, note: r.note ?? '' };
    const ok = p && [p.country, p.code, p.name, p.date].every((s) => typeof s === 'string' && s) && [p.s22, p.s45, p.h22, p.h45].every((v) => !Number.isNaN(v)) && typeof p.note === 'string';
    if (ok) rows.push(p); else skipped++;
  }
  return { rows, skipped };
}

function statBox(cls, title, r22, r45, hideZero) {
  const b = el('div', 'sbox ' + cls);
  b.append(el('h4', '', title));
  const f = (v) => (hideZero && !v ? '-' : cell(v));
  [['22GP', r22], ['45GP', r45], ['소계', n(r22) + n(r45)]].forEach(([k, v]) => {
    const r = el('div', 'srow');
    r.append(el('span', '', k), el('b', '', f(v)));
    b.append(r);
  });
  return b;
}

function summary(a) {
  const frag = document.createDocumentFragment();
  const grid = el('div', 'sgrid');
  grid.append(statBox('skr', 'SKR', a.s22, a.s45, true), statBox('hal', 'HAL', a.h22, a.h45, true));
  const tot = el('div', 'sbox tot');
  tot.append(el('h4', '', '합계 (SKR+HAL)'));
  [['22GP', t22(a)], ['45GP', t45(a)], ['Total TEU', teu(a)]].forEach(([k, v]) => {
    const r = el('div', 'srow');
    r.append(el('span', '', k), el('b', '', num(v)));
    tot.append(r);
  });
  grid.append(tot);

  const all = a.s22 + a.s45 + a.h22 + a.h45 || 1;
  const bar = el('div', 'sbar');
  [['s22', 'c-skr22'], ['s45', 'c-skr45'], ['h22', 'c-hal22'], ['h45', 'c-hal45']].forEach(([k, c]) => {
    const seg = el('i', c);
    seg.style.width = `${(a[k] / all) * 100}%`;
    bar.append(seg);
  });
  const legend = el('div', 'slegend');
  [['SKR 22GP', 'c-skr22'], ['SKR 45GP', 'c-skr45'], ['HAL 22GP', 'c-hal22'], ['HAL 45GP', 'c-hal45']].forEach(([t, c]) => {
    const s = el('span');
    s.append(el('i', 'dot ' + c), document.createTextNode(t));
    legend.append(s);
  });
  frag.append(grid, bar, legend);
  return frag;
}

export function stockBoard() {
  let rows = [];
  let countries = [];
  let selCountry = null;
  let selPort = null;
  let updatedAt = null;
  let skipped = 0;
  let loadError = null;
  let lastText = null;

  const root = el('div', 'stock');
  const kpis = el('div', 'tiles kpis');
  const layout = el('div', 'stocklayout');
  const countryPanel = el('section', 'glass panel countrypanel');
  const right = el('div', 'stockright');
  const tablePanel = el('section', 'glass panel stocktable');
  const detail = el('section', 'glass panel detail');
  const foot = el('div', 'stockfoot');
  right.append(tablePanel, detail);
  layout.append(countryPanel, right);
  root.append(kpis, layout, foot);

  function renderKpis() {
    const a = sum(rows);
    kpis.replaceChildren();
    [['전체 TEU', teu(a)], ['합계 22GP', t22(a)], ['합계 45GP', t45(a)], ['SKR (22GP+45GP)', a.s22 + a.s45], ['HAL (22GP+45GP)', a.h22 + a.h45]].forEach(([k, v]) => {
      const t = el('div', 'glass tile');
      t.append(el('div', 'lab', k), el('div', 'val', num(v)));
      kpis.append(t);
    });
  }

  function renderCountries() {
    countryPanel.replaceChildren();
    const h = el('div', 'phead');
    h.append(el('h2', '', '국가 (클릭)'));
    const list = el('div', 'countrylist');
    const add = (label, value, key) => {
      const b = el('button', 'country' + (selCountry === key ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(selCountry === key));
      b.append(el('span', '', label), el('span', 'muted', `${num(value)} TEU`));
      b.addEventListener('click', () => { selCountry = key; selPort = null; render(); });
      list.append(b);
    };
    add('전체', teu(sum(rows)), null);
    countries.forEach((c) => add(c, teu(sum(rows.filter((p) => p.country === c))), c));
    countryPanel.append(h, list);
  }

  function renderPorts() {
    const list = selCountry ? rows.filter((p) => p.country === selCountry) : rows;
    tablePanel.replaceChildren();
    const h = el('div', 'phead');
    h.append(el('h2', '', `${selCountry || '전체'} · 항구 ${list.length}곳`), el('span', 'sub', '행을 누르면 상세가 아래에 나옵니다'));
    const t = el('table', 'tbl');
    const head = el('tr');
    ['항구명', '코드', 'SKR 22GP', 'SKR 45GP', 'HAL 22GP', 'HAL 45GP', '합계 22GP', '합계 45GP', 'TEU', '기준일'].forEach((c, i) => head.append(el('th', i < 2 || i === 9 ? '' : 'num', c)));
    const th = el('thead');
    th.append(head);
    const tb = el('tbody');
    const today = todayStr();
    list.forEach((p) => {
      const a = sum([p]);
      const tr = el('tr', 'clickrow' + (selPort === p.code ? ' on' : ''));
      tr.tabIndex = 0;
      tr.setAttribute('aria-selected', String(selPort === p.code));
      const date = el('td', p.date === today ? '' : 'stale', p.date);
      if (p.date !== today) date.title = '오늘자가 아닙니다';
      tr.append(el('td', '', p.name), el('td', 'muted', p.code), el('td', 'num', cell(p.s22)), el('td', 'num', cell(p.s45)), el('td', 'num', cell(p.h22)), el('td', 'num', cell(p.h45)), el('td', 'num', num(t22(a))), el('td', 'num', num(t45(a))));
      const tcell = el('td', 'num');
      tcell.append(el('b', '', num(teu(a))));
      tr.append(tcell, date);
      const pick = () => { selPort = p.code; render(); };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      tb.append(tr);
    });
    const a = sum(list);
    const tf = el('tfoot');
    const fr = el('tr');
    const first = el('td', '', '합계');
    first.colSpan = 2;
    fr.append(first, ...[a.s22, a.s45, a.h22, a.h45, t22(a), t45(a), teu(a)].map((v) => el('td', 'num', num(v))), el('td'));
    tf.append(fr);
    t.append(th, tb, tf);
    const wrap = el('div', 'tablewrap');
    wrap.append(t);
    tablePanel.append(h, wrap);
  }

  function renderDetail() {
    detail.replaceChildren();
    const p = rows.find((x) => x.code === selPort);
    if (!p) {
      if (selCountry) {
        const list = rows.filter((x) => x.country === selCountry);
        detail.append(el('h3', '', `${selCountry} 합계`), el('div', 'sub', `항구 ${list.length}곳`), summary(sum(list)));
      } else detail.append(el('div', 'hint', !lastText && !loadError ? '재고 자료를 불러오는 중…' : '국가를 선택하거나 항구 행을 누르면 상세 수량이 여기에 표시됩니다.'));
      return;
    }
    const title = el('h3', '', `${p.name} `);
    title.append(el('span', 'muted', p.code));
    detail.append(title, el('div', 'sub', `${p.country} · 기준일 ${p.date}${p.date === todayStr() ? '' : ' (오늘자 아님)'}`), summary(sum([p])));
    if (p.note) detail.append(el('div', 'snote', `비고: ${p.note}`));
  }

  function renderFoot() {
    foot.replaceChildren();
    const msg = loadError ? `자료를 읽지 못했습니다: ${loadError}` : `마지막 갱신: ${updatedAt || '-'} · 1분마다 자동 확인${skipped ? ` · 형식이 맞지 않아 건너뛴 행 ${skipped}개` : ''}`;
    foot.append(el('span', 'sub' + (loadError ? ' errtext' : ''), msg));
    const b = el('button', 'btn ghost', '지금 다시 읽기');
    b.type = 'button';
    b.addEventListener('click', load);
    foot.append(b);
  }

  function render() {
    renderKpis();
    renderCountries();
    renderPorts();
    renderDetail();
    renderFoot();
  }

  async function load() {
    try {
      const r = await fetch(DATA_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (text === lastText && !loadError) return; // 바뀐 게 없으면 다시 그리지 않는다(선택 상태 유지)
      const j = JSON.parse(text);
      const c = cleanRows(j.rows);
      if (!c.rows.length) throw new Error('rows 가 비었거나 형식이 맞지 않습니다');
      lastText = text;
      rows = c.rows;
      skipped = c.skipped;
      updatedAt = j.updatedAt || null;
      countries = [...new Set(rows.map((p) => p.country))];
      if (selCountry && !countries.includes(selCountry)) selCountry = null;
      if (selPort && !rows.some((p) => p.code === selPort)) selPort = null;
      loadError = null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e); // 실패해도 마지막으로 읽은 값은 그대로 보여 준다
    }
    render();
  }

  render();
  load();
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); return; } // 다른 메뉴로 갔으면 멈춘다
    load();
  }, POLL_MS);
  return root;
}
