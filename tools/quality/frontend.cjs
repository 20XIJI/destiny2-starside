'use strict'
const {
  assert, fs, path, vm, crypto, zlib, root, site, copy, digest,
  test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows,
} = require('./harness.cjs')

test('app.js and the page-specific modules it lazy-loads stay in step', () => {
  // 三段页面专属的东西拆出去之后，app.js 里只剩一句 lazy('x.js')。少了那个文件、
  // 或者拆的时候漏改了分发（还在直接调已经搬走的函数），页面上是整个 app.js
  // 抛异常、工具条与分节高亮一起没了，而构建、闸门、npm test 全都看不见。
  const app = fs.readFileSync(path.join(site, 'assets/app.js'), 'utf8')
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [file, gone] of [['chart.js', 'chart'], ['rota.js', 'rota'], ['home.js', 'home']]) {
    assert.ok(fs.existsSync(path.join(site, 'assets', file)), `assets/${file} 不在`)
    assert.match(code, new RegExp(`lazy\\('${file}'\\)`), `app.js 没有 lazy('${file}')`)
    assert.doesNotMatch(code, new RegExp(`(?<![.\\w])${gone}\\s*\\(`),
      `app.js 还在直接调 ${gone}()，但它已经搬进 assets/${file} 了`)
    const mod = fs.readFileSync(path.join(site, 'assets', file), 'utf8')
    assert.match(mod, /export default function init\s*\(/, `assets/${file} 没有 export default init`)
  }
  assert.match(code, /document\.currentScript/,
    'app.js 要按自己的 src 算模块路径：classic script 里 import() 的相对路径按文档基址解')
})

test('the site search index unpacks into full records that carry the English names', () => {
  // 索引按页面、分节分组写，条目上只有名称与压过的全文，首页由 home.js 的 unpack()
  // 展开。这里走同一个 unpack()：展开错了（页面或分节没挂上、¶ 没换回名称），
  // 搜索框照样出结果，只是来处与摘要是错的。
  //
  // 搜 One-Two Punch 要搜得到雪上加霜。英文名一直在事实层里，这一条钉住它露在
  // 展开后的全文末尾。掉了的症状是「搜中文照样能搜到」，没有人会发现。
  const ctx = {}
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(site, 'assets/search.js'), 'utf8'), ctx,
    { filename: 'assets/search.js' })
  vm.runInContext(funcSource('assets/home.js', 'unpack') + '\nthis.unpack = unpack', ctx)
  const rows = ctx.unpack(ctx.starsideIndex)
  const pages = new Set(rows.filter((r) => !r.n).map((r) => r.u))
  const entries = rows.filter((r) => r.n)
  assert.ok(entries.length > 3000, `只读到 ${entries.length} 个条目`)
  for (const r of entries) {
    assert.ok(pages.has(r.u), `${r.n} 没挂到页面上：${r.u}`)
    assert.ok(typeof r.a === 'string' && r.a && typeof r.l === 'string' && r.l,
      `${r.u} 的 ${r.n} 没挂到分节上`)
    assert.ok(typeof r.x === 'string' && !r.x.includes('¶'), `${r.u} 的 ${r.n} 全文没展开`)
  }
  const got = entries.filter((r) => r.n === '雪上加霜')
  assert.ok(got.length, '搜索索引里没有雪上加霜')
  for (const r of got) {
    assert.ok(r.x.endsWith('One-Two Punch'), `雪上加霜的全文没带上英文名：${r.x.slice(-40)}`)
  }
  const withEn = entries.filter((r) => /[A-Za-z][A-Za-z .,'-]{2,}$/.test(r.x)).length
  assert.ok(withEn > 1500, `只有 ${withEn} 个条目带英文名，英文没接进来`)
})

