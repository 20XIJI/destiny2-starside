#!/usr/bin/env python3
"""装备库（武器与异域护甲）：实体层 → weapons/ 下的三份载荷与页壳。

    weapons/index.js   window.WPN       首屏要下：卡片墙、筛选、结果栏要的一切
    weapons/pool.js    window.WPN_POOL  词条池、属性曲线、大师杰作与模组：详情与 perk:/stat: 查询要
    weapons/text.js    window.WPN_TEXT  描述、说明、站内实测、作者评语：详情与 perktext: 查询要
    weapons/index.html 外壳 + 空容器 + 类型小图标 sprite，内容全由 weapons/app.js 画

只读实体层（resolve.Facts），不写任何数据。插件在载荷里存 hash 不存下标：地址栏里的
配置因此跨构建有效。三份载荷的字段表写在 .claude/rules/weapons.md。

用法：python3 tools/build-weapons.py
"""

import argparse
import collections
import gzip
import json
import os
import re
import sys

import check_terms
import icons
import items
import markup
import resolve
import rows
import shell

TYPE_ICONS = os.path.join(shell.ROOT, 'tools', 'type-icons.json')

# 槽位取物品自己的 bucketTypeHash，站内叫主手／副手／威能。
SLOT = {1498876634: '主手', 2465295065: '副手', 953998645: '威能'}
AMMO = {1: ('主武器', 'ammo-primary'), 2: ('特殊', 'ammo-special'), 3: ('威能', 'ammo-heavy')}
# itemSubType → type-icons.json 里那枚小图标（justrealmilk/destiny-icons，CC0）。
GLYPH = {6: 'auto_rifle', 7: 'shotgun', 8: 'machinegun', 9: 'hand_cannon',
         10: 'rocket_launcher', 11: 'fusion_rifle', 12: 'sniper_rifle', 13: 'pulse_rifle',
         14: 'scout_rifle', 17: 'sidearm', 18: 'sword_heavy', 22: 'wire_rifle',
         23: 'grenade_launcher', 24: 'smg', 25: 'trace_rifle', 31: 'bow', 33: 'glaive'}
RARITY = {6: '异域', 5: '传说', 4: '稀有', 3: '罕见', 2: '普通'}
CLASS = {0: '泰坦', 1: '猎人', 2: '术士'}
PART = {26: '头盔', 27: '臂铠', 28: '胸甲', 29: '腿甲', 30: '职业物品'}

# 可升阶（T1–T5）的枪：带阶级外观、阶级击杀特效或阶级升级插槽的那些。与
# destiny.report 的 isTiered 逐把比过，751 把里对上 749，差的两把是「最终恐惧」
# 及其专家版（manifest 上没有这三种插槽）。derived.tierable 还算进了锻造等级插槽，
# 是另一件事，这里不用它。
TIER_KINDS = frozenset({'weapon_tiering_kill_vfx', 'weapon_tiering_tier5_skins',
                        'weapon_tiering.plugs.mods.enhancers'})

# 词条栏的栏名，按插槽类型白名单首项认。特征栏写「Perk 1／Perk 2」，起源栏用站内
# 的「起源特性」，其余取 Bungie 给这类插件的类型名。认不出的类型当场中止，不猜。
LABEL = {'barrels': '枪管', 'magazines': '弹匣', 'magazines_gl': '弹匣',
         'origins': '起源特性', 'scopes': '瞄准镜', 'tubes': '发射器枪管',
         'batteries': '电池', 'stocks': '枪托', 'blades': '刀片', 'guards': '刀剑格',
         'bowstrings': '弓弦', 'arrows': '箭矢', 'hafts': '把手', 'grips': '握把',
         'rails': '导轨', 'bolts': '弩弹', 'v950.new.sword0.blades': '柄芯',
         'v950.new.sword0.guards': '握把'}
TRAIT = 'frames'
# 异域的催化剂那一栏在池里只挂着一个空壳，催化剂本身取 derived.catalyst。
CATALYST_KIND = 'v400.empty.exotic.masterwork'

# 属性表里不上页面的两项：投资值恒为 0 的「攻击」「能量」。
SKIP_STAT = frozenset({'攻击', '能量'})
# 站内写法。Bungie 叫「每分钟发射数」，读者叫射速。
STAT_LABEL = {'每分钟发射数': '射速'}

# 大师杰作：冲击只给剑（类目 54），弓不给充能时间（类目 3317538576）。
# 这两条照 destiny.report。
IMPACT, CHARGE = 4043523819, 2961396640
SWORD_CAT, BOW_CAT = 54, 3317538576

# 作者推荐写在哪几栏上：Aegis 五栏，LGpig 两栏（刷取清单只给特征栏）。
MARK_COLS = {'Aegis': ('barrel', 'magazine', 'perk1', 'perk2', 'origin'),
             'LGpig': ('perk1', 'perk2')}
