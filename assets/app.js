/* 工具条构建、搜索过滤、当前分节高亮。零依赖。

   工具条从 DOM 读取神器名，不在 HTML 里重复任何源文本，否则生成器
   tools/convert-artifact-mods.py 的保真自检会报重复。
   无 JS 时工具条为空容器（.toolbar:empty 收起），正文与档位轨完整可读。 */
(function () {
  'use strict';

  /* 匹配判定：空格分词后全部命中（AND）。纯函数，可单独验证。

     拆成三个是为了热路径：查询词一次按键只解析一次，正文的小写副本在建索引时
     备好，`hit()` 于是只剩 indexOf。合成一个的写法会让这两件事按记录条数重做
     ——首页 3311 条、weapon-perks 413 行，每敲一个字就是那么多遍。 */
  function words(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }
  function hit(hay, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (hay.indexOf(terms[i]) === -1) return false;
    }
    return true;
  }
  function matches(text, query) { return hit(text.toLowerCase(), words(query)); }

  /* 页面专属的三段（折线图、轮盘、首页搜索）拆成了同目录下的模块，认出该页的
     data-* 时才拉。**路径按自己的 src 现算**：这是个 classic script，import() 里
     写相对路径按文档基址解，而资料页嵌在各自的目录里，深浅不一。
     **载入失败要炸出来**：静默 catch 掉的话，页面上只是少一张图，没人看得出。 */
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  function lazy(file) {
    return import(new URL(file, HERE).href).catch(function (e) {
      console.error('载不动 ' + file, e);
      throw e;
    });
  }

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

  /* resize 一帧只跑一次。measure() 读顶栏高度、再往 :root 写自定义属性——写根变量
     让整棵树的样式失效，下一个 resize 事件里那次读因此必然触发全文档强制同步布局；
     watch() 还要销毁并重建观察者。拖窗口每秒几十次，合并到一帧即可。 */
  /* 图建好之后把源表收起来。**不用 hidden**：那把表从无障碍树里一并摘掉了，
     屏幕阅读器只剩一句 aria-label，折线图 201 行坐标与轮换表的副本顺序全没了——
     开着 JS 反而比不开少东西。

     **收在外包的一层 div 上，不收在 <table> 自己身上。**表的 width / height 被当成
     最小值，1px 收不动它：实测仍是 245×8037 的盒子，撑出横向溢出。 */
  function tuck(table) {
    var box = document.createElement('div');
    box.className = 'off-screen';
    table.parentNode.insertBefore(box, table);
    box.appendChild(table);
  }

  function onResize(fn) {
    var queued = false;
    addEventListener('resize', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    });
  }

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
      chip.className = 'toggle';
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
    /* 这一页还有一张轮换轴的表（data-rota），时钟高亮不认它——不排除的话表头与
       行会被两张表的格子混在一起，找到的列压根不在这张表上。 */
    var table = document.querySelector('.gen:not([data-rota])');
    if (!table) return;
    var heads = [].slice.call(table.querySelectorAll('thead th'));
    var rows = [].slice.call(table.querySelectorAll('tbody tr'));
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

  if (slot && slot.dataset.rota !== undefined) {
    var rt = document.querySelector('.gen[data-rota]');
    if (rt) lazy('rota.js').then(function (m) { m.default(rt, { tuck: tuck }); });
  }

  if (slot && slot.dataset.chart !== undefined) {
    lazy('chart.js').then(function (m) {
      m.default({ tuck: tuck, onResize: onResize, slot: slot });
      measure();          // 图建好、源表收起之后版面变了，再量一次
    });
    measure();
    onResize(measure);
    return;
  }

  if (slot && slot.dataset.cols !== undefined) {
    columns();
    measure();
    onResize(measure);
    return;
  }

  /* 首屏那枚标记：四个状态轮着换类，位置与角度的插值全在 CSS 里
     （site.css「首屏那枚标记」一节）。这里只负责按节拍换类。

     **减弱动效时整个不换，停在术士态。**过渡关掉之后换类只剩瞬切，一枚图案
     跳成另一枚既不是动画也读不出零件怎么走的，不如干脆静止。

     四段各一对「位移 ms、保持 ms」，顺序是术士→泰坦、泰坦→猎人、猎人→收拢、
     收拢→术士。位移那一半同时写在 site.css 的 --morph 上（过渡时长取的是要去
     那一态的值），两处是同一张表；改节拍两处一起改。

     **值不照抄原动画的 2340/820、2340/690、1100/2750、550/550。**原片是一秒钟
     一闪而过的开场，三个图案各停 0.6–0.8s、收拢与重新长出来各只用 1.1s 与 0.55s；
     站上这枚长期挂在首屏、要被反复看，那个节拍下图案还没认清就换掉了，后两段的
     急停急起也读作卡顿。三个图案的保持一律给到 1.3s，四段位移拉平到
     2200/2200/1800/1800，收拢态停 2s——它没有图案，长一点是这一轮的换气。 */
  var MARK_STEP = [[2200, 1300], [2200, 1300], [1800, 2000], [1800, 1300]];

  /* **名字不能叫 mark**：这个 IIFE 里已经有一个 function mark()（当前分节高亮）。
     var 提升到同一个函数作用域，资料页上这一行把它赋成 null，当前分节高亮的
     观察者一触发就报 mark is not a function，整站的 chip 因此不再跟着滚动亮起。 */
  var heroMark = document.querySelector('.hero-mark');
  if (heroMark) cycle(heroMark);

  function cycle(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var states = ['warlock', 'titan', 'hunter', 'default'];
    var i = 0;
    /* 每段长短不一，所以是自排的 setTimeout 链而不是一个 setInterval。
       页面落地时标记停在术士态，先把术士那一份保持段走完再动第一步——
       它写在最后一段（收拢→术士）的保持位上。 */
    function next() {
      var step = MARK_STEP[i];
      el.classList.remove(states[i]);
      i = (i + 1) % states.length;
      el.classList.add(states[i]);
      setTimeout(next, step[0] + step[1]);
    }
    setTimeout(next, MARK_STEP[MARK_STEP.length - 1][1]);
  }

  var hero = document.querySelector('.hero-search');
  if (hero) {
    lazy('home.js').then(function (m) { m.default(hero, { words: words, hit: hit }); });
    measure();
    return;
  }

  if (!slot || !sections.length) {
    measure();
    return;
  }

  var rows = ROW ? Array.prototype.slice.call(document.querySelectorAll(ROW)) : [];
  var mods = ITEM ? Array.prototype.slice.call(document.querySelectorAll(ITEM)) : [];
  /* 表内横幅行是组名不是条目，不参与命中，改为跟着自己那一组的可见行走 */
  var lanes = ITEM ? Array.prototype.slice.call(document.querySelectorAll('tr.lane')) : [];
  /* 分节里再分的小标题（配装索引页的职业），跟着紧随其后那一组的可见条目走。
     **这一条只能在 JS 里做**：CSS 要写成 .sub-label:has(+ ul:not(:has(> li:not([hidden]))))，
     而 :has() 不许再套 :has()，整条是无效选择器——写在样式表里不报错也不生效。 */
  var subs = ITEM ? Array.prototype.slice.call(document.querySelectorAll('.sub-label'))
    .filter(function (h) { return h.nextElementSibling && h.nextElementSibling.querySelector(ITEM.split('>').pop().trim()); })
    : [];
  /* 上百个条目，每次按键都取 textContent 会重复遍历整棵子树，先缓存。
     直接存小写：`hit()` 要的就是它，每次按键再转一遍是几十万字符的临时垃圾。 */
  var text = mods.map(function (mod) { return mod.textContent.toLowerCase(); });

  /* 维度筛选（.toolbar 带 data-facets 的页面：配装索引页）。**维度从卡片上现扫**，
     不写进 HTML——类别与职业就是卡片上方那两级标题，标签是卡片里的那几个 <i>。
     只有分支由生成器给：DOM 里只有 b-prismatic 这种 slug，中文名读不出来，而在
     这里再写一份 slug→中文 就是 convert-build.py 里 BRANCH 的第二份定义。

     同一维度内多选取并集，维度之间取交集，再与搜索框取交集。空掉的职业小节由
     builds/style.css 那条 :has() 自己收起，空掉的类别大节由下面 filter() 里
     那段现成的分节判断收起——两者都不必为筛选另写一条。 */
  var DIMS = null;
  var vals = null;
  var picked = {};
  function facetPass(i) {
    if (!DIMS) return true;
    return DIMS.every(function (d, k) {
      var want = picked[d[0]];
      if (!want || !want.length) return true;
      return vals[i][k].some(function (v) { return want.indexOf(v) >= 0; });
    });
  }
  function facetOn() {
    return Object.keys(picked).some(function (k) { return picked[k].length; });
  }
  if (ITEM && 'facets' in cfg) {
    /* **类别不做成一行 chip**：它就是页面的大节，跳转 chip 那一排写的正是这几个
       字。同一排字出现两遍、一排能点一排也能点，读者分不出哪一排管什么。 */
    DIMS = [
      ['职业', function (it) {
        var ul = it.closest('ul');
        var h = ul && ul.previousElementSibling;
        return h ? [h.textContent.trim()] : [];
      }],
      ['分支', function (it) { return it.dataset.branch ? [it.dataset.branch] : []; }],
      ['标签', function (it) {
        return Array.prototype.map.call(it.querySelectorAll('.tags i'),
          function (t) { return t.textContent.trim(); });
      }]
    ];
    vals = mods.map(function (it) {
      return DIMS.map(function (d) { return d[1](it); });
    });
  }

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
  /* data-chip-break：chip 从这一节起另起一行。分节多到一行放不下时按内容分组，
     不交给自动折行随便断在哪（护甲模组页：五个部位一行，十一个副本一行）。 */
  var BREAK = cfg.chipBreak || '';
  var chips = sections.map(function (sec) {
    var chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = '#' + sec.id;
    /* 取标题的文字：首节点是文本就用它（神器模组页的 h2 后面还挂着别的东西），
       首节点是图标时退回整段文字——资料页的分节标题前面挂着职业徽章。 */
    var label = sec.querySelector(LABEL);
    var first = label.firstChild;
    chip.textContent = (first && first.nodeType === 3
      ? first.textContent : label.textContent).trim();
    if (BREAK && chip.textContent === BREAK) {
      var br = document.createElement('span');
      br.className = 'chip-break';
      br.setAttribute('aria-hidden', 'true');
      chipNav.appendChild(br);
    }
    chipNav.appendChild(chip);
    return chip;
  });

  /* 点一枚 chip 是在同一屏里换个位置，不是钻进去一层，所以拦下原生的片段导航、
     自己滚过去，地址栏那一段就地改写。**不然点五枚就攒五格历史**，返回键要按
     五下才出得去这一页。href 原样留着：右键复制链接、中键新开与无 JS 时照旧是
     锚点。file:// 下 replaceState 抛 SecurityError，那时只是地址栏不同步，
     滚动照旧，所以不必回退。 */
  chipNav.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a.chip');
    if (!a) return;
    var sec = document.getElementById(a.getAttribute('href').slice(1));
    if (!sec) return;
    ev.preventDefault();
    sec.scrollIntoView();
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (e) {}
  });

  if (ITEM) {
    slot.appendChild(search);
    slot.appendChild(count);
  }
  slot.appendChild(chipNav);

  /* 一个维度一行 chip。**只有一个值的维度不出行**：筛不掉任何东西，占一行还
     让人以为点了没反应。 */
  if (DIMS) {
    DIMS.forEach(function (d, k) {
      var seen = [];
      vals.forEach(function (v) {
        v[k].forEach(function (x) { if (x && seen.indexOf(x) < 0) seen.push(x); });
      });
      if (seen.length < 2) return;
      picked[d[0]] = [];
      var row = document.createElement('div');
      row.className = 'tool-facet';
      var name = document.createElement('span');
      name.className = 'facet-label';
      name.textContent = d[0];
      row.appendChild(name);
      seen.forEach(function (x) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'toggle';
        c.textContent = x;
        c.setAttribute('aria-pressed', 'false');
        c.onclick = function () {
          var w = picked[d[0]];
          var at = w.indexOf(x);
          if (at < 0) w.push(x); else w.splice(at, 1);
          c.setAttribute('aria-pressed', at < 0 ? 'true' : 'false');
          filter(search.value);
        };
        row.appendChild(c);
      });
      slot.appendChild(row);
    });
  }

  /* 命中即显示；整行三档皆不命中则整行隐藏，整节不命中则整节与其 chip 一同隐藏。
     检索期间三档并排对照关系失效，清空即恢复。 */
  function filter(query) {
    var terms = words(query);
    var hits = 0;
    /* **值没变就不写。**`hidden` 对应 display:none，写一次就要重排整张表；
       weapon-perks 有 413 行，删掉一个字往往只有几行的可见状态真的变了。 */
    mods.forEach(function (mod, i) {
      var on = hit(text[i], terms) && facetPass(i);
      if (mod.hidden === on) mod.hidden = !on;
      if (on) hits++;
    });
    rows.forEach(function (row) {
      row.hidden = !row.querySelector(ITEM + ':not([hidden])');
    });
    /* 横幅行独占一个 tbody，同组的数据行跟在它后面：整组都被搜没了就一并收起，
       不留一条光杆组名。 */
    lanes.forEach(function (lane) {
      lane.hidden = !lane.parentNode.querySelector('tr:not(.lane):not([hidden])');
    });
    subs.forEach(function (h) {
      h.hidden = !h.nextElementSibling.querySelector('li:not([hidden])');
    });
    /* 本来就没有条目的分节不参与过滤：增伤页的「世界与活动」整节是几段规则、
       一个条目都没有，按「没有可见条目就收起」判会在第一次敲搜索框时整节消失，
       且清空查询也回不来（空查询让条目全部可见，这一节仍然是零条目）。 */
    sections.forEach(function (sec, i) {
      var scope = ROW || ITEM;
      var empty = !!sec.querySelector(scope) && !sec.querySelector(scope + ':not([hidden])');
      sec.hidden = empty;
      chips[i].hidden = empty;
    });
    count.textContent = (query.trim() || facetOn()) ? hits + ' / ' + mods.length : '';
    /* 搜了但一个都没命中时给工具条打一位，搜索框与计数据此转红：灰着看
       0 / 147 与 3 / 147 长得一样。清空查询即撤销，没搜过也不算空结果。 */
    slot.toggleAttribute('data-miss', (!!query.trim() || facetOn()) && !hits);
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

  /* 从首页的全站搜索点进来时带着 ?q=：预填并过滤一次，落点交给浏览器按 # 锚点滚。
     **先过滤再滚**——defer 脚本在解析完成后、锚点定位前执行，顺序天然是对的；
     反过来滚完再隐藏行，读者会停在错位的地方。 */
  var came = new URLSearchParams(location.search).get('q');
  if (came && ITEM) {
    search.value = came;
    filter(came);
  }

  measure();
  watch();
  onResize(function () { measure(); watch(); });
})();
