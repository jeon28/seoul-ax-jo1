# 대시보드 — 조원용 안내

12개 메뉴 = 에이전트 12개. 홈에서 한눈에 보고, 왼쪽 메뉴에서 내 에이전트 화면으로 들어간다. 빌드 도구 없이 HTML·JS·CSS 만 쓴다.

## 열어 보기

```bash
node scripts/dev-server.js
```

브라우저에서 http://localhost:5173/dashboard/ 를 연다. (파일을 더블클릭해 열면 결과 파일을 못 읽는다. 꼭 서버로 연다.)

## 내가 고칠 곳 — 내 메뉴 것만

| 하고 싶은 일 | 고치는 파일 | 다른 조원에게 영향 |
|---|---|---|
| 에이전트·스킬 지시서 쓰기 | `agents/<slug>/SKILL.md`, `agents/<slug>/skills/*/SKILL.md` | 없음 |
| 결과 숫자·표·확인 필요 채우기 | `data/out/<내 파일>.json` ([꼴 설명](../lib/result-shape.md)) | 없음(홈 합계에는 반영) |
| 메뉴 이름·스킬 이름·상태 바꾸기 | `dashboard/js/menus.js` 의 **내 줄** | 같은 파일이라 줄만 고칠 것 |
| 메뉴 화면을 내 방식으로 꾸미기 | `dashboard/menus/<slug>.js` | 없음 |

`<slug>` 는 에이전트 영문 이름이다: `empty-stock` · `japan-empty-transfer` · `bugok-cy` · `return-helper` · `special-cargo-approval` · `dg-compare` · `special-cargo-rules` · `bunker-consumption` · `offhire` · `spare-parts-supply` · `sales-analysis` · `weekly-schedule`.

## 메뉴 화면을 바꾸는 법

`dashboard/menus/<slug>.js` 는 기본 화면을 그대로 돌려주고 있다. 쓸 수 있는 조각을 골라 순서를 바꾸거나 내 조각을 끼워 넣으면 된다.

```js
import { hero, headline, metrics, resultTable, reviewList, timeSaving } from '../js/agent-page.js';
import { el } from '../js/core.js';

export default function render(ctx) {
  const page = el('div', 'page');
  page.append(hero(ctx), headline(ctx), metrics(ctx), resultTable(ctx), reviewList(ctx), timeSaving(ctx));
  // 여기에 내 조각(엑셀 올리기, 초안 보기 등)을 el('section', 'glass panel') 로 만들어 끼워 넣는다
  return page;
}
```

- `ctx` = `{ menu, doc, raw, problems, all }`. `doc` 은 결과 파일(빈 칸은 채워 둠), `raw` 는 원본(없으면 null).
- 글자는 `el(태그, 클래스, 글자)` 로 넣는다. 이 함수는 `textContent` 만 써서 파일 내용이 HTML 로 해석되지 않는다. `innerHTML` 에 결과 파일 값을 넣지 않는다.
- 화면 코드가 에러를 내도 그 메뉴만 오류 상자가 뜨고 나머지 메뉴는 그대로 동작한다.

## 디자인 (iOS Liquid Glass)

- 색과 유리 값은 `style.css` 맨 위 `:root` 변수(`--glass` · `--stroke` · `--blur` …)에 있다. 밝은 모드·어두운 모드 값이 따로 있다.
- 유리 카드는 클래스 `glass`, 안쪽 여백이 있는 묶음은 `glass panel`, 버튼은 `btn`(주 버튼 `btn primary`), 작은 라벨은 `tag` · `badge ok|warn|info`.
- 묶음 색: A 파랑 · B 초록 · C 주황 · D 보라 · E 분홍 (`core.js` 의 `BUNDLES`).

## 지킬 것 (CLAUDE.md 요약)

- 가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액은 넣지 않는다.
- 보내기(발송) 기능은 만들지 않는다. 메일·알림은 초안 글만 화면에 보여 준다.
- API 키는 `.env.local` 과 버셀 환경 변수에만 둔다. 코드·문서·깃에 적지 않는다.
- AI 에는 이름을 가린 확인 목록(S01·C01·H01)만 보낸다. 숫자는 규칙(lib/)이 계산한다.
- 확신이 낮은 값은 맞다고 처리하지 않고 `review` 로 넘긴다.

