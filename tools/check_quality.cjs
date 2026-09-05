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
