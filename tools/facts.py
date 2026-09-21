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
import glob
import json
import os
import re
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

# 异域。`inventory.tierType` 的 6 就是它，5 是传说。
EXOTIC_TIER = 6
# 皮肤（Ornament）。
ORNAMENT = 21


def EXOTIC(item):                                            # noqa: N802
    return (item.get('inventory') or {}).get('tierType') == EXOTIC_TIER

# 这几个键在 project() 里换了形状，所以不照抄：
#   displayProperties  拆成 icon 与 i18n
#   那三个显示名与 displaySource  随语言变，进 i18n
#   两张水印  路径归一化成文件名
#   inventory / equippingBlock / plug / perks / investmentStats / sockets / stats
#     只留站内读得到的那几位，各自在下面有一行理由
# manifest 上有、站内一个读者都没有的那些。当初开的是「全收，以后发现真没用到
# 再去掉」，这就是那一次去掉：物品表 63 个字段里这 38 个占 24.9%（5.0 MB），
# 分四类，各自的理由——
#
#   UI 与外壳          action（「拆解」这个动词）、tooltipNotifications、tooltipStyle、
#                      backgroundColor、uiItemDisplayStyle、allowActions、equippable、
#                      nonTransferrable、isWrapper、isFeaturedItem、specialItemType、
#                      doesPostmasterPullHaveSideEffects、acquireRewardSiteHash、
#                      acquireUnlockHash
#   大图与预览          screenshot、preview、secondaryIcon、iconWatermarkShelved
#   已有更好的那一位    damageTypes／damageTypeHashes／defaultDamageTypeHash（留
#                      defaultDamageType 那个枚举）、traitHashes（留 traitIds，
#                      derived.release 认的就是它）、breakerTypeHash（留
#                      derived.breakerType，全表只有 17 条）、seasonHash（7 条全空，
#                      留 derived.season）、quality（版本与灌注档位，站内按
#                      iconWatermark 认赛季）、translationBlock（锻造图样，站内按
#                      derived.craftable 认）
#   指向没收的表        loreHash（DestinyLoreDefinition 不收）、objectives、talentGrid、
#                      sack、metrics、value、preview
DROPPED = frozenset({
    'action', 'tooltipNotifications', 'tooltipStyle', 'backgroundColor',
    'uiItemDisplayStyle', 'allowActions', 'equippable', 'nonTransferrable',
    'isWrapper', 'isFeaturedItem', 'specialItemType',
    'doesPostmasterPullHaveSideEffects', 'acquireRewardSiteHash', 'acquireUnlockHash',
    'screenshot', 'preview', 'secondaryIcon', 'iconWatermarkShelved',
    'damageTypes', 'damageTypeHashes', 'defaultDamageTypeHash', 'traitHashes',
    'breakerTypeHash', 'seasonHash', 'quality', 'translationBlock',
    'loreHash', 'objectives', 'talentGrid', 'sack', 'metrics', 'value',
})

RESHAPED = DROPPED | frozenset({
    'hash', 'redacted', 'blacklisted', 'displayProperties',
    'itemTypeDisplayName', 'itemTypeAndTierDisplayName', 'flavorText', 'displaySource',
    'iconWatermark', 'iconWatermarkFeatured',
    'inventory', 'equippingBlock', 'plug', 'perks', 'investmentStats', 'sockets', 'stats',
})

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


def COSMETIC(entry, socket_types):                           # noqa: N802
    """这一栏装的是外观（皮肤、着色器、饰纹）。"""
    return any(m in socket_kind(entry, socket_types) for m in COSMETIC_MARKS)

# 数值越低越好的那三项。**manifest 里推不出来**：它们与另外 23 项属性的
# statCategory 与 aggregationType 完全相同，没有任何一位把它们分开。所以这一份
# 是人记的，改了游戏才会变。destiny.report 也是硬编码同样三条。
LOWER_IS_BETTER = frozenset({447667954, 2961396640, 3481294762})  # 蓄力时间 充能时间 发热量

# 发布版本 → 赛季号。**不能算，只能查**：版本号跳跃不规则（420→450、540→600、
# 820→900→910→950→960→970），且 v500 起资料片本体（.annual/.core）与它的首季
# （.season）共用一个赛季。
#
# 这张表与 DIM 的 watermark-to-season 交叉验证过：可比的 2115 件里 1745 件逐条
# 相同，唯一的分歧是 DIM 那张表**停在第 28 季**，把第 29 季的 370 件错标成 28。
# 所以不要反过来抄它。
#
# 脏桶只有 v400.season：活动武器全塞在这一个 traitId 里，横跨六季，判不出就不写。
SEASON = {
    'v300.annual': 1,  'v310.season': 2,  'v320.season': 3,  'v400.annual': 4,
    'v410.season': 5,  'v420.season': 6,  'v450.season': 7,  'v460.season': 8,
    'v470.season': 9,  'v480.season': 10, 'v490.season': 11,
    'v500.annual': 12, 'v500.season': 12, 'v510.season': 13, 'v520.season': 14,
    'v530.season': 15, 'v540.season': 15, 'v600.annual': 16, 'v600.season': 16,
    'v610.season': 17, 'v620.season': 18, 'v630.season': 19,
    'v700.annual': 20, 'v700.season': 20, 'v710.season': 21, 'v720.season': 22,
    'v730.season': 23, 'v800.annual': 24, 'v800.season': 24, 'v810.season': 25,
    'v820.season': 26, 'v900.core': 27, 'v900.dlc': 27, 'v910': 27, 'v910.core': 27,
    'v950': 28, 'v950.core': 28, 'v950.dlc': 28,
    'v960': 29, 'v960.core': 29, 'v970': 29, 'v970.core': 29,
}
# 没有后缀的 v910/v950/v960/v970 与各自的 .core 共用同一张赛季水印，逐件核对过
# （v960 那 30 件与 v960.core 那 28 件都是 e78fd9419f99464816…），所以同一季。
# 留空的只有两桶：v400.season 是活动武器，destiny.report 给的赛季号横跨第 4、8、
# 15、18、22、25 季，判不出；v350.season 那 45 件至日活动护甲自成一张水印、没有
# 同伴可比。

