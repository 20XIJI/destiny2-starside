#!/usr/bin/env python3
"""主键骨架 → markdown 表格：源稿只写主键，每一格从记录上取。

资料页源稿的表区是「列：」那一行，加紧接着的连续非空行，遇空行或 `##` 结束：

    列：PERK | 图标 | 说明
    1507295317 1806718225  加速散热器
    == 组名 ==

一行一条，主键用空格分开，第一枚是行首、其余是它盖住的别的 hash；两个空格之后是
行标题，**以源稿为准**（「继电器防御者\\\\强化型继电器防御者」这类站内写法与记录的
name 不同）。`expand()` 把每个表区换成 `| 表头 |` 那种表交给 convert-doc 的
render_table，渲染链不必知道格子从哪来。

一格从哪取：

- 行标题：源稿。
- 站内写的：「数据源：是」那几页落在记录本体的 `i18n.zh-CN`，购物清单与刷取清单落在
  `authors.<作者>`。字段名按 fields_of()：首列 name、「图标」icon、「说明」
  realgame_details，其余即列名，同一张表里重名的第二列加 `#2`。同一枚主键在一页里
  第 k 次出现取第 k 段：本页标了 `page` 的变体排最前，然后是本体，再是其余变体。
- 从主键现取：DERIVED 那几列，见各自的函数。
- 一行底下的子行：技能记录的 `enhanced`（星相带来的强化）、框架记录的 `weaponTypes`
  （按枪型的说明），紧跟在本行之后画，源稿里没有这几行。
- 异域两页的「异域 PERK」与「说明」：装备、固有 perk、催化剂各是一条记录，行上把
  它们合回来，见 exotic_perks() 与 exotic_text()。
- 矩阵表（棱镜页的共享技能、异域护甲页的职业物品之灵）：一行指向别的主键，
  对应写在 references/pages/<页>.json。

造不出来的格子**不中止当页**：记进 PROBLEMS、那一格留空，所有页面写完之后由
convert-doc 一次报出并中止。一格一格地中止要重跑二十一遍才看得到全貌。
"""

import collections
import json
import os
import re

import icons
import markup
import resolve
import shell
from facts import shown

ZH = 'zh-CN'

# 一页的正文归谁。「数据源：是」那几页是站内的根本数据，落在记录本体；
# 购物清单与刷取清单是作者，落在 authors 名下。
BODY = frozenset({'weapon-perks', 'armor-mods', 'exotic-weapon', 'exotic-armor', 'arc',
                  'solar', 'void', 'stasis', 'strand', 'prismatic', 'class-abilities'})
AUTHORED = {**{p: 'Aegis' for p in ('shopping-primary', 'shopping-special',
                                    'shopping-heavy', 'shopping-other')},
            **{p: 'LGpig' for p in ('legendary-primary', 'legendary-special',
                                    'legendary-heavy', 'exotic-weapons',
                                    'exotic-armors', 'farming-sets')}}
EXOTIC = frozenset({'exotic-weapon', 'exotic-armor'})

# defaultDamageType 枚举 → (着色 token, 站内写法)。5 是「突袭」，站内用不到。
ELEMENT = {1: ('el-kinetic', '动能'), 2: ('el-arc', '电弧'), 3: ('el-solar', '烈日'),
           4: ('el-void', '虚空'), 6: ('el-stasis', '冰影'), 7: ('el-strand', '缚丝')}

# 作者写的那几格：源表的中文列名 → 作者块里的字段名。两位作者的字段名不同
# （aegis_tier／lgpig_tier），所以按作者分表。键名见 data/ 的 site_authors。
# 同一段站内正文的几种叫法：物品记录用英文字段名，自发主键沿用源表的中文列名
TEXT_FIELDS = ('realgame_details', '效果', '说明')

AUTHOR_FIELDS = {
    'Aegis': {'评级': 'aegis_tier', '来源': 'aegis_source', '枪管': 'barrel',
              '弹匣': 'magazine', '大师': 'masterwork', 'Perk 1': 'perk1',
              'Perk 2': 'perk2', '起源特性': 'origin', '注解': 'explanation_1'},
    'LGpig': {'评级': 'lgpig_tier', '获取地点': 'lgpig_source', '定位': 'role',
              'Perk 三号位': 'perk1', 'Perk 四号位': 'perk2', 'DPS': 'dps',
              '总伤': 'total_damage', '切换 DPS': 'swap_dps', '备注': 'notes',
              '评级理由': 'lgpig_tier_explanation',
              '理由一': 'explanation_1', '理由二': 'explanation_2', '理由三': 'explanation_3'},
}

AMMO_GEN = '1931675084'     # 弹药生成
CHARGE_RATE = '3022301683'  # 充能效率（刀剑）
IMPACT = '4043523819'       # 伤害（刀剑）

PERK_SOCKETS = ('intrinsic', 'trait')
PARA = '\\\\ \\\\'          # 段落之间：格内换行两次

