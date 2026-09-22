#!/usr/bin/env python3
"""全站搜索索引：扫已生成的页面产出 assets/search.js。

首页的搜索框搜的就是这一份。**扫产出而不是扫源稿**：三个生成器的产出结构统一
（section[id]、.gen tbody tr、.mod、.set），一份实现覆盖全部页面；源稿那边要按
生成器分三种方言处理，且没有分节 id，链过去落不到位置。

产出是一个 JS 文件而不是 JSON：**双击打开的站点要能搜**，而 file:// 下 fetch 取
同目录的文件会被 CORS 挡掉，<script> 不会。文件里就一句 window.starsideIndex = [ … ]，
一条记录一行——这份文件每改一次源稿就要重生成并入库，按行写让 git 存得下增量。
按页面、分节分组写，三种记录（条目有两种写法），按出现顺序归属：

    {"u":页面, "t":标题, "d":描述}   每页一条，其后是这一页的分节与条目
    {"a":锚点, "l":分节}             每个分节一条，其后是这一节的条目
    [名称, 全文]                     条目；全文里第一个 ¶ 写的是名称
    [名称]                           条目，全文与前一个同名条目相同

站上不压缩传输，字节原样下到读者那里。所以页面与分节不在每个条目上重复，名称不在
全文里再写一遍，同名条目逐字相同的全文只写一次（异域武器、异域护甲的详解页与刷取
清单页各有一百多条相同，神器模组页同一个模组挂在两件神器下）。首页 home.js 的
unpack() 把它展开回每条带齐 u a l n x 的记录，匹配与渲染只认展开后的形状。

索引是页面文本的第二份副本，但它在仓库的另一个文件里、不进任何页面的 HTML，
各生成器的逐字保真闸门因此照旧成立。

用法：python3 tools/build-search.py   改完源稿跑 npm run build 即包含这一步。
"""

import argparse
import html as htmllib
import json
import os
import re

import markup
import pagedex
import rows as rows_mod
import shell

