#!/usr/bin/env python3
"""事实层：从 Bungie manifest 蒸馏出以 hash 为主键的物品、词条池与护甲套装表。

manifest 是冻结快照——不会再有新赛季，所以这里跑一次、产物提交进仓库，不留自动
抓取代码。原始 component 文件不入库，手工下载到 SRC 指的目录，缺哪个当场报出。

用法：
    python3 tools/facts.py --distill              # 全部三份
    python3 tools/facts.py --distill --src <目录>  # manifest_raw 在别处

产出三份，键一律是 hash 字符串，人写的名字一律是 {"zh": …, "en": …}：

    data/facts/items.json       物品投影：名字、类型、品阶、元素、图标、赛季水印、
                                收藏条目与来源、发布版本、特殊版本与锻造角标、
                                manifest 序号
    data/facts/perk-pools.json  武器版本 × 栏位 × 词条 hash
    data/facts/armor-sets.json  护甲套装的成员与 2 件 / 4 件效果
    data/facts/effects.json     增益与减益（增幅、致盲、冻结、虚弱……）。**这一类不在
                                物品表里**，主键是 traitHash 与 sandboxPerkHash，
                                站内六个元素页上成段的效果名就靠它落主键
    data/facts/stats.json       属性（充能效率、防御抗性、射程、稳定性……）。武器 PERK
                                页上有一整节写的是属性不是 Perk，主键是 statHash
    data/facts/artifacts.json   七件神器，每件按档位列出它自己的那批模组。**同名的
                                神器模组在库里有两条**（36 处），靠这张表才分得出
                                哪一条属于哪件神器

**不做全量**：zh-chs 的物品表 189.5 MB，这里只取站内页面引用得到的那几类与用得上的
字段，产出小三个数量级。丢掉的是描述全文、截图、投资属性、奖励表这些站内不用的。

**这一层不挑版本**。复刻使同一件东西有多个 itemHash（站内 658 把武器里 417 把同名
多 hash），每个版本在这里各占一条，带着 idx（manifest 序号，即发布顺序）、wm（赛季
水印）、coll（收藏条目）与 src（来源）四样消歧用的字段。挑哪个是「当前版本」是
resolve.py 的事，蒸馏这一步不猜。
"""

import argparse
import gc
import json
import os
import sys

import shell
from markup import die

OUT_DIR = os.path.join(shell.ROOT, 'data', 'facts')
SRC = os.path.join(os.path.dirname(shell.ROOT), '..', 'github',
                   'Destiny-item-list', 'manifest_raw')

LANGS = ('zh', 'en')
DIRS = {'zh': 'zh-chs', 'en': 'en'}

# 站内页面引用得到的那几类。19 是插件（词条、护甲模组、碎片、星相、超能、手雷、
# 近战、职业技能、神器特性），2 是护甲，3 是武器。
#
# **光按 itemType 收会漏**：棱镜手雷（「雹火尖刺」）的 itemType 是 20（Dummy），
# 状态提示（「覆盖护盾」）也是 20，而 20 这一类里另外 4428 条是额外悬赏。所以
# 判据是「itemType 在名单里，**或者**带 plug 块」——带 plug 就是可装配的东西，
# 站内引用得到的正是这一类。多收 346 条，19010 → 19356。
KEEP_TYPES = frozenset({2, 3, 19})

# 图标 URL 的公共前缀，存的时候剥掉，用的时候补回来。38894 条各省 35 字节。
ICON_PREFIX = '/common/destiny2_content/icons/'

# 栏位所属的类目。固有特性要留——异域武器的框架差异就写在这里（「故我在」的不同
# 框架、「单人合唱」的不同催化剂都是 socket 数据本身）。装饰与武器模组不留。
CAT_INTRINSIC = 3956125808
CAT_TRAITS = 4241085061
KEEP_CATS = (CAT_INTRINSIC, CAT_TRAITS)

# 击杀记录器也挂在「武器特性」类目下，不剔每把枪凭空多一栏。判据取 socket 类型的
# 白名单首项，不取初始插件——后者有超过五分之一的槽是空的，漏判率太高。
DROP_PREFIX = 'v400.plugs.weapons.masterworks.trackers'

