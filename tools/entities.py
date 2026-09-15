#!/usr/bin/env python3
"""实体层：一个主键一条记录，站内关于这件东西的全部信息都写在它名下。

从前同一把枪的信息散在六七页上，每页各写一行，谁也不知道另一页写了什么——
「无名之秋」在购物清单上评级 A、来源写沙克斯，在刷取清单上评级 T1.5、来源写熔炉。
两套刻度本来就不同，合并就是造假；分散着放又没人看得见分歧。

所以按主键立记录，**每位作者各占一块，各写各的列**：

    references/items/weapon-primary.json
    {
      "1051949956": {
        "名": "无名之秋",
        "来自": {
          "aegis": {"评级": "A", "来源": "{src|沙克斯}", …},
          "lgpig": {"评级": "T1.5", "获取地点": "{src|熔炉}", …}
        }
      }
    }

「来自」是一张开放的表，加一位作者就是多一个键，结构不动——后续的管理员评论
按同一条路进来。字段名直接用作者那张表的列名，不另立一套：列名就是作者对这一列
的定义，换成别的名字等于替他改说法。

值存**源稿原文**（带 {token|…} 与格内换行 \\\\），因为页面要能从记录重新生成。
manifest 给出的基础信息不抄进来：那一份在 data/manifest/ 里按同一个 hash 放着，
机器生成、人不改，构建时按 hash 合。抄进来就又是两份真相。

用法：
    python3 tools/entities.py             # 只清点，不落盘
    python3 tools/entities.py --extract   # 页面源稿 → references/items/*.json
"""

import argparse
import collections
import json
import os
import sys

import pagedex
import research
import shell
from markup import CELL_BREAK, cells as cell_spans, die, inline, text_of

OUT_DIR = os.path.join(shell.ROOT, 'references', 'items')

# 页面 → 作者标签。归属的真相是各页源稿自己的「数据源：」与「鸣谢：」两行，
# 这里只把它压成一个短标签，用来在记录里分块；mark 是那一行里必须出现的字样，
# 对不上即中止——换了数据源却没改这里，记录会静默挂到错的作者名下。
AUTHORS = {
    'shopping-primary': ('aegis', 'Endgame Analysis'),
    'shopping-special': ('aegis', 'Endgame Analysis'),
    'shopping-heavy': ('aegis', 'Endgame Analysis'),
    'shopping-other': ('aegis', 'Endgame Analysis'),
    'legendary-primary': ('lgpig', '小棒猪-LGpig'),
    'legendary-special': ('lgpig', '小棒猪-LGpig'),
    'legendary-heavy': ('lgpig', '小棒猪-LGpig'),
    'exotic-weapons': ('lgpig', '小棒猪-LGpig'),
    'exotic-weapon': ('compendium', '数据源：是'),
}

# 这一轮只立武器。分卷按**这件东西自己的属性**分，不按它从哪一页来——
# 同一把枪在两页上各有一行，它们本来就该落进同一卷。
AMMO_VOLUME = {1: 'weapon-primary', 2: 'weapon-special', 3: 'weapon-heavy'}

# 行标题那一格是主键，图标那一格由主键定，两者都不进记录。
# 图标还在各页自己的目录里，换到共享目录之前先留着，否则记录回不去页面。
DROP = frozenset({'武器', '金装', '名称'})


def source_mark(page):
    """这一页源稿里「数据源：」与「鸣谢：」两行的正文。"""
    path = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
    with open(path, encoding='utf-8') as f:
        return '\n'.join(line for line in f.read().splitlines()
                         if line.startswith(('数据源：', '鸣谢：')))


def rows_of(page):
    """[(行标题源稿原文, {列名: 源稿原文})]。首格留空即沿用上一行的行标题。

    走 research.source()：行的内容在人写层，盘上那份只剩表头。
    """
    out, head, last = [], None, None
    for line in research.source(page).split('\n'):
        if not line.startswith('|'):
            head = None
            continue
        spans = cell_spans(line)
        if not spans:
            continue
        cols = [line[a:b].strip() for a, b in spans]
        if set(''.join(cols)) <= set('-: '):
            continue
        if head is None:
            head = cols
            continue
        # 横幅行（`| == 手雷 · 猎人与泰坦 == |`）不是数据行。
        if cols and cols[0].startswith('=='):
            continue
        title = cols[0] or last
        if not title:
            continue
        last = title
        out.append((title, dict(zip(head, cols))))
    return out


def shown(cell):
    """一格源稿 → 它在页面上显示的那串字。与索引里的名字同一种取法。"""
    return text_of(inline(cell.replace(CELL_BREAK, '<br>')), collapse=True)


