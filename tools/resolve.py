#!/usr/bin/env python3
"""名字 → itemHash。源稿写中文名，这一层把它解析成 manifest 的主键。

用法：
    python3 tools/resolve.py --audit        # 把站内引用得到的名字全跑一遍，报解析率

**复刻使同名多 hash 成为常态**，不是例外：站内四张购物清单的 658 把武器里 417 把
同名多 hash（63%），147 个神器模组里 39 个。所以解析分两步——先按页面把候选收窄到
一类物品，再在剩下的版本里挑一个。

候选收窄照搬 vocab.SLOTS 那条思路（写在「异域护甲：」一行上就只查异域护甲），
只是判据从「哪一页扫出来的」换成 manifest 自己的 itemType / tierType / 插件类别。

挑版本按下面的顺序，逐条都是可判定的，分不出就报出全部候选、不猜：

    1. 站内自己标的版本后缀。源稿把复刻写成「鲁莽神谕\\\\众神殿版本」，后缀正是
       收藏条目的 sourceString（「来源：众神殿」）。站点比规则权威。
    2. 调用方给的词条。购物清单每行都列着枪管、弹匣、Perk 1、Perk 2，拿它们与各
       版本的词条池比，取重合最多的那个。实测 326 个多版本行 100% 命中，而
       「取序号最大」只有 92.6%、「取序号最大且有收藏」只有 74.2%。
    3. 序号最大者。manifest 的 index 即发布顺序。

名字本身也要过一道梯子：站内在汉字与拉丁之间补排版空格（「Häkke 突入武装」），
manifest 没有；站内有几处直接写英文名（「D.F.A.」而 manifest 中文叫「死从天降」）；
还有大小写与引号形状的差（「M-17 "Fast Talker"」对「M-17“快嘴”」）。
"""

import argparse
import collections
import json
import os
import re
import sys
import unicodedata

import markup
import research
import shell

FACTS = os.path.join(shell.ROOT, 'data')
ZH, EN = 'zh-CN', 'en'

# 一把武器的栏位怎么切。**这几条是站内口径不是 Bungie 事实**，所以住在这里而不是
# 事实层：哪几栏算词条、击杀记录器剔掉、空插槽剔掉、大师工作只留「大师杰作」。
# 固有特性要留——异域武器的框架差异就写在那一栏里（「故我在」的不同框架、
# 「单人合唱」的不同催化剂都是 socket 数据本身）。装饰不留。
CAT_INTRINSIC = 3956125808
CAT_TRAITS = 4241085061
# 「武器模组」类目里混着四种东西，只取前两种（判据见 GEAR_KINDS）。大师工作**不在**
# 武器特性类目里，它和可选模组同属这一个。
CAT_GEAR = 2685412949
KEEP_CATS = (CAT_INTRINSIC, CAT_TRAITS, CAT_GEAR)
DROP_PREFIX = 'v400.plugs.weapons.masterworks.trackers'
# CAT_GEAR 那一类里留哪些。可选模组按枪型分成十几个 v460.weapon.mod_* 的池；
# 锻造（crafting.*）与装备阶级（weapon_tiering.*）两组不留：它们是触发器，
# 自身 investmentStats 全空，效果是「把别的栏换成强化版」，画不成可选项。
GEAR_KINDS = ('v400.weapon.mod', 'v460.weapon.mod', 'v900.weapon.mod',
              'v400.plugs.weapons.masterworks')
MASTERWORK_KIND = 'v400.plugs.weapons.masterworks'
MASTERWORK_KEEP = '大师杰作'
# 「空模组插槽」「空催化插槽」这类是没插东西时的占位，不是一个选项。
EMPTY_SLOT = re.compile(r'^空.*插槽$')


def text(rec, field='name', lang=ZH):
    """一条记录的某个字段在某种语言下的文本。**全站唯一的取文入口。**

    事实层的语言文本全住在 `i18n` 里，形状恒为 `i18n -> <语言> -> <字段>`，
    而 `en` 只写与 `zh-CN` 不同的那几个字段，所以英文取不到时回落到中文——
    那正是「两边逐字相同」的意思，不是「没有英文」。
    """
    block = ((rec or {}).get('i18n') or {})
    got = (block.get(lang) or {}).get(field)
    if got is None and lang != ZH:
        got = (block.get(ZH) or {}).get(field)
    return got or ''


def icon_path(rec):
    """一条记录的官方图路径（ICON_PREFIX 已剥）。没有图的返回 None。"""
    return (rec or {}).get('icon')

# 站内页面 → 候选范围，一页可以有几档。每档是 (itemType 或 None, tierType 或 None,
# 插件类别正则 或 None)，None 表示这一位不限；命中任意一档即算在范围内。判据从
# manifest 自己的字段取，不从「哪一页扫出来的」取。
#
# **插件那几页不限 itemType**：绝大多数插件是 19，但棱镜手雷（「雹火尖刺」）是 20、
# 固有框架有一批是 0。插件类别本身已经够判别，再叠一层 itemType 只会漏。
WEAPON_PLUGS = (r'^(frames|origins|barrels|magazines|tubes|scopes|batteries|blades'
                r'|guards|bowstrings|arrows|hafts|stocks|grips|rails|bolts'
                r'|magazines_gl|intrinsics)'
                # 武器模组（丰足弹药、冲刺之握）与武器 Perk 同在一页，类别不同。
                r'|^v\d+\.weapon\.mod_')
# 碎片在两种类别下都出现过（shared.arc.fragments 与 shared.stasis.trinkets），
# 冰影的星相另挂 totems。六个元素页与职业技能页共用这一条。
ABILITY_PLUGS = (r'\.(aspects|fragments|trinkets|totems|grenades|prism_grenade'
                 r'|melee|supers|class_abilities|movement|transcendence)$')

SCOPES = {
    'exotic-weapon': ((3, 6, None),),
    # 刷取清单那三页写的是同一批东西的定位与评语，范围与详解页一致。
    # 「刷取清单-异域护甲」不列异域职业物品之灵，所以不带 intrinsics 那两档。
    'exotic-weapons': ((3, 6, None),),
    # 之灵与护甲同页：刷取清单里既有「觅敌者」这件护甲，也有「觅敌者\\矛隼」这样
    # 的之灵组合行，两档都要在范围内，靠 composite() 整行判该读哪一种。
    'exotic-armors': ((2, 6, None), (None, 6, r'^intrinsics')),
    'legendary-primary': ((3, 5, None),),
    'legendary-special': ((3, 5, None),),
    'legendary-heavy': ((3, 5, None),),
    # 异域职业物品的「之灵」不是护甲条目，是异域固有插件（ty=19 tier=6
    # plug=intrinsics）；奥恩学派那三条另挂 enhancements.exotic.aeon_cult。
    'exotic-armor': ((2, 6, None), (None, 6, r'^intrinsics'),
                     (None, None, r'^enhancements\.exotic')),
    'shopping-primary': ((3, 5, None),),
    'shopping-special': ((3, 5, None),),
    'shopping-heavy': ((3, 5, None),),
    'shopping-other': ((3, 5, None),),
    'weapon-perks': ((None, None, WEAPON_PLUGS),),
    'armor-mods': ((None, None, r'^enhancements'),),
    'artifact-mods': ((None, None, r'^artifact_perks'),),
    'elements/arc': ((None, None, ABILITY_PLUGS),),
    'elements/solar': ((None, None, ABILITY_PLUGS),),
    'elements/void': ((None, None, ABILITY_PLUGS),),
    'elements/stasis': ((None, None, ABILITY_PLUGS),),
    'elements/strand': ((None, None, ABILITY_PLUGS),),
    'elements/prismatic': ((None, None, ABILITY_PLUGS),),
    'elements/class-abilities': ((None, None, ABILITY_PLUGS),),
}