# 活动武器的赛季号。它们全塞在 `releases.v400.season` 这一个 traitId 里，横跨六季，
# 而 manifest 上再没有别的信号——`seasonHash` 是空的，赛季水印十六件共用同一张。
# 这一档抄 destiny.report：两边都有赛季号的 2190 件逐条相同，所以它那一份可信，
# 这十六件只是我们查不到、它查得到。
SEASON_BY_ITEM = {
    177568179: 22,    # 恐怖故事
    413901114: 22,    # 寰宇
    425681240: 25,    # 寰宇
    528834068: 8,     # 布瑞科技狼人
    689294985: 25,    # 侏罗纪绿
    1280894514: 18,   # 机械死神
    2261046232: 15,   # 侏罗纪绿
    2477980485: 25,   # 机械死神
    2603335652: 18,   # 侏罗纪绿
    2869466318: 18,   # 布瑞科技狼人
    3103255595: 22,   # 侏罗纪绿
    3325463374: 4,    # 雷神
    3558681245: 25,   # 布瑞科技狼人
    3649985571: 25,   # 奥术之拥
    3829285960: 4,    # 恐怖故事
    3871226707: 22,   # 机械死神
}

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


# 键本身、以及对站内没有意义的两个删除标记。除这三个之外，manifest 上有的键一律
# 原样写下来——白名单开窄过一次，`damageType`（这枚效果属哪个元素，着色闸门的依据）
# 与 `isDisplayable` 就是那样在 5200 条 SandboxPerk 上整列消失的。
SKIP = ('hash', 'redacted', 'blacklisted', 'displayProperties')