MARK_BIT = {'Aegis': 1, 'LGpig': 2}
# 作者写的词条名落不到这把枪自己池里的次数。只许降不许升：多出来一条就是有人
# 写了库里查不到的名字，要么改源稿，要么进 resolve.PERK_ALIAS。
MARK_MISS_BASELINE = 12

# 两位作者的评级折成同一把尺：Aegis S…F，LGpig T0、T0.5、T1…；一格写了几段的
# 取最好那段。没有评级的沉到最后。
LETTER = {'S': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6}
UNRATED = 99

TOKEN = re.compile(r'\{[\w-]+\|([^{}]*)\}')
ADEPT_TAIL = re.compile(r'（[^（）]*）$')


def plain(s):
    """源稿方言剥成纯文字：{token|文字} 只留文字。"""
    s = s or ''
    while TOKEN.search(s):
        s = TOKEN.sub(r'\1', s)
    return s.replace('~~', '')


def parts(s):
    """一格里用格内换行隔开的几段。"""
    return [x.strip() for x in plain(s).split(markup.CELL_BREAK) if x.strip()]


def stem(path):
    """官方图路径 → 站内图标文件名去掉扩展名。盘上没有就中止：先跑 icons.py --pull。"""
    if not path:
        return ''
    name = icons.file_of(path)
    if not os.path.exists(os.path.join(icons.OUT_DIR, name)):
        markup.die('缺图标 %s（%s），先跑 python3 tools/icons.py --pull' % (name, path))
    return name[:-len('.webp')]


