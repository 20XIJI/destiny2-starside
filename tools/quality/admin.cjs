'use strict'
const {
  assert, fs, path, vm, crypto, zlib, root, site, copy, digest,
  test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows,
} = require('./harness.cjs')

// 切格在 JS 侧有三份：云函数与 edit.js 的 cellSpans()（应当逐字相同）、admin.js 的
// cells()（前端闸门数格数用的那份，{ 的判据与 } 的钳位都不一样）。拿全部真表格行现跑
// 对住，不用快照——scratchpad 里那份断言正是因为把对面的结果冻成了快照，改了实现
// 照样全绿。
//
// Python 那一份不在这里：起 python 就破了这份套件「不启动子进程」的承诺。它与「语料
// 保持规整」这个前提由 check_quality.py 的 CellSplitting 管。

function splitter(file, name) {
  const ctx = {}
  vm.createContext(ctx)
  // admin.js 的 cells() 用到模块里的 OPEN 与 openAt，一并带上。
  const deps = name === 'cells'
    ? "var OPEN=/^\\{([\\w-]+)\\|/;function openAt(s,i){return s.charAt(i)==='{'?OPEN.exec(s.slice(i)):null}\n"
    : ''
  vm.runInContext(deps + funcSource(file, name) + `\nthis.f=${name}`, ctx)
  return ctx.f
}


test('the shared modules are byte-identical in both places they have to live', () => {
  // 源稿方言（admin/dialect.js）、配装源稿形状（builds/source.js）与永恒之诗抓取模块（tools/sync-eververse.js）
  // 在 JS 这一侧各只有一份定义。云函数只 require 得到自己目录下的东西，所以 build-terms.py 各复制一份到
  // functions/api/。复制走样就是站上与库里对同一行切出不同的格、对同一套配装算出不同的指纹。
  for (const [rel, fn] of [
    ['site/admin/dialect.js', 'dialect.js'],
    ['site/builds/source.js', 'source.js'],
    ['tools/sync-eververse.js', 'eververse.js'],
    ['tools/sync-xur.js', 'xur.js']
  ]) {
    const one = fs.readFileSync(path.join(root, rel), 'utf8')
    const two = fs.readFileSync(path.join(root, 'functions/api', fn), 'utf8')
    assert.equal(two, one, `functions/api/${fn} 与 ${rel} 不一样了——跑 npm run build 重新复制`)
  }
})

test('no consumer keeps a private copy of the splitter', () => {
  // 从前这条规则在 JS 里有三份（云函数、edit.js、admin.js），且并不等价：
  // admin.js 的 titleEnd() 不记花括号深度，4563 行语料里 382 行把行标题截在
  // {token|…} 内部那个竖线上，于是行标题里的词在编辑台上被报「该着色」，
  // 而构建时的 G6 不报。认的是切格独有的那一句剥空格循环：谁再抄一份回去，
  // 那一句就跟着回去，这条就响。
  const MARK = "while (b > a && line[b - 1] === ' ') b--"
  const owns = ['site/admin/dialect.js', 'functions/api/dialect.js']
  for (const rel of [...owns, 'functions/api/index.js', 'site/admin/edit.js', 'site/admin/shared.js', 'site/admin/admin.js']) {
    const has = fs.readFileSync(path.join(root, rel), 'utf8').includes(MARK)
    assert.equal(has, owns.includes(rel),
      has ? `${rel} 又自己实现了一遍切格，应该转给 dialect.js`
          : `${rel} 里找不到切格实现——dialect.js 被改动了？`)
  }
})


test('both entry points load the shared modules before the console that uses them', () => {
  // admin/shared.js 与 admin.js 现读 window.starsideDialect 与 window.starsideSource。
  // /admin/ 手写 HTML 要按 dialect -> source -> shared -> admin 的顺序引用。
  const html = fs.readFileSync(path.join(site, 'admin/index.html'), 'utf8')
  const at = (src) => html.indexOf(`<script src="${src}"`)
  for (const src of ['dialect.js', '../builds/source.js', 'shared.js']) {
    assert.notEqual(at(src), -1, `admin/index.html 没有引 ${src}`)
    assert.ok(at(src) < at('admin.js'), `admin/index.html 里 ${src} 要排在 admin.js 前面`)
  }
  assert.ok(at('dialect.js') < at('shared.js') && at('../builds/source.js') < at('shared.js'),
    'admin/index.html 里 dialect.js 与 source.js 要排在 shared.js 前面')

  // 资料页与配装页上开编辑态走 edit.js：只注入 dialect -> source -> shared，不拉完整审核台 admin.js。
  const edit = fs.readFileSync(path.join(site, 'admin/edit.js'), 'utf8')
  const chain = /script\('admin\/dialect\.js'\)[\s\S]{0,120}script\('builds\/source\.js'\)[\s\S]{0,120}script\('admin\/shared\.js'\)/
  assert.match(edit, chain, 'edit.js 注入 shared.js 之前没有先注入 dialect.js 与 source.js')
  assert.doesNotMatch(edit, /script\('admin\/admin\.js'\)/, 'edit.js 不应再注入完整的 admin/admin.js')
})

