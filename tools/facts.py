#!/usr/bin/env python3
"""事实层：从 Bungie manifest 蒸馏出十份以 hash 为主键的定义表。

manifest 是冻结快照——不会再有新赛季，所以这里跑一次、产物提交进仓库，不留自动
抓取代码。原始 component 文件不入库，手工下载到 SRC 指的目录，缺哪个当场报出。

用法：
    python3 tools/facts.py --distill              # 十份全出
    python3 tools/facts.py --distill --src <目录>  # manifest_raw 在别处

产出十份，落 `data/manifest/`。**一张 Bungie 定义表一个文件，文件名照定义表命名**：

    inventory-items.json      DestinyInventoryItemDefinition
    sandbox-perks.json        DestinySandboxPerkDefinition
    traits.json               DestinyTraitDefinition
    stats.json                DestinyStatDefinition
    equipable-item-sets.json  DestinyEquipableItemSetDefinition
    collectibles.json         DestinyCollectibleDefinition
    plug-sets.json            DestinyPlugSetDefinition
    socket-types.json         DestinySocketTypeDefinition
    stat-groups.json          DestinyStatGroupDefinition
    artifacts.json            派生分组，非 Bungie 表（官方那张只有当前一件，
                              覆盖不了站内文档的七件）

## 取哪些字段、怎么写

**取哪些**是一张白名单：站内页面引用得到的那几类物品、用得上的那些字段。丢掉的
是截图、奖励表、悬赏目标这些站内一个读者都没有的。

**怎么写只有一条：manifest 上有这个键，就把它的值原样写下来。**不按值筛——
`classType: 0` 是泰坦、`defaultDamageType: 0` 是无元素、`breakerType: 0` 是不破盾，
都是值域里的合法成员，丢掉等于让读者把「泰坦专属」读成「无限制」。从前按「零值不写」
处理，2200 件泰坦装备的职业限制就是这么静默消失的。

形状上只做三种改写，各有理由：

1. **`displayProperties` 这个壳拆开**：`name` 与 `description` 进 `i18n`，`icon`
   上根。壳里只剩一个成员时留着是残骸，还会让同一件事在两层两个名字。
   Bungie 的 `description` 进 `i18n` 时改叫 `database_details`——它在实体层与
   我们实测的那一条并排摆着，叫 `description` 分不出谁是谁。
2. **语言文本一律住进 `i18n`**，形状恒为 `i18n -> <语言> -> <英文字段名>`，
   `en` 省略与 `zh-CN` 逐字相同的字段。语言边界因此只有一处形状，闸门是一句话：
   事实那一侧任何深度出现键 `zh-CN`／`en` 而外层不叫 `i18n`，即不合法。
3. **跨表引用写成 `[表名, 主键]` 二元组**。裸 hash 不唯一：`inventory-items` 与
   `sandbox-perks` 撞了 52 个号。

键是裸十进制 hash 串，文件即命名空间——不写 `perk:` `trait:` `stat:` `set:` 前缀，
剥出来的东西只会落回这张表，那一位不携带信息。

**这一层不挑版本**。复刻使同一件东西有多个 itemHash（站内 658 把武器里 417 把同名
多 hash），每个版本在这里各占一条，带着 `index`（manifest 序号，即发布顺序）、
`iconWatermark`、`collectibleHash` 与 `derived.release` 消歧。挑哪个是「当前版本」
是 resolve.py 的事，蒸馏这一步不猜。

**这一层也不切栏**。从前的 `perk-pools.json` 把「哪几栏算词条、空插槽剔掉、大师工作
只留大师杰作」写死在这里，那是渲染口径不是 Bungie 事实。现在整份 `sockets` 原样存下，
切栏归 `resolve.Facts.pool()` 一处，两边（资料页戳主键、武器库画栏）读同一份。
"""

import argparse
import bisect
import collections
import decimal
import gc
import json
import os
import sys

import shell
from markup import die

OUT_DIR = os.path.join(shell.ROOT, 'data')
LOOKUP_DIR = os.path.join(OUT_DIR, 'lookup')
SRC = os.path.join(os.path.dirname(shell.ROOT), '..', 'github',
                   'Destiny-item-list', 'manifest_raw')

DIRS = {'zh': 'zh-chs', 'en': 'en'}

# 站内页面引用得到的那几类。19 是插件（词条、护甲模组、碎片、星相、超能、手雷、
# 近战、职业技能、神器特性），2 是护甲，3 是武器。
#
# **光按 itemType 收会漏**：棱镜手雷（「雹火尖刺」）的 itemType 是 20（Dummy），
# 状态提示（「覆盖护盾」）也是 20，而 20 这一类里另外 4428 条是额外悬赏。所以
# 判据是「itemType 在名单里，**或者**带 plug 块」——带 plug 就是可装配的东西，
# 站内引用得到的正是这一类。多收 346 条，19010 → 19356。
KEEP_TYPES = frozenset({2, 3, 19})

# 物品记录上原样搬运的顶层字段。列在这里即入库，值不做任何判断。
ITEM_FIELDS = ('index', 'itemType', 'itemSubType', 'classType',
               'defaultDamageType', 'breakerType', 'collectibleHash',
               'isAdept', 'isHolofoil', 'itemCategoryHashes')
