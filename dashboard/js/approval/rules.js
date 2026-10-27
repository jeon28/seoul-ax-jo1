// 스페셜화물 승인 보조 규칙(= lib/special-cargo-rules.md 의 「승인 보조」 장). 순수 함수만 있어 브라우저와 node 에서 같은 코드가 돈다.
//   화면: dashboard/js/approval/board.js · 결과 파일: scripts/build-special-cargo-approval-result.mjs · 테스트: scripts/test-special-cargo-approval.mjs
// 숫자(한도·농도·충전량)와 서류표는 data/in/special-cargo-approval/ 의 표에서 읽는다. 바꾸면 RULES_VERSION 을 올린다.
// AI 는 판정하지 않는다. 확신이 낮은 건(못 읽음 · IMDG 불일치 · 자료 없음)은 맞다고 하지 않고 「직접 확인」으로 넘기고 초안을 만들지 않는다.
import { judgeRequest as judgeProhibit, normUn, normClass } from '../dgdesk/rules.js';

export const RULES_VERSION = 'special-cargo-approval@v1';

// 내부 상태 ok · hold · bad → 결과 파일 3분류(가능 · 확인 필요 · 불가) / 화면 줄(승인 · 확인 필요 · 거절)
export const STATUS = { ok: '가능', hold: '확인 필요', bad: '불가' };
export const LANE = { ok: '승인', hold: '확인 필요', bad: '거절' };

// 확인 사항의 종류. 심한 순서: violation(규정 위반) > unsure(직접 확인) > missing(서류 누락) > conflict(서류 불일치)
export const KIND = {
  violation: '규정 위반',
  unsure: '직접 확인',
  missing: '서류 누락',
  conflict: '서류 불일치',
};
const KIND_ORDER = ['violation', 'unsure', 'missing', 'conflict'];

// ── 표기 통일 (lib/compare.md: UN1263 = 1263, 18,000 KGS = 18000) ──
const UNIT = { kg: { '': 1, kg: 1, kgs: 1, t: 1000, mt: 1000 }, cm: { '': 1, cm: 1, mm: 0.1, m: 100 }, pct: { '': 1, '%': 1 } };

/** "18,000 KGS" → 18000 · "1 m" → 100 · "400 mm" → 40 · "99.5%" → 99.5. 읽지 못하면 null */
export function parseQty(v, kind) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d[\d,]*\.?\d*|\.\d+)\s*([a-z%]*)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const f = UNIT[kind][m[2]];
  return Number.isFinite(n) && f !== undefined ? Math.round(n * f * 1000) / 1000 : null;
}

const normPg = (v) => {
  const s = String(v ?? '').replace(/^\s*(PG|packing group)\s*/i, '').trim().toUpperCase();
  return ['I', 'II', 'III'].includes(s) ? s : null;
};
/** CAS 번호: "64-17-5" 꼴(숫자 2~7자리 - 2자리 - 1자리) */
export function normCas(v) {
  const s = String(v ?? '').trim();
  return /^\d{2,7}-\d{2}-\d$/.test(s) ? s : null;
}
const normText = (v) => { const s = String(v ?? '').trim().toUpperCase(); return s || null; };

// 서류끼리 맞춰 보는 칸. na: 서류에 「없음」 뜻으로 적는 글자(PG 가 없는 품목 등)
const FIELDS = {
  un: { label: 'UN 번호', en: 'UN number', norm: normUn },
  cls: { label: 'Class', en: 'Class', norm: normClass },
  pg: { label: 'PG', en: 'Packing group', norm: normPg, na: ['', '-', 'N/A', 'NA'] },
  weight: { label: '중량', en: 'Weight', norm: (v) => parseQty(v, 'kg'), show: (n) => `${n.toLocaleString('en-US')} kg` },
  container: { label: '컨테이너', en: 'Container', norm: normText },
  over_h: { label: '초과 높이', en: 'Over height', norm: (v) => parseQty(v, 'cm'), show: (n) => `${n} cm` },
  over_w: { label: '초과 폭', en: 'Over width', norm: (v) => parseQty(v, 'cm'), show: (n) => `${n} cm` },
  over_l: { label: '초과 길이', en: 'Over length', norm: (v) => parseQty(v, 'cm'), show: (n) => `${n} cm` },
};

