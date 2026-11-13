'use strict'
const {
  assert, fs, path, vm, crypto, zlib, root, site, copy, digest,
  test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows,
} = require('./harness.cjs')

// ── 武器库：weapons/app.js 的纯函数 ─────────────────────────────────────
function weaponFns(names, deps = '') {
  const ctx = { URLSearchParams }
  vm.createContext(ctx)
  vm.runInContext(deps + names.map((n) => funcSource('weapons/app.js', n)).join('\n') +
    '\nthis.f = {' + names.map((n) => n + ':' + n).join(',') + '}', ctx)
  return ctx.f
}

test('weapons: the stat curve clamps, never extrapolates, and rounds half to even', () => {
  const { bankers, interp, shown } = weaponFns(['bankers', 'interp', 'shown'])
  assert.equal(bankers(2.5), 2)
  assert.equal(bankers(3.5), 4)
  assert.equal(bankers(2.4999), 2)
  assert.equal(bankers(-0.5), 0)
  const curve = [10, 65, 100, 90]
  assert.equal(interp(0, curve), 65, '低于第一个点不外推')
  assert.equal(interp(150, curve), 90, '高于最后一个点不外推')
  assert.equal(interp(55, curve), 78, '中间按分段线性、半数取偶：77.5 → 78')
  assert.equal(shown(150, [0, 100, [0, 0, 200, 200], 0]), 100, '先按上限截断再插值')
  assert.equal(shown(7, [0, 100, [], 1]), 7, '属性组不缩放这一项时投资值就是显示值')
})

test('weapons: the query parser keeps DIM precedence and token positions', () => {
  const deps = 'function has(list, x) { return list.indexOf(x) !== -1; }\n'
  const { tokenize, parse } = weaponFns(['normQ', 'tokenize', 'parse'], deps)
  const keys = ['is', 'perk', 'stat', 'season', 'name']
  const q = (s) => JSON.parse(JSON.stringify(parse(tokenize(s), keys), (k, v) => k === 'tok' ? undefined : v))
  assert.deepEqual(q('is:手炮 perk:萤火虫'),
    { op: 'and', xs: [{ op: 'kw', k: 'is', v: '手炮' }, { op: 'kw', k: 'perk', v: '萤火虫' }] })
  assert.deepEqual(q('is:手炮 perk:萤火虫 or perk:狂乱'),
    { op: 'or', xs: [{ op: 'and', xs: [{ op: 'kw', k: 'is', v: '手炮' }, { op: 'kw', k: 'perk', v: '萤火虫' }] },
      { op: 'kw', k: 'perk', v: '狂乱' }] }, 'and 比 or 绑得紧')
  assert.deepEqual(q('is:手炮 (perk:萤火虫 or perk:狂乱)'),
    { op: 'and', xs: [{ op: 'kw', k: 'is', v: '手炮' }, { op: 'or', xs: [{ op: 'kw', k: 'perk', v: '萤火虫' },
      { op: 'kw', k: 'perk', v: '狂乱' }] }] }, '括号分组')
  assert.deepEqual(q('-is:专家'), { op: 'not', x: { op: 'kw', k: 'is', v: '专家' } })
  assert.deepEqual(q('not is:专家'), { op: 'not', x: { op: 'kw', k: 'is', v: '专家' } })
  assert.deepEqual(q('perk:"强力首发"'), { op: 'kw', k: 'perk', v: '强力首发', q: true }, '引号值')
  assert.deepEqual(q('stat:射程:>=60'), { op: 'kw', k: 'stat', v: '射程:>=60' })
  assert.deepEqual(q('is：手炮 （perk：萤火虫）'),
    { op: 'and', xs: [{ op: 'kw', k: 'is', v: '手炮' }, { op: 'kw', k: 'perk', v: '萤火虫' }] }, '全角标点按半角认')
  assert.deepEqual(q('foo:bar'), { op: 'w', v: 'foo:bar' }, '未知关键字当裸词')
  assert.deepEqual(q('is:手炮 or'), { op: 'kw', k: 'is', v: '手炮' }, '悬空的 or 忽略')
  assert.deepEqual(q('(is:手炮'), { op: 'kw', k: 'is', v: '手炮' }, '不配对的括号忽略')
  const t = tokenize('is:手炮  perk:萤火虫')
  assert.deepEqual(JSON.parse(JSON.stringify(t.map((x) => [x.a, x.b]))), [[0, 5], [7, 15]], 'token 记着它在原文里的位置')
})

test('weapons: launcher subtypes partition the catalog by slot without narrowing the generic type', () => {
  const catalog = {}
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/index.js'), 'utf8'), { window: catalog })
  const { v, w } = catalog.WPN
  const deps = 'var V=' + JSON.stringify(v) + ',WR=' + JSON.stringify(w) +
    ',TYPE_FACETS={};V.qt.forEach(function(e){(TYPE_FACETS[e[2]]||=[]).push(e)});\n' +
    'var W_H=0,W_SUB=2,W_EL=3,W_AMMO=4,W_SLOT=5,W_BR=6,W_TIER=8,W_FLAG=9;\n' +
    'var F_CRAFT=4,F_ENH=32,F_TIER=8,F_ADEPT=1,F_HOLO=2,F_REISSUE=64;\n'
  const { isTable } = weaponFns(['has', 'typeFacet', 'isTable'], deps)
  const table = isTable('wpn')
  for (let i = 0; i < w.length; i++) {
    const launcher = w[i][2] === 23
    const heavy = v.slot[w[i][5]] === '威能'
    assert.equal(table['榴弹发射器'](i), launcher)
    assert.equal(table['后膛榴弹发射器'](i), launcher && !heavy, w[i][1])
    assert.equal(table['弹鼓榴弹发射器'](i), launcher && heavy, w[i][1])
  }
})

