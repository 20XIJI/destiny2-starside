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
LABEL = {'intrinsics': '固有', 'barrels': '枪管', 'magazines': '弹匣', 'magazines_gl': '弹匣',
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
MARK_MISS_BASELINE = 0

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
        """词条栏：[[栏名, 角色, 格…], …]。装备栏不在这里，固有栏只在随机时进来。

        固有栏画在「异域特性」那一块，一把枪一枚，所以通常不进这张表。故我在例外：
        它的固有栏是 8 枚互不相干的异域内在随机开一枚，插着的那一枚只是一次掉落，
        整栏列出来读者才看得见开得出什么。
        """
        cols, trait = [], 0
        for col in self.f.pool(h):
            if col.get('gear') or col['kind'] == CATALYST_KIND:
                continue
            role = ((self.f.socket_types.get(str(col['type'])) or {}).get('derived') or {}).get('kind')
            if role == 'intrinsic' and not col.get('rand'):
                continue
            if col['kind'] == TRAIT:
                trait += 1
                label = 'Perk %d' % trait
                role = 'trait'
            else:
                label = LABEL.get(col['kind'])
                if not label:
                    markup.die('%s 有一栏认不出：%s，补进 build-weapons.LABEL' % (h, col['kind']))
                if role not in ('intrinsic', 'origin'):
                    role = 'stat'
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
        # Aegis 那一格可以写几枚：「填装\\操控性」说的是这两枚大师杰作都行。
        # 按格内换行切开，逐枚落到这把枪的选项上，顺序照作者写的。
        wants = parts((authors.get('Aegis') or {}).get('masterwork') or '')
        return [o[0] for w in wants for o in opts if o[0].startswith(w)][:len(wants)]

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


# 弹药块拾取量那张表的行名 → (itemSubType, ammoType)。表里按「读者怎么叫」分行，
# 库里按枚举分：火箭手枪是装特殊弹药的手枪，火箭脉冲是装特殊弹药的脉冲步枪，
# 重型弩箭是装威能弹药的战斗弓箭。数值不在这里，见 brick_table()。
BRICK_ROWS = {
    ('绿弹', '霰弹枪'): (7, 2), ('绿弹', '榴弹发射器'): (23, 2), ('绿弹', '融合步枪'): (11, 2),
    ('绿弹', '狙击枪'): (12, 2), ('绿弹', '追踪步枪'): (25, 2), ('绿弹', '偃月'): (33, 2),
    ('绿弹', '火箭手枪'): (17, 2), ('绿弹', '火箭脉冲'): (13, 2),
    ('重弹', '刀剑'): (18, 3), ('重弹', '榴弹发射器'): (23, 3), ('重弹', '火箭发射器'): (10, 3),
    ('重弹', '线性融合步枪'): (22, 3), ('重弹', '机枪'): (8, 3), ('重弹', '重型弩箭'): (31, 3),
}
BRICK_PAGE = os.path.join(shell.ROOT, 'references', 'docs', 'ammo.md')
# 框架行上页面的那几项，顺序即载荷里的下标；app.js 顶上那几行常量要跟着改。
FRAME_FIELDS = ('tier', 'add_score', 'boss_score', 'ads_falloff_range',
                'true_rpm', 'base_reload', 'typical_mdps', 'typical_bdps',
                'minor_brick', 'boss_brick')


def brick_table():
    """`(枪型, 弹药) → [常规, 常规+回收利用, 强化, 强化+回收利用]`。

    数值现读弹药生成机制那一页的「弹药块拾取量」表，不在这里抄第二份：那张表是
    实测结果，会随版本改，抄过来就会各改各的。这一页因此是装备库唯一读源稿的地方,
    读的也只是别人写好的一张表。行名对应表见 BRICK_ROWS，对不上的行当场中止。
    """
    with open(BRICK_PAGE, encoding='utf-8') as fh:
        body = fh.read().split('## 弹药块拾取量', 1)
    if len(body) != 2:
        markup.die('%s 里找不到「弹药块拾取量」一节' % BRICK_PAGE)
    out, lane = {}, ''
    for line in body[1].split('\n'):
        if not line.startswith('|'):
            if line.startswith('##'):
                break
            continue
        spans = markup.cells(line)
        if spans is None:
            continue
        cells = [line[a:b].strip() for a, b in spans]
        head = markup.text_of(markup.inline(cells[0]), collapse=True).strip('= ')
        if len(cells) == 1:
            lane = head or lane
            continue
        if head in ('武器', '---') or set(head) <= {'-'}:
            continue
        key = BRICK_ROWS.get((lane, head))
        if key is None:
            markup.die('弹药块拾取量表里「%s · %s」没有对应的枪型，补进 BRICK_ROWS' % (lane, head))
        out['%d,%d' % key] = [markup.text_of(markup.inline(c), collapse=True).replace(
            markup.CELL_BREAK, ' ') for c in cells[1:]]
    return out


# ── 护甲套装效果 ─────────────────────────────────────────────────────
def set_author(authors):
    """套装效果上的作者评语：`[[作者, [], [段落 HTML…]], …]`。

    效果表那 29 条评语的键是 Compendium 的中文列名（`应用场景`、`获取地点`），
    与武器那一侧的 `explanation_N` 不是一套，所以不走 one_author_block()。
    只取评语本身：获取地点与套装的「类型」是同一件事，已经画在 chip 上。
    """
    out = []
    for who in ('Aegis', 'LGpig'):
        got = (authors.get(who) or {}).get('realgame_details')
        if got and got.strip():
            out.append([who, [], [markup.inline(
                got.replace(markup.CELL_BREAK, '<br>'), rich=True)]])
    return out


def set_rows(b, htmls):
    """56 套护甲套装：索引行与详情正文。

    一套两条效果（2 件与 4 件），效果各是一枚 SandboxPerk，实测与作者评语写在它
    身上。图取效果自己的官方图——套装本身在库里没有图。

    主键写成 `set:<hash>`，与站内别处对套装的寻址同一种（配装源稿也是这一种），
    「用过它的配装」因此查得到。
    """
    # 效果的图取护甲套装页那一份（`armor-sets/icons/NNN.png`，序号命名）：官方图
    # 没拉进站内图库，而那一页早就有了。与弹药块拾取量同一类例外，见 weapons.md。
    import pagedex
    art = {}
    for e in pagedex.must_read('armor-sets')['entries']:
        for key in e['keys']:
            if e['icon']:
                art.setdefault((str(key), e['kind']), '../' + e['icon'])
    # 按类型（来源活动）再按名字排：与护甲套装页同一条读法，开屏就是分好组的。
    rows_, texts = [], []
    order = sorted(b.f.sets.items(),
                   key=lambda kv: (rows.zh(kv[1]).get('来源') or rows.zh(kv[1]).get('类型', ''),
                                   rows.zh(kv[1]).get('name', '')))
    for h, rec in order:
        z = rows.zh(rec)
        effects, detail = [], []
        for one in rec.get('setPerks') or ():
            pk = b.f.perks.get(str(one['perk'][1])) or {}
            pz = rows.zh(pk)
            icon = art.get(('set:%s' % h, '%d 件' % one['requiredSetCount']), '')
            effects.append([pz.get('name', ''), one['requiredSetCount'], icon])
            detail.append([pz.get('name', ''), one['requiredSetCount'], icon,
                           htmls.of(b.site_html(pz.get('realgame_details', '')))
                           if pz.get('realgame_details') else -1,
                           b.say(pz.get('database_details', '')),
                           set_author(pk.get('authors') or {})])
        rows_.append(['set:%s' % h, z.get('name', ''),
                      resolve.text(rec, 'name', 'en') or '',
                      # 来源与类型是 Compendium 的两列：一列写活动名（发射基地），
                      # 一列写活动种类（熔炉竞技场行动）。56 套各写其一，两列都发。
                      z.get('来源', ''), z.get('类型', ''),
                      z.get('赛季', ''), z.get('标签', ''), effects])
        texts.append(detail)
    return rows_, texts


# ── 用过这一件的配装 ─────────────────────────────────────────────────
def builds_by_key():
    """`({主键: [卡片下标…]}, [卡片 HTML…])`：站上每一套配装用过的每一枚主键。

    配装源稿的槽位值写成「名字#主键」（见 .claude/rules/builds.md），所以这里按
    主键收，不按名字——同名不同物（故我在的狼群弹药与加拉尔号角的那一条）按名字
    收会把两把枪的配装混成一堆。

    合集一份源稿装 N 套，每一套各算一次，链接都指向合集那一页。
    """
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import migrate
    out = collections.defaultdict(list)
    cards = build_cards()
    cards_seen = {k: v[1] for k, v in sorted(cards.items())}

    def keys(node, got):
        if isinstance(node, dict):
            if node.get('主键'):
                got.add(str(node['主键']))
            for v in node.values():
                keys(v, got)
        elif isinstance(node, list):
            for v in node:
                keys(v, got)
        return got

    for path in migrate.sources():
        dirname = os.path.basename(os.path.dirname(path))
        hit = re.match(r'^(s\d+)-', dirname)
        if not hit:
            markup.die('赛季目录要写成「s29-赛季名」，现在叫 %r' % dirname)
        slug = os.path.basename(path)[:-len('.json')]
        rec = migrate.load(path)
        card = cards.get('%s/%s' % (hit.group(1), slug))
        if card is None:
            markup.die('配装索引页上找不到 %s/%s，先跑一次 convert-build.py' % (hit.group(1), slug))
        for block in migrate.blocks(rec):
            for key in sorted(keys(block, set())):
                out[key].append(card)
    # 一套配装可能在同一枚主键上出现两次（两格同物），去重后按更新时间倒序、再按标题。
    at, cards = {}, []
    for key, v in cards_seen.items():
        at[key] = len(cards)
        cards.append(v)

    def once(v):
        seen, got = set(), []
        for r in v:
            if r[0] in seen:
                continue
            seen.add(r[0])
            got.append(r)
        # 先按强度（meta > 强力 > 创意），同档按更新时间倒序。
        return [at[x[0]] for x in sorted(got, key=lambda r: (r[2][0], [-int(n) for n in
                                                                       r[2][1].split('.')]))]
    return {k: once(v) for k, v in out.items()}, cards


# 卡片那一族的选择器。**样式不抄第二份**：从 builds/style.css 里现取这几条内联进
# 页壳，配装推荐页改一处，这一页跟着变。强度光环、合集马赛克、「3 套」角标都在内。
CARD_SEL = re.compile(r'\.entry\b|\.entry-foot|\.entry-stamp|\.likes\b|'
                      r'\.core-mosaic|\.n-sets|data-tier|\.entries\b')


def card_css():
    """配装卡那一族的样式，从配装页的样式表里现取。"""
    with open(os.path.join(shell.SITE, 'builds', 'style.css'), encoding='utf-8') as f:
        sheet = f.read()
    got = [part for part in re.split(r'(?<=\})\n', sheet)
           if CARD_SEL.search(part.split('{')[0])]
    if len(got) < 20:
        markup.die('从 builds/style.css 里取不到配装卡的样式，只取到 %d 段' % len(got))
    return '\n'.join(x.strip() for x in got if x.strip())


# 强度的排序：读者先要「现在最强的那一套」。三档之外（没写强度的）沉底。
TIER_AT = {'meta': 0, '强力': 1, '创意': 2}

CARD = re.compile(
    r'<li class="b-[a-z]+"[^>]*data-branch="([^"]*)"[^>]*data-cls="([^"]*)"[^>]*>\s*'
    r'<a class="entry" href="([^"]+)">.*?</a>\s*</li>', re.S)


def build_cards():
    """配装索引页上每一张卡：`{赛季/slug: {…}}`。

    **从那一页的产出现取**，与 build-home.py 取首页预览同一条：标题、推荐人、描述、
    标签与更新时间都是渲染器算出来的（描述剥过标记、标签按场景收过），照着源稿
    再算一遍就是把那一段逻辑抄了第二份。
    """
    out = {}
    # 两页都读：合集那 10 套只在 builds/sets/index.html 上，它深一层，图的前缀也深一层。
    for where, up in ((('builds', 'index.html'), '../'),
                      (('builds', 'sets', 'index.html'), '../../')):
        with open(os.path.join(shell.SITE, *where), encoding='utf-8') as f:
            page_html = f.read()
        out.update(cards_in(page_html, up))
    if not out:
        markup.die('配装索引页上一张卡都没有，先跑一次 convert-build.py')
    return out


def cards_in(page_html, up):
    """一页上的每一张卡：`{赛季/slug: (键, 卡片 HTML, 更新时间)}`。

    **整张卡原样搬过来**，不按字段拆了再拼：强度光环、审核意见、合集的马赛克与
    「3 套」角标都长在这份结构上，拆一次就要在这一页把那几样各写一遍。
    图与链接的相对路径按 up 改写到 weapons/ 这一层。
    """
    out = {}
    for one in CARD.finditer(page_html):
        href = one.group(3).lstrip('./')
        key = href[:-len('/index.html')]
        html = one.group(0)
        if not html.rstrip().endswith('</li>'):
            html = html.rstrip() + '</li>'
        html = html.replace('href="%s"' % one.group(3), 'href="../builds/%s"' % href)
        html = html.replace('src="%s' % up, 'src="../')
        stamp_ = re.search(r'<span class="entry-stamp">更新 ([\d.]+)</span>', html)
        tier = re.search(r'data-tier="([^"]*)"', html)
        out[key] = (key, html, (TIER_AT.get(tier.group(1) if tier else '', 9),
                                stamp_.group(1) if stamp_ else ''))
    return out


def rolls_of(F, h):
    """挂在这件装备的组合记录上的评级，好的在前。

    故我在的评级不在本体名下：一条评级说的是「哪一枚固有配哪一种框架」，所以写在
    组合记录上（`kind: 组合`，`members` 第一位是装备本身）。本体那一行因此没有评级，
    要把这几条搬回来才看得见。
    """
    out = []
    for rec in F.minted.values():
        got = [str(m) for m in rec.get('members') or ()]
        if rec.get('kind') != '组合' or not got or got[0] != h:
            continue
        # 自发主键的作者块沿用源表的中文列名作键（见 CLAUDE.md），翻成武器记录那一套
        # 字段名，评级与理由才取得到。
        au = {who: {rows.AUTHOR_FIELDS[who].get(k, k): v for k, v in blk.items()}
              for who, blk in rows.authors_of(rec).items() if who in rows.AUTHOR_FIELDS}
        if any(au.values()):
            out.append({'parts': got[1:], 'au': au})
    out.sort(key=lambda r: rank_of(r['au']))
    return out


def tier_pairs(raw):
    """评级那一格 → [[维度, 档位]…]。

    小棒猪给异域按标签维度分档，一格里写着「高难：T0.5\\\\输出：T1」。拼成一行
    「高难T0.5 输出T1」交给页面，26px 的窄栏会从「高」「难」之间断开，读者也看不出
    哪一档属于哪个维度。没写维度的（「T0」「特殊用途」，314 条里 232 条）维度留空。
    """
    out = []
    for seg in parts(raw):
        dim, sep, tier = seg.partition('：')
        out.append([dim, tier] if sep else ['', dim])
    return out


def one_author_block(b, who, au, parts_=None):
    """一位作者一块：[作者, [[维度, 档位]…], [段落 HTML…]]，组合的那几块多一位成员图标。"""
    if who == 'Aegis':
        texts = [au.get('explanation_1')]
        grade = tier_pairs(au.get('aegis_tier') or '')
    else:
        texts = [au.get(k) for k in ('lgpig_tier_explanation', 'notes', 'explanation_1',
                                     'explanation_2', 'explanation_3')]
        grade = tier_pairs(au.get('lgpig_tier') or au.get('role') or '')
    paras = [markup.inline(t.replace(markup.CELL_BREAK, '<br>'), rich=True)
             for t in texts if t and t.strip()]
    if not (grade or paras):
        return None
    block = [who, grade, paras]
    if parts_:
        block.append([[b.f.name(m), stem((b.f.at(m) or {}).get('icon'))] for m in parts_])
    return block


def author_blocks(b, authors, rolls=()):
    """作者评语：[[作者, [[维度, 档位]…], [段落 HTML…], [[成员名, 图标]…]], …]。
    末一位只有组合有。"""
    out = [one_author_block(b, who, authors[who]) for who in ('Aegis', 'LGpig') if authors.get(who)]
    for roll in rolls:
        out += [one_author_block(b, who, roll['au'][who], roll['parts'])
                for who in ('Aegis', 'LGpig') if roll['au'].get(who)]
    return [x for x in out if x]


def exotic_block(b, h):
    """异域的站内详情：[[名字, 图标]…] 与正文 HTML。与异域武器、异域护甲两页那一格
    是同一份正文，取法只在 rows.py 一处。"""
    rec = b.f.items[h]
    got = rows.exotic_perks(h)
    # 图与名字分两份取：催化剂那几条的名字是它给的效果，图在催化剂或那枚 Perk 上。
    # 末一位是选项组号：一个插槽只插得下一枚，页面按组号把它们框起来。
    of = {n: i for i, group in enumerate(got.picks) for n in group}
    chips = [[n, stem((b.f.at(got.icons[n]) or {}).get('icon'))] + ([of[n]] if n in of else [])
             for n in got.names]
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
                   'rolls': rolls_of(F, h), 'cells': sum(len(c[2]) for c in cols)}

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
        # 评级写在组合上时（故我在），卡片徽标与开屏排序取最好的那一条
        info[rep]['rated'] = merged or (info[rep]['rolls'][0]['au']
                                        if info[rep]['rolls'] else {})
        for h in members:
            rep_of[h] = rep
        reps.append(rep)
    reps.sort(key=lambda h: (rank_of(info[h]['rated']), -len(info[h]['rated']),
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
            grades(x['rated']) if rep_of[h] == h else 0, row_of[rep_of[h]], fam_of[h],
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
                    x['cols'], [1 if tiered else 0, rec_mw, opts], [int(m) for m in mods], catalysts,
                    rows.frame_row(r)]
        flavor = b.text(r, 'flavorText')
        if flavor:
            wtext_fl[h] = flavor
        if rep_of[h] == h:
            blocks = author_blocks(b, authors, x['rolls'])
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
        names = rows.exotic_perks(h).names
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
    # 固有单列一档：它不进枪管弹匣那一截属性，也不算 Perk 1／Perk 2。
    role_code = {'stat': 0, 'trait': 1, 'origin': 2, 'intrinsic': 3}
    wp = []
    frame_rows = Table()
    for h in order:
        group, base, cols, (tiered, rec, opts), mods, cats, frame = wpool[h]
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
                   [pidx[str(c)] for c in cats],
                   frame_rows.of([frame.get(k) for k in FRAME_FIELDS]) if frame else -1])
    pool = {'s': [[int(h)] + v for h, v in b.stats.items()], 'g': groups, 'p': plist, 'pt': ptypes.items, 'lb': labels.items,
            'L': cell_lists.items, 'M': mw_lists.items, 'D': mod_lists.items, 'w': wp,
            'fr2': frame_rows.items, 'brick': brick_table(),
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
    srows, stexts = set_rows(b, htmls)
    text['st'] = stexts
    text['H'] = htmls.items
    text['FL'] = flavors.items
    # 用过这一件的配装：按主键收，详情里画在最底下。**只收站上真有的那几页**，
    # 配装源稿里别的主键（碎片、模组、技能）这一页上没有对应的一件东西。
    live = set(order) | set(aorder) | {r[0] for r in srows}
    # 卡片整段只存一份，主键那一侧记下标：819 枚主键平均各指着 4 张卡，
    # 直接存就是把同一张卡存了三千多遍（text.js gzip 因此多 33 KB）。
    by_key, cards = builds_by_key()
    text['bd'] = {h: v for h, v in by_key.items() if h in live}
    text['bdc'] = cards
    index = {'v': vocab, 'w': wrows, 'a': arows, 't': srows}
    stats = {'weapons': len(wrows), 'cards': len(reps), 'armor': len(arows), 'armor_cards': len(areps),
             'sets': len(srows), 'mark_miss': b.mark_miss, 'orphans': b.orphans}
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
        with open(rows.src_path(page), encoding='utf-8') as f:
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
                     '<script src="app.js" defer></script>\n'
                     # 配装卡那一族的样式内联进来，不抄第二份：详情里「用过它的配装」
                     # 摆的就是配装推荐页那张卡，强度光环、审核意见、合集马赛克与
                     # 「3 套」角标都长在那份结构上。
                     '<style>%s</style>\n</head>' % card_css()),
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
