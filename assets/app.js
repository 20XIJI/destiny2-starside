/* 工具条构建、搜索过滤、当前分节高亮。零依赖。

   工具条从 DOM 读取神器名，不在 HTML 里重复任何源文本——
   生成器 tools/convert-artifact-mods.py 的保真自检因此维持原强度。
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
  var sections = Array.prototype.slice.call(document.querySelectorAll('.artifact'));
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

  var rows = Array.prototype.slice.call(document.querySelectorAll('.mod-row'));
  var mods = Array.prototype.slice.call(document.querySelectorAll('.mod'));
  /* 147 个模组，每次按键都取 textContent 会重复遍历整棵子树，先缓存 */
  var text = mods.map(function (mod) { return mod.textContent; });

  var search = document.createElement('input');
  search.type = 'search';
  search.className = 'tool-search';
  search.placeholder = '搜索 ' + mods.length + ' 个模组';
  search.setAttribute('aria-label', '搜索模组');

  var count = document.createElement('p');
  count.className = 'tool-count';
  count.setAttribute('role', 'status');

  var chipNav = document.createElement('nav');
  chipNav.className = 'tool-chips';
  chipNav.setAttribute('aria-label', '神器');
  var chips = sections.map(function (sec) {
    var chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = '#' + sec.id;
    chip.textContent = sec.querySelector('.art-head h2').firstChild.textContent.trim();
    chipNav.appendChild(chip);
    return chip;
  });

  slot.appendChild(search);
  slot.appendChild(count);
  slot.appendChild(chipNav);

  /* 命中即显示；整行三档皆不命中则整行隐藏，整节不命中则整节与其 chip 一同隐藏。
     检索期间三档并排对照关系失效——此时的目标是「找到」而非「对照」，清空即恢复。 */
  function filter(query) {
    var hits = 0;
    mods.forEach(function (mod, i) {
      var hit = matches(text[i], query);
      mod.hidden = !hit;
      if (hit) hits++;
    });
    rows.forEach(function (row) {
      row.hidden = !row.querySelector('.mod:not([hidden])');
    });
    sections.forEach(function (sec, i) {
      var empty = !sec.querySelector('.mod-row:not([hidden])');
      sec.hidden = empty;
      chips[i].hidden = empty;
    });
    count.textContent = query.trim() ? hits + ' / ' + mods.length : '';
    return hits;
  }
  window.starsideFilter = filter;

  /* 当前分节高亮：取最后一个越过 sticky 下沿的分节 */
  function spy() {
    var line = stick + 8;
    var current = -1;
    sections.forEach(function (sec, i) {
      if (!sec.hidden && sec.getBoundingClientRect().top <= line) current = i;
    });
    chips.forEach(function (chip, i) {
      if (i === current) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });
  }

  search.addEventListener('input', function () {
    filter(search.value);
    spy();
  });

  measure();
  spy();
  addEventListener('resize', function () { measure(); spy(); });
  addEventListener('scroll', spy, { passive: true });
})();
