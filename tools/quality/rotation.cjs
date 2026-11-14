'use strict'
const {
  assert, fs, path, vm, crypto, zlib, root, site, copy, digest,
  test, harness, md, submission, edit, reviewSeed, jobs, rejectedBatch,
  funcSource, tableRows,
} = require('./harness.cjs')

test('eververse: timer trigger syncs 26 validated items into counters/rotation and publishes rotation/eververse.json to static hosting', async () => {
  const { ROTATION_SLOTS, ADA_SLOTS, EVERVERSE_FEED_URL, ADA_FEED_URL } = require(path.join(root, 'tools/sync-eververse.js'))
  const allSlots = [...ROTATION_SLOTS, ...ADA_SLOTS]
  const byHash = new Map(allSlots.map((s, i) => [String(s.hash), { s, i }]))
  const feedHtml = ROTATION_SLOTS.map((s) => {
    const item = {
      name: 'Item ' + s.hash,
      itemType: s.expectedType === '武器皮肤' ? 'Weapon Ornament'
        : s.expectedType === '泰坦皮肤' ? 'Titan Ornament'
        : s.expectedType === '猎人皮肤' ? 'Hunter Ornament'
        : s.expectedType === '术士皮肤' ? 'Warlock Ornament'
        : s.expectedType === '飞船' ? 'Ship'
        : s.expectedType === '载具' ? 'Vehicle'
        : s.expectedType === '机灵外壳' ? 'Ghost Shell'
        : s.expectedType === '机灵投影' ? 'Ghost Projection'
        : s.expectedType === '终结技' ? 'Finisher'
        : s.expectedType === '着色器' ? 'Shader'
        : s.expectedType === '传送效果' ? 'Transmat Effect'
        : 'Emote',
      tier: s.expectedTier === 'exotic' ? 'Exotic' : (s.expectedTier === 'rare' ? 'Rare' : 'Legendary'),
      cost: s.cost + (s.currency === 'silver' ? ' Silver' : ' Bright Dust'),
      market: s.currency,
      link: 'https://www.light.gg/db/items/' + s.hash + '/'
    }
    return `<div data-ke-item="${JSON.stringify(item).replace(/"/g, '&quot;')}"></div>`
  }).join('')
  const adaHtml = `<section id="kwr-ada">${ADA_SLOTS.map((s) => `<article class="kwr-shader" data-item-hash="${s.hash}"></article>`).join('')}</section>`
  const h = harness({}, {
    async fetch(url) {
      if (url === EVERVERSE_FEED_URL) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { content: { rendered: feedHtml } }
          }
        }
      }
      if (url === ADA_FEED_URL) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { content: { rendered: adaHtml } }
          }
        }
      }
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      assert.ok(m, 'unexpected url: ' + url)
      const entry = byHash.get(m[1])
      assert.ok(entry, 'unknown hash: ' + m[1])
      const { s, i } = entry
      const tierTypeName = s.expectedTier === 'exotic' ? '异域' : (s.expectedTier === 'rare' ? '稀有' : '传说')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            Response: {
              itemType: s.expectedType === '着色器' ? 29 : 19,
              itemTypeDisplayName: s.expectedType,
              displayProperties: {
                name: '测试商品' + (i + 1),
                icon: '/common/destiny2_content/icons/test_' + (i + 1) + '.jpg'
              },
              inventory: { tierTypeName },
              screenshot: s.isWide ? '/common/destiny2_content/screenshots/' + s.hash + '.jpg' : undefined
            }
          }
        }
      }
    }
  })

  const timerRes = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(timerRes.ok, 1)
  assert.equal(timerRes.total, 26)
  assert.equal(timerRes.adaTotal, 6)

  h.signIn('lv2', 2)
  const adminSync = await h.as('lv2', { a: 'sync_rotation', slots: ROTATION_SLOTS })
  assert.equal(adminSync.ok, 1)
  assert.equal(adminSync.total, 26)
  assert.equal(adminSync.adaTotal, 6)
  h.signIn('lv1', 1)
  assert.equal((await h.as('lv1', { a: 'sync_rotation' })).error, 'no permission')

  // 页面读的是发布到静态托管的那份，云函数不再开公开读接口。
  assert.equal((await h.main({ httpMethod: 'GET', queryStringParameters: { a: 'rotation' } })).statusCode, 400)
  const body = h.published['destiny2-starside/rotation/eververse.json']
  assert.ok(body, '同步后发布到静态托管 rotation/eververse.json')
  assert.equal(body.total, 26)
  assert.equal(body.items.length, 26)
  assert.equal(body.items[0].name, '测试商品 1')
  assert.equal(body.items[0].icon, 'https://www.bungie.net/common/destiny2_content/icons/test_1.jpg')
  assert.equal(body.ada.total, 6)
  assert.equal(body.ada.items.length, 6)
  assert.equal(body.ada.items[0].currency, 'glimmer')
  assert.equal(body.ada.items[0].cost, 10000)
  assert.equal(body._id, undefined)
})

