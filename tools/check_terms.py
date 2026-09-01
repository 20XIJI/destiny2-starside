#!/usr/bin/env python3
"""术语与着色的一致性闸门。

站内做过两次人工术语统一，两次都被后来新增的页面冲掉：`fb739f1` 把「装填」全站
改成「填装」，六天后新增的武器框架页又带回 17 处。人工扫一遍管不住下一页，
所以把结论落成闸门。

五条检查，前四条以 TERMS 那一张表为准：

  G1 中文正名   源稿里不许出现禁用写法。
  G2 token 唯一 同一个术语只能落到同一个着色 token 上。渲染色相同的两个 token
                （--el-solar 与 --deb-solar 同值）用眼睛看不出来，只有这里管得住。
  G3 token 有定义 源稿里每个 {token|文字} 都要在 site.css 或该页样式表里有类；
                反过来，site.css 的着色类一次都没被用到即死配置，当场报出。
  G4 更新时间一致 资料页页脚的「更新 YYYY.M.D」与首页卡片上那个必须相等。
  G5 更新日志的类型 只有新增、改动、订正三种，且同一天里每种只能连成一段——
                标签只在段首显形，交错着写会渲出一串空标签。
  G7 色板齐全   配色总览页列的渲染色与着色类，必须与 site.css 现有的逐条相等——
                两个方向都管：改了 :root 的色号忘了改源稿、加了新 token 忘了上页。
                认哪些类算着色类见 tint_classes()：源稿里写得出 {name|…} 的才算，
                外壳与组件的类照样引强调色，但它们写不进源稿，不进色板页。
  G6 该着色的都着了 tools/items.json 里的词、items.py 的 MECH（元素机制名），以及
                下面 TERMS 里定了 token 的术语，正文里出现就得着色；已着色的那些
                token 还必须与库里的归属一致。「骨灰余烬」属烈日、「连锁闪电」属电弧
                是 Bungie 的 manifest 定的，不由人记；着成隔壁元素只差一点色相，
                眼睛查不出来。G2 只管「着错了色」，没着色时它一句话也不说——
                「勇士」「守护者」「能量球」这类档位与拾取物不在 manifest 里，
                曾因此全站漏了八百多处。漏着色跑 python3 tools/items.py --apply 补上。

用法：python3 tools/check_terms.py    改源稿或改术语表之后跑一次。
"""

import os
import re
import sys

import items
import markup
import shell

SRC_FILES = ['references/artifact-mods.md', 'references/armor-sets.md']
DOC_DIR = 'references/docs'

