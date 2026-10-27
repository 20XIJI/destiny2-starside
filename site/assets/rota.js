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
  /* 9 突袭 + 10 地牢的徽章小图标（icons/<md5>.webp）与场景底图 */
  var ROTA_ART = {
    '最后一愿': ['98c8ef41c9', '../raid-guides/icons/576f5ee84c.webp'],
    '救赎花园': ['d287b3dc33', '../raid-guides/icons/b0d8e4a22d.webp'],
    '深岩墓室': ['068796ce27', '../raid-guides/icons/cdfa999a61.webp'],
    '玻璃拱顶': ['32e9ee0e2f', '../raid-guides/icons/8bd947ebbb.webp'],
    '门徒誓约': ['189d589701', '../raid-guides/icons/f43ff2553f.webp'],
    '国王的陨落': ['5d2addda27', '../raid-guides/icons/bb815bae2f.webp'],
    '梦魇根源': ['810e9c5f15', '../raid-guides/icons/69e0c96eb4.webp'],
    '克洛塔的末日': ['c8f1bde352', '../raid-guides/icons/a890626de0.webp'],
    '救赎的边缘': ['0c0db34c1c', '../raid-guides/icons/61c6576365.webp'],
    '破碎王座': ['00ab7fe800', 'icons/f8e267b043.webp'],
    '异端深渊': ['9214e0910b', 'icons/7118a61fdd.webp'],
    '预言': ['e9dff45136', 'icons/24e4aed440.webp'],
    '贪婪之握': ['c4510de46d', 'icons/34a0554bb7.webp'],
    '二象性': ['3fa872c35b', 'icons/f9d5856d03.webp'],
    '守望者尖塔': ['1b0cdbee38', 'icons/dcfaa7277e.webp'],
    '深渊机灵': ['1737ba2584', 'icons/b4f0f143f1.webp'],
    '战争领主的废墟': ['56ba6f109c', 'icons/0bf21127d1.webp'],
    '晚星之主': ['9fa7dd1645', 'icons/e3282bc3b3.webp'],
    '分离教义': ['a1fbe13ded', 'icons/4153b19cf3.webp']
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
    var t0 = new Date(d0[0], d0[1] - 1, d0[2], hm[0], hm[1]).getTime();
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
      if (!art) return '<span class="rota-pill"><span class="rota-cap"><span class="rota-name">' + n + '</span></span></span>';
      return '<span class="rota-pill" style="--bg:url(\'' + art[1] + '\')">'
        + '<span class="rota-cap">'
        + '<img class="rota-ico" src="icons/' + art[0] + '.webp" alt="" width="20" height="20">'
        + '<span class="rota-name">' + n + '</span></span></span>';
    }

    function group(kind, names) {
      return '<div class="rota-group" data-kind="' + kind + '">'
        + names.map(pill).join('')
        + '</div>';
    }

    function card(i) {
      if (pool[i]) return pool[i];
      var s = new Date(t0 + i * MS_WEEK), e = new Date(t0 + i * MS_WEEK + 6 * 86400000);
      var r = ((i % raids.length) + raids.length) % raids.length;
      var g = ((i % dungeons.length) + dungeons.length) % dungeons.length;
      /* 左侧独立日期滚轮刻度：本周那张写「本周」，其余写距今几周。
         右侧主滚筒不再重复渲染顶部日期栏，把全部画幅留给四张副本海报。 */
      var off = i - here;
      var mark = off === 0 ? '本周' : Math.abs(off) + ' 周' + (off > 0 ? '后' : '前');
      var el = document.createElement('div');
      el.className = 'rota-card' + (i === here ? ' is-now' : '');
      el.innerHTML = '<div class="rota-dial">'
        + '<span class="rota-badge">' + mark + '</span>'
        + '<span class="rota-date">'
        + (s.getMonth() + 1) + ' 月 ' + s.getDate() + ' 日 — '
        + (e.getMonth() + 1) + ' 月 ' + e.getDate() + ' 日</span></div>'
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
       1 周 ≈ PITCH 150px），松手按最近 100ms 内的脱手速度外推并吸附到整周；
       位移 ≤ 5px 视为点击卡片。 */
    var drag = null, suppressClick = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      drag = {
        id: e.pointerId,
        y0: e.clientY,
        cur0: cur,
        moved: false,
        pts: [{ y: e.clientY, t: performance.now() }]
      };
      if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
    });

    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) > 5) {
        drag.moved = true;
        running = false;
        stage.classList.add('is-dragging');
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
        if (!cancel) {
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
      if (suppressClick) { suppressClick = false; return; }
      var best = hitCard(e.clientX, e.clientY);
      if (best !== null) go(best);
    });
    draw();
  }

  /* 首页的全站搜索（.hero-search 容器存在即接管）：资料页的搜索框只搜本页，
     这里搜全站。索引 assets/search.js 由 tools/build-search.py 从各页产出现扫，
     一条记录一行——带 d 的是页面，带 n 的是条目。

     **首次聚焦才下载**：它 790 KB，进首屏就把首页拖成全站最重的一页。
     **用 <script> 取而不是 fetch**：双击打开的站点也要能搜，而 file:// 下 fetch
     取同目录的文件会被 CORS 挡掉。索引因此是一句 window.starsideIndex = […]。
     命中项的链接带 ?q=，落到那一页之后由那一页自己的搜索框接手过滤，
     所以这里不必知道条目在页面里的哪一行。 */

  /* 固定周期轮换表（.gen 带 data-cycle 的表）：按北京时间 01:00 重置算当前落在第几行，
     给当前行打 data-now-row、首格打 data-now-tag（本周／今日），跨过重置点自动切行。
     多件带图条目拆成独立单元。 */
  function cycles() {
    [].slice.call(document.querySelectorAll('.gen[data-cycle]')).forEach(function (t) {
      var rows = [].slice.call(t.querySelectorAll('tbody tr:not(.lane)'));
      if (!rows.length) return;
      [].slice.call(t.querySelectorAll('tbody th, tbody td')).forEach(function (cell) {
        if (!cell.querySelector('img')) return;
        if (cell.innerHTML.indexOf('<br>') < 0) {
          cell.innerHTML = '<span class="cyc-item cyc-single">' + cell.innerHTML.trim() + '</span>';
          return;
        }
        var parts = cell.innerHTML.split(/<br\s*\/?>/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (parts.length < 2) return;
        var cls = parts.length >= 4 ? 'cyc-grid' : 'cyc-stack';
        cell.innerHTML = '<span class="' + cls + '">'
          + parts.map(function (p) { return '<span class="cyc-item">' + p + '</span>'; }).join('')
          + '</span>';
      });
      var spec = t.dataset.cycle.trim().split(/\s+/);
      var d0 = spec[0].split('.').map(Number);
      var hasTime = spec.length > 2;
      var hm = (hasTime ? spec[1] : '1:00').split(':').map(Number);
      var kind = spec[spec.length - 1];
      var unit = kind === '日' ? MS_DAY : MS_WEEK;
      var tag = kind === '日' ? '今日' : '本周';
      var t0 = Date.UTC(d0[0], d0[1] - 1, d0[2], hm[0] - 8, hm[1]);

      function paint() {
        var elapsed = Date.now() - t0;
        var idx = ((Math.floor(elapsed / unit) % rows.length) + rows.length) % rows.length;
        rows.forEach(function (tr, i) {
          var th = tr.firstElementChild;
          if (i === idx) {
            tr.setAttribute('data-now-row', '');
            if (th) th.setAttribute('data-now-tag', tag);
          } else {
            tr.removeAttribute('data-now-row');
            if (th) th.removeAttribute('data-now-tag');
          }
        });
        var nextIn = unit - ((elapsed % unit) + unit) % unit + 1000;
        setTimeout(paint, Math.min(nextIn, MS_DAY));
      }
      paint();
    });
  }

  if (table) rota(table);
  cycles();
}