test('weapons: is: reads Chinese as written and English ignoring case, spaces and hyphens', () => {
  const deps = 'function fold(s) { return String(s).toLowerCase().replace(/\\s+/g, ""); }\n' +
    'var IS = { wpn: Object.assign(Object.create(null), { 手炮: function () {}, 虚空: function () {} }) };\n' +
    'var ISEN = { wpn: Object.assign(Object.create(null), { handcannon: "手炮", void: "虚空" }) };\n'
  const { isKey, bareIs } = weaponFns(['enFold', 'isKey', 'bareIs'], deps)
  assert.equal(isKey('wpn', '手炮'), '手炮')
  assert.equal(isKey('wpn', 'HandCannon'), '手炮')
  assert.equal(isKey('wpn', 'hand-cannon'), '手炮')
  assert.equal(isKey('wpn', 'Hand Cannon'), '手炮', 'is:"Hand Cannon" 引号里的空格')
  assert.equal(isKey('wpn', 'toString'), '', '两张表都不带原型')
  assert.ok(bareIs('wpn', 'Void'), '裸词恰好是一个 is: 值（英文也算）时按 is: 算')
  assert.equal(bareIs('wpn', '虚'), null, '半个值照旧按字面搜')
  assert.equal(bareIs('wpn', '虚空', true), null, '加了引号照字面搜')
  // is: 的表不带原型：普通对象上 is:toString 取到原型函数，调用为真，整库都算命中。
  for (const name of ['isTable', 'enTable']) {
    assert.match(funcSource('weapons/app.js', name), /var t = Object\.create\(null\);/, name)
  }
})

test('weapons: clicking a condition swaps it inside its exclusive group and leaves the query well-formed', () => {
  const deps = 'function has(list, x) { return list.indexOf(x) !== -1; }\n' +
    'var S = { scope: "wpn" };\n' +
    'var GROUPS = { wpn: { slot: ["is:主手", "is:副手", "is:威能"], ty: ["is:手炮", "is:脉冲步枪"] } };\n' +
    'function isKey(scope, v) { return v; }\n' +
    'function bareIs(scope, v, quoted) { return !quoted && /^(主手|副手|威能|手炮|脉冲步枪)$/.test(v); }\n'
  const { toggled, cutQuery } = weaponFns(['normQ', 'tokenize', 'tokKey', 'inGroup', 'cutQuery', 'toggled'], deps)
  assert.equal(toggled('', 'is:主手', 'slot'), 'is:主手')
  assert.equal(toggled('is:主手', 'is:副手', 'slot'), 'is:副手', '同组换掉')
  assert.equal(toggled('is:副手 is:手炮', 'is:脉冲步枪', 'ty'), 'is:副手 is:脉冲步枪', '别的组不动')
  assert.equal(toggled('is:副手', 'is:副手', 'slot'), '', '再点一次取消')
  assert.equal(toggled('主手 perk:萤火虫', 'is:副手', 'slot'), 'perk:萤火虫 is:副手', '按 is: 算的裸词也属于这一组')
  assert.equal(toggled('is:主手', 'is:手炮', null), 'is:主手 is:手炮', '没有组就只加')
  assert.equal(toggled('-is:主手', 'is:副手', 'slot'), '-is:主手 is:副手', '排除的不算这一组的值')
  assert.equal(toggled('-is:手炮 perk:萤火虫', 'is:手炮', 'ty'), 'perk:萤火虫 is:手炮', '点被排除的值是把排除换成它')
  assert.equal(toggled('is:主手 or is:副手', 'is:威能', 'slot'), 'is:威能', '同组的 or 一起换掉，不留悬空的 or')
  assert.equal(toggled('is：主手 perk:萤火虫', 'is:威能', 'slot'), 'perk:萤火虫 is:威能', '全角冒号照样认')
  assert.equal(cutQuery('(is:主手 or is:副手) perk:a', tokenizeAll('(is:主手 or is:副手) perk:a', 0, 1)), 'perk:a', '括号里的都去掉，空括号一起去')
  assert.equal(cutQuery('(perk:a or is:副手)', tokenizeAll('(perk:a or is:副手)', 1)), '(perk:a)', '括号里剩一个，or 与括号内侧的空白收干净')
  assert.equal(cutQuery('is:主手 perk:a', []), 'is:主手 perk:a')
  function tokenizeAll(q, ...at) {
    const { tokenize } = weaponFns(['normQ', 'tokenize'])
    const kws = tokenize(q).filter((t) => t.t === 'kw')
    return at.map((k) => kws[k])
  }
})

test('weapons: quoted frame: and source: match the whole name, unquoted ones match a part', () => {
  const { named } = weaponFns(['named'], '')
  assert.equal(named(false, '熔炉竞技场行动', '熔炉竞技场'), true, '不加引号：包含')
  assert.equal(named(true, '熔炉竞技场行动', '熔炉竞技场'), false, '加引号：整名')
  assert.equal(named(true, '熔炉竞技场', '熔炉竞技场'), true)
  const deps = 'function has(list, x) { return list.indexOf(x) !== -1; }\n'
  const { tokenize, tokKey } = weaponFns(['normQ', 'tokenize', 'tokKey'], deps +
    'var S = { scope: "wpn" };\nfunction isKey() { return ""; }\nfunction bareIs() { return null; }\n')
  assert.equal(tokKey(tokenize('source:"仄"')[0]), 'source:"仄"')
  assert.equal(tokKey(tokenize('source:仄')[0]), 'source:仄')
})

test('weapons: source: ignores quotes, parentheses and spaces on both sides', () => {
  const deps = 'function fold(s) { return String(s).toLowerCase().replace(/\\s+/g, ""); }\n'
  const { srcFold } = weaponFns(['srcFold'], deps)
  assert.equal(srcFold('“飞狼再临”任务'), srcFold('飞狼再临任务'))
  assert.equal(srcFold('永恒沙漠（史诗）'), srcFold('永恒沙漠史诗'))
  assert.equal(srcFold('3v3 多人竞技'), srcFold('3v3多人竞技'))
  assert.notEqual(srcFold('永恒沙漠（史诗）'), srcFold('永恒沙漠'))
})

