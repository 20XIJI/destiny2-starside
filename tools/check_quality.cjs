'use strict'
// Zero-dependency, no-network regressions against the real HTTP entry point.
// The in-memory adapter follows @cloudbase/database 1.4.3 document/transaction
// return shapes. It proves application atomic boundaries, not the cloud service.
// SDK sources: https://unpkg.com/@cloudbase/database@1.4.3/dist/commonjs/
// transaction/index.js, document.js, serializer/query.js, operator-map.js.
// neq serializes to $ne; the offline query contract includes missing fields.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(process.env.QUALITY_API_SOURCE || path.join(root, 'functions/api/index.js'), 'utf8')
const copy = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v))
const digest = (md) => crypto.createHash('sha1').update(md).digest('hex')
const tests = []
function test(name, fn) { tests.push([name, fn]) }

function harness(seed = {}, hooks = {}) {
  const store = Object.fromEntries(['counters', 'likes', 'subs', 'docs', 'edits', 'editors']
    .map((name) => [name, new Map((seed[name] || []).map((r) => [r._id, copy(r)]))]))
  const calls = []
  let serial = 0
  function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === 'object') {
        // db.RegExp(...) 在这一侧还原成真正的 RegExp：docs 那条路由按 ^builds/
        // 前缀挑配装，不认它的话那条路由整个测不了。
        if (value.$regex !== undefined) return new RegExp(value.$regex, value.$options || '').test(row[key])
        assert.deepEqual(Object.keys(value), ['$ne'], 'unknown query operator')
        return row[key] !== value.$ne
      }
      return row[key] === value
    })
  }
  // shape 收住 limit 之外的几件：field 投影、skip 偏移、orderBy 排序。三件都在
  // @cloudbase/node-sdk 的 Query 上（types/db.d.ts），而 docs 那条路由用着 field，
  // 适配器没有它时那条路由一调即抛——它至今一条断言都没有，就是这么来的。
  function collection(name, state = store, tx = null, query = {},
                      shape = { limit: Infinity, skip: 0, field: null, order: null }) {
    assert.ok(store[name], 'unknown collection ' + name)
    const with_ = (patch) => collection(name, state, tx, query, { ...shape, ...patch })
    return {
      where(q) {
        assert.equal(tx, null, 'transaction queries must use doc, not where')
        return collection(name, state, tx, copy(q), shape)
      },
      limit(n) { return with_({ limit: n }) },
      skip(n) { return with_({ skip: n }) },
      orderBy(field, dir) { return with_({ order: [field, dir] }) },
      field(projection) { return with_({ field: copy(projection) }) },
      async get() {
        assert.equal(tx, null)
        calls.push({ op: 'query', name, query, limit: shape.limit, skip: shape.skip,
                     field: shape.field, order: shape.order })
        let rows = [...state[name].values()].filter((r) => matches(r, query))
        if (shape.order) {
          const [key, dir] = shape.order
          // 稳定序：skip 分页要它，否则同一行可能被跳过或取两次。
          rows = rows.slice().sort((a, b) => {
            const x = a[key], y = b[key]
            return (x === y ? 0 : x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          })
        }
        const data = rows.slice(shape.skip, shape.skip + shape.limit).map(copy)
        // field({ md: false }) 是排除式投影：那个键整个不出现，不是出现但为 undefined。
        // 前端「这一条的正文到底拉没拉回来」判的就是键在不在。
        if (shape.field) {
          for (const row of data) {
            for (const [key, keep] of Object.entries(shape.field)) {
              if (!keep) delete row[key]
            }
          }
        }
        if (hooks.query) await hooks.query({ name, query, data, store })
        return { data }
      },
      async update(fields) {
        assert.equal(tx, null)
        calls.push({ op: 'queryUpdate', name, query, fields: copy(fields) })
        let updated = 0
        for (const row of state[name].values()) {
          if (matches(row, query)) { Object.assign(row, copy(fields)); updated++ }
        }
        return { updated }
      },
      async add(fields) {
        assert.equal(tx, null)
        const id = 'new-' + ++serial
        calls.push({ op: 'add', name, id })
        state[name].set(id, { ...copy(fields), _id: id })
        return { id }
      },
      doc(id) {
        assert.equal(typeof id, 'string')
        return {
          async get() {
            calls.push({ op: 'get', name, id, tx: !!tx })
            if (tx) tx.reads.add(name + '\0' + id)
            const row = copy(state[name].get(id))
            if (hooks.get) {
              const injected = await hooks.get({ name, id, tx, store })
              if (injected) return injected
            }
            return { data: tx ? row || null : row ? [row] : [] }
          },
          async update(fields) {
            assert.equal(Object.hasOwn(fields, 'data'), false, 'SDK update takes flat fields')
            calls.push({ op: 'update', name, id, tx: !!tx, fields: copy(fields) })
            if (hooks.update) {
              const injected = await hooks.update({ name, id, fields, tx, store })
              if (injected) return injected
            }
            const row = state[name].get(id)
            if (!row) return { updated: 0 }
            Object.assign(row, copy(fields))
            if (tx) tx.writes.add(name + '\0' + id)
            return { updated: 1 }
          },
          // set 整条替换，update 是合并——eds 建新编辑者走的是 set。
          async set(fields) {
            calls.push({ op: 'set', name, id, tx: !!tx, fields: copy(fields) })
            state[name].set(id, Object.assign({ _id: id }, copy(fields)))
            if (tx) tx.writes.add(name + '\0' + id)
            return { updated: 1 }
          },
          async remove() {
            calls.push({ op: 'remove', name, id, tx: !!tx })
            const had = state[name].delete(id)
            if (tx) tx.writes.add(name + '\0' + id)
            return { deleted: had ? 1 : 0 }
          }
        }
      }
    }
  }
  const db = {
    command: { neq: (v) => ({ $ne: v }) },
    RegExp: ({ regexp, options }) => ({ $regex: regexp, $options: options || '' }),
    collection,
    async runTransaction(fn, retries) {
      assert.equal(retries, 0, 'must never automatically replay an approval batch')
      const state = Object.fromEntries(Object.entries(store).map(([name, rows]) =>
        [name, new Map([...rows].map(([id, row]) => [id, copy(row)]))]))
      const baseline = Object.fromEntries(Object.entries(state).map(([name, rows]) =>
        [name, new Map([...rows].map(([id, row]) => [id, JSON.stringify(row)]))]))
      const tx = { reads: new Set(), writes: new Set() }
      calls.push({ op: 'begin' })
      try {
        const result = await fn({ collection: (name) => collection(name, state, tx) })
        for (const key of tx.reads) {
          const [name, id] = key.split('\0')
          if (JSON.stringify(store[name].get(id)) !== baseline[name].get(id)) {
            throw Object.assign(new Error('database conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' })
          }
        }
        if (hooks.commit) await hooks.commit({ store, state, tx })
        for (const key of tx.writes) {
          const [name, id] = key.split('\0')
          store[name].set(id, copy(state[name].get(id)))
        }
        calls.push({ op: 'commit' })
        return result
      } catch (error) {
        calls.push({ op: 'rollback' })
        throw error
      }
    }
  }
  const sandbox = {
    exports: {}, Buffer, console,
    process: { env: { ADMIN_TOKEN: 'isolated-quality-token' } },
    fetch() { throw new Error('network prohibited') },
    require(name) {
      if (name === 'crypto') return crypto
      if (name === 'zlib') return zlib
      // 切格那一份与线上是同一个文件，不在这里另造替身。
      if (name === './dialect.js') return require(path.join(root, 'functions/api/dialect.js'))
      assert.equal(name, '@cloudbase/node-sdk', 'unexpected module')
      return { init: () => ({ database: () => db }) }
    }
  }
  vm.runInNewContext(source + '\nexports.quality = { fingerprint, wc, LEVEL };', sandbox, { filename: 'functions/api/index.js' })
  return {
    store, calls,
    fingerprint: sandbox.exports.quality.fingerprint,
    // 令牌缓存：种一个身份进去，who() 就不必 fetch，真正那条门跑得到。
    signIn: (token, lv, uid = 'u' + lv) =>
      sandbox.exports.quality.wc.set(token, { t: Date.now(), uid, name: '测试' + lv, lv }),
    level: sandbox.exports.quality.LEVEL,
    async as(token, body) {
      const response = await sandbox.exports.main({ httpMethod: 'POST', body: JSON.stringify(body),
        headers: { authorization: 'Bearer ' + token } })
      return { status: response.statusCode, ...JSON.parse(response.body) }
    },
    snapshot: () => copy(Object.fromEntries(Object.entries(store).map(([name, rows]) => [name, [...rows.values()]]))),
    async request(body, authenticated = true) {
      const response = await sandbox.exports.main({ httpMethod: 'POST', body: JSON.stringify(body),
        headers: authenticated ? { authorization: 'Bearer isolated-quality-token' } : {} })
      return { status: response.statusCode, ...JSON.parse(response.body) }
    }
  }
}
const md = '# 配装\n推荐人：甲\n职业：猎人\n分支：棱镜\n核心：装备\n\n## 注解\n旧文'
function submission(h, id, fields = {}) {
  return { _id: id, md, key: h.fingerprint(md), ok: 0, at: 'unchanged', season: 's29-测试', slug: 'a-hunter', ...fields }
}
function edit(id, blk, before, after, extra = {}) {
  return { _id: id, doc: 'docs/example', blk, cell: -1, before, after, ok: 0, by: id, ...extra }
}
function reviewSeed(text, rows) {
  return { docs: [{ _id: 'docs/example', md: text, hash: digest(text), by: 'original' }], edits: rows }
}
const jobs = (rows) => rows.map((e) => ({ id: e._id, ok: 1 }))
async function rejectedBatch(seed, body, error = 'conflict', hooks = {}) {
  const h = harness(seed, hooks)
  const before = h.snapshot()
  const result = await h.request({ a: 'emark', ...body })
  assert.equal(result.status, 400)
  assert.equal(result.error, error)
  assert.deepEqual(h.snapshot(), before, 'failed batch must preserve all documents and proposals')
  assert.equal(h.calls.some((c) => c.op === 'commit'), false)
  return h
}

