/* 周常轮换轴的轮盘。只有 rotation 那一页用。

   从 assets/app.js 拆出来：它是页面专属的，而 app.js 每个带工具条的页面都要下。
   合起来 chart + rota + home 是 app.js 8.9 KB gzip 里的 6.9 KB，却只有三个页面
   跑得到，其余 31 页白下。拆开之后由 app.js 在认出该页的 data-* 时动态 import。

   共用件（tuck）由 app.js 传进来，不在这里重抄一份。 */

export default function init(table, deps) {
  var tuck = deps.tuck;

  /* 周常轮换轴（.gen 带 data-rota 的表）：**顺序只有表里那一份**，轮盘从表里现读，
     画完把表收起，与折线图同一条约定——无 JS 时表就是页面本体。

     滚轮与拖拽都不接，只认点击：这一段嵌在一页可滚动的长文里，接了滚轮就会在读者
     往下滚页面时把轮盘转走，页面反而不动。五张卡片点哪张，哪张就转到中间。

     **位置是连续量，不是三档。**每帧把当前位置往目标位置收一段（指数逼近），卡片
     按分数距离摆——转起来是一根滚轴匀速滚过去，中途的虚化、明暗、缩放都在插值。
     按整步跳、靠 CSS transition 补间那一版会在跨两周时露出「两段各自缓动」的接缝，
     新进场的卡片也只能凭空出现。 */
  var MS_WEEK = 604800000;
  /* 圆柱：每张之间 27°，半径 330px。相邻两张的纵向间距是 sin27°×330 ≈ 150px，
     压过卡片自身的高度（140px），卡片因此不叠在一起。 */
  var STEP = 27, R = 330, WIN = 3;
  /* 一次转动的时长：起步 300ms，每多跨一周加 90ms，最长 520ms。指数逼近那种写法
     （每帧往目标收 16%）尾巴上会拖出一秒多的亚像素爬行，读起来像没停稳。 */
  var SPIN = { base: 300, per: 90, max: 520 };

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
    box.innerHTML = '<div class="rota-stage"></div>'
      + '<div class="rota-btns">'
      + '<button type="button" class="chip" data-go="-1">上一周</button>'
      + '<button type="button" class="chip" data-go="0">本周</button>'
      + '<button type="button" class="chip" data-go="1">下一周</button></div>';
    table.parentNode.insertBefore(box, table);
    tuck(table);

    var stage = box.querySelector('.rota-stage');
    var pool = {};

    function group(kind, label, names) {
      return '<div class="rota-group" data-kind="' + kind + '">'
        + '<span class="rota-kind">' + label + '</span>'
        + names.map(function (n) { return '<span class="rota-pill">' + n + '</span>'; }).join('')
        + '</div>';
    }

    function card(i) {
      if (pool[i]) return pool[i];
      var s = new Date(t0 + i * MS_WEEK), e = new Date(t0 + i * MS_WEEK + 6 * 86400000);
      var r = ((i % raids.length) + raids.length) % raids.length;
      var g = ((i % dungeons.length) + dungeons.length) % dungeons.length;
      /* 右端那一格答的是「这张卡相对现在是什么」：本周那张写「本周」，其余写距今
         几周。年份不写——日期区间已经给了月日，隔着几周比哪一年更是读者要的那个数。 */
      var off = i - here;
      var mark = off === 0 ? '本周' : Math.abs(off) + ' 周' + (off > 0 ? '后' : '前');
      var el = document.createElement('div');
      el.className = 'rota-card' + (i === here ? ' is-now' : '');
      el.innerHTML = '<div class="rota-top"><span class="rota-date">'
        + (s.getMonth() + 1) + '月' + s.getDate() + '日 — '
        + (e.getMonth() + 1) + '月' + e.getDate() + '日</span>'
        + '<span class="rota-badge">' + mark + '</span></div>'
        + '<div class="rota-body">'
        + group('raid', kinds[0], [raids[r], raids[(r + 4) % raids.length]])
        + group('dungeon', kinds[1], [dungeons[g], dungeons[(g + 4) % dungeons.length]])
        + '</div>';
      stage.appendChild(el);
      pool[i] = el;
      return el;
    }

    /* d 是到中间的分数距离。虚化与明暗都写成 d 的连续函数：中间那张清晰，一步之内
       只虚到名字仍读得出，再往外快速虚掉、淡出，滚动途中不出现档与档之间的跳变。 */
    function place(el, d) {
      var a = Math.abs(d);
      el.hidden = a > 2.7;
      if (el.hidden) return;
      var rad = d * STEP * Math.PI / 180;
      el.style.transform = 'translate3d(0,' + (Math.sin(rad) * R).toFixed(1) + 'px,'
        + ((Math.cos(rad) - 1) * R).toFixed(1) + 'px) rotateX(' + (-d * STEP).toFixed(2) + 'deg)';
      var blur = a < 0.25 ? 0 : (a < 1 ? (a - 0.25) : 0.75 + (a - 1) * 2.6);
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
      var p = Math.min(1, (now - t1) / span);
      cur = from + (aim - from) * (1 - Math.pow(1 - p, 3));
      draw();
      running = p < 1;
      if (running) requestAnimationFrame(frame);
    }

    /* 减少动态效果：直接落终态。CSS 那边禁 transition/animation 挡不住这里，
       place() 是逐帧写 inline 的 transform／filter／opacity。 */
    function go(i) {
      if (i === aim) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-go]');
      if (btn) { go(btn.dataset.go === '0' ? here : Math.round(aim) + +btn.dataset.go); return; }
      var best = null, near = Infinity;
      Object.keys(pool).forEach(function (k) {
        var el = pool[k];
        if (el.hidden) return;
        var r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right
          || e.clientY < r.top || e.clientY > r.bottom) return;
        var d = Math.abs(+k - aim);
        if (d < near) { near = d; best = +k; }
      });
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

  return rota(table);
}
