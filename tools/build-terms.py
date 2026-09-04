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
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_terms
import items
import markup
import shell

OUT = os.path.join(shell.ROOT, 'admin', 'terms.js')
TREE = os.path.join(shell.ROOT, 'admin', 'pages.js')


def j(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def build():
    css = open(os.path.join(shell.ROOT, 'assets', 'site.css'), encoding='utf-8').read()
    # {类名: (它引的 --c-* 变量, 规则体是否只有 color)}。芯片按变量分组，
    # --c-orb 与 --c-stack 渲染色相同、名字不同，这一层让人靠名字分辨。
    tint = check_terms.tint_classes(css)
    known = check_terms.classes_in(css)
    # 「源稿里真用过的 token」只有 check_tokens() 一处算得出，借它的返回值，
    # 不在这里再数一遍。它顺带往 bad 里记 G3，那几条由 check_terms.py 自己报，
    # 这里丢掉。
    used = check_terms.check_tokens(check_terms.sources(), css, [])

    terms = [[w, t, b] for w, t, b in check_terms.TERMS if b or t]
    table, _ = items.load()
    words = sorted(table.items(), key=lambda kv: (-len(kv[0]), kv[0]))

    lines = ['// 由 tools/build-terms.py 生成，不手改。改词表改 check_terms.TERMS 或 tools/items.json。',
             'window.starsideTerms = {']
    lines.append('terms: [')
    lines += ['  %s,' % j(t) for t in terms]
    lines.append('],')
    lines.append('tokens: {')
    # **芯片只列源稿里真写得出的那些**，判据与 G7 的色板页同一条（tint_classes
    # 再用 used 收一道）。不收这一道时 50 枚里有 18 枚是外壳与组件的类——
    # wordmark、site-foot、hero-sub、entry-stamp、tool-search、qq、pledge 这些，
    # 全站 75 份源稿里一次都没出现过，点一下只会生成一个不该有的标记。
    lines += ['  %s: %s,' % (j(c), j(v))
              for c, (v, _sole) in sorted(tint.items()) if c in used]
    lines.append('},')
    # G3 按页判：站内每页再叠一层自己的样式表（{ico|…} 只在 ability-cooldown 有）。
    # 只存相对 site.css 的增量——75 份各存一份全集就是把类名抄七十五遍。
    lines.append('classes: %s,' % j(sorted(known)))
    extra = {}
    for rel, ok in check_terms.sources():
        more = sorted(ok - known)
        if more:
            extra[rel[len('references/'):-3]] = more
    lines.append('pageClasses: {')
    lines += ['  %s: %s,' % (j(k), j(v)) for k, v in sorted(extra.items())]
    lines.append('},')
    lines.append('guard: %s,' % j(items.GUARD))
    # G1 的白名单与 G6 的正查范围，两处都照 Python 那一侧原样带过去，不在前端另立。
    lines.append('keep: %s,' % j(check_terms.KEEP))
    lines.append('g6: %s,' % j(sorted(p[len('references/docs/'):-3] for p in items.pages())))
    lines.append('items: [')
    lines += ['  %s,' % j([w, tok, kind]) for w, (tok, kind) in words]
    lines.append(']}\n')
    return '\n'.join(lines)


def tree():
    """资料页的树 → admin/pages.js。审核台左栏按它排，不另立第四份清单。

    读者看到的结构由三处现成数据拼出来，各管一段：

        首页 index.html 的 .group-label   六个大组，以及每组下有哪几张卡
        源稿的「路径：」                   elements/<x> 那 7 篇挂在职业分支详解下
        源稿的「卡片：」                   pve-farming 那 9 篇挂在它下面

    两处嵌套的出处不同不是疏漏：职业分支详解那一族真的嵌在文件系统里，
    刷取指南那 9 篇在站点根下、只是逻辑上属于它。硬要统一成一种，就得改动
    其中一页的渲染。挂不上任何一处的（配色总览）落到「站务」。

    一行六列：[_id, 标题, 页面路径, 分组, 父页 _id, 更新时间]。
    """
    home = open(os.path.join(shell.ROOT, 'index.html'), encoding='utf-8').read()
    group = {}
    for m in re.finditer(r'<h2 class="group-label">([^<]*)<span>.*?</h2>(.*?)</ul>', home, re.S):
        for href in re.findall(r'<a class="entry"[^>]*href="([^"]+)"', m.group(2)):
            group[href.replace('/index.html', '')] = m.group(1)

    docs = {}
    for name in sorted(os.listdir(os.path.join(shell.ROOT, check_terms.DOC_DIR))):
        if not name.endswith('.md'):
            continue
        md = open(os.path.join(shell.ROOT, check_terms.DOC_DIR, name), encoding='utf-8').read()
        slug = name[:-3]
        where = re.search(r'^路径：(.*)$', md, re.M)
        stamp = re.search(r'^更新：(.*)$', md, re.M)
        docs[slug] = {
            'id': 'docs/' + slug,
            'title': markup.must(re.match(r'#\s+(.+)', md),
                                 '%s 首行不是「# 标题」' % name).group(1).strip(),
            'where': where.group(1).strip() if where else slug,
            'at': stamp.group(1).strip() if stamp else '',
            'cards': [c.strip() for line in md.split('\n') if line.startswith('卡片：')
                      for c in line[3:].split('、') if c.strip()],
        }

    parent = {}
    for slug, d in docs.items():
        for kid in d['cards']:
            if kid in docs:
                parent[kid] = d['id']
        if d['where'].startswith('elements/') and 'elements' in docs:
            parent[slug] = docs['elements']['id']

    rows = []
    for slug, d in sorted(docs.items(), key=lambda kv: kv[1]['where']):
        up = parent.get(slug, '')
        g = group.get(d['where']) or (group.get(docs_where(docs, up)) if up else '') or '站务'
        rows.append([d['id'], d['title'], d['where'] + '/index.html', g, up, d['at']])
    # 两页不走 convert-doc，标题与更新时间写在生成器里，这里照它们的产出取
    for pid, title, url in (('artifact-mods', '神器模组', 'artifact-mods/index.html'),
                            ('armor-sets', '护甲套装效果', 'armor-sets/index.html')):
        html = open(os.path.join(shell.ROOT, url), encoding='utf-8').read()
        at = re.search(r'<span class="stamp">更新 ([\d.]+)</span>', html)
        rows.append([pid, title, url, group.get(pid, '档案'), '', at.group(1) if at else ''])
    rows.sort(key=lambda r: (r[3], r[4], r[0]))
    # 配装那三张表跟着一起导：审核台左栏按类别与职业建树、列表按分支上色，
    # 而 DOM 那边只认得 b-prismatic 这种 slug。**照 markup.py 那一份导**，
    # 不在 admin.js 里另抄一遍——多一个分支时只改那一处。
    return ('// 由 tools/build-terms.py 生成，不手改。审核台左栏的资料页树，'
            '以及配装的职业、类别与分支三张表。\n'
            'window.starsidePages = [\n'
            + '\n'.join('  %s,' % j(r) for r in rows) + '\n]\n'
            + 'window.starsideBuilds = %s\n'
            % j({'classes': list(markup.CLASSES), 'cats': list(markup.CATEGORIES),
                 'branch': markup.BRANCH}))


def docs_where(docs, pid):
    """父页的 _id → 它的产出路径，用来去首页那张表里查它归哪个组。"""
    slug = pid[len('docs/'):] if pid.startswith('docs/') else pid
    return docs[slug]['where'] if slug in docs else pid


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
    pages = tree()
    with open(TREE, 'w', encoding='utf-8') as f:
        f.write(pages)
    print('admin/pages.js  %.1f KB，%d 页' % (len(pages.encode()) / 1024,
                                            pages.count('\n  [')))


if __name__ == '__main__':
    main()
