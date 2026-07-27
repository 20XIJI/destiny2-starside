#!/usr/bin/env python3
"""站点外壳一致性闸门。

外壳（head 元信息、site-nav、site-foot）散在 4 处：两个手写页各一份，
两个生成器的字符串常量各一份。CLAUDE.md 用「一字不差地照抄这句」这条纪律
维持它们一致，本脚本把纪律变成断言：任何一份漂了，退出码非零。

用法：python3 tools/check_shell.py    改完任一页或任一生成器后跑一次。

只钉全站必须一致的片段，不钉每页各说各话的部分（页名、更新说明、鸣谢）。
新增资料页时把它加进 PAGES；改署名或免责声明时改这里的常量，四页一起改。
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOME = 'index.html'
PAGES = [HOME, 'ammo/index.html', 'armor-sets/index.html', 'artifact-mods/index.html']

# 每页都要一字不差出现
COMMON = {
    '主题色': '<meta name="theme-color" content="#0b0d14">',
    'og 站点名': '<meta property="og:site_name" content="Starside">',
    'og 语言': '<meta property="og:locale" content="zh_CN">',
    '站标': '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>',
    '署名': ('<p>© 2026 Eliver · <a href="https://space.bilibili.com/26117485" '
             'target="_blank" rel="noopener">哔哩哔哩</a></p>'),
    '免责声明': ('<p class="legal">Starside 为非官方资料站，与 Bungie, Inc. 无从属关系。'
                 'Destiny 2 及相关名称、标识为 Bungie, Inc. 的商标。</p>'),
}

# 资料页要有，首页没有（首页自己就是 home）
SUBPAGE = {
    '回首页链接': '<a class="home" href="../index.html">Starside</a>',
}

# 提到该数据源就必须用这一句，不换说法。见 CLAUDE.md「页脚归属」。
COMPENDIUM = ('<p>数据源：<a href="https://docs.google.com/spreadsheets/u/0/d/'
              '1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4" target="_blank" '
              'rel="noopener">Destiny Data Compendium</a>。本页在其基础上统一了术语、'
              '标点与排版，数值未作改动。</p>')

STAMP = re.compile(r'<span class="(?:entry-)?stamp">更新 \d{4}\.\d{1,2}\.\d{1,2}</span>')


def main() -> int:
    bad: list[str] = []
    for rel in PAGES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            bad.append('%s：文件不存在' % rel)
            continue
        with open(path, encoding='utf-8') as f:
            src = f.read()

        want = dict(COMMON) if rel == HOME else {**COMMON, **SUBPAGE}
        for label, frag in want.items():
            if frag not in src:
                bad.append('%s：%s 与其它页不一致' % (rel, label))

        # 提了 Compendium 就得用那一句原文；没提则不管（弹药页是别的来源）
        if 'Destiny Data Compendium' in src and COMPENDIUM not in src:
            bad.append('%s：Destiny Data Compendium 归属句被改写了' % rel)

        if not STAMP.search(src):
            bad.append('%s：缺 <span class="stamp">更新 YYYY.M.D</span>' % rel)

    if bad:
        print('外壳不一致：', file=sys.stderr)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        return 1
    print('外壳一致：%d 个页面' % len(PAGES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