# 与 iconWatermark 并排的那张「本季主打」水印。manifest 里还有一位
# iconWatermarkShelved（日落版），实测 13904 条**与 Featured 逐字节相同**，
# Bungie 两位填的是同一个值，所以只收一张。
WATERMARKS = ('iconWatermark', 'iconWatermarkFeatured')

# 图标 URL 的公共前缀，存的时候剥掉，用的时候由 resolve.icon_path() 补回来。
# 38894 条各省 35 字节。不带这个前缀的（Bungie 自己的占位图 /img/misc/…）原样留着，
# 那也是它给的路径，由取图那一侧判要不要用。
ICON_PREFIX = '/common/destiny2_content/icons/'

# 站内角标要用的两位，判据都是「这把枪有没有那种 socket」：
#   craftable  可锻造（563 把）
#   tierable   支持装备阶级升级。**这一位只说支持，不说现在是几阶**——档位是掉落
#              实例的属性（DestinyItemInstanceComponent.gearTier），定义表里给的是
#              「可升到 2/3/4/5 阶」的池。两条路互斥：非锻造武器走 weapon_tiering，
#              可锻造武器走 crafting 的 transfusers.level，只认前者会漏掉那 563 把。
# 这两位 manifest 里没有对应字段，是按槽的存在与否推出来的，所以进 derived，
# 而且只有「是」这一种取值：没有那种槽就是没有这件事，不写 false。
FLAG_SOCKETS = {'craftable': ('crafting.plugs.frame_identifiers',),
                'tierable': ('weapon_tiering.plugs.mods.enhancers',
                             'crafting.plugs.weapons.mods.transfusers.level')}

# 勇士克制不在武器的 breakerType 上——全 manifest 只有 18 条非 0。Bungie 把它编码在
# 固有框架插件所挂的 SandboxPerk 上，那些 perk 的名字以 Destiny 符号字体的私有区
# 码位开头。按这条推导覆盖 2208 把武器，与 destiny.report 实时数据 2205/2207 一致。
BREAKER_GLYPH = {'': 1, '': 2, '': 3}

# 神器本体那一条是 itemType 28，不在 KEEP_TYPES 里也没有 plug 块。它的名字与图标是
# 配装页那枚徽章要用的，所以按「artifacts.json 引用到的本体」补进物品表——判据在
# 引用上，不另列一份七件的名单。
ARTIFACT_TIER = '传说 神器'

# 插槽的语义标签。manifest 的 categoryIdentifier 有 14 种叫法，说的却是同几件事；
# 站内每个消费方各归各的，就会各归各的错。这一位把它归一次，写进 socket-types 的
# derived 里，两边（资料页戳主键、配装画栏）读同一份。
#
# 与 destiny.report 的三分（barrel / perk / origin）同一思路，但我们留着它不要的
# 那三档——固有提成了字段，大师与模组站内的配装工具要用。
SOCKET_KIND = {
    'intrinsics': 'intrinsic',
    'frames': 'trait',
    'origins': 'origin',
    'barrels': 'stat', 'magazines': 'stat', 'magazines_gl': 'stat', 'scopes': 'stat',
    'tubes': 'stat', 'batteries': 'stat', 'stocks': 'stat', 'blades': 'stat',
    'guards': 'stat', 'bowstrings': 'stat', 'arrows': 'stat', 'hafts': 'stat',
    'grips': 'stat',
}
TRACKER_KIND = 'v400.plugs.weapons.masterworks.trackers'
MOD_KINDS = ('v400.weapon.mod', 'v460.weapon.mod', 'v900.weapon.mod')
# 大师工作的写法不止一种：v400.plugs.weapons.masterworks 之外还有
# plugs.masterworks.weapons.default（22 种）与各代异域专属的
# v620/v700.exotic.weapon.masterwork。按含不含 masterwork 认，不按前缀列名单。
MASTERWORK_MARK = 'masterwork'
# 外观：皮肤、着色器、饰品。站内一个读者都没有，标出来是为了「other 里不该再有
# 认得出的东西」——剩下的 other 才是真的没见过。
COSMETIC_MARKS = ('skins', 'shader', 'ornament')

# 数值越低越好的那三项。**manifest 里推不出来**：它们与另外 23 项属性的
# statCategory 与 aggregationType 完全相同，没有任何一位把它们分开。所以这一份
# 是人记的，改了游戏才会变。destiny.report 也是硬编码同样三条。
LOWER_IS_BETTER = frozenset({447667954, 2961396640, 3481294762})  # 蓄力时间 充能时间 发热量

RPM = '4284893193'          # 每分钟发射数