# 一行钉两件事：中文怎么写，以及着色落到哪个 token 上。
#   (正名, 唯一 token 或 None, [禁用写法])
# token 写 None 表示这个词不强制着色，只管中文写法。
TERMS = [
    # ── 中文正名 ──
    ('填装', None, ['装填']),
    # 装备稀有度：紫装在游戏内叫「传说」，与「传说战役」是同一个词
    ('传说', None, ['传奇']),
    ('回复倍率', None, ['技能块']),
    # Exhaust 站内叫「疲惫」。「力竭」指同一个减益——心灵骇入与问题解决者施加的
    # 都是它，两边都写「战斗人员输出伤害降低 25%」，靠这个数认定，不靠字面
    ('疲惫', None, ['力竭']),
    # 站内「特性」一律写 Perk，「起源特性」是唯一的例外：游戏内就叫这个名
    ('起源特性', None, ['源头特性', '起源 Perk']),
    # 「处决」不进禁用表：「优雅处决」是星相里的机制名，与终结技不是一回事
    ('终结技', 'enemy', []),
    ('冰霜护甲', 'el-stasis', ['冰霜铠甲']),
    # 红血是敌人档位的最低一档，照血条颜色叫。「普通战斗人员」在正名之后与它同义
    ('红血', 'bar-red', ['杂兵', '普通士兵', '普通敌人', '普通战斗人员']),
    ('橙血', 'bar-orange', ['精英']),
    # 四档敌人：红血、橙血、初级首领、首领。「黄血」「小头目」是同一档的旧写法
    ('初级首领', 'bar-yellow', ['黄血', '小头目']),
    # 敌人统称用游戏内的官方译名。放在「红血」之后：先认掉「普通敌人」那一组
    # 「敌方」不进禁用表：那是形容词（敌方守护者），不是战斗人员的同义词
    ('战斗人员', 'enemy', ['敌人']),
    # 威能弹药：站内 token 就叫 --ammo-heavy，注释与 design.md 都写「威能弹药」
    ('威能弹药', 'ammo-heavy', ['重型弹药']),
    ('虚弱', 'deb-void', ['削弱']),
    # Jolt：arc.md 里定义的那个连锁闪电减益。「电击」不进禁用表——「闪电击中」
    # 与游戏机制页里敌人的「电击充能」都是同形不同义，钉死会满页误报
    ('震颤', 'deb-arc', ['感电']),
    # 打中弱点叫「精准」。「精密」留给武器框架名（精密框架、精密自动步枪），两者同源
    # 于 Precision，混用会让读者以为框架名与命中判定是一回事
    ('精准命中', 'stack', ['精密命中']),
    ('精准击杀', None, ['精密击杀']),
    # 打在目标本体上的那一份叫「直击」，与溅射／径向相对；「接触」在正文里
    # 还当动词用（接触时引爆、接触点），只有当伤害名讲时才是这一条
    ('直击伤害', None, ['接触伤害']),
    # 三种勇士各自一行：中文早就统一了，钉在这里是为了 token。三个名字同属
    # 战斗人员，着色必须都落到 enemy 上——只钉一个，另两个会在新页面上分叉，
    # 而 --enemy 与相近的几个 token 渲染色接近，眼睛查不出来。
    ('势不可挡勇士', 'enemy', ['不屈勇士']),
    ('过载勇士', 'enemy', ['超载勇士']),
    ('屏障勇士', 'enemy', ['壁垒勇士']),
    # 职业技能名：三处写「特技闪身」、一处写「杂技闪身」，后者是孤例；
    # 「裂缝」三处全指术士的职业技能，不是同名的 PvP 模式
    ('特技闪身', None, ['杂技闪身']),
    ('裂痕', None, ['裂缝']),

    # ── 只管 token，不改中文 ──
    # 下面这些词的着色曾经分叉，两个 token 渲染色又相同或相近，肉眼查不出来
    ('护甲充能', 'armor-charge', []),
    ('焕光', 'el-solar', []),
    ('恢复', 'el-solar', []),
    # 覆盖护盾分两个词：虚空分支的那层是虚空增益，其余来源（职业属性、还治彼身、
    # 无畏护甲）不属于任何元素。两者同色时读者会把无畏护甲当成虚空技能
    ('虚空覆盖护盾', 'el-void', []),
    ('覆盖护盾', 'pickup', []),
    ('不稳定', 'deb-void', []),
    ('压制', 'deb-void', []),
    ('减速', 'deb-stasis', []),
    ('灼烧', 'deb-solar', []),
    ('点燃', 'deb-solar', []),
    ('能量球', 'orb', []),
    ('特殊弹药', 'ammo-special', []),
    ('生命值', 'health', []),
    ('首领', 'bar-yellow', ['头目', 'Boss', 'boss']),
    # 守护者按战斗力对齐橙血那一档；「自己」是玩家一侧的表述层，留在 enemy 色
    ('守护者', 'bar-orange', []),
    ('自己', 'enemy', []),
    ('异域', 'exotic', []),
    ('增益', 'buff', []),
    ('减益', 'debuff', []),

    # ── 按官方 manifest 校过的正名 ──
    # 下面这一批出自 2026.8.30 用 Bungie manifest 的 description_zh 逐条对读，
    # 每条的官方原文写在 ~/Desktop/docs/260830-术语校对清单.html。
    # 站内曾经写的是社区叫法或旧译，官方文本里一次都不出现。
    ('烈焰火苗', None, ['鬼火', '幽灵手雷']),
    ('束缚', None, ['系缚']),
    ('狂啸', None, ['暴风雪']),
    ('击败他们', None, ['击倒']),
    ('速度加成', None, ['速度助推器', '速度增强']),
    ('力量学派', None, ['力量教派']),
    ('洞察学派', None, ['洞察教派']),
    ('活力学派', None, ['活力教派']),
    ('忧愁武器', None, ['悲叹武器']),
    ('太阳黑子', None, ['日斑']),
    ('恢复炮台', None, ['治疗炮台', '治疗炮塔']),
    ('虚空灵魂', None, ['虚空之魂']),
    ('高贵追踪弹', None, ['高尚追踪弹']),
    ('纳米蜂群', None, ['纳米机器人', '水银纳米机器']),
    ('类虫机器人', None, ['昆虫机器人']),
    ('闪烁重击', None, ['瞬移重击']),
    ('遥测规律', None, ['遥测模块']),
    ('压迫能量', None, ['压倒性力量']),
    ('释放力量', None, ['释放能量']),
    ('蜕变圆球', None, ['蜕变球体']),
    ('活性放射体液', None, ['放射虫液', '放射虫池']),
    ('先锋决心', None, ['先锋决绝']),
    ('斥候步枪', None, ['侦察步枪']),
    ('眩晕', None, ['击晕']),
    ('迷失方向', None, ['迷乱']),
    ('风暴怒吼', 'el-stasis', ['冰川咆哮']),
    ('区域拒止', None, ['区域拒绝']),
    # 生命值见底那个状态官方叫「重伤」。站内曾有三种写法，「关键{health|生命值}」
    # 带着标记，纯文本的禁用词对不上，所以连标记一起钉
    ('重伤', None, ['濒死生命值', '危急', '关键{health|生命值}']),
    # 「焦灼」只在烈日减益那个意思上是错的；活动修改器「卡巴尔：焦灼大地」进 KEEP
    ('灼烧', 'deb-solar', ['焦灼']),
    # 「残存」是阿莱索尼姆与荆棘的掉落物，官方作「残余」；流明那把官方作「遗灵」。
    # 虚空碎片「残存回声」是另一件事，进 KEEP
    ('残余', None, ['残存']),

    # ── 副本、活动与人物：官方名取自 manifest 的 source_zh 与 activities 表 ──
    ('玻璃拱顶', None, ['玻璃宝库']),
    ('救赎的边缘', None, ['救赎边缘']),
    ('众神殿', None, ['万神殿']),
    ('幽梦之城', None, ['梦城']),
    ('铁旗', None, ['铁骑']),
    ('赛雀联赛', None, ['快雀竞赛', '快雀竞速']),
    ('忧伤祭坛', None, ['月球祭坛']),
    ('异端深渊', None, ['异端深坑']),
    ('永恒沙漠（史诗）', None, ['史诗沙漠']),
    ('至日', None, ['高塔二至点']),
    ('守护者游戏', None, ['高塔运动会']),
    ('克洛塔的末日', None, ['克洛塔末日']),
    # Xûr 的官方中文名。「老九」是社区叫法
    ('仄', None, ['老九']),
]

