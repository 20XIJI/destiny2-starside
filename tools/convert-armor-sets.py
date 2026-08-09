#!/usr/bin/env python3
"""护甲套装效果页生成器：references/armor-sets.md → armor-sets/index.html。

源稿是 Flamia 的中文人工翻译稿，按 7 个分类重排过，数值已逐条对照英文原表
（Destiny Data Compendium 的 Google 表格导出）订正。**改这一页的文案就改
markdown 源稿，改结构就改 render()，两种情况都要重跑本脚本。**

英文原表 21 MB、大半体积是内嵌字体，不入库。它只提供两样中文稿没有的东西：
112 枚效果图标，以及比中文稿新的数值。图标已抽好落在 armor-sets/icons/，
需要重抽时把本地导出文件指给 --icons。

与 convert-artifact-mods.py 的差别：那边的源是嵌套 span 的乱麻，必须有逐字保真
闸门；这边的源是干净 markdown，转换本身即保真，因此只留结构断言。
"""

from __future__ import annotations

import argparse
import base64
import html
import io
import os
import re

import shell
from markup import die, eq, loading_attr, no_nested_span, plain, text_of

SRC = os.path.join(shell.ROOT, 'references', 'armor-sets.md')
OUT_DIR = os.path.join(shell.ROOT, 'armor-sets')

PAGE_TITLE = '护甲套装效果 · Starside'
PAGE_DESC = '56 套护甲的 2 件 / 4 件套装效果、触发条件与数值，按目的地、行动、突袭、地牢分类。'

# ── 结构断言 ──────────────────────────────────────────────────────────
# 对不上即中止，不出文件。源稿增删条目时同步改这里，不要放宽断言。
N_CATEGORIES = 7
N_SETS = 56
N_BONUSES = 112
N_ICONS = 110  # 另 2 处英文原表本身就是空白占位，不输出 <img>

# 1440×900 首屏内的图标数
N_EAGER = 2

ICON_PX = 56  # 图标存储边长；显示 40px，留 1.4x 密度
ICON_DISPLAY = 40
ALPHA_BITS = 4  # alpha 量化档数。剪影图 3x 放大与原图并排看不出差别

# ── 词表着色 ──────────────────────────────────────────────────────────
# 中文稿是纯文本，原表的着色只附在英文 span 上、且中文稿已重写重排，搬不过来。
# 按 design.md「术语以页内自洽为准」，改用词表着色，token 全部复用 site.css 既有的，
# 不新增渲染色。归属取自英文原表自己的编码（从其着色 span 里核出来的对应关系）。
#
# 长词必须排在短词前面：能量球 先于 能量、重型弹药 先于 弹药。
GLOSSARY: list[tuple[str, str]] = [
    # 元素与元素效果
    ('冰霜护甲', 'el-stasis'),
    ('冰霜铠甲', 'el-stasis'),
    ('烈日', 'el-solar'),
    ('电弧', 'el-arc'),
    ('虚空', 'el-void'),
    ('冰影', 'el-stasis'),
    ('缚丝', 'el-strand'),
    ('棱镜', 'el-prismatic'),
    ('动能', 'el-kinetic'),
    ('缠结', 'el-strand'),
    ('线虫', 'el-strand'),
    ('隐身', 'el-void'),
    ('吞食', 'el-void'),
    # 机制色
    ('特殊弹药', 'el-strand'),  # 站内既有约定：特殊弹药沿用缚丝绿
    ('重型弹药', 'ammo-heavy'),
    ('火箭发射器', 'ammo-heavy'),
    ('刀剑', 'ammo-heavy'),
    ('能量球', 'orb'),
    ('超能', 'orb'),
    ('护甲充能', 'armor-charge'),
    ('快速启动', 'armor-charge'),
    ('生命值', 'health'),
    ('治疗', 'health'),
    ('濒死', 'health'),
    ('战斗人员', 'enemy'),
    ('终结技', 'enemy'),
    ('精英', 'enemy'),
    ('首领', 'enemy'),
]

# 英文原表按英文名字母序，中文稿按分类与推出时间排序。52 个套装靠效果名直接对上，
# 余下 4 个英文侧的效果名没被机翻覆盖（留空），按来源 1:1 认领。
MANUAL_PAIRS = {
    '新通俗': 'New Demotic',
    '变节者利刃': "变节者's Blade",
    '深渊探索者': 'Deep Explorer',
    '黑暗纪元': 'Dark Age',
}


