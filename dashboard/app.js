'use strict';

// 묶음 정의 (설계.md 와 같게)
const BUNDLES = {
  A: { name: 'A 컨테이너 재고·공이송', color: '#2f6fb0' },
  B: { name: 'B 반납·CY 재고 대조', color: '#1f8a70' },
  C: { name: 'C 위험물·스페셜화물 확인', color: '#c2571a' },
  D: { name: 'D 선박 운영 수치(벙커·용선료·보급)', color: '#7a4fb0' },
  E: { name: 'E 평택 스케줄·실적', color: '#b0316a' },
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // 항상 textContent: 파일 내용을 HTML 로 해석하지 않음
  return e;
};
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : String(n));

let DOCS = [];
let reviewItems = [];

async function load() {
  const idx = await (await fetch('../data/out/index.json')).json();
  DOCS = await Promise.all(idx.files.map(async (f) => (await fetch('../data/out/' + f)).json()));
  DOCS.sort((a, b) => a.bundle.localeCompare(b.bundle));
}

// 월 절감 시간(시간) = (전 - 후) × 월 횟수 / 60
const saving = (d) => Math.max(0, ((d.time.before_min - d.time.after_min) * d.time.runs_per_month) / 60);
const metricOf = (d, key) => (d.metrics.find((m) => m.key === key) || {}).value || 0;

function renderTiles() {
  const processed = DOCS.reduce((s, d) => s + metricOf(d, 'processed'), 0);
  const review = DOCS.reduce((s, d) => s + d.review.length, 0);
  const hours = DOCS.reduce((s, d) => s + saving(d), 0);
  const asof = DOCS.map((d) => d.as_of).sort().pop();
  $('asof').textContent = '기준일 ' + asof;
  const tiles = [
    ['에이전트', DOCS.length, '개', Object.keys(BUNDLES).length + ' 묶음', ''],
    ['처리 건수', processed, '건', '결과 파일 합계', ''],
    ['확인 필요', review, '건', '사람이 볼 것', 'warn'],
    ['월 절감 시간', Math.round(hours * 10) / 10, '시간', '조원 추정값 합계', ''],
  ];
  const box = $('tiles');
  box.replaceChildren();
  for (const [lab, val, unit, note, cls] of tiles) {
    const t = el('div', 'tile ' + cls);
    t.append(el('div', 'lab', lab));
    const v = el('div', 'val', fmt(val));
    v.append(el('small', '', unit));
    t.append(v, el('div', 'note', note));
    box.append(t);
  }
}

function delta(m) {
  if (m.prev === undefined) return null;
  const d = m.value - m.prev;
  const s = el('span', 'd ' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'eq'), d === 0 ? '±0' : (d > 0 ? '▲' : '▼') + fmt(Math.abs(d)));
  return s;
}

function detailTable(doc) {
  const wrap = el('div', 'detail');
  const t = el('table');
  const thead = el('tr');
  doc.table.columns.forEach((c) => thead.append(el('th', '', c)));
  t.append(thead);
  doc.table.rows.forEach((r) => {
    const tr = el('tr');
    r.forEach((c) => tr.append(el('td', '', fmt(c))));
    t.append(tr);
  });
  wrap.append(t);
  return wrap;
}

function renderCards() {
  const box = $('cards');
  box.replaceChildren();
  for (const [key, b] of Object.entries(BUNDLES)) {
    const docs = DOCS.filter((d) => d.bundle === key);
    if (!docs.length) continue;
    const card = el('div', 'card');
    card.style.setProperty('--c', b.color);
    card.append(el('h3', '', b.name), el('div', 'who', docs.map((d) => d.owner).join(' · ')));
    for (const d of docs) {
      const a = el('div', 'agent');
      a.append(el('div', 'hl', d.headline));
      const ms = el('div', 'metrics');
      d.metrics.forEach((m) => {
        const s = el('span', 'metric');
        s.append(document.createTextNode(m.label + ' '), el('b', '', fmt(m.value)), document.createTextNode(m.unit));
        const dl = delta(m);
        if (dl) s.append(dl);
        ms.append(s);
      });
      a.append(ms);
      const n = d.review.length;
      const row = el('div', 'meta');
      row.append(document.createTextNode(`${d.owner} · ${d.source.label} · 월 ${Math.round(saving(d) * 10) / 10}시간 절감(${d.time.basis}) `));
      const btn = el('button', 'chipbtn' + (n ? '' : ' none'), n ? `확인 필요 ${n}건 ▸` : '확인 필요 없음');
      let open = null;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (open) { open.remove(); open = null; return; }
        open = detailTable(d);
        a.append(open);
      });
      row.append(btn);
      a.append(row);
      card.append(a);
    }
    box.append(card);
  }
}

function collectReview() {
  reviewItems = [];
  for (const d of DOCS) {
    for (const r of d.review) {
      reviewItems.push({ key: `${d.bundle}-${d.agent}-${r.id}`, bundle: d.bundle, id: r.id, code: r.code, reason: r.reason, detail: r.detail });
    }
  }
}

function renderFilter() {
  const f = $('filter');
  f.replaceChildren(new Option('전체 묶음', ''));
  for (const [k, b] of Object.entries(BUNDLES)) f.append(new Option(b.name, k));
  f.addEventListener('change', renderReview);
}

function visibleItems() {
  const k = $('filter').value;
  return reviewItems.filter((r) => !k || r.bundle === k);
}

function renderReview() {
  const t = $('reviewTable');
  t.replaceChildren();
  const h = el('tr');
  ['묶음', '코드', '사유', '내용'].forEach((c) => h.append(el('th', '', c)));
  t.append(h);
  visibleItems().forEach((r) => {
    const tr = el('tr');
    const tdb = el('td');
    tdb.append(el('span', 'tag', r.bundle));
    tr.append(tdb, el('td', '', r.code), el('td', '', r.reason), el('td', '', r.detail));
    t.append(tr);
  });
  $('aiBox').hidden = true;
}

// 로컬 폴백: 서버(AI)가 없거나 실패하면 규칙으로 묶어 보여 준다.
function localSummary(items) {
  const byReason = {};
  items.forEach((i) => { (byReason[i.reason] = byReason[i.reason] || []).push(i.code); });
  return Object.entries(byReason).map(([r, codes]) => `• ${r}: ${codes.join(', ')}`).join('\n');
}

async function aiSummarize() {
  const items = visibleItems().map(({ id, code, reason, detail }) => ({ id, code, reason, detail }));
  const box = $('aiBox');
  const btn = $('aiBtn');
  if (!items.length) return;
  btn.disabled = true;
  box.hidden = false;
  box.textContent = '정리 중…';
  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    box.textContent = data.text;
    box.append(el('span', 'src', 'AI 가 정리한 문장입니다. 이름을 가린 코드 목록만 보냈습니다.'));
  } catch (e) {
    box.textContent = localSummary(items);
    box.append(el('span', 'src', 'AI 서버에 연결하지 못해 규칙으로 묶은 요약을 보여 줍니다(AI 키는 서버 환경 변수에만 둡니다).'));
  } finally {
    btn.disabled = false;
  }
}

(async function main() {
  try {
    await load();
  } catch (e) {
    document.querySelector('main').textContent = '결과 파일(data/out)을 읽지 못했습니다. 서버로 열어 주세요: ' + e.message;
    return;
  }
  collectReview();
  renderTiles();
  renderCards();
  renderFilter();
  renderReview();
  $('aiBtn').addEventListener('click', aiSummarize);
})();
