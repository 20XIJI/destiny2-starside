/* 装备库（武器与异域护甲）。数据三份，由 tools/build-weapons.py 从实体层生成，字段表写在
   .claude/rules/weapons.md：
     index.js  window.WPN        首屏：卡片墙、筛选、结果栏
     pool.js   window.WPN_POOL   词条池、属性曲线、大师杰作与模组
     text.js   window.WPN_TEXT   描述、说明、站内实测、作者评语
   pool.js 在 load 之后取，text.js 不预取；查询或详情先用到哪一份就立刻取哪一份。
   范围开关、查询条与首屏骨架写在页壳里（build-weapons.py 的 scope_row()、toolbar() 与
   skeleton()），这里接上事件、换成真内容。 */
(function () {
  'use strict';

  var D = window.WPN;
  var root = document.getElementById('find');
  var bar = document.querySelector('.wpn-bar');
  var scopeBox = document.querySelector('.wpn-scope');
  if (!root || !bar || !scopeBox) { return; }
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
    FR_MBRICK = 8, FR_BBRICK = 9, FR_CRIT = 10;
  /* 神器模组表 pool.am 的一行：名字、图标、[[神器下标, 档位]…]、通用。神器表 pool.an 是 [名字, 锚点]。 */
  var AM_NAME = 0, AM_ICON = 1, AM_IN = 2, AM_ALL = 3;
  var TIER_ZH = ['', '一级', '二级', '三级'];
  var TIER_STEP = { F: 1, E: 2, D: 3, C: 5, B: 6, A: 7, S: 8 };

  var V = D.v;
  var TYPE_FACETS = {};
  V.qt.forEach(function (entry) {
    (TYPE_FACETS[entry[2]] || (TYPE_FACETS[entry[2]] = [])).push(entry);
  });
  var ICONS = '../assets/icons/';
  /* 首屏的卡片：1440×900 下卡片墙一屏 5 列 5 行多一点，取 6 行。这些图不懒载，前 10 张再提优先级。 */
  var N_EAGER = 30, N_HIGH = 10;
  /* 卡片墙与列表一批铺多少：两千张一次铺完首屏要等好几秒，滚到底再添一批。 */
  var BATCH = 120;
  /* 细分只列多于 10 把的值，选中的一直在。与 destiny.report 同一条。护甲套装总共 56 套，
     没有哪个来源多于 10 套，全部列出。 */
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
  function typeFacet(r) {
    var entries = TYPE_FACETS[r[W_SUB]];
    for (var k = 0; k < entries.length; k++) {
      if (entries[k][4] == null || has(entries[k][4], r[W_SLOT])) { return entries[k]; }
    }
  }
  function typeGlyph(r) {
    var entry = typeFacet(r);
    return glyph(entry[1], entry[0]);
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
  function need(name, cb, retry) {
    var ready = name === 'pool' ? window.WPN_POOL : window.WPN_TEXT;
    if (ready) { if (cb) { cb(); } return true; }
    var job = loads[name];
    if (job && job.failed && !retry) { return false; }
    if (!job || job.failed) {
      job = loads[name] = { cbs: job ? job.cbs : [], failed: false };
      var s = document.createElement('script');
      /* 详情或查询在等词条池时提到高优先级：动态插入的脚本缺省是低优先级，会排在首屏
         那一百多张卡片图后面，等它们下完才开始下。load 之后的预取不带回调，照缺省。
         text.js 照缺省：详情不等它就画得出来，先让详情里的图下完。 */
      if (cb && name === 'pool') { s.fetchPriority = 'high'; }
      s.src = new URL(name + '.js', HERE).href;
      s.onload = function () {
        if (!(name === 'pool' ? window.WPN_POOL : window.WPN_TEXT)) { s.onerror(); return; }
        if (name === 'pool') { poolReady(); } else { textReady(); }
        var cbs = job.cbs; job.cbs = [];
        for (var i = 0; i < cbs.length; i++) { cbs[i](); }
      };
      s.onerror = function () {
        var was = pending, before = results;
        job.failed = true;
        console.error('载不动 weapons/' + name + '.js');
        evaluate();
        if (was !== pending || pending === name || !sameList(before, results)) { render(); }
        else {
          renderLoadErrors();
          if (S.sel != null) { renderDetail(); }
        }
      };
      document.head.appendChild(s);
    }
    if (cb) { job.cbs.push(cb); }
    return false;
  }
  var P = null, T = null, PIDX = {}, SIDX = null, HSTAT = null;
  var PERK_FX = null, perkFxWait = null;
  function poolReady() {
    P = window.WPN_POOL;
    for (var i = 0; i < P.p.length; i++) { PIDX[P.p[i][P_HASH]] = i; }
    SIDX = {};
    HSTAT = {};
    for (var j = 0; j < P.s.length; j++) { SIDX[P.s[j][1]] = j; HSTAT[P.s[j][0]] = j; HSTAT[String(P.s[j][0])] = j; }
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

  /* 射程、填装、操控、PvP 伤害与 TTK 全量对齐 godroll.tv 现网公式。 */
  var FRAME_EN = {
    '适配框架': 'Adaptive', '适配点射': 'Adaptive Burst', '适配偃月': 'Adaptive',
    '轻质框架': 'Lightweight', '精密框架': 'Precision',
    '精准弹头': 'Pinpoint Slug', '精确重击框架': 'Pinpoint Slug',
    '速射框架': 'Rapid Fire', '速射重弹': 'Rapid Fire Slug', '速射偃月': 'Rapid Fire',
    '高冲击力框架': 'High Impact', '高冲击力长弓': 'High Impact Longbow',
    '攻击型框架': 'Aggressive', '攻击型偃月': 'Aggressive',
    '重型点射': 'Heavy Burst', '动态热量武器': 'Dynamic Heat', '平衡热量武器': 'Balanced Heat',
    '微型导弹框架': 'Micro Missile', '支援框架': 'Support', '传承PR-55框架': 'Legacy PR 55',
    '区域拒止框架': 'Area Denial', '压缩波形框架': 'Compressed Wave', '波形框架': 'Wave',
    '波形刀剑框架': 'Wave Sword', '涡流框架': 'Vortex', '铸造者框架': 'Caster',
    '激进爆弹': 'Aggressive Burst', '米达加成': 'MIDA Synergy', '长相聚': 'Together Forever',
    '散射': 'Spread Shot', '双重火力': 'Double Fire', '射击套件': 'Shot Package',
    '干扰武器\ue070': 'Disruption Weapon [Shield-Piercing]', '干扰武器': 'Disruption Weapon [Shield-Piercing]'
  };
  var RANGE = {
    '自动步枪': { _: { s: [10.75, .125], e: [40, 0], fp: .5, z: 1.6 } },
    '脉冲步枪': { _: { s: [16, .075], e: [40, 0], fp: .5, z: 1.7 } },
    '斥候步枪': { _: { s: [30.25, .1568], e: [60.75, 0], fp: .5, z: 2 } },
    '手炮': {
      _: { s: [16, .09], e: [29, .03], fp: .33, z: 1.5 },
      Aggressive: { s: [18, .09], e: [32, .02], fp: .33, z: 1.5 },
      'Spread Shot': { s: [6, .04], e: [10, 0], fp: .33, z: 1.2 }
    },
    '手枪': { _: { s: [11, .04], e: [22, .03], fp: .5, z: 1.2 } },
    '微型冲锋枪': { _: { s: [10.3, .065], e: [23, 0], fp: .5, z: 1.4 } },
    '追踪步枪': { _: { s: [14.756, .1017], e: [35.9, 0], fp: .4, z: 1.6 } },
    '融合步枪': {
      _: { s: [10.73, .0404], e: [14.705, .318], fp: .45, z: 1.3 },
      Aggressive: { s: [14.73, .0404], e: [17.705, .318], fp: .65, z: 1.3 }
    },
    '霰弹枪': {
      _: { s: [3.77, .0294], e: [14.5, 0], fp: .001, z: 1 },
      'Heavy Burst': { s: [5.77, .0295], e: [12.75, 0], fp: .001, z: 1.2 },
      'Pinpoint Slug': { s: [5.77, .0295], e: [12.75, 0], fp: .001, z: 1.2 },
      'Rapid Fire Slug': { s: [5.77, .0295], e: [12.75, 0], fp: .001, z: 1.2 }
    },
    '狙击步枪': {
      Adaptive: { hip: [45, 70], z: 4 }, Aggressive: { hip: [48, 75], z: 4.5 },
      'Dynamic Heat': { hip: [43, 68], z: 3.5 }, 'Rapid Fire': { hip: [40, 62], z: 3.5 },
      Disruption: { hip: [50, 80], z: 4.5 }
    },
    '线性融合步枪': {
      'Adaptive Burst': { hip: [35, 65], z: 3.5 }, Precision: { hip: [38, 70], z: 3.5 }
    },
    '机枪': { _: { s: [28.5, .0223], e: [38.2, 0], fp: .5, z: 1.6 } },
    '偃月': { _: { s: [15.013, .054356], e: [15.013, .054356], fp: .5, z: 1 } }
  };
  var ZOOM_OVERRIDES = {
    '手枪': { 2984682260: 2, default: 1.2 },
    '微型冲锋枪': { 903: 1.5, 1294026524: 1.5, default: 1.4 },
    '手炮': { 2770223582: 1.1, 1030990989: 1.3, 3174300811: 2.4, 3923638944: 1.6, 907: 1.6, default: 1.5 },
    '自动步枪': { 901: 1.7, 1019291327: 1.7, default: 1.6 },
    '脉冲步枪': { 904: 1.8, 907: 1.8, 1634975868: 1.8, 901: 1.6, 911: 1.6, 1019291327: 1.6, 4172222323: 1.6, default: 1.7 },
    '战斗弓箭': { default: 1.8 },
    '斥候步枪': { default: 2 },
    '霰弹枪': { 916: 1.2, 1394384862: 1.2, 536517534: 1.2, 918679156: 1.2, default: 1 },
    '融合步枪': { 3610750208: 1.7, default: 1.3 },
    '追踪步枪': { default: 1.6 },
    '线性融合步枪': { default: 2.5 },
    '狙击步枪': { default: 4.5 },
    '机枪': { default: 1.6 }
  };
  var EXOTIC_RANGES = {
    '手枪': { 2984682260: { s: [28.3, 0], e: [43.2, 0], fp: .5, z: 1.2 } },
    '手炮': {
      2770223582: { s: [19.3, 0], e: [29.67, 0], fp: .33, z: 1.1 },
      3174300811: { s: [38, 0], e: [70, 0], fp: .33, z: 2.4 }
    },
    '融合步枪': { 3610750208: { s: [11.75, .09615], e: [41, 0], fp: .5, z: 1.7 } }
  };
  var NO_FALLOFF_FRAMES = { 'Micro Missile': 1 };
  var RANGE_FRAME_ALIAS = {
    '手枪': { 'Together Forever': 'Micro Missile' },
    '霰弹枪': { 'MIDA Synergy': 'Precision' }
  };
  var RELOAD = {
    '自动步枪': [.00316922, -.870122, 92.5862, .867],
    '手炮': [.00477848, -1.30872, 138.482, 1.467],
    '脉冲步枪': [.0034304, -.924866, 96.6938, .9],
    '斥候步枪': [.00381167, -.999196, 103.15, .933],
    '手枪': [882635e-9, -.432829, 68.6402, .733],
    '微型冲锋枪': [.00225423, -.6829, 85.4344, .967],
    '融合步枪': [.00227882, -.705757, 91.6868, 1.067],
    '霰弹枪': [.00237208, -.519846, 42.4795, .167],
    '狙击步枪': [.00249814, -.821771, 123.12, 1.733],
    '榴弹发射器_特殊': [.00268222, -.775084, 104.714, 1.5],
    '榴弹发射器_威能': [.00279716, -.885767, 132.442, 1.967],
    '线性融合步枪': [.00217949, -.709871, 93.0427, 1.133],
    '机枪': [.00335315, -1.08646, 194.189, 1.4],
    '火箭发射器': [.00385034, -.917237, 131.542, 2.1],
    '追踪步枪': [.00227882, -.705757, 91.6868, 1.067],
    '战斗弓箭': [.0024, -.372, 32.4, .6],
    '偃月': [0, -.525, 105, 1.75]
  };
  var ZERO_HANDLING = { r: [0, 0], s: [0, 0], a: [0, 0] };
  var STD_HANDLING = {
    '自动步枪': { r: [-0.00279338, 0.51985381], s: [-0.00268436, 0.48414822], a: [-0.001875, 0.38975] },
    '脉冲步枪': { r: [-0.00312085, 0.54370932], s: [-0.0035545, 0.55005845], a: [-0.00196208, 0.4574687] },
    '斥候步枪': { r: [-0.00285336856, 0.540561867], s: [-0.002941215324, 0.527217745], a: [-0.001693527081, 0.4114236019] },
    '手炮': { r: [-0.002942857143, 0.4782571429], s: [-0.002952380952, 0.5133809524], a: [-0.001666666667, 0.3316666667] },
    '手枪': { r: [-0.00264010989, 0.4232582418], s: [-0.00197527473, 0.4298956044], a: [-0.0022293956, 0.3435796703] },
    '微型冲锋枪': { r: [-0.002376970528, 0.4710178204], s: [-0.002547978067, 0.4481295408], a: [-0.001873200822, 0.3581576422] },
    '追踪步枪': { r: [-0.00279338, 0.51985381], s: [-0.00268436, 0.48414822], a: [-0.001875, 0.38975] },
    '融合步枪': { r: [-0.001448069241, 0.4990612517], s: [-0.002863515313, 0.4445712383], a: [-0.001693741678, 0.4112330226] },
    '霰弹枪': { r: [-0.003271255061, 0.5388744939], s: [-0.003388663968, 0.5711336032], a: [-0.00233805668, 0.451194332] },
    '狙击步枪': { r: [-0.002623944983, 0.5079465458], s: [-0.002083932479, 0.4392525789], a: [-0.00194998437, 0.5021325414] },
    '线性融合步枪': { r: [-0.001448069241, 0.4990612517], s: [-0.002863515313, 0.4445712383], a: [-0.001693741678, 0.4112330226] },
    '机枪': { r: [-0.002391721353, 0.4950499748], s: [-0.002041393236, 0.4547501262], a: [-0.001234477537, 0.4574687027] },
    '偃月': { r: [-0.002139219, 0.42369], s: [-0.002827674, 0.5147], a: [0, 0] },
    '战斗弓箭': { r: [-0.002909930716, 0.7364549654], s: [-0.00179330254, 0.5396466513], a: [-0.001855658199, 0.5293778291] },
    '榴弹发射器': { r: [-0.00272791, 0.55133684], s: [-0.00232786, 0.48726765], a: [-0.00187072, 0.50019128] },
    '火箭发射器': { r: [-0.003998740554, 0.6635944584], s: [-0.003296509536, 0.5463332134], a: [-0.002139258726, 0.528984167] }
  };
  var HANDLING_INTRINSIC_CAT = {
    '融合步枪': { 3610750208: 'vex', 2769013282: 'zero' },
    '榴弹发射器': { 3183537623: 'zero' },
    '机枪': { 2940035732: 'overture' },
    '火箭发射器': { 2440389614: 'zero', 2491817779: 'zero' },
    '偃月': { 1207608520: 'zero' }
  };
  var HANDLING_CAT_OVERRIDES = {
    '融合步枪': { vex: STD_HANDLING['自动步枪'], zero: ZERO_HANDLING },
    '榴弹发射器': { zero: ZERO_HANDLING },
    '机枪': { overture: { r: [-0.002391721353, 0.4950499748], s: [-0.002041393236, 0.4547501262], a: [-0.001234477537, 0.4584687027] } },
    '火箭发射器': { zero: ZERO_HANDLING },
    '偃月': { zero: ZERO_HANDLING }
  };
  var INSTANT_HANDLING_PERKS = { 706527188: 1, 1961144892: 1 };
  var FX_GROUPS = [
    { id: 'armor', name: '护甲模组', items: [
      { id: '2899505723', name: '空中补偿器', stats: { '空中效率': [15, 25, 30] } },
      { id: '2586562813', name: '装弹装置', stats: { '填装速度': [10, 15, 18] }, reloadDurationMod: 0.85 },
      { id: '2467203039', name: '瞄准性能', stats: { '辅助瞄准': [5, 8, 10] } },
      { id: '14520248', name: '武器激涌', dmg: [1.03, 1.045, 1.055, 1.06] },
      { id: '531057500', name: '光明利刃', types: ['刀剑'], stats: { '充能效率': [30, 50, 60] } }
    ] },
    { id: 'buff', name: '增益', items: [
      { id: 'ability_amplified', name: '增幅', stats: { '操控性': 40 }, handlingDurationMod: 0.95 },
      { id: 'ability_radiant', name: '焕光', dmg: 1.1 },
      { id: '1190101211', name: '超凡', dmg: 1.05 }
    ] },
    { id: 'super', name: '超能', items: [
      { id: '2722573683', name: '暗影箭矢：狩猎陷阱', dmg: 1.35 },
      { id: '2722573681', name: '暗影箭矢：莫比乌斯箭袋', dmg: 1.3 },
      { id: '4260353953', name: '黎明护罩', stats: { '操控性': 50, '填装速度': 50 } },
      { id: '2274196887', name: '光焰之井', dmg: 1.25 }
    ] },
    { id: 'aspect', name: '星相', items: [
      { id: '4194622036', name: '流动状态', stats: { '填装速度': 50 }, reloadDurationMod: 0.8 },
      { id: '83039194', name: '炙热升腾', stats: { '空中效率': [20, 70] } },
      { id: '3066103999', name: '各就各位', stats: { '填装速度': [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] } }
    ] },
    { id: 'frag', name: '碎片', items: [
      { id: '2272984657', name: '霸道回声', stats: { '稳定性': 30 } },
      { id: '362132290', name: '回火余烬', stats: { '空中效率': 20 } },
      { id: '124726497', name: '指挥琢面', stats: { '稳定性': 20, '空中效率': 40 } },
      { id: '2626922126', name: '黎明琢面', dmg: 1.1 },
      { id: '1727069361', name: '频率火花', stats: { '稳定性': 15, '填装速度': 50 }, reloadDurationMod: 0.8 },
      { id: '4208512216', name: '上升丝线', stats: { '操控性': 40, '空中效率': 30, '填装速度': 40 }, reloadDurationMod: 0.925 },
      { id: '3469412970', name: '晶石之吟', stats: { '操控性': 40 } },
      { id: '537774543', name: '刺激的低语', stats: { '操控性': 40 } }
    ] },
    { id: 'class', name: '职业技能', items: [
      { id: '2711519343', name: '特技闪身', dmg: 1.1 },
      { id: '25156514', name: '强能裂痕', dmg: 1.15 },
      { id: '489583097', name: '集结屏障', stats: { '稳定性': 30, '填装速度': 100 }, reloadDurationMod: 0.9 }
    ] },
    { id: 'exotic', name: '异域护甲', items: [
      { id: '1667892711', name: '亚克兴角战役钻机', types: ['自动步枪', '机枪'], stats: { '空中效率': 30 } },
      { id: '508515818', name: '巴克里斯面具', pveDmg: [1.1, 1.21, 1.33] },
      { id: '3295796664', name: '星云之歌', stats: { '操控性': 100, '空中效率': 30 } },
      { id: '902934539', name: '汇编器战靴', stats: { '空中效率': 30 }, dmg: 1.15 },
      { id: '3927963100', name: '异界之眸', stats: { '空中效率': 15 } },
      { id: '2341747657', name: '命运眷顾', stats: { '稳定性': 25, '操控性': 25 } },
      { id: '2663272111', name: '傻瓜雷达', stats: { '空中效率': 20 } },
      { id: '3241194940', name: '猖獗雄狮', stats: { '稳定性': 30, '射程': 5, '空中效率': 50 } },
      { id: '1694242448', name: '幸运裤', types: ['手炮'], stats: { '空中效率': 20 } },
      { id: '3347978672', name: '月之阵营靴', stats: { '稳定性': 30, '射程': 5, '填装速度': 100 }, reloadDurationMod: 0.9 },
      { id: '481860151', name: '机工诡诈臂袖', types: ['手枪'], stats: { '操控性': 100, '空中效率': 50, '填装速度': 100 }, dmg: 1.1 },
      { id: '3824622015', name: '亡灵之握', stats: { '空中效率': 30 } },
      { id: '569260333', name: '没有B计划', types: ['霰弹枪'], stats: { '空中效率': 30 }, dmg: 1.1 },
      { id: '1449897496', name: '守誓者', types: ['战斗弓箭'], stats: { '蓄力时间': 10, '空中效率': 40 } },
      { id: '1147638875', name: '毒蛇面貌', stats: { '操控性': 35, '空中效率': 10, '填装速度': 35 } },
      { id: '3241194941', name: '和平守护者', types: ['微型冲锋枪'], stats: { '操控性': 50, '空中效率': 40 } },
      { id: '235075862', name: '游隼胫甲', stats: { '空中效率': 20 } },
      { id: '117669763', name: '光辉跳舞机', stats: { '稳定性': 30, '射程': 5, '空中效率': 20 } },
      { id: '4222205045', name: '火焰润雨', types: ['融合步枪', '线性融合步枪'], stats: { '空中效率': 30 } },
      { id: '2805134531', name: '封印阿罕卡拉护手', stats: { '空中效率': 50 }, dmg: 1.2 },
      { id: '3268255645', name: '力量学派', stats: { '操控性': 40, '填装速度': 30 }, reloadDurationMod: 0.85 },
      { id: '858592012', name: '快速装弹松身裤', stats: { '操控性': [40, 45, 50, 55], '填装速度': [40, 45, 50, 55] }, reloadDurationMod: [1, 0.925, 0.915, 0.91, 0.89] },
      { id: '1731450287', name: '据点', types: ['刀剑'], stats: { '防御抗性': 100, '防御持久': 100 } },
      { id: '1155472384', name: '合成感受器', stats: { '操控性': 35, '填装速度': 35 } },
      { id: '593361144', name: '巨龙之影', stats: { '稳定性': 10 } },
      { id: '926349160', name: '晨星圣典', stats: { '空中效率': 50 } },
      { id: '187957397', name: '特里同之罪', stats: { '填装速度': 50 } }
    ] }
  ];
  var FX_ICON = {
    '2899505723': 'e0f1db219961a0ae101c648ba3fa7cba',
    '2586562813': '../armor-mods/icons/6def7c9c80.webp',
    '2467203039': '../armor-mods/icons/e1c888760c.webp',
    '14520248': '../armor-mods/icons/4fc3a01c77.webp',
    '531057500': '7ced3173fb475d8ad0a02390b0823be1',
    'ability_amplified': 'cc6ce294e996af1310981de31b45fcdd',
    'ability_radiant': 'a548069d59fa0bbf671da9e8ce31728e',
    '508515818': 'd2fdd193c4536cbc9cdaa82e24b7125a',
    '1190101211': 'cecb681426570c4cdde540284e6407c4',
    '2722573683': '61feac4f1271ba6cecc29cc50e20ab5a',
    '2722573681': '986e8f2dd0699371d605a331bb63742a',
    '4260353953': '1caf1eccf1072969ab93bd35fde62599',
    '2274196887': '2f3615ddcd86ab7c50653d2d1847c3bf',
    '4194622036': '83c6b789cfbe88a92f1d247ebf4ff62f',
    '83039194': 'd647fd2019707f044ce97b52f802e465',
    '3066103999': '6b1ce964c0d1dc6beba3083353efc3f6',
    '2272984657': '958ff340ae4ce16d7cf71c5268a13919',
    '362132290': 'cddc93648f0917dc8bd6663d38d7c379',
    '124726497': '24e6282bf3ee1c2a53717ed085cec441',
    '2626922126': '684547ed1f97efdca37df4f1a5c5e699',
    '1727069361': '4979f2f84c3da353c19815106267beb9',
    '4208512216': '25e7ef19cf989641771175e05bcfb3c2',
    '3469412970': '70b60b70634c6e539a531d47e58e1b9f',
    '537774543': '710c5e3aec26f0e3e468c656a2669e0d',
    '2711519343': '7b7917cbb4697af66a810def2b558328',
    '25156514': '9b08ff451b1b63c88096bc32698c62a0',
    '489583097': '095be27fd5f742a241fe77176e80cfdf',
    '1667892711': 'da340d0b0754087bb15d64a8897f5e3b',
    '3295796664': '3e0c0449da436384126e4cf4d3410086',
    '902934539': 'dcda11796b3ea21561068b723e5bbc93',
    '3927963100': '3e642a717efb7bdb36f0f5dcb4cb9d71',
    '2341747657': '28e26c9a7e6bca0ac431baae14f9fa16',
    '2663272111': '6fd9aecd4c810d6dafd2517ebd50cbe0',
    '3241194940': '7b334c8fca87e908ccea8fbe4c6af68f',
    '1694242448': 'efbc5e963de684734f9761785b51a375',
    '3347978672': 'c6e1c87f613c0eaabd4420dfc93de88a',
    '481860151': 'cbea782469054e260fd336b5222adc23',
    '3824622015': '4c1a349c2723d3aa84598da98c7a8805',
    '569260333': '1008decd8282aaf6c9e20461722e4a92',
    '1449897496': '23bd5476f6002f913fd511bc62d37826',
    '1147638875': '3945ff76d8e7ec70991cb0f6601c6797',
    '3241194941': 'fc5f93fd49cdea67bf72d139c5a2c227',
    '235075862': '7713596356b90eec06db4b7c50523685',
    '117669763': 'd1bc9350b3c6a8333936a1fd3ce8922b',
    '4222205045': '1018b32e9bed692b4766d1a870457eed',
    '2805134531': 'eabdd8dd9c1abcdbcaf4b0cbe8e97248',
    '3268255645': 'b8a55863e8d952535d306476df20cf3c',
    '858592012': 'c1afa2683c4762598af01b9b21a9ff7a',
    '1731450287': 'c10f29eba7f5e4eda1be088c46a4dc14',
    '1155472384': '640d76fb6ab52e290116455379194b07',
    '593361144': '100cd6b35af5fb3f979807d68ad57380',
    '926349160': 'bca803e50002410309460be0966fabe9',
    '187957397': '4f6f7f7ed33e3c274165705bba5aebc5'
  };
  function fxIco(e, cls) {
    var st = FX_ICON[e.id];
    if (!st) { return ''; }
    var src = st.indexOf('/') === -1 ? ICONS + st + '.webp' : st;
    return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(src) + '" alt="">';
  }
  function fxPickStep(v, step) {
    if (!Array.isArray(v)) { return v; }
    return v[Math.max(0, Math.min(step, v.length - 1))];
  }
  function fxSteps(e) {
    var n = 1;
    if (Array.isArray(e.dmg)) { n = Math.max(n, e.dmg.length); }
    if (Array.isArray(e.pveDmg)) { n = Math.max(n, e.pveDmg.length); }
    if (Array.isArray(e.reloadDurationMod)) { n = Math.max(n, e.reloadDurationMod.length); }
    if (Array.isArray(e.handlingDurationMod)) { n = Math.max(n, e.handlingDurationMod.length); }
    if (e.stats) {
      Object.keys(e.stats).forEach(function (k) {
        if (Array.isArray(e.stats[k])) { n = Math.max(n, e.stats[k].length); }
      });
    }
    return n;
  }
  function fxStepOf(e) {
    var n = fxSteps(e), s = S.fxStep[e.id] || 0;
    return s < 0 ? 0 : s >= n ? n - 1 : s;
  }
  function fxDmgOf(e, isPvp) {
    var src = isPvp ? e.dmg : (e.dmg != null ? e.dmg : e.pveDmg);
    if (src == null) { return 1; }
    return fxPickStep(src, fxStepOf(e));
  }
  function fxStatVal(e, k) {
    return fxPickStep(e.stats[k], fxStepOf(e));
  }
  function fxMulOf(e, field) {
    var v = e[field];
    return v == null ? 1 : fxPickStep(v, fxStepOf(e));
  }
  function fxHint(e) {
    var h = [], step = fxStepOf(e), on = fxOn(e.id);
    if (e.stats) {
      Object.keys(e.stats).forEach(function (k) {
        var v = e.stats[k];
        if (Array.isArray(v)) {
          if (on) { h.push('+' + fxPickStep(v, step) + ' ' + k); }
          else { h.push(v.map(function (x) { return '+' + x; }).join('/') + ' ' + k); }
        } else { h.push('+' + v + ' ' + k); }
      });
    }
    var dmg = e.dmg != null ? e.dmg : e.pveDmg, tag = e.pveDmg != null ? 'PvE 伤害 ' : '伤害 ';
    if (Array.isArray(dmg)) {
      if (on) { h.push(tag + '+' + parseFloat(((fxPickStep(dmg, step) - 1) * 100).toFixed(2)) + '%'); }
      else { h.push(tag + dmg.map(function (d) { return '+' + parseFloat(((d - 1) * 100).toFixed(2)) + '%'; }).join(' ｜ ')); }
    } else if (dmg) {
      h.push(tag + '+' + parseFloat(((dmg - 1) * 100).toFixed(2)) + '%');
    }
    if (e.reloadDurationMod != null) {
      var rm = on ? fxPickStep(e.reloadDurationMod, step) : (Array.isArray(e.reloadDurationMod) ? e.reloadDurationMod[e.reloadDurationMod.length - 1] : e.reloadDurationMod);
      if (rm < 1) { h.push('填装耗时 ×' + parseFloat(rm.toFixed(3))); }
    }
    if (e.handlingDurationMod != null) {
      var hm = fxPickStep(e.handlingDurationMod, step);
      if (hm < 1) { h.push('操控耗时 ×' + parseFloat(hm.toFixed(3))); }
    }
    return h.join(' · ');
  }
  function fxApplies(i, e) {
    if (e.el && elName(WR[i]) !== e.el) { return false; }
    if (e.types && e.types.indexOf(typeName(WR[i])) === -1) { return false; }
    if (e.sword && typeName(WR[i]) !== '刀剑') { return false; }
    return true;
  }
  function fxAll() {
    var out = [];
    FX_GROUPS.forEach(function (g) {
      g.items.forEach(function (e) { if (fxOn(e.id)) { out.push(e); } });
    });
    return out;
  }

  function frameKey(zh) {
    var raw = FRAME_EN[zh] || zh.replace(/框架$/, '');
    return raw.replace(/^Disruption Weapon \[Shield-Piercing\]$/i, 'Disruption Weapon')
      .replace(/\s+(Frame|Weapon|Glaive)$/i, '').replace(/-/g, ' ').trim();
  }
  function rangeCurve(typeZh, frameZh, intrinsicHash, bodyDmg) {
    var exo = EXOTIC_RANGES[typeZh];
    if (intrinsicHash != null && exo && exo[intrinsicHash]) { return exo[intrinsicHash]; }
    var k = frameKey(frameZh), tKey = typeZh, alias = RANGE_FRAME_ALIAS[tKey];
    var fKey = (alias && alias[k]) || k;
    if (NO_FALLOFF_FRAMES[fKey]) { return null; }
    var t = RANGE[tKey];
    if (!t) { return null; }
    var curve = t[fKey] || null;
    if (!curve && bodyDmg && typeof PVP_FRAMES !== 'undefined' && PVP_FRAMES[tKey]) {
      var bestK = null, bestD = Infinity, pft = PVP_FRAMES[tKey];
      Object.keys(pft).forEach(function (pk) {
        var diff = Math.abs(pft[pk].bodyDmg - bodyDmg);
        if (diff < bestD) { bestD = diff; bestK = pk; }
      });
      if (bestK) { curve = t[bestK] || null; }
    }
    if (!curve) { curve = t._ || null; }
    return curve;
  }
  function rangeMeters(typeZh, frameZh, stat, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var c = rangeCurve(typeZh, frameZh, o.intrinsicHash, o.bodyDmg);
    if (!c) { return null; }
    var mods = o.mods || {};
    var add = mods.rangeStatAdd || 0, adsAdd = mods.rangeAdsStatAdd || 0;
    var allS = mods.rangeAllScale == null ? 1 : mods.rangeAllScale;
    var hipS = mods.rangeHipScale == null ? 1 : mods.rangeHipScale;
    var d = Math.max(0, Math.min(100, (stat == null ? 0 : stat) + add));
    var m = Math.max(0, Math.min(100, d + adsAdd));
    var hip = c.s ? c.s[0] + c.s[1] * d : c.hip[0] + (c.hip[1] - c.hip[0]) * (d / 100);
    var endHip = c.e ? c.e[0] + c.e[1] * d : hip;
    var adsBase = c.s ? c.s[0] + c.s[1] * m : c.hip[0] + (c.hip[1] - c.hip[0]) * (m / 100);
    var zo = ZOOM_OVERRIDES[typeZh];
    var z = c.z;
    if (zo) {
      if (o.intrinsicHash != null && zo[o.intrinsicHash] != null) { z = zo[o.intrinsicHash]; }
      else if (c.z == null && zo.default != null) { z = zo.default; }
    }
    return {
      hip: hip * allS * hipS, hipEnd: endHip * allS * hipS,
      ads: adsBase * allS * z, zoom: z, floorPercent: c.fp || .5,
      rangeStat: d, adsRangeStat: m
    };
  }
  function reloadSeconds(typeZh, ammoZh, stat, mul, frameEn) {
    if (!typeZh || (typeZh === '战斗弓箭' && (frameEn === 'High Impact' || frameEn === 'High-Impact Frame'))) { return null; }
    var key = typeZh;
    if (typeZh === '榴弹发射器') { key = ammoZh === '威能' || ammoZh === 'Heavy' ? '榴弹发射器_威能' : '榴弹发射器_特殊'; }
    var c = RELOAD[key];
    if (!c) { return null; }
    var g = typeZh === '战斗弓箭' ? Math.min(stat, 80) : stat;
    return Math.max((c[0] * g * g + c[1] * g + c[2]) / 30, c[3]) * (mul == null ? 1 : mul);
  }
  function handlingTimes(typeZh, intrinsicHash, stat, scale, activeHashes) {
    var baseC = STD_HANDLING[typeZh];
    if (!baseC) { return null; }
    var catMap = HANDLING_INTRINSIC_CAT[typeZh];
    var catName = catMap && intrinsicHash != null ? catMap[intrinsicHash] : null;
    var c = (catName && HANDLING_CAT_OVERRIDES[typeZh] && HANDLING_CAT_OVERRIDES[typeZh][catName]) || baseC;
    var x = Math.max(0, Math.min(100, stat));
    var hasInstant = false;
    if (activeHashes) {
      for (var k = 0; k < activeHashes.length; k++) {
        if (INSTANT_HANDLING_PERKS[activeHashes[k]]) { hasInstant = true; break; }
      }
    }
    var d = hasInstant ? 100 : x, s = scale == null ? 1 : scale;
    function calc(p, v) { return p[0] * v + p[1]; }
    return {
      ready: calc(c.r, d) * s,
      stow: Math.max(calc(c.s, d) * s, 100 * c.s[0] + c.s[1]),
      ads: calc(c.a, x) * s
    };
  }

  function pvpDmg(typeZh, frameZh) {
    var t = PVP_FRAMES[TYPE_EN[typeZh]];
    if (!t) { return null; }
    var k = frameKey(frameZh);
    return (k && t[k]) || null;
  }
  function fmtM(n) { return n.toFixed(2) + 'm'; }
  function fmtS(n) { return n.toFixed(2) + 's'; }
  function fxOn(id) { return S.fx.indexOf(id) !== -1; }
  var TYPE_EN = {
    '自动步枪': 'Auto Rifle', '脉冲步枪': 'Pulse Rifle', '斥候步枪': 'Scout Rifle',
    '手炮': 'Hand Cannon', '手枪': 'Sidearm', '微型冲锋枪': 'Submachine Gun',
    '战斗弓箭': 'Combat Bow', '追踪步枪': 'Trace Rifle', '融合步枪': 'Fusion Rifle',
    '霰弹枪': 'Shotgun', '狙击步枪': 'Sniper Rifle', '偃月': 'Glaive',
    '线性融合步枪': 'Linear Fusion Rifle', '机枪': 'Machine Gun',
    '火箭发射器': 'Rocket Launcher', '榴弹发射器': 'Grenade Launcher', '刀剑': 'Sword'
  };
  var STAT_HASH = {
    IMPACT: 4043523819, RANGE: 1240592695, STABILITY: 155624089, HANDLING: 943549884,
    RELOAD: 4188031367, MAGAZINE: 3871231066, ZOOM: 3555269338, RECOIL: 2715839340,
    AE: 2714457168, BLAST: 3614673599, VELOCITY: 2523465841, AMMO_CAP: 925767036,
    DRAW_TIME: 447667954, HEAT: 3481294762, COOLING: 4006394725, CHARGE_TIME: 2961396640,
    RPM: 4284893193
  };
  var SCALED_STAT_HASHES = {};
  [STAT_HASH.MAGAZINE, STAT_HASH.AMMO_CAP, STAT_HASH.IMPACT, STAT_HASH.RPM, STAT_HASH.HEAT, STAT_HASH.COOLING]
    .forEach(function (h) { SCALED_STAT_HASHES[h] = 1; });
  var SPECIAL_STAT_HASHES = {};
  [STAT_HASH.RPM, STAT_HASH.CHARGE_TIME, STAT_HASH.DRAW_TIME, STAT_HASH.MAGAZINE,
    STAT_HASH.AMMO_CAP, STAT_HASH.HEAT, STAT_HASH.COOLING, STAT_HASH.RECOIL]
    .forEach(function (h) { SPECIAL_STAT_HASHES[h] = 1; });
  var PERK_STAT_OVERRIDES = {
    3779301690: [[STAT_HASH.CHARGE_TIME, 10]],
    744770875: [[STAT_HASH.CHARGE_TIME, 10]]
  };
  var ELEMENTAL_CAPACITOR_HASHES = { 3511092054: 1, 711234314: 1 };
  var ELEMENTAL_CAPACITOR_ELEMENTS = ['Solar', 'Arc', 'Void', 'Strand', 'Stasis'];
  var ELEMENTAL_CAPACITOR_ZH = ['烈日', '电弧', '虚空', '缚丝', '冰影'];
  var ELEMENTAL_CAPACITOR_STAT = [STAT_HASH.RELOAD, STAT_HASH.HANDLING, STAT_HASH.STABILITY, STAT_HASH.AE, STAT_HASH.RECOIL];
  var AUTO_PERKS = {};
  [2896038713, 2402480669, 2594592626, 2037312142, 1600092898, 828056542, 1754714824, 834262328,
    454085387, 2529412083, 201365942, 3523746922, 3414324643, 2662236651, 2652708987, 617966211,
    3673922083, 2889515627, 3194351027, 2275087323, 4049631843, 859780267, 438098033, 2748801589,
    1015611457, 2923251173, 3047969693, 624891305, 3751912585, 331667533, 1427256713, 254337357,
    2213355989, 2002547233, 4204405035, 2551157718, 23371658, 365154968, 2939589096]
    .forEach(function (h) { AUTO_PERKS[h] = 1; });
  var CHECK_ONLY_PERKS = { 555281244: -1, 332733060: -1, 65604327: -1 };
  var PVP_HP = 230, PVP_EPS = 1e-9, PVP_INTRA_BURST = 0.0667;
  var PVP_BOW_A = { bodyDmg: 219.81, headDmg: 256.92 };
  var PVP_BOW_B = { bodyDmg: 216.17, headDmg: 290.34 };
  var PVP_BOW_C = { bodyDmg: 199.02, headDmg: 266.45 };
  var PVP_FRAMES = {
    'Auto Rifle': {
      Adaptive: { bodyDmg: 15.5, headDmg: 27.21 }, 'Balanced Heat': { bodyDmg: 20.01, headDmg: 33.93 },
      'High Impact': { bodyDmg: 22, headDmg: 39.48 }, Lightweight: { bodyDmg: 13.61, headDmg: 23.09 },
      Precision: { bodyDmg: 20.01, headDmg: 33.93 }, 'Rapid Fire': { bodyDmg: 13.61, headDmg: 23.08 },
      Support: { bodyDmg: 18.85, headDmg: 26.42 }
    },
    'Pulse Rifle': {
      Adaptive: { bodyDmg: 22, headDmg: 36.45, burstSize: 3 },
      'Aggressive Burst': { bodyDmg: 15.5, headDmg: 30.55, burstSize: 4 },
      'Balanced Heat': { bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
      'Dynamic Heat': { bodyDmg: 15.89, headDmg: 29.45, burstSize: 3 },
      'Heavy Burst': { bodyDmg: 23.02, headDmg: 42.66, burstSize: 2, intraBurstDelay: 0.1 },
      'High Impact': { bodyDmg: 21.5, headDmg: 38.58, burstSize: 3 },
      'Legacy PR 55': { bodyDmg: 19.71, headDmg: 31.5, burstSize: 3 },
      Lightweight: { bodyDmg: 18.82, headDmg: 30.07, burstSize: 3 },
      'Rapid Fire': { bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
      'Micro Missile': { bodyDmg: 30.23, headDmg: 30.23, burstSize: 3, ammoPerBurst: true, intraBurstDelay: 4 / 30, rpm: 5400 / 17 }
    },
    'Scout Rifle': {
      Aggressive: { bodyDmg: 54.03, headDmg: 91.63 }, 'Balanced Heat': { bodyDmg: 27.32, headDmg: 53.31 },
      'High Impact': { bodyDmg: 42.01, headDmg: 84.43 }, Lightweight: { bodyDmg: 38.02, headDmg: 64.49 },
      Precision: { bodyDmg: 38.53, headDmg: 69.13 }, 'Rapid Fire': { bodyDmg: 27.32, headDmg: 53.31 }
    },
    'Hand Cannon': {
      Adaptive: { bodyDmg: 44.53, headDmg: 79.88 }, Aggressive: { bodyDmg: 48.73, headDmg: 90.3 },
      'Dynamic Heat': { bodyDmg: 46.45, headDmg: 72.41, ammoTypeOverrides: { Special: { bodyDmg: 60.05, headDmg: 90.08 } } },
      'Heavy Burst': { bodyDmg: 24.01, headDmg: 52.84 }, Lightweight: { bodyDmg: 44.52, headDmg: 80.1 },
      Precision: { bodyDmg: 45.32, headDmg: 70.64 }, 'Spread Shot': { bodyDmg: 120.02, headDmg: 144.72 }
    },
    Sidearm: {
      Adaptive: { bodyDmg: 36.02, headDmg: 57.56 }, 'Adaptive Burst': { bodyDmg: 20.01, headDmg: 37.07, burstSize: 3 },
      'Dynamic Heat': { bodyDmg: 31.8, headDmg: 50.81 },
      'Heavy Burst': { bodyDmg: 31.02, headDmg: 49.57, burstSize: 2, intraBurstDelay: 0.1 },
      Lightweight: { bodyDmg: 31.02, headDmg: 49.57 }, 'Micro Missile': { bodyDmg: 158.37, headDmg: 158.37 },
      Precision: { bodyDmg: 40.01, headDmg: 63.94 }, 'Rapid Fire': { bodyDmg: 25.02, headDmg: 39.98 },
      'Together Forever': { bodyDmg: 36.03, headDmg: 57.57 }
    },
    'Submachine Gun': {
      Adaptive: { bodyDmg: 11.5, headDmg: 19.06 }, Aggressive: { bodyDmg: 13.61, headDmg: 23.88 },
      'Aggressive Burst': { bodyDmg: 15.02, headDmg: 26.35 }, 'Balanced Heat': { bodyDmg: 10.6, headDmg: 20.06 },
      Lightweight: { bodyDmg: 10.6, headDmg: 20.06 }, 'MIDA Synergy': { bodyDmg: 10.6, headDmg: 20.05 },
      Precision: { bodyDmg: 16.71, headDmg: 26.71 }
    },
    'Combat Bow': {
      'High Impact Longbow': { bodyDmg: 120.94, headDmg: 157.7, isChargeTime: true, isBow: true },
      Lightweight: { bodyDmg: 77.6, headDmg: 124.01, isChargeTime: true, isBow: true },
      Precision: { bodyDmg: 100.79, headDmg: 131.43, isChargeTime: true, isBow: true },
      'High Impact': {
        bodyDmg: 196.52, headDmg: 263.95,
        perkOverrides: {
          3603807747: PVP_BOW_A, 2523856971: PVP_BOW_A,
          1202133695: PVP_BOW_B, 2181638943: PVP_BOW_B,
          2136073194: PVP_BOW_C, 600923142: PVP_BOW_C
        }
      }
    },
    'Trace Rifle': { Adaptive: { bodyDmg: 15.01, headDmg: 20.16 } },
    'Fusion Rifle': {
      Adaptive: { bodyDmg: 46.3, headDmg: 46.3, isChargeTime: true, isFusion: true, boltsPerBurst: 7, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      Aggressive: { bodyDmg: 28.82, headDmg: 28.82, isChargeTime: true, isFusion: true, boltsPerBurst: 12, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 4, recovery: 19 / 30 } },
      'High Impact': { bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      Precision: { bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } },
      'Rapid Fire': { bodyDmg: 33.97, headDmg: 33.97, isChargeTime: true, isFusion: true, boltsPerBurst: 9, fusionTiming: { boltInterval: 2 / 30, boltsPerGroup: 1, recovery: 0.5 } }
    },
    Shotgun: {
      Aggressive: { bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
      'Shot Package': { bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
      'Heavy Burst': { bodyDmg: 107.06, headDmg: 187.87, rpm: 60 / (19 / 30) },
      Lightweight: { bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
      'Pinpoint Slug': { bodyDmg: 170.1, headDmg: 298.51 },
      Precision: { bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
      'Rapid Fire': { bodyDmg: 20, headDmg: 22.15, isShotgun: true, pelletsPerShot: 12 },
      'Rapid Fire Slug': { bodyDmg: 160.11, headDmg: 280.97 }
    },
    'Sniper Rifle': {
      Adaptive: { bodyDmg: 125.03, headDmg: 405.74 }, Aggressive: { bodyDmg: 141.89, headDmg: 496.63 },
      'High Impact': { bodyDmg: 155.09, headDmg: 427.25 }, 'Dynamic Heat': { bodyDmg: 113.11, headDmg: 389.22 },
      'Rapid Fire': { bodyDmg: 85.03, headDmg: 292.62 }, Disruption: { bodyDmg: 253.46, headDmg: 698.26 }
    },
    Glaive: {
      Adaptive: { bodyDmg: 136.56, headDmg: 136.56 }, Aggressive: { bodyDmg: 147.52, headDmg: 147.52 },
      Melee: { bodyDmg: 97.54, headDmg: 97.54 }, 'Rapid Fire': { bodyDmg: 120.85, headDmg: 120.85 }
    },
    Sword: {
      Adaptive: { bodyDmg: 230, headDmg: 230 }, Aggressive: { bodyDmg: 230, headDmg: 230 },
      Caster: { bodyDmg: 230, headDmg: 230 }, Lightweight: { bodyDmg: 230, headDmg: 230 },
      Vortex: { bodyDmg: 230, headDmg: 230 }, 'Wave Sword': { bodyDmg: 230, headDmg: 230 }
    },
    'Grenade Launcher': {
      Adaptive: { bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
      'Rapid Fire': { bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
      'Area Denial': {
        bodyDmg: 7.8, headDmg: 7.8,
        areaDenial: { projectileDamage: 7.8, projectiles: 5, tickDamage: 20.01, tickInterval: 0.25, activationDelay: 0.5, ticks: 22 },
        notes: '假定全部 5 枚弹头命中且目标持续停留在领域内；重叠领域不叠加伤害，且不计飞行与连发延迟。'
      },
      'Micro Missile': { bodyDmg: 143.83, headDmg: 143.83 },
      Wave: { bodyDmg: 139, headDmg: 139 },
      'Compressed Wave': { bodyDmg: 159, headDmg: 159 }
    },
    'Linear Fusion Rifle': {
      'Adaptive Burst': { bodyDmg: 78.4, headDmg: 269.79, isChargeTime: true, chargeBurstSize: 3, intraBurstDelay: 0.2, chargeRecovery: 0.5 },
      Precision: { bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true, chargeBurstSize: 1, chargeRecovery: 0.5 }
    },
    'Machine Gun': {
      Adaptive: { bodyDmg: 41.5, headDmg: 58.18 }, Aggressive: { bodyDmg: 36.03, headDmg: 46.98 },
      'Balanced Heat': { bodyDmg: 25.53, headDmg: 33.29 }, 'High Impact': { bodyDmg: 47.49, headDmg: 68.44 },
      'Rapid Fire': { bodyDmg: 25.53, headDmg: 33.29 }
    },
    'Rocket Launcher': {
      Adaptive: { bodyDmg: 306, headDmg: 306 }, Aggressive: { bodyDmg: 306, headDmg: 306 },
      'High Impact': { bodyDmg: 312, headDmg: 312 }, Precision: { bodyDmg: 277, headDmg: 277 }
    }
  };
  var PVP_EXOTICS = {
    Centrifuse: { weaponType: 'Auto Rifle', bodyDmg: 20.01, headDmg: 33.94 },
    'Cerberus+1': { weaponType: 'Auto Rifle', bodyDmg: 18.70380029, headDmg: 33.55681817, pelletsPerShot: 4, modelAssumptions: ['以衰减前基础伤害计算（贴脸伤害低 16.67%），且假定 4 枚弹头全部命中。'] },
    'Choir of One': { weaponType: 'Auto Rifle', bodyDmg: 41.99, headDmg: 75.33 },
    'Hard Light': { weaponType: 'Auto Rifle', bodyDmg: 15.5, headDmg: 27.21 },
    'Khvostov 7G-0X': { weaponType: 'Auto Rifle', bodyDmg: 15.02, headDmg: 26.36 },
    'Monte Carlo': { weaponType: 'Auto Rifle', bodyDmg: 15.5, headDmg: 27.21 },
    Necrochasm: { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.08 },
    'Quicksilver Storm': { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.09 },
    'SUROS Regime': { weaponType: 'Auto Rifle', bodyDmg: 15.02, headDmg: 26.36 },
    'Sweet Business': { weaponType: 'Auto Rifle', bodyDmg: 16.46, headDmg: 25.34 },
    "Tommy's Matchbook": { weaponType: 'Auto Rifle', bodyDmg: 13.61, headDmg: 23.08 },
    Heirloom: { weaponType: 'Bow', bodyDmg: 164.74, headDmg: 172.36, hitCountOnly: true },
    'Hierarchy of Needs': { weaponType: 'Bow', bodyDmg: 121, headDmg: 157.77, isChargeTime: true, isBow: true },
    'Le Monarque': { weaponType: 'Bow', bodyDmg: 92.6, headDmg: 139.01, isChargeTime: true, isBow: true },
    "Leviathan's Breath": { weaponType: 'Bow', bodyDmg: 196.52, headDmg: 263.95, isChargeTime: true, isBow: true },
    "Ticuu's Divination": { weaponType: 'Bow', bodyDmg: 77.61, headDmg: 124.03, isChargeTime: true, isBow: true },
    'Trinity Ghoul': { weaponType: 'Bow', bodyDmg: 102.78, headDmg: 134.02, isChargeTime: true, isBow: true },
    'Verglas Curve': { weaponType: 'Bow', bodyDmg: 77.6, headDmg: 124.01, isChargeTime: true, isBow: true },
    'Wish-Ender': { weaponType: 'Bow', bodyDmg: 86.99, headDmg: 133.73, isChargeTime: true, isBow: true },
    'Wish-Keeper': { weaponType: 'Bow', bodyDmg: 100.79, headDmg: 131.43, isChargeTime: true, isBow: true },
    'Ace of Spades': { weaponType: 'Hand Cannon', bodyDmg: 44.53, headDmg: 79.88 },
    Crimson: { weaponType: 'Hand Cannon', bodyDmg: 18.01, headDmg: 33.37, burstSize: 3, intraBurstDelay: 0.1 },
    'Graviton Spike': { weaponType: 'Hand Cannon', bodyDmg: 42.03, headDmg: 77.87 },
    Hawkmoon: { weaponType: 'Hand Cannon', bodyDmg: 44.52, headDmg: 79.88 },
    Lumina: { weaponType: 'Hand Cannon', bodyDmg: 44.52, headDmg: 79.88 },
    Malfeasance: { weaponType: 'Hand Cannon', bodyDmg: 45.29, headDmg: 70.6 },
    Sturm: { weaponType: 'Hand Cannon', bodyDmg: 48.73, headDmg: 90.3 },
    Sunshot: { weaponType: 'Hand Cannon', bodyDmg: 42.03, headDmg: 77.68 },
    'The Last Word': { weaponType: 'Hand Cannon', bodyDmg: 43.09, headDmg: 77.3 },
    Thorn: { weaponType: 'Hand Cannon', bodyDmg: 46.13, headDmg: 81.48 },
    Turncoat: { weaponType: 'Hand Cannon', bodyDmg: 69.55, headDmg: 104.9 },
    'Bad Juju': { weaponType: 'Pulse Rifle', bodyDmg: 15.5, headDmg: 28.73, burstSize: 3 },
    'Collective Obligation': { weaponType: 'Pulse Rifle', bodyDmg: 19.71, headDmg: 32.66, burstSize: 3 },
    'Graviton Lance': { weaponType: 'Pulse Rifle', bodyDmg: 23.03, headDmg: 42.68, burstSize: 2, intraBurstDelay: 0.1 },
    'New Malpais': { weaponType: 'Pulse Rifle', bodyDmg: 30.23, headDmg: 30.23, burstSize: 3, ammoPerBurst: true, intraBurstDelay: 4 / 30, rpm: 5400 / 17 },
    'No Time to Explain': { weaponType: 'Pulse Rifle', bodyDmg: 21.5, headDmg: 38.57, burstSize: 3 },
    'Outbreak Perfected': { weaponType: 'Pulse Rifle', bodyDmg: 19.71, headDmg: 31.5, burstSize: 3 },
    'Red Death Reformed': { weaponType: 'Pulse Rifle', bodyDmg: 21.5, headDmg: 38.58, burstSize: 3 },
    'Revision Zero': { weaponType: 'Pulse Rifle', bodyDmg: 15.5, headDmg: 30.55, burstSize: 4, originTraitOverrides: { 2206869417: { bodyDmg: 23.02, headDmg: 42.66, burstSize: 2, intraBurstDelay: 0.1 } } },
    'Vigilance Wing': { weaponType: 'Pulse Rifle', bodyDmg: 16.13, headDmg: 26.09, burstSize: 5 },
    "Dead Man's Tale": { weaponType: 'Scout Rifle', bodyDmg: 54.03, headDmg: 91.63 },
    'MIDA Multi-Tool': { weaponType: 'Scout Rifle', bodyDmg: 38.02, headDmg: 64.49 },
    'Polaris Lance': { weaponType: 'Scout Rifle', bodyDmg: 42.04, headDmg: 84.5 },
    "Skyburner's Oath": { weaponType: 'Scout Rifle', bodyDmg: 42.01, headDmg: 84.22 },
    Symmetry: { weaponType: 'Scout Rifle', bodyDmg: 27.99, headDmg: 54.61 },
    'The Jade Rabbit': { weaponType: 'Scout Rifle', bodyDmg: 42.04, headDmg: 84.5 },
    'Third Iteration': { weaponType: 'Scout Rifle', bodyDmg: 38.02, headDmg: 64.49 },
    'Touch of Malice': { weaponType: 'Scout Rifle', bodyDmg: 27.32, headDmg: 53.31 },
    'Wicked Implement': { weaponType: 'Scout Rifle', bodyDmg: 27.99, headDmg: 54.61 },
    'Buried Bloodline': { weaponType: 'Sidearm', bodyDmg: 42.3, headDmg: 75.89 },
    'Cryosthesia 77K': { weaponType: 'Sidearm', bodyDmg: 40.02, headDmg: 63.95 },
    "Devil's Ruin": { weaponType: 'Sidearm', bodyDmg: 36.02, headDmg: 57.56 },
    'Final Warning': { weaponType: 'Sidearm', bodyDmg: 25.19, headDmg: 40.26 },
    Forerunner: { weaponType: 'Sidearm', bodyDmg: 41.93, headDmg: 77.7 },
    'Rat King': { weaponType: 'Sidearm', bodyDmg: 25.02, headDmg: 39.98 },
    "Traveler's Chosen": { weaponType: 'Sidearm', bodyDmg: 36.03, headDmg: 57.57 },
    Trespasser: { weaponType: 'Sidearm', bodyDmg: 20.01, headDmg: 37.07, burstSize: 3 },
    'Barrow-Dyad': { weaponType: 'Submachine Gun', bodyDmg: 13.62, headDmg: 23.89 },
    'Osteo Striga': { weaponType: 'Submachine Gun', bodyDmg: 18.51, headDmg: 29.57 },
    Riskrunner: { weaponType: 'Submachine Gun', bodyDmg: 11.5, headDmg: 19.06 },
    Tarrabah: { weaponType: 'Submachine Gun', bodyDmg: 13.61, headDmg: 23.88 },
    'The Huckleberry': { weaponType: 'Submachine Gun', bodyDmg: 13.61, headDmg: 23.88 },
    'The Manticore': { weaponType: 'Submachine Gun', bodyDmg: 10.6, headDmg: 20.06 },
    "Ager's Scepter": { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Coldheart: { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Divinity: { weaponType: 'Trace Rifle', bodyDmg: 7.5, headDmg: 10.08 },
    Lodestar: { weaponType: 'Trace Rifle', bodyDmg: 12.76, headDmg: 17.13 },
    Microcosm: { weaponType: 'Trace Rifle', bodyDmg: 28.96, headDmg: 38.9 },
    'Prometheus Lens': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    'Ruinous Effigy': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    'The Navigator': { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Wavesplitter: { weaponType: 'Trace Rifle', bodyDmg: 15.01, headDmg: 20.16 },
    Bastion: { weaponType: 'Fusion Rifle', bodyDmg: 30.6, headDmg: 30.6, isChargeTime: true, isFusion: true, boltsPerBurst: 3 },
    'Delicate Tomb': { weaponType: 'Fusion Rifle', bodyDmg: 16.99, headDmg: 16.99, isChargeTime: true, isFusion: true, boltsPerBurst: 9 },
    'Jötunn': { weaponType: 'Fusion Rifle', bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    Merciless: { weaponType: 'Fusion Rifle', bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5 },
    'One Thousand Voices': { weaponType: 'Fusion Rifle', bodyDmg: 79.22, headDmg: 79.22, isChargeTime: true, isFusion: true, boltsPerBurst: 5 },
    Telesto: { weaponType: 'Fusion Rifle', bodyDmg: 48, headDmg: 48, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    Tessellation: { weaponType: 'Fusion Rifle', bodyDmg: 46.29, headDmg: 46.29, isChargeTime: true, isFusion: true, boltsPerBurst: 7 },
    'Vex Mythoclast': { weaponType: 'Fusion Rifle', bodyDmg: 22, headDmg: 39.48 },
    'Conditional Finality': { weaponType: 'Shotgun', bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
    Duality: { weaponType: 'Shotgun', bodyDmg: 23.09, headDmg: 25.58, isShotgun: true, pelletsPerShot: 12 },
    'Legend of Acrius': { weaponType: 'Shotgun', bodyDmg: 28, headDmg: 31.02, isShotgun: true, pelletsPerShot: 12 },
    'Lord of Wolves': { weaponType: 'Shotgun', bodyDmg: 22.48, headDmg: 42.54 },
    "Slayer's Fang": { weaponType: 'Shotgun', bodyDmg: 170.1, headDmg: 298.51 },
    'The Chaperone': { weaponType: 'Shotgun', bodyDmg: 160.11, headDmg: 280.97 },
    'The Fourth Horseman': { weaponType: 'Shotgun', bodyDmg: 20, headDmg: 22.15, isShotgun: true, pelletsPerShot: 12 },
    'Tractor Cannon': { weaponType: 'Shotgun', bodyDmg: 23.01, headDmg: 25.49, isShotgun: true, pelletsPerShot: 12 },
    Borealis: { weaponType: 'Sniper Rifle', bodyDmg: 141.89, headDmg: 496.63 },
    Cloudstrike: { weaponType: 'Sniper Rifle', bodyDmg: 85.03, headDmg: 292.62 },
    'D.A.R.C.I.': { weaponType: 'Sniper Rifle', bodyDmg: 85.03, headDmg: 292.62 },
    'Ice Breaker': { weaponType: 'Sniper Rifle', bodyDmg: 141.89, headDmg: 496.63 },
    "Izanagi's Burden": { weaponType: 'Sniper Rifle', bodyDmg: 125.03, headDmg: 405.74 },
    'New Land Beyond': { weaponType: 'Sniper Rifle', bodyDmg: 155.09, headDmg: 427.25 },
    'Still Hunt': { weaponType: 'Sniper Rifle', bodyDmg: 125.03, headDmg: 405.74 },
    'Whisper of the Worm': { weaponType: 'Sniper Rifle', bodyDmg: 169.06, headDmg: 591.71 },
    Arbalest: { weaponType: 'Linear Fusion Rifle', bodyDmg: 132.07, headDmg: 568.42, isChargeTime: true },
    Euphony: { weaponType: 'Linear Fusion Rifle', bodyDmg: 39.2, headDmg: 134.9, isChargeTime: true },
    "Finality's Auger": { weaponType: 'Linear Fusion Rifle', bodyDmg: 78.4, headDmg: 269.79, isChargeTime: true },
    'Lorentz Driver': { weaponType: 'Linear Fusion Rifle', bodyDmg: 132.07, headDmg: 568.42, isChargeTime: true },
    'Sleeper Simulant': { weaponType: 'Linear Fusion Rifle', bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true },
    'The Queenbreaker': { weaponType: 'Linear Fusion Rifle', bodyDmg: 165.09, headDmg: 568.09, isChargeTime: true },
    Alethonym: { weaponType: 'Grenade Launcher', bodyDmg: 129.24, headDmg: 129.24 },
    Anarchy: { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'Dead Messenger': { weaponType: 'Grenade Launcher', bodyDmg: 139, headDmg: 139 },
    'Ex Diris': { weaponType: 'Grenade Launcher', bodyDmg: 143.83, headDmg: 143.83 },
    'Fighting Lion': { weaponType: 'Grenade Launcher', bodyDmg: 144.95, headDmg: 144.95 },
    Parasite: { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    "Salvation's Grip": { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'The Colony': { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    'The Prospector': { weaponType: 'Grenade Launcher', bodyDmg: 295, headDmg: 295, impactDmg: 147, blastFloor: 146, blastCap: 153 },
    Witherhoard: { weaponType: 'Grenade Launcher', bodyDmg: 143.83, headDmg: 143.83 },
    'Deterministic Chaos': { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    'Grand Overture': { weaponType: 'Machine Gun', bodyDmg: 332.59, headDmg: 332.59 },
    'Heir Apparent': { weaponType: 'Machine Gun', bodyDmg: 25.53, headDmg: 33.29 },
    'Service of Luzaku': { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    Thunderlord: { weaponType: 'Machine Gun', bodyDmg: 41.5, headDmg: 58.18 },
    Xenophage: { weaponType: 'Machine Gun', bodyDmg: 47.49, headDmg: 68.44 },
    'Edge of Action': { weaponType: 'Glaive', bodyDmg: 136.56, headDmg: 136.56 },
    'Edge of Concurrence': { weaponType: 'Glaive', bodyDmg: 120.85, headDmg: 120.85 },
    'Edge of Intent': { weaponType: 'Glaive', bodyDmg: 147.52, headDmg: 147.52 },
    Vexcalibur: { weaponType: 'Glaive', bodyDmg: 120.85, headDmg: 120.85 },
    Winterbite: { weaponType: 'Glaive', bodyDmg: 147.52, headDmg: 147.52 },
    "Eriana's Vow": { weaponType: 'Hand Cannon', bodyDmg: 77.04, headDmg: 162.32 },
    'The Lament': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    'Black Talon': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Heartshadow: { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Wolfsbane: { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    'Worldline Zero': { weaponType: 'Sword', bodyDmg: 230, headDmg: 230 },
    Deathbringer: { weaponType: 'Rocket Launcher', bodyDmg: 312, headDmg: 312 },
    "Dragon's Breath": { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'Eyes of Tomorrow': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    Gjallarhorn: { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'The Wardcliff Coil': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    Truth: { weaponType: 'Rocket Launcher', bodyDmg: 277, headDmg: 277 },
    'Two-Tailed Fox': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 },
    'Whirling Ovation': { weaponType: 'Rocket Launcher', bodyDmg: 306, headDmg: 306 }
  };
  var PVP_DISABLED = { 3201496230: 1, 1545231802: 1 };
  var PVP_STRIP_DMG = {};
  ['192157151', '2565067140', '3186078099', '1164602481', '3993379141', '1968497646',
    '3365897133', '1551736345', '1954620775', '1562897767', '3038247973', '64866129',
    '1866048759', '3118144663', '2416023159', '3050799639', '2450788523', '4207509907',
    '1583705720', '1409206216', '2883096192', '1782407750', '2241043034']
    .forEach(function (h) { PVP_STRIP_DMG[h] = 1; });
  var PVP_CHRONO_PERKS = {
    2720533289: { kind: 'magnificentHowl', enhanced: false }, 3042219245: { kind: 'magnificentHowl', enhanced: true },
    469285294: { kind: 'recombination', enhanced: false }, 3335686050: { kind: 'recombination', enhanced: true },
    95528736: { kind: 'onslaught', enhanced: false }, 956288240: { kind: 'onslaught', enhanced: true },
    2896038713: { kind: 'focusedFury', enhanced: false, chronological: true }, 2402480669: { kind: 'focusedFury', enhanced: true, chronological: true },
    2594592626: { kind: 'controlledBurst', enhanced: false, chronological: true }, 2037312142: { kind: 'controlledBurst', enhanced: true, chronological: true },
    1600092898: { kind: 'backupPlan', enhanced: false, chronological: true }, 828056542: { kind: 'backupPlan', enhanced: true, chronological: true },
    1754714824: { kind: 'kickstart', enhanced: false, chronological: true }, 834262328: { kind: 'kickstart', enhanced: true, chronological: true },
    454085387: { kind: 'bluntExecution', enhanced: false, chronological: true }, 2529412083: { kind: 'bluntExecution', enhanced: true, chronological: true },
    201365942: { kind: 'archersTempo', enhanced: false, chronological: true }, 3523746922: { kind: 'archersTempo', enhanced: true, chronological: true },
    3414324643: { kind: 'archersGambit', enhanced: false, chronological: true }, 2662236651: { kind: 'archersGambit', enhanced: true, chronological: true },
    2652708987: { kind: 'successfulWarmup', enhanced: false, chronological: true }, 617966211: { kind: 'successfulWarmup', enhanced: true, chronological: true },
    3673922083: { kind: 'adagio', enhanced: false, chronological: true }, 2889515627: { kind: 'adagio', enhanced: true, chronological: true },
    3194351027: { kind: 'explosiveLight', enhanced: false, chronological: true }, 2275087323: { kind: 'explosiveLight', enhanced: true, chronological: true },
    4049631843: { kind: 'oneForAll', enhanced: false }, 859780267: { kind: 'oneForAll', enhanced: true },
    438098033: { kind: 'harmony', enhanced: false }, 2748801589: { kind: 'harmony', enhanced: true },
    1015611457: { kind: 'killClip', enhanced: false }, 2923251173: { kind: 'killClip', enhanced: true },
    3047969693: { kind: 'desperado', enhanced: false, delayScale: 0.7 }, 624891305: { kind: 'desperado', enhanced: true, delayScale: 0.7 },
    3751912585: { kind: 'cascadePoint', enhanced: false }, 331667533: { kind: 'cascadePoint', enhanced: true },
    1427256713: { kind: 'reservoirBurst', enhanced: false }, 254337357: { kind: 'reservoirBurst', enhanced: true },
    2213355989: { kind: 'highImpactReserves', enhanced: false }, 2002547233: { kind: 'highImpactReserves', enhanced: true },
    4204405035: { kind: 'highImpactReserves', enhanced: false },
    2551157718: { kind: 'boxBreathing', enhanced: false }, 23371658: { kind: 'boxBreathing', enhanced: true },
    365154968: { kind: 'targetLock', enhanced: false }, 2939589096: { kind: 'targetLock', enhanced: true },
    555281244: { kind: 'precisionInstrument', enhanced: false }, 332733060: { kind: 'precisionInstrument', enhanced: true }
  };
  var PERK_FX_NON_STEP_KEYS = {
    h: 1, overflow: 1, baseMagazineRamp: 1, rangeAllScale: 1, rangeHipScale: 1,
    rangeAdsStatAdd: 1, effectiveZoomScale: 1, projectileVelocityScale: 1, projectileVelocityWeaponTypes: 1
  };
  function ammoEn(zh) {
    return zh === '威能' ? 'Heavy' : zh === '特殊' ? 'Special' : 'Primary';
  }
  function weaponsStatMods(val) {
    var clamped = Math.max(0, Math.min(100, Number(val) || 0));
    var a = clamped / 1000;
    return { percent: 100 * a, reloadDurationScale: 1 - a, handlingDurationScale: 1 - a };
  }
  function getTtkData(i, activeHashes) {
    var r = WR[i];
    if (!r) { return null; }
    var ty = TYPE_EN[typeName(r)] || typeName(r);
    var hash = String(r[W_H]), enName = P && P.en ? P.en[i] : null;
    if (ty === 'Sword') { return { bodyDmg: PVP_HP, headDmg: PVP_HP, assumedOneHit: true }; }
    if (ty === 'Fusion Rifle' && (hash === '2200470033' || enName === "Cull's Shadow")) {
      return Object.assign({}, PVP_FRAMES['Fusion Rifle']['Rapid Fire'], {
        modelAssumptions: ['Cull’s Shadow 按面板充能时间（基础 533ms）及速射融合伤害估算，未计腐化附加伤害。']
      });
    }
    if (ty === 'Shotgun' && (hash === '2699423382' || enName === 'MIDA Macro-Tool')) { return PVP_FRAMES.Shotgun.Precision; }
    if (ty === 'Auto Rifle' && (hash === '2694044463' || enName === 'Jiangshi AR1')) { return PVP_FRAMES['Auto Rifle'].Precision; }
    if (ty === 'Hand Cannon' && (['153979396', '2763843899', '3757612024', '2033531688'].indexOf(hash) !== -1 || enName === "Luna's Howl")) {
      return PVP_FRAMES['Hand Cannon'].Adaptive;
    }
    if (isExotic(r) && enName && PVP_EXOTICS[enName]) {
      var exo = PVP_EXOTICS[enName], k, base = {};
      for (k in exo) { if (Object.prototype.hasOwnProperty.call(exo, k) && k !== 'originTraitOverrides') { base[k] = exo[k]; } }
      if (exo.originTraitOverrides && activeHashes) {
        for (k = 0; k < activeHashes.length; k++) {
          var ov = exo.originTraitOverrides[activeHashes[k]];
          if (ov) { return Object.assign(base, ov); }
        }
      }
      return base;
    }
    var byType = PVP_FRAMES[ty];
    if (!byType) { return null; }
    var fk = frameKey(frameOf(r)[0]);
    var row = fk ? byType[fk] : null;
    if (!row) { return null; }
    if (!row.ammoTypeOverrides && !row.perkOverrides) { return row; }
    var out = {};
    for (k in row) { if (Object.prototype.hasOwnProperty.call(row, k) && k !== 'ammoTypeOverrides' && k !== 'perkOverrides') { out[k] = row[k]; } }
    var ammo = ammoEn(V.am[r[W_AMMO]][0]);
    if (row.ammoTypeOverrides && row.ammoTypeOverrides[ammo]) { Object.assign(out, row.ammoTypeOverrides[ammo]); }
    if (row.perkOverrides && activeHashes) {
      for (k = 0; k < activeHashes.length; k++) {
        if (row.perkOverrides[activeHashes[k]]) { Object.assign(out, row.perkOverrides[activeHashes[k]]); break; }
      }
    }
    return out;
  }
  function roundPvpDamage(n) {
    if (!Number.isFinite(n)) { return '—'; }
    var r = Math.round((n + Number.EPSILON) * 100) / 100;
    return r.toFixed(2);
  }
  function calculateOverflowSteps(def, magCap, ammoEnStr) {
    if (!def || !magCap || magCap <= 0) { return null; }
    var base = Math.round(magCap), steps = [], e, a, i;
    if (def.type === 'random') {
      var lo = base + Math.ceil(def.min * base), hi = base + Math.ceil(def.max * base);
      for (e = lo; e <= hi; e++) { steps.push(e); }
    } else if (def.type === 'tick') {
      var step = Math.ceil(def.pct * base), cnt = Math.ceil((def.maxMultiplier - 1) * base / step);
      for (e = 1; e <= cnt; e++) { steps.push(base + e * step); }
    } else if (def.type === 'perKill') {
      var pct = (def.pctByAmmo && (def.pctByAmmo[ammoEnStr] != null ? def.pctByAmmo[ammoEnStr] : def.pctByAmmo.Primary)) || 0.2;
      var maxCap = base + Math.ceil(def.maxPct * base);
      for (e = 1; e < 200; e++) {
        a = base + Math.ceil(e * pct * base);
        if (a >= maxCap) { steps.push(maxCap); break; }
        steps.push(a);
      }
    } else if (def.type === 'fixed') {
      steps.push(base + Math.ceil(def.pct * base));
    } else if (def.type === 'perAlly') {
      var nAllies = def.maxAllies || 5;
      for (a = 1; a <= nAllies; a++) { steps.push(base + Math.ceil(a * def.pctPerAlly * base)); }
    } else { return null; }
    var uniq = [];
    steps.sort(function (x, y) { return x - y; }).forEach(function (v) {
      if (!uniq.length || uniq[uniq.length - 1] !== v) { uniq.push(v); }
    });
    return { steps: uniq, maxMag: uniq[uniq.length - 1] };
  }
  function getBaseMagazineRampStepCount(rampDef, baseMag) {
    var base = Math.max(0, Math.round(Number(baseMag) || 0));
    if (!rampDef || !base) { return 0; }
    var target = Math.round(base * Math.max(1, Number(rampDef.maxMultiplier) || 1));
    if (target <= base) { return 0; }
    var per = Math.max(1, Number(rampDef.perStack) || 1);
    return Math.ceil((target - base) / per);
  }
  function applyBaseMagazineRamps(baseMag, ramps) {
    var o = Math.max(0, Math.round(Number(baseMag) || 0)), n = o;
    (ramps || []).forEach(function (r) {
      if (r.step < 0) { return; }
      var per = Math.max(1, Number(r.rampDef && r.rampDef.perStack) || 1);
      var cap = Math.round(o * Math.max(1, Number(r.rampDef && r.rampDef.maxMultiplier) || 1));
      n = Math.min(cap, n + (r.step + 1) * per);
    });
    return n;
  }
  function ensurePerkFx(cb) {
    if (PERK_FX) { if (cb) { cb(); } return; }
    if (typeof fetch !== 'function') { return; }
    if (perkFxWait) { if (cb) { perkFxWait.push(cb); } return; }
    perkFxWait = cb ? [cb] : [];
    fetch(new URL('perk-fx.json', HERE).href).then(function (r) { return r.json(); }).then(function (j) {
      PERK_FX = j;
      var w = perkFxWait; perkFxWait = null;
      for (var i = 0; i < w.length; i++) { w[i](); }
    }).catch(function () {
      PERK_FX = {};
      var w = perkFxWait; perkFxWait = null;
      if (w) { for (var i = 0; i < w.length; i++) { w[i](); } }
    });
  }
  function isAmmoTriple(v) {
    return Array.isArray(v) && v.length === 3 && v[0] > v[1] && v[1] === v[2];
  }
  function basePlugFor(p) {
    if (!P || !P.p[p] || !PERK_FX) { return null; }
    if (PERK_FX[String(P.p[p][P_HASH])]) { return null; }
    var target = plugName(p);
    for (var idx = 0; idx < P.p.length; idx++) {
      if (idx !== p && P.p[idx][P_NAME] === target && PERK_FX[String(P.p[idx][P_HASH])]) {
        return idx;
      }
    }
    return null;
  }
  function resolvedPerkSpec(p) {
    if (!PERK_FX || !P || !P.p[p]) { return null; }
    var h = String(P.p[p][P_HASH]), own = PERK_FX[h] || null;
    if (own) { return { s: own.s || own }; }
    var bIdx = basePlugFor(p);
    var base = bIdx != null ? PERK_FX[String(P.p[bIdx][P_HASH])] : null;
    return base ? { s: base.s || base } : null;
  }
  function resolveAmmoSpec(s, ammo) {
    if (!s || typeof s !== 'object') { return s; }
    var idx = ammo === 'Heavy' ? 2 : ammo === 'Special' || ammo === '特殊' ? 1 : 0;
    var hasD = s.dmgByAmmo && typeof s.dmgByAmmo === 'object';
    var hasP = s.pvpDmgByAmmo && typeof s.pvpDmgByAmmo === 'object';
    if (!hasD && !hasP) { return s; }
    var out = Object.assign({}, s);
    if (hasD) { var dk = ammo === 'Heavy' ? 'Heavy' : ammo === 'Special' ? 'Special' : 'Primary'; if (s.dmgByAmmo[dk] != null) { out.dmg = s.dmgByAmmo[dk]; } }
    if (hasP) { var pk = ammo === 'Heavy' ? 'Heavy' : ammo === 'Special' ? 'Special' : 'Primary'; if (s.pvpDmgByAmmo[pk] != null) { out.pvpDmg = s.pvpDmgByAmmo[pk]; } }
    return out;
  }
  function perkSpec(p) {
    var rec = resolvedPerkSpec(p);
    return rec ? rec.s || null : null;
  }
  function hasStepArray(s, forBadge) {
    if (!s) { return false; }
    for (var k in s) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) { continue; }
      if (k === 'projectileVelocityWeaponTypes' || k === 'dmgByAmmo' || k === 'pvpDmgByAmmo') { continue; }
      if (k === 'dmg' && s.pvpDmg != null) { continue; }
      if (Array.isArray(s[k]) && (!forBadge || !isAmmoTriple(s[k]))) { return true; }
    }
    return false;
  }
  var COND_FIXED_TRAIT_TYPES = {
    '特性': 1, '强化特征': 1, '原始特性': 1, '强化原始特性': 1, '固有': 1
  };
  function isConditionalFixedPlug(p, spec) {
    if (!P || !P.p[p] || !spec) { return false; }
    var pt = P.pt[P.p[p][P_TYPE]];
    if (COND_FIXED_TRAIT_TYPES[pt]) { return true; }
    return !!(pt === '电池' && spec.dmg > 1 && !hasStepArray(spec, false));
  }
  function initialPerkStep(p, ammo, isCat, isFixed) {
    if (!P || !P.p[p]) { return 0; }
    var h = P.p[p][P_HASH];
    if (AUTO_PERKS[h]) { return 0; }
    if (Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, h)) { return CHECK_ONLY_PERKS[h]; }
    if (isCat) { return 0; }
    var s = resolveAmmoSpec(perkSpec(p), ammo);
    if (ELEMENTAL_CAPACITOR_HASHES[h]) { return -1; }
    if (!s) { return 0; }
    if (s.overflow) { return 0; }
    if (s.baseMagazineRamp || hasStepArray(s, false)) { return -1; }
    if (isFixed && isConditionalFixedPlug(p, s)) { return -1; }
    return 0;
  }
  function perkStepOf(p, ammo, isCat, isFixed) {
    if (!P || !P.p[p]) { return 0; }
    var h = String(P.p[p][P_HASH]);
    return Object.prototype.hasOwnProperty.call(S.perkStep, h) ? S.perkStep[h] : initialPerkStep(p, ammo, isCat, isFixed);
  }
  function pickStep(v, step, ammo) {
    if (v == null) { return null; }
    if (!Array.isArray(v)) { return v; }
    if (isAmmoTriple(v)) { return v[ammo === 'Heavy' ? 2 : ammo === '特殊' || ammo === 'Special' ? 1 : 0]; }
    return v[Math.max(0, Math.min(step < 0 ? 0 : step, v.length - 1))];
  }
  function perkSteps(s, p, ammo, baseMag) {
    var h = P && p != null && P.p[p] ? P.p[p][P_HASH] : 0;
    if (ELEMENTAL_CAPACITOR_HASHES[h]) { return ELEMENTAL_CAPACITOR_ELEMENTS.length; }
    var chrono = PVP_CHRONO_PERKS[h];
    if (chrono) {
      if (chrono.kind === 'precisionInstrument') { return 6; }
      if (chrono.kind === 'magnificentHowl') { return 10; }
      if (chrono.kind === 'recombination') { return chrono.enhanced ? 8 : 10; }
      if (chrono.kind === 'onslaught') { return 3; }
      return 1;
    }
    if (!s) { return 1; }
    if (s.overflow) {
      var ov = calculateOverflowSteps(s.overflow, baseMag, ammo);
      return ov ? ov.steps.length : 1;
    }
    if (s.baseMagazineRamp) {
      return getBaseMagazineRampStepCount(s.baseMagazineRamp, baseMag) || 1;
    }
    var n = 1, k, v;
    for (k in s) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) { continue; }
      if (k === 'projectileVelocityWeaponTypes' || k === 'dmgByAmmo' || k === 'pvpDmgByAmmo') { continue; }
      if (k === 'dmg' && s.pvpDmg != null) { continue; }
      v = s[k];
      if (Array.isArray(v) && !isAmmoTriple(v)) { n = Math.max(n, v.length); }
    }
    return n;
  }
  function hasPerkBadge(p, ammo, baseMag, isFixed) {
    if (!P || p == null || !P.p[p]) { return false; }
    var h = P.p[p][P_HASH];
    if (AUTO_PERKS[h] || Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, h)) { return false; }
    if (ELEMENTAL_CAPACITOR_HASHES[h]) { return true; }
    var s = resolveAmmoSpec(perkSpec(p), ammo);
    if (!s) { return false; }
    if (s.overflow || s.baseMagazineRamp) { return perkSteps(s, p, ammo, baseMag) >= 1; }
    if (hasStepArray(s, false)) { return true; }
    return !!(isFixed && isConditionalFixedPlug(p, s));
  }
  function evalPerkStep(p, delta, ammo, baseMag, isFixed) {
    var h = P.p[p][P_HASH], spec = resolveAmmoSpec(perkSpec(p), ammo);
    var total = perkSteps(spec, p, ammo, baseMag);
    var cur = perkStepOf(p, ammo, false, isFixed);
    if (delta != null) { return delta; }
    if (cur > 0) { return cur - 1; }
    if (cur === 0) {
      if (spec && spec.overflow && Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, h)) { return -1; }
      return total > 1 ? -1 : -1;
    }
    return total > 0 ? total - 1 : 0;
  }
  function getPerkDamageModifier(spec, step, usePvp, perkHash, weaponTypeEn, ammoTypeEn) {
    var ph = String(perkHash);
    if (usePvp && PVP_DISABLED[ph]) { return null; }
    if (usePvp && PVP_CHRONO_PERKS[ph]) {
      var eff = Object.assign({}, PVP_CHRONO_PERKS[ph]);
      if (eff.kind === 'precisionInstrument') {
        eff.initialStacks = Math.max(0, Math.min(6, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: 6 };
      }
      if (step < 0) { return null; }
      if (eff.kind === 'magnificentHowl') {
        eff.stacks = Math.max(1, Math.min(10, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: 10 };
      }
      if (eff.kind === 'recombination') {
        var maxS = eff.enhanced ? 8 : 10;
        eff.stacks = Math.max(1, Math.min(maxS, Math.floor(step) + 1));
        return { shotEffects: [eff], stepCount: maxS };
      }
      if (eff.kind === 'onslaught') {
        eff.stacks = Math.max(1, Math.min(3, Math.floor(step) + 1));
        eff.delayScale = [0.833, 0.714, 0.625][eff.stacks - 1];
        return { shotEffects: [eff], stepCount: 3 };
      }
      if (eff.chronological) { eff.weaponType = weaponTypeEn; }
      if (eff.kind === 'cascadePoint') {
        eff.delayScale = (weaponTypeEn === 'Submachine Gun' || weaponTypeEn === 'Machine Gun') ? 0.7 : 0.6;
      }
      if (eff.kind === 'boxBreathing') {
        eff.precisionMultiplier = (weaponTypeEn === 'Scout Rifle' || weaponTypeEn === 'Glaive') ? 1.35
          : (weaponTypeEn === 'Sniper Rifle' && ammoTypeEn === 'Heavy') ? 1.3 : 1.4;
      }
      return { shotEffects: [eff] };
    }
    if (!spec) { return null; }
    var raw = {}, k;
    for (k in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, k)) { continue; }
      if (usePvp && PVP_STRIP_DMG[ph] && /dmg/i.test(k)) { continue; }
      raw[k] = spec[k];
    }
    var out = {}, hasAny = false;
    var p = usePvp && raw.pvpDmg != null ? raw.pvpDmg : raw.dmg;
    if (p != null) { out.dmg = pickStep(p, step, ammoTypeEn); hasAny = true; }
    if (raw.precDmg != null) { out.precDmg = pickStep(raw.precDmg, step, ammoTypeEn); hasAny = true; }
    if (raw.precDmgByType != null) { out.precDmgByType = raw.precDmgByType; hasAny = true; }
    if (raw.heavyPrecDmgByType != null) { out.heavyPrecDmgByType = raw.heavyPrecDmgByType; hasAny = true; }
    if (raw.rpmMod != null) { out.rpmMod = pickStep(raw.rpmMod, step, ammoTypeEn); hasAny = true; }
    if (raw.rpmModByType != null) { out.rpmModByType = raw.rpmModByType; hasAny = true; }
    if (raw.dmgByType != null) { out.dmgByType = raw.dmgByType; hasAny = true; }
    if (raw.blastDmgByType != null) { out.blastDmgByType = raw.blastDmgByType; hasAny = true; }
    if (raw.chargeTimeMod != null) { out.chargeTimeMod = raw.chargeTimeMod; hasAny = true; }
    if (raw.reloadDurationMod != null) { out.reloadDurationMod = pickStep(raw.reloadDurationMod, step, ammoTypeEn); hasAny = true; }
    return hasAny ? out : null;
  }
  function isRpmEffect(eff) {
    return eff.kind === 'cascadePoint' || eff.kind === 'desperado' || eff.kind === 'onslaught';
  }
  function rpmEffectDuration(eff) {
    return eff.kind === 'onslaught' ? (eff.enhanced ? 5 : 4.5)
      : eff.kind === 'desperado' ? (eff.enhanced ? 7 : 6)
        : (eff.enhanced ? 2.75 : 2.5);
  }
  function evalShotPerkEffect(eff, state, ctx, weaponCtx) {
    if (eff.kind === 'recombination') {
      var active = !(state && state.consumed && (ctx.shot == null || ctx.shot !== state.firstShot)) && ctx.hit !== false;
      return {
        multiplier: active ? 1 + eff.stacks * (eff.enhanced ? 0.0625 : 0.05) : 1,
        state: { consumed: true, firstShot: state && state.consumed ? state.firstShot : ctx.shot }
      };
    }
    if (eff.kind === 'magnificentHowl') {
      var sh = ctx.shot != null ? ctx.shot : (state && state.shots) || 0;
      return {
        multiplier: sh < eff.stacks && ctx.hit !== false ? (eff.enhanced ? 1.55 : 1.5) : 1,
        state: { shots: sh + 1 }
      };
    }
    if (eff.kind === 'oneForAll') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 11 : 10) ? 1.35 : 1, state: {} }; }
    if (eff.kind === 'harmony') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 8 : 7) ? 1.2 : 1, state: {} }; }
    if (eff.kind === 'killClip') { return { multiplier: ctx.time + PVP_EPS < (eff.enhanced ? 5.5 : 5) ? 1.25 : 1, state: {} }; }
    if (isRpmEffect(eff)) { return { multiplier: 1, state: {} }; }
    if (eff.kind === 'reservoirBurst') {
      var ok = Number.isFinite(weaponCtx.magazineCapacity) && weaponCtx.magazineCapacity >= 1 &&
        Number.isFinite(ctx.remainingAmmo) && ctx.remainingAmmo >= weaponCtx.magazineCapacity;
      return { multiplier: ok ? (eff.enhanced ? 1.33 : 1.3) : 1, state: {} };
    }
    if (eff.kind === 'highImpactReserves') {
      var rem = ctx.remainingAmmo, cap = weaponCtx.magazineCapacity;
      if (!Number.isFinite(rem) || rem < 1 || !Number.isFinite(cap) || cap < 1) { return { multiplier: 1, state: {} }; }
      var thresh = cap * (eff.enhanced ? 0.55 : 0.5);
      if (rem > thresh + PVP_EPS) { return { multiplier: 1, state: {} }; }
      var frac = thresh <= 1 ? 1 : Math.min(1, Math.max(0, (thresh - rem) / (thresh - 1)));
      return { multiplier: 1.03 + 0.03 * frac, state: {} };
    }
    if (eff.kind === 'boxBreathing') {
      return { multiplier: (state && state.consumed) || ctx.hit === false ? 1 : eff.precisionMultiplier, state: { consumed: true } };
    }
    var n = Object.assign({
      hits: eff.kind === 'precisionInstrument' && eff.initialStacks ? eff.initialStacks : 0,
      lastHit: eff.kind === 'precisionInstrument' && eff.initialStacks ? 0 : null,
      lastBurst: null
    }, state || {});
    var win = eff.kind === 'targetLock' ? 0.2 : (weaponCtx.isChargeTime || weaponCtx.isBow) ? 2.1 : 1.25;
    if ((ctx.reload && !(weaponCtx.isBow && eff.kind === 'precisionInstrument')) ||
      (n.lastHit != null && ctx.time - n.lastHit > win + PVP_EPS)) {
      n.hits = 0; n.lastBurst = null;
    }
    if (ctx.hit === false) { return { multiplier: 1, state: { hits: 0, lastHit: null, lastBurst: null } }; }
    var mult;
    if (eff.kind === 'targetLock') {
      var tlCap = weaponCtx.magazineCapacity;
      if (!Number.isFinite(tlCap) || tlCap <= 0) { mult = 1; }
      else {
        var r = Math.max(0, n.hits) / tlCap;
        if (r + PVP_EPS < 0.125) { mult = 1; }
        else {
          var x = (Math.min(r, 1.1) + 0.35) / 1.482;
          mult = 1 + (0.0915 + 0.30901 * (3 * x * x - 2 * x * x * x)) * 0.625 * (eff.enhanced ? 1.2 : 1);
        }
      }
    } else {
      mult = 1 + Math.min(6, n.hits) * (eff.enhanced ? 0.3 : 0.25) / 6;
    }
    if (eff.kind !== 'precisionInstrument' || !weaponCtx.heavyBurst || n.lastBurst !== ctx.burst) { n.hits++; }
    n.lastHit = ctx.time;
    n.lastBurst = ctx.burst;
    return { multiplier: mult, state: n };
  }
  function firingInterval(w, effects, time, magShot) {
    if (w.isChargeTime || w.isBow) { return w.rpm / 1000; }
    var burst = w.burstSize || 1, intra = w.intraBurstDelay || PVP_INTRA_BURST;
    var scale = effects.filter(isRpmEffect).reduce(function (acc, eff) {
      return acc * (time + PVP_EPS < rpmEffectDuration(eff) ? eff.delayScale : 1);
    }, 1);
    if (burst > 1) {
      return magShot % burst !== 0 ? intra : Math.max(0, 60 * (w.rpmPerBurst ? 1 : burst) / w.rpm * scale - (burst - 1) * intra);
    }
    return 60 / w.rpm * scale;
  }
  function resolveReloadSec(ctx, effects, time) {
    if (Number.isFinite(ctx.afterHitReloadSeconds)) { return ctx.afterHitReloadSeconds; }
    var ons = null;
    for (var i = 0; i < effects.length; i++) { if (effects[i].kind === 'onslaught') { ons = effects[i]; break; } }
    if (ons && time + PVP_EPS >= rpmEffectDuration(ons) && Number.isFinite(ctx.expiredOnslaughtReloadSeconds)) {
      return ctx.expiredOnslaughtReloadSeconds;
    }
    return ctx.reloadSeconds;
  }
  function shotTimeAt(shotNum, rpm, w) {
    if (!rpm) { return null; }
    if (w.isBow) { return rpm / 1000 * (shotNum - 1); }
    if (w.isChargeTime) { return rpm / 1000 * shotNum; }
    var b = w.burstSize || 1;
    if (b > 1) {
      var intra = w.intraBurstDelay || PVP_INTRA_BURST;
      var burstIdx = Math.floor((shotNum - 1) / b);
      return 60 * (w.rpmPerBurst ? 1 : b) / rpm * burstIdx + (shotNum - 1) % b * intra;
    }
    return 60 / rpm * (shotNum - 1);
  }
  function withHitAssumption(res, hp) {
    var first = res && res.shotSequence && res.shotSequence[0];
    if (first && !first.crit && res.crits && res.bodies && !(first.headDmg + PVP_EPS < hp)) {
      var a = (res.shotAssumptions || []).slice();
      var msg = '当前精准率下假定首发射击为非精准；若首发射击命中精准将一击击杀。';
      if (a.indexOf(msg) === -1) { a.push(msg); }
      return Object.assign({}, res, { shotAssumptions: a });
    }
    return res;
  }
  function simAreaDenial(w, mod, hp) {
    var ad = w.areaDenial, ctx = Object.assign({}, w, (mod && mod.shotContext) || {});
    var effects = (mod && mod.shotEffects) || [];
    if (!Number.isFinite(w.rpm) || w.rpm <= 0) { return null; }
    if (effects.some(function (e) { return e.kind !== 'harmony' && e.kind !== 'oneForAll' && e.kind !== 'adagio'; })) { return null; }
    var cap = Math.max(1, Math.floor(ctx.magazineCapacity || 1));
    var load = Math.max(1, Math.floor(ctx.loadedMagazine || cap));
    var nextShot = 0, nextTick = Infinity, tickEnd = -Infinity, totalDmg = 0;
    var reloads = 0, reloadSum = 0, pendingReload = null, activations = [], pulls = 0, seq = [];
    var dmgScale = w.bodyDmg / ad.projectileDamage * ((mod && mod.blastDmg != null) ? mod.blastDmg : 1);
    function pushEvt(t, baseDmg, label, relSec) {
      var mult = effects.reduce(function (m, eff) {
        if (eff.kind === 'adagio') { return m * (t + PVP_EPS < (eff.enhanced ? 8 : 7) ? 1.3 : 1); }
        return m * evalShotPerkEffect(eff, {}, { time: t }, ctx).multiplier;
      }, 1);
      var d = baseDmg * dmgScale * mult;
      totalDmg += d;
      seq.push({ time: t, crit: false, bodyDmg: d, headDmg: d, label: label, reloadSeconds: relSec || 0, remainingAmmo: load, trigger: pulls });
      return totalDmg + PVP_EPS >= hp;
    }
    while (seq.length < 1000) {
      var actAt = activations.length ? activations[0] : Infinity;
      var earliest = Math.min(nextShot, nextTick, actAt);
      if (!Number.isFinite(earliest)) { return null; }
      if (actAt <= Math.min(nextShot, nextTick)) {
        activations.shift();
        if (nextTick > tickEnd + PVP_EPS) { nextTick = actAt; }
        tickEnd = Math.max(tickEnd, actAt + (ad.ticks - 1) * ad.tickInterval);
        continue;
      }
      if (nextShot <= nextTick) {
        var tShot = nextShot;
        pulls++;
        if (pendingReload != null) { reloads++; reloadSum += pendingReload; load = cap; }
        for (var p = 0; p < ad.projectiles; p++) {
          if (pushEvt(tShot, ad.projectileDamage, 'Projectile', p === 0 ? pendingReload || 0 : 0)) { break; }
        }
        if (totalDmg + PVP_EPS >= hp) { break; }
        activations.push(tShot + ad.activationDelay);
        pendingReload = null;
        if (--load === 0) {
          pendingReload = resolveReloadSec(ctx, effects, tShot);
          if (!Number.isFinite(pendingReload) || pendingReload < 0) { nextShot = Infinity; continue; }
        }
        var tReady = tShot + (pendingReload || 0), step = 60 / w.rpm;
        for (var a = 0; a < effects.length; a++) {
          if (effects[a].kind === 'adagio' && tReady + PVP_EPS < (effects[a].enhanced ? 8 : 7)) { step *= 1.2; break; }
        }
        nextShot = tReady + step;
      } else {
        if (nextTick > tickEnd + PVP_EPS) { nextTick = Infinity; continue; }
        if (pushEvt(nextTick, ad.tickDamage, 'Pool tick', 0)) { break; }
        nextTick += ad.tickInterval;
      }
    }
    if (totalDmg + PVP_EPS < hp) { return null; }
    var m = seq.length;
    return {
      shots: m, crits: 0, bodies: m, damage: totalDmg,
      ttk: Math.round(1000 * seq[m - 1].time) / 1000, optimal: m + 'b', critPercent: 0,
      rpm: w.rpm, bodyDmg: totalDmg / m, headDmg: totalDmg / m, reloadCount: reloads, reloadTime: reloadSum,
      shotSequence: seq, areaDenial: true, triggerPulls: pulls
    };
  }
  function simStatefulDp(w, mod, hp, acc, forced) {
    var ctx = Object.assign({}, w, (mod && mod.shotContext) || {}), effects = (mod && mod.shotEffects) || [];
    var adjAcc = w.headDmg <= w.bodyDmg && acc != null ? 0 : acc;
    var cap = Number.isFinite(ctx.magazineCapacity) && ctx.magazineCapacity >= 1 ? Math.floor(ctx.magazineCapacity) : null;
    if (!Number.isFinite(w.rpm) || w.rpm <= 0) { return null; }
    if (!cap && effects.some(function (e) { return e.kind === 'focusedFury' || e.kind === 'targetLock' || e.kind === 'highImpactReserves' || e.kind === 'reservoirBurst'; })) {
      return null;
    }
    var initLoad = Number.isFinite(ctx.loadedMagazine) && ctx.loadedMagazine >= 1 ? Math.floor(ctx.loadedMagazine) : cap;
    var unit = w.chargeBurstSize || (w.ammoPerBurst ? w.burstSize : w.pelletsPerShot || 1);
    var burst = w.burstSize || 1;
    var frontier = [{ time: 0, damage: 0, crits: 0, magazineShot: 0, load: initLoad, reloads: 0, states: effects.map(function () { return {}; }), sequence: [] }];
    var best = null, limit = forced ? forced.shots : 100;
    for (var t = 0; t < limit && frontier.length; t++) {
      var bucket = {};
      for (var f = 0; f < frontier.length; f++) {
        var u = frontier[f];
        var needRel = t % unit === 0 && !w.isBow && u.load != null && u.magazineShot >= u.load;
        var newUnit = t > 0 && t % unit === 0;
        var missedTail = newUnit && w.missedBurstTail ? w.missedBurstTail : 0;
        var relSec = needRel ? resolveReloadSec(ctx, effects, u.time + missedTail) : 0;
        if (needRel && (!Number.isFinite(relSec) || relSec < 0)) { continue; }
        var magPos = needRel ? 0 : u.magazineShot;
        var curLoad = needRel ? cap : u.load;
        var baseT = u.time + missedTail + relSec + (newUnit && !needRel && w.chargeRecovery ? w.chargeRecovery : 0);
        var delay = 0;
        if (t === 0) {
          delay = w.isChargeTime && !w.isBow ? w.rpm / 1000 : 0;
        } else if ((w.chargeBurstSize || w.ammoPerBurst) && t % unit !== 0) {
          delay = (t % unit) % (w.boltsPerGroup || 1) === 0 ? w.intraBurstDelay || PVP_INTRA_BURST : 0;
        } else if (w.pelletsPerShot && t % unit !== 0) {
          delay = 0;
        } else {
          delay = (w.isChargeTime && !w.isBow) ? w.rpm / 1000
            : (burst > 1)
              ? ((t / unit) % burst !== 0 ? (w.intraBurstDelay || PVP_INTRA_BURST)
                : Math.max(0, 60 * (w.rpmPerBurst ? 1 : burst) / w.rpm - (burst - 1) * (w.intraBurstDelay || PVP_INTRA_BURST)))
              : (w.isBow ? w.rpm / 1000 : 60 / w.rpm);
        }
        for (var a = 0; a < effects.length; a++) {
          if (w.chargeBurstSize && t % unit !== 0) { continue; }
          var eff = effects[a], est = u.states[a];
          var live = function (until, cur) { return until != null && cur + PVP_EPS < until; };
          if ((w.isChargeTime || w.isBow) && eff.kind === 'backupPlan' && live(eff.enhanced ? 2.5 : 2, baseT)) { delay *= 0.7; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'kickstart') { delay *= 0.8; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'successfulWarmup' && live(6, baseT)) { delay *= 0.625; }
          if ((w.isChargeTime || w.isBow) && eff.kind === 'controlledBurst' && live(est.until, baseT)) { delay *= 0.9; }
          if (w.isBow && eff.kind === 'archersTempo' && live(est.until, baseT)) { delay *= 0.75; }
          if (w.isBow && eff.kind === 'archersGambit' && live(est.until, baseT)) { delay *= 0.4; }
          if (eff.kind === 'adagio' && live(eff.enhanced ? 8 : 7, baseT)) { delay *= 1.2; }
        }
        var hitT = baseT + delay;
        if (best && hitT > best.time + PVP_EPS) { continue; }
        var critChoices = forced ? [t < forced.crits] : (w.headDmg <= w.bodyDmg || adjAcc === 0 ? [false] : adjAcc === 100 ? [true] : [false, true]);
        for (var ci = 0; ci < critChoices.length; ci++) {
          var isCrit = critChoices[ci];
          var nextStates = effects.map(function (_, idx) { return Object.assign({}, u.states[idx]); });
          var bDmg = w.bodyDmg, hDmg = w.headDmg;
          var blastPart = w.impactDmg == null ? 0 : Math.max(0, bDmg - w.impactDmg);
          function scaleDmg(mult, noBlast, blastOnly) {
            if (blastOnly) { bDmg += blastPart * (mult - 1); hDmg += blastPart * (mult - 1); blastPart *= mult; }
            else if (noBlast) { bDmg += (bDmg - blastPart) * (mult - 1); hDmg += (hDmg - blastPart) * (mult - 1); }
            else { bDmg *= mult; hDmg *= mult; blastPart *= mult; }
          }
          for (var ei = 0; ei < effects.length; ei++) {
            var ef = effects[ei], st = nextStates[ei], kd = ef.kind;
            var isLive = function (until, cur) { return until != null && cur + PVP_EPS < until; };
            if (kd === 'focusedFury') {
              if (needRel) { st.count = 0; }
              if (isLive(st.until, hitT)) { scaleDmg(1.25, true, false); }
              if (isCrit) { st.count = (st.count || 0) + 1; if (st.count >= Math.ceil(0.35 * cap)) { st.until = hitT + (ef.enhanced ? 12 : 11); st.count = 0; } }
            } else if (kd === 'archersTempo' || kd === 'archersGambit') {
              if (isCrit && w.isBow) {
                st.until = kd === 'archersTempo' ? hitT + (ef.enhanced ? 4 : 3)
                  : (isLive(st.until, hitT) ? Math.min(hitT + 8, st.until + 4) : hitT + (ef.enhanced ? 5 : 4));
              }
            } else if (kd === 'controlledBurst') {
              if (isLive(st.until, hitT)) { scaleDmg(1.2, false, false); }
              if (w.isFusion && w.hitBolts === w.boltsPerBurst && (!w.fusionTiming || (t + 1) % unit === 0)) {
                st.until = hitT + (ef.enhanced ? 2.5 : 2);
              }
            } else if (kd === 'backupPlan') {
              if (isLive(ef.enhanced ? 2.5 : 2, hitT)) { scaleDmg(0.8, false, false); }
            } else if (kd === 'kickstart') {
              scaleDmg(1.15, false, false);
            } else if (kd === 'adagio') {
              if (isLive(ef.enhanced ? 8 : 7, hitT)) { scaleDmg(ef.weaponType === 'Hand Cannon' ? 1.27 : 1.3, false, false); }
            } else if (kd === 'bluntExecution') {
              if (t < (w.ammoPerBurst ? unit : burst * unit) && isLive(ef.enhanced ? 11 : 10, hitT)) { scaleDmg(2, false, false); }
            } else if (kd === 'explosiveLight') {
              if (Math.floor(t / unit) < (ef.enhanced ? 7 : 6)) {
                if (ef.weaponType === 'Rocket Launcher') { scaleDmg(1.25, false, false); }
                else if (ef.weaponType === 'Grenade Launcher') { scaleDmg(1.6, false, true); }
              }
            } else if (kd !== 'successfulWarmup') {
              var ev = evalShotPerkEffect(ef, st, {
                time: hitT, reload: needRel, shot: Math.floor(t / unit),
                remainingAmmo: curLoad == null ? null : curLoad - magPos, hit: true,
                burst: w.ammoPerBurst ? magPos : Math.floor(magPos / (w.burstSize || (ctx.heavyBurst ? 2 : 1)))
              }, ctx);
              nextStates[ei] = ev.state;
              if (kd === 'precisionInstrument' || kd === 'boxBreathing') { hDmg *= ev.multiplier; }
              else { scaleDmg(ev.multiplier, kd === 'highImpactReserves' || kd === 'killClip', false); }
            }
          }
          var stepNode = {
            time: hitT, crit: isCrit, bodyDmg: bDmg, headDmg: hDmg,
            remainingAmmo: curLoad == null ? null : curLoad - magPos, reloadSeconds: relSec
          };
          var nextNode = {
            time: hitT, damage: u.damage + (isCrit ? hDmg : bDmg), crits: u.crits + (isCrit ? 1 : 0),
            magazineShot: magPos + ((t + 1) % unit === 0 ? 1 : 0), load: curLoad,
            reloads: u.reloads + (needRel ? 1 : 0), states: nextStates, sequence: u.sequence.concat([stepNode])
          };
          var accOk = adjAcc == null || nextNode.crits === Math.round((t + 1) * Math.max(0, Math.min(100, adjAcc)) / 100);
          if (nextNode.damage + PVP_EPS >= hp) {
            if (accOk && (!best || hitT < best.time - PVP_EPS || (Math.abs(hitT - best.time) <= PVP_EPS && nextNode.crits < best.crits))) {
              best = nextNode;
            }
            continue;
          }
          if (best && hitT >= best.time - PVP_EPS && !w.isShotgun) { continue; }
          nextStates.forEach(function (st) { if (st.until != null && st.until <= hitT + PVP_EPS) { delete st.until; } });
          var key = JSON.stringify([nextNode.crits, hitT, nextNode.magazineShot, nextNode.load, nextStates]);
          if (!bucket[key] || bucket[key].damage < nextNode.damage) { bucket[key] = nextNode; }
        }
      }
      frontier = Object.keys(bucket).map(function (k) { return bucket[k]; });
    }
    if (!best) { return null; }
    var uLen = best.sequence.length, bCnt = uLen - best.crits;
    if (!forced && best.crits > 0 && bCnt > 0) {
      var alt = simStatefulDp(w, mod, hp, adjAcc, { shots: uLen, crits: best.crits });
      if (alt && alt.shots === uLen && alt.crits === best.crits && Math.abs(alt.shotSequence[alt.shotSequence.length - 1].time - best.time) <= PVP_EPS) {
        return alt;
      }
    }
    var relTotal = best.sequence.reduce(function (s, x) { return s + x.reloadSeconds; }, 0);
    var resObj = {
      shots: uLen, crits: best.crits, bodies: bCnt, damage: best.damage,
      ttk: Math.round(1000 * best.time) / 1000,
      optimal: best.crits ? best.crits + 'h' + bCnt + 'b' : bCnt + 'b',
      critPercent: Math.round(100 * best.crits / uLen), rpm: w.rpm,
      bodyDmg: best.sequence.reduce(function (s, x) { return s + x.bodyDmg; }, 0) / uLen,
      headDmg: best.sequence.reduce(function (s, x) { return s + x.headDmg; }, 0) / uLen,
      reloadCount: best.reloads, reloadTime: relTotal, shotSequence: best.sequence
    };
    if (w.isBow) { resObj.hits = uLen; }
    if (w.ammoPerBurst) { resObj.bursts = Math.ceil(uLen / unit); resObj.ammoConsumed = Math.ceil(uLen / unit); }
    if (w.isShotgun) { resObj.isShotgun = true; resObj.pelletsToKill = uLen; resObj.pelletsPerShot = unit; }
    return resObj;
  }
  function simShotSeq(w, mod, hp, acc) {
    if (w.chargeBurstSize || w.ammoPerBurst || (mod && mod.shotEffects && mod.shotEffects.some(function (e) { return e.chronological; }))) {
      return simStatefulDp(w, mod, hp, acc, null);
    }
    var bDmg = w.bodyDmg, hDmg = w.headDmg, rpm = w.rpm;
    if (!Number.isFinite(rpm) || rpm <= 0) { return null; }
    var ctx = Object.assign({}, w, (mod && mod.shotContext) || {});
    var effects = (mod && mod.shotEffects) || [], hasRpmEff = effects.some(isRpmEffect);
    var cap = Number.isFinite(ctx.magazineCapacity) && ctx.magazineCapacity > 0 ? Math.floor(ctx.magazineCapacity) : null;
    if (cap == null && effects.some(function (e) { return e.kind === 'targetLock' || e.kind === 'highImpactReserves' || e.kind === 'reservoirBurst'; })) {
      return null;
    }
    var initLoad = Number.isFinite(ctx.loadedMagazine) && ctx.loadedMagazine > 0 ? Math.floor(ctx.loadedMagazine) : cap;
    var curLoad = initLoad, states = effects.map(function () { return {}; }), seq = [];
    var unit = w.pelletsPerShot || 1, sumBody = 0, magPos = 0, segT0 = 0, relCnt = 0;
    for (var g = 0; g < 100; g++) {
      var needRel = g % unit === 0 && !w.isBow && initLoad != null && magPos >= curLoad;
      var relSec = needRel ? resolveReloadSec(ctx, effects, seq[g - 1].time) : 0;
      if (needRel) {
        if (!Number.isFinite(relSec) || relSec < 0) { return null; }
        relCnt++;
        segT0 = seq[g - 1].time + relSec;
        magPos = 0;
        curLoad = cap;
        if (!w.isChargeTime) { segT0 += 60 / rpm; }
      }
      var tHit = segT0 + shotTimeAt(magPos + 1, rpm, w);
      if (hasRpmEff && g > 0) {
        var prevT = seq[g - 1].time;
        if (g % unit !== 0) { tHit = prevT; }
        else { var tBase = prevT + relSec; tHit = tBase + firingInterval(needRel ? Object.assign({}, w, { burstSize: 1 }) : w, effects, tBase, magPos); }
      }
      var x = bDmg, h = hDmg, blastPart = w.impactDmg != null ? Math.max(0, bDmg - w.impactDmg) : 0;
      var remAmmo = curLoad == null ? null : curLoad - magPos;
      for (var ei = 0; ei < effects.length; ei++) {
        var ef = effects[ei], ev = evalShotPerkEffect(ef, states[ei], {
          time: tHit, reload: needRel, remainingAmmo: remAmmo, shot: Math.floor(g / unit),
          hit: true, burst: Math.floor(magPos / (w.burstSize || (ctx.heavyBurst ? 2 : 1)))
        }, ctx);
        states[ei] = ev.state;
        if (ef.kind === 'magnificentHowl' || ef.kind === 'recombination' || ef.kind === 'targetLock' ||
          ef.kind === 'reservoirBurst' || ef.kind === 'harmony' || ef.kind === 'oneForAll') {
          x *= ev.multiplier; h *= ev.multiplier; blastPart *= ev.multiplier;
        } else if (ef.kind === 'highImpactReserves' || ef.kind === 'killClip') {
          x += (x - blastPart) * (ev.multiplier - 1); h += (h - blastPart) * (ev.multiplier - 1);
        } else {
          h *= ev.multiplier;
        }
      }
      seq.push({ time: tHit, bodyDmg: x, headDmg: h, remainingAmmo: remAmmo, reloadSeconds: relSec });
      sumBody += x;
      if ((g + 1) % unit === 0) { magPos++; }
      var deltas = seq.map(function (s, idx) { return { i: idx, delta: s.headDmg - s.bodyDmg }; })
        .sort(function (a, b) { return b.delta - a.delta; });
      var crits = acc == null ? 0 : Math.round(seq.length * Math.max(0, Math.min(100, acc)) / 100);
      var tot = sumBody + deltas.slice(0, crits).reduce(function (s, d) { return s + d.delta; }, 0);
      if (acc == null) {
        while (tot + PVP_EPS < hp && crits < seq.length) { tot += deltas[crits++].delta; }
      }
      if (tot + PVP_EPS < hp) { continue; }
      var seqTot = sumBody + seq.slice(0, crits).reduce(function (s, q) { return s + q.headDmg - q.bodyDmg; }, 0);
      var useHeadFirst = seqTot + PVP_EPS >= hp;
      var critSet = {};
      if (useHeadFirst) { for (var si = 0; si < crits; si++) { critSet[si] = 1; } }
      else { for (var di = 0; di < crits; di++) { critSet[deltas[di].i] = 1; } }
      if (useHeadFirst) { tot = seqTot; }
      var running = 0;
      for (var pi = 0; pi < seq.length - 1; pi++) {
        running += critSet[pi] ? seq[pi].headDmg : seq[pi].bodyDmg;
        if (running + PVP_EPS >= hp) { return simStatefulDp(w, mod, hp, acc, null); }
      }
      var bodies = seq.length - crits;
      var relTime = seq.reduce(function (s, q) { return s + q.reloadSeconds; }, 0);
      var out = {
        shots: seq.length, crits: crits, bodies: bodies, damage: tot,
        reloadCount: relCnt, reloadTime: relTime,
        ttk: Math.round(1000 * tHit) / 1000,
        optimal: crits === 0 ? bodies + 'b' : crits + 'h' + bodies + 'b',
        critPercent: Math.round(100 * crits / seq.length), rpm: rpm,
        bodyDmg: sumBody / seq.length,
        headDmg: seq.reduce(function (s, q) { return s + q.headDmg; }, 0) / seq.length,
        shotSequence: seq.map(function (q, idx) { return Object.assign({}, q, { crit: !!critSet[idx] }); })
      };
      if (w.isBow) { out.hits = seq.length; }
      if (w.isShotgun) { out.isShotgun = true; out.pelletsToKill = seq.length; out.pelletsPerShot = w.pelletsPerShot; }
      return out;
    }
    return null;
  }
  function simFusionBolts(w, mod, hp, acc) {
    var totalBolts = w.boltsPerBurst;
    var targetBolts = acc == null ? null : Math.round(totalBolts * Math.max(0, Math.min(100, acc)) / 100);
    if (targetBolts === 0) { return null; }
    var lo = targetBolts != null ? targetBolts : 1, hi = targetBolts != null ? targetBolts : totalBolts;
    var best = null;
    for (var o = lo; o <= hi; o++) {
      if (w.fusionTiming) {
        var ft = w.fusionTiming;
        var wMod = Object.assign({}, w, {
          headDmg: w.bodyDmg, hitBolts: o, chargeBurstSize: o, intraBurstDelay: ft.boltInterval,
          boltsPerGroup: ft.boltsPerGroup, chargeRecovery: ft.recovery,
          missedBurstTail: (Math.floor((totalBolts - 1) / ft.boltsPerGroup) - Math.floor((o - 1) / ft.boltsPerGroup)) * ft.boltInterval
        });
        var l = simStatefulDp(wMod, mod || {}, hp, 0, null);
        if (!l) { continue; }
        var bursts = Math.ceil(l.shots / o);
        if (best && (l.ttk > best.ttk || (l.ttk === best.ttk && o >= best.hitBolts))) { continue; }
        best = Object.assign({}, l, {
          bursts: bursts, hitBolts: o, optimal: o + 'b',
          critPercent: o === totalBolts ? 100 : Math.ceil((o - 0.5) * 100 / totalBolts)
        });
        continue;
      }
      var yRes = simShotSeq(Object.assign({}, w, { bodyDmg: w.bodyDmg * o, headDmg: w.bodyDmg * o, hitBolts: o }), mod || {}, hp, 0);
      if (!yRes) { continue; }
      var yBursts = yRes.shots;
      if (best && (yRes.ttk > best.ttk || (yRes.ttk === best.ttk && yBursts >= best.bursts))) { continue; }
      var sum = 0, flatSeq = [];
      for (var bi = 0; bi < yRes.shotSequence.length; bi++) {
        var bEntry = yRes.shotSequence[bi];
        for (var k = 0; k < o && sum + PVP_EPS < hp; k++) {
          var boltDmg = bEntry.bodyDmg / o;
          sum += boltDmg;
          flatSeq.push({ time: bEntry.time, bodyDmg: boltDmg, headDmg: boltDmg, remainingAmmo: bEntry.remainingAmmo, burst: bi + 1, reloadSeconds: k === 0 ? bEntry.reloadSeconds : 0, crit: false });
        }
      }
      best = Object.assign({}, yRes, {
        bursts: yBursts, shots: flatSeq.length, crits: 0, bodies: flatSeq.length,
        optimal: o + 'b', critPercent: o === totalBolts ? 100 : Math.ceil((o - 0.5) * 100 / totalBolts),
        bodyDmg: sum / flatSeq.length, headDmg: sum / flatSeq.length, damage: sum, shotSequence: flatSeq
      });
    }
    return best;
  }
  function applyScalarTtkMods(w, mod, weaponStat) {
    var b = w.bodyDmg, h = w.headDmg, rpm = w.rpm, imp = w.impactDmg;
    var ws = weaponStat == null ? 0 : weaponStat;
    if (ws > 100) {
      var wsScale = 1 + 5e-4 * Math.max(0, ws - 100);
      b *= wsScale; h *= wsScale;
      if (imp != null) { imp *= wsScale; }
    }
    if (mod && mod.dmg != null) { b *= mod.dmg; h *= mod.dmg; if (imp != null) { imp *= mod.dmg; } }
    if (mod && mod.blastDmg != null && imp != null) { var add = (b - imp) * (mod.blastDmg - 1); b += add; h += add; }
    if (mod && mod.precDmg != null) { h *= mod.precDmg; }
    if (mod && mod.rpmMod != null && !w.isChargeTime) { rpm /= mod.rpmMod; }
    if (mod && mod.chargeTimeMod != null && w.isChargeTime) { rpm *= mod.chargeTimeMod; }
    return { bodyDmg: b, headDmg: h, rpm: rpm, impactDmg: imp };
  }
  function calculateOptimalKill(w, mod, hp, weaponStat) {
    hp = hp == null ? PVP_HP : hp;
    weaponStat = weaponStat == null ? 0 : weaponStat;
    if (!w || !w.bodyDmg) { return null; }
    if (w.assumedOneHit) {
      return { shots: 1, crits: 0, bodies: 1, ttk: 0, optimal: '1b', critPercent: 0, bodyDmg: hp, headDmg: hp, damage: hp, reloadCount: 0, reloadTime: 0, shotSequence: [{ time: 0, crit: false, bodyDmg: hp, headDmg: hp }] };
    }
    if (w.hitCountOnly) {
      var hcMod = mod ? { dmg: mod.dmg, precDmg: mod.precDmg, blastDmg: mod.blastDmg } : null;
      var hcW = Object.assign({}, w, { hitCountOnly: false, rpm: undefined });
      var hcRes = calculateOptimalKill(hcW, hcMod, hp, weaponStat);
      return hcRes ? Object.assign({}, hcRes, { hitCountOnly: true, ttk: hcRes.shots === 1 ? 0 : null, shotSequence: [], reloadCount: null }) : null;
    }
    var m = applyScalarTtkMods(w, mod, weaponStat);
    var wScaled = Object.assign({}, w, m);
    if (w.areaDenial) { return simAreaDenial(wScaled, mod, hp); }
    var hasCtx = !!(mod && ((mod.shotEffects && mod.shotEffects.length) || (mod.shotContext && mod.shotContext.magazineCapacity > 0)));
    if (w.isFusion && w.boltsPerBurst && (w.fusionTiming || hasCtx)) { return simFusionBolts(wScaled, mod, hp, null); }
    if (w.isFusion && w.boltsPerBurst) {
      for (var bu = 1; bu <= 20; bu++) {
        for (var bo = 1; bo <= w.boltsPerBurst; bo++) {
          if (bu * bo * m.bodyDmg + PVP_EPS >= hp) {
            var ttk = m.rpm ? m.rpm / 1000 * bu : null, sh = bu * bo;
            var cp = bo >= w.boltsPerBurst ? 100 : Math.ceil((bo - 0.5) * 100 / w.boltsPerBurst);
            return { shots: sh, crits: 0, bodies: sh, ttk: ttk != null ? Math.round(1000 * ttk) / 1000 : null, optimal: bo + 'b', bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: cp, bursts: bu };
          }
        }
      }
      return null;
    }
    if (w.pelletsPerShot && (!w.isShotgun || hasCtx)) { return simShotSeq(wScaled, mod || {}, hp, null); }
    if (w.pelletsPerShot) {
      for (var ps = 1; ps <= 3 * w.pelletsPerShot; ps++) {
        for (var pc = 0; pc <= ps; pc++) {
          var pb = ps - pc;
          if (pc * m.headDmg + pb * m.bodyDmg + PVP_EPS >= hp) {
            var pBursts = Math.ceil(ps / w.pelletsPerShot);
            return {
              shots: ps, crits: pc, bodies: pb, ttk: Math.round(1000 * (pBursts <= 1 ? 0 : 60 / m.rpm * (pBursts - 1))) / 1000,
              optimal: pb === 0 ? pc + 'h0b' : pc === 0 ? pb + 'b' : pc + 'h' + pb + 'b',
              bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: ps > 0 ? Math.round(100 * pc / ps) : 0,
              isShotgun: !!w.isShotgun, pelletsToKill: ps, pelletsPerShot: w.pelletsPerShot
            };
          }
        }
      }
      return null;
    }
    if (w.chargeBurstSize || w.ammoPerBurst || hasCtx) { return simShotSeq(wScaled, mod || {}, hp, null); }
    for (var s = 1; s <= 100; s++) {
      for (var c = 0; c <= s; c++) {
        var b = s - c;
        if (c * m.headDmg + b * m.bodyDmg + PVP_EPS >= hp) {
          var t = shotTimeAt(s, m.rpm, w);
          var out = {
            shots: s, crits: c, bodies: b, ttk: t != null ? Math.round(1000 * t) / 1000 : null,
            optimal: b === 0 ? c + 'h0b' : c === 0 ? b + 'b' : c + 'h' + b + 'b',
            bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, critPercent: s > 0 ? Math.round(100 * c / s) : 0
          };
          if (w.isBow) { out.hits = s; }
          return out;
        }
      }
    }
    return null;
  }
  function calculateModifiedTTK(w, critAcc, mod, hp, weaponStat) {
    hp = hp == null ? PVP_HP : hp;
    weaponStat = weaponStat == null ? 0 : weaponStat;
    if (!w || !w.bodyDmg) { return null; }
    if (w.assumedOneHit) { return calculateOptimalKill(w, mod, hp, weaponStat); }
    if (w.hitCountOnly) {
      var hcMod = mod ? { dmg: mod.dmg, precDmg: mod.precDmg, blastDmg: mod.blastDmg } : null;
      var hcW = Object.assign({}, w, { hitCountOnly: false, rpm: undefined });
      var hcRes = critAcc == null ? calculateOptimalKill(hcW, hcMod, hp, weaponStat) : calculateModifiedTTK(hcW, critAcc, hcMod, hp, weaponStat);
      return hcRes ? Object.assign({}, hcRes, { hitCountOnly: true, ttk: hcRes.shots === 1 ? 0 : null, shotSequence: [], reloadCount: null }) : null;
    }
    if (critAcc == null) { return calculateOptimalKill(w, mod, hp, weaponStat); }
    var m = applyScalarTtkMods(w, mod, weaponStat);
    var wScaled = Object.assign({}, w, m);
    if (w.areaDenial) { return simAreaDenial(wScaled, mod, hp); }
    var hasCtx = !!(mod && ((mod.shotEffects && mod.shotEffects.length) || (mod.shotContext && mod.shotContext.magazineCapacity > 0)));
    if (w.isFusion && w.boltsPerBurst && (w.fusionTiming || hasCtx)) { return simFusionBolts(wScaled, mod, hp, critAcc); }
    if (w.isFusion && w.boltsPerBurst) {
      var bolts = Math.round(critAcc / 100 * w.boltsPerBurst);
      if (bolts <= 0) { return null; }
      var burstDmg = bolts * m.bodyDmg;
      for (var bu = 1; bu <= 20; bu++) {
        if (bu * burstDmg + PVP_EPS >= hp) {
          var ttk = m.rpm ? m.rpm / 1000 * bu : null, sh = bu * bolts;
          return { shots: sh, crits: 0, bodies: sh, ttk: ttk != null ? Math.round(1000 * ttk) / 1000 : null, optimal: bolts + 'b', bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, bursts: bu };
        }
      }
      return null;
    }
    if (w.pelletsPerShot && (!w.isShotgun || hasCtx)) { return simShotSeq(wScaled, mod || {}, hp, critAcc); }
    var frac = critAcc / 100;
    if (w.pelletsPerShot) {
      for (var ps = 1; ps <= 3 * w.pelletsPerShot; ps++) {
        var pc = Math.round(ps * frac), pb = ps - pc;
        if (pc * m.headDmg + pb * m.bodyDmg + PVP_EPS >= hp) {
          var pe = pc;
          while (pe < ps && pc * m.headDmg + (pe - pc) * m.bodyDmg + PVP_EPS < hp) { pe++; }
          var pB = pe - pc, pBursts = Math.ceil(pe / w.pelletsPerShot);
          return {
            shots: pe, crits: pc, bodies: pB, ttk: Math.round(1000 * (pBursts <= 1 ? 0 : 60 / m.rpm * (pBursts - 1))) / 1000,
            optimal: pB === 0 ? pc + 'h0b' : pc === 0 ? pB + 'b' : pc + 'h' + pB + 'b',
            bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm, isShotgun: !!w.isShotgun, pelletsToKill: pe, pelletsPerShot: w.pelletsPerShot
          };
        }
      }
      return null;
    }
    if (w.chargeBurstSize || w.ammoPerBurst || hasCtx) { return simShotSeq(wScaled, mod || {}, hp, critAcc); }
    for (var s = 1; s <= 100; s++) {
      var c = Math.round(s * frac), b = s - c;
      if (c * m.headDmg + b * m.bodyDmg + PVP_EPS >= hp) {
        var n = c;
        while (n < s && c * m.headDmg + (n - c) * m.bodyDmg + PVP_EPS < hp) { n++; }
        var nb = n - c, t = shotTimeAt(n, m.rpm, w);
        var out = {
          shots: n, crits: c, bodies: nb, ttk: t != null ? Math.round(1000 * t) / 1000 : null,
          optimal: nb === 0 ? c + 'h0b' : c === 0 ? nb + 'b' : c + 'h' + nb + 'b',
          bodyDmg: m.bodyDmg, headDmg: m.headDmg, rpm: m.rpm
        };
        if (w.isBow) { out.hits = n; }
        return out;
      }
    }
    return null;
  }
  function buildHitBreakdown(w, res, hp) {
    hp = hp == null ? PVP_HP : hp;
    if (res && res.hitCountOnly) { return res; }
    if (!res || (res.shotSequence && res.shotSequence.length)) { return withHitAssumption(res, hp); }
    if (!Number.isInteger(res.shots) || res.shots < 1) { return res; }
    var seq = [], boltsPerBurst = w.isFusion && res.bursts ? res.shots / res.bursts : null, sum = 0;
    for (var r = 0; r < res.shots; r++) {
      var crit = r >= res.bodies;
      var shotIdx = boltsPerBurst ? Math.floor(r / boltsPerBurst) + 1 : (w.pelletsPerShot ? Math.floor(r / w.pelletsPerShot) + 1 : r + 1);
      seq.push({ time: shotTimeAt(shotIdx, res.rpm, w), crit: crit, bodyDmg: res.bodyDmg, headDmg: res.headDmg });
      sum += crit ? res.headDmg : res.bodyDmg;
      if (sum + PVP_EPS >= hp) { break; }
    }
    return withHitAssumption(Object.assign({}, res, {
      crits: seq.filter(function (s) { return s.crit; }).length,
      bodies: seq.filter(function (s) { return !s.crit; }).length,
      shotSequence: seq
    }), hp);
  }
  function formatKillZh(opt, isFusion, hitOnly) {
    if (!opt) { return '—'; }
    var m = opt.match(/^(\d+)h(\d+)b$/);
    if (m) {
      var c = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (hitOnly) { return (c + b) + ' 击'; }
      return b === 0 ? c + ' 精准' : c + ' 精准，' + b + ' 直击';
    }
    var m2 = opt.match(/^(\d+)b$/);
    if (m2) {
      return isFusion ? m2[1] + ' 发弹丸' : hitOnly ? m2[1] + ' 击' : m2[1] + ' 直击';
    }
    return opt;
  }
  function perkLifetimeZh(lf, step) {
    if (!lf) { return ''; }
    var sec = lf.secondsByStack && lf.secondsByStack[step + 1] != null ? lf.secondsByStack[step + 1] : lf.seconds;
    if (lf.consumedPerShot) { return '每发消耗 1 层'; }
    if (lf.lingerSeconds) { return '结束后保留 ' + lf.lingerSeconds + 's'; }
    if (sec == null) { return ''; }
    var out = '持续 ' + sec + 's';
    if (lf.shots) { out += ' 或 ' + lf.shots + ' 发'; }
    if (lf.decay === 'one-at-a-time') { out += ' · 逐层衰减'; }
    if (lf.revertsToStack && step + 1 > lf.revertsToStack) { out += ' · 到期回落 x' + lf.revertsToStack; }
    return out;
  }
  function activePerkRows(i, roll, res) {
    var r = WR[i], ty = typeName(r), fr = frameOf(r)[0];
    var ammo = ammoEn(V.am[r[W_AMMO]][0]), typeEn = TYPE_EN[ty] || ty, frEn = frameKey(fr);
    var pr = poolRow(i), cols = pr[2], out = [];
    if (!res || !res.perks) { return out; }
    var entries = [];
    for (var c = 0; c < cols.length; c++) {
      var pick = roll.sel[c];
      if (pick != null && pick >= 0) {
        entries.push({ p: pick, key: String(P.p[pick][P_HASH]), isCat: false, isFixed: cellsOf(cols[c]).length === 1 });
      }
    }
    if (roll.cat) { pr[8].forEach(function (p) { entries.push({ p: p, key: String(P.p[p][P_HASH]), isCat: true, isFixed: false }); }); }
    if (roll.mod >= 0) { entries.push({ p: roll.mod, key: String(P.p[roll.mod][P_HASH]), isCat: true, isFixed: false }); }
    var magBase = res.magBaseCap;
    entries.forEach(function (ent) {
      var p = ent.p, ph = String(P.p[p][P_HASH]);
      var step = AUTO_PERKS[ph] ? 0 : perkStepOf(p, ammo, ent.isCat, ent.isFixed);
      var checkOnly = Object.prototype.hasOwnProperty.call(CHECK_ONLY_PERKS, ph) && step === CHECK_ONLY_PERKS[ph];
      if (step < 0 && ph !== '555281244' && ph !== '332733060') { return; }
      if (checkOnly && ph === '65604327') { return; }
      var rec = resolvedPerkSpec(p), rawSpec = rec ? rec.s : null;
      var mod = getPerkDamageModifier(rawSpec, step, true, ph, typeEn, ammo);
      if (!mod) { return; }
      var spec = resolveAmmoSpec(rawSpec, ammo) || {};
      var isAvg = false;
      if (spec.framePrecDmg && frEn) {
        var fp = spec.framePrecDmg[frEn] || spec.framePrecDmg[frEn.replace(/ /g, '-')];
        if (fp != null) { mod.precDmg = fp; } else { isAvg = true; }
      } else if (spec.framePrecDmg) { isAvg = true; }
      if (mod.precDmgByType && mod.precDmgByType[typeEn] != null) { mod.precDmg = mod.precDmgByType[typeEn]; }
      if (mod.heavyPrecDmgByType && mod.heavyPrecDmgByType[typeEn] != null && ammo === 'Heavy') {
        mod.precDmg = mod.heavyPrecDmgByType[typeEn];
      } else if (spec.heavyPrecDmg != null && ammo === 'Heavy') {
        mod.precDmg = spec.heavyPrecDmg;
      }
      if (mod.dmgByType && mod.dmgByType[typeEn] != null) { mod.dmg = mod.dmgByType[typeEn]; }
      if (mod.blastDmgByType && mod.blastDmgByType[typeEn] != null) { mod.blastDmg = mod.blastDmgByType[typeEn]; }
      var steps = mod.stepCount || (mod.shotEffects ? 1 : perkSteps(spec, p, ammo, magBase));
      out.push({
        p: p, hash: ph, name: plugName(p), icon: P.p[p][P_ICON],
        isEnhanced: isEnhancedPlug(p, cols),
        step: step, steps: steps, mod: mod, isAverage: isAvg, lifetime: spec.lifetime || null
      });
    });
    return out;
  }
  var PVP_ANIM_MS = 666, pvpTween = null, pvpShown = { body: null, crit: null }, pvpSel = null;
  function easePvp(e) {
    if (e <= 0) { return 0; }
    if (e >= 1) { return 1; }
    function bez(a, b, r) { var n = 1 - r; return 3 * n * n * r * a + 3 * n * r * r * b + r * r * r; }
    var lo = 0, hi = 1, n = e, i, x;
    for (i = 0; i < 14; i++) {
      x = bez(0.4, 0.2, n);
      if (Math.abs(x - e) < 1e-5) { break; }
      if (x < e) { lo = n; } else { hi = n; }
      n = (lo + hi) / 2;
    }
    return bez(0, 1, n);
  }
  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  function srcsOf(r, at) {
    var v = r[at];
    if (Array.isArray(v)) { return v.map(function (k) { return V.src[k]; }).filter(Boolean); }
    return v >= 0 && V.src[v] ? [V.src[v]] : [];
  }
  function srcOf(r, at) { return srcsOf(r, at).join(' · '); }
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
        out.push({ t: 'kw', k: m[1].toLowerCase(), v: got.v, q: got.q || undefined, neg: neg, a: a, b: i });
        continue;
      }
      var w = value();
      if (!neg && !w.q && /^(or|and|not)$/i.test(w.v)) {
        out.push({ t: w.v.toLowerCase(), a: a, b: i });
      } else if (w.v) {
        out.push({ t: 'w', v: w.v, q: w.q, neg: neg, a: a, b: i });
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
        var node = t.t === 'kw' && has(keys, t.k) ? { op: 'kw', k: t.k, v: t.v, q: t.q, tok: t }
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
  /* 查询要哪几份后到的数据：{pool, text}，NEED 是缺了就算不出（先显示骨架，到了再算），
     MORE 是有什么先搜什么、到了重搜。裸词搜的串里有词条名与英文名（pool）和描述（text），
     见 hay()；按 is: 算的裸词不搜那一串。name: 的英文名在 pool，perk: 还查说明。 */
  var NEED = 2, MORE = 1;
  function wants(scope, node, out) {
    out = out || { pool: 0, text: 0 };
    function atLeast(name, level) { out[name] = Math.max(out[name], level); }
    if (!node) { return out; }
    if (node.op === 'not') { return wants(scope, node.x, out); }
    if (node.xs) {
      for (var i = 0; i < node.xs.length; i++) { wants(scope, node.xs[i], out); }
      return out;
    }
    if (node.op === 'w') {
      if (!bareIs(scope, node.v, node.tok.q)) {
        if (scope !== 'sets') { atLeast('pool', MORE); }
        atLeast('text', MORE);
      }
    } else if (node.k === 'name') {
      if (scope !== 'sets') { atLeast('pool', MORE); }
    } else if (scope === 'wpn') {
      if (has(POOL_KEYS, node.k)) { atLeast('pool', NEED); }
      if (node.k === 'perk') { atLeast('text', MORE); }
      if (node.k === 'perktext') { atLeast('pool', NEED); atLeast('text', NEED); }
    }
    return out;
  }

  function fold(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
  /* source: 的值写不进引号与括号：它们是查询语法，而来源名里有（“飞狼再临”任务、永恒沙漠（史诗））。
     两边都去掉这几个字符再比，来源下拉写出的 source:飞狼再临任务 才认得原名。 */
  function srcFold(s) { return fold(s).replace(/[“”"()（）]/g, ''); }
  /* frame: 与 source: 的值加引号是整名相同，不加是包含。条件条的下拉写出的是带引号的：
     「熔炉竞技场」既是一个来源，也是别的来源名的一段，按包含算会比列出的数多。 */
  function named(q, hay, needle) { return q ? hay === needle : hay.indexOf(needle) !== -1; }
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

  /* is: 的值 → 判定。武器与护甲各一张，值取自数据，标志是固定的几个。表不带原型：
     查询里写出 is:constructor、is:toString 时，普通对象会取到 Object 原型上的函数，
     调用结果为真，整库都算命中。 */
  var pins = recall('wpn.pins') || [];
  function isTable(scope) {
    var t = Object.create(null);
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
    V.qt.forEach(function (entry) {
      t[entry[0]] = function (i) { return WR[i][W_SUB] === entry[2] && typeFacet(WR[i]) === entry; };
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
  /* is: 的英文写法：枪型、部位、元素、弹药等由 build-weapons.py 给（V.isen），标志的
     英文名在这里。键是 enFold() 之后的样子。 */
  var FLAG_EN = { craftable: '可锻造', enhanceable: '可强化', adept: '专家', holofoil: '全息' };
  function enTable(scope) {
    var t = Object.create(null);
    var from = scope === 'wpn' ? [V.isen.wpn, FLAG_EN] : scope === 'armor' ? [V.isen.armor] : [];
    from.concat([{ pinned: '已钉选' }]).forEach(function (src) {
      Object.keys(src).forEach(function (k) { t[k] = src[k]; });
    });
    return t;
  }
  var ISEN = { wpn: enTable('wpn'), armor: enTable('armor'), sets: enTable('sets') };
  /* 英文不计大小写、空格与连字符：is:HandCannon、is:hand-cannon、is:"Hand Cannon" 都是手炮。
     与 build-weapons.en_fold() 同一条。 */
  function enFold(s) { return String(s).toLowerCase().replace(/[\s-]+/g, ''); }
  /* is: 的值 → 表里那个键：中文照写，英文按 enFold() 比；认不出回空串。 */
  function isKey(scope, v) { return IS[scope][v] ? v : ISEN[scope][enFold(v)] || ''; }
  function isIn(scope, v, i) { var k = isKey(scope, v); return k ? IS[scope][k](i) : false; }
  /* 没加引号的裸词恰好是一个 is: 的值时，返回那个判定；加了引号照字面搜。 */
  function bareIs(scope, v, quoted) { return quoted ? null : IS[scope][isKey(scope, v)] || null; }
  /* 写到一半的 is: 值能补全成哪几个：中文按包含，英文按比较键包含。 */
  function isMatches(scope, v) {
    var f = fold(v), ef = enFold(v), got = [];
    Object.keys(IS[scope]).forEach(function (k) { if (fold(k).indexOf(f) !== -1) { got.push(k); } });
    if (ef) {
      Object.keys(ISEN[scope]).forEach(function (e) {
        if (e.indexOf(ef) !== -1 && got.indexOf(ISEN[scope][e]) === -1) { got.push(ISEN[scope][e]); }
      });
    }
    return got;
  }

  /* 裸词搜的那一串：名字、英文名、类型、框架、词条名、描述。有什么数据就先搜什么，
     词条池与说明到了之后缓存作废、重搜一遍。 */
  var hayCache = {};
  function itemName(scope, i) {
    if (scope === 'sets') return SR[i][T_NAME];
    if (scope === 'armor') return AR[i][A_NAME];
    return WR[i][W_NAME];
  }
  function pyName(scope, i, v) {
    return window.starsidePy && v && window.starsidePy.match(itemName(scope, i), fold(v));
  }
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
  /* 词条名与说明折叠后的整串，与 hay 共用一份缓存、同时作废。`perk:` 每敲一个字就对
     全部武器求值一次，不缓存时每次重新拼接、折叠，耗时 10 ms 以上。 */
  function cached(key, make) {
    return hayCache[key] != null ? hayCache[key] : (hayCache[key] = make());
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
  function foldedTexts(i) {
    return cached('pt' + i, function () {
      var out = [], cols = poolRow(i)[2];
      for (var c = 0; c < cols.length; c++) {
        var cells = cellsOf(cols[c]);
        for (var k = 0; k < cells.length; k++) { out.push(T.pd[shownPlug(cells[k])] || ''); }
      }
      return fold(out.join(' '));
    });
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
      /* 裸词写全了一个 is: 的值（虚空、手炮、主手、专家）就按 is: 算：按字面搜，「虚空」
         会把名字、词条名与描述里带这两个字的非虚空武器也搜进来。 */
      case 'w': {
        var hit = bareIs(scope, node.v, node.tok.q);
        if (hit) { return hit(i); }
        if (hay(scope, i).indexOf(fold(node.v)) !== -1) { return true; }
        return pyName(scope, i, node.v);
      }
      default: return kw(scope, node.k, node.v, i, node.q);
    }
  }
  function kw(scope, k, v, i, q) {
    var f = fold(v), r;
    if (scope === 'sets') {
      var t = SR[i];
      switch (k) {
        case 'is': return isIn('sets', v, i);
        case 'name': return fold(t[T_NAME] + ' ' + t[T_EN]).indexOf(f) !== -1 || pyName('sets', i, v);
        case 'perk': return fold(t[T_FX].map(function (x) { return x[0]; }).join(' ')).indexOf(f) !== -1;
        case 'season': return fold(t[T_SSN]).indexOf(f) !== -1;
        case 'source':
          return q ? srcFold(setSrc(t)) === srcFold(v) : srcFold(t[T_SRC] + ' ' + t[T_KIND]).indexOf(srcFold(v)) !== -1;
      }
      return false;
    }
    if (scope === 'armor') {
      r = AR[i];
      switch (k) {
        case 'is': return isIn('armor', v, i);
        case 'name': return fold(r[A_NAME] + enOf('armor', i)).indexOf(f) !== -1 || pyName('armor', i, v);
        case 'perk': return fold(r[A_PERKS]).indexOf(f) !== -1;
        case 'season': return cmp(v, r[A_SSN]);
        case 'source': return srcsOf(r, A_SRC).some(function (s) { return named(q, srcFold(s), srcFold(v)); });
      }
      return false;
    }
    r = WR[i];
    switch (k) {
      case 'is': return isIn('wpn', v, i);
      case 'name': return fold(r[W_NAME] + ' ' + enOf('wpn', i)).indexOf(f) !== -1 || pyName('wpn', i, v);
      case 'frame': return named(q, fold(frameOf(r)[0]), f);
      case 'season': return cmp(v, r[W_SSN]);
      case 'source': return srcsOf(r, W_SRC).some(function (s) { return named(q, srcFold(s), srcFold(v)); });
      case 'breaker': return r[W_BR] > 0 && fold(V.br[r[W_BR]][0]).indexOf(f) !== -1;
    }
    if (!P) { return false; }
    switch (k) {
      case 'perktext': return T ? foldedTexts(i).indexOf(f) !== -1 : false;
      case 'perk':
        if (cached('pn' + i, function () { return fold(perkNames(i).join(' ')); }).indexOf(f) !== -1) { return true; }
        return T ? foldedTexts(i).indexOf(f) !== -1 : false;
      case 'perk1': return fold(perkNames(i, R_TRAIT, 1).join(' ')).indexOf(f) !== -1;
      case 'perk2': return fold(perkNames(i, R_TRAIT, 2).join(' ')).indexOf(f) !== -1;
      case 'perkname': return cached('pa' + i, function () { return perkNames(i).map(fold); }).indexOf(f) !== -1;
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
    syntax: false, pop: null, tip: null, hoverPlug: null, hoverRow: null, slotHover: false,
    statsMode: 'pve', pvpAcc: null, pvpStat: 0, pvpMag: null, pvpMagBlank: false,
    fx: [], fxOpen: false, fxg: '', perkStep: {}, fxStep: {}
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

  function isEnhancedPlug(p, cols) {
    if (!P || !P.p[p]) { return false; }
    if (cols) {
      for (var c = 0; c < cols.length; c++) {
        var cells = cellsOf(cols[c]);
        for (var j = 0; j < cells.length; j++) { if (cells[j][1] === p) { return true; } }
      }
    }
    var nm = String(P.p[p][P_NAME] || '');
    var pt = String((P.pt && P.pt[P.p[p][P_TYPE]]) || '');
    return pt.indexOf('强化') === 0 || nm.indexOf('强化') !== -1 || nm.indexOf('专家') !== -1;
  }
  function getIntrinsicHash(i, roll, swap) {
    var pr = poolRow(i), cols = pr[2];
    for (var c = 0; c < cols.length; c++) {
      if (cols[c][1] !== R_INTRINSIC) { continue; }
      var pick = roll.sel[c];
      if (swap && swap.col === c) { pick = swap.plug; }
      if (pick != null && pick >= 0 && P && P.p[pick]) { return P.p[pick][P_HASH]; }
    }
    return frameOf(WR[i])[3] || null;
  }

  /* 一个配置的全部属性。swap 是悬停预览：{栏: 插件}，栏写 -1 表示去掉那一栏。 */
  function compute(i, roll, swap) {
    var pr = poolRow(i), group = P.g[pr[0]], base = pr[1], cols = pr[2];
    var ammo = V && V.am && WR[i][W_AMMO] != null ? ammoEn(V.am[WR[i][W_AMMO]][0]) : 'Primary';
    var tyEn = TYPE_EN[typeName(WR[i])] || typeName(WR[i]);
    var parts = [], perks = [], catMap = {}, fixedMap = {}, nonMod = [], activeHashes = [];
    for (var c = 0; c < cols.length; c++) {
      var pick = roll.sel[c];
      if (swap && swap.col === c) { pick = swap.plug; }
      if (pick == null || pick < 0) { continue; }
      (cols[c][1] === R_STAT ? parts : perks).push(pick);
      if (cellsOf(cols[c]).length === 1) { fixedMap[pick] = 1; }
      nonMod.push(pick);
      activeHashes.push(P.p[pick][P_HASH]);
    }
    if (roll.cat) {
      pr[8].forEach(function (p) {
        perks.push(p);
        nonMod.push(p);
        catMap[p] = 1;
        activeHashes.push(P.p[p][P_HASH]);
      });
    }
    if (roll.mod >= 0) {
      perks.push(roll.mod);
      activeHashes.push(P.p[roll.mod][P_HASH]);
    }
    var hasStat = {}, sIdxMap = {};
    for (var g0 = 0; g0 < group.length; g0++) {
      if (base[g0] != null) { hasStat[group[g0][0]] = group[g0]; sIdxMap[group[g0][0]] = base[g0]; }
    }
    var ctMods = [], drawPerkInv = 0, drawModInv = 0, enhPerkMag = false, enhModMag = false;
    var ctIdx = HSTAT ? HSTAT[STAT_HASH.CHARGE_TIME] : null;
    var dtIdx = HSTAT ? HSTAT[STAT_HASH.DRAW_TIME] : null;
    var magIdx = HSTAT ? HSTAT[STAT_HASH.MAGAZINE] : null;
    var cond = {};
    function plugEntries(p, isMod, isCat) {
      var ph = P.p[p][P_HASH], ov = PERK_STAT_OVERRIDES[ph];
      var byS = {}, isSt = {};
      if (ov && HSTAT) {
        ov.forEach(function (pair) {
          var si = HSTAT[pair[0]];
          if (si != null) { byS[si] = (byS[si] || 0) + pair[1]; isSt[si] = 1; }
        });
      } else {
        P.p[p][P_ST].forEach(function (x) { byS[x[0]] = (byS[x[0]] || 0) + x[1]; isSt[x[0]] = 1; });
        P.p[p][P_CD].forEach(function (x) { byS[x[0]] = (byS[x[0]] || 0) + x[1]; });
      }
      if (ELEMENTAL_CAPACITOR_HASHES[ph]) {
        var ecStep = perkStepOf(p, ammo, isCat);
        if (ecStep < 0) { return []; }
        var ecSi = HSTAT ? HSTAT[ELEMENTAL_CAPACITOR_STAT[ecStep]] : null;
        if (ecSi == null || byS[ecSi] == null) { return []; }
        return [[ecSi, byS[ecSi], true]];
      }
      var resList = [];
      for (var sStr in byS) {
        if (!Object.prototype.hasOwnProperty.call(byS, sStr)) { continue; }
        var si = +sStr, val = byS[sStr];
        if (!isSt[si] && !hasStat[si]) { continue; }
        resList.push([si, val, !!isSt[si]]);
      }
      return resList;
    }
    function sumList(list, isMod) {
      var out = {}, isEnh = isEnhancedPlug(null);
      list.forEach(function (p) {
        isEnh = isEnhancedPlug(p, cols);
        plugEntries(p, isMod, !!catMap[p]).forEach(function (entry) {
          var si = entry[0], val = entry[1];
          if (si === magIdx && val > 0 && isEnh) {
            if (isMod) { enhModMag = true; } else { enhPerkMag = true; }
          }
          if (si === ctIdx) { ctMods.push(val); return; }
          if (si === dtIdx) {
            if (isMod) { drawModInv += val; } else { drawPerkInv += val; }
            return;
          }
          out[si] = (out[si] || 0) + val;
          if (!entry[2]) { cond[si] = (cond[si] || 0) + 0; }
        });
      });
      return out;
    }
    var partSum = sumList(parts, false);
    var traitPerks = nonMod.filter(function (p) { return parts.indexOf(p) === -1; });
    var perkSum = sumList(traitPerks, false);
    if (roll.mod >= 0) {
      var modSum = sumList([roll.mod], true);
      for (var mk in modSum) { perkSum[mk] = (perkSum[mk] || 0) + modSum[mk]; }
    }
    var mw = mwParts(i, roll);
    if (ctIdx != null) {
      if (mw.mw[ctIdx]) { ctMods.push(mw.mw[ctIdx]); }
      if (mw.tier[ctIdx]) { ctMods.push(mw.tier[ctIdx]); }
    }
    if (dtIdx != null) {
      if (mw.mw[dtIdx]) { drawPerkInv += mw.mw[dtIdx]; }
      if (mw.tier[dtIdx]) { drawPerkInv += mw.tier[dtIdx]; }
    }
    var stages = [['s-part', partSum], ['s-perk', perkSum], ['s-mw', mw.mw], ['s-tier', mw.tier]];
    var perkInv = {}, flat = {}, fxInv = {};
    var rpmMod = 1, chargeTimeMod = 1, reloadDurationMod = 1, handlingDurationMod = 1;
    var rangeAllScale = 1, rangeHipScale = 1, rangeAdsStatAdd = 0, projectileVelocityScale = 1;
    var overflowPerks = [], baseMagazineRamps = [], magMultSources = [];
    fxAll().forEach(function (f) {
      if (!fxApplies(i, f)) { return; }
      var rm = fxMulOf(f, 'reloadDurationMod'), hm = fxMulOf(f, 'handlingDurationMod');
      if (rm !== 1) { reloadDurationMod *= rm; }
      if (hm !== 1) { handlingDurationMod *= hm; }
      if (!f.stats) { return; }
      Object.keys(f.stats).forEach(function (name) {
        var si = SIDX[name], v = fxStatVal(f, name);
        if (si != null && v) { fxInv[si] = (fxInv[si] || 0) + v; }
      });
    });
    if (ctIdx != null && fxInv[ctIdx]) { ctMods.push(fxInv[ctIdx]); }
    if (dtIdx != null && fxInv[dtIdx]) { drawModInv += fxInv[dtIdx]; }
    var allPlugs = parts.concat(perks);
    allPlugs.forEach(function (p) {
      var ph = P.p[p][P_HASH], rec = resolvedPerkSpec(p), rawSpec = rec ? rec.s : null;
      if (!rawSpec || !HSTAT) { return; }
      var spec = resolveAmmoSpec(rawSpec, ammo), step = AUTO_PERKS[ph] ? 0 : perkStepOf(p, ammo, !!catMap[p], !!fixedMap[p]);
      if (spec.overflow) { overflowPerks.push({ p: p, ph: ph, overflowDef: spec.overflow, name: plugName(p), icon: P.p[p][P_ICON] }); }
      if (spec.baseMagazineRamp) { baseMagazineRamps.push({ p: p, ph: ph, step: step, rampDef: spec.baseMagazineRamp }); }
      if (step < 0) { return; }
      if (spec.rpmMod != null || spec.rpmModByType != null) {
        var rSrc = spec.rpmModByType && spec.rpmModByType[tyEn] != null ? spec.rpmModByType[tyEn] : spec.rpmMod;
        var rv = pickStep(rSrc, step, ammo);
        if (rv != null) { rpmMod *= rv; }
      }
      if (spec.chargeTimeMod != null) {
        var cv = pickStep(spec.chargeTimeMod, step, ammo);
        if (cv != null) { chargeTimeMod *= cv; }
      }
      if (spec.reloadDurationMod != null) {
        var rlv = pickStep(spec.reloadDurationMod, step, ammo);
        if (rlv != null) { reloadDurationMod *= rlv; }
      }
      if (spec.rangeAllScale != null) {
        var ras = pickStep(spec.rangeAllScale, step, ammo);
        if (ras != null) { rangeAllScale *= ras; }
      }
      if (spec.rangeHipScale != null) {
        var rhs = pickStep(spec.rangeHipScale, step, ammo);
        if (rhs != null) { rangeHipScale *= rhs; }
      }
      if (spec.rangeAdsStatAdd != null) {
        var raa = pickStep(spec.rangeAdsStatAdd, step, ammo);
        if (raa != null) { rangeAdsStatAdd += raa; }
      }
      if (spec.projectileVelocityScale != null && (!spec.projectileVelocityWeaponTypes || has(spec.projectileVelocityWeaponTypes, tyEn))) {
        var pvs = pickStep(spec.projectileVelocityScale, step, ammo);
        if (pvs != null) { projectileVelocityScale *= pvs; }
      }
      if (ELEMENTAL_CAPACITOR_HASHES[ph]) { return; }
      var bIdx = basePlugFor(p);
      var baseFx = bIdx != null ? PERK_FX && PERK_FX[String(P.p[bIdx][P_HASH])] : null;
      var nativeInv = {};
      var plugSt = P.p[p][P_ST];
      if ((!plugSt || !plugSt.length) && bIdx != null) { plugSt = P.p[bIdx][P_ST]; }
      plugSt.forEach(function (x) { nativeInv[P.s[x[0]][0]] = (nativeInv[P.s[x[0]][0]] || 0) + x[1]; });
      var key;
      for (key in spec) {
        if (!Object.prototype.hasOwnProperty.call(spec, key) || PERK_FX_NON_STEP_KEYS[key] || !/^\d+$/.test(key)) { continue; }
        var statHashNum = +key, si = HSTAT[key];
        if (si == null) { continue; }
        var raw = spec[key], isFlat = !!(raw && typeof raw === 'object' && raw.f);
        if (raw && typeof raw === 'object' && raw.m !== undefined) {
          if (statHashNum === STAT_HASH.MAGAZINE) { magMultSources.push({ name: plugName(p), value: raw.m }); }
          continue;
        }
        var unwrapped = raw && typeof raw === 'object' && raw.v !== undefined ? raw.v : raw;
        if (Object.prototype.hasOwnProperty.call(nativeInv, statHashNum)) {
          if (!Array.isArray(unwrapped)) { continue; }
          var arrVal = pickStep(unwrapped, step, ammo);
          var diff = (typeof arrVal === 'number' ? arrVal : 0) - nativeInv[statHashNum];
          if (diff) { perkInv[si] = (perkInv[si] || 0) + diff; }
          continue;
        }
        var bFlat = baseFx ? ((baseFx.s || baseFx)[key]) : null;
        if (!isFlat && bFlat && typeof bFlat === 'object' && bFlat.f) {
          isFlat = true;
        }
        var picked = Array.isArray(unwrapped) ? pickStep(unwrapped, step, ammo) : unwrapped;
        if (typeof picked !== 'number') { continue; }
        if (spec.h === true && ammo === 'Special' && picked) { picked = Math.ceil(picked / 2); }
        if (statHashNum === STAT_HASH.CHARGE_TIME || statHashNum === STAT_HASH.DRAW_TIME) { isFlat = true; }
        if (isFlat) { flat[si] = (flat[si] || 0) + picked; }
        else { perkInv[si] = (perkInv[si] || 0) + picked; }
      }
    });
    var pveExtra = {};
    Object.keys(perkInv).forEach(function (k) { pveExtra[k] = (pveExtra[k] || 0) + perkInv[k]; });
    Object.keys(fxInv).forEach(function (k) { pveExtra[k] = (pveExtra[k] || 0) + fxInv[k]; });
    if (Object.keys(pveExtra).length) { stages.push(['s-perk', pveExtra]); }
    var rows = [], byStat = {};
    for (var g = 0; g < group.length; g++) {
      if (base[g] == null) { continue; }
      var row = group[g], s = row[0], statHash = P.s[s][0], acc = base[g];
      var v0 = shown(acc, row), prev = v0, neg = 0, segs = [];
      if (statHash === STAT_HASH.CHARGE_TIME) {
        if (ctMods.length) {
          var ctMax = Math.max.apply(null, ctMods);
          if (ctMax !== 0) {
            var ctDiff = ctMax > 0 ? -Math.floor(3.35 * ctMax) : Math.floor(3.35 * -ctMax);
            prev = Math.max(0, v0 + ctDiff);
            if (prev > v0) { segs.push(['s-part', prev - v0]); } else if (prev < v0) { neg = v0 - prev; }
          }
        }
        var ctItem = { s: s, row: row, name: P.s[s][1], numeric: row[3], value: prev, base: v0, cond: 0, neg: neg, segs: segs, acc: acc, unclamped: prev, unclampedInCol: prev, withCond: prev };
        rows.push(ctItem); byStat[s] = ctItem; continue;
      }
      if (statHash === STAT_HASH.DRAW_TIME) {
        var dtInv = drawPerkInv + drawModInv;
        if (dtInv !== 0) {
          var dtVal = v0;
          if (drawPerkInv !== 0) {
            var pa = 3.35 * Math.abs(drawPerkInv);
            dtVal += drawPerkInv > 0 ? -Math.ceil(pa) : Math.floor(pa);
          }
          if (drawModInv !== 0) {
            var ma = 3.35 * Math.abs(drawModInv);
            dtVal += drawModInv > 0 ? -Math.floor(ma) : Math.floor(ma);
          }
          prev = Math.max(0, dtVal);
          if (prev > v0) { segs.push(['s-part', prev - v0]); } else if (prev < v0) { neg = v0 - prev; }
        }
        var dtItem = { s: s, row: row, name: P.s[s][1], numeric: row[3], value: prev, base: v0, cond: 0, neg: neg, segs: segs, acc: acc, unclamped: prev, unclampedInCol: prev, withCond: prev };
        rows.push(dtItem); byStat[s] = dtItem; continue;
      }
      var accInCol = acc, inColVal = v0;
      for (var k = 0; k < stages.length; k++) {
        if (!stages[k][1][s]) { continue; }
        acc += stages[k][1][s];
        if (k < 4) { accInCol += stages[k][1][s]; }
        var v = shown(acc, row);
        if (k < 4) { inColVal = shown(accInCol, row); }
        if (v > prev) { segs.push([stages[k][0], v - prev]); } else if (v < prev) { neg += prev - v; }
        prev = v;
      }
      var inColMag = inColVal;
      if (statHash === STAT_HASH.MAGAZINE) {
        var enhCount = (enhPerkMag ? 1 : 0) + (enhModMag ? 1 : 0);
        if (enhCount > 0 && inColMag - v0 < enhCount && row[2] && row[2].length) {
          var weights = [];
          for (var wi = 1; wi < row[2].length; wi += 2) {
            if (weights.indexOf(row[2][wi]) === -1) { weights.push(row[2][wi]); }
          }
          weights.sort(function (a, b) { return a - b; });
          var wIdx = weights.indexOf(v0);
          if (wIdx !== -1 && wIdx + enhCount < weights.length) {
            var bumped = weights[wIdx + enhCount];
            if (bumped > prev) { segs.push(['s-perk', bumped - prev]); }
            prev = bumped;
            inColMag = bumped;
          }
        }
      }
      var unclamped = SCALED_STAT_HASHES[statHash] ? prev : acc;
      var unclampedInCol = SCALED_STAT_HASHES[statHash] ? inColVal : accInCol;
      var item = {
        s: s, row: row, name: P.s[s][1], numeric: row[3], value: prev, base: v0, inCol: inColMag,
        cond: 0, neg: neg, segs: segs, acc: acc, unclamped: unclamped, unclampedInCol: unclampedInCol, withCond: prev
      };
      rows.push(item);
      byStat[s] = item;
    }
    var magRow = magIdx != null ? byStat[magIdx] : null;
    var magBaseCap = null;
    if (magRow) {
      var mCap = applyBaseMagazineRamps(magRow.inCol, baseMagazineRamps) + (perkInv[magIdx] || 0) + (flat[magIdx] || 0);
      magMultSources.forEach(function (src) { mCap += Math.round(mCap * (Number(src.value || 1) - 1)); });
      if (mCap > 0) { magBaseCap = mCap; }
    }
    var flatChargeDraw = (ctIdx != null ? (flat[ctIdx] || 0) : 0) + (dtIdx != null ? (flat[dtIdx] || 0) : 0);
    return {
      rows: rows, byStat: byStat, parts: parts, perks: perks, allPlugs: allPlugs, mw: mw, fixedMap: fixedMap,
      intrinsicHash: getIntrinsicHash(i, roll, swap), activeHashes: activeHashes,
      perkInv: perkInv, flat: flat, fxInv: fxInv, flatChargeDraw: flatChargeDraw,
      rpmMod: rpmMod, chargeTimeMod: chargeTimeMod,
      reloadDurationMod: reloadDurationMod, handlingDurationMod: handlingDurationMod,
      rangeAllScale: rangeAllScale, rangeHipScale: rangeHipScale,
      rangeAdsStatAdd: rangeAdsStatAdd, projectileVelocityScale: projectileVelocityScale,
      overflowPerks: overflowPerks, baseMagazineRamps: baseMagazineRamps,
      magMultSources: magMultSources, magBaseCap: magBaseCap
    };
  }

  /* ── 外壳：顶栏里的范围开关、查询框、计数与视图 ─────────────────── */
  var input = bar.querySelector('.wpn-input');
  var acBox = bar.querySelector('.wpn-suggest');
  var countBox = bar.querySelector('.wpn-count');
  var syntaxBox = bar.querySelector('.wpn-syntax');
  /* 词条池没到时卡片墙拿页壳里那块骨架占位，与首屏同一份。 */
  var SKELETON = root.querySelector('.wpn-grid.skel').outerHTML;
  /* 快速检索、条件条、卡片墙。条件条常驻、高度固定：左边是已选条件，没有条件时是提示，右边是
     细分。条件与细分只换内容，不出现也不消失，卡片墙因此不会被顶下去。 */
  root.innerHTML = '<div class="wpn-presets"></div>' +
    '<div class="wpn-conds" data-n="0"><div class="cs-left"><p class="cs-hint"></p><div class="cs-pills"></div></div>' +
    '<div class="cs-right"></div></div><div class="wpn-body"></div>';
  var presetBox = root.querySelector('.wpn-presets');
  var condsBox = root.querySelector('.wpn-conds');
  var hintBox = root.querySelector('.cs-hint');
  var pillBox = root.querySelector('.cs-pills');
  var rightBox = root.querySelector('.cs-right');
  var loadErrors = document.createElement('div');
  root.insertBefore(loadErrors, root.firstChild);
  var body = root.querySelector('.wpn-body');
  var tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  /* 粘性的查询条、它下面的结果栏与详情右栏要知道上面有多高：--nav-h 是页眉（查询条吸在它
     下面），--stick 是页眉加查询条（结果栏与右栏吸在两者下面）。查询条随窗口宽度变；
     ResizeObserver 在布局之后、绘制之前回调，量高度不额外触发一次重排。
     吸住的那一刻查询条垫上底：靠查询条前面一枚 1px 的哨兵，它滚到页眉之下就是吸住了。 */
  var head = document.querySelector('.site-head');
  var sentinel = document.querySelector('.wpn-sentinel');
  var stuckObs = null;
  function measureTop() {
    var navH = head.getBoundingClientRect().height, style = document.documentElement.style;
    style.setProperty('--nav-h', navH + 'px');
    style.setProperty('--stick', (navH + bar.getBoundingClientRect().height) + 'px');
    if (stuckObs) { stuckObs.disconnect(); }
    stuckObs = new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      bar.classList.toggle('is-stuck', !e.isIntersecting && e.boundingClientRect.top < navH);
    }, { rootMargin: '-' + navH + 'px 0px 0px 0px' });
    stuckObs.observe(sentinel);
  }
  new ResizeObserver(measureTop).observe(head);
  new ResizeObserver(measureTop).observe(bar);

  /* ── 渲染：顶栏 ────────────────────────────────────────────────────── */
  /* pending：查询在等哪一份数据才算得出（'pool'、'text'），不等是空串。 */
  var tokens = [], tree = null, results = [], pending = '';
  function pillIcon(t) {
    if (t.t === 'w' && bareIs(S.scope, t.v, t.q)) { t = { t: 'kw', k: 'is', v: t.v }; }
    if (t.t !== 'kw') { return ''; }
    if (t.k === 'is') {
      var v = isKey(S.scope, t.v);
      for (var e in V.el) { if (V.el[e][0] === v) { return imgTag(V.el[e][2], '', '', true); } }
      for (var b in V.br) { if (V.br[b][0] === v) { return imgTag(V.br[b][1], '', '', true); } }
      for (var q = 0; q < V.qt.length; q++) { if (V.qt[q][0] === v) { return glyph(V.qt[q][1]); } }
      for (var s in V.ty) { if (V.ty[s][0] === v) { return glyph(V.ty[s][1]); } }
      for (var a in V.am) { if (V.am[a][0] === v) { return '<span class="ammo-' + a + '">' + glyph(V.am[a][1]) + '</span>'; } }
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
    scopeBox.querySelectorAll('[data-act="scope"]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.scope ? 'true' : 'false');
    });
    bar.querySelectorAll('[data-act="view"]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.view ? 'true' : 'false');
    });
    bar.querySelector('[data-act="syntax"]').setAttribute('aria-expanded', S.syntax ? 'true' : 'false');
    syntaxBox.hidden = !S.syntax;
    if (!typing && input.value !== S.q && document.activeElement !== input) { input.value = S.q; }
    var total = REPS[S.scope].length;
    var unit = S.scope === 'armor' ? '件' : S.scope === 'sets' ? '套' : '把';
    countBox.innerHTML = !S.q ? '<b>' + total + '</b> ' + unit
      : '<b>' + (pending ? (loads[pending] && loads[pending].failed ? '—' : '…') : results.length) + '</b> / ' + total + ' ' + unit;
    if (S.syntax) { renderSyntax(); }
  }

  /* ── 渲染：快速检索与条件条 ────────────────────────────────────────── */
  /* 一个 token 当作哪一条关键字：按 is: 算的裸词也写成 is:值，快速检索的开关认得它。 */
  function tokKey(t) {
    if (t.t === 'kw') { return t.k === 'is' && isKey(S.scope, t.v) ? 'is:' + isKey(S.scope, t.v) : t.k + ':' + (t.q ? '"' + t.v + '"' : t.v); }
    return t.t === 'w' && bareIs(S.scope, t.v, t.q) ? 'is:' + isKey(S.scope, t.v) : '';
  }
  function hasToken(tok) {
    return tokens.some(function (t) { return !t.neg && tokKey(t) === tok; });
  }

  /* 互斥组：点第二个值是换掉第一个；枪型细分与总类也在同组，避免留下多余的总类条件。
     威能既是槽位又是弹药，两组各列一次。组名以 k: 开头的是同一个关键字（一件装备只有一个框架、
     一个来源）。 */
  function isToks(names) { return names.map(function (n) { return 'is:' + n; }); }
  function namesOf(table, at) {
    return Object.keys(table).map(function (k) { return at == null ? table[k] : table[k][at]; });
  }
  var GROUPS = {
    wpn: { slot: isToks(V.slot), ty: isToks(namesOf(V.ty, 0).concat(V.qt.map(function (entry) { return entry[0]; }))), el: isToks(namesOf(V.el, 0)),
           br: isToks(namesOf(V.br, 0)), ammo: isToks(namesOf(V.am, 0)), rar: isToks(namesOf(V.rar)) },
    armor: { cls: isToks(V.cls), part: isToks(V.part) },
    sets: {}
  };
  function inGroup(g, t) {
    if (t.neg) { return false; }
    if (g.indexOf('k:') === 0) { return t.t === 'kw' && t.k === g.slice(2); }
    var list = GROUPS[S.scope][g];
    return list ? has(list, tokKey(t)) : false;
  }
  /* 从查询里去掉这几个 token，连带去掉因此悬空的 or／and 与空括号。位置取自 tokenize()。 */
  function cutQuery(q, toks) {
    toks.slice().sort(function (x, y) { return y.a - x.a; }).forEach(function (t) {
      q = q.slice(0, t.a) + q.slice(t.b);
    });
    var prev;
    do {
      prev = q;
      q = q.replace(/\(\s*(?:(?:or|and)\s*)*\)/gi, ' ').replace(/\s+/g, ' ').trim()
        .replace(/^(?:(?:or|and)(?:\s+|$))+/i, '').replace(/(?:^|\s+)(?:or|and)$/i, '')
        .replace(/\b(or|and)\s+(?:or|and)(?=\s|$)/gi, '$1')
        .replace(/\(\s+(?:or|and)\s+/gi, '(').replace(/\s+(?:or|and)\s+\)/gi, ')').trim();
    } while (q !== prev);
    return q;
  }
  /* 点一个条件之后的查询串：已在查询里就去掉；不在就先去掉同组的别的值与对它自己的排除，再加上。 */
  function toggled(q, tok, group) {
    var all = tokenize(q), toks = all.filter(function (t) { return !t.neg; });
    var same = toks.filter(function (t) { return tokKey(t) === tok; });
    if (same.length) { return cutQuery(q, same); }
    var out = all.filter(function (t) { return t.neg ? tokKey(t) === tok : group && inGroup(group, t); });
    var rest = cutQuery(q, out);
    return (rest ? rest + ' ' : '') + tok;
  }
  /* 去掉某一组的条件之后命中哪些：同组兄弟值的数按「换成它」算，与点下去之后的结果一致。 */
  function resultsWithout(g) {
    var drop = tokens.filter(function (t) { return inGroup(g, t); });
    if (!drop.length) { return results; }
    return run(S.scope, parse(tokenize(cutQuery(S.q, drop)), keysOf(S.scope)));
  }
  function countIn(list, tok) {
    var f = IS[S.scope][tok.slice(3)], n = 0;
    for (var k = 0; k < list.length; k++) { if (f(list[k])) { n++; } }
    return n;
  }

  /* 快速检索：一行图标，一组一段，槽位（文字）｜枪型｜元素｜勇士克制；护甲范围只有职业，套装范围没有。
     换范围时建一次，之后只改 aria-pressed，选中的菱形才连得上动画。 */
  var quickFor = null;
  function quickGroups() {
    if (S.scope === 'armor') {
      var by = {};
      REPS.armor.forEach(function (i) { var c = V.cls[AR[i][A_CLS]]; by[c] = (by[c] || 0) + 1; });
      return [['cls', ['术士', '泰坦', '猎人'].map(function (c) { return ['is:' + c, esc(c), c + ' · ' + by[c]]; })]];
    }
    if (S.scope === 'sets') { return []; }
    return [
      ['slot', V.slot.map(function (s) { return ['is:' + s, esc(s), s]; })],
      ['ty', V.qt.map(function (entry) {
        return ['is:' + entry[0], glyph(entry[1], entry[0]), entry[0], entry[3]];
      })],
      ['el', Object.keys(V.el).map(function (k) {
        return ['is:' + V.el[k][0], imgTag(V.el[k][2], '', V.el[k][0], true), V.el[k][0]];
      })],
      ['br', Object.keys(V.br).map(function (k) {
        return ['is:' + V.br[k][0], imgTag(V.br[k][1], '', V.br[k][0], true), V.br[k][0]];
      })]
    ];
  }
  function renderPresets() {
    if (quickFor !== S.scope) {
      quickFor = S.scope;
      var groups = quickGroups();
      presetBox.innerHTML = !groups.length ? '' : '<div class="wpn-quick">' + groups.map(function (g) {
        var ammo = 0;
        return '<div class="qg" data-g="' + g[0] + '">' + g[1].map(function (b) {
          var sep = g[0] === 'ty' && ammo && ammo !== b[3] ?
            '<span class="sep ammo-sep" data-ammo="' + b[3] + '" role="separator" aria-label="' + esc(V.am[b[3]][0] + '武器') + '"></span>' : '';
          ammo = b[3];
          return sep + '<button type="button" data-act="preset" data-g="' + g[0] + '" data-v="' + esc(b[0]) +
            '" aria-pressed="false" title="' + esc(b[2]) + '">' + b[1] + '</button>';
        }).join('') + '</div>';
      }).join('<span class="sep"></span>') + '</div>';
    }
    presetBox.querySelectorAll('.qg').forEach(function (g) {
      var any = false;
      g.querySelectorAll('button').forEach(function (b) {
        var on = hasToken(b.getAttribute('data-v'));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        any = any || on;
      });
      if (any) { g.setAttribute('data-on', ''); } else { g.removeAttribute('data-on'); }
    });
  }

  /* 条件条左边：已选条件的药丸。点 × 去掉那一段，查询框里的原文同步删。 */
  var HINT = {
    wpn: '未设筛选条件 · 点击上方图标，或输入如 <code>is:手炮</code>',
    armor: '未设筛选条件 · 点击上方职业，或输入如 <code>is:泰坦</code>',
    sets: '未设筛选条件 · 输入来源或名称，如 <code>source:发射基地</code>'
  };
  function pillKey(t) { return (t.neg ? '-' : '') + (t.t === 'kw' ? t.k + ':' + t.v : 'w:' + t.v); }
  function pillHtml(t, fresh) {
    var wait = pending && t.t === 'kw' && (t.k === 'perktext' || (!P && has(POOL_KEYS, t.k)));
    return '<span class="wpn-pill' + (wait ? ' is-wait' : '') + (t.neg ? ' is-not' : '') + (fresh ? ' is-new' : '') + '">' +
      pillIcon(t) + (t.t === 'kw' ? '<span class="k">' + esc(t.k) + ':</span>' + esc(t.v) : esc(t.v)) +
      '<button type="button" data-act="unpill" data-a="' + t.a + '" data-b="' + t.b + '" aria-label="去掉这一条">×</button></span>';
  }

  /* 条件条右边：细分。弹药、可锻造与可升阶只画图标或名字，数量放进悬停提示；框架与来源各折进
     一个下拉。同组的值按「去掉这一组之后」算，选中的留在原位。 */
  var FLAG_FACETS = ['is:可锻造', 'is:可升阶'];
  function ammoOf(tok) {
    for (var a in V.am) { if ('is:' + V.am[a][0] === tok) { return a; } }
    return '';
  }
  function facetBtn(g, tok, n, on) {
    var name = tok.slice(3), a = g === 'ammo' ? ammoOf(tok) : '', solo = a || has(FLAG_FACETS, tok);
    var face = a ? '<span class="am ammo-' + a + '">' + glyph(V.am[a][1], name) + '</span>' : '<span>' + esc(name) + '</span>';
    return '<button type="button" class="fc' + (solo ? ' fc-solo' : '') + (a ? ' fc-ammo' : '') + '" data-act="facet"' +
      (g ? ' data-g="' + g + '"' : '') + ' data-v="' + esc(tok) + '" aria-pressed="' + on + '"' +
      (solo ? ' title="' + esc(name + ' · ' + n) + '"' : '') + (!on && n === 0 ? ' disabled' : '') + '>' +
      face + (solo ? '' : '<span class="n">' + n + '</span>') + '</button>';
  }
  /* source: 与 frame: 的值写不进空格、引号与括号（它们是查询语法），来源名里有（“飞狼再临”任务、
     3v3 多人竞技、永恒沙漠（史诗））。token 里去掉这几个字符，比对时 srcFold() 也去掉，标签仍写原名。
     来源名有的写成整句，句末的句号只在标签里去掉。 */
  var TOKEN_DROP = /[\s“”"()（）]/g;
  function valuesOf(key, i) {
    if (key === 'frame') { return [frameOf(WR[i])[0]]; }
    if (S.scope === 'sets') { return [setSrc(SR[i])]; }
    return S.scope === 'armor' ? srcsOf(AR[i], A_SRC) : srcsOf(WR[i], W_SRC);
  }
  function valueList(key) {
    var g = 'k:' + key, n = {}, label = {}, base = resultsWithout(g), inBase = {};
    base.forEach(function (i) {
      inBase[i] = true;
      var vs = valuesOf(key, i);
      vs.forEach(function (v) {
        if (!v) { return; }
        var tok = key + ':"' + v.replace(TOKEN_DROP, '') + '"';
        n[tok] = (n[tok] || 0) + 1;
        label[tok] = v.replace(/[。；;]+$/, '');
      });
    });
    tokens.forEach(function (t) {
      var tok = tokKey(t);
      if (inGroup(g, t) && !(tok in n)) {
        n[tok] = run(S.scope, parse([t], keysOf(S.scope))).filter(function (i) { return inBase[i]; }).length;
        label[tok] = t.v;
      }
    });
    var min = S.scope === 'sets' ? 0 : REFINE_MIN;
    return Object.keys(n).filter(function (tok) { return n[tok] > min || hasToken(tok); })
      .sort(function (a, b) { return n[b] - n[a]; })
      .map(function (tok) { return { tok: tok, label: label[tok], n: n[tok], on: hasToken(tok) }; });
  }
  function dropHtml(label, key, cols) {
    var list = valueList(key), on = list.some(function (x) { return x.on; });
    return '<span class="grp"><button type="button" class="drop" data-act="drop" data-k="' + key +
      '" aria-expanded="false"' + (on ? ' data-on' : '') + (list.length ? '' : ' disabled') + '>' + label +
      '<span class="n">' + list.length + '</span></button><div class="pop" hidden style="--cols:' + cols + '">' +
      list.map(function (x) {
        return '<button type="button" data-act="refine" data-g="k:' + key + '" data-v="' + esc(x.tok) + '" aria-pressed="' + x.on +
          '" title="' + esc(x.label) + '（shift 点击排除）"><span>' + esc(x.label) + '</span><span class="n">' + x.n + '</span></button>';
      }).join('') + '</div></span>';
  }
  function closePops() {
    root.querySelectorAll('.wpn-refine .drop[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.hidden = true;
    });
  }
  function renderFacets() {
    var html = '';
    if (S.scope === 'wpn') {
      var am = resultsWithout('ammo');
      html = '<div class="cs-facets">' + GROUPS.wpn.ammo.map(function (tok) {
        return facetBtn('ammo', tok, countIn(am, tok), hasToken(tok));
      }).join('') + '<span class="div"></span>' + FLAG_FACETS.map(function (tok) {
        var on = hasToken(tok);
        return facetBtn('', tok, on ? results.length : countIn(results, tok), on);
      }).join('') + '</div>';
    } else if (S.scope === 'armor') {
      var pt = resultsWithout('part');
      html = '<div class="cs-facets">' + GROUPS.armor.part.map(function (tok) {
        return facetBtn('part', tok, countIn(pt, tok), hasToken(tok));
      }).join('') + '</div>';
    }
    return html + '<span class="wpn-refine cs-drops">' + (S.scope === 'wpn' ? dropHtml('框架', 'frame', 3) : '') +
      dropHtml('来源', 'source', 2) + '</span>';
  }
  /* 条件条：数据没到时左边挂一行载入提示，右边留着上一次的内容；详情里右边不画。 */
  var prevPills = null;
  function renderConds() {
    var pills = tokens.filter(function (t) { return t.t === 'kw' || t.t === 'w'; }), seen = {};
    /* 只有点按钮加进来的药丸才淡入：敲字时每个字都会换一枚新药丸，第一次渲染也不动。 */
    var animate = prevPills != null && document.activeElement !== input;
    pillBox.innerHTML = pills.map(function (t) {
      var k = pillKey(t);
      seen[k] = true;
      return pillHtml(t, animate && !prevPills[k]);
    }).join('') +
      (pending && !(loads[pending] && loads[pending].failed) ? '<span class="loading">' + (pending === 'pool' ? '词条池载入中…' : '说明载入中…') + '</span>' : '') +
      (pills.length > 1 ? '<button type="button" class="cs-clear" data-act="clear">清除</button>' : '');
    prevPills = seen;
    condsBox.setAttribute('data-n', pills.length);
    hintBox.innerHTML = HINT[S.scope];
    if (S.sel != null) { rightBox.innerHTML = ''; return; }
    if (pending) { return; }
    var open = root.querySelector('.wpn-refine .drop[aria-expanded="true"]');
    var was = open ? open.getAttribute('data-k') : '';
    rightBox.innerHTML = renderFacets();
    var again = was && rightBox.querySelector('.drop[data-k="' + was + '"]');
    if (again && !again.disabled) {
      again.setAttribute('aria-expanded', 'true');
      again.nextElementSibling.hidden = false;
    }
  }

  /* ── 语法卡片：三列。组合｜关键字｜is: 的值，点一条填进查询框 ──────────── */
  var SYNTAX_OPS = [
    ['且', '空格', '两条都要满足', 'is:手炮 is:烈日'],
    ['或', 'or', '满足其中一条', 'is:手炮 or is:霰弹枪'],
    ['非', '-', '排除；也可写 not', 'is:手炮 -is:专家'],
    ['组', '( )', '括号里的先算', '(is:手炮 or is:霰弹枪) is:烈日']
  ];
  var SYNTAX_KEYS = [
    ['萤火虫', '不写关键字：搜名字、框架、词条与描述'],
    ['is:烈日', '类型、元素、槽位、弹药、标志，值见右'],
    ['name:合唱', '名字或英文名'],
    ['frame:适配框架', '框架；加引号是整名相同'],
    ['source:玻璃拱顶', '来源；加引号是整名相同'],
    ['season:>=26', '赛季，比较写 = > < >= <='],
    ['breaker:反屏障', '勇士克制'],
    ['perk:萤火虫', '任一栏词条，名字或说明'],
    ['perk1:高爆载荷', '第一特性栏；perk2: 是第二栏'],
    ['perkname:"全明星"', '词条名完全相同'],
    ['perktext:填装', '词条说明'],
    ['origintrait:失时弹匣', '起源特性'],
    ['stat:射程:>=60', '属性数值，比较写法同赛季']
  ];
  /* is: 的值按范围列：[标签, 互斥组, [[值, 图标]…]]。标志不成组。 */
  function syntaxVals() {
    function plain(names) { return names.map(function (n) { return [n]; }); }
    if (S.scope === 'armor') {
      return [['职业', 'cls', plain(V.cls)], ['部位', 'part', plain(V.part)], ['标志', '', plain(['已钉选'])]];
    }
    if (S.scope === 'sets') { return [['标志', '', plain(['已钉选'])]]; }
    return [
      ['槽位', 'slot', plain(V.slot)],
      ['类型', 'ty', plain(namesOf(V.ty, 0))],
      ['元素', 'el', Object.keys(V.el).map(function (k) { return [V.el[k][0], V.el[k][2]]; })],
      ['弹药', 'ammo', plain(namesOf(V.am, 0))],
      ['稀有度', 'rar', plain(namesOf(V.rar))],
      ['勇士', 'br', Object.keys(V.br).map(function (k) { return [V.br[k][0], V.br[k][1]]; })],
      ['标志', '', plain(['可锻造', '可强化', '可升阶', '专家', '全息', '复刻', '已钉选'])]
    ];
  }
  function syntaxChip(text) {
    return '<button type="button" class="sx-q" data-act="setq" data-v="' + esc(text) + '">' +
      esc(text).replace(/([a-z0-9]+:)/gi, '<b>$1</b>') + '</button>';
  }
  var syntaxFor = null;
  function renderSyntax() {
    if (syntaxFor !== S.scope) {
      syntaxFor = S.scope;
      var keys = keysOf(S.scope);
      syntaxBox.innerHTML =
        '<header class="sx-head"><h2>查询语法</h2><span>点一条，填进查询框 · Esc 关闭</span></header><div class="sx-body">' +
        '<section class="sx-c1"><h3>组合</h3>' + SYNTAX_OPS.map(function (o) {
          return '<div class="sx-op"><span class="sx-ch">' + o[0] + '</span><div>' + syntaxChip(o[3]) +
            '<p><code>' + esc(o[1]) + '</code> ' + esc(o[2]) + '</p></div></div>';
        }).join('') + '</section>' +
        '<section class="sx-c2"><h3>关键字</h3>' + SYNTAX_KEYS.filter(function (k) {
          var m = /^([a-z0-9]+):/.exec(k[0]);
          return !m || has(keys, m[1]);
        }).map(function (k) {
          return '<div class="sx-row">' + syntaxChip(k[0]) + '<span>' + esc(k[1]) + '</span></div>';
        }).join('') + '</section>' +
        '<section class="sx-c3"><h3><code>is:</code> 的值</h3>' + syntaxVals().map(function (g) {
          return '<div class="sx-vg"><span class="sx-vl">' + g[0] + '</span><div>' + g[2].map(function (t) {
            return '<button type="button" class="sx-t" data-act="sxval"' + (g[1] ? ' data-g="' + g[1] + '"' : '') +
              ' data-v="' + esc('is:' + t[0]) + '" aria-pressed="false">' + (t[1] ? imgTag(t[1], '', '') : '') + esc(t[0]) + '</button>';
          }).join('') + '</div></div>';
        }).join('') +
        (S.scope === 'sets'
          ? '<p class="sx-note">套装的 <code>is:</code> 值是来源或类型名，如 <code>is:发射基地</code>；来源也可以用条件条右边的下拉选。</p>'
          : '<p class="sx-note">值也认英文，如 <code>is:handcannon</code>，不计大小写、空格与连字符。写全的值不带 <code>is:</code> 也按它算，加引号照字面搜。</p>') +
        '</section></div>';
    }
    syntaxBox.querySelectorAll('.sx-t').forEach(function (b) {
      b.setAttribute('aria-pressed', hasToken(b.getAttribute('data-v')) ? 'true' : 'false');
    });
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
      return '<li><a class="wpn-card is-exo" href="' + link('armor', i) + '" data-act="open" data-i="' + i + '"' +
        (a[A_ROLE] ? ' title="' + esc('小棒猪 ' + a[A_ROLE]) + '"' : '') + '>' + armorGun(a, '', eager) +
        '<div><p class="nm exo">' + esc(a[A_NAME]) + '</p><div class="wpn-meta"><span class="cls">' + V.cls[a[A_CLS]] +
        '</span><span class="cls">' + V.part[a[A_PART]] + '</span><span class="ssn">S' + a[A_SSN] + '</span></div>' +
        '<div class="wpn-frame">' + esc(first) + '</div>' +
        (a[A_ROLE] ? '<div class="wpn-grades"><span class="au-l">' + esc(a[A_ROLE]) + '</span></div>' : '') +
        '</div></a></li>';
    }
    var r = WR[i], exo = isExotic(r);
    return '<li><a class="wpn-card' + (exo ? ' is-exo' : '') + '" data-el="' + r[W_EL] + '" href="' + link('wpn', i) + '" data-act="open" data-i="' + i + '"' +
      (r[W_GRADE] ? ' title="' + esc(gradeTitle(r)) + '"' : '') + '>' + gun(r, '', eager) +
      '<div><p class="nm' + (exo ? ' exo' : '') + '">' + esc(r[W_NAME]) + '</p>' + meta(r) +
      '<div class="wpn-frame">' + esc(frameOf(r)[0]) + '</div>' + gradesHtml(r) + '</div></a></li>';
  }
  function meta(r) {
    return '<div class="wpn-meta w">' + imgTag(V.el[r[W_EL]][2], 'el', elName(r), true) +
      '<span class="ammo-' + r[W_AMMO] + '">' + glyph(V.am[r[W_AMMO]][1], V.am[r[W_AMMO]][0]) + '</span>' +
      typeGlyph(r) +
      (r[W_BR] ? imgTag(V.br[r[W_BR]][1], 'br', V.br[r[W_BR]][0], true) : '') +
      '<span class="ssn">S' + r[W_SSN] + '</span></div>';
  }
  /* 卡片上的评价只有一行，前面一枚菱形认作者（样式表按 au-a、au-l 上色），不写「AEGIS」「小棒猪」
     的字；档位分三档提亮：Aegis 的 S、A 与小棒猪的 T0、T0.5 最亮，B、C 与 T1、T1.5 次之，
     其余同色。完整的评价放在卡片的悬停提示里。 */
  function gradeStep(tok) {
    var m = /^T(\d(?:\.\d)?)$/.exec(tok);
    if (m) { return +m[1] <= 0.5 ? 1 : +m[1] <= 1.5 ? 2 : 3; }
    return tok === 'S' || tok === 'A' ? 1 : tok === 'B' || tok === 'C' ? 2 : 3;
  }
  function gradeMarks(text, letter) {
    return esc(text).replace(letter ? /^[SABCDEF]$/ : /T\d(?:\.\d)?/g, function (m) {
      return '<b class="tg tg-' + gradeStep(m) + '">' + m + '</b>';
    });
  }
  function gradeTitle(r) {
    var g = r[W_GRADE];
    return g ? [g[0] ? 'Aegis ' + g[0] : '', g[1] ? '小棒猪 ' + g[1] : ''].filter(Boolean).join('　') : '';
  }
  function gradesHtml(r) {
    var g = r[W_GRADE];
    if (!g) { return ''; }
    return '<div class="wpn-grades">' + (g[0] ? '<span class="au-a">' + gradeMarks(g[0], true) + '</span>' : '') +
      (g[1] ? '<span class="au-l">' + gradeMarks(g[1], false) + '</span>' : '') + '</div>';
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
      typeGlyph(r) + esc(typeName(r)) + '</span>' +
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
      /* 头一批只铺首屏那一屏（N_EAGER 张），画完后观察者报哨兵进入，再补到 BATCH 的
         整数倍：120 张一起铺时，HTML 解析、排版与绘制都在开屏同一个长任务里。 */
      var end = Math.min(list.length, at ? (Math.floor(at / BATCH) + 1) * BATCH : N_EAGER), html = '';
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
    var noun = S.scope === 'armor' ? '异域护甲' : S.scope === 'sets' ? '护甲套装' : '武器';
    if (top.length < 2) { return '<div class="empty"><h3>无匹配的' + noun + '</h3><p>请尝试其他关键词，或点击右上角「语法」查看查询规则。</p></div>'; }
    var btns = top.map(function (node, k) {
      var rest = top.filter(function (_, j) { return j !== k; });
      var n = run(S.scope, rest.length === 1 ? rest[0] : { op: 'and', xs: rest }).length;
      var t = node.tok || (node.x && node.x.tok);
      var raw = t ? S.q.slice(t.a, t.b) : '';
      return t ? '<button type="button" class="toggle" data-act="unpill" data-a="' + t.a + '" data-b="' + t.b + '">去掉 <code>' +
        esc(raw) + '</code><span class="n">' + n + '</span></button>' : '';
    }).join('');
    return '<div class="empty"><h3>无同时满足全部条件的' + noun + '</h3><p>移除单个条件后的匹配数量：</p><div class="wpn-row">' + btns + '</div></div>';
  }
  var wallList = null;
  function renderBrowse() {
    detailKey = '';
    body.innerHTML = '';
    if (pending) {
      body.innerHTML = loads[pending] && loads[pending].failed ? '<p class="empty">查询所需数据载入失败，无法显示结果。</p>' : SKELETON;
      return;
    }
    if (!results.length) { body.innerHTML = emptyState(); return; }
    if (S.view === 'list') {
      var names = {}, rows = rowsOf(S.scope);
      results.forEach(function (i) { var n = rows[i][1]; names[n] = (names[n] || 0) + 1; });
      batches(results, function (i) {
        return listRow(i, S.scope === 'wpn' && names[WR[i][W_NAME]] > 1);
      }, body, 'wpn-list');
      return;
    }
    batches(results, card, body, 'wpn-grid');
    /* 结果换了一批，卡片墙淡入一下（只动不透明度，不动版面）；结果没变的重画不动。 */
    var wall = body.querySelector('.wpn-grid');
    if (wall && wallList && !sameList(wallList, results)) { wall.classList.add('swap'); }
    wallList = results;
  }

  /* ── 渲染：结果栏 ──────────────────────────────────────────────────── */
  function railRow(scope, i, current) {
    var rows = rowsOf(scope), r = rows[i];
    if (scope === 'sets') {
      var ssub = esc([setSrc(r), r[T_SSN]].filter(Boolean).join(' · '));
      return '<li><a href="' + link('sets', i) + '" data-act="open" data-i="' + i + '" data-scope="sets"' +
        (i === current && S.scope === 'sets' ? ' aria-current="page"' : '') + '>' +
        '<span class="gun sm">' + pathImg(r[T_FX][0] ? r[T_FX][0][2] : '') + '</span>' +
        '<span><span class="nm">' + esc(r[T_NAME]) + '</span><span class="sub">' + ssub + '</span></span></a></li>';
    }
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
      var pre = p.slice(0, 1), scope = pre === 'a' ? 'armor' : pre === 't' ? 'sets' : 'wpn';
      var i = BY_HASH[scope][p.slice(2)];
      return i == null ? '' : railRow(scope, i, S.sel);
    }).join('');
    return '<nav class="wpn-rail" aria-label="结果"><span class="grip" data-act="grip"></span>' +
      (pinned ? '<div class="rail-head"><b>钉选</b>' + pins.length + '<span class="op-sep"></span>' +
        '<button type="button" class="op" data-act="unpinall">清空</button></div><ol class="rail-list">' + pinned + '</ol>' : '') +
      '<div class="rail-head"><b>结果</b>' + results.length + '<span class="op-sep"></span>' +
      '<button type="button" class="op" data-act="close">返回</button></div><ol class="rail-list rail-hits"></ol></nav>';
  }
  /* 结果栏整个重画：点一行、钉选、前进后退都会走到这里。结果没变就留住栏里的滚动
     位置，先把上次已经画出来的行数画够，否则 scrollTop 落在还没画的地方会被截回去。 */
  var railList = null;
  function sameList(a, b) {
    if (!a || a.length !== b.length) { return false; }
    for (var k = 0; k < a.length; k++) { if (a[k] !== b[k]) { return false; } }
    return true;
  }
  function renderSplit() {
    if (observer) { observer.disconnect(); observer = null; }
    var old = body.querySelector('.wpn-rail'), keepTop = 0, keepRows = 0;
    if (old && sameList(railList, results)) {
      keepTop = old.scrollTop;
      keepRows = old.querySelectorAll('.rail-hits > li').length;
    }
    railList = results;
    body.innerHTML = '<div class="wpn-split' + (S.railOff ? ' is-off' : '') + '" style="--rail:' + S.rail + 'px">' +
      renderRail() + '<div class="wpn-detail"></div></div>';
    var hits = body.querySelector('.rail-hits');
    if (hits) {
      var at = 0, list = results;
      var more = function (want) {
        var end = Math.min(list.length, at + Math.max(BATCH, want || 0)), html = '';
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
      more(keepRows);
      if (keepTop) { hits.parentNode.scrollTop = keepTop; }
    }
    renderDetail();
  }

  /* ── 渲染：详情 ────────────────────────────────────────────────────── */
  /* 选中的词条按栏序连成一条虚线，光点沿线走。一个 svg 铺满词条矩阵，坐标取各栏选中那一枚
     图标的中心；线画在图标下面。矩阵宽度变了（窗口、拖结果栏）就重画。 */
  var linkObs = null;
  var STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function perkLinks() {
    if (linkObs) { linkObs.disconnect(); linkObs = null; }
    var m = body.querySelector('.matrix');
    if (!m) { return; }
    function draw() {
      var old = m.querySelector('.links');
      if (old) { old.remove(); }
      var r = m.getBoundingClientRect(), pts = [];
      m.querySelectorAll('.col').forEach(function (col) {
        var btn = col.querySelector('.plug[aria-pressed="true"]');
        var ico = btn && btn.querySelector('.ico');
        if (!ico) { return; }
        var q = ico.getBoundingClientRect();
        var bits = btn.classList.contains('by-al') ? 3 : btn.classList.contains('by-a') ? 1 : btn.classList.contains('by-l') ? 2 : 0;
        pts.push([q.left - r.left + q.width / 2, q.top - r.top + q.height / 2, bits]);
      });
      if (pts.length < 2) { return; }
      var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var hi = [], dotBits = 0;
      for (var k = 0; k < pts.length - 1; k++) {
        var shared = pts[k][2] & pts[k + 1][2];
        if (!shared) { continue; }
        dotBits |= shared;
        var stroke = shared === 3 ? 'url(#link-al)' : shared === 1 ? 'var(--au-aegis)' : 'var(--au-lgpig)';
        hi.push('<line x1="' + pts[k][0].toFixed(1) + '" y1="' + pts[k][1].toFixed(1) + '" x2="' +
          pts[k + 1][0].toFixed(1) + '" y2="' + pts[k + 1][1].toFixed(1) + '" style="stroke:' + stroke + ';stroke-opacity:.82" stroke-width="1.5"/>');
      }
      var defs = dotBits === 3 ? '<defs><linearGradient id="link-al" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' +
        Math.max(1, r.width).toFixed(1) + '" y2="0"><stop offset="0%" stop-color="var(--au-aegis)"/><stop offset="100%" stop-color="var(--au-lgpig)"/></linearGradient></defs>' : '';
      var dotFill = dotBits === 3 ? 'url(#link-al)' : dotBits === 1 ? 'var(--au-aegis)' : dotBits === 2 ? 'var(--au-lgpig)' : 'var(--bone-hi)';
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'links');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = defs + '<path d="' + d + '" fill="none" style="stroke:var(--bone);stroke-opacity:.38" stroke-dasharray="3 4"/>' +
        hi.join('') +
        (STILL ? '' : '<circle r="' + (dotBits ? '2.4' : '2') + '" style="fill:' + dotFill + '"><animateMotion dur="' + (pts.length * 1.1).toFixed(1) +
          's" repeatCount="indefinite" path="' + d + '"/></circle>');
      m.prepend(svg);
    }
    draw();
    linkObs = new ResizeObserver(draw);
    linkObs.observe(m);
  }
  var detailKey = '';
  function restoreDetailFocus(box, f) {
    if (!f) { return; }
    var sel = '[data-act="' + f.act + '"]' +
      (f.col != null ? '[data-col="' + f.col + '"]' : '') +
      (f.plug != null ? '[data-plug="' + f.plug + '"]' : '') +
      (f.v != null ? '[data-v="' + f.v + '"]' : '');
    var next = box.querySelector(sel);
    if (next && typeof next.focus === 'function') { next.focus({ preventScroll: true }); }
  }
  function renderDetail() {
    var box = body.querySelector('.wpn-detail');
    if (!box) { return; }
    if (hoverRaf) { cancelAnimationFrame(hoverRaf); hoverRaf = 0; }
    if (linkObs) { linkObs.disconnect(); linkObs = null; }
    var ae = document.activeElement, f = null;
    if (ae && box.contains(ae) && ae.closest) {
      var ctrl = ae.closest('[data-act]');
      if (ctrl) {
        f = { act: ctrl.getAttribute('data-act'), col: ctrl.getAttribute('data-col'),
              plug: ctrl.getAttribute('data-plug'), v: ctrl.getAttribute('data-v') };
      }
    }
    var i = S.sel, nextKey = S.scope + ':' + i;
    var swap = detailKey !== '' && detailKey !== nextKey;
    if (S.scope === 'sets') {
      if (!T) { box.innerHTML = loads.text && loads.text.failed ? '<p class="empty">说明载入失败。</p>' : '<p class="loading">说明载入中…</p>'; need('text', renderDetail); return; }
      detailKey = nextKey;
      box.innerHTML = setDetail(i, swap);
      restoreDetailFocus(box, f);
      return;
    }
    if (S.scope === 'armor') {
      if (!T) { box.innerHTML = loads.text && loads.text.failed ? '<p class="empty">说明载入失败。</p>' : '<p class="loading">说明载入中…</p>'; need('text', renderDetail); return; }
      detailKey = nextKey;
      box.innerHTML = armorDetail(i, swap);
      restoreDetailFocus(box, f);
      return;
    }
    if (!P) { box.innerHTML = loads.pool && loads.pool.failed ? '<p class="empty">词条池载入失败。</p>' : '<p class="loading">词条池载入中…</p>'; need('pool', renderDetail); return; }
    if (!T) { need('text', renderDetail); }
    detailKey = nextKey;
    box.innerHTML = weaponDetail(i, swap);
    perkLinks();
    if (S.statsMode === 'pvp') { kickPvpAnim(); }
    restoreDetailFocus(box, f);
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
  var HALO = { 1: ['by-a', 'Aegis 推荐'], 2: ['by-l', '小棒猪推荐'], 3: ['by-al', '双方共同推荐'] };
  function plugButton(c, cell, marks, pressed, fixed, ammo, res) {
    var p = shownPlug(cell), bits = marks[cell[0]] || 0;
    var cls = 'plug' + (cell[1] >= 0 ? ' is-enh' : '') + (bits ? ' ' + HALO[bits][0] : '') +
      (S.hoverPlug && S.hoverPlug.col === c && S.hoverPlug.plug === p ? ' is-hover' : '') + (fixed ? ' fixed' : '');
    var btn = '<button type="button" class="' + cls + '" aria-pressed="' + (pressed ? 'true' : 'false') + '"' +
      (bits ? ' title="' + HALO[bits][1] + '"' : '') + ' data-act="perk" data-col="' + c + '" data-plug="' + p + '">' +
      '<span class="ico">' + imgTag(P.p[p][P_ICON], '', '', true) + '</span><span class="nm">' + esc(plugName(p)) + '</span></button>';
    if (!pressed || !hasPerkBadge(p, ammo, res && res.magBaseCap, fixed)) { return btn; }
    var ph = P.p[p][P_HASH], isEC = !!ELEMENTAL_CAPACITOR_HASHES[ph];
    var spec = resolveAmmoSpec(perkSpec(p), ammo), step = perkStepOf(p, ammo, false, fixed);
    var total = perkSteps(spec, p, ammo, res && res.magBaseCap);
    var ecKeys = ['3', '2', '4', '7', '6'];
    var inner = isEC
      ? (step < 0 ? '−' : imgTag(V.el[ecKeys[step] || '3'][2], 'element-icon', ELEMENTAL_CAPACITOR_ZH[step], true))
      : (step < 0 ? '−' : (total > 1
          ? '<span class="stack-current">×' + (step + 1) + '</span><span class="stack-max">/' + total + '</span>'
          : '<span class="stack-current">✓</span>'));
    var tipTitle = isEC ? (step < 0 ? '点击选择分支元素' : '元素电容：' + ELEMENTAL_CAPACITOR_ZH[step]) : (total > 1 ? '点击切换层数' : '点击切换生效状态');
    return '<div class="plug-wrap">' + btn + '<button type="button" class="perk-stack-badge' + (step < 0 ? ' deactivated' : '') +
      (isEC && step >= 0 ? ' element-badge' : '') + '" data-act="perkcolstep" data-v="' + p + '" data-n="' + total + '"' +
      (fixed ? ' data-fixed="1"' : '') + ' title="' + esc(tipTitle) + '">' + inner + '</button></div>';
  }
  function haloLegend() {
    return '<span class="aside halo-key"><i class="by-a"></i>Aegis 推荐<i class="by-l"></i>小棒猪推荐' +
      '<i class="by-al"></i>双方共同推荐</span>';
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
  function weaponDetail(i, anim) {
    if (!PERK_FX) { ensurePerkFx(function () { if (S.sel === i) { renderDetail(); } }); }
    var r = WR[i], pr = poolRow(i), roll = rollOf(i), rep = r[W_REP];
    var cols = pr[2], marks = marksOf(i), ammo = ammoEn(V.am[r[W_AMMO]][0]);
    var swap = S.hoverPlug ? { col: S.hoverPlug.col, plug: S.hoverPlug.plug } : null;
    var res = compute(i, roll), ghost = swap ? compute(i, roll, swap) : null;
    var matrix = cols.map(function (col, c) {
      var cells = cellsOf(col), fixed = cells.length === 1;
      return '<div class="col"><h4>' + esc(P.lb[col[0]]) + '</h4>' + cells.map(function (cell) {
        return plugButton(c, cell, marks, roll.sel[c] === shownPlug(cell), fixed, ammo, res);
      }).join('') + '</div>';
    }).join('');
    var choice = cols.some(function (col) { return cellsOf(col).length > 1; });
    var dirty = !sameRoll(roll, defaultRoll(i));
    var parts = [];
    parts.push('<header class="one-head">' + gun(r, 'lg', 2) + '<div><h2' + (isExotic(r) ? ' class="exo"' : '') + '>' +
      esc(r[W_NAME]) + '</h2><p class="en">' + esc(enOf('wpn', i)) + '</p><p class="lore">' +
      (T && T.fw[i] >= 0 ? esc(T.FL[T.fw[i]]) : '') + '</p></div><div class="one-acts">' +
      '<button type="button" class="toggle" data-act="pin" aria-pressed="' + (isPinned('wpn', i) ? 'true' : 'false') + '">' +
      (isPinned('wpn', i) ? '已钉选' : '钉选') + '</button></div></header>');
    parts.push('<div class="one-main">');
    if (isExotic(r) && T && T.xs[rep]) { parts.push(exoticBlock(T.xs[rep])); }
    parts.push('<section><h3 class="sub-label">词条' + (choice ? haloLegend() : '') +
      (dirty ? '<button type="button" class="op" data-act="resetroll">重置配置</button>' : '') +
      '</h3><div class="matrix">' + matrix + '</div></section>');
    var say = T && T.au[rep] ? T.au[rep] : null;
    if (say) { parts.push('<section><h3 class="sub-label">作者评语</h3><div class="says">' + saysHtml(say) + '</div></section>'); }
    parts.push(artifactSection(i));
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
      statsBlock(i, res, ghost) +
      frameStatsHtml(i) + versionsHtml('wpn', i) + '</aside>');
    return '<article class="wpn-one' + (anim ? ' swap' : '') + '" data-el="' + r[W_EL] + '">' + parts.join('') + '</article>';
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
        var m = /^(.+?)([（(][^）)]*[）)])$/.exec(t[1]);
        return '<b>' + (t[0] ? '<span class="dim">' + esc(t[0]) + '</span>' : '') + esc(m ? m[1] : t[1]) +
          (m ? '<span class="aft">' + esc(m[2]) + '</span>' : '') + '</b>';
      }).join('');
      return '<div class="say by-' + b[0].toLowerCase() + '"><div class="who">' + AUTHOR[b[0]] + tier +
        '</div><div>' + roll + b[2].map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div></div>';
    }).join('');
  }
  function pinKey(scope, i) {
    return (scope === 'armor' ? 'a:' : scope === 'sets' ? 't:' : 'w:') + rowsOf(scope)[i][0];
  }
  function isPinned(scope, i) { return has(pins, pinKey(scope, i)); }
  function factsHtml(i) {
    var r = WR[i], fr = frameOf(r), out = [];
    function chip(q, icon, text) {
      out.push('<button type="button" class="toggle" data-act="addq" data-v="' + esc(q) + '">' + icon + esc(text) + '</button>');
    }
    chip('is:' + elName(r), imgTag(V.el[r[W_EL]][2], '', '', true), elName(r));
    if (r[W_BR]) { chip('is:' + V.br[r[W_BR]][0], imgTag(V.br[r[W_BR]][1], '', '', true), V.br[r[W_BR]][0]); }
    chip('is:' + typeName(r), typeGlyph(r), typeName(r));
    chip('is:' + V.am[r[W_AMMO]][0], '<span class="ammo-' + r[W_AMMO] + '">' + glyph(V.am[r[W_AMMO]][1]) + '</span>', V.am[r[W_AMMO]][0]);
    /* 固有随机的那把没有单一框架，这一枚 chip 会把其中一枚说成固定的 */
    if (!intrinsicCol(i)) { chip('frame:' + fr[0], imgTag(fr[1], '', '', true), fr[0]); }
    chip('is:' + rarity(r), '', rarity(r));
    chip('season:' + r[W_SSN], '', 'S' + r[W_SSN]);
    srcsOf(r, W_SRC).forEach(function (s) { chip('source:' + s, '', s); });
    if (r[W_FLAG] & F_CRAFT) { chip('is:可锻造', '', '可锻造'); }
    if (r[W_FLAG] & F_TIER) { chip('is:可升阶', '', '可升阶'); }
    return out.join('');
  }
  /* 武器框架页那一行：评级、两个分数与各项数值，外加这一类枪的弹药块拾取量。
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
        row('瞄准衰减射程', fr[FR_RANGE]) + row('精准倍率', fr[FR_CRIT]) + row('真实射速', fr[FR_RPM]) +
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
      '<p class="fr-note fr-top-note">以下为该框架的基准测试数据，不代表单把武器的词条表现</p>' + out + '</section>';
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

  /* 这把枪用得上的神器模组。专属的按神器分行：同一枚挂在两件神器上就两行都列，
     读者要知道带哪一件神器。通用的（任何武器都触发得了，「武器击杀」那一类）每把枪
     都一样，放在末一行。 */
  function artifactSection(i) {
    var k = poolRow(i)[10], own = k >= 0 ? P.AM[k] : [], all = [];
    var byArt = P.an.map(function () { return []; });
    own.forEach(function (j) { P.am[j][AM_IN].forEach(function (x) { byArt[x[0]].push(j); }); });
    P.am.forEach(function (m, j) { if (m[AM_ALL]) { all.push(j); } });
    var html = '';
    byArt.forEach(function (list, a) {
      if (list.length) {
        html += '<dt>' + esc(P.an[a][0]) + '</dt><dd>' + list.map(function (j) { return amodChip(j, a); }).join('') + '</dd>';
      }
    });
    if (all.length) {
      html += '<dt>通用</dt><dd>' + all.map(function (j) { return amodChip(j, P.am[j][AM_IN][0][0]); }).join('') + '</dd>';
    }
    return '<section><h3 class="sub-label">可用神器模组<b class="n">' + (own.length + all.length) + '</b></h3><dl class="amods">' + html + '</dl></section>';
  }
  /* 点开是神器模组页上那件神器的一节。 */
  function amodChip(j, a) {
    var m = P.am[j];
    return '<a class="amod" href="../artifact-mods/index.html#' + P.an[a][1] + '" data-act="artmod" data-v="' + j + '">' +
      imgTag(m[AM_ICON], '', '', true) + esc(m[AM_NAME]) + '</a>';
  }
  function amodTip(j) {
    var m = P.am[j], d = T ? T.amd[j] : -1;
    var where = m[AM_IN].map(function (x) { return P.an[x[0]][0] + ' ' + TIER_ZH[x[1]]; }).join(' · ');
    return '<header>' + imgTag(m[AM_ICON], '', '', true) + '<div><h5>' + esc(m[AM_NAME]) + '</h5><span class="ty">' +
      esc(where) + (m[AM_ALL] ? ' · 通用' : '') + '</span></div></header>' + (d >= 0 ? '<p class="lab">站内实测</p>' + T.H[d] : '');
  }

  function mwLabel(i, roll) {
    if (!roll.mw) { return '未装'; }
    return poolRow(i)[4] ? roll.mw : roll.mw + ' Lv' + roll.lv;
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

  function rangeFalloffSvg(m) {
    if (!m || !m.ads) { return ''; }
    var maxM = Math.max(45, m.ads * 1.45);
    var hx = Math.max(4, Math.min(26, (m.hip / maxM) * 36)).toFixed(1);
    var ax = m.ads > m.hip + 0.05 ? Math.max(+hx + 2.5, Math.min(31, (m.ads / maxM) * 36)).toFixed(1) : hx;
    return '<svg class="falloff-svg" viewBox="0 0 36 11" aria-hidden="true">' +
      '<path d="M0,2.5 L' + hx + ',2.5 L' + Math.min(35, +hx + 9).toFixed(1) + ',9.5 L36,9.5" fill="none" stroke="var(--bone-faint)" stroke-width="1" stroke-dasharray="1.5 1.5"/>' +
      '<path d="M0,2.5 L' + ax + ',2.5 L35,9.5" fill="none" stroke="var(--bone-hi)" stroke-width="1.2"/>' +
      '<circle cx="' + ax + '" cy="2.5" r="1.5" fill="var(--accent)"/></svg>';
  }
  function effStatVal(res, x) {
    if (!x) { return 0; }
    var base = x.unclampedInCol != null ? x.unclampedInCol : x.value;
    return Math.max(0, Math.min(100, base + (res.perkInv[x.s] || 0) + (res.fxInv[x.s] || 0) + (res.flat[x.s] || 0)));
  }
  function statConv(i, res, x) {
    if (!SIDX) { return null; }
    var r = WR[i], ty = typeName(r), fr = frameOf(r)[0], v = effStatVal(res, x);
    if (x.name === '射程') {
      var z = res.byStat[SIDX['变焦']], ttkData = getTtkData(i, res.activeHashes);
      var m = rangeMeters(ty, fr, v, {
        zoomStat: z ? z.value : null,
        intrinsicHash: res.intrinsicHash,
        bodyDmg: ttkData ? ttkData.bodyDmg : null,
        modifiers: { rangeAllScale: res.rangeAllScale, rangeHipScale: res.rangeHipScale, rangeAdsStatAdd: res.rangeAdsStatAdd }
      });
      return m ? {
        text: fmtM(m.hip) + ' / ' + fmtM(m.ads),
        svg: rangeFalloffSvg(m),
        title: '腰射衰减 ' + fmtM(m.hip) + ' · 开镜衰减 ' + fmtM(m.ads)
      } : null;
    }
    if (x.name === '填装速度') {
      var s = reloadSeconds(ty, V.am[r[W_AMMO]][0], v, res.reloadDurationMod, frameKey(fr));
      return s != null ? { text: fmtS(s) } : null;
    }
    if (x.name === '操控性') {
      var h = handlingTimes(ty, res.intrinsicHash, v, res.handlingDurationMod, res.activeHashes);
      if (!h) { return null; }
      var ads = h.ads > 0.001;
      return {
        text: fmtS(ads ? h.ads : h.ready),
        title: '抽出 ' + fmtS(h.ready) + ' · 收起 ' + fmtS(h.stow) + (ads ? ' · 开镜 ' + fmtS(h.ads) : '')
      };
    }
    return null;
  }
  function statValueHtml(i, res, x) {
    var conv = statConv(i, res, x);
    return (conv ? (conv.svg || '') + '<span class="conv"' + (conv.title ? ' title="' + esc(conv.title) + '"' : '') + '>' +
      conv.text + '</span><span class="sep">/</span>' : '') + x.value;
  }
  function statsPanel(i, res, ghost) {
    var bars = res.rows.filter(function (x) { return !x.numeric; });
    var nums = res.rows.filter(function (x) { return x.numeric; });
    var o = ['<div class="stats-list">'];
    bars.forEach(function (x) {
      var fill = Math.max(0, Math.min(100, x.value));
      var extra = '', d = '';
      if (ghost && ghost.byStat[x.s]) {
        var gv = ghost.byStat[x.s].value, diff = gv - x.value;
        if (diff > 0) { extra = '<i class="s-ghost" style="width:' + Math.min(100, gv) + '%"></i>'; }
        if (diff < 0) { extra = '<i class="g-neg" style="left:' + gv + '%;width:' + (-diff) + '%"></i>'; }
        if (diff) { d = '<span class="d' + (diff > 0 ? '' : ' dn') + '">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</span>'; }
      }
      o.push('<div class="stat-item' + (S.hoverRow === x.s ? ' is-hover' : '') + '" data-act="statrow" data-s="' + x.s + '">' +
        '<div class="stat-label"><span>' + esc(x.name) + '</span><span class="stat-value">' + statValueHtml(i, res, x) + d +
        '</span></div><div class="bar"><i class="stat-fill" style="width:' + fill + '%"></i>' + extra + '</div></div>');
    });
    o.push('</div>');
    if (nums.length) {
      o.push('<div class="special-stats">');
      nums.forEach(function (x) {
        var d = '';
        if (ghost && ghost.byStat[x.s]) {
          var diff = ghost.byStat[x.s].value - x.value;
          if (diff) { d = '<span class="d' + (diff > 0 ? '' : ' dn') + '">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</span>'; }
        }
        o.push('<div class="special-stat-item" data-act="statrow" data-s="' + x.s + '"><span class="special-stat-label">' +
          esc(x.name) + '</span><span class="special-stat-value">' + (x.name === '后坐方向' ? recoilSvg(x.value) : '') +
          x.value + d + '</span></div>');
      });
      o.push('</div>');
    }
    return o.join('');
  }
  function statsModeBtns() {
    var note = 'PvP 相关为实验版功能，不保证准确。';
    return '<div class="stats-mode-wrap">' +
      '<div class="stats-mode-toggle">' +
      '<button type="button" class="stats-mode-btn" data-act="statsmode" data-v="pve" aria-pressed="' +
      (S.statsMode === 'pve' ? 'true' : 'false') + '">PvE</button>' +
      '<button type="button" class="stats-mode-btn" data-act="statsmode" data-v="pvp" aria-pressed="' +
      (S.statsMode === 'pvp' ? 'true' : 'false') + '" aria-describedby="stats-pvp-note">PvP<span class="stats-pvp-tag">实验</span></button>' +
      '</div><p class="stats-pvp-note" id="stats-pvp-note">' + note + '</p></div>';
  }
  function sideMods(i, roll) {
    var mods = modsOf(i);
    if (!mods.length) { return ''; }
    var m = roll.mod >= 0 ? P.p[roll.mod] : null;
    return '<div class="mods-side"><button type="button" class="slot' + (m ? '' : ' is-empty') +
      '" data-act="modslot" aria-haspopup="dialog" aria-label="模组">' +
      (m ? imgTag(m[P_ICON], '', '', true) : '') + '</button><div class="slot-now"><h3>模组</h3><span>' +
      (m ? esc(m[P_NAME]) : '未装') + '</span></div></div>';
  }
  function sideMw(i, roll) {
    var opts = optsOf(i), rec = poolRow(i)[5] || [], opt = null;
    if (!opts.length) { return ''; }
    opts.forEach(function (o) { if (o[0] === roll.mw) { opt = o; } });
    return '<div class="mw-side"><button type="button" class="slot' + (opt ? '' : ' is-empty') +
      (opt && has(rec, roll.mw) ? ' by-a' : '') + '" data-act="mwslot" aria-haspopup="dialog" aria-label="大师杰作">' +
      (opt ? imgTag(P.p[opt[2]][P_ICON], '', '', true) : '') + '</button><div class="slot-now"><h3>大师杰作</h3><span>' +
      esc(mwLabel(i, roll)) + '</span></div></div>';
  }
  function sideTiers(i, roll, res) {
    var pr = poolRow(i);
    if (pr[4]) {
      var btns = '';
      for (var t = 1; t <= 5; t++) {
        btns += '<button type="button" class="toggle" data-act="tier" data-v="' + t + '" aria-pressed="' +
          (roll.t === t ? 'true' : 'false') + '">T' + t + '</button>';
      }
      return '<div class="mw-tier">' + btns + '</div>';
    }
    if (!roll.mw) { return ''; }
    var b = '';
    for (var k = 1; k <= 10; k++) {
      b += '<button type="button" class="' + (k <= roll.lv ? 'on' : '') + '" data-act="level" data-v="' + k + '" aria-label="' + k + ' 级"></button>';
    }
    return '<div class="pk-lv"><div class="lv">' + b + '<span class="v">Lv' + roll.lv + '</span></div></div>';
  }
  function sideFx(i) {
    var cards = '';
    fxAll().forEach(function (e) {
      if (!fxApplies(i, e)) { return; }
      var n = fxSteps(e);
      cards += '<button type="button" class="fx-item selected" data-act="' + (n > 1 ? 'fxstep' : 'fx') + '" data-v="' + e.id + '"' +
        (n > 1 ? ' data-n="' + n + '"' : '') + '>' +
        fxIco(e, 'fx-ico') +
        '<span class="fx-item-body"><span class="fx-name">' + esc(e.name) +
        (n > 1 ? '<span class="fx-step"> ×' + (fxStepOf(e) + 1) + '</span>' : '') +
        '</span><span class="fx-hint">' + esc(fxHint(e)) + '</span></span></button>';
    });
    var drop = '';
    if (S.fxOpen) {
      drop = '<div class="fx-drop">' + FX_GROUPS.map(function (g) {
        var items = g.items.filter(function (e) { return fxApplies(i, e); });
        if (!items.length) { return ''; }
        var body = '';
        if (S.fxg === g.id) {
          body = '<div class="fx-gi">' + items.map(function (e) {
            return '<button type="button" class="fx-pick' + (fxOn(e.id) ? ' on' : '') + '" data-act="fx" data-v="' + e.id + '">' +
              fxIco(e, 'fx-pick-ico') +
              '<span class="fx-pick-body"><span class="fx-pick-name">' + esc(e.name) + '</span>' +
              '<span class="fx-pick-stats">' + esc(fxHint(e)) + '</span></span></button>';
          }).join('') + '</div>';
        }
        return '<div class="fx-g"><button type="button" class="fx-gh" data-act="fxg" data-v="' + g.id + '">' +
          esc(g.name) + '<span>' + items.length + '</span></button>' + body + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="fx-side"><h3>主动效果</h3>' +
      (cards ? '<div class="fx-list">' + cards + '</div>' : '') +
      '<button type="button" class="fx-add" data-act="fxopen" aria-expanded="' + (S.fxOpen ? 'true' : 'false') + '" aria-label="添加主动效果">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>添加效果</span></button>' +
      drop + '</div>';
  }
  function pvpView(i, res) {
    var r = WR[i], ty = typeName(r), fr = frameOf(r)[0], frEn = frameKey(fr);
    var ammoZh = V.am[r[W_AMMO]][0], ammo = ammoEn(ammoZh), tyEn = TYPE_EN[ty] || ty;
    var roll = rollOf(i);
    var ttkData = getTtkData(i, res.activeHashes);
    var ws = weaponsStatMods(S.pvpStat);
    var rpmKey = ttkData && ttkData.isBow ? STAT_HASH.DRAW_TIME
      : (ttkData && ttkData.isChargeTime ? STAT_HASH.CHARGE_TIME : STAT_HASH.RPM);
    var rpmRow = HSTAT ? res.byStat[HSTAT[rpmKey]] : null;
    var blastRow = ttkData && ttkData.impactDmg != null && HSTAT ? res.byStat[HSTAT[STAT_HASH.BLAST]] : null;
    var rangeRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.RANGE]] : null;
    var reloadRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.RELOAD]] : null;
    var handRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.HANDLING]] : null;
    var zoomRow = HSTAT ? res.byStat[HSTAT[STAT_HASH.ZOOM]] : null;
    var perks = activePerkRows(i, roll, res);
    var dmgScale = 1, precScale = 1, blastScale = 1, rpmMul = 1, ctMod = 1, reloadPerkMul = 1;
    var shotEffects = [];
    perks.forEach(function (row) {
      var m = row.mod;
      if (m.shotEffects) { shotEffects = shotEffects.concat(m.shotEffects); }
      if (m.dmg != null) { dmgScale *= m.dmg; }
      if (m.blastDmg != null) { blastScale *= m.blastDmg; }
      if (m.precDmg != null) { precScale *= m.precDmg; }
      var rm = m.rpmModByType && m.rpmModByType[tyEn] != null ? m.rpmModByType[tyEn] : m.rpmMod;
      if (rm != null) { rpmMul *= rm; }
      if (m.chargeTimeMod != null) { ctMod *= m.chargeTimeMod; }
      if (m.reloadDurationMod != null) { reloadPerkMul *= m.reloadDurationMod; }
    });
    var fxReloadMul = 1, fxHandlingMul = 1;
    fxAll().forEach(function (f) {
      var d = fxDmgOf(f, true);
      if (d !== 1) { dmgScale *= d; }
      fxReloadMul *= fxMulOf(f, 'reloadDurationMod');
      fxHandlingMul *= fxMulOf(f, 'handlingDurationMod');
    });
    var reloadMul = ws.reloadDurationScale * reloadPerkMul * fxReloadMul;
    var handlingMul = ws.handlingDurationScale * fxHandlingMul;
    var blastInfo = null;
    if (blastRow && ttkData && ttkData.impactDmg != null) {
      blastInfo = { blastValue: effStatVal(res, blastRow), baseBlastValue: blastRow.base };
    }
    var baseW = ttkData ? Object.assign({}, ttkData) : null;
    if (baseW && blastInfo) {
      var b0 = baseW.impactDmg + baseW.blastFloor + (baseW.blastCap - baseW.blastFloor) * (blastInfo.baseBlastValue / 100);
      baseW.bodyDmg = b0; baseW.headDmg = b0;
    }
    if (baseW && rpmRow) { baseW.rpm = ttkData.rpm != null ? ttkData.rpm : rpmRow.base; }
    var effW = baseW ? Object.assign({}, baseW) : null;
    var q = res.flatChargeDraw || 0;
    if (effW) {
      if (blastInfo && blastInfo.blastValue !== blastInfo.baseBlastValue) {
        var b1 = ttkData.impactDmg + ttkData.blastFloor + (ttkData.blastCap - ttkData.blastFloor) * (blastInfo.blastValue / 100);
        effW.bodyDmg = b1; effW.headDmg = b1;
      }
      if (rpmRow && rpmRow.value !== rpmRow.base) {
        effW.rpm = ttkData.rpm != null ? ttkData.rpm * rpmRow.value / rpmRow.base : rpmRow.value;
      }
      if (q !== 0 && baseW.isChargeTime && !baseW.isBow) {
        effW.rpm = Math.max(1, effW.rpm + q);
        effW.bodyDmg *= 1 + 5e-4 * q;
        effW.headDmg *= 1 + 5e-4 * q;
      }
    }
    var flatBadges = [], flatBadgeHashes = {};
    if (q !== 0 && baseW && baseW.isChargeTime && !baseW.isBow) {
      var ctKeyStr = String(STAT_HASH.CHARGE_TIME);
      (res.allPlugs || res.perks).forEach(function (p) {
        var rec = resolvedPerkSpec(p), spec = rec ? resolveAmmoSpec(rec.s, ammo) : null;
        if (!spec || spec[ctKeyStr] == null || spec[ctKeyStr] === 0) { return; }
        var raw = spec[ctKeyStr], v = raw && typeof raw === 'object' && raw.f ? raw.v : raw;
        if (typeof v !== 'number' || !v) { return; }
        var ph = String(P.p[p][P_HASH]);
        flatBadgeHashes[ph] = 1;
        flatBadges.push({ p: p, ph: ph, name: plugName(p), icon: P.p[p][P_ICON], flatMs: v, dmgPct: Math.abs(0.05 * v), dmgIncrease: v > 0 });
      });
    }
    var showPerks = perks.filter(function (row) {
      var m = row.mod;
      var active = !!(m.shotEffects || m.dmg || m.blastDmg || m.precDmg || m.rpmMod || m.rpmModByType || m.chargeTimeMod);
      return active && !flatBadgeHashes[row.hash];
    });
    var reloadStat = reloadRow ? effStatVal(res, reloadRow) : null;
    var baseReloadTime = reloadRow ? reloadSeconds(ty, ammoZh, reloadRow.base, 1, frEn) : null;
    var curReloadRaw = reloadStat != null ? reloadSeconds(ty, ammoZh, reloadStat, 1, frEn) : null;
    var reloadTime = curReloadRaw != null ? curReloadRaw * reloadMul : null;
    var expiredOnslaughtRel = null, afterHitRel = null;
    if (curReloadRaw != null && HSTAT) {
      var onsRelRemove = 0, lionRelRemove = 0;
      perks.forEach(function (row) {
        if (row.step < 0) { return; }
        var phNum = +row.hash;
        if (phNum !== 95528736 && phNum !== 956288240 && phNum !== 2003108620) { return; }
        var sp = resolvedPerkSpec(row.p);
        var relVal = sp && sp.s && sp.s[String(STAT_HASH.RELOAD)];
        var nVal = relVal != null ? Number(pickStep(relVal, row.step, ammo)) || 0 : 0;
        if (phNum === 2003108620) { lionRelRemove += nVal; } else { onsRelRemove += nVal; }
      });
      if (onsRelRemove) {
        var rNoOns = reloadSeconds(ty, ammoZh, Math.max(0, Math.min(100, reloadStat - onsRelRemove)), 1, frEn);
        if (rNoOns != null) { expiredOnslaughtRel = rNoOns * reloadMul; }
      }
      if ((P && P.en && P.en[i] === 'Fighting Lion') && lionRelRemove >= 0) {
        var rHit = reloadSeconds(ty, ammoZh, Math.max(0, Math.min(100, reloadStat - lionRelRemove + 70)), 1, frEn);
        if (rHit != null) { afterHitRel = rHit * reloadMul; }
      }
    }
    var magBase = res.magBaseCap, magOv = null, ovStep = 0;
    if (magBase != null && res.overflowPerks.length) {
      var ovFirst = res.overflowPerks[0];
      ovStep = perkStepOf(ovFirst.p, ammo);
      magOv = calculateOverflowSteps(ovFirst.overflowDef, magBase, ammo);
    }
    var e4Mag = magOv && magOv.steps && ovStep >= 0 ? magOv.steps[Math.max(0, Math.min(ovStep, magOv.steps.length - 1))] : magBase;
    var magMax = Number.isFinite(e4Mag) && e4Mag >= 1 ? Math.floor(e4Mag) : null;
    var magStart = magMax == null ? null : (S.pvpMag == null ? magMax : Math.max(1, Math.min(magMax, Math.round(S.pvpMag))));
    var hasModCtx = shotEffects.length > 0 || reloadMul !== 1 || dmgScale !== 1 || blastScale !== 1 || precScale !== 1 || rpmMul !== 1 || ctMod !== 1 || (magStart != null && magStart > 0);
    var aa = hasModCtx ? {
      shotEffects: shotEffects,
      shotContext: {
        magazineCapacity: magBase, loadedMagazine: magStart,
        afterHitReloadSeconds: afterHitRel, reloadSeconds: reloadTime,
        expiredOnslaughtReloadSeconds: expiredOnslaughtRel, heavyBurst: frEn === 'Heavy Burst'
      },
      dmg: dmgScale !== 1 ? dmgScale : undefined,
      blastDmg: blastScale !== 1 ? blastScale : undefined,
      precDmg: precScale !== 1 ? precScale : undefined,
      rpmMod: rpmMul !== 1 ? rpmMul : undefined,
      chargeTimeMod: ctMod !== 1 ? ctMod : undefined,
      reloadDurationMod: reloadMul !== 1 ? reloadMul : undefined
    } : null;
    var baseOpt = baseW ? calculateOptimalKill(baseW, null, PVP_HP, 0) : null;
    var optKill = effW ? calculateOptimalKill(effW, aa, PVP_HP, S.pvpStat) : null;
    var optAcc = optKill && optKill.critPercent != null ? optKill.critPercent : (baseOpt ? baseOpt.critPercent : 100);
    var isFusion = !!(effW && effW.isFusion);
    var accDirty = S.pvpAcc != null;
    var acc = accDirty ? S.pvpAcc : optAcc;
    var activeKill = effW ? (accDirty ? calculateModifiedTTK(effW, acc, aa, PVP_HP, S.pvpStat) : optKill) : null;
    var bodySim = effW ? (isFusion ? activeKill : calculateModifiedTTK(effW, 0, aa, PVP_HP, S.pvpStat)) : null;
    var headSim = effW ? (isFusion ? activeKill : calculateModifiedTTK(effW, 100, aa, PVP_HP, S.pvpStat)) : null;
    var bodyDmg = (bodySim && bodySim.bodyDmg != null) ? bodySim.bodyDmg : (activeKill && activeKill.bodyDmg != null ? activeKill.bodyDmg : (effW ? effW.bodyDmg : null));
    var headDmg = (headSim && headSim.headDmg != null) ? headSim.headDmg : (activeKill && activeKill.headDmg != null ? activeKill.headDmg : (effW ? effW.headDmg : null));
    var baseBodyDmg = baseW ? (baseOpt && baseW.areaDenial ? baseOpt.bodyDmg : baseW.bodyDmg) : null;
    var baseHeadDmg = baseW ? baseW.headDmg : null;
    var dispRpm = effW ? (rpmRow ? rpmRow.value : effW.rpm) : null;
    if (dispRpm != null && effW) {
      if (!effW.isChargeTime && rpmMul !== 1) { dispRpm /= rpmMul; }
      if (effW.isChargeTime && ctMod !== 1) { dispRpm *= ctMod; }
      if (effW.isBow && res.overflowPerks.length && res.overflowPerks[0].overflowDef.drawTimePcts) {
        var dtPcts = res.overflowPerks[0].overflowDef.drawTimePcts;
        var dtIdx = Math.max(0, Math.min(ovStep, dtPcts.length - 1));
        dispRpm = Math.round(dispRpm * (1 - dtPcts[dtIdx]));
      }
    }
    var baseRpm = baseW ? (rpmRow ? rpmRow.base : baseW.rpm) : null;
    var rangeStat = rangeRow ? effStatVal(res, rangeRow) : null;
    var rm = rangeStat != null ? rangeMeters(ty, fr, rangeStat, {
      zoomStat: zoomRow ? zoomRow.value : null, intrinsicHash: res.intrinsicHash,
      bodyDmg: ttkData ? ttkData.bodyDmg : null,
      modifiers: { rangeAllScale: res.rangeAllScale, rangeHipScale: res.rangeHipScale, rangeAdsStatAdd: res.rangeAdsStatAdd }
    }) : null;
    var baseRm = rangeRow ? rangeMeters(ty, fr, rangeRow.base, {
      zoomStat: zoomRow ? zoomRow.base : null, intrinsicHash: res.intrinsicHash,
      bodyDmg: ttkData ? ttkData.bodyDmg : null
    }) : null;
    var handStat = handRow ? effStatVal(res, handRow) : null;
    var handCur = handStat != null ? handlingTimes(ty, res.intrinsicHash, handStat, handlingMul, res.activeHashes) : null;
    var handBase = handRow ? handlingTimes(ty, res.intrinsicHash, handRow.base, 1, res.activeHashes) : null;
    var ttkVal = activeKill ? activeKill.ttk : null;
    var optStr = (isFusion ? (optKill && optKill.optimal) : (activeKill && activeKill.optimal)) || (baseOpt && baseOpt.optimal);
    var killStr = activeKill && activeKill.areaDenial
      ? activeKill.triggerPulls + ' 次发射 + 领域'
      : formatKillZh(optStr, isFusion, !!(effW && effW.bodyDmg === effW.headDmg));
    return {
      ty: ty, tyEn: tyEn, ttkData: ttkData, baseW: baseW, effW: effW, ws: ws,
      baseOpt: baseOpt, optKill: optKill, activeKill: activeKill,
      optAcc: optAcc, acc: acc, accDirty: accDirty, isFusion: isFusion,
      ttk: ttkVal, kill: killStr, bodyDmg: bodyDmg, headDmg: headDmg,
      baseBodyDmg: baseBodyDmg, baseHeadDmg: baseHeadDmg,
      dispRpm: dispRpm, baseRpm: baseRpm, rpmRow: rpmRow,
      blastInfo: blastInfo, aa: aa,
      rm: rm, baseRm: baseRm, rangeStat: rangeStat, rangeRow: rangeRow,
      rs: reloadTime, baseRs: baseReloadTime, reloadStat: reloadStat, reloadRow: reloadRow,
      handCur: handCur, handBase: handBase, handStat: handStat, handRow: handRow,
      magMax: magMax, magStart: magStart,
      perks: perks, showPerks: showPerks, flatBadges: flatBadges,
      bursts: activeKill ? activeKill.bursts : null,
      hits: activeKill ? activeKill.hits : null,
      pelletsToKill: activeKill ? activeKill.pelletsToKill : null,
      pelletsPerShot: (activeKill && activeKill.pelletsPerShot) || (effW && effW.pelletsPerShot) || null,
      bodyVaries: !!(bodySim && bodySim.shotSequence && bodySim.shotSequence.some(function (s) { return Math.abs(s.bodyDmg - bodySim.shotSequence[0].bodyDmg) > 1e-9; })),
      headVaries: !!(headSim && headSim.shotSequence && headSim.shotSequence.some(function (s) { return Math.abs(s.headDmg - headSim.shotSequence[0].headDmg) > 1e-9; }))
    };
  }
  function pvpSet(pane, key, text) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (n) { n.textContent = text; }
  }
  function pvpNumSet(pane, key, val) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (n) { n.innerHTML = val; }
  }
  function pvpCls(pane, key, cls) {
    var n = pane.querySelector('[data-pvp="' + key + '"]');
    if (!n) { return; }
    n.classList.remove('up', 'down', 'better', 'worse');
    if (cls) { n.classList.add(cls); }
  }
  function pvpHeroHtml(v, shownTtk, shownBursts, shownHits, shownPelKill, shownPelShot) {
    var effW = v.effW, ttkVal = shownTtk != null ? shownTtk : v.ttk;
    if (ttkVal == null) { return esc(v.kill || '—'); }
    if (v.tyEn === 'Sword' || (effW && effW.assumedOneHit)) { return '一击击杀'; }
    if (v.isFusion) {
      var b = shownBursts != null ? Math.round(shownBursts) : v.bursts;
      return fmtS(ttkVal) + ' <span class="pvp-stat-hero-sub">(' + (b === 1 ? '单发蓄力' : b + ' 次蓄力') + ')</span>';
    }
    if (effW && effW.isBow) {
      var h = shownHits != null ? Math.round(shownHits) : v.hits;
      return fmtS(ttkVal) + ' <span class="pvp-stat-hero-sub">(' + (h === 1 ? '一击击杀' : h + ' 箭') + ')</span>';
    }
    if (effW && effW.isShotgun) {
      var pk = shownPelKill != null ? Math.round(shownPelKill) : v.pelletsToKill;
      var ps = shownPelShot != null ? Math.round(shownPelShot) : v.pelletsPerShot;
      var shots = ps ? Math.ceil(pk / ps) : 1;
      return pk + ' / ' + ps + ' <span class="pvp-stat-hero-sub">(' + (shots <= 1 ? '一枪击杀' : shots + ' 枪') + ')</span>';
    }
    if (ttkVal === 0) { return esc(v.kill || '一击击杀'); }
    return fmtS(ttkVal);
  }
  function pvpAnimSnapshot(v) {
    return {
      ttk: v.ttk, body: v.bodyDmg, head: v.headDmg, rpm: v.dispRpm,
      hip: v.rm ? v.rm.hip : null, ads: v.rm ? v.rm.ads : null, reload: v.rs,
      ready: v.handCur ? v.handCur.ready : null, stow: v.handCur ? v.handCur.stow : null,
      hAds: v.handCur ? v.handCur.ads : null, bursts: v.bursts, hits: v.hits,
      pelKill: v.pelletsToKill, pelShot: v.pelletsPerShot
    };
  }
  function paintPvpNumbers(pane, v, snap, cls) {
    pvpNumSet(pane, 'ttk', pvpHeroHtml(v, snap.ttk, snap.bursts, snap.hits, snap.pelKill, snap.pelShot));
    pvpSet(pane, 'kill', v.kill);
    if (v.blastInfo && v.ttkData) {
      var imp = v.ttkData.impactDmg * (v.ws.percent > 0 && S.pvpStat > 100 ? 1 + 5e-4 * (S.pvpStat - 100) : 1) * ((v.aa && v.aa.dmg) || 1);
      var blast = (snap.body != null ? snap.body : v.bodyDmg || 0) - imp;
      pvpSet(pane, 'impact', roundPvpDamage(imp));
      pvpSet(pane, 'blast', roundPvpDamage(blast));
    } else {
      if (snap.body != null) { pvpSet(pane, 'body', roundPvpDamage(snap.body)); }
      if (snap.head != null) { pvpSet(pane, 'crit', roundPvpDamage(snap.head)); }
    }
    if (snap.rpm != null) {
      pvpSet(pane, 'rpm', v.effW && v.effW.isChargeTime ? Math.round(snap.rpm) + 'ms' : String(Math.round(snap.rpm)));
    }
    if (snap.hip != null) { pvpSet(pane, 'hip', fmtM(snap.hip)); }
    if (snap.ads != null) { pvpSet(pane, 'ads', fmtM(snap.ads)); }
    if (snap.reload != null) { pvpSet(pane, 'reload', fmtS(snap.reload)); }
    if (snap.ready != null) { pvpSet(pane, 'ready', fmtS(snap.ready)); }
    if (snap.stow != null) { pvpSet(pane, 'stow', fmtS(snap.stow)); }
    if (snap.hAds != null) { pvpSet(pane, 'hads', fmtS(snap.hAds)); }
    pvpCls(pane, 'body', cls);
    pvpCls(pane, 'crit', cls);
    pvpCls(pane, 'ttk', cls);
  }
  function pvpWeaponStatNoteHtml(v) {
    if (S.pvpStat === 0) { return '<span class="pvp-weapon-stat-note">无加成</span>'; }
    var parts = [];
    if (S.pvpStat > 100) { parts.push('<span class="pvp-weapon-stat-effect">+' + ((S.pvpStat - 100) * 0.05).toFixed(1) + '% 伤害</span>'); }
    if (v.ws.percent > 0) { parts.push('<span class="pvp-weapon-stat-effect">−' + v.ws.percent.toFixed(1) + '% 填装与操控时间</span>'); }
    return parts.join(' · ');
  }
  function updatePvpControls(pane, v) {
    if (v.isFusion && v.effW) {
      pvpSet(pane, 'acc', Math.round(v.effW.boltsPerBurst * v.acc / 100) + '/' + v.effW.boltsPerBurst);
    } else {
      pvpSet(pane, 'acc', v.acc + '%');
    }
    var rst = pane.querySelector('[data-act="pvpreset"]');
    if (rst) { rst.hidden = !v.accDirty; }
    var accSl = pane.querySelector('[data-act="pvpacc"]');
    if (accSl && document.activeElement !== accSl) { accSl.value = v.acc; }
    var wsNum = pane.querySelector('[data-act="pvpstatnum"]');
    if (wsNum && document.activeElement !== wsNum) { wsNum.value = String(S.pvpStat); }
    var wsSl = pane.querySelector('[data-act="pvpstat"]');
    if (wsSl && document.activeElement !== wsSl) { wsSl.value = S.pvpStat; }
    var wsRst = pane.querySelector('[data-act="pvpstatreset"]');
    if (wsRst) { wsRst.disabled = S.pvpStat === 0; }
    var wsDesc = pane.querySelector('[data-pvp="wnote"]');
    if (wsDesc) { wsDesc.innerHTML = pvpWeaponStatNoteHtml(v); }
    if (v.magMax != null && v.magStart != null) {
      var magNum = pane.querySelector('[data-act="pvpmagnum"]');
      if (magNum && document.activeElement !== magNum && !S.pvpMagBlank) {
        magNum.value = String(v.magStart);
        magNum.style.width = String(v.magStart).length + 'ch';
      }
      var magSl = pane.querySelector('[data-act="pvpmag"]');
      if (magSl && document.activeElement !== magSl) { magSl.value = v.magStart; }
      var magRst = pane.querySelector('[data-act="pvpmagreset"]');
      if (magRst) { magRst.hidden = v.magStart === v.magMax; }
    }
  }
  function refreshPvpNumbers() {
    var pane = body.querySelector('.pvp-stats');
    if (!pane || S.sel == null || !P || !SIDX) { return; }
    if (pvpTween) { cancelAnimationFrame(pvpTween); pvpTween = null; }
    var v = pvpView(S.sel, compute(S.sel, rollOf(S.sel)));
    updatePvpControls(pane, v);
    var snap = pvpAnimSnapshot(v);
    pvpShown = snap;
    paintPvpNumbers(pane, v, snap, '');
    var perksHtml = pvpPerkBadges(v.showPerks, v.flatBadges, v.tyEn, v.effW);
    var perksEl = pane.querySelector('[data-pvp="perks"]');
    if (perksEl) { perksEl.innerHTML = perksHtml; perksEl.hidden = !perksHtml; }
  }
  function kickPvpAnim() {
    var pane = body.querySelector('.pvp-stats');
    if (!pane || S.sel == null || !P || !SIDX) { return; }
    if (pvpSel !== S.sel) { pvpShown = {}; pvpSel = S.sel; }
    var v = pvpView(S.sel, compute(S.sel, rollOf(S.sel)));
    updatePvpControls(pane, v);
    var to = pvpAnimSnapshot(v), from = pvpShown;
    if (pvpTween) { cancelAnimationFrame(pvpTween); pvpTween = null; }
    var changed = from.body == null || from.body !== to.body || from.crit !== to.head || from.ttk !== to.ttk;
    if (reduceMotion() || from.body == null || !changed) {
      pvpShown = to;
      paintPvpNumbers(pane, v, to, '');
      return;
    }
    var cls = ((to.body || 0) > (from.body || 0) || (to.head || 0) > (from.head || 0)) ? 'up'
      : ((to.body || 0) < (from.body || 0) || (to.head || 0) < (from.head || 0)) ? 'down' : '';
    var t0 = null;
    function lerp(a, b, e) { return a == null || b == null ? b : a + (b - a) * e; }
    function frame(now) {
      if (t0 == null) { t0 = now; }
      var u = Math.min((now - t0) / PVP_ANIM_MS, 1), e = easePvp(u);
      var mid = {
        ttk: lerp(from.ttk, to.ttk, e), body: lerp(from.body, to.body, e), head: lerp(from.head, to.head, e),
        rpm: lerp(from.rpm, to.rpm, e), hip: lerp(from.hip, to.hip, e), ads: lerp(from.ads, to.ads, e),
        reload: lerp(from.reload, to.reload, e), ready: lerp(from.ready, to.ready, e),
        stow: lerp(from.stow, to.stow, e), hAds: lerp(from.hAds, to.hAds, e),
        bursts: lerp(from.bursts, to.bursts, e), hits: lerp(from.hits, to.hits, e),
        pelKill: lerp(from.pelKill, to.pelKill, e), pelShot: to.pelShot
      };
      paintPvpNumbers(pane, v, mid, u < 1 ? cls : '');
      if (u < 1) { pvpTween = requestAnimationFrame(frame); }
      else { pvpShown = to; pvpTween = null; }
    }
    paintPvpNumbers(pane, v, from, cls);
    pvpTween = requestAnimationFrame(frame);
  }
  function perkBadgeLines(row, tyEn, w) {
    var m = row.mod, out = [], lt = m.shotEffects ? '' : perkLifetimeZh(row.lifetime, row.step);
    var suffix = lt ? ' · ' + lt : '';
    function pctText(mult, label) {
      var d = Number(((mult - 1) * 100).toFixed(2));
      return { text: (d < 0 ? '−' : '+') + Math.abs(d) + '% ' + label + suffix, neg: d < 0 };
    }
    if (m.dmg != null && m.dmg !== 1) { out.push(pctText(m.dmg, '伤害')); }
    if (m.blastDmg != null && m.blastDmg !== 1) { out.push(pctText(m.blastDmg, '爆炸伤害')); }
    if (m.precDmg != null && m.precDmg !== 1) { out.push(pctText(m.precDmg, (row.isAverage ? '平均' : '') + '精准伤害')); }
    var rpmM = m.rpmModByType && m.rpmModByType[tyEn] != null ? m.rpmModByType[tyEn] : m.rpmMod;
    if (w && (w.isChargeTime || w.isBow)) {
      var lbl = w.isBow ? '蓄力时间' : '充能时间';
      if (m.chargeTimeMod && m.chargeTimeMod < 1) { out.push({ text: lbl + '减少 ' + parseFloat(((1 - m.chargeTimeMod) * 100).toFixed(2)) + '%', neg: false }); }
      if (m.chargeTimeMod && m.chargeTimeMod > 1) { out.push({ text: lbl + '增加 ' + parseFloat(((m.chargeTimeMod - 1) * 100).toFixed(2)) + '%', neg: true }); }
    } else if (rpmM != null && rpmM !== 1) {
      if (rpmM < 1) { out.push({ text: '射速提升 ' + parseFloat(((1 - rpmM) * 100).toFixed(2)) + '%', neg: false }); }
      else { out.push({ text: '射速降低 ' + parseFloat(((rpmM - 1) * 100).toFixed(2)) + '%', neg: true }); }
    }
    if (m.shotEffects) {
      m.shotEffects.forEach(function (ef) {
        var k = ef.kind, t = '';
        if (k === 'focusedFury') { t = '+25% 伤害（命中弹匣 35% 精准后）· 持续 ' + (ef.enhanced ? 12 : 11) + 's'; }
        else if (k === 'controlledBurst') { t = '+20% 伤害 · −10% 充能（全中一轮后）· 持续 ' + (ef.enhanced ? 2.5 : 2) + 's'; }
        else if (k === 'backupPlan') { t = '−20% 伤害 · −30% 充能 · 持续 ' + (ef.enhanced ? 2.5 : 2) + 's'; }
        else if (k === 'kickstart') { t = '+15% 伤害 · −20% 充能时间'; }
        else if (k === 'bluntExecution') { t = '+100% 伤害 · 仅限首轮点射'; }
        else if (k === 'archersTempo') { t = '精准命中后 −25% 蓄力时间 · 持续 ' + (ef.enhanced ? 4 : 3) + 's'; }
        else if (k === 'archersGambit') { t = '腰射精准后 −60% 蓄力时间'; }
        else if (k === 'successfulWarmup') { t = '−37.5% 充能/蓄力时间 · 持续 6s'; }
        else if (k === 'adagio') { t = '+' + (ef.weaponType === 'Hand Cannon' ? 27 : 30) + '% 伤害 · +20% 射击间隔 · 持续 ' + (ef.enhanced ? 8 : 7) + 's'; }
        else if (k === 'explosiveLight') { t = '初始 ' + (ef.enhanced ? 7 : 6) + ' 层 · 每发消耗 1 层'; }
        else if (k === 'boxBreathing') { t = '首枪精准加成 +' + Math.round((ef.precisionMultiplier - 1) * 100) + '% · 预先瞄准 ' + (ef.enhanced ? '1.4' : '1.5') + 's'; }
        else if (k === 'oneForAll') { t = '+35% 伤害 · 持续 ' + (ef.enhanced ? '11' : '10') + 's'; }
        else if (k === 'harmony') { t = '+20% 伤害 · 持续 ' + (ef.enhanced ? '8' : '7') + 's'; }
        else if (k === 'killClip') { t = '+25% 伤害 · 持续 ' + (ef.enhanced ? '5.5' : '5') + 's'; }
        else if (k === 'magnificentHowl') { t = '+' + (ef.enhanced ? 55 : 50) + '% 伤害 · 每发消耗 1 层'; }
        else if (k === 'recombination') { t = '+' + parseFloat((ef.stacks * (ef.enhanced ? 6.25 : 5)).toFixed(2)) + '% 伤害 · 仅限首枪'; }
        else if (k === 'onslaught') { t = '射击延迟 −' + parseFloat(((1 - ef.delayScale) * 100).toFixed(1)) + '% · 持续 ' + (ef.enhanced ? 5 : 4.5) + 's'; }
        else if (k === 'desperado') { t = '射击延迟 −30% · 持续 ' + (ef.enhanced ? '7' : '6') + 's'; }
        else if (k === 'cascadePoint') { t = '射击延迟 −' + Math.round((1 - ef.delayScale) * 100) + '% · 持续 ' + (ef.enhanced ? '2.75' : '2.5') + 's'; }
        else if (k === 'reservoirBurst') { t = '满弹及以上时 +' + (ef.enhanced ? '33' : '30') + '% 伤害'; }
        else if (k === 'highImpactReserves') { t = '剩余 ≤' + (ef.enhanced ? '55' : '50') + '% 弹匣起最高 +6% 伤害'; }
        else if (k === 'precisionInstrument') {
          var maxP = ef.enhanced ? 30 : 25;
          t = ef.initialStacks > 0
            ? '+' + parseFloat((ef.initialStacks / 6 * maxP).toFixed(2)) + '% 精准伤害起步 · 递增至 +' + maxP + '%'
            : '随连续命中递增至 +' + maxP + '% 精准伤害';
        } else if (k === 'targetLock') { t = '随连续命中递增至 +' + (ef.enhanced ? 30 : 25) + '% 伤害'; }
        if (t) { out.push({ text: t, neg: false }); }
      });
    }
    return out;
  }
  function pvpPerkBadges(showPerks, flatBadges, tyEn, w) {
    if ((!showPerks || !showPerks.length) && (!flatBadges || !flatBadges.length)) { return ''; }
    var html = '<span class="pvp-damage-perks-title">生效词条</span>';
    (flatBadges || []).forEach(function (fb) {
      html += '<div class="pvp-perk-badge">' + imgTag(fb.icon, 'pvp-perk-icon', '', true) +
        '<span class="pvp-perk-info"><span class="pvp-perk-name">' + esc(fb.name) + '</span>' +
        '<span class="pvp-perk-effect' + (fb.dmgIncrease ? '' : ' negative') + '">' +
        (fb.dmgIncrease ? '+' : '−') + parseFloat(fb.dmgPct.toFixed(2)) + '% 伤害</span></span></div>';
    });
    (showPerks || []).forEach(function (row) {
      var lines = perkBadgeLines(row, tyEn, w);
      var isPI = !!(row.mod.shotEffects && row.mod.shotEffects.some(function (e) { return e.kind === 'precisionInstrument'; }));
      html += '<button type="button" class="pvp-perk-badge"' +
        (row.steps > 1 ? ' data-act="perkstep" data-v="' + row.hash + '" data-n="' + row.steps + '"' +
          (isPI ? ' data-pi="1"' : '') : '') + '>' +
        imgTag(row.icon, 'pvp-perk-icon', '', true) +
        '<span class="pvp-perk-info"><span class="pvp-perk-name">' + esc(row.name) +
        (row.steps > 1 ? '<span class="pvp-perk-step"> ×' + (row.step + 1) + '</span>' : '') +
        '</span>' + lines.map(function (ln) {
          return '<span class="pvp-perk-effect' + (ln.neg ? ' negative' : '') + '">' + esc(ln.text) + '</span>';
        }).join('') + '</span></button>';
    });
    return html;
  }
  function pvpPanel(i, res) {
    if (!SIDX) { return '<p class="src">词条池载入中，暂无法计算 PvP 数值。</p>'; }
    if (!PERK_FX) {
      ensurePerkFx(function () { if (S.statsMode === 'pvp' && S.sel === i) { renderDetail(); } });
    }
    var v = pvpView(i, res), ttk = v.activeKill, rm = v.rm, rs = v.rs, effW = v.effW;
    if (!v.ttkData || !effW) { return '<div class="pvp-stats"><p class="src">该武器类型暂无 PvP 伤害数据。</p></div>'; }
    var useLive = pvpSel === i && pvpShown.body != null;
    var bodyN = useLive ? pvpShown.body : v.bodyDmg;
    var critN = useLive ? pvpShown.crit : v.headDmg;
    var ttkShow = useLive && pvpShown.ttk != null ? pvpShown.ttk : v.ttk;
    function pvpItem(k, val, extra, key) {
      return '<div class="pvp-stat-item"><span class="pvp-stat-label">' + k + '</span><span class="pvp-stat-value"' +
        (key ? ' data-pvp="' + key + '"' : '') + '>' + val + '</span></div>' + (extra || '');
    }
    var heroLabel = effW.hitCountOnly ? '击杀所需命中' : effW.isShotgun ? '击杀所需弹丸' : '击杀时间';
    var sameDmg = effW.bodyDmg === effW.headDmg;
    var hitOrAccHtml = '';
    if (v.tyEn !== 'Sword') {
      if (sameDmg && !v.isFusion) {
        hitOrAccHtml = pvpItem(effW.areaDenial ? '伤害事件次数' : '命中次数', ttk ? String(ttk.shots) : '—');
      } else {
        var accDisp = v.isFusion ? Math.round(effW.boltsPerBurst * v.acc / 100) + '/' + effW.boltsPerBurst : v.acc + '%';
        var accMin = v.isFusion ? Math.ceil(50 / effW.boltsPerBurst) : 0;
        var optDisp = v.isFusion ? Math.round(effW.boltsPerBurst * v.optAcc / 100) + '/' + effW.boltsPerBurst + ' 发弹丸' : v.optAcc + '%';
        hitOrAccHtml = pvpItem(
          (v.isFusion ? '命中弹丸数' : '精准率') +
          '<button type="button" class="pvp-crit-reset" data-act="pvpreset" title="重置为最优 (' + esc(optDisp) + ')"' +
          (v.accDirty ? '' : ' hidden') + '>↺</button>',
          accDisp,
          '<div class="pvp-slat"><input class="pvp-crit-range" type="range" min="' + accMin + '" max="100" step="1" value="' +
          v.acc + '" data-act="pvpacc"></div>',
          'acc'
        );
      }
    }
    var dmgHtml = '';
    if (v.tyEn !== 'Sword') {
      if (v.isFusion) {
        dmgHtml = bodyN != null ? pvpItem(v.bodyVaries ? '平均单发弹丸伤害' : '单发弹丸伤害', roundPvpDamage(bodyN), '', 'body') : '';
      } else if (v.blastInfo) {
        var impNow = v.ttkData.impactDmg * (S.pvpStat > 100 ? 1 + 5e-4 * (S.pvpStat - 100) : 1) * ((v.aa && v.aa.dmg) || 1);
        var blastNow = (bodyN || 0) - impNow;
        dmgHtml = pvpItem('直击伤害', roundPvpDamage(impNow), '', 'impact') +
          pvpItem('爆炸伤害 <span class="pvp-sub">(' + v.blastInfo.blastValue + ')</span>', roundPvpDamage(blastNow), '', 'blast');
      } else {
        var bLbl = effW.areaDenial ? '平均事件伤害' : effW.isShotgun ? '单颗弹丸直击'
          : !sameDmg ? (v.bodyVaries ? '平均直击伤害' : '直击伤害') : '伤害';
        dmgHtml = bodyN != null ? pvpItem(bLbl, roundPvpDamage(bodyN), '', 'body') : '';
        if (!sameDmg && critN != null) {
          var cLbl = effW.isShotgun ? '单颗弹丸精准' : (v.headVaries ? '平均精准伤害' : '精准伤害');
          dmgHtml += pvpItem(cLbl, roundPvpDamage(critN), '', 'crit');
        }
      }
    }
    var rpmHtml = '';
    if (v.dispRpm != null) {
      var rLbl = effW.isBow ? '蓄力时间' : effW.isChargeTime ? '充能时间' : '射速';
      var rVal = effW.isChargeTime ? Math.round(useLive && pvpShown.rpm != null ? pvpShown.rpm : v.dispRpm) + 'ms'
        : String(Math.round(useLive && pvpShown.rpm != null ? pvpShown.rpm : v.dispRpm));
      rpmHtml = pvpItem(rLbl, rVal, '', 'rpm');
    }
    var rangeHtml = '';
    if (rm) {
      var hDisp = useLive && pvpShown.hip != null ? pvpShown.hip : rm.hip;
      var aDisp = useLive && pvpShown.ads != null ? pvpShown.ads : rm.ads;
      rangeHtml = '<div class="pvp-stat-item pvp-range-row"><span class="pvp-stat-label">射程 <span class="pvp-sub">(' +
        v.rangeStat + ')</span></span><span class="pvp-stat-value">' + rangeFalloffSvg(rm) +
        '<span class="pvp-range-hip" data-pvp="hip">' + fmtM(hDisp) +
        '</span><span class="pvp-range-sep">/</span><span class="pvp-range-ads" data-pvp="ads">' + fmtM(aDisp) + '</span></span></div>';
    }
    var reloadHtml = '';
    if (rs != null) {
      var relDisp = useLive && pvpShown.reload != null ? pvpShown.reload : rs;
      reloadHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label">填装 <span class="pvp-sub">(' +
        v.reloadStat + ')</span></span><span class="pvp-stat-value" data-pvp="reload">' + fmtS(relDisp) + '</span></div>';
    }
    var handHtml = '';
    if (v.handCur) {
      var rdy = useLive && pvpShown.ready != null ? pvpShown.ready : v.handCur.ready;
      var stw = useLive && pvpShown.stow != null ? pvpShown.stow : v.handCur.stow;
      var ads = useLive && pvpShown.hAds != null ? pvpShown.hAds : v.handCur.ads;
      handHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label">操控 <span class="pvp-sub">(' +
        v.handStat + ')</span></span><span class="pvp-stat-value">' +
        '<span data-pvp="ready">' + fmtS(rdy) + '</span><span class="pvp-handling-sep"> / </span>' +
        '<span data-pvp="stow">' + fmtS(stw) + '</span><span class="pvp-handling-sep"> / </span>' +
        '<span data-pvp="hads">' + fmtS(ads) + '</span></span></div>';
    }
    var magHtml = '';
    if (v.magStart != null && v.magStart > 0) {
      magHtml = '<div class="pvp-stat-item"><span class="pvp-stat-label pvp-magazine-label"><span>起始弹匣' +
        '<button type="button" class="pvp-crit-reset" data-act="pvpmagreset" title="重置为满弹匣 (' + v.magMax + ')"' +
        (v.magStart !== v.magMax ? '' : ' hidden') + '>↺</button></span>' +
        '<input class="pvp-numeric-input pvp-magazine-input" type="number" inputmode="numeric" min="1" max="' + v.magMax +
        '" step="1" style="width:' + (S.pvpMagBlank ? 1 : String(v.magStart).length) + 'ch" value="' +
        (S.pvpMagBlank ? '' : v.magStart) + '" data-act="pvpmagnum" aria-label="起始弹匣数">' +
        '</span></div>' +
        '<div class="pvp-slat"><input class="pvp-crit-range" type="range" min="1" max="' + v.magMax +
        '" step="1" value="' + v.magStart + '" data-act="pvpmag" aria-label="起始弹匣滑动条"></div>';
    }
    var notesHtml = effW.notes ? '<div class="pvp-stat-notes">' + esc(effW.notes) + '</div>' : '';
    var perksBlock = pvpPerkBadges(v.showPerks, v.flatBadges, v.tyEn, effW);
    return '<div class="pvp-stats">' +
      '<div class="pvp-stat-hero"><span class="pvp-stat-label">' + heroLabel + '</span>' +
      '<span class="pvp-stat-hero-value" data-pvp="ttk">' +
      pvpHeroHtml(v, ttkShow, useLive ? pvpShown.bursts : v.bursts, useLive ? pvpShown.hits : v.hits, useLive ? pvpShown.pelKill : v.pelletsToKill, v.pelletsPerShot) +
      '</span></div>' +
      (v.tyEn !== 'Sword' ? pvpItem('最优击杀', esc(v.kill), '', 'kill') : '') +
      hitOrAccHtml + dmgHtml + rpmHtml + rangeHtml + reloadHtml + handHtml + magHtml + notesHtml +
      '<div class="pvp-weapon-stat"><div class="pvp-weapon-stat-header"><span class="pvp-weapon-stat-title">武器属性</span>' +
      '<button type="button" class="pvp-weapon-stat-reset" data-act="pvpstatreset" title="重置为 0"' +
      (S.pvpStat === 0 ? ' disabled' : '') + '>↺</button></div>' +
      '<div class="pvp-weapon-stat-badge"><div class="pvp-weapon-stat-info"><div class="pvp-weapon-stat-row">' +
      '<input class="pvp-numeric-input pvp-weapon-stat-value" type="number" inputmode="numeric" min="0" max="200" step="1" value="' +
      S.pvpStat + '" data-act="pvpstatnum" aria-label="武器属性数值">' +
      '<input class="pvp-weapon-stat-range" type="range" min="0" max="200" step="1" value="' + S.pvpStat +
      '" data-act="pvpstat" aria-label="武器属性滑动条">' +
      '</div><div class="pvp-weapon-stat-description" data-pvp="wnote">' + pvpWeaponStatNoteHtml(v) +
      '</div></div></div></div>' +
      '<div class="pvp-damage-perks" data-pvp="perks"' + (perksBlock ? '' : ' hidden') + '>' + perksBlock + '</div>' +
      '</div>';
  }
  function statsBlock(i, res, ghost) {
    var roll = rollOf(i);
    var inner = S.statsMode === 'pvp' ? pvpPanel(i, res) : statsPanel(i, res, ghost);
    return '<section class="stats-sec">' +
      '<div class="stats-header"><h3>属性</h3>' + statsModeBtns() + '</div>' +
      '<div class="stats-box">' + inner + '</div>' +
      '<div class="side-aux"><div class="side-slots">' + sideMods(i, roll) + sideMw(i, roll) + '</div>' +
      sideTiers(i, roll, res) +
      (S.pop === 'mw' ? mwPicker(i, roll) : S.pop === 'mod' ? modPicker(i, roll) : '') +
      sideFx(i) + '</div></section>';
  }
  /* 悬停词条只改两处：那枚按钮的 is-hover 与属性表的预览。详情有 400–750 个元素，
     整张重画时指针扫过词条栏每换一枚就重排一次。 */
  var hoverRaf = 0;
  function renderHover() {
    if (hoverRaf) cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(function () {
      hoverRaf = 0;
      var box = body.querySelector('.wpn-detail'), pane = box && box.querySelector('.stats-box');
      if (!pane) { renderDetail(); return; }
      var i = S.sel, roll = rollOf(i), h = S.hoverPlug;
      var on = box.querySelectorAll('.plug.is-hover');
      for (var k = 0; k < on.length; k++) { on[k].classList.remove('is-hover'); }
      if (h) {
        var b = box.querySelector('[data-act="perk"][data-col="' + h.col + '"][data-plug="' + h.plug + '"]');
        if (b) { b.classList.add('is-hover'); }
      }
      var res = compute(i, roll), ghost = h ? compute(i, roll, { col: h.col, plug: h.plug }) : null;
      pane.innerHTML = S.statsMode === 'pvp' ? pvpPanel(i, res) : statsPanel(i, res, ghost);
    });
  }

  /* 护甲套装：一套两条效果（2 件与 4 件），实测与作者评语写在效果身上。
     属性那一块不画——套装效果不改属性。 */
  function setDetail(i, anim) {
    var t = SR[i], fx = (T.st && T.st[i]) || [];
    var facts = [t[T_SRC], t[T_KIND], t[T_SSN]].filter(Boolean);
    // 值里有空格就加引号（「开普勒 I」「3v3 多人竞技」）：不加的话分词器在空格处
    // 切开，后半截「I」成了裸词，把开普勒 II 也搜进来。
    var qs = facts.map(function (v) {
      return (v === t[T_SSN] ? 'season:' : 'source:') + (/\s/.test(v) ? '"' + v + '"' : v);
    });
    return '<article class="wpn-one' + (anim ? ' swap' : '') + '"><header class="one-head">' +
      '<span class="set-fx lg">' + t[T_FX].map(function (f) {
        return pathImg(f[2], 2);
      }).join('') + '</span>' +
      '<div><h2>' + esc(t[T_NAME]) + '</h2><p class="en">' + esc(t[T_EN]) +
      '</p><p class="lore">' + esc(t[T_TAG]) + '</p></div><div class="one-acts"><button type="button" class="toggle" data-act="pin" aria-pressed="' +
      (isPinned('sets', i) ? 'true' : 'false') + '">' + (isPinned('sets', i) ? '已钉选' : '钉选') + '</button></div></header>' +
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

  function armorDetail(i, anim) {
    var a = AR[i], rep = a[A_REP];
    var facts = [V.cls[a[A_CLS]], V.part[a[A_PART]], '异域', 'S' + a[A_SSN]];
    var qs = ['is:' + V.cls[a[A_CLS]], 'is:' + V.part[a[A_PART]], 'is:异域', 'season:' + a[A_SSN]];
    srcsOf(a, A_SRC).forEach(function (s) { facts.push(s); qs.push('source:' + s); });
    var perks = (T.ap[rep] || []).map(function (p) {
      return '<div class="frame">' + (p[1] ? imgTag(p[1], '', '', true) : '<span></span>') + '<div><b>' + esc(p[0]) + '</b><p>' + esc(p[2]) + '</p></div></div>';
    }).join('');
    var say = T.aau[rep];
    return '<article class="wpn-one' + (anim ? ' swap' : '') + '"><header class="one-head">' + armorGun(a, 'lg', 2) + '<div><h2 class="exo">' + esc(a[A_NAME]) +
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
    if (!html || !anchor) { hideTip(); return; }
    tip.className = 'tip' + (narrow ? ' narrow' : '');
    tip.innerHTML = html;
    tip.hidden = false;
    var r = anchor.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
    var maxRight = document.documentElement.clientWidth - 8;
    if (anchor.closest('.matrix')) {
      var sideCol = body.querySelector('.one-side');
      if (sideCol) { maxRight = Math.min(maxRight, sideCol.getBoundingClientRect().left - 12); }
    }
    var x = side === 'left' ? r.left - w - 12 : r.right + 12;
    if (x + w > maxRight) { x = r.left - w - 12; }
    var y = Math.min(r.top, window.innerHeight - hgt - 8);
    if (x < 8) {
      x = Math.max(8, Math.min(r.left, maxRight - w));
      y = r.bottom + 8 + hgt <= window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - hgt - 8);
    }
    tip.style.left = (x + window.scrollX) + 'px';
    tip.style.top = (Math.max(8, y) + window.scrollY) + 'px';
  }
  var hoverAct = '', hoverKey = '', tipTimer = 0;
  function hideTip() { clearTimeout(tipTimer); tipTimer = 0; tip.hidden = true; hoverAct = ''; hoverKey = ''; }
  function leaveHover() {
    hideTip();
    S.hoverRow = null;
    if (!S.hoverPlug) { return; }
    S.hoverPlug = null;
    renderHover();
  }
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
    var ammo = V && V.am && WR[i][W_AMMO] != null ? ammoEn(V.am[WR[i][W_AMMO]][0]) : 'Primary';
    fxAll().forEach(function (f) {
      if (!fxApplies(i, f)) { return; }
      var add = fxStatVal(f, x.name);
      if (!add) { return; }
      acc += add;
      var v = shown(acc, row);
      if (v !== prev) { out.push('<tr><td>' + esc(f.name) + '</td><td class="n">' + (v > prev ? '+' : '') + (v - prev) + '</td></tr>'); }
      prev = v;
    });
    res.perks.forEach(function (p) {
      var spec = resolveAmmoSpec(perkSpec(p), ammo);
      if (!spec || !HSTAT) { return; }
      var ph = P.p[p][P_HASH];
      if (ELEMENTAL_CAPACITOR_HASHES[ph]) { return; }
      var step = AUTO_PERKS[ph] ? 0 : perkStepOf(p, ammo, false, !!(res && res.fixedMap && res.fixedMap[p]));
      if (step < 0) { return; }
      var add = 0, key;
      for (key in spec) {
        if (Object.prototype.hasOwnProperty.call(spec, key) && /^\d+$/.test(key) && HSTAT[key] == s) {
          var raw = spec[key];
          if (raw && typeof raw === 'object' && raw.f) { continue; }
          var u = raw && typeof raw === 'object' && raw.v !== undefined ? raw.v : raw;
          var val = pickStep(u, step, ammo);
          if (typeof val === 'number') {
            if (spec.h === true && ammo === 'Special' && val) { val = Math.ceil(val / 2); }
            add += val;
          }
        }
      }
      if (!add) { return; }
      acc += add;
      var v = shown(acc, row);
      if (v !== prev) { out.push('<tr><td>' + esc(plugName(p)) + '</td><td class="n">' + (v > prev ? '+' : '') + (v - prev) + '</td></tr>'); }
      prev = v;
    });
    out.push('<tr class="sum"><td>合计</td><td class="n">' + prev + '</td></tr>');
    var vEff = effStatVal(res, x);
    if (x.name === '射程') {
      var m = rangeMeters(typeName(WR[i]), frameOf(WR[i])[0], vEff, {
        zoomStat: (res.byStat[SIDX['变焦']] || {}).value || 0,
        intrinsicHash: res.intrinsicHash,
        modifiers: { rangeAllScale: res.rangeAllScale, rangeHipScale: res.rangeHipScale, rangeAdsStatAdd: res.rangeAdsStatAdd }
      });
      if (m) { out.push('<tr class="sum"><td>腰射 / 瞄准</td><td class="n">' + fmtM(m.hip) + ' / ' + fmtM(m.ads) + '</td></tr>'); }
    }
    if (x.name === '填装速度') {
      var rs = reloadSeconds(typeName(WR[i]), V.am[WR[i][W_AMMO]][0], vEff, res.reloadDurationMod, frameKey(frameOf(WR[i])[0]));
      if (rs != null) { out.push('<tr class="sum"><td>填装时间</td><td class="n">' + fmtS(rs) + '</td></tr>'); }
    }
    if (x.name === '操控性') {
      var ht = handlingTimes(typeName(WR[i]), res.intrinsicHash, vEff, res.handlingDurationMod, res.activeHashes);
      if (ht) { out.push('<tr class="sum"><td>抽出 / 收起 / 开镜</td><td class="n">' + fmtS(ht.ready) + ' / ' + fmtS(ht.stow) + ' / ' + fmtS(ht.ads) + '</td></tr>'); }
    }
    return '<h5>' + esc(x.name) + '</h5><p class="lab">显示值逐项累计</p><table>' + out.join('') + '</table>';
  }
  function mwTip(i) {
    var roll = rollOf(i), res = compute(i, roll), opt = res.mw.opt, pr = poolRow(i);
    if (!opt) { return '<h5>大师杰作</h5><p class="lab">未装配 · 点击选择大师杰作属性</p>'; }
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
    if (document.activeElement !== input) { closeAc(); return; }
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
        isMatches(S.scope, t.v).forEach(function (v) { vals.push([v, count(IS[S.scope][v])]); });
      } else if (t.k === 'frame' && S.scope === 'wpn') {
        V.fr.forEach(function (fr) {
          if (fold(fr[0]).indexOf(f) !== -1 && !vals.some(function (v) { return v[0] === fr[0]; })) {
            vals.push([fr[0], count(function (i) { return frameOf(WR[i])[0] === fr[0]; })]);
          }
        });
      } else if (t.k === 'source' && S.scope === 'sets') {
        var seenSrc = {};
        SR.forEach(function (row) {
          [row[T_SRC], row[T_KIND]].forEach(function (s) {
            if (!s || seenSrc[s] || srcFold(s).indexOf(srcFold(t.v)) === -1) { return; }
            seenSrc[s] = 1;
            vals.push([s, count(function (i) {
              return srcFold(SR[i][T_SRC] + ' ' + SR[i][T_KIND]).indexOf(srcFold(s)) !== -1;
            })]);
          });
        });
      } else if (t.k === 'source') {
        V.src.forEach(function (s, k) {
          if (fold(s).indexOf(f) !== -1) {
            vals.push([s, count(function (i) {
              var v = (S.scope === 'armor' ? AR[i][A_SRC] : WR[i][W_SRC]);
              return Array.isArray(v) ? v.indexOf(k) !== -1 : v === k;
            })]);
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
      var isv = isMatches(S.scope, t.v).map(function (v) {
        return { text: 'is:' + v, label: 'is:' + v, n: count(IS[S.scope][v]), icon: pillIcon({ t: 'kw', k: 'is', v: v }) };
      }).filter(function (x) { return x.n; });
      if (isv.length) { groups.push(['IS', isv]); }
    }
    var html = '', n = 0, acUnit = S.scope === 'armor' ? '件' : S.scope === 'sets' ? '套' : '把';
    groups.forEach(function (g) {
      html += '<li class="grp" role="presentation">' + esc(g[0]) + '</li>';
      g[1].forEach(function (it) {
        ac.items.push(it);
        html += '<li class="opt" role="option" id="wpn-ac-' + n + '" data-k="' + n + '" aria-selected="false">' +
          (it.icon || '<span></span>') + '<span>' + esc(it.label) + (it.hint ? ' <code>' + esc(it.hint) + '</code>' : '') + '</span>' +
          '<span class="n">' + (it.n >= 0 ? it.n + ' ' + acUnit : '') + '</span></li>';
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
    var want = wants(S.scope, tree), have = { pool: P, text: T };
    pending = '';
    ['pool', 'text'].forEach(function (name) {
      if (!want[name] || have[name]) { return; }
      if ((want[name] === NEED || (loads[name] && loads[name].failed)) && !pending) { pending = name; }
      /* 两份都要时先取 pool，到了重算时再取 text：两份分一条带宽，一起取会让 pool 晚到。 */
      if (waiting[name] || (loads[name] && loads[name].failed) || (name === 'text' && want.pool && !P)) { return; }
      waiting[name] = true;
      need(name, function () {
        waiting[name] = false;
        var was = pending, before = results;
        evaluate();
        if (was !== pending || !sameList(before, results)) { render(); }
      });
    });
    results = pending ? [] : run(S.scope, tree);
  }
  function renderLoadErrors() {
    loadErrors.innerHTML = ['pool', 'text'].filter(function (name) {
      return loads[name] && loads[name].failed;
    }).map(function (name) {
      return '<p class="empty" role="alert">weapons/' + name + '.js 载入失败，相关查询和详情可能不完整。 <button type="button" data-act="retry-load" data-v="' + name + '">重试</button></p>';
    }).join('');
  }
  function render() {
    renderLoadErrors();
    renderBar();
    renderPresets();
    renderConds();
    if (S.sel != null) { renderSplit(); } else { renderBrowse(); }
  }
  var typing = 0, waiting = {}, draft = null, inputEdit = null;
  function setQuery(q, push) {
    clearTimeout(typing);
    typing = 0;
    draft = null;
    inputEdit = null;
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
    if (typing) { setQuery(input.value, false); }
    var wasBrowse = (S.sel == null);
    if (wasBrowse) { S.savedScrollY = window.scrollY; }
    if (scope !== S.scope) { S.scope = scope; S.q = ''; input.value = ''; evaluate(); }
    if (S.sel !== i || S.scope !== scope) {
      S.pvpAcc = null;
      S.pvpMag = null;
      S.pvpMagBlank = false;
    }
    S.sel = i;
    S.pop = null;
    if (scope === 'wpn' && P && S.urlRoll) {
      S.rolls[WR[i][W_H]] = decodeRoll(i, S.urlRoll);
      S.urlRoll = null;
    }
    writeUrl(true);
    render();
    if (wasBrowse) { window.scrollTo(0, 0); }
  }

  /* ── 事件 ──────────────────────────────────────────────────────────── */
  input.addEventListener('beforeinput', function (e) {
    inputEdit = { value: input.value, a: input.selectionStart, b: input.selectionEnd, type: e.inputType || '' };
  });
  input.addEventListener('input', function () {
    var prev = draft ? draft.value : S.q, next = input.value;
    if (!draft) {
      draft = { value: prev, spans: tokens.map(function (t) { return { a: t.a, b: t.b, oldA: t.a, oldB: t.b }; }) };
    }
    var start = 0, end = prev.length, nextEnd = next.length;
    var maxStart = prev.length, maxSuffix = prev.length;
    if (inputEdit && inputEdit.value === prev && inputEdit.a != null && inputEdit.b != null) {
      var a = inputEdit.a, b = inputEdit.b, removed = Math.max(0, prev.length - next.length);
      if (a === b && inputEdit.type.indexOf('delete') === 0) {
        if (inputEdit.type.indexOf('Backward') !== -1) { a = Math.max(0, a - removed); }
        else { b = Math.min(prev.length, b + removed); }
      }
      maxStart = a;
      maxSuffix = prev.length - b;
    }
    while (start < maxStart && start < next.length && prev[start] === next[start]) { start++; }
    while (end > start && nextEnd > start && prev.length - end < maxSuffix && prev[end - 1] === next[nextEnd - 1]) {
      end--; nextEnd--;
    }
    var shift = nextEnd - end;
    draft.spans.forEach(function (span) {
      if (span.a == null) { return; }
      if (end <= span.a) { span.a += shift; span.b += shift; }
      else if (start < span.b) { span.a = null; span.b = null; }
    });
    draft.value = next;
    inputEdit = null;
    closeAc();
    clearTimeout(typing);
    typing = setTimeout(function () { typing = 0; setQuery(input.value, false); suggest(); }, 120);
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

  /* 按 / 聚焦查询框（不在输入框里时才拦），Esc 收起细分的下拉与语法卡片 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closePops();
      if (S.syntax) { S.syntax = false; renderBar(); }
      if (S.pop) {
        var prev = S.pop;
        S.pop = null;
        renderDetail();
        var btn = body.querySelector('[data-act="' + prev + 'slot"]');
        if (btn) { btn.focus(); }
      }
      if (S.fxOpen) { S.fxOpen = false; S.fxg = ''; renderDetail(); }
      return;
    }
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) { return; }
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { return; }
    e.preventDefault();
    input.focus();
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) {
      closePops();
      if (S.pop && !e.target.closest('.picker')) { S.pop = null; renderDetail(); }
      if (S.syntax && !e.target.closest('.wpn-syntax')) { S.syntax = false; renderBar(); }
      if (S.fxOpen && !e.target.closest('.fx-side')) { S.fxOpen = false; S.fxg = ''; renderDetail(); }
      return;
    }
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
    var i = S.sel;
    if (S.fxOpen && !e.target.closest('.fx-side')) { S.fxOpen = false; S.fxg = ''; }
    if (act !== 'drop' && !el.closest('.grp')) { closePops(); }
    if (typing && (act === 'preset' || act === 'facet' || act === 'sxval' || act === 'refine' || act === 'addq')) {
      setQuery(input.value, false);
    }
    switch (act) {
      case 'retry-load':
        var wasPending = pending, beforeRetry = results;
        need(v, function () {
          if (v === 'pool' && S.scope === 'wpn' && S.sel != null && S.urlRoll) {
            S.rolls[WR[S.sel][W_H]] = decodeRoll(S.sel, S.urlRoll);
            S.urlRoll = null;
          }
          var was = pending, before = results;
          evaluate();
          if (was !== pending || !sameList(before, results)) { render(); }
          else {
            renderLoadErrors();
            if (S.sel != null) { renderDetail(); }
          }
        }, true);
        evaluate();
        if (wasPending !== pending || wasPending === v || !sameList(beforeRetry, results)) { render(); }
        else {
          renderLoadErrors();
          if (S.sel != null) { renderDetail(); }
        }
        return;
      case 'drop': {
        var was = el.getAttribute('aria-expanded') === 'true';
        closePops();
        if (!was) { el.setAttribute('aria-expanded', 'true'); el.nextElementSibling.hidden = false; }
        return;
      }
      case 'scope':
        if (v !== S.scope) { S.scope = v; S.q = ''; S.sel = null; S.savedScrollY = 0; input.value = ''; setQuery('', true); }
        return;
      case 'view':
        S.view = v; store('wpn.view', v); S.sel = null; writeUrl(true); render(); return;
      case 'close':
        S.sel = null; writeUrl(true); render(); window.scrollTo(0, S.savedScrollY || 0); return;
      case 'syntax':
        e.stopPropagation(); S.syntax = !S.syntax; renderBar(); return;
      case 'setq':
        S.syntax = false; S.sel = null; S.savedScrollY = 0; input.value = v; setQuery(v, true); return;
      case 'preset':
      case 'facet':
      case 'sxval':
      case 'refine':
        if (e.shiftKey && (act === 'facet' || act === 'refine')) { addToken('-' + v); return; }
        input.value = toggled(S.q, v, el.getAttribute('data-g'));
        setQuery(input.value, false);
        return;
      case 'clear':
        S.savedScrollY = 0; input.value = ''; setQuery('', false); return;
      case 'addq':
        S.sel = null; S.savedScrollY = 0; addToken(v); writeUrl(true); render(); window.scrollTo(0, 0); return;
      case 'unpill': {
        var a = +el.getAttribute('data-a'), b = +el.getAttribute('data-b');
        var span = draft && draft.spans.filter(function (s) { return s.oldA === a && s.oldB === b; })[0];
        var q = draft ? draft.value : S.q;
        var nq = span ? (span.a == null ? q : q.slice(0, span.a) + q.slice(span.b)) : (draft ? q : q.slice(0, a) + q.slice(b));
        if (!draft) { nq = nq.replace(/\s+/g, ' ').trim(); }
        input.value = nq; setQuery(nq, false); return;
      }
      case 'open':
        if (e.metaKey || e.ctrlKey || e.shiftKey) { return; }
        e.preventDefault();
        open(el.getAttribute('data-scope') || S.scope, +el.getAttribute('data-i'));
        return;
      case 'pin': {
        var key = pinKey(S.scope, i);
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
      case 'resetroll':
        delete S.rolls[WR[i][W_H]];
        store('wpn.rolls', S.rolls);
        S.pop = null;
        S.hoverPlug = null;
        hideTip();
        writeUrl(false);
        renderDetail();
        return;
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
      case 'statsmode':
        S.statsMode = v; renderDetail(); return;
      case 'pvpreset': {
        S.pvpAcc = null;
        refreshPvpNumbers();
        return;
      }
      case 'pvpmagreset': {
        S.pvpMag = null;
        S.pvpMagBlank = false;
        refreshPvpNumbers();
        return;
      }
      case 'pvpstatreset': {
        S.pvpStat = 0;
        refreshPvpNumbers();
        return;
      }
      case 'fx': {
        var ix = S.fx.indexOf(v);
        if (ix >= 0) { S.fx.splice(ix, 1); delete S.fxStep[v]; }
        else { S.fx.push(v); S.fxStep[v] = 0; }
        renderDetail(); return;
      }
      case 'fxstep': {
        var ns = +el.getAttribute('data-n') || 1;
        S.fxStep[v] = ((S.fxStep[v] || 0) + 1) % ns;
        renderDetail(); return;
      }
      case 'perkcolstep': {
        e.stopPropagation();
        var pIdx = +v, tot = +el.getAttribute('data-n') || 1, isFixedCol = el.getAttribute('data-fixed') === '1';
        var ammoStr = S.sel != null ? ammoEn(V.am[WR[S.sel][W_AMMO]][0]) : 'Primary';
        var ph = String(P.p[pIdx][P_HASH]);
        var cur = perkStepOf(pIdx, ammoStr, false, isFixedCol);
        if (cur < 0) { S.perkStep[ph] = tot > 0 ? 0 : -1; }
        else if (cur + 1 < tot) { S.perkStep[ph] = cur + 1; }
        else { S.perkStep[ph] = -1; }
        renderDetail(); return;
      }
      case 'perkstep': {
        var n = +el.getAttribute('data-n') || 1, isPI = el.getAttribute('data-pi') === '1';
        var ammoS = S.sel != null ? ammoEn(V.am[WR[S.sel][W_AMMO]][0]) : 'Primary';
        var pI = PIDX[+v], curS = pI != null ? perkStepOf(pI, ammoS) : (S.perkStep[v] || 0);
        S.perkStep[v] = isPI ? (curS + 2) % (n + 1) - 1 : (curS + 1) % n;
        renderDetail(); return;
      }
      case 'fxopen':
        e.stopPropagation();
        S.fxOpen = !S.fxOpen;
        if (!S.fxOpen) { S.fxg = ''; }
        renderDetail(); return;
      case 'fxg':
        S.fxg = S.fxg === v ? '' : v;
        renderDetail(); return;

    }
  });
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) { return; }
    var act = el.getAttribute('data-act');
    if (act === 'pvpacc') { S.pvpAcc = +el.value; refreshPvpNumbers(); }
    if (act === 'pvpstat') { S.pvpStat = +el.value; refreshPvpNumbers(); }
    if (act === 'pvpstatnum') {
      var raw = String(el.value || '');
      if (raw === '' || !/^\d+$/.test(raw)) { return; }
      var num = +raw;
      if (num > 200) { return; }
      S.pvpStat = num; refreshPvpNumbers();
    }
    if (act === 'pvpmag') { S.pvpMag = +el.value; S.pvpMagBlank = false; refreshPvpNumbers(); }
    if (act === 'pvpmagnum') {
      var mRaw = String(el.value || '');
      if (mRaw === '') { S.pvpMagBlank = true; el.style.width = '1ch'; return; }
      if (!/^\d+$/.test(mRaw)) { return; }
      var maxM = +el.max || 999, mNum = +mRaw;
      if (mNum < 1 || mNum > maxM) { return; }
      S.pvpMagBlank = false; S.pvpMag = mNum; el.style.width = String(mNum).length + 'ch'; refreshPvpNumbers();
    }
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) { return; }
    var act = el.getAttribute('data-act');
    if ((act === 'pvpmagnum' || act === 'pvpstatnum') && el.select) { el.select(); }
  });
  document.addEventListener('focusout', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) { return; }
    var act = el.getAttribute('data-act');
    if (act === 'pvpstatnum') { el.value = String(S.pvpStat); }
    if (act === 'pvpmagnum') { S.pvpMagBlank = false; refreshPvpNumbers(); }
  });
  document.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || e.key !== 'Enter') { return; }
    var act = el.getAttribute('data-act');
    if (act === 'pvpstatnum' || act === 'pvpmagnum') { el.blur(); }
  });
  document.addEventListener('wheel', function (e) {
    var el = e.target;
    if (!el.classList || (!el.classList.contains('pvp-crit-range') && !el.classList.contains('pvp-weapon-stat-range'))) { return; }
    e.preventDefault();
    var min = +el.min, max = +el.max, n = Math.max(min, Math.min(max, +el.value + (e.deltaY > 0 ? -1 : 1)));
    if (n === +el.value) { return; }
    el.value = n;
    var act = el.getAttribute('data-act');
    if (act === 'pvpacc') { S.pvpAcc = n; }
    else if (act === 'pvpmag') { S.pvpMag = n; S.pvpMagBlank = false; }
    else { S.pvpStat = n; }
    refreshPvpNumbers();
  }, { passive: false, capture: true });


  /* 悬停：词条出说明并在属性条上预览；属性行出分解；结果栏的行在详情区预览。

     **关浮层在 mouseover 里判，不靠 mouseout。**悬停词条要重画属性表，指针下那一行
     被换成新节点；指针再移出去时，浏览器不给已经移除的旧节点发 mouseout，浮层就一直
     显示着。mouseover 总是发给指针下现在那个节点，落到别的种类上（或没有 data-act 的
     地方）就关掉。同一枚词条只重画一次：已选中的那一枚预览为空，按 hoverPlug 判会在
     每次 mouseover 都重画。 */
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest('[data-act]');
    var act = el ? el.getAttribute('data-act') : '';
    /* 指针下的节点已被重画替换时，等下一个 mouseover：指针一动，浏览器就发给新换上的那个节点。 */
    if (hoverAct && act !== hoverAct) {
      leaveHover();
      if (el && !el.isConnected) { return; }
    }
    if (!el || S.sel == null || S.scope !== 'wpn' || !P) { return; }
    var i = S.sel;
    if (act === 'perk') {
      var col = +el.getAttribute('data-col'), plug = +el.getAttribute('data-plug'), key = col + ':' + plug;
      if (hoverKey !== key) {
        var roll = rollOf(i);
        S.hoverPlug = roll.sel[col] === plug ? null : { col: col, plug: plug };
        renderHover();
        showTip(perkTip(i, col, plug), el);
        hoverAct = act;
        hoverKey = key;
      }
    } else if (act === 'statrow') {
      var s = +el.getAttribute('data-s');
      if (hoverKey !== 's' + s) {
        S.hoverRow = s;
        hoverAct = act;
        hoverKey = 's' + s;
        clearTimeout(tipTimer);
        tipTimer = setTimeout(function () {
          if (hoverKey !== 's' + s || !el.isConnected) { return; }
          showTip(statTip(i, s), el, 'left', true);
        }, 180);
      }
    } else if (act === 'mwslot' && !S.pop) {
      showTip(mwTip(i), el);
      hoverAct = act;
    } else if (act === 'artmod') {
      showTip(amodTip(+el.getAttribute('data-v')), el);
      hoverAct = act;
    } else if (act === 'modpick') {
      var p = +el.getAttribute('data-v');
      if (p >= 0) { showTip(modTip(p), el); hoverAct = act; } else { leaveHover(); }
    }
  });
  /* 指针移出窗口时没有下一个 mouseover，只能在这里关掉。 */
  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget && hoverAct) { leaveHover(); }
  });
  var focusEl = null;
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || !el.matches || !el.matches(':focus-visible') || S.sel == null || S.scope !== 'wpn' || !P) { return; }
    var act = el.getAttribute('data-act'), i = S.sel;
    if (act === 'perk') {
      var col = +el.getAttribute('data-col'), plug = +el.getAttribute('data-plug');
      var roll = rollOf(i);
      S.hoverPlug = roll.sel[col] === plug ? null : { col: col, plug: plug };
      renderHover();
      showTip(perkTip(i, col, plug), el);
      hoverAct = act;
      hoverKey = col + ':' + plug;
      focusEl = el;
    } else if (act === 'mwslot' && !S.pop) {
      showTip(mwTip(i), el);
      hoverAct = act;
      focusEl = el;
    } else if (act === 'artmod') {
      showTip(amodTip(+el.getAttribute('data-v')), el);
      hoverAct = act;
      focusEl = el;
    } else if (act === 'modpick') {
      var p = +el.getAttribute('data-v');
      if (p >= 0) { showTip(modTip(p), el); hoverAct = act; focusEl = el; }
    }
  });
  document.addEventListener('focusout', function (e) {
    if (focusEl && e.target === focusEl) {
      focusEl = null;
      leaveHover();
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
    clearTimeout(typing);
    typing = 0;
    draft = null;
    inputEdit = null;
    closeAc();
    var wasSel = (S.sel != null);
    readUrl();
    input.value = S.q;
    evaluate();
    if (S.sel != null && S.scope === 'wpn' && S.urlRoll) {
      need('pool', function () {
        if (S.scope === 'wpn' && S.sel != null && S.urlRoll) {
          S.rolls[WR[S.sel][W_H]] = decodeRoll(S.sel, S.urlRoll);
          S.urlRoll = null;
          renderDetail();
        }
      });
    }
    render();
    if (wasSel && S.sel == null) { window.scrollTo(0, S.savedScrollY || 0); }
  });

  /* ── 开屏 ──────────────────────────────────────────────────────────── */
  readUrl();
  /* 查询框写在页壳里，脚本到之前读者可能已经敲了字：地址栏没带查询时接着用它。 */
  if (!S.q && input.value) { S.q = input.value; writeUrl(false); }
  input.value = S.q;
  evaluate();
  if (S.sel != null && S.scope === 'wpn' && S.urlRoll) {
    need('pool', function () {
      if (S.scope === 'wpn' && S.sel != null && S.urlRoll) {
        S.rolls[WR[S.sel][W_H]] = decodeRoll(S.sel, S.urlRoll);
        S.urlRoll = null;
        renderDetail();
      }
    });
  }
  render();
  /* 词条池等 load 之后再取：先取会与首屏的图抢带宽，load 也要等它下完。说明不预取。 */
  window.addEventListener('load', function () { need('pool'); });

}());
