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
const root = path.resolve(__dirname, '../..')
const site = path.join(root, 'site')
const source = fs.readFileSync(process.env.QUALITY_API_SOURCE || path.join(root, 'functions/api/index.js'), 'utf8')
const copy = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v))
const digest = (md) => crypto.createHash('sha1').update(md).digest('hex')
const tests = []
function test(name, fn) { tests.push([name, fn]) }

function harness(seed = {}, hooks = {}) {
  const published = {}
  const store = Object.fromEntries(['counters', 'likes', 'subs', 'docs', 'recs', 'edits', 'editors']
    .map((name) => [name, new Map((seed[name] || []).map((r) => [r._id, copy(r)]))]))
  const calls = []
  let serial = 0
  function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === 'object') {
        // db.RegExp(...) 在这一侧还原成真正的 RegExp：docs 那条路由按 ^builds/
        // 前缀挑配装，不认它的话那条路由整个测不了。
        if (value.$regex !== undefined) return new RegExp(value.$regex, value.$options || '').test(row[key])
        if (value.$in !== undefined) return value.$in.includes(row[key])
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
          async create(fields) {
            calls.push({ op: 'create', name, id, tx: !!tx, fields: copy(fields) })
            if (state[name].has(id)) return { code: 'DUPLICATE_KEY', message: 'duplicate key' }
            state[name].set(id, Object.assign({ _id: id }, copy(fields)))
            if (tx) tx.writes.add(name + '\0' + id)
            return { inserted: 1, ok: 1, id }
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
    command: { neq: (v) => ({ $ne: v }), in: (v) => ({ $in: copy(v) }) },
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
    process: { env: { ADMIN_TOKEN: 'isolated-quality-token', BUNGIE_API_KEY: 'test-bungie-key' } },
    fetch(...args) {
      if (hooks.fetch) return hooks.fetch(...args)
      throw new Error('network prohibited')
    },
    require(name) {
      if (name === 'crypto') return crypto
      if (name === 'zlib') return zlib
      if (name === 'fs') return fs
      if (name === 'path') return path
      // 源稿方言、配装源稿形状与永恒之诗抓取模块与线上是同一个文件，不在这里另造替身。
      if (name === './dialect.js') return require(path.join(root, 'functions/api/dialect.js'))
      if (name === './source.js') return require(path.join(root, 'functions/api/source.js'))
      if (name === './eververse.js' || name === './xur.js') {
        const modPath = path.join(root, 'functions/api', name.slice(2))
        const modCode = fs.readFileSync(modPath, 'utf8')
        const modBox = {
          module: { exports: {} }, exports: {}, require: sandbox.require,
          fetch: (...a) => sandbox.fetch(...a), process: sandbox.process, console, __dirname: path.join(root, 'functions/api')
        }
        vm.runInNewContext(modCode, modBox, { filename: 'functions/api/' + name.slice(2) })
        return modBox.module.exports
      }
      // 静态托管上传：记下发到哪个路径、内容是什么，不碰网络。
      if (name === '@cloudbase/manager-node') {
        return function Manager() {
          this.hosting = {
            async uploadFiles({ files }) {
              if (hooks.upload) await hooks.upload(files)
              for (const f of files) published[f.cloudPath] = JSON.parse(fs.readFileSync(f.localPath, 'utf8'))
            }
          }
        }
      }
      assert.equal(name, '@cloudbase/node-sdk', 'unexpected module')
      return { init: () => ({ database: () => db }) }
    }
  }
  vm.runInNewContext(source + '\nexports.quality = { fingerprint, wc, LEVEL, canon };', sandbox, { filename: 'functions/api/index.js' })
  return {
    store, calls, published,
    fingerprint: sandbox.exports.quality.fingerprint,
    canon: sandbox.exports.quality.canon,
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
    },
    // 原样的网关事件，给要控制事件形状的断言用（isBase64Encoded 那一类）。
    main: (event) => sandbox.exports.main(event),
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

function funcSource(file, name) {
  const text = fs.readFileSync(path.join(site, file), 'utf8')
  const head = new RegExp('^([ \\t]*)function ' + name + ' ?\\(', 'm').exec(text)
  assert.notEqual(head, null, `${file} 里找不到 ${name}()`)
  const line = text.slice(head.index).split('\n', 1)[0]
  if (line.trimEnd().endsWith('}')) return line
  // 按缩进找收尾，不数花括号——cells() 的函数体里有 '{' 与 '}' 两个字符串字面量，
  // 数括号会在那里提前收口。同一层缩进上孤零零的一个 } 就是这个函数的末尾。
  const close = new RegExp('^' + (head[1] || '') + '\\}$', 'm')
  const rest = text.slice(head.index + head[0].length)
  const at = close.exec(rest)
  assert.notEqual(at, null, `${file} 的 ${name}() 没找到收尾`)
  return text.slice(head.index, head.index + head[0].length + at.index + at[0].length)
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
async function main() {
  let failures = 0
  for (const [name, fn] of tests) {
    try { await fn() }
    catch (error) { failures++; console.error('FAIL - ' + name); console.error(error.stack || error) }
  }
  console.log(`${tests.length - failures}/${tests.length} quality regressions passed (offline adapter; cloud integration not exercised)`)
  if (failures) process.exitCode = 1
}

module.exports = {
  assert, fs, path, vm, crypto, zlib, root, site, source, copy, digest,
  tests, test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows, main,
}
