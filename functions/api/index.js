// 站点唯一的后端：访问计数、点赞、配装投稿。
// 访问计数全部装在 counters/stat 这一条 doc 里：计费按数据库调用次数算，不按记录
// 条数，一条 doc 一次调用。页面级热度看 CDN 控制台的 URL 排行，不自己存。
// likes 管配装点赞，一条一套：_id 即「赛季_slug」，字段只有 n。
const crypto = require('crypto')
const zlib = require('zlib')
const tcb = require('@cloudbase/node-sdk')
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
const db = app.database()
const _ = db.command
const stat = db.collection('counters').doc('stat')
const likes = db.collection('likes')
const subs = db.collection('subs')
// 在线编辑台的三张表。docs 是源稿的工作副本，git 才是发布本，两边靠内容 hash 对账。
const docs = db.collection('docs')
const edits = db.collection('edits')
const eds = db.collection('editors')

// 审核台那几个动作要凭据。**没配 ADMIN_TOKEN 就一概拒**，不给「没设就放行」
// 那条路——那等于把待审队列与状态位开给所有人。
const ADMIN = process.env.ADMIN_TOKEN || ''

// exotic-weapon.md 是 159 KB，40 KB 的旧上限直接卡死资料页那一档。
const MAX_MD = 256 * 1024
const HEAD = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'cache-control': 'no-store',
}

// 北京时间的今天，形如 2026-09-01
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)

// stat 那条 doc 不存在时的累计初值，即从 pv:total 那批旧键搬过来的数。
const SEED_PV = 4668

// ponytail: 先 update 再 set，doc 不存在时才多一次往返。
// 同一个键当天首次并发写会互相覆盖成 1，掉几个数不值得上事务。
async function bump(col, id, by) {
  const r = await col.doc(id).update({ n: _.inc(by) })
  if (!r.updated && by > 0) await col.doc(id).set({ n: by })
}

// 一次访问一次调用：累计与当日两个数写在同一条 doc 的两个字段上，inc 是原子的、
// 并发安全。前端每浏览器每天只发一次，所以这里记的是访客数。日期键一天一个，
// 一年 365 个，doc 仍然很小。
async function hit() {
  const d = today()
  const r = await stat.update({ pv: _.inc(1), d: { [d]: _.inc(1) } })
  if (!r.updated) await stat.set({ pv: SEED_PV + 1, d: { [d]: 1 } })
}

// 赞数按五分钟缓存在函数实例的内存里：客户端那份缓存是每浏览器一小时、各存各的，
// 这一份是所有访客共用一份，读调用因此与访客数脱钩。实例回收即失效，读到的最多
// 旧五分钟——客户端本来就旧一小时。
let lk = { t: 0, m: null }
async function likeMap() {
  if (lk.m && Date.now() - lk.t < 3e5) return lk.m
  const r = await likes.limit(1000).get()
  const m = {}
  for (const d of r.data) m[d._id] = d.n
  lk = { t: Date.now(), m }
  return m
}

async function stats() {
  const c = (await stat.get()).data[0] || {}
  return { today: (c.d || {})[today()] || 0, total: c.pv || 0 }
}

// 同一套配装的判据：**名字、推荐人、职业、属性、核心五项一致即同一套**。
// 不再按装备判——改一把枪就成了另一套，而再投的人多半是想更新同一份。
// 这五项与 builds/new/form.js 的 NEED 是同一组：那边缺了不许投，这边缺了指纹也
// 算不出区分度。
const SAME = [/^#[ \t]*(.*)$/m, /^推荐人：(.*)$/m, /^职业：(.*)$/m,
              /^分支：(.*)$/m, /^核心：(.*)$/m]

