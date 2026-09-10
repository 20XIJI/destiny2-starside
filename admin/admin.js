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
  // 第四个参数写进 title。列表里那几列是 nowrap + ellipsis，而这一屏不换行、
  // 不横向滚，截掉的一段除了 hover 没有别的办法看到。
  var el = function (tag, cls, text, tip) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    if (tip) n.title = tip
    return n
  }
  var LV = { 1: '编辑', 2: '审核员', 3: '管理员', 4: '超管', 5: '本机' }
  var S = { me: null, docs: [], edits: [], subs: [], more: false }

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

  // 切格与行标题那一段走 admin/dialect.js：源稿方言在 JS 这一侧只有那一份定义。
  // 从前这里的 titleEnd() 用的是不记花括号深度的 indexOf，首格带 {token|…}
  // 的行会把身份段截在标记内部那个竖线上——4563 行语料里 382 行如此，
  // 于是行标题里的词在编辑台上被当成正文报「该着色」，而构建时的 G6 不报。
  function cells (line) { return window.starsideDialect.cells(line) }
  function titleEnd (line) { return window.starsideDialect.titleEnd(line) }

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
  // 编辑台整站一页。**只有配装详情压一格**：人在详情里按返回，想去的是那张列表。
  // 换标签是同一屏里换一份列表、不是钻进去一层，就地改写那一格即可——每换一屏压
  // 一格的话，四枚标签点一圈就攒四格，返回键要按四下才出得去编辑台。
  // state 里写清那一格该画什么。
  var VIEWS = { review: reviewView, builds: buildsView, hist: histView, eds: edsView }

  // 详情里做完动作回列表。**走 history.back()，不直接画列表**——直接画会把详情
  // 那一格留在历史里，人再按一次返回又弹回那条已经处理完的记录。
  function toList () {
    if (history.state && history.state.b) return history.back()
    /* 历史那一格里没有详情，也照样要把它收起来——**这条路真会走到**：换标签再换
       回来时 replaceState 写的是 { v: 'builds' }，而 openBuild 还留着（show() 只收
       DOM 不动它），详情因此还摊着。不 shut() 的话，动作做完那一条还开在原地。 */
    shut()
    buildsView()
  }

  /* 地址栏那一格。**只带 b，不带筛选与树**：那两样是各人当时的看法，带进链接会把
     收链接的人的筛选一起改掉；而 b 指的是同一条稿子，两个人看的是同一样东西。

     待审稿在站上还没有详情页，从前审核员之间要讨论一套只能传图（截图那枚按钮
     就是为此存在的）。带上这一格之后，链接本身就能指到那一条。 */
  function urlOf (id) {
    return location.pathname + (id ? '?b=' + encodeURIComponent(id) : '')
  }

  function draw (state) {
    var v = (state && state.v) || 'builds'
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (n) {
      if (n.dataset.view === v) n.setAttribute('aria-current', 'true')
      else n.removeAttribute('aria-current')
    })
    // 详情摊开的是哪一套由历史那一格说了算：buildsView 画完列表会照它把详情
    // 摊在下面。从 popstate 回来时因此不必再压一格。
    openBuild = (state && state.b) || null
    ;(VIEWS[v] || buildsView)()
  }

  window.addEventListener('popstate', function (ev) {
    if (S.me && S.me.lv) draw(ev.state)
  })

  // 界面上那个「← 配装」与浏览器的返回走同一条，不然按钮退回去了、历史里还多一格。
  function back (label) {
    var b = el('button', 'toggle', '← ' + label)
    b.type = 'button'
    b.onclick = function () { history.back() }
    return b
  }
  /* 截图：把 iframe 里那一套配装渲染成图，弹在**父窗口**。

     出图归 iframe（starsideForm.shot()，那边才有配装的 DOM 与样式），弹图归这边
     ——iframe 那一格 86vh，浮层落在里面只有那么大，看不成。与上面「动作不留在
     iframe 底下」同一个取向。

     审的是待审稿，站上还没有它的详情页，所以这是审核员之间传图讨论的唯一入口。 */
  function shotBtn (kindOf) {
    var b = el('button', 'op', '截图')
    b.type = 'button'
    b.onclick = function () {
      b.disabled = true
      var was = b.textContent
      b.textContent = '生成中'
      var done = function () { b.disabled = false; b.textContent = was }
      Promise.resolve().then(function () {
        return stageFrame(kindOf()).contentWindow.starsideForm.shot()
      }).then(function (blob) {
        return import('../builds/shot.js').then(function (m) { m.show(blob) })
      }).then(done, function (e) {
        done()
        tip($('stage-head'), '截图失败：' + e.message, 1)
      })
    }
    return b
  }

  /* 不可逆那一档靠位置隔开，不靠颜色：一道发丝线把它推到整条的右端。
     与填表页底部那条同一套语法（左边看一眼、右端会改东西），读者不学两遍。 */
  function sep () {
    var s = el('span', 'op-sep')
    s.setAttribute('aria-hidden', 'true')
    return s
  }

  /* 后端抛的是英文标识，直接拼进「操作失败：」就是给审核员看 no permission。
     只翻真会走到配装这条路上的那些；翻不到的原样带出来——瞎猜一句中文比英文
     更难查，报出原话至少 grep 得到。 */
  var MSG = {
    forbidden: '登录已过期，正在退回登录',
    'no permission': '权限不足，这一步要审核员',
    'no sub': '这条投稿已经不在了，刷新一下',
    'no doc': '库里没有这一篇，刷新一下',
    'bad id': '这一条的编号不合法',
    'bad md': '正文不合法：要以「# 」开头，且不超过 256 KB',
    'bad sub type': '这条是删除申请，按普通投稿处理不了',
    'bad season': '赛季格式不对（形如 s29-…）',
    'bad slug': 'slug 格式不对（小写字母、数字与连字符）',
    'not passed': '这一条不在「通过」档，撤不回',
    conflict: '别人刚动过这一条，请刷新后重看',
    // 批量那一路才抛得出的三条。写在同一张表里：认不认得出这个码，与这个码
    // 该翻成什么，两件事只该查一处。
    'bad jobs': '这一批的格式不对',
    'batch too large': '待审过多，请逐处审核',
    'no edit': '这条改动记录已经不在了，刷新一下',
    // docs 那一路翻页取配装正文时的防跑飞闸。撞上它说明库里 builds/ 的记录数量级
    // 已经不对，不是业务上限。
    'too many builds': '库里的配装条数异常，联系管理员'
  }

  /* 令牌那一档不只是换句话：call() 已经拿 refresh 换过一张再打仍被拒，说明是
     真过期了，留在原地点什么都白点。清掉令牌、缓一下让人看清这句再退回登录框。 */
  function say (e) {
    var m = (e && e.message) || ''
    if (m === 'forbidden') {
      tok(null)
      setTimeout(function () { location.reload() }, 1500)
    }
    return MSG[m] || m || '未知错误'
  }

  function tip (node, msg, bad) {
    var p = node.querySelector('.tip')
    if (!p) { p = el('p', 'tip'); node.appendChild(p) }
    p.setAttribute('role', 'status')
    p.setAttribute('aria-live', 'polite')
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
  var reviewBusy = false

  function reviewView () {
    title('文档')
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
    return call('pend', { doc: openDoc, judge: 1 }).then(function (r) {
      if (openDoc) drawPend(body, r.pend.map(function (e) { e.ok = Number(e.ok); return e }))
    }, function (err) { tip(body, err.message, 1) })
  }

  function drawPend (body, pend) {
    body.setAttribute('data-review', '')
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
    var all = el('button', 'op go', '全部通过（' + pend.length + '）')
    all.type = 'button'
    all.disabled = !!bad.length || !pend.length || pend.length > 48
    all.onclick = function () { passAll(acts, pend) }
    acts.appendChild(all)
    if (pend.length > 48) acts.appendChild(el('span', 'warn', '待审过多，请逐处审核'))
    if (bad.length) {
      acts.appendChild(el('span', 'warn', bad.length + ' 处冲突，请逐处审核；陈旧提案不能通过'))
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
        var yes = el('button', 'op go', g.list.length > 1 ? '用这份' : '通过')
        var no = el('button', 'op', '驳回')
        yes.type = no.type = 'button'
        yes.disabled = !!e.stale
        yes.onclick = function () { pick(row, g, e) }
        no.onclick = function () { mark([[e._id, -1]], row) }
        row.appendChild(yes)
        row.appendChild(no)
        if (e.stale) row.appendChild(el('span', 'warn', '底稿已变，请回资料页重新提交'))
        one.appendChild(row)
        pane.appendChild(one)
      })
      // 底稿动过了：多给一个「什么都不改」的候选，选它就是把这几份一并驳回。
      if (g.list.some(function (e) { return e.stale })) {
        var keepActs = el('div', 'acts')
        var keep = el('button', 'op', '保持现状')
        keep.type = 'button'
        keep.onclick = function () {
          mark(g.list.map(function (e) { return [e._id, -1] }), keepActs)
        }
        keepActs.appendChild(keep)
        pane.appendChild(keepActs)
      }
      body.appendChild(pane)
    })
  }

  // 挑一份通过与驳回其余候选同批提交；陈旧提案原样保留，不按旧坐标猜新底稿。
  function pick (body, g, e) {
    if (e.stale) return tip(body, '底稿已变，请回资料页重新提交', 1)
    var rest = g.list.filter(function (x) { return x._id !== e._id })
      .map(function (x) { return [x._id, -1] })
    return mark([[e._id, 1]].concat(rest), body)
  }

  function passAll (body, pend) {
    return mark(pend.map(function (e) { return [e._id, 1] }), body)
  }

  // 一发就是一个原子批次。整批确认成功才改本地状态；结果不明只刷新，绝不重发。
  function mark (jobs, body) {
    if (reviewBusy) return Promise.resolve()
    reviewBusy = true
    var region = body.closest('[data-review]') || body
    var buttons = Array.prototype.map.call(region.querySelectorAll('button'), function (b) {
      var was = b.disabled
      b.disabled = true
      return [b, was]
    })
    region.setAttribute('aria-busy', 'true')
    tip(body, '正在审核，本批提交中…')
    return call('emark', { jobs: jobs.map(function (j) { return { id: j[0], ok: j[1] } }) })
      .then(function (r) {
        if (!r || r.ok !== 1) throw new Error('unconfirmed')
        var done = {}
        jobs.forEach(function (j) { done[j[0]] = j[1] })
        S.edits.forEach(function (e) {
          if (done[e._id] === undefined) return
          e.ok = done[e._id]
          e.okBy = S.me && S.me.name
        })
        badges()
        return Promise.resolve(reviewView()).then(function () {
          tip($('views').querySelector('[data-review] > .acts') || $('views'), '本批已应用')
        })
      }, function (e) {
        /* 认得出的码才敢说「本批未应用」——说不出所以然的那些，请求可能已经落地了，
           只能说「未确认」再刷一次队列。**认哪些码由 MSG 一处答**：另立一张名单
           的话，加一个码要改两处，漏掉的那次就被当成未知错误。
           conflict 单挑出来：这一档在批量里要说的是「重新审核」，与逐条那句不同。 */
        var msg = e.message === 'conflict'
          ? '本批未应用，底稿或状态已变，请重新审核'
          : MSG[e.message]
            ? '本批未应用：' + MSG[e.message]
            : '结果未确认，正在刷新队列'
        tip(body, msg, 1)
        return load().then(function () {
          return Promise.resolve(reviewView()).then(function () {
            tip($('views').querySelector('[data-review] > .acts') || $('views'), msg, 1)
          })
        }, function (err) { tip(body, msg + '；刷新失败：' + err.message, 1) })
      }).catch(function (e) {
        tip(body, '结果未确认，正在刷新队列', 1)
        return load().then(function () {
          return Promise.resolve(reviewView()).then(function () {
            tip($('views').querySelector('[data-review] > .acts') || $('views'), '队列已刷新，请核实本批状态', 1)
          })
        }, function (err) { tip(body, '结果未确认；刷新失败：' + err.message, 1) })
      }).finally(function () {
        reviewBusy = false
        region.removeAttribute('aria-busy')
        buttons.forEach(function (b) { b[0].disabled = b[1] })
      })
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

  // **必需的这七项**，与 builds/new/form.js 的 NEED 同一组：缺了不许投。装备与
  // 描述可以后补，这七项不行。**比后端算指纹的 SAME 多一个场景与一个强度**：
  // 那两样是站上的目录分法，缺了 convert-build.py 当场中止，但改它们不该让审过
  // 一轮的稿子认不出自己那一份，所以它们挡投稿、不进指纹。
  // 更深的结构（套装件数、六维六格）由构建时的 Python 闸门管，不在这里抄第二遍。
  // **强度那一项认两个键。**换轴之前投的稿子写的是「类别」，是同一件事；只认新键
  // 的话历史投稿会永远挂着「缺 强度」——一来是假的，二来每行多一枚标签，行的
  // min-content 跟着变宽，整页被顶出横向滚动条（body 是 width: fit-content）。
  var NEED = [['推荐人', '推荐人'], ['职业', '职业'], ['属性', '分支'],
              ['场景', '场景'], ['强度', ['强度', '类别']], ['核心', '核心']]
  /* 合集里每一套要凑齐的那几样。**推荐人不在内**：它写在合集头部，整份一个。
     **标签也不在内**，判据是 convert-build.py 的 tags_of()：宗师/终极、日常、
     功能性这三个场景没有标签集，「标签：」整行必须不写；其余场景可写可不写
     ——标签说的是这套在队伍里干什么，说不出分工的那些不该被逼着挑一个凑数。
     要求它的话，一份「场景：日常」的三套合集会报出「两套填齐的配装（现在 0 套）
     · 第 1 套的标签 · 第 2 套的标签 · 第 3 套的标签」，而那份稿子毫无问题。 */
  var PER = [['职业', '职业'], ['属性', '分支'], ['核心', '核心'],
             ['使用场景', '描述']]

  // **不能用对象字面量**：名字是投稿人填的，叫 constructor 或 toString 时
  // HOLD[名字] 会取到原型链上的函数、读成真值，那一条就永远列着「缺名字」。
  var HOLD = Object.create(null)
  ;['配装名', '配装名称', '合集名', '合集名称', '这一套叫什么'].forEach(function (k) {
    HOLD[k] = 1
  })

  function short (md, keys) {
    // 第二项可以是一个键，也可以是一组同义键——任一个写了就算齐（强度／类别）。
    var out = keys.filter(function (k) {
      var want = [].concat(k[1])
      return !want.some(function (one) { return line(md, one) })
    }).map(function (k) { return k[0] })
    if (!nameOf(md) || HOLD[nameOf(md)]) out.unshift('名字')
    return out
  }

  function missing (md) {
    var out = short(md, NEED)
    if (!isSet(md)) return out
    // **套数也要报**：它不在 NEED 里，通过之后落盘，convert-build.py 的
    // split_set() 会中止——卡住的是整次 npm run build，不只是这一篇。
    var many = setsOf(md)
    if (many.length > 12) out.push('套数超过 12')
    // 逐套报，报到是第几套——不然审的人不知道该回哪一套去看。
    var full = 0
    many.forEach(function (one, i) {
      var miss = short(one, PER)
      if (miss.length) out.push('第 ' + (i + 1) + ' 套的' + miss.join('、'))
      else full += 1
    })
    // **至少两套凑齐才算一份合集**：只有一套填得完整时它就是一份单套配装。
    if (full < 2) out.unshift('两套填齐的配装（现在 ' + full + ' 套）')
    return out
  }

  /* 线上改过、还没落盘：库里这一版的 hash 与 sync.py 记下的「上次落盘那一版」不等。
     那一套因此落进「通过」档而不是「完成」——那一档答的就是「这一轮 sync 要发什么」。

     **landed 为空即视为已落盘**：判不出来的时候报成「全都改过」比不报更没用。 */
  function dirtyOf (d) { return !!(d && d.landed && d.hash !== d.landed) }

  /* 上了站的那一支，正文只认库里这一份。**「没这个键」与「值是空的」要分开**：
     docs 那一路对配装是翻页取全的，取全了才有这个键；真缺了说明后端那一步出了岔，
     此时交空串，让它在列表上退成一个 slug、按保存被后端的 bad md 挡下。

     **不退回 s.md。**投稿那份是投稿当时冻住的，与库里现在这份可能差着好几轮线上
     编辑；拿它当底稿灌进填表页，按一下保存就把陈稿盖回库里，而界面上一切正常。
     这正是 limit(200) 那一版第 201 套起会发生的事。 */
  function bodyOf (d) {
    return Object.prototype.hasOwnProperty.call(d, 'md') ? (d.md || '') : ''
  }

  // 投稿与已上站的源稿并成一张表。已通过的投稿带着 season/slug，盘上那一篇的
  // _id 就是 builds/<season>/<slug>——两边靠它认成同一套，不重复出现。
  // 两张表进来，一张行的清单出去，中间不碰 DOM。**收成参数是为了能离线断言**：
  // 「上了站以库里那份为准」与「批准移除的只留一行」两条都在这里，两条都出过错，
  // 而它们在页面上要靠肉眼隔着一层 iframe 看。缺省仍读 S，调用点一处不改。
  function builds (docs, subs) {
    docs = docs || S.docs
    subs = subs || S.subs
    var live = {}
    docs.forEach(function (d) {
      if (d._id.indexOf('builds/') === 0) live[d._id] = d
    })
    /* 已经批准的移除申请。**那一套只留「待移除」那一行**：决定已经做完了，再在
       「完成」里并排摆一行没有标记的，读起来就是「它好好地在站上」。
       **待审的申请不算**——那时两行并排才看得出「这一套在站上，同时有人申请删它」。 */
    var going = {}
    subs.forEach(function (s) {
      if (s.drop && Number(s.ok) === 1 && s.season && s.slug) {
        going['builds/' + s.season + '/' + s.slug] = 1
      }
    })
    var seen = {}
    var out = []
    subs.forEach(function (s) {
      var ok = Number(s.ok)
      var id = s.season && s.slug ? 'builds/' + s.season + '/' + s.slug : ''
      // **删除申请自成一行**，不认领那一套：站上那一篇还在（要等本机 sync 才真的删）。
      if (s.drop) {
        out.push({ sub: s, id: id, md: s.md, at: s.at,
          state: ok === 0 ? 'wait' : ok === -1 ? 'no' : 'dropping' })
        return
      }
      var d = ok === 1 && id ? live[id] : null
      if (d) seen[id] = 1
      if (id && going[id]) return
      // 时间取两边较新的：bsave 动的是 docs.at，投稿那条的 at 停在审过的那一刻，
      // 只看后者会让刚改过的一套标着一个月前的时间，也排不到列表最前。
      //
      // **正文上了站就以库里那份为准。**subs.md 是投稿当时冻住的那一份，而 bsave
      // 改的是 docs.md，从不回写投稿记录——只认 s.md 的话，线上改完再看还是改之前
      // 那一套，而且下一次保存会把这份陈稿原样盖回去。
      out.push({ sub: s, id: ok === 1 ? id : '', doc: d, md: d ? bodyOf(d) : s.md,
        at: d && d.at > (s.at || '') ? d.at : s.at,
        dirty: dirtyOf(d),
        state: ok === 0 ? 'wait' : ok === -1 ? 'no' : d ? 'live' : 'pass' })
    })
    // 本机直接写的源稿没有对应投稿，照样要管。35 套里有 20 套是这一支——
    // docs 那个动作给 builds/ 前缀的记录带上了 md，所以它们在列表上也有名字、
    // 职业与强度，不再只剩一个 slug。
    Object.keys(live).forEach(function (id) {
      if (!seen[id] && !going[id]) {
        out.push({ sub: null, id: id, doc: live[id], md: bodyOf(live[id]), at: live[id].at,
          dirty: dirtyOf(live[id]), state: 'live' })
      }
    })
    return out
  }

  // 状态词一档一个词，不写解释。「通过」是审过了还没落盘，「完成」是站上已经有了。
  var STATE = { wait: '待审', pass: '通过', live: '完成', dropping: '待移除', no: '驳回' }
  /* 「通过」那一档答的是「这一轮 sync 要发什么」：审过还没落盘的，与已上站又被改过的，
     两种来源同属一档。**只并在筛选与计数上，state 本身不动**——subDetail() 的保存、
     申请移除、撤回三枚按钮都按 state 分路，把 live 换成 pass 会让保存写去 subs
     （改动落不了盘）、申请移除整个消失、撤回换成一枚后端必拒的死按钮。 */
  function bucket (b) { return b.dirty ? 'pass' : b.state }

  /* 五个词一档一个，界面上别处没有解释。「通过」与「完成」的差别尤其要说：前者
     审过了还躺在库里，后者站上已经有了。挂在 chip 的 title 上，不占版面。 */
  var STATE_TIP = {
    wait: '投稿进来了，还没人审',
    pass: '审过了，等本机跑 sync 落盘、构建再部署才上站',
    live: '站上已经有了',
    dropping: '删除申请已通过，等本机跑 sync 把源稿删掉',
    no: '驳回的废稿。留着不影响去重，去重从不查这一档'
  }

  // 默认只看待审：一进来就该是待办清单，另外三档按需打开。
  var buildFilter = { wait: 1 }

  /* 一页 25 行，约一屏。**详情那一格 #stage 在 index.html 里是 main 的直接子元素，
     永远排在 #views 后面**——列表有多长，点开一条就要往下滚多远，七十多行时是两千
     多像素。分页把详情压回列表顶端一屏之内。

     切的只是渲染多少行：数据本来就整批在内存里（S.subs / S.docs），树上与 chip 上
     那几个计数照旧按整批算，不跟着翻页走。**后端那三处 limit 是另一件事**，
     拉不回来的照旧不出现，这里分不出来。 */
  var PAGE = 25
  var buildPage = 0
  var buildQ = ''           // 搜索框里那几个字
  /* 动作做完那句回执。**不能当场 tip**：收起详情走的是 history.back()，popstate
     下一拍才到，那时列表才重画，当场贴上去的会被这次重画抹掉。所以先记下来，
     由 buildsView() 画完自己贴到筛选行上，贴完即清。 */
  var pendTip = ''

  /* 重画前光标在第几个字，重画之后放回原处；-1 是「这一次重画不是打字触发的」。
     **用 -1 不用 null**：selectionStart 在少数实现上就会给 null。 */
  var findAt = -1
  var findIME = false       // 输入法正在组字：这期间一律不重画

  /* 「改」取哪一份看这一套在哪一段：改过还没落盘时 docs.by 就是线上动它的那个人；
     没改过时 docs.by 是 sync.py 推上去写的「本机」，写出来没有信息，退回投稿那一侧
     ——sub.edBy 是它待审时被谁改的。两处共用：铭牌第二行，与列表那一行的 title。
     配装侧没有改动记录（edits 只收资料页那条路），这个名字是唯一的线索。 */
  function handOf (b) {
    return (b.dirty && b.doc ? b.doc.by : '') || (b.sub && b.sub.edBy) || ''
  }

  /* 名字、推荐人、核心三样够用：找一条多半是「某某推荐的那套」或「用某某异域的
     那套」。**不搜正文**——整份 md 里什么都有，搜出来全是命中。核心按行取而不走
     line()：合集的核心写在每一套里，头部那一块没有。 */
  // **trim 在这里，不在输入框那一侧**：那边 trim 的话，打「阿 强」打到空格时
  // buildQ 已经把它吃掉，重画又把 value 写回去，空格永远打不出来。
  // 归一化一次就够，不必每一行现算一遍。
  function findQ () { return buildQ.trim().toLowerCase() }

  function inFind (b, q) {
    if (!q) return true
    var md = b.md || ''
    var hay = [nameOf(md), line(md, '推荐人'), b.id]
      .concat(md.match(/^核心：.*$/gm) || []).join('\n').toLowerCase()
    return hay.indexOf(q) >= 0
  }

  // 职业、场景、强度、标签与分支五张表由 admin/pages.js 给（build-terms.py 照
  // markup.py 那一份导），不在这里另抄一遍。
  // **逐键兑，不是整份兑**：只在 starsideBuilds 整个不存在时兜底的话，改了键名之后
  // 那五分钟里拿着旧 pages.js 缓存的人会栽在 VOCAB.scenes.filter 上——不是少一列，
  // 是整个配装视图画不出来。
  var VOCAB = Object.assign(
    { classes: [], scenes: [], tiers: [], sceneTags: {}, branch: {} },
    window.starsideBuilds || {})

  // 树上按第一个场景归格。raid + 地牢 那批（唯一放行的多场景组合）因此挂在 raid
  // 底下，不另开一格「raid、地牢」：左栏是审稿的工作队列，一条只该出现一次，
  // 树上的计数才对得上上面那排状态 chip。
  function kindOf (b) { return (line(b.md, '场景') || '').split('、')[0] || '没写场景' }
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

  // 左栏那两级键之间的分隔符。取制表符是因为场景、职业里都不可能出现它，
  // 而 `/` 会与「宗师/终极」撞车。
  var SEP = '\t'
  var buildPick = ''          // 左栏选中的那一格：'' 全部、'突袭'、'突袭\t猎人'
  var openBuild = null        // 详情摊开的是哪一套

  // 左栏：场景 → 职业两级。**只列有东西的那些分支**，与资料页树同一条规矩：
  // 为 0 的职业连同空掉的场景一起不出现，一屏全是零会把真有东西的那几格淹掉。
  // 站上的索引页不再分节（一张网格 + 工具条），这里仍分两级：审稿是按批过的，
  // 一次只看一个场景比在八十条里滚要快。
  // 计数跟着上面那排状态 chip 走——只看待审时，树上数的就是待审。
  function buildTree (list, on, pick) {
    var box = el('nav', 'tree')
    if (!list.length) {
      box.appendChild(el('p', 'lede', '没有配装'))
      return box
    }
    // **复合键用制表符，不用 `/`**：场景里有「宗师/终极」，拿 `/` 当分隔符会让
    // 它自己被当成一个「场景/职业」的键——树上那一格因此排不出来，按第一个斜杠
    // 切出来的还是「宗师」这个不存在的场景。
    var n = {}
    list.forEach(function (b) {
      var c = kindOf(b)
      n[c] = (n[c] || 0) + 1
      n[c + SEP + clsOf(b)] = (n[c + SEP + clsOf(b)] || 0) + 1
    })
    // 词表里那几个排在前面，源稿写了别的值照样出得来——不然那几条在树上点不到。
    var cats = VOCAB.scenes.filter(function (c) { return n[c] })
    Object.keys(n).forEach(function (k) {
      if (k.indexOf(SEP) < 0 && cats.indexOf(k) < 0) cats.push(k)
    })
    box.appendChild(row('全部', '', list.length, 0))
    cats.forEach(function (c) {
      box.appendChild(row(c, c, n[c], 0))
      var ks = VOCAB.classes.filter(function (k) { return n[c + SEP + k] })
      Object.keys(n).forEach(function (k) {
        var at = k.indexOf(SEP)
        if (at > 0 && k.slice(0, at) === c && ks.indexOf(k.slice(at + 1)) < 0) {
          ks.push(k.slice(at + 1))
        }
      })
      ks.forEach(function (k) { box.appendChild(row(k, c + SEP + k, n[c + SEP + k], 1)) })
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
    return buildPick === kindOf(b) || buildPick === kindOf(b) + SEP + clsOf(b)
  }

  function buildsView () {
    title('配装')
    var all = builds()
    var body = el('div')

    // **筛选行另挂 .filters**：它与详情动作区同为 .acts，而「一排多枚退回素字」
    // 那条规则只该落在这一行上，判据得分得开。
    var bar = el('div', 'acts filters')
    Object.keys(STATE).forEach(function (k) {
      var n = all.filter(function (b) { return bucket(b) === k }).length
      var c = el('button', 'toggle', STATE[k] + ' ' + n, STATE_TIP[k])
      c.type = 'button'
      if (buildFilter[k]) c.setAttribute('aria-current', 'true')
      c.onclick = function () {
        buildFilter[k] = !buildFilter[k]
        buildPage = 0
        buildsView()
      }
      bar.appendChild(c)
    })
    /* 搜一下比翻页快。**只在已经拉进内存的那一批上过一遍**，不发请求：后端零搜索
       接口，而这一批本来就在手里。

       打字会整屏重画，输入框是新建的那一个，所以记下位置与光标、重画之后放回去。
       **组字期间一律不重画**：oninput 在输入法逐个候选字上屏的过程中也会触发，
       而重画一次就把正在组字的那个输入框换掉，候选框当场消失、这个词打不完。
       compositionend 之后字已上屏，那时再过一遍。isComposing 与自己那一位都查：
       前者在 iOS 上不总有，后者由 compositionstart/end 兜着。 */
    var find = el('input', 'tool-search')
    find.type = 'search'
    find.placeholder = '搜名字 / 推荐人 / 核心'
    find.value = buildQ
    // 新建的这一个必然没在组字。**这一位要在这里清**：组字途中被别的事情重画一屏
    // （点了筛选 chip），compositionend 就落在换掉的那个节点上，不清就永远为真，
    // 搜索框从此一个字也不响应。
    findIME = false
    var apply = function () {
      // compositionend 与紧随其后那次 input 会撞车，值没变就别白重画一屏。
      if (buildQ === find.value) return
      buildQ = find.value
      buildPage = 0
      findAt = find.selectionStart
      buildsView()
    }
    find.oninput = function (ev) {
      if (findIME || (ev && ev.isComposing)) return
      apply()
    }
    find.addEventListener('compositionstart', function () { findIME = true })
    find.addEventListener('compositionend', function () { findIME = false; apply() })
    bar.appendChild(find)
    // 拉不回来的那些这里分不出来，只能说一句。翻页翻不到它们。
    if (S.more) {
      bar.appendChild(el('span', 'warn', '已达单次拉取上限，部分配装未列出',
        'docs 500 条 / builds 200 条 / subs 500 条，超出的不在这一批里。'))
    }
    // 废稿逐条点不现实，给一枚一次清干净的。**只删已驳回的**——去重从不查那一档。
    // **只给超管**：一次抹掉几十条，手滑的代价与逐条不是一个量级。
    var junk = all.filter(function (b) { return b.state === 'no' }).length
    if (junk && S.me.lv >= 4) {
      var wipe = el('button', 'op', '清空废稿（' + junk + '）')
      wipe.type = 'button'
      wipe.onclick = function () {
        if (!window.confirm('删除 ' + junk + ' 条废稿？不可撤销。')) return
        wipe.disabled = true
        call('sdrop', {}).then(load).then(toList, function (e) {
          wipe.disabled = false
          tip(body, '删除失败：' + say(e), 1)
        })
      }
      bar.appendChild(sep())
      bar.appendChild(wipe)
    }

    var inState = all.filter(function (b) { return buildFilter[bucket(b)] })
    if (buildPick && !inState.some(inPick)) buildPick = ''
    show(split(buildTree(inState, buildPick, function (k) {
      buildPick = buildPick === k ? '' : k       // 再点一次就取消筛选
      buildPage = 0
      buildsView()
    }), body))
    body.appendChild(bar)
    if (findAt >= 0) {
      find.focus()
      // 放回原处，不一律推到末尾：在中间插字时推到末尾，下一个字就打到别处去了。
      var at = Math.min(findAt, find.value.length)
      find.setSelectionRange(at, at)
      findAt = -1
    }

    /* **只开着待审这一档时先来先审**：那是一条队列，倒序排会让等最久的那份永远沉在
       最后一页。别的档答的是「最近发生了什么」，照旧新的在前；同时开了几档时两种序
       混在一起没有意义，一律按新的在前。 */
    var fifo = buildFilter.wait && Object.keys(STATE).every(function (k) {
      return k === 'wait' || !buildFilter[k]
    })
    var q = findQ()
    var list = inState.filter(function (b) { return inPick(b) && inFind(b, q) })
      .sort(function (a, b) {
        var x = a.at || ''
        var y = b.at || ''
        return (x === y ? 0 : x < y ? 1 : -1) * (fifo ? -1 : 1)
      })
    if (!list.length) {
      body.appendChild(el('p', 'lede', q ? '没有搜到' : '没有配装'))
    }

    /* **摊开哪一条决定翻到第几页，不另存一个变量**：从详情按返回、刷新页面、
       或者别人发来一条 ?b= 链接，三条路都自动落在那一条所在的页上。 */
    var pages = Math.max(1, Math.ceil(list.length / PAGE))
    if (openBuild) {
      var at = list.map(idOf).indexOf(openBuild)
      if (at >= 0) buildPage = Math.floor(at / PAGE)
    }
    buildPage = Math.min(Math.max(buildPage, 0), pages - 1)

    var rows = el('div', 'rows')
    list.slice(buildPage * PAGE, (buildPage + 1) * PAGE).forEach(function (b) {
      var md = b.md
      // 左缘那条 2px 亮边跟着这一套的分支色走，与站上索引页每张卡的左缘同一条
      // 规则（.b-* 六行在 assets/site.css，一处定义三处生效）。
      var slug = VOCAB.branch[line(md, '分支')]
      var r = el('button', slug ? 'b-' + slug : '')
      r.type = 'button'
      var drop = b.sub && b.sub.drop
      // **改过的标「已改」，档不动**：它与「通过」同属一档（筛选与树上的计数都跟着
      // 走），只是那个词得分得开——「这一轮要发什么」里混着两种来源。
      r.appendChild(el('span', 'flag ' + (drop ? 'no' : b.state === 'wait' ? 'pend'
        : b.state === 'no' ? 'no' : 'pass'),
        drop ? (b.state === 'wait' ? '待删' : STATE[b.state])
          : b.dirty ? '已改' : STATE[b.state]))
      /* 名字这一格是全行唯一可收缩的（其余七个都是 flex: none），右边那串「缺 …」
         一长就把它压成一个省略号，而这一屏不换行也不横向滚。全文进 title——
         hover 是取回它的唯一出路。顺带写上最后动过它的人：配装侧没有改动记录，
         这个名字是「该去问谁」的唯一线索。 */
      var who = handOf(b)
      var name = (drop ? '申请删除　' : '')
        + (md ? (nameOf(md) || '（没名字）') : b.id.split('/').pop())
      r.appendChild(el('span', 'id ' + (openBuild === idOf(b) ? 'on' : ''), name,
        name + (who ? '\n最后由 ' + who + ' 改过' : '')))
      if (md) {
        r.appendChild(el('span', 'meta', clsOf(b) || '—'))
        r.appendChild(el('span', 'meta', line(md, '分支') || '—'))
        // 场景与标签跟站上索引页那两级分类对齐：那一页按场景分大节、标签做筛选，
        // 审核的人扫这一列就知道这一篇会落到哪儿去。旧稿的键名一并认下。
        r.appendChild(el('span', 'meta', line(md, '场景') || '—'))
        r.appendChild(el('span', 'meta', line(md, '标签') || line(md, '定位') || '—'))
        // 强度与标签是两回事：标签说这套在队伍里干什么，强度说它凭什么被推荐
        r.appendChild(el('span', 'kind', line(md, '强度') || line(md, '类别') || '—'))
        r.appendChild(el('span', 'by', line(md, '推荐人').split('|')[0].trim() || '—'))
        // 合集与单套在列表上长得一样，不标出来点进去才知道这一行是三套。
        // **排在几个定宽列之后**：插在中间会把它们整体推开，合集那一行与上下
        // 的单套行对不齐，六七十行扫下来一眼就是锯齿。
        if (isSet(md)) r.appendChild(el('span', 'n-sets', setsOf(md).length + ' 套'))
        var miss = missing(md)
        if (miss.length) {
          var lack = '缺 ' + miss.join('、')
          r.appendChild(el('span', 'lack', lack, lack))
        }
      } else {
        r.appendChild(el('span', 'meta', STATE.live))
      }
      r.appendChild(el('span', 'meta', when(b.at)))
      r.onclick = function () { buildDetail(b) }
      rows.appendChild(r)
    })
    body.appendChild(rows)

    /* 只有一页就不出页码条——一条队列见底了本来就该看得出来，摆一排灰按钮
       只是噪声。翻页要把详情收起来：不收的话上面那条「按摊开的那条算页码」
       会立刻把人弹回原页。收的时候连历史那一格一起改回列表，不然按返回
       又弹回一条已经翻走的详情。 */
    if (pages > 1) {
      var pager = el('div', 'acts pager')
      var turn = function (label, to, off) {
        var t = el('button', 'op', label)
        t.type = 'button'
        t.disabled = off
        t.onclick = function () {
          buildPage = to
          if (openBuild) history.replaceState({ v: 'builds' }, '', urlOf(''))
          openBuild = null
          buildsView()
        }
        return t
      }
      pager.appendChild(turn('← 上一页', buildPage - 1, buildPage === 0))
      pager.appendChild(el('span', 'meta', '第 ' + (buildPage + 1) + ' / ' + pages
        + ' 页　·　共 ' + list.length + ' 条'))
      pager.appendChild(turn('下一页 →', buildPage + 1, buildPage >= pages - 1))
      body.appendChild(pager)
    }

    // **详情摊在列表下面，不跳走**：跳到单独一屏会把左栏那棵树与滚到哪儿一起
    // 丢掉，与「改动记录点一条就地展开」同一条约定。
    var hit = openBuild && all.filter(function (x) { return idOf(x) === openBuild })[0]
    if (hit) subDetail(hit)
    else shut()

    // 上一个动作的回执。落在筛选行上——那是这一屏最靠上、且必然存在的一块。
    if (pendTip) {
      tip(bar, pendTip)
      pendTip = ''
    }
  }

  // ── 填表页那一格：两条编辑路共用的三件 ─────────────────────────────
  /* 审核台的 #stage 与配装详情页的遮罩（admin/edit.js）载的是同一对填表页，
     规矩也是同一套。**写在这里、由 api 导出去**，不在 edit.js 里抄第二份：
     下面 mountForm() 那两条（review() 排在 load() 之前、基线取 load() 归一化之后
     读回来的那一份）都是各踩一次才学到的，抄两遍就是两处各记一遍。 */

  // 一份正文该落在哪一页填表页上。**由正文现算，不另存一个字段**：合集标记只有
  // 填表页的 setHead() 发得出，读回来与灌进去永远同属一档，存第二份只会有漂的风险。
  function slotOf (md) { return isSet(md) ? 'set' : 'one' }

  // 地址只给尾巴，前缀由调用方拼：审核台在 admin/ 下写 ../，配装页按 site.css
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
    // 它们，投稿的人因此看不到。lv 1 的编辑者照旧看得见已经写过的审核意见
    // （有值即显示），只是立不起空框。
    // 带守卫——读者浏览器里缓存着的旧 form.js 没有这个方法。
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
    fr.src = '../' + formSrc(kind)
    $('stage').insertBefore(fr, $('stage-foot'))
    return fr
  }

  // #stage 那一格里现在是什么样。还没建过、或者还没载完就返回 null。
  function formOf (kind) {
    var fr = $('stage').querySelector('iframe.prev[data-kind="' + kind + '"]')
    if (!fr || !fr.dataset.ready) return null
    return readForm(fr.contentWindow)
  }

  /* 填表页那一格现在装着谁：fed 是灌进去的那一份，base 是刚灌完时读回来的样子，
     kind 是单套还是合集。

     **脏判据比的是 base 不是 fed**：load() 会把旧键归一化（换轴之前投的稿子写的
     是「类别」，读回来是「强度」），拿灌进去那份比，会在没人动过的稿子上误报，
     每换一条都弹一次确认。 */
  var formFed = null
  var formBase = null

  function formDirty () {
    if (formBase === null) return false
    var now = formOf(slotOf(formFed))
    return now !== null && now !== formBase
  }

  // 保存成功之后重新对一次基线。**不对的话**：接下来那次重画拿着新正文再走一遍
  // feed()，它既与 fed 不等、又算脏，会弹一个莫名其妙的确认。
  function formSynced (md) {
    formFed = md
    formBase = formOf(slotOf(md))
  }

  // 把一份源稿灌进那一页。第一次要等它自己载完，之后直接调。
  //
  // **同一份就原地不动**：load() 会把 iframe 里滚到哪儿、光标在哪一格全部重置，
  // 而保存成功要重画列表那一行，换标签、换筛选、换树上那一格也都会再走一遍这里。
  // 判据是「灌进去的那一份没变」，不是「填表页里没变」——人正改着的那些字要留住。
  function feed (md, onerr) {
    var kind = slotOf(md)
    // 同一份正文必然落在同一档，比正文即可。
    if (md === formFed) { stageFrame(kind); return }
    var fr = stageFrame(kind)
    var go = function () {
      try {
        formFed = md
        formBase = mountForm(fr.contentWindow, md, S.me.lv >= 2)
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
    var id = idOf(b)
    /* **改了没保存就切走**：这是全台唯一会把另一份正文灌进填表页的入口，判据
       只此一处。收起、换筛选、换标签、换树上那一格都不重灌（feed() 那道守卫
       挡着），改的字原样留在那一页上。 */
    // **判据与 feed() 那道早退逐字对偶**：要灌的正文与填表页里现装的那一份不同，
    // 才会真的覆盖。按「点的是不是另一行」判会误伤——收起之后再点回同一条，
    // 什么都不会被覆盖，却照样弹一次确认。
    if (formDirty() && b.md !== formFed
        && !window.confirm('当前这一套改过还没保存，切走会丢。仍要继续？')) return
    /* 从列表点进来压一格，从一条详情跳到另一条就地改写。**不改写的话**：连点三条
       就攒三格，审完一条 toList() 退回去，落到的是上一条已经处理完的详情，
       而它多半已经被筛选挡在列表外了（hit 在 all 里找，不在 inState 里找）。 */
    var how = history.state && history.state.b ? 'replaceState' : 'pushState'
    history[how]({ v: 'builds', b: id }, '', urlOf(id))
    openBuild = id
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
    bar.appendChild(shotBtn(function () { return slotOf(b.md) }))
    idcol.appendChild(bar)
    /* 铭牌两行：上一行这份稿子是什么，下一行谁经手的。**缺的那一格留空不占位**
       ——合集头部没有分支与核心，本机直接落盘的那些没有审核人。 */
    function join (parts) { return parts.filter(Boolean).join('　·　') }
    idcol.appendChild(el('p', 'crumb', join([
      nameOf(b.md) || b.id.split('/').pop(),
      b.dirty ? '已改' : STATE[b.state],
      // 落盘只在本机，通过之后站上什么时候变，界面上本来一句都没有。
      b.dirty || b.state === 'pass' || b.state === 'dropping' ? '等待本机落盘' : '',
      clsOf(b),
      line(b.md, '分支'),
      line(b.md, '强度'),
      line(b.md, '核心'),
      line(b.md, '推荐人').split('|')[0].trim(),
      b.sub && b.sub.updates ? '更新已有配装' : '',
      missing(b.md).length ? '缺 ' + missing(b.md).join('、') : '',
      /\n## 审核意见[ \t]*\n\s*\S/.test(b.md || '') ? '有审核意见' : ''
    ])))
    /* 「改」取哪一份由 handOf() 一处定，列表那一行的 title 用的是同一份。
       时间只有一个 at，三次动作互相覆写，所以写「最后动于」而不是各挂各的时间。 */
    var edBy = handOf(b)
    var okBy = (b.sub && b.sub.okBy) || ''
    idcol.appendChild(el('p', 'crumb hands', join([
      edBy ? '改 ' + edBy : '',
      okBy ? '审 ' + okBy : '',
      b.at ? '最后动于 ' + when(b.at) : ''
    ]) || '没有经手记录'))
    wrap.appendChild(idcol)
    wrap.appendChild(ops)

    // 载进来的是**可以改的填表页**，不是一张只读的图。装备写错、描述要润色，
    // 审的人改完再通过比打回去让人重投快得多。**不替他按预览**——预览态下
    // #sheet.preview 把输入框与格子全设成 pointer-events: none，整页点不动；
    // 那一页右下角自己带着「预览配装」，想看成品点它即可。
    feed(b.md, function (err) { tip(ops, '载入失败：' + err.message, 1) })

    // 改后的那一份从填表页现读；读不出来（脚本没载好）就退回投稿原文，不交空的。
    // 读那一下走 formOf()：脏判据与这里读的必须是同一份实现，抄两遍就会漂。
    function current () {
      var md = formOf(slotOf(b.md))
      return md === null ? b.md : md
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
          // **不挂 go。**go 是「通过」那一档的绿，与列表上 .flag.pass 同一套词汇；
          // 而这一枚是把页面从站上真删掉，全台最不可逆的一个动作，从前却长得最像
          // 「安全的确认」。它归不可逆那一档，靠发丝线推到右端。
          var dyes = el('button', 'op', '移除')
          var dno = el('button', 'op', '驳回')
          dyes.type = dno.type = 'button'
          var dmark = function (ok) {
            dyes.disabled = dno.disabled = true
            call('smark', { id: s._id, ok: ok }).then(load).then(toList, function (e) {
              dyes.disabled = dno.disabled = false
              tip(ops, '操作失败：' + say(e), 1)
            })
          }
          dyes.onclick = function () { dmark(1) }
          dno.onclick = function () { dmark(-1) }
          bar2.appendChild(dno)
          bar2.appendChild(sep())
          bar2.appendChild(dyes)
        }
        ops.appendChild(bar2)
        return
      }

      var keep = el('button', 'op', '保存')
      var yes = el('button', 'op go', b.state === 'wait' ? '通过' : '')
      var no = el('button', 'op', '驳回')
      keep.type = yes.type = no.type = 'button'

      keep.onclick = function () {
        keep.disabled = true
        var md = current()
        // 已上站的写回库里那份源稿，待审的写回投稿记录——两条路的落点不同，
        // 但对填表页来说都只是「存一版」。
        var act = b.state === 'live' ? 'bsave' : 'ssave'
        /* **整装重拉，不能就地改。**已上站那一支的 b.sub 是 null，上面那个 s 是
           现编的一次性对象，`s.md = md` 写不到任何地方；b 自己也是 builds() 每次
           从 S.docs 现拼出来的，下一次重画照旧读库里那份旧正文——存完不刷新
           看不到变化，就是这么来的。而且 dirty 挂在 hash 上，新 hash 只有服务端
           算得出。三发请求，与通过、驳回、撤回同一条路。 */
        /* **两件事分开报**：存失败要让人再存一遍，存下了只是没刷新则不必——混成
           一句「保存失败」会让人把已经进库的那一份再存一次。**把重拉套进成功
           回调里**，两条失败路各归各的 catch，不必在 Error 上挂标记再认回来。 */
        call(act, { id: b.state === 'live' ? b.id : s._id, md: md }).then(function () {
          return load().then(function () {
            keep.disabled = false
            /* 已上站那一套存完落进「通过」档（hash != landed），那一档没开着时
               这一行就从列表上消失。**筛选是审核员自己摆的工作面，不替他动**——
               存没存下由回执那句答，不由列表的形状答。 */
            /* **基线要对，哪怕这就收起了。**收起只藏 DOM，填表页那一格原样留着；
               不对基线的话，等会儿再点开同一套，formDirty() 拿存之前那份基线一比
               就说「改过还没保存」，而它明明已经存进去了。 */
            formSynced(md)
            // 存完就收起，回到上面那张列表。history.back() 顺带把滚动位置还原到
            // 按下那一行的那一刻，与「收起」走同一条路。
            pendTip = b.state === 'live' ? '已保存到库，等本机落盘后上站' : '已保存'
            toList()
          }, function (e) {
            keep.disabled = false
            tip(ops, '已保存，但列表没刷新：' + say(e), 1)
          })
        }, function (e) {
          keep.disabled = false
          tip(ops, '保存失败：' + say(e), 1)
        })
      }
      acts.appendChild(keep)

      // 删一套已上站的配装不可逆——站上少一页、点赞数也跟着没了。**走审核，
      // 不当场删**：落成一条待审记录，与投稿走同一条队列。
      if (b.state === 'live') {
        var ask = el('button', 'op', '申请移除')
        ask.type = 'button'
        ask.onclick = function () {
          if (!window.confirm('申请移除《' + (nameOf(b.md) || b.id) + '》？')) return
          ask.disabled = true
          call('bdrop', { id: b.id }).then(load).then(toList, function (e) {
            ask.disabled = false
            tip(ops, '提交失败：' + say(e), 1)
          })
        }
        acts.appendChild(ask)
      }

      // 通过之后、源稿被 sync.py 拉下来之前，这条记录还只活在库里，退得回来。
      // 上了站（state 完成）就没有这一枚——那时要撤只有「申请移除」，后端也照这条挡。
      if (b.state === 'pass') {
        var undo = el('button', 'op', '撤回')
        undo.type = 'button'
        undo.onclick = function () {
          if (!window.confirm('撤回《' + (nameOf(b.md) || b.id) + '》的通过，退回待审？')) return
          undo.disabled = true
          call('smark', { id: s._id, ok: 0 }).then(load).then(toList, function (e) {
            undo.disabled = false
            tip(ops, '撤回失败：' + say(e), 1)
          })
        }
        acts.appendChild(undo)
      }

      if (b.state === 'no') {
        var del = el('button', 'op', '删除')
        del.type = 'button'
        del.onclick = function () {
          if (!window.confirm('删除这条废稿？不可撤销。')) return
          del.disabled = true
          call('sdrop', { id: s._id }).then(load).then(toList, function (e) {
            del.disabled = false
            tip(ops, '删除失败：' + say(e), 1)
          })
        }
        acts.appendChild(sep())
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
            tip(ops, '操作失败：' + say(e), 1)
          })
        }
        yes.onclick = function () { mark(1) }
        /* **驳回要问一声**：它与旁边的通过只差一个字色，而这一枚没有退路——
           smark 的撤回那一路要求 cur.ok === 1，驳回之后回不到待审，只剩真删。
           确认弹窗从前全落在撤回、申请移除、删除废稿这些可逆或半可逆的动作上，
           最不可逆的这一枚反倒一声不响。 */
        no.onclick = function () {
          if (!window.confirm('驳回《' + (nameOf(b.md) || b.id) + '》？'
              + '\n驳回之后回不到待审，只能删掉。')) return
          mark(-1)
        }
        acts.appendChild(yes)
        acts.appendChild(no)
      }
      ops.appendChild(acts)
    } else {
      /* lv 1 照样载得进可编辑的填表页，而投稿按钮又被 feed() 摘掉了——不说这一句，
         人在表里改半天，找不到任何按钮，也不知道为什么。 */
      tip(ops, '只读：保存、通过与驳回要审核员（lv 2）权限。')
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
        // **这一行不可点，得显式说出来。**.rows > * 那条把按钮样式套给每个直接子元素
        // （手型光标、悬停高亮、左缘点亮），而这一行是 div、没有 onclick——看着可点，
        // 点下去什么都不会发生。真正的动作是行内那枚「移除」。
        var row = el('div', 'flat')
        row.appendChild(el('span', 'id', u.name + '  ' + u._id))
        row.appendChild(el('span', 'meta', LV[u.lv] || u.lv))
        if (u.lv < S.me.lv) {
          // 改名走 op:'set'，级别原样带回去——那个动作一次写整条，不带 lv 会被
          // 当成「改成 undefined」挡下来。**改的只是这张白名单**：记录里的 by/okBy
          // 是当时那个名字的副本，改完不回溯，旧记录照旧写着旧名字。
          var ren = el('button', 'op', '改名')
          ren.type = 'button'
          ren.onclick = function () {
            var name = window.prompt('把「' + u.name + '」改成什么名字？', u.name)
            if (name === null) return
            name = name.trim()
            if (!name || name === u.name) return
            call('eds', { op: 'set', uid: u._id, name: name, lv: Number(u.lv) })
              .then(edsView, function (e) { alert(e.message) })
          }
          row.appendChild(ren)
          var del = el('button', 'op', '移除')
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
      var add = el('button', 'op go', '添加')
      // go 从前落不到它身上：那条选择器要 .acts 祖先，而这一枚在 form.login 里。
      // type 也显式写出来——全页另外三十处都写了，这一处不写就得读者自己去想。
      add.type = 'submit'
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
      // 后端那几条查询没有 orderBy，触到 limit 就静默截断。它报一位，这里显形。
      S.more = !!(r[0].more || r[1].more || r[2].more)
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
      // 编辑者那一屏只给超管：加人、改名、改角色、移除都在这里，看得见谁是编辑者
      // 本身也是这一层的事。云函数的 LEVEL.eds 是同一个门槛，不靠前端藏。
      document.querySelector('[data-view="eds"]').hidden = me.lv < 4
      // 起手那一格也要有 state，不然从详情返回时拿到的是 null。
      // **这一格必须是列表**：地址栏带 ?b= 时下面另压一格详情，退回来才有列表接着。
      // 把它自己写成详情的话，那一条上按「收起」会一路退出编辑台。
      var want = new URLSearchParams(location.search).get('b')
      history.replaceState({ v: 'builds' }, '', urlOf(''))
      // **三张表到齐了才放开标签栏**：docs / edits / subs 还在路上时 S 里是三个
      // 空数组，这时点哪一枚画出来的都是一张空列表，等 load() 落地又被
      // buildsView() 顶回落地那一屏——看着就是「第一次进去加载不出来」。
      return load().then(function () {
        $('tabs').hidden = false
        // 链接指的那一条还在就直接开在它上面，找不到（审完删了、或链接过期）
        // 就退回列表，不报错——收到链接的人多半只是晚来了一步。
        var hit = want && builds().filter(function (x) { return idOf(x) === want })[0]
        if (hit) return buildDetail(hit)
        buildsView()
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
      // 换标签顺手把 ?b= 抹掉：那一格指的是配装详情，换到别的屏就不成立了。
      history.replaceState({ v: b.dataset.view }, '', urlOf(''))
      ;(VIEWS[b.dataset.view] || buildsView)()
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
  // missing 与 builds 是给离线断言的：前者答「审核台会不会对这一篇报缺失」，判据要与
  // convert-build.py 那几道（NEED、split_set、tags_of）对得上——拿库里每一篇真源稿
  // 过一遍，构建得过的稿子这里必须一条都不报；后者是两张表并成清单那一步。
  //
  // 后五件是给 admin/edit.js 那条配装编辑路的：它在配装页上现载这一份，单套与合集
  // 怎么分、填表页怎么载、怎么读、错误码怎么翻，两条路各抄一份就会漂。slotOf 那条
  // 判据还要与 convert-build.py 的 split_set() 逐字一致。
  var api = { paint: paint, lint: lint, cells: cells,
              missing: missing, builds: builds, start: start,
              slotOf: slotOf, formSrc: formSrc, readForm: readForm,
              mountForm: mountForm, say: say }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document !== 'undefined') {
    window.starsideAdmin = api
    // 守卫查登录表单：它是这一页必然存在的东西。查一个只在外壳上的 id 会在改
    // 外壳时静默失效——所有监听一个都绑不上，按钮按下去毫无反应。
    if ($('f-pw')) start()
  }
})()
