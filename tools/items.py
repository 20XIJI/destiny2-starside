#!/usr/bin/env python3
"""官方物品表 → 站内术语表：着色该落在哪个 token 上，由查表定，不由人判断。

Bungie 的 manifest 导出里 `typeName_zh` 已经按元素给技能分好类（「烈日碎片」
「电弧星相」「缚丝手雷」），`tierName_zh` 分好稀有度。三桶蒸馏进 tools/items.json：

  元素   碎片／星相／手雷／近战／超能  → el-arc … el-prismatic
  异域   异域稀有度的武器与护甲        → exotic
  神器   typeName_zh 为「传说 神器特性」→ art-perk

两个消费者：

  --suggest   列出源稿里还没着色的裸出现与建议标记，只打印不改文件。
              全自动铺色不可行——库里 6738 个模组名与中文常用词大量同形
              （充能 618 次、爆炸 413 次、霰弹枪 65 次都是物品名），
              按词表铺开会把正文里的普通动词染成专名。所以出建议交人裁决。
  check_terms.py 的 G6  已着色的术语，token 必须与库里的归属一致。
              --el-solar 与 --deb-solar 渲染色相同，着成哪个眼睛查不出来。

原始导出 49 MB，不入库；改赛季重抽时跑一次 --distill。

用法：
    python3 tools/items.py --distill ~/Downloads/MISC/items-full.json
    python3 tools/items.py --suggest [slug]
    python3 tools/items.py --apply   [slug]
"""

import json
import os
import re
import sys

import markup
import shell

OUT = 'tools/items.json'
PERKS = 'tools/perks.json'
DOC_DIR = 'references/docs'

EL = {'电弧': 'el-arc', '烈日': 'el-solar', '虚空': 'el-void',
      '缚丝': 'el-strand', '冰影': 'el-stasis', '棱镜': 'el-prismatic'}
KINDS = ('碎片', '星相', '手雷', '近战', '超能')

# 三桶在库里的条数。这是库侧的事实，与下面的 STOP／同名冲突无关——
# 那两样是站内判断，剔掉之后剩多少不该拿来当闸门。改了判据要同步改这里。
N_EL, N_EXOTIC, N_ARTPERK = 230, 282, 198

# 与中文常用词同形的物品名。留在表里会把正文里的普通动词染成专名，
# 每条都按实测的出现次数与用法裁定过，不是按词长一刀切。
STOP = {
    # 电弧星相「重击」只占 6 处（已手工着好），另外 68 处是刀剑与偃月的重击：
    # 「轻-轻-重击连招」「空中重击 ｜ 消耗 8% 超能能量」。
    '重击',
    # 同名神器模组，但站内 27 处讲的全是榴弹发射器那条属性（+40 爆炸范围）。
    '爆炸范围',
    # 异域斥候步枪，但 crafting 页的来源列有「任务同调」——那是任务名不是枪。
    '同调',
    # 神器模组，但「动量转移」「棱镜转移」是更长的名字，还有一处当动词用。
    '转移',
    # 烈日增益「恢复」已手工着好 65 处；另外 99 处是动词与武器属性：
    # 「开火恢复延迟」「射速恢复延迟」「恢复 140 生命值」「+100 恢复」。
    '恢复',
    # 异域 Perk，但正文里 23 处无一是它：光芒复仇、凯德的复仇、普莱蒂斯的复仇
    # 都是更长的武器名。长名单会随新武器变长，整词不入表比逐个 GUARD 稳。
    '复仇',
    # 异域 Perk「命运眷顾」的短名，但正文里的「命运」全是别的：命运终结者、
    # 命运的逆转（传说 Perk），以及游戏本身（「命运 2 购物清单」）。
    '命运',
    # 既是克洛塔的末日那件起源特性，也是邪魔族的战斗人员名。同名撞两桶，
    # 不按名字铺色：购物清单的起源特性列照旧写 {perk|…}，正文里各按上下文判。
    '诅咒怨魂',
    # 异域头盔的 Perk 名，也是神器模组施加的那个状态（刀剑那条）。两处各按
    # 上下文着色：exotic-armor 页写 {exotic|…}，神器模组页跟着刀剑走动能。
    '迷惑',
}

