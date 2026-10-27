// DG 승인 데스크: DG Application 신청을 금지 리스트로 판정해 승인 · 보류 · 거절 세 줄로 나누고, 카드를 누르면 회신 초안을 보여 준다.
//   공유본(DG_승인_데스크_발표용_공유본.html)의 시스템을 옮겨 온 것. 판정은 rules.js, 초안 문구는 drafts.js, 자료는 data/in/special-cargo-rules/.
//   메일을 보내거나 Outlook 에 저장하는 기능은 만들지 않았다: 초안은 화면에서 고치고 「복사」해 Outlook 에 붙여 넣는다(발송은 사람).
import { el } from '../core.js';
import { compileLists, cleanRequests, cleanAccidents, judgeAll, accidentText, ACCIDENT_MONTHS, STATUS } from './rules.js';
import { approveText, rejectText, HOLD_MARK } from './drafts.js';

const LISTS_URL = '../data/in/special-cargo-rules/prohibit-lists.json';
const REQUESTS_URL = '../data/in/special-cargo-rules/requests.json';
const ACCIDENTS_URL = '../data/in/special-cargo-rules/accident-cases.json';

const TONE = { ok: 'ok', hold: 'warn', bad: 'bad' };
const LANES = [
  { status: 'ok', title: '승인', sub: '가능', empty: '승인할 신청이 없습니다.' },
  { status: 'hold', title: '보류', sub: '검토 필요', empty: '확인이 필요한 신청이 없습니다.' },
  { status: 'bad', title: '거절', sub: '불가', empty: '금지 리스트에 걸린 신청이 없습니다.' },
];
const z = (x) => String(x).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url.split('/').pop()}: HTTP ${r.status}`);
  return JSON.parse(await r.text());
}

/** UN 번호 칩: 마름모 안에 Class, 옆에 UN 번호 */
function unChip(c) {
  const u = el('span', 'dgun');
  const d = el('span', 'dgcls');
  d.append(el('i', '', c.cls || '?'));
  u.append(d, document.createTextNode(` UN ${c.un || '-'}`));
  return u;
}

function draftLabel(x) {
  return x.status === 'hold' ? '승인안 · 거절안 초안' : x.status === 'bad' ? '거절 초안' : '승인 초안';
}

export function dgDesk() {
  let phase = 'loading'; // loading → ready | error
  let lists = null;
  let items = [];
  let counts = { ok: 0, hold: 0, bad: 0 };
  let skipped = 0;
  let loadedAt = '';
  let snapshotAt = '';
  let error = '';
  let accidentCases = 0; // 읽은 사고 사례 수. null = 사고 사례 표를 못 읽음("없음"이 아니라 "조회 불가")
  let busy = false;

  const root = el('div', 'dgdesk');
  const bar = el('section', 'glass stockbar');
  const status = el('div', 'stockstatus');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const reloadBtn = el('button', 'btn primary', '다시 판정');
  reloadBtn.type = 'button';
  bar.append(status, reloadBtn);
  const rulesBox = el('div', 'dgrules glass');
  const body = el('div', 'dgbody');
  root.append(bar, rulesBox, body);

  function renderBar() {
    reloadBtn.disabled = phase === 'loading';
    reloadBtn.replaceChildren();
    if (phase === 'loading') reloadBtn.append(el('i', 'spin'), document.createTextNode('판정 중…'));
    else reloadBtn.textContent = '다시 판정';
    status.replaceChildren();
    let sub;
    if (phase === 'loading') sub = '금지 리스트와 신청 자료를 불러오는 중입니다…';
    else if (phase === 'error') sub = `불러오지 못했습니다: ${error}`;
    else sub = `신청 ${items.length}건 · 처리 시점 ${snapshotAt} · 판정 ${loadedAt}${accidentCases === null ? ' · 사고 사례 표를 읽지 못함' : ` · 사고 사례 ${accidentCases}건`}${skipped ? ` · 형식이 맞지 않아 건너뛴 행 ${skipped}개` : ''}`;
    status.append(el('b', '', '금지 리스트 판정'), el('span', 'sub' + (phase === 'error' ? ' errtext' : ''), sub));
  }

  function renderRules() {
    rulesBox.replaceChildren();
    const add = (strong, text) => {
      const s = el('span');
      s.append(el('b', '', strong), document.createTextNode(` ${text}`));
      rulesBox.append(s);
    };
    add('SKR · 흥아(HAS/HAL) 발신', '→ Prohibit List VER.11 (SKR HAL ONLY)');
    add('그 외 파트너 발신', '→ VER.10 (FOR PARTNERS)');
    add('보류', '= ISO 탱크·선박·컨테이너 조건부 품목, 또는 UN·Class 를 못 읽은 건 → 승인안 + 거절안 둘 다 작성');
    if (phase === 'ready' && accidentCases === null) add('사고 이력', '조회 불가 — 사고 사례 표를 읽지 못했습니다. 승인 전에 담당자가 따로 확인하세요.');
    else add('사고 이력', `같은 UN 번호의 최근 ${ACCIDENT_MONTHS}개월 사고를 카드에 붙여 보여 줍니다(판정은 바꾸지 않고, 있으면 확인 필요로 올립니다).`);
  }

  function kpiTiles() {
    const k = el('div', 'tiles kpis');
    [['전체 신청', items.length, ''], ['승인 · 가능', counts.ok, 'ok'], ['보류 · 검토 필요', counts.hold, 'warn'], ['거절 · 불가', counts.bad, 'bad']].forEach(([lab, v, tone]) => {
      const t = el('div', 'glass tile dgkpi ' + tone);
      t.append(el('div', 'lab', lab), el('div', 'val', String(v)));
      k.append(t);
    });
    return k;
  }

  function card(x) {
    const c = el('button', 'dgcard ' + TONE[x.status]);
    c.type = 'button';
    const r1 = el('div', 'dgrow');
    r1.append(el('b', 'dgcode', x.id), el('span', 'tag', x.svc || x.folder));
    x.cargos.forEach((cg) => r1.append(unChip(cg)));
    c.append(r1);
    c.append(el('div', 'dgmeta', `${x.vessel}${x.voyage ? ` / ${x.voyage}` : ''}${x.note ? ` (${x.note})` : ''} · ${x.route}`));
    c.append(el('div', 'dgmeta', `${x.sender || '-'} · ${x.received}`));
    c.append(el('div', 'dgwhy', x.reason));
    const r2 = el('div', 'dgrow');
    r2.append(el('span', 'tag', x.listName));
    if (!x.accident) r2.append(el('span', 'badge warn', '사고 이력 조회 불가'));
    else if (x.accident.recent.length) r2.append(el('span', 'badge warn', `최근 사고 ${x.accident.recent.length}건`));
    r2.append(el('span', 'badge ' + (x.status === 'hold' ? 'warn' : x.status === 'ok' ? 'ok' : 'warn'), draftLabel(x)));
    c.append(r2);
    c.addEventListener('click', () => openSheet(x));
    return c;
  }

  function renderBody() {
    if (phase === 'loading') {
      const p = el('section', 'glass panel stockempty');
      p.append(el('h3', '', '판정 중입니다'), el('p', 'sub', '금지 리스트(VER.10 · VER.11)와 신청 자료를 읽고 있습니다.'));
      body.replaceChildren(p);
      return;
    }
    if (phase === 'error' && !items.length) {
      const p = el('section', 'glass panel stockempty');
      p.append(el('h3', '', '판정하지 못했습니다'), el('p', 'sub', '자료 파일(data/in/special-cargo-rules/)을 확인한 뒤 「다시 판정」을 눌러 주세요.'));
      body.replaceChildren(p);
      return;
    }
    const lanes = el('div', 'dglanes');
    LANES.forEach((ln) => {
      const lane = el('section', 'dglane ' + TONE[ln.status]);
      const h = el('h3', 'dglanehead');
      h.append(el('i', 'dgdot'), document.createTextNode(`${ln.title} · ${ln.sub}`), el('span', 'dgn', String(counts[ln.status])));
      lane.append(h);
      const list = items.filter((x) => x.status === ln.status);
      if (!list.length) lane.append(el('div', 'dgempty', ln.empty));
      list.forEach((x) => lane.append(card(x)));
      lanes.append(lane);
    });
    body.replaceChildren(kpiTiles(), lanes);
  }

  // ── 회신 초안 시트 ──
  function openSheet(x) {
    const texts = { approve: approveText(x), reject: rejectText(x) };
    let mode = x.status === 'bad' ? 'reject' : 'approve';
    const dlg = el('dialog', 'glass sheet');
    const closeSheet = () => { dlg.close(); };
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(); });

    function draw(msg) {
      dlg.replaceChildren();
      const head = el('div', 'sheethead');
      head.append(el('h3', '', `${x.id} · ${x.vessel}${x.voyage ? ` / ${x.voyage}` : ''}`));
      const cl = el('button', 'btn ghost', '닫기');
      cl.type = 'button';
      cl.addEventListener('click', closeSheet);
      head.append(cl);
      dlg.append(head, el('span', 'pill ' + TONE[x.status], `${{ ok: '승인', hold: '보류', bad: '거절' }[x.status]} · ${STATUS[x.status]}`));

      const dl = el('dl', 'kv dgkv');
      [['구간', x.route], ['화물', x.cargos.map((c) => `Class ${c.cls} / UN ${c.un}`).join(', ')], ['발신처', `${x.sender || '-'} (${x.origin === 'skr_hal' ? 'SKR·흥아 계열' : '파트너'})`], ['적용 리스트', x.listName], ['판정 근거', x.reason], ['사고 이력', accidentText(x.accident)], ['폴더 · 접수', `${x.folder || '-'} · ${x.received}`]].forEach(([k, v]) => {
        dl.append(el('dt', '', k), el('dd', '', v));
        if (k === '사고 이력') (x.accident ? x.accident.recent : []).forEach((a) => dl.append(el('dt', '', `└ ${a.date}`), el('dd', '', `${a.id} · UN ${a.un} Class ${a.cls || '-'} · ${a.type} · 출처 ${a.source || '-'}`)));
      });
      dlg.append(dl);
      if (x.accident && x.accident.recent.length) dlg.append(el('div', 'dgholdbar', '같은 UN 번호의 최근 사고 이력이 있습니다. 판정은 그대로이지만 승인 전에 담당자가 확인하세요. (사고 이력은 내부 참고용이라 회신 초안에는 넣지 않았습니다.)'));

      if (x.status === 'hold') dlg.append(el('div', 'dgholdbar', `${HOLD_MARK} — 조건을 확인한 뒤 승인안 또는 거절안 중 하나를 쓰세요.`));

      const tabs = el('div', 'chips dgtabs');
      tabs.setAttribute('role', 'tablist');
      const opts = x.status === 'hold' ? [['approve', '승인안'], ['reject', '거절안']] : x.status === 'bad' ? [['reject', '거절 회신'], ['approve', '승인으로 바꾸기']] : [['approve', '승인 회신'], ['reject', '거절로 바꾸기']];
      opts.forEach(([key, label]) => {
        const b = el('button', 'chip' + (mode === key ? ' on' : ''), label);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(mode === key));
        b.addEventListener('click', () => { texts[mode] = ta.value; mode = key; draw(); });
        tabs.append(b);
      });
      dlg.append(tabs);

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

  // ── 불러오기 → 판정 ──
  async function run() {
    if (busy) return;
    busy = true;
    phase = 'loading';
    renderBar();
    renderBody();
    try {
      const [rawLists, rawReq] = await Promise.all([getJson(LISTS_URL), getJson(REQUESTS_URL)]);
      let acc = null; // 사고 사례 표를 못 읽어도 금지 리스트 판정은 계속한다. 이 경우 "사고 없음"이 아니라 "조회 불가"로 표시
      try { acc = cleanAccidents((await getJson(ACCIDENTS_URL)).cases); } catch (e) { acc = null; }
      lists = compileLists(rawLists);
      const c = cleanRequests(rawReq.requests);
      if (!c.rows.length) throw new Error('신청 자료가 비었거나 형식이 맞지 않습니다');
      const snapshotDay = (rawReq.snapshot_at || '').slice(0, 10);
      const r = judgeAll(lists, c.rows, acc && snapshotDay ? { accidents: acc.rows, asOf: snapshotDay } : {});
      accidentCases = acc && snapshotDay ? acc.rows.length : null;
      items = r.items;
      counts = r.count;
      skipped = c.skipped;
      snapshotAt = rawReq.snapshot_at || '-';
      loadedAt = stamp(new Date());
      error = '';
      phase = 'ready';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = items.length ? 'ready' : 'error'; // 실패해도 지난 판정이 있으면 그대로 보여 준다
      if (phase === 'ready') loadedAt = `${loadedAt} (다시 판정 실패: ${error})`;
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
