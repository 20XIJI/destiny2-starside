#!/usr/bin/env python3
"""把 references/docs/*.md 转成资料页。

用法：
    python3 tools/convert-doc.py            # 全部重新生成
    python3 tools/convert-doc.py ammo       # 只生成一篇

一篇 markdown 对应一个页面目录：references/docs/<slug>.md → <slug>/index.html。
页面自己的样式写在 <slug>/style.css，本脚本不碰。

排版按 design.md 第四节：连续阅读版心 760px 居中，表格按内容定宽再居中。

解析不上的结构、对不上的正文一律抛错中止，不出半成品。
"""

import html as htmllib
import os
import re
import sys
from typing import NoReturn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'references', 'docs')

# 头部的「键：值」行。键名固定，正文行不会被误认。
META_KEYS = ('描述', '更新', '页脚')
META_LINE = re.compile(r'^(?:%s)：.*$' % '|'.join(META_KEYS), re.M)

SITE_FOOT = ('<p>© 2026 Eliver · '
             '<a href="https://space.bilibili.com/26117485" target="_blank" rel="noopener">'
             '哔哩哔哩</a></p>\n'
             '<p class="legal">Starside 为非官方资料站，与 Bungie, Inc. 无从属关系。'
             'Destiny 2 及相关名称、标识为 Bungie, Inc. 的商标。</p>')


def die(msg) -> NoReturn:
    raise SystemExit('转换中止：' + msg)


# ── 行内标记 ────────────────────────────────────────────────────────────
# {token|文字} 着色、**粗体**、*强调*、[文字](链接)。token 即页面样式表里的类名。
# 文本里从不出现 { 与 }，所以这对括号可以当标记字符；| 在文本里常见，但只有紧跟在
# token 名后面的那个才是分隔符。
COLOR_OPEN = re.compile(r'\{([\w-]+)\|')
LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')


def inline(md):
    """行内标记 → HTML。着色支持嵌套，栈式扫描，正则做不干净。"""
    def link(m):
        ext = ' target="_blank" rel="noopener"' if m.group(2).startswith('http') else ''
        return '<a href="%s"%s>%s</a>' % (m.group(2), ext, m.group(1))

    md = LINK.sub(link, md)
    md = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', md)
    md = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', md)

    out, pos, depth, i = [], 0, 0, 0
    while i < len(md):
        m = COLOR_OPEN.match(md, i)
        if m:
            out.append(md[pos:i])
            out.append('<span class="%s">' % m.group(1))
            depth += 1
            i = pos = m.end()
            continue
        if md[i] == '}' and depth:
            out.append(md[pos:i])
            out.append('</span>')
            depth -= 1
            i = pos = i + 1
            continue
        i += 1
    out.append(md[pos:])
    if depth:
        die('着色标记未闭合：%r' % md[:120])
    return ''.join(out)


def whole_marker(md):
    """整块恰好被一个 {token|…} 包住时返回 (token, 内容)，否则 None。

    判据是首个标记的闭括号落在末尾。中途闭合说明块里还有别的内容
    （`{a|白弹} → {b|绿弹}` 是两个标记，不是一个），那就不算整块。
    """
    m = COLOR_OPEN.match(md)
    if not m:
        return None
    depth, i = 1, m.end()
    while i < len(md):
        opener = COLOR_OPEN.match(md, i)
        if opener:
            depth += 1
            i = opener.end()
            continue
        if md[i] == '}':
            depth -= 1
            if depth == 0:
                return (m.group(1), md[m.end():i]) if i == len(md) - 1 else None
        i += 1
    return None


def wrap(tag, md, attrs=''):
    """一个块的内容整体只有一个标记时，class 落在块上，不套一层 span。

    <th class="t-red">红血</th> 比 <th><span class="t-red">红血</span></th> 干净，
    p.note、p.formula 同理。
    """
    md = md.strip()
    hit = whole_marker(md)
    if hit:
        return '<%s%s class="%s">%s</%s>' % (tag, attrs, hit[0], inline(hit[1]), tag)
    return '<%s%s>%s</%s>' % (tag, attrs, inline(md), tag)


# ── 解析 ────────────────────────────────────────────────────────────────
def split_cells(row):
    """表格行按 | 切分，但 {token|文字} 里的 | 不是分隔符。"""
    row = row.strip()
    # 首尾各去一个 | ——用 strip('|') 会把空的末格一起吃掉
    row = row.removeprefix('|').removesuffix('|')
    cells, buf, depth = [], [], 0
    for ch in row:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        if ch == '|' and depth == 0:
            cells.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
    cells.append(''.join(buf))
    return [c.strip() for c in cells]


