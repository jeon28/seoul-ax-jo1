// 홈: 맨 위 요약 → 묶음별 에이전트 카드 → 사람 확인 대기(이름 가림) 목록.
import { BUNDLES, $, el, icon, fmt, fmtHours, saving, metricOf, metricTile, tableEl, readDone, writeDone } from './core.js';

const refreshBadges = () => dispatchEvent(new Event('axdash:review'));
const reviewKey = (menu, r) => `${menu.slug}-${r.id}`;

function summaryTiles(ALL) {
  const docs = ALL.map((a) => a.doc);
  const processed = docs.reduce((s, d) => s + metricOf(d, 'processed'), 0);
  const hours = docs.reduce((s, d) => s + saving(d), 0);
  const done = readDone();
  const open = ALL.reduce((s, a) => s + a.doc.review.filter((r) => !done.has(reviewKey(a.menu, r))).length, 0);
  const total = ALL.reduce((s, a) => s + a.doc.review.length, 0);
  const h = fmtHours(hours);
  const tiles = [
    { lab: '에이전트', val: ALL.length, unit: '개', note: `${Object.keys(BUNDLES).length}개 묶음 · 결과 파일 ${ALL.filter((a) => a.raw).length}개 읽음` },
    { lab: '처리 건수', val: processed, unit: '건', note: '결과 파일의 처리 숫자 합계' },
    { lab: '월 절감 시간 (추정)', val: h.hh, unit: '시간', extra: h.mm ? [h.mm, '분'] : null, note: '(전−후)×월 횟수, 조원 추정값 기준' },
    { lab: '사람 확인 대기', val: open, unit: '건', tone: 'warn', note: `전체 ${total}건 중 확인 완료 ${total - open}건`, id: 'tileOpen' },
  ];
  const box = el('div', 'tiles');
  tiles.forEach((t) => {
    const c = el('div', 'glass tile' + (t.tone ? ' ' + t.tone : ''));
    if (t.id) c.id = t.id;
    c.append(el('div', 'lab', t.lab));
    const v = el('div', 'val', fmt(t.val));
    v.append(el('small', '', t.unit));
    if (t.extra) { v.append(document.createTextNode(' ' + t.extra[0]), el('small', '', t.extra[1])); }
    c.append(v, el('div', 'note', t.note));
    box.append(c);
  });
  return box;
}

