// 영업실적 분석 계산 규칙 테스트.  실행: node --test scripts/test-sales.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readXlsxAoa } from './xlsx-min.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/sales/rules.js')).href);
const demo = () => R.readSheet(readXlsxAoa(path.join(ROOT, 'data/in/sales-analysis/demo-monthly-sales.xlsx')));
const HEAD = ['월', '화주', '구분', 'POD/POL', 'TEU'];
const notes = (b) => Object.fromEntries(b.list.map((s) => [s.name, s.note]));
const ports = (b) => b.ports.map((p) => [p.port, p.total, p.prev, p.diff, p.shippers].join(':')).sort();

test('샘플 엑셀: 204건, 2026-09 · 2026-10, 읽지 못한 줄 없음', () => {
  const p = demo();
  assert.equal(p.rows.length, 204);
  assert.equal(p.dropped.length, 0);
  assert.deepEqual(p.months, ['2026-09', '2026-10']);
  assert.deepEqual(p.rawByMonth, { '2026-09': 382, '2026-10': 399 });
});

test('월간 영업 카드 샘플(노현석.html)과 같은 합계 · 비고 · 항구별 숫자', () => {
  const a = R.aggregate(demo(), '2026-10', '2026-09');
  assert.deepEqual([a.export.total, a.export.prev_total, a.import.total, a.import.prev_total], [241, 220, 158, 162]);
  assert.deepEqual(notes(a.export), { 가온통상: '', 동방철강: '증가', 대성오토파츠: '', 한빛케미칼: '감소', 미래플라스틱: '증가', 누리전자: '', 서해제지: '', 하나기계: '신규', 평택푸드: '이탈' });
  assert.deepEqual(notes(a.import), { 한결목재: '', 그린바이오: '증가', 금강건자재: '', 세원유통: '감소', 가온통상: '', 태양산업: '', 우리상사: '신규', 바다수산: '이탈' });
  assert.deepEqual(ports(a.export), ['대련:11:10:1:1', '마닐라:9:8:1:1', '방콕:20:16:4:1', '상해:60:52:8:2', '자카르타:19:15:4:1', '천진:22:19:3:1', '청도:27:32:-5:2', '하이퐁:40:31:9:3', '호치민:24:32:-8:2', '나고야:9:5:4:1'].sort());
  assert.deepEqual(ports(a.import), ['나고야:10:0:10:1', '대련:5:21:-16:1', '방콕:22:14:8:1', '상해:34:32:2:2', '자카르타:13:12:1:1', '천진:18:19:-1:1', '청도:26:37:-11:2', '하이퐁:10:8:2:1', '호치민:20:19:1:1'].sort());
  assert.deepEqual(a.checks.items.map((i) => i.ok), [true, true, true, true, true]);
});

test('비고: 5 TEU 이상 늘면 증가 · 줄면 감소, 전월 0 이면 신규, 이번 달 0 이면 이탈, 4 TEU 차이는 비고 없음', () => {
  assert.equal(R.noteOf(30, 25, true), '증가');
  assert.equal(R.noteOf(20, 25, true), '감소');
  assert.equal(R.noteOf(29, 25, true), '');
  assert.equal(R.noteOf(21, 25, true), '');
  assert.equal(R.noteOf(8, 0, true), '신규');
  assert.equal(R.noteOf(0, 8, true), '이탈');
  assert.equal(R.noteOf(8, 0, false), '');
});

test('정렬: 이번 달 TEU 큰 순, 같으면 이름 순, 이탈은 맨 아래', () => {
  const a = R.aggregate(demo(), '2026-10', '2026-09');
  assert.deepEqual(a.export.list.map((s) => s.name), ['가온통상', '동방철강', '대성오토파츠', '한빛케미칼', '미래플라스틱', '누리전자', '서해제지', '하나기계', '평택푸드']);
  assert.deepEqual(a.import.list.map((s) => s.name), ['한결목재', '그린바이오', '금강건자재', '세원유통', '가온통상', '태양산업', '우리상사', '바다수산']);
});

