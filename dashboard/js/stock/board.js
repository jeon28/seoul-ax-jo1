// 일일 재고 현황: SKR + HAL 공컨테이너(22GP / 45GP) 항구별 재고. 재고현황.html 의 시스템을 옮겨 온 것.
//   조회 버튼 → (조회 중 스켈레톤) → KPI → 국가 목록 → 항구 표(행 클릭) → 상세(SKR · HAL · 합계, 비율 막대, 비고).
//   단위: 개(BOX), Total TEU = 22GP + 45GP × 2.
// 「조회」는 가상이다: 실제 서버를 부르지 않고 data/in/empty-stock-ports.json 을 읽으면서 약 1초의 대기를 넣어 조회처럼 보이게 한다.
// 실제 조회로 바꿀 때는 query() 안의 fetchData() 만 실제 API 호출로 바꾸면 나머지 화면은 그대로 쓴다.
import { el } from '../core.js';

const DATA_URL = '../data/in/empty-stock-ports.json';
const FAKE_DELAY_MS = [900, 1500]; // 가상 조회 대기(최소, 최대)

const n = (v) => (v == null ? 0 : v);
const num = (v) => v.toLocaleString('ko-KR');
const cell = (v) => (v == null ? '-' : num(v)); // 보고 없음(null)은 0 이 아니라 '-'
const sum = (list) => list.reduce((a, p) => ({ s22: a.s22 + n(p.s22), s45: a.s45 + n(p.s45), h22: a.h22 + n(p.h22), h45: a.h45 + n(p.h45) }), { s22: 0, s45: 0, h22: 0, h45: 0 });
const t22 = (a) => a.s22 + a.h22;
const t45 = (a) => a.s45 + a.h45;
const teu = (a) => t22(a) + t45(a) * 2;
const z = (x) => String(x).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const stamp = (d) => `${dateStr(d)} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const skel = (w, h = 14) => {
  const s = el('i', 'skel');
  s.style.width = w;
  s.style.height = `${h}px`;
  return s;
};

export function stockBoard() {
  let phase = 'idle'; // idle(조회 전) → loading → ready
  let rows = [];
  let countries = [];
  let selCountry = null;
  let selPort = null;
  let queriedAt = null;
  let skipped = 0;
  let loadError = null;

  const root = el('div', 'stock');
  const bar = el('section', 'glass stockbar');
  const status = el('div', 'stockstatus');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const queryBtn = el('button', 'btn primary querybtn', '조회');
  queryBtn.type = 'button';
  bar.append(status, queryBtn);
  const body = el('div', 'stockbody');
  root.append(bar, body);

  const kpis = el('div', 'tiles kpis');
  const layout = el('div', 'stocklayout');
  const countryPanel = el('section', 'glass panel countrypanel');
  const right = el('div', 'stockright');
  const tablePanel = el('section', 'glass panel stocktable');
  const detail = el('section', 'glass panel detail');
  right.append(tablePanel, detail);
  layout.append(countryPanel, right);

  // ── 조회 바 ──
  function renderBar() {
    queryBtn.disabled = phase === 'loading';
    queryBtn.setAttribute('aria-busy', String(phase === 'loading'));
    queryBtn.replaceChildren();
    if (phase === 'loading') queryBtn.append(el('i', 'spin'), document.createTextNode('조회 중…'));
    else queryBtn.textContent = phase === 'idle' ? '조회' : '다시 조회';
    status.replaceChildren();
    const main = el('b', '', '공컨테이너 재고 조회');
    let sub;
    if (phase === 'loading') sub = '항구별 최신 수신 메일 기준 재고를 불러오는 중입니다…';
    else if (loadError) sub = `조회에 실패했습니다: ${loadError}${rows.length ? ' · 마지막으로 조회한 값을 보여 줍니다' : ''}`;
    else if (phase === 'ready') sub = `마지막 조회 ${queriedAt} · 항구 ${rows.length}곳${skipped ? ` · 형식이 맞지 않아 건너뛴 행 ${skipped}개` : ''}`;
    else sub = '항구별 최신 수신 메일 기준 · 오른쪽 「조회」 버튼을 누르면 재고를 불러옵니다';
    status.append(main, el('span', 'sub' + (loadError ? ' errtext' : ''), sub));
  }

  // ── 본문: 조회 전 / 조회 중 / 조회 후 ──
  function renderIdle() {
    const p = el('section', 'glass panel stockempty');
    p.append(el('h3', '', loadError ? '재고를 불러오지 못했습니다' : '아직 조회하지 않았습니다'), el('p', 'sub', loadError ? '잠시 뒤 「조회」 버튼을 다시 눌러 주세요.' : '「조회」 버튼을 누르면 SKR + HAL 공컨테이너(22GP / 45GP) 항구별 재고를 불러옵니다.'));
    body.replaceChildren(p);
  }

  function renderSkeleton() {
    const k = el('div', 'tiles kpis');
    for (let i = 0; i < 5; i++) {
      const t = el('div', 'glass tile');
      t.append(skel('55%', 13), skel('70%', 30));
      t.style.display = 'flex';
      t.style.flexDirection = 'column';
      t.style.gap = '10px';
      k.append(t);
    }
    const l = el('div', 'stocklayout');
    const cp = el('section', 'glass panel countrypanel');
    const list = el('div', 'countrylist');
    for (let i = 0; i < 7; i++) { const r = el('div', 'skelrow'); r.append(skel('40%'), skel('28%')); list.append(r); }
    cp.append(skel('45%', 16), list);
    const tp = el('section', 'glass panel stocktable');
    const rowsEl = el('div', 'skeltable');
    for (let i = 0; i < 8; i++) rowsEl.append(skel(`${88 - (i % 3) * 7}%`, 16));
    tp.append(skel('35%', 18), rowsEl);
    const r = el('div', 'stockright');
    r.append(tp);
    l.append(cp, r);
    body.replaceChildren(k, l);
  }

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
      b.addEventListener('click', () => { selCountry = key; selPort = null; renderReady(false); });
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
    const today = dateStr(new Date());
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
      const pick = () => { selPort = p.code; renderReady(false); };
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
      } else detail.append(el('div', 'hint', '국가를 선택하거나 항구 행을 누르면 상세 수량이 여기에 표시됩니다.'));
      return;
    }
    const title = el('h3', '', `${p.name} `);
    title.append(el('span', 'muted', p.code));
    detail.append(title, el('div', 'sub', `${p.country} · 기준일 ${p.date}${p.date === dateStr(new Date()) ? '' : ' (오늘자 아님)'}`), summary(sum([p])));
    if (p.note) detail.append(el('div', 'snote', `비고: ${p.note}`));
  }

  /** fresh = 방금 조회해서 처음 보이는 경우(부드럽게 나타남). 선택만 바뀐 때는 다시 애니메이션하지 않는다 */
  function renderReady(fresh) {
    renderKpis();
    renderCountries();
    renderPorts();
    renderDetail();
    body.classList.toggle('fresh', !!fresh);
    if (body.firstChild !== kpis) body.replaceChildren(kpis, layout);
    renderBar();
  }

  // ── 가상 조회 ──
  async function fetchData() {
    const r = await fetch(DATA_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = JSON.parse(await r.text());
    const c = cleanRows(j.rows);
    if (!c.rows.length) throw new Error('재고 자료가 비었거나 형식이 맞지 않습니다');
    return c;
  }

  async function query() {
    if (phase === 'loading') return;
    phase = 'loading';
    loadError = null;
    renderBar();
    renderSkeleton();
    const [lo, hi] = FAKE_DELAY_MS;
    try {
      const [c] = await Promise.all([fetchData(), sleep(lo + Math.random() * (hi - lo))]); // 읽기가 빨라도 조회처럼 보이게 최소 대기
      rows = c.rows;
      skipped = c.skipped;
      countries = [...new Set(rows.map((p) => p.country))];
      if (selCountry && !countries.includes(selCountry)) selCountry = null;
      if (selPort && !rows.some((p) => p.code === selPort)) selPort = null;
      queriedAt = stamp(new Date());
      phase = 'ready';
      renderReady(true);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      phase = rows.length ? 'ready' : 'idle'; // 실패해도 마지막으로 조회한 값이 있으면 그대로 보여 준다
      if (phase === 'ready') renderReady(false); else renderIdle();
      renderBar();
    }
  }

  queryBtn.addEventListener('click', query);
  renderBar();
  renderIdle();
  return root;
}