class Build:
    """一次构建的全部中间量。按实体层算，不读任何页面产出。"""

    def __init__(self, facts):
        self.f = facts
        self.banned = check_terms.banned_pairs()
        self.plugs = {}           # 插件 hash → 字典条目
        self.plug_text = {}       # 插件 hash → Bungie 说明
        self.plug_site = {}       # 插件 hash → 站内实测（HTML）
        self.stats = {}           # 属性 hash → [名字, 纯数值, 越低越好]
        self.groups = {}          # 属性组 hash → 曲线表
        self.mark_miss = []
        self.orphans = []

    # ── 通用 ────────────────────────────────────────────────────────
    def text(self, rec, field='name', lang=resolve.ZH):
        return resolve.text(rec, field, lang) or ''

    def say(self, body):
        """Bungie 的说明按站内正名改写：专名与链接不动。"""
        body, _ = items.rename(body, self.banned, check_terms.protected_spans(body))
        return body

    def site_html(self, t):
        """站内正文（源稿方言）→ HTML：格内换行两次分段，一次换行。"""
        paras = [p.strip() for p in t.split(rows.PARA) if p.strip()]
        return ''.join('<p>%s</p>' % markup.inline(
            '<br>'.join(x.strip() for x in p.split(markup.CELL_BREAK) if x.strip()), rich=True)
            for p in paras)

    def kind(self, entry):
        st = self.f.socket_types.get(str(entry.get('socketTypeHash'))) or {}
        return (st.get('derived') or {}).get('kind')

    def whitelist(self, entry):
        st = self.f.socket_types.get(str(entry.get('socketTypeHash'))) or {}
        return {x['categoryIdentifier'] for x in st.get('plugWhitelist') or ()}

    # ── 插件字典 ────────────────────────────────────────────────────
    def plug(self, h):
        """插件进字典：[名字, 图标, 类型名, 属性, 条件属性]。属性按 manifest 原样
        列（含 0 值的条件项：大师杰作靠它们认出 T 级加在哪几项上）。"""
        h = str(h)
        if h in self.plugs:
            return h
        r = self.f.items[h]
        st = [[x['statTypeHash'], x['value']] for x in r.get('investmentStats') or ()
              if not x.get('isConditionallyActive')]
        cd = [[x['statTypeHash'], x['value']] for x in r.get('investmentStats') or ()
              if x.get('isConditionallyActive')]
        self.plugs[h] = [self.text(r), stem(r.get('icon')), self.text(r, 'itemTypeDisplayName'),
                         st, cd]
        desc = self.text(r, 'database_details')
        if desc:
            self.plug_text[h] = self.say(desc)
        # 站内实测只写在同物组的行首上（sameAs 指向它），强化版自己没有。
        head = self.f.items.get(str(r['sameAs'])) if r.get('sameAs') else r
        site = self.text(head, 'realgame_details')
        if site:
            self.plug_site[h] = self.site_html(site)
        return h

    # ── 词条栏 ──────────────────────────────────────────────────────
    def base_name(self, h):
        r = self.f.items[str(h)]
        return self.f.name(r['sameAs']) if r.get('sameAs') else self.f.name(h)

    def is_enh(self, h, tiers):
        r = self.f.items[str(h)]
        return self.text(r, 'itemTypeDisplayName').startswith('强化') or \
            (r['inventory']['tierType'] == 3 and 2 in tiers)

    def cells(self, plugs, where):
        """一栏的插件按「同物」并成格：[基础版, 强化版或 0]。有强化版的格在页面上
        只画强化版。同名同物的几枚基础版（丢弃型弹匣那种）取第一枚。"""
        groups = collections.OrderedDict()
        for p in dict.fromkeys(plugs):
            groups.setdefault(self.base_name(p), []).append(p)
        out = []
        for name, ps in groups.items():
            tiers = {self.f.items[str(p)]['inventory']['tierType'] for p in ps}
            base = [p for p in ps if not self.is_enh(p, tiers)]
            enh = [p for p in ps if self.is_enh(p, tiers)]
            if enh and not base:
                self.orphans.append('%s：%s' % (where, name))
            head = (base or enh)[0]
            out.append([int(self.plug(head)), int(self.plug(enh[0])) if enh and base else 0])
        return out

    def columns(self, h):
        """词条栏：[[栏名, 角色, 格…], …]。固有与装备栏不在这里。"""
        cols, trait = [], 0
        for col in self.f.pool(h):
            if col.get('gear') or col['kind'] == CATALYST_KIND:
                continue
            role = ((self.f.socket_types.get(str(col['type'])) or {}).get('derived') or {}).get('kind')
            if role == 'intrinsic':
                continue
            if col['kind'] == TRAIT:
                trait += 1
                label = 'Perk %d' % trait
                role = 'trait'
            else:
                label = LABEL.get(col['kind'])
                if not label:
                    markup.die('%s 有一栏认不出：%s，补进 build-weapons.LABEL' % (h, col['kind']))
                role = 'origin' if role == 'origin' else 'stat'
            plugs = list(col.get('plugs') or ()) or ([col['init']] if col.get('init') else [])
            cells = self.cells(plugs, h)
            if cells:
                cols.append([label, role, cells])
        return cols

    def gear(self, h):
        """(大师杰作那一栏的全部插件, 可选模组的格)。"""
        rec = self.f.items[h]
        mw = []
        for en in rec['sockets']['socketEntries']:
            if self.kind(en) == 'masterwork':
                ps = en.get('reusablePlugSetHash') or en.get('randomizedPlugSetHash')
                mw = [x['plugItemHash'] for x in
                      (self.f.plug_sets.get(str(ps)) or {}).get('reusablePlugItems') or ()]
                break
        # 模组不走强化配对：「强化稳定性」是一枚独立的模组，不是谁的强化版。
        # 同名的几枚（平衡枪托出现两次）取第一枚。
        mods = {}
        for col in self.f.pool(h):
            if col.get('gear') and not col['kind'].startswith(resolve.MASTERWORK_KIND):
                for p in col.get('plugs') or ():
                    mods.setdefault(self.f.name(p), int(self.plug(p)))
        return mw, list(mods.values())

    def tiered(self, rec):
        return any(TIER_KINDS & self.whitelist(en) for en in rec['sockets']['socketEntries'])

    def masterwork(self, h, have):
        """大师杰作的选项：[[属性名, 属性 hash, 满级那枚, 专家那枚或 0, [等级…]], …]。

        同一属性在池里有三种：条件项全为 0 的那枚（可升阶的枪用它，T 级加在它列出
        的每一项上）、条件项 +3 的那枚（专家版满级时其余 +3）、1–9 阶各一枚。1–9 阶
        那几枚只给选中属性加它自己的数，所以只记数不记插件；数按插件自己的数值认，
        不按名字：「5阶：冲击」实际是 +4。"""
        rec = self.f.items[h]
        cats = set(rec.get('itemCategoryHashes') or ())
        mw, _ = self.gear(h)
        opts = collections.OrderedDict()
        for p in mw:
            name = self.f.name(p)
            if '：' not in name:
                continue
            r = self.f.items[str(p)]
            st = r.get('investmentStats') or []
            main = [x for x in st if not x.get('isConditionallyActive') and x['value']]
            if not main:
                continue
            sh = main[0]['statTypeHash']
            if (sh == IMPACT and SWORD_CAT not in cats) or (sh == CHARGE and BOW_CAT in cats):
                continue
            if str(sh) not in have:
                continue
            o = opts.setdefault(name.split('：', 1)[1], [name.split('：', 1)[1], sh, 0, 0, []])
            cond = [x for x in st if x.get('isConditionallyActive')]
            if name.startswith('大师杰作'):
                if cond and all(x['value'] == 0 for x in cond):
                    o[2] = int(self.plug(p))
                else:
                    o[3] = int(self.plug(p))
            elif main[0]['value'] not in o[4]:
                o[4].append(main[0]['value'])
        for o in opts.values():
            if not o[2]:
                o[2], o[3] = o[3], 0
            o[4].sort()
        return list(opts.values())

    def marks(self, h, authors, cols, opts):
        """每一格的作者推荐位（1 = Aegis，2 = LGpig），外加 Aegis 推荐的大师杰作。"""
        bits = collections.Counter()
        for who, keys in MARK_COLS.items():
            block = authors.get(who) or {}
            for k in keys:
                for name in parts(block.get(k)):
                    got = resolve.perk_key(self.f, [h], name)
                    if got is None:
                        continue
                    if not got:
                        self.mark_miss.append('%s %s %s：%s' % (h, who, k, name))
                        continue
                    for p in got:
                        bits[str(p)] |= MARK_BIT[who]
        for col in cols:
            for cell in col[2]:
                # 推荐写的是词条名，格里的基础版与强化版算同一格。
                got = 0
                for p in cell[:2]:
                    if p:
                        got |= bits[str(p)]
                cell.append(got)
        rec_mw = plain((authors.get('Aegis') or {}).get('masterwork') or '').strip()
        return next((o[0] for o in opts if rec_mw and o[0].startswith(rec_mw)), '')

    # ── 属性 ────────────────────────────────────────────────────────
    def stat_group(self, gh):
        """属性组 → [[属性 hash, 上限, 曲线（平铺成 x,y,x,y…）, 纯数值], …]，按显示顺序。"""
        gh = str(gh)
        if gh not in self.groups:
            got = []
            for s in (self.f.groups[gh].get('scaledStats') or ()):
                st = self.f.stats.get(str(s['statHash']))
                name = self.text(st) if st else ''
                if not name or name in SKIP_STAT:
                    continue
                self.stats[str(s['statHash'])] = [
                    STAT_LABEL.get(name, name), 1 if s['displayAsNumeric'] else 0,
                    1 if (st.get('derived') or {}).get('lowerIsBetter') else 0]
                curve = [v for p in s['displayInterpolation'] for v in (p['value'], p['weight'])]
                got.append([s['statHash'], s['maximumValue'], curve, 1 if s['displayAsNumeric'] else 0])
            self.groups[gh] = got
        return self.groups[gh]


