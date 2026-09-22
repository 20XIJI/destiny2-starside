// 站点唯一的后端：访问计数、点赞、配装投稿。
// 访问计数全部装在 counters/stat 这一条 doc 里：计费按数据库调用次数算，不按记录
// 条数，一条 doc 一次调用。页面级热度看 CDN 控制台的 URL 排行，不自己存。
// likes 管配装点赞，一条一套：_id 即「赛季_slug」，字段只有 n。
const crypto = require('crypto')
const zlib = require('zlib')
const tcb = require('@cloudbase/node-sdk')
// 源稿方言（切格、着色标记、一段文字能不能原样写进一格）JS 这一侧只有
// admin/dialect.js 一份定义；这里这个文件是构建复制过去的，不手改（云函数只
// require 得到自己目录下的东西）。
const { cellSpans, rowOf, cellSafe, barePipe } = require('./dialect.js')
// 配装源稿的形状（指纹取哪几项、库里的 _id 怎么拼）只有 builds/source.js 一份，
// 这里是构建复制过去的那一份，不手改。
const { same, id: buildId } = require('./source.js')
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
const db = app.database()
const _ = db.command
const stat = db.collection('counters').doc('stat')
const likes = db.collection('likes')
const subs = db.collection('subs')
// 在线编辑台的四张表。docs 是源稿的工作副本，recs 是记录上站内文字的工作副本，
// git 才是发布本，两边靠内容 hash 对账。
const docs = db.collection('docs')
const recs = db.collection('recs')
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

/* 配装那一批的正文，一条不落。**翻到底，不设一个够大的上限。**
   `_id` 上排序取稳定序：不排的话 skip 分页会漏掉或重复取同一行。
   判据是「这一页没满」，与总数无关；91 套时一发到底，超过 PAGE 时多一发。

   PAGE 取 200：配装源稿现在合计 190 KB / 91 套，一页 200 套约 420 KB，
   在云函数单次返回的量级里仍然宽裕，而绝大多数时候只发一次。

   CAP 是防跑飞的闸，不是业务上限：真撞上它说明库里的 builds/ 记录数量级
   已经不对（比如前缀写错把整库都框进来了），与其闷头拉到超时，不如抛出来。 */
const BODY_PAGE = 200
const BODY_CAP = 20000

async function allBuildBodies() {
  const out = {}
  const q = docs.where({ _id: db.RegExp({ regexp: '^builds/', options: '' }) })
  for (let skip = 0; skip < BODY_CAP; skip += BODY_PAGE) {
    const page = await q.orderBy('_id', 'asc').skip(skip).limit(BODY_PAGE).get()
    for (const d of page.data) out[d._id] = d.md
    if (page.data.length < BODY_PAGE) return out
  }
  throw new Error('too many builds')
}

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

// 读计数按一分钟缓存在函数实例的内存里，与赞数同一条理由：首页的数每浏览器十分钟
// 取一次，这一份让数据库读与首页流量脱钩。连日期一起记，过了零点即作废，「今日」
// 不会报成昨天的。
let sc = { t: 0, d: '', v: null }
async function stats() {
  const d = today()
  if (sc.d === d && Date.now() - sc.t < 6e4) return sc.v
  const c = (await stat.get()).data[0] || {}
  sc = { t: Date.now(), d, v: { today: (c.d || {})[d] || 0, total: c.pv || 0 } }
  return sc.v
}

