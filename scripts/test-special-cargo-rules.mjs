// 스페셜화물 내규 판정 규칙 테스트.  실행: node --test scripts/test-special-cargo-rules.mjs
// 공유본(DG 승인 데스크)의 판정 결과와 같은지, 그리고 못 읽는 값을 가능으로 넘기지 않는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/dgdesk/rules.js')).href);
const drafts = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/dgdesk/drafts.js')).href);
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/in/special-cargo-rules', f), 'utf8'));
const lists = rules.compileLists(read('prohibit-lists.json'));
const j = (origin, cls, un) => rules.judgeRequest(lists, { origin, cargos: [{ cls, un }] });

test('금지 리스트 크기: VER.10 239개, VER.11 은 62개 더해 301개', () => {
  assert.equal(lists.v10.un.size, 239);
  assert.equal(lists.v11.un.size, 301);
});

test('발신처로 리스트를 고른다: SKR·흥아 계열은 VER.11, 그 외는 VER.10', () => {
  assert.equal(j('skr_hal', '3', '1307').listKey, 'v11');
  assert.equal(j('partner', '3', '1307').listKey, 'v10');
});

test('금지 번호는 불가: UN 1089 (두 리스트 모두)', () => {
  assert.equal(j('partner', '3', '1089').status, 'bad');
  assert.equal(j('skr_hal', '3', '1089').status, 'bad');
});

test('Class 1 · 5.2 · 6.2 · 7 은 전체 금지, Class 2 는 VER.10 불가 / VER.11 보류', () => {
  for (const c of ['1', '5.2', '6.2', '7']) {
    assert.equal(j('partner', c, '9999').status, 'bad', `v10 Class ${c}`);
    assert.equal(j('skr_hal', c, '9999').status, 'bad', `v11 Class ${c}`);
  }
  assert.equal(j('partner', '2', '1950').status, 'bad');
  const v11 = j('skr_hal', '2', '1950');
  assert.equal(v11.status, 'hold');
  assert.match(v11.reason, /Class 2/);
});

test('Class 1.4 · 2.1 처럼 세부 Class 도 대분류 규칙을 따른다(공유본은 정확히 같은 글자만 맞춰 놓쳤던 곳)', () => {
  assert.equal(j('partner', '1.4', '9999').status, 'bad');
  assert.equal(j('skr_hal', '1.4', '9999').status, 'bad');
  assert.equal(j('partner', '2.1', '1950').status, 'bad');
  assert.equal(j('skr_hal', '2.1', '1950').status, 'hold');
  assert.equal(j('partner', '5.1', '9999').status, 'ok'); // 대분류 5 는 목록에 없고 5.2 만 있다
  assert.equal(j('partner', '5.2', '9999').status, 'bad');
});

test('조건부 UN 은 보류: 1381(ISO·수중) · 1090(ISO 탱크) · 2211(Open top/Reefer)', () => {
  assert.equal(j('skr_hal', '4.2', '1381').status, 'hold');
  assert.equal(j('partner', '4.2', '1381').status, 'hold');
  assert.equal(j('partner', '3', '1090').status, 'hold');
  assert.equal(j('partner', '9', '2211').status, 'hold');
});

test('UN 2203 은 VER.11 에서만 금지 목록에 있어 보류, VER.10 은 해당 없음(공유본과 같음)', () => {
  assert.equal(j('skr_hal', '3', '2203').status, 'hold'); // 번호 규칙만 보려고 Class 3 으로 넣음
  assert.equal(j('partner', '3', '2203').status, 'ok');
});

test('VER.11 만의 조건부: 0055(Class 1 이라 Class 전체 금지가 우선) · 3166 · 3480', () => {
  assert.equal(j('skr_hal', '1.4', '0055').status, 'bad');
  assert.equal(j('skr_hal', '9', '3166').status, 'hold');
  assert.equal(j('skr_hal', '9', '3480').status, 'hold');
});