# 游戏内的专有名词，字面撞上禁用写法时按原名放行。整条短语落在里面才算数，
# 「削弱」单用照旧报错。
KEEP = ['削弱清敌', 'Destiny 2: Boss Damage', '吞食裂缝',
        '卡巴尔：焦灼大地', '残存回声', '结晶残花',
        # 官方物品表里的护甲模组名（tools/mod-variants.json）。配装源稿的槽位行
        # 必须逐字写它才查得到，正名那条规矩管的是散文，不管物品的专名。
        '重型弹药搜寻者', '重型弹药斥候']


def read(path):
    with open(os.path.join(shell.ROOT, path), encoding='utf-8') as f:
        return f.read()


def classes_in(css):
    """样式表里真正下了规则的 class。**先剥注释**：注释里提到的类名不是定义，
    带着它比对会让「{token|…} 有没有对应的类」这条闸门放行没有规则的标记——
    site.css 有一段注释拿 .amp 举例，武器框架页的 {amp|∞} 就是这么漏过去的。"""
    return set(re.findall(r'\.([a-zA-Z][\w-]*)', re.sub(r'/\*.*?\*/', '', css, flags=re.S)))


def tint_classes(css):
    """单类规则里设了 color: var(…) 的那些 → (它引的 token, 规则体是否只有这一条)。
    判据只此一处，G3 与 G7 共用，两条各取所需的那一半。

    **「规则体只有 color」不等于「是着色类」，两件事都要。**只负责染色、别的什么
    都不做的规则一定是个 token（G3 据此认出没人用的死配置）；但真 token 也可以
    多写一行版式——.note 带 font-weight、.unsure 带虚下划线——所以 G7 不能只认
    这一种，它另按「源稿里被写成过 {name|…}」来认。反过来，外壳与组件的类照样
    引强调色（首屏那枚发电能量核 .pledge 静置就是 var(--accent)），它们写不进
    源稿，因此不进色板页。

    选择器之间只认逗号，不认空格——.site-nav .sep 那种后代选择器不是着色类。
    **先剥注释**，注释里的示例规则不是定义。"""
    out = {}
    plain = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for m in re.finditer(r'(?:^|\n)((?:\.[\w-]+,\s*)*\.[\w-]+)\s*\{([^}]*)\}', plain):
        hit = re.search(r'color:\s*var\(--([\w-]+)\)', m.group(2))
        if not hit:
            continue
        sole = not re.sub(r'color:\s*var\(--[\w-]+\);?', '', m.group(2)).strip()
        for cls in re.findall(r'\.([\w-]+)', m.group(1)):
            out[cls] = (hit.group(1), sole)
    return out