# 站内标的版本名与库里的来源词对不上时的对照。玩家按活动叫它，库里写的是那次
# 活动所属的版本更新。逐条带一行依据，不写「同义词」了事。
VERSION_SOURCE = {
    '猛攻': '进入光能',    # 猛攻是「进入光能」这次更新里的活动，库里写的是后者
}

# 站内引用得到、但**本来就没有 itemHash** 的那几类。这不是解析失败，是这些名字
# 指的根本不是物品，所以逐类给一条可判定的判据，而不是列一张手抄名单。
#
#   效果名      增幅、致盲、恢复、灼烧、冻结、割裂……游戏里的 buff 与 debuff。
#               判据：站内已经把它们记在 check_terms.TERMS 与 items.MECH 上。
#   复合行      护甲模组页一行盖住若干变体（「虹吸」盖住 16 枚元素虹吸）。
#               判据：tools/mod-variants.json 的 row 字段。
#   来源别名    护甲套装在词表里登两个键，套装名与来源名（「幽梦之城」）。
#               判据：某一套的来源就是这个名字。
#   机制小节    武器 PERK 页的「重型弩机制」那一节，行标题是机制不是 Perk。
#               判据：物品表里查不到，且不落在上面三类里——这一档要人确认，
#               所以逐条写在 NOT_ITEMS 里，每条带理由。
# 站内写的是派生词：库里只有那个关键词本身，没有「用它做成的这一种」。指回基词，
# 页面因此仍链得过去，而不是当作查不到。
DERIVED = {
    '不稳定弹药': ('不稳定', '弹药是「不稳定」这个状态的一种赋予形式'),
    '瓦解弹药': ('瓦解', '弹药是「瓦解」这个状态的一种赋予形式'),
    '抓钩缠结': ('缠结', '抓钩产生的缠结，库里只有「缠结」这个关键词'),
    # 术士虚空星相只有 5 个，没有这一条：它是「混沌加速」给手雷充能后的那个形态名。
    '手持超新星': ('混沌加速', '「混沌加速」给手雷充能后的形态，库里只有星相本身'),
    # 异域武器页给「英勇利刃」装上冲击核心之后单写了一行。**那是它自己的一个槽**
    # （v950.new.sword0.perk_upgrades，池里是冲击／折射／陀螺三个核心），所以这一行
    # 同时指向武器本体与那枚插件——反查「哪些配装用了英勇利刃」与「用了冲击核心」
    # 都该找得到它。
    '英勇利刃 2：冲击核心': (('英勇利刃', '冲击核心'), '这把武器装上冲击核心之后'),
    # 刷取清单把三职业各一件的永劫臂铠并成一行；库里没有「永劫系列」这个名字。
    '永劫系列': (('永劫安泰', '永劫灵魂', '永劫雨燕'), '三职业各一件的永劫臂铠'),
}

# 复刻的两个版本词条池完全相同、来源列也定不下来时，由人钉一个 hash。
# 键是 (页面, 名字)，值是 hash。空着也能跑——审计会把候选列出来等人填。
#
# **不拿序号、水印或赛季号猜**：站内赛季列记的是首发赛季，manifest 的水印与发布
# 版本记的是这一版的赛季，复刻之后两者本就不同，学出来的映射不自洽
# （v400.annual 同时对应赛季 29 与 4）。
PINNED = {}

NOT_ITEMS = {
    '刀剑格挡': '刀剑机制，不是 Perk',
    '射弹攻击': '重型弩机制，不是 Perk',
    '弩弹': '重型弩机制，不是 Perk',
    '武器能量与护盾': '机制小节的行标题',
    '近战 攻击': '机制小节的行标题',
    '固有 Perk': '职业技能页的机制小节',
    '元素效果': '棱镜页的机制小节',
    '超凡': '棱镜页的机制小节',
    '移动与职业技能': '棱镜页的机制小节',
    '熔炉竞技场调整': '棱镜页的机制小节',
    '灼烧效果伤害缩放': '烈日页的机制小节',
    '速装终结技': '护甲模组页的复合行，变体表里没登记',
    '冰影水晶': '冰影页的机制名，库里没有同名条目',
    '线虫': '缚丝页的机制名，库里没有同名条目',
}

# 这两页不查物品表：套装本身是 DestinyEquipableItemSetDefinition，另一份表。
# 「刷取清单-护甲套装」写的是同一批套装的排序与评语。
SET_PAGES = frozenset({'armor-sets', 'farming-sets'})

# 汉字与拉丁／数字之间那个排版空格（design.md 三节）。数字后面跟的单位号也算在
# 拉丁那一侧：「21% 的亢奋」在库里是「21%的亢奋」。
SPACE = re.compile(r'(?<=[一-鿿])[  ](?=[0-9A-Za-z])'
                   r'|(?<=[0-9A-Za-z%])[  ](?=[一-鿿])')
SUFFIX = re.compile(r'（[^（）]*）$')
FOLD = re.compile(r'[\s.\'"_·“”‘’]')


VERSION_TAIL = re.compile(r'^(.+?)([^\s]{2,8})版本$')


def norm(name):
    """去汉字与拉丁之间的排版空格，去站内自加的消歧括注。"""
    return SUFFIX.sub('', SPACE.sub('', (name or '').strip())).strip()


def norm_keep(name):
    """去排版空格，**留着站内自加的括注**。

    norm() 把括注当消歧后缀剥掉，那是为了拿名字去库里查——库里没有那个括注。
    但括注正是站内用来分开两行的东西，两处要看得见它：建源稿线索表时，按 norm()
    建键会把「突进」与「突进（巴洛克）」两行的来源与 Perk 混成一条，其中一行拿到
    的是另一行的来源；判「括注里写的是不是另一件东西」时同理。
    """
    return SPACE.sub('', (name or '').strip())


def fold(name):
    """再狠一档：去全部标点与空白、全角转半角、统一大小写。只在前几档都落空时用。"""
    return FOLD.sub('', unicodedata.normalize('NFKC', norm(name))).upper()


