// 일본 공이송 플래너 메뉴 화면 — 담당: 권도윤
// 기본 화면(요약 · 이송안 표 · 확인 필요 · 시간 전/후 · 스킬 순서)에 「정해진 규칙 · 실행 방법」 안내를 끼워 넣었다.
// 이송안 계산은 agents/japan-empty-transfer/skills/*/scripts 의 Python 이 하고, 이 화면은 그 결과 파일
// (data/out/japan-empty-transfer.json)을 보여 준다. 결과 파일은 `node scripts/build-japan-result.mjs` 로 다시 만든다.
import { hero, headline, metrics, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { el } from '../js/core.js';

const RULES = [
  '이송안은 초안이다. 확정은 사람이 한다.',
  '한 모선 안에서만 이송한다(모선 갈아타는 환적 없음). 먼저 기항한 포트의 잉여를 이후 기항 포트의 부족분으로 보낸다.',
  '모선 잔여 스페이스는 모선당 TEU 하나를 모든 타입이 나눠 쓴다. TEU 환산: 22GP=1 · 42GP=2 · 45GP=2 · 22RE=1 · 45RE=2 · 22UT=1 · 42UT=2 · 22PC=1 · 42PC=2.',
  '일본 내에 잉여가 있는 특수 컨테이너(RF·OT·FR)가 Dry보다 먼저 배정된다. 스페이스가 모자라면 뒤 타입이 먼저 잘린다.',
  '선적 포트의 Cut-off 가 비어 있으면 그 포트에서 선적하는 이송은 배정하지 않고 확인을 요청한다.',
  '수량은 스크립트만 계산한다. 원본 합계와 어긋나면 이송안을 쓰지 말고 시스템 수치부터 확인한다.',
];

const STEPS = [
  ['input-cleanup', 'normalize.py', '시스템 CSV 3종 → 표준 과부족 표(balance · schedule · space)'],
  ['transfer-candidate-calc', 'plan.py', '표준 표 + type_teu.csv → plan · flags · space_events'],
  ['verify-report', 'verify.py', '재검산 + 한 장 보고서 report.md (조회 시각 · 원본 합계 대조)'],
];

function guide(ctx) {
  const p = el('section', 'glass panel');
  const head = el('div', 'phead');
  head.append(el('h2', '', '정해진 규칙 · 실행 방법'), el('span', 'sub', 'agents/japan-empty-transfer/SKILL.md'));
  p.append(head);

  const rules = el('ul', 'rules');
  RULES.forEach((s) => rules.append(el('li', '', s)));
  p.append(rules);

  const steps = el('ol', 'steps');
  STEPS.forEach(([skill, script, what], i) => {
    const li = el('li', 'step');
    li.append(el('span', 'stepno', String(i + 1)));
    const body = el('div', 'stepbody');
    body.append(el('b', '', `${skill} · ${script}`), el('code', '', what));
    li.append(body);
    steps.append(li);
  });
  p.append(steps);

  p.append(
    el('p', 'sub', '실행: Python 3 이 있는 PC 에서 프로젝트 루트의 명령을 차례로 실행(SKILL.md 「처음 실행해 보기」). 가상 샘플은 data/in/japan-empty-transfer/sim2/, 최종 결과는 data/out/japan-empty-transfer/out/ (report.md 포함).'),
    el('p', 'sub', '한계: 배정 규칙은 휴리스틱이라 모든 경우에 최적은 아니다. 실제 시스템 파일로는 아직 돌려 보지 않았다(열 이름 · 타입 표기 확인 필요). 대리점 메일은 발송하지 않고 초안만 쓴다.'),
  );
  return p;
}

export default function render(ctx) {
  const page = el('div', 'page');
  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);
  page.append(hero(ctx), headline(ctx), metrics(ctx), pipeline(ctx), guide(ctx), cols, howTo(ctx));
  return page;
}