def sources():
    """[(源稿相对路径, 该页能用的 class 集合)]。"""
    site = read('assets/site.css')
    base = classes_in(site)
    out = [('references/artifact-mods.md', base | classes_in(read('artifact-mods/style.css')))]
    for name in sorted(os.listdir(os.path.join(shell.ROOT, DOC_DIR))):
        if not name.endswith('.md'):
            continue
        rel = '%s/%s' % (DOC_DIR, name)
        md = read(rel)
        where = re.search(r'^路径：(.*)$', md, re.M)
        where = where.group(1).strip() if where else name[:-3]
        ok = set(base)
        parts = where.split('/')
        for i in range(len(parts)):
            sheet = os.path.join(*parts[:i + 1], 'style.css')
            if os.path.exists(os.path.join(shell.ROOT, sheet)):
                ok |= classes_in(read(sheet))
        out.append((rel, ok))
    # 配装源稿：注解那一段是散文，中文正名与着色 token 照样要守。**不进 G6 正查**
    # ——配装正文几乎全是物品名（「碎片：保护琢面、黎明琢面」），正查会要求给每一个
    # 都套 {token|}，而它们本该由查表变成带图标的链接，源稿不写颜色。
    build_ok = base | classes_in(read('builds/style.css'))
    for season in sorted(os.listdir(shell.BUILD_DIR)):
        d = os.path.join(shell.BUILD_DIR, season)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith('.md'):
                out.append(('references/builds/%s/%s' % (season, name), build_ok))
    return out



def at_line(text, at):
    return text.count('\n', 0, at) + 1


def check_terms(files, bad):
    banned = [(w, t[0]) for t in TERMS for w in t[2]]
    for rel in files:
        md = read(rel)
        keep = [(m.start(), m.end()) for k in KEEP for m in re.finditer(re.escape(k), md)]
        # 链接目标不是正文，站内路径用的是 ASCII slug（../boss-hp/index.html），
        # 字面撞上禁用写法与译名无关。只放行括号里那一段，链接文字照常受检。
        keep += [(m.start(1), m.end(1)) for m in re.finditer(r'\]\(([^)]*)\)', md)]
        for wrong, right in banned:
            for m in re.finditer(re.escape(wrong), md):
                if any(a <= m.start() and m.end() <= b for a, b in keep):
                    continue
                bad.append('G1 %s:%d 用了「%s」，正名是「%s」'
                           % (rel, at_line(md, m.start()), wrong, right))
        for word, token, _ in TERMS:
            if not token:
                continue
            for m in re.finditer(re.escape(word), md):
                hit = markup.inner_marker(md, m.start())
                # 只管「整个标记就是这个词」的那种。词嵌在更长的短语里时，
                # 着色属于短语（{el-arc|电弧元素能量球}、{health|治疗能量球}），
                # 按词强判会把整句的颜色拆碎。
                if hit and hit[1] == word and hit[0] != token:
                    bad.append('G2 %s:%d 「%s」着色成 {%s|…}，应是 {%s|…}'
                               % (rel, at_line(md, m.start()), word, hit[0], token))