# (页, 行标题, 列, 原因)
PROBLEMS = []
_FACTS = None
_USERS = None
_TYPES = None
_ELSEWHERE = None
_CLAIMED = None


def facts():
    global _FACTS
    if _FACTS is None:
        _FACTS = resolve.shared()[0]
    return _FACTS


# 列名 → 字段名。只有这三个另起名字，其余用列名本身。
RENAME = {'图标': 'icon', '说明': 'realgame_details'}


def src_path(page):
    """一页源稿的绝对路径。主键骨架在 references/keys/，散文与表在 docs/。"""
    got = shell.source_path(page)
    if got is None:
        markup.die('找不到源稿：%s' % page)
    return got


def heads(page):
    """一页源稿表区里每一行的行首主键，按出现顺序。

    表区是「列：」那一行加紧接着的连续非空行，遇空行或 `##` 结束。一行可以写
    好几枚主键，第一枚是行首、说的是这一行那件东西，其余是它盖住的别的 hash。
    横幅行（`== 组名 ==`）不带主键，跳过。

    源稿只剩主键清单，所以这是「这一页有哪些行」的唯一入口。
    """
    out, inside = [], False
    with open(src_path(page), encoding='utf-8') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if line.startswith('列：'):
                inside = True
                continue
            if not line.strip() or line.startswith('##'):
                inside = False
                continue
            if not inside or line.strip().startswith('=='):
                continue
            keys = line.strip().partition('  ')[0].split()
            if keys:
                out.append(keys[0])
    return out


def fields_of(head):
    """表头各格 → 各自的字段名。

    重名列加序号后缀：异域护甲页有一张 `左栏|图标|说明|右栏|图标|说明`，一行摆
    两件东西。不加后缀，后三格会盖掉前三格，一行两件变成同一件画两遍。
    """
    out, seen = [], {}
    for col in head:
        name = 'name' if col == head[0] else RENAME.get(col, col)
        seen[name] = seen.get(name, 0) + 1
        out.append(name if seen[name] == 1 else '%s#%d' % (name, seen[name]))
    return out


def where_of(page):
    """页面的产出目录。「路径：」把它挂到子目录里，缺省就是 slug 本身。

    与 convert-doc.where_of() 同一条判据；跨页链接按目录拼，取错了整条链接落空。
    """
    with open(src_path(page), encoding='utf-8') as f:
        got = re.search(r'^路径：(.*)$', f.read(), re.M)
    return got.group(1).strip() if got else page


def minted(page, shown):
    """行标题落不到库里的主键上时，按页与显示名合成一个。

    59 行落在这里，三类：真机制（弩弹、刀剑格挡——库里没有对应物品）、组合行
    （「故我在（意外缓刑）涡流」）、复刻版本行（「陨落铡刀猛攻版本」）。后两类其实
    是解析失败，早晚该拿到真主键；合成键让它们先有个落点，实体层因此覆盖得到页面
    上的每一行。**合成的不是 Bungie 主键，前缀写明。**

    **规则只有这一处**：页面渲染与页面索引两边都调它，合出来的键必须一样，否则
    锚点与渲染结果落不到同一条实体上。名字用渲染后的显示名（格内换行已经收掉）。
    """
    return 'row:%s/%s' % (page, shown)


def is_skeleton(md):
    return re.search(r'^列：', md, re.M) is not None


def zh(rec):
    return ((rec or {}).get('i18n') or {}).get(ZH) or {}


def name_of(key):
    return zh(facts().at(key)).get('name') or ''


def combo(rec):
    return (rec or {}).get('kind') == '组合'


_SUBS = {}


def subs_of(page, key):
    """画在 `key` 那一行底下的组合，按 minted.json 里的顺序。`page` 是源稿的 slug。

    组合记录标着 `page`，归那一页。**源稿列了它，它自己占一行**（虚空页的手持
    超新星）；**没列就画在第一位成员那一行底下**（故我在的四条元素行、英勇利刃的
    冲击核心）——它们说的是同一把枪换一套固有之后的样子，单独占一行读者会当成
    另一把异域。子行的标题写在记录的 `site_when` 上。

    记录里的 `page` 写的是产出目录（`elements/void`），所以拿 where_of() 比。
    """
    if page not in _SUBS:
        listed = set(heads(page))
        where = where_of(page)
        got = collections.defaultdict(list)
        for k, rec in facts().minted.items():
            if combo(rec) and rec.get('page') == where and k not in listed:
                got[str((rec.get('members') or [''])[0])].append(k)
        _SUBS[page] = got
    return _SUBS[page].get(key, [])


# ── 图 ────────────────────────────────────────────────────────────────
def icon_file(key):
    """一枚主键站上发的那张图，路径相对站根。没有就回 None。

    `icon_from` 指着别的主键时取那一枚的（普通版与强化版同框取普通版，「烈焰战锤
    （无敌索尔）」取无敌索尔）；组合没有自己的图时取第一个成员的。
    """
    rec = facts().at(key) or {}
    if rec.get('icon_from'):
        return icon_file(str(rec['icon_from']))
    if rec.get('icon_local'):
        return rec['icon_local']
    if combo(rec) and rec.get('members'):
        return icon_file(str(rec['members'][0]))
    return None


