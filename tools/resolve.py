#!/usr/bin/env python3
"""实体层只读视图（Facts）、站内文本/图标读取与词条池主键解析。"""

import json
import os
import re
import sys
import unicodedata

import markup
import shell

FACTS = os.path.join(shell.ROOT, 'data')
# 站内自发的主键：manifest 里查无同名的那 42 枚（三个职业、11 个副本来源、
# 11 个模组族、13 条机制行、4 个站内自造的概念）。号从 2^32 往上发，与
# Bungie 的 uint32 永不相撞。它是第六张实体表——28 枚名下挂着站内说明。
MINTED = os.path.join(FACTS, 'minted.json')
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

# 三种破盾的官方图标路径（DestinyBreakerTypeDefinition enum 1/2/3 ＝ 贯穿护盾／干扰／眩晕）。
CHAMP = {
    1: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_07b9ba0194e85e46b258b04783e93d5d.png',
    2: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_da558352b624d799cf50de14d7cb9565.png',
    3: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_825a438c85404efd6472ff9e97fc7251.png',
}


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
    return markup.strip_pua(got or '')


def icon_path(rec):
    """一条记录的官方图路径（ICON_PREFIX 已剥）。没有图的返回 None。"""
    return (rec or {}).get('icon')


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
        with open(MINTED, encoding='utf-8') as f:
            self.minted = json.load(f)
        self.tables = {'inventory-items': self.items, 'sandbox-perks': self.perks,
                       'traits': self.traits, 'stats': self.stats,
                       'equipable-item-sets': self.sets, 'minted': self.minted}
        self._pools = {}
        self._weapon_pools = {}
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
        `sandbox-perks` 撞了 6 个号，且是同名插件与效果。**解前缀只在这里做一次**。
        """
        key = str(key)
        for prefix, table in (('perk:', self.perks), ('trait:', self.traits),
                              ('stat:', self.stats), ('set:', self.sets)):
            if key.startswith(prefix):
                return table.get(key[len(prefix):])
        return self.items.get(key) or self.minted.get(key)

    def rec_id(self, key):
        """站内的键 → `表名/裸 hash`，即库里 recs 集合那一条的 `_id`。

        解前缀与 at() 同一条：带前缀的落在对应那张表；裸号先查物品表，再查 minted。
        """
        key = str(key)
        for prefix, table in (('perk:', 'sandbox-perks'), ('trait:', 'traits'),
                              ('stat:', 'stats'), ('set:', 'equipable-item-sets')):
            if key.startswith(prefix):
                return '%s/%s' % (table, key[len(prefix):])
        return '%s/%s' % ('inventory-items' if key in self.items else 'minted', key)

    def ref(self, pair):
        """按 `[表名, 主键]` 二元组取那条记录。**跨表引用只有这一种写法。**

        裸 hash 不唯一：`inventory-items` 与 `sandbox-perks` 撞了 6 个号，
        且是同名插件与效果。
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
                    # 已经开不出来的那一位。这份 manifest 里武器一枚都没标，
                    # 全库 4416 个 false 都在护甲的池子上。
                    if p.get('currentlyCanRoll', True):
                        plugs.append(p['plugItemHash'])
                # **插件也可以直接内联在这一栏上，不经 plugSet**（起源特性栏有 548 条如此）。
                for p in e.get('reusablePlugItems') or ():
                    if p['plugItemHash'] not in plugs:
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



def plugs_of(facts, keys):
    """这几件东西的插槽里挂得到的全部插件主键。

    初始插件、内联清单与两种插件池都算——罗马数字那一族（恐慌反应 II…V）与
    故我在的四个元素版本只在池里，光看初始插件够不着。
    """
    out = set()
    for key in keys:
        row = facts.at(str(key)) or {}
        for e in (row.get('sockets') or {}).get('socketEntries') or ():
            if e.get('singleInitialItemHash'):
                out.add(str(e['singleInitialItemHash']))
            out |= {str(p['plugItemHash']) for p in e.get('reusablePlugItems') or ()}
            for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
                if e.get(field):
                    out |= {str(p['plugItemHash'])
                            for p in (facts.plug_sets.get(str(e[field])) or {}).get(
                                'reusablePlugItems') or ()}
    return out


