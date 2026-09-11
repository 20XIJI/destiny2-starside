// 就地编辑：登录之后在站内页面上直接点、直接改。站头最右端那一枚「编辑」是入口。
//
// 由 shell.EDIT 那一行引子拉进来——**有令牌才拉**，没登录的读者只多下那一行。
// 两条路，由 <main> 的 data-kind 分：
//
//   doc（资料页，缺省）  逐格改。定位靠生成器戳的 data-b（源稿行号），格号用
//                        DOM 的 cellIndex 现取；提交一处落一条待审，走 chg。
//   build（配装详情页）  整篇替换。配装页没有 data-b，逐格无从落脚也无从校验，
//                        所以开一层遮罩载填表页，保存走 bsave。
//
// 这一份只负责「改哪一处、改成什么」；落盘、构建与部署仍在本机（tools/sync.py）。
;(function () {
  'use strict'

  var API = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api'
  var main = document.querySelector('main[data-src]')
  if (!main) return                     // 没戴标记的页面（首页、索引页、填表页）不管

  var DOC = main.getAttribute('data-src')
  // 'doc'（缺省）逐格改，'build' 整篇替换。判据写在产出的 <main> 上，不靠猜路径：
  // 配装页没有 data-b，逐格那条路在它身上无从落脚。
  var KIND = main.getAttribute('data-kind') || 'doc'
  var PAGE_HASH = main.getAttribute('data-hash') || ''
  var HERE = document.querySelector('link[href$="assets/site.css"]')
    .getAttribute('href').replace('assets/site.css', '')

  // buildBase 只有配装那条路用：刚灌完时填表页读回来的样子，脏判据比的就是它。
  var S = { me: null, md: null, hash: '', lines: [], pend: [], done: [], on: false,
            buildBase: null }

  var el = function (tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  // ── 后端 ───────────────────────────────────────────────────────────
  function call (a, body, retry) {
    return fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + (localStorage.getItem('sa_at') || '')
      },
      body: JSON.stringify(Object.assign({ a: a }, body || {}))
    }).then(function (r) { return r.json() }).then(function (j) {
      // 与编辑台同一条：只有令牌那一类才值得换一张再打，权限不足回的是另一个词。
      if (j && j.error === 'forbidden' && !retry) {
        return refresh().then(function () { return call(a, body, 1) })
      }
      if (j && j.error) throw new Error(j.error)
      return j
    })
  }

  // 与编辑台的 refresh() 同一套规则：认证服务拒了才报 forbidden（say() 据此清令牌），
  // 断网原样抛出；同一页并发共用一次刷新；sa_rt 已被别的标签页换掉时用那一张。
  var renewing = null
  function refresh () {
    if (renewing) return renewing
    var rt = localStorage.getItem('sa_rt')
    if (!rt) return Promise.reject(new Error('forbidden'))
    renewing = fetch('https://dea-mods-d1g0j2rile2323f73.api.tcloudbasegateway.com/auth/v1/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j } })
    }).then(function (x) {
      renewing = null
      if (x.ok && x.j.access_token) {
        localStorage.setItem('sa_at', x.j.access_token)
        if (x.j.refresh_token) localStorage.setItem('sa_rt', x.j.refresh_token)
        return
      }
      if (localStorage.getItem('sa_rt') !== rt) return
      throw new Error(x.ok ? '换不到令牌' : 'forbidden')
    }, function (e) { renewing = null; throw e })
    return renewing
  }

  // 闸门词表与那几条纯函数在编辑台那两份文件里，**开编辑态时才拉**：
  // terms.js 一份 104 KB，挂在每个资料页的首屏上不成立。
  function script (src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script')
      s.src = HERE + src
      s.onload = ok
      s.onerror = function () { no(new Error('载不动 ' + src)) }
      document.head.appendChild(s)
    })
  }

  /* 两条编辑路都要先把编辑台那一份拉进来：资料页的闸门与着色走 lint()/paint()，
     配装页的填表页怎么载、怎么读、错误码怎么翻走 slotOf()/formSrc()/readForm()/
     mountForm()/say()。

     **dialect 先落地。**admin.js 的 cells() 与 titleEnd() 在函数体里现读
     window.starsideDialect，不在模块顶层捕获，所以先后不影响求值，影响的是调用：
     资料页那条路进去就切格。串着载是最省事的保证，代价是 4.6 KB。
     关掉再开时不重载：脚本已经在页面上了，再插一遍只是白执行一次。
     **词表不在这条链上**：lint() 同样现读 window.starsideTerms，挪到进去之后空闲补。 */
  function needAdmin () {
    if (window.starsideAdmin) return Promise.resolve()
    return script('admin/dialect.js').then(function () { return script('admin/admin.js') })
  }

  // **词表不进「开编辑态」这条关键路径。**它 104 KB，只有闸门提示与调色板用得上；
  // 进编辑态之后空闲预取，点开某一块时若还没到就等它一次，到了再把调色板与提示
  // 补上。预览不等它——paint() 只认花括号，不查词表——所以改完当场就看得见渲染
  // 的样子；提示晚到不影响判断，它本来就是提示不拦截，真闸门在本机那套 Python。
  var EMPTY = { terms: [], tokens: {}, classes: [], pageClasses: {}, guard: [], items: [], keep: [], g6: [] }
  function terms () { return window.starsideTerms || EMPTY }
  var termsAt = null
  function wantTerms () {
    if (window.starsideTerms) return Promise.resolve()
    if (!termsAt) termsAt = script('admin/terms.js')
    return termsAt
  }

  // ── 源稿定位 ───────────────────────────────────────────────────────
  // 切格走 admin/dialect.js：源稿方言在 JS 这一侧只有那一份定义。
  function cellSpans (line) { return window.starsideDialect.cellSpans(line) }

  // 元素 → 它占源稿的 [首行, 末行]。进编辑态时解一次。
  var LINES = new Map()

  // **产出里的 data-b 是增量**（见 markup.delta_bmarks）：文档顺序里行号单调递增，
  // 绝对值是一串互不相同的四位数、gzip 压不动，差值多在个位数、大量重复，神器模组
  // 页因此省下 2 KB gzip。按文档顺序累加还原；区间写成「差+跨度」。
  function decode () {
    LINES.clear()
    invalidate()
    var prev = 0
    document.querySelectorAll('[data-b]').forEach(function (n) {
      var v = n.getAttribute('data-b').split('+')
      var a = prev + Number(v[0])
      prev = a + Number(v[1] || 0)
      LINES.set(n, [a, prev])
    })
    document.querySelectorAll('main table').forEach(function (table) {
      var last = null
      table.querySelectorAll('tr').forEach(function (row) {
        var at = LINES.get(row)
        if (!at && last) {
          at = [last[1] + 1, last[1] + 1]
          LINES.set(row, at)
        }
        last = at || null
      })
    })
  }

  // 一个块占源稿的哪几行。**多行段落是区间**，只取首行会让人改了一段却只落下第一行。
  // **没有 data-b 的 <tr> 就是上一行 +1**——生成器只在这条成立时才省掉标记，
  // 行组分界行（|---|）占一行却不出 <tr>，它后面那行照旧带号。
  function lineOf (node) {
    return LINES.get(node) || null
  }

  // 点中的东西在源稿里是哪一处。cell 为 -1 即整块。
  function where (node) {
    var td = node.closest('td, th')
    var tr = node.closest('tr')
    if (td && tr && !tr.classList.contains('lane')) {
      var span = lineOf(tr)
      // **合并行没有 <th scope="row">**，cellIndex 整体前移一位，补回来。
      // 判据与列组隐藏那两条规则同源：body 里首格是 <td> 的行就是合并行。
      var shift = tr.parentElement.tagName === 'TBODY'
        && tr.firstElementChild.tagName === 'TD' ? 1 : 0
      return span ? { blk: span[0], end: span[0], cell: td.cellIndex + shift } : null
    }
    // 横幅行整块改：源稿写成 | == 组名 == |，那两个 == 是标记不是内容，
    // 按格给会让人以为可以把它删掉。
    var b = node.closest('[data-b]')
    if (!b) return null
    var s2 = lineOf(b)
    return s2 ? { blk: s2[0], end: s2[1], cell: -1 } : null
  }

  // 原坐标只描述已部署页面；只有 hash 相等时才可直接读当前源稿。
  function textAt (at) {
    var line = S.lines[at.blk]
    if (line == null || at.end >= S.lines.length) return null
    if (at.cell < 0) return S.lines.slice(at.blk, at.end + 1).join('\n')
    var sp = cellSpans(line)
    return sp && sp[at.cell] ? line.slice(sp[at.cell][0], sp[at.cell][1]) : null
  }

  // 页面与源稿共用这把尺子；千位逗号由生成器添加，图标不提供文字身份。
  function bare (t) {
    return String(t)
      .replace(/!\[\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/\{[\w-]+\|/g, '').replace(/\}/g, '')
      .replace(/\\\\/g, '')
      .replace(/[*`~,“”]/g, '')
      .replace(/\s/g, '')
  }

  var RESOLVED = new Map()
  var SOURCES = new Map()
  var MATCHES = null

  function invalidate () {
    RESOLVED.clear()
    SOURCES.clear()
    MATCHES = null
  }

  // 永远读涂色前的 HTML，不把「新值 + 旧值 + 发起人」拿去定位。
  function original (node) {
    if (!ORIG.has(node)) return bare(node.textContent)
    var copy = document.createElement('div')
    copy.innerHTML = ORIG.get(node)
    return bare(copy.textContent)
  }

  function shape (node, at) {
    if (at.cell >= 0) return 'cell'
    if (node.closest('tr.lane')) return 'lane'
    if (DOC === 'artifact-mods' && node.tagName === 'H4') return 'mod'
    if (DOC === 'artifact-mods' && node.tagName === 'H2') return 'artifact'
    return /^(H[1-6]|P|LI|DT|DD)$/.test(node.tagName) ? node.tagName : ''
  }

  // 只剥这个节点类型的结构前缀。未知形状不拿旧行号兜底。
  function content (kind, text) {
    var rows = text.split('\n')
    if (kind === 'cell') return rows.length === 1 ? bare(text) : null
    if (kind === 'lane') {
      var lane = /^\|\s*==\s*(.*?)\s*==\s*\|\s*$/.exec(text)
      return lane ? bare(lane[1]) : null
    }
    if (kind === 'mod' || kind === 'artifact') {
      var title = (kind === 'mod' ? /^### (?:一级|二级|三级) · (.+)$/ : /^## 神器：(.+)$/).exec(text)
      return title ? bare(title[1]) : null
    }
    if (/^H[1-6]$/.test(kind)) {
      var heading = /^(#{1,6})\s+(.+)$/.exec(text)
      return heading && heading[1].length === Number(kind.slice(1)) ? bare(heading[2]) : null
    }
    if (kind === 'LI') return /^- .+$/.test(text) ? bare(text.slice(2)) : null
    if (kind === 'DD') {
      if (!/^: /.test(rows[0]) || !/^: /.test(rows[rows.length - 1])) return null
      if (rows.some(function (s) { return s.trim() && !/^: /.test(s) })) return null
      return bare(rows.map(function (s) { return s.replace(/^: /, '') }).join('\n'))
    }
    if (kind !== 'P' && kind !== 'DT') return null
    if (rows.some(function (s) { return !s.trim() || /^(?:#{1,6}\s|\s*\||- |: )/.test(s) })) return null
    return bare(text)
  }

  // 边界也须相同：两行段落不能认领三行段落中恰好相等的前两行。
  function bounded (kind, start, end) {
    var prev = S.lines[start - 1] || ''
    var next = S.lines[end + 1] || ''
    if (kind === 'DT') return start === end && /^: /.test(next)
    if (kind === 'DD') {
      return !/^: /.test(prev) && !(prev === '' && /^: /.test(S.lines[start - 2] || ''))
        && !/^: /.test(next) && !(next === '' && /^: /.test(S.lines[end + 2] || ''))
    }
    if (kind !== 'P') return true
    var prose = function (s) { return !!s.trim() && !/^(?:#{1,6}\s|\s*\||- |: )/.test(s) }
    return !prose(prev) && !prose(next) && !/^: /.test(next)
  }

  function resolve (node) {
    if (RESOLVED.has(node)) return RESOLVED.get(node)
    var at = where(node)
    var found = null
    if (at) {
      if (S.hash && S.hash === PAGE_HASH) {
        var before = textAt(at)
        if (before != null) found = Object.assign({}, at, { before: before })
      } else {
        var kind = shape(node, at)
        var text = original(node)
        if (kind && text) {
          var size = at.end - at.blk + 1
          var key = kind + ':' + at.cell + ':' + size
          var index = SOURCES.get(key)
          if (!index) {
            index = new Map()
            for (var i = 0; i + size <= S.lines.length; i++) {
              var candidate = { blk: i, end: i + size - 1, cell: at.cell }
              var src = textAt(candidate)
              var value = src == null ? null : content(kind, src)
              if (!value || !bounded(kind, i, candidate.end)) continue
              candidate.before = src
              index.set(value, index.has(value) ? null : candidate)
            }
            SOURCES.set(key, index)
          }
          found = index.get(text) || null
        }
      }
    }
    RESOLVED.set(node, found)
    return found
  }

  // 提案必须凭 before 唯一认领页面原文；坐标相等本身不能认领另一格。
  function proposals (node) {
    if (!MATCHES) {
      MATCHES = new Map()
      var nodes = targets()
      var groups = new Map()
      nodes.forEach(function (n) {
        var at = where(n)
        if (!at) return
        var kind = shape(n, at)
        var key = kind + ':' + at.cell + ':' + (at.end - at.blk + 1)
        if (!groups.has(key)) groups.set(key, new Map())
        var pool = groups.get(key)
        var text = original(n)
        if (text) pool.set(text, pool.has(text) ? null : n)
      })
      S.pend.concat(S.done).forEach(function (p) {
        var hits = []
        groups.forEach(function (pool, key) {
          var bits = key.split(':')
          if (Number(bits[1]) !== p.cell || Number(bits[2]) !== p.before.split('\n').length) return
          var text = content(bits[0], p.before)
          if (!text) return
          if (pool.has(text)) hits.push(pool.get(text))
        })
        if (hits.length !== 1 || !hits[0]) return
        var n = hits[0]
        if (!MATCHES.has(n)) MATCHES.set(n, [])
        MATCHES.get(n).push(p)
      })
    }
    return MATCHES.get(node) || []
  }

  // 把一段源稿渲染成页面上那个样子。**这是近似**：真正的渲染在
  // convert-doc.py 的 inline(rich=True) 里，浏览器里搬不动全套，只补格子里真会
  // 出现的那四样——格内换行 \\、图标、链接、粗体。着色仍走 admin.js 的 paint()，
  // 与 markup.inline() 同一条栈式扫描。
  function show (t) {
    return window.starsideAdmin.paint(t)
      .replace(/\\\\/g, '<br>')
      .replace(/!\[\]\(([^)]+)\)/g, '<img src="$1" alt="">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  }

  // ── 编辑态 ─────────────────────────────────────────────────────────
  var TARGET = 'main [data-b]'

  function targets () {
    var out = []
    document.querySelectorAll(TARGET).forEach(function (n) {
      if (n.tagName === 'TR') {
        n.querySelectorAll('td, th').forEach(function (c) { out.push(c) })
      } else {
        out.push(n)
      }
    })
    // 省掉 data-b 的那些 <tr>（连号）也要能点
    document.querySelectorAll('main table tr:not([data-b])').forEach(function (n) {
      n.querySelectorAll('td, th').forEach(function (c) { out.push(c) })
    })
    return out
  }

  var ORIG = new Map()          // 涂色之前那一格原样的 HTML，退出编辑态时还回去

  function unshade () {
    ORIG.forEach(function (html, node) { node.innerHTML = html })
    ORIG.clear()
    document.querySelectorAll('.se-hit').forEach(function (n) {
      n.classList.remove('se-hit', 'se-wait', 'se-pass')
    })
    invalidate()
  }

  function shade () {
    unshade()
    if (!S.on) return
    targets().forEach(function (node) {
      var all = proposals(node)
      var p = all.filter(function (q) { return q.ok === 0 })[0]
        || all.filter(function (q) { return q.ok === 1 && bare(q.before) !== bare(q.after) })[0]
      if (!p) return
      ORIG.set(node, node.innerHTML)
      node.classList.add('se-hit', p.ok === 1 ? 'se-pass' : 'se-wait')
      // **新值换进原位，旧值紧随其后。**旧值直接用页面上原本那一份——它是生成器
      // 渲染的，忠实；新值只能在浏览器里近似渲染。两半因此都是渲染态，能直接比，
      // 一边源稿一边成品是看不出改了什么的。
      // 表格里落成下一行：列宽被 table-layout: fixed 钉死，左右并排会把两半各压成
      // 半列宽；别处行内跟随。
      var was = el('span', 'se-was')
      var old = el('s')
      old.innerHTML = ORIG.get(node)
      was.appendChild(old)
      // 谁改的落成一枚小标签，不写成正文——**不写「原为」二字**，划掉那一道已经
      // 说完了。标签走 --font-disp 加字距、压暗、靠右，与正文明显不是一路：一页改
      // 十处时十个名字排在句子里是噪声，而要看时它还在。
      was.appendChild(el('span', 'se-by',
        (p.by || '?') + (p.ok === 1 ? ' · 待上站' : '')))
      node.innerHTML = show(p.after)
      node.appendChild(was)
    })
  }

  function mark (on) {
    document.body.classList.toggle('se-on', on)
    targets().forEach(function (n) { n.classList.toggle('se-cell', on) })
  }

  // ── 就地那个小框 ───────────────────────────────────────────────────
  var box = null

  function shut () {
    if (box) { box.remove(); box = null }
  }

  function open (node) {
    shut()
    var at = resolve(node)
    if (!at) {
      alert('这一处底稿已变或无法唯一定位，请等待新版页面后重新提交')
      return
    }
    var before = at.before

    // 这一处已经有我自己的待审时，接着那一版改——不然会从旧文重新起手，
    // 把自己刚提的那一下顶掉。别人的那一版不接：那是他的稿子。
    var at_ = proposals(node).filter(function (p) { return p.before === before })
    var mine = at_.filter(function (p) { return p.ok === 0 && p.uid === S.me.uid })[0]
    var here = at_[0]

    box = el('div', 'se-box')
    box.appendChild(el('div', 'se-where', DOC + ' · 第 ' + (at.blk + 1) + ' 行'
      + (at.cell < 0 ? '' : ' · 第 ' + (at.cell + 1) + ' 格')
      + (mine ? ' · 你的待审'
        : here ? ' · ' + here.by + (here.ok === 1 ? ' 通过' : ' 待审') : '')))
    var ta = el('textarea')
    ta.value = mine ? mine.after : before
    ta.rows = Math.min(12, ta.value.split('\n').length + Math.ceil(ta.value.length / 60))
    box.appendChild(ta)

    /* **表格那一档里不许出现真换行。**一行源稿就是一行表格，格内换行只能写 `\\`
       （见 convert-doc.py 的块语法）。敲一个回车下去，那一行会在写回正文时裂成
       两行，整行的格数跟着少一半——npm run build 当场中止，卡住的是整次部署，
       而编辑的人这边一点异样都看不到。

       所以回车直接插 `\\`，粘进来的多行也就地并成 `\\`：文本框里始终是将要
       写进源稿的那一份，不在提交时偷偷改一道。 */
    var inTable = !!node.closest('table')
    if (inTable) {
      ta.addEventListener('keydown', function (ev) {
        if (ev.isComposing || ev.keyCode === 229) return
        if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey || ev.altKey) return
        ev.preventDefault()
        var a = ta.selectionStart
        ta.value = ta.value.slice(0, a) + '\\\\' + ta.value.slice(ta.selectionEnd)
        ta.setSelectionRange(a + 2, a + 2)
        ta.dispatchEvent(new Event('input'))
      })
      ta.addEventListener('input', function () {
        if (ta.value.indexOf('\n') < 0) return
        var a = ta.selectionStart
        var before2 = ta.value.slice(0, a).split('\n').length - 1
        ta.value = ta.value.replace(/\n+/g, '\\\\')
        ta.setSelectionRange(a + before2, a + before2)
      })
    }

    // **改完先看渲染出来的样子再提交。**{res|90% 减伤} 少一个花括号、token 写错一个
    // 字母，在源稿里眼睛查不出来，渲染一遍当场就露。
    var prev = el('div', 'se-prev')
    box.appendChild(prev)

    var pal = el('div', 'se-pal')
    box.appendChild(pal)
    var palette = function () {
      pal.textContent = ''
      Object.keys(terms().tokens).sort().forEach(function (cls) {
        var b = el('button', cls, cls)
        b.type = 'button'
        // 芯片要自己 preventDefault，否则按下去先让 textarea 失焦、选区没了。
        b.onmousedown = function (ev) { ev.preventDefault() }
        b.onclick = function () { wrapSel(ta, cls) }
        pal.appendChild(b)
      })
    }

    var notes = el('ul', 'se-notes')
    box.appendChild(notes)

    var acts = el('div', 'se-acts')
    var send = el('button', 'op', '提交')
    var no = el('button', 'op', '取消')
    send.type = no.type = 'button'
    no.onclick = shut

    // G6「该着色的都着了」按页判，与 items.pages() 同一份范围（terms.js 的 g6）。
    // **表头行与行标题那一格跳过**：列名与行的身份已有结构身份，照 items.hits_in()
    // 的六处跳过原样搬——少一条就满屏误报。
    var head = !!node.closest('thead')

    var redraw = function () {
      var T = terms()
      var g6 = DOC.indexOf('docs/') === 0 && T.g6.indexOf(DOC.slice(5)) >= 0
        && !head && at.cell !== 0
      prev.innerHTML = show(ta.value) || '（空）'
      notes.textContent = ''
      var ok = T.classes.concat(T.pageClasses[DOC] || [])
      var r = window.starsideAdmin.lint(ta.value, { cols: 0, head: head }, g6, ok)
      r.errs.forEach(function (x) { notes.appendChild(el('li', null, x)) })
      // 「该着色」是提示不是错，压暗一档排在错误后面
      r.warns.forEach(function (x) { notes.appendChild(el('li', 'warn', x)) })
      // 闸门是提示不是拦截（真闸门是本机那套 Python），但有错时把按钮上的字换掉，
      // 别让人一路点过去。
      send.textContent = ta.value === before ? '无改动'
        : r.errs.length ? '仍要提交（' + r.errs.length + ' 处问题）'
          : '提交'
      send.disabled = ta.value === before
    }
    // **去抖 150 ms**：一轮 redraw 要重画预览再跑一遍闸门，而中文输入法逐字上屏时
    // 每个候选字都触发一次 input。
    var tick = 0
    ta.oninput = function () { clearTimeout(tick); tick = setTimeout(redraw, 150) }
    palette()
    redraw()
    wantTerms().then(function () { palette(); redraw() }, function () {})
    send.onclick = function () {
      if (ta.value === before) { shut(); return }
      send.disabled = true
      call('chg', { doc: DOC, blk: at.blk, cell: at.cell, before: before, after: ta.value })
        .then(function () { return reload() })
        .then(function () { shut(); shade() }, function (e) {
          send.disabled = false
          notes.textContent = ''
          notes.appendChild(el('li', null, e.message === 'stale'
            ? '这一处底稿已变或无法唯一定位，请等待新版页面后重新提交'
            : '提交失败：' + e.message))
        })
    }
    acts.appendChild(send)
    acts.appendChild(no)
    box.appendChild(acts)

    document.body.appendChild(box)
    var r = node.getBoundingClientRect()
    box.style.top = (window.scrollY + r.bottom + 6) + 'px'
    box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8,
      window.scrollX + r.left)) + 'px'
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }

  // 选中文字 → 点芯片 → 包成着色标记；选中的整段已经是一个标记就取消。
  function wrapSel (ta, cls) {
    var a = ta.selectionStart
    var b = ta.selectionEnd
    if (a === b) return
    var sel = ta.value.slice(a, b)
    var one = /^\{([\w-]+)\|([\s\S]*)\}$/.exec(sel)
    var put = one ? one[2] : '{' + cls + '|' + sel + '}'
    ta.value = ta.value.slice(0, a) + put + ta.value.slice(b)
    ta.setSelectionRange(a, a + put.length)
    ta.focus()
    ta.dispatchEvent(new Event('input'))
  }

  // ── 装载 ───────────────────────────────────────────────────────────
  function reload () {
    // **一发拿回正文、hash 与待审。**从前是 doc 再 pend 两发串行，而后者串在
    // 前者后面只为拿 hash 与页面上那份比一次——那一比服务端自己做得了。
    // **页面上那份 hash 与库里相等就没有待上站的改动**，一处都不必比；
    // 不等才把已通过的那些取回来认出「这一格站上还是旧的」，由后端一并判。
    return call('pend', { doc: DOC, md: 1, hash: PAGE_HASH }).then(function (r) {
      S.md = r.md || ''
      S.hash = r.hash || ''
      S.lines = S.md.split('\n')
      S.pend = r.pend.map(function (p) { p.ok = Number(p.ok); return p })
      S.done = (r.done || []).map(function (p) { p.ok = Number(p.ok); return p })
      invalidate()
    })
  }

  function toggle (chip) {
    if (S.on) {
      S.on = false
      shut()
      mark(false)
      shade()
      chip.textContent = '编辑'
      chip.removeAttribute('aria-current')
      return Promise.resolve()
    }
    chip.textContent = '载入中…'
    return needAdmin().then(reload).then(function () {
      decode()
      S.on = true
      mark(true)
      shade()
      if (S.pend.length) S.desk.textContent = '审核台 ' + S.pend.length
      chip.textContent = '退出编辑'
      chip.setAttribute('aria-current', 'true')
      // 两个分支分开调：合写成 (requestIdleCallback || setTimeout)(fn, 1) 时，
      // 1 在 Chrome 里不是 IdleRequestOptions，当场抛 TypeError。
      if (window.requestIdleCallback) requestIdleCallback(wantTerms)
      else setTimeout(wantTerms, 1)
    }, function (e) {
      chip.textContent = '编辑'
      alert('进入编辑失败：' + e.message)
    })
  }

  /* ── 配装页那条：整篇替换 ────────────────────────────────────────────
     配装页没有 data-b（逐字保真闸门也不覆盖它），逐格改无从落脚也无从校验，
     所以这一条走填表页整篇替换——与审核台详情格里那一套是同一个动作、同一个落点
     （bsave），不新开一条状态流，也只处理已经上站的那些。

     **底稿从库里现拉，不拿页面上那份 `<pre id="src">`**：它是 markup.uncolor()
     剥过着色标记的（「复制配装」要的是能粘回配装工具的纯文本），拿它当底稿存回去，
     整套配装的着色会被洗掉。现拉走 pend 带 md 那一路，不新增接口：它本来就把正文
     与 hash 一并带回，代价只是顺带跑一次对配装恒为空的待审查询。 */
  var pane = null

  // 读法与审核台那条共用 admin.js 的 readForm()：脏判据两边比的必须是同一种读回来
  // 的样子，抄第二份就会漂。
  function buildRead () {
    var fr = pane && pane.querySelector('iframe')
    return fr ? window.starsideAdmin.readForm(fr.contentWindow) : null
  }

  function buildShut (chip) {
    var now = buildRead()
    if (now !== null && now !== S.buildBase
        && !window.confirm('改过还没保存，关掉会丢。仍要关闭？')) return
    if (pane) pane.remove()
    pane = null
    S.buildBase = null
    chip.textContent = '编辑'
    chip.removeAttribute('aria-current')
  }

  function buildPane (chip, md) {
    var kind = window.starsideAdmin.slotOf(md)
    pane = el('div', 'se-build')
    var bar = el('div', 'se-build-bar')
    // 名字直接取页面上那个 h1，不另写一份解析：屏幕上写着什么，这里就写什么。
    var h1 = document.querySelector('.build-head h1')
    bar.appendChild(el('span', 'se-build-id',
      '编辑《' + ((h1 && h1.textContent.trim()) || DOC) + '》'))
    var msg = el('p', 'se-build-tip')
    if (S.me.lv >= 2) {
      // 素 .op，不挂 .go：go 是「通过」那一档的绿，而这一枚只是存一版，状态不动。
      // （.op.go 那条规则也只在 admin/style.css 里，配装页根本不引它。）
      var keep = el('button', 'op', '保存')
      keep.type = 'button'
      keep.onclick = function () {
        var now = buildRead()
        if (now === null) { msg.textContent = '读不出填表页里那一份，等它载完再存'; return }
        keep.disabled = true
        call('bsave', { id: DOC, md: now }).then(function () {
          keep.disabled = false
          S.buildBase = buildRead()
          // **这一页是构建产物，存完一个字都不会变**，不说清就等于什么都没发生。
          msg.textContent = '已保存到库。这一页要等本机落盘、构建再部署才更新。'
        }, function (e) {
          keep.disabled = false
          // 与审核台同一张 MSG：同一个 bsave，两条路不该一边中文一边 no permission。
          msg.textContent = '保存失败：' + window.starsideAdmin.say(e)
        })
      }
      bar.appendChild(keep)
    } else {
      // lv 1 照样载得进可改的填表页，不说这一句，人在表里改半天找不到保存。
      msg.textContent = '只读：保存要审核员（lv 2）权限。'
    }
    var off = el('button', 'toggle', '关闭')
    off.type = 'button'
    off.onclick = function () { buildShut(chip) }
    bar.appendChild(off)
    bar.appendChild(msg)
    pane.appendChild(bar)

    var fr = el('iframe')
    // 地址与灌入都走 admin.js 那一份：review() 排在 load() 之前、基线取归一化之后
    // 读回来的那一份，两条规矩写在那里一处。
    fr.src = HERE + window.starsideAdmin.formSrc(kind)
    fr.onload = function () {
      try {
        S.buildBase = window.starsideAdmin.mountForm(fr.contentWindow, md, S.me.lv >= 2)
      } catch (err) { msg.textContent = '载入失败：' + err.message }
    }
    pane.appendChild(fr)
    document.body.appendChild(pane)

    chip.textContent = '退出编辑'
    chip.setAttribute('aria-current', 'true')
  }

  function buildOpen (chip) {
    if (pane) return buildShut(chip)
    chip.textContent = '载入中…'
    // **两件一起等**：底稿那一发不依赖编辑台那两份脚本，串起来就是白等一段——
    // 90 KB 的脚本与一次云函数往返里较短的那一段，冷启时是几百毫秒，而 iframe
    // 要等两边都落地才开载。
    return Promise.all([needAdmin(), call('pend', { doc: DOC, md: 1 })])
      .then(function (r) {
        var got = r[1]
        if (!got.md) throw new Error('库里没有 ' + DOC + '，这一页的 data-src 对不上库')
        buildPane(chip, got.md)
      })
      /* **收尾用 .catch，不用 .then 的第二个参数。**那一份只接前一环的失败，
         接不住成功回调自己抛的——chip 会永远停在「载入中…」，控制台外一声不响。
         这条路上真抛过：data-src 一度写成产出目录 builds/s29/…，而库里的 _id
         那一截是源稿目录 builds/s29-凯旋纪念碑/…。 */
      .catch(function (e) {
        chip.textContent = '编辑'
        // 走 say() 要 admin.js 已经在手里；载它那一步自己失败时退回原话。
        alert('进入编辑失败：'
          + (window.starsideAdmin ? window.starsideAdmin.say(e) : e.message))
      })
  }

  function boot (me) {
    if (!me.lv) return                  // 登录了但不在白名单，页面上什么都不加
    S.me = me

    var css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = HERE + 'admin/edit.css'
    document.head.appendChild(css)

    var chip = el('button', 'toggle se-chip', '编辑')
    chip.type = 'button'
    // 资料页与配装页共用这一枚与它的位置（.se-chip 那条 margin-left: auto 把它推到
    // 站头最右端），点下去分两条路：资料页逐格改，配装页整篇替换。
    chip.onclick = KIND === 'build'
      ? function () { buildOpen(chip) }
      : function () { toggle(chip) }
    // 通往审核台的那条边。编辑态里发现一处该改、想顺手看看别人提了什么时，
    // 不必回首页再找入口。
    var desk = el('a', 'chip se-desk', '审核台')
    desk.href = HERE + 'admin/index.html'
    var nav = document.querySelector('.site-nav')
    if (nav) {
      nav.appendChild(chip)
      nav.appendChild(desk)
    }
    S.desk = desk

    document.addEventListener('click', function (ev) {
      if (!S.on) return
      if (box && box.contains(ev.target)) return
      var cell = ev.target.closest('.se-cell')
      if (!cell) { shut(); return }
      // 编辑态下正文里的链接不跳走——点它是要改那一格，不是要去别的页面。
      ev.preventDefault()
      open(cell)
    })
    document.addEventListener('keydown', function (ev) {
      if (ev.isComposing || ev.keyCode === 229) return
      if (ev.key !== 'Escape') return
      // 配装页开着遮罩时 Escape 关它（脏了会先问一声），资料页关那个小框。
      // 焦点落在 iframe 里时按键不冒泡到这一层，所以栏上另有一枚「关闭」。
      if (pane) buildShut(chip)
      else shut()
    })
  }

  call('me').then(boot, function () { /* 令牌过期就当没登录，页面照常 */ })
})()