# 站内角标要用的两位，判据都是「这把枪有没有那种 socket」：
#   craft   可锻造（563 把）
#   tiering 支持装备阶级升级（546 把）。**这一位只说支持，不说现在是几阶**——
#           档位是掉落实例的属性，定义表里给的是「可升到 2/3/4/5 阶」的池。
FLAG_SOCKETS = {'craft': 'crafting.plugs.frame_identifiers',
                'tiering': 'weapon_tiering.plugs.mods.enhancers'}


def src_path(src, lang, name):
    p = os.path.join(src, DIRS[lang], name + '.json')
    if not os.path.exists(p):
        die('manifest 缺 %s：\n  %s\n'
            '静态 component 文件不需要 API key，从 /Destiny2/Manifest/ 的\n'
            '  jsonWorldComponentContentPaths["%s"]["%s"]\n'
            '取路径后 curl --compressed 下载到上面那个位置。' % (name, p, DIRS[lang], name))
    return p


def load(src, lang, name):
    with open(src_path(src, lang, name), encoding='utf-8') as f:
        return json.load(f)


def two(zh, en):
    """一对双语文本。两边相同时只留一份，让产出小一截也让 diff 干净。"""
    zh, en = (zh or '').strip(), (en or '').strip()
    return {'zh': zh} if zh == en else {'zh': zh, 'en': en}


def icon(url):
    url = url or ''
    return url[len(ICON_PREFIX):] if url.startswith(ICON_PREFIX) else url


def project(item, other):
    """一条物品投影。other 是同一个 hash 在另一种语言下的记录。"""
    dp, od = item['displayProperties'], other['displayProperties']
    inv = item.get('inventory') or {}
    out = {
        'n': two(dp.get('name'), od.get('name')),
        't': two(item.get('itemTypeDisplayName'), other.get('itemTypeDisplayName')),
        'tt': two(item.get('itemTypeAndTierDisplayName'),
                  other.get('itemTypeAndTierDisplayName')),
        'ty': item.get('itemType'),
        'st': item.get('itemSubType'),
        'tier': inv.get('tierType'),
        'idx': item.get('index'),
    }
    for key, val in (('dmg', item.get('defaultDamageType')),
                     ('cls', item.get('classType')),
                     ('ammo', (item.get('equippingBlock') or {}).get('ammoType')),
                     ('coll', item.get('collectibleHash')),
                     ('bucket', inv.get('bucketTypeHash'))):
        # 0 与 None 在这些字段上都表示「没有」，一律不写，省掉一大片噪声。
        if val:
            out[key] = val
    if dp.get('icon'):
        out['icon'] = icon(dp['icon'])
    if item.get('iconWatermark'):
        out['wm'] = icon(item['iconWatermark'])
    if dp.get('description'):
        out['desc'] = two(dp.get('description'), od.get('description'))
    if item.get('flavorText'):
        out['flavor'] = two(item.get('flavorText'), other.get('flavorText'))
    if item.get('breakerType'):
        out['breaker'] = item['breakerType']
    if item.get('isAdept'):
        out['adept'] = True
    if item.get('isHolofoil'):
        # 复刻里的「特殊版本」就是这一位，不用靠序号或来源猜。
        out['holo'] = True
    rel = [t for t in item.get('traitIds') or () if t.startswith('releases.')]
    if rel:
        # 发布版本（releases.v970.core 一类）比赛季水印好认：水印是一张图，
        # 这是一个可排序的版本号。
        out['rel'] = rel[0][len('releases.'):]
    cats = item.get('itemCategoryHashes') or []
    if cats:
        out['cat'] = cats
    plug = (item.get('plug') or {}).get('plugCategoryIdentifier')
    if plug:
        out['plug'] = plug
    return out


def socket_kind(entry, socket_types):
    """一个槽的类别标识，取 socket 类型白名单的首项。"""
    st = socket_types.get(str(entry.get('socketTypeHash')))
    wl = (st or {}).get('plugWhitelist') or []
    return wl[0].get('categoryIdentifier', '') if wl else ''


