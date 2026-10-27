// 메뉴 공통 화면. menus/<slug>.js 가 그대로 불러 쓰거나, 일부 조각(아래 export)만 골라 자기 화면을 만든다.
import { BUNDLES, el, icon, fmt, fmtHours, saving, metricTile, tableEl, readDone, writeDone } from './core.js';

export function hero({ menu, doc, raw }) {
  const b = BUNDLES[menu.bundle];
  const h = el('header', 'hero menuhero');
  h.style.setProperty('--c', b.color);
  const ic = el('span', 'aicon big');
  ic.append(icon(menu.icon));
  const left = el('div', 'htext');
  const t = el('h1', '', menu.name);
  const chips = el('div', 'hchips');
  chips.append(el('span', 'tag bundletag', `${menu.bundle} ${b.name}`), el('span', 'tag', menu.owner));
  if (doc.as_of) chips.append(el('span', 'tag', `기준일 ${doc.as_of}`));
  if (doc.synthetic) chips.append(el('span', 'tag', '가상 데이터'));
  chips.append(el('span', 'badge ' + (raw ? 'ok' : 'warn'), raw ? '결과 파일 연결됨' : '결과 파일 없음'));
  left.append(t, el('p', 'sub', menu.agent), chips);
  h.append(ic, left);
  return h;
}

export function headline({ doc }) {
  return doc.headline ? el('p', 'bigline glass', doc.headline) : el('p', 'bigline glass sub', '한 줄 요약(headline)이 아직 없습니다.');
}

export function metrics({ doc }) {
  const row = el('div', 'tiles metrics');
  doc.metrics.forEach((m) => {
    const t = el('div', 'glass tile');
    t.append(el('div', 'lab', m.label));
    const v = el('div', 'val', fmt(m.value));
    v.append(el('small', '', m.unit || ''));
    t.append(v);
    if (m.prev !== undefined && m.prev !== null) t.append(el('div', 'note', `전회 ${fmt(m.prev)}${m.unit || ''}`));
    row.append(t);
  });
  return row;
}

// 스킬을 부르는 순서(에이전트 SKILL.md 의 순서와 같게)
export function pipeline({ menu }) {
  const p = el('section', 'glass panel');
  const head = el('div', 'phead');
  head.append(el('h2', '', '에이전트가 스킬을 부르는 순서'), el('span', 'sub', `agents/${menu.slug}/SKILL.md`));
  const steps = el('ol', 'steps');
  menu.skills.forEach((s, i) => {
    const li = el('li', 'step');
    li.append(el('span', 'stepno', String(i + 1)));
    const body = el('div', 'stepbody');
    body.append(el('b', '', s.name), el('code', '', `skills/${s.slug}/SKILL.md`));
    li.append(body, el('span', 'badge ' + (s.status === 'done' ? 'ok' : 'warn'), s.status === 'done' ? '작성 완료' : '작성 전'));
    steps.append(li);
  });
  p.append(head, steps);
  return p;
}

export function resultTable({ doc }) {
  const p = el('section', 'glass panel');
  const head = el('div', 'phead');
  head.append(el('h2', '', '결과 표'), el('span', 'sub', `${doc.table.rows.length}행`));
  const q = el('input', 'search');
  q.type = 'search';
  q.placeholder = '표 안에서 찾기';
  q.setAttribute('aria-label', '표 안에서 찾기');
  head.append(q);
  const wrap = el('div', 'tablewrap');
  const draw = () => {
    wrap.replaceChildren();
    if (!doc.table.columns.length) wrap.append(el('p', 'sub', '표가 아직 없습니다. data/out 결과 파일의 table 을 채우면 여기에 나옵니다.'));
    else wrap.append(tableEl(doc.table, q.value));
  };
  q.addEventListener('input', draw);
  draw();
  p.append(head, wrap);
  return p;
}

export function reviewList({ menu, doc }) {
  const p = el('section', 'glass panel');
  const head = el('div', 'phead');
  head.append(el('h2', '', '확인 필요'));
  const list = el('div', 'rlist');
  const draw = () => {
    list.replaceChildren();
    const done = readDone();
    const open = doc.review.filter((r) => !done.has(`${menu.slug}-${r.id}`)).length;
    head.querySelector('.sub')?.remove();
    head.append(el('span', 'sub', doc.review.length ? `${open}건 대기 · 전체 ${doc.review.length}건` : '없음'));
    if (!doc.review.length) list.append(el('p', 'sub', '사람이 확인할 건이 없습니다.'));
    doc.review.forEach((r) => {
      const key = `${menu.slug}-${r.id}`;
      const isDone = done.has(key);
      const row = el('div', 'rrow flat' + (isDone ? ' done' : ''));
      const body = el('div', 'rbody');
      const l1 = el('div', 'r1');
      l1.append(el('b', '', r.code), el('span', '', r.reason));
      body.append(l1, el('div', 'r2', r.detail));
      const btn = el('button', 'btn' + (isDone ? ' ghost' : ''), isDone ? '되돌리기' : '확인 완료');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const s = readDone();
        if (s.has(key)) s.delete(key); else s.add(key);
        writeDone(s);
        draw();
        dispatchEvent(new Event('axdash:review'));
      });
      row.append(body, btn);
      list.append(row);
    });
  };
  draw();
  p.append(head, list);
  return p;
}

