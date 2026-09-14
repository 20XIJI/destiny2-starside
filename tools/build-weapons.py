#!/usr/bin/env python3
"""武器库：一把枪一页，事实层与人写层按同一个主键合在一起。

站内关于一把枪的信息从前散在六七页上——购物清单写评级与推荐 Perk，刷取清单写
另一套评级与评语，异域武器详解写机制，manifest 给出词条池与数值。这一页不新写
任何数据，它按主键把那几处**合起来显示**：改源稿这一页跟着变，它不是第七处真相。

    data/facts/          manifest 蒸馏：名字、类型、元素、勇士、数值基线、词条池、
                         插值曲线、图标
    references/items/    人写层：每位作者各占一块，各写各的列
    data/icons.json      主键 → 官方图文件名

产出四份：

    weapons/data.js   索引，2208 把枪的名字、类型、图标、角标与各家评级
    weapons/plugs.js  **全站共享**的词条字典与属性插值表
    weapons/w/*.json  一把一份，只存列结构与下标，点到才取
    weapons/index.html 只有外壳与一个空容器，交互在手写的 weapons/app.js 里

词条字典为什么共享：2208 把枪合起来只用到一千多个不同插件，而同一枚「膛线枪管」
出现在五百多把枪的词条池里。每份详情各存一遍名字、图标与说明，那部分占了产出的
86%；抽出来做成一份全站共用的字典，总量从四十来 MB 降到两三 MB，且它与索引一样
只下一次、从第二把枪起零成本。

用法：
    python3 tools/build-weapons.py
"""

import decimal
import json
import os
import re
import sys

import icons
import shell
from markup import die

OUT_DIR = os.path.join(shell.ROOT, 'weapons')
ITEM_DIR = os.path.join(shell.ROOT, 'references', 'items')

PAGE_TITLE = '武器库'
PAGE_DESC = ('Destiny 2 武器库——按名字查一把枪，一页看全它的词条池、数值、'
             '评级与推荐配搭，Aegis 与小棒猪两份口径并列显示。')

# 元素由 manifest 的 defaultDamageType 给，是个枚举。名字与着色 token 站内已有
# 定义（assets/site.css 的 :root），这里只把枚举号翻成那个 token。
ELEMENT = {1: ('动能', 'el-kinetic'), 2: ('电弧', 'el-arc'), 3: ('烈日', 'el-solar'),
           4: ('虚空', 'el-void'), 6: ('冰影', 'el-stasis'), 7: ('缚丝', 'el-strand')}

# 勇士克制是个枚举。**名字不取 manifest 那一份**：库里写的是效果名（贯穿护盾、
# 干扰、眩晕），而读者关心的是「这把枪能破哪种勇士」。站内早就这么说了——
# 「反屏障」在源稿里出现 52 次、「反过载」4 次，「贯穿护盾」一次都没有。
# 三个勇士的正名见 check_terms.TERMS 的「屏障勇士／过载勇士／势不可挡勇士」。
BREAKER = {1: '反屏障', 2: '反过载', 3: '反势不可挡'}

# 弹药类型取自 equippingBlock.ammoType。manifest 没有专门的名字表，这三个词是
# 游戏内的说法，与站内 references/docs/ammo.md 一致。
AMMO = {1: '主武器', 2: '特殊', 3: '威能'}

# 发布版本 → 赛季号。**不能算，只能查**：版本号跳跃不规则（420→450、540→600、
# 820→900→910→950→960→970），且 v500 起资料片本体（.annual/.core）与它的首季
# （.season）共用一个赛季。
#
# 这张表与 DIM 的 watermark-to-season 交叉验证过：可比的 2115 件里 1745 件逐条
# 相同，唯一的分歧是 DIM 那张表**停在第 28 季**，把第 29 季的 370 件错标成 28。
# 所以不要反过来抄它。
SEASON = {
    'v300.annual': 1,  'v310.season': 2,  'v320.season': 3,  'v400.annual': 4,
    'v410.season': 5,  'v420.season': 6,  'v450.season': 7,  'v460.season': 8,
    'v470.season': 9,  'v480.season': 10, 'v490.season': 11,
    'v500.annual': 12, 'v500.season': 12, 'v510.season': 13, 'v520.season': 14,
    'v530.season': 15, 'v540.season': 15, 'v600.annual': 16, 'v600.season': 16,
    'v610.season': 17, 'v620.season': 18, 'v630.season': 19,
    'v700.annual': 20, 'v700.season': 20, 'v710.season': 21, 'v720.season': 22,
    'v730.season': 23, 'v800.annual': 24, 'v800.season': 24, 'v810.season': 25,
    'v820.season': 26, 'v900.core': 27, 'v900.dlc': 27, 'v910': 27, 'v910.core': 27,
    'v950': 28, 'v950.core': 28, 'v950.dlc': 28, 'v960.core': 29, 'v970.core': 29,
}
# 活动武器（万圣节、黎明祭、曙光节）全塞进这一个 traitId，横跨六个赛季，查不出来。
# 它们退到水印判，判不出就不写赛季——写错比不写更糟。
SEASON_DIRTY = 'v400.season'

# 作者标签 → 显示名与主页。归属的真相是 references/docs/sources.md 那两张表，
# 这里只存展示用的那一行；改了那边要跟着改这里，闸门在 entities.AUTHORS 上。
AUTHORS = {
    'aegis': ('Aegis · Endgame Analysis',
              'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY'),
    'lgpig': ('小棒猪-LGpig · 刷取清单', 'https://space.bilibili.com/169548478'),
    'compendium': ('Destiny Data Compendium',
                   'https://docs.google.com/spreadsheets/u/0/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4'),
}

