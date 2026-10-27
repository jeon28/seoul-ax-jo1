---
name: prohibit-matrix-judge
description: 금지 매트릭스 판정 — 신청의 UN 번호·Class 를 발신처에 맞는 금지 리스트(VER.10/VER.11)와 대조해 가능·검토 필요·불가로 나누고 근거를 붙인다
---

# 금지 매트릭스 판정

> 에이전트: 스페셜화물 내규 판정 에이전트 (이병선) · 상태: **작성됨** · 코드: `dashboard/js/dgdesk/rules.js`(`judgeCargo` · `judgeRequest`) · 테스트: `scripts/test-special-cargo-rules.mjs`

## 언제 쓰나
DG Application 신청이 들어오면 항상 첫 단계. 내규 문서를 건마다 읽지 않고, 미리 표로 옮겨 둔 금지 리스트를 조회한다.

## 입력
신청 1건: 발신처 구분(`origin`: skr_hal / partner) · 화물 목록(Class, UN 번호) · 구간 · 선박코드. 금지 리스트(`prohibit-lists.json`).

## 하는 일 (순서대로)
1. **리스트 고르기**: SKR·흥아(HAS/HAL) 계열 발신 → **VER.11 (SKR HAL ONLY)**, 그 외 파트너 발신 → **VER.10 (FOR PARTNERS)**.
2. **표기 통일**(`lib/compare.md`): UN 은 4자리 숫자(`UN1263` · `UN 1263` → `1263`), Class 는 `1`~`9` 또는 `4.1` 꼴. 못 읽으면 아래 3번 6)으로.
3. **화물마다 판정**(순서가 중요):
   1. Class 전체 **조건부**(VER.11 의 Class 2)이면 → **검토 필요**
   2. Class 전체 **금지**(VER.10: 1 · 2 · 5.2 · 6.2 · 7 / VER.11: 1 · 5.2 · 6.2 · 7)이면 → **불가**. `1.4` 처럼 세부 Class 는 대분류(`1`)로도 찾는다.
   3. UN 이 그 리스트의 금지 번호이면: **조건 표에 있으면 검토 필요**(ISO 탱크만 · Open top/Reefer 만 · SKR/HAL 선박만 등, 단 2번으로 이미 불가면 불가 유지), **조건 표에 없으면 불가**.
   4. 어디에도 안 걸리면 **가능**("해당 없음").
   5. 근거 문구를 붙인다(어느 리스트 · 어느 Remark).
   6. UN·Class 를 못 읽으면 가능으로 두지 않고 **검토 필요**("UN 번호를 읽지 못함 — 신청서 원문 확인 필요").
4. **신청 판정** = 화물 중 가장 나쁜 것(불가 > 검토 필요 > 가능). 근거는 걸린 화물 것만 이어 붙인다.

## 출력
신청마다 `{ listKey, listName, status(ok·hold·bad), reason, cargos[] }`. 결과 파일의 `table` 행(요청코드 · 선박 · 구간 · UN·Class · 적용 리스트 · 판정 · 근거)과 `review`(보류·불가)가 된다. 다음 스킬(`accident-history-lookup`)에는 UN 번호 목록을 넘긴다.

## 확인 필요로 넘길 때
- 조건부 품목(ISO 탱크·선박·컨테이너 조건) → 「조건 확인 필요(보류)」. 승인안과 거절안을 둘 다 만든다.
- UN·Class 를 못 읽음, 화물 정보가 없음 → 보류. 맞다고 처리하지 않는다.
- 불가 건은 사람이 거절 회신을 확인한다(최종 발송은 사람).
