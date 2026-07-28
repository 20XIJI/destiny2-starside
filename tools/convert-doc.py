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

import shell
from markup import LINK, die, inline, meta_line, whole_marker

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'references', 'docs')

# 头部的「键：值」行。键名固定，正文行不会被误认。
META_KEYS = ('描述', '更新', '页脚', '鸣谢')
META_LINE = meta_line(META_KEYS)

# 分节级声明：「色阶：列名 阈值 …」。同样按整行剥离，不进正文。
SCALE_LINE = re.compile(r'^色阶：(.*)$', re.M)

def wrap(tag, md, attrs=''):
    """一个块的内容整体只有一个标记时，class 落在块上，不套一层 span。

    <th class="t-red">红血</th> 比 <th><span class="t-red">红血</span></th> 干净，
    p.note、p.formula 同理。
    """
    md = md.strip()
    hit = whole_marker(md)
    if hit:
        return '<%s%s class="%s">%s</%s>' % (tag, attrs, hit[0], inline(hit[1], rich=True), tag)
    return '<%s%s>%s</%s>' % (tag, attrs, inline(md, rich=True), tag)


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


def scale_of(spec):
    """「色阶：列名 阈值 阈值 …」→ (列名, [阈值])。阈值须升序。

    阈值写在源稿里、一张表一套：分档是内容判断（多少算高血量随体系而变），
    生成器只负责比对，不内建任何领域常识。
    """
    parts = spec.split()
    if len(parts) < 3:
        die('「色阶：」要写成「列名 阈值 阈值 …」，至少两个阈值：%r' % spec)
    col, nums = parts[0], parts[1:]
    for n in nums:
        if not n.isdigit():
            die('「色阶：」的阈值只能是整数，写的是 %r' % n)
    vals = [int(n) for n in nums]
    if vals != sorted(vals) or len(set(vals)) != len(vals):
        die('「色阶：」的阈值要严格升序：%s' % vals)
    return col, vals


def grouped(n):
    """大数按三位一组切开，组间距由 CSS 给，**不插入逗号字符**。

    逗号进文本会破坏保真比对（源稿 12117、产出 12,117），就得在 check() 里给
    数值列开特例——闸门一旦有特例就不再是闸门。分组只是排版，交给 CSS：
    列宽也只多一个间距，插逗号要多一个整字宽。

    四位数不分组：1234 一眼就读得出来，切成 1·234 反而碎。
    """
    t = str(n)
    if len(t) <= 4:
        return t
    parts = []
    while len(t) > 3:
        parts.insert(0, t[-3:])
        t = t[:-3]
    parts.insert(0, t)
    return ''.join('<span class="g">%s</span>' % p for p in parts)


def tier_of(text, bounds):
    """数值落在第几档，1 起。不是纯数字就返回 None，不硬套。"""
    plain = re.sub(r'<[^>]+>', '', text).strip().replace(',', '')
    if not plain.isdigit():
        return None
    v = int(plain)
    tier = 1
    for b in bounds:
        if v >= b:
            tier += 1
    return tier


