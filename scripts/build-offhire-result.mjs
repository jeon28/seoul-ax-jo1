// Off hire 관리 에이전트의 결과 파일(data/out/offhire-ledger.json)을 규칙으로 계산해 만든다.
// 실행: node scripts/build-offhire-result.mjs [YYYY-MM-DD]      (규칙: dashboard/js/offhire/rules.js, 기준일을 안 쓰면 오늘)
// 입력: data/in/offhire/demo-off-hire.xlsx(가상 Off-hire 엑셀) · ledger-demo.json(가상 협정 대장). 결과 파일에는 금액을 넣지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readXlsxAoa } from './xlsx-min.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/offhire/rules.js')).href);

const baseDate = process.argv[2] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const aoa = readXlsxAoa(path.join(ROOT, 'data/in/offhire/demo-off-hire.xlsx'));
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/in/offhire/ledger-demo.json'), 'utf8'));

const out = R.run(aoa, { fileName: 'DEMO Off hire.xlsx', vessel: 'DEMO' });
const led = R.ledgerCounts(ledger.history);
const ledgerRows = Object.values(ledger.history).reduce((n, l) => n + l.length, 0);
const doc = R.buildResult(out, { baseDate, ledger: led, ledgerRows, sourceLabel: '가상 Off-hire 엑셀·협정 대장', synthetic: true });

const file = path.join(ROOT, 'data/out/offhire-ledger.json');
fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`${path.relative(ROOT, file)} 갱신: ${doc.headline}`);