test('eververse: Bungie 503 maintenance or subclass mismatch aborts sync without overwriting existing rotation doc', async () => {
  const { ROTATION_SLOTS, EVERVERSE_FEED_URL } = require(path.join(root, 'tools/sync-eververse.js'))
  const feedHtml = ROTATION_SLOTS.map((s) => {
    const item = {
      name: 'Item ' + s.hash,
      itemType: s.expectedType === '武器皮肤' ? 'Weapon Ornament'
        : s.expectedType === '泰坦皮肤' ? 'Titan Ornament'
        : s.expectedType === '猎人皮肤' ? 'Hunter Ornament'
        : s.expectedType === '术士皮肤' ? 'Warlock Ornament'
        : s.expectedType === '飞船' ? 'Ship'
        : s.expectedType === '载具' ? 'Vehicle'
        : s.expectedType === '机灵外壳' ? 'Ghost Shell'
        : s.expectedType === '机灵投影' ? 'Ghost Projection'
        : s.expectedType === '终结技' ? 'Finisher'
        : s.expectedType === '着色器' ? 'Shader'
        : s.expectedType === '传送效果' ? 'Transmat Effect'
        : 'Emote',
      tier: s.expectedTier === 'exotic' ? 'Exotic' : (s.expectedTier === 'rare' ? 'Rare' : 'Legendary'),
      cost: String(s.cost),
      market: s.currency,
      link: 'https://www.light.gg/db/items/' + s.hash + '/'
    }
    return `<div data-ke-item="${JSON.stringify(item).replace(/"/g, '&quot;')}"></div>`
  }).join('')
  const existing = { _id: 'rotation', updatedAt: '2026-10-19T01:30:00Z', total: 26, items: [{ name: '旧有效数据' }] }
  const h503 = harness({ counters: [existing] }, {
    async fetch() {
      return { ok: false, status: 503, async json() { return {} } }
    }
  })
  const res503 = await h503.main({ Type: 'Timer', TriggerName: 'eververse-daily-0130' })
  assert.equal(res503.ok, 0)
  assert.match(res503.error, /HTTP 503/)
  assert.deepEqual(h503.store.counters.get('rotation'), existing, '503 维护时不得覆盖已有有效数据')

  const hSub = harness({ counters: [existing] }, {
    async fetch(url) {
      if (url === EVERVERSE_FEED_URL) {
        return { ok: true, status: 200, async json() { return { content: { rendered: feedHtml } } } }
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            Response: {
              itemType: 20,
              itemTypeDisplayName: '术士分支职业',
              displayProperties: { name: '破晓', icon: '/common/destiny2_content/icons/sub.jpg' },
              inventory: { tierTypeName: '传说' }
            }
          }
        }
      }
    }
  })
  const resSub = await hSub.main({ Type: 'Timer', TriggerName: 'eververse-daily-0130' })
  assert.equal(resSub.ok, 0)
  assert.match(resSub.error, /分支职业/)
  assert.deepEqual(hSub.store.counters.get('rotation'), existing, '命中子职业时必须熔断，不得覆盖数据')

  const { ADA_FEED_URL } = require(path.join(root, 'tools/sync-eververse.js'))
  const byHash = new Map(ROTATION_SLOTS.map((s, i) => [String(s.hash), { s, i }]))
  async function hAdaFailFetch(url) {
      if (url === EVERVERSE_FEED_URL) {
        return { ok: true, status: 200, async json() { return { content: { rendered: feedHtml } } } }
      }
      if (url === ADA_FEED_URL) {
        return { ok: false, status: 503, async json() { return {} } }
      }
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      const entry = byHash.get(m[1])
      const { s, i } = entry
      const tierTypeName = s.expectedTier === 'exotic' ? '异域' : (s.expectedTier === 'rare' ? '稀有' : '传说')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            Response: {
              itemType: 19,
              itemTypeDisplayName: s.expectedType,
              displayProperties: { name: '商品' + (i + 1), icon: '/icons/t.jpg' },
              inventory: { tierTypeName }
            }
          }
        }
      }
  }
  const hAdaFail = harness({}, { fetch: hAdaFailFetch })
  const resAdaFail = await hAdaFail.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(resAdaFail.ok, 1, 'Ada feed 故障不阻断每日光尘商店更新')
  assert.equal(resAdaFail.total, 26)
  assert.equal(resAdaFail.adaTotal, 0)
  assert.match(resAdaFail.adaError, /HTTP 503/)

  // 托管写失败（执行角色没权限）要报出来，不能当成同步成功。
  const hDeny = harness({}, {
    fetch: hAdaFailFetch,
    async upload() { throw new Error('AccessDenied') }
  })
  const resDeny = await hDeny.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(resDeny.ok, 0)
  assert.match(resDeny.error, /AccessDenied/)
})