def columns(weapon, socket_types, plug_sets):
    """一把武器的栏位。返回 [{i, kind, type, init, plugs}]，栏序即列表下标。"""
    blk = weapon.get('sockets') or {}
    entries = blk.get('socketEntries') or []
    out = []
    for cat in blk.get('socketCategories') or []:
        if cat.get('socketCategoryHash') not in KEEP_CATS:
            continue
        for i in cat.get('socketIndexes') or []:
            if i >= len(entries):
                die('%s 的 socketIndexes 指到 socketEntries 之外：%d'
                    % (weapon['hash'], i))
            e = entries[i]
            kind = socket_kind(e, socket_types)
            if kind.startswith(DROP_PREFIX):
                continue
            ps = e.get('randomizedPlugSetHash') or e.get('reusablePlugSetHash')
            plugs = []
            if ps:
                for p in (plug_sets.get(str(ps)) or {}).get('reusablePlugItems') or []:
                    # 老版本的武器留着已经开不出来的词条，这一位是唯一的判据。
                    if p.get('currentlyCanRoll') and p.get('plugItemHash'):
                        plugs.append(p['plugItemHash'])
            col = {'i': i, 'kind': kind,
                   'type': e.get('socketTypeHash'),
                   'rand': bool(e.get('randomizedPlugSetHash'))}
            if e.get('singleInitialItemHash'):
                col['init'] = e['singleInitialItemHash']
            if plugs:
                col['plugs'] = plugs
            out.append(col)
    return out


def sort_key(pair):
    """纯数字的键按数值排，带前缀的（effects 的 trait:123）按前缀再按数值。"""
    key = pair[0]
    tag, _, num = key.rpartition(':')
    return (tag, int(num)) if num.isdigit() else (key, 0)


