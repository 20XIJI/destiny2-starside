#!/usr/bin/env python3
"""记录 → 版式：一种记录一套网格，同种记录全站一份定义。

资料页的源稿只写主键、顺序与分节；一行画成什么由**记录自己的字段**判定，不由源稿的
列头决定。判定在 `kind()` 一处，版式在 `RECORD` 那几个函数里，页面不参与。

列由种类给：轨道始终在，保证同一种记录跨页、跨节对齐；某条记录没有这个字段，那一格
空着；**整节都没有的轨道整节不画**（棱镜的「效果」一节没有数值列）。

图标不在这里落 `<img>`：调用方把 `markup.Icons` 的 `html()` 传进来，首屏优先级与
文件名复核仍由它一处管。文本一律走 `markup.inline(rich=True)`。
"""

import html
import os
import re

import icons as icons_mod
import markup
import rows
from markup import CELL_BREAK as BR

PARA = rows.PARA

# 勇士名在参数列里缩成两个字：库里是反屏障／反过载／反势不可挡
BREAKER_SHORT = {1: '屏障', 2: '过载', 3: '势不'}

# Bungie 名字里的私用区字形（U+E000–F8FF）站点字体没有字形，会渲染成豆腐块
PUA = re.compile('[\ue000-\uf8ff]')

ABILITY_PLUGS = ('grenades', 'melee', 'class_abilities', 'supers')

AUTHORS = (('Aegis', 'Aegis', 'aegis_tier', 'by-a'),
           ('LGpig', '小棒猪', 'lgpig_tier', 'by-l'))

# 作者自己的字段：源表的英文表头在页面上写中文
AU_LABEL = {'dps': 'DPS', 'total_damage': '总伤', 'swap_dps': '切换 DPS', 'notes': '备注'}

# 这些键不是「作者写的一格」：推荐词条各有自己的栏，评级与评语另画
AU_SKIP = ('role', 'name', 'realgame_details', 'barrel', 'magazine', 'perk1', 'perk2',
           'origin', 'masterwork')

IMG = re.compile(r'!\[\]\(([^)]+)\)')


class Page:
    """一页的渲染上下文：图标登记、相对路径、页面索引。"""

    def __init__(self, page, where, img, dex=None):
        self.page = page          # 页面 slug
        self.where = where        # 产出相对站点根的目录
        self.img = img            # markup.Icons().html
        self.dex = dex            # pagedex 的索引，可以是 None
        self.section = ''
        self.titles = {}          # 主键 → 源稿写的行标题
        self.matrix_rows = set()  # 矩阵行首用掉的记录，不再单独占一行

    # ── 取值 ────────────────────────────────────────────────────────
    def zh(self, key):
        return rows.zh(rows.facts().at(key) or {})

    def name(self, key):
        """纯文本的名字，给索引与自检用。行标题是站内写法（「鲁莽神谕\\众神殿版本」
        这种带版本后缀的），源稿写了就以它为准；没写才用记录名。

        套装效果那一行在站内叫它所属的套装（源稿写的是效果名，当校验位），
        与表格链的 rows.lines() 同一条。"""
        rec = rows.facts().at(key) or {}
        if rec.get('onSets'):
            got = rows.zh(rows.facts().sets.get(str(rec['onSets'][0])) or {}).get('name')
            if got:
                return got
        got = self.titles.get(key)
        if got:
            return markup.text_of(self.line(got), collapse=True)
        return markup.spaced(PUA.sub('', rows.name_of(key) or '').strip())

    def title_html(self, key):
        if (rows.facts().at(key) or {}).get('onSets'):
            return self.line(self.name(key))      # 套装效果显示套装名
        got = self.titles.get(key)
        return self.line(got) if got else self.name_html(key)

    def name_html(self, key):
        """页面上显示的名字：名字里可能带着色标记与格内换行
        （「故我在\\（{el-arc|电弧}导体）\\波形」），所以走渲染，不转义。"""
        return self.line(markup.spaced(PUA.sub('', rows.name_of(key) or '').strip()))

    def icon(self, key, size=''):
        got = rows.icon_file(key)
        if not got or not os.path.exists(os.path.join(rows.shell.SITE, got)):
            # 不静默回空串：没图的格子在页面上看不出是漏了，交给 rows.PROBLEMS
            # 汇总，生成器当场中止（与表格链的 icon_src 同一条）。
            rows.PROBLEMS.append((self.page, self.name(key), '图标',
                                  '%s 没有图' % key))
            return ''
        return self.img(rows.rel(got, self.where), size)

    def path_icon(self, path, size=''):
        if not path or not os.path.exists(os.path.join(rows.shell.SITE, path)):
            return ''
        return self.img(rows.rel(path, self.where), size)

    # ── 文本 ────────────────────────────────────────────────────────
    def line(self, md):
        """一行源稿方言 → HTML。格内换行有时落在着色标记里面，所以渲染完再换。"""
        if not md:
            return ''
        md = IMG.sub(lambda m: '\x00%s\x00' % m.group(1), md)
        out = markup.inline(md.strip(), rich=True)
        # 记录里写的图路径相对站点根（elements/solar/icons/x.webp）
        out = re.sub('\x00([^\x00]+)\x00',
                     lambda m: self.path_icon(m.group(1), 'inl'), out)
        return out.replace(BR, '<br>')

    def prose(self, text):
        """正文 → 段落。三种分段都认：格内换行两次（源稿方言）、空行（记录里
        直接写的真换行）、以及 `- ` 列表。

        **只在着色标记之外切**：一条说明常把几行包在同一个 `{el-kinetic|…}` 里，
        从中间切开两半都是未闭合的标记，渲染当场中止。
        """
        if not text:
            return ''
        out = []
        for para in top_split(text.replace(PARA, '\n\n'), '\n\n'):
            lines = [x.strip() for x in top_split(para.replace(BR, '\n'), '\n') if x.strip()]
            if not lines:
                continue
            if all(x.startswith('- ') for x in lines):
                out.append('<ul>%s</ul>'
                           % ''.join('<li>%s</li>' % self.line(x[2:]) for x in lines))
            else:
                out.append('<p>%s</p>' % '<br>'.join(self.line(x) for x in lines))
        return ''.join(out)