def rel(path, where):
    return os.path.relpath(path, where).replace(os.sep, '/')


# ── 从主键现取的列 ────────────────────────────────────────────────────
def weapon_of(key):
    """派生列看的那件武器：组合看第一个成员。"""
    rec = facts().at(key) or {}
    if combo(rec) and rec.get('members'):
        return facts().at(str(rec['members'][0])) or {}
    return rec


def stat_of(rec, stat):
    group = facts().groups.get(str((rec.get('stats') or {}).get('statGroupHash')))
    return shown(rec, group, stat)


def champ_path(breaker):
    return 'assets/icons/%s.webp' % os.path.splitext(os.path.basename(icons.CHAMP[breaker]))[0]


def set_count(key):
    """套装效果 → 「N 件」。件数是套装 setPerks 里指向这条效果的 requiredSetCount。"""
    rec = facts().at(key) or {}
    bare = key.partition(':')[2]
    for s in rec.get('onSets') or ():
        for p in (facts().sets.get(str(s)) or {}).get('setPerks') or ():
            if p['perk'][1] == bare:
                return '%d 件' % p['requiredSetCount']
    return None


def type_names():
    """itemSubType → 站内枪型名，取用这个枚举的武器里最常见的 itemTypeDisplayName。"""
    global _TYPES
    if _TYPES is None:
        seen = collections.defaultdict(collections.Counter)
        for rec in facts().items.values():
            if rec.get('itemType') == 3:
                seen[rec.get('itemSubType')][zh(rec).get('itemTypeDisplayName', '')] += 1
        _TYPES = {sub: c.most_common(1)[0][0] for sub, c in seen.items()}
    return _TYPES


# ── 异域：装备、固有 perk、催化剂合回一行 ───────────────────────────────
def socket_kind(entry):
    return ((facts().socket_types.get(str(entry.get('socketTypeHash'))) or {})
            .get('derived') or {}).get('kind')


def perk_plugs(rec, pools=False):
    """一件异域的固有与特征栏里的插件，按栏序：插着的那一枚与内联的几枚。

    pools 为真时再加上插件池里的：墓园双星那一栏可以换成傀儡决心、傀儡野心，
    说明里三枚都讲了。
    """
    out = []
    for e in (rec.get('sockets') or {}).get('socketEntries') or ():
        if socket_kind(e) not in PERK_SOCKETS:
            continue
        got = ([e['singleInitialItemHash']] if e.get('singleInitialItemHash') else []) + \
            [p['plugItemHash'] for p in e.get('reusablePlugItems') or ()]
        if pools:
            for f in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
                got += [p['plugItemHash'] for p in
                        (facts().plug_sets.get(str(e.get(f))) or {}).get('reusablePlugItems') or ()]
        for h in got:
            if str(h) not in out:
                out.append(str(h))
    return out


def reach(key):
    """这一行的正文可能落在哪几枚主键上：固有、特征、催化剂，再往下一跳到它们的效果。

    组合行只看成员（第一个成员是装备本身，不算）。
    """
    rec = facts().at(key) or {}
    if combo(rec):
        plugs = [str(m) for m in rec.get('members', [])[1:]]
    else:
        plugs = (perk_plugs(rec, pools=True)
                 + [h for g in option_plugs(rec) for h in g]
                 + [str(c) for c in (rec.get('derived') or {}).get('catalyst') or ()])
    out = []
    for h in plugs:
        for one in [h] + ['perk:%s' % p['perkHash'] for p in (facts().at(h) or {}).get('perks') or ()]:
            if one not in out:
                out.append(one)
    return out


def claimed():
    """被组合记录点名的成员（第一位是装备本身，不算）。

    一枚固有归组合行：站内关于电弧导体的话写在「故我在（电弧元素）」那一行上，装备
    那一行不再列它的名字，也不合它的正文。故我在的固有栏与刀剑框架栏都是随机池
    （8 枚固有、5 种框架），插着的那一枚只是一次掉落，列在装备行上读者会当成固定的。

    判据是记录自己的 kind，与它出现在哪一页无关：同几枚固有在异域武器详解页与刷取
    清单页各组过一次合，两处的认领是同一件事。
    """
    global _CLAIMED
    if _CLAIMED is None:
        _CLAIMED = set()
        for key, rec in facts().minted.items():
            if combo(rec):
                _CLAIMED.update(reach(key))
    return _CLAIMED


def users():
    """异域两页每一枚宿主被几行够得着。只被一行够得着的，它的正文才属于那一行。

    同一枚效果常挂在好几件东西上（「治疗弹匣」既是朱雀意图之刃的催化剂，也是武器
    PERK 页的一行），那段文字是别处写的，合进这一行等于把别页的正文抄过来。
    组合点名的成员归组合，不算进装备那一行。
    """
    global _USERS
    if _USERS is None:
        _USERS = collections.Counter()
        for page in EXOTIC:
            for head in heads(page):
                if combo(facts().at(head)):
                    continue
                for h in reach(head):
                    _USERS[h] += 1
        for h in claimed():
            _USERS[h] = 0
    return _USERS


