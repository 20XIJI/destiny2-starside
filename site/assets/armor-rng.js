/* 护甲 3.0 商人属性机制与机灵聚焦推算器
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

  var STORAGE_MOD_KEY = 'starside:armor-rng:mod1';

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
    { id: 1, name: '楷模典范', shortName: '楷模', en: 'Paragon', hash: 4227065942, primary: 4, secondary: 6 },
    { id: 2, name: '堡垒', shortName: '堡垒', en: 'Bulwark', hash: 549468645, primary: 2, secondary: 5 },
    { id: 3, name: '掷雷手', shortName: '掷雷手', en: 'Grenadier', hash: 2937665788, primary: 3, secondary: 4 },
    { id: 4, name: '搏击手', shortName: '搏击手', en: 'Brawler', hash: 3349393475, primary: 6, secondary: 2 },
    { id: 5, name: '枪手', shortName: '枪手', en: 'Gunner', hash: 1807652646, primary: 1, secondary: 3 },
    { id: 6, name: '专家', shortName: '专家', en: 'Specialist', hash: 2230428468, primary: 5, secondary: 1 },
    { id: 7, name: '掠夺者', shortName: '掠夺者', en: 'Reaver', hash: 351770835, primary: 5, secondary: 6 },
    { id: 8, name: '突围者', shortName: '突围者', en: 'Siegebreaker', hash: 2503381935, primary: 2, secondary: 3 },
    { id: 9, name: '爆破专家', shortName: '爆破专家', en: 'Demolitionist', hash: 2222960133, primary: 3, secondary: 5 },
    { id: 10, name: '突击手', shortName: '突击手', en: 'Skirmisher', hash: 1687144140, primary: 6, secondary: 1 },
    { id: 11, name: '高能者', shortName: '高能者', en: 'Powerhouse', hash: 544009373, primary: 1, secondary: 4 },
    { id: 12, name: '装甲兵', shortName: '装甲兵', en: 'Colossus', hash: 1418248448, primary: 4, secondary: 2 }
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
    archObj.shortPair = archObj.primaryStat.name + ' / ' + archObj.secondaryStat.name;
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
      var observedY = 0;
      for (var j = 0; j < obs.length; j++) {
        var mId = Number(obs[j].modId || 0);
        var aId = archIdOf(obs[j].archId);
        if (mId === 0) {
          if (ys.indexOf(aId) === -1 || (observedY && observedY !== aId)) {
            matchX = false;
            break;
          }
          observedY = aId;
        } else {
          if (xOfGhost(mId, x) !== aId) {
            matchX = false;
            break;
          }
        }
      }
      if (!matchX) continue;

      // 偶数 X 跨过 12 等分边界时对应两个合法 Y；未观测 modId=0 时保留全部合法 Y 候选
      var candidateYs = observedY ? [observedY] : ys;
      for (var yi = 0; yi < candidateYs.length; yi++) {
        var yVal = candidateYs[yi];
        for (var k = 0; k < possibleT.length; k++) {
          var tMap = possibleT[k];
          var outcomes = [];
          for (var g = 0; g <= 12; g++) {
            var outArchId = (g === 0) ? yVal : xOfGhost(g, x);
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
            Y: yVal,
            yList: ys,
            tMap: tMap,
            outcomes: outcomes
          });
        }
      }
    }

    var uniqueXs = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      if (uniqueXs.indexOf(candidates[ci].X) === -1) uniqueXs.push(candidates[ci].X);
    }

    return {
      ambiguous: uniqueXs.length > 1 || possibleT.length > 1,
      uniqueXs: uniqueXs,
      candidates: candidates
    };
  }

  function groupOutcomes(candidates) {
    if (!candidates || !candidates.length) return [];
    var totalCands = candidates.length;
    var firstT = candidates[0].tMap;
    var singleT = true;
    for (var ti = 1; ti < totalCands; ti++) {
      if (candidates[ti].tMap !== firstT) {
        singleT = false;
        break;
      }
    }
    var tMap = singleT ? firstT : 0;
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
          var aObj = archById(aId);
          var r = tMap ? rollOf(aId, tMap) : null;
          byArch[aId] = {
            archId: aId,
            arch: aObj,
            primary: aObj.primaryStat,
            secondary: aObj.secondaryStat,
            tert: r ? r.tert : null,
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
          name: g === 0 ? '未装模组' : gArch.name,
          pairLabel: g === 0 ? '裸看' : gArch.pairLabel,
          isSelf: g === aId,
          hits: hits,
          total: totalCands
        };
        if (hits === totalCands && singleT) {
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
      var nonZeroCertain = item.certainMods.filter(function (m) { return m.modId > 0; });
      var nonZeroPossible = item.possibleMods.filter(function (m) { return m.modId > 0; });
      item.bestMod = item.selfModCertain
        ? id
        : (nonZeroCertain.length
            ? nonZeroCertain[0].modId
            : (item.selfModPossible
                ? id
                : (nonZeroPossible.length ? nonZeroPossible[0].modId : 0)));
      groups.push(item);
    }
    return groups;
  }

  function recommendSecondMod(xs, excludeModId) {
    if (!xs || xs.length <= 1) return null;
    var best = null;
    var order = [1, 12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (var i = 0; i < order.length; i++) {
      var g = order[i];
      if (g === excludeModId) continue;
      var buckets = {};
      for (var k = 0; k < xs.length; k++) {
        var a = xOfGhost(g, xs[k]);
        buckets[a] = (buckets[a] || 0) + 1;
      }
      var keys = Object.keys(buckets).map(Number);
      if (keys.length <= 1) continue;
      var maxB = 0;
      for (var bi = 0; bi < keys.length; bi++) {
        if (buckets[keys[bi]] > maxB) maxB = buckets[keys[bi]];
      }
      if (!best || maxB < best.maxB) {
        best = {
          modId: g,
          outcomes: keys.sort(function (a, b) { return a - b; }),
          maxB: maxB
        };
      }
    }
    return best;
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

  function explainUnreachable(prioIds, tMap) {
    var theo = filterCombosByPriority(prioIds);
    if (!theo.length) return '护甲 3.0 没有这种属性搭配';
    var t0 = theo[0];
    var actualTert = tertStatOf(t0.archId, tMap);
    if (actualTert && actualTert.id !== t0.roll.tert.id) {
      return '需要「' + t0.arch.name + ' +20 ' + t0.roll.tert.name + '」，但这件护甲在 ' + t0.arch.name + ' 下第三属性固定为 +20 ' + actualTert.name;
    }
    return '这件护甲这周洗不到「' + t0.arch.name + '」原型';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadSavedMod() {
    try {
      if (typeof localStorage === 'undefined') return 11;
      var raw = localStorage.getItem(STORAGE_MOD_KEY);
      if (raw === null) return 11;
      var num = Number(raw);
      return (num >= 0 && num <= 12 && Math.floor(num) === num) ? num : 11;
    } catch {
      return 11;
    }
  }

  function saveMod(modId) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_MOD_KEY, String(modId));
      }
    } catch {
      // 隐私模式禁用存储时静默忽略
    }
  }

  function computeViewModel(input) {
    var mod1 = Number(input.mod1 || 0);
    var pri1 = Number(input.pri1 || 1);
    var a1 = archById(input.arch1);
    if (!a1 || a1.primary !== pri1) {
      a1 = archsByPrimary(pri1)[0] || ARCHETYPES[0];
    }
    var tert1 = Number(input.tert1 || 0);
    if (a1.tert.indexOf(tert1) === -1) {
      tert1 = a1.tert[0];
    }

    var obs1 = [{ modId: mod1, archId: a1.id, tertStat: tert1 }];
    var baseRes = solveFromObservations(obs1);
    var rec2 = recommendSecondMod(baseRes.uniqueXs, mod1);
    var mod2 = rec2 ? rec2.modId : 0;
    var arch2 = (rec2 && Number(input.mod2) === rec2.modId && rec2.outcomes.indexOf(Number(input.arch2)) !== -1)
      ? Number(input.arch2)
      : 0;

    var fullObs = arch2 ? obs1.concat([{ modId: mod2, archId: arch2 }]) : obs1;
    var res = solveFromObservations(fullObs);
    var groups = groupOutcomes(res.candidates);
    var isSameMod = mod1 > 0 && mod1 === a1.id && !arch2;
    var certCount = groups.filter(function (g) { return g.certain; }).length;
    var waitCount = groups.length - certCount;
    var prio = Array.isArray(input.prio) ? input.prio.slice() : [];

    var displayGroups = isSameMod
      ? groups.filter(function (g) { return g.archId === a1.id; })
      : groups.slice();

    displayGroups.sort(function (a, b) {
      var aH = prio.length ? (rollMatchesPriority(a.roll, prio, true) ? 2 : (rollMatchesPriority(a.roll, prio, false) ? 1 : 0)) : 0;
      var bH = prio.length ? (rollMatchesPriority(b.roll, prio, true) ? 2 : (rollMatchesPriority(b.roll, prio, false) ? 1 : 0)) : 0;
      if (bH !== aH) return bH - aH;
      if (a.certain !== b.certain) return a.certain ? -1 : 1;
      return a.archId - b.archId;
    });

    var activeArch = arch2 || a1.id;
    var activeIsUnmod = !arch2 && mod1 === 0;
    var hits = prio.length
      ? displayGroups.filter(function (g) { return rollMatchesPriority(g.roll, prio, false); })
      : [];
    var bestHit = hits.length ? hits[0] : null;
    var verdict = null;
    if (prio.length) {
      var wantText = prio.map(function (id) { return statById(id).name; }).join(' + ');
      if (bestHit) {
        var bm = bestHit.bestMod ? archById(bestHit.bestMod) : null;
        var directHit = bestHit.archId === activeArch;
        var actText = directHit
          ? (activeIsUnmod ? '不插模组直接买' : '保持当前模组直接买')
          : (bm ? ('改插 ' + bm.name + '（' + bm.shortPair + '）模组') : '不插模组直接买');
        verdict = {
          hit: true,
          wantText: wantText,
          best: bestHit,
          directHit: directHit,
          actText: actText
        };
      } else {
        var tMapNow = res.candidates.length ? res.candidates[0].tMap : tMapOf(a1.id, tert1);
        verdict = {
          hit: false,
          wantText: wantText,
          reason: isSameMod
            ? '当前模组仅锁定了 ' + a1.name + '，按上方提示换模组看一眼后再筛选其余组合'
            : explainUnreachable(prio, tMapNow)
        };
      }
    }

    var verifyOpen = Boolean(rec2 && (waitCount > 0 || arch2));
    var verifyLead = '';
    if (verifyOpen) {
      var m2Arch = archById(rec2.modId);
      if (isSameMod) {
        verifyLead = '当前戴着的 <b>' + esc(archById(mod1).name) + '</b> 已命中这件护甲（直接买就是当前属性）。想看还能洗出什么，换 <b>' + esc(m2Arch.name) + '（' + esc(m2Arch.pairLabel) + '）</b> 看一眼并点选看到的原型：';
      } else if (arch2) {
        verifyLead = res.uniqueXs.length === 1
          ? '已结合 <b>' + esc(m2Arch.name) + '（' + esc(m2Arch.pairLabel) + '）</b> 的二次读数锁定结果：'
          : '已结合 <b>' + esc(m2Arch.name) + '（' + esc(m2Arch.pairLabel) + '）</b> 收窄至 ' + res.uniqueXs.length + ' 种可能（仍有待确认项，可改用楷模典范与装甲兵双读彻底锁定）：';
      } else {
        var lockPromise = rec2.maxB === 1 ? '即可 100% 锁定：' : '可进一步收窄范围：';
        verifyLead = '想确认下方待确认项？把机灵换成 <b>' + esc(m2Arch.name) + '（' + esc(m2Arch.pairLabel) + '）</b> 看一眼，点选看到的原型' + lockPromise;
      }
    }

    return {
      a1: a1,
      tert1: tert1,
      rec2: rec2,
      mod2: mod2,
      arch2: arch2,
      res: res,
      groups: groups,
      displayGroups: displayGroups,
      isSameMod: isSameMod,
      certCount: certCount,
      waitCount: waitCount,
      activeArch: activeArch,
      activeIsUnmod: activeIsUnmod,
      verdict: verdict,
      verifyOpen: verifyOpen,
      verifyLead: verifyLead
    };
  }

  function mount(host, opts) {
    if (!host || typeof document === 'undefined') return null;
    var options = opts || {};
    var state = {
      itemName: options.itemName || '',
      mod1: options.defaultMod != null ? Number(options.defaultMod) : loadSavedMod(),
      pri1: 1,
      arch1: 5,
      tert1: 4,
      mod2: 0,
      arch2: 0,
      prio: [],
      rulerOpen: false,
      hoverMod: 0
    };

    function modGridMarkup() {
      var cells = (
        '<button type="button" class="ac-mod-btn ac-mod-unmod' + (state.mod1 === 0 ? ' is-on' : '') + '" data-pick-mod="0">' +
          '<span class="ac-socket-ring" aria-hidden="true"></span>' +
          '<span class="ac-mod-n">未装护甲模组</span>' +
          '<span class="ac-mod-p">裸看商人</span>' +
        '</button>'
      );
      for (var rIdx = 0; rIdx < 2; rIdx++) {
        for (var cIdx = 0; cIdx < UI_STATS.length; cIdx++) {
          var pa = archsByPrimary(UI_STATS[cIdx].id)[rIdx];
          cells += (
            '<button type="button" class="ac-mod-btn' + (state.mod1 === pa.id ? ' is-on' : '') + '" data-pick-mod="' + pa.id + '">' +
              '<span class="ac-mod-n">' + esc(pa.name) + '</span>' +
              '<span class="ac-mod-p"><img class="ac-ico" src="' + pa.primaryStat.icon + '" alt="" width="11" height="11" decoding="async">' + esc(pa.shortPair) + '</span>' +
            '</button>'
          );
        }
      }
      return cells;
    }

    function buildShellHtml() {
      var priBtns = UI_STATS.map(function (st) {
        return (
          '<button type="button" class="ac-seg-btn" data-pick-pri="' + st.id + '">' +
            '<img class="ac-ico" src="' + st.icon + '" alt="" width="13" height="13" decoding="async">' +
            '<span>' + esc(st.name) + '</span>' +
          '</button>'
        );
      }).join('');

      var miniBarsHtml = UI_STATS.map(function (st) {
        return (
          '<div class="ac-mbar" data-mbar-key="' + st.key + '" data-lv="5">' +
            '<span class="ac-mbar-top"><img class="ac-ico" src="' + st.icon + '" alt="" width="11" height="11" decoding="async"><span class="ac-mbar-num">5</span></span>' +
            '<span class="ac-mbar-track"><span class="ac-mbar-fill"></span></span>' +
          '</div>'
        );
      }).join('');

      var headCols = UI_STATS.map(function (st) {
        return (
          '<th><button type="button" class="ac-th-btn" data-prio-stat="' + st.id + '">' +
            '<img class="ac-ico" src="' + st.icon + '" alt="" width="13" height="13" decoding="async">' +
            '<span>' + esc(st.name) + '</span><span class="ac-th-rank"></span>' +
          '</button></th>'
        );
      }).join('');

      var rulerHtml = '';
      for (var rx = 1; rx <= 23; rx++) {
        rulerHtml += '<span class="ac-rcell" data-ruler-x="' + rx + '">' + rx + '</span>';
      }

      return (
        '<div class="ac">' +
          '<div class="ac-guide">' +
            '<div class="ac-guide-step"><span class="ac-guide-num">1</span><span><b>选机灵模组</b>：点选你现在戴着的护甲模组</span></div>' +
            '<div class="ac-guide-step"><span class="ac-guide-num">2</span><span><b>照抄商人面板</b>：点出这件护甲的 +30 原型与 +20 属性</span></div>' +
            '<div class="ac-guide-step"><span class="ac-guide-num">3</span><span><b>换模组购买</b>：按表格最右列换好机灵模组再买</span></div>' +
          '</div>' +

          '<div class="ac-sec ac-mod-sec">' +
            '<div class="ac-sec-head">' +
              '<div class="ac-sec-title"><span class="ac-dot"></span><span>我当前戴着的机灵模组</span></div>' +
              '<div class="ac-status" data-ac="status"><span class="ac-pip"></span><span class="ac-status-txt" data-ac="status-txt"></span></div>' +
            '</div>' +
            '<div class="ac-mod-grid" data-ac="mod-grid">' + modGridMarkup() + '</div>' +
          '</div>' +

          '<div class="ac-obs">' +
            '<div class="ac-obs-col">' +
              '<div class="ac-sec-head">' +
                '<div class="ac-sec-title"><span class="ac-dot"></span><span class="ac-sec-num">+30</span><span>主属性与原型</span><span class="ac-item-tag" data-ac="item-tag"' + (state.itemName ? '' : ' hidden') + '>' + esc(state.itemName) + '</span></div>' +
                '<span class="ac-sec-hint">商人面板所见</span>' +
              '</div>' +
              '<div class="ac-seg" data-ac="pri-seg"><div class="ac-seg-ind" data-ac="pri-ind"></div>' + priBtns + '</div>' +
              '<div class="ac-arch-pair" data-ac="arch-pair"></div>' +
            '</div>' +
            '<div class="ac-obs-col">' +
              '<div class="ac-sec-head">' +
                '<div class="ac-sec-title"><span class="ac-dot"></span><span class="ac-sec-num">+20</span><span>第三属性</span></div>' +
                '<span class="ac-sec-hint">其余三项固定 +5</span>' +
              '</div>' +
              '<div class="ac-seg ac-seg-4" data-ac="tert-seg"><div class="ac-seg-ind" data-ac="tert-ind"></div></div>' +
              '<div class="ac-mini-bars" data-ac="mini-bars">' + miniBarsHtml + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="ac-verify" data-ac="verify" inert><div class="ac-verify-in"><div class="ac-verify-body" data-ac="verify-body"></div></div></div>' +
          '<div class="ac-verdict-wrap" data-ac="verdict-wrap" inert><div class="ac-verdict-in"><div class="ac-verdict" data-ac="verdict"></div></div></div>' +

          '<div class="ac-table-bar">' +
            '<span data-ac="table-meta"></span>' +
            '<button type="button" class="ac-link-btn" data-ruler-toggle="1">查看推算原理 ▾</button>' +
          '</div>' +

          '<table class="ac-tbl">' +
            '<thead><tr><th>可洗出的护甲原型</th>' + headCols + '<th>购买时操作</th></tr></thead>' +
            '<tbody data-ac="tbody"></tbody>' +
          '</table>' +

          '<div class="ac-ruler-wrap" data-ac="ruler-wrap"><div class="ac-ruler-in"><div class="ac-ruler-body">' +
            '<div class="ac-ruler-meta"><span>23 格随机区间（亮格为当前护甲位置，悬停上方结果行可预览对应模组覆盖范围）</span><span data-ac="ruler-hover"></span></div>' +
            '<div class="ac-ruler-cells" data-ac="ruler-cells">' + rulerHtml + '</div>' +
          '</div></div></div>' +
        '</div>'
      );
    }

    host.innerHTML = buildShellHtml();

    function q(sel) {
      return host.querySelector ? host.querySelector(sel) : null;
    }

    function qa(sel) {
      return host.querySelectorAll ? host.querySelectorAll(sel) : [];
    }

    function slideInd(el, activeIdx, count) {
      if (!el || !el.style) return;
      var pct = 100 / count;
      el.style.width = 'calc(' + pct + '% - 6px / ' + count + ')';
      el.style.transform = 'translateX(' + (activeIdx * 100) + '%)';
    }

    function currentObservations() {
      var list = [{ modId: state.mod1, archId: state.arch1, tertStat: state.tert1 }];
      if (state.mod2 && state.arch2) {
        list.push({ modId: state.mod2, archId: state.arch2 });
      }
      return list;
    }

    function updateRuler(xs) {
      var cells = qa('[data-ruler-x]');
      for (var i = 0; i < cells.length; i++) {
        var x = Number(cells[i].getAttribute('data-ruler-x'));
        cells[i].classList.toggle('is-cand', xs.indexOf(x) !== -1);
        var inWin = state.hoverMod > 0 && xOfGhost(state.hoverMod, x) === state.hoverMod;
        cells[i].classList.toggle('is-hover-win', inWin);
      }
      var hoverEl = q('[data-ac="ruler-hover"]');
      if (hoverEl) {
        hoverEl.textContent = state.hoverMod
          ? ('预览：' + archById(state.hoverMod).name + ' 模组覆盖区间')
          : '';
      }
    }

    function sync(animateRows) {
      var vm = computeViewModel(state);
      var a1 = vm.a1;
      state.arch1 = a1.id;
      state.tert1 = vm.tert1;
      state.mod2 = vm.mod2;
      state.arch2 = vm.arch2;

      var itemTag = q('[data-ac="item-tag"]');
      if (itemTag) {
        itemTag.textContent = state.itemName || '';
        itemTag.hidden = !state.itemName;
      }

      var modBtns = qa('[data-pick-mod]');
      for (var mi = 0; mi < modBtns.length; mi++) {
        modBtns[mi].classList.toggle('is-on', Number(modBtns[mi].getAttribute('data-pick-mod')) === state.mod1);
      }

      var priBtns = qa('[data-pick-pri]');
      var priIdx = 0;
      for (var pi = 0; pi < priBtns.length; pi++) {
        var isPriOn = Number(priBtns[pi].getAttribute('data-pick-pri')) === state.pri1;
        priBtns[pi].classList.toggle('is-on', isPriOn);
        if (isPriOn) priIdx = pi;
      }
      slideInd(q('[data-ac="pri-ind"]'), priIdx, 6);

      var pairHost = q('[data-ac="arch-pair"]');
      if (pairHost) {
        var pairList = archsByPrimary(state.pri1);
        pairHost.innerHTML = pairList.map(function (pa) {
          var on = pa.id === state.arch1;
          return (
            '<button type="button" class="ac-arch-opt' + (on ? ' is-on' : '') + '" data-pick-arch="' + pa.id + '">' +
              '<span class="ac-arch-opt-name">' + esc(pa.name) + '</span>' +
              '<span class="ac-arch-opt-stats"><span class="ac-num-p">+30 ' + esc(pa.primaryStat.name) + '</span><span class="ac-arch-sep"></span><span class="ac-num-s">+25 ' + esc(pa.secondaryStat.name) + '</span></span>' +
            '</button>'
          );
        }).join('');
      }

      var tertSeg = q('[data-ac="tert-seg"]');
      if (tertSeg) {
        var validTerts = UI_STATS.filter(function (st) { return a1.tert.indexOf(st.id) !== -1; });
        var oldTerts = tertSeg.querySelectorAll('[data-pick-tert]');
        if (oldTerts.length !== 4) {
          for (var ti = 0; ti < 4; ti++) {
            var tb = document.createElement('button');
            tb.type = 'button';
            tb.className = 'ac-seg-btn';
            tb.setAttribute('data-pick-tert', '0');
            tertSeg.appendChild(tb);
          }
          oldTerts = tertSeg.querySelectorAll('[data-pick-tert]');
        }
        var tertIdx = 0;
        for (var vi = 0; vi < validTerts.length; vi++) {
          var st = validTerts[vi];
          var b = oldTerts[vi];
          var isTertOn = st.id === state.tert1;
          b.setAttribute('data-pick-tert', String(st.id));
          b.classList.toggle('is-on', isTertOn);
          if (isTertOn) tertIdx = vi;
          b.innerHTML = '<img class="ac-ico" src="' + st.icon + '" alt="" width="13" height="13" decoding="async"><span>' + esc(st.name) + '</span>';
        }
        slideInd(q('[data-ac="tert-ind"]'), tertIdx, 4);
      }

      var curRoll = rollOf(a1.id, tMapOf(a1.id, state.tert1));
      var mbars = qa('[data-mbar-key]');
      for (var bi = 0; bi < mbars.length; bi++) {
        var mKey = mbars[bi].getAttribute('data-mbar-key');
        var mVal = curRoll.values[mKey];
        mbars[bi].setAttribute('data-lv', String(mVal));
        var numEl = mbars[bi].querySelector('.ac-mbar-num');
        if (numEl) numEl.textContent = String(mVal);
      }

      var res = vm.res;
      var isSameMod = vm.isSameMod;
      var certCount = vm.certCount;
      var waitCount = vm.waitCount;

      var statusEl = q('[data-ac="status"]');
      var statusTxt = q('[data-ac="status-txt"]');
      if (statusEl && statusTxt) {
        if (res.uniqueXs.length === 1) {
          statusEl.setAttribute('data-state', 'locked');
          statusTxt.innerHTML = '已锁定 · 可洗出 <b>' + certCount + '</b> 种';
        } else if (isSameMod) {
          statusEl.setAttribute('data-state', 'same');
          statusTxt.innerHTML = '当前模组已命中 · 换模组看一眼可解锁其余组合';
        } else {
          statusEl.setAttribute('data-state', 'ambig');
          statusTxt.innerHTML = '必出 <b>' + certCount + '</b> 种' + (waitCount ? ' · 待确认 <b>' + waitCount + '</b> 种' : '');
        }
      }

      var verifyEl = q('[data-ac="verify"]');
      var verifyBody = q('[data-ac="verify-body"]');
      if (verifyEl && verifyBody) {
        verifyEl.classList.toggle('is-open', vm.verifyOpen);
        verifyEl.inert = !vm.verifyOpen;
        if (vm.verifyOpen) {
          verifyBody.innerHTML = (
            '<div class="ac-verify-head">' +
              '<div class="ac-verify-msg">' + vm.verifyLead + '</div>' +
              (state.arch2 ? '<button type="button" class="ac-link-btn" data-pick-arch2="0">清除二次读数</button>' : '') +
            '</div>' +
            '<div class="ac-verify-picks">' +
              vm.rec2.outcomes.map(function (aid) {
                var oa = archById(aid);
                return (
                  '<button type="button" class="ac-vbtn' + (state.arch2 === aid ? ' is-on' : '') + '" data-pick-arch2="' + aid + '">' +
                    '<span class="ac-vbtn-n">' + esc(oa.name) + '</span>' +
                    '<span class="ac-vbtn-p">' + esc(oa.shortPair) + '</span>' +
                  '</button>'
                );
              }).join('') +
            '</div>'
          );
        }
      }

      var thBtns = qa('[data-prio-stat]');
      for (var hi = 0; hi < thBtns.length; hi++) {
        var sid = Number(thBtns[hi].getAttribute('data-prio-stat'));
        var idx = state.prio.indexOf(sid);
        thBtns[hi].classList.toggle('is-on', idx !== -1);
        var rankEl = thBtns[hi].querySelector('.ac-th-rank');
        if (rankEl) rankEl.textContent = idx === -1 ? '' : String(idx + 1);
      }

      var verdictWrap = q('[data-ac="verdict-wrap"]');
      var verdictEl = q('[data-ac="verdict"]');
      if (verdictWrap && verdictEl) {
        var hasVerdict = Boolean(vm.verdict);
        verdictWrap.classList.toggle('is-open', hasVerdict);
        verdictWrap.inert = !hasVerdict;
        if (hasVerdict) {
          if (vm.verdict.hit) {
            var best = vm.verdict.best;
            var bm = best.bestMod ? archById(best.bestMod) : null;
            var actHtml = vm.verdict.directHit
              ? esc(vm.verdict.actText)
              : (bm ? ('改插 <b>' + esc(bm.name) + '（' + esc(bm.shortPair) + '）</b> 模组') : '不插模组直接买');
            verdictEl.setAttribute('data-hit', 'yes');
            verdictEl.innerHTML = (
              '<span>可洗出「' + esc(vm.verdict.wantText) + '」— <b>' + esc(best.arch.name) + '（' + esc(best.arch.pairLabel) + ' · +20 ' + esc(best.roll.tert.name) + '）</b>，' + actHtml + (best.certain ? '必出' : '（需二次确认）') + '。</span>' +
              '<button type="button" class="ac-link-btn" data-prio-clear="1">清除筛选</button>'
            );
          } else {
            verdictEl.setAttribute('data-hit', 'no');
            verdictEl.innerHTML = (
              '<span><b>洗不出</b>同时包含「' + esc(vm.verdict.wantText) + '」的组合（' + esc(vm.verdict.reason) + '）。</span>' +
              '<button type="button" class="ac-link-btn" data-prio-clear="1">清除筛选</button>'
            );
          }
        }
      }

      var metaEl = q('[data-ac="table-meta"]');
      if (metaEl) {
        metaEl.textContent = isSameMod
          ? '当前模组已锁定这一种结果；按上方提示换模组看一眼即可展开全部可洗组合'
          : '点下方属性列头可筛选想要的属性（最多 3 项）';
      }

      var tbody = q('[data-ac="tbody"]');
      if (tbody) {
        tbody.innerHTML = vm.displayGroups.map(function (g, rowIdx) {
          var r = g.roll;
          var hit = state.prio.length > 0 && rollMatchesPriority(r, state.prio, false);
          var dim = state.prio.length > 0 && !hit;
          var isNow = g.archId === vm.activeArch;
          var bm = g.bestMod ? archById(g.bestMod) : null;
          var cols = UI_STATS.map(function (st) {
            var val = r.values[st.key];
            var cls = val === 30 ? 'v30' : (val === 25 ? 'v25' : (val === 20 ? 'v20' : 'v5'));
            var colTrack = state.prio.indexOf(st.id) !== -1;
            var colHit = val >= 20 && colTrack;
            if (val === 5) {
              return '<td class="' + (colTrack ? 'is-col-track' : '') + '"><span class="ac-v v5">·</span></td>';
            }
            return (
              '<td class="' + (colTrack ? 'is-col-track' : '') + '">' +
                '<span class="ac-cell">' +
                  '<span class="ac-v ' + cls + (colHit ? ' is-col-hit' : '') + '">' + val + '</span>' +
                  '<span class="ac-bar ' + cls + (colHit ? ' is-col-hit' : '') + '"><i></i></span>' +
                '</span>' +
              '</td>'
            );
          }).join('');
          var modActionHtml = isNow
            ? '<span class="ac-act-mod is-direct"><span class="ac-direct-dot"></span>当前直接买</span>'
            : ('<span class="ac-act-mod">' + (bm ? ('插 ' + esc(bm.name)) : '不插模组') + '</span>');
          var delayStyle = animateRows ? (' style="animation-delay:' + (rowIdx * 22) + 'ms"') : '';
          return (
            '<tr class="' + (hit ? 'is-hit' : '') + (dim ? ' is-dim' : '') + (isNow && !hit ? ' is-now' : '') + (animateRows ? ' is-enter' : '') + '"' + delayStyle + ' data-row-mod="' + (g.bestMod || 0) + '">' +
              '<td><span class="ac-row-arch"><span class="ac-row-name">' + esc(g.arch.name) + '</span><span class="ac-row-sub">' + esc(g.arch.pairLabel) + '</span></span></td>' +
              cols +
              '<td><div class="ac-act-wrap">' + modActionHtml + '<span class="ac-act-tag ' + (g.certain ? 'is-cert' : 'is-wait') + '">' + (g.certain ? '必出' : '待确认') + '</span></div></td>' +
            '</tr>'
          );
        }).join('');
      }

      var rulerWrap = q('[data-ac="ruler-wrap"]');
      var rulerToggle = q('[data-ruler-toggle]');
      if (rulerWrap) rulerWrap.classList.toggle('is-open', state.rulerOpen);
      if (rulerToggle) rulerToggle.textContent = state.rulerOpen ? '收起推算原理 ▴' : '查看推算原理 ▾';
      updateRuler(res.uniqueXs);
    }

    host.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var modBtn = t.closest('[data-pick-mod]');
      if (modBtn) {
        state.mod1 = Number(modBtn.getAttribute('data-pick-mod'));
        saveMod(state.mod1);
        state.arch2 = 0;
        sync(true);
        return;
      }
      var priBtn = t.closest('[data-pick-pri]');
      if (priBtn) {
        state.pri1 = Number(priBtn.getAttribute('data-pick-pri'));
        state.arch2 = 0;
        sync(true);
        return;
      }
      var archBtn = t.closest('[data-pick-arch]');
      if (archBtn) {
        state.arch1 = Number(archBtn.getAttribute('data-pick-arch'));
        state.arch2 = 0;
        sync(true);
        return;
      }
      var tertBtn = t.closest('[data-pick-tert]');
      if (tertBtn) {
        state.tert1 = Number(tertBtn.getAttribute('data-pick-tert'));
        sync(false);
        return;
      }
      var arch2Btn = t.closest('[data-pick-arch2]');
      if (arch2Btn) {
        state.arch2 = Number(arch2Btn.getAttribute('data-pick-arch2'));
        sync(true);
        return;
      }
      var prioBtn = t.closest('[data-prio-stat]');
      if (prioBtn) {
        var sId = Number(prioBtn.getAttribute('data-prio-stat'));
        var idx = state.prio.indexOf(sId);
        if (idx !== -1) state.prio.splice(idx, 1);
        else if (state.prio.length < 3) state.prio.push(sId);
        else state.prio[2] = sId;
        sync(false);
        return;
      }
      if (t.closest('[data-prio-clear]')) {
        state.prio = [];
        sync(false);
        return;
      }
      if (t.closest('[data-ruler-toggle]')) {
        state.rulerOpen = !state.rulerOpen;
        sync(false);
      }
    });

    host.addEventListener('mouseover', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var tr = t.closest('tr[data-row-mod]');
      var next = tr ? Number(tr.getAttribute('data-row-mod')) : 0;
      if (next !== state.hoverMod) {
        state.hoverMod = next;
        if (state.rulerOpen) {
          var res = solveFromObservations(currentObservations());
          updateRuler(res.uniqueXs);
        }
      }
    });

    host.addEventListener('mouseleave', function () {
      if (state.hoverMod !== 0) {
        state.hoverMod = 0;
        if (state.rulerOpen) {
          var res = solveFromObservations(currentObservations());
          updateRuler(res.uniqueXs);
        }
      }
    });

    sync(true);
    return {
      setItemName: function (name) {
        state.itemName = name || '';
        sync(false);
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

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountAll);
    } else {
      mountAll();
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
    recommendSecondMod: recommendSecondMod,
    explainUnreachable: explainUnreachable,
    computeViewModel: computeViewModel,
    allCombos: allCombos,
    rollMatchesPriority: rollMatchesPriority,
    filterCombosByPriority: filterCombosByPriority,
    mount: mount,
    mountAll: mountAll
  };
});