# 落在词条图标上的角标写哪个字。Compendium 不进来：它那一列写的是异域**唯一**的
# 固有 Perk，不是「十几个里挑两个」，用同一个记号会把「唯一」读成「推荐」。
AUTHOR_MARK = {'aegis': 'A', 'lgpig': 'L'}

# 作者表里内容是词条名、落得到插件上的那几列。其余列要么是散文，要么是数字，
# 要么是框架简称与大师工作属性名（实测 1996 个三元组里 96.4% 落不到任何插件上）。
PERK_COLS = {
    'aegis': ('枪管', '弹匣', 'Perk 1', 'Perk 2', '起源特性'),
    'lgpig': ('Perk 三号位', 'Perk 四号位'),
}

# 作者表里该进评论区的那几列：整段的话，不是字段。
PROSE_COLS = ('注解', '评级理由', '理由一', '理由二', '理由三', '备注', '说明')

# 作者表里该进右栏的短字段。评级单独提到标题行，不在这里。
BRIEF_COLS = ('排名', '赛季', '弹药生成', '充能效率', '护盾',
              '总伤', 'DPS', '切换 DPS', '大师')

# 这一页不显示的列：图标由主键定；来源另有去处；属性、框架、勇士三样事实层已经有了，
# 人写层那一份只是同一件事的另一种写法。
SKIP_COL = frozenset({'图标', '属性', '框架', '框架 · 射速', '勇士',
                      '来源', '获取地点', '评级'})

# 词条栏在 manifest 里的机器名 → 中文。少一个就按机器名原样显示，不中止：
# 换一批武器进来时多出一个栏名是常事，不该卡住整页。
#
# frames 那两栏站内一律写 Perk，不写「特性」（check_terms.py 的 TERMS 钉着这一条），
# 而且两栏要分得开——作者表里写的就是「Perk 1」「Perk 2」，两处用同一套列名，
# 读者能把评级块里的推荐直接对到矩阵的第几列上。
COLUMN = {
    'intrinsics': '固有', 'origins': '起源特性',
    'barrels': '枪管', 'magazines': '弹匣', 'magazines_gl': '弹匣',
    'tubes': '发射管', 'scopes': '瞄准镜', 'batteries': '电池',
    'blades': '刀锋', 'guards': '刀剑格', 'bowstrings': '弓弦',
    'arrows': '箭矢', 'hafts': '把手', 'stocks': '枪托', 'grips': '握把',
    'rails': '导轨', 'bolts': '弩弦',
    # 异域的催化剂槽。机器名带 empty 是因为它出厂时是空的，不是说这一栏没用。
    'v400.empty.exotic.masterwork': '催化剂',
    # 新刀剑那两栏是同一件事的新机器名。
    'v950.new.sword0.blades': '刀锋', 'v950.new.sword0.guards': '刀剑格',
}
FRAME_KIND = 'frames'
MW_KIND = 'v400.plugs.weapons.masterworks'
MW_NAME = '大师杰作'

# 强化版的判据：itemTypeDisplayName 以「强化」开头（强化特征 / 强化枪管 / 强化弹匣
# / 强化电池 …）。plugCategoryIdentifier 分不出来——普通版与强化版共用同一个。
ENH_TYPE = '强化'

# manifest 里没有任何字段把普通版与强化版连起来（整份定义表里带 enhanc 的键只有一个
# 图标叠加图路径）。配对靠「同一栏里同名、一边 tier 2 一边 tier 3」，这两对名字不同，
# 只能写死。
ENH_PAIR = {
    781192741: 3708227201,      # 身陷重围 ← 腹背受敌
    4290541820: 2610012052,     # 强化黄金三角 ← 黄金三角
}


# 武器类型与弹药的小图标：justrealmilk/destiny-icons 那一套（CC0），把需要的
# 二十枚抽成一张内联 sprite。抽取走 `--sprite <那个仓库的目录>`，产物 tools/type-icons.json
# 入库；仓库本身不进来，也不留抓取代码——那套图标不随赛季变。
TYPE_ICONS = os.path.join(shell.ROOT, 'tools', 'type-icons.json')

# 站内的武器类型名 → 那套图标里的文件名。17 种，与 data/facts 里的 t.zh 一一对上。
TYPE_ICON = {
    '自动步枪': 'auto_rifle', '战斗弓箭': 'bow', '融合步枪': 'fusion_rifle',
    '偃月': 'glaive', '榴弹发射器': 'grenade_launcher', '手炮': 'hand_cannon',
    '机枪': 'machinegun', '脉冲步枪': 'pulse_rifle', '火箭发射器': 'rocket_launcher',
    '斥候步枪': 'scout_rifle', '霰弹枪': 'shotgun', '手枪': 'sidearm',
    '微型冲锋枪': 'smg', '狙击步枪': 'sniper_rifle', '刀剑': 'sword_heavy',
    '追踪步枪': 'trace_rifle', '线性融合步枪': 'wire_rifle',
}
AMMO_ICON = {'主武器': 'ammo-primary', '特殊': 'ammo-special', '威能': 'ammo-heavy'}