def elsewhere():
    """别的资料页上某一行的说明。

    异域的特征栏常插着一枚通用词条（黑桃A 的萤火虫），那一枚身上是武器 PERK 页
    那一行的说明，与这件异域自己写的数值对不上。它属于那一页，不合进这一行。
    """
    global _ELSEWHERE
    if _ELSEWHERE is None:
        _ELSEWHERE = set()
        for page in BODY - EXOTIC:
            for head in heads(page):
                got = zh(facts().at(head)).get('realgame_details', '').strip()
                if got:
                    _ELSEWHERE.add(got)
    return _ELSEWHERE


def own_hosts(key):
    """这一行合进来的正文落在哪几枚上：只被这一行够得着、说明也不属于别页的那几枚。"""
    rec = facts().at(key) or {}
    got = reach(key)
    if combo(rec):
        return got
    mine = {h for h in got if not h.startswith('perk:')} | {key}
    out = []
    for h in got:
        if users()[h] != 1:
            continue
        if h.startswith('perk:') and not {str(i) for i in (facts().at(h) or {}).get('onItems') or ()} <= mine:
            continue
        if zh(facts().at(h)).get('realgame_details', '').strip() in elsewhere():
            continue
        out.append(h)
    return out


def exotic_parts(key, own):
    """装备本体的第一段，接着各宿主的正文，再接本体其余段落：`[(主键, 文字)]`。

    主键是那一段文字写在哪条记录上。本体的首段与其余段落是同一个字段，拆在宿主
    两侧，所以本体那一枚可能出现两次。"""
    paras = [p.strip() for p in own.split(PARA) if p.strip()]
    hosts, seen = [], set()
    for h in own_hosts(key):
        t = zh(facts().at(h)).get('realgame_details', '').strip()
        if t and t not in seen:
            seen.add(t)
            hosts.append((h, t))
    rest = (' %s ' % PARA).join(paras[1:])
    return ([(key, paras[0])] if paras else []) + hosts + ([(key, rest)] if rest else [])


def exotic_text(key, own):
    """exotic_parts() 拼成一格。"""
    return (' %s ' % PARA).join(t for _, t in exotic_parts(key, own))


def authors_of(rec):
    """一条记录上的作者块 `{作者: 那一段}`。站内字段随语言走，落在
    `i18n.zh-CN.site_authors`；效果表那 29 条作者评语在根上的 `authors`。
    取法只有这一处，页面、词表与回归共用。"""
    return zh(rec).get('site_authors') or rec.get('authors') or {}


def authors_path(rec):
    """作者块在记录上的路径，取法与 authors_of() 同一条。就地编辑按它标出处。"""
    return 'i18n/zh-CN/site_authors' if zh(rec).get('site_authors') else 'authors'


def author_block(rec, who):
    return authors_of(rec).get(who) or {}


EMPTY_SOCKET = 'crafting.recipes.empty_socket'
EMPTY_SLOT = re.compile(r'^空.*插槽$')
# 选项槽扫的是「剩下那些」：固有、特征、催化、击杀记录器、外观各有归处。
OPTION_SKIP = frozenset({'intrinsic', 'trait', 'masterwork', 'tracker', 'cosmetic'})

# 「异域 PERK」那一格交出来的四样。picks 是一池多选的那几组，组里的名字都在 names 里。
Perks = collections.namedtuple('Perks', 'names first icons picks')


def socket_pool(e):
    """一个插槽插得进去的全部插件：初始那枚、内联那几枚、插件池里那些。"""
    out = []
    if e.get('singleInitialItemHash'):
        out.append(str(e['singleInitialItemHash']))
    out += [str(p['plugItemHash']) for p in e.get('reusablePlugItems') or ()]
    for field in ('reusablePlugSetHash', 'randomizedPlugSetHash'):
        if e.get(field):
            out += [str(p['plugItemHash']) for p in
                    (facts().plug_sets.get(str(e[field])) or {}).get('reusablePlugItems') or ()]
    return list(dict.fromkeys(out))


def option_plugs(rec):
    """选项槽里的异域插件，一槽一组：英勇利刃的冲击核心／折射核心／陀螺核心那一栏。

    判据是「插得进去的是异域品阶的东西」。同一批槽里还有形态、属性模组与水晶颜色，
    都是传说及以下，按这一条自然落在外面。两页 494 行里只有英勇利刃命中。
    """
    out = []
    for e in (rec.get('sockets') or {}).get('socketEntries') or ():
        if socket_kind(e) in OPTION_SKIP:
            continue
        got = [h for h in socket_pool(e)
               if ((facts().at(h) or {}).get('inventory') or {}).get('tierType') == 6
               and name_of(h) and not EMPTY_SLOT.match(name_of(h))]
        if got:
            out.append(got)
    return out