// 同一套配装的指纹：取哪五项、怎么归一由 source.js 的 same() 定，与填表页、审核台
// 同一份。\u0001 当分隔符：正文里不会出现，拼接因此不会把两项混成一项。
function fingerprint(md) {
  return crypto.createHash('sha1').update(same(md).join('\u0001')).digest('hex')
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

// ── 记录上的站内文字 ──
// recs 一条记录一份：_id 是「表名/裸 hash」，json 是 facts.site_text() 那张扁平表
// {字段路径: 文字} 的规范文本。_id 与路径都从请求里来，形状在这里验。
const REC_ID = /^(inventory-items|sandbox-perks|traits|stats|equipable-item-sets|minted)\/\d+$/
const REC_PATH = /^(i18n\/zh-CN|enhanced|weaponTypes|authors|variants)(\/[^/]+)+$/
// 线上只能新添这一格（页面上显示的是官方描述、站内还没写说明的那种），与
// facts.NEW_LEAF 同一条。别的路径必须已经在记录上：新添 i18n.zh-CN 下别的键会写进
// manifest 字段，或把 site_authors 这种对象换成字符串，sync.py 写回时当场中止。
const NEW_LEAF = /^i18n\/zh-CN\/realgame_details$/
// 一次对账推几条记录由 sync.py 定（按请求体大小切批），这里只挡跑飞。
const REC_BATCH = 500

// 与 facts.canon() 逐字节相同：键按码位排序、紧凑分隔、值只有字符串。hash 算它，
// 所以两边写出来的同一份表 hash 相同，编辑台拿页面上那份与库里比才比得准。
function canon(flat) {
  return '{' + Object.keys(flat).sort().map((k) => JSON.stringify(k) + ':' + JSON.stringify(flat[k])).join(',') + '}'
}

// 库里一条记录 → 扁平表。坏掉的当场报出：静默当成空表的话，下一次通过会把整条
// 记录的站内文字写成只剩一格。
function flatOf(cur) {
  const flat = JSON.parse(cur.json)
  if (!flat || typeof flat !== 'object' || Array.isArray(flat)
      || Object.values(flat).some((v) => typeof v !== 'string')) throw new Error('bad rec')
  return flat
}

// 一格此刻的文字。没有这一格时：能新添的算空串，不能的回 null。
function leaf(flat, path) {
  if (Object.prototype.hasOwnProperty.call(flat, path)) return flat[path]
  return NEW_LEAF.test(path) ? '' : null
}

// 一批记录 → { _id: 那一条 }。_.in 按一百条一批，互不依赖，一起发。
async function recsOf(ids, fields) {
  const out = {}
  const parts = []
  for (let i = 0; i < ids.length; i += 100) parts.push(ids.slice(i, i + 100))
  const got = await Promise.all(parts.map((part) => {
    const q = recs.where({ _id: _.in(part) })
    return (fields ? q.field(fields) : q).limit(part.length).get()
  }))
  for (const r of got) for (const d of r.data) out[d._id] = d
  return out
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

/* 每个 action 要什么凭据，**只有这一张表**。从前这件事写在 25 条分支体里
   （`await who(event, 2)` 那样的字面量），「哪些动作是公开的」要读完 500 行才
   答得出，新增一条忘了调守卫就是静默开放，而没有任何测试会响。

   null 是公开（连令牌都不要），数字是 who() 的门槛，'admin' 走 ADMIN_TOKEN。
   sdrop 记的是它的下限：不带 id 的那一路是整批删除，分支体里另有一道 lv 4。 */
const LEVEL = {
  me: 0,
  docs: 1, subs: 1, hist: 1, bdrop: 1, edits: 1, chg: 1, pend: 1,
  ssave: 2, bsave: 2, smark: 2, emark: 2, sdrop: 2,
  eds: 4,
  stats: null, hit: null, likes: null, like: null, sub: null,
  list: 'admin', mark: 'admin', pull: 'admin', push: 'admin', rekey: 'admin', drop: 'admin',
  landed: 'admin', rpull: 'admin', rpush: 'admin', rdrop: 'admin', rlanded: 'admin',
}

// 进分支之前判一次。返回值是 me，分支要用名字或 uid 时直接拿，不再各自 await 一遍。
async function guard(a, body, event) {
  if (!Object.prototype.hasOwnProperty.call(LEVEL, a)) throw new Error('bad action')
  const need = LEVEL[a]
  if (need === null) return null
  if (need === 'admin') { admin(body); return null }
  return who(event, need)
}

async function editorRoute(a, body, event, me) {
  // lv 0 也放行：没进白名单的人要看得见自己的 uid，才知道让管理员加谁。
  if (a === 'me') {
    return { uid: me.uid, name: me.name, lv: me.lv }
  }

  if (a === 'docs') {
    // **配装那些要带上 md，资料页那些不带。**投影是为资料页存在的：39 篇合计
    // 1.5 MB。配装 91 套合计 190 KB，而编辑台的列表要靠 md 读出名字、职业、分支、
    // 强度与推荐人——本机直接落盘的那些在 subs 里没有投稿记录，不带 md 的话
    // 列表上连名字都只能显示 slug。
    //
    // **配装那一发必须取全，取全靠翻到底、不靠一个够大的数。**从前它是
    // `limit(200)`：第 201 套起 md 取不回来，而记录本身照常出现在第一发里
    // （hash / landed 都在，列表上名字、时间、「已改」全对），只有正文是空的。
    // 编辑台那一侧一旦退回投稿时冻住的那份陈稿，按一下保存就把它盖回库里——
    // 正是这次修掉的那个 bug 在第 201 套上原样复活。翻页判据是「这一页没满」，
    // 与总数无关，加多少套都不必回来改数字。
    //
    // **第一发与翻页一起走。**互不依赖，串起来就是白等一个往返；而这一路每存
    // 一次配装都要重跑一遍（admin.js 存完走 load()），不是只在进场时跑一次。
    const [r, mds] = await Promise.all([
      docs.field({ md: false }).limit(500).get(),
      allBuildBodies(),
    ])
    return {
      docs: r.data.map((d) => (mds[d._id] === undefined ? d : { ...d, md: mds[d._id] })),
      // 第一发仍有上限：到顶之后返回哪一批由数据库的自然序说了算，多出来的在
      // 编辑台上直接消失。那是「少一行」，看得见；配装正文取不全是「这一行在、
      // 内容是旧的」，看不见——所以只有后者值得翻页，前者报一位即可。
      more: r.data.length >= 500 ? 1 : 0,
    }
  }

  // 配装投稿的队列。与 list/mark 同一张表，区别只在凭据：那两个走 ADMIN_TOKEN
  // 给本机的 sync.py，这两个走白名单给编辑台。
  if (a === 'subs') {
    const r = await subs.limit(500).get()
    return { subs: r.data, more: r.data.length >= 500 ? 1 : 0 }
  }

  // 结案后留下的那一条改动记录：谁、什么时候、哪一篇、改了哪几行。
  if (a === 'hist') {
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
    const cur = (await subs.doc(String(body.id)).get()).data[0]
    if (!cur) throw new Error('no sub')
    if (cur.drop) throw new Error('bad sub type')
    const md = String(body.md || '')
    if (!md.startsWith('# ') || md.length > MAX_MD) throw new Error('bad md')
    await subs.doc(String(body.id)).update({ md, at: new Date().toISOString(), edBy: me.name })
    return { ok: 1 }
  }

  // 已上站的配装就地改。**整篇替换，且只开给 builds/**：配装本来就是填表编辑，
  // 没有「一处改动」这个概念，资料页那套逐处审核在这里无从落脚。
  if (a === 'bsave') {
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
    // 表里记的是下限。不带 id 的那一路是整批清空待审队列，另要 lv 4。
    if (!body.id && me.lv < 4) throw new Error('no permission')
    // 单条删已驳回的：审核员就行。**整批清空要超管**——一次抹掉几十条，
    // 手滑的代价与逐条不是一个量级。
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
    const raw = Number(body.ok)
    const ok = raw === 1 ? 1 : raw === 0 ? 0 : -1
    const set = { ok, okBy: me.name, at: new Date().toISOString() }
    const cur = (await subs.doc(String(body.id)).get()).data[0]
    if (!cur) throw new Error('no sub')

    // 审的人多半改完直接点通过，不先点保存（admin.js 的 mark() 把填表页现读的那一份
    // 带过来）。所以「谁改的」不能只认 ssave：正文与库里那份比一下就知道动没动，
    // cur 本来就要读，不多一次调用。驳回那一路不带 md，比不着也不必比。
    if (body.md !== undefined && String(body.md) !== cur.md) set.edBy = me.name

    // 撤回：通过与驳回都退得回待审。两档的状态都只活在库里——通过只改了这条记录，
    // 源稿要等 sync.py 拉下来才落盘；驳回连那一步都没走过。审的人点错了、或者审完
    // 又改主意，在这一段里都还追得回来。
    //
    // **一旦上了站就不许走这条路**：那时盘上有源稿、站上有页面、点赞也挂上了 _id，
    // 只把库里的状态退回去，库与站就此对不上，而且没有任何一侧会报出来。上了站要
    // 撤只有「申请移除」那一条——它落成一条待审记录，由 sync.py 的 sweep() 连源稿
    // 一起删。删除申请自己也不许撤，通过与驳回两档都不许：已通过的那些 sweep() 可能
    // 已经跑过、源稿已经不在了；被驳回的那些里有一类是 `sync.py --mine` 打回的（本地
    // 稿有改动），退回待审等于把本机已经拒掉的申请重新排进队列。
    if (ok === 0) {
      if (cur.drop) throw new Error('bad sub type')
      const was = Number(cur.ok)
      if (was !== 1 && was !== -1) throw new Error('already pending')
      // 「已上站」那道门**只管通过这一档**：sub 认出「这一套已经上站了」时会把它的
      // season/slug 一并记下（updates 那一路），而驳回只写 ok/okBy/at，那两截原样
      // 留着。不收窄到 was === 1 的话，对已上站那一套的更新被驳回之后就再也退不回
      // 待审，而它从来没落过盘。
      if (was === 1 && cur.season && cur.slug &&
          (await docs.doc(buildId(cur.season, cur.slug)).get()).data.length) {
        throw new Error('已上站，请走申请移除')
      }
      // 退回待审要守住「同一 key 的待审只留一条」——sub 那一侧靠一次 find-one-and-
      // update 维持。驳回之后投稿人又投了一份，这时撤回旧的那条就撞出第二条：两条
      // 都能通过，而通过时的 slug 是现算的随机串、查重只看 ok=1 与 docs，站上因此
      // 多出一份重复配装，没有任何一侧会报出来。
      if (was === -1 && cur.key) {
        const q = await subs.where({ key: cur.key, ok: 0, drop: _.neq(1) }).limit(1).get()
        if (q.data.length) throw new Error('已有新的待审投稿')
      }
      await subs.doc(cur._id).update(set)
      return { ok: 1 }
    }
    // 删除申请只标状态。**真正的删除在本机**：sync.py 的 sweep() 按这条记录删掉
    // 那一篇源稿，再把库里那条一并清掉——与落盘同一侧，构建与部署也在那里。
    if (cur.drop) {
      if (Object.prototype.hasOwnProperty.call(body, 'md')) throw new Error('bad sub type')
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
        if ((await docs.doc(buildId(season, slug)).get()).data.length) {
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
        const id = buildId(season, slug)
        // by 写通过的那个人。**不写「投稿更新」这类词**：铭牌拿 docs.by 当「谁改的」，
        // 一个状态词摆在人名的位置上读起来像有个人叫这个名字；这一版是不是投稿更新
        // 来的，由 sub.updates 答，铭牌第一行已经写着。
        const doc = { md, hash: sha1(md), at: set.at, by: me.name }
        const r = await docs.doc(id).update(doc)
        if (!r.updated) await docs.doc(id).set(doc)
      }
    }
    await subs.doc(String(body.id)).update(set)
    return { ok: 1 }
  }

  if (a === 'edits') {
    // 与 docs / subs 同一条：触顶就报一位。**这张表单调增长**——一处改动结案留
    // 一条，删不掉也不过期，所以它是三张表里最先撞上限的那一张。
    const r = await edits.limit(500).get()
    return { edits: r.data, more: r.data.length >= 500 ? 1 : 0 }
  }

  // 草稿与提交待审是同一个动作，差在 ok。同一个人同一篇只留一条未结的，改写不堆叠。
  // ── 一处改动一条记录 ──
  // 就地编辑的自然单位是「一处改动」，不是「一份文稿」。存整篇快照时「同一篇有两份
  // 待审」天然互斥，通过一份就得把其余整批驳回；十个编辑各修一个错字撞在同一页是
  // 日常，那样会把别人那一处连内容一起抹掉。收窄到「一处」之后，改不同格的人互不
  // 影响，冲突只在真的动了同一处时才发生。
  // cell 为 -1 即整块改动（段落、列表项、表格整行）；用 -1 不用 null，
  // 那一列还要参与 where 查询。
  // 记录上的一格。页面上那段文字不在源稿里，定位靠字段路径，不靠行号与原文匹配：
  // 路径就是它唯一的地址。提交时验一次原文还在，通过时再验一次。
  if (a === 'chg' && body.rec !== undefined) {
    const doc = String(body.doc || '')
    const rec = String(body.rec || '')
    const path = String(body.path || '')
    if (!/^keys\/[\w-]+$/.test(doc)) throw new Error('bad doc')
    if (!REC_ID.test(rec)) throw new Error('bad rec')
    if (!REC_PATH.test(path)) throw new Error('bad path')
    const before = String(body.before ?? '')
    const after = String(body.after ?? '')
    if (after === before) throw new Error('没改动')
    if (after.length > MAX_ONE || before.length > MAX_ONE) throw new Error('bad text')
    const cur = (await recs.doc(rec).get()).data[0]
    if (!cur) throw new Error('no rec')
    if (leaf(flatOf(cur), path) !== before) throw new Error('stale')
    // 竖线按那一格此刻的文字判，不按提交的那一页：同一格在别的页上可能是表格的一格
    // （护甲模组、刷取清单把记录展开成 markdown 表），多一个分隔符那一行就多一格，
    // npm run build 当场中止。原文里本来就有裸竖线的说明它没被画进表格——不然现在
    // 就构建不过——这种放行；原文没有的一律挡，要写就用全角｜。
    const unsafe = cellSafe(after, !barePipe(before))
    if (unsafe) throw new Error(unsafe)
    const set = { doc, rec, path, label: String(body.label || '').slice(0, 200), kind: 'rec',
                  before, after, ok: 0, at: new Date().toISOString(), by: me.name, uid: me.uid }
    // 同一个人在同一格只留一条待审，重改即改写。**按记录与路径认，不按页**：
    // 同一格在几页上都有，从哪一页改都是同一处。
    const old = await edits.where({ rec, path, uid: me.uid, ok: 0 }).limit(1).get()
    if (old.data.length) {
      await edits.doc(old.data[0]._id).update(set)
      return { ok: 1, id: old.data[0]._id }
    }
    const r = await edits.add(set)
    return { ok: 1, id: r.id }
  }

  if (a === 'chg') {
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
    const unsafe = cellSafe(text, Boolean(at0.span))
    if (unsafe) throw new Error(unsafe)
    const set = { doc, blk, cell, before, after: text, ok: 0, at, by: me.name, uid: me.uid }
    // 表格里的一格顺手记下它所在那一行的上下文（表头、整行、行叫什么），审核台与
    // 改动记录据此写「最后一愿 千语魅痕 · 生命值」，不写第几行第几格。记在提交这一刻：
    // 结案之后那一行可能被改掉或删掉，记录里的上下文仍对得上当时改的是什么。
    const ctx = at0.span ? rowOf(cur.md.split('\n'), at0.line) : null
    if (ctx) set.ctx = ctx
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
    const doc = String(body.doc || '')
    // stale：页面上那份 data-src-hash 与库里对不上时才要。已通过的那些记录里，
    // before 正是页面此刻显示的原文、after 是库里现在的——拿它们逐条认，比按
    // 归一化文本盲比准，不必猜标记该怎么剥。hash 相同的常态下一条都不取。
    // judge：审核台要知道每一条此刻还定不定位得到。**这个判断只有 locate 做得准**
    // ——同一处多份是前端分个组就看得出来的（甲类），底稿被人先改掉了却只有拿当前
    // 正文跑一遍才知道（乙类）。不在前端再抄第四份切格与匹配。
    // 要正文的三条路合用同一次读：judge 拿它跑 locate，md 把它带回去，
    // 页面上那份 hash 与库里比也要它。
    //
    // **两发一起走**：待审那一发与取正文那一发互不依赖，串起来就是白等一个往返。
    // 配装页开编辑态卡在这一下——iframe 要等它回来才开始载。
    //
    // recs：主键页的就地编辑把本页每条记录那一份的 hash 带来（edit.json 里记着构建
    // 时那一份）。库里 hash 不同的那几条整条带回去——页面上那几格站上还是旧的，或者
    // 要拿库里现在的文字当底稿；相同的一条都不带。记录上的待审按记录认、不按页认：
    // 同一格在几页上都有，从别页提的那一条这一页也要涂上。
    const want = body.recs && typeof body.recs === 'object'
      ? Object.keys(body.recs).filter((id) => REC_ID.test(id)) : null
    const [r, one, rp, rs] = await Promise.all([
      edits.where({ doc, ok: 0 }).limit(200).get(),
      (body.judge || body.md) ? docs.doc(doc).get() : Promise.resolve(null),
      want ? edits.where({ kind: 'rec', ok: 0 }).limit(500).get() : Promise.resolve(null),
      want ? recsOf(want, { json: true, hash: true, by: true, at: true }) : Promise.resolve(null),
    ])
    const cur = one ? one.data[0] : null
    const md = cur ? cur.md : ''
    let pend = r.data
    if (want) {
      const on = new Set(want)
      pend = pend.filter((e) => e.kind !== 'rec').concat(rp.data.filter((e) => on.has(e.rec)))
    }
    if (body.judge) {
      // 记录那几条的陈旧与否按库里那一格此刻的文字判，与 emark 通过时同一条。
      const ids = [...new Set(pend.filter((e) => e.kind === 'rec').map((e) => e.rec))]
      const now = ids.length ? await recsOf(ids) : {}
      // 定位得到的那几格按当前正文重取一次行的上下文：提交之后那一行别的格可能已经
      // 改过，审的人要看的是此刻的整行。定位不到的（陈旧）沿用提交时记下的那份。
      const lines = md.split('\n')
      pend = pend.map((e) => {
        if (e.kind === 'rec') return { ...e, stale: !now[e.rec] || leaf(flatOf(now[e.rec]), e.path) !== e.before }
        const at = locate(md, e)
        const ctx = at && at.span ? rowOf(lines, at.line) : e.ctx
        return ctx ? { ...e, stale: !at, ctx } : { ...e, stale: !at }
      })
    }
    const out = { pend }
    if (want) {
      out.recs = {}
      for (const id of want) {
        const got = rs[id]
        if (got && got.hash !== body.recs[id]) out.recs[id] = { json: got.json, hash: got.hash, by: got.by, at: got.at }
      }
    }
    if (body.md) { out.md = md; out.hash = cur ? cur.hash : '' }
    // hash 相等就没有待上站的改动，一条都不必取。
    if (body.stale || (body.hash && out.hash && body.hash !== out.hash)) {
      out.done = (await edits.where({ doc, ok: 1 }).limit(200).get()).data
        .filter((e) => e.kind !== 'rec')
    }
    return out
  }

  if (a === 'emark') {
    const jobs = body.jobs
    if (!Array.isArray(jobs) || !jobs.length
        || jobs.some((j) => !j || typeof j.id !== 'string' || !j.id.trim()
          || (j.ok !== 1 && j.ok !== -1))
        || new Set(jobs.map((j) => j.id)).size !== jobs.length) throw new Error('bad jobs')
    if (jobs.length > 49) throw new Error('batch too large')
    const at = new Date().toISOString()
    // SDK 1.4.3 的事务 get 返回单对象，update 接平铺字段；失败也可能作为 code 返回。
    const checked = (r) => {
      if (r.code) throw Object.assign(new Error(r.message || r.code), { code: r.code })
      return r
    }
    const updated = (r) => {
      if (checked(r).updated !== 1) throw new Error('conflict')
    }
    try {
      return await db.runTransaction(async (tx) => {
        const groups = new Map()
        const cells = new Map()
        // 先确认整批仍待审，再读取正文；驳回不需要碰 docs 与 recs。
        for (const job of jobs) {
          const e = checked(await tx.collection('edits').doc(job.id).get()).data
          if (!e) throw new Error('no edit')
          if (Number(e.ok) !== 0) throw new Error('conflict')
          if (job.ok === 1) {
            const into = e.kind === 'rec' ? cells : groups
            const key = e.kind === 'rec' ? e.rec : e.doc
            if (!into.has(key)) into.set(key, [])
            into.get(key).push(e)
          }
        }
        // 官方上限 100 次操作，预留开始/提交；过大整批拒绝，不拆批。
        if (2 * jobs.length + 2 * (groups.size + cells.size) + 2 > 100) throw new Error('batch too large')
        // 记录那一路：每条先按库里此刻那一格核对原文，同一格两份一起通过即冲突。
        const recChanges = []
        for (const [id, proposals] of cells) {
          const cur = checked(await tx.collection('recs').doc(id).get()).data
          if (!cur) throw new Error('no rec')
          const flat = flatOf(cur)
          const seen = new Set()
          for (const e of proposals) {
            if (seen.has(e.path) || leaf(flat, e.path) !== e.before) throw new Error('conflict')
            seen.add(e.path)
            const unsafe = cellSafe(String(e.after), !barePipe(e.before))
            if (unsafe) throw new Error(unsafe)
            flat[e.path] = String(e.after)
          }
          recChanges.push({ id, json: canon(flat), by: proposals[proposals.length - 1].by })
        }
        const changes = []
        for (const [id, proposals] of groups) {
          const cur = checked(await tx.collection('docs').doc(id).get()).data
          if (!cur) throw new Error('no doc')
          const lines = cur.md.split('\n')
          const offsets = []
          let offset = 0
          for (const line of lines) { offsets.push(offset); offset += line.length + 1 }
          // 每条先在同一原始快照定位，按实际字符区间判重叠，不让插行改变消歧。
          const hits = proposals.map((e) => {
            const hit = locate(cur.md, e)
            if (!hit) throw new Error('conflict')
            const start = offsets[hit.line] + (hit.span ? hit.span[0] : 0)
            const last = hit.line + (hit.len || 1) - 1
            const end = hit.span ? offsets[hit.line] + hit.span[1] : offsets[last] + lines[last].length
            const text = lines[hit.line].startsWith('|')
              ? String(e.after).replace(/\n+/g, '\\\\') : e.after
            // 队列里可能躺着这条闸门上线之前存下的记录，通过时再判一次。
            const unsafe = cellSafe(text, Boolean(hit.span))
            if (unsafe) throw new Error(unsafe)
            return { hit, start, end, text }
          }).sort((a, b) => a.start - b.start || a.end - b.end)
          for (let i = 1; i < hits.length; i++) {
            if (hits[i].start < hits[i - 1].end || hits[i].start === hits[i - 1].start) {
              throw new Error('conflict')
            }
          }
          let md = cur.md
          for (let i = hits.length - 1; i >= 0; i--) md = patch(md, hits[i].hit, hits[i].text)
          changes.push({ id, md, by: proposals[proposals.length - 1].by })
        }
        for (const change of changes) {
          updated(await tx.collection('docs').doc(change.id).update({
            md: change.md, hash: sha1(change.md), at, by: change.by
          }))
        }
        for (const change of recChanges) {
          updated(await tx.collection('recs').doc(change.id).update({
            json: change.json, hash: sha1(change.json), at, by: change.by
          }))
        }
        for (let i = 0; i < jobs.length; i++) {
          updated(await tx.collection('edits').doc(jobs[i].id).update({ ok: jobs[i].ok, okBy: me.name, at }))
        }
        return { ok: 1 }
      }, 0)
    } catch (error) {
      if (error.code === 'DATABASE_TRANSACTION_CONFLICT') throw new Error('conflict')
      throw error
    }
  }

  // 白名单的增删改。**整张表只给超管**：加人、改名、改角色、移除都在这里，
  // 看得见谁是编辑者本身也是这一层的事。仍然只能动 lv 严格低于自己的人。
  if (a === 'eds') {
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
  const me = await guard(a, body, event)
  if (a === 'stats') return stats()

  const ed = await editorRoute(a, body, event, me)
  if (ed) return ed

  // ── 审核台 ──
  if (a === 'list') {
    const r = await subs.limit(500).get()
    return { subs: r.data }
  }

  if (a === 'mark') {
    const set = { ok: Number(body.ok) }
    if (body.season) set.season = String(body.season)
    if (body.slug) set.slug = String(body.slug)
    await subs.doc(String(body.id)).update(set)
    return { ok: 1 }
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
    const old = await subs.where({ key, ok: 0, drop: _.neq(1) }).limit(1).get()
    if (old.data.length) {
      const r = await subs.where({ _id: old.data[0]._id, key, ok: 0, drop: _.neq(1) }).update({ md, at })
      if (r.updated !== 1) throw new Error('conflict')
      return { ok: 1, dup: 1 }
    }
    // 同一套已经上站了：这一次是更新。记下它的 season/slug，通过时覆盖过去而不是
    // 另起一份——同一套配装在站上只该有一条，换 slug 连点赞数一起甩掉。
    const done = await subs.where({ key, ok: 1, drop: _.neq(1) }).limit(1).get()
    const was = done.data[0]
    const link = was && was.season && was.slug
      ? { season: was.season, slug: was.slug, updates: 1 } : {}
    await subs.add({ md, key, at, ok: 0, drop: 0, ...link })
    return { ok: 1, dup: 0, updates: link.updates ? 1 : 0 }
  }

  // sync.py 专用：整库对账。走 ADMIN_TOKEN，不走白名单。
  if (a === 'pull') {
    const r = await docs.limit(500).get()
    return { docs: r.data }
  }

  // HTTP 网关的请求体上限是 100 KB，而 exotic-weapon.md 有 159 KB。所以正文一律
  // 压过再发（gzip → base64），**不设「多大才压」的阈值**：一个分支就是一个会判错
  // 的地方，而压的代价可以忽略。最大的一篇压完 64.9 KB，余量三成。
  if (a === 'push') {
    const md = body.gz ? zlib.gunzipSync(Buffer.from(body.gz, 'base64')).toString() : String(body.md || '')
    const id = String(body.id || '')
    if (!id || md.length > MAX_MD) throw new Error('bad md')
    // landed 与 hash 一起写：推上去的那一刻库里这一版就是盘上那一版。
    const hash = sha1(md)
    const set = { md, hash, at: new Date().toISOString(), by: '本机', landed: hash }
    const r = await docs.doc(id).update(set)
    if (!r.updated) await docs.doc(id).set(set)
    return { ok: 1 }
  }

  // ── sync.py 专用：记录上的站内文字，与 docs 那一路同一套三方比 ──
  // 整库四千多条，一次取不回来，按 _id 排序翻页；判据是「这一页没满」。
  if (a === 'rpull') {
    const skip = Number(body.skip) || 0
    const r = await recs.orderBy('_id', 'asc').skip(skip).limit(1000).get()
    return { recs: r.data, more: r.data.length >= 1000 ? 1 : 0 }
  }

  // 请求体压过再发（gzip → base64），与 push 同一条；一批几百条，由 sync.py 按体积切。
  // landed 与 hash 一起写：推上去的那一刻库里这一版就是盘上那一版。
  if (a === 'rpush') {
    const rows = JSON.parse(zlib.gunzipSync(Buffer.from(String(body.gz || ''), 'base64')).toString())
    if (!Array.isArray(rows) || !rows.length || rows.length > REC_BATCH) throw new Error('bad batch')
    const at = new Date().toISOString()
    const sets = rows.map((row) => {
      const id = String((row || [])[0] || '')
      const json = String((row || [])[1] || '')
      if (!REC_ID.test(id)) throw new Error('bad rec')
      const flat = flatOf({ json })
      if (Object.keys(flat).some((k) => !REC_PATH.test(k)) || canon(flat) !== json) throw new Error('bad rec')
      return [id, { json, hash: sha1(json), landed: sha1(json), at, by: '本机' }]
    })
    // 先全部验完再写：一批里有一条坏的就一条都不写，sync.py 那一侧不必猜写到了哪儿。
    for (let i = 0; i < sets.length; i += 20) {
      await Promise.all(sets.slice(i, i + 20).map(([id, set]) => recs.doc(id).set(set)))
    }
    return { ok: 1, n: sets.length }
  }

  if (a === 'rdrop') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (!ids.length || ids.length > REC_BATCH || ids.some((id) => !REC_ID.test(id))) throw new Error('bad batch')
    await Promise.all(ids.map((id) => recs.doc(id).remove()))
    return { ok: 1 }
  }

  // landed 那一位按批写，与 docs 的 landed 同一个契约：写不进去就是那一条没了，报出来。
  if (a === 'rlanded') {
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length || items.length > REC_BATCH) throw new Error('bad batch')
    for (const [id, hash] of items) {
      if (!REC_ID.test(String(id)) || !/^[0-9a-f]{40}$/.test(String(hash))) throw new Error('bad landed')
    }
    const r = await Promise.all(items.map(([id, hash]) => recs.doc(String(id)).update({ landed: String(hash) })))
    if (r.some((x) => !x.updated)) throw new Error('no rec')
    return { ok: 1 }
  }

  /* 本机对完账之后，盘上那一篇就是库里这一版，landed 记住它的 hash。审核台判
     hash !== landed 即「线上改过、还没落盘」，那一套因此落进「通过」档。

     **判据挂在内容上，不挂在动作上**：存一位「改过了」的话，改一版又改回原样就永远
     清不掉——三方比看到两边都没变，什么都不做。比 hash 则自己收敛。

     **只有 sync.py 写得动它**：这个字段的意思是「本机落过盘了」，线上的编辑一律不碰，
     所以 smark 更新已上站那一套时只写 hash、不写 landed。 */
  if (a === 'landed') {
    const id = String(body.id || '')
    const hash = String(body.hash || '')
    if (!id || !/^[0-9a-f]{40}$/.test(hash)) throw new Error('bad landed')
    // sync.py 只在这一篇的 landed 与要写的值不等时才发，所以写不进去只有一个原因：
    // 那条 doc 已经没了（pull 与这一发之间被 drop 掉）。**当场报出来**，不静默成功。
    const r = await docs.doc(id).update({ landed: hash })
    if (!r.updated) throw new Error('no doc')
    return { ok: 1 }
  }

  // 重算全部投稿的指纹。**改了 source.js 里 same() 的取法之后要跑一次**——旧记录的 key 是按
  // 旧算法存的，对不上就认不出「这一套已经上站了」，重投会另开一个 slug。
  // 与 sync.py --seed 同一类：平时不用，改了判据才用。
  if (a === 'rekey') {
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

  // sync.py 的 sweep() 落盘删除时调它：库里那条源稿，以及当初那条把它送上站的
  // 投稿记录，一并清掉。
  //
  // **那一套的已通过记录一并清掉，删除申请自己也在内。**
  //
  // 当初把它送上站的那条投稿带着 season/slug 与 ok=1，留着就有两个后果：审核台把
  // 它算成「通过，等着落盘」，那一套永远挂在队列里；land() 也会照它把源稿原样写
  // 回来，与 sweep() 你删我写，那一篇永远删不掉。
  //
  // 删除申请那一条办完也该走：它的状态只有 0/1/-1 三档，没有「已办」那一档，
  // 留着就一直显示「待移除」，而那一套早就不在站上了；sweep() 下一轮还会照它
  // 再删一遍。这件事由 git 里那一次源稿删除留痕，队列不必再存第二份。
  //
  // 待审（ok=0）与废稿（ok=-1）不动：前者可能是删除期间有人重投的新稿。
  if (a === 'drop') {
    const id = String(body.id)
    await docs.doc(id).remove()
    const m = /^builds\/([^/]+)\/([^/]+)$/.exec(id)
    if (m) {
      const done = await subs.where({ season: m[1], slug: m[2], ok: 1 }).limit(50).get()
      for (const one of done.data) await subs.doc(one._id).remove()
    }
    return { ok: 1 }
  }

  throw new Error('bad action')
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEAD, body: '' }
  const q = event.queryStringParameters || {}
  let body = {}
  try {
    // 访问计数那一发不带 content-type（text/plain 免掉跨域预检）。网关对非 JSON 的
    // 正文可能按 base64 转交，带着 isBase64Encoded 标记。
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body
    body = JSON.parse(raw || '{}')
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
