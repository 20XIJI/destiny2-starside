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
  `authors.<作者>`。字段名按 research.fields_of()：首列 name、「图标」icon、「说明」
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
import research
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


def facts():
    global _FACTS
    if _FACTS is None:
        _FACTS = resolve.shared()[0]
    return _FACTS


def is_skeleton(md):
    return re.search(r'^列：', md, re.M) is not None


def zh(rec):
    return ((rec or {}).get('i18n') or {}).get(ZH) or {}


def name_of(key):
    return zh(facts().at(key)).get('name') or ''


def combo(rec):
    return (rec or {}).get('kind') == '组合'


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
        plugs = perk_plugs(rec, pools=True) + [str(c) for c in (rec.get('derived') or {}).get('catalyst') or ()]
    out = []
    for h in plugs:
        for one in [h] + ['perk:%s' % p['perkHash'] for p in (facts().at(h) or {}).get('perks') or ()]:
            if one not in out:
                out.append(one)
    return out


def users():
    """异域两页每一枚宿主被几行够得着。只被一行够得着的，它的正文才属于那一行。

    同一枚效果常挂在好几件东西上（「治疗弹匣」既是朱雀意图之刃的催化剂，也是武器
    PERK 页的一行），那段文字是别处写的，合进这一行等于把别页的正文抄过来。
    组合行点名的成员归组合，不算进装备那一行。
    """
    global _USERS
    if _USERS is None:
        _USERS = collections.Counter()
        claimed = set()
        for page in EXOTIC:
            for head in research.heads(page):
                rec = facts().at(head) or {}
                if combo(rec):
                    claimed.update(reach(head))
                    continue
                for h in reach(head):
                    _USERS[h] += 1
        for h in claimed:
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
            for head in research.heads(page):
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


def exotic_text(key, own):
    """装备本体的第一段，接着各宿主的正文，再接本体其余段落。"""
    paras = [p.strip() for p in own.split(PARA) if p.strip()]
    hosts = []
    for h in own_hosts(key):
        t = zh(facts().at(h)).get('realgame_details', '').strip()
        if t and t not in hosts:
            hosts.append(t)
    return (' %s ' % PARA).join(paras[:1] + hosts + paras[1:])


def authors_of(rec):
    """一条记录上的作者块 `{作者: 那一段}`。站内字段随语言走，落在
    `i18n.zh-CN.site_authors`；效果表那 29 条作者评语在根上的 `authors`。
    取法只有这一处，页面、词表与回归共用。"""
    return zh(rec).get('site_authors') or rec.get('authors') or {}


def author_block(rec, who):
    return authors_of(rec).get(who) or {}


