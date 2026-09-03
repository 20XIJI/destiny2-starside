/* 配装填表页。

   页面是**与详情页同构的空槽版面**：骨架由 tools/convert-build.py 的 render_new()
   出，类名与详情页完全一样，这里只负责把空槽填成成品格。填完了页面就是成品，
   不另做一份预览。

   两条既有决策保留：
   1. **候选不写进 HTML**——两千条选项写进来就是把词表抄了第二份，由 builds/vocab.js
      建。词表与生成器查的是同一份，所以这里列得出来的名字，生成器一定查得到。
   2. **不做前端校验**——星相与碎片的联动、模组能耗、六维配点都是每季会变的游戏
      规则，写进前端等于把同一套规则写两遍。这一页负责好填，正确性由生成器的闸门兜底。

   候选按 kind 收窄，不按元素页收窄：棱镜把各子职业的技能拼在一起，一套棱镜配装的
   超能可能来自烈日页、手雷来自电弧页（vocab.pick 的 prefer 是偏好不是限制）。
   按页面硬筛会把这些正确的选项藏掉，所以元素页那五个槽只把本分支的排在前面。 */
(function () {
  'use strict';

  var V = window.starsideVocab;
  var sheet = document.getElementById('sheet');
  var out = document.getElementById('out');
  if (!V || !sheet || !out) return;

  var UP = '../../';                       // 填表页在 builds/new/，图标路径按站根写
  var BRANCH = { 电弧: 'arc', 烈日: 'solar', 虚空: 'void',
                 冰影: 'stasis', 缚丝: 'strand', 棱镜: 'prismatic' };
  var PARTS = ['头盔', '护臂', '胸甲', '腿部', '职业物品'];
  var STATS = ['生命', '近战', '手雷', '超能', '职业', '武器'];
  // 槽位 → 该槽只收哪一类。元素页那一份列表里混着六页的全部条目，超能框因此
  // 曾经列着 99 个碎片；分节名（kind）本来就分得开，按它收一道即可。
  var KIND = { 超能: '超能技能', 手雷: '手雷技能', 近战: '近战技能',
               星相: '星相', 碎片: '碎片', 职业: '分节' };
  var BY_CLASS = { 职业技能: 1, 异域护甲: 1 };   // 候选跟着所选职业走
  var CLASS_ORDER = ['猎人', '泰坦', '术士'];   // 站内每一处都是这个次序
  // 词表里有两类行不是能选进配装的东西，只有点名收掉：
  // kind「分节」是分节标题（三个职业那三条由头部那排 chip 在用，所以不能从词表里
  // 删，只能在这里按槽位挡掉）；「固有 Perk」是职业的先天优势（猎人基础疾跑
  // 8.5 米每秒），写在职业技能那一页上，但不是可选的职业技能。
  var SKIP_NAME = { '固有 Perk': 1 };
  var TIER_CN = ['', '一级', '二级', '三级'];
  var ELEM = { 超能: 1, 手雷: 1, 近战: 1, 星相: 1, 碎片: 1 };
  var state = { 职业: '', 分支: '', 神器: '', 核心: '' };
  var picker = null;

  var ELEM_CN = { arc: '电弧', solar: '烈日', void: '虚空',
                  stasis: '冰影', strand: '缚丝', prismatic: '棱镜' };
  // 元素的次序取站内那一套（vocab.py 的 ELEM_PAGES、convert-build.py 的 BRANCH
  // 都是这个顺序），不另定一个。
  var ELEM_ORDER = Object.keys(BRANCH).map(function (n) { return 'elements/' + BRANCH[n]; });

  function bare(kind) { return String(kind || '').split(' (')[0].trim(); }

  /* 候选行右下角那一行小字。元素页上的条目标它属于哪个子职业——一个棱镜配装的
     碎片可以来自六页中的任何一页，「碎片」两个字每行重复一遍没有信息量。
     颜色已经把元素说了一遍，但颜色不该独自承担语义，所以这里写成字。
     其余槽位标分节名：武器类别、护甲部位、异域的职业，都是要分辨的信息。 */
  function tag(row) {
    // 神器模组标档位：选择器按神器盘摆成 7 列 × 3 行，那一行小字说的就是「几级」。
    // 分节名（「废墟石板 (异端)」）在这里每行重复一遍没有信息量，神器已经选定了。
    if (row[6]) return TIER_CN[Number(row[6].split(',')[1])] || '';
    var m = /^elements\/([a-z]+)$/.exec(row[2] || '');
    return m && ELEM_CN[m[1]] ? ELEM_CN[m[1]] : bare(row[1]);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* 一个槽位的候选。row = [名字, 分节, 页面, 图标, 着色, 副名]。 */
  function options(slot, kind) {
    var all = V.lists[V.slots[slot]] || [];
    var want = kind && kind !== '__art__' ? kind : KIND[slot];
    var hits = all.filter(function (r) {
      if (want) {
        if (bare(r[1]) !== want) return false;
      } else if (r[1] === '分节' || SKIP_NAME[r[0]]) {
        return false;
      }
      // 只挡「另外两个职业的」，不挡「不按职业分的」：异域护甲里还有三件永劫教派
      // 的学派护甲与六条通用词条，谁都能穿；按「不等于本职业就丢」筛会把它们
      // 整批藏掉，而 vocab.pick 明明查得到。
      if (BY_CLASS[slot] && state.职业
          && CLASS_ORDER.indexOf(r[1]) > -1 && r[1] !== state.职业) return false;
      return true;
    });
    // 排序四层：本分支的一页、元素、族、名字。
    // **同元素排在一块**：一格手雷混着六个元素的三十几枚，按名字排会把同元素的
    // 拆散（电弧、冰影、虚空、电弧、电弧…），扫读时找不着自己那一族。
    // **同族排在一块**：护甲模组一格里混着弹药生成、抗性、稳定瞄准三四个族，
    // 副名就是族名（电弧虹吸的副名是「虹吸」）。
    var mine = ELEM[slot] && state.分支 ? 'elements/' + BRANCH[state.分支] : '';
    hits.sort(function (a, b) {
      // 本分支那一页排最前，其余照旧列出——棱镜的技能本来就散在六页上。
      if (mine) {
        var d = (b[2] === mine) - (a[2] === mine);
        if (d) return d;
      }
      // 神器模组按神器盘的读法排：先一级那一行，再二级、三级。DOM 次序因此与
      // 格子摆出来的次序一致——回车选第一条时，选中的就是眼睛看到的第一格。
      if (a[6] && b[6]) {
        var pa = a[6].split(','), pb = b[6].split(',');
        if (pa[1] !== pb[1]) return pa[1] - pb[1];
        return pa[0] - pb[0];
      }
      // 跟职业绑定的槽位按猎人、泰坦、术士排；其余按元素页的站内次序排。
      var ka = BY_CLASS[slot] ? CLASS_ORDER.indexOf(a[1]) : ELEM_ORDER.indexOf(a[2]);
      var kb = BY_CLASS[slot] ? CLASS_ORDER.indexOf(b[1]) : ELEM_ORDER.indexOf(b[2]);
      if (ka !== kb && ka > -1 && kb > -1) return ka - kb;
      var fa = a[5] || '', fb = b[5] || '';
      if (fa !== fb) return fa.localeCompare(fb, 'zh-Hans');
      return a[0].localeCompare(b[0], 'zh-Hans');
    });
    return hits;
  }

  /* 七件神器走自己那份列表（tools/artifacts.json 蒸馏来的），带本体的真图。
     不再从模组的分节名反查——那样只得到七个名字，选择器里是七个素格子。 */
  function artifacts() {
    return (V.lists['神器本体'] || []).slice().sort(function (a, b) {
      return a[0].localeCompare(b[0], 'zh-Hans');
    });
  }

  /* 成品格的内容：与详情页 item() 出的那一份逐字同形。 */
  function body(row, slot, size, label) {
    var img = row[3] ? '<img src="' + UP + row[3] + '" alt="" width="' + size
      + '" height="' + size + '" loading="lazy">' : '';
    // label 换掉显示的名字，行仍是查出来那一条：元素那一格查的是分支页上「那个
    // 职业」的分节图，显示的却该是分支名。与生成器 item(label=) 同一个约定。
    var shown = label || row[0];
    var nm = row[4] ? '<span class="' + row[4] + '">' + esc(shown) + '</span>'
      : esc(shown);
    var sub = row[5] ? '<span class="sub">' + esc(row[5]) + '</span>' : '';
    var pc = slot === '套装' ? '<span class="pc">' + esc(row[1]) + '</span>' : '';
    return img + '<span class="nm">' + nm + sub + pc + '</span>';
  }

  /* 身份那两格是镜像，不是选择器：职业与分支由页头那两排 chip 定，这里照着显示。
     详情页在铭牌与正文各出一次，填表页因此也出两次，两页仍然同构。
     元素那一格没有自己的图——站内没有单画一套分支图，用的是分支页上「那个职业」
     的分节图，一枚图同时编码职业与元素（虚空页的猎人那枚就是猎人形 + 虚空色）。 */
  function rowOf(slot, ok) {
    return (V.lists[V.slots[slot]] || []).filter(ok)[0];
  }

  function mirror() {
    var cls = state.职业, br = state.分支;
    var self = cls && rowOf('职业', function (r) {
      return r[0] === cls && r[1] === '分节';
    });
    put('职业', self, '');
    put('元素', cls && br && rowOf('元素', function (r) {
      return r[0] === cls && r[1] === '分节' && r[2] === 'elements/' + BRANCH[br];
    }), br);
    // 页头的铭牌与详情页同形：职业图 + 职业 · 分支。它照着下面那两格显示，
    // 两样都选定才成句，只选了一样时仍写提示——半句「术士 ·」读不出缺什么。
    var id = sheet.querySelector('[data-mirror="铭牌"]');
    id.innerHTML = cls && br
      ? (self && self[3] ? '<img src="' + UP + self[3] + '" alt="" width="32" '
        + 'height="32">' : '') + esc(cls) + ' · <span class="el-' + BRANCH[br]
        + '">' + esc(br) + '</span>'
        // 类别选了才接上去：详情页的铭牌是「职业 · 元素 · 类别」，这里逐段跟上。
        + (val('类别') ? ' · ' + esc(val('类别')) : '')
      : '<span class="hint">职业与元素在下面「职业」那一格选</span>';
  }

  function put(name, row, label) {
    var el = sheet.querySelector('[data-mirror="' + name + '"]');
    if (!el) return;
    el.classList.toggle('empty', !row);
    el.innerHTML = row ? body(row, name, 32, label)
      : '<span class="nm">' + name + '</span>';
  }

  /* 元素那一格列六个分支：站内没有单画一套分支图，用的是分支页上「那个职业」的
     分节图，所以候选是当前职业在六页上的那六条，显示的名字换成分支名。 */
  /* 分支色是 #sheet 上的一个类，预览态也是。整句覆盖 className 会把另一个抹掉。 */
  function setBranch(br) {
    Object.keys(BRANCH).forEach(function (n) {
      sheet.classList.remove('b-' + BRANCH[n]);
    });
    if (br) sheet.classList.add('b-' + BRANCH[br]);
  }

  function branches() {
    return Object.keys(BRANCH).map(function (n) {
      return rowOf('元素', function (r) {
        return r[0] === state.职业 && r[1] === '分节'
          && r[2] === 'elements/' + BRANCH[n];
      });
    }).filter(Boolean);
  }

  /* 核心的候选：本页已经配好的每一件东西，按页面次序去重。没有图的（位移技能）
     不列——核心就是页首那枚 96px 的图。 */
  function coreList() {
    var seen = {};
    return [].filter.call(sheet.querySelectorAll('button.item'), function (c) {
      if (!c.row || !c.row[3] || seen[c.row[0]]) return false;
      seen[c.row[0]] = 1;
      return true;
    }).map(function (c) { return c.row; });
  }

  function iconSize(btn) {
    // 神器选择器落在面板标题位上，图与详情页标题里那枚 .gl-img 同为 32px。
    if (btn.closest('h3')) return 32;
    if (btn.classList.contains('perk-cell')) return 24;
    return /\b(gun|gear|set)\b/.test(btn.className) ? 56 : 32;
  }

  function fill(btn, row) {
    btn.row = row || null;
    if (!row) {
      btn.classList.add('empty');
      btn.innerHTML = '<span class="nm">' + (btn.dataset.label || '+') + '</span>';
    } else {
      btn.classList.remove('empty');
      btn.innerHTML = body(row, btn.dataset.slot, iconSize(btn));
    }
    mark(btn, row);
    write();
  }

  /* 悬停详情认的是 data-d，值是「页面\t名字\t分节」——与生成器写在详情页格子上
     的那一个同形，面板那一份实现（builds/tip.js）因此不必认识行与槽位。 */
  function mark(el, row) {
    if (row && row[2]) el.dataset.d = row[2] + '\t' + row[0] + '\t' + row[1];
    else delete el.dataset.d;
  }

  // 候选要先有前提时给的那一句，与 open() 里 wait 的三个分支一一对应。
  // 核心是大多数人第一个点的格子，而它只列本页已经配好的东西，空着时不说
  // 这一句就是一个没有理由的空格网。
  var MISS = {
    元素: '先选职业',
    神器: '先选一件神器',
    核心: '先填配装，核心从配装词条中选取',
  };

  /* 选择器整行展开在它那一行下面：一格只有一百来像素宽，图标网格塞不进去。 */
  function close() {
    if (!picker) return;
    var owner = picker.owner;
    // 面板可能正挂在选择器的末栏上，跟着一起摘掉就成了指着不在的父节点的孤儿。
    if (window.starsideTip) window.starsideTip.hide();
    picker.remove();
    picker = null;
    if (owner) owner.setAttribute('aria-expanded', 'false');
  }

  function open(btn) {
    var slot = btn.dataset.slot, kind = btn.dataset.kind || '';
    var same = picker && picker.owner === btn;
    close();
    if (same) return;

    var list = kind === '__art__' ? artifacts()
      : slot === '核心' ? coreList()
      : slot === '元素' ? branches()
      : options(slot, kind);
    if (btn.dataset.only) {
      list = list.filter(function (r) {
        return r[0].slice(-btn.dataset.only.length) === btn.dataset.only;
      });
    }
    // 神器模组按所选那一件限定。没选之前不列——七件神器各 21 枚，混在一起是
    // 147 条，且它们在神器盘上的位置一件一套，摆出来会七枚叠在同一格。
    // 这三格的候选都要先有前提：神器模组按所选那一件收，元素按所选职业收
    //（用的是分支页上「那个职业」的分节图），核心只列本页已经配好的东西。
    // 没有前提时给一句话，不给一个空格网；那句话在 MISS 一处定义。
    var wait = (slot === '神器' && kind !== '__art__' && !state.神器)
      || (slot === '元素' && !state.职业)
      || (slot === '核心' && !list.length);

    var box = document.createElement('div');
    box.className = 'picker';
    box.owner = btn;

    var bar = document.createElement('div');
    bar.className = 'picker-bar';
    var find = document.createElement('input');
    find.type = 'search';
    find.className = 'tool-search';
    find.placeholder = '搜索' + (kind === '__art__' ? '神器' : slot);
    find.setAttribute('aria-label', '搜索' + slot);
    var count = document.createElement('p');
    count.className = 'tool-count';
    count.setAttribute('role', 'status');
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'chip';
    clear.textContent = '清空这一格';
    clear.addEventListener('click', function () { pickOne(btn, null); });
    bar.appendChild(find);
    bar.appendChild(count);
    bar.appendChild(clear);

    var grid = document.createElement('ul');
    grid.className = 'picker-grid';

    function draw(q) {
      var terms = window.starsideMatches;
      var hits = list.filter(function (r) {
        return !q || (terms ? terms(r[0] + ' ' + r[1], q)
          : (r[0] + r[1]).toLowerCase().indexOf(q.toLowerCase()) > -1);
      });
      // 神器模组照神器盘摆：列是神器那七行，纵向是一/二/三级，位置由词表的 pos 给。
      // **搜出来的结果不摆**——一次只剩两三条时，21 格里空 18 格比排成一行更难看。
      // 位置在一件神器之内才唯一，所以还要求这一批全是同一件神器的，不然会叠格。
      var one = hits.length && hits.every(function (r) {
        return r[6] && bare(r[1]) === bare(hits[0][1]);
      });
      var pan = !q && hits.length > 1 && one;
      grid.classList.toggle('art', pan);
      grid.textContent = '';
      if (wait) {
        count.textContent = MISS[slot];
        box.setAttribute('data-miss', '');
        return;
      }
      hits.slice(0, 240).forEach(function (r) {
        var li = document.createElement('li');
        if (pan) {
          var at = r[6].split(',');
          li.style.gridColumn = Number(at[0]) + 1;
          li.style.gridRow = at[1];
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.className = btn.className.replace(/\bempty\b/, '').trim();
        // 元素那一格的行是「某职业在某元素页上的分节」，名字要显示成分支名；
        // 那时右下角再标一遍元素就成了同一个词说两遍。
        var el = slot === '元素' ? tag(r) : '';
        b.innerHTML = body(r, slot, iconSize(btn), el)
          + (el ? '' : '<span class="kd">' + esc(tag(r)) + '</span>');
        b.row = r;
        mark(b, r);          // 悬停详情认的是 data-d，与成品格同形
        b.addEventListener('click', function () { pickOne(btn, r); });
        li.appendChild(b);
        grid.appendChild(li);
      });
      count.textContent = hits.length + ' 条'
        + (hits.length > 240 ? '，列出前 240' : '');
      box.toggleAttribute('data-miss', !hits.length);
    }

    find.addEventListener('input', function () { draw(find.value.trim()); });
    find.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); btn.focus(); }
      if (e.key === 'Enter') {
        var first = grid.querySelector('button');
        if (first) first.click();
      }
    });
    draw('');
    box.appendChild(bar);
    box.appendChild(grid);
    // 核心那一格在页头里，不在任何 .slot-row / .block 下面
    (btn.closest('.slot-row') || btn.closest('.block') || btn.closest('.build-head'))
      .insertAdjacentElement('afterend', box);
    picker = box;
    btn.setAttribute('aria-expanded', 'true');
    find.focus();
  }

  /* 选中一条（row 为 null 即清空这一格）。职业、元素、核心三格不走 fill()：
     它们的显示由 state 算出来，画由 mirror() 与 syncCore() 各自一处负责。 */
  function pickOne(btn, row) {
    var slot = btn.dataset.slot;
    if (slot === '职业' || slot === '元素') {
      state[slot === '职业' ? '职业' : '分支'] =
        row ? (slot === '职业' ? row[0] : tag(row)) : '';
      if (slot === '元素') {
        setBranch(state.分支);
      } else {
        // 职业一换，跟职业绑定的两个槽的候选变了，留着旧的会前后矛盾；元素那一格
        // 用的也是这个职业的分节图，由 mirror() 按新职业重画。
        [].forEach.call(sheet.querySelectorAll(
          '[data-slot="职业技能"],[data-slot="异域护甲"]'), function (c) {
          if (c.row) fill(c, null);
        });
      }
      mirror();
      close();
      write();
      btn.focus();
      return;
    }
    if (slot === '核心') {
      state.核心 = row ? row[0] : '';
      close();
      write();
      btn.focus();
      return;
    }
    if (btn.dataset.kind === '__art__') {
      state.神器 = row ? row[0] : '';
      // 神器一换，七个模组的候选跟着重建——「电介质」在加密数据盘与废墟石板下
      // 各有一条，留着旧的会拼出一份生成器认不得的源稿。
      mods().forEach(function (m) {
        m.dataset.kind = state.神器;
        if (m.row) fill(m, null);
      });
    }
    fill(btn, row);
    // 异域职业物品带两条异域词条，站内把词条各自列成一条（「刺客之灵」），所以
    // 选中「…之灵」时把同一格里的第二个槽放出来，选别的异域时收回并清空。
    if (slot === '异域护甲' && !btn.dataset.only) {
      var second = btn.parentNode.querySelector('[data-only]');
      var on = !!row && row[0].slice(-SPIRIT.length) === SPIRIT;
      if (second) {
        if (!on && second.row) fill(second, null);
        second.hidden = !on;
      }
    }
    // 4 件套在游戏里同时给 2 件效果，所以选了 4 件就把同一套的 2 件补进另一格。
    // 只补空格：另一格已经有东西，那是填表人自己选的，不替他改。
    if (btn.dataset.slot === '套装' && row && row[1] === '4 件') {
      var two = options('套装').filter(function (r) {
        return r[0] === row[0] && r[1] === '2 件';
      })[0];
      var other = [].filter.call(sheet.querySelectorAll('[data-slot="套装"]'),
        function (c) { return c !== btn && !c.row; })[0];
      if (two && other) fill(other, two);
    }
    close();
    btn.focus();
  }

  /* 适用环境与标签是多选 chip，值汇到同一段里的隐藏 input 上——源稿那两行仍是
     顿号连起来的一串，val() 照旧按 data-key 读一个 .value。
     带 data-single 的那一栏（类别）一次只选一个：按下时先把同栏的其余弹起来，
     再走同一条汇总。取值路径只有这一条。 */
  function toggleTag(c) {
    var set = c.parentNode, on = c.getAttribute('aria-pressed') !== 'true';
    if (on && set.hasAttribute('data-single')) {
      [].forEach.call(set.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
    }
    c.setAttribute('aria-pressed', String(on));
    sumTags(set.parentNode);
    write();
  }

  /* 一栏 chip 的选中项汇进同段的隐藏 input。选与导入两处共用。 */
  function sumTags(facet) {
    facet.querySelector('input[type="hidden"]').value =
      [].filter.call(facet.querySelectorAll('.tagset > button'), function (b) {
        return b.getAttribute('aria-pressed') === 'true';
      }).map(function (b) { return b.textContent; }).join('、');
  }

  /* 六维一格的写法。四个预设，值即源稿里的记法：不限 ~、至少 80+、指定 80、
     区间 150～200。四个词都是两个字，chip 排出来一样宽。
     **这张表只在这里定义一次**——生成器只出空格子，写法是纯 UI。 */
  // 异域职业物品那些词条的词尾。生成器的 SPIRIT 是同一个字串，两处都按它认。
  var SPIRIT = '之灵';

  var STAT_MODES = [['~', '不限'], ['+', '至少'], ['=', '指定'], ['-', '区间']];

  function statText(btn) {
    var mode = btn.dataset.mode || '~';
    var a = (btn.dataset.a || '').trim(), b = (btn.dataset.b || '').trim();
    if (mode === '~' || !a) return '~';
    if (mode === '+') return a + '+';
    if (mode === '=') return a;
    return b ? a + '～' + b : '~';       // 只填了下限就还不成一个区间
  }

  function paintStat(btn) {
    btn.querySelector('.val').textContent = statText(btn);
  }

  /* 六维的选择器：四个写法 chip + 一到两个数值框，与别处「点空槽 → 就地展开」
     同一套动作。摆进格子里要三倍宽，摆进选择器里格子就还是详情页那个尺寸。 */
  function openStat(btn) {
    var same = picker && picker.owner === btn;
    close();
    if (same) return;

    var box = document.createElement('div');
    box.className = 'picker stat-picker';
    box.owner = btn;
    var bar = document.createElement('div');
    bar.className = 'picker-bar';

    var name = document.createElement('p');
    name.className = 'tool-count';
    name.textContent = btn.dataset.stat;
    bar.appendChild(name);

    var nums = [];
    function sync() {
      [].forEach.call(bar.querySelectorAll('.chip'), function (c) {
        c.setAttribute('aria-pressed', String(c.dataset.mode === btn.dataset.mode));
      });
      nums[0].hidden = btn.dataset.mode === '~';
      nums[1].hidden = btn.dataset.mode !== '-';
      paintStat(btn);
      write();
    }

    STAT_MODES.forEach(function (m) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.dataset.mode = m[0];
      c.textContent = m[1];
      c.addEventListener('click', function () {
        btn.dataset.mode = m[0];
        sync();
        if (!nums[0].hidden) nums[0].focus();
      });
      bar.appendChild(c);
    });

    ['a', 'b'].forEach(function (key, i) {
      var n = document.createElement('input');
      n.type = 'number';
      n.min = '0';
      n.max = '200';
      n.className = 'stat-num';
      n.value = btn.dataset[key] || '';
      n.setAttribute('aria-label', btn.dataset.stat + (i ? ' 上限' : ' 数值'));
      n.addEventListener('input', function () {
        btn.dataset[key] = n.value;
        paintStat(btn);
      });
      nums.push(n);
      bar.appendChild(n);
    });

    sync();
    box.appendChild(bar);
    (btn.closest('.slot-row') || btn.closest('.block'))
      .insertAdjacentElement('afterend', box);
    picker = box;
    btn.setAttribute('aria-expanded', 'true');
    (nums[0].hidden ? bar.querySelector('.chip') : nums[0]).focus();
  }

  /* --n 是面板的格子列数兼行内份额，--c 是 rig 露出来的格数（样式表拿它算
     flex-basis 里那份固定开销）。格数一变两个都要跟着改，不然行内的份额与实际
     格数对不上。面板按露出来的格数算，--n 与 --c 同值；rig 按格子的档次加权
     （枪 15、Perk 10），与生成器 rig_of() 同一套权重——枪在组内占 1.5 个单位，
     15∶10 才与它成比例。 */
  function resize(host) {
    var rig = host.classList.contains('rig');
    var live = [].slice.call(host.querySelectorAll(rig ? '.item' : '.cells > li'))
      .filter(function (c) { return !c.hidden; });
    var n = live.length;
    if (rig) {
      var guns = live.filter(function (c) { return c.classList.contains('gun'); }).length;
      n = guns * 15 + (live.length - guns) * 10;
    }
    host.style.setProperty('--n', Math.max(1, n));
    host.style.setProperty('--c', Math.max(1, live.length));
  }

  /* 收起的格子由一枚按钮叫出来。按钮的 data-add 与格子的 data-addable 对上——
     不按槽位名找，因为起源特性与 Perk 同属一个槽位，只是 kind 不同。 */
  function toggleAdd(btn) {
    var host = btn.closest('.slot, .rig');
    var cell = host.querySelector('[data-addable="' + btn.dataset.add + '"]');
    var show = cell.hidden;
    cell.hidden = !show;
    // 收起就清空：留着一个看不见的值，生成的源稿里会凭空多一项。
    if (!show) fill(cell.matches('button') ? cell : cell.querySelector('button.item'), null);
    btn.textContent = (show ? '－' : '＋') + btn.textContent.slice(1);
    resize(host);
    write();
  }

  function setCount(panel, n) {
    var box = panel.querySelector('.slot-count');
    var cells = [].slice.call(panel.querySelectorAll('.cells > li'));
    n = Math.min(cells.length, Math.max(0, n));
    cells.forEach(function (c, i) {
      // 收起就清空：留着一个看不见的值，生成的源稿里会凭空多一项。
      if (i >= n && !c.hidden) fill(c.querySelector('button.item'), null);
      c.hidden = i >= n;
    });
    if (box) {
      box.querySelector('b').textContent = n;
      limits(box, n, cells.length);
    }
    resize(panel);
  }

  function bump(btn) {
    var panel = btn.closest('.slot');
    var now = [].filter.call(panel.querySelectorAll('.cells > li'), function (c) {
      return !c.hidden;
    }).length;
    setCount(panel, now + Number(btn.dataset.step));
    write();
  }

  function limits(box, n, max) {
    [].forEach.call(box.querySelectorAll('button'), function (b) {
      b.disabled = Number(b.dataset.step) < 0 ? n === 0 : n === max;
    });
  }

  function mods() {
    return [].slice.call(sheet.querySelectorAll(
      '#sec-3 [data-slot="神器"]:not([data-kind="__art__"])'));
  }

  /* 核心是本页配过的任一件东西，页首那一格自己就是选择器。选中的东西被清掉时
     核心跟着落空——每次重算源稿都对一遍，不留一枚指向空气的图。 */
  var coreArt = document.getElementById('f-core-art');

  function syncCore() {
    var hit = coreList().filter(function (r) { return r[0] === state.核心; })[0];
    if (!hit) state.核心 = '';
    coreArt.innerHTML = hit
      ? '<img src="' + UP + hit[3] + '" alt="" width="96" height="96">'
      : '<span class="nm">核心</span>';
    coreArt.classList.toggle('empty', !hit);
  }


  /* ── 从源稿导入 ──────────────────────────────────────────────────────
     write() 的逆。**认得出的填上，认不出的整条跳过并报出来**：一份源稿可能是
     上个赛季写的，某件装备站内改了名或下了架，那时把能填的填上比整份拒掉有用。
     报出来的那几条要写清是哪一格的哪个名字，不然填的人不知道该去补哪里。 */
  var LIST_SLOTS = ['超能', '手雷', '近战', '职业技能', '移动', '星相', '碎片'];

  function parseMd(text) {
    var body = text.replace(/\r\n/g, '\n'), notes = '';
    var cut = body.indexOf('\n## 注解');
    if (cut > -1) {
      notes = body.slice(cut).replace(/^\n## 注解\s*/, '').trim();
      body = body.slice(0, cut);
    }
    var title = /^#[ \t]+(.+)$/m.exec(body);
    var head = {};
    body.split('\n').forEach(function (line) {
      // 键里不许有分隔符与井号：正文里的「｜」与标题行都不是键值行
      var m = /^([^：#|｜]{1,8})：(.*)$/.exec(line.trim());
      if (m) (head[m[1].trim()] = head[m[1].trim()] || []).push(m[2].trim());
    });
    return { name: title ? title[1].trim() : '', head: head, notes: notes };
  }

  function resetAll() {
    [].forEach.call(sheet.querySelectorAll('button.item'), function (c) {
      if (c.row) fill(c, null);
    });
    [].forEach.call(sheet.querySelectorAll('[data-key]'), function (i) { i.value = ''; });
    [].forEach.call(sheet.querySelectorAll('.tagset > button'), function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
    [].forEach.call(sheet.querySelectorAll('button.stat'), function (b) {
      b.dataset.mode = '~';
      b.dataset.a = '';
      b.dataset.b = '';
      paintStat(b);
    });
    // 收放与格数也要复位：不复位会留下一个空着的「移动」格（按钮还写着「－ 移动」）
    // 与停在上一份配装那个数的碎片计数。
    [].forEach.call(sheet.querySelectorAll('[data-add]'), function (b) {
      var cell = b.closest('.slot, .rig')
        .querySelector('[data-addable="' + b.dataset.add + '"]');
      if (cell && !cell.hidden) toggleAdd(b);
    });
    [].forEach.call(sheet.querySelectorAll('.slot-count'), function (box) {
      setCount(box.closest('.slot'), Number(box.dataset.n));
    });
    [].forEach.call(sheet.querySelectorAll('[data-only]'), function (c) {
      c.hidden = true;                 // 异域职业物品那第二条词条的格子
    });
    state.职业 = state.分支 = state.神器 = state.核心 = '';
    mods().forEach(function (m) { m.dataset.kind = ''; });
    setBranch('');
    mirror();
  }

  function importMd(text) {
    var got = parseMd(text), skip = [];
    var one = function (k) { return (got.head[k] || [''])[0].trim(); };
    var many = function (k) {
      return one(k).split('、').map(function (x) { return x.trim(); }).filter(Boolean);
    };
    function set(key, v) {
      var el = sheet.querySelector('[data-key="' + key + '"]');
      if (el) el.value = v || '';
    }
    function rowOfName(slot, kind, name) {
      var l = slot === '元素' ? branches() : options(slot, kind);
      var hit = l.filter(function (r) { return r[0] === name; })[0];
      if (hit) return hit;
      // 带消歧括注的（「隐士（冲锋枪）」）。**整名查不到才拆**：站内自加的消歧
      // 后缀本身就是名字的一部分（「故我在（电弧元素）」），见名就拆会丢正主。
      var m = /（([^（）]+)）$/.exec(name);
      if (!m) return undefined;
      var bareName = name.slice(0, m.index);
      return l.filter(function (r) {
        return r[0] === bareName && bare(r[1]) === m[1];
      })[0];
    }
    /* 收起的格子先放出来再填：留着 hidden 的格子有值，源稿里会凭空多一项。 */
    function reveal(cell) {
      var li = cell.closest('li');
      if (!cell.hidden && !(li && li.hidden)) return;
      var mark = cell.dataset.addable || (li && li.dataset.addable);
      var add = mark && cell.closest('.slot, .rig')
        .querySelector('[data-add="' + mark + '"]');
      if (add) toggleAdd(add);
      else { cell.hidden = false; if (li) li.hidden = false; }
    }
    function put(slot, kind, name, cell) {
      if (!cell) { skip.push(slot + '：' + name); return; }
      var row = rowOfName(slot, kind, name);
      if (!row) { skip.push(slot + '：' + name); return; }
      reveal(cell);
      fill(cell, row);
    }
    function cells(sel, scope) {
      return [].slice.call((scope || sheet).querySelectorAll(sel));
    }

    resetAll();
    set('配装名', got.name);
    set('描述', one('描述'));
    set('推荐人', one('推荐人'));
    // 源稿的「推荐人：」可以写多行，这一页只有一个输入位。多出来的报出来——
    // 闷声丢掉等于把署名弄没了，而粘回去的人看不出少了谁。
    (got.head['推荐人'] || []).slice(1).forEach(function (x) {
      skip.push('推荐人：' + x);
    });
    set('注解', got.notes);

    // 身份先定：跟职业绑定的两个槽按它收候选，分支决定候选的排序与整页强调色。
    var cls = one('职业');
    if (cls && CLASS_ORDER.indexOf(cls) > -1) state.职业 = cls;
    else if (cls) skip.push('职业：' + cls);
    var br = one('分支');
    if (br && BRANCH[br]) { state.分支 = br; setBranch(br); }
    else if (br) skip.push('分支：' + br);
    mirror();

    LIST_SLOTS.forEach(function (slot) {
      var want = many(slot);
      if (!want.length) return;
      var cs = cells('[data-slot="' + slot + '"]');
      if (slot === '碎片' && cs[0]) setCount(cs[0].closest('.slot'), want.length);
      want.forEach(function (n, i) { put(slot, KIND[slot] || '', n, cs[i]); });
    });

    var gun = one('异域武器');
    if (gun) put('异域武器', '', gun, cells('[data-slot="异域武器"]')[0]);

    // 传说武器一行一把，Perk 跟在竖线后面；第三项是起源特性，它那一格默认收起。
    var rigs = cells('#sec-2 .rig').slice(1);
    (got.head['传说武器'] || []).forEach(function (line, i) {
      var seg = line.split('|');
      var name = seg[0].trim();
      if (!rigs[i]) { skip.push('传说武器：' + name); return; }
      put('传说武器', '', name, cells('[data-slot="传说武器"]', rigs[i])[0]);
      var pcs = cells('[data-slot="Perk"]', rigs[i]);
      (seg[1] || '').split('、').map(function (x) { return x.trim(); })
        .filter(Boolean).forEach(function (pk, k) {
          put('Perk', pcs[k] ? pcs[k].dataset.kind : '', pk, pcs[k]);
        });
    });

    var armor = cells('[data-slot="异域护甲"]');
    many('异域护甲').forEach(function (n, i) { put('异域护甲', '', n, armor[i]); });

    var sets = cells('[data-slot="套装"]');
    one('套装').split('×').map(function (x) { return x.trim(); }).filter(Boolean)
      .forEach(function (seg, i) {
        var m = /^(.+?)\s*([24])\s*件$/.exec(seg);
        if (!m) { skip.push('套装：' + seg); return; }
        put('套装', m[2] + ' 件', m[1].trim(), sets[i]);
      });

    PARTS.forEach(function (part) {
      var cs = cells('[data-kind="' + part + '"]');
      many(part).forEach(function (n, i) { put('护甲模组', part, n, cs[i]); });
    });

    // 神器先定：七个模组的候选按它收，「电介质」在两件神器下各有一条。
    var art = one('神器');
    if (art) {
      var head = sheet.querySelector('[data-kind="__art__"]');
      var row = artifacts().filter(function (r) { return r[0] === art; })[0];
      if (row) {
        state.神器 = art;
        fill(head, row);
        mods().forEach(function (m) { m.dataset.kind = art; });
        var ms = mods();
        many('模组').forEach(function (n, i) { put('神器', art, n, ms[i]); });
      } else {
        skip.push('神器：' + art);
      }
    }

    one('六维').split('｜').map(function (x) { return x.trim(); }).filter(Boolean)
      .forEach(function (seg) {
        var m = /^(\S+)\s*(.*)$/.exec(seg);
        var cell = m && sheet.querySelector('.stat[data-stat="' + m[1] + '"]');
        if (!cell) { skip.push('六维：' + seg); return; }
        var v = (m[2] || '~').trim(), hit;
        if (v === '~' || v === '') cell.dataset.mode = '~';
        else if ((hit = /^(\d+)\+$/.exec(v))) { cell.dataset.mode = '+'; cell.dataset.a = hit[1]; }
        else if ((hit = /^(\d+)\s*[～~-]\s*(\d+)$/.exec(v))) {
          cell.dataset.mode = '-';
          cell.dataset.a = hit[1];
          cell.dataset.b = hit[2];
        } else if ((hit = /^(\d+)$/.exec(v))) { cell.dataset.mode = '='; cell.dataset.a = hit[1]; }
        else { skip.push('六维：' + seg); return; }
        paintStat(cell);
      });

    ['类别', '场景', '定位'].forEach(function (key) {
      var box = sheet.querySelector('input[data-key="' + key + '"]');
      if (!box) return;
      var all = cells('.tagset > button', box.parentNode);
      many(key).forEach(function (t) {
        var b = all.filter(function (x) { return x.textContent === t; })[0];
        if (b) b.setAttribute('aria-pressed', 'true');
        else skip.push(key + '：' + t);
      });
      sumTags(box.parentNode);
    });
    // 类别进了铭牌，回填之后要重画一次。
    mirror();

    // 核心最后定：它必须是上面已经填进去的某一件，前面没填上就落不了。
    var core = one('核心');
    if (core) {
      if (coreList().some(function (r) { return r[0] === core; })) state.核心 = core;
      else skip.push('核心：' + core);
    }

    write();
    grow();
    return skip;
  }
  /* ── 源稿 ──────────────────────────────────────────────────────────
     输出格式与 convert-build.py 认的源稿逐字一致，空的那一行整行不写
     （源稿的约定就是「留空即整行删掉」，不写占位符）。 */
  /* 更新时间不给输入框：填表人写的日期只会是「今天」，那台机器自己知道。 */
  function today() {
    var d = new Date();
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }

  function val(key) {
    var el = sheet.querySelector('[data-key="' + key + '"]');
    return el ? el.value.trim() : '';
  }

  function picked(sel, scope) {
    return [].slice.call((scope || sheet).querySelectorAll(sel))
      .filter(function (c) { return c.row; });
  }

  /* 源稿里该写的名字。同名不同来源页时补一个分节括注——站内「隐士」既是冲锋枪
     也是融合步枪，只写名字生成器分不出该链哪一条，当场中止。判据与 vocab.pick
     一致：同名且来源页不同才算撞车，同页同名是同一件东西的几档，取哪条都落在
     同一页同一节。

     **元素页上的同名条目不补括注**：那一族由 vocab.pick 的 prefer（配装的分支）
     挑，而 prefer 只会是某个 elements/ 页。给棱镜配装的「地狱火」写上「（星相）」
     反倒把它钉到烈日页去——括注在 prefer 之前收窄。 */
  function srcName(cell) {
    var row = cell.row;
    if (row[2].indexOf('elements/') === 0) return row[0];
    var dup = options(cell.dataset.slot, cell.dataset.kind || '').some(function (r) {
      return r[0] === row[0] && r[2] !== row[2];
    });
    return dup ? row[0] + '（' + bare(row[1]) + '）' : row[0];
  }

  function joined(sel, scope) {
    return picked(sel, scope).map(srcName).join('、');
  }

  function line(key, value) { return value ? key + '：' + value + '\n' : ''; }

  function write() {
    syncCore();
    var md = '# ' + (val('配装名') || '配装名') + '\n\n';
    md += line('推荐人', val('推荐人'));
    md += line('描述', val('描述'));
    md += line('更新', today());
    md += line('场景', val('场景'));
    md += line('定位', val('定位'));
    md += line('分支', state.分支);
    md += line('类别', val('类别'));
    md += line('核心', state.核心);

    md += '\n## 职业\n\n';
    md += line('职业', state.职业);
    md += line('超能', joined('[data-slot="超能"]'));
    md += line('星相', joined('[data-slot="星相"]'));
    md += line('碎片', joined('[data-slot="碎片"]'));
    md += line('手雷', joined('[data-slot="手雷"]'));
    md += line('近战', joined('[data-slot="近战"]'));
    md += line('移动', joined('[data-slot="移动"]'));
    md += line('职业技能', joined('[data-slot="职业技能"]'));

    md += '\n## 武器\n\n';
    md += line('异域武器', joined('[data-slot="异域武器"]'));
    [].forEach.call(sheet.querySelectorAll('#sec-2 .rig'), function (rig) {
      var gun = picked('[data-slot="传说武器"]', rig)[0];
      if (!gun) return;
      var perks = joined('[data-slot="Perk"]', rig);
      md += '传说武器：' + srcName(gun) + (perks ? ' | ' + perks : '') + '\n';
    });

    md += '\n## 护甲\n\n';
    md += line('异域护甲', joined('[data-slot="异域护甲"]'));
    // 套装的件数就在所选那一条的分节名上（词表里「玻璃拱顶」2 件与 4 件是两条）。
    // 2 件排在 4 件前面：同一套的两条效果，游戏里就是这个读法。
    md += line('套装', picked('[data-slot="套装"]').sort(function (a, b) {
      return a.row[1].localeCompare(b.row[1]);
    }).map(function (c) {
      return c.row[0] + ' ' + c.row[1];
    }).join(' × '));
    PARTS.forEach(function (part) {
      md += line(part, joined('[data-kind="' + part + '"]'));
    });

    md += '\n## 神器\n\n';
    md += line('神器', state.神器);
    md += line('模组', mods().filter(function (m) { return m.row; })
      .map(function (m) { return m.row[0]; }).join('、'));

    md += '\n## 六维\n\n';
    md += '六维：' + STATS.map(function (s) {
      return s + ' ' + statText(sheet.querySelector('.stat[data-stat="' + s + '"]'));
    }).join(' ｜ ') + '\n';

    if (val('注解')) md += '\n## 注解\n\n' + val('注解') + '\n';
    out.value = md;
  }

  sheet.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) { toggleAdd(add); return; }
    var step = e.target.closest('[data-step]');
    if (step) { bump(step); return; }
    var tag = e.target.closest('.tagset > button');
    if (tag) { toggleTag(tag); return; }
    var stat = e.target.closest('button.stat');
    if (stat) { openStat(stat); return; }
    var btn = e.target.closest('button.item');
    if (btn && !btn.closest('.picker')) { open(btn); return; }
    if (!e.target.closest('.picker') && !btn) close();
  });

  sheet.addEventListener('input', write);
  sheet.addEventListener('change', write);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // 空槽的占位文字要留住：清空之后还得写回去
  [].forEach.call(sheet.querySelectorAll('button.item.empty'), function (b) {
    b.dataset.label = b.textContent.trim();
    b.setAttribute('aria-expanded', 'false');
  });

  [].forEach.call(sheet.querySelectorAll('.slot-count'), function (box) {
    var cells = box.closest('.slot').querySelectorAll('.cells > li');
    box.dataset.n = box.querySelector('b').textContent;   // 导入前复位到这个数
    limits(box, Number(box.dataset.n), cells.length);
  });

  document.getElementById('copy').addEventListener('click', function () {
    var tip = document.getElementById('copy-tip');
    out.select();
    // file:// 与非安全上下文下 navigator.clipboard 是 undefined。
    // 不吞掉：文本已经选中了，把「自己按一下」说出来，别让人以为复制成功了。
    if (!navigator.clipboard) { tip.textContent = '已选中，按 ⌘C 复制'; return; }
    navigator.clipboard.writeText(out.value).then(function () {
      tip.textContent = '已复制';
      setTimeout(function () { tip.textContent = ''; }, 1600);
    }, function (err) {
      tip.textContent = '复制失败（' + err.name + '），已选中，按 ⌘C';
    });
  });

  /* 投稿：把配装文本发进后端的待审队列，审核在线上做（/admin/）。

     **同一套配装重投会改写待审的那一条，不堆第二份**——判据是职业、武器、护甲、
     神器四段一致，由后端算，前端不必知道。所以这枚按钮可以随便按第二次。
     发不出去就把原因写在提示位上，不留一个「投稿中…」挂着。 */
  var send = document.getElementById('send');
  send.addEventListener('click', function () {
    var tip = document.getElementById('copy-tip');
    var md = out.value;
    if (!/^# \S/.test(md)) { tip.textContent = '先写配装名'; return; }
    send.disabled = true;
    tip.textContent = '投稿中…';
    fetch(send.dataset.api, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 'sub', md: md })
    }).then(function (r) { return r.json(); }).then(function (s) {
      send.disabled = false;
      if (s.error) { tip.textContent = '投稿失败：' + s.error; return; }
      tip.textContent = s.dup ? '已更新你先前投的同一套配装' : '投稿成功，等待审核';
    }, function (err) {
      send.disabled = false;
      tip.textContent = '投稿失败：' + err;
    });
  });

  /* 预览：给 #sheet 加一个类，把空槽、控件与源稿那一节收起来，剩下的就是成品。
     **不另建一套 DOM**——两套 DOM 会让版面改一处得改两遍。 */
  /* 注解越写越长，textarea 不会自己长高，写到第五行就看不见了。高度按内容算：
     **先把 height 归零再读 scrollHeight**，不归零时 scrollHeight 永远不小于当前
     高度，框只会长不会缩。box-sizing 全局是 border-box，scrollHeight 含内边距，
     直接拿来当高度即可。 */
  var notes = sheet.querySelector('textarea[data-key="注解"]');

  function grow() {
    notes.style.height = 'auto';
    notes.style.height = notes.scrollHeight + 'px';
  }

  notes.addEventListener('input', grow);

  var preview = document.getElementById('preview');
  preview.addEventListener('click', function () {
    close();
    var on = sheet.classList.toggle('preview');
    preview.textContent = on ? '退出预览' : '预览配装';
    preview.setAttribute('aria-pressed', String(on));
    if (on) window.scrollTo(0, 0);
  });

  /* 导入是一个动作，不是两个按钮：这一枚永远「导入」，文本框还空着时它带你去
     粘贴。**两条路都要把那一节放出来并滚过去**——结果与跳过的条目写在那里，
     按完看不见等于没报。预览态下那一节是收起来的，先退出预览。 */
  document.getElementById('to-import').addEventListener('click', function () {
    if (sheet.classList.contains('preview')) preview.click();
    var panel = document.getElementById('imp');
    var area = document.getElementById('in');
    var tip = document.getElementById('imp-tip');
    panel.open = true;
    panel.scrollIntoView({ block: 'center' });
    var text = area.value.trim();
    if (!text) {
      area.focus();
      tip.textContent = '把配装文本粘贴到这里，再按一次「导入配装」';
      return;
    }
    var skip = importMd(text);
    document.getElementById('src').open = true;
    tip.textContent = skip.length
      ? '导入完成，跳过 ' + skip.length + ' 条：' + skip.join('，')
      : '导入完成，全部认得出';
  });

  /* 填过东西之后再离开或刷新要先问一句：这一页的内容只在这一个标签页里活着，
     刷掉就没了。判据是「生成的源稿与刚打开时那一份不同」，不另记一份脏标记。 */
  var blank = '';
  window.addEventListener('beforeunload', function (e) {
    if (out.value === blank) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* 本地审核台（tools/review.py）把这一页当编辑器用：灌一份源稿进来，改完再把
     生成的那份取回去。**load() 之后重设基线**——不重设的话，离开时那一问会在
     刚打开、什么都没改的时候就弹。 */
  window.starsideForm = {
    load: function (md) {
      var skip = importMd(md);
      blank = out.value;
      return skip;
    },
    read: function () { return out.value; }
  };

  write();
  grow();
  blank = out.value;
}());