test('the dialect splits every real table row into cells that agree with its own count', () => {
  const D = require(path.join(site, 'admin/dialect.js'))
  const rows = tableRows()
  // 主键骨架那 23 篇没有表格行，语料就是 docs/ 那 16 篇；下限与 Python 那一侧同取 1800。
  assert.ok(rows.length > 1800, `只扫到 ${rows.length} 行表格行，语料挪走了？`)
  for (const [where, n, line] of rows) {
    const spans = D.cellSpans(line)
    assert.notEqual(spans, null, `${where}:${n} 整行不认——那一格永远改不了`)
    assert.equal(D.cells(line), spans.length, `${where}:${n} cells() 与 cellSpans() 数不一致`)
    assert.ok(spans.every(([a, b]) => a <= b && b <= line.length), `${where}:${n} 区间越界`)
  }
})
// 编辑台的 lint() 与 terms.js 一起跑：admin.js 在 Node 里只导出纯函数，
// 但顶层有一句 window.addEventListener，所以 window 要给个壳。
function adminApi(extra) {
  const sandbox = { console, module: { exports: {} }, window: { addEventListener() {} }, ...extra }
  vm.createContext(sandbox)
  for (const rel of ['admin/dialect.js', 'builds/source.js', 'admin/terms.js', 'admin/shared.js', 'admin/admin.js']) {
    vm.runInContext(fs.readFileSync(path.join(site, rel), 'utf8'), sandbox, { filename: rel })
  }
  return { api: sandbox.module.exports, shared: sandbox.window.starsideShared, terms: sandbox.window.starsideTerms }
}

test('admin/shared.js provides all shared helpers standalone without admin.js', () => {
  const sandbox = { console, module: { exports: {} }, window: {} }
  vm.createContext(sandbox)
  for (const rel of ['admin/dialect.js', 'builds/source.js', 'admin/shared.js']) {
    vm.runInContext(fs.readFileSync(path.join(site, rel), 'utf8'), sandbox, { filename: rel })
  }
  const S = sandbox.window.starsideShared
  for (const fn of ['tok', 'say', 'lint', 'slotOf', 'formSrc', 'readForm', 'mountForm']) {
    assert.equal(typeof S[fn], 'function', 'shared.js 缺少 ' + fn)
  }
  assert.equal(typeof S.MSG, 'object')
  assert.equal(S.slotOf('# 配装\n'), 'one')
  assert.equal(S.formSrc('set'), 'builds/new/set/index.html')
  assert.equal(S.say({ message: 'no doc' }), '库中没有这一篇，请刷新')
})

test('admin.js edSay translates editor errors and falls back to shared MSG without throwing', () => {
  const sandbox = { console, module: { exports: {} }, window: {} }
  vm.createContext(sandbox)
  for (const rel of ['admin/dialect.js', 'builds/source.js', 'admin/shared.js']) {
    vm.runInContext(fs.readFileSync(path.join(site, rel), 'utf8'), sandbox, { filename: rel })
  }
  const code = funcSource('admin/admin.js', 'SH') + '\n'
    + fs.readFileSync(path.join(site, 'admin/admin.js'), 'utf8').match(/  var ED_MSG = \{[^\n]+\}/)[0] + '\n'
    + funcSource('admin/admin.js', 'edSay')
  vm.runInContext(code, sandbox)
  assert.equal(sandbox.edSay({ message: 'forbidden' }), '只能调整级别低于本人的编辑者')
  assert.equal(sandbox.edSay({ message: 'bad uid' }), 'UID 不能为空')
  assert.equal(sandbox.edSay({ message: 'no doc' }), '库中没有这一篇，请刷新')
  assert.equal(sandbox.edSay({ message: 'custom error' }), 'custom error')
})

// 汉字与拉丁之间那个排版空格的插入点，与 items.py 的 pattern() 同一条判据。
const BOUND = /(?<=[\u4e00-\u9fff])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\u4e00-\u9fff])/g