function sheet(item) {
  const dlg = el('dialog', 'glass sheet');
  const head = el('div', 'sheethead');
  head.append(el('h3', '', `${item.menu.name} · 결과 표`));
  const x = el('button', 'btn ghost', '닫기');
  x.type = 'button';
  const closeSheet = () => { dlg.close(); dlg.remove(); };
  x.addEventListener('click', closeSheet);
  head.append(x);
  const wrap = el('div', 'tablewrap');
  if (item.doc.table.columns.length) wrap.append(tableEl(item.doc.table));
  else wrap.append(el('p', 'sub', '표가 아직 없습니다.'));
  dlg.append(head, el('p', 'sub', `${item.doc.headline || ''}`), wrap);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function agentCard(item) {
  const { menu, doc } = item;
  const b = BUNDLES[menu.bundle];
  const done = readDone();
  const open = doc.review.filter((r) => !done.has(reviewKey(menu, r))).length;
  const card = el('article', 'glass acard');
  card.style.setProperty('--c', b.color);

  const top = el('div', 'atop');
  const ic = el('span', 'aicon');
  ic.append(icon(menu.icon));
  const ttl = el('div', 'atitle');
  ttl.append(el('h3', '', menu.name), el('div', 'who', `${menu.owner} · ${menu.bundle} ${b.name}`));
  top.append(ic, ttl, el('span', 'badge ' + (open ? 'warn' : 'ok'), open ? `확인 ${open}` : item.raw ? '이상 없음' : '결과 없음'));
  card.append(top);

  if (doc.headline) card.append(el('p', 'ahead', doc.headline));
  const ms = el('div', 'mrow');
  doc.metrics.slice(0, 3).forEach((m) => ms.append(metricTile(m)));
  card.append(ms);

  const src = el('div', 'asrc');
  src.append(el('span', 'tag', item.raw ? '결과 파일' : '파일 없음'));
  src.append(document.createTextNode(` ${doc.source.label} · 기준일 ${doc.as_of || '-'} · ${doc.rules_version || '규칙 미정'}${doc.synthetic ? ' · 가상 데이터' : ''}`));
  card.append(src);

  const btns = el('div', 'abtns');
  const open1 = el('a', 'btn primary', '메뉴 열기');
  open1.href = '#/m/' + menu.slug;
  const view1 = el('button', 'btn', '결과 보기');
  view1.type = 'button';
  view1.disabled = !doc.table.columns.length;
  view1.addEventListener('click', () => sheet(item));
  btns.append(open1, view1);
  card.append(btns);
  return card;
}

function bundles(ALL) {
  const box = el('div', 'bundles');
  for (const [key, b] of Object.entries(BUNDLES)) {
    const items = ALL.filter((a) => a.menu.bundle === key);
    if (!items.length) continue;
    const sec = el('section', 'bundle');
    const h = el('div', 'bhead');
    const dot = el('i', 'dot');
    dot.style.background = b.color;
    h.append(dot, el('h3', '', `${key} ${b.name}`), el('span', 'sub', items.map((i) => i.menu.owner).join(' · ')));
    const grid = el('div', 'cards');
    items.forEach((i) => grid.append(agentCard(i)));
    sec.append(h, grid);
    box.append(sec);
  }
  return box;
}

function reviewSection(ALL) {
  const sec = el('section', 'reviewsec');
  sec.id = 'reviewSec';
  const head = el('div', 'rowhead');
  const t = el('h2', '', '사람 확인 대기 ');
  t.append(el('span', 'sub', '이름은 코드로 가린 상태 · 확인한 건은 [확인 완료]'));
  const tools = el('div', 'tools');
  const aiBtn = el('button', 'btn', 'AI 로 문장 정리');
  aiBtn.type = 'button';
  tools.append(aiBtn);
  head.append(t, tools);

  const chips = el('div', 'chips');
  const list = el('div', 'rlist');
  const aiBox = el('div', 'glass aibox');
  aiBox.hidden = true;
  const note = el('p', 'sub', 'AI 에는 선박·컨테이너·화주 같은 이름을 코드(S01·C01·H01)로 바꾼 목록만 보냅니다. 숫자 계산은 규칙이 하고, AI 는 계산하지 않습니다. 보내기(발송) 기능은 없습니다.');

  const owners = [...new Set(ALL.filter((a) => a.doc.review.length).map((a) => a.menu.owner))];
  let who = '';

  const items = () => {
    const done = readDone();
    return ALL.flatMap((a) => a.doc.review.map((r) => ({ a, r, key: reviewKey(a.menu, r), done: done.has(reviewKey(a.menu, r)) })))
      .filter((x) => !who || x.a.menu.owner === who)
      .sort((p, q) => Number(p.done) - Number(q.done));
  };

  const drawChips = () => {
    chips.replaceChildren();
    ['', ...owners].forEach((o) => {
      const c = el('button', 'chip' + (who === o ? ' on' : ''), o || '전체');
      c.type = 'button';
      c.addEventListener('click', () => { who = o; drawChips(); drawList(); });
      chips.append(c);
    });
  };

  const drawList = () => {
    list.replaceChildren();
    aiBox.hidden = true;
    const rows = items();
    if (!rows.length) list.append(el('p', 'sub', '확인할 건이 없습니다.'));
    rows.forEach(({ a, r, key, done }) => {
      const row = el('div', 'glass rrow' + (done ? ' done' : ''));
      row.style.setProperty('--c', BUNDLES[a.menu.bundle].color);
      const tag = el('span', 'tag bundletag', a.menu.bundle);
      const body = el('div', 'rbody');
      const l1 = el('div', 'r1');
      l1.append(el('b', '', r.code), el('span', '', r.reason));
      body.append(l1, el('div', 'r2', r.detail), el('div', 'r3', `${a.menu.name} · ${a.menu.owner}`));
      const btn = el('button', 'btn' + (done ? ' ghost' : ''), done ? '되돌리기' : '확인 완료');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const s = readDone();
        if (s.has(key)) s.delete(key); else s.add(key);
        writeDone(s);
        drawList();
        refreshTile();
        refreshBadges();
      });
      row.append(tag, body, btn);
      list.append(row);
    });
  };

  const refreshTile = () => {
    const d = readDone();
    const total = ALL.reduce((s, a) => s + a.doc.review.length, 0);
    const open = ALL.reduce((s, a) => s + a.doc.review.filter((r) => !d.has(reviewKey(a.menu, r))).length, 0);
    const tile = $('tileOpen');
    if (!tile) return;
    tile.querySelector('.val').firstChild.textContent = fmt(open);
    tile.querySelector('.note').textContent = `전체 ${total}건 중 확인 완료 ${total - open}건`;
  };

  // 로컬 폴백: 서버(AI)가 없거나 실패하면 규칙으로 묶어 보여 준다.
  const localSummary = (rows) => {
    const by = {};
    rows.forEach((i) => { (by[i.reason] = by[i.reason] || []).push(i.code); });
    return Object.entries(by).map(([k, c]) => `• ${k}: ${c.join(', ')}`).join('\n');
  };

  aiBtn.addEventListener('click', async () => {
    const rows = items().filter((x) => !x.done).map(({ r }) => ({ id: r.id, code: r.code, reason: r.reason, detail: r.detail }));
    if (!rows.length) return;
    aiBtn.disabled = true;
    aiBox.hidden = false;
    aiBox.textContent = '정리 중…';
    try {
      const res = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: rows }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      aiBox.textContent = data.text;
      aiBox.append(el('span', 'src', 'AI 가 정리한 문장입니다. 이름을 가린 코드 목록만 보냈습니다.'));
    } catch (e) {
      aiBox.textContent = localSummary(rows);
      aiBox.append(el('span', 'src', 'AI 서버에 연결하지 못해 규칙으로 묶은 요약을 보여 줍니다(AI 키는 서버 환경 변수에만 둡니다).'));
    } finally {
      aiBtn.disabled = false;
    }
  });

  drawChips();
  drawList();
  sec.append(head, chips, list, aiBox, note);
  return sec;
}

export function renderHome(ALL) {
  const page = el('div', 'page');
  const hero = el('header', 'hero');
  const left = el('div');
  const h1 = el('h1', '', '장금상선 AX 대시보드 ');
  h1.append(el('span', 'badge info', '가상 데이터 · 도입판'));
  const asof = ALL.map((a) => a.doc.as_of).filter(Boolean).sort().pop() || '-';
  left.append(h1, el('p', 'sub', `에이전트 ${ALL.length}개 결과 · 5개 묶음 · 기준일 ${asof} · 보내기 기능 없음(초안만, 발송은 사람이)`));
  const right = el('div', 'heroact');
  const first = el('button', 'btn primary', '오늘 먼저 볼 것');
  first.type = 'button';
  first.addEventListener('click', () => $('reviewSec').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  right.append(first);
  hero.append(left, right);

  const flow = el('p', 'flow sub', '메뉴 12개 = 에이전트 12개 · 엑셀 올리기 → 규칙(lib/) 계산(브라우저 안) → 확인 필요만 정리 → 결과 파일(data/out) 저장');
  page.append(hero, summaryTiles(ALL), flow, bundles(ALL), reviewSection(ALL));
  return page;
}