test('eververse: universal armor ornaments, class finishers, and data-kdh-preview Ada-1 HTML sync cleanly', async () => {
  const { ROTATION_SLOTS, ADA_SLOTS, EVERVERSE_FEED_URL, ADA_FEED_URL } = require(path.join(root, 'tools/sync-eververse.js'))
  const customFeed = ROTATION_SLOTS.map((s, idx) => {
    let itemType = s.expectedType === '武器皮肤' ? 'Weapon Ornament'
      : s.expectedType === '泰坦皮肤' ? 'Titan Universal Ornament'
      : s.expectedType === '猎人皮肤' ? 'Hunter Universal Ornament'
      : s.expectedType === '术士皮肤' ? 'Warlock Universal Ornament'
      : s.expectedType === '飞船' ? 'Ship'
      : s.expectedType === '载具' ? 'Vehicle'
      : s.expectedType === '机灵外壳' ? 'Ghost Shell'
      : s.expectedType === '机灵投影' ? 'Ghost Projection'
      : s.expectedType === '终结技' ? 'Titan Finisher'
      : s.expectedType === '着色器' ? 'Shader'
      : s.expectedType === '传送效果' ? 'Transmat Effect'
      : 'Emote'
    let tier = s.expectedTier === 'exotic' ? 'Exotic' : (s.expectedTier === 'rare' ? 'Rare' : 'Legendary')
    if (idx >= 1 && idx <= 3) tier = 'Legendary'
    const item = {
      name: 'Item ' + s.hash,
      itemType,
      category: idx >= 1 && idx <= 3 ? 'armor ornaments' : '',
      tier,
      cost: s.cost + (s.currency === 'silver' ? ' Silver' : ' Bright Dust'),
      market: s.currency,
      link: 'https://www.light.gg/db/items/' + s.hash + '/'
    }
    return `<div data-ke-item="${JSON.stringify(item).replace(/"/g, '&quot;')}"></div>`
  }).join('')
  const adaHtml = `<section class="kwr-section" id="kwr-ada"><div class="kwr-shader-grid">${ADA_SLOTS.map((s) => {
    const preview = JSON.stringify({ hash: s.hash, name: 'Shader ' + s.hash, type: 'Shader', tier: 'Legendary' }).replace(/"/g, '&quot;')
    return `<article class="kwr-shader"><a class="kdh-preview-target" data-kdh-preview="${preview}" href="#kwr-ada"></a><a class="kdh-preview-target" data-kdh-preview="${preview}" href="#kwr-ada"></a></article>`
  }).join('')}</div></section>`
  const allSlots = [...ROTATION_SLOTS, ...ADA_SLOTS]
  const byHash = new Map(allSlots.map((s, i) => [String(s.hash), { s, i }]))
  const h = harness({}, {
    async fetch(url) {
      if (url === EVERVERSE_FEED_URL) {
        return { ok: true, status: 200, async json() { return { content: { rendered: customFeed } } } }
      }
      if (url === ADA_FEED_URL) {
        return { ok: true, status: 200, async json() { return { content: { rendered: adaHtml } } } }
      }
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      const { s, i } = byHash.get(m[1])
      const isUniv = i >= 1 && i <= 3
      const actualType = isUniv ? s.expectedType.replace('皮肤', '通用皮肤')
        : (s.expectedType === '终结技' ? '泰坦终结技' : s.expectedType)
      const tierTypeName = isUniv ? '传说' : (s.expectedTier === 'exotic' ? '异域' : (s.expectedTier === 'rare' ? '稀有' : '传说'))
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            Response: {
              itemType: s.expectedType === '着色器' ? 29 : 19,
              itemTypeDisplayName: actualType,
              displayProperties: { name: '测试商品' + (i + 1), icon: '/common/destiny2_content/icons/test_' + (i + 1) + '.jpg' },
              inventory: { tierTypeName }
            }
          }
        }
      }
    }
  })
  const res = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(res.ok, 1)
  assert.equal(res.total, 26)
  assert.equal(res.adaTotal, 6)
  const published = h.published['destiny2-starside/rotation/eververse.json']
  const mainItems = published.items.filter((it) => it.group === '主要光尘优惠')
  assert.equal(mainItems.length, 8)
  assert.deepEqual(mainItems.slice(0, 4).map((it) => it.type), ['武器皮肤', '泰坦通用皮肤', '猎人通用皮肤', '术士通用皮肤'])
  assert.equal(published.items.filter((it) => it.group === '其他光尘优惠').length, 10)
  assert.equal(published.ada.items.length, 6)
})