# ── 种类：判据全在记录自己的字段上 ──────────────────────────────────
def kind(key):
    rec = rows.facts().at(key) or {}
    if key.startswith('trait:') or rec.get('kind') == '机制':
        return 'trait'
    if rec.get('kind') in ('模组族', '组合'):
        return 'family'
    if key.startswith('stat:'):
        return 'stat'
    if key.startswith('perk:'):
        return 'setperk' if rec.get('onSets') else 'trait'
    if rec.get('itemType') in (2, 3):
        if (rec.get('inventory') or {}).get('tierType') == 6:
            return 'exotic'
        return 'armor' if rec['itemType'] == 2 else 'weapon'
    tail = (rec.get('plug') or {}).get('plugCategoryIdentifier', '').rsplit('.', 1)[-1]
    if tail in ('fragments', 'trinkets'):
        return 'fragment'
    if tail in ('aspects', 'totems'):
        return 'aspect'
    if tail in ABILITY_PLUGS:
        return 'ability'
    return 'plug'


ELEM_OF_PCI = {'arc': 'el-arc', 'solar': 'el-solar', 'void': 'el-void',
               'stasis': 'el-stasis', 'strand': 'el-strand', 'shared': 'el-prismatic'}


def elem_token(key):
    pci = ((rows.facts().at(key) or {}).get('plug') or {}).get('plugCategoryIdentifier', '')
    parts = pci.split('.')
    return ELEM_OF_PCI.get(parts[1] if len(parts) > 2 else parts[0], '')


# ── 格子 ────────────────────────────────────────────────────────────
def top_split(text, sep):
    """按 sep 切，但只切在着色标记之外。标记里面的换行属于那一段文字。"""
    out, depth, start, i = [], 0, 0, 0
    while i < len(text):
        open_at = markup.OPEN_MARK.match(text, i)
        if open_at:
            depth += 1
            i = open_at.end()
            continue
        if text[i] == '}' and depth:
            depth -= 1
        elif depth == 0 and text.startswith(sep, i):
            out.append(text[start:i])
            i += len(sep)
            start = i
            continue
        i += 1
    out.append(text[start:])
    return out


def cell(cls, inner):
    return '<div class="r-cell %s">%s</div>' % (cls, inner)