test('금지 번호가 아니고 Class 도 안 걸리면 가능', () => {
  for (const [o, c, u] of [['partner', '3', '1307'], ['skr_hal', '9', '3077'], ['skr_hal', '8', '2922']]) assert.equal(j(o, c, u).status, 'ok');
});

test('UN·Class 표기를 통일한다: UN1089 · "UN 1089" · Class 4.1', () => {
  assert.equal(rules.normUn('UN1089'), '1089');
  assert.equal(rules.normUn(' un 1089 '), '1089');
  assert.equal(rules.normUn('108'), null);
  assert.equal(rules.normClass('Class 4.1'), '4.1');
  assert.equal(rules.normClass('10'), null);
  assert.equal(j('partner', 'Class 3', 'UN1089').status, 'bad');
});

test('UN·Class 를 못 읽으면 가능이 아니라 보류', () => {
  assert.equal(j('partner', '3', '').status, 'hold');
  assert.equal(j('partner', '', '1307').status, 'hold');
  assert.equal(j('partner', '3', 'N/A').status, 'hold');
  assert.equal(rules.judgeRequest(lists, { origin: 'partner', cargos: [] }).status, 'hold');
});

test('화물이 여러 개면 가장 나쁜 판정을 따르고, 근거는 걸린 화물만 이어 붙인다', () => {
  const r = rules.judgeRequest(lists, { origin: 'partner', cargos: [{ cls: '3', un: '1307' }, { cls: '3', un: '1089' }, { cls: '4.2', un: '1381' }] });
  assert.equal(r.status, 'bad');
  assert.match(r.reason, /UN 1089/);
  assert.match(r.reason, / \/ /);
  assert.doesNotMatch(r.reason, /해당 없음/);
});

test('공유본 스냅샷 21건: 가능 20 · 보류 1(Q21, UN 1381) · 불가 0', () => {
  const { rows, skipped } = rules.cleanRequests(read('requests.json').requests);
  assert.equal(skipped, 0);
  const { items, count } = rules.judgeAll(lists, rows);
  assert.deepEqual(count, { ok: 20, hold: 1, bad: 0 });
  assert.equal(items.find((x) => x.status === 'hold').id, 'Q21');
});

test('형식이 안 맞는 신청 행은 버리고 개수를 센다', () => {
  const { rows, skipped } = rules.cleanRequests([{ id: 'Q1', vessel: 'S01', route: 'A → B', origin: 'partner', cargos: [] }, { id: 'Q2' }, null, { id: 'Q3', vessel: 'S01', route: 'x', origin: 'other', cargos: [] }]);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 3);
});

test('승인안: 조건부(보류)만 조건 문장이 붙고, 서명은 자리표시', () => {
  const hold = rules.judgeRequest(lists, { origin: 'skr_hal', cargos: [{ cls: '4.2', un: '1381' }] });
  const ok = rules.judgeRequest(lists, { origin: 'skr_hal', cargos: [{ cls: '3', un: '1307' }] });
  assert.match(drafts.approveText(hold), /UN 1381 is accepted only under the condition below/);
  assert.match(drafts.approveText(hold), /UNDER WATER/);
  assert.doesNotMatch(drafts.approveText(ok), /accepted only under the condition/);
  assert.match(drafts.approveText(ok), /\[담당자 이름\]/);
});

