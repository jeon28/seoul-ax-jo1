// 스페셜화물 승인 보조 화면: 승인 요청(DG · OOG · Flexibag)의 첨부 서류를 필수 서류표 · 서류 간 대조 · 규정 단계로 점검해
//   승인 · 확인 필요 · 거절 세 줄로 나누고, 카드를 누르면 점검표와 회신 초안을 보여 준다.
//   점검은 rules.js(= lib/special-cargo-rules.md 「승인 보조」), 초안 문구는 drafts.js, 자료는 data/in/special-cargo-approval/.
//   메일을 보내거나 Outlook 에 저장하는 기능은 만들지 않았다: 초안은 화면에서 고치고 「복사」해 Outlook 에 붙여 넣는다(발송은 사람).
import { el, tableEl } from '../core.js';
import { compileLists } from '../dgdesk/rules.js';
import { buildCtx, cleanRequests, checkAll, STATUS, LANE, KIND } from './rules.js';
import { DRAFT_LABEL, HOLD_MARK, draftTabs, draftText } from './drafts.js';

const DIR = '../data/in/special-cargo-approval/';
const URLS = {
  requests: `${DIR}requests.json`,
  required: `${DIR}required-docs.json`,
  limits: `${DIR}limits.json`,
  cas: `${DIR}cas-lists.json`,
  imdg: `${DIR}imdg-sample.json`,
  lists: '../data/in/special-cargo-rules/prohibit-lists.json',
};