# 元素机制名：增益、减益与拾取物。它们不在 Bungie 的物品表里（那张表只有装备与
# 模组的名字），但在正文里与碎片、星相同样是专名，同样按元素编码着色。手写在这里，
# 与 items.json 合表，共用 --suggest／--apply 的跳过规则与 G6 的反查。
# 归属取自各元素分支页的效果表，一行一个效果，token 与 check_terms.py 的 TERMS 对齐。
MECH = {
    # 七个元素名本身。库里没有（manifest 那张表只有装备与模组的名字），
    # 但正文里「缚丝和虚空」与碎片、星相一样是专名，同样按元素编码着色。
    '电弧': 'el-arc', '烈日': 'el-solar', '虚空': 'el-void', '缚丝': 'el-strand',
    '冰影': 'el-stasis', '棱镜': 'el-prismatic', '动能': 'el-kinetic',
    '增幅': 'el-arc', '电光充能': 'el-arc', '离子轨迹': 'el-arc',
    '致盲': 'deb-arc', '震颤': 'deb-arc',
    '治愈': 'el-solar', '焕光': 'el-solar', '恢复': 'el-solar', '焰灵': 'el-solar',
    '灼烧': 'deb-solar', '点燃': 'deb-solar',
    '吞食': 'el-void', '隐身': 'el-void', '虚空覆盖护盾': 'el-void', '虚空裂口': 'el-void',
    '压制': 'deb-void', '不稳定': 'deb-void', '虚弱': 'deb-void',
    '冰霜护甲': 'el-stasis', '冰影碎片': 'el-stasis',
    '减速': 'deb-stasis', '冻结': 'deb-stasis', '碎裂': 'deb-stasis',
    '织造铠甲': 'el-strand', '缠结': 'el-strand',
    '割裂': 'deb-strand', '悬停': 'deb-strand', '瓦解': 'deb-strand',
    '超凡': 'el-prismatic',
}


# 库里的名字与游戏内写法不一致时在这里改正，改的是表的键。
NAME_FIX = {
    'D.A.R.C.I': 'D.A.R.C.I.',    # 库里漏了词尾那一点
}


# 更长的专名：这几段文字整体屏蔽，里面的短词不再单独命中。与 STOP 的区别是
# 它不牺牲那个词本身——「千语」照常着色，只有「千语魅痕」（首领名）里的不算。
# TERMS 里定了 token、但不强制正查的词：同形的普通用法比术语用法还多，
# 铺开会把动词染成机制名。token 仍然留着，G2 照旧管「着错了色」。
LOOSE = {
    '恢复',        # 「恢复生命值」「恢复延迟」多数是动词，不是烈日的恢复
}

GUARD = [
    '千语魅痕',    # 最后遗愿的首领，不是异域融合步枪「千语」
    '冻结计时',    # 限热器把计时冻住，不是冰影的冻结
    '层数冻结',    # 日焰熔炉的层数不增不减，不是冰影的冻结
    '治愈裂痕',    # 术士的职业技能，不是烈日的治愈
    '迷惑爆发',    # weapon-perks 的传说 Perk，不是异域头盔那个「迷惑」
    '守护者游戏',  # 每年的活动名，不是战斗人员档位里的守护者
    '动能震颤',    # 武器 Perk，不是电弧的震颤
    '震颤反馈',    # 武器 Perk，同上
    '不稳定弹药',  # 武器 Perk，不是虚空的不稳定
    '势不可挡射击',  # 勇士机制的硬直射击，不是偃月那个同名 Perk
]


def pattern(word):
    """表里的名字 → 匹配式：中英之间允许有那个排版空格。

    表的键是归一化过的（库里就没有空格），源稿按 design.md 三节在汉字与拉丁
    之间补一个空格（半角或不折行空格）。拿键去字面匹配，「Vex 揭秘者」这类
    中英混排的名字一个都对不上——12 个名字曾经这么整批漏掉。
    """
    return re.sub(r'(?<=[一-鿿])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[一-鿿])',
                  '[ \u00a0]?', re.escape(word))