test('homepage search ranks Compendium pages first and jumps to the weapons library', () => {
  // 重合条目（故我在既在详解也在刷取清单）要把 Destiny Data Compendium 那一页
  // 排到同档最前；武器名再补一条跳到装备库。掉了的症状是搜得到、只是顺序错，
  // 闸门看不见。
  const ctx = {}
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(site, 'assets/search.js'), 'utf8'), ctx,
    { filename: 'assets/search.js' })
  vm.runInContext(
    ['unpack', 'isDdc', 'libJump', 'ranked'].map((n) => funcSource('assets/home.js', n)).join('\n')
    + '\nthis.unpack=unpack;this.isDdc=isDdc;this.libJump=libJump;this.ranked=ranked',
    ctx)
  const packed = ctx.starsideIndex
  const flag = (url) => packed.some((r) => r && r.u === url && r.c === 1)
  assert.equal(flag('exotic-weapon/index.html'), true, '异域武器详解该标 c:1')
  assert.equal(flag('exotic-armor/index.html'), true, '异域护甲详解该标 c:1')
  assert.equal(flag('weapon-perks/index.html'), true, '武器 PERK 该标 c:1')
  assert.equal(flag('exotic-weapons/index.html'), false, '刷取清单-异域武器不该标 c')
  assert.equal(flag('shopping-primary/index.html'), false, '购物清单不该标 c')

  const index = ctx.unpack(packed)
  const pages = {}
  index.forEach((r) => {
    if (!r.n) r._t = ((r.t || '') + ' ' + (r.d || '')).toLowerCase()
    else { r._n = r.n.toLowerCase(); r._x = (r.x || '').toLowerCase() }
    if (r.d) pages[r.u] = r
  })
  function hit(hay, terms) {
    for (let i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false
    return true
  }
  function run(q) {
    return ctx.ranked(index, pages, [q.toLowerCase()], hit, q)
  }

  const gun = run('枯萎囤积')
  const same = gun.filter((r) => r.n === '枯萎囤积' && !r.jump)
  assert.ok(same.length >= 2, `枯萎囤积该同时命中详解与刷取清单，实际 ${same.length} 条`)
  assert.equal(same[0].u, 'exotic-weapon/index.html',
    `枯萎囤积第一条该是异域武器详解，实际是 ${same[0].u}`)
  const jumpAt = gun.findIndex((r) => r.jump)
  assert.ok(jumpAt > 0, '枯萎囤积该有一条跳到装备库')
  assert.equal(gun[jumpAt].u, 'weapons/index.html')
  assert.equal(gun[jumpAt].n, '枯萎囤积')
  const farm = gun.findIndex((r) => r.n === '枯萎囤积' && r.u === 'exotic-weapons/index.html')
  assert.ok(farm > jumpAt, '装备库跳转该夹在详解与刷取清单之间')

  const pagesHit = run('异域武器').filter((r) => !r.n && !r.jump)
  assert.ok(pagesHit.length, '搜异域武器该命中页面')
  assert.equal(pagesHit[0].u, 'exotic-weapon/index.html',
    `异域武器第一条页面该是详解，实际是 ${pagesHit[0].u}`)
  assert.ok(run('异域武器').some((r) => r.jump), '搜异域武器该有装备库跳转')

  const armorPages = run('异域护甲').filter((r) => !r.n && !r.jump)
  assert.ok(armorPages.length, '搜异域护甲该命中页面')
  assert.equal(armorPages[0].u, 'exotic-armor/index.html',
    `异域护甲第一条页面该是详解，实际是 ${armorPages[0].u}`)
  assert.ok(!run('异域护甲').some((r) => r.jump), '搜异域护甲不该跳出装备库')

  assert.ok(!run('卡鲁斯大帝').some((r) => r.jump), '搜首领不该跳出装备库')
})

