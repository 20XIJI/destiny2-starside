// 源稿方言的切格，JS 这一侧的唯一定义。
//
// 从前这一条规则在 JS 里有三份（云函数的 cellSpans、edit.js 的 cellSpans、
// admin.js 的 cells 与 titleEnd），加上 Python 的 markup.cells 与 items 那一份，
// 一共六份，且**并不等价**：行首空白、缺末尾竖线、全角空格贴格边、`}` 深度可否
// 为负、`{` 的判据，五处各有分歧。当时它们在语料上碰巧一致，靠的是源稿恰好规整；
// 踩线的那一行本地照常渲染、三道闸门全绿，只有编辑台静默定位不到——那一格永远
// 改不了，报的还是「底稿已变，请回资料页重新提交」，而资料页永远是最新的。
//
// 现在只剩两份：这一份与 Python 的 markup.cells()。两种语言无法共用源码，那条缝
// 由 check_quality.py 的 CellSplitting 拿 4500+ 行真表格钉住。
//
// **functions/api/dialect.js 是构建复制过去的，不手改**：云函数只能 require 自己
// 目录下的东西，而 tcb 只上传 functions/api/。两份逐字相同由 npm test 钉住。
//
// 五处分歧各选了一种，判据写在下面。选定的这一种与旧的 split_cells 在全部 4563
// 行语料上结果逐字相同，换过来不改任何产出。
;(function (factory) {
  var api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.starsideDialect = api
})(function () {
  'use strict'

  // 格内换行标记。行标题那一段只算到它为止，见 titleEnd()。
  var BREAK = '\\\\'

  /* 着色标记的判读，JS 这一侧的唯一一份，与 markup.py 同一条：

     - **只有 `{token|` 才开一层**，不是见 `{` 就开。按裸 `{` 开层会把后面的竖线
       整段并掉。
     - `}` 在层内闭合一层；在层外是孤立的，**深度钳在 0**，不许压成负数，否则后面
       的竖线全被并掉。
     - 深度 0 上的 `|` 是分隔符，层内的属于标记（`{el-arc|电弧}` 里那个）。

     返回按位置排的 `{at, end, kind, token}`，kind 是 open / close / stray（孤立的
     `}`）/ bare（裸 `{`）/ pipe（深度 0 上的竖线）。切格、着色、配对与「能不能进
     一格」都从这一份结果算，谁也不自己数花括号。 */
  var MARK = /\{([\w-]+)\||[{}|]/g
  function scan (text) {
    var out = []
    var depth = 0
    var m
    MARK.lastIndex = 0
    while ((m = MARK.exec(text))) {
      var kind
      if (m[1] !== undefined) { kind = 'open'; depth++ } else if (m[0] === '{') {
        kind = 'bare'
      } else if (m[0] === '}') {
        if (depth) { kind = 'close'; depth-- } else kind = 'stray'
      } else if (depth) {
        continue
      } else {
        kind = 'pipe'
      }
      out.push({ at: m.index, end: MARK.lastIndex, kind: kind, token: m[1] })
    }
    return out
  }

  /* 表格行按 | 切出每一格「去掉首尾空格之后」的区间；不是表格行返回 null。

     返回区间而不是字符串：写回时才能只换那一格、把两侧的空格原样留着——整行
     重拼会让改一个字的提交在 git diff 上标红一整行。

     行首不许有空白（`line[0] !== '|'` 直接返回 null，不先 trim）：区间是给编辑台
     往原始行里写回用的，trim 过的偏移对不上原文。源稿里没有这种行，由
     check_quality.py 的 CellSplitting 钉着。 */
  function cellSpans (line) {
    if (line[0] !== '|') return null
    var cuts = []
    scan(line).forEach(function (k) { if (k.kind === 'pipe') cuts.push(k.at) })
    cuts.push(line.length)
    var out = []
    for (var k = 0; k + 1 < cuts.length; k++) {
      var a = cuts[k] + 1
      var b = cuts[k + 1]
      // 只剥半角空格。全角空格与制表符贴着格边是源稿的毛病，交给闸门报，
      // 不在这里悄悄吃掉——吃掉了两侧就再也看不出那一行写错了。
      while (a < b && line[a] === ' ') a++
      while (b > a && line[b - 1] === ' ') b--
      out.push([a, b])
    }
    // 首尾各去一个 |。末尾那个竖线之后必然还剩一个空区间，砍掉它。
    return out.length > 1 ? out.slice(0, -1) : out
  }

  // 这一行有几格。不是表格行就是 0。
  function cells (line) {
    var sp = cellSpans(line)
    return sp ? sp.length : 0
  }

  /* 表格行首格里「行的身份」那一段的结束位置；不是表格行就是 0。

     行标题已经有结构身份（<th scope="row">），不必再着色。两条例外：
     首格留空即向上合并，这一行的身份在第二格；只算到格内换行 `\\` 为止，
     切枪 DPS 页的首格写成「**隐秘追猎**\\凯德的复仇、星界夜鹰」，`\\` 之后
     列的是配装件，那是内容不是身份，照常参与着色。 */
  function titleEnd (line) {
    var sp = cellSpans(line)
    if (!sp || !sp.length) return 0
    var at = 0
    if (line.slice(sp[0][0], sp[0][1]).trim() === '') {
      if (sp.length < 2) return 0
      at = 1
    }
    // 算到分隔符本身，不是格内容的末尾：区间是 trim 过的，两者之间还隔着空格。
    var end = line.indexOf('|', sp[at][1]) + 1
    var brk = line.indexOf(BREAK, sp[at][0])
    return brk >= 0 && brk < end ? brk : end
  }

  /* 表格里第 i 行的上下文：表头各格、这一行各格，以及这一行叫什么。第 i 行不是
     表格的数据行（表头、分隔行、表格外）返回 null。

     「叫什么」按源稿的合并写法取：整张表有首格留空的行，身份就是向上合并到的
     那个首格加这一行的第二格（副本 + 首领）；没有的话身份就是首格。审核台拿它把
     「第 18 行第 3 格」写成「最后一愿 千语魅痕 · 生命值」。 */
  var RULE = /^\|[-:| ]*-[-:| ]*\|$/
  function rowOf (lines, i) {
    var own = cellSpans(lines[i] || '')
    if (!own || RULE.test(lines[i].trim())) return null
    var first = function (k) {
      var sp = cellSpans(lines[k])
      return sp && sp.length ? lines[k].slice(sp[0][0], sp[0][1]) : ''
    }
    var h = i
    while (h > 0 && lines[h].charAt(0) === '|' && !RULE.test(lines[h].trim())) h--
    if (h < 1 || !RULE.test(lines[h].trim())) return null
    var head = cellSpans(lines[h - 1])
    if (!head) return null
    var end = h + 1
    while (end < lines.length && lines[end].charAt(0) === '|') end++
    var merged = false
    for (var k = h + 1; k < end && !merged; k++) merged = !first(k).trim()
    var up = i
    while (up > h + 1 && !first(up).trim()) up--
    var id = [first(up)]
    if (merged && own.length > 1) id.push(lines[i].slice(own[1][0], own[1][1]))
    var text = function (line) { return function (sp) { return line.slice(sp[0], sp[1]) } }
    return { head: head.map(text(lines[h - 1])), cells: own.map(text(lines[i])), id: id }
  }

  // ── 着色 ──────────────────────────────────────────────────────────

  function esc (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;') }

  // 源稿一段 → 着色后的 HTML，与 markup.inline() 同一条规则，支持嵌套。
  // 没闭合的层在末尾补上 </span>，预览照样画得出来；报错归 unclosed()。
  function paint (text) {
    var out = ''
    var at = 0
    var depth = 0
    scan(text).forEach(function (k) {
      if (k.kind !== 'open' && k.kind !== 'close') return
      out += esc(text.slice(at, k.at)) + (k.kind === 'open' ? '<span class="' + k.token + '">' : '</span>')
      depth += k.kind === 'open' ? 1 : -1
      at = k.end
    })
    out += esc(text.slice(at))
    while (depth-- > 0) out += '</span>'
    return out
  }

  // 每个闭合了的标记覆盖的区间 [开括号位置, 闭括号位置]，用来判断某处是不是已经着过色。
  function marked (text) {
    var span = []
    var stack = []
    scan(text).forEach(function (k) {
      if (k.kind === 'open') stack.push(k.at)
      else if (k.kind === 'close') span.push([stack.pop(), k.at])
    })
    return span
  }

  // 整段恰好被一个 {token|…} 包住时返回内容，否则 null。判据是首个标记的闭括号
  // 落在末尾——中途闭合说明段里还有别的东西（`{a|白弹} → {b|绿弹}` 是两个标记）。
  // 与 markup.whole_marker() 同一条：那一层 class 落在块上，不套 span。
  function whole (text) {
    var ks = scan(text).filter(function (k) { return k.kind === 'open' || k.kind === 'close' })
    if (!ks.length || ks[0].kind !== 'open' || ks[0].at !== 0) return null
    var depth = 0
    for (var i = 0; i < ks.length; i++) {
      depth += ks[i].kind === 'open' ? 1 : -1
      if (!depth) return ks[i].at === text.length - 1 ? text.slice(ks[0].end, ks[i].at) : null
    }
    return null
  }

  // 还没闭合的标记有几层。markup.inline() 遇到它当场中止整次构建。
  function unclosed (text) {
    var depth = 0
    scan(text).forEach(function (k) {
      if (k.kind === 'open') depth++
      else if (k.kind === 'close') depth--
    })
    return depth
  }

  // ── 能不能写进去 ──────────────────────────────────────────────────

  /* 一段新文字能不能原样写进源稿；能就回空串，不能回拒收的理由。云函数在收改动
     （chg）与通过改动（emark）时各查一遍。

     这两个字符写坏了，convert-doc.py 的闸门当场中止，卡住的是整次 npm run build，
     而编辑这一侧一点异样都看不到；它们又没有等价写法可以替他改（换成全角是静默改
     内容），所以在提交时就拒收，并说清是哪一个。

     - 花括号：只有成对的 {token|…} 是合法写法。裸 `{`、孤立的 `}`、没闭合的标记
       一律拒。源稿里一处都没有，构建也不认它们。
     - 竖线：只在改一格（inCell）时才算越界，整块替换写进去的是完整的一行，那一行
       里的竖线是结构。只有深度 0 上的才算分隔符，{el-arc|电弧} 里那个是标记的一部分。
       判据与 cellSpans() 同一份：`见 { 注 | 旁 }` 里那个竖线在深度 0 上，写进去
       那一行就多出一格。 */
  function cellSafe (text, inCell) {
    var ks = scan(String(text))
    var depth = 0
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i].kind
      if (k === 'bare' || k === 'stray') return '着色标记的花括号没配对'
      if (k === 'open') depth++
      else if (k === 'close') depth--
      else if (inCell) return '表格格里不能写竖线，它是分隔符；要写就用全角｜'
    }
    return depth ? '着色标记的花括号没配对' : ''
  }

  // 深度 0 上有没有竖线：有就是整行，没有就是一格里的文字。
  function barePipe (text) {
    return scan(String(text)).some(function (k) { return k.kind === 'pipe' })
  }

  return { scan: scan, cellSpans: cellSpans, cells: cells, titleEnd: titleEnd, rowOf: rowOf,
           paint: paint, marked: marked, whole: whole, unclosed: unclosed,
           cellSafe: cellSafe, barePipe: barePipe }
})
