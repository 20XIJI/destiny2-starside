#!/usr/bin/env python3
"""页面索引：生成器渲染时把每一条条目登记下来，落成 data/index/<页>.json。

从前配装页要引资料页上的某一条，靠 tools/vocab.py 用正则回头扫产出的 HTML。那条
链有两处脆：**同名撞车**（2200 个名字里 150 个重名，只能靠槽位限定与分节括注兜），
以及**正则咬死产出结构**（给套装那一格加一个属性就让 id="…" 后面不再紧跟 >，构建
当场中止）。

改成生成器主动写：锚点、分节、说明本来就只有生成器自己知道，让它顺手交出来，
比让别人回头猜便宜也稳。索引以主键为准，名字只是显示用的一个字段。

抽条目要用的那几件（页面 → 着色 token、格子切分、说明取法）也在这里：它们属于
**建**索引，不属于读索引。放在 vocab 里会让生成器 import 自己的下游消费者。

一条条目的字段：

    hash    主键，一族东西可能有几个（词条的普通与强化）
    anchor  这一条在页面上的锚点
    kind    分节名或横幅组名
    name    显示名
    icon    图标路径，相对站根
    sub     副名（套装的来源、变体所属的复合行）
    q       落地时的页内过滤词，空串表示这一条不过滤
    pos     只有神器模组给：'行,档'
    desc    这一条在站内的说明，原样带着着色 span
"""

import json
import os
import re

import shell
from markup import die, text_of

OUT_DIR = os.path.join(shell.ROOT, 'data', 'index')

FIELDS = ('hash', 'anchor', 'kind', 'name', 'icon', 'sub', 'q', 'pos', 'desc')


# 元素页 → 着色 token。六个分支页上的碎片、星相、超能、手雷、近战都归本元素。
ELEM_PAGES = ['elements/%s' % e for e in
              ('arc', 'solar', 'void', 'stasis', 'strand', 'prismatic')]

ELEMENTS = {'arc': 'el-arc', 'solar': 'el-solar', 'void': 'el-void',
            'stasis': 'el-stasis', 'strand': 'el-strand', 'prismatic': 'el-prismatic'}

# 每一页给一个 token；空串表示这一页的名字不着色，身份靠链接与图标表达。
# 传说武器与护甲模组在站内本来就是不着色的行标题，这里不给它们新造颜色。
TOKENS = dict({'elements/%s' % e: t for e, t in ELEMENTS.items()},
              **{'elements/class-abilities': '',
                 'exotic-weapon': 'exotic', 'exotic-armor': 'exotic',
                 'artifact-mods': 'art-perk', 'weapon-perks': 'perk',
                 'armor-mods': '', 'armor-sets': '',
                 'shopping-primary': '', 'shopping-special': '',
                 'shopping-heavy': '', 'shopping-other': ''})

TD = re.compile(r'<td([^>]*)>(.*?)</td>', re.S)
CLS = re.compile(r'class="([^"]+)"')
IMG = re.compile(r'<img[^>]*src="(icons/[^"]+)"')
# 异域职业物品那张表一行摆两条词条：行标题一条，中间一格再一条（源稿写
# `{spirit|噬星者之灵}`，整格只有这一个标记，class 因此落在 <td> 上）。
# 只认行标题会漏掉一半——36 条里只进来 18 条。
SPIRIT = re.compile(r'<td class="spirit">(.*?)</td>\s*<td class="ico">'
                    r'<img[^>]*src="(icons/[^"]+)"', re.S)


# 带页内搜索框的页面：链接落到行上而不是分节上。app.js 见 ?q= 即先过滤再滚，
# 所以锚点给到分节就够，行由 q 挑出来。没有搜索框的页面加了 q 也没人接。
BMARK = re.compile(r' data-b="[^"]*"')


def tds(body):
    """一行里 <th> 之后那些格：(class, 内部 HTML)。"""
    return [(hit.group(1) if (hit := CLS.search(a)) else '', inner)
            for a, inner in TD.findall(body)]


