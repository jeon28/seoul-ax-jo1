---
name: input-cleanup
description: 일본 공이송 플래너 1단계(입력 정리). 장비관리 시스템에서 내려받은 EMPTY 보유현황·모선 기항 순서·잔여 스페이스 CSV를 표준 형식으로 변환하고 타입(DC/HC/RF/OT/FR)을 분리한다. 공이송 계획의 입력 파일을 정리할 때 사용.
---

# 입력 정리

> 에이전트: 일본 공이송 플래너 (권도윤) · 상태: **작성 완료** · 원래 이름 `input-normalize`

## 언제 쓰나
공이송 계획의 첫 단계. 시스템에서 내려받은 원본 CSV 를 다음 스킬(`transfer-candidate-calc`)이 읽는 표준 형식으로 바꿀 때.

## 입력
사용자가 시스템에서 내려받은 파일 3종 (엑셀이면 CSV로 저장해서 전달):
1. 포트·타입별 EMPTY 보유수량과 수출 부킹 필요수량. 타입은 시스템 코드로 계산한다: 22GP(20DC), 42GP(40DC), 45GP(40HC=40'HQ), 22RE·45RE(RF), 22UT·42UT(OT), 22PC·42PC(FR). `20'DC`, `40'HQ` 같은 표기는 스크립트가 코드로 통일하고, 길이가 별도 열(size)이면 합친다. 길이가 없는 `DC`·`RF`·`OT`는 TEU 환산이 안 되므로 사람에게 길이를 확인한다.
2. 내일 출항 모선의 기항 순서 (+ ETD, Cut-off)
3. 모선 전체 잔여 스페이스 (**모선당 TEU 하나**, 모든 타입이 공유. 타입별 값이나 개수 단위로 받았다면 사람에게 확인)

**조회 시각**을 반드시 받는다. 없으면 사람에게 묻는다.
가상 샘플: `data/in/japan-empty-transfer/sim2/` (inventory · schedule · space)

## 하는 일 (순서대로)
경로의 `work/`는 기본 예시다. 사용자가 다른 작업 폴더를 지정하면 그 폴더를 쓴다. **명령은 항상 프로젝트 루트에서 실행한다.**

```
python agents/japan-empty-transfer/skills/input-cleanup/scripts/normalize.py balance  <원본1.csv> work/balance.csv
python agents/japan-empty-transfer/skills/input-cleanup/scripts/normalize.py schedule <원본2.csv> work/schedule.csv
python agents/japan-empty-transfer/skills/input-cleanup/scripts/normalize.py space    <원본3.csv> work/space.csv
```
- 출력 합계(타입별 보유/필요/net)를 그대로 사용자에게 보여준다.
- 열 이름을 못 찾으면 스크립트가 멈춘다. 열을 추측하지 말고 사람에게 어떤 열인지 묻는다.
- 표준 외 타입 경고가 나오면 그대로 사람에게 전달한다 (예: 45GP).

## 타입 표기 변환 규칙
Size 열이 따로 있으면 `Size + Type`을 합쳐 변환한다(따옴표·공백·FT 무시, HQ는 HC로 본다).

| 원본 표기 | 변환 결과 |
|---|---|
| 20 + DC, 20 + GP, 20'DC | 22GP |
| 40 + DC, 40 + GP, 40'DC | 42GP |
| 40 + HC, 40 + HQ, 40'HQ | 45GP |
| 22GP, 42GP, 45GP, 22RE, 45RE, 22UT, 42UT, 22PC, 42PC | 그대로 |
| 위에 없는 표기 | 그대로 두고 경고, TEU 환산값이 없으면 계산이 멈춤 |

## 출력
`work/balance.csv`(port,type,onhand,required,net) · `work/schedule.csv`(vessel,voyage,seq,port,etd,cutoff) · `work/space.csv`(vessel,voyage,space) 와 타입별 합계. 다음 스킬로 이 세 파일을 넘긴다.

## 확인 필요로 넘길 때
- 열 이름을 못 찾았을 때 — "어떤 열이 보유/필요/Cut-off 인지" 사람에게 묻는다.
- 길이가 없는 `DC`·`RF`·`OT` 표기, 표준 외 타입 — 맞다고 처리하지 않고 환산 확인을 요청한다.
- 조회 시각 없음, 스페이스가 타입별·개수 단위로 옴 — 사람에게 확인한다.

## 하지 말 것
- 수량을 직접 더하거나 고치지 않는다. 합계는 스크립트 출력만 인용한다.
- 모선 스케줄·Cut-off를 기억이나 추측으로 채우지 않는다. 빈칸은 빈칸으로 둔다.
