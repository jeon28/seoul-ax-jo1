---
name: special-cargo-approval
description: 스페셜화물 승인 보조 에이전트 — DG·OOG·Flexibag 승인 요청 메일의 첨부 서류가 규정에 맞는지(필수 서류 · 서류끼리 값 대조 · 금지 목록·IMDG·CAS·한도) 한꺼번에 점검해 승인·확인 필요·거절로 나누고, 승인·거절·보완 요청 회신 초안을 화면 글로 만든다. 애매한 건은 초안 없이 직접 확인으로 넘긴다
---

# 스페셜화물 승인 보조 에이전트

> 담당: kim jaehyung · 묶음 C · 메뉴: dashboard 의 「스페셜화물 승인 보조」
> 상태: **스킬 2개 작성됨** (운항팀 Outlook 업무 메일 자동 초안 모음 `ops-mail-automation` 의 「스페셜 화물 승인(DG · OOG · FLEXIBAG)」 흐름을 이 폴더 구조로 옮겨 붙임). 숫자·문구는 담당이 다듬는다.

## 해결할 병목
매일 담당 서비스·선박에 선적하려는 스페셜화물(DG · OOG · Flexibag)의 문의가 오면, 첨부(PDF·Word·Excel)를 하나씩 열어 필수 서류가 있는지, 서류끼리 값이 맞는지, 회사 규정에 걸리지 않는지 보고 회신을 준비하던 일(일 2회 × 회당 20분 → 월 약 14.5시간, 목표 회당 5분, 추정). 누락 · 불일치 · 규정 위반이 비슷한 빈도로 나온다.

## 입력
- **승인 요청**: 메일 1건 = 요청 1건. 유형(DG · OOG · Flexibag) · 선박 · 항차 · 출발항(POL) · 경유지 · 양하항(POD) · 발신처 · **첨부 서류에서 뽑은 값**(UN · Class · PG · 중량 · 초과 치수 · 컨테이너 · MSDS 의 CAS·농도 · COA 의 연도·양식 …). 서류 칸이 `null` 이면 그 서류가 안 온 것, 빈 글자이면 서류에 있으나 읽지 못한 것이다.
  - 가상 샘플 11건: `data/in/special-cargo-approval/requests.json` (누락 · 불일치 · 규정 위반 · 직접 확인을 섞음)
  - 이 대시보드는 PDF·Word 를 직접 열지 않는다: 값 추출은 사람 또는 `dg-compare` 의 PDF 추출이 하고, 이 에이전트는 **뽑아 놓은 값 표**를 점검한다.
- **필수 서류표** `required-docs.json` · **숫자표** `limits.json`(OOG 한도 · Flexibag 조건 · 상해 MSDS 농도 · 상해·닝보 항구 이름) · **CAS 금지 목록** `cas-lists.json`(상해·닝보) · **IMDG 표** `imdg-sample.json`.
- **금지 목록(VER.10 · VER.11)** `data/in/special-cargo-rules/prohibit-lists.json` — 이병선의 내규 판정 규칙(`dashboard/js/dgdesk/rules.js`)을 그대로 쓴다.

## 스킬을 부르는 순서
1. `doc-check` — 서류 점검 (skills/doc-check/SKILL.md): 필수 서류 → 서류 간 대조 → 규정 단계(DG: STEP 0 금지 목록 → 0.5 IMDG → 1 상해·닝보 CAS → 2 상해 MSDS 농도 / OOG: 한도 / Flexibag: 화물·충전량·COA 양식)
2. `reply-draft` — 회신 초안 (skills/reply-draft/SKILL.md): 점검 결과로 승인 · 거절 · 보완 요청 영문 초안을 만들고, 직접 확인 건은 초안을 만들지 않는다

1번에서 나온 결과가 2번의 입력이다. 막혔을 때: 서류가 `null` 이면 누락으로 적고 계속 간다. 값이 비었거나 읽히지 않으면 가능으로 두지 않고 직접 확인으로 넘긴다. 한 요청의 문제가 다른 요청의 점검을 멈추지 않는다.

## 판정 (코드 = `dashboard/js/approval/rules.js`, 규칙 문서 = `lib/special-cargo-rules.md` 「승인 보조」 장)

| 확인 사항 종류 | 뜻 | 요청의 판정 | 초안 |
|---|---|---|---|
| 규정 위반 (violation) | 금지 목록 · 상해·닝보 CAS · OOG 한도 · Flexibag 충전량/화물 종류 위반 | **불가** (화면 줄 「거절」) | 거절 초안 |
| 직접 확인 (unsure) | 못 읽음 · IMDG 와 다름 · 금지 목록 조건부 · 상해 MSDS 농도 다름 · 자료 없음 | 확인 필요 | **없음** |
| 서류 누락 (missing) | 필수 서류가 안 옴 | 확인 필요 | 보완 요청 초안 |
| 서류 불일치 (conflict) | 서류끼리 값이 다름 · COA 양식이 연도 양식과 다름 | 확인 필요 | 보완 요청 초안 |
| (없음) | 서류 완비 · 일치 · 규정 통과 | **가능** (「승인」) | 승인 초안 |

여러 종류가 겹치면 위 표의 위에서부터 가장 심한 것이 요청의 판정이다. **IMDG 위반은 자동 거절하지 않는다**(직접 확인). 자료(IMDG 표 · CAS 목록)가 없으면 그 단계는 맞다고 하지 않고 직접 확인이 된다.

## 숫자표 (파일 = `data/in/special-cargo-approval/limits.json`, 모두 가상)

