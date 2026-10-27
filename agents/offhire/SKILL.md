---
name: offhire
description: Off-hire 협정 에이전트(메뉴 이름 「Off hire 관리」) — 사내 시스템의 Off Hire & Vessel's UnderPerformance Claim 엑셀을 받아 Days·커미션·Hire Total·Bunker·TOTAL·합계 행을 다시 계산해 맞춰 보고, 건끼리 조건이 다른 곳·빈 사유를 확인 필요로 표시하고, Claim·Add off-hire Declaration 영문 문구를 화면 글로 만들고, 협정 상태(청구·반론·합의·정산)를 대장에 적는다
---

# Off-hire 협정 에이전트 (메뉴: Off hire 관리)

> 담당: ijryu · 묶음 D · 메뉴: dashboard 의 「Off hire 관리」(2026-10-27 「Off-hire 협정」에서 이름 바꿈, slug 는 `offhire` 그대로)
> 상태: **스킬 3개 작성됨** (`Off-hire 관리` 폴더의 offhire-settlement 에이전트를 이 폴더 구조로 옮겨 붙임). 숫자·문구는 담당이 다듬는다.

## 해결할 병목
Off-hire 청구서(Hire·Bunker·커미션·TOTAL)를 손으로 다시 계산해 맞춰 보고, 건마다 Claim 영문 문구와 Max optional period 연장(Declaration) 문구를 새로 쓰고, 선박별 협정 진행 상태를 따로 적어 두던 일(건당 약 45분 → 에이전트 10분, 추정).

## 입력
- **Off-hire 엑셀**(시트 1개): 1행 제목 `Off Hire & Vessel's UnderPerformance Claim` → 첫 칸이 `SEQ` 인 머리글 행(23칸) → 건별 행 → 맨 아래 합계 행(SEQ·날짜 빈 칸). 파일 이름 앞 4글자가 선박 코드(`PCBJ Off hire.xls` → `PCBJ`), 못 읽으면 화면에서 적는다. 날짜는 `YYYY-MM-DD HH:MM` 글자·엑셀 날짜 모두, 숫자는 `17,685.32` 같은 쉼표 글자도 읽는다.
  - 머리글 23칸: `SEQ · Port · Voyage · Start Date · End Date · Days · Hire(일 용선료) · ADD.C(%) · ADD.C AMT · BRK(%) · BRK AMT · Hire Total · F/O Qty · F/O Price · F/O Total · D/O Qty · D/O Price · D/O Total · CEV AMT · Lash/Material · VAT · TOTAL · Remark(사유)`
  - 가상 샘플: `data/in/offhire/demo-off-hire.xlsx`
- **CP 리스트**(사내 시스템 용선 선박 정보 엑셀, 시트 1개): `선박코드` · `선박명` · `MIN / MAX`(L열, 예 `11Months ~ 13Months`) · `MAX.DATE`(N열). 가상 샘플: `data/in/offhire/demo-cp-list.xlsx`
- **협정 대장 샘플**: `data/in/offhire/ledger-demo.json`(가상). 용선 선박 목록: `data/in/offhire/charter-vessels.json`.

## 스킬을 부르는 순서
1. `offhire-check` — offhire 검산 (skills/offhire-check/SKILL.md)
2. `offhire-mail-draft` — offhire 메일 초안 (skills/offhire-mail-draft/SKILL.md)
3. `agreement-ledger-update` — 협정 대장 갱신 (skills/agreement-ledger-update/SKILL.md)

1번에서 불일치·확인 필요가 난 건은 맞다고 처리하지 않는다. 2번은 불일치 건을 사람이 고친 뒤에 쓰도록 안내하고, 숫자는 엑셀에 적힌 값을 그대로 쓴다. 3번은 사람이 적은 상태를 지우지 않는다. 한 건의 문제가 다른 건의 계산을 멈추게 하지 않는다.

## 허용 차이 숫자표 (코드 = `dashboard/js/offhire/rules.js`)