def exotic_perks(key):
    """「异域 PERK」那一格：({名字: 主键}, 取图的那一枚)。第一枚的图，固有与特征的
    名字，↑催化剂给的效果名。名字按格里的顺序排，主键交给页面索引，不再按名字反查。

    与武器同名的固有框架（朱雀意图之刃那一枚）不列：名字不带信息。护甲的异域 perk
    常与护甲同名（爆炸波行者），照列。没有固有与特征栏的（永劫教派三件）列物品自己
    挂的效果。催化剂的效果没有名字时列催化剂自己的名字。
    """
    rec = facts().at(key) or {}
    frame = None
    if combo(rec):
        plugs = [str(m) for m in rec.get('members', [])[1:]]
        catalysts = []
    else:
        plugs = perk_plugs(rec) or ['perk:%s' % p['perkHash'] for p in rec.get('perks') or ()]
        catalysts = [str(c) for c in (rec.get('derived') or {}).get('catalyst') or ()]
        arch = (rec.get('derived') or {}).get('archetype')
        if arch and name_of(str(arch)) == zh(rec).get('name'):
            frame = str(arch)
    names, first = {}, None
    for h in plugs:
        n = name_of(h)
        if not n or h == frame or n in names:
            continue
        names[n] = h
        first = first or h
    for c in catalysts:
        got = [('perk:%s' % p['perkHash'], name_of('perk:%s' % p['perkHash']))
               for p in (facts().at(c) or {}).get('perks') or ()]
        for h, n in [x for x in got if x[1]] or [(c, name_of(c))]:
            names.setdefault('↑' + n, h)
    return names, first


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
        self.fields = research.fields_of(head)
        self.seen = seen            # 这一页里每枚主键已经出现过几次，跨表累计
        self.rank = 0
        self.lane = ''
        self.perks = None           # 本行「异域 PERK」格里的 {名字: 主键}

    def problem(self, title, col, why):
        PROBLEMS.append((self.page, markup.text_of(resolve.bare(title), collapse=True), col, why))

    def block(self, rec, key):
        """这一行的正文从哪一块取。"""
        n = self.seen[key]
        self.seen[key] += 1
        who = AUTHORED.get(self.page)
        if who:
            base = author_block(rec, who)
            seq = [base] + list(base.get('variants') or ())
        else:
            vs = rec.get('variants') or ()
            seq = ([v for v in vs if v.get('page') == self.page] + [zh(rec)]
                   + [v for v in vs if 'page' not in v])
        return seq[n] if n < len(seq) else None

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
        """源稿一行 → [(格子, 主键, {PERK 名: 主键})]：本行加它的子行。
        横幅行与子行的主键是 None。"""
        text = raw.strip()
        self.perks = None
        if text.startswith('=='):
            self.lane = text.strip('= ').strip()
            return [([text], None, None)]
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
            return [(self.matrix_cells(title, sec, pair), keys, None)]
        block = self.block(rec, key)
        if block is None:
            self.problem(title, '*', '%s 名下没有第 %d 段' % (key, self.seen[key]))
            block = {}
        self.rank += 1
        out = []
        frames = rec.get('weaponTypes') if self.page == 'weapon-perks' else None
        if not (frames and not block.get('realgame_details')):
            out.append((self.cells(key, rec, block, title), keys, self.perks))
        for e in frames or ():
            sub = '%s（%s）' % (zh(rec).get('name'), '、'.join(type_names()[t] for t in e['itemSubType']))
            out.append((self.sub_cells(sub, key, e['realgame_details']), None, None))
        for e in rec.get('enhanced') or ():
            by = [str(b) for b in e['by']]
            sub = '、'.join(name_of(b) for b in by)
            out.append((self.sub_cells(sub, by[0], e['realgame_details']), None, None))
        return out

    def sub_cells(self, title, icon_key, text):
        cells = [title]
        for f in self.fields[1:]:
            cells.append(self.icon(icon_key, title) if f == 'icon'
                         else text if f == 'realgame_details' else '')
        return cells

    def cells(self, key, rec, block, title):
        cells = [title]
        for col, f in zip(self.head[1:], self.fields[1:]):
            cells.append(self.cell(key, rec, block, title, col, f))
        return cells

    def cell(self, key, rec, block, title, col, f):
        page = self.page
        if f == 'icon':
            return self.icon(key, title)
        if page in EXOTIC and f == '异域 PERK':
            names, first = exotic_perks(key)
            self.perks = names
            if not names:
                self.problem(title, col, '插槽与催化剂里没有叫得出名字的')
                return ''
            src = self.icon_src(first, title) if first else ''
            return '{perk|%s}' % markup.CELL_BREAK.join((['![](%s)' % src] if src else []) + list(names))
        if page in EXOTIC and f == 'realgame_details':
            got = exotic_text(key, block.get('realgame_details') or '')
            if not got:
                self.problem(title, col, '装备与宿主都没有正文')
            return got
        derive = DERIVED.get(col)
        if derive is not None and not block.get(f):
            got = derive(self, key)
            if got is None:
                self.problem(title, col, '派生不出来')
            return got or ''
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
        return got

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
            href = rel('%s/index.html' % research.where_of(tok.group(2)), self.where)
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

    回 (新正文, {行号: 主键}, {行号: {PERK 名: 主键}})，行号 0 起。
    """
    out, keys_at, perks_at = [], {}, {}
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
            for cells, keys, perks in table.lines(lines[i]):
                if keys:
                    keys_at[len(out)] = keys
                if perks:
                    perks_at[len(out)] = perks
                # 神器模组页那一批正文按真换行分行（那一页不走表格），表格一行一条，
                # 格内换行只能写成 \\。
                out.append('| %s |' % ' | '.join(c.replace('\n', markup.CELL_BREAK)
                                                 for c in cells))
            i += 1
    return '\n'.join(out), keys_at, perks_at
