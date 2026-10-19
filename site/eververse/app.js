(function () {
  'use strict';

  var CACHE_KEY = 'd2_ev_cache_v8';
  var JSON_URL = '../rotation/eververse.json';

  // 立即主动清理旧版本的坏缓存
  try {
    localStorage.removeItem('d2_eververse_cache');
    localStorage.removeItem('d2_ev_cache_v1');
    localStorage.removeItem('d2_ev_cache_v2');
    localStorage.removeItem('d2_ev_cache_v3');
    localStorage.removeItem('d2_ev_cache_v4');
    localStorage.removeItem('d2_ev_cache_v5');
    localStorage.removeItem('d2_ev_cache_v6');
    localStorage.removeItem('d2_ev_cache_v7');
  } catch (_) {}

  var primaryEl = document.getElementById('ev-primary');
  var secondaryEl = document.getElementById('ev-secondary');
  var silverEl = document.getElementById('ev-silver');
  var cntPrimaryEl = document.getElementById('ev-cnt-primary');
  var cntSecondaryEl = document.getElementById('ev-cnt-secondary');
  var cntSilverEl = document.getElementById('ev-cnt-silver');
  var cntTotalEl = document.getElementById('ev-cnt-total');
  var curCycleEl = document.getElementById('ev-cur-cycle');
  var nextResetEl = document.getElementById('ev-next-reset');
  var lastFetchEl = document.getElementById('ev-last-fetch');
  var cycleRuleEl = document.getElementById('ev-cycle-rule');
  var hasRendered = false;

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

  function formatTime(isoStr) {
    if (!isoStr) return '--';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '--';
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = pad(d.getHours());
    var min = pad(d.getMinutes());
    var w = WEEKS[d.getDay()];
    return m + ' 月 ' + day + ' 日 ' + h + ':' + min + ' · ' + w;
  }

  function shouldShowScreenshot(item) {
    if (!item || !item.screenshot) return false;
    var t = item.type || '';
    if (/机灵|动作|表情|投影|着色器|传送|终结技/.test(t)) return false;
    return true;
  }

  function renderCard(item, isWide, idx) {
    var rawTier = item.tier;
    var tier = (rawTier === 'exotic' || rawTier === 'rare') ? rawTier : 'legendary';
    var tierText = tier === 'exotic' ? '异域' : (tier === 'rare' ? '稀有' : '传说');
    var isSilver = item.currency === 'silver';
    var icoSrc = isSilver ? '../assets/icons/silver.webp' : '../assets/icons/dust.webp';
    var icoAlt = isSilver ? '银币' : '光尘';
    var priceClass = isSilver ? 'ev-price silver-price' : 'ev-price';
    var dispName = esc(formatName(item.name));
    var dispType = esc(item.type || '');
    var iconUrl = esc(item.icon || '');
    var shotUrl = esc(item.screenshot || '');
    var imgLoad = idx < 4 ? 'fetchpriority="high"' : (idx < 8 ? '' : 'loading="lazy"');

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
                '<span class="ev-name" title="' + dispName + '">' + dispName + '</span>' +
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
            '<span class="ev-name" title="' + dispName + '">' + dispName + '</span>' +
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
    if (cycleRuleEl && data.cycleNote) cycleRuleEl.textContent = data.cycleNote;

    if (curCycleEl && (data.cycleStart || data.updatedAt)) {
      curCycleEl.textContent = formatTime(data.cycleStart || data.updatedAt);
    }
    if (nextResetEl && data.resetAt) {
      nextResetEl.textContent = formatTime(data.resetAt);
    }
    if (lastFetchEl && data.updatedAt) {
      var d = new Date(data.updatedAt);
      if (!isNaN(d.getTime())) {
        var m = d.getMonth() + 1;
        var day = d.getDate();
        var h = pad(d.getHours());
        var min = pad(d.getMinutes());
        lastFetchEl.textContent = m + ' 月 ' + day + ' 日 ' + h + ':' + min;
      }
    }
    hasRendered = true;
  }

  function renderError(msg) {
    var html = '<p class="ev-error">光尘商店轮换数据加载失败：' + esc(msg) + '</p>';
    if (primaryEl) primaryEl.innerHTML = html;
    if (secondaryEl) secondaryEl.innerHTML = '';
    if (silverEl) silverEl.innerHTML = '';
  }

  var API_URL = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api?a=rotation';

  function isValidPayload(data) {
    return Boolean(data && Array.isArray(data.items) && data.items.length > 0);
  }

  function saveAndRender(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
    renderData(data);
  }

  function fetchStatic() {
    var t = Date.now();
    return fetch(JSON_URL + '?t=' + t).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function fetchCloud() {
    return fetch(API_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function pickNewer(a, b) {
    if (!isValidPayload(a)) return b;
    if (!isValidPayload(b)) return a;
    var ta = new Date(a.updatedAt || 0).getTime() || 0;
    var tb = new Date(b.updatedAt || 0).getTime() || 0;
    return tb > ta ? b : a;
  }

  function fetchLatest(cached) {
    var isLocal = !location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    var primaryPromise = fetchStatic();
    var cloudPromise = isLocal ? Promise.resolve(null) : fetchCloud().catch(function () { return null; });

    Promise.all([primaryPromise.catch(function () { return null; }), cloudPromise])
      .then(function (results) {
        var best = pickNewer(results[0], results[1]);
        if (!isValidPayload(best)) {
          throw new Error('返回的条目为空');
        }
        saveAndRender(best);
      })
      .catch(function (err) {
        console.error('获取光尘商店轮换数据失败:', err);
        if (!hasRendered && !isValidPayload(cached)) {
          renderError(err && err.message ? err.message : String(err));
        }
      });
  }

  function init() {
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    } catch (_) {}

    if (isValidPayload(cached)) {
      renderData(cached);
    }

    fetchLatest(cached);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