def live_catalyst(c):
    """任务态那条不算。解锁前的催化剂在库里另有一条，跟着武器叫（SUROS政权那把叫
    「升级大师杰作」）、品阶普通、给的效果没名字，三条合起来只有这一枚。"""
    rec = facts().at(c) or {}
    return ((rec.get('inventory') or {}).get('tierType') == 6
            or any(name_of('perk:%s' % p['perkHash']) for p in rec.get('perks') or ()))


_FRAMES = None


def frame_rows():
    """武器框架页那 93 行：`(框架名, 枪型, 弹药) → 那一行`。

    **键是这个三元组，不是框架主键**：同名框架在库里有好几枚 hash（「精密框架」
    既是 1636108362 也是 1322370662），表行只挂在其中一枚上，按 hash 配只覆盖
    1494 把、按这个三元组覆盖 2032 把。弹药那一位是为「动态热量武器 + 手炮」那
    两行来的：一行主武器、一行特殊弹药（无礼言论），去掉它这个键就不唯一。
    """
    global _FRAMES
    if _FRAMES is None:
        _FRAMES = {}
        for h, rec in facts().items.items():
            for row in zh(rec).get('site_frameStats') or ():
                _FRAMES[(name_of(h), row.get('itemSubType'), row.get('ammoType'))] = row
    return _FRAMES


def frame_row(rec):
    """一件武器在武器框架页上的那一行，没有就回 None。异域自己的框架不在表里。"""
    arch = (rec.get('derived') or {}).get('archetype')
    if not arch:
        return None
    return frame_rows().get((name_of(str(arch)), rec.get('itemSubType'),
                             (rec.get('equippingBlock') or {}).get('ammoType')))


def exotic_pool(key):
    """一件异域自己开得出来的词条：`{显示名: 取图的主键}`。

    两处并起来。一处是「异域特性」那一格里的几条（`exotic_perks`）；另一处是固有栏、
    特征栏与起源栏的插件池——零号修订那一列可 roll 的六条、故我在的五种刀剑框架与
    八条异域固有都在后者，它们不是格子里那几条。组合行（故我在的四条元素行）自己
    不是一件装备，池看它第一位成员，行名已经钉死的那几条不重复列。

    **固有栏按这件装备自己的那一枚登记。**故我在那八条固有与别的异域重名（狼群弹药
    在加拉尔号角名下也有一条），但各是一枚自己的 hash：故我在的狼群弹药是
    1959135343，加拉尔号角的是 2962361451。不登记的话，站内关于「故我在的狼群弹药」
    就只剩别人名下那一份可查。
    """
    rec = facts().at(key) or {}
    got = exotic_perks(key)
    out = {n.lstrip('↑'): k for n, k in got.icons.items()}
    mine, host = set(), key
    if combo(rec):
        mine = {name_of(str(m)) for m in rec.get('members') or ()}
        host = str((rec.get('members') or [''])[0])
        for n, k in exotic_perks(host).icons.items():
            out.setdefault(n.lstrip('↑'), k)
    for col in facts().pool(host):
        kind = ((facts().socket_types.get(str(col['type'])) or {})
                .get('derived') or {}).get('kind')
        if col.get('gear') or kind not in ('intrinsic', 'trait', 'origin'):
            continue
        for h in col.get('plugs') or ():
            n = name_of(str(h))
            if n:
                out.setdefault(n, str(h))
    return {n: k for n, k in out.items() if n and n not in mine}


def perk_item(pk):
    """一条效果落在哪件插件上：`onItems` 里与它同名、又有图的那件，没有就回 None。

    催化剂有两种。一种给的是现成的武器 Perk（墓园双星的「目标锁定」、零号修订的
    「不法之徒」），那条效果同时挂在那枚插件上，图取插件自己的；另一种是这把枪独有的
    效果（故我在的「超凡钢铁」），库里只有催化剂那件东西带图。179 条里前者 103 条。
    同名两件是基础版与强化版，取不带 `sameAs` 的那一件。
    """
    n = name_of(pk)
    got = [str(i) for i in (facts().at(pk) or {}).get('onItems') or ()
           if name_of(str(i)) == n and icon_file(str(i))]
    if not got:
        return None
    return next((h for h in got if not (facts().at(h) or {}).get('sameAs')), got[0])