def sprite(src):
    """从 destiny-icons 抽出要用的那二十枚，落成 tools/type-icons.json。

    三件事：剥掉写死的 fill（交给 currentColor）、把坐标统一缩放到高 32 再按 0.1
    取整（14px 显示时看不出差别，整张 sprite 从 10.8 KB gz 降到 7.5 KB），
    以及只留 path 这一层，不留 IcoMoon 的注释与 title。
    """
    want = sorted(set(TYPE_ICON.values()) | set(AMMO_ICON.values()))
    out = {}
    for name in want:
        path = next((os.path.join(src, d, name + '.svg')
                     for d in ('weapons', 'general')
                     if os.path.exists(os.path.join(src, d, name + '.svg'))), None)
        if not path:
            die('destiny-icons 里找不到 %s.svg：%s' % (name, src))
        with open(path, encoding='utf-8') as f:
            text = f.read()
        box = re.search(r'viewBox="([^"]+)"', text).group(1)
        body = text[text.index('>', text.index('<svg')) + 1:text.rindex('</svg>')]
        body = re.sub(r'<title>.*?</title>', '', body, flags=re.S)
        body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
        body = re.sub(r'\s(?:fill|stroke)="(?!none)[^"]*"', '', body)
        body = re.sub(r'\s+', ' ', body).strip()
        x0, y0, wide, high = (float(v) for v in box.split())
        k = 32.0 / high
        trim = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')      # noqa: E731
        body = re.sub(r'-?\d+(?:\.\d+)?',
                      lambda m: trim(float(m.group(0)) * k), body)
        out[name] = ['0 0 %s 32' % trim(wide * k), body]
    with open(TYPE_ICONS, 'w', encoding='utf-8') as f:
        f.write(',\n'.join(' %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False))
                           for k, v in sorted(out.items())).join(('{\n', '\n}\n')))
    print('tools/type-icons.json  %d 枚  %.1f KB'
          % (len(out), os.path.getsize(TYPE_ICONS) / 1024))
    return 0


def load_sprite():
    if not os.path.exists(TYPE_ICONS):
        die('还没抽武器类型图标：\n'
            '  git clone --depth 1 https://github.com/justrealmilk/destiny-icons\n'
            '  python3 tools/build-weapons.py --sprite <那个目录>')
    with open(TYPE_ICONS, encoding='utf-8') as f:
        return json.load(f)


def records():
    """人写层：{主键: 记录}，几卷合起来。"""
    out = {}
    for name in sorted(os.listdir(ITEM_DIR)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(ITEM_DIR, name), encoding='utf-8') as f:
            out.update(json.load(f))
    return out


IMG_MARK = re.compile(r'!\[\]\([^)]*\)')
MARK = re.compile(r'\{[\w-]+\|([^{}]*)\}')
SLASH = re.compile(r'[／/]')

# 收藏条目的来源串自带「来源：」前缀，而页面上那一格已经写着「来源」两个字，
# 照抄就成了「来源 来源：…」。
SRC_TAG = re.compile(r'^来源[:：]\s*')


def plain(text):
    """源稿原文 → 纯文字。着色标记剥掉，格内换行换成顿号——评级那一格写着
    「高难：T0.5\\\\输出：T1」，直接塞进索引会在左栏里露出两个反斜杠。"""
    return MARK.sub(r'\1', strip(text)).replace('\\\\', ' · ').strip()


def strip(text):
    """作者写的那一格 → 这一页要显示的字。

    源稿里的 {token|文字} 是着色标记、\\\\ 是格内换行，两样都留给渲染那一侧处理；
    图片标记在这里就去掉：勇士那一格写的是一枚图标，那件事事实层已经有了。"""
    return IMG_MARK.sub('', text).strip()


def cells(text):
    """一格里写了几个词条名。格内换行与斜杠都是分隔符，着色标记与图片剥掉。"""
    out = []
    for part in MARK.sub(r'\1', IMG_MARK.sub('', text or '')).split('\\\\'):
        for one in SLASH.split(part):
            one = one.strip().lstrip('↑').strip()
            if one and one not in ('None', '无', '-', '—'):
                out.append(one)
    return out


# 219 把武器的收藏条目写的是这一句。它不是来源，是「为什么没有来源」，
# 照抄到页面上只会在「来源」两个字后面跟一句「没有来源」。
NO_SOURCE = '随机特性：此物品无法从收藏品再次获取。'


# 评级写在卡片上要短。两家的写法不一样：Aegis 是一个字母，刷取清单是 T 档，
# 还常常按场景分成几段（「清怪：T2\\高难：T3」）。冒号与分隔点在一张 168px 宽的
# 卡片上写不开，压成「清怪T2 高难T3」。
GRADE_CUT = re.compile(r'[:：]\s*')

# 档位 → 名次。两家各一套刻度，摆到同一根轴上：Aegis 的 S 对刷取清单的 T0，
# 往下 A 对 T1、B 对 T2……刷取清单还有半档（T0.5），落在两者之间。
# 一格里写了几段的取最好那一段：读者按「这枪最强的那一面」找它。
LETTER_RANK = {'S': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6}
TIER_RANK = re.compile(r'T(\d+(?:\.\d+)?)')
# 「特殊用途」「PVP」「输出工具枪」这类不是档位，是用途。排在 T3 之后、无评级之前。
NO_TIER = 3.5


def grade(text):
    """一格评级 → 卡片上写的那一行。"""
    return ' '.join(GRADE_CUT.sub('', x) for x in plain(text).split(' · ') if x)


def rank_of(text):
    """一格评级 → 名次，越小越靠前。认不出档位的按 NO_TIER 算。"""
    flat = plain(text)
    if not flat:
        return None
    got = [float(m.group(1)) for m in TIER_RANK.finditer(flat)]
    got += [LETTER_RANK[c] for c in flat if c in LETTER_RANK and 'T' not in flat]
    return min(got) if got else NO_TIER


def source(row):
    text = (row.get('src') or {}).get('zh', '').strip()
    return '' if text == NO_SOURCE else SRC_TAG.sub('', text).strip()


def season_of(row):
    """首发赛季。查不出来就不写——写错比不写更糟。"""
    rel = row.get('rel')
    if not rel or rel == SEASON_DIRTY:
        return 0
    return SEASON.get(rel, 0)


