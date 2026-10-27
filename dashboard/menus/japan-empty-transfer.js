// 일본 공이송 플래너 메뉴 화면 — 담당: 권도윤
// 위쪽: 「이송안 만들기」 — CSV 를 고르거나 가상 샘플을 불러오면 브라우저 안에서 입력 정리 → 이송 후보 계산 → 검증·보고를 돌린다
//       (js/japan/planner.js = agents/japan-empty-transfer/skills 의 Python 3개를 옮긴 것. node --test scripts/test-japan.mjs 로 Python 결과와 대조).
// 아래쪽: 기본 화면(요약 · 이송안 표 · 확인 필요 · 시간 전/후 · 스킬 순서)과 「정해진 규칙」 안내.
//         홈 카드가 읽는 결과 파일(data/out/japan-empty-transfer.json)은 `node scripts/build-japan-result.mjs` 로 다시 만든다.
import { hero, headline, metrics, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { plannerBoard } from '../js/japan/board.js';
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
    el('p', 'sub', '실행: 위의 「이송안 만들기」가 브라우저에서 바로 돈다(js/japan/planner.js). Python 3 이 있는 PC 에서는 같은 계산을 프로젝트 루트의 명령으로도 돌릴 수 있다(SKILL.md 「처음 실행해 보기」). 두 결과는 같아야 하고 node --test scripts/test-japan.mjs 가 그것을 확인한다. 가상 샘플: data/in/japan-empty-transfer/sim2/, 최종 결과: data/out/japan-empty-transfer/out/.'),
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
  const sec = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', '이송안 만들기 (에이전트 실행)'),
    el('p', 'sub', 'CSV 3종을 고르거나 가상 샘플을 불러와 실행 · 입력 정리 → 이송 후보 계산 → 검증·보고 · 브라우저 안에서만 계산하고 파일은 서버로 보내지 않습니다'),
  );
  sec.append(head, plannerBoard());
  page.append(hero(ctx), headline(ctx), sec, metrics(ctx), pipeline(ctx), guide(ctx), cols, howTo(ctx));
  return page;
}
