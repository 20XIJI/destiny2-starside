/* 悬停详情：指到一件装备，把它在站内那一页上的说明就地摆出来。
   配装详情页与配装工具共用这一份——两处的格子形状不同（那边是 <a>，这边是
   <button>），但要做的事一样，实现只留一份。

   契约只有一条：**格子上带 data-d，值是「页面\t名字\t分节」**。生成器给详情页的
   格子写上它（item()），form.js 给填表页的格子写上它（fill()）。这一份脚本因此
   不必认识行、槽位与词表。

   说明另存文件，不进页面也不进词表。照 assets/search.js 那条约定，页面 load 之后
   空闲预取、第一次悬停再兜一次；还没到时面板写「载入中」，到了就地补上。

   取哪一份由引这份脚本的 <script> 声明：详情页写 data-desc，指向与页面同目录的
   那份（只含本页格子用到的几十条，二十来 KB）；填表页不写，候选可能是词表里任何
   一条，取与这份脚本同在 builds/ 下的整份 desc.js（两兆）。 */
(function () {
  'use strict';
  var me = document.currentScript;
  var SRC = me.dataset.desc ? new URL(me.dataset.desc, document.baseURI).href
    : me.src.replace(/[^/]*$/, 'desc.js');
  var box = null, asked = false, failed = false, off = 0, now = null, px = -1, py = -1;

  /* 关掉之后连说明都不预取——填表页那份两兆，不想看详情的人不该下它。
     开关记在 localStorage，与点赞去重同一条约定：换浏览器要重新关一次。 */
  function shut() {
    try { return localStorage.getItem('tipoff') === '1'; } catch (_) { return false; }
  }

  function load() {
    if (window.starsideDesc || asked) return;
    asked = true;
    failed = false;
    var s = document.createElement('script');
    s.src = SRC;
    // 取回来时把当前指着的那一条补画上：面板里那句「载入中」就地换成说明。
    s.onload = function () { if (now) show(now); };
    // 取不到就在面板里写明，下一次悬停再取一次；不写的话面板一直停在「载入中」。
    s.onerror = function () {
      s.remove();
      asked = false;
      failed = true;
      console.error('悬停详情：取不到 ' + SRC);
      if (now) show(now);
    };
    document.head.appendChild(s);
  }

  function hide() {
    now = null;
    if (box) box.remove();
  }

  function draw(el) {
    if (shut()) return;
    now = el;
    load();
    show(el);
  }

  /* 说明还没到时照样立起面板，名字那一行照写，正文先写一句状态：指着格子却什么
     都不出，读者分不清是没有说明还是还在路上。说明表到了而里面没有这一条，才不弹。 */
  function show(el) {
    var key = el.dataset.d, t = window.starsideDesc;
    var html = !t ? '<p>' + (failed ? '说明载入失败，指针移开再指回来会重试' : '说明载入中…') + '</p>'
      : key ? t[key] : '';
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
    // 指着选择器里的候选时，面板是选择器的末栏；指着格子本身时，插在这一格
    // 所在行的下面。
    var pick = el.closest('.picker');
    if (pick) {
      if (box.parentNode !== pick) pick.appendChild(box);
    } else {
      // 展开的选择器挂在同一个锚点的 afterend 上，所以那一行开着选择器时要跟在
      // 它后面插——照着锚点插会把面板挤进格子与选择器之间，点开一格、鼠标滑开再
      // 滑回来就看到说明压在选择器上面。次序恒为格子、选择器、说明。
      var host = el.closest('.slot-row') || el.closest('.block') || el.closest('.build-head');
      var next = host.nextElementSibling;
      if (next && next.classList.contains('picker')) host = next;
      host.insertAdjacentElement('afterend', box);
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

  /* 两个分支分开调：写成 (requestIdleCallback || setTimeout)(load, 1) 时，第二个参数
     1 在 Chrome 里不是 IdleRequestOptions，当场抛 TypeError，预取一次都不跑。 */
  window.addEventListener('load', function () {
    if (shut()) return;
    if (window.requestIdleCallback) requestIdleCallback(load);
    else setTimeout(load, 1);
  });

  /* 开关的契约与格子那条同形：**页面出一枚带 data-tip-sw 的按钮**，这一份脚本
     只管按下之后怎么样。详情页把它挂在标题那一行，填表页挂在右下角那一条。
     aria-pressed 为真即详情开着，两处的样式表都照这一位上色；缺省开着，
     localStorage 里没有 tipoff 就是开。 */
  function paint() {
    var on = !shut();
    [].forEach.call(document.querySelectorAll('[data-tip-sw]'), function (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-tip-sw]')) return;
    try { localStorage.setItem('tipoff', shut() ? '0' : '1'); } catch (_) {}
    if (shut()) hide();
    else load();
    paint();
  });

  paint();

  /* 页面还没载完时指针就停在格子上：那一下 pointerover 发生在这份脚本挂上监听之前，
     指针不动就不会再来一次，面板要等读者挪一下才出。挂好之后按 :hover 现找一次
     指针底下那一格——:hover 由浏览器维护，不管当时有没有人在听。 */
  var under = document.querySelectorAll(':hover');
  var hit0 = under.length && under[under.length - 1].closest('[data-d]');
  if (hit0) draw(hit0);

  /* 截图。契约与上面两条同形：**页面出一枚带 data-shot 的按钮，值是要截的那一块的
     选择器**——详情页 main、合集里的 section.set-one、填表页 #sheet。这一份脚本只管
     按下之后怎么样，不认识行、槽位与词表。

     shot.js 点了才拉：它自己两百来行，加上要 fetch 回来内联的两份样式表与四十来张图，
     不看图的人一个字节都不该下。路径按自己的 src 现算，与上面 desc.js 那条同一个理由。

     出图要几百毫秒，期间按钮置灰并在旁边写一句，照填表页 #copy-tip 那条约定。
     **出错就把话显出来**：图少一张、字体没内联上都是静默的，不显就没人知道。 */
  var SHOT = document.currentScript.src.replace(/[^/]*$/, 'shot.js');

  function say(btn, text) {
    var tip = btn.parentNode.querySelector('.shot-tip');
    if (!tip) {
      tip = document.createElement('span');
      tip.className = 'shot-tip';
      tip.setAttribute('role', 'status');
      btn.parentNode.insertBefore(tip, btn.nextSibling);
    }
    tip.textContent = text;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-shot]');
    if (!btn) return;
    /* 合集里一页有 N 套，每套一枚按钮：从按钮往上找那一套，别拿到第一套去。 */
    var pick = btn.getAttribute('data-shot');
    var root = btn.closest(pick) || document.querySelector(pick);
    btn.disabled = true;
    say(btn, '生成中');
    import(SHOT).then(function (m) {
      return m.shot(root, { preview: !!document.getElementById('sheet') })
        .then(function (r) { m.show(r.blob); say(btn, ''); });
    }).catch(function (err) {
      say(btn, '截图失败：' + err.message);
      console.error(err);
    }).then(function () { btn.disabled = false; });
  });

  // 填表页关掉选择器时要连面板一起收：那一整块连同它的末栏都从文档里摘掉了，
  // 面板留在变量里指着一个已经不在的父节点。
  window.starsideTip = { hide: hide };
})();