// 걸린 시간 전/후 막대. 월 절감 시간 = (전−후)×횟수÷60
export function timeSaving({ doc }) {
  const p = el('section', 'glass panel');
  const ph = el('div', 'phead');
  ph.append(el('h2', '', '걸리는 시간 전 / 후'));
  p.append(ph);
  const t = doc.time;
  if (!t) { p.append(el('p', 'sub', 'time 칸이 없습니다.')); return p; }
  const max = Math.max(t.before_min, t.after_min, 1);
  const bar = (label, min, cls) => {
    const r = el('div', 'barrow');
    const track = el('div', 'track');
    const fill = el('div', 'fill ' + cls);
    fill.style.width = `${Math.max(4, (min / max) * 100)}%`;
    track.append(fill);
    r.append(el('span', 'barlab', label), track, el('span', 'barval', `${fmt(min)}분`));
    return r;
  };
  p.append(bar('지금(수작업)', t.before_min, 'before'), bar('에이전트 후', t.after_min, 'after'));
  const h = fmtHours(saving(doc));
  const big = el('div', 'saveline');
  big.append(el('b', '', `월 ${h.text} 절감`), el('span', 'sub', ` · 월 ${fmt(t.runs_per_month)}회 · 근거: ${t.basis}`));
  p.append(big);
  return p;
}

export function info({ menu, doc, raw, problems }) {
  const p = el('section', 'glass panel');
  const ph = el('div', 'phead');
  ph.append(el('h2', '', '자료 · 규칙 정보'));
  p.append(ph);
  const dl = el('dl', 'kv');
  const add = (k, v) => { dl.append(el('dt', '', k), el('dd', '', v)); };
  add('입력 자료', `${doc.source.label} (${fmt(doc.source.rows)}행)`);
  add('규칙 버전', doc.rules_version || '-');
  add('결과 파일', `data/out/${menu.file}`);
  add('결과 꼴', raw ? `schema v${doc.schema_version}` : '-');
  p.append(dl);
  const chk = el('div', 'check ' + (problems.length ? 'bad' : 'ok'));
  if (!problems.length) chk.append(el('b', '', '결과 파일 꼴 점검: 통과'));
  else {
    chk.append(el('b', '', `결과 파일 꼴 점검: 고칠 곳 ${problems.length}건`));
    const ul = el('ul');
    problems.forEach((s) => ul.append(el('li', '', s)));
    chk.append(ul);
  }
  p.append(chk);
  return p;
}

export function howTo({ menu }) {
  const d = el('details', 'glass panel howto');
  d.append(el('summary', '', '이 메뉴 채우는 법 (담당 조원용)'));
  const ul = el('ul');
  const items = [
    `에이전트 지시서: agents/${menu.slug}/SKILL.md 와 skills/*/SKILL.md 를 쓴다(스킬을 부르는 순서). 다 쓰면 dashboard/js/menus.js 에서 내 스킬 status 를 'done' 으로 바꾼다.`,
    `결과 파일: data/out/${menu.file} 를 lib/result-shape.md 꼴로 채운다. 이 화면의 "결과 파일 꼴 점검"이 통과하면 된다.`,
    `화면: 기본 화면으로 충분하면 그대로 둔다. 바꾸려면 dashboard/menus/${menu.slug}.js 를 고친다(이 파일만 고치면 다른 조원 화면에 영향 없음).`,
    '가상 데이터만 쓴다. 실제 선박명·컨테이너 번호·화주·금액은 넣지 않고, 보내기 기능은 만들지 않는다.',
  ];
  items.forEach((s) => ul.append(el('li', '', s)));
  d.append(ul);
  return d;
}

// 기본 메뉴 화면
export function renderAgentPage(ctx) {
  const page = el('div', 'page');
  const cols = el('div', 'cols');
  const main = el('div', 'colmain');
  const side = el('div', 'colside');
  main.append(resultTable(ctx), reviewList(ctx));
  side.append(timeSaving(ctx), info(ctx));
  cols.append(main, side);
  page.append(hero(ctx), headline(ctx), metrics(ctx), pipeline(ctx), cols, howTo(ctx));
  return page;
}