/** 서류 1칸 읽기 → { state: 'absent'(그 서류에 그 칸이 없음) | 'unreadable' | 'ok', value } */
function readField(doc, key) {
  const f = FIELDS[key];
  if (!doc || !(key in doc)) return { state: 'absent' };
  const raw = doc[key];
  if (f.na && f.na.includes(String(raw ?? '').trim().toUpperCase())) return { state: 'absent' };
  const value = f.norm(raw);
  return value === null || value === undefined ? { state: 'unreadable' } : { state: 'ok', value };
}
const showVal = (key, v) => (FIELDS[key].show ? FIELDS[key].show(v) : String(v));

// ── 입력 정리 ──
const TYPES = ['DG', 'OOG', 'FLEXIBAG'];

/** 요청 목록에서 형식이 안 맞는 행을 버리고 개수만 센다 */
export function cleanRequests(raw) {
  const rows = [];
  let skipped = 0;
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  for (const r of Array.isArray(raw) ? raw : []) {
    const ok = r && str(r.id) && TYPES.includes(r.type) && str(r.vessel) && str(r.pod) && r.docs && typeof r.docs === 'object' && (r.origin === 'skr_hal' || r.origin === 'partner');
    if (ok) rows.push({ voyage: '', pol: '', via: [], sender: '', received: '', ...r }); else skipped++;
  }
  return { rows, skipped };
}

export const routeText = (r) => [r.pol, ...(r.via || []), r.pod].filter(Boolean).join(' → ');

/** 양하·경유 항구(출발항 제외)가 상해(sha) · 닝보(ngb) 인지 */
export function portHits(req, limits) {
  const ports = [...(req.via || []), req.pod].map((p) => String(p || '').trim().toUpperCase());
  const hit = (k) => ((limits.ports || {})[k]?.aliases || []).some((a) => ports.includes(a));
  return { sha: hit('sha'), ngb: hit('ngb') };
}

// ── 확인 1건 ──
/**
 * 요청 1건을 점검한다.
 * ctx = { lists(금지 리스트, compileLists 결과), required(필수 서류표), limits(숫자표), cas(CAS 목록 또는 null), imdg(IMDG 표 또는 null) }
 * 돌려주는 값: { status, draft, docs, conflicts, steps, findings, cargos, cargoText, docText, reason }
 *   draft: 'approve'(승인 초안) · 'reject'(거절 초안) · 'supplement'(보완 요청 초안) · 'none'(직접 확인: 초안 없음)
 */
