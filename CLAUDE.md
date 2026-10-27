# CLAUDE.md — 장금상선 AX 대시보드 (4회차 과제)

이 폴더는 조원 12명의 업무 자동화 아이디어를 모은 「장금상선 AX 대시보드」를 만드는 곳이다. 자세한 설계는 설계.md(설계.html)에 있다.

## 역할 표

| 이름 | 맡을 에이전트 | 만들 스킬 | 4회차에 만들어 올 것 | 결과 파일 이름 |
|---|---|---|---|---|
| 다니엘 | 소모량 분석 에이전트 | 구간 정제 · 속도별 소모량 산출 · 검증·엑셀 출력 | agents/bunker-consumption/SKILL.md 와 스킬 3개의 SKILL.md, lib/aggregate.md 에 쓸 규칙, 가상 항해 일지 엑셀 1개, 제외 규칙 숫자표(속도 하한·항내 체류일·이탈 폭), 속도별 소모량 결과 파일 | data/out/bunker-consumption.json |
| 전지연 | 부곡 CY 일일 대조 에이전트 | CY 메일 읽기 · 포탈 대조 · 일일 재고 엑셀 기입 | agents/bugok-cy/SKILL.md 와 스킬 3개의 SKILL.md, lib/compare.md 에 쓸 규칙, 가상 CY 엑셀 2~3곳(양식 다르게) + 가상 포탈 엑셀, CY별 양식 매핑표, 불일치 칸만 표시한 결과 파일 | data/out/cy-reconcile.json |
| hjung | 일일 재고 브리핑 에이전트 | 재고 Excel 파서 · 과잉/부족 판정 · 공이송 후보 요약 | agents/empty-stock/SKILL.md 와 스킬 3개의 SKILL.md, lib/threshold.md 에 쓸 규칙, 가상 지역별 재고 엑셀 3곳, 지역별 적정재고 기준표, 과잉/부족 순위 결과 파일 | data/out/empty-stock.json |
| ijryu | Off-hire 협정 에이전트 | offhire 검산 · offhire 메일 초안 · 협정 대장 갱신 | agents/offhire/SKILL.md 와 스킬 3개의 SKILL.md, lib/aggregate.md 에 쓸 규칙, 가상 Off-hire·Bunker 엑셀과 협정 대장 엑셀, 초안 문구 틀(보내기 없음), 상태별 건수 결과 파일 | data/out/offhire-ledger.json |
| kim jaehyung | 스페셜화물 승인 보조 에이전트 | 서류 점검(doc-check) · 회신 초안(reply-draft) | agents/special-cargo-approval/SKILL.md 와 스킬 2개의 SKILL.md, lib/compare.md, special-cargo-rules.md 에 쓸 규칙, 가상 승인 요청 서류 세트 5건(누락·불일치·위반 섞어서), 화물 유형별 필수 서류표, 건별 점검 결과 파일 | data/out/special-cargo-docs.json |
| 권도윤 | 일본 공이송 플래너 | 입력 정리 · 이송 후보 계산 · 검증·보고 | agents/japan-empty-transfer/SKILL.md 와 스킬 3개의 SKILL.md, lib/threshold.md, schedule-window.md 에 쓸 규칙, 가상 포트별 Empty 현황·모선 기항 순서·잔여 스페이스 엑셀, 스페이스 배분 규칙표, 구간별 이송안 결과 파일 | data/out/japan-empty-transfer.json |
| 김유민 | 위험물 대조 에이전트 | PDF 추출 · 대조 규칙 · 화면 요약 | agents/dg-compare/SKILL.md 와 스킬 3개의 SKILL.md, lib/compare.md 에 쓸 규칙, 가상 CERTI PDF 여러 개 + SPECIAL LIST PDF 1개, 표기 통일 규칙표, 일치·불일치·짝 없음 결과 파일 | data/out/dg-compare.json |
| 노현석 | 영업실적 분석 에이전트 | 월간 거래처 집계 · 영업 방문 목록 · 실적 추이 보고 | agents/sales-analysis/SKILL.md 와 스킬 3개의 SKILL.md, lib/aggregate.md 에 쓸 규칙, 가상 월별 실적 엑셀(건별 화주·수출입·POD/POL·TEU) 2개월분, 수출표·수입표 결과 파일 | data/out/pyeongtaek-sales.json |
| 이예윤 | 주간 스케줄 통지 에이전트 | 스케줄 모아 대조 · 적하목록 마감 계산 · 마감 통지 메일 초안 | agents/weekly-schedule/SKILL.md 와 스킬 3개의 SKILL.md, lib/compare.md, schedule-window.md 에 쓸 규칙, 가상 포탈 엑셀·대리점 메일 표·터미널 표, 선적지별 마감 규칙표, 마감 D-day 결과 파일 | data/out/pyeongtaek-schedule.json |
| 전성현 | 반납 도우미 | 신규건 추출 · 반납번호 요청·회신 정리 · 반납요청 메일 작성 | agents/return-helper/SKILL.md 와 스킬 3개의 SKILL.md, lib/compare.md 에 쓸 규칙, 가상 오늘·어제 터미널별 반납 대상 엑셀, 리즈사 회신 예시 표, 신규건·반납번호 확보율 결과 파일 | data/out/container-return.json |
| 황심연 | 스페어파트 보급 에이전트 | 재고 회신 취합(spare-inventory-collect) · 기항지 맞추기(port-window-match) · 요청·추적(supply-mail-tracker) | agents/spare-parts-supply/SKILL.md 와 스킬 3개의 SKILL.md, lib/threshold.md, schedule-window.md 에 쓸 규칙, 가상 선박별 재고 회신 엑셀(양식 제각각), 부품별 기준수량표, 가상 스케줄 엑셀, 부족 선박·추천 항구 결과 파일 | data/out/spare-parts.json |
| 이병선 | 스페셜화물 내규 판정 에이전트 | 금지 매트릭스 판정 · 사고 이력 조회 · 판정 기록 | agents/special-cargo-rules/SKILL.md 와 스킬 3개의 SKILL.md, lib/special-cargo-rules.md, threshold.md 에 쓸 규칙, 가상 금지 매트릭스 표(품목·항만·구분·판정), 가상 사고 사례 표, 가능/불가/검토 필요 3분류 결과 파일 | data/out/special-cargo-rules.json |

