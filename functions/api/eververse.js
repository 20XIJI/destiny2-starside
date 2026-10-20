#!/usr/bin/env node
/**
 * 永恒之诗官方模式更新脚本。
 * 纯官方 API 直连：通过 Bungie API DestinyInventoryItemDefinition 接口并发拉取官方中文字段、类型、品质与 CDN 图标。
 */

const fs = require('fs')
const path = require('path')

const BUNGIE_API_ROOT = 'https://www.bungie.net/Platform'
const BUNGIE_CDN_ROOT = 'https://www.bungie.net'
const EVERVERSE_FEED_URL = 'https://public-api.wordpress.com/wp/v2/sites/kyberscorner.com/pages/47643?_fields=modified,content'

function getApiKey() {
  if (process.env.BUNGIE_API_KEY) return process.env.BUNGIE_API_KEY
  const envPath = path.resolve(__dirname, '../.env.local')
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8')
    const match = text.match(/^\s*BUNGIE_API_KEY\s*=\s*(.+)$/m)
    if (match) return match[1].trim()
  }
  return null
}

// 每日 26 个轮换槽位的主键表与商品结构约束
// 每个槽位绑定对应的子商人表 (vendorHash)、预期品质 (expectedTier) 与预期类型关键字 (expectedType)，防止同名异物或槽位错位
const ROTATION_SLOTS = [
  // 主要光尘优惠 8 件
  { hash: 1395580616, vendorHash: 2168194999, group: '主要光尘优惠', currency: 'dust', cost: 1250, isWide: true, expectedTier: 'exotic', expectedType: '武器皮肤' },
  { hash: 1185631823, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '泰坦皮肤' },
  { hash: 2413288976, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '猎人皮肤' },
  { hash: 3736112681, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '术士皮肤' },
  { hash: 2988472427, vendorHash: 4020265966, group: '主要光尘优惠', currency: 'dust', cost: 2000, isWide: true, expectedTier: 'exotic', expectedType: '飞船' },
  { hash: 340680574, vendorHash: 1105106638, group: '主要光尘优惠', currency: 'dust', cost: 2500, isWide: true, expectedTier: 'exotic', expectedType: '载具' },
  { hash: 3157963939, vendorHash: 3118972542, group: '主要光尘优惠', currency: 'dust', cost: 3250, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 3105072597, vendorHash: 3702989297, group: '主要光尘优惠', currency: 'dust', cost: 2850, isWide: false, expectedTier: 'exotic', expectedType: '机灵外壳' },

  // 其他光尘优惠 10 件
  { hash: 1748123669, vendorHash: 1446296883, group: '其他光尘优惠', currency: 'dust', cost: 1500, isWide: false, expectedTier: 'legendary', expectedType: '机灵投影' },
  { hash: 4080789277, vendorHash: 2184482416, group: '其他光尘优惠', currency: 'dust', cost: 700, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 2195752360, vendorHash: 2184482416, group: '其他光尘优惠', currency: 'dust', cost: 700, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 3344147835, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 3906243540, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 2776737690, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 343789488, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 3186457725, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 450, isWide: false, expectedTier: 'legendary', expectedType: '传送效果' },
  { hash: 1091850349, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 450, isWide: false, expectedTier: 'legendary', expectedType: '传送效果' },
  { hash: 1866581851, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 450, isWide: false, expectedTier: 'legendary', expectedType: '传送效果' },

  // 银币新品 8 件
  { hash: 2990668491, vendorHash: 3358239265, group: '银币新品', currency: 'silver', cost: 600, isWide: false, expectedTier: 'exotic', expectedType: '机灵外壳' },
  { hash: 4205434519, vendorHash: 2739911710, group: '银币新品', currency: 'silver', cost: 800, isWide: true, expectedTier: 'exotic', expectedType: '载具' },
  { hash: 2110175464, vendorHash: 1400187966, group: '银币新品', currency: 'silver', cost: 800, isWide: true, expectedTier: 'exotic', expectedType: '飞船' },
  { hash: 2352869761, vendorHash: 4228941413, group: '银币新品', currency: 'silver', cost: 500, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 2218275250, vendorHash: 3445703438, group: '银币新品', currency: 'silver', cost: 1000, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 588138826, vendorHash: 4228941413, group: '银币新品', currency: 'silver', cost: 500, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 3771412616, vendorHash: 3445703438, group: '银币新品', currency: 'silver', cost: 1200, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 3431752854, vendorHash: 249262409, group: '银币新品', currency: 'silver', cost: 800, isWide: false, expectedTier: 'legendary', expectedType: '终结技' }
]

async function sleep(ms) {
  if (typeof setTimeout === 'function') {
    await new Promise((r) => setTimeout(r, ms))
  }
}

