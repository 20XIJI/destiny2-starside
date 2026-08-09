#!/usr/bin/env python3
"""站点外壳一致性闸门。

各资料页的外壳由 tools/shell.py 生成，天然一致；会漂的只有手写的首页
index.html。本脚本从 shell.py 现取不变片段去比对每一个页面——
**这里不另存副本**，否则闸门自己就成了要维护的另一份定义。

用法：python3 tools/check_shell.py    改完 shell.py 或手写首页后跑一次。

资料页从 references/docs/ 现扫，新增一篇不必回来改这个文件。
"""

import os
import re
import sys

import shell

HOME = 'index.html'
# 两个专属生成器各出一页，其余的从 references/docs/ 现扫——新增一篇资料就不必
# 记得回来改这张表了。
FIXED = [HOME, 'armor-sets/index.html', 'artifact-mods/index.html']
DOC_DIR = os.path.join(shell.ROOT, 'references', 'docs')


def pages():
    out = list(FIXED)
    for name in sorted(os.listdir(DOC_DIR)):
        if not name.endswith('.md'):
            continue
        with open(os.path.join(DOC_DIR, name), encoding='utf-8') as f:
            md = f.read()
        where = re.search(r'^路径：(.*)$', md, re.M)
        out.append('%s/index.html' % (where.group(1).strip() if where else name[:-3]))
    return out


# head 里与页面无关的那几行。标题与描述是变量，用哨兵值生成后按前缀挑出不变量。
HEAD_KEEP = ('<meta name="theme-color"', '<meta property="og:site_name"',
             '<meta property="og:locale"', '<link rel="preload"',
             '<link rel="icon"', '<link rel="stylesheet" href="../assets/site.css">')

STAMP = re.compile(r'<span class="(?:entry-)?stamp">更新 \d{4}\.\d{1,2}\.\d{1,2}</span>')


def invariants():
    """各页必须一字不差共有的片段，全部取自 shell.py。"""
    head = shell.head('__T__', '__D__')
    frags = [ln for ln in head.split('\n') if ln.startswith(HEAD_KEEP)]
    # 站头的包裹结构：手写首页与生成页要用同一套骨架，只查 MARK 查不出包裹漂移
    return frags + ['<div class="site-head">', '<nav class="site-nav">',
                    shell.MARK, shell.CREDIT, shell.LEGAL, shell.SPEC]


def main() -> int:
    want = invariants()
    listed = pages()
    bad: list[str] = []
    for rel in listed:
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

    if bad:
        print('外壳不一致：', file=sys.stderr)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        return 1
    print('外壳一致：%d 个页面，%d 条不变片段' % (len(listed), len(want)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