def grades(authors):
    out = []
    a = (authors.get('Aegis') or {}).get('aegis_tier')
    if a and plain(a).strip():
        out.append(plain(a).strip())
    else:
        out.append('')
    lg = (authors.get('LGpig') or {}).get('lgpig_tier')
    out.append(' '.join(parts(lg)).replace('：', '') if lg else '')
    return out if any(out) else 0


def rank_of(authors):
    best = UNRATED
    a = plain((authors.get('Aegis') or {}).get('aegis_tier') or '').strip()
    if a[:1] in LETTER:
        best = min(best, LETTER[a[:1]])
    for m in re.finditer(r'T(\d+(?:\.\d+)?)', plain((authors.get('LGpig') or {}).get('lgpig_tier') or '')):
        best = min(best, float(m.group(1)))
    return best


def source_of(b, h, authors):
    """来源：Aegis 写的 > LGpig 写的 > manifest 收藏条目那一句。"""
    for who, k in (('Aegis', 'aegis_source'), ('LGpig', 'lgpig_source')):
        got = plain((authors.get(who) or {}).get(k) or '').strip()
        if got:
            return got
    got = plain(b.f.source(h) or '')
    return got[3:] if got.startswith('来源：') else ''


def author_blocks(b, authors):
    """作者评语：[[作者, 评级, [段落 HTML…]], …]。"""
    out = []
    a = authors.get('Aegis')
    if a:
        texts = [a.get('explanation_1')]
        out.append(['Aegis', plain(a.get('aegis_tier') or '').strip(), texts])
    lg = authors.get('LGpig')
    if lg:
        texts = [lg.get(k) for k in ('lgpig_tier_explanation', 'notes', 'explanation_1',
                                     'explanation_2', 'explanation_3')]
        grade = ' '.join(parts(lg.get('lgpig_tier') or lg.get('role') or '')).replace('：', '')
        out.append(['LGpig', grade, texts])
    for block in out:
        block[2] = [markup.inline(t.replace(markup.CELL_BREAK, '<br>'), rich=True)
                    for t in block[2] if t and t.strip()]
    return [x for x in out if x[1] or x[2]]


def exotic_block(b, h):
    """异域的站内详情：[[名字, 图标]…] 与正文 HTML。与异域武器、异域护甲两页那一格
    是同一份正文，取法只在 rows.py 一处。"""
    rec = b.f.items[h]
    names, _ = rows.exotic_perks(h)
    chips = []
    for n, k in names.items():
        r = b.f.at(k) or {}
        chips.append([n, stem(r.get('icon')) if r.get('icon') and not k.startswith('perk:') else ''])
    text = rows.exotic_text(h, rec['i18n'][resolve.ZH].get('realgame_details', ''))
    return [chips, b.site_html(text)] if text else [chips, '']