class Facts:
    """事实表的只读视图，外加三本按名字建的索引。"""

    def __init__(self, root=FACTS):
        def read(name):
            path = os.path.join(root, name)
            if not os.path.exists(path):
                sys.exit('事实表还没蒸馏：%s\n  先跑 python3 tools/facts.py --distill' % path)
            with open(path, encoding='utf-8') as f:
                return json.load(f)

        self.items = read('inventory-items.json')
        self.groups = read(os.path.join('lookup', 'stat-groups.json'))
        self.sets = read('equipable-item-sets.json')
        self.perks = read('sandbox-perks.json')
        self.traits = read('traits.json')
        self.stats = read('stats.json')
        self.plug_sets = read(os.path.join('lookup', 'plug-sets.json'))
        self.socket_types = read(os.path.join('lookup', 'socket-types.json'))
        self.tables = {'inventory-items': self.items, 'sandbox-perks': self.perks,
                       'traits': self.traits, 'stats': self.stats,
                       'equipable-item-sets': self.sets}
        self._pools = {}
        self.eff_by_name = {}
        for table, prefix in ((self.traits, 'trait:'), (self.perks, 'perk:'),
                              (self.stats, 'stat:')):
            for h, v in table.items():
                for key in (text(v), text(v, lang=EN)):
                    if key:
                        self.eff_by_name.setdefault(norm(key), []).append(prefix + h)
        self.by_zh, self.by_en, self.by_fold = {}, {}, {}
        for h, v in self.items.items():
            zh = text(v)
            self.by_zh.setdefault(norm(zh), []).append(h)
            en = text(v, lang=EN)
            if en:
                self.by_en.setdefault(norm(en), []).append(h)
            self.by_fold.setdefault(fold(zh), []).append(h)
            if en:
                self.by_fold.setdefault(fold(en), []).append(h)

    def at(self, key):
        """按主键取那条记录，不管它落在哪张表上。

        事实层的键一律是裸 hash、文件即命名空间，所以前缀只活在**站内的键**上，
        用来说这个数字该去哪张表查——裸 hash 不唯一，`inventory-items` 与
        `sandbox-perks` 撞了 52 个号。**解前缀只在这里做一次**：从前 key_name()
        与 icons.icon_of() 各写一份，改一处漏一处。
        """
        key = str(key)
        for prefix, table in (('perk:', self.perks), ('trait:', self.traits),
                              ('stat:', self.stats), ('set:', self.sets)):
            if key.startswith(prefix):
                return table.get(key[len(prefix):])
        return self.items.get(key)

    def ref(self, pair):
        """按 `[表名, 主键]` 二元组取那条记录。**跨表引用只有这一种写法。**

        裸 hash 不唯一：`inventory-items` 与 `sandbox-perks` 撞了 52 个号，
        `1350878542` 既是物品「改良汇编器」又是 SandboxPerk「快速冷却」。
        """
        table, key = pair
        got = self.tables.get(table)
        if got is None:
            markup.die('没有这张表：%s' % table)
        return got.get(str(key))

    def source(self, h, lang=ZH):
        """这件东西的来源那句话。

        它写在**收藏条目**上——物品自己的 displaySource 在复刻武器上一律是「随机
        特性：此物品无法从收藏品再次获取」，分不出版本；collectible 的 sourceString
        才写着「来源：众神殿」，那正是站内源稿标版本用的那个词。蒸馏时已经按
        collectibleHash 接到物品记录上了（9238 对 9238，严格一对一）。
        """
        return text(self.items.get(str(h)), 'sourceString', lang)

    def kind_of(self, entry):
        """一个槽的类别标识，取 socket 类型白名单的首项。"""
        st = self.socket_types.get(str(entry.get('socketTypeHash')))
        wl = (st or {}).get('plugWhitelist') or []
        return wl[0].get('categoryIdentifier', '') if wl else ''

    def pool(self, h):
        """一把武器的栏位：`[{i, kind, type, rand, init, plugs, gear}]`，栏序即下标。

        **这是站内口径，不是 Bungie 事实**，所以切在这里不切在事实层：哪几栏算词条、
        击杀记录器剔掉、空插槽剔掉、大师工作只留「大师杰作」，每一条都是为了页面上
        那张表好看。事实层存的是整份 `sockets`，两个读者共用这一份切法——资料页拿它
        给词条名戳主键，武器库拿它画栏。

        `gear` 那一位标出「不是掉落时随机开出来的东西」——可选模组与大师工作，
        随时能换。消歧与戳主键那两处按这一位跳过它们：那几栏在同类武器上几乎一模
        一样，并进来会让复刻版本之间的重合度全部拉高，消歧就失灵了。
        """
        key = str(h)
        got = self._pools.get(key)
        if got is None:
            got = self._pools[key] = self._columns(key)
        return got

    def _columns(self, key):
        blk = (self.items.get(key) or {}).get('sockets') or {}
        entries = blk.get('socketEntries') or []
        out = []
        for cat in blk.get('socketCategories') or ():
            ch = cat.get('socketCategoryHash')
            if ch not in KEEP_CATS:
                continue
            for i in cat.get('socketIndexes') or ():
                if i >= len(entries):
                    markup.die('%s 的 socketIndexes 指到 socketEntries 之外：%d'
                               % (key, i))
                e = entries[i]
                kind = self.kind_of(e)
                # 击杀记录器也挂在「武器特性」类目下，不剔每把枪凭空多一栏。判据取
                # socket 类型的白名单首项，不取初始插件——后者有超过五分之一的槽
                # 是空的，漏判率太高。
                if kind.startswith(DROP_PREFIX):
                    continue
                ps = e.get('randomizedPlugSetHash') or e.get('reusablePlugSetHash')
                plugs = []
                for p in (self.plug_sets.get(str(ps)) or {}).get('reusablePlugItems') or ():
                    # 老版本的武器留着已经开不出来的词条，这一位是唯一的判据。
                    if p.get('currentlyCanRoll', True):
                        plugs.append(p['plugItemHash'])
                gear = ch == CAT_GEAR
                if gear:
                    plugs = self._gear_keep(kind, plugs)
                    if not plugs:
                        continue
                else:
                    plugs = [x for x in plugs if not EMPTY_SLOT.match(self.name(x))]
                col = {'i': i, 'kind': kind, 'type': e.get('socketTypeHash'),
                       'rand': bool(e.get('randomizedPlugSetHash'))}
                if gear:
                    col['gear'] = True
                elif e.get('singleInitialItemHash'):
                    # 装备栏的「初始插件」是空模组插槽，不是一个选项。
                    col['init'] = e['singleInitialItemHash']
                if plugs:
                    col['plugs'] = plugs
                out.append(col)
        return out

    def _gear_keep(self, kind, plugs):
        """CAT_GEAR 那一类留不留，留的话留哪几个插件。None 表示整栏不要。

        大师工作那一栏只留「大师杰作：属性」：同池里另外 126 项是「N 阶：属性」，
        那是同一件事的十档刻度，铺成图标就是一张十四乘十的乘法表。
        """
        if not kind.startswith(GEAR_KINDS):
            return None
        if kind.startswith(MASTERWORK_KIND):
            return [x for x in plugs if self.name(x).startswith(MASTERWORK_KEEP)]
        return [x for x in plugs if not EMPTY_SLOT.match(self.name(x))]

    def name(self, h):
        return text(self.items.get(str(h)))

    def pool_names(self, h):
        """这把武器各栏能开出的词条名。起源特性在 init 上，与池取并集。

        带 `gear` 的栏跳过，理由同 weapon_pool()：那几栏在同类武器上几乎一模一样，
        并进来会让复刻版本之间的重合度全部拉高，消歧就失灵了。
        """
        out = set()
        for col in self.pool(h):
            if col.get('gear'):
                continue
            for p in col.get('plugs') or ():
                out.add(norm(self.name(p)))
            if col.get('init'):
                out.add(norm(self.name(col['init'])))
        out.discard('')
        return out


def in_scope(row, scopes):
    for ty, tier, plug in scopes:
        if ty is not None and row['itemType'] != ty:
            continue
        if tier is not None and (row.get('inventory') or {}).get('tierType') != tier:
            continue
        if plug is not None and not re.search(
                plug, (row.get('plug') or {}).get('plugCategoryIdentifier') or ''):
            continue
        return True
    return False


def candidates(facts, name, page):
    """按名字查、按页面收窄。名字走三档梯子，第一档查到就不再往下。"""
    scopes = SCOPES.get(page)
    for index, key in ((facts.by_zh, norm(name)), (facts.by_en, norm(name)),
                       (facts.by_fold, fold(name))):
        hits = index.get(key) or []
        if scopes:
            hits = [h for h in hits if in_scope(facts.items[h], scopes)]
        if hits:
            return hits
    return []


def same_shape(row):
    """两条记录在站内用得到的字段上是不是一模一样。"""
    derived = row.get('derived') or {}
    return (text(row), icon_path(row),
            text(row, 'itemTypeAndTierDisplayName'),
            derived.get('release'), row.get('iconWatermark'),
            row.get('defaultDamageType'),
            (row.get('inventory') or {}).get('tierType'))


