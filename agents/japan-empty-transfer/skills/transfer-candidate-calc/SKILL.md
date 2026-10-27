---
name: transfer-candidate-calc
description: 일본 공이송 플래너 2단계(이송 후보 계산). 표준 과부족 표, 모선 기항 순서, 잔여 스페이스로 구간·모선·타입별 공이송 후보 수량과 예외 플래그(스페이스 부족·분할 등)를 계산한다. input-cleanup 이후에 사용.
---

# 이송 후보 계산

> 에이전트: 일본 공이송 플래너 (권도윤) · 상태: **작성 완료** · 원래 이름 `repo-candidates`

## 언제 쓰나
`input-cleanup` 이 만든 표준 과부족 표·기항 순서·잔여 스페이스로 이송안 후보와 예외 플래그를 만들 때.

## 입력
`work/balance.csv` · `work/schedule.csv` · `work/space.csv` · `agents/japan-empty-transfer/config/type_teu.csv`
`type_teu.csv` 의 환산값은 사람이 확인한 값이어야 한다. 확인 전이면 결과에 "TEU 환산값 미확인"을 함께 알린다.

## 하는 일 (순서대로)
경로의 `work/`는 기본 예시다. 사용자가 다른 작업 폴더를 지정하면 그 폴더를 쓴다. **명령은 항상 프로젝트 루트에서 실행한다.**

```
python agents/japan-empty-transfer/skills/transfer-candidate-calc/scripts/plan.py work/balance.csv work/schedule.csv work/space.csv agents/japan-empty-transfer/config/type_teu.csv work/out
```

### 계산 규칙 (스크립트가 수행, AI는 계산하지 않는다)
- 타입별 독립 계산. net>0 Surplus, net<0 Deficit.
- 기항 순서상 Surplus 포트가 Deficit 포트보다 먼저일 때만 이송.
- 스페이스는 **모선당 TEU 하나를 모든 타입이 공유**하고, 구간별 점유로 계산 (i→j 이송은 그 사이 모든 구간 점유). 점유 TEU = 컨테이너 개수 × 타입별 TEU 환산값 (`config/type_teu.csv`: 22GP(20DC)=1, 42GP(40DC)=2, 45GP(40HC)=2, 22RE=1, 45RE=2, 22UT=1, 42UT=2, 22PC=1, 42PC=2). 표에 없으면 타입명 앞이 20/40일 때만 추정하고, 그 밖(45·22 등 코드)은 중단. 표에 없는 타입은 `TYPE_PRIORITY_UNSET` 플래그.
- 이송 수량(qty)은 컨테이너 개수, plan.csv 의 `teu` 열이 점유 TEU.
- 우선순위: 빠른 ETD 모선 → 타입 우선순위(`type_teu.csv` 의 `priority`, 작을수록 먼저. 기본은 Dry 먼저, 단 **특수 컨테이너(RF·OT·FR)는 일본 내에 이송 가능한 Surplus(net>0)가 있으면 Dry보다 먼저**(사람 지정). 특수 안의 순서 RF → OT → FR 과 각 그룹 안의 짧은 것 먼저는 가정. `special` 열이 Y 인 타입이 특수 컨테이너) → 기항 순서상 먼저 나오는 부족 포트. 스페이스가 모자라면 뒤 타입이 먼저 잘린다.
- **`priority` 열의 의미**: 같은 그룹(Dry끼리, 특수끼리) 안의 순서만 정한다. 그룹 순서는 `special` 열이 정한다.
- **Surplus 포트 선택**: 같은 부족 포트를 채울 잉여 포트가 여럿이면, 다른 (모선, 부족 포트) 조합으로 쓸 수 있는 경우가 **적은** 포트의 잉여를 먼저 쓴다. 같으면 가까운 앞 포트부터. 이 순서는 휴리스틱이라 모든 경우에 최적은 아니다.

## 출력
`work/out/plan.csv`(이송안) · `work/out/flags.csv`(예외 플래그, 스페이스 플래그는 타입·모선별 한 줄) · `work/out/space_events.csv`(구간 조합별 상세. 사람이 구간별 근거를 물으면 여기서 인용). 다음 스킬(`verify-report`)이 이 파일들을 읽는다. 대시보드에서는 plan.csv 가 결과 표, flags.csv 가 review 가 된다.

## 플래그 의미
| 플래그 | 뜻 | 사람에게 되물을 것 |
|---|---|---|
| SPACE_SHORT | 모선 스페이스 부족으로 후보가 줄거나 제외됨 (타입·모선별 1줄) | 타선·다른 모선 사용 여부, 우선순위 조정 |
| SURPLUS_LEFT | (정보) 이송 후에도 남은 잉여. 보고서 "남은 잉여"에만 나오고 플래그 건수에는 넣지 않음 | 부산 공급·대체 이송 검토 시 참고 |
| NO_VESSEL | 부족 포트에 내일 기항 모선 없음 | 다른 수단·다음 항차 |
| NO_SURPLUS | 역내 Surplus 소진 | 부산 공급 검토 |
| UNRESOLVED | Surplus 남았으나 순서·스페이스로 이송 불가 | 예외 처리 방법 |
| CUTOFF_MISSING | Cut-off 값 없음 (이 포트에서 선적하는 이송은 배정하지 않음) | 최신 스케줄 붙여넣기 |
| CUTOFF_MISSING_NOIMPACT | 마지막 기항지(선적 불가)의 Cut-off 가 비어 있음. 이번 이송안에는 영향 없음 | 원본 확인만 |
| CUTOFF_BLOCKED | Cut-off 가 없어 선적 후보가 배정에서 제외됨 | 최신 Cut-off 받은 뒤 다시 계산 |
| SPACE_MISSING | 모선의 잔여 스페이스 값 없음 (배정 안 함) | 스페이스 값 확인 |
| TYPE_PRIORITY_UNSET | 우선순위 표에 없는 타입 | 우선순위 확인 |
| DUP_PORT / SPACE_UNKNOWN_VESSEL | 입력 데이터 이상 | 원본 확인 |

## 확인 필요로 넘길 때 (범위: 사람 확정)
- 선적 포트의 Cut-off 가 비어 있으면 그 포트에서 선적하는 이송은 배정하지 않고 사람에게 확인을 요청한다(`CUTOFF_BLOCKED`). 도착 포트만 비어 있으면 영향 없다.
- 한 모선 안에서만 이송한다. 모선을 갈아타는(환적) 이송은 계산하지 않는다. 한 모선으로 닿지 않는 Deficit 은 `UNRESOLVED` 로 남기고 환적으로 풀지 않는다.
- 스페이스 부족(`SPACE_SHORT`) · 미해결 부족(`UNRESOLVED`) · Cut-off 누락 → 모두 review 로 넘긴다.

## 하지 말 것
- plan.csv 수량을 AI 가 임의로 고치지 않는다. 조정은 사람이 지시하면 입력(스페이스 등)을 바꿔 스크립트를 다시 돌린다.
- 플래그를 요약하면서 지우지 않는다.