# **射速由枪型 × 框架决定**，不由具体哪一把枪决定：站内 149 处写法归并成 65 个
# （枪型，框架）组，组内一致。所以它挂在框架那枚插件上，一个枪型一个值。
#
# 默认取该组里标称射速的众数。manifest 的标称值与站内实测差出 5% 以上的写在这里，
# 以实测为准、取整到最近的 5；实测那一列在 `references/docs/weapon-frames.md` 的
# 「真实 射速」。同一枚插件在两个枪型上是两个值（`3468089894` 攻击型框架在霰弹枪
# 上 60、在火箭发射器上 25），所以键是这一对，不是插件自己。
RATE = {
    (7, 3983457027): 60,    # 霰弹枪 攻击型框架      标称 55，实测 60.0
    (7, 3468089894): 60,    # 霰弹枪 攻击型框架      标称 55，实测 60.0
    (7, 1636108362): 70,    # 霰弹枪 精密框架        标称 65，实测 72.0
    (7, 895140517): 70,     # 霰弹枪 精密框架        标称 65，实测 72.0
    (7, 918679156): 70,     # 霰弹枪 精确重击框架     标称 65，实测 72.4
    (7, 1458010786): 90,    # 霰弹枪 轻质框架        标称 80，实测 92.3
    (7, 407573255): 95,     # 霰弹枪 速射重弹        标称 87，实测 94.7
    (7, 3923638944): 150,   # 霰弹枪 重型点射        标称 62，实测 150.0
    (10, 3468089894): 25,   # 火箭发射器 攻击型框架   标称 25，实测 27.3
    (10, 3419274965): 25,   # 火箭发射器 精密框架     标称 15，实测 24.2
    (10, 216781713): 25,    # 火箭发射器 精密框架     标称 15，实测 24.2
    (10, 1294026524): 25,   # 火箭发射器 适配框架     标称 20，实测 25.2
    (10, 1019291327): 25,   # 火箭发射器 高冲击力框架  标称 15，实测 24.0
    (12, 1019291327): 35,   # 狙击步枪 高冲击力框架    标称 72，实测 36.0
    (13, 2928496916): 55,   # 脉冲步枪 微型导弹框架    标称 200，实测 53.1
    (23, 1759472859): 30,   # 榴弹发射器 双重火力     标称 100，实测 31.9
    (23, 3758615625): 35,   # 榴弹发射器 微型导弹框架  标称 90，实测 36.4
    (23, 1395789926): 40,   # 榴弹发射器 波形框架     标称 72，实测 40.0
    (23, 474269988): 35,    # 榴弹发射器 轻质框架     标称 90，实测 36.4
    (25, 1294026524): 900,  # 追踪步枪 适配框架       标称 1000，实测 897.9
    (31, 1019291327): 30,   # 弓箭 高冲击力框架       标称 80，实测 28.7
    (33, 1986105578): 60,   # 偃月 攻击型偃月        标称 45，实测 59.8
    (33, 1316753551): 65,   # 偃月 适配偃月          标称 55，实测 66.1
    (33, 1956005708): 85,   # 偃月 速射偃月          标称 80，实测 84.1
}

ZH, EN = 'zh-CN', 'en'


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


def i18n_of(*fields):
    """语言优先的文本块。fields 是 (英文字段名, zh 文本, en 文本) 三元组。

    `en` 只写与 `zh-CN` 逐字相同之外的那几个字段——同值省略是契约定的，两种语言
    各存一份会让物品表白涨一截。除此之外不做取舍：有什么写什么。
    """
    zh, en = {}, {}
    for field, z, e in fields:
        # 空串不是值，是「这一条没有这个字段」。manifest 里到处是空串占位
        # （10418 条物品的 database_details、10255 条的 flavorText），存下来
        # 只是让每个消费方都得再写一次 `or ''`。
        if z:
            zh[field] = z
        if e and e != z:
            en[field] = e
    out = {}
    if zh:
        out[ZH] = zh
    if en:
        out[EN] = en
    return out


def icon_of(url):
    """Bungie 图的路径，固定前缀剥掉，其余原样。"""
    s = url or ''
    return s[len(ICON_PREFIX):] if s.startswith(ICON_PREFIX) else s


def plain(key, zh, en, extra=None):
    """sandbox-perks / traits / stats 三张表共用的一条：只有 hash、icon、i18n。"""
    dp = zh.get('displayProperties') or {}
    od = (en or {}).get('displayProperties') or {}
    out: dict[str, object] = {'hash': int(key)}
    if 'icon' in dp:
        out['icon'] = icon_of(dp['icon'])
    text = i18n_of(('name', dp.get('name'), od.get('name')),
                   ('database_details', dp.get('description'), od.get('description')))
    if text:
        out['i18n'] = text
    if extra:
        out.update(extra)
    return out