async function fetchWithRetry(url, options, retries = 3) {
  let lastErr = null
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status} (${url})`)
        await sleep(400 * attempt)
        continue
      }
      return res
    } catch (err) {
      const detail = err?.cause ? `${err.message} (${err.cause.code || err.cause.message || err.cause})` : (err?.message || String(err))
      lastErr = new Error(`网络请求失败 [${attempt}/${retries}] ${url}: ${detail}`)
      if (attempt < retries) {
        await sleep(500 * attempt)
      }
    }
  }
  throw lastErr
}

function mapExpectedType(enType = '', category = '') {
  const t = enType.toLowerCase()
  const c = category.toLowerCase()
  if (t.includes('weapon ornament') || c.includes('weapon ornament')) return { expectedType: '武器皮肤', vendorHash: 2168194999, isWide: true, order: 1 }
  if (t.includes('titan') || c.includes('titan')) return { expectedType: '泰坦皮肤', vendorHash: 2031393824, isWide: true, order: 2 }
  if (t.includes('hunter') || c.includes('hunter')) return { expectedType: '猎人皮肤', vendorHash: 2031393824, isWide: true, order: 3 }
  if (t.includes('warlock') || c.includes('warlock')) return { expectedType: '术士皮肤', vendorHash: 2031393824, isWide: true, order: 4 }
  if (t.includes('ship') || c === 'ships') return { expectedType: '飞船', vendorHash: 4020265966, isWide: true, order: 5 }
  if (t.includes('vehicle') || c === 'sparrows') return { expectedType: '载具', vendorHash: 1105106638, isWide: true, order: 6 }
  if (t.includes('ghost shell') || c === 'ghost shells') return { expectedType: '机灵外壳', vendorHash: 3702989297, isWide: false, order: 8 }
  if (t.includes('ghost projection') || c === 'ghost projections') return { expectedType: '机灵投影', vendorHash: 1446296883, isWide: false, order: 9 }
  if (t.includes('finisher') || c === 'finishers') return { expectedType: '终结技', vendorHash: 2184482416, isWide: false, order: 10 }
  if (t.includes('emote') || c === 'emotes') return { expectedType: '动作', vendorHash: 3118972542, isWide: false, order: 7 }
  if (t.includes('shader') || c === 'shaders') return { expectedType: '着色器', vendorHash: 2041776156, isWide: false, order: 11 }
  if (t.includes('transmat') || c.includes('transmat')) return { expectedType: '传送效果', vendorHash: 213864513, isWide: false, order: 12 }
  return { expectedType: '', vendorHash: 3361454721, isWide: false, order: 99 }
}

async function fetchLiveSlots() {
  const res = await fetchWithRetry(EVERVERSE_FEED_URL, {
    headers: { 'User-Agent': 'StarsideCloudEververse/1.0' }
  })
  if (!res.ok) throw new Error(`永恒之诗轮换源 HTTP ${res.status}`)
  const data = await res.json()
  const html = data?.content?.rendered || ''
  if (!html) throw new Error('永恒之诗轮换源 content.rendered 为空')

  const re = /data-ke-item=(?:"([^"]+)"|'([^']+)')/g
  let m
  const rawItems = []
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || m[2])
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    const parsed = JSON.parse(raw)
    const linkMatch = /\/items\/(\d+)/.exec(parsed.link || '') || /\/screenshots\/(\d+)\.jpg/.exec(parsed.screenshot || '')
    if (!linkMatch) continue
    const hash = Number(linkMatch[1])
    const currency = parsed.market === 'silver' ? 'silver' : 'dust'
    const costMatch = String(parsed.cost || '').replace(/,/g, '').match(/(\d+)/)
    const cost = costMatch ? Number(costMatch[1]) : null
    const rawTier = String(parsed.tier || '').toLowerCase()
    const expectedTier = rawTier.includes('exotic') ? 'exotic' : (rawTier.includes('rare') ? 'rare' : 'legendary')
    const meta = mapExpectedType(parsed.itemType || '', parsed.category || '')
    rawItems.push({
      hash,
      vendorHash: meta.vendorHash,
      currency,
      cost,
      isWide: meta.isWide || Boolean(parsed.screenshot),
      expectedTier,
      expectedType: meta.expectedType,
      _order: meta.order
    })
  }

  if (rawItems.length < 18) {
    throw new Error(`永恒之诗轮换源解析条目不足：仅解析出 ${rawItems.length} 件`)
  }

  const mainDust = rawItems
    .filter((it) => it.currency === 'dust' && it.expectedTier === 'exotic')
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...rest }) => ({ ...rest, group: '主要光尘优惠' }))

  const otherDust = rawItems
    .filter((it) => it.currency === 'dust' && it.expectedTier !== 'exotic')
    .map(({ _order, ...rest }) => ({ ...rest, group: '其他光尘优惠' }))

  const silverNew = rawItems
    .filter((it) => it.currency === 'silver')
    .map(({ _order, ...rest }) => ({ ...rest, group: '银币新品' }))

  return [...mainDust, ...otherDust, ...silverNew]
}

function nextDailyReset() {
  const now = new Date()
  const candidate = new Date(now)
  candidate.setUTCHours(17, 0, 0, 0)
  if (candidate <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }
  return candidate.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function fetchItem(slot, idx, apiKey) {
  const url = `${BUNGIE_API_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${slot.hash}/?lc=zh-chs`
  const res = await fetchWithRetry(url, {
    headers: {
      'X-API-Key': apiKey,
      'User-Agent': 'StarsideCloudEververse/1.0'
    }
  })
  if (!res.ok) throw new Error(`槽位 #${idx + 1} (${slot.hash}) HTTP ${res.status}`)
  const data = await res.json()
  const r = data?.Response || {}
  const dp = r.displayProperties || {}
  const inv = r.inventory || {}

  const tierName = inv.tierTypeName || ''
  const tier = tierName.includes('异域') ? 'exotic' : (tierName.includes('稀有') ? 'rare' : 'legendary')
  const type = r.itemTypeDisplayName || ''
  const rawIcon = dp.icon || ''
  const icon = rawIcon ? (rawIcon.startsWith('http') ? rawIcon : BUNGIE_CDN_ROOT + rawIcon) : ''
  const rawShot = r.screenshot || ''
  const screenshot = rawShot ? (rawShot.startsWith('http') ? rawShot : BUNGIE_CDN_ROOT + rawShot) : null

  const rawName = dp.name || `物品 ${slot.hash}`
  const name = String(rawName)
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2')

  // 强校验：禁止子职业 (itemType === 20)、品质不符、类型不符或缺失图标的条目静默混入
  if (r.itemType === 20 || type.includes('分支职业')) {
    throw new Error(`槽位 #${idx + 1} (${slot.hash} "${name}") 命中了分支职业 (${type})，非永恒之诗商品`)
  }
  if (slot.expectedTier && tier !== slot.expectedTier) {
    throw new Error(`槽位 #${idx + 1} (${slot.hash} "${name}") 品质不匹配：期望 ${slot.expectedTier}，实际 ${tier} (${tierName})`)
  }
  if (slot.expectedType && !type.includes(slot.expectedType)) {
    throw new Error(`槽位 #${idx + 1} (${slot.hash} "${name}") 类型不匹配：期望包含 "${slot.expectedType}"，实际 "${type}"`)
  }
  if (!icon) {
    throw new Error(`槽位 #${idx + 1} (${slot.hash} "${name}") 缺失官方图标`)
  }

  return {
    hash: slot.hash,
    vendorHash: slot.vendorHash,
    name,
    type,
    tier,
    cost: slot.cost,
    group: slot.group,
    currency: slot.currency,
    isWide: slot.isWide || Boolean(screenshot),
    icon,
    screenshot
  }
}

