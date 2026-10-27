// 일본 공이송 플래너 실행 화면. 입력 CSV 3종(+원본 합계)을 고르거나 가상 샘플을 불러와 「이송안 만들기」를 누르면
// planner.js(입력 정리 → 이송 후보 계산 → 검증·보고)가 브라우저 안에서 계산한다. 파일은 서버로 보내지 않는다.
// 이송안은 초안이다. 메일·알림 발송 기능은 없다(초안 글만 보여 주고 발송은 사람이 한다).
import { el, tableEl } from '../core.js';
import { decodeBytes, parseCsv, runPlanner, InputError, toCsv, PLAN_COLS, FLAG_COLS, KIND_LABEL } from './planner.js';

const BASE = '../data/in/japan-empty-transfer/';
const TEU_URL = '../agents/japan-empty-transfer/config/type_teu.csv';
// type_teu.csv 를 못 읽을 때만 쓰는 같은 값(담당자 확인 값). 바꿀 때는 csv 를 고치고 여기도 맞춘다.
const TEU_FALLBACK = 'type,teu,priority,special,name\n22GP,1,1,N,20DC\n42GP,2,2,N,40DC\n45GP,2,3,N,40HC(40HQ)\n22RE,1,4,Y,20RF\n45RE,2,5,Y,40HC RF\n22UT,1,6,Y,20OT\n42UT,2,7,Y,40OT\n22PC,1,8,Y,20FR\n42PC,2,9,Y,40FR\n';

const SAMPLES = [
  { id: 'sim2', label: '정상 시나리오 (sim2)', note: '최종 시나리오. 검증 통과가 나와야 한다', files: { balance: 'sim2/inventory.csv', schedule: 'sim2/schedule.csv', space: 'sim2/space.csv', source: 'sim2/source_totals.csv' }, queried: '2026-10-27 10:30' },
  { id: 'sim-bad', label: '합계 오류 시험', note: '원본 합계의 45GP 를 일부러 틀리게 적음 → 검증 실패가 나와야 한다', files: { balance: 'sim/보유현황.csv', schedule: 'sim/모선스케줄.csv', space: 'sim/잔여스페이스.csv', source: 'sim/원본합계.csv' }, queried: '2026-10-27 10:30' },
  { id: 'sim-cutoff', label: 'Cut-off 누락 시험', note: 'TOKYO Cut-off 를 일부러 비움 → TOKYO 선적 이송은 배정 제외', files: { balance: 'sim/보유현황.csv', schedule: 'sim/모선스케줄_TOKYO마감누락.csv', space: 'sim/잔여스페이스.csv' }, queried: '2026-10-27 10:30' },
];
const SLOTS = [
  ['balance', '① 포트·타입별 보유/필요', true],
  ['schedule', '② 모선 기항 순서 (ETD · Cut-off)', true],
  ['space', '③ 모선 잔여 스페이스 (TEU)', true],
  ['source', '④ 원본 합계 (선택: type,onhand,required)', false],
];

const CSS = `
.jp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-bottom:12px}
.jp-slot{border:1px dashed var(--hair);border-radius:14px;padding:10px 12px;background:var(--glass-lo);display:flex;flex-direction:column;gap:6px;min-width:0}
.jp-slot.on{border-style:solid;border-color:color-mix(in srgb,var(--ok) 45%,transparent)}
.jp-slot b{font-size:13px}.jp-slot .sub{font-size:12px;overflow-wrap:anywhere}
.jp-slot input[type=file]{font:500 12px var(--font);color:var(--sub);max-width:100%}
.jp-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.jp-row .lab{font-size:12.5px;color:var(--sub);font-weight:600}
.jp-run{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.jp-run input[type=text]{appearance:none;font:500 13.5px var(--font);color:var(--ink);background:var(--tilebg);border:1px solid var(--stroke);border-radius:99px;padding:8px 14px;min-width:190px}
.jp-banner{border-radius:14px;padding:12px 16px;font-weight:650;font-size:14px;border:1px solid transparent}
.jp-banner.ok{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok);border-color:color-mix(in srgb,var(--ok) 28%,transparent)}
.jp-banner.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad);border-color:color-mix(in srgb,var(--bad) 30%,transparent)}
.jp-banner.warn{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 30%,transparent)}
.jp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.jp-step{border:1px solid var(--hair);border-radius:14px;padding:10px 12px;background:var(--glass-lo);font-size:13px;display:flex;flex-direction:column;gap:4px}
.jp-step ul{margin:2px 0 0;padding-left:18px;color:var(--sub);font-size:12.5px;line-height:1.55}
.jp-out{display:flex;flex-direction:column;gap:16px;margin-top:16px}
.jp-out h3{font-size:15px;margin:0 0 8px;letter-spacing:-.01em}
.jp-out .tablewrap{max-height:360px;overflow:auto}
.jp-check td,.jp-check th{padding:6px 10px;text-align:left;font-size:13px;border-bottom:1px solid var(--hair);vertical-align:top}
.jp-list{margin:0;padding-left:20px;line-height:1.75;font-size:13.5px}
.jp-err{white-space:pre-wrap}
`;