test('item names match full pinyin, initials, and mixed input, descriptions do not', () => {
  // 拼音与英文只打在资料库物品名上：故我在能用 guwozai / gwz / ergo sum 搜到；
  // 介绍、首领名、副本名用拼音或英文搜不到。匹配函数与首页 ranked() 走同一份。
  const ctx = {}
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(site, 'assets/pinyin.js'), 'utf8'), ctx,
    { filename: 'assets/pinyin.js' })
  const py = ctx.starsidePy
  assert.ok(py && typeof py.match === 'function', 'pinyin.js 没挂上 starsidePy')
  assert.equal(py.isItem('故我在'), true)
  assert.equal(py.isItem('故我在（电弧元素）'), true, '站内消歧括注剥掉后仍是物品名')
  assert.equal(py.isItem('虹吸'), true)
  assert.equal(py.isItem('埃希恩记忆'), true)
  assert.equal(py.isItem('卡鲁斯大帝'), false)
  assert.equal(py.isItem('最后一愿'), false)
  assert.equal(py.enOf('枯萎囤积'), 'Witherhoard')
  assert.equal(py.enOf('故我在'), 'Ergo Sum')
  assert.equal(py.enOf('故我在（电弧元素）'), 'Ergo Sum')
  assert.equal(py.enOf('虹吸'), '')
  assert.equal(py.hit('故我在', ['gwz']), true)
  assert.equal(py.hit('虹吸', ['hx']), true)
  assert.equal(py.hit('枯萎囤积', ['witherhoard']), true)
  assert.equal(py.hit('雪上加霜', ['one-two']), true)
  assert.equal(py.hit('雪上加霜', ['onetwopunch']), true)
  assert.equal(py.hit('旅行者的选择', ['travelers']), true)
  assert.equal(py.hit('卡鲁斯大帝', ['kalusidadi']), false)
  assert.equal(py.hit('卡鲁斯大帝', ['calus']), false)
  assert.equal(py.match('故我在', 'guwozai'), true)
  assert.equal(py.match('故我在', 'gwz'), true)
  assert.equal(py.match('故我在', '故wo'), true)
  assert.equal(py.match('故我在', 'gwozai'), true)
  assert.equal(py.match('雪上加霜', 'xsjs'), true)
  assert.equal(py.match('雪上加霜', 'xueshangjiashuang'), true)
  assert.equal(py.match('行者', 'xingzhe'), true)
  assert.equal(py.match('行者', 'hangzhe'), true)
  assert.equal(py.match('侏罗纪绿', 'lv'), true)
  assert.equal(py.match('侏罗纪绿', 'lu'), true)
  assert.equal(py.match('旅行者的选择', 'lvxingzhe'), true)
  assert.equal(py.match('旅行者的选择', 'luxingzhe'), true)
  assert.equal(py.match('故我在', 'wz'), true, '从名字中间连着匹配（我在）')
  assert.equal(py.match('故我在', 'gz'), false, '简拼不能跳过中间的字')
  assert.equal(py.match('故我在', 'daojian'), false, '介绍里的字不该靠拼音命中名字')

  vm.runInContext(fs.readFileSync(path.join(site, 'assets/search.js'), 'utf8'), ctx,
    { filename: 'assets/search.js' })
  vm.runInContext(
    ['unpack', 'isDdc', 'libJump', 'ranked'].map((n) => funcSource('assets/home.js', n)).join('\n')
    + '\nthis.unpack=unpack;this.ranked=ranked',
    ctx)
  const index = ctx.unpack(ctx.starsideIndex)
  const pages = {}
  index.forEach((r) => {
    if (!r.n) r._t = ((r.t || '') + ' ' + (r.d || '')).toLowerCase()
    else { r._n = r.n.toLowerCase(); r._x = (r.x || '').toLowerCase() }
    if (r.d) pages[r.u] = r
  })
  function hit(hay, terms) {
    for (let i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false
    return true
  }
  function run(q) {
    return ctx.ranked(index, pages, q.toLowerCase().split(/\s+/).filter(Boolean), hit, q)
  }
  const named = (q) => run(q).filter((r) => r.n && !r.jump)
  const gwz = named('gwz')
  assert.ok(gwz.some((r) => r.n === '故我在' || r.n.startsWith('故我在')),
    'gwz 该命中故我在')
  for (const r of gwz) {
    assert.ok(py.match(r.n, 'gwz'), `${r.n} 不该仅因介绍被 gwz 命中`)
  }
  const full = named('guwozai')
  assert.ok(full.some((r) => r.n === '故我在' || r.n.startsWith('故我在')),
    'guwozai 该命中故我在')
  const rest = run('guwozai').filter((r) => r.n && !r.jump && !py.match(r.n, 'guwozai'))
  assert.equal(rest.length, 0, '介绍里写到故我在的条目不该靠拼音进名字档')
  assert.equal(named('kalusidadi').length, 0, '首领名不是物品，不该被拼音搜到')
  assert.equal(named('zuihouyiyuan').length, 0, '副本名不是物品，不该被拼音搜到')
  assert.ok(named('hx').some((r) => r.n === '虹吸'), 'hx 该命中护甲模组族虹吸')
  assert.ok(named('witherhoard').some((r) => r.n === '枯萎囤积'),
    'witherhoard 该作为条目名命中枯萎囤积')
  assert.ok(named('ergosum').some((r) => r.n === '故我在' || r.n.startsWith('故我在')),
    'ergosum 该命中故我在')
  assert.equal(named('calus').filter((r) => r.n === '卡鲁斯大帝').length, 0,
    '首领英文名不在物品表里')
})
// ── 索引页工具条 ─────────────────────────────────────────────────────────
// assets/app.js 的工具条全在运行时建，三道闸门与上面那些测试一个都看不见它：
// 配装索引页改成「一张网格、不分节」之后，app.js 那句 `if (!slot ||
// !sections.length) return` 让整条工具条一件都不建——搜索框、计数、四维筛选
// 全没了，而 npm run build 与 npm test 照旧全绿。这一段就是为那种情形存在的。
//
// **不引 jsdom。**下面这个壳只实现 app.js 真的碰到的那几个接口，四十来行。
function domStub () {
  function El (tag, cls) {
    this.tagName = (tag || 'div').toUpperCase()
    this.className = cls || ''; this.children = []; this.parentNode = null
    this.dataset = {}; this.attrs = {}; this._text = ''; this.hidden = false
    this.value = ''          // 搜索框：filter() 每次都读它
    this.style = { setProperty () {} }
  }
  El.prototype.appendChild = function (c) { this.insertBefore(c, null); return c }
  El.prototype.insertBefore = function (c, ref) {
    // 真 DOM 在参照节点不是自己的孩子时抛 NotFoundError。**壳必须照抛**：
    // 静默 append 会让「搬走再搬回来」那条路在测试里一路绿，而线上第一次点就崩。
    if (ref && ref.parentNode !== this) {
      throw new Error('NotFoundError: 参照节点不在这个列表里')
    }
    if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1)
    c.parentNode = this
    const at = ref ? this.children.indexOf(ref) : -1
    if (at < 0) this.children.push(c); else this.children.splice(at, 0, c)
    return c
  }
  Object.defineProperty(El.prototype, 'nextElementSibling', {
    get () {
      if (!this.parentNode) return null
      return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null
    }
  })
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v) }
  El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null }
  El.prototype.hasAttribute = function (k) { return k in this.attrs }
  El.prototype.toggleAttribute = function (k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k] }
  El.prototype.addEventListener = function () {}
  El.prototype.closest = function () { return null }
  El.prototype.contains = function (n) { return n === this || this.all().includes(n) }
  El.prototype.all = function (out) {
    out = out || []
    this.children.forEach((c) => { out.push(c); c.all(out) })
    return out
  }
  El.prototype.matches = function (sel) {
    // `li:not([hidden])`：filter() 判分节空不空用的就是它。壳认不得的话整条
    // 落到 tagName 比较上、恒为 false，于是每一节都被判成空——分节可见性的断言
    // 就全是空过，怎么改都绿。
    const not = /^(.*?):not\(\[hidden\]\)$/.exec(sel)
    if (not) return this.matches(not[1]) && !this.hidden
    if (sel[0] === '.') return (' ' + this.className + ' ').includes(' ' + sel.slice(1) + ' ')
    // [data-x="v"] 或 [data-x] → dataset.x：app.js 按维度名或属性名找页面容器。
    const attr = /^\[data-([\w-]+)(?:="(.*)")?\]$/.exec(sel)
    if (attr) {
      const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      return attr[2] === undefined ? key in this.dataset : this.dataset[key] === attr[2]
    }
    return this.tagName === sel.toUpperCase()
  }
  El.prototype.querySelectorAll = function (sel) {
    const want = sel.split(',')[0].trim().split(/[ >]+/).pop()
    return this.all().filter((e) => e.matches(want))
  }
  El.prototype.querySelector = function (s) { return this.querySelectorAll(s)[0] || null }
  Object.defineProperty(El.prototype, 'textContent', {
    get () { return this._text + this.children.map((c) => c.textContent).join('') },
    set (v) { this._text = v; this.children = [] }
  })
  return El
}