class Dict:
    """全站共享的词条字典。一条 [名字, 图标, 说明, 投资属性, 强化版]。

    第五位是强化版：`0` 表示没有，否则是 [强化版说明, 强化版投资属性]。普通版与
    强化版在库里是两个 hash，同名同图，说明差一句（「一次元素伤害爆炸」→「一次
    **更强的**元素伤害爆炸」），数值差 1~2 点。画成两枚圆圈读者看到的是同一个东西
    重复了一遍——全站五万个格子里有两万八是这样重复出来的。
    """

    def __init__(self, facts, table, stat_of):
        self.facts, self.table, self.stat_of = facts, table, stat_of
        self.rows, self.at = [], {}

    def inv(self, r):
        """属性一律换成 data.js 里 s 的下标，前端不必再拿 hash 查一遍表。"""
        return [[self.stat_of(x[0])] + list(x[1:]) for x in r.get('inv') or ()] or 0

    def row(self, h):
        r = self.facts.items.get(str(h)) or {}
        got = self.table.get(icons.icon_of(self.facts, str(h)) or '')
        return [r.get('n', {}).get('zh', str(h)),
                got['file'] if got else '',
                (r.get('desc') or {}).get('zh', ''),
                self.inv(r), 0]

    def add(self, h, enh=None):
        key = (str(h), str(enh) if enh else '')
        if key not in self.at:
            row = self.row(h)
            if enh:
                e = self.facts.items.get(str(enh)) or {}
                row[4] = [(e.get('desc') or {}).get('zh', ''), self.inv(e)]
            self.at[key] = len(self.rows)
            self.rows.append(row)
        return self.at[key]


def is_enhanced(row):
    return (row.get('t') or {}).get('zh', '').startswith(ENH_TYPE)


def by_name_once(facts, plugs):
    """同名的收成一枚，保留池内顺序。

    大师工作那一栏一个名字有两三个 hash（「大师杰作：稳定性」三条：一条另带全属性
    +3 的条件加成，两条只有 +10），无条件那一份完全一样，读者眼里是同一个东西画了
    两三遍。留第一条：它带着那几行条件加成，浮层里写得出来。
    """
    out, seen = [], set()
    for h in plugs:
        name = facts.name(h)
        if name in seen:
            continue
        seen.add(name)
        out.append(h)
    return out


def merge(facts, plugs):
    """一栏里的插件 → [(普通版 hash, 强化版 hash 或 None)]，顺序即池内顺序。

    两道合并，都只在同一栏内做：
      1. 普通版 + 强化版 合成一枚。配对靠同名，两对名字不同的写死在 ENH_PAIR。
      2. 名字、图标、说明、品阶全一样的重复项收成一枚。库里「丢弃型弹匣」这种
         同名同参的条目有两个 hash，读者眼里就是同一个东西画了两遍。
    """
    base, extra, seen = [], {}, {}
    for h in plugs:
        r = facts.items.get(str(h)) or {}
        name = (r.get('n') or {}).get('zh', '')
        if is_enhanced(r):
            extra.setdefault(ENH_PAIR.get(int(h)) or name, h)
            continue
        key = (name, r.get('icon'), (r.get('desc') or {}).get('zh', ''), r.get('tier'))
        if key in seen:
            continue
        seen[key] = h
        base.append((h, name))
    out = []
    for h, name in base:
        out.append((h, extra.get(int(h)) or extra.get(name)))
    return out


def norm(text):
    """比名字之前的归一化，与 resolve.norm 同义：去汉字与拉丁之间的排版空格。"""
    return re.sub(r'[  ]+', '', text or '')


def picks(resolve, facts, key, recs_row, seat):
    """作者推荐落到哪几枚上。返回 {插件下标: '作者首字'}，与未落位的名字清单。

    解析走 `resolve.perk_key()`，不另写一份：它按**这一行那件东西自己的 socket 池**
    查名字（全表查「狂暴」会撞上五条 sandboxPerk 加三条插件），还顺带带来罗马数字
    区间、槽位说明词与通行简称三张表。落位一致性实测接近干净（Perk 1 → 第一个
    frames 栏 99.2%、Perk 2 → 第二个 99.7%），所以只按名字落位，不强行绑列。
    """
    hit, miss = {}, []
    for who, cols in PERK_COLS.items():
        block = (recs_row.get('来自') or {}).get(who) or {}
        mark = AUTHOR_MARK[who]
        for col in cols:
            for name in cells(block.get(col)):
                got = resolve.perk_key(facts, [key], name)
                if got is None:      # 槽位说明词，本来就不是一个词条
                    continue
                ats = {seat[str(h)] for h in got if str(h) in seat}
                if not ats:
                    miss.append((who, col, name))
                    continue
                for at in ats:
                    if mark not in hit.get(at, ''):
                        hit[at] = hit.get(at, '') + mark
    return hit, miss


def pool_of(facts, key):
    """一把枪的词条名 → 这把枪自己池里的插件 hash。gear 那几栏不算。"""
    out = {}
    for col in facts.pools.get(key) or ():
        if col.get('gear'):
            continue
        for p in list(col.get('plugs') or ()) + ([col['init']] if col.get('init') else []):
            out.setdefault(norm(facts.name(p)), p)
    return out


def wanted(rec):
    """一条人写记录里写到的全部词条名。"""
    out = []
    for who, cols in PERK_COLS.items():
        block = (rec.get('来自') or {}).get(who) or {}
        for col in cols:
            out += cells(block.get(col))
    return out


def relocate(facts, recs, by_name):
    """把人写记录挪到「作者写的词条真能开出来」的那个版本上。

    复刻让同一把枪有好几个 itemHash，各自的词条池不一样。源稿那一行戳的是站内
    资料页选中的那个版本，而作者写的推荐往往是另一版的——实测落不到池里的 587 条
    里有 434 条属于这种，那些名字在**同名的另一个 hash** 的池里就有。

    判据只有一条：哪一版能开出的推荐词条最多。数目相同就不动，留在源稿戳的那一版上。
    """
    out, moved = {}, 0
    for key, rec in recs.items():
        names = [norm(n) for n in wanted(rec)]
        alts = by_name.get((facts.items.get(key) or {}).get('n', {}).get('zh', ''), [])
        if not names or len(alts) < 2:
            out[key] = rec
            continue
        best, score = key, sum(1 for n in names if n in pool_of(facts, key))
        for alt in alts:
            if alt == key:
                continue
            got = sum(1 for n in names if n in pool_of(facts, alt))
            if got > score:
                best, score = alt, got
        if best != key:
            moved += 1
        # 两条记录撞到同一版就合并：各家写各家的块，键不冲突。
        if best in out:
            out[best].setdefault('来自', {}).update(rec.get('来自') or {})
        else:
            out[best] = rec
    return out, moved