def build(facts):
    """{相对路径: 文本}。纯函数：测试与 main() 共用。"""
    b = Build(facts)
    F = facts
    glyphs = json.load(open(TYPE_ICONS, encoding='utf-8'))

    # ── 武器 ────────────────────────────────────────────────────────
    weapons = {h: r for h, r in F.items.items() if r.get('itemType') == 3}
    info = {}
    for h, r in weapons.items():
        zh = r['i18n'][resolve.ZH]
        name = zh['name']
        adept = bool(r.get('isAdept'))
        d = r.get('derived') or {}
        cols = b.columns(h)
        info[h] = {'name': name, 'stripped': ADEPT_TAIL.sub('', name) if adept else name,
                   'season': d.get('season') or 0, 'adept': adept, 'holo': bool(r.get('isHolofoil')),
                   'cols': cols, 'authors': zh.get('site_authors') or {},
                   'cells': sum(len(c[2]) for c in cols)}

    groups = collections.defaultdict(list)
    for h, x in info.items():
        groups[(x['stripped'], x['season'])].append(h)
    rep_of = {}
    reps = []
    for members in groups.values():
        plain_m = [h for h in members if not info[h]['adept'] and not info[h]['holo']] or members
        rep = max(plain_m, key=lambda h: (info[h]['cells'], bool(weapons[h].get('collectibleHash')),
                                          weapons[h]['index']))
        merged = {}
        for h in members:
            for k, v in info[h]['authors'].items():
                merged.setdefault(k, v)
        info[rep]['group_authors'] = merged
        for h in members:
            rep_of[h] = rep
        reps.append(rep)
    reps.sort(key=lambda h: (rank_of(info[h]['group_authors']), -len(info[h]['group_authors']),
                             weapons[h]['itemSubType'], -info[h]['season'], info[h]['name']))
    others = sorted((h for h in weapons if rep_of[h] != h),
                    key=lambda h: (reps.index(rep_of[h]), info[h]['adept'], info[h]['holo']))
    order = reps + others
    row_of = {h: i for i, h in enumerate(order)}

    fams = collections.defaultdict(list)
    for h in order:
        fams[info[h]['stripped']].append(h)
    fam_list, fam_of = [], {}
    for name, members in fams.items():
        members.sort(key=lambda h: (-info[h]['season'], info[h]['adept'], info[h]['holo'],
                                    -weapons[h]['index']))
        for h in members:
            fam_of[h] = len(fam_list)
        fam_list.append([row_of[h] for h in members])

    frames, frame_idx = [], {}
    sources, source_idx = [], {}
    wrows, wpool, wtext_fl, wauthors, xs, cats_text = [], {}, {}, {}, {}, {}
    elements = set()
    for h in order:
        r = weapons[h]
        x = info[h]
        d = r.get('derived') or {}
        fr_h = str(d['archetype'])
        if fr_h not in frame_idx:
            fr = F.items[fr_h]
            frame_idx[fr_h] = len(frames)
            frames.append([b.text(fr), stem(fr.get('icon')), (fr.get('derived') or {}).get('rate') or {},
                           int(b.plug(fr_h))])
        authors = x.get('group_authors') or x['authors']
        src = source_of(b, h, authors)
        if src and src not in source_idx:
            source_idx[src] = len(sources)
            sources.append(src)
        b.stat_group(r['stats']['statGroupHash'])
        have = {str(s[0]) for s in b.groups[str(r['stats']['statGroupHash'])]}
        opts = b.masterwork(h, have)
        rec_mw = b.marks(h, authors, x['cols'], opts)
        _, mods = b.gear(h)
        tiered = b.tiered(r)
        enhanceable = any(c[1] for col in x['cols'] for c in col[2])
        seasons = {info[m]['season'] for m in fams[x['stripped']]}
        flags = (1 * x['adept'] | 2 * x['holo'] | 4 * bool(d.get('craftable')) | 8 * tiered
                 | 16 * bool(opts) | 32 * enhanceable | 64 * (len(seasons) > 1))
        elements.add(r['defaultDamageType'])
        wrows.append([
            h, x['name'], r['itemSubType'], r['defaultDamageType'], r['equippingBlock']['ammoType'],
            list(SLOT).index(r['inventory']['bucketTypeHash']), d.get('breakerType') or 0,
            x['season'], r['inventory']['tierType'], flags, stem(r.get('icon')),
            stem(r.get('iconWatermark')), frame_idx[fr_h], source_idx.get(src, -1),
            grades(authors) if rep_of[h] == h else 0, row_of[rep_of[h]], fam_of[h],
            resolve.text(r, lang='en') or ''])
        base = collections.Counter()
        present = []
        for s in r.get('investmentStats') or ():
            if s['statTypeHash'] not in present:
                present.append(s['statTypeHash'])
            if not s.get('isConditionallyActive'):
                base[s['statTypeHash']] += s['value']
        catalysts = [int(b.plug(c)) for c in d.get('catalyst') or ()]
        for c in d.get('catalyst') or ():
            effs = [F.perks[str(p['perkHash'])] for p in F.items[str(c)].get('perks') or ()
                    if (F.perks.get(str(p['perkHash'])) or {}).get('isDisplayable')]
            cats_text[str(c)] = [[b.text(e), b.say(b.text(e, 'database_details'))] for e in effs]
        wpool[h] = [str(r['stats']['statGroupHash']), [[k, base[k]] for k in present],
                    x['cols'], [1 if tiered else 0, rec_mw, opts], [int(m) for m in mods], catalysts]
        flavor = b.text(r, 'flavorText')
        if flavor:
            wtext_fl[h] = flavor
        if rep_of[h] == h:
            blocks = author_blocks(b, authors)
            if blocks:
                wauthors[h] = blocks
        if r['inventory']['tierType'] == 6:
            xs[h] = exotic_block(b, h)

    # ── 异域护甲 ────────────────────────────────────────────────────
    armor = {h: r for h, r in F.items.items() if r.get('itemType') == 2}
    agroups = collections.defaultdict(list)
    for h, r in armor.items():
        agroups[(r['i18n'][resolve.ZH]['name'], (r.get('derived') or {}).get('season') or 0)].append(h)
    arep_of, areps, aauth = {}, [], {}
    for members in agroups.values():
        rep = max(members, key=lambda h: (bool(armor[h].get('collectibleHash')), armor[h]['index']))
        merged = {}
        for h in members:
            for k, v in (armor[h]['i18n'][resolve.ZH].get('site_authors') or {}).items():
                merged.setdefault(k, v)
        aauth[rep] = merged
        for h in members:
            arep_of[h] = rep
        areps.append(rep)
    areps.sort(key=lambda h: (armor[h]['classType'], list(PART).index(armor[h]['itemSubType']),
                              -((armor[h].get('derived') or {}).get('season') or 0),
                              armor[h]['i18n'][resolve.ZH]['name']))
    aorder = areps + sorted((h for h in armor if arep_of[h] != h), key=lambda h: areps.index(arep_of[h]))
    arow_of = {h: i for i, h in enumerate(aorder)}
    afams = collections.defaultdict(list)
    for h in aorder:
        afams[armor[h]['i18n'][resolve.ZH]['name']].append(h)
    afam_list, afam_of = [], {}
    for members in afams.values():
        members.sort(key=lambda h: (-((armor[h].get('derived') or {}).get('season') or 0), -armor[h]['index']))
        for h in members:
            afam_of[h] = len(afam_list)
        afam_list.append([arow_of[h] for h in members])
    arows, aperks, atext_fl, aauthors = [], {}, {}, {}
    for h in aorder:
        r = armor[h]
        zh = r['i18n'][resolve.ZH]
        authors = aauth.get(arep_of[h]) or {}
        lg = authors.get('LGpig') or {}
        src = plain(lg.get('lgpig_source') or '').strip()
        if not src:
            got = plain(F.source(h) or '')
            src = got[3:] if got.startswith('来源：') else ''
        if src and src not in source_idx:
            source_idx[src] = len(sources)
            sources.append(src)
        names, _ = rows.exotic_perks(h)
        perks = []
        for n, k in names.items():
            pr = F.at(k) or {}
            perks.append([n.lstrip('↑'), stem(pr.get('icon')) if not k.startswith('perk:') else '',
                          b.say(b.text(pr, 'database_details'))])
        aperks[h] = perks
        role = ' '.join(parts(lg.get('role'))) if lg.get('role') else ''
        arows.append([h, zh['name'], list(PART).index(r['itemSubType']), r['classType'],
                      (r.get('derived') or {}).get('season') or 0, stem(r.get('icon')),
                      stem(r.get('iconWatermark')), '、'.join(p[0] for p in perks),
                      role if arep_of[h] == h else '', source_idx.get(src, -1), arow_of[arep_of[h]],
                      afam_of[h], resolve.text(r, lang='en') or ''])
        flavor = b.text(r, 'flavorText')
        if flavor:
            atext_fl[h] = flavor
        if arep_of[h] == h:
            blocks = author_blocks(b, authors)
            if blocks:
                aauthors[h] = blocks
        xs[h] = exotic_block(b, h)

    # ── 词表 ────────────────────────────────────────────────────────
    types = {}
    for h, r in weapons.items():
        types.setdefault(r['itemSubType'], [b.text(r, 'itemTypeDisplayName'), GLYPH[r['itemSubType']]])
    watermarks = Table()
    en_w, en_a = [], []
    for row in wrows:
        row[11] = watermarks.of(row[11]) if row[11] else -1
        en = row.pop()
        en_w.append('' if en == row[1] else en)
    for row in arows:
        row[6] = watermarks.of(row[6]) if row[6] else -1
        en = row.pop()
        en_a.append('' if en == row[1] else en)
    vocab = {
        'el': {e: [rows.ELEMENT[e][1], rows.ELEMENT[e][0], stem(icons.ELEM[e])] for e in sorted(elements)},
        'br': {k: [v, stem(icons.CHAMP[k])] for k, v in icons.BREAKER.items()},
        'am': {k: list(v) for k, v in AMMO.items()},
        'ty': types,
        'slot': list(SLOT.values()),
        'rar': RARITY,
        'fr': frames,
        'src': sources,
        'wm': watermarks.items,
        'cls': [CLASS[k] for k in sorted(CLASS)],
        'part': list(PART.values()),
        'o': {k: stem(v) for k, v in icons.CHROME.items() if k in ('tier', 'craft', 'craft-bg')},
        'fam': fam_list,
        'afam': afam_list,
    }

    # ── 编码：插件与词条栏用下标，重复的表只存一份 ────────────────────
    pidx = {h: i for i, h in enumerate(b.plugs)}
    # 属性一律记下标：属性表只收各属性组里上页面的那几项，别的属性不画，插件上
    # 挂着的那几条随之丢掉。
    sidx = {h: i for i, h in enumerate(b.stats)}

    def stat_pairs(pairs):
        return [[sidx[str(k)], v] for k, v in pairs if str(k) in sidx]

    ptypes, labels = Table(), Table()
    plist = [[int(h), v[0], v[1], ptypes.of(v[2]), stat_pairs(v[3]), stat_pairs(v[4])]
             for h, v in b.plugs.items()]
    groups = {gh: [[sidx[str(x[0])]] + x[1:] for x in rows_] for gh, rows_ in b.groups.items()}
    cell_lists, mw_lists, mod_lists = Table(), Table(), Table()
    role_code = {'stat': 0, 'trait': 1, 'origin': 2}
    wp = []
    for h in order:
        group, base, cols, (tiered, rec, opts), mods, cats = wpool[h]
        enc_cols, bits = [], []
        for label, role, cells in cols:
            lst = [[pidx[str(c[0])], pidx[str(c[1])] if c[1] else -1] for c in cells]
            enc_cols.append([labels.of(label), role_code[role], cell_lists.of(lst)])
            bits += [[pidx[str(c[0])], c[2]] for c in cells if c[2]]
        enc_opts = [[o[0], sidx[str(o[1])], pidx[str(o[2])], pidx[str(o[3])] if o[3] else -1, o[4]]
                    for o in opts]
        # 基础投资值按属性组的行排：没有这一项的写 null（那一行不上页面）。
        have = dict(base)
        base = [have.get(x[0]) for x in b.groups[group]]
        wp.append([group, base, enc_cols, bits, tiered, rec, mw_lists.of(enc_opts) if opts else -1,
                   mod_lists.of([pidx[str(m)] for m in mods]) if mods else -1,
                   [pidx[str(c)] for c in cats]])
    pool = {'s': [[int(h)] + v for h, v in b.stats.items()], 'g': groups, 'p': plist, 'pt': ptypes.items, 'lb': labels.items,
            'L': cell_lists.items, 'M': mw_lists.items, 'D': mod_lists.items, 'w': wp,
            'en': en_w, 'aen': en_a}

    htmls, flavors = Table(), Table()
    wrow = {h: i for i, h in enumerate(order)}
    arow = {h: i for i, h in enumerate(aorder)}
    text = {
        'pd': [b.plug_text.get(h, '') for h in b.plugs],
        'ps': [htmls.of(b.plug_site[h]) if h in b.plug_site else -1 for h in b.plugs],
        'fw': [flavors.of(wtext_fl[h]) if h in wtext_fl else -1 for h in order],
        'fa': [flavors.of(atext_fl[h]) if h in atext_fl else -1 for h in aorder],
        'au': {wrow[h]: v for h, v in wauthors.items()},
        'aau': {arow[h]: v for h, v in aauthors.items()},
        'xs': {wrow[h]: v for h, v in xs.items() if h in wrow and rep_of[h] == h},
        'axs': {arow[h]: v for h, v in xs.items() if h in arow and arep_of[h] == h},
        'cp': {pidx[h]: v for h, v in cats_text.items()},
        'ap': {arow[h]: v for h, v in aperks.items() if arep_of[h] == h},
    }
    text['H'] = htmls.items
    text['FL'] = flavors.items
    index = {'v': vocab, 'w': wrows, 'a': arows}
    stats = {'weapons': len(wrows), 'cards': len(reps), 'armor': len(arows), 'armor_cards': len(areps),
             'mark_miss': b.mark_miss, 'orphans': b.orphans}
    out = {
        'weapons/index.js': js('WPN', index),
        'weapons/pool.js': js('WPN_POOL', pool),
        'weapons/text.js': js('WPN_TEXT', text),
        'weapons/index.html': page(stats, glyphs),
    }
    return out, stats