// 卡片按真实产出的形状给：多值 data-* 用制表符隔开，标签可以整个不写。
const CARDS = [
  // **两张相邻的组合卡**：只有一张时它的 nextElementSibling 恒为 null，
  // 「搬走再搬回来」那条路怎么写都不会撞上锚点问题。产出里 raid/猎人 那一列
  // 13 张里相邻的组合卡一大片，测试要照着那个形状给。
  { scene: 'raid\t地牢', cls: '猎人', tier: 'meta', branch: '烈日', tag: '输出\t推图' },
  { scene: 'raid\t地牢', cls: '猎人', tier: '强力', branch: '棱镜', tag: '推图' },
  { scene: 'raid', cls: '猎人', tier: '创意', branch: '虚空', tag: '机制' },
  { scene: 'raid', cls: '泰坦', tier: '强力', branch: '棱镜', tag: '机制' },
  { scene: '地牢', cls: '猎人', tier: '创意', branch: '烈日', tag: '推图' },
  { scene: '宗师/终极', cls: '术士', tier: '强力', branch: '虚空' },
  { scene: 'PVP', cls: '泰坦', tier: '强力', branch: '棱镜', tag: '6V6' },
  { scene: 'PVP', cls: '术士', tier: '创意', branch: '虚空', tag: '3V3' }
]

