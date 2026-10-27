---
name: empty-stock
description: 일일 재고 브리핑 에이전트 — TODO 한 줄로: 언제 이 에이전트를 부르는지, 무엇을 내놓는지
---

# 일일 재고 브리핑 에이전트

> 담당: hjung · 묶음 A · 메뉴: dashboard 의 「일일 재고 현황」
> 상태: **작성 전** — 아래 TODO 를 채운다. 다 쓰면 dashboard/js/menus.js 에서 스킬 status 를 'done' 으로 바꾼다.

## 해결할 병목
TODO: 내 「내병목」 파일(내병목_….md)의 병목 한 줄과 지금 걸리는 시간(전)

## 입력
TODO: 어떤 자료가 들어오는지 (data/in/ 의 가상 샘플 파일 이름 · 양식)

## 스킬을 부르는 순서
1. `stock-excel-parser` — 재고 Excel 파서 (skills/stock-excel-parser/SKILL.md)
2. `over-short-judge` — 과잉/부족 판정 (skills/over-short-judge/SKILL.md)
3. `transfer-candidate-summary` — 공이송 후보 요약 (skills/transfer-candidate-summary/SKILL.md)

TODO: 각 단계의 입력 → 출력, 막혔을 때(양식이 다르거나 값이 비었을 때) 어떻게 하는지

## 쓰는 공통 규칙
- `lib/threshold.md`

## 출력
`data/out/empty-stock.json` — lib/result-shape.md 꼴. 확신이 낮은 건은 review 에 넣는다.

## 화면 (메뉴 「일일 재고 현황」)
- SKR + HAL 공컨테이너(22GP/45GP) **항구별 재고 현황**: KPI · 국가 목록 · 항구 표 · 항구 상세(`dashboard/js/stock/board.js`). 재고현황.html 을 옮겨 온 것.
- 자료는 `data/in/empty-stock-ports.json`(수량이 없으면 null = 보고 없음). 이 파일을 바꾸면 화면이 1분 안에 따라온다.
- 결과 파일은 `node scripts/build-empty-stock-result.mjs` 로 같은 자료에서 다시 만든다(합계 · TEU = 22GP + 45GP × 2 · 확인 필요).
- 지금 자료는 **가상 데이터**라 결과 파일의 `synthetic` 이 true 다. 실제 수량으로 바꾸면 `synthetic` 을 false 로 하고, CLAUDE.md 에 따라 공개 주소에 올리기 전에 입장 비밀번호를 먼저 건다.
- 아직 이 화면에 없는 것: 지역별 적정재고 대비 과잉/부족 판정(`over-short-judge`), 공이송 후보 요약. 적정재고 기준표가 생기면 이어서 붙인다.

## 지킬 것
- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액·용선료는 넣지 않는다.
- 보내기 기능은 만들지 않는다. 메일·알림은 초안 글만 만들고, 발송은 사람이 직접 한다.
- 숫자는 lib/ 규칙이 계산한다. AI 는 계산하지 않고 확인 목록의 문장 정리만 맡는다.
- 확신이 낮은 값은 맞다고 처리하지 않고 review(확인 필요)로 넘긴다. 최종 결정은 사람이 한다.
- 선박·컨테이너·화주 이름은 lib/mask.md 규칙으로 코드(S01·C01·H01)로 바꾼 뒤에만 AI 에 보낸다.

## 4회차에 만들어 올 것
가상 지역별 재고 엑셀 3곳 · 지역별 적정재고 기준표 · 과잉/부족 순위 결과 파일