const str = (v) => (v == null ? '' : String(v));

async function fetchBytes(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} 를 읽지 못했습니다 (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
const sampleUrl = (p) => BASE + p.split('/').map(encodeURIComponent).join('/');

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: `${type};charset=utf-8` }));
  const a = el('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function plannerBoard() {
  if (!document.getElementById('jp-style')) {
    const st = el('style');
    st.id = 'jp-style';
    st.textContent = CSS;
    document.head.append(st);
  }

  const inputs = {}; // 슬롯 -> { name, text }
  const root = el('div', 'glass panel');
  const slotEls = {};
  const out = el('div', 'jp-out');
  out.hidden = true;

  // 1) 샘플 불러오기
  const sampleRow = el('div', 'jp-row');
  sampleRow.append(el('span', 'lab', '가상 샘플 불러오기'));
  const sampleNote = el('p', 'sub', '파일을 직접 고르거나, 샘플로 바로 돌려 볼 수 있습니다. 모든 샘플은 가상 데이터입니다.');
  SAMPLES.forEach((s) => {
    const b = el('button', 'btn', s.label);
    b.type = 'button';
    b.title = s.note;
    b.addEventListener('click', () => loadSample(s));
    sampleRow.append(b);
  });

  // 2) 입력 파일 칸
  const grid = el('div', 'jp-grid');
  SLOTS.forEach(([key, title, required]) => {
    const box = el('label', 'jp-slot');
    const status = el('span', 'sub', required ? '아직 없음 (CSV)' : '없으면 합계 대조는 「확인 필요」로 남음');
    const inp = el('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        set(key, f.name, decodeBytes(new Uint8Array(await f.arrayBuffer())));
      } catch (e) {
        status.textContent = `읽지 못함: ${e.message}`;
      }
    });
    box.append(el('b', '', title), inp, status);
    slotEls[key] = { box, status, inp };
    grid.append(box);
  });

  // 3) 조회 시각 · 실행
  const queried = el('input');
  queried.type = 'text';
  queried.placeholder = '조회 시각 예: 2026-10-27 10:30';
  queried.setAttribute('aria-label', '데이터 조회 시각');
  const now = el('button', 'btn ghost', '지금 시각');
  now.type = 'button';
  now.addEventListener('click', () => {
    const d = new Date();
    const z = (x) => String(x).padStart(2, '0');
    queried.value = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  });
  const run = el('button', 'btn primary', '이송안 만들기');
  run.type = 'button';
  run.disabled = true;
  run.addEventListener('click', () => execute());
  const clear = el('button', 'btn ghost', '비우기');
  clear.type = 'button';
  clear.addEventListener('click', reset);
  const runRow = el('div', 'jp-run');
  runRow.append(queried, now, run, clear);
  const hint = el('p', 'sub', '조회 시각은 시스템에서 파일을 내려받은 시각입니다. 비우면 보고서에 「미입력(확인 필요)」으로 남습니다.');

  root.append(sampleRow, sampleNote, grid, runRow, hint, out);

  function refresh() {
    run.disabled = !(inputs.balance && inputs.schedule && inputs.space);
    for (const [key] of SLOTS) {
      const s = slotEls[key];
      const v = inputs[key];
      s.box.classList.toggle('on', !!v);
      if (v) s.status.textContent = `${v.name} · ${Math.max(parseCsv(v.text).length - 1, 0)}행`;
    }
  }
  function set(key, name, text) {
    inputs[key] = { name, text };
    out.hidden = true;
    refresh();
  }
  function reset() {
    Object.keys(inputs).forEach((k) => delete inputs[k]);
    SLOTS.forEach(([k, , req]) => { slotEls[k].inp.value = ''; slotEls[k].status.textContent = req ? '아직 없음 (CSV)' : '없으면 합계 대조는 「확인 필요」로 남음'; });
    queried.value = '';
    out.hidden = true;
    refresh();
  }
  async function loadSample(s) {
    try {
      for (const [key] of SLOTS) { delete inputs[key]; slotEls[key].inp.value = ''; }
      for (const [key, p] of Object.entries(s.files)) set(key, p.split('/').pop(), decodeBytes(await fetchBytes(sampleUrl(p))));
      refresh();
      queried.value = s.queried;
      execute();
    } catch (e) {
      showError(`샘플을 불러오지 못했습니다: ${e.message}`);
    }
  }

  function showError(msg) {
    out.replaceChildren();
    const b = el('div', 'jp-banner bad jp-err', msg);
    out.append(b);
    out.hidden = false;
  }

  async function teuText() {
    try {
      return decodeBytes(await fetchBytes(TEU_URL));
    } catch {
      return TEU_FALLBACK;
    }
  }

  async function execute() {
    let res;
    try {
      res = runPlanner({
        raw: { balance: parseCsv(inputs.balance.text), schedule: parseCsv(inputs.schedule.text), space: parseCsv(inputs.space.text) },
        teuText: await teuText(),
        sourceText: inputs.source ? inputs.source.text : null,
        queriedAt: queried.value.trim(),
      });
    } catch (e) {
      if (e instanceof InputError) showError(`입력을 확인해 주세요 (맞다고 처리하지 않고 멈췄습니다)\n${e.message}`);
      else showError(`계산 중 오류: ${e.message}`);
      return;
    }
    draw(res);
  }

  function draw(res) {
    const { normalized, plan, flags, spaceEvents, check } = res;
    out.replaceChildren();

    const real = flags.filter((f) => f.flag !== 'SURPLUS_LEFT');
    const left = flags.filter((f) => f.flag === 'SURPLUS_LEFT');
    const teuSum = plan.reduce((a, r) => a + Number(r.teu), 0);
    const boxSum = plan.reduce((a, r) => a + r.qty, 0);

    // 검증 배너
    const banner = el('div', 'jp-banner ' + (!check.passed ? 'bad' : check.hasUnknown ? 'warn' : 'ok'));
    banner.textContent = !check.passed
      ? '⚠ 수량 검증 실패 — 이 이송안은 사용하지 마세요. 아래 「수량 검증」에서 실패 항목을 확인하세요.'
      : `수량 검증 ${check.hasUnknown ? '통과 (확인 필요 항목 있음)' : '통과'} · 이송안 ${plan.length}건 (${boxSum}개 · ${teuSum} TEU) · 예외 플래그 ${real.length}건 · 초안이며 확정은 사람이 합니다`;
    out.append(banner);

    // 스킬 3단계
    const steps = el('div', 'jp-steps');
    const step = (no, name, tone, lines) => {
      const s = el('div', 'jp-step');
      const h = el('div');
      h.append(el('b', '', `${no}. ${name} `), el('span', 'badge ' + tone, tone === 'ok' ? '완료' : tone === 'bad' ? '실패' : '확인 필요'));
      const ul = el('ul');
      lines.forEach((t) => ul.append(el('li', '', t)));
      s.append(h, ul);
      steps.append(s);
    };
    const warns = Object.values(normalized).flatMap((n) => n.warnings.map((w) => `${KIND_LABEL[n.kind]} ${w}`));
    step(1, '입력 정리', warns.length ? 'warn' : 'ok', [
      ...Object.values(normalized).map((n) => `${KIND_LABEL[n.kind]} ${n.rows.length}행`),
      ...normalized.balance.totals.map((t) => `${t.type}: 보유 ${t.onhand} / 필요 ${t.required} / net ${t.net >= 0 ? '+' : ''}${t.net}`),
      ...warns,
    ]);
    step(2, '이송 후보 계산', real.length ? 'warn' : 'ok', [`이송안 ${plan.length}건`, `예외 플래그 ${real.length}건`, `남은 잉여 ${left.length}건`, `스페이스 부족 상세 ${spaceEvents.length}건`]);
    step(3, '검증·보고', !check.passed ? 'bad' : check.hasUnknown ? 'warn' : 'ok', check.results.map((r) => `${r.name}: ${r.status}`));
    out.append(steps);

    // 이송안
    const planBox = el('section');
    planBox.append(el('h3', '', `이송안 (초안) · ${plan.length}건${check.passed ? '' : ' — 검증 실패, 사용 금지'}`));
    const pw = el('div', 'tablewrap');
    if (plan.length) {
      pw.append(tableEl({ columns: ['모선', '항차', '타입', '출발', '도착', '수량(개)', 'TEU', 'ETD', 'Cut-off'], rows: plan.map((r) => [r.vessel, r.voyage, r.type, r.from, r.to, r.qty, Number(r.teu), r.etd || '?', r.cutoff || '?']) }));
    } else pw.append(el('p', 'sub', '이송안이 없습니다. 아래 예외 플래그를 확인하세요.'));
    planBox.append(pw);
    out.append(planBox);

    // 예외 플래그
    const flagBox = el('section');
    const counts = [...real.reduce((m, f) => m.set(f.flag, (m.get(f.flag) ?? 0) + 1), new Map())].map(([k, v]) => `${k} ${v}`).join(' · ');
    flagBox.append(el('h3', '', `예외 플래그 · ${real.length}건${counts ? ` (${counts})` : ''}`));
    if (real.length) {
      const fw = el('div', 'tablewrap');
      fw.append(tableEl({ columns: ['타입', '유형', '대상', '내용'], rows: real.map((f) => [f.type, f.flag, f.target, f.detail]) }));
      flagBox.append(fw);
      flagBox.append(el('p', 'sub', '플래그는 숨기지 않고 사람이 풀어야 할 항목입니다: 다른 모선·타선 사용, 우선순위 조정, 최신 Cut-off 확인, 부산 공급 검토 중에서 사람이 정합니다.'));
    } else flagBox.append(el('p', 'sub', '없음'));
    if (left.length) {
      const d = el('details');
      d.append(el('summary', '', `남은 잉여 ${left.length}건 (정보, 플래그 건수에는 넣지 않음)`));
      const ul = el('ul', 'jp-list');
      left.forEach((f) => ul.append(el('li', '', `${f.type} ${f.target}: ${f.detail}`)));
      d.append(ul);
      flagBox.append(d);
    }
    out.append(flagBox);

    // 수량 검증
    const vBox = el('section');
    vBox.append(el('h3', '', '수량 검증 (입력과 독립적으로 재검산)'));
    const t = el('table', 'jp-check');
    const head = el('tr');
    ['검사', '결과', '상세'].forEach((c) => head.append(el('th', '', c)));
    const tb = el('tbody');
    check.results.forEach((r) => {
      const tr = el('tr');
      const td = el('td');
      td.append(el('span', 'badge ' + (r.ok === null ? 'warn' : r.ok ? 'ok' : 'warn'), r.status));
      if (r.ok === false) td.firstChild.style.cssText = 'background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)';
      tr.append(el('td', '', r.name), td, el('td', '', r.detail));
      tb.append(tr);
    });
    const th = el('thead');
    th.append(head);
    t.append(th, tb);
    const vw = el('div', 'tablewrap');
    vw.append(t);
    vBox.append(vw);
    out.append(vBox);

    // 체크리스트 + 내려받기
    const cBox = el('section');
    cBox.append(el('h3', '', '사람이 원본과 대조할 체크리스트'));
    const ul = el('ul', 'jp-list');
    check.report.split('\n').filter((l) => l.startsWith('- [ ]')).forEach((l) => ul.append(el('li', '', l.replace('- [ ] ', '☐ '))));
    cBox.append(ul);
    const dl = el('div', 'jp-row');
    dl.style.marginTop = '10px';
    const add = (label, fn) => { const b = el('button', 'btn', label); b.type = 'button'; b.addEventListener('click', fn); dl.append(b); };
    add('보고서 내려받기 (report.md)', () => download('report.md', check.report, 'text/markdown'));
    add('이송안 내려받기 (plan.csv)', () => download('plan.csv', toCsv(PLAN_COLS, plan.map((r) => PLAN_COLS.map((c) => str(r[c])))), 'text/csv'));
    add('플래그 내려받기 (flags.csv)', () => download('flags.csv', toCsv(FLAG_COLS, flags.map((r) => FLAG_COLS.map((c) => str(r[c])))), 'text/csv'));
    cBox.append(dl, el('p', 'sub', '대리점 메일은 쓰지도 보내지도 않습니다. 필요하면 초안 글만 사람이 작성·검토 후 발송하세요.'));
    out.append(cBox);
    out.hidden = false;
  }

  return root;
}
