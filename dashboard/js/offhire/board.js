// Off hire 관리 화면: ① 엑셀 올리기 → ② 검산 결과 표 → ③ 협정 대장(Off hire History) → ④ Add off-hire Declaration → ⑤ Claim 문구 초안.
// 계산은 rules.js(규칙), 엑셀 읽기는 xlsx.js. 이 파일은 화면만 만든다.
// 엑셀은 이 브라우저 안에서만 읽는다. 협정 대장·CP 리스트·서명은 이 브라우저(localStorage)에만 저장하고, 결과 파일에는 금액을 넣지 않는다.
// 보내기 기능은 없다: 문구는 화면 글로만 보여 주고 복사 버튼만 둔다.
import { el } from '../core.js';
import * as R from './rules.js';
import { readFirstSheet } from './xlsx.js';

const K_HIST = 'axdash.offhire.history.v1';
const K_CP = 'axdash.offhire.charter.v1';
const K_SIGN = 'axdash.offhire.signature.v1';
const URL_OFFHIRE = '../data/in/offhire/demo-off-hire.xlsx';
const URL_CP = '../data/in/offhire/demo-cp-list.xlsx';
const URL_LEDGER = '../data/in/offhire/ledger-demo.json';
const URL_ROSTER = '../data/in/offhire/charter-vessels.json';
const STATUSES = ['', '청구', '반론', '합의', '정산'];
const NO_ROSTER = '(용선 목록 밖)';

