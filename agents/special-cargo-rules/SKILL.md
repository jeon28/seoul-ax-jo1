---
name: special-cargo-rules
description: 스페셜화물 내규 판정 에이전트 — DG Application 신청을 금지 리스트(VER.10 · VER.11)로 판정해 가능/불가/검토 필요로 나누고, 승인안·거절안 회신 초안과 확인 필요 목록을 내놓는다
---

# 스페셜화물 내규 판정 에이전트

> 담당: 이병선 · 묶음 C · 메뉴: dashboard 의 「스페셜화물 내규 판정」
> 상태: **스킬 3개 작성됨** (공유본 「DG 승인 데스크」를 옮겨 와 붙이고, 사고 이력 조회는 가상 사고 사례 표로 붙임). 숫자·문구는 담당이 다듬는다.

## 해결할 병목
위험물·OOG 스페셜화물 신청이 오면 건마다 Word/PDF 내규를 찾아 읽고 선적 가부를 판단하던 일(일 30건 × 건당 약 1분, 월 약 10.9시간 → 에이전트 후 건당 약 0.3분, 추정). 내규는 몇 달에 한 번 개정되므로 **개정 때 한 번 표로 정리**해 두고 신청마다 조회만 한다. 담당자는 「검토 필요」 건의 판단과 최종 발송만 맡는다. (내병목_이병선.md)

## 입력
- 신청 목록: `data/in/special-cargo-rules/requests.json` — 건마다 신청코드(Q01…) · 폴더/서비스(KQS·SRS·PVS2…) · 선박코드(S01…) · 항차 · 구간(POL → POD) · 발신처코드(L01…) · `origin`(skr_hal / partner) · 화물(Class · UN) · 접수 시각. 지금은 공유본의 2026-10-27 09:40 처리 결과 21건(이름 가림).
- 금지 리스트: `data/in/special-cargo-rules/prohibit-lists.json` — VER.10 (FOR PARTNERS) 239개 UN, VER.11 (SKR HAL ONLY) 은 VER.10 에 62개를 더한 301개. Class 전체 금지·조건부와 조건 문구 포함.
- 사고 사례 표: `data/in/special-cargo-rules/accident-cases.json` — **가상 8건**(사고코드 · UN · Class · 유형 · 날짜 · 출처 코드). 실제 사고가 아니다.
- 실제 운영에서는 Outlook 폴더(KQS/SWMM · KBX/HAJN · SRS/SWTD · PVS2/SDTR SWSR)의 메일 제목·첨부에서 UN·Class·구간을 뽑아 위 형태로 만든다(메일 연결은 아직 없음).

## 스킬을 부르는 순서
1. `prohibit-matrix-judge` — 금지 매트릭스 판정 (skills/prohibit-matrix-judge/SKILL.md)
2. `accident-history-lookup` — 사고 이력 조회 (skills/accident-history-lookup/SKILL.md) — 같은 UN 번호의 최근 12개월 사고를 붙이고, 있으면 확인 필요로 올림(판정은 안 바꿈)
3. `judgment-log` — 판정 기록 (skills/judgment-log/SKILL.md)

각 건은 독립이다. 한 건을 못 읽어도 다른 건 판정은 계속하고, 못 읽은 건은 보류로 남긴다.

## 쓰는 공통 규칙
- `lib/special-cargo-rules.md` — 판정 규칙 본문(리스트 고르기 · Class/UN 순서 · 3분류 · 표기 통일). 코드는 `dashboard/js/dgdesk/rules.js`.
- `lib/threshold.md` 는 쓰지 않는다(수량 과잉/부족 계산이 아니라 금지 번호 조회라서).

## 출력
`data/out/special-cargo-rules.json` — lib/result-shape.md 꼴. `node scripts/build-special-cargo-rules-result.mjs` 로 같은 자료·같은 규칙에서 다시 만든다.
- `table`: 요청코드 · 선박 · 구간 · UN·Class · 적용 리스트 · 판정(가능/불가/검토 필요) · 근거 · 사고 이력
- `review`: 검토 필요(보류) · 불가 건, 같은 UN 번호 최근 사고 이력이 있는 건, 형식이 안 맞아 건너뛴 행. `detail` 은 코드(Q·S)만 쓴 문장.

## 화면 (메뉴 「스페셜화물 내규 판정」)
- 위쪽 「DG 승인 데스크」(`dashboard/js/dgdesk/board.js`): 건수 요약 → 승인 · 보류 · 거절 세 줄 카드(최근 사고가 있으면 「최근 사고 N건」 배지) → 카드를 누르면 회신 초안 시트(사고 이력, 승인안 · 거절안 탭, 본문 고치기, 초안 복사). 사고 사례 표를 못 읽으면 「사고 이력 조회 불가」로 표시한다(없다는 뜻이 아님).
- **보내기·Outlook 저장은 만들지 않았다.** 공유본의 「임시보관함에 저장」「보내기」 버튼은 뺐고, 초안은 복사해 Outlook 에 붙여 넣는다(발송은 사람).
- 「다시 판정」 = 자료 파일을 다시 읽어 판정한다. 자료를 바꾼 뒤 누르면 반영된다.
- 아래쪽: 결과 표 · 확인 필요 · 시간 전/후 · 스킬 순서(홈 카드와 같은 값).

## 지킬 것
- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액·용선료는 넣지 않는다. 선박은 S01·발신처는 L01·신청은 Q01 코드로 가린다(`lib/mask.md`). 부킹번호·이메일·서명자 이름은 자료와 초안에 넣지 않고 [대괄호] 자리표시로 둔다.
- 보내기 기능은 만들지 않는다. 메일은 초안 글만 만들고, 발송은 사람이 직접 한다.
- 판정은 규칙(rules.js)이 한다. AI 는 판정·계산하지 않고 확인 목록의 문장 정리만 맡는다.
- **보류(검토 필요)는 자동 승인하지 않는다.** UN·Class 를 못 읽은 건도 가능으로 두지 않고 보류로 넘긴다. 최종 승인은 항상 담당자가 한다.
- 모든 판정에 근거(어느 리스트의 어느 조건)를 함께 보여 준다.
- 금지 리스트가 개정되면 `prohibit-lists.json` 만 바꾸고 `RULES_VERSION` 을 올린 뒤 `node --test scripts/test-special-cargo-rules.mjs` 로 확인한다.

## 4회차에 만들어 올 것
가상 금지 매트릭스 표(= `prohibit-lists.json`) · 가상 사고 사례 표(= `accident-cases.json`) · 가능/불가/검토 필요 3분류 결과 파일(= `data/out/special-cargo-rules.json`).
남은 일: 실제 사고 자료를 주 1회 모아 이 표 꼴로 바꾸는 입력부, 요청 메일에서 UN·Class·구간을 뽑는 입력부, OOG 기준표 판정.