## 4회차 과제 「장금상선 AX 대시보드」

### 목적
조원이 각자 찾은 업무 병목을 에이전트와 스킬로 줄이고, 그 결과를 대시보드 한 화면에 모아 보여 준다. 맨 위 요약과 5개 묶음 카드로, 사람이 "확인 필요" 건만 보면 되게 한다.

### 에이전트와 스킬 목록

| 묶음 | 에이전트 | 만든 이 | 스킬 |
|---|---|---|---|
| A | 일일 재고 브리핑 에이전트 (`empty-stock`) | hjung | 1. 재고 Excel 파서<br>2. 과잉/부족 판정<br>3. 공이송 후보 요약 |
| A | 일본 공이송 플래너 (`japan-empty-transfer`) | 권도윤 | 1. 입력 정리<br>2. 이송 후보 계산<br>3. 검증·보고 |
| B | 부곡 CY 일일 대조 에이전트 (`bugok-cy`) | 전지연 | 1. CY 메일 읽기<br>2. 포탈 대조<br>3. 일일 재고 엑셀 기입 |
| B | 반납 도우미 (`return-helper`) | 전성현 | 1. 신규건 추출<br>2. 반납번호 요청·회신 정리<br>3. 반납요청 메일 작성 |
| C | 스페셜화물 승인 보조 에이전트 (`special-cargo-approval`) | kim jaehyung | 1. 서류 점검(doc-check)<br>2. 회신 초안(reply-draft) |
| C | 위험물 대조 에이전트 (`dg-compare`) | 김유민 | 1. PDF 추출<br>2. 대조 규칙<br>3. 화면 요약 |
| C | 스페셜화물 내규 판정 에이전트 (`special-cargo-rules`) | 이병선 | 1. 금지 매트릭스 판정<br>2. 사고 이력 조회<br>3. 판정 기록 |
| D | 소모량 분석 에이전트 (`bunker-consumption`) | 다니엘 | 1. 구간 정제<br>2. 속도별 소모량 산출<br>3. 검증·엑셀 출력 |
| D | Off-hire 협정 에이전트 (`offhire`) | ijryu | 1. offhire 검산<br>2. offhire 메일 초안<br>3. 협정 대장 갱신 |
| D | 스페어파트 보급 에이전트 (`spare-parts-supply`) | 황심연 | 1. 재고 회신 취합(spare-inventory-collect)<br>2. 기항지 맞추기(port-window-match)<br>3. 요청·추적(supply-mail-tracker) |
| E | 영업실적 분석 에이전트 (`sales-analysis`) | 노현석 | 1. 월간 거래처 집계<br>2. 영업 방문 목록<br>3. 실적 추이 보고 |
| E | 주간 스케줄 통지 에이전트 (`weekly-schedule`) | 이예윤 | 1. 스케줄 모아 대조<br>2. 적하목록 마감 계산<br>3. 마감 통지 메일 초안 |