function toolbar (opts = {}) {
  const El = domStub()
  const body = new El('body')
  const slot = body.appendChild(new El('div', 'site-head')).appendChild(new El('div', 'toolbar'))
  slot.dataset = { section: '.block', item: '.entries > li', label: '', noun: '配装',
    facets: '场景=scene:single:groups;强度=tier:single;职业=cls:tuck;分支=branch:tuck;标签=tag:tuck' }
  let hideBtn = null
  if (opts.hideBy) {
    hideBtn = body.appendChild(new El('button', 'toggle'))
    hideBtn.dataset = { hideBy: opts.hideBy }
    hideBtn.setAttribute('aria-pressed', 'true')
  }
  // 场景与强度是两条主轴，各填进页面给的一个空容器，不进工具条。
  const bar = body.appendChild(new El('nav', 'facet-bar'))
  bar.dataset = { facet: '场景' }
  const tierBar = body.appendChild(new El('nav', 'facet-bar'))
  tierBar.dataset = { facet: '强度' }
  // 一节一个场景；多场景的配装落在它第一个场景那一节——与产出同形。
  const main = body.appendChild(new El('main'))
  const lis = []
  const cards = opts.cards || CARDS
  for (const [scene, group] of Object.entries(
    cards.reduce((by, c) => {
      const first = c.scene.split('\t')[0]
      ;(by[first] = by[first] || []).push(c)
      return by
    }, {}))) {
    const sec = main.appendChild(new El('section', 'block'))
    sec.id = 'sec-' + scene
    sec.dataset = { scene }
    sec.appendChild(new El('h2', 'sect-label')).textContent = scene
    // 小节按「这个场景下所有配装」的职业集合出——搬过来的卡要有落点，空的那张
    // 网格照样在 DOM 里。与生成器同形。
    const mine = new Set(group.map((c) => c.cls))
    const kin = cards.filter((c) => c.scene.split('\t').includes(scene))
    for (const cls of ['猎人', '泰坦', '术士']) {
      if (!kin.some((c) => c.cls === cls)) continue
      sec.appendChild(new El('h3', 'sub-label')).textContent = cls
      const ul = sec.appendChild(new El('ul', 'entries'))
      ul.dataset = { cls }
      if (!mine.has(cls)) continue
      for (const card of group.filter((c) => c.cls === cls)) {
        const li = ul.appendChild(new El('li', 'b-solar'))
        li.dataset = Object.assign({}, card)
        lis.push(li)
      }
    }
  }
  const sandbox = {
    document: {
      currentScript: null,
      documentElement: new El('html'),
      body,
      querySelector: (s) => body.querySelector(s),
      querySelectorAll: (s) => body.querySelectorAll(s),
      createElement: (t) => new El(t),
      createTextNode: (t) => Object.assign(new El('#text'), { _text: t }),
      addEventListener () {}
    },
    location: { href: 'http://x/builds/index.html', search: '' },
    history: { replaceState () {} },
    matchMedia: () => ({ matches: false }),
    addEventListener () {},
    requestAnimationFrame: (f) => f(),
    IntersectionObserver: function () { this.observe = this.disconnect = () => {} },
    getComputedStyle: () => ({ getPropertyValue: () => '0' }),
    URL,
    URLSearchParams,
    console
  }
  sandbox.window = sandbox
  vm.runInNewContext(fs.readFileSync(path.join(site, 'assets/app.js'), 'utf8'), sandbox)
  // 场景与强度在页面那两个容器里，其余三维是工具条上那块共用面板里的三行。
  const bars = { 场景: bar, 强度: tierBar }
  const panel = () => slot.children.find((c) => c.className === 'drop')
  const host = (dim) => {
    if (bars[dim]) return bars[dim]
    const box = panel()
    if (!box) return undefined
    return box.querySelectorAll('.tuck-row').find((r) => {
      const lab = r.querySelector('.facet-label')
      return lab && lab._text === dim
    })
  }
  const secOf = (scene) => main.children.find((c) => c.dataset.scene === scene)
  return {
    slot,
    bar,
    main,
    hideBtn,
    // 某个场景那一节此刻装着几张可见的卡。
    inSection: (scene) => {
      const sec = secOf(scene)
      return sec ? sec.querySelectorAll('li').filter((li) => !li.hidden).length : 0
    },
    tiersIn: (scene) => {
      const sec = secOf(scene)
      return sec ? sec.querySelectorAll('li').map((li) => li.dataset.tier) : []
    },
    sectionShown: (scene) => {
      const sec = secOf(scene)
      return !!sec && !sec.hidden
    },
    // 面板里此刻立着的那几行，按顺序给。
    tucked: () => {
      const box = panel()
      if (!box || box.hidden) return []
      return box.querySelectorAll('.tuck-row').filter((r) => !r.hidden)
        .map((r) => r.querySelector('.facet-label')._text)
    },
    // 触发器上那个数：三维已选之和。
    tally: () => {
      const box = panel()
      return box ? box.querySelector('summary').querySelector('b')._text : null
    },
    live: () => lis.filter((li) => !li.hidden).length,
    // 五维同一个画法，所以点法也只有一种：正文那两排与面板里那三行都是素字开关。
    click (dim, value) {
      const box = host(dim)
      assert.ok(box && !box.hidden, `维度「${dim}」的控件不在`)
      const btn = box.querySelectorAll('button').find((b) => b.textContent === value)
      assert.ok(btn, `维度「${dim}」上没有「${value}」`)
      btn.onclick()
    },
    values (dim) {
      const box = host(dim)
      if (!box || box.hidden) return []
      return box.querySelectorAll('button').map((b) => b.textContent)
    }
  }
}

