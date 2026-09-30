/* 内页的星空窗。页面引 <script type="module"> 载入（shell.head 的 sky 参数），只有带 .page-head 的页面用。

   页首是一片星空：整幅宽的恒星、一条斜过的银河雾、本页专属的星座，标题站在窗里；
   往下星越来越稀，落到标题下的规线时散尽，流星与星座都止于规线，正文背后仍是安静的底。窗随页面滚走，
   滚出去之后不再绘制。画布与首页共用 .starfield，画法在 sky-core.js。

   星座按页面 _id 定种子，一页一座；恒星的位置全站同一片天。星座的节点数取本页分节数 + 3。 */

import { reduce, TAU, clamp, smooth, rng, fnv, brush } from './sky-core.js';

const head = document.querySelector('.site-head');
const ph = document.querySelector('.page-head');
const main = document.querySelector('main');
if (!head || !ph || !main) throw new Error('内页缺少 .site-head、.page-head 或 main');

const canvas = document.createElement('canvas');
canvas.className = 'starfield';
canvas.dataset.page = '';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);

const b = brush(canvas), g = b.g;
const R = rng(20260929);
const PAGE = main.dataset.src || ph.querySelector('h1').textContent;
const SECTIONS = document.querySelectorAll('main > section[id], main section.block[id]').length;
const T0 = performance.now();

let W, H, colR, bandTop, bandBot;
let stars = [], con = null, met = [], nextMet = T0 + 3200;
let ox = 0, oy = 0, tx = 0, ty = 0;

/* 窗里的恒星，文档坐标。四成沿一条斜带聚集，越靠近窗底越稀 */
function field() {
  const bh = bandBot - bandTop, n = Math.round(W * bh / 1500), out = [];
  for (let tries = 0; out.length < n && tries < n * 6; tries++) {
    const u = R(), z = u < .5 ? .15 : u < .78 ? .35 : u < .94 ? .65 : 1;
    const big = z >= .65 && R() < .4, band = R() < .36;
    const x = R() * W;
    let y = bandTop + R() * bh;
    if (band) y = bandTop + bh * .5 - .1 * (x - W / 2) + (R() + R() + R() - 1.5) * bh * .34;
    const t = (y - bandTop) / bh;
    if (t < 0 || t > 1 || R() > 1 - smooth(.42, 1, t)) continue;
    out.push({
      x, y, z, r: (.32 + R() * .5) * (.7 + z * .9), a: .24 + R() * .56,
      ph: R() * TAU, sp: .5 + R() * 1.7,
      glyph: big ? (R() < .55 ? 'spike' : 'ring') : R() < .03 ? 'plus' : 'dot',
    });
  }
  return out;
}

/* 沿六个刻线方向（0/60/120…）走出来的星座，缩放后装进 w×h 的盒子，返回相对盒心的坐标。
   走出来的图形相互太近或太瘦长就重来，最多 80 次，用最后一次 */
function walk(Rn, n, w, h) {
  let best;
  for (let t = 0; t < 80; t++) {
    let a = Math.floor(Rn() * 6) * 60, x = 0, y = 0;
    const p = [[0, 0]], e = [];
    for (let j = 1; j < n; j++) {
      a = (a + (Rn() < .5 ? 60 : -60) + (Rn() < .25 ? 30 : 0) + 360) % 360;
      const len = 40 + Rn() * 34;
      x += Math.cos(a * Math.PI / 180) * len; y += Math.sin(a * Math.PI / 180) * len;
      p.push([x, y]); e.push([j - 1, j]);
      if (j >= 2 && Rn() < .3) e.push([j, j - 2]);
    }
    let close = false;
    for (let i = 0; i < n && !close; i++) {
      for (let j = i + 1; j < n; j++) if (Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]) < 28) { close = true; break; }
    }
    const xs = p.map(v => v[0]), ys = p.map(v => v[1]);
    const bw = Math.max(...xs) - Math.min(...xs) || 1, bh = Math.max(...ys) - Math.min(...ys) || 1;
    const s = Math.min(w / bw, h / bh, 1.6);
    best = { p, e, s, bw, bh, x0: Math.min(...xs), y0: Math.min(...ys) };
    if (!close && s >= .6) break;
  }
  const { p, e, s, bw, bh, x0, y0 } = best;
  return { p: p.map(([x, y]) => [(x - x0 - bw / 2) * s, (y - y0 - bh / 2) * s]), e };
}

