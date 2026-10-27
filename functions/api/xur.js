#!/usr/bin/env node
/**
 * 老九（Xûr / 仄）周货官方模式更新脚本。
 * 纯 Bungie 官方 API 直连：通过 Destiny2/Vendors/?components=400,402 核验老九主商人 (2190858386) 实时销售状态，
 * 并通过 DestinyInventoryItemDefinition/<hash>/?lc=zh-chs 并发拉取全部商品与武器随机 Perk 插槽的官方简体中文名称、分类、品质与 CDN 图标，
 * 同时结合站内装备库推荐表 (xur-recs.json) 自动标注传说武器的推荐 Perk (1=Aegis, 2=小棒猪, 3=双推) 与大师杰作。
 */

const fs = require("fs")
const path = require("path")

const BUNGIE_API_ROOT = "https://www.bungie.net/Platform"
const BUNGIE_CDN_ROOT = "https://www.bungie.net"
const XUR_VENDOR_HASH = 2190858386
const XUR_FEED_URL = "https://public-api.wordpress.com/wp/v2/sites/kyberscorner.com/pages/6261?_fields=modified,content"

const CLASS_ZH = { "-1": "通用", 0: "泰坦", 1: "猎人", 2: "术士", 3: "通用" }
const TIER_ZH = {
  Exotic: "异域",
  Legendary: "传说",
  Rare: "稀有",
  Uncommon: "罕见",
  Common: "基础",
  Basic: "基础"
}
const CLS_EN_ZH = { Any: "通用", Titan: "泰坦", Hunter: "猎人", Warlock: "术士" }

const ARMOR_KW = ["护甲", "头盔", "臂甲", "臂铠", "披风", "猎戏", "印记", "臂环"]
const COL_LB = {
  intrinsics: "固有特性",
  barrels: "枪管",
  blades: "刀刃",
  tubes: "发射管",
  magazines: "弹匣",
  magazines_gl: "弹匣",
  guards: "护手",
  hafts: "弓臂",
  origins: "原始特性",
  scopes: "瞄具",
  stocks: "枪托",
  grips: "握把",
  batteries: "电池",
  frames: "特性"
}
const SKIP_KW = ["记录器", "计数器"]
const MW_RE = /^\s*(\d+)\s*阶\s*[:：]\s*(.+?)\s*$/

const LOCATION_ZH = {
  "Bazaar, Tower": "高塔 · 集市",
  "Hangar, Tower": "高塔 · 机库",
  "Winding Cove, EDZ": "欧洲无人区 · 蜿蜒海湾",
  "Watcher's Grave, Nessus": "涅索斯 · 守望者之墓",
  Tower: "高塔"
}