# ── 解析 ──────────────────────────────────────────────────────────────


class Bonus:
    def __init__(self, piece: str, name: str, blocks: list) -> None:
        self.piece = piece  # '2' | '4'
        self.name = name
        self.blocks = blocks  # [('p'|'ul', 内容)]
        self.icon: str | None = None


class Set:
    def __init__(self, name: str, meta: list[tuple[str, str]], tags: list[str]) -> None:
        self.name = name
        self.meta = meta  # [(字段名, 值)]，不含标签
        self.tags = tags
        self.bonuses: list[Bonus] = []


class Category:
    def __init__(self, name: str) -> None:
        self.name = name
        self.sets: list[Set] = []


def parse_blocks(raw: str) -> list:
    """效果正文 → 段落与列表。

    源稿里同一段内的每一行都以两个空格结尾（硬换行），跨段靠空行。
    这一点由 check() 复核，不在这里静默兼容别的写法。
    """
    blocks: list = []
    para: list[str] = []
    items: list[str] = []

    def flush() -> None:
        nonlocal para, items
        if para:
            blocks.append(('p', para))
            para = []
        if items:
            blocks.append(('ul', items))
            items = []

    for line in raw.split('\n'):
        line = line.rstrip()
        if not line.strip():
            flush()
        elif line.startswith('- '):
            if para:
                flush()
            items.append(line[2:].strip())
        else:
            if items:
                flush()
            para.append(line.strip())
    flush()
    return blocks


def parse(md: str) -> list[Category]:
    cats: list[Category] = []
    body = md[md.index('## '):]

    for chunk in re.split(r'^(?=## |### |#### )', body, flags=re.M):
        head, _, rest = chunk.partition('\n')
        if head.startswith('## '):
            cats.append(Category(head[3:].strip()))
        elif head.startswith('### '):
            if not cats:
                die('套装 %s 出现在任何分类之前' % head)
            fields = re.findall(r'^- \*\*(.+?)：\*\*[ \t]*(.*)$', rest, re.M)
            meta = [(k, v.strip()) for k, v in fields if k != '标签']
            tags = [t.strip() for k, v in fields if k == '标签'
                    for t in re.split(r'[、，,]', v) if t.strip()]
            if not tags:
                die('套装 %s 没有标签' % head[4:].strip())
            cats[-1].sets.append(Set(head[4:].strip(), meta, tags))
        elif head.startswith('#### '):
            m = re.match(r'#### ([24]) 件｜(.+)$', head)
            if not m:
                die('效果标题不合口径：%r' % head)
            if not cats or not cats[-1].sets:
                die('效果 %s 出现在任何套装之前' % head)
            raw = re.split(r'^---$', rest, flags=re.M)[0]
            cats[-1].sets[-1].bonuses.append(
                Bonus(m.group(1), m.group(2).strip(), parse_blocks(raw)))
    return cats


# ── 行内着色 ──────────────────────────────────────────────────────────
# 一趟正则走完，互不嵌套：引号里的 buff 名整体一个颜色，不会被词表再切一刀。
# 顺序即优先级，改顺序就是改语义。

_TERMS = '|'.join(re.escape(w) for w, _ in GLOSSARY)
_TOKEN = {w: t for w, t in GLOSSARY}

INLINE = re.compile(
    r'(?P<strong>\*\*(?P<strong_t>.+?)\*\*)'
    r'|(?P<code>`(?P<code_t>[^`]+)`)'
    r'|(?P<buff>“(?P<buff_t>[^”]+)”)'
    r'|(?P<unsure>\[\?[^\]]*\])'  # [?] [?%]：原作者标的待测值
    r'|(?P<pvp>\[[^\]]*\d[^\]]*\])'  # [10%]：方括号内是 PvP 数值
    r'|(?P<qm>[\d.]*\?%?)'  # +? 5? 0.5? x?：数值位上的待测标记
    # 「非」与后面的术语构成一个复合术语（非首领战斗人员＝一类敌人，非超能＝一种状态），
    # 留在着色外面会让扫读的人读到反义。「除非」「而非」里的非不构词，用后顾排除。
    r'|(?P<term>(?<![除而])非?(?:' + _TERMS + r'))'
)

ADJACENT = re.compile(r'<span class="([\w-]+)">([^<]*)</span><span class="\1">')

