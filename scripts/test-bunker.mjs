// 소모량 분석 계산 규칙 테스트.  실행: node --test scripts/test-bunker.mjs
// 원본(operation-dashboard lib/performance.test.ts)의 계약을 옮겨 왔다: 규칙을 바꾸면 여기서 먼저 걸린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dashboard/js/bunker');
const { analyze, DEFAULT_FILTERS, detectOutliers, toSpeed } = await import(pathToFileURL(path.join(dir, 'performance.js')).href);
const { summarizePort } = await import(pathToFileURL(path.join(dir, 'portcalc.js')).href);
const { getHistory } = await import(pathToFileURL(path.join(dir, 'noon-synthetic.js')).href);

const row = (o = {}) => ({ date: '20260101', vyg: null, rh: 24, spd: 15, rpm: 80, slip: 0, ifo: 30, mgo: 0, outlier: false, ...o });
const wide = { ...DEFAULT_FILTERS, rhMin: 0, rhMax: 100, spdMin: 0, spdMax: 30 };

test('속력은 반올림해 묶고(0.5 는 올림) 소모량은 MT/day 로 환산한다', () => {
  const a = analyze([row({ spd: 14.5, rh: 12, ifo: 10 }), row({ spd: 15.49, rh: 24, ifo: 40 })], wide);
  assert.equal(a.rows.length, 1);
  assert.deepEqual({ spd: a.rows[0].spd, count: a.rows[0].count, fo: a.rows[0].fo }, { spd: 15, count: 2, fo: 30 }); // 20/day 와 40/day 의 평균
});

test('RH=0 행은 0 으로 더하되 분모에 남아 평균을 낮춘다', () => {
  const a = analyze([row({ spd: 14, rh: 0, ifo: 0, mgo: 0 }), row({ spd: 14, rh: 24, ifo: 48, mgo: 24 })], wide);
  assert.deepEqual({ count: a.rows[0].count, fo: a.rows[0].fo, mgo: a.rows[0].mgo, total: a.rows[0].total }, { count: 2, fo: 24, mgo: 12, total: 36 });
});

test('TOTAL 은 FO·MGO 를 소수 1자리로 반올림한 뒤 더한다', () => {
  const a = analyze([row({ spd: 20, ifo: 10.05, mgo: 20.05 })], wide);
  assert.deepEqual({ fo: a.rows[0].fo, mgo: a.rows[0].mgo, total: a.rows[0].total }, { fo: 10.1, mgo: 20.1, total: 30.2 });
});

test('RH · Slip 필터는 양 끝을 포함한다', () => {
  const rows = [row({ rh: 23 }), row({ rh: 25 }), row({ rh: 22.9 }), row({ rh: 25.1 }), row({ slip: 10.1 }), row({ slip: -10 })];
  assert.equal(analyze(rows, DEFAULT_FILTERS).used, 3);
});

test('숫자가 아닌 속력은 어느 묶음에도 넣지 않고 센다', () => {
  const a = analyze([row({ spd: toSpeed('N/A') }), row({ spd: toSpeed('') }), row({ spd: 15 })], wide);
  assert.equal(a.badSpeed, 1);
  assert.deepEqual(a.rows.map((r) => r.spd).sort((x, y) => x - y), [0, 15]);
});

test('속력 범위와 시작일을 지키고 빠른 속력부터 정렬한다', () => {
  const rows = [row({ spd: 12 }), row({ spd: 18 }), row({ spd: 25 }), row({ spd: 16, date: '20200101' })];
  const a = analyze(rows, { ...DEFAULT_FILTERS, spdMin: 10, spdMax: 20, from: '20250101' });
  assert.deepEqual(a.rows.map((r) => r.spd), [18, 12]);
});

test('이상치: 중앙값 5배 넘는 하루 소모량만 표시하고 기준선이 없으면 아무것도 안 건드린다', () => {
  const normal = Array.from({ length: 12 }, () => row({ ifo: 30 }));
  const out = detectOutliers([...normal, row({ ifo: 700 }), row({ ifo: 100 }), row({ ifo: 30, mgo: 400 })]);
  assert.equal(out.filter((r) => r.outlier).length, 2);
  assert.equal(out[13].outlier, false); // 100 < 5 × 30
  assert.equal(detectOutliers([row({ ifo: 700 })]).some((r) => r.outlier), false);
  const flagged = detectOutliers([...normal, row({ ifo: 700 })]);
  const a = analyze(flagged, wide);
  assert.deepEqual({ outliersExcluded: a.outliersExcluded, used: a.used }, { outliersExcluded: 1, used: 12 });
  assert.deepEqual({ outliersExcluded: analyze(flagged, { ...wide, excludeOutliers: false }).outliersExcluded, used: analyze(flagged, { ...wide, excludeOutliers: false }).used }, { outliersExcluded: 0, used: 13 });
});

// 정박 중 소모량
const call = (o = {}) => ({ port: 'KRPUS', ta: '202601010000', td: '202601020000', afo: 1000, dfo: 990, sfo: 0, ado: 200, ddo: 199, sdo: 0, ...o });

test('정박: 하루 소모량은 (입항+공급−출항)÷체류×24 의 중앙값', () => {
  const s = summarizePort([call(), call({ port: 'CNSHA', dfo: 988 }), call({ port: 'JPTYO', dfo: 992 })]);
  assert.deepEqual({ fo: s.fo, n: s.n, calls: s.calls }, { fo: 10, n: 3, calls: 3 });
});

test('정박: 미입력·벙커링·오류 기항은 0 이 아니라 건너뛴다', () => {
  const s = summarizePort([
    call({ port: 'A', dfo: 1000 }), // 입항값 복사 = 미입력
    call({ port: 'B', dfo: 1300 }), // 벙커링인데 공급량 없음
    call({ port: 'C', td: '202601010200' }), // 체류 2시간
    call({ port: 'D', dfo: 1100 }), // 출항이 더 많음(공급 0, +100 → 벙커링으로 분류)
    call({ port: 'E' }), // 정상 1건
  ]);
  assert.deepEqual(s.skipped, { unentered: 1, bunkering: 2, invalid: 1 });
  assert.equal(s.n, 1);
});

test('정박: 같은 기항이 두 번 올라오면 한 번만 센다', () => {
  assert.equal(summarizePort([call(), call()]).calls, 1);
});

// 가상 자료
test('가상 NOON REPORT: 같은 선박은 언제나 같고, 일부러 섞은 지저분한 행이 실제로 걸린다', async () => {
  const v = { code: 'MEBG', name: 'MELBOURNE BRIDGE', teu: 8002 };
  const a = await getHistory(v);
  const b = await getHistory({ ...v });
  assert.equal(a, b); // 캐시
  assert.ok(a.duplicates > 0 && a.rows.some((r) => r.outlier) && a.rows.some((r) => r.spd === null));
  const x = analyze(a.rows, { ...DEFAULT_FILTERS, spdMin: 10, spdMax: 22 });
  assert.ok(x.rows.length >= 8 && x.rows.every((r, i, arr) => i === 0 || arr[i - 1].fo >= r.fo)); // 속력이 낮을수록 소모량이 줄어든다
  assert.deepEqual([DEFAULT_FILTERS.spdMin, DEFAULT_FILTERS.spdMax], [12, 18]); // 화면 기본 속력 범위
  assert.ok(analyze(a.rows, DEFAULT_FILTERS).rows.every((r) => r.spd >= 12 && r.spd <= 18));
});
