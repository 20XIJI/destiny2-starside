// 在线编辑台。资料源稿在库里改、在库里审，落盘、构建与部署仍在本机（tools/sync.py）。
//
// 身份认证 v2 是裸 HTTP 接口，**不引 @cloudbase/js-sdk**：auth-only 入口 65 KB gzip，
// 比整站首屏（46 KB）还大，而这里要的只有 signin 与 refresh 两个 POST。
;(function () {
  'use strict'

  var API = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api'
  var AUTH = 'https://dea-mods-d1g0j2rile2323f73.api.tcloudbasegateway.com'
  // **词表现读，不在模块顶层捕获。**捕获会逼着 terms.js 必须先于本文件执行，
  // 而它 104 KB、全仓只有 lint() 用得上；现读之后 edit.js 那条串行注入就拆得开，
  // 编辑态先起来、词表空闲时再补。
  var FALLBACK = { terms: [], tokens: {}, classes: [], pageClasses: {}, guard: [], items: [], keep: [], g6: [] }
  function terms () { return window.starsideTerms || FALLBACK }

  var $ = function (id) { return document.getElementById(id) }
  var el = function (tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  var LV = { 1: '编辑', 2: '审核员', 3: '管理员', 4: '超管', 5: '本机' }
  var S = { me: null, docs: [], edits: [], subs: [] }

  // ── 凭据 ───────────────────────────────────────────────────────────
  // access_token 2 小时、refresh_token 30 天，都存 localStorage。401 拿 refresh
  // 换一次，再 401 才落回登录框。
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

  function auth (path, body) {
    return fetch(AUTH + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.error || ('HTTP ' + r.status))
        return j
      })
    })
  }

  function refresh () {
    var rt = localStorage.getItem('sa_rt')
    if (!rt) return Promise.reject(new Error('没有 refresh_token'))
    return auth('/auth/v1/token', { grant_type: 'refresh_token', refresh_token: rt })
      .then(function (j) { tok(j); return j })
  }

  // 每个管理动作带 Bearer。重试只放一次：刷新之后仍被拒就是真的过期了。
  function call (a, body, retry) {
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() },
      body: JSON.stringify(Object.assign({ a: a }, body || {}))
    }).then(function (r) { return r.json() }).then(function (j) {
      // 只有令牌那一类才值得换一张再打。权限不足回的是另一个词——两件事共用
      // 一个词时，lv 不够的人点一下要白跑三趟，报出来的话还看不出是权限问题。
      if (j && j.error === 'forbidden' && !retry) {
        return refresh().then(function () { return call(a, body, 1) })
      }
      if (j && j.error) throw new Error(j.error)
      return j
    })
  }

  // 位置 i 上是不是一个 {token| 开头；是就返回那次匹配，不是返回 null。
  // **先看一眼首字符再切片**：在 while 里无条件 s.slice(i) 等于每前进一个字符
  // 复制一遍剩余全串，5 KB 的块单次扫描就是一千多万次字符拷贝。
  var OPEN = /^\{([\w-]+)\|/
  function openAt (s, i) {
    return s.charAt(i) === '{' ? OPEN.exec(s.slice(i)) : null
  }

  // 与 markup.inline() 同一条规则：一趟栈式扫描，支持嵌套。正则做不干净。
  function paint (t) {
    var out = ''
    var d = 0
    var i = 0
    while (i < t.length) {
      var m = openAt(t, i)
      if (m) { out += '<span class="' + m[1] + '">'; d++; i += m[0].length; continue }
      var c = t.charAt(i++)
      if (c === '}' && d) { out += '</span>'; d--; continue }
      out += c === '<' ? '&lt;' : c === '&' ? '&amp;' : c
    }
    while (d-- > 0) out += '</span>'
    return out
  }

  // 文本里每个着色标记覆盖的区间，用来判断某处是不是已经着过色了。
  function marked (t) {
    var span = []
    var stack = []
    var i = 0
    while (i < t.length) {
      var m = openAt(t, i)
      if (m) { stack.push(i); i += m[0].length; continue }
      if (t.charAt(i) === '}' && stack.length) span.push([stack.pop(), i])
      i++
    }
    return span
  }

  function inside (span, a, b) {
    return span.some(function (s) { return a >= s[0] && b <= s[1] })
  }

  // 按竖线切格，但记花括号深度——{ico|…} 内部也有竖线，裸切会让带图标的行错位一格。
  function cells (line) {
    var n = 0
    var d = 0
    for (var i = 0; i < line.length; i++) {
      var m = openAt(line, i)
      if (m) { d++; i += m[0].length - 1; continue }
      var c = line.charAt(i)
      if (c === '}' && d) d--
      else if (c === '|' && !d) n++
    }
    return n - 1
  }

  // ── 前端闸门 ───────────────────────────────────────────────────────
  // 这些是提示不是拦截：逐字保真与结构断言要 Python，留在本地 npm run build。
  // **六处跳过照 items.hits_in() 原样搬**：键行与标题行、表格里行标题那一格、
  // 链接目标、GUARD 里更长的专名、已经在某个标记里的、表头行。少一条就满屏误报。

  var KEY_LINE = /^[\u4e00-\u9fff]{1,6}(（[^）]*）)?：/
  var RULE_LINE = /^\|[-| ]+\|$/

  // 表格行首格里「行的身份」那一段的结束位置；不是表格行就是 0。
  function titleEnd (line) {
    if (line.charAt(0) !== '|') return 0
    var n = line.indexOf('|', 1)
    if (n < 0) return 0
    if (!line.slice(1, n).trim()) {          // 首格留空即向上合并，身份在第二格
      n = line.indexOf('|', n + 1)
      if (n < 0) return 0
    }
    var brk = line.indexOf('\\\\', 1)
    return brk > 0 && brk < n ? brk : n + 1
  }

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

  // 整块恰好被一个 {token|…} 包住时返回内容，否则 null。判据是首个标记的闭括号
  // 落在末尾——中途闭合说明块里还有别的东西（`{a|白弹} → {b|绿弹}` 是两个标记）。
  // 与 markup.whole_marker() 同一条：那一层 class 落在块上，不套 span。
  function whole (t) {
    var m = /^\{[\w-]+\|/.exec(t)
    if (!m) return null
    var depth = 1
    var i = m[0].length
    while (i < t.length) {
      var o = openAt(t, i)
      if (o) { depth++; i += o[0].length; continue }
      if (t.charAt(i) === '}') {
        depth--
        if (!depth) return i === t.length - 1 ? t.slice(m[0].length, i) : null
      }
      i++
    }
    return null
  }

  // 下面三份都随词表走，按词表对象缓存：terms.js 是编辑态起来之后空闲补上的，
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

    var d = 0
    var re = /\{[\w-]+\||\}/g
    while ((m = re.exec(text))) d = m[0] === '}' ? Math.max(0, d - 1) : d + 1
    if (d) errs.push('花括号没闭合，少 ' + d + ' 个右括号')

    // **着色 span 不得嵌套**，与 markup.no_nested_span 同一条。整块只有一个标记时
    // 那一层 class 落在块上、不出 span，所以先剥掉它再看里面。
    // `对{res|{orb|X}Y}` 就栽在这里：加一个字到标记外面，整块判定不再成立，
    // res 只能套一层 span，于是与里面的 orb 嵌套，构建当场中止。
    var inner = whole(text.trim())
    if (/<span[^>]*>[^<]*<span/.test(paint(inner === null ? text : inner))) {
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
        var c = cells(line)
        if (c !== at.cols) errs.push('这一行 ' + c + ' 格，表头是 ' + at.cols + ' 格')
      }
      if (!g6 || isHead || !line || line.charAt(0) === '#' || KEY_LINE.test(line)) return
      var end = titleEnd(line)
      var taken = ranges(line, [/\]\([^)]*\)/g])
      T.guard.forEach(function (g) {
        var at = 0
        while ((at = line.indexOf(g, at)) >= 0) { taken.push([at, at + g.length]); at += g.length }
      })
      var span = marked(line)
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

  // ── 视图外壳 ───────────────────────────────────────────────────────
  function title (t) { $('h1').textContent = t }

  function show (node) {
    var view = $('views')
    view.textContent = ''
    view.appendChild(node)
    // 换一屏就把配装详情那一格收起来。**只收 DOM、不动 openBuild**：buildsView
    // 自己也走这条路，清掉状态它就再也画不开那一格了。
    hideStage()
  }

  function hideStage () {
    $('stage').hidden = true
    $('stage-head').textContent = ''
    $('stage-foot').textContent = ''
  }
  // ── 浏览器的返回 ───────────────────────────────────────────────────
  // 编辑台整站一页，不压历史的话按一下返回就离开了整个编辑台——而人在配装详情里
  // 按返回，想去的是那张列表。每换一屏压一格，state 里写清那一格该画什么。
  var VIEWS = { review: reviewView, builds: buildsView, hist: histView, eds: edsView }

  function dive (state) {
    history.pushState(state, '')
  }

  // 详情里做完动作回列表。**走 history.back()，不直接画列表**——直接画会把详情
  // 那一格留在历史里，人再按一次返回又弹回那条已经处理完的记录。
  function toList () {
    if (history.state && history.state.b) history.back()
    else buildsView()
  }

  function draw (state) {
    var v = (state && state.v) || 'review'
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (n) {
      if (n.dataset.view === v) n.setAttribute('aria-current', 'true')
      else n.removeAttribute('aria-current')
    })
    // 详情摊开的是哪一套由历史那一格说了算：buildsView 画完列表会照它把详情
    // 摊在下面。从 popstate 回来时因此不必再压一格。
    openBuild = (state && state.b) || null
    ;(VIEWS[v] || reviewView)()
  }

  window.addEventListener('popstate', function (ev) {
    if (S.me && S.me.lv) draw(ev.state)
  })

  // 界面上那个「← 配装」与浏览器的返回走同一条，不然按钮退回去了、历史里还多一格。
  function back (label) {
    var b = el('button', 'chip', '← ' + label)
    b.type = 'button'
    b.onclick = function () { history.back() }
    return b
  }
  function tip (node, msg, bad) {
    var p = node.querySelector('.tip')
    if (!p) { p = el('p', 'tip'); node.appendChild(p) }
    p.textContent = msg
    p.style.color = bad ? 'var(--c-enemy)' : ''
  }

  // ── 资料页树 ───────────────────────────────────────────────────────
  // 树由 admin/pages.js 给，那份从首页的六个分组、源稿的「路径：」与「卡片：」
  // 三处现成数据拼出来。读者看到的是一个个资料页，不是 docs/boss-hp 这样的路径，
  // 所以列表上一律写标题与分组。
  var PAGES = window.starsidePages || []
  var BY_ID = {}
  PAGES.forEach(function (r) {
    BY_ID[r[0]] = { id: r[0], title: r[1], url: r[2], group: r[3], up: r[4], at: r[5] }
  })

  function pageOf (id) {
    return BY_ID[id] || { id: id, title: id, url: '', group: '其他', up: '', at: '' }
  }

  // 「档案 › 首领生命值」。父页有的话夹在中间。
  function trail (id) {
    var p = pageOf(id)
    return [p.group].concat(p.up ? [pageOf(p.up).title] : []).concat([p.title]).join(' › ')
  }

  // 左栏：**只列有东西的那些分支**。count 给出每一页有几条，为 0 的页面连同
  // 空掉的父页与分组一起不出现——一屏全是零会把真有待审的那几页淹掉。
  function tree (count, on, pick) {
    var box = el('nav', 'tree')
    var live = {}
    PAGES.forEach(function (r) {
      if (!count[r[0]]) return
      live[r[0]] = 1
      if (r[4]) live[r[4]] = 1                 // 父页跟着立起来，好挂子页
    })
    var groups = []
    PAGES.forEach(function (r) {
      if (live[r[0]] && groups.indexOf(r[3]) < 0) groups.push(r[3])
    })
    if (!groups.length) {
      box.appendChild(el('p', 'lede', '没有待处理'))
      return box
    }
    groups.forEach(function (g) {
      box.appendChild(el('div', 'tree-group', g))
      PAGES.filter(function (r) { return r[3] === g && !r[4] && live[r[0]] })
        .forEach(function (r) {
          box.appendChild(row(r, 0))
          PAGES.filter(function (k) { return k[4] === r[0] && live[k[0]] })
            .forEach(function (k) { box.appendChild(row(k, 1)) })
        })
    })
    return box

    function row (r, depth) {
      var b = el('button', 'tree-row' + (depth ? ' sub' : '') + (on === r[0] ? ' on' : ''))
      b.type = 'button'
      b.appendChild(el('span', 'id', r[1]))
      if (count[r[0]]) b.appendChild(el('span', 'n', String(count[r[0]])))
      b.onclick = function () { pick(r[0]) }
      return b
    }
  }

  // 一栏树 + 一栏正文。两个标签共用这一套版面。
  function split (side, body) {
    var wrap = el('section', 'block desk')
    wrap.appendChild(side)
    var main = el('div', 'desk-main')
    main.appendChild(body)
    wrap.appendChild(main)
    return wrap
  }

  // ── 对照 ───────────────────────────────────────────────────────────
  // 一处改动的对照：就两条，不必走 LCS。旧值划掉压暗、新值照常着色——
  // 与页面上那个遮罩同一套读法。
  function oneView (e) {
    var box = el('div', 'diff')
    var del = el('div', 'del')
    del.innerHTML = paint(e.before || '')
    var add = el('div', 'add')
    add.innerHTML = paint(e.after || '')
    box.appendChild(del)
    box.appendChild(add)
    return box
  }

  function spot (e) {
    return '第 ' + (Number(e.blk) + 1) + ' 行'
      + (Number(e.cell) < 0 ? '' : '第 ' + (Number(e.cell) + 1) + ' 格')
  }

  function when (t) { return (t || '').slice(0, 16).replace('T', ' ') }

  // ── 文档审核 ───────────────────────────────────────────────────────
  var openDoc = null                 // 右栏正在看哪一页

  function reviewView () {
    title('审核')
    var count = {}
    S.edits.filter(function (e) { return e.ok === 0 }).forEach(function (e) {
      count[e.doc] = (count[e.doc] || 0) + 1
    })
    if (openDoc && !count[openDoc]) openDoc = null
    if (!openDoc) openDoc = Object.keys(count).sort()[0] || null
    var body = el('div')
    show(split(tree(count, openDoc, function (id) { openDoc = id; reviewView() }), body))
    if (!openDoc) {
      body.appendChild(el('p', 'lede', '没有待审'))
      return
    }
    body.appendChild(el('p', 'crumb', trail(openDoc)))
    var go = el('a', 'chip', '查看')
    go.href = '../' + pageOf(openDoc).url
    body.appendChild(go)
    body.appendChild(el('p', 'lede', '载入中…'))
    // judge 让后端顺带判一次每条还定不定位得到（乙类冲突），那个判断只有 locate
    // 做得准，前端不再抄一份切格与匹配。
    call('pend', { doc: openDoc, judge: 1 }).then(function (r) {
      if (openDoc) drawPend(body, r.pend.map(function (e) { e.ok = Number(e.ok); return e }))
    }, function (err) { tip(body, err.message, 1) })
  }

  function drawPend (body, pend) {
    body.querySelectorAll('.lede, .pane, .acts, .tip').forEach(function (n) { n.remove() })
    // 同一处的几份收成一组：**它们互斥**，通过一份就得在其余里择一驳回。
    var groups = []
    var at = {}
    pend.forEach(function (e) {
      var k = e.blk + ':' + e.cell
      if (!at[k]) { at[k] = { key: k, list: [] }; groups.push(at[k]) }
      at[k].list.push(e)
    })
    groups.sort(function (a, b) { return a.list[0].blk - b.list[0].blk })
    var bad = groups.filter(function (g) {
      return g.list.length > 1 || g.list.some(function (e) { return e.stale })
    })

    var acts = el('div', 'acts')
    var all = el('button', 'chip go', '全部通过（' + pend.length + '）')
    all.type = 'button'
    all.disabled = !!bad.length
    all.onclick = function () { passAll(body, pend, all) }
    acts.appendChild(all)
    if (bad.length) {
      acts.appendChild(el('span', 'warn', bad.length + ' 处冲突，各挑一份'))
    }
    body.appendChild(acts)

    groups.forEach(function (g) {
      var pane = el('div', 'pane' + (g.list.length > 1 || g.list[0].stale ? ' bad' : ''))
      pane.appendChild(el('h3', null, spot(g.list[0])
        + (g.list.length > 1 ? '　·　' + g.list.length + ' 份冲突' : '')
        + (g.list.some(function (e) { return e.stale }) ? '　·　底稿已变' : '')))
      g.list.forEach(function (e) {
        var one = el('div', 'cand')
        one.appendChild(el('p', 'by', (e.by || '?') + ' · ' + when(e.at)
          + (e.stale ? ' · 基于旧文' : '')))
        one.appendChild(oneView(e))
        var row = el('div', 'acts')
        var yes = el('button', 'chip', g.list.length > 1 ? '用这份' : '通过')
        var no = el('button', 'chip', '驳回')
        yes.type = no.type = 'button'
        yes.onclick = function () { pick(body, g, e) }
        no.onclick = function () { mark([[e._id, -1]], body) }
        row.appendChild(yes)
        row.appendChild(no)
        one.appendChild(row)
        pane.appendChild(one)
      })
      // 底稿动过了：多给一个「什么都不改」的候选，选它就是把这几份一并驳回。
      if (g.list.some(function (e) { return e.stale })) {
        var keep = el('button', 'chip', '保持现状')
        keep.type = 'button'
        keep.onclick = function () {
          mark(g.list.map(function (e) { return [e._id, -1] }), body)
        }
        pane.appendChild(keep)
      }
      body.appendChild(pane)
    })
  }

  // 挑一份通过，同一处其余的一并驳回。**照旧文改的那份要先把 before 换成库里
  // 现在那一格**，再走同一条通过路径——后端不开强制写入的口子，定位规则始终
  // 是原文匹配，一条代码路径。
  function pick (body, g, e) {
    var rest = g.list.filter(function (x) { return x._id !== e._id })
      .map(function (x) { return [x._id, -1] })
    if (!e.stale) return mark([[e._id, 1]].concat(rest), body)
    call('doc', { id: e.doc }).then(function (d) {
      return call('chg', { doc: e.doc, blk: e.blk, cell: e.cell, after: e.after,
        before: cellAt(d.md, e) })
    }).then(function (r) {
      return mark([[r.id, 1]].concat(rest).concat([[e._id, -1]]), body, 1)
    }, function (err) { tip(body, '接不上当前版本：' + err.message, 1) })
  }

  // 库里此刻那一处的原文。与 convert-doc 的 split_cells、云函数的 cellSpans
  // 同一条规则：记花括号深度，{ico|…} 内部的竖线不是分隔符。
  function cellAt (md, e) {
    var lines = md.split('\n')
    var line = lines[e.blk]
    if (line == null) return ''
    if (Number(e.cell) < 0) {
      return lines.slice(e.blk, e.blk + String(e.before).split('\n').length).join('\n')
    }
    var out = []
    var depth = 0
    var from = 1
    for (var i = 1; i <= line.length; i++) {
      var ch = line[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      if (i === line.length || (ch === '|' && depth === 0)) {
        var a = from
        var b = i
        while (a < b && line[a] === ' ') a++
        while (b > a && line[b - 1] === ' ') b--
        out.push([a, b])
        from = i + 1
        if (ch !== '|') break
      }
    }
    if (out.length > 1) out = out.slice(0, -1)
    return out[e.cell] ? line.slice(out[e.cell][0], out[e.cell][1]) : ''
  }

  // **一条冲突就整批不落地**：先让人在冲突组里挑完，再整体走一遍。
  function passAll (body, pend, btn) {
    btn.disabled = true
    mark(pend.map(function (e) { return [e._id, 1] }), body)
  }

  // 逐条结案。**顺序执行**：同一篇的几处都要落进同一份正文，并发会互相覆盖。
  //
  // **结案之后不重拉三张全量表**：改的是哪几条这里就知道，就地改掉即可。撞车
  // 不靠重拉发现——emark 通过时拿 before 再对一次库里当时的正文，对不上就回
  // conflict，下面接着了。一次通过因此只发两个请求：emark 与那一发 pend。
  // fresh 那一路是例外：pick() 改基线会在库里新建一条记录，本地造不出来。
  function mark (jobs, body, fresh) {
    var conflict = []
    var chain = jobs.reduce(function (p, job) {
      return p.then(function () {
        return call('emark', { id: job[0], ok: job[1] }).catch(function (e) {
          if (e.message !== 'conflict') throw e
          conflict.push(job[0])
        })
      })
    }, Promise.resolve())
    return chain.then(function () {
      if (fresh) return load()
      var done = {}
      jobs.forEach(function (j) { done[j[0]] = j[1] })
      conflict.forEach(function (id) { delete done[id] })
      S.edits.forEach(function (e) {
        if (done[e._id] === undefined) return
        e.ok = Number(done[e._id])
        e.okBy = S.me && S.me.name
      })
      badges()
    }).then(function () {
      reviewView()
      if (conflict.length) {
        tip($('views'), conflict.length + ' 处已被他人修改，留在队列', 1)
      }
    }, function (e) { tip(body, '操作失败：' + e.message, 1) })
  }

  // ── 配装 ───────────────────────────────────────────────────────────
  // **这一页管所有配装，不只是待审投稿。**已上站那些的在线入口只有这里：配装页
  // 没有 data-b，资料页那套逐处编辑在它们身上无从落脚，改法本来就是填表页整篇替换。

  // 头部那几个「键：值」一趟扫完，按源稿字符串记住。画一行要读名字加四个键、
  // 缺失项再读六个，每个都现编一个正则再把整份 md 扫一遍——点一下筛选 chip
  // 整张列表重来一遍。首个匹配为准，与原先 ^键：(.*)$ 带 m 标志的行为一致。
  var HEAD = /^([\u4e00-\u9fff]{1,6})：(.*)$/
  var headOf = new Map()
  function head (md) {
    if (!md) return {}
    var got = headOf.get(md)
    if (got) return got
    var out = {}
    md.split('\n').forEach(function (l) {
      if (l.charAt(0) === '#') {
        if (out['#'] === undefined && /^#\s/.test(l)) out['#'] = l.replace(/^#\s+/, '').trim()
        return
      }
      var m = HEAD.exec(l)
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim()
    })
    if (headOf.size > 300) headOf.clear()     // 只是缓存，涨到头就整片丢掉重来
    headOf.set(md, out)
    return out
  }
  function line (md, key) { return head(md)[key] || '' }
  function nameOf (md) { return head(md)['#'] || '' }

  // 合集：一份源稿装 N 套，`# ` 分隔，头部戴着「合集：是」。判据与
  // convert-build.py 的 split_set() 同一条，切法也是。
  // **只看头部那一块**：注解里引用一句「合集：是」讲解写法的单套稿，
  // 全文扫会把它判成合集，载进合集填表页后切不出成员，保存回去就是一份被搅坏
  // 的源稿。Python 那侧的 split_set() 读的也是 parts[0]，两边判据要一致。
  function isSet (md) { return /^合集：是$/m.test((md || '').split(/\n# /)[0]) }
  function setsOf (md) { return (md || '').trim().split(/\n(?=# )/).slice(1) }
  var MIXED = '多职业'

  // **必需的只有这五项**，与 builds/new/form.js 的 NEED、后端算指纹的 SAME 是
  // 同一组：缺了不许投、缺了也算不出区分度。装备与描述可以后补，这五项不行。
  // 更深的结构（套装件数、六维六格）由构建时的 Python 闸门管，不在这里抄第二遍。
  var NEED = [['推荐人', '推荐人'], ['职业', '职业'], ['属性', '分支'], ['核心', '核心']]

  // **不能用对象字面量**：名字是投稿人填的，叫 constructor 或 toString 时
  // HOLD[名字] 会取到原型链上的函数、读成真值，那一条就永远列着「缺名字」。
  var HOLD = Object.create(null)
  ;['配装名', '配装名称', '合集名', '合集名称', '这一套叫什么'].forEach(function (k) {
    HOLD[k] = 1
  })

  function short (md, keys) {
    var out = keys.filter(function (k) { return !line(md, k[1]) })
      .map(function (k) { return k[0] })
    if (!nameOf(md) || HOLD[nameOf(md)]) out.unshift('名字')
    return out
  }

  function missing (md) {
    var out = short(md, NEED)
    if (!isSet(md)) return out
    // **套数与适用环境也要报**：它们不在 NEED 里，通过之后落盘，
    // convert-build.py 的 split_set()/scenes_of() 会中止——卡住的是整次
    // npm run build，不只是这一篇。
    var many = setsOf(md)
    if (many.length < 2) out.push('第二套配装')
    if (many.length > 12) out.push('套数超过 12')
    if (!/^场景：[ \t]*\S/m.test(md.split(/\n# /)[0])) out.push('适用环境')
    // 推荐人在头部，别的四项每套各一份。报到是第几套——不然审的人不知道
    // 该回哪一套去看。
    many.forEach(function (one, i) {
      var miss = short(one, NEED.filter(function (k) { return k[0] !== '推荐人' }))
      if (miss.length) out.push('第 ' + (i + 1) + ' 套的' + miss.join('、'))
    })
    return out
  }

  // 投稿与已上站的源稿并成一张表。已通过的投稿带着 season/slug，盘上那一篇的
  // _id 就是 builds/<season>/<slug>——两边靠它认成同一套，不重复出现。
  function builds () {
    var live = {}
    S.docs.forEach(function (d) {
      if (d._id.indexOf('builds/') === 0) live[d._id] = d
    })
    var seen = {}
    var out = []
    S.subs.forEach(function (s) {
      var ok = Number(s.ok)
      var id = s.season && s.slug ? 'builds/' + s.season + '/' + s.slug : ''
      // **删除申请自成一行**，不认领那一套：站上那一篇还在（要等本机 sync 才真的删），
      // 两行并排摆着才看得出「这一套在站上，同时有人申请删它」。
      if (s.drop) {
        out.push({ sub: s, id: id, md: s.md, at: s.at,
          state: ok === 0 ? 'wait' : ok === -1 ? 'no' : 'dropping' })
        return
      }
      if (ok === 1 && id && live[id]) seen[id] = 1
      out.push({ sub: s, id: ok === 1 ? id : '', md: s.md, at: s.at,
        state: ok === 0 ? 'wait' : ok === -1 ? 'no' : id && live[id] ? 'live' : 'pass' })
    })
    // 本机直接写的源稿没有对应投稿，照样要管。35 套里有 20 套是这一支——
    // docs 那个动作给 builds/ 前缀的记录带上了 md，所以它们在列表上也有名字、
    // 职业与类别，不再只剩一个 slug。
    Object.keys(live).forEach(function (id) {
      if (!seen[id]) {
        out.push({ sub: null, id: id, md: live[id].md || '', at: live[id].at, state: 'live' })
      }
    })
    return out
  }

  // 状态词一档一个词，不写解释。「通过」是审过了还没落盘，「完成」是站上已经有了。
  var STATE = { wait: '待审', pass: '通过', live: '完成', dropping: '待移除', no: '驳回' }
  // 默认只看待审：一进来就该是待办清单，另外三档按需打开。
  var buildFilter = { wait: 1 }

  // 职业、类别与分支三张表由 admin/pages.js 给（build-terms.py 照 markup.py
  // 那一份导），不在这里另抄一遍。
  var VOCAB = window.starsideBuilds || { classes: [], cats: [], branch: {} }

  function kindOf (b) { return line(b.md, '类别') || '没写类别' }
  function clsOf (b) {
    if (!isSet(b.md)) return line(b.md, '职业') || '没写职业'
    // 合集的职业由成员现算：一个角色的一组配装职业都一样，一队人各穿一套的
    // 那种自成一格，与站上索引页那条规矩同源。
    var all = []
    setsOf(b.md).forEach(function (m) {
      var c = line(m, '职业')
      if (c && all.indexOf(c) < 0) all.push(c)
    })
    return all.length === 1 ? all[0] : all.length ? MIXED : '没写职业'
  }
  function idOf (b) { return b.sub ? b.sub._id : b.id }

  var buildPick = ''          // 左栏选中的那一格：'' 全部、'强度'、'强度/猎人'
  var openBuild = null        // 详情摊开的是哪一套

  // 左栏：类别 → 职业两级，与站上索引页的分节逐层同形（那一页也是类别大节、
  // 职业小节）。**只列有东西的那些分支**，与资料页树同一条规矩：为 0 的职业连同
  // 空掉的类别一起不出现，一屏全是零会把真有东西的那几格淹掉。
  // 计数跟着上面那排状态 chip 走——只看待审时，树上数的就是待审。
  function buildTree (list, on, pick) {
    var box = el('nav', 'tree')
    if (!list.length) {
      box.appendChild(el('p', 'lede', '没有配装'))
      return box
    }
    var n = {}
    list.forEach(function (b) {
      var c = kindOf(b)
      n[c] = (n[c] || 0) + 1
      n[c + '/' + clsOf(b)] = (n[c + '/' + clsOf(b)] || 0) + 1
    })
    // 词表里那几个排在前面，源稿写了别的值照样出得来——不然那几条在树上点不到。
    var cats = VOCAB.cats.filter(function (c) { return n[c] })
    Object.keys(n).forEach(function (k) {
      if (k.indexOf('/') < 0 && cats.indexOf(k) < 0) cats.push(k)
    })
    box.appendChild(row('全部', '', list.length, 0))
    cats.forEach(function (c) {
      box.appendChild(row(c, c, n[c], 0))
      var ks = VOCAB.classes.filter(function (k) { return n[c + '/' + k] })
      Object.keys(n).forEach(function (k) {
        var at = k.indexOf('/')
        if (at > 0 && k.slice(0, at) === c && ks.indexOf(k.slice(at + 1)) < 0) {
          ks.push(k.slice(at + 1))
        }
      })
      ks.forEach(function (k) { box.appendChild(row(k, c + '/' + k, n[c + '/' + k], 1)) })
    })
    return box

    function row (label, key, count, depth) {
      var b = el('button', 'tree-row' + (depth ? ' sub' : '') + (on === key ? ' on' : ''))
      b.type = 'button'
      b.appendChild(el('span', 'id', label))
      b.appendChild(el('span', 'n', String(count)))
      b.onclick = function () { pick(key) }
      return b
    }
  }

  function inPick (b) {
    if (!buildPick) return true
    return buildPick === kindOf(b) || buildPick === kindOf(b) + '/' + clsOf(b)
  }

  function buildsView () {
    title('配装')
    var all = builds()
    var body = el('div')

    var bar = el('div', 'acts')
    Object.keys(STATE).forEach(function (k) {
      var n = all.filter(function (b) { return b.state === k }).length
      var c = el('button', 'chip', STATE[k] + ' ' + n)
      c.type = 'button'
      if (buildFilter[k]) c.setAttribute('aria-current', 'true')
      c.onclick = function () { buildFilter[k] = !buildFilter[k]; buildsView() }
      bar.appendChild(c)
    })
    // 废稿逐条点不现实，给一枚一次清干净的。**只删已驳回的**——去重从不查那一档。
    // **只给超管**：一次抹掉几十条，手滑的代价与逐条不是一个量级。
    var junk = all.filter(function (b) { return b.state === 'no' }).length
    if (junk && S.me.lv >= 4) {
      var wipe = el('button', 'chip', '清空废稿（' + junk + '）')
      wipe.type = 'button'
      wipe.onclick = function () {
        if (!window.confirm('删除 ' + junk + ' 条废稿？不可撤销。')) return
        wipe.disabled = true
        call('sdrop', {}).then(load).then(toList, function (e) {
          wipe.disabled = false
          tip(body, '删除失败：' + e.message, 1)
        })
      }
      bar.appendChild(wipe)
    }

    var inState = all.filter(function (b) { return buildFilter[b.state] })
    if (buildPick && !inState.some(inPick)) buildPick = ''
    show(split(buildTree(inState, buildPick, function (k) {
      buildPick = buildPick === k ? '' : k       // 再点一次就取消筛选
      buildsView()
    }), body))
    body.appendChild(bar)

    var list = inState.filter(inPick)
      .sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1 })
    if (!list.length) body.appendChild(el('p', 'lede', '没有配装'))

    var rows = el('div', 'rows')
    list.forEach(function (b) {
      var md = b.md
      // 左缘那条 2px 亮边跟着这一套的分支色走，与站上索引页每张卡的左缘同一条
      // 规则（.b-* 六行在 assets/site.css，一处定义三处生效）。
      var slug = VOCAB.branch[line(md, '分支')]
      var r = el('button', slug ? 'b-' + slug : '')
      r.type = 'button'
      var drop = b.sub && b.sub.drop
      r.appendChild(el('span', 'flag ' + (drop ? 'no' : b.state === 'wait' ? 'pend'
        : b.state === 'no' ? 'no' : 'pass'),
        drop ? (b.state === 'wait' ? '待删' : STATE[b.state]) : STATE[b.state]))
      r.appendChild(el('span', 'id ' + (openBuild === idOf(b) ? 'on' : ''),
        (drop ? '申请删除　' : '')
        + (md ? (nameOf(md) || '（没名字）') : b.id.split('/').pop())))
      if (md) {
        r.appendChild(el('span', 'meta', clsOf(b) || '—'))
        r.appendChild(el('span', 'meta', line(md, '分支') || '—'))
        // 类别与定位是两回事：定位说这套在队伍里干什么，类别说它为什么被推荐
        r.appendChild(el('span', 'kind', line(md, '类别') || '—'))
        r.appendChild(el('span', 'by', line(md, '推荐人').split('|')[0].trim() || '—'))
        // 合集与单套在列表上长得一样，不标出来点进去才知道这一行是三套。
        // **排在几个定宽列之后**：插在中间会把它们整体推开，合集那一行与上下
        // 的单套行对不齐，六七十行扫下来一眼就是锯齿。
        if (isSet(md)) r.appendChild(el('span', 'n-sets', setsOf(md).length + ' 套'))
        var miss = missing(md)
        if (miss.length) r.appendChild(el('span', 'lack', '缺 ' + miss.join('、')))
      } else {
        r.appendChild(el('span', 'meta', STATE.live))
      }
      r.appendChild(el('span', 'meta', when(b.at)))
      r.onclick = function () { buildDetail(b) }
      rows.appendChild(r)
    })
    body.appendChild(rows)

    // **详情摊在列表下面，不跳走**：跳到单独一屏会把左栏那棵树与滚到哪儿一起
    // 丢掉，与「改动记录点一条就地展开」同一条约定。
    var hit = openBuild && all.filter(function (x) { return idOf(x) === openBuild })[0]
    if (hit) subDetail(hit)
    else shut()
  }

  // ── 详情那一格 ─────────────────────────────────────────────────────
  // 骨架固定在 index.html 里：头 / iframe / 动作三块，**只有头与动作清空重建**。
  // iframe 一旦被 append 进重建过的容器就是重新挂载，浏览器照规范把整页再载一遍，
  // 而填表页要 site.css、builds/style.css、vocab.js 与 form.js —— 换一条配装
  // 就重付一次解析与布局。
  // 单套与合集各有一页填表页，**各留一个 iframe、切换时收起另一个**：改 src
  // 就是整页重载，而那正是这个函数存在的理由。
  function stageFrame (kind) {
    kind = kind || 'one'
    ;[].forEach.call($('stage').querySelectorAll('iframe.prev'), function (f) {
      f.hidden = f.dataset.kind !== kind
    })
    var fr = $('stage').querySelector('iframe.prev[data-kind="' + kind + '"]')
    if (fr) return fr
    fr = el('iframe', 'prev')
    fr.dataset.kind = kind
    fr.src = kind === 'set' ? '../builds/new/set/index.html'
      : '../builds/new/index.html'
    $('stage').insertBefore(fr, $('stage-foot'))
    return fr
  }

  // 把一份源稿灌进那一页。第一次要等它自己载完，之后直接调。
  function feed (md, onerr) {
    var fr = stageFrame(isSet(md) ? 'set' : 'one')
    var go = function () {
      try {
        var w = fr.contentWindow
        w.starsideForm.load(md)
        // **把那一页自己的「投稿」摘掉**：它在审核页里按一下就是再投一份。
        var send = w.document.getElementById('send')
        if (send) send.remove()
      } catch (err) { onerr(err) }
    }
    if (fr.dataset.ready) go()
    else fr.onload = function () { fr.dataset.ready = '1'; go() }
  }

  function shut () {
    openBuild = null
    hideStage()
  }

  // 点一条：记下开的是哪一套，再画一次列表——详情就摊在它下面那一格里。
  // 正文不必现取，docs 那个动作已经把 builds/ 那些的 md 一并带回来了。
  function buildDetail (b) {
    dive({ v: 'builds', b: idOf(b) })
    openBuild = idOf(b)
    buildsView()
    // 详情摊在整段列表下面，配装攒到几十条就得自己往下滑两千像素。**只滚点击
    // 这一条路**：subDetail() 每次重画都会跑，筛选与 popstate 回来时不该跟着跳。
    // **让位量按站头实测，不吃 --stick**：那个变量由 app.js 写回，而编辑台不引
    // app.js，site.css 里 45px 的缺省值比这一页的站头矮 44px（这里多一条标签栏），
    // 照它滚过去「← 收起」正好压在站头底下。
    var st = $('stage')
    st.style.scrollMarginTop = document.querySelector('.site-head').offsetHeight + 'px'
    st.scrollIntoView()
  }

  function subDetail (b) {
    var s = b.sub || { _id: b.id, md: b.md }
    var wrap = $('stage-head')
    var foot = $('stage-foot')
    wrap.textContent = ''
    foot.textContent = ''
    $('stage').hidden = false
    // 头分左右两列：左边收起与铭牌，右边那几枚动作。**动作不留在 iframe 底下**
    // ——那一格 86vh，按钮落在下面就离刚点的那一行一整屏。tip 跟着按钮走，
    // 它是这几枚的回执，摆在看不见的地方等于没报。
    var idcol = el('div')
    var ops = el('div', 'stage-ops')
    var bar = el('div', 'acts')
    bar.appendChild(back('收起'))
    idcol.appendChild(bar)
    idcol.appendChild(el('p', 'crumb', (nameOf(b.md) || b.id.split('/').pop())
      + '　·　' + STATE[b.state]
      + (b.sub && b.sub.updates ? '　·　更新已有配装' : '')
      + (missing(b.md).length ? '　·　缺 ' + missing(b.md).join('、') : '')))
    wrap.appendChild(idcol)
    wrap.appendChild(ops)

    // 载进来的是**可以改的填表页**，不是一张只读的图。装备写错、描述要润色，
    // 审的人改完再通过比打回去让人重投快得多。**不替他按预览**——预览态下
    // #sheet.preview 把输入框与格子全设成 pointer-events: none，整页点不动；
    // 那一页右下角自己带着「预览配装」，想看成品点它即可。
    feed(b.md, function (err) { tip(ops, '载入失败：' + err.message, 1) })

    // 改后的那一份从填表页现读；读不出来（脚本没载好）就退回投稿原文，不交空的。
    function current () {
      try {
        var md = stageFrame(isSet(b.md) ? 'set' : 'one')
          .contentWindow.starsideForm.read()
        return /^#\s+\S/.test(md) ? md : b.md
      } catch (e) {
        return b.md
      }
    }

    var src = el('details')
    src.appendChild(el('summary', null, '原文'))
    var pre = el('pre')
    pre.textContent = b.md
    src.appendChild(pre)
    foot.appendChild(src)

    if (S.me.lv >= 2) {
      var acts = el('div', 'acts')
      // **赛季与 slug 不再让人填**：赛季就是当前这一季，slug 是「八位随机串-职业」，
      // 两者这里现算、后端照旧验形状与查重。审的人多数时候不想在这里停下来想名字，
      // 而这两样从源稿里推得出来。
      if (b.sub && b.sub.drop) {
        // 删除申请不该改正文——它要的是「删不删」，改了也落不到任何地方
        var bar2 = el('div', 'acts')
        if (b.state === 'wait') {
          var dyes = el('button', 'chip go', '移除')
          var dno = el('button', 'chip', '驳回')
          dyes.type = dno.type = 'button'
          var dmark = function (ok) {
            dyes.disabled = dno.disabled = true
            call('smark', { id: s._id, ok: ok }).then(load).then(toList, function (e) {
              dyes.disabled = dno.disabled = false
              tip(ops, '操作失败：' + e.message, 1)
            })
          }
          dyes.onclick = function () { dmark(1) }
          dno.onclick = function () { dmark(-1) }
          bar2.appendChild(dyes)
          bar2.appendChild(dno)
        }
        ops.appendChild(bar2)
        return
      }

      var keep = el('button', 'chip', '保存')
      var yes = el('button', 'chip go', b.state === 'wait' ? '通过' : '')
      var no = el('button', 'chip', '驳回')
      keep.type = yes.type = no.type = 'button'

      keep.onclick = function () {
        keep.disabled = true
        var md = current()
        // 已上站的写回库里那份源稿，待审的写回投稿记录——两条路的落点不同，
        // 但对填表页来说都只是「存一版」。
        var act = b.state === 'live' ? 'bsave' : 'ssave'
        call(act, { id: b.state === 'live' ? b.id : s._id, md: md }).then(function () {
          s.md = b.md = md
          keep.disabled = false
          tip(ops, '已保存')
        }, function (e) {
          keep.disabled = false
          tip(ops, '保存失败：' + e.message, 1)
        })
      }
      acts.appendChild(keep)

      // 删一套已上站的配装不可逆——站上少一页、点赞数也跟着没了。**走审核，
      // 不当场删**：落成一条待审记录，与投稿走同一条队列。
      if (b.state === 'live') {
        var ask = el('button', 'chip', '申请移除')
        ask.type = 'button'
        ask.onclick = function () {
          if (!window.confirm('申请移除《' + (nameOf(b.md) || b.id) + '》？')) return
          ask.disabled = true
          call('bdrop', { id: b.id }).then(load).then(toList, function (e) {
            ask.disabled = false
            tip(ops, '提交失败：' + e.message, 1)
          })
        }
        acts.appendChild(ask)
      }

      if (b.state === 'no') {
        var del = el('button', 'chip', '删除')
        del.type = 'button'
        del.onclick = function () {
          if (!window.confirm('删除这条废稿？不可撤销。')) return
          del.disabled = true
          call('sdrop', { id: s._id }).then(load).then(toList, function (e) {
            del.disabled = false
            tip(ops, '删除失败：' + e.message, 1)
          })
        }
        acts.appendChild(del)
      }

      if (b.state === 'wait') {
        var mark = function (ok, retry) {
          keep.disabled = yes.disabled = no.disabled = true
          var body = { id: s._id, ok: ok }
          if (ok === 1) {
            body.md = current()
            // 更新已上站那一套时后端沿用原来的 slug，这里给的会被忽略
            body.season = seasons()[0] || ''
            body.slug = defaultSlug(body.md)
          }
          call('smark', body).then(load).then(toList, function (e) {
            keep.disabled = yes.disabled = no.disabled = false
            // 八位 36 进制撞上的概率约两万八千亿分之一，真撞了换一个再来
            if (e.message === 'slug 重了' && !retry) return mark(ok, 1)
            tip(ops, '操作失败：' + e.message, 1)
          })
        }
        yes.onclick = function () { mark(1) }
        no.onclick = function () { mark(-1) }
        acts.appendChild(yes)
        acts.appendChild(no)
      }
      ops.appendChild(acts)
    }
  }

  // ── 改动记录 ───────────────────────────────────────────────────────
  // 记录答的是「最近发生了什么」，主轴因此是时间；左栏那棵树在这里当筛选器，
  // 不点就是全站。**写分组与标题，不写 docs/boss-hp**——读者看到的是一个个资料页。
  var histDoc = null

  function histView () {
    title('改动记录')
    var done = S.edits.filter(function (e) { return e.ok === 1 || e.ok === -1 })
    var count = {}
    done.forEach(function (e) { count[e.doc] = (count[e.doc] || 0) + 1 })
    if (histDoc && !count[histDoc]) histDoc = null

    var body = el('div')
    var side = tree(count, histDoc, function (id) {
      histDoc = histDoc === id ? null : id       // 再点一次就取消筛选
      histView()
    })
    show(split(side, body))

    var list = histDoc ? done.filter(function (e) { return e.doc === histDoc }) : done
    list = list.slice().sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1 })
    body.appendChild(el('p', 'crumb', histDoc ? trail(histDoc) : '全站 · ' + list.length + ' 条'))
    if (!list.length) {
      body.appendChild(el('p', 'lede', '没有记录'))
      return
    }
    var rows = el('div', 'rows')
    list.forEach(function (e) {
      var b = el('button')
      b.type = 'button'
      b.appendChild(el('span', 'flag ' + (e.ok === 1 ? 'pass' : 'no'),
        e.ok === 1 ? '通过' : '驳回'))
      b.appendChild(el('span', 'id', trail(e.doc)
        + (e.after === undefined ? '' : ' · ' + spot(e))))
      b.appendChild(el('span', 'meta', (e.by || '?') + ' → ' + (e.okBy || '?')))
      b.appendChild(el('span', 'meta', when(e.at)))
      b.onclick = function () { fold(rows, b, e) }
      rows.appendChild(b)
    })
    body.appendChild(rows)
  }

  // **就地展开，不跳走**：跳到单独一屏会把左栏那棵树与滚到哪儿一起丢掉。
  // 一次只开一条——同时摊开几条 diff，行与行就对不上了。
  function fold (rows, row, e) {
    var open = row.nextElementSibling && row.nextElementSibling.classList.contains('fold')
    Array.prototype.forEach.call(rows.querySelectorAll('.fold'), function (n) { n.remove() })
    Array.prototype.forEach.call(rows.querySelectorAll('[aria-expanded]'), function (n) {
      n.removeAttribute('aria-expanded')
    })
    if (open) return
    row.setAttribute('aria-expanded', 'true')
    var box = el('div', 'fold')
    box.appendChild(el('p', 'lede', '载入中…'))
    row.parentNode.insertBefore(box, row.nextSibling)
    histBody(e).then(function (node) {
      box.textContent = ''
      box.appendChild(node)
    }, function (err) {
      box.textContent = ''
      box.appendChild(el('p', 'lede', '取不到：' + err.message))
    })
  }

  // 一处改动的记录里 before/after 都还在，结案也不清空——历史就是它本身，不必再问。
  // 早先那批整篇快照结案时只留下一段增删字符串，仍要去 hist 取。
  function histBody (e) {
    if (e.after !== undefined) return Promise.resolve(oneView(e))
    return call('hist', { id: e._id }).then(function (r) {
      var box = el('div', 'diff')
      ;(r.diff || '（无增删）').split('\n').forEach(function (l) {
        var n = el('div', l.charAt(0) === '-' ? 'del' : l.charAt(0) === '+' ? 'add' : 'ctx')
        n.innerHTML = paint(l.slice(2))
        box.appendChild(n)
      })
      return box
    })
  }

  function seasons () {
    var out = []
    S.docs.forEach(function (d) {
      var m = /^builds\/([^/]+)\//.exec(d._id)
      if (m && out.indexOf(m[1]) < 0) out.push(m[1])
    })
    return out.sort().reverse()
  }

  var LATIN = { 猎人: 'hunter', 泰坦: 'titan', 术士: 'warlock' }
  var RAND = 'abcdefghijklmnopqrstuvwxyz0123456789'

  // 「八位随机串-职业」。八位 36 进制约 2.8 万亿种，重名几乎不会发生；
  // 真重了后端当场拒——slug 即文件名，重了会把上一份源稿盖掉。
  function defaultSlug (md) {
    var m = /^职业：\s*(\S+)\s*$/m.exec(md)
    var tail = (m && LATIN[m[1]]) || 'build'
    var head = ''
    for (var i = 0; i < 8; i++) head += RAND.charAt(Math.floor(Math.random() * RAND.length))
    return head + '-' + tail
  }

  // ── 编辑者 ─────────────────────────────────────────────────────────
  function edsView () {
    call('eds', { op: 'list' }).then(function (r) {
      title('编辑者')
      var wrap = el('section', 'block')
      var rows = el('div', 'rows')
      r.eds.forEach(function (u) {
        var row = el('div')
        row.appendChild(el('span', 'id', u.name + '  ' + u._id))
        row.appendChild(el('span', 'meta', LV[u.lv] || u.lv))
        if (u.lv < S.me.lv) {
          var del = el('button', 'chip', '移除')
          del.type = 'button'
          del.onclick = function () {
            if (!window.confirm('移除 ' + u.name + '？')) return
            call('eds', { op: 'del', uid: u._id }).then(edsView, function (e) { alert(e.message) })
          }
          row.appendChild(del)
        }
        rows.appendChild(row)
      })
      wrap.appendChild(rows)

      var f = el('form', 'login')
      f.innerHTML = '<label>uid<input name="uid" required></label>' +
        '<label>名字<input name="name" required></label>' +
        '<label>级别<select name="lv"></select></label>'
      var sel = f.querySelector('select')
      for (var i = 1; i < S.me.lv; i++) sel.appendChild(new Option(LV[i] + '（' + i + '）', String(i)))
      var add = el('button', 'chip go', '添加')
      f.appendChild(add)
      f.onsubmit = function (ev) {
        ev.preventDefault()
        call('eds', { op: 'set', uid: f.uid.value.trim(), name: f.name.value.trim(), lv: Number(sel.value) })
          .then(edsView, function (e) { tip(wrap, e.message, 1) })
      }
      wrap.appendChild(f)
      show(wrap)
    }, function (e) { alert(e.message) })
  }

  // ── 装载 ───────────────────────────────────────────────────────────
  function load () {
    return Promise.all([call('docs'), call('edits'), call('subs')]).then(function (r) {
      S.docs = r[0].docs
      S.edits = r[1].edits.map(function (e) { e.ok = Number(e.ok); return e })
      S.subs = r[2].subs
      badges()
    })
  }

  // 两枚标签上的待审数。整装一次算一次，就地结案之后也算一次。
  function badges () {
    var nd = S.edits.filter(function (e) { return e.ok === 0 }).length
    var ns = S.subs.filter(function (s) { return Number(s.ok) === 0 }).length
    $('n-doc').textContent = nd ? String(nd) : ''
    $('n-sub').textContent = ns ? String(ns) : ''
  }

  function boot () {
    return call('me').then(function (me) {
      S.me = me
      $('gate').hidden = true
      $('me').hidden = false
      $('me-name').textContent = me.name || '（未登记）'
      $('me-lv').textContent = LV[me.lv] || '无权限'
      if (!me.lv) {
        $('stranger').hidden = false
        $('my-uid').textContent = me.uid
        return null
      }
      $('views').hidden = false
      show(el('p', 'lede', '载入中…'))
      document.querySelector('[data-view="eds"]').hidden = me.lv < 3
      // 起手那一格也要有 state，不然从详情返回时拿到的是 null
      history.replaceState({ v: 'review' }, '')
      // **三张表到齐了才放开标签栏**：docs / edits / subs 还在路上时 S 里是三个
      // 空数组，这时点「配装」画出来的是一张「没有配装」的空列表，等 load() 落地
      // 又被 reviewView() 顶回审核那一屏——看着就是「第一次进去加载不出来」。
      return load().then(function () {
        $('tabs').hidden = false
        reviewView()
      })
    })
  }

  // ── 登录框 ───────────────────────────────────────────────────────
  // 只有账号密码一条。**账号由管理员在云开发控制台手工建**（注册用户免费、不限量），
  // 没有自助注册：网关默认策略对任何自注册的注册用户都放行云函数，少一条注册入口
  // 就少一整类要挡的东西。
  function gate () {
    var pw = $('f-pw')
    pw.onsubmit = function (ev) {
      ev.preventDefault()
      $('gate-tip').textContent = '登录中…'
      auth('/auth/v1/signin', {
        username: pw.username.value.trim(),
        password: pw.password.value
      }).then(function (j) {
        tok(j)
        $('gate-tip').textContent = ''
        return boot()
      }).catch(function (e) { $('gate-tip').textContent = '登录失败：' + e.message })
    }
  }

  function start () {
    $('out').onclick = function () { tok(null); location.reload() }
    $('tabs').onclick = function (ev) {
      var b = ev.target.closest('[data-view]')
      if (!b) return
      // 按属性找，不按 children——标签页外面还包着一层 .tool-chips
      Array.prototype.forEach.call(this.querySelectorAll('[data-view]'), function (n) {
        n.removeAttribute('aria-current')
      })
      b.setAttribute('aria-current', 'true')
      dive({ v: b.dataset.view })
      ;(VIEWS[b.dataset.view] || reviewView)()
    }
    gate()
    // 有令牌就直接进，没有或过期了才落回登录框。**认证失败要把那个类摘掉**，
    // 否则登录框被 CSS 藏着，人看到的是一片空白。
    if (tok()) {
      boot().catch(function () {
        tok(null)
        document.documentElement.classList.remove('signed')
      })
    } else {
      document.documentElement.classList.remove('signed')
    }
  }

  // 纯函数单独导出：块拆分、着色与闸门不碰 DOM，离线断言直接拿这一份跑，
  // 不复制副本。页面不在时（Node 里）只导出、不接线。
  var api = { paint: paint, lint: lint, cells: cells, start: start }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document !== 'undefined') {
    window.starsideAdmin = api
    // 守卫查登录表单：它是这一页必然存在的东西。查一个只在外壳上的 id 会在改
    // 外壳时静默失效——所有监听一个都绑不上，按钮按下去毫无反应。
    if ($('f-pw')) start()
  }
})()