test('weapons: multi-source items match each source independently and format cleanly', () => {
  const deps = 'var V = { src: ["忠诚纪念碑", "萨瓦拉", "枪匠"] };\n' +
    'function fold(s) { return String(s).toLowerCase().replace(/\\s+/g, ""); }\n'
  const { srcsOf, srcOf, named, srcFold } = weaponFns(['srcsOf', 'srcOf', 'named', 'srcFold'], deps)
  const single = [0, '', 0, 0, 0, 0, 0, 0, 0, 0, '', '', 0, 0]
  const multi = [0, '', 0, 0, 0, 0, 0, 0, 0, 0, '', '', 0, [0, 1]]
  const none = [0, '', 0, 0, 0, 0, 0, 0, 0, 0, '', '', 0, -1]

  assert.deepEqual([...srcsOf(single, 13)], ['忠诚纪念碑'])
  assert.equal(srcOf(single, 13), '忠诚纪念碑')

  assert.deepEqual([...srcsOf(multi, 13)], ['忠诚纪念碑', '萨瓦拉'])
  assert.equal(srcOf(multi, 13), '忠诚纪念碑 · 萨瓦拉')

  assert.deepEqual([...srcsOf(none, 13)], [])
  assert.equal(srcOf(none, 13), '')

  const matchSource = (r, at, q, v) => srcsOf(r, at).some((s) => named(q, srcFold(s), srcFold(v)))
  assert.equal(matchSource(multi, 13, true, '忠诚纪念碑'), true, '多来源武器全等匹配首个来源')
  assert.equal(matchSource(multi, 13, true, '萨瓦拉'), true, '多来源武器全等匹配第二个来源')
  assert.equal(matchSource(multi, 13, true, '枪匠'), false, '多来源武器不匹配未包含的来源')
  assert.equal(matchSource(multi, 13, false, '忠诚'), true, '多来源武器模糊匹配')

  const { valuesOf } = weaponFns(['valuesOf', 'srcsOf'], deps +
    'var S = { scope: "wpn" };\nvar WR = [' + JSON.stringify(multi) + '];\nvar W_SRC = 13, A_SRC = 9;\nfunction frameOf() { return [""]; }\nfunction setSrc() { return ""; }\n')
  assert.deepEqual([...valuesOf('source', 0)], ['忠诚纪念碑', '萨瓦拉'], '筛选栏 valuesOf 返回全部独立来源')
})

test('weapons: index.js sources list contains no boilerplate or unparsed tags', () => {
  const text = fs.readFileSync(path.join(site, 'weapons/index.js'), 'utf8')
  const ctx = { window: {} }
  vm.createContext(ctx)
  vm.runInContext(text, ctx)
  const srcs = ctx.window.WPN.v.src
  assert.equal(srcs.includes('随机特性：此物品无法从收藏品再次获取。'), false, 'V.src 包含 manifest 占位符')
  for (const s of srcs) {
    assert.equal(s.includes('{src|'), false, 'V.src 未脱出标记: ' + s)
    assert.equal(s.includes('\\'), false, 'V.src 包含反斜杠: ' + s)
  }
})

