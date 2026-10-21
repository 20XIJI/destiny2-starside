/* 护甲 3.0 商人属性机制与机灵聚焦推算器（老九页精简版）
   数据依据：odo《Reverse Engineering Armor3 Rolls》与 Bungie DestinyPlugSetDefinition
   - 原型插槽池（1315181101）：12 种护甲原型，决定 +30 与 +25 属性
   - 第三属性插槽池（445741600）：6 项属性固定顺序，剔除前两项后余下 4 项对应 t.map = 1..4（+20）
   - 23 列权重矩阵（X = 1..23）与 12 列无模组等权分布（Y = 1..12）共用同一底层随机数 t ∈ [0, 1) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArmorRng = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 6 项护甲属性（内部顺序严格对应 plugSet 445741600；图标取自 game-mechanics 护甲属性表）
  var STATS = [
    { id: 1, key: 'weapons', name: '武器', en: 'Weapons', hash: 2041822466, icon: '../game-mechanics/icons/05a8b352f5.webp' },
    { id: 2, key: 'health', name: '生命', en: 'Health', hash: 465064626, icon: '../game-mechanics/icons/23436efaf2.webp' },
    { id: 3, key: 'grenade', name: '手雷', en: 'Grenade', hash: 2498433744, icon: '../game-mechanics/icons/2f4b2db5b2.webp' },
    { id: 4, key: 'super', name: '超能', en: 'Super', hash: 1370696622, icon: '../game-mechanics/icons/dbb19646f3.webp' },
    { id: 5, key: 'class', name: '职业', en: 'Class', hash: 627959594, icon: '../game-mechanics/icons/be08cadded.webp' },
    { id: 6, key: 'melee', name: '近战', en: 'Melee', hash: 462856101, icon: '../game-mechanics/icons/3a3d08caaf.webp' }
  ];

  // 12 种护甲原型（内部顺序严格对应 plugSet 1315181101）
  var ARCHETYPES = [
    { id: 1, name: '楷模典范', shortName: '楷模', en: 'Paragon', hash: 4227065942, primary: 4, secondary: 6, icon: 'a7520cb2f31ec33730b77cdb78e058a5.webp' },
    { id: 2, name: '堡垒', shortName: '堡垒', en: 'Bulwark', hash: 549468645, primary: 2, secondary: 5, icon: '301b534fef656d07ee6486b17f1e9ce0.webp' },
    { id: 3, name: '掷雷手', shortName: '掷雷手', en: 'Grenadier', hash: 2937665788, primary: 3, secondary: 4, icon: '5edbc054d836cc9f8504e938bd0c0a35.webp' },
    { id: 4, name: '搏击手', shortName: '搏击手', en: 'Brawler', hash: 3349393475, primary: 6, secondary: 2, icon: 'fe487c4b4ad9a64f597df822d9f098b2.webp' },
    { id: 5, name: '枪手', shortName: '枪手', en: 'Gunner', hash: 1807652646, primary: 1, secondary: 3, icon: 'd50bb589a2497a809716093ca7ea5300.webp' },
    { id: 6, name: '专家', shortName: '专家', en: 'Specialist', hash: 2230428468, primary: 5, secondary: 1, icon: '859a93ee38aa9cf96d96c8a4b55d59a4.webp' },
    { id: 7, name: '掠夺者', shortName: '掠夺者', en: 'Reaver', hash: 351770835, primary: 5, secondary: 6, icon: '859a93ee38aa9cf96d96c8a4b55d59a4.webp' },
    { id: 8, name: '突围者', shortName: '突围者', en: 'Siegebreaker', hash: 2503381935, primary: 2, secondary: 3, icon: '301b534fef656d07ee6486b17f1e9ce0.webp' },
    { id: 9, name: '爆破专家', shortName: '爆破专家', en: 'Demolitionist', hash: 2222960133, primary: 3, secondary: 5, icon: '5edbc054d836cc9f8504e938bd0c0a35.webp' },
    { id: 10, name: '突击手', shortName: '突击手', en: 'Skirmisher', hash: 1687144140, primary: 6, secondary: 1, icon: 'fe487c4b4ad9a64f597df822d9f098b2.webp' },
    { id: 11, name: '高能者', shortName: '高能者', en: 'Powerhouse', hash: 544009373, primary: 1, secondary: 4, icon: 'd50bb589a2497a809716093ca7ea5300.webp' },
    { id: 12, name: '装甲兵', shortName: '装甲兵', en: 'Colossus', hash: 1418248448, primary: 4, secondary: 2, icon: 'a7520cb2f31ec33730b77cdb78e058a5.webp' }
  ];

  for (var ai = 0; ai < ARCHETYPES.length; ai++) {
    var archObj = ARCHETYPES[ai];
    archObj.pri = archObj.primary;
    archObj.sec = archObj.secondary;
    archObj.primaryStat = STATS[archObj.primary - 1];
    archObj.secondaryStat = STATS[archObj.secondary - 1];
    archObj.tert = [];
    for (var si = 1; si <= 6; si++) {
      if (si !== archObj.primary && si !== archObj.secondary) archObj.tert.push(si);
    }
    archObj.pairLabel = '主' + archObj.primaryStat.name + ' · 副' + archObj.secondaryStat.name;
  }

  // TERTIARY_MAP[tMap - 1][archId - 1] -> statId (1..6)
  var TERTIARY_MAP = [1, 2, 3, 4].map(function (tIdx) {
    return ARCHETYPES.map(function (arch) {
      return arch.tert[tIdx - 1];
    });
  });

  // X_MAP[ghostModId - 1][x - 1] -> resulting archetypeId (1..12)
  var X_MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 12],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]
  ];

  var Y_TO_X = [
    [1, 2],
    [2, 3, 4],
    [4, 5, 6],
    [6, 7, 8],
    [8, 9, 10],
    [10, 11, 12],
    [12, 13, 14],
    [14, 15, 16],
    [16, 17, 18],
    [18, 19, 20],
    [20, 21, 22],
    [22, 23]
  ];

  var X_TO_Y = [];
  for (var xi = 1; xi <= 23; xi++) {
    var ys = [];
    for (var yi = 1; yi <= 12; yi++) {
      if (Y_TO_X[yi - 1].indexOf(xi) !== -1) ys.push(yi);
    }
    X_TO_Y.push(ys);
  }

  function statById(id) {
    return STATS[id - 1] || null;
  }

  // 界面展示的 6 列属性顺序（对齐游戏内角色面板：生命 · 近战 · 手雷 · 超能 · 职业 · 武器）
  var UI_STATS = [2, 6, 3, 4, 5, 1].map(statById);

  function statIdOf(v) {
    if (typeof v === 'number') return (v >= 1 && v <= 6) ? v : 0;
    for (var i = 0; i < STATS.length; i++) {
      if (STATS[i].name === v || STATS[i].en === v || STATS[i].key === v) return STATS[i].id;
    }
    return 0;
  }

  function archById(id) {
    return ARCHETYPES[id - 1] || null;
  }

  function archIdOf(v) {
    if (typeof v === 'number') return (v >= 1 && v <= 12) ? v : 0;
    for (var i = 0; i < ARCHETYPES.length; i++) {
      if (ARCHETYPES[i].name === v || ARCHETYPES[i].shortName === v || ARCHETYPES[i].en === v) {
        return ARCHETYPES[i].id;
      }
    }
    return 0;
  }

  function archByPrimarySecondary(priId, secId) {
    for (var i = 0; i < ARCHETYPES.length; i++) {
      if (ARCHETYPES[i].primary === priId && ARCHETYPES[i].secondary === secId) {
        return ARCHETYPES[i];
      }
    }
    return null;
  }

  function archsByPrimary(priId) {
    return ARCHETYPES.filter(function (a) { return a.primary === priId; });
  }

  function tMapOf(arch, tert) {
    var aId = archIdOf(arch);
    var sId = statIdOf(tert);
    if (!aId || !sId) return 0;
    for (var t = 1; t <= 4; t++) {
      if (TERTIARY_MAP[t - 1][aId - 1] === sId) return t;
    }
    return 0;
  }

  function tertStatOf(arch, tMap) {
    var aId = archIdOf(arch);
    if (!aId || tMap < 1 || tMap > 4) return null;
    return statById(TERTIARY_MAP[tMap - 1][aId - 1]);
  }

  function rollOf(arch, tMap) {
    var a = archById(archIdOf(arch));
    var tert = tertStatOf(arch, tMap);
    if (!a || !tert) return null;
    var p = statById(a.primary);
    var s = statById(a.secondary);
    var values = {};
    for (var i = 0; i < STATS.length; i++) {
      var st = STATS[i];
      if (st.id === p.id) values[st.key] = 30;
      else if (st.id === s.id) values[st.key] = 25;
      else if (st.id === tert.id) values[st.key] = 20;
      else values[st.key] = 5;
    }
    return {
      arch: a,
      primary: p,
      secondary: s,
      tert: tert,
      tMap: tMap,
      values: values
    };
  }

  function xOfGhost(ghostModId, x) {
    if (ghostModId < 1 || ghostModId > 12 || x < 1 || x > 23) return 0;
    return X_MAP[ghostModId - 1][x - 1];
  }

  function pcToX(paragonArch, colossusArch) {
    var p = archIdOf(paragonArch);
    var c = archIdOf(colossusArch);
    for (var x = 1; x <= 23; x++) {
      if (X_MAP[0][x - 1] === p && X_MAP[11][x - 1] === c) return x;
    }
    return 0;
  }

  function yToXList(y) {
    var yId = archIdOf(y);
    return yId ? Y_TO_X[yId - 1].slice() : [];
  }

  function xToYList(x) {
    return (x >= 1 && x <= 23) ? X_TO_Y[x - 1].slice() : [];
  }

  function solveFromObservations(observations) {
    var obs = (observations || []).filter(function (o) {
      return o && archIdOf(o.archId) > 0;
    });
    if (!obs.length) {
      return { ambiguous: true, candidates: [] };
    }

    var possibleT = [1, 2, 3, 4];
    for (var i = 0; i < obs.length; i++) {
      if (obs[i].tertStat) {
        var tm = tMapOf(obs[i].archId, obs[i].tertStat);
        if (!tm) return { ambiguous: false, candidates: [] };
        possibleT = possibleT.filter(function (t) { return t === tm; });
      }
    }
    if (!possibleT.length) return { ambiguous: false, candidates: [] };

    var candidates = [];
    for (var x = 1; x <= 23; x++) {
      var ys = xToYList(x);
      var matchX = true;
      var matchedY = ys[0];
      for (var j = 0; j < obs.length; j++) {
        var mId = Number(obs[j].modId || 0);
        var aId = archIdOf(obs[j].archId);
        if (mId === 0) {
          if (ys.indexOf(aId) === -1) {
            matchX = false;
            break;
          }
          matchedY = aId;
        } else {
          if (xOfGhost(mId, x) !== aId) {
            matchX = false;
            break;
          }
        }
      }
      if (!matchX) continue;

      for (var k = 0; k < possibleT.length; k++) {
        var tMap = possibleT[k];
        var outcomes = [];
        for (var g = 0; g <= 12; g++) {
          var outArchId = (g === 0) ? matchedY : xOfGhost(g, x);
          var r = rollOf(outArchId, tMap);
          outcomes.push({
            modId: g,
            modName: g === 0 ? '未装模组' : archById(g).name,
            archId: outArchId,
            arch: r.arch,
            tert: r.tert,
            tertStat: r.tert.name,
            primaryStat: r.primary.name,
            secondaryStat: r.secondary.name,
            tMap: tMap,
            values: r.values
          });
        }
        candidates.push({
          X: x,
          Y: matchedY,
          yList: ys,
          tMap: tMap,
          outcomes: outcomes
        });
      }
    }

    return {
      ambiguous: candidates.length > 1,
      candidates: candidates
    };
  }

  function groupOutcomes(candidates) {
    if (!candidates || !candidates.length) return [];
    var totalCands = candidates.length;
    var tMap = candidates[0].tMap;
    var byArch = {};

    for (var g = 0; g <= 12; g++) {
      var counts = {};
      for (var c = 0; c < totalCands; c++) {
        var out = candidates[c].outcomes[g];
        counts[out.archId] = (counts[out.archId] || 0) + 1;
      }
      for (var aKey in counts) {
        if (!Object.prototype.hasOwnProperty.call(counts, aKey)) continue;
        var aId = Number(aKey);
        if (!byArch[aId]) {
          var r = rollOf(aId, tMap);
          byArch[aId] = {
            archId: aId,
            arch: r.arch,
            primary: r.primary,
            secondary: r.secondary,
            tert: r.tert,
            tMap: tMap,
            roll: r,
            certainMods: [],
            possibleMods: [],
            selfModCertain: false,
            selfModPossible: false
          };
        }
        var hits = counts[aKey];
        var gArch = g === 0 ? null : archById(g);
        var modInfo = {
          modId: g,
          name: g === 0 ? '不插模组' : gArch.pairLabel,
          isSelf: g === aId,
          hits: hits,
          total: totalCands
        };
        if (hits === totalCands) {
          byArch[aId].certainMods.push(modInfo);
          if (g === aId) byArch[aId].selfModCertain = true;
        } else {
          byArch[aId].possibleMods.push(modInfo);
          if (g === aId) byArch[aId].selfModPossible = true;
        }
      }
    }

    var groups = [];
    for (var id = 1; id <= 12; id++) {
      if (!byArch[id]) continue;
      var item = byArch[id];
      item.certain = item.certainMods.length > 0;
      groups.push(item);
    }
    return groups;
  }

  function allCombos() {
    var list = [];
    for (var a = 1; a <= 12; a++) {
      for (var t = 1; t <= 4; t++) {
        var r = rollOf(a, t);
        list.push({
          archId: a,
          tMap: t,
          tertId: r.tert.id,
          roll: r
        });
      }
    }
    return list;
  }

  function rollMatchesPriority(roll, prioIds, strictOrder) {
    if (!prioIds || !prioIds.length) return true;
    var topIds = [roll.primary.id, roll.secondary.id, roll.tert.id];
    if (strictOrder) {
      for (var i = 0; i < prioIds.length; i++) {
        if (prioIds[i] && topIds[i] !== prioIds[i]) return false;
      }
      return true;
    }
    for (var j = 0; j < prioIds.length; j++) {
      if (prioIds[j] && topIds.indexOf(prioIds[j]) === -1) return false;
    }
    return true;
  }

  function filterCombosByPriority(prioStats) {
    var ids = (prioStats || []).map(statIdOf).filter(Boolean);
    var all = allCombos();
    if (!ids.length) return [];
    var scored = [];
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      var r = c.roll;
      var topIds = [r.primary.id, r.secondary.id, r.tert.id];
      var allInTop = true;
      for (var j = 0; j < ids.length; j++) {
        if (topIds.indexOf(ids[j]) === -1) {
          allInTop = false;
          break;
        }
      }
      if (!allInTop) continue;
      var exact = true;
      for (var k = 0; k < ids.length; k++) {
        if (topIds[k] !== ids[k]) {
          exact = false;
          break;
        }
      }
      var score = 0;
      if (exact) score += 1000;
      for (var m = 0; m < ids.length; m++) {
        if (r.primary.id === ids[m]) score += (3 - m) * 30;
        else if (r.secondary.id === ids[m]) score += (3 - m) * 20;
        else if (r.tert.id === ids[m]) score += (3 - m) * 10;
      }
      scored.push({
        archId: c.archId,
        tMap: c.tMap,
        tertId: c.tertId,
        arch: r.arch,
        tertStat: r.tert.name,
        roll: r,
        exactOrder: exact,
        primaryHit: r.primary.id === ids[0],
        score: score
      });
    }
    scored.sort(function (a, b) {
      return b.score - a.score || a.archId - b.archId || a.tMap - b.tMap;
    });
    return scored;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatModAction(group) {
    var selfLabel = group.arch.pairLabel;
    if (group.selfModCertain) {
      return '机灵插：' + selfLabel;
    }
    var nonZeroCertain = group.certainMods.filter(function (m) { return m.modId > 0; });
    if (nonZeroCertain.length) {
      return '机灵插：' + nonZeroCertain[0].name;
    }
    if (group.certainMods.length && group.certainMods[0].modId === 0) {
      return '不插机灵模组直接买';
    }
    if (group.selfModPossible) {
      return '机灵插：' + selfLabel;
    }
    if (group.possibleMods.length) {
      return '机灵插：' + group.possibleMods[0].name;
    }
    return '';
  }

  function mount(host, opts) {
    if (!host || typeof document === 'undefined') return null;
    var options = opts || {};
    var state = {
      itemName: options.itemName || '',
      // ① 看老九时我机灵插着的模组（0 = 未装护甲模组）
      mod1: 0,
      // ② 老九当前护甲的三档属性（默认：+30 生命 / +25 手雷 / +20 超能）
      pri1: 2,
      sec1: 3,
      tert1: 4,
      // ③ 目标属性筛选（最多 3 项，可空）
      prio: []
    };

    function currentArch() {
      var a = archByPrimarySecondary(state.pri1, state.sec1);
      if (!a) {
        var pair = archsByPrimary(state.pri1);
        a = pair[0] || ARCHETYPES[0];
        state.sec1 = a.secondary;
      }
      if (state.tert1 === state.pri1 || state.tert1 === state.sec1) {
        state.tert1 = a.tert[0];
      }
      return a;
    }

    function render() {
      var arch1 = currentArch();
      var tMap1 = tMapOf(arch1.id, state.tert1);
      var baseRoll = rollOf(arch1.id, tMap1);
      var res = solveFromObservations([{ modId: state.mod1, archId: arch1.id, tertStat: state.tert1 }]);
      var groups = groupOutcomes(res.candidates);
      var isSameModHit = state.mod1 > 0 && state.mod1 === arch1.id;

      // ① 看老九时我机灵插着什么模组？（左脊：未装护甲模组；右六列 × 二行：按六项主属性对齐的 12 种 主XX·副YY）
      var modPairCells = '';
      for (var rIdx = 0; rIdx < 2; rIdx++) {
        for (var cIdx = 0; cIdx < UI_STATS.length; cIdx++) {
          var pairArch = archsByPrimary(UI_STATS[cIdx].id)[rIdx];
          var isModOn = state.mod1 === pairArch.id;
          modPairCells += (
            '<button type="button" class="ar-mod-btn' + (isModOn ? ' is-on' : '') + '" data-pick-mod="' + pairArch.id + '">' +
              '<img class="ar-stat-ico" src="' + pairArch.primaryStat.icon + '" alt="" width="13" height="13" decoding="async">' +
              '<span class="ar-mod-p">主' + esc(pairArch.primaryStat.name) + '</span>' +
              '<span class="ar-mod-s">副' + esc(pairArch.secondaryStat.name) + '</span>' +
            '</button>'
          );
        }
      }
      var mod1MatrixHtml = (
        '<button type="button" class="ar-mod-btn ar-mod-unmod' + (state.mod1 === 0 ? ' is-on' : '') + '" data-pick-mod="0">' +
          '<span class="ar-unmod-main">未装护甲模组</span>' +
          '<span class="ar-unmod-sub">裸看老九 · 推荐</span>' +
        '</button>' +
        modPairCells
      );

      // ② 老九这件护甲当前的 +30 / +25 / +20 三行点选（6 × 6 × 6 固定六列对齐）
      var priBtns = UI_STATS.map(function (st) {
        var isOn = st.id === state.pri1;
        return (
          '<button type="button" class="ar-chip is-p' + (isOn ? ' is-on' : '') + '" data-pick-pri="' + st.id + '">' +
            '<img class="ar-stat-ico" src="' + st.icon + '" alt="" width="14" height="14" decoding="async">' +
            '<span class="ar-val">+30</span><span class="ar-stat">' + esc(st.name) + '</span>' +
          '</button>'
        );
      }).join('');

      var validSecIds = archsByPrimary(state.pri1).map(function (a) { return a.secondary; });
      var secBtns = UI_STATS.map(function (st) {
        var isOn = st.id === state.sec1;
        var isValid = validSecIds.indexOf(st.id) !== -1;
        var hint = isValid ? '' : (' title="主' + esc(statById(state.pri1).name) + '固定搭配副' + esc(statById(validSecIds[0]).name) + '或副' + esc(statById(validSecIds[1]).name) + '，点击将自动切换对应主属性"');
        return (
          '<button type="button" class="ar-chip is-s' + (isOn ? ' is-on' : '') + (!isValid ? ' is-dim' : '') + '" data-pick-sec="' + st.id + '"' + hint + '>' +
            '<img class="ar-stat-ico" src="' + st.icon + '" alt="" width="14" height="14" decoding="async">' +
            '<span class="ar-val">+25</span><span class="ar-stat">' + esc(st.name) + '</span>' +
          '</button>'
        );
      }).join('');

      var tertBtns = UI_STATS.map(function (st) {
        var isOn = st.id === state.tert1;
        var isValid = arch1.tert.indexOf(st.id) !== -1;
        var hint = isValid ? '' : ' title="该属性已被当前主/副属性占用，点击将自动调整主/副属性"';
        return (
          '<button type="button" class="ar-chip is-t' + (isOn ? ' is-on' : '') + (!isValid ? ' is-dim' : '') + '" data-pick-tert="' + st.id + '"' + hint + '>' +
            '<img class="ar-stat-ico" src="' + st.icon + '" alt="" width="14" height="14" decoding="async">' +
            '<span class="ar-val">+20</span><span class="ar-stat">' + esc(st.name) + '</span>' +
          '</button>'
        );
      }).join('');

      // 同款模组命中提示
      var sameModHtml = '';
      if (isSameModHit) {
        sameModHtml = (
          '<div class="ar-same-mod-banner">' +
            '<span><b>当前机灵模组已命中这件护甲的主副属性</b>——直接购买即为 <b>+30 ' + esc(baseRoll.primary.name) + ' · +25 ' + esc(baseRoll.secondary.name) + ' · +20 ' + esc(baseRoll.tert.name) + '</b>。若需推算其余可洗组合，请先摘下机灵护甲模组再查看老九。</span>' +
          '</div>'
        );
      }

      // ③ 属性筛选 + 结果卡片
      var prioChips = UI_STATS.map(function (st) {
        var idx = state.prio.indexOf(st.id);
        var tag = idx === 0 ? '①' : (idx === 1 ? '②' : (idx === 2 ? '③' : ''));
        return (
          '<button type="button" class="ar-filter-btn' + (idx !== -1 ? ' is-on rank-' + (idx + 1) : '') + '" data-prio-stat="' + st.id + '">' +
            '<img class="ar-stat-ico" src="' + st.icon + '" alt="" width="14" height="14" decoding="async">' +
            '<span>' + esc(st.name) + '</span>' +
            (tag ? '<b class="ar-rank-tag">' + tag + '</b>' : '') +
          '</button>'
        );
      }).join('');

      var sortedGroups = groups.slice().sort(function (a, b) {
        var aHit = state.prio.length ? (rollMatchesPriority(a.roll, state.prio, true) ? 2 : (rollMatchesPriority(a.roll, state.prio, false) ? 1 : 0)) : 0;
        var bHit = state.prio.length ? (rollMatchesPriority(b.roll, state.prio, true) ? 2 : (rollMatchesPriority(b.roll, state.prio, false) ? 1 : 0)) : 0;
        if (bHit !== aHit) return bHit - aHit;
        if (a.certain !== b.certain) return a.certain ? -1 : 1;
        return a.archId - b.archId;
      });

      var filterVerdictHtml = '';
      if (state.prio.length) {
        var hitsInVendor = sortedGroups.filter(function (g) {
          return rollMatchesPriority(g.roll, state.prio, false);
        });
        var wantedNames = state.prio.map(function (id, i) {
          return (i === 0 ? '①' : (i === 1 ? '②' : '③')) + statById(id).name;
        }).join(' ');
        if (hitsInVendor.length) {
          var best = hitsInVendor[0];
          filterVerdictHtml = (
            '<div class="ar-verdict is-yes">' +
              '✓ 这件护甲<b>可以洗出</b>「' + esc(wantedNames) + '」——已在下方置顶标金（' + esc(formatModAction(best)) + '）' +
            '</div>'
          );
        } else {
          var theoretical = filterCombosByPriority(state.prio);
          var theoHint = theoretical.length
            ? ('理论上需「' + theoretical[0].arch.pairLabel + ' + ' + theoretical[0].roll.tert.name + ' +20」，但这件护甲在该组合下第三属性固定为 +20 ' + tertStatOf(theoretical[0].archId, tMap1).name)
            : '无此组合';
          filterVerdictHtml = (
            '<div class="ar-verdict is-no">' +
              '✗ 这件护甲<b>洗不出</b>同时包含「' + esc(wantedNames) + '」的组合（' + esc(theoHint) + '）' +
            '</div>'
          );
        }
      }

      var cardsHtml = sortedGroups.map(function (g) {
        var r = g.roll;
        var matchExact = state.prio.length > 0 && rollMatchesPriority(r, state.prio, true);
        var matchSet = state.prio.length > 0 && rollMatchesPriority(r, state.prio, false);
        var ambText = '边界可出';
        if (!g.certain && g.possibleMods.length) {
          var pm = g.possibleMods[0];
          ambText = '边界 ' + pm.hits + '/' + pm.total;
        }
        var badge = matchExact
          ? '<span class="ar-out-badge is-gold">★ 完美顺位</span>'
          : (matchSet
              ? '<span class="ar-out-badge is-gold">★ 命中目标</span>'
              : (g.certain
                  ? '<span class="ar-out-badge is-cert">必出</span>'
                  : '<span class="ar-out-badge is-amb">' + esc(ambText) + '</span>'));

        var pHit = state.prio.indexOf(r.primary.id) !== -1;
        var sHit = state.prio.indexOf(r.secondary.id) !== -1;
        var tHit = state.prio.indexOf(r.tert.id) !== -1;

        return (
          '<div class="ar-out-card' + (matchSet ? ' is-prio-hit' : '') + (!g.certain ? ' is-maybe' : '') + '">' +
            '<div class="ar-out-stats">' +
              '<span class="ar-stat-cell is-p' + (pHit ? ' is-hit' : '') + '"><img class="ar-stat-ico" src="' + r.primary.icon + '" alt="" width="14" height="14" decoding="async"><b class="ar-cell-num">+30</b><span class="ar-cell-name">' + esc(r.primary.name) + '</span></span>' +
              '<span class="ar-stat-cell is-s' + (sHit ? ' is-hit' : '') + '"><img class="ar-stat-ico" src="' + r.secondary.icon + '" alt="" width="14" height="14" decoding="async"><b class="ar-cell-num">+25</b><span class="ar-cell-name">' + esc(r.secondary.name) + '</span></span>' +
              '<span class="ar-stat-cell is-t' + (tHit ? ' is-hit' : '') + '"><img class="ar-stat-ico" src="' + r.tert.icon + '" alt="" width="14" height="14" decoding="async"><b class="ar-cell-num">+20</b><span class="ar-cell-name">' + esc(r.tert.name) + '</span></span>' +
            '</div>' +
            '<div class="ar-out-foot">' +
              '<span class="ar-out-mod">' + esc(formatModAction(g)) + '</span>' +
              badge +
            '</div>' +
          '</div>'
        );
      }).join('');

      var certCount = sortedGroups.filter(function (g) { return g.certain; }).length;
      var ambCount = sortedGroups.length - certCount;

      host.innerHTML = (
        '<div class="ar-panel">' +
          '<div class="ar-step-block">' +
            '<div class="ar-head">' +
              '<div class="ar-title"><span class="ar-step-num">01</span><span>看老九时我机灵插着什么模组？</span></div>' +
              '<span class="ar-head-note">未装模组裸看老九可一次锁定 8～9 种必出组合</span>' +
            '</div>' +
            '<div class="ar-mod-matrix">' + mod1MatrixHtml + '</div>' +
          '</div>' +

          '<div class="ar-step-block">' +
            '<div class="ar-head">' +
              '<div class="ar-title"><span class="ar-step-num">02</span><span>老九这件护甲当前的属性</span>' + (state.itemName ? '<span class="ar-item-tag">' + esc(state.itemName) + '</span>' : '') + '</div>' +
              '<span class="ar-head-note">三档固定 +30 / +25 / +20 · 其余三项固定 +5</span>' +
            '</div>' +
            '<div class="ar-pick-rows">' +
              '<div class="ar-pick-row">' +
                '<span class="ar-pick-lbl"><span class="ar-lbl-name">主属性</span><b class="ar-lbl-val is-p">+30</b></span>' +
                '<div class="ar-pick-btns">' + priBtns + '</div>' +
              '</div>' +
              '<div class="ar-pick-row">' +
                '<span class="ar-pick-lbl"><span class="ar-lbl-name">副属性</span><b class="ar-lbl-val is-s">+25</b></span>' +
                '<div class="ar-pick-btns">' + secBtns + '</div>' +
              '</div>' +
              '<div class="ar-pick-row">' +
                '<span class="ar-pick-lbl"><span class="ar-lbl-name">第三属性</span><b class="ar-lbl-val is-t">+20</b></span>' +
                '<div class="ar-pick-btns">' + tertBtns + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          sameModHtml +

          '<div class="ar-filter-bar">' +
            '<span class="ar-pick-lbl">' +
              '<span class="ar-lbl-name"><b class="ar-step-inline">03</b>目标筛选</span>' +
              (state.prio.length
                ? '<button type="button" class="ar-clear-btn" data-prio-clear="1">重置</button>'
                : '<span class="ar-lbl-sub">选 1～3 项</span>') +
            '</span>' +
            '<div class="ar-filter-btns">' + prioChips + '</div>' +
          '</div>' +

          filterVerdictHtml +

          '<div class="ar-out-sec">' +
            '<div class="ar-sub-head">' +
              '<span>可洗出的 <b>' + sortedGroups.length + '</b> 种属性组合（必出 <b>' + certCount + '</b> 种' + (ambCount ? ' · 边界可出 ' + ambCount + ' 种' : '') + '）</span>' +
              '<span class="ar-sub-note">按卡片底部提示切换机灵模组后再向老九购买</span>' +
            '</div>' +
            '<div class="ar-out-grid">' + cardsHtml + '</div>' +
          '</div>' +
        '</div>'
      );
    }

    host.addEventListener('click', function (ev) {
      var t = ev.target;
      var modBtn = t.closest && t.closest('[data-pick-mod]');
      if (modBtn) {
        state.mod1 = Number(modBtn.getAttribute('data-pick-mod'));
        render();
        return;
      }
      var priBtn = t.closest && t.closest('[data-pick-pri]');
      if (priBtn) {
        state.pri1 = Number(priBtn.getAttribute('data-pick-pri'));
        render();
        return;
      }
      var secBtn = t.closest && t.closest('[data-pick-sec]');
      if (secBtn) {
        var nextSec = Number(secBtn.getAttribute('data-pick-sec'));
        if (!archByPrimarySecondary(state.pri1, nextSec)) {
          var swapArch = archByPrimarySecondary(nextSec, state.pri1);
          if (swapArch) {
            state.pri1 = swapArch.primary;
          } else {
            var altArch = ARCHETYPES.filter(function (a) { return a.secondary === nextSec; })[0];
            if (altArch) state.pri1 = altArch.primary;
          }
        }
        state.sec1 = nextSec;
        render();
        return;
      }
      var tertBtn = t.closest && t.closest('[data-pick-tert]');
      if (tertBtn) {
        var nextTert = Number(tertBtn.getAttribute('data-pick-tert'));
        if (nextTert === state.sec1) {
          var pair = archsByPrimary(state.pri1);
          var other = pair[0] && pair[0].secondary !== nextTert ? pair[0] : pair[1];
          if (other) state.sec1 = other.secondary;
        } else if (nextTert === state.pri1) {
          var bySec = ARCHETYPES.filter(function (a) { return a.secondary === state.sec1 && a.primary !== nextTert; })[0];
          if (bySec) {
            state.pri1 = bySec.primary;
          } else {
            var fallback = ARCHETYPES.filter(function (a) { return a.primary !== nextTert && a.secondary !== nextTert; })[0];
            if (fallback) {
              state.pri1 = fallback.primary;
              state.sec1 = fallback.secondary;
            }
          }
        }
        state.tert1 = nextTert;
        render();
        return;
      }
      var prioBtn = t.closest && t.closest('[data-prio-stat]');
      if (prioBtn) {
        var sId = Number(prioBtn.getAttribute('data-prio-stat'));
        var idx = state.prio.indexOf(sId);
        if (idx !== -1) state.prio.splice(idx, 1);
        else if (state.prio.length < 3) state.prio.push(sId);
        else state.prio[2] = sId;
        render();
        return;
      }
      var clearBtn = t.closest && t.closest('[data-prio-clear]');
      if (clearBtn) {
        state.prio = [];
        render();
      }
    });

    render();
    return {
      setItemName: function (name) {
        state.itemName = name || '';
        render();
      }
    };
  }

  function mountAll() {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('.armor-calc[data-armor-calc]');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].dataset.mounted) {
        nodes[i].dataset.mounted = '1';
        mount(nodes[i]);
      }
    }
  }

  return {
    STATS: STATS,
    ARCHETYPES: ARCHETYPES,
    TERTIARY_MAP: TERTIARY_MAP,
    X_MAP: X_MAP,
    Y_TO_X: Y_TO_X,
    X_TO_Y: X_TO_Y,
    statById: statById,
    statIdOf: statIdOf,
    archById: archById,
    archIdOf: archIdOf,
    tMapOf: tMapOf,
    tertStatOf: tertStatOf,
    rollOf: rollOf,
    xOfGhost: xOfGhost,
    pcToX: pcToX,
    yToXList: yToXList,
    xToYList: xToYList,
    solveFromObservations: solveFromObservations,
    groupOutcomes: groupOutcomes,
    allCombos: allCombos,
    rollMatchesPriority: rollMatchesPriority,
    filterCombosByPriority: filterCombosByPriority,
    mount: mount,
    mountAll: mountAll
  };
});
