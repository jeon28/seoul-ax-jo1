# 결과 파일 꼴 (result-shape@v1)

에이전트마다 `data/out/<이름>.json` 한 개를 낸다. 대시보드는 이 꼴만 읽는다. 그래서 조원이 달라도 홈 카드와 메뉴 화면이 같은 코드로 그려진다.
기준 문서는 CLAUDE.md 의 「공통 결과 파일 꼴」이고, 이 문서는 대시보드가 실제로 검사하는 규칙을 적은 것이다.

```json
{
  "schema_version": 1,
  "agent": "bunker-consumption",
  "owner": "다니엘",
  "bundle": "D",
  "as_of": "2026-10-22",
  "headline": "3척 처리, 제외 12일(8%), 확인 필요 2건",
  "metrics": [
    { "key": "processed", "label": "처리 건수", "value": 3, "unit": "척", "prev": 3 }
  ],
  "table": { "columns": ["선박코드", "속도(kn)", "일일 소모량(t)"], "rows": [["S01", 12, 28.4]] },
  "review": [
    { "id": "R01", "code": "S02", "reason": "평균 대비 큰 이탈", "detail": "S02 10/03 소모량 이탈 폭 큼" }
  ],
  "time": { "before_min": 10, "after_min": 2, "runs_per_month": 30, "basis": "추정" },
  "source": { "label": "가상 항해 일지", "rows": 365 },
  "rules_version": "aggregate@v1",
  "synthetic": true
}
```

## 대시보드가 어디에 쓰나

| 칸 | 쓰이는 곳 | 필수 |
|---|---|---|
| `schema_version` | 꼴 점검(지금은 1) | ○ |
| `agent` · `owner` · `bundle` | 카드 제목 줄, 묶음 나누기(bundle 은 A~E) | ○ |
| `as_of` | 홈 맨 위 기준일, 카드·메뉴의 기준일 | ○ |
| `headline` | 카드 맨 윗줄, 메뉴 화면 큰 글씨 | ○ |
| `metrics[]` | 카드 숫자 칸(앞 3개), 메뉴 숫자 타일. **`key: "processed"` 가 하나 있어야** 홈 "처리 건수"에 더해진다 | ○ |
| `table` | 카드 [결과 보기]와 메뉴 결과 표. 칸 값이 숫자면 오른쪽 정렬, `불일치·부족·과잉·가능·불가…` 같은 말은 색 칩으로 나온다 | ○ |
| `review[]` | 홈 "사람 확인 대기"와 메뉴의 확인 필요. `detail` 은 이미 코드로 가린 문장만 | ○ (없으면 `[]`) |
| `time` | 월 절감 시간 = (전−후)×횟수÷60. 홈 합계에 더해진다 | ○ |
| `source` | 입력 자료 이름표와 행 수. 파일 이름·경로는 쓰지 않는다 | |
| `rules_version` | 어느 lib/ 규칙 버전으로 계산했는지 | ○ |
| `synthetic` | 가상 데이터이면 `true`. 실제 자료면 입장 비밀번호부터 건다 | ○ |

## 점검 방법

메뉴 화면 오른쪽의 「자료 · 규칙 정보」 맨 아래에 **결과 파일 꼴 점검**이 나온다. "통과"이면 꼴이 맞는 것이고, 아니면 고칠 곳을 한 줄씩 알려 준다. 코드는 `dashboard/js/core.js` 의 `checkShape` 이다.

## 지킬 것

- 가상 데이터만 쓴다. 이름은 lib/mask.md 규칙대로 코드(S01·C01·H01·L01)로 바꾼다.
- 칸 이름과 구조는 바꾸지 않는다. 새 정보가 필요하면 `metrics` · `table` 안에 넣고, 꼴 자체를 바꾸고 싶으면 조 전체에 먼저 알린다.
