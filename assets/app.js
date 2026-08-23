/* 工具条构建、搜索过滤、当前分节高亮。零依赖。

   工具条从 DOM 读取神器名，不在 HTML 里重复任何源文本，否则生成器
   tools/convert-artifact-mods.py 的保真自检会报重复。
   无 JS 时工具条为空容器（.toolbar:empty 收起），正文与档位轨完整可读。 */
(function () {
  'use strict';

  /* 匹配判定：空格分词后全部命中（AND）。纯函数，可单独验证。 */
  function matches(text, query) {
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    var hay = text.toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }
  window.starsideMatches = matches;

  var head = document.querySelector('.site-head');
  var slot = document.querySelector('.toolbar');
  /* 选择器由页面在 .toolbar 上用 data-* 声明，缺省是神器模组页的一套。
     data-row 可以不给：护甲套装页没有并排的行，条目本身就是一行。 */
  var cfg = (slot && slot.dataset) || {};
  var SEC = cfg.section || '.artifact';
  /* 只给 data-section、不给 data-item 的页面走「只有跳转 chip」这一档：
     资料页的条目是表格行，行之间有 rowspan 合并，按行隐藏会把合并块豁开。
     那里要的是快速跳转，不是检索。 */
  var ITEM = cfg.item || (cfg.section ? '' : '.mod');
  var ROW = cfg.row || (cfg.section ? '' : '.mod-row');
  var LABEL = cfg.label || '.art-head h2';
  var NOUN = cfg.noun || '模组';
  var sections = Array.prototype.slice.call(document.querySelectorAll(SEC));
  var stick = 0;

  /* 分节 sticky 单元贴 .site-head 下沿，偏移量按实测高度写回 CSS 变量 */
  function measure() {
    if (!head) return;
    stick = head.offsetHeight;
    document.documentElement.style.setProperty('--stick', stick + 'px');
  }

  /* 列组模式：表头的 data-g 声明每列属于哪一组，工具条按组给开关。
     列多到一屏放不下的表用它，读者自己拼视图。首列所在的那组是身份列
     （行标题与它的近邻），不给开关、任何时候都在。

     隐藏走一张内建样式表按列序下规则，不给每个格子挂属性——94 行 43 列
     挂一遍要给 HTML 多出十万字节。合并行没有 <th>，序号整体前移一位，
     所以同一列要下两条规则。 */
  function columns() {
    var heads = [].slice.call(document.querySelectorAll('.gen thead th'));
    var fixed = heads[0].dataset.g;
    var names = [];
    heads.forEach(function (th) {
      if (th.dataset.g !== fixed && names.indexOf(th.dataset.g) < 0) names.push(th.dataset.g);
    });

    var on = {};
    (slot.dataset.cols || '').split('、').forEach(function (n) { if (n) on[n] = true; });
    /* 互斥的几组一次只开一组：几十列同屏会把行撑得过长，扫读时对不上行 */
    var solo = (slot.dataset.solo || '').split('、').filter(Boolean);

    var sheet = document.createElement('style');
    document.head.appendChild(sheet);

    function apply() {
      var sel = [];
      heads.forEach(function (th, i) {
        if (th.dataset.g === fixed || on[th.dataset.g]) return;
        sel.push('.gen thead th:nth-child(' + (i + 1) + ')');
        sel.push('.gen tbody tr:has(> th) > :nth-child(' + (i + 1) + ')');
        sel.push('.gen tbody tr:not(:has(> th)) > :nth-child(' + i + ')');
      });
      sheet.textContent = sel.length ? sel.join(',') + '{display:none}' : '';
    }

    var nav = document.createElement('nav');
    nav.className = 'tool-chips';
    nav.setAttribute('aria-label', '列组');
    var chips = {};
    names.forEach(function (name) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = name;
      chips[name] = chip;
      chip.addEventListener('click', function () {
        on[name] = !on[name];
        if (on[name] && solo.indexOf(name) >= 0) {
          solo.forEach(function (other) { if (other !== name) on[other] = false; });
        }
        press();
        apply();
      });
      nav.appendChild(chip);
    });

    function press() {
      names.forEach(function (name) {
        chips[name].setAttribute('aria-pressed', on[name] ? 'true' : 'false');
      });
    }

    slot.appendChild(nav);
    press();
    apply();
  }

  /* 当前时刻高亮（.toolbar 带 data-clock 的页面）：表里哪一行哪一列是「现在」只有
     运行时才知道，不能写进产出，所以由这里按本机时钟打属性，颜色归页面样式表。

     打两个属性，不是一个：整行 data-now-row 落在 <tr> 上，整列 data-now-col 落在
     每个格子上。两条高亮各答一个问题——「今天一天怎么转」看列，「这个钟点各天在
     哪」看行——交点同时属于两者。**行的那层必须落在 <tr>、列的那层落在格子**：
     同落在格子上时两条规则争同一个背景，只有一条生效；分两层则格子压在行上，
     交点是真的叠加。

     行按首格开头的两位时刻找、列按表头的星期文本找，**不按序号**——序号会在源稿
     调整行列顺序时静默指错格子。取前两位而不是整格相等：首列写的是时段区间
     （00:00-01:00），起始时刻就在开头那两位。对不上就报出来，不静默留空。
     整点重排一次：页面开着跨过整点，高亮跟着走；跨过午夜时列也跟着换。 */
  var WEEKDAYS = ['周天', '周一', '周二', '周三', '周四', '周五', '周六'];

  function nowCell() {
    /* 这一页还有一张轮换轴的表（data-rota），时钟高亮不认它——不排除的话表头与
       行会被两张表的格子混在一起，找到的列压根不在这张表上。 */
    var table = document.querySelector('.gen:not([data-rota])');
    if (!table) return;
    var heads = [].slice.call(table.querySelectorAll('thead th'));
    var rows = [].slice.call(table.querySelectorAll('tbody tr'));
    var lit = [];

    function paint() {
      lit.forEach(function (el) {
        el.removeAttribute('data-now-row');
        el.removeAttribute('data-now-col');
      });
      lit = [];
      var d = new Date();
      var want = WEEKDAYS[d.getDay()];
      var hh = ('0' + d.getHours()).slice(-2);
      var col = heads.findIndex(function (th) { return th.textContent.trim() === want; });
      var row = rows.find(function (tr) {
        return tr.firstElementChild.textContent.trim().slice(0, 2) === hh;
      });
      if (col < 0 || !row) {
        console.warn('当前时刻高亮：表里找不到 ' + want + ' ' + hh + ' 时那一行一列');
        return;
      }
      row.setAttribute('data-now-row', '');
      lit.push(row);
      /* 表头与该列每一格：合并行会让序号前移，这一页没有合并，直接按序号取 */
      [heads[col]].concat(rows.map(function (tr) { return tr.children[col]; }))
        .forEach(function (el) { el.setAttribute('data-now-col', ''); lit.push(el); });
      /* 多给 1 秒，免得在整点前几毫秒醒来、算出同一格又排一次零延时 */
      setTimeout(paint, 3600000 - (d.getMinutes() * 60 + d.getSeconds()) * 1000 + 1000);
    }
    paint();
  }

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
    table.hidden = true;

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

    function pick(e) {
      var r = svg.getBoundingClientRect();
      var x = lo + ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * (hi - lo);
      return Math.min(hi, Math.max(lo, Math.round(x)));
    }

    svg.addEventListener('pointermove', function (e) {
      var x = pick(e);
      hov.innerHTML = pins.indexOf(x) < 0 ? group(x) : '';
    });
    svg.addEventListener('pointerleave', function () { hov.innerHTML = ''; });
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

  /* 周常轮换轴（.gen 带 data-rota 的表）：**顺序只有表里那一份**，轮盘从表里现读，
     画完把表收起，与折线图同一条约定——无 JS 时表就是页面本体。

     滚轮与拖拽都不接，只认点击：这一段嵌在一页可滚动的长文里，接了滚轮就会在读者
     往下滚页面时把轮盘转走，页面反而不动。五张卡片点哪张，哪张就转到中间。

     **位置是连续量，不是三档。**每帧把当前位置往目标位置收一段（指数逼近），卡片
     按分数距离摆——转起来是一根滚轴匀速滚过去，中途的虚化、明暗、缩放都在插值。
     按整步跳、靠 CSS transition 补间那一版会在跨两周时露出「两段各自缓动」的接缝，
     新进场的卡片也只能凭空出现。 */
  var MS_WEEK = 604800000;
  /* 圆柱：每张之间 27°，半径 330px。相邻两张的纵向间距是 sin27°×330 ≈ 150px，
     压过卡片自身的高度（140px），卡片因此不叠在一起。 */
  var STEP = 27, R = 330, WIN = 3;
  /* 一次转动的时长：起步 300ms，每多跨一周加 90ms，最长 520ms。指数逼近那种写法
     （每帧往目标收 16%）尾巴上会拖出一秒多的亚像素爬行，读起来像没停稳。 */
  var SPIN = { base: 300, per: 90, max: 520 };

  function rota(table) {
    var raids = [], dungeons = [];
    [].slice.call(table.querySelectorAll('tbody tr')).forEach(function (tr) {
      var c = [].slice.call(tr.children).map(function (x) { return x.textContent.trim(); });
      if (c[1]) raids.push(c[1]);
      if (c[2]) dungeons.push(c[2]);
    });
    if (!raids.length || !dungeons.length) return;
    /* 两组的名目取自表头（突袭／地牢）：页面上的源文本只有表里那一份，不在这里重写 */
    var kinds = [].slice.call(table.querySelectorAll('thead th')).slice(1)
      .map(function (th) { return th.textContent.trim(); });

    /* 起始日可带时刻（YYYY.M.D H:MM）：周界就是游戏的每周重置，落在周三 01:00，
       只按日算会让重置前那一小时提前跳到下一周。 */
    var spec = table.dataset.rota.split(' ');
    var d0 = spec[0].split('.').map(Number);
    var hm = (spec[1] || '0:00').split(':').map(Number);
    var t0 = new Date(d0[0], d0[1] - 1, d0[2], hm[0], hm[1]).getTime();
    var here = Math.floor((Date.now() - t0) / MS_WEEK);
    var cur = here, from = here, aim = here, t1 = 0, span = 0, running = false;

    var box = document.createElement('div');
    box.className = 'rota';
    box.innerHTML = '<div class="rota-stage"></div>'
      + '<div class="rota-btns">'
      + '<button type="button" class="chip" data-go="-1">上一周</button>'
      + '<button type="button" class="chip" data-go="0">本周</button>'
      + '<button type="button" class="chip" data-go="1">下一周</button></div>';
    table.parentNode.insertBefore(box, table);
    table.hidden = true;

    var stage = box.querySelector('.rota-stage');
    var pool = {};

    function group(kind, label, names) {
      return '<div class="rota-group" data-kind="' + kind + '">'
        + '<span class="rota-kind">' + label + '</span>'
        + names.map(function (n) { return '<span class="rota-pill">' + n + '</span>'; }).join('')
        + '</div>';
    }

    function card(i) {
      if (pool[i]) return pool[i];
      var s = new Date(t0 + i * MS_WEEK), e = new Date(t0 + i * MS_WEEK + 6 * 86400000);
      var r = ((i % raids.length) + raids.length) % raids.length;
      var g = ((i % dungeons.length) + dungeons.length) % dungeons.length;
      /* 右端那一格答的是「这张卡相对现在是什么」：本周那张写「本周」，其余写距今
         几周。年份不写——日期区间已经给了月日，隔着几周比哪一年更是读者要的那个数。 */
      var off = i - here;
      var mark = off === 0 ? '本周' : Math.abs(off) + ' 周' + (off > 0 ? '后' : '前');
      var el = document.createElement('div');
      el.className = 'rota-card' + (i === here ? ' is-now' : '');
      el.innerHTML = '<div class="rota-top"><span class="rota-date">'
        + (s.getMonth() + 1) + '月' + s.getDate() + '日 — '
        + (e.getMonth() + 1) + '月' + e.getDate() + '日</span>'
        + '<span class="rota-badge">' + mark + '</span></div>'
        + '<div class="rota-body">'
        + group('raid', kinds[0], [raids[r], raids[(r + 4) % raids.length]])
        + group('dungeon', kinds[1], [dungeons[g], dungeons[(g + 4) % dungeons.length]])
        + '</div>';
      stage.appendChild(el);
      pool[i] = el;
      return el;
    }

    /* d 是到中间的分数距离。虚化与明暗都写成 d 的连续函数：中间那张清晰，一步之内
       只虚到名字仍读得出，再往外快速虚掉、淡出，滚动途中不出现档与档之间的跳变。 */
    function place(el, d) {
      var a = Math.abs(d);
      el.hidden = a > 2.7;
      if (el.hidden) return;
      var rad = d * STEP * Math.PI / 180;
      el.style.transform = 'translate3d(0,' + (Math.sin(rad) * R).toFixed(1) + 'px,'
        + ((Math.cos(rad) - 1) * R).toFixed(1) + 'px) rotateX(' + (-d * STEP).toFixed(2) + 'deg)';
      var blur = a < 0.25 ? 0 : (a < 1 ? (a - 0.25) : 0.75 + (a - 1) * 2.6);
      el.style.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      el.style.opacity = (a <= 1 ? 1 - a * 0.3 : Math.max(0, 0.7 - (a - 1) * 0.42)).toFixed(3);
      el.style.zIndex = 10 - Math.round(a);
      el.classList.toggle('is-mid', a < 0.5);
    }

    function draw() {
      var c = Math.round(cur);
      for (var k = c - WIN; k <= c + WIN; k++) place(card(k), k - cur);
      Object.keys(pool).forEach(function (k) {
        if (Math.abs(k - c) > WIN) { pool[k].remove(); delete pool[k]; }
      });
    }

    /* 定时长 + 三次缓出：起步快、收尾稳，走完就停。转动中再点一张，从当前位置
       重新起算，不排队也不叠加。 */
    function frame(now) {
      var p = Math.min(1, (now - t1) / span);
      cur = from + (aim - from) * (1 - Math.pow(1 - p, 3));
      draw();
      running = p < 1;
      if (running) requestAnimationFrame(frame);
    }

    function go(i) {
      if (i === aim) return;
      from = cur;
      aim = i;
      t1 = performance.now();
      span = Math.min(SPIN.max, SPIN.base + SPIN.per * Math.abs(aim - from));
      if (!running) { running = true; requestAnimationFrame(frame); }
    }

    /* 命中测试走投影矩形，不靠浏览器的事件派发：preserve-3d 容器里带 filter 的
       子元素，Chrome 会按未变换的平面判命中，除中间那张外全部落到 .rota-stage 上。
       getBoundingClientRect() 给的是变换后的投影框，按它认反而准。
       几张在投影上重叠时取离中间最近的那张——上面那张压着下面那张的边。 */
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-go]');
      if (btn) { go(btn.dataset.go === '0' ? here : Math.round(aim) + +btn.dataset.go); return; }
      var best = null, near = Infinity;
      Object.keys(pool).forEach(function (k) {
        var el = pool[k];
        if (el.hidden) return;
        var r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right
          || e.clientY < r.top || e.clientY > r.bottom) return;
        var d = Math.abs(+k - aim);
        if (d < near) { near = d; best = +k; }
      });
      if (best !== null) go(best);
    });
    draw();
  }

  /* 首页的全站搜索（.hero-search 容器存在即接管）：资料页的搜索框只搜本页，
     这里搜全站。索引 assets/search.js 由 tools/build-search.py 从各页产出现扫，
     一条记录一行——带 d 的是页面，带 n 的是条目。

     **首次聚焦才下载**：它 790 KB，进首屏就把首页拖成全站最重的一页。
     **用 <script> 取而不是 fetch**：双击打开的站点也要能搜，而 file:// 下 fetch
     取同目录的文件会被 CORS 挡掉。索引因此是一句 window.starsideIndex = […]。
     命中项的链接带 ?q=，落到那一页之后由那一页自己的搜索框接手过滤，
     所以这里不必知道条目在页面里的哪一行。 */
  /* 摘要从命中处截取：整条正文最长有几百字，从头截会把命中的那半句切在外面。
     取够宽屏一行的量，末尾由 CSS 的 ellipsis 收口。 */
  var SNIP = 140;
  /* 一行看得见多少字：1440 宽下摘要列约 660px，12.5px 的汉字合 53 个，留一档余量。
     命中词必须落在这一截里，否则加亮的那个词被 ellipsis 吃掉，等于没标。 */
  var FIT = 48;
  /* 先给这么多条，其余压在一枚「展开」后面。搜「伤害」能命中近千条，一次铺开
     只是把首页拉成一条几万像素的长卷；真要全看的时候点一下就有。 */
  var CAP = 40;

  function snip(text, terms) {
    var low = text.toLowerCase(), at = -1;
    terms.forEach(function (t) {
      var i = low.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    });
    /* 三条一起定起点：从命中处往前 16 字起（命中的那半句要完整）；尾部不够长时
       整体前挪把这一行填满（不挪的话右边空掉一大片，而前面本来有话可读）；
       前挪不过 FIT，命中词不能被挪出可视的那一截。 */
    var from = Math.max(0, at - FIT, Math.min(at - 16, text.length - SNIP));
    return (from > 0 ? '…' : '') + text.slice(from, from + SNIP)
      + (from + SNIP < text.length ? '…' : '');
  }

  /* 命中词加亮：文本节点与 <mark> 交替 append，**不拼 innerHTML**——索引里的正文
     带 < 与 & 这类字符，拼字符串就得自己再转义一遍。 */
  function light(box, text, terms) {
    var low = text.toLowerCase(), at = 0;
    for (;;) {
      var best = -1, len = 0;
      terms.forEach(function (t) {
        var i = low.indexOf(t, at);
        /* 同一处起头时取长的那个词，短词否则会把长词切成两半 */
        if (i >= 0 && (best < 0 || i < best || (i === best && t.length > len))) {
          best = i;
          len = t.length;
        }
      });
      if (best < 0) break;
      if (best > at) box.appendChild(document.createTextNode(text.slice(at, best)));
      var m = document.createElement('mark');
      m.textContent = text.slice(best, best + len);
      box.appendChild(m);
      at = best + len;
    }
    if (at < text.length) box.appendChild(document.createTextNode(text.slice(at)));
  }

  function home(box) {
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'tool-search';
    input.placeholder = '搜索全站资料';
    input.setAttribute('aria-label', '搜索全站资料');

    var count = document.createElement('p');
    count.className = 'tool-count';
    count.setAttribute('role', 'status');

    var list = document.createElement('ul');
    list.className = 'hits';

    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'chip hits-more';
    more.hidden = true;

    box.appendChild(input);
    box.appendChild(count);
    box.appendChild(list);
    box.appendChild(more);

    var index = null, pending = false, pages = {};

    function load() {
      if (index || pending) return;
      pending = true;
      var tag = document.createElement('script');
      tag.src = 'assets/search.js';
      tag.onload = function () {
        index = window.starsideIndex;
        index.forEach(function (r) { if (r.d) pages[r.u] = r; });
        draw();
      };
      /* 索引取不到就说出来。留一个搜不出东西的空框，读者会以为站里根本没有这条。 */
      tag.onerror = function () {
        pending = false;
        count.textContent = '索引载入失败，刷新重试';
        console.error('取不到 assets/search.js');
      };
      document.head.appendChild(tag);
    }

    /* 一条命中一行：名称、来处、摘要三段。命中的词在名称与摘要里都加亮，
       扫读时不必自己在一段话里找那个词。 */
    function row(r, q, terms) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'hit';
      /* 条目带上 ?q= 与分节锚点；页面本身直接进去，不必预填 */
      a.href = r.n ? r.u + '?q=' + encodeURIComponent(q) + '#' + r.a : r.u;

      var name = document.createElement('b');
      light(name, r.n || r.t, terms);

      var at = document.createElement('span');
      at.className = 'hit-at';
      at.textContent = r.n ? (pages[r.u] ? pages[r.u].t : r.u) + ' · ' + r.l : '整页';

      var body = document.createElement('span');
      body.className = 'hit-x';
      light(body, r.n ? snip(r.x, terms) : r.d, terms);

      a.appendChild(name);
      a.appendChild(at);
      a.appendChild(body);
      li.appendChild(a);
      return li;
    }

    /* 一次 append 一个 fragment，浏览器只排一次版；逐条 append 会让几百条各
       触发一次布局。 */
    function show(rows, q, terms) {
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) { frag.appendChild(row(r, q, terms)); });
      list.appendChild(frag);
    }

    var queued = { rows: [], q: '', terms: [] };

    more.addEventListener('click', function () {
      show(queued.rows, queued.q, queued.terms);
      queued.rows = [];
      more.hidden = true;
    });

    /* 三档排序：页面、条目名命中、正文命中。名字命中的排在正文命中前面——
       搜「棱镜」时那一页本身与叫这个名字的条目，比正文里顺带提到的有用。 */
    function draw() {
      var q = input.value.trim();
      var had = list.childElementCount;
      list.textContent = '';
      more.hidden = true;
      box.toggleAttribute('data-miss', false);
      if (!q) { count.textContent = ''; return; }
      if (!index) { count.textContent = '正在载入索引…'; return; }

      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      var top = [], named = [], rest = [];
      index.forEach(function (r) {
        if (!r.n) { if (matches(r.t + ' ' + r.d, q)) top.push(r); }
        else if (matches(r.n, q)) named.push(r);
        else if (matches(r.x, q)) rest.push(r);
      });
      var all = top.concat(named, rest);
      show(all.slice(0, CAP), q, terms);
      queued = { rows: all.slice(CAP), q: q, terms: terms };
      more.hidden = !queued.rows.length;
      more.textContent = '展开其余 ' + queued.rows.length + ' 条';
      count.textContent = all.length ? all.length + ' 条命中' : '没有命中';
      box.toggleAttribute('data-miss', !all.length);
      /* 淡入只在结果从无到有时放一次：每敲一个字重放一遍会闪。 */
      list.classList.toggle('is-in', !had && !!all.length);
    }

    input.addEventListener('focus', load);
    input.addEventListener('input', function () { load(); draw(); });
  }

  if (slot && slot.dataset.clock !== undefined) nowCell();

  if (slot && slot.dataset.rota !== undefined) {
    var rt = document.querySelector('.gen[data-rota]');
    if (rt) rota(rt);
  }

  if (slot && slot.dataset.chart !== undefined) {
    chart();
    measure();
    addEventListener('resize', measure);
    return;
  }

  if (slot && slot.dataset.cols !== undefined) {
    columns();
    measure();
    addEventListener('resize', measure);
    return;
  }

  /* 首屏那枚标记：四个状态轮着换类，位置与角度的插值全在 CSS 里
     （site.css「首屏那枚标记」一节）。这里只负责按节拍换类。

     **减弱动效时整个不换，停在术士态。**过渡关掉之后换类只剩瞬切，一枚图案
     跳成另一枚既不是动画也读不出零件怎么走的，不如干脆静止。

     四段各一对「位移 ms、保持 ms」，顺序是术士→泰坦、泰坦→猎人、猎人→收拢、
     收拢→术士。位移那一半同时写在 site.css 的 --morph 上（过渡时长取的是要去
     那一态的值），两处是同一张表；改节拍两处一起改。

     **值不照抄原动画的 2340/820、2340/690、1100/2750、550/550。**原片是一秒钟
     一闪而过的开场，三个图案各停 0.6–0.8s、收拢与重新长出来各只用 1.1s 与 0.55s；
     站上这枚长期挂在首屏、要被反复看，那个节拍下图案还没认清就换掉了，后两段的
     急停急起也读作卡顿。三个图案的保持一律给到 1.3s，四段位移拉平到
     2200/2200/1800/1800，收拢态停 2s——它没有图案，长一点是这一轮的换气。 */
  var MARK_STEP = [[2200, 1300], [2200, 1300], [1800, 2000], [1800, 1300]];

  /* **名字不能叫 mark**：这个 IIFE 里已经有一个 function mark()（当前分节高亮）。
     var 提升到同一个函数作用域，资料页上这一行把它赋成 null，当前分节高亮的
     观察者一触发就报 mark is not a function，整站的 chip 因此不再跟着滚动亮起。 */
  var heroMark = document.querySelector('.hero-mark');
  if (heroMark) cycle(heroMark);

  function cycle(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var states = ['warlock', 'titan', 'hunter', 'default'];
    var i = 0;
    /* 每段长短不一，所以是自排的 setTimeout 链而不是一个 setInterval。
       页面落地时标记停在术士态，先把术士那一份保持段走完再动第一步——
       它写在最后一段（收拢→术士）的保持位上。 */
    function next() {
      var step = MARK_STEP[i];
      el.classList.remove(states[i]);
      i = (i + 1) % states.length;
      el.classList.add(states[i]);
      setTimeout(next, step[0] + step[1]);
    }
    setTimeout(next, MARK_STEP[MARK_STEP.length - 1][1]);
  }

  var hero = document.querySelector('.hero-search');
  if (hero) {
    /* 刷新首页回到页首。浏览器默认还原上次的滚动位置，首页有四组卡片、五屏高，
       还原之后落在半页卡片阵里，读者以为跳错了地方。**只关首页这一处**：资料页
       动辄几千行，还原是对的。带 #锚点的地址照旧由浏览器定位，不受这行影响。 */
    if (history.scrollRestoration) history.scrollRestoration = 'manual';
    home(hero);
    measure();
    return;
  }

  if (!slot || !sections.length) {
    measure();
    return;
  }

  var rows = ROW ? Array.prototype.slice.call(document.querySelectorAll(ROW)) : [];
  var mods = ITEM ? Array.prototype.slice.call(document.querySelectorAll(ITEM)) : [];
  /* 表内横幅行是组名不是条目，不参与命中，改为跟着自己那一组的可见行走 */
  var lanes = ITEM ? Array.prototype.slice.call(document.querySelectorAll('tr.lane')) : [];
  /* 上百个条目，每次按键都取 textContent 会重复遍历整棵子树，先缓存 */
  var text = mods.map(function (mod) { return mod.textContent; });

  var search = document.createElement('input');
  search.type = 'search';
  search.className = 'tool-search';
  search.placeholder = '搜索 ' + mods.length + ' 个' + NOUN;
  search.setAttribute('aria-label', '搜索' + NOUN);

  var count = document.createElement('p');
  count.className = 'tool-count';
  count.setAttribute('role', 'status');

  var chipNav = document.createElement('nav');
  chipNav.className = 'tool-chips';
  chipNav.setAttribute('aria-label', cfg.chipLabel || '神器');
  /* data-chip-break：chip 从这一节起另起一行。分节多到一行放不下时按内容分组，
     不交给自动折行随便断在哪（护甲模组页：五个部位一行，十一个副本一行）。 */
  var BREAK = cfg.chipBreak || '';
  var chips = sections.map(function (sec) {
    var chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = '#' + sec.id;
    /* 取标题的文字：首节点是文本就用它（神器模组页的 h2 后面还挂着别的东西），
       首节点是图标时退回整段文字——资料页的分节标题前面挂着职业徽章。 */
    var label = sec.querySelector(LABEL);
    var first = label.firstChild;
    chip.textContent = (first && first.nodeType === 3
      ? first.textContent : label.textContent).trim();
    if (BREAK && chip.textContent === BREAK) {
      var br = document.createElement('span');
      br.className = 'chip-break';
      br.setAttribute('aria-hidden', 'true');
      chipNav.appendChild(br);
    }
    chipNav.appendChild(chip);
    return chip;
  });

  if (ITEM) {
    slot.appendChild(search);
    slot.appendChild(count);
  }
  slot.appendChild(chipNav);

  /* 命中即显示；整行三档皆不命中则整行隐藏，整节不命中则整节与其 chip 一同隐藏。
     检索期间三档并排对照关系失效，清空即恢复。 */
  function filter(query) {
    var hits = 0;
    mods.forEach(function (mod, i) {
      var hit = matches(text[i], query);
      mod.hidden = !hit;
      if (hit) hits++;
    });
    rows.forEach(function (row) {
      row.hidden = !row.querySelector(ITEM + ':not([hidden])');
    });
    /* 横幅行独占一个 tbody，同组的数据行跟在它后面：整组都被搜没了就一并收起，
       不留一条光杆组名。 */
    lanes.forEach(function (lane) {
      lane.hidden = !lane.parentNode.querySelector('tr:not(.lane):not([hidden])');
    });
    /* 本来就没有条目的分节不参与过滤：增伤页的「世界与活动」整节是几段规则、
       一个条目都没有，按「没有可见条目就收起」判会在第一次敲搜索框时整节消失，
       且清空查询也回不来（空查询让条目全部可见，这一节仍然是零条目）。 */
    sections.forEach(function (sec, i) {
      var scope = ROW || ITEM;
      var empty = !!sec.querySelector(scope) && !sec.querySelector(scope + ':not([hidden])');
      sec.hidden = empty;
      chips[i].hidden = empty;
    });
    count.textContent = query.trim() ? hits + ' / ' + mods.length : '';
    /* 搜了但一个都没命中时给工具条打一位，搜索框与计数据此转红：灰着看
       0 / 147 与 3 / 147 长得一样。清空查询即撤销，没搜过也不算空结果。 */
    slot.toggleAttribute('data-miss', !!query.trim() && !hits);
    return hits;
  }
  window.starsideFilter = filter;

  /* 当前分节高亮：把视口顶端裁到 sticky 下沿，落在剩下那块里最靠上的分节即当前。

     用 IntersectionObserver 而不是在滚动事件里读 getBoundingClientRect()——后者
     每次滚动都要遍历所有分节做布局读取，前者由浏览器自己算好再推过来，滚动路径上
     零布局读取。搜索隐藏分节时 display:none，观察者自动报离开，不必手动同步。 */
  var onScreen = [];
  var io = null;

  function mark() {
    var current = sections.findIndex(function (sec) { return onScreen.indexOf(sec) >= 0; });
    chips.forEach(function (chip, i) {
      if (i === current) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });
  }

  /* rootMargin 依赖实测的 stick，改了要重建观察者 */
  function watch() {
    if (io) io.disconnect();
    onScreen = [];
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var at = onScreen.indexOf(e.target);
        if (e.isIntersecting && at < 0) onScreen.push(e.target);
        else if (!e.isIntersecting && at >= 0) onScreen.splice(at, 1);
      });
      mark();
    }, { rootMargin: -(stick + 8) + 'px 0px 0px 0px' });
    sections.forEach(function (sec) { io.observe(sec); });
  }

  search.addEventListener('input', function () { filter(search.value); });

  /* 从首页的全站搜索点进来时带着 ?q=：预填并过滤一次，落点交给浏览器按 # 锚点滚。
     **先过滤再滚**——defer 脚本在解析完成后、锚点定位前执行，顺序天然是对的；
     反过来滚完再隐藏行，读者会停在错位的地方。 */
  var came = new URLSearchParams(location.search).get('q');
  if (came && ITEM) {
    search.value = came;
    filter(came);
  }

  measure();
  watch();
  addEventListener('resize', function () { measure(); watch(); });
})();
