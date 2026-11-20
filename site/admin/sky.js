/* 编辑台登录页背景星图：复用 assets/sky-core.js，与主站共用同一套星等与星座语言。
   已登录（.signed）时不分配画布也不起动画；登录成功隐藏 #gate 后立即停帧。 */

import { reduce, TAU, rng, brush } from '../assets/sky-core.js';

const gate = document.getElementById('gate');
const canvas = gate && gate.querySelector('.gate-sky');

if (gate && canvas) {
  const b = brush(canvas);
  const g = b.g;
  const T0 = performance.now();
  let W = 0;
  let H = 0;
  let stars = [];
  let cons = [];
  let ox = 0;
  let oy = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let built = false;

  const visible = () => !gate.hidden && !document.documentElement.classList.contains('signed');

  function build() {
    const R = rng(20261120);
    const d = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * d);
    canvas.height = Math.round(H * d);
    g.setTransform(d, 0, 0, d, 0, 0);

    stars = [];
    const n = Math.round(W * H / 4600);
    for (let i = 0; i < n; i++) {
      const u = R();
      const z = u < .5 ? .15 : u < .78 ? .35 : u < .94 ? .65 : 1;
      const big = z >= .65 && R() < .35;
      const band = R() < .38;
      let x = R() * W;
      let y = R() * H;
      if (band) y = (.76 + (.14 - .76) * (x / W)) * H + (R() + R() + R() - 1.5) * 145;
      stars.push({
        x,
        y,
        z,
        band,
        r: (.32 + R() * .48) * (.7 + z * .85),
        a: .22 + R() * .52,
        ph: R() * TAU,
        sp: .5 + R() * 1.4,
        glyph: big ? (R() < .55 ? 'spike' : 'ring') : R() < .03 ? 'plus' : 'dot',
      });
    }

    cons = [
      {
        p: [[W * .12, H * .24], [W * .18, H * .17], [W * .25, H * .26], [W * .21, H * .39], [W * .14, H * .46]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 3]],
        lab: 'RA 05h 14m · DEC +21°',
        born: reduce ? -1e9 : T0 + 200,
        off: 0,
      },
      {
        p: [[W * .76, H * .22], [W * .83, H * .16], [W * .88, H * .28], [W * .82, H * .38], [W * .89, H * .48]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4]],
        lab: 'RA 18h 36m · DEC +38°',
        born: reduce ? -1e9 : T0 + 700,
        off: 1100,
      },
      {
        p: [[W * .16, H * .76], [W * .23, H * .82], [W * .30, H * .75]],
        e: [[0, 1], [1, 2]],
        lab: 'RA 02h 07m · DEC −11°',
        born: reduce ? -1e9 : T0 + 1100,
        off: 2200,
      },
    ];
    built = true;
  }

  function frame(t) {
    ox += (tx - ox) * .06;
    oy += (ty - oy) * .06;
    g.clearRect(0, 0, W, H);
    b.haze(W / 2 - ox * 8, H * .45 - oy * 5, Math.atan2(-.62 * H, W), 190, .048, W);
    b.stars(stars, t, ox, s => s.y - oy * s.z * 16, H);
    for (const k of cons) b.con(k, i => [k.p[i][0] - ox * 10, k.p[i][1] - oy * 8], t);
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function tick(t) {
    if (!visible() || document.hidden) {
      raf = 0;
      return;
    }
    frame(t);
    raf = requestAnimationFrame(tick);
  }

  function sync() {
    if (!visible() || document.hidden) {
      stop();
      return;
    }
    if (!built) build();
    if (!built) return;
    if (reduce) {
      frame(performance.now());
    } else if (!raf) {
      raf = requestAnimationFrame(tick);
    }
  }

  if (!reduce) {
    addEventListener('pointermove', e => {
      if (!W || !H) return;
      tx = e.clientX / W - .5;
      ty = e.clientY / H - .5;
    }, { passive: true });
  }

  let rid = 0;
  addEventListener('resize', () => {
    clearTimeout(rid);
    rid = setTimeout(() => {
      if (!visible()) {
        built = false;
        return;
      }
      build();
      if (reduce && built) frame(performance.now());
    }, 120);
  });

  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  sync();
}
