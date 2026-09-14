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
import shell

FACTS = os.path.join(shell.ROOT, 'data', 'facts')

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
    # 异域武器页给「英勇利刃」的核心与催化剂单写了一行。**那是它自己的两个槽**：
    # v950.new.sword0.perk_upgrades（冲击／折射／陀螺核心）与 .masterwork（催化剂）。
    # 库里只有那一件武器，差别在装了哪个插件上。
    '英勇利刃 2：核心之击': ('英勇利刃', '同一把武器的核心与催化剂两个槽'),
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

# 护甲套装页不查物品表：套装本身是 DestinyEquipableItemSetDefinition，另一份表。
SET_PAGE = 'armor-sets'

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

        self.items = read('items.json')
        self.pools = read('perk-pools.json')
        self.sets = read('armor-sets.json')
        self.effects = read('effects.json')
        self.stats = read('stats.json')
        self.eff_by_name = {}
        for table, prefix in ((self.effects, ''), (self.stats, 'stat:')):
            for h, v in table.items():
                for key in (v['n']['zh'], v['n'].get('en')):
                    if key:
                        self.eff_by_name.setdefault(norm(key), []).append(prefix + h)
        self.by_zh, self.by_en, self.by_fold = {}, {}, {}
        for h, v in self.items.items():
            self.by_zh.setdefault(norm(v['n']['zh']), []).append(h)
            en = v['n'].get('en')
            if en:
                self.by_en.setdefault(norm(en), []).append(h)
            self.by_fold.setdefault(fold(v['n']['zh']), []).append(h)
            if en:
                self.by_fold.setdefault(fold(en), []).append(h)

    def name(self, h):
        return (self.items.get(str(h)) or {}).get('n', {}).get('zh', '')

    def pool_names(self, h):
        """这把武器各栏能开出的词条名。起源特性在 init 上，与池取并集。"""
        out = set()
        for col in self.pools.get(str(h)) or []:
            for p in col.get('plugs') or ():
                out.add(norm(self.name(p)))
            if col.get('init'):
                out.add(norm(self.name(col['init'])))
        out.discard('')
        return out


def in_scope(row, scopes):
    for ty, tier, plug in scopes:
        if ty is not None and row['ty'] != ty:
            continue
        if tier is not None and row.get('tier') != tier:
            continue
        if plug is not None and not re.search(plug, row.get('plug') or ''):
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
    return (row['n']['zh'], row.get('icon'), row.get('tt', {}).get('zh'),
            row.get('rel'), row.get('wm'), row.get('dmg'), row.get('tier'))


def pick(facts, hits, version='', perks=()):
    """多个版本里挑一个。返回 (hash 或 None, 依据, 仍未排除的候选)。

    **分不出就交出候选，不按序号猜。**复刻的版本之间差的是词条池与来源，序号大小
    不表示哪个是站内说的那个；曾经拿「序号最大」兜底，把 352 条词条选成了它们的
    强化孪生条目。"""
    if len(hits) == 1:
        return hits[0], '唯一', hits
    if version:
        want = VERSION_SOURCE.get(version, version).rstrip('版本')
        same = [h for h in hits if want
                and want in (facts.items[h].get('src') or {}).get('zh', '')]
        if len(same) == 1:
            return same[0], '版本后缀', same
        if same:
            hits = same
    want = {norm(p) for p in perks if p} - {'无', ''}
    if want:
        scored = [(len(want & facts.pool_names(h)), facts.items[h]['idx'], h) for h in hits]
        top = max(s for s, _, _ in scored)
        best = [h for s, _, h in scored if s == top]
        if top and len(best) == 1:
            return best[0], '词条重合', best
        if top:
            hits = best
    # 大师版与特殊版本是同名的另一件东西，不是「另一个版本」：源稿写的是普通版，
    # 要大师版会在名字里写出来。两条都是语义判据。
    for flag in ('adept', 'holo'):
        plain = [h for h in hits if not facts.items[h].get(flag)]
        if plain and len(plain) < len(hits):
            hits = plain
    if len(hits) == 1:
        return hits[0], '非大师非特殊版', hits
    # 有收藏条目的那个才是玩家拿得到的正主；同名的另一条往往是没有收藏、
    # 只在载具/预览里用的副本。这是语义判据，不是按序号猜。
    owned = [h for h in hits if facts.items[h].get('coll')]
    if len(owned) == 1:
        return owned[0], '有收藏条目', owned
    if owned:
        hits = owned
    if len(hits) == 1:
        return hits[0], '唯一', hits
    # 剩下的若逐字段相同（同名、同图、同类型、同发布版本、同水印），选哪个都一样，
    # 取序号最小的那个并说明依据；不同则交出候选。
    if len({same_shape(facts.items[h]) for h in hits}) == 1:
        first = min(hits, key=lambda h: facts.items[h]['idx'])
        return first, '重复条目内容一致', hits
    return None, '分不出版本', hits


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
        if hits and any(want in (facts.items[h].get('src') or {}).get('zh', '')
                        for h in hits):
            return base, tail
    return name, ''


