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

import os
import re
import sys

import shell
from markup import (IMG, LINK, Icons, die, inline, meta_line, no_nested_span,
                    plain, text_of, whole_marker)

SRC_DIR = os.path.join(shell.ROOT, 'references', 'docs')

# 头部的「键：值」行。键名固定，正文行不会被误认。
META_KEYS = ('描述', '更新', '页脚', '鸣谢', '数据源', '导航', '路径', '上级',
             '列组', '互斥列组', '默认列组', '首屏图标', '此刻', '跳转分行',
             '图表', '标注', '默认曲线')
META_LINE = meta_line(META_KEYS)

# 分节级声明：「色阶：列名 阈值 …」。同样按整行剥离，不进正文。
SCALE_LINE = re.compile(r'^色阶：(.*)$', re.M)
CARD_LINE = re.compile(r'^卡片：(.*)$', re.M)

ICONS: 'Icons | None' = None    # 当前页面的图标登记处，由 build() 装上


CELL_BREAK = '\\\\'     # 表格单元格里的换行标记，见 render_table()


def icon_sub(md):
    """把 ![](icons/x.png) 换成 <img>。图标登记处由 build() 装上。"""
    icons = ICONS
    return IMG.sub(lambda m: icons.html(m.group(1)), md) if icons else md


def wrap(tag, md, attrs=''):
    """一个块的内容整体只有一个标记时，class 落在块上，不套一层 span。

    <th class="t-red">红血</th> 比 <th><span class="t-red">红血</span></th> 干净，
    p.note、p.formula 同理。
    """
    md = icon_sub(md.strip())
    hit = whole_marker(md)
    if hit:
        return '<%s%s class="%s">%s</%s>' % (tag, attrs, hit[0], inline(hit[1], rich=True), tag)
    return '<%s%s>%s</%s>' % (tag, attrs, inline(md, rich=True), tag)


# ── 解析 ────────────────────────────────────────────────────────────────
def broke(cell):
    r"""单元格里的 \\ 换成 <br>。

    一行源稿就是一行表格，所以格内换行只能靠标记。选 \\ 是因为中文正文、数值与
    链接里都不会出现它——用 // 会把链接里的 https:// 一并切开。
    """
    return cell.replace(CELL_BREAK, '<br>')


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


LANE = re.compile(r'^==\s*(.+?)\s*==$')


def lane_of(cells):
    """表内横幅行 `| == 近战技能 == |`：一格写组名，跨满整表宽。

    源表每个职业下面是三块横幅分节（近战技能／超能技能／星相），末列同一列复用
    ——技能填冷却，星相填碎片槽位。照搬这个形状，组名就不必摊成一个逐行重复的
    「类别」列，冷却与槽位也不必拆成两列各空一半。

    不是横幅行返回 None，其余资料页的产出一个字不变。
    """
    if len(cells) != 1:
        return None
    m = LANE.match(cells[0])
    return m.group(1) if m else None


def colkey(name):
    """列名按去掉排版件比对：空格、格内换行 \\ 与图标都不算列名的一部分。

    表头里的空格是折行点（页面样式表给表头上了 word-break: keep-all，中文只在
    空格处断行），属于排版；「色阶：」「列组：」指的是同一列，不该被排版牵着走。
    表头里的图标同理——战斗人员倍率页每个列名上面顶着一枚档位图标，那是这一列的
    标识，不是它的名字。
    """
    return ''.join(IMG.sub('', name).replace(CELL_BREAK, '').split())


NUM = re.compile(r'\d+(?:\.\d+)?')


def num(t):
    """整数写成 int，小数写成 float。生命值是整数、伤害倍率是小数，两种都要分档。"""
    return float(t) if '.' in t else int(t)


def scale_of(spec):
    """「色阶：列名 阈值 阈值 …」→ (列名, [阈值])。阈值须升序。

    阈值写在源稿里、一张表一套：分档是内容判断（多少算高血量随体系而变），
    生成器只负责比对，不内建任何领域常识。

    列名可以带空格（表头的折行点），所以从后往前认阈值：末尾连着的数值是阈值，
    剩下的是列名。
    """
    parts = spec.split()
    cut = len(parts)
    while cut and NUM.fullmatch(parts[cut - 1]):
        cut -= 1
    col, nums = ' '.join(parts[:cut]), parts[cut:]
    if not col or len(nums) < 2:
        die('「色阶：」要写成「列名 阈值 阈值 …」，至少两个阈值：%r' % spec)
    vals = [num(n) for n in nums]
    if vals != sorted(vals) or len(set(vals)) != len(vals):
        die('「色阶：」的阈值要严格升序：%s' % vals)
    return col, vals


