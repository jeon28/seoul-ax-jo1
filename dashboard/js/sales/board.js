// 영업실적 분석 화면: ① 엑셀 올리기 → ② 영업 카드 · 월간 실적 보고서 · 방문 목록 · 월별 추이.
// 계산은 rules.js(규칙), 엑셀 읽기는 offhire/xlsx.js(SheetJS, 이 메뉴가 열릴 때만 불러옴). 이 파일은 화면만 만든다.
// 엑셀은 이 브라우저 안에서만 읽고 어디로도 보내지 않는다. 결과 파일에는 화주를 H01 · 항구를 D01/O01 로 가린 숫자만 넣는다.
// 보내기 기능은 없다: 보고 문장은 화면 글로 보여 주고 복사 버튼만 둔다.
import { el } from '../core.js';
import * as R from './rules.js';
import { readFirstSheet } from '../offhire/xlsx.js';

const URL_SAMPLE = '../data/in/sales-analysis/demo-monthly-sales.xlsx';
const TABS = [['card', '영업 카드'], ['report', '월간 실적 보고서'], ['visit', '방문 목록'], ['trend', '월별 추이']];
const NOTE_CLASS = { 신규: 'new', 증가: 'gain', 감소: 'loss', 이탈: 'lost' };

const mk = (tag, cls, props) => Object.assign(el(tag, cls), props || {});
function field(label, input, cls = '') {
  const l = el('label', `field ${cls}`.trim());
  l.append(el('span', '', label), input);
  return l;
}
function button(label, cls, onClick) {
  const b = mk('button', `btn ${cls || ''}`.trim(), { type: 'button' });
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function selectEl(options, value) {
  const s = el('select', 'inp');
  setOptions(s, options, value);
  return s;
}
function setOptions(s, options, value) {
  s.replaceChildren(...options.map(([v, label]) => { const o = el('option', '', label); o.value = v; return o; }));
  if (value !== undefined) s.value = value;
}
function panel(title, sub) {
  const p = el('section', 'glass panel');
  const h = el('div', 'phead');
  h.append(el('h2', '', title));
  if (sub) h.append(el('span', 'sub', sub));
  p.append(h);
  return { p, h };
}
const note = (t) => el('p', 'sub ohnote', t);
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const num = (n) => (n === null || n === undefined ? '확인 필요' : n === 0 ? '-' : R.fmt(n));
function table(heads, cls = '') {
  const t = el('table', `tbl ${cls}`.trim());
  const hr = el('tr');
  heads.forEach((h) => hr.append(typeof h === 'string' ? el('th', '', h) : el('th', h.cls || '', h.text)));
  const th = el('thead');
  th.append(hr);
  const tb = el('tbody');
  t.append(th, tb);
  return { t, tb };
}
function td(text, cls) { return el('td', cls || '', text); }
function wrap(...nodes) { const w = el('div', 'tablewrap'); w.append(...nodes); return w; }
function notePill(n) { return n ? el('span', `pill sanote ${NOTE_CLASS[n]}`, n) : el('span'); }
function copy(textarea, msg) {
  textarea.select();
  const done = () => { msg.textContent = '복사했습니다.'; };
  if (navigator.clipboard) navigator.clipboard.writeText(textarea.value).then(done, () => { document.execCommand('copy'); done(); });
  else { document.execCommand('copy'); done(); }
}

export function salesBoard() {
  const root = el('div', 'sa');
  let state = null; // { parsed, fileName, sample }
  let out = null; // { agg, vl, tr, text }
  let tab = 'card';
  let visitFilter = '';

  // ════════ ① 엑셀 올리기 ════════
  const inSec = panel('① 엑셀 올리기');
  const pill = el('span', 'tag', '가상 데이터');
  inSec.h.append(pill);
  const fileIn = mk('input', '', { type: 'file', accept: '.xls,.xlsx', hidden: true });
  const drop = el('label', 'ohdrop');
  drop.append(fileIn, el('b', '', '월별 거래처 실적 엑셀을 끌어 놓거나 눌러서 고르세요'),
    el('span', '', '건별 한 줄: 월 · 화주 · 구분(수출/수입) · POD/POL · TEU · 시트 1개 · .xls / .xlsx'));
  const monthSel = selectEl([['', '파일을 먼저 올려 주세요']], '');
  const prevSel = selectEl([['', '없음']], '');
  const kindSel = selectEl([['가상', '가상'], ['실제', '실제']], '가상');
  const inRow = el('div', 'row');
  inRow.append(drop, field('이번 달', monthSel), field('전월(비교)', prevSel), field('자료', kindSel), button('샘플로 해 보기', 'ghost', () => loadSample()));
  const msg = el('p', 'sub', '샘플을 불러오는 중입니다…');
  const setMsg = (t, err) => { msg.textContent = t; msg.className = err ? 'err' : 'sub'; };
  inSec.p.append(inRow, msg, note('엑셀은 이 브라우저 안에서만 계산하고 어디로도 보내지 않습니다. 결과 파일에는 화주를 H01, 항구를 D01 · O01 로 가린 숫자만 넣습니다. 실제 파일은 이 PC에서만 열고, 배포한 대시보드에 올리려면 입장 비밀번호가 먼저 필요합니다.'));

  // ════════ ② 결과 ════════
  const resSec = panel('② 월간 거래처 실적');
  resSec.p.hidden = true;
  const checkPill = el('span', 'badge ok', '');
  const saveBtn = button('결과 파일 저장 (pyeongtaek-sales.json)', '', () => downloadResult());
  resSec.h.append(checkPill, saveBtn);
  const tabsBar = el('div', 'chips satabs');
  tabsBar.setAttribute('role', 'tablist');
  const tabBtns = {};
  TABS.forEach(([k, label]) => {
    const b = mk('button', 'chip', { type: 'button' });
    b.textContent = label;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { tab = k; drawTabs(); drawView(); });
    tabBtns[k] = b;
    tabsBar.append(b);
  });
  const issues = el('div', 'saissues');
  const view = el('div', 'saview');
  resSec.p.append(tabsBar, issues, view);

  function drawTabs() {
    Object.entries(tabBtns).forEach(([k, b]) => { b.classList.toggle('on', k === tab); b.setAttribute('aria-selected', String(k === tab)); });
  }

  // ── 영업 카드 ──
  function kpi(label, total, prev) {
    const c = el('div', 'sakpi');
    c.append(el('span', 'lab', label));
    const v = el('div', 'val', R.fmt(total));
    v.append(el('small', '', 'TEU'));
    c.append(v);
    if (prev === null || prev === undefined) c.append(el('div', 'delta eq', '전월 자료 없음'));
    else {
      const d = total - prev;
      c.append(el('div', `delta ${d > 0 ? 'up' : d < 0 ? 'dn' : 'eq'}`, `전월 ${R.fmt(prev)} → ${R.diffText(d)} (${R.rateText(total, prev)})`));
    }
    return c;
  }
  function topList(block) {
    const list = R.topPorts(block);
    const ol = el('ol', 'saports');
    if (!list.length) { ol.append(el('li', 'sub', '자료 없음')); return ol; }
    const max = list[0].total || 1;
    list.forEach((p) => {
      const li = el('li');
      li.append(el('span', '', p.port), el('span', 'saval', `${R.fmt(p.total)} TEU`));
      const bar = el('div', 'sabarline');
      bar.style.width = `${(p.total / max) * 100}%`;
      li.append(bar);
      ol.append(li);
    });
    return ol;
  }
  function cardView() {
    const { agg } = out;
    const box = el('div', 'sacard');
    const tiles = el('div', 'satiles');
    tiles.append(kpi('수출', agg.export.total, agg.export.prev_total), kpi('수입', agg.import.total, agg.import.prev_total),
      kpi('합계', agg.export.total + agg.import.total, agg.hasPrev ? agg.export.prev_total + agg.import.prev_total : null));

    const chg = el('div', 'sacol');
    chg.append(el('h3', '', '화주 변화'));
    if (!agg.hasPrev) chg.append(el('p', 'sub', '전월 자료가 없어 비교하지 못했습니다.'));
    else {
      let any = false;
      for (const b of [agg.export, agg.import]) {
        const c = R.changesOf(b);
        ['신규', '증가', '감소', '이탈'].forEach((n) => {
          if (!c[n].length) return;
          any = true;
          const row = el('div', 'sachg');
          row.append(el('b', '', b.kind));
          const chips = el('div', 'sachips');
          c[n].forEach((name) => chips.append(el('span', `pill sanote ${NOTE_CLASS[n]}`, `${n} ${name}`)));
          row.append(chips);
          chg.append(row);
        });
      }
      if (!any) chg.append(el('p', 'sub', '신규 · 이탈 · 큰 증감 없음'));
    }
    const ex = el('div', 'sacol');
    ex.append(el('h3', '', '수출 도착지 상위 3'), topList(agg.export));
    const im = el('div', 'sacol');
    im.append(el('h3', '', '수입 선적지 상위 3'), topList(agg.import));
    const grid = el('div', 'sagrid');
    grid.append(chg, ex, im);
    box.append(tiles, grid);
    return box;
  }

  // ── 월간 실적 보고서 ──
  function compareCells(tr, hasPrev, total, prev) {
    tr.append(td(num(total), 'num'));
    if (!hasPrev) { for (let i = 0; i < 3; i++) tr.append(td('확인 필요', 'center')); return; }
    tr.append(td(num(prev), 'num'), td(R.diffText(total - prev), 'num'), td(R.rateText(total, prev), 'num'));
  }
  function kindSheet(agg, block) {
    const label = R.PORT_LABEL[block.kind];
    const sheet = el('section', 'sasheet');
    sheet.append(el('div', 'saprinttitle', `평택사무소 ${R.monthName(agg.month)} 월간 거래처 실적 — ${block.kind}`),
      el('h3', '', `${block.kind} 실적 — 화주별 · ${label}별 (단위: TEU)`));
    const { shown, other } = R.portColumns(block);
    const heads = [...shown, ...(other.length ? ['기타'] : [])];
    const cells = (ports) => [...shown.map((p) => ports[p] || 0), ...(other.length ? [other.reduce((s, p) => s + (ports[p] || 0), 0)] : [])];
    const main = table(['화주', ...heads.map((h) => ({ text: h, cls: 'num' })), { text: '이번 달', cls: 'num' }, { text: '전월', cls: 'num' }, { text: '증감', cls: 'num' }, { text: '증감률', cls: 'num' }, '비고'], 'samain');
    const sums = heads.map(() => 0);
    block.list.forEach((s) => {
      const tr = el('tr');
      tr.append(td(s.name));
      cells(s.ports).forEach((n, i) => { sums[i] += n; tr.append(td(num(n), 'num')); });
      compareCells(tr, agg.hasPrev, s.total, s.prev);
      const nt = el('td', 'center');
      nt.append(notePill(s.note));
      tr.append(nt);
      main.tb.append(tr);
    });
    const tot = el('tr', 'satotal');
    tot.append(td('합계'));
    sums.forEach((n) => tot.append(td(num(n), 'num')));
    compareCells(tot, agg.hasPrev, block.total, block.prev_total);
    tot.append(td(''));
    main.tb.append(tot);
    if (!block.list.length) { const tr = el('tr'); const c = td('이 달 자료가 없습니다.', 'sub'); c.colSpan = heads.length + 6; tr.append(c); main.tb.prepend(tr); }
    sheet.append(wrap(main.t));

    sheet.append(el('h4', '', `${label}별 실적`));
    const byPort = table([label, { text: '이번 달', cls: 'num' }, ...(agg.hasPrev ? [{ text: '전월', cls: 'num' }, { text: '증감', cls: 'num' }, { text: '증감률', cls: 'num' }] : []), { text: '비중', cls: 'num' }, { text: '화주 수', cls: 'num' }]);
    block.ports.forEach((p) => {
      const tr = el('tr');
      tr.append(td(p.port), td(num(p.total), 'num'));
      if (agg.hasPrev) tr.append(td(num(p.prev), 'num'), td(R.diffText(p.diff), 'num'), td(R.rateText(p.total, p.prev), 'num'));
      tr.append(td(block.total ? `${((p.total / block.total) * 100).toFixed(1)}%` : '-', 'num'), td(num(p.shippers), 'num'));
      byPort.tb.append(tr);
    });
    const pt = el('tr', 'satotal');
    pt.append(td('합계'), td(num(block.total), 'num'));
    if (agg.hasPrev) pt.append(td(num(block.prev_total), 'num'), td(R.diffText(block.total - block.prev_total), 'num'), td(R.rateText(block.total, block.prev_total), 'num'));
    pt.append(td(block.total ? '100.0%' : '-', 'num'), td(''));
    byPort.tb.append(pt);
    sheet.append(wrap(byPort.t));
    if (!agg.hasPrev) sheet.append(el('p', 'sub', `${label}별 표는 이번 달만 보여 줍니다(전월 자료 없음).`));
    return sheet;
  }
  function printReport() {
    const st = document.createElement('style');
    st.textContent = '@page{size:A4 landscape;margin:10mm}';
    document.head.append(st);
    document.body.classList.add('sa-printing');
    const done = () => { document.body.classList.remove('sa-printing'); st.remove(); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    window.print();
  }
  function reportView() {
    const { agg } = out;
    const box = el('div', 'sareport');
    const head = el('div', 'phead');
    head.append(el('h3', '', `평택사무소 ${R.monthName(agg.month)} 월간 거래처 실적`), button('인쇄 · PDF', '', printReport));
    box.append(head, kindSheet(agg, agg.export), kindSheet(agg, agg.import),
      note('항구가 8곳을 넘으면 위 7곳과 「기타」로 묶습니다. 비고: 전월 대비 5 TEU 이상 늘면 증가, 줄면 감소, 전월 0 이면 신규, 이번 달 0 이면 이탈.'));
    return box;
  }

  // ── 방문 목록 ──
  function visitView() {
    const { vl, agg } = out;
    const box = el('div', 'savisit');
    if (vl.needsPrev) {
      box.append(el('p', 'sub', '전월 자료가 있어야 방문 우선순위를 정할 수 있습니다. 위에서 「전월(비교)」를 고르세요.'));
      return box;
    }
    const filter = selectEl([['', '전체 사유'], ['이탈', '이탈'], ['감소', '큰 폭 감소'], ['신규', '신규'], ['증가', '증가']], visitFilter);
    filter.addEventListener('change', () => { visitFilter = filter.value; drawView(); });
    const bar = el('div', 'row');
    bar.append(field('사유', filter), el('span', 'sub', `전체 ${vl.items.length}곳 · 줄어든 항로 ${vl.routes.length}곳`));
    box.append(bar);
    const items = vl.items.filter((x) => !visitFilter || x.reason === visitFilter);
    const t = table(['순위', '구분', '화주', '사유', { text: '이번 달', cls: 'num' }, { text: '전월', cls: 'num' }, { text: '증감', cls: 'num' }, '한 줄 이유']);
    items.forEach((x) => {
      const tr = el('tr');
      const reason = el('td');
      reason.append(el('span', `pill sanote ${NOTE_CLASS[x.reason]}`, x.reasonLabel));
      tr.append(td(String(x.rank), 'num'), td(x.kind), td(x.shipper), reason, td(num(x.total), 'num'), td(num(x.prev), 'num'), td(R.diffText(x.diff), 'num'), td(x.text, 'satext2'));
      t.tb.append(tr);
    });
    if (!items.length) { const tr = el('tr'); const c = td('해당하는 화주가 없습니다.', 'sub'); c.colSpan = 8; tr.append(c); t.tb.append(tr); }
    box.append(wrap(t.t));

    box.append(el('h4', 'sasub', '물량이 줄어든 항로'));
    if (!vl.routes.length) box.append(el('p', 'sub', `전월보다 ${R.NUMBERS.routeDropTeu} TEU 이상 줄어든 항로가 없습니다.`));
    else {
      const rt = table(['구분', '항구', { text: '이번 달', cls: 'num' }, { text: '전월', cls: 'num' }, { text: '증감', cls: 'num' }, '물량이 줄어든 화주']);
      vl.routes.forEach((r) => {
        const tr = el('tr');
        tr.append(td(`${r.kind} ${r.label}`), td(r.port), td(num(r.total), 'num'), td(num(r.prev), 'num'), td(R.diffText(r.diff), 'num'), td(r.shippers.join(', ') || '-'));
        rt.tb.append(tr);
      });
      box.append(wrap(rt.t));
    }
    box.append(note(`사유 순서: 이탈 → 큰 폭 감소 → 신규 → 증가. 같은 사유 안에서는 이탈은 전월 물량이 큰 순, 감소는 많이 줄어든 순, 신규·증가는 이번 달 물량이 큰 순입니다. ${R.monthName(agg.month)} 기준. 방문 여부와 순서는 소장이 정합니다.`));
    return box;
  }

  // ── 월별 추이 ──
  function trendView() {
    const { tr, text } = out;
    const box = el('div', 'satrend');
    const t = table(['월', { text: '수출', cls: 'num' }, { text: '수입', cls: 'num' }, { text: '합계', cls: 'num' }, { text: '전월 대비', cls: 'num' }, { text: '증감률', cls: 'num' }, { text: '신규', cls: 'num' }, { text: '이탈', cls: 'num' }, '수출 · 수입 비중']);
    const max = Math.max(...tr.map((r) => r.total), 1);
    tr.forEach((r) => {
      const row = el('tr');
      const bar = el('td');
      const b = el('div', 'sastack');
      b.style.width = `${(r.total / max) * 100}%`;
      const e = el('span', 'sa-ex');
      e.style.flexGrow = String(r.export);
      const i = el('span', 'sa-im');
      i.style.flexGrow = String(r.import);
      b.append(e, i);
      bar.append(b);
      row.append(td(R.monthName(r.month)), td(R.fmt(r.export), 'num'), td(R.fmt(r.import), 'num'), td(R.fmt(r.total), 'num'),
        td(r.diff === null ? '-' : R.diffText(r.diff), 'num'), td(r.diff === null ? '-' : r.rate, 'num'),
        td(r.new === null ? '-' : String(r.new), 'num'), td(r.lost === null ? '-' : String(r.lost), 'num'), bar);
      t.tb.append(row);
    });
    box.append(wrap(t.t));
    if (tr.length < 3) box.append(note('엑셀에 월이 더 쌓이면(3개월 이상) 추이가 길어집니다. 지금은 엑셀에 들어 있는 달만 보여 줍니다.'));
    box.append(el('h4', 'sasub', '월간 보고서에 넣을 문장(초안)'));
    const ta = mk('textarea', 'satext', { spellcheck: false, value: text, rows: 14 });
    const cmsg = el('span', 'sub');
    const row = el('div', 'row');
    row.append(button('문장 복사', 'ghost', () => copy(ta, cmsg)), cmsg);
    box.append(ta, row, note('숫자는 위 표와 같은 규칙이 계산한 값입니다. 글은 화면에만 만들고 보내기는 없습니다. 고쳐 쓴 뒤 직접 붙여 넣으세요.'));
    return box;
  }

  function drawView() {
    if (!out) return;
    const fn = { card: cardView, report: reportView, visit: visitView, trend: trendView }[tab];
    view.replaceChildren(fn());
  }

  function drawIssues() {
    const { agg } = out;
    issues.replaceChildren();
    const bad = agg.checks.items.filter((i) => !i.ok);
    checkPill.textContent = bad.length ? `검산 ${bad.length}건 불일치` : '검산 일치';
    checkPill.className = `badge ${bad.length ? 'warn' : 'ok'}`;
    const d = el('details', 'saissue');
    d.append(el('summary', '', `검산 ${agg.checks.items.length}개 · 건너뛴 줄 ${agg.dropped.length}개`));
    const ul = el('ul');
    agg.checks.items.forEach((i) => ul.append(el('li', i.ok ? '' : 'bad', `${i.ok ? '일치' : '불일치'} · ${i.name} — ${i.detail}`)));
    agg.dropped.slice(0, 20).forEach((x) => ul.append(el('li', 'bad', `엑셀 ${x.line}행을 집계에서 뺌 — ${x.why}`)));
    if (agg.dropped.length > 20) ul.append(el('li', 'sub', `…외 ${agg.dropped.length - 20}줄`));
    d.append(ul);
    d.open = bad.length > 0 || agg.dropped.length > 0;
    issues.append(d);
    if (agg.dropped.length) issues.append(el('p', 'sadrop', `읽지 못한 ${agg.dropped.length}줄은 맞다고 처리하지 않고 집계에서 뺐습니다. 엑셀을 고쳐 다시 올리세요.`));
  }

  // ════════ 입력 처리 ════════
  function compute() {
    if (!state) return;
    try {
      const { parsed } = state;
      const agg = R.aggregate(parsed, monthSel.value, prevSel.value || null);
      const vl = R.visitList(agg);
      const tr = R.trend(parsed);
      out = { agg, vl, tr, text: R.reportText(agg, vl) };
      const real = kindSel.value === '실제';
      pill.textContent = real ? '실제 자료 · 이 PC에서만' : '가상 데이터';
      pill.className = real ? 'tag ohreal' : 'tag';
      resSec.p.hidden = false;
      resSec.h.querySelector('h2').textContent = `② ${R.monthName(agg.month)} 월간 거래처 실적`;
      drawIssues();
      drawTabs();
      drawView();
    } catch (e) {
      fail(e);
    }
  }
  function fillMonths() {
    const months = state.parsed.months;
    setOptions(monthSel, months.map((m) => [m, R.monthName(m)]), months[months.length - 1]);
    fillPrev();
  }
  function fillPrev() {
    const months = state.parsed.months.filter((m) => m < monthSel.value);
    setOptions(prevSel, [['', '없음'], ...state.parsed.months.filter((m) => m !== monthSel.value).map((m) => [m, R.monthName(m)])], months[months.length - 1] || '');
  }
  function fail(e) {
    state = null;
    out = null;
    resSec.p.hidden = true;
    setMsg(`읽지 못했습니다: ${e.message}`, true);
  }
  function handleAoa(aoa, fileName, sample) {
    const parsed = R.readSheet(aoa);
    if (!parsed.months.length) throw new Error('읽을 수 있는 건이 없습니다. 월 · 화주 · 구분 · POD/POL · TEU 칸을 확인하세요.');
    state = { parsed, fileName, sample };
    fillMonths();
    compute();
    if (state) setMsg(`'${fileName}'을 읽었습니다. ${R.fmt(parsed.dataRows)}건 · ${parsed.months.map(R.monthName).join(' · ')}${parsed.dropped.length ? ` · 읽지 못한 ${parsed.dropped.length}줄` : ''}`);
  }
  async function readFile(f) {
    if (!f) return;
    kindSel.value = /^DEMO\b/i.test(f.name) ? '가상' : kindSel.value;
    try { handleAoa(await readFirstSheet(await f.arrayBuffer()), f.name, false); } catch (e) { fail(e); }
  }
  async function loadSample() {
    try {
      kindSel.value = '가상';
      const buf = await fetch(URL_SAMPLE).then((r) => { if (!r.ok) throw new Error(`샘플 파일을 열 수 없습니다 (${r.status})`); return r.arrayBuffer(); });
      handleAoa(await readFirstSheet(buf), 'DEMO 월별 거래처 실적.xlsx', true);
    } catch (e) { fail(e); }
  }

  fileIn.addEventListener('change', () => { readFile(fileIn.files[0]); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => readFile(e.dataTransfer.files[0]));
  monthSel.addEventListener('change', () => { fillPrev(); compute(); });
  prevSel.addEventListener('change', compute);
  kindSel.addEventListener('change', compute);

  // 결과 파일(lib/result-shape.md 꼴)을 저장한다. 화주는 H01, 항구는 D01 · O01 로 가린다.
  function downloadResult() {
    if (!out) return;
    const real = kindSel.value === '실제';
    const doc = R.buildResult(out.agg, out.vl, {
      baseDate: todayKst(), rows: state.parsed.dataRows, synthetic: !real, sourceLabel: real ? '월별 실적 엑셀' : '가상 월별 실적 엑셀',
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' }));
    const a = mk('a', '', { href: url, download: 'pyeongtaek-sales.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 처음 그릴 때 샘플을 읽어 바로 보여 준다(엑셀 읽기 도구는 이때 처음 불러옴)
  loadSample();

  root.append(inSec.p, resSec.p);
  return root;
}