test('weapons: no two functions in app.js or pvp.js share a name', () => {
  for (const rel of ['weapons/app.js', 'weapons/pvp.js']) {
    const text = fs.readFileSync(path.join(site, rel), 'utf8')
    const names = [...text.matchAll(/function (\w+)\s*\(/g)].map((m) => m[1])
    const dup = names.filter((n, i) => names.indexOf(n) !== i)
    assert.deepEqual(dup, [], rel + ' 同名函数后写的会整个盖掉前一个')
  }
})

test('weapons: card grades step in three brightnesses and only the grade itself is marked', () => {
  const deps = 'function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }\n'
  const { gradeStep, gradeMarks } = weaponFns(['gradeStep', 'gradeMarks'], deps)
  for (const [tok, step] of [['S', 1], ['A', 1], ['B', 2], ['C', 2], ['D', 3], ['F', 3],
    ['T0', 1], ['T0.5', 1], ['T1', 2], ['T1.5', 2], ['T2', 3], ['T3', 3]]) {
    assert.equal(gradeStep(tok), step, tok)
  }
  assert.equal(gradeMarks('清怪T0 输出T1.5 高难T3', false),
    '清怪<b class="tg tg-1">T0</b> 输出<b class="tg tg-2">T1.5</b> 高难<b class="tg tg-3">T3</b>')
  assert.equal(gradeMarks('S', true), '<b class="tg tg-1">S</b>', 'Aegis 只有一个字母')
  assert.equal(gradeMarks('PVP', false), 'PVP', '不是档位的字不动')
  assert.equal(gradeMarks('特殊用途', false), '特殊用途')
  assert.equal(gradeMarks('T0（旧）', false), '<b class="tg tg-1">T0</b>（旧）', '括号里的备注不动')
})

test('weapons: every syntax row parses into known keywords', () => {
  const text = fs.readFileSync(path.join(site, 'weapons/app.js'), 'utf8')
  const grab = (name) => {
    const m = new RegExp('var ' + name + ' = (\\[[\\s\\S]*?\\]);').exec(text)
    assert.notEqual(m, null, 'app.js 里找不到 ' + name)
    return vm.runInNewContext(m[1])
  }
  const keys = grab('KEYS_WPN').concat(grab('KEYS_ARMOR'))
  const deps = 'function has(list, x) { return list.indexOf(x) !== -1; }\n'
  const { tokenize } = weaponFns(['normQ', 'tokenize'], deps)
  const samples = grab('SYNTAX_OPS').map((r) => r[3]).concat(grab('SYNTAX_KEYS').map((r) => r[0]))
  for (const s of samples) {
    for (const t of tokenize(s)) {
      if (t.t === 'kw') { assert.ok(keys.includes(t.k), s + ' 里的 ' + t.k + ': 不是关键字') }
    }
  }
})

test('weapons: armor sets support pinning and split-view rail rendering', () => {
  const deps = 'function has(list, x) { return list.indexOf(x) !== -1; }\n' +
    'function esc(s) { return String(s); }\n' +
    'function pathImg(p) { return "<img src=\\"" + p + "\\">"; }\n' +
    'var T_H=0,T_NAME=1,T_SRC=3,T_KIND=4,T_SSN=5,T_FX=7;\n' +
    'var WR=[[10,"枪"]],AR=[[20,"甲"]],SR=[[30,"套装","Set","发射基地","目的地","S29","标签",[["两件",2,"a.webp"]]]];\n' +
    'var S={scope:"sets",q:""},pins=["t:30"];\n'
  const { rowsOf, pinKey, isPinned, setSrc, link, railRow } = weaponFns(
    ['rowsOf', 'pinKey', 'isPinned', 'setSrc', 'link', 'railRow'], deps)
  assert.equal(pinKey('sets', 0), 't:30')
  assert.equal(isPinned('sets', 0), true)
  const html = railRow('sets', 0, 0)
  assert.match(html, /套装/)
  assert.match(html, /发射基地 · S29/)
  assert.match(html, /data-scope="sets"/)
})
test('weapons: card, detail swap, resetroll, hoverRaf cancellation, and focusin/focusout invariants', () => {
  const appSrc = fs.readFileSync(path.join(site, 'weapons/app.js'), 'utf8')
    .replace(/\}\(\)\);\s*$/, 'window.__WPN_TEST = { S, card, weaponDetail, armorDetail, setDetail, factsHtml, defaultRoll, sameRoll, rollOf, renderDetail, renderBrowse, poolReady, textReady, getDetailKey: () => detailKey, getHoverRaf: () => hoverRaf, setHoverRaf: (id) => { hoverRaf = id } };\n}());\n')
  const wpnBox = { window: {} }
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/index.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/pool.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/text.js'), 'utf8'), wpnBox)

  const docListeners = {}
  const canceledRafs = []
  let focusedSel = null
  const detailBox = {
    innerHTML: '',
    contains(el) { return el === activeBtn },
    querySelector(sel) {
      if (sel === '.pvp-stats') return null
      focusedSel = sel
      return { focus() {} }
    },
  }
  const activeBtn = {
    closest(sel) {
      if (sel !== '[data-act]') return null
      return {
        getAttribute(attr) {
          return { 'data-act': 'perk', 'data-col': '2', 'data-plug': '42' }[attr] ?? null
        },
      }
    },
  }
  const bodyEl = {
    innerHTML: '',
    appendChild() {},
    querySelector(sel) {
      if (sel === '.wpn-detail') return detailBox
      return null
    },
  }
  const fakeEl = () => ({
    innerHTML: '',
    outerHTML: '<ol class="wpn-grid skel"></ol>',
    value: '',
    hidden: false,
    lastElementChild: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => '',
    addEventListener() {},
    appendChild() {},
    insertBefore() {},
    insertAdjacentHTML() {},
    prepend() {},
    remove() {},
    getBoundingClientRect: () => ({ height: 47, top: 0, left: 0, right: 100, bottom: 47, width: 100 }),
    querySelector: (s) => s === '.wpn-body' ? bodyEl : fakeEl(),
    querySelectorAll: () => [],
  })
  const ctx = {
    window: {
      WPN: wpnBox.window.WPN,
      WPN_POOL: wpnBox.window.WPN_POOL,
      WPN_TEXT: wpnBox.window.WPN_TEXT,
      addEventListener() {},
      matchMedia: () => ({ matches: false }),
      scrollTo() {},
      scrollX: 0,
      scrollY: 0,
      innerHeight: 900,
    },
    location: { href: 'http://localhost/weapons/index.html', pathname: '/weapons/index.html', search: '' },
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams,
    URL,
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 77,
    cancelAnimationFrame: (id) => { canceledRafs.push(id) },
    setTimeout: () => 1,
    clearTimeout() {},
    console,
    document: {
      currentScript: { src: 'http://localhost/weapons/app.js' },
      activeElement: null,
      documentElement: { clientWidth: 1440, style: { setProperty() {} } },
      body: { appendChild() {} },
      head: { appendChild() {} },
      createElement: () => fakeEl(),
      createElementNS: () => fakeEl(),
      getElementById: (id) => id === 'find' ? fakeEl() : { getAttribute: () => '0 0 36 18' },
      querySelector: () => fakeEl(),
      addEventListener(type, fn) { docListeners[type] = fn },
    },
  }
  vm.runInNewContext(appSrc, ctx)
  const T = ctx.window.__WPN_TEST
  T.poolReady()
  T.textReady()

  // 1. Exotic armor cards include .is-exo class
  T.S.scope = 'armor'
  assert.match(T.card(0, 0), /class="wpn-card is-exo"/)

  // 2. .facts chips render plain .toggle buttons without rarity/element border classes for all weapon rarities
  T.S.scope = 'wpn'
  const rareIdx = wpnBox.window.WPN.w.findIndex((r) => r[8] === 4)
  const exoIdx = wpnBox.window.WPN.w.findIndex((r) => r[8] === 6)
  assert.ok(rareIdx >= 0 && exoIdx >= 0)
  for (const idx of [0, rareIdx, exoIdx]) {
    const fh = T.factsHtml(idx)
    assert.doesNotMatch(fh, /toggle (?:leg|exo)|data-el=/)
  }

  // 3. weaponDetail only shows 重置配置 when roll differs from defaultRoll
  const defHtml = T.weaponDetail(0, false)
  assert.doesNotMatch(defHtml, /data-act="resetroll"/)
  assert.doesNotMatch(defHtml, /class="wpn-one swap"/)
  const roll = T.rollOf(0)
  roll.cat = 1
  const dirtyHtml = T.weaponDetail(0, true)
  assert.match(dirtyHtml, /<button type="button" class="op" data-act="resetroll">重置配置<\/button>/)
  assert.match(dirtyHtml, /class="wpn-one swap"/)
  delete T.S.rolls[wpnBox.window.WPN.w[0][0]]

  // 4. renderDetail cancels pending hoverRaf, only applies .swap when item changes, and restores focus inside .wpn-detail
  T.S.scope = 'wpn'
  T.S.sel = 0
  T.renderBrowse()
  assert.equal(T.getDetailKey(), '')
  T.setHoverRaf(99)
  ctx.document.activeElement = activeBtn
  T.renderDetail()
  assert.ok(canceledRafs.includes(99), 'renderDetail must cancel pending hoverRaf')
  assert.doesNotMatch(detailBox.innerHTML, /class="wpn-one swap"/, 'first open from browse does not replay swap')
  assert.equal(focusedSel, '[data-act="perk"][data-col="2"][data-plug="42"]')
  T.renderDetail()
  assert.doesNotMatch(detailBox.innerHTML, /class="wpn-one swap"/, 'same-weapon local click must not replay swap')
  T.S.sel = 1
  T.renderDetail()
  assert.match(detailBox.innerHTML, /class="wpn-one swap"/, 'switching weapons in split view plays swap')

  // 5. focusin ignores non-:focus-visible (pointer click) and focusout ignores unrelated blur targets
  let matchesFocusVisible = false
  const perkTarget = {
    matches: (s) => s === ':focus-visible' && matchesFocusVisible,
    closest(s) { return s === '[data-act]' ? this : null },
    getAttribute(k) { return { 'data-act': 'perk', 'data-col': '0', 'data-plug': '1' }[k] || null },
    getBoundingClientRect: () => ({ left: 10, right: 40, top: 10, bottom: 40 }),
  }
  T.S.hoverPlug = null
  docListeners.focusin({ target: perkTarget })
  assert.equal(T.S.hoverPlug, null, 'pointer mousedown focusin without :focus-visible must not trigger hover preview')

  matchesFocusVisible = true
  docListeners.focusin({ target: perkTarget })
  assert.equal(T.S.hoverPlug && T.S.hoverPlug.col, 0, 'keyboard :focus-visible focusin triggers hover preview')
  assert.equal(T.S.hoverPlug && T.S.hoverPlug.plug, 1, 'keyboard :focus-visible focusin triggers hover preview')
  docListeners.focusout({ target: {} })
  assert.equal(T.S.hoverPlug && T.S.hoverPlug.plug, 1, 'unrelated focusout must not clear active hover preview')
  docListeners.focusout({ target: perkTarget })
  assert.equal(T.S.hoverPlug, null, 'blurring the focused perk clears hover preview')
})