| 항목 | 값 | 뜻 |
|---|---|---|
| 금액 허용 차이 | 0.05 | 센트 반올림. 넘으면 불일치 |
| Days 허용 차이 | 0.0005일 | 약 43초 |
| 건끼리 비교 | 1% | Hire 일 단가·ADD.C %·BRK %·CEV 일 단가가 가장 많이 나온 값과 1% 넘게 다르면 확인 필요(건이 2개 이상, 같은 값이 2번 이상 나올 때만) |
| 건당 시간 | 전 45분(30~60분의 중간) → 후 10분 | 월 실행 4회(추정). 월 절감 = (전−후)×횟수÷60 |

숫자를 바꾸면 `RULES_VERSION` 을 올리고(`offhire-rules@v1` → `v2`) 결과 파일의 `rules_version` 도 따라간다.

## 출력
`data/out/offhire-ledger.json` — lib/result-shape.md 꼴. `node scripts/build-offhire-result.mjs [기준일]` 로 위 규칙을 가상 샘플에 돌려 다시 만든다. 계산 규칙 테스트: `node --test scripts/test-offhire.mjs`.
- `metrics`: 검산 건수(`processed`) · 검산 경고 · 협정 상태별 건수(청구·반론·합의·정산).
- `table`: 건별 `선박코드 · SEQ · Port · Days · 판정(일치/불일치/확인 필요) · 확인 항목`. **금액 칸 없음**.
- `review`: 문제 하나마다 한 줄. 금액 대신 "몇 % 다름"이나 일수만 쓴다. 선박은 `S01` 로 가린다.
- 합계 행이 건별 합과 다르면 `review` 에 「합계 행 … 불일치」 한 줄, `검산 경고`에 +1.

화면: Off hire 관리 메뉴 위쪽 — ① 엑셀 올리기 ② 검산 결과 표 ③ 협정 대장 ④ Add off-hire Declaration ⑤ Claim 문구 초안.

## 쓰는 공통 규칙
- 집계 · 전/후 시간 계산은 `lib/aggregate.md` 에 합칠 내용이다(다니엘 · 노현석과 공용이라 이 에이전트의 규칙은 위 표와 skills 에 먼저 둠).
- 이름 가림은 `lib/mask.md` 규칙(S01 …) — 결과 파일의 선박은 항상 `S01`, 선주는 쓰지 않는다.

## 지킬 것
- 가상 샘플·결과 파일만 저장소에 둔다. 실제 파일(`PCBJ Off hire.xls` 등)은 `data/` 에 넣지 않는다. 용선 선박 목록(`charter-vessels.json`)의 선박명·코드는 실제, 기간·금액은 전부 가상(소모량 분석의 `vessels.json` 과 같은 예외).
- 금액(Hire·단가·커미션·TOTAL)은 **브라우저 안에서만** 계산해 화면에만 보여 준다. 결과 파일·AI 에는 금액을 넣지 않는다.
- 협정 대장·CP 리스트·서명은 이 브라우저(localStorage)에만 저장한다. 결과 파일·코드·깃에는 넣지 않는다.
- 숫자는 규칙이 계산한다. AI 는 계산·판정을 바꾸지 않고, 확인 목록(금액 없음, 선박 S01)의 문장 정리만 맡는다.
- **보내기 기능은 없다.** Claim·Declaration 문구는 화면 글로 보여 주고 복사 버튼만 둔다. 발송은 사람이 직접 한다.
- C/P 조항 해석과 시간대(UTC/LT) 판단은 사람이 한다(문구에 `[C/P clause]` · `[time zone per C/P]` 로 비워 둔다).
- 배포한 대시보드에 실제 파일을 올리려면 먼저 입장 비밀번호를 건다(비밀번호는 환경 변수).

## 4회차에 만들어 올 것
가상 Off-hire 엑셀(`demo-off-hire.xlsx`) · CP 리스트 엑셀 · 협정 대장(`ledger-demo.json`) · 초안 문구 틀(Claim · Declaration, 보내기 없음) · 상태별 건수 결과 파일 — 모두 이 폴더와 `dashboard/js/offhire/` 에 있다. 남은 일: 7일 넘은 미회신 알림(청구일·회신일 칸이 대장에 아직 없음).
