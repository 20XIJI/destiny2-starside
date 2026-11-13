'use strict'
const {
  assert, fs, path, vm, crypto, zlib, root, site, copy, digest,
  test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows,
} = require('./harness.cjs')

test('likes: lost acknowledgements, replay, and legacy unlikes preserve counts', async () => {
  const id = 's29_example'
  const actor = 'a'.repeat(32)
  const h = harness({ likes: [{ _id: id, n: 10 }] })
  const like = { a: 'like', id, actor, seq: 1, before: false, on: true }
  assert.equal((await h.request(like, false)).ok, 1)
  assert.equal((await h.request(like, false)).ok, 1)
  assert.equal(h.store.likes.get(id).n, 11)
  const unlike = { ...like, seq: 2, before: true, on: false }
  assert.equal((await h.request(unlike, false)).ok, 1)
  assert.equal((await h.request(unlike, false)).ok, 1)
  assert.equal((await h.request(like, false)).status, 400)
  assert.equal(h.store.likes.get(id).n, 10)
  assert.equal((await h.request({ ...unlike, actor: 'b'.repeat(32), seq: 1 }, false)).ok, 1)
  assert.equal(h.store.likes.get(id).n, 9)
})

function likeIndexedDB() {
  const db = {
    createObjectStore() {}, close() {},
    transaction() {
      const tx = {
        objectStore() {
          return { get() {
            const req = {}
            queueMicrotask(() => { req.onsuccess(); queueMicrotask(() => tx.oncomplete()) })
            return req
          } }
        }
      }
      return tx
    }
  }
  return { open() {
    const req = { result: db }
    queueMicrotask(() => req.onsuccess())
    return req
  } }
}

test('likes: refresh retries an unacknowledged write without counting twice', async () => {
  const html = fs.readFileSync(path.join(site, 'builds/s29/zqqoqjsb-warlock/index.html'), 'utf8')
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).find((s) => s.includes('starside-likes'))
  assert.ok(script, 'generated build page must contain the like client')
  const id = 's29_example'
  const h = harness({ likes: [{ _id: id, n: 10 }] })
  const data = new Map()
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  }
  const indexedDB = likeIndexedDB()
  let lose = true
  const fetch = async (url, options) => {
    if (!options) return { ok: true, json: async () => ({ [id]: h.store.likes.get(id).n }) }
    const response = await h.request(JSON.parse(options.body), false)
    if (lose) { lose = false; throw new Error('connection lost') }
    return { ok: response.status === 200, status: response.status, json: async () => response }
  }
  function page() {
    let click
    const b = {
      tagName: 'BUTTON', dataset: { like: id }, disabled: false,
      querySelector: () => null, setAttribute(k, v) { this[k] = v },
      closest: () => b
    }
    const ctx = {
      document: { querySelectorAll: () => [b], addEventListener(k, fn) { if (k === 'click') click = fn } },
      window: { indexedDB, crypto: crypto.webcrypto, addEventListener() {} },
      indexedDB, crypto: crypto.webcrypto, localStorage: storage, fetch
    }
    vm.runInNewContext(script, ctx)
    return { b, click: () => click({ target: b }) }
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve))
  let p = page()
  await flush()
  p.click()
  await flush()
  assert.equal(h.store.likes.get(id).n, 11)
  assert.match(p.b.textContent, /结果未知/)
  p = page()
  await flush()
  assert.match(p.b.textContent, /结果未知/)
  p.click()
  await flush()
  assert.equal(h.store.likes.get(id).n, 11)
  assert.equal(p.b['aria-pressed'], 'true')
  assert.equal(p.b.textContent, 11)
})

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
  assert.equal((await live.request({ a: 'smark', id: 'sub', ok: -1 })).error, '已上站，请走申请移除')
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