test('weapons: PvP simulator, perk-fx, exotic overrides, and FX align with godroll.tv', () => {
  const perkFx = JSON.parse(fs.readFileSync(path.join(site, 'weapons/perk-fx.json'), 'utf8'))
  const wpnBox = { window: {} }
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/index.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/pool.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/text.js'), 'utf8'), wpnBox)
  const appSrc = fs.readFileSync(path.join(site, 'weapons/app.js'), 'utf8')
    .replace(/\}\(\)\);\s*$/, 'PERK_FX = __PFX; poolReady(); textReady(); pvpReady(); window.__PVP_TEST = Object.assign({ S, WR, BY_HASH, V, P, HSTAT, SIDX, PIDX, rollOf, defaultRoll, compute, plugButton, plugName, cellsOf, shownPlug, poolRow, fxDmgOf, fxAll, resolvedPerkSpec, basePlugFor }, PVP);\n}());\n')
  const pvpSrc = fs.readFileSync(path.join(site, 'weapons/pvp.js'), 'utf8')
  const fakeEl = () => ({
    innerHTML: '', outerHTML: '', value: '', hidden: false,
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, getAttribute: () => '',
    addEventListener() {}, appendChild() {}, insertBefore() {}, insertAdjacentHTML() {}, prepend() {}, remove() {},
    getBoundingClientRect: () => ({ height: 47, top: 0, left: 0, right: 100, bottom: 47, width: 100 }),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  })
  const ctx = {
    __PFX: perkFx,
    window: { WPN: wpnBox.window.WPN, WPN_POOL: wpnBox.window.WPN_POOL, WPN_TEXT: wpnBox.window.WPN_TEXT, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {}, scrollX: 0, scrollY: 0, innerHeight: 900 },
    location: { href: 'http://localhost/weapons/index.html', pathname: '/weapons/index.html', search: '' },
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, URL,
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
    console,
    document: {
      currentScript: { src: 'http://localhost/weapons/app.js' }, activeElement: null,
      documentElement: { clientWidth: 1440, style: { setProperty() {} } },
      body: { appendChild() {} }, head: { appendChild() {} },
      createElement: () => fakeEl(), createElementNS: () => fakeEl(),
      getElementById: () => fakeEl(), querySelector: () => fakeEl(), addEventListener() {},
    },
  }
  vm.runInNewContext(pvpSrc, ctx)
  vm.runInContext(appSrc, ctx)
  const T = ctx.window.__PVP_TEST
  const pickByName = (i, ci, pat) => {
    for (const c of T.cellsOf(T.poolRow(i)[2][ci])) {
      const p = T.shownPlug(c)
      if (T.plugName(p).includes(pat)) return p
    }
    throw new Error(`Missing perk matching ${pat} in col ${ci}`)
  }
  const cleanRoll = (i) => {
    const roll = T.rollOf(i)
    roll.mw = ''; roll.mod = -1; roll.cat = 0; roll.t = 1
    T.poolRow(i)[2].forEach((col, ci) => { roll.sel[ci] = T.shownPlug(T.cellsOf(col)[0]) })
    return roll
  }

  // 1. Last Thursday (3813721211): clean, default, and Weapons Stat sweep
  const iLt = T.BY_HASH.wpn['3813721211']
  const ltClean = T.pvpView(iLt, T.compute(iLt, cleanRoll(iLt)))
  assert.equal(ltClean.ttk.toFixed(2), '0.92')
  assert.equal(ltClean.kill, '6 精准，1 直击')
  assert.equal(ltClean.acc, 86)
  assert.equal(ltClean.dispRpm, 390)
  assert.equal(ltClean.bodyDmg.toFixed(2), '22.00')
  assert.equal(ltClean.headDmg.toFixed(2), '36.45')
  assert.equal(ltClean.rm.hip.toFixed(2), '19.30')
  assert.equal(ltClean.rm.ads.toFixed(2), '32.81')
  assert.equal(ltClean.rs.toFixed(2), '2.65')
  assert.equal(ltClean.handCur.ready.toFixed(2), '0.38')
  assert.equal(ltClean.handCur.stow.toFixed(2), '0.36')
  assert.equal(ltClean.handCur.ads.toFixed(2), '0.35')

  T.S.pvpStat = 50
  const ltWs50 = T.pvpView(iLt, T.compute(iLt, cleanRoll(iLt)))
  assert.equal(ltWs50.bodyDmg.toFixed(2), '22.00')
  assert.ok(Math.abs(ltWs50.rs - ltClean.rs * 0.95) < 1e-6)
  T.S.pvpStat = 150
  const ltWs150 = T.pvpView(iLt, T.compute(iLt, cleanRoll(iLt)))
  assert.equal(ltWs150.kill, '5 精准，2 直击')
  assert.equal(ltWs150.acc, 71)
  assert.equal(ltWs150.bodyDmg.toFixed(2), '22.55')
  assert.equal(ltWs150.headDmg.toFixed(2), '37.36')
  T.S.pvpStat = 200
  const ltWs200 = T.pvpView(iLt, T.compute(iLt, cleanRoll(iLt)))
  assert.equal(ltWs200.bodyDmg.toFixed(2), '23.10')
  assert.equal(ltWs200.headDmg.toFixed(2), '38.27')
  T.S.pvpStat = 0

  // 2. Elemental Capacitor (711234314 on Timeworn Wayfarer 1886840007)
  const iEc = T.BY_HASH.wpn['1886840007']
  const rollEc = T.rollOf(iEc)
  rollEc.sel[2] = pickByName(iEc, 2, '元素电容')
  const ecHash = String(T.P.p[rollEc.sel[2]][0])
  const ecBaseRes = T.compute(iEc, rollEc)
  const ecCell = T.cellsOf(T.poolRow(iEc)[2][2]).find((c) => T.shownPlug(c) === rollEc.sel[2])
  assert.match(T.plugButton(2, ecCell, {}, true, false, 'Primary', ecBaseRes), /class="perk-stack-badge deactivated"/)
  T.S.perkStep[ecHash] = 0 // Solar -> Reload
  const ecSolar = T.compute(iEc, rollEc)
  assert.ok(ecSolar.byStat[T.HSTAT[4188031367]].value > ecBaseRes.byStat[T.HSTAT[4188031367]].value)
  assert.match(T.plugButton(2, ecCell, {}, true, false, 'Primary', ecSolar), /element-badge.*element-icon/)
  T.S.perkStep[ecHash] = 1 // Arc -> Handling
  const ecArc = T.compute(iEc, rollEc)
  assert.ok(ecArc.byStat[T.HSTAT[943549884]].value > ecBaseRes.byStat[T.HSTAT[943549884]].value)
  delete T.S.perkStep[ecHash]

  // 3. Gnawing Hunger (214545213): default + Rampage step + Kill Clip + Target Lock
  const iGh = T.BY_HASH.wpn['214545213']
  const ghDef = T.pvpView(iGh, T.compute(iGh, T.rollOf(iGh)))
  assert.equal(ghDef.ttk.toFixed(2), '0.80')
  assert.equal(ghDef.kill, '8 精准，1 直击')
  assert.equal(ghDef.acc, 89)
  assert.equal(ghDef.bodyDmg.toFixed(2), '15.50')
  assert.equal(ghDef.headDmg.toFixed(2), '27.21')
  assert.equal(ghDef.dispRpm, 600)
  const rollGh = T.rollOf(iGh)
  rollGh.sel[3] = pickByName(iGh, 3, '狂暴')
  const rampHash = String(T.P.p[rollGh.sel[3]][0])
  assert.equal(T.pvpView(iGh, T.compute(iGh, rollGh)).showPerks.length, 0)
  T.S.perkStep[rampHash] = 2
  const ghRamp = T.pvpView(iGh, T.compute(iGh, rollGh))
  assert.equal(ghRamp.ttk.toFixed(2), '0.60')
  assert.equal(ghRamp.kill, '6 精准，1 直击')
  assert.equal(ghRamp.bodyDmg.toFixed(2), '20.63')
  delete T.S.perkStep[rampHash]
  const iKc = T.BY_HASH.wpn['3332538050']
  const rollKc = T.rollOf(iKc)
  rollKc.sel[3] = pickByName(iKc, 3, '杀戮弹匣')
  const ghKc = T.pvpView(iKc, T.compute(iKc, rollKc))
  assert.equal(ghKc.ttk.toFixed(2), '0.60')
  assert.equal(ghKc.bodyDmg.toFixed(2), '19.38')
  assert.equal(ghKc.showPerks[0].name, '杀戮弹匣')
  rollGh.sel[3] = pickByName(iGh, 3, '目标锁定')
  const ghTl = T.pvpView(iGh, T.compute(iGh, rollGh))
  assert.equal(ghTl.showPerks[0].name, '目标锁定')

  // 4. The Wizened Rebuke (2290416): Accelerated Coils & Liquid Coils (enhanced battery -> basePlugFor)
  const iFus = T.BY_HASH.wpn['2290416']
  const rollFus = cleanRoll(iFus)
  rollFus.sel[1] = pickByName(iFus, 1, '加速线圈')
  rollFus.sel[3] = pickByName(iFus, 3, '脆弱专注')
  const fusAcc = T.pvpView(iFus, T.compute(iFus, rollFus))
  assert.equal(fusAcc.ttk.toFixed(2), '1.13')
  assert.equal(fusAcc.kill, '4 发弹丸')
  assert.equal(fusAcc.bodyDmg.toFixed(2), '76.08')
  assert.equal(fusAcc.dispRpm, 967)
  assert.equal(fusAcc.flatBadges[0].dmgIncrease, false)
  rollFus.sel[1] = pickByName(iFus, 1, '液态线圈')
  const fusLiq = T.pvpView(iFus, T.compute(iFus, rollFus))
  assert.equal(fusLiq.ttk.toFixed(2), '1.14')
  assert.equal(fusLiq.kill, '3 发弹丸')
  assert.equal(fusLiq.bodyDmg.toFixed(2), '80.80')
  assert.equal(fusLiq.flatBadges[0].dmgIncrease, true)

  // 5. Exotics & Area Denial
  const byEn = (en) => T.P.en.indexOf(en)
  assert.equal(T.pvpView(byEn('Graviton Lance'), T.compute(byEn('Graviton Lance'), T.rollOf(byEn('Graviton Lance')))).ttk.toFixed(2), '0.90')
  assert.equal(T.pvpView(byEn('Crimson'), T.compute(byEn('Crimson'), T.rollOf(byEn('Crimson')))).ttk.toFixed(3), '0.867')
  assert.equal(T.pvpView(byEn('Vex Mythoclast'), T.compute(byEn('Vex Mythoclast'), T.rollOf(byEn('Vex Mythoclast')))).ttk.toFixed(2), '0.75')
  assert.equal(T.pvpView(byEn('The Chaperone'), T.compute(byEn('The Chaperone'), T.rollOf(byEn('The Chaperone')))).kill, '1 精准')
  assert.equal(T.pvpView(byEn('Forerunner'), T.compute(byEn('Forerunner'), T.rollOf(byEn('Forerunner')))).ttk.toFixed(2), '0.60')
  const heirloomV = T.pvpView(byEn('Heirloom'), T.compute(byEn('Heirloom'), T.rollOf(byEn('Heirloom'))))
  assert.equal(heirloomV.ttk, null)
  assert.equal(heirloomV.kill, '2 直击')
  const lsV = T.pvpView(byEn('Lost Signal'), T.compute(byEn('Lost Signal'), T.rollOf(byEn('Lost Signal'))))
  assert.equal(lsV.ttk.toFixed(2), '2.75')
  assert.equal(lsV.kill, '1 次发射 + 领域')

  // 6. Bow + Archer's Tempo, Heavy GL Impact+Blast split, and Stateful Chrono Perks
  const iBow = T.BY_HASH.wpn['2485400469']
  const rollBow = T.rollOf(iBow)
  rollBow.sel[2] = pickByName(iBow, 2, '弓手节奏')
  const bowV = T.pvpView(iBow, T.compute(iBow, rollBow))
  assert.equal(bowV.ttk.toFixed(2), '0.50')
  assert.equal(bowV.dispRpm, 667)

  const iHgl = T.BY_HASH.wpn['2452936817']
  const hglV = T.pvpView(iHgl, T.compute(iHgl, T.rollOf(iHgl)))
  assert.equal(hglV.ttk, 0)
  assert.ok(hglV.blastInfo && hglV.bodyDmg > 290)

  const iPi = T.BY_HASH.wpn['120706239']
  const rollPi = T.rollOf(iPi)
  rollPi.sel[3] = pickByName(iPi, 3, '精准工具')
  const piHash = String(T.P.p[rollPi.sel[3]][0])
  assert.equal(T.pvpView(iPi, T.compute(iPi, rollPi)).kill, '2 精准，2 直击')
  T.S.perkStep[piHash] = 0
  const piAct = T.pvpView(iPi, T.compute(iPi, rollPi))
  assert.equal(piAct.kill, '3 精准')
  assert.equal(piAct.ttk.toFixed(3), '0.667')
  delete T.S.perkStep[piHash]

  const iRb = T.BY_HASH.wpn['852069910']
  const rollRb = T.rollOf(iRb)
  rollRb.sel[3] = pickByName(iRb, 3, '洪涝')
  T.S.pvpMag = null
  assert.equal(T.pvpView(iRb, T.compute(iRb, rollRb)).bodyDmg.toFixed(2), '105.36')
  T.S.pvpMag = 2
  assert.equal(T.pvpView(iRb, T.compute(iRb, rollRb)).bodyDmg.toFixed(2), '79.22')
  T.S.pvpMag = null

  const iHir = T.BY_HASH.wpn['3654744298']
  const rollHir = T.rollOf(iHir)
  rollHir.sel[3] = pickByName(iHir, 3, '高强度型弹药储备')
  const hirFull = T.pvpView(iHir, T.compute(iHir, rollHir))
  T.S.pvpMag = 1
  const hirLow = T.pvpView(iHir, T.compute(iHir, rollHir))
  assert.ok(hirLow.bodyDmg > hirFull.bodyDmg)
  T.S.pvpMag = null

  const iBb = T.BY_HASH.wpn['3215649176']
  const rollBb = T.rollOf(iBb)
  rollBb.sel[3] = pickByName(iBb, 3, '盒式呼吸法')
  assert.equal(T.pvpView(iBb, T.compute(iBb, rollBb)).headDmg.toFixed(2), '598.15')

  // 7. PVP_DISABLED, PVP_STRIP_DMG, and FX_GROUPS (Bakris PvE-only, Oathkeeper -33ms drawTime, Loader 0.85)
  assert.equal(T.getPerkDamageModifier({ dmg: 1.5 }, 0, true, '1545231802', 'Pulse Rifle', 'Primary'), null)
  assert.equal(T.getPerkDamageModifier(perkFx['1954620775'], 0, true, '1954620775', 'Hand Cannon', 'Primary'), null)
  assert.equal(T.getPerkDamageModifier(perkFx['1954620775'], 0, false, '1954620775', 'Hand Cannon', 'Primary').dmg, 1.3)

  T.S.fx = ['508515818'] // Mask of Bakris (pveDmg only)
  const bakrisFx = T.fxAll().find((f) => f.id === '508515818')
  assert.equal(T.fxDmgOf(bakrisFx, true), 1)
  assert.ok(T.fxDmgOf(bakrisFx, false) > 1)
  T.S.fx = ['1449897496'] // Oathkeeper (+10 draw time stat -> -33ms on Bow)
  assert.equal(T.pvpView(iBow, T.compute(iBow, rollBow)).dispRpm, 634)
  T.S.fx = ['2586562813'] // Loader (0.85 reload duration)
  const ghLoader = T.pvpView(iGh, T.compute(iGh, T.rollOf(iGh)))
  assert.ok(ghLoader.rs < ghDef.rs * 0.86)
  T.S.fx = []

  // 8. Fixed single-cell conditional traits start deactivated and toggle via badge
  const iVex = T.BY_HASH.wpn['4289226715']
  const vexResOff = T.compute(iVex, T.rollOf(iVex))
  assert.equal(T.pvpView(iVex, vexResOff).activeKill.ttk.toFixed(2), '0.75')
  const vexPerkCell = T.cellsOf(T.poolRow(iVex)[2][2])[0]
  assert.match(T.plugButton(2, vexPerkCell, {}, true, true, 'Primary', vexResOff), /class="perk-stack-badge deactivated"[^>]*data-fixed="1"/)
  T.S.perkStep['806917387'] = 0
  const vexResOn = T.compute(iVex, T.rollOf(iVex))
  assert.equal(T.pvpView(iVex, vexResOn).activeKill.ttk.toFixed(2), '0.15')
  assert.match(T.plugButton(2, vexPerkCell, {}, true, true, 'Primary', vexResOn), /class="perk-stack-badge"[^>]*data-fixed="1"[^>]*>.*✓/)
  T.S.perkStep = {}
})