test('the editing console flags item names written with the typographic space', () => {
  // 源稿按 design.md 三节在汉字与拉丁之间补一个空格（语料里 117 处「Vex 揭秘者」
  // 这类写法），而 tools/items.json 的键是归一化过的、没有那个空格。Python 那侧
  // 靠 items.pattern() 把空格允许回来；terms.js 要把两种写法都带上，否则编辑台
  // 对这批名字一声不吭，而构建时的 G6 照报——人在编辑台上看不出该着色。
  const { api, terms } = adminApi()
  const mixed = terms.items.filter((row) => BOUND.test(row[0]) && (BOUND.lastIndex = 0, true))
  assert.ok(mixed.length > 20, `terms.js 里中英混排的名字只有 ${mixed.length} 个，词表挪走了？`)
  const missed = []
  for (const [word, token] of mixed) {
    const spaced = word.replace(BOUND, ' ')
    if (spaced === word) continue
    const { warns } = api.lint('拿' + spaced + '打一发。', { cols: 0, head: false }, true)
    if (!warns.some((w) => w.startsWith('「' + spaced + '」该着 ' + token))) missed.push(spaced)
  }
  assert.deepEqual(missed, [],
    `这些名字按源稿的写法出现时，编辑台不提示该着色，而 npm run build 的 G6 会报：${missed.slice(0, 5).join('、')}`)
})

test('the editing console asks for no tint the build does not ask for', () => {
  // terms.js 的 items 就是构建 G6 正查那一份（items.forward_terms()）。它曾送的是
  // items.load() 全量，多出只参与反查的 355 条：编辑台对 48 个词报了 153 条「该着色」，
  // 而 npm run build 与 --apply 都不要求。构建过得去的源稿，这里一条都不许报。
  const { api, terms } = adminApi()
  const RULE = /^\|[-| ]+\|$/
  const docs = path.join(root, 'references/docs')
  const extra = []
  for (const f of fs.readdirSync(docs).filter((n) => n.endsWith('.md'))) {
    const slug = f.slice(0, -3)
    const g6 = terms.g6.includes(slug)
    const ok = terms.classes.concat(terms.pageClasses['docs/' + slug] || [])
    const lines = fs.readFileSync(path.join(docs, f), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!line.trim() || RULE.test(line.trim())) return
      const head = RULE.test((lines[i + 1] || '').trim())
      for (const w of api.lint(line, { cols: 0, head }, g6 && !head, ok).warns) extra.push(`docs/${slug}:${i + 1} ${w}`)
    })
  }
  assert.deepEqual(extra.slice(0, 5), [], `编辑台多报了 ${extra.length} 条构建不要求的提示`)
})

test('the review console opens the next pending build after a verdict', () => {
  const { api } = adminApi()
  const order = ['a', 'b', 'c', 'd']
  assert.equal(api.nextWait(order, 'b', ['c', 'd']), 'c', '往后找第一条仍待审的')
  assert.equal(api.nextWait(order, 'b', ['a', 'd']), 'd', '已经审过的那几条要跳过')
  assert.equal(api.nextWait(order, 'd', ['a']), 'a', '到底了从头找')
  assert.equal(api.nextWait(order, 'a', []), null, '队列审空了就回列表')
  assert.equal(api.nextWait(order, 'b', ['b']), null, '刚审的那一条不算下一条')
})

test('the review diff marks only the stretch that changed', () => {
  const { api } = adminApi()
  const same = (a, b) => Array.from(api.changed(a, b))
  // 记录里真出现过的一格：九十个字里只改了四个
  assert.deepEqual(same('不需要携带多个层层不绝，通常只需要', '不需要携带多个完全充能，通常只需要'), [7, 6])
  assert.deepEqual(same('ab', 'aXb'), [1, 1], '插进去的字：旧的一侧没有要标的')
  // 重复的字不许让头尾两段重叠，否则标出来的区间是负的
  assert.deepEqual(same('aa', 'aaa'), [2, 0])
  assert.deepEqual(same('同一句', '同一句'), [3, 0], '只改了着色时文字相同，没有要标的')
})


/* 库里那份正文没拉回来时，**不许拿投稿那份顶上**。上一条保证后端会取全，这一条
   保证前端在后端真出岔时不会把陈稿灌进填表页——两层各守一边，中间那条缝是本次
   事故的形状。 */