def pick(facts, hits, version='', perks=()):
    """多个版本里挑一个。返回 (hash 或 None, 依据, 仍未排除的候选)。

    **分不出就交出候选，不按序号猜。**复刻的版本之间差的是词条池与来源，序号大小
    不表示哪个是站内说的那个；曾经拿「序号最大」兜底，把 352 条词条选成了它们的
    强化孪生条目。"""
    if len(hits) == 1:
        return hits[0], '唯一', hits
    want = {norm(p) for p in perks if p} - {'无', ''}
    # **一把枪的身份就是它的插槽池。**这一行列了枪管、弹匣、两栏 Perk 与起源特性，
    # 全部开得出来的那一版就是它说的那一把——这是判定，不是从几个候选里挑。别的
    # 判据都是间接的：「来源」是拿两三个字去 Bungie 散文里做子串匹配，复刻之后旧那
    # 一版的 sourceString 还留着当年那个地点、新那一版一律是「随机特性：此物品无法
    # 从收藏品再次获取。」，于是它稳定地选中已经停掉的旧版；「非大师非特殊版」与
    # 「有收藏条目」连词条都不看。实测按这一条改正 95 行，其中 21%的亢奋 现选的那一版
    # 只开得出这一行 12 个词条里的 3 个，另一版 12 个全开得出。
    if want:
        full = [h for h in hits if want <= facts.pool_names(h)]
        if len(full) == 1:
            return full[0], '词条全覆盖', full
        if full:
            hits = full
    if version:
        src = VERSION_SOURCE.get(version, version).rstrip('版本')
        same = [h for h in hits if src and src in facts.source(h)]
        if len(same) == 1:
            return same[0], '版本后缀', same
        if same:
            hits = same
    if want:
        scored = [(len(want & facts.pool_names(h)), facts.items[h]['index'], h) for h in hits]
        top = max(s for s, _, _ in scored)
        best = [h for s, _, h in scored if s == top]
        if top and len(best) == 1:
            return best[0], '词条重合', best
        if top:
            hits = best
    # **站内写的是当前赛季的现状**，复刻之后玩家手上、掉落表里的就是最新那一版，
    # 所以「最新」排在「非大师」「有收藏条目」之前——后两条连词条都不看。
    # **这不是「取序号最大」**：序号是库内排序、与新旧无关，那一条被否过。
    # rel 是 Bungie 自己在 traitIds 上打的发布版本号（v730.season），可排序。
    fresh = release_rank(facts, hits)
    if fresh and len(hits) > 1:
        top = (facts.items[fresh].get('derived') or {}).get('release')
        same_rel = [h for h in hits
                    if (facts.items[h].get('derived') or {}).get('release') == top]
        if len(same_rel) == 1:
            return same_rel[0], '发布版本最新', same_rel
        if same_rel:
            hits = same_rel
    # 大师版与特殊版本是同名的另一件东西，不是「另一个版本」：源稿写的是普通版，
    # 要大师版会在名字里写出来。两条都是语义判据。
    for flag in ('isAdept', 'isHolofoil'):
        plain = [h for h in hits if not facts.items[h].get(flag)]
        if plain and len(plain) < len(hits):
            hits = plain
    if len(hits) == 1:
        return hits[0], '非大师非特殊版', hits
    # 有收藏条目的那个才是玩家拿得到的正主；同名的另一条往往是没有收藏、
    # 只在载具/预览里用的副本。这是语义判据，不是按序号猜。
    owned = [h for h in hits if facts.items[h].get('collectibleHash')]
    if len(owned) == 1:
        return owned[0], '有收藏条目', owned
    if owned:
        hits = owned
    if len(hits) == 1:
        return hits[0], '唯一', hits
    # 剩下的若逐字段相同（同名、同图、同类型、同发布版本、同水印），选哪个都一样，
    # 取序号最小的那个并说明依据；不同则交出候选。
    if len({same_shape(facts.items[h]) for h in hits}) == 1:
        first = min(hits, key=lambda h: facts.items[h]['index'])
        return first, '重复条目内容一致', hits
    # 走到这里说明同名同发布版本的还有好几条，那就是库里确实有这么几条。
    # 取序号最小的那个并把候选一并交出，等人工筛。
    first = min(hits, key=lambda h: facts.items[h]['index'])
    return first, '并列 %d 条待筛' % len(hits), hits


RELEASE = re.compile(r'^v(\d+)\.')


def release_rank(facts, hits):
    """候选里发布版本唯一最新的那个，并列或都没有版本号就回 None。"""
    best, rank = None, -1
    ties = 0
    for h in hits:
        got = RELEASE.match((facts.items[h].get('derived') or {}).get('release') or '')
        n = int(got.group(1)) if got else -1
        if n > rank:
            best, rank, ties = h, n, 1
        elif n == rank:
            ties += 1
    return best if rank >= 0 and ties == 1 else None


def resolve_effect(facts, name):
    """效果名或属性名 → traitHash / sandboxPerkHash / statHash。增幅、致盲、冻结
    这一类不在物品表里，主键在 DestinyTraitDefinition 与 DestinySandboxPerkDefinition
    上；充能效率、防御抗性这一类在 DestinyStatDefinition 上。

    trait 优先：同名两边都有时（「瓦解」），trait 才是那个状态本身。"""
    hits = facts.eff_by_name.get(norm(name)) or []
    if not hits:
        return None
    return sorted(hits, key=lambda h: (not h.startswith('trait:'), h))[0]


def split_version(facts, name, page):
    """「无效安慰玖的仪式版本」→ ('无效安慰', '玖的仪式')。

    源稿把复刻写成格内换行「无效安慰\\\\玖的仪式版本」，取文时那个换行没了，
    两截拼成一串。切在哪不能按字数猜，按结果验：前半截查得到候选、后半截在某个
    候选的来源里出现过，才算切对。"""
    if not VERSION_TAIL.match(name):
        return name, ''
    for i in range(2, len(name) - 2):
        base, tail = name[:i], name[i:-2]
        if not tail:
            continue
        hits = candidates(facts, base, page)
        want = VERSION_SOURCE.get(tail, tail)
        if hits and any(want in facts.source(h) for h in hits):
            return base, tail
    return name, ''


# 一个名字指一件东西还是指一族东西，按页面分。
#
#   武器、护甲：指一件。复刻使同名多 hash，要挑出站内说的那一个版本。
#   词条、模组、技能：**指一族，全要**。「双重装填」同时有普通特性与强化特征两条，
#       源稿那一行的 {enh|↑2} 正是同时记着两者；护甲模组与神器模组同理有多个版本。
SINGLE_PAGES = frozenset({'exotic-weapon', 'exotic-armor', 'shopping-primary',
                          'shopping-special', 'shopping-heavy', 'shopping-other',
                          'exotic-weapons', 'exotic-armors',
                          'legendary-primary', 'legendary-special', 'legendary-heavy'})


def pool(facts, name, page):
    """这个名字在这一页范围内的全部条目。词条与模组用这一条。"""
    hits = candidates(facts, name, page)
    if not hits:
        base, tail = split_version(facts, name, page)
        if tail:
            hits = candidates(facts, base, page)
    return hits