def dump(path, payload, per_line):
    """一条记录一行。这几份随 manifest 重生成并入库，按行写让 git 存得下增量。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rows = ',\n'.join(
        '  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, sort_keys=True))
        for k, v in sorted(payload.items(), key=sort_key))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % rows if per_line
                else json.dumps(payload, ensure_ascii=False, indent=1) + '\n')
    return os.path.getsize(path)


def distill(src):
    items = load(src, 'zh', 'DestinyInventoryItemDefinition')
    other = load(src, 'en', 'DestinyInventoryItemDefinition')
    if set(items) != set(other):
        die('两种语言的物品表 hash 集合不一致，manifest 版本对不上：'
            'zh %d 条、en %d 条' % (len(items), len(other)))

    kept = {}
    for h, item in items.items():
        if item.get('redacted') or item.get('blacklisted'):
            continue
        if item.get('itemType') not in KEEP_TYPES and not item.get('plug'):
            continue
        kept[h] = project(item, other[h])
    del other
    gc.collect()

    # 数值只收**游戏里会显示的那几项**。物品的 stats.stats 里混着一堆恒为 0 的
    # 占位（攻击、能量、变焦），该显示哪些由它自己的 statGroup 定：
    # scaledStats 列的就是那一份，顺序即游戏里的顺序。按值过滤会把真正的 0
    # （防御抗性 0）一起滤掉，所以按表不按值。
    groups = load(src, 'zh', 'DestinyStatGroupDefinition')
    for h, item in items.items():
        row = kept.get(h)
        if row is None:
            continue
        block = item.get('stats') or {}
        group = groups.get(str(block.get('statGroupHash') or ''))
        if not group:
            continue
        vals = block.get('stats') or {}
        # scaledStats 列到、而物品的 stats 里没写的那几项，游戏里显示 0
        # （「故我在」的防御持久就是这样），按表补齐，不按「有没有值」筛。
        got = [(str(s['statHash']), (vals.get(str(s['statHash'])) or {}).get('value') or 0)
               for s in group.get('scaledStats') or ()]
        if got:
            # 顺序即游戏里的显示顺序，所以存成数组不存字典。
            row['stats'] = got
    del groups
    gc.collect()

    # 来源要从收藏条目上取：物品自己的 displaySource 在复刻武器上一律是「随机特性：
    # 此物品无法从收藏品再次获取」，分不出版本；collectible 的 sourceString 才写着
    # 「来源：众神殿」，那正是站内源稿标版本用的那个词。
    coll_zh = load(src, 'zh', 'DestinyCollectibleDefinition')
    coll_en = load(src, 'en', 'DestinyCollectibleDefinition')
    for row in kept.values():
        c = coll_zh.get(str(row.get('coll') or ''))
        if not c:
            continue
        text = two(c.get('sourceString'),
                   (coll_en.get(str(row['coll'])) or c).get('sourceString'))
        if text.get('zh') or text.get('en'):
            row['src'] = text
    del coll_zh, coll_en
    gc.collect()

    socket_types = load(src, 'zh', 'DestinySocketTypeDefinition')
    plug_sets = load(src, 'zh', 'DestinyPlugSetDefinition')
    pools, triples = {}, 0
    for h, item in items.items():
        if item.get('itemType') != 3 or item.get('redacted'):
            continue
        cols = columns(item, socket_types, plug_sets)
        if not cols:
            continue
        pools[h] = cols
        triples += sum(len(c.get('plugs') or ()) for c in cols)
        row = kept.get(h)
        if row is None:
            continue
        kinds = {socket_kind(e, socket_types)
                 for e in (item.get('sockets') or {}).get('socketEntries') or ()}
        for flag, want in FLAG_SOCKETS.items():
            if want in kinds:
                row[flag] = True
    # 神器 → 它自己那批模组。带槽的那一条是 itemType 0 的影子条目（真正的
    # itemType 28 那条没有 socket），槽按档位分组，最后一组是「重置神器」不算。
    # DestinyArtifactDefinition 只有当前那一件，覆盖不了站内文档的七件。
    arts = {}
    for h, item in items.items():
        if item.get('itemType') != 0 or item.get('redacted'):
            continue
        entries = (item.get('sockets') or {}).get('socketEntries') or []
        if not entries:
            continue
        kinds = {socket_kind(e, socket_types) for e in entries}
        if not any('artifact' in k for k in kinds):
            continue
        # 槽里的池是**累积**的：二档那一池包含一档全部。相邻作差才是这一档真正
        # 新开的那七个。末尾那一池只剩占位（「空神器模组」），整池丢掉。
        stacks, seen = [], set()
        for e in entries:
            key = e.get('reusablePlugSetHash') or e.get('randomizedPlugSetHash')
            if not key or key in seen:
                continue
            seen.add(key)
            pool = [str(p['plugItemHash'])
                    for p in (plug_sets.get(str(key)) or {}).get('reusablePlugItems') or ()
                    if (items.get(str(p['plugItemHash'])) or {})
                    .get('plug', {}).get('plugCategoryIdentifier') == 'artifact_perks'
                    and not (items[str(p['plugItemHash'])]['displayProperties']['name']
                             .startswith(('空', '重置')))]
            if pool:
                stacks.append(pool)
        tiers, had = [], set()
        for pool in stacks:
            fresh = [x for x in pool if x not in had]
            had |= set(pool)
            if fresh:
                tiers.append(fresh)
        if tiers:
            name = item['displayProperties']['name']
            arts.setdefault(name, {'n': {'zh': name}, 'tiers': []})
            arts[name]['tiers'] = tiers
    # 神器本体自己那一条是 itemType 28，不在投影范围里（它没有 plug 块），
    # 可它的主键与图标是配装页那枚徽章要用的，所以在这里一并记下。
    for item in items.values():
        if item.get('itemTypeAndTierDisplayName') != '传说 神器':
            continue
        got = arts.get(item['displayProperties']['name'])
        if got is not None and not got.get('hash'):
            got['hash'] = str(item['hash'])
            got['icon'] = icon(item['displayProperties'].get('icon'))

    del socket_types, plug_sets, items
    gc.collect()

    sets_zh = load(src, 'zh', 'DestinyEquipableItemSetDefinition')
    sets_en = load(src, 'en', 'DestinyEquipableItemSetDefinition')
    perks_zh = load(src, 'zh', 'DestinySandboxPerkDefinition')
    perks_en = load(src, 'en', 'DestinySandboxPerkDefinition')
    sets = {}
    for h, s in sets_zh.items():
        bonuses = []
        for p in s.get('setPerks') or []:
            ph = str(p['sandboxPerkHash'])
            pz = perks_zh.get(ph)
            if pz is None:
                die('套装 %s 的 %d 件效果 %s 不在 SandboxPerk 表里' % (h, p['requiredSetCount'], ph))
            pe = perks_en.get(ph, pz)
            bonuses.append({
                'n': p['requiredSetCount'],
                'hash': p['sandboxPerkHash'],
                # 效果自己的图标。站内那一页的图标从英文原表抽，抽不到的按这个补。
                'icon': icon(pz['displayProperties'].get('icon')),
                'name': two(pz['displayProperties'].get('name'),
                            pe['displayProperties'].get('name')),
                'desc': two(pz['displayProperties'].get('description'),
                            pe['displayProperties'].get('description')),
            })
        sets[h] = {
            'name': two(s['displayProperties'].get('name'),
                        sets_en[h]['displayProperties'].get('name')),
            'items': s.get('setItems') or [],
            'bonuses': bonuses,
        }

    effects = {}
    for table, tag in (('DestinyTraitDefinition', 'trait'),
                       ('DestinySandboxPerkDefinition', 'perk')):
        zh_t, en_t = load(src, 'zh', table), load(src, 'en', table)
        for h, v in zh_t.items():
            dp = v.get('displayProperties') or {}
            if v.get('redacted') or not (dp.get('name') or '').strip():
                continue
            # sandboxPerk 里有 3 条名字写着「机密」的占位，这一位把它们挡掉。
            if tag == 'perk' and not v.get('isDisplayable'):
                continue
            od = (en_t.get(h) or {}).get('displayProperties') or {}
            row = {'k': tag, 'n': two(dp.get('name'), od.get('name'))}
            if dp.get('description'):
                row['desc'] = two(dp.get('description'), od.get('description'))
            if dp.get('icon'):
                row['icon'] = icon(dp['icon'])
            if v.get('displayHint'):
                # trait 里 35 条是 keyword（游戏内的状态：不稳定、冻结、超凡），
                # 另 11 条是分类标签（光能增益、赛季）。这一位把两者分开。
                row['hint'] = v['displayHint']
            # trait 与 sandboxPerk 的 hash 空间各自独立，同一个数字可能两边都有，
            # 所以键上带一位前缀，别让后读的那张表盖掉前一张。
            effects['%s:%s' % (tag, h)] = row
        del zh_t, en_t
        gc.collect()

    stats = {}
    zh_s, en_s = load(src, 'zh', 'DestinyStatDefinition'), load(src, 'en', 'DestinyStatDefinition')
    for h, v in zh_s.items():
        dp = v.get('displayProperties') or {}
        if v.get('redacted') or not (dp.get('name') or '').strip():
            continue
        od = (en_s.get(h) or {}).get('displayProperties') or {}
        srow: dict[str, object] = {'n': two(dp.get('name'), od.get('name'))}
        if dp.get('description'):
            srow['desc'] = two(dp.get('description'), od.get('description'))
        if dp.get('icon'):
            srow['icon'] = icon(dp['icon'])
        stats[h] = srow
    del zh_s, en_s

    a = dump(os.path.join(OUT_DIR, 'items.json'), kept, True)
    b = dump(os.path.join(OUT_DIR, 'perk-pools.json'), pools, True)
    c = dump(os.path.join(OUT_DIR, 'armor-sets.json'), sets, True)
    print('data/facts/items.json       %7d 条  %6.1f KB' % (len(kept), a / 1024))
    print('data/facts/perk-pools.json  %7d 把  %6.1f KB  三元组 %d'
          % (len(pools), b / 1024, triples))
    d = dump(os.path.join(OUT_DIR, 'effects.json'), effects, True)
    print('data/facts/armor-sets.json  %7d 套  %6.1f KB  效果 %d'
          % (len(sets), c / 1024, sum(len(s['bonuses']) for s in sets.values())))
    e = dump(os.path.join(OUT_DIR, 'stats.json'), stats, True)
    f_ = os.path.join(OUT_DIR, 'artifacts.json')
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(f_, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(arts, ensure_ascii=False, indent=1, sort_keys=True) + '\n')
    print('data/facts/artifacts.json   %7d 件  %6.1f KB  档位 %s'
          % (len(arts), os.path.getsize(f_) / 1024,
             '、'.join(str(len(v['tiers'])) for v in arts.values())))
    print('data/facts/effects.json     %7d 条  %6.1f KB  trait %d、perk %d'
          % (len(effects), d / 1024,
             sum(1 for v in effects.values() if v['k'] == 'trait'),
             sum(1 for v in effects.values() if v['k'] == 'perk')))
    print('data/facts/stats.json       %7d 条  %6.1f KB' % (len(stats), e / 1024))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--distill', action='store_true', help='蒸馏三份事实表')
    ap.add_argument('--src', default=SRC, help='manifest_raw 目录')
    a = ap.parse_args()
    if not a.distill:
        ap.error('要做什么？现在只有 --distill')
    distill(os.path.realpath(a.src))


if __name__ == '__main__':
    sys.exit(main())