def norm(s):
    """比对前归一化：去中英之间的排版空格，去站内自加的消歧后缀。

    源稿按 design.md 三节在汉字与拉丁之间补空格（Vex 揭秘者），库里没有；
    同名的几件东西站内加括号区分（故我在（电弧元素）、精密框架（手炮）），
    库里是同一个名字。两条都归一化掉才对得上。
    """
    s = re.sub(r'[（(][^）)]*[）)]$', '', s)
    s = re.sub(r'(?<=[一-鿿])\s+(?=[A-Za-z0-9])'
               r'|(?<=[A-Za-z0-9])\s+(?=[一-鿿])', '', s)
    return s.strip()


# ── 蒸馏 ──────────────────────────────────────────────────────────────


def bucket(item):
    """一件物品落在哪个桶里，返回 (token, 分类名)；不属于三桶即 None。"""
    tn = (item.get('typeName_zh') or '').strip()
    if not tn:
        return None
    if tn == '传说 神器特性':
        return 'art-perk', tn
    for el, token in EL.items():
        if tn.startswith(el):
            for k in KINDS:
                if k in tn:
                    return token, tn
            return None
    cats = set(item.get('categories_zh') or [])
    if item.get('tierName_zh') == '异域' and ({'武器', '护甲'} & cats):
        return 'exotic', tn
    return None


def distill(src):
    with open(src, encoding='utf-8') as f:
        items = json.load(f)['items']

    # {名字: {token: {分类名}}}。同一个名字在库里可能出现好几件（同名的不同
    # 版本、光能与暗影两套写法），token 相同即同一条术语，分类名合并起来展示。
    seen: dict[str, dict[str, set]] = {}
    for item in items.values():
        name = norm((item.get('name_zh') or '').strip())
        if len(name) < 2:
            continue
        hit = bucket(item)
        if hit:
            name = NAME_FIX.get(name, name)
            seen.setdefault(name, {}).setdefault(hit[0], set()).add(hit[1])

    counts = {'el': 0, 'exotic': 0, 'art-perk': 0}
    for kinds in seen.values():
        for token in kinds:
            counts['exotic' if token == 'exotic' else
                   'art-perk' if token == 'art-perk' else 'el'] += 1
    markup.eq('元素术语', counts['el'], N_EL)
    markup.eq('异域装备', counts['exotic'], N_EXOTIC)
    markup.eq('神器模组', counts['art-perk'], N_ARTPERK)

    terms, skipped = {}, {}
    for name, kinds in seen.items():
        label = ' / '.join(sorted(k for ks in kinds.values() for k in ks))
        if name in STOP:
            skipped[name] = '停用词：' + label
        elif len(kinds) > 1:
            # 同名撞两个桶（堡垒既是虚空星相又是异域融合步枪）。着哪个色是
            # 逐处判断，不能按名字定，所以整条剔出去交人裁决。
            skipped[name] = '同名冲突：' + label
        else:
            terms[name] = [next(iter(kinds)), label]

    # 一条记录一行：这份文件随赛季重生成并入库，按行写让 git 存得下增量。
    body = ',\n'.join('  %s: %s' % (json.dumps(k, ensure_ascii=False),
                                    json.dumps(v, ensure_ascii=False))
                      for k, v in sorted(terms.items()))
    skip = ',\n'.join('  %s: %s' % (json.dumps(k, ensure_ascii=False),
                                    json.dumps(v, ensure_ascii=False))
                      for k, v in sorted(skipped.items()))
    with open(os.path.join(shell.ROOT, OUT), 'w', encoding='utf-8') as f:
        f.write('{\n "terms": {\n%s\n },\n "skipped": {\n%s\n }\n}\n' % (body, skip))

    print('%s：库里 %d 条（元素 %d、异域 %d、神器 %d），入表 %d 条，剔出 %d 条'
          % (OUT, sum(counts.values()), counts['el'], counts['exotic'],
             counts['art-perk'], len(terms), len(skipped)))
    for name, why in sorted(skipped.items()):
        print('  剔出 %s —— %s' % (name, why))