const TONE = { ok: 'ok', hold: 'warn', bad: 'bad' };
const LANES = [
  { status: 'ok', sub: '가능', empty: '승인할 요청이 없습니다.' },
  { status: 'hold', sub: '서류·내용 확인', empty: '확인이 필요한 요청이 없습니다.' },
  { status: 'bad', sub: '규정 위반', empty: '규정에 걸린 요청이 없습니다.' },
];
const STEP_TONE = { ok: 'ok', hold: 'warn', bad: 'bad', na: '' };
const STEP_WORD = { ok: '통과', hold: '확인', bad: '위반', na: '해당 없음' };
const z = (x) => String(x).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url.split('/').pop()}: HTTP ${r.status}`);
  return JSON.parse(await r.text());
}
// 필수가 아닌 자료(CAS 목록 · IMDG 표)는 못 읽어도 점검을 계속한다. 그 단계가 「직접 확인」이 된다
const getOptional = async (url) => { try { return await getJson(url); } catch (e) { return null; } };

export function approvalDesk() {
  let phase = 'loading'; // loading → ready | error
  let ctx = null;
  let items = [];
  let counts = { ok: 0, hold: 0, bad: 0 };
  let kinds = { missing: 0, conflict: 0, violation: 0, unsure: 0 };
  let skipped = 0;
  let loadedAt = '';
  let snapshotAt = '';
  let error = '';
  let missingData = []; // 못 읽은 선택 자료 이름
  let busy = false;

  const root = el('div', 'dgdesk');
  const bar = el('section', 'glass stockbar');
  const status = el('div', 'stockstatus');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const reloadBtn = el('button', 'btn primary', '다시 점검');
  reloadBtn.type = 'button';
  bar.append(status, reloadBtn);
  const rulesBox = el('div', 'dgrules glass');
  const body = el('div', 'dgbody');
  root.append(bar, rulesBox, body);

  function renderBar() {
    reloadBtn.disabled = phase === 'loading';
    reloadBtn.replaceChildren();
    if (phase === 'loading') reloadBtn.append(el('i', 'spin'), document.createTextNode('점검 중…'));
    else reloadBtn.textContent = '다시 점검';
    status.replaceChildren();
    let sub;
    if (phase === 'loading') sub = '요청 자료와 필수 서류표·숫자표를 불러오는 중입니다…';
    else if (phase === 'error') sub = `불러오지 못했습니다: ${error}`;
    else sub = `요청 ${items.length}건 · 처리 시점 ${snapshotAt} · 점검 ${loadedAt}${skipped ? ` · 형식이 맞지 않아 건너뛴 행 ${skipped}개` : ''}${missingData.length ? ` · 못 읽은 자료: ${missingData.join(', ')}` : ''}`;
    status.append(el('b', '', '서류·규정 점검'), el('span', 'sub' + (phase === 'error' ? ' errtext' : ''), sub));
  }

  function renderRules() {
    rulesBox.replaceChildren();
    const add = (strong, text) => {
      const s = el('span');
      s.append(el('b', '', strong), document.createTextNode(` ${text}`));
      rulesBox.append(s);
    };
    add('서류', '필수 서류표로 빠진 것 찾기 → 서류끼리 UN·Class·PG·중량·치수·컨테이너 대조');
    add('DG', 'STEP 0 금지 목록 → 0.5 IMDG 대조(위반이어도 자동 거절 안 함) → 1 상해·닝보 CAS → 2 상해 MSDS 농도');
    add('OOG · Flexibag', '선박별 한도 · 충전량 · COA 연도별 양식');
    add('직접 확인', '못 읽은 값 · IMDG 불일치 · 자료 없음 → 초안을 만들지 않고 사람에게 넘김');
  }

  /** 필수 서류표 · 숫자표를 접어 두고 보여 준다(규칙이 읽는 표를 사람도 같이 본다) */
  function tablesBox() {
    const d = el('details', 'glass panel aptables');
    d.append(el('summary', '', '필수 서류표 · 숫자표 (점검이 읽는 표)'));
    if (!ctx) return d;
    const req = ctx.required.types;
    const t1 = { columns: ['유형', '필수 서류'], rows: Object.keys(req).map((k) => [req[k].label, req[k].docs.map((x) => x.label).join(' · ')]) };
    const lim = ctx.limits;
    const t2 = {
      columns: ['항목', '기준'],
      rows: [
        ['상해 · 닝보 양하/경유', `${lim.ports.sha.aliases.join(' · ')} / ${lim.ports.ngb.aliases.join(' · ')}`],
        ['상해 MSDS 농도', `${lim.dg.sha_msds_conc_pct}% (다르면 ${lim.dg.sha_msds_on_fail === 'bad' ? '불가' : '직접 확인'})`],
        ['OOG 한도(기본, cm · kg)', `높이 ${lim.oog.default.over_h} · 폭 ${lim.oog.default.over_w} · 길이 ${lim.oog.default.over_l} · 중량 ${lim.oog.default.weight.toLocaleString('en-US')}`],
        ...Object.keys(lim.oog.by_vessel || {}).map((v) => [`OOG 한도 ${v}`, `높이 ${lim.oog.by_vessel[v].over_h} · 폭 ${lim.oog.by_vessel[v].over_w} · 길이 ${lim.oog.by_vessel[v].over_l} · 중량 ${lim.oog.by_vessel[v].weight.toLocaleString('en-US')}`]),
        ['Flexibag', `화물 ${lim.flexibag.allowed_cargo_kind.join('·')} · 충전량 ${lim.flexibag.max_fill_kg.toLocaleString('en-US')} kg 이하 · COA 양식 ${Object.entries(lim.flexibag.coa_templates).map(([y, t]) => `${y}년 ${t}`).join(' · ')}`],
      ],
    };
    const w = el('div', 'tablewrap');
    w.append(tableEl(t1, ''), tableEl(t2, ''));
    d.append(w, el('p', 'sub', '표 값은 가상입니다. 바꾸려면 data/in/special-cargo-approval/ 의 required-docs.json · limits.json 만 고치고 「다시 점검」을 누르세요.'));
    return d;
  }

  function kpiTiles() {
    const mk = (rows) => {
      const k = el('div', 'tiles kpis');
      rows.forEach(([lab, v, tone]) => {
        const t = el('div', 'glass tile dgkpi ' + tone);
        t.append(el('div', 'lab', lab), el('div', 'val', String(v)));
        k.append(t);
      });
      return k;
    };
    return [
      mk([['전체 요청', items.length, ''], ['승인 · 가능', counts.ok, 'ok'], ['확인 필요', counts.hold, 'warn'], ['거절 · 불가', counts.bad, 'bad']]),
      mk([['서류 누락', kinds.missing, 'warn'], ['서류 불일치', kinds.conflict, 'warn'], ['규정 위반', kinds.violation, 'bad'], ['직접 확인', kinds.unsure, 'warn']]),
    ];
  }

  function docChips(x) {
    const r = el('div', 'dgrow');
    x.docs.forEach((d) => r.append(el('span', 'apdoc ' + (d.present ? 'ok' : 'bad'), `${d.present ? '✓' : '✗'} ${d.label}`)));
    return r;
  }

  function card(x) {
    const c = el('button', 'dgcard ' + TONE[x.status]);
    c.type = 'button';
    const r1 = el('div', 'dgrow');
    r1.append(el('b', 'dgcode', x.id), el('span', 'tag', x.type), el('span', 'dgun', x.cargoText));
    c.append(r1);
    c.append(el('div', 'dgmeta', `${x.vessel}${x.voyage ? ` / ${x.voyage}` : ''} · ${x.route}`));
    c.append(docChips(x));
    c.append(el('div', 'dgwhy', x.reason));
    const r2 = el('div', 'dgrow');
    x.kinds.forEach((k) => r2.append(el('span', 'badge warn', KIND[k])));
    r2.append(el('span', 'badge ' + (x.draft === 'approve' ? 'ok' : 'warn'), DRAFT_LABEL[x.draft]));
    c.append(r2);
    c.addEventListener('click', () => openSheet(x));
    return c;
  }

  function renderBody() {
    if (phase === 'loading') {
      const p = el('section', 'glass panel stockempty');
      p.append(el('h3', '', '점검 중입니다'), el('p', 'sub', '승인 요청 자료와 필수 서류표·숫자표를 읽고 있습니다.'));
      body.replaceChildren(p);
      return;
    }
    if (phase === 'error' && !items.length) {
      const p = el('section', 'glass panel stockempty');
      p.append(el('h3', '', '점검하지 못했습니다'), el('p', 'sub', '자료 파일(data/in/special-cargo-approval/)을 확인한 뒤 「다시 점검」을 눌러 주세요.'));
      body.replaceChildren(p);
      return;
    }
    const lanes = el('div', 'dglanes');
    LANES.forEach((ln) => {
      const lane = el('section', 'dglane ' + TONE[ln.status]);
      const h = el('h3', 'dglanehead');
      h.append(el('i', 'dgdot'), document.createTextNode(`${LANE[ln.status]} · ${ln.sub}`), el('span', 'dgn', String(counts[ln.status])));
      lane.append(h);
      const list = items.filter((x) => x.status === ln.status);
      if (!list.length) lane.append(el('div', 'dgempty', ln.empty));
      list.forEach((x) => lane.append(card(x)));
      lanes.append(lane);
    });
    body.replaceChildren(...kpiTiles(), lanes, tablesBox());
  }

  // ── 점검표 + 회신 초안 시트 ──
  function openSheet(x) {
    const tabs0 = draftTabs(x);
    const texts = {};
    tabs0.forEach(([k]) => { texts[k] = draftText[k](x); });
    let mode = tabs0.length ? tabs0[0][0] : '';
    const dlg = el('dialog', 'glass sheet');
    const closeSheet = () => { dlg.close(); };
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });

    function draw(msg) {
      dlg.replaceChildren();
      const head = el('div', 'sheethead');
      head.append(el('h3', '', `${x.id} · ${x.type} · ${x.vessel}${x.voyage ? ` / ${x.voyage}` : ''}`));
      const cl = el('button', 'btn ghost', '닫기');
      cl.type = 'button';
      cl.addEventListener('click', closeSheet);
      head.append(cl);
      dlg.append(head, el('span', 'pill ' + TONE[x.status], `${LANE[x.status]} · ${STATUS[x.status]}`));

      const dl = el('dl', 'kv dgkv');
      [['구간', x.route], ['화물', x.cargoText], ['발신처', `${x.sender || '-'} (${x.origin === 'skr_hal' ? 'SKR·흥아 계열' : '파트너'})`], ['접수', x.received || '-'], ['판정 근거', x.reason]].forEach(([k, v]) => dl.append(el('dt', '', k), el('dd', '', v)));
      dlg.append(dl);

      // 점검표 ① 필수 서류
      dlg.append(el('h4', 'apsub', '① 필수 서류'));
      dlg.append(docChips(x));

      // 점검표 ② 서류 간 대조
      dlg.append(el('h4', 'apsub', '② 서류 간 대조'));
      if (!x.conflicts.length) dlg.append(el('p', 'sub', '두 서류 이상에 적힌 칸은 모두 같습니다.'));
      else {
        const w = el('div', 'tablewrap');
        w.append(tableEl({ columns: ['항목', '서류별 값', '결과'], rows: x.conflicts.map((c) => [c.field, c.items.map((i) => `${i.doc} ${i.value}`).join(' / '), '불일치']) }, ''));
        dlg.append(w);
      }

      // 점검표 ③ 규정 단계
      dlg.append(el('h4', 'apsub', '③ 규정 단계'));
      const ol = el('ol', 'apsteps');
      x.steps.filter((s) => s.id !== 'docs' && s.id !== 'cross').forEach((s) => {
        const li = el('li', 'apstep');
        li.append(el('b', '', s.title), el('span', 'pill ' + STEP_TONE[s.result], STEP_WORD[s.result]), el('span', 'sub', s.text));
        ol.append(li);
      });
      dlg.append(ol);

      // 회신 초안
      dlg.append(el('h4', 'apsub', '④ 회신 초안'));
      if (!mode) {
        dlg.append(el('div', 'dgholdbar', '직접 확인이 필요해 초안을 만들지 않았습니다. 위 ③ 에서 「확인」으로 표시된 단계를 원 서류로 확인한 뒤 직접 회신하세요. (애매한 건은 승인 쪽이 아니라 사람 쪽으로 넘깁니다.)'));
        return;
      }
      if (x.status === 'hold') dlg.append(el('div', 'dgholdbar', `${HOLD_MARK} — 서류가 빠졌거나 값이 달라 보완을 요청하는 초안입니다. 승인·거절이 아니니 내용을 확인하고 보내세요.`));
      if (tabs0.length > 1) {
        const tabs = el('div', 'chips dgtabs');
        tabs.setAttribute('role', 'tablist');
        tabs0.forEach(([key, label]) => {
          const b = el('button', 'chip' + (mode === key ? ' on' : ''), label);
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', String(mode === key));
          b.addEventListener('click', () => { texts[mode] = ta.value; mode = key; draw(); });
          tabs.append(b);
        });
        dlg.append(tabs);
      }
      const ta = el('textarea', 'dgtext');
      ta.value = texts[mode];
      ta.setAttribute('aria-label', '회신 초안 본문');
      ta.addEventListener('input', () => { texts[mode] = ta.value; });
      dlg.append(ta);

      dlg.append(el('p', 'sub', '이 화면은 초안 글만 만듭니다. 보내기·Outlook 저장은 없습니다. 「초안 복사」로 복사해 원 메일에 전체 회신(Reply all)으로 붙여 넣고, [대괄호] 자리(선박명·부킹번호·서명)는 직접 채워 보내세요.'));
      const act = el('div', 'dgact');
      const copy = el('button', 'btn primary', '초안 복사');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        const text = x.status === 'hold' ? `${HOLD_MARK}\n\n${ta.value}` : ta.value;
        try {
          await navigator.clipboard.writeText(text);
          draw({ ok: true, text: x.status === 'hold' ? '복사했습니다. 맨 위에 보류 표시를 붙였으니, 보낼 때는 지우세요.' : '복사했습니다.' });
        } catch (e) {
          ta.select();
          draw({ ok: false, text: '자동 복사가 막혔습니다. 본문을 직접 선택해 복사하세요(Ctrl+C).' });
        }
      });
      act.append(copy);
      dlg.append(act);
      if (msg) dlg.append(el('div', 'dgresult ' + (msg.ok ? 'ok' : 'bad'), msg.text));
    }

    draw();
    document.body.append(dlg);
    dlg.showModal();
  }

  // ── 불러오기 → 점검 ──
  async function run() {
    if (busy) return;
    busy = true;
    phase = 'loading';
    renderBar();
    renderBody();
    try {
      const [rawReq, required, limits, rawLists] = await Promise.all([getJson(URLS.requests), getJson(URLS.required), getJson(URLS.limits), getJson(URLS.lists)]);
      const [casRaw, imdgRaw] = await Promise.all([getOptional(URLS.cas), getOptional(URLS.imdg)]);
      missingData = [!casRaw && 'CAS 목록', !imdgRaw && 'IMDG 표'].filter(Boolean);
      ctx = buildCtx({ lists: compileLists(rawLists), required, limits, casRaw, imdgRaw });
      const c = cleanRequests(rawReq.requests);
      if (!c.rows.length) throw new Error('승인 요청 자료가 비었거나 형식이 맞지 않습니다');
      const r = checkAll(ctx, c.rows);
      items = r.items;
      counts = r.count;
      kinds = r.kinds;
      skipped = c.skipped;
      snapshotAt = rawReq.snapshot_at || '-';
      loadedAt = stamp(new Date());
      error = '';
      phase = 'ready';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = items.length ? 'ready' : 'error'; // 실패해도 지난 점검이 있으면 그대로 보여 준다
      if (phase === 'ready') loadedAt = `${loadedAt} (다시 점검 실패: ${error})`;
    }
    busy = false;
    renderRules();
    renderBar();
    renderBody();
  }

  reloadBtn.addEventListener('click', run);
  renderRules();
  run();
  return root;
}