export function checkRequest(ctx, req) {
  const findings = [];
  const add = (step, kind, ko, en = '') => findings.push({ step, kind, ko, en });
  const spec = ctx.required.types[req.type];
  const docs = req.docs || {};
  const steps = [];
  const stepOf = (id, title, text, na = false) => steps.push({ id, title, text, na });

  // 1) 필수 서류
  const checklist = spec.docs.map((d) => ({ key: d.key, label: d.label, en: d.en, present: !!docs[d.key] }));
  checklist.filter((d) => !d.present).forEach((d) => add('docs', 'missing', `필수 서류 누락: ${d.label}`, `${d.en} is missing`));
  stepOf('docs', '필수 서류', `${spec.docs.length}종 중 ${checklist.filter((d) => d.present).length}종 있음`);

  // 2) 서류 간 대조: 둘 이상의 서류에 있는 칸은 값이 같아야 한다
  const conflicts = [];
  const names = Object.fromEntries(spec.docs.map((d) => [d.key, d.label]));
  Object.keys(FIELDS).forEach((key) => {
    const seen = [];
    for (const d of spec.docs) {
      if (!docs[d.key]) continue;
      const r = readField(docs[d.key], key);
      if (r.state === 'unreadable') add('cross', 'unsure', `${d.label} 의 ${FIELDS[key].label} 를 읽지 못함`, `${FIELDS[key].en} in the ${d.en} is not readable`);
      else if (r.state === 'ok') seen.push({ doc: d.label, docEn: d.en, value: r.value });
    }
    if (new Set(seen.map((s) => s.value)).size > 1) {
      conflicts.push({ field: FIELDS[key].label, items: seen.map((s) => ({ doc: s.doc, value: showVal(key, s.value) })) });
      add('cross', 'conflict', `${FIELDS[key].label} 불일치: ${seen.map((s) => `${s.doc} ${showVal(key, s.value)}`).join(' / ')}`, `${FIELDS[key].en} differs between documents (${seen.map((s) => `${s.docEn}: ${showVal(key, s.value)}`).join(' / ')})`);
    }
  });
  stepOf('cross', '서류 간 대조', conflicts.length ? `불일치 ${conflicts.length}칸` : '맞음');

  // 서류들에서 한 칸의 값을 모은다(앞 서류가 우선). 한도 검사는 서류에 적힌 값 중 가장 큰 값 기준(보수적)
  const values = (key) => spec.docs.map((d) => readField(docs[d.key], key)).filter((r) => r.state === 'ok').map((r) => r.value);
  const first = (key) => values(key)[0] ?? null;

  let cargos = [];
  let cargoText = '';
  if (req.type === 'DG') ({ cargos, cargoText } = checkDg(ctx, req, docs, add, stepOf, first));
  else if (req.type === 'OOG') cargoText = checkOog(ctx, req, add, stepOf, values);
  else cargoText = checkFlexibag(ctx, req, docs, add, stepOf, values);

  // 단계별 결과: 그 단계의 확인 사항 중 가장 심한 것
  steps.forEach((s) => {
    const k = KIND_ORDER.find((kind) => findings.some((f) => f.step === s.id && f.kind === kind));
    s.kind = k || null;
    s.result = s.na ? 'na' : k === 'violation' ? 'bad' : k ? 'hold' : 'ok';
    s.findings = findings.filter((f) => f.step === s.id);
  });

  const kinds = new Set(findings.map((f) => f.kind));
  const status = kinds.has('violation') ? 'bad' : kinds.size ? 'hold' : 'ok';
  const draft = status === 'ok' ? 'approve' : status === 'bad' ? 'reject' : kinds.has('unsure') ? 'none' : 'supplement';
  const missing = checklist.filter((d) => !d.present).map((d) => d.label);
  const docText = missing.length ? `누락(${missing.join('·')})` : conflicts.length ? `불일치(${conflicts.map((c) => c.field).join('·')})` : '완비';
  const top = KIND_ORDER.map((k) => findings.find((f) => f.kind === k)).find(Boolean);
  const reason = top ? top.ko + (findings.length > 1 ? ` 외 ${findings.length - 1}건` : '') : '서류 완비 · 규정 통과';
  return { status, draft, kinds: KIND_ORDER.filter((k) => kinds.has(k)), docs: checklist, missing, conflicts, steps, findings, cargos, cargoText, docText, reason };
}