def idcell(p, key, subs=(), name_cls='', extra=''):
    """身份格：图标在上，名字与副行在下，上下左右居中。"""
    sub = ''.join('<span>%s</span>' % s for s in subs if s)
    return cell('r-id', '%s<div class="r-nm %s">%s</div>%s%s'
                % (p.icon(key), name_cls, p.title_html(key),
                   '<div class="r-sub">%s</div>' % sub if sub else '', extra))


def colhead(cls, labels):
    """一节开头那一行列名，由种类生成。每项 (对齐, 文字)：c 居中、l 左对齐。"""
    return '<div class="r-head %s">%s</div>' % (
        cls, ''.join('<div class="%s">%s</div>' % (a, t) for a, t in labels))


# ── 数值、子行、成员 ────────────────────────────────────────────────
def stats_of(p, key):
    """数值格。武器 PERK 那几类（词条、模组、框架、起源）不画：它们的数值
    说明里已经写了一遍。"""
    rec = rows.facts().at(key) or {}
    if kind(key) == 'plug':
        return ''
    out = []
    cost = (rec.get('plug') or {}).get('energyCost')
    if cost is None and p.zh(key).get('费用'):
        out.append('<div>费用 %s</div>' % p.line(p.zh(key)['费用']))
    elif cost is not None:
        out.append('<div>%s <b class="cost">%s</b></div>'
                   % ('碎片消耗' if kind(key) == 'fragment' else '费用', cost))
    if rec.get('onSets'):
        got = rows.set_count(key)
        if got:
            out.append('<div><b>%s</b></div>' % got)
    if rec.get('site_superTier'):
        out.append('<div><b>T%s</b> 级超能</div>' % rec['site_superTier'])
    if rec.get('site_cooldownSeconds') is not None:
        pvp = rec.get('site_cooldownSecondsPvp')
        out.append('<div>基础冷却 <b>%s</b>%s 秒</div>'
                   % (rec['site_cooldownSeconds'],
                      ' <span class="pvp">[%s]</span>' % pvp if pvp is not None else ''))
    if rec.get('site_recoveryMultiplier') is not None:
        out.append('<div>回复倍率 <b>%s×</b></div>' % rec['site_recoveryMultiplier'])
    for s in rec.get('investmentStats') or ():
        name = rows.zh(rows.facts().stats.get(str(s['statTypeHash'])) or {}).get('name', '')
        if name == '星相能量容量':
            out.append('<div class="r-slots">碎片槽 %s</div>'
                       % ''.join('<i></i>' for _ in range(s['value'])))
        elif name and '消耗' not in name and s['value']:
            out.append('<div>%s <b>%+d</b></div>' % (html.escape(name), s['value']))
    return ''.join(out)


def enhanced(p, key):
    """星相带来的强化：子行紧跟本行之后。"""
    out = []
    for e in (rows.facts().at(key) or {}).get('enhanced') or ():
        who = ''.join('%s<span class="%s">%s</span>'
                      % (p.icon(str(b)), elem_token(str(b)), p.name_html(str(b)))
                      for b in e['by'])
        # data-name 是这一行在站内的叫法，搜索索引与页面索引按它收条目
        out.append('<div class="r-sub-row" data-name="%s">'
                   '<div class="r-sub-h">装上 %s 之后</div>%s</div>'
                   % (html.escape('%s（%s）' % (p.name(key),
                                               '、'.join(p.name(str(b)) for b in e['by']))),
                      who, p.prose(e['realgame_details'])))
    return ''.join(out)


def by_types(p, key):
    """框架在某几种枪型上的说明，与星相强化同一种画法。"""
    names = rows.type_names()
    out = []
    for w in (rows.facts().at(key) or {}).get('weaponTypes') or ():
        who = '、'.join(names.get(t, str(t)) for t in w['itemSubType'])
        out.append('<div class="r-sub-row" data-name="%s">'
                   '<div class="r-sub-h">在 <b>%s</b> 上</div>%s</div>'
                   % (html.escape('%s（%s）' % (p.name(key), who)),
                      html.escape(who), p.prose(w['realgame_details'])))
    return ''.join(out)