### 공통 결과 파일 꼴
에이전트마다 data/out/<이름>.json 한 개를 낸다. 대시보드는 이 꼴만 읽는다.

```json
{
  "schema_version": 1,
  "agent": "bunker-consumption",
  "owner": "다니엘",
  "bundle": "D",
  "as_of": "2026-10-22",
  "headline": "3척 처리, 제외 12일(8%), 확인 필요 2건",
  "metrics": [
    { "key": "processed", "label": "처리 건수", "value": 3, "unit": "척", "prev": 3 },
    { "key": "excluded_ratio", "label": "제외 비율", "value": 8, "unit": "%", "prev": 6 }
  ],
  "table": {
    "columns": ["선박코드", "속도(kn)", "일일 소모량(t)"],
    "rows": [["S01", 12, 28.4], ["S01", 14, 36.1]]
  },
  "review": [
    { "id": "R01", "code": "S02", "reason": "평균 대비 큰 이탈", "detail": "S02 10/03 소모량 이탈 폭 큼" }
  ],
  "time": { "before_min": 10, "after_min": 2, "runs_per_month": 30, "basis": "추정" },
  "source": { "label": "가상 항해 일지", "rows": 365 },
  "rules_version": "aggregate@v1",
  "synthetic": true
}
```

| 칸 | 뜻 |
|---|---|
| `schema_version` | 결과 파일 꼴의 버전. 지금은 1 |
| `agent · owner · bundle` | 에이전트 이름(영문 슬러그) · 만든 조원 · 묶음 기호(A~E) |
| `as_of` | 계산 기준 날짜(YYYY-MM-DD) |
| `headline` | 카드 맨 윗줄에 그대로 쓰는 한 줄 요약 |
| `metrics[]` | 카드 숫자들. key · label · value · unit · prev(전회 값, 없으면 생략) |
| `table` | 카드를 눌렀을 때 펼치는 표. columns 와 rows |
| `review[]` | 확인 필요 목록. id · code · reason · detail. detail 은 이미 코드로 가린 문장만 |
| `time` | 걸린 시간 전/후(분), 월 실행 횟수, basis(추정 또는 측정). 월 절감 시간 = (전−후)×횟수÷60 |

| `source` | 입력 자료 이름표와 행 수. 파일 이름·경로는 쓰지 않는다 |
| `rules_version` | 어느 lib/ 규칙 버전으로 계산했는지 |
| `synthetic` | 가상 데이터이면 true |

### 공통 계산 규칙 (lib/)

