#!/usr/bin/env python3
"""全站搜索索引：扫已生成的页面产出 assets/search.js。

首页的搜索框搜的就是这一份。**扫产出而不是扫源稿**：三个生成器的产出结构统一
（section[id]、.gen tbody tr、.mod、.set），一份实现覆盖全部页面；源稿那边要按
生成器分三种方言处理，且没有分节 id，链过去落不到位置。

产出是一个 JS 文件而不是 JSON：**双击打开的站点要能搜**，而 file:// 下 fetch 取
同目录的文件会被 CORS 挡掉，<script> 不会。文件里就一句 window.starsideIndex = [ … ]，
一条记录一行——这份文件每改一次源稿就要重生成并入库，按行写让 git 存得下增量。
两种记录：

    {"u":页面, "t":标题, "d":描述}                     每页一条
    {"u":页面, "a":锚点, "l":分节, "n":名称, "x":全文}  每个条目一条

索引是页面文本的第二份副本，但它在仓库的另一个文件里、不进任何页面的 HTML，
各生成器的逐字保真闸门因此照旧成立。

用法：python3 tools/build-search.py   改完源稿跑 npm run build 即包含这一步。
"""

import json
import os
import re

import markup
import shell

OUT = os.path.join(shell.ROOT, 'assets', 'search.js')

# 带 id 的分节即一个跳转落点。嵌在里面的 section（护甲套装页的 .bonus）没有 id，
# 所以按「有 id 的 section 起始标签」切块是安全的。
SECTION = re.compile(r'<section[^>]*\bid="([^"]+)"[^>]*>')
# 分节标题：三种产出各一种写法，取首个命中的。
LABEL = (re.compile(r'<h2 class="sect-label"[^>]*>(.*?)</h2>', re.S),
         re.compile(r'class="art-head"[^>]*>.*?<h2[^>]*>(.*?)</h2>', re.S),
         re.compile(r'<h2 class="cat-head"[^>]*>\s*<span[^>]*>(.*?)</span>', re.S))
THEAD = re.compile(r'<thead>.*?</thead>', re.S)
ROW = re.compile(r'<tr(?![^>]*class="lane")[^>]*>(.*?)</tr>', re.S)
ROW_TH = re.compile(r'<th scope="row"[^>]*>(.*?)</th>', re.S)
CELL = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.S)
MOD = re.compile(r'<article class="mod"[^>]*>(.*?)</article>', re.S)
MOD_NAME = re.compile(r'<h4[^>]*>(.*?)</h4>', re.S)
SET = re.compile(r'<article class="set" id="([^"]+)"[^>]*>(.*?)</article>', re.S)
SET_NAME = re.compile(r'<h3[^>]*>(.*?)</h3>', re.S)
TITLE = re.compile(r'<title>(.*?)</title>', re.S)
DESC = re.compile(r'<meta name="description" content="([^"]*)"')
BR = re.compile(r'<br\s*/?>')
# 折线图页的表由 app.js 收起、改画成图，行里全是坐标点（「-100 0.000 0.000」），
# 搜出来读者也用不上，整页只留页面本身那一条。
CHART = re.compile(r'<div class="toolbar"[^>]*\bdata-chart=')


def text(frag):
    """剥标签取一句人话。<br> 先换成空格——直接剥会把上下两行粘成一个词。"""
    return markup.text_of(BR.sub(' ', frag), collapse=True)


def label_of(chunk, url):
    for pat in LABEL:
        m = pat.search(chunk)
        if m:
            return text(m.group(1))
    markup.die('%s 有分节取不到标题：%s' % (url, text(chunk)[:40]))


def items_of(chunk, anchor, tables=True):
    """一个分节里的条目：表格行、神器模组、护甲套装各一种形状。"""
    out = []
    for sid, set_html in SET.findall(chunk):
        out.append((sid, text(markup.must(
            SET_NAME.search(set_html), '套装取不到名称').group(1)), text(set_html)))
    for mod in MOD.findall(chunk):
        out.append((anchor, text(markup.must(
            MOD_NAME.search(mod), '模组取不到名称').group(1)), text(mod)))
    carry = ''
    for row in ROW.findall(THEAD.sub('', chunk)) if tables else []:
        cells = CELL.findall(row)
        if not cells:
            continue
        # 合并块的续行没有 <th>，行标题沿用上一行的——它们本来就属于同一个行标题。
        th = ROW_TH.search(row)
        carry = text(th.group(1)) if th else carry
        # 逐格取再用空格接：产出里格与格之间没有空白，整行剥标签会把相邻两格
        # 粘成一个词（「1最后遗愿」）。
        out.append((anchor, carry or text(cells[0]),
                    ' '.join(t for t in map(text, cells) if t)))
    return out


def scan(url):
    path = os.path.join(shell.ROOT, url)
    with open(path, encoding='utf-8') as f:
        src = f.read()
    title = text(markup.must(TITLE.search(src), '%s 没有 <title>' % url).group(1))
    title = title.rsplit(' · ', 1)[0]
    desc = markup.must(DESC.search(src), '%s 没有 description' % url).group(1)

    cuts = [(m.start(), m.group(1)) for m in SECTION.finditer(src)]
    if not cuts:
        markup.die('%s 一个带 id 的分节都没有，链过去落不到位置' % url)
    tables = not CHART.search(src)
    rows = []
    for i, (at, anchor) in enumerate(cuts):
        chunk = src[at:cuts[i + 1][0] if i + 1 < len(cuts) else len(src)]
        sect = label_of(chunk, url)
        for hold, name, full in items_of(chunk, anchor, tables):
            rows.append({'u': url, 'a': hold, 'l': sect, 'n': name, 'x': full})
    return {'u': url, 't': title, 'd': desc}, rows


def line(record):
    """一条记录一行。分隔符去掉空格——2180 条各省下十几字节。"""
    return json.dumps(record, ensure_ascii=False, separators=(',', ':'))


def main() -> int:
    out, total = [], 0
    for url in shell.pages():
        if url == shell.HOME:
            continue          # 首页本身就是搜索框所在的那一页，不必搜出自己
        page, rows = scan(url)
        out.append(line(page))
        out += [line(r) for r in rows]
        total += len(rows)
        print('  %-38s %4d 条' % (url, len(rows)))
    body = 'window.starsideIndex = [\n%s\n];\n' % ',\n'.join(out)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(body)
    print('assets/search.js —— %.1f KB，%d 个页面 %d 个条目'
          % (len(body.encode()) / 1024, len(shell.pages()) - 1, total))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