def one(facts, name, page, version='', perks=()):
    """挑出单一版本。返回 (hash 或 None, 依据, 候选)。武器与护甲用这一条。"""
    pin = PINNED.get((page, norm(name)))
    if pin:
        return pin, '人工指定', [pin]
    hits = candidates(facts, name, page)
    if not hits:
        base, tail = split_version(facts, name, page)
        if tail:
            hits, version = candidates(facts, base, page), tail
    if not hits:
        return None, '查不到', []
    # norm() 把括注当消歧后缀剥掉，那是为查询那一侧准备的——站内写「故我在（电弧元素）」，
    # 库里没有那个括注。可它同样剥掉了库里名字上的括注，于是 Bungie 自己带括注的那些
    # 被并进了不带括注的那一条：查「渊博学者」会同时命中「渊博学者（专家）」，而后者是
    # 专家难度掉落的另一件东西。库里有名字一字不差的候选时，带括注的那些不参选。
    exact = [h for h in hits if norm_keep(text(facts.items[h])) == norm_keep(name)]
    if exact and len(exact) < len(hits):
        hits = exact
    return pick(facts, hits, version, perks)


def resolve(facts, name, page, version='', perks=()):
    """按页面选路：单件的挑版本，成族的只要查得到就算数。"""
    if page in SINGLE_PAGES:
        return one(facts, name, page, version, perks)[:2]
    hits = pool(facts, name, page)
    return (hits[0] if hits else None), ('全池 %d 条' % len(hits) if hits else '查不到')


# ── 给产出戳 hash ─────────────────────────────────────────────────────


_SHARED = None


def shared():
    """事实层与源稿线索只读一次。一轮构建要给四十多页戳号，每页重读 12 MB 白等。"""
    global _SHARED
    if _SHARED is None:
        _SHARED = (Facts(), source_hints())
    return _SHARED


def stamper(page):
    """一页的戳号器：名字 → 主键清单，戳不上就回空列表。

    **只给有范围定义的那些页戳**，也就是 vocab.py 要扫的那 17 页——戳 hash 的用处
    正是让索引从按名字猜改成读主键。别的页的行标题不参与跨页引用，戳了没人读。

    词条与模组是一族，一个名字可能对应几个 hash（「双重装填」有普通与强化两条），
    所以一律回列表；武器与护甲那几页每次只有一条。

    **交主键，不交 HTML 片段。**主键的去处是 data/index/<页>.json，那一份才是
    跨页引用读的。从前这里回的是 ` data-hash="…"`，三个生成器各按
    `len(' data-hash="')` 切回来——属性名一改，切出来的是一串仍然全是数字、
    看着合法的截断主键，而 HTML 那一侧是对的，两者从此分歧。
    """
    if page in SET_PAGES:
        def set_stamp(name, parts=()):     # parts 用不上：套装名不是组合行
            key = set_of(name)
            return [key] if key else []
        return set_stamp
    if page not in SCOPES:
        return None
    facts, hints = shared()

    def stamp(name, parts=()):
        name = (name or '').strip()
        if not name:
            return ''
        if page in SINGLE_PAGES:
            src, perks = hints.get((page, norm_keep(name)), ('', ()))
            hit = one(facts, name, page, version=src, perks=perks)[0]
            got = [hit] if hit else []
        else:
            got = pool(facts, name, page)
        if not got:
            # 效果与属性（增幅、致盲、充能效率）不在物品表里，主键在别的号段上。
            # 戳的形态照 effects.json 自己的键走，带前缀，免得两个号段混在一位上。
            eff = resolve_effect(facts, name)
            got = [eff] if eff else []
        if not got and name in DERIVED:
            # 派生条目指回基那几条：某个关键词赋予的弹药、一把武器装上某个插件之后，
            # 库里只有基那一条（或几条），反查时它们本就该落在同一件东西上。
            base = DERIVED[name][0]
            for one_base in ((base,) if isinstance(base, str) else base):
                eff = resolve_effect(facts, one_base)
                if eff:
                    got.append(eff)
                    continue
                # 基不一定与这一行同类（「冲击核心」是插件，写在异域武器页上），
                # 所以不按本页的范围收窄，只按名字查。
                # 单件页上每个基各挑一个版本：hash 要一一对应，「永劫系列」指的是
                # 三件臂铠各自的当前版本，不是它们全部复刻的九条。
                if page in SINGLE_PAGES:
                    hit = one(facts, one_base, page)[0]
                    if hit:
                        got.append(hit)
                        continue
                got += pool(facts, one_base, page) or facts.by_zh.get(norm(one_base), [])
        if not got and len(parts) > 1:
            # 整行是一个组合，逐截解析取并集。
            got = composite(facts, page, parts)
        # 括注里写的是另一件东西时并进来：「烈焰战锤（无敌索尔）」说的是这个超能
        # 装上那个星相之后，两边都该反查得到它。
        for extra in paren_keys(facts, name, page):
            if extra not in got:
                got.append(extra)
        return got

    return stamp



# ── 异域那两页的 PERK 列 ───────────────────────────────────────────────


# 站内给某件东西起的写法，库里叫另一个名字。两条都核对过描述，指的是同一件。
PERK_ALIAS = {
    '「Yeehaw」狂暴': ('狂暴', '越橘的特征插件就是「狂暴」，前缀是站内给这把枪加的花名'),
    '弓手节奏²': ('弓手节奏', '催化剂给的是特殊版「弓手节奏」，上标 2 记的是 0.75² 蓄力倍率'),
    # 下面六条是刷取清单里的通行简称与另一种译名。**不改源稿**：这些写法对读者不是
    # 错的，改成库里的键反而让熟悉那个叫法的人对不上。判据是「这个写法对读者是错的，
    # 还是只对库里的键是错的」——是后者就落在这张表上。
    '不稳定弹药': ('失衡弹药', 'Destabilizing Rounds 的另一种译名，源稿两家各写一种'),
    '斩首': ('斩首武器', 'Vorpal Weapon，刷取清单省掉了「武器」两个字'),
    '自填': ('自动填装枪套', '刷取清单的简称；那几把枪的池里只有「自动填装枪套」这一条带「填」'),
    '光之触碰': ('光能之触', '舵手那一行的写法，库里叫「光能之触」'),
    '诱导': ('诱导推销', '刷取清单的简称；同池只有「诱导推销」一条'),
    '高强度备弹': ('高强度型弹药储备', '刷取清单的简称'),
}

# 这一列里不是实体的那些名字：源稿作者给槽位或机制起的说明词。逐条按
# displayProperties.name 在 98 张 zh component 里精确搜过，一个都没有。
PERK_LABELS = {
    '可制作 Perk': '槽位说明：这一栏由锻造决定，指的不是某一个词条',
    '可打造 Perk': '同上，源稿在蠕虫低语那一行写的是「打造」',
    '可塑造 Perk': '同上，源稿在可塑形的那几把上写的是「塑造」',
    '可制作改装': '槽位说明：催化剂开出的是一个可选改装位',
    '可塑造改装': '同上',
    '可选 Perk': '槽位说明：这一栏在几个固定词条里挑一个',
    '随机 Perk': '槽位说明：隼月的特征栏是随机池',
    '米达雷达': '站内给「机瞄期间雷达保持可见」这条固有机制起的名',
    '点射模式': '站内给零号修订起源栏两选一（Häkke 轻型／重型短点射）起的名',
    '慈悲触碰': '恶意触碰那一行写的第二个催化剂效果，库里没有同名条目',
    '能量核心': '站内对冲击／折射／陀螺三个核心的统称',
    '催化剂': '英勇利刃那一行的栏目名，不是某一枚催化剂',
    '无': '起源特性那一列写「这把枪没有起源特性」，购物清单三页共 63 格',
}