hits: dict[str, int] = {}


def inline(text: str) -> str:
    out: list[str] = []
    pos = 0
    for m in INLINE.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        pos = m.end()
        whole = html.escape(m.group(0))
        if m.group('strong') is not None:
            out.append('<strong>%s</strong>' % html.escape(m.group('strong_t')))
        elif m.group('code') is not None:
            out.append('<code>%s</code>' % html.escape(m.group('code_t')))
        elif m.group('buff') is not None:
            out.append('<span class="buff">%s</span>' % html.escape(m.group('buff_t')))
            hits['“”'] = hits.get('“”', 0) + 1
        elif m.group('unsure') is not None or m.group('qm') is not None:
            out.append('<span class="unsure">%s</span>' % whole)
            hits['?'] = hits.get('?', 0) + 1
        elif m.group('pvp') is not None:
            out.append('<span class="pvp">%s</span>' % whole)
            hits['[pvp]'] = hits.get('[pvp]', 0) + 1
        else:
            word = m.group(0).removeprefix('非')  # 命中数记在词表里的词上
            out.append('<span class="%s">%s</span>' % (_TOKEN[word], whole))
            hits[word] = hits.get(word, 0) + 1
    out.append(html.escape(text[pos:]))
    # 「精英」紧挨着「战斗人员」会连出两个同 class 的 span，渲染完全一样，并成一个。
    # 一次只能并掉一对，跑到不动点。
    merged = ''.join(out)
    while True:
        once = ADJACENT.sub(r'<span class="\1">\2', merged)
        if once == merged:
            return merged
        merged = once


# ── 渲染 ──────────────────────────────────────────────────────────────


def render_blocks(blocks: list) -> str:
    out: list[str] = []
    for kind, content in blocks:
        if kind == 'p':
            text = '<br>'.join(inline(line) for line in content)
            # 译注与作者注整段降一级，读作限定语
            cls = ' class="note"' if content[0].startswith(('译注：', '注：')) else ''
            out.append('<p%s>%s</p>' % (cls, text))
        else:
            items = ''.join('<li>%s</li>' % inline(i) for i in content)
            out.append('<ul>%s</ul>' % items)
    return ''.join(out)


def render(cats: list[Category]) -> str:
    # 这一页其余部分用 ''.join 拼，外壳几块之间自己补换行
    parts = ['\n'.join([
        shell.head(html.escape(PAGE_TITLE), html.escape(PAGE_DESC), app_js=True),
        shell.nav('护甲套装效果', toolbar={
            'data-section': '.cat', 'data-item': '.set',
            'data-label': '.cat-head span', 'data-noun': '套装',
            'data-chip-label': '分类'}),
        shell.page_head('护甲套装效果',
                        '同一套护甲穿满 2 件与 4 件各给一条效果，两条同时生效。'),
        '<main>\n'])]
    n_img = 0
    for ci, cat in enumerate(cats, 1):
        parts.append('<section class="cat" id="cat-%d">\n' % ci)
        parts.append('<h2 class="cat-head"><span>%s</span></h2>\n'
                     % html.escape(cat.name))
        for si, st in enumerate(cat.sets, 1):
            parts.append('<article class="set" id="set-%d-%d">\n' % (ci, si))
            parts.append('<div class="set-id">\n')
            parts.append('<h3>%s</h3>\n' % html.escape(st.name))
            if st.meta:
                rows = ''.join(
                    '<div><dt>%s</dt><dd>%s</dd></div>'
                    % (html.escape(k), html.escape(v)) for k, v in st.meta)
                parts.append('<dl class="set-meta">%s</dl>\n' % rows)
            tags = ''.join('<li>%s</li>' % html.escape(t) for t in st.tags)
            parts.append('<ul class="set-tags">%s</ul>\n' % tags)
            parts.append('</div>\n')

            parts.append('<div class="set-bonuses">\n')
            for b in st.bonuses:
                parts.append('<section class="bonus">\n')
                parts.append('<h4 class="bonus-head">')
                if b.icon:
                    # 这一页的图标走序号命名、显示尺寸固定（见 README「部署与缓存」），
                    # 与 markup.Icons 的哈希命名 + 现读尺寸不同路，只共用优先级判定。
                    parts.append(
                        '<img class="bonus-icon" src="icons/%s" alt=""'
                        ' width="%d" height="%d" %s>'
                        % (b.icon, ICON_DISPLAY, ICON_DISPLAY,
                           loading_attr(n_img, N_EAGER)))
                    n_img += 1
                else:
                    parts.append('<span class="bonus-icon" aria-hidden="true"></span>')
                parts.append('<span class="piece">%s 件</span>' % b.piece)
                parts.append('<span class="bonus-name">%s</span>' % html.escape(b.name))
                parts.append('</h4>\n')
                parts.append('<div class="bonus-body">%s</div>\n'
                             % render_blocks(b.blocks))
                parts.append('</section>\n')
            parts.append('</div>\n')
            parts.append('</article>\n')
        parts.append('</section>\n')
    parts.append('</main>\n\n' + shell.foot(
        '2026.7.26', shell.unsure_note('?'),
        compendium=True, thanks='部分翻译和排版参考自 Flamia#5238。'))
    return ''.join(parts)