## 예시: 소모량 분석 메뉴 (operation-dashboard 의 Speed Performance 를 옮김)

메뉴 화면을 통째로 바꾼 예다. 보고 따라 하면 된다.

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/bunker-consumption.js` | 기본 조각(요약·스킬 순서·결과 표)에 조회 화면을 끼워 넣음 |
| `dashboard/js/bunker/board.js` | 조회 화면: 선박 1·2 선택, 기간·속력·RH·Slip 필터, 속력별 표, 정박 소모량, 그래프, CSV |
| `dashboard/js/bunker/performance.js` · `portcalc.js` | 계산 규칙(순수 함수, node 에서도 돈다) = 「제외 규칙 숫자표」 |
| `dashboard/js/bunker/noon-synthetic.js` | 가상 NOON REPORT 공급부. 실제 자료로 바꿀 때 `getHistory()` 만 바꾼다 |
| `dashboard/js/bunker/chart.js` | 외부 라이브러리 없는 SVG 꺾은선 그래프 |
| `data/in/vessels.json` | 선박 목록(실제 선박명·코드 66척) |
| `scripts/build-bunker-result.mjs` | 규칙을 돌려 `data/out/bunker-consumption.json` 을 다시 만듦 |
| `scripts/test-bunker.mjs` | 계산 규칙 테스트: `node --test scripts/test-bunker.mjs` |

## 예시: 일일 재고 현황 메뉴 (재고현황.html 을 옮김)

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/empty-stock.js` | 기본 조각에 재고 현황 화면을 끼워 넣음 |
| `dashboard/js/stock/board.js` | KPI · 국가 목록 · 항구 표(행 클릭) · 상세. 「조회」 버튼을 누르면 자료를 읽어 보여 준다(가상 조회: 약 1초 대기 후 표시) |
| `data/in/empty-stock-ports.json` | 항구별 재고 자료. 바꾼 뒤 화면에서 「조회」를 누르면 반영된다 |
| `scripts/build-empty-stock-result.mjs` | 같은 자료에서 `data/out/empty-stock.json`(홈 카드)을 다시 만듦 |