test('표기 통일: 월 · 구분 · 화주 · 항구 · TEU', () => {
  assert.equal(R.parseMonth('2026-10'), '2026-10');
  assert.equal(R.parseMonth('2026.10.05'), '2026-10');
  assert.equal(R.parseMonth('2026년 9월'), '2026-09');
  assert.equal(R.parseMonth(202610), '2026-10');
  assert.equal(R.parseMonth(46296), '2026-10'); // 엑셀 날짜 숫자(2026-10-05)
  assert.equal(R.parseMonth('13월'), null);
  assert.equal(R.normKind(' Export '), '수출');
  assert.equal(R.normKind('IMP'), '수입');
  assert.equal(R.normKind('기타'), null);
  assert.equal(R.normShipper('(주) 가온통상 '), '가온통상');
  assert.equal(R.normPort('Shanghai'), 'SHANGHAI');
  assert.equal(R.parseTeu('1,200'), 1200);
  assert.equal(R.parseTeu('12 TEU'), 12);
  assert.equal(R.parseTeu(''), null);
  assert.equal(R.parseTeu('abc'), null);
});

test('POD · POL 를 따로 둔 엑셀도 읽는다(수출은 POD, 수입은 POL)', () => {
  const p = R.readSheet([['선적월', '거래처', '수출입', 'POD', 'POL', 'TEU'], ['2026-10', 'A사', '수출', '상해', '평택', 4], ['2026-10', 'B사', '수입', '평택', '청도', 6]]);
  assert.deepEqual(p.rows.map((r) => [r.shipper, r.kind, r.port, r.teu]), [['A사', '수출', '상해', 4], ['B사', '수입', '청도', 6]]);
});

test('읽지 못한 줄은 맞다고 처리하지 않고 빼서 알린다(검산은 뺀 줄까지 맞춘다)', () => {
  const p = R.readSheet([HEAD, ['2026-10', '가', '수출', '상해', 5], ['2026-10', '', '수출', '상해', 3], ['2026-10', '나', '수출', '상해', 'abc'],
    ['2026-10', '다', '기타', '상해', 2], ['2026-10', '라', '수입', '', 4], ['합계', '', '', '', 99]]);
  assert.equal(p.rows.length, 1);
  assert.deepEqual(p.dropped.map((d) => d.line), [3, 4, 5, 6]);
  assert.match(p.dropped[0].why, /화주가 비어 있음/);
  assert.match(p.dropped[1].why, /TEU/);
  const a = R.aggregate(p, '2026-10', null);
  assert.equal(a.export.total, 5);
  assert.equal(a.checks.items[0].detail, '표 5 + 뺀 줄 9 / 원본 14');
  assert.equal(a.checks.items[0].ok, true);
  const doc = R.buildResult(a, R.visitList(a), { baseDate: '2026-10-27', rows: p.dataRows });
  assert.ok(doc.review.some((r) => r.code === '입력행' && /4줄/.test(r.detail)));
});

test('머리글이 없거나 월 칸이 없으면 읽지 않고 이유를 알린다', () => {
  assert.throws(() => R.readSheet([['a', 'b'], [1, 2]]), /머리글을 찾지 못했습니다/);
  assert.throws(() => R.readSheet([['화주', '구분', 'POD/POL', 'TEU'], ['가', '수출', '상해', 1]]), /머리글에 없는 칸: 월/);
});

test('전월을 고르지 않으면 비교 칸은 null 이고 비고 · 방문 목록은 비운다', () => {
  const a = R.aggregate(demo(), '2026-10', null);
  assert.equal(a.hasPrev, false);
  assert.equal(a.export.prev_total, null);
  assert.ok(a.export.list.every((s) => s.note === '' && s.prev === null && s.diff === null));
  assert.equal(R.visitList(a).needsPrev, true);
  assert.equal(R.diffText(null), '확인 필요');
  assert.equal(R.rateText(10, null), '확인 필요');
});

