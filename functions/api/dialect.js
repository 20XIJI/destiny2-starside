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

  // **只有 `{token|` 才开一层**，不是见 `{` 就开。裸的花括号在正文里是普通字符，
  // 按它开层会把后面的竖线整段并掉。
  var OPEN = /\{[\w-]+\|/y

  // 格内换行标记。行标题那一段只算到它为止，见 titleEnd()。
  var BREAK = '\\\\'

  /* 表格行按 | 切出每一格「去掉首尾空格之后」的区间；不是表格行返回 null。

     返回区间而不是字符串：写回时才能只换那一格、把两侧的空格原样留着——整行
     重拼会让改一个字的提交在 git diff 上标红一整行。

     行首不许有空白（`line[0] !== '|'` 直接返回 null，不先 trim）：区间是给编辑台
     往原始行里写回用的，trim 过的偏移对不上原文。源稿里没有这种行，由
     check_quality.py 的 CellSplitting 钉着。 */
  function cellSpans (line) {
    if (line[0] !== '|') return null
    var out = []
    var depth = 0
    var from = 1
    var i = 1
    while (i <= line.length) {
      if (line[i] === '{') {
        OPEN.lastIndex = i
        if (OPEN.exec(line)) { depth++; i = OPEN.lastIndex; continue }
      }
      var ch = i < line.length ? line[i] : null
      // **深度钳在 0**：孤立的 `}` 不许把深度压成负数，否则后面的竖线全被并掉。
      if (ch === '}' && depth) depth--
      if (i === line.length || (ch === '|' && depth === 0)) {
        var a = from
        var b = i
        // 只剥半角空格。全角空格与制表符贴着格边是源稿的毛病，交给闸门报，
        // 不在这里悄悄吃掉——吃掉了两侧就再也看不出那一行写错了。
        while (a < b && line[a] === ' ') a++
        while (b > a && line[b - 1] === ' ') b--
        out.push([a, b])
        from = i + 1
        if (ch !== '|') break
      }
      i++
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

  return { cellSpans: cellSpans, cells: cells, titleEnd: titleEnd, rowOf: rowOf }
})
