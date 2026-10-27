// 스페셜화물 승인 보조 메뉴 화면 — 담당: kim jaehyung
// 위쪽: 승인 보조 도구 — 승인 요청(DG · OOG · Flexibag)의 첨부 서류를 필수 서류표 · 서류 간 대조 · 규정 단계로 점검해 승인 · 확인 필요 · 거절로 나누고,
//   카드를 누르면 점검표와 회신 초안(승인 · 거절 · 보완 요청)을 보여 준다. 초안만 만들고 보내기는 없다.
//   원본: 운항팀 Outlook 업무 메일 자동 초안 모음(ops-mail-automation)의 「스페셜 화물 승인」 흐름을 대시보드 규칙으로 옮긴 것.
//   점검 규칙 js/approval/rules.js, 초안 문구 js/approval/drafts.js, 자료 data/in/special-cargo-approval/.
// 아래쪽: 에이전트 결과 파일(data/out/special-cargo-docs.json)이 홈 카드에 올리는 요약과 스킬 순서.
//   결과 파일은 `node scripts/build-special-cargo-approval-result.mjs` 로 같은 자료·같은 규칙에서 다시 만든다.
import { hero, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { approvalDesk } from '../js/approval/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const tool = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', '스페셜화물 승인 점검 · 회신 초안'),
    el('p', 'sub', 'DG · OOG · Flexibag 승인 요청에 첨부된 서류가 규정에 맞는지 한꺼번에 점검합니다(필수 서류 → 서류끼리 대조 → 금지 목록·IMDG·CAS·한도). 애매한 건은 초안 없이 직접 확인으로 넘기고, 초안은 글만 만들어 줍니다. 보내기는 없습니다.'),
  );
  tool.append(head, approvalDesk());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), tool, pipeline(ctx), cols, howTo(ctx));
  return page;
}
