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

import hashlib
import html as htmllib
import os
import re
import sys

import shell
from markup import IMG, LINK, die, img_size, inline, meta_line, whole_marker

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'references', 'docs')

# 头部的「键：值」行。键名固定，正文行不会被误认。
META_KEYS = ('描述', '更新', '页脚', '鸣谢', '列组', '互斥列组', '默认列组', '首屏图标')
META_LINE = meta_line(META_KEYS)

# 分节级声明：「色阶：列名 阈值 …」。同样按整行剥离，不进正文。
SCALE_LINE = re.compile(r'^色阶：(.*)$', re.M)

ICONS: 'Icons | None' = None    # 当前页面的图标登记处，由 build() 装上


def wrap(tag, md, attrs=''):
    """一个块的内容整体只有一个标记时，class 落在块上，不套一层 span。

    <th class="t-red">红血</th> 比 <th><span class="t-red">红血</span></th> 干净，
    p.note、p.formula 同理。
    """
    md = md.strip()
    icons = ICONS
    if icons:
        md = IMG.sub(lambda m: icons.html(m.group(1)), md)
    hit = whole_marker(md)
    if hit:
        return '<%s%s class="%s">%s</%s>' % (tag, attrs, hit[0], inline(hit[1], rich=True), tag)
    return '<%s%s>%s</%s>' % (tag, attrs, inline(md, rich=True), tag)


class Icons:
    """页面目录下的图标：尺寸从文件头现读，文件名即内容的 md5 前 10 位。

    与 artifact-mods/icons 同一条纪律——README「部署与缓存」给图标目录设了长缓存，
    前提是「改了内容必然换名字」。原地覆盖一张图会让读者看一年的旧图。
    """

    def __init__(self, outdir, eager):
        self.dir = outdir
        self.eager = eager          # 首屏之前的图标改用高优先级，其余交给 lazy
        self.size = {}
        self.refs = 0

    def html(self, rel):
        if rel not in self.size:
            path = os.path.join(self.dir, rel)
            if not os.path.exists(path):
                die('源稿引用的图标不存在：%s' % rel)
            with open(path, 'rb') as f:
                data = f.read()
            want = hashlib.md5(data).hexdigest()[:10] + os.path.splitext(rel)[1]
            if os.path.basename(rel) != want:
                die('%s 的内容与文件名对不上，应叫 %s。\n'
                    '  图标按内容哈希命名，改内容就要换名字——这是给图标目录设长缓存\n'
                    '  的前提，原地覆盖会让读者看到过期的图。' % (rel, want))
            self.size[rel] = img_size(data)
        w, h = self.size[rel]
        self.refs += 1
        return ('<img src="%s" alt="" width="%d" height="%d" %s>'
                % (rel, w, h,
                   'fetchpriority="high"' if self.refs <= self.eager else 'loading="lazy"'))


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


def colkey(name):
    """列名按去掉空格比对。

    表头里的空格是折行点（页面样式表给表头上了 word-break: keep-all，中文只在
    空格处断行），属于排版；「色阶：」「列组：」指的是同一列，不该被排版牵着走。
    """
    return ''.join(name.split())


def scale_of(spec):
    """「色阶：列名 阈值 阈值 …」→ (列名, [阈值])。阈值须升序。

    阈值写在源稿里、一张表一套：分档是内容判断（多少算高血量随体系而变），
    生成器只负责比对，不内建任何领域常识。

    列名可以带空格（表头的折行点），所以从后往前认阈值：末尾连着的整数是阈值，
    剩下的是列名。
    """
    parts = spec.split()
    at = len(parts)
    while at and parts[at - 1].isdigit():
        at -= 1
    col, nums = ' '.join(parts[:at]), parts[at:]
    if not col or len(nums) < 2:
        die('「色阶：」要写成「列名 阈值 阈值 …」，至少两个阈值：%r' % spec)
    vals = [int(n) for n in nums]
    if vals != sorted(vals) or len(set(vals)) != len(vals):
        die('「色阶：」的阈值要严格升序：%s' % vals)
    return col, vals


def columns_of(md):
    """「列组：组名 = 列名、列名 …」→ ({列名: 组名}, [组名])。

    列太多的表靠列组分批显示：工具条按组给出开关，读者自己拼视图。这里只把归属
    落成表头上的 data-g，怎么显隐是 assets/app.js 的事。

    没有声明就返回空，其余资料页的产出一个字不变。
    """
    groups, order = {}, []
    for spec in re.findall(r'^列组：(.*)$', md, re.M):
        name, sep, cols = (s.strip() for s in spec.partition('='))
        if not sep or not name or not cols:
            die('「列组：」要写成「组名 = 列名、列名 …」：%r' % spec)
        if name in order:
            die('「列组：」重复声明了 %r' % name)
        order.append(name)
        for col in cols.split('、'):
            col = colkey(col)
            if col in groups:
                die('列 %r 同时属于 %r 与 %r' % (col, groups[col], name))
            groups[col] = name
    return groups, order


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