test('line breaks normalize across prose docs, record cells, and editor helpers', async () => {
  const PROSE = 'i18n/zh-CN/realgame_details'
  const h = recHarness({ [TIER]: '重建\\\\{perk|嫉妒军械库}', [PROSE]: '第一段' }, [],
    { docs: [{ _id: 'docs/example', md: '# 标题\n\n旧段', hash: digest('# 标题\n\n旧段') }] })
  const r1 = await h.request({
    a: 'chg', doc: 'keys/legendary-special', rec: REC, path: TIER,
    before: '重建\\\\{perk|嫉妒军械库}', after: '重建\\\\{perk|嫉妒军械库}\n{perk|金中藏弹}'
  })
  assert.equal(r1.ok, 1)
  assert.equal(h.store.edits.get(r1.id).after, '重建\\\\{perk|嫉妒军械库}\\\\{perk|金中藏弹}')
  const r2 = await h.request({
    a: 'chg', doc: 'keys/exotic-weapon', rec: REC, path: PROSE,
    before: '第一段', after: '第一段\n\n第二段'
  })
  assert.equal(r2.ok, 1)
  assert.equal(h.store.edits.get(r2.id).after, '第一段\n\n第二段')
  const r3 = await h.request({
    a: 'chg', doc: 'docs/example', blk: 2, cell: -1,
    before: '旧段', after: '一段\n\\\\\n二段\\\\三行'
  })
  assert.equal(r3.ok, 1)
  assert.equal(h.store.edits.get(r3.id).after, '一段\n\n二段\n三行')

  const ctx = {}
  vm.createContext(ctx)
  vm.runInContext(
    "var PROSE_REC = /\\/(realgame_details(#\\d+)?|效果|说明)$/;\n"
    + ['toEdit', 'fromEdit'].map((n) => funcSource('admin/edit.js', n)).join('\n')
    + '\nthis.toEdit=toEdit;this.fromEdit=fromEdit', ctx)
  assert.equal(ctx.toEdit('甲\\\\乙', true), '甲\n乙')
  assert.equal(ctx.toEdit('一段\\\\ \\\\二段\\\\三行', true), '一段\n\n二段\n三行')
  assert.equal(ctx.fromEdit('甲\n乙\n\n丙', 'cell'), '甲\\\\乙\\\\丙')
  assert.equal(ctx.fromEdit('一段\n\n二段\\\\三行', 'recPara'), '一段\n\n二段\n三行')
  assert.equal(ctx.fromEdit('一段\n\\\\\n二段\\\\三行', 'prose'), '一段\n\n二段\n三行')
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
// ── 记录上的站内文字：主键页的就地编辑 ──
// 一格的地址是「记录 + 字段路径」，底稿在 recs 那一条的 json 里。
const REC = 'inventory-items/999767358'
const TIER = 'i18n/zh-CN/site_authors/LGpig/lgpig_tier'
const WHY = 'i18n/zh-CN/site_authors/LGpig/lgpig_tier_explanation'
function recRow(h, flat, extra = {}) {
  const json = h.canon(flat)
  return { _id: REC, json, hash: digest(json), landed: digest(json), by: '本机', ...extra }
}
function recEdit(id, path, before, after, extra = {}) {
  return { _id: id, doc: 'keys/legendary-heavy', rec: REC, path, kind: 'rec', before, after, ok: 0, by: id, ...extra }
}
function recHarness(flat, edits = [], extra = {}) {
  const h = harness()
  h.store.recs.set(REC, recRow(h, flat))
  for (const e of edits) h.store.edits.set(e._id, copy(e))
  for (const d of extra.docs || []) h.store.docs.set(d._id, copy(d))
  return h
}

test('the cloud canon of a flat record matches what sync.py writes', () => {
  const h = harness()
  // 期望值是 facts.canon() 对同一份表的输出：键按码位排序、紧凑分隔、不转义中文。
  const flat = { 'i18n/zh-CN/效果': '伤害 +10%\n第二行 "引号" \\ 反斜杠\t制表', 'enhanced/0/realgame_details': '强化' }
  assert.equal(h.canon(flat),
    '{"enhanced/0/realgame_details":"强化","i18n/zh-CN/效果":"伤害 +10%\\n第二行 \\"引号\\" \\\\ 反斜杠\\t制表"}')
})

test('a record change is queued by record and path, and refused once the text moved on', async () => {
  const h = recHarness({ [TIER]: 'T1.5' })
  const body = { a: 'chg', doc: 'keys/legendary-heavy', rec: REC, path: TIER, before: 'T1.5', after: 'T1', label: '灾变 · 评级' }
  const r = await h.request(body)
  assert.equal(r.ok, 1)
  const e = h.store.edits.get(r.id)
  assert.equal(e.kind, 'rec')
  assert.equal(e.rec, REC)
  assert.equal(e.path, TIER)
  // 同一个人同一格再提一次是改写，从另一页提也一样：同一格在几页上都有。
  const again = await h.request({ ...body, doc: 'keys/legendary-special', after: 'T0.5' })
  assert.equal(again.id, r.id)
  assert.equal(h.store.edits.size, 1)
  assert.equal(h.store.edits.get(r.id).after, 'T0.5')
  assert.equal((await h.request({ ...body, before: 'T2' })).error, 'stale')
  assert.equal((await h.request({ ...body, path: 'name' })).error, 'bad path')
  assert.equal((await h.request({ ...body, rec: 'inventory-items/../docs' })).error, 'bad rec')
  assert.equal((await h.request({ ...body, doc: 'docs/boss-hp' })).error, 'bad doc')
})

test('a bare pipe is judged by the field, not by the page it was sent from', async () => {
  // 同一格在刷取清单上是表格的一格、在购物清单上是一段正文。按提交的那一页判的话，
  // 从正文那页写进去的竖线会让表格那页多一格，npm run build 当场中止。
  const h = recHarness({ [WHY]: '旧', [TIER]: '伤害 2.8% | 5.6%' })
  const body = { a: 'chg', doc: 'keys/shopping-other', rec: REC, before: '旧', after: '甲 | 乙' }
  assert.match((await h.request({ ...body, path: WHY })).error, /竖线/)
  assert.equal((await h.request({ ...body, path: WHY, after: '{buff|甲|乙}' })).ok, 1, '标记里的竖线不是分隔符')
  // 原文本来就有裸竖线：这一格没被画进表格，照收。
  assert.equal((await h.request({ ...body, path: TIER, before: '伤害 2.8% | 5.6%', after: '伤害 3% | 6%' })).ok, 1)
  // 队列里躺着这条闸门上线之前存下的一条，通过时再判一次。
  const queued = [recEdit('old', WHY, '旧', '甲 | 乙')]
  await rejectedBatch({ recs: [recRow(h, { [WHY]: '旧' })], edits: queued }, { jobs: jobs(queued) },
    '表格格里不能写竖线，它是分隔符；要写就用全角｜')
})

test('the only field a change may create is the site description', async () => {
  // 页面上显示官方描述、站内还没写说明的那一格可以新添。别的键新添出来会写进
  // manifest 字段，或把 site_authors 这种对象换成字符串，sync.py 写回时中止。
  const h = recHarness({ [TIER]: 'T1' })
  const add = { a: 'chg', doc: 'keys/legendary-heavy', rec: REC, before: '', after: '新写的说明' }
  assert.equal((await h.request({ ...add, path: 'i18n/zh-CN/realgame_details' })).ok, 1)
  for (const path of ['i18n/zh-CN/database_details', 'i18n/zh-CN/name', 'i18n/zh-CN/site_authors',
                      'i18n/zh-CN/site_authors/LGpig/notes', 'enhanced/0/realgame_details']) {
    assert.equal((await h.request({ ...add, path })).error, 'stale', path)
  }
})

test('approving record changes patches the one field and rehashes, atomically with documents', async () => {
  const rows = [recEdit('a', TIER, 'T1.5', 'T1'), recEdit('b', WHY, '顶级 perk 池', '顶级 perk 池，多人场景更适合'),
                edit('c', 0, '甲', '甲新')]
  const h = recHarness({ [TIER]: 'T1.5', [WHY]: '顶级 perk 池' }, rows,
    { docs: [{ _id: 'docs/example', md: '甲', hash: digest('甲') }] })
  assert.equal((await h.request({ a: 'emark', jobs: jobs(rows) })).ok, 1)
  const got = h.store.recs.get(REC)
  const flat = JSON.parse(got.json)
  assert.equal(flat[TIER], 'T1')
  assert.equal(flat[WHY], '顶级 perk 池，多人场景更适合')
  assert.equal(got.json, h.canon(flat))
  assert.equal(got.hash, digest(got.json))
  assert.equal(got.landed, digest(h.canon({ [TIER]: 'T1.5', [WHY]: '顶级 perk 池' })), 'landed 只归 sync.py 写')
  assert.equal(h.store.docs.get('docs/example').md, '甲新')
  assert.equal(h.calls.filter((c) => c.op === 'update' && c.name === 'recs').length, 1)
})

test('a record change whose text moved on, or two changes to one field, reject the whole batch', async () => {
  const flat = { [TIER]: 'T1' }
  const stale = [recEdit('a', TIER, 'T1.5', 'T0'), edit('c', 0, '甲', '甲新')]
  const seed = (rows) => ({ recs: [{ _id: REC, json: JSON.stringify(flat), hash: 'x' }],
                            docs: [{ _id: 'docs/example', md: '甲', hash: digest('甲') }], edits: rows })
  await rejectedBatch(seed(stale), { jobs: jobs(stale) })
  const twice = [recEdit('a', TIER, 'T1', 'T0'), recEdit('b', TIER, 'T1', 'T2')]
  await rejectedBatch(seed(twice), { jobs: jobs(twice) })
  const gone = [recEdit('a', TIER, 'T1', 'T0')]
  await rejectedBatch({ edits: gone }, { jobs: jobs(gone) }, 'no rec')
})

test('a record page gets its pending changes from every page and only the records that moved', async () => {
  const other = 'inventory-items/1'
  const rows = [recEdit('here', TIER, 'T1', 'T0'),
                recEdit('there', WHY, '旧', '新', { doc: 'keys/legendary-special' }),
                { ...recEdit('elsewhere', TIER, 'T1', 'T2'), rec: 'inventory-items/2' }]
  const h = recHarness({ [TIER]: 'T1', [WHY]: '旧' }, rows)
  h.store.recs.set(other, recRow(h, { [TIER]: 'T3' }, { _id: other }))
  const r = await h.request({ a: 'pend', doc: 'keys/legendary-heavy',
    recs: { [REC]: 'hash-at-build', [other]: h.store.recs.get(other).hash } })
  assert.deepEqual(r.pend.map((e) => e._id).sort(), ['here', 'there'])
  assert.deepEqual(Object.keys(r.recs), [REC], '库里没变的那条不带回')
  assert.equal(r.recs[REC].json, h.store.recs.get(REC).json)
})

test('the review console learns which record changes went stale', async () => {
  const rows = [recEdit('fresh', TIER, 'T1', 'T0'), recEdit('old', WHY, '更早的文字', '新')]
  const h = recHarness({ [TIER]: 'T1', [WHY]: '现在的文字' }, rows,
    { docs: [{ _id: 'keys/legendary-heavy', md: '# 页', hash: digest('# 页') }] })
  const r = await h.request({ a: 'pend', doc: 'keys/legendary-heavy', judge: 1 })
  assert.deepEqual(Object.fromEntries(r.pend.map((e) => [e._id, e.stale])), { fresh: false, old: true })
})

test('sync pushes records in validated batches and pages through them in a stable order', async () => {
  // 这几个动作走 ADMIN_TOKEN（请求体里的 k），不走白名单。
  const KEY = 'isolated-quality-token'
  const h = harness()
  const good = h.canon({ [TIER]: 'T1' })
  const gz = (rows) => zlib.gzipSync(Buffer.from(JSON.stringify(rows))).toString('base64')
  assert.equal((await h.request({ a: 'rpush', k: KEY, gz: gz([[REC, good], ['minted/4294967316', h.canon({ 'i18n/zh-CN/效果': '甲' })]]) })).ok, 1)
  assert.equal(h.store.recs.get(REC).landed, digest(good))
  // 一条坏的整批不写：不是规范文本、路径不对、_id 不对，三样各一。
  for (const bad of [[REC, JSON.stringify({ [TIER]: 'T1' }, null, 1)], [REC, h.canon({ name: '甲' })], ['docs/x', good]]) {
    const before = h.snapshot()
    assert.equal((await h.request({ a: 'rpush', k: KEY, gz: gz([['inventory-items/3', good], bad]) })).error, 'bad rec')
    assert.deepEqual(h.snapshot(), before)
  }
  const page = await h.request({ a: 'rpull', k: KEY, skip: 0 })
  assert.deepEqual(page.recs.map((r) => r._id), [REC, 'minted/4294967316'])
  assert.equal(page.more, 0)
  const minted = h.canon({ 'i18n/zh-CN/效果': '甲' })
  const heads = await h.request({ a: 'rpull', k: KEY, skip: 0, heads: 1 })
  assert.equal(heads.more, 0)
  assert.deepEqual(heads.recs.map((r) => r._id), [REC, 'minted/4294967316'])
  const bodies = { [REC]: good, 'minted/4294967316': minted }
  for (const row of heads.recs) {
    assert.equal('json' in row, false)
    assert.equal(row.hash, digest(bodies[row._id]))
    assert.equal(row.landed, digest(bodies[row._id]))
  }

  assert.equal((await h.request({ a: 'rlanded', k: KEY, items: [['inventory-items/404', digest('x')]] })).error, 'no rec')
  assert.equal((await h.request({ a: 'rdrop', k: KEY, ids: [REC] })).ok, 1)
  assert.equal(h.store.recs.has(REC), false)
})

const tableDoc = '# 标题\n\n## 一节\n\n| 名称 | 说明 |\n|---|---|\n| 甲 | 旧文 |\n\n正文一段\n'
function cellSeed() {
  return { docs: [{ _id: 'docs/example', md: tableDoc, hash: digest(tableDoc), by: 'original' }] }
}
async function change(after, before = '旧文', blk = 6, cell = 1) {
  const h = harness(cellSeed())
  const result = await h.request({ a: 'chg', doc: 'docs/example', before, after, blk, cell })
  return { h, result, queued: [...h.store.edits.values()] }
}

test('a table cell change carries its row, and the queue reads the row as it is now', async () => {
  // 审核台与改动记录靠 ctx 写「甲本 首领二 · 生命值」。首格留空即向上合并，身份是
  // 合并到的首格加第二格；提交时记一份，取待审时按当前正文重取，定位不到的沿用提交那份。
  const md = '# 标题\n\n| 副本 | 首领 | 生命值 |\n|---|---|---|\n| 甲本 | 首领一 | 100 |\n|  | 首领二 | 200 |\n\n正文一段\n'
  const h = harness({ docs: [{ _id: 'docs/example', md, hash: digest(md), by: 'o' }] })
  assert.equal((await h.request({ a: 'chg', doc: 'docs/example', before: '200', after: '250', blk: 5, cell: 2 })).ok, 1)
  assert.equal((await h.request({ a: 'chg', doc: 'docs/example', before: '正文一段', after: '正文两段', blk: 7, cell: -1 })).ok, 1)
  const [cellEdit, blockEdit] = [...h.store.edits.values()]
  assert.deepEqual(cellEdit.ctx, { head: ['副本', '首领', '生命值'], cells: ['', '首领二', '200'], id: ['甲本', '首领二'] })
  assert.equal(blockEdit.ctx, undefined, '整块改动不在表格里，没有行的上下文')

  h.store.docs.get('docs/example').md = md.replace('首领二', '首领二改')
  const fresh = (await h.request({ a: 'pend', doc: 'docs/example', judge: 1 })).pend.find((e) => e.cell === 2)
  assert.equal(fresh.stale, false)
  assert.deepEqual(fresh.ctx.id, ['甲本', '首领二改'], '同一行别的格改过之后，审的人看到的是此刻的整行')

  h.store.docs.get('docs/example').md = md.replace('| 200 |', '| 210 |')
  const stale = (await h.request({ a: 'pend', doc: 'docs/example', judge: 1 })).pend.find((e) => e.cell === 2)
  assert.equal(stale.stale, true)
  assert.deepEqual(stale.ctx.id, ['甲本', '首领二'], '定位不到时沿用提交时记下的那一行')
})

test('a bare pipe in a table cell is refused before it reaches the queue', async () => {
  const { result, queued } = await change('新|文')
  assert.equal(result.status, 400)
  assert.match(result.error, /竖线/)
  assert.deepEqual(queued, [])
})

test('a body the gateway hands over as base64 reads the same as plain JSON', async () => {
  // 访问计数那一发不带 content-type（text/plain 免掉跨域预检），网关对非 JSON 的正文
  // 可能按 base64 转交、带 isBase64Encoded。当成 JSON 直接解会解成空对象，动作丢失。
  const h = harness()
  const headers = { authorization: 'Bearer isolated-quality-token' }
  const text = JSON.stringify({ a: 'edits' })
  const plain = await h.main({ httpMethod: 'POST', body: text, headers })
  const coded = await h.main({ httpMethod: 'POST', body: Buffer.from(text).toString('base64'),
    isBase64Encoded: true, headers })
  assert.equal(plain.statusCode, 200)
  assert.equal(coded.statusCode, plain.statusCode)
  assert.deepEqual(JSON.parse(coded.body), JSON.parse(plain.body))
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

test('a bare brace does not hide a pipe from the splitter', async () => {
  // 只有 {token| 开一层。裸的 { 不开层，它后面那个竖线仍在深度 0 上：写进去那一行
  // 多出一格，convert-doc.py 中止整次构建。裸花括号本身构建也不认，一并拒。
  for (const after of ['见 { 注 | 旁 }', '{注}']) {
    const { result, queued } = await change(after)
    assert.equal(result.status, 400, after)
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
  const h = harness({
    editors: [{ _id: 'u4', name: '老四', lv: 4 }, { _id: 'u3', name: '老三', lv: 3 }]
  }, {
    async fetch() {
      return { ok: true, status: 200, async json() { return { sub: 'u3' } } }
    }
  })
  h.signIn('lv4', 4, 'u4')
  h.signIn('lv3', 3, 'u3')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 4 })).error, 'bad lv', '不许造出与自己同级的')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 5 })).error, 'bad lv', '不许造出高于自己的')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'u4', lv: 1 })).error, 'forbidden', '不许动与自己同级的人')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'new', lv: 3 })).error, undefined, 'lv 3 该造得出来')
  // 降权或移除后立即清掉 wc 缓存，不留 5 分钟高权限空窗
  assert.equal((await h.as('lv4', { a: 'eds', op: 'set', uid: 'u3', lv: 1 })).ok, 1)
  assert.equal((await h.as('lv3', { a: 'emark', jobs: [] })).error, 'no permission', '降为 lv 1 后旧令牌缓存立即失效')
  assert.equal((await h.as('lv4', { a: 'eds', op: 'del', uid: 'u3' })).ok, 1)
  assert.equal((await h.as('lv3', { a: 'edits' })).error, 'no permission', '移除后旧令牌缓存立即失效')
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