def marks_of(md):
    """「标注：列名 值 值 …」→ [(列名, [值])]，可写多行，一列一行。

    图表默认标出的几个点，落成表上的 data-marks，由 assets/app.js 画。写在源稿里
    而不是 app.js 里：标哪几个点是内容判断（哪些光等差值得记住），与阈值同理。
    """
    out = []
    for spec in re.findall(r'^标注：(.*)$', md, re.M):
        parts = spec.split()
        cut = len(parts)
        while cut and re.fullmatch(r'-?\d+', parts[cut - 1]):
            cut -= 1
        col, nums = ' '.join(parts[:cut]), parts[cut:]
        if not col or not nums:
            die('「标注：」要写成「列名 值 值 …」：%r' % spec)
        # 同一个值写两遍不报错，去重即可——列表是手写的，重复只是手滑
        seen = []
        for n in (int(v) for v in nums):
            if n not in seen:
                seen.append(n)
        out.append((col, sorted(seen)))
    return out


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
    """数值落在第几档，1 起。不是纯数值就返回 None，不硬套。"""
    plain = re.sub(r'<[^>]+>', '', text).strip().replace(',', '')
    if not NUM.fullmatch(plain):
        return None
    v = num(plain)
    tier = 1
    for b in bounds:
        if v >= b:
            tier += 1
    return tier