// 本周老九 47 个周货槽位与武器随机 Perk 矩阵（主商人 2190858386、奇异装备子商人 3751514131、更多奇异优惠子商人 537912098）
const XUR_SLOTS = [{"hash":4255001288,"vendorHash":2190858386,"classType":"Hunter","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":553093017,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":553093017}]}]},{"hash":2405271937,"vendorHash":2190858386,"classType":"Hunter","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":1694242450,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1694242450}]}]},{"hash":2809120022,"vendorHash":2190858386,"classType":"Hunter","costs":[{"hash":800069450,"quantity":41}]},{"hash":53126580,"vendorHash":2190858386,"classType":"Titan","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":3241194941,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":3241194941}]}]},{"hash":4157369212,"vendorHash":2190858386,"classType":"Titan","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":1358612221,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1358612221}]}]},{"hash":266021826,"vendorHash":2190858386,"classType":"Titan","costs":[{"hash":800069450,"quantity":41}]},{"hash":1003391927,"vendorHash":2190858386,"classType":"Warlock","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":1149655156,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1149655156}]}]},{"hash":3864952146,"vendorHash":2190858386,"classType":"Warlock","costs":[{"hash":800069450,"quantity":41}],"sockets":[{"plugHash":1095471953,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1095471953}]}]},{"hash":2273643087,"vendorHash":2190858386,"classType":"Warlock","costs":[{"hash":800069450,"quantity":41}]},{"hash":3856705927,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":23}],"sockets":[{"plugHash":213689231,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":213689231}]},{"plugHash":3661387068,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":3661387068}]},{"plugHash":1431678320,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":1431678320}]},{"plugHash":2846385770,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2846385770}]},{"plugHash":3438534621,"plugCategoryIdentifier":"grips","reusablePlugs":[{"hash":3438534621}]}]},{"hash":3437746471,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":23}],"sockets":[{"plugHash":1030990989,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1030990989}]},{"plugHash":1482024992,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":1482024992}]},{"plugHash":3142289711,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":3142289711}]},{"plugHash":2383960413,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2383960413}]},{"plugHash":1012699414,"plugCategoryIdentifier":"grips","reusablePlugs":[{"hash":1012699414}]}]},{"hash":4190156464,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":23}],"sockets":[{"plugHash":656200654,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":656200654}]},{"plugHash":3661387068,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":3661387068}]},{"plugHash":2420895100,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":2420895100}]},{"plugHash":2333607307,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2333607307}]},{"plugHash":4259401308,"plugCategoryIdentifier":"stocks","reusablePlugs":[{"hash":4259401308}]}]},{"hash":1508896098,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":23}],"sockets":[{"plugHash":2473404935,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":2473404935}]},{"plugHash":1478423395,"plugCategoryIdentifier":"tubes","reusablePlugs":[{"hash":1478423395}]},{"plugHash":2420895100,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":2420895100}]},{"plugHash":1178686995,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":1178686995}]},{"plugHash":3465198467,"plugCategoryIdentifier":"stocks","reusablePlugs":[{"hash":3465198467}]}]},{"hash":2088466608,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":71}]},{"hash":924149235,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":71}]},{"hash":2779821308,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":1636108362,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1636108362}]},{"plugHash":4090651448,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":4090651448},{"hash":3250034553}]},{"plugHash":1087426260,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":1087426260},{"hash":1431678320}]},{"plugHash":2272927194,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2272927194}]},{"plugHash":4104185692,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":4104185692}]},{"plugHash":150943607,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.range","reusablePlugs":[{"hash":150943607},{"hash":150943604}]},{"plugHash":2565067140,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":2565067140}]}]},{"hash":1886840007,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":1294026524,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1294026524}]},{"plugHash":839105230,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":839105230},{"hash":3661387068}]},{"plugHash":2749775325,"plugCategoryIdentifier":"batteries","reusablePlugs":[{"hash":2749775325},{"hash":732557052}]},{"plugHash":776531651,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":776531651}]},{"plugHash":2319119708,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2319119708}]},{"plugHash":1590375901,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.stability","reusablePlugs":[{"hash":1590375901},{"hash":1590375902}]},{"plugHash":253121539,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":253121539}]}]},{"hash":577528837,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":3364911712,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":3364911712}]},{"plugHash":839105230,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":839105230},{"hash":3250034553}]},{"plugHash":1087426260,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":1087426260},{"hash":3230963543}]},{"plugHash":1820235745,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":1820235745}]},{"plugHash":2726471870,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2726471870}]},{"plugHash":150943607,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.range","reusablePlugs":[{"hash":150943607},{"hash":150943604}]}]},{"hash":3371413056,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":263649945,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":263649945}]},{"plugHash":1261178282,"plugCategoryIdentifier":"blades","reusablePlugs":[{"hash":1261178282},{"hash":938542991}]},{"plugHash":2363751990,"plugCategoryIdentifier":"guards","reusablePlugs":[{"hash":2363751990}]},{"plugHash":2590710093,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2590710093}]},{"plugHash":3523296417,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":3523296417}]},{"plugHash":1486919755,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.damage","reusablePlugs":[{"hash":1486919755},{"hash":1486919752}]},{"plugHash":1905044254,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":1905044254}]}]},{"hash":1097616550,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":1525239159,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1525239159}]},{"plugHash":1840239774,"plugCategoryIdentifier":"barrels","reusablePlugs":[{"hash":1840239774},{"hash":1392496348}]},{"plugHash":2420895100,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":2420895100},{"hash":1431678320}]},{"plugHash":3643424744,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":3643424744}]},{"plugHash":2458213969,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":2458213969}]},{"plugHash":1590375901,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.stability","reusablePlugs":[{"hash":1590375901},{"hash":1590375902}]}]},{"hash":4195186942,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":3419274965,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":3419274965}]},{"plugHash":1478423395,"plugCategoryIdentifier":"tubes","reusablePlugs":[{"hash":1478423395},{"hash":981914802}]},{"plugHash":2985827016,"plugCategoryIdentifier":"magazines_gl","reusablePlugs":[{"hash":2985827016},{"hash":1996142143}]},{"plugHash":951095735,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":951095735}]},{"plugHash":4104185692,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":4104185692}]},{"plugHash":150943607,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.range","reusablePlugs":[{"hash":150943607},{"hash":150943604}]},{"plugHash":253121539,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":253121539}]}]},{"hash":4224667951,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":3468089894,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":3468089894}]},{"plugHash":1844523823,"plugCategoryIdentifier":"tubes","reusablePlugs":[{"hash":1844523823},{"hash":3798852852}]},{"plugHash":3492396210,"plugCategoryIdentifier":"magazines_gl","reusablePlugs":[{"hash":3492396210},{"hash":3796465595}]},{"plugHash":3977735242,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":3977735242}]},{"plugHash":4104185692,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":4104185692}]},{"plugHash":150943607,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.range","reusablePlugs":[{"hash":150943607},{"hash":150943604}]},{"plugHash":2041432007,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":2041432007}]}]},{"hash":1197771438,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":385138649,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":385138649}]},{"plugHash":1478423395,"plugCategoryIdentifier":"tubes","reusablePlugs":[{"hash":1478423395},{"hash":3525010810}]},{"plugHash":2822142346,"plugCategoryIdentifier":"magazines_gl","reusablePlugs":[{"hash":2822142346},{"hash":3492396210}]},{"plugHash":1556840489,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":1556840489}]},{"plugHash":3523296417,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":3523296417}]},{"plugHash":150943607,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.range","reusablePlugs":[{"hash":150943607},{"hash":150943604}]},{"plugHash":253121539,"plugCategoryIdentifier":"origins","reusablePlugs":[{"hash":253121539}]}]},{"hash":1835747805,"vendorHash":3751514131,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"sockets":[{"plugHash":1322370662,"plugCategoryIdentifier":"intrinsics","reusablePlugs":[{"hash":1322370662}]},{"plugHash":1926090095,"plugCategoryIdentifier":"scopes","reusablePlugs":[{"hash":1926090095},{"hash":1926090093}]},{"plugHash":1087426260,"plugCategoryIdentifier":"magazines","reusablePlugs":[{"hash":1087426260},{"hash":106909392}]},{"plugHash":706527188,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":706527188}]},{"plugHash":3523296417,"plugCategoryIdentifier":"frames","reusablePlugs":[{"hash":3523296417}]},{"plugHash":518224747,"plugCategoryIdentifier":"v400.plugs.weapons.masterworks.stat.handling","reusablePlugs":[{"hash":518224747},{"hash":518224744}]}]},{"hash":1604556427,"vendorHash":3751514131,"classType":"Hunter","costs":[{"hash":800069450,"quantity":29}]},{"hash":2697887125,"vendorHash":3751514131,"classType":"Hunter","costs":[{"hash":800069450,"quantity":29}]},{"hash":1343009820,"vendorHash":3751514131,"classType":"Hunter","costs":[{"hash":800069450,"quantity":29}]},{"hash":385833378,"vendorHash":3751514131,"classType":"Hunter","costs":[{"hash":800069450,"quantity":29}]},{"hash":445076215,"vendorHash":3751514131,"classType":"Hunter","costs":[{"hash":800069450,"quantity":29}]},{"hash":262826703,"vendorHash":3751514131,"classType":"Titan","costs":[{"hash":800069450,"quantity":29}]},{"hash":2347181257,"vendorHash":3751514131,"classType":"Titan","costs":[{"hash":800069450,"quantity":29}]},{"hash":1883377784,"vendorHash":3751514131,"classType":"Titan","costs":[{"hash":800069450,"quantity":29}]},{"hash":2639123099,"vendorHash":3751514131,"classType":"Titan","costs":[{"hash":800069450,"quantity":29}]},{"hash":1934339678,"vendorHash":3751514131,"classType":"Titan","costs":[{"hash":800069450,"quantity":29}]},{"hash":1504698788,"vendorHash":3751514131,"classType":"Warlock","costs":[{"hash":800069450,"quantity":29}]},{"hash":4172973116,"vendorHash":3751514131,"classType":"Warlock","costs":[{"hash":800069450,"quantity":29}]},{"hash":3520307277,"vendorHash":3751514131,"classType":"Warlock","costs":[{"hash":800069450,"quantity":29}]},{"hash":3558781766,"vendorHash":3751514131,"classType":"Warlock","costs":[{"hash":800069450,"quantity":29}]},{"hash":2248528889,"vendorHash":3751514131,"classType":"Warlock","costs":[{"hash":800069450,"quantity":29}]},{"hash":3853748946,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":5}],"forceSec":"材料"},{"hash":3853748946,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":11}],"forceSec":"材料"},{"hash":4257549984,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":31}],"forceSec":"材料"},{"hash":903043774,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":23}],"forceSec":"材料"},{"hash":3159615086,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":7}],"forceSec":"材料"},{"hash":3282419336,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"forceSec":"材料"},{"hash":4049195331,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":17}],"forceSec":"材料"},{"hash":3691823069,"vendorHash":537912098,"classType":"Any","costs":[{"hash":800069450,"quantity":7}],"forceSec":"材料"}]