// ── DG: 금지 목록 → IMDG → 상해·닝보 CAS → 상해 MSDS 농도 ──
function checkDg(ctx, req, docs, add, stepOf, first) {
  const un = first('un');
  const cls = first('cls');
  const pg = first('pg');
  const cargoText = `Class ${cls ?? '?'} / UN ${un ?? '?'}${pg ? ` PG ${pg}` : ''}`;
  let cargos = [];

  // STEP 0 금지 목록(이병선 판정 규칙 그대로): 불가 = 규정 위반, 보류 = 조건 확인(직접 확인)
  if (!un || !cls) {
    add('S0', 'unsure', `UN 번호·Class 를 읽지 못해 금지 목록을 볼 수 없음`, 'UN number / class is not readable');
    stepOf('S0', 'STEP 0 금지 목록', '화물 값을 읽지 못함');
  } else {
    const j = judgeProhibit(ctx.lists, { origin: req.origin, cargos: [{ un, cls }] });
    cargos = j.cargos;
    if (j.status === 'bad') add('S0', 'violation', `금지 목록 해당: ${j.reason}`, `UN ${un} is listed in our Prohibited DG List (${j.listName})`);
    else if (j.status === 'hold') add('S0', 'unsure', `금지 목록 조건 확인 필요: ${j.reason}`, '');
    stepOf('S0', 'STEP 0 금지 목록', `${j.listName}: ${j.status === 'ok' ? '해당 없음' : j.reason}`);
  }

  // STEP 0.5 IMDG 대조: 위반이 보여도 자동 거절하지 않고 직접 확인으로 넘긴다
  if (!ctx.imdg) {
    add('S0.5', 'unsure', 'IMDG 자료가 없어 대조하지 못함(DG 는 모두 직접 확인)', '');
    stepOf('S0.5', 'STEP 0.5 IMDG 대조', 'IMDG 자료 없음');
  } else if (!un) {
    stepOf('S0.5', 'STEP 0.5 IMDG 대조', 'UN 번호를 읽지 못해 건너뜀');
  } else {
    const e = ctx.imdg.get(un);
    if (!e) {
      add('S0.5', 'unsure', `IMDG 자료에 UN ${un} 없음`, '');
      stepOf('S0.5', 'STEP 0.5 IMDG 대조', `UN ${un} 없음`);
    } else {
      const diffs = [];
      if (cls && e.cls !== cls) diffs.push(`Class ${e.cls}(신청 ${cls})`);
      if (pg && e.pg !== '-' && e.pg !== pg) diffs.push(`PG ${e.pg}(신청 ${pg})`);
      if (diffs.length) add('S0.5', 'unsure', `IMDG 와 다름: ${diffs.join(', ')} — 자동 거절하지 않음`, '');
      stepOf('S0.5', 'STEP 0.5 IMDG 대조', diffs.length ? `IMDG 와 다름: ${diffs.join(', ')}` : `IMDG 와 같음 (Class ${e.cls}${e.pg !== '-' ? ` PG ${e.pg}` : ''})`);
    }
  }

  // STEP 1 / 2: 상해 · 닝보 양하/경유
  const hits = portHits(req, ctx.limits);
  const msds = docs.msds;
  const casRaw = msds && 'cas' in msds ? normCas(msds.cas) : undefined; // undefined: MSDS 에 CAS 칸이 없음, null: 읽지 못함
  const ports = ['sha', 'ngb'].filter((k) => hits[k]);
  if (!ports.length) {
    stepOf('S1', 'STEP 1 상해·닝보 CAS', '상해·닝보 양하/경유 아님 — 해당 없음', true);
  } else if (!msds) {
    add('S1', 'unsure', 'MSDS 가 없어 CAS 를 확인하지 못함(상해·닝보 양하/경유)', '');
    stepOf('S1', 'STEP 1 상해·닝보 CAS', 'MSDS 없음');
  } else if (!casRaw) {
    add('S1', 'unsure', `MSDS 의 CAS 번호를 ${casRaw === undefined ? '찾지 못함' : '읽지 못함'}(상해·닝보 양하/경유)`, '');
    stepOf('S1', 'STEP 1 상해·닝보 CAS', 'CAS 를 읽지 못함');
  } else if (!ctx.cas) {
    add('S1', 'unsure', 'CAS 금지 목록이 없어 대조하지 못함', '');
    stepOf('S1', 'STEP 1 상해·닝보 CAS', 'CAS 목록 없음');
  } else {
    const label = (k) => ctx.limits.ports[k].label;
    const hit = ports.filter((k) => ctx.cas[k] && ctx.cas[k].has(casRaw));
    if (hit.length) {
      const sev = ctx.limits.dg.cas_on_match === 'bad' ? 'violation' : 'unsure';
      add('S1', sev, `${hit.map(label).join('·')} CAS 금지 목록 해당 (CAS ${casRaw})`, `CAS ${casRaw} is not accepted for ${hit.map((k) => ctx.limits.ports[k].en || k.toUpperCase()).join('/')} discharge or transit`);
    }
    stepOf('S1', 'STEP 1 상해·닝보 CAS', hit.length ? `CAS ${casRaw}: ${hit.map(label).join('·')} 금지 목록 해당` : `CAS ${casRaw}: 금지 목록에 없음`);
  }

  if (!hits.sha) {
    stepOf('S2', 'STEP 2 상해 MSDS 농도', '상해 양하/경유 아님 — 해당 없음', true);
  } else if (!msds) {
    add('S2', 'unsure', 'MSDS 가 없어 농도를 확인하지 못함(상해 양하/경유)', '');
    stepOf('S2', 'STEP 2 상해 MSDS 농도', 'MSDS 없음');
  } else {
    const need = ctx.limits.dg.sha_msds_conc_pct;
    const conc = 'conc' in msds ? parseQty(msds.conc, 'pct') : null;
    if (conc === null) {
      add('S2', 'unsure', `MSDS 농도를 ${'conc' in msds ? '읽지 못함' : '찾지 못함'}(상해 양하/경유, 기준 ${need}%)`, '');
      stepOf('S2', 'STEP 2 상해 MSDS 농도', '농도를 읽지 못함');
    } else {
      if (conc !== need) {
        const sev = ctx.limits.dg.sha_msds_on_fail === 'bad' ? 'violation' : 'unsure';
        add('S2', sev, `상해 양하/경유 MSDS 농도 ${conc}% (기준 ${need}%)`, `MSDS concentration is ${conc}%; ${need}% is required for Shanghai discharge or transit`);
      }
      stepOf('S2', 'STEP 2 상해 MSDS 농도', `MSDS 농도 ${conc}% (기준 ${need}%)${conc === need ? '' : ' — 다름'}`);
    }
  }
  return { cargos, cargoText };
}