def render_table(lines, scales=None, groups=None, marks=None, curves=None):
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

    marks 是 [(列名, [值])]：落成表上的 data-marks，图表据此标点。列名与值都要
    在表里真实存在，写错即中止——静默少标一个点，眼睛查不出来。

    curves 是 [列名]：落成表上的 data-lines，图表加载时只画这几条，其余由图例
    开关打开。与「默认列组：」同一条约定——**默认隐藏由 app.js 在加载时施加，
    不写进 HTML**，无 JS 时表里所有列照常可读。
    """
    head = split_cells(lines[0])
    if len(lines) < 2 or not is_rule(split_cells(lines[1])):
        die('表格第二行必须是 |---|---| 分隔行：%s' % lines[0][:60])

    col_at = {colkey(c): i for i, c in enumerate(head)}
    if groups:
        missing = [c for c in head if colkey(c) not in groups]
        if missing:
            die('这些列没写进任何「列组：」，工具条会漏掉它们：%s' % '｜'.join(missing))

    tiers = {}
    for col, bounds in (scales or {}).items():
        if colkey(col) not in col_at:
            die('「色阶：」指的列 %r 不在表头里：%s' % (col, '｜'.join(head)))
        if col_at[colkey(col)] == 0:
            die('「色阶：」不能指首列，那一列是行标题不是数值')
        tiers[col_at[colkey(col)]] = bounds

    # 先摊平成行与行组分界，再算合并跨度：跨度要看后面几行，边扫边输出算不出来。
    # 三种元素：None 是行组分界，str 是横幅行的组名，list 是一行数据格。
    rows = []
    for line in lines[2:]:
        cells = split_cells(line)
        if is_rule(cells):
            rows.append(None)
            continue
        lane = lane_of(cells)
        if lane is not None:
            rows.append(lane)
            continue
        if len(cells) != len(head):
            die('表格某行有 %d 格，表头是 %d 格：%s' % (len(cells), len(head), line[:60]))
        rows.append(cells)

    span = [1] * len(rows)          # 0 表示这一行的首格并入了上一个行标题
    owner = None
    for i, cells in enumerate(rows):
        if not isinstance(cells, list):     # 行组分界或横幅行，合并不跨组
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

    attr = ''
    if marks:
        keys = {c[0] for c in rows if isinstance(c, list)}
        spec = []
        for col, vals in marks:
            if colkey(col) not in col_at:
                die('「标注：」指的列 %r 不在表头里：%s' % (col, '｜'.join(head)))
            miss = [v for v in vals if str(v) not in keys]
            if miss:
                die('「标注：」指的值不在首列里：%s' % '、'.join(str(v) for v in miss))
            spec.append('%s %s' % (col, ' '.join(str(v) for v in vals)))
        attr += ' data-marks="%s"' % ';'.join(spec)
    if curves:
        for col in curves:
            if colkey(col) not in col_at:
                die('「默认曲线：」指的列 %r 不在表头里：%s' % (col, '｜'.join(head)))
            if col_at[colkey(col)] == 0:
                die('「默认曲线：」不能指首列，那一列是横坐标不是曲线')
        attr += ' data-lines="%s"' % '、'.join(curves)

    o = ['<table class="gen"%s>' % attr, '<thead>', '<tr>']
    o += [wrap('th', broke(c),
               ' scope="col"' + (' data-g="%s"' % groups[colkey(c)] if groups else ''))
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
        # 横幅行自己领一个 <tbody>：组间那道横线照旧由 CSS 的 tbody + tbody 画，
        # 搜索时 app.js 也按这个 tbody 数「这一组还剩几行可见」。
        if isinstance(cells, str):
            o += ['</tbody>', '<tbody>',
                  '<tr class="lane">%s</tr>'
                  % wrap('th', broke(cells),
                         ' colspan="%d" scope="colgroup"' % len(head))]
            band = 1
            continue
        row = []
        if n:
            band ^= 1               # 每遇到一个新行标题翻一次
            attrs = ' scope="row"' + (' rowspan="%d"' % n if n > 1 else '')
            row.append(wrap('th', broke(cells[0]), attrs))
        for ci, c in enumerate(cells[1:], start=1):
            if ci in tiers:
                tier = tier_of(c, tiers[ci])
                if tier is None:
                    die('「色阶：」指的列里有非数值格：%r' % c[:40])
                # 色阶列是纯数值，直接输出：分组标签由 grouped() 给，
                # 不走 wrap()——那条路会把 <span> 当文本转义掉。
                # 小数不分组：三位一组是为了读长整数，1.0110 切开只会更难读。
                text = grouped(int(c)) if '.' not in c else c
                row.append('<td data-tier="%d">%s</td>' % (tier, text))
                continue
            row.append(wrap('td', broke(c)))
        o.append('<tr%s>%s</tr>'
                 % (' data-band="%d"' % band if banded else '', ''.join(row)))
    o += ['</tbody>', '</table>']
    return o


def cards_of(spec, up):
    """「卡片：slug、slug」→ 首页那种 .entry 卡片，一条一张。

    标题、描述与更新时间从被指向的那篇源稿现读，**不在这里重抄一遍**——那三样
    在 references/docs/<slug>.md 里已经写过，抄第二份就会各改各的。
    卡片因此没有节点图标与右侧数值：那两样是首页手写的，一张一套，推导不出来。
    """
    o = ['<ul class="entries">']
    for slug in [x.strip() for x in spec.split('、') if x.strip()]:
        path = os.path.join(SRC_DIR, slug + '.md')
        if not os.path.exists(path):
            die('「卡片：」指的 %r 在 references/docs/ 下没有源稿' % slug)
        with open(path, encoding='utf-8') as f:
            doc = f.read()
        hit = re.match(r'^#\s+(.+)$', doc.split('\n')[0])
        if not hit:
            die('「卡片：」指的 %r 源稿第一行不是「# 页面标题」' % slug)
        o += ['<li>',
              '<a class="entry" href="%s%s/index.html">' % ('../' * up, where_of(doc, slug)),
              '<span class="entry-body">',
              '<h3>%s</h3>' % hit.group(1).strip(),
              '<p>%s</p>' % meta_of(doc, '描述'),
              '<span class="entry-stamp">更新 %s</span>' % meta_of(doc, '更新'),
              '</span>', '</a>', '</li>']
    o.append('</ul>')
    return o


def render_blocks(chunk, scales=None, groups=None, marks=None, curves=None, up=0):
    """分节正文 → 段落、列表、定义列表、表格、卡片。"""
    o, i = [], 0
    lines = chunk.split('\n')
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue

        if line.startswith('卡片：'):
            o += cards_of(line[len('卡片：'):], up)
            i += 1
            continue

        if line.lstrip().startswith('|'):
            start = i
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                i += 1
            o += render_table([ln.strip() for ln in lines[start:i]], scales, groups, marks, curves)
            continue

        # 定义列表：术语一行，紧跟以「: 」开头的定义行。
        # 定义可以写多行——一条技能动辄十几行说明，挤成一行没法读也没法改。
        # 连着的「: 」行并成一条 <dd>，行间落 <br>；中间的空行留作段落间隔。
        if i + 1 < len(lines) and lines[i + 1].startswith(': '):
            o.append('<dl class="rules">')
            while i + 1 < len(lines) and lines[i + 1].startswith(': '):
                o.append(wrap('dt', lines[i]))
                i += 1
                defn = []
                while i < len(lines):
                    if lines[i].startswith(': '):
                        defn.append(lines[i][2:].strip())
                        i += 1
                    elif not lines[i].strip() and i + 1 < len(lines) \
                            and lines[i + 1].startswith(': '):
                        defn.append('')     # 段落间隔，落成一个空行
                        i += 1
                    else:
                        break
                o.append(wrap('dd', '<br>'.join(defn)))
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


def meta_of(md, key, required=True):
    """头部「键：值」行的值。整个脚本只在这里认键，不另写裸正则。"""
    hit = re.search(r'^%s：(.*)$' % key, md, re.M)
    if hit is None:
        if required:
            die('源稿缺「%s：」一行' % key)
        return ''
    return hit.group(1).strip()


def flag_of(md, key):
    """布尔键只认「是」。写「否」当场报错，不静默当真——不需要就整行删掉。"""
    v = meta_of(md, key, required=False)
    if v and v != '是':
        die('「%s：」只能写「是」，源稿写的是 %r；不需要就把整行删掉' % (key, v))
    return bool(v)


def where_of(md, slug):
    """「路径：」把页面挂到子目录里（elements/arc）；缺省是 slug 本身、挂在站点根下。"""
    return meta_of(md, '路径', required=False) or slug


def render(md, slug):
    m = re.match(r'^#\s+(.+)$', md.split('\n')[0])
    if not m:
        die('源稿第一行必须是「# 页面标题」')
    title = m.group(1).strip()

    def meta(key, required=True):
        return meta_of(md, key, required)

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

    # 「此刻：是」→ 工具条槽位带 data-clock，assets/app.js 据此按本机时钟给表里
    # 当前那一格打 data-now。时刻只有运行时才知道，不能写进产出，所以走 JS。
    # 开关叫 data-clock、标记叫 data-now，两者不同名——同名时 [data-now] 会把
    # 工具条自己也选进去，样式与断言都要额外绕开它。
    if flag_of(md, '此刻'):
        toolbar = dict(toolbar or {}, **{'data-clock': ''})

    # 「图表：是」→ 工具条槽位带 data-chart，assets/app.js 据此把表画成折线图并
    # 把表本身收起。**表仍是页面本体**：无 JS 时它完整可读，与列组页默认隐藏由
    # app.js 施加是同一条约定。数据因此只有一份，不在 HTML 里另存一遍。
    if flag_of(md, '图表'):
        toolbar = dict(toolbar or {}, **{'data-chart': ''})
    marks = marks_of(md)
    if marks and not flag_of(md, '图表'):
        die('「标注：」要配合「图表：是」用，没有图就没有点可标')

    # 「默认曲线：列名、列名」→ 表上的 data-lines，图表加载时只画这几条。哪条是主线
    # 是内容判断（这一页的传说战役与标准几乎重叠，同时画只会互相盖住），与「标注：」
    # 同理写在源稿里，不写进 app.js。
    curves = [c.strip() for c in meta('默认曲线', required=False).split('、') if c.strip()]
    if curves and not flag_of(md, '图表'):
        die('「默认曲线：」要配合「图表：是」用，没有图就没有曲线可选')

    # 「导航：是」→ 顶部工具条：搜索框 + 每个分节一枚跳转 chip，与神器模组页同一套。
    # 条目是表格行，所以带这一档的表**不能用首格留空合并**——按行隐藏会把合并块
    # 豁开，行标题要逐行写全。
    if flag_of(md, '导航'):
        # 搜索按表格行工作，data-item 认的就是 .gen 的行。没有表格的页面给了搜索框
        # 也永远零命中，所以只给跳转 chip——app.js 见 data-item 缺席即走那一档。
        # 两处 if 分开写是为了保住属性顺序：既有页面的产出因此零 diff。
        rows = bool(re.search(r'^\|[-\s|]+\|$', md, re.M))
        nav = {'data-section': '.block'}
        if rows:
            nav['data-item'] = '.gen tbody tr:not(.lane)'
        nav['data-label'] = '.sect-label'
        if rows:
            nav['data-noun'] = '条目'
        nav['data-chip-label'] = '分节'
        toolbar = dict(toolbar or {}, **nav)

    # 「跳转分行：<分节标题>」→ chip 从这一节起另起一行。分节多到一行放不下时，
    # 按内容分组换行，不交给自动折行随便断在哪。指的分节要真存在，写错即中止。
    brk = meta('跳转分行', required=False)
    if brk:
        if toolbar is None or 'data-section' not in toolbar:
            die('「跳转分行：」要配合「导航：是」用，没有 chip 就没有行可分')
        titles = [IMG.sub('', h).strip() for h in re.findall(r'^## (.+)$', md, re.M)]
        if brk not in titles:
            die('「跳转分行：」指的 %r 不是任何一个分节标题' % brk)
        toolbar['data-chip-break'] = brk

    # 层数决定资源前缀与面包屑
    up = where_of(md, slug).count('/') + 1
    full = '%s · Starside' % title
    o = [shell.head(full, desc, app_js=toolbar is not None, up=up),
         shell.nav(title, toolbar, up=up, parent=meta('上级', required=False) or None),
         shell.page_head(title),
         '<main>']

    body = META_LINE.sub('', md[md.index('\n'):])
    parts = re.split(r'^## ', body, flags=re.M)
    if parts[0].strip():
        die('第一个 ## 之前有正文，资料页的正文一律归在分节里：%r'
            % parts[0].strip()[:60])
    if len(parts) == 1:
        die('源稿一个 ## 分节都没有')

    for si, part in enumerate(parts[1:], 1):
        head, _, chunk = part.partition('\n')
        # 「色阶：」是分节级声明，按整行剥离——留在正文里会进保真比对
        scales = {}
        for hit in SCALE_LINE.finditer(chunk):
            col, bounds = scale_of(hit.group(1).strip())
            if col in scales:
                die('「色阶：」给同一列 %r 写了两套阈值' % col)
            scales[col] = bounds
        chunk = SCALE_LINE.sub('', chunk)
        o.append('<section class="block" id="sec-%d">' % si)
        # 分节标题里也允许放图标：源表每个职业段前有一枚职业徽章，标题是它的位置
        o.append('<h2 class="sect-label">%s</h2>'
                 % inline(icon_sub(head.strip()), rich=True))
        o += render_blocks(chunk, scales, groups, marks, curves, up)
        o.append('</section>')

    # 「数据源：是」输出 shell.py 里那句 Destiny Data Compendium 归属，一字不改。
    # 鸣谢只写在该贡献者实际参与的页面上，不做全站铺开。
    o += ['</main>', '',
          shell.foot(stamp,
                     inline(foot, rich=True) if foot else '',
                     compendium=flag_of(md, '数据源'),
                     thanks=inline(thanks, rich=True) if thanks else None)]
    return '\n'.join(o), title


# ── 自检 ────────────────────────────────────────────────────────────────
def check(md, out, slug):
    """正文逐字保真：产出剥掉标签后与源稿逐字相等。

    两侧同样归一化：去空格，去 markdown 的标记字符（这些在页面上由字重、颜色与
    表格线承担，不落成字符）。源稿是要持续编辑的，所以不写死每种块的条数——
    真正的闸门是「一个字都没多、没少」。
    """
    lines = []
    src = CARD_LINE.sub('', SCALE_LINE.sub('', META_LINE.sub('', md[md.index('\n'):])))
    for raw in src.split('\n'):
        line = raw.strip()
        if line.startswith('|'):                      # 表格：只去分隔符与分隔行
            cells = split_cells(line)
            lane = lane_of(cells)
            if lane is not None:                      # 横幅行只留组名，== 是标记
                lines.append(lane)
            elif not is_rule(cells):
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
    want = plain(body)                                # 字重、着色与格内换行不落成字符

    main = out[out.index('<main>'):out.index('</main>')]
    # 卡片的文字来自被指向的那篇源稿，不是本篇的正文，不进逐字保真
    main = re.sub(r'<ul class="entries">.*?</ul>', '', main, flags=re.S)
    got = text_of(main)
    if got != want:
        for i, (a, b) in enumerate(zip(got, want)):
            if a != b:
                die('%s 正文第 %d 字起对不上：\n  产出 %r\n  源稿 %r'
                    % (slug, i, got[i:i + 40], want[i:i + 40]))
        die('%s 正文长度对不上：产出 %d 字，源稿 %d 字' % (slug, len(got), len(want)))

    no_nested_span(main, '%s（检查 wrap() 的整块判定）' % slug)
    if '{' in main or '}' in main:
        die('%s 有没转换的着色标记' % slug)


def build(slug):
    global ICONS
    src = os.path.join(SRC_DIR, slug + '.md')
    if not os.path.exists(src):
        die('找不到源稿 %s' % src)
    with open(src, encoding='utf-8') as f:
        md = f.read()

    where = where_of(md, slug)
    outdir = os.path.join(shell.ROOT, *where.split('/'))
    if not os.path.isdir(outdir):
        die('输出目录不存在：%s/（新页面要先建目录并写 style.css）' % where)
    eager = meta_of(md, '首屏图标', required=False)
    if eager and not eager.isdigit():
        die('「首屏图标：」要写一个整数，源稿写的是 %r' % eager)
    ICONS = Icons(outdir, int(eager) if eager else 0)

    out, title = render(md, slug)
    check(md, out, slug)

    shell.emit(outdir, out, title)


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
