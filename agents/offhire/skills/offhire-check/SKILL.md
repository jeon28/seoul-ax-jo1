---
name: offhire-check
description: offhire 검산 — Off-hire 엑셀의 Days·커미션·Hire Total·Bunker·TOTAL·합계 행을 다시 계산해 맞춰 보고, 빈 칸·건끼리 다른 조건·기간 겹침을 확인 필요로 표시한다
---

# offhire 검산

> 에이전트: Off-hire 협정 에이전트 (ijryu) · 상태: **작성됨** · 코드: `dashboard/js/offhire/rules.js` 의 `readSheet` · `run` · `counts`

## 언제 쓰나
Off-hire 청구 엑셀을 받으면 항상 첫 단계. Claim 문구를 쓰기 전에 엑셀에 적힌 값이 맞는지 먼저 본다.

## 입력
Off-hire 엑셀 첫 시트(배열의 배열), 선박 코드(파일 이름 앞 4글자 또는 화면 입력). 머리글 23칸 중 하나라도 없으면 "머리글에 없는 칸: …" 으로 멈추고, `SEQ` 머리글 행이 없으면 읽지 않는다.

## 하는 일 (순서대로)
금액 계산은 엑셀에 **기입된 Days** 를 기준으로 한다(Days 가 틀려도 그 오류가 다른 칸으로 번지지 않게). 금액 허용 차이 0.05.

| 규칙 | 계산 | 다르면 |
|---|---|---|
| 검산 1 Days | End Date − Start Date (일, 허용 0.0005일) | 불일치 |
| 검산 2 커미션 | ADD.C AMT = Days × Hire × ADD.C% · BRK AMT = Days × Hire × BRK% | 불일치 |
| 검산 3 Hire Total | Days × Hire − ADD.C AMT − BRK AMT | 불일치 |
| 검산 4 Bunker | F/O Total = F/O Qty × F/O Price · D/O Total = D/O Qty × D/O Price | 불일치 |
| 검산 5 TOTAL | Hire Total + F/O Total + D/O Total + CEV AMT + Lash/Material + VAT | 불일치 |
| 검산 6 합계 행 | 합계 행의 각 금액 = 건별 합 | 불일치 (건이 아니라 `합계` 줄로) |
| 점검 1 빈 칸·기간 | Start/End/Days/Hire/TOTAL 빈 칸, Remark(사유) 빈 칸, End ≤ Start | 확인 필요 |
| 점검 2 건끼리 비교 | Hire 일 단가·ADD.C %·BRK %·CEV 일 단가(CEV AMT ÷ Days)가 가장 많이 나온 값과 1% 넘게 다름 | 확인 필요 |
| 점검 3 기간 겹침 | 다른 건과 Off-hire 기간이 겹침 | 확인 필요 |

한 건에 문제가 여러 개면 가장 무거운 것을 그 건의 판정으로 쓴다: `불일치` > `확인 필요` > `일치`. 이 입력에는 짝을 맞출 두 번째 자료가 없어 `짝 없음` 은 쓰지 않는다.

## 출력
- 건별 행(금액 포함, 화면 안에서만): 기입값 · 계산값 · 문제 목록 · 판정. 화면 표는 빨간 칸(기입값이 계산값과 다름, 작은 글씨로 계산값) · 노란 칸(확인 필요).
- `data/out/offhire-ledger.json` 의 `table`(금액 없는 건별 표) · `review`(문제 하나마다 한 줄) · `metrics`(검산 건수 · 검산 경고).
- 가상 샘플(`demo-off-hire.xlsx`) 4건의 기대 결과: 001 일치 · 002 Days 불일치(기입 0.775일 / 계산 0.75일) · 003 F/O Total 불일치(약 2.9%) · 004 Remark 비어 있음 + Hire 일 단가 4.2% 다름(확인 필요).

## 확인 필요로 넘길 때
- 빈 칸·기간 오류·Remark 비어 있음 → 「… 확인 필요」. 값을 짐작해서 채우지 않는다.
- 건끼리 비교는 같은 값이 2번 이상 나온 항목만 기준으로 삼는다(건이 1~2개뿐이면 비교하지 않는다).
- 금액이 다를 때 `review` 에는 금액을 쓰지 않고 "몇 % 다름" 이나 일수만 쓴다. 선박은 `S01`.
- 시간대(UTC/LT)·C/P 조항으로 판단해야 하는 차이는 이 스킬이 결론 내지 않는다(사람이 확인).
