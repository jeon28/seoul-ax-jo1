---
name: offhire-mail-draft
description: offhire 메일 초안 — 사람이 고른 건으로 선주에게 보낼 영문 Claim 문구와, Off-hire 기간만큼 C/P 의 Max optional period 를 늘린다는 Add off-hire Declaration 문구를 화면 글로 만든다(보내기 없음)
---

# offhire 메일 초안

> 에이전트: Off-hire 협정 에이전트 (ijryu) · 상태: **작성됨** · 코드: `dashboard/js/offhire/rules.js` 의 `claimDraft` · `declaration` · `readCharterList` · `offhireDuration`

## 언제 쓰나
검산(`offhire-check`)이 끝난 뒤, 선주에게 청구하거나 Max optional period 연장을 알릴 때. 불일치가 난 건은 먼저 고친 뒤에 쓴다.

## 입력
- Claim: 사람이 고른 SEQ 의 건별 행(엑셀 기입값).
- Declaration: CP 리스트 엑셀(선박별 `MIN / MAX`·`MAX.DATE`) + 선박 + Off-hire 시작·종료 시각(GMT). 시작·종료는 협정 대장의 기록이나 올린 엑셀의 건에서 불러오거나 직접 쓴다. 서명은 화면에서 한 번 적으면 이 브라우저에만 저장된다.
  - CP 리스트 읽기: 머리글 이름(`선박코드`·`선박명`·`MIN / MAX`·`MAX.DATE`)으로 찾고, 못 찾으면 B·C·L·N열. 같은 선박이 여러 줄이면 **MAX.DATE 가 더 늦은 계약**. 척수만 적힌 줄 등은 건너뛴다.

## 하는 일 (순서대로)
**A. Claim 문구**
1. 선박 코드 · 사유(Remark) · 항구 · 기간 · Days · Hire·커미션·Hire Total · F/O·D/O 수량과 금액 · CEV · TOTAL 을 영문 틀에 채운다.
2. 숫자는 엑셀에 적힌 값을 **그대로** 쓴다(여기서 다시 계산하지 않는다).
3. C/P 조항과 시간대는 `[C/P clause]` · `[time zone per C/P]` 로 비워 두고 사람이 채운다. 사유가 없으면 `[reason]`.

**B. Add off-hire Declaration**
1. 모든 시각을 GMT 로 본다. `TTL off-hire = 종료 − 시작`(`4D 04H 18M` 꼴).
2. `바뀐 Max date = 현재 Max date + TTL off-hire`(`0918hours 27th September, 2025 (GMT)` 꼴, 1st·2nd·3rd·11th~13th 서수 처리).
3. 이전 추가 횟수가 1 이상이면 "in addition to the previously added n time(s) off-hire period" 문장을 넣는다.
4. 시작·종료 시각이 비었거나 종료 ≤ 시작이면 `[duration]` · `[revised max date]` 로 비워 둔다(짐작해서 계산하지 않는다).

## 출력
화면 글 두 가지(Claim · Declaration) + 복사 버튼. **보내기·메일 열기 버튼은 없다** — 발송은 사람이 직접 한다. 결과 파일(`data/out/offhire-ledger.json`)에는 문구도 금액도 넣지 않는다.

## 확인 필요로 넘길 때
- 검산에서 불일치가 난 건으로 Claim 을 쓰려 할 때 → 화면 문구 아래 "불일치 건은 고친 뒤 쓰고" 안내(문구는 만들되 고치는 일은 사람이).
- CP 리스트에 선박이 없거나 `MAX.DATE` 가 없으면 Declaration 을 만들지 않고 "리스트를 읽지 못했습니다" 로 알린다.
- C/P 조항 해석, 시간대(UTC/LT) 환산은 이 스킬이 정하지 않는다.
