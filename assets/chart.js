/* 折线图。只有 power-delta 那一页用。

   从 assets/app.js 拆出来：它是页面专属的，而 app.js 每个带工具条的页面都要下。
   合起来 chart + rota + home 是 app.js 8.9 KB gzip 里的 6.9 KB，却只有三个页面
   跑得到，其余 31 页白下。拆开之后由 app.js 在认出该页的 data-* 时动态 import。

   共用件（tuck、onResize、slot）由 app.js 传进来，不在这里重抄一份。 */

export default function init(deps) {
  var tuck = deps.tuck, onResize = deps.onResize, slot = deps.slot;

  /* 折线图（.toolbar 带 data-chart 的页面）：**数据只有表里那一份**，图从表里现读，
     画完把表收起。无 JS 时表就是页面本体，与列组页的默认隐藏由 app.js 施加是同一条
     约定——产出里不写第二份数据。

     横轴恒为源稿给的全区间，不做缩放：201 个点在 1000 宽的坐标系里每点 4.6px，
     拐点看得清，多一套区间开关只是多一处状态。
     坐标系固定，SVG 用 width:100% + height:auto 等比缩放，所以屏幕横坐标与数据
     横坐标之间只差一个常数比例，指针换算不必读 viewBox。 */
  var W = 1000, H = 580, PAD = { l: 58, r: 24, t: 30, b: 52 };
  var STEP_X = [5, 10, 20, 25, 50], STEP_Y = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
  var OFF = { x: 26, y: 24, w: 66 };      // 标签相对锚点的偏移与估计宽度

  /* 刻度步长取「让刻度数落在 8 以内」的最小一档。档位写死成表，不做通用算法：
     两条轴的量纲这一页就定死了，通用算法要多写一倍代码去应付用不到的量级。 */
  function step(span, list) {
    for (var i = 0; i < list.length; i++) if (span / list[i] <= 8) return list[i];
    return list[list.length - 1];
  }

  function signed(x) { return x > 0 ? '+' + x : String(x); }

  function chart() {
    var table = document.querySelector('.gen');
    if (!table) return;
    var heads = [].slice.call(table.querySelectorAll('thead th'))
      .map(function (th) { return th.textContent.trim(); });
    var xs = [];
    var cols = heads.slice(1).map(function () { return []; });
    [].slice.call(table.querySelectorAll('tbody tr')).forEach(function (tr) {
      var cells = [].slice.call(tr.children).map(function (c) { return c.textContent.trim(); });
      xs.push(+cells[0]);
      cols.forEach(function (col, i) { col.push(cells[i + 1] === '' ? null : +cells[i + 1]); });
    });
    if (xs.length < 2) return;
    var lo = xs[0], hi = xs[xs.length - 1];

    /* data-marks="列名 值 值;列名 值 值"，由生成器从源稿的「标注：」写出，值与列名
       在生成时已核对过存在，这里只做换算。 */
    var marks = [];
    (table.dataset.marks || '').split(';').filter(Boolean).forEach(function (spec) {
      var parts = spec.trim().split(/\s+/);
      var si = heads.indexOf(parts[0]) - 1;
      parts.slice(1).forEach(function (v) { marks.push({ s: si, x: +v }); });
    });

    var top = 0;
    cols.forEach(function (col) {
      col.forEach(function (v) { if (v !== null) top = Math.max(top, v); });
    });
    var sy = step(top, STEP_Y);
    var ymax = Math.ceil(top / sy) * sy || sy;
    var sx = step(hi - lo, STEP_X);

    function px(x) { return PAD.l + (x - lo) / (hi - lo) * (W - PAD.l - PAD.r); }
    function py(v) { return H - PAD.b - v / ymax * (H - PAD.t - PAD.b); }

    /* 基准十字：竖线钉在横轴 0，横线钉在首列在横轴 0 处的取值。这一页的源稿按光等差 0
       归一，那一格就是 1.000——**不写死 1，从数据里取**，换一张同样跨 0 的表照样成立；
       不跨 0 就没有基准，两条线都不画。
       这两条是读这张图的原点：横线之下即亏、之上即赚，竖线左右分开欠光与压光。 */
    var z = xs.indexOf(0);
    var ref = cols.length && lo < 0 && hi > 0 && z >= 0 ? cols[0][z] : null;

    /* 标注：数字不压在线上，偏到一侧再用一根细引线牵回落点。方向按序列固定——
       标准（首列曲线）从右下牵，其余从左上牵——两条曲线在同一个 x 上的标签因此
       各据一侧，不必做碰撞检测。

       **贴边时整体翻到另一侧。**方向翻转同时作用于横纵两个偏移，所以左右出界与
       上下出界用同一次翻转就够：x=-100 处倍率为 0，落点贴着横轴，右下放不下，翻到
       左上正好落进画布。 */
    function fits(X, Y, s) {
      var ax = X + OFF.x * s, ay = Y + OFF.y * s;
      return ay > PAD.t + 6 && ay < H - PAD.b - 6 &&
        (s > 0 ? ax + OFF.w < W : ax - OFF.w > 0);
    }

    function callout(x, si) {
      var v = off[si] ? null : cols[si][xs.indexOf(x)];
      if (v === null || v === undefined) return '';
      var X = px(x), Y = py(v);
      var s = si % 2 === 0 ? 1 : -1;
      if (!fits(X, Y, s)) s = -s;
      var ax = X + OFF.x * s, ay = Y + OFF.y * s;
      var dx = X - ax, dy = Y - ay, len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len;
      /* 引线从标签边上起、停在圆点外沿前 6px：**不画箭头。**落点已经有一个带底色环
         的圆点，箭头是第二次指同一个地方，七处标注就是七个三角形在抢注意力。 */
      var x1 = ax + ux * 10, y1 = ay + uy * 10, x2 = X - ux * 6, y2 = Y - uy * 6;
      return '<line class="lead" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
        '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>' +
        '<circle class="dot s' + si + '" cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="3.5"/>' +
        '<text class="tag s' + si + '" x="' + ax.toFixed(1) + '" y="' + ay.toFixed(1) +
        '" text-anchor="' + (s > 0 ? 'start' : 'end') + '"><tspan class="k">' +
        signed(x) + '</tspan> ' + v.toFixed(3) + '</text>';
    }

    function group(x) {
      return '<line class="cursor" x1="' + px(x).toFixed(1) + '" x2="' + px(x).toFixed(1) +
        '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>' +
        cols.map(function (col, si) { return callout(x, si); }).join('');
    }

    var fig = document.createElement('figure');
    fig.className = 'chart';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', heads[0] + '与' + heads.slice(1).join('、') + '的关系曲线');
    fig.appendChild(svg);

    /* 图例兼开关：线名取自表头，同样不在 HTML 里另写一份文本。
       两条曲线在 -49 以下几乎贴在一起，关掉一条才看得清另一条的走向。 */
    var legend = document.createElement('figcaption');
    legend.className = 'chart-legend';
    /* data-lines="列名、列名" 由生成器从源稿的「默认曲线：」写出：加载时只画这几条，
       其余关着等图例打开。不写这一行就全画。**默认隐藏由这里施加，不写进 HTML**——
       无 JS 时表里所有列照常可读，与列组页同一条约定。 */
    var on = (table.dataset.lines || '').split('、').filter(Boolean);
    var off = [];
    heads.slice(1).forEach(function (name, si) {
      off[si] = on.length > 0 && on.indexOf(name) < 0;
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 's' + si;
      item.textContent = name;
      item.setAttribute('aria-pressed', !off[si]);
      item.addEventListener('click', function () {
        off[si] = !off[si];
        item.setAttribute('aria-pressed', !off[si]);
        frame();
      });
      legend.appendChild(item);
    });
    fig.appendChild(legend);
    table.parentNode.insertBefore(fig, table);
    tuck(table);

    var showMarks = true, pins = [], hov = null;

    function tick(v) { return sy < 0.1 ? v.toFixed(3) : v.toFixed(1); }

    function frame() {
      var o = [];
      /* 横向网格照旧铺满，两处例外：v=0 那条是图的地板，提到 .axis；与基准重合的
         那条整条跳过（含刻度文字），改由基准线自己带一份，否则同一处画两遍。
         浮点累加要留余量——0.2 加五次得到 1.0000000000000002。 */
      for (var v = 0; v <= ymax + 1e-9; v += sy) {
        if (ref !== null && Math.abs(v - ref) < sy / 1000) continue;
        o.push('<line class="' + (v === 0 ? 'axis' : 'grid') + '" x1="' + PAD.l +
          '" x2="' + (W - PAD.r) + '" y1="' + py(v).toFixed(1) + '" y2="' + py(v).toFixed(1) + '"/>');
        o.push('<text class="tick ty" x="' + (PAD.l - 10) + '" y="' + (py(v) + 4).toFixed(1) +
          '">' + tick(v) + '</text>');
      }
      /* 竖刻度从 0 两侧对称铺开：0 是这张图的基准，让它必然落在一条刻度上。
         **不画整条竖网格线**——201 个点定位靠指针的竖线，满屏竖线只跟曲线抢，
         横轴下方一个 6px 的爪就够指位置；x=0 那条由基准线接管。 */
      for (var k = Math.ceil(lo / sx) * sx; k <= hi; k += sx) {
        o.push('<line class="axis" y1="' + (H - PAD.b) + '" y2="' + (H - PAD.b + 6) +
          '" x1="' + px(k).toFixed(1) + '" x2="' + px(k).toFixed(1) + '"/>');
        o.push('<text class="tick' + (k === 0 ? ' base' : '') + '" x="' + px(k).toFixed(1) +
          '" y="' + (H - PAD.b + 20) + '">' + signed(k) + '</text>');
      }
      if (ref !== null) {
        o.push('<line class="base" x1="' + PAD.l + '" x2="' + (W - PAD.r) +
          '" y1="' + py(ref).toFixed(1) + '" y2="' + py(ref).toFixed(1) + '"/>');
        o.push('<line class="base" y1="' + PAD.t + '" y2="' + (H - PAD.b) +
          '" x1="' + px(0).toFixed(1) + '" x2="' + px(0).toFixed(1) + '"/>');
        o.push('<text class="tick ty base" x="' + (PAD.l - 10) + '" y="' + (py(ref) + 4).toFixed(1) +
          '">' + tick(ref) + '</text>');
      }
      cols.forEach(function (col, si) {
        if (off[si]) return;
        var d = '', pen = false;
        xs.forEach(function (x, i) {
          if (col[i] === null) { pen = false; return; }
          d += (pen ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(col[i]).toFixed(1) + ' ';
          pen = true;
        });
        if (d) o.push('<path class="line s' + si + '" d="' + d.trim() + '"/>');
      });
      /* 横轴叫什么只有表头知道，表一收起图上就没有了。与图例取 heads 是同一条路子：
         文本从表里现读，HTML 里仍然只有一份数据。
         **居中另起一行，不贴右端。**贴右端时它正落在末尾那个刻度下方，会被读成那一个
         刻度的注脚；居中并与刻度行拉开 26px，才读得出是整条轴的名字。 */
      o.push('<text class="cap" x="' + ((PAD.l + W - PAD.r) / 2).toFixed(1) +
        '" y="' + (H - 6) + '">' + heads[0] + '</text>');
      if (showMarks) o.push(marks.map(function (m) { return callout(m.x, m.s); }).join(''));
      o.push(pins.map(group).join(''));
      o.push('<g class="hover"></g>');
      svg.innerHTML = o.join('');
      hov = svg.querySelector('.hover');
    }

    /* **rect 缓存住。**上一个 pointermove 刚写过 hov.innerHTML，紧接着读 rect 就是
       强制同步布局，120Hz 指针下每秒上百次。指针给的是视口坐标，所以横向滚动与改版面
       都会让缓存过期——两处都置空重取，置空本身不读布局。 */
    var box = null;
    function drop() { box = null; }
    onResize(drop);
    addEventListener('scroll', drop, { passive: true });

    function pick(e) {
      var r = box || (box = svg.getBoundingClientRect());
      var x = lo + ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * (hi - lo);
      return Math.min(hi, Math.max(lo, Math.round(x)));
    }

    /* 指针事件比帧密，一帧画一次就够；只留最后一个位置，中间的丢掉。
       `spot` 为 null 表示指针已经离开，这一帧不必补画。 */
    var spot = null, queued = false;
    svg.addEventListener('pointermove', function (e) {
      spot = pick(e);
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (spot === null) return;
        hov.innerHTML = pins.indexOf(spot) < 0 ? group(spot) : '';
      });
    });
    svg.addEventListener('pointerleave', function () { spot = null; hov.innerHTML = ''; });
    /* 点一下把这一处读数留在图上，可以留任意多处；点已经留下的那一处即撤掉它 */
    svg.addEventListener('click', function (e) {
      var x = pick(e), at = pins.indexOf(x);
      if (at < 0) pins.push(x); else pins.splice(at, 1);
      frame();
    });

    var nav = document.createElement('nav');
    nav.className = 'tool-chips';
    nav.setAttribute('aria-label', '图表');
    var tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'chip';
    tag.textContent = '标注';
    tag.addEventListener('click', function () {
      showMarks = !showMarks;
      tag.setAttribute('aria-pressed', showMarks);
      frame();
    });
    if (marks.length) {
      tag.setAttribute('aria-pressed', 'true');
      nav.appendChild(tag);
      slot.appendChild(nav);
    }
    frame();
  }


  return chart();
}
