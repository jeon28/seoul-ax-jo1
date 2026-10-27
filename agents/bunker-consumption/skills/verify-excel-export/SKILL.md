---
name: verify-excel-export
description: 검증·엑셀 출력 — 정박 중 소모량을 두 출처(TDR 실적·선박 제원)로 맞춰 보고, 결과를 CSV(엑셀에서 열기)와 결과 파일로 내놓는다
---

# 검증·엑셀 출력

> 에이전트: 소모량 분석 에이전트 (다니엘) · 상태: **작성됨** · 코드: `dashboard/js/bunker/portcalc.js`(`summarizePort`) · `performance.js`(`toCsv`) · `scripts/build-bunker-result.mjs`

## 언제 쓰나
속도별 표가 나온 뒤. 항해 중 곡선만으로는 하루 총소모를 말할 수 없어서 정박 중 소모량을 같이 보고 검증한다.

## 입력
- TDR 입출항 기록 최근 12개월: 항구, 입항(TA)·출항(TD) 시각, 입항/출항/공급 ROB(AFO·DFO·SFO, ADO·DDO·SDO).
- 선박 제원의 Port MT(미입력일 수 있음).

## 하는 일 (순서대로)
1. **기항별 정박 소모량**: (입항 ROB + 공급 − 출항 ROB) ÷ 체류시간 × 24. 같은 기항이 두 번 올라오면(`항구|입항시각`) 한 번만.
2. **믿을 수 없는 기항은 0 이 아니라 건너뛴다**:
   - 입항 FO == 출항 FO 정확히 같음 → 정박 소모량을 입력하지 않고 복사한 것 (**미입력**)
   - 출항 FO > 입항 FO + 20 이고 공급량 0 → 벙커링했는데 공급량 미기록 (**벙커링**)
   - ROB 없음/0, 체류 4시간 미만, 감소량 음수, 하루 60MT 초과 → **오류**
3. **중앙값**을 대표로 쓴다(평균은 오타 한 건에 흔들린다). MGO 는 같은 기항에서 벙커링하지 않았을 때만.
4. **대표값 고르기**: TDR 사용 건수 ≥ 5 이면 TDR 이 대표값, 아니면 선박 제원 Port MT. 둘 다 없으면 "직접 입력 필요".
5. **출력**: 화면의 「CSV 저장」(`VESSEL,SPEED,N,RPM,FO,MGO,TOTAL`, 한글 엑셀용 BOM) + `node scripts/build-bunker-result.mjs` 로 결과 파일 갱신.

## 출력
`data/out/bunker-consumption.json` (headline · metrics · table · review · time · source · rules_version · synthetic) 와 CSV.

## 확인 필요로 넘길 때
- TDR 사용 5건 미만이고 제원 Port MT 도 없음 → 「정박 소모량 근거 없음」.
- TDR 중앙값과 제원 Port MT 가 50% 넘게 차이 → 「정박 소모량 두 출처 차이 큼」(어느 쪽을 쓸지는 사람이 정한다).
- 건너뛴 기항 수(미입력·벙커링·오류)는 화면 "근거" 칸에 항상 표시한다.