# 两张表的键照源稿原样写，查的时候按 norm() 归一：「可制作 Perk」那个排版空格
# 归一后就没了，拿原样的键去比一条都对不上。
PERK_LABEL_KEYS = frozenset(norm(k) for k in PERK_LABELS)
PERK_ALIAS_KEYS = {norm(k): v for k, v in PERK_ALIAS.items()}

# 「恐慌反应 I–V」：库里是恐慌反应、恐慌反应II…恐慌反应V 五条，站内并成一行写。
ROMAN_SPAN = re.compile(r'^(?P<base>.+?)[  ]*[IVX]+[–—-][IVX]+$')
ROMAN_TAIL = re.compile(r'^[IVX]+$')

# 「射手瞄具／战斗瞄具」：一格里并排写着同一栏的两个插件。
SLASH = re.compile(r'[／/]')


def weapon_pool(facts, keys):
    """这一行那件东西各栏能开出的词条：归一化名 → hash 列表。起源写在 init 上。

    带 `gear` 的栏跳过。那是可选模组与大师工作——随时能换的东西，不是掉落时开出来
    的词条。把「备用弹匣」「大师杰作：射程」并进这个池，资料页按名字戳主键时会撞上。
    """
    out = {}
    for key in keys:
        for col in facts.pool(key):
            if col.get('gear'):
                continue
            plugs = list(col.get('plugs') or ())
            if col.get('init'):
                plugs.append(col['init'])
            for p in plugs:
                name = norm(facts.name(p))
                if not name:
                    continue
                got = out.setdefault(name, [])
                if str(p) not in got:
                    got.append(str(p))
    return out


def perk_key(facts, keys, name):
    """异域 PERK 那一格里的一个名字 → 主键列表。

    三种返回分得清清楚楚，别让「不是实体」与「没查到」共用一个空列表：
    None 是槽位说明词，本来就不该进索引；空列表是该有主键却没查出来，由调用方报出。

    **按这一行那件东西自己的 socket 池查，不按全表查名字**：池就是「这件东西能
    开出什么」的定义，池里查得到即无歧义。全表按名字查会撞上别的枪的同名词条
    （「狂暴」在库里有 5 条 sandboxPerk、3 条插件）。
    池里没有的才退到 sandboxPerk——催化剂给的效果不在武器自己的槽上。
    """
    name = norm((name or '').lstrip('↑').strip())
    if not name or name in PERK_LABEL_KEYS:
        return None
    name = PERK_ALIAS_KEYS.get(name, (name,))[0]
    pool_names = weapon_pool(facts, keys)
    got = []
    for part in [x.strip() for x in SLASH.split(name) if x.strip()]:
        got += _perk_one(facts, pool_names, part)
    return got


def _perk_one(facts, pool_names, name):
    if name in pool_names:
        return pool_names[name]
    span = ROMAN_SPAN.match(name)
    if span:
        base = span.group('base').strip()
        fam = [(n, hs) for n, hs in pool_names.items()
               if n == base or (n.startswith(base) and ROMAN_TAIL.match(n[len(base):]))]
        if fam:
            return [h for _, hs in sorted(fam) for h in hs]
    eff = resolve_effect(facts, name)
    if eff:
        return [eff]
    if not pool_names:
        # 这一行不是武器（棱镜页的手雷与近战格挂在属性主键上），没有池可查。
        # 池存在时按全表名字查会撞上别的枪的同名词条，池为空时撞不上任何东西，
        # 而交白卷是把「站上写着一件东西、实体层指不到它」留在原地。
        # 同名的好几条就是库里确实有这么几条（电光手雷在电弧分支与棱镜分支各一条），
        # 一并交出，不挑。
        return list(facts.by_zh.get(name) or [])
    return []


