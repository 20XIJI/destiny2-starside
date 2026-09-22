// 原型，定稿后删。三套方案共用桩数据与几件小零件，版面各写各的。
;(function () {
  'use strict'
  var P = window.PROTO
  var PAGES = window.starsidePages
  var q = new URLSearchParams(location.search)

  var VARIANTS = [['A', '顶栏 + 表格'], ['B', '三栏：导航 + 队列 + 详情'], ['C', '单条专注']]
  var SCREENS = [['login', '登录'], ['loading', '载入'], ['builds', '配装列表'], ['detail', '配装详情'],
    ['review', '文档审核'], ['hist', '记录'], ['eds', '编辑者'], ['empty', '空态']]
  var variant = VARIANTS.some(function (v) { return v[0] === q.get('variant') }) ? q.get('variant') : 'A'
  var screen = SCREENS.some(function (s) { return s[0] === q.get('screen') }) ? q.get('screen') : 'builds'

  // ── 小零件 ─────────────────────────────────────────────────────────
  function h (tag, a) {
    var n = document.createElement(tag)
    a = a || {}
    Object.keys(a).forEach(function (k) {
      var v = a[k]
      if (v == null || v === false) return
      if (k === 'class') n.className = v
      else if (k === 'text') n.textContent = v
      else if (k === 'html') n.innerHTML = v
      else if (k.slice(0, 2) === 'on') n[k] = v
      else n.setAttribute(k, v === true ? '' : v)
    })
    for (var i = 2; i < arguments.length; i++) add(n, arguments[i])
    return n
  }
  function add (n, kid) {
    if (kid == null || kid === false) return
    if (Array.isArray(kid)) return kid.forEach(function (k) { add(n, k) })
    n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid)
  }
  function go (v, s) {
    var u = new URLSearchParams(location.search)
    if (v) u.set('variant', v)
    if (s) u.set('screen', s)
    history.replaceState(null, '', '?' + u.toString())
    variant = v || variant
    screen = s || screen
    render()
  }
  // 载入屏还没有计数；空态屏的文档计数是 0。
  function cnt (k) {
    if (screen === 'loading') return 0
    if (screen === 'empty' && k === 'doc') return 0
    return P.counts[k]
  }
  function kbd (k) { return h('kbd', { text: k }) }

  var LV = { 1: '编辑', 2: '审核员', 3: '管理员', 4: '超管' }
  var STATE = [['wait', '待审'], ['pass', '通过'], ['live', '完成'], ['dropping', '待移除'], ['no', '驳回']]
  var byBucket = function (k) { return P.builds.filter(function (b) { return b.bucket === k }) }
  var waitList = byBucket('wait').sort(function (a, b) { return a.rawAt < b.rawAt ? -1 : 1 })
  var pick = waitList.filter(function (b) { return !b.sets && !b.drop && !b.lack.length })[0]
  var pend = P.edits.filter(function (e) { return e.ok === 0 })
  var closed = P.edits.filter(function (e) { return e.ok !== 0 })
    .sort(function (a, b) { return a.rawAt < b.rawAt ? 1 : -1 })
  var pendDocs = []
  pend.forEach(function (e) { if (pendDocs.indexOf(e.doc) < 0) pendDocs.push(e.doc) })
  pendDocs.sort()
  // 默认摊开待审最多的那一页：它带着冲突与底稿已变两种情形。
  var openDoc = pendDocs.slice().sort(function (a, b) {
    return pend.filter(function (e) { return e.doc === b }).length - pend.filter(function (e) { return e.doc === a }).length
  })[0]

  function flag (b) { return h('span', { class: 'flag ' + b.tone, text: b.flag }) }
  function facts (b) {
    return [['职业', b.cls], ['分支', b.branch], ['场景', b.scene], ['标签', b.tag], ['强度', b.kind],
      ['核心', b.core], ['推荐人', b.by]].filter(function (f) { return f[1] })
  }
  function notes (b) {
    return [b.updates && '更新已有配装', b.review && '有审核意见',
      (b.bucket === 'pass' || b.state === 'dropping') && '等待本机落盘'].filter(Boolean)
  }
  function hands (b) {
    return [b.hand && '改 ' + b.hand, b.okBy && '审 ' + b.okBy, b.at && '最后动于 ' + b.at].filter(Boolean).join('　')
  }
  function trail (e) { return [e.page.group, e.page.up, e.page.title].filter(Boolean).join(' › ') }

  // 改动那一段加亮：与 admin.js 的 highlight() 同一个做法，按文字计数跨着色 span 包 <mark>。
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
  function side (html, keep) {
    var n = h('div', { html: html })
    var len = n.textContent.length
    if (keep[0] || keep[1]) highlight(n, keep[0], len - keep[1])
    return n
  }
  function diffStack (e) {
    return h('div', { class: 'diff' },
      h('div', { class: 'del' }, side(e.beforeHtml, e.keep)),
      h('div', { class: 'add' }, side(e.afterHtml, e.keep)))
  }
  function diffSide (e) {
    return h('div', { class: 'diff2' },
      h('div', { class: 'was' }, h('p', { class: 'cap', text: '原文' }), side(e.beforeHtml, e.keep)),
      h('div', { class: 'now' }, h('p', { class: 'cap', text: '改为' }), side(e.afterHtml, e.keep)))
  }
  function groupsOf (doc) {
    var at = {}
    var out = []
    pend.filter(function (e) { return e.doc === doc }).forEach(function (e) {
      var k = e.blk + ':' + e.cell
      if (!at[k]) { at[k] = { list: [] }; out.push(at[k]) }
      at[k].list.push(e)
    })
    return out
  }
  function op (text, cls) { return h('button', { type: 'button', class: 'op' + (cls ? ' ' + cls : ''), text: text }) }
  function sep () { return h('span', { class: 'op-sep', 'aria-hidden': 'true' }) }

  // 填表页那一格：真的 builds/new 页。npm start 下同源，灌得进正文；file:// 下只看得到空表。
  function formFrame (b, tall) {
    var fr = h('iframe', { class: 'form' + (tall ? ' tall' : ''), src: '../../builds/new/index.html', title: '填表页' })
    fr.onload = function () {
      try {
        var w = fr.contentWindow
        if (w.starsideForm.review) w.starsideForm.review(true)
        w.starsideForm.load(b.md)
        var send = w.document.getElementById('send')
        if (send) send.remove()
      } catch (err) { /* file:// 下跨源，空表照样看得出版面 */ }
    }
    return fr
  }

  function buildTree (list) {
    var n = {}
    list.forEach(function (b) {
      var c = (b.scene || '没写场景').split('、')[0]
      n[c] = (n[c] || 0) + 1
      n[c + '\t' + b.cls] = (n[c + '\t' + b.cls] || 0) + 1
    })
    var out = [['全部', list.length, 0, true]]
    P.vocab.scenes.filter(function (c) { return n[c] }).forEach(function (c) {
      out.push([c, n[c], 0])
      P.vocab.classes.concat(['多职业']).filter(function (k) { return n[c + '\t' + k] })
        .forEach(function (k) { out.push([k, n[c + '\t' + k], 1]) })
    })
    return out
  }
  function docTree (docs, count) {
    var out = []
    var groups = []
    docs.forEach(function (d) {
      var p = PAGES.filter(function (r) { return r[0] === d })[0]
      if (groups.indexOf(p[3]) < 0) groups.push(p[3])
    })
    groups.forEach(function (g) {
      out.push(['group', g])
      docs.forEach(function (d) {
        var p = PAGES.filter(function (r) { return r[0] === d })[0]
        if (p[3] === g) out.push(['page', p[1], count(d), d])
      })
    })
    return out
  }

  // ════════════════════════════════════════════════════════════════════
  // A · 顶栏 + 表格：信息架构不动。标签并进导航行，列表加列头，详情仍摊在列表下面。
  // ════════════════════════════════════════════════════════════════════
  var A = {}
  A.shell = function (tab, body, opts) {
    opts = opts || {}
    var tabs = h('div', { class: 'a-tabs' }, [['builds', '配装', cnt('sub')], ['review', '文档', cnt('doc')],
      ['hist', '记录'], ['eds', '编辑者']].map(function (t) {
      return h('button', { type: 'button', class: 'a-tab', 'aria-current': tab === t[0] ? 'true' : null,
        onclick: function () { go(null, t[0]) } }, t[1], t[2] ? h('span', { class: 'badge', text: String(t[2]) }) : null)
    }))
    return h('div', { class: 'a' },
      h('div', { class: 'site-head' },
        h('nav', { class: 'site-nav a-nav' },
          h('span', { class: 'mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('a', { class: 'home', href: '../../index.html', text: 'Starside' }),
          h('span', { class: 'sep', text: '/' }),
          h('span', { 'aria-current': 'page', text: '编辑台' }),
          opts.bare ? null : tabs,
          opts.bare ? null : h('p', { class: 'a-who' }, h('span', { text: P.me.name }),
            h('span', { class: 'lv', text: LV[P.me.lv] }), op('退出')))),
      h('main', { class: 'a-main' + (opts.center ? ' center' : '') }, body))
  }
  A.login = function () {
    return A.shell(null, h('section', { class: 'a-gate' },
      h('h1', { text: '编辑台' }),
      h('p', { class: 'lede', text: '账号由管理员创建，没有自助注册。' }),
      h('form', { class: 'a-login', onsubmit: function (ev) { ev.preventDefault() } },
        h('label', null, '用户名', h('input', { class: 'tool-search', autocomplete: 'username' })),
        h('label', null, '密码', h('input', { class: 'tool-search', type: 'password' })),
        h('button', { type: 'submit', class: 'op fill', text: '登录' })),
      h('p', { class: 'tip bad', text: '登录失败：用户名或密码不对' })), { bare: true, center: true })
  }
  A.loading = function () {
    return A.shell('builds', h('div', { class: 'a-desk' },
      h('div', { class: 'sk-tree' }, [0, 1, 2, 3, 4, 5].map(function () { return h('i') })),
      h('div', null, h('div', { class: 'sk-bar' }),
        h('div', { class: 'sk-rows' }, [0, 1, 2, 3, 4, 5, 6, 7].map(function () { return h('i') })))))
  }
  A.tree = function (rows) {
    return h('nav', { class: 'a-tree' }, rows.map(function (r) {
      return h('button', { type: 'button', class: 'a-tree-row' + (r[2] ? ' sub' : '') + (r[3] ? ' on' : '') },
        h('span', { class: 'id', text: r[0] }), h('span', { class: 'n', text: String(r[1]) }))
    }))
  }
  A.filters = function (on) {
    return h('div', { class: 'a-filters' },
      h('div', { class: 'a-states' }, STATE.map(function (s) {
        return h('button', { type: 'button', class: 'a-state', 'aria-pressed': on[s[0]] ? 'true' : 'false',
          title: '' }, s[1], h('span', { class: 'n', text: String(byBucket(s[0]).length) }))
      })),
      h('input', { class: 'tool-search', type: 'search', placeholder: '搜名字、推荐人、核心' }),
      sep(), op('清空废稿（2）'))
  }
  A.table = function (list, openId) {
    var head = h('div', { class: 'a-th' }, ['状态', '名字', '职业', '分支', '场景', '标签', '强度', '推荐人', '', '更新'].map(function (t) {
      return h('span', { text: t })
    }))
    return h('div', { class: 'a-table' }, head, list.map(function (b) {
      return h('button', { type: 'button', class: 'a-tr' + (b.slug ? ' b-' + b.slug : '') + (openId === b.id ? ' open' : ''),
        onclick: function () { go(null, 'detail') } },
        flag(b),
        h('span', { class: 'id', text: (b.drop ? '申请删除　' : '') + b.name }),
        h('span', { class: 'c', text: b.cls }),
        h('span', { class: 'c', text: b.branch || '—' }),
        h('span', { class: 'c', text: b.scene || '—' }),
        h('span', { class: 'c', text: b.tag || '' }),
        h('span', { class: 'kind', text: b.kind || '—' }),
        h('span', { class: 'by', text: b.by || '—' }),
        b.sets ? h('span', { class: 'sets', text: b.sets + ' 套' }) : h('span'),
        h('span', { class: 'at', text: b.at }),
        b.lack.length ? h('span', { class: 'lack', text: '缺 ' + b.lack.join('、') }) : null)
    }))
  }
  A.builds = function (openId) {
    return h('div', { class: 'a-desk' }, A.tree(buildTree(waitList)),
      h('div', null, A.filters({ wait: 1 }), A.table(waitList, openId)))
  }
  A.stage = function (b) {
    return h('section', { class: 'a-stage', id: 'stage' },
      h('div', { class: 'a-stage-head' },
        h('div', null,
          h('div', { class: 'a-stage-nav' }, h('button', { type: 'button', class: 'toggle', text: '← 收起' }), op('截图')),
          h('h2', null, b.name, flag(b)),
          h('dl', { class: 'a-facts' }, facts(b).map(function (f) {
            return h('div', null, h('dt', { text: f[0] }), h('dd', { text: f[1] }))
          })),
          notes(b).length ? h('p', { class: 'a-notes' }, notes(b).map(function (t) { return h('span', { text: t }) })) : null,
          h('p', { class: 'a-hands', text: hands(b) || '没有经手记录' })),
        h('div', { class: 'a-ops' }, op('保存'), op('通过', 'go'), op('驳回'))),
      formFrame(b),
      h('details', { class: 'a-src' }, h('summary', { text: '原文' }), h('pre', { text: b.md })))
  }
  A.review = function (empty) {
    var count = function (d) { return pend.filter(function (e) { return e.doc === d }).length }
    if (empty) {
      return h('div', { class: 'a-desk' }, h('nav', { class: 'a-tree' }),
        A.empty('文档改动都审完了', '资料页上提交的改动会排在这里；已结案的在「记录」里。', '看记录'))
    }
    var p = pend.filter(function (e) { return e.doc === openDoc })[0].page
    var groups = groupsOf(openDoc)
    var bad = groups.filter(function (g) { return g.list.length > 1 || g.list.some(function (e) { return e.stale }) }).length
    return h('div', { class: 'a-desk' },
      h('nav', { class: 'a-tree' }, docTree(pendDocs, count).map(function (r) {
        return r[0] === 'group' ? h('div', { class: 'a-tree-group', text: r[1] })
          : h('button', { type: 'button', class: 'a-tree-row' + (r[3] === openDoc ? ' on' : '') },
            h('span', { class: 'id', text: r[1] }), h('span', { class: 'n pend', text: String(r[2]) }))
      })),
      h('div', null,
        h('div', { class: 'a-view-head' },
          h('div', null, h('p', { class: 'crumb', text: [p.group, p.up].filter(Boolean).join(' › ') }),
            h('h2', null, p.title, h('span', { class: 'count', text: count(openDoc) + ' 处待审' }))),
          h('div', { class: 'a-head-ops' }, h('a', { class: 'chip', href: '../../' + p.url, text: '查看页面' }),
            h('button', { type: 'button', class: 'op go', disabled: bad ? true : null, text: '全部通过（' + count(openDoc) + '）' }))),
        bad ? h('p', { class: 'a-warn', text: bad + ' 处冲突，逐处挑完才能全部通过；底稿已变的不能通过。' }) : null,
        groups.map(function (g) {
          var conflict = g.list.length > 1
          var stale = g.list.some(function (e) { return e.stale })
          return h('section', { class: 'a-pane' + (conflict || stale ? ' bad' : '') },
            h('h3', null, h('span', { text: g.list[0].spot }),
              conflict ? h('span', { class: 'tag', text: g.list.length + ' 份冲突，挑一份' }) : null,
              stale ? h('span', { class: 'tag', text: '底稿已变' }) : null),
            g.list.map(function (e) {
              return h('div', { class: 'a-cand' },
                h('p', { class: 'by' }, h('b', { text: e.by }), '　' + e.at, e.stale ? '　基于旧文' : ''),
                h('div', { class: 'acts' }, h('button', { type: 'button', class: 'op go', disabled: e.stale ? true : null,
                  text: conflict ? '用这份' : '通过' }), op('驳回')),
                diffStack(e))
            }),
            stale ? h('div', { class: 'a-pane-foot' }, op('保持现状'), h('span', { class: 'warn', text: '底稿已变，请回资料页重新提交' })) : null)
        }))
    )
  }
  A.hist = function () {
    var count = {}
    closed.forEach(function (e) { count[e.doc] = (count[e.doc] || 0) + 1 })
    var docs = Object.keys(count).sort()
    return h('div', { class: 'a-desk' },
      h('nav', { class: 'a-tree' }, docTree(docs, function (d) { return count[d] }).map(function (r) {
        return r[0] === 'group' ? h('div', { class: 'a-tree-group', text: r[1] })
          : h('button', { type: 'button', class: 'a-tree-row' },
            h('span', { class: 'id', text: r[1] }), h('span', { class: 'n', text: String(r[2]) }))
      })),
      h('div', null,
        h('div', { class: 'a-view-head' }, h('div', null, h('h2', null, '全站', h('span', { class: 'count', text: closed.length + ' 条' })))),
        h('div', { class: 'a-list' }, closed.map(function (e, i) {
          var row = h('button', { type: 'button', class: 'a-hr' + (i === 0 ? ' open' : '') },
            h('span', { class: 'flag ' + (e.ok === 1 ? 'pass' : 'no'), text: e.ok === 1 ? '通过' : '驳回' }),
            h('span', { class: 'id' }, h('span', { class: 'trail', text: trail(e) }), h('span', { text: e.spot })),
            h('span', { class: 'who', text: e.by + ' → ' + e.okBy }),
            h('span', { class: 'at', text: e.at }))
          return i === 0 ? [row, h('div', { class: 'a-fold' }, diffStack(e))] : row
        }))))
  }
  A.eds = function () {
    return h('div', { class: 'a-narrow' },
      h('div', { class: 'a-view-head' }, h('div', null, h('h2', null, '编辑者', h('span', { class: 'count', text: P.eds.length + ' 人' })))),
      h('div', { class: 'a-eds' },
        h('div', { class: 'a-th' }, ['名字', 'UID', '级别', ''].map(function (t) { return h('span', { text: t }) })),
        P.eds.map(function (u) {
          return h('div', { class: 'a-ed' },
            h('span', { class: 'id', text: u.name }), h('code', { text: u._id }),
            h('span', { class: 'lv', text: LV[u.lv] }),
            u.lv < P.me.lv ? h('span', { class: 'acts' }, op('改名'), sep(), op('移除')) : h('span', { class: 'self', text: '你' }))
        })),
      h('h3', { class: 'a-sub', text: '添加编辑者' }),
      h('form', { class: 'a-add', onsubmit: function (ev) { ev.preventDefault() } },
        h('label', null, 'UID', h('input', { class: 'tool-search', placeholder: '对方登录后页面上显示的那一串' })),
        h('label', null, '名字', h('input', { class: 'tool-search' })),
        h('label', null, '级别', h('select', { class: 'tool-search' }, [1, 2, 3].map(function (i) {
          return h('option', { text: LV[i] + '（' + i + '）' })
        }))),
        h('button', { type: 'submit', class: 'op go', text: '添加' })))
  }
  A.empty = function (title, text, link) {
    return h('div', { class: 'a-empty' }, h('h3', { text: title }), h('p', { text: text }),
      link ? h('button', { type: 'button', class: 'chip', text: link, onclick: function () { go(null, 'hist') } }) : null)
  }
  A.render = function () {
    if (screen === 'login') return A.login()
    if (screen === 'loading') return A.loading()
    if (screen === 'builds') return A.shell('builds', A.builds())
    if (screen === 'detail') {
      return A.shell('builds', [A.builds(pick.id), A.stage(pick)])
    }
    if (screen === 'review') return A.shell('review', A.review())
    if (screen === 'hist') return A.shell('hist', A.hist())
    if (screen === 'eds') return A.shell('eds', A.eds())
    return A.shell('builds', h('div', { class: 'a-desk' }, h('nav', { class: 'a-tree' }),
      h('div', null, A.filters({ wait: 1 }),
        A.empty('没有待审的配装', '投稿都审完了。别的状态在上面那一排切换。'))))
  }

  // ════════════════════════════════════════════════════════════════════
  // B · 三栏：左侧导航栏、中间队列、右侧详情。点队列里一条，详情在右边换，
  // 不再摊到列表下面。
  // ════════════════════════════════════════════════════════════════════
  var B = {}
  B.rail = function (tab) {
    return h('aside', { class: 'b-rail' },
      h('a', { class: 'b-brand', href: '../../index.html' },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('span', null, h('b', { text: 'STARSIDE' }), h('span', { text: '编辑台' }))),
      h('nav', { class: 'b-nav' }, [['builds', '配装', cnt('sub')], ['review', '文档', cnt('doc')],
        ['hist', '记录'], ['eds', '编辑者']].map(function (t) {
        return h('button', { type: 'button', class: 'b-nav-row', 'aria-current': tab === t[0] ? 'true' : null,
          onclick: function () { go(null, t[0]) } }, h('span', { text: t[1] }), t[2] ? h('span', { class: 'badge', text: String(t[2]) }) : null)
      })),
      h('div', { class: 'b-me' }, h('p', { class: 'name', text: P.me.name }), h('p', { class: 'lv', text: LV[P.me.lv] }), op('退出')))
  }
  B.shell = function (tab, queue, detail) {
    return h('div', { class: 'b' }, B.rail(tab), h('section', { class: 'b-queue' }, queue), h('section', { class: 'b-detail' }, detail))
  }
  B.qhead = function (title, count, tools) {
    return h('div', { class: 'b-qhead' }, h('h2', null, title, count != null ? h('span', { class: 'count', text: String(count) }) : null), tools)
  }
  B.seg = function () {
    return h('div', { class: 'b-seg' }, STATE.map(function (s) {
      return h('button', { type: 'button', 'aria-pressed': s[0] === 'wait' ? 'true' : 'false' },
        s[1], h('span', { class: 'n', text: String(byBucket(s[0]).length) }))
    }))
  }
  B.buildQueue = function (sel) {
    var groups = {}
    var order = []
    waitList.forEach(function (b) {
      var g = (b.scene || '没写场景').split('、')[0]
      if (!groups[g]) { groups[g] = []; order.push(g) }
      groups[g].push(b)
    })
    return [B.qhead('配装', null, h('input', { class: 'tool-search', type: 'search', placeholder: '搜名字、推荐人、核心' })),
      B.seg(),
      h('div', { class: 'b-items' }, order.map(function (g) {
        return [h('p', { class: 'b-group' }, h('span', { text: g }), h('span', { text: String(groups[g].length) })),
          groups[g].map(function (b) {
            return h('button', { type: 'button', class: 'b-item' + (b.slug ? ' b-' + b.slug : '') + (sel === b.id ? ' on' : ''),
              onclick: function () { go(null, 'detail') } },
              h('span', { class: 'l1' }, h('span', { class: 'id', text: (b.drop ? '申请删除　' : '') + b.name }), h('span', { class: 'at', text: b.at.slice(5) })),
              h('span', { class: 'l2' }, [b.cls, b.branch, b.kind, b.by].filter(Boolean).join('　')),
              b.lack.length ? h('span', { class: 'lack', text: '缺 ' + b.lack.join('、') }) : null,
              b.drop || b.sets ? h('span', { class: 'l3' }, b.drop ? flag(b) : null, b.sets ? h('span', { class: 'sets', text: b.sets + ' 套' }) : null) : null)
          })]
      }))]
  }
  B.pickHint = function () {
    return h('div', { class: 'b-hint' },
      h('h3', { text: '从左边的队列里选一条' }),
      h('p', { text: '待审按投稿先后排，最早的在最上面。通过或驳回之后，这里自动换成下一条。' }),
      h('dl', { class: 'b-stats' }, STATE.map(function (s) {
        return h('div', null, h('dt', { text: s[1] }), h('dd', { text: String(byBucket(s[0]).length) }))
      })))
  }
  B.detail = function (b) {
    return [h('header', { class: 'b-dhead' },
      h('div', null,
        h('p', { class: 'crumb', text: [b.scene, b.cls].join(' › ') }),
        h('h2', null, b.name, flag(b)),
        h('p', { class: 'b-facts' }, facts(b).filter(function (f) { return f[0] !== '场景' }).map(function (f) {
          return h('span', null, h('i', { text: f[0] }), f[1])
        })),
        h('p', { class: 'b-hands', text: hands(b) })),
      h('div', { class: 'b-ops' }, op('截图'), op('保存'), op('通过', 'go'), op('驳回'))),
      formFrame(b, true)]
  }
  B.review = function () {
    var count = function (d) { return pend.filter(function (e) { return e.doc === d }).length }
    var p = pend.filter(function (e) { return e.doc === openDoc })[0].page
    var groups = groupsOf(openDoc)
    var queue = [B.qhead('文档', pend.length), h('div', { class: 'b-items' }, docTree(pendDocs, count).map(function (r) {
      return r[0] === 'group' ? h('p', { class: 'b-group' }, h('span', { text: r[1] }))
        : h('button', { type: 'button', class: 'b-item' + (r[3] === openDoc ? ' on' : '') },
          h('span', { class: 'l1' }, h('span', { class: 'id', text: r[1] }), h('span', { class: 'badge', text: String(r[2]) })),
          h('span', { class: 'l2', text: pend.filter(function (e) { return e.doc === r[3] }).map(function (e) { return e.by })
            .filter(function (x, i, a) { return a.indexOf(x) === i }).join('、') + ' 提交' }))
    }))]
    var detail = [h('header', { class: 'b-dhead' },
      h('div', null, h('p', { class: 'crumb', text: [p.group, p.up].filter(Boolean).join(' › ') }),
        h('h2', null, p.title), h('p', { class: 'b-hands', text: count(openDoc) + ' 处待审，' + groups.filter(function (g) { return g.list.length > 1 }).length + ' 处有冲突' })),
      h('div', { class: 'b-ops' }, h('a', { class: 'chip', href: '../../' + p.url, text: '查看页面' }), op('全部通过', 'go'))),
    h('div', { class: 'b-changes' }, groups.map(function (g) {
      return h('section', { class: 'b-change' + (g.list.length > 1 || g.list.some(function (e) { return e.stale }) ? ' bad' : '') },
        h('div', { class: 'b-where' }, h('span', { text: g.list[0].spot }),
          g.list.length > 1 ? h('span', { class: 'tag', text: g.list.length + ' 份冲突' }) : null,
          g.list.some(function (e) { return e.stale }) ? h('span', { class: 'tag', text: '底稿已变' }) : null),
        g.list.map(function (e) {
          return h('div', { class: 'b-cand' },
            h('div', { class: 'b-cand-meta' }, h('b', { text: e.by }), h('span', { text: e.at }),
              h('span', { class: 'acts' }, h('button', { type: 'button', class: 'op go', disabled: e.stale ? true : null,
                text: g.list.length > 1 ? '用这份' : '通过' }), op('驳回'))),
            diffStack(e))
        }))
    }))]
    return B.shell('review', queue, detail)
  }
  B.hist = function () {
    var e0 = closed[0]
    var queue = [B.qhead('记录', closed.length, h('input', { class: 'tool-search', type: 'search', placeholder: '按页面或人名筛' })),
      h('div', { class: 'b-items' }, closed.map(function (e, i) {
        return h('button', { type: 'button', class: 'b-item' + (i === 0 ? ' on' : '') },
          h('span', { class: 'l1' }, h('span', { class: 'id', text: e.page.title + '　' + e.spot }), h('span', { class: 'at', text: e.at.slice(5) })),
          h('span', { class: 'l2' }, h('span', { class: 'flag ' + (e.ok === 1 ? 'pass' : 'no'), text: e.ok === 1 ? '通过' : '驳回' }),
            '　' + e.by + ' → ' + e.okBy))
      }))]
    var detail = [h('header', { class: 'b-dhead' },
      h('div', null, h('p', { class: 'crumb', text: trail(e0) }), h('h2', null, e0.spot,
        h('span', { class: 'flag ' + (e0.ok === 1 ? 'pass' : 'no'), text: e0.ok === 1 ? '通过' : '驳回' })),
      h('p', { class: 'b-hands', text: e0.by + ' 提交，' + e0.okBy + ' 审，' + e0.at })),
      h('div', { class: 'b-ops' }, h('a', { class: 'chip', href: '../../' + e0.page.url, text: '查看页面' }))),
      h('div', { class: 'b-changes' }, diffSide(e0))]
    return B.shell('hist', queue, detail)
  }
  B.eds = function () {
    var u0 = P.eds[1]
    var queue = [B.qhead('编辑者', P.eds.length, op('添加', 'go')),
      h('div', { class: 'b-items' }, P.eds.map(function (u) {
        return h('button', { type: 'button', class: 'b-item' + (u === u0 ? ' on' : '') },
          h('span', { class: 'l1' }, h('span', { class: 'id', text: u.name }), h('span', { class: 'lvtag', text: LV[u.lv] })),
          h('span', { class: 'l2 mono', text: u._id }))
      }))]
    var detail = [h('header', { class: 'b-dhead' },
      h('div', null, h('p', { class: 'crumb', text: '编辑者' }), h('h2', null, u0.name), h('p', { class: 'b-hands mono', text: u0._id }))),
    h('form', { class: 'b-form', onsubmit: function (ev) { ev.preventDefault() } },
      h('label', null, '名字', h('input', { class: 'tool-search', value: u0.name })),
      h('fieldset', null, h('legend', { text: '级别' }), [1, 2, 3].map(function (i) {
        return h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'lv', checked: u0.lv === i ? true : null }),
          h('span', null, h('b', { text: LV[i] }), h('span', { text: ['读源稿、存草稿、提交待审', '另可通过与驳回', '同审核员'][i - 1] })))
      })),
      h('div', { class: 'b-form-ops' }, op('保存', 'go'), sep(), op('移除')))]
    return B.shell('eds', queue, detail)
  }
  B.login = function () {
    return h('div', { class: 'b-login' },
      h('div', { class: 'b-login-col' },
        h('a', { class: 'b-brand', href: '../../index.html' },
          h('span', { class: 'mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('span', null, h('b', { text: 'STARSIDE' }), h('span', { text: '编辑台' }))),
        h('form', { class: 'b-login-form', onsubmit: function (ev) { ev.preventDefault() } },
          h('h1', { text: '登录' }),
          h('label', null, '用户名', h('input', { class: 'tool-search', autocomplete: 'username' })),
          h('label', null, '密码', h('input', { class: 'tool-search', type: 'password' })),
          h('button', { type: 'submit', class: 'op fill', text: '登录' }),
          h('p', { class: 'lede', text: '账号由管理员创建，没有自助注册。' }))),
      h('div', { class: 'b-login-side' }))
  }
  B.loading = function () {
    return h('div', { class: 'b' }, B.rail('builds'),
      h('section', { class: 'b-queue' }, h('div', { class: 'sk-bar' }), h('div', { class: 'sk-items' }, [0, 1, 2, 3, 4, 5, 6].map(function () { return h('i') }))),
      h('section', { class: 'b-detail' }, h('div', { class: 'sk-detail' }, h('i'), h('i'), h('b'))))
  }
  B.render = function () {
    if (screen === 'login') return B.login()
    if (screen === 'loading') return B.loading()
    if (screen === 'builds') return B.shell('builds', B.buildQueue(), B.pickHint())
    if (screen === 'detail') return B.shell('builds', B.buildQueue(pick.id), B.detail(pick))
    if (screen === 'review') return B.review()
    if (screen === 'hist') return B.hist()
    if (screen === 'eds') return B.eds()
    return B.shell('review', [B.qhead('文档', 0), h('p', { class: 'b-qempty', text: '队列是空的' })],
      h('div', { class: 'b-hint' }, h('h3', { text: '文档改动都审完了' }),
        h('p', { text: '资料页上提交的改动会排进左边的队列；已结案的在「记录」里。' }),
        h('button', { type: 'button', class: 'chip', text: '看记录', onclick: function () { go(null, 'hist') } })))
  }

  // ════════════════════════════════════════════════════════════════════
  // C · 单条专注：一次只摆一条，看完用键盘过。列表退成顶上一条可横滑的队列。
  // ════════════════════════════════════════════════════════════════════
  var C = {}
  C.shell = function (tab, body, opts) {
    opts = opts || {}
    return h('div', { class: 'c' },
      h('header', { class: 'c-top' },
        h('a', { class: 'c-brand', href: '../../index.html' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'STARSIDE'),
        opts.bare ? null : h('nav', { class: 'c-tabs' }, [['builds', '配装', cnt('sub')], ['review', '文档', cnt('doc')],
          ['hist', '记录'], ['eds', '编辑者']].map(function (t) {
          return h('button', { type: 'button', 'aria-current': tab === t[0] ? 'true' : null, onclick: function () { go(null, t[0]) } },
            t[1], t[2] ? h('span', { class: 'n', text: String(t[2]) }) : null)
        })),
        opts.bare ? null : h('p', { class: 'c-who' }, P.me.name + '　' + LV[P.me.lv], op('退出'))),
      opts.strip || null,
      h('main', { class: 'c-main' }, body))
  }
  C.strip = function (list, at) {
    return h('div', { class: 'c-strip' },
      h('p', { class: 'c-pos' }, h('b', { text: String(at + 1) }), ' / ' + list.length),
      h('div', { class: 'c-pills' }, list.map(function (b, i) {
        return h('button', { type: 'button', class: 'c-pill' + (i === at ? ' on' : '') + (i < at ? ' done' : '') + (b.slug ? ' b-' + b.slug : ''),
          text: b.name, onclick: function () { go(null, 'detail') } })
      })),
      h('p', { class: 'c-keys' }, kbd('J'), kbd('K'), ' 上下条'))
  }
  C.login = function () {
    return h('div', { class: 'c-login' },
      h('div', { class: 'c-login-mark' },
        h('span', { class: 'mark big', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('h1', null, h('span', { text: 'STARSIDE' }), '编辑台'),
        h('p', { text: '配装投稿与资料页改动在这里审。落盘、构建与部署仍在本机。' })),
      h('form', { class: 'c-login-form', onsubmit: function (ev) { ev.preventDefault() } },
        h('label', null, '用户名', h('input', { class: 'tool-search', autocomplete: 'username' })),
        h('label', null, '密码', h('input', { class: 'tool-search', type: 'password' })),
        h('button', { type: 'submit', class: 'op fill', text: '登录' }),
        h('p', { class: 'lede', text: '账号由管理员创建，没有自助注册。' })))
  }
  C.loading = function () {
    return C.shell('builds', h('div', { class: 'sk-focus' }, h('i'), h('i'), h('i'), h('b')),
      { strip: h('div', { class: 'c-strip' }, h('div', { class: 'sk-pills' }, [0, 1, 2, 3, 4, 5].map(function () { return h('i') }))) })
  }
  C.board = function () {
    var groups = {}
    var order = []
    waitList.forEach(function (b) {
      var g = (b.scene || '没写场景').split('、')[0]
      if (!groups[g]) { groups[g] = []; order.push(g) }
      groups[g].push(b)
    })
    return C.shell('builds', [
      h('div', { class: 'c-hero' },
        h('div', null, h('p', { class: 'crumb', text: '配装投稿' }),
          h('h2', null, h('b', { text: String(waitList.length) }), ' 条待审'),
          h('p', { class: 'lede', text: '最早一条等了 ' + Math.floor((Date.now() - Date.parse(waitList[0].rawAt)) / 864e5) + ' 天。按投稿先后逐条过，审完自动进下一条。' })),
        h('div', { class: 'c-hero-ops' }, h('button', { type: 'button', class: 'op fill', text: '从最早一条开始', onclick: function () { go(null, 'detail') } }),
          h('p', { class: 'c-keys' }, kbd('Enter'), ' 开始'))),
      h('div', { class: 'c-cols' }, order.map(function (g) {
        return h('section', { class: 'c-col' }, h('h3', null, g, h('span', { text: String(groups[g].length) })),
          groups[g].map(function (b) {
            return h('button', { type: 'button', class: 'c-card' + (b.slug ? ' b-' + b.slug : ''), onclick: function () { go(null, 'detail') } },
              h('span', { class: 'id', text: (b.drop ? '申请删除　' : '') + b.name }),
              h('span', { class: 'l2', text: [b.cls, b.branch, b.kind].filter(Boolean).join('　') }),
              h('span', { class: 'l3' }, h('span', { text: b.by || '没写推荐人' }), h('span', { text: b.at.slice(5) })),
              b.lack.length ? h('span', { class: 'lack', text: '缺 ' + b.lack.length + ' 项' }) : null)
          }))
      })),
      h('p', { class: 'c-more' }, '另有 ', h('b', { text: '通过 ' + byBucket('pass').length }), '、', h('b', { text: '完成 ' + byBucket('live').length }),
        '、', h('b', { text: '驳回 ' + byBucket('no').length }), '，', h('button', { type: 'button', class: 'chip', text: '按状态浏览全部' }))])
  }
  C.focus = function (b) {
    var at = waitList.indexOf(b)
    return C.shell('builds', [
      h('article', { class: 'c-focus' + (b.slug ? ' b-' + b.slug : '') },
        h('div', { class: 'c-focus-head' },
          h('div', null, h('p', { class: 'crumb' }, flag(b), '　' + [b.scene, b.at].join('　')),
            h('h2', { text: b.name }),
            h('p', { class: 'c-hands', text: hands(b) })),
          h('div', { class: 'c-decide' },
            h('div', { class: 'row' }, op('驳回'), op('保存'), op('通过', 'go')),
            h('p', { class: 'c-keys' }, kbd('R'), ' 驳回　', kbd('S'), ' 保存　', kbd('A'), ' 通过'))),
        h('dl', { class: 'c-facts' }, facts(b).filter(function (f) { return f[0] !== '场景' }).map(function (f) {
          return h('div', null, h('dt', { text: f[0] }), h('dd', { text: f[1] }))
        })),
        notes(b).length ? h('p', { class: 'c-notes' }, notes(b).map(function (t) { return h('span', { text: t }) })) : null),
      formFrame(b, true)], { strip: C.strip(waitList, at) })
  }
  C.review = function () {
    var list = pend.filter(function (e) { return e.doc === openDoc })
    var e = list.filter(function (x) { return !x.stale })[1] || list[0]
    var at = list.indexOf(e)
    var dup = list.filter(function (x) { return x.blk === e.blk && x.cell === e.cell })
    return C.shell('review', [
      h('div', { class: 'c-rhead' },
        h('div', null, h('p', { class: 'crumb', text: trail(e) }), h('h2', null, e.spot)),
        h('div', { class: 'c-steps' }, list.map(function (x, i) {
          return h('span', { class: 'step' + (i === at ? ' on' : '') + (i < at ? ' done' : '') + (x.stale ? ' stale' : ''), title: x.spot })
        }), h('span', { class: 'c-pos' }, h('b', { text: String(at + 1) }), ' / ' + list.length))),
      dup.length > 1 ? h('p', { class: 'c-warn', text: '这一格有 ' + dup.length + ' 份改动，挑一份通过，其余自动驳回。' }) : null,
      (dup.length > 1 ? dup : [e]).map(function (x) {
        return h('section', { class: 'c-change' },
          h('p', { class: 'c-by' }, h('b', { text: x.by }), '　' + x.at),
          diffSide(x),
          h('div', { class: 'c-decide row' }, op('驳回'), op(dup.length > 1 ? '用这份' : '通过', 'go')))
      }),
      h('p', { class: 'c-keys center' }, kbd('A'), ' 通过　', kbd('R'), ' 驳回　', kbd('J'), kbd('K'), ' 上下处　',
        h('a', { class: 'chip', href: '../../' + e.page.url, text: '在页面上看这一格' }))],
    { strip: h('div', { class: 'c-strip' }, h('p', { class: 'c-pos' }, '文档', h('b', { text: '　' + pend.length }), ' 处待审'),
      h('div', { class: 'c-pills' }, pendDocs.map(function (d) {
        var p = pend.filter(function (x) { return x.doc === d })
        return h('button', { type: 'button', class: 'c-pill' + (d === openDoc ? ' on' : '') }, p[0].page.title, h('span', { class: 'n', text: String(p.length) }))
      }))) })
  }
  C.hist = function () {
    var days = {}
    var order = []
    closed.forEach(function (e) {
      var d = e.at.slice(0, 10)
      if (!days[d]) { days[d] = []; order.push(d) }
      days[d].push(e)
    })
    return C.shell('hist', h('div', { class: 'c-timeline' }, order.map(function (d, di) {
      return h('section', { class: 'c-day' }, h('h3', { text: d.slice(5).replace('-', ' 月 ') + ' 日' }),
        h('ol', null, days[d].map(function (e, i) {
          var open = di === 0 && i === 0
          return h('li', { class: open ? 'open' : '' },
            h('span', { class: 'time', text: e.at.slice(11) }),
            h('span', { class: 'dot ' + (e.ok === 1 ? 'pass' : 'no') }),
            h('div', null,
              h('p', { class: 'what' }, h('b', { text: e.okBy }), e.ok === 1 ? ' 通过了 ' : ' 驳回了 ', h('b', { text: e.by }),
                ' 在', h('span', { class: 'page', text: e.page.title }), e.spot + '的改动'),
              open ? diffSide(e) : null))
        })))
    })))
  }
  C.eds = function () {
    return C.shell('eds', [h('div', { class: 'c-rhead' }, h('div', null, h('p', { class: 'crumb', text: '只有超管看得到这一屏' }), h('h2', null, '编辑者 ', h('span', { class: 'count', text: P.eds.length + ' 人' }))),
      op('添加编辑者', 'go')),
    h('div', { class: 'c-roles' }, [4, 2, 1].map(function (lv) {
      var us = P.eds.filter(function (u) { return u.lv === lv })
      return h('section', { class: 'c-role' },
        h('h3', null, LV[lv], h('span', { text: String(us.length) })),
        h('p', { class: 'lede', text: { 4: '管名单，另可做审核员能做的一切', 2: '通过与驳回改动和投稿', 1: '读源稿、提交改动，不能审' }[lv] }),
        us.map(function (u) {
          return h('div', { class: 'c-person' }, h('p', { class: 'id', text: u.name }), h('code', { text: u._id }),
            u.lv < P.me.lv ? h('div', { class: 'row' }, op('改名'), op('改级别'), sep(), op('移除')) : h('p', { class: 'self', text: '你' }))
        }))
    }))])
  }
  C.render = function () {
    if (screen === 'login') return C.login()
    if (screen === 'loading') return C.loading()
    if (screen === 'builds') return C.board()
    if (screen === 'detail') return C.focus(pick)
    if (screen === 'review') return C.review()
    if (screen === 'hist') return C.hist()
    if (screen === 'eds') return C.eds()
    return C.shell('review', h('div', { class: 'c-done' },
      h('span', { class: 'mark big', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('h2', { text: '文档改动都审完了' }),
      h('p', { text: '已结案 ' + closed.length + ' 处，其中 ' + closed.filter(function (e) { return e.ok !== 1 }).length + ' 处驳回。新的改动提交后会出现在这里。' }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'op', text: '看今天的记录', onclick: function () { go(null, 'hist') } }),
        h('button', { type: 'button', class: 'op', text: '去审配装（' + cnt('sub') + '）', onclick: function () { go(null, 'builds') } }))))
  }

  // ── 切换条：原型自己的控件，与被评估的版面无关 ───────────────────────
  function switcher () {
    var vi = VARIANTS.map(function (v) { return v[0] }).indexOf(variant)
    var turn = function (d) { go(VARIANTS[(vi + d + VARIANTS.length) % VARIANTS.length][0]) }
    return h('div', { class: 'proto-bar' },
      h('div', { class: 'proto-v' },
        h('button', { type: 'button', text: '←', title: '上一套（←）', onclick: function () { turn(-1) } }),
        h('span', null, h('b', { text: variant }), ' ' + VARIANTS[vi][1]),
        h('button', { type: 'button', text: '→', title: '下一套（→）', onclick: function () { turn(1) } })),
      h('div', { class: 'proto-s' }, SCREENS.map(function (s, i) {
        return h('button', { type: 'button', 'aria-current': s[0] === screen ? 'true' : null, title: '按 ' + (i + 1),
          onclick: function () { go(null, s[0]) } }, s[1])
      })))
  }

  function render () {
    var app = document.getElementById('app')
    app.textContent = ''
    document.body.dataset.variant = variant
    document.body.dataset.screen = screen
    window.scrollTo(0, 0)
    app.appendChild(({ A: A, B: B, C: C })[variant].render())
    app.appendChild(switcher())
  }

  addEventListener('keydown', function (ev) {
    var t = ev.target
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return
    var vi = VARIANTS.map(function (v) { return v[0] }).indexOf(variant)
    if (ev.key === 'ArrowLeft') go(VARIANTS[(vi + VARIANTS.length - 1) % VARIANTS.length][0])
    else if (ev.key === 'ArrowRight') go(VARIANTS[(vi + 1) % VARIANTS.length][0])
    else if (/^[1-8]$/.test(ev.key)) go(null, SCREENS[Number(ev.key) - 1][0])
  })

  render()
})()
