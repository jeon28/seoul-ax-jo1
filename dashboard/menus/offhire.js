// Off hire 관리 메뉴 화면 — 담당: ijryu
// 위쪽: 에이전트 도구 화면(js/offhire/ 에 계산·화면) — Off-hire 엑셀 검산 → 협정 대장 → Declaration · Claim 문구 초안.
// 아래쪽: 에이전트 결과 파일(data/out/offhire-ledger.json)이 홈 카드에 올리는 요약과 스킬 순서.
// 결과 파일은 `node scripts/build-offhire-result.mjs` 로 다시 만든다(금액 없음, 선박은 S01 로 가림).
import { hero, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { offhireBoard } from '../js/offhire/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const tool = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', 'Off-hire 검산 · 협정 대장 · 문구 초안'),
    el('p', 'sub', '사내 시스템의 Off Hire Claim 엑셀을 올리면 Days·커미션·Hire Total·Bunker·TOTAL·합계 행을 다시 계산해 맞춰 보고, 협정 상태를 대장에 적고, Claim·Declaration 영문 문구를 화면 글로 만듭니다. 보내기는 없습니다.'),
  );
  tool.append(head, offhireBoard());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), tool, pipeline(ctx), cols, howTo(ctx));
  return page;
}
