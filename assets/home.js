/* 首页那只搜索框：取回全站索引、按命中分档、摘要加亮。只有首页用。

   从 assets/app.js 拆出来：它是页面专属的，而 app.js 每个带工具条的页面都要下。
   合起来 chart + rota + home 是 app.js 8.9 KB gzip 里的 6.9 KB，却只有三个页面
   跑得到，其余 31 页白下。拆开之后由 app.js 在认出该页的 data-* 时动态 import。

   共用件（words、hit）由 app.js 传进来，不在这里重抄一份。 */

export default function init(box, deps) {
  var words = deps.words, hit = deps.hit;

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
    more.className = 'op hits-more';
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
        /* **判据与 draw() 里那一处必须是同一个。**那边按 `!r.n` 分页面与条目，
           这边若改按 `r.d` 分，两个字段都为空的记录就走不到 `_t` 这一支，
           draw() 拿到 undefined 当正文，整只搜索框当场抛错。 */
        index.forEach(function (r) {
          if (!r.n) { r._t = ((r.t || '') + ' ' + (r.d || '')).toLowerCase(); }
          else { r._n = r.n.toLowerCase(); r._x = (r.x || '').toLowerCase(); }
          if (r.d) pages[r.u] = r;
        });
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

      var terms = words(q);
      var top = [], named = [], rest = [];
      index.forEach(function (r) {
        if (!r.n) { if (hit(r._t, terms)) top.push(r); }
        else if (hit(r._n, terms)) named.push(r);
        else if (hit(r._x, terms)) rest.push(r);
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

    /* 索引 287 KB gzip。只在聚焦时拉的话，读者点进搜索框敲第一个字要干等它下完；
       页面加载完之后趁空闲预取，想搜的时候已经在内存里。排在 load 之后、空闲时段
       里，首屏不受影响。上面那条 focus 留着兜底——空闲回调可能一直不来。 */
    /* **timeout 必须给。**空闲回调没有「一定会来」的保证——页面持续有活干时它会被
       一直推后，预取就白写了。给 3 秒上限，到点无论闲不闲都拉。 */
    function idle(fn) {
      if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 3000 });
      else setTimeout(fn, 1200);
    }
    if (document.readyState === 'complete') idle(load);
    else addEventListener('load', function () { idle(load); });
  }

  return home(box);
}
