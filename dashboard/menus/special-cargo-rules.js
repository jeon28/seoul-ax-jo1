// 스페셜화물 내규 판정 메뉴 화면 — 담당: 이병선
// 위쪽: DG 승인 데스크 — DG Application 신청을 금지 리스트(VER.10 · VER.11)로 판정해 승인 · 보류 · 거절로 나누고, 카드를 누르면 회신 초안(승인안 · 거절안)을 보여 준다.
//   공유본(DG_승인_데스크_발표용_공유본.html)을 옮겨 온 것. 판정 규칙 js/dgdesk/rules.js, 초안 문구 js/dgdesk/drafts.js, 자료 data/in/special-cargo-rules/.
// 아래쪽: 에이전트 결과 파일(data/out/special-cargo-rules.json)이 홈 카드에 올리는 요약과 스킬 순서.
//   결과 파일은 `node scripts/build-special-cargo-rules-result.mjs` 로 같은 자료·같은 규칙에서 다시 만든다.
import { hero, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { dgDesk } from '../js/dgdesk/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const tool = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', 'DG 승인 데스크'),
    el('p', 'sub', 'KQS · KBX · SRS · PVS2 폴더의 DG Application 을 금지 리스트로 판정하고, 승인안·거절안 회신 초안을 만듭니다. 초안만 만들고 보내기는 없습니다.'),
  );
  tool.append(head, dgDesk());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), tool, pipeline(ctx), cols, howTo(ctx));
  return page;
}