function fingerprint(md) {
  // **只按头部算**。合集一份源稿装 N 套，`# ` 分隔；它的头部没有职业与分支两行，
  // 全文扫会静默抓到第一套成员的，调换前两套的顺序再投指纹就变了、顶不掉旧的，
  // 站上于是多出一份重复的合集，点赞数跟着甩掉。单套只有一个 `# `，切了等于没切。
  const head = md.split(/\n# /)[0]
  const parts = SAME.map((re) => ((re.exec(head) || ['', ''])[1] || '').replace(/\s+/g, ' ').trim())
  // \u0001 当分隔符：正文里不会出现，拼接因此不会把两项混成一项
  return crypto.createHash('sha1').update(parts.join('\u0001')).digest('hex')
}

function admin(body) {
  if (!ADMIN || body.k !== ADMIN) throw new Error('forbidden')
}

// ── 在线编辑台 ──

// 身份认证 v2 的 HTTP 端点。envId 本来就是公开的（静态托管域名里就有它）。
const ENV = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'dea-mods-d1g0j2rile2323f73'
const AUTH = `https://${ENV}.api.tcloudbasegateway.com`

// 待审 0、通过 1、驳回 -1。**不设草稿**：要改就当场改完再提，一份稿子挂在那里
// 越久，它的 base 越可能已经被别人的改动顶掉。
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex')
// 一处改动的上限。最长的表格行 1460 字，整段正文也远在这个数以下；超了不是
// 「一处改动」，是整篇替换，那条路线上不开。
const MAX_ONE = 8 * 1024

// ── 一处改动怎么定位 ──

// 表格行按 | 切出每一格「去掉首尾空格之后」的区间。与 tools/convert-doc.py 的
// split_cells() 同一条规则：记花括号深度，{ico|…} 内部的竖线不是分隔符。
// 返回区间而不是字符串，写回时才能只换那一格、把两侧的空格原样留着——整行重拼
// 会让改一个字的提交在 git diff 上标红一整行。
function cellSpans(line) {
  if (line[0] !== '|') return null
  const out = []
  let depth = 0
  let from = 1
  for (let i = 1; i <= line.length; i++) {
    const ch = line[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (i === line.length || (ch === '|' && depth === 0)) {
      let a = from
      let b = i
      while (a < b && line[a] === ' ') a++
      while (b > a && line[b - 1] === ' ') b--
      out.push([a, b])
      from = i + 1
      if (ch !== '|') break
    }
  }
  // 首尾各去一个 |，与 split_cells 的 removeprefix/removesuffix 对齐
  return out.length > 1 ? out.slice(0, -1) : out
}

// 在源稿里找这一处改动。**先按 before 原文匹配，blk/cell 只当同文本多处时的消歧**
// ——读者看到的页面是上次部署的产物，库里被通过的改动往前插了一个块之后，块号
// 整体偏移，而原文不会。先信块号会静默改错格。
function locate(md, e) {
  const lines = md.split('\n')
  const cell = Number(e.cell)
  const hits = []
  // 整块可能跨几行（空行分段的段落）。行数从 before 自己数出来，不另加字段。
  const want = cell < 0 ? String(e.before).split('\n') : null
  for (let i = 0; i < lines.length; i++) {
    if (cell < 0) {
      if (i + want.length <= lines.length
          && lines.slice(i, i + want.length).join('\n') === e.before) {
        hits.push({ line: i, span: null, len: want.length })
      }
      continue
    }
    const spans = cellSpans(lines[i])
    if (!spans || !spans[cell]) continue
    if (lines[i].slice(spans[cell][0], spans[cell][1]) === e.before) {
      hits.push({ line: i, span: spans[cell] })
    }
  }
  if (hits.length === 1) return hits[0]
  return hits.find((h) => h.line === Number(e.blk)) || null
}

function patch(md, at, after) {
  const lines = md.split('\n')
  if (at.span) {
    // 只换那一格，两侧的空格与其余各格原样留着——整行重拼会让改一个字的提交
    // 在 git diff 上标红一整行。
    lines[at.line] = lines[at.line].slice(0, at.span[0]) + after + lines[at.line].slice(at.span[1])
  } else {
    // 整块：原来几行、新的几行可以不等，按行段替换。
    lines.splice(at.line, at.len || 1, ...String(after).split('\n'))
  }
  return lines.join('\n')
}

// 令牌 → 身份，五分钟一份，与 likeMap() 缓存赞数同一套写法：校验要多打一次
// /auth/v1/user/me，缓存让这次往返与请求数脱钩。实例回收即失效。
const wc = new Map()

// 登录成功 ≠ 是编辑者：网关默认策略对任何自注册的注册用户都放行云函数，
// 所以身份由认证服务给，权限由 editors 这张白名单给，缺一条都不行。
async function who(event, need) {
  const t = String((event.headers || {}).authorization || '').replace(/^Bearer\s+/i, '')
  if (!t) throw new Error('forbidden')
  // .env.local 里那个令牌是 lv 5，压在四级之上，兼作破窗钥匙：sync.py 用它，
  // 第一个超管也靠它加进来。**必须高于 4**——判权那条是「只能动 lv 严格低于自己的」，
  // 破窗若也是 4 就造不出超管，引导整个走不通。
  if (ADMIN && t === ADMIN) return { uid: 'root', name: '本机', lv: 5 }

  let me = wc.get(t)
  if (!me || Date.now() - me.t > 3e5) {
    const r = await fetch(AUTH + '/auth/v1/user/me', { headers: { authorization: 'Bearer ' + t } })
    const uid = r.ok ? String((await r.json()).sub || '') : ''
    if (!uid) throw new Error('forbidden')
    const row = (await eds.doc(uid).get()).data[0]
    me = { t: Date.now(), uid, name: row ? row.name : '', lv: row ? Number(row.lv) || 0 : 0 }
    wc.set(t, me)
  }
  // **权限不足与令牌失效要分开**：前端收到 forbidden 会去换令牌再打一次，
  // 两件事共用一个词时，lv 不够的人点一下会白跑三趟，报出来的话还看不出是权限问题。
  if (me.lv < need) throw new Error('no permission')
  return me
}

async function editorRoute(a, body, event) {
  // lv 0 也放行：没进白名单的人要看得见自己的 uid，才知道让管理员加谁。
  if (a === 'me') {
    const me = await who(event, 0)
    return { uid: me.uid, name: me.name, lv: me.lv }
  }

  if (a === 'docs') {
    await who(event, 1)
    const r = await docs.field({ md: false }).limit(500).get()
    // **配装那些要带上 md，资料页那些不带。**投影是为资料页存在的：38 篇合计
    // 1.5 MB。配装 35 套合计 65 KB，而编辑台的列表要靠 md 读出名字、职业、分支、
    // 类别与推荐人——本机直接落盘的那 20 套在 subs 里没有投稿记录，不带 md 的话
    // 列表上连名字都只能显示 slug。
    const b = await docs.where({ _id: db.RegExp({ regexp: '^builds/', options: '' }) }).limit(200).get()
    const md = {}
    for (const d of b.data) md[d._id] = d.md
    return { docs: r.data.map((d) => (md[d._id] === undefined ? d : { ...d, md: md[d._id] })) }
  }

  if (a === 'doc') {
    await who(event, 1)
    const d = (await docs.doc(String(body.id)).get()).data[0]
    if (!d) throw new Error('no doc')
    return d
  }

  // 配装投稿的队列。与 list/mark 同一张表，区别只在凭据：那两个走 ADMIN_TOKEN
  // 给本机的 sync.py，这两个走白名单给编辑台。
  if (a === 'subs') {
    await who(event, 1)
    const r = await subs.limit(500).get()
    return { subs: r.data }
  }

  // 结案后留下的那一条改动记录：谁、什么时候、哪一篇、改了哪几行。
  if (a === 'hist') {
    await who(event, 1)
    const d = (await edits.doc(String(body.id)).get()).data[0]
    if (!d) throw new Error('no edit')
    return { diff: d.diff || '' }
  }

  // 投稿的通过与驳回。**通过必须带 season 与 slug 且当场验**：那两截要拼进
  // references/builds/<season>/<slug>.md 的路径，还要当点赞的 _id 用；
  // slug 重了会把上一份源稿盖掉，所以这里连查重一起做。
  // 投稿改完先存下来，状态不动。**细节多半有问题**——装备写错、名字还是「配装名」、
  // 推荐人空着；审的人在填表页上改完存一版，过一会儿再决定通过还是驳回，比一次
  // 按下去要么发布要么打回自然得多。
  if (a === 'ssave') {
    await who(event, 2)
    const md = String(body.md || '')
    if (!md.startsWith('# ') || md.length > MAX_MD) throw new Error('bad md')
    await subs.doc(String(body.id)).update({ md, at: new Date().toISOString() })
    return { ok: 1 }
  }

  // 已上站的配装就地改。**整篇替换，且只开给 builds/**：配装本来就是填表编辑，
  // 没有「一处改动」这个概念，资料页那套逐处审核在这里无从落脚。
  if (a === 'bsave') {
    const me = await who(event, 2)
    const id = String(body.id || '')
    if (!/^builds\/[^/]+\/[^/]+$/.test(id)) throw new Error('bad id')
    const md = String(body.md || '')
    if (!md.startsWith('# ') || md.length > MAX_MD) throw new Error('bad md')
    const cur = (await docs.doc(id).get()).data[0]
    if (!cur) throw new Error('no doc')
    await docs.doc(id).update({ md, hash: sha1(md), at: new Date().toISOString(), by: me.name })
    return { ok: 1 }
  }

  // 删掉废稿。**只删已驳回的**：待审的还没结案，已通过的是站上那一份的来处。
  // 去重从不查 ok=-1 那一档（见 sub 那两次 where），所以删了不会让废稿被当成新投稿
  // 重新收进来。不带 id 就把已驳回的一次清干净——33 条废稿逐条点不现实。
  if (a === 'sdrop') {
    // 单条删已驳回的：审核员就行。**整批清空要超管**——一次抹掉几十条，
    // 手滑的代价与逐条不是一个量级。
    await who(event, body.id ? 2 : 4)
    if (body.id) {
      const one = (await subs.doc(String(body.id)).get()).data[0]
      if (!one) throw new Error('no sub')
      if (Number(one.ok) !== -1) throw new Error('只删得掉已驳回的')
      await subs.doc(String(body.id)).remove()
      return { ok: 1, n: 1 }
    }
    // 一次删完，不逐条：33 条废稿逐条 remove 就是 33 次串行往返、33 次计费调用。
    const r = await subs.where({ ok: -1 }).remove()
    return { ok: 1, n: r.deleted || 0 }
  }

  // 申请删掉一套已上站的配装。**走审核，不当场删**：删一套配装是不可逆的，
  // 站上少一页、点赞数也跟着没了，按错一下没有退路。落成一条待审记录，
  // 与投稿走同一条队列、同一套通过／驳回，审的人看得见要删的是哪一套。
  if (a === 'bdrop') {
    const me = await who(event, 1)
    const id = String(body.id || '')
    const m = /^builds\/([^/]+)\/([^/]+)$/.exec(id)
    if (!m) throw new Error('bad id')
    const cur = (await docs.doc(id).get()).data[0]
    if (!cur) throw new Error('no doc')
    const at = new Date().toISOString()
    // 同一套只留一条待审的删除申请，重复点即改写
    const old = await subs.where({ season: m[1], slug: m[2], drop: 1, ok: 0 }).limit(1).get()
    const set = { md: cur.md, season: m[1], slug: m[2], drop: 1, ok: 0, at,
                  by: me.name, uid: me.uid, key: fingerprint(cur.md) }
    if (old.data.length) {
      await subs.doc(old.data[0]._id).update(set)
      return { ok: 1, id: old.data[0]._id }
    }
    const r = await subs.add(set)
    return { ok: 1, id: r.id }
  }

  if (a === 'smark') {
    const me = await who(event, 2)
    const ok = Number(body.ok) === 1 ? 1 : -1
    const set = { ok, okBy: me.name, at: new Date().toISOString() }
    const cur = (await subs.doc(String(body.id)).get()).data[0]
    if (!cur) throw new Error('no sub')
    // 删除申请只标状态。**真正的删除在本机**：sync.py 的 sweep() 按这条记录删掉
    // 那一篇源稿，再把库里那条一并清掉——与落盘同一侧，构建与部署也在那里。
    if (cur.drop) {
      await subs.doc(cur._id).update(set)
      return { ok: 1 }
    }
    if (ok === 1) {
      // 通过的是存过的那一份。带 md 就一并更新，不带就用库里现有的。
      const md = String(body.md || cur.md || '')
      if (!md.startsWith('# ') || md.length > MAX_MD) throw new Error('bad md')
      set.md = md

      let season, slug
      if (cur.updates && cur.season && cur.slug) {
        // **这一条是对已上站那一套的更新**：沿用原来的 season/slug 覆盖过去。
        // 查重在这里要跳过——「已经存在」正是它要更新的那一份。
        season = cur.season
        slug = cur.slug
      } else {
        // **赛季与 slug 不再由人填**：赛季就是当前这一季，slug 是「八位随机串-职业」，
        // 两者前端现算。形状与查重照旧验在这里——slug 即文件名，也是点赞的 _id，
        // 重了会把上一份源稿盖掉。撞了当场拒，前端换一个随机串再来。
        season = String(body.season || '')
        slug = String(body.slug || '').toLowerCase()
        if (!/^s\d+-\S+$/.test(season)) throw new Error('bad season')
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('bad slug')
        const dup = await subs.where({ season, slug, ok: 1 }).limit(1).get()
        if (dup.data.length && dup.data[0]._id !== String(body.id)) throw new Error('slug 重了')
        if ((await docs.doc('builds/' + season + '/' + slug).get()).data.length) {
          throw new Error('slug 重了')
        }
      }
      set.season = season
      set.slug = slug
      // 审的时候可能改过正文，指纹跟着重算——下一次再投同一套才认得出是更新
      set.key = fingerprint(md)

      // 更新那一路要把正文直接写进 docs：sync.py 的 land() 只写盘上没有的，
      // 已经在站上的那一份它不碰。写进 docs 之后走的是与资料页同一条对账路——
      // 库变了、盘没变，下一次 sync 自然拉下来。
      if (cur.updates) {
        const id = 'builds/' + season + '/' + slug
        const doc = { md, hash: sha1(md), at: set.at, by: cur.md ? '投稿更新' : me.name }
        const r = await docs.doc(id).update(doc)
        if (!r.updated) await docs.doc(id).set(doc)
      }
    }
    await subs.doc(String(body.id)).update(set)
    return { ok: 1 }
  }

  if (a === 'edits') {
    await who(event, 1)
    const r = await edits.limit(500).get()
    return { edits: r.data }
  }

  if (a === 'edit') {
    await who(event, 1)
    const d = (await edits.doc(String(body.id)).get()).data[0]
    if (!d) throw new Error('no edit')
    return d
  }

  // 草稿与提交待审是同一个动作，差在 ok。同一个人同一篇只留一条未结的，改写不堆叠。
  // ── 一处改动一条记录 ──
  // 就地编辑的自然单位是「一处改动」，不是「一份文稿」。存整篇快照时「同一篇有两份
  // 待审」天然互斥，通过一份就得把其余整批驳回；十个编辑各修一个错字撞在同一页是
  // 日常，那样会把别人那一处连内容一起抹掉。收窄到「一处」之后，改不同格的人互不
  // 影响，冲突只在真的动了同一处时才发生。
  // cell 为 -1 即整块改动（段落、列表项、表格整行）；用 -1 不用 null，
  // 那一列还要参与 where 查询。
  if (a === 'chg') {
    const me = await who(event, 1)
    const doc = String(body.doc || '')
    const cur = (await docs.doc(doc).get()).data[0]
    if (!cur) throw new Error('no doc')  // doc 必须已在库里，线上不新建资料页
    const before = String(body.before ?? '')
    const after = String(body.after ?? '')
    if (after === before) throw new Error('没改动')
    if (after.length > MAX_ONE || before.length > MAX_ONE) throw new Error('bad text')
    const blk = Number(body.blk)
    const cell = body.cell == null ? -1 : Number(body.cell)
    if (!Number.isInteger(blk) || blk < 0) throw new Error('bad blk')
    if (!Number.isInteger(cell) || cell < -1) throw new Error('bad cell')
    // 提交时就验一次定位。改的那一处已经不在了就当场说清楚，不进队列等审的人撞。
    const at0 = locate(cur.md, { blk, cell, before })
    if (!at0) throw new Error('stale')
    const at = new Date().toISOString()
    // **表格那一行的改动就地并回一行。**一行源稿就是一行表格，格内换行只能写
    // 两个反斜杠；混进一个真换行，那一行写回正文时裂成两行、格数少一半，
    // npm run build 当场中止，卡住的是整次部署。**不拒收，直接改对**——这条
    // 规则只写在源稿语法里，编辑的人没有理由知道，报一句错只会让人卡在那里。
    const line0 = cur.md.split('\n')[at0.line] || ''
    const text = line0.startsWith('|') ? after.replace(/\n+/g, '\\\\') : after
    const set = { doc, blk, cell, before, after: text, ok: 0, at, by: me.name, uid: me.uid }
    // 同一个人在同一处只留一条待审，重改即改写，不堆第二份。
    const old = await edits.where({ doc, uid: me.uid, ok: 0, blk, cell }).limit(1).get()
    if (old.data.length) {
      await edits.doc(old.data[0]._id).update(set)
      return { ok: 1, id: old.data[0]._id }
    }
    const r = await edits.add(set)
    return { ok: 1, id: r.id }
  }

  // 一篇的待审，页面上的遮罩据此涂色。带全文——before/after 各是一格，
  // 一页的待审就那么几条。
  // **只收 ok=0**：通过之后那一处就该像没标记过一样。部署空窗（库里新了、站上还旧）
  // 由 edit.js 拿库里正文与页面上现比得出，不存状态，也就不会随迭代积出陈旧标记。
  // md：把这一篇的正文与 hash 一并带回。资料页开编辑态本来要先 doc 再 pend
  // 两发串行——后者只为拿 hash 与页面上那份比一次，而这一次比服务端自己做得了。
  if (a === 'pend') {
    await who(event, 1)
    const doc = String(body.doc || '')
    const r = await edits.where({ doc, ok: 0 }).limit(200).get()
    // stale：页面上那份 data-hash 与库里对不上时才要。已通过的那些记录里，
    // before 正是页面此刻显示的原文、after 是库里现在的——拿它们逐条认，比按
    // 归一化文本盲比准，不必猜标记该怎么剥。hash 相同的常态下一条都不取。
    // judge：审核台要知道每一条此刻还定不定位得到。**这个判断只有 locate 做得准**
    // ——同一处多份是前端分个组就看得出来的（甲类），底稿被人先改掉了却只有拿当前
    // 正文跑一遍才知道（乙类）。不在前端再抄第四份切格与匹配。
    // 要正文的三条路合用同一次读：judge 拿它跑 locate，md 把它带回去，
    // 页面上那份 hash 与库里比也要它。
    const cur = (body.judge || body.md) ? (await docs.doc(doc).get()).data[0] : null
    const md = cur ? cur.md : ''
    const out = { pend: body.judge ? r.data.map((e) => ({ ...e, stale: !locate(md, e) })) : r.data }
    if (body.md) { out.md = md; out.hash = cur ? cur.hash : '' }
    // hash 相等就没有待上站的改动，一条都不必取。
    if (body.stale || (body.hash && out.hash && body.hash !== out.hash)) {
      out.done = (await edits.where({ doc, ok: 1 }).limit(200).get()).data
    }
    return out
  }

  if (a === 'emark') {
    const me = await who(event, 2)
    const e = (await edits.doc(String(body.id)).get()).data[0]
    if (!e) throw new Error('no edit')
    const ok = Number(body.ok) === 1 ? 1 : -1
    const at = new Date().toISOString()
    if (ok === 1) {
      const cur = (await docs.doc(e.doc).get()).data[0]
      if (!cur) throw new Error('no doc')
      const hit = locate(cur.md, e)
      // 定位不到就是有人先动了同一处。**报冲突，记录原样留着**——before/after
      // 都还在，审的人看得见两边分别要改成什么，提的人也找得回自己写了什么。
      if (!hit) throw new Error('conflict')
      // 与 chg 同一条：队列里可能还压着这次改动之前提的、带着真换行的稿子。
      const row = cur.md.split('\n')[hit.line] || ''
      const text = row.startsWith('|')
        ? String(e.after).replace(/\n+/g, '\\\\') : e.after
      const md = patch(cur.md, hit, text)
      await docs.doc(e.doc).update({ md, hash: sha1(md), at, by: e.by })
    }
    // **同篇其余待审不再整批驳回**：它们改的是别处，与这一处无关。
    await edits.doc(e._id).update({ ok, okBy: me.name, at })
    return { ok: 1 }
  }

  // 白名单的增删改。只能动 lv 严格低于自己的人：管理员因此动不了超管，
  // 也造不出第二个超管。
  if (a === 'eds') {
    const me = await who(event, 3)
    const op = String(body.op || 'list')
    if (op === 'list') return { eds: (await eds.limit(200).get()).data }
    const uid = String(body.uid || '')
    if (!uid) throw new Error('bad uid')
    const old = (await eds.doc(uid).get()).data[0]
    if (old && Number(old.lv) >= me.lv) throw new Error('forbidden')
    if (op === 'del') {
      await eds.doc(uid).remove()
      return { ok: 1 }
    }
    const lv = Number(body.lv)
    if (!(lv >= 1 && lv < me.lv)) throw new Error('bad lv')
    const set = { name: String(body.name || ''), lv, at: new Date().toISOString() }
    if (old) await eds.doc(uid).update(set)
    else await eds.doc(uid).set(set)
    return { ok: 1 }
  }

  return null
}

async function route(a, body, event) {
  if (a === 'stats') return stats()

  const ed = await editorRoute(a, body, event)
  if (ed) return ed

  // ── 审核台 ──
  if (a === 'list') {
    admin(body)
    const r = await subs.limit(500).get()
    return { subs: r.data }
  }

  if (a === 'mark') {
    admin(body)
    const set = { ok: Number(body.ok) }
    if (body.season) set.season = String(body.season)
    if (body.slug) set.slug = String(body.slug)
    await subs.doc(String(body.id)).update(set)
    return { ok: 1 }
  }

  if (a === 'stat') {
    admin(body)
    return (await stat.get()).data[0] || {}
  }

  if (a === 'hit') {
    await hit()
    // 只有首页那句「今日 X 位访客」要这两个数，其余页面拿到就丢，不必再查一遍。
    // 缺省仍返回：不带 s 的是缓存里的旧页面，函数先于站点上线时它照旧要读这两个数。
    return body.s === 0 ? { ok: 1 } : stats()
  }

  if (a === 'likes') return likeMap()

  if (a === 'like') {
    const id = String(body.id || '')
    if (!/^[a-z0-9]+_[a-z0-9-]+$/.test(id)) throw new Error('bad id')
    const d = body.d === -1 ? -1 : 1
    await bump(likes, id, d)
    // 回读一次只为拿新数值，而前端手里就有那个数。缓存里那一项跟着走，
    // 五分钟窗口内别的访客拿到的也是新数。
    if (lk.m) lk.m[id] = Math.max(0, (lk.m[id] || 0) + d)
    return { ok: 1 }
  }

  if (a === 'sub') {
    const md = String(body.md || '')
    if (!md.startsWith('# ') || md.length > MAX_MD) throw new Error('bad md')
    const key = fingerprint(md)
    const at = new Date().toISOString()
    // 同一套配装重投即改写待审的那一条，不堆第二份。已经审过的不动：那是审核
    // 结果，不在待审队列里。
    const old = await subs.where({ key, ok: 0 }).limit(1).get()
    if (old.data.length) {
      await subs.doc(old.data[0]._id).update({ md, at })
      return { ok: 1, dup: 1 }
    }
    // 同一套已经上站了：这一次是更新。记下它的 season/slug，通过时覆盖过去而不是
    // 另起一份——同一套配装在站上只该有一条，换 slug 连点赞数一起甩掉。
    const done = await subs.where({ key, ok: 1 }).limit(1).get()
    const was = done.data[0]
    const link = was && was.season && was.slug
      ? { season: was.season, slug: was.slug, updates: 1 } : {}
    await subs.add({ md, key, at, ok: 0, ...link })
    return { ok: 1, dup: 0, updates: link.updates ? 1 : 0 }
  }

  // sync.py 专用：整库对账。走 ADMIN_TOKEN，不走白名单。
  if (a === 'pull') {
    admin(body)
    const r = await docs.limit(500).get()
    return { docs: r.data }
  }

  // HTTP 网关的请求体上限是 100 KB，而 exotic-weapon.md 有 159 KB。所以正文一律
  // 压过再发（gzip → base64），**不设「多大才压」的阈值**：一个分支就是一个会判错
  // 的地方，而压的代价可以忽略。最大的一篇压完 64.9 KB，余量三成。
  if (a === 'push') {
    admin(body)
    const md = body.gz ? zlib.gunzipSync(Buffer.from(body.gz, 'base64')).toString() : String(body.md || '')
    const id = String(body.id || '')
    if (!id || md.length > MAX_MD) throw new Error('bad md')
    const set = { md, hash: sha1(md), at: new Date().toISOString(), by: '本机' }
    const r = await docs.doc(id).update(set)
    if (!r.updated) await docs.doc(id).set(set)
    return { ok: 1 }
  }

  // 重算全部投稿的指纹。**换了 SAME 那一组字段之后要跑一次**——旧记录的 key 是按
  // 旧算法存的，对不上就认不出「这一套已经上站了」，重投会另开一个 slug。
  // 与 sync.py --seed 同一类：平时不用，改了判据才用。
  if (a === 'rekey') {
    admin(body)
    const r = await subs.limit(500).get()
    let n = 0
    for (const d of r.data) {
      const key = fingerprint(String(d.md || ''))
      if (key !== d.key) {
        await subs.doc(d._id).update({ key })
        n++
      }
    }
    return { ok: 1, n, total: r.data.length }
  }

  if (a === 'drop') {
    admin(body)
    await docs.doc(String(body.id)).remove()
    return { ok: 1 }
  }

  throw new Error('bad action')
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEAD, body: '' }
  const q = event.queryStringParameters || {}
  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    body = {}
  }
  try {
    const out = await route(q.a || body.a, body, event)
    return { statusCode: 200, headers: HEAD, body: JSON.stringify(out) }
  } catch (e) {
    return { statusCode: 400, headers: HEAD, body: JSON.stringify({ error: String(e.message || e) }) }
  }
}