// ── OOG: 선박별 한도 ──
function checkOog(ctx, req, add, stepOf, values) {
  const lim = { ...ctx.limits.oog.default, ...((ctx.limits.oog.by_vessel || {})[req.vessel] || {}) };
  const rows = [['over_h', '초과 높이', 'cm'], ['over_w', '초과 폭', 'cm'], ['over_l', '초과 길이', 'cm'], ['weight', '중량', 'kg']];
  const enLabel = (key) => FIELDS[key].en;
  const parts = [];
  const got = {};
  rows.forEach(([key, label, unit]) => {
    const vs = values(key);
    if (!vs.length) {
      add('oog', 'unsure', `${label} 를 읽지 못함 — 한도 확인 불가`, '');
      parts.push(`${label} 읽지 못함`);
      return;
    }
    const v = Math.max(...vs); // 서류에 적힌 값 중 가장 큰 값
    got[key] = v;
    if (v > lim[key]) {
      add('oog', 'violation', `${label} ${v.toLocaleString('en-US')} ${unit} 가 ${req.vessel} 한도 ${lim[key].toLocaleString('en-US')} ${unit} 초과`, `${enLabel(key)} ${v.toLocaleString('en-US')} ${unit} exceeds our limit of ${lim[key].toLocaleString('en-US')} ${unit} for this vessel`);
      parts.push(`${label} ${v}>${lim[key]}`);
    }
  });
  stepOf('oog', 'OOG 한도', parts.length ? parts.join(', ') : `${req.vessel} 한도 안`);
  const q = (k) => (got[k] === undefined ? '?' : got[k].toLocaleString('en-US'));
  return `초과 H${q('over_h')} W${q('over_w')} L${q('over_l')} cm · ${q('weight')} kg`;
}