test('ordinary submission cannot overwrite a pending deletion snapshot', async () => {
  const h = harness()
  const drop = submission(h, 'delete', { drop: 1, by: '申请人', uid: 'u' })
  h.store.subs.set(drop._id, copy(drop))
  const result = await h.request({ a: 'sub', md: md.replace('旧文', '新文') }, false)
  assert.equal(result.dup, 0)
  assert.equal(result.updates, 0)
  assert.deepEqual(h.store.subs.get('delete'), drop)
  const normal = [...h.store.subs.values()].find((r) => r._id !== 'delete')
  assert.equal(normal.md, md.replace('旧文', '新文'))
  assert.equal(normal.drop, 0)
})

test('normal query includes missing/zero drop and filters deletion before limit', async () => {
  for (const fields of [{}, { drop: 0 }]) {
    const h = harness()
    const drop = submission(h, 'first', { drop: 1 })
    const normal = submission(h, 'normal', fields)
    h.store.subs.set('first', copy(drop))
    h.store.subs.set('normal', copy(normal))
    assert.equal((await h.request({ a: 'sub', md: md.replace('旧文', '新文') }, false)).dup, 1)
    assert.equal(h.store.subs.size, 2)
    assert.deepEqual(h.store.subs.get('first'), drop)
    assert.equal(h.store.subs.get('normal').md, md.replace('旧文', '新文'))
  }
})

test('only normal approved submissions may supply update destinations', async () => {
  const h = harness()
  h.store.subs.set('delete', submission(h, 'delete', { ok: 1, drop: 1 }))
  assert.equal((await h.request({ a: 'sub', md }, false)).updates, 0)
  assert.equal([...h.store.subs.values()].find((r) => r.ok === 0).updates, undefined)
  const other = harness()
  other.store.subs.set('delete', submission(other, 'delete', { ok: 1, drop: 1, slug: 'wrong' }))
  other.store.subs.set('normal', submission(other, 'normal', { ok: 1 }))
  assert.equal((await other.request({ a: 'sub', md }, false)).updates, 1)
  assert.equal([...other.store.subs.values()].find((r) => r.ok === 0).slug, 'a-hunter')
})

test('submission compare-and-update rejects concurrent status/type/key changes', async () => {
  for (const change of [{ ok: 1 }, { drop: 1 }, { key: 'another' }]) {
    const h = harness({}, { query({ name, query, store }) {
      if (name === 'subs' && query.ok === 0) Object.assign(store.subs.get('normal'), change)
    } })
    h.store.subs.set('normal', submission(h, 'normal'))
    const result = await h.request({ a: 'sub', md: md.replace('旧文', '新文') }, false)
    assert.equal(result.error, 'conflict')
    assert.equal(h.store.subs.get('normal').md, md)
    assert.equal(h.store.subs.size, 1)
  }
})

test('editor save and explicit smark md cannot alter deletion snapshots', async () => {
  const h = harness()
  h.store.subs.set('delete', submission(h, 'delete', { drop: 1 }))
  const before = h.snapshot()
  assert.equal((await h.request({ a: 'ssave', id: 'missing', md })).error, 'no sub')
  for (const body of [{ a: 'ssave', id: 'delete', md },
    { a: 'smark', id: 'delete', ok: 1, md }, { a: 'smark', id: 'delete', ok: -1, md: null }]) {
    assert.equal((await h.request(body)).error, 'bad sub type')
    assert.deepEqual(h.snapshot(), before)
  }
  assert.equal((await h.request({ a: 'smark', id: 'delete', ok: 1 })).ok, 1)
  assert.equal(h.store.subs.get('delete').ok, 1)
  assert.equal(h.store.subs.get('delete').md, md)
})

test('both verdicts withdraw back to pending, an approval only before it lands', async () => {
  // 通过但还没落盘：退得回来，正文与 season/slug 原样留着，再通过一次照旧走查重
  const h = harness()
  h.store.subs.set('sub', submission(h, 'sub', { ok: 1 }))
  assert.equal((await h.request({ a: 'smark', id: 'sub', ok: 0 })).ok, 1)
  assert.equal(h.store.subs.get('sub').ok, 0)
  assert.equal(h.store.subs.get('sub').md, md)
  assert.equal(h.store.subs.get('sub').slug, 'a-hunter')

  // 驳回同样退得回来：审的人点错了、或者打回之后又改主意。正文、指纹与 season/slug
  // 原样留着——驳回那一路一个字都没动过它们。
  const back = harness()
  back.store.subs.set('sub', submission(back, 'sub', { ok: -1 }))
  assert.equal((await back.request({ a: 'smark', id: 'sub', ok: 0 })).ok, 1)
  assert.equal(back.store.subs.get('sub').ok, 0)
  assert.equal(back.store.subs.get('sub').md, md)
  assert.equal(back.store.subs.get('sub').key, back.fingerprint(md))
  assert.equal(back.store.subs.get('sub').slug, 'a-hunter')

  // 已上站：只把库里的状态退回去，盘上的源稿与站上的页面还在，两侧就此对不上,
  // 而且没有任何一侧会报出来。这条路要走「申请移除」。
  const live = harness({ docs: [{ _id: 'builds/s29-测试/a-hunter', md, hash: digest(md) }] })
  live.store.subs.set('sub', submission(live, 'sub', { ok: 1 }))
  const landed = live.snapshot()
  assert.equal((await live.request({ a: 'smark', id: 'sub', ok: 0 })).error, '已上站，请走申请移除')
  assert.deepEqual(live.snapshot(), landed)

  // **那道门只管通过这一档**：被驳回的更新也带着已上站那一套的 season/slug，按在场
  // 的 docs 判会把它永远锁在驳回里，而它从来没落过盘。
  const update = harness({ docs: [{ _id: 'builds/s29-测试/a-hunter', md, hash: digest(md) }] })
  update.store.subs.set('sub', submission(update, 'sub', { ok: -1, updates: 1 }))
  assert.equal((await update.request({ a: 'smark', id: 'sub', ok: 0 })).ok, 1)
  assert.equal(update.store.subs.get('sub').ok, 0)

  // 同一套已经有一条新的待审：撤回旧的就撞出第二条，两条都能通过，而通过时的 slug
  // 是现算的随机串、查重只看 ok=1 与 docs，站上因此多出一份重复配装。
  const race = harness()
  race.store.subs.set('sub', submission(race, 'sub', { ok: -1 }))
  race.store.subs.set('again', submission(race, 'again'))
  const queued = race.snapshot()
  assert.equal((await race.request({ a: 'smark', id: 'sub', ok: 0 })).error, '已有新的待审投稿')
  assert.deepEqual(race.snapshot(), queued)

  // 删除申请不许撤（sweep() 可能已经把源稿删了），已经在待审的没有可撤的东西
  for (const fields of [{ drop: 1, ok: 1 }, { drop: 1, ok: -1 }, { ok: 0 }]) {
    const g = harness()
    g.store.subs.set('sub', submission(g, 'sub', fields))
    const was = g.snapshot()
    assert.equal((await g.request({ a: 'smark', id: 'sub', ok: 0 })).error,
      fields.drop ? 'bad sub type' : 'already pending')
    assert.deepEqual(g.snapshot(), was)
  }
})

test('one batch preserves two changes and writes final document once', async () => {
  const rows = [edit('a', 0, '甲', '甲新'), edit('b', 1, '乙', '乙新')]
  const h = harness(reviewSeed('甲\n乙', rows))
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows) })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, '甲新\n乙新')
  assert.equal(h.store.docs.get('docs/example').hash, digest('甲新\n乙新'))
  assert.equal(h.store.docs.get('docs/example').by, 'b')
  assert.deepEqual([...h.store.edits.values()].map((e) => e.ok), [1, 1])
  assert.equal(h.calls.filter((c) => c.op === 'update' && c.name === 'docs').length, 1)
})

test('snapshot locations survive front insertion and later duplicate text', async () => {
  const rows = [edit('back', 3, '重复', '正确'), edit('front', 0, '头', '头\n新增')]
  const h = harness(reviewSeed('头\n重复\n中\n重复', rows))
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows) })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, '头\n新增\n重复\n中\n正确')
  assert.equal(h.store.docs.get('docs/example').by, 'front', 'author follows request, not patch position')
})

test('same table row applies right-to-left and normalizes legacy newlines', async () => {
  const rows = [edit('a', 0, '甲', '甲长\n换行', { cell: 0 }), edit('b', 0, '{buff|乙}', '乙新', { cell: 1 })]
  const h = harness(reviewSeed('| 甲 | {buff|乙} | 邻格 |', rows))
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows) })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, '| 甲长\\\\换行 | 乙新 | 邻格 |')
})

test('all documents and edit states roll back on any invalid member', async () => {
  const first = edit('a', 0, '甲', '甲新')
  for (const second of [edit('b', 1, '不存在', '乙新'), edit('b', 1, '乙', '乙新', { ok: 1 })]) {
    await rejectedBatch(reviewSeed('甲\n乙', [first, second]), { jobs: jobs([first, second]) })
  }
  await rejectedBatch(reviewSeed('甲', [first]), { jobs: [{ id: 'a', ok: 1 }, { id: 'missing', ok: -1 }] }, 'no edit')
  await rejectedBatch({ edits: [first] }, { jobs: jobs([first]) }, 'no doc')
})

test('overlapping blocks and block/cell mixtures reject the entire batch', async () => {
  for (const [text, rows] of [
    ['甲\n乙', [edit('a', 0, '甲\n乙', '合并'), edit('b', 1, '乙', '替换')]],
    ['| 甲 | 乙 |', [edit('a', 0, '| 甲 | 乙 |', '| 新 | 行 |'), edit('b', 0, '乙', '替换', { cell: 1 })]],
    ['| 甲 | 乙 |', [edit('a', 0, '甲', '一', { cell: 0 }), edit('b', 0, '甲', '二', { cell: 0 })]]
  ]) await rejectedBatch(reviewSeed(text, rows), { jobs: jobs(rows) })
})