def members(p, key, skip=0):
    """模组族与组合：成员图标排一行，成员不单独占行。

    `skip` 跳过前几位：组合画成子行时，第一位成员就是它挂着的那一行，再画一遍
    等于让读者在「故我在」底下又看见一次「故我在」。
    """
    got = [str(m) for m in (rows.facts().at(key) or {}).get('members') or ()][skip:]
    if not got:
        return ''
    return ('<div class="mem">%s</div>'
            % ''.join('<span class="mem-1">%s%s</span>' % (p.icon(m), p.name_html(m))
                      for m in got))


def member_text(p, key):
    """组合行的正文：各成员的实测挨着画。「故我在（电弧元素）」那一行讲的就是电弧
    导体与风暴使者这两条固有。

    跳过三类成员：第一位（装备本身，正文在它自己那一行）、本页已经单独占一行的
    （虚空页的手持超新星点名了四枚手雷，那四枚各有各的行，抄过来就是同一段话在一页
    里出现两次）、以及正文与已画过的逐字相同的。

    **只画在 BODY 那几页**：刷取清单那一行写的是评级与理由，正文归资料页；同一段话
    出现在两页上，读者无从判断哪一份是新的。
    """
    rec = rows.facts().at(key) or {}
    if not rows.combo(rec) or p.page not in rows.BODY:
        return ''
    own = set(rows.heads(p.page))
    out, seen = [], set()
    for m in (rec.get('members') or ())[1:]:
        got = rows.zh(rows.facts().at(str(m))).get('realgame_details', '').strip()
        if got and str(m) not in own and got not in seen:
            seen.add(got)
            out.append(p.prose(got))
    return ''.join(out)


def combos(p, key):
    """组合子行：源稿没列的组合画在第一位成员那一行底下，见 rows.subs_of()。

    标题是记录上的 `site_when`（「当装上」「当{el-arc|电弧}元素」）接这一套的成员，
    与星相强化子行同一种画法；底下是成员各自的实测。**成员只画在标题上**：再画一行
    图标，「当装上 冲击核心」底下就又是一枚冲击核心。
    """
    out = []
    for k in rows.subs_of(p.page, key):
        z = p.zh(k)
        if not z.get('site_when'):
            markup.die('组合 %s 画成子行却没写 site_when' % k)
        mem = [str(m) for m in (rows.facts().at(k) or {}).get('members') or ()][1:]
        out.append('<div class="r-sub-row" data-name="%s"><div class="r-sub-h">%s%s</div>'
                   '%s%s</div>'
                   % (html.escape(p.name(k)), p.line(z['site_when']),
                      ''.join('%s<b>%s</b>' % (p.icon(m), p.name_html(m)) for m in mem),
                      p.prose(z.get('realgame_details', '')), member_text(p, k)))
    return ''.join(out)


# ── 作者区：一位作者两格，加作者只多一行 ────────────────────────────
def author_fields(p, a):
    got = [(k, v) for k, v in sorted(a.items())
           if v and not k.startswith(('explanation_', 'aegis_', 'lgpig_')) and k not in AU_SKIP]
    return ('<div class="f-row">%s</div>' % ''.join(
        '<span class="f-k">%s</span><b class="f-v">%s</b>'
        % (html.escape(str(AU_LABEL.get(k) or k)),
           p.line(str(v)).replace('<br>', '、').replace('、/', ' / '))
        for k, v in got)) if got else ''


def author_paras(p, a, who, paired=()):
    """理由一二三。带定位标签且条数相等时，一条标签配一条理由。"""
    paras = [a[k] for k in sorted(a) if k.startswith('explanation_') and str(a[k]).strip()]
    if who == 'LGpig' and a.get('lgpig_tier_explanation'):
        paras.insert(0, a['lgpig_tier_explanation'])
    if paired and len(paired) == len(paras):
        # 正文包进一件 <b>：.why 是两栏 flex，不包的话正文里每个着色 span
        # 各自成了一个 flex item，一个词挤成一竖列。
        return ''.join('<p class="why"><b class="r-tag">%s</b><b class="why-t">%s</b></p>'
                       % (p.line(t), '<br>'.join(p.line(x) for x in one.split(BR)))
                       for t, one in zip(paired, paras))
    return ''.join('<p>%s</p>' % '<br>'.join(p.line(x) for x in one.split(BR))
                   for one in paras)


def tags(p, raw):
    got = [t.strip() for t in (raw or '').split(BR) if t.strip()]
    return ('<div class="r-tags">%s</div>'
            % ''.join('<b class="r-tag">%s</b>' % p.line(t) for t in got)) if got else ''


