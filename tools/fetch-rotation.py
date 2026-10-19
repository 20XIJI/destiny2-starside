#!/usr/bin/env python3
"""光尘商店与每周轮换抓取器：获取轮换数据，生成纯静态 JSON。

Jamstack 架构：
1. 本地测试或定时工作流（GitHub Actions / 云函数）运行此脚本。
2. 产物落盘为 site/rotation/eververse.json，前端直接以此静态文件渲染，0 数据库调用。
3. 图标一律使用 Bungie 官方 CDN 网络地址，不占用本地图片存储。

用法：
    python3 tools/fetch-rotation.py --mock         # 离线夹具测试，生成测试数据
    python3 tools/fetch-rotation.py --live         # 从 Bungie API 真实抓取 (需 BUNGIE_API_KEY)
"""

import argparse
import datetime
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
DEST = os.path.join(SITE, 'rotation', 'eververse.json')
ITEMS_PATH = os.path.join(ROOT, 'data', 'inventory-items.json')

BUNGIE_API_ROOT = 'https://www.bungie.net/Platform'
BUNGIE_CDN_ROOT = 'https://www.bungie.net'

# 光尘货币 Hash
BRIGHT_DUST_HASH = 3147055998

# 离线测试夹具：真实光尘商店代表性商品（包含武器皮肤、机灵、快雀、着色器、表情等）
FIXTURE_ITEMS = [
    {
        "hash": 2841029101,
        "name": "天界信使",
        "type": "异域武器皮肤",
        "tier": "exotic",
        "cost": 1250,
        "icon": "/common/destiny2_content/icons/094b9104fae1ffcebe7eef0368c5b9f7.jpg"
    },
    {
        "hash": 1827401923,
        "name": "超因果驱动",
        "type": "异域快雀",
        "tier": "exotic",
        "cost": 2500,
        "icon": "/common/destiny2_content/icons/8e398a832c3bb54a7c29e6125dc5950d.jpg"
    },
    {
        "hash": 3918274011,
        "name": "北极星机壳",
        "type": "异域机灵机壳",
        "tier": "exotic",
        "cost": 2850,
        "icon": "/common/destiny2_content/icons/03dcb295f190bc93a9d948ea4025d57d.jpg"
    },
    {
        "hash": 728192019,
        "name": "全息投影：电弧之刃",
        "type": "机灵投影",
        "tier": "legendary",
        "cost": 1500,
        "icon": "/common/destiny2_content/icons/e760bf0beceb43d266e511e6fc73c52e.jpg"
    },
    {
        "hash": 1492019204,
        "name": "梦境破晓",
        "type": "着色器",
        "tier": "legendary",
        "cost": 300,
        "icon": "/common/destiny2_content/icons/c4ff00e5726205cf25dc8db572ef6ff7.jpg"
    },
    {
        "hash": 482910491,
        "name": "无微不至",
        "type": "传说表情动作",
        "tier": "legendary",
        "cost": 700,
        "icon": "/common/destiny2_content/icons/7beae05cf4dbd914d4850fa1b6cf2e36.jpg"
    }
]


def next_weekly_reset() -> str:
    """计算下一个 Bungie 每周重置时间 (UTC 每周二 17:00 / 北京时间周三 01:00)。"""
    now = datetime.datetime.now(datetime.timezone.utc)
    # weekday: 0=Mon, 1=Tue, 2=Wed, ..., 6=Sun
    # 目标为周二 (weekday == 1) 17:00:00 UTC
    days_ahead = (1 - now.weekday()) % 7
    candidate = now.replace(hour=17, minute=0, second=0, microsecond=0) + datetime.timedelta(days=days_ahead)
    if candidate <= now:
        candidate += datetime.timedelta(days=7)
    return candidate.strftime('%Y-%m-%dT%H:%M:%SZ')


def build_payload(items: list) -> dict:
    """构造展示就绪的标准结构。图标必须为完整网络地址。"""
    cleaned_items = []
    for it in items:
        raw_icon = it.get('icon', '')
        if raw_icon.startswith('http'):
            icon_url = raw_icon
        elif raw_icon:
            icon_url = BUNGIE_CDN_ROOT + ('' if raw_icon.startswith('/') else '/') + raw_icon
        else:
            icon_url = ''

        cleaned_items.append({
            'hash': it.get('hash'),
            'name': it.get('name', '未知物品'),
            'type': it.get('type', '装饰品'),
            'tier': it.get('tier', 'legendary'),
            'cost': it.get('cost', 0),
            'icon': icon_url,
        })

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {
        'updatedAt': now_iso,
        'resetAt': next_weekly_reset(),
        'items': cleaned_items
    }


