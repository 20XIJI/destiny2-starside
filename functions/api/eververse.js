#!/usr/bin/env node
/**
 * 永恒之诗官方模式更新脚本。
 * 纯官方 API 直连：通过 Bungie API DestinyInventoryItemDefinition 接口并发拉取官方中文字段、类型、品质与 CDN 图标。
 */

const fs = require('fs')
const path = require('path')

const BUNGIE_API_ROOT = 'https://www.bungie.net/Platform'
const BUNGIE_CDN_ROOT = 'https://www.bungie.net'

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

// 今日 26 个轮换槽位的主键表与商品结构约束
// 每个槽位绑定对应的子商人表 (vendorHash)、预期品质 (expectedTier) 与预期类型关键字 (expectedType)，防止同名异物或槽位错位
const ROTATION_SLOTS = [
  // 主要光尘优惠 8 件
  { hash: 296103153, vendorHash: 2168194999, group: '主要光尘优惠', currency: 'dust', cost: 1250, isWide: true, expectedTier: 'exotic', expectedType: '武器皮肤' },
  { hash: 3654808012, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '泰坦皮肤' },
  { hash: 929374195, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '猎人皮肤' },
  { hash: 3778646768, vendorHash: 2031393824, group: '主要光尘优惠', currency: 'dust', cost: 1500, isWide: true, expectedTier: 'exotic', expectedType: '术士皮肤' },
  { hash: 554648945, vendorHash: 4020265966, group: '主要光尘优惠', currency: 'dust', cost: 2000, isWide: true, expectedTier: 'exotic', expectedType: '飞船' },
  { hash: 1836636207, vendorHash: 1105106638, group: '主要光尘优惠', currency: 'dust', cost: 2500, isWide: true, expectedTier: 'exotic', expectedType: '载具' },
  { hash: 3269282583, vendorHash: 3118972542, group: '主要光尘优惠', currency: 'dust', cost: 3250, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 527607311, vendorHash: 3702989297, group: '主要光尘优惠', currency: 'dust', cost: 2850, isWide: false, expectedTier: 'exotic', expectedType: '机灵外壳' },

  // 其他光尘优惠 10 件
  { hash: 4157484206, vendorHash: 2184482416, group: '其他光尘优惠', currency: 'dust', cost: 1250, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 2580533670, vendorHash: 2184482416, group: '其他光尘优惠', currency: 'dust', cost: 3250, isWide: false, expectedTier: 'legendary', expectedType: '终结技' },
  { hash: 1357354098, vendorHash: 1446296883, group: '其他光尘优惠', currency: 'dust', cost: 1500, isWide: false, expectedTier: 'legendary', expectedType: '机灵投影' },
  { hash: 919688649, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 1087971716, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 2450544934, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 1363705632, vendorHash: 2041776156, group: '其他光尘优惠', currency: 'dust', cost: 300, isWide: false, expectedTier: 'legendary', expectedType: '着色器' },
  { hash: 2493836485, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 450, isWide: false, expectedTier: 'legendary', expectedType: '传送效果' },
  { hash: 3393212813, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 450, isWide: false, expectedTier: 'legendary', expectedType: '传送效果' },
  { hash: 1281013974, vendorHash: 213864513, group: '其他光尘优惠', currency: 'dust', cost: 150, isWide: false, expectedTier: 'rare', expectedType: '传送效果' },

  // 银币新品 8 件
  { hash: 292872941, vendorHash: 1400187966, group: '银币新品', currency: 'silver', cost: 800, isWide: true, expectedTier: 'exotic', expectedType: '飞船' },
  { hash: 4002999939, vendorHash: 2739911710, group: '银币新品', currency: 'silver', cost: 800, isWide: true, expectedTier: 'exotic', expectedType: '载具' },
  { hash: 1229033176, vendorHash: 3445703438, group: '银币新品', currency: 'silver', cost: 1000, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 392758338, vendorHash: 3445703438, group: '银币新品', currency: 'silver', cost: 1000, isWide: false, expectedTier: 'exotic', expectedType: '动作' },
  { hash: 2222909939, vendorHash: 3358239265, group: '银币新品', currency: 'silver', cost: 600, isWide: false, expectedTier: 'exotic', expectedType: '机灵外壳' },
  { hash: 1143446663, vendorHash: 4228941413, group: '银币新品', currency: 'silver', cost: 500, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 3166802179, vendorHash: 4228941413, group: '银币新品', currency: 'silver', cost: 800, isWide: false, expectedTier: 'legendary', expectedType: '动作' },
  { hash: 1785547370, vendorHash: 249262409, group: '银币新品', currency: 'silver', cost: 800, isWide: false, expectedTier: 'legendary', expectedType: '终结技' }
]

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
  const res = await fetch(url, {
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

async function syncEververse(apiKey, slots = ROTATION_SLOTS) {
  if (!apiKey) throw new Error('missing BUNGIE_API_KEY')
  const validItems = await Promise.all(slots.map((s, idx) => fetchItem(s, idx, apiKey)))
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

module.exports = { ROTATION_SLOTS, fetchItem, syncEververse }

if (require.main === module) {
  run()
}