// ── Flexibag: 화물 종류 · 충전량 · COA 연도별 양식 ──
function checkFlexibag(ctx, req, docs, add, stepOf, values) {
  const fb = ctx.limits.flexibag;
  const kind = String(docs.application?.cargo_kind ?? '').trim().toUpperCase();
  const w = values('weight');
  const fill = w.length ? Math.max(...w) : null;
  const parts = [];
  if (!kind) { add('flexi', 'unsure', '화물 종류(NON-DG 등)를 읽지 못함', ''); parts.push('화물 종류 읽지 못함'); }
  else if (!fb.allowed_cargo_kind.includes(kind)) { add('flexi', 'violation', `Flexibag 불가 화물 종류: ${kind}`, `${kind} cargo is not accepted in Flexibag`); parts.push(`화물 종류 ${kind}`); }
  if (fill === null) { add('flexi', 'unsure', '충전량(중량)을 읽지 못함', ''); parts.push('충전량 읽지 못함'); }
  else if (fill > fb.max_fill_kg) { add('flexi', 'violation', `충전량 ${fill.toLocaleString('en-US')} kg 가 한도 ${fb.max_fill_kg.toLocaleString('en-US')} kg 초과`, `Filling weight ${fill.toLocaleString('en-US')} kg exceeds the maximum of ${fb.max_fill_kg.toLocaleString('en-US')} kg`); parts.push(`충전량 ${fill}>${fb.max_fill_kg}`); }
  stepOf('flexi', 'Flexibag 화물·충전량', parts.length ? parts.join(', ') : `${kind} · 충전량 ${fill.toLocaleString('en-US')} kg (한도 ${fb.max_fill_kg.toLocaleString('en-US')} kg)`);

  // COA: 인증서의 연도에 맞는 양식인지. 연도 양식 표에 없으면 직접 확인, 양식이 다르면 보완 요청
  const coa = docs.coa;
  if (coa) {
    const year = String(coa.year ?? '').trim();
    const tmpl = String(coa.template ?? '').trim();
    const expect = fb.coa_templates[year];
    if (!/^\d{4}$/.test(year)) add('coa', 'unsure', 'COA 인증서의 연도를 읽지 못함', '');
    else if (!expect) add('coa', 'unsure', `COA ${year}년 양식이 양식표에 없음`, '');
    else if (tmpl !== expect) add('coa', 'conflict', `COA 양식이 ${year}년 양식(${expect})과 다름: ${tmpl || '양식 표기 없음'}`, `The COA certificate does not follow the ${year} template (${expect})`);
    stepOf('coa', 'COA 연도별 양식', !/^\d{4}$/.test(year) ? '연도를 읽지 못함' : !expect ? `${year}년 양식 없음` : tmpl === expect ? `${year}년 양식(${expect})과 같음` : `${year}년 양식(${expect})과 다름`);
  } else {
    stepOf('coa', 'COA 연도별 양식', 'COA 없음', true);
  }
  return `${kind || '?'} · 충전량 ${fill === null ? '?' : fill.toLocaleString('en-US')} kg`;
}

/** 자료 파일 → 점검용 ctx. cas · imdg 는 없어도(null) 점검은 계속하고 그 단계는 「직접 확인」이 된다 */
export function buildCtx({ lists, required, limits, casRaw, imdgRaw }) {
  const cas = casRaw ? { sha: new Set((casRaw.sha || []).map((c) => c.cas)), ngb: new Set((casRaw.ngb || []).map((c) => c.cas)) } : null;
  const imdg = imdgRaw ? new Map((imdgRaw.entries || []).map((e) => [e.un, e])) : null;
  return { lists, required, limits, cas, imdg };
}

/** 요청 전체 점검 + 3분류 건수 + 확인 종류별 건수 */
export function checkAll(ctx, requests) {
  const items = requests.map((r) => ({ ...r, route: routeText(r), ...checkRequest(ctx, r) }));
  const count = { ok: 0, hold: 0, bad: 0 };
  const kinds = { missing: 0, conflict: 0, violation: 0, unsure: 0 };
  items.forEach((x) => { count[x.status] += 1; x.kinds.forEach((k) => { kinds[k] += 1; }); });
  return { items, count, kinds };
}
