// 스페셜화물 승인 보조의 결과 파일(data/out/special-cargo-docs.json)을 승인 요청 자료에 점검 규칙을 돌려 만든다.
// 실행: node scripts/build-special-cargo-approval-result.mjs
//   자료: data/in/special-cargo-approval/ (requests · required-docs · limits · cas-lists · imdg-sample) + 금지 리스트 data/in/special-cargo-rules/prohibit-lists.json
//   규칙: dashboard/js/approval/rules.js (= lib/special-cargo-rules.md 의 「승인 보조」 장)
// 화면(스페셜화물 승인 보조 메뉴)과 같은 규칙 코드를 쓴다. 판정은 규칙이 하고 AI 는 계산·판정하지 않는다.
// 결과 파일에는 이름 가린 코드(Q · S · C · L)만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inDir = path.join(ROOT, 'data/in/special-cargo-approval');
const outPath = path.join(ROOT, 'data/out/special-cargo-docs.json');
const rules = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/approval/rules.js')).href);
const { compileLists } = await import(pathToFileURL(path.join(ROOT, 'dashboard/js/dgdesk/rules.js')).href);

const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const old = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const ctx = rules.buildCtx({
  lists: compileLists(read(path.join(ROOT, 'data/in/special-cargo-rules'), 'prohibit-lists.json')),
  required: read(inDir, 'required-docs.json'),
  limits: read(inDir, 'limits.json'),
  casRaw: read(inDir, 'cas-lists.json'),
  imdgRaw: read(inDir, 'imdg-sample.json'),
});
const req = read(inDir, 'requests.json');
const { rows, skipped } = rules.cleanRequests(req.requests);
if (!rows.length) throw new Error('승인 요청 자료가 비었거나 형식이 맞지 않습니다');
const asOf = (req.snapshot_at || '').slice(0, 10) || old.as_of;
const { items, count, kinds } = rules.checkAll(ctx, rows);
const prevProcessed = (old.metrics || []).find((m) => m.key === 'processed')?.prev;

const review = [];
items.filter((x) => x.status !== 'ok').forEach((x) => {
  review.push({
    id: `R${String(review.length + 1).padStart(2, '0')}`,
    code: x.id,
    reason: rules.KIND[x.kinds[0]],
    detail: `${x.id} ${x.type} ${x.cargoText} · ${x.findings.map((f) => f.ko).join(' · ')}`,
  });
});
if (skipped) review.push({ id: `R${String(review.length + 1).padStart(2, '0')}`, code: '자료', reason: '형식이 맞지 않는 요청 행', detail: `승인 요청 자료에서 형식이 맞지 않아 건너뛴 행 ${skipped}개` });

const doc = {
  schema_version: 1,
  agent: 'special-cargo-approval',
  owner: old.owner ?? 'kim jaehyung',
  bundle: 'C',
  as_of: asOf,
  headline: `${items.length}건 점검: 가능 ${count.ok} · 확인 필요 ${count.hold} · 불가 ${count.bad} (누락 ${kinds.missing} · 불일치 ${kinds.conflict} · 위반 ${kinds.violation} · 직접 확인 ${kinds.unsure})`,
  metrics: [
    { key: 'processed', label: '점검 건수', value: items.length, unit: '건', ...(prevProcessed !== undefined ? { prev: prevProcessed } : {}) },
    { key: 'missing', label: '서류 누락', value: kinds.missing, unit: '건' },
    { key: 'conflict', label: '서류 불일치', value: kinds.conflict, unit: '건' },
    { key: 'violation', label: '규정 위반', value: kinds.violation, unit: '건' },
    { key: 'manual', label: '직접 확인', value: kinds.unsure, unit: '건' },
  ],
  table: {
    columns: ['요청코드', '유형', '화물', '서류', '판정', '근거'],
    rows: items.map((x) => [x.id, x.type, x.cargoText, x.docText, rules.STATUS[x.status], x.reason]),
  },
  review,
  // 일 2회(영업일 약 22일) × 회당 20분 → 월 약 14.5시간(내병목_kim jaehyung.md). 에이전트 후 5분은 목표치: 2주 시범 운영 뒤 보정
  time: { before_min: 20, after_min: 5, runs_per_month: 44, basis: '추정' },
  source: { label: '가상 승인 요청 서류(값 추출 표) · 필수 서류표 · 숫자표 · CAS·IMDG 샘플', rows: items.length },
  rules_version: rules.RULES_VERSION,
  synthetic: true,
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(doc.headline);
console.log(`표 ${doc.table.rows.length}행, 확인 필요 ${review.length}건, 기준일 ${asOf} → data/out/special-cargo-docs.json`);
review.forEach((r) => console.log(` ${r.id} ${r.code} ${r.reason}: ${r.detail}`));
