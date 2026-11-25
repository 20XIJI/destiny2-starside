/* 压光观测仪（power-delta 专属）。
   数据唯一来源仍是页内 .gen 表：渲染时现读，完成后用 tuck() 将表收入 .off-screen，
   并支持通过面板头栏「数据表」按钮按需原地展开完整数值。 */

export default function init(deps) {
  var tuck = deps.tuck;
  var onResize = deps.onResize;

  var W = 960;
  var H = 320;
  var PAD = { l: 52, r: 22, t: 28, b: 30 };
  var PRESETS = [-50, -30, -20, -15, -10, 0, 20, 50];

  function signed(x) {
    return x > 0 ? '+' + x : String(x);
  }

  function pctText(v) {
    var d = (v - 1) * 100;
    if (Math.abs(d) < 0.05) return '基准 100%';
    return (d > 0 ? '+' : '') + d.toFixed(1) + '%';
  }

  function chart() {
    var table = document.querySelector('.gen');
    if (!table) return;

    var heads = [].slice.call(table.querySelectorAll('thead th')).map(function (th) {
      return th.textContent.trim();
    });
    var xs = [];
    var cols = heads.slice(1).map(function () { return []; });
    [].slice.call(table.querySelectorAll('tbody tr')).forEach(function (tr) {
      var cells = [].slice.call(tr.children).map(function (c) {
        return c.textContent.trim();
      });
      xs.push(+cells[0]);
      cols.forEach(function (col, i) {
        col.push(cells[i + 1] === '' ? null : +cells[i + 1]);
      });
    });
    if (xs.length < 2 || !cols.length) return;

    var loAll = xs[0];
    var hiAll = xs[xs.length - 1];
    var xToIdx = {};
    xs.forEach(function (x, i) { xToIdx[x] = i; });

    function valAt(si, x) {
      var idx = xToIdx[x];
      if (idx === undefined) return null;
      return cols[si][idx];
    }

    function marginalAt(si, x) {
      var idx = xToIdx[x];
      if (idx === undefined) return null;
      var arr = cols[si];
      var cur = arr[idx];
      if (cur === null) return null;
      if (idx === 0) return arr[1] !== null ? +((arr[1] - cur) * 100).toFixed(2) : null;
      if (idx === xs.length - 1) return arr[idx - 1] !== null ? +((cur - arr[idx - 1]) * 100).toFixed(2) : null;
      if (x === -50 || x === 0) {
        return arr[idx - 1] !== null ? +((cur - arr[idx - 1]) * 100).toFixed(2) : null;
      }
      var prev = arr[idx - 1];
      var next = arr[idx + 1];
      if (prev === null && next === null) return null;
      if (next === null) return +((cur - prev) * 100).toFixed(2);
      if (prev === null) return +((next - cur) * 100).toFixed(2);
      return +((next - prev) * 50).toFixed(2);
    }

    function avgSlope(x1, x2) {
      var v1 = valAt(0, x1);
      var v2 = valAt(0, x2);
      if (v1 === null || v2 === null || x2 === x1) return null;
      return ((v2 - v1) / (x2 - x1) * 100).toFixed(2);
    }

    var marks = [];
    (table.dataset.marks || '').split(';').filter(Boolean).forEach(function (spec) {
      var parts = spec.trim().split(/\s+/);
      var si = heads.indexOf(parts[0]) - 1;
      if (si < 0) return;
      parts.slice(1).forEach(function (v) { marks.push({ s: si, x: +v }); });
    });

    var onList = (table.dataset.lines || '').split('、').filter(Boolean);
    var extraOn = cols.map(function (_, si) {
      if (si === 0) return true;
      return onList.length === 0 || onList.indexOf(heads[si + 1]) >= 0;
    });

    var hasCliff = valAt(0, -50) !== null && valAt(0, 0) !== null;
    var canZoom = loAll <= -50 && hiAll >= 20;
    var mode = 'mult'; // 'mult' | 'marginal' | 'ehp'
    var zoomed = false;
    var showMarks = marks.length > 0;
    var showTable = false;
    var curX = valAt(0, -30) !== null ? -30 : (valAt(0, 0) !== null ? 0 : loAll);
    var hoverX = null;
    var pins = [];

    function domain() {
      return zoomed ? [-50, 20] : [loAll, hiAll];
    }

    function px(x) {
      var d = domain();
      return PAD.l + (x - d[0]) / (d[1] - d[0]) * (W - PAD.l - PAD.r);
    }

    function py(v, ymax) {
      var clamped = Math.min(ymax, Math.max(0, v));
      return H - PAD.b - clamped / ymax * (H - PAD.t - PAD.b);
    }

    /* ── 组装 DOM 骨架 ── */
    var fig = document.createElement('figure');
    fig.className = 'chart';

    var topbar = document.createElement('div');
    topbar.className = 'chart-bar';

    var seg = document.createElement('div');
    seg.className = 'chart-seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', '视图模式');
    var modeDefs = [
      { id: 'mult', label: '伤害倍率' },
      { id: 'marginal', label: '每光收益' },
      { id: 'ehp', label: '等效怪血量' }
    ];
    var modeBtns = modeDefs.map(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mode = m.id;
      btn.textContent = m.label;
      btn.setAttribute('aria-pressed', m.id === mode ? 'true' : 'false');
      btn.addEventListener('click', function () {
        if (mode === m.id) return;
        mode = m.id;
        modeBtns.forEach(function (b) {
          b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false');
        });
        if (markBtn) markBtn.hidden = mode !== 'mult';
        render();
      });
      seg.appendChild(btn);
      return btn;
    });
    topbar.appendChild(seg);

    var ctls = document.createElement('div');
    ctls.className = 'chart-ctls';

    var zoomBtn = null;
    if (canZoom) {
      zoomBtn = document.createElement('button');
      zoomBtn.type = 'button';
      zoomBtn.className = 'chart-tog zoom';
      zoomBtn.textContent = '实战区 -50~+20';
      zoomBtn.setAttribute('aria-pressed', 'false');
      zoomBtn.addEventListener('click', function () {
        zoomed = !zoomed;
        zoomBtn.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
        if (zoomed && (curX < -50 || curX > 20)) curX = -30;
        render();
      });
      ctls.appendChild(zoomBtn);
    }

    cols.slice(1).forEach(function (_, idx) {
      var si = idx + 1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-tog s' + si;
      btn.setAttribute('aria-pressed', extraOn[si] ? 'true' : 'false');
      btn.innerHTML = '<span class="sw" aria-hidden="true"></span>' + heads[si + 1];
      btn.addEventListener('click', function () {
        extraOn[si] = !extraOn[si];
        btn.setAttribute('aria-pressed', extraOn[si] ? 'true' : 'false');
        render();
      });
      ctls.appendChild(btn);
    });

    var markBtn = null;
    if (marks.length) {
      markBtn = document.createElement('button');
      markBtn.type = 'button';
      markBtn.className = 'chart-tog';
      markBtn.textContent = '标注';
      markBtn.setAttribute('aria-pressed', 'true');
      markBtn.addEventListener('click', function () {
        showMarks = !showMarks;
        markBtn.setAttribute('aria-pressed', showMarks ? 'true' : 'false');
        render();
      });
      ctls.appendChild(markBtn);
    }

    var tblBtn = document.createElement('button');
    tblBtn.type = 'button';
    tblBtn.className = 'chart-tog';
    tblBtn.textContent = '数据表';
    tblBtn.setAttribute('aria-pressed', 'false');
    ctls.appendChild(tblBtn);

    topbar.appendChild(ctls);
    fig.appendChild(topbar);

    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'chart-canvas';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', heads[0] + '与' + heads.slice(1).join('、') + '的关系观测仪');
    canvasWrap.appendChild(svg);
    fig.appendChild(canvasWrap);

    /* 底部三格实战对照仪 */
    var deck = document.createElement('div');
    var zeroMark = (loAll < 0 && hiAll > 0)
      ? '<i class="cd-slider-zero" style="left:' + (((0 - loAll) / (hiAll - loAll)) * 100).toFixed(2) + '%" aria-hidden="true"></i>'
      : '';
    deck.className = 'chart-deck';
    deck.innerHTML =
      '<div class="cd-cell">' +
        '<div class="cd-hd">' +
          '<span class="cd-x-wrap">' + heads[0] + ' <strong class="cd-x"></strong>' +
            '<input class="cd-num" type="number" inputmode="numeric" min="' + loAll + '" max="' + hiAll + '" step="1" value="' + curX + '" aria-label="输入' + heads[0] + '数值">' +
          '</span>' +
          '<span class="cd-badge"></span>' +
        '</div>' +
        '<div class="cd-slider-row">' +
          zeroMark +
          '<input class="cd-slider" type="range" min="' + loAll + '" max="' + hiAll + '" value="' + curX + '" aria-label="选择' + heads[0] + '">' +
        '</div>' +
        '<div class="cd-quicks"></div>' +
      '</div>' +
      '<div class="cd-cell">' +
        '<div class="cd-hd">' +
          '<span>相对同光等输出</span>' +
          '<span class="cd-pct"></span>' +
        '</div>' +
        '<div class="cd-meters">' +
          '<div class="cd-mrow">' +
            '<span class="cd-mlbl">同光等</span>' +
            '<div class="cd-track"><div class="cd-fill base"></div><div class="cd-ref"></div></div>' +
            '<span class="cd-mval">1.000×</span>' +
          '</div>' +
          '<div class="cd-mrow">' +
            '<span class="cd-mlbl cd-cur-lbl">标准</span>' +
            '<div class="cd-track"><div class="cd-fill cur"></div><div class="cd-ref"></div></div>' +
            '<span class="cd-mval cd-cur-val"></span>' +
          '</div>' +
        '</div>' +
        '<div class="cd-ehp">' +
          '<span>等效怪血量（击杀耗时）</span>' +
          '<strong class="cd-ehp-val"></strong>' +
        '</div>' +
      '</div>' +
      '<div class="cd-cell">' +
        '<div class="cd-hd">' +
          '<span class="cd-cmp-title"></span>' +
          '<button type="button" class="cd-clear" hidden>清除对比</button>' +
        '</div>' +
        '<div class="cd-cmp-main">' +
          '<span class="cd-cmp-num"></span>' +
          '<span class="cd-cmp-range"></span>' +
        '</div>' +
        '<div class="cd-cmp-desc"></div>' +
      '</div>';
    fig.appendChild(deck);

    table.parentNode.insertBefore(fig, table);
    tuck(table);
    var tableBox = table.parentNode;

    tblBtn.addEventListener('click', function () {
      showTable = !showTable;
      tblBtn.setAttribute('aria-pressed', showTable ? 'true' : 'false');
      tableBox.classList.toggle('off-screen', !showTable);
    });

    var elX = deck.querySelector('.cd-x');
    var elNum = deck.querySelector('.cd-num');
    var elBadge = deck.querySelector('.cd-badge');
    var elSlider = deck.querySelector('.cd-slider');
    var elQuicks = deck.querySelector('.cd-quicks');
    var elPct = deck.querySelector('.cd-pct');
    var elCurLbl = deck.querySelector('.cd-cur-lbl');
    var elCurFill = deck.querySelector('.cd-fill.cur');
    var elCurVal = deck.querySelector('.cd-cur-val');
    var elEhpVal = deck.querySelector('.cd-ehp-val');
    var elCmpTitle = deck.querySelector('.cd-cmp-title');
    var elClear = deck.querySelector('.cd-clear');
    var elCmpNum = deck.querySelector('.cd-cmp-num');
    var elCmpRange = deck.querySelector('.cd-cmp-range');
    var elCmpDesc = deck.querySelector('.cd-cmp-desc');

    var quickBtns = [];
    PRESETS.forEach(function (v) {
      if (valAt(0, v) === null) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cd-qchip';
      b.dataset.x = String(v);
      b.textContent = signed(v);
      b.addEventListener('click', function () {
        curX = v;
        if (zoomed && (v < -50 || v > 20)) {
          zoomed = false;
          if (zoomBtn) zoomBtn.setAttribute('aria-pressed', 'false');
        }
        render();
      });
      elQuicks.appendChild(b);
      quickBtns.push(b);
    });

    function applySliderVal(v) {
      curX = Math.max(loAll, Math.min(hiAll, Math.round(v)));
      if (zoomed && (curX < -50 || curX > 20)) {
        zoomed = false;
        if (zoomBtn) zoomBtn.setAttribute('aria-pressed', 'false');
        render();
      } else {
        drawOverlay(curX);
        updateDeck(curX);
      }
    }
    elSlider.addEventListener('pointerdown', function () {
      deck.classList.add('is-dragging');
    });
    var endCdDrag = function () { deck.classList.remove('is-dragging'); };
    window.addEventListener('pointerup', endCdDrag);
    window.addEventListener('pointercancel', endCdDrag);
    elSlider.addEventListener('blur', endCdDrag);
    elSlider.addEventListener('input', function () {
      applySliderVal(+elSlider.value);
    });
    if (elNum) {
      elNum.addEventListener('input', function () {
        var raw = String(elNum.value || '').trim();
        if (raw === '' || raw === '-' || raw === '+') return;
        var n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (n < loAll || n > hiAll) return;
        applySliderVal(n);
      });
      elNum.addEventListener('blur', function () { elNum.value = String(curX); });
    }

    elClear.addEventListener('click', function () {
      pins = [];
      render();
    });

    var topMult = 0;
    cols.forEach(function (col) {
      col.forEach(function (v) { if (v !== null && v > topMult) topMult = v; });
    });
    var ymaxMult = Math.ceil(topMult / 0.2) * 0.2 || 1.2;

    function updateDeck(x) {
      var v0 = valAt(0, x);
      if (v0 === null) return;
      var v1 = cols.length > 1 ? valAt(1, x) : null;
      var useS1 = cols.length > 1 && extraOn[1] && v1 !== null;
      var activeVal = useS1 ? v1 : v0;

      elX.textContent = signed(x);
      elSlider.value = String(x);
      if (elNum && document.activeElement !== elNum) elNum.value = String(x);

      if (x <= -50) {
        elBadge.textContent = '极度衰减区';
        elBadge.className = 'cd-badge danger';
      } else if (x < 0) {
        elBadge.textContent = '陡坡压光区';
        elBadge.className = 'cd-badge';
      } else if (x === 0) {
        elBadge.textContent = '同光等基准';
        elBadge.className = 'cd-badge gain';
      } else {
        elBadge.textContent = '缓增收益区';
        elBadge.className = 'cd-badge gain';
      }

      quickBtns.forEach(function (b) {
        b.classList.toggle('active', +b.dataset.x === x);
      });

      elPct.textContent = pctText(activeVal);
      elPct.className = 'cd-pct ' + (useS1 ? 's1' : (activeVal >= 1 ? 's1' : 's0'));

      elCurLbl.textContent = useS1 ? heads[2] : '标准';
      elCurFill.style.width = Math.min(100, activeVal / ymaxMult * 100).toFixed(1) + '%';
      elCurFill.className = 'cd-fill cur' + (useS1 ? ' s1' : '');
      elCurVal.textContent = activeVal.toFixed(3) + '×';
      elCurVal.className = 'cd-mval cd-cur-val ' + (useS1 ? 's1' : 's0');

      if (activeVal <= 0.0005) {
        elEhpVal.textContent = '免疫 (∞)';
        elEhpVal.className = 'cd-ehp-val hard';
      } else {
        var ehp = 1 / activeVal;
        elEhpVal.textContent = ehp.toFixed(2) + '×';
        elEhpVal.className = 'cd-ehp-val' + (ehp > 1.3 ? ' hard' : (ehp < 0.99 ? ' easy' : ''));
      }

      if (pins.length === 2) {
        var a = Math.min(pins[0], pins[1]);
        var b = Math.max(pins[0], pins[1]);
        var va = valAt(0, a);
        var vb = valAt(0, b);
        var rel = va > 0 ? (vb / va - 1) * 100 : Infinity;
        elCmpTitle.textContent = '两点对比（标准）';
        elClear.hidden = false;
        elCmpNum.textContent = isFinite(rel) ? '+' + rel.toFixed(1) + '%' : '∞';
        elCmpNum.className = 'cd-cmp-num hi';
        elCmpRange.textContent = signed(a) + ' → ' + signed(b) + ' (+' + (b - a) + ' 光)';
        var ea = va > 0 ? (1 / va).toFixed(2) + '×' : '∞';
        var eb = (1 / vb).toFixed(2) + '×';
        elCmpDesc.textContent = va.toFixed(3) + '× → ' + vb.toFixed(3) + '× · 等效血量 ' + ea + ' → ' + eb;
      } else {
        elClear.hidden = pins.length === 0;
        var target = Math.min(hiAll, x + 10);
        var step = target - x;
        if (step === 0) {
          elCmpTitle.textContent = '已达压光上限';
          elCmpNum.textContent = '+' + ((v0 - 1) * 100).toFixed(1) + '%';
          elCmpNum.className = 'cd-cmp-num';
          elCmpRange.textContent = '相对 0 光等';
          elCmpDesc.textContent = '再往上的压光收益已封顶 · 点击图面可钉住两点对比';
        } else {
          var vt = valAt(0, target);
          var gain = v0 > 0 ? (vt / v0 - 1) * 100 : Infinity;
          elCmpTitle.textContent = '再升 +' + step + ' 光相对增伤';
          elCmpNum.textContent = isFinite(gain) ? '+' + gain.toFixed(1) + '%' : '破免疫';
          elCmpNum.className = 'cd-cmp-num' + (gain >= 20 ? ' hi' : '');
          elCmpRange.textContent = signed(x) + ' → ' + signed(target);
          elCmpDesc.textContent = v0.toFixed(3) + '× → ' + vt.toFixed(3) + '× · ' +
            (pins.length === 1 ? '已钉住 ' + signed(pins[0]) + '，再点一处对比' : '点击图面可钉住两点对比');
        }
      }
    }

    function fits(X, Y, s) {
      var ax = X + 22 * s;
      var ay = Y + 20 * s;
      return ay > PAD.t + 14 && ay < H - PAD.b - 14 &&
        (s > 0 ? ax + 82 < W - 4 : ax - 82 > PAD.l);
    }

    function markCallout(x, si) {
      if (!extraOn[si]) return '';
      var d = domain();
      if (x < d[0] || x > d[1]) return '';
      var v = valAt(si, x);
      if (v === null) return '';
      var X = px(x);
      var Y = py(v, ymaxMult);
      var s = si % 2 === 0 ? 1 : -1;
      if (!fits(X, Y, s)) s = -s;
      var ax = X + 22 * s;
      var ay = Y + 20 * s;
      var dx = X - ax;
      var dy = Y - ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len;
      var uy = dy / len;
      var x1 = ax + ux * 6;
      var y1 = ay + uy * 6;
      var x2 = X - ux * 5.5;
      var y2 = Y - uy * 5.5;
      var pw = 78;
      var ph = 20;
      var rx = s > 0 ? ax - 4 : ax - pw + 4;
      var ry = ay - ph / 2;
      var tx = s > 0 ? ax + 2 : ax - 2;
      return '<g class="mark-g" data-x="' + x + '">' +
        '<line class="lead" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
        '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>' +
        '<rect class="pill" x="' + rx.toFixed(1) + '" y="' + ry.toFixed(1) +
        '" width="' + pw + '" height="' + ph + '" rx="4"/>' +
        '<circle class="dot s' + si + '" cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="3.5"/>' +
        '<text class="tag s' + si + '" x="' + tx.toFixed(1) + '" y="' + (ay + 0.5).toFixed(1) +
        '" text-anchor="' + (s > 0 ? 'start' : 'end') + '"><tspan class="k">' +
        signed(x) + '</tspan> ' + v.toFixed(3) + '</text></g>';
    }

    var hovLayer = null;
    var markGroups = [];

    function drawOverlay(x) {
      if (!hovLayer) return;
      markGroups.forEach(function (g) {
        g.style.display = (+g.dataset.x === x) ? 'none' : '';
      });
      var d = domain();
      if (x === null || x < d[0] || x > d[1]) {
        hovLayer.innerHTML = '';
        return;
      }
      var X = px(x);
      var out = '<line class="cursor-v" x1="' + X.toFixed(1) + '" x2="' + X.toFixed(1) +
        '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>';

      var ymax = mode === 'mult' ? ymaxMult : (mode === 'marginal' ? 2.4 : 10);
      var val0;
      var label0;
      var cls0 = 's0';
      if (mode === 'mult') {
        val0 = valAt(0, x);
        label0 = val0.toFixed(3) + '×';
      } else if (mode === 'marginal') {
        val0 = marginalAt(0, x);
        label0 = '+' + val0.toFixed(2) + '%/光';
      } else {
        var m = valAt(0, x);
        val0 = m > 0 ? Math.min(10, 1 / m) : 10;
        label0 = m > 0 ? (1 / m).toFixed(2) + '×' : '∞';
        cls0 = 'ehp';
      }
      var Y0 = py(val0, ymax);
      out += '<circle class="dot ' + cls0 + '" cx="' + X.toFixed(1) + '" cy="' + Y0.toFixed(1) + '" r="4"/>';

      var rightSide = X < W - 150;
      var pw = mode === 'marginal' ? 108 : 92;
      var bx = rightSide ? X + 10 : X - pw - 10;
      var by = Math.max(PAD.t + 4, Math.min(H - PAD.b - 24, Y0 - 11));
      out += '<rect class="pill active" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) +
        '" width="' + pw + '" height="22" rx="4"/>';
      out += '<text class="tag ' + cls0 + '" x="' + (bx + pw / 2).toFixed(1) + '" y="' + (by + 11.5).toFixed(1) +
        '" text-anchor="middle"><tspan class="k">' + signed(x) + '</tspan> ' + label0 + '</text>';

      if (cols.length > 1 && extraOn[1] && valAt(1, x) !== null && mode !== 'ehp') {
        var val1 = mode === 'mult' ? valAt(1, x) : marginalAt(1, x);
        var Y1 = py(val1, ymax);
        out += '<circle class="dot s1" cx="' + X.toFixed(1) + '" cy="' + Y1.toFixed(1) + '" r="3.5"/>';
      }
      hovLayer.innerHTML = out;
    }

    function render() {
      var d = domain();
      var lo = d[0];
      var hi = d[1];
      var o = [];
      var ymax = mode === 'mult' ? ymaxMult : (mode === 'marginal' ? 2.4 : 10);
      var yTicks = mode === 'mult' ? [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2]
        : (mode === 'marginal' ? [0, 0.5, 1.0, 1.5, 2.0] : [0, 2, 4, 6, 8, 10]);

      o.push('<defs>' +
        '<linearGradient id="pd-area-0" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" class="grad-s0" stop-opacity="0.18"/>' +
          '<stop offset="100%" class="grad-s0" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<linearGradient id="pd-area-1" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" class="grad-s1" stop-opacity="0.14"/>' +
          '<stop offset="100%" class="grad-s1" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<linearGradient id="pd-area-ehp" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" class="grad-ehp" stop-opacity="0.2"/>' +
          '<stop offset="100%" class="grad-ehp" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>');

      var floorY = H - PAD.b;
      var plotH = H - PAD.t - PAD.b;

      /* 三段机制分带与实算斜率 */
      if (hasCliff) {
        var xNeg50 = px(-50);
        var xZero = px(0);
        if (!zoomed) {
          var sLow = avgSlope(loAll, -50);
          o.push('<rect class="zone-low" x="' + PAD.l + '" y="' + PAD.t +
            '" width="' + (xNeg50 - PAD.l).toFixed(1) + '" height="' + plotH + '"/>');
          o.push('<line class="cliff-v" x1="' + xNeg50.toFixed(1) + '" x2="' + xNeg50.toFixed(1) +
            '" y1="' + PAD.t + '" y2="' + floorY + '"/>');
          o.push('<text class="zone-lbl" x="' + ((PAD.l + xNeg50) / 2).toFixed(1) +
            '" y="17" text-anchor="middle">极度衰减 · +' + sLow + '%/光</text>');
        }
        var sMid = avgSlope(-50, 0);
        var sHi = avgSlope(0, hiAll);
        var midLeft = Math.max(PAD.l, xNeg50);
        o.push('<rect class="zone-steep" x="' + midLeft.toFixed(1) + '" y="' + PAD.t +
          '" width="' + (xZero - midLeft).toFixed(1) + '" height="' + plotH + '"/>');
        o.push('<text class="zone-lbl" x="' + ((midLeft + xZero) / 2).toFixed(1) +
          '" y="17" text-anchor="middle">核心陡坡 · +' + sMid + '%/光</text>');
        o.push('<text class="zone-lbl" x="' + ((xZero + W - PAD.r) / 2).toFixed(1) +
          '" y="17" text-anchor="middle">缓增区 · +' + sHi + '%/光</text>');
      }

      /* 横向网格与纵刻度 */
      yTicks.forEach(function (v) {
        if (v > ymax + 1e-6) return;
        var y = py(v, ymax);
        var isBase = (mode === 'mult' && Math.abs(v - 1.0) < 1e-6) || (mode === 'ehp' && v === 2);
        var lineCls = v === 0 ? 'axis' : (mode === 'mult' && Math.abs(v - 1.0) < 1e-6 ? 'base-h' : 'grid');
        o.push('<line class="' + lineCls + '" x1="' + PAD.l + '" x2="' + (W - PAD.r) +
          '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
        var txt = mode === 'mult' ? v.toFixed(1) + '×'
          : (mode === 'marginal' ? v.toFixed(1) + '%' : (v === 10 ? '10×+' : v + '×'));
        o.push('<text class="tick ty' + (isBase ? ' base' : '') + '" x="' + (PAD.l - 8) +
          '" y="' + (y + 4).toFixed(1) + '">' + txt + '</text>');
      });

      /* 横轴刻度 */
      var xStep = zoomed ? 10 : 25;
      for (var k = Math.ceil(lo / xStep) * xStep; k <= hi; k += xStep) {
        var xk = px(k);
        o.push('<line class="axis" x1="' + xk.toFixed(1) + '" x2="' + xk.toFixed(1) +
          '" y1="' + floorY + '" y2="' + (floorY + 5) + '"/>');
        o.push('<text class="tick' + (k === 0 ? ' base' : '') + '" x="' + xk.toFixed(1) +
          '" y="' + (floorY + 20) + '">' + signed(k) + '</text>');
      }
      if (lo < 0 && hi > 0) {
        var xz = px(0);
        o.push('<line class="base-v" x1="' + xz.toFixed(1) + '" x2="' + xz.toFixed(1) +
          '" y1="' + PAD.t + '" y2="' + floorY + '"/>');
      }

      if (mode === 'mult') {
        var stemStep = zoomed ? 2 : 5;
        for (var sx = lo; sx <= hi; sx += stemStep) {
          var sv = valAt(0, sx);
          if (sv === null) continue;
          var sxp = px(sx);
          o.push('<line class="stem" x1="' + sxp.toFixed(1) + '" x2="' + sxp.toFixed(1) +
            '" y1="' + floorY + '" y2="' + py(sv, ymax).toFixed(1) + '"/>');
        }
        cols.forEach(function (col, si) {
          if (!extraOn[si]) return;
          var pts = [];
          for (var x = lo; x <= hi; x++) {
            var v = valAt(si, x);
            if (v !== null) pts.push([px(x).toFixed(1), py(v, ymax).toFixed(1)]);
          }
          if (!pts.length) return;
          var ld = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
          var ad = ld + ' L' + pts[pts.length - 1][0] + ' ' + floorY + ' L' + pts[0][0] + ' ' + floorY + ' Z';
          if (si <= 1) o.push('<path d="' + ad + '" fill="url(#pd-area-' + si + ')"/>');
          o.push('<path class="line s' + si + '" d="' + ld + '"/>');
        });
        if (showMarks) {
          marks.forEach(function (m) {
            if (pins.indexOf(m.x) < 0) o.push(markCallout(m.x, m.s));
          });
        }
      } else if (mode === 'marginal') {
        var stepM = zoomed ? 1 : 2;
        var bw = Math.max(2, (W - PAD.l - PAD.r) / ((hi - lo) / stepM) * 0.68);
        for (var mx = lo; mx <= hi; mx += stepM) {
          var mv = marginalAt(0, mx);
          if (mv === null) continue;
          var my = py(mv, ymax);
          var mcls = (mx > -50 && mx <= 0) ? 'bar-m steep' : 'bar-m';
          o.push('<rect class="' + mcls + '" x="' + (px(mx) - bw / 2).toFixed(1) +
            '" y="' + my.toFixed(1) + '" width="' + bw.toFixed(1) +
            '" height="' + Math.max(0, floorY - my).toFixed(1) + '" rx="1"/>');
          if (cols.length > 1 && extraOn[1]) {
            var mv1 = marginalAt(1, mx);
            if (mv1 !== null) {
              o.push('<circle class="dot-m1" cx="' + px(mx).toFixed(1) +
                '" cy="' + py(mv1, ymax).toFixed(1) + '" r="1.6"/>');
            }
          }
        }
      } else {
        var epts = [];
        for (var ex = lo; ex <= hi; ex++) {
          var em = valAt(0, ex);
          if (em === null) continue;
          var ev = em > 0 ? Math.min(10, 1 / em) : 10;
          epts.push([px(ex).toFixed(1), py(ev, ymax).toFixed(1)]);
        }
        if (epts.length) {
          var eld = epts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
          var ead = eld + ' L' + epts[epts.length - 1][0] + ' ' + floorY + ' L' + epts[0][0] + ' ' + floorY + ' Z';
          o.push('<path d="' + ead + '" fill="url(#pd-area-ehp)"/>');
          o.push('<path class="line ehp" d="' + eld + '"/>');
        }
        var y1x = py(1, ymax);
        o.push('<line class="base-h" x1="' + PAD.l + '" x2="' + (W - PAD.r) +
          '" y1="' + y1x.toFixed(1) + '" y2="' + y1x.toFixed(1) + '"/>');
      }

      pins.forEach(function (p) {
        if (p < lo || p > hi) return;
        var xp = px(p);
        o.push('<line class="pin-v" x1="' + xp.toFixed(1) + '" x2="' + xp.toFixed(1) +
          '" y1="' + PAD.t + '" y2="' + floorY + '"/>');
        o.push('<rect class="pill pin" x="' + (xp - 20).toFixed(1) + '" y="' + (PAD.t + 4) +
          '" width="40" height="18" rx="3"/>');
        o.push('<text class="tag s1" x="' + xp.toFixed(1) + '" y="' + (PAD.t + 13.5) +
          '" text-anchor="middle">' + signed(p) + '</text>');
      });

      o.push('<g class="hover"></g>');
      svg.innerHTML = o.join('');
      hovLayer = svg.querySelector('.hover');
      markGroups = [].slice.call(svg.querySelectorAll('.mark-g'));
      drawOverlay(hoverX !== null ? hoverX : curX);
      updateDeck(hoverX !== null ? hoverX : curX);
    }

    var box = null;
    function drop() { box = null; }
    onResize(drop);
    addEventListener('scroll', drop, { passive: true });

    function pick(e) {
      var d = domain();
      var r = box || (box = svg.getBoundingClientRect());
      var x = d[0] + ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * (d[1] - d[0]);
      return Math.min(d[1], Math.max(d[0], Math.round(x)));
    }

    var spot = null;
    var queued = false;
    svg.addEventListener('pointermove', function (e) {
      spot = pick(e);
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (spot === null) return;
        hoverX = spot;
        drawOverlay(hoverX);
        updateDeck(hoverX);
      });
    });
    svg.addEventListener('pointerleave', function () {
      spot = null;
      hoverX = null;
      drawOverlay(curX);
      updateDeck(curX);
    });
    svg.addEventListener('click', function (e) {
      var x = pick(e);
      curX = x;
      var at = pins.indexOf(x);
      if (at >= 0) pins.splice(at, 1);
      else {
        if (pins.length >= 2) pins.shift();
        pins.push(x);
      }
      render();
    });

    render();
  }

  return chart();
}
