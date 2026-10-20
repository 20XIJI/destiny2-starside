(function () {
  'use strict';

  var CACHE_KEY = 'd2_ev_cache_v10';
  var XUR_CACHE_KEY = 'd2_xur_cache_v1';
  // 云函数定时器把产物写到静态托管 rotation/ 下，这里同源读，访客打开不调云函数。
  var API_URL = '../rotation/eververse.json';
  var XUR_API_URL = '../rotation/xur.json';

  try {
    localStorage.removeItem('d2_eververse_cache');
    localStorage.removeItem('d2_ev_cache_v1');
    localStorage.removeItem('d2_ev_cache_v2');
    localStorage.removeItem('d2_ev_cache_v3');
    localStorage.removeItem('d2_ev_cache_v4');
    localStorage.removeItem('d2_ev_cache_v5');
    localStorage.removeItem('d2_ev_cache_v6');
    localStorage.removeItem('d2_ev_cache_v7');
    localStorage.removeItem('d2_ev_cache_v8');
    localStorage.removeItem('d2_ev_cache_v9');
  } catch (_) {}

  var primaryEl = document.getElementById('ev-primary');
  var secondaryEl = document.getElementById('ev-secondary');
  var silverEl = document.getElementById('ev-silver');
  var cntPrimaryEl = document.getElementById('ev-cnt-primary');
  var cntSecondaryEl = document.getElementById('ev-cnt-secondary');
  var cntSilverEl = document.getElementById('ev-cnt-silver');
  var cntTotalEl = document.getElementById('ev-cnt-total');

  var lblCurEl = document.getElementById('ev-lbl-cur');
  var lblNextEl = document.getElementById('ev-lbl-next');
  var curCycleEl = document.getElementById('ev-cur-cycle');
  var nextResetEl = document.getElementById('ev-next-reset');
  var lastFetchEl = document.getElementById('ev-last-fetch');
  var cycleRuleEl = document.getElementById('ev-cycle-rule');
  var progEl = document.getElementById('ev-prog');
  var progFillEl = document.getElementById('ev-prog-fill');
  var progSpan = null;

  var paneEv = document.getElementById('ev-pane-eververse');
  var paneXur = document.getElementById('ev-pane-xur');
  var paneAda = document.getElementById('ev-pane-ada');
  var xurContentEl = document.getElementById('xur-content');
  var xurCntTotalEl = document.getElementById('xur-cnt-total');
  var xurVendorEl = document.getElementById('xur-summary-vendor');
  var adaEl = document.getElementById('ev-ada');
  var cntAdaEl = document.getElementById('ada-cnt-shaders');
  var cntAdaTotalEl = document.getElementById('ada-cnt-total');
  var tabBtns = document.querySelectorAll('.ev-scope .toggle');

  var activeTab = 'eververse';
  var evData = null;
  var xurData = null;
  var hasRenderedEv = false;
  var hasRenderedXur = false;

  var WEEKS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatName(s) {
    if (!s) return '';
    return String(s)
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  }

  function toUtc8(isoStr) {
    if (!isoStr) return null;
    var ms = Date.parse(isoStr);
    if (isNaN(ms)) return null;
    return new Date(ms + 8 * 3600e3);
  }

  function formatTime(isoStr) {
    var d = toUtc8(isoStr);
    if (!d) return '--';
    var m = d.getUTCMonth() + 1;
    var day = d.getUTCDate();
    var h = pad(d.getUTCHours());
    var min = pad(d.getUTCMinutes());
    var w = WEEKS[d.getUTCDay()];
    return m + ' 月 ' + day + ' 日 ' + h + ':' + min + ' · ' + w;
  }

  function formatShortTime(isoStr) {
    var d = toUtc8(isoStr);
    if (!d) return '--';
    return (d.getUTCMonth() + 1) + ' 月 ' + d.getUTCDate() + ' 日 ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  /* 本轮进度条：起点是本轮刷新（仄为抵达），终点是下次刷新（仄为离开）。
     数据还没到时整条收起；过了终点停在满格，等下一次同步换成新一轮。 */
  function setProgress(startIso, endIso) {
    var s = Date.parse(startIso), e = Date.parse(endIso);
    progSpan = (isNaN(s) || isNaN(e) || e <= s) ? null : [s, e];
    renderProgress();
  }

  function renderProgress() {
    if (!progEl || !progFillEl) return;
    progEl.hidden = !progSpan;
    if (!progSpan) return;
    var p = Math.max(0, Math.min(1, (Date.now() - progSpan[0]) / (progSpan[1] - progSpan[0])));
    var pct = Math.round(p * 100);
    progFillEl.style.width = (p * 100).toFixed(2) + '%';
    progEl.setAttribute('aria-valuenow', String(pct));
    progEl.setAttribute('aria-valuetext', '本轮已过 ' + pct + '%');
  }

  function updateStatusBar() {
    if (activeTab === 'xur') {
      if (lblCurEl) lblCurEl.textContent = '抵达时间';
      if (lblNextEl) lblNextEl.textContent = '离开时间';
      setProgress(xurData && xurData.arrival, xurData && xurData.departure);
      if (xurData) {
        if (curCycleEl) curCycleEl.textContent = formatTime(xurData.arrival || xurData.updatedAt);
        if (nextResetEl) nextResetEl.textContent = formatTime(xurData.departure);
        if (lastFetchEl) lastFetchEl.textContent = formatShortTime(xurData.updatedAt || xurData.generatedAt);
        var loc = xurData.location ? xurData.location + ' · ' : '';
        if (cycleRuleEl) cycleRuleEl.textContent = loc + (xurData.cycleNote || '每周六 01:00 抵达 · 周三 01:00 离开');
      }
      return;
    }

    if (activeTab === 'ada') {
      if (lblCurEl) lblCurEl.textContent = '本轮刷新';
      if (lblNextEl) lblNextEl.textContent = '下次刷新';
      setProgress(evData && evData.ada && evData.ada.cycleStart, evData && evData.ada && evData.ada.resetAt);
      if (evData) {
        var adaMeta = evData.ada || {};
        if (curCycleEl) curCycleEl.textContent = formatTime(adaMeta.cycleStart || evData.cycleStart || evData.updatedAt);
        if (nextResetEl) nextResetEl.textContent = formatTime(adaMeta.resetAt || evData.resetAt);
        if (lastFetchEl) lastFetchEl.textContent = formatShortTime(evData.updatedAt);
        if (cycleRuleEl) cycleRuleEl.textContent = '高塔附属建筑 · ' + (adaMeta.cycleNote || '每周三 01:00 刷新');
      }
      return;
    }

    if (lblCurEl) lblCurEl.textContent = '本轮刷新';
    if (lblNextEl) lblNextEl.textContent = '下次刷新';
    setProgress(evData && evData.cycleStart, evData && evData.resetAt);
    if (evData) {
      if (curCycleEl) curCycleEl.textContent = formatTime(evData.cycleStart || evData.updatedAt);
      if (nextResetEl) nextResetEl.textContent = formatTime(evData.resetAt);
      if (lastFetchEl) lastFetchEl.textContent = formatShortTime(evData.updatedAt);
      if (cycleRuleEl) cycleRuleEl.textContent = evData.cycleNote || '每天 01:00 刷新';
    }
  }

  function switchTab(tab, pushHash) {
    activeTab = (tab === 'xur' || tab === 'ada') ? tab : 'eververse';
    document.body.setAttribute('data-vendor', activeTab);
    for (var i = 0; i < tabBtns.length; i++) {
      var btn = tabBtns[i];
      var isOn = btn.getAttribute('data-tab') === activeTab;
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
    if (paneEv) paneEv.hidden = activeTab !== 'eververse';
    if (paneXur) paneXur.hidden = activeTab !== 'xur';
    if (paneAda) paneAda.hidden = activeTab !== 'ada';
    updateStatusBar();
    if (pushHash) {
      try {
        var nextUrl = activeTab === 'eververse' ? location.pathname : ('#' + activeTab);
        history.replaceState(null, '', nextUrl);
      } catch (_) {}
    }
  }

  function shouldShowScreenshot(item) {
    if (!item || !item.screenshot) return false;
    var t = item.type || '';
    if (/机灵|动作|表情|投影|着色器|传送|终结技/.test(t)) return false;
    return true;
  }

  function renderCard(item, isWide, idx) {
    var rawTier = item.tier;
    var tier = (rawTier === 'exotic' || rawTier === 'rare' || rawTier === 'basic') ? rawTier : 'legendary';
    var tierText = tier === 'exotic' ? '异域' : (tier === 'rare' ? '稀有' : (tier === 'basic' ? '基础' : '传说'));
    var isSilver = item.currency === 'silver';
    var isCoin = item.currency === 'coin';
    var isGlimmer = item.currency === 'glimmer';
    var icoSrc = isCoin ? '../assets/icons/coin.webp' : (isGlimmer ? '../assets/icons/glimmer.webp' : (isSilver ? '../assets/icons/silver.webp' : '../assets/icons/dust.webp'));
    var icoAlt = isCoin ? '奇异硬币' : (isGlimmer ? '微光' : (isSilver ? '银币' : '光尘'));
    var priceClass = isCoin ? 'ev-price coin-price' : (isGlimmer ? 'ev-price glimmer-price' : (isSilver ? 'ev-price silver-price' : 'ev-price'));
    var dispName = esc(formatName(item.name));
    var dispType = esc(item.type || '');
    var iconUrl = esc(item.icon || '');
    var shotUrl = esc(item.screenshot || '');
    var imgLoad = idx < 4 ? 'fetchpriority="high"' : (idx < 8 ? '' : 'loading="lazy"');
    var nameCls = tier === 'exotic' ? 'ev-name exo' : 'ev-name';

    var priceText = '-';
    if (item.cost !== null && item.cost !== undefined) {
      priceText = esc(item.cost.toLocaleString());
    }

    var priceHtml = (
      '<span class="' + priceClass + '">' +
        '<img class="ev-price-ico" src="' + icoSrc + '" alt="' + icoAlt + '" width="13" height="13">' +
        '<span class="ev-price-val">' + priceText + '</span>' +
      '</span>'
    );

    if (isWide) {
      return (
        '<article class="ev-card ev-card-wide ' + tier + '">' +
          '<div class="ev-wide-bg">' +
            '<img class="ev-wide-img" src="' + shotUrl + '" alt=""' + (imgLoad ? ' ' + imgLoad : '') + ' decoding="async">' +
          '</div>' +
          '<div class="ev-wide-info">' +
            '<div class="ev-card-content">' +
              '<div class="ev-thumb ' + tier + '">' +
                '<img src="' + iconUrl + '" alt="' + dispName + '" width="48" height="48"' + (imgLoad ? ' ' + imgLoad : '') + ' decoding="async">' +
              '</div>' +
              '<div class="ev-body">' +
                '<span class="' + nameCls + '" title="' + dispName + '">' + dispName + '</span>' +
                '<span class="ev-meta">' +
                  '<span class="ev-tag ' + tier + '">' + tierText + '</span>' +
                  '<i class="ev-sep" aria-hidden="true"></i>' +
                  '<span class="ev-type">' + dispType + '</span>' +
                '</span>' +
              '</div>' +
            '</div>' +
            priceHtml +
          '</div>' +
        '</article>'
      );
    }

    return (
      '<article class="ev-card ev-card-compact ' + tier + '">' +
        '<div class="ev-card-content">' +
          '<div class="ev-thumb ' + tier + '">' +
            '<img src="' + iconUrl + '" alt="' + dispName + '" width="46" height="46"' + (imgLoad ? ' ' + imgLoad : '') + ' decoding="async">' +
          '</div>' +
          '<div class="ev-body">' +
            '<span class="' + nameCls + '" title="' + dispName + '">' + dispName + '</span>' +
            '<span class="ev-meta">' +
              '<span class="ev-tag ' + tier + '">' + tierText + '</span>' +
              '<i class="ev-sep" aria-hidden="true"></i>' +
              '<span class="ev-type">' + dispType + '</span>' +
            '</span>' +
          '</div>' +
        '</div>' +
        priceHtml +
      '</article>'
    );
  }

  function orderByWide(list) {
    var wide = [];
    var compact = [];
    list.forEach(function (it) {
      if (shouldShowScreenshot(it)) wide.push(it);
      else compact.push(it);
    });
    return wide.concat(compact);
  }

  function renderData(data) {
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    evData = data;

    var primary = [];
    var secondary = [];
    var silver = [];

    data.items.forEach(function (item) {
      if (item.group === '主要光尘优惠') {
        primary.push(item);
      } else if (item.group === '其他光尘优惠') {
        secondary.push(item);
      } else if (item.group === '银币新品') {
        silver.push(item);
      }
    });

    if (primaryEl && primary.length) {
      var pList = orderByWide(primary);
      primaryEl.innerHTML = pList.map(function (it, i) {
        return renderCard(it, shouldShowScreenshot(it), i);
      }).join('');
    }
    if (secondaryEl && secondary.length) {
      secondaryEl.innerHTML = secondary.map(function (it, i) {
        return renderCard(it, false, primary.length + i);
      }).join('');
    }
    if (silverEl && silver.length) {
      var sList = orderByWide(silver);
      silverEl.innerHTML = sList.map(function (it, idx) {
        return renderCard(it, shouldShowScreenshot(it), primary.length + secondary.length + idx);
      }).join('');
    }

    if (cntPrimaryEl) cntPrimaryEl.textContent = String(primary.length);
    if (cntSecondaryEl) cntSecondaryEl.textContent = String(secondary.length);
    if (cntSilverEl) cntSilverEl.textContent = String(silver.length);
    if (cntTotalEl) cntTotalEl.textContent = String(data.items.length);

    var adaItems = (data.ada && Array.isArray(data.ada.items)) ? data.ada.items : [];
    if (adaEl) {
      if (adaItems.length) {
        adaEl.innerHTML = adaItems.map(function (it, i) {
          return renderCard(it, false, i);
        }).join('');
      } else {
        var adaErr = (data.ada && data.ada.error) ? ('：' + esc(data.ada.error)) : '，待云函数刷新后展示。';
        adaEl.innerHTML = '<p class="ev-error">艾达-1（Ada-1）每周着色器数据暂未同步' + adaErr + '</p>';
      }
    }
    if (cntAdaEl) cntAdaEl.textContent = String(adaItems.length);
    if (cntAdaTotalEl) cntAdaTotalEl.textContent = String(adaItems.length);

    updateStatusBar();
    hasRenderedEv = true;
  }

  /* ── 老九 · 仄 (Xûr) 渲染逻辑（对齐装备库 .plug 光圈与 .wpn-grades 评级语言） ── */

  function gradeStep(tok) {
    var m = /^T(\d(?:\.\d)?)$/.exec(tok);
    if (m) return +m[1] <= 0.5 ? 1 : (+m[1] <= 1.5 ? 2 : 3);
    return (tok === 'S' || tok === 'A') ? 1 : ((tok === 'B' || tok === 'C') ? 2 : 3);
  }

  function gradeMarks(text, letter) {
    return esc(text).replace(letter ? /^[SABCDEF]$/ : /T\d(?:\.\d)?/g, function (m) {
      return '<b class="tg tg-' + gradeStep(m) + '">' + m + '</b>';
    });
  }

  function renderGradesHtml(grades) {
    if (!Array.isArray(grades) || (!grades[0] && !grades[1])) return '';
    var titleStr = [grades[0] ? 'Aegis ' + grades[0] : '', grades[1] ? '小棒猪 ' + grades[1] : ''].filter(Boolean).join('　');
    return (
      '<div class="xur-grades" title="' + esc(titleStr) + '">' +
        (grades[0] ? '<span class="au-a">' + gradeMarks(grades[0], true) + '</span>' : '') +
        (grades[1] ? '<span class="au-l">' + gradeMarks(grades[1], false) + '</span>' : '') +
      '</div>'
    );
  }

  function plugTitleTip(p, isIntr) {
    if (!p) return '';
    var rec = Number(p.rec || 0);
    var tip = p.name || '';
    if (rec === 3) tip += ' · Aegis + 小棒猪共同推荐';
    else if (rec === 1) tip += ' · Aegis 推荐';
    else if (rec === 2) tip += ' · 小棒猪推荐';
    else if (isIntr) tip += ' · 固有特性';
    return tip;
  }

  function plugHaloCls(rec) {
    var r = Number(rec || 0);
    return r === 3 ? ' by-al' : (r === 1 ? ' by-a' : (r === 2 ? ' by-l' : ''));
  }

  function renderPlugNode(p, isIntr) {
    if (!p) return '';
    var byCls = plugHaloCls(p.rec);
    var intrCls = isIntr ? ' is-intr' : '';
    var icoHtml = p.icon
      ? '<span class="ico"><img src="' + esc(p.icon) + '" alt="" decoding="async"></span>'
      : '';
    return (
      '<span class="r-plug xur-exo-plug' + intrCls + byCls + '" title="' + esc(plugTitleTip(p, isIntr)) + '">' +
        icoHtml +
        '<span class="nm">' + esc(p.name) + '</span>' +
      '</span>'
    );
  }

  function renderSlotPlug(p) {
    if (!p) return '';
    var byCls = plugHaloCls(p.rec);
    var icoHtml = p.icon
      ? '<span class="ico"><img src="' + esc(p.icon) + '" alt="" decoding="async"></span>'
      : '';
    return (
      '<div class="r-plug' + byCls + '" title="' + esc(plugTitleTip(p, false)) + '">' +
        icoHtml +
        esc(p.name) +
      '</div>'
    );
  }

  function renderXurExoticWeapon(it) {
    var dispName = esc(formatName(it.n));
    var dispType = esc(it.ty || '异域武器');
    var rollTag = it.rolled ? '异域 · 本周随机卷' : '异域';
    var costVal = it.cost && it.cost.n ? esc(it.cost.n) : '-';
    var chips = [];
    if (it.intr) chips.push(renderPlugNode(it.intr, true));
    (it.plugs || []).forEach(function (p) {
      chips.push(renderPlugNode(p, false));
    });
    var shotHtml = it.shot
      ? '<div class="ev-wide-bg"><img class="ev-wide-img" src="' + esc(it.shot) + '" alt="" decoding="async"></div>'
      : '';
    var gradesHtml = renderGradesHtml(it.grades);

    return (
      '<article class="ev-card ev-card-wide ev-card-exo-wpn exotic">' +
        shotHtml +
        '<div class="ev-wide-info">' +
          '<div class="ev-card-content">' +
            '<div class="ev-thumb exotic">' +
              '<img src="' + esc(it.icon) + '" alt="' + dispName + '" width="48" height="48" decoding="async">' +
            '</div>' +
            '<div class="ev-body">' +
              '<span class="ev-name exo" title="' + dispName + '">' + dispName + '</span>' +
              '<span class="ev-meta">' +
                '<span class="ev-tag exotic">' + rollTag + '</span>' +
                '<i class="ev-sep" aria-hidden="true"></i>' +
                '<span class="ev-type">' + dispType + '</span>' +
              '</span>' +
              gradesHtml +
            '</div>' +
          '</div>' +
          (chips.length ? '<div class="xur-perk-strip">' + chips.join('') + '</div>' : '') +
          '<span class="ev-price coin-price">' +
            '<img class="ev-price-ico" src="../assets/icons/coin.webp" alt="奇异硬币" width="13" height="13">' +
            '<span class="ev-price-val">' + costVal + '</span>' +
          '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function findColOps(cols, names) {
    if (!Array.isArray(cols)) return [];
    for (var i = 0; i < cols.length; i++) {
      if (names.indexOf(cols[i].lb) !== -1) return cols[i].ops || [];
    }
    return [];
  }

  function renderSlotCell(ops) {
    if (!ops || !ops.length) {
      return '<div class="r-cell r-mid r-slot"><div class="r-plug-none">无</div></div>';
    }
    return (
      '<div class="r-cell r-mid r-slot">' +
        ops.map(renderSlotPlug).join('') +
      '</div>'
    );
  }

  function renderXurLegendaryWeapons(weapons) {
    if (!weapons.length) return '';
    var rowsHtml = weapons.map(function (w) {
      var dispName = esc(formatName(w.n));
      var shortFrame = (w.intr && w.intr.name) ? w.intr.name.replace(/框架$/, '') : '';
      var subLabel = esc(w.ty || '武器') + (shortFrame ? ' · ' + esc(shortFrame) : '');
      var gradesHtml = renderGradesHtml(w.grades);

      var cBarrel = findColOps(w.cols, ['枪管', '刀刃', '发射管', '弓臂', '瞄具']);
      var cMag = findColOps(w.cols, ['弹匣', '电池', '护手']);
      var cPerk1 = findColOps(w.cols, ['特性1']);
      var cPerk2 = findColOps(w.cols, ['特性2']);
      var cOrigin = findColOps(w.cols, ['原始特性']);

      var mwInner = '<div class="r-plug-none">无</div>';
      if (w.mw && w.mw.stat) {
        var mwRec = w.mw.rec ? ' by-a' : '';
        var mwTip = w.mw.stat + (w.mw.rec ? ' · Aegis 推荐大师杰作' : '');
        var mwIco = w.mw.icon
          ? '<span class="ico"><img src="' + esc(w.mw.icon) + '" alt="" decoding="async"></span>'
          : '';
        mwInner = '<div class="r-plug r-mwp' + mwRec + '" title="' + esc(mwTip) + '">' + mwIco + esc(w.mw.stat) + '</div>';
      }

      return (
        '<article class="rec xur-r-weapon">' +
          '<div class="r-cell r-id xur-r-id">' +
            '<img src="' + esc(w.icon) + '" alt="' + dispName + '" decoding="async">' +
            '<div class="r-nm">' + dispName + '</div>' +
            '<div class="x-mini">' +
              '<div>' + subLabel + '</div>' +
            '</div>' +
            gradesHtml +
          '</div>' +
          renderSlotCell(cBarrel) +
          renderSlotCell(cMag) +
          renderSlotCell(cPerk1) +
          renderSlotCell(cPerk2) +
          renderSlotCell(cOrigin) +
          '<div class="r-cell r-mid r-slot">' + mwInner + '</div>' +
        '</article>'
      );
    }).join('');

    var costVal = (weapons[0] && weapons[0].cost && weapons[0].cost.n) ? esc(weapons[0].cost.n) : '17';

    return (
      '<section class="block" id="xur-sec-leg-wpn">' +
        '<h2 class="sect-label"><span>传说武器</span><span class="ev-section-count">' +
          '<span class="xur-halo-legend">' +
            '<span class="halo-key"><i class="by-a"></i>Aegis</span>' +
            '<span class="halo-key"><i class="by-l"></i>小棒猪</span>' +
            '<span class="halo-key"><i class="by-al"></i>双推</span>' +
          '</span>' +
          '<i class="ev-sep" aria-hidden="true"></i>' +
          '每把 <img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + costVal + '</b> · 共 <b>' + weapons.length + '</b> 把' +
        '</span></h2>' +
        '<div class="r-head xur-r-weapon">' +
          '<div class="c">武器</div>' +
          '<div class="c">枪管</div>' +
          '<div class="c">弹匣</div>' +
          '<div class="c">Perk 1</div>' +
          '<div class="c">Perk 2</div>' +
          '<div class="c">起源特性</div>' +
          '<div class="c">大师杰作</div>' +
        '</div>' +
        rowsHtml +
      '</section>'
    );
  }

  function renderXurLegendaryArmor(armors, setName) {
    if (!armors.length) return '';
    var slotOrder = ['头盔', '臂铠', '胸部护甲', '腿部护甲', '泰坦印记', '猎人披风', '术士臂环'];
    var classes = ['泰坦', '猎人', '术士'];
    var costVal = armors[0].cost && armors[0].cost.n ? esc(armors[0].cost.n) : '29';

    var rowsHtml = classes.map(function (cls) {
      var pieces = armors.filter(function (a) { return a.cls === cls; });
      pieces.sort(function (a, b) {
        return slotOrder.indexOf(a.ty) - slotOrder.indexOf(b.ty);
      });
      var cells = pieces.map(function (p) {
        var shortTy = p.ty.replace(/泰坦|猎人|术士/, '');
        return (
          '<div class="xur-armor-piece">' +
            '<div class="ev-thumb legendary">' +
              '<img src="' + esc(p.icon) + '" alt="' + esc(p.n) + '" width="36" height="36" decoding="async">' +
            '</div>' +
            '<div class="xur-armor-piece-info">' +
              '<span class="xur-armor-piece-name" title="' + esc(p.n) + '">' + esc(p.n) + '</span>' +
              '<span class="xur-armor-piece-ty">' + esc(shortTy) + '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');
      return (
        '<div class="xur-armor-row">' +
          '<span class="xur-armor-cls">' + cls + '</span>' +
          cells +
        '</div>'
      );
    }).join('');

    return (
      '<section class="block" id="xur-sec-leg-armor">' +
        '<h2 class="sect-label"><span>传说护甲 · ' + esc(setName || '套装') + '</span><span class="ev-section-count">每件 <img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + costVal + '</b> · 共 <b>' + armors.length + '</b> 件</span></h2>' +
        '<div class="xur-armor-box">' +
          '<div class="xur-armor-rows">' + rowsHtml + '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function toEvItem(it, useWide) {
    var tier = it.tier === '异域' ? 'exotic' : (it.tier === '稀有' ? 'rare' : (it.tier === '基础' ? 'basic' : 'legendary'));
    var tyLabel = (it.cls && it.cls !== '通用' ? it.cls + ' · ' : '') + (it.ty || '物品');
    return {
      name: it.n,
      type: tyLabel,
      tier: tier,
      cost: it.cost ? it.cost.n : null,
      currency: 'coin',
      icon: it.icon,
      screenshot: useWide ? it.shot : null
    };
  }

  function renderXurData(data) {
    if (!data || !Array.isArray(data.items) || !data.items.length || !xurContentEl) return;
    xurData = data;

    var titanArmor = [];
    var hunterArmor = [];
    var warlockArmor = [];
    var classExotics = [];
    var exoticWpns = [];
    var catalysts = [];
    var legWpns = [];
    var legArmors = [];
    var materials = [];

    data.items.forEach(function (it) {
      if (it.sec === '异域护甲') {
        if (it.cls === '泰坦') titanArmor.push(it);
        else if (it.cls === '猎人') hunterArmor.push(it);
        else if (it.cls === '术士') warlockArmor.push(it);
      } else if (it.sec === '职业金') {
        classExotics.push(it);
      } else if (it.sec === '异域武器') {
        exoticWpns.push(it);
      } else if (it.sec === '异域武器催化') {
        catalysts.push(it);
      } else if (it.sec === '传说武器') {
        legWpns.push(it);
      } else if (it.sec === '传说护甲') {
        legArmors.push(it);
      } else if (it.sec === '材料') {
        materials.push(it);
      }
    });

    var blocks = [];

    function pushArmorSection(id, title, list) {
      if (!list.length) return;
      blocks.push(
        '<section class="block" id="' + id + '">' +
          '<h2 class="sect-label"><span>' + title + '</span><span class="ev-section-count"><img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + list.length + '</b> 件 · 奇异硬币</span></h2>' +
          '<div class="ev-grid">' +
            list.map(function (it) {
              var mapped = toEvItem(it, Boolean(it.shot));
              return renderCard(mapped, Boolean(mapped.screenshot), 10);
            }).join('') +
          '</div>' +
        '</section>'
      );
    }

    pushArmorSection('xur-sec-titan', '泰坦 · 异域护甲', titanArmor);
    pushArmorSection('xur-sec-hunter', '猎人 · 异域护甲', hunterArmor);
    pushArmorSection('xur-sec-warlock', '术士 · 异域护甲', warlockArmor);

    if (classExotics.length) {
      blocks.push(
        '<section class="block" id="xur-sec-class-exo">' +
          '<h2 class="sect-label"><span>异域职业物品</span><span class="ev-section-count"><img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + classExotics.length + '</b> 件 · 奇异硬币</span></h2>' +
          '<div class="ev-grid-3">' +
            classExotics.map(function (it) {
              return renderCard(toEvItem(it, false), false, 10);
            }).join('') +
          '</div>' +
        '</section>'
      );
    }

    if (exoticWpns.length) {
      blocks.push(
        '<section class="block" id="xur-sec-exo-wpn">' +
          '<h2 class="sect-label"><span>异域武器</span><span class="ev-section-count"><img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + exoticWpns.length + '</b> 把 · 奇异硬币</span></h2>' +
          '<div class="ev-grid">' + exoticWpns.map(renderXurExoticWeapon).join('') + '</div>' +
        '</section>'
      );
    }

    if (catalysts.length) {
      blocks.push(
        '<section class="block" id="xur-sec-cat">' +
          '<h2 class="sect-label"><span>异域武器催化</span><span class="ev-section-count"><img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + catalysts.length + '</b> 件 · 奇异硬币</span></h2>' +
          '<div class="ev-grid">' +
            catalysts.map(function (it) {
              var mapped = toEvItem(it, false);
              mapped.type = '异域催化';
              return renderCard(mapped, false, 10);
            }).join('') +
          '</div>' +
        '</section>'
      );
    }

    if (legWpns.length) {
      blocks.push(renderXurLegendaryWeapons(legWpns));
    }

    if (legArmors.length) {
      blocks.push(renderXurLegendaryArmor(legArmors, data.armorSetName));
    }

    if (materials.length) {
      blocks.push(
        '<section class="block" id="xur-sec-mat">' +
          '<h2 class="sect-label"><span>奇异材料与记忆水晶</span><span class="ev-section-count"><img class="ev-sect-ico" src="../assets/icons/coin.webp" alt="" width="14" height="14"><b>' + materials.length + '</b> 项 · 奇异硬币</span></h2>' +
          '<div class="ev-grid">' +
            materials.map(function (it) {
              return renderCard(toEvItem(it, false), false, 0);
            }).join('') +
          '</div>' +
        '</section>'
      );
    }

    xurContentEl.innerHTML = blocks.join('');
    if (xurCntTotalEl) xurCntTotalEl.textContent = String(data.items.length);
    if (xurVendorEl && data.location) {
      xurVendorEl.textContent = '九之使者 · 仄 (Xûr) · ' + data.location;
    }
    updateStatusBar();
    hasRenderedXur = true;
  }

  function renderError(msg) {
    var html = '<p class="ev-error">光尘商店轮换数据加载失败：' + esc(msg) + '</p>';
    if (primaryEl) primaryEl.innerHTML = html;
    if (secondaryEl) secondaryEl.innerHTML = '';
    if (silverEl) silverEl.innerHTML = '';
    if (adaEl) adaEl.innerHTML = '<p class="ev-error">艾达-1（Ada-1）每周着色器数据加载失败：' + esc(msg) + '</p>';
  }

  function renderXurError(msg) {
    if (xurContentEl) {
      xurContentEl.innerHTML = '<p class="ev-error">老九（Xûr）周货数据加载失败：' + esc(msg) + '</p>';
    }
  }

  function isValidPayload(data) {
    return Boolean(data && Array.isArray(data.items) && data.items.length > 0);
  }

  // 命运 2 每日重置为北京时间（UTC+8）凌晨 01:00（17:00 UTC）。
  // 定时器按 UTC+8 在每天 01:03、周三 01:03 / 02:03 / 03:03、周六 01:03 更新。
  // 将时间戳平移 -(17h03m) = UTC+8 的日期再减 1h03m，得到当前刷新周期日标识（YYYY-MM-DD）。
  function currentCycleDay() {
    return new Date(Date.now() - (17 * 3600e3 + 180e3)).toISOString().slice(0, 10);
  }

  // 计算当前时刻（按 UTC+8）应经过的最新一档定时同步时间点：
  // 每天 01:03 (UTC+8) = 前一 UTC 自然日 17:03 UTC；
  // 若当前为 UTC+8 周三且已过 02:03 / 03:03，则对应 18:03 / 19:03 UTC。
  function latestExpectedSyncMs() {
    var now = Date.now();
    var bjt = new Date(now + 8 * 3600e3);
    var y = bjt.getUTCFullYear();
    var m = bjt.getUTCMonth();
    var d = bjt.getUTCDate();
    var w = bjt.getUTCDay();
    var mins = bjt.getUTCHours() * 60 + bjt.getUTCMinutes();
    if (mins < 63) {
      return Date.UTC(y, m, d - 1, 1, 3, 0) - 8 * 3600e3;
    }
    if (w === 3) {
      if (mins >= 183) return Date.UTC(y, m, d, 3, 3, 0) - 8 * 3600e3;
      if (mins >= 123) return Date.UTC(y, m, d, 2, 3, 0) - 8 * 3600e3;
    }
    return Date.UTC(y, m, d, 1, 3, 0) - 8 * 3600e3;
  }

  function isFreshForToday(data, resetField) {
    if (!isValidPayload(data)) return false;
    var resetTime = Date.parse(data[resetField] || '');
    if (resetTime && Date.now() >= resetTime) return false;
    if (data._cycleDay !== currentCycleDay()) return false;
    if (resetField === 'resetAt') {
      var updatedMs = Date.parse(data.updatedAt || '') || 0;
      if (updatedMs < latestExpectedSyncMs()) return false;
    }
    return true;
  }

  function fetchCloudJson(cloudUrl, cacheKey, onRender, cached, onErr) {
    // 查询串按最近一档定时同步取值：过了同步点就换一个 URL，不吃到同步前那份浏览器缓存。
    fetch(cloudUrl + '?v=' + latestExpectedSyncMs()).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!isValidPayload(data)) throw new Error('返回的条目为空');
      data._cycleDay = currentCycleDay();
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
      onRender(data);
    }).catch(function (err) {
      if (onErr && !isValidPayload(cached)) onErr(err);
    });
  }

  function init() {
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'), true);
      });
    }

    if (location.hash === '#xur' || /[?&]tab=xur/.test(location.search)) {
      switchTab('xur', false);
    } else if (location.hash === '#ada' || /[?&]tab=ada/.test(location.search)) {
      switchTab('ada', false);
    } else {
      document.body.setAttribute('data-vendor', 'eververse');
    }

    var cachedEv = null;
    var cachedXur = null;
    try { cachedEv = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (_) {}
    try { cachedXur = JSON.parse(localStorage.getItem(XUR_CACHE_KEY)); } catch (_) {}

    if (isValidPayload(cachedEv)) renderData(cachedEv);
    if (isValidPayload(cachedXur)) renderXurData(cachedXur);

    if (!isFreshForToday(cachedEv, 'resetAt')) {
      fetchCloudJson(API_URL, CACHE_KEY, renderData, cachedEv, function (err) {
        if (!hasRenderedEv) renderError(err && err.message ? err.message : String(err));
      });
    }
    if (!isFreshForToday(cachedXur, 'departure')) {
      fetchCloudJson(XUR_API_URL, XUR_CACHE_KEY, renderXurData, cachedXur, function (err) {
        if (!hasRenderedXur) renderXurError(err && err.message ? err.message : String(err));
      });
    }
    setInterval(renderProgress, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