test('the visitor count is read from the database once a minute per instance', async () => {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const h = harness({ counters: [{ _id: 'stat', pv: 17092, d: { [day]: 1288 } }] })
  assert.deepEqual(await h.request({ a: 'stats' }, false), { status: 200, today: 1288, total: 17092 })
  assert.deepEqual(await h.request({ a: 'stats' }, false), { status: 200, today: 1288, total: 17092 })
  assert.equal(h.calls.filter((c) => c.op === 'get' && c.name === 'counters').length, 1,
    '一分钟内第二次读计数又打了数据库')
})


test('build like waits for the existing count before allowing a cancellation', async () => {
  const html = fs.readFileSync(path.join(site, 'builds/s29/00vivy2a-hunter/index.html'), 'utf8')
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).find((s) => s.includes('document.querySelectorAll("[data-like]")'))
  assert.ok(code)
  const id = 's29_00vivy2a-hunter'
  const storage = { ['lk' + id]: '1' }
  const number = { textContent: '' }
  const button = {
    tagName: 'BUTTON', dataset: { like: id }, disabled: false, attrs: { 'aria-pressed': 'false' },
    querySelector: () => number,
    getAttribute(key) { return this.attrs[key] },
    setAttribute(key, value) { this.attrs[key] = value },
    closest() { return this }
  }
  let click
  let finishLoad
  let finishWrite
  const requests = []
  const indexedDB = likeIndexedDB()
  const ctx = {
    window: { indexedDB, crypto: crypto.webcrypto, addEventListener() {} },
    indexedDB, crypto: crypto.webcrypto,
    document: {
      querySelectorAll: () => [button],
      addEventListener(type, fn) { if (type === 'click') click = fn }
    },
    localStorage: {
      getItem: (key) => storage[key] || null,
      setItem(key, value) { storage[key] = value },
      removeItem(key) { delete storage[key] }
    },
    fetch(url, options) {
      requests.push({ url, options })
      return new Promise((resolve) => { if (options) finishWrite = resolve; else finishLoad = resolve })
    }
  }
  vm.runInNewContext(code, ctx)
  assert.equal(button.attrs['aria-pressed'], 'true')
  assert.equal(button.disabled, true)
  click({ target: button })
  assert.equal(requests.length, 1)
  finishLoad({ ok: true, json: () => Promise.resolve({ [id]: 10 }) })
  await new Promise((resolve) => setImmediate(resolve))
  click({ target: button })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(JSON.parse(requests[1].options.body).before, true)
  assert.equal(JSON.parse(requests[1].options.body).on, false)
  finishWrite({ ok: true, json: () => Promise.resolve({ ok: 1 }) })
  await new Promise((resolve) => setImmediate(resolve))
  finishLoad({ ok: true, json: () => Promise.resolve({ [id]: 9 }) })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(number.textContent, 9)
  assert.equal(button.attrs['aria-pressed'], 'false')
  assert.equal(button.disabled, false)
})