function getApiKey() {
  if (process.env.BUNGIE_API_KEY) return process.env.BUNGIE_API_KEY
  const envPath = path.resolve(__dirname, "../.env.local")
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8")
    const match = text.match(/^\s*BUNGIE_API_KEY\s*=\s*(.+)$/m)
    if (match) return match[1].trim()
  }
  return null
}

function loadRecs() {
  const candidates = [
    path.resolve(__dirname, "./xur-recs.json"),
    path.resolve(__dirname, "../tools/xur-recs.json")
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"))
    }
  }
  throw new Error("未找到老九词条推荐表 xur-recs.json")
}

function absUrl(p) {
  if (!p) return ""
  return p.startsWith("http") ? p : BUNGIE_CDN_ROOT + (p.startsWith("/") ? "" : "/") + p
}

function formatName(s) {
  if (!s) return ""
  return String(s)
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2")
}

function xurSec(tier, ty, name) {
  if (!ty.includes("任务") && (name.endsWith("催化") || ty.includes("催化"))) {
    return "异域武器催化"
  }
  if (ty.includes("记忆水晶")) {
    return "材料"
  }
  if (tier === "异域" && ["披风", "印记", "臂环", "猎戏"].some((k) => ty.includes(k))) {
    return "职业金"
  }
  const isArmor = ARMOR_KW.some((k) => ty.includes(k))
  if (tier === "异域") {
    if (isArmor) return "异域护甲"
    return ty.includes("任务") ? "任务" : "异域武器"
  }
  if (tier === "传说" && !isArmor) {
    if (ty.includes("材料") || ty.includes("可兑换") || ty.includes("消耗品")) return "材料"
    return ty.includes("任务") ? "任务" : "传说武器"
  }
  if (isArmor) return "传说护甲"
  if (ty.includes("材料") || ty.includes("可兑换") || ty.includes("消耗品") || ty.includes("货币")) return "材料"
  if (ty.includes("任务")) return "任务"
  return "其他"
}