test('weapons: completing an unused prefetch preserves loaded browse results', () => {
  let script
  const cards = Array.from({ length: 240 }, (_, i) => i)
  const ctx = {
    URL, HERE: 'https://example.test/weapons/app.js', loads: {}, window: {},
    document: { createElement: () => ({}), head: { appendChild(el) { script = el } } },
    poolReady() {}, textReady() {},
    render() { cards.length = 120 }
  }
  vm.createContext(ctx)
  vm.runInContext(funcSource('weapons/app.js', 'need'), ctx)
  ctx.need('pool')
  ctx.window.WPN_POOL = {}
  script.onload()
  assert.equal(cards.length, 240)
})

test('weapons: removing a filter preserves an uncommitted search', () => {
  const src = fs.readFileSync(path.join(site, 'weapons/app.js'), 'utf8')
  const query = src.slice(src.indexOf('  function setQuery(q, push)'), src.indexOf('  function addToken(tok)'))
  const events = src.slice(src.indexOf("  input.addEventListener('beforeinput',"), src.indexOf("  input.addEventListener('click', suggest)"))
  const remove = src.slice(src.indexOf("      case 'unpill':"), src.indexOf("      case 'open':", src.indexOf("      case 'unpill':")))
  function edit(old, next, start, end, tokens, a, b) {
    const listeners = {}
    const timers = new Map()
    let timer = 0
    const ctx = {
      S: { q: old },
      input: { value: old, selectionStart: start, selectionEnd: end, addEventListener(k, fn) { listeners[k] = fn } },
      tokens, typing: 0, draft: null, inputEdit: null,
      el: { getAttribute(k) { return { 'data-a': String(a), 'data-b': String(b) }[k] } },
      clearTimeout(id) { timers.delete(id) },
      setTimeout(fn) { timers.set(++timer, fn); return timer },
      evaluate() {}, writeUrl() {}, render() {}, closeAc() {}, suggest() {}
    }
    vm.createContext(ctx)
    vm.runInContext(query + events, ctx)
    listeners.beforeinput({ inputType: 'insertText' })
    ctx.input.value = next
    listeners.input()
    vm.runInContext('(function(){switch("unpill"){' + remove + '}})()', ctx)
    for (const fn of timers.values()) fn()
    return ctx.S.q
  }
  const filter = 'perk:火'
  const token = [{ a: 0, b: filter.length }]
  assert.equal(edit(filter, filter + ' 冰', filter.length, filter.length, token, 0, filter.length).trim(), '冰')
  assert.equal(edit(filter, '冰 ' + filter, 0, 0, token, 0, filter.length).trim(), '冰')
  assert.equal(edit(filter, 'perk:水', 5, 6, token, 0, filter.length), 'perk:水')
  const repeated = filter + ' ' + filter
  const tokens = [{ a: 0, b: filter.length }, { a: filter.length + 1, b: repeated.length }]
  assert.equal(edit(repeated, repeated + ' 冰', repeated.length, repeated.length, tokens, filter.length + 1, repeated.length).trim().replace(/\s+/g, ' '), filter + ' 冰')
})

