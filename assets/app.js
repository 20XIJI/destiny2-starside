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
    var heads = [].slice.call(document.querySelectorAll('.gen thead th'));
    var rows = [].slice.call(document.querySelectorAll('.gen tbody tr'));
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

  if (slot && slot.dataset.clock !== undefined) nowCell();

  if (slot && slot.dataset.cols !== undefined) {
    columns();
    measure();
    addEventListener('resize', measure);
    return;
  }

  if (!slot || !sections.length) {
    measure();
    return;
  }

  var rows = ROW ? Array.prototype.slice.call(document.querySelectorAll(ROW)) : [];
  var mods = ITEM ? Array.prototype.slice.call(document.querySelectorAll(ITEM)) : [];
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
  var chips = sections.map(function (sec) {
    var chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = '#' + sec.id;
    chip.textContent = sec.querySelector(LABEL).firstChild.textContent.trim();
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
    sections.forEach(function (sec, i) {
      var empty = !sec.querySelector((ROW || ITEM) + ':not([hidden])');
      sec.hidden = empty;
      chips[i].hidden = empty;
    });
    count.textContent = query.trim() ? hits + ' / ' + mods.length : '';
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

  measure();
  watch();
  addEventListener('resize', function () { measure(); watch(); });
})();
