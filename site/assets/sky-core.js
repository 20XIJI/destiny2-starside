/* 星空的公共件：首页的 sky.js 与内页的 sky-page.js 共用。
   星与线只用骨白，光点用 --accent；颜色从 :root 的 token 现取，不在这里另写色号。
   恒星的生成各页自己写（首页整屏、内页只有页首一片窗），画法在这里一处。 */

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const TAU = Math.PI * 2;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (a, n) => ((a % n) + n) % n;
export const ease = t => 1 - Math.pow(1 - t, 3);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* 固定种子：星座与恒星的位置不随重绘、缩放变动 */
export const rng = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
export const fnv = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/* :root 上的 #rrggbb → 'r,g,b'，供 rgba() 拼接 */
export function token(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) throw new Error(name + ' 不是 #rrggbb：' + v);
  return [1, 3, 5].map(i => parseInt(m[1].slice(i - 1, i + 1), 16)).join(',');
}

/* 星等符号取制图惯例：点、十字芒、圈、加号。星座节点用站标那枚菱形 */
export function brush(canvas) {
  const g = canvas.getContext('2d');
  const BONE = token('--bone'), HI = token('--bone-hi'), ACCENT = token('--accent');
  const FONT = '600 9px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-disp');

  function diamond(x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
    g.closePath();
  }

  /* 恒星。yOf 给每颗星此刻的屏幕纵坐标，视差与回卷由调用方定；H 用来跳过屏外的 */
  function stars(list, t, ox, yOf, H) {
    for (const s of list) {
      const x = s.x - ox * s.z * 34;
      const y = yOf(s);
      if (y < -20 || y > H + 20) continue;
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
  }

  /* 银河带的雾：以 (cx, cy) 为中心、转 ang 的一条竖向渐变带，宽 2*half */
  function haze(cx, cy, ang, half, alpha, W) {
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    const gr = g.createLinearGradient(0, -half, 0, half);
    gr.addColorStop(0, `rgba(${BONE},0)`); gr.addColorStop(.5, `rgba(${BONE},${alpha})`); gr.addColorStop(1, `rgba(${BONE},0)`);
    g.fillStyle = gr; g.fillRect(-W, -half, W * 2, half * 2);
    g.restore();
  }

  /* 光点沿边 A→B 走：e 是缓动后的位置，f 是线性进度，尾迹取 --accent，头取骨白 */
  function streak(A, B, e, f) {
    const hx = lerp(A[0], B[0], e), hy = lerp(A[1], B[1], e);
    const x1 = lerp(A[0], B[0], Math.max(0, e - .35)), y1 = lerp(A[1], B[1], Math.max(0, e - .35));
    const tail = g.createLinearGradient(x1, y1, hx, hy);
    tail.addColorStop(0, `rgba(${ACCENT},0)`); tail.addColorStop(1, `rgba(${ACCENT},.85)`);
    g.strokeStyle = tail; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = `rgba(${HI},${.9 * (1 - f * f)})`;
    g.beginPath(); g.arc(hx, hy, 1.7, 0, TAU); g.fill();
  }

  /* 星座：k = { p: 节点, e: 边, lab: 标签, born: 起画时刻, off?: 光点相位 }；pt(i) 给节点此刻的
     屏幕坐标。线按边逐条画出，节点随线到达点亮，画完写标签；光点每 3 秒换一条边，走 1.5 秒。 */
  function con(k, pt, t) {
    if (t < k.born) return;
    const p = reduce ? 1 : clamp((t - k.born) / 2800, 0, 1), q = ease(p), n = k.e.length;

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

    if (p < 1) return;
    const [x0, y0] = pt(0);
    g.font = FONT;
    g.fillStyle = `rgba(${BONE},.3)`;
    g.fillText(k.lab, x0 - 4, y0 + 22 + Math.max(...k.p.map(v => v[1] - k.p[0][1])));

    if (reduce) return;
    const tt = t + (k.off || 0);
    const ei = Math.floor(tt / 3000) % n, f = (tt % 3000) / 1500;
    if (f >= 1) return;
    const [a, b] = k.e[ei];
    streak(pt(a), pt(b), ease(f), f);
  }

  /* 流星：m = { x, y, vx, vy, t0, life, len }，dy 是把 m.y 换算到屏幕坐标要减去的量 */
  function meteor(m, t, dy = 0) {
    const age = (t - m.t0) / 1000, f = age / m.life, sp = Math.hypot(m.vx, m.vy);
    const hx = m.x + m.vx * age, hy = m.y + m.vy * age - dy, len = m.len * (1 - f * .5), al = .85 * (1 - f * f);
    const x1 = hx - m.vx / sp * len, y1 = hy - m.vy / sp * len;
    const trail = g.createLinearGradient(x1, y1, hx, hy);
    trail.addColorStop(0, `rgba(${BONE},0)`); trail.addColorStop(1, `rgba(${BONE},${al})`);
    g.strokeStyle = trail; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = `rgba(${HI},${al})`;
    g.beginPath(); g.arc(hx, hy, 1.5, 0, TAU); g.fill();
  }

  return { g, BONE, diamond, stars, haze, con, meteor };
}