# ── 读表 ──────────────────────────────────────────────────────────────


# 异域装备的专属 Perk 名。这一类的真相不在 Bungie 的物品表里——manifest 那边
# perk 属于 sandbox 条目，typeName 分不出「异域装备自带」与别的特性。真相在
# exotic-armor / exotic-weapon 两页的 PERK 列上，所以现扫那两页，不另存副本。
# 着 exotic 而不是 perk：site.css 的 --c-exotic 注释写着「专属 Perk 名同族」，
# 两者渲染色相同，而 {perk|…} 按 CLAUDE.md 是整格排版标记，不是行内着色 token。
PERK_DOCS = ('exotic-armor.md', 'exotic-weapon.md')
PERK_RE = re.compile(r'\{perk\|!\[\]\([^)]*\)\\\\([^}|]*)\}')


def perks():
    """两页 PERK 列上的专属 Perk 名。"""
    out = set()
    for name in PERK_DOCS:
        path = os.path.join(shell.ROOT, DOC_DIR, name)
        with open(path, encoding='utf-8') as f:
            for mo in PERK_RE.finditer(f.read()):
                out.add(norm(mo.group(1)))
    return out


# 武器 Perk 名的词表：两个来源现扫，落成 tools/perks.json。
#   武器 PERK 详解页的行标题     —— 站内那 400 多条 Perk 的正名
#   购物清单四页的 Perk 名列     —— 枪管、弹匣、起源特性这些不在上一份里的名字
# 换赛季或加了新 Perk 时跑一次 --perks 重生成。
PERK_SRC = 'weapon-perks.md'
# 只收这四节。固有 PERK 那一节列的是框架（重型点射、支援框架），偃月与刀剑那两节
# 列的是机制与属性（充能效率、防御抗性）——它们在正文里是框架名与数值，不是 Perk 名。
PERK_SECTS = ('武器 PERK', '武器模组', '重型弩机制', '起源特性')
PERK_PAGES = ('shopping-primary.md', 'shopping-special.md',
              'shopping-heavy.md', 'shopping-other.md')
PERK_CELL = re.compile(r'\{perk\|([^{}]*)\}')

# 两字的 Perk 名一律不入表：转向、战术、切割、瓦解、医治这些在正文里绝大多数是
# 普通词或元素机制名，按词铺开会把动词染成 Perk 名。三字以上才收。
PERK_MIN = 3


def distill_perks():
    """两个来源 → tools/perks.json。"""
    names = set()
    path = os.path.join(shell.ROOT, DOC_DIR, PERK_SRC)
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    sect = None
    for i, line in enumerate(lines):
        if line.startswith('## '):
            sect = line[3:].strip()
        if sect not in PERK_SECTS:
            continue
        if not line.startswith('|') or RULE_LINE.match(line.strip()):
            continue
        if i + 1 < len(lines) and RULE_LINE.match(lines[i + 1].strip()):
            continue                      # 表头行写的是列名
        cell = line[1:row_title_end(line)].rstrip('|')
        name = norm(re.sub(r'\{[\w-]+\|', '', cell).replace('}', '').strip())
        if len(name) >= PERK_MIN:
            names.add(name)
    for page in PERK_PAGES:
        path = os.path.join(shell.ROOT, DOC_DIR, page)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for mo in PERK_CELL.finditer(f.read()):
                name = norm(mo.group(1).replace('~~', '').strip())
                if len(name) >= PERK_MIN:
                    names.add(name)
    names = sorted(n for n in names if n not in STOP and '|' not in n)
    with open(os.path.join(shell.ROOT, PERKS), 'w', encoding='utf-8') as f:
        f.write('[\n%s\n]\n' % ',\n'.join('  ' + json.dumps(n, ensure_ascii=False)
                                            for n in names))
    print('%s —— %d 条 Perk 名（来源：%s 与购物清单四页的 Perk 列）'
          % (PERKS, len(names), PERK_SRC))


