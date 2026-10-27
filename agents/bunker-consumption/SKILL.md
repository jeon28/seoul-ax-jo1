---
name: bunker-consumption
description: 소모량 분석 에이전트 — 선박 코드로 NOON REPORT 이력을 모아, 입력 오류·중복을 걸러 속력별 평균 RPM·FO·MGO(MT/day)와 정박 중 소모량을 계산하고, 의심 구간만 확인 필요로 넘긴다
---

# 소모량 분석 에이전트

> 담당: 다니엘 · 묶음 D · 메뉴: dashboard 의 「소모량 분석」
> 상태: **스킬 3개 작성됨** (operation-dashboard 의 Speed Performance 를 옮겨 와 붙임). 숫자·문구는 담당이 다듬는다.

## 해결할 병목
누적 항해 자료에서 이상치·제외 구간을 손으로 걸러 속도별 연료 소모량을 계산하던 일(일 1회 10분 → 에이전트 2분, 추정).

## 입력
- 선박 코드 1~2개(비교용). 선박명·코드는 **실제**: `data/in/vessels.json` (66척).
- NOON REPORT 이력: 날짜·RH(운항 시간)·AVG_SPD·RPM·SLIP·CONS_IFO·CONS_MGO. 지금은 **가상**(`dashboard/js/bunker/noon-synthetic.js`, 선박 코드로 시드를 고정해 같은 선박은 항상 같은 값).
- 정박 기록(TDR) 최근 12개월 + 선박 제원 Port MT. 이것도 가상.

## 스킬을 부르는 순서
1. `segment-cleanup` — 구간 정제 (skills/segment-cleanup/SKILL.md)
2. `speed-consumption-calc` — 속도별 소모량 산출 (skills/speed-consumption-calc/SKILL.md)
3. `verify-excel-export` — 검증·엑셀 출력 (skills/verify-excel-export/SKILL.md)

각 단계의 판단이 애매하면 맞다고 처리하지 않고 review 로 넘기고 다음 단계는 계속 진행한다(한 선박의 문제가 다른 선박을 멈추지 않게).

## 제외 규칙 숫자표 (코드 = `dashboard/js/bunker/performance.js` · `portcalc.js`)

| 항목 | 기본값 | 뜻 |
|---|---|---|
| RH(운항 시간) | 23 ~ 25 | 하루 전체를 항해한 날만(입출항일 제외) |
| Slip | −10 ~ 10 | 범위 밖은 측정 이상 |
| 속력 하한/상한 | 12 ~ 18 kn | 저속·고속 구간 제외, 실제 운항 속력대만(화면에서 5~25 로 조절) |
| 기간 | 전체 / 3년 / 2년 / 1년 / 6개월 | 기준일부터 거꾸로 |
| 이상치 | 하루 환산 FO 또는 MGO > 그 선박 FO 중앙값 × **5** | 누적값·오타. 정상 항해 행 10개 이상이어야 기준선을 만든다 |
| 표본 부족 | 속력별 건수 < **3** | 평균은 내되 회색 표시, review 에 올린다 |
| 정박 TDR | 체류 4시간 이상, 하루 60MT 이하, 사용 5건 이상 | 미만이면 참고용, 제원 Port MT 가 대표값 |

숫자를 바꾸면 `RULES_VERSION` 을 올리고(`aggregate@v1` → `v2`) 결과 파일의 `rules_version` 도 따라간다.

## 출력
`data/out/bunker-consumption.json` — lib/result-shape.md 꼴. `node scripts/build-bunker-result.mjs` 로 위 규칙을 돌려 다시 만든다.
화면: 소모량 분석 메뉴 위쪽의 「속력별 소모량 조회」(2척 비교, 표·그래프·CSV).

## 쓰는 공통 규칙
- 집계 · 이상치 제외 · 전/후 시간 계산은 `lib/aggregate.md` 에 합칠 내용이다(ijryu · 노현석과 공용이라 이 에이전트의 규칙은 위 표에 먼저 둠).

## 지킬 것
- **이 에이전트만 예외**: 선박명·선박코드는 실제를 쓴다(2026-10-27 결정). 속력·RPM·소모량·정박 기록은 전부 가상. 실제 용선료·금액은 넣지 않는다.
- 선박 코드(MEBG 같은)는 `lib/mask.md` 의 코드 형식(S01)이 아니라서, 홈의 「AI 로 문장 정리」 서버(`api/summarize.js`)가 이 에이전트의 확인 필요 건을 걸러 낸다. 즉 실제 선박 코드는 AI 로 나가지 않고, AI 정리 결과에는 이 에이전트의 건이 빠진다(이 에이전트 건만 있으면 규칙 묶음 요약이 대신 나온다).
- 보내기 기능은 만들지 않는다. 숫자는 규칙이 계산하고 AI 는 계산하지 않는다. 확신이 낮은 값은 review 로 넘긴다.

## 4회차에 만들어 올 것
가상 항해 일지(NOON REPORT) · 제외 규칙 숫자표(위) · 속도별 소모량 결과 파일 — 모두 이 폴더와 `dashboard/js/bunker/` 에 있다. 남은 일: 실제 자료(엑셀)를 올려 계산하는 입력부.
