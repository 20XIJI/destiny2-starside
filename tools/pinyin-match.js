/* 资料库物品名的拼音与英文匹配。介绍与正文不走这里。

   词典是构建时按资料库物品名用过的汉字裁过的 window.starsidePinyin。
   白名单 window.starsidePyItems 是那些中文名（物品、套装、护甲模组族），
   window.starsidePyEn 与它同序，是库里与中文不同的英文名。
   拼音与英文只打在白名单里的名字上；中文子串匹配不受这一条限。
   逐字消耗查询串：一个汉字可以吃掉它的全文拼音、声母（zh/ch/sh 两个字母）、
   音序（首字母），或查询已经打完时的音节前缀。标点跳过不消耗查询。
   从名字里任一处起头，一旦开始就必须连着匹配，中间不能跳字。 */
(function (D, ITEMS, EN) {
  'use strict';
  if (!D) return;

  var SET = null;
  function itemSet() {
    if (SET) return SET;
    SET = Object.create(null);
    if (ITEMS) {
      for (var i = 0; i < ITEMS.length; i++) SET[ITEMS[i]] = 1;
    }
    return SET;
  }

  /* 与 resolve.norm 同一条：去汉字与拉丁之间的排版空格，去站内自加的消歧括注。 */
  function foldName(s) {
    s = String(s || '').replace(/^\s+|\s+$/g, '');
    s = s.replace(/([\u4e00-\u9fff])[ \u00a0](?=[0-9A-Za-z])/g, '$1');
    s = s.replace(/([0-9A-Za-z%])[ \u00a0](?=[\u4e00-\u9fff])/g, '$1');
    s = s.replace(/（[^（）]*）$/, '');
    return s.replace(/^\s+|\s+$/g, '');
  }

  function isItem(name) {
    var bag = itemSet();
    if (bag[name]) return true;
    var n = foldName(name);
    return n !== name && !!bag[n];
  }

  var ENI = null;
  function enMap() {
    if (ENI) return ENI;
    ENI = Object.create(null);
    if (ITEMS && EN) {
      for (var i = 0; i < ITEMS.length; i++) {
        if (EN[i]) ENI[ITEMS[i]] = EN[i];
      }
    }
    return ENI;
  }

  function enOf(name) {
    var bag = enMap();
    if (bag[name]) return bag[name];
    var n = foldName(name);
    return n !== name && bag[n] ? bag[n] : '';
  }

  function foldEn(s) {
    return String(s || '').toLowerCase().replace(/[\s.'’\-]/g, '');
  }

  function match(text, q) {
    q = String(q).toLowerCase();
    text = String(text).toLowerCase();
    if (!q) return true;
    var memo = {};
    function walk(ti, qi) {
      if (qi >= q.length) return true;
      if (ti >= text.length) return false;
      var key = ti + '/' + qi;
      if (memo[key] !== undefined) return memo[key];
      var ch = text.charAt(ti);
      var code = ch.charCodeAt(0);
      if (code < 48 || (code > 57 && code < 97) || (code > 122 && (code < 0x4e00 || code > 0x9fff))) {
        return (memo[key] = walk(ti + 1, qi));
      }
      if (ch === q.charAt(qi) && walk(ti + 1, qi + 1)) return (memo[key] = true);
      var pack = D[ch];
      if (pack) {
        var pys = pack.split(',');
        for (var i = 0; i < pys.length; i++) {
          var py = pys[i], max = 0;
          while (max < py.length && qi + max < q.length && py.charAt(max) === q.charAt(qi + max)) max++;
          for (var n = max; n >= 1; n--) {
            var rest = qi + n === q.length;
            var full = n === py.length;
            var ini = n === 1 || (n === 2 && py.charAt(1) === 'h' && 'zcs'.indexOf(py.charAt(0)) >= 0);
            if ((full || rest || ini) && walk(ti + 1, qi + n)) return (memo[key] = true);
          }
        }
      }
      return (memo[key] = false);
    }
    for (var s = 0; s < text.length; s++) {
      if (walk(s, 0)) return true;
    }
    return false;
  }

  function hit(name, terms) {
    var low = String(name || '').toLowerCase();
    var py = isItem(name);
    var en = py ? enOf(name) : '';
    var enLow = en ? en.toLowerCase() : '';
    var enFolded = en ? foldEn(en) : '';
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t) continue;
      if (low.indexOf(t) !== -1) continue;
      if (enLow && enLow.indexOf(t) !== -1) continue;
      if (enFolded && enFolded.indexOf(foldEn(t)) !== -1) continue;
      if (py && /[a-z]/.test(t) && match(name, t)) continue;
      return false;
    }
    return true;
  }

  window.starsidePy = { match: match, hit: hit, isItem: isItem, enOf: enOf };
})(window.starsidePinyin, window.starsidePyItems, window.starsidePyEn);