test('the two main axes render into page containers and the rest into one shared panel', () => {
  const t = toolbar()
  assert.ok(t.slot.querySelector('.tool-search'), '搜索框没建出来')
  // 场景填进页面给的容器，「全部」排在最前。
  assert.deepEqual(t.values('场景'), ['全部', 'raid', '地牢', '宗师/终极', 'PVP'])
  assert.equal(t.bar.querySelector('.facet-label')._text, '场景')
  assert.deepEqual(t.values('强度'), ['全部', 'meta', '强力', '创意'],
    '强度没填进页面那条主轴')
  // 低频那三维收进工具条上同一块面板，一维一行，三行都常驻。
  assert.deepEqual(t.tucked(), ['职业', '分支', '标签'],
    '面板里那三行不对：三维应当各占一行且都在')
  assert.equal(t.slot.querySelectorAll('.drop').length, 1,
    '面板不止一块：三维合用一枚触发器，一维一枚就退回了老样子')
  // 大节就是场景，跳转 chip 那一排因此不出：同一批字不给第二个来源。
  assert.equal(t.slot.querySelector('.tool-chips'), null, '不该有跳转 chip 那一排')
})

test('every tucked dimension is there from the start and keeps its values', () => {
  const t = toolbar()
  const all = ['3V3', '6V6', '推图', '机制', '输出'].sort()
  // 标签一进来就在。以前它随场景现算取值，没选场景时整个控件不出、选了突袭才
  // 冒出来——控件凭空出现又凭空消失，读者学不会。
  assert.deepEqual(t.values('标签').sort(), all,
    '没选场景时标签那一行就该在，取值是全站并集')
  t.click('场景', 'PVP')
  assert.deepEqual(t.values('标签').sort(), all,
    '选了场景之后标签的取值变了：控件不该在读者没碰它的时候自己少几枚')
  t.click('场景', 'PVP')
  assert.deepEqual(t.values('职业').sort(), ['猎人', '泰坦', '术士'].sort(),
    '职业那一行的取值也不该随别的维收窄')
})

test('the shared trigger counts picks across all three tucked dimensions', () => {
  const t = toolbar()
  assert.equal(t.tally(), '', '一个都没选时触发器上不该有数字')
  t.click('职业', '猎人')
  assert.equal(t.tally(), '1')
  t.click('标签', '输出')
  // 面板收起来之后就看不见还筛着什么了，那个数是唯一的提示，必须是三维之和。
  assert.equal(t.tally(), '2', '触发器上的数不是三维之和')
  t.click('职业', '猎人')
  assert.equal(t.tally(), '1', '取消之后没减回去')
})

test('picks union inside a dimension and intersect across dimensions', () => {
  const t = toolbar()
  t.click('职业', '猎人')
  assert.equal(t.live(), 4, '同一维度内应当取并集')
  t.click('职业', '泰坦')
  assert.equal(t.live(), 6)
  t.click('强度', '创意')
  assert.equal(t.live(), 2, '维度之间应当取交集')
})

test('a single-select dimension replaces its pick instead of adding to it', () => {
  const t = toolbar()
  t.click('场景', 'raid')
  assert.equal(t.live(), 4)
  t.click('场景', '地牢')
  assert.equal(t.live(), 3, '场景是 :single，点第二枚应当换掉第一枚而不是取并集')
  t.click('场景', '地牢')
  assert.equal(t.live(), CARDS.length, '再点一次同一枚应当清空这一维')
})

test('the main axis carries an 全部 reset that clears the dimension', () => {
  const t = toolbar()
  t.click('场景', 'PVP')
  assert.equal(t.live(), 2)
  t.click('场景', '全部')
  assert.equal(t.live(), CARDS.length, '「全部」没把场景清干净')
})