def payload(resolve, facts, recs, table):
    """投影分三层。

    **索引**只放挑枪要用的那几样：名字、类型、元素、勇士、弹药、赛季、图标与各家
    评级。**词条字典**全站共享一份。**详情**按枪各存一份，只存列结构与下标。
    """
    stats, stat_at = [], {}

    # 哪些属性不是 0–100 的量纲：按**全表实测的最大值**判，超过 100 就不是。
    # 每分钟发射数能到 900、弹匣能到几百，给它们画一条按 100 封顶的进度条，
    # 条会永远满格，读者以为那是「满」。manifest 自己那一位（displayAsNumericalStat）
    # 全表 1099 项一个 True 都没有，指望不上。
    top = {}
    for row in facts.items.values():
        for sh, val in row.get('stats') or ():
            if val > top.get(sh, 0):
                top[sh] = val

    def stat_of(h):
        h = str(h)
        if h not in stat_at:
            stat_at[h] = len(stats)
            stats.append([(facts.stats.get(h) or {}).get('n', {}).get('zh', h),
                          1 if top.get(h, 0) > 100 else 0, int(h)])
        return stat_at[h]

    bag = Dict(facts, table, stat_of)
    by_name = {}
    for key, row in facts.items.items():
        if row.get('ty') == 3:
            by_name.setdefault(row['n']['zh'], []).append(key)

    recs, moved = relocate(facts, recs, by_name)
    out, detail, missed = [], {}, []
    for key in sorted((k for k, v in facts.items.items() if v.get('ty') == 3), key=int):
        row = facts.items[key]
        rec = recs.get(key) or {}
        cols, mods, mw, seat, frames = [], [], [], {}, 0
        for col in facts.pools.get(key) or ():
            plugs = list(col.get('plugs') or ())
            if not col.get('gear') and col.get('init') and col['init'] not in plugs:
                # 起源特性等只写在 init 上，与池取并集。
                plugs.append(col['init'])
            kind = col['kind']
            if kind.startswith(MW_KIND):
                plugs = by_name_once(facts, plugs)
            pairs = merge(facts, plugs)
            if not pairs:
                continue
            seats = [bag.add(h, e) for h, e in pairs]
            if kind.startswith(MW_KIND):
                mw = seats
            elif col.get('gear'):
                mods += seats
            else:
                if kind == FRAME_KIND:
                    frames += 1
                    label = 'Perk %d' % frames
                else:
                    label = COLUMN.get(kind, kind)
                # 第三位：这一栏参不参与数值计算。固有与固定的起源特性不参与——
                # manifest 给的基线里已经含了它们（把默认插件再加一遍，还原率会从
                # 99.7% 掉到 74.9%），它们在页面上只是「这把枪是什么框架」。
                cols.append([label, seats, 1 if col['rand'] else 0])
                for (h, e), at in zip(pairs, seats):
                    for one in (h, e):
                        if one:
                            seat[str(one)] = at
        if mw:
            # 大师杰作排在矩阵最左：它不是掉落时开出来的，是这把枪升满之后自己选的
            # 那一项，读者配一把枪时先定它。
            # 第四位：这一栏在页面上折起来，只露选中的那一枚。十四项摊开会把整张
            # 矩阵拉高一倍，而它们是同一件事的十四个取值，不是十四个并列的选项。
            cols.insert(0, [MW_NAME, mw, 1, 1])
        hit, miss = picks(resolve, facts, key, rec, seat)
        missed += [(key, row['n']['zh']) + m for m in miss]

        el = ELEMENT.get(row.get('dmg') or 0, ('', ''))
        got = table.get(icons.icon_of(facts, key) or '')
        block = {who: {plain(c): strip(v) for c, v in b.items()
                       if c not in SKIP_COL and strip(v)}
                 for who, b in (rec.get('来自') or {}).items()}
        item = {
            'h': key,
            # 赛季水印：一张整幅图，角标画在它自己那个左上角上。
            'wm': (table.get(row.get('wm') or '') or {}).get('file', ''),
            'n': row['n']['zh'],
            'en': row['n'].get('en', ''),
            't': (row.get('t') or {}).get('zh', ''),
            'el': el[0], 'tk': el[1],
            'tier': row.get('tier'),
            'ico': got['file'] if got else '',
            'br': BREAKER.get(row.get('breaker') or 0, ''),
            'am': AMMO.get(row.get('ammo') or 0, ''),
            'sea': season_of(row),
            # 评级进索引：左栏要按它排、要显示它，为这一列再取一次详情不值当。
            'r': {who: grade(b['评级'])
                  for who, b in (rec.get('来自') or {}).items() if b.get('评级')},
        }
        for flag in ('craft', 'tiering'):
            if row.get(flag):
                item[flag] = 1
        # 大师工作的金色辉光：这一栏在，说明这把枪升得满，图标底下那层光就该亮。
        if mw:
            item['mw'] = 1
        # 框架：网格那一页每张卡片都写它，所以进索引而不是详情。名字与图取固有
        # 那一栏的第一枚——那一栏恒只有一件东西。
        first = [c for c in cols if c[0] == '固有']
        if first and first[0][1]:
            item['fr'] = bag.rows[first[0][1][0]][0]
            item['fi'] = bag.rows[first[0][1][0]][1]
        out.append(item)

        # 同名的别版本：复刻让同一把枪有好几个 hash，读者要能在版本之间跳。
        alt = [[k, season_of(facts.items[k])]
               for k in by_name.get(row['n']['zh'], []) if k != key]
        alt.sort(key=lambda x: -x[1])
        detail[key] = {
            # 来源两段：作者写的那一份在前——她标的是「这一版现在从哪来」，
            # manifest 的收藏条目写的是这把枪当初的来路，两件事都要。
            'src': [plain((block.get('aegis') or {}).get('来源', '')), source(row)],
            'fl': (row.get('flavor') or {}).get('zh', ''),
            'sg': row.get('sg', ''),
            # 基线只取无条件生效的那些。第三位是 isConditionallyActive——
            # 「亡命之徒」击杀后才加填装，把它算进基线，读者看到的就是一把
            # 永远处在击杀后状态的枪。
            'base': [[stat_of(x[0]), x[1]] for x in row.get('inv') or ()
                     if len(x) == 2 and str(x[0]) in facts.stats],
            'c': cols,
            'm': mods,
            'rec': {str(k): v for k, v in sorted(hit.items())},
            'by': block,
            'alt': alt,
        }
    def file_of(path):
        return (table.get(path) or {}).get('file', '')

    # 开屏按档位排：两家里最好的那一档在前，同一档内按武器类型聚拢，
    # 异域不单列——它按自己的档位混在传说中间，读者找的是「这一档有哪些枪」。
    # 没有评级的沉到最后，它们只有事实层那一份，没人替读者挑过。
    ranked = {}
    for key, rec in recs.items():
        got = [rank_of(b.get('评级', ''))
               for b in (rec.get('来自') or {}).values() if b.get('评级')]
        got = [g for g in got if g is not None]
        if got:
            ranked[key] = min(got)
    out.sort(key=lambda w: (ranked.get(w['h'], 99), w['t'], w['n']))

    chrome = {k: file_of(v) for k, v in icons.CHROME.items()}
    # 逐条不再各存一份图名：元素六种、勇士三种、类型十七种、弹药三种，
    # 都按那一行已有的中文名查这几张共享表。
    chrome['el'] = {ELEMENT[k][1]: file_of(v) for k, v in icons.ELEM.items()
                    if k in ELEMENT}
    chrome['ch'] = {BREAKER[k]: file_of(v) for k, v in icons.CHAMP.items()}
    chrome['ty'] = dict(TYPE_ICON)
    chrome['am'] = dict(AMMO_ICON)
    missing = ([k for k, v in chrome.items() if isinstance(v, str) and not v]
               + ['勇士 %d' % k for k, v in icons.CHAMP.items() if not file_of(v)]
               + ['元素 %d' % k for k, v in icons.ELEM.items() if not file_of(v)])
    if missing:
        die('武器图标的装饰层还没拉：%s\n  跑 python3 tools/icons.py --pull'
            % '、'.join(missing))
    return ({'a': AUTHORS, 's': stats, 'w': out, 'o': chrome},
            {'p': bag.rows, 'g': group_table(facts, stat_at)},
            detail, missed, moved)