def author_rows(p, key, first=None):
    """这条记录上每位作者一行：名字、评级与标签一格，评语一格。本页的作者排第一。"""
    rec = rows.facts().at(key) or {}
    au = rows.authors_of(rec)
    out = []
    for who, label, tier_key, cls in sorted(AUTHORS, key=lambda x: x[0] != first):
        a = au.get(who)
        if not a:
            continue
        tier = a.get(tier_key)
        role = [x.strip() for x in (a.get('role') or '').split(BR) if x.strip()]
        body = author_fields(p, a) + author_paras(p, a, who, role)
        badge, tg = '', '' if 'class="why"' in body else tags(p, a.get('role'))
        if tier and len(tier) <= 4:
            badge = '<span class="r-tier %s">%s</span>' % (cls, html.escape(tier))
        elif tier:
            # 评级写成一整句的（「T0\\输出：T1\\清怪：T1」）装不进徽标，单独一行
            tg = '<div class="r-tier-long">%s</div>' % p.line(tier) + tg
        if not (badge or tg or body):
            continue
        out.append(cell('r-mid x-au-who',
                        '<div class="x-au-name"><span class="w-%s">%s</span>%s</div>%s'
                        % (who.lower(), label, badge, tg))
                   + cell('r-txt x-au-body', body))
    return ''.join(out)


# ── 一条记录 ────────────────────────────────────────────────────────
def panel_of(p, key):
    """这一条在配装填表页悬停面板里显示什么：数值一行在上，正文在下。

    与页面上画的是同一份取法，所以两处不会说不同的话。
    """
    z = p.zh(key)
    body = p.prose(z.get('realgame_details') or z.get('效果') or z.get('database_details', ''))
    val = markup.text_of(stats_of(p, key), collapse=True)
    return ('<p class="v">%s</p>' % val if val else '') + body


def rec_plain(p, key, cols, narrow=''):
    """效果、碎片、技能、星相、插件、套装效果：名称 | 说明 (| 数值) (| 来源)。"""
    z = p.zh(key)
    body = (members(p, key)
            + p.prose(z.get('realgame_details') or z.get('效果') or z.get('database_details', ''))
            + member_text(p, key) + enhanced(p, key) + by_types(p, key)
            + combos(p, key))
    out = [idcell(p, key), cell('r-txt', body)]
    if 'st' in cols:
        out.append(cell('r-mid r-val', stats_of(p, key)))
    if 'src' in cols:
        out.append(cell('r-mid r-val', p.line(z.get('site_source') or z.get('来源') or '')))
    au = author_rows(p, key, 'LGpig')
    return '<article class="rec r-plain r-c%d%s%s">%s%s</article>' % (
        len(cols), narrow, ' has-au' if au else '', ''.join(out), au)


def perk_chips(p, got):
    """「异域特性」那一格：一名一图，一池多选的几枚收进一个框并标出几选一。

    图与名字分两份取：催化剂那几条的名字是它给的效果，图在催化剂或它给的那枚 Perk
    上（见 rows.perk_item）。不标几选一的话，英勇利刃那四枚催化剂并排列着，读者会
    当成四条都生效。
    """
    def one(n):
        return ('<span class="xp-1">%s<span class="xp-n">%s</span></span>'
                % (p.icon(got.icons[n]), html.escape(PUA.sub('', n))))

    picked = {n for group in got.picks for n in group}
    rows_ = [''.join(one(n) for n in got.names if n not in picked)]
    # 一组一行：选项组与固定那几枚挤在同一行时，读者分不清方框收到哪一枚为止
    rows_ += ['<span class="xp-pick"><b class="xp-of">%d 选 1</b>%s</span>'
              % (len(group), ''.join(one(n) for n in group)) for group in got.picks]
    return ''.join('<div class="xp">%s</div>' % r for r in rows_ if r)