| 항목 | 값 | 뜻 |
|---|---|---|
| 상해·닝보 | SHANGHAI · CNSHA · SHA / NINGBO · CNNGB · NGB | 양하·경유 항구에 이 이름이 있으면 STEP 1(·2)을 한다(출발항은 아님) |
| 상해 MSDS 농도 | 100%, 다르면 **직접 확인** | `sha_msds_on_fail` 을 `bad` 로 바꾸면 불가 |
| CAS 금지 목록 해당 | **불가** | `cas_on_match` |
| OOG 한도(기본) | 초과 높이 200 · 폭 150 · 길이 200 cm · 중량 30,000 kg | 선박별 표(`by_vessel`)가 있으면 그 값이 먼저. 서류에 적힌 값 중 **가장 큰 값**으로 잰다 |
| Flexibag | 화물 종류 NON-DG · 충전량 24,000 kg 이하 · COA 2025년 T-2025 / 2026년 T-2026 | 연도 표에 없는 연도는 직접 확인, 양식이 다르면 보완 요청 |
| 시간 | 전 20분 → 후 5분, 월 44회 | 일 2회 × 영업일 약 22일. 월 절감 = (전−후)×횟수÷60 ≈ 11시간(추정, 2주 시범 운영 뒤 보정) |

숫자를 바꾸면 `RULES_VERSION` 을 올리고(`special-cargo-approval@v1` → `v2`) 결과 파일의 `rules_version` 도 따라간다. 위 값들은 담당자가 회사 규정집(`docs/01_자동회신_규칙_DG_OOG_FLEXIBAG.txt` 등)으로 확인해 채운다.

## 출력
`data/out/special-cargo-docs.json` — lib/result-shape.md 꼴. `node scripts/build-special-cargo-approval-result.mjs` 로 같은 규칙을 가상 샘플에 돌려 다시 만든다. 규칙 테스트: `node --test scripts/test-special-cargo-approval.mjs`.
- `metrics`: 점검 건수(`processed`) · 서류 누락 · 서류 불일치 · 규정 위반 · 직접 확인.
- `table`: 요청별 `요청코드 · 유형 · 화물 · 서류(완비/누락(…)/불일치(…)) · 판정(가능/확인 필요/불가) · 근거`.
- `review`: 가능이 아닌 요청마다 한 줄. 사유는 가장 심한 종류 이름, 상세는 확인 사항을 코드(Q · S)로만 쓴 문장.
- 확신이 낮은 건은 맞다고 처리하지 않고 `review` 로 넘긴다. 최종 승인·발송은 사람이 한다.

화면: 스페셜화물 승인 보조 메뉴 위쪽 — 건수 요약 · 승인/확인 필요/거절 세 줄 카드(필수 서류 ✓✗) · 카드를 누르면 점검표(서류 · 서류 간 대조 · 규정 단계)와 회신 초안 · 필수 서류표·숫자표 보기.

## 쓰는 공통 규칙
- `lib/compare.md` — 표기 통일(UN1263 = 1263, 18,000 KGS = 18000)과 키로 짝 맞추기의 취지. 이 에이전트의 표기 통일 코드는 `rules.js` 의 `parseQty` · `normCas` 등이다.
- `lib/special-cargo-rules.md` — 금지 목록 판정(이병선)과 「승인 보조」 장(필수 서류표 읽는 법, 이 에이전트의 판정 순서).
- 이름 가림은 `lib/mask.md` 규칙(선박 S01 · 컨테이너 C01 · 발신처 L01).

## 지킬 것
- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·부킹번호·금액·용선료는 넣지 않는다. 개인정보(이름·전화번호·이메일)도 넣지 않는다 — 초안의 서명·연락처는 `[담당자 이름]` 같은 자리표시로 남긴다.
- **보내기 기능은 없다.** 회신은 초안 글만 화면에 보여 주고 복사 버튼만 둔다. 발송은 사람이 직접 한다. 메일을 읽거나 옮기거나 지우는 기능도 만들지 않는다.
- 숫자·판정은 규칙이 한다. AI 는 계산·판정하지 않고 확인 목록(코드로 가린 문장)의 정리만 맡는다.
- **애매하면 직접 확인(초안 없음).** 답을 못 받은 규칙은 승인 쪽이 아니라 사람 쪽으로 넘긴다.
- 실제 IMDG 자료를 쓰게 되면 출처를 표시한다(BAM Datenbank GEFAHRGUT, IMDG Code Amdt. 42-24, Datenlizenz Deutschland – Namensnennung 2.0, 형식 변경). 웹사이트를 자동 수집하지 않는다.
- 실제 자료를 올리게 되면 대시보드에 입장 비밀번호를 먼저 건다(비밀번호는 환경 변수).

## 4회차에 만들어 올 것
가상 승인 요청 서류 세트(`requests.json`, 11건) · 화물 유형별 필수 서류표(`required-docs.json`) · 건별 점검 결과 파일(`data/out/special-cargo-docs.json`) — 모두 이 폴더와 `dashboard/js/approval/` 에 있다.
남은 일: ① 원본의 NSB 추가선복 문의 회신과 TDR·상해 체선 메일은 이 에이전트 범위 밖이라 옮기지 않았다. ② 원본 규정집의 OOG 한도·Flexibag 조건·상해 농도 기준 실제 값(지금은 가상 숫자). ③ 상해 MSDS 농도가 100% 가 아닐 때 거절인지 직접 확인인지(지금은 직접 확인, 숫자표의 `sha_msds_on_fail` 한 칸으로 바꿈). ④ OOG · Flexibag 규정 문구와 COA 연도별 양식 실물은 원본 문서(`docs/01_…`)에 있어, 받으면 `required-docs.json` · `limits.json` 에 옮긴다. 옮긴 DG 순서는 원본 그대로 「STEP 0 금지 목록 → 0.5 IMDG → 1 상해·닝보 CAS 금지 → 2 상해 MSDS 농도 100%」이다.
