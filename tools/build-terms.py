#!/usr/bin/env python3
"""闸门词表 → admin/terms.js，给在线编辑台的前端提示用。

**不另立词表**：三份都从现有的唯一真相现取，改一处两边同时生效。

    check_terms.TERMS          → 中文正名（G1）与 token 唯一（G2）
    check_terms.tint_classes   → token 有定义（G3），同时是着色芯片的调色板
    items.load()               → 该着色的都着了（G6 正查）

前端跑出来的是提示不是拦截：逐字保真、结构断言那几条要 Python，留在本地。
一条记录一行，与 assets/search.js 同理——这份文件每改一次词表就要重生成并入库，
按行写让 git 存得下增量。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_terms
import items
import shell

OUT = os.path.join(shell.ROOT, 'admin', 'terms.js')


def j(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def build():
    css = open(os.path.join(shell.ROOT, 'assets', 'site.css'), encoding='utf-8').read()
    # {类名: (它引的 --c-* 变量, 规则体是否只有 color)}。芯片按变量分组，
    # --c-orb 与 --c-stack 渲染色相同、名字不同，这一层让人靠名字分辨。
    tint = check_terms.tint_classes(css)
    known = check_terms.classes_in(css)

    terms = [[w, t, b] for w, t, b in check_terms.TERMS if b or t]
    table, _ = items.load()
    words = sorted(table.items(), key=lambda kv: (-len(kv[0]), kv[0]))

    lines = ['// 由 tools/build-terms.py 生成，不手改。改词表改 check_terms.TERMS 或 tools/items.json。',
             'window.starsideTerms = {']
    lines.append('terms: [')
    lines += ['  %s,' % j(t) for t in terms]
    lines.append('],')
    lines.append('tokens: {')
    lines += ['  %s: %s,' % (j(c), j(v)) for c, (v, _sole) in sorted(tint.items())]
    lines.append('},')
    lines.append('classes: %s,' % j(sorted(known)))
    lines.append('guard: %s,' % j(items.GUARD))
    lines.append('items: [')
    lines += ['  %s,' % j([w, tok, kind]) for w, (tok, kind) in words]
    lines.append(']}\n')
    return '\n'.join(lines)


def check(out):
    """空表与缺档当场报出。词表是现取的，写死条数会让每次改术语都误报。"""
    if 'terms: [\n]' in out or 'items: [\n]' in out:
        sys.exit('词表是空的，check_terms.TERMS 或 items.json 没读到')
    for must in ('el-arc', 'exotic', 'perk', 'art-perk'):
        if '"%s"' % must not in out:
            sys.exit('terms.js 里没有 %s，调色板缺了一档' % must)


def main():
    out = build()
    check(out)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(out)
    print('admin/terms.js  %.1f KB' % (len(out.encode()) / 1024))


if __name__ == '__main__':
    main()
