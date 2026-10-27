// DG 승인 데스크 판정 규칙(= lib/special-cargo-rules.md). 순수 함수만 있어 브라우저와 node 에서 같은 코드가 돈다.
//   화면: dashboard/js/dgdesk/board.js · 결과 파일: scripts/build-special-cargo-rules-result.mjs · 테스트: scripts/test-special-cargo-rules.mjs
// 금지 리스트는 data/in/special-cargo-rules/prohibit-lists.json 에서 읽는다. 개정되면 그 파일을 바꾸고 RULES_VERSION 을 올린다.
// AI 는 판정하지 않는다. 판정은 이 규칙이 하고, 확신이 낮은 건(UN·Class 를 못 읽음)은 맞다고 하지 않고 보류로 넘긴다.

export const RULES_VERSION = 'special-cargo-rules@v1';

// 내부 상태 ok · hold · bad → 에이전트 3분류(가능 · 검토 필요 · 불가)
export const STATUS = { ok: '가능', hold: '검토 필요', bad: '불가' };
const RANK = { ok: 0, hold: 1, bad: 2 };
export const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/** 발신처로 적용 리스트를 고른다: SKR·흥아(HAS/HAL) 계열 발신 → VER.11, 그 외 파트너 → VER.10 */
export const listKeyFor = (origin) => (origin === 'skr_hal' ? 'v11' : 'v10');

/** UN 번호 표기 통일(lib/compare.md): "UN1263" · "UN 1263" · " 1263 " → "1263". 4자리 숫자가 아니면 null */
export function normUn(v) {
  const s = String(v ?? '').replace(/^\s*UN\s*/i, '').trim();
  return /^\d{4}$/.test(s) ? s : null;
}
/** Class 표기 통일: "Class 4.1" · "4.1" → "4.1". 1~9 또는 1~9.1~6 꼴이 아니면 null */
export function normClass(v) {
  const s = String(v ?? '').replace(/^\s*class\s*/i, '').trim();
  return /^[1-9](\.[1-6])?$/.test(s) ? s : null;
}

const toMap = (groups, key) => {
  const m = new Map();
  for (const g of groups || []) for (const k of g[key]) m.set(k, g);
  return m;
};

/** 금지 리스트 파일을 판정용으로 바꾼다. v11 의 extends: "v10" 은 v10 의 UN 번호를 이어받는다 */
export function compileLists(raw) {
  const src = (raw && raw.lists) || {};
  const out = {};
  const build = (key) => {
    if (out[key]) return out[key];
    const l = src[key];
    if (!l) throw new Error(`금지 리스트 ${key} 가 없습니다`);
    const base = l.extends ? build(l.extends) : null;
    const un = new Set([...(base ? base.un : []), ...(l.un || []), ...(l.extra_un || [])]);
    out[key] = {
      key,
      name: l.name,
      un,
      allClass: new Set(l.all_class || []),
      condUn: toMap(l.conditional_un, 'un'),
      condClass: new Map((l.conditional_class || []).map((c) => [c.cls, c])),
    };
    return out[key];
  };
  for (const k of Object.keys(src)) build(k);
  if (!out.v10 || !out.v11) throw new Error('금지 리스트에 v10 · v11 이 모두 있어야 합니다');
  return out;
}

/**
 * 화물 1건 판정 → { status, reason, conditionEn }
 *  1) Class 전체 조건부(예: VER.11 Class 2) → 보류   2) Class 전체 금지 → 불가
 *  3) UN 이 금지 번호이면: 조건 표에 있으면 보류(단 Class 로 이미 불가면 불가 유지), 없으면 불가
 *  UN·Class 를 못 읽으면 가능으로 두지 않고 보류.
 */
export function judgeCargo(list, cargo) {
  const un = normUn(cargo && cargo.un);
  const cls = normClass(cargo && cargo.cls);
  if (!un || !cls) {
    const what = [!un && 'UN 번호', !cls && 'Class'].filter(Boolean).join('·');
    return { status: 'hold', reason: `${what}를 읽지 못함 — 신청서 원문 확인 필요`, conditionEn: '' };
  }
  let status = 'ok';
  let reason = '';
  let conditionEn = '';
  // "Class 1 전체" 는 1.1~1.6 도, "Class 2 전체" 는 2.1~2.3 도 포함한다: 세부 Class 로 먼저 찾고 없으면 대분류로 찾는다
  const keys = cls.includes('.') ? [cls, cls.split('.')[0]] : [cls];
  const cc = keys.map((k) => list.condClass.get(k)).find(Boolean);
  if (cc) { status = 'hold'; reason = cc.reason; conditionEn = cc.condition_en; }
  else if (keys.some((k) => list.allClass.has(k))) { status = 'bad'; reason = `Class ${cls} 전체 금지 (${list.name})`; }
  if (list.un.has(un)) {
    const c = list.condUn.get(un);
    if (c) {
      if (status !== 'bad') { status = 'hold'; reason = c.reason; conditionEn = c.condition_en; }
    } else { status = 'bad'; reason = `UN ${un}는 ${list.name} 금지 품목`; conditionEn = ''; }
  }
  if (status === 'ok') reason = `${list.name}에 해당 없음`;
  return { status, reason, conditionEn };
}

