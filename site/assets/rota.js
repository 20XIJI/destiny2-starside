/* 周常轮换轴的轮盘。只有 rotation 那一页用。

   从 assets/app.js 拆出来：它是页面专属的，而 app.js 每个带工具条的页面都要下。
   合起来 chart + rota + home 是 app.js 8.9 KB gzip 里的 6.9 KB，却只有三个页面
   跑得到，其余 31 页白下。拆开之后由 app.js 在认出该页的 data-* 时动态 import。

   共用件（tuck）由 app.js 传进来，不在这里重抄一份。 */

export default function init(table, deps) {
  var tuck = deps.tuck;

  /* 周常轮换轴（.gen 带 data-rota 的表）：**顺序只有表里那一份**，轮盘从表里现读，
     画完把表收起，与折线图同一条约定——无 JS 时表就是页面本体。

     不接鼠标滚轮，接按住拖拽与点击：这一段嵌在一页可滚动的长文里，接了滚轮就会在读者
     往下滚页面时把轮盘转走，页面反而不动；而在舞台上按住上下拖（鼠标或触屏）是明确的
     拨轮盘意图，实时跟手，松手后按脱手速度惯性吸附到整周，点任意卡片也转到中间。

     **位置是连续量，不是三档。**每帧把当前位置往目标位置收一段，卡片
     按分数距离摆——转起来是一根滚轴匀速滚过去，中途的虚化、明暗、缩放都在插值。
     按整步跳、靠 CSS transition 补间那一版会在跨两周时露出「两段各自缓动」的接缝，
     新进场的卡片也只能凭空出现。 */
  var MS_WEEK = 604800000, MS_DAY = 86400000;
  /* 圆柱：每张之间 24°，半径 300px。相邻两张的纵向间距是 sin24°×300 ≈ 122px，
     压过卡片自身的高度（104px），卡片因此不叠在一起。 */
  var STEP = 24, R = 300, WIN = 3, PITCH = Math.sin(STEP * Math.PI / 180) * R;
  /* 一次转动的时长：起步 300ms，每多跨一周加 90ms，最长 520ms。指数逼近那种写法
     （每帧往目标收 16%）尾巴上会拖出一秒多的亚像素爬行，读起来像没停稳。 */
  var SPIN = { base: 300, per: 90, max: 520 };
  var ROTA_GUIDES = {"众神殿":"raid-guides/pantheon/index.html","永恒沙漠（史诗）":"raid-guides/desert-perpetual-epic/index.html","永恒沙漠":"raid-guides/desert-perpetual/index.html","救赎的边缘":"raid-guides/salvations-edge/index.html","克洛塔的末日":"raid-guides/crotas-end/index.html","梦魇根源":"raid-guides/root-of-nightmares/index.html","国王的陨落":"raid-guides/kings-fall/index.html","门徒誓约":"raid-guides/vow-of-the-disciple/index.html","玻璃拱顶":"raid-guides/vault-of-glass/index.html","深岩墓室":"raid-guides/deep-stone-crypt/index.html","救赎花园":"raid-guides/garden-of-salvation/index.html","最后一愿":"raid-guides/last-wish/index.html","平衡":"raid-guides/equilibrium/index.html","分离教义":"raid-guides/sundered-doctrine/index.html","晚星之主":"raid-guides/vespers-host/index.html","战争领主的废墟":"raid-guides/warlords-ruin/index.html","深渊机灵":"raid-guides/ghosts-of-the-deep/index.html","守望者尖塔":"raid-guides/spire-of-the-watcher/index.html","二象性":"raid-guides/duality/index.html","贪婪之握":"raid-guides/grasp-of-avarice/index.html","预言":"raid-guides/prophecy/index.html","异端深渊":"raid-guides/pit-of-heresy/index.html","破碎王座":"raid-guides/shattered-throne/index.html"};
  /* 9 突袭 + 10 地牢的徽章小图标（icons/<md5>.webp）与场景底图 */
  var ROTA_ART = {
    '最后一愿': ['98c8ef41c9', '../raid-guides/icons/bd21cb7bf4.webp'],
    '救赎花园': ['d287b3dc33', '../raid-guides/icons/c7ac1dd567.webp'],
    '深岩墓室': ['068796ce27', '../raid-guides/icons/254fbbb12b.webp'],
    '玻璃拱顶': ['32e9ee0e2f', '../raid-guides/icons/a126647b23.webp'],
    '门徒誓约': ['189d589701', '../raid-guides/icons/a813f73253.webp'],
    '国王的陨落': ['5d2addda27', '../raid-guides/icons/9063ea74eb.webp'],
    '梦魇根源': ['810e9c5f15', '../raid-guides/icons/cb6b36bc1c.webp'],
    '克洛塔的末日': ['c8f1bde352', '../raid-guides/icons/061f9f9f3d.webp'],
    '救赎的边缘': ['0c0db34c1c', '../raid-guides/icons/c2a06239c6.webp'],
    '破碎王座': ['00ab7fe800', 'icons/f6ec993719.webp'],
    '异端深渊': ['9214e0910b', 'icons/648e066e1e.webp'],
    '预言': ['e9dff45136', 'icons/c7b4341f70.webp'],
    '贪婪之握': ['c4510de46d', 'icons/75be6ccaf7.webp'],
    '二象性': ['3fa872c35b', 'icons/370a5eb7c6.webp'],
    '守望者尖塔': ['1b0cdbee38', 'icons/793704412c.webp'],
    '深渊机灵': ['1737ba2584', 'icons/05c4d4bffd.webp'],
    '战争领主的废墟': ['56ba6f109c', 'icons/3d8b580607.webp'],
    '晚星之主': ['9fa7dd1645', 'icons/9360fad4d1.webp'],
    '分离教义': ['a1fbe13ded', 'icons/219ba4a3da.webp']
  };

  function rota(table) {
    var raids = [], dungeons = [];
    [].slice.call(table.querySelectorAll('tbody tr')).forEach(function (tr) {
      var c = [].slice.call(tr.children).map(function (x) { return x.textContent.trim(); });
      if (c[1]) raids.push(c[1]);
      if (c[2]) dungeons.push(c[2]);
    });
    if (!raids.length || !dungeons.length) return;
    /* 两组的名目取自表头（突袭／地牢）：页面上的源文本只有表里那一份，不在这里重写 */
    var kinds = [].slice.call(table.querySelectorAll('thead th')).slice(1)
      .map(function (th) { return th.textContent.trim(); });

    /* 起始日可带时刻（YYYY.M.D H:MM）：周界就是游戏的每周重置，落在周三 01:00，
       只按日算会让重置前那一小时提前跳到下一周。 */
    var spec = table.dataset.rota.split(' ');
    var d0 = spec[0].split('.').map(Number);
    var hm = (spec[1] || '0:00').split(':').map(Number);
    var t0 = Date.UTC(d0[0], d0[1] - 1, d0[2], hm[0] - 8, hm[1]);
    var here = Math.floor((Date.now() - t0) / MS_WEEK);
    var cur = here, from = here, aim = here, t1 = 0, span = 0, running = false;

    var box = document.createElement('div');
    box.className = 'rota';
    box.innerHTML = '<div class="rota-head">'
      + '<span class="rota-head-date">周期</span>'
      + '<div class="rota-head-main">'
      + '<span class="rota-head-col" data-kind="raid">' + kinds[0] + '</span>'
      + '<span class="rota-head-col" data-kind="dungeon">' + kinds[1] + '</span>'
      + '</div></div>'
      + '<div class="rota-stage"></div>';
    table.parentNode.insertBefore(box, table);
    tuck(table);

    var stage = box.querySelector('.rota-stage');
    var pool = {};

    function pill(n) {
      var art = ROTA_ART[n];
      var guide = ROTA_GUIDES[n];
      var label = guide
        ? '<a class="rota-guide" href="../' + guide + '">' + n + '</a>'
        : n;
      if (!art) return '<span class="rota-pill"><span class="rota-cap"><span class="rota-name">' + label + '</span></span></span>';
      return '<span class="rota-pill" style="--bg:url(\'' + art[1] + '\')">'
        + '<span class="rota-cap">'
        + '<img class="rota-ico" src="icons/' + art[0] + '.webp" alt="" width="20" height="20">'
        + '<span class="rota-name">' + label + '</span></span></span>';
    }

    function group(kind, names) {
      return '<div class="rota-group" data-kind="' + kind + '">'
        + names.map(pill).join('')
        + '</div>';
    }

    function card(i) {
      if (pool[i]) return pool[i];
      var s = new Date(t0 + i * MS_WEEK + 288e5), e = new Date(t0 + i * MS_WEEK + 6 * 86400000 + 288e5);
      var r = ((i % raids.length) + raids.length) % raids.length;
      var g = ((i % dungeons.length) + dungeons.length) % dungeons.length;
      /* 左侧日期滚轮刻度：本周那张写「本周」，其余写距今几周。 */
      var off = i - here;
      var mark = off === 0 ? '本周' : Math.abs(off) + ' 周' + (off > 0 ? '后' : '前');
      var el = document.createElement('div');
      el.className = 'rota-card' + (i === here ? ' is-now' : '');
      el.innerHTML = '<div class="rota-dial">'
        + '<span class="rota-badge">' + mark + '</span>'
        + '<span class="rota-date">'
        + (s.getUTCMonth() + 1) + ' 月 ' + s.getUTCDate() + ' 日 — '
        + (e.getUTCMonth() + 1) + ' 月 ' + e.getUTCDate() + ' 日</span></div>'
        + '<div class="rota-body">'
        + group('raid', [raids[r], raids[(r + 4) % raids.length]])
        + group('dungeon', [dungeons[g], dungeons[(g + 4) % dungeons.length]])
        + '</div>';
      stage.appendChild(el);
      pool[i] = el;
      return el;
    }

    /* d 是到中间的分数距离。紧邻上下周（a <= 1）保持清晰不虚化，仅靠明暗与倾角分出主次；
       再往外（a > 1）渐进虚掉、淡出，滚动途中不出现档与档之间的跳变。 */
    function place(el, d) {
      var a = Math.abs(d);
      el.hidden = a > 2.7;
      if (el.hidden) return;
      var rad = d * STEP * Math.PI / 180;
      el.style.transform = 'translate3d(0,' + (Math.sin(rad) * R).toFixed(1) + 'px,'
        + ((Math.cos(rad) - 1) * R).toFixed(1) + 'px) rotateX(' + (-d * STEP).toFixed(2) + 'deg)';
      var blur = a <= 1 ? 0 : (a - 1) * 2.4;
      el.style.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      el.style.opacity = (a <= 1 ? 1 - a * 0.3 : Math.max(0, 0.7 - (a - 1) * 0.42)).toFixed(3);
      el.style.zIndex = 10 - Math.round(a);
      el.classList.toggle('is-mid', a < 0.5);
    }

    function draw() {
      var c = Math.round(cur);
      for (var k = c - WIN; k <= c + WIN; k++) place(card(k), k - cur);
      Object.keys(pool).forEach(function (k) {
        if (Math.abs(k - c) > WIN) { pool[k].remove(); delete pool[k]; }
      });
    }

    /* 定时长 + 三次缓出：起步快、收尾稳，走完就停。转动中再点一张，从当前位置
       重新起算，不排队也不叠加。 */
    function frame(now) {
      if (!running) return;
      var p = Math.min(1, (now - t1) / span);
      cur = from + (aim - from) * (1 - Math.pow(1 - p, 3));
      draw();
      running = p < 1;
      if (running) requestAnimationFrame(frame);
    }

    /* 减少动态效果：直接落终态。CSS 那边禁 transition/animation 挡不住这里，
       place() 是逐帧写 inline 的 transform／filter／opacity。 */
    function go(i) {
      if (i === aim && cur === aim) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        running = false;
        from = cur = aim = i;
        draw();
        return;
      }
      from = cur;
      aim = i;
      t1 = performance.now();
      span = Math.min(SPIN.max, SPIN.base + SPIN.per * Math.abs(aim - from));
      if (!running) { running = true; requestAnimationFrame(frame); }
    }

    /* 命中测试走投影矩形，不靠浏览器的事件派发：preserve-3d 容器里带 filter 的
       子元素，Chrome 会按未变换的平面判命中，除中间那张外全部落到 .rota-stage 上。
       getBoundingClientRect() 给的是变换后的投影框，按它认反而准。
       几张在投影上重叠时取离中间最近的那张——上面那张压着下面那张的边。 */
    function hitCard(x, y) {
      var best = null, near = Infinity;
      Object.keys(pool).forEach(function (k) {
        var el = pool[k];
        if (el.hidden) return;
        var r = el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
        var d = Math.abs(+k - cur);
        if (d < near) { near = d; best = +k; }
      });
      return best;
    }

    /* 舞台按住上下拖拽：位移 > 5px 进入跟手转动（往下拉看上周、往上推看下周，
       1 周 ≈ PITCH 122px），松手按最近 100ms 内的脱手速度外推并吸附到整周；
       位移 ≤ 5px 视为点击卡片。 */
    var drag = null, suppressClick = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      drag = {
        id: e.pointerId,
        y0: e.clientY,
        cur0: cur,
        moved: false,
        onGuide: !!(e.target && e.target.closest && e.target.closest('a.rota-guide')),
        pts: [{ y: e.clientY, t: performance.now() }]
      };
    });

    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) > 5) {
        drag.moved = true;
        running = false;
        stage.classList.add('is-dragging');
        if (stage.setPointerCapture) stage.setPointerCapture(drag.id);
      }
      if (!drag.moved) return;
      var now = performance.now();
      drag.pts.push({ y: e.clientY, t: now });
      while (drag.pts.length > 2 && now - drag.pts[0].t > 100) drag.pts.shift();
      cur = aim = from = drag.cur0 - dy / PITCH;
      draw();
    });

    function endDrag(e, cancel) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      stage.classList.remove('is-dragging');
      if (!d.moved) {
        if (!cancel && !d.onGuide) {
          var hit = hitCard(e.clientX, e.clientY);
          if (hit !== null) {
            suppressClick = true;
            go(hit);
          }
        }
        return;
      }
      suppressClick = true;
      var now = performance.now();
      while (d.pts.length > 1 && now - d.pts[0].t > 120) d.pts.shift();
      var p0 = d.pts[0], p1 = d.pts[d.pts.length - 1];
      var dt = p1.t - p0.t;
      var vy = (!cancel && dt > 8) ? (p1.y - p0.y) / dt : 0;
      var fling = Math.max(-4, Math.min(4, -(vy * 220) / PITCH));
      go(Math.round(cur + fling));
    }

    stage.addEventListener('pointerup', function (e) { endDrag(e, false); });
    stage.addEventListener('pointercancel', function (e) { endDrag(e, true); });
    stage.addEventListener('lostpointercapture', function (e) { endDrag(e, false); });

    box.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); suppressClick = false; return; }
      if (e.target && e.target.closest && e.target.closest('a.rota-guide')) return;
      var best = hitCard(e.clientX, e.clientY);
      if (best !== null) go(best);
    });
    draw();
  }

  /* 固定周期轮换表（.gen 带 data-cycle 的表）：按北京时间 01:00 重置算当前周期，
     按表结构自动分型为四种原生形态，原表收起保留无 JS 与搜索兜底，跨过重置点自动刷新：
     - loot：永恒挑战传说掉落池（四列武器盘）
     - drop：单件武器掉落时间轴（右侧 40×40 图标）
     - pipeline：永恒挑战三段遭遇推进流（R1 → R2 → BOSS 等宽对齐）
     - ribbon：独立单列轮换（横向日期轨道条）
     - columns：多列纯文本轮换（顶部单行子表头 + 严格列轨对齐 + 诅咒 3 格强度条） */
  var DEST_ICO = {
    '异域任务': 'icons/7c1bb14539.webp',
    '幽梦之城': 'icons/d0cb509d79.webp',
    '内欧姆那': 'icons/2343bfd45e.webp',
    '月球': 'icons/8b98ce6055.webp',
    '王座世界': 'icons/9dc57beeac.webp',
    '木卫二': 'icons/74caaa1a48.webp',
    '苍白之心': 'icons/5149d5d45a.webp',
    '开普勒': 'icons/e11b86c5c3.webp',
    '永恒挑战': 'icons/731f73bcef.webp'
  };
  var RACE_ICO = [
    ['邪魔族', 'icons/d8cc62b559.webp'],
    ['Vex', 'icons/498a6c3b5e.webp'],
    ['卡巴尔', 'icons/9650bac0bc.webp'],
    ['堕落者', 'icons/f6d2ad0360.webp'],
    ['堕落议会', 'icons/f6d2ad0360.webp'],
    ['嗤魅', 'icons/bc70e1e4e0.webp'],
    ['傀儡', 'icons/00ab7fe800.webp']
  ];
  var ROW_ICO = {
    '光明行刑者': 'icons/f66f454174.webp'
  };

  function cycles() {
    var tables = [].slice.call(document.querySelectorAll('.gen[data-cycle]'));
    if (!tables.length) return;
    var boards = [];

    function fmtDate(ms) {
      var d = new Date(ms + 288e5);
      return (d.getUTCMonth() + 1) + ' 月 ' + d.getUTCDate() + ' 日';
    }

    function splitCell(cell) {
      var raw = cell.innerHTML.trim();
      var parts = raw.split(/<br\s*\/?>/).map(function (s) { return s.trim(); }).filter(Boolean);
      var imgs = cell.querySelectorAll('img');
      return {
        raw: raw,
        text: cell.textContent.trim(),
        parts: parts,
        imgCount: imgs.length,
        firstImg: imgs.length ? imgs[0].getAttribute('src') : ''
      };
    }

    function stripImg(html) {
      return html.replace(/<img\b[^>]*>/gi, '').trim();
    }

    function relTag(off, isDay) {
      if (off === 0) return isDay ? '今日' : '本周';
      if (off === -1) return isDay ? '昨日' : '上周';
      if (off === 1) return isDay ? '明日' : '下周';
      return off > 0 ? off + (isDay ? ' 日后' : ' 周后') : Math.abs(off) + (isDay ? ' 日前' : ' 周前');
    }

    function raceIcon(text) {
      for (var i = 0; i < RACE_ICO.length; i++) {
        if (text.indexOf(RACE_ICO[i][0]) >= 0) return RACE_ICO[i][1];
      }
      return '';
    }

    function decorateValue(html, text) {
      var lvl = text === '弱诅咒' ? 1 : (text === '中诅咒' ? 2 : (text === '强诅咒' ? 3 : 0));
      if (lvl) {
        var bars = '';
        for (var i = 1; i <= 3; i++) bars += '<i' + (i <= lvl ? ' class="on"' : '') + '></i>';
        return '<span class="cyc-curse"><span class="cyc-meter" aria-hidden="true">' + bars + '</span><span>' + html + '</span></span>';
      }
      var rico = raceIcon(text);
      if (rico) {
        return '<span class="cyc-with-ico"><img class="cyc-race-ico" src="' + rico + '" alt="" width="16" height="16"><span>' + html + '</span></span>';
      }
      return html;
    }

    function cleanHead(s) {
      return (s || '').replace(/[（(]每[周日][）)]/g, '').trim();
    }

    tables.forEach(function (t) {
      var rawRows = [].slice.call(t.querySelectorAll('tbody tr:not(.lane)'));
      if (!rawRows.length) return;
      var heads = [].slice.call(t.querySelectorAll('thead th')).map(function (th) {
        return th.textContent.trim();
      });
      var data = rawRows.map(function (tr) {
        return [].slice.call(tr.children).map(splitCell);
      });

      var isLoot = data.some(function (row) {
        return row.some(function (c) { return c.parts.length >= 4 && c.imgCount >= 4; });
      });
      var hasDropIcon = !isLoot && data.some(function (row) {
        return row.some(function (c) { return c.imgCount === 1 && c.parts.length <= 1; });
      });
      var isPipeline = !isLoot && !hasDropIcon && heads.length === 3
        && heads[1].indexOf('第一轮') >= 0 && heads[2].indexOf('第二轮') >= 0;

      var spec = t.dataset.cycle.trim().split(/\s+/);
      var d0 = spec[0].split('.').map(Number);
      var hasTime = spec.length > 2;
      var hm = (hasTime ? spec[1] : '1:00').split(':').map(Number);
      var kind = spec[spec.length - 1];
      var isDay = kind === '日';
      var unit = isDay ? MS_DAY : MS_WEEK;
      var t0 = Date.UTC(d0[0], d0[1] - 1, d0[2], hm[0] - 8, hm[1]);

      var title = cleanHead(heads[0]);
      var cadence = isDay ? '每日 01:00' : '每周三 01:00';
      var cycleLen = data.length + (isDay ? ' 日一轮' : ' 周一轮');

      var sect = t.closest ? t.closest('.block') : null;
      var sectLabel = sect && sect.querySelector('.sect-label')
        ? sect.querySelector('.sect-label').textContent.trim()
        : '';
      var destIco = DEST_ICO[sectLabel] || '';

      var board = document.createElement('div');
      board.className = 'cyc-board';
      board.innerHTML = '<div class="cyc-head">'
        + '<span class="cyc-title-wrap">'
        + (destIco ? '<img class="cyc-head-ico" src="' + destIco + '" alt="" width="18" height="18">' : '')
        + '<span class="cyc-title-bar">' + title + '</span>'
        + '</span>'
        + '<span class="cyc-cadence">'
        + '<span class="cyc-dot"></span>' + cadence
        + '<span class="cyc-sep">·</span>' + cycleLen
        + '</span></div>'
        + '<div class="cyc-subhead" hidden></div>'
        + '<div class="cyc-list"></div>';
      t.parentNode.insertBefore(board, t);
      tuck(t);

      var baseCount = isLoot ? data.length : (data.length <= 3 ? 4 : (data.length === 4 ? 5 : data.length));
      var mode = isLoot ? 'loot'
        : (hasDropIcon ? 'drop'
          : (isPipeline ? 'pipeline'
            : (heads.length === 1 ? 'single' : 'columns')));

      var entry = {
        el: board,
        parent: board.parentNode,
        mode: mode,
        cols: heads.length,
        heads: heads,
        data: data,
        isDay: isDay,
        unit: unit,
        t0: t0,
        rowCount: baseCount,
        paired: false,
        paint: null
      };
      boards.push(entry);
    });

    /* 同分节内紧邻的「掉落表 + 紧凑纯文本表（≤2列）」两两并排成双栏，
       同步行数与子表头，保证左右卡片顶底、子表头与每一行严丝合缝水平对齐。
       多列宽表（≥3列如幽梦之城诅咒/上维挑战）与独立单列轨道保持通栏展示。 */
    var byParent = [];
    boards.forEach(function (b) {
      var g = byParent.find(function (x) { return x.parent === b.parent; });
      if (!g) { g = { parent: b.parent, items: [] }; byParent.push(g); }
      g.items.push(b);
    });
    byParent.forEach(function (g) {
      var i = 0;
      while (i + 1 < g.items.length) {
        var a = g.items[i], b = g.items[i + 1];
        var canPair = a.mode === 'drop' && (b.mode === 'single' || (b.mode === 'columns' && b.cols <= 2));
        if (canPair) {
          var maxRows = Math.max(a.rowCount, b.rowCount);
          a.rowCount = maxRows;
          b.rowCount = maxRows;
          a.paired = true;
          b.paired = true;
          var pair = document.createElement('div');
          pair.className = 'cyc-pair';
          g.parent.insertBefore(pair, a.el);
          pair.appendChild(a.el);
          pair.appendChild(b.el);
          i += 2;
        } else {
          i += 1;
        }
      }
    });

    boards.forEach(function (entry) {
      if (entry.mode === 'single' && !entry.paired) entry.mode = 'ribbon';
      entry.el.classList.add('is-' + entry.mode);
      if (entry.paired) entry.el.classList.add('is-paired');

      var subhead = entry.el.querySelector('.cyc-subhead');
      var list = entry.el.querySelector('.cyc-list');
      var heads = entry.heads;
      var data = entry.data;
      var isDay = entry.isDay;
      var unit = entry.unit;
      var t0 = entry.t0;

      var colTemplate = '';
      if (entry.mode === 'columns') {
        var maxLen = 0;
        data.forEach(function (row) {
          row.forEach(function (c) {
            if (c.text.length > maxLen) maxLen = c.text.length;
          });
        });
        if (maxLen <= 10) entry.el.classList.add('is-center');

        if (entry.cols === 2) {
          colTemplate = entry.paired ? '106px minmax(0, 1.35fr) minmax(0, 1fr)' : '124px minmax(0, 1fr) minmax(0, 1fr)';
        } else if (entry.cols === 3) {
          colTemplate = '124px minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 1.15fr)';
        } else {
          colTemplate = '124px 124px 140px minmax(0, 1.35fr) 120px';
        }
        subhead.hidden = false;
        subhead.style.gridTemplateColumns = colTemplate;
        subhead.innerHTML = '<span>周期</span>' + heads.map(function (h) {
          return '<span>' + cleanHead(h) + '</span>';
        }).join('');
      } else if (entry.mode === 'pipeline') {
        entry.el.classList.add('is-center');
        subhead.hidden = false;
        subhead.style.gridTemplateColumns = '124px minmax(0, 1fr)';
        subhead.innerHTML = '<span>周期</span><span>遭遇推进流程</span>';
      } else if (entry.paired) {
        subhead.hidden = false;
        var hasRowIco = !!ROW_ICO[cleanHead(heads[0])];
        if (entry.mode === 'drop' || hasRowIco) {
          subhead.style.gridTemplateColumns = '106px minmax(0, 1fr) 40px';
          subhead.innerHTML = '<span>周期</span><span>' + cleanHead(heads[0]) + '</span><span class="cyc-sh-r">' + (entry.mode === 'drop' ? '掉落' : '奖励') + '</span>';
        } else {
          subhead.style.gridTemplateColumns = '106px minmax(0, 1fr)';
          subhead.innerHTML = '<span>周期</span><span>' + cleanHead(heads[0]) + '</span>';
        }
      }

      if (entry.mode === 'ribbon') {
        list.style.gridTemplateColumns = 'repeat(' + entry.rowCount + ', minmax(0, 1fr))';
      }

      function renderRow(row, off, slotMs) {
        var state = off === 0 ? ' is-now' : (off < 0 ? ' is-past' : '');
        var dateHtml = '<div class="cyc-date">'
          + '<span class="cyc-day">' + fmtDate(slotMs) + '</span>'
          + '<span class="cyc-rel">' + relTag(off, isDay) + '</span>'
          + '</div>';

        if (entry.mode === 'ribbon') {
          return '<div class="cyc-rib-card' + state + '">'
            + '<div class="cyc-rib-top">'
            + '<span class="cyc-day">' + fmtDate(slotMs) + '</span>'
            + '<span class="cyc-rel">' + relTag(off, isDay) + '</span>'
            + '</div>'
            + '<div class="cyc-rib-name">' + row[0].raw + '</div>'
            + '</div>';
        }

        if (entry.mode === 'loot') {
          var armors = row[0].parts.map(function (p) {
            return '<span class="cyc-item">' + p + '</span>';
          }).join('');
          var weapons = (row[1] ? row[1].parts : []).map(function (p) {
            return '<span class="cyc-item">' + p + '</span>';
          }).join('');
          return '<div class="cyc-row cyc-row-loot' + state + '">'
            + '<div class="cyc-loot-top">' + dateHtml
            + '<div class="cyc-armor-group">' + armors + '</div></div>'
            + '<div class="cyc-loot-grid">' + weapons + '</div>'
            + '</div>';
        }

        if (entry.mode === 'columns') {
          var cells = row.map(function (c, ci) {
            var cls = ci === 0 ? 'cyc-col cyc-col-main' : 'cyc-col';
            return '<div class="' + cls + '">' + decorateValue(c.raw, c.text) + '</div>';
          }).join('');
          return '<div class="cyc-row cyc-row-grid' + state + '" style="grid-template-columns:' + colTemplate + '">'
            + dateHtml + cells + '</div>';
        }

        if (entry.mode === 'pipeline') {
          function stageNode(step, cell, isBoss) {
            var rico = raceIcon(cell.text);
            return '<span class="cyc-stage' + (isBoss ? ' cyc-stage-boss' : '') + '">'
              + '<span class="cyc-step-k">' + step + '</span>'
              + (rico ? '<img class="cyc-race-ico" src="' + rico + '" alt="" width="16" height="16">' : '')
              + '<span class="cyc-step-v">' + cell.raw + '</span></span>';
          }
          return '<div class="cyc-row cyc-row-grid' + state + '" style="grid-template-columns:124px minmax(0, 1fr)">'
            + dateHtml
            + '<div class="cyc-pipe">'
            + stageNode('R1', row[1], false)
            + '<span class="cyc-arrow" aria-hidden="true">→</span>'
            + stageNode('R2', row[2], false)
            + '<span class="cyc-arrow" aria-hidden="true">→</span>'
            + stageNode('BOSS', row[0], true)
            + '</div></div>';
        }

        var iconSrc = '', iconNameHtml = '', iconCol = -1;
        for (var ci = 0; ci < row.length; ci++) {
          if (row[ci].imgCount === 1 && row[ci].parts.length <= 1) {
            iconSrc = row[ci].firstImg;
            iconNameHtml = stripImg(row[ci].raw);
            iconCol = ci;
            break;
          }
        }
        if (!iconSrc && ROW_ICO[cleanHead(heads[0])]) {
          iconSrc = ROW_ICO[cleanHead(heads[0])];
        }

        var mainTitle = iconCol === 0 ? iconNameHtml : row[0].raw;
        var modeBadge = '';
        var metas = [];
        for (var mi = 1; mi < row.length; mi++) {
          if (mi === iconCol) continue;
          if (!row[mi].text) continue;
          if (heads[mi] === '攻防模式') {
            var mCls = row[mi].text === '攻击' ? ' is-atk' : ' is-def';
            modeBadge = '<span class="cyc-mode' + mCls + '">' + row[mi].text + '</span>';
            continue;
          }
          var label = heads[mi] ? '<span class="cyc-k">' + heads[mi] + '</span>' : '';
          metas.push('<span class="cyc-kv">' + label + '<span class="cyc-v">' + row[mi].raw + '</span></span>');
        }

        var rightHtml = '';
        if (iconSrc) {
          var cap = iconCol > 0 && iconNameHtml
            ? '<span class="cyc-drop-name">' + iconNameHtml + '</span>'
            : '';
          rightHtml = '<div class="cyc-drop">' + cap
            + '<img class="cyc-drop-ico" src="' + iconSrc + '" alt="" width="40" height="40" loading="lazy">'
            + '</div>';
        }

        return '<div class="cyc-row' + state + '">'
          + dateHtml
          + '<div class="cyc-main">'
          + '<div class="cyc-name-row">' + modeBadge + '<span class="cyc-name">' + mainTitle + '</span></div>'
          + (metas.length ? '<div class="cyc-meta">' + metas.join('') + '</div>' : '')
          + '</div>'
          + rightHtml
          + '</div>';
      }

      function paint() {
        var elapsed = Date.now() - t0;
        var curSlot = Math.floor(elapsed / unit);
        var n = data.length;
        var offsets = [];
        if (entry.mode === 'loot') {
          for (var a = 0; a < entry.rowCount; a++) offsets.push(a);
        } else {
          for (var b = -1; b <= entry.rowCount - 2; b++) offsets.push(b);
        }
        list.innerHTML = offsets.map(function (off) {
          var idx = (((curSlot + off) % n) + n) % n;
          return renderRow(data[idx], off, t0 + (curSlot + off) * unit);
        }).join('');

        var nextIn = unit - ((elapsed % unit) + unit) % unit + 1000;
        setTimeout(paint, Math.min(nextIn, MS_DAY));
      }
      entry.paint = paint;
      paint();
    });
  }

  /* 页面顶部实时重置倒计时条：整点扭曲切换 + 每日 01:00 重置 + 每周三 01:00 重置，
     全部按 UTC+8 精确计算，每秒刷新。 */
  function clocks() {
    if (!document.querySelector) return;
    var main = document.querySelector('main');
    var first = main && main.querySelector('.block');
    if (!main || !first) return;

    var bar = document.createElement('div');
    bar.className = 'rota-clocks';
    bar.innerHTML = ''
      + '<div class="rc-item"><span class="rc-dot"></span><span class="rc-k">扭曲下站切换</span><span class="rc-v" data-rc="hour">--:--</span></div>'
      + '<div class="rc-item"><span class="rc-dot"></span><span class="rc-k">每日 01:00 重置</span><span class="rc-v" data-rc="day">--:--:--</span></div>'
      + '<div class="rc-item"><span class="rc-dot"></span><span class="rc-k">每周三 01:00 重置</span><span class="rc-v" data-rc="week">--</span></div>';
    main.insertBefore(bar, first);

    var elH = bar.querySelector('[data-rc="hour"]');
    var elD = bar.querySelector('[data-rc="day"]');
    var elW = bar.querySelector('[data-rc="week"]');
    var WEEK_ANCHOR = Date.UTC(2026, 5, 10, 1 - 8, 0);

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function fmtHMS(ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      return pad(h) + ':' + pad(m) + ':' + pad(sec);
    }

    function tick() {
      var now = Date.now();
      var remH = 3600000 - (now % 3600000);
      var remD = MS_DAY - (((now - WEEK_ANCHOR) % MS_DAY) + MS_DAY) % MS_DAY;
      var remW = MS_WEEK - (((now - WEEK_ANCHOR) % MS_WEEK) + MS_WEEK) % MS_WEEK;

      var hs = Math.max(0, Math.floor(remH / 1000));
      elH.textContent = pad(Math.floor(hs / 60)) + ':' + pad(hs % 60);
      elD.textContent = fmtHMS(remD);

      var wd = Math.floor(remW / MS_DAY);
      var wr = remW % MS_DAY;
      elW.textContent = wd > 0 ? wd + ' 天 ' + fmtHMS(wr) : fmtHMS(wr);
    }
    tick();
    setInterval(tick, 1000);
  }

  clocks();
  if (table) rota(table);
  cycles();
}
