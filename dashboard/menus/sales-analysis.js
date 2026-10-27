// 영업실적 분석 메뉴 화면 — 담당: 노현석
// 위쪽: 에이전트 도구 화면(js/sales/ 에 계산·화면) — 월별 실적 엑셀 → 영업 카드 · 월간 실적 보고서(수출표·수입표) · 방문 목록 · 월별 추이.
//   원본: 노현석 「월간 영업 카드」(노현석.html) 를 대시보드 규칙으로 옮기고, 엑셀을 이 브라우저에서 바로 집계하게 했다.
// 아래쪽: 에이전트 결과 파일(data/out/pyeongtaek-sales.json)이 홈 카드에 올리는 요약과 스킬 순서.
// 결과 파일은 `node scripts/build-sales-result.mjs` 로 다시 만든다(화주는 H01, 항구는 D01 · O01 로 가림).
import { hero, pipeline, resultTable, reviewList, timeSaving, info, howTo } from '../js/agent-page.js';
import { salesBoard } from '../js/sales/board.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');

  const tool = el('section', 'toolsec');
  const head = el('div', 'toolhead');
  head.append(
    el('h2', '', '월간 거래처 집계 · 방문 목록 · 실적 추이'),
    el('p', 'sub', '건별 실적 엑셀(월 · 화주 · 수출/수입 · POD/POL · TEU)을 올리면 수출은 도착지별, 수입은 선적지별로 화주 실적을 집계하고, 전월과 비교해 신규 · 이탈 · 증가 · 감소를 표시합니다. 이어서 이번 달 찾아갈 화주 순서와 월간 보고 문장을 만들어 줍니다. 보내기는 없습니다.'),
  );
  tool.append(head, salesBoard());

  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);

  page.append(hero(ctx), tool, pipeline(ctx), cols, howTo(ctx));
  return page;
}
