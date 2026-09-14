/* 武器库：按名字挑一把枪，右边一页看全。
 *
 * 数据分三层，都由 tools/build-weapons.py 生成，取的是静态文件不是接口：
 *   weapons/data.js       索引，2208 把枪的名字、类型、角标与各家评级
 *   weapons/plugs.js      **全站共享**的词条字典与属性插值曲线，只下一次
 *   weapons/w/<主键>.json  这一把的列结构、数值基线与作者写的那几列，点到才取
 * 词条字典抽出来共享是因为同一枚「膛线枪管」出现在五百多把枪的池里；各存一份，
 * 那部分占了产出的 86%。
 *
 * 版面照 destiny.report：左栏结果、中栏词条与评语、右栏标签片与数值。
 * 词条池是一张**矩阵**——一列一个槽位，纵向排该槽位能开出的全部选项。
 * 各列选中的那一枚共同决定属性条的当前值；悬停另一枚出「换成它会变成多少」。
 *
 * 地址栏记住选了谁（#<主键>），刷新与分享都落回同一把枪。
 */
(function () {
  'use strict';
  var D = window.WPN;
  if (!D) { return; }

  // 词条字典 65 KB gz，只有点开某一把枪才用得上。空闲时预取，点得比预取快就
  // 在这里等它一下。取不到就说取不到，不画一个没有词条的详情页冒充完整。
  var G = null, queue = [], asked = false;

  function plugs(then) {
    if (G) { then(); return; }
    if (then) { queue.push(then); }
    if (asked) { return; }
    asked = true;
    var s = document.createElement('script');
    s.src = 'plugs.js';
    s.onload = function () {
      G = window.WPG;
      var run = queue.splice(0);
      if (!G) { run.forEach(function (f) { f('plugs.js 里没有 WPG'); }); return; }
      run.forEach(function (f) { f(); });
    };
    s.onerror = function () {
      asked = false;
      queue.splice(0).forEach(function (f) { f('词条字典没取到'); });
    };
    document.head.appendChild(s);
  }

  if (window.requestIdleCallback) {
    requestIdleCallback(function () { plugs(null); });
  } else {
    setTimeout(function () { plugs(null); }, 1200);
  }

  var q = document.getElementById('q');
  var hits = document.getElementById('hits');
  var count = document.getElementById('count');
  var one = document.getElementById('one');
  var tip = document.getElementById('tip');

  // 检索键预先拼好：每次输入都重算一遍 2200 条的拼接是白算。
  D.w.forEach(function (w) {
    w.k = (w.n + ' ' + (w.en || '') + ' ' + (w.t || '') + ' ' + (w.el || '')).toLowerCase();
  });
  var by = {};
  D.w.forEach(function (w) { by[w.h] = w; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  // 一把枪的图标是叠出来的，层序照游戏里那一套：底图、大师工作那层从底下往上
  // 照的淡金辉光、赛季水印（左上角）、装备阶级角标（左缘五颗菱形）、锻造标记
  // （整层镜像到右侧：红条到右缘、四点到右下角）。每张都是整幅图，图案画在
  // 自己那一侧的透明区上，所以这里只管叠满，不管摆位。
  //
  // 24 档不叠：那几枚角标缩到这个尺寸只剩几个像素的糊点，认不出是什么。
  function gun(w, size, cls) {
    if (size < 32) { return icon(w.ico, size, cls); }
    var box = el('span', 'wpn-ico' + (cls ? ' ' + cls : ''));
    box.style.width = box.style.height = size + 'px';
    box.appendChild(icon(w.ico, size, ''));
    if (w.mw) { box.appendChild(icon(D.o.mw, size, 'wpn-ico-mw')); }
    if (w.wm) { box.appendChild(icon(w.wm, size, 'wpn-ico-wm')); }
    if (w.tiering) { box.appendChild(icon(D.o.tier, size, 'wpn-ico-tier')); }
    if (w.craft) {
      box.appendChild(icon(D.o['craft-bg'], size, 'wpn-ico-craft'));
      box.appendChild(icon(D.o.craft, size, 'wpn-ico-craft'));
    }
    return box;
  }

  function icon(file, size, cls) {
    var img = el('img', cls);
    img.src = file ? '../assets/icons/' + file
      : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    img.alt = '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    return img;
  }

  // ── 数值 ──────────────────────────────────────────────────────────
  // 显示值不是投资值：先按上限截断，再过一条分段线性曲线，最后银行家舍入。
  // 三样缺一不可——不截断，后坐方向整批错；四舍五入，2208 把里 47 把对不上；
  // 两端外推而不截断，30 个格子差 1。直接在显示值上加插件的原始加成更是不行：
  // 58052 个组合里 12% 会算错，最差一处差 250。
  function interp(v, curve) {
    if (!curve || !curve.length) { return v; }
    if (curve.length === 1 || v <= curve[0][0]) { return curve[0][1]; }
    var last = curve[curve.length - 1];
    if (v >= last[0]) { return last[1]; }
    for (var i = 0; i < curve.length - 1; i++) {
      var a = curve[i], b = curve[i + 1];
      if (a[0] <= v && v <= b[0]) {
        return b[0] === a[0] ? a[1]
          : a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]);
      }
    }
    return last[1];
  }

  // 银行家舍入：.5 进到偶数那一侧。浮点误差先抹掉，1e-9 以内当作正好落在半格上。
  function bankers(x) {
    var down = Math.floor(x), rest = x - down;
    if (Math.abs(rest - 0.5) > 1e-9) { return Math.round(x); }
    return down % 2 === 0 ? down : down + 1;
  }

  function shown(v, top, curve) {
    return bankers(interp(top ? Math.min(v, top) : v, curve));
  }

  // 一枚词条现在算哪一版的数值：有强化版就算强化版。
  // 默认按强化版算——作者写的推荐配搭本来就是满强化的那一套，而 T2 以上的枪
  // 手里拿到的也是强化版。两版的差额在悬停浮层里都列出来，不藏。
  function statsOf(p) { return (p[4] && p[4][1]) || p[3] || 0; }
  function descOf(p) { return (p[4] && p[4][0]) || p[2] || ''; }

  // 一套配置下每项属性的投资值总和，以及它是由哪几件东西加起来的。
  // 条件生效的那些（亡命之徒击杀后才加填装）不计入总和，只记在明细里备注。
  function tally(d, picked, swap) {
    var sum = {}, parts = {};
    (d.base || []).forEach(function (pair) {
      sum[pair[0]] = (sum[pair[0]] || 0) + pair[1];
      (parts[pair[0]] = parts[pair[0]] || []).push(['基础', pair[1], 0]);
    });
    function feed(at, label) {
      if (at == null) { return; }
      var p = G.p[at];
      if (!p) { return; }
      (statsOf(p) || []).forEach(function (s) {
        var cond = s.length > 2;
        if (!cond) { sum[s[0]] = (sum[s[0]] || 0) + s[1]; }
        (parts[s[0]] = parts[s[0]] || []).push([label || p[0], s[1], cond ? 1 : 0]);
      });
    }
    d.c.forEach(function (col, i) {
      if (!col[2]) { return; }
      feed(swap && swap.col === i ? swap.at : picked.c[i]);
    });
    feed(swap && swap.col === 'm' ? swap.at : picked.m);
    return { sum: sum, parts: parts };
  }

  // 一把枪该显示哪几项属性、各显示成几：顺序由它那一组插值表定，与游戏里一致。
  function readout(d, picked, swap) {
    var rows = G.g[d.sg] || [];
    var got = tally(d, picked, swap);
    return rows.map(function (row) {
      var si = row[0], v = got.sum[si];
      return {
        si: si,
        name: D.s[si][0],
        big: D.s[si][1],
        value: v == null ? 0 : shown(v, row[1], row[2]),
        parts: got.parts[si] || [],
      };
    });
  }

  // ── 悬停说明 ──────────────────────────────────────────────────────
  // 一个浮层反复用，不给每枚图标各挂一个：一把枪的矩阵有上百格。
  // 键盘走焦点同样出说明，触屏上点一下即出——hover 一条路会把这两种人挡在外面。
  function place(target) {
    var box = target.getBoundingClientRect();
    var w = tip.offsetWidth;
    var left = box.left + box.width / 2 - w / 2;
    // 贴边时整体推回视口内，宁可不居中也不要半截在屏外。
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    var top = box.bottom + 8;
    if (top + tip.offsetHeight > window.innerHeight - 8) {
      top = box.top - tip.offsetHeight - 8;
    }
    tip.style.left = (left + window.scrollX) + 'px';
    tip.style.top = (top + window.scrollY) + 'px';
  }

  function tipShow(target, build) {
    tip.textContent = '';
    build(tip);
    tip.hidden = false;
    place(target);
  }

  function tipHide() { tip.hidden = true; }

  function tipOn(node, build, enter, leave) {
    function open() { tipShow(node, build); if (enter) { enter(); } }
    function shut() { tipHide(); if (leave) { leave(); } }
    node.addEventListener('mouseenter', open);
    node.addEventListener('focus', open);
    node.addEventListener('mouseleave', shut);
    node.addEventListener('blur', shut);
  }

  window.addEventListener('scroll', tipHide, { passive: true });

  // ── sprite 图标 ───────────────────────────────────────────────────
  // 武器类型与弹药那二十枚是内联 sprite 里的 symbol，用 <use> 取。走 SVG 而不是
  // 位图，是因为它们要跟着文字变色：元素跟元素色、勇士跟红、其余素白。
  var SVG = 'http://www.w3.org/2000/svg';

  // 卡片上给作者留的那一个字，与词条图标右上角那枚角标同一套记号。
  var AUTHOR_LETTER = { aegis: 'A', lgpig: 'L', compendium: 'C' };

  function glyph(id, cls) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#i-' + id);
    svg.appendChild(use);
    return svg;
  }

  // ── 搜什么、怎么排 ────────────────────────────────────────────────
  var LIMIT = 80;        // 列表那一档一次最多列这么多
  var PAGE = 120;        // 网格那一档一屏一批，滚到底再添下一批
  var found = D.w;       // 当前命中的那一批
  var laid = 0;          // 网格已经铺了几张
  var view = 'grid';
  try {
    if (localStorage.getItem('wpnview') === 'list') { view = 'list'; }
  } catch (e) { /* 隐私模式下读不到，用默认那一档 */ }

  // ── 筛选条 ────────────────────────────────────────────────────────
  // destiny.report 那边是一套要背的查询语法（stat:range:>70）。这里换成开关：
  // 同一组里选几个是「或」，组与组之间是「且」，与站内别的页面同一套规矩。
  // 每枚开关上标着「按当前其余条件，选它还剩多少」——按下去是不是空的，按之前就看得见。
  var FACETS = [
    { key: 'tk', name: '元素', pic: 'el', text: function (w) { return w.el; } },
    { key: 'am', name: '弹药', pic: 'am' },
    { key: 'br', name: '勇士', pic: 'ch' },
    { key: 't', name: '类型', pic: 'ty', drop: true },
  ];
  var FLAGS = [
    { key: 'tier', name: '异域', hit: function (w) { return w.tier === 6; } },
    { key: 'craft', name: '可锻造', hit: function (w) { return !!w.craft; } },
    { key: 'tiering', name: '支持阶级', hit: function (w) { return !!w.tiering; } },
    { key: 'rated', name: '有评级', hit: function (w) { return !!Object.keys(w.r).length; } },
  ];
  var on = {};                      // {维度: {取值: true}}
  FACETS.concat(FLAGS).forEach(function (f) { on[f.key] = {}; });

  function live(dim) {
    return Object.keys(on[dim]).length;
  }

  // 按「除了 skip 这一维之外的全部条件」筛一遍。算每枚开关的剩余数用得上。
  function narrow(skip) {
    var want = q.value.trim().toLowerCase();
    return D.w.filter(function (w) {
      if (want && w.k.indexOf(want) < 0) { return false; }
      for (var i = 0; i < FACETS.length; i++) {
        var f = FACETS[i];
        if (f.key !== skip && live(f.key) && !on[f.key][w[f.key] || '']) { return false; }
      }
      for (var j = 0; j < FLAGS.length; j++) {
        var g = FLAGS[j];
        if (g.key !== skip && live(g.key) && !g.hit(w)) { return false; }
      }
      return true;
    });
  }

  function sift() {
    found = narrow(null);
    count.textContent = '结果 ' + found.length;
  }

  // 名字别跟数值那边的 tally() 撞：函数声明会提升，重名的那个会把先写的整个盖掉，
  // 而 JS 不会报重复定义——只在调用时炸出一句 forEach is not a function。
  function countBy(rows, key) {
    var out = {};
    rows.forEach(function (w) {
      var v = w[key] || '';
      if (v) { out[v] = (out[v] || 0) + 1; }
    });
    return out;
  }

  // 筛选条只建一次，之后原地改：整条重建会把焦点弄丢，还会把「类型」那个
  // 展开着的下拉关掉。
  var switches = [];

  function facets() {
    var host = document.getElementById('facets');
    FACETS.forEach(function (f) {
      var all = countBy(D.w, f.key);
      var keys = Object.keys(all).sort(function (a, b) { return all[b] - all[a]; });
      if (keys.length < 2) { return; }
      var box = el('div', 'wpn-facet');
      box.appendChild(el('span', 'wpn-facet-name', f.name));
      var wrap = box;
      if (f.drop) {
        var fold = el('details', 'drop');
        fold.appendChild(el('summary', 'toggle', '挑一种'));
        wrap = el('div', 'menu');
        fold.appendChild(wrap);
        box.appendChild(fold);
      }
      keys.forEach(function (v) {
        var b = el('button', 'toggle wpn-facet-one');
        b.type = 'button';
        var pic = f.pic && D.o[f.pic] && D.o[f.pic][v];
        if (pic && (f.pic === 'el' || f.pic === 'ch')) {
          b.appendChild(icon(pic, 14, 'wpn-tag-ico'));
        } else if (pic) {
          b.appendChild(glyph(pic, 'wpn-tag-svg'));
        }
        b.appendChild(el('span', '', f.text ? f.text(by0(f.key, v)) : v));
        var tail = el('em', '', '');
        b.appendChild(tail);
        b.addEventListener('click', function () {
          if (on[f.key][v]) { delete on[f.key][v]; } else { on[f.key][v] = true; }
          refresh();
        });
        switches.push({ node: b, tail: tail, dim: f.key, value: v });
        wrap.appendChild(b);
      });
      host.appendChild(box);
    });
    var flags = el('div', 'wpn-facet');
    flags.appendChild(el('span', 'wpn-facet-name', '别的'));
    FLAGS.forEach(function (g) {
      var b = el('button', 'toggle wpn-facet-one');
      b.type = 'button';
      b.appendChild(el('span', '', g.name));
      var tail = el('em', '', '');
      b.appendChild(tail);
      b.addEventListener('click', function () {
        if (on[g.key][1]) { delete on[g.key][1]; } else { on[g.key][1] = true; }
        refresh();
      });
      switches.push({ node: b, tail: tail, dim: g.key, value: 1, hit: g.hit });
      flags.appendChild(b);
    });
    var clear = el('button', 'op wpn-facet-clear', '全部清掉');
    clear.type = 'button';
    clear.hidden = true;
    clear.addEventListener('click', function () {
      FACETS.concat(FLAGS).forEach(function (f) { on[f.key] = {}; });
      q.value = '';
      refresh();
    });
    flags.appendChild(clear);
    host.appendChild(flags);
    switches.clear = clear;
  }

  // 每枚开关末尾那个数是「按当前其余条件，选它还剩多少」。按下去会不会是空的，
  // 按之前就看得见。剩 0 的压暗但不禁用：那一档仍然存在，只是当前条件下没有。
  function tick() {
    var cache = {};
    switches.forEach(function (sw) {
      var rows = cache[sw.dim] || (cache[sw.dim] = narrow(sw.dim));
      var n = sw.hit ? rows.filter(sw.hit).length
        : rows.filter(function (w) { return (w[sw.dim] || '') === sw.value; }).length;
      var pressed = !!on[sw.dim][sw.value];
      sw.tail.textContent = String(n);
      sw.node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      sw.node.classList.toggle('none', !n && !pressed);
    });
    var any = FACETS.concat(FLAGS).some(function (f) { return live(f.key); });
    switches.clear.hidden = !any && !q.value;
  }

  // 拿一条带这个取值的记录出来，给要显示别的字段的那种维度用（元素开关写中文名，
  // 而筛的是着色 token）。
  var byValue = {};
  function by0(key, v) {
    var cache = byValue[key] || (byValue[key] = {});
    if (!cache[v]) {
      cache[v] = D.w.filter(function (w) { return (w[key] || '') === v; })[0] || {};
    }
    return cache[v];
  }

  function refresh() {
    sift();
    tick();
    paint();
  }

  // ── 网格：一把枪一张卡片 ──────────────────────────────────────────
  // 卡片上那一行小图标照 destiny.report 的次序：元素、弹药、武器类型、勇士、赛季。
  // 站内比它多一行——两位作者的评级，那是这一页存在的理由。
  function card(w) {
    var a = el('a', 'wpn-card');
    a.href = '#' + w.h;
    a.appendChild(gun(w, 64, 'wpn-card-ico'));
    a.appendChild(el('strong', 'wpn-card-name', w.n));

    var tags = el('p', 'wpn-card-tags');
    if (D.o.el[w.tk]) {
      tags.appendChild(icon(D.o.el[w.tk], 14, 'wpn-tag-ico'));
    }
    if (D.o.am[w.am]) { tags.appendChild(glyph(D.o.am[w.am], 'wpn-tag-svg')); }
    if (D.o.ty[w.t]) { tags.appendChild(glyph(D.o.ty[w.t], 'wpn-tag-svg wide')); }
    if (w.br && D.o.ch[w.br]) {
      tags.appendChild(icon(D.o.ch[w.br], 14, 'wpn-tag-ico champ'));
    }
    if (w.sea) { tags.appendChild(el('em', '', 'S' + w.sea)); }
    a.appendChild(tags);

    if (w.fr) {
      var fr = el('p', 'wpn-card-frame');
      fr.appendChild(icon(w.fi, 16, ''));
      fr.appendChild(el('span', '', w.fr));
      a.appendChild(fr);
    }

    // 卡片上的评级只写首字加档位：全名「小棒猪-LGpig」会把卡片撑成两行，
    // 一整排卡片的底就参差不齐了。谁是谁在详情页与悬停里写全。
    var rate = el('p', 'wpn-card-rate');
    Object.keys(D.a).forEach(function (who) {
      if (!w.r[who] || !AUTHOR_LETTER[who]) { return; }
      var b = el('span', 'wpn-rate');
      b.appendChild(el('i', '', AUTHOR_LETTER[who]));
      b.appendChild(el('b', '', w.r[who]));
      b.title = D.a[who][0] + ' 给 ' + w.r[who];
      rate.appendChild(b);
    });
    if (rate.childNodes.length) { a.appendChild(rate); }
    return a;
  }

  var more = null;        // 滚到它就添下一批
  var watch = null;

  function feed(box) {
    var batch = found.slice(laid, laid + PAGE);
    batch.forEach(function (w) { box.insertBefore(card(w), more); });
    laid += batch.length;
    if (laid >= found.length && more) {
      more.remove();
      more = null;
    }
  }

  function grid() {
    one.textContent = '';
    laid = 0;
    if (watch) { watch.disconnect(); }
    if (!found.length) {
      one.appendChild(el('p', 'wpn-empty', '没有这把枪。换几个字试试。'));
      return;
    }
    var box = el('div', 'wpn-cards');
    more = el('p', 'wpn-more', '再往下还有…');
    box.appendChild(more);
    one.appendChild(box);
    feed(box);
    if (more) {
      // 滚到底再添下一批：两千多张卡片一次铺完，首屏要等好几秒。
      watch = new IntersectionObserver(function (rows) {
        if (rows.some(function (r) { return r.isIntersecting; })) { feed(box); }
      }, { rootMargin: '600px' });
      watch.observe(more);
    }
  }

  // ── 列表：挑中一把之后左边那一栏 ──────────────────────────────────
  function list() {
    var got = found;
    // 选中的那把排到最前：列表只铺前 80 条，按名字排下去往往轮不到它，
    // 读者就会看到右边显示着一把、左边却没有它。
    var now = location.hash.slice(1);
    if (now && by[now]) {
      got = [by[now]].concat(got.filter(function (w) { return w.h !== now; }));
    }
    hits.textContent = '';
    got.slice(0, LIMIT).forEach(function (w) {
      var li = el('li');
      var a = el('a', 'wpn-hit');
      a.href = '#' + w.h;
      a.appendChild(gun(w, 32, 'wpn-hit-ico'));
      var box = el('span', 'wpn-hit-text');
      box.appendChild(el('strong', '', w.n));
      var tags = [w.el, w.t];
      Object.keys(D.a).forEach(function (who) {
        if (w.r[who]) { tags.push(w.r[who]); }
      });
      box.appendChild(el('small', '', tags.filter(Boolean).join(' · ')));
      a.appendChild(box);
      li.appendChild(a);
      hits.appendChild(li);
    });
    if (got.length > LIMIT) {
      hits.appendChild(el('li', 'wpn-more', '还有 ' + (got.length - LIMIT) + ' 把，再输几个字'));
    }
    if (!got.length) {
      hits.appendChild(el('li', 'wpn-more', '没有这把枪'));
    }
    mark();
  }

  function mark() {
    var now = location.hash.slice(1);
    Array.prototype.forEach.call(hits.querySelectorAll('.wpn-hit'), function (a) {
      a.classList.toggle('on', a.getAttribute('href') === '#' + now);
    });
  }

  // ── 标签片 ────────────────────────────────────────────────────────
  function chips(w, d) {
    var box = el('div', 'wpn-chips');
    function add(text, cls, why, pic) {
      if (!text) { return; }
      var n = el('span', 'wpn-chip' + (cls ? ' ' + cls : ''));
      if (pic) { n.appendChild(icon(pic, 14, 'wpn-chip-ico')); }
      n.appendChild(el('span', '', text));
      if (why) {
        n.tabIndex = 0;
        tipOn(n, function (host) { host.appendChild(el('p', '', why)); });
      }
      box.appendChild(n);
    }
    add(w.el, w.tk);
    add(w.br, 'champ',
      '这把枪自带' + w.br + '，打对应的勇士不必再靠神器模组。\n'
      + '来自它的固有框架：勇士克制是框架自带的，同一个框架的枪破同一种。', w.bri);
    add(w.t, '');
    add(w.am, '');
    // 框架名就是固有那一列里的那一枚，与矩阵第一格是同一件事。
    var frame = (d.c || []).filter(function (c) { return c[0] === '固有'; })[0];
    if (frame && frame[1].length) { add(G.p[frame[1][0]][0], ''); }
    add(w.tier === 6 ? '异域' : '传说', w.tier === 6 ? 'exotic' : 'legend');
    // 赛季两个数：首发是事实，在池是 Aegis 写的那一列，两件事不一样。
    var pool = ((d.by.aegis || {})['赛季'] || '').replace(/\{[\w-]+\|([^{}]*)\}/g, '$1');
    if (w.sea || pool) {
      add((w.sea ? w.sea + ' 季' : '赛季未知') + (pool ? ' · 现在 ' + pool + ' 季在池' : ''), '',
        (w.sea ? '首发于第 ' + w.sea + ' 赛季。' : '首发赛季查不出来：这把枪的发布版本号是活动武器共用的那一个。')
        + (pool ? '\nAegis 记的是它现在还能在第 ' + pool + ' 赛季的池子里刷到。' : ''));
    }
    add(w.craft ? '可锻造' : '', '', '这把枪可以在塑形台上打造，打造出来的那把能上强化 Perk。');
    add(w.tiering ? '支持阶级' : '', '',
      '这把枪吃装备阶级：2 阶把两个 Perk 栏换成强化版，3 阶解锁强化模组，'
      + '4 阶把枪管与弹匣换成强化版，5 阶换起源特性并解锁皮肤。\n'
      + '现在是几阶是掉落那一把自己的属性，定义表里查不到，所以这里只说「支持」。');
    return box;
  }

  // ── 数值面板 ──────────────────────────────────────────────────────
  // 条按来源分段，但只用同一个强调色的几档明度，不换色相：design.md 写着
  // 「整页唯一的饱和色来自游戏自身的编码」，给「词条加的那一段」配一个蓝
  // 属于凭空造色。负值段走斜纹，同样不靠红色。
  function bar(rows, si, top, preview) {
    var rail = el('span', 'wpn-rail');
    var pos = 0, neg = 0;
    rows.forEach(function (part) {
      if (part[2]) { return; }        // 条件生效的不画进条里
      if (part[1] >= 0) { pos += part[1]; } else { neg -= part[1]; }
    });
    var span = Math.max(top || 100, 1);
    var seen = 0;
    rows.forEach(function (part, i) {
      if (part[2] || part[1] <= 0) { return; }
      var seg = el('span', 'wpn-seg' + (i === 0 ? ' base' : ''));
      seg.style.width = Math.min(100, part[1] / span * 100) + '%';
      rail.appendChild(seg);
      seen += part[1];
    });
    if (neg) {
      var cut = el('span', 'wpn-seg neg');
      cut.style.width = Math.min(100, neg / span * 100) + '%';
      rail.appendChild(cut);
    }
    if (preview != null) {
      var ghost = el('span', 'wpn-ghost' + (preview < 0 ? ' down' : ''));
      ghost.style.left = Math.max(0, Math.min(100, (preview < 0 ? seen + preview : seen) / span * 100)) + '%';
      ghost.style.width = Math.min(100, Math.abs(preview) / span * 100) + '%';
      rail.appendChild(ghost);
    }
    return rail;
  }

  function statPanel(d, picked, preview) {
    var now = readout(d, picked);
    var soon = preview ? readout(d, picked, preview) : null;
    var box = el('section', 'wpn-stats');
    box.appendChild(el('h3', '', '数值'));
    var dl = el('dl');
    now.forEach(function (row, i) {
      var next = soon ? soon[i] : null;
      var dt = el('dt', '', row.name);
      var dd = el('dd');
      // 量纲不同的（每分钟发射数、弹匣）只写数——给它们画一条按 100 封顶的条，
      // 条会永远满格，读者以为那是「满」。
      if (row.big) {
        dd.appendChild(el('span', 'wpn-rail bare'));
      } else {
        dd.appendChild(bar(row.parts, row.si, 100,
          next && next.value !== row.value ? next.value - row.value : null));
      }
      dd.appendChild(el('b', '', String(row.value)));
      if (next && next.value !== row.value) {
        dd.appendChild(el('i', 'wpn-next' + (next.value > row.value ? ' up' : ' down'),
          (next.value > row.value ? '▲' : '▼') + next.value));
      }
      // 第二层悬停：这个数是怎么加出来的。悬停词条出的是「这一枚值多少」，
      // 这里出的是「这一项由哪几件东西凑成」，两个问题不同，都要。
      var line = el('div', 'wpn-statrow');
      line.tabIndex = 0;
      line.appendChild(dt);
      line.appendChild(dd);
      tipOn(line, function (host) {
        host.appendChild(el('strong', '', row.name));
        var t = el('table', 'wpn-sum');
        row.parts.forEach(function (part) {
          var tr = el('tr');
          tr.appendChild(el('th', '', part[0] + (part[2] ? '（条件生效）' : '')));
          tr.appendChild(el('td', part[2] ? 'cond' : '',
            part === row.parts[0] ? String(part[1])
              : (part[1] > 0 ? '+' : '') + part[1]));
          t.appendChild(tr);
        });
        var tot = el('tr', 'total');
        tot.appendChild(el('th', '', '显示值'));
        tot.appendChild(el('td', '', String(row.value)));
        t.appendChild(tot);
        host.appendChild(t);
      });
      dl.appendChild(line);
    });
    box.appendChild(dl);
    return box;
  }

  // ── 词条矩阵 ──────────────────────────────────────────────────────
  // 每格是一枚可聚焦的圆形图标，点一下即选中——选中只改这一页的高亮与数值，
  // 不落进地址栏：地址栏记的是「哪一把枪」，配搭是看的时候的临时状态。
  function plugTip(at, host) {
    var p = G.p[at];
    var head = el('p', 'wpn-tip-head');
    head.appendChild(el('strong', '', p[0]));
    if (p[4]) { head.appendChild(el('span', 'wpn-tag-enh', '强化')); }
    host.appendChild(head);
    if (descOf(p)) { host.appendChild(el('p', '', descOf(p))); }
    var rows = statsOf(p) || [];
    if (rows.length) {
      var t = el('table', 'wpn-sum');
      rows.forEach(function (s) {
        var tr = el('tr');
        tr.appendChild(el('th', '', D.s[s[0]][0] + (s.length > 2 ? '（条件生效）' : '')));
        tr.appendChild(el('td', s.length > 2 ? 'cond' : '', (s[1] > 0 ? '+' : '') + s[1]));
        t.appendChild(tr);
      });
      host.appendChild(t);
    }
    if (p[4] && p[3] && p[3].length) {
      host.appendChild(el('p', 'wpn-tip-note', '上面是强化版的数值；未强化时 '
        + p[3].map(function (s) {
          return D.s[s[0]][0] + ' ' + (s[1] > 0 ? '+' : '') + s[1];
        }).join('、') + '。'));
    }
  }

  function seat(at, rec, on, pick, colKey, act) {
    var p = G.p[at];
    var b = el('button', 'wpn-plug' + (on ? ' on' : '') + (p[4] ? ' enh' : ''));
    b.type = 'button';
    b.dataset.col = colKey;
    b.dataset.at = at;
    b.appendChild(icon(p[1], 40, ''));
    b.setAttribute('aria-label', p[0]);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var who = rec[String(at)];
    if (who) {
      var flags = el('span', 'wpn-rec');
      who.split('').forEach(function (ch) { flags.appendChild(el('i', '', ch)); });
      b.appendChild(flags);
    }
    tipOn(b, function (host) {
      plugTip(at, host);
      if (who) {
        host.appendChild(el('p', 'wpn-tip-rec', who.split('').map(function (ch) {
          return (D.a[ch === 'A' ? 'aegis' : 'lgpig'] || [ch])[0];
        }).join('、') + ' 推荐'));
      }
    }, function () { pick.hover(colKey, at); }, function () { pick.hover(null); });
    b.addEventListener('click', act || function () { pick.set(colKey, at); });
    return b;
  }

  // 折起来的那一栏（大师杰作）：只露选中的那一枚，点它才摊开十四项。
  // 十四项常驻会把整张矩阵拉高一倍，而它们是同一件事的十四个取值。
  function folded(col, i, rec, pick, host) {
    var cell = el('div', 'wpn-colbox');
    cell.appendChild(el('span', 'wpn-col-name', col[0]));
    var slot = el('div', 'wpn-fold');
    cell.appendChild(slot);
    function shut() {
      host.textContent = '';
      host.hidden = true;
      draw();
    }
    function draw() {
      slot.textContent = '';
      var b = seat(pick.c[i], rec, true, pick, i, function () {
        if (!host.hidden) { shut(); return; }
        host.hidden = false;
        host.textContent = '';
        var row = el('div', 'wpn-modrow');
        col[1].forEach(function (at) {
          row.appendChild(seat(at, rec, at === pick.c[i], pick, i, function () {
            pick.set(i, at);
            shut();
          }));
        });
        host.appendChild(row);
        b.setAttribute('aria-expanded', 'true');
      });
      b.setAttribute('aria-expanded', host.hidden ? 'false' : 'true');
      slot.appendChild(b);
    }
    draw();
    return cell;
  }

  function matrix(d, rec, pick) {
    var box = el('section', 'wpn-sockets');
    box.appendChild(el('h3', '', '词条池'));
    var note = el('div', 'wpn-note');
    box.appendChild(note);
    pick.tell = function (at) {
      var p = G.p[at];
      note.textContent = '';
      note.appendChild(icon(p[1], 40, 'wpn-note-ico'));
      var t = el('div');
      var head = el('p', 'wpn-tip-head');
      head.appendChild(el('strong', '', p[0]));
      if (p[4]) { head.appendChild(el('span', 'wpn-tag-enh', '强化')); }
      t.appendChild(head);
      if (descOf(p)) { t.appendChild(el('p', '', descOf(p))); }
      note.appendChild(t);
    };
    var grid = el('div', 'wpn-grid');
    var fold = el('div', 'wpn-pick');
    fold.hidden = true;
    d.c.forEach(function (col, i) {
      if (col[3]) { grid.appendChild(folded(col, i, rec, pick, fold)); return; }
      var cell = el('div', 'wpn-colbox');
      cell.appendChild(el('span', 'wpn-col-name', col[0]));
      col[1].forEach(function (at) {
        cell.appendChild(seat(at, rec, pick.c[i] === at, pick, i));
      });
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    box.appendChild(fold);
    return box;
  }

  // ── 可选模组 ──────────────────────────────────────────────────────
  // 不并进矩阵：词条是掉落时随机开出来的，模组是随时能换的，混在一张表里
  // 那二十几枚会让人以为它们也是随机词条。
  function modBlock(d, pick) {
    var box = el('section', 'wpn-mods');
    var head = el('div', 'wpn-mods-head');
    head.appendChild(el('h3', '', '可选模组'));
    var find = el('input', 'wpn-mod-find');
    find.type = 'search';
    find.placeholder = '按名字找';
    find.setAttribute('aria-label', '在可选模组里按名字找');
    head.appendChild(find);
    box.appendChild(head);
    var row = el('div', 'wpn-modrow');
    var seats = d.m.map(function (at) {
      var b = seat(at, {}, pick.m === at, pick, 'm');
      row.appendChild(b);
      return b;
    });
    box.appendChild(row);
    find.addEventListener('input', function () {
      var want = find.value.trim().toLowerCase();
      seats.forEach(function (b, i) {
        b.hidden = !!want && G.p[d.m[i]][0].toLowerCase().indexOf(want) < 0;
      });
    });
    return box;
  }

  // 记录里的值是源稿原文：{token|文字} 是着色标记，\\ 是格内换行，![](…) 是图。
  // 这一页只读文字：标记剥掉，图去掉，**格内换行还原成真的换行**——注解那一格
  // 写的是一句断成两行的话，压成顿号会读成两件事。
  function plain(text) {
    return String(text)
      .replace(/!\[\]\([^)]*\)/g, '')
      .replace(/\{[\w-]+\|([^{}]*)\}/g, '$1')
      .replace(/\\\\/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  var PROSE = ['注解', '评级理由', '理由一', '理由二', '理由三', '备注', '说明'];

  function says(who, block) {
    var lines = PROSE.filter(function (c) { return block[c]; });
    if (!lines.length) { return null; }
    var name = D.a[who] || [who, ''];
    var box = el('section', 'wpn-say');
    var h = el('h4');
    var a = el('a', '', name[0]);
    a.href = name[1];
    a.rel = 'noopener';
    h.appendChild(a);
    box.appendChild(h);
    lines.forEach(function (c) {
      var p = el('p', '', plain(block[c]));
      box.appendChild(p);
    });
    return box;
  }

  // 取过的详情留在内存里：来回点两把枪不该各取两遍。
  var cache = {};

  function detail(h, then) {
    if (cache[h]) { then(cache[h]); return; }
    fetch('w/' + h + '.json').then(function (r) {
      if (!r.ok) { throw new Error(r.status); }
      return r.json();
    }).then(function (d) {
      cache[h] = d;
      then(d);
    }).catch(function (why) {
      // 取不到就说清楚取不到，不画一个缺了半截的页面当成完整的。
      then({ err: String(why), c: [], m: [], base: [], rec: {}, by: {}, alt: [] });
    });
  }

  function show(h) {
    var w = by[h];
    one.textContent = '';
    tipHide();
    if (!w) {
      one.appendChild(el('p', 'wpn-empty', '左边挑一把枪，或在上面按名字搜。'));
      return;
    }

    var head = el('header', 'wpn-head');
    var tile = el('span', 'wpn-tile' + (w.tier === 6 ? ' exotic' : ''));
    tile.appendChild(gun(w, 64, ''));
    head.appendChild(tile);
    var t = el('div', 'wpn-title');
    t.appendChild(el('h2', '', w.n));
    if (w.en) { t.appendChild(el('p', 'wpn-en', w.en)); }
    // 评级与名字放在一起：那是读者点进这把枪最想先看到的一件事。
    var rate = el('p', 'wpn-rates');
    Object.keys(D.a).forEach(function (who) {
      if (!w.r[who]) { return; }
      var b = el('span', 'wpn-rate');
      b.appendChild(el('i', '', (D.a[who][0] || '').split(' ')[0]));
      b.appendChild(el('b', '', w.r[who]));
      rate.appendChild(b);
    });
    if (rate.childNodes.length) { t.appendChild(rate); }
    head.appendChild(t);
    one.appendChild(head);

    var cols = el('div', 'wpn-split');
    var main = el('div', 'wpn-main');
    var side = el('aside', 'wpn-side');
    cols.appendChild(main);
    cols.appendChild(side);
    one.appendChild(cols);
    main.appendChild(el('p', 'wpn-empty', '读取中…'));

    detail(h, function (d) {
      if (location.hash.slice(1) !== h) { return; }   // 读者已经点了别的
      if (d.err) {
        main.textContent = '';
        main.appendChild(el('p', 'wpn-empty', '这一把的详情没取到（' + d.err + '）'));
        return;
      }
      plugs(function (why) { draw(d, why); });
    });

    function draw(d, why) {
      if (location.hash.slice(1) !== h) { return; }
      main.textContent = '';
      if (why) {
        main.appendChild(el('p', 'wpn-empty', why));
        return;
      }
      // 开页每列选第一枚。
      var pick = {
        c: d.c.map(function (col) { return col[1][0]; }),
        m: d.m.length ? d.m[0] : null,
      };
      var statBox = null;
      function repaint(preview) {
        var fresh = statPanel(d, pick, preview);
        if (statBox) { side.replaceChild(fresh, statBox); } else { side.appendChild(fresh); }
        statBox = fresh;
      }
      pick.set = function (key, at) {
        if (key === 'm') { pick.m = pick.m === at ? null : at; } else { pick.c[key] = at; }
        stamp();
        pick.tell(at);
        repaint(null);
      };
      pick.hover = function (key, at) {
        repaint(key == null ? null : { col: key, at: at });
      };
      // 按格子自己带的 data-* 认，不按它排在第几个认：折起来那一栏只渲染一枚，
      // 按位置数会把「第 0 个」当成整栏的第 0 项。
      function stamp() {
        Array.prototype.forEach.call(one.querySelectorAll('.wpn-plug'), function (b) {
          var key = b.dataset.col, at = Number(b.dataset.at);
          var on = key === 'm' ? pick.m === at : pick.c[Number(key)] === at;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }

      if (d.fl) { main.appendChild(el('p', 'wpn-flavor', d.fl)); }
      var src = (d.src || []).filter(Boolean);
      if (src.length) {
        var s = el('p', 'wpn-src');
        s.appendChild(el('span', 'wpn-src-tag', '来源'));
        s.appendChild(el('span', '', src.map(plain).join(' · ')));
        main.appendChild(s);
      }
      if (d.c.length) { main.appendChild(matrix(d, d.rec || {}, pick)); }
      if (d.m.length) { main.appendChild(modBlock(d, pick)); }
      // 评语排在词条之后：读者先看事实，再看评价。
      var said = el('section', 'wpn-says');
      Object.keys(D.a).forEach(function (who) {
        var block = (d.by || {})[who];
        var node = block && says(who, block);
        if (node) { said.appendChild(node); }
      });
      if (said.childNodes.length) {
        said.insertBefore(el('h3', '', '作者怎么说'), said.firstChild);
        main.appendChild(said);
      }

      side.appendChild(chips(w, d));
      repaint(null);
      if (d.alt && d.alt.length) { side.appendChild(versions(d.alt, h)); }
      if (d.c.length && d.c[0][1].length) { pick.tell(pick.c[0]); }
    }
  }

  // 复刻让同一把枪有好几个版本，各自的词条池不一样。
  function versions(alt, now) {
    var box = el('section', 'wpn-alt');
    box.appendChild(el('h3', '', '别的版本'));
    var ol = el('ol');
    [{ h: now }].concat(alt.map(function (x) { return { h: x[0], sea: x[1] }; }))
      .forEach(function (x) {
        var w = by[x.h];
        if (!w) { return; }
        var li = el('li');
        var a = el('a', 'wpn-altone' + (x.h === now ? ' on' : ''));
        a.href = '#' + x.h;
        a.appendChild(icon(w.ico, 24, ''));
        a.appendChild(el('span', '', w.n));
        a.appendChild(el('em', '', w.sea ? 'S' + w.sea : '—'));
        li.appendChild(a);
        ol.appendChild(li);
      });
    box.appendChild(ol);
    return box;
  }

  // ── 两档版面 ──────────────────────────────────────────────────────
  // 挑中一把枪之前是满幅的卡片墙，挑中之后左边收成一列结果、右边铺开那一把。
  // destiny.report 也是这么分的：初始页没有左栏，它要给卡片让出整幅宽度。
  function paint() {
    var now = location.hash.slice(1);
    var picked = !!(now && by[now]);
    document.querySelector('.wpn-body').classList.toggle('one-up', !picked);
    document.querySelector('.wpn-view').hidden = picked;
    if (picked) {
      if (watch) { watch.disconnect(); watch = null; }
      list();
      show(now);
    } else if (view === 'list') {
      list();
      one.textContent = '';
      one.appendChild(el('p', 'wpn-empty', '左边挑一把枪，或在上面按名字搜。'));
    } else {
      grid();
    }
  }

  function setView(next, quiet) {
    view = next;
    try { localStorage.setItem('wpnview', next); } catch (e) { /* 存不下就算了 */ }
    gridBtn.setAttribute('aria-pressed', next === 'grid' ? 'true' : 'false');
    listBtn.setAttribute('aria-pressed', next === 'list' ? 'true' : 'false');
    document.querySelector('.wpn-body').classList.toggle('as-list', next === 'list');
    if (!quiet) { paint(); }
  }

  var gridBtn = document.getElementById('v-grid');
  var listBtn = document.getElementById('v-list');
  gridBtn.addEventListener('click', function () { setView('grid'); });
  listBtn.addEventListener('click', function () { setView('list'); });

  q.addEventListener('input', refresh);
  window.addEventListener('hashchange', function () { tipHide(); paint(); });
  facets();
  setView(view, true);
  refresh();
}());