def project(key, item, other):
    """一条物品。字段名照 Manifest 拼全，**根上只放 Bungie 自己的字段**；
    本项目算出来的一律进 `derived`。边界因此是结构上的，不靠人记：问「这个字段是
    Bungie 的还是我们的」，看它在不在 `derived` 里就够了。
    """
    dp, od = item['displayProperties'], other['displayProperties']
    out: dict[str, object] = {'hash': int(key)}
    for field in ITEM_FIELDS:
        if field in item:
            out[field] = item[field]
    for field in WATERMARKS:
        if field in item:
            out[field] = icon_of(item[field])
    if 'icon' in dp:
        out['icon'] = icon_of(dp['icon'])
    text = i18n_of(
        ('name', dp.get('name'), od.get('name')),
        ('database_details', dp.get('description'), od.get('description')),
        ('itemTypeDisplayName', item.get('itemTypeDisplayName'),
         other.get('itemTypeDisplayName')),
        ('itemTypeAndTierDisplayName', item.get('itemTypeAndTierDisplayName'),
         other.get('itemTypeAndTierDisplayName')),
        ('flavorText', item.get('flavorText'), other.get('flavorText')))
    if text:
        out['i18n'] = text
    inv = item.get('inventory') or {}
    inventory = {f: inv[f] for f in ('tierType', 'bucketTypeHash') if f in inv}
    if inventory:
        out['inventory'] = inventory
    eq = item.get('equippingBlock') or {}
    if 'ammoType' in eq:
        out['equippingBlock'] = {'ammoType': eq['ammoType']}
    plug = (item.get('plug') or {}).get('plugCategoryIdentifier')
    if plug is not None:
        out['plug'] = {'plugCategoryIdentifier': plug}
    # 这件东西挂的 SandboxPerk。它是物品表通向 sandbox-perks.json 的唯一连接键，
    # 断了就只能靠「图标相同、名字相同」去桥——雪上加霜的 SandboxPerk 是 374284927，
    # 那条链从前只活在仓库外的原始 manifest 里。
    if 'perks' in item:
        out['perks'] = [{'perkHash': p['perkHash']} for p in item['perks']]
    # 投资属性。这是**插值前**的原始值，与游戏里显示的那个数不是一回事：
    # 武器页要按「基线 + 选中的插件」重算，只能在投资值这一侧加。
    # **不做成按 statTypeHash 建的字典**：15 件物品在这个数组里重复同一个
    # statTypeHash（3513245618 大师杰作：稳定性等），做成字典会静默丢掉一半。
    if 'investmentStats' in item:
        stats = []
        for st in item['investmentStats']:
            one: dict[str, object] = {'statTypeHash': st['statTypeHash'],
                                      'value': st['value']}
            if st.get('isConditionallyActive'):
                # 「亡命之徒」那类击杀后才生效的加成靠这一位区分，不留就会把
                # 条件加成当成常驻的算进属性条。
                one['isConditionallyActive'] = True
            stats.append(one)
        out['investmentStats'] = stats
    derived = {}
    rel = [t for t in item.get('traitIds') or () if t.startswith('releases.')]
    if rel:
        # 发布版本（releases.v970.core 一类）比赛季水印好认：水印是一张图，
        # 这是一个可排序的版本号。
        derived['release'] = rel[0][len('releases.'):]
    foundry = [t for t in item.get('traitIds') or () if t.startswith('foundry.')]
    if foundry:
        # 铸造厂（Häkke、Omolon、Veist…），779 把枪有。站内购物清单那一列写的
        # 就是它，从前靠人写。
        derived['foundry'] = foundry[0][len('foundry.'):]
    if derived:
        out['derived'] = derived
    return out


def stats_of(item):
    """物品用哪一组插值曲线。**算出来的那几个显示值不存。**

    Bungie 在 `stats.stats` 上预先算好了每一项的显示值，但它 100% 可以由
    `investmentStats` 过这一组的 `displayInterpolation` 重建——实测 8246 条逐值
    相等，零出入。存下来是把同一条推导链的两端都记一遍，1720 KB。
    从前 `derived.displayStats` 被删掉正是这个理由，那一份与这一份是同一件事。

    公式四个细节缺一不可：不加默认插件；先按 `scaledStats.maximumValue` 截断
    再插值；两端截断不外推；银行家舍入。
    """
    block = item.get('stats') or {}
    if 'statGroupHash' not in block:
        return None
    # 从前这一位是字符串，2208 处。值位置上的 hash 一律整数。
    return {'statGroupHash': block['statGroupHash']}