test('eververse: 7-day history, 4-week ada history, stale upstream detection, and idempotent retry', async () => {
  const {
    ROTATION_SLOTS, ADA_SLOTS, EVERVERSE_FEED_URL, ADA_FEED_URL,
    eververseWindow, weeklyCycleRange, slotsSignature, adaSignature,
  } = require(path.join(root, 'tools/sync-eververse.js'))
  const allSlots = [...ROTATION_SLOTS, ...ADA_SLOTS]
  const byHash = new Map(allSlots.map((s, i) => [String(s.hash), { s, i }]))
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const fmtKyberDate = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return `${months[m - 1]} ${d}, ${y}`
  }
  const makeFeed = (slots, dateStr) => {
    const cards = slots.map((s) => {
      const item = {
        name: 'Item ' + s.hash,
        itemType: s.expectedType === '武器皮肤' ? 'Weapon Ornament'
          : s.expectedType === '泰坦皮肤' ? 'Titan Ornament'
          : s.expectedType === '猎人皮肤' ? 'Hunter Ornament'
          : s.expectedType === '术士皮肤' ? 'Warlock Ornament'
          : s.expectedType === '飞船' ? 'Ship'
          : s.expectedType === '载具' ? 'Vehicle'
          : s.expectedType === '机灵外壳' ? 'Ghost Shell'
          : s.expectedType === '机灵投影' ? 'Ghost Projection'
          : s.expectedType === '终结技' ? 'Finisher'
          : s.expectedType === '着色器' ? 'Shader'
          : s.expectedType === '传送效果' ? 'Transmat Effect'
          : 'Emote',
        tier: s.expectedTier === 'exotic' ? 'Exotic' : (s.expectedTier === 'rare' ? 'Rare' : 'Legendary'),
        cost: s.cost + (s.currency === 'silver' ? ' Silver' : ' Bright Dust'),
        market: s.currency,
        link: 'https://www.light.gg/db/items/' + s.hash + '/'
      }
      return `<div data-ke-item="${JSON.stringify(item).replace(/"/g, '&quot;')}"></div>`
    }).join('')
    return (dateStr ? `<div class="ke-current-inv">CURRENT INVENTORY: <strong>${fmtKyberDate(dateStr)}</strong></div>` : '') + cards
  }
  const makeAdaHtml = (slots) => `<section id="kwr-ada">${slots.map((s) => `<article class="kwr-shader" data-item-hash="${s.hash}"></article>`).join('')}</section>`

  const win = eververseWindow()
  const wk = weeklyCycleRange()
  const prevCycleStart = new Date(Date.parse(win.cycleStart) - 86400e3).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const prevCycleDate = new Date(Date.parse(win.cycleStart) - 86400e3).toISOString().slice(0, 10)
  const altSlots = ROTATION_SLOTS.map((s, i) => (i === 0 ? { ...s, cost: s.cost + 100 } : s))
  const curSig = slotsSignature(ROTATION_SLOTS)
  const altSig = slotsSignature(altSlots)
  const curAdaSig = adaSignature(ADA_SLOTS)

  let feedMode = 'current'
  let bungieCalls = 0
  let adaCalls = 0
  const preHistory = Array.from({ length: 7 }, (_, i) => ({
    cycleStart: new Date(Date.parse(win.cycleStart) - (7 - i) * 86400e3).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    cycleDate: '2026-01-0' + (i + 1),
    sig: i === 6 ? altSig : ('old-sig-' + i),
    total: 26,
    updatedAt: '2026-01-01T17:03:00Z',
  }))
  const preAdaHistory = Array.from({ length: 4 }, (_, i) => ({
    cycleStart: `2026-01-0${i + 1}T17:00:00Z`,
    sig: 'old-ada-' + i,
    total: 6,
    updatedAt: '2026-01-01T17:03:00Z',
  }))
  const h = harness({
    counters: [{
      _id: 'rotation',
      cycleStart: prevCycleStart,
      cycleDate: prevCycleDate,
      resetAt: win.cycleStart,
      updatedAt: '2026-11-13T17:03:00Z',
      total: 26,
      items: [{ name: '昨日有效商品', hash: 1 }],
      ada: { cycleStart: wk.cycleStart, resetAt: wk.resetAt, total: 6, items: ADA_SLOTS.map((s) => ({ hash: s.hash, name: '本周艾达着色器' })) },
      history: preHistory,
      adaHistory: preAdaHistory,
    }]
  }, {
    async fetch(url) {
      if (url === EVERVERSE_FEED_URL) {
        const html = feedMode === 'oldDate'
          ? makeFeed(ROTATION_SLOTS, prevCycleDate)
          : feedMode === 'dupSig'
            ? makeFeed(altSlots, win.cycleDate)
            : makeFeed(ROTATION_SLOTS, win.cycleDate)
        return { ok: true, status: 200, async json() { return { content: { rendered: html } } } }
      }
      if (url === ADA_FEED_URL) {
        adaCalls++
        return { ok: true, status: 200, async json() { return { content: { rendered: makeAdaHtml(ADA_SLOTS) } } } }
      }
      bungieCalls++
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      const { s, i } = byHash.get(m[1])
      const tierTypeName = s.expectedTier === 'exotic' ? '异域' : (s.expectedTier === 'rare' ? '稀有' : '传说')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            Response: {
              itemType: s.expectedType === '着色器' ? 29 : 19,
              itemTypeDisplayName: s.expectedType,
              displayProperties: { name: '测试商品' + (i + 1), icon: '/common/destiny2_content/icons/test_' + (i + 1) + '.jpg' },
              inventory: { tierTypeName },
            }
          }
        }
      }
    }
  })

  // 1) 上游页面日期停留在昨日：不调 Bungie、保留昨日有效商品并标记 stale，admin me 可见
  feedMode = 'oldDate'
  const oldDateRes = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(oldDateRes.ok, 0)
  assert.match(oldDateRes.error, /尚未刷新/)
  assert.equal(bungieCalls, 0)
  assert.equal(adaCalls, 0)
  const docAfterOld = h.store.counters.get('rotation')
  assert.equal(docAfterOld.items[0].name, '昨日有效商品')
  assert.equal(docAfterOld.stale.cycleStart, win.cycleStart)
  const pubAfterOld = h.published['destiny2-starside/rotation/eververse.json']
  assert.equal(pubAfterOld.items[0].name, '昨日有效商品')
  assert.equal(pubAfterOld.stale.cycleStart, win.cycleStart)
  assert.equal(pubAfterOld.history, undefined)
  assert.equal(pubAfterOld.adaHistory, undefined)
  h.signIn('lv2', 2)
  const meStale = await h.as('lv2', { a: 'me' })
  assert.equal(meStale.stale.eververse.cycleStart, win.cycleStart)

  // 2) 页面日期看似今天但商品签名命中近7天历史：同样拒绝并保留旧数据
  feedMode = 'dupSig'
  const dupRes = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0110' })
  assert.equal(dupRes.ok, 0)
  assert.match(dupRes.error, /重复/)
  assert.equal(bungieCalls, 0)

  // 3) 02:03 重试上游已更新：同步成功、裁剪历史到 7 天 / 4 周、复用本周艾达（零 Bungie 艾达请求）、清除 stale
  feedMode = 'current'
  const okRes = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0103' })
  assert.equal(okRes.ok, 1)
  assert.equal(okRes.skipped, undefined)
  assert.equal(adaCalls, 1)
  assert.equal(bungieCalls, ROTATION_SLOTS.length, '本周艾达复用缓存，仅拉取光尘/银币槽位的 Bungie API')
  const docAfterOk = h.store.counters.get('rotation')
  assert.equal(docAfterOk.fresh, true)
  assert.equal(docAfterOk.stale, null)
  assert.equal(docAfterOk.sig, curSig)
  assert.equal(docAfterOk.history.length, 7)
  assert.equal(docAfterOk.history[0].sig, curSig)
  assert.equal(docAfterOk.adaHistory.length, 4)
  assert.equal(h.published['destiny2-starside/rotation/eververse.json'].history, undefined)
  assert.equal(h.published['destiny2-starside/rotation/eververse.json'].adaHistory, undefined)
  assert.equal(h.published['destiny2-starside/rotation/eververse.json'].stale, undefined)
  const meClean = await h.as('lv2', { a: 'me' })
  assert.equal(meClean.stale, undefined)

  // 4) 同周期再次定时触发：快速幂等跳过，零 Bungie 请求
  const callsBeforeSkip = bungieCalls
  const skipRes = await h.main({ Type: 'Timer', TriggerName: 'eververse-daily-0110' })
  assert.equal(skipRes.ok, 1)
  assert.equal(skipRes.skipped, 1)
  assert.equal(bungieCalls, callsBeforeSkip)

  // 5) 管理员强制刷新 (force=true) 可绕过跳过逻辑重拉
  const forceRes = await h.as('lv2', { a: 'sync_rotation', force: true })
  assert.equal(forceRes.ok, 1)
  assert.equal(forceRes.skipped, undefined)
  assert.ok(bungieCalls > callsBeforeSkip)
})

