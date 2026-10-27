---
name: verify-report
description: 일본 공이송 플래너 3단계(검증·보고). 이송안을 입력과 독립적으로 재검산(합계·기항 순서·스페이스)하고, 선박명·항차·날짜 대조 체크리스트가 포함된 한 장짜리 이송안(Markdown)을 만든다. transfer-candidate-calc 이후에 사용.
---

# 검증·보고

> 에이전트: 일본 공이송 플래너 (권도윤) · 상태: **작성 완료**

## 언제 쓰나
이송안(plan.csv)이 나온 뒤, 사람에게 넘기기 전에 재검산하고 한 장짜리 보고서를 만들 때.

## 입력
`work/balance.csv` · `work/schedule.csv` · `work/space.csv` · `work/out/plan.csv` · `work/out/flags.csv` · `type_teu.csv`
선택: 사람이 시스템 수치를 옮겨 적은 `원본합계.csv`(type,onhand,required) — 가상 샘플 `data/in/japan-empty-transfer/sim2/source_totals.csv`. 없으면 없는 채로 진행하고 보고서에 '확인 필요'로 남는다.
데이터 조회 시각(사용자가 준 값 그대로).

## 하는 일 (순서대로)
경로의 `work/`는 기본 예시다. 사용자가 다른 작업 폴더를 지정하면 그 폴더를 쓴다. **명령은 항상 프로젝트 루트에서 실행한다.**

1. 원본합계.csv 가 있는지 확인한다.
2. 실행:
```
python agents/japan-empty-transfer/skills/verify-report/scripts/verify.py work/balance.csv work/schedule.csv work/space.csv work/out/plan.csv work/out/flags.csv agents/japan-empty-transfer/config/type_teu.csv work/out/report.md [원본합계.csv] --queried-at "<데이터 조회 시각>"
```
조회 시각이 없으면 사람에게 묻고, 끝내 모르면 생략하되 보고서에 "미입력"으로 남는 것을 알린다.
3. `report.md` 를 사용자에게 보여주고 아래를 요약한다: 이송안 건수, 예외 플래그 건수·유형, 수량 검증 통과 여부.

## 종료 코드
- 0: 검증 통과 → 보고서 전달
- 1: 검증 실패 → 보고서를 '실패'로 전달하고 원인을 설명, 이송안으로 쓰지 말라고 알린다.

## 출력
`work/out/report.md` — 이송안 · 수량 검증 · 예외 플래그 · 남은 잉여 · 사람이 원본과 대조할 체크리스트(선박명·항차·ETD·Cut-off, 합계 대조, 조회 시각, 메일 검토). 대시보드의 「수량 검증」 표시와 review 문구가 여기서 나온다.

## 확인 필요로 넘길 때
- 원본합계.csv 와 변환 결과가 다르면 어느 쪽도 임의로 고치지 않는다. 불일치한 타입·수치를 그대로 보여주고, 사람이 시스템 화면으로 어느 쪽이 틀렸는지 확인하게 한다(옮겨 적다 틀렸거나, 내려받은 파일에서 누락됐을 수 있다). 검증이 실패하면 보고서 맨 위에 실패 배너가 나오고, 그 이송안은 사용하지 말라고 알린다.
- 원본합계.csv 가 없으면 합계 대조는 '확인 필요'로 남긴다.

## 하지 말 것
- 검증이 '확인 필요'인 항목을 '통과'로 바꾸지 않는다.
- 체크리스트(선박명·항차·ETD·Cut-off, 합계 대조, 조회 시각, 메일 검토)를 줄이지 않는다.
- 대리점 메일을 발송하지 않는다. 초안이 필요하면 작성만 하고 사람이 검토한다.