def shown(row, group, stat):
    """一件东西某一项属性的显示值。算不出返回 None。

    公式四个细节缺一不可：不加默认插件；先按 `scaledStats.maximumValue` 截断
    再插值；两端截断不外推；银行家舍入。**属性组不缩放这一项时，投资值本身就是
    显示值**——刀剑的弹药生成、5 把枪的每分钟发射数与伤害走的是这一条。
    """
    seen = [s for s in row.get('investmentStats') or ()
            if str(s['statTypeHash']) == stat]
    if not seen:
        return None
    # 判据是「这一项在不在」，不是「值是不是 0」：投资值 0 过曲线出来可以是 55，
    # 攻击型霰弹枪与微型导弹手枪整批都是这样。
    base = sum(s['value'] for s in seen if not s.get('isConditionallyActive'))
    for s in (group or {}).get('scaledStats') or ():
        if str(s['statHash']) != stat:
            continue
        v = min(base, s['maximumValue'])
        pts = s['displayInterpolation']
        if not pts:
            return v
        xs = [p['value'] for p in pts]
        ys = [p['weight'] for p in pts]
        if v <= xs[0]:
            return ys[0]
        if v >= xs[-1]:
            return ys[-1]
        i = bisect.bisect_right(xs, v) - 1
        span = ys[i] + (v - xs[i]) * (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
        return int(decimal.Decimal(span).quantize(0, rounding=decimal.ROUND_HALF_EVEN))
    return base


def rates_of(kept, groups):
    """射速写在框架那枚插件的 `derived.rate` 上，键是枪型。

    从前站内 149 行各存一份，改个数要改 149 处；而这个量由枪型与框架决定，
    一枚框架插件在一个枪型下只有一个值（210 组里 205 组的标称射速唯一，
    另 5 组取众数）。取值规矩见 `RATE`。
    """
    by = collections.defaultdict(collections.Counter)
    for h, row in kept.items():
        if row.get('itemType') != 3:
            continue
        arch = (row.get('derived') or {}).get('archetype')
        if not arch:
            continue
        got = shown(row, groups.get(str((row.get('stats') or {}).get('statGroupHash'))), RPM)
        if got:
            by[(row.get('itemSubType'), arch)][got] += 1
    for (sub, arch), seen in by.items():
        if str(arch) not in kept:
            die('框架 %s 不在物品表里，射速挂不上去' % arch)
        kept[str(arch)].setdefault('derived', {}).setdefault('rate', {})[str(sub)] = \
            RATE.get((sub, arch), seen.most_common(1)[0][0])


def sockets_of(item):
    """一把武器的插槽，原样存下：栏序即 `socketEntries` 的下标，不另记位置。

    `reusablePlugItems` 只在该条**没有任何 plugSet hash** 时写（548 条）。全写会让
    物品表从 24.8 MB 涨到 36.0 MB，而带 plugSet 的那些清单去 `plug-sets.json` 取，
    一份插件清单因此只存一遍。
    """
    blk = item.get('sockets') or {}
    entries = []
    for e in blk.get('socketEntries') or ():
        one: dict[str, object] = {}
        for field in ('socketTypeHash', 'singleInitialItemHash',
                      'reusablePlugSetHash', 'randomizedPlugSetHash'):
            if field in e:
                one[field] = e[field]
        if not (e.get('reusablePlugSetHash') or e.get('randomizedPlugSetHash')):
            inline = [{'plugItemHash': p['plugItemHash']}
                      for p in e.get('reusablePlugItems') or ()]
            if inline:
                one['reusablePlugItems'] = inline
        entries.append(one)
    cats = [{'socketCategoryHash': c['socketCategoryHash'],
             'socketIndexes': list(c['socketIndexes'])}
            for c in blk.get('socketCategories') or ()]
    out: dict[str, object] = {}
    if entries:
        out['socketEntries'] = entries
    if cats:
        out['socketCategories'] = cats
    return out or None


def socket_kind(entry, socket_types):
    """一个槽的类别标识，取 socket 类型白名单的首项。"""
    st = socket_types.get(str(entry.get('socketTypeHash')))
    wl = (st or {}).get('plugWhitelist') or []
    return wl[0].get('categoryIdentifier', '') if wl else ''


def breaker_perks(src):
    """勇士克制的 SandboxPerk → breakerType。全库 19 条，按名字首字符的私有区码位认。

    这几条 perk 的名字是 `屏障` 这样的形状：一个 Destiny 符号字体的码位加
    一个词。按码位认不按词认——词在不同语言下不一样，码位不会变。
    """
    out = {}
    for h, v in load(src, 'zh', 'DestinySandboxPerkDefinition').items():
        name = ((v.get('displayProperties') or {}).get('name') or '')
        got = BREAKER_GLYPH.get(name[:1])
        if got:
            out[int(h)] = got
    if not out:
        die('一条勇士克制 perk 都没认出来，BREAKER_GLYPH 的码位对不上这份 manifest')
    return out


def breaker_of(item, socket_types, perk_breaker, items):
    """这把枪破哪种勇士。自身 breakerType 优先，其次看固有框架挂的 SandboxPerk。"""
    if item.get('breakerType'):
        return item['breakerType']
    for e in (item.get('sockets') or {}).get('socketEntries') or ():
        if socket_kind(e, socket_types) != 'intrinsics':
            continue
        heads = [e.get('singleInitialItemHash')]
        heads += [p.get('plugItemHash') for p in e.get('reusablePlugItems') or ()]
        for h in heads:
            frame = items.get(str(h)) if h else None
            for perk in (frame or {}).get('perks') or ():
                got = perk_breaker.get(perk.get('perkHash'))
                if got:
                    return got
    return 0


def dump(path, payload):
    """一条记录一行。这几份随 manifest 重生成并入库，按行写让 git 存得下增量。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rows = ',\n'.join(
        '  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, sort_keys=True))
        for k, v in sorted(payload.items(), key=lambda kv: int(kv[0])))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % rows)
    return os.path.getsize(path)


def artifacts_of(items, plug_sets, socket_types):
    """七件神器，每件按档位列出它自己那批模组。

    带槽的那一条是 itemType 0 的影子条目（真正的 itemType 28 那条没有 socket），
    槽按档位分组。槽里的池是**累积**的：二档那一池包含一档全部，相邻作差才是这一档
    真正新开的那七个。末尾那一池只剩占位（「空神器模组」），整池丢掉。

    官方的 DestinyArtifactDefinition 只有当前那一件，覆盖不了站内文档的七件，
    所以这一张是派生表、不照定义表命名。
    """
    arts = {}
    for item in items.values():
        if item.get('itemType') != 0 or item.get('redacted'):
            continue
        entries = (item.get('sockets') or {}).get('socketEntries') or []
        if not entries:
            continue
        if not any('artifact' in socket_kind(e, socket_types) for e in entries):
            continue
        stacks, seen = [], set()
        for e in entries:
            key = e.get('reusablePlugSetHash') or e.get('randomizedPlugSetHash')
            if not key or key in seen:
                continue
            seen.add(key)
            pool = []
            for p in (plug_sets.get(str(key)) or {}).get('reusablePlugItems') or ():
                mod = items.get(str(p['plugItemHash']))
                if not mod:
                    continue
                if (mod.get('plug') or {}).get('plugCategoryIdentifier') != 'artifact_perks':
                    continue
                if mod['displayProperties']['name'].startswith(('空', '重置')):
                    continue
                pool.append(p['plugItemHash'])
            if pool:
                stacks.append(pool)
        tiers, had = [], set()
        for pool in stacks:
            fresh = [x for x in pool if x not in had]
            had |= set(pool)
            if fresh:
                tiers.append({'items': [{'itemHash': x} for x in fresh]})
        if tiers:
            # 影子条目的 hash 不是神器本体的。先按名字聚，下面认到本体那一条时
            # 再换成本体的 hash 当键。
            arts[item['displayProperties']['name']] = {'tiers': tiers}
    out = {}
    for item in items.values():
        if item.get('itemTypeAndTierDisplayName') != ARTIFACT_TIER:
            continue
        got = arts.get(item['displayProperties']['name'])
        if got is not None and 'hash' not in got:
            got['hash'] = item['hash']
            out[str(item['hash'])] = got['tiers']
    missing = sorted(k for k, v in arts.items() if 'hash' not in v)
    if missing:
        die('这几件神器找不到本体那一条（itemTypeAndTierDisplayName 为「%s」），'
            '主键建不起来：%s' % (ARTIFACT_TIER, '、'.join(missing)))
    return out


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
        kept[h] = project(h, item, other[h])
    # 神器本体不在投影范围里（itemType 28，也没有 plug 块），可 artifacts.json 引用
    # 到它、名字与图标要取得到，所以下面按引用补进来。英文那一份在整表丢掉之前
    # 先把这几条留住。
    art_en = {h: other[h] for h, v in items.items()
              if v.get('itemTypeAndTierDisplayName') == ARTIFACT_TIER}
    del other
    gc.collect()

    for h, row in kept.items():
        got = stats_of(items[h])
        if got:
            row['stats'] = got

    socket_types = load(src, 'zh', 'DestinySocketTypeDefinition')
    plug_sets = load(src, 'zh', 'DestinyPlugSetDefinition')
    perk_breaker = breaker_perks(src)
    want_sets, want_types = set(), set()
    for h, row in kept.items():
        item = items[h]
        if item.get('itemType') != 3:
            if item.get('breakerType'):
                # manifest 自己标了的照搬进 derived——消费方只读 derived 那一位，
                # 只给武器算会漏掉 `3387424189` 过载霰弹枪这一条。
                row.setdefault('derived', {})['breakerType'] = item['breakerType']
            continue
        got = sockets_of(item)
        if got:
            row['sockets'] = got
        for e in (item.get('sockets') or {}).get('socketEntries') or ():
            if 'socketTypeHash' in e:
                want_types.add(str(e['socketTypeHash']))
            for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
                if e.get(field):
                    want_sets.add(str(e[field]))
        derived = row.setdefault('derived', {})
        # 固有框架提成一位。2208 把枪每一把都要显示它（站内「框架」那一列正是它，
        # 实测吻合 99.5%），藏在 sockets 里要遍历 intrinsics 栏才拿得到。
        for e in (item.get('sockets') or {}).get('socketEntries') or ():
            if socket_kind(e, socket_types) != 'intrinsics':
                continue
            head = e.get('singleInitialItemHash')
            if not head:
                pool = e.get('reusablePlugItems') or []
                head = pool[0]['plugItemHash'] if pool else None
            if head:
                derived['archetype'] = head
            break
        breaker = breaker_of(item, socket_types, perk_breaker, items)
        if breaker:
            # 推出来的，不是 manifest 的 breakerType——根上那一位是 Bungie 自己写的，
            # 全表只有 18 条非 0；这一位覆盖 2208 把。
            derived['breakerType'] = breaker
        kinds = {socket_kind(e, socket_types)
                 for e in (item.get('sockets') or {}).get('socketEntries') or ()}
        for flag, want in FLAG_SOCKETS.items():
            if kinds.intersection(want):
                derived[flag] = True
        if not derived:
            del row['derived']

    arts = artifacts_of(items, plug_sets, socket_types)
    for key, tiers in arts.items():
        if key not in kept:
            kept[key] = project(key, items[key], art_en[key])
        # 档位是**我们从影子条目的插槽推出来的**，不是 Bungie 给神器本体写的字段，
        # 所以进 derived。它的键就是本体的 itemHash——单出一张表等于同一个实体
        # 在两处各有一条记录。
        kept[key].setdefault('derived', {})['tiers'] = tiers

    plugs = {}
    for h in want_sets:
        rows = []
        for p in (plug_sets.get(h) or {}).get('reusablePlugItems') or ():
            one: dict[str, object] = {'plugItemHash': p['plugItemHash']}
            if not p.get('currentlyCanRoll'):
                # 「这一枚已经开不出来了」。**这份 manifest 里武器一枚都没标**：
                # 全库 4416 项全在护甲的 plug-set 上，而护甲插槽不收，所以这一位
                # 写下来是 0 处。留着，收护甲插槽那天它就有用了。
                one['currentlyCanRoll'] = False
            rows.append(one)
        plugs[h] = {'hash': int(h), 'reusablePlugItems': rows}
    types = {}
    for h in want_types:
        st = socket_types.get(h) or {}
        one: dict[str, object] = {'hash': int(h)}
        if 'socketCategoryHash' in st:
            one['socketCategoryHash'] = st['socketCategoryHash']
        wl = [{'categoryHash': w['categoryHash'],
               'categoryIdentifier': w['categoryIdentifier']}
              for w in st.get('plugWhitelist') or ()]
        one['plugWhitelist'] = wl
        ident = wl[0]['categoryIdentifier'] if wl else ''
        if ident.startswith(TRACKER_KIND):
            kind = 'tracker'
        elif MASTERWORK_MARK in ident:
            kind = 'masterwork'
        elif ident.startswith(MOD_KINDS):
            kind = 'mod'
        elif any(m in ident for m in COSMETIC_MARKS):
            kind = 'cosmetic'
        else:
            kind = SOCKET_KIND.get(ident, 'other')
        one['derived'] = {'kind': kind}
        types[h] = one
    del socket_types, plug_sets
    gc.collect()

    # 只收被物品引用到的那 84 组，与另两张查表同一口径。整张 112 组存过一版，
    # 多出来的 28 组一个引用都没有——查表的范围就该是「有人查」。
    want_groups = {str((r.get('stats') or {}).get('statGroupHash'))
                   for r in kept.values() if r.get('stats')}
    groups = {}
    for h, g in load(src, 'zh', 'DestinyStatGroupDefinition').items():
        if h not in want_groups:
            continue
        one: dict[str, object] = {'hash': int(h)}
        for field in ('maximumValue', 'uiPosition'):
            if field in g:
                one[field] = g[field]
        one['scaledStats'] = [{
            'statHash': s['statHash'],
            'maximumValue': s['maximumValue'],
            # **这一位必须收。**从前 build-weapons 按「实测最大值 > 100」猜哪些属性
            # 不是 0–100 量纲，猜出来的 7 个与库里标的 8 个不相等。那条注释写的
            # 字段名 displayAsNumericalStat 在 manifest 里出现 0 次，真名是这个。
            'displayAsNumeric': s['displayAsNumeric'],
            'displayInterpolation': [{'value': pt['value'], 'weight': pt['weight']}
                                     for pt in s.get('displayInterpolation') or ()],
        } for s in g.get('scaledStats') or ()]
        groups[h] = one

    rates_of(kept, groups)

    # 来源要从收藏条目上取：物品自己的 displaySource 在复刻武器上一律是「随机特性：
    # 此物品无法从收藏品再次获取」，分不出版本；collectible 的 sourceString 才写着
    # 「来源：众神殿」，那正是站内源稿标版本用的那个词。它本来就是另一张表的字段，
    # 从前贴在物品表的根上（一张表一个文件，那是越界），现在各归各的表。
    # 来源那一句写在**收藏条目**上：物品自己的 displaySource 在复刻武器上一律是
    # 「随机特性：此物品无法从收藏品再次获取」，分不出版本；collectible 的
    # sourceString 才写着「来源：众神殿」，那正是站内源稿标版本用的那个词。
    #
    # 它并进物品记录，不单出一张表：9238 件物品对 9238 条收藏条目，**严格一对一、
    # 零共用**——两张表就是同一个实体记两处，还多一次 join。
    coll_zh = load(src, 'zh', 'DestinyCollectibleDefinition')
    coll_en = load(src, 'en', 'DestinyCollectibleDefinition')
    for row in kept.values():
        h = str(row.get('collectibleHash') or '')
        c = coll_zh.get(h)
        if not c:
            continue
        if c.get('sourceHash'):
            # 来源的主键。站内「来源」那一列今天写的是中文散文，接上这一位之后
            # 那一列也能从主键派生。
            row['sourceHash'] = c['sourceHash']
        for lang, text in i18n_of(('sourceString', c.get('sourceString'),
                                   (coll_en.get(h) or c).get('sourceString'))).items():
            row.setdefault('i18n', {}).setdefault(lang, {}).update(text)
    del coll_zh, coll_en
    gc.collect()

    sets_zh = load(src, 'zh', 'DestinyEquipableItemSetDefinition')
    sets_en = load(src, 'en', 'DestinyEquipableItemSetDefinition')
    perks_zh = load(src, 'zh', 'DestinySandboxPerkDefinition')
    perks_en = load(src, 'en', 'DestinySandboxPerkDefinition')
    sets = {}
    for h, s in sets_zh.items():
        bonuses = []
        for p in s.get('setPerks') or ():
            ph = str(p['sandboxPerkHash'])
            if ph not in perks_zh:
                die('套装 %s 的 %d 件效果 %s 不在 SandboxPerk 表里'
                    % (h, p['requiredSetCount'], ph))
            # 效果的名字、说明与图标**不抄在这里**：指向 sandbox-perks 那一条即可，
            # 112 条全在库里。从前抄了，于是同一份双语文本在两张表上各有一份，
            # 而实体层那一侧的语言闸门看不见嵌在这里的 zh-CN。
            bonuses.append({'requiredSetCount': p['requiredSetCount'],
                            'perk': ['sandbox-perks', ph]})
        one = {'hash': int(h), 'setItems': list(s.get('setItems') or ()),
               'setPerks': bonuses}
        text = i18n_of(('name', (s.get('displayProperties') or {}).get('name'),
                        (sets_en[h].get('displayProperties') or {}).get('name')))
        if text:
            one['i18n'] = text
        sets[h] = one

    # **收全，不按 isDisplayable 筛。**物品记录的 `perks[].perkHash` 是物品表通向
    # 这张表的唯一连接键，筛掉 670 种之后那条链有 3513 处指空，而其中 8 条带着
    # 框架说明（`224136176` 的「在垂直方向上的后坐轨迹更加规则。可进行4发点射。」）。
    # 引用图自洽比表小一点重要。
    perks = {}
    for h, v in perks_zh.items():
        if v.get('redacted'):
            continue
        perks[h] = plain(h, v, perks_en.get(h))
    del sets_zh, sets_en, perks_zh, perks_en
    gc.collect()

    traits_zh = load(src, 'zh', 'DestinyTraitDefinition')
    traits_en = load(src, 'en', 'DestinyTraitDefinition')
    # 全表 554 条里 508 条两种语言的名字都是空串。站内按名字查这张表，那 508 条
    # 永远查不到；物品记录上又没有指向 traits 的键（`traitHashes` 零读者，没收），
    # 所以它们既进不来也出不去。只留叫得出名字的 46 条。
    traits = {}
    for h, v in traits_zh.items():
        if v.get('redacted'):
            continue
        dp = v.get('displayProperties') or {}
        if not (dp.get('name') or '').strip():
            continue
        # 46 条里 35 条是 keyword（游戏内的状态：不稳定、冻结、超凡），另 11 条是
        # 分类标签（光能增益、赛季），那 11 条的 displayHint 是空串。
        extra = {'displayHint': v['displayHint']} if v.get('displayHint') else None
        traits[h] = plain(h, v, traits_en.get(h), extra)
    del traits_zh, traits_en

    stats_zh = load(src, 'zh', 'DestinyStatDefinition')
    stats_en = load(src, 'en', 'DestinyStatDefinition')
    stats = {}
    for h, v in stats_zh.items():
        if v.get('redacted'):
            continue
        one = plain(h, v, stats_en.get(h))
        if int(h) in LOWER_IS_BETTER:
            one['derived'] = {'lowerIsBetter': True}
        stats[h] = one
    del stats_zh, stats_en, items
    gc.collect()

    out = (
        ('inventory-items.json', kept, '条'),
        ('sandbox-perks.json', perks, '条'),
        ('traits.json', traits, '条'),
        ('stats.json', stats, '条'),
        ('equipable-item-sets.json', sets, '套'),
        ('plug-sets.json', plugs, '份'),
        ('socket-types.json', types, '种'),
        ('stat-groups.json', groups, '组'),
    )
    # 实体表落 data/，构建期字典落 data/lookup/——后者不是实体：没有页面或配装
    # 指向它们，而且 hash 空间与实体撞号（plug-sets 最小号是 1，socket-types 里有 0）。
    LOOKUPS = ('plug-sets.json', 'socket-types.json', 'stat-groups.json')
    total = 0
    for name, payload, unit in out:
        where = LOOKUP_DIR if name in LOOKUPS else OUT_DIR
        size = dump(os.path.join(where, name), payload)
        total += size
        print('%-38s %6d %s  %9.1f KB'
              % (os.path.relpath(os.path.join(where, name), shell.ROOT),
                 len(payload), unit, size / 1024))
    print('%-38s %9.1f KB' % ('合计', total / 1024))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--distill', action='store_true', help='蒸馏十份定义表')
    ap.add_argument('--src', default=SRC, help='manifest_raw 目录')
    a = ap.parse_args()
    if not a.distill:
        ap.error('要做什么？现在只有 --distill')
    distill(os.path.realpath(a.src))


if __name__ == '__main__':
    sys.exit(main())