test('zero hits show an empty state whose reset button clears all filters', () => {
  const t = toolbar()
  t.click('场景', '地牢')
  t.click('职业', '术士')
  assert.equal(t.live(), 0)
  const empty = t.main.querySelector('.tool-empty')
  assert.ok(empty && !empty.hidden, '零命中时没出空状态提示')
  const reset = empty.querySelector('button')
  assert.ok(reset, '空状态里没有重置按钮')
  reset.onclick()
  assert.equal(t.live(), CARDS.length, '点重置筛选后没把全部卡片恢复回来')
  assert.equal(empty.hidden, true, '恢复后空状态没收起来')
})

test('an overlapping build sits in its first scene and moves to whichever is picked', () => {
  const t = toolbar()
  // 默认：两张 raid·地牢 归 raid，没有第三节。
  assert.equal(t.inSection('raid'), 4, '默认 raid 就该是 纯 raid + raid·地牢')
  assert.equal(t.inSection('地牢'), 1)
  assert.equal(t.sectionShown('raid'), true, '默认视图里 raid 那一节应当立着')

  // 点 raid：本来就在这儿，不动。
  t.click('场景', 'raid')
  assert.equal(t.inSection('raid'), 4)

  // 点地牢：那两张搬到地牢去，raid 只剩纯 raid 的两张、都不命中，整节收起。
  t.click('场景', '地牢')
  assert.equal(t.inSection('地牢'), 3, '地牢 = 纯地牢 + raid·地牢，没搬过来')
  assert.equal(t.inSection('raid'), 0)
  assert.equal(t.sectionShown('raid'), false, '搬空之后 raid 那一节还立着')

  // 回到全部：搬回第一个场景那一节。**两张组合卡相邻**，所以这一步会踩到
  // 「拿原来的下一个兄弟当锚点」那个坑——真 DOM 会抛 NotFoundError。
  t.click('场景', '全部')
  assert.equal(t.inSection('raid'), 4)
  assert.equal(t.inSection('地牢'), 1)
  assert.equal(t.live(), CARDS.length, '搬来搬去之后总数变了，说明卡被复制或丢了')

  // 顺序也要还原：生成器排好的「强度在前、同档按时间降序」不能被搬乱。
  const raidTiers = t.tiersIn('raid')
  assert.deepEqual(raidTiers, ['meta', '强力', '创意', '强力'].slice(0, raidTiers.length),
    '搬回来之后节内顺序乱了')
})

test('tucked filter footer shows picked names and clears them, and scene-share banner merges overlapping builds', () => {
  const t = toolbar()
  const box = t.slot.children.find((c) => c.className === 'drop')
  const foot = box.querySelector('.tuck-foot')
  assert.ok(foot && foot.hidden, '未选任何折叠维度时 .tuck-foot 应当隐藏')
  t.click('职业', '猎人')
  t.click('标签', '输出')
  assert.equal(foot.hidden, false, '选中折叠维度后 .tuck-foot 应当显示')
  assert.equal(box.querySelector('summary').getAttribute('title'), '已选：猎人、输出')
  foot.querySelector('button').onclick()
  assert.equal(t.tally(), '', '点清空已选后应当清空折叠维度计数')
  assert.equal(foot.hidden, true, '点清空已选后 .tuck-foot 应当收起')

  const dungeonSec = t.main.children.find((c) => c.dataset.scene === '地牢')
  const shareBtn = dungeonSec.querySelector('.scene-share')
  assert.ok(shareBtn && !shareBtn.hidden, '地牢分节默认应当显示跨场景通用配装并入提示')
  shareBtn.onclick()
  assert.equal(t.inSection('地牢'), 3, '点击并入提示后应当将 raid·地牢 通用卡并入地牢分节')
  assert.equal(shareBtn.hidden, true, '并入地牢后提示按钮自身应当收起')
})

