// 영업실적 분석 에이전트의 결과 파일(data/out/pyeongtaek-sales.json)을 규칙으로 계산해 만든다.
// 실행: node scripts/build-sales-result.mjs [YYYY-MM-DD]      (규칙: dashboard/js/sales/rules.js, 기준일을 안 쓰면 오늘)
// 입력: data/in/sales-analysis/demo-monthly-sales.xlsx(가상 월별 실적 엑셀, 2026-09 · 2026-10). 가장 늦은 달을 이번 달, 그 앞 달을 전월로 본다.
// 결과 파일에는 화주를 H01, 수출 도착지를 D01, 수입 선적지를 O01 로 가려서 넣는다.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readXlsxAoa } from './xlsx-min.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/sales/rules.js')).href);

const baseDate = process.argv[2] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const parsed = R.readSheet(readXlsxAoa(path.join(ROOT, 'data/in/sales-analysis/demo-monthly-sales.xlsx')));
const month = parsed.months[parsed.months.length - 1];
const prev = parsed.months[parsed.months.length - 2] || null;
const agg = R.aggregate(parsed, month, prev);
const doc = R.buildResult(agg, R.visitList(agg), { baseDate, rows: parsed.dataRows, sourceLabel: '가상 월별 실적 엑셀', synthetic: true });

const file = path.join(ROOT, 'data/out/pyeongtaek-sales.json');
fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`${path.relative(ROOT, file)} 갱신: ${doc.headline}`);
