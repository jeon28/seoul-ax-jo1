// 스페셜화물 승인 보조 점검 규칙 테스트.  실행: node --test scripts/test-special-cargo-approval.mjs
// 서류 누락 · 불일치 · 규정 위반을 잡는지, 그리고 못 읽는 값 · IMDG 불일치를 자동 승인·자동 거절하지 않고 직접 확인으로 넘기는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/approval/rules.js')).href);
const drafts = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/approval/drafts.js')).href);
const { compileLists } = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/dgdesk/rules.js')).href);
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/in', dir, f), 'utf8'));
const A = 'special-cargo-approval';
const base = {
  lists: compileLists(read('special-cargo-rules', 'prohibit-lists.json')),
  required: read(A, 'required-docs.json'),
  limits: read(A, 'limits.json'),
  casRaw: read(A, 'cas-lists.json'),
  imdgRaw: read(A, 'imdg-sample.json'),
};
const ctx = rules.buildCtx(base);
const data = read(A, 'requests.json');
const clean = rules.cleanRequests(data.requests);
const all = rules.checkAll(ctx, clean.rows);
const byId = Object.fromEntries(all.items.map((x) => [x.id, x]));

// 한 건을 고쳐 다시 점검하는 도우미
const dg = (over = {}) => ({ id: 'T', type: 'DG', vessel: 'S01', pol: 'QINGDAO', via: [], pod: 'BUSAN', origin: 'partner', docs: structuredClone(data.requests[0].docs), ...over });
const run = (req, c = ctx) => rules.checkRequest(c, req);

test('가상 샘플 11건 전부 읽힌다', () => {
  assert.equal(clean.rows.length, 11);
  assert.equal(clean.skipped, 0);
});

test('표기 통일: UN1307 = 1307, 18,000 KGS = 18000 kg, 1 m = 100 cm', () => {
  assert.equal(rules.parseQty('18,000 KGS', 'kg'), 18000);
  assert.equal(rules.parseQty('18000 KG', 'kg'), 18000);
  assert.equal(rules.parseQty('1 m', 'cm'), 100);
  assert.equal(rules.parseQty('400 mm', 'cm'), 40);
  assert.equal(rules.parseQty('99.5%', 'pct'), 99.5);
  assert.equal(rules.parseQty('abc', 'kg'), null);
  assert.equal(rules.parseQty('12 furlongs', 'cm'), null);
});

test('Q01 DG: 서류 완비 · 표기만 다른 값은 일치 → 가능, 승인 초안', () => {
  assert.equal(byId.Q01.status, 'ok');
  assert.equal(byId.Q01.draft, 'approve');
  assert.equal(byId.Q01.docText, '완비');
  assert.equal(byId.Q01.conflicts.length, 0);
});

test('Q02 DG: MSDS 누락 → 확인 필요, 보완 요청 초안', () => {
  assert.equal(byId.Q02.status, 'hold');
  assert.deepEqual(byId.Q02.missing, ['MSDS']);
  assert.equal(byId.Q02.draft, 'supplement');
  assert.equal(byId.Q02.docText, '누락(MSDS)');
});

test('Q03 OOG: 초과 높이가 서류마다 다름 → 불일치, 한도는 가장 큰 값(120) 기준이라 위반은 아님', () => {
  assert.equal(byId.Q03.status, 'hold');
  assert.equal(byId.Q03.conflicts.length, 1);
  assert.equal(byId.Q03.conflicts[0].field, '초과 높이');
  assert.ok(!byId.Q03.kinds.includes('violation'));
  assert.equal(byId.Q03.draft, 'supplement');
});

test('Q04 Flexibag · Q09 OOG: 완비·일치 → 가능 (1 m = 100 cm, 400 mm = 40 cm 로 맞음)', () => {
  assert.equal(byId.Q04.status, 'ok');
  assert.equal(byId.Q09.status, 'ok');
  assert.equal(byId.Q09.conflicts.length, 0);
});

test('Q05 DG: 금지 목록 UN 1089 → 불가, 거절 초안', () => {
  assert.equal(byId.Q05.status, 'bad');
  assert.equal(byId.Q05.draft, 'reject');
  assert.equal(byId.Q05.steps.find((s) => s.id === 'S0').result, 'bad');
});

test('Q06 DG: 상해 양하 + CAS 금지 목록 해당 → 불가. 농도 99.5% 도 함께 표시', () => {
  assert.equal(byId.Q06.status, 'bad');
  assert.equal(byId.Q06.steps.find((s) => s.id === 'S1').result, 'bad');
  assert.equal(byId.Q06.steps.find((s) => s.id === 'S2').result, 'hold');
});

test('Q07 DG: IMDG Class 와 다름 → 자동 거절하지 않고 직접 확인(초안 없음)', () => {
  assert.equal(byId.Q07.status, 'hold');
  assert.equal(byId.Q07.draft, 'none');
  assert.equal(byId.Q07.steps.find((s) => s.id === 'S0.5').result, 'hold');
});

test('Q08 DG: 상해 양하 MSDS 농도 85% → 직접 확인(초안 없음). 숫자표에서 on_fail 을 bad 로 바꾸면 불가', () => {
  assert.equal(byId.Q08.status, 'hold');
  assert.equal(byId.Q08.draft, 'none');
  const strict = rules.buildCtx({ ...base, limits: { ...base.limits, dg: { ...base.limits.dg, sha_msds_on_fail: 'bad' } } });
  assert.equal(run(data.requests.find((r) => r.id === 'Q08'), strict).status, 'bad');
});