| 파일 | 담는 규칙 | 쓰는 조원 |
|---|---|---|
| lib/compare.md | 두 표 대조: 표기 통일(UN1263=1263, 18,000=18000 KGS), 키로 짝 맞추기, 일치 / 불일치 / 짝 없음 판정 | 전지연 · 김유민 · 전성현 · 이예윤 · kim jaehyung |
| lib/threshold.md | 기준표 대비 과잉 / 부족 계산(수량 − 적정재고, 기준수량 이하 표시) | hjung · 권도윤 · 황심연 · 이병선 |
| lib/aggregate.md | 집계 · 전월 비교 · 신규/이탈 표시 · 이상치 제외 · 전/후 시간 계산 | 다니엘 · ijryu · 노현석 |
| lib/schedule-window.md | 일정 창(오늘 기준 7~21일) 찾기, 선적지별 마감 계산, D-day | 이예윤 · 황심연 · 권도윤 |
| lib/special-cargo-rules.md | 스페셜화물 금지 매트릭스와 필수 서류표 읽는 법, 3분류(가능 / 불가 / 검토 필요) | 이병선 · kim jaehyung |
| lib/mask.md | 이름 가림: 선박·컨테이너·화주·선사·금액을 S01·C01·H01·L01·$ 구간으로 바꾸는 규칙 | 전원 |
| lib/result-shape.md | 위 "공통 결과 파일 꼴"의 기준 문서 | 전원 |

### 폴더 구조

```
seoul-ax-jo1/
├─ CLAUDE.md                    ← 이 폴더의 약속(역할 표 · 과제 · 6교시 역할 메모)
├─ 설계.md / 설계.html          ← 설계 문서
├─ 역할메모.txt
├─ 아이디어/                    ← 조원 아이디어 파일(PDF 또는 md) 모아 두는 곳
├─ agents/
│   └─ <에이전트>/
│       ├─ SKILL.md             ← 에이전트 지시서(스킬을 부르는 순서)
│       └─ skills/<스킬>/SKILL.md
├─ lib/                         ← 공통 계산 규칙(compare · threshold · aggregate ·
│                                 schedule-window · special-cargo-rules · mask · result-shape)
├─ data/
│   ├─ in/                      ← 가상 샘플 엑셀·PDF
│   └─ out/                     ← 에이전트마다 결과 파일 1개(<이름>.json)
├─ dashboard/                   ← 장금상선 AX 대시보드(브라우저에서 계산)
└─ deck/                        ← 발표 자료
```

### 대시보드 방식
- 부서 엑셀을 브라우저 안에서 lib/ 규칙으로 계산한다. 엑셀 원본은 서버로 보내지 않는다.
- AI 는 이름을 가린 확인 목록(review)만 정리한다. 계산은 AI 가 하지 않는다.
- 첫 화면: 맨 위 요약(에이전트 수 · 처리 건수 · 확인 필요 · 월 절감 시간) → 묶음별 카드 5장(A 컨테이너 재고·공이송, B 반납·CY 재고 대조, C 위험물·스페셜화물 확인, D 선박 운영 수치, E 평택 스케줄·실적) → 확인 필요 목록.

### 지킬 것

- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액·용선료는 넣지 않는다.
- 보내기 기능은 만들지 않는다. 메일·알림은 초안 글만 화면에 보여 주고, 발송은 사람이 직접 한다.
- API 키는 .env.local 과 버셀 환경 변수에만 둔다. 코드·문서·깃·대화 어디에도 적지 않는다.
- 실제 자료를 올리게 되면 대시보드에 입장 비밀번호를 먼저 건다(비밀번호도 환경 변수).
- AI 에는 이름을 가린 확인 목록(선박·컨테이너·화주를 S01·C01·H01 같은 코드로 바꾼 것)만 보낸다. 엑셀 원본은 보내지 않는다.
- 숫자는 규칙(lib/)이 계산한다. AI 는 계산하지 않고 확인 목록의 문장 정리만 맡는다.
- 확신이 낮은 값은 맞다고 처리하지 않고 "확인 필요"로 넘긴다. 최종 결정은 사람이 한다.

## 6교시 역할 메모

> 역할메모.txt 를 이 PC 에서 찾지 못해 아직 붙이지 못했다. 파일을 이 폴더에 두고, 이 줄 아래에 내용을 고치지 말고 그대로 붙여 넣는다.
