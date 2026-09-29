/* 首页的星图与入场动效。只有首页用，由 assets/app.js 在认出 .hero-search 时动态 import。

   星图是一张视口大小的固定画布（.starfield）：三层视差的恒星、按刻线角度连成的星座、
   沿星座边走的光点、偶发的流星。星座节点用站标那枚菱形，星等符号取制图惯例。
   星与线只用骨白，光点用 --accent；颜色从 :root 的 token 现取，不在这里另写色号。

   入场只作用于首屏之外的那批：已经在视口里的元素首次绘制就在，此刻再从透明起步会
   先闪出完整的一屏再淡入。 */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const ease = t => 1 - Math.pow(1 - t, 3);

/* 固定种子：星座与恒星的位置不随重绘、缩放变动 */
const rng = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

/* :root 上的 #rrggbb → 'r,g,b'，供 rgba() 拼接 */
function token(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) throw new Error(name + ' 不是 #rrggbb：' + v);
  return [1, 3, 5].map(i => parseInt(m[1].slice(i - 1, i + 1), 16)).join(',');
}

/* 首屏那三组星座：节点写成 [占版心宽度的比例, y 像素]，落在字标、铭牌与徽记之间的空地上 */
const HERO_CONS = [
  { n: [[.535, 60], [.575, 120], [.55, 196], [.628, 150], [.665, 84], [.615, 36], [.705, 214]],
    e: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [3, 6]], lab: 'RA 05h 14m · DEC +21°' },
  { n: [[.03, 44], [.072, 22], [.118, 52], [.165, 26], [.212, 56]],
    e: [[0, 1], [1, 2], [2, 3], [3, 4]], lab: 'RA 18h 36m · DEC +38°' },
  { n: [[.935, 44], [.972, 98], [.945, 158], [.985, 222]],
    e: [[0, 1], [1, 2], [2, 3]], lab: 'RA 02h 07m · DEC −11°' },
];

/* 银河带：一条自左下斜向右上的带，四成恒星偏向它，外加一层去饱和的雾 */
const BAND = { y0: .78, y1: .12 };