def check_tokens(pairs, site, bad):
    used = set()
    for rel, ok in pairs:
        md = read(rel)
        for m in re.finditer(r'\{([\w-]+)\|', md):
            used.add(m.group(1))
            if m.group(1) not in ok:
                bad.append('G3 %s:%d 用了 {%s|…}，样式表里没有这个类'
                           % (rel, at_line(md, m.start()), m.group(1)))
    # 护甲套装页走词表，token 写在生成器里
    used |= set(re.findall(r"\('[^']+', '([\w-]+)'\)", read('tools/convert-armor-sets.py')))
    # 只负责染色、别的什么都不做的单类规则一定是个 token；没人用就是死配置。
    for cls, (_, sole) in tint_classes(site).items():
        if sole and cls not in used:
            bad.append('G3 assets/site.css 的 .%s 一次都没被用到，删掉或改写' % cls)
    return used


def check_stamps(bad):
    home = read('index.html')
    for m in re.finditer(r'<a class="entry" href="([^"]+)".*?entry-stamp">更新 ([\d.]+)<', home, re.S):
        page, want = m.group(1), m.group(2)
        got = re.search(r'<span class="stamp">更新 ([\d.]+)</span>', read(page))
        if not got:
            bad.append('G4 %s 页脚没有更新时间' % page)
        elif got.group(1) != want:
            bad.append('G4 %s 页脚写 %s，首页卡片写 %s' % (page, got.group(1), want))


# G6 管得住的 token：元素归属与异域稀有度这两样库里是事实。别的不归它管——
# {named|冥府三头犬 +1} 里的 named 是排版标记不是着色，强判会满页误报；
# 神器模组的元素归属库里没有（typeName_zh 一律是「传说 神器特性」），
# 神器模组页按各自的元素给了 12 处更细的着色，钉死反而是降级。
# 元素机制名的归属同样是事实（取自各元素分支页的效果表），一并纳入反查——
# 「冻结」着成 el-stasis 与 deb-stasis 渲染色相同，只有这里管得住。
MANAGED = set(items.EL.values()) | {'exotic'} | set(items.MECH.values())


def check_items(files, bad):
    # 反查：已着色的对不对
    terms, _ = items.load()
    for rel in files:
        md = read(rel)
        # 只认「整个标记就是这个词」的那种，与 G2 同一条道理：词嵌在更长的短语里
        # 时着色属于短语，按词强判会把整句的颜色拆碎。
        for m in re.finditer(r'\{([\w-]+)\|([^{}|]+)\}', md):
            token, text = m.group(1), m.group(2)
            if token not in MANAGED:
                continue
            want = terms.get(items.norm(text))
            if want and want[0] in MANAGED and want[0] != token:
                bad.append('G6 %s:%d 「%s」着色成 {%s|…}，官方物品表说它是%s，应是 {%s|…}'
                           % (rel, at_line(md, m.start()), text, token, want[1], want[0]))

    # 正查：表里的词出现了就得着色。新写的一页里提到「骨灰余烬」却留着素色，
    # 这一条当场报出——不必记得回去跑一趟 --suggest。
    for rel, line, _, _, word in items.scan():
        bad.append('G6 %s:%d 「%s」没着色，应是 {%s|%s}；跑 '
                   'python3 tools/items.py --apply 落进去'
                   % (rel, line, word, terms[word][0], word))


ACTS = ('新增', '改动', '订正')       # 顺序即同一天之内的排法


