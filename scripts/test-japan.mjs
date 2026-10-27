// 일본 공이송 플래너 계산 규칙(dashboard/js/japan/planner.js) 테스트.  실행: node --test scripts/test-japan.mjs
// 기준: Python 스크립트로 돌린 최종 결과(data/out/japan-empty-transfer/out/)와 글자 단위로 같아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, runPlanner, InputError, toCsv, PLAN_COLS, FLAG_COLS, EVENT_COLS, normalize, canonType } from '../dashboard/js/japan/planner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'data/in/japan-empty-transfer');
const OUT = path.join(ROOT, 'data/out/japan-empty-transfer/out');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const teuText = read(path.join(ROOT, 'agents/japan-empty-transfer/config/type_teu.csv'));
const load = (dir, names) => ({ balance: parseCsv(read(path.join(IN, dir, names[0]))), schedule: parseCsv(read(path.join(IN, dir, names[1]))), space: parseCsv(read(path.join(IN, dir, names[2]))) });
const SIM2 = ['inventory.csv', 'schedule.csv', 'space.csv'];

test('sim2: Python 최종 결과와 같다 (plan · flags · space_events · report)', () => {
  const r = runPlanner({ raw: load('sim2', SIM2), teuText, sourceText: read(path.join(IN, 'sim2/source_totals.csv')), queriedAt: '2026-10-27 10:30' });
  assert.equal(toCsv(PLAN_COLS, r.plan.map((x) => PLAN_COLS.map((c) => x[c]))), read(path.join(OUT, 'plan.csv')));
  assert.equal(toCsv(FLAG_COLS, r.flags.map((x) => FLAG_COLS.map((c) => x[c]))), read(path.join(OUT, 'flags.csv')));
  assert.equal(toCsv(EVENT_COLS, r.spaceEvents.map((x) => EVENT_COLS.map((c) => x[c]))), read(path.join(OUT, 'space_events.csv')));
  assert.equal(r.check.report, read(path.join(OUT, 'report.md')));
  assert.equal(r.check.passed, true);
});

test('sim2: 입력 정리 결과가 balance · schedule · space 최종 파일과 같다', () => {
  const r = runPlanner({ raw: load('sim2', SIM2), teuText });
  const out = path.join(ROOT, 'data/out/japan-empty-transfer');
  for (const k of ['balance', 'schedule', 'space']) {
    const n = r.normalized[k];
    assert.equal(toCsv(n.cols, n.rows.map((x) => n.cols.map((c) => x[c]))), read(path.join(out, `${k}.csv`)));
  }
});

test('sim: 원본 합계(45GP 일부러 틀림)는 검증 실패', () => {
  const r = runPlanner({ raw: load('sim', ['보유현황.csv', '모선스케줄.csv', '잔여스페이스.csv']), teuText, sourceText: read(path.join(IN, 'sim/원본합계.csv')), queriedAt: 'x' });
  assert.equal(r.check.passed, false);
  assert.ok(r.check.results.some((x) => x.name.includes('45GP') && x.ok === false));
  assert.match(r.check.report, /수량 검증 실패/);
});

test('sim: 선적 포트 Cut-off 가 비면 그 이송은 배정하지 않는다', () => {
  const ok = runPlanner({ raw: load('sim', ['보유현황.csv', '모선스케줄.csv', '잔여스페이스.csv']), teuText });
  const raw = load('sim', ['보유현황.csv', '모선스케줄_TOKYO마감누락.csv', '잔여스페이스.csv']);
  const r = runPlanner({ raw, teuText });
  assert.ok(r.flags.some((f) => f.flag === 'CUTOFF_MISSING' && f.detail.startsWith('TOKYO')));
  assert.ok(r.flags.some((f) => f.flag === 'CUTOFF_BLOCKED' && f.target.endsWith('TOKYO')));
  assert.ok(r.plan.every((p) => p.from !== 'TOKYO'), 'TOKYO 에서 선적하는 이송은 없다');
  assert.ok(r.plan.every((p) => p.cutoff), '배정된 이송은 모두 Cut-off 가 있다');
  assert.ok(r.plan.length <= ok.plan.length);
});

test('열 이름을 못 찾으면 멈춘다', () => {
  assert.throws(() => normalize('balance', parseCsv('a,b,c\n1,2,3')), InputError);
});

test('숫자가 아닌 값·빈 값은 멈춘다', () => {
  assert.throws(() => normalize('balance', parseCsv('Port,Type,Onhand,Required\nX,22GP,abc,1')), /숫자가 아님/);
  assert.throws(() => normalize('balance', parseCsv('Port,Type,Onhand,Required\nX,22GP,,1')), /숫자가 아님/);
});

test('타입 표기 통일: 20DC→22GP, 40HQ→45GP, size+type 합치기', () => {
  assert.equal(canonType("20'DC"), '22GP');
  assert.equal(canonType("40'HQ"), '45GP');
  assert.equal(canonType('HC', '40'), '45GP');
  assert.equal(canonType('RE', '22'), '22RE');
});

test('TEU 환산값을 모르는 타입은 멈춘다', () => {
  const raw = { balance: parseCsv('Port,Type,Onhand,Required\nA,99XX,5,1\nB,99XX,0,4'), schedule: parseCsv('Vessel,Voyage,Seq,Port,ETD,CutOff\nV,1,1,A,2026-10-28,x\nV,1,2,B,2026-10-29,y'), space: parseCsv('Vessel,Voyage,Space\nV,1,50') };
  assert.throws(() => runPlanner({ raw, teuText }), /TEU 환산값을 모름/);
});