test('failed document/edit writes and get codes abort the whole transaction', async () => {
  const rows = [edit('a', 0, '甲', '甲新'), edit('b', 1, '乙', '乙新')]
  for (const name of ['docs', 'edits']) {
    for (const response of [{ code: 'WRITE_FAILED', message: 'injected write failure' }, { updated: 0 }]) {
      await rejectedBatch(reviewSeed('甲\n乙', rows), { jobs: jobs(rows) },
        response.code ? 'injected write failure' : 'conflict', {
          update: (r) => r.name === name && (name === 'docs' || r.id === 'b') ? response : undefined
        })
    }
    await rejectedBatch(reviewSeed('甲\n乙', rows), { jobs: jobs(rows) }, 'injected read failure', {
      get: (r) => r.name === name ? { code: 'READ_FAILED', message: 'injected read failure' } : undefined
    })
  }
})

test('SDK conflict code is translated; unknown commit failures stay unknown', async () => {
  const rows = [edit('a', 0, '甲', '甲新')]
  await rejectedBatch(reviewSeed('甲', rows), { jobs: jobs(rows) }, 'conflict', {
    update: () => ({ code: 'DATABASE_TRANSACTION_CONFLICT', message: 'SDK conflict' })
  })
  await rejectedBatch(reviewSeed('甲', rows), { jobs: jobs(rows) }, 'commit outcome unknown', {
    commit() { throw Object.assign(new Error('commit outcome unknown'), { code: 'NETWORK_ERROR' }) }
  })
})

test('choose-one failure never rejects the alternative; rejection needs no doc', async () => {
  const rows = [edit('a', 0, '旧', '一'), edit('b', 0, '旧', '二')]
  await rejectedBatch(reviewSeed('新', rows), { jobs: [{ id: 'a', ok: 1 }, { id: 'b', ok: -1 }] })
  const h = harness({ edits: rows })
  assert.equal((await h.request({ a: 'emark', jobs: rows.map((e) => ({ id: e._id, ok: -1 })) })).ok, 1)
  assert.deepEqual([...h.store.edits.values()].map((e) => e.ok), [-1, -1])
  assert.equal(h.calls.some((c) => c.name === 'docs'), false)
})

test('batch input rejects legacy, empty, duplicate and non-strict jobs', async () => {
  const row = edit('a', 0, '甲', '甲新')
  for (const body of [{ id: 'a', ok: 1 }, { jobs: [] }, { jobs: {} },
    { jobs: [null] }, { jobs: [{ id: '', ok: 1 }] }, { jobs: [{ id: ' ', ok: 1 }] },
    { jobs: [{ id: 1, ok: 1 }] }, { jobs: [{ id: 'a', ok: '1' }] },
    { jobs: [{ id: 'a', ok: 0 }] }, { jobs: [{ id: 'a', ok: true }] },
    { jobs: [{ id: 'a', ok: 1 }, { id: 'a', ok: -1 }] }]) {
    await rejectedBatch(reviewSeed('甲', [row]), body, 'bad jobs')
  }
  const h = harness(reviewSeed('甲', [row]))
  assert.equal((await h.request({ a: 'emark', jobs: jobs([row]) }, false)).error, 'forbidden')
  assert.equal(h.calls.length, 0)
})

test('operation limits reject before writes and permit the exact boundary', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => edit('e' + i, i, '行' + i, '新' + i))
  const seed = reviewSeed(rows.map((e) => e.before).join('\n'), rows)
  const tooMany = await rejectedBatch(seed, { jobs: jobs(rows) }, 'batch too large')
  assert.equal(tooMany.calls.length, 0)
  const tooManyOps = await rejectedBatch(seed, { jobs: jobs(rows.slice(0, 49)) }, 'batch too large')
  assert.equal(tooManyOps.calls.some((c) => c.name === 'docs'), false)
  const h = harness(seed)
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows.slice(0, 48)) })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, rows.map((e, i) => i < 48 ? e.after : e.before).join('\n'))
  const separate = rows.slice(0, 25).map((e, i) => ({ ...e, doc: 'docs/' + i, blk: 0 }))
  await rejectedBatch({ edits: separate, docs: separate.map((e) => ({ _id: e.doc, md: e.before })) },
    { jobs: jobs(separate) }, 'batch too large')
})

test('concurrent approvals cannot both succeed while losing one change', async () => {
  const rows = [edit('a', 0, '甲', '甲新'), edit('b', 1, '乙', '乙新')]
  let arrived = 0
  let release
  const barrier = new Promise((resolve) => { release = resolve })
  const h = harness(reviewSeed('甲\n乙', rows), { async get({ name }) {
    if (name !== 'docs') return
    if (++arrived === 2) release()
    await barrier
  } })
  let timer
  const results = await Promise.race([
    Promise.all(rows.map((e) => h.request({ a: 'emark', jobs: [{ id: e._id, ok: 1 }] }))),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('concurrency barrier not reached')), 2000) })
  ]).finally(() => clearTimeout(timer))
  assert.equal(results.filter((r) => r.ok === 1).length, 1)
  assert.equal(results.filter((r) => r.error === 'conflict').length, 1)
  const accepted = rows.find((e) => h.store.edits.get(e._id).ok === 1)
  const pending = rows.find((e) => h.store.edits.get(e._id).ok === 0)
  assert.equal(h.store.docs.get('docs/example').md, accepted._id === 'a' ? '甲新\n乙' : '甲\n乙新')
  assert.equal(h.store.edits.get(pending._id).after, pending.after)
  assert.equal(h.calls.filter((c) => c.op === 'begin').length, 2, 'no automatic retries')
})

test('cross-document write failure rolls back earlier staged documents', async () => {
  const rows = [edit('a', 0, '甲', '甲新'), edit('b', 0, '乙', '乙新', { doc: 'docs/second' })]
  const seed = reviewSeed('甲', rows)
  seed.docs.push({ _id: 'docs/second', md: '乙', hash: digest('乙') })
  await rejectedBatch(seed, { jobs: jobs(rows) }, 'second document failed', {
    update: ({ name, id }) => name === 'docs' && id === 'docs/second'
      ? { code: 'WRITE_FAILED', message: 'second document failed' } : undefined
  })
  const h = harness(seed)
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows) })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, '甲新')
  assert.equal(h.store.docs.get('docs/second').md, '乙新')
  assert.deepEqual([...h.store.edits.values()].map((e) => e.ok), [1, 1])
})

test('choosing a candidate accepts it and rejects its alternative atomically', async () => {
  const rows = [edit('a', 0, '甲', '选中'), edit('b', 0, '甲', '备选')]
  const h = harness(reviewSeed('甲', rows))
  assert.equal((await h.request({ a: 'emark', jobs: [{ id: 'a', ok: 1 }, { id: 'b', ok: -1 }] })).ok, 1)
  assert.equal(h.store.docs.get('docs/example').md, '选中')
  assert.deepEqual([...h.store.edits.values()].map((e) => e.ok), [1, -1])
  assert.equal(h.calls.filter((c) => c.op === 'commit').length, 1)
})

test('49 rejections fit the transaction boundary without reading documents', async () => {
  const rows = Array.from({ length: 49 }, (_, i) => edit('e' + i, i, '旧', '新'))
  const h = harness({ edits: rows })
  assert.equal((await h.request({ a: 'emark', jobs: rows.map((e) => ({ id: e._id, ok: -1 })) })).ok, 1)
  assert.deepEqual([...h.store.edits.values()].map((e) => e.ok), Array(49).fill(-1))
  assert.equal(h.calls.some((c) => c.name === 'docs'), false)
})

// 源稿方言里 | 是分隔符、{} 是着色标记。混进表格格的话那一行会多一格、或者标记不
// 闭合，convert-doc.py 的闸门当场 die，卡住整次 npm run build，而编辑那一侧看不出
// 任何异样。换行走自动改对那条路，这两个字符没有等价写法，所以在提交时就拒收。
const tableDoc = '# 标题\n\n## 一节\n\n| 名称 | 说明 |\n|---|---|\n| 甲 | 旧文 |\n\n正文一段\n'
function cellSeed() {
  return { docs: [{ _id: 'docs/example', md: tableDoc, hash: digest(tableDoc), by: 'original' }] }
}
async function change(after, before = '旧文', blk = 6, cell = 1) {
  const h = harness(cellSeed())
  const result = await h.request({ a: 'chg', doc: 'docs/example', before, after, blk, cell })
  return { h, result, queued: [...h.store.edits.values()] }
}

test('a bare pipe in a table cell is refused before it reaches the queue', async () => {
  const { result, queued } = await change('新|文')
  assert.equal(result.status, 400)
  assert.match(result.error, /竖线/)
  assert.deepEqual(queued, [])
})

test('a tint marker keeps its own pipe and its own braces', async () => {
  const { result, queued } = await change('{el-arc|电弧}伤害')
  assert.equal(result.ok, 1)
  assert.deepEqual(queued.map((e) => e.after), ['{el-arc|电弧}伤害'])
})

test('a pipe after a closed marker is still a separator and is refused', async () => {
  const { result, queued } = await change('{el-arc|电弧}|尾巴')
  assert.equal(result.status, 400)
  assert.match(result.error, /竖线/)
  assert.deepEqual(queued, [])
})

test('unbalanced tint braces are refused in both directions', async () => {
  for (const after of ['{el-arc|电弧', '电弧}', '{a|{b|c}']) {
    const { result, queued } = await change(after)
    assert.equal(result.status, 400, after)
    assert.match(result.error, /花括号/)
    assert.deepEqual(queued, [], after)
  }
})

test('replacing a whole row keeps the pipes that make it a row', async () => {
  const { result, queued } = await change('| 乙 | 新文 |', '| 甲 | 旧文 |', 6, -1)
  assert.equal(result.ok, 1)
  assert.deepEqual(queued.map((e) => e.after), ['| 乙 | 新文 |'])
})