test('data-hide-by hides matching author cards by default and toggles them on click', () => {
  const cards = CARDS.concat([
    { scene: 'raid\t地牢', cls: '猎人', tier: 'meta', branch: '烈日', tag: '输出', by: 'Aegis' },
    { scene: 'raid\t地牢', cls: '术士', tier: '强力', branch: '虚空', tag: '输出', by: 'Aegis' }
  ])
  const t = toolbar({ hideBy: 'Aegis', cards })
  assert.equal(t.live(), CARDS.length, '加载时应当默认隐藏 Aegis 配装')
  assert.equal(t.slot.querySelector('.tool-search').placeholder, `搜索 ${CARDS.length} 个配装`)
  assert.equal(t.slot.querySelector('.tool-count').textContent, '', '默认隐藏不计入筛选计数状态')
  const dungeonSec = t.main.children.find((c) => c.dataset.scene === '地牢')
  const shareBtn = dungeonSec.querySelector('.scene-share')
  assert.ok(shareBtn.textContent.includes('2 套'), '默认隐藏时跨节通用提示不应计入 Aegis 配装')
  t.hideBtn.onclick()
  assert.equal(t.hideBtn.getAttribute('aria-pressed'), 'false')
  assert.equal(t.live(), cards.length, '取消隐藏后应当显示全部配装（含 Aegis）')
  assert.equal(t.slot.querySelector('.tool-search').placeholder, `搜索 ${cards.length} 个配装`)
  assert.ok(shareBtn.textContent.includes('4 套'), '显示 Aegis 配装后跨节通用提示应当更新套数')
  t.hideBtn.onclick()
  assert.equal(t.hideBtn.getAttribute('aria-pressed'), 'true')
  assert.equal(t.live(), CARDS.length, '再次点击应当恢复隐藏 Aegis 配装')
})

// 页脚访客数那段脚本从手写首页里现取：check_shell.py 钉着它与 shell.HIT 逐字一致，
// 测的因此就是每一页上线的那一份。时钟、localStorage 与 fetch 换成桩。
function footerCounter() {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8')
  const code = html.match(/<script>(\(function\(\)\{var d=new Date[\s\S]*?)<\/script>/)
  assert.ok(code, 'index.html 里找不到访客计数那段脚本')
  const store = new Map()
  const sent = []
  let clock = 0
  let reply = null
  class Clock extends Date {
    constructor(...a) { super(...(a.length ? a : [clock])) }
    static now() { return clock }
  }
  return {
    store, sent,
    at(iso) { clock = Date.parse(iso) },
    later(ms) { clock += ms },
    answer(today, total) { reply = { today, total } },
    async open(home) {
      const sv = { textContent: '' }
      const body = reply
      vm.runInNewContext(code[1], {
        Date: Clock,
        document: { getElementById: (id) => (id === 'sv' && home ? sv : null) },
        localStorage: {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
        },
        fetch(url, init) {
          sent.push(init ? JSON.parse(init.body) : url.slice(url.indexOf('?')))
          return Promise.resolve({ json: () => body })
        },
      })
      await new Promise(setImmediate)
      return sv.textContent
    },
  }
}

test('the footer count is fresh when the day began on a page without it', async () => {
  // 当天先开别的页、再进首页：svd 已是今天，svt 却是首页上次写的那一句。
  // 借 svd 判当天，首页就照搬几天前的数，连着几天不动。
  const f = footerCounter()
  f.at('2026-09-06T04:00:00Z')
  f.answer(712, 11217)
  assert.equal(await f.open(true), '今日 712 位访客 · 累计 11217')
  f.at('2026-09-10T04:00:00Z')
  f.answer(1288, 17092)
  assert.equal(await f.open(false), '')
  assert.deepEqual(f.sent.at(-1), { a: 'hit', s: 0 }, '当天第一页要计数，且没有 sv 的页不要数')
  assert.equal(await f.open(true), '今日 1288 位访客 · 累计 17092', '首页照搬了几天前那一句')
  assert.equal(f.sent.at(-1), '?a=stats', '当天已计过数，首页只该读')
  assert.equal(f.sent.length, 3)
})

test('the footer count is reused for ten minutes, then read again', async () => {
  const f = footerCounter()
  f.at('2026-09-10T04:00:00Z')
  f.answer(10, 100)
  assert.equal(await f.open(true), '今日 10 位访客 · 累计 100')
  assert.deepEqual(f.sent, [{ a: 'hit', s: 1 }])
  f.answer(20, 110)
  f.later(9 * 60e3)
  assert.equal(await f.open(true), '今日 10 位访客 · 累计 100', '十分钟内不该再打后端')
  assert.equal(f.sent.length, 1)
  f.later(2 * 60e3)
  assert.equal(await f.open(true), '今日 20 位访客 · 累计 110')
  assert.deepEqual(f.sent.slice(1), ['?a=stats'], '过了十分钟只该读，不该再计一次数')
})

test('a footer count cached as bare text is read again, not shown', async () => {
  // 线上浏览器里存的 svt 可能只有文本、没有时刻：不认它，读一次新的。
  const f = footerCounter()
  f.at('2026-09-10T04:00:00Z')
  f.store.set('svd', '2026-09-10')
  f.store.set('svt', '今日 712 位访客 · 累计 11217')
  f.answer(1288, 17092)
  assert.equal(await f.open(true), '今日 1288 位访客 · 累计 17092')
  assert.deepEqual(f.sent, ['?a=stats'])
})