def perk_names():
    path = os.path.join(shell.ROOT, PERKS)
    if not os.path.exists(path):
        markup.die('%s 不存在，先跑 python3 tools/items.py --perks' % PERKS)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load():
    """{名字: (token, 分类名)}。check_terms.py 的 G6 与 --suggest 共用这一份。"""
    path = os.path.join(shell.ROOT, OUT)
    if not os.path.exists(path):
        markup.die('%s 不存在，先跑 python3 tools/items.py --distill <导出.json>' % OUT)
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    terms = {k: tuple(v) for k, v in data['terms'].items()}
    # 库里没有的元素机制名。库侧的名字优先——同形时那是装备名，更具体。
    for word, token in MECH.items():
        if word not in STOP:
            terms.setdefault(word, (token, '元素机制'))
    # 异域装备的专属 Perk 名，来源见 perks()。库侧优先——同形时那是装备名，更具体。
    for word in perks():
        if word not in STOP:
            terms.setdefault(word, ('exotic', '异域 Perk'))
    # 武器 Perk 名。放在库侧与异域 Perk 之后：同形时那两样更具体（「堡垒」是异域
    # 融合步枪，不是同名的 Perk），Perk 只补上没人认领的那些。
    for word in perk_names():
        if word not in STOP:
            terms.setdefault(word, ('perk', '武器 Perk'))
    # 站内术语表里定了 token 的那些，走同一条正查——「勇士」「守护者」「能量球」
    # 这类档位与拾取物不在 Bungie 的 manifest 里，此前没有任何一条闸门要求它们着色，
    # 全站因此漏了八百多处。放在这里而不是另起一条闸门：正查只有一个实现。
    # 延迟导入：check_terms 在模块级导入 items，反过来在模块级导入会成环。
    import check_terms
    for word, token, _ in check_terms.TERMS:
        if token and word not in STOP and word not in LOOSE:
            terms.setdefault(word, (token, '站内术语'))
    return terms, data['skipped']


# ── 建议清单 ──────────────────────────────────────────────────────────


def row_title_end(line):
    """表格行首格里「行的身份」那一段在这一行的结束位置；不是表格行就是 0。

    行标题已经有结构身份（<th scope="row">），不必再着色。但只算到格内换行
    `\\` 为止——切枪 DPS 页的首格写成「**隐秘追猎**\\凯德的复仇、星界夜鹰」，
    `\\` 之后列的是配装件，那是内容不是身份，照常参与着色。
    """
    if not line.startswith('|'):
        return 0
    nxt = line.find('|', 1)
    if nxt < 0:
        return 0
    # 首格留空即向上合并（CLAUDE.md 的源稿方言），这一行的身份在第二格。
    if not line[1:nxt].strip():
        nxt = line.find('|', nxt + 1)
        if nxt < 0:
            return 0
    brk = line.find('\\\\', 1)
    return brk if 0 < brk < nxt else nxt + 1


def pages(slug=None):
    for name in sorted(os.listdir(os.path.join(shell.ROOT, DOC_DIR))):
        # 更新日志是日志不是资料：它的条目名指向别的页面，句式与字数另有约定
        # （CLAUDE.md「文案七条」），不跟着全站铺色。
        # 配色总览是站务页，正文里的术语是在讲颜色不是在讲机制。
        if not name.endswith('.md') or name in ('changelog.md', 'palette.md'):
            continue
        if slug and name != slug + '.md':
            continue
        yield '%s/%s' % (DOC_DIR, name)


# 头部的「键：值」与分节里的结构行（色阶、列组、卡片、攻略、轮换）不是正文：
# 描述那一行会原样进 meta description，色阶与列组里写的是列名，着色进去即写坏结构。
KEY_LINE = re.compile(r'^[\u4e00-\u9fff]{1,6}(（[^）]*）)?：')

# 分隔行；它上面那一行是表头。表头写的是列名，不是正文，不着色。
RULE_LINE = re.compile(r'^\|[-| ]+\|$')


def head_rows(lines):
    """表头行的下标集合。列名与标题同属「标签」，与行标题一样已有结构身份。"""
    return {i - 1 for i, line in enumerate(lines) if RULE_LINE.match(line.strip()) and i}