function currentXurWindow() {
  const now = new Date()
  // 老九每周五 17:00 UTC（北京时间周六 01:00）抵达，周二 17:00 UTC（北京时间周三 01:00）离开
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const arrival = new Date(now)
  arrival.setUTCHours(17, 0, 0, 0)
  // 回溯到最近一个周五 17:00 UTC
  let diff = (day - 5 + 7) % 7
  if (diff === 0 && hour < 17) diff = 7
  arrival.setUTCDate(arrival.getUTCDate() - diff)
  const departure = new Date(arrival.getTime() + 4 * 86400e3)
  return {
    arrival: arrival.toISOString().replace(/\.\d{3}Z$/, "Z"),
    departure: departure.toISOString().replace(/\.\d{3}Z$/, "Z")
  }
}

async function sleep(ms) {
  if (typeof setTimeout === "function") {
    await new Promise((r) => setTimeout(r, ms))
  }
}

async function fetchWithRetry(url, options, retries = 3) {
  let lastErr = null
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const sig = (!options || !options.signal) && typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? AbortSignal.timeout(15000) : undefined
      const res = await fetch(url, sig ? { ...options, signal: sig } : options)
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

async function fetchLiveXurInput() {
  const res = await fetchWithRetry(XUR_FEED_URL, {
    headers: { "User-Agent": "StarsideCloudXur/1.0" }
  })
  if (!res.ok) throw new Error(`老九轮换源 HTTP ${res.status}`)
  const data = await res.json()
  const html = data?.content?.rendered || ""
  if (!html) throw new Error("老九轮换源 content.rendered 为空")
  const m = /window\.KYBER_XUR_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i.exec(html)
  if (!m) throw new Error("老九轮换源未找到 KYBER_XUR_DATA 脚本块")
  const parsed = JSON.parse(m[1])
  const norm = normalizeInput(parsed)
  if (!norm.slots || norm.slots.length < 10) {
    throw new Error(`老九轮换源解析条目不足：仅解析出 ${norm.slots ? norm.slots.length : 0} 件`)
  }
  if (norm.arrival) {
    const feedArrivalMs = Date.parse(norm.arrival)
    const expectedArrivalMs = Date.parse(currentXurWindow().arrival)
    if (Number.isFinite(feedArrivalMs) && Number.isFinite(expectedArrivalMs) && feedArrivalMs < expectedArrivalMs) {
      throw new Error(`老九轮换源尚未刷新至本周周期（源 arrival=${norm.arrival}，期望 >= ${currentXurWindow().arrival}）`)
    }
  }
  return parsed
}

async function fetchBungieVendorState(apiKey) {
  const url = `${BUNGIE_API_ROOT}/Destiny2/Vendors/?components=400,402`
  const res = await fetchWithRetry(url, {
    headers: {
      "X-API-Key": apiKey,
      "User-Agent": "StarsideCloudXur/1.0"
    }
  })
  if (!res.ok) throw new Error(`Bungie Vendors HTTP ${res.status}`)
  const data = await res.json()
  const v = data?.Response?.vendors?.data?.[String(XUR_VENDOR_HASH)] || null
  const sales = data?.Response?.sales?.data?.[String(XUR_VENDOR_HASH)]?.saleItems || {}
  const liveCostByHash = new Map()
  for (const s of Object.values(sales)) {
    if (s.itemHash && Array.isArray(s.costs) && s.costs.length) {
      liveCostByHash.set(Number(s.itemHash), {
        hash: s.costs[0].itemHash,
        quantity: s.costs[0].quantity
      })
    }
  }
  return { vendor: v, liveCostByHash }
}

async function fetchDefMap(hashes, apiKey) {
  const unique = [...new Set(hashes.map(String).filter((h) => h && h !== "0"))]
  const map = new Map()
  const BATCH = 4
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH)
    await Promise.all(
      slice.map(async (h) => {
        const url = `${BUNGIE_API_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${h}/?lc=zh-chs`
        const res = await fetchWithRetry(url, {
          headers: {
            "X-API-Key": apiKey,
            "User-Agent": "StarsideCloudXur/1.0"
          }
        })
        if (!res.ok) throw new Error(`Bungie Manifest Hash ${h} HTTP ${res.status}`)
        const data = await res.json()
        const r = data?.Response || {}
        const dp = r.displayProperties || {}
        const inv = r.inventory || {}
        const tierRaw = inv.tierTypeName || ""
        const tier = tierRaw.includes("异域")
          ? "异域"
          : tierRaw.includes("传说")
            ? "传说"
            : tierRaw.includes("稀有")
              ? "稀有"
              : "基础"
        map.set(h, {
          name: formatName(dp.name || ""),
          rawName: dp.name || "",
          type: r.itemTypeDisplayName || "",
          tier,
          icon: absUrl(dp.icon || ""),
          screenshot: absUrl(r.screenshot || ""),
          classType: typeof r.classType === "number" ? r.classType : -1
        })
      })
    )
  }
  return map
}