def check_acts(bad):
    """更新日志：改动类型只有三种，且同一天里每种连成一段。

    段首之外的标签由 convert-doc.py 打上 is-same、样式表收掉，靠的就是「同类型相邻」
    这一条。交错着写会在中间渲出空标签，页面上是一行没有类型的改动——眼睛查不出来。
    """
    path = os.path.join(DOC_DIR, 'changelog.md')
    seen, prev = set(), None
    for n, line in enumerate(read(path).split('\n'), start=1):
        if line.startswith('## '):          # 换一天，重新开始数
            seen, prev = set(), None
            continue
        hit = re.match(r'- \{act\|([^}]*)\}', line)
        if not line.startswith('- ') or not hit:
            if line.startswith('- '):
                bad.append('G5 %s:%d 这一条没以 {act|类型} 开头' % (path, n))
            continue
        act = hit.group(1)
        if act not in ACTS:
            bad.append('G5 %s:%d 写了「%s」，类型只有%s'
                       % (path, n, act, '、'.join(ACTS)))
        elif act != prev and act in seen:
            bad.append('G5 %s:%d 「%s」在这一天里断开了，同类型的几条要连成一段'
                       % (path, n, act))
        seen.add(act)
        prev = act


PALETTE = os.path.join(DOC_DIR, 'palette.md')


def palette_of(site, used):
    """site.css 现有的 (渲染色 → 色号, 着色类 → 渲染色)。判据现取，不硬编码名单：
    着色类由 tint_classes() 认，再按 used 收一道——源稿里写得出 {name|…} 的才算，
    外壳与组件的类因此落在外面。语义 token 在这里顺着 :root 的 var 链解到渲染色，
    解不到 --c-* 的（外壳那些骨白灰阶）同样落在外面。"""
    root = site.split(':root {', 1)[1].split('\n}', 1)[0]
    hexes = dict(re.findall(r'--(c-[\w-]+):\s*(#[0-9a-f]{3,8})\s*;', root))
    links = dict(re.findall(r'--([\w-]+):\s*var\(--([\w-]+)\)\s*;', root))
    classes = {}
    for cls, (token, _) in tint_classes(site).items():
        base = links.get(token, token)
        if cls in used and base in hexes:
            classes[cls] = base
    return hexes, classes


def check_palette(site, used, bad):
    # 页面专属那一节的类定义在各页样式表里，不归 site.css 管，比对到那里为止。
    md = read(PALETTE).split('## 页面专属')[0]
    want_hex, want_cls = palette_of(site, used)
    got_hex = dict(re.findall(r'^\| --(c-[\w-]+) \| (#[0-9a-f]{3,8}) \|', md, re.M))
    got_cls = dict(re.findall(r'^\| \{([\w-]+)\|[^}]*\} \| --(c-[\w-]+) \|', md, re.M))
    for name, want, got in (('渲染色', want_hex, got_hex), ('着色类', want_cls, got_cls)):
        for key in sorted(set(want) | set(got)):
            if key not in got:
                bad.append('G7 %s 少了%s %s（site.css 里是 %s）' % (PALETTE, name, key, want[key]))
            elif key not in want:
                bad.append('G7 %s 多出%s %s，site.css 里没有' % (PALETTE, name, key))
            elif want[key] != got[key]:
                bad.append('G7 %s %s %s 写的是 %s，site.css 里是 %s'
                           % (PALETTE, name, key, got[key], want[key]))


def main() -> int:
    site = read('assets/site.css')
    pairs = sources()
    bad: list[str] = []

    check_terms(SRC_FILES + [rel for rel, _ in pairs
                             if rel.startswith((DOC_DIR, 'references/builds/'))], bad)
    used = check_tokens(pairs, site, bad)
    check_stamps(bad)
    check_acts(bad)
    check_palette(site, used, bad)
    check_items(SRC_FILES + [rel for rel, _ in pairs if rel.startswith(DOC_DIR)], bad)

    if bad:
        print('术语与着色不一致：', file=sys.stderr)
        for line in bad[:60]:
            print('  ' + line, file=sys.stderr)
        if len(bad) > 60:
            print('  …另有 %d 条' % (len(bad) - 60), file=sys.stderr)
        return 1
    print('术语一致：%d 条规则，%d 篇源稿' % (len(TERMS), len(pairs) + 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