class Table:
    """去重表：同一个值只存一份，别处记下标。"""

    def __init__(self):
        self.items, self._at = [], {}

    def of(self, value):
        key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if key not in self._at:
            self._at[key] = len(self.items)
            self.items.append(value)
        return self._at[key]


def js(name, payload):
    return 'window.%s = %s;\n' % (name, json.dumps(payload, ensure_ascii=False, separators=(',', ':')))


# ── 页壳 ─────────────────────────────────────────────────────────────
DESC = ('Destiny 2 全部武器与异域护甲：按名字、词条、属性查一件，配词条实时算属性，'
        '附两位作者的评级、推荐词条与评语。')
AEGIS_SRC = ('<a href="https://docs.google.com/spreadsheets/d/'
             '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY" target="_blank" rel="noopener">'
             'Destiny 2: Endgame Analysis</a>')
LGPIG_SRC = ('<a href="https://docs.google.com/spreadsheets/d/'
             '1qsKGrRzCePGaIM5gNtAQNh949d3OsMJ6qV6Fqtpj22k/htmlview" target="_blank" '
             'rel="noopener">刷取清单</a>')
LGPIG = ('<a href="https://space.bilibili.com/169548478" target="_blank" rel="noopener">'
         '小棒猪</a>')


def stamp():
    """页脚的更新时间：评级与站内正文来自的那几页里最晚的一天。"""
    dates = []
    for page in sorted(set(rows.AUTHORED) | rows.EXOTIC):
        with open(os.path.join(shell.DOC_DIR, page + '.md'), encoding='utf-8') as f:
            got = markup.meta_of(f.read(), '更新')
        dates.append((tuple(int(x) for x in got.split('.')), got))
    return max(dates)[1]