# 说明旁边那一格：冷却与能耗。配装时要算的正是这两样，各自不过十几个字，一并
# 收进来排在说明上方。属性变化那一列没有 class（有值时是裸格），由 panel() 切在
# 说明后面一并收进来；写「—」的占位不收。
# 星相那一列是碎片槽位图，不收：面板里只放读得出来的字。
VALUE_CLS = ('cd', 'cost')

# 购物清单那四页没有说明列——一行是十七格属性（排名、评级、框架、来源、几列
# Perk），首个裸格取到的是评级那个孤零零的「A」。这四页不出说明。
NO_DESC = ('shopping-primary', 'shopping-special', 'shopping-heavy', 'shopping-other')


def panel(cells):
    """(说明 HTML, 数值 HTML)。

    **说明是第一个裸 <td>。**列数在同一页里都不定——起源特性那一节比同页别的分节
    多一个来源列，护甲模组有 3 列与 4 列两种——按列号取必然取错；而碎片那一列
    「属性变化」有值时也是裸格，按「最后一个裸格」取会取到它。第一个裸格恒是说明。
    """
    desc, val = '', []
    for i, (cls, inner) in enumerate(cells):
        if not cls and not desc:
            desc = inner
            continue
        if not desc or (cls and cls not in VALUE_CLS):
            continue
        if text_of(inner, collapse=True) in ('', '—'):
            continue
        val.append(inner)
    return desc, ' '.join(val)


def split_spirit(cells):
    """异域职业物品那张表一行摆两条词条，左半属行标题，右半属 <td class="spirit">
    里那一条。不在这里切开，左边那条会把右边整条说明当成自己的数值格。"""
    for i, (cls, _) in enumerate(cells):
        if cls == 'spirit':
            return cells[:i], cells[i + 1:]
    return cells, []


def wrap(desc, val):
    """表格行的说明是一段带 <br> 的行内 HTML，套一层 <p> 才与神器模组、护甲套装
    那两处的多段 <p> 同形——面板一套样式管两种。数值排在说明上方一行。"""
    if not desc and not val:
        return ''
    return ('<p class="v">%s</p>' % val if val else '') + '<p>%s</p>' % desc


class Index:
    """一页的条目登记处。生成器渲染时 add()，收尾 write()。"""

    def __init__(self, page, token='', searchable=False):
        self.page = page
        self.token = token
        # 这一页有没有页内搜索框。**由生成器按源稿的键明说**：convert-doc 看
        # 「导航／列组／图表」三个键，另两个生成器的工具条写死在自己的 render()
        # 里。从产出 HTML 上数 class="toolbar" 也能得到同样的答案，但那是把
        # 源稿里现成的结构化事实绕道渲染结果再猜回来。
        self.searchable = searchable
        self.rows = []

    def add(self, *, hash='', anchor='', kind='', name='', icon='',
            sub='', q=None, pos='', desc=''):
        # q 缺省跟着 name 走；显式给空串表示这一条不参与页内过滤（分节标题那一类）。
        self.rows.append({'hash': hash, 'anchor': anchor, 'kind': kind,
                          'name': name, 'icon': icon, 'sub': sub,
                          'q': name if q is None else q, 'pos': pos, 'desc': desc})

    def write(self):
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, self.page.replace('/', '__') + '.json')
        body = ',\n'.join(
            '  ' + json.dumps({k: r[k] for k in FIELDS if r[k]},
                              ensure_ascii=False, sort_keys=True)
            for r in self.rows)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('{\n "page": %s,\n "token": %s,\n "searchable": %s,'
                    '\n "entries": [\n%s\n ]\n}\n'
                    % (json.dumps(self.page), json.dumps(self.token),
                       json.dumps(bool(self.searchable)), body))
        return path, len(self.rows)


def must_read(page):
    """读一页的索引，没有就中止。索引由生成器写出，缺了说明那一页还没生成，
    静默回空会让下游拿着半份词表继续跑。"""
    got = read(page)
    if got is None:
        die('%s 还没有索引：先跑对应的资料生成器' % page)
    return got


def read(page):
    path = os.path.join(OUT_DIR, page.replace('/', '__') + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        got = json.load(f)
    for row in got['entries']:
        for key in FIELDS:
            row.setdefault(key, '')
    return got