test('xur: timer trigger xur-sat-0103 syncs weekly inventory via Bungie official API with recommended perks and publishes rotation/xur.json to static hosting', async () => {
  const { XUR_SLOTS, XUR_FEED_URL } = require(path.join(root, 'tools/sync-xur.js'))
  const xurHtml = `<script id="kyber-xur-inline-data">\nwindow.KYBER_XUR_DATA = ${JSON.stringify({ slots: XUR_SLOTS, location: 'Bazaar, Tower' })};\n</script>`
  const h = harness({}, {
    async fetch(url) {
      if (url === XUR_FEED_URL) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { content: { rendered: xurHtml } }
          }
        }
      }
      if (url.includes('/Destiny2/Vendors/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              Response: {
                vendors: { data: { '2190858386': { vendorHash: 2190858386, enabled: true } } },
                sales: {
                  data: {
                    '2190858386': {
                      saleItems: {
                        '8': { vendorItemIndex: 8, itemHash: 2405271937, costs: [{ itemHash: 800069450, quantity: 41 }] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      assert.ok(m, 'unexpected url: ' + url)
      const hash = Number(m[1])
      if (hash === 800069450) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              Response: {
                itemTypeDisplayName: '货币',
                displayProperties: { name: '奇异硬币', icon: '/icons/coin.jpg' },
                inventory: { tierTypeName: '奇异' },
                classType: 3
              }
            }
          }
        }
      }
      if (hash === 2779821308) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              Response: {
                itemTypeDisplayName: '斥候步枪',
                displayProperties: { name: '布瑞亚之爱', icon: '/icons/wpn.jpg' },
                inventory: { tierTypeName: '传说' },
                classType: 3
              }
            }
          }
        }
      }
      if (hash === 2272927194) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              Response: {
                itemTypeDisplayName: '特性',
                displayProperties: { name: '顺畅换弹', icon: '/icons/perk.jpg' },
                inventory: { tierTypeName: '普通' },
                classType: 3
              }
            }
          }
        }
      }
      return {
        ok: true, status: 200,
        async json() {
          return {
            Response: {
              itemTypeDisplayName: '头盔',
              displayProperties: { name: '测试物品' + hash, icon: '/icons/armor.jpg' },
              inventory: { tierTypeName: '异域' },
              classType: 0
            }
          }
        }
      }
    }
  })

  const timerRes = await h.main({ Type: 'Timer', TriggerName: 'xur-sat-0103' })
  assert.equal(timerRes.ok, 1)
  assert.equal(timerRes.total, 47)

  h.signIn('lv2', 2)
  const adminSync = await h.as('lv2', { a: 'sync_xur' })
  assert.equal(adminSync.ok, 1)
  assert.equal(adminSync.total, 47)

  assert.equal((await h.main({ httpMethod: 'GET', queryStringParameters: { a: 'xur' } })).statusCode, 400)
  const body = h.published['destiny2-starside/rotation/xur.json']
  assert.ok(body, '同步后发布到静态托管 rotation/xur.json')
  assert.equal(body.total, 47)
  assert.equal(body.location, '高塔 · 集市')
  const wpn = body.items.find((x) => x.hash === 2779821308)
  assert.ok(wpn, 'legendary weapon present')
  const perkCol = wpn.cols.find((c) => c.lb === '特性1')
  assert.ok(perkCol, '特性1 column present')
  const recPerk = perkCol.ops.find((o) => o.h === 2272927194)
  assert.equal(recPerk.name, '顺畅换弹')
  assert.equal(recPerk.rec, 1, 'recommended perk carries rec=1 from xur-recs.json')

  // 上游仍返回上一周的 arrival 时直接抛错拒绝覆盖
  const staleHtml = `<script id="kyber-xur-inline-data">\nwindow.KYBER_XUR_DATA = ${JSON.stringify({ slots: XUR_SLOTS, location: 'Bazaar, Tower', arrival: '2020-01-03T17:00:00Z' })};\n</script>`
  const hStale = harness({}, {
    async fetch(url) {
      if (url === XUR_FEED_URL) {
        return { ok: true, status: 200, async json() { return { content: { rendered: staleHtml } } } }
      }
      throw new Error('unexpected url: ' + url)
    }
  })
  const staleRes = await hStale.main({ Type: 'Timer', TriggerName: 'xur-sat-0103' })
  assert.equal(staleRes.ok, 0)
  assert.match(staleRes.error, /尚未刷新至本周周期/)
})

