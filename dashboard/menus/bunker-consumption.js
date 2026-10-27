// 소모량 분석 메뉴 화면 — 담당: 다니엘
// 위쪽: 속력별 소모량 조회(Speed Performance) — operation-dashboard 의 같은 메뉴를 옮겨 온 것(js/bunker/ 에 계산·자료·화면).
// 아래쪽: 에이전트 결과 파일(data/out/bunker-consumption.json)이 홈 카드에 올리는 요약과 스킬 순서.
// 선박명·코드는 실제, 수치는 가상. 실제 NOON REPORT 로 바꾸려면 js/bunker/noon-synthetic.js 의 getHistory() 만 바꾼다.
import { hero, headline, metrics, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { speedPerformance } from '../js/bunker/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const tool = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', '속력별 소모량 조회 (Speed Performance)'),
    el('p', 'sub', '선박 코드로 NOON REPORT 를 모아 속력별 평균 RPM·FO·MGO(MT/day)를 계산합니다. 선박 2를 넣으면 비교합니다.'),
  );
  tool.append(head, speedPerformance());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), headline(ctx), metrics(ctx), tool, pipeline(ctx), cols, howTo(ctx));
  return page;
}