def collapsed(shown, lib):
    """站内把一族或一对并成一格写，是不是恰好盖住库里这几条。

    「恐慌反应 I–V」盖住恐慌反应、恐慌反应II…V；「射手瞄具／战斗瞄具」盖住那两条。
    这两种不是名字写错，但也不能只凭形状就放过——真盖住了才算数。"""
    span = ROMAN_SPAN.match(shown)
    if span:
        base = norm(span.group('base'))
        return all(norm(x) == base or (norm(x).startswith(base)
                                       and ROMAN_TAIL.match(norm(x)[len(base):]))
                   for x in lib)
    parts = [norm(x) for x in SLASH.split(shown) if x.strip()]
    if len(parts) > 1 and sorted(parts) == sorted(norm(x) for x in lib):
        return True
    # 组合行：一格里并排写着几件东西，写的还可能是简称（站内「涡流」= 库里
    # 「涡流框架」，「觅敌者」= 「觅敌者之灵」）。判据是库里每一条名字都能在
    # 这一格里找到它**至少一半长**的一段前缀——名字真写错了连一半都对不上。
    flat = fold(shown)
    for one in lib:
        core = fold(one)
        # 一格盖住好几条时站内本来就写简称，而那几条是在一个很小的范围里解析出来的
        # （这把武器自己的池），两个字就够定；一格只对一条时不许这么松。
        need = 2 if len(lib) > 1 else max(2, (len(core) + 1) // 2)
        if not any(core[:i] in flat for i in range(len(core), need - 1, -1)):
            return False
    return bool(lib)


# 异域职业物品的「之灵」在库里一律带这个后缀，刷取清单那一页写的是裸名
# （「复兴\\噬星者」）。与 SET_TAIL 同一种做法：后缀不携带信息，查不到时补上再试。
SPIRIT_TAIL = '之灵'

# 行标题里的括注是限定不是名字：「故我在（意外缓刑）涡流」的中间那截写的是框架。
PAREN = re.compile(r'^[（(](.*)[）)]$')

# 「烈焰战锤（无敌索尔）」——括注里写的是另一件东西，这一行说的是两者合起来。
# 站内 21 条带括注的行标题里只有 2 条是这种（另一条是「射击套件（邪冬的谎言）」），
# 其余写的是元素、武器类型、来源，都解析不到实体，因此不受影响。
NAMED_PAREN = re.compile(r'^(?P<base>.+?)[（(](?P<inner>[^（）()]+)[）)]$')


def paren_keys(facts, name, page):
    """行标题括注里那件东西的主键，括注写的不是东西就是空。

    先按本页范围查，再查效果，都不中才放开范围——「邪冬的谎言」是一把武器，
    写在武器 PERK 页上，本页范围里只有插件。放开之后照样要挑单一版本。
    """
    got = NAMED_PAREN.match(norm_keep(name))
    if not got:
        return []
    inner = got.group('inner').strip()
    hits = candidates(facts, inner, page)
    if hits:
        return hits
    eff = resolve_effect(facts, inner)
    if eff:
        return [eff]
    wide = facts.by_zh.get(norm(inner)) or []
    if not wide:
        return []
    one_hit = pick(facts, wide)[0]
    return [one_hit] if one_hit else []


def composite(facts, page, parts):
    """行标题被格内换行切成几截 → 各截主键的并集。

    两种行长这样：异域职业物品一行写一个之灵组合（「复兴\\噬星者」），刷取清单
    给「故我在」按框架分了 5 行（「故我在\\（意外缓刑）\\涡流」）。整行说的是
    那个**组合**，反查「哪些行用到噬星者之灵」「用到涡流框架」都该找得到它，
    所以取并集而不是挑一个。

    第一截解析出来的那件东西是后面几截的范围：框架名只在这把武器自己的池里查，
    全表按「涡流」查会撞上别的枪。一截都解析不到才算整行没归属。
    """
    spirits = _all_spirits(facts, page, parts)
    if spirits:
        return spirits
    got, head = [], []
    for i, part in enumerate(parts):
        hits = _one_part(facts, page, part, head)
        if i == 0:
            head = hits
        for h in hits:
            if h not in got:
                got.append(h)
    return got


def _all_spirits(facts, page, parts):
    """整行是不是一个之灵组合。**按整行判，不按单截判**：「觅敌者」在刷取清单上
    既是一件异域护甲也是一个之灵，单看这一截分不出来；而「矛隼」「虫骸」只有
    之灵这一种读法，所以每一截补上后缀都查得到，整行就是之灵组合。"""
    got = []
    for part in parts:
        names = [x.strip() for x in
                 SLASH.split(norm(PAREN.sub(r'\1', (part or '').strip()))) if x.strip()]
        if not names:
            return []
        for one_name in names:
            hits = candidates(facts, one_name + SPIRIT_TAIL, page)
            if not hits:
                return []
            got += [h for h in hits if h not in got]
    return got


def _one_part(facts, page, part, head):
    out = []
    # 先剥括注再归一：norm() 去的是站内自加的消歧后缀（「故我在（电弧元素）」），
    # 整截都是括注时会被它吃光。
    part = norm(PAREN.sub(r'\1', (part or '').strip()))
    if not part:
        return out
    for one_name in [x.strip() for x in SLASH.split(part) if x.strip()]:
        hits = candidates(facts, one_name, page)
        if not hits:
            hits = candidates(facts, one_name + SPIRIT_TAIL, page)
        if not hits and head:
            # 框架与固有那几截：只在第一截那件东西自己的池里查，并允许写简称
            # （站内写「涡流」，库里叫「涡流框架」）。
            pool_names = weapon_pool(facts, head)
            hits = [h for name, hs in sorted(pool_names.items())
                    if name == one_name or name.startswith(one_name) for h in hs]
        for h in hits[:1] if page in SINGLE_PAGES and not head else hits:
            if h not in out:
                out.append(h)
    return out


def perk_stamper():
    """异域那两页共用一个：(这一行的主键们, 名字) → 主键列表。"""
    facts, _ = shared()
    return lambda keys, name: perk_key(facts, keys, name)


# ── 审计 ──────────────────────────────────────────────────────────────


def effects():
    """站内当作效果名管着的词。两张表都是现有的唯一真相，这里只读不抄。"""
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import check_terms
    import items
    out = {norm(w) for w, _, _ in check_terms.TERMS}
    out |= {norm(w) for w in items.MECH}
    return out


SET_TAIL = re.compile(r'(套装|\s+Set)$')


def set_key(name):
    """套装名的比对形态。库里有 5 套带「套装」后缀（Wayward Psyche Set），
    站内不带；后缀不携带信息，两边都去掉再比。"""
    return SET_TAIL.sub('', norm(name)).strip()


def set_of(name):
    """套装名 → set:<hash>。套装不在物品表里，在 DestinyEquipableItemSetDefinition
    上，所以自己查一次，不走 candidates()——那一条查的是物品。"""
    want = set_key(name)
    if not want:
        return ''
    for h, s in shared()[0].sets.items():
        if set_key(text(s)) == want:
            return 'set:%s' % h
    return ''


SET_SOURCE = re.compile(r'^- \*\*来源：\*\* *(.+?) *$', re.M)


def set_sources():
    """护甲套装的来源名。词表给一套登两个键，套装名与来源名，来源那一个不该去
    物品表里查。名单现扫源稿的「来源：」行——那一页的来源由人写，库里护甲条目的
    收藏来源与它不是一回事（库里写的是掉落活动，源稿写的是玩家管它叫什么）。"""
    path = os.path.join(shell.ROOT, 'references', 'armor-sets.md')
    with open(path, encoding='utf-8') as f:
        return {norm(m) for m in SET_SOURCE.findall(f.read())}


MARKER = re.compile(r'\{([\w-]+)\|([^{}]*)\}')
IMG = re.compile(r'!\[\]\([^)]*\)')


def bare(text):
    """剥掉着色与版式标记，只留文字。"""
    for _ in range(4):
        text = MARKER.sub(lambda m: m.group(2), text)
    return IMG.sub('', text).strip()


def source_hints():
    """{(页面, 名字): (来源, [Perk 名…])}。现扫源稿，不另存一份。

    生成器在渲染每一行时本来就拿得到这一行的 Perk 列，所以这不是审计专用的拐杖，
    是解析器在真实管线里同样会收到的那份输入。

    **先把人写层补回去再扫**：行的内容已经搬过去了，源稿只剩表头。不补，这几页
    整页拿 version='' perks=() 掉到 pick() 的末两档，复刻会选错版本——症状是
    索引里的主键悄悄换成另一把同名枪，页面上一个字都不变。
    """
    out = {}
    # 单件页即线索页：购物清单写着枪管、弹匣、两栏 Perk 与起源特性，异域两页
    # 写着专属 Perk，刷取清单写着获取地点与 Perk 列——复刻各版本的差别正在这些列上。
    # **名单不另抄一份**：抄一份就会漏登记，而漏掉的那一页 source_hints() 回空，
    # 它整页的行会拿 version='' perks=() 掉到 pick() 的末两档去。
    for page in sorted(SINGLE_PAGES):
        rel = 'docs/%s.md' % page
        path = os.path.join(shell.ROOT, 'references', rel)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            doc = research.inject(f.read(), page)
        for line in doc.split('\n'):
            # 切格走 markup.cells：{ico|![](…)} 里本身带竖线，裸 split 会切碎。
            spans = markup.cells(line)
            if not spans or len(spans) < 3:
                continue
            cells = [line[a:b] for a, b in spans]
            # 词表那一侧取文时格内换行已经没了，键要对齐到同一形态。
            name = bare(cells[0]).replace(markup.CELL_BREAK, '')
            if not name or name in ('武器', '名称', '金装') or name.startswith('=='):
                continue
            perks, src = [], ''
            for cell in cells[1:]:
                for tag, body in MARKER.findall(cell):
                    body = IMG.sub('', body)
                    if tag == 'src' and not src:
                        # 来源列写的就是玩家管这次掉落叫什么，与收藏条目的
                        # sourceString 对得上，正是复刻之间唯一的差别。
                        src = body.strip().strip('~')
                    if tag != 'perk':
                        continue
                    for part in body.split(markup.CELL_BREAK):
                        part = part.strip().lstrip('↑')
                        # 画了删除线的那一条，标的正是「最新这一版已经开不出来了」。
                        # 它是源稿按最新数据得出的结论，不该进「这一版必须开得出」
                        # 的那个集合——留着会让全覆盖永远不成立。
                        if part and not part.startswith('~~'):
                            perks.append(part)
            if perks or src:
                was = out.get((page, norm_keep(name)), ('', []))
                out[(page, norm_keep(name))] = (src or was[0], was[1] + perks)
    return out


def site_names():
    """建了索引的页上的全部行标题。直接读 data/index/，不绕 vocab。

    审计管的是「站内自己的物品表覆盖到哪」，那是索引的全体；vocab 只读其中
    配装用得上的那 17 页，拿它当入口会让新加索引的页静默不进审计。

    异域 PERK 那一列的子条目不在内：它们按武器自己的 socket 池解析（perk_key），
    解析不到就直接卡住构建，不归这条按页面范围查的路管。"""
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import pagedex
    # 按 (名字, 页) 去重，不按主键去重：神器模组有 14 个名字在不同档位上各有一条，
    # 带着主键去重会让同一个名字在报表里数两次。
    out = {}
    for page in pagedex.TOKENS:
        for e in pagedex.must_read(page)['entries']:
            if e['name'] and e['kind'] != '分节' and not e.get('of'):
                out.setdefault((e['name'], page), ' '.join(e.get('keys') or ()))
    return [(n, p, k) for (n, p), k in sorted(out.items())]


def variants():
    """护甲模组页的复合行：一行盖住若干变体，解析不到单个 hash 是对的。"""
    path = os.path.join(shell.ROOT, 'tools', 'mod-variants.json')
    if not os.path.exists(path):
        return set()
    with open(path, encoding='utf-8') as f:
        table = json.load(f)
    rows = {v['row'] for v in table.values() if isinstance(v, dict) and 'row' in v}
    return rows


def classify(facts, name, page, key, composite, effect_names, sources, hints):
    """一个名字的去向。返回 (档位, 说明)。

    **以索引里实际戳上的那一位为准**，不另算一遍。审计要回答的是「站内每个名字
    都落到主键上了没有」，生成器戳的那一位就是答案；另算一份必然与它分歧——组合行
    「故我在（意外缓刑）涡流」明明戳上了三个主键，却会被算成未解析。
    只有没戳上的才往下走解释的梯子。"""
    if page in SET_PAGES:
        # 套装页的名字先按「是不是某一套自己的名字」判，再按「是不是它的来源名」判。
        # 两样都戳成同一个 set: 主键，只看主键分不出这一层。
        if any(set_key(text(s)) == set_key(name)
               for s in facts.sets.values()):
            return '套装', ''
        if norm(name) in sources:
            return '来源别名', ''
    if key:
        if name in DERIVED:
            return '派生', DERIVED[name][1]
        head = key.split()[0]
        if head.startswith('set:'):
            return '套装', ''
        if head.startswith(('perk:', 'trait:', 'stat:')):
            return '效果', key
        return '物品', key
    if page in SET_PAGES:
        return '未解析', '套装表里既不是套装名也不是来源名'
    if page not in SCOPES:
        return '未解析', '这一页还没写范围定义'
    src, perks = hints.get((page, norm_keep(name)), ('', ()))
    h, why = resolve(facts, name, page, version=src, perks=perks)
    if h is not None:
        return '物品', why
    # 一格里写了基础与强化两个名字（「抗性系链 强化型抗性系链」），取前一个。
    if ' ' in name and resolve(facts, name.split(' ')[0], page)[0] is not None:
        return '物品', '取格内首名'
    eff = resolve_effect(facts, name)
    if eff:
        return '效果', eff
    base = DERIVED.get(name)
    if base:
        first = base[0] if isinstance(base[0], str) else base[0][0]
        root = resolve_effect(facts, first) or resolve(facts, first, page)[0]
        if root:
            return '派生', '%s ← %s' % (root, base[1])
    if name in composite:
        return '复合行', ''
    if norm(name) in effect_names:
        return '效果', '站内当效果管着，库里没有同名 trait'
    if name in NOT_ITEMS:
        return '机制小节', NOT_ITEMS[name]
    if page in SINGLE_PAGES:
        cand = one(facts, name, page, version=src, perks=perks)[2]
        if cand:
            return '待指定', '、'.join(cand)
    return '未解析', ''


ORDER = ('物品', '套装', '来源别名', '复合行', '效果', '派生', '机制小节',
         '待指定', '未解析')


def audit():
    facts = Facts()
    composite, effect_names = variants(), effects()
    sources, hints = set_sources(), source_hints()
    stat, misses, pend = {}, {}, {}
    for name, page, key in site_names():
        bucket, why = classify(facts, name, page, key, composite, effect_names,
                               sources, hints)
        row = stat.setdefault(page, collections.Counter())
        row[bucket] += 1
        if bucket == '未解析':
            misses.setdefault(page, []).append(name)
        if bucket == '待指定':
            pend.setdefault(page, []).append((name, why))

    total = sum(sum(r.values()) for r in stat.values())
    left = sum(r['未解析'] for r in stat.values())
    print('=== 站内引用得到的名字，逐页去向 ===')
    print('  %-26s %5s %5s %5s %5s %5s %5s %5s %5s %5s'
          % ('页面', '物品', '套装', '来源', '复合', '效果', '派生', '机制',
             '待指定', '未解析'))
    for page in sorted(stat):
        r = stat[page]
        print('  %-26s %5d %5d %5d %5d %5d %5d %5d %5d %5d'
              % (page, r['物品'], r['套装'], r['来源别名'], r['复合行'],
                 r['效果'], r['派生'], r['机制小节'], r['待指定'], r['未解析']))
    tot = collections.Counter()
    for r in stat.values():
        tot.update(r)
    print('  %-26s %5d %5d %5d %5d %5d %5d %5d %5d %5d'
          % ('合计 %d' % total, *(tot[k] for k in ORDER)))
    print('\n有归属 %d / %d  %.1f%%' % (total - left, total,
                                       100 * (total - left) / total))
    if pend:
        n = sum(len(v) for v in pend.values())
        print('\n=== 复刻分不出版本，等人钉（%d）——填进 resolve.PINNED ===' % n)
        for page in sorted(pend):
            for name, cand in sorted(pend[page]):
                print("    ('%s', '%s'): '%s'," % (page, name, cand.split('、')[0]))
                print('        # 候选 %s' % cand)
    if misses:
        print('\n=== 还没有归属的 ===')
        for page in sorted(misses):
            print('  %s（%d）：%s'
                  % (page, len(misses[page]), '、'.join(misses[page][:14])))
    return 0 if not left else 1


def key_name(facts, key):
    """一个主键在库里叫什么。"""
    got = facts.at(key)
    return text(got) if got else None


def names():
    """站内的写法与库里的名字逐条比。**名字以库为准**，站内那份是手写的。

    套装的来源名不参与：词表给一套登两个键，来源那一个本来就与套装名不同。
    """
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import pagedex
    facts = Facts()
    aliases = set_sources()
    diff = []
    total = 0
    for page in pagedex.TOKENS:
        for e in pagedex.must_read(page)['entries']:
            keys = e.get('keys') or []
            if not keys or (page in SET_PAGES and norm(e['name']) in aliases):
                continue
            # 站内自己标了版本后缀的行（「鲁莽神谕\\众神殿版本」）与派生条目
            # （「不稳定弹药」指回「不稳定」）本来就与库里的名字不同，不是写错。
            if e['name'] in DERIVED or VERSION_TAIL.match(e['name']):
                continue
            # 异域 PERK 列里的名字：前面那个上箭头是站内标催化剂的记号，不是名字；
            # 站内为这一格另起的写法（「弓手节奏²」）已在 PERK_ALIAS 里逐条记过依据。
            shown = norm(e['name'].lstrip('↑'))
            if e.get('of') and shown in PERK_ALIAS_KEYS:
                continue
            total += 1
            lib = {x for x in (key_name(facts, k) for k in keys) if x}
            if not lib or shown in {norm(x) for x in lib}:
                continue
            if collapsed(shown, lib):
                continue
            diff.append((page, e['name'], sorted(lib)))
    print('带主键的条目 %d 条，站内写法与库里不同的 %d 条' % (total, len(diff)))
    for page, name, lib in diff:
        print('  %-22s 站内 %-22s 库里 %s' % (page, name, '、'.join(lib)))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--audit', action='store_true', help='把站内的名字全跑一遍')
    ap.add_argument('--names', action='store_true', help='站内写法与库里的名字逐条比')
    a = ap.parse_args()
    if a.names:
        return names()
    if not a.audit:
        ap.error('要做什么？--audit 查归属，--names 比名字')
    return audit()


if __name__ == '__main__':
    sys.exit(main())
