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
  /* **属性写成空串与整个不写是两回事**：不写才回落到神器模组页那套缺省，写空串
     表示这一页没有分节。以前两者都走 `||`，空串静默落到 '.artifact' 上。站上此刻
     没有页面写空的 data-section（配装索引页按场景分了六节），空的是 data-label
     ——那一维走同一条判据，见下面 LABEL。 */
  var HAS_SEC = 'section' in cfg;
  var SEC = HAS_SEC ? cfg.section : '.artifact';
  /* 只给 data-section、不给 data-item 的页面走「只有跳转 chip」这一档：
     资料页的条目是表格行，行之间有 rowspan 合并，按行隐藏会把合并块豁开。
     那里要的是快速跳转，不是检索。 */
  var ITEM = cfg.item || (HAS_SEC ? '' : '.mod');
  var ROW = cfg.row || (HAS_SEC ? '' : '.mod-row');
  /* data-label="" 表示不出跳转 chip，与 data-section="" 同一条写法：属性不写
     才回落到缺省。配装索引页的大节就是场景，而场景那一排开关已经在页面上，
     再出一排跳转 chip 就是同一批字的第二个来源。 */
  var LABEL = 'label' in cfg ? cfg.label : '.art-head h2';
  var NOUN = cfg.noun || '模组';
  /* 选择器为空串时 querySelectorAll 直接抛，不能只靠它返回空表。 */
  var sections = SEC ? Array.prototype.slice.call(document.querySelectorAll(SEC)) : [];
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

  var rows = ROW ? Array.prototype.slice.call(document.querySelectorAll(ROW)) : [];
  var mods = ITEM ? Array.prototype.slice.call(document.querySelectorAll(ITEM)) : [];

  /* 没有工具条，或者既没有分节也没有条目——两样都没有才没得可做。
     **不能只判分节。**配装索引页曾经是一张网格、一个分节都没有，按分节判会在
     这里整个返回：搜索框、计数、四维筛选一件都不建，页面只剩一面卡墙。三道闸门
     与 npm test 当时全是绿的——它们看不见运行时。那一页后来又分了节，但判据留着：
     它管的是「有工具条却没分节」这一类页面，不专为某一页。 */
  if (!slot || (!sections.length && !mods.length)) {
    measure();
    return;
  }

  /* 表内横幅行是组名不是条目，不参与命中，改为跟着自己那一组的可见行走 */
  var lanes = ITEM ? Array.prototype.slice.call(document.querySelectorAll('tr.lane')) : [];
  /* 分节里再分的小标题（配装索引页的职业），跟着紧随其后那一组的可见条目走。
     **这一条只能在 JS 里做**：CSS 要写成 .sub-label:has(+ ul:not(:has(> li:not([hidden]))))，
     而 :has() 不许再套 :has()，整条是无效选择器——写在样式表里不报错也不生效。 */
  var subs = ITEM ? Array.prototype.slice.call(document.querySelectorAll('.sub-label')) : [];
  /* 上百个条目，每次按键都取 textContent 会重复遍历整棵子树，先缓存。
     直接存小写：`hit()` 要的就是它，每次按键再转一遍是几十万字符的临时垃圾。 */
  var text = mods.map(function (mod) { return mod.textContent.toLowerCase(); });

  /* 光杆小标题收起来。**首屏就要跑一次，不能只等 filter()**：那一份只在带 ?q=
     时跑，平常进页面从不跑，于是配装索引页上「本节没有、但别节属于本场景」的
     职业会挂着一个空标题加一张空网格，读者搜一下或点一次筛选才消失。
     生成器那一侧不能不出这一节：选定某个场景时 regroup() 要把别节的卡搬进来
     （raid、地牢 那批搬进地牢），得有落点。 */
  function trimSubs() {
    subs.forEach(function (h) {
      var ul = h.nextElementSibling;
      h.hidden = !(ul && ul.querySelector('li:not([hidden])'));
    });
  }
  trimSubs();

  /* 维度筛选（.toolbar 带 data-facets 的页面：配装索引页）。声明式：
     `显示名=data 键[:修饰]`，分号隔开，例如

         场景=scene:single:groups;强度=tier:single;职业=cls:tuck;分支=branch:tuck;标签=tag:tuck

     取值一律从卡片的 data-* 上读，多值用制表符隔开（生成器写 &#9;）。**这里不
     认识任何一页的词表**：加一维、改一维的取值都只改生成器，这段不动。以前三
     个维度各有一个提取器（读上一级标题、读 data-branch、读 .tags 里的 <i>），
     其中两个绑死在配装索引页的 DOM 形状上。

     三个修饰：
       :single  一次只选一个。数据侧本来就近似单选的那两维（场景、强度）用它。
       :groups  分节就是按这一维分的。选定单一值时，重叠的那几节并成一张网格
                （场景重叠：raid、地牢 那批自成一节，点 raid 时并进 raid）。
       :tuck    收进工具条那块共用面板，不给它正文里的常驻一排。低频检索的那几维
                （职业、分支、标签）用它：常驻一排一维一行，四行顶掉首屏，而这
                几维十次里有九次没人碰。

     **控件放哪由页面说了算**：页面给了 [data-facet="维度名"] 的空容器就填在那里，
     没给且带 :tuck 的收进共用面板。取值一律扫全部卡片，不随别的维收窄——控件因此
     是常驻的，不会在读者没碰它的时候自己少几枚或整个消失。

     同一维度内多选取并集，维度之间取交集，再与搜索框取交集。 */
  var DIMS = null;
  var vals = null;
  var picked = {};
  function dimPass(i, k) {
    var want = picked[DIMS[k].name];
    if (!want || !want.length) return true;
    return vals[i][k].some(function (v) { return want.indexOf(v) >= 0; });
  }
  function facetPass(i) {
    if (!DIMS) return true;
    return DIMS.every(function (d, k) { return dimPass(i, k); });
  }
  function facetOn() {
    return Object.keys(picked).some(function (k) { return picked[k].length; });
  }
  if (ITEM && cfg.facets) {
    DIMS = cfg.facets.split(';').map(function (spec) {
      var half = spec.split('=');
      var mod = half[1].split(':');
      return { name: half[0], key: mod[0],
               single: mod.indexOf('single') > 0,
               /* 收进工具条那块共用面板，不占正文的常驻竖向空间。 */
               tuck: mod.indexOf('tuck') > 0,
               /* 分节就是按这一维分的：选定单一值时把重叠的那几节并成一张网格。 */
               groups: mod.indexOf('groups') > 0 };
    });
    vals = mods.map(function (it) {
      return DIMS.map(function (d) {
        var v = it.dataset[d.key];
        return v ? v.split('\t') : [];
      });
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
  var chips = LABEL ? sections.map(function (sec) {
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
  }) : [];

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
    /* **瞬间到位，不吃全局那条 scroll-behavior: smooth。**读者点这一枚时已经挑定了
       去处，中间那一段没人看；而这些页面动辄一万几千像素（护甲模组页 14900、
       神器模组页 16700、护甲套装页 28700），一次平滑滚动只是一片模糊，还会把途经
       的每个分节挨个点亮一遍。正文里的锚点链接不受影响，照旧平滑。 */
    sec.scrollIntoView({ behavior: 'instant' });
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (e) {}
  });

  if (ITEM) {
    slot.appendChild(search);
    slot.appendChild(count);
  }
  /* 一枚跳转 chip 都没有时不挂这一层：它是 .toolbar 的 flex 项，空着照样吃掉
     一个 18px 的 gap，工具条右端因此空出一块。 */
  if (chips.length) slot.appendChild(chipNav);

  /* 每一维一个控件。**放哪由页面说了算**：页面给了 [data-facet="维度名"] 的空
     容器，就填在那里（配装索引页的场景——主轴，摊开成一排居中的素字开关）；
     没给就在工具条上出一个下拉框。app.js 因此不认识任何一维的名字。

     下拉框用 <details> 而不是 popover：popover 白拿点外面关闭、Esc 与 top layer，
     但定位要靠 CSS anchor positioning，那个还不是 Baseline（Firefox 仍在 flag
     后），面板会掉到视口正中，位置还得自己算。<details> 的开关、键盘与无障碍
     全部原生正确，面板在正常流里不必定位，只缺「点外面关掉」——那是下面六行。
     等 anchor positioning 进了 Baseline 再换。

     **只有一个值的维度整个不出**：筛不掉任何东西，占一格还让人以为点了没反应。 */
  /* 收起来的那几维共用一枚触发器与一块面板。**一维一枚下拉不行**：工具条上会排着
     几个长得一样、点开才知道是什么的控件，而其中「标签」那一维原先还随场景现算
     取值，没选场景时整个控件不出——控件凭空出现又凭空消失，读者学不会。合成一枚
     之后，面板一展开三组全在眼前，收起来只占一枚控件的宽度。 */
  var tuckBox = null;
  var tuckTally = null;
  function tuckHost() {
    if (!tuckBox) {
      /* 面板坐哪也由页面说了算，与 [data-facet="维度名"] 同一条：页面给了
         [data-facet-tuck] 就坐那儿，没给就退回工具条。 */
      var seat = document.querySelector('[data-facet-tuck]') || slot;
      tuckBox = seat.appendChild(document.createElement('details'));
      tuckBox.className = 'drop';
      var sum = document.createElement('summary');
      sum.className = 'toggle';
      sum.textContent = '筛选';
      /* 选了几项写在触发器上：面板收起来之后，不标出来就看不见还筛着。
         三维合一枚触发器，所以这个数是三维之和。 */
      tuckTally = sum.appendChild(document.createElement('b'));
      tuckBox.appendChild(sum);
      var menu = tuckBox.appendChild(document.createElement('div'));
      menu.className = 'menu';
    }
    return tuckBox.querySelector('.menu');
  }

  /* 触发器上的计数，以及面板自己的存亡：三维的取值都少于两个时（合集页那七张卡
     就可能这样），留一枚点开是空的触发器不如整个不出。 */
  function syncTuck() {
    if (!tuckBox) return;
    var n = 0;
    var live = false;
    DIMS.forEach(function (d) {
      if (d.bar) return;
      n += picked[d.name].length;
      if (!d.host.hidden) live = true;
    });
    tuckTally.textContent = n ? String(n) : '';
    tuckBox.hidden = !live;
  }

  if (DIMS) {
    /* **先把五维的宿主与选中表铺齐，再逐维画**。syncTuck() 每次都数遍所有维度，
       边建边画的话第一维画完就去读还没建到的那几维，读到 undefined。 */
    DIMS.forEach(function (d) {
      picked[d.name] = [];
      var page = document.querySelector('[data-facet="' + d.name + '"]');
      d.bar = !!page;
      d.host = page || tuckHost().appendChild(document.createElement('div'));
      if (!page) d.host.className = 'tuck-row';
    });
    DIMS.forEach(function (d, k) { paint(k); });
    /* 点面板以外的地方关掉下拉框。<details> 唯一不白送的一件。 */
    document.addEventListener('click', function (ev) {
      if (tuckBox && tuckBox.open && !tuckBox.contains(ev.target)) tuckBox.open = false;
    });
  }

  function scan(k) {
    /* 第 k 维的取值，一律扫全部卡片。**不随别的维收窄**：跟着别的维变的话，读者
       没碰这一维，它却自己少了几枚甚至整个消失。取值固定下来，控件就是常驻的。 */
    var seen = [];
    vals.forEach(function (v) {
      v[k].forEach(function (x) { if (x && seen.indexOf(x) < 0) seen.push(x); });
    });
    return seen;
  }

  /* 选中态就地改，不重画：重画会把展开着的下拉框合上，勾第二项就没法勾了。 */
  function sync(d) {
    var on = picked[d.name];
    Array.prototype.forEach.call(d.host.querySelectorAll('button'), function (b) {
      /* 「全部」那一枚没有 data-v，它的按下态就是「这一维一个都没选」。 */
      b.setAttribute('aria-pressed',
        (b.dataset.v === undefined ? !on.length : on.indexOf(b.dataset.v) >= 0)
          ? 'true' : 'false');
    });
    if (!d.bar) syncTuck();
  }

  /* 分节按场景分，而场景是重叠的：84 篇里有 21 篇同时属于 raid 与地牢，它们
     自成一节。**选定单一场景时把重叠的那批并进去**——点 raid 就该看见一张 25 张
     的网格，而不是「raid 4 张」加下面另一节 21 张。

     搬的是卡不是复制：DOM 里每张卡始终只有一份，点赞、计数与截图都只算一次。
     原位置记在卡自己身上，回到「全部」时放回去。判据取自分节的 data-scene，
     这里不再写一份场景表。 */
  /* 加载时就有条目的那些分节。见 filter() 里那段：判据必须取这一刻。 */
  var hadItems = sections.map(function (sec) { return !!sec.querySelector(ROW || ITEM); });

  // 与上面取 sections 那一处同一道守卫：SEC 是空串时拼出来的 ' .entries' 不抛，
  // 直接命中全文档，regroup() 会去搬不属于任何分节的卡。
  var lists = SEC
    ? Array.prototype.slice.call(document.querySelectorAll(SEC + ' .entries')) : [];
  /* 每张卡记下它的原属列表与全局次序。**次序要记**：搬走再搬回来时不能拿
     「原来的下一个兄弟」当锚点——那个兄弟自己可能也搬走了，此刻不在目标列表里，
     insertBefore 会抛 NotFoundError（配装索引页 raid/猎人 那 13 张里相邻的组合卡
     一大片，必然撞上）。改成搬完之后按 ord 重排，锚点问题不存在。 */
  var seq = 0;
  lists.forEach(function (ul) {
    Array.prototype.forEach.call(ul.children, function (li) {
      li.from = ul;
      li.ord = seq++;
    });
  });

  function regroup(want) {
    if (!lists.length) return;
    /* 落点按「同一节、同一个职业小节」找：合并发生在小节这一层，点 raid 之后
       仍只有一组「猎人/泰坦/术士」。生成器保证落点存在——每个场景节的小节按
       这个场景下所有配装的职业集合出，不只按本节现有的那些。 */
    function landing(li) {
      var to = null;
      lists.forEach(function (ul) {
        var own = (ul.parentNode.dataset.scene || '').split('\t');
        if (own.length === 1 && own[0] === want && ul.dataset.cls === li.dataset.cls) to = ul;
      });
      return to;
    }
    lists.forEach(function (ul) {
      Array.prototype.slice.call(ul.children).forEach(function (li) {
        var to = (want && (li.dataset.scene || '').split('\t').indexOf(want) >= 0
          && landing(li)) || li.from;
        if (li.parentNode !== to) to.appendChild(li);
      });
    });
    /* appendChild 只保证落在末尾，不保证顺序，所以搬完再按 ord 重排一遍——
       生成器排好的「强度在前、同档按时间降序」因此在搬进搬出之后仍然成立。
       appendChild 对已在本列表里的节点就是移到末尾，不必先摘。 */
    lists.forEach(function (ul) {
      Array.prototype.slice.call(ul.children)
        .sort(function (a, b) { return a.ord - b.ord; })
        .forEach(function (li) { ul.appendChild(li); });
    });
  }

  function pick(d, k, x) {
    var w = picked[d.name];
    var at = w.indexOf(x);
    /* :single 维点第二枚即换掉第一枚，再点自己即清空；x 为 null 是「全部」。
       数据侧一套配装只有一个场景，读者侧也就没有多选它的道理。 */
    if (x === null) picked[d.name] = [];
    else if (d.single) picked[d.name] = at < 0 ? [x] : [];
    else if (at < 0) w.push(x); else w.splice(at, 1);
    sync(d);
    /* 分节的依据就是这一维时，选定单一值即把重叠的那几节并成一张网格。 */
    if (d.groups) regroup(picked[d.name].length === 1 ? picked[d.name][0] : '');
    filter(search.value);
  }

  function paint(k) {
    var d = DIMS[k];
    var seen = scan(k);
    picked[d.name] = picked[d.name].filter(function (x) { return seen.indexOf(x) >= 0; });
    d.host.textContent = '';
    d.host.hidden = seen.length < 2;
    if (d.host.hidden) { if (!d.bar) syncTuck(); return; }
    paintBar(d, k, seen);
    sync(d);
  }

  function chipFor(d, k, text, value) {
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'toggle';
    c.textContent = text;
    if (value !== null) c.dataset.v = value;
    c.setAttribute('aria-pressed', 'false');
    c.onclick = function () { pick(d, k, value); };
    return c;
  }

  /* 正文那两排与面板里那三组同一个画法：维度名 + 一排素字开关。两处只差「全部」
     那一枚与容器给的密度，不为面板另开一套控件——读者也就不必学两种。 */
  function paintBar(d, k, seen) {
    var name = document.createElement('span');
    name.className = 'facet-label';
    name.textContent = d.name;
    d.host.appendChild(name);
    /* 「全部」排在最前，是这一维的默认态而不是第六个值：它不筛任何东西，
       按下即清空。不给它一个位置的话，选了场景就再也回不到全部。
       多选的那几维不给：点第二下即取消，一枚一枚点掉就是清空。 */
    if (d.single) d.host.appendChild(chipFor(d, k, '全部', null));
    seen.forEach(function (x) { d.host.appendChild(chipFor(d, k, x, x)); });
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
    trimSubs();
    /* 本来就没有条目的分节不参与过滤：增伤页的「世界与活动」整节是几段规则、
       一个条目都没有，按「没有可见条目就收起」判会在第一次敲搜索框时整节消失，
       且清空查询也回不来（空查询让条目全部可见，这一节仍然是零条目）。
       **判据取加载那一刻，不是现在**：配装索引页会把卡搬进别的节（regroup），
       搬空的那一节现在查也是零条目，按现在判它就永远收不起来。 */
    sections.forEach(function (sec, i) {
      var scope = ROW || ITEM;
      var empty = hadItems[i] && !sec.querySelector(scope + ':not([hidden])');
      sec.hidden = empty;
      if (chips[i]) chips[i].hidden = empty;
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

  /* rootMargin 依赖实测的 stick，改了要重建观察者。

     **没有跳转 chip 就不建**：观察者存在的唯一目的是让 mark() 点亮当前那一枚，
     配装索引页 data-label 给的是空串、chips 是空表，建了也只是每次 resize
     断开重连一遍，看不出任何效果。 */
  function watch() {
    if (io) io.disconnect();
    if (!chips.length) return;
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
