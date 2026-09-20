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
        self.matrix_rows = set()  # 矩阵行首用掉的记录，不再单独占一行

    # ── 取值 ────────────────────────────────────────────────────────
    def zh(self, key):
        return rows.zh(rows.facts().at(key) or {})

    def name(self, key):
        """纯文本的名字，给索引与自检用。"""
        return PUA.sub('', rows.name_of(key) or '').strip()

    def name_html(self, key):
        """页面上显示的名字：自发主键的名字里带着色标记与格内换行
        （「故我在\\（{el-arc|电弧}导体）\\波形」），所以走渲染，不转义。"""
        return self.line(self.name(key))

    def icon(self, key, size=''):
        got = rows.icon_file(key)
        if not got or not os.path.exists(os.path.join(rows.shell.SITE, got)):
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
        if not text:
            return ''
        out = []
        for para in text.split(PARA):
            para = para.strip()
            if para:
                out.append('<p>%s</p>' % '<br>'.join(self.line(x) for x in para.split(BR)))
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
def cell(cls, inner):
    return '<div class="cell %s">%s</div>' % (cls, inner)


def idcell(p, key, subs=(), name_cls='', extra=''):
    """身份格：图标在上，名字与副行在下，上下左右居中。"""
    sub = ''.join('<span>%s</span>' % s for s in subs if s)
    return cell('idc', '%s<div class="nm %s">%s</div>%s%s'
                % (p.icon(key), name_cls, p.name_html(key),
                   '<div class="sub">%s</div>' % sub if sub else '', extra))


def colhead(cls, labels):
    """一节开头那一行列名，由种类生成。每项 (对齐, 文字)：c 居中、l 左对齐。"""
    return '<div class="colhead %s">%s</div>' % (
        cls, ''.join('<div class="%s">%s</div>' % (a, t) for a, t in labels))


