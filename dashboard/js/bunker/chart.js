// 꺾은선 그래프(외부 라이브러리 없이 SVG). 마우스/손가락을 올리면 가장 가까운 x 의 값이 말풍선으로 나온다.
import { el } from '../core.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 눈금이 깔끔하게 떨어지는 y 최대값과 간격 */
function niceScale(max, ticks = 5) {
  if (!(max > 0)) return { max: 1, step: 0.2 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(max / step) * step, step };
}

/**
 * @param {{series:{name:string,color:string,points:{x:number,y:number}[]}[], xUnit?:string, yLabel?:string, label?:string}} o
 */
export function lineChart({ series, xUnit = '', yLabel = '', label = '그래프' }) {
  const W = 720;
  const H = 320;
  const M = { l: 46, r: 18, t: 14, b: 34 };
  const wrap = el('div', 'chartwrap');
  const all = series.flatMap((x) => x.points);
  if (!all.length) return wrap;

  let x0 = Math.min(...all.map((p) => p.x));
  let x1 = Math.max(...all.map((p) => p.x));
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  const { max: yMax, step } = niceScale(Math.max(...all.map((p) => p.y)));
  const X = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const Y = (v) => H - M.b - (v / yMax) * (H - M.t - M.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    svg.append(s('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v * 100) / 100)));
  }
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const every = Math.ceil(xs.length / 12);
  xs.forEach((v, i) => { if (i % every === 0) svg.append(s('text', { x: X(v), y: H - M.b + 18, 'text-anchor': 'middle' }, v + xUnit)); });
  if (yLabel) svg.append(s('text', { x: 4, y: 10, class: 'ylabel' }, yLabel));

  series.forEach((ser) => {
    const pts = [...ser.points].sort((a, b) => a.x - b.x);
    svg.append(s('polyline', { points: pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' '), fill: 'none', stroke: ser.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach((p) => svg.append(s('circle', { cx: X(p.x), cy: Y(p.y), r: 3.5, fill: ser.color, class: 'pt' })));
  });

  const guide = s('line', { y1: M.t, y2: H - M.b, class: 'guide', visibility: 'hidden' });
  const marks = series.map((ser) => s('circle', { r: 6, fill: 'none', stroke: ser.color, 'stroke-width': 2.5, visibility: 'hidden' }));
  svg.append(guide, ...marks);

  const tip = el('div', 'charttip');
  tip.hidden = true;
  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const nearest = xs.reduce((a, b) => (Math.abs(X(b) - px) < Math.abs(X(a) - px) ? b : a), xs[0]);
    guide.setAttribute('x1', X(nearest));
    guide.setAttribute('x2', X(nearest));
    guide.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('b', '', `${nearest}${xUnit}`));
    series.forEach((ser, i) => {
      const p = ser.points.find((q) => q.x === nearest);
      marks[i].setAttribute('visibility', p ? 'visible' : 'hidden');
      if (!p) return;
      marks[i].setAttribute('cx', X(p.x));
      marks[i].setAttribute('cy', Y(p.y));
      const row = el('div');
      const dot = el('i', 'dot');
      dot.style.background = ser.color;
      row.append(dot, document.createTextNode(` ${ser.name}  ${p.y.toFixed(1)}`));
      tip.append(row);
    });
    tip.hidden = false;
    const left = (X(nearest) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left + 12, 4), box.width - 150)}px`;
  };
  const leave = () => { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); marks.forEach((m) => m.setAttribute('visibility', 'hidden')); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);

  const legend = el('div', 'legend');
  series.forEach((ser) => {
    const item = el('span', 'legitem');
    const dot = el('i', 'dot');
    dot.style.background = ser.color;
    item.append(dot, document.createTextNode(' ' + ser.name));
    legend.append(item);
  });
  wrap.append(svg, tip, legend);
  return wrap;
}