def plain(key, zh, en, extra=None):
    """sandbox-perks / traits / stats 三张表共用的一条。

    `displayProperties` 拆成 `icon` 与 `i18n`（图与语言各归各的），其余字段原样照抄。
    """
    dp = zh.get('displayProperties') or {}
    od = (en or {}).get('displayProperties') or {}
    out: dict[str, object] = {f: v for f, v in zh.items() if f not in SKIP}
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
    # manifest 上有的键一律原样写下来，下面这几个除外——它们在这里换了形状，
    # 各自有一行理由：图与语言拆出去、几个大块只留站内读得到的那一位。
    out: dict[str, object] = {f: v for f, v in item.items() if f not in RESHAPED}
    for field in WATERMARKS:
        if field in item:
            out[field] = icon_of(item[field])
    if 'icon' in dp:
        out['icon'] = icon_of(dp['icon'])
    text = i18n_of(
        ('name', dp.get('name'), od.get('name')),
        ('database_details', dp.get('description'), od.get('description')),
        ('displaySource', item.get('displaySource'), other.get('displaySource')),
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
    # 装这枚插件要花几点护甲能量。护甲模组页的「费用」那一列就是它，从前那 70 格
    # 各存一份，而 manifest 上本来就有。
    src = item.get('plug') or {}
    plug = {f: src[f] for f in ('plugCategoryIdentifier',) if f in src}
    if 'energyCost' in src and 'energyCost' in src['energyCost']:
        plug['energyCost'] = src['energyCost']['energyCost']
    if plug:
        out['plug'] = plug
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
        got = SEASON_BY_ITEM.get(int(key)) or SEASON.get(derived['release'])
        if got:
            # 赛季号查表得来，不是 manifest 的字段，所以与 release 并排放在 derived 里。
            derived['season'] = got
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


def sockets_of(item, socket_types, gone):
    """一把武器的插槽，原样存下：栏序即 `socketEntries` 的下标，不另记位置。

    `reusablePlugItems` 只在该条**没有任何 plugSet hash** 时写（548 条）。全写会让
    物品表从 24.8 MB 涨到 36.0 MB，而带 plugSet 的那些清单去 `plug-sets.json` 取，
    一份插件清单因此只存一遍。

    **外观那几栏只留 `socketTypeHash`。**皮肤（itemSubType 21）不入表，那几栏里的
    插件清单会因此全部悬空；整条删掉又会让后面几栏的下标前移，而栏序就是下标。
    留一个空栏两头都保住。
    """
    blk = item.get('sockets') or {}
    entries = []
    for e in blk.get('socketEntries') or ():
        one: dict[str, object] = {}
        if socket_kind(e, socket_types) and COSMETIC(e, socket_types):
            if 'socketTypeHash' in e:
                one['socketTypeHash'] = e['socketTypeHash']
            entries.append(one)
            continue
        for field in ('socketTypeHash', 'reusablePlugSetHash', 'randomizedPlugSetHash'):
            if field in e:
                one[field] = e[field]
        # 指向皮肤的引用一律不写：栏位类型认不出外观的那 41 条「默认皮肤」就是
        # 从这里漏出去的，按栏位类别判漏得掉，按目标判漏不掉。
        if e.get('singleInitialItemHash') not in gone:
            if 'singleInitialItemHash' in e:
                one['singleInitialItemHash'] = e['singleInitialItemHash']
        if not (e.get('reusablePlugSetHash') or e.get('randomizedPlugSetHash')):
            inline = [{'plugItemHash': p['plugItemHash']}
                      for p in e.get('reusablePlugItems') or ()
                      if p['plugItemHash'] not in gone]
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


# 大师杰作槽里不算催化剂的那几档：击杀记录器、属性大师杰作、旧的通用大师杰作。
# 它们的 categoryIdentifier 都带 masterwork，按含不含 masterwork 认会把它们收进来。
NOT_CATALYST = ('.masterworks.stat', '.masterworks.generic', 'armor.masterworks')


def CATALYST_SOCKET(entry, socket_types):                    # noqa: N802
    """这一栏是催化槽。"""
    ident = socket_kind(entry, socket_types)
    return (MASTERWORK_MARK in ident and not ident.startswith(TRACKER_KIND)
            and not any(m in ident for m in NOT_CATALYST))


def own_catalyst_cats(items, socket_types):
    """催化槽白名单里**只被一把异域武器引用**的类目。

    白名单里另有几个是好几把枪共用的（`exotic_weapon_masterwork_upgrade` 133 把、
    `v400.empty.exotic.masterwork` 115 把、`catalysts` 17 把）：它们说的是「这一档
    异域都有催化槽」，不是「这一枚是它的催化剂」，按它们查会把别人的催化剂收进来。
    """
    use = collections.Counter()
    for item in items.values():
        if item.get('itemType') != 3 or not EXOTIC(item):
            continue
        for e in (item.get('sockets') or {}).get('socketEntries') or ():
            if not CATALYST_SOCKET(e, socket_types):
                continue
            st = socket_types.get(str(e.get('socketTypeHash'))) or {}
            for w in {x.get('categoryIdentifier', '') for x in st.get('plugWhitelist') or ()}:
                if not any(m in w for m in NOT_CATALYST):
                    use[w] += 1
    return {k for k, n in use.items() if n == 1}


def catalysts_of(item, items, socket_types, plug_sets, by_cat):
    """这把枪的催化剂：催化槽里插得进去的那些。

    **两条路都要走。**槽里现成的清单（初始、内联、插件池）覆盖 105 把；另外 29 把
    老枪的催化剂只在「plugCategoryIdentifier 落在这个槽白名单上」那一侧，
    `1783582993 血色浪漫催化` 就是这么找回来的。

    留下来的判据是结构的：`tierType` 6，或者带 `perks`。剩下的是插槽状态——
    「可以将异域催化插入此插槽」与「将此武器升级为大师杰作」两条，名字跟着武器叫
    （同样叫「血色浪漫催化」），只看名字分不出来。

    一把枪不止一枚是常态：29 把是同一枚催化剂的重复版，12 把的催化槽本来就是
    一池多选（库尔之影四枚魂火、零号修订四个可制作改装），站内那一格因此写的是
    「可选 Perk」「可制作改装」这样的槽位说明词，不是某一个名字。

    **任务态不留。**同一枚催化剂在库里常有两条：解锁前那条叫「升级大师杰作」、
    品阶普通、说明写着「使用越橘消灭敌人可解锁此升级」，解锁后那条叫「越橘催化」、
    品阶异域。两条给的效果是同一批，前者是后者的子集。按「效果被品阶更高的那一枚
    全包住」丢掉前者——名字分不出来，它跟着武器叫。
    """
    got = []
    for e in (item.get('sockets') or {}).get('socketEntries') or ():
        if not CATALYST_SOCKET(e, socket_types):
            continue
        pool = []
        if e.get('singleInitialItemHash'):
            pool.append(str(e['singleInitialItemHash']))
        pool += [str(p['plugItemHash']) for p in e.get('reusablePlugItems') or ()]
        for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
            if e.get(field):
                pool += [str(p['plugItemHash'])
                         for p in (plug_sets.get(str(e[field])) or {}).get(
                             'reusablePlugItems') or ()]
        st = socket_types.get(str(e.get('socketTypeHash'))) or {}
        for w in {x.get('categoryIdentifier', '') for x in st.get('plugWhitelist') or ()}:
            pool += by_cat.get(w, ())
        for key in pool:
            one = items.get(key)
            if not one or key in got:
                continue
            if (one.get('inventory') or {}).get('tierType') == 6 or one.get('perks'):
                got.append(key)

    def spec(key):
        one = items.get(key) or {}
        return (frozenset(p['perkHash'] for p in one.get('perks') or ()),
                (one.get('inventory') or {}).get('tierType') or 0)
    keep = []
    for key in got:
        mine, tier = spec(key)
        if mine and any(other != key and spec(other)[1] > tier and mine <= spec(other)[0]
                        for other in got):
            continue
        keep.append(key)
    return sorted({int(x) for x in keep})


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


# 站内写的那些字段。**这是一份名单，不是判据**——判据在 carry_site 那里，是结构上的
# 「这一轮没蒸出来的键」；这份名单只给 link() 用，它要知道该把哪些字段互相补齐。
SITE_FIELDS = ('realgame_details', 'realgame_details#2', '效果', '异域 PERK', '右栏',
               '冷却与槽位', '基础冷却', '冷却', '属性变化', '碎片槽位', '来源')


def link(tabs, icon_dir):
    """由记录推记录，跑几遍结果相同。三件事：

    **一、本地图。**`icon` 是 Bungie 原图的文件名（拉图要用它的扩展名），`icon_local`
    是站上发的那一张。两个都存：读图的不必换扩展名，拉图的不必重蒸 manifest。

    **二、同一件东西的几枚 hash 互相补齐。**一个站内的行常常盖住好几枚 hash——普通版
    与强化版、一族元素变体，`covers` 记着。从前说明只落在行首那一枚上，另外 821 枚是
    空的，查强化版查得到、查普通版查不到。现在同组每一枚都拿到同一份说明。

    `covers` 本身**不改方向**：它是源稿那一行写下来的「这一行还盖住谁」，反向写回去
    会让第二遍跑时组与组连成一片传递合并（实测一条记录的 covers 从 8 枚涨成一串）。

    **三、SandboxPerk 那一侧。**站内的实测说明写在**插件**上（「雪上加霜」写在
    788178929 上），而 374284927 才是那枚效果本身。一枚效果名下的插件对同一个字段
    只有一种说法时抄过来；有好几种说法的（`3486450016` 有 41 种）那段文字属于各个
    插件、不属于这枚效果，不抄，靠 `onItems` 指回去。
    """
    items, perks, sets = tabs['inventory-items'], tabs['sandbox-perks'], tabs[
        'equipable-item-sets']
    for table in tabs.values():
        for row in table.values():
            row.pop('icon_from', None)
            if 'icon' not in row:
                # Bungie 没给图的那些，站上发的是自己画的一张（护甲模组族那 11 个、
                # 刀剑那三项属性、自发主键的机制行）。`icon_local` 是人写的，不动。
                continue
            row.pop('icon_local', None)
            name = os.path.splitext(os.path.basename(row['icon']))[0] + '.webp'
            if os.path.exists(os.path.join(icon_dir, name)):
                row['icon_local'] = 'assets/icons/' + name

    def site_of(row):
        zh = (row.get('i18n') or {}).get('zh-CN') or {}
        return {f: zh[f] for f in SITE_FIELDS if zh.get(f)}

    for table in tabs.values():
        groups = []
        for key, row in table.items():
            if row.get('covers'):
                groups.append([key] + [str(c) for c in row['covers']])
        for group in groups:
            rows = [table[k] for k in group if k in table]
            said = {}
            for row in rows:
                said.update(site_of(row))
            for row in rows:
                row.setdefault('i18n', {}).setdefault('zh-CN', {}).update(said)
            # 图取**基础版**那一枚。同一行常常盖着普通版与强化版，强化版的图上多一道
            # 金条与金箭头，站内一律显示素的那张。判据是品阶名里带不带「强化」——
            # tierType 分不出来：武器模组那一批两版都是 5。
            base = [k for k, row in zip(group, rows)
                    if '强化' not in ((row.get('i18n') or {}).get('zh-CN') or {})
                    .get('itemTypeAndTierDisplayName', '')]
            if base and base[0] != group[0] and 'icon' in table[base[0]]:
                rows[0]['icon_from'] = int(base[0])

    for row in perks.values():
        row.pop('onItems', None)
        row.pop('onSets', None)
    says = collections.defaultdict(lambda: collections.defaultdict(set))
    back = collections.defaultdict(set)
    for key, row in items.items():
        mine = site_of(row)
        for p in row.get('perks') or ():
            ph = str(p['perkHash'])
            back[ph].add(int(key))
            for f, v in mine.items():
                says[ph][f].add(v)
    for key, one in sets.items():
        for p in one.get('setPerks') or ():
            # 套装那两条效果不挂在任何一件物品上，挂在套装本身。
            perks.setdefault(p['perk'][1], {}).setdefault('onSets', [])
            if int(key) not in perks[p['perk'][1]]['onSets']:
                perks[p['perk'][1]]['onSets'].append(int(key))
    for ph, fields in says.items():
        row = perks.get(ph)
        if row is None:
            continue
        zh = row.setdefault('i18n', {}).setdefault('zh-CN', {})
        for f, vals in fields.items():
            if len(vals) == 1 and not zh.get(f):
                zh[f] = next(iter(vals))
    for ph, owners in back.items():
        row = perks.get(ph)
        if row is not None:
            row['onItems'] = sorted(owners)


# 站内够不着、也不该留的那几类插件。判据是 plugCategoryIdentifier 的前缀——
# 外观、动作、飞船、机灵投影、徽标、击杀记录器、状态提示。它们连站内一条引用都没有。
COSMETIC_PLUGS = ('emote', 'shader', 'hologram', 'ship.', 'events.', 'social.',
                  'v300.ghosts', 'v300.vehicles', 'plugs.ghosts', 'dawning_ship',
                  'emblem.', 'ghost.tracker', 'v500.ships', 'armor_skins',
                  'enhancements.ghosts', 'generic_all_vfx', 'weapon_tiering_kill_vfx',
                  'v900weapon', 'status_effect_tooltip')
LANE_LINE = re.compile(r'^==')


def seeds(root):
    """源稿每一行点名的主键。表区是「列：」那一行加紧接着的连续非空行；护甲套装页与
    神器模组页是分节式，整篇都算表区，行前有缩进。"""
    got = set()
    pages = sorted(glob.glob(os.path.join(root, 'references', 'docs', '*.md'))
                   + glob.glob(os.path.join(root, 'references', 'keys', '*.md')))
    for path in pages:
        loose = os.path.basename(path) in ('armor-sets.md', 'artifact-mods.md')
        inside = loose
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                line = line.rstrip('\n')
                if line.startswith('列：'):
                    inside = True
                    continue
                if not loose and (not line.strip() or line.startswith('##')):
                    inside = False
                    continue
                if not inside or LANE_LINE.match(line.strip()):
                    continue
                for key in line.strip().partition('  ')[0].split():
                    key = re.sub(r'^(perk|trait|stat|set):', '', key)
                    if key.isdigit():
                        got.add(key)
    # 页面 JSON 点名的也算：矩阵表那种一行指向别的主键的格子放在那里，被指到的
    # 那几枚不在任何一行的行首上，只有这一条路够得到它们。
    for path in sorted(glob.glob(os.path.join(root, 'references', 'pages', '*.json'))):
        with open(path, encoding='utf-8') as fh:
            one = json.load(fh)
        for sec in one.get('matrix') or ():
            for cells in (sec.get('行') or {}).values():
                for cell in cells:
                    key = re.sub(r'^(perk|trait|stat|set):', '', str(cell or ''))
                    if key.isdigit():
                        got.add(key)
    if len(got) < 2000:
        die('源稿只点到 %d 枚主键，比预期少太多，裁剪会把库砍光' % len(got))
    return got


def trim(kept, plugs, sets, root):
    """裁到站内用得上的那些，并把指向被裁掉那些的引用一并去掉。

    **判据是可达性，不是类型名单**：从源稿点名的主键出发，顺 `covers`（同一行写下的
    别的 hash）、插槽、插件池走一遍，走得到的留。换赛季重跑自动跟着变，不必维护名单。

    三条例外，都是人定的：

    - **武器全留。**武器库那一页列的是全部 2208 把，其中一千多把不在任何资料页上有行。
    - **护甲只留异域。**5681 件传说护甲站内没有一页按件列它们；护甲套装那 56 套的
      成员件也不留，站内只用套装本身与它的两条效果，`setItems` 因此整个字段去掉。
    - **外观与往季神器模组不留。**前者见 COSMETIC_PLUGS，后者是别的赛季的神器特性，
      源稿点名的那 147 个之外一律不要。

    裁完把引用一起收干净：指向被裁掉那些的插槽初始值、内联插件、插件池成员、
    神器档位成员，写下来就是悬空。
    """
    seed = seeds(root)
    want = set()
    stack = [s for s in seed if s in kept]
    stack += [h for h, row in kept.items() if row.get('itemType') == 3]
    while stack:
        key = stack.pop()
        if key in want or key not in kept:
            continue
        want.add(key)
        row = kept[key]
        for one in row.get('covers') or ():
            stack.append(str(one))
        for e in (row.get('sockets') or {}).get('socketEntries') or ():
            if e.get('singleInitialItemHash'):
                stack.append(str(e['singleInitialItemHash']))
            for p in e.get('reusablePlugItems') or ():
                stack.append(str(p['plugItemHash']))
            for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
                if e.get(field):
                    for p in (plugs.get(str(e[field])) or {}).get('reusablePlugItems') or ():
                        stack.append(str(p['plugItemHash']))
        arch = (row.get('derived') or {}).get('archetype')
        if arch:
            stack.append(str(arch))
        for one in (row.get('derived') or {}).get('catalyst') or ():
            stack.append(str(one))
        for tier in (row.get('derived') or {}).get('tiers') or ():
            for m in tier.get('items') or ():
                stack.append(str(m['itemHash']))
    for key, row in list(kept.items()):
        cat = (row.get('plug') or {}).get('plugCategoryIdentifier') or ''
        if row.get('itemType') == 3:
            continue
        if row.get('itemType') == 2:
            if not EXOTIC(row):
                del kept[key]
            continue
        if (key not in want
                or any(x in cat for x in COSMETIC_PLUGS)
                or ('artifact_perks' in cat and key not in seed)):
            del kept[key]
    gone = {int(k) for k in want | set(kept) if k not in kept} | set()
    live = {int(k) for k in kept}
    for row in kept.values():
        for e in (row.get('sockets') or {}).get('socketEntries') or ():
            if e.get('singleInitialItemHash') not in live:
                e.pop('singleInitialItemHash', None)
            if 'reusablePlugItems' in e:
                e['reusablePlugItems'] = [p for p in e['reusablePlugItems']
                                          if p['plugItemHash'] in live]
                if not e['reusablePlugItems']:
                    del e['reusablePlugItems']
        for tier in (row.get('derived') or {}).get('tiers') or ():
            tier['items'] = [m for m in tier.get('items') or ()
                             if m['itemHash'] in live]
        cat = (row.get('derived') or {}).get('catalyst')
        if cat:
            row['derived']['catalyst'] = [c for c in cat if c in live]
            if not row['derived']['catalyst']:
                del row['derived']['catalyst']
        if 'covers' in row:
            row['covers'] = [c for c in row['covers'] if c in live]
            if not row['covers']:
                del row['covers']
    for h, one in list(plugs.items()):
        one['reusablePlugItems'] = [p for p in one.get('reusablePlugItems') or ()
                                    if p['plugItemHash'] in live]
    keep_sets = {str(e[f]) for row in kept.values()
                 for e in (row.get('sockets') or {}).get('socketEntries') or ()
                 for f in ('reusablePlugSetHash', 'randomizedPlugSetHash') if e.get(f)}
    for h in list(plugs):
        if h not in keep_sets:
            del plugs[h]
    return gone


def carry_site(path, payload):
    """把盘上那一份里**站内写的东西**带过来。

    站内写的与 manifest 字段住在同一条记录里（一个 hash 一条记录，关于它的一切
    挂在它名下），所以这里必须显式接住，否则 `--distill` 一跑就全冲掉。判据是
    结构上的、不靠列名单：**这一轮没蒸出来的键就是站内的**——

    - 根上：`Aegis`、`LGpig`（两位作者的评级与推荐）、`variants`（同一来源对同一
      枚 hash 说了不止一段时的第二段起）、`enhanced`（装上 `by` 里的星相之后这项
      技能多出来的效果）、`weaponTypes`（框架在某几种枪型上的说明）、
      `covers`（同一件东西的别的 hash）、
      以及 Bungie 压根没给图时站内自己配的 `icon`。
    - `i18n.<语言>` 里：`realgame_details`、`异域 PERK`、`冷却与槽位` 这些
      Compendium 那一档的正文。它是站内的根本数据，不是谁的判断，所以与
      `name`、`database_details` 并排，不缩进一层。

    盘上有、这次没蒸出来的记录当场报出：那说明白名单收窄了，而那条记录名下还挂着
    站内的东西，静默丢掉就是丢数据。
    """
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        old = json.load(f)
    # 判据按**整张表**算，不按单条记录：这一轮蒸出来的键，整张表都归蒸馏管。按单条
    # 判会把「这一条没蒸出来、别的条蒸出来了」的键当成站内写的带回来——改成只收异域
    # 护甲的插槽之后，5700 件传说护甲的旧 sockets 就是这样整批赖着不走的。
    # DROPPED 那批整张表都不再产出，不加进来会被当成「站内写的」整批带回来。
    made = ({k for row in payload.values() for k in row} | DROPPED
            | {'insertAction', 'visibility', 'isPreviewEnabled', 'overridesUiAppearance',
               'hideDuplicateReusablePlugs', 'avoidDuplicatesOnInitialization',
               'alwaysRandomizeSockets', 'currencyScalars'})
    made_text = {lang: {f for row in payload.values()
                        for f in (row.get('i18n') or {}).get(lang, ())}
                 for lang in ('zh-CN', 'en')}
    lost = []
    for key, row in old.items():
        mine = {k: v for k, v in row.items() if k != 'i18n' and k not in made}
        extra = {lang: {f: v for f, v in fields.items()
                        if f not in made_text.get(lang, ())}
                 for lang, fields in (row.get('i18n') or {}).items()}
        extra = {lang: v for lang, v in extra.items() if v}
        if not mine and not extra:
            continue
        if key not in payload:
            # 报不报警看**人写的**东西在不在：`authors`、`variants`、`enhanced`、
            # `weaponTypes`，以及 i18n 里 SITE_FIELDS 那些正文。`icon_local`／`onItems`／
            # `covers` 是 link() 推出来的，丢了下一轮照样能推回来，不值得中止。
            if (row.keys() & {'authors', 'variants', 'enhanced', 'weaponTypes'}
                    or any(f in SITE_FIELDS for v in (row.get('i18n') or {}).values()
                           for f in v)):
                lost.append(key)
            continue
        payload[key].update(mine)
        for lang, fields in extra.items():
            payload[key].setdefault('i18n', {}).setdefault(lang, {}).update(fields)
    if lost:
        die('%s 里这些记录名下挂着站内写的东西，这次却没蒸出来：%s'
            % (os.path.basename(path), '、'.join(sorted(lost)[:8])))


def dump(path, payload):
    """一条记录一行。这几份随 manifest 重生成并入库，按行写让 git 存得下增量。

    **记录里不写 `hash`**：键就是它，30058 条逐条核对过零例外。写下来是同一个
    事实存两处，也是 1.1 MB。
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rows = ',\n'.join(
        '  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, sort_keys=True))
        for k, v in sorted(payload.items(), key=lambda kv: int(kv[0])))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % rows)
    return os.path.getsize(path)


# ── 站内文字的工作副本 ─────────────────────────────────────────────────
# 在线编辑台改得动的那一层：记录上站内写的文字。库里 recs 集合一条记录一份，
# `_id` 是「表名/裸 hash」，正文是 site_text() 那张扁平表的 canon()；tools/sync.py
# 按三方比对账，与 docs 那一路同一套规矩。
TABLES = ('inventory-items', 'sandbox-perks', 'traits', 'stats', 'equipable-item-sets',
          'minted')

# i18n 里 manifest 那一侧的字段。minted 没有 manifest，它的 i18n 全是站内写的。
MANIFEST_TEXT = frozenset({'name', 'itemTypeDisplayName', 'itemTypeAndTierDisplayName',
                           'flavorText', 'sourceString', 'displaySource', 'database_details'})

# 根上装站内文字的几个键。`site_` 前缀那批是数值、主键与文件名，不是文字，只在本机改。
SITE_ROOT = ('enhanced', 'weaponTypes', 'authors', 'variants')


def table_file(table):
    return os.path.join(OUT_DIR, table + '.json')


def site_text(table, row):
    """一条记录上站内写的文字：`{字段路径: 文字}`，只收字符串叶子。

    路径按层用 `/` 接，数组下标写十进制：`i18n/zh-CN/site_authors/LGpig/lgpig_tier`、
    `enhanced/0/realgame_details`。键名里没有 `/`，所以这一刀不会切错。
    """
    out = {}

    def walk(v, path):
        if isinstance(v, str):
            out['/'.join(path)] = v
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, path + [k])
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, path + [str(i)])

    for k, v in ((row.get('i18n') or {}).get('zh-CN') or {}).items():
        if table == 'minted' or k not in MANIFEST_TEXT:
            walk(v, ['i18n', 'zh-CN', k])
    for k in SITE_ROOT:
        if k in row:
            walk(row[k], [k])
    return out


def canon(flat):
    """扁平表的规范文本。库里存它、hash 算它；云函数那一侧的 canon() 与它逐字节相同。"""
    return json.dumps(flat, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


# 线上只能新添这一格：页面上显示的是官方描述、站内还没写说明的那种。别的路径必须已经
# 在记录上——新添 i18n.zh-CN 下别的键会写进 manifest 字段，或把一个对象换成字符串。
NEW_LEAF = re.compile(r'^i18n/zh-CN/realgame_details$')


def put_site_text(table, row, flat):
    """把库里那一份站内文字写回记录。写完 site_text(row) 必须逐项等于 flat。

    线上的编辑只改已有的叶子、或新添 NEW_LEAF 那一格，所以别的路径缺了父层即中止：
    那说明库里那一份与盘上的记录结构对不上，写下去就是凭空造结构。
    """
    now = site_text(table, row)
    for path in now:
        if path not in flat:
            if not NEW_LEAF.match(path):
                die('%s：库里那一份少了 %s，这一层线上删不掉' % (table, path))
            del row['i18n']['zh-CN'][path.split('/')[2]]
    for path, value in flat.items():
        if now.get(path) == value:
            continue
        parts = path.split('/')
        node = row
        for i, part in enumerate(parts[:-1]):
            if isinstance(node, list):
                node = node[int(part)]
                continue
            if part not in node:
                if not NEW_LEAF.match(path):
                    die('%s：%s 在盘上的记录里没有 %s 这一层' % (table, path, '/'.join(parts[:i + 1])))
                node[part] = {}
            node = node[part]
        last = parts[-1]
        if isinstance(node, list):
            node[int(last)] = value
        else:
            node[last] = value
    if site_text(table, row) != flat:
        die('%s：写回之后的站内文字与库里那一份对不上' % table)


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
    gone = set()                      # 丢掉的皮肤，指向它们的引用一律不写
    for h, item in items.items():
        if item.get('redacted') or item.get('blacklisted'):
            continue
        if item.get('itemType') not in KEEP_TYPES and not item.get('plug'):
            continue
        if item.get('itemSubType') == ORNAMENT:
            # 皮肤：站内没有一页列它们，3688 条只占位置。指向它们的引用一律不写，
            # 见 sockets_of() 与下面的 plug-sets。
            gone.add(int(h))
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
    own_cats = {}
    for cat in own_catalyst_cats(items, socket_types):
        own_cats[cat] = [h for h, v in items.items()
                         if (v.get('plug') or {}).get('plugCategoryIdentifier') == cat]
    want_sets, want_types = set(), set()
    for h, row in kept.items():
        item = items[h]
        if item.get('breakerType'):
            # manifest 自己标了的照搬进 derived——消费方只读 derived 那一位，
            # 只给武器算会漏掉 `3387424189` 过载霰弹枪这一条。
            row.setdefault('derived', {})['breakerType'] = item['breakerType']
        # **异域护甲的插槽也收。**从前这里只收武器（itemType 3），护甲一条插槽都没有，
        # 于是异域护甲的固有 Perk 没处查——站内「异域 PERK」那一列的名字落不到主键上，
        # 只能按名字全库猜，而那些名字大面积撞号。传说护甲不收：站内没有一页按件列它们，
        # 而 5700 件的插槽要多占 7 MB。
        if item.get('itemType') == 3 or (item.get('itemType') == 2 and EXOTIC(item)):
            got = sockets_of(item, socket_types, gone)
            if got:
                row['sockets'] = got
            # 范围从**写下来的那一份**取，不从原始 socketEntries 取：外观那几栏
            # 只留了栏位，它们的插件清单不该再被收进 plug-sets。
            entries: list = list((got or {}).get('socketEntries') or ())  # type: ignore[arg-type]
            for e in entries:
                if 'socketTypeHash' in e:
                    want_types.add(str(e['socketTypeHash']))
                for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
                    if e.get(field):
                        want_sets.add(str(e[field]))
        if item.get('itemType') != 3:
            continue
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
        if EXOTIC(item):
            # 催化剂是异域独有的。传说武器的大师杰作槽里装的是「1 阶：冲击」那
            # 三十二枚属性档位，按同一条路查会把它们当成催化剂。
            got = catalysts_of(item, items, socket_types, plug_sets, own_cats)
            if got:
                derived['catalyst'] = got
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
            if p['plugItemHash'] in gone:
                continue
            one: dict[str, object] = {'plugItemHash': p['plugItemHash']}
            if not p.get('currentlyCanRoll'):
                # 「这一枚已经开不出来了」。**这份 manifest 里武器一枚都没标**：
                # 全库 4416 项全在护甲的 plug-set 上，而护甲插槽不收，所以这一位
                # 写下来是 0 处。留着，收护甲插槽那天它就有用了。
                one['currentlyCanRoll'] = False
            rows.append(one)
        one = {f: v for f, v in plug_sets[h].items() if f not in SKIP}
        one['reusablePlugItems'] = rows
        plugs[h] = one
    types = {}
    for h in want_types:
        st = socket_types.get(h) or {}
        one: dict[str, object] = {}
        # 插槽类型上那几位是「这一栏在界面上怎么表现」——插入动作、可不可预览、
        # 要不要盖掉外观、随不随机——站内一个读者都没有，占 124 KB。
        ui = ('insertAction', 'visibility', 'isPreviewEnabled', 'overridesUiAppearance',
              'hideDuplicateReusablePlugs', 'avoidDuplicatesOnInitialization',
              'alwaysRandomizeSockets', 'currencyScalars')
        one.update({f: v for f, v in st.items() if f not in SKIP and f not in ui})
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
        one: dict[str, object] = {f: v for f, v in g.items() if f not in SKIP}
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
        # **成员件不存。**站内只用套装本身与它那两条效果；15 件成员（5 个部位 ×
        # 3 个职业）一条都没人查，而收下它们就要把 840 件传说护甲一起留在库里。
        one = {'setPerks': bonuses}
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

    trim(kept, plugs, sets, shell.ROOT)

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
    for name, payload, _ in out:
        carry_site(os.path.join(LOOKUP_DIR if name in LOOKUPS else OUT_DIR, name), payload)
    link({n[:-5]: p for n, p, _ in out}, os.path.join(shell.SITE, 'assets', 'icons'))
    total = 0
    for name, payload, unit in out:
        where = LOOKUP_DIR if name in LOOKUPS else OUT_DIR
        size = dump(os.path.join(where, name), payload)
        total += size
        print('%-38s %6d %s  %9.1f KB'
              % (os.path.relpath(os.path.join(where, name), shell.ROOT),
                 len(payload), unit, size / 1024))
    print('%-38s %9.1f KB' % ('合计', total / 1024))


def relink():
    """只跑 link()。改了记录里站内写的那些字段之后跑它，不必重蒸 manifest。"""
    names = ('inventory-items.json', 'sandbox-perks.json', 'traits.json', 'stats.json',
             'equipable-item-sets.json')
    tabs = {}
    for name in names:
        with open(os.path.join(OUT_DIR, name), encoding='utf-8') as f:
            tabs[name[:-5]] = json.load(f)
    link(tabs, os.path.join(shell.SITE, 'assets', 'icons'))
    for name in names:
        size = dump(os.path.join(OUT_DIR, name), tabs[name[:-5]])
        print('%-38s %6d 条  %9.1f KB'
              % (os.path.relpath(os.path.join(OUT_DIR, name), shell.ROOT),
                 len(tabs[name[:-5]]), size / 1024))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--distill', action='store_true', help='从 manifest 重蒸八份定义表')
    ap.add_argument('--link', action='store_true',
                    help='只跑由记录推记录那一步：本地图、同物的几枚 hash 互补、效果补齐')
    ap.add_argument('--src', default=SRC, help='manifest_raw 目录')
    a = ap.parse_args()
    if a.distill:
        distill(os.path.realpath(a.src))
    elif a.link:
        relink()
    else:
        ap.error('要做什么？--distill 或 --link')


if __name__ == '__main__':
    sys.exit(main())
