---
name: speed-consumption-calc
description: 속도별 소모량 산출 — 정제된 행을 반올림한 속력(kn)별로 묶어 평균 RPM·FO·MGO·TOTAL(MT/day)을 계산한다
---

# 속도별 소모량 산출

> 에이전트: 소모량 분석 에이전트 (다니엘) · 상태: **작성됨** · 코드: `dashboard/js/bunker/performance.js` 의 `analyze`

## 언제 쓰나
`segment-cleanup` 이 쓸 행을 남긴 다음. 선박 1~2척을 같은 조건으로 계산해 곡선을 비교한다.

## 입력
쓸 행(날짜, RH, 속력, RPM, Slip, FO, MGO) + 조건.

## 하는 일 (순서대로)
1. **속력 묶기**: `Math.round(AVG_SPD)` 로 1kn 단위 묶음(14.5 → 15, 15.49 → 15).
2. **하루 소모량으로 환산**: FO·MGO = 소모량 ÷ RH × 24. (예: 12시간에 10MT → 20MT/day)
3. **묶음 평균**: RPM, FO, MGO 각각 `합 ÷ 묶음 행 수`. **RH 가 0 인 행은 소모량 0 으로 더하되 행 수(분모)에는 남는다** — 평균이 낮아지는 게 원본 규칙이다.
4. **TOTAL** = `round1(FO) + round1(MGO)` 를 다시 소수 1자리로. (FO 10.05 + MGO 20.05 → 10.1 + 20.1 = 30.2)
5. 속력 높은 순으로 정렬.

## 출력
행 = 속력(kn) · 건수 · RPM · FO · MGO · TOTAL. 결과 파일 표에는 선박코드·선박명·속도·TOTAL·건수로 줄여 넣는다(`scripts/build-bunker-result.mjs`).

## 확인 필요로 넘길 때
- 속력 묶음의 건수가 **3건 미만** → 표에서 회색, review 에 「표본이 적은 속도」(예: MEBG 12kn(1건)).
- 조건에 맞는 행이 0건 → 맞다고 처리하지 않고 "범위를 넓혀 보라"고 안내.

## 비고
FO 는 한 종류로만 보고되어 VLSFO/HSFO 구분이 없다. 계산은 규칙이 하고 AI 는 숫자를 계산하지 않는다.