def hits_in(line, terms, names):
    """这一行里该着色的裸出现，[(起, 止, 词)]，按位置倒序——就地替换从后往前改。

    六处跳过：标题行与行标题那一格（已有结构身份）、链接目标与图片路径（不是正文）、
    GUARD 里那些更长的专名、已经在某个 {token|…} 里面的（别人已经判过了）。
    表头行由调用方按 head_rows() 排除——那要看下一行是不是分隔行，一行看不出来。
    表里的词长词在前，先认长的。
    """
    if KEY_LINE.match(line) or line.startswith('#'):
        return []
    head = row_title_end(line)
    taken = [False] * len(line)
    for m in re.finditer(r'\]\([^)]*\)', line):
        for i in range(m.start(), m.end()):
            taken[i] = True
    for g in GUARD:                       # 更长的专名整段屏蔽
        for m in re.finditer(re.escape(g), line):
            for i in range(m.start(), m.end()):
                taken[i] = True
    out = []
    for word in names:
        for m in re.finditer(pattern(word), line):
            if m.start() < head or any(taken[m.start():m.end()]):
                continue
            if markup.inner_marker(line, m.start()):
                continue
            for i in range(m.start(), m.end()):
                taken[i] = True
            out.append((m.start(), m.end(), word))
    return sorted(out, reverse=True)


def scan(slug=None):
    """[(源稿路径, 行号, 起, 止, 词)]，按源稿顺序。"""
    terms, _ = load()
    names = sorted(terms, key=len, reverse=True)
    out = []
    for rel in pages(slug):
        with open(os.path.join(shell.ROOT, rel), encoding='utf-8') as f:
            lines = f.read().split('\n')
        skip = head_rows(lines)
        for n, line in enumerate(lines, start=1):
            if n - 1 in skip:
                continue
            for a, b, word in reversed(hits_in(line, terms, names)):
                out.append((rel, n, a, b, word))
    return out


def suggest(slug=None):
    terms, _ = load()
    found = scan(slug)
    for rel in pages(slug):
        rows = [h for h in found if h[0] == rel]
        if not rows:
            continue
        print('\n%s —— %d 处' % (rel, len(rows)))
        lines = open(os.path.join(shell.ROOT, rel), encoding='utf-8').read().split('\n')
        for _, n, a, b, word in rows:
            token, kind = terms[word]
            text = lines[n - 1][a:b]
            print('  L%-5d %-14s → {%s|%s}  (%s)' % (n, text, token, text, kind))
    print('\n合计 %d 处待着色。--apply 落进源稿，再跑 npm run build。' % len(found))


def apply(slug=None):
    """把建议就地落进源稿。可重复跑——已经着色的那些下一趟自然跳过。"""
    terms, _ = load()
    names = sorted(terms, key=len, reverse=True)
    total = 0
    for rel in pages(slug):
        path = os.path.join(shell.ROOT, rel)
        with open(path, encoding='utf-8') as f:
            lines = f.read().split('\n')
        n = 0
        skip = head_rows(lines)
        for i, line in enumerate(lines):
            if i in skip:
                continue
            for a, b, word in hits_in(line, terms, names):   # 倒序，前面的位置不动
                # 包的是源稿原文而不是表的键：键归一化过，直接写回会吃掉
                # 「Vex 揭秘者」中英之间那个排版空格。
                line = line[:a] + '{%s|%s}' % (terms[word][0], line[a:b]) + line[b:]
                n += 1
            lines[i] = line
        if n:
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            print('%s —— 落了 %d 处' % (rel, n))
            total += n
    print('合计 %d 处。跑 npm run build，再看 git diff。' % total)


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ['--distill'] and len(args) == 2:
        distill(os.path.expanduser(args[1]))
    elif args == ['--perks']:
        distill_perks()
    elif args[:1] in (['--suggest'], ['--apply']) and len(args) <= 2:
        (suggest if args[0] == '--suggest' else apply)(
            args[1] if len(args) == 2 else None)
    else:
        print('用法：\n'
              '    python3 tools/items.py --distill <items-full.json>\n'
              '    python3 tools/items.py --perks\n'
              '    python3 tools/items.py --suggest [slug]\n'
              '    python3 tools/items.py --apply   [slug]', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
