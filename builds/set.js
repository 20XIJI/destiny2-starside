/* 合集详情页的两种视图：默认主从（左目录右配装），一枚按钮切竖排。

   **收起没选中的那几套是在这里施加的，不写进 HTML**——与列组页、折线图页
   「默认隐藏由 app.js 加载时施加」同一条约定：无 JS 时这一页天然就是竖排，
   三套全部可读，#set-3 照旧跳得到。

   配装页不引 app.js（为一枚按钮多下 5 KB 不值），所以站头让位那一下在这里自己
   量：左栏要贴在站头底下，而 site.css 里 --stick 的缺省值比实测矮一截。 */
(function () {
  var wrap = document.querySelector('.set-wrap');
  if (!wrap) return;
  var ones = [].slice.call(wrap.querySelectorAll('.set-one'));
  var links = [].slice.call(wrap.querySelectorAll('.set-list a'));
  var sw = wrap.querySelector('[data-setview]');
  var stack = false;

  function stick() {
    var h = document.querySelector('.site-head');
    if (h) document.documentElement.style.setProperty('--stick', h.offsetHeight + 'px');
  }

  /* 选中哪一套只认 hash：发出去的链接因此直达那一套，前进后退也能用。
     指不到任何一套（没有 hash、或者指的是别处）就落回第一套。 */
  function at() {
    for (var i = 0; i < ones.length; i++) {
      if ('#' + ones[i].id === location.hash) return i;
    }
    return 0;
  }

  function paint() {
    var i = at();
    ones.forEach(function (o, j) { o.hidden = !stack && j !== i; });
    links.forEach(function (a, j) {
      a.setAttribute('aria-current', j === i ? 'true' : 'false');
    });
  }

  /* **点目录就地改写 hash，不压历史**：一份合集最多十二套，原生的片段导航点一套
     攒一格，返回键要按十几下才出得去这一页。
     **先试 replaceState，成功了才拦截**：file:// 下它抛 SecurityError，那时放行，
     退回浏览器自己的 hash 导航——这一页的 hash 是状态不是锚点，拦了又改不成
     就再也切不动了。replaceState 不发 hashchange，重画自己调。
     竖排态下原生导航本来会滚到那一套，补一句；主从态下目标是 display: none，
     浏览器本来就找不到锚点、不滚，照旧不滚。 */
  wrap.querySelector('.set-list').addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a');
    if (!a) return;
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (e) { return; }
    ev.preventDefault();
    paint();
    if (stack) ones[at()].scrollIntoView();
  });

  if (sw) {
    sw.addEventListener('click', function () {
      stack = !stack;
      sw.setAttribute('aria-pressed', stack ? 'true' : 'false');
      sw.textContent = stack ? '逐套查看' : '展开全部';
      paint();
      /* 切到竖排时把刚看的那一套滚到眼前：不滚的话视线落在页面顶上，
         读者得自己找回刚才那一套。 */
      if (stack) ones[at()].scrollIntoView();
    });
  }

  /* 目录之外还有两条改 hash 的路：地址栏手改，以及从别处点进来的 #set-N。
     两条都发 hashchange，接住即可。 */
  window.addEventListener('hashchange', paint);
  window.addEventListener('resize', stick);
  stick();
  paint();
}());
