#!/usr/bin/env python3
"""站点外壳一致性闸门。

各资料页的外壳由 tools/shell.py 生成，天然一致；会漂的只有手写的首页
index.html。本脚本从 shell.py 现取不变片段去比对每一个页面——
**这里不另存副本**，否则闸门自己就成了要维护的另一份定义。

用法：python3 tools/check_shell.py    改完 shell.py 或手写首页后跑一次。

页面清单取自 shell.pages()，从 references/docs/ 现扫，新增一篇不必回来改这个文件。
"""

import os
import re
import sys

import shell

# head 里与页面无关的那几行。标题与描述是变量，用哨兵值生成后按前缀挑出不变量。
HEAD_KEEP = ('<meta name="theme-color"', '<meta property="og:site_name"',
             '<meta property="og:locale"', '<link rel="preload"',
             '<link rel="icon"', '<link rel="stylesheet" href="../assets/site.css">')

STAMP = re.compile(r'<span class="(?:entry-)?stamp">更新 \d{4}\.\d{1,2}\.\d{1,2}</span>')


def invariants(home=False):
    """各页必须一字不差共有的片段，全部取自 shell.py。

    **首页不挂导航条。**那一行只写得出「Starside / 当前页」，而字标本身就是站标，
    同一件事说两遍；回首页的入口在首页上也没有意义。站头的三条因此只钉资料页，
    head 元信息与页脚仍然全站一致。
    """
    head = shell.head('__T__', '__D__')
    frags = [ln for ln in head.split('\n') if ln.startswith(HEAD_KEEP)]
    foot = [shell.CREDIT, shell.LEGAL, shell.SPEC]
    if home:
        return frags + foot
    # 站头的包裹结构：各资料页要用同一套骨架，只查 MARK 查不出包裹漂移
    return frags + ['<div class="site-head">', '<nav class="site-nav">',
                    shell.MARK] + foot


def main() -> int:
    listed = shell.pages()
    bad: list[str] = []
    # 全站搜索的索引也按这份清单建。新增一页却没重跑 build-search.py 时，那一页
    # 在首页搜不出来——这里当场报出，不等读者搜不到才发现。
    with open(os.path.join(shell.ROOT, 'assets', 'search.js'), encoding='utf-8') as f:
        index = f.read()
    for rel in listed:
        want = invariants(rel == shell.HOME)
        path = os.path.join(shell.ROOT, rel)
        if not os.path.exists(path):
            bad.append('%s：文件不存在' % rel)
            continue
        with open(path, encoding='utf-8') as f:
            src = f.read()

        for frag in want:
            # 资源前缀按页面所在层数改写：首页在站点根，子目录页深一层
            at = '../' * rel.count('/')
            probe = frag.replace('../assets/', at + 'assets/')
            if probe not in src:
                bad.append('%s：与 shell.py 对不上 —— %s' % (rel, probe[:64]))

        # 提了 Compendium 就得用 shell.py 里那一句原文；没提则不管（弹药页是别的来源）
        if 'Destiny Data Compendium' in src and shell.COMPENDIUM not in src:
            bad.append('%s：Destiny Data Compendium 归属句被改写了' % rel)

        if not STAMP.search(src):
            bad.append('%s：缺 <span class="stamp">更新 YYYY.M.D</span>' % rel)

        if rel != shell.HOME and '"%s"' % rel not in index:
            bad.append('%s：不在全站搜索索引里，跑一次 tools/build-search.py' % rel)

    if bad:
        print('外壳不一致：', file=sys.stderr)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        return 1
    print('外壳一致：%d 个页面，%d 条不变片段（首页免去站头那三条），全部在搜索索引里'
          % (len(listed), len(invariants())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
