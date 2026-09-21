/* 装备库（武器与异域护甲）。数据三份，由 tools/build-weapons.py 从实体层生成，字段表写在
   .claude/rules/weapons.md：
     index.js  window.WPN        首屏：卡片墙、筛选、结果栏
     pool.js   window.WPN_POOL   词条池、属性曲线、大师杰作与模组
     text.js   window.WPN_TEXT   描述、说明、站内实测、作者评语
   后两份首屏画完就在空闲时取；查询或详情先用到时立刻取。 */
(function () {
  'use strict';

  var D = window.WPN;
  var root = document.getElementById('find');
  var bar = document.querySelector('.site-head .toolbar');
  if (!root || !bar) { return; }
  if (!D) {
    root.innerHTML = '<p class="empty">武器数据没有载入：weapons/index.js 取不到。</p>';
    return;
  }

  /* ── 字段下标：与 build-weapons.py 的行一一对应 ───────────────────── */
  var W_H = 0, W_NAME = 1, W_SUB = 2, W_EL = 3, W_AMMO = 4, W_SLOT = 5, W_BR = 6, W_SSN = 7,
      W_TIER = 8, W_FLAG = 9, W_ICON = 10, W_WM = 11, W_FR = 12, W_SRC = 13, W_GRADE = 14,
      W_REP = 15, W_FAM = 16;
  /* 套装行 t[i]：hash（set:…）、名字、英文名、来源、类型、赛季、标签、效果。
     来源写活动名（发射基地），类型写活动种类（熔炉竞技场行动），56 套各写其一。 */
  var T_H = 0, T_NAME = 1, T_EN = 2, T_SRC = 3, T_KIND = 4, T_SSN = 5, T_TAG = 6, T_FX = 7;
  var A_H = 0, A_NAME = 1, A_PART = 2, A_CLS = 3, A_SSN = 4, A_ICON = 5, A_WM = 6, A_PERKS = 7,
      A_ROLE = 8, A_SRC = 9, A_REP = 10, A_FAM = 11;
  var F_ADEPT = 1, F_HOLO = 2, F_CRAFT = 4, F_TIER = 8, F_MW = 16, F_ENH = 32, F_REISSUE = 64;
  var P_HASH = 0, P_NAME = 1, P_ICON = 2, P_TYPE = 3, P_ST = 4, P_CD = 5;
  var R_STAT = 0, R_TRAIT = 1, R_ORIGIN = 2, R_INTRINSIC = 3;
  /* 框架行上页面的那几项，下标与 build-weapons.FRAME_FIELDS 同序 */
  var FR_TIER = 0, FR_ADD = 1, FR_BOSS = 2, FR_RANGE = 3, FR_RPM = 4, FR_RELOAD = 5, FR_MDPS = 6, FR_BDPS = 7,
    FR_MBRICK = 8, FR_BBRICK = 9;
  var TIER_STEP = { F: 1, E: 2, D: 3, C: 5, B: 6, A: 7, S: 8 };

  var V = D.v;
  var ICONS = '../assets/icons/';
  /* 首屏的卡片：1440×900 下卡片墙一屏 6 列 6 行。这些图不懒载，前 12 张再提优先级。 */
  var N_EAGER = 36, N_HIGH = 12;
  /* 卡片墙与列表一批铺多少：两千张一次铺完首屏要等好几秒，滚到底再添一批。 */
  var BATCH = 120;
  /* 细分行只列能再切一刀的值：多于 10 把、又不是全部。与 destiny.report 同一条。 */
  var REFINE_MIN = 10;
  var RAIL_MIN = 140, RAIL_MAX = 280;

  /* ── 小工具 ────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 整路径的图（护甲套装那几枚在 armor-sets/icons/ 下，序号命名）。 */
  function pathImg(path, eager) {
    if (!path) { return ''; }
    return '<img src="' + esc(path) + '" alt=""' +
      (eager === 2 ? ' fetchpriority="high"' : eager ? '' : ' loading="lazy"') + '>';
  }
  function imgTag(stem, cls, alt, eager) {
    if (!stem) { return ''; }
    return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + ICONS + stem + '.webp" alt="' +
      esc(alt || '') + '"' + (eager === 2 ? ' fetchpriority="high"' : eager ? '' : ' loading="lazy"') + '>';
  }
  /* 类型与弹药小图标引页内 sprite。外层 svg 要带上那枚 symbol 的 viewBox，
     否则没有固有尺寸，宽度按 300px 算。 */
  var boxes = {};
  function glyph(key, label) {
    if (boxes[key] == null) {
      var sym = document.getElementById('g-' + key);
      boxes[key] = sym ? sym.getAttribute('viewBox') : '';
      if (!sym) { console.error('sprite 里没有 g-' + key); }
    }
    return '<svg class="g" viewBox="' + boxes[key] + '" role="img" aria-label="' + esc(label || '') + '"><use href="#g-' + key + '"></use></svg>';
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage 写不进 ' + key, e); }
  }
  function recall(key) {
    try { var got = localStorage.getItem(key); return got == null ? null : JSON.parse(got); } catch (e) {
      console.warn('localStorage 读不出 ' + key, e);
      return null;
    }
  }
  function has(list, x) { return list.indexOf(x) !== -1; }

  /* ── 载入：pool.js / text.js ───────────────────────────────────────── */
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  var loads = {};
  function need(name, cb) {
    var ready = name === 'pool' ? window.WPN_POOL : window.WPN_TEXT;
    if (ready) { if (cb) { cb(); } return true; }
    var job = loads[name];
    if (!job) {
      job = loads[name] = { cbs: [], failed: false };
      var s = document.createElement('script');
      s.src = new URL(name + '.js', HERE).href;
      s.onload = function () {
        if (name === 'pool') { poolReady(); } else { textReady(); }
        var cbs = job.cbs; job.cbs = [];
        for (var i = 0; i < cbs.length; i++) { cbs[i](); }
      };
      s.onerror = function () {
        job.failed = true;
        console.error('载不动 weapons/' + name + '.js');
        root.insertAdjacentHTML('afterbegin', '<p class="empty">weapons/' + name + '.js 取不到，词条与说明画不出来。</p>');
      };
      document.head.appendChild(s);
    }
    if (cb) { job.cbs.push(cb); }
    return false;
  }
  var P = null, T = null, PIDX = {}, SIDX = null;
  function poolReady() {
    P = window.WPN_POOL;
    for (var i = 0; i < P.p.length; i++) { PIDX[P.p[i][P_HASH]] = i; }
    SIDX = {};
    for (var j = 0; j < P.s.length; j++) { SIDX[P.s[j][1]] = j; }
    hayCache = {};
    perkIndex = null;
  }
  function textReady() {
    T = window.WPN_TEXT;
    hayCache = {};
  }

  /* ── 属性：与 tools/facts.py 的 shown() 同一套，四条缺一不可 ─────────
     不加默认插件；先按上限截断再插值；两端截断不外推；银行家舍入。 */
  function bankers(x) {
    var f = Math.floor(x), r = x - f;
    if (r > 0.5) { return f + 1; }
    if (r < 0.5) { return f; }
    return f % 2 === 0 ? f : f + 1;
  }
  function interp(v, curve) {
    var n = curve.length;
    if (!n) { return v; }
    if (v <= curve[0]) { return curve[1]; }
    if (v >= curve[n - 2]) { return curve[n - 1]; }
    var i = 0;
    while (i + 2 < n && curve[i + 2] <= v) { i += 2; }
    var x0 = curve[i], y0 = curve[i + 1], x1 = curve[i + 2], y1 = curve[i + 3];
    return bankers(y0 + (v - x0) * (y1 - y0) / (x1 - x0));
  }
  /* row 是属性组的一行：[属性下标, 上限, 曲线, 纯数值]。 */
  function shown(v, row) {
    return interp(Math.min(v, row[1]), row[2]);
  }

  /* 后坐方向扇形：DIM 的公式，参数照 destiny.report（竖向 0.8、最大张角 180°）。 */
  function recoilSvg(v) {
    var dir = Math.sin((v + 5) * (Math.PI / 10)) * (100 - v);
    var t = dir * 0.8 * (Math.PI / 180);
    var spread = (100 - v) / 100 * 90 * (Math.PI / 180) * (t < 0 ? -1 : t > 0 ? 1 : 0);
    var shape;
    if (v >= 95) {
      shape = '<line x1="' + (1 - Math.sin(t)) + '" y1="' + (1 + Math.cos(t)) + '" x2="' + (1 + Math.sin(t)) +
        '" y2="' + (1 - Math.cos(t)) + '" stroke="#e6e2d6" stroke-width=".1"/>';
    } else {
      shape = '<path d="M1,1 L' + (1 + Math.sin(t + spread)) + ',' + (1 - Math.cos(t + spread)) + ' A1,1 0 0,' +
        (t < 0 ? 1 : 0) + ' ' + (1 + Math.sin(t - spread)) + ',' + (1 - Math.cos(t - spread)) + ' Z" fill="#e6e2d6"/>';
    }
    return '<svg viewBox="0 0 2 1" aria-hidden="true"><circle r="1" cx="1" cy="1" fill="#ffffff10"/>' + shape + '</svg>';
  }

  /* ── 行与分组 ──────────────────────────────────────────────────────── */
  var WR = D.w, AR = D.a, SR = D.t || [];
  /* 护甲套装一套一行，没有版本也没有同族，所以每一行都是自己的代表行。 */
  function rowsOf(scope) { return scope === 'armor' ? AR : scope === 'sets' ? SR : WR; }
  function isRep(scope, i) {
    return scope === 'sets' ? true : (scope === 'armor' ? AR[i][A_REP] : WR[i][W_REP]) === i;
  }
  function repsOf(scope) {
    var rows = rowsOf(scope), out = [];
    for (var i = 0; i < rows.length; i++) { if (isRep(scope, i)) { out.push(i); } }
    return out;
  }
  var REPS = { wpn: repsOf('wpn'), armor: repsOf('armor'), sets: repsOf('sets') };
  var BY_HASH = { wpn: {}, armor: {}, sets: {} };
  (function () {
    for (var i = 0; i < WR.length; i++) { BY_HASH.wpn[WR[i][W_H]] = i; }
    for (var j = 0; j < AR.length; j++) { BY_HASH.armor[AR[j][A_H]] = j; }
    for (var k = 0; k < SR.length; k++) { BY_HASH.sets[SR[k][T_H]] = k; }
  }());

  function typeName(r) { return V.ty[r[W_SUB]][0]; }
  function frameOf(r) { return V.fr[r[W_FR]]; }
  function srcOf(r, at) { var k = r[at]; return k >= 0 ? V.src[k] : ''; }
  function elName(r) { return V.el[r[W_EL]][0]; }
  function rarity(r) { return V.rar[r[W_TIER]] || ''; }
  function isExotic(r) { return r[W_TIER] === 6; }
  function enOf(scope, i) {
    if (scope === 'sets') { return SR[i][T_EN] || ''; }
    if (!P) { return ''; }
    return (scope === 'armor' ? P.aen : P.en)[i] || '';
  }

  /* 叠层图标：底图、水印、阶级角标、锻造层，底部打光由样式表画。 */
  function gun(r, size, eager) {
    var layers = imgTag(r[W_ICON], '', '', eager);
    if (r[W_WM] >= 0) { layers += imgTag(V.wm[r[W_WM]], '', '', eager); }
    if (r[W_FLAG] & F_TIER) { layers += imgTag(V.o.tier, '', '', eager); }
    if (r[W_FLAG] & F_CRAFT) {
      layers += imgTag(V.o['craft-bg'], 'flip', '', eager) + imgTag(V.o.craft, 'flip', '', eager);
    }
    return '<span class="gun' + (r[W_FLAG] & F_MW ? ' mw' : '') + (size ? ' ' + size : '') + '">' + layers + '</span>';
  }
  function armorGun(r, size, eager) {
    var layers = imgTag(r[A_ICON], '', '', eager);
    if (r[A_WM] >= 0) { layers += imgTag(V.wm[r[A_WM]], '', '', eager); }
    return '<span class="gun' + (size ? ' ' + size : '') + '">' + layers + '</span>';
  }

  /* ── 词条池的读法 ──────────────────────────────────────────────────── */
  function poolRow(i) { return P.w[i]; }
  function cellsOf(col) { return P.L[col[2]]; }
  function shownPlug(cell) { return cell[1] >= 0 ? cell[1] : cell[0]; }
  function plugName(p) { return P.p[p][P_NAME]; }
  /* 固有开成一栏的那把（故我在的 8 枚异域内在随机开一枚）：返回那一栏，否则 null。
     有这一栏就说明这把枪没有单一固有，「异域特性」那一块与事实 chip 都不能只写一枚。 */
  function intrinsicCol(i) {
    if (!P) { return null; }
    var cols = poolRow(i)[2];
    for (var c = 0; c < cols.length; c++) { if (cols[c][1] === R_INTRINSIC) { return cols[c]; } }
    return null;
  }
  function marksOf(i) {
    var out = {}, m = poolRow(i)[3];
    for (var k = 0; k < m.length; k++) { out[m[k][0]] = m[k][1]; }
    return out;
  }
  function optsOf(i) { var k = poolRow(i)[6]; return k >= 0 ? P.M[k] : []; }
  function modsOf(i) { var k = poolRow(i)[7]; return k >= 0 ? P.D[k] : []; }

  /* ── 查询：DIM 的语法，关键字英文、值写中文 ──────────────────────── */
  var KEYS_WPN = ['is', 'name', 'perk', 'perk1', 'perk2', 'perkname', 'perktext', 'origintrait', 'frame',
                  'stat', 'season', 'source', 'breaker'];
  var KEYS_ARMOR = ['is', 'name', 'perk', 'season', 'source'];
  /* 护甲套装认得的关键字：kw() 那一段只写了这几个，别的放进来补全会列出 stat:、
     frame: 这些，选了永远是 0 条。 */
  var KEYS_SETS = ['is', 'name', 'perk', 'season', 'source'];
  function keysOf(scope) {
    return scope === 'armor' ? KEYS_ARMOR : scope === 'sets' ? KEYS_SETS : KEYS_WPN;
  }
  var POOL_KEYS = ['perk', 'perk1', 'perk2', 'perkname', 'origintrait', 'stat'];
  var KEY_LABEL = { is: '类型、元素、槽位、弹药、稀有度、勇士与标志', name: '名字', perk: '任一栏的词条',
    perk1: '第一特性栏', perk2: '第二特性栏', perkname: '词条名完全相同', perktext: '词条说明',
    origintrait: '起源特性', frame: '框架', stat: '属性', season: '赛季', source: '来源', breaker: '勇士克制' };

  function normQ(s) {
    return s.replace(/：/g, ':').replace(/（/g, '(').replace(/）/g, ')').replace(/[“”]/g, '"').replace(/　/g, ' ');
  }
  /* 切成 token，每个带它在原文里的 [a, b)。全角标点按半角认，长度不变，位置照旧对得上。 */
  function tokenize(src) {
    var s = normQ(src), out = [], i = 0, n = s.length;
    function value() {
      var v = '', quoted = false;
      if (s[i] === '"') {
        quoted = true; i++;
        while (i < n && s[i] !== '"') { v += s[i++]; }
        if (i < n) { i++; }
      } else {
        while (i < n && s[i] !== ' ' && s[i] !== ')' && s[i] !== '(') { v += s[i++]; }
      }
      return { v: v, q: quoted };
    }
    while (i < n) {
      var c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '(' || c === ')') { out.push({ t: c, a: i, b: i + 1 }); i++; continue; }
      var a = i, neg = false;
      if (c === '-' && i + 1 < n && s[i + 1] !== ' ') { neg = true; i++; }
      var m = /^([a-z][a-z0-9]*):/i.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        var got = value();
        out.push({ t: 'kw', k: m[1].toLowerCase(), v: got.v, neg: neg, a: a, b: i });
        continue;
      }
      var w = value();
      if (!neg && !w.q && /^(or|and|not)$/i.test(w.v)) {
        out.push({ t: w.v.toLowerCase(), a: a, b: i });
      } else if (w.v) {
        out.push({ t: 'w', v: w.v, neg: neg, a: a, b: i });
      }
    }
    return out;
  }
  /* not > and > or；括号分组。未知关键字当裸词；悬空的 or 与不配对的括号忽略。 */
  function parse(tokens, keys) {
    var at = 0;
    function peek() { return tokens[at]; }
    function unary() {
      var t = peek();
      if (!t) { return null; }
      if (t.t === 'not') { at++; var x = unary(); return x ? { op: 'not', x: x } : null; }
      if (t.t === '(') {
        at++;
        var inner = orExpr();
        if (peek() && peek().t === ')') { at++; }
        return inner;
      }
      if (t.t === 'kw' || t.t === 'w') {
        at++;
        var node = t.t === 'kw' && has(keys, t.k) ? { op: 'kw', k: t.k, v: t.v, tok: t }
          : { op: 'w', v: t.t === 'kw' ? t.k + ':' + t.v : t.v, tok: t };
        return t.neg ? { op: 'not', x: node, tok: t } : node;
      }
      return null;
    }
    function andExpr() {
      var parts = [];
      while (peek() && peek().t !== 'or' && peek().t !== ')') {
        if (peek().t === 'and') { at++; continue; }
        var x = unary();
        if (x) { parts.push(x); } else { at++; }
      }
      return parts.length === 1 ? parts[0] : parts.length ? { op: 'and', xs: parts } : null;
    }
    function orExpr() {
      var parts = [andExpr()];
      while (peek() && peek().t === 'or') { at++; parts.push(andExpr()); }
      parts = parts.filter(Boolean);
      return parts.length === 1 ? parts[0] : parts.length ? { op: 'or', xs: parts } : null;
    }
    var out = [];
    while (at < tokens.length) {
      var x = orExpr();
      if (x) { out.push(x); }
      if (peek() && peek().t === ')') { at++; }
    }
    return out.length === 1 ? out[0] : out.length ? { op: 'and', xs: out } : null;
  }
  function needsPool(node) {
    if (!node) { return false; }
    if (node.op === 'kw') { return has(POOL_KEYS, node.k); }
    if (node.op === 'not') { return needsPool(node.x); }
    if (node.xs) { for (var i = 0; i < node.xs.length; i++) { if (needsPool(node.xs[i])) { return true; } } }
    return false;
  }

  function fold(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
  function cmp(spec, n) {
    var m = /^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/.exec(spec);
    if (!m) { return false; }
    var x = parseFloat(m[2]);
    switch (m[1] || '=') {
      case '>=': return n >= x;
      case '<=': return n <= x;
      case '>': return n > x;
      case '<': return n < x;
      default: return n === x;
    }
  }

  /* is: 的值 → 判定。武器与护甲各一张，值取自数据，标志是固定的几个。 */
  var pins = recall('wpn.pins') || [];
  function isTable(scope) {
    var t = {};
    if (scope === 'sets') {
      // 套装按来源筛：来源写活动名、类型写活动种类，两列都收进 is:。
      SR.forEach(function (row) {
        [row[T_SRC], row[T_KIND]].forEach(function (v) {
          if (v) { t[v] = function (i) { return SR[i][T_SRC] === v || SR[i][T_KIND] === v; }; }
        });
      });
      t['已钉选'] = function (i) { return has(pins, 't:' + SR[i][T_H]); };
      return t;
    }
    if (scope === 'armor') {
      V.cls.forEach(function (c, k) { t[c] = function (i) { return AR[i][A_CLS] === k; }; });
      V.part.forEach(function (p, k) { t[p] = function (i) { return AR[i][A_PART] === k; }; });
      t['异域'] = function () { return true; };
      t['已钉选'] = function (i) { return has(pins, 'a:' + AR[i][A_H]); };
      return t;
    }
    Object.keys(V.ty).forEach(function (sub) {
      var n = V.ty[sub][0], s = +sub;
      t[n] = function (i) { return WR[i][W_SUB] === s; };
    });
    Object.keys(V.el).forEach(function (e) {
      var n = V.el[e][0], k = +e;
      t[n] = function (i) { return WR[i][W_EL] === k; };
    });
    V.slot.forEach(function (n, k) {
      var prev = t[n];
      t[n] = function (i) { return WR[i][W_SLOT] === k || (prev ? prev(i) : false); };
    });
    Object.keys(V.am).forEach(function (a) {
      var n = V.am[a][0], k = +a, prev = t[n];
      t[n] = function (i) { return WR[i][W_AMMO] === k || (prev ? prev(i) : false); };
    });
    Object.keys(V.rar).forEach(function (r) {
      var k = +r;
      t[V.rar[r]] = function (i) { return WR[i][W_TIER] === k; };
    });
    Object.keys(V.br).forEach(function (b) {
      var k = +b;
      t[V.br[b][0]] = function (i) { return WR[i][W_BR] === k; };
    });
    var flags = { '可锻造': F_CRAFT, '可强化': F_ENH, '可升阶': F_TIER, '专家': F_ADEPT, '全息': F_HOLO, '复刻': F_REISSUE };
    Object.keys(flags).forEach(function (n) {
      var f = flags[n];
      t[n] = function (i) { return (WR[i][W_FLAG] & f) !== 0; };
    });
    t['已钉选'] = function (i) { return has(pins, 'w:' + WR[i][W_H]); };
    return t;
  }
  var IS = { wpn: isTable('wpn'), armor: isTable('armor'), sets: isTable('sets') };

  /* 裸词搜的那一串：名字、英文名、类型、框架、词条名、描述。有什么数据就先搜什么，
     词条池与说明到了之后缓存作废、重搜一遍。 */
  var hayCache = {};
  function hay(scope, i) {
    var key = scope + i;
    if (hayCache[key] != null) { return hayCache[key]; }
    var parts;
    if (scope === 'sets') {
      var t = SR[i];
      parts = [t[T_NAME], t[T_EN], t[T_SRC], t[T_KIND], t[T_SSN], t[T_TAG]].concat(
        t[T_FX].map(function (f) { return f[0]; }));
      if (T && T.st[i]) { T.st[i].forEach(function (f) { parts.push(f[4]); }); }
    } else if (scope === 'armor') {
      var a = AR[i];
      parts = [a[A_NAME], V.cls[a[A_CLS]], V.part[a[A_PART]], a[A_PERKS], a[A_ROLE], srcOf(a, A_SRC), enOf('armor', i)];
      if (T && T.fa[i] >= 0) { parts.push(T.FL[T.fa[i]]); }
    } else {
      var r = WR[i];
      parts = [r[W_NAME], typeName(r), frameOf(r)[0], srcOf(r, W_SRC), enOf('wpn', i)];
      if (P) { parts.push(perkNames(i).join(' ')); }
      if (T && T.fw[i] >= 0) { parts.push(T.FL[T.fw[i]]); }
    }
    return (hayCache[key] = fold(parts.join(' ')));
  }
  function perkNames(i, role, nth) {
    var out = [], cols = poolRow(i)[2], seen = 0;
    for (var c = 0; c < cols.length; c++) {
      if (role != null && cols[c][1] !== role) { continue; }
      if (role === R_TRAIT) { seen++; if (nth && seen !== nth) { continue; } }
      var cells = cellsOf(cols[c]);
      for (var k = 0; k < cells.length; k++) { out.push(plugName(shownPlug(cells[k]))); }
    }
    return out;
  }
  function perkTexts(i) {
    var out = [], cols = poolRow(i)[2];
    for (var c = 0; c < cols.length; c++) {
      var cells = cellsOf(cols[c]);
      for (var k = 0; k < cells.length; k++) { out.push(T.pd[shownPlug(cells[k])] || ''); }
    }
    return out.join(' ');
  }
  var statCache = {};
  function defaultStat(i, sIdx) {
    var key = i + ':' + sIdx;
    if (statCache[key] == null) {
      var res = compute(i, defaultRoll(i, true));
      statCache[key] = res.byStat[sIdx] == null ? -1 : res.byStat[sIdx].value;
    }
    return statCache[key];
  }

  function test(scope, node, i) {
    switch (node.op) {
      case 'and': for (var a = 0; a < node.xs.length; a++) { if (!test(scope, node.xs[a], i)) { return false; } } return true;
      case 'or': for (var o = 0; o < node.xs.length; o++) { if (test(scope, node.xs[o], i)) { return true; } } return false;
      case 'not': return !test(scope, node.x, i);
      case 'w': return hay(scope, i).indexOf(fold(node.v)) !== -1;
      default: return kw(scope, node.k, node.v, i);
    }
  }
  function kw(scope, k, v, i) {
    var f = fold(v), r;
    if (scope === 'sets') {
      var t = SR[i];
      switch (k) {
        case 'is': return IS.sets[v] ? IS.sets[v](i) : false;
        case 'name': return fold(t[T_NAME] + ' ' + t[T_EN]).indexOf(f) !== -1;
        case 'perk': return fold(t[T_FX].map(function (x) { return x[0]; }).join(' ')).indexOf(f) !== -1;
        case 'season': return fold(t[T_SSN]).indexOf(f) !== -1;
        case 'source': return fold(t[T_SRC] + ' ' + t[T_KIND]).indexOf(f) !== -1;
      }
      return false;
    }
    if (scope === 'armor') {
      r = AR[i];
      switch (k) {
        case 'is': return IS.armor[v] ? IS.armor[v](i) : false;
        case 'name': return fold(r[A_NAME] + enOf('armor', i)).indexOf(f) !== -1;
        case 'perk': return fold(r[A_PERKS]).indexOf(f) !== -1;
        case 'season': return cmp(v, r[A_SSN]);
        case 'source': return fold(srcOf(r, A_SRC)).indexOf(f) !== -1;
      }
      return false;
    }
    r = WR[i];
    switch (k) {
      case 'is': return IS.wpn[v] ? IS.wpn[v](i) : false;
      case 'name': return fold(r[W_NAME] + ' ' + enOf('wpn', i)).indexOf(f) !== -1;
      case 'frame': return fold(frameOf(r)[0]).indexOf(f) !== -1;
      case 'season': return cmp(v, r[W_SSN]);
      case 'source': return fold(srcOf(r, W_SRC)).indexOf(f) !== -1;
      case 'breaker': return r[W_BR] > 0 && fold(V.br[r[W_BR]][0]).indexOf(f) !== -1;
      case 'perktext': return T ? fold(perkTexts(i)).indexOf(f) !== -1 : false;
    }
    if (!P) { return false; }
    switch (k) {
      case 'perk':
        if (fold(perkNames(i).join(' ')).indexOf(f) !== -1) { return true; }
        return T ? fold(perkTexts(i)).indexOf(f) !== -1 : false;
      case 'perk1': return fold(perkNames(i, R_TRAIT, 1).join(' ')).indexOf(f) !== -1;
      case 'perk2': return fold(perkNames(i, R_TRAIT, 2).join(' ')).indexOf(f) !== -1;
      case 'perkname': return perkNames(i).some(function (n) { return fold(n) === f; });
      case 'origintrait': return fold(perkNames(i, R_ORIGIN).join(' ')).indexOf(f) !== -1;
      case 'stat': {
        var m = /^([^:]+):(.+)$/.exec(v);
        if (!m) { return false; }
        var s = statIndex(m[1]);
        if (s < 0) { return false; }
        var got = defaultStat(i, s);
        return got >= 0 && cmp(m[2], got);
      }
    }
    return false;
  }
  function statIndex(name) {
    for (var s = 0; s < P.s.length; s++) { if (P.s[s][1] === name) { return s; } }
    for (var t = 0; t < P.s.length; t++) { if (P.s[t][1].indexOf(name) !== -1) { return t; } }
    return -1;
  }
  function run(scope, node) {
    var reps = REPS[scope];
    if (!node) { return reps.slice(); }
    return reps.filter(function (i) { return test(scope, node, i); });
  }

  /* ── 状态与地址栏 ──────────────────────────────────────────────────── */
  var S = {
    scope: 'wpn', q: '', view: recall('wpn.view') || 'grid', sel: null,
    rail: recall('wpn.rail') || 240, railOff: !!recall('wpn.railOff'), rolls: recall('wpn.rolls') || {},
    syntax: false, pop: null, tip: null, hoverPlug: null, hoverRow: null, slotHover: false
  };
  function readUrl() {
    var u = new URLSearchParams(location.search);
    S.scope = u.get('s') === 'armor' ? 'armor' : u.get('s') === 'sets' ? 'sets' : 'wpn';
    S.q = u.get('q') || '';
    var w = u.get('w');
    S.sel = w && BY_HASH[S.scope][w] != null ? BY_HASH[S.scope][w] : null;
    S.urlRoll = null;
    if (S.sel != null && S.scope === 'wpn' && (u.get('p') || u.get('mw') || u.get('t') || u.get('mod') || u.get('cat'))) {
      S.urlRoll = { p: u.get('p') || '', mw: u.get('mw'), lv: u.get('lv'), t: u.get('t'), mod: u.get('mod'), cat: u.get('cat') };
    }
  }
  function writeUrl(push) {
    var u = new URLSearchParams();
    if (S.scope !== 'wpn') { u.set('s', S.scope); }
    if (S.q) { u.set('q', S.q); }
    if (S.sel != null) {
      u.set('w', rowsOf(S.scope)[S.sel][0]);
      if (S.scope === 'wpn' && P) {
        var roll = rollOf(S.sel), def = defaultRoll(S.sel);
        if (!sameRoll(roll, def)) {
          var enc = encodeRoll(S.sel, roll);
          Object.keys(enc).forEach(function (k) { u.set(k, enc[k]); });
        }
      }
    }
    var qs = u.toString();
    var url = location.pathname + (qs ? '?' + qs : '');
    if (push) { history.pushState(null, '', url); } else { history.replaceState(null, '', url); }
  }

  /* ── 配置：选中的词条、大师杰作、T 级、模组、催化剂 ──────────────── */
  function defaultRoll(i, bare) {
    var pr = poolRow(i), cols = pr[2], sel = {};
    for (var c = 0; c < cols.length; c++) {
      var cells = cellsOf(cols[c]);
      if (cells.length === 1) { sel[c] = shownPlug(cells[0]); }
    }
    // Aegis 推荐的大师杰作可以有几枚（「填装\\操控性」），缺省装上第一枚。
    var opts = optsOf(i), rec = (pr[5] || []).filter(function (r) {
      return opts.some(function (o) { return o[0] === r; });
    });
    var mw = !bare && rec.length ? rec[0] : '';
    return { sel: sel, mw: mw, lv: 10, t: pr[4] ? 5 : 0, mod: -1, cat: 0 };
  }
  function sameRoll(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function rollOf(i) {
    var h = WR[i][W_H];
    if (!S.rolls[h]) { S.rolls[h] = defaultRoll(i); }
    return S.rolls[h];
  }
  function saveRoll(i) {
    var h = WR[i][W_H], def = defaultRoll(i);
    if (sameRoll(S.rolls[h], def)) { delete S.rolls[h]; }
    store('wpn.rolls', S.rolls);
    if (!S.rolls[h]) { S.rolls[h] = def; }
    writeUrl(false);
  }
  function encodeRoll(i, roll) {
    var cols = poolRow(i)[2], p = [];
    for (var c = 0; c < cols.length; c++) { p.push(roll.sel[c] != null ? P.p[roll.sel[c]][P_HASH] : '-'); }
    var out = { p: p.join(',') };
    if (roll.mw) { out.mw = roll.mw; if (!poolRow(i)[4]) { out.lv = roll.lv; } } else { out.mw = '-'; }
    if (poolRow(i)[4]) { out.t = roll.t; }
    if (roll.mod >= 0) { out.mod = P.p[roll.mod][P_HASH]; }
    if (roll.cat) { out.cat = 1; }
    return out;
  }
  function decodeRoll(i, enc) {
    var roll = defaultRoll(i), cols = poolRow(i)[2];
    var p = (enc.p || '').split(',');
    for (var c = 0; c < cols.length && c < p.length; c++) {
      if (p[c] === '-' || !p[c]) { if (cellsOf(cols[c]).length > 1) { delete roll.sel[c]; } continue; }
      var k = PIDX[+p[c]];
      var ok = cellsOf(cols[c]).some(function (cell) { return shownPlug(cell) === k; });
      if (ok) { roll.sel[c] = k; }
    }
    if (enc.mw === '-') { roll.mw = ''; } else if (enc.mw && optsOf(i).some(function (o) { return o[0] === enc.mw; })) { roll.mw = enc.mw; }
    if (enc.lv) { roll.lv = Math.max(1, Math.min(10, +enc.lv || 10)); }
    if (enc.t) { roll.t = Math.max(1, Math.min(5, +enc.t || 5)); }
    if (enc.mod && PIDX[+enc.mod] != null && has(modsOf(i), PIDX[+enc.mod])) { roll.mod = PIDX[+enc.mod]; }
    roll.cat = enc.cat ? 1 : 0;
    return roll;
  }

  /* 大师杰作与 T 级各自加在哪几项、各加多少。算法照 destiny.report：
     可升阶的枪，大师杰作给选中属性 +10；装着大师杰作时，T 级给这枚插件列出的每一项
     +T（选中属性也在其中）。旧枪没有 T 级：1–9 级只给选中属性加它自己的数，满级取
     插件本身，专家版满级时其余 +3。 */
  function mwParts(i, roll) {
    var out = { mw: {}, tier: {}, opt: null };
    if (!roll.mw) { return out; }
    var opt = null, opts = optsOf(i);
    for (var k = 0; k < opts.length; k++) { if (opts[k][0] === roll.mw) { opt = opts[k]; } }
    if (!opt) { return out; }
    out.opt = opt;
    var pr = poolRow(i), plug = P.p[opt[2]], s;
    if (pr[4]) {
      var tot = {};
      plug[P_ST].concat(plug[P_CD]).forEach(function (x) { tot[x[0]] = (tot[x[0]] || 0) + x[1]; });
      for (s in tot) {
        if (tot[s]) { out.mw[s] = tot[s]; }
        if (roll.t) { out.tier[s] = roll.t; }
      }
      return out;
    }
    if (roll.lv < 10) {
      if (has(opt[4], roll.lv)) { out.mw[opt[1]] = roll.lv; }
      return out;
    }
    plug[P_ST].forEach(function (x) { out.mw[x[0]] = (out.mw[x[0]] || 0) + x[1]; });
    if ((WR[i][W_FLAG] & F_ADEPT) && opt[3] >= 0) {
      P.p[opt[3]][P_CD].forEach(function (x) { if (x[1]) { out.mw[x[0]] = (out.mw[x[0]] || 0) + x[1]; } });
    }
    return out;
  }

  /* 一个配置的全部属性。swap 是悬停预览：{栏: 插件}，栏写 -1 表示去掉那一栏。 */
  function compute(i, roll, swap) {
    var pr = poolRow(i), group = P.g[pr[0]], base = pr[1], cols = pr[2];
    var parts = [], perks = [], cond = {};
    for (var c = 0; c < cols.length; c++) {
      var pick = roll.sel[c];
      if (swap && swap.col === c) { pick = swap.plug; }
      if (pick == null || pick < 0) { continue; }
      (cols[c][1] === R_STAT ? parts : perks).push(pick);
    }
    if (roll.cat) { pr[8].forEach(function (p) { perks.push(p); }); }
    if (roll.mod >= 0) { perks.push(roll.mod); }
    function sum(list) {
      var out = {};
      list.forEach(function (p) {
        P.p[p][P_ST].forEach(function (x) { out[x[0]] = (out[x[0]] || 0) + x[1]; });
        P.p[p][P_CD].forEach(function (x) { cond[x[0]] = (cond[x[0]] || 0) + x[1]; });
      });
      return out;
    }
    var stages = [['s-part', sum(parts)], ['s-perk', sum(perks)]];
    var mw = mwParts(i, roll);
    stages.push(['s-mw', mw.mw], ['s-tier', mw.tier]);
    var rows = [], byStat = {};
    for (var g = 0; g < group.length; g++) {
      if (base[g] == null) { continue; }
      var row = group[g], s = row[0], acc = base[g];
      var v0 = shown(acc, row), prev = v0, neg = 0, segs = [];
      for (var k = 0; k < stages.length; k++) {
        if (!stages[k][1][s]) { continue; }
        acc += stages[k][1][s];
        var v = shown(acc, row);
        if (v > prev) { segs.push([stages[k][0], v - prev]); } else if (v < prev) { neg += prev - v; }
        prev = v;
      }
      var withCond = cond[s] ? shown(acc + cond[s], row) : prev;
      var item = { s: s, row: row, name: P.s[s][1], numeric: row[3], value: prev, base: v0,
                   cond: withCond > prev ? withCond - prev : 0, neg: neg, segs: segs, acc: acc, withCond: withCond };
      rows.push(item);
      byStat[s] = item;
    }
    return { rows: rows, byStat: byStat, parts: parts, perks: perks, mw: mw };
  }

  /* ── 外壳：顶栏里的范围开关、查询框、计数与视图 ─────────────────── */
  var EXAMPLES = ['is:手炮', 'perk:萤火虫', 'is:可锻造', 'season:>=27', 'stat:射程:>=60', 'breaker:反屏障',
                  'frame:精密框架', 'is:专家'];
  var SYNTAX = [
    ['萤火虫 自填', '裸词：名字、类型、框架、词条名与描述里都含这些字'],
    ['is:主手 is:手炮 is:烈日', '槽位（主手／副手／威能）、类型、元素、弹药、稀有度、勇士'],
    ['is:泰坦 is:头盔', '异域护甲：职业、部位'],
    ['is:可锻造 is:专家', '标志：可锻造、可强化、可升阶、专家、全息、复刻、已钉选'],
    ['perk:萤火虫', '任一栏开得出这个词条（名字或说明）'],
    ['perk1:高爆载荷 perk2:萤火虫', '限定第一、第二特性栏'],
    ['perkname:"全明星"', '词条名完全相同'],
    ['perktext:填装', '词条说明里含这些字'],
    ['origintrait:失时弹匣', '起源特性'],
    ['frame:适配框架', '框架'],
    ['stat:射程:>=60', '属性，比较写 = > < >= <='],
    ['season:>=26', '赛季'],
    ['source:玻璃拱顶', '来源'],
    ['breaker:反屏障', '勇士克制'],
    ['is:手炮 (perk:萤火虫 or perk:狂乱) -is:专家', '空格是「且」，or 是「或」，- 是排除，括号分组']
  ];
  bar.innerHTML =
    '<div class="wpn-q">' +
    '<div class="wpn-scope" role="group" aria-label="范围">' +
    '<button type="button" class="toggle" data-act="scope" data-v="wpn">武器</button>' +
    '<button type="button" class="toggle" data-act="scope" data-v="armor">异域护甲</button>' +
    '<button type="button" class="toggle" data-act="scope" data-v="sets">护甲套装</button></div>' +
    '<div class="wpn-field"><input class="wpn-input" type="search" autocomplete="off" spellcheck="false" ' +
    'role="combobox" aria-expanded="false" aria-controls="wpn-ac" aria-label="搜索装备" ' +
    'placeholder="名字、词条，或 is:手炮 perk:萤火虫 season:&gt;=26">' +
    '<ul class="wpn-suggest" id="wpn-ac" role="listbox" hidden></ul></div>' +
    '<p class="wpn-count" aria-live="polite"></p>' +
    '<div class="wpn-views">' +
    '<button type="button" class="toggle" data-act="view" data-v="grid">卡片</button>' +
    '<button type="button" class="toggle" data-act="view" data-v="list">列表</button>' +
    '<button type="button" class="toggle" data-act="syntax" aria-expanded="false">语法</button>' +
    '<div class="wpn-syntax" role="dialog" aria-label="查询语法" hidden><table>' +
    SYNTAX.map(function (r) {
      return '<tr><td><button type="button" class="toggle" data-act="setq" data-v="' + esc(r[0]) + '"><code>' +
        esc(r[0]) + '</code></button></td><td>' + esc(r[1]) + '</td></tr>';
    }).join('') +
    '</table><p>关键字照 DIM 的写法，值用中文；DIM 里抄来的查询多数能直接用。</p></div></div>' +
    '<div class="wpn-pills" hidden></div></div>';
  var input = bar.querySelector('.wpn-input');
  var acBox = bar.querySelector('.wpn-suggest');
  var countBox = bar.querySelector('.wpn-count');
  var pillBox = bar.querySelector('.wpn-pills');
  var syntaxBox = bar.querySelector('.wpn-syntax');
  root.innerHTML = '<div class="wpn-presets"></div><div class="wpn-sub"></div><div class="wpn-body"></div>';
  var presetBox = root.querySelector('.wpn-presets');
  var subBox = root.querySelector('.wpn-sub');
  var body = root.querySelector('.wpn-body');
  var tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  /* sticky 的结果栏要知道顶栏多高。顶栏高度随药丸行变，每次重画后量一次。 */
  var head = document.querySelector('.site-head');
  function measureStick() {
    document.documentElement.style.setProperty('--stick', head.getBoundingClientRect().height + 'px');
  }

  /* ── 渲染：顶栏 ────────────────────────────────────────────────────── */
  var tokens = [], tree = null, results = [], pending = false;
  function pillIcon(t) {
    if (t.t !== 'kw') { return ''; }
    if (t.k === 'is') {
      for (var e in V.el) { if (V.el[e][0] === t.v) { return imgTag(V.el[e][2], '', '', true); } }
      for (var b in V.br) { if (V.br[b][0] === t.v) { return imgTag(V.br[b][1], '', '', true); } }
      for (var s in V.ty) { if (V.ty[s][0] === t.v) { return glyph(V.ty[s][1]); } }
      for (var a in V.am) { if (V.am[a][0] === t.v) { return '<span class="ammo-' + a + '">' + glyph(V.am[a][1]) + '</span>'; } }
    }
    if ((t.k === 'perk' || t.k === 'perkname' || t.k === 'perk1' || t.k === 'perk2' || t.k === 'origintrait') && P) {
      var got = perkIcon(t.v);
      if (got) { return imgTag(got, '', '', true); }
    }
    if (t.k === 'breaker') { for (var r in V.br) { if (V.br[r][0] === t.v) { return imgTag(V.br[r][1], '', '', true); } } }
    return '';
  }
  var perkIconCache = null;
  function perkIcon(name) {
    if (!perkIconCache) {
      perkIconCache = {};
      for (var i = 0; i < P.p.length; i++) {
        if (P.p[i][P_ICON] && !perkIconCache[P.p[i][P_NAME]]) { perkIconCache[P.p[i][P_NAME]] = P.p[i][P_ICON]; }
      }
    }
    return perkIconCache[name] || '';
  }
  function renderBar() {
    bar.querySelectorAll('[data-act="scope"]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.scope ? 'true' : 'false');
    });
    bar.querySelectorAll('[data-act="view"]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.view ? 'true' : 'false');
    });
    bar.querySelector('[data-act="syntax"]').setAttribute('aria-expanded', S.syntax ? 'true' : 'false');
    syntaxBox.hidden = !S.syntax;
    if (input.value !== S.q && document.activeElement !== input) { input.value = S.q; }
    var total = REPS[S.scope].length;
    var unit = S.scope === 'armor' ? '件' : S.scope === 'sets' ? '套' : '把';
    countBox.innerHTML = !S.q ? '<b>' + total + '</b> ' + unit
      : '<b>' + (pending ? '…' : results.length) + '</b> / ' + total + ' ' + unit;
    var pills = tokens.filter(function (t) { return t.t === 'kw' || t.t === 'w'; });
    pillBox.hidden = !pills.length;
    pillBox.innerHTML = pills.map(function (t) {
      var wait = pending && t.t === 'kw' && has(POOL_KEYS, t.k);
      return '<span class="wpn-pill' + (wait ? ' is-wait' : '') + (t.neg ? ' is-not' : '') + '">' + pillIcon(t) +
        (t.t === 'kw' ? '<span class="k">' + esc(t.k) + ':</span>' + esc(t.v) : esc(t.v)) +
        '<button type="button" data-act="unpill" data-a="' + t.a + '" data-b="' + t.b + '" aria-label="去掉这一条">×</button></span>';
    }).join('');
    measureStick();
  }

  /* ── 渲染：预选行、示例与细分 ──────────────────────────────────────── */
  function hasToken(tok) {
    return tokens.some(function (t) { return t.t === 'kw' && !t.neg && t.k + ':' + t.v === tok; });
  }
  function toggleRow(label, toks, counts) {
    return '<div class="wpn-row"><span class="lbl">' + label + '</span>' + toks.map(function (tok, k) {
      return '<button type="button" class="toggle" data-act="preset" data-v="' + esc(tok) + '" aria-pressed="' +
        (hasToken(tok) ? 'true' : 'false') + '"><code>' + esc(tok) + '</code><span class="n">' + counts[k] + '</span></button>';
    }).join('') + '</div>';
  }
  function renderPresets() {
    if (S.scope === 'armor') {
      var byCls = [0, 0, 0];
      REPS.armor.forEach(function (i) { byCls[AR[i][A_CLS]]++; });
      var order = ['术士', '泰坦', '猎人'];
      presetBox.innerHTML = toggleRow('职业', order.map(function (c) { return 'is:' + c; }),
        order.map(function (c) { return byCls[V.cls.indexOf(c)]; }));
      return;
    }
    var bySlot = [0, 0, 0];
    REPS.wpn.forEach(function (i) { bySlot[WR[i][W_SLOT]]++; });
    presetBox.innerHTML = toggleRow('槽位', V.slot.map(function (s) { return 'is:' + s; }), bySlot);
  }
  function refineRow() {
    var total = results.length, cnt = {}, lab = {};
    function add(tok, label) { cnt[tok] = (cnt[tok] || 0) + 1; lab[tok] = label; }
    results.forEach(function (i) {
      if (S.scope === 'armor') {
        var a = AR[i];
        add('is:' + V.cls[a[A_CLS]], V.cls[a[A_CLS]]);
        add('is:' + V.part[a[A_PART]], V.part[a[A_PART]]);
        if (a[A_SRC] >= 0) { add('source:' + V.src[a[A_SRC]], '<span class="k">来源</span>' + esc(V.src[a[A_SRC]])); }
        return;
      }
      var r = WR[i];
      add('is:' + elName(r), imgTag(V.el[r[W_EL]][2], '', '', true) + esc(elName(r)));
      if (r[W_BR]) { add('is:' + V.br[r[W_BR]][0], imgTag(V.br[r[W_BR]][1], '', '', true) + esc(V.br[r[W_BR]][0])); }
      add('frame:' + frameOf(r)[0], esc(frameOf(r)[0]));
      add('is:' + V.am[r[W_AMMO]][0], esc(V.am[r[W_AMMO]][0]));
      if (r[W_SRC] >= 0) { add('source:' + V.src[r[W_SRC]], '<span class="k">来源</span>' + esc(V.src[r[W_SRC]])); }
      if (r[W_FLAG] & F_CRAFT) { add('is:可锻造', '可锻造'); }
      if (r[W_FLAG] & F_TIER) { add('is:可升阶', '可升阶'); }
    });
    var toks = Object.keys(cnt).filter(function (t) { return cnt[t] > REFINE_MIN && cnt[t] < total && !hasToken(t); });
    if (!toks.length) { return ''; }
    toks.sort(function (a, b) { return cnt[b] - cnt[a]; });
    return '<div class="wpn-row"><span class="lbl">细分</span>' + toks.map(function (t) {
      return '<button type="button" class="toggle" data-act="refine" data-v="' + esc(t) + '" title="shift 点击排除">' +
        lab[t] + '<span class="n">' + cnt[t] + '</span></button>';
    }).join('') + '</div>';
  }
  function renderSub() {
    if (pending) {
      subBox.innerHTML = '<div class="wpn-row"><span class="loading">正在载入词条池</span></div>';
      return;
    }
    if (!S.q) {
      subBox.innerHTML = S.scope !== 'wpn' ? '' : '<div class="wpn-row"><span class="lbl">试试这些</span>' +
        EXAMPLES.map(function (e) {
          return '<button type="button" class="toggle" data-act="setq" data-v="' + esc(e) + '"><code>' + esc(e) + '</code></button>';
        }).join('') + '</div>';
      return;
    }
    subBox.innerHTML = S.sel == null ? refineRow() : '';
  }

  /* ── 渲染：卡片墙与列表 ────────────────────────────────────────────── */
  function card(i, k) {
    var eager = k < N_HIGH ? 2 : k < N_EAGER ? 1 : 0;
    if (S.scope === 'sets') {
      var t = SR[i];
      // 两条效果各占一行：图、件数、效果名。**不把图摆成左边那一块**——一套的
      // 主角是两条效果，摞在名字左边会让人读成「一件装备的两枚图标」。
      return '<li><a class="wpn-card set-card" href="' + link('sets', i) + '" data-act="open" data-i="' + i + '">' +
        '<div><p class="nm">' + esc(t[T_NAME]) + '</p>' +
        '<div class="wpn-meta">' +
        (setSrc(t) ? '<span class="cls">' + esc(setSrc(t)) + '</span>' : '') +
        (t[T_SSN] ? '<span class="ssn">' + esc(t[T_SSN]) + '</span>' : '') + '</div>' +
        '<div class="set-lines">' + t[T_FX].map(function (f) {
          return '<span>' + pathImg(f[2], eager) + '<b>' + f[1] + ' 件</b>' + esc(f[0]) + '</span>';
        }).join('') + '</div>' +
        (t[T_TAG] ? '<div class="wpn-grades"><span>' + esc(t[T_TAG]) + '</span></div>' : '') +
        '</div></a></li>';
    }
    if (S.scope === 'armor') {
      var a = AR[i];
      var first = (a[A_PERKS] || '').split('、')[0];
      return '<li><a class="wpn-card" href="' + link('armor', i) + '" data-act="open" data-i="' + i + '">' + armorGun(a, '', eager) +
        '<div><p class="nm exo">' + esc(a[A_NAME]) + '</p><div class="wpn-meta"><span class="cls">' + V.cls[a[A_CLS]] +
        '</span><span class="cls">' + V.part[a[A_PART]] + '</span><span class="ssn">S' + a[A_SSN] + '</span></div>' +
        '<div class="wpn-frame">' + esc(first) + '</div>' +
        (a[A_ROLE] ? '<div class="wpn-grades"><span><span class="by">小棒猪</span>' + esc(a[A_ROLE]) + '</span></div>' : '') +
        '</div></a></li>';
    }
    var r = WR[i];
    return '<li><a class="wpn-card" href="' + link('wpn', i) + '" data-act="open" data-i="' + i + '">' + gun(r, '', eager) +
      '<div><p class="nm' + (isExotic(r) ? ' exo' : '') + '">' + esc(r[W_NAME]) + '</p>' + meta(r) +
      '<div class="wpn-frame">' + esc(frameOf(r)[0]) + '</div>' + gradesHtml(r) + '</div></a></li>';
  }
  function meta(r) {
    return '<div class="wpn-meta">' + imgTag(V.el[r[W_EL]][2], '', elName(r), true) +
      '<span class="ammo-' + r[W_AMMO] + '">' + glyph(V.am[r[W_AMMO]][1], V.am[r[W_AMMO]][0]) + '</span>' +
      glyph(V.ty[r[W_SUB]][1], typeName(r)) +
      (r[W_BR] ? imgTag(V.br[r[W_BR]][1], '', V.br[r[W_BR]][0], true) : '') +
      '<span class="ssn">S' + r[W_SSN] + '</span></div>';
  }
  function gradesHtml(r) {
    var g = r[W_GRADE];
    if (!g) { return ''; }
    return '<div class="wpn-grades">' + (g[0] ? '<span><span class="by">AEGIS</span>' + esc(g[0]) + '</span>' : '') +
      (g[1] ? '<span><span class="by">小棒猪</span>' + esc(g[1]) + '</span>' : '') + '</div>';
  }
  function listRow(i, dup) {
    if (S.scope === 'sets') {
      var t = SR[i];
      return '<li><a href="' + link('sets', i) + '" data-act="open" data-i="' + i + '" class="wpn-lrow"><span></span>' +
        '<span class="ssn">' + esc(t[T_SSN]) + '</span><span></span>' + pathImg(t[T_FX][0] ? t[T_FX][0][2] : '') +
        '<span class="nm">' + esc(t[T_NAME]) + '</span><span class="ty">' + esc(setSrc(t)) +
        '</span><span></span><span class="fr">' +
        esc(t[T_FX].map(function (f) { return f[1] + ' 件 ' + f[0]; }).join('｜')) +
        '</span><span class="wpn-grades">' + esc(t[T_TAG]) + '</span></a></li>';
    }
    if (S.scope === 'armor') {
      var a = AR[i];
      return '<li><a href="' + link('armor', i) + '" data-act="open" data-i="' + i + '" class="wpn-lrow"><span></span>' +
        '<span class="ssn">S' + a[A_SSN] + '</span><span></span>' + armorGun(a, 'sm') + '<span class="nm exo">' + esc(a[A_NAME]) +
        '</span><span class="ty">' + V.cls[a[A_CLS]] + ' · ' + V.part[a[A_PART]] + '</span><span></span><span class="fr">' +
        esc(a[A_PERKS]) + '</span><span class="wpn-grades">' + esc(a[A_ROLE]) + '</span></a></li>';
    }
    var r = WR[i], g = r[W_GRADE];
    var fr = frameOf(r);
    return '<li><a href="' + link('wpn', i) + '" data-act="open" data-i="' + i + '" class="wpn-lrow">' +
      imgTag(V.el[r[W_EL]][2], 'el', elName(r)) + '<span class="ssn' + (dup ? ' dup' : '') + '">S' + r[W_SSN] + '</span>' +
      '<span class="ammo-' + r[W_AMMO] + ' wpn-meta">' + glyph(V.am[r[W_AMMO]][1]) + '</span>' + gun(r, 'sm') +
      '<span class="nm' + (isExotic(r) ? ' exo' : '') + '">' + esc(r[W_NAME]) + '</span><span class="ty">' +
      glyph(V.ty[r[W_SUB]][1]) + esc(typeName(r)) + '</span>' +
      (r[W_BR] ? imgTag(V.br[r[W_BR]][1], 'br', V.br[r[W_BR]][0]) : '<span></span>') +
      '<span class="fr">' + imgTag(fr[1]) + esc(fr[0]) + '</span><span class="wpn-grades">' +
      (g ? esc([g[0] ? 'AEGIS ' + g[0] : '', g[1] ? '小棒猪 ' + g[1] : ''].filter(Boolean).join('　')) : '') + '</span></a></li>';
  }
  function link(scope, i) {
    var u = new URLSearchParams();
    if (scope !== 'wpn') { u.set('s', scope); }
    if (S.q) { u.set('q', S.q); }
    u.set('w', rowsOf(scope)[i][0]);
    return '?' + u.toString();
  }

  var observer = null;
  function batches(list, render, box, cls) {
    if (observer) { observer.disconnect(); observer = null; }
    var ol = document.createElement('ol');
    ol.className = cls;
    box.appendChild(ol);
    var at = 0;
    function more() {
      var end = Math.min(list.length, at + BATCH), html = '';
      for (var k = at; k < end; k++) { html += render(list[k], k); }
      ol.insertAdjacentHTML('beforeend', html);
      at = end;
      if (at < list.length) {
        var sentinel = ol.lastElementChild;
        observer = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { observer.disconnect(); more(); }
        }, { rootMargin: '800px' });
        observer.observe(sentinel);
      }
    }
    more();
  }

  function emptyState() {
    var top = tree && tree.op === 'and' ? tree.xs : tree ? [tree] : [];
    var noun = S.scope === 'armor' ? '异域护甲' : '武器';
    if (top.length < 2) { return '<div class="empty"><h3>没有符合条件的' + noun + '</h3><p>换一个词，或看看「语法」。</p></div>'; }
    var btns = top.map(function (node, k) {
      var rest = top.filter(function (_, j) { return j !== k; });
      var n = run(S.scope, rest.length === 1 ? rest[0] : { op: 'and', xs: rest }).length;
      var t = node.tok || (node.x && node.x.tok);
      var raw = t ? S.q.slice(t.a, t.b) : '';
      return t ? '<button type="button" class="toggle" data-act="unpill" data-a="' + t.a + '" data-b="' + t.b + '">去掉 <code>' +
        esc(raw) + '</code><span class="n">' + n + '</span></button>' : '';
    }).join('');
    return '<div class="empty"><h3>没有符合全部条件的' + noun + '</h3><p>去掉其中一条之后还剩：</p><div class="wpn-row">' + btns + '</div></div>';
  }
  function skeleton() {
    var one = '<li><div class="wpn-card"><span class="gun"></span><div><p class="nm">占位</p><div class="wpn-meta"></div>' +
      '<div class="wpn-frame"></div></div></div></li>';
    return '<ol class="wpn-grid skel">' + new Array(13).join(one) + '</ol>';
  }
  function renderBrowse() {
    body.innerHTML = '';
    if (pending) { body.innerHTML = skeleton(); return; }
    if (!results.length) { body.innerHTML = emptyState(); return; }
    if (S.view === 'list') {
      var names = {};
      results.forEach(function (i) { var n = S.scope === 'armor' ? AR[i][A_NAME] : WR[i][W_NAME]; names[n] = (names[n] || 0) + 1; });
      batches(results, function (i) {
        return listRow(i, S.scope === 'wpn' && names[WR[i][W_NAME]] > 1);
      }, body, 'wpn-list');
      return;
    }
    batches(results, card, body, 'wpn-grid');
  }

  /* ── 渲染：结果栏 ──────────────────────────────────────────────────── */
  function railRow(scope, i, current) {
    var rows = scope === 'armor' ? AR : WR, r = rows[i];
    var sub = scope === 'armor' ? V.cls[r[A_CLS]] + ' · ' + V.part[r[A_PART]] + ' · S' + r[A_SSN]
      : imgTag(V.el[r[W_EL]][2]) + 'S' + r[W_SSN] + ' · ' + esc(typeName(r));
    var exo = scope === 'armor' || isExotic(r);
    return '<li><a href="' + link(scope, i) + '" data-act="open" data-i="' + i + '" data-scope="' + scope + '"' +
      (i === current && scope === S.scope ? ' aria-current="page"' : '') + '>' +
      (scope === 'armor' ? armorGun(r, 'sm') : gun(r, 'sm')) + '<span><span class="nm' + (exo ? ' exo' : '') + '">' +
      esc(r[1]) + '</span><span class="sub">' + sub + '</span></span></a></li>';
  }
  function renderRail() {
    if (S.railOff) {
      return '<div class="rail-off"><button type="button" class="op" data-act="rail" aria-label="展开结果栏">›</button>' +
        '<span class="n">' + results.length + '</span></div>';
    }
    var pinned = pins.map(function (p) {
      var scope = p.slice(0, 1) === 'a' ? 'armor' : 'wpn', i = BY_HASH[scope][p.slice(2)];
      return i == null ? '' : railRow(scope, i, S.sel);
    }).join('');
    return '<nav class="wpn-rail" aria-label="结果"><span class="grip" data-act="grip"></span>' +
      (pinned ? '<div class="rail-head"><b>钉选</b>' + pins.length + '<span class="op-sep"></span>' +
        '<button type="button" class="op" data-act="unpinall">清空</button></div><ol class="rail-list">' + pinned + '</ol>' : '') +
      '<div class="rail-head"><b>结果</b>' + results.length + '<span class="op-sep"></span>' +
      '<button type="button" class="op" data-act="rail">收起</button></div><ol class="rail-list rail-hits"></ol></nav>';
  }
  function renderSplit() {
    if (observer) { observer.disconnect(); observer = null; }
    body.innerHTML = '<div class="wpn-split' + (S.railOff ? ' is-off' : '') + '" style="--rail:' + S.rail + 'px">' +
      renderRail() + '<div class="wpn-detail"></div></div>';
    var hits = body.querySelector('.rail-hits');
    if (hits) {
      var at = 0, list = results;
      var more = function () {
        var end = Math.min(list.length, at + BATCH), html = '';
        for (var k = at; k < end; k++) { html += railRow(S.scope, list[k], S.sel); }
        hits.insertAdjacentHTML('beforeend', html);
        at = end;
        if (at < list.length) {
          observer = new IntersectionObserver(function (es) {
            if (es[0].isIntersecting) { observer.disconnect(); more(); }
          }, { root: hits.parentNode, rootMargin: '400px' });
          observer.observe(hits.lastElementChild);
        }
      };
      more();
    }
    renderDetail();
  }

  /* ── 渲染：详情 ────────────────────────────────────────────────────── */
  function renderDetail() {
    var box = body.querySelector('.wpn-detail');
    if (!box) { return; }
    var i = S.sel;
    if (S.scope === 'sets') {
      if (!T) { box.innerHTML = '<p class="loading">正在载入说明</p>'; need('text', renderDetail); return; }
      box.innerHTML = setDetail(i);
      return;
    }
    if (S.scope === 'armor') {
      if (!T) { box.innerHTML = '<p class="loading">正在载入说明</p>'; need('text', renderDetail); return; }
      box.innerHTML = armorDetail(i);
      return;
    }
    if (!P) { box.innerHTML = '<p class="loading">正在载入词条池</p>'; need('pool', renderDetail); return; }
    if (!T) { need('text', renderDetail); }
    box.innerHTML = weaponDetail(i);
  }

  /* 用过这一件的配装。**按主键收**：配装源稿的槽位值写成「名字#主键」，同名不同物
     按名字收会把两把枪的配装混成一堆。一套一行，点进去是那一页。 */
  /* 用过它的配装：**摆的就是配装推荐页那张卡**，整段 HTML 由 build-weapons.py 从
     那一页的产出现取，样式跟着内联进页壳。强度光环、审核意见、合集的马赛克与
     「3 套」角标因此原样都在，这一页一条都不必重画。赞数那一枚在这里是死的：
     它由配装页自己的脚本填，这一页不引那份。 */
  /* 一套的来源：来源那一列写活动名，类型那一列写活动种类，56 套各写其一。 */
  function setSrc(t) { return t[T_SRC] || t[T_KIND] || ''; }

  function usedByHtml(hash) {
    var got = T && T.bd ? T.bd[String(hash)] : null;
    if (!got || !got.length) { return ''; }
    return '<section><h3 class="sub-label">用过它的配装<b class="n">' + got.length +
      '</b></h3><ul class="entries used-builds">' + got.map(function (k) {
        return T.bdc[k];
      }).join('') + '</ul></section>';
  }

  /* 作者在页面上的写法。数据里的键是 Aegis 与 LGpig。 */
  var AUTHOR = { Aegis: 'AEGIS', LGpig: '小棒猪' };
  var HALO = { 1: ['by-a', 'Aegis 推荐'], 2: ['by-l', '小棒猪推荐'], 3: ['by-al', '两位作者都推荐'] };
  function plugButton(c, cell, marks, pressed, fixed) {
    var p = shownPlug(cell), bits = marks[cell[0]] || 0;
    var cls = 'plug' + (cell[1] >= 0 ? ' is-enh' : '') + (bits ? ' ' + HALO[bits][0] : '') +
      (S.hoverPlug && S.hoverPlug.col === c && S.hoverPlug.plug === p ? ' is-hover' : '') + (fixed ? ' fixed' : '');
    return '<button type="button" class="' + cls + '" aria-pressed="' + (pressed ? 'true' : 'false') + '"' +
      (bits ? ' title="' + HALO[bits][1] + '"' : '') + ' data-act="perk" data-col="' + c + '" data-plug="' + p + '">' +
      '<span class="ico">' + imgTag(P.p[p][P_ICON], '', '', true) + '</span><span class="nm">' + esc(plugName(p)) + '</span></button>';
  }
  function haloLegend() {
    return '<span class="aside halo-key"><i class="by-a"></i>Aegis 推荐<i class="by-l"></i>小棒猪推荐' +
      '<i class="by-al"></i>两位都推荐</span>';
  }
  function tierText(i, roll, mw) {
    if (!roll.mw) { return 'T' + roll.t + ' 加成在装上大师杰作之后生效'; }
    /* 选中的那一项排第一，其余按属性面板的顺序。 */
    var pr = poolRow(i), group = P.g[pr[0]], names = [];
    for (var g = 0; g < group.length; g++) {
      var s = group[g][0];
      if (pr[1][g] == null || !mw.tier[s]) { continue; }
      if (mw.opt && s === mw.opt[1]) { names.unshift(P.s[s][1]); } else { names.push(P.s[s][1]); }
    }
    return 'T' + roll.t + ' 加成：' + names.join('、') + ' 各 +' + roll.t;
  }
  function weaponDetail(i) {
    var r = WR[i], pr = poolRow(i), roll = rollOf(i), rep = r[W_REP];
    var cols = pr[2], marks = marksOf(i);
    var swap = S.hoverPlug ? { col: S.hoverPlug.col, plug: S.hoverPlug.plug } : null;
    var res = compute(i, roll), ghost = swap ? compute(i, roll, swap) : null;
    var matrix = cols.map(function (col, c) {
      var cells = cellsOf(col), fixed = cells.length === 1;
      return '<div class="col"><h4>' + esc(P.lb[col[0]]) + '</h4>' + cells.map(function (cell) {
        return plugButton(c, cell, marks, roll.sel[c] === shownPlug(cell), fixed);
      }).join('') + '</div>';
    }).join('');
    var choice = cols.some(function (col) { return cellsOf(col).length > 1; });
    var parts = [];
    parts.push('<header class="one-head">' + gun(r, 'lg', 2) + '<div><h2' + (isExotic(r) ? ' class="exo"' : '') + '>' +
      esc(r[W_NAME]) + '</h2><p class="en">' + esc(enOf('wpn', i)) + '</p><p class="lore">' +
      (T && T.fw[i] >= 0 ? esc(T.FL[T.fw[i]]) : '') + '</p></div><div class="one-acts">' +
      '<button type="button" class="toggle" data-act="pin" aria-pressed="' + (isPinned('wpn', i) ? 'true' : 'false') + '">' +
      (isPinned('wpn', i) ? '已钉选' : '钉选') + '</button></div></header>');
    parts.push('<div class="one-main">');
    if (isExotic(r) && T && T.xs[rep]) { parts.push(exoticBlock(T.xs[rep])); }
    parts.push('<section><h3 class="sub-label">词条' + (choice ? haloLegend() : '') + '</h3><div class="matrix">' + matrix + '</div></section>');
    var say = T && T.au[rep] ? T.au[rep] : null;
    if (say) { parts.push('<section><h3 class="sub-label">作者评语</h3><div class="says">' + saysHtml(say) + '</div></section>'); }
    parts.push(gearSection(i, roll, res));
    if (pr[8].length) { parts.push(catalystSection(i, roll)); }
    var fr = frameOf(r), fp = PIDX[fr[3]], icol = intrinsicCol(i);
    var frames = icol ? cellsOf(icol).map(function (cell) {
      var p = shownPlug(cell);
      return '<div class="frame">' + imgTag(P.p[p][P_ICON], '', '', true) + '<div><b>' + esc(plugName(p)) +
        '</b><p>' + (T && T.pd[p] ? esc(T.pd[p]) : '') + '</p></div></div>';
    }).join('') : '<div class="frame">' + imgTag(fr[1], '', '', true) + '<div><b>' + esc(fr[0]) + '</b>' +
      (fr[2][r[W_SUB]] ? '<span class="rate">' + fr[2][r[W_SUB]] + ' 发/分</span>' : '') +
      '<p>' + (T && fp != null ? esc(T.pd[fp]) : '') + '</p></div></div>';
    parts.push('<section><h3 class="sub-label">' + (isExotic(r) ? '异域特性' : '框架') + '</h3>' + frames + '</section>');
    parts.push(usedByHtml(r[W_H]));
    parts.push('</div>');
    parts.push('<aside class="one-side"><section><div class="facts">' + factsHtml(i) + '</div></section>' +
      '<section><h3 class="sub-label">属性</h3>' + statsPanel(res, ghost) + '</section>' +
      frameStatsHtml(i) + versionsHtml('wpn', i) + '</aside>');
    return '<article class="wpn-one">' + parts.join('') + '</article>';
  }
  function exoticBlock(x) {
    /* c[2] 是选项组号：一个插槽只插得下一枚，同组的框起来并标出几选一，
       否则英勇利刃那四枚催化剂并排列着，读成四条都生效。 */
    var chips = x[0], loose = '', rows = [], i = 0;
    while (i < chips.length) {
      var g = chips[i][2];
      if (g == null) { loose += chipHtml(chips[i]); i++; continue; }
      var j = i, box = '<span class="xp-pick"><b class="xp-of">';
      while (j < chips.length && chips[j][2] === g) { j++; }
      box += (j - i) + ' 选 1</b>';
      for (var k = i; k < j; k++) { box += chipHtml(chips[k]); }
      rows.push(box + '</span>');
      i = j;
    }
    /* 一组一行：与固定那几枚挤在同一行时，读者分不清方框收到哪一枚为止 */
    if (loose) { rows.unshift(loose); }
    return '<section class="site"><h3 class="sub-label">站内详情</h3>' +
      rows.map(function (r) { return '<div class="xps">' + r + '</div>'; }).join('') +
      '<div class="prose">' + x[1] + '</div></section>';
  }
  /* 类名不叫 xp：site.css 的 .xp 是资料页那一行的容器，带 margin-bottom，
     两个页面共用外壳样式表，用同名会给每枚 chip 多加一截下外边距 */
  function chipHtml(c) { return '<span class="wpn-xp">' + imgTag(c[1], '', '', true) + esc(c[0]) + '</span>'; }
  function saysHtml(blocks) {
    return blocks.map(function (b) {
      /* 末一位只有组合有：这条评级说的是哪一枚固有配哪一种框架，画在评语正上方。 */
      var roll = b[3] ? '<div class="xps">' + b[3].map(function (c) {
        return chipHtml(c);
      }).join('') + '</div>' : '';
      /* 评级按维度一行一档：小棒猪给异域分「输出／清怪／高难」三档，拼成一行读不出配对 */
      var tier = b[1].map(function (t) {
        return '<b>' + (t[0] ? '<span class="dim">' + esc(t[0]) + '</span>' : '') + esc(t[1]) + '</b>';
      }).join('');
      return '<div class="say by-' + b[0].toLowerCase() + '"><div class="who">' + AUTHOR[b[0]] + tier +
        '</div><div>' + roll + b[2].map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div></div>';
    }).join('');
  }
  function isPinned(scope, i) { return has(pins, (scope === 'armor' ? 'a:' : 'w:') + (scope === 'armor' ? AR : WR)[i][0]); }
  function factsHtml(i) {
    var r = WR[i], fr = frameOf(r), out = [];
    function chip(q, icon, text) {
      out.push('<button type="button" class="toggle" data-act="addq" data-v="' + esc(q) + '">' + icon + esc(text) + '</button>');
    }
    chip('is:' + elName(r), imgTag(V.el[r[W_EL]][2], '', '', true), elName(r));
    if (r[W_BR]) { chip('is:' + V.br[r[W_BR]][0], imgTag(V.br[r[W_BR]][1], '', '', true), V.br[r[W_BR]][0]); }
    chip('is:' + typeName(r), glyph(V.ty[r[W_SUB]][1]), typeName(r));
    chip('is:' + V.am[r[W_AMMO]][0], '<span class="ammo-' + r[W_AMMO] + '">' + glyph(V.am[r[W_AMMO]][1]) + '</span>', V.am[r[W_AMMO]][0]);
    /* 固有随机的那把没有单一框架，这一枚 chip 会把其中一枚说成固定的 */
    if (!intrinsicCol(i)) { chip('frame:' + fr[0], imgTag(fr[1], '', '', true), fr[0]); }
    chip('is:' + rarity(r), '', rarity(r));
    chip('season:' + r[W_SSN], '', 'S' + r[W_SSN]);
    if (r[W_SRC] >= 0) { chip('source:' + V.src[r[W_SRC]], '', V.src[r[W_SRC]]); }
    if (r[W_FLAG] & F_CRAFT) { chip('is:可锻造', '', '可锻造'); }
    if (r[W_FLAG] & F_TIER) { chip('is:可升阶', '', '可升阶'); }
    return out.join('');
  }
  /* 武器框架页那一行：评级、两个分数、四项数值，外加这一类枪的弹药块拾取量。
     配不上行的（146 把异域自带框架 + 30 把传说）整块不画。 */
  function frameStatsHtml(i) {
    if (!P) { return ''; }
    var r = WR[i], k = poolRow(i)[9], fr = k >= 0 ? P.fr2[k] : null;
    var brick = P.brick[r[W_SUB] + ',' + r[W_AMMO]];
    if (!fr && !brick) { return ''; }
    var out = '';
    if (fr) {
      out += '<div class="fr-top"><span class="fr-tier" style="color:var(--g-' + (TIER_STEP[fr[FR_TIER]] || 4) + ')">' +
        esc(fr[FR_TIER]) + '</span><span>清怪 <b>' + esc(fr[FR_ADD]) + '</b></span>' +
        '<span>首领 <b>' + esc(fr[FR_BOSS]) + '</b></span></div>';
      out += '<dl class="fr-list">' +
        row('瞄准衰减射程', fr[FR_RANGE]) + row('真实射速', fr[FR_RPM]) +
        row('基础填装', fr[FR_RELOAD] == null ? null : fr[FR_RELOAD] + ' 秒') +
        row('典型红血 DPS', fr[FR_MDPS]) + row('典型首领 DPS', fr[FR_BDPS]) +
        row('红血单弹药盒', fr[FR_MBRICK]) + row('首领单弹药盒', fr[FR_BBRICK]) +
        brickRow(brick) + '</dl>' + brickNote(brick);
    } else {
      out += '<dl class="fr-list">' + brickRow(brick) + '</dl>' + brickNote(brick);
    }
    function row(k2, v) { return v == null || v === '' ? '' : '<dt>' + esc(k2) + '</dt><dd>' + esc(v) + '</dd>'; }
    /* 「常规 强化」两个数，方括号里是装了回收利用之后的量 */
    function brickRow(b) {
      if (!b) { return ''; }
      function one(n, m) { return esc(n) + (m && m !== n ? '<i>[' + esc(m) + ']</i>' : ''); }
      return '<dt>弹药块 常规·强化</dt><dd>' + one(b[0], b[1]) + ' ' + one(b[2], b[3]) + '</dd>';
    }
    function brickNote(b) {
      return b ? '<p class="fr-note">方括号内是装上<b>回收利用</b>之后的量</p>' : '';
    }
    /* 这一块讲的是框架，不是这一把：同框架的枪在这里的数值一模一样，
       差别在词条、属性与大师杰作上，那几样画在上面的「属性」与「词条」里 */
    return '<section><h3 class="sub-label">框架数值<a class="fr-more" href="../weapon-frames/index.html">全部 →</a></h3>' +
      '<p class="fr-note fr-top-note">数值是这一类框架的水平，不是这把枪自己的表现</p>' + out + '</section>';
  }
  function versionsHtml(scope, i) {
    var rows = scope === 'armor' ? AR : WR, fam = (scope === 'armor' ? V.afam : V.fam)[rows[i][scope === 'armor' ? A_FAM : W_FAM]];
    return '<section><h3 class="sub-label">全部版本<span class="aside">' + fam.length + ' 版</span></h3><ol class="vers">' +
      fam.map(function (k) {
        var x = rows[k], src = scope === 'armor' ? srcOf(x, A_SRC) : srcOf(x, W_SRC);
        var extra = scope === 'wpn' && (x[W_FLAG] & F_HOLO) ? ' · 全息' : '';
        return '<li><a href="' + link(scope, k) + '" data-act="open" data-i="' + k + '" data-scope="' + scope + '"' +
          (k === i ? ' aria-current="page"' : '') + '>' + (scope === 'armor' ? armorGun(x, 'sm') : gun(x, 'sm')) +
          '<span><span class="nm">' + esc(x[1]) + '</span><br><span class="sub">S' + x[scope === 'armor' ? A_SSN : W_SSN] +
          ' · ' + esc(src || '无来源记录') + extra + '</span></span><span class="now">' + (k === i ? '当前' : '') + '</span></a></li>';
      }).join('') + '</ol></section>';
  }

  function mwLabel(i, roll) {
    if (!roll.mw) { return '未装'; }
    return poolRow(i)[4] ? roll.mw : roll.mw + ' Lv' + roll.lv;
  }
  function gearSection(i, roll, res) {
    var pr = poolRow(i), opts = optsOf(i), mods = modsOf(i);
    if (!opts.length && !mods.length) { return ''; }
    var opt = res.mw.opt, rec = pr[5] || [];
    var mwSlot = '';
    if (opts.length) {
      var icon = opt ? P.p[opt[2]][P_ICON] : '';
      mwSlot = '<div class="slot-cell"><button type="button" class="slot' + (opt && has(rec, roll.mw) ? ' by-a' : '') +
        (opt ? '' : ' is-empty') + (S.slotHover ? ' is-hover' : '') + '" data-act="mwslot" aria-haspopup="dialog" aria-label="大师杰作">' +
        imgTag(icon, '', '', true) + '</button><div class="slot-lab"><b>大师杰作</b><span>' + esc(mwLabel(i, roll)) + '</span></div></div>';
    }
    var tier = '';
    if (pr[4]) {
      var btns = '';
      for (var t = 1; t <= 5; t++) {
        btns += '<button type="button" class="toggle" data-act="tier" data-v="' + t + '" aria-pressed="' + (roll.t === t ? 'true' : 'false') + '">T' + t + '</button>';
      }
      tier = '<div class="slot-cell tier"><div class="slot-lab"><b>T 级</b><div class="tiers">' + btns + '</div>' +
        '<span class="hint">' + esc(tierText(i, roll, res.mw)) + '</span></div></div>';
    }
    var modSlot = '';
    if (mods.length) {
      var m = roll.mod >= 0 ? P.p[roll.mod] : null;
      modSlot = '<div class="slot-cell"><button type="button" class="slot' + (m ? '' : ' is-empty') + '" data-act="modslot" ' +
        'aria-haspopup="dialog" aria-label="模组">' + (m ? imgTag(m[P_ICON], '', '', true) : '') + '</button><div class="slot-lab"><b>模组</b><span>' +
        (m ? esc(m[P_NAME]) : '未装 · 可选 ' + mods.length) + '</span></div></div>';
    }
    var pop = '';
    if (S.pop === 'mw') { pop = mwPicker(i, roll); } else if (S.pop === 'mod') { pop = modPicker(i, roll); }
    return '<section class="gear-sec"><h3 class="sub-label">大师杰作与模组</h3><div class="slots">' + mwSlot + tier + modSlot + '</div>' + pop + '</section>';
  }
  function mwPicker(i, roll) {
    var pr = poolRow(i), rec = pr[5] || [];
    var cells = optsOf(i).map(function (o) {
      return '<button type="button" class="pick' + (has(rec, o[0]) ? ' by-a' : '') + '" data-act="mwpick" data-v="' + esc(o[0]) +
        '" aria-pressed="' + (o[0] === roll.mw ? 'true' : 'false') + '"><span class="sq">' + imgTag(P.p[o[2]][P_ICON], '', '', true) +
        '</span><span>' + esc(o[0]) + '</span></button>';
    }).join('');
    var lv = '';
    if (!pr[4]) {
      var b = '';
      for (var k = 1; k <= 10; k++) {
        b += '<button type="button" class="' + (k <= roll.lv ? 'on' : '') + '" data-act="level" data-v="' + k + '" aria-label="' + k + ' 级"></button>';
      }
      lv = '<div class="pk-lv"><span class="k">等级</span><div class="lv">' + b + '<span class="v">Lv' + roll.lv + ' / 10</span></div></div>';
    }
    return '<div class="picker" role="dialog" aria-label="大师杰作"><div class="pk-head"><b>大师杰作</b>' +
      '<button type="button" class="op" data-act="mwpick" data-v="">卸下</button></div><div class="pk-grid">' + cells + '</div>' + lv + '</div>';
  }
  function modPicker(i, roll) {
    var cells = modsOf(i).map(function (p) {
      return '<button type="button" class="pick" data-act="modpick" data-v="' + p + '" aria-pressed="' + (roll.mod === p ? 'true' : 'false') +
        '"><span class="sq">' + imgTag(P.p[p][P_ICON], '', '', true) + '</span><span>' + esc(plugName(p)) + '</span></button>';
    }).join('');
    return '<div class="picker wide" role="dialog" aria-label="模组"><div class="pk-head"><b>模组</b>' +
      '<button type="button" class="op" data-act="modpick" data-v="-1">卸下</button></div><div class="pk-grid">' + cells + '</div></div>';
  }
  function catalystSection(i, roll) {
    var pr = poolRow(i);
    var effs = pr[8].map(function (p) {
      var lines = T && T.cp[p] ? T.cp[p] : [];
      return lines.map(function (e) { return '<p><b>' + esc(e[0]) + '</b>' + esc(e[1]) + '</p>'; }).join('');
    }).join('');
    return '<section><h3 class="sub-label">催化剂</h3><div class="cat"><button type="button" class="toggle" data-act="cat" aria-pressed="' +
      (roll.cat ? 'true' : 'false') + '">' + (roll.cat ? '已装上' : '装上') + '</button><div>' + effs + '</div></div></section>';
  }

  function statsPanel(res, ghost) {
    var bars = res.rows.filter(function (x) { return !x.numeric; });
    var nums = res.rows.filter(function (x) { return x.numeric; });
    var o = ['<dl class="stats">'];
    bars.forEach(function (x) {
      var segs = '<i class="s-base" style="width:' + (x.base - x.neg) + '%"></i>' + x.segs.map(function (s) {
        return '<i class="' + s[0] + '" style="width:' + s[1] + '%"></i>';
      }).join('') + (x.cond ? '<i class="s-cond" style="width:' + x.cond + '%"></i>' : '') +
        (x.neg ? '<i class="s-neg" style="width:' + x.neg + '%"></i>' : '');
      var d = '';
      if (ghost && ghost.byStat[x.s]) {
        var diff = ghost.byStat[x.s].value - x.value;
        if (diff > 0) { segs += '<i class="s-ghost" style="width:' + diff + '%"></i>'; }
        if (diff < 0) { segs += '<i class="g-neg" style="left:' + ghost.byStat[x.s].value + '%;width:' + (-diff) + '%"></i>'; }
        if (diff) { d = '<span class="d' + (diff > 0 ? '' : ' dn') + '">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</span>'; }
      }
      o.push('<dt' + (S.hoverRow === x.s ? ' class="is-hover"' : '') + ' data-act="statrow" data-s="' + x.s + '">' + esc(x.name) +
        '</dt><dd data-act="statrow" data-s="' + x.s + '"><div class="bar">' + segs + '</div></dd><dd class="v">' + x.value + '</dd><dd>' + d + '</dd>');
    });
    o.push('<div class="gap"></div>');
    nums.forEach(function (x) {
      var d = '';
      if (ghost && ghost.byStat[x.s]) {
        var diff = ghost.byStat[x.s].value - x.value;
        if (diff) { d = '<span class="d' + (diff > 0 ? '' : ' dn') + '">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</span>'; }
      }
      o.push('<dt data-act="statrow" data-s="' + x.s + '">' + esc(x.name) + '</dt><dd class="rc">' + (x.name === '后坐方向' ? recoilSvg(x.value) : '') +
        '</dd><dd class="v">' + x.value + '</dd><dd>' + d + '</dd>');
    });
    o.push('</dl><div class="legend">' + [
      ['background:var(--seg-base)', '基础'], ['background:var(--seg-part)', '枪管与弹匣'], ['background:var(--seg-perk)', 'Perk'],
      ['background:var(--c-enh)', '大师杰作'],
      ['background-image:repeating-linear-gradient(90deg,var(--c-enh) 0 2px,transparent 2px 3px)', 'T 级'],
      ['box-shadow:inset 0 0 0 1px var(--seg-perk)', '条件生效'],
      ['background-image:repeating-linear-gradient(135deg,var(--bone-dim) 0 1px,transparent 1px 4px)', '扣除']
    ].map(function (x) { return '<span><i style="' + x[0] + '"></i>' + x[1] + '</span>'; }).join('') + '</div>');
    return o.join('');
  }

  /* 护甲套装：一套两条效果（2 件与 4 件），实测与作者评语写在效果身上。
     属性那一块不画——套装效果不改属性。 */
  function setDetail(i) {
    var t = SR[i], fx = (T.st && T.st[i]) || [];
    var facts = [t[T_SRC], t[T_KIND], t[T_SSN]].filter(Boolean);
    // 值里有空格就加引号（「开普勒 I」「3v3 多人竞技」）：不加的话分词器在空格处
    // 切开，后半截「I」成了裸词，把开普勒 II 也搜进来。
    var qs = facts.map(function (v) {
      return (v === t[T_SSN] ? 'season:' : 'source:') + (/\s/.test(v) ? '"' + v + '"' : v);
    });
    return '<article class="wpn-one"><header class="one-head">' +
      '<span class="set-fx lg">' + t[T_FX].map(function (f) {
        return pathImg(f[2], 2);
      }).join('') + '</span>' +
      '<div><h2>' + esc(t[T_NAME]) + '</h2><p class="en">' + esc(t[T_EN]) +
      '</p><p class="lore">' + esc(t[T_TAG]) + '</p></div></header>' +
      '<div class="one-main"><section><h3 class="sub-label">套装效果</h3>' +
      fx.map(function (f) {
        return '<div class="frame">' + pathImg(f[2]) +
          '<div><b>' + esc(f[0]) + '</b><span class="pieces">' + f[1] + ' 件</span>' +
          (f[3] >= 0 ? T.H[f[3]] : '<p>' + esc(f[4]) + '</p>') +
          (f[5] && f[5].length ? '<div class="says">' + saysHtml(f[5]) + '</div>' : '') +
          '</div></div>';
      }).join('') + '</section>' + usedByHtml(t[T_H]) + '</div>' +
      '<aside class="one-side"><section><div class="facts">' + facts.map(function (f, k) {
        return '<button type="button" class="toggle" data-act="addq" data-v="' + esc(qs[k]) + '">' + esc(f) + '</button>';
      }).join('') + '</div></section></aside></article>';
  }

  function armorDetail(i) {
    var a = AR[i], rep = a[A_REP];
    var facts = [V.cls[a[A_CLS]], V.part[a[A_PART]], '异域', 'S' + a[A_SSN]];
    var qs = ['is:' + V.cls[a[A_CLS]], 'is:' + V.part[a[A_PART]], 'is:异域', 'season:' + a[A_SSN]];
    if (a[A_SRC] >= 0) { facts.push(V.src[a[A_SRC]]); qs.push('source:' + V.src[a[A_SRC]]); }
    var perks = (T.ap[rep] || []).map(function (p) {
      return '<div class="frame">' + (p[1] ? imgTag(p[1], '', '', true) : '<span></span>') + '<div><b>' + esc(p[0]) + '</b><p>' + esc(p[2]) + '</p></div></div>';
    }).join('');
    var say = T.aau[rep];
    return '<article class="wpn-one"><header class="one-head">' + armorGun(a, 'lg', 2) + '<div><h2 class="exo">' + esc(a[A_NAME]) +
      '</h2><p class="en">' + esc(enOf('armor', i)) + '</p><p class="lore">' + (T.fa[i] >= 0 ? esc(T.FL[T.fa[i]]) : '') +
      '</p></div><div class="one-acts"><button type="button" class="toggle" data-act="pin" aria-pressed="' +
      (isPinned('armor', i) ? 'true' : 'false') + '">' + (isPinned('armor', i) ? '已钉选' : '钉选') + '</button></div></header>' +
      '<div class="one-main">' + (T.axs[rep] ? exoticBlock(T.axs[rep]) : '') +
      (say ? '<section><h3 class="sub-label">作者评语</h3><div class="says">' + saysHtml(say) + '</div></section>' : '') +
      (perks ? '<section><h3 class="sub-label">异域特性</h3>' + perks + '</section>' : '') +
      usedByHtml(a[A_H]) + '</div>' +
      '<aside class="one-side"><section><div class="facts">' + facts.map(function (f, k) {
        return '<button type="button" class="toggle" data-act="addq" data-v="' + esc(qs[k]) + '">' + esc(f) + '</button>';
      }).join('') + '</div></section><section><h3 class="sub-label">属性</h3><p class="src">护甲属性随掉落随机生成，定义里没有固定值。</p></section>' +
      versionsHtml('armor', i) + '</aside></article>';
  }

  /* ── 浮层 ──────────────────────────────────────────────────────────── */
  function showTip(html, anchor, side, narrow) {
    tip.className = 'tip' + (narrow ? ' narrow' : '');
    tip.innerHTML = html;
    tip.hidden = false;
    var r = anchor.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
    var x = side === 'left' ? r.left - w - 12 : r.right + 12;
    if (x + w > document.documentElement.clientWidth - 8) { x = r.left - w - 12; }
    if (x < 8) { x = 8; }
    var y = Math.min(r.top, window.innerHeight - hgt - 8);
    tip.style.left = (x + window.scrollX) + 'px';
    tip.style.top = (Math.max(8, y) + window.scrollY) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function perkTip(i, col, p) {
    var cols = poolRow(i)[2], cell = null, cells = cellsOf(cols[col]);
    for (var k = 0; k < cells.length; k++) { if (shownPlug(cells[k]) === p) { cell = cells[k]; } }
    if (!cell) { return ''; }
    var base = P.p[cell[0]], enh = cell[1] >= 0 ? P.p[cell[1]] : null, shownP = P.p[p];
    var statsTable = '';
    var keys = {};
    base[P_ST].forEach(function (x) { keys[x[0]] = 1; });
    if (enh) { enh[P_ST].forEach(function (x) { keys[x[0]] = 1; }); }
    function val(plug, s) { var v = 0; plug[P_ST].forEach(function (x) { if (x[0] == s) { v += x[1]; } }); return v; }
    var ks = Object.keys(keys);
    if (ks.length) {
      statsTable = '<table><tr><td></td><td class="n" style="color:var(--bone-faint)">基础</td>' + (enh ? '<td class="e">强化</td>' : '') + '</tr>' +
        ks.map(function (s) {
          var b = val(base, s), e = enh ? val(enh, s) : 0;
          return '<tr><td>' + esc(P.s[s][1]) + '</td><td class="n">' + (b > 0 ? '+' : '') + b + '</td>' +
            (enh ? '<td class="e">' + (e > 0 ? '+' : '') + e + '</td>' : '') + '</tr>';
        }).join('') + '</table>';
    }
    var bits = marksOf(i)[cell[0]] || 0;
    var desc = T ? T.pd[p] : '', site = T && T.ps[p] >= 0 ? T.H[T.ps[p]] : '';
    return '<header>' + imgTag(shownP[P_ICON], '', '', true) + '<div><h5>' + esc(shownP[P_NAME]) + '</h5><span class="ty">' +
      esc(P.pt[shownP[P_TYPE]]) + (enh ? ' · 有强化版' : '') + (bits ? ' · ' + HALO[bits][1] : '') + '</span></div></header>' + statsTable +
      (desc ? '<p class="lab">游戏内说明</p><p class="db">' + esc(desc).replace(/\n/g, '<br>') + '</p>' : '') +
      (site ? '<p class="lab">站内实测</p>' + site : '');
  }
  function statTip(i, s) {
    var roll = rollOf(i), pr = poolRow(i), res = compute(i, roll), x = res.byStat[s];
    if (!x) { return ''; }
    var row = x.row, g = P.g[pr[0]], base = null;
    for (var k = 0; k < g.length; k++) { if (g[k][0] == s) { base = pr[1][k]; } }
    var acc = base, prev = shown(acc, row), out = ['<tr><td>基础</td><td class="n">' + prev + '</td></tr>'];
    res.parts.concat(res.perks).forEach(function (p) {
      var add = 0;
      P.p[p][P_ST].forEach(function (y) { if (y[0] == s) { add += y[1]; } });
      if (!add) { return; }
      acc += add;
      var v = shown(acc, row);
      if (v !== prev) { out.push('<tr><td>' + esc(plugName(p)) + '</td><td class="n">' + (v > prev ? '+' : '') + (v - prev) + '</td></tr>'); }
      prev = v;
    });
    [['大师杰作', res.mw.mw], ['T' + roll.t, res.mw.tier]].forEach(function (st) {
      if (!st[1][s]) { return; }
      acc += st[1][s];
      var v = shown(acc, row);
      if (v !== prev) { out.push('<tr><td>' + st[0] + '</td><td class="n">' + (v > prev ? '+' : '') + (v - prev) + '</td></tr>'); }
      prev = v;
    });
    out.push('<tr class="sum"><td>合计</td><td class="n">' + prev + '</td></tr>');
    if (x.withCond !== prev) { out.push('<tr class="cond"><td>条件生效时</td><td class="n">' + x.withCond + '</td></tr>'); }
    return '<h5>' + esc(x.name) + '</h5><p class="lab">显示值逐项累计</p><table>' + out.join('') + '</table>';
  }
  function mwTip(i) {
    var roll = rollOf(i), res = compute(i, roll), opt = res.mw.opt, pr = poolRow(i);
    if (!opt) { return '<h5>大师杰作</h5><p class="lab">未装。点开选一项属性。</p>'; }
    var plug = P.p[opt[2]];
    var main = res.mw.mw[opt[1]] || 0;
    return '<header>' + imgTag(plug[P_ICON], '', '', true) + '<div><h5>' + esc(plug[P_NAME]) + '</h5><span class="ty">' +
      (has(pr[5] || [], roll.mw) ? 'Aegis 推荐' : '大师杰作') + '</span></div></header><table><tr><td>' + esc(opt[0]) +
      '</td><td class="n">+' + main + '</td></tr></table>' +
      (pr[4] && roll.t ? '<p class="lab">' + esc(tierText(i, roll, res.mw)) + '</p>' : '') +
      (!pr[4] ? '<p class="lab">满级 +10；专家版满级时其余 +3</p>' : '');
  }
  function modTip(p) {
    var plug = P.p[p];
    var stats = plug[P_ST].map(function (x) { return '<tr><td>' + esc(P.s[x[0]][1]) + '</td><td class="n">' + (x[1] > 0 ? '+' : '') + x[1] + '</td></tr>'; }).join('');
    return '<header>' + imgTag(plug[P_ICON], '', '', true) + '<div><h5>' + esc(plug[P_NAME]) + '</h5><span class="ty">' +
      esc(P.pt[plug[P_TYPE]]) + '</span></div></header>' + (stats ? '<table>' + stats + '</table>' : '') +
      (T && T.pd[p] ? '<p class="lab">游戏内说明</p><p class="db">' + esc(T.pd[p]).replace(/\n/g, '<br>') + '</p>' : '');
  }

  /* ── 自动补全 ──────────────────────────────────────────────────────── */
  var ac = { items: [], at: -1, tok: null };
  function currentToken() {
    var pos = input.selectionStart == null ? input.value.length : input.selectionStart;
    var list = tokenize(input.value);
    for (var k = 0; k < list.length; k++) {
      if ((list[k].t === 'kw' || list[k].t === 'w') && list[k].a < pos && pos <= list[k].b) { return list[k]; }
    }
    return null;
  }
  var perkIndex = null;
  function perkRows() {
    if (!perkIndex) {
      perkIndex = {};
      REPS.wpn.forEach(function (i) {
        var names = perkNames(i);
        for (var k = 0; k < names.length; k++) {
          var list = perkIndex[names[k]] || (perkIndex[names[k]] = []);
          if (list[list.length - 1] !== i) { list.push(i); }
        }
      });
    }
    return perkIndex;
  }
  function suggest() {
    var t = currentToken();
    ac.tok = t;
    ac.items = [];
    if (!t || t.neg) { closeAc(); return; }
    var q = input.value, rest = q.slice(0, t.a) + q.slice(t.b);
    var restTree = parse(tokenize(rest), keysOf(S.scope));
    var pool = run(S.scope, restTree), mark = {};
    pool.forEach(function (i) { mark[i] = 1; });
    var keys = keysOf(S.scope);
    var groups = [];
    function count(fn) { var n = 0; for (var k = 0; k < pool.length; k++) { if (fn(pool[k])) { n++; } } return n; }
    if (t.t === 'kw' && has(keys, t.k)) {
      var f = fold(t.v), vals = [];
      if (t.k === 'is') {
        Object.keys(IS[S.scope]).forEach(function (v) {
          if (fold(v).indexOf(f) !== -1) { vals.push([v, count(IS[S.scope][v])]); }
        });
      } else if (t.k === 'frame' && S.scope === 'wpn') {
        V.fr.forEach(function (fr) {
          if (fold(fr[0]).indexOf(f) !== -1 && !vals.some(function (v) { return v[0] === fr[0]; })) {
            vals.push([fr[0], count(function (i) { return frameOf(WR[i])[0] === fr[0]; })]);
          }
        });
      } else if (t.k === 'source') {
        V.src.forEach(function (s, k) {
          if (fold(s).indexOf(f) !== -1) {
            vals.push([s, count(function (i) { return (S.scope === 'armor' ? AR[i][A_SRC] : WR[i][W_SRC]) === k; })]);
          }
        });
      } else if (t.k === 'breaker') {
        Object.keys(V.br).forEach(function (b) {
          if (fold(V.br[b][0]).indexOf(f) !== -1) { vals.push([V.br[b][0], count(function (i) { return WR[i][W_BR] === +b; })]); }
        });
      } else if (t.k === 'stat' && P) {
        P.s.forEach(function (s) { if (fold(s[1]).indexOf(f) !== -1) { vals.push([s[1] + ':', -1]); } });
      } else if ((t.k === 'perk' || t.k === 'perkname' || t.k === 'perk1' || t.k === 'perk2' || t.k === 'origintrait') && S.scope === 'wpn') {
        if (!P) { need('pool', suggest); }
        else {
          var idx = perkRows();
          Object.keys(idx).forEach(function (n) {
            if (f && fold(n).indexOf(f) !== -1) {
              var c = 0;
              idx[n].forEach(function (i) { if (mark[i]) { c++; } });
              if (c) { vals.push([n, c]); }
            }
          });
        }
      }
      vals = vals.filter(function (v) { return v[1] !== 0; });
      vals.sort(function (a, b) { return b[1] - a[1]; });
      if (vals.length) {
        groups.push([t.k.toUpperCase() + (f ? ' · 含「' + t.v + '」' : ''), vals.map(function (v) {
          var val = /[\s()]/.test(v[0]) ? '"' + v[0] + '"' : v[0];
          return { text: t.k + ':' + val, label: v[0], n: v[1], icon: t.k === 'is' ? pillIcon({ t: 'kw', k: 'is', v: v[0] }) : t.k.indexOf('perk') === 0 || t.k === 'origintrait' ? (P ? imgTag(perkIcon(v[0]), '', '', true) : '') : '' };
        })]);
      }
    } else if (t.t === 'w') {
      var fw = fold(t.v);
      var ks = keys.filter(function (k) { return k.indexOf(fw) === 0; }).map(function (k) {
        return { text: k + ':', label: k + ':', n: -1, hint: KEY_LABEL[k], keep: true };
      });
      if (ks.length) { groups.push(['关键字', ks]); }
      var isv = Object.keys(IS[S.scope]).filter(function (v) { return fold(v).indexOf(fw) !== -1; }).map(function (v) {
        return { text: 'is:' + v, label: 'is:' + v, n: count(IS[S.scope][v]), icon: pillIcon({ t: 'kw', k: 'is', v: v }) };
      }).filter(function (x) { return x.n; });
      if (isv.length) { groups.push(['IS', isv]); }
    }
    var html = '', n = 0;
    groups.forEach(function (g) {
      html += '<li class="grp" role="presentation">' + esc(g[0]) + '</li>';
      g[1].forEach(function (it) {
        ac.items.push(it);
        html += '<li class="opt" role="option" id="wpn-ac-' + n + '" data-k="' + n + '" aria-selected="false">' +
          (it.icon || '<span></span>') + '<span>' + esc(it.label) + (it.hint ? ' <code>' + esc(it.hint) + '</code>' : '') + '</span>' +
          '<span class="n">' + (it.n >= 0 ? it.n + ' ' + (S.scope === 'armor' ? '件' : '把') : '') + '</span></li>';
        n++;
      });
    });
    if (!n) { closeAc(); return; }
    acBox.innerHTML = html + '<li class="hint" role="presentation">↑↓ 选择 · Tab 或回车补全 · Esc 收起</li>';
    acBox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    ac.at = 0;
    markAc();
  }
  function markAc() {
    acBox.querySelectorAll('.opt').forEach(function (li) {
      var on = +li.getAttribute('data-k') === ac.at;
      li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { li.scrollIntoView({ block: 'nearest' }); }
    });
    input.setAttribute('aria-activedescendant', ac.at >= 0 ? 'wpn-ac-' + ac.at : '');
  }
  function closeAc() {
    acBox.hidden = true;
    acBox.innerHTML = '';
    ac.items = [];
    ac.at = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function acceptAc(k) {
    var it = ac.items[k], t = ac.tok;
    if (!it || !t) { return; }
    var q = input.value;
    var text = (t.neg ? '-' : '') + it.text;
    var next = q.slice(0, t.a) + text + (it.keep ? '' : ' ') + q.slice(t.b).replace(/^\s+/, '');
    input.value = next;
    var pos = t.a + text.length + (it.keep ? 0 : 1);
    input.setSelectionRange(pos, pos);
    setQuery(next, false);
    if (it.keep) { suggest(); } else { closeAc(); }
  }

  /* ── 主流程 ────────────────────────────────────────────────────────── */
  function evaluate() {
    tokens = tokenize(S.q);
    tree = parse(tokens, keysOf(S.scope));
    pending = S.scope === 'wpn' && needsPool(tree) && !P;
    if (pending) {
      if (!waiting) { waiting = true; need('pool', function () { waiting = false; evaluate(); render(); }); }
      results = [];
      return;
    }
    results = run(S.scope, tree);
  }
  function render() {
    renderBar();
    renderPresets();
    renderSub();
    if (S.sel != null) { renderSplit(); } else { renderBrowse(); }
    measureStick();
  }
  var typing = 0, waiting = false;
  function setQuery(q, push) {
    S.q = q;
    evaluate();
    writeUrl(push);
    render();
  }
  function addToken(tok) {
    var q = S.q.trim();
    if (tokens.some(function (t) { return S.q.slice(t.a, t.b) === tok; })) { return; }
    setQuery((q ? q + ' ' : '') + tok, false);
    input.value = S.q;
  }
  function open(scope, i) {
    if (scope !== S.scope) { S.scope = scope; S.q = ''; input.value = ''; evaluate(); }
    S.sel = i;
    S.pop = null;
    if (scope === 'wpn' && P && S.urlRoll) {
      S.rolls[WR[i][W_H]] = decodeRoll(i, S.urlRoll);
      S.urlRoll = null;
    }
    writeUrl(true);
    render();
    window.scrollTo(0, 0);
  }

  /* ── 事件 ──────────────────────────────────────────────────────────── */
  input.addEventListener('input', function () {
    clearTimeout(typing);
    var q = input.value;
    typing = setTimeout(function () { setQuery(q, false); suggest(); }, 120);
  });
  input.addEventListener('click', suggest);
  input.addEventListener('keydown', function (e) {
    if (acBox.hidden) {
      if (e.key === 'Escape') { input.blur(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.at = Math.min(ac.items.length - 1, ac.at + 1); markAc(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ac.at = Math.max(0, ac.at - 1); markAc(); }
    else if (e.key === 'Tab' || e.key === 'Enter') { if (ac.at >= 0) { e.preventDefault(); acceptAc(ac.at); } }
    else if (e.key === 'Escape') { e.preventDefault(); closeAc(); }
  });
  input.addEventListener('blur', function () { setTimeout(closeAc, 150); });
  acBox.addEventListener('mousedown', function (e) {
    var li = e.target.closest('.opt');
    if (li) { e.preventDefault(); acceptAc(+li.getAttribute('data-k')); }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) {
      if (S.pop && !e.target.closest('.picker')) { S.pop = null; renderDetail(); }
      if (S.syntax && !e.target.closest('.wpn-syntax')) { S.syntax = false; renderBar(); }
      return;
    }
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
    var i = S.sel;
    switch (act) {
      case 'scope':
        if (v !== S.scope) { S.scope = v; S.q = ''; S.sel = null; input.value = ''; setQuery('', true); }
        return;
      case 'view':
        S.view = v; store('wpn.view', v); S.sel = null; writeUrl(true); render(); return;
      case 'syntax':
        e.stopPropagation(); S.syntax = !S.syntax; renderBar(); return;
      case 'setq':
        S.syntax = false; S.sel = null; input.value = v; setQuery(v, true); return;
      case 'preset': {
        var hit = tokens.filter(function (t) { return t.t === 'kw' && !t.neg && t.k + ':' + t.v === v; })[0];
        if (hit) { var q = S.q.slice(0, hit.a) + S.q.slice(hit.b); input.value = q.replace(/\s+/g, ' ').trim(); setQuery(input.value, false); }
        else { addToken(v); }
        return;
      }
      case 'refine':
        addToken(e.shiftKey ? '-' + v : v); return;
      case 'addq':
        S.sel = null; addToken(v); writeUrl(true); render(); return;
      case 'unpill': {
        var a = +el.getAttribute('data-a'), b = +el.getAttribute('data-b');
        var nq = (S.q.slice(0, a) + S.q.slice(b)).replace(/\s+/g, ' ').trim();
        input.value = nq; setQuery(nq, false); return;
      }
      case 'open':
        if (e.metaKey || e.ctrlKey || e.shiftKey) { return; }
        e.preventDefault();
        open(el.getAttribute('data-scope') || S.scope, +el.getAttribute('data-i'));
        return;
      case 'pin': {
        var key = (S.scope === 'armor' ? 'a:' : 'w:') + (S.scope === 'armor' ? AR : WR)[i][0];
        if (has(pins, key)) { pins.splice(pins.indexOf(key), 1); } else { pins.push(key); }
        store('wpn.pins', pins); render(); return;
      }
      case 'unpinall':
        pins = []; store('wpn.pins', pins); render(); return;
      case 'rail':
        S.railOff = !S.railOff; store('wpn.railOff', S.railOff); render(); return;
      case 'perk': {
        var col = +el.getAttribute('data-col'), plug = +el.getAttribute('data-plug'), roll = rollOf(i);
        if (cellsOf(poolRow(i)[2][col]).length === 1) { return; }
        if (roll.sel[col] === plug) { delete roll.sel[col]; } else { roll.sel[col] = plug; }
        saveRoll(i); S.hoverPlug = null; hideTip(); renderDetail(); return;
      }
      case 'mwslot':
        e.stopPropagation(); S.pop = S.pop === 'mw' ? null : 'mw'; hideTip(); renderDetail(); return;
      case 'modslot':
        e.stopPropagation(); S.pop = S.pop === 'mod' ? null : 'mod'; hideTip(); renderDetail(); return;
      case 'mwpick': {
        var r1 = rollOf(i); r1.mw = v || ''; if (!v) { S.pop = null; }
        saveRoll(i); renderDetail(); return;
      }
      case 'level': {
        var r2 = rollOf(i); r2.lv = +v; saveRoll(i); renderDetail(); return;
      }
      case 'tier': {
        var r3 = rollOf(i); r3.t = +v; saveRoll(i); renderDetail(); return;
      }
      case 'modpick': {
        var r4 = rollOf(i); r4.mod = +v; S.pop = null; hideTip(); saveRoll(i); renderDetail(); return;
      }
      case 'cat': {
        var r5 = rollOf(i); r5.cat = r5.cat ? 0 : 1; saveRoll(i); renderDetail(); return;
      }
    }
  });

  /* 悬停：词条出说明并在属性条上预览；属性行出分解；结果栏的行在详情区预览。 */
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || S.sel == null || S.scope !== 'wpn' || !P) { return; }
    var act = el.getAttribute('data-act'), i = S.sel;
    if (act === 'perk') {
      var col = +el.getAttribute('data-col'), plug = +el.getAttribute('data-plug');
      if (!S.hoverPlug || S.hoverPlug.col !== col || S.hoverPlug.plug !== plug) {
        var roll = rollOf(i);
        S.hoverPlug = roll.sel[col] === plug ? null : { col: col, plug: plug };
        renderDetail();
        var again = body.querySelector('[data-act="perk"][data-col="' + col + '"][data-plug="' + plug + '"]');
        if (again) { showTip(perkTip(i, col, plug), again); }
      }
    } else if (act === 'statrow') {
      var s = +el.getAttribute('data-s');
      if (S.hoverRow !== s) {
        S.hoverRow = s;
        showTip(statTip(i, s), body.querySelector('dt[data-s="' + s + '"]'), 'left', true);
      }
    } else if (act === 'mwslot' && !S.pop) {
      showTip(mwTip(i), el);
    } else if (act === 'modpick') {
      var p = +el.getAttribute('data-v');
      if (p >= 0) { showTip(modTip(p), el); }
    }
  });
  document.addEventListener('mouseout', function (e) {
    var el = e.target.closest('[data-act]');
    var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-act]') : null;
    if (!el || el === to) { return; }
    var act = el.getAttribute('data-act');
    if (act === 'perk' && (!to || to.getAttribute('data-act') !== 'perk')) {
      if (S.hoverPlug) { S.hoverPlug = null; renderDetail(); }
      hideTip();
    } else if (act === 'statrow' && (!to || to.getAttribute('data-act') !== 'statrow')) {
      S.hoverRow = null; hideTip();
    } else if (act === 'mwslot' || act === 'modpick') {
      hideTip();
    }
  });

  /* 结果栏拖宽：140–280px，记在 localStorage。 */
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('[data-act="grip"]')) { return; }
    e.preventDefault();
    var split = body.querySelector('.wpn-split'), x0 = e.clientX, w0 = S.rail;
    function move(ev) {
      S.rail = Math.max(RAIL_MIN, Math.min(RAIL_MAX, w0 + ev.clientX - x0));
      split.style.setProperty('--rail', S.rail + 'px');
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      store('wpn.rail', S.rail);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  window.addEventListener('popstate', function () {
    readUrl();
    input.value = S.q;
    evaluate();
    if (S.sel != null && S.scope === 'wpn' && S.urlRoll) {
      need('pool', function () { if (S.urlRoll) { S.rolls[WR[S.sel][W_H]] = decodeRoll(S.sel, S.urlRoll); S.urlRoll = null; } render(); });
    }
    render();
  });
  window.addEventListener('resize', measureStick);

  /* ── 开屏 ──────────────────────────────────────────────────────────── */
  readUrl();
  input.value = S.q;
  evaluate();
  if (S.sel != null && S.scope === 'wpn' && S.urlRoll) {
    need('pool', function () {
      if (S.urlRoll) { S.rolls[WR[S.sel][W_H]] = decodeRoll(S.sel, S.urlRoll); S.urlRoll = null; }
      render();
    });
  }
  render();
  /* 首屏画完之后空闲时取词条池与说明。 */
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
  idle(function () { need('pool', function () { need('text'); }); });

}());
