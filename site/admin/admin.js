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
  var LV = { 1: '编辑', 2: '审核员', 3: '管理员', 4: '超级管理员', 5: '本机' }
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
        if (!r.ok) {
          var e = new Error(j.error_description || j.error || ('HTTP ' + r.status))
          e.denied = true                 // 认证服务回了拒绝，不是网络断了
          throw e
        }
        return j
      })
    })
  }

  /* 只有认证服务拒了刷新，才算登录真的失效：报 forbidden，say() 与 start() 据此清令牌、
     回登录框。断网这类错误原样抛出，令牌留着，刷新页面即可重试。
     同一页里并发的几发共用一次刷新。拒之前 sa_rt 已被别的标签页换掉的，用那一页换回来的
     令牌，不算失效。 */
  var renewing = null
  function refresh () {
    if (renewing) return renewing
    var rt = localStorage.getItem('sa_rt')
    if (!rt) return Promise.reject(new Error('forbidden'))
    renewing = auth('/auth/v1/token', { grant_type: 'refresh_token', refresh_token: rt })
      .then(function (j) { renewing = null; tok(j) }, function (e) {
        renewing = null
        if (localStorage.getItem('sa_rt') !== rt) return
        throw e.denied ? new Error('forbidden') : e
      })
    return renewing
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

  // 源稿方言（切格、行标题、着色标记）JS 这一侧只有 admin/dialect.js 一份定义。
  // 在函数体里现读 window.starsideDialect，不在模块顶层捕获：见 edit.js 里注入次序那一段。
  function D () { return window.starsideDialect }

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

  // ── 零件 ───────────────────────────────────────────────────────────
  function h (tag, a) {
    var n = document.createElement(tag)
    a = a || {}
    Object.keys(a).forEach(function (k) {
      var v = a[k]
      if (v == null || v === false) return
      if (k === 'class') n.className = v
      else if (k === 'text') n.textContent = v
      else if (k === 'html') n.innerHTML = v
      else if (k === 'style') n.style.cssText = v
      else if (k.slice(0, 2) === 'on') n[k] = v
      else n.setAttribute(k, v === true ? '' : v)
    })
    for (var i = 2; i < arguments.length; i++) put(n, arguments[i])
    return n
  }
  function put (n, kid) {
    if (kid == null || kid === false) return
    if (Array.isArray(kid)) return kid.forEach(function (k) { put(n, k) })
    n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid)
  }
  function btn (text, cls, extra) {
    var a = { type: 'button', class: 'x-btn' + (cls ? ' ' + cls : '') }
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k] })
    return h('button', a, text)
  }
  // 不可逆的那一枚靠位置隔开，不靠颜色：一道发丝线把它推到整条的右端。
  function cut () { return h('span', { class: 'x-cut', 'aria-hidden': 'true' }) }
  function kbd (k) { return h('kbd', { text: k }) }
  function num (v, hot) { return h('span', { class: 'x-n' + (hot && v ? ' hot' : ''), text: String(v) }) }

  /* 后端抛的是英文标识，直接拼进「操作失败：」就是给审核员看 no permission。
     只翻真会走到的那些；翻不到的原样带出来——猜一句中文比英文更难查，报出原话
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

  // 回执：落在 node 里那一行 .x-tip 上，没有就补一行。
  function tip (node, msg, bad) {
    var p = node.querySelector('.x-tip')
    if (!p) { p = h('p', { class: 'x-tip' }); node.appendChild(p) }
    p.setAttribute('role', 'status')
    p.setAttribute('aria-live', 'polite')
    p.textContent = msg
    p.classList.toggle('bad', !!bad)
  }

  // ── 资料页 ─────────────────────────────────────────────────────────
  // 由 admin/pages.js 给，那份从首页的六个分组、源稿的「路径：」与「卡片：」三处
  // 现成数据拼出来。读者看到的是一个个资料页，不是 docs/boss-hp 这样的路径，
  // 所以一律写标题与分组。
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

  // ── 对照 ───────────────────────────────────────────────────────────
  // 新旧两份共有的开头与结尾各多长。中间剩下的那一段就是改动：一格里通常只改
  // 一处，改了几处时这一段从第一处盖到最后一处。不走 LCS，两条文本用不着。
  function changed (a, b) {
    var n = Math.min(a.length, b.length)
    var p = 0
    while (p < n && a.charAt(p) === b.charAt(p)) p++
    var s = 0
    while (s < n - p && a.charAt(a.length - 1 - s) === b.charAt(b.length - 1 - s)) s++
    return [p, s]
  }

  // 把 box 里第 from 到 to 个字（按 textContent 数）包进 <mark>。跨着色 span 时
  // 逐个文本节点各包一段，原有的层级不动。
  function highlight (box, from, to) {
    if (from >= to) return
    var walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    var at = 0
    var hits = []
    for (var t = walk.nextNode(); t; t = walk.nextNode()) {
      var a = Math.max(from, at)
      var z = Math.min(to, at + t.data.length)
      if (a < z) hits.push([t, a - at, z - at])
      at += t.data.length
    }
    hits.forEach(function (x) {
      if (x[2] < x[0].data.length) x[0].splitText(x[2])
      var mid = x[1] ? x[0].splitText(x[1]) : x[0]
      var m = document.createElement('mark')
      mid.parentNode.insertBefore(m, mid)
      m.appendChild(mid)
    })
  }

  // 源稿一格 → 页面上那个样子：着色照画，图不画，格内换行 `\\` 画成真的换行。
  var IMG = /!\[[^\]]*\]\([^)]*\)/g
  function paintCell (t) {
    return D().paint(String(t || '').replace(IMG, '')).replace(/\\\\/g, '<span class="br"></span>')
  }
  // 源稿一格 → 纯文字。表头与行的身份用它：图、换行与着色标记都不算字。paint() 只产出
  // <span> 与 &lt; &amp; 两种转义，剥掉标签、还原转义即得 textContent，不必交给 DOM 解析。
  function plain (t) {
    return D().paint(String(t || '').replace(IMG, '').replace(/\\\\/g, ' '))
      .replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim()
  }

  // 一处改动的原文与改后，改动的那一段在两边各自加亮：一格九十个字里改了四个，
  // 不标出来就得逐字对。按渲染后的文字比，着色标记不算字；两份毫无共同的头尾时
  // 整段都是改动，不加亮。内容各包一层 span：外层那一格是 grid，文字与 <mark>
  // 直接放进去会被拆成两个格子。
  function pair (e, tagA, tagB) {
    var was = h('span', { html: paintCell(e.before) })
    var now = h('span', { html: paintCell(e.after) })
    var ps = changed(was.textContent, now.textContent)
    if (ps[0] || ps[1]) {
      highlight(was, ps[0], was.textContent.length - ps[1])
      highlight(now, ps[0], now.textContent.length - ps[1])
    }
    return [h(tagA || 'div', { class: 'del' }, was), h(tagB || 'div', { class: 'add' }, now)]
  }
  function oneView (e) { return h('div', { class: 'x-diff' }, pair(e)) }

  // 一处改动在哪。表格里的一格按提交时记下的那一行（云函数 chg 写的 ctx）写成
  // 「最后一愿 千语魅痕 · 生命值」；记录那一路是页面出处表给的「记录名 · 字段」；
  // 两样都没有的（整块改动、ctx 上线之前的旧记录）退回行号与格号。
  function spot (e) {
    if (e.kind === 'rec') return e.label || e.rec + ' · ' + e.path
    return '第 ' + (Number(e.blk) + 1) + ' 行'
      + (Number(e.cell) < 0 ? '' : '第 ' + (Number(e.cell) + 1) + ' 格')
  }
  function whereOf (e) {
    if (e.kind === 'rec') {
      var parts = String(e.label || '').split(' · ')
      return parts.length > 1 ? { id: [parts[0]], col: parts.slice(1).join(' · ') } : { id: [spot(e)], col: '' }
    }
    var c = Number(e.cell)
    if (e.ctx && c >= 0 && e.ctx.head[c] !== undefined) {
      return { id: e.ctx.id.map(plain), col: plain(e.ctx.head[c]) }
    }
    return { id: [spot(e)], col: '' }
  }
  function whereView (e) {
    var w = whereOf(e)
    return h('div', { class: 'x-where' },
      w.id.length > 1 ? h('span', { class: 'x-mute', text: w.id[0] }) : null,
      h('b', { text: w.id[w.id.length - 1] }),
      w.col ? h('span', { class: 'col', text: w.col }) : null)
  }
  // 历史搜索每敲一个字对每条改动求一次，按改动记下。load() 换的是新对象，旧的随之作废。
  var whereMemo = new WeakMap()
  function whereText (e) {
    if (whereMemo.has(e)) return whereMemo.get(e)
    var w = whereOf(e)
    var text = w.id.join(' › ') + (w.col ? ' · ' + w.col : '')
    whereMemo.set(e, text)
    return text
  }
  // 表格里的一格把整行连表头摆出来，改的那一格就地写成原文与改后；别的改动走对照。
  function rowView (e) {
    var c = Number(e.cell)
    var ctx = e.ctx
    if (e.kind === 'rec' || !ctx || c < 0 || ctx.cells[c] === undefined) return oneView(e)
    var ab = pair(e, 's', 'ins')
    var merged = ctx.id.length > 1
    return h('div', { class: 'x-row' }, h('table', null,
      h('thead', null, h('tr', null, ctx.head.map(function (t, i) {
        return h('th', { class: i === c ? 'hit' : null, text: plain(t) })
      }))),
      h('tbody', null, h('tr', null, ctx.cells.map(function (t, i) {
        if (i === c) return h('td', { class: 'hit' }, ab)
        // 首格留空即向上合并：把合并到的那一格补出来，整行读得出是哪一行。
        if (i === 0 && merged && !String(t).trim()) return h('td', { class: 'id x-mute', text: plain(ctx.id[0]) })
        return h('td', { class: i < ctx.id.length ? 'id' : null, html: paintCell(t) })
      })))))
  }

  // 库里的 at 一律是 toISOString() 写的 UTC，显示按北京时间，与云函数 today() 同一个时区。
  function when (t) {
    return t ? new Date(Date.parse(t) + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : ''
  }
  // 等了多久。一律按小时计，不换算成天；不满一小时单写。
  function waited (t) {
    var hr = Math.floor((Date.now() - Date.parse(t)) / 36e5)
    return !t ? '' : hr < 1 ? '不足 1 小时' : hr + ' 小时'
  }
  function dayOf (t) {
    var d = when(t)
    return d ? Number(d.slice(5, 7)) + ' 月 ' + Number(d.slice(8, 10)) + ' 日' : ''
  }

  // ── 配装 ───────────────────────────────────────────────────────────
  // **这一台管所有配装，不只是待审投稿。**已上线那些的在线入口只有这里：配装页
  // 没有 data-b，资料页那套逐处编辑在它们身上无从落脚，改法本来就是填表页整篇替换。

  // 头部那几个「键：值」一趟扫完，按源稿字符串记住。首个匹配为准，与原先
  // ^键：(.*)$ 带 m 标志的行为一致。
  var HEAD = /^([一-鿿]{1,6})：(.*)$/
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
  // 的话历史投稿会永远挂着「缺 强度」。
  var NEED = [['推荐人', '推荐人'], ['职业', '职业'], ['属性', '分支'],
              ['场景', '场景'], ['强度', ['强度', '类别']], ['核心', '核心']]
  /* 合集里每一套要凑齐的那几样。**推荐人不在内**：它写在合集头部，整份一个。
     **标签也不在内**，判据是 convert-build.py 的 tags_of()：宗师/终极、日常、
     功能性这三个场景没有标签集，「标签：」整行必须不写；其余场景可写可不写
     ——标签说的是这套在队伍里干什么，说不出分工的那些不该被逼着挑一个凑数。 */
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
     那一套因此落进「通过」档而不是「完成」——那一档答的就是「这一轮要发什么」。

     **landed 为空即视为已落盘**：判不出来的时候报成「全都改过」比不报更没用。 */
  function dirtyOf (d) { return !!(d && d.landed && d.hash !== d.landed) }

  /* 上了站的那一支，正文只认库里这一份。**「没这个键」与「值是空的」要分开**：
     docs 那一路对配装是翻页取全的，取全了才有这个键；真缺了说明后端那一步出了岔，
     此时交空串，让它在列表上退成一个 slug、按保存被后端的 bad md 挡下。

     **不退回 s.md。**投稿那份是投稿当时冻住的，与库里现在这份可能差着好几轮线上
     编辑；拿它当底稿灌进填表页，按一下保存就把陈稿盖回库里，而界面上一切正常。 */
  function bodyOf (d) {
    return Object.prototype.hasOwnProperty.call(d, 'md') ? (d.md || '') : ''
  }

  // 投稿与已上站的源稿并成一张表。已通过的投稿带着 season/slug，盘上那一篇的
  // _id 就是 builds/<season>/<slug>——两边靠它认成同一套，不重复出现。
  // 两张表进来，一张行的清单出去，中间不碰 DOM。**收成参数是为了能离线断言**：
  // 「上了站以库里那份为准」与「批准移除的只留一行」两条都在这里，两条都出过错，
  // 而它们在页面上要靠肉眼隔着一层 iframe 看。缺省仍读 S。
  function builds (docs, subs) {
    docs = docs || S.docs
    subs = subs || S.subs
    var live = {}
    docs.forEach(function (d) {
      if (d._id.indexOf('builds/') === 0) live[d._id] = d
    })
    /* 待审与已批准的移除申请，值是申请的 ok（0 待审、1 已批准）。**「完成」里不再摆
       那一套**：再并排一行没有标记的，读起来就是「它好好地在站上」。驳回之后申请不算数，
       那一套回到「完成」。已批准时同一套的待审与驳回投稿一并收起；待审期间只收「完成」
       那一行，别人重投的新稿照旧进待审队列。 */
    var going = {}
    subs.forEach(function (s) {
      if (s.drop && Number(s.ok) !== -1 && s.season && s.slug) {
        var k = 'builds/' + s.season + '/' + s.slug
        going[k] = Math.max(going[k] || 0, Number(s.ok))
      }
    })
    /* 同一套只出一行。更新那一路通过时沿用旧的 season/slug，首投与每次更新都是一条
       ok=1 的投稿，指着同一篇源稿；逐条出行的话一套配装列成几行，时间都取 docs.at，
       看着像几份一模一样的配装。留最后通过的那一条，经手人读的是它。 */
    var last = {}
    subs.forEach(function (s) {
      if (s.drop || Number(s.ok) !== 1 || !s.season || !s.slug) return
      var id = 'builds/' + s.season + '/' + s.slug
      if (!last[id] || (s.at || '') > (last[id].at || '')) last[id] = s
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
      if (ok === 1 && id && last[id] !== s) return
      var d = ok === 1 && id ? live[id] : null
      if (d) seen[id] = 1
      if (id in going && (going[id] === 1 || ok === 1)) return
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
    // 本机直接写的源稿没有对应投稿，照样要管。docs 那个动作给 builds/ 前缀的记录
    // 带上了 md，所以它们在列表上也有名字、职业与强度，不再只剩一个 slug。
    Object.keys(live).forEach(function (id) {
      if (!seen[id] && !(id in going)) {
        out.push({ sub: null, id: id, doc: live[id], md: bodyOf(live[id]), at: live[id].at,
          dirty: dirtyOf(live[id]), state: 'live' })
      }
    })
    return out
  }

  /* 五档，一档一个词。说明写在状态条上每一档的数字下面，悬停再给一句完整的。
     界面的读者是编辑与审核员：只说这一档对站上意味着什么，不提本机那一侧怎么发。 */
  var STAGES = [
    ['wait', '待审', '等待审核', '投稿与改动提交后尚未审核'],
    ['pass', '通过', '待上线', '已通过，下次站点更新时上线'],
    ['live', '完成', '已上线', '已在站上'],
    ['dropping', '待移除', '待下线', '移除申请已批准，下次站点更新时下线'],
    ['no', '驳回', '可撤回', '已驳回的投稿，可撤回；删除后不可恢复']
  ]
  var STATE = {}
  STAGES.forEach(function (s) { STATE[s[0]] = s[1] })
  /* 「通过」那一档答的是「这一轮要发什么」：审过还没落盘的，与已上线又被改过的，
     两种来源同属一档。**只并在筛选与计数上，state 本身不动**——详情里的保存、
     申请移除、撤回三枚按钮都按 state 分路，把 live 换成 pass 会让保存写去 subs
     （改动落不了盘）、申请移除整个消失、撤回换成一枚后端必拒的死按钮。 */
  function bucket (b) { return b.dirty ? 'pass' : b.state }

  /* 「修改」取哪一份看这一套在哪一段：改过还没落盘时 docs.by 就是线上动它的那个人；
     没改过时 docs.by 是 sync.py 推上去写的「本机」，写出来没有信息，退回投稿那一侧
     ——sub.edBy 是它待审时被谁改的。配装侧没有改动记录（edits 只收资料页那条路），
     这个名字是唯一的线索。 */
  function handOf (b) {
    return (b.dirty && b.doc ? b.doc.by : '') || (b.sub && b.sub.edBy) || ''
  }

  // 职业、场景、强度、标签与分支五张表由 admin/pages.js 给（build-terms.py 照
  // markup.py 那一份导），不在这里另抄一遍。**逐键兑，不是整份兑**：拿着旧 pages.js
  // 缓存的人不该因为少一个键整个视图画不出来。
  var VOCAB = Object.assign(
    { classes: [], scenes: [], tiers: [], sceneTags: {}, branch: {} },
    window.starsideBuilds || {})

  // 职业那一行写成「猎人#主键」，分组只按职业名。
  function clsName (md) { return (line(md, '职业') || '').split('#')[0].trim() }
  function clsOf (b) {
    if (!isSet(b.md)) return clsName(b.md)
    // 合集的职业由成员现算：一个角色的一组配装职业都一样，一队人各穿一套的
    // 那种自成一格，与站上索引页那条规矩同源。
    var all = []
    setsOf(b.md).forEach(function (m) {
      var c = clsName(m)
      if (c && all.indexOf(c) < 0) all.push(c)
    })
    return all.length === 1 ? all[0] : all.length ? MIXED : ''
  }
  function scenesOf (b) { return (line(b.md, '场景') || '').split('、').filter(Boolean) }
  function byOf (md) { return line(md, '推荐人').split('|')[0].trim() }
  function idOf (b) { return b.sub ? b.sub._id : b.id }

  /* 审完一条之后摊开哪一条：按审之前那份队列的次序，从这一条往后找第一条仍待审
     的，到底了从头找。waiting 是审完重拉之后、当前筛选下仍待审的那几条。
     一条都没有返回 null，调用方回列表。 */
  function nextWait (order, id, waiting) {
    var at = order.indexOf(id)
    var seq = order.slice(at + 1).concat(order.slice(0, Math.max(at, 0)))
    for (var i = 0; i < seq.length; i++) {
      if (seq[i] !== id && waiting.indexOf(seq[i]) >= 0) return seq[i]
    }
    return null
  }

  // ── 列表与收件箱的状态 ─────────────────────────────────────────────
  /* 一屏在画什么全在这里。view 是顶栏那三个标签；sel 或 hsel 有值即收件箱版面
     （左边队列、右边详情），否则是列表。筛选是各人当时的看法，不进地址栏；
     sel 进：指的是同一条稿子，两个人看的是同一样东西。 */
  var V = { view: 'queue', status: 'wait', kind: 'all', scene: '', cls: '', q: '', sel: null,
            hok: 0, hdoc: '', hwho: '', hq: '', hsel: null, add: false }
  var PEND = {}             // 资料页 → 带 judge 取回的那一份待审，load() 时清空
  var pendTip = ''          // 回到列表之后要贴在筛选行上的那句回执

  // 待审的资料页，一页一条。冲突数在取回 judge 之前只数得出同一格多份的那一类。
  function pendPages () {
    var at = {}
    var out = []
    S.edits.forEach(function (e) {
      if (e.ok !== 0) return
      if (!at[e.doc]) { at[e.doc] = { doc: e.doc, page: pageOf(e.doc), list: [] }; out.push(at[e.doc]) }
      at[e.doc].list.push(e)
    })
    out.forEach(function (p) {
      var judged = PEND[p.doc]
      p.groups = groupsOf(judged || p.list)
      p.bad = judged ? badOf(p.groups) : p.groups.filter(function (g) { return g.list.length > 1 }).length
      p.people = p.list.map(function (e) { return e.by || '?' }).filter(function (x, i, a) { return a.indexOf(x) === i })
      p.oldest = p.list.map(function (e) { return e.at || '' }).sort()[0]
    })
    return out.sort(function (a, b) { return a.oldest < b.oldest ? -1 : 1 })
  }
  // 同一处的几份收成一组：**它们互斥**，通过一份就得在其余里择一驳回。
  // 记录那一路按「记录 + 字段」归堆：同一格在几页上都有，从哪一页提的都是同一处。
  function groupsOf (pend) {
    var groups = []
    var at = {}
    pend.forEach(function (e) {
      var k = e.kind === 'rec' ? e.rec + '|' + e.path : e.blk + ':' + e.cell
      if (!at[k]) { at[k] = { key: k, list: [] }; groups.push(at[k]) }
      at[k].list.push(e)
    })
    // 源稿那几处按行号排在前，记录那几格按标签排在后。
    return groups.sort(function (a, b) {
      var x = a.list[0]
      var y = b.list[0]
      if ((x.kind === 'rec') !== (y.kind === 'rec')) return x.kind === 'rec' ? 1 : -1
      return x.kind === 'rec' ? spot(x).localeCompare(spot(y)) : x.blk - y.blk
    })
  }
  function badOf (groups) {
    return groups.filter(function (g) {
      return g.list.length > 1 || g.list.some(function (e) { return e.stale })
    }).length
  }

  /* 名字、推荐人、核心三样够用：找一条多半是「某某推荐的那套」或「用某某异域的
     那套」。**不搜正文**——整份 md 里什么都有，搜出来全是命中。核心按行取而不走
     line()：合集的核心写在每一套里，头部那一块没有。
     **trim 在这里，不在输入框那一侧**：那边 trim 的话，打「阿 强」打到空格时
     空格被吃掉，重画又把 value 写回去，空格永远打不出来。 */
  function findQ () { return V.q.trim().toLowerCase() }
  function inFind (b, q) {
    if (!q) return true
    var md = b.md || ''
    var hay = [nameOf(md), line(md, '推荐人'), b.id]
      .concat(md.match(/^核心：.*$/gm) || []).join('\n').toLowerCase()
    return hay.indexOf(q) >= 0
  }

  // 某一档里、筛选之后的配装。**待审一档先来先审**：那是一条队列，倒序排会让等
  // 最久的那份永远沉在最后。别的档答的是「最近发生了什么」，新的在前。
  function buildsIn (st, all) {
    var q = findQ()
    return (all || builds()).filter(function (b) {
      return bucket(b) === st && (!V.scene || scenesOf(b).indexOf(V.scene) >= 0)
        && (!V.cls || clsOf(b) === V.cls) && inFind(b, q)
    }).sort(function (a, b) {
      var x = a.at || ''
      var y = b.at || ''
      return (x === y ? 0 : x < y ? -1 : 1) * (st === 'wait' ? 1 : -1)
    })
  }
  // 资料页只在待审一档里出现；按场景或职业筛的时候问的是配装，资料页不列。
  function pagesIn (st, pages) {
    if (st !== 'wait' || V.scene || V.cls) return []
    var q = findQ()
    return (pages || pendPages()).filter(function (p) {
      return !q || (p.page.title + '\n' + p.people.join('\n')).toLowerCase().indexOf(q) >= 0
    })
  }
  // 五档各有几条，不跟着类型、场景、职业与搜索走：状态条答的是全台的进度。
  function stageCount (st, all, pages) {
    return all.filter(function (b) { return bucket(b) === st }).length
      + (st === 'wait' ? pages.length : 0)
  }
  // 队列的次序：配装在前、资料页在后，与两种版面里各节的次序一致。J / K 与
  // 「通过并继续」都按它走。
  function queueIds () {
    var out = []
    if (V.kind !== 'page') buildsIn(V.status).forEach(function (b) { out.push('b:' + idOf(b)) })
    if (V.kind !== 'build') pagesIn(V.status).forEach(function (p) { out.push('p:' + p.doc) })
    return out
  }
  function lookup (sel) {
    if (!sel) return null
    var id = sel.slice(2)
    if (sel.charAt(0) === 'b') {
      var b = builds().filter(function (x) { return idOf(x) === id })[0]
      return b ? { b: b } : null
    }
    var p = pendPages().filter(function (x) { return x.doc === id })[0]
    return p ? { p: p } : null
  }

  // ── 换屏与浏览器的返回 ─────────────────────────────────────────────
  /* 列表点开一条压一格历史，收件箱里换条就地改写：审完一条按返回回到的是列表，
     不是上一条已经处理完的详情。换标签也是就地改写。 */
  function urlOf () {
    if (V.view !== 'queue' || !V.sel) return location.pathname
    return location.pathname + '?' + (V.sel.charAt(0) === 'b' ? 'b=' : 'p=') + encodeURIComponent(V.sel.slice(2))
  }
  function stateOf () { return { v: V.view, sel: V.sel, hsel: V.hsel } }
  function inbox () { return !!((V.view === 'queue' && V.sel) || (V.view === 'hist' && V.hsel)) }

  // 列表与收件箱之间换版面走 View Transitions：状态条与选中那一条在两种版面里是
  // 同一个东西。系统设了减少动效就直接换。
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
  // 把 patch 写进 V 再重画；how 是这一步怎么记进历史（pushState / replaceState / 不记）。
  // **历史当场写，不等过渡**：过渡的回调是异步的，放在里面写的话，点开之后马上按
  // 返回，退掉的是这一格之前的那一格。
  function morph (patch, how) {
    var was = inbox()
    var old = {}
    Object.keys(patch).forEach(function (k) { old[k] = V[k]; V[k] = patch[k] })
    var will = inbox()
    if (how) history[how](stateOf(), '', urlOf())
    Object.keys(old).forEach(function (k) { V[k] = old[k] })
    var go = function () {
      Object.keys(patch).forEach(function (k) { V[k] = patch[k] })
      render()
      if (inbox() && (patch.sel || patch.hsel)) $('detail').scrollTop = 0
    }
    // 只有版面真的换了才过渡，同一版面里换条就地重画。
    if (was !== will && !calm && document.startViewTransition) document.startViewTransition(go)
    else go()
  }

  /* 改了没保存就切到另一套：这是全台唯一会把另一份正文灌进填表页的入口。判据与
     feed() 那道早退逐字对偶：要灌的正文与填表页里现装的那一份不同，才会真的覆盖。
     去列表、去资料页、去记录都不重灌，改的字原样留在那一页上。 */
  function mayLeave (sel) {
    if (!sel || sel.charAt(0) !== 'b' || !formDirty()) return true
    var it = lookup(sel)
    if (!it || it.b.md === formFed) return true
    return window.confirm('当前配装有未保存的修改，切换后将丢失。仍要继续？')
  }
  function open (sel) {
    if (!mayLeave(sel)) return
    morph({ sel: sel }, history.state && history.state.sel ? 'replaceState' : 'pushState')
  }
  function openHist (id) {
    morph({ hsel: id }, history.state && history.state.hsel ? 'replaceState' : 'pushState')
  }
  // 回列表。**走 history.back()**：直接画列表会把详情那一格留在历史里，人再按一次
  // 返回又弹回那条已经处理完的记录。
  function toList (msg) {
    if (msg) pendTip = msg
    if (history.state && (history.state.sel || history.state.hsel)) return history.back()
    morph({ sel: null, hsel: null }, 'replaceState')
  }
  function tab (v) {
    // 编辑者名单每次进这一屏都重取：别的超级管理员可能刚改过。
    if (v === 'eds') edsCache = null
    morph({ view: v, sel: null, hsel: null }, 'replaceState')
  }

  // ── 画 ─────────────────────────────────────────────────────────────
  function render () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (n) {
      if (n.dataset.view === V.view) n.setAttribute('aria-current', 'true')
      else n.removeAttribute('aria-current')
    })
    var ib = inbox()
    $('views').hidden = ib
    $('ib').hidden = !ib
    if (V.view === 'eds') return edsView()
    if (V.view === 'hist') return ib ? histInbox() : histView()
    if (ib) return queueInbox()
    queueView()
  }

  /* 搜索框。打字会整块重画，输入框是新建的那一个，所以记下光标、重画之后放回去。
     **组字期间一律不重画**：oninput 在输入法逐个候选字上屏的过程中也会触发，
     而重画一次就把正在组字的那个输入框换掉，候选框当场消失、这个词打不完。
     compositionend 之后字已上屏，那时再过一遍。redraw 是这一框该重画的那一块：
     收件箱里只重画队列，不动右边的详情。 */
  var typing = null
  function searchBox (key, holder, redraw) {
    var box = h('input', { class: 'x-in', type: 'search', placeholder: holder, 'aria-label': holder })
    box.value = V[key]
    var ime = false
    var apply = function () {
      if (V[key] === box.value) return
      V[key] = box.value
      typing = { key: key, at: box.selectionStart }
      redraw()
    }
    box.oninput = function (ev) { if (!ime && !(ev && ev.isComposing)) apply() }
    box.addEventListener('compositionstart', function () { ime = true })
    box.addEventListener('compositionend', function () { ime = false; apply() })
    return box
  }
  // 重画之后把光标放回原处，不一律推到末尾：在中间插字时推到末尾，下一个字就打到别处去了。
  function refocus (root) {
    if (!typing) return
    var box = root.querySelector('input[type="search"]')
    if (box) {
      box.focus()
      var at = Math.min(typing.at, box.value.length)
      box.setSelectionRange(at, at)
    }
    typing = null
  }

  function select (label, value, options, on) {
    var s = h('select', { class: 'x-in', 'aria-label': label })
    options.forEach(function (o) { s.appendChild(new Option(o[1], o[0], false, o[0] === value)) })
    s.onchange = function () { on(s.value) }
    return s
  }
  function kinds (small, b, p) {
    return h('div', { class: 'x-seg', role: 'group', 'aria-label': '类型' },
      [['all', '全部', b + p], ['build', '配装', b], ['page', '资料页', p]].map(function (k) {
        return h('button', { type: 'button', 'aria-pressed': V.kind === k[0] ? 'true' : 'false',
          onclick: function () { V.kind = k[0]; inbox() ? drawQueue() : render() } },
        k[1], small ? null : num(k[2]))
      }))
  }

  // ── 审核：列表版面 ─────────────────────────────────────────────────
  function flow (all, pages) {
    var out = []
    STAGES.forEach(function (s, i) {
      var c = stageCount(s[0], all, pages)
      out.push(h('button', { type: 'button', title: s[3],
        class: 'stage' + (s[0] === 'wait' && c ? ' hot' : '') + (c ? '' : ' zero'),
        'aria-pressed': V.status === s[0] ? 'true' : 'false',
        onclick: function () { V.status = s[0]; V.kind = 'all'; render() } },
      h('b', { text: String(c) }), h('span', { text: s[1] }), h('small', { text: s[2] })))
      if (i < 2) out.push(h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }))
      if (i === 2) out.push(h('span', { class: 'gap', 'aria-hidden': 'true' }))
    })
    return h('nav', { class: 'flow', 'aria-label': '状态' }, out)
  }

  function flagsOf (b) {
    var md = b.md || ''
    return [
      b.sub && b.sub.drop && h('span', { class: 'x-flag warn', text: '移除申请' }),
      b.dirty && h('span', { class: 'x-flag', text: '线上已修改' }),
      isSet(md) && h('span', { class: 'x-flag', text: '合集，' + setsOf(md).length + ' 套' }),
      b.sub && b.sub.updates && h('span', { class: 'x-flag', text: '更新已上线配装' }),
      /\n## 审核意见[ \t]*\n\s*\S/.test(md) && h('span', { class: 'x-flag', text: '含审核意见' })
    ].filter(Boolean)
  }
  function titleOf (b) { return (b.md && nameOf(b.md)) || (b.id ? b.id.split('/').pop() : '未命名') }

  function queueView () {
    var box = $('views')
    box.textContent = ''
    var all = builds()
    var pages = pendPages()
    var bs = V.kind === 'page' ? [] : buildsIn(V.status, all)
    var ps = V.kind === 'build' ? [] : pagesIn(V.status, pages)
    var nb = buildsIn(V.status, all).length
    var np = pagesIn(V.status, pages).length
    var scenes = VOCAB.scenes.slice()
    var classes = VOCAB.classes.concat([MIXED])
    var bar = h('div', { class: 'bar' }, kinds(false, nb, np),
      select('场景', V.scene, [['', '全部场景']].concat(scenes.map(function (s) { return [s, s] })),
        function (v) { V.scene = v; render() }),
      select('职业', V.cls, [['', '全部职业']].concat(classes.map(function (s) { return [s, s] })),
        function (v) { V.cls = v; render() }),
      searchBox('q', '搜索名称、推荐人、核心或页面', render))
    // 废稿逐条点不现实，给一枚一次清干净的。**只删已驳回的**——去重从不查那一档。
    // **只给超级管理员**：一次抹掉几十条，手滑的代价与逐条不是一个量级。
    var junk = all.filter(function (b) { return b.state === 'no' && !(b.sub && b.sub.drop) }).length
    if (V.status === 'no' && junk && S.me.lv >= 4) {
      var wipe = btn('清空全部驳回（' + junk + '）', 'quiet', { title: '删除后不可恢复' })
      wipe.onclick = function () {
        if (!window.confirm('删除全部 ' + junk + ' 条驳回稿？删除后不可恢复。')) return
        wipe.disabled = true
        call('sdrop', {}).then(load).then(function () { render(); tip(box.querySelector('.bar'), '已清空驳回稿') }, function (e) {
          wipe.disabled = false
          tip(box, '删除失败：' + say(e), 1)
        })
      }
      bar.appendChild(h('span', { class: 'end x-acts' }, cut(), wipe))
    }
    put(box, [flow(all, pages), bar])
    // 后端几条查询触到上限就静默截断，它报一位，这里显形。
    if (S.more) box.appendChild(h('p', { class: 'more', text: '已达单次读取上限，部分记录未列出。' }))

    if (bs.length) {
      box.appendChild(h('div', { class: 'sect' }, h('h2', { text: '配装' }), num(bs.length)))
      box.appendChild(h('div', { class: 'grid builds' },
        h('div', { class: 'th' }, ['名称', '职业', '分支', '场景', '强度', '推荐人',
          V.status === 'wait' ? '等待时长' : '更新日期'].map(function (t) { return h('span', { text: t }) })),
        bs.map(function (b) {
          var md = b.md || ''
          var slug = VOCAB.branch[line(md, '分支')]
          var miss = md ? missing(md) : []
          var who = handOf(b)
          return h('button', { type: 'button', class: 'tr' + (slug ? ' br-' + slug : ''),
            title: who ? '最后由 ' + who + ' 修改' : null, onclick: function () { open('b:' + idOf(b)) } },
          h('span', { class: 'name' }, h('b', { text: titleOf(b) }), flagsOf(b)),
          h('span', { text: clsOf(b) || '未填写' }),
          h('span', { class: 'x-dim', text: line(md, '分支') }),
          h('span', { class: 'x-dim', text: line(md, '场景') || '未填写' }),
          h('span', { class: 'x-dim', text: line(md, '强度') || line(md, '类别') }),
          h('span', { class: 'x-dim', text: byOf(md) || '未填写' }),
          h('span', { class: 'at', text: V.status === 'wait' ? waited(b.at) : when(b.at).slice(5, 10) }),
          miss.length ? h('span', { class: 'sub', text: '缺少：' + miss.join('、') }) : null)
        })))
    }
    if (ps.length) {
      box.appendChild(h('div', { class: 'sect' }, h('h2', { text: '资料页' }), num(ps.length)))
      box.appendChild(h('div', { class: 'grid pages' },
        h('div', { class: 'th' }, ['页面', '分组', '待审', '提交人', '冲突', '等待时长']
          .map(function (t) { return h('span', { text: t }) })),
        ps.map(function (p) {
          return h('button', { type: 'button', class: 'tr', onclick: function () { open('p:' + p.doc) } },
            h('span', { class: 'name' }, h('b', { text: p.page.title })),
            h('span', { class: 'x-dim', text: p.page.group }),
            h('span', null, num(p.list.length, true), h('span', { class: 'x-dim', text: ' 处' })),
            h('span', { class: 'x-dim', text: p.people.join('、') }),
            judgeErr[p.doc] ? h('span', { class: 'x-note', text: '读取失败', title: judgeErr[p.doc] })
              : PEND[p.doc] || p.bad ? h('span', { class: p.bad ? 'x-note' : 'x-mute', text: p.bad ? p.bad + ' 处' : '无' })
                : h('i', { class: 'sk', style: 'width:28px;height:9px', 'aria-label': '读取中' }),
            h('span', { class: 'at', text: waited(p.oldest) }))
        })))
      judgeAll(ps)
    }
    if (!bs.length && !ps.length) {
      var idle = V.status === 'wait' && !findQ() && !V.scene && !V.cls
      var st = STAGES.filter(function (s) { return s[0] === V.status })[0]
      box.appendChild(h('div', { class: 'x-empty' },
        h('h3', { text: idle ? '暂无待审内容' : findQ() || V.scene || V.cls ? '没有符合条件的条目' : '「' + st[1] + '」暂无内容' }),
        h('p', { text: idle ? '配装投稿与资料页改动提交后显示在此，按等待时长排序。'
          + (stageCount('pass', all, pages) ? '已通过的 ' + stageCount('pass', all, pages) + ' 套将在下次站点更新时上线。' : '')
          : findQ() || V.scene || V.cls ? '可调整筛选条件或清空搜索。' : '可在上方切换其他状态。' }),
        idle ? h('div', { class: 'x-acts' },
          stageCount('pass', all, pages) ? btn('查看已通过（' + stageCount('pass', all, pages) + '）', '', { onclick: function () { V.status = 'pass'; render() } }) : null,
          btn('查看审核记录', 'quiet', { onclick: function () { tab('hist') } })) : null))
    }
    if (pendTip) { tip(bar, pendTip); pendTip = '' }
    refocus(box)
  }

  /* 列表上「冲突」那一列要拿 judge 跑一遍才数得全：同一格多份前端看得出来，底稿
     被人先改掉了只有云函数拿当前正文跑 locate 才知道。每页取一次，load() 清空重来。 */
  var judging = {}
  var judgeErr = {}         // 资料页 → 取 judge 失败的原因，load() 时清空
  function judgeAll (ps) {
    var want = ps.filter(function (p) { return !PEND[p.doc] && !judging[p.doc] && !judgeErr[p.doc] })
    if (!want.length) return
    Promise.all(want.map(function (p) {
      judging[p.doc] = 1
      return call('pend', { doc: p.doc, judge: 1 }).then(function (r) {
        PEND[p.doc] = r.pend.map(function (e) { e.ok = Number(e.ok); return e })
      }, function (e) { judgeErr[p.doc] = MSG[e.message] || e.message }).then(function () { delete judging[p.doc] })
    })).then(function () {
      if (V.view === 'queue') inbox() ? drawQueue() : render()
    })
  }

  // ── 审核：收件箱版面 ───────────────────────────────────────────────
  function queueInbox () {
    var it = lookup(V.sel)
    if (!it) {
      // 那一条已经不在了（审完、被删、或链接过期）：回列表，不报错。
      V.sel = null
      history.replaceState(stateOf(), '', urlOf())
      return render()
    }
    // 详情先画：资料页那一格取待审时记下 judging，队列那一栏的冲突数就不再另发一次。
    if (it.b) buildDetail(it.b)
    else pageDetail(it.p)
    drawQueue()
  }

  function drawQueue () {
    var q = $('queue')
    q.textContent = ''
    var all = builds()
    var pages = pendPages()
    var bs = V.kind === 'page' ? [] : buildsIn(V.status, all)
    var ps = V.kind === 'build' ? [] : pagesIn(V.status, pages)
    q.appendChild(h('div', { class: 'q-top' },
      h('div', { class: 'q-back' }, btn('← 列表', 'quiet sm', { onclick: function () { toList() } }), kbd('Esc'),
        h('span', { class: 'keys' }, kbd('J'), ' ', kbd('K'), ' 上下切换')),
      h('div', { class: 'q-flow', role: 'group', 'aria-label': '状态' }, STAGES.map(function (s) {
        var c = stageCount(s[0], all, pages)
        return h('button', { type: 'button', title: s[3],
          class: (s[0] === 'wait' && c ? 'hot' : '') + (c ? '' : ' zero'),
          'aria-pressed': V.status === s[0] ? 'true' : 'false',
          onclick: function () { V.status = s[0]; V.kind = 'all'; drawQueue() } },
        h('b', { text: String(c) }), s[1])
      })),
      h('div', { class: 'q-kinds' }, kinds(true), searchBox('q', '搜索', drawQueue))))
    var list = h('div', { class: 'q-list' })
    if (bs.length) {
      list.appendChild(h('p', { class: 'q-sec' }, h('span', { text: '配装' }), h('span', { text: String(bs.length) })))
      bs.forEach(function (b) {
        var md = b.md || ''
        var slug = VOCAB.branch[line(md, '分支')]
        var sel = 'b:' + idOf(b)
        var miss = md ? missing(md) : []
        list.appendChild(h('button', { type: 'button', class: 'item' + (slug ? ' br-' + slug : '') + (V.sel === sel ? ' on' : ''),
          onclick: function () { open(sel) } },
        h('span', { class: 'l1' }, h('b', { text: titleOf(b) }),
          h('span', { text: V.status === 'wait' ? waited(b.at) : when(b.at).slice(5, 10) })),
        h('span', { class: 'l2' }, b.sub && b.sub.drop ? h('i', { text: '移除申请' }) : null,
          h('span', { text: clsOf(b) }), h('span', { text: line(md, '分支') }), h('span', { text: byOf(md) || '推荐人未填写' })),
        miss.length ? h('span', { class: 'l3', text: '缺少 ' + miss.length + ' 项' }) : null))
      })
    }
    if (ps.length) {
      list.appendChild(h('p', { class: 'q-sec' }, h('span', { text: '资料页' }), h('span', { text: String(ps.length) })))
      ps.forEach(function (p) {
        var sel = 'p:' + p.doc
        list.appendChild(h('button', { type: 'button', class: 'item' + (V.sel === sel ? ' on' : ''), onclick: function () { open(sel) } },
          h('span', { class: 'l1' }, h('b', { text: p.page.title }), num(p.list.length + ' 处', true), h('span', { text: waited(p.oldest) })),
          h('span', { class: 'l2' }, h('span', { text: p.page.group }), h('span', { text: p.people.join('、') })),
          p.bad ? h('span', { class: 'l3', text: p.bad + ' 处冲突' }) : null))
      })
      judgeAll(ps)
    }
    if (!bs.length && !ps.length) list.appendChild(h('p', { class: 'q-none', text: '这一档没有条目。' }))
    q.appendChild(list)
    refocus(q)
    var on = list.querySelector('.item.on')
    if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(false)
  }

  // 详情的页头：左边是这一条是什么，右边是动作与回执。**动作不留在填表页底下**：
  // 页头吸顶，滚到哪儿按钮都在手边，回执也报在看得见的地方。
  function detailHead (left, ops) {
    var head = $('stage-head')
    head.textContent = ''
    head.appendChild(h('div', { class: 'd-col' }, h('div', null, left),
      h('div', { class: 'ops' }, h('div', { class: 'x-acts' }, ops), h('p', { class: 'x-tip' }))))
    return head.querySelector('.ops')
  }

  // ── 配装详情 ───────────────────────────────────────────────────────
  function buildDetail (b) {
    var s = b.sub || { _id: b.id, md: b.md }
    var md = b.md || ''
    $('detail').style.setProperty('--dw', FORM_WRAP[slotOf(md)] + 'px')
    $('pane').hidden = true
    $('pane').textContent = ''
    $('stage').hidden = false
    var st = bucket(b)
    var facts = [['职业', clsOf(b)], ['分支', line(md, '分支')], ['场景', line(md, '场景')],
      ['标签', line(md, '标签') || line(md, '定位')], ['强度', line(md, '强度') || line(md, '类别')],
      ['核心', line(md, '核心')], ['推荐人', byOf(md) || '未填写']].filter(function (f) { return f[1] })
    var edBy = handOf(b)
    var okBy = (b.sub && b.sub.okBy) || ''
    var miss = md ? missing(md) : []
    var ops = detailHead([
      h('p', { class: 'crumb' }, h('span', { class: 'x-st ' + st, text: b.sub && b.sub.drop ? '移除申请' : STATE[st] }),
        b.state === 'wait' ? '，已等待 ' + waited(b.at) : ''),
      h('h2', { text: titleOf(b) }),
      h('p', { class: 'facts' }, facts.map(function (f) { return h('span', null, h('i', { text: f[0] }), f[1]) })),
      h('p', { class: 'meta' }, h('span', { text: [edBy ? edBy + ' 修改过' : '', okBy ? okBy + ' 审核' : '',
        b.at ? '最后更新于 ' + when(b.at).slice(5) : ''].filter(Boolean).join('，') || '无经手记录' }), flagsOf(b)),
      miss.length ? h('p', { class: 'x-note', style: 'margin-top:6px', text: '缺少：' + miss.join('、') }) : null
    ], buildActs(b, s))
    // 载进来的是**可以改的填表页**，不是一张只读的图。装备写错、描述要润色，
    // 审的人改完再通过比打回去让人重投快得多。**不替他按预览**——预览态下
    // #sheet.preview 把输入框与格子全设成 pointer-events: none，整页点不动；
    // 那一页右下角自己带着「预览配装」，想看成品点它即可。
    feed(md, function (err) { tip(ops, '载入失败：' + err.message, 1) })
    var foot = $('stage-foot')
    foot.textContent = ''
    foot.appendChild(h('details', null, h('summary', { text: '原文' }), h('pre', { text: md })))
  }

  // 改后的那一份从填表页现读；读不出来（脚本没载好）就退回原文，不交空的。
  function current (b) {
    var md = formOf(slotOf(b.md))
    return md === null ? b.md : md
  }

  /* 动作按这一套所在的档给。通过与驳回都退得回待审：两档的状态都只活在库里，
     源稿要等 sync.py 拉下来才落盘；上线之后要撤只有「申请移除」，后端也照这条挡。 */
  function buildActs (b, s) {
    var out = []
    var shot = shotBtn(function () { return slotOf(b.md) })
    if (S.me.lv < 2) {
      /* lv 1 照样载得进可编辑的填表页，而投稿按钮又被 feed() 摘掉了——不说这一句，
         人在表里改半天，找不到任何按钮，也不知道为什么。 */
      return [shot, h('span', { class: 'x-dim', style: 'font-size:12px', text: '只读：保存、通过与驳回需要审核员级别。' })]
    }
    var busy = function (on) { out.forEach(function (x) { if (x.tagName === 'BUTTON') x.disabled = on }) }
    var fail = function (what) { return function (e) { busy(false); tip(opsOf(), what + '失败：' + say(e), 1) } }
    // 删除申请不该改正文——它要的是「删不删」，改了也落不到任何地方。
    if (b.sub && b.sub.drop) {
      if (b.state !== 'wait') return out
      var dmark = function (ok) {
        busy(true)
        var order = queueIds()
        call('smark', { id: s._id, ok: ok }).then(load).then(function () { advance('b:' + idOf(b), order) }, fail('操作'))
      }
      // **批准移除不挂实底绿**：绿是「通过」那一档的词汇，而这一枚是把页面从站上
      // 真删掉，全台最不可逆的一个动作。它归不可逆那一档，靠发丝线推到右端。
      out.push(btn('驳回申请', '', { onclick: function () { dmark(-1) } }), cut(),
        btn('批准移除', '', { onclick: function () { if (window.confirm('批准移除《' + titleOf(b) + '》？下次站点更新时下线。')) dmark(1) } }))
      return out
    }
    out.push(shot)
    var keep = btn('保存', '')
    keep.onclick = function () {
      busy(true)
      var md = current(b)
      // 已上线的写回库里那份源稿，待审的写回投稿记录——两条路的落点不同，
      // 但对填表页来说都只是「存一版」。
      var act = b.state === 'live' ? 'bsave' : 'ssave'
      /* **两件事分开报**：存失败要让人再存一遍，存下了只是没刷新则不必——混成
         一句「保存失败」会让人把已经进库的那一份再存一次。 */
      call(act, { id: b.state === 'live' ? b.id : s._id, md: md }).then(function () {
        return load().then(function () {
          /* **基线要对。**不对的话，接下来那次重画拿着新正文再走一遍 feed()，它既与
             fed 不等、又算脏，会弹一个莫名其妙的确认。 */
          formSynced(md)
          render()
          tip(opsOf(), b.state === 'live' ? '已保存，下次站点更新时上线' : '已保存')
        }, function (e) { busy(false); tip(opsOf(), '已保存，但列表未刷新：' + say(e), 1) })
      }, fail('保存'))
    }
    out.push(keep)
    if (b.state === 'wait') {
      var mark = function (ok, retry) {
        busy(true)
        var body = { id: s._id, ok: ok }
        if (ok === 1) {
          body.md = current(b)
          // 更新已上线那一套时后端沿用原来的 slug，这里给的会被忽略
          body.season = seasons()[0] || ''
          body.slug = defaultSlug(body.md)
        }
        var order = queueIds()
        call('smark', body).then(load).then(function () {
          // 这一条改过的字已经随通过带走、或随驳回作废，切走不必再问「改了没保存」。
          formBase = null
          advance('b:' + idOf(b), order)
        }, function (e) {
          busy(false)
          // 八位 36 进制撞上的概率约两万八千亿分之一，真撞了换一个再来
          if (e.message === 'slug 重了' && !retry) return mark(ok, 1)
          tip(opsOf(), '操作失败：' + say(e), 1)
        })
      }
      out.push(btn('驳回', '', { onclick: function () { mark(-1) } }),
        btn('通过并继续', 'go', { title: '通过后打开队列中的下一条', onclick: function () { mark(1) } }))
    }
    // 通过与驳回都退得回待审：只把这条记录退回待审，再点一次就回去了，所以不问一声。
    if (b.state === 'pass' || b.state === 'no') {
      out.push(btn(b.state === 'pass' ? '退回待审' : '撤回驳回', '', { onclick: function () {
        busy(true)
        call('smark', { id: s._id, ok: 0 }).then(load).then(function () {
          render()
          tip(opsOf(), '已退回待审')
        }, fail('撤回'))
      } }))
    }
    // 删一套已上线的配装不可逆——站上少一页、点赞数也跟着没了。**走审核，不当场删**：
    // 落成一条待审记录，与投稿走同一条队列。
    if (b.state === 'live') {
      out.push(cut(), btn('申请移除', '', { onclick: function () {
        if (!window.confirm('申请移除《' + titleOf(b) + '》？审核通过后，下次站点更新时下线。')) return
        busy(true)
        call('bdrop', { id: b.id }).then(load).then(function () { toList('已提交移除申请') }, fail('提交'))
      } }))
    }
    if (b.state === 'no') {
      out.push(cut(), btn('删除', '', { onclick: function () {
        if (!window.confirm('删除这条驳回稿？删除后不可恢复。')) return
        busy(true)
        var order = queueIds()
        call('sdrop', { id: s._id }).then(load).then(function () { advance('b:' + idOf(b), order) }, fail('删除'))
      } }))
    }
    return out
  }
  function opsOf () { return $('stage-head').querySelector('.ops') || $('stage-head') }

  /* 审完一条直接摊开队列里的下一条，不退回列表：连着过稿时每一条都要「回列表 →
     找下一行 → 点开」三步。order 是审之前队列的次序，下一条只认此刻仍在队列里的；
     一条都没有才回列表。 */
  function advance (sel, order) {
    var next = nextWait(order, sel, queueIds())
    if (!next) return toList(V.status === 'wait' ? '待审已全部处理' : '')
    morph({ sel: next }, 'replaceState')
  }

  /* 截图：把 iframe 里那一套配装渲染成图，弹在**父窗口**。出图归 iframe
     （starsideForm.shot()，那边才有配装的 DOM 与样式），弹图归这边。
     待审稿在站上还没有详情页，这是审核员之间传图讨论的入口。 */
  function shotBtn (kindOf) {
    var b = btn('截图', 'quiet')
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
        tip(opsOf(), '截图失败：' + e.message, 1)
      })
    }
    return b
  }

  // ── 资料页改动 ─────────────────────────────────────────────────────
  var reviewBusy = false
  var pageTurn = 0          // 防串台：取回来时已经换到别的条目就丢掉

  function pageDetail (p) {
    $('detail').style.removeProperty('--dw')
    $('stage').hidden = true
    $('stage-foot').textContent = ''
    var pane = $('pane')
    pane.hidden = false
    pane.textContent = ''
    var all = btn('全部通过（' + p.list.length + '）', 'go', { disabled: true })
    var ops = detailHead([
      h('p', { class: 'crumb', text: '资料页 · ' + trail(p.doc) }),
      h('h2', { text: p.page.title }),
      h('p', { class: 'meta', text: summaryOf(p) })
    ], [p.page.url ? h('a', { class: 'x-btn quiet', href: '../' + p.page.url, target: '_blank', rel: 'noopener' }, '打开页面') : null, all])
    pane.appendChild(h('div', { style: 'display:grid;gap:10px' },
      h('i', { class: 'sk', style: 'height:14px;width:280px' }), h('i', { class: 'sk', style: 'height:90px' }), h('i', { class: 'sk', style: 'height:90px' })))
    var turn = ++pageTurn
    // judge 让后端顺带判一次每条还定不定位得到（乙类冲突），并按当前正文带回那一行。
    // 取的时候记在 judging 里：队列那一栏的冲突数读同一份，不再为这一页另发一次。
    judging[p.doc] = 1
    return call('pend', { doc: p.doc, judge: 1 }).then(function (r) {
      delete judging[p.doc]
      PEND[p.doc] = r.pend.map(function (e) { e.ok = Number(e.ok); return e })
      if (turn !== pageTurn) return
      drawPend(p, PEND[p.doc], all, ops)
      drawQueue()
    }, function (err) {
      delete judging[p.doc]
      if (turn !== pageTurn) return
      pane.textContent = ''
      pane.appendChild(h('div', { class: 'x-alert', role: 'alert' },
        h('p', null, h('b', { text: '读取待审改动失败：' }), say(err)),
        btn('重试', '', { onclick: function () { pageDetail(p) } })))
    })
  }
  function summaryOf (p) {
    return [p.list.length + ' 处待审', p.bad ? '其中 ' + p.bad + ' 处冲突' : '', '提交人：' + p.people.join('、')]
      .filter(Boolean).join('，')
  }

  function drawPend (p, pend, all, ops) {
    var pane = $('pane')
    pane.textContent = ''
    if (!pend.length) {
      pane.appendChild(h('div', { class: 'x-empty' }, h('h3', { text: '这一页没有待审改动' }),
        h('p', { text: '可能刚被他人审完。' })))
      return
    }
    var groups = groupsOf(pend)
    var bad = badOf(groups)
    p.bad = bad
    ops.parentNode.querySelector('.meta').textContent = summaryOf(p)
    all.textContent = '全部通过（' + pend.length + '）'
    all.disabled = !!bad || pend.length > 48
    all.title = bad ? '存在 ' + bad + ' 处冲突，需逐处处理' : pend.length > 48 ? '一批最多 48 处，请逐处审核' : ''
    all.onclick = function () { mark(p, pend.map(function (e) { return [e._id, 1] })) }
    groups.forEach(function (g) {
      var many = g.list.length > 1
      var stale = g.list.some(function (e) { return e.stale })
      pane.appendChild(h('section', { class: 'x-change' }, whereView(g.list[0]),
        many ? h('p', { class: 'x-note', style: 'margin-top:6px', text: '同一格有 ' + g.list.length + ' 份改动：采用其中一份，其余自动驳回。' }) : null,
        g.list.map(function (e) {
          return h('div', { class: 'x-cand' },
            h('p', { class: 'by' }, h('b', { text: e.by || '?' }), when(e.at).slice(5)),
            rowView(e),
            h('div', { class: 'x-acts' },
              btn(many ? '采用此版' : '通过', 'go sm', { disabled: e.stale, onclick: function () {
                // 挑一份通过与驳回其余候选同批提交；陈旧提案原样保留，不按旧坐标猜新底稿。
                mark(p, [[e._id, 1]].concat(g.list.filter(function (x) { return x._id !== e._id })
                  .map(function (x) { return [x._id, -1] })))
              } }),
              btn('驳回', 'sm', { onclick: function () { mark(p, [[e._id, -1]]) } })))
        }),
        // 底稿动过了：多给一个「什么都不改」的选项，选它就是把这几份一并驳回。
        stale ? h('div', { class: 'x-stale' },
          h('span', { text: '原文已变更：提交之后，这一格已被其他改动修改，此改动不能通过。请在资料页按最新内容重新提交。' }),
          btn('保持现状', 'sm', { title: '驳回这一格的全部改动', onclick: function () {
            mark(p, g.list.map(function (e) { return [e._id, -1] }))
          } })) : null))
    })
  }

  // 一发就是一个原子批次。整批确认成功才改本地状态；结果不明只刷新，绝不重发。
  function mark (p, jobs) {
    if (reviewBusy) return Promise.resolve()
    reviewBusy = true
    var region = $('detail')
    var buttons = Array.prototype.map.call(region.querySelectorAll('button'), function (b) {
      var was = b.disabled
      b.disabled = true
      return [b, was]
    })
    region.setAttribute('aria-busy', 'true')
    tip(opsOf(), '正在提交本批审核…')
    var order = queueIds()
    var sel = 'p:' + p.doc
    var after = function (msg, bad) {
      delete PEND[p.doc]
      var it = lookup(sel)
      if (!it) return advance(sel, order)
      render()
      if (msg) tip(opsOf(), msg, bad)
    }
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
        after('本批已生效')
      }, function (e) {
        /* 认得出的码才敢说「本批未生效」——说不出所以然的那些，请求可能已经落地了，
           只能说「结果未确认」再刷一次队列。**认哪些码由 MSG 一处答**。
           conflict 单挑出来：这一档在批量里要说的是「重新审核」，与逐条那句不同。 */
        var msg = e.message === 'conflict'
          ? '本次操作未生效：有改动在本页打开后已被他人修改，这一批改动均未保存。请重新审核。'
          : MSG[e.message]
            ? '本次操作未生效：' + MSG[e.message]
            : '结果未确认，正在刷新队列'
        return load().then(function () { after(msg, 1) }, function (err) {
          tip(opsOf(), msg + '；刷新失败：' + err.message, 1)
        })
      }).catch(function () {
        return load().then(function () { after('结果未确认，队列已刷新，请核实本批状态', 1) }, function (err) {
          tip(opsOf(), '结果未确认；刷新失败：' + err.message, 1)
        })
      }).finally(function () {
        reviewBusy = false
        region.removeAttribute('aria-busy')
        buttons.forEach(function (b) { if (b[0].isConnected) b[0].disabled = b[1] })
      })
  }

  // ── 填表页那一格：两条编辑路共用的三件 ─────────────────────────────
  /* 编辑台的 #stage 与配装详情页的遮罩（admin/edit.js）载的是同一对填表页，
     规矩也是同一套。**写在这里、由 api 导出去**，不在 edit.js 里抄第二份。 */

  // 一份正文该落在哪一页填表页上。**由正文现算，不另存一个字段**：合集标记只有
  // 填表页的 setHead() 发得出，读回来与灌进去永远同属一档，存第二份只会有漂的风险。
  function slotOf (md) { return isSet(md) ? 'set' : 'one' }

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

  // ── 填表页常驻那一格 ───────────────────────────────────────────────
  /* 单套与合集各有一页填表页，**各留一个 iframe、切换时收起另一个**：改 src
     就是整页重载，而那正是这个函数存在的理由。

     载进来之后把它当成右栏的一部分：站头与页脚收掉，高度随内容走、不出第二条滚动条。
     版心照填表页自己的（单套 1060、合集 1296），右栏更宽时两侧留白居中，页头与它
     共用同一根左缘；右栏窄过填表页的最小宽度（单套 1104、合集 1340）时整格横向滚，
     不压扁填表页。 */
  var FORM_MIN = { one: 1104, set: 1340 }
  var FORM_WRAP = { one: 1060, set: 1296 }
  function stageFrame (kind) {
    kind = kind || 'one'
    ;[].forEach.call($('stage').querySelectorAll('iframe.prev'), function (f) {
      f.hidden = f.dataset.kind !== kind
    })
    var fr = $('stage').querySelector('iframe.prev[data-kind="' + kind + '"]')
    if (fr) return fr
    fr = h('iframe', { class: 'prev', 'data-kind': kind, title: kind === 'set' ? '合集填表页' : '配装填表页',
      scrolling: 'no', style: 'min-width:' + FORM_MIN[kind] + 'px' })
    fr.src = '../' + formSrc(kind)
    $('stage').appendChild(fr)
    return fr
  }
  function fitForm (fr) {
    var d = fr.contentDocument
    var st = d.createElement('style')
    st.textContent = '.site-head,.site-foot{display:none!important}'
      + 'body{min-height:0!important;background:transparent!important}'
      + 'main{padding-top:4px!important}'
    d.head.appendChild(st)
    var fit = function () { if (!fr.hidden) fr.style.height = d.documentElement.scrollHeight + 'px' }
    new fr.contentWindow.ResizeObserver(fit).observe(d.body)
    fit()
  }

  // #stage 那一格里现在是什么样。还没建过、或者还没载完就返回 null。
  function formOf (kind) {
    var fr = $('stage').querySelector('iframe.prev[data-kind="' + kind + '"]')
    if (!fr || !fr.dataset.ready) return null
    return readForm(fr.contentWindow)
  }

  /* 填表页那一格现在装着谁：fed 是灌进去的那一份，base 是刚灌完时读回来的样子。
     **脏判据比的是 base 不是 fed**：load() 会把旧键归一化，拿灌进去那份比，
     会在没人动过的稿子上误报，每换一条都弹一次确认。 */
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
  // **同一份就原地不动**：load() 会把 iframe 里滚到哪儿、光标在哪一格全部重置，
  // 而保存成功、换筛选、换标签都会再走一遍这里。判据是「灌进去的那一份没变」，
  // 不是「填表页里没变」——人正改着的那些字要留住。
  function feed (md, onerr) {
    var kind = slotOf(md)
    if (md === formFed) { stageFrame(kind); return }
    var fr = stageFrame(kind)
    var go = function () {
      try {
        formFed = md
        formBase = mountForm(fr.contentWindow, md, S.me.lv >= 2)
      } catch (err) { onerr(err) }
    }
    if (fr.dataset.ready) go()
    else {
      fr.onload = function () {
        fr.dataset.ready = '1'
        try { fitForm(fr) } catch (err) { onerr(err) }
        go()
      }
    }
  }

  // ── 记录 ───────────────────────────────────────────────────────────
  // 记录答的是「最近发生了什么」，主轴因此是时间，按结案的那一刻排（emark 结案时
  // 把 at 改写成结案时间）。同样是列表，点一条变成收件箱。
  function closed () {
    return S.edits.filter(function (e) { return e.ok === 1 || e.ok === -1 })
      .sort(function (a, b) { return (a.at || '') < (b.at || '') ? 1 : -1 })
  }
  function histList () {
    var q = V.hq.trim().toLowerCase()
    return closed().filter(function (e) {
      if (V.hok && e.ok !== V.hok) return false
      if (V.hdoc && e.doc !== V.hdoc) return false
      if (V.hwho && e.by !== V.hwho && e.okBy !== V.hwho) return false
      if (!q) return true
      return [pageOf(e.doc).title, e.by, e.okBy, e.before, e.after, whereText(e)].join('\n').toLowerCase().indexOf(q) >= 0
    })
  }
  function byDay (list) {
    var at = {}
    var out = []
    list.forEach(function (e) {
      var d = when(e.at).slice(0, 10)
      if (!at[d]) { at[d] = { day: dayOf(e.at), list: [] }; out.push(at[d]) }
      at[d].list.push(e)
    })
    return out
  }
  function verdict (e) { return h('span', { class: 'x-st ' + (e.ok === 1 ? 'pass' : 'no'), text: e.ok === 1 ? '通过' : '驳回' }) }

  function histView () {
    var box = $('views')
    box.textContent = ''
    var all = closed()
    var list = histList()
    var docs = []
    var who = []
    all.forEach(function (e) {
      if (docs.indexOf(e.doc) < 0) docs.push(e.doc)
      ;[e.by, e.okBy].forEach(function (n) { if (n && who.indexOf(n) < 0) who.push(n) })
    })
    var pass = all.filter(function (e) { return e.ok === 1 }).length
    box.appendChild(h('div', { class: 'sect' }, h('h1', { text: '记录' }),
      h('span', { class: 'x-dim', text: '已结案 ' + all.length + ' 处：通过 ' + pass + '，驳回 ' + (all.length - pass) })))
    box.appendChild(h('div', { class: 'bar' },
      h('div', { class: 'x-seg', role: 'group', 'aria-label': '结果' }, [[0, '全部'], [1, '通过'], [-1, '驳回']].map(function (o) {
        return h('button', { type: 'button', 'aria-pressed': V.hok === o[0] ? 'true' : 'false', onclick: function () { V.hok = o[0]; render() } }, o[1])
      })),
      select('页面', V.hdoc, [['', '全部页面']].concat(docs.map(function (d) { return [d, pageOf(d).title] })),
        function (v) { V.hdoc = v; render() }),
      select('人员', V.hwho, [['', '全部人员']].concat(who.map(function (n) { return [n, n] })),
        function (v) { V.hwho = v; render() }),
      searchBox('hq', '搜索改动内容', render)))
    if (S.more) box.appendChild(h('p', { class: 'more', text: '已达单次读取上限，部分记录未列出。' }))
    if (!list.length) {
      box.appendChild(h('div', { class: 'x-empty' }, h('h3', { text: all.length ? '没有符合条件的记录' : '暂无记录' }),
        h('p', { text: all.length ? '可调整筛选条件或清空搜索。' : '资料页改动审核后记录在此。' })))
    }
    byDay(list).forEach(function (g) {
      box.appendChild(h('p', { class: 'day', text: g.day }))
      box.appendChild(h('div', { class: 'grid hist' }, g.list.map(function (e) {
        return h('button', { type: 'button', class: 'tr', onclick: function () { openHist(e._id) } },
          verdict(e),
          h('span', { class: 'name' }, h('b', { text: pageOf(e.doc).title }), h('span', { class: 'x-dim', text: whereText(e) })),
          h('span', { class: 'x-dim', text: (e.by || '?') + ' 提交，' + (e.okBy || '?') + ' 审核' }),
          h('span', { class: 'at', text: when(e.at).slice(11) }))
      })))
    })
    refocus(box)
  }

  function histInbox () {
    var e0 = S.edits.filter(function (e) { return e._id === V.hsel })[0]
    if (!e0) {
      V.hsel = null
      history.replaceState(stateOf(), '', urlOf())
      return render()
    }
    drawHistQueue()
    $('detail').style.removeProperty('--dw')
    $('stage').hidden = true
    $('stage-foot').textContent = ''
    detailHead([
      h('p', { class: 'crumb', text: trail(e0.doc) }),
      h('h2', { text: whereText(e0) }),
      h('p', { class: 'meta' }, verdict(e0), h('span', { text: (e0.by || '?') + ' 提交；' + (e0.okBy || '?') + ' 于 ' + when(e0.at).slice(5)
        + (e0.ok === 1 ? ' 通过' : ' 驳回') }))
    ], [pageOf(e0.doc).url ? h('a', { class: 'x-btn quiet', href: '../' + pageOf(e0.doc).url, target: '_blank', rel: 'noopener' }, '打开页面') : null])
    var pane = $('pane')
    pane.hidden = false
    pane.textContent = ''
    histBody(e0).then(function (node) {
      if (V.hsel === e0._id) { pane.textContent = ''; pane.appendChild(node) }
    }, function (err) {
      pane.textContent = ''
      pane.appendChild(h('div', { class: 'x-alert', role: 'alert' }, h('p', null, h('b', { text: '读取失败。' }), ' ' + err.message)))
    })
  }

  function drawHistQueue () {
    var q = $('queue')
    q.textContent = ''
    q.appendChild(h('div', { class: 'q-top' },
      h('div', { class: 'q-back' }, btn('← 列表', 'quiet sm', { onclick: function () { toList() } }), kbd('Esc'),
        h('span', { class: 'keys' }, kbd('J'), ' ', kbd('K'), ' 上下切换')),
      searchBox('hq', '搜索页面、人员或改动内容', drawHistQueue)))
    var list = h('div', { class: 'q-list' })
    var groups = byDay(histList())
    groups.forEach(function (g) {
      list.appendChild(h('p', { class: 'q-sec' }, h('span', { text: g.day }), h('span', { text: String(g.list.length) })))
      g.list.forEach(function (e) {
        var w = whereOf(e)
        list.appendChild(h('button', { type: 'button', class: 'item' + (V.hsel === e._id ? ' on' : ''), onclick: function () { openHist(e._id) } },
          h('span', { class: 'l1' }, h('b', { text: w.id[w.id.length - 1] + (w.col ? ' · ' + w.col : '') }), verdict(e)),
          h('span', { class: 'l2' }, h('span', { text: pageOf(e.doc).title }), h('span', { text: '审核：' + (e.okBy || '?') }),
            h('span', { text: when(e.at).slice(11) }))))
      })
    })
    if (!groups.length) list.appendChild(h('p', { class: 'q-none', text: '没有符合条件的记录。' }))
    q.appendChild(list)
    refocus(q)
  }

  // 一处改动的记录里 before/after 都还在，结案也不清空——历史就是它本身，不必再问。
  // 早先那批整篇快照结案时只留下一段增删字符串，仍要去 hist 取。
  function histBody (e) {
    if (e.after !== undefined) return Promise.resolve(rowView(e))
    return call('hist', { id: e._id }).then(function (r) {
      var box = h('div', { class: 'x-diff' })
      ;(r.diff || '（无增删）').split('\n').forEach(function (l) {
        box.appendChild(h('div', { class: l.charAt(0) === '-' ? 'del' : l.charAt(0) === '+' ? 'add' : 'ctx' },
          h('span', { html: D().paint(l.slice(2)) })))
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
    // 职业那一行写成「猎人#主键」：主键跟在 # 后面，slug 只要职业名。
    var m = /^职业：\s*([^#\s]+)/m.exec(md)
    var tail = (m && LATIN[m[1]]) || 'build'
    var head = ''
    for (var i = 0; i < 8; i++) head += RAND.charAt(Math.floor(Math.random() * RAND.length))
    return head + '-' + tail
  }

  // ── 编辑者 ─────────────────────────────────────────────────────────
  var LV_CAN = {
    1: '在资料页提交改动，查看待审内容与审核记录，申请移除已上线的配装。',
    2: '另可保存、通过或驳回配装投稿与资料页改动，删除单条驳回稿。',
    3: '权限目前与审核员相同。',
    4: '另可管理编辑者名单，并一次清空全部驳回稿。'
  }
  // eds 那一路的 forbidden 说的是「动了同级或更高的人」，不是令牌过期——这里自己翻，
  // 不走 say()：那一条会当成登录失效清掉令牌。
  var ED_MSG = { forbidden: '只能调整级别低于本人的编辑者', 'bad lv': '级别不合法', 'bad uid': 'UID 不能为空' }
  function edSay (e) { return ED_MSG[e.message] || MSG[e.message] || e.message }

  /* 每人做过什么，从已经拉进来的改动与投稿里现数，不另发请求。提交按 uid 认（改名
     不影响）；审核只记了名字，按当前名字认，改名之前审过的不计入。 */
  function activity (u) {
    var sub = 0
    var rev = 0
    var last = ''
    S.edits.forEach(function (e) {
      if (e.uid === u._id) { sub++; if ((e.at || '') > last) last = e.at }
      if (e.ok !== 0 && e.okBy === u.name) { rev++; if ((e.at || '') > last) last = e.at }
    })
    S.subs.forEach(function (s) {
      if (Number(s.ok) !== 0 && s.okBy === u.name) { rev++; if ((s.at || '') > last) last = s.at }
    })
    return ['提交 ' + sub + ' 处', '审核 ' + rev + ' 条', last ? '最近活动 ' + when(last).slice(5, 10) : '尚无活动']
  }

  var edsCache = null
  var renaming = ''
  function edsView (fresh) {
    var box = $('views')
    if (!edsCache || fresh) {
      if (!edsCache) {
        box.textContent = ''
        box.appendChild(h('div', { class: 'eds' }, h('main', null, h('i', { class: 'sk', style: 'height:22px;width:120px' }),
          h('div', { class: 'people' }, [0, 1, 2, 3].map(function () { return h('i', { class: 'sk', style: 'height:40px;margin:16px 0' }) })))))
      }
      return call('eds', { op: 'list' }).then(function (r) {
        edsCache = r.eds
        if (V.view === 'eds') edsView()
      }, function (e) {
        box.textContent = ''
        box.appendChild(h('div', { class: 'x-alert', role: 'alert' }, h('p', null, h('b', { text: '读取编辑者名单失败。' }), ' ' + edSay(e)),
          btn('重试', '', { onclick: function () { edsView(true) } })))
      })
    }
    box.textContent = ''
    var grantable = [1, 2, 3, 4].filter(function (i) { return i < S.me.lv })
    var list = edsCache.slice().sort(function (a, b) { return Number(b.lv) - Number(a.lv) || String(a.name).localeCompare(String(b.name)) })
    var main = h('main', null,
      h('div', { class: 'eds-head' }, h('h1', { text: '编辑者' }), h('span', { class: 'x-dim', text: list.length + ' 人' }),
        V.add ? null : btn('添加编辑者', '', { onclick: function () { V.add = true; edsView() } })))
    if (V.add) main.appendChild(addPanel(grantable))
    main.appendChild(h('div', { class: 'people' }, list.map(function (u) { return person(u, grantable) })))
    box.appendChild(h('div', { class: 'eds' }, main,
      h('aside', { class: 'levels' },
        h('h3', { text: '级别与权限' }),
        h('dl', null, [1, 2, 3, 4].map(function (i) { return h('div', null, h('dt', { text: LV[i] }), h('dd', { text: LV_CAN[i] })) })),
        h('p', { text: '仅可调整级别低于本人的编辑者。改名不追溯历史，已有记录保留当时的名称。移除仅删除名单条目，其提交与审核记录保留。' }))))
    var focus = box.querySelector('[autofocus]')
    if (focus) focus.focus()
  }

  function setEd (row, body, done) {
    Array.prototype.forEach.call(row.querySelectorAll('button, input'), function (b) { b.disabled = true })
    return call('eds', body).then(function () {
      return edsView(true).then(function () { if (done) tip(document.querySelector('.eds-head'), done) })
    }, function (e) {
      Array.prototype.forEach.call(row.querySelectorAll('button, input'), function (b) { b.disabled = false })
      tip(row, edSay(e), 1)
    })
  }

  function person (u, grantable) {
    var lv = Number(u.lv)
    var mine = lv >= S.me.lv
    var row = h('div', { class: 'person' })
    var who = h('div', { class: 'who' })
    if (renaming === u._id) {
      var input = h('input', { class: 'x-in', value: u.name, 'aria-label': '新名称', autofocus: true })
      var save = function () {
        var name = input.value.trim()
        if (!name || name === u.name) { renaming = ''; return edsView() }
        renaming = ''
        // 改名与加人是同一个动作，级别原样带回去——那个动作一次写整条，不带 lv
        // 会被当成「改成 undefined」挡下来。
        setEd(row, { op: 'set', uid: u._id, name: name, lv: lv }, '已改名为「' + name + '」')
      }
      input.onkeydown = function (ev) {
        if (ev.key === 'Enter') save()
        if (ev.key === 'Escape') { renaming = ''; edsView() }
      }
      who.appendChild(h('div', { class: 'x-acts' }, input, btn('保存', 'sm', { onclick: save }),
        btn('取消', 'quiet sm', { onclick: function () { renaming = ''; edsView() } })))
    } else {
      who.appendChild(h('b', null, u.name || '未命名', u._id === S.me.uid ? h('small', { text: '本人' }) : null))
    }
    who.appendChild(h('span', { class: 'line' }, h('code', { text: u._id }), activity(u).map(function (t) { return h('span', { text: t }) })))
    put(row, [h('span', { class: 'mono-mark', 'aria-hidden': 'true', text: String(u.name || '?').charAt(0) }), who])
    if (mine) {
      put(row, [h('span', { class: 'fixed', text: LV[lv] || String(lv) }), h('span', { class: 'x-acts' })])
    } else {
      put(row, [h('div', { class: 'x-seg', role: 'group', 'aria-label': u.name + ' 的级别' }, grantable.map(function (i) {
        return h('button', { type: 'button', 'aria-pressed': i === lv ? 'true' : 'false', title: LV_CAN[i],
          onclick: function () {
            if (i === lv) return
            setEd(row, { op: 'set', uid: u._id, name: u.name, lv: i }, u.name + ' 已改为' + LV[i])
          } }, LV[i])
      })),
      h('span', { class: 'x-acts' },
        btn('改名', 'quiet sm', { onclick: function () { renaming = u._id; edsView() } }), cut(),
        btn('移除', 'quiet sm', { onclick: function () {
          if (!window.confirm('从名单中移除「' + u.name + '」？其提交与审核记录保留。')) return
          setEd(row, { op: 'del', uid: u._id }, '已移除「' + u.name + '」')
        } }))])
    }
    return row
  }

  function addPanel (grantable) {
    var level = grantable[0]
    var uid = h('input', { class: 'x-in mono', name: 'uid', required: true, placeholder: '对方页面上显示的 UID', autofocus: true })
    var name = h('input', { class: 'x-in', name: 'name', required: true, placeholder: '显示在审核记录中' })
    var seg = h('div', { class: 'x-seg', role: 'group', 'aria-label': '级别' })
    var drawSeg = function () {
      seg.textContent = ''
      grantable.forEach(function (i) {
        seg.appendChild(h('button', { type: 'button', 'aria-pressed': i === level ? 'true' : 'false', title: LV_CAN[i],
          onclick: function () { level = i; drawSeg() } }, LV[i]))
      })
    }
    drawSeg()
    var form = h('form', { class: 'add-panel' },
      h('p', { text: '对方需先登录编辑台一次，页面会显示其 UID。' }),
      h('div', { class: 'row' },
        h('label', { class: 'x-field' }, h('span', { text: 'UID' }), uid),
        h('label', { class: 'x-field' }, h('span', { text: '名称' }), name),
        h('div', { class: 'x-field' }, h('span', { text: '级别' }), seg)),
      h('div', { class: 'x-acts' }, h('button', { type: 'submit', class: 'x-btn fill' }, '添加'),
        btn('取消', 'quiet', { onclick: function () { V.add = false; edsView() } })),
      h('p', { class: 'x-tip' }))
    form.onsubmit = function (ev) {
      ev.preventDefault()
      var n = name.value.trim()
      call('eds', { op: 'set', uid: uid.value.trim(), name: n, lv: level }).then(function () {
        V.add = false
        return edsView(true).then(function () { tip(document.querySelector('.eds-head'), '已添加「' + n + '」') })
      }, function (e) { tip(form, edSay(e), 1) })
    }
    return form
  }

  // ── 装载 ───────────────────────────────────────────────────────────
  function load () {
    return Promise.all([call('docs'), call('edits'), call('subs')]).then(function (r) {
      S.docs = r[0].docs
      S.edits = r[1].edits.map(function (e) { e.ok = Number(e.ok); return e })
      S.subs = r[2].subs
      // 后端那几条查询没有 orderBy，触到 limit 就静默截断。它报一位，这里显形。
      S.more = !!(r[0].more || r[1].more || r[2].more)
      PEND = {}
      judgeErr = {}
      badges()
    })
  }

  // 顶栏「审核」旁那个数：待审的配装与有待审改动的资料页，与状态条上「待审」那一档同数。
  function badges () {
    var n = stageCount('wait', builds(), pendPages())
    $('n-wait').textContent = n ? String(n) : ''
  }

  // 载入中那一屏：与列表同形的灰块。
  function skeleton () {
    var box = $('views')
    box.hidden = false
    box.textContent = ''
    var rows = []
    for (var i = 0; i < 9; i++) {
      rows.push(h('div', { class: 'tr', style: 'cursor:default' }, [0, 1, 2, 3, 4, 5, 6].map(function (j) {
        return h('i', { class: 'sk', style: 'height:' + (j ? 9 : 12) + 'px;width:' + (j ? 40 + ((i * 7 + j * 13) % 50) : 30 + (i * 11 % 30)) + '%' })
      })))
    }
    put(box, [h('div', { class: 'flow' }, [0, 1, 2, 3, 4].map(function () {
      return h('div', { class: 'stage', style: 'cursor:default' }, h('i', { class: 'sk', style: 'width:36px;height:28px' }),
        h('i', { class: 'sk', style: 'width:48px;height:12px;margin-top:6px' }))
    })), h('div', { class: 'bar' }, h('i', { class: 'sk', style: 'width:220px;height:32px' }), h('i', { class: 'sk', style: 'width:260px;height:32px' })),
    h('div', { class: 'sect' }, h('i', { class: 'sk', style: 'width:60px;height:14px' })),
    h('div', { class: 'grid builds' }, rows)])
  }

  function boot () {
    return call('me').then(function (me) {
      S.me = me
      if (!me.lv) {
        // 登录了但不在名单里：同一个版面，右边换成 UID。
        document.documentElement.classList.remove('signed')
        $('login').hidden = true
        $('stranger').hidden = false
        $('my-uid').textContent = me.uid
        return null
      }
      $('gate').hidden = true
      $('top').hidden = false
      $('me-name').textContent = me.name || '未登记'
      $('me-lv').textContent = LV[me.lv] || '无权限'
      // 编辑者那一屏只给超级管理员：云函数的 LEVEL.eds 是同一个门槛，不靠前端藏。
      document.querySelector('[data-view="eds"]').hidden = me.lv < 4
      skeleton()
      // 链接指的那一条（?b= 配装、?p= 资料页）还在就直接开在它上面，找不到就退回
      // 列表，不报错——收到链接的人多半只是晚来了一步。**起手那一格必须是列表**：
      // 上面另压一格详情，退回来才有列表接着。
      var qs = new URLSearchParams(location.search)
      var want = qs.get('b') ? 'b:' + qs.get('b') : qs.get('p') ? 'p:' + qs.get('p') : null
      history.replaceState(stateOf(), '', urlOf())
      return load().then(function () {
        if (want && lookup(want)) {
          V.sel = want
          history.pushState(stateOf(), '', urlOf())
        }
        render()
      })
    })
  }

  // ── 登录页 ─────────────────────────────────────────────────────────
  // 只有账号密码一条。**账号由管理员在云开发控制台手工建**，没有自助注册：
  // 网关默认策略对任何自注册的注册用户都放行云函数，少一条注册入口就少一整类要挡的东西。
  function gate () {
    var pw = $('f-pw')
    pw.onsubmit = function (ev) {
      ev.preventDefault()
      var t = $('gate-tip')
      t.classList.remove('bad')
      t.textContent = '登录中…'
      Array.prototype.forEach.call(pw.querySelectorAll('.x-in'), function (n) { n.classList.remove('bad') })
      auth('/auth/v1/signin', {
        username: pw.username.value.trim(),
        password: pw.password.value
      }).then(function (j) {
        tok(j)
        t.textContent = ''
        return boot()
      }).catch(function (e) {
        t.classList.add('bad')
        // 认证服务拒了就是账号或密码不对；别的（断网、网关报错）照原话说出来。
        t.textContent = e.denied ? '用户名或密码错误。' : '登录失败：' + e.message
        if (e.denied) Array.prototype.forEach.call(pw.querySelectorAll('.x-in'), function (n) { n.classList.add('bad') })
      })
    }
    $('copy-uid').onclick = function () {
      var done = function (ok) { tip($('stranger'), ok ? '已复制' : '复制失败，请手动选中后复制', !ok) }
      if (navigator.clipboard) navigator.clipboard.writeText($('my-uid').textContent).then(function () { done(true) }, function () { done(false) })
      else done(false)
    }
    $('reload').onclick = function () { location.reload() }
    $('switch').onclick = function () { tok(null); location.reload() }
  }

  function start () {
    // 这两条只在编辑台上挂：资料页开编辑态时 edit.js 也载本文件，只为借几件纯函数。
    window.addEventListener('popstate', function (ev) {
      if (!S.me || !S.me.lv) return
      var st = ev.state || {}
      morph({ view: st.v || 'queue', sel: st.sel || null, hsel: st.hsel || null })
    })

    // 收件箱里的键盘：Esc 回列表，J / K 换上下条。光标在输入框里时不接。
    // 填表页是 iframe，里面打字的按键到不了这一页，不会误触。
    document.addEventListener('keydown', function (ev) {
      var t = ev.target
      if (!inbox() || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return
      if (ev.key === 'Escape') return toList()
      if (ev.key !== 'j' && ev.key !== 'k') return
      var ids = V.view === 'hist' ? histList().map(function (e) { return e._id }) : queueIds()
      var cur = V.view === 'hist' ? V.hsel : V.sel
      var i = ids.indexOf(cur) + (ev.key === 'j' ? 1 : -1)
      if (i < 0 || i >= ids.length) return
      if (V.view === 'hist') openHist(ids[i])
      else open(ids[i])
    })
    $('out').onclick = function () { tok(null); location.reload() }
    $('tabs').onclick = function (ev) {
      var b = ev.target.closest('[data-view]')
      if (b) tab(b.dataset.view)
    }
    gate()
    // 有令牌就直接进，登录真的失效（forbidden）才落回登录页。**认证失败要把那个类摘掉**，
    // 否则登录页被 CSS 藏着，人看到的是一片空白。断网或后端报别的错时令牌留着，把原因
    // 摆出来：清掉令牌只会让人为一次网络抖动重新输密码。
    if (tok()) {
      boot().catch(function (e) {
        if (e.message === 'forbidden') {
          tok(null)
          document.documentElement.classList.remove('signed')
          return
        }
        $('gate').hidden = true
        var box = $('views')
        box.hidden = false
        box.textContent = ''
        box.appendChild(h('div', { class: 'x-alert', role: 'alert' },
          h('p', null, h('b', { text: '载入失败：' }), say(e) + '。登录状态仍然有效，可稍后重试。'),
          btn('重试', '', { onclick: function () { location.reload() } })))
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
  // when 也是给离线断言的：库里存 UTC，显示要换成北京时间。refresh 同理：什么时候算登录
  // 失效、并发时换几次令牌，由它一处决定。nextWait 与 changed 也是：审完摊开哪一条、
  // 对照加亮哪一段。
  //
  // 后五件是给 admin/edit.js 那条配装编辑路的：它在配装页上现载这一份，单套与合集
  // 怎么分、填表页怎么载、怎么读、错误码怎么翻，两条路各抄一份就会漂。slotOf 那条
  // 判据还要与 convert-build.py 的 split_set() 逐字一致。
  var api = { lint: lint,
              missing: missing, builds: builds, when: when, refresh: refresh, start: start,
              nextWait: nextWait, changed: changed,
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