def exotic_perks(key):
    """「异域 PERK」那一格：`Perks(names, first, icons, picks)`。固有与
    特征的名字，↑催化剂给的效果名。名字按格里的顺序排，主键交给页面索引，不再按
    名字反查。

    **图与主键分两份交出**：催化剂那一条写的是它给的效果（`perk:…`），效果自己没有
    图，图在催化剂那件东西上。合成一份的话，要么丢主键、要么丢图。

    与武器同名的固有框架（朱雀意图之刃那一枚）不列：名字不带信息。护甲的异域 perk
    常与护甲同名（爆炸波行者），照列。没有固有与特征栏的（永劫教派三件）列物品自己
    挂的效果。催化剂的效果没有名字时列催化剂自己的名字。组合点名过的不列，见
    claimed()。空插槽占位（死亡信使那一栏插着「空特征插槽」）不列：它不是一条 Perk，
    库里也没给它图。催化剂那几条的图按 perk_item() 分流。

    `picks` 是一池多选的那几组：一个插槽只插得下一枚，页面上要标出来，否则四枚
    催化剂并排列着，读者会当成四条都生效。组里的名字都在 `names` 里，按格里的顺序。
    """
    rec = facts().at(key) or {}
    frame = None
    if combo(rec):
        plugs = [str(m) for m in rec.get('members', [])[1:]]
        catalysts, options = [], []
    else:
        plugs = [h for h in perk_plugs(rec) if h not in claimed()] or \
            ['perk:%s' % p['perkHash'] for p in rec.get('perks') or ()]
        catalysts = [str(c) for c in (rec.get('derived') or {}).get('catalyst') or ()
                     if live_catalyst(str(c))]
        options = option_plugs(rec)
        arch = (rec.get('derived') or {}).get('archetype')
        if arch and name_of(str(arch)) == zh(rec).get('name'):
            frame = str(arch)
    names, icons, picks, first = {}, {}, [], None
    for h in plugs:
        n = name_of(h)
        pci = ((facts().at(h) or {}).get('plug') or {}).get('plugCategoryIdentifier')
        if not n or h == frame or n in names or pci == EMPTY_SOCKET:
            continue
        names[n] = icons[n] = h
        first = first or h
    for got in options:
        group = []
        for h in got:
            n = name_of(h)
            if n in names:
                continue
            names[n] = icons[n] = h
            group.append(n)
        if len(group) > 1:
            picks.append(group)
    chosen = []
    for c in catalysts:
        got = [('perk:%s' % p['perkHash'], name_of('perk:%s' % p['perkHash']))
               for p in (facts().at(c) or {}).get('perks') or ()]
        for h, n in [x for x in got if x[1]] or [(c, name_of(c))]:
            if '↑' + n in names:
                continue
            names['↑' + n] = h
            icons['↑' + n] = perk_item(h) or c
            chosen.append('↑' + n)
    # 催化槽一池多选的那 11 把（库尔之影四枚魂火、墓园双星四个改装）：装上的只有
    # 一枚。一枚催化剂给几条效果是另一回事（条件终局那枚同时给治疗弹匣与霜华窃取者），
    # 所以按催化剂的枚数判，不按名字条数。
    if len(catalysts) > 1 and len(chosen) > 1:
        picks.append(chosen)
    return Perks(names, first, icons, picks)


# ── 矩阵表 ────────────────────────────────────────────────────────────
_MATRIX = {}


def matrix(page):
    if page not in _MATRIX:
        path = os.path.join(shell.ROOT, 'references', 'pages', page + '.json')
        _MATRIX[page] = None
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                _MATRIX[page] = json.load(f).get('matrix') or []
    return _MATRIX[page]


def matrix_row(page, section, lane, key):
    for sec in matrix(page) or ():
        if sec['节'] in (section, '%s · %s' % (section, lane)) and key in sec['行']:
            return sec, sec['行'][key]
    return None, None


