#!/usr/bin/env node
/**
 * 永恒之诗官方模式抓取脚本。
 * 运行时与 CloudBase 云函数 (Node.js) 100% 保持一致，使用原生 fetch。
 * 纯 API 直连，零本地数据库依赖，自动提取 Bungie 官方简体中文与 CDN 图标。
 */

const fs = require('fs')
const path = require('path')

const BUNGIE_API_ROOT = 'https://www.bungie.net/Platform'
const BUNGIE_CDN_ROOT = 'https://www.bungie.net'
const BRIGHT_DUST_HASH = 2817410917 // Bungie 光尘货币 Hash
const SILVER_HASH = 3147280338      // Bungie 银币货币 Hash

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

function nextWeeklyReset() {
  const now = new Date()
  const day = now.getUTCDay()
  const daysAhead = (1 - day + 7) % 7
  const candidate = new Date(now)
  candidate.setUTCDate(now.getUTCDate() + daysAhead)
  candidate.setUTCHours(17, 0, 0, 0)
  if (candidate <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 7)
  }
  return candidate.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function fetchItemDefinition(itemHash, apiKey) {
  const url = `${BUNGIE_API_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/?lc=zh-chs`
  try {
    const res = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'StarsideEververseFetcher/1.0'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const resp = data?.Response || {}
    const dp = resp.displayProperties || {}
    const inv = resp.inventory || {}
    const tierName = inv.tierTypeName || ''
    const tier = tierName.includes('异域') ? 'exotic' : (tierName.includes('稀有') ? 'rare' : 'legendary')
    const type = resp.itemTypeDisplayName || '装饰品'
    const rawIcon = dp.icon || ''
    const icon = rawIcon ? (rawIcon.startsWith('http') ? rawIcon : BUNGIE_CDN_ROOT + rawIcon) : ''

    // 皮肤、载具、飞船类展示为宽卡片
    const isWide = /皮肤|快雀|飞船|载具/.test(type)

    return {
      name: dp.name || `未知物品 ${itemHash}`,
      type,
      tier,
      isWide,
      icon
    }
  } catch (err) {
    return {
      name: `物品 ${itemHash}`,
      type: '装饰品',
      tier: 'legendary',
      isWide: false,
      icon: ''
    }
  }
}

async function fetchRotation(apiKey) {
  console.log('1. 连接 Bungie API 获取永恒之诗商人定义...')
  const url = `${BUNGIE_API_ROOT}/Destiny2/Manifest/DestinyVendorDefinition/3361454721/?lc=zh-chs`
  const res = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      'User-Agent': 'StarsideEververseFetcher/1.0'
    }
  })

  if (!res.ok) {
    throw new Error(`连接 Bungie 失败: HTTP ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (json.ErrorCode !== 1) {
    throw new Error(`Bungie 业务错误: ${json.Message} (ErrorCode: ${json.ErrorCode})`)
  }

  const itemList = json?.Response?.itemList || []
  console.log(`2. 响应成功，总条目数 ${itemList.length}，正在提取官方槽位条目...`)

  // 1. 光尘条目
  const dustList = itemList.filter(it =>
    (it.currencies || []).some(c => c.itemHash === BRIGHT_DUST_HASH)
  )

  // 2. 银币条目
  const silverList = itemList.filter(it =>
    (it.currencies || []).some(c => c.itemHash === SILVER_HASH)
  )

  console.log(`3. 命中 ${dustList.length} 件光尘商品，${silverList.length} 件银币商品。`)
  console.log(`4. 正在按 8 件主要光尘 + 10 件其他光尘 + 8 件银币新品（共 26 件）并发拉取官方中文字段与 CDN 图标...`)

  const primaryDust = dustList.slice(0, 8)
  const secondaryDust = dustList.slice(8, 18)
  const newSilver = silverList.slice(0, 8)

  const processItems = async (items, groupName, currencyType, currencyHash) => {
    return Promise.all(
      items.map(async (it) => {
        const def = await fetchItemDefinition(it.itemHash, apiKey)
        const costObj = (it.currencies || []).find(c => c.itemHash === currencyHash)
        const cost = costObj ? costObj.quantity : null
        return {
          name: def.name,
          type: def.type,
          tier: def.tier,
          cost: cost,
          group: groupName,
          currency: currencyType,
          isWide: def.isWide,
          icon: def.icon
        }
      })
    )
  }

  const [pItems, sItems, silItems] = await Promise.all([
    processItems(primaryDust, '主要光尘优惠', 'dust', BRIGHT_DUST_HASH),
    processItems(secondaryDust, '其他光尘优惠', 'dust', BRIGHT_DUST_HASH),
    processItems(newSilver, '银币新品', 'silver', SILVER_HASH)
  ])

  const allItems = [...pItems, ...sItems, ...silItems]

  return {
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    resetAt: nextWeeklyReset(),
    cycleNote: '每天 01:00 刷新',
    total: allItems.length,
    items: allItems
  }
}

async function main() {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.error('【错误】未检测到 BUNGIE_API_KEY。')
    process.exit(1)
  }

  try {
    const payload = await fetchRotation(apiKey)
    console.log('\n========================================================================================')
    console.log(`✓ 官方模式拉取完成！共 ${payload.items.length} 件官方商品 (下次重置: ${payload.resetAt})`)
    console.log('========================================================================================')
    console.table(payload.items.map((it, idx) => ({
      '#': idx + 1,
      '分组': it.group,
      '官方中文名称': it.name,
      '类型': it.type,
      '品质': it.tier,
      '价格': it.cost !== null ? it.cost : '-',
      '货币': it.currency,
      '宽卡片': it.isWide ? '是' : '否'
    })))

    const dest = path.resolve(__dirname, '../site/rotation/eververse.json')
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`\n✓ 已通过官方模式更新落盘: ${dest} (大小: ${fs.statSync(dest).size} 字节)`)
  } catch (err) {
    console.error('抓取失败:', err.message)
    process.exit(1)
  }
}

main()