test('방문 목록: 이탈 → 큰 폭 감소 → 신규 → 증가, 줄어든 항로 4곳', () => {
  const vl = R.visitList(R.aggregate(demo(), '2026-10', '2026-09'));
  assert.deepEqual(vl.items.map((x) => `${x.kind}:${x.shipper}:${x.reason}`), [
    '수입:바다수산:이탈', '수출:평택푸드:이탈', '수입:세원유통:감소', '수출:한빛케미칼:감소',
    '수출:하나기계:신규', '수입:우리상사:신규', '수출:동방철강:증가', '수입:그린바이오:증가', '수출:미래플라스틱:증가']);
  assert.deepEqual(vl.items.map((x) => x.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(vl.items[2].text, /줄어든 항로: 청도 27→17, 대련 10→5/);
  assert.deepEqual(vl.routes.map((r) => `${r.kind}:${r.port}:${r.diff}`), ['수입:대련:-16', '수입:청도:-11', '수출:호치민:-8', '수출:청도:-5']);
});

test('월별 추이: 첫 달은 비교 없음, 둘째 달은 +17 TEU · 신규 2 · 이탈 2', () => {
  const t = R.trend(demo());
  assert.deepEqual(t.map((r) => [r.month, r.export, r.import, r.total, r.diff, r.new, r.lost]), [['2026-09', 220, 162, 382, null, null, null], ['2026-10', 241, 158, 399, 17, 2, 2]]);
});

test('보고 문장: 합계 · 주요 도착지 · 변화 화주를 규칙이 쓴다', () => {
  const a = R.aggregate(demo(), '2026-10', '2026-09');
  const text = R.reportText(a, R.visitList(a));
  assert.match(text, /평택사무소 2026년 10월 영업실적 \(전월 2026년 9월 대비\)/);
  assert.match(text, /■ 수출 241 TEU \(전월 220, \+21 \/ \+9\.5%\)/);
  assert.match(text, /주요 도착지: 상해 60 · 하이퐁 40 · 청도 27/);
  assert.match(text, /줄어든 화주 한빛케미칼 -13/);
  assert.match(text, /■ 합계 399 TEU \(전월 382, \+17 \/ \+4\.5%\)/);
  assert.match(text, /이탈 2곳 · 큰 폭 감소 2곳 · 신규 2곳 · 줄어든 항로 4곳/);
});

test('결과 파일: 꼴 · 화주 H01 · 항구 D01/O01 · 실제 화주 이름이 들어가지 않음', () => {
  const p = demo();
  const a = R.aggregate(p, '2026-10', '2026-09');
  const doc = R.buildResult(a, R.visitList(a), { baseDate: '2026-10-27', rows: p.dataRows, sourceLabel: '가상 월별 실적 엑셀' });
  assert.equal(doc.schema_version, 1);
  assert.equal(doc.agent, 'sales-analysis');
  assert.equal(doc.bundle, 'E');
  assert.equal(doc.rules_version, 'aggregate@v1');
  assert.equal(doc.synthetic, true);
  assert.equal(doc.headline, '수출 241 TEU(+9.5%) · 수입 158 TEU(-2.5%), 신규 2 · 이탈 2');
  assert.deepEqual(doc.metrics.map((m) => [m.key, m.value, m.prev]), [['processed', 14, 14], ['export_teu', 241, 220], ['import_teu', 158, 162], ['new', 2, undefined], ['lost', 2, undefined]]);
  assert.equal(doc.table.rows.length, 17);
  assert.deepEqual(doc.table.rows[0], ['H01', '수출', 'D01', 46, '-1', '']);
  assert.deepEqual(doc.review.map((r) => r.reason), ['전월 대비 큰 폭 감소', '전월 대비 큰 폭 감소', '이탈 화주', '이탈 화주']);
  assert.match(doc.review[0].detail, /^H\d\d 수입 TEU 37→22 \(-15\), 방문 우선 검토$/);
  assert.match(doc.review[2].detail, /^H\d\d (수출|수입) 이번 달 실적 0, 전월 11$/);
  const text = JSON.stringify(doc);
  for (const real of ['가온통상', '동방철강', '한빛케미칼', '하나기계', '평택푸드', '상해', '하이퐁', '청도']) assert.ok(!text.includes(real), `${real} 이(가) 결과 파일에 들어감`);
  assert.deepEqual(doc.time, { before_min: 60, after_min: 15, runs_per_month: 22, basis: '추정' });
});

test('data/out/pyeongtaek-sales.json 은 지금 규칙·샘플로 다시 만든 것과 같다 (node scripts/build-sales-result.mjs)', () => {
  const p = demo();
  const a = R.aggregate(p, '2026-10', '2026-09');
  const saved = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/out/pyeongtaek-sales.json'), 'utf8'));
  const fresh = R.buildResult(a, R.visitList(a), { baseDate: saved.as_of, rows: p.dataRows, sourceLabel: '가상 월별 실적 엑셀' });
  assert.deepEqual(saved, JSON.parse(JSON.stringify(fresh)));
});