OUT = os.path.join(shell.SITE, 'assets', 'search.js')

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
# 按记录排版的那几页：一条记录一个 article.rec，名字在身份格的 .nm 里
REC = re.compile(r'<article class="[^"]*\brec\b[^"]*"[^>]*>(.*?)</article>', re.S)
REC_DIV = re.compile(r'<div class="[^"]*\brec\b[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
REC_NAME = re.compile(r'<div class="r-nm[^"]*">(.*?)</div>', re.S)
# 子行（星相强化、按枪型的说明）在站内有自己的名字，写在行上的 data-name
SUB_NAME = re.compile(r'^ data-name="([^"]+)"')
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
    for rec in REC.findall(chunk):
        out.append((anchor, text(markup.must(
            REC_NAME.search(rec), '记录取不到名称').group(1)), text(rec)))
    # 子行嵌着好几层 div，按「下一行子行或本条记录结束」切，正则配不住闭合标签
    for piece in chunk.split('<div class="r-sub-row"')[1:]:
        got = SUB_NAME.match(piece)
        if got:
            out.append((anchor, htmllib.unescape(got.group(1)),
                        text(piece.split('</article>')[0])))
    for rec in REC_DIV.findall(chunk):
        got = REC_NAME.search(rec)
        if got:
            out.append((anchor, text(got.group(1)), text(rec)))
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


# 配装页每套只进一条记录，四十个槽位名不进索引：搜「元素虹吸」该命中神器模组页
# 那一条正主，而不是同时命中带了它的每一套配装。描述与标签同样不收——想被搜到就
# 把词写进配装名里。合集同理，只进合集名那一条。
BUILD = re.compile(r'^builds/s\d+/')


def read(url):
    """整页 HTML，首屏之后另存的记录并回来（shell.read_page）。"""
    return shell.read_page(os.path.join(shell.SITE, url))


def title_of(url, src):
    """<title> 去掉末尾那一段站名。**报错要带上是哪一页**：清单里四十多个
    配装页，只说「没有 <title>」等于让人挨个翻。"""
    return text(markup.must(TITLE.search(src),
                            '%s 没有 <title>' % url).group(1)).rsplit(' · ', 1)[0]


_EN: dict[str, dict[str, str]] = {}


def english(url):
    """这一页的 {页面上写的名字: 英文名}。库里两边一样的不收。

    英文来自记录的 i18n.en.name，那一份是 manifest 蒸馏来的——这里只是让它露出来：
    搜 One-Two Punch 也能搜到雪上加霜。页面上写的名字取页面索引的 name
    （行标题以源稿为准，记录名不一定是站内写法）。
    **只进全文那一格，不上页面**：站点是中文站，英文名在正文里出现一次都会破坏版式。
    """
    page = url[:-len('/index.html')]
    if page not in _EN:
        table = {}
        # 建了索引的页面读不到就中止（半份词表比没有更糟）；本来就没建索引的
        # 页面（ability-cooldown 这类不被跨页引用的）跳过。
        got = pagedex.must_read(page) if page in pagedex.TOKENS else None
        for row in (got or {}).get('entries', ()):
            shown = row.get('name')
            for key in row.get('keys') or ():
                rec = rows_mod.facts().at(str(key)) or {}
                zh = ((rec.get('i18n') or {}).get('zh-CN') or {}).get('name')
                en = ((rec.get('i18n') or {}).get('en') or {}).get('name')
                if en and en != zh and shown:
                    table.setdefault(shown, en)
                    break
        _EN[page] = table
    return _EN[page]


def scan(url):
    src = read(url)
    title = title_of(url, src)
    desc = markup.must(DESC.search(src), '%s 没有 description' % url).group(1)

    cuts = [(m.start(), m.group(1)) for m in SECTION.finditer(src)]
    if not cuts:
        markup.die('%s 一个带 id 的分节都没有，链过去落不到位置' % url)
    tables = not CHART.search(src)
    rows = []
    for i, (at, anchor) in enumerate(cuts):
        chunk = src[at:cuts[i + 1][0] if i + 1 < len(cuts) else len(src)]
        items = items_of(chunk, anchor, tables)
        # 分节标题只用来给条目标归属，没有条目就不需要它。武器库那一节的内容
        # 由 app.js 现画，产出里只有一个空容器，本来就没有标题可取。
        if not items:
            continue
        sect = label_of(chunk, url)
        seen = english(url)
        for hold, name, full in items:
            en = seen.get(name)
            rows.append({'u': url, 'a': hold, 'l': sect, 'n': name,
                         'x': '%s %s' % (full, en) if en else full})
    return {'u': url, 't': title, 'd': desc}, rows


def line(record):
    """一条记录一行。分隔符去掉空格——2180 条各省下十几字节。"""
    return json.dumps(record, ensure_ascii=False, separators=(',', ':'))


# 条目全文里代写名称的字符。全文里本来就有它时，展开会把那一处换成名称，所以中止。
NAME = '¶'


def pack(rows, last):
    """一页的条目写成行：分节变了先写一行 {"a","l"}，条目只写名称与全文。

    last 记着「名称 → 前一个同名条目的全文」，跨页共用，与 home.js 的 unpack()
    同一套规则：全文与它相同只写名称，否则全文里第一次出现名称的那一处换成 NAME。
    """
    out, sect = [], None
    for r in rows:
        if (r['a'], r['l']) != sect:
            sect = (r['a'], r['l'])
            out.append(line({'a': r['a'], 'l': r['l']}))
        name, full = r['n'], r['x']
        if last.get(name) == full:
            out.append(line([name]))
        else:
            if NAME in full:
                markup.die('%s 的「%s」全文里有 %s，展开时会被换成名称' % (r['u'], name, NAME))
            out.append(line([name, full.replace(name, NAME, 1) if name else full]))
        last[name] = full
    return out


def main() -> int:
    argparse.ArgumentParser(description=__doc__, allow_abbrev=False,
                            epilog="产出 assets/search.js；资料产出应先生成；完整链运行 npm run build").parse_args()
    out, total = [], 0
    last: dict[str, str] = {}
    for url in shell.pages():
        if url == shell.HOME:
            continue          # 首页本身就是搜索框所在的那一页，不必搜出自己
        if BUILD.match(url):
            # 只读标题，不跑整趟 scan()：合集页里一套一个 <section id>，那些分节
            # 没有标题也不该出条目，扫它们除了报错什么也换不来。
            out.append(line({'u': url, 't': title_of(url, read(url)), 'd': ''}))
            print('  %-38s    1 条（配装名）' % url)
            continue
        page, rows = scan(url)
        out.append(line(page))
        out += pack(rows, last)
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