def interp(v, curve):
    """投资值 → 显示值，分段线性。

    **两端截断，不外推**。曲线常常不从 0 起（霰弹枪的伤害是 [[10,65],[70,70],[100,85]]），
    而投资值 0 在游戏里显示 65 不是 64——按前两点的斜率往下延出去就差这一点，
    全表 30 个格子栽在这上面。
    """
    if not curve:
        return v
    if len(curve) == 1 or v <= curve[0][0]:
        return curve[0][1]
    if v >= curve[-1][0]:
        return curve[-1][1]
    for a, b in zip(curve, curve[1:]):
        if a[0] <= v <= b[0]:
            if b[0] == a[0]:
                return a[1]
            return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0])
    return curve[-1][1]


def show(v, top, curve):
    """一项属性最终显示成几。先按上限截断再过曲线，**银行家舍入**。

    三个细节缺一不可，各有实测：不先截断，后坐方向那一批整批错；改成四舍五入，
    2208 把里 47 把对不上；两端外推而不截断，30 个格子差 1。
    """
    if top:
        v = min(v, top)
    return int(decimal.Decimal(repr(interp(v, curve))).quantize(
        0, rounding=decimal.ROUND_HALF_EVEN))


def self_check(facts, detail, dic, stats):
    """基线走公式必须还原出 manifest 自己写的显示值，一格都不许差。

    这一页唯一算错了也不会报错的地方就是这里：属性条画出来总是「一根条加一个数」，
    数错了页面照样好看。所以每次构建都对一遍，不留给肉眼。
    """
    groups, bad = dic['g'], []
    for key, one in detail.items():
        rows = groups.get(one['sg'])
        if not rows:
            continue
        base = dict(one['base'])
        want = dict(facts.items[key].get('stats') or ())
        for si, top, curve in rows:
            v = base.get(si)
            got = 0 if v is None else show(v, top, curve)
            exp = want.get(str(stats[si][2]), 0)
            if got != exp:
                bad.append('%s %s %s：算出 %s，manifest 写的是 %s'
                           % (key, facts.name(key), stats[si][0], got, exp))
    if bad:
        die('属性基线还原不出 manifest 的显示值，%d 处：\n  %s'
            % (len(bad), '\n  '.join(bad[:10])))


def group_table(facts, stat_at):
    """属性插值曲线，只留武器用得到的那几十组。

    显示值不是投资值——`min(投资值, 上限)` 之后过一条分段线性曲线再按银行家舍入。
    直接在显示值上加插件的原始加成，58052 个组合里有 12.02% 会算错，最差一处差 250。
    """
    out = {}
    for gh, group in (facts.groups or {}).items():
        rows = []
        for sh, (top, curve) in group.items():
            if sh in stat_at:
                rows.append([stat_at[sh], top, curve])
        if rows:
            out[gh] = rows
    return out


