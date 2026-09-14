/* 武器库：按名字挑一把枪，右边一页看全。
 *
 * 数据分两层，都由 tools/build-weapons.py 生成，取的是静态文件不是接口：
 *   weapons/data.js       索引，906 把枪的名字、类型、图标与两家评级，约 38 KB gz
 *   weapons/w/<主键>.json  这一把的词条池、数值与两位作者写的那几列，点到才取
 * 全塞进索引要 365 KB gz，而读者一次只看一把。
 *
 * 三件事：左栏按输入过滤、右栏渲染选中那一把、地址栏记住选了谁（#<主键>），
 * 刷新与分享都落回同一把枪。
 */
(function () {
  'use strict';
  var D = window.WPN;
  if (!D) { return; }

  var q = document.getElementById('q');
  var hits = document.getElementById('hits');
  var one = document.getElementById('one');

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

  function icon(file, size) {
    if (!file) { return null; }
    var img = el('img');
    img.src = '../assets/icons/' + file;
    img.alt = '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    return img;
  }

  // ── 左栏 ──────────────────────────────────────────────────────────
  var LIMIT = 60;   // 一次最多列这么多：输入一个字就铺 900 行没人读得完

  function list(text) {
    var want = text.trim().toLowerCase();
    var got = want ? D.w.filter(function (w) { return w.k.indexOf(want) >= 0; }) : D.w;
    hits.textContent = '';
    got.slice(0, LIMIT).forEach(function (w) {
      var li = el('li');
      var a = el('a', 'wpn-hit');
      a.href = '#' + w.h;
      var im = icon(w.ico, 32);
      if (im) { a.appendChild(im); }
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
    var more = got.length - LIMIT;
    if (more > 0) {
      hits.appendChild(el('li', 'wpn-more', '还有 ' + more + ' 把，再输几个字'));
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

  // ── 右栏 ──────────────────────────────────────────────────────────
  function chips(w) {
    var box = el('p', 'wpn-chips');
    [[w.el, w.tk], [w.t, ''], [w.tier === 6 ? '异域' : '传说', w.tier === 6 ? 'exotic' : '']]
      .forEach(function (pair) {
        if (!pair[0]) { return; }
        box.appendChild(el('span', 'wpn-chip' + (pair[1] ? ' ' + pair[1] : ''), pair[0]));
      });
    return box;
  }

  function sockets(d) {
    var box = el('section', 'wpn-sockets');
    box.appendChild(el('h3', '', '词条池'));
    d.c.forEach(function (col) {
      var row = el('div', 'wpn-col');
      row.appendChild(el('span', 'wpn-col-name', col[0]));
      var pool = el('div', 'wpn-pool');
      col[1].forEach(function (at) {
        var p = d.p[at] || ['', '', ''];
        var chip = el('span', 'wpn-plug');
        chip.title = p[2] || p[0];
        var im = icon(p[1], 32);
        if (im) { chip.appendChild(im); }
        chip.appendChild(el('span', '', p[0]));
        pool.appendChild(chip);
      });
      row.appendChild(pool);
      box.appendChild(row);
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
      var bar = el('span', 'wpn-bar');
      // 数值的量纲各不相同（伤害 0–100、弹药容量能到几百），条长按 100 封顶，
      // 真值照常写在旁边——条只用来一眼看出高低，不当刻度读。
      bar.style.width = Math.min(100, pair[1]) + '%';
      dd.appendChild(bar);
      dd.appendChild(el('b', '', String(pair[1])));
      dl.appendChild(dd);
    });
    box.appendChild(dl);
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
    if (!w) {
      one.appendChild(el('p', 'wpn-empty', '左边挑一把枪。'));
      return;
    }
    var head = el('header', 'wpn-head');
    var im = icon(w.ico, 64);
    if (im) { head.appendChild(im); }
    var t = el('div');
    t.appendChild(el('h2', '', w.n));
    if (w.en) { t.appendChild(el('p', 'wpn-en', w.en)); }
    t.appendChild(chips(w));
    head.appendChild(t);
    one.appendChild(head);

    var body = el('div');
    body.appendChild(el('p', 'wpn-empty', '读取中…'));
    one.appendChild(body);

    detail(h, function (d) {
      if (location.hash.slice(1) !== h) { return; }   // 读者已经点了别的
      body.textContent = '';
      if (d.err) {
        body.appendChild(el('p', 'wpn-empty', '这一把的详情没取到（' + d.err + '）'));
        return;
      }
      if (d.fl) { body.appendChild(el('p', 'wpn-flavor', d.fl)); }
      if (d.src) { body.appendChild(el('p', 'wpn-src', d.src)); }
      // 两位作者并列，谁写了就显示谁。顺序照 data.js 里作者表的顺序，
      // 不按记录里的键序——那一份是 JSON 的字典序，与谁更权威无关。
      Object.keys(D.a).forEach(function (who) {
        if (d.by[who]) { body.appendChild(author(who, d.by[who])); }
      });
      var s = stats(d);
      if (s) { body.appendChild(s); }
      if (d.c.length) { body.appendChild(sockets(d)); }
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