test('xur: 4-week history in counters/xur, idempotent retry, and duplicate signature rejection', async () => {
  const { XUR_SLOTS, XUR_FEED_URL, currentXurWindow, xurSignature } = require(path.join(root, 'tools/sync-xur.js'))
  const wk = currentXurWindow()
  const altSlots = XUR_SLOTS.map((s, i) => (i === 0 ? { ...s, cost: '999 Strange Coins' } : s))
  const preHistory = Array.from({ length: 4 }, (_, i) => ({
    arrival: `2026-01-0${i + 1}T17:00:00Z`,
    sig: i === 3 ? xurSignature({ slots: altSlots, location: 'Bazaar, Tower' }) : ('old-xur-' + i),
    total: 47,
    updatedAt: '2026-01-01T17:03:00Z',
  }))

  let mode = 'dupSig'
  let bungieCalls = 0
  const h = harness({
    counters: [{
      _id: 'xur',
      arrival: '2026-01-04T17:00:00Z',
      departure: '2026-01-07T17:00:00Z',
      location: '高塔 · 集市',
      updatedAt: '2026-01-04T17:03:00Z',
      total: 47,
      items: [{ name: '上周有效物品', hash: 1 }],
      history: preHistory,
    }]
  }, {
    async fetch(url) {
      if (url === XUR_FEED_URL) {
        const payload = mode === 'dupSig'
          ? { slots: altSlots, location: 'Bazaar, Tower', arrival: wk.arrival }
          : { slots: XUR_SLOTS, location: 'Bazaar, Tower', arrival: wk.arrival }
        const html = `<script id="kyber-xur-inline-data">\nwindow.KYBER_XUR_DATA = ${JSON.stringify(payload)};\n</script>`
        return { ok: true, status: 200, async json() { return { content: { rendered: html } } } }
      }
      bungieCalls++
      if (url.includes('/Destiny2/Vendors/')) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              Response: {
                vendors: { data: { '2190858386': { vendorHash: 2190858386, enabled: true } } },
                sales: { data: { '2190858386': { saleItems: {} } } }
              }
            }
          }
        }
      }
      const m = /DestinyInventoryItemDefinition\/(\d+)\//.exec(url)
      assert.ok(m, 'unexpected url: ' + url)
      const hsh = Number(m[1])
      if (hsh === 2779821308) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              Response: {
                itemTypeDisplayName: '斥候步枪',
                displayProperties: { name: '测验步枪', icon: '/icons/ar.jpg' },
                inventory: { tierTypeName: '传说' },
                classType: 3
              }
            }
          }
        }
      }
      return {
        ok: true, status: 200,
        async json() {
          return {
            Response: {
              itemTypeDisplayName: '物品',
              displayProperties: { name: 'Xur物品_' + hsh, icon: '/icons/xur_' + hsh + '.jpg' },
              inventory: { tierTypeName: '异域' },
              classType: 3
            }
          }
        }
      }
    }
  })

  // 1) 上游本周 arrival 已变但商品签名撞进近 4 周历史：不调 Bungie、保留旧物并记 stale
  const dupRes = await h.main({ Type: 'Timer', TriggerName: 'xur-sat-0103' })
  assert.equal(dupRes.ok, 0)
  assert.match(dupRes.error, /重复/)
  assert.equal(bungieCalls, 0)
  const docAfterDup = h.store.counters.get('xur')
  assert.equal(docAfterDup.items[0].name, '上周有效物品')
  assert.equal(docAfterDup.stale.arrival, wk.arrival)

  // 2) 重试拉到新本周数据：成功、保留 4 周 history、清除 stale、公开 JSON 不含 history
  mode = 'fresh'
  const okRes = await h.main({ Type: 'Timer', TriggerName: 'xur-sat-retry' })
  assert.equal(okRes.ok, 1)
  assert.equal(okRes.skipped, undefined)
  assert.ok(bungieCalls > 0)
  const docAfterOk = h.store.counters.get('xur')
  assert.equal(docAfterOk.fresh, true)
  assert.equal(docAfterOk.stale, null)
  assert.equal(docAfterOk.history.length, 4)
  assert.equal(h.published['destiny2-starside/rotation/xur.json'].history, undefined)
  assert.equal(h.published['destiny2-starside/rotation/xur.json'].stale, undefined)

  // 3) 同周再次触发：幂等跳过
  const callsBeforeSkip = bungieCalls
  const skipRes = await h.main({ Type: 'Timer', TriggerName: 'xur-sat-retry' })
  assert.equal(skipRes.ok, 1)
  assert.equal(skipRes.skipped, 1)
  assert.equal(bungieCalls, callsBeforeSkip)
})