def sprite(glyphs):
    """类型与弹药的小图标，内联成一张 sprite：<use href="#g-…"> 跟着文字变色。"""
    return ('<svg class="sprite" aria-hidden="true" style="display:none">%s</svg>'
            % ''.join('<symbol id="g-%s" viewBox="%s">%s</symbol>' % (k, box, body)
                      for k, (box, body) in sorted(glyphs.items())))


def page(stats, glyphs):
    head = shell.head('装备库 · Starside', DESC)
    first = ('武器数据取自 Bungie manifest，属性按词条实时算。方括号内是 PvP 数值。'
             + shell.unsure_note())
    source = ('Bungie manifest、%s（Aegis）与 %s（小棒猪）；异域的站内详情同'
              '<a href="../exotic-weapon/index.html">异域武器</a>与'
              '<a href="../exotic-armor/index.html">异域护甲</a>两页' % (AEGIS_SRC, LGPIG_SRC))
    body = [
        head.replace('</head>', '<script src="index.js" defer></script>\n'
                     '<script src="app.js" defer></script>\n</head>'),
        shell.nav('装备库', toolbar={}),
        '<main class="wpn">',
        '<h1 class="off-screen">装备库</h1>',
        '<section id="find" aria-label="装备库"><noscript><p class="empty">装备库要开着 '
        'JavaScript 才能查：共 %d 把武器、%d 件异域护甲。</p></noscript></section>'
        % (stats['weapons'], stats['armor']),
        '</main>',
        sprite(glyphs),
        shell.foot(stamp(), first, source=source,
                   thanks='Aegis 整理评级与推荐词条；%s 整理评级与评语' % LGPIG),
    ]
    return '\n'.join(body)