function normalizeInput(input) {
  if (Array.isArray(input)) {
    return { slots: input, arrival: null, departure: null, location: null }
  }
  if (input && typeof input === "object") {
    if (Array.isArray(input.slots)) {
      return {
        slots: input.slots,
        arrival: input.arrival || null,
        departure: input.departure || null,
        location: input.location || null
      }
    }
    const groups = [
      ...(input.exoticArmor || []),
      ...(input.hawkmoon || []),
      ...(input.exoticWeapons || []),
      ...(input.catalysts || []),
      ...(input.legendaryWeapons || []),
      ...(input.legendaryArmor || []),
      ...(input.strangeOffers || []).map((x) => ({ ...x, forceSec: "材料" }))
    ]
    return {
      slots: groups,
      arrival: input.arrival || null,
      departure: input.departure || null,
      location: (input.location && input.location.name) || input.location || null
    }
  }
  return { slots: [], arrival: null, departure: null, location: null }
}

function collectHashes(input) {
  const { slots } = normalizeInput(input)
  const hashes = new Set(["800069450"])
  for (const src of slots) {
    if (src.hash) hashes.add(String(src.hash))
    for (const c of src.costs || []) {
      if (c.hash) hashes.add(String(c.hash))
    }
    for (const s of src.sockets || []) {
      const cat = String(s.plugCategoryIdentifier || "")
      const tail = cat.split(".").pop()
      if (!cat.includes("masterworks.stat") && !COL_LB[tail]) continue
      if (s.plugHash) hashes.add(String(s.plugHash))
      for (const r of s.reusablePlugs || []) {
        if (r.hash) hashes.add(String(r.hash))
      }
    }
  }
  return [...hashes]
}

