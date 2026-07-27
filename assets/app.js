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
  var ITEM = cfg.item || '.mod';
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

  if (!slot || !sections.length) {
    measure();
    return;
  }

  var rows = ROW ? Array.prototype.slice.call(document.querySelectorAll(ROW)) : [];
  var mods = Array.prototype.slice.call(document.querySelectorAll(ITEM));
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

  slot.appendChild(search);
  slot.appendChild(count);
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