# ── 闸门 ──────────────────────────────────────────────────────────────


def check(cats: list[Category], out: str) -> None:
    sets = [s for c in cats for s in c.sets]
    bonuses = [b for s in sets for b in s.bonuses]

    eq('分类数', len(cats), N_CATEGORIES)
    eq('套装数', len(sets), N_SETS)
    eq('效果数', len(bonuses), N_BONUSES)

    for s in sets:
        if [b.piece for b in s.bonuses] != ['2', '4']:
            die('套装 %s 的效果不是恰好一条 2 件加一条 4 件：%s'
                % (s.name, [b.piece for b in s.bonuses]))
        for b in s.bonuses:
            if not b.blocks:
                die('套装 %s 的 %s 件效果正文为空' % (s.name, b.piece))

    eq('图标引用数', sum(1 for b in bonuses if b.icon), N_ICONS)
    eq('产出里的图标标签数', out.count('<img class="bonus-icon"'), N_ICONS)
    eq('产出里的套装块数', out.count('class="set"'), N_SETS)
    eq('产出里的效果块数', out.count('class="bonus"'), N_BONUSES)

    # 词表里挂着却一次都没命中的规则是死配置，当场报出来而不是静默留着
    dead = [w for w, _ in GLOSSARY if not hits.get(w)]
    if dead:
        die('词表里这些词一次都没命中，删掉或改写：%s' % '、'.join(dead))

    no_nested_span(out, '护甲套装页（检查 INLINE 的分支顺序）')

    if '**' in out or '](' in out:
        die('产出里残留 markdown 标记')

    # 逐条正文保真：产出剥掉标签后必须与源稿逐字相等。着色只加标签不动字，
    # 这道断言就把「行内正则吃掉了一个数字」这类事故挡在出文件之前。
    # 两侧都先归一化：空格不算内容（design.md 三节）；markdown 的标记字符
    # （**、反引号、buff 名的引号）在页面上由字重与颜色承担，不落成字符。
    marks = '*`“”'
    bodies = re.findall(r'<div class="bonus-body">(.*?)</div>\n', out, re.S)
    eq('产出里的正文块数', len(bodies), N_BONUSES)
    for b, got in zip(bonuses, bodies):
        want = plain('\n'.join('\n'.join(content) for _, content in b.blocks), marks)
        mine = plain(text_of(got), marks)
        if mine != want:
            die('正文与源稿不一致（%s 件｜%s）：\n  源稿 %r\n  产出 %r'
                % (b.piece, b.name, want[:120], mine[:120]))


# ── 图标 ──────────────────────────────────────────────────────────────