function cleanXur(input, defMap, recs, liveCostByHash = null) {
  const norm = normalizeInput(input)
  function resolvePlug(ph, fallbackName, fallbackIcon, wRecBits) {
    if (!ph) return null
    const d = defMap.get(String(ph))
    const name = (d && d.name) || formatName(fallbackName || "")
    if (!name || SKIP_KW.some((k) => name.includes(k))) return null
    const icon = (d && d.icon) || absUrl(fallbackIcon || "")
    const key = name.replace(/\s+/g, "")
    const rec = wRecBits ? (wRecBits[key] || 0) : 0
    const out = { h: Number(ph), name, icon }
    if (rec) out.rec = rec
    return out
  }

  function extractPlugs(src, cats, wRecBits) {
    const out = []
    for (const s of src.sockets || []) {
      const cat = String(s.plugCategoryIdentifier || "").split(".").pop()
      if (!cats.includes(cat)) continue
      const p = resolvePlug(s.plugHash, s.name, s.icon, wRecBits)
      if (p) out.push(p)
    }
    return out
  }

  function extractRoll(src, wRec) {
    const wRecBits = (wRec && wRec[0]) || null
    const wRecMw = (wRec && wRec[1]) || []
    const cols = []
    let mw = null
    let nf = 0
    for (const s of src.sockets || []) {
      const raw = String(s.plugCategoryIdentifier || "")
      if (!raw || !s.plugHash) continue
      if (raw.includes("masterworks")) {
        if (raw.includes("masterworks.stat")) {
          const p = resolvePlug(s.plugHash, s.name, s.icon, null)
          if (p) {
            const m = MW_RE.exec(p.name)
            const statName = m ? m[2] : p.name
            const isRecMw = wRecMw.some((w) => statName.startsWith(w) || w.startsWith(statName))
            mw = {
              stat: statName,
              tier: m ? Number(m[1]) : 0,
              icon: p.icon,
              rec: isRecMw ? 1 : 0
            }
          }
        }
        continue
      }
      const cat = raw.split(".").pop()
      let lb = COL_LB[cat]
      if (!lb) continue
      let act = Number(s.plugHash)
      const ops = []
      for (const r of s.reusablePlugs || []) {
        if (!r.hash) continue
        const o = resolvePlug(r.hash, r.name, r.icon, wRecBits)
        if (!o) continue
        ops.push(o)
      }
      const p = resolvePlug(s.plugHash, s.name, s.icon, wRecBits)
      if (p) {
        if (!ops.some((o) => o.h === p.h)) ops.unshift(p)
        act = p.h
      }
      if (!ops.length) continue
      if (cat === "frames") {
        nf += 1
        lb = `特性${nf}`
      }
      cols.push({ lb, act, ops })
    }
    return { cols, mw }
  }

  const items = []
  let idx = 0
  for (const src of norm.slots) {
    const h = String(src.hash || "")
    if (h === "3581456570") continue
    const d = defMap.get(h)
    const name = (d && d.name) || formatName(src.name || "")
    if (!name) continue
    const ty = (d && d.type) || src.subtype || src.type || ""
    const tier = (d && d.tier) || TIER_ZH[src.tier] || "传说"
    const clsNum = d && typeof d.classType === "number" ? d.classType : -1
    const cls = CLASS_ZH[clsNum] !== undefined && clsNum !== -1
      ? CLASS_ZH[clsNum]
      : (CLS_EN_ZH[src.classType] || "通用")
    const icon = (d && d.icon) || absUrl(src.icon || "")
    const shot = (d && d.screenshot) || absUrl(src.screenshot || "")

    let cost = null
    const liveCost = liveCostByHash && liveCostByHash.get(Number(h))
    const rawCosts = liveCost ? [liveCost] : (src.costs || [])
    for (const cc of rawCosts) {
      const cd = defMap.get(String(cc.hash || "800069450"))
      cost = {
        n: Number(cc.quantity || 0),
        cur: (cd && cd.name) || cc.name || "奇异硬币",
        icon: (cd && cd.icon) || absUrl(cc.icon || "")
      }
      break
    }

    const sec = src.forceSec || xurSec(tier, ty, name)
    if (sec === "任务") continue

    const wRec = recs[h] || null
    const it = {
      hash: Number(h),
       vendorHash: src.vendorHash || XUR_VENDOR_HASH,
      idx: idx++,
      n: name,
      ty,
      tier,
      cls,
      icon,
      shot: shot || null,
      cost,
      sec
    }

    if (wRec && Array.isArray(wRec[2]) && (wRec[2][0] || wRec[2][1])) {
      it.grades = wRec[2]
    }

    if (sec === "异域武器" || sec === "传说武器") {
      const wRecBits = (wRec && wRec[0]) || null
      it.intr = extractPlugs(src, ["intrinsics"], null)[0] || null
      it.plugs = extractPlugs(src, ["barrels", "tubes", "blades", "scopes", "magazines", "magazines_gl", "guards", "frames", "grips", "stocks"], wRecBits)
      it.rolled = (src.sockets || []).some((s) => {
        const id = String(s.plugCategoryIdentifier || "")
        const tail = id.split(".").pop()
        return (tail === "frames" || tail === "grips") && (id.endsWith("grips") || (s.reusablePlugs || []).length > 1)
      })
      if (sec === "传说武器") {
        const { cols, mw } = extractRoll(src, wRec)
        it.cols = cols
        it.mw = mw
      }
    }

    items.push(it)
  }

  let armorSetName = "传说护甲套装"
  const firstLegArmor = items.find((x) => x.sec === "传说护甲")
  if (firstLegArmor && firstLegArmor.n.length >= 2) {
    armorSetName = firstLegArmor.n.slice(0, 2) + "套装"
  }

  const win = currentXurWindow()
  const rawLoc = norm.location || "Bazaar, Tower"
  const locZh = LOCATION_ZH[rawLoc] || rawLoc || "高塔 · 集市"

  return {
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    arrival: norm.arrival || win.arrival,
    departure: norm.departure || win.departure,
    location: locZh,
    cycleNote: "每周六 01:00 抵达 · 周三 01:00 离开",
    armorSetName,
    total: items.length,
    items
  }
}

