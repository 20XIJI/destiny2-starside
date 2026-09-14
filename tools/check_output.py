#!/usr/bin/env python3
"""产出逐字保真：把当前工作区的产出与某个 commit 的产出逐字节比对。

用法：
    python3 tools/check_output.py                 # 与 HEAD 比
    python3 tools/check_output.py --against <ref> # 与指定 commit 比

V2 要改生成器，而「重构没改坏东西」必须是一个能被证伪的断言，不是一句话。判据是：
**每一个产出文件要么逐字节相同，要么它的每一处差异都落在 ALLOWED 那张表里。**
新增一类允许的差异就往表里加一条，带一行理由；表外的差异一律报出。

比的是 git 里那一版，不另存快照目录——快照会过期，commit 不会。
"""

import argparse
import difflib
import os
import re
import subprocess
import sys

import shell

# 除页面之外的产出。生成器写什么，这里就比什么。
EXTRA = ('assets/search.js', 'builds/vocab.js', 'builds/desc.js',
         'admin/terms.js', 'admin/pages.js', 'functions/api/dialect.js')

# 允许的差异：把新那一行按这几条抹平之后，必须与旧那一行逐字相同。
# 每一条都要写清楚它是哪一步引入的，以及为什么旧版没有。
ALLOWED = (
    # Q13：产出的表格行、模组与套装戳上主键，vocab 从此读主键不再按名字猜。
    (re.compile(r'(<(?:tr|article)\b[^>]*?) data-hash="[^"]*"'), r'\1',
     '阶段 4 给行、模组与套装戳主键'),
    # <main> 上那个 data-hash 是源稿 sha1，与行上的主键不是一回事，改名让两者分开。
    (re.compile(r'(<main\b[^>]*?) data-src-hash='), r'\1 data-hash=',
     '<main> 的源稿 sha1 改名为 data-src-hash'),
)


def produced():
    """全部产出文件的相对路径。页面清单现取，不另存名单。"""
    return list(shell.pages()) + list(EXTRA)


def baseline(ref, path):
    r = subprocess.run(['git', 'show', '%s:%s' % (ref, path)],
                       cwd=shell.ROOT, capture_output=True)
    return None if r.returncode else r.stdout.decode('utf-8')


def flatten(line):
    for pattern, repl, _ in ALLOWED:
        line = pattern.sub(repl, line)
    return line


def compare(ref):
    same = allowed = 0
    changed, missing = [], []
    for path in produced():
        full = os.path.join(shell.ROOT, path)
        if not os.path.exists(full):
            missing.append((path, '工作区里没有这个产出'))
            continue
        with open(full, encoding='utf-8') as f:
            now = f.read()
        was = baseline(ref, path)
        if was is None:
            missing.append((path, '%s 里没有这个产出（新加的页）' % ref))
            continue
        if now == was:
            same += 1
            continue
        real = real_diff(was, now)
        if real:
            changed.append((path, real))
        else:
            allowed += 1

    total = same + allowed + len(changed) + len(missing)
    print('产出 %d 份：逐字节相同 %d，只有允许的差异 %d，真差异 %d，缺 %d'
          % (total, same, allowed, len(changed), len(missing)))
    for path, why in missing:
        print('  缺  %s —— %s' % (path, why))
    for path, rows in changed[:10]:
        print('  差  %s（%d 处）' % (path, len(rows)))
        for old, new in rows[:3]:
            print('        旧 %s' % old[:110])
            print('        新 %s' % new[:110])
    return 1 if (changed or missing) else 0


def real_diff(was, now):
    """抹平允许的差异之后仍然不同的那些行。"""
    a, b = was.split('\n'), now.split('\n')
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
            None, [flatten(x) for x in a], [flatten(x) for x in b],
            autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        for k in range(max(i2 - i1, j2 - j1)):
            old = a[i1 + k] if i1 + k < i2 else ''
            new = b[j1 + k] if j1 + k < j2 else ''
            out.append((old, new))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--against', default='HEAD', help='拿哪个 commit 当基线')
    a = ap.parse_args()
    return compare(a.against)


if __name__ == '__main__':
    sys.exit(main())