def extract_icons(cats: list[Category], export: str) -> None:
    """从英文原表导出文件抽 112 枚图标，按中文稿的文档顺序命名 001…112。

    原图 70×70、纯白剪影 + alpha，三个色通道恒为白，丢掉彩色通道是无损的。
    再降到 56px 并把 alpha 量化到 16 档，112 枚合计从 238 KB 降到约 114 KB。
    """
    try:
        from PIL import Image
    except ImportError:
        die('抽图标需要 Pillow：pip install Pillow')

    # alpha 量化查找表：256 级压到 2**ALPHA_BITS 级
    levels = (1 << ALPHA_BITS) - 1
    ramp = [round(round(v / 255 * levels) / levels * 255) for v in range(256)]

    src = open(export, encoding='utf-8').read()
    body = src[src.index('<body'):]
    body = body[:body.index('</table>')]

    # 英文侧：每个套装一格 rowspan=2 的名字，其后两行各带一枚图标与一条效果
    eng_sets: list[str] = []
    icons: dict[str, list[str | None]] = {}
    labels: dict[str, set[str]] = {}
    cur = ''
    for row in body.split('<tr'):
        m = re.search(r'<td class=s\d+ dir=ltr rowspan=2>(.*?)<td class=s', row, re.S)
        if m:
            txt = html.unescape(re.sub(r'<[^>]+>', '|', m.group(1)))
            cur = next(p.strip() for p in txt.split('|') if p.strip())
            eng_sets.append(cur)
            icons[cur] = []
        cell = re.search(r'<td class=s\d+[^>]*colspan=\d+>(.*)$', row, re.S)
        if not (cell and cur and 'Piece |' in cell.group(1)):
            continue
        lab = re.search(r'([24]) Piece \|(.*?)(?:<br>|</span>)', cell.group(1))
        if lab:
            name = html.unescape(re.sub(r'<[^>]+>', '', lab.group(2))).strip()
            if name:
                labels.setdefault(name, set()).add(cur)
        img = re.search(r'<img\s+src="?(data:image/([^;]+);base64,([A-Za-z0-9+/=]+))',
                        row)
        icons[cur].append(img.group(3) if img else None)

    if len(eng_sets) != N_SETS:
        die('英文原表读出 %d 个套装，应为 %d' % (len(eng_sets), N_SETS))

    os.makedirs(os.path.join(OUT_DIR, 'icons'), exist_ok=True)
    written = 0
    idx = 0
    for cat in cats:
        for st in cat.sets:
            found = set()
            for b in st.bonuses:
                found |= labels.get(b.name, set())
            eng = found.pop() if len(found) == 1 else MANUAL_PAIRS.get(st.name)
            if not eng or eng not in icons:
                die('套装 %s 在英文原表里认不出对应项（候选 %s）' % (st.name, found))
            if len(icons[eng]) != 2:
                die('英文原表的 %s 读出 %d 枚图标，应为 2' % (eng, len(icons[eng])))
            for b, b64 in zip(st.bonuses, icons[eng]):
                idx += 1
                if b64 is None:  # 原表本身就是空白占位
                    continue
                im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')
                alpha = im.split()[3].resize((ICON_PX, ICON_PX),
                                             Image.Resampling.LANCZOS)
                flat = Image.new('LA', (ICON_PX, ICON_PX))
                flat.putdata([(255, v) for v in alpha.point(ramp).tobytes()])
                name = '%03d.png' % idx
                flat.save(os.path.join(OUT_DIR, 'icons', name), optimize=True)
                b.icon = name
                written += 1
    if written != N_ICONS:
        die('写出 %d 枚图标，应为 %d' % (written, N_ICONS))
    print('图标：写出 %d 枚到 armor-sets/icons/' % written)


def attach_icons(cats: list[Category]) -> None:
    """按文档顺序把已有的 icons/NNN.png 挂回效果上。"""
    d = os.path.join(OUT_DIR, 'icons')
    idx = 0
    for cat in cats:
        for st in cat.sets:
            for b in st.bonuses:
                idx += 1
                name = '%03d.png' % idx
                if os.path.exists(os.path.join(d, name)):
                    b.icon = name


# ── 入口 ──────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(description='护甲套装效果页生成器')
    ap.add_argument('--icons', metavar='EXPORT.HTML',
                    help='顺带从英文原表导出文件重抽图标（默认沿用 icons/ 里已有的）')
    args = ap.parse_args()

    md = open(SRC, encoding='utf-8').read()
    cats = parse(md)

    if args.icons:
        extract_icons(cats, args.icons)
    else:
        attach_icons(cats)

    out = render(cats)
    check(cats, out)

    os.makedirs(OUT_DIR, exist_ok=True)
    sets = sum(len(c.sets) for c in cats)
    bonuses = sum(len(s.bonuses) for c in cats for s in c.sets)
    shell.emit(OUT_DIR, out, '分类 %d、套装 %d、效果 %d，图标 %d，着色 %d 处'
               % (len(cats), sets, bonuses,
                  sum(1 for c in cats for s in c.sets for b in s.bonuses if b.icon),
                  sum(hits.values())))


if __name__ == '__main__':
    main()
