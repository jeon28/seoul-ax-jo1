// 앱 껍데기: 사이드바 · 주소(#/ 홈, #/m/<slug> 메뉴) · 테마. 메뉴 화면은 menus/<slug>.js 를 그때 불러온다.
import { MENUS, HOME_ICON } from './menus.js';
import { BUNDLES, $, el, icon, loadAll, readDone } from './core.js';
import { renderHome } from './home.js';

const view = $('view');
let ALL = [];

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('axdash.theme', t); } catch (e) { /* 저장 못 해도 무방 */ }
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('axdash.theme'); } catch (e) { t = null; }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
}
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

function openCount(slug) {
  const item = ALL.find((a) => a.menu.slug === slug);
  if (!item) return 0;
  const done = readDone();
  return item.doc.review.filter((r) => !done.has(`${item.menu.slug}-${r.id}`)).length;
}

function refreshBadges() {
  document.querySelectorAll('[data-badge]').forEach((b) => {
    const n = openCount(b.dataset.badge);
    b.textContent = n || '';
    b.hidden = !n;
  });
}

function buildNav() {
  const nav = $('nav');
  nav.replaceChildren();
  const home = el('a', 'navitem');
  home.href = '#/';
  home.dataset.route = '/';
  home.append(icon(HOME_ICON), el('span', 'nl', '홈'));
  nav.append(home);
  for (const [key, b] of Object.entries(BUNDLES)) {
    const g = el('div', 'navgroup');
    const h = el('div', 'navhead');
    const dot = el('i', 'dot');
    dot.style.background = b.color;
    h.append(dot, el('span', '', `${key} ${b.name}`));
    g.append(h);
    MENUS.filter((m) => m.bundle === key).forEach((m) => {
      const a = el('a', 'navitem');
      a.href = '#/m/' + m.slug;
      a.dataset.route = '/m/' + m.slug;
      a.style.setProperty('--c', b.color);
      const badge = el('span', 'navbadge');
      badge.dataset.badge = m.slug;
      badge.hidden = true;
      a.append(icon(m.icon), el('span', 'nl', m.name), badge);
      g.append(a);
    });
    nav.append(g);
  }
}

function markActive(route) {
  document.querySelectorAll('.navitem').forEach((a) => a.classList.toggle('on', a.dataset.route === route));
}

function showError(title, e) {
  const box = el('div', 'glass panel errorbox');
  box.append(el('h2', '', title), el('p', 'sub', String(e && e.message ? e.message : e)));
  view.replaceChildren(box);
}

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const h = location.hash.replace(/^#/, '') || '/';
  closeDrawer();
  window.scrollTo(0, 0);
  if (h === '/' || h === '') {
    markActive('/');
    document.title = '장금상선 AX 대시보드';
    view.replaceChildren(renderHome(ALL));
    refreshBadges();
    return;
  }
  const m = h.match(/^\/m\/([a-z0-9-]+)$/);
  const item = m && ALL.find((a) => a.menu.slug === m[1]);
  if (!item) {
    markActive('');
    showError('없는 메뉴입니다', '왼쪽 목록에서 메뉴를 골라 주세요.');
    return;
  }
  markActive('/m/' + item.menu.slug);
  document.title = `${item.menu.name} · 장금상선 AX 대시보드`;
  try {
    const mod = await import(`../menus/${item.menu.slug}.js`);
    if (seq !== routeSeq) return; // 그 사이 다른 메뉴를 눌렀으면 이 화면은 버린다
    view.replaceChildren(mod.default({ menu: item.menu, doc: item.doc, raw: item.raw, problems: item.problems, all: ALL }));
  } catch (e) {
    // 한 조원의 화면이 깨져도 나머지 메뉴는 그대로 동작한다.
    showError(`${item.menu.name} 화면을 그리지 못했습니다`, e);
  }
}

function closeDrawer() { document.body.classList.remove('drawer'); }

(async function main() {
  initTheme();
  buildNav();
  $('menuBtn').addEventListener('click', () => document.body.classList.toggle('drawer'));
  $('scrim').addEventListener('click', closeDrawer);
  $('themeBtn').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  try {
    ALL = await loadAll();
  } catch (e) {
    showError('결과 파일(data/out)을 읽지 못했습니다', e);
    return;
  }
  addEventListener('axdash:review', refreshBadges);
  addEventListener('hashchange', route);
  await route();
  refreshBadges();
})();
