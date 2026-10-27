// 일일 재고 현황 메뉴 화면 — 담당: hjung
// 위쪽: SKR + HAL 공컨테이너(22GP/45GP) 항구별 재고 현황(재고현황.html 을 옮겨 온 것, js/stock/board.js, 자료는 data/in/empty-stock-ports.json).
// 아래쪽: 에이전트 결과 파일(data/out/empty-stock.json)이 홈 카드에 올리는 요약과 스킬 순서.
// 결과 파일은 `node scripts/build-empty-stock-result.mjs` 로 같은 자료에서 다시 만든다.
import { hero, headline, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { stockBoard } from '../js/stock/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const sec = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', '항구별 공컨테이너 재고 (SKR + HAL · 22GP / 45GP)'),
    el('p', 'sub', '항구별 최신 수신 메일 기준 · 단위: 개(BOX) · Total TEU = 22GP + 45GP × 2'),
  );
  sec.append(head, stockBoard());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), headline(ctx), sec, pipeline(ctx), cols, howTo(ctx));
  return page;
}