test('outside a table row a pipe is ordinary text', async () => {
  const { result, queued } = await change('正文|两段', '正文一段', 8, -1)
  assert.equal(result.ok, 1)
  assert.deepEqual(queued.map((e) => e.after), ['正文|两段'])
})

test('approving a record queued before the guard existed still refuses it', async () => {
  const seed = cellSeed()
  seed.edits = [edit('e1', 6, '旧文', '新|文', { cell: 1 })]
  const h = harness(seed)
  const result = await h.request({ a: 'emark', jobs: [{ id: 'e1', ok: 1 }] })
  assert.equal(result.status, 400)
  assert.match(result.error, /竖线/)
  assert.equal(h.store.docs.get('docs/example').md, tableDoc)
  assert.equal(h.store.edits.get('e1').ok, 0)
})

// 切格在 JS 侧有三份：云函数与 edit.js 的 cellSpans()（应当逐字相同）、admin.js 的
// cells()（前端闸门数格数用的那份，{ 的判据与 } 的钳位都不一样）。拿全部真表格行现跑
// 对住，不用快照——scratchpad 里那份断言正是因为把对面的结果冻成了快照，改了实现
// 照样全绿。
//
// Python 那一份不在这里：起 python 就破了这份套件「不启动子进程」的承诺。它与「语料
// 保持规整」这个前提由 check_quality.py 的 CellSplitting 管。
function funcSource(file, name) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const head = new RegExp('^([ \\t]*)function ' + name + ' ?\\(', 'm').exec(text)
  assert.notEqual(head, null, `${file} 里找不到 ${name}()`)
  // 按缩进找收尾，不数花括号——cells() 的函数体里有 '{' 与 '}' 两个字符串字面量，
  // 数括号会在那里提前收口。同一层缩进上孤零零的一个 } 就是这个函数的末尾。
  const close = new RegExp('^' + (head[1] || '') + '\\}$', 'm')
  const rest = text.slice(head.index + head[0].length)
  const at = close.exec(rest)
  assert.notEqual(at, null, `${file} 的 ${name}() 没找到收尾`)
  return text.slice(head.index, head.index + head[0].length + at.index + at[0].length)
}

function splitter(file, name) {
  const ctx = {}
  vm.createContext(ctx)
  // admin.js 的 cells() 用到模块里的 OPEN 与 openAt，一并带上。
  const deps = name === 'cells'
    ? "var OPEN=/^\\{([\\w-]+)\\|/;function openAt(s,i){return s.charAt(i)==='{'?OPEN.exec(s.slice(i)):null}\n"
    : ''
  vm.runInContext(deps + funcSource(file, name) + `\nthis.f=${name}`, ctx)
  return ctx.f
}

function tableRows() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) {
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          if (line.trimStart().startsWith('|')) out.push([path.relative(root, full), i + 1, line])
        })
      }
    }
  }
  walk(path.join(root, 'references'))
  return out
}

test('the dialect module is byte-identical in both places it has to live', () => {
  // 切格在 JS 这一侧只有 admin/dialect.js 一份定义。云函数只 require 得到自己
  // 目录下的东西，所以 build-terms.py 复制一份到 functions/api/。复制走样就是
  // 站上与库里对同一行切出不同的格——那一格改下去会落到别处。
  const one = fs.readFileSync(path.join(root, 'admin/dialect.js'), 'utf8')
  const two = fs.readFileSync(path.join(root, 'functions/api/dialect.js'), 'utf8')
  assert.equal(two, one, 'functions/api/dialect.js 与 admin/dialect.js 不一样了——跑 npm run build 重新复制')
})

test('no consumer keeps a private copy of the splitter', () => {
  // 从前这条规则在 JS 里有三份（云函数、edit.js、admin.js），且并不等价：
  // admin.js 的 titleEnd() 不记花括号深度，4563 行语料里 382 行把行标题截在
  // {token|…} 内部那个竖线上，于是行标题里的词在编辑台上被报「该着色」，
  // 而构建时的 G6 不报。认的是切格独有的那一句剥空格循环：谁再抄一份回去，
  // 那一句就跟着回去，这条就响。
  const MARK = "while (b > a && line[b - 1] === ' ') b--"
  const owns = ['admin/dialect.js', 'functions/api/dialect.js']
  for (const rel of [...owns, 'functions/api/index.js', 'admin/edit.js', 'admin/admin.js']) {
    const has = fs.readFileSync(path.join(root, rel), 'utf8').includes(MARK)
    assert.equal(has, owns.includes(rel),
      has ? `${rel} 又自己实现了一遍切格，应该转给 dialect.js`
          : `${rel} 里找不到切格实现——dialect.js 被改动了？`)
  }
})

test('app.js and the page-specific modules it lazy-loads stay in step', () => {
  // 三段页面专属的东西拆出去之后，app.js 里只剩一句 lazy('x.js')。少了那个文件、
  // 或者拆的时候漏改了分发（还在直接调已经搬走的函数），页面上是整个 app.js
  // 抛异常、工具条与分节高亮一起没了，而构建、闸门、npm test 全都看不见。
  const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8')
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [file, gone] of [['chart.js', 'chart'], ['rota.js', 'rota'], ['home.js', 'home']]) {
    assert.ok(fs.existsSync(path.join(root, 'assets', file)), `assets/${file} 不在`)
    assert.match(code, new RegExp(`lazy\\('${file}'\\)`), `app.js 没有 lazy('${file}')`)
    assert.doesNotMatch(code, new RegExp(`(?<![.\\w])${gone}\\s*\\(`),
      `app.js 还在直接调 ${gone}()，但它已经搬进 assets/${file} 了`)
    const mod = fs.readFileSync(path.join(root, 'assets', file), 'utf8')
    assert.match(mod, /export default function init\s*\(/, `assets/${file} 没有 export default init`)
  }
  assert.match(code, /document\.currentScript/,
    'app.js 要按自己的 src 算模块路径：classic script 里 import() 的相对路径按文档基址解')
})

test('both entry points load the dialect before the console that uses it', () => {
  // admin.js 的 cells()/titleEnd() 现读 window.starsideDialect。少这一句，
  // /admin/ 一开就是 undefined.cells，而闸门、构建、npm test 全都看不见——
  // 那一屏是手写的 HTML，没有任何生成器管它。
  const html = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8')
  const at = (src) => html.indexOf(`<script src="${src}"`)
  assert.notEqual(at('dialect.js'), -1, 'admin/index.html 没有引 dialect.js')
  assert.ok(at('dialect.js') < at('admin.js'),
    'admin/index.html 里 dialect.js 要排在 admin.js 前面')

  // 资料页上开编辑态走的是 edit.js 自己那条注入链，同样要先注入 dialect。
  const edit = fs.readFileSync(path.join(root, 'admin/edit.js'), 'utf8')
  const chain = /script\('admin\/dialect\.js'\)[\s\S]{0,120}script\('admin\/admin\.js'\)/
  assert.match(edit, chain, 'edit.js 注入 admin.js 之前没有先注入 dialect.js')
})

test('the dialect splits every real table row into cells that agree with its own count', () => {
  const D = require(path.join(root, 'admin/dialect.js'))
  const rows = tableRows()
  assert.ok(rows.length > 4000, `只扫到 ${rows.length} 行表格行，语料挪走了？`)
  for (const [where, n, line] of rows) {
    const spans = D.cellSpans(line)
    assert.notEqual(spans, null, `${where}:${n} 整行不认——那一格永远改不了`)
    assert.equal(D.cells(line), spans.length, `${where}:${n} cells() 与 cellSpans() 数不一致`)
    assert.ok(spans.every(([a, b]) => a <= b && b <= line.length), `${where}:${n} 区间越界`)
  }
})

test('every action that needs credentials refuses a request that carries none', async () => {
  // 从前门槛是 25 条分支体里的字面量，这一类断言写不出来——没有表可遍历。
  const h = harness()
  for (const [action, need] of Object.entries(h.level)) {
    const r = await h.request({ a: action }, false)
    if (need === null) {
      assert.notEqual(r.error, 'forbidden', `${action} 是公开动作，不该要令牌`)
      continue
    }
    assert.equal(r.status, 400, `${action} 无凭据时该被拒`)
    assert.match(String(r.error), /forbidden|bad token/, `${action} 无凭据时放行了：${r.error}`)
  }
})

test('the permission table covers exactly the actions the router dispatches', () => {
  // 新增一条 action 忘了写门槛，从前是静默开放；现在表里缺一行，这条就响。
  const source = fs.readFileSync(path.join(root, 'functions/api/index.js'), 'utf8')
  const dispatched = new Set([...source.matchAll(/if \(a === '([^']+)'\)/g)].map((m) => m[1]))
  const declared = new Set(Object.keys(harness().level))
  assert.deepEqual([...dispatched].filter((a) => !declared.has(a)), [], '这些 action 没在 LEVEL 里写门槛')
  assert.deepEqual([...declared].filter((a) => !dispatched.has(a)), [], 'LEVEL 里这些 action 已经没有分支了')
})

test('a signed-in editor below the bar is told it is a permission problem, not a bad token', async () => {
  // who() 里那道 `me.lv < need` 从前一次都没跑过：测试每次都带 ADMIN_TOKEN，
  // 在 index.js 的破窗那一行就短路成 lv 5 了。**两个词必须分开**：前端收到
  // forbidden 会去换令牌再打一次，权限不足报成 forbidden 的话，lv 不够的人
  // 点一下要白跑三趟，报出来还看不出是权限问题。
  const h = harness()
  h.signIn('lv1', 1)
  assert.equal((await h.as('lv1', { a: 'edits' })).error, undefined, 'lv 1 该进得了 edits')
  assert.equal((await h.as('lv1', { a: 'emark', jobs: [] })).error, 'no permission', 'lv 1 不该进得了 emark')
  assert.equal((await h.as('lv1', { a: 'eds', op: 'set', uid: 'x', lv: 1 })).error, 'no permission', 'lv 1 不该改得了编辑者')
  // 编辑者那张表整张归超管：看名单与改名单是同一层的事。
  h.signIn('lv3', 3)
  assert.equal((await h.as('lv3', { a: 'eds', op: 'list' })).error, 'no permission', 'lv 3 不该看得到编辑者名单')
})

test('an editor cannot mint someone at or above their own level', async () => {
  // eds 那两行是唯一防止一个超管造出第二个超管的东西，此前零断言。
  const h = harness({ editors: [{ _id: 'u4', name: '老四', lv: 4 }] })
  h.signIn('lv4', 4, 'u4')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 4 })).error, 'bad lv', '不许造出与自己同级的')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 5 })).error, 'bad lv', '不许造出高于自己的')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'u4', lv: 1 })).error, 'forbidden', '不许动与自己同级的人')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 3 })).error, undefined, 'lv 3 该造得出来')
})