async function syncEververse(apiKey, customSlots = null) {
  if (!apiKey) throw new Error('missing BUNGIE_API_KEY')
  const slots = customSlots || await fetchLiveSlots()
  if (!Array.isArray(slots) || !slots.length) {
    throw new Error('永恒之诗轮换槽位为空')
  }
  const validItems = []
  const BATCH = 4
  for (let i = 0; i < slots.length; i += BATCH) {
    const chunk = slots.slice(i, i + BATCH)
    const part = await Promise.all(chunk.map((s, j) => fetchItem(s, i + j, apiKey)))
    validItems.push(...part)
  }
  const now = new Date()
  const lastReset = new Date(now)
  lastReset.setUTCHours(17, 0, 0, 0)
  if (lastReset > now) {
    lastReset.setUTCDate(lastReset.getUTCDate() - 1)
  }
  const cycleStart = lastReset.toISOString().replace(/\.\d{3}Z$/, 'Z')

  return {
    updatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    cycleStart,
    resetAt: nextDailyReset(),
    cycleNote: '每天 01:00 刷新',
    total: validItems.length,
    items: validItems
  }
}

async function run() {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.error('【错误】未配置 BUNGIE_API_KEY。')
    process.exit(1)
  }

  console.log('1. 正在通过官方 Bungie API 并发获取 26 个槽位条目的官方中文定义与图标...')
  const payload = await syncEververse(apiKey)
  console.log(`2. 成功获取并通过槽位特征强校验 ${payload.items.length} 件官方数据，正在落盘 payload...`)

  const dest = path.resolve(__dirname, '../site/rotation/eververse.json')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(payload, null, 2), 'utf8')

  console.log(`3. ✓ 官方模式更新完成！JSON 已落盘: ${dest}`)
  console.table(payload.items.map((it, idx) => ({
    '#': idx + 1,
    '分组': it.group,
    '官方名称': it.name,
    '官方分类': it.type,
    '品质': it.tier,
    '价格': it.cost !== null ? it.cost : '-',
    '货币': it.currency,
    '官方图标': it.icon
  })))
}

module.exports = { EVERVERSE_FEED_URL, ROTATION_SLOTS, fetchLiveSlots, fetchItem, syncEververse }

if (require.main === module) {
  run()
}