## 예시: Off hire 관리 메뉴 (Off-hire 관리 폴더의 offhire-settlement 를 옮김)

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/offhire.js` | 기본 조각에 Off hire 도구 화면을 끼워 넣음 |
| `dashboard/js/offhire/board.js` | ① 엑셀 올리기 ② 검산 결과 표 ③ 협정 대장(History) ④ Add off-hire Declaration ⑤ Claim 문구 초안. 협정 대장·CP 리스트·서명은 이 브라우저에만 저장 |
| `dashboard/js/offhire/rules.js` | 계산 규칙(순수 함수, node 에서도 돈다) = 「허용 차이 숫자표」 |
| `dashboard/js/offhire/xlsx.js` | 엑셀 읽기(SheetJS)를 이 메뉴가 열릴 때만 불러옴 |
| `data/in/offhire/` | 가상 Off-hire 엑셀 · CP 리스트 엑셀 · 샘플 협정 대장 · 용선 선박 목록 |
| `scripts/build-offhire-result.mjs` | 규칙을 샘플에 돌려 `data/out/offhire-ledger.json`(금액 없음, 선박 S01)을 다시 만듦 |
| `scripts/test-offhire.mjs` | 계산 규칙 테스트: `node --test scripts/test-offhire.mjs` |

## 예시: 스페셜화물 승인 보조 메뉴 (ops-mail-automation 의 스페셜 화물 승인 흐름을 옮김)

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/special-cargo-approval.js` | 기본 조각에 승인 점검 화면을 끼워 넣음 |
| `dashboard/js/approval/board.js` | 화면: 건수 요약 · 승인/확인 필요/거절 세 줄 카드(필수 서류 ✓✗ 칩) · 카드를 누르면 점검표(서류 · 서류 간 대조 · 규정 단계)와 회신 초안(승인 · 거절 · 보완 요청, 복사). 보내기·Outlook 저장은 없음 |
| `dashboard/js/approval/rules.js` · `drafts.js` | 점검 규칙(순수 함수, node 에서도 돈다) = `lib/special-cargo-rules.md` 「승인 보조」 장 · 초안 문구 틀. DG 금지 목록은 `js/dgdesk/rules.js` 를 그대로 씀 |
| `data/in/special-cargo-approval/` | 가상 승인 요청 11건(서류에서 뽑은 값 표) · 필수 서류표 · 숫자표(OOG 한도·Flexibag·상해 농도) · CAS 금지 목록 샘플 · IMDG 샘플 |
| `scripts/build-special-cargo-approval-result.mjs` | 같은 규칙으로 `data/out/special-cargo-docs.json`(홈 카드)을 다시 만듦 |
| `scripts/test-special-cargo-approval.mjs` | 점검 규칙 테스트: `node --test scripts/test-special-cargo-approval.mjs` |
## 예시: 스페셜화물 내규 판정 메뉴 (DG_승인_데스크_발표용_공유본.html 을 옮김)

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/special-cargo-rules.js` | 기본 조각에 DG 승인 데스크를 끼워 넣음 |
| `dashboard/js/dgdesk/board.js` | 화면: 건수 요약 · 승인/보류/거절 세 줄 카드 · 카드를 누르면 회신 초안 시트(승인안·거절안, 복사). 보내기·Outlook 저장은 없음 |
| `dashboard/js/dgdesk/rules.js` · `drafts.js` | 판정 규칙(순수 함수, node 에서도 돈다) = `lib/special-cargo-rules.md` · 초안 문구 틀 |
| `data/in/special-cargo-rules/prohibit-lists.json` | 금지 리스트 VER.10 · VER.11. 개정되면 이 파일만 바꾸고 「다시 판정」 |
| `data/in/special-cargo-rules/requests.json` | 신청 21건(선박 S01·발신처 L01 로 가림) |
| `data/in/special-cargo-rules/accident-cases.json` | 가상 사고 사례 8건. 같은 UN 번호의 최근 12개월 사고를 카드·시트·결과 파일에 붙임(판정은 안 바꿈) |
| `scripts/build-special-cargo-rules-result.mjs` | 같은 규칙으로 `data/out/special-cargo-rules.json`(홈 카드)을 다시 만듦 |
| `scripts/test-special-cargo-rules.mjs` | 판정 규칙 테스트: `node --test scripts/test-special-cargo-rules.mjs` |

## 예시: 영업실적 분석 메뉴 (노현석.html 「월간 영업 카드」를 옮김)

| 파일 | 하는 일 |
|---|---|
| `dashboard/menus/sales-analysis.js` | 기본 조각에 영업실적 도구 화면을 끼워 넣음 |
| `dashboard/js/sales/board.js` | 화면: ① 엑셀 올리기(이번 달 · 전월 고르기, 처음 열 때 샘플을 자동으로 읽음) ② 영업 카드(수출·수입·합계 TEU, 화주 변화, 항구 상위 3) · 월간 실적 보고서(수출표·수입표, 인쇄·PDF) · 방문 목록 · 월별 추이(보고 문장 복사). 보내기는 없음 |
| `dashboard/js/sales/rules.js` | 집계 규칙(순수 함수, node 에서도 돈다) = `lib/aggregate.md` 「영업실적」 장. 증가·감소 기준 5 TEU 등 숫자표 포함 |
| `dashboard/js/offhire/xlsx.js` | 엑셀 읽기(SheetJS)를 Off hire 메뉴와 같이 씀. 이 메뉴가 열릴 때만 불러옴 |
| `data/in/sales-analysis/demo-monthly-sales.xlsx` | 가상 월별 실적 엑셀(2026-09 · 2026-10, 건별 204줄). `node scripts/make-sales-sample.mjs` 로 다시 만듦 |
| `scripts/build-sales-result.mjs` | 같은 규칙으로 `data/out/pyeongtaek-sales.json`(홈 카드, 화주는 H01 · 항구는 D01/O01 로 가림)을 다시 만듦 |
| `scripts/test-sales.mjs` | 집계 규칙 테스트: `node --test scripts/test-sales.mjs` |