# ── 闸门 ──────────────────────────────────────────────────────────────
# 三条基线，各是「当前实测值」。只许降不许升：新写的源稿掉链子当场报出，
# 而已经躺在那里的那几条不必为它们卡住整次构建。
#
#   miss    作者写了、这把枪的池里却开不出来的词条名
#   champ   manifest 推的勇士与作者「勇士」那一列对不上的枪
#   frames  manifest 推的勇士与 weapon-frames.md 那一列对不上的枪
BASELINE = {'miss': 76, 'champ': 6, 'frames': 1}

# 源稿「勇士」那一格写的是三枚图标之一。图标 → 破盾类型的对应用事实层那 17 把
# 自带 breakerType 的异域反查出来，零冲突：贯穿护盾 4 把、干扰 7 把、眩晕 6 把。
CHAMP_ICON = {'a9911a3dfe': 1, '8b37bb6db2': 2, 'b7c4048b87': 3}
CHAMP_CELL = re.compile(r'icons/(\w+)\.webp')
FRAME_DOC = os.path.join(shell.ROOT, 'references', 'docs', 'weapon-frames.md')


def frame_champs():
    """weapon-frames.md 的「勇士」列：(武器类型, 框架简称) → 破盾类型。

    那一页按武器类型分组，框架名写的是简称（「适配」而库里是「适配框架」），
    所以这里存简称，比对时按前缀配。
    """
    import markup
    out, kind = {}, ''
    with open(FRAME_DOC, encoding='utf-8') as f:
        lines = [x.rstrip('\n') for x in f]
    head = None
    for line in lines:
        spans = markup.cells(line)
        if not spans:
            continue
        cut = [line[a:b] for a, b in spans]
        if head is None:
            if '勇士' not in cut:
                continue
            head = (cut.index('武器'), cut.index('框架'), cut.index('勇士'))
            continue
        if len(cut) < max(head) + 1:
            continue
        kind = cut[head[0]] or kind
        name = MARK.sub(r'\1', cut[head[1]]).strip()
        got = CHAMP_CELL.search(cut[head[2]])
        if name and got and got.group(1) in CHAMP_ICON:
            out[(kind, name)] = CHAMP_ICON[got.group(1)]
    if not out:
        die('weapon-frames.md 里一行勇士都没读出来，那一页的列名或格式变了')
    return out


def cross_check(facts, recs, missed):
    """勇士与推荐落位的反查。判据全部现取，不另存副本。

    勇士这件事站内有三处写法：manifest 按固有框架的 SandboxPerk 推出来的（2207 把，
    唯一能覆盖全表的一条）、weapon-frames.md 的「勇士」列（按框架，1539 把对得上）、
    两位作者的「勇士」列（896 把）。**以推导为真**，另两处当反查样本。
    """
    champ, frames = [], []
    for key, rec in recs.items():
        row = facts.items.get(key) or {}
        said = set()
        for block in (rec.get('来自') or {}).values():
            got = CHAMP_CELL.search(block.get('勇士') or '')
            if got and got.group(1) in CHAMP_ICON:
                said.add(CHAMP_ICON[got.group(1)])
        if said and (row.get('breaker') or 0) not in said:
            champ.append('%s %s：推导 %s，作者写的是 %s'
                         % (key, facts.name(key), row.get('breaker'), sorted(said)))
    table = frame_champs()
    for key, row in facts.items.items():
        if row.get('ty') != 3 or row.get('tier') != 5:
            continue
        intr = [c for c in facts.pools.get(key) or () if c.get('kind') == 'intrinsics']
        if not intr:
            continue
        fh = intr[0].get('init') or (intr[0].get('plugs') or [None])[0]
        name = facts.name(fh)
        kind = (row.get('t') or {}).get('zh', '')
        for (k, short), want in sorted(table.items(), key=lambda x: -len(x[0][1])):
            if k == kind and short in name:
                if want != (row.get('breaker') or 0):
                    frames.append('%s %s（%s %s）：推导 %s，框架表写的是 %s'
                                  % (key, facts.name(key), kind, name,
                                     row.get('breaker'), want))
                break
    bad = []
    for tag, got in (('miss', len(missed)), ('champ', len(champ)), ('frames', len(frames))):
        if got > BASELINE[tag]:
            bad.append('%s：%d 条，基线是 %d' % (tag, got, BASELINE[tag]))
    if bad:
        die('武器库反查退步了：\n  %s\n%s'
            % ('\n  '.join(bad), '\n'.join('  ' + x for x in (champ + frames)[:10])))
    return champ, frames


def stamp():
    """本页的更新时间：它汇总的那几页里最新的那个。

    这一页没有自己的源稿，写死一个日期就会与它显示的内容脱节；取 max 则是
    「这一页显示的东西里最新的一份是什么时候改的」，正是读者要的那个意思。
    """
    import entities
    days = []
    for page in entities.AUTHORS:
        path = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
        with open(path, encoding='utf-8') as f:
            for line in f:
                if line.startswith('更新：'):
                    days.append(line[len('更新：'):].strip())
                    break
    return max(days, key=lambda d: [int(x) for x in d.split('.')])


def sprite_tag():
    """武器类型与弹药那二十枚图标，做成一张内联 sprite。

    内联而不是另开一个文件：`<use href="别的文件#id">` 在几个浏览器上拿不到
    currentColor，而这些图标要跟着文字变色（元素色、勇士红、素白）。整张 7.5 KB gz，
    只有这一页要，不进外壳。
    """
    art = load_sprite()
    body = ''.join('<symbol id="i-%s" viewBox="%s">%s</symbol>' % (k, v[0], v[1])
                   for k, v in sorted(art.items()))
    return ('<svg class="wpn-sprite" aria-hidden="true" width="0" height="0">'
            '<defs>%s</defs></svg>' % body)


