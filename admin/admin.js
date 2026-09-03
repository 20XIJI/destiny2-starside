// 在线编辑台。资料源稿在库里改、在库里审，落盘、构建与部署仍在本机（tools/sync.py）。
//
// 身份认证 v2 是裸 HTTP 接口，**不引 @cloudbase/js-sdk**：auth-only 入口 65 KB gzip，
// 比整站首屏（46 KB）还大，而这里要的只有 signin 与 refresh 两个 POST。
;(function () {
  'use strict'

  var API = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api'
  var AUTH = 'https://dea-mods-d1g0j2rile2323f73.api.tcloudbasegateway.com'
  var T = window.starsideTerms || { terms: [], tokens: {}, classes: [], guard: [], items: [] }

  var $ = function (id) { return document.getElementById(id) }
  var el = function (tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  var LV = { 1: '编辑', 2: '审核员', 3: '管理员', 4: '超管' }
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
  function lint (text, head) {
    var out = []
    var span = marked(text)
    var m

    var d = 0
    var re = /\{[\w-]+\||\}/g
    while ((m = re.exec(text))) d = m[0] === '}' ? Math.max(0, d - 1) : d + 1
    if (d) out.push({ msg: '花括号没闭合，少 ' + d + ' 个右括号' })

    // G3：token 必须在 site.css 里有对应的类
    var t2 = /\{([\w-]+)\|/g
    while ((m = t2.exec(text))) {
      if (T.classes.indexOf(m[1]) < 0) out.push({ msg: 'token「' + m[1] + '」在 site.css 里没有定义' })
    }

    T.terms.forEach(function (row) {
      var word = row[0]
      var token = row[1]
      // G1 中文正名
      row[2].forEach(function (bad) {
        if (text.indexOf(bad) >= 0) out.push({ msg: '用了「' + bad + '」，正名是「' + word + '」' })
      })
      // G2 token 唯一。只查「整个标记就是这个词」的那种——词嵌在更长的短语里时
      // 着色属于短语，按词强判会把整句的颜色拆碎。
      if (!token) return
      var one = new RegExp('\\{([\\w-]+)\\|' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g')
      var k
      while ((k = one.exec(text))) {
        if (k[1] !== token) out.push({ msg: '「' + word + '」该着 ' + token + '，写成了 ' + k[1] })
      }
    })

    // G6 正查：库里的物品专名在正文里出现就得着色。GUARD 里那些更长的名字整段屏蔽。
    var mask = text
    T.guard.forEach(function (g) {
      var at = 0
      while ((at = mask.indexOf(g, at)) >= 0) {
        mask = mask.slice(0, at) + new Array(g.length + 1).join(' ') + mask.slice(at + g.length)
        at += g.length
      }
    })
    T.items.forEach(function (row) {
      var at = mask.indexOf(row[0])
      if (at < 0) return
      if (inside(span, at, at + row[0].length - 1)) return
      out.push({ warn: 1, msg: '「' + row[0] + '」该着 ' + row[1] + '（' + row[2] + '）' })
    })

    // 表格行的格数要与表头一致。少一格会让整行往左错位，产出上看不出来。
    if (head && text.charAt(0) === '|' && !/^\|\s*-/.test(text) && !/^\|\s*==/.test(text)) {
      var n = cells(text)
      if (n !== head) out.push({ msg: '这一行 ' + n + ' 格，表头是 ' + head + ' 格' })
    }
    return out
  }

  // ── 视图外壳 ───────────────────────────────────────────────────────
  function show (node) {
    var view = $('view')
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
    var wrap = el('section', 'block')
    wrap.appendChild(el('h2', 'sect-label', '源稿 · ' + S.docs.length + ' 篇'))
    var q = el('input')
    q.placeholder = '筛选'
    wrap.appendChild(q)
    var rows = el('div', 'rows')
    wrap.appendChild(rows)

    var open = {}
    S.edits.forEach(function (e) {
      if (e.ok === 0 || e.ok === -2) (open[e.doc] = open[e.doc] || []).push(e)
    })

    S.docs.slice().sort(function (a, b) { return a._id < b._id ? -1 : 1 }).forEach(function (d) {
      var b = el('button')
      b.type = 'button'
      b.dataset.k = d._id
      b.appendChild(el('span', 'id', d._id))
      if (open[d._id]) {
        b.appendChild(el('span', 'meta', open[d._id].map(function (e) {
          return (e.by || '?') + (e.ok === 0 ? ' 待审' : ' 草稿')
        }).join(' · ')))
      }
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
    wrap.appendChild(el('h2', 'sect-label', doc._id))

    // 我在这一篇上未结的那一条草稿或待审，接着改；没有就从库里的正文起手。
    var mine = S.edits.filter(function (e) {
      return e.doc === doc._id && (e.ok === 0 || e.ok === -2) && e.uid === S.me.uid
    })[0]

    var list = el('div', 'blocks')
    wrap.appendChild(list)

    var bs = []
    var head = 0

    function render (md) {
      bs = blocks(md)
      head = 0
      bs.some(function (t) {
        if (t.charAt(0) === '|') { head = cells(t); return true }
        return false
      })
      list.textContent = ''
      bs.forEach(function (t, i) { list.appendChild(cell(t, i)) })
    }

    function cell (text, i) {
      var n = el('div', 'blk' + (text.trim() ? '' : ' empty'))
      n.innerHTML = paint(text) || ' '
      var notes = lint(text, head)
      if (notes.some(function (x) { return !x.warn })) n.classList.add('bad')
      if (notes.length) {
        var ul = el('ul', 'notes')
        notes.forEach(function (x) { ul.appendChild(el('li', x.warn ? 'warn' : '', x.msg)) })
        n.appendChild(ul)
      }
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

    render(mine ? mine.md : doc.md)

    var acts = el('div', 'acts')
    var save = el('button', 'chip', '存草稿')
    var send = el('button', 'chip', '提交待审')
    save.type = send.type = 'button'
    save.onclick = function () { put(-2) }
    send.onclick = function () { put(0) }
    acts.appendChild(save)
    acts.appendChild(send)
    wrap.appendChild(acts)

    function put (ok) {
      var md = bs.join('\n')
      if (md === doc.md) { tip(wrap, '与库里那份一字不差，没什么可提的'); return }
      save.disabled = send.disabled = true
      gzip(md).then(function (gz) {
        return call('put', { doc: doc._id, gz: gz, ok: ok })
      }).then(load).then(function () {
        save.disabled = send.disabled = false
        tip(wrap, ok === 0 ? '提交了，等审核' : '草稿存好了')
      }, function (e) {
        save.disabled = send.disabled = false
        tip(wrap, '没存上：' + e.message, 1)
      })
    }

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
    var wrap = el('section', 'block')
    wrap.appendChild(el('h2', 'sect-label', '待审'))

    var pend = S.edits.filter(function (e) { return e.ok === 0 })
    var by = {}
    pend.forEach(function (e) { (by[e.doc] = by[e.doc] || []).push(e) })
    if (!pend.length) wrap.appendChild(el('p', 'tip', '文档改动：没有待审的'))

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
    var sp = el('div', 'pane')
    sp.appendChild(el('h3', null, '配装投稿 · ' + subs.length))
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
      wrap.appendChild(el('h2', 'sect-label', e.doc))
      wrap.appendChild(el('p', 'tip',
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
          call('emark', { id: e._id, ok: ok }).then(load).then(queueView, function (err) {
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

    var fr = el('iframe', 'prev')
    fr.src = '../builds/new/index.html'
    fr.onload = function () {
      try {
        var w = fr.contentWindow
        w.starsideForm.load(s.md)
        var p = w.document.getElementById('preview')
        if (p) p.click()
      } catch (err) {
        tip(wrap, '预览载不出来：' + err.message, 1)
      }
    }
    wrap.appendChild(fr)

    var src = el('details')
    src.appendChild(el('summary', null, '源稿'))
    var pre = el('pre')
    pre.textContent = s.md
    src.appendChild(pre)
    wrap.appendChild(src)

    if (S.me.lv >= 2) {
      var acts = el('div', 'acts')
      var no = el('button', 'chip', '驳回')
      no.type = 'button'
      no.onclick = function () {
        no.disabled = true
        call('smark', { id: s._id, ok: -1 }).then(load).then(queueView, function (e) {
          no.disabled = false
          tip(wrap, e.message, 1)
        })
      }
      acts.appendChild(no)
      acts.appendChild(el('span', 'tip', '通过要落盘定 slug，在本机那一步做'))
      wrap.appendChild(acts)
    }
    show(wrap)
  }

  // ── 编辑者 ─────────────────────────────────────────────────────────
  function edsView () {
    call('eds', { op: 'list' }).then(function (r) {
      var wrap = el('section', 'block')
      wrap.appendChild(el('h2', 'sect-label', '编辑者'))
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
      document.querySelector('[data-view="eds"]').hidden = me.lv < 3
      return load().then(docsView)
    })
  }

  // ── 登录框 ─────────────────────────────────────────────────────────
  function gate () {
    var pw = $('f-pw')
    var em = $('f-em')
    function swap (on, off, bon, boff) {
      on.hidden = false
      off.hidden = true
      bon.setAttribute('aria-current', 'true')
      boff.removeAttribute('aria-current')
    }
    $('t-pw').onclick = function () { swap(pw, em, $('t-pw'), $('t-em')) }
    $('t-em').onclick = function () { swap(em, pw, $('t-em'), $('t-pw')) }

    $('send-code').onclick = function () {
      var addr = em.email.value.trim()
      if (!addr) return
      $('send-code').disabled = true
      auth('/auth/v1/verification', { email: addr }).then(function (r) {
        em.dataset.vid = r.verification_id || ''
        $('gate-tip').textContent = '验证码发出去了'
        $('send-code').disabled = false
      }, function (err) {
        $('gate-tip').textContent = '发不出去：' + err.message
        $('send-code').disabled = false
      })
    }

    function go (p) {
      $('gate-tip').textContent = '登录中…'
      p.then(function (j) {
        tok(j)
        $('gate-tip').textContent = ''
        return boot()
      }).catch(function (e) { $('gate-tip').textContent = '登录不了：' + e.message })
    }

    pw.onsubmit = function (ev) {
      ev.preventDefault()
      go(auth('/auth/v1/signin', { username: pw.username.value.trim(), password: pw.password.value }))
    }
    em.onsubmit = function (ev) {
      ev.preventDefault()
      go(auth('/auth/v1/signin', {
        email: em.email.value.trim(),
        verification_code: em.code.value.trim(),
        verification_id: em.dataset.vid || ''
      }))
    }
  }

  function start () {
    $('out').onclick = function () { tok(null); location.reload() }
    $('tabs').onclick = function (ev) {
      var b = ev.target.closest('[data-view]')
      if (!b) return
      Array.prototype.forEach.call(this.children, function (n) { n.removeAttribute('aria-current') })
      b.setAttribute('aria-current', 'true')
      ;({ docs: docsView, queue: queueView, eds: edsView })[b.dataset.view]()
    }
    gate()
    // 有令牌就直接进，没有或过期了才落回登录框。
    if (tok()) boot().catch(function () { tok(null) })
  }

  // 纯函数单独导出：块拆分、着色与闸门不碰 DOM，离线断言直接拿这一份跑，
  // 不复制副本。页面不在时（Node 里）只导出、不接线。
  var api = { blocks: blocks, paint: paint, lint: lint, cells: cells, lcs: lcs, start: start }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document !== 'undefined') {
    window.starsideAdmin = api
    if ($('app')) start()
  }
})()