test('a live build whose body did not come back never falls back to the submission', () => {
  const { api } = adminApi()
  // 库里这一条存在、hash 与 landed 都在，只是 md 这个键没跟回来（投影或截断）。
  const rows = api.builds(
    [{ _id: 'builds/s29-x/a-hunter', hash: 'h', landed: 'h', at: '2' }],
    [{ _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 投稿时那份陈稿\n', at: '1' }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].state, 'live')
  assert.equal(rows[0].md, '', '拿不到库里那份就交空的，不退回 s.md')
})


// builds/source.js 的必填项与生成器的必填项是两份实现（JS 与 Python），跨不过去的
// 那条缝由下面这一条钉住：构建过得去的源稿，lacking() 一条都不该报。
//
// 踩过一次：合集的 PER 无条件要求每一套写「标签：」，而 tags_of() 的规矩是
// 「宗师/终极、日常、功能性这三个场景整行必须不写，其余场景可写可不写」。7 份
// 合集里 5 份因此挂着假的「缺 …」，其中两份还报「两套填齐的配装（现在 0 套）」
// ——那一行长到把配装名挤成一个省略号，而填表页那一侧 lacking() 非空即 return，
// 这几份合集一个字都改不回去。三道闸门与 npm test 当时全绿。
function buildSources() {
  // 源稿是结构化记录，而填表页与审核台认的是 markdown。**读产出里那段导出文本**，
  // 不读源稿：生成器交给填表页的正是它（<pre id="src"> / <pre class="src">），
  // 这条测试问的也正是「表单接不接受生成器给它的那一份」。
  const dir = path.join(site, 'builds')
  const out = []
  for (const season of fs.readdirSync(dir)) {
    const sd = path.join(dir, season)
    if (!/^s\d+$/.test(season) || !fs.statSync(sd).isDirectory()) continue
    for (const slug of fs.readdirSync(sd)) {
      const page = path.join(sd, slug, 'index.html')
      if (!fs.existsSync(page)) continue
      const html = fs.readFileSync(page, 'utf8')
      const blocks = html.match(/<pre (?:id="src"|class="src") hidden>([^]*?)<\/pre>/g) || []
      blocks.forEach((block, i) => {
        const body = block.replace(/^<pre [^>]*>/, '').replace(/<\/pre>$/, '')
        out.push([`${slug}${blocks.length > 1 ? '#' + (i + 1) : ''}`, unescapeHtml(body)])
      })
    }
  }
  // 光「一条都没报」不够：读不到源稿时零命中也是全绿。
  assert.ok(out.length > 50, `builds/ 下只读到 ${out.length} 段导出文本，路径变了？`)
  return out
}

function unescapeHtml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

/* 填表页非空即不许投，审核台照着列「缺 …」，两处读的都是 builds/source.js 的
   lacking()。构建得过的源稿，这里必须一条都不报。 */
test('a source the build accepts is complete by the shared source module', () => {
  const B = require(path.join(site, 'builds/source.js'))
  const bad = []
  for (const [file, md] of buildSources()) {
    const lack = B.lacking(md)
    if (lack.length) bad.push(`${file}（${B.isSet(md) ? '合集' : '单套'}）→ ${lack.join('、')}`)
  }
  assert.deepEqual(bad, [], `这些构建得过的源稿会被填表页拦下、被审核台报缺：\n  ${bad.join('\n  ')}`)
})


// 填表页当场去掉会被读成源稿结构的符号：行首的 # 与不成对的花括号。合法的着色标记
// 要留着，审核台与编辑遮罩载进来的源稿带着它们。
test('the form strips line-leading hashes and stray braces but keeps color markers', () => {
  const { tidy } = require(path.join(site, 'builds/new/form.js'))
  const t = (s) => tidy(s).text
  assert.equal(t('#1 刚需圣贤2\n## 注解\n  #② 神器'), '1 刚需圣贤2\n注解\n② 神器')
  assert.equal(t('见 #3 那条'), '见 #3 那条', '行中的 # 不动')
  assert.equal(t('能{持续产绿弹}的'), '能持续产绿弹的')
  assert.equal(t('a}b{'), 'ab')
  assert.equal(t('吃{el-arc|增幅 同款'), '吃增幅 同款', '没闭合的开头连 token| 一起去掉')
  for (const ok of ['{el-arc|增幅}同款{bar-yellow|首领}', '{a|x{b|y}z}', '名字 | https://x.y/#z']) {
    assert.equal(t(ok), ok)
  }
  assert.deepEqual(tidy('#ab', 3), { text: 'ab', at: 2 }, '光标按它之前去掉的字往前挪')
  assert.deepEqual(tidy('x{y}z', 2), { text: 'xyz', at: 1 })

  // 构建得过的注解与描述，填表页一个字都不改。
  const bad = []
  for (const [file, md] of buildSources()) {
    const parts = (md.match(/^描述：.*$/gm) || [])
      .concat(md.split('\n## 注解').slice(1).map((p) => p.split(/\n#/)[0]))
    if (parts.some((p) => t(p) !== p)) bad.push(file)
  }
  assert.deepEqual(bad, [], `填表页会改动这些源稿的注解或描述：\n  ${bad.join('\n  ')}`)
})


// 编辑时散文格里只放文字，颜色画在镜像层；写回时按区间拼回标记。
test('prose markers split into text and spans, shift with edits and weave back verbatim', () => {
  const { unmark, remark, shiftSpans } = require(path.join(site, 'builds/new/form.js'))
  for (const src of ['先转{el-prismatic|超凡}（头', '{a|x{b|y}z}', '{a|{b|x}}', '{a|x{b|y}}', '无色']) {
    const u = unmark(src)
    assert.ok(u.ok, src)
    assert.equal(remark(u.text, u.spans), src, src)
  }
  assert.equal(unmark('先转{el-prismatic|超凡}（头').text, '先转超凡（头')
  for (const bad of ['能{持续产绿弹}的', '吃{el-arc|增幅 同款', 'a}b']) {
    assert.deepEqual(Object.assign({}, unmark(bad)), { text: bad, spans: [], ok: false }, bad)
  }

  const s = unmark('甲{el-arc|增幅}乙')
  const edit = (after) => remark(after, shiftSpans(s.spans, s.text, after))
  assert.equal(edit('前甲增幅乙'), '前甲{el-arc|增幅}乙', '改动在前：整体平移')
  assert.equal(edit('甲增幅乙后'), '甲{el-arc|增幅}乙后', '改动在后：不动')
  assert.equal(edit('甲增幅者乙'), '甲{el-arc|增幅}者乙', '紧贴词尾打字：词还是原来的颜色')
  assert.equal(edit('甲增X幅乙'), '甲增X幅乙', '改到词里：去掉颜色，交给构建重判')
  assert.equal(edit('甲乙'), '甲乙')

  // 构建得过的每一篇源稿：散文拆开再拼回，一个字都不变。
  const bad = []
  for (const [file, md] of buildSources()) {
    const parts = (md.match(/^描述：.*$/gm) || []).map((l) => l.slice(3))
    for (const head of ['## 注解', '## 合集介绍', '## 审核意见']) {
      for (const p of md.split('\n' + head).slice(1)) parts.push(p.split(/\n#/)[0])
    }
    if (parts.some((p) => { const u = unmark(p); return !u.ok || remark(u.text, u.spans) !== p })) {
      bad.push(file)
    }
  }
  assert.deepEqual(bad, [], `这些源稿的散文拆开再拼回对不上：\n  ${bad.join('\n  ')}`)
})

test('copyTitle increments duplicate suffixes without stacking 副本 副本', () => {
  const { copyTitle } = require(path.join(site, 'builds/new/form.js'))
  assert.equal(copyTitle('# 清怪\n\n职业：猎人'), '# 清怪 副本\n\n职业：猎人')
  assert.equal(copyTitle('# 清怪 副本\n\n职业：猎人'), '# 清怪 副本 2\n\n职业：猎人')
  assert.equal(copyTitle('# 清怪 副本 2\n\n职业：猎人'), '# 清怪 副本 3\n\n职业：猎人')
})

test('form pages contain every focusMissing target and starsidePy.hit matches item strings', () => {
  const soloHtml = fs.readFileSync(path.join(site, 'builds/new/index.html'), 'utf8')
  const setHtml = fs.readFileSync(path.join(site, 'builds/new/set/index.html'), 'utf8')
  for (const html of [soloHtml, setHtml]) {
    assert.match(html, /class="tags tagset"[^>]*>[\s\S]*?<\/span><input type="hidden" data-key="场景"/)
    assert.match(html, /class="tags tagset"[^>]*>[\s\S]*?<\/span><input type="hidden" data-key="强度"/)
    assert.match(html, /data-key="推荐人"/)
    assert.match(html, /data-key="配装名"/)
    assert.match(html, /id="f-core-art"/)
  }
  assert.match(setHtml, /data-key="合集名"/)
  assert.match(setHtml, /data-set-add/)
  assert.match(setHtml, /<button type="button" class="op" data-set-copy>创建副本<\/button>/)

  const styleCss = fs.readFileSync(path.join(site, 'builds/style.css'), 'utf8')
  assert.match(styleCss, /\[id\$="sec-1"\] \.slot-row:first-of-type > \.slot:nth-child\(2\) \{ flex: 1\.35 1 224px; \}/)
  assert.match(styleCss, /\[id\$="sec-1"\] \.slot-row:first-of-type > \.slot:nth-child\(3\) \{ flex: var\(--n\) 1 calc\(22px \+ var\(--n\) \* 116px\); \}/)
  assert.match(styleCss, /\[id\$="sec-1"\] \.slot-row \+ \.slot-row > \.slot:nth-child\(2\) \{ flex: 1 1 0; \}/)
  assert.match(styleCss, /\[id\$="sec-1"\] \.slot-row \+ \.slot-row > \.slot:nth-child\(2\) \.cells \{ grid-template-columns: repeat\(max\(var\(--n\), 4\), minmax\(0, 1fr\)\); \}/)
  assert.match(styleCss, /\[id\$="sec-3"\] \.cells \{ grid-template-columns: repeat\(max\(var\(--n\), 4\), minmax\(0, 1fr\)\); \}/)
  assert.match(styleCss, /\[id\$="sec-2"\] \.slot-row > \.rig \{ max-width: calc\(\(100% - 10px\) \/ 2\); \}/)
  assert.match(styleCss, /\[id\$="sec-4"\] \.slot-row:not\(\.lead\) > \.slot \{ max-width: calc\(\(100% - 20px\) \/ 3\); \}/)
  assert.match(styleCss, /\.slot-row\.lead > \.slot:not\(\.stats-card\) \{ max-width: calc\(282px \+ \(var\(--n\) - 1\) \* 400px\); \}/)
  assert.match(styleCss, /\.set-list ol b::before \{ content: counter\(seat\) "　";/)
  assert.match(styleCss, /\.ex-perks > \.item\.perk-cell \{ padding: 5px 6px; \}/)
  assert.match(styleCss, /\.build-head \.core \.node \{ margin: 3px; --fr: 102px; \}/)
  assert.match(styleCss, /\.one-head \.id-row \{ align-items: center; gap: 12px; \}/)
  assert.match(styleCss, /\.set-list span:empty \{ display: none; \}/)
  assert.match(styleCss, /#sheet\.preview \.rig:not\(:has\(\.item:not\(\.empty\)\)\)/)

  const { syncPreviewRoot, PREVIEW_SLOT_SEL } = require(path.join(site, 'builds/new/form.js'))
  assert.equal(PREVIEW_SLOT_SEL, '.slot:not(.stats-card):not([id$="sec-4"] .slot-row:not(.lead) > .slot)')
  const shotSrc = fs.readFileSync(path.join(site, 'builds/shot.js'), 'utf8')
  const formSrc = fs.readFileSync(path.join(site, 'builds/new/form.js'), 'utf8')
  assert.ok(shotSrc.includes(PREVIEW_SLOT_SEL), 'shot.js 与 form.js 的预览面板选择器必须一致，跳过护甲部位列')
  assert.match(formSrc, /--sz:96px;--tile:45px/, '合集编辑台核心拼图尺寸与生成器 45px 对齐')

  const makeSlot = (editN, filledLiCount, hasSpirit) => {
    const vars = { '--n': editN }
    return {
      dataset: {},
      style: {
        getPropertyValue: (k) => vars[k] || '',
        setProperty: (k, v) => { vars[k] = String(v) },
      },
      querySelectorAll: (sel) => sel === '.cells > li:has(.item:not(.empty))' ? new Array(filledLiCount) : [],
      querySelector: (sel) => sel === '.pair > .spirits .item:not(.empty)' && hasSpirit ? {} : null,
      getN: () => vars['--n'],
    }
  }
  const makeRig = (isEx, editN, editC, hasGun, perkCount) => {
    const vars = { '--n': editN, '--c': editC }
    return {
      dataset: {},
      classList: { contains: (c) => c === 'ex-rig' && isEx },
      style: {
        getPropertyValue: (k) => vars[k] || '',
        setProperty: (k, v) => { vars[k] = String(v) },
      },
      querySelector: (sel) => {
        if (sel === '.item:not(.empty)') return hasGun ? {} : null
        if (sel === '.ex-perks .item:not(.empty)') return perkCount > 0 ? {} : null
        return null
      },
      querySelectorAll: (sel) => sel === '.item.perk-cell:not(.empty)' ? new Array(perkCount) : [],
      getVars: () => ({ n: vars['--n'], c: vars['--c'] }),
    }
  }
  const artSlot = makeSlot('7', 2, false)
  const leadSlot = makeSlot('3', 1, true)
  const exRig = makeRig(true, '25', '2', true, 0)
  const legRig = makeRig(false, '35', '3', true, 2)
  const fakeRoot = {
    querySelectorAll: (sel) => {
      if (sel === PREVIEW_SLOT_SEL) return [artSlot, leadSlot]
      if (sel === '.rig') return [exRig, legRig]
      return []
    },
  }
  syncPreviewRoot(fakeRoot, true)
  assert.equal(artSlot.getN(), '2', '预览态将神器槽 --n 收紧为已填模组数')
  assert.equal(leadSlot.getN(), '2', '预览态异域职业物品含之灵时占 2 列')
  assert.deepEqual(exRig.getVars(), { n: '15', c: '1' }, '预览态无词条异域武器收紧为 15/1')
  assert.deepEqual(legRig.getVars(), { n: '35', c: '3' }, '预览态双词条传说武器保持 35/3')
  syncPreviewRoot(fakeRoot, false)
  assert.equal(artSlot.getN(), '7', '退出预览态恢复编辑态 --n')
  assert.equal(leadSlot.getN(), '3', '退出预览态恢复主角行编辑态 --n')
  assert.deepEqual(exRig.getVars(), { n: '25', c: '2' }, '退出预览态恢复武器编辑态 --n/--c')
  assert.deepEqual(legRig.getVars(), { n: '35', c: '3' }, '退出预览态恢复传说武器编辑态 --n/--c')

  const pyBox = { window: {} }
  pyBox.window = pyBox
  vm.runInNewContext(fs.readFileSync(path.join(site, 'assets/pinyin.js'), 'utf8'), pyBox)
  assert.ok(pyBox.starsidePy.hit('加拉尔号角', ['jlehj']), '拼音首字母应当命中加拉尔号角')
  assert.ok(pyBox.starsidePy.hit('加拉尔号角', ['gjallarhorn']), '英文名应当命中加拉尔号角')
})


// builds() 把 docs 与 subs 两张表并成审核台那张清单。两条规矩都出过错，且都是
// 「看着有一行、内容却不对」那一类，页面上隔着一层 iframe 用肉眼查不出来。
test('a build that is live reads its body from the library, not the frozen submission', () => {
  const { api } = adminApi()
  // subs.md 是投稿当时冻住的那一份；bsave 改的是 docs.md，从不回写投稿记录。
  // 只认 subs.md 的话，线上改完再看还是改之前那一套，而下一次保存会拿这份陈稿
  // 原样盖回去——一次编辑就这么没了。
  const rows = api.builds(
    [{ _id: 'builds/s29-x/a-hunter', md: '# 新名字\n', hash: 'h2', landed: 'h1', at: '2', by: '我' }],
    [{ _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 投稿时的旧名字\n', at: '1' }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].md, '# 新名字\n')
  assert.equal(rows[0].state, 'live')
  assert.ok(rows[0].dirty, 'hash 与 landed 不等就该标成改过')
})

test('a pending or approved removal leaves one row, a rejected one gives the build back', () => {
  const { api } = adminApi()
  const docs = [{ _id: 'builds/s29-x/a-hunter', md: '# 甲\n', hash: 'h', landed: 'h', at: '1' }]
  const one = { _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '1' }

  // 批准之后决定已经做完，「完成」里再并排摆一行没有标记的，读起来就是「它好好
  // 地在站上」——而它正等着本机 sync 把源稿删掉。
  const done = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  // **Array.from，不是 .map。**行是 vm 沙箱里造的，它的原型是那个 realm 的
  // Array.prototype，deepStrictEqual 连原型一起比，内容一样也过不去。
  assert.deepEqual(Array.from(done, (b) => b.state), ['dropping'])

  // 申请了移除，那一套就不该还躺在「完成」里；申请期间有人重投的新稿照旧进待审。
  const asking = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: 0, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' },
      { _id: 's3', ok: 0, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '3' }])
  assert.deepEqual(Array.from(asking, (b) => b.sub._id).sort(), ['s2', 's3'])
  assert.deepEqual(Array.from(asking, (b) => b.state), ['wait', 'wait'])

  const kept = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: -1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  assert.deepEqual(Array.from(kept, (b) => b.state).sort(), ['live', 'no'])
})

// 更新那一路通过时沿用旧的 season/slug，首投与更新是两条 ok=1 的投稿指着同一篇。
test('a build updated after going live lists once, under its latest approval', () => {
  const { api } = adminApi()
  const docs = [{ _id: 'builds/s29-x/a-hunter', md: '# 甲\n', hash: 'h', landed: 'h', at: '5' }]
  const rows = api.builds(docs, [
    { _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '1', okBy: '首审' },
    { _id: 's2', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '3', okBy: '再审' },
    { _id: 's3', ok: -1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  const live = Array.from(rows).filter((b) => b.state === 'live')
  assert.deepEqual(live.map((b) => b.sub._id), ['s2'])
  assert.equal(live[0].at, '5', '时间仍取两边较新的那个')
  assert.deepEqual(Array.from(rows, (b) => b.state).sort(), ['live', 'no'])
})

// 编辑台只在登录真的失效时清令牌。refresh() 报 forbidden 就是那个判据：报多了，一次断网
// 或两个标签页同时刷新都会把人踢回登录框；报少了，失效的令牌留着，每一下都白点。
test('only a refresh the auth service rejects counts as a lost login', async () => {
  /** @type {Record<string, string>} */
  const store = {}
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] }
  }
  let reply = null
  let sent = 0
  const fetch = () => { sent += 1; return reply() }
  const answer = (status, body) => () =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  const { api } = adminApi({ fetch, localStorage })

  store.sa_rt = 'rt1'
  reply = answer(200, { access_token: 'at2', refresh_token: 'rt2' })
  await Promise.all([api.refresh(), api.refresh(), api.refresh()])
  assert.equal(sent, 1, '同一页并发的三发只该换一次')
  assert.equal(store.sa_at, 'at2')
  assert.equal(store.sa_rt, 'rt2')

  reply = answer(400, { error: 'invalid_grant' })
  await assert.rejects(api.refresh(), (e) => e.message === 'forbidden')

  reply = () => Promise.reject(new TypeError('Failed to fetch'))
  await assert.rejects(api.refresh(), (e) => e.message === 'Failed to fetch', '断网不算登录失效')

  // 另一个标签页先换掉了 sa_rt：这一发被拒，但令牌已经是新的。
  reply = () => { store.sa_rt = 'rt3'; store.sa_at = 'at3'; return answer(400, { error: 'invalid_grant' })() }
  await api.refresh()
  assert.equal(store.sa_at, 'at3')

  delete store.sa_rt
  await assert.rejects(api.refresh(), (e) => e.message === 'forbidden', '没有 refresh_token 就是没登录')
})

test('console timestamps read in Beijing time', () => {
  const { api } = adminApi()
  assert.equal(api.when('2026-09-10T07:59:28.522Z'), '2026-09-10 15:59')
  assert.equal(api.when('2026-09-10T16:30:00.000Z'), '2026-09-11 00:30', '过北京零点要进到次日')
  assert.equal(api.when(''), '')
})



test('build editing warns before discarding changes made during save', async () => {
  let current = '甲'
  let submitted
  let complete
  let warnings = 0
  const pending = new Promise((resolve) => { complete = resolve })
  function element(tag, cls, text) {
    return {
      tag, cls, textContent: text, children: [],
      appendChild(child) { this.children.push(child) },
      remove() {},
      querySelector() { return this.children.find((child) => child.tag === 'iframe') },
      setAttribute() {},
      removeAttribute() {}
    }
  }
  const ctx = {
    el: element,
    document: { querySelector: () => ({ textContent: '配装' }), body: { appendChild() {} } },
    window: {
      confirm() { warnings++; return false },
      starsideShared: { slotOf: () => 'single', formSrc: () => 'form', readForm: () => current }
    },
    S: { me: { lv: 2 }, buildBase: '甲' },
    DOC: 'builds/example',
    HERE: '/',
    call(action, body) { submitted = body.md; return pending }
  }
  vm.createContext(ctx)
  vm.runInContext('var pane = null;\n'
    + ['buildRead', 'buildShut', 'buildPane'].map((n) => funcSource('admin/edit.js', n)).join('\n'), ctx)
  ctx.buildPane(element('button'), '甲')
  const bar = ctx.pane.children[0]
  bar.children[1].onclick()
  current = '乙'
  complete()
  await pending
  await Promise.resolve()
  bar.children[2].onclick()
  assert.equal(submitted, '甲')
  assert.equal(warnings, 1, 'editing during save must not be silently discarded')
  assert.ok(ctx.pane, 'canceling the warning keeps the editor open')
})
