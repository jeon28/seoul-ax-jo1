// 12개 메뉴 목록. 사이드바 · 홈 카드 · 각 메뉴 화면이 모두 여기서 읽는다.
// 내 메뉴 칸만 고친다: 이름 · 스킬 이름/상태 · 결과 파일. 순서와 slug 는 바꾸지 않는다.
//   skills[].status: 'todo'(작성 전) → 'done'(SKILL.md 작성 완료)
//   화면을 직접 꾸미려면 dashboard/menus/<slug>.js 를 고친다.
export const MENUS = [
  { slug: 'empty-stock', bundle: 'A', name: '일일 재고 현황', agent: '일일 재고 브리핑 에이전트', owner: 'hjung', file: 'empty-stock.json', icon: 'M21 8l-9-5-9 5v8l9 5 9-5V8z M3 8l9 5 9-5 M12 13v8',
    skills: [{ slug: 'stock-excel-parser', name: '재고 Excel 파서', status: 'todo' }, { slug: 'over-short-judge', name: '과잉/부족 판정', status: 'todo' }, { slug: 'transfer-candidate-summary', name: '공이송 후보 요약', status: 'todo' }] },
  { slug: 'japan-empty-transfer', bundle: 'A', name: '일본 공이송 플래너', agent: '일본 공이송 플래너', owner: '권도윤', file: 'japan-empty-transfer.json', icon: 'M7 8h13 M16 4l4 4-4 4 M17 16H4 M8 12l-4 4 4 4',
    skills: [{ slug: 'input-cleanup', name: '입력 정리', status: 'done' }, { slug: 'transfer-candidate-calc', name: '이송 후보 계산', status: 'done' }, { slug: 'verify-report', name: '검증·보고', status: 'done' }] },
  { slug: 'bugok-cy', bundle: 'B', name: '부곡 CY 일일 대조', agent: '부곡 CY 일일 대조 에이전트', owner: '전지연', file: 'cy-reconcile.json', icon: 'M3 5h8v14H3z M13 5h8v14h-8z M6 9h2 M6 13h2 M16 9h2 M16 13h2',
    skills: [{ slug: 'cy-mail-reader', name: 'CY 메일 읽기', status: 'todo' }, { slug: 'portal-compare', name: '포탈 대조', status: 'todo' }, { slug: 'daily-stock-sheet-fill', name: '일일 재고 엑셀 기입', status: 'todo' }] },
  { slug: 'return-helper', bundle: 'B', name: '반납 도우미', agent: '반납 도우미', owner: '전성현', file: 'container-return.json', icon: 'M9 14L4 9l5-5 M4 9h10a6 6 0 010 12h-3',
    skills: [{ slug: 'new-case-extract', name: '신규건 추출', status: 'todo' }, { slug: 'return-number-tracker', name: '반납번호 요청·회신 정리', status: 'todo' }, { slug: 'return-request-mail', name: '반납요청 메일 작성', status: 'todo' }] },
  { slug: 'special-cargo-approval', bundle: 'C', name: '스페셜화물 승인 보조', agent: '스페셜화물 승인 보조 에이전트', owner: 'kim jaehyung', file: 'special-cargo-docs.json', icon: 'M9 4h6v3H9z M7 5H5v16h14V5h-2 M9 14l2 2 4-4',
    skills: [{ slug: 'doc-check', name: '서류 점검', status: 'todo' }, { slug: 'reply-draft', name: '회신 초안', status: 'todo' }] },
  { slug: 'dg-compare', bundle: 'C', name: '위험물 대조', agent: '위험물 대조 에이전트', owner: '김유민', file: 'dg-compare.json', icon: 'M12 3l9 9-9 9-9-9z M12 8v5 M12 16v.01',
    skills: [{ slug: 'pdf-extract', name: 'PDF 추출', status: 'todo' }, { slug: 'compare-rules', name: '대조 규칙', status: 'todo' }, { slug: 'screen-summary', name: '화면 요약', status: 'todo' }] },
  { slug: 'special-cargo-rules', bundle: 'C', name: '스페셜화물 내규 판정', agent: '스페셜화물 내규 판정 에이전트', owner: '이병선', file: 'special-cargo-rules.json', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
    skills: [{ slug: 'prohibit-matrix-judge', name: '금지 매트릭스 판정', status: 'todo' }, { slug: 'accident-history-lookup', name: '사고 이력 조회', status: 'todo' }, { slug: 'judgment-log', name: '판정 기록', status: 'todo' }] },
  { slug: 'bunker-consumption', bundle: 'D', name: '소모량 분석', agent: '소모량 분석 에이전트', owner: '다니엘', file: 'bunker-consumption.json', icon: 'M12 3s6 6 6 11a6 6 0 01-12 0c0-5 6-11 6-11z',
    skills: [{ slug: 'segment-cleanup', name: '구간 정제', status: 'done' }, { slug: 'speed-consumption-calc', name: '속도별 소모량 산출', status: 'done' }, { slug: 'verify-excel-export', name: '검증·엑셀 출력', status: 'done' }] },
  { slug: 'offhire', bundle: 'D', name: 'Off-hire 협정', agent: 'Off-hire 협정 에이전트', owner: 'ijryu', file: 'offhire-ledger.json', icon: 'M12 7v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    skills: [{ slug: 'offhire-check', name: 'offhire 검산', status: 'todo' }, { slug: 'offhire-mail-draft', name: 'offhire 메일 초안', status: 'todo' }, { slug: 'agreement-ledger-update', name: '협정 대장 갱신', status: 'todo' }] },
  { slug: 'spare-parts-supply', bundle: 'D', name: '스페어파트 보급', agent: '스페어파트 보급 에이전트', owner: '황심연', file: 'spare-parts.json', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    skills: [{ slug: 'spare-inventory-collect', name: '재고 회신 취합', status: 'todo' }, { slug: 'port-window-match', name: '기항지 맞추기', status: 'todo' }, { slug: 'supply-mail-tracker', name: '요청·추적', status: 'todo' }] },
  { slug: 'sales-analysis', bundle: 'E', name: '영업실적 분석', agent: '영업실적 분석 에이전트', owner: '노현석', file: 'pyeongtaek-sales.json', icon: 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
    skills: [{ slug: 'monthly-client-aggregate', name: '월간 거래처 집계', status: 'todo' }, { slug: 'sales-visit-list', name: '영업 방문 목록', status: 'todo' }, { slug: 'performance-trend-report', name: '실적 추이 보고', status: 'todo' }] },
  { slug: 'weekly-schedule', bundle: 'E', name: '주간 스케줄 통지', agent: '주간 스케줄 통지 에이전트', owner: '이예윤', file: 'pyeongtaek-schedule.json', icon: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
    skills: [{ slug: 'schedule-collect-compare', name: '스케줄 모아 대조', status: 'todo' }, { slug: 'manifest-deadline-calc', name: '적하목록 마감 계산', status: 'todo' }, { slug: 'deadline-mail-draft', name: '마감 통지 메일 초안', status: 'todo' }] },
];

export const HOME_ICON = 'M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10';