const store = {
  read(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } },
  write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장이 막혀도 화면은 동작 */ } },
  text(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  setText(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
};

// ── 작은 화면 조각 ──
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
  options.forEach(([v, label]) => { const o = el('option', '', label); o.value = v; s.append(o); });
  if (value !== undefined) s.value = value;
  return s;
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
const fetchBuf = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} (${r.status})`); return r.arrayBuffer(); });
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const fromInput = (v) => (v ? v.replace('T', ' ') : '');
const toInput = (t) => (t ? String(t).replace(' ', 'T').slice(0, 16) : '');
const amountNum = (s) => { const t = String(s ?? '').trim(); const n = Number(t.replace(/,/g, '')); return t !== '' && Number.isFinite(n) ? n : null; };
const calcDays = (s, e) => {
  if (!s || !e) return '';
  const d = (Date.parse(`${e}:00Z`) - Date.parse(`${s}:00Z`)) / 86400000;
  return d > 0 ? String(Math.round(d * 10000) / 10000) : '';
};
function copy(textarea, msg) {
  textarea.select();
  const done = () => { msg.textContent = '복사했습니다.'; };
  if (navigator.clipboard) navigator.clipboard.writeText(textarea.value).then(done, () => { document.execCommand('copy'); done(); });
  else { document.execCommand('copy'); done(); }
}

export function offhireBoard() {
  const root = el('div', 'oh');
  let state = null; // { aoa, fileName, out, fresh }
  let hist = store.read(K_HIST, {});
  let charter = store.read(K_CP, { list: {} });
  if (!charter.list) charter = { list: {} };
  let roster = [];
  const saveHist = () => store.write(K_HIST, hist);
  const saveCharter = () => store.write(K_CP, charter);

  // ════════ ① 입력 올리기 ════════
  const inSec = panel('① 입력 올리기');
  const pill = el('span', 'tag', '가상 데이터');
  inSec.h.append(pill);
  const fileIn = mk('input', '', { type: 'file', accept: '.xls,.xlsx', hidden: true });
  const drop = el('label', 'ohdrop');
  drop.append(fileIn, el('b', '', 'Off-hire 엑셀을 끌어 놓거나 눌러서 고르세요'),
    el('span', '', '사내 시스템의 "Off Hire & Vessel\'s UnderPerformance Claim" · 시트 1개 · .xls / .xlsx'));
  const vesselIn = mk('input', 'inp', { maxLength: 4, placeholder: '파일 이름' });
  vesselIn.style.cssText = 'width:90px;text-transform:uppercase';
  const baseIn = mk('input', 'inp', { type: 'date', value: todayKst() });
  const kindSel = selectEl([['가상', '가상'], ['실제', '실제']], '가상');
  const inRow = el('div', 'row');
  inRow.append(drop, field('선박 코드', vesselIn), field('기준일', baseIn), field('자료', kindSel),
    button('샘플로 해 보기', 'ghost', () => loadSample()));
  const msg = el('p', 'sub', '아직 올린 파일이 없습니다.');
  const setMsg = (t, err) => { msg.textContent = t; msg.className = err ? 'err' : 'sub'; };
  inSec.p.append(inRow, msg, note('엑셀은 이 브라우저 안에서만 계산하고 어디로도 보내지 않습니다. 결과 파일에는 금액을 넣지 않습니다. 실제 파일은 이 PC에서만 열고, 배포한 대시보드에 올리려면 입장 비밀번호가 먼저 필요합니다.'));

  // ════════ ② 검산 결과 표 ════════
  const resSec = panel('② 검산 결과 표');
  resSec.p.hidden = true;
  const vesselLabel = el('span', 'sub');
  resSec.h.append(vesselLabel, button('결과 파일 저장 (offhire-ledger.json)', '', () => downloadResult()));
  const chips = el('div', 'ohchips');
  const resWrap = el('div', 'tablewrap');
  resSec.p.append(chips, resWrap, note('빨간 칸 = 기입값이 계산값과 다름(아래 작은 글씨가 계산값) · 노란 칸 = 확인 필요 · 금액 허용 차이 0.05, Days 0.0005일 · 저장한 결과 파일은 금액 없이 선박을 S01 로 가린 꼴입니다.'));

  // ════════ ③ 협정 대장 (Off hire History) ════════
  const histSec = panel('③ 협정 대장 (Off hire History)', '용선 선박별 · 이 브라우저에만 저장 · 결과 파일에는 들어가지 않음');
  const fVessel = selectEl([['', '전체']], '');
  const fStatus = selectEl([['', '전체'], ['__none', '(미입력)'], ['청구', '청구'], ['반론', '반론'], ['합의', '합의'], ['정산', '정산']], '');
  const histCount = el('span', 'sub');
  const histMsg = el('span', 'sub');
  const importBtn = button('', 'ghost', () => importToHist());
  importBtn.hidden = true;
  const histBar = el('div', 'row');
  histBar.append(field('선박', fVessel), field('협정 상태', fStatus), button('필터 지우기', 'ghost', () => { fVessel.value = ''; fStatus.value = ''; renderHist(); }),
    histCount, histMsg, importBtn, button('샘플 대장 불러오기', 'ghost', () => loadSampleLedger()));
  const histBody = el('tbody');
  const histTable = el('table', 'tbl ohhist');
  const hr = el('tr');
  ['선박', '내용', '협정 상태', 'Off hire 기간', 'Port', 'Days', '총금액', ''].forEach((c) => hr.append(el('th', '', c)));
  const hth = el('thead');
  hth.append(hr);
  histTable.append(hth, histBody);
  const histWrap = el('div', 'tablewrap');
  histWrap.append(histTable);
  histSec.p.append(histBar, histWrap, note('칸을 눌러 바로 고칩니다. 기간을 넣으면 Days 가 자동으로 계산됩니다(직접 고칠 수 있음). "올린 파일의 건을 History 에 넣기"는 같은 선박·SEQ·시작일 기록이 있으면 새 값으로 바꾸고, 적어 둔 협정 상태는 그대로 둡니다.'));

  const nameOf = (c) => (roster.find((v) => v[0] === c) || [])[1] || charter.list[c]?.name || NO_ROSTER;
  const vesselList = () => {
    const list = roster.map((v) => v.slice());
    Object.keys(hist).forEach((c) => { if (!list.some((v) => v[0] === c)) list.push([c, nameOf(c)]); });
    return list;
  };

  function renderHist() {
    const keepV = fVessel.value;
    fVessel.replaceChildren(...[['', '전체'], ...vesselList().map(([c, n]) => [c, `${c} · ${n}`])].map(([v, l]) => { const o = el('option', '', l); o.value = v; return o; }));
    fVessel.value = vesselList().some((v) => v[0] === keepV) ? keepV : '';
    const fv = fVessel.value;
    const fs = fStatus.value;
    let shownV = 0;
    let shownE = 0;
    histBody.replaceChildren();
    // 기록이 있는 선박을 위로(같으면 목록 순서 그대로)
    const hasRows = (c) => ((hist[c] || []).length ? 0 : 1);
    vesselList().sort((a, b) => hasRows(a[0]) - hasRows(b[0])).forEach(([code, name]) => {
      if (fv && code !== fv) return;
      // 원래 순번(i)을 지키면서 상태 필터를 적용한다
      const entries = (hist[code] || []).map((e, i) => ({ e, i }))
        .filter((x) => !fs || (fs === '__none' ? !x.e.status : x.e.status === fs));
      if (fs && !entries.length) return;
      shownV++;
      shownE += entries.length;
      let daysSum = 0; let hasDays = false; let amtSum = 0; let hasAmt = false;
      entries.forEach((x) => {
        const d = Number(x.e.days);
        if (x.e.days && Number.isFinite(d)) { daysSum += d; hasDays = true; }
        const a = amountNum(x.e.amount);
        if (a !== null) { amtSum += a; hasAmt = true; }
      });
      const showAdd = !fs; // 상태로 거른 동안에는 새 줄(상태 없음)이 바로 사라지므로 추가 버튼을 숨긴다
      const vcell = el('td', 'ohvessel');
      vcell.rowSpan = entries.length + (showAdd ? 1 : 0);
      vcell.append(el('b', '', code), el('span', 'ohvname', name),
        el('span', 'ohvsum', `${entries.length}건${hasDays ? ` · ${Math.round(daysSum * 10000) / 10000}일` : ''}${hasAmt ? ` · 합계 ${R.money(amtSum)}` : ''}`));
      entries.forEach((x, n) => {
        const e = x.e;
        const tr = el('tr', n === 0 ? 'vstart' : '');
        tr.dataset.v = code;
        tr.dataset.i = String(x.i);
        const cell = (k, cls, props) => { const td = el('td'); td.append(mk('input', `ohin ${cls}`, { value: e[k] || '', ...props })); td.firstChild.dataset.k = k; return td; };
        const status = mk('select', 'ohin status', {});
        STATUSES.forEach((s) => { const o = el('option', '', s || '—'); o.value = s; status.append(o); });
        status.value = e.status || '';
        status.dataset.k = 'status';
        status.dataset.status = e.status || '';
        status.setAttribute('aria-label', '협정 상태');
        const period = el('div', 'ohperiod');
        const pIn = (k, label) => { const i = mk('input', 'ohin', { type: 'datetime-local', value: e[k] || '' }); i.dataset.k = k; i.setAttribute('aria-label', label); return i; };
        period.append(pIn('start', '시작'), document.createTextNode(' ~ '), pIn('end', '종료'));
        const del = mk('button', 'ohdel', { type: 'button' });
        del.textContent = '삭제';
        del.dataset.act = 'del';
        del.setAttribute('aria-label', `${code} 기록 삭제`);
        const tdS = el('td');
        tdS.append(status);
        const tdP = el('td');
        tdP.append(period);
        const tdD = el('td');
        tdD.append(del);
        if (n === 0) tr.append(vcell);
        tr.append(cell('content', 'content', { placeholder: 'Off-hire 내용' }), tdS, tdP,
          cell('port', 'port', { placeholder: 'Port' }), cell('days', 'days', { placeholder: '0', inputMode: 'decimal' }),
          cell('amount', 'amount', { placeholder: '0.00', inputMode: 'decimal' }), tdD);
        histBody.append(tr);
      });
      if (showAdd) {
        const tr = el('tr', entries.length ? '' : 'vstart');
        tr.dataset.v = code;
        if (!entries.length) tr.append(vcell);
        const td = el('td');
        td.colSpan = 7;
        if (!entries.length) td.append(el('span', 'sub', '기록 없음 '));
        const add = mk('button', 'ohadd', { type: 'button' });
        add.textContent = '+ 기록 추가';
        add.dataset.act = 'add';
        td.append(add);
        tr.append(td);
        histBody.append(tr);
      }
    });
    if (!histBody.children.length) {
      const tr = el('tr');
      const td = el('td', 'sub', '조건에 맞는 기록이 없습니다.');
      td.colSpan = 8;
      tr.append(td);
      histBody.append(tr);
    }
    histCount.textContent = `${fv || fs ? '필터 결과: ' : ''}${shownV}척 · ${shownE}건`;
    fillDeclSources();
  }

  fVessel.addEventListener('change', renderHist);
  fStatus.addEventListener('change', renderHist);
  histBody.addEventListener('change', (ev) => {
    const k = ev.target.dataset.k;
    const tr = ev.target.closest('tr');
    if (!k || !tr) return;
    const entry = hist[tr.dataset.v][+tr.dataset.i];
    let val = ev.target.value;
    if (k === 'amount') { const n = amountNum(val); if (n !== null) val = R.money(n); }
    if (k === 'days') entry.daysManual = val !== '';
    entry[k] = val;
    if ((k === 'start' || k === 'end') && !entry.daysManual) entry.days = calcDays(entry.start, entry.end);
    saveHist();
    renderHist();
  });
  histBody.addEventListener('click', (ev) => {
    const act = ev.target.dataset.act;
    const tr = ev.target.closest('tr');
    if (!act || !tr) return;
    const code = tr.dataset.v;
    if (act === 'add') (hist[code] ||= []).push({ status: '' });
    if (act === 'del') {
      if (!confirm(`${code} 기록 한 줄을 지울까요?`)) return;
      hist[code].splice(+tr.dataset.i, 1);
      if (!hist[code].length) delete hist[code];
    }
    saveHist();
    renderHist();
  });

  function importToHist() {
    if (!state?.out) return;
    const code = state.out.vessel;
    const list = (hist[code] ||= []);
    let added = 0;
    let updated = 0;
    state.out.table.forEach((t) => {
      const entry = {
        content: t.remark, status: '', start: toInput(t.start), end: toInput(t.end), port: t.port,
        days: t.v.days === null ? '' : String(t.v.days), daysManual: true, amount: t.v.total === null ? '' : R.money(t.v.total), seq: t.seq,
      };
      const i = list.findIndex((x) => x.seq === t.seq && x.start === entry.start);
      // 다시 넣을 때 History 에 적어 둔 협정 상태는 그대로 둔다
      if (i >= 0) { entry.status = list[i].status || ''; list[i] = entry; updated++; } else { list.push(entry); added++; }
    });
    saveHist();
    renderHist();
    histMsg.textContent = `${code}: ${added}건 추가, ${updated}건 갱신`;
  }

  async function loadSampleLedger() {
    try {
      const j = await fetch(URL_LEDGER).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      let n = 0;
      Object.entries(j.history || {}).forEach(([code, list]) => {
        const mine = (hist[code] ||= []);
        list.forEach((e) => {
          if (mine.some((x) => x.content === e.content && x.start === e.start)) return; // 이미 있으면 건너뜀
          mine.push({ ...e, daysManual: true });
          n++;
        });
      });
      saveHist();
      renderHist();
      histMsg.textContent = n ? `샘플 ${n}건을 넣었습니다.` : '샘플이 이미 들어 있습니다.';
    } catch (e) {
      histMsg.textContent = `샘플 대장을 열지 못했습니다: ${e.message}`;
    }
  }

  // ════════ ④ Add off-hire Declaration ════════
  const declSec = panel('④ Add off-hire Declaration', '화면 글 · 보내기 없음 · CP 리스트와 서명은 이 브라우저에만 저장');
  const cpFile = mk('input', '', { type: 'file', accept: '.xls,.xlsx', hidden: true });
  const cpPick = el('label', 'btn ghost');
  cpPick.append(cpFile, document.createTextNode('CP 리스트 올리기'));
  const cpMsg = el('span', 'sub');
  const declBar = el('div', 'row');
  declBar.append(cpPick, button('샘플 리스트', 'ghost', () => loadSampleCp()), cpMsg);
  const dVessel = selectEl([['', '리스트를 먼저 올려 주세요']], '');
  const dPeriod = mk('input', 'inp', { readOnly: true });
  const dPrevMax = mk('input', 'inp', { type: 'datetime-local' });
  const dTimes = mk('input', 'inp', { type: 'number', min: 0, step: 1 });
  const dSource = selectEl([['', '— 직접 입력 —']], '');
  const dStart = mk('input', 'inp', { type: 'datetime-local' });
  const dStartEvent = mk('input', 'inp', { placeholder: 'Pilot disembarked after cargo operation.' });
  const dEnd = mk('input', 'inp', { type: 'datetime-local' });
  const dEndEvent = mk('input', 'inp', { placeholder: 'Arrival Busan for cargo operation after repair complete.' });
  const dPlace = mk('input', 'inp', { placeholder: 'Ulsan, S.Korea' });
  const dSign = mk('textarea', 'inp', { rows: 3, placeholder: '이름 / 회사 / 부서 / 연락처', value: store.text(K_SIGN) });
  const declGrid = el('div', 'ohgrid');
  declGrid.append(field('선박', dVessel), field('CP 기간', dPeriod), field('현재 Max date (GMT)', dPrevMax), field('이전 추가 횟수', dTimes),
    field('기록에서 불러오기', dSource, 'wide'), field('1) 시작 (GMT)', dStart), field('1) 내용', dStartEvent, 'wide'),
    field('2) 종료 (GMT)', dEnd), field('2) 내용', dEndEvent, 'wide'), field('TTL off-hire 장소', dPlace, 'wide'),
    field('서명 (이 브라우저에만 저장)', dSign, 'wide'));
  const dSum = el('p', 'ohsum');
  const dText = mk('textarea', 'ohtext', { spellcheck: false });
  dText.style.minHeight = '340px';
  const dMsg = el('span', 'sub');
  const dApply = button('Max date 갱신', '', () => applyMaxDate());
  declSec.p.append(declBar, declGrid, dSum, dText, el('div', 'row ohbtns'), note('시각은 모두 GMT 로 보고 계산합니다. 바뀐 Max date = 현재 Max date + TTL off-hire. "Max date 갱신"은 이 브라우저에 저장된 리스트만 바꾸고(추가 횟수 +1) 원본 엑셀은 바꾸지 않습니다. CP 리스트(계약 조건)와 서명은 결과 파일에 들어가지 않습니다.'));
  declSec.p.querySelector('.ohbtns').append(button('문구 복사', 'ghost', () => copy(dText, dMsg)), dApply, dMsg);

  function cpStatus() {
    const n = Object.keys(charter.list).length;
    cpMsg.textContent = n ? `${charter.fileName || '리스트'} · ${n}척${charter.loadedAt ? ` · ${charter.loadedAt} 올림` : ''}`
      : '용선 리스트 엑셀(선박코드 · L열 MIN / MAX · N열 MAX.DATE)을 올려 주세요.';
  }
  // preferFile: 엑셀을 막 올렸으면 그 선박으로 바꾼다. 아니면 지금 고른 선박 → 마지막에 고른 선박 순서로 유지
  function fillDeclVessels(preferFile) {
    const keep = dVessel.value || charter.selected;
    const codes = Object.keys(charter.list).sort();
    dVessel.replaceChildren(...(codes.length ? codes.map((c) => [c, `${c} · ${charter.list[c].name || ''}`]) : [['', '리스트를 먼저 올려 주세요']])
      .map(([v, l]) => { const o = el('option', '', l); o.value = v; return o; }));
    const fileVessel = state?.out && charter.list[state.out.vessel] ? state.out.vessel : '';
    if (preferFile && fileVessel) dVessel.value = fileVessel;
    else if (keep && charter.list[keep]) dVessel.value = keep;
    else if (fileVessel) dVessel.value = fileVessel;
    showVessel();
  }
  function showVessel() {
    const rec = charter.list[dVessel.value];
    dPeriod.value = rec ? (rec.min !== null ? `${rec.min} ~ ${rec.max} months` : rec.minMax) : '';
    dPrevMax.value = rec ? toInput(rec.maxDate) : '';
    dTimes.value = rec ? String(rec.addedTimes || 0) : '';
    fillDeclSources();
    updateDecl();
  }
  // 불러올 수 있는 기록: 이 선박의 협정 대장 + (같은 선박이면) 올린 엑셀의 건
  function fillDeclSources() {
    const code = dVessel.value;
    const keep = dSource.value;
    const opts = [['', '— 직접 입력 —']];
    (hist[code] || []).forEach((e, i) => {
      if (e.start && e.end) opts.push([`h:${i}`, `대장 · ${e.content || '(내용 없음)'} · ${fromInput(e.start)}`]);
    });
    if (state?.out && state.out.vessel === code) {
      state.out.table.forEach((t) => { if (t.start && t.end) opts.push([`f:${t.seq}`, `엑셀 SEQ ${t.seq} · ${t.remark || ''} · ${t.start}`]); });
    }
    dSource.replaceChildren(...opts.map(([v, l]) => { const o = el('option', '', l); o.value = v; return o; }));
    dSource.value = opts.some((o) => o[0] === keep) ? keep : '';
  }
  dSource.addEventListener('change', () => {
    const v = dSource.value;
    const code = dVessel.value;
    if (v.startsWith('h:')) {
      const e = hist[code][+v.slice(2)];
      dStart.value = e.start || '';
      dEnd.value = e.end || '';
      if (e.port && !dPlace.value) dPlace.value = e.port;
    } else if (v.startsWith('f:')) {
      const t = state.out.table.find((x) => x.seq === v.slice(2));
      dStart.value = toInput(t.start);
      dEnd.value = toInput(t.end);
      if (t.port && !dPlace.value) dPlace.value = t.port;
    }
    updateDecl();
  });

  function updateDecl() {
    const rec = charter.list[dVessel.value] || {};
    const d = R.declaration({
      minMax: rec.minMax, min: rec.min, max: rec.max, start: fromInput(dStart.value), end: fromInput(dEnd.value),
      startEvent: dStartEvent.value, endEvent: dEndEvent.value, place: dPlace.value,
      prevMax: fromInput(dPrevMax.value), addedTimes: dTimes.value, signature: dSign.value,
    });
    dText.value = d.text;
    dSum.replaceChildren();
    if (d.duration) {
      dSum.append(document.createTextNode('TTL off-hire '), el('b', '', d.duration.text));
      if (d.revisedMax) dSum.append(document.createTextNode(' → 바뀐 Max date '), el('b', '', `${d.revisedMax} (GMT)`));
    } else dSum.append(el('span', 'sub', '시작·종료 시각을 넣으면 TTL off-hire 와 바뀐 Max date 가 계산됩니다.'));
    dApply.disabled = !d.revisedMax || !charter.list[dVessel.value];
    dApply.dataset.revised = d.revisedMax || '';
  }
  [dPrevMax, dTimes, dStart, dEnd, dStartEvent, dEndEvent, dPlace].forEach((i) => i.addEventListener('input', updateDecl));
  dSign.addEventListener('input', () => { store.setText(K_SIGN, dSign.value); updateDecl(); });
  dVessel.addEventListener('change', () => { charter.selected = dVessel.value; saveCharter(); showVessel(); });

  function applyMaxDate() {
    const code = dVessel.value;
    const rec = charter.list[code];
    const revised = dApply.dataset.revised;
    if (!rec || !revised) return;
    if (!confirm(`${code} Max date 를 ${rec.maxDate} → ${revised} (GMT)로 바꾸고 추가 횟수를 1 올릴까요?\n(이 브라우저의 리스트만 바뀝니다)`)) return;
    rec.maxDate = revised;
    rec.addedTimes = (+dTimes.value || 0) + 1;
    saveCharter();
    showVessel();
    dMsg.textContent = `${code} Max date 를 ${revised} (GMT)로 바꿨습니다.`;
  }

  async function loadCharterBuffer(buf, name) {
    try {
      const list = R.readCharterList(await readFirstSheet(buf));
      if (!Object.keys(list).length) throw new Error('선박코드와 MAX.DATE 가 있는 줄을 찾지 못했습니다.');
      // 같은 선박의 이전 추가 횟수는 남겨 둔다(MAX.DATE 가 같을 때만)
      Object.keys(list).forEach((c) => {
        const old = charter.list[c];
        list[c].addedTimes = old && old.maxDate === list[c].maxDate ? old.addedTimes || 0 : 0;
      });
      charter = { list, fileName: name, loadedAt: todayKst() };
      saveCharter();
      cpStatus();
      fillDeclVessels();
      renderHist();
      dMsg.textContent = '';
    } catch (e) {
      cpMsg.textContent = `리스트를 읽지 못했습니다: ${e.message}`;
    }
  }
  cpFile.addEventListener('change', async () => {
    const f = cpFile.files[0];
    if (!f) return;
    await loadCharterBuffer(await f.arrayBuffer(), f.name);
    cpFile.value = '';
  });
  async function loadSampleCp() {
    try { await loadCharterBuffer(await fetchBuf(URL_CP), 'demo-cp-list.xlsx'); } catch (e) { cpMsg.textContent = `샘플을 열 수 없습니다: ${e.message}`; }
  }

  // ════════ ⑤ Claim 문구 초안 ════════
  const claimSec = panel('⑤ Claim 문구 초안', '화면 글 · 보내기 없음');
  claimSec.p.hidden = true;
  const claimPick = el('select', 'inp');
  const claimMsg = el('span', 'sub');
  const claimText = mk('textarea', 'ohtext', { spellcheck: false });
  const claimRow = el('div', 'row');
  claimRow.append(field('SEQ 고르기', claimPick), button('문구 복사', 'ghost', () => copy(claimText, claimMsg)), claimMsg);
  claimSec.p.append(claimRow, claimText, note('숫자는 엑셀 기입값입니다. 불일치 건은 고친 뒤 쓰고, [C/P clause] 와 시간대는 사람이 채웁니다.'));
  function showClaim() {
    const row = state?.out.table.find((t) => t.seq === claimPick.value);
    claimText.value = row ? R.claimDraft(row, state.out.vessel) : '';
    claimMsg.textContent = '';
  }
  claimPick.addEventListener('change', showClaim);

  // ════════ 입력 처리 · 결과 그리기 ════════
  function tone(v) { return v === '일치' ? 'ok' : v === '불일치' ? 'bad' : 'warn'; }

  function renderResult() {
    const o = state.out;
    const c = R.counts(o.table);
    const real = kindSel.value === '실제';
    pill.textContent = real ? '실제 자료 · 이 PC에서만' : '가상 데이터';
    pill.className = real ? 'tag ohreal' : 'tag';
    vesselLabel.textContent = `선박 ${o.vessel}`;

    chips.replaceChildren();
    [['Off-hire', c.total], ['일치', c.match], ['불일치', c.diff], ['확인 필요', c.check],
      ['합계 행', o.totalsCheck.found ? (o.totalsCheck.diffs.length ? '다름' : '맞음') : '없음']].forEach(([lab, val]) => {
      const chip = el('div', 'ohchip');
      chip.append(el('span', 'lab', lab), el('b', 'val', String(val)));
      chips.append(chip);
    });

    const M = R.money;
    const t = el('table', 'tbl ohmain');
    const hr2 = el('tr');
    ['SEQ', 'Port', 'Voyage', '기간', 'Days', 'Hire', 'ADD.C AMT', 'BRK AMT', 'Hire Total', 'F/O Total', 'D/O Total', 'CEV AMT', 'TOTAL', 'Remark', '판정']
      .forEach((h, i) => hr2.append(el('th', i >= 4 && i <= 12 ? 'num' : '', h)));
    const th2 = el('thead');
    th2.append(hr2);
    const tb = el('tbody');
    o.table.forEach((r) => {
      const bad = {};
      const warn = {};
      r.issues.forEach((i) => { (i.status === '불일치' ? bad : warn)[i.item] = true; });
      const tr = el('tr');
      const mark = (label) => (bad[label] ? ' ohbad' : warn[label] ? ' ohwarn' : '');
      const calcCell = (key, label, isMoney) => {
        const given = r.v[key];
        const calc = r.calc[key];
        const td = el('td', `num${mark(label)}`, given === null ? '-' : isMoney ? M(given) : String(given));
        if (bad[label] && calc !== undefined && calc !== null) td.append(el('span', 'ohcalc', `계산 ${isMoney ? M(calc) : calc}`));
        return td;
      };
      const period = el('td', 'nw');
      period.append(document.createTextNode(`${r.start} ~`), el('br'), document.createTextNode(r.end));
      const verdict = el('td');
      verdict.append(el('span', `pill ${tone(r.verdict)}`, r.verdict));
      tr.append(el('td', 'nw', r.seq), el('td', '', r.port), el('td', '', r.voyage || '-'), period,
        calcCell('days', 'Days', false),
        el('td', `num${warn['Hire(일 용선료)'] ? ' ohwarn' : ''}`, M(r.v.hire)),
        calcCell('addcAmt', 'ADD.C AMT', true), calcCell('brkAmt', 'BRK AMT', true), calcCell('hireTotal', 'Hire Total', true),
        calcCell('foTotal', 'F/O Total', true), calcCell('doTotal', 'D/O Total', true),
        el('td', `num${warn['CEV 일 단가'] ? ' ohwarn' : ''}`, M(r.v.cev)),
        calcCell('total', 'TOTAL', true),
        el('td', warn.Remark ? 'ohwarn' : '', r.remark || '(비어 있음)'), verdict);
      tb.append(tr);
    });
    if (o.totalsCheck.found) {
      const tr = el('tr', 'ohsumrow');
      const td = el('td', '', `합계 행: ${o.totalsCheck.diffs.length ? `${o.totalsCheck.diffs.map((d) => d.label).join(', ')} 이(가) 건별 합과 다름` : '건별 합과 맞음'}`);
      td.colSpan = 15;
      tr.append(td);
      tb.append(tr);
    }
    t.append(th2, tb);
    resWrap.replaceChildren(t);

    const keep = claimPick.value;
    claimPick.replaceChildren(...o.table.map((r) => { const op = el('option', '', `SEQ ${r.seq} · ${r.remark || '사유 없음'} · ${r.verdict}`); op.value = r.seq; return op; }));
    if (keep && o.table.some((r) => r.seq === keep)) claimPick.value = keep;
    showClaim();

    resSec.p.hidden = false;
    claimSec.p.hidden = false;
    importBtn.hidden = false;
    importBtn.textContent = `올린 파일의 ${o.table.length}건을 ${o.vessel} 협정 대장에 넣기`;
    fillDeclVessels(state.fresh);
    state.fresh = false;
    renderHist();
  }

  function compute() {
    if (!state) return;
    try {
      state.out = R.run(state.aoa, { baseDate: baseIn.value, vessel: vesselIn.value, fileName: state.fileName });
      renderResult();
    } catch (e) {
      fail(e);
    }
  }
  function fail(e) {
    state = null;
    resSec.p.hidden = true;
    claimSec.p.hidden = true;
    importBtn.hidden = true;
    setMsg(`읽지 못했습니다: ${e.message}`, true);
  }
  function handleAoa(aoa, fileName) {
    const guessed = R.vesselFromFileName(fileName);
    if (guessed) vesselIn.value = guessed;
    state = { aoa, fileName, fresh: true };
    compute();
    if (state) setMsg(`'${fileName}'을 읽었습니다. 선박 ${state.out.vessel} · 기준일 ${baseIn.value} · ${state.out.table.length}건`);
  }
  async function readFile(f) {
    if (!f) return;
    if (/^DEMO\b/i.test(f.name)) kindSel.value = '가상';
    try { handleAoa(await readFirstSheet(await f.arrayBuffer()), f.name); } catch (e) { fail(e); }
  }
  async function loadSample() {
    try {
      kindSel.value = '가상';
      handleAoa(await readFirstSheet(await fetchBuf(URL_OFFHIRE)), 'DEMO Off hire.xlsx');
    } catch (e) { fail(e); }
  }

  fileIn.addEventListener('change', () => { readFile(fileIn.files[0]); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => readFile(e.dataTransfer.files[0]));
  [baseIn, vesselIn, kindSel].forEach((i) => i.addEventListener('change', compute));

  // 결과 파일(lib/result-shape.md 꼴)을 저장한다. 금액은 넣지 않고 선박은 S01 로 가린다.
  function downloadResult() {
    if (!state?.out) return;
    const real = kindSel.value === '실제';
    const doc = R.buildResult(state.out, {
      baseDate: baseIn.value, ledger: R.ledgerCounts(hist), ledgerRows: Object.values(hist).reduce((n, l) => n + l.length, 0),
      sourceLabel: real ? 'Off-hire 엑셀·협정 대장' : '가상 Off-hire 엑셀·협정 대장', synthetic: !real,
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' }));
    const a = mk('a', '', { href: url, download: 'offhire-ledger.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 처음 그릴 때: 저장된 대장·리스트를 보여 주고, 용선 선박 목록을 읽어 온다
  cpStatus();
  fillDeclVessels(false);
  renderHist();
  fetch(URL_ROSTER).then((r) => (r.ok ? r.json() : { vessels: [] })).then((j) => { roster = j.vessels || []; renderHist(); }).catch(() => {});

  root.append(inSec.p, resSec.p, histSec.p, declSec.p, claimSec.p);
  return root;
}