function sky(canvas) {
  const BONE = token('--bone'), HI = token('--bone-hi'), ACCENT = token('--accent');
  const FONT = '600 9px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-disp');
  const R = rng(20260929);
  const T0 = performance.now();
  let g, W, H, X0, XW, stars, cons, met = [], nextMet = T0 + 3200;
  let ox = 0, oy = 0, tx = 0, ty = 0;

  function build() {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
    g = canvas.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const hr = document.querySelector('.hero').getBoundingClientRect();
    X0 = hr.left; XW = hr.width;

    stars = [];
    const n = Math.round(W * H / 4800);
    for (let i = 0; i < n; i++) {
      const u = R(), z = u < .5 ? .15 : u < .78 ? .35 : u < .94 ? .65 : 1;
      const big = z >= .65 && R() < .4, band = R() < .38;
      let x = R() * W, y = R() * H;
      if (band) y = (BAND.y0 + (BAND.y1 - BAND.y0) * (x / W)) * H + (R() + R() + R() - 1.5) * 150 / Math.cos(Math.atan2(-.66, 1));
      stars.push({
        x, y, z, band,
        r: (.32 + R() * .5) * (.7 + z * .9), a: .24 + R() * .56,
        ph: R() * TAU, sp: .5 + R() * 1.7,
        glyph: big ? (R() < .55 ? 'spike' : 'ring') : R() < .03 ? 'plus' : 'dot',
      });
    }

    /* 首屏三组随首屏一起画出来；其余是沿六个刻线方向（0/60/120…）随机走出来的，
       第一次进入视口时才开始画 */
    cons = HERO_CONS.map((h, i) => ({
      p: h.n.map(([fx, fy]) => [X0 + fx * XW, fy]), e: h.e, lab: h.lab, par: .55,
      born: reduce ? -1e9 : T0 + 500 + i * 700,
    }));
    const dirs = [0, 60, 120, 180, 240, 300];
    for (let i = 0; i < 9; i++) {
      let x = X0 + (.05 + .9 * R()) * XW, y = 520 + i * 250 + R() * 120;
      let a = dirs[Math.floor(R() * 6)];
      const p = [[x, y]], e = [], cnt = 4 + Math.floor(R() * 3);
      for (let j = 1; j < cnt; j++) {
        a = (a + (R() < .5 ? 60 : -60) + (R() < .25 ? 30 : 0) + 360) % 360;
        const len = 54 + R() * 70;
        x += Math.cos(a * Math.PI / 180) * len;
        y += Math.sin(a * Math.PI / 180) * len;
        p.push([x, y]);
        e.push([j - 1, j]);
        if (j >= 2 && R() < .3) e.push([j, j - 2]);
      }
      const h = Math.floor(R() * 24), m = Math.floor(R() * 60), dec = Math.floor(R() * 80 - 40);
      cons.push({
        p, e, par: .3, born: reduce ? -1e9 : null,
        lab: `RA ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m · DEC ${dec < 0 ? '−' : '+'}${Math.abs(dec)}°`,
      });
    }
  }

  function diamond(x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
    g.closePath();
  }

  function frame(t) {
    ox += (tx - ox) * .06; oy += (ty - oy) * .06;
    const sy = scrollY;
    g.clearRect(0, 0, W, H);

    g.save();
    g.translate(W / 2 - ox * 10, ((BAND.y0 + BAND.y1) / 2) * H - sy * .06 - oy * 6);
    g.rotate(Math.atan2((BAND.y1 - BAND.y0) * H, W));
    const haze = g.createLinearGradient(0, -190, 0, 190);
    haze.addColorStop(0, `rgba(${BONE},0)`); haze.addColorStop(.5, `rgba(${BONE},.05)`); haze.addColorStop(1, `rgba(${BONE},0)`);
    g.fillStyle = haze; g.fillRect(-W, -190, W * 2, 380);
    g.restore();

    /* 远处的星视差小、近处的大；银河带上的星与雾同速，且不回卷，否则带子会与雾错开 */
    for (const s of stars) {
      const x = s.x - ox * s.z * 34;
      const y = s.band ? s.y - sy * .06 - oy * 6 : mod(s.y - sy * s.z * .42 - oy * s.z * 22, H + 40) - 20;
      const a = s.a * (.72 + .28 * Math.sin(t * .001 * s.sp + s.ph));
      g.fillStyle = `rgba(${BONE},${a})`;
      g.beginPath(); g.arc(x, y, s.r, 0, TAU); g.fill();
      g.lineWidth = 1;
      if (s.glyph === 'spike') {
        const len = 4 + s.z * 9;
        g.strokeStyle = `rgba(${BONE},${a * .55})`;
        g.beginPath(); g.moveTo(x - len, y); g.lineTo(x + len, y); g.moveTo(x, y - len); g.lineTo(x, y + len); g.stroke();
      } else if (s.glyph === 'ring') {
        g.strokeStyle = `rgba(${BONE},${a * .6})`;
        g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.stroke();
      } else if (s.glyph === 'plus') {
        g.strokeStyle = `rgba(${BONE},${a * .7})`;
        g.beginPath(); g.moveTo(x - 2.5, y); g.lineTo(x + 2.5, y); g.moveTo(x, y - 2.5); g.lineTo(x, y + 2.5); g.stroke();
      }
    }

    for (const k of cons) {
      const off = sy * k.par - oy * 10;
      if (k.born === null) {
        const yy = k.p[0][1] - off;
        if (yy > -80 && yy < H + 80) k.born = t; else continue;
      }
      if (t < k.born) continue;
      const p = reduce ? 1 : clamp((t - k.born) / 2800, 0, 1), q = ease(p), n = k.e.length;
      const pt = i => [k.p[i][0] - ox * 12, k.p[i][1] - off];

      g.lineWidth = 1;
      g.strokeStyle = `rgba(${BONE},.17)`;
      g.beginPath();
      k.e.forEach(([a, b], i) => {
        const f = clamp(q * n - i, 0, 1);
        if (f <= 0) return;
        const A = pt(a), B = pt(b);
        g.moveTo(A[0], A[1]); g.lineTo(lerp(A[0], B[0], f), lerp(A[1], B[1], f));
      });
      g.stroke();

      k.p.forEach((_, i) => {
        if (q * n < i - .15) return;
        const [x, y] = pt(i);
        g.fillStyle = `rgba(${BONE},${.8 * (.75 + .25 * Math.sin(t * .0014 + i * 1.7))})`;
        diamond(x, y, i === 0 ? 3.8 : 2.8); g.fill();
        if (i === 0) { g.strokeStyle = `rgba(${BONE},.32)`; diamond(x, y, 7.5); g.stroke(); }
      });

      if (p < 1) continue;
      const [x0, y0] = pt(0);
      g.font = FONT;
      g.fillStyle = `rgba(${BONE},.3)`;
      g.fillText(k.lab, x0 - 4, y0 + 22 + Math.max(...k.p.map(v => v[1] - k.p[0][1])));

      /* 光点每 3 秒换一条边，走 1.5 秒 */
      if (reduce) continue;
      const ei = Math.floor(t / 3000) % n, f = (t % 3000) / 1500;
      if (f >= 1) continue;
      const [a, b] = k.e[ei], A = pt(a), B = pt(b), e = ease(f);
      const hx = lerp(A[0], B[0], e), hy = lerp(A[1], B[1], e);
      const x1 = lerp(A[0], B[0], Math.max(0, e - .35)), y1 = lerp(A[1], B[1], Math.max(0, e - .35));
      const tail = g.createLinearGradient(x1, y1, hx, hy);
      tail.addColorStop(0, `rgba(${ACCENT},0)`); tail.addColorStop(1, `rgba(${ACCENT},.85)`);
      g.strokeStyle = tail; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = `rgba(${HI},${.9 * (1 - f * f)})`;
      g.beginPath(); g.arc(hx, hy, 1.7, 0, TAU); g.fill();
    }

    if (!reduce && t > nextMet) {
      nextMet = t + 4500 + R() * 7500;
      const ang = (22 + R() * 16) * Math.PI / 180, sp = 820 + R() * 400;
      met.push({ x: W * (.04 + R() * .78), y: H * R() * .42, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t0: t, life: .7 + R() * .45, len: 120 + R() * 100 });
    }
    met = met.filter(m => t - m.t0 < m.life * 1000);
    for (const m of met) {
      const age = (t - m.t0) / 1000, f = age / m.life, sp = Math.hypot(m.vx, m.vy);
      const hx = m.x + m.vx * age, hy = m.y + m.vy * age, len = m.len * (1 - f * .5), al = .85 * (1 - f * f);
      const x1 = hx - m.vx / sp * len, y1 = hy - m.vy / sp * len;
      const trail = g.createLinearGradient(x1, y1, hx, hy);
      trail.addColorStop(0, `rgba(${BONE},0)`); trail.addColorStop(1, `rgba(${BONE},${al})`);
      g.strokeStyle = trail; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = `rgba(${HI},${al})`;
      g.beginPath(); g.arc(hx, hy, 1.5, 0, TAU); g.fill();
    }
  }

  build();
  if (reduce) {
    frame(performance.now());
    let id = 0;
    addEventListener('resize', () => { clearTimeout(id); id = setTimeout(() => { build(); frame(performance.now()); }, 120); });
    return;
  }

  addEventListener('pointermove', e => { tx = e.clientX / W - .5; ty = e.clientY / H - .5; }, { passive: true });
  let raf = 0;
  const tick = t => { frame(t); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  /* 标签页隐藏时停，回来接着画 */
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(tick);
  });
  let id = 0;
  addEventListener('resize', () => { clearTimeout(id); id = setTimeout(build, 120); });
}

