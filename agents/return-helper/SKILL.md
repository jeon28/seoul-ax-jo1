---
name: return-helper
description: 반납 도우미 — TODO 한 줄로: 언제 이 에이전트를 부르는지, 무엇을 내놓는지
---

# 반납 도우미

> 담당: 전성현 · 묶음 B · 메뉴: dashboard 의 「반납 도우미」
> 상태: **작성 전** — 아래 TODO 를 채운다. 다 쓰면 dashboard/js/menus.js 에서 스킬 status 를 'done' 으로 바꾼다.

## 해결할 병목
TODO: 내 「내병목」 파일(내병목_….md)의 병목 한 줄과 지금 걸리는 시간(전)

## 입력
TODO: 어떤 자료가 들어오는지 (data/in/ 의 가상 샘플 파일 이름 · 양식)

## 스킬을 부르는 순서
1. `new-case-extract` — 신규건 추출 (skills/new-case-extract/SKILL.md)
2. `return-number-tracker` — 반납번호 요청·회신 정리 (skills/return-number-tracker/SKILL.md)
3. `return-request-mail` — 반납요청 메일 작성 (skills/return-request-mail/SKILL.md)

TODO: 각 단계의 입력 → 출력, 막혔을 때(양식이 다르거나 값이 비었을 때) 어떻게 하는지

## 쓰는 공통 규칙
- `lib/compare.md`

## 출력
`data/out/container-return.json` — lib/result-shape.md 꼴. 확신이 낮은 건은 review 에 넣는다.

## 지킬 것
- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액·용선료는 넣지 않는다.
- 보내기 기능은 만들지 않는다. 메일·알림은 초안 글만 만들고, 발송은 사람이 직접 한다.
- 숫자는 lib/ 규칙이 계산한다. AI 는 계산하지 않고 확인 목록의 문장 정리만 맡는다.
- 확신이 낮은 값은 맞다고 처리하지 않고 review(확인 필요)로 넘긴다. 최종 결정은 사람이 한다.
- 선박·컨테이너·화주 이름은 lib/mask.md 규칙으로 코드(S01·C01·H01)로 바꾼 뒤에만 AI 에 보낸다.

## 4회차에 만들어 올 것
가상 오늘·어제 터미널별 반납 대상 엑셀 · 리즈사 회신 예시 표 · 신규건·반납번호 확보율 결과 파일
