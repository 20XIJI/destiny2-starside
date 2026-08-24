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
}

# 库里的名字与游戏内写法不一致时在这里改正，改的是表的键。
NAME_FIX = {
    'D.A.R.C.I': 'D.A.R.C.I.',    # 库里漏了词尾那一点
}


# 更长的专名：这几段文字整体屏蔽，里面的短词不再单独命中。与 STOP 的区别是
# 它不牺牲那个词本身——「千语」照常着色，只有「千语魅痕」（首领名）里的不算。
GUARD = [
    '千语魅痕',    # 最后遗愿的首领，不是异域融合步枪「千语」
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


def load():
    """{名字: (token, 分类名)}。check_terms.py 的 G6 与 --suggest 共用这一份。"""
    path = os.path.join(shell.ROOT, OUT)
    if not os.path.exists(path):
        markup.die('%s 不存在，先跑 python3 tools/items.py --distill <导出.json>' % OUT)
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return {k: tuple(v) for k, v in data['terms'].items()}, data['skipped']


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
        if not name.endswith('.md') or name == 'changelog.md':
            continue
        if slug and name != slug + '.md':
            continue
        yield '%s/%s' % (DOC_DIR, name)


def hits_in(line, terms, names):
    """这一行里该着色的裸出现，[(起, 止, 词)]，按位置倒序——就地替换从后往前改。

    四处跳过：行标题那一格（已有结构身份）、链接目标与图片路径（不是正文）、
    GUARD 里那些更长的专名、已经在某个 {token|…} 里面的（别人已经判过了）。
    表里的词长词在前，先认长的。
    """
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
        for n, line in enumerate(lines, start=1):
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
        for i, line in enumerate(lines):
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
    elif args[:1] in (['--suggest'], ['--apply']) and len(args) <= 2:
        (suggest if args[0] == '--suggest' else apply)(
            args[1] if len(args) == 2 else None)
    else:
        print('用法：\n'
              '    python3 tools/items.py --distill <items-full.json>\n'
              '    python3 tools/items.py --suggest [slug]\n'
              '    python3 tools/items.py --apply   [slug]', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