# ── 一张表 ────────────────────────────────────────────────────────────
class Table:
    def __init__(self, page, where, section, head, seen):
        self.page, self.where, self.section = page, where, section
        self.head = head
        self.fields = fields_of(head)
        self.seen = seen            # 这一页里每枚主键已经出现过几次，跨表累计
        self.rank = 0
        self.lane = ''
        self.perks = None           # 本行「异域 PERK」格里的 {名字: 主键}

    def problem(self, title, col, why):
        PROBLEMS.append((self.page, markup.text_of(resolve.bare(title), collapse=True), col, why))

    def block(self, rec, key):
        """这一行的正文从哪一块取：`(那一块, 它在记录上的路径)`。路径给就地编辑标出处。"""
        n = self.seen[key]
        self.seen[key] += 1
        who = AUTHORED.get(self.page)
        if who:
            base = author_block(rec, who)
            at = '%s/%s' % (authors_path(rec), who)
            seq = [(base, at)] + [(v, '%s/variants/%d' % (at, i))
                                  for i, v in enumerate(base.get('variants') or ())]
        else:
            vs = list(enumerate(rec.get('variants') or ()))
            seq = ([(v, 'variants/%d' % i) for i, v in vs if v.get('page') == self.page]
                   + [(zh(rec), 'i18n/zh-CN')]
                   + [(v, 'variants/%d' % i) for i, v in vs if 'page' not in v])
        return seq[n] if n < len(seq) else (None, None)

    def icon_src(self, key, title):
        """这一枚的图相对本页的路径。取不到记一笔、回空串。"""
        got = icon_file(key)
        if not got:
            self.problem(title, '图标', '%s 没有图' % key)
            return ''
        if not os.path.exists(os.path.join(shell.SITE, got)):
            self.problem(title, '图标', '%s 的图不在盘上：%s' % (key, got))
            return ''
        return rel(got, self.where)

    def icon(self, key, title):
        got = self.icon_src(key, title)
        return '{ico|![](%s)}' % got if got else ''

    def lines(self, raw):
        """源稿一行 → [(格子, 主键, {PERK 名: 主键}, 出处)]：本行加它的子行。
        横幅行与子行的主键是 None。出处与格子一一对应，站内写的那几格是
        `(主键, 字段路径, 标签)`，别的格是 None。"""
        text = raw.strip()
        self.perks = None
        if text.startswith('=='):
            self.lane = text.strip('= ').strip()
            return [([text], None, None, None)]
        spec, _, title = text.partition('  ')
        keys = spec.split()
        title = title.strip()
        key = keys[0]
        rec = facts().at(key)
        if rec is None:
            markup.die('%s：主键 %s 落不到记录上（%s）' % (self.page, key, title))
        if rec.get('onSets'):
            # 刷取清单按 2 件与 4 件效果分开评，行首是那条效果；源稿写的名字是效果名
            # （校验位），这一行在页面上叫它所属的那个套装。
            title = zh(facts().sets.get(str(rec['onSets'][0]))).get('name') or title
        sec, pair = matrix_row(self.page, self.section, self.lane, key)
        if sec is not None:
            return [(self.matrix_cells(title, sec, pair), keys, None, None)]
        block, at = self.block(rec, key)
        if block is None:
            self.problem(title, '*', '%s 名下没有第 %d 段' % (key, self.seen[key]))
            block = {}
        self.rank += 1
        out = []
        frames = rec.get('weaponTypes') if self.page == 'weapon-perks' else None
        if not (frames and not block.get('realgame_details')):
            cells, spots = self.cells(key, rec, block, at, title)
            out.append((cells, keys, self.perks, spots))
        for i, e in enumerate(frames or []):
            sub = '%s（%s）' % (zh(rec).get('name'), '、'.join(type_names()[t] for t in e['itemSubType']))
            out.append((self.sub_cells(sub, key, e['realgame_details']), None, None,
                        self.sub_spots((key, 'weaponTypes/%d/realgame_details' % i, sub))))
        for i, e in enumerate(rec.get('enhanced') or []):
            by = [str(b) for b in e['by']]
            sub = '、'.join(name_of(b) for b in by)
            out.append((self.sub_cells(sub, by[0], e['realgame_details']), None, None,
                        self.sub_spots((key, 'enhanced/%d/realgame_details' % i,
                                        '%s · %s' % (zh(rec).get('name'), sub)))))
        return out

    def sub_cells(self, title, icon_key, text):
        cells = [title]
        for f in self.fields[1:]:
            cells.append(self.icon(icon_key, title) if f == 'icon'
                         else text if f == 'realgame_details' else '')
        return cells

    def sub_spots(self, spot):
        """子行的出处：只有说明那一格是站内写的。"""
        return [None] + [spot if f == 'realgame_details' else None for f in self.fields[1:]]

    def cells(self, key, rec, block, at, title):
        cells: list = [title]
        spots: list = [None]
        for col, f in zip(self.head[1:], self.fields[1:]):
            text, field = self.cell(key, rec, block, title, col, f)
            cells.append(text)
            spots.append((key, '%s/%s' % (at, field), '%s · %s' % (
                markup.text_of(resolve.bare(title), collapse=True),
                col.replace(markup.CELL_BREAK, ''))) if field and at else None)
        return cells, spots

    def cell(self, key, rec, block, title, col, f):
        """一格：`(文字, 取自那一块里的哪个字段)`。不是从那一块原样取来的（图标、
        派生、异域拼合）字段回 None，就地编辑不标它。"""
        page = self.page
        if f == 'icon':
            return self.icon(key, title), None
        if page in EXOTIC and f == '异域 PERK':
            names, first = exotic_perks(key)[:2]
            self.perks = names
            if not names:
                self.problem(title, col, '插槽与催化剂里没有叫得出名字的')
                return '', None
            src = self.icon_src(first, title) if first else ''
            return ('{perk|%s}' % markup.CELL_BREAK.join((['![](%s)' % src] if src else [])
                                                         + list(names)), None)
        if page in EXOTIC and f == 'realgame_details':
            got = exotic_text(key, block.get('realgame_details') or '')
            if not got:
                self.problem(title, col, '装备与宿主都没有正文')
            return got, None
        derive = DERIVED.get(col)
        if derive is not None and not block.get(f):
            got = derive(self, key)
            if got is None:
                self.problem(title, col, '派生不出来')
            return got or '', None
        who = AUTHORED.get(self.page)
        if who and not block.get(f):
            # 作者那几格的字段名是英文，列名是中文，对应写在 AUTHOR_FIELDS 一处
            f = AUTHOR_FIELDS.get(who, {}).get(col.replace(markup.CELL_BREAK, ''), f)
        if f not in block:
            # 同一段正文在不同记录上叫法不同：物品记录写 realgame_details，
            # 自发主键（模组族、组合）写「效果」。
            for alias in TEXT_FIELDS:
                if f in TEXT_FIELDS and alias in block:
                    f = alias
                    break
        got = block.get(f) or ''
        # 取不到就记一笔。作者没写的那一格不算——这一页的作者本来就可以留空。
        if f not in block and not who:
            self.problem(title, col, '%s 名下没有「%s」' % (key, f))
        return got, f if isinstance(block.get(f), str) else None

    def matrix_cells(self, title, sec, pair):
        cols = [c['名'] for c in sec['列']]
        if cols == ['左栏', '右栏']:
            right = pair[1]
            return [title, self.icon(pair[0], title),
                    zh(facts().at(pair[0])).get('realgame_details', ''),
                    '{spirit|%s}' % name_of(right), self.icon(right, title),
                    zh(facts().at(right)).get('realgame_details', '')]
        cells = [title]
        for col, target in zip(self.head[1:], pair):
            tok = re.match(r'\{(sk-(\w+))\|', col)
            if not tok:
                markup.die('%s 矩阵表的列头认不出元素：%r' % (self.page, col))
            src = self.icon_src(target, title)
            href = rel('%s/index.html' % where_of(tok.group(2)), self.where)
            cells.append('{%s|%s[%s](%s)}' % (tok.group(1), '![](%s) ' % src if src else '',
                                             name_of(target), href))
        return cells