def resolve_effect(facts, name, owner=()):
    """效果名或属性名 → traitHash / sandboxPerkHash / statHash。增幅、致盲、冻结
    这一类不在物品表里，主键在 DestinyTraitDefinition 与 DestinySandboxPerkDefinition
    上；充能效率、防御抗性这一类在 DestinyStatDefinition 上。

    trait 优先：同名两边都有时（「瓦解」），trait 才是那个状态本身。

    **同名的好几枚按宿主收敛。**「快速冷却」库里有两枚：冰霜-EE5 那一枚是「冲刺
    提供能量」，另一枚是载具的召唤冷却；按名字全表排序会挑中后者，而两枚的名字
    一模一样，落错了从数据上看不出来。给了 owner 就先在这件东西自己插槽挂得到的
    那些插件的 perks 里找，找不到才回到全表。"""
    hits = facts.eff_by_name.get(norm(name)) or []
    if not hits:
        return None
    if owner:
        mine = {'perk:%s' % p['perkHash'] for key in plugs_of(facts, owner)
                for p in (facts.at(key) or {}).get('perks') or ()}
        near = [h for h in hits if h in mine]
        if near:
            hits = near
    return sorted(hits, key=lambda h: (not h.startswith('trait:'), h))[0]



_SHARED = None


def shared():
    """事实层只读一次，避免一轮构建重复读 12 MB JSON。"""
    global _SHARED
    if _SHARED is None:
        _SHARED = (Facts(), {})
    return _SHARED


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
    '雪上': ('雪上加霜', '刷取清单的简称；那几把枪的池里只有「雪上加霜」一条带「雪」'),
    '战壕': ('战嚎炮管', 'Trench Barrel，刷取清单按另一种译名写「战壕」'),
    '三连击': ('精准连击', '巴拉巴拉那一行的写法；池里带「连击」的只有「精准连击」'),
    '冷却饰品': ('冷却饰物', '刷取清单把「饰物」写成了「饰品」'),
    '冷却饰品（vog 套）': ('冷却饰物', '同上，括注是作者标的搭配'),
    '爆炸分配器': ('爆破分配器', '刷取清单把「爆破」写成了「爆炸」'),
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
    # 作者在推荐栏里写的整句，不是某一枚词条的名字。
    '任意合适增伤': '送魂者那一行：四号位挑一条增伤即可，没指名哪一枚',
    '余下三个 Perk': '滑溜运气那一行：四号位剩下的三枚都行',
    '能量球': '金刚磐石那一行写的是「产球」这件事，池里没有同名词条',
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

    一行里每个名字都要查一次池（装备库六千多次、只有七百多种），结果按 keys 记在
    facts 上，调用方只读不改。
    """
    memo = tuple(str(k) for k in keys)
    if memo in facts._weapon_pools:
        return facts._weapon_pools[memo]
    out = facts._weapon_pools[memo] = {}
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

    划掉的词条照样查：`{perk|~~加速突击~~}` 指的仍是那一枚，`~~` 说的是作者
    不再推荐它，与它是哪一枚无关。剥法与 items.py 抽 Perk 词表那一处相同。
    """
    name = norm((name or '').replace('~~', '').lstrip('↑').strip())
    if not name or name in PERK_LABEL_KEYS:
        return None
    name = PERK_ALIAS_KEYS.get(name, (name,))[0]
    pool_names = weapon_pool(facts, keys)
    got = []
    for part in [x.strip() for x in SLASH.split(name) if x.strip()]:
        got += _perk_one(facts, pool_names, part, keys)
    return got


def _perk_one(facts, pool_names, name, owner=()):
    if name in pool_names:
        return pool_names[name]
    span = ROMAN_SPAN.match(name)
    if span:
        base = span.group('base').strip()
        fam = [(n, hs) for n, hs in pool_names.items()
               if n == base or (n.startswith(base) and ROMAN_TAIL.match(n[len(base):]))]
        if fam:
            return [h for _, hs in sorted(fam) for h in hs]
    eff = resolve_effect(facts, name, owner)
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