// 编辑台的 lint() 与 terms.js 一起跑：admin.js 在 Node 里只导出纯函数，
// 但顶层有一句 window.addEventListener，所以 window 要给个壳。
function adminApi(extra) {
  const sandbox = { console, module: { exports: {} }, window: { addEventListener() {} }, ...extra }
  vm.createContext(sandbox)
  for (const rel of ['admin/dialect.js', 'admin/terms.js', 'admin/admin.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel })
  }
  return { api: sandbox.module.exports, terms: sandbox.window.starsideTerms }
}

// 汉字与拉丁之间那个排版空格的插入点，与 items.py 的 pattern() 同一条判据。
const BOUND = /(?<=[\u4e00-\u9fff])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\u4e00-\u9fff])/g

test('the editing console flags item names written with the typographic space', () => {
  // 源稿按 design.md 三节在汉字与拉丁之间补一个空格（语料里 117 处「Vex 揭秘者」
  // 这类写法），而 tools/items.json 的键是归一化过的、没有那个空格。Python 那侧
  // 靠 items.pattern() 把空格允许回来；terms.js 要把两种写法都带上，否则编辑台
  // 对这批名字一声不吭，而构建时的 G6 照报——人在编辑台上看不出该着色。
  const { api, terms } = adminApi()
  const mixed = terms.items.filter((row) => BOUND.test(row[0]) && (BOUND.lastIndex = 0, true))
  assert.ok(mixed.length > 20, `terms.js 里中英混排的名字只有 ${mixed.length} 个，词表挪走了？`)
  const missed = []
  for (const [word, token] of mixed) {
    const spaced = word.replace(BOUND, ' ')
    if (spaced === word) continue
    const { warns } = api.lint('拿' + spaced + '打一发。', { cols: 0, head: false }, true)
    if (!warns.some((w) => w.startsWith('「' + spaced + '」该着 ' + token))) missed.push(spaced)
  }
  assert.deepEqual(missed, [],
    `这些名字按源稿的写法出现时，编辑台不提示该着色，而 npm run build 的 G6 会报：${missed.slice(0, 5).join('、')}`)
})

test('the review console opens the next pending build after a verdict', () => {
  const { api } = adminApi()
  const order = ['a', 'b', 'c', 'd']
  assert.equal(api.nextWait(order, 'b', ['c', 'd']), 'c', '往后找第一条仍待审的')
  assert.equal(api.nextWait(order, 'b', ['a', 'd']), 'd', '已经审过的那几条要跳过')
  assert.equal(api.nextWait(order, 'd', ['a']), 'a', '到底了从头找')
  assert.equal(api.nextWait(order, 'a', []), null, '队列审空了就回列表')
  assert.equal(api.nextWait(order, 'b', ['b']), null, '刚审的那一条不算下一条')
})

test('the review diff marks only the stretch that changed', () => {
  const { api } = adminApi()
  const same = (a, b) => Array.from(api.changed(a, b))
  // 记录里真出现过的一格：九十个字里只改了四个
  assert.deepEqual(same('不需要携带多个层层不绝，通常只需要', '不需要携带多个完全充能，通常只需要'), [7, 6])
  assert.deepEqual(same('ab', 'aXb'), [1, 1], '插进去的字：旧的一侧没有要标的')
  // 重复的字不许让头尾两段重叠，否则标出来的区间是负的
  assert.deepEqual(same('aa', 'aaa'), [2, 0])
  assert.deepEqual(same('同一句', '同一句'), [3, 0], '只改了着色时文字相同，没有要标的')
})


/* docs 那条路由要把每一条 builds/ 记录的正文都带回去。**这一条只有在库里的配装
   多到超过一页时才有意义**，所以它自己造出那个规模，不依赖仓库现有的 91 套。

   踩过一次：那一发是 `limit(200)`，第 201 套起 md 取不回来，而记录本身照常出现在
   第一发里——列表上名字、时间、「已改」全对，只有正文是空的。编辑台那一侧退回投稿
   时冻住的陈稿，按一下保存就把它盖回库里。三道闸门与 npm test 当时全绿：这条路由
   一条断言都没有，因为离线适配器没有 field()，一调即抛。 */
test('every live build comes back with its body, past any single page', async () => {
  const many = 450                    // 跨过 BODY_PAGE=200 三页，且第三页不满
  const rows = []
  for (let i = 0; i < many; i++) {
    const n = String(i).padStart(4, '0')
    rows.push({ _id: `builds/s29-测试/b${n}-hunter`, md: `# 第${n}套\n`, hash: 'h', landed: 'h', at: '1' })
  }
  // 混一篇资料页进去：投影是为它存在的，它不该被带上 md。
  rows.push({ _id: 'docs/example', md: '# 资料\n正文', hash: 'h', landed: 'h', at: '1' })

  const h = harness({ docs: rows })
  h.signIn('reviewer', 2)
  const out = await h.as('reviewer', { a: 'docs' })

  const builds = out.docs.filter((d) => d._id.indexOf('builds/') === 0)
  assert.equal(builds.length, many, '配装记录本身一条都不该少')
  const empty = builds.filter((d) => !d.md)
  assert.deepEqual(empty.map((d) => d._id), [], '这些配装的正文没带回来')
  // 每一条都要是自己那份：翻页错位会让 A 拿到 B 的正文，条数照样对得上。
  const wrong = builds.filter((d) => d.md !== `# 第${d._id.slice(-11, -7)}套\n`)
  assert.deepEqual(wrong.map((d) => d._id), [], '翻页把正文串行了')

  const doc = out.docs.find((d) => d._id === 'docs/example')
  assert.equal(Object.hasOwn(doc, 'md'), false, '资料页不该带 md，投影就是为它存在的')
})


/* 库里那份正文没拉回来时，**不许拿投稿那份顶上**。上一条保证后端会取全，这一条
   保证前端在后端真出岔时不会把陈稿灌进填表页——两层各守一边，中间那条缝是本次
   事故的形状。 */