def rec_exotic(p, key):
    """异域武器与异域护甲：异域 | 异域特性 | 作者区。异域不画来源。"""
    rec = rows.facts().at(key) or {}
    z = p.zh(key)
    perk = perk_chips(p, rows.exotic_perks(key))
    text = rows.exotic_text(key, z.get('realgame_details', ''))
    season = (rec.get('derived') or {}).get('season')
    au = author_rows(p, key, 'LGpig')
    return ('<article class="rec r-exotic%s">%s%s%s</article>'
            % (' has-au' if au else '',
               idcell(p, key, [z.get('itemTypeDisplayName'),
                               '赛季 %s' % season if season else ''], 'exo'),
               cell('r-txt r-perk', '%s%s%s' % (perk, p.prose(text), combos(p, key))),
               au))


SLOTS = (('枪管', 'barrel'), ('弹匣', 'magazine'), ('Perk 1', 'perk1'),
         ('Perk 2', 'perk2'), ('起源特性', 'origin'))


def picks(raw):
    out = []
    for part in (raw or '').split(BR):
        struck = '~~' in part
        name = markup.text_of(markup.inline(part.replace('~~', ''))).strip()
        if name:
            out.append((name, struck))
    return out


def plug(p, key, name, struck, by):
    got = rows.resolve.perk_key(rows.facts(), [key], name)
    if got is None:                       # 槽位说明词（「无」），不是插件
        return '<div class="r-plug-none">%s</div>' % html.escape(name)
    path = next((rows.icon_file(h) for h in got if rows.icon_file(h)), None)
    label = '<s>%s</s>' % html.escape(name) if struck else html.escape(name)
    return ('<div class="r-plug %s">%s<span>%s</span></div>'
            % ({'a': 'by-a', 'l': 'by-l', 'al': 'by-al'}[by],
               '<span class="ico">%s</span>' % p.path_icon(path) if path else '', label))


def masterwork_plug(key, stat):
    """作者写的属性名 → 这把枪大师杰作栏里满级那一枚，与装备库同一种取法。"""
    rec = rows.facts().items.get(key) or {}
    best = None
    for en in (rec.get('sockets') or {}).get('socketEntries') or ():
        ps = en.get('reusablePlugSetHash') or en.get('randomizedPlugSetHash')
        for x in (rows.facts().plug_sets.get(str(ps)) or {}).get('reusablePlugItems') or ():
            h = str(x['plugItemHash'])
            n = rows.name_of(h) or ''
            if not n.startswith('大师杰作：') or not n.split('：', 1)[1].startswith(stat):
                continue
            cond = [s for s in (rows.facts().items.get(h) or {}).get('investmentStats') or ()
                    if s.get('isConditionallyActive')]
            if all(s['value'] == 0 for s in cond):
                return h
            best = best or h
    return best


