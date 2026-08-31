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
  var state = { 职业: '', 分支: '', 神器: '' };
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
      if (BY_CLASS[slot] && state.职业 && r[1] !== state.职业
          && r[1] !== '通用') return false;
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
  function body(row, slot, size) {
    var img = row[3] ? '<img src="' + UP + row[3] + '" alt="" width="' + size
      + '" height="' + size + '" loading="lazy">' : '';
    var nm = row[4] ? '<span class="' + row[4] + '">' + esc(row[0]) + '</span>'
      : esc(row[0]);
    var sub = row[5] ? '<span class="sub">' + esc(row[5]) + '</span>' : '';
    var pc = slot === '套装' ? '<span class="pc">' + esc(row[1]) + '</span>' : '';
    return img + '<span class="nm">' + nm + sub + pc + '</span>';
  }

  function iconSize(btn) {
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
    write();
  }

  /* 选择器整行展开在它那一行下面：一格只有一百来像素宽，图标网格塞不进去。 */
  function close() {
    if (!picker) return;
    var owner = picker.owner;
    picker.remove();
    picker = null;
    if (owner) owner.setAttribute('aria-expanded', 'false');
  }

  function open(btn) {
    var slot = btn.dataset.slot, kind = btn.dataset.kind || '';
    var same = picker && picker.owner === btn;
    close();
    if (same) return;

    var list = kind === '__art__' ? artifacts() : options(slot, kind);
    // 神器模组按所选那一件限定。没选之前不列——七件神器各 21 枚，混在一起是
    // 147 条，且它们在神器盘上的位置一件一套，摆出来会七枚叠在同一格。
    var wait = slot === '神器' && kind !== '__art__' && !state.神器;

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
    clear.addEventListener('click', function () { fill(btn, null); close(); });
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
        count.textContent = '先选一件神器';
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
        b.innerHTML = body(r, slot, iconSize(btn))
          + '<span class="kd">' + esc(tag(r)) + '</span>';
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
    (btn.closest('.slot-row') || btn.closest('.block'))
      .insertAdjacentElement('afterend', box);
    picker = box;
    btn.setAttribute('aria-expanded', 'true');
    find.focus();
  }

  function pickOne(btn, row) {
    if (btn.dataset.kind === '__art__') {
      state.神器 = row[0];
      // 神器一换，七个模组的候选跟着重建——「电介质」在加密数据盘与废墟石板下
      // 各有一条，留着旧的会拼出一份生成器认不得的源稿。
      mods().forEach(function (m) {
        m.dataset.kind = state.神器;
        if (m.row) fill(m, null);
      });
    }
    fill(btn, row);
    close();
    btn.focus();
  }

  /* --n 是面板的格子列数兼行内份额，格数一变就要跟着改，不然行内的份额与实际
     格数对不上。面板按露出来的格数算；rig 按格子的档次加权（枪 16、Perk 10），
     与生成器 rig_of() 同一套权重。 */
  function weigh(host) {
    if (!host.classList.contains('rig')) {
      return Math.max(1, host.querySelectorAll('.cells > li:not([hidden])').length);
    }
    var live = [].slice.call(host.querySelectorAll('.item')).filter(function (c) {
      return !c.hidden;
    });
    var guns = live.filter(function (c) { return c.classList.contains('gun'); }).length;
    return guns * 16 + (live.length - guns) * 10;
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
    host.style.setProperty('--n', weigh(host));
    write();
  }

  function bump(btn) {
    var box = btn.closest('.slot-count');
    var panel = btn.closest('.slot');
    var cells = [].slice.call(panel.querySelectorAll('.cells > li'));
    var now = cells.filter(function (c) { return !c.hidden; }).length;
    var n = Math.min(cells.length, Math.max(0, now + Number(btn.dataset.step)));
    cells.forEach(function (c, i) {
      if (i >= n && !c.hidden) fill(c.querySelector('button.item'), null);
      c.hidden = i >= n;
    });
    box.querySelector('b').textContent = n;
    panel.style.setProperty('--n', Math.max(1, n));
    limits(box, n, cells.length);
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

  /* ── 头部那两排选择：职业三枚、分支六枚，都只有几个选项，用 chip 不用选择器 ── */
  function chips(host, list, key, make) {
    list.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.innerHTML = make(opt);
      b.addEventListener('click', function () {
        state[key] = opt.name;
        [].forEach.call(host.children, function (c) {
          c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
        });
        if (key === '分支') sheet.className = 'b-' + BRANCH[opt.name];
        if (key === '职业') {
          // 职业一换，跟职业绑定的两个槽的候选变了，留着旧的会前后矛盾。
          [].forEach.call(sheet.querySelectorAll(
            '[data-slot="职业技能"],[data-slot="异域护甲"]'), function (c) {
            if (c.row) fill(c, null);
          });
        }
        write();
      });
      b.setAttribute('aria-pressed', 'false');
      host.appendChild(b);
    });
  }

  // 三个职业按游戏内的顺序排，不按词表的字典序——猎人、泰坦、术士是固定次序，
  // 站内每一处都这么排。
  var ORDER = ['猎人', '泰坦', '术士'];
  var classes = options('职业', '分节').slice().sort(function (a, b) {
    return ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]);
  });
  chips(sheet.querySelector('[data-pick="职业"]'),
        classes.map(function (r) { return { name: r[0], row: r }; }),
        '职业', function (o) {
          return (o.row[3] ? '<img src="' + UP + o.row[3] + '" alt="" width="18" '
            + 'height="18">' : '') + esc(o.name);
        });

  chips(sheet.querySelector('[data-pick="分支"]'),
        Object.keys(BRANCH).map(function (n) { return { name: n }; }),
        '分支', function (o) {
          return '<span class="el-' + BRANCH[o.name] + '">' + esc(o.name) + '</span>';
        });

  /* 核心必须等于本页的异域武器或异域护甲之一，所以不给它选择器，
     从那两格现有的选择里挑。 */
  var coreSel = sheet.querySelector('[data-key="核心"]');
  var coreArt = document.getElementById('f-core-art');

  function syncCore() {
    var picks = [], keep = coreSel.value;
    ['异域武器', '异域护甲'].forEach(function (s) {
      var c = sheet.querySelector('[data-slot="' + s + '"]');
      if (c && c.row) picks.push(c.row);
    });
    coreSel.textContent = '';
    if (!picks.length) {
      var ph = document.createElement('option');
      ph.textContent = '先选异域';
      coreSel.appendChild(ph);
    }
    picks.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r[0];
      o.textContent = r[0];
      coreSel.appendChild(o);
    });
    if (picks.some(function (r) { return r[0] === keep; })) coreSel.value = keep;
    var hit = picks.filter(function (r) { return r[0] === coreSel.value; })[0];
    coreArt.innerHTML = hit && hit[3]
      ? '<img src="' + UP + hit[3] + '" alt="" width="96" height="96">'
      : '<span class="nm">核心</span>';
    coreArt.classList.toggle('empty', !(hit && hit[3]));
  }

  /* ── 源稿 ──────────────────────────────────────────────────────────
     输出格式与 convert-build.py 认的源稿逐字一致，空的那一行整行不写
     （源稿的约定就是「留空即整行删掉」，不写占位符）。 */
  function val(key) {
    var el = sheet.querySelector('[data-key="' + key + '"]');
    return el ? el.value.trim() : '';
  }

  function picked(sel, scope) {
    return [].slice.call((scope || sheet).querySelectorAll(sel))
      .filter(function (c) { return c.row; });
  }

  function joined(sel, scope) {
    return picked(sel, scope).map(function (c) { return c.row[0]; }).join('、');
  }

  function line(key, value) { return value ? key + '：' + value + '\n' : ''; }

  function write() {
    syncCore();
    var md = '# ' + (val('配装名') || '配装名') + '\n\n';
    md += line('推荐人', val('推荐人'));
    md += line('描述', val('描述'));
    md += line('更新', val('更新'));
    md += line('场景', val('场景'));
    md += line('定位', val('定位'));
    md += line('分支', state.分支);
    md += line('核心', coreSel.value);

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
      md += '传说武器：' + gun.row[0] + (perks ? ' | ' + perks : '') + '\n';
    });

    md += '\n## 护甲\n\n';
    md += line('异域护甲', joined('[data-slot="异域护甲"]'));
    // 套装的件数就在所选那一条的分节名上（词表里「玻璃拱顶」2 件与 4 件是两条）
    md += line('套装', picked('[data-slot="套装"]').map(function (c) {
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
      return s + ' ' + (val('六维' + s) || '~');
    }).join(' ｜ ') + '\n';

    if (val('注解')) md += '\n## 注解\n\n' + val('注解') + '\n';
    out.value = md;
  }

  sheet.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) { toggleAdd(add); return; }
    var step = e.target.closest('[data-step]');
    if (step) { bump(step); return; }
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
    limits(box, Number(box.querySelector('b').textContent), cells.length);
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

  write();
}());
