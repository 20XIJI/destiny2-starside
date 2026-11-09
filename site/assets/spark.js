/* 行内迷你走势图（10s–60s 分段 DPS 列组）与核心 DPS 区间副行排印：
   从表格单元格现读，不写进 HTML 产出；只有含 10s–60s 列组的页面由 app.js 懒加载。 */

export default function init(heads, spk) {
  var table = document.querySelector('.gen');
  if (!table || spk.length < 2) return;

  var names = heads.map(function (th) { return th.textContent.trim(); });
  var iEndDps = names.indexOf('结束 DPS');
  var iEndT = names.indexOf('结束时间');
  var iTot = names.indexOf('结束总伤');
  var iCore = names.indexOf('核心 DPS');
  var iCont = names.indexOf('可续');
  var iRange = names.indexOf('区间');
  var xs = spk.map(function (i) { return parseFloat(names[i]); });
  var rows = [].slice.call(table.querySelectorAll('tbody tr'));

  function fmt(n) {
    var s = String(Math.round(n));
    return s.length > 4
      ? '<span class="g">' + s.slice(0, -3) + '</span><span class="g">' + s.slice(-3) + '</span>'
      : s;
  }

  rows.forEach(function (tr) {
    var c = tr.children;
    if (iCont >= 0 && c[iCont]) {
      c[iCont].setAttribute('data-cont', c[iCont].textContent.trim() === '●' ? '1' : '0');
    }
    if (iEndDps >= 0 && c[iEndDps]) {
      var edV = parseFloat(c[iEndDps].textContent);
      if (!isNaN(edV)) c[iEndDps].innerHTML = fmt(edV);
    }
    if (iTot >= 0 && c[iTot]) {
      var totV = parseFloat(c[iTot].textContent);
      if (!isNaN(totV)) c[iTot].innerHTML = fmt(totV);
    }
    if (iRange >= 0 && c[iRange]) {
      var m = c[iRange].textContent.trim().split('–');
      if (m.length === 2) {
        c[iRange].innerHTML = '<span class="rng"><span>' + m[0] + '</span><i>–</i><span>' + m[1] + '</span></span>';
      }
    }
  });

  var spkCellIdx = spk[0];
  var tmin = 8, tmax = 60, allV = [];
  var parsed = rows.map(function (tr) {
    var c = tr.children;
    var pts = [];
    spk.forEach(function (ci, k) {
      var v = parseFloat(c[ci].textContent);
      if (!isNaN(v)) {
        pts.push({ t: xs[k], v: v, k: names[ci] });
        allV.push(v);
      }
    });
    var et = iEndT >= 0 ? parseFloat(c[iEndT].textContent) : NaN;
    var ed = iEndDps >= 0 ? parseFloat(c[iEndDps].textContent.replace(/\s+/g, '')) : NaN;
    var endItem = null;
    if (!isNaN(et) && !isNaN(ed)) {
      endItem = { t: et, v: ed, k: '结束 (' + et + 's)', end: true };
      if (et <= tmax && (!pts.length || et > pts[pts.length - 1].t)) {
        pts.push(endItem);
        allV.push(ed);
      }
    }
    var items = pts.slice();
    if (endItem && items.indexOf(endItem) < 0) items.push(endItem);
    var tier = (iCore >= 0 && c[iCore].dataset.tier) || '5';
    return { cell: c[spkCellIdx], pts: pts, items: items, tier: tier };
  });

  allV.sort(function (a, b) { return a - b; });
  var vlo = allV.length ? allV[Math.floor(allV.length * 0.03)] * 0.88 : 0;
  var vhi = allV.length ? allV[Math.min(allV.length - 1, Math.floor(allV.length * 0.985))] * 1.15 : 1;
  var vspan = Math.max(1, vhi - vlo);

  function norm(v) {
    var u = Math.max(0, Math.min(1, (v - vlo) / vspan));
    return Math.pow(u, 0.85);
  }

  var W = 86, H = 26, L = 3, R = 3, T = 3, B = 3, spanH = H - T - B;
  function px(t) {
    var cl = Math.max(tmin, Math.min(tmax, t));
    return L + ((cl - tmin) / (tmax - tmin)) * (W - L - R);
  }

  var grid = xs.map(function (t) {
    var x = px(t).toFixed(1);
    return '<line class="spk-tick" x1="' + x + '" y1="1" x2="' + x + '" y2="' + (H - 1) + '"/>';
  }).join('') + '<line class="spk-base" x1="1" y1="' + (H - 1) + '" x2="' + (W - 1) + '" y2="' + (H - 1) + '"/>';

  var byCell = new Map();
  parsed.forEach(function (row) {
    var pts = row.pts;
    if (!pts.length) return;
    var hi = pts[0].v;
    for (var i = 1; i < pts.length; i++) if (pts[i].v > hi) hi = pts[i].v;
    var hiN = norm(hi), floorN = hiN * 0.28;
    pts.forEach(function (p) {
      p.x = px(p.t);
      var drop = (hiN - norm(p.v)) * 2.1;
      var u = Math.max(floorN, Math.min(1, hiN - drop));
      p.y = H - B - u * spanH;
    });
    var coords = pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); });
    var x0 = pts[0].x.toFixed(1), x1 = pts[pts.length - 1].x.toFixed(1);
    var y1 = pts[pts.length - 1].y.toFixed(1);
    var area = pts.length > 1
      ? '<polygon class="spk-area" points="' + x0 + ',' + (H - 1) + ' ' + coords.join(' ') + ' ' + x1 + ',' + (H - 1) + '"/>'
      : '<line class="spk-stem" x1="' + x1 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + (H - 1) + '"/>';
    var line = pts.length > 1
      ? '<polyline class="spk-line" points="' + coords.join(' ') + '"/>'
      : '';
    var dots = pts.slice(0, -1).map(function (p) {
      return '<circle class="spk-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="1.4"/>';
    }).join('') + '<circle class="spk-end" cx="' + x1 + '" cy="' + y1 + '" r="2.1"/>';

    var box = document.createElement('span');
    box.className = 'spk';
    box.setAttribute('data-tier', row.tier);
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">'
      + grid + area + line + dots
      + '<line class="spk-cur" y1="0" y2="' + H + '" hidden/>'
      + '<circle class="spk-focus" r="2.8" hidden/>'
      + '</svg>';
    row.cell.appendChild(box);
    row.svg = box.firstChild;
    row.cur = row.svg.querySelector('.spk-cur');
    row.focus = row.svg.querySelector('.spk-focus');
    byCell.set(row.cell, row);
  });

  var tip = document.createElement('div');
  tip.className = 'spk-tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  var curRow = null, curIdx = -1;

  function clearRow() {
    if (!curRow) return;
    curRow.cur.setAttribute('hidden', '');
    curRow.focus.setAttribute('hidden', '');
    curRow = null;
    curIdx = -1;
    tip.hidden = true;
  }

  function renderTip(row, activePt) {
    tip.setAttribute('data-tier', row.tier);
    tip.innerHTML = row.items.map(function (it) {
      var cls = (it === activePt ? ' class="on"' : '') + (it.end ? ' data-end' : '');
      return '<div' + cls + '><span>' + it.k + '</span><b>' + fmt(it.v) + '</b></div>';
    }).join('');
    tip.hidden = false;
  }

  function placeTip(cell) {
    var r = cell.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = r.left + (r.width - tw) / 2;
    left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
    var top = r.bottom + 6;
    if (top + th > window.innerHeight - 8) top = r.top - th - 6;
    tip.style.transform = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
  }

  table.addEventListener('pointermove', function (e) {
    var cell = e.target.closest && e.target.closest('td');
    var row = cell && byCell.get(cell);
    if (!row) {
      if (curRow) clearRow();
      return;
    }
    var sr = row.svg.getBoundingClientRect();
    var mx = ((e.clientX - sr.left) / sr.width) * W;
    var best = 0, bestD = Infinity;
    for (var i = 0; i < row.pts.length; i++) {
      var d = Math.abs(row.pts[i].x - mx);
      if (d < bestD) { bestD = d; best = i; }
    }
    var pt = row.pts[best];
    if (row !== curRow || best !== curIdx) {
      if (curRow && curRow !== row) {
        curRow.cur.setAttribute('hidden', '');
        curRow.focus.setAttribute('hidden', '');
      }
      curRow = row;
      curIdx = best;
      var x = pt.x.toFixed(1), y = pt.y.toFixed(1);
      row.cur.setAttribute('x1', x);
      row.cur.setAttribute('x2', x);
      row.cur.removeAttribute('hidden');
      row.focus.setAttribute('cx', x);
      row.focus.setAttribute('cy', y);
      row.focus.removeAttribute('hidden');
      renderTip(row, pt);
      placeTip(cell);
    }
  });

  table.addEventListener('pointerleave', clearRow);
  window.addEventListener('scroll', function () { if (curRow) clearRow(); }, { passive: true });

  heads[spk[0]].setAttribute('data-spk-head', '分段 DPS');
  table.setAttribute('data-spk', '');
}