# 一个名字指一件东西还是指一族东西，按页面分。
#
#   武器、护甲：指一件。复刻使同名多 hash，要挑出站内说的那一个版本。
#   词条、模组、技能：**指一族，全要**。「双重装填」同时有普通特性与强化特征两条，
#       源稿那一行的 {enh|↑2} 正是同时记着两者；护甲模组与神器模组同理有多个版本。
SINGLE_PAGES = frozenset({'exotic-weapon', 'exotic-armor', 'shopping-primary',
                          'shopping-special', 'shopping-heavy', 'shopping-other'})


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
    """一页的戳号器：名字 → ` data-hash="…"`，戳不上就回空串。

    **只给有范围定义的那些页戳**，也就是 vocab.py 要扫的那 17 页——戳 hash 的用处
    正是让它从按名字猜改成读主键。别的页的行标题不参与跨页引用，戳了没人读。

    词条与模组是一族，一格里可能有几个 hash（「双重装填」有普通与强化两条），
    按空格分开写在同一位上；武器与护甲只有一个。
    """
    if page not in SCOPES:
        return None
    facts, hints = shared()

    def stamp(name):
        name = (name or '').strip()
        if not name:
            return ''
        if page in SINGLE_PAGES:
            src, perks = hints.get((page, norm(name)), ('', ()))
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
            # 派生条目指回基那一条：同一把武器的第二种形态、某个关键词赋予的弹药，
            # 库里都只有基那一条，反查时它们本就该落在同一件东西上。
            base = DERIVED[name][0]
            got = [x for x in (resolve_effect(facts, base),) if x] or pool(facts, base, page)
        return ' data-hash="%s"' % ' '.join(got) if got else ''

    return stamp


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


SET_SOURCE = re.compile(r'^- \*\*来源：\*\* *(.+?) *$', re.M)


def set_sources():
    """护甲套装的来源名。词表给一套登两个键，套装名与来源名，来源那一个不该去
    物品表里查。名单现扫源稿的「来源：」行——那一页的来源由人写，库里护甲条目的
    收藏来源与它不是一回事（库里写的是掉落活动，源稿写的是玩家管它叫什么）。"""
    path = os.path.join(shell.ROOT, 'references', 'armor-sets.md')
    with open(path, encoding='utf-8') as f:
        return {norm(m) for m in SET_SOURCE.findall(f.read())}


# 源稿里能拿来定版本的那几列。购物清单四页写着枪管、弹匣、两栏 Perk 与起源特性，
# 异域两页写着专属 Perk；这些正是各版本词条池的差别所在。
HINT_DOCS = {
    'shopping-primary': 'docs/shopping-primary.md',
    'shopping-special': 'docs/shopping-special.md',
    'shopping-heavy': 'docs/shopping-heavy.md',
    'shopping-other': 'docs/shopping-other.md',
    'exotic-weapon': 'docs/exotic-weapon.md',
    'exotic-armor': 'docs/exotic-armor.md',
}
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
    是解析器在真实管线里同样会收到的那份输入。"""
    out = {}
    for page, rel in HINT_DOCS.items():
        path = os.path.join(shell.ROOT, 'references', rel)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for raw in f:
                line = raw.rstrip('\n')
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
                            if part:
                                perks.append(part)
                if perks or src:
                    was = out.get((page, norm(name)), ('', []))
                    out[(page, norm(name))] = (src or was[0], was[1] + perks)
    return out


def site_names():
    """站内跨页引用得到的全部名字。现扫 vocab 的索引，不另存一份清单。"""
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import vocab
    out = []
    for hits in vocab.build().values():
        for e in hits:
            if e['kind'] != '分节':
                out.append((e['name'], e['page']))
    return sorted(set(out))


def variants():
    """护甲模组页的复合行：一行盖住若干变体，解析不到单个 hash 是对的。"""
    path = os.path.join(shell.ROOT, 'tools', 'mod-variants.json')
    if not os.path.exists(path):
        return set()
    with open(path, encoding='utf-8') as f:
        table = json.load(f)
    rows = {v['row'] for v in table.values() if isinstance(v, dict) and 'row' in v}
    return rows


def classify(facts, name, page, composite, effect_names, sources, hints):
    """一个名字的去向。返回 (档位, 说明)。"""
    if page == SET_PAGE:
        if any(set_key(s['name']['zh']) == set_key(name)
               for s in facts.sets.values()):
            return '套装', ''
        if norm(name) in sources:
            return '来源别名', ''
        return '未解析', '套装表里既不是套装名也不是来源名'
    if page not in SCOPES:
        return '未解析', '这一页还没写范围定义'
    src, perks = hints.get((page, norm(name)), ('', ()))
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
        root = resolve_effect(facts, base[0]) or resolve(facts, base[0], page)[0]
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
    stat, misses = {}, {}
    for name, page in site_names():
        bucket, _ = classify(facts, name, page, composite, effect_names,
                             sources, hints)
        row = stat.setdefault(page, collections.Counter())
        row[bucket] += 1
        if bucket == '未解析':
            misses.setdefault(page, []).append(name)

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
    pend = {}
    for name, page in site_names():
        b, why = classify(facts, name, page, composite, effect_names, sources, hints)
        if b == '待指定':
            pend.setdefault(page, []).append((name, why))
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
    if key.startswith('set:'):
        got = facts.sets.get(key[4:])
        return got['name']['zh'] if got else None
    if key.startswith(('trait:', 'perk:')):
        got = facts.effects.get(key)
        return got['n']['zh'] if got else None
    if key.startswith('stat:'):
        got = facts.stats.get(key[5:])
        return got['n']['zh'] if got else None
    got = facts.items.get(key)
    return got['n']['zh'] if got else None


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
            keys = (e.get('hash') or '').split()
            if not keys or (page == SET_PAGE and norm(e['name']) in aliases):
                continue
            # 站内自己标了版本后缀的行（「鲁莽神谕\\众神殿版本」）与派生条目
            # （「不稳定弹药」指回「不稳定」）本来就与库里的名字不同，不是写错。
            if e['name'] in DERIVED or VERSION_TAIL.match(e['name']):
                continue
            total += 1
            lib = {x for x in (key_name(facts, k) for k in keys) if x}
            if lib and norm(e['name']) not in {norm(x) for x in lib}:
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
