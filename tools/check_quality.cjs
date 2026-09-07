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
        assert.deepEqual(Object.keys(value), ['$ne'], 'unknown query operator')
        return row[key] !== value.$ne
      }
      return row[key] === value
    })
  }
  function collection(name, state = store, tx = null, query = {}, limit = Infinity) {
    assert.ok(store[name], 'unknown collection ' + name)
    return {
      where(q) {
        assert.equal(tx, null, 'transaction queries must use doc, not where')
        return collection(name, state, tx, copy(q), limit)
      },
      limit(n) { return collection(name, state, tx, query, n) },
      async get() {
        assert.equal(tx, null)
        calls.push({ op: 'query', name, query, limit })
        const data = [...state[name].values()].filter((r) => matches(r, query)).slice(0, limit).map(copy)
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
          }
        }
      }
    }
  }
  const db = {
    command: { neq: (v) => ({ $ne: v }) },
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
      assert.equal(name, '@cloudbase/node-sdk', 'unexpected module')
      return { init: () => ({ database: () => db }) }
    }
  }
  vm.runInNewContext(source + '\nexports.quality = { fingerprint };', sandbox, { filename: 'functions/api/index.js' })
  return {
    store, calls,
    fingerprint: sandbox.exports.quality.fingerprint,
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

test('the two cellSpans copies are still character-for-character the same', () => {
  // 云函数写 const/let、edit.js 写 var，缩进差两格，声明里的空格与整行注释也各写
  // 各的；除此之外必须逐字相同。
  const norm = (file) => funcSource(file, 'cellSpans')
    .replace(/\b(?:const|let|var)\b/g, 'X')
    .replace(/function (\w+) \(/, 'function $1(')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n')
  assert.equal(norm('functions/api/index.js'), norm('admin/edit.js'),
    '云函数与 edit.js 的 cellSpans 分家了——两份都在给同一条改动定位，分家即静默改错格')
})

test('all three javascript splitters agree on every real table row', () => {
  const api = splitter('functions/api/index.js', 'cellSpans')
  const ui = splitter('admin/edit.js', 'cellSpans')
  const count = splitter('admin/admin.js', 'cells')
  const rows = tableRows()
  assert.ok(rows.length > 4000, `只扫到 ${rows.length} 行表格行，语料挪走了？`)
  // 三份各跑在自己的 vm realm 里，数组原型互不相同，assert/strict 的 deepEqual 会
  // 连原型一起比。要比的是切出来的区间，所以按值比。
  const spans = (v) => JSON.stringify(v)
  for (const [where, n, line] of rows) {
    const a = api(line)
    assert.equal(spans(a), spans(ui(line)), `${where}:${n} 云函数与 edit.js 切得不一样`)
    assert.notEqual(a, null, `${where}:${n} cellSpans 整行不认——那一格永远改不了`)
    assert.equal(a.length, count(line),
      `${where}:${n} cellSpans 切出 ${a.length} 格，前端闸门数出 ${count(line)} 格`)
  }
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