/** 신청 1건(화물 여러 개 가능) 판정: 가장 나쁜 화물이 신청의 판정 */
export function judgeRequest(lists, req) {
  const listKey = listKeyFor(req.origin);
  const list = lists[listKey];
  let status = 'ok';
  const reasons = [];
  const cargos = (req.cargos || []).map((c) => {
    const j = judgeCargo(list, c);
    status = worse(status, j.status);
    if (j.status !== 'ok' || !reasons.length) reasons.push(j.reason);
    return { ...c, ...j };
  });
  if (!cargos.length) return { listKey, listName: list.name, status: 'hold', reason: '화물 정보(UN·Class)가 없음 — 신청서 원문 확인 필요', cargos };
  // 가능이면 근거는 한 줄, 아니면 걸린 화물의 근거만 이어 붙인다
  const why = status === 'ok' ? reasons[0] : cargos.filter((c) => c.status !== 'ok').map((c) => c.reason).join(' / ');
  return { listKey, listName: list.name, status, reason: why, cargos };
}

/** 신청 목록에서 형식이 안 맞는 행을 버리고 개수만 센다(화면에서 "건너뛴 행 N개"로 알림) */
export function cleanRequests(raw) {
  const rows = [];
  let skipped = 0;
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  for (const r of Array.isArray(raw) ? raw : []) {
    const ok = r && str(r.id) && str(r.vessel) && str(r.route) && Array.isArray(r.cargos) && (r.origin === 'skr_hal' || r.origin === 'partner');
    if (ok) rows.push({ folder: '', svc: '', voyage: '', sender: '', received: '', note: '', ...r }); else skipped++;
  }
  return { rows, skipped };
}

/** 신청 전체 판정 + 3분류 건수 */
export function judgeAll(lists, requests, opts = {}) {
  const items = requests.map((r) => {
    const j = { ...r, ...judgeRequest(lists, r) };
    j.accident = opts.accidents ? lookupAccidents(opts.accidents, j.cargos, opts.asOf) : null; // null = 사고 이력 조회 불가(없다는 뜻이 아님)
    return j;
  });
  const count = { ok: 0, hold: 0, bad: 0 };
  items.forEach((x) => { count[x.status] += 1; });
  return { items, count };
}

// ── 사고 이력 조회 (agents/special-cargo-rules/skills/accident-history-lookup) ──
// 같은 UN 번호의 사고가 기준일 전 ACCIDENT_MONTHS 개월 안에 있으면 "최근 사고"다. 판정(가능·검토 필요·불가)은 바꾸지 않고, 신청에 붙여 확인 필요로 올린다.
export const ACCIDENT_MONTHS = 12;

/** 사고 사례 표에서 형식이 안 맞는 행(UN 번호·날짜·유형)을 버리고 개수만 센다 */
export function cleanAccidents(raw) {
  const rows = [];
  let skipped = 0;
  for (const r of Array.isArray(raw) ? raw : []) {
    const un = r && normUn(r.un);
    const ok = un && typeof r.id === 'string' && r.id && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && typeof r.type === 'string' && r.type;
    if (ok) rows.push({ cls: '', source: '', ...r, un }); else skipped++;
  }
  return { rows, skipped };
}

/** 기준일(YYYY-MM-DD) 에서 months 개월 전 날짜 */
export function cutoffDate(asOf, months = ACCIDENT_MONTHS) {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** 화물들의 UN 번호로 사고 조회 → { recent: 최근 사고(최신순), older: 기간 밖 사고 건수 } */
export function lookupAccidents(cases, cargos, asOf, months = ACCIDENT_MONTHS) {
  const uns = new Set((cargos || []).map((c) => normUn(c.un)).filter(Boolean));
  const from = cutoffDate(asOf, months);
  const hit = cases.filter((a) => uns.has(a.un) && a.date <= asOf);
  return {
    recent: hit.filter((a) => a.date >= from).sort((a, b) => (a.date < b.date ? 1 : -1)),
    older: hit.filter((a) => a.date < from).length,
  };
}

/** 사고 이력 한 줄 문장: "최근 12개월 사고 2건 (가장 최근 2026-08-14 컨테이너 화재)" */
export function accidentText(acc, months = ACCIDENT_MONTHS) {
  if (!acc) return '조회 불가(사고 사례 표를 읽지 못함)';
  if (!acc.recent.length) return acc.older ? `최근 ${months}개월 없음 (그 이전 ${acc.older}건)` : '기록 없음';
  const l = acc.recent[0];
  return `최근 ${months}개월 사고 ${acc.recent.length}건 (가장 최근 ${l.date} UN ${l.un} ${l.type})`;
}