test('a live build whose body did not come back never falls back to the submission', () => {
  const { api } = adminApi()
  // 库里这一条存在、hash 与 landed 都在，只是 md 这个键没跟回来（投影或截断）。
  const rows = api.builds(
    [{ _id: 'builds/s29-x/a-hunter', hash: 'h', landed: 'h', at: '2' }],
    [{ _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 投稿时那份陈稿\n', at: '1' }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].state, 'live')
  assert.equal(rows[0].md, '', '拿不到库里那份就交空的，不退回 s.md')
})


// 审核台那句「缺 …」与生成器的必填项是两份实现，跨不过去的那条缝由这一条钉住：
// 构建过得去的源稿，审核台一条都不该报。
//
// 踩过一次：合集的 PER 无条件要求每一套写「标签：」，而 tags_of() 的规矩是
// 「宗师/终极、日常、功能性这三个场景整行必须不写，其余场景可写可不写」。7 份
// 合集里 5 份因此挂着假的「缺 …」，其中两份还报「两套填齐的配装（现在 0 套）」
// ——那一行长到把配装名挤成一个省略号，而填表页那一侧 lacking() 非空即 return，
// 这几份合集一个字都改不回去。三道闸门与 npm test 当时全绿。
function buildSources() {
  const dir = path.join(root, 'references/builds')
  const out = []
  for (const season of fs.readdirSync(dir)) {
    const sd = path.join(dir, season)
    if (!fs.statSync(sd).isDirectory()) continue
    for (const file of fs.readdirSync(sd).filter((x) => x.endsWith('.md'))) {
      out.push([file, fs.readFileSync(path.join(sd, file), 'utf8')])
    }
  }
  // 光「一条都没报」不够：读不到源稿时零命中也是全绿。
  assert.ok(out.length > 50, `references/builds 下只读到 ${out.length} 篇源稿，路径变了？`)
  return out
}

test('a source the build accepts is never reported as incomplete by the console', () => {
  const { api } = adminApi()
  const bad = []
  for (const [file, md] of buildSources()) {
    const miss = api.missing(md)
    if (miss.length) bad.push(`${file} → 缺 ${miss.join('、')}`)
  }
  assert.deepEqual(bad, [], `审核台对这些构建得过的源稿报了缺失：\n  ${bad.join('\n  ')}`)
})


/* 上一条钉的是审核台那张表，**这一条钉硬拦的那一半**。填表页的 lacking() 非空即
   `return`，投稿的人一个字都发不出去；审核台那一侧只是多显示一行假的「缺 …」。
   上次事故落在这里，而测试当时只覆盖了不流血的那一半。

   两张表是同一条规则的两种编码（这里按正则，那里按键名），已经漂过：admin.js 的
   强度认「强度」与「类别」两个键，form.js 只认「强度」。 */
test('a source the build accepts can always be submitted from the form page', () => {
  const form = require(path.join(root, 'builds/new/form.js'))
  const bad = []
  for (const [file, md] of buildSources()) {
    // 合集走 set 那一页（每一套还要过 PER），单套走另一页。判据与 convert-build.py
    // 的 split_set() 同源：第二个 `# ` 起就是合集。
    const sets = /\n# /.test(md)
    const lack = form.lacking(md, sets)
    if (lack.length) bad.push(`${file}（${sets ? '合集' : '单套'}）→ ${lack.join('、')}`)
  }
  assert.deepEqual(bad, [], `填表页会拦下这些构建得过的源稿：\n  ${bad.join('\n  ')}`)
})


// 两张表答的是同一个问题，答案必须一致：一边说缺、一边说齐，就是又一次事故的形状。
test('the console and the form page agree on which sources are complete', () => {
  const { api } = adminApi()
  const form = require(path.join(root, 'builds/new/form.js'))
  const split = []
  for (const [file, md] of buildSources()) {
    const console_ = api.missing(md).length > 0
    const page = form.lacking(md, /\n# /.test(md)).length > 0
    if (console_ !== page) split.push(`${file}：审核台${console_ ? '报缺' : '说齐'}，填表页${page ? '报缺' : '说齐'}`)
  }
  assert.deepEqual(split, [], `两张必填项表对不上：\n  ${split.join('\n  ')}`)
})


// 填表页当场去掉会被读成源稿结构的符号：行首的 # 与不成对的花括号。合法的着色标记
// 要留着，审核台与编辑遮罩载进来的源稿带着它们。
test('the form strips line-leading hashes and stray braces but keeps color markers', () => {
  const { tidy } = require(path.join(root, 'builds/new/form.js'))
  const t = (s) => tidy(s).text
  assert.equal(t('#1 刚需圣贤2\n## 注解\n  #② 神器'), '1 刚需圣贤2\n注解\n② 神器')
  assert.equal(t('见 #3 那条'), '见 #3 那条', '行中的 # 不动')
  assert.equal(t('能{持续产绿弹}的'), '能持续产绿弹的')
  assert.equal(t('a}b{'), 'ab')
  assert.equal(t('吃{el-arc|增幅 同款'), '吃增幅 同款', '没闭合的开头连 token| 一起去掉')
  for (const ok of ['{el-arc|增幅}同款{bar-yellow|首领}', '{a|x{b|y}z}', '名字 | https://x.y/#z']) {
    assert.equal(t(ok), ok)
  }
  assert.deepEqual(tidy('#ab', 3), { text: 'ab', at: 2 }, '光标按它之前去掉的字往前挪')
  assert.deepEqual(tidy('x{y}z', 2), { text: 'xyz', at: 1 })

  // 构建得过的注解与描述，填表页一个字都不改。
  const bad = []
  for (const [file, md] of buildSources()) {
    const parts = (md.match(/^描述：.*$/gm) || [])
      .concat(md.split('\n## 注解').slice(1).map((p) => p.split(/\n#/)[0]))
    if (parts.some((p) => t(p) !== p)) bad.push(file)
  }
  assert.deepEqual(bad, [], `填表页会改动这些源稿的注解或描述：\n  ${bad.join('\n  ')}`)
})


// 编辑时散文格里只放文字，颜色画在镜像层；写回时按区间拼回标记。
test('prose markers split into text and spans, shift with edits and weave back verbatim', () => {
  const { unmark, remark, shiftSpans } = require(path.join(root, 'builds/new/form.js'))
  for (const src of ['先转{el-prismatic|超凡}（头', '{a|x{b|y}z}', '{a|{b|x}}', '{a|x{b|y}}', '无色']) {
    const u = unmark(src)
    assert.ok(u.ok, src)
    assert.equal(remark(u.text, u.spans), src, src)
  }
  assert.equal(unmark('先转{el-prismatic|超凡}（头').text, '先转超凡（头')
  for (const bad of ['能{持续产绿弹}的', '吃{el-arc|增幅 同款', 'a}b']) {
    assert.deepEqual(Object.assign({}, unmark(bad)), { text: bad, spans: [], ok: false }, bad)
  }

  const s = unmark('甲{el-arc|增幅}乙')
  const edit = (after) => remark(after, shiftSpans(s.spans, s.text, after))
  assert.equal(edit('前甲增幅乙'), '前甲{el-arc|增幅}乙', '改动在前：整体平移')
  assert.equal(edit('甲增幅乙后'), '甲{el-arc|增幅}乙后', '改动在后：不动')
  assert.equal(edit('甲增幅者乙'), '甲{el-arc|增幅}者乙', '紧贴词尾打字：词还是原来的颜色')
  assert.equal(edit('甲增X幅乙'), '甲增X幅乙', '改到词里：去掉颜色，交给构建重判')
  assert.equal(edit('甲乙'), '甲乙')

  // 构建得过的每一篇源稿：散文拆开再拼回，一个字都不变。
  const bad = []
  for (const [file, md] of buildSources()) {
    const parts = (md.match(/^描述：.*$/gm) || []).map((l) => l.slice(3))
    for (const head of ['## 注解', '## 合集介绍', '## 审核意见']) {
      for (const p of md.split('\n' + head).slice(1)) parts.push(p.split(/\n#/)[0])
    }
    if (parts.some((p) => { const u = unmark(p); return !u.ok || remark(u.text, u.spans) !== p })) {
      bad.push(file)
    }
  }
  assert.deepEqual(bad, [], `这些源稿的散文拆开再拼回对不上：\n  ${bad.join('\n  ')}`)
})


// builds() 把 docs 与 subs 两张表并成审核台那张清单。两条规矩都出过错，且都是
// 「看着有一行、内容却不对」那一类，页面上隔着一层 iframe 用肉眼查不出来。
test('a build that is live reads its body from the library, not the frozen submission', () => {
  const { api } = adminApi()
  // subs.md 是投稿当时冻住的那一份；bsave 改的是 docs.md，从不回写投稿记录。
  // 只认 subs.md 的话，线上改完再看还是改之前那一套，而下一次保存会拿这份陈稿
  // 原样盖回去——一次编辑就这么没了。
  const rows = api.builds(
    [{ _id: 'builds/s29-x/a-hunter', md: '# 新名字\n', hash: 'h2', landed: 'h1', at: '2', by: '我' }],
    [{ _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 投稿时的旧名字\n', at: '1' }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].md, '# 新名字\n')
  assert.equal(rows[0].state, 'live')
  assert.ok(rows[0].dirty, 'hash 与 landed 不等就该标成改过')
})

test('a pending or approved removal leaves one row, a rejected one gives the build back', () => {
  const { api } = adminApi()
  const docs = [{ _id: 'builds/s29-x/a-hunter', md: '# 甲\n', hash: 'h', landed: 'h', at: '1' }]
  const one = { _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '1' }

  // 批准之后决定已经做完，「完成」里再并排摆一行没有标记的，读起来就是「它好好
  // 地在站上」——而它正等着本机 sync 把源稿删掉。
  const done = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  // **Array.from，不是 .map。**行是 vm 沙箱里造的，它的原型是那个 realm 的
  // Array.prototype，deepStrictEqual 连原型一起比，内容一样也过不去。
  assert.deepEqual(Array.from(done, (b) => b.state), ['dropping'])

  // 申请了移除，那一套就不该还躺在「完成」里；申请期间有人重投的新稿照旧进待审。
  const asking = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: 0, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' },
      { _id: 's3', ok: 0, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '3' }])
  assert.deepEqual(Array.from(asking, (b) => b.sub._id).sort(), ['s2', 's3'])
  assert.deepEqual(Array.from(asking, (b) => b.state), ['wait', 'wait'])

  const kept = api.builds(docs,
    [one, { _id: 's2', drop: 1, ok: -1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  assert.deepEqual(Array.from(kept, (b) => b.state).sort(), ['live', 'no'])
})

// 更新那一路通过时沿用旧的 season/slug，首投与更新是两条 ok=1 的投稿指着同一篇。
test('a build updated after going live lists once, under its latest approval', () => {
  const { api } = adminApi()
  const docs = [{ _id: 'builds/s29-x/a-hunter', md: '# 甲\n', hash: 'h', landed: 'h', at: '5' }]
  const rows = api.builds(docs, [
    { _id: 's1', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '1', okBy: '首审' },
    { _id: 's2', ok: 1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '3', okBy: '再审' },
    { _id: 's3', ok: -1, season: 's29-x', slug: 'a-hunter', md: '# 甲\n', at: '2' }])
  const live = Array.from(rows).filter((b) => b.state === 'live')
  assert.deepEqual(live.map((b) => b.sub._id), ['s2'])
  assert.equal(live[0].at, '5', '时间仍取两边较新的那个')
  assert.deepEqual(Array.from(rows, (b) => b.state).sort(), ['live', 'no'])
})

// 编辑台只在登录真的失效时清令牌。refresh() 报 forbidden 就是那个判据：报多了，一次断网
// 或两个标签页同时刷新都会把人踢回登录框；报少了，失效的令牌留着，每一下都白点。
test('only a refresh the auth service rejects counts as a lost login', async () => {
  /** @type {Record<string, string>} */
  const store = {}
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] }
  }
  let reply = null
  let sent = 0
  const fetch = () => { sent += 1; return reply() }
  const answer = (status, body) => () =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  const { api } = adminApi({ fetch, localStorage })

  store.sa_rt = 'rt1'
  reply = answer(200, { access_token: 'at2', refresh_token: 'rt2' })
  await Promise.all([api.refresh(), api.refresh(), api.refresh()])
  assert.equal(sent, 1, '同一页并发的三发只该换一次')
  assert.equal(store.sa_at, 'at2')
  assert.equal(store.sa_rt, 'rt2')

  reply = answer(400, { error: 'invalid_grant' })
  await assert.rejects(api.refresh(), (e) => e.message === 'forbidden')

  reply = () => Promise.reject(new TypeError('Failed to fetch'))
  await assert.rejects(api.refresh(), (e) => e.message === 'Failed to fetch', '断网不算登录失效')

  // 另一个标签页先换掉了 sa_rt：这一发被拒，但令牌已经是新的。
  reply = () => { store.sa_rt = 'rt3'; store.sa_at = 'at3'; return answer(400, { error: 'invalid_grant' })() }
  await api.refresh()
  assert.equal(store.sa_at, 'at3')

  delete store.sa_rt
  await assert.rejects(api.refresh(), (e) => e.message === 'forbidden', '没有 refresh_token 就是没登录')
})

test('console timestamps read in Beijing time', () => {
  const { api } = adminApi()
  assert.equal(api.when('2026-09-10T07:59:28.522Z'), '2026-09-10 15:59')
  assert.equal(api.when('2026-09-10T16:30:00.000Z'), '2026-09-11 00:30', '过北京零点要进到次日')
  assert.equal(api.when(''), '')
})


// ── 索引页工具条 ─────────────────────────────────────────────────────────
// assets/app.js 的工具条全在运行时建，三道闸门与上面那些测试一个都看不见它：
// 配装索引页改成「一张网格、不分节」之后，app.js 那句 `if (!slot ||
// !sections.length) return` 让整条工具条一件都不建——搜索框、计数、四维筛选
// 全没了，而 npm run build 与 npm test 照旧全绿。这一段就是为那种情形存在的。
//
// **不引 jsdom。**下面这个壳只实现 app.js 真的碰到的那几个接口，四十来行。
function domStub () {
  function El (tag, cls) {
    this.tagName = (tag || 'div').toUpperCase()
    this.className = cls || ''; this.children = []; this.parentNode = null
    this.dataset = {}; this.attrs = {}; this._text = ''; this.hidden = false
    this.value = ''          // 搜索框：filter() 每次都读它
    this.style = { setProperty () {} }
  }
  El.prototype.appendChild = function (c) { this.insertBefore(c, null); return c }
  El.prototype.insertBefore = function (c, ref) {
    // 真 DOM 在参照节点不是自己的孩子时抛 NotFoundError。**壳必须照抛**：
    // 静默 append 会让「搬走再搬回来」那条路在测试里一路绿，而线上第一次点就崩。
    if (ref && ref.parentNode !== this) {
      throw new Error('NotFoundError: 参照节点不在这个列表里')
    }
    if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1)
    c.parentNode = this
    const at = ref ? this.children.indexOf(ref) : -1
    if (at < 0) this.children.push(c); else this.children.splice(at, 0, c)
    return c
  }
  Object.defineProperty(El.prototype, 'nextElementSibling', {
    get () {
      if (!this.parentNode) return null
      return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null
    }
  })
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v) }
  El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null }
  El.prototype.hasAttribute = function (k) { return k in this.attrs }
  El.prototype.toggleAttribute = function (k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k] }
  El.prototype.addEventListener = function () {}
  El.prototype.closest = function () { return null }
  El.prototype.contains = function (n) { return n === this || this.all().includes(n) }
  El.prototype.all = function (out) {
    out = out || []
    this.children.forEach((c) => { out.push(c); c.all(out) })
    return out
  }
  El.prototype.matches = function (sel) {
    // `li:not([hidden])`：filter() 判分节空不空用的就是它。壳认不得的话整条
    // 落到 tagName 比较上、恒为 false，于是每一节都被判成空——分节可见性的断言
    // 就全是空过，怎么改都绿。
    const not = /^(.*?):not\(\[hidden\]\)$/.exec(sel)
    if (not) return this.matches(not[1]) && !this.hidden
    if (sel[0] === '.') return (' ' + this.className + ' ').includes(' ' + sel.slice(1) + ' ')
    // [data-x="v"] → dataset.x：app.js 按维度名找页面给的那个容器。
    const attr = /^\[data-([\w-]+)="(.*)"\]$/.exec(sel)
    if (attr) {
      const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      return this.dataset[key] === attr[2]
    }
    return this.tagName === sel.toUpperCase()
  }
  El.prototype.querySelectorAll = function (sel) {
    const want = sel.split(',')[0].trim().split(/[ >]+/).pop()
    return this.all().filter((e) => e.matches(want))
  }
  El.prototype.querySelector = function (s) { return this.querySelectorAll(s)[0] || null }
  Object.defineProperty(El.prototype, 'textContent', {
    get () { return this._text + this.children.map((c) => c.textContent).join('') },
    set (v) { this._text = v; this.children = [] }
  })
  return El
}

// 卡片按真实产出的形状给：多值 data-* 用制表符隔开，标签可以整个不写。
const CARDS = [
  // **两张相邻的组合卡**：只有一张时它的 nextElementSibling 恒为 null，
  // 「搬走再搬回来」那条路怎么写都不会撞上锚点问题。产出里 raid/猎人 那一列
  // 13 张里相邻的组合卡一大片，测试要照着那个形状给。
  { scene: 'raid\t地牢', cls: '猎人', tier: 'meta', branch: '烈日', tag: '输出\t推图' },
  { scene: 'raid\t地牢', cls: '猎人', tier: '强力', branch: '棱镜', tag: '推图' },
  { scene: 'raid', cls: '猎人', tier: '创意', branch: '虚空', tag: '机制' },
  { scene: 'raid', cls: '泰坦', tier: '强力', branch: '棱镜', tag: '机制' },
  { scene: '地牢', cls: '猎人', tier: '创意', branch: '烈日', tag: '推图' },
  { scene: '宗师/终极', cls: '术士', tier: '强力', branch: '虚空' },
  { scene: 'PVP', cls: '泰坦', tier: '强力', branch: '棱镜', tag: '6V6' },
  { scene: 'PVP', cls: '术士', tier: '创意', branch: '虚空', tag: '3V3' }
]

function toolbar () {
  const El = domStub()
  const body = new El('body')
  const slot = body.appendChild(new El('div', 'site-head')).appendChild(new El('div', 'toolbar'))
  slot.dataset = { section: '.block', item: '.entries > li', label: '', noun: '配装',
    facets: '场景=scene:single:groups;强度=tier:single;职业=cls:tuck;分支=branch:tuck;标签=tag:tuck' }
  // 场景与强度是两条主轴，各填进页面给的一个空容器，不进工具条。
  const bar = body.appendChild(new El('nav', 'facet-bar'))
  bar.dataset = { facet: '场景' }
  const tierBar = body.appendChild(new El('nav', 'facet-bar'))
  tierBar.dataset = { facet: '强度' }
  // 一节一个场景；多场景的配装落在它第一个场景那一节——与产出同形。
  const main = body.appendChild(new El('main'))
  const lis = []
  for (const [scene, group] of Object.entries(
    CARDS.reduce((by, c) => {
      const first = c.scene.split('\t')[0]
      ;(by[first] = by[first] || []).push(c)
      return by
    }, {}))) {
    const sec = main.appendChild(new El('section', 'block'))
    sec.id = 'sec-' + scene
    sec.dataset = { scene }
    sec.appendChild(new El('h2', 'sect-label')).textContent = scene
    // 小节按「这个场景下所有配装」的职业集合出——搬过来的卡要有落点，空的那张
    // 网格照样在 DOM 里。与生成器同形。
    const mine = new Set(group.map((c) => c.cls))
    const kin = CARDS.filter((c) => c.scene.split('\t').includes(scene))
    for (const cls of ['猎人', '泰坦', '术士']) {
      if (!kin.some((c) => c.cls === cls)) continue
      sec.appendChild(new El('h3', 'sub-label')).textContent = cls
      const ul = sec.appendChild(new El('ul', 'entries'))
      ul.dataset = { cls }
      if (!mine.has(cls)) continue
      for (const card of group.filter((c) => c.cls === cls)) {
        const li = ul.appendChild(new El('li', 'b-solar'))
        li.dataset = Object.assign({}, card)
        lis.push(li)
      }
    }
  }
  const sandbox = {
    document: {
      currentScript: null,
      documentElement: new El('html'),
      body,
      querySelector: (s) => body.querySelector(s),
      querySelectorAll: (s) => body.querySelectorAll(s),
      createElement: (t) => new El(t),
      createTextNode: (t) => Object.assign(new El('#text'), { _text: t }),
      addEventListener () {}
    },
    location: { href: 'http://x/builds/index.html', search: '' },
    history: { replaceState () {} },
    matchMedia: () => ({ matches: false }),
    addEventListener () {},
    requestAnimationFrame: (f) => f(),
    IntersectionObserver: function () { this.observe = this.disconnect = () => {} },
    getComputedStyle: () => ({ getPropertyValue: () => '0' }),
    URL,
    URLSearchParams,
    console
  }
  sandbox.window = sandbox
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8'), sandbox)
  // 场景与强度在页面那两个容器里，其余三维是工具条上那块共用面板里的三行。
  const bars = { 场景: bar, 强度: tierBar }
  const panel = () => slot.children.find((c) => c.className === 'drop')
  const host = (dim) => {
    if (bars[dim]) return bars[dim]
    const box = panel()
    if (!box) return undefined
    return box.querySelectorAll('.tuck-row').find((r) => {
      const lab = r.querySelector('.facet-label')
      return lab && lab._text === dim
    })
  }
  const secOf = (scene) => main.children.find((c) => c.dataset.scene === scene)
  return {
    slot,
    bar,
    // 某个场景那一节此刻装着几张可见的卡。
    inSection: (scene) => {
      const sec = secOf(scene)
      return sec ? sec.querySelectorAll('li').filter((li) => !li.hidden).length : 0
    },
    tiersIn: (scene) => {
      const sec = secOf(scene)
      return sec ? sec.querySelectorAll('li').map((li) => li.dataset.tier) : []
    },
    sectionShown: (scene) => {
      const sec = secOf(scene)
      return !!sec && !sec.hidden
    },
    // 面板里此刻立着的那几行，按顺序给。
    tucked: () => {
      const box = panel()
      if (!box || box.hidden) return []
      return box.querySelectorAll('.tuck-row').filter((r) => !r.hidden)
        .map((r) => r.querySelector('.facet-label')._text)
    },
    // 触发器上那个数：三维已选之和。
    tally: () => {
      const box = panel()
      return box ? box.querySelector('summary').querySelector('b')._text : null
    },
    live: () => lis.filter((li) => !li.hidden).length,
    // 五维同一个画法，所以点法也只有一种：正文那两排与面板里那三行都是素字开关。
    click (dim, value) {
      const box = host(dim)
      assert.ok(box && !box.hidden, `维度「${dim}」的控件不在`)
      const btn = box.querySelectorAll('button').find((b) => b.textContent === value)
      assert.ok(btn, `维度「${dim}」上没有「${value}」`)
      btn.onclick()
    },
    values (dim) {
      const box = host(dim)
      if (!box || box.hidden) return []
      return box.querySelectorAll('button').map((b) => b.textContent)
    }
  }
}

test('the two main axes render into page containers and the rest into one shared panel', () => {
  const t = toolbar()
  assert.ok(t.slot.querySelector('.tool-search'), '搜索框没建出来')
  // 场景填进页面给的容器，「全部」排在最前。
  assert.deepEqual(t.values('场景'), ['全部', 'raid', '地牢', '宗师/终极', 'PVP'])
  assert.equal(t.bar.querySelector('.facet-label')._text, '场景')
  assert.deepEqual(t.values('强度'), ['全部', 'meta', '强力', '创意'],
    '强度没填进页面那条主轴')
  // 低频那三维收进工具条上同一块面板，一维一行，三行都常驻。
  assert.deepEqual(t.tucked(), ['职业', '分支', '标签'],
    '面板里那三行不对：三维应当各占一行且都在')
  assert.equal(t.slot.querySelectorAll('.drop').length, 1,
    '面板不止一块：三维合用一枚触发器，一维一枚就退回了老样子')
  // 大节就是场景，跳转 chip 那一排因此不出：同一批字不给第二个来源。
  assert.equal(t.slot.querySelector('.tool-chips'), null, '不该有跳转 chip 那一排')
})

test('every tucked dimension is there from the start and keeps its values', () => {
  const t = toolbar()
  const all = ['3V3', '6V6', '推图', '机制', '输出'].sort()
  // 标签一进来就在。以前它随场景现算取值，没选场景时整个控件不出、选了突袭才
  // 冒出来——控件凭空出现又凭空消失，读者学不会。
  assert.deepEqual(t.values('标签').sort(), all,
    '没选场景时标签那一行就该在，取值是全站并集')
  t.click('场景', 'PVP')
  assert.deepEqual(t.values('标签').sort(), all,
    '选了场景之后标签的取值变了：控件不该在读者没碰它的时候自己少几枚')
  t.click('场景', 'PVP')
  assert.deepEqual(t.values('职业').sort(), ['猎人', '泰坦', '术士'].sort(),
    '职业那一行的取值也不该随别的维收窄')
})

test('the shared trigger counts picks across all three tucked dimensions', () => {
  const t = toolbar()
  assert.equal(t.tally(), '', '一个都没选时触发器上不该有数字')
  t.click('职业', '猎人')
  assert.equal(t.tally(), '1')
  t.click('标签', '输出')
  // 面板收起来之后就看不见还筛着什么了，那个数是唯一的提示，必须是三维之和。
  assert.equal(t.tally(), '2', '触发器上的数不是三维之和')
  t.click('职业', '猎人')
  assert.equal(t.tally(), '1', '取消之后没减回去')
})

test('picks union inside a dimension and intersect across dimensions', () => {
  const t = toolbar()
  t.click('职业', '猎人')
  assert.equal(t.live(), 4, '同一维度内应当取并集')
  t.click('职业', '泰坦')
  assert.equal(t.live(), 6)
  t.click('强度', '创意')
  assert.equal(t.live(), 2, '维度之间应当取交集')
})

test('a single-select dimension replaces its pick instead of adding to it', () => {
  const t = toolbar()
  t.click('场景', 'raid')
  assert.equal(t.live(), 4)
  t.click('场景', '地牢')
  assert.equal(t.live(), 3, '场景是 :single，点第二枚应当换掉第一枚而不是取并集')
  t.click('场景', '地牢')
  assert.equal(t.live(), CARDS.length, '再点一次同一枚应当清空这一维')
})

test('the main axis carries an 全部 reset that clears the dimension', () => {
  const t = toolbar()
  t.click('场景', 'PVP')
  assert.equal(t.live(), 2)
  t.click('场景', '全部')
  assert.equal(t.live(), CARDS.length, '「全部」没把场景清干净')
})

test('an overlapping build sits in its first scene and moves to whichever is picked', () => {
  const t = toolbar()
  // 默认：两张 raid·地牢 归 raid，没有第三节。
  assert.equal(t.inSection('raid'), 4, '默认 raid 就该是 纯 raid + raid·地牢')
  assert.equal(t.inSection('地牢'), 1)
  assert.equal(t.sectionShown('raid'), true, '默认视图里 raid 那一节应当立着')

  // 点 raid：本来就在这儿，不动。
  t.click('场景', 'raid')
  assert.equal(t.inSection('raid'), 4)

  // 点地牢：那两张搬到地牢去，raid 只剩纯 raid 的两张、都不命中，整节收起。
  t.click('场景', '地牢')
  assert.equal(t.inSection('地牢'), 3, '地牢 = 纯地牢 + raid·地牢，没搬过来')
  assert.equal(t.inSection('raid'), 0)
  assert.equal(t.sectionShown('raid'), false, '搬空之后 raid 那一节还立着')

  // 回到全部：搬回第一个场景那一节。**两张组合卡相邻**，所以这一步会踩到
  // 「拿原来的下一个兄弟当锚点」那个坑——真 DOM 会抛 NotFoundError。
  t.click('场景', '全部')
  assert.equal(t.inSection('raid'), 4)
  assert.equal(t.inSection('地牢'), 1)
  assert.equal(t.live(), CARDS.length, '搬来搬去之后总数变了，说明卡被复制或丢了')

  // 顺序也要还原：生成器排好的「强度在前、同档按时间降序」不能被搬乱。
  const raidTiers = t.tiersIn('raid')
  assert.deepEqual(raidTiers, ['meta', '强力', '创意', '强力'].slice(0, raidTiers.length),
    '搬回来之后节内顺序乱了')
})

// 页脚访客数那段脚本从手写首页里现取：check_shell.py 钉着它与 shell.HIT 逐字一致，
// 测的因此就是每一页上线的那一份。时钟、localStorage 与 fetch 换成桩。
function footerCounter() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const code = html.match(/<script>(\(function\(\)\{var d=new Date[\s\S]*?)<\/script>/)
  assert.ok(code, 'index.html 里找不到访客计数那段脚本')
  const store = new Map()
  const sent = []
  let clock = 0
  let reply = null
  class Clock extends Date {
    constructor(...a) { super(...(a.length ? a : [clock])) }
    static now() { return clock }
  }
  return {
    store, sent,
    at(iso) { clock = Date.parse(iso) },
    later(ms) { clock += ms },
    answer(today, total) { reply = { today, total } },
    async open(home) {
      const sv = { textContent: '' }
      const body = reply
      vm.runInNewContext(code[1], {
        Date: Clock,
        document: { getElementById: (id) => (id === 'sv' && home ? sv : null) },
        localStorage: {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
        },
        fetch(url, init) {
          sent.push(init ? JSON.parse(init.body) : url.slice(url.indexOf('?')))
          return Promise.resolve({ json: () => body })
        },
      })
      await new Promise(setImmediate)
      return sv.textContent
    },
  }
}

test('the footer count is fresh when the day began on a page without it', async () => {
  // 当天先开别的页、再进首页：svd 已是今天，svt 却是首页上次写的那一句。
  // 借 svd 判当天，首页就照搬几天前的数，连着几天不动。
  const f = footerCounter()
  f.at('2026-09-06T04:00:00Z')
  f.answer(712, 11217)
  assert.equal(await f.open(true), '今日 712 位访客 · 累计 11217')
  f.at('2026-09-10T04:00:00Z')
  f.answer(1288, 17092)
  assert.equal(await f.open(false), '')
  assert.deepEqual(f.sent.at(-1), { a: 'hit', s: 0 }, '当天第一页要计数，且没有 sv 的页不要数')
  assert.equal(await f.open(true), '今日 1288 位访客 · 累计 17092', '首页照搬了几天前那一句')
  assert.equal(f.sent.at(-1), '?a=stats', '当天已计过数，首页只该读')
  assert.equal(f.sent.length, 3)
})

test('the footer count is reused for ten minutes, then read again', async () => {
  const f = footerCounter()
  f.at('2026-09-10T04:00:00Z')
  f.answer(10, 100)
  assert.equal(await f.open(true), '今日 10 位访客 · 累计 100')
  assert.deepEqual(f.sent, [{ a: 'hit', s: 1 }])
  f.answer(20, 110)
  f.later(9 * 60e3)
  assert.equal(await f.open(true), '今日 10 位访客 · 累计 100', '十分钟内不该再打后端')
  assert.equal(f.sent.length, 1)
  f.later(2 * 60e3)
  assert.equal(await f.open(true), '今日 20 位访客 · 累计 110')
  assert.deepEqual(f.sent.slice(1), ['?a=stats'], '过了十分钟只该读，不该再计一次数')
})

test('a footer count cached as bare text is read again, not shown', async () => {
  // 线上浏览器里存的 svt 可能只有文本、没有时刻：不认它，读一次新的。
  const f = footerCounter()
  f.at('2026-09-10T04:00:00Z')
  f.store.set('svd', '2026-09-10')
  f.store.set('svt', '今日 712 位访客 · 累计 11217')
  f.answer(1288, 17092)
  assert.equal(await f.open(true), '今日 1288 位访客 · 累计 17092')
  assert.deepEqual(f.sent, ['?a=stats'])
})

test('the visitor count is read from the database once a minute per instance', async () => {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const h = harness({ counters: [{ _id: 'stat', pv: 17092, d: { [day]: 1288 } }] })
  assert.deepEqual(await h.request({ a: 'stats' }, false), { status: 200, today: 1288, total: 17092 })
  assert.deepEqual(await h.request({ a: 'stats' }, false), { status: 200, today: 1288, total: 17092 })
  assert.equal(h.calls.filter((c) => c.op === 'get' && c.name === 'counters').length, 1,
    '一分钟内第二次读计数又打了数据库')
})

async function main() {
  let failures = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok - ' + name) }
    catch (error) { failures++; console.error('FAIL - ' + name); console.error(error.stack || error) }
  }
  console.log(`${tests.length - failures}/${tests.length} quality regressions passed (offline adapter; cloud integration not exercised)`)
  if (failures) process.exitCode = 1
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