/* 首屏之外的卡片与分组标题，第一次滚进视口时自下浮起；分隔线自左展开。
   用 Web Animations 而不是切类：元素在动画之前与之后都是它本来的样式，脚本没跑起来
   页面也完整可读。 */
function rise() {
  if (reduce) return;
  const curve = 'cubic-bezier(.2, .7, .2, 1)';
  const list = [...document.querySelectorAll('.group-label, .entries > li')];
  const io = new IntersectionObserver(batch => {
    batch.filter(x => x.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach((x, i) => {
        const el = x.target, delay = i * 70;
        io.unobserve(el);
        el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
          { duration: 800, delay, easing: curve, fill: 'backwards' });
        if (el.matches('.group-label')) {
          el.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }],
            { duration: 1300, delay: delay + 120, easing: curve, fill: 'backwards', pseudoElement: '::after' });
        }
      });
  }, { threshold: .06 });
  /* 已在视口里的不登记：它们本来就在 */
  const h = innerHeight;
  list.filter(el => el.getBoundingClientRect().top >= h).forEach(el => io.observe(el));
}

/* 字标扫光：一道亮带掠过一次，随后撤掉 .sheen，字回到普通的填充 */
function sheen() {
  if (reduce) return;
  const w = document.querySelector('.wordmark');
  w.classList.add('sheen');
  w.addEventListener('animationend', () => w.classList.remove('sheen'), { once: true });
}

