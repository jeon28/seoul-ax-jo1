---
name: agreement-ledger-update
description: 협정 대장 갱신 — 용선 선박별 Off hire History 에 건(내용·협정 상태·기간·Port·Days·총금액)을 적고, 올린 엑셀의 건을 대장에 넣고, Declaration 을 쓴 뒤 CP 리스트의 Max date 를 갱신한다
---

# 협정 대장 갱신

> 에이전트: Off-hire 협정 에이전트 (ijryu) · 상태: **작성됨** · 코드: `dashboard/js/offhire/board.js`(화면) · `rules.js` 의 `ledgerCounts`(상태별 건수)

## 언제 쓰나
검산·문구 초안 뒤, 협정이 어디까지 갔는지(청구 → 반론 → 합의 → 정산)를 선박별로 남길 때. 또 Declaration 을 보낸 뒤 Max date 를 바꿔 둘 때.

## 입력
- 용선 선박 목록(`data/in/offhire/charter-vessels.json`, 11척) — 선박마다 Off-hire 기록을 여러 줄 적는다.
- 올린 Off-hire 엑셀의 건(`offhire-check` 결과), 또는 사람이 직접 적는 줄.
- Declaration 이 만든 바뀐 Max date(`offhire-mail-draft` 결과).

## 하는 일 (순서대로)
1. **줄 적기**: 열은 `선박 · 내용(엑셀 Remark) · 협정 상태 · Off hire 기간 · Port · Days · 총금액(엑셀 TOTAL)`. 협정 상태는 `청구 / 반론 / 합의 / 정산` 중 하나(비워 두면 미입력). 기간을 넣으면 Days 를 자동 계산하고, 사람이 Days 를 직접 고치면 그 값을 쓴다.
2. **올린 파일의 건 넣기**: 올린 엑셀의 건을 그 선박 대장으로 옮긴다. **같은 선박·SEQ·시작일** 이 이미 있으면 새 값으로 바꾸되, 대장에 적어 둔 **협정 상태는 그대로 둔다**(말없이 지우지 않는다).
3. **선박 칸 합계**: 선박마다 건수 · Days 합 · 총금액 합을 보여 준다. 필터는 선박 · 협정 상태(미입력 포함).
4. **Max date 갱신**: Declaration 문구를 복사한 뒤 누르면, 이 브라우저에 저장된 CP 리스트의 Max date 를 바뀐 날짜로 바꾸고 추가 횟수를 1 올린다. 누르기 전 확인창을 띄운다. **원본 엑셀은 바꾸지 않는다.**
5. **상태별 건수**: 대장의 상태별 건수(청구·반론·합의·정산·미입력)를 `ledgerCounts` 가 세어 결과 파일의 `metrics` 에 넣는다.

## 출력
- 이 브라우저(localStorage: `axdash.offhire.history.v1` · `axdash.offhire.charter.v1`)에만 저장되는 협정 대장·CP 리스트. **결과 파일에는 금액이 들어 있는 대장 줄을 넣지 않고 상태별 건수만 넣는다.**
- `data/out/offhire-ledger.json` 의 `metrics`: `claim`(청구) · `dispute`(반론) · `agreed`(합의) · `settled`(정산). 가상 샘플 대장 `ledger-demo.json`(청구 1 · 반론 1 · 합의 1 · 정산 1)으로 계산한다.

## 확인 필요로 넘길 때
- 7일 넘게 회신 없는 청구·반론은 **지금은 계산하지 않는다**: 대장에 청구일·회신일 칸이 아직 없다(남은 일). 칸을 추가하면 `lib/aggregate.md` 의 날짜 비교 규칙과 합쳐 `review` 로 올린다.
- 같은 선박·SEQ·시작일이 둘 이상 겹치면 맞다고 합치지 않고 사람이 고른다.
- 협정 상태·금액은 사람이 적는다. 이 스킬은 상태를 추측해 바꾸지 않는다.