function build() {
  const d = Math.min(devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
  g.setTransform(d, 0, 0, d, 0, 0);

  colR = main.getBoundingClientRect().right + scrollX;
  /* 窗从站头下沿到标题下的规线：星与流星都止于规线。规线是 h1 的下边框，
     标题右边挂了东西的页面（.head-row）则是那一行的下边框。页首上写了 data-sky-end 的，
     窗改到那个元素的下沿止（装备库：搜索框要留在窗里）；那个元素不能是 sticky 的，
     滚过一段之后量到的就不是它排版时的位置了 */
  const end = ph.dataset.skyEnd ? document.querySelector(ph.dataset.skyEnd) : null;
  const rule = end || ph.querySelector('.head-row') || ph.querySelector('h1');
  bandTop = head.offsetHeight;
  bandBot = rule.getBoundingClientRect().bottom + scrollY;
  stars = field();

  /* 星座站在标题右边；标题右缘与版心右缘之间放不下就不画 */
  con = null;
  const rg = document.createRange();
  rg.selectNodeContents(ph.querySelector('h1'));
  const bx0 = Math.max(rg.getBoundingClientRect().right + 90, colR - 300), bx1 = Math.min(colR + 260, W - 56);
  /* 下沿留出标签那一行；标题右边挂着东西时（配装索引页的投稿入口）星座退到它上面 */
  const aside = [...ph.querySelectorAll('.head-row > :not(h1)')].map(el => el.getBoundingClientRect().top + scrollY);
  const by0 = bandTop + 34, by1 = Math.min(bandBot - 24, ...aside.map(y => y - 16));
  if (bx1 - bx0 > 150 && by1 - by0 > 90) {
    const Rn = rng(fnv(PAGE)), c = walk(Rn, clamp(SECTIONS + 3, 6, 11), bx1 - bx0, by1 - by0);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    const h = Math.floor(Rn() * 24), m = Math.floor(Rn() * 60), dec = Math.floor(Rn() * 80 - 40);
    con = {
      p: c.p.map(([x, y]) => [cx + x, cy + y]), e: c.e, born: reduce ? -1e9 : T0 + 500,
      lab: `RA ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m · DEC ${dec < 0 ? '−' : '+'}${Math.abs(dec)}°`,
    };
  }
}

/* 窗的可见范围：滚过窗底再加一点余量就整窗不画 */
const inWindow = () => scrollY < bandBot + 60;

function frame(t) {
  ox += (tx - ox) * .06; oy += (ty - oy) * .06;
  const sy = scrollY;
  g.clearRect(0, 0, W, H);
  if (!inWindow()) return;

  b.haze(W / 2 - ox * 10, bandTop + (bandBot - bandTop) * .5 - sy, Math.atan2(-.1 * W, W), 80, .075, W);
  /* 近处的星比页面滚得略快，远处的与页面同速，窗里因此有层次，又不会有星落到规线之下 */
  b.stars(stars, t, ox, s => s.y - sy * (1 + .1 * s.z) - oy * s.z * 10, H);
  if (con) b.con(con, i => [con.p[i][0] - ox * 8, con.p[i][1] - sy - oy * 5], t);

  if (!reduce && t > nextMet) {
    nextMet = t + 4500 + R() * 7500;
    if (sy < bandBot * .4) {
      const ang = (22 + R() * 16) * Math.PI / 180, sp = 820 + R() * 400;
      met.push({
        x: W * (.04 + R() * .7), y: bandTop + 20 + R() * Math.max(10, bandBot - bandTop - 120),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: t, life: .7 + R() * .45, len: 120 + R() * 100,
      });
    }
  }
  met = met.filter(m => t - m.t0 < m.life * 1000);
  /* 流星斜着飞，一路会落进正文：裁在规线上，读作落到地平线后面 */
  g.save();
  g.beginPath(); g.rect(0, 0, W, bandBot - sy); g.clip();
  for (const m of met) b.meteor(m, t, sy);
  g.restore();
}

build();
/* 先读一次样式，让 opacity: 0 落地，再加 .on 才有淡入 */
void canvas.offsetWidth;
canvas.classList.add('on');

let pending = 0;
const redraw = () => { if (!pending) pending = requestAnimationFrame(t => { pending = 0; frame(t); }); };

let rid = 0;
const rebuild = () => { clearTimeout(rid); rid = setTimeout(() => { build(); if (reduce) redraw(); }, 120); };
addEventListener('resize', rebuild);
addEventListener('load', rebuild);
addEventListener('starside:rest', rebuild);
document.fonts.ready.then(rebuild);
new ResizeObserver(rebuild).observe(document.body);

if (reduce) {
  redraw();
  addEventListener('scroll', redraw, { passive: true });
} else {
  addEventListener('pointermove', e => { tx = e.clientX / W - .5; ty = e.clientY / H - .5; }, { passive: true });
  /* 窗滚出去之后停掉动画循环，滚回来再接着画；隐藏的标签页同样停 */
  let raf = 0;
  const tick = t => {
    frame(t);
    raf = inWindow() && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => { if (!raf && inWindow() && !document.hidden) raf = requestAnimationFrame(tick); };
  addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);
  wake();
}
