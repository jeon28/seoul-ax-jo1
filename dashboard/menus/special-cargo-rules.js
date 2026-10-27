// 스페셜화물 내규 판정 메뉴 화면 — 담당: 이병선
// 기본 화면(결과 표 · 확인 필요 · 시간 전/후 · 스킬 순서)이 이미 나옵니다. 그대로 써도 됩니다.
// 바꾸고 싶으면 아래 default 함수 안을 고치세요. 이 파일만 고치면 다른 조원 화면에는 영향이 없습니다.
// 쓸 수 있는 조각: hero · headline · metrics · pipeline · resultTable · reviewList · timeSaving · info · howTo
// ctx = { menu, doc(결과 파일, 빈 칸 채움), raw(원본 또는 null), problems, all(12개 전부) }
import { renderAgentPage } from '../js/agent-page.js';

export default function render(ctx) {
  return renderAgentPage(ctx);
}