test('armor-rng: manifest plugSet alignment, 23-column bijection, and Cuirass empirical case', async () => {
  const ArmorRng = require(path.join(site, 'assets/armor-rng.js'))
  const plugSets = JSON.parse(fs.readFileSync(path.join(root, 'data/lookup/plug-sets.json'), 'utf8'))
  const invItems = JSON.parse(fs.readFileSync(path.join(root, 'data/inventory-items.json'), 'utf8'))

  // 1. 12 archetypes in plugSet 1315181101 must match order, hash, and Chinese/English names
  const archPlugs = plugSets['1315181101'].reusablePlugItems.map((x) => x.plugItemHash)
  assert.equal(ArmorRng.ARCHETYPES.length, 12)
  assert.deepEqual(ArmorRng.ARCHETYPES.map((a) => a.hash), archPlugs)
  for (const a of ArmorRng.ARCHETYPES) {
    const item = invItems[String(a.hash)]
    assert.ok(item, 'missing archetype in inventory-items.json: ' + a.hash)
    assert.equal(a.name, item.i18n['zh-CN'].name)
    assert.equal(a.en, item.i18n.en.name)
    assert.equal(a.tert.length, 4)
    assert.ok(!a.tert.includes(a.pri) && !a.tert.includes(a.sec))
  }

  // 2. 6 tertiary stats (+20 tier) in plugSet 445741600 must match order and hashes
  const tertPlugs = plugSets['445741600'].reusablePlugItems.slice(-6).map((x) => x.plugItemHash)
  assert.deepEqual(ArmorRng.STATS.map((s) => s.hash), tertPlugs)

  // 3. Bijection across all 23 X columns via Paragon (1) + Colossus (12) dual-read
  for (let x = 1; x <= 23; x++) {
    const p = ArmorRng.xOfGhost(1, x)
    const c = ArmorRng.xOfGhost(12, x)
    assert.equal(ArmorRng.pcToX(p, c), x, `pcToX bijection failed at X=${x}`)
    const ys = ArmorRng.xToYList(x)
    assert.ok(ys.length >= 1 && ys.length <= 2)
    for (const y of ys) {
      assert.ok(ArmorRng.yToXList(y).includes(x), `yToXList(${y}) must include X=${x}`)
    }
  }

  // 4. Empirical case from odo's paper: Cuirass of the Falling Star (X=15, Y=8 Siegebreaker, t.map=2)
  assert.equal(ArmorRng.pcToX(4, 12), 15)
  assert.deepEqual(ArmorRng.xToYList(15), [8])
  assert.equal(ArmorRng.tMapOf(4, 3), 2) // Brawler + Grenade -> t.map = 2
  const expectedCuirass = [
    [1, 'Brawler', 'Grenade'],
    [2, 'Brawler', 'Grenade'],
    [3, 'Brawler', 'Grenade'],
    [4, 'Brawler', 'Grenade'],
    [5, 'Gunner', 'Super'],
    [6, 'Specialist', 'Grenade'],
    [7, 'Reaver', 'Health'],
    [8, 'Siegebreaker', 'Super'],
    [9, 'Demolitionist', 'Health'],
    [10, 'Skirmisher', 'Grenade'],
    [11, 'Powerhouse', 'Grenade'],
    [12, 'Colossus', 'Grenade']
  ]
  for (const [g, archEn, tertEn] of expectedCuirass) {
    const outArchId = ArmorRng.xOfGhost(g, 15)
    const roll = ArmorRng.rollOf(outArchId, 2)
    assert.equal(roll.arch.en, archEn, `Cuirass ghost=${g} archetype mismatch`)
    assert.equal(roll.tert.en, tertEn, `Cuirass ghost=${g} tertiary mismatch`)
  }

  // 5. Scenario 1 priority filter: exact (+30, +25, +20) match vs swapped-slot fallback
  const exactPrio = ArmorRng.filterCombosByPriority([1, 3, 4]) // 武器(+30) > 手雷(+25) > 超能(+20)
  assert.equal(exactPrio.filter((c) => c.exactOrder).length, 1)
  assert.equal(exactPrio[0].exactOrder, true)
  assert.equal(exactPrio[0].roll.arch.en, 'Gunner')
  assert.equal(exactPrio[0].roll.tert.en, 'Super')

  const swapPrio = ArmorRng.filterCombosByPriority([4, 1, 3]) // 超能(+30) > 武器(+25) > 手雷(+20)（无超能+武器官方原型）
  assert.equal(swapPrio.filter((c) => c.exactOrder).length, 0)
  assert.equal(swapPrio.length, 3)
  assert.deepEqual(swapPrio.map((c) => c.roll.arch.en), ['Powerhouse', 'Grenadier', 'Gunner'])

  // 6. Deduplicated outcome grouping: X=15 merges mods 1..4 into Brawler (4), giving 9 unique rolls (4..12)
  const cuirassRes = ArmorRng.solveFromObservations([{ modId: 0, archId: 8, tertStat: 4 }, { modId: 1, archId: 4 }])
  const groups = ArmorRng.groupOutcomes(cuirassRes.candidates)
  assert.deepEqual(groups.map((g) => g.archId), [4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.ok(groups.every((g) => g.certain === true))

  // 7. DOM mount renders 13 Ghost mod buttons (unmod + 12 pairs) and 6x6x6 stat buttons without archetype names
  const prevDoc = global.document
  global.document = {}
  try {
    const host = { innerHTML: '', addEventListener() {} }
    const api = ArmorRng.mount(host, { itemName: '泰坦 · 坠星胸甲' })
    assert.ok(api && typeof api.setItemName === 'function')
    assert.match(host.innerHTML, /泰坦 · 坠星胸甲/)
    assert.equal((host.innerHTML.match(/data-pick-mod="/g) || []).length, 13)
    assert.deepEqual(
      [...host.innerHTML.matchAll(/data-pick-pri="(\d)"/g)].map((m) => Number(m[1])),
      [2, 6, 3, 4, 5, 1]
    )
    assert.equal((host.innerHTML.match(/data-pick-sec="/g) || []).length, 6)
    assert.equal((host.innerHTML.match(/data-pick-tert="/g) || []).length, 6)
    assert.doesNotMatch(host.innerHTML, /楷模|突围者|高能者|掷雷手|搏击手|掠夺者|爆破专家|装甲兵/)
  } finally {
    if (prevDoc === undefined) delete global.document
    else global.document = prevDoc
  }
})

test('rota: pointer drag tracks continuously and snaps with momentum on release', () => {
  const src = fs.readFileSync(path.join(site, 'assets/rota.js'), 'utf8')
    .replace('export default function init', 'function init')
  let now = 1000
  const stageListeners = {}
  const boxListeners = {}
  const cards = []
  const stage = {
    classes: new Set(),
    classList: {
      add(c) { stage.classes.add(c) },
      remove(c) { stage.classes.delete(c) },
    },
    appendChild(el) { cards.push(el) },
    setPointerCapture() {},
    addEventListener(type, fn) { stageListeners[type] = fn },
  }
  const box = {
    className: '',
    innerHTML: '',
    querySelector(sel) { return sel === '.rota-stage' ? stage : null },
    addEventListener(type, fn) { boxListeners[type] = fn },
  }
  const table = {
    dataset: { rota: '2026.1.7 1:00' },
    parentNode: { insertBefore() {} },
    querySelectorAll(sel) {
      if (sel === 'tbody tr') {
        return ['玻璃拱顶', '最后一愿', '深石地窖', '门徒誓约', '国王的陨落', '克洛塔的末日', '救赎的边缘', '救赎花园']
          .map((r, i) => ({ children: [{ textContent: String(i + 1) }, { textContent: r }, { textContent: '地牢' + (i + 1) }] }))
      }
      if (sel === 'thead th') {
        return [{ textContent: '#' }, { textContent: '突袭' }, { textContent: '地牢' }]
      }
      return []
    },
  }
  const ctx = {
    Date,
    Math,
    Number,
    Object,
    Infinity,
    performance: { now: () => now },
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame() {},
    document: {
      querySelectorAll: () => [],
      createElement(tag) {
        if (box.className === '') return box
        const classes = new Set()
        return {
          tag,
          className: '',
          innerHTML: '',
          hidden: false,
          style: {},
          classList: {
            toggle(c, on) { if (on) classes.add(c); else classes.delete(c) },
            has(c) { return classes.has(c) },
          },
          getBoundingClientRect() { return { left: 0, right: 720, top: 189, bottom: 329 } },
          remove() { const idx = cards.indexOf(this); if (idx >= 0) cards.splice(idx, 1) },
        }
      },
    },
  }
  vm.runInNewContext(src, ctx)
  ctx.init(table, { tuck() {} })

  const midCard = () => cards.find((c) => c.classList.has('is-mid'))
  const initialMid = midCard()
  assert.ok(initialMid, '初始应有一张居中卡片')
  assert.match(initialMid.innerHTML, /class="rota-ico"/)
  assert.match(initialMid.innerHTML, /--bg:url\(/)

  // 校验 ROTA_ART 中全部 9 突袭 + 10 地牢的小图标与场景底图在盘上都存在
  const artMatch = src.match(/var ROTA_ART = (\{[\s\S]*?\});/)
  assert.ok(artMatch, 'rota.js 应定义 ROTA_ART')
  const artMap = vm.runInNewContext('(' + artMatch[1] + ')')
  for (const [name, [ico, bg]] of Object.entries(artMap)) {
    const icoPath = path.resolve(site, 'rotation', 'icons', ico + '.webp')
    const bgPath = path.resolve(site, 'rotation', bg)
    assert.ok(fs.existsSync(icoPath), `${name} 小图标不存在: ${icoPath}`)
    assert.ok(fs.existsSync(bgPath), `${name} 场景底图不存在: ${bgPath}`)
  }

  // 按住向上拖 150px（约 1 周间距 PITCH）：拖过 5px 进入 is-dragging，松手吸附到下一周
  stageListeners.pointerdown({ button: 0, pointerId: 1, clientX: 360, clientY: 250 })
  now += 16
  stageListeners.pointermove({ pointerId: 1, clientX: 360, clientY: 240 })
  assert.equal(stage.classes.has('is-dragging'), true, '超过 5px 应进入拖拽态')
  now += 80
  stageListeners.pointermove({ pointerId: 1, clientX: 360, clientY: 100 })
  stageListeners.pointerup({ pointerId: 1, clientX: 360, clientY: 100 })
  assert.equal(stage.classes.has('is-dragging'), false, '松手后应退出拖拽态')
  const afterDragMid = midCard()
  assert.notEqual(afterDragMid.innerHTML, initialMid.innerHTML, '向上拖过一周距离后居中卡片应切换到下一周')
})