def render_table(lines, scale=None):
    """markdown 表格 → <table class="gen">。

    第一行是表头，第二行是 |---| 分隔。正文里再出现一行 --- 就另起一个 <tbody>，
    行组之间的分界由 CSS 的 tbody + tbody 画，不落成类名。
    每行第一格是行标题（<th scope="row">），其余是数据格。

    **首格留空即向上合并**（`rowspan`）：连续多行属于同一个行标题时，只在第一行
    写名字，后续行首格留空。源稿里那个名字只出现一次，保真比对因此照旧成立——
    重复写一遍再靠生成器去重，源稿与页面就会有两份真相。

    scale 是 (列名, [阈值])：该列的数值格按落在第几档带上 data-tier，
    由页面样式表决定每档的颜色。阈值随体系而变（突袭与地牢的血量不是一个量级），
    所以按表给，不做全页一套。
    """
    head = split_cells(lines[0])
    if len(lines) < 2 or not is_rule(split_cells(lines[1])):
        die('表格第二行必须是 |---|---| 分隔行：%s' % lines[0][:60])

    scale_at, bounds = None, []
    if scale:
        col, bounds = scale
        if col not in head:
            die('「色阶：」指的列 %r 不在表头里：%s' % (col, '｜'.join(head)))
        scale_at = head.index(col)
        if scale_at == 0:
            die('「色阶：」不能指首列，那一列是行标题不是数值')

    # 先摊平成行与行组分界，再算合并跨度：跨度要看后面几行，边扫边输出算不出来
    rows = []
    for line in lines[2:]:
        cells = split_cells(line)
        if is_rule(cells):
            rows.append(None)
            continue
        if len(cells) != len(head):
            die('表格某行有 %d 格，表头是 %d 格：%s' % (len(cells), len(head), line[:60]))
        rows.append(cells)

    span = [1] * len(rows)          # 0 表示这一行的首格并入了上一个行标题
    owner = None
    for i, cells in enumerate(rows):
        if cells is None:           # 行组分界，合并不跨组
            owner = None
            continue
        if cells[0]:
            owner = i
            continue
        if owner is None:
            die('表格某个行组的第一行首格是空的，没有可合并的行标题：%s'
                % '｜'.join(cells)[:60])
        span[owner] += 1
        span[i] = 0

    o = ['<table class="gen">', '<thead>', '<tr>']
    o += [wrap('th', c, ' scope="col"') for c in head]
    o += ['</tr>', '</thead>', '<tbody>']
    # data-band 让相邻的合并块能上交替底色。CSS 数不了「第几个合并块」——每块行数
    # 不等，:nth-child 对不上，计数器又不能参与着色，所以这一位由生成器打。
    # 只有真用到合并的表才需要它；没有合并的表照旧输出干净的 <tr>。
    banded = any(n > 1 for n in span)
    band = 1
    for cells, n in zip(rows, span):
        if cells is None:
            o += ['</tbody>', '<tbody>']
            band = 1
            continue
        row = []
        if n:
            band ^= 1               # 每遇到一个新行标题翻一次
            attrs = ' scope="row"' + (' rowspan="%d"' % n if n > 1 else '')
            row.append(wrap('th', cells[0], attrs))
        for at, c in enumerate(cells[1:], start=1):
            if at == scale_at:
                tier = tier_of(c, bounds)
                if tier is None:
                    die('「色阶：」指的列里有非数值格：%r' % c[:40])
                # 色阶列是纯数值，直接输出：分组标签由 grouped() 给，
                # 不走 wrap()——那条路会把 <span> 当文本转义掉
                row.append('<td data-tier="%d">%s</td>' % (tier, grouped(int(c))))
                continue
            row.append(wrap('td', c))
        o.append('<tr%s>%s</tr>'
                 % (' data-band="%d"' % band if banded else '', ''.join(row)))
    o += ['</tbody>', '</table>']
    return o


def render_blocks(chunk, scale=None):
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
            o += render_table([ln.strip() for ln in lines[start:i]], scale)
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
    thanks = meta('鸣谢', required=False)
    if not re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}', stamp):
        die('「更新：」要写成 YYYY.M.D，源稿写的是 %r' % stamp)

    full = '%s · Starside' % title
    o = [shell.head(full, desc),
         shell.nav(title),
         shell.page_head(title),
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
        # 「色阶：」是分节级声明，按整行剥离——留在正文里会进保真比对
        scale = None
        hit = SCALE_LINE.search(chunk)
        if hit:
            scale = scale_of(hit.group(1).strip())
            chunk = SCALE_LINE.sub('', chunk)
        o.append('<section class="block">')
        o.append('<h2 class="sect-label">%s</h2>' % inline(head.strip(), rich=True))
        o += render_blocks(chunk, scale)
        o.append('</section>')

    # 鸣谢只写在该贡献者实际参与的页面上，不做全站铺开
    o += ['</main>', '',
          shell.foot(stamp,
                     inline(foot, rich=True) if foot else '',
                     thanks=inline(thanks, rich=True) if thanks else None)]
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
    src = SCALE_LINE.sub('', META_LINE.sub('', md[md.index('\n'):]))
    for raw in src.split('\n'):
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
