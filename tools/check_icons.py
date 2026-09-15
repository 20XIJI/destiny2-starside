#!/usr/bin/env python3
"""换图之前先看清楚要换掉什么：逐行比「这一行现在显示的图」与「它主键的官方图」。

两张图都按同一套参数编码（cwebp -q 82，按该页版式转一档），文件名都是内容的
md5 前 10 位，所以**名字相同即像素完全相同**。据此把每一行分成三档：

    一致   换过去零视觉变化
    不同   站内现在显示的不是这件东西的官方图（多半是从 Google 表格里抠的）
    没图   主键落不到官方图上（分节图、机制小节、属性、复合行），这一轮不换

用法：
    python3 tools/check_icons.py            # 逐页计数
    python3 tools/check_icons.py --list     # 把「不同」的逐条列出来
"""

import argparse
import collections
import os
import sys

import icons
import pagedex
import shell


def compare():
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    table = icons.load()
    stat = collections.defaultdict(collections.Counter)
    diff = []
    for page in pagedex.TOKENS:
        if page in icons.SKIP:
            continue
        got = pagedex.read(page)
        if got is None:
            continue
        for row in got['entries']:
            if row.get('of') or not row['icon']:
                continue
            path = next((p for p in (icons.icon_of(facts, k)
                                     for k in row['keys']) if p), None)
            if not path:
                stat[page]['没图'] += 1
                continue
            if path not in table:
                stat[page]['还没拉'] += 1
                continue
            now = os.path.basename(row['icon'])
            if now == table[path]['file']:
                stat[page]['一致'] += 1
            else:
                stat[page]['不同'] += 1
                diff.append((page, row['name'], now, table[path]['file']))
    return stat, diff


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--list', action='store_true', help='把「不同」的逐条列出来')
    a = ap.parse_args()
    stat, diff = compare()
    cols = ('一致', '不同', '没图', '还没拉')
    print('%-26s %6s %6s %6s %7s' % ('页', *cols))
    tot = collections.Counter()
    for page in sorted(stat):
        print('%-26s %6d %6d %6d %7d'
              % (page, *(stat[page][c] for c in cols)))
        tot.update(stat[page])
    print('%-26s %6d %6d %6d %7d' % ('合计', *(tot[c] for c in cols)))
    if a.list:
        print()
        for page, name, now, want in diff:
            print('  %-26s %-22s %s → %s' % (page, name, now, want))
    return 0


if __name__ == '__main__':
    sys.exit(main())