def rec_weapon(p, key, rank, author):
    """购物清单与排行：名次 | 武器 | 参数 | 五栏推荐 | 大师杰作，作者区在下面。"""
    rec = rows.facts().at(key) or {}
    au_all = rows.authors_of(rec)
    A, L = au_all.get('Aegis') or {}, au_all.get('LGpig') or {}
    d = rec.get('derived') or {}
    arch = d.get('archetype')
    frame = p.name(str(arch)) if arch else ''
    rate = ((rows.facts().at(str(arch)) or {}).get('derived') or {}).get(
        'rate', {}).get(str(rec.get('itemSubType'))) if arch else None
    el = rows.ELEMENT.get(rec.get('defaultDamageType') or 0)
    ammo = rows.stat_of(rec, rows.AMMO_GEN)

    mini = []
    if el:
        mini.append(p.path_icon(stem(icons_mod.ELEM[rec['defaultDamageType']]), 'glyph')
                    + '<span class="%s">%s</span>' % el)
    if rate:
        mini.append('射速 <b>%s</b>' % rate)
    if ammo is not None:
        mini.append('弹药生成 <b>%s</b>' % ammo)
    if d.get('season'):
        mini.append('赛季 <b>%s</b>' % d['season'])

    facts_rows = []
    if frame:
        short = frame
        for tail in ('框架', '热量武器'):      # 这一列每行都有的后缀，不写
            if short.endswith(tail) and len(short) > len(tail):
                short = short[:-len(tail)]
        facts_rows.append(('框架', p.icon(str(arch), 'glyph') + html.escape(short)))
    if d.get('breakerType'):
        facts_rows.append(('勇士', p.path_icon(rows.champ_path(d['breakerType']), 'glyph')
                           + BREAKER_SHORT[d['breakerType']]))
    src = A.get('aegis_source') or L.get('lgpig_source')
    if src:
        facts_rows.append(('来源', p.line(src)))

    slots = []
    for _, field in SLOTS:
        a, l_ = picks(A.get(field)), picks(L.get(field))
        mark = dict(l_)
        mark.update(dict(a))
        order = [n for n, _ in a] + [n for n, _ in l_ if n not in dict(a)]
        la, ll = {n for n, _ in a}, {n for n, _ in l_}
        slots.append(cell('r-mid r-slot', '<div class="r-picks">%s</div>' % ''.join(
            plug(p, key, n, mark[n], 'al' if n in la and n in ll else 'a' if n in la else 'l')
            for n in order)))
    # 大师杰作一格可以写几枚：「填装\\操控性」说的是这两枚都行，不是一枚叫这个名字
    # 的插件。与别的几栏同形，一枚一个格子。
    mws = [x.strip() for x in (A.get('masterwork') or '').split(BR) if x.strip()]
    slots.append(cell('r-mid r-slot', ('<div class="r-picks">%s</div>' % ''.join(
        '<div class="r-plug r-mwp">%s<span>%s</span></div>'
        % ('<span class="ico">%s</span>' % p.icon(mwp) if mwp else '',
           html.escape(p.name(mwp).split('：', 1)[1] if mwp else mw))
        for mw, mwp in ((x, masterwork_plug(key, x)) for x in mws))) if mws else ''))

    au = author_rows(p, key, author)
    return ('<article class="rec r-weapon%s">%s%s%s%s%s</article>'
            % (' has-au' if au else '', cell('r-mid r-rank', str(rank)),
               idcell(p, key, (), '', '<div class="x-mini">%s</div>'
                      % ''.join('<div>%s</div>' % m for m in mini)),
               cell('x-facts', '<dl>%s</dl>' % ''.join(
                   '<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts_rows)),
               ''.join(slots), au))


def stem(path):
    return 'assets/icons/%s.webp' % os.path.splitext(os.path.basename(path))[0]


# ── 职业物品：两栏挂在职业物品记录上 ────────────────────────────────
CLASS_ITEM_TYPES = ('猎人披风', '泰坦印记', '术士臂环')


def spirit(p, key):
    return idcell(p, key, (), 'exo') + cell('r-txt', p.prose(p.zh(key).get('realgame_details', '')))


def class_items(p, keys):
    """三件职业物品：两栏各自排列、按行对齐；三件共有的合成一组画在最前。

    两栏各有哪些之灵 Bungie 的 manifest 里查不到（两栏的插槽类型允许的插件类别相同，
    只记了初始插件），所以写在职业物品记录自己的 site_perkColumns 上。
    """
    cols = {}
    for k in keys:
        got = (rows.facts().at(k) or {}).get('site_perkColumns')
        if not got:
            markup.die('%s 没有 site_perkColumns，两栏画不出来' % k)
        cols[k] = ([str(x) for x in got[0]], [str(x) for x in got[1]])
    shared = [set.intersection(*[set(cols[k][i]) for k in keys]) for i in (0, 1)]
    blank = cell('r-id', '') + cell('r-txt', '')

    def block(title, left, right):
        body = ''.join('<article class="sp-row rec">%s%s</article>'
                       % (spirit(p, left[i]) if i < len(left) else blank,
                          spirit(p, right[i]) if i < len(right) else blank)
                       for i in range(max(len(left), len(right))))
        return ('<div class="ci-grp"><h3 class="ci-h">%s</h3>'
                '<div class="sp-head"><h4>第一栏</h4><h4>第二栏</h4></div>%s</div>'
                % (title, body))

    out = [block('%s<span class="dim">三件职业物品都能开出</span>'
                 % ''.join(p.icon(k) for k in keys),
                 [h for h in cols[keys[0]][0] if h in shared[0]],
                 [h for h in cols[keys[0]][1] if h in shared[1]])]
    for k in keys:
        out.append(block('%s<span class="exo">%s</span><span class="dim">%s</span>'
                         % (p.icon(k), p.name_html(k),
                            html.escape(p.zh(k).get('itemTypeDisplayName', ''))),
                         [h for h in cols[k][0] if h not in shared[0]],
                         [h for h in cols[k][1] if h not in shared[1]]))
    return ''.join(out)


def is_class_item(key):
    return (kind(key) == 'exotic'
            and rows.zh(rows.facts().at(key) or {}).get('itemTypeDisplayName')
            in CLASS_ITEM_TYPES)


# ── 矩阵：棱镜引用了哪几个分支的哪几个技能 ──────────────────────────
def matrix(p, section):
    """行是技能位，列是五个分支。行首用掉的那几条记录不再单独占一行。"""
    got = rows.matrix(p.page)
    out = []
    for sec in got or ():
        # 与 rows.matrix_row 同一条：按相等比。包含比会让「猎人与泰坦」这种
        # 分节名同时画出两张矩阵。
        if sec['节'] != section:
            continue
        head = ''.join('<div class="c">%s%s</div>'
                       % (p.path_icon(c['图'], 'glyph') if c.get('图') else '',
                          html.escape(c['名']))
                       for c in sec['列'])
        body = []
        for rk, cells in sec['行'].items():
            p.matrix_rows.add(rk)
            row = ''.join(cell('r-mid', '%s<span>%s</span>' % (p.icon(c), p.name_html(c)))
                          for c in cells)
            body.append('<div class="mx-row rec">%s%s</div>'
                        % (cell('r-id', '%s<div class="r-nm">%s</div>'
                                % (p.icon(rk), p.name_html(rk))), row))
        out.append('<div class="mx"><div class="mx-head"><div class="c">共享技能</div>%s</div>%s</div>'
                   % (head, ''.join(body)))
    return ''.join(out)


# ── 一节 ────────────────────────────────────────────────────────────
HEADS = {
    'r-exotic': [('c', '异域'), ('l', '异域特性')],
    'r-weapon': [('c', '名次'), ('c', '武器'), ('c', '参数'), ('c', '枪管'), ('c', '弹匣'),
                 ('c', 'Perk 1'), ('c', 'Perk 2'), ('c', '起源特性'), ('c', '大师杰作')],
    'r-plain': [('c', '名称'), ('l', '说明')],
}


def section_blocks(p, groups, section='', author='Aegis'):
    """一节的主键 → HTML。groups 是 [(组名 or None, [主键…])]，行标题在 p.titles 里。

    列由这一节里出现的字段定：整节都没有数值的不画数值列，整节都没有来源的不画来源列。
    """
    keys = [k for _, ks in groups for k in ks]
    if not keys:
        return ''
    if all(is_class_item(k) for k in keys):
        return class_items(p, keys)

    out = []
    if rows.matrix(p.page):
        out.append(matrix(p, section))
    kinds = {kind(k) for k in keys}
    # 一节里以哪种记录为主就用哪种列名：异域排行页每节混着一两条插件，
    # 按「全等于异域」判会给 136 行异域配上「名称｜说明」那套列名。
    main_kind = max(kinds, key=lambda k: sum(1 for x in keys if kind(x) == k))
    fam = ('r-exotic' if main_kind == 'exotic' else 'r-weapon' if main_kind == 'weapon'
           else 'r-plain')
    cols, narrow = [], ''
    if fam == 'r-plain':
        vals = [markup.text_of(stats_of(p, k)) for k in keys]
        if any(vals):
            cols.append('st')
            # 整节的数值都短（费用 1、碎片槽 ◇◇）时收窄这一轨，不留半列空白
            narrow = ' r-narrow' if max(len(v) for v in vals) <= 10 else ''
        if any(p.zh(k).get('site_source') or p.zh(k).get('来源') for k in keys):
            cols.append('src')
        heads = HEADS[fam] + [(('c', '数值') if c == 'st' else ('c', '来源')) for c in cols]
        out.append(colhead('r-plain r-c%d%s' % (len(cols), narrow), heads))
    else:
        out.append(colhead(fam, HEADS[fam]))

    for name, ks in groups:
        if name:
            out.append('<div class="r-grp">%s</div>' % html.escape(name))
        for i, k in enumerate(ks, 1):
            if k in p.matrix_rows:          # 矩阵行首那一条不再单独占一行
                continue
            kd = kind(k)
            if kd == 'exotic':
                out.append(rec_exotic(p, k))
            elif kd == 'weapon':
                out.append(rec_weapon(p, k, i, author))
            else:
                out.append(rec_plain(p, k, cols, narrow))
    return ''.join(out)