test('Q10 OOG: S03 한도(높이 150)를 넘음 → 불가. 같은 값도 기본 한도(200)로는 넘음, 선박별 표가 먼저', () => {
  assert.equal(byId.Q10.status, 'bad');
  assert.equal(byId.Q10.draft, 'reject');
});

test('Q11 Flexibag: COA 양식이 연도 양식과 다름 → 확인 필요(보완 요청), 연도 표에 없으면 직접 확인', () => {
  assert.equal(byId.Q11.status, 'hold');
  assert.equal(byId.Q11.draft, 'supplement');
  const r = data.requests.find((q) => q.id === 'Q11');
  const old = structuredClone(r);
  old.docs.coa.year = '2019';
  const x = run(old);
  assert.equal(x.draft, 'none');
});

test('상해·닝보 양하/경유가 아니면 STEP 1·2 는 해당 없음', () => {
  const x = run(dg());
  assert.equal(x.steps.find((s) => s.id === 'S1').result, 'na');
  assert.equal(x.steps.find((s) => s.id === 'S2').result, 'na');
});

test('경유지(via)에 상해·닝보가 있어도 걸린다: 닝보 경유 + CAS 108-88-3 → 불가', () => {
  const r = dg({ via: ['NINGBO'] });
  r.docs.msds.cas = '108-88-3';
  assert.equal(run(r).steps.find((s) => s.id === 'S1').result, 'bad');
  const sha = dg({ pod: 'CNSHA' }); // UN/LOCODE 로 적어도 같은 항구
  sha.docs.msds.cas = '67-56-1';
  assert.equal(run(sha).status, 'bad');
});

test('못 읽는 값은 가능으로 두지 않는다: UN 칸이 비면 직접 확인', () => {
  const r = dg();
  r.docs.application.un = '';
  const x = run(r);
  assert.equal(x.status, 'hold');
  assert.ok(x.findings.some((f) => f.kind === 'unsure'));
  assert.equal(x.draft, 'none');
});

test('상해 양하인데 MSDS 에 농도 칸이 없으면 직접 확인', () => {
  const r = dg({ pod: 'SHANGHAI' });
  delete r.docs.msds.conc;
  const x = run(r);
  assert.equal(x.steps.find((s) => s.id === 'S2').result, 'hold');
  assert.equal(x.draft, 'none');
});

test('IMDG 표나 CAS 목록이 없으면 그 단계는 직접 확인(맞다고 하지 않음)', () => {
  const noImdg = rules.buildCtx({ ...base, imdgRaw: null });
  assert.equal(run(dg(), noImdg).status, 'hold');
  assert.equal(run(dg(), noImdg).draft, 'none');
  const noCas = rules.buildCtx({ ...base, casRaw: null });
  assert.equal(run(dg({ pod: 'SHANGHAI' }), noCas).steps.find((s) => s.id === 'S1').result, 'hold');
});

test('규정 위반이 있으면 서류 누락이 겹쳐도 불가가 먼저, 직접 확인이 있으면 초안 없음', () => {
  const r = structuredClone(data.requests.find((q) => q.id === 'Q05'));
  r.docs.dg_declaration = null;
  const x = run(r);
  assert.equal(x.status, 'bad');
  assert.equal(x.kinds[0], 'violation');
});

test('요청 형식이 안 맞는 행은 버리고 개수만 센다', () => {
  const c = rules.cleanRequests([{ id: 'X1' }, { id: 'X2', type: 'OOG', vessel: 'S01', pod: 'BUSAN', origin: 'partner', docs: {} }, null]);
  assert.equal(c.rows.length, 1);
  assert.equal(c.skipped, 2);
});

test('건수 합계: 가능 3 · 확인 필요 5 · 불가 3, 누락 1 · 불일치 2 · 위반 3 · 직접 확인 3', () => {
  assert.deepEqual(all.count, { ok: 3, hold: 5, bad: 3 });
  assert.deepEqual(all.kinds, { missing: 1, conflict: 2, violation: 3, unsure: 3 });
});

test('초안: 직접 확인 건은 만들지 않고, 승인·거절·보완 문구는 영문이며 보내기 자리는 [대괄호]로 남긴다', () => {
  assert.deepEqual(drafts.draftTabs(byId.Q07), []);
  assert.match(drafts.approveText(byId.Q01), /accept your DG application/);
  assert.match(drafts.approveText(byId.Q09), /accept your OOG application/);
  assert.match(drafts.rejectText(byId.Q05), /Reject Remark/);
  assert.match(drafts.rejectText(byId.Q10), /exceeds our limit/);
  assert.match(drafts.supplementText(byId.Q02), /MSDS is missing/);
  assert.match(drafts.supplementText(byId.Q03), /differs between documents/);
  for (const t of [drafts.approveText(byId.Q01), drafts.rejectText(byId.Q05), drafts.supplementText(byId.Q02)]) assert.match(t, /\[담당자 이름\]/);
  for (const t of [drafts.rejectText(byId.Q05), drafts.supplementText(byId.Q02), drafts.approveText(byId.Q09)]) assert.match(t, /\[부킹번호/);
});

test('결과 파일 자료에 실제 이름이 새지 않는다: 선박 S·컨테이너 C·발신처 L 코드만', () => {
  data.requests.forEach((r) => {
    assert.match(r.vessel, /^S\d\d$/);
    assert.match(r.sender, /^L\d\d$/);
    Object.values(r.docs).filter(Boolean).forEach((d) => { if (d.container) assert.match(d.container, /^C\d\d$/); });
  });
});