def render_table(lines, scales=None, groups=None):
    """markdown 表格 → <table class="gen">。

    第一行是表头，第二行是 |---| 分隔。正文里再出现一行 --- 就另起一个 <tbody>，
    行组之间的分界由 CSS 的 tbody + tbody 画，不落成类名。
    每行第一格是行标题（<th scope="row">），其余是数据格。

    **首格留空即向上合并**（`rowspan`）：连续多行属于同一个行标题时，只在第一行
    写名字，后续行首格留空。源稿里那个名字只出现一次，保真比对因此照旧成立——
    重复写一遍再靠生成器去重，源稿与页面就会有两份真相。

    scales 是 {列名: [阈值]}：这些列的数值格按落在第几档带上 data-tier，
    由页面样式表决定每档的颜色。阈值随体系而变（突袭与地牢的血量不是一个量级），
    所以按表给，不做全页一套。

    groups 是 {列名: 列组名}：表头带上 data-g，工具条据此建列组开关。属性不进
    正文，保真比对看不见它。
    """
    head = split_cells(lines[0])
    if len(lines) < 2 or not is_rule(split_cells(lines[1])):
        die('表格第二行必须是 |---|---| 分隔行：%s' % lines[0][:60])

    at = {colkey(c): i for i, c in enumerate(head)}
    if groups:
        missing = [c for c in head if colkey(c) not in groups]
        if missing:
            die('这些列没写进任何「列组：」，工具条会漏掉它们：%s' % '｜'.join(missing))

    tiers = {}
    for col, bounds in (scales or {}).items():
        if colkey(col) not in at:
            die('「色阶：」指的列 %r 不在表头里：%s' % (col, '｜'.join(head)))
        if at[colkey(col)] == 0:
            die('「色阶：」不能指首列，那一列是行标题不是数值')
        tiers[at[colkey(col)]] = bounds

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
    o += [wrap('th', c, ' scope="col"' + (' data-g="%s"' % groups[colkey(c)] if groups else ''))
          for c in head]
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
            if at in tiers:
                tier = tier_of(c, tiers[at])
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


def render_blocks(chunk, scales=None, groups=None):
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
            o += render_table([ln.strip() for ln in lines[start:i]], scales, groups)
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

    groups, order = columns_of(md)
    toolbar = None
    if groups:
        def listed(key, required=True):
            names = [g.strip() for g in meta(key, required).split('、') if g.strip()]
            for g in names:
                if g not in order:
                    die('「%s：」里的 %r 没有对应的「列组：」声明' % (key, g))
            return names

        default = listed('默认列组')
        # 互斥的几组一次只开一组：全开会把行撑得过长，扫读时对不上行
        solo = listed('互斥列组', required=False)
        if len([g for g in default if g in solo]) > 1:
            die('「默认列组：」里有多个互斥组同时打开')
        toolbar = {'data-cols': '、'.join(default)}
        if solo:
            toolbar['data-solo'] = '、'.join(solo)

    full = '%s · Starside' % title
    o = [shell.head(full, desc, app_js=toolbar is not None),
         shell.nav(title, toolbar),
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
        scales = {}
        for hit in SCALE_LINE.finditer(chunk):
            col, bounds = scale_of(hit.group(1).strip())
            if col in scales:
                die('「色阶：」给同一列 %r 写了两套阈值' % col)
            scales[col] = bounds
        chunk = SCALE_LINE.sub('', chunk)
        o.append('<section class="block">')
        o.append('<h2 class="sect-label">%s</h2>' % inline(head.strip(), rich=True))
        o += render_blocks(chunk, scales, groups)
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
    body = IMG.sub('', body)                          # 图标不落成字符，两侧都不留
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
    global ICONS
    src = os.path.join(SRC_DIR, slug + '.md')
    if not os.path.exists(src):
        die('找不到源稿 %s' % src)
    with open(src, encoding='utf-8') as f:
        md = f.read()

    outdir = os.path.join(ROOT, slug)
    if not os.path.isdir(outdir):
        die('输出目录不存在：%s/（新页面要先建目录并写 style.css）' % slug)
    eager = re.search(r'^首屏图标：(\d+)$', md, re.M)
    ICONS = Icons(outdir, int(eager.group(1)) if eager else 0)

    out, title = render(md)
    check(md, out, slug)

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
