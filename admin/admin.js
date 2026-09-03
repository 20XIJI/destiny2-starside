// 在线编辑台。资料源稿在库里改、在库里审，落盘、构建与部署仍在本机（tools/sync.py）。
//
// 身份认证 v2 是裸 HTTP 接口，**不引 @cloudbase/js-sdk**：auth-only 入口 65 KB gzip，
// 比整站首屏（46 KB）还大，而这里要的只有 signin 与 refresh 两个 POST。
;(function () {
  'use strict'

  var API = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api'
  var AUTH = 'https://dea-mods-d1g0j2rile2323f73.api.tcloudbasegateway.com'
  var T = window.starsideTerms ||
    { terms: [], tokens: {}, classes: [], pageClasses: {}, guard: [], items: [], keep: [], g6: [] }

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

  // 网关的请求体上限是 100 KB，而最长的源稿 159 KB。提交发的是整篇快照，所以正文
  // 一律压过再发，与 tools/sync.py 那一侧对称；**不设「多大才压」的阈值**，一个分支
  // 就是一个会判错的地方。
  function gzip (text) {
    var cs = new CompressionStream('gzip')
    var w = cs.writable.getWriter()
    w.write(new TextEncoder().encode(text))
    w.close()
    return new Response(cs.readable).arrayBuffer().then(function (buf) {
      var u = new Uint8Array(buf)
      var s = ''
      // 分段拼：String.fromCharCode.apply 对几万个参数会栈溢出。
      for (var i = 0; i < u.length; i += 8192) {
        s += String.fromCharCode.apply(null, u.subarray(i, i + 8192))
      }
      return btoa(s)
    })
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

  // ── 按块拆源稿 ─────────────────────────────────────────────────────
  // **不是「一行一块」**：artifact-mods.md 里有一处 {el-kinetic|…} 跨 4 行。
  // 逐行累加，花括号深度回到 0 才收一块，拼回去就是 join 换行。
  function blocks (md) {
    var out = []
    var buf = []
    var d = 0
    md.split('\n').forEach(function (line) {
      buf.push(line)
      var re = /\{[\w-]+\||\}/g
      var m
      while ((m = re.exec(line))) d = m[0] === '}' ? Math.max(0, d - 1) : d + 1
      if (!d) { out.push(buf.join('\n')); buf = [] }
    })
    if (buf.length) out.push(buf.join('\n'))
    return out
  }

  // 与 markup.inline() 同一条规则：一趟栈式扫描，支持嵌套。正则做不干净。
  function paint (t) {
    var out = ''
    var d = 0
    var i = 0
    while (i < t.length) {
      var m = /^\{([\w-]+)\|/.exec(t.slice(i))
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
      var m = /^\{([\w-]+)\|/.exec(t.slice(i))
      if (m) { stack.push(i); i += m[0].length; continue }
      if (t.charAt(i) === '}' && stack.length) span.push([stack.pop(), i])
      i++
    }
    return span
  }

  function inside (span, a, b) {
    return span.some(function (s) { return a >= s[0] && b <= s[1] })
  }

  // 每一块归哪张表：遇到分隔行就把上一块（表头）的格数记下，离开表格即清零。
  // **一页有好几张表**，拿第一张的列数比全篇会把后面每张表整批报成格数不对。
  function heads (bs) {
    var out = bs.map(function () { return { cols: 0, head: false } })
    var cur = 0
    bs.forEach(function (b, i) {
      if (RULE_LINE.test(b.trim())) {
        cur = cells(bs[i - 1] || '')
        // 分隔行上面那一块就是表头。**块是一行一个**，分隔行落在下一块里，
        // 在块内看下一行永远判不出表头——32 处列名曾因此被要求着色。
        if (out[i - 1]) out[i - 1].head = true
      } else if (b.charAt(0) !== '|') {
        cur = 0
      }
      out[i].cols = cur
    })
    return out
  }

  // 按竖线切格，但记花括号深度——{ico|…} 内部也有竖线，裸切会让带图标的行错位一格。
  function cells (line) {
    var n = 0
    var d = 0
    for (var i = 0; i < line.length; i++) {
      var m = /^\{[\w-]+\|/.exec(line.slice(i))
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

  // errors 一直显示，warns 只在编辑那一块时显示——不然一屏全是「该着色」。
  function lint (text, at, g6, ok) {
    at = at || { cols: 0, head: false }
    ok = ok || T.classes
    var errs = []
    var warns = []
    var m

    var d = 0
    var re = /\{[\w-]+\||\}/g
    while ((m = re.exec(text))) d = m[0] === '}' ? Math.max(0, d - 1) : d + 1
    if (d) errs.push('花括号没闭合，少 ' + d + ' 个右括号')

    // G3：token 必须在 site.css 里有对应的类
    var t2 = /\{([\w-]+)\|/g
    while ((m = t2.exec(text))) {
      if (ok.indexOf(m[1]) < 0) errs.push('token「' + m[1] + '」在这一页的样式表里没有定义')
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
    T.terms.forEach(function (row) {
      if (!row[1]) return
      var one = new RegExp('\\{([\\w-]+)\\|' + row[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g')
      var k
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
      T.items.forEach(function (row) {
        var at = line.indexOf(row[0])
        if (at < 0 || at < end) return
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
  }
  function back (label, fn) {
    var b = el('button', 'chip', '← ' + label)
    b.type = 'button'
    b.onclick = fn
    return b
  }
  function tip (node, msg, bad) {
    var p = node.querySelector('.tip')
    if (!p) { p = el('p', 'tip'); node.appendChild(p) }
    p.textContent = msg
    p.style.color = bad ? 'var(--c-enemy)' : ''
  }

  // ── 源稿清单 ───────────────────────────────────────────────────────
  function docsView () {
    title('源稿 · ' + S.docs.length + ' 篇')
    var wrap = el('section', 'block')
    var q = el('input', 'tool-search')
    q.placeholder = '筛选'
    q.type = 'search'
    wrap.appendChild(q)
    var rows = el('div', 'rows')
    wrap.appendChild(rows)

    var open = {}
    S.edits.forEach(function (e) { if (e.ok === 0) (open[e.doc] = open[e.doc] || []).push(e) })

    S.docs.slice().sort(function (a, b) { return a._id < b._id ? -1 : 1 }).forEach(function (d) {
      var b = el('button')
      b.type = 'button'
      b.dataset.k = d._id
      var id = el('span', 'id')
      var cut = d._id.lastIndexOf('/') + 1
      if (cut) id.appendChild(el('i', 'dim', d._id.slice(0, cut)))
      id.appendChild(document.createTextNode(d._id.slice(cut)))
      b.appendChild(id)
      ;(open[d._id] || []).forEach(function (e) {
        b.appendChild(el('span', 'flag pend', (e.by || '?') + ' 待审'))
      })
      b.appendChild(el('span', 'meta', (d.at || '').slice(0, 10)))
      b.onclick = function () { openDoc(d._id) }
      rows.appendChild(b)
    })
    q.oninput = function () {
      var v = q.value.trim()
      Array.prototype.forEach.call(rows.children, function (n) {
        n.hidden = !!v && n.dataset.k.indexOf(v) < 0
      })
    }
    show(wrap)
  }

  // ── 编辑器 ─────────────────────────────────────────────────────────
  function openDoc (id) {
    call('doc', { id: id }).then(editor, function (e) { alert(e.message) })
  }

  function editor (doc) {
    var wrap = el('section', 'block')
    var bar = el('div', 'acts')
    bar.appendChild(back('源稿', docsView))
    wrap.appendChild(bar)
    title(doc._id)

    // 我在这一篇上未结的那一条草稿或待审，接着改；没有就从库里的正文起手。
    // **不做草稿**：要改就当场改完再提。挂着的稿子越久，它起手那一版越可能
    // 已经被别人通过的改动顶掉。

    var list = el('div', 'blocks')
    wrap.appendChild(list)

    var bs = []
    var head = []

    function render (md) {
      bs = blocks(md)
      head = heads(bs)
      list.textContent = ''
      bs.forEach(function (t, i) { list.appendChild(cell(t, i)) })
    }

    // G6 正查只覆盖 references/docs 去掉 changelog 与 palette，与 items.pages() 同一份。
    var g6 = doc._id.indexOf('docs/') === 0 && T.g6.indexOf(doc._id.slice(5)) >= 0
    // 每页能用的 class = site.css 那份，加上这一页自己样式表里多出来的（{ico|…}
    // 只在 ability-cooldown 有）。只按 site.css 判会把九千多处整批报成没定义。
    var ok = T.classes.concat(T.pageClasses[doc._id] || [])

    // 「该着色」那类提示只在编辑这一块时列出来（all=true）——一屏都挂着的话，
    // 真正的错就淹没在里面了。
    function notes (text, all, i) {
      var r = lint(text, head[i], g6, ok)
      var ul = el('ul', 'notes')
      r.errs.forEach(function (x) { ul.appendChild(el('li', null, x)) })
      if (all) r.warns.forEach(function (x) { ul.appendChild(el('li', 'warn', x)) })
      return { bad: r.errs.length, ul: ul.children.length ? ul : null }
    }

    function cell (text, i) {
      var n = el('div', 'blk' + (text.trim() ? '' : ' empty'))
      n.innerHTML = paint(text) || ' '
      var r = notes(text, false, i)
      if (r.bad) n.classList.add('bad')
      if (r.ul) n.appendChild(r.ul)
      n.onclick = function (ev) {
        if (n.classList.contains('on') || ev.target.tagName === 'BUTTON') return
        edit(n, i)
      }
      return n
    }

    function edit (n, i) {
      n.classList.add('on')
      n.textContent = ''
      var ta = el('textarea')
      ta.value = bs[i]
      ta.rows = Math.min(20, bs[i].split('\n').length + 1)
      n.appendChild(ta)
      n.appendChild(palette(ta))
      // 「该着色」那类提示只在编辑这一块时列出来——一屏都挂着的话，真错就淹没了。
      var hint = notes(bs[i], true, i).ul
      if (hint) n.appendChild(hint)
      ta.focus()
      ta.onblur = function () {
        // 失焦即收起。着色芯片按下去会先失焦，所以芯片自己 preventDefault。
        setTimeout(function () {
          if (n.contains(document.activeElement)) return
          bs[i] = ta.value
          n.replaceWith(cell(bs[i], i))
        }, 0)
      }
    }

    // 选中文字 → 点芯片 → 包成着色标记；选中的整段已经是一个标记就取消。
    function palette (ta) {
      var p = el('div', 'pal')
      Object.keys(T.tokens).sort().forEach(function (cls) {
        var b = el('button', cls, cls)
        b.type = 'button'
        b.onmousedown = function (ev) { ev.preventDefault() }
        b.onclick = function () { wrapSel(ta, cls) }
        p.appendChild(b)
      })
      return p
    }

    function wrapSel (ta, cls) {
      var a = ta.selectionStart
      var b = ta.selectionEnd
      if (a === b) return
      var v = ta.value
      var sel = v.slice(a, b)
      var one = /^\{([\w-]+)\|([\s\S]*)\}$/.exec(sel)
      var put = one ? one[2] : '{' + cls + '|' + sel + '}'
      ta.value = v.slice(0, a) + put + v.slice(b)
      ta.setSelectionRange(a, a + put.length)
      ta.focus()
    }

    render(doc.md)

    var acts = el('div', 'acts')
    var send = el('button', 'chip', '提交待审')
    send.type = 'button'
    send.onclick = function () {
      var md = bs.join('\n')
      if (md === doc.md) { tip(wrap, '与库里那份一字不差，没什么可提的'); return }
      send.disabled = true
      gzip(md).then(function (gz) {
        // base 带上起手那一版的 hash：中间被别人的改动顶掉了，后端当场拒。
        return call('put', { doc: doc._id, gz: gz, base: doc.hash })
      }).then(load).then(function () {
        send.disabled = false
        tip(wrap, '提交了，等审核')
      }, function (e) {
        send.disabled = false
        tip(wrap, e.message === 'stale'
          ? '这一篇在你打开之后被改过了，回去重新打开再改——照旧文改出来的稿子一旦通过，会把那条改动整个回退掉'
          : '没提上：' + e.message, 1)
      })
    }
    acts.appendChild(send)
    wrap.appendChild(acts)

    show(wrap)
  }

  // ── 对照 ───────────────────────────────────────────────────────────
  // 块级 LCS。块数通常不变，但加一行表格就会整体错位，逐位比会把后面全标成改过。
  function lcs (a, b) {
    var n = a.length
    var m = b.length
    var d = []
    var i
    var j
    for (i = 0; i <= n; i++) d.push(new Array(m + 1).fill(0))
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1])
      }
    }
    var out = []
    i = 0
    j = 0
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push([' ', a[i]]); i++; j++ } else if (d[i + 1][j] >= d[i][j + 1]) {
        out.push(['-', a[i++]])
      } else {
        out.push(['+', b[j++]])
      }
    }
    while (i < n) out.push(['-', a[i++]])
    while (j < m) out.push(['+', b[j++]])
    return out
  }

  // 结案时留在库里的那一段。**只留增删两侧**，上下文那几块不必存。
  function diffText (base, md) {
    return lcs(blocks(base), blocks(md))
      .filter(function (o) { return o[0] !== ' ' })
      .map(function (o) { return o[0] + ' ' + o[1] }).join('\n')
  }

  function diffView (base, md) {
    var box = el('div', 'diff')
    var ops = lcs(blocks(base), blocks(md))
    ops.forEach(function (o, i) {
      var n
      if (o[0] === ' ') {
        // 只列变了的块，前后各留一块当锚点，不然读者不知道改的是哪一段。
        var near = ops[i - 1] && ops[i - 1][0] !== ' '
        var next = ops[i + 1] && ops[i + 1][0] !== ' '
        if (!near && !next) return
        n = el('div', 'ctx')
      } else {
        n = el('div', o[0] === '-' ? 'del' : 'add')
      }
      n.innerHTML = paint(o[1])
      box.appendChild(n)
    })
    if (!box.children.length) box.appendChild(el('div', 'ctx', '（正文没变）'))
    return box
  }

  // ── 待审 ───────────────────────────────────────────────────────────
  function queueView () {
    title('待审')
    var wrap = el('section', 'block')
    wrap.appendChild(el('h2', 'sect-label', '文档改动'))

    var pend = S.edits.filter(function (e) { return e.ok === 0 })
    var by = {}
    pend.forEach(function (e) { (by[e.doc] = by[e.doc] || []).push(e) })
    if (!pend.length) wrap.appendChild(el('p', 'lede', '没有待审的文档改动'))

    Object.keys(by).sort().forEach(function (doc) {
      var pane = el('div', 'pane')
      pane.appendChild(el('h3', null, doc + (by[doc].length > 1 ? '  ·  ' + by[doc].length + ' 份并存' : '')))
      var rows = el('div', 'rows')
      by[doc].forEach(function (e) {
        var b = el('button')
        b.type = 'button'
        b.appendChild(el('span', 'id', (e.by || '?') + (e.note ? '：' + e.note : '')))
        b.appendChild(el('span', 'meta', (e.at || '').slice(0, 16).replace('T', ' ')))
        b.onclick = function () { editDetail(e._id) }
        rows.appendChild(b)
      })
      pane.appendChild(rows)
      wrap.appendChild(pane)
    })

    var subs = S.subs.filter(function (s) { return Number(s.ok) === 0 })
    var sp = el('section', 'block')
    sp.appendChild(el('h2', 'sect-label', '配装投稿 · ' + subs.length))
    var sr = el('div', 'rows')
    subs.forEach(function (s) {
      var b = el('button')
      b.type = 'button'
      b.appendChild(el('span', 'id', (/^#\s+(.+)$/m.exec(s.md) || [0, s._id])[1]))
      b.appendChild(el('span', 'meta', (s.at || '').slice(0, 16).replace('T', ' ')))
      b.onclick = function () { subDetail(s) }
      sr.appendChild(b)
    })
    sp.appendChild(sr)
    wrap.appendChild(sp)
    show(wrap)
  }

  function editDetail (id) {
    call('edit', { id: id }).then(function (e) {
      var wrap = el('section', 'block')
      var bar = el('div', 'acts')
      bar.appendChild(back('待审', queueView))
      wrap.appendChild(bar)
      title(e.doc)
      wrap.appendChild(el('p', 'lede',
        (e.by || '?') + ' · ' + (e.at || '').slice(0, 16).replace('T', ' ') + (e.note ? ' · ' + e.note : '')))
      wrap.appendChild(diffView(e.base || '', e.md || ''))

      // 同篇还有别的待审时并排列出：通过一份会把其余整批驳回，得先看得见它们。
      var rest = S.edits.filter(function (x) { return x.doc === e.doc && x.ok === 0 && x._id !== e._id })
      if (rest.length) {
        var p = el('div', 'pane')
        p.appendChild(el('h3', null, '同篇另有 ' + rest.length + ' 份，通过这一份会把它们驳回'))
        var rows = el('div', 'rows')
        rest.forEach(function (x) {
          var b = el('button')
          b.type = 'button'
          b.appendChild(el('span', 'id', x.by || '?'))
          b.onclick = function () { editDetail(x._id) }
          rows.appendChild(b)
        })
        p.appendChild(rows)
        wrap.appendChild(p)
      }

      if (S.me.lv >= 2) {
        var acts = el('div', 'acts')
        var yes = el('button', 'chip', '通过')
        var no = el('button', 'chip', '驳回')
        yes.type = no.type = 'button'
        var mark = function (ok) {
          yes.disabled = no.disabled = true
          // diff 审核页已经算好了，原样带过去存进库里——后端不必再实现一遍 LCS。
          call('emark', { id: e._id, ok: ok, diff: diffText(e.base || '', e.md || '') })
            .then(load).then(queueView, function (err) {
              yes.disabled = no.disabled = false
              tip(wrap, '没改成：' + err.message, 1)
            })
        }
        yes.onclick = function () { mark(1) }
        no.onclick = function () { mark(-1) }
        acts.appendChild(yes)
        acts.appendChild(no)
        wrap.appendChild(acts)
      }
      show(wrap)
    }, function (err) { alert(err.message) })
  }

  // 配装投稿的渲染预览。builds/new/ 本身就是浏览器里的配装渲染器，载进来调
  // starsideForm.load(md) 再进预览态即可，不必把 Python 那份 render 搬上来。
  function subDetail (s) {
    var wrap = el('section', 'block')
    var bar = el('div', 'acts')
    bar.appendChild(back('待审', queueView))
    wrap.appendChild(bar)
    title((/^#\s+(.+)$/m.exec(s.md) || [0, '配装投稿'])[1])

    // 载进来的是**可以改的填表页**，不是一张只读的图。装备写错、描述要润色，
    // 审的人改完再通过比打回去让人重投快得多。**不替他按预览**——预览态下
    // #sheet.preview 把输入框与格子全设成 pointer-events: none，整页点不动；
    // 那一页右下角自己带着「预览配装」，想看成品点它即可。
    var fr = el('iframe', 'prev')
    fr.src = '../builds/new/index.html'
    fr.onload = function () {
      try {
        var w = fr.contentWindow
        w.starsideForm.load(s.md)
        // **把那一页自己的「投稿」摘掉**：它在审核页里按一下就是再投一份。
        var send = w.document.getElementById('send')
        if (send) send.remove()
      } catch (err) {
        tip(wrap, '填表页载不出来：' + err.message, 1)
      }
    }
    wrap.appendChild(fr)

    // 改后的那一份从填表页现读；读不出来（脚本没载好）就退回投稿原文，不交空的。
    function current () {
      try {
        var md = fr.contentWindow.starsideForm.read()
        return /^#\s+\S/.test(md) ? md : s.md
      } catch (e) {
        return s.md
      }
    }

    var src = el('details')
    src.appendChild(el('summary', null, '投稿原文'))
    var pre = el('pre')
    pre.textContent = s.md
    src.appendChild(pre)
    wrap.appendChild(src)

    if (S.me.lv >= 2) {
      var acts = el('div', 'acts')
      // slug 即文件名，也是点赞的 _id。预填成「八位随机串-职业」：这一格必填，
      // 而审的人多数时候不想在这里停下来想名字；重了后端当场拒，不会盖掉上一份。
      var season = el('select')
      seasons().forEach(function (x) { season.appendChild(new Option(x, x)) })
      var slug = el('input', 'tool-search')
      slug.value = defaultSlug(s.md)
      slug.pattern = '[a-zA-Z0-9][a-zA-Z0-9-]*'
      slug.required = true
      var yes = el('button', 'chip', '通过')
      var no = el('button', 'chip', '驳回')
      yes.type = no.type = 'button'
      var mark = function (ok) {
        yes.disabled = no.disabled = true
        var body = { id: s._id, ok: ok }
        if (ok === 1) {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(slug.value.trim())) {
            yes.disabled = no.disabled = false
            tip(wrap, 'slug 只能是字母、数字与连字符，且不以连字符开头', 1)
            return
          }
          body.season = season.value
          body.slug = slug.value.trim().toLowerCase()
          var md = current()
          if (md !== s.md) body.md = md      // 改过才带，没改就不占那趟请求的体积
        }
        call('smark', body).then(load).then(queueView, function (e) {
          yes.disabled = no.disabled = false
          tip(wrap, '没改成：' + e.message, 1)
        })
      }
      yes.onclick = function () { mark(1) }
      no.onclick = function () { mark(-1) }
      acts.appendChild(season)
      acts.appendChild(slug)
      acts.appendChild(yes)
      acts.appendChild(no)
      wrap.appendChild(acts)
      wrap.appendChild(el('p', 'lede',
        '上面那张表可以直接改，通过时落盘的是改后的那一份。'
        + '通过只在库里标状态，源稿由本机 tools/sync.py 落盘，跟着下一次构建上站。'))
    }
    show(wrap)
  }

  // ── 改动记录 ───────────────────────────────────────────────────────
  // 结案的那些。库里不再留两份全文，只留那几行增删，所以这一页答的正是
  // 「谁在什么时候把哪一篇的哪几行改成了什么」。全文的历史在 git 里。
  function histView () {
    title('改动记录')
    var wrap = el('section', 'block')
    var done = S.edits.filter(function (e) { return e.ok === 1 || e.ok === -1 })
      .sort(function (a, b) { return (b.at || '') < (a.at || '') ? -1 : 1 })
    if (!done.length) wrap.appendChild(el('p', 'lede', '还没有结案的改动'))
    var rows = el('div', 'rows')
    done.forEach(function (e) {
      var b = el('button')
      b.type = 'button'
      b.appendChild(el('span', 'flag ' + (e.ok === 1 ? 'pass' : 'no'), e.ok === 1 ? '通过' : '驳回'))
      var id = el('span', 'id')
      var cut = e.doc.lastIndexOf('/') + 1
      if (cut) id.appendChild(el('i', 'dim', e.doc.slice(0, cut)))
      id.appendChild(document.createTextNode(e.doc.slice(cut)))
      b.appendChild(id)
      b.appendChild(el('span', 'meta', (e.by || '?') + ' → ' + (e.okBy || '?')))
      b.appendChild(el('span', 'meta', (e.at || '').slice(0, 16).replace('T', ' ')))
      b.onclick = function () { histOne(e) }
      rows.appendChild(b)
    })
    wrap.appendChild(rows)
    show(wrap)
  }

  function histOne (e) {
    call('hist', { id: e._id }).then(function (r) {
      var wrap = el('section', 'block')
      var bar = el('div', 'acts')
      bar.appendChild(back('改动记录', histView))
      wrap.appendChild(bar)
      title(e.doc)
      wrap.appendChild(el('p', 'lede', (e.by || '?') + ' 提 · ' + (e.okBy || '?') +
        (e.ok === 1 ? ' 通过' : ' 驳回') + ' · ' + (e.at || '').slice(0, 16).replace('T', ' ')))
      var box = el('div', 'diff')
      ;(r.diff || '（没有留下增删）').split('\n').forEach(function (line) {
        var n = el('div', line.charAt(0) === '-' ? 'del' : line.charAt(0) === '+' ? 'add' : 'ctx')
        n.innerHTML = paint(line.slice(2))
        box.appendChild(n)
      })
      wrap.appendChild(box)
      show(wrap)
    }, function (err) { alert(err.message) })
  }

  // 赛季清单从源稿清单现取：builds/<赛季目录>/<slug> 里那一截，不另存一份。
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
      var add = el('button', 'chip go', '加进白名单')
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
      $('n-queue').textContent = String(
        S.edits.filter(function (e) { return e.ok === 0 }).length +
        S.subs.filter(function (s) { return Number(s.ok) === 0 }).length)
    })
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
      $('tabs').hidden = false
      document.querySelector('[data-view="eds"]').hidden = me.lv < 3
      return load().then(docsView)
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
      }).catch(function (e) { $('gate-tip').textContent = '登录不了：' + e.message })
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
      ;({ docs: docsView, queue: queueView, hist: histView, eds: edsView })[b.dataset.view]()
    }
    gate()
    // 有令牌就直接进，没有或过期了才落回登录框。
    if (tok()) boot().catch(function () { tok(null) })
  }

  // 纯函数单独导出：块拆分、着色与闸门不碰 DOM，离线断言直接拿这一份跑，
  // 不复制副本。页面不在时（Node 里）只导出、不接线。
  var api = { blocks: blocks, paint: paint, lint: lint, cells: cells, heads: heads, lcs: lcs, start: start }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document !== 'undefined') {
    window.starsideAdmin = api
    // 守卫查登录表单：它是这一页必然存在的东西。查一个只在外壳上的 id 会在改
    // 外壳时静默失效——所有监听一个都绑不上，按钮按下去毫无反应。
    if ($('f-pw')) start()
  }
})()
