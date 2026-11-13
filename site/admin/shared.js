// 编辑台与站内就地编辑共用的凭据、错误码、前端闸门与填表页桥接。
;(function () {
  'use strict'

  // **词表现读，不在模块顶层捕获。**捕获会逼着 terms.js 必须先于本文件执行，
  // 而它 104 KB、全仓只有 lint() 用得上；现读之后 edit.js 那条串行注入就拆得开，
  // 编辑态先起来、词表空闲时再补。
  var FALLBACK = { terms: [], tokens: {}, classes: [], pageClasses: {}, guard: [], items: [], keep: [], g6: [] }
  function terms () { return window.starsideTerms || FALLBACK }

  // ── 凭据 ───────────────────────────────────────────────────────────
  // access_token 2 小时、refresh_token 30 天，都存 localStorage。
  function tok (v) {
    if (v === undefined) return localStorage.getItem('sa_at') || ''
    if (v === null) {
      localStorage.removeItem('sa_at')
      localStorage.removeItem('sa_rt')
      return ''
    }
    localStorage.setItem('sa_at', v.access_token || '')
    if (v.refresh_token) localStorage.setItem('sa_rt', v.refresh_token)
    return ''
  }

  // 源稿方言（切格、行标题、着色标记）JS 这一侧只有 admin/dialect.js 一份定义。
  // 在函数体里现读 window.starsideDialect，不在模块顶层捕获：见 edit.js 里注入次序那一段。
  function D () { return window.starsideDialect }
  function B () { return window.starsideSource }

  function inside (span, a, b) {
    return span.some(function (s) { return a >= s[0] && b <= s[1] })
  }

  // ── 前端闸门 ───────────────────────────────────────────────────────
  // 这些是提示不是拦截：逐字保真与结构断言要 Python，留在本地 npm run build。
  // **六处跳过照 items.hits_in() 原样搬**：键行与标题行、表格里行标题那一格、
  // 链接目标、GUARD 里更长的专名、已经在某个标记里的、表头行。少一条就满屏误报。

  var KEY_LINE = /^[\u4e00-\u9fff]{1,6}(（[^）]*）)?：/
  var RULE_LINE = /^\|[-| ]+\|$/

  function ranges (text, res) {
    var out = []
    res.forEach(function (re) {
      var m
      re.lastIndex = 0
      while ((m = re.exec(text))) {
        out.push(m[1] === undefined ? [m.index, m.index + m[0].length]
                                    : [m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length])
        if (!m[0].length) re.lastIndex++
      }
    })
    return out
  }
  function within (rs, a, b) {
    return rs.some(function (r) { return a >= r[0] && b <= r[1] })
  }

  // 下面两份都随词表走，按词表对象缓存：terms.js 是编辑态起来之后空闲补上的，
  // 换了对象就重建。不缓存的话每次击键都要重来一遍。

  // G2 那几十个正则。
  var g2Src = null
  var g2Of = null
  function g2res (rows) {
    if (g2Src === rows) return g2Of
    var out = []
    rows.forEach(function (row) {
      if (!row[1]) return
      out.push([row, new RegExp('\\{([\\w-]+)\\|'
        + row[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g')])
    })
    g2Src = rows
    g2Of = out
    return out
  }

  // G6 正查的词表按首字分桶，一行只扫它真出现过的那几桶。全扫是每次击键
  // 1402 次子串搜索起步，中文输入法逐字上屏时每个候选字都要跑一轮。
  var bkSrc = null
  var bkOf = null
  function buckets (items) {
    if (bkSrc === items) return bkOf
    var b = {}
    items.forEach(function (row, i) {
      var c = row[0].charAt(0)
      if (!b[c]) b[c] = []
      b[c].push([i, row])
    })
    bkSrc = items
    bkOf = b
    return b
  }

  // errors 一直显示，warns 只在编辑那一块时显示——不然一屏全是「该着色」。
  function lint (text, at, g6, ok) {
    var T = terms()
    at = at || { cols: 0, head: false }
    ok = ok || T.classes
    var okSet = new Set(ok)
    var errs = []
    var warns = []
    var m

    var d = D().unclosed(text)
    if (d) errs.push('花括号没闭合，少 ' + d + ' 个右括号')

    // **着色 span 不得嵌套**，与 markup.no_nested_span 同一条。整块只有一个标记时
    // 那一层 class 落在块上、不出 span，所以先剥掉它再看里面。
    // `对{res|{orb|X}Y}` 就栽在这里：加一个字到标记外面，整块判定不再成立，
    // res 只能套一层 span，于是与里面的 orb 嵌套，构建当场中止。
    var inner = D().whole(text.trim())
    if (/<span[^>]*>[^<]*<span/.test(D().paint(inner === null ? text : inner))) {
      errs.push('着色标记套了两层。整格只有一个标记时那一层不出 span，'
        + '所以把外面的字挪进最外层标记里就好')
    }

    // G3：token 必须在 site.css 里有对应的类
    var t2 = /\{([\w-]+)\|/g
    while ((m = t2.exec(text))) {
      if (!okSet.has(m[1])) errs.push('token「' + m[1] + '」在这一页的样式表里没有定义')
    }

    // G1：整篇比一次。链接目标不是正文，KEEP 里那几条是官方专名，两者都放行。
    var keep = ranges(text, [/\]\(([^)]*)\)/g])
    T.keep.forEach(function (k) {
      var at = 0
      while ((at = text.indexOf(k, at)) >= 0) { keep.push([at, at + k.length]); at += k.length }
    })
    T.terms.forEach(function (row) {
      row[2].forEach(function (bad) {
        var at = 0
        while ((at = text.indexOf(bad, at)) >= 0) {
          if (!within(keep, at, at + bad.length)) {
            errs.push('用了「' + bad + '」，正名是「' + row[0] + '」')
            break
          }
          at += bad.length
        }
      })
    })

    // G2：只查「整个标记就是这个词」的那种。词嵌在更长的短语里时着色属于短语，
    // 按词强判会把整句的颜色拆碎。
    g2res(T.terms).forEach(function (e) {
      var row = e[0]
      var one = e[1]
      var k
      one.lastIndex = 0                      // 正则是缓存下来复用的，g 标志会记住上次位置
      while ((k = one.exec(text))) {
        if (k[1] !== row[1]) errs.push('「' + row[0] + '」该着 ' + row[1] + '，写成了 ' + k[1])
      }
    })

    var lines = text.split('\n')
    lines.forEach(function (line, n) {
      // 表头行不是正文，列名与标题同属「标签」，已有结构身份。
      var isHead = at.head || RULE_LINE.test((lines[n + 1] || '').trim())
      if (at.cols && line.charAt(0) === '|' && !RULE_LINE.test(line.trim()) && !/^\|\s*==/.test(line)) {
        var c = D().cells(line)
        if (c !== at.cols) errs.push('这一行 ' + c + ' 格，表头是 ' + at.cols + ' 格')
      }
      if (!g6 || isHead || !line || line.charAt(0) === '#' || KEY_LINE.test(line)) return
      var end = D().titleEnd(line)
      var taken = ranges(line, [/\]\([^)]*\)/g])
      T.guard.forEach(function (g) {
        var at = 0
        while ((at = line.indexOf(g, at)) >= 0) { taken.push([at, at + g.length]); at += g.length }
      })
      var span = D().marked(line)
      // **只认每个词在这一行的第一次出现**，与原先那句 indexOf 逐字等价：首次
      // 出现落在行标题里或已经着过色，这个词就整条跳过，不去看后面还有没有。
      var bk = buckets(T.items)
      var seen = {}
      var hit = []
      for (var i = 0; i < line.length; i++) {
        var bag = bk[line.charAt(i)]
        if (!bag) continue
        for (var j = 0; j < bag.length; j++) {
          var k = bag[j][0]
          if (seen[k] !== undefined || line.slice(i, i + bag[j][1][0].length) !== bag[j][1][0]) continue
          seen[k] = i
          hit.push(bag[j])
        }
      }
      hit.sort(function (a, b) { return a[0] - b[0] })   // 报错顺序仍按词表顺序
      hit.forEach(function (e) {
        var row = e[1]
        var at = seen[e[0]]
        if (at < end) return
        var to = at + row[0].length
        if (within(taken, at, to) || inside(span, at, to - 1)) return
        warns.push('「' + row[0] + '」该着 ' + row[1] + '（' + row[2] + '）')
      })
    })

    return { errs: errs, warns: warns }
  }

  /* 云函数回的是短码（forbidden、no doc、conflict…）。**这一张表必须覆盖 index.js
     里所有 err(...) 的字面串**，不然人看到的就是一句英文。每加一个 err('...') 就来补一行；
     至少 grep 得到。edit.js 那条编辑路也走这一张。 */
  var MSG = {
    forbidden: '登录已过期，正在返回登录页',
    'no permission': '权限不足：此操作需要审核员级别',
    'no sub': '该投稿已不存在，请刷新',
    'no doc': '库中没有这一篇，请刷新',
    'bad id': '编号不合法',
    'bad md': '正文不合法：需以「# 」开头，且不超过 256 KB',
    'bad sub type': '这是移除申请，不能按投稿处理',
    'bad season': '赛季格式不正确（应形如 s29-…）',
    'bad slug': '标识格式不正确（仅限小写字母、数字与连字符）',
    'already pending': '该条已在待审中',
    conflict: '该条刚被他人修改，请刷新后重新审核',
    // 批量那一路才抛得出的三条。写在同一张表里：认不认得出这个码，与这个码
    // 该翻成什么，两件事只该查一处。
    'bad jobs': '本批数据格式不正确',
    'batch too large': '待审过多，请逐处审核',
    'no edit': '该改动记录已不存在，请刷新',
    // 主键页上记录那一路。库里没有这条记录说明它还没同步进库。
    'no rec': '库中还没有这条记录，请稍后再改',
    'bad rec': '该格指向的记录不合法',
    'bad path': '该格指向的字段不合法',
    // docs 那一路翻页取配装正文时的防跑飞闸，不是业务上限。
    'too many builds': '库中配装数量异常，请联系超级管理员'
  }

  /* 令牌那一档不只是换句话：call() 已经拿 refresh 换过一张再打仍被拒，说明是
     真过期了，留在原地点什么都白点。清掉令牌、缓一下让人看清这句再退回登录页。 */
  function say (e) {
    var m = (e && e.message) || ''
    if (m === 'forbidden') {
      tok(null)
      setTimeout(function () { location.reload() }, 1500)
    }
    return MSG[m] || m || '未知错误'
  }

  // 一份正文该落在哪一页填表页上。**由正文现算，不另存一个字段**：合集标记只有
  // 填表页的 setHead() 发得出，读回来与灌进去永远同属一档，存第二份只会有漂的风险。
  function slotOf (md) { return B().isSet(md) ? 'set' : 'one' }

  // 地址只给尾巴，前缀由调用方拼：编辑台在 admin/ 下写 ../，配装页按 site.css
  // 那个 <link> 现算相对前缀。
  function formSrc (kind) {
    return kind === 'set' ? 'builds/new/set/index.html' : 'builds/new/index.html'
  }

  /* 填表页里现在是什么样。读不出来（脚本没载好、那一格还没建过）返回 null——
     **不返回空串**：空串与「读到一份空稿」分不开，而后者要当脏处理。 */
  function readForm (w) {
    try {
      var md = w.starsideForm.read()
      return /^#\s+\S/.test(md) ? md : null
    } catch (e) { return null }
  }

  // 灌一份进去，返回「没人动过」的基线。抛出去由调用方接：两边报错的落点不同。
  function mountForm (w, md, reviewer) {
    // 审核意见那一栏与只归审核员的那几个场景都在这里立起来：填表页默认收着
    // 它们，投稿的人因此看不到。带守卫——读者浏览器里缓存着的旧 form.js 没有这个方法。
    // **排在 load() 之前**：load 里的 pressTags() 只按得下没藏起来的按钮，
    // 反过来的话一份「场景：功能性」的稿子会被重算成没有场景。
    if (w.starsideForm.review) w.starsideForm.review(reviewer)
    w.starsideForm.load(md)
    // **把那一页自己的「投稿」摘掉**：它在审核页里按一下就是再投一份。
    var send = w.document.getElementById('send')
    if (send) send.remove()
    // 基线取 load() 归一化之后那一份，不取灌进去的：换轴之前那批写的是「类别」，
    // 读回来是「强度」，拿灌进去那份比会在没人动过的稿子上误报脏。
    return readForm(w)
  }

  var api = { tok: tok, MSG: MSG, say: say, lint: lint,
              slotOf: slotOf, formSrc: formSrc, readForm: readForm,
              mountForm: mountForm }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.starsideShared = api
})()
