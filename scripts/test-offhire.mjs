// Off hire 관리 계산 규칙 테스트.  실행: node --test scripts/test-offhire.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readXlsxAoa } from './xlsx-min.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/offhire/rules.js')).href);
const demo = () => R.run(readXlsxAoa(path.join(ROOT, 'data/in/offhire/demo-off-hire.xlsx')), { fileName: 'DEMO Off hire.xlsx' });

test('샘플 4건: 일치 1 · 불일치 2 · 확인 필요 1', () => {
  const out = demo();
  assert.equal(out.vessel, 'DEMO');
  assert.deepEqual(out.table.map((r) => r.verdict), ['일치', '불일치', '불일치', '확인 필요']);
  assert.deepEqual(R.counts(out.table), { total: 4, match: 1, diff: 2, check: 1 });
  assert.equal(out.totalsCheck.found, true);
  assert.equal(out.totalsCheck.diffs.length, 0);
});

test('검산 1: Days 는 End−Start 로 다시 계산하고 틀린 칸만 불일치', () => {
  const r2 = demo().table[1];
  assert.equal(r2.calc.days, 0.75);
  assert.deepEqual(r2.issues.map((i) => i.item), ['Days']);
});

test('검산 4: F/O Total 불일치는 몇 % 다름으로만 적는다', () => {
  const r3 = demo().table[2];
  assert.deepEqual(r3.issues.map((i) => [i.item, i.rule]), [['F/O Total', '검산 4 Bunker']]);
  assert.match(r3.issues[0].why, /^F\/O Total 기입값이 계산값과 \d+(\.\d)?% 다름$/);
});

test('점검 1·2: 빈 Remark 와 건끼리 다른 일 용선료는 확인 필요', () => {
  const r4 = demo().table[3];
  assert.deepEqual(r4.issues.map((i) => i.item), ['Remark', 'Hire(일 용선료)']);
});

test('결과 파일: 금액이 없고 선박은 S01 로 가려진다', () => {
  const doc = R.buildResult(demo(), { baseDate: '2026-10-27', ledger: R.ledgerCounts({ A: [{ status: '청구' }, { status: '반론' }, {}] }), ledgerRows: 3 });
  const json = JSON.stringify(doc);
  assert.equal(doc.table.rows.length, 4);
  assert.ok(doc.table.rows.every((r) => r[0] === 'S01'));
  assert.ok(!/DEMO|DEMO|KRPUS/.test(JSON.stringify(doc.review)), 'review 에 선박 이름이 없어야 한다');
  for (const money of ['12000', '47,775', '520.00', '1,751.25']) assert.ok(!json.includes(money), `금액 ${money} 가 결과 파일에 들어 있다`);
  assert.equal(doc.metrics.find((m) => m.key === 'claim').value, 1);
  assert.equal(doc.synthetic, true);
});

test('Declaration: TTL off-hire 와 바뀐 Max date', () => {
  const dur = R.offhireDuration('2025-09-23 04:30', '2025-09-27 09:18');
  assert.equal(dur.text, '4D 04H 48M');
  const d = R.declaration({ min: 11, max: 13, start: '2025-09-23 04:30', end: '2025-09-27 09:18', prevMax: '2025-10-23 05:00', addedTimes: 0 });
  assert.equal(d.revisedMax, '2025-10-27 09:48');
  assert.match(d.text, /0948hours 27th October, 2025 \(GMT\)/);
  assert.match(d.text, /min 11mos – max 13mos/);
  const again = R.declaration({ min: 11, max: 13, start: '2025-09-23 04:30', end: '2025-09-27 09:18', prevMax: d.revisedMax, addedTimes: 1 });
  assert.match(again.text, /previously added 1 time off-hire period/);
});

test('날짜 서수: 1st · 2nd · 3rd · 11th · 22nd', () => {
  const t = (s) => R.declDate(R.parseTime(s));
  assert.match(t('2026-03-01 00:00'), /1st March/);
  assert.match(t('2026-03-02 00:00'), /2nd March/);
  assert.match(t('2026-03-03 00:00'), /3rd March/);
  assert.match(t('2026-03-11 00:00'), /11th March/);
  assert.match(t('2026-03-22 00:00'), /22nd March/);
});

test('CP 리스트: 같은 선박이 여러 줄이면 MAX.DATE 가 늦은 계약', () => {
  const list = R.readCharterList(readXlsxAoa(path.join(ROOT, 'data/in/offhire/demo-cp-list.xlsx')));
  assert.deepEqual(Object.keys(list).sort(), ['DEM2', 'DEMO']);
  assert.equal(list.DEMO.maxDate, '2026-10-23 05:00');
  assert.equal(list.DEMO.min, 11);
  assert.equal(list.DEMO.max, 13);
});

test('머리글이 없는 엑셀은 읽지 못했다고 알린다', () => {
  assert.throws(() => R.run([['a', 'b'], [1, 2]]), /SEQ/);
});
