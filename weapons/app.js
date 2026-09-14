/* 武器库：按名字挑一把枪，右边一页看全。
 *
 * 数据分两层，都由 tools/build-weapons.py 生成，取的是静态文件不是接口：
 *   weapons/data.js       索引，906 把枪的名字、类型、图标与两家评级，约 38 KB gz
 *   weapons/w/<主键>.json  这一把的词条池、数值与两位作者写的那几列，点到才取
 * 全塞进索引要 365 KB gz，而读者一次只看一把。
 *
 * 版面照 destiny.report：左栏结果、右栏详情，详情里词条池是一张**矩阵**——
 * 一列一个槽位，纵向排该槽位能开出的全部选项，圆形图标，悬停出说明。
 *
 * 地址栏记住选了谁（#<主键>），刷新与分享都落回同一把枪。
 */
(function () {
  'use strict';
  var D = window.WPN;
  if (!D) { return; }

  var q = document.getElementById('q');
  var hits = document.getElementById('hits');
  var count = document.getElementById('count');
  var one = document.getElementById('one');
  var tip = document.getElementById('tip');

  // 检索键预先拼好：每次输入都重算一遍 900 条的拼接是白算。
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

  // ── 悬停说明 ──────────────────────────────────────────────────────
  // 一个浮层反复用，不给每枚图标各挂一个：一把枪的矩阵有上百格。
  // 键盘走焦点同样出说明，触屏上点一下即出——hover 一条路会把这两种人挡在外面。
  function tipShow(target, title, body) {
    tip.textContent = '';
    tip.appendChild(el('strong', '', title));
    if (body) { tip.appendChild(el('p', '', body)); }
    tip.hidden = false;
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

  function tipHide() { tip.hidden = true; }

  function tipOn(node, title, body) {
    node.addEventListener('mouseenter', function () { tipShow(node, title, body); });
    node.addEventListener('focus', function () { tipShow(node, title, body); });
    node.addEventListener('mouseleave', tipHide);
    node.addEventListener('blur', tipHide);
  }

  window.addEventListener('scroll', tipHide, { passive: true });

  // ── 左栏 ──────────────────────────────────────────────────────────
  var LIMIT = 80;   // 一次最多列这么多：输入一个字就铺 900 行没人读得完

  function list(text) {
    var want = text.trim().toLowerCase();
    var got = want ? D.w.filter(function (w) { return w.k.indexOf(want) >= 0; }) : D.w;
    count.textContent = '结果 ' + got.length;
    hits.textContent = '';
    got.slice(0, LIMIT).forEach(function (w) {
      var li = el('li');
      var a = el('a', 'wpn-hit');
      a.href = '#' + w.h;
      a.appendChild(icon(w.ico, 32, 'wpn-hit-ico'));
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

  // ── 详情：标签片、数值、词条矩阵 ──────────────────────────────────
  function chips(w) {
    var box = el('div', 'wpn-chips');
    [[w.tier === 6 ? '异域' : '传说', w.tier === 6 ? 'exotic' : 'legend'],
      [w.el, w.tk], [w.t, ''], [w.br, 'champ']].forEach(function (pair) {
      if (!pair[0]) { return; }
      box.appendChild(el('span', 'wpn-chip' + (pair[1] ? ' ' + pair[1] : ''), pair[0]));
    });
    return box;
  }

  function stats(d) {
    if (!d.st || !d.st.length) { return null; }
    var box = el('section', 'wpn-stats');
    box.appendChild(el('h3', '', '数值'));
    var dl = el('dl');
    d.st.forEach(function (pair) {
      dl.appendChild(el('dt', '', D.s[pair[0]] || pair[0]));
      var dd = el('dd');
      var rail = el('span', 'wpn-rail');
      var bar = el('span', 'wpn-bar');
      // 数值的量纲各不相同（伤害 0–100、弹药容量能到几百），条长按 100 封顶，
      // 真值照常写在旁边——条只用来一眼看出高低，不当刻度读。
      bar.style.width = Math.min(100, pair[1]) + '%';
      rail.appendChild(bar);
      dd.appendChild(rail);
      dd.appendChild(el('b', '', String(pair[1])));
      dl.appendChild(dd);
    });
    box.appendChild(dl);
    return box;
  }

  // 词条矩阵：一列一个槽位，纵向排该槽位能开出的全部选项。
  // 每格是一枚可聚焦的圆形图标，点一下即选中——选中只改这一页的高亮，
  // 不落进地址栏：地址栏记的是「哪一把枪」，配搭是看的时候的临时状态。
  function matrix(d) {
    var box = el('section', 'wpn-sockets');
    box.appendChild(el('h3', '', '词条池'));
    var grid = el('div', 'wpn-grid');
    d.c.forEach(function (col) {
      var cell = el('div', 'wpn-colbox');
      cell.appendChild(el('span', 'wpn-col-name', col[0]));
      col[1].forEach(function (at, i) {
        var p = d.p[at] || ['', '', ''];
        var b = el('button', 'wpn-plug' + (i === 0 ? ' on' : ''));
        b.type = 'button';
        b.appendChild(icon(p[1], 40, ''));
        b.setAttribute('aria-label', p[0]);
        tipOn(b, p[0], p[2]);
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(cell.querySelectorAll('.wpn-plug'), function (x) {
            x.classList.remove('on');
          });
          b.classList.add('on');
        });
        cell.appendChild(b);
      });
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }

  // 记录里的值是源稿原文：{token|文字} 是着色标记，\\ 是格内换行，![](…) 是图。
  // 这一页只读文字，标记剥掉、换行换成顿号，图整段去掉。
  function plain(text) {
    return String(text)
      .replace(/!\[\]\([^)]*\)/g, '')
      .replace(/\{[\w-]+\|([^{}]*)\}/g, '$1')
      .replace(/\\\\/g, ' · ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function author(who, block) {
    var name = D.a[who] || [who, ''];
    var box = el('section', 'wpn-by');
    var h = el('h3');
    var a = el('a', '', name[0]);
    a.href = name[1];
    a.rel = 'noopener';
    h.appendChild(a);
    box.appendChild(h);
    var dl = el('dl');
    Object.keys(block).forEach(function (col) {
      var val = plain(block[col]);
      if (!val) { return; }
      dl.appendChild(el('dt', '', col));
      dl.appendChild(el('dd', '', val));
    });
    box.appendChild(dl);
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
      then({ err: String(why), c: [], st: [], by: {}, p: [] });
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
    tile.appendChild(icon(w.ico, 64, ''));
    head.appendChild(tile);
    var t = el('div', 'wpn-title');
    t.appendChild(el('h2', '', w.n));
    if (w.en) { t.appendChild(el('p', 'wpn-en', w.en)); }
    head.appendChild(t);
    one.appendChild(head);

    // 左右两栏：左边是这把枪的词条与作者写的那几列，右边是标签片与数值。
    var cols = el('div', 'wpn-split');
    var main = el('div', 'wpn-main');
    var side = el('aside', 'wpn-side');
    side.appendChild(chips(w));
    cols.appendChild(main);
    cols.appendChild(side);
    one.appendChild(cols);

    main.appendChild(el('p', 'wpn-empty', '读取中…'));

    detail(h, function (d) {
      if (location.hash.slice(1) !== h) { return; }   // 读者已经点了别的
      main.textContent = '';
      if (d.err) {
        main.appendChild(el('p', 'wpn-empty', '这一把的详情没取到（' + d.err + '）'));
        return;
      }
      if (d.fl) { main.appendChild(el('p', 'wpn-flavor', d.fl)); }
      if (d.src) {
        var s = el('p', 'wpn-src');
        s.appendChild(el('span', 'wpn-src-tag', '来源'));
        s.appendChild(el('span', '', d.src));
        main.appendChild(s);
      }
      if (d.c.length) { main.appendChild(matrix(d)); }
      // 两位作者并列，谁写了就显示谁。顺序照 data.js 里作者表的顺序，
      // 不按记录里的键序——那一份是 JSON 的字典序，与谁更权威无关。
      Object.keys(D.a).forEach(function (who) {
        if (d.by[who]) { main.appendChild(author(who, d.by[who])); }
      });
      var st = stats(d);
      if (st) { side.appendChild(st); }
    });
  }

  function route() {
    show(location.hash.slice(1));
    mark();
  }

  q.addEventListener('input', function () { list(q.value); });
  window.addEventListener('hashchange', route);
  list('');
  route();
}());