# ── 数值、子行、成员 ────────────────────────────────────────────────
def stats_of(p, key):
    rec = rows.facts().at(key) or {}
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
            out.append('<div class="slots">碎片槽 %s</div>'
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
        out.append('<div class="sub-row"><div class="sub-h">装上 %s 之后</div>%s</div>'
                   % (who, p.prose(e['realgame_details'])))
    return ''.join(out)


def by_types(p, key):
    """框架在某几种枪型上的说明，与星相强化同一种画法。"""
    names = rows.type_names()
    out = []
    for w in (rows.facts().at(key) or {}).get('weaponTypes') or ():
        who = '、'.join(names.get(t, str(t)) for t in w['itemSubType'])
        out.append('<div class="sub-row"><div class="sub-h">在 <b>%s</b> 上</div>%s</div>'
                   % (html.escape(who), p.prose(w['realgame_details'])))
    return ''.join(out)


def members(p, key):
    """模组族与组合：成员图标排一行，成员不单独占行。"""
    got = [str(m) for m in (rows.facts().at(key) or {}).get('members') or ()]
    if not got:
        return ''
    return ('<div class="mem">%s</div>'
            % ''.join('<span class="mem-1">%s%s</span>' % (p.icon(m), p.name_html(m))
                      for m in got))


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
        return ''.join('<p class="why"><b class="tag">%s</b>%s</p>'
                       % (p.line(t), '<br>'.join(p.line(x) for x in one.split(BR)))
                       for t, one in zip(paired, paras))
    return ''.join('<p>%s</p>' % '<br>'.join(p.line(x) for x in one.split(BR))
                   for one in paras)


def tags(p, raw):
    got = [t.strip() for t in (raw or '').split(BR) if t.strip()]
    return ('<div class="tags">%s</div>'
            % ''.join('<b class="tag">%s</b>' % p.line(t) for t in got)) if got else ''


def author_rows(p, key, first=None):
    """这条记录上每位作者一行：名字、评级与标签一格，评语一格。本页的作者排第一。"""
    rec = rows.facts().at(key) or {}
    au = p.zh(key).get('site_authors') or rec.get('authors') or {}
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
            badge = '<span class="tier %s">%s</span>' % (cls, html.escape(tier))
        elif tier:
            # 评级写成一整句的（「T0\\输出：T1\\清怪：T1」）装不进徽标，单独一行
            tg = '<div class="tier-long">%s</div>' % p.line(tier) + tg
        if not (badge or tg or body):
            continue
        out.append(cell('mid x-au-who',
                        '<div class="x-au-name"><span class="w-%s">%s</span>%s</div>%s'
                        % (who.lower(), label, badge, tg))
                   + cell('txt x-au-body', body))
    return ''.join(out)


# ── 一条记录 ────────────────────────────────────────────────────────
def rec_plain(p, key, cols, narrow=''):
    """效果、碎片、技能、星相、插件、套装效果：名称 | 说明 (| 数值) (| 来源)。"""
    z = p.zh(key)
    body = (members(p, key)
            + p.prose(z.get('realgame_details') or z.get('效果') or z.get('database_details', ''))
            + enhanced(p, key) + by_types(p, key))
    out = [idcell(p, key), cell('txt', body)]
    if 'st' in cols:
        out.append(cell('mid st', stats_of(p, key)))
    if 'src' in cols:
        out.append(cell('mid st', p.line(z.get('site_source') or z.get('来源') or '')))
    au = author_rows(p, key, 'LGpig')
    return '<article class="rec k-plain c%d%s%s">%s%s</article>' % (
        len(cols), narrow, ' has-au' if au else '', ''.join(out), au)


def rec_exotic(p, key):
    """异域武器与异域护甲：异域 | 异域特性 | 作者区。异域不画来源。"""
    rec = rows.facts().at(key) or {}
    z = p.zh(key)
    names, first = rows.exotic_perks(key)
    perk = ''.join('<span class="xp-n">%s</span>' % html.escape(PUA.sub('', n)) for n in names)
    text = rows.exotic_text(key, z.get('realgame_details', ''))
    season = (rec.get('derived') or {}).get('season')
    au = author_rows(p, key, 'LGpig')
    return ('<article class="rec k-exotic%s">%s%s%s</article>'
            % (' has-au' if au else '',
               idcell(p, key, [z.get('itemTypeDisplayName'),
                               '赛季 %s' % season if season else ''], 'exo'),
               cell('txt perk', '<div class="xp">%s%s</div>%s'
                    % (p.icon(first, 'round') if first else '', perk, p.prose(text))),
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
        return '<div class="plug-none">%s</div>' % html.escape(name)
    path = next((rows.icon_file(h) for h in got if rows.icon_file(h)), None)
    label = '<s>%s</s>' % html.escape(name) if struck else html.escape(name)
    return ('<div class="plug %s">%s<span>%s</span></div>'
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
    z = p.zh(key)
    au_all = z.get('site_authors') or {}
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
        slots.append(cell('mid slot', '<div class="picks">%s</div>' % ''.join(
            plug(p, key, n, mark[n], 'al' if n in la and n in ll else 'a' if n in la else 'l')
            for n in order)))
    mw = (A.get('masterwork') or '').strip()
    mwp = masterwork_plug(key, mw) if mw else None
    slots.append(cell('mid slot', '<div class="picks"><div class="plug mwp">%s<span>%s</span></div></div>'
                      % ('<span class="ico">%s</span>' % p.icon(mwp) if mwp else '',
                         html.escape(p.name(mwp).split('：', 1)[1] if mwp else mw)) if mw else ''))

    au = author_rows(p, key, author)
    return ('<article class="rec k-weapon%s">%s%s%s%s%s</article>'
            % (' has-au' if au else '', cell('mid rank', str(rank)),
               idcell(p, key, (), '', '<div class="x-mini">%s</div>'
                      % ''.join('<div>%s</div>' % m for m in mini)),
               cell('x-facts', '<dl>%s</dl>' % ''.join(
                   '<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts_rows)),
               ''.join(slots), au))


def rec_mod(p, key):
    """护甲模组保留原来的三列卡片：图标、名字、费用一行，说明在下面。"""
    z = p.zh(key)
    cost = (rows.facts().at(key) or {}).get('plug', {}).get('energyCost')
    if cost is None and z.get('费用'):
        cost = markup.text_of(p.line(z['费用']))
    return ('<div class="mod"><div class="mod-h">%s<span class="mod-n">%s</span>%s</div>%s</div>'
            % (p.icon(key), html.escape(p.name(key)),
               '<span class="mod-c"><b>%s</b> 费用</span>' % cost if cost is not None else '',
               members(p, key) + p.prose(z.get('realgame_details') or z.get('效果') or '')))


def stem(path):
    return 'assets/icons/%s.webp' % os.path.splitext(os.path.basename(path))[0]


# ── 职业物品：两栏挂在职业物品记录上 ────────────────────────────────
CLASS_ITEM_TYPES = ('猎人披风', '泰坦印记', '术士臂环')


def spirit(p, key):
    return idcell(p, key, (), 'exo') + cell('txt', p.prose(p.zh(key).get('realgame_details', '')))


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
    blank = cell('idc', '') + cell('txt', '')

    def block(title, left, right):
        body = ''.join('<div class="sp-row">%s%s</div>'
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
        if sec['节'] not in section:
            continue
        head = ''.join('<div class="c">%s%s</div>'
                       % (p.path_icon(c['图'], 'glyph') if c.get('图') else '',
                          html.escape(c['名']))
                       for c in sec['列'])
        body = []
        for rk, cells in sec['行'].items():
            p.matrix_rows.add(rk)
            row = ''.join(cell('mid', '%s<span>%s</span>' % (p.icon(c), p.name_html(c)))
                          for c in cells)
            body.append('<div class="mx-row">%s%s</div>'
                        % (cell('idc', '%s<div class="nm">%s</div>'
                                % (p.icon(rk), p.name_html(rk))), row))
        out.append('<div class="mx"><div class="mx-head"><div class="c">共享技能</div>%s</div>%s</div>'
                   % (head, ''.join(body)))
    return ''.join(out)


# ── 一节 ────────────────────────────────────────────────────────────
HEADS = {
    'k-exotic': [('c', '异域'), ('l', '异域特性')],
    'k-weapon': [('c', '名次'), ('c', '武器'), ('c', '参数'), ('c', '枪管'), ('c', '弹匣'),
                 ('c', 'Perk 1'), ('c', 'Perk 2'), ('c', '起源特性'), ('c', '大师杰作')],
    'k-plain': [('c', '名称'), ('l', '说明')],
}


def section_blocks(p, groups, section='', author='Aegis'):
    """一节的主键 → HTML。groups 是 [(组名 or None, [主键…])]。

    列由这一节里出现的字段定：整节都没有数值的不画数值列，整节都没有来源的不画来源列。
    """
    keys = [k for _, ks in groups for k in ks]
    if not keys:
        return ''
    if p.page == 'armor-mods':
        return '<div class="mods">%s</div>' % ''.join(rec_mod(p, k) for k in keys)
    if all(is_class_item(k) for k in keys):
        return class_items(p, keys)

    out = []
    if rows.matrix(p.page):
        out.append(matrix(p, section))
    kinds = {kind(k) for k in keys}
    fam = ('k-exotic' if kinds == {'exotic'} else 'k-weapon' if kinds == {'weapon'} else 'k-plain')
    cols, narrow = [], ''
    if fam == 'k-plain':
        vals = [markup.text_of(stats_of(p, k)) for k in keys]
        if any(vals):
            cols.append('st')
            # 整节的数值都短（费用 1、碎片槽 ◇◇）时收窄这一轨，不留半列空白
            narrow = ' narrow' if max(len(v) for v in vals) <= 10 else ''
        if any(p.zh(k).get('site_source') or p.zh(k).get('来源') for k in keys):
            cols.append('src')
        heads = HEADS[fam] + [(('c', '数值') if c == 'st' else ('c', '来源')) for c in cols]
        out.append(colhead('k-plain c%d%s' % (len(cols), narrow), heads))
    else:
        out.append(colhead(fam, HEADS[fam]))

    for name, ks in groups:
        if name:
            out.append('<div class="grp">%s</div>' % html.escape(name))
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