/* 分隔线刻度尺的相位：让每 88px 的长刻度落在背景的竖刻线上（中轴 ± 88k）。
   起点是标题文字之后，随字数与字体变，所以字体就位与视口变动后都要重算。 */
function ruler() {
  const put = () => {
    const half = document.documentElement.clientWidth / 2;
    document.querySelectorAll('.group-label').forEach(l => {
      const w = parseFloat(getComputedStyle(l, '::after').width) || 0;
      l.style.setProperty('--rx', mod(half - (l.getBoundingClientRect().right - w), 88).toFixed(2) + 'px');
    });
  };
  put();
  document.fonts.ready.then(put);
  addEventListener('resize', put);
}

/* 星轨：同一列里相邻两张卡的节点用虚线相连，两端各一枚菱形，偶有光点沿线走。
   位置只取布局值（offsetLeft / offsetTop）：卡片浮起动画进行时 getBoundingClientRect
   带着 transform 的位移，据此画出的线会错开最多 16px，而且要等下一次重算才回正。
   li、.entry 都是定位元素，offsetParent 链一路走到 main.index。 */
function routes() {
  const main = document.querySelector('main.index');
  const layer = document.createElement('div');
  layer.className = 'routes';
  layer.setAttribute('aria-hidden', 'true');
  main.appendChild(layer);

  const at = el => {
    let x = 0, y = 0;
    for (let e = el; e && e !== main; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return [x, y];
  };

  function build() {
    let html = '', n = 0;
    main.querySelectorAll('.entries').forEach(ul => {
      const cols = new Map();
      [...ul.children].forEach(li => {
        const node = li.querySelector('.entry-node');
        const [x, y] = at(node);
        const col = cols.get(li.offsetLeft) || cols.set(li.offsetLeft, []).get(li.offsetLeft);
        col.push({ x: x + node.offsetWidth / 2, top: y, bottom: y + node.offsetHeight });
      });
      cols.forEach(list => {
        list.sort((a, b) => a.top - b.top);
        for (let i = 0; i + 1 < list.length; i++) {
          const y1 = list[i].bottom + 8, len = list[i + 1].top - 8 - y1;
          if (len < 10) continue;
          html += `<i class="route" style="left:${list[i].x}px;top:${y1}px;height:${len}px;--len:${len}px;--d:${-((n++ * 2.7) % 9).toFixed(2)}s"><b></b></i>`;
        }
      });
    });
    layer.innerHTML = html;
  }

  build();
  new ResizeObserver(build).observe(main);
  document.fonts.ready.then(build);
}

export default function init() {
  const canvas = document.querySelector('.starfield');
  if (!canvas) throw new Error('首页缺少 .starfield 画布');
  sky(canvas);
  rise();
  sheen();
  ruler();
  routes();
}