def collect():
    """{主键: {'名': …, '来自': {作者: {列名: 源稿原文}}}}，只收武器。

    第三个返回值是**撞车清单**：同一页上两行落到了同一个主键。一个主键名下
    一位作者只放得下一块，第二行写进去就把第一行整块盖掉——而那两行本来是
    两件东西（「陨落铡刀」与「陨落铡刀\\猛攻版本」图都不一样，一行 S 一行 D）。
    从前是后写盖前写，静默发生：闸门全绿，站上少一条评级，没有任何人知道。

    这里不猜哪一行对：留先出现的那一行，把撞上的报出来。要分开就在
    `resolve.PINNED` 里给那一行钉一个主键，或者把两行的标题改得能区分。
    """
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    recs, missed, clash = {}, collections.Counter(), []
    for page, (author, mark) in sorted(AUTHORS.items()):
        if mark not in source_mark(page):
            die('%s 的数据源／鸣谢行里找不到「%s」，作者归属对不上了：\n  %s'
                % (page, mark, source_mark(page).replace('\n', '\n  ')))
        # 同名两行只登记先出现的那一个：后面撞车那一条会把它们都报出来。
        index = {}
        for e in pagedex.must_read(page)['entries']:
            if not e.get('of') and e['keys']:
                index.setdefault(e['name'], e['keys'])
        taken = {}
        for title, cols in rows_of(page):
            name = shown(title)
            key = index.get(name)
            if not key:
                missed[page] += 1
                continue
            # 一行可能带几个主键（组合行、词条一族）。**记录挂在第一个上**：
            # 那是这一行说的那件东西，其余是它带的插件，各自另有自己的记录。
            head = key[0]
            if not head.isdigit() or facts.items.get(head, {}).get('itemType') != 3:
                continue
            if head in taken:
                clash.append((page, head, facts.name(head), taken[head], name))
                continue
            taken[head] = name
            rec = recs.setdefault(head, {'名': facts.name(head), '来自': {}})
            block = rec['来自'].setdefault(author, {})
            for col, val in cols.items():
                if col in DROP or not val.strip():
                    continue
                block[col] = val
    return recs, missed, clash


def volume(facts, key):
    ammo = ((facts.items.get(key) or {}).get('equippingBlock') or {}).get('ammoType') or 0
    return AMMO_VOLUME.get(ammo, 'weapon-other')


def dump(recs):
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    books = collections.defaultdict(dict)
    for key, rec in recs.items():
        books[volume(facts, key)][key] = rec
    os.makedirs(OUT_DIR, exist_ok=True)
    out = []
    for name, book in sorted(books.items()):
        path = os.path.join(OUT_DIR, name + '.json')
        # 记录里**不排键**：作者那一块的键序就是他原表的列序，排一遍就把
        # 「排名、评级、属性、框架、来源…」打乱成字典序，页面照着念会很难读。
        # 顶层按主键排，逐条可比。
        body = ',\n'.join(
            ' %s: %s' % (json.dumps(k), json.dumps(book[k], ensure_ascii=False))
            for k in sorted(book, key=int))
        with open(path, 'w', encoding='utf-8') as f:
            f.write('{\n%s\n}\n' % body)
        out.append((name, len(book), os.path.getsize(path)))
    return out


# 一页两行落到同一个主键上的现存条数。**只许降不许升**：每一条都是一行作者
# 记录进不了库，涨了说明又多丢了一条。降到 0 就把这个数改成 0，别放宽。
#
# 现存这 11 条分三类，都要人来判，脚本不猜：
#
#   shopping-heavy     陨落铡刀 ×2    两行图不一样（db21c6268a / 3a773e248a），是两件
#                                     东西，一行 S 一行 D。库里五个 hash 里，
#                                     1815105249 的来源是「进入光能」（即猛攻），而
#                                     那一行列的 11 条词条只有 2480871539 全开得出
#                                     ——版本后缀与词条重合两个判据结论相反，
#                                     按哪个都得有人拍板
#   legendary-special  食莲者 ×2      两行标题一模一样，PINNED 按 (页, 名字) 建键，
#                                     分不开；要分得先把源稿那两行的标题改得能区分
#   exotic-weapon(s)   故我在 ×8      一件异域的元素变体与词条组合各占一行，刷取清单
#                                     那四行还各带自己的评级。名字里的消歧后缀被
#                                     norm() 剥掉之后落到同一条上。要留全得先定
#                                     「一把枪一张卡片」上怎么显示这几档
#   exotic-weapon      英勇利刃 ×2    同上，第二行是「2：冲击核心」那一档
CLASH_BASELINE = 11


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--extract', action='store_true', help='页面源稿 → 实体记录')
    a = ap.parse_args()
    recs, missed, clash = collect()
    authors = collections.Counter()
    for rec in recs.values():
        for who in rec['来自']:
            authors[who] += 1
    both = sum(1 for r in recs.values() if len(r['来自']) > 1)
    print('武器记录 %d 条，两位以上作者写过的 %d 条；逐作者 %s'
          % (len(recs), both, dict(authors)))
    if missed:
        print('行标题落不到主键上、因此没进记录的：%s' % dict(missed))
    if clash:
        print('同一页两行落到同一个主键上，后一行没进记录（%d 条）：' % len(clash))
        for page, head, name, first, second in clash:
            print('  %-18s %-12s %s ← 留了「%s」，丢了「%s」'
                  % (page, head, name, first, second))
    if len(clash) > CLASH_BASELINE:
        die('撞车从 %d 条涨到 %d 条，又多丢了作者记录。'
            '给那一行在 resolve.PINNED 里钉一个主键，或把两行的标题改得能区分'
            % (CLASH_BASELINE, len(clash)))
    if not a.extract:
        return 0
    for name, n, size in dump(recs):
        print('  references/items/%-22s %4d 条  %6.1f KB' % (name + '.json', n, size / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