def _element(t, key):
    got = ELEMENT.get(weapon_of(key).get('defaultDamageType') or 0)
    return '{%s|%s}' % got if got else None


def _frame(t, key):
    arch = (weapon_of(key).get('derived') or {}).get('archetype')
    return name_of(str(arch)) or None if arch else None


def _frame_rate(t, key):
    rec = weapon_of(key)
    frame = _frame(t, key)
    if frame is None:
        return None
    rate = ((facts().at(str(rec['derived']['archetype'])) or {}).get('derived') or {}).get(
        'rate', {}).get(str(rec.get('itemSubType')))
    return '%s%s%s' % (frame, markup.CELL_BREAK, rate) if rate else frame


def _season(t, key):
    got = (weapon_of(key).get('derived') or {}).get('season')
    return '{num|%d}' % got if got else None


def _rank(t, key):
    return '{num|%d}' % t.rank


def _champ(t, key):
    got = (weapon_of(key).get('derived') or {}).get('breakerType')
    if not got:
        return ''
    return '{champ|![](%s)}' % rel(champ_path(got), t.where)


def _stat(stat):
    def derive(t, key):
        got = stat_of(weapon_of(key), stat)
        return None if got is None else '{num|%s}' % got
    return derive


def _cost(t, key):
    rec = facts().at(key) or {}
    if rec.get('members'):
        costs = sorted({(facts().at(str(m)) or {}).get('plug', {}).get('energyCost')
                        for m in rec['members']} - {None})
    else:
        one = (rec.get('plug') or {}).get('energyCost')
        costs = [] if one is None else [one]
    return '{cost|%s}' % '–'.join(map(str, costs)) if costs else None


DERIVED = {
    '属性': _element,
    '框架': _frame,
    '框架\\\\射速': _frame_rate,
    '赛季': _season,
    '排名': _rank,
    '勇士': _champ,
    '弹药生成': _stat(AMMO_GEN),
    '充能效率': _stat(CHARGE_RATE),
    '伤害': _stat(IMPACT),
    '件数': lambda t, key: set_count(key),
    '费用': _cost,
}


def expand(md, page, where):
    """整篇源稿里的表区换成 markdown 表。

    回 (新正文, {行号: 主键}, {行号: {PERK 名: 主键}}, {行号: [每格的出处]})，行号 0 起。
    """
    out, keys_at, perks_at, spots_at = [], {}, {}, {}
    lines = md.split('\n')
    seen = collections.Counter()
    section, i = '', 0
    while i < len(lines):
        line = lines[i]
        if line.startswith('## '):
            section = markup.IMG.sub('', line[3:]).strip()
        if not line.startswith('列：'):
            out.append(line)
            i += 1
            continue
        spec = '| %s |' % line[len('列：'):].strip()
        head = [spec[a:b] for a, b in markup.cells(spec) or ()]
        table = Table(page, where, section, head, seen)
        out.append('| %s |' % ' | '.join(head))
        out.append('|%s|' % '|'.join(['---'] * len(head)))
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith('##'):
            for cells, keys, perks, spots in table.lines(lines[i]):
                if keys:
                    keys_at[len(out)] = keys
                if perks:
                    perks_at[len(out)] = perks
                if spots and any(spots):
                    spots_at[len(out)] = spots
                # 神器模组页那一批正文按真换行分行（那一页不走表格），表格一行一条，
                # 格内换行只能写成 \\。
                out.append('| %s |' % ' | '.join(c.replace('\n', markup.CELL_BREAK)
                                                 for c in cells))
            i += 1
    return '\n'.join(out), keys_at, perks_at, spots_at