async function syncXur(apiKey, customData = null) {
  if (!apiKey) throw new Error("missing BUNGIE_API_KEY")
  const input = customData || await fetchLiveXurInput()
  const { liveCostByHash } = await fetchBungieVendorState(apiKey)
  const hashes = collectHashes(input)
  if (!hashes.length) throw new Error("老九周货槽位为空")
  const defMap = await fetchDefMap(hashes, apiKey)
  const recs = loadRecs()
  const payload = cleanXur(input, defMap, recs, liveCostByHash)
  if (!payload.items || payload.items.length < 10) {
    throw new Error(`清洗后的老九商品数量异常 (${payload.items ? payload.items.length : 0})`)
  }
  return payload
}

async function run() {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.error("【错误】未配置 BUNGIE_API_KEY。")
    process.exit(1)
  }
  const argFile = process.argv[2] && fs.existsSync(process.argv[2]) ? process.argv[2] : null
  const customData = argFile ? JSON.parse(fs.readFileSync(argFile, "utf8")) : null

  console.log("1. 正在通过官方 Bungie API (Destiny2/Vendors & DestinyInventoryItemDefinition) 拉取老九（Xûr）全部中文定义与图标...")
  const payload = await syncXur(apiKey, customData)

  const dest = path.resolve(__dirname, "../site/rotation/xur.json")
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(payload, null, 2), "utf8")

  const stat = {}
  for (const it of payload.items) stat[it.sec] = (stat[it.sec] || 0) + 1
  console.log(`2. ✓ 老九周货官方 API 更新完成！共 ${payload.total} 件 (${Object.entries(stat).map(([k, v]) => `${k} ${v}`).join("、")})`)
  console.log(`3. 已落盘: ${dest}`)
}

module.exports = { XUR_SLOTS, XUR_FEED_URL, fetchLiveXurInput, syncXur, cleanXur, collectHashes }

if (require.main === module) {
  run()
}
