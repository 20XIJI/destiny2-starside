/* 悬停详情：指到一件装备，把它在站内那一页上的说明就地摆出来。
   配装详情页与配装工具共用这一份——两处的格子形状不同（那边是 <a>，这边是
   <button>），但要做的事一样，实现只留一份。

   契约只有一条：**格子上带 data-d，值是「页面\t名字\t分节」**。生成器给详情页的
   格子写上它（item()），form.js 给填表页的格子写上它（fill()）。这一份脚本因此
   不必认识行、槽位与词表。

   说明另存 builds/desc.js，不进词表：二十万字塞进 vocab.js 会让配装工具一打开
   就下将近一兆。照 assets/search.js 那条约定，页面 load 之后空闲预取、第一次
   悬停再兜一次；取不到就不弹，页面照常。 */
(function () {
  'use strict';
  // desc.js 与这份脚本同在 builds/ 下，路径按自己的 src 现算，不由各页传进来。
  var SRC = document.currentScript.src.replace(/[^/]*$/, 'desc.js');
  var box = null, asked = false, off = 0, now = null, px = -1, py = -1;

  function load() {
    if (window.starsideDesc || asked) return;
    asked = true;
    var s = document.createElement('script');
    s.src = SRC;
    // 取回来时把当前指着的那一条补画上：预取没赶上，第一次悬停就不会是空的。
    s.onload = function () { if (now) draw(now); };
    document.head.appendChild(s);
  }

  function hide() {
    now = null;
    if (box) box.remove();
  }

  function draw(el) {
    now = el;
    load();
    var key = el.dataset.d, t = window.starsideDesc;
    var html = t && key ? t[key] : '';
    if (!html) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('aside');
      box.className = 'dpanel';
    }
    var at = key.split('\t');
    box.innerHTML = '<p class="dp-name">' + esc(at[1])
      + (at[2] ? '<span class="sub">' + esc(at[2]) + '</span>' : '')
      + '</p><div class="dp-body">' + html + '</div>';
    // 选择器开着时面板是它的末栏；否则插在这一格所在行的下面。两处不抢位——
    // 那一行开着选择器时，指的就是选择器里的候选。
    var pick = el.closest('.picker');
    if (pick) {
      if (box.parentNode !== pick) pick.appendChild(box);
    } else {
      (el.closest('.slot-row') || el.closest('.block') || el.closest('.build-head'))
        .insertAdjacentElement('afterend', box);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 一个 pointerover 管两处。两道闸：

     **指针没动就不换。**面板跟着说明长高，滚动时内容从静止的指针底下滑过，浏览器
     照样派发 pointerover——那一下会把正在读的说明换成滑过来的那一条，页面高度跟着
     变，人就越滚越找不着地方。判据是指针自己动没动，不是等一个时长。

     **移出去不立刻收。**从格子挪到面板要跨过行的内边距，那一下的目标既不是格子也
     不是面板，立刻收就永远够不到面板。 */
  document.addEventListener('pointerover', function (e) {
    if (e.clientX === px && e.clientY === py) return;
    px = e.clientX;
    py = e.clientY;
    var hit = e.target.closest('[data-d]');
    if ((box && box.contains(e.target)) || hit) {
      clearTimeout(off);
      if (hit && hit !== now) draw(hit);
      return;
    }
    clearTimeout(off);
    off = setTimeout(hide, 120);
  });

  window.addEventListener('load', function () {
    (window.requestIdleCallback || setTimeout)(load, 1);
  });

  // 填表页关掉选择器时要连面板一起收：那一整块连同它的末栏都从文档里摘掉了，
  // 面板留在变量里指着一个已经不在的父节点。
  window.starsideTip = { hide: hide };
})();