test('거절안: 불가는 금지 리스트 문구, 보류는 재신청 안내가 붙는다', () => {
  const bad = { ...rules.judgeRequest(lists, { origin: 'partner', cargos: [{ cls: '3', un: '1089' }] }), route: 'A → B', voyage: '1E', vessel: 'S01' };
  const hold = { ...rules.judgeRequest(lists, { origin: 'skr_hal', cargos: [{ cls: '4.2', un: '1381' }] }), route: 'A → B', voyage: '1E', vessel: 'S01' };
  assert.match(drafts.rejectText(bad), /UN No\. 1089 is listed in our Prohibited DG List \(VER\.10/);
  assert.doesNotMatch(drafts.rejectText(bad), /re-apply/);
  assert.match(drafts.rejectText(hold), /The condition is not confirmed/);
  assert.match(drafts.rejectText(hold), /please re-apply/);
});

// ── 사고 이력 조회 ──
const accRead = rules.cleanAccidents(read('accident-cases.json').cases);
const cases = [
  { id: 'A1', un: '1381', date: '2026-08-14', type: '화재' },
  { id: 'A2', un: '1381', date: '2025-03-02', type: '누출' },
  { id: 'A3', un: '1381', date: '2025-10-27', type: '경계일' },
  { id: 'A4', un: '1381', date: '2026-11-01', type: '미래 날짜' },
];

test('사고 사례 표: 8건을 모두 읽고, 형식이 안 맞는 행(UN·날짜·유형)은 버린다', () => {
  assert.equal(accRead.rows.length, 8);
  assert.equal(accRead.skipped, 0);
  const bad = rules.cleanAccidents([{ id: 'X1', un: 'UN1381', date: '2026-01-01', type: '화재' }, { id: 'X2', un: '13', date: '2026-01-01', type: 'a' }, { id: 'X3', un: '1381', date: '26-1-1', type: 'a' }, { id: 'X4', un: '1381', date: '2026-01-01' }, null]);
  assert.equal(bad.rows.length, 1);
  assert.equal(bad.rows[0].un, '1381'); // UN1381 → 1381 로 통일
  assert.equal(bad.skipped, 4);
});

test('최근 12개월: 기준일 전 12개월 경계(포함)까지, 그보다 오래된 건 older, 기준일 뒤는 무시', () => {
  assert.equal(rules.cutoffDate('2026-10-27'), '2025-10-27');
  const r = rules.lookupAccidents(cases, [{ cls: '4.2', un: '1381' }], '2026-10-27');
  assert.deepEqual(r.recent.map((a) => a.id), ['A1', 'A3']); // 최신순, 경계일 포함
  assert.equal(r.older, 1);
});

test('다른 UN 번호나 UN 을 못 읽은 화물은 사고에 걸리지 않는다', () => {
  assert.deepEqual(rules.lookupAccidents(cases, [{ cls: '3', un: '1307' }, { cls: '3', un: '' }], '2026-10-27'), { recent: [], older: 0 });
});

test('스냅샷 21건: 최근 사고 4건(Q07 · Q08 · Q19 · Q21), 판정은 그대로', () => {
  const { rows } = rules.cleanRequests(read('requests.json').requests);
  const { items, count } = rules.judgeAll(lists, rows, { accidents: accRead.rows, asOf: '2026-10-27' });
  assert.deepEqual(count, { ok: 20, hold: 1, bad: 0 });
  assert.deepEqual(items.filter((x) => x.accident.recent.length).map((x) => x.id), ['Q07', 'Q08', 'Q19', 'Q21']);
  // 3077 은 사고가 12개월보다 오래돼 걸리지 않지만 "그 이전 1건"으로는 보인다
  const q06 = items.find((x) => x.id === 'Q06');
  assert.equal(q06.accident.recent.length, 0);
  assert.equal(q06.accident.older, 1);
});

test('사고 사례 표를 못 읽으면 "없음"이 아니라 조회 불가(null)로 둔다', () => {
  const { items } = rules.judgeAll(lists, [{ id: 'Q1', vessel: 'S01', route: 'A → B', origin: 'partner', cargos: [{ cls: '3', un: '1307' }] }]);
  assert.equal(items[0].accident, null);
  assert.match(rules.accidentText(null), /조회 불가/);
  assert.equal(rules.accidentText({ recent: [], older: 0 }), '기록 없음');
  assert.match(rules.accidentText({ recent: [], older: 2 }), /그 이전 2건/);
});