test('weapons: pvp module loads only on demand, sets high priority, and surfaces load errors', () => {
  const inserted = []
  const wpnBox = { window: {} }
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/index.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/pool.js'), 'utf8'), wpnBox)
  vm.runInNewContext(fs.readFileSync(path.join(site, 'weapons/text.js'), 'utf8'), wpnBox)
  const fakeEl = () => ({
    innerHTML: '', outerHTML: '', value: '', hidden: false,
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, getAttribute: () => '',
    addEventListener() {}, appendChild() {}, insertBefore() {}, insertAdjacentHTML() {}, prepend() {}, remove() {},
    getBoundingClientRect: () => ({ height: 47, top: 0, left: 0, right: 100, bottom: 47, width: 100 }),
    querySelector: () => fakeEl(), querySelectorAll: () => [],
  })
  const findEl = fakeEl()
  const ctx = {
    __PFX: JSON.parse(fs.readFileSync(path.join(site, 'weapons/perk-fx.json'), 'utf8')),
    window: { WPN: wpnBox.window.WPN, WPN_POOL: wpnBox.window.WPN_POOL, WPN_TEXT: wpnBox.window.WPN_TEXT, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {}, scrollX: 0, scrollY: 0, innerHeight: 900 },
    location: { href: 'http://localhost/weapons/index.html', pathname: '/weapons/index.html', search: '' },
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, URL,
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
    console: { error() {}, warn() {}, log() {} },
    document: {
      currentScript: { src: 'http://localhost/weapons/app.js' }, activeElement: null,
      documentElement: { clientWidth: 1440, style: { setProperty() {} } },
      body: { appendChild() {} },
      head: { appendChild(el) { inserted.push(el) } },
      createElement: () => fakeEl(), createElementNS: () => fakeEl(),
      getElementById: (id) => id === 'find' ? findEl : fakeEl(),
      querySelector: () => fakeEl(), addEventListener() {},
    },
  }
  const appSrc = fs.readFileSync(path.join(site, 'weapons/app.js'), 'utf8')
    .replace(/\}\(\)\);\s*$/, 'PERK_FX = __PFX; poolReady(); textReady(); window.__PVP_LAZY = { S, statsBlock, compute, renderDetail, need };\n}());\n')
  vm.runInNewContext(appSrc, ctx)
  const T = ctx.window.__PVP_LAZY
  const pveHtml = T.statsBlock(0, T.compute(0, { sel: {}, mw: '', lv: 1, t: 1, mod: -1, cat: 0 }), null)
  assert.equal(inserted.some((el) => String(el.src).endsWith('/weapons/pvp.js')), false, 'PvE 不应加载 pvp.js')
  assert.doesNotMatch(pveHtml, /PvP 模拟器载入中/)

  T.S.sel = 0
  T.S.statsMode = 'pvp'
  const loadingHtml = T.statsBlock(0, T.compute(0, { sel: {}, mw: '', lv: 1, t: 1, mod: -1, cat: 0 }), null)
  assert.match(loadingHtml, /PvP 模拟器载入中/)
  const pvpTag = inserted.find((el) => String(el.src).endsWith('/weapons/pvp.js'))
  assert.ok(pvpTag, '切到 PvP 模式时应插入 weapons/pvp.js')
  assert.equal(pvpTag.fetchPriority, 'high')

  pvpTag.onerror()
  const errHtml = T.statsBlock(0, T.compute(0, { sel: {}, mw: '', lv: 1, t: 1, mod: -1, cat: 0 }), null)
  assert.match(errHtml, /data-act="retry-load" data-v="pvp"/)
  const beforeRetryCount = inserted.filter((el) => String(el.src).endsWith('/weapons/pvp.js')).length
  let retried = 0
  assert.equal(ctx.window.__PVP_LAZY.need('pvp', () => { retried++ }, true), false, 'retry should dispatch new script load')
  const retryTags = inserted.filter((el) => String(el.src).endsWith('/weapons/pvp.js'))
  assert.equal(retryTags.length, beforeRetryCount + 1)

  vm.runInContext(fs.readFileSync(path.join(site, 'weapons/pvp.js'), 'utf8'), ctx)
  retryTags[retryTags.length - 1].onload()
  assert.ok(retried >= 1, 'retry callback should run after pvp.js finishes loading')
  const readyHtml = T.statsBlock(0, T.compute(0, { sel: {}, mw: '', lv: 1, t: 1, mod: -1, cat: 0 }), null)
  assert.match(readyHtml, /class="pvp-stats"/)
})