def self_check(stats):
    if stats['orphans']:
        markup.die('强化版找不到基础版：%s' % '；'.join(stats['orphans'][:8]))
    miss = len(stats['mark_miss'])
    if miss > MARK_MISS_BASELINE:
        markup.die('作者推荐里 %d 个词条名落不到池里（基线 %d）：\n  %s'
                   % (miss, MARK_MISS_BASELINE, '\n  '.join(stats['mark_miss'])))


def main() -> int:
    argparse.ArgumentParser(description=__doc__, allow_abbrev=False,
                            formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    out, stats = build(rows.facts())
    self_check(stats)
    for rel, body in out.items():
        path = os.path.join(shell.SITE, rel)
        if rel.endswith('index.html'):
            shell.emit(os.path.dirname(path), body, '%d 把武器（%d 张卡）、%d 件异域护甲'
                       % (stats['weapons'], stats['cards'], stats['armor']))
            continue
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body)
        raw = body.encode()
        print('%s —— %.0f KB，gzip %.0f KB' % (rel, len(raw) / 1024, len(gzip.compress(raw, 9)) / 1024))
    print('作者推荐落不到池里的词条名 %d 个（基线 %d）' % (len(stats['mark_miss']), MARK_MISS_BASELINE))
    home = os.path.join(shell.SITE, shell.HOME)
    with open(home, encoding='utf-8') as f:
        src = f.read()
    with open(home, 'w', encoding='utf-8') as f:
        f.write(shell.sync_card(src, 'weapons/index.html', ('武器', stats['cards'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