def render(n_weapon, n_rated):
    o = [shell.head(PAGE_TITLE, PAGE_DESC, app_js=False),
         shell.nav('武器库'),
         # 两份脚本都 defer：data.js 是索引，app.js 只读它，顺序即依赖。
         # **plugs.js 不在这里**：那是 65 KB gz 的词条字典，只有点开某一把枪
         # 才用得上，挂在首屏等于让「只是来搜个名字」的读者白下一份。它由
         # app.js 在空闲时预取，首次点开时兜底等它。
         # 不放进 shell.head()——那一段是全站逐字一致的外壳，
         # 页面专属的东西进去就等于给每一页都开一个口子。
         '<script defer src="data.js"></script>',
         '<script defer src="app.js"></script>',
         shell.page_head(PAGE_TITLE, PAGE_DESC),
         '<main class="wpn">',
         # 整页只有一个分节：内容由 app.js 按选中的那把枪现画，落地锚点是
         # #<主键>，不是分节。全站搜索要求每一页至少有一个带 id 的分节
         # （链过去得落得到位置），这一个就是它。
         '<section id="find">',
         '<h2 class="sect-label">按名字挑一把枪</h2>',
         '<form class="wpn-find" role="search" onsubmit="return false">',
         '<input id="q" type="search" autocomplete="off" spellcheck="false"'
         ' placeholder="按名字找一把枪" aria-label="按名字找一把枪">',
         '</form>',
         # 筛选条由 app.js 按索引里真有的取值现建，不写死：换一批武器进来，
         # 多出来的元素或武器类型会自己长出一枚开关。
         '<div class="wpn-facets" id="facets"></div>',
         # 计数与视图开关排在版心这一层：网格那一档没有左栏，计数不能藏在里面。
         '<div class="wpn-bar">',
         '<p id="count" class="wpn-count" role="status"></p>',
         '<nav class="wpn-view" aria-label="换一种排法">',
         '<button id="v-grid" class="toggle" type="button" aria-pressed="true">网格</button>',
         '<button id="v-list" class="toggle" type="button" aria-pressed="false">列表</button>',
         '</nav>',
         '</div>',
         '<div class="wpn-body">',
         '<div class="wpn-aside">',
         '<ol id="hits" class="wpn-hits"></ol>',
         '</div>',
         '<article id="one" class="wpn-one"></article>',
         '</div>',
         # 悬停说明用一个浮层反复画，不给每枚图标各挂一个：一把枪的词条矩阵
         # 有上百格。hidden 由 app.js 开合，无 JS 时它一直是隐藏的。
         '<div id="tip" class="wpn-tip" role="tooltip" hidden></div>',
         sprite_tag(),
         '</section>',
         '</main>', '',
         shell.foot(stamp(),
                    '共 %d 把；其中 %d 把有作者写的评级与推荐，两位作者的口径'
                    '并列显示，不合并。' % (n_weapon, n_rated),
                    source='本页不另立数据：词条池、数值与勇士克制来自 Bungie 的'
                           ' manifest，评级、推荐与评语来自各自作者那一份。')]
    return '\n'.join(o) + '\n'


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--sprite':
        if len(sys.argv) < 3:
            die('用法：python3 tools/build-weapons.py --sprite <destiny-icons 目录>')
        return sprite(os.path.expanduser(sys.argv[2]))
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    recs = records()
    data, dic, detail, missed, moved = payload(resolve, facts, recs, icons.load())
    self_check(facts, detail, dic, data['s'])
    os.makedirs(os.path.join(OUT_DIR, 'w'), exist_ok=True)

    def write(name, body):
        with open(os.path.join(OUT_DIR, name), 'w', encoding='utf-8') as f:
            f.write(body)
        return len(body.encode())

    # 不排键：作者那一块的列序即他原表的列序，见 entities.py。
    a = write('data.js', 'window.WPN=%s;\n'
              % json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    b = write('plugs.js', 'window.WPG=%s;\n'
              % json.dumps(dic, ensure_ascii=False, separators=(',', ':')))
    total = 0
    for key, one in detail.items():
        text = json.dumps(one, ensure_ascii=False, separators=(',', ':'))
        total += len(text.encode())
        with open(os.path.join(OUT_DIR, 'w', key + '.json'), 'w', encoding='utf-8') as f:
            f.write(text)
    rated = sum(1 for w in data['w'] if w['r'])
    marked = sum(1 for d in detail.values() if d['rec'])
    print('weapons/data.js   %7.1f KB  武器 %d（有评级 %d）'
          % (a / 1024, len(data['w']), rated))
    print('weapons/plugs.js  %7.1f KB  词条 %d、插值组 %d、属性 %d'
          % (b / 1024, len(dic['p']), len(dic['g']), len(data['s'])))
    print('weapons/w/        %7.1f KB  %d 份，每份平均 %.1f KB；推荐落位 %d 把'
          % (total / 1024, len(detail), total / 1024 / max(1, len(detail)), marked))
    champ, frames = cross_check(facts, recs, missed)
    print('  人写记录挪到别版本上的 %d 条（那一版才开得出作者写的词条）' % moved)
    print('  勇士反查：与作者那一列不一致 %d 条，与 weapon-frames.md 不一致 %d 条'
          % (len(champ), len(frames)))
    if missed:
        print('  推荐词条落不到池里的 %d 条，前 8 条：' % len(missed))
        for m in missed[:8]:
            print('    %s %s  %s/%s  %s' % m)
    shell.emit(OUT_DIR, render(len(data['w']), rated), '武器 %d' % len(data['w']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