def is_rule(cells):
    """表头下的 |---|---| 分隔行，以及行组之间的 --- 分隔行。"""
    return all(re.fullmatch(r':?-{3,}:?', c or '') for c in cells) and any(cells)


def render_table(lines):
    """markdown 表格 → <table class="gen">。

    第一行是表头，第二行是 |---| 分隔。正文里再出现一行 --- 就另起一个 <tbody>，
    行组之间的分界由 CSS 的 tbody + tbody 画，不落成类名。
    每行第一格是行标题（<th scope="row">），其余是数据格。
    """
    head = split_cells(lines[0])
    if len(lines) < 2 or not is_rule(split_cells(lines[1])):
        die('表格第二行必须是 |---|---| 分隔行：%s' % lines[0][:60])

    o = ['<table class="gen">', '<thead>', '<tr>']
    o += [wrap('th', c, ' scope="col"') for c in head]
    o += ['</tr>', '</thead>', '<tbody>']
    for line in lines[2:]:
        cells = split_cells(line)
        if is_rule(cells):
            o += ['</tbody>', '<tbody>']
            continue
        if len(cells) != len(head):
            die('表格某行有 %d 格，表头是 %d 格：%s' % (len(cells), len(head), line[:60]))
        row = [wrap('th', cells[0], ' scope="row"')]
        row += [wrap('td', c) for c in cells[1:]]
        o.append('<tr>' + ''.join(row) + '</tr>')
    o += ['</tbody>', '</table>']
    return o


def render_blocks(chunk):
    """分节正文 → 段落、列表、定义列表、表格。"""
    o, i = [], 0
    lines = chunk.split('\n')
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue

        if line.lstrip().startswith('|'):
            start = i
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                i += 1
            o += render_table([ln.strip() for ln in lines[start:i]])
            continue

        # 定义列表：术语一行，紧跟以「: 」开头的定义行
        if i + 1 < len(lines) and lines[i + 1].startswith(': '):
            o.append('<dl class="rules">')
            while i + 1 < len(lines) and lines[i + 1].startswith(': '):
                o.append(wrap('dt', lines[i]))
                o.append(wrap('dd', lines[i + 1][2:]))
                i += 2
                while i < len(lines) and not lines[i].strip():
                    i += 1
            o.append('</dl>')
            continue

        if line.startswith('- '):
            o.append('<ul>')
            while i < len(lines) and lines[i].startswith('- '):
                o.append(wrap('li', lines[i][2:]))
                i += 1
            o.append('</ul>')
            continue

        # 段落：连续非空行合成一段，段内换行落成 <br>
        start = i
        while (i < len(lines) and lines[i].strip()
               and not lines[i].lstrip().startswith('|')
               and not lines[i].startswith('- ')
               and not (i + 1 < len(lines) and lines[i + 1].startswith(': '))):
            i += 1
        o.append(wrap('p', '<br>'.join(ln.strip() for ln in lines[start:i])))
    return o