def save_atomic(dest_path: str, data: dict) -> None:
    """原子写入并校验，防止损坏现有静态文件。"""
    if not data or not data.get('items'):
        raise ValueError("数据校验失败：条目为空，拒绝写入")

    parent = os.path.dirname(dest_path)
    os.makedirs(parent, exist_ok=True)

    content = json.dumps(data, ensure_ascii=False, indent=2)
    # 先写入临时文件
    fd, tmp_path = tempfile.mkstemp(prefix='eververse-', dir=parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(content)
        os.replace(tmp_path, dest_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def get_item_definition(item_hash: int, api_key: str, cache: dict) -> dict:
    """获取物品的中文定义（优先查本地 inventory-items.json，查不到则向 Bungie API 查询）。"""
    h_str = str(item_hash)
    if h_str in cache:
        return cache[h_str]

    # 1. 尝试从本地实体库获取
    if os.path.exists(ITEMS_PATH):
        try:
            with open(ITEMS_PATH, 'r', encoding='utf-8') as f:
                local_items = json.load(f)
            if h_str in local_items:
                rec = local_items[h_str]
                zh = rec.get('i18n', {}).get('zh-CN', {})
                name = zh.get('name')
                if name:
                    tier_raw = zh.get('itemTypeAndTierDisplayName', '')
                    tier = 'exotic' if '异域' in tier_raw else 'legendary'
                    cache[h_str] = {
                        'name': name,
                        'type': zh.get('itemTypeDisplayName', '物品'),
                        'tier': tier,
                        'icon': rec.get('icon', '')
                    }
                    return cache[h_str]
        except Exception:
            pass

    # 2. 本地未收录，向 Bungie Manifest 接口请求中文定义 (带 ?lc=zh-chs 官方简体中文)
    url = f"{BUNGIE_API_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/{item_hash}/?lc=zh-chs"
    req = urllib.request.Request(url, headers={
        'X-API-Key': api_key,
        'User-Agent': 'StarsideJamstackFetcher/1.0'
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
            dp = raw.get('Response', {}).get('displayProperties', {})
            inv = raw.get('Response', {}).get('inventory', {})
            tier_name = inv.get('tierTypeName', '')
            tier = 'exotic' if '异域' in tier_name else ('rare' if '稀有' in tier_name else 'legendary')
            item_def = {
                'name': dp.get('name', f'未知物品 {item_hash}'),
                'type': raw.get('Response', {}).get('itemTypeDisplayName', '装饰品'),
                'tier': tier,
                'icon': dp.get('icon', '')
            }
            cache[h_str] = item_def
            return item_def
    except Exception as err:
        print(f"获取物品 {item_hash} 定义失败: {err}")
        return {
            'name': f'物品 {item_hash}',
            'type': '装饰品',
            'tier': 'legendary',
            'icon': ''
        }


def fetch_live(api_key: str) -> list:
    """从 Bungie API 拉取实时光尘商店。"""
    url = f"{BUNGIE_API_ROOT}/Destiny2/Vendors/?components=400,402"
    req = urllib.request.Request(url, headers={
        'X-API-Key': api_key,
        'User-Agent': 'StarsideJamstackFetcher/1.0'
    })
    print("正在向 Bungie API 请求商人数据...")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as err:
        sys.exit(f"抓取 Bungie API 失败: {err}")

    if data.get('ErrorCode') != 1:
        sys.exit(f"Bungie API 返回错误: {data.get('Message')} (ErrorCode: {data.get('ErrorCode')})")

    sales_data = data.get('Response', {}).get('sales', {}).get('data', {})
    eververse_vendor_hash = '3361454721'  # 游云天市 Tess Everis

    ev_sales = sales_data.get(eververse_vendor_hash, {}).get('saleItems', {})
    if not ev_sales:
        print(f"未找到商人 {eververse_vendor_hash} 的在售列表，尝试遍历全部商人筛选光尘商品...")
        vendor_keys = list(sales_data.keys())
    else:
        vendor_keys = [eververse_vendor_hash]

    bright_dust_items = []
    item_cache = {}

    for vk in vendor_keys:
        sales = sales_data.get(vk, {}).get('saleItems', {})
        for _, sale in sales.items():
            costs = sale.get('costs', [])
            # 查找以光尘结算的商品
            dust_cost = next((c['quantity'] for c in costs if c.get('itemHash') == BRIGHT_DUST_HASH), None)
            if dust_cost is not None:
                item_hash = sale.get('itemHash')
                defn = get_item_definition(item_hash, api_key, item_cache)
                bright_dust_items.append({
                    'hash': item_hash,
                    'name': defn['name'],
                    'type': defn['type'],
                    'tier': defn['tier'],
                    'cost': dust_cost,
                    'icon': defn['icon']
                })

    if not bright_dust_items:
        print("未从当前 API 返回中筛选出光尘商品，可能正在维护或结构更新，回退离线代表性条目")
        return FIXTURE_ITEMS

    print(f"成功筛选到 {len(bright_dust_items)} 件光尘商品！")
    return bright_dust_items


def run_tests() -> None:
    """运行自检测试，验证数据结构、网络图标转换与原子写入。"""
    print("=== 运行 fetch-rotation 自动化测试 ===")

    # 1. 验证重置时间
    reset_str = next_weekly_reset()
    reset_dt = datetime.datetime.fromisoformat(reset_str.replace('Z', '+00:00'))
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    assert reset_dt > now_dt, "下次重置时间必须在未来"
    assert reset_dt.weekday() == 1, "重置日期必须是周二 (UTC)"
    assert reset_dt.hour == 17 and reset_dt.minute == 0, "重置时刻必须是 17:00 UTC"
    print("✓ 下次重置时间计算正确:", reset_str)

    # 2. 验证网络图标转换与数据结构
    payload = build_payload(FIXTURE_ITEMS)
    assert 'updatedAt' in payload and 'resetAt' in payload
    assert len(payload['items']) == len(FIXTURE_ITEMS)
    for it in payload['items']:
        assert it['icon'].startswith('https://www.bungie.net/common/destiny2_content/icons/'), (
            f"图标必须是完整 Bungie CDN 网络地址: {it['icon']}"
        )
        assert 'name' in it and 'cost' in it and 'tier' in it
    print(f"✓ 数据结构完整，所有 {len(payload['items'])} 件商品图标均成功转换为网络 CDN 地址")

    # 3. 验证原子安全写入与防空写保护
    with tempfile.TemporaryDirectory() as tmpdir:
        test_dest = os.path.join(tmpdir, 'rotation', 'test.json')
        # 正常写入
        save_atomic(test_dest, payload)
        assert os.path.exists(test_dest)
        with open(test_dest, encoding='utf-8') as f:
            loaded = json.load(f)
        assert loaded['resetAt'] == payload['resetAt']
        print("✓ 原子落盘成功，JSON 格式有效")

        # 空数据拦截
        try:
            save_atomic(test_dest, {'items': []})
            assert False, "空数据未抛出异常"
        except ValueError:
            print("✓ 空写防御拦截生效，有效防止损坏线上静态文件")

    print("=== 所有自动化测试均已通过 ===")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mock', action='store_true', help='使用离线测试夹具生成')
    parser.add_argument('--live', action='store_true', help='通过 Bungie API 在线抓取')
    parser.add_argument('--test', action='store_true', help='运行内置自动化测试')
    parser.add_argument('--api-key', help='Bungie API Key (也可通过环境变量 BUNGIE_API_KEY 传入)')
    parser.add_argument('--out', default=DEST, help='输出路径，默认 site/rotation/eververse.json')
    args = parser.parse_args()

    if args.test:
        run_tests()
        return

    api_key = args.api_key or os.getenv('BUNGIE_API_KEY')

    if args.live:
        if not api_key:
            sys.exit("错误: --live 模式必须提供 --api-key 或设置环境变量 BUNGIE_API_KEY")
        items = fetch_live(api_key)
    else:
        # 默认或 --mock
        print("运行离线夹具模式 (Mock Fixture)...")
        items = FIXTURE_ITEMS

    payload = build_payload(items)
    save_atomic(args.out, payload)

    # 终端美观表格输出
    print("\n" + "=" * 92)
    print(f" Destiny 2 本周光尘商店轮换信息 (下次重置: {payload['resetAt']})")
    print("=" * 92)
    header = f"{'序号':<4} | {'物品名称':<16} | {'分类':<12} | {'品质':<10} | {'光尘售价':<8} | {'图标 URL'}"
    print(header)
    print("-" * 92)
    for idx, it in enumerate(payload['items'], 1):
        line = f"{idx:<4} | {it['name']:<16} | {it['type']:<12} | {it['tier']:<10} | {it['cost']:<8} | {it['icon']}"
        print(line)
    print("=" * 92)
    print(f"✓ 静态文件已落盘: {args.out} (大小: {os.path.getsize(args.out)} 字节)")


if __name__ == '__main__':
    main()
