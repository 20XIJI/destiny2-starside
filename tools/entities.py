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
manifest 给出的基础信息不抄进来：那一份在 data/facts/ 里按同一个 hash 放着，
机器生成、人不改，构建时按 hash 合。抄进来就又是两份真相。

用法：
    python3 tools/entities.py --extract   # 页面源稿 → references/items/*.json
    python3 tools/entities.py --check     # 记录与源稿逐格比对，不等就报出
"""

import argparse
import collections
import json
import os
import sys

import pagedex
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
    """[(行标题源稿原文, {列名: 源稿原文})]。首格留空即沿用上一行的行标题。"""
    path = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
    out, head, last = [], None, None
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
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
    """{主键: {'名': …, '来自': {作者: {列名: 源稿原文}}}}，只收武器。"""
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    recs, missed = {}, collections.Counter()
    for page, (author, mark) in sorted(AUTHORS.items()):
        if mark not in source_mark(page):
            die('%s 的数据源／鸣谢行里找不到「%s」，作者归属对不上了：\n  %s'
                % (page, mark, source_mark(page).replace('\n', '\n  ')))
        index = {e['name']: e['hash'] for e in pagedex.must_read(page)['entries']
                 if not e.get('of') and e['hash']}
        for title, cols in rows_of(page):
            key = index.get(shown(title))
            if not key:
                missed[page] += 1
                continue
            # 一行可能带几个主键（组合行、词条一族）。**记录挂在第一个上**：
            # 那是这一行说的那件东西，其余是它带的插件，各自另有自己的记录。
            head = key.split()[0]
            if not head.isdigit() or facts.items.get(head, {}).get('ty') != 3:
                continue
            rec = recs.setdefault(head, {'名': facts.name(head), '来自': {}})
            block = rec['来自'].setdefault(author, {})
            for col, val in cols.items():
                if col in DROP or not val.strip():
                    continue
                block[col] = val
    return recs, missed


def volume(facts, key):
    ammo = (facts.items.get(key) or {}).get('ammo') or 0
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


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--extract', action='store_true', help='页面源稿 → 实体记录')
    a = ap.parse_args()
    recs, missed = collect()
    authors = collections.Counter()
    for rec in recs.values():
        for who in rec['来自']:
            authors[who] += 1
    both = sum(1 for r in recs.values() if len(r['来自']) > 1)
    print('武器记录 %d 条，两位以上作者写过的 %d 条；逐作者 %s'
          % (len(recs), both, dict(authors)))
    if missed:
        print('行标题落不到主键上、因此没进记录的：%s' % dict(missed))
    if not a.extract:
        return 0
    for name, n, size in dump(recs):
        print('  references/items/%-22s %4d 条  %6.1f KB' % (name + '.json', n, size / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