def render(md):
    m = re.match(r'^#\s+(.+)$', md.split('\n')[0])
    if not m:
        die('源稿第一行必须是「# 页面标题」')
    title = m.group(1).strip()

    def meta(key, required=True):
        hit = re.search(r'^%s：(.*)$' % key, md, re.M)
        if hit is None:
            if required:
                die('源稿缺「%s：」一行' % key)
            return ''
        return hit.group(1).strip()

    desc, stamp, foot = meta('描述'), meta('更新'), meta('页脚', required=False)
    if not re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}', stamp):
        die('「更新：」要写成 YYYY.M.D，源稿写的是 %r' % stamp)

    full = '%s · Starside' % title
    o = ['<!doctype html>', '<html lang="zh-CN">', '<head>',
         '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>%s</title>' % full,
         '<meta name="description" content="%s">' % desc,
         '<meta name="theme-color" content="#0b0d14">',
         '<meta property="og:type" content="article">',
         '<meta property="og:site_name" content="Starside">',
         '<meta property="og:locale" content="zh_CN">',
         '<meta property="og:title" content="%s">' % full,
         '<meta property="og:description" content="%s">' % desc,
         '<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">',
         '<link rel="stylesheet" href="../assets/site.css">',
         '<link rel="stylesheet" href="style.css">',
         '</head>', '<body>',
         '<div class="site-head">',
         '<nav class="site-nav">',
         '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>',
         '<a class="home" href="../index.html">Starside</a>',
         '<span class="sep">/</span>',
         '<span aria-current="page">%s</span>' % title,
         '</nav>', '</div>', '',
         '<header class="page-head">', '<h1>%s</h1>' % title, '</header>', '',
         '<main>']

    body = META_LINE.sub('', md[md.index('\n'):])
    parts = re.split(r'^## ', body, flags=re.M)
    if parts[0].strip():
        die('第一个 ## 之前有正文，资料页的正文一律归在分节里：%r'
            % parts[0].strip()[:60])
    if len(parts) == 1:
        die('源稿一个 ## 分节都没有')

    for part in parts[1:]:
        head, _, chunk = part.partition('\n')
        o.append('<section class="block">')
        o.append('<h2 class="sect-label">%s</h2>' % inline(head.strip()))
        o += render_blocks(chunk)
        o.append('</section>')

    o += ['</main>', '', '<footer class="site-foot">']
    first = '<span class="stamp">更新 %s</span>' % stamp
    o.append('<p>%s%s</p>' % (first, inline(foot) if foot else ''))
    o += [SITE_FOOT, '</footer>', '</body>', '</html>', '']
    return '\n'.join(o), title


# ── 自检 ────────────────────────────────────────────────────────────────
def text_of(frag):
    t = re.sub(r'<[^>]*>', '', frag)
    return re.sub(r'\s+', '', htmllib.unescape(t))


def check(md, out, slug):
    """正文逐字保真：产出剥掉标签后与源稿逐字相等。

    两侧同样归一化：去空格，去 markdown 的标记字符（这些在页面上由字重、颜色与
    表格线承担，不落成字符）。源稿是要持续编辑的，所以不写死每种块的条数——
    真正的闸门是「一个字都没多、没少」。
    """
    lines = []
    for raw in META_LINE.sub('', md[md.index('\n'):]).split('\n'):
        line = raw.strip()
        if line.startswith('|'):                      # 表格：只去分隔符与分隔行
            cells = split_cells(line)
            if not is_rule(cells):
                lines.append(''.join(cells))
            continue
        for mark in ('## ', '# ', '- ', ': '):         # 块标记只去行首那一个
            if line.startswith(mark):
                line = line[len(mark):]
                break
        lines.append(line)
    body = '\n'.join(lines)
    body = LINK.sub(r'\1', body)                      # 链接只留文字
    body = re.sub(r'\{[\w-]+\|', '', body)            # 着色标记的开括号连分隔符
    want = re.sub(r'[*`}\s]', '', body)               # 字重与着色不落成字符

    main = out[out.index('<main>'):out.index('</main>')]
    got = text_of(main)
    if got != want:
        for i, (a, b) in enumerate(zip(got, want)):
            if a != b:
                die('%s 正文第 %d 字起对不上：\n  产出 %r\n  源稿 %r'
                    % (slug, i, got[i:i + 40], want[i:i + 40]))
        die('%s 正文长度对不上：产出 %d 字，源稿 %d 字' % (slug, len(got), len(want)))

    if re.search(r'<span[^>]*>[^<]*<span', main):
        die('%s 出现嵌套 span，检查 wrap() 的整块判定' % slug)
    if '{' in main or '}' in main:
        die('%s 有没转换的着色标记' % slug)


def build(slug):
    src = os.path.join(SRC_DIR, slug + '.md')
    if not os.path.exists(src):
        die('找不到源稿 %s' % src)
    with open(src, encoding='utf-8') as f:
        md = f.read()

    out, title = render(md)
    check(md, out, slug)

    outdir = os.path.join(ROOT, slug)
    if not os.path.isdir(outdir):
        die('输出目录不存在：%s/（新页面要先建目录并写 style.css）' % slug)
    with open(os.path.join(outdir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('%s/index.html —— %s，%.1f KB' % (slug, title, len(out.encode()) / 1024))


def main():
    if len(sys.argv) > 2:
        die(__doc__)
    if len(sys.argv) == 2:
        build(sys.argv[1])
        return
    slugs = sorted(f[:-3] for f in os.listdir(SRC_DIR) if f.endswith('.md'))
    if not slugs:
        die('references/docs/ 下没有 .md 源稿')
    for slug in slugs:
        build(slug)


if __name__ == '__main__':
    main()
