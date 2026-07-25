#!/usr/bin/env python3
"""把 Google Sheets htmlview 的 SingleFile 导出转成语义化组件页。

用法：
    python3 tools/convert-artifact-mods.py <导出的 .html> <输出目录>

例：
    git show 003317d:artfactmods/index.html > /tmp/sheet-export.html
    python3 tools/convert-artifact-mods.py /tmp/sheet-export.html artifact-mods/

产出 <输出目录>/index.html 与 <输出目录>/icons/*.png。
每赛季重新导出后原地重跑即可；样式不在产物里，改样式改 CSS 文件。

任何解析不上的结构、映射表外的颜色、对不上的自检都直接抛错中止，不出半成品。
"""

import base64
import hashlib
import html as htmllib
import os
import re
import struct
import sys
from collections import Counter
from typing import NoReturn

# ── 配色：原表格 50 个色值 → 22 个语义 token ──────────────────────────────
# 基准色取每族出现次数最多的那个；同族浅深变体并入基准色。
# 详见 plans 里的映射表；改这里等于改站点色板，CSS 侧的 class 名要同步。
COLOR_MAP = {
    # 元素主色
    '#89cdd1': 'el-arc',        # 74 电弧/增幅/电弧武器
    '#a2c4c9': 'el-arc',        # 5  离子轨迹/光能
    '#73e5e9': 'el-arc',        # 2
    '#85cab7': 'el-arc',        # 2  银白利刃（青绿，就近取色）
    '#42c0c1': 'el-arc',        # 1  属性加成
    '#79bec3': 'el-arc',        # 1  增幅
    '#67c9cf': 'el-arc',        # 1  增幅
    '#6fa8dc': 'el-stasis',     # 72 冰霜护甲/冰影武器
    '#7cadff': 'el-stasis',     # 10 冰影/护盾
    '#9fc5e8': 'el-stasis',     # 5  冰影碎片
    '#6d9eeb': 'el-stasis',     # 4  武器激涌（蓝，就近取色）
    '#8ecbff': 'el-stasis',     # 2  眩晕
    '#63d275': 'el-strand',     # 52 缚丝；原表格同色也用于「特殊弹药」，保持共用
    '#93c47d': 'el-strand',     # 32 缠结/织造铠甲
    '#b6d7a8': 'el-strand',     # 10 线虫
    '#5ba66a': 'el-strand',     # 2
    '#9adf92': 'el-strand',     # 1
    '#018d3b': 'el-strand',     # 1  一句注释，深绿在深底上不可读，归亮绿
    '#bba5f3': 'el-void',       # 48 虚空/虚空裂口
    '#b4a7d6': 'el-void',       # 29 隐身/职业技能能量
    '#8e7cc3': 'el-void',       # 12 吞食/压制/苦痛之力
    '#d0aaff': 'el-void',       # 1
    '#999999': 'el-kinetic',    # 47 动能武器/动能弹药盒
    '#cccccc': 'el-kinetic',    # 2
    '#b7b7b7': 'el-kinetic',    # 1
    '#e0a261': 'el-solar',      # 28 烈日/手雷/焰灵
    '#f6b26b': 'el-solar',      # 22 烈日武器/焕光/灼烧
    '#ff9900': 'el-solar',      # 4  点燃
    '#fbbdec': 'el-prismatic',  # 13 棱镜/超凡
    # 元素减益（作者有意区分的第二档）
    '#c27ba0': 'deb-void',      # 54 削弱
    '#a64d79': 'deb-void',      # 1  30% 削弱
    '#6aa84f': 'deb-strand',    # 26 割裂/瓦解
    '#76a5af': 'deb-arc',       # 16 震颤
    '#3d85c6': 'deb-stasis',    # 12 冻结
    '#3c78d8': 'deb-stasis',    # 4  碎裂/击碎
    '#b45f06': 'deb-solar',     # 2  暗影减益
    # 机制色
    '#a4c2f4': 'enemy',         # 156 战斗人员/勇士/精英/盟友/数值
    '#ffd966': 'orb',           # 98  能量球/超能能量/焕光
    '#ffe483': 'orb',           # 3   大型能量球/英勇利刃
    '#a481e1': 'ammo-heavy',    # 60  威能弹药/火箭/机枪/刀剑
    '#dd7e6b': 'health',        # 42  生命值/治疗
    '#f1c232': 'stack',         # 40  精准命中/增益层数
    '#d5a6bd': 'pickup',        # 49  元素拾取物/技能能量/护盾
    '#ccae3b': 'armor-charge',  # 6   消耗护甲充能
    # 批注
    '#e06666': 'note',          # 70  作者注释与限制说明
    '#c67676': 'note',          # 2
    '#ff9f9c': 'note',          # 2
    '#ea9999': 'unsure',        # 43  [?] [2.5%] 待测数值
    '#ff00ff': 'joke',          # 1   那句「不起任何作用哈哈哈」
    # 近白色：原色几乎等于正文色，跟随正文
    '#e4f2f4': 'plain',         # 1
    '#d5e1e3': 'plain',         # 1  致盲
}

PAGE_TITLE = '赛季神器模组 · Starside'

# 顶部 sticky 单元：导航行 + 空工具条槽位。
# 工具条内容由 assets/app.js 从 DOM 构建，此处不写任何源文本，
# 否则页面里会出现源表格文本的第二份副本、保真自检立即报重复。
NAV = ('<div class="site-head">'
       '<nav class="site-nav">'
       '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>'
       '<a class="home" href="../index.html">Starside</a>'
       '<span class="sep">/</span>'
       '<span aria-current="page">赛季神器模组</span>'
       '</nav>'
       '<div class="toolbar"></div>'
       '</div>')


def die(msg) -> NoReturn:
    raise SystemExit('转换中止：' + msg)


def must(m: 're.Match[str] | None', msg) -> 're.Match[str]':
    """结构对不上就当场报错，不给 None 往下传的机会。"""
    if m is None:
        die(msg)
    return m


# 属性值里可能塞着内联 SVG（带 > 和引号），标签匹配必须跳过引号内的内容
TAG = r'<%s((?:"[^"]*"|\'[^\']*\'|[^>])*)>'


def url_prefix(_outdir):
    """组件页内的资源引用前缀。

    用相对路径（空前缀）而非站内绝对路径：绝对路径在 file:// 下会指向磁盘根目录，
    双击打开即丢样式。代价是访问 /artifact-mods（无尾斜杠）时 base 会落到站点根，
    所以站内链接一律写全 <目录>/index.html。
    """
    return ''


# ── 文本归一化（保真比对用） ────────────────────────────────────────────
def text_of(frag):
    # 剥标签时必须跳过引号内的内容：图标 src 里塞了带 > 的内联 SVG
    t = re.sub(r'<(?:"[^"]*"|\'[^\']*\'|[^>])*>', '', frag)
    t = htmllib.unescape(t).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def canon_color(raw):
    c = raw.strip().lower()
    if c.startswith('rgb'):
        r, g, b = (int(x) for x in re.findall(r'\d+', c)[:3])
    else:
        c = c.lstrip('#')
        if len(c) == 3:
            c = ''.join(ch * 2 for ch in c)
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return '#%02x%02x%02x' % (r, g, b)


# ── 内联着色 → 语义 class ───────────────────────────────────────────────
# 着色以外可安全丢弃的内联声明：本站由 site.css 统一控制，源表格的写法不再生效
DROP_DECLS = {'font-weight', 'text-shadow'}


def colorize(frag, stats):
    def repl(m):
        tag, attrs = m.group(1), m.group(2)
        style = re.search(r'style="([^"]*)"|style=([^\s>]+)', attrs)
        decls = []
        if style:
            decls = [d.strip() for d in (style.group(1) or style.group(2) or '').split(';')
                     if d.strip()]
        color = next((d for d in decls if d.lower().startswith('color')), None)
        if color is None:  # <font color=x>
            attr = re.search(r'\bcolor=(?:"([^"]*)"|([^\s>]+))', attrs)
            if not attr:
                die('<%s> 既无 style color 也无 color 属性：%s' % (tag, m.group(0)))
            raw = attr.group(1) or attr.group(2) or ''
        else:
            raw = color.split(':', 1)[1]
            decls.remove(color)
        key = canon_color(raw)
        if key not in COLOR_MAP:
            die('颜色 %s（原写法 %s）不在 COLOR_MAP 里，先决定它的语义 token' % (key, raw))
        stats[key] += 1
        # 除颜色外余下的声明是 Google Sheets 的渲染残留：字重与文字阴影。
        # 本站由 assets/site.css 的语义 class 统一定字重、正文一律不加阴影，故丢弃。
        # 出现 DROP_DECLS 以外的声明即中止——不静默丢掉可能承载语义的样式。
        for d in decls:
            name = d.split(':', 1)[0].replace('!important', '').strip().lower()
            if name not in DROP_DECLS:
                die('<%s> 带未知内联声明 %r，先决定它归站点样式还是归内容：%s'
                    % (tag, d.strip(), m.group(0)[:120]))
        return '<span class="%s">' % COLOR_MAP[key]

    frag = re.sub(TAG % '(span|font)', repl, frag)
    return frag.replace('</font>', '</span>')


def clean_frag(frag):
    """描述/标签单元格：转着色，删 Sheets 残留属性，压掉多余空白。"""
    frag = re.sub(r'\s*title=Image\b', '', frag)
    frag = re.sub(r'\s+', ' ', frag).strip()
    return frag


# ── 图标 ────────────────────────────────────────────────────────────────
def png_size(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        die('图标不是 PNG（IHDR 缺失）')
    return struct.unpack('>II', data[16:24])


class Icons:
    def __init__(self, outdir, css_vars):
        self.dir = os.path.join(outdir, 'icons')
        os.makedirs(self.dir, exist_ok=True)
        self.url = url_prefix(outdir) + 'icons/'
        self.vars = css_vars
        self.written = {}

    def save(self, b64):
        data = base64.b64decode(b64)
        name = hashlib.md5(data).hexdigest()[:10] + '.png'
        if name not in self.written:
            with open(os.path.join(self.dir, name), 'wb') as f:
                f.write(data)
            self.written[name] = png_size(data)
        return name, self.written[name]

    def img(self, cell, cls):
        """单元格里的 <img> → 外置图标的 <img>。两种来源都要认。"""
        tag = must(re.search(TAG % 'img', cell),
                   '该单元格应含图标但没有 <img>：%s' % cell[:120]).group(0)
        direct = re.search(r'src=(?:"|\')?data:image/png;base64,([A-Za-z0-9+/=]+)', tag)
        if direct:
            b64 = direct.group(1)
        else:  # SingleFile 的透明 SVG 占位 + background-image:var(--sf-img-N)
            var = re.search(r'background-image:var\((--sf-img-\d+)\)', tag)
            if not var or var.group(1) not in self.vars:
                die('无法解析图标来源：%s' % tag[:200])
            b64 = self.vars[var.group(1)]
        name, (w, h) = self.save(b64)
        return ('<img class="%s" src="%s%s" alt="" '
                'width="%d" height="%d" loading="lazy">' % (cls, self.url, name, w, h))


# ── 解析导出文件 ────────────────────────────────────────────────────────
def cells_of(row):
    return re.findall(r'<td([^>]*)>(.*?)</td>', row, re.S)


def attr(attrs, name):
    m = re.search(r'\b%s=(?:"([^"]*)"|([^\s>]+))' % name, attrs)
    return (m.group(1) or m.group(2)) if m else ''


def parse(src, icons):
    body = src[src.find('<body'):]
    h1 = text_of(must(re.search(r'<h1[^>]*>(.*?)</h1>', body, re.S), '找不到 <h1>').group(1))
    sub = text_of(must(re.search(r'class=en-sub[^>]*>(.*?)</div>', body, re.S),
                       '找不到 .en-sub 副标题').group(1))

    tb = body[body.find('<tbody>'):body.find('</table>')]
    rows = re.split(r'(?=<tr)', tb)[1:]

    page = {'h1': h1, 'sub': sub, 'lede': [], 'notice': {}, 'sections': []}
    pending = None          # 名称行暂存，等下一行描述
    last_was_section = False

    for row in rows:
        cs = cells_of(row)
        texts = [text_of(c) for _, c in cs]
        has_img = ['<img' in c for _, c in cs]

        # 页首介绍块
        if any('intro-title' in a for a, _ in cs):
            page['notice']['title'] = next(text_of(c) for a, c in cs if 'intro-title' in a)
            page['notice']['emblems'] = [icons.img(c, 'emblem')
                                         for _, c in cs if '<img' in c]
            last_was_section = False
            continue
        if any('intro-message' in a for a, _ in cs):
            page['notice']['body'] = next(text_of(c) for a, c in cs if 'intro-message' in a)
            last_was_section = False
            continue

        cg = [(a, c) for a, c in cs if re.search(r'class=(?:")?cg[123]', a)]

        # 通栏文字行（colspan=10）：第一条是「神器模组」标题，第二条是导语
        if not cg and len(cs) == 1 and attr(cs[0][0], 'colspan') == '10' and texts[0]:
            page['lede'].append(clean_frag(colorize(cs[0][1], STATS)))
            last_was_section = False
            continue

        # 分节标题行：中间是神器名，两侧是装饰徽章
        if not cg and any(has_img) and any(t for t, i in zip(texts, has_img) if not i):
            name = next(t for t, i in zip(texts, has_img) if not i and t)
            m = re.match(r'^(.*?)\s*(\(.*\)|（.*）)$', name)
            page['sections'].append({
                'name': m.group(1) if m else name,
                'paren': m.group(2) if m else '',
                'emblems': [icons.img(c, 'art-emblem') for _, c in cs if '<img' in c],
                'tags': '',
                'mods': [],
            })
            last_was_section = True
            continue

        # 元素/武器标签行：紧跟分节标题，单个有文字的通栏格，无图
        if last_was_section and not cg and not any(has_img) and any(texts):
            frag = next(c for (_, c), t in zip(cs, texts) if t)
            page['sections'][-1]['tags'] = clean_frag(colorize(frag, STATS))
            last_was_section = False
            continue
        last_was_section = False

        if not cg:
            if any(texts):
                die('无法归类的非空行：%s' % row[:200])
            continue                                   # 占位空行

        if all('⯁' in t for t in (text_of(c) for _, c in cg)):
            continue                                   # 档位表头，档位由 cg1/2/3 决定

        def tier_of(a):
            return int(must(re.search(r'cg([123])', a), '单元格缺 cg 档位类：' + a).group(1))

        if any('colspan' in a for a, _ in cg):         # 描述行
            if pending is None:
                die('出现描述行但没有对应的名称行：%s' % row[:200])
            descs = {tier_of(a): clean_frag(colorize(c, STATS)) for a, c in cg}
            if set(descs) != set(pending):
                die('名称行与描述行的档位对不上：%s vs %s' % (sorted(pending), sorted(descs)))
            for tier in sorted(descs):
                icon, name = pending[tier]
                page['sections'][-1]['mods'].append(
                    {'tier': tier, 'icon': icon, 'name': name, 'desc': descs[tier]})
            pending = None
        else:                                          # 名称行：(图标, 名称) 成对
            pending = {}
            for tier in (1, 2, 3):
                pair = [(a, c) for a, c in cg if tier_of(a) == tier]
                if not pair:
                    continue
                if len(pair) != 2:
                    die('档位 %d 的名称行不是「图标 + 名称」两格：%s' % (tier, row[:200]))
                icon_cell = next(c for _, c in pair if '<img' in c)
                name_cell = next(c for _, c in pair if '<img' not in c)
                # 有 18 个模组名自带着色（苦痛之力、焕光碎片…），名称格也要保留标记
                pending[tier] = (icons.img(icon_cell, 'mod-icon'),
                                 clean_frag(colorize(name_cell, STATS)))
    if pending is not None:
        die('最后一个名称行没有配到描述行')
    return page


# ── 生成 HTML ───────────────────────────────────────────────────────────
def rows_of(mods):
    """模组按行成组：一行 = 游戏内同一组的一级 / 二级 / 三级。

    s['mods'] 已是行主序，按 3 切块即得行。档位对不上就报错——
    行分组错位会让搜索隐藏模组时列位串档，宁可中止也不静默错组。
    """
    for i in range(0, len(mods), 3):
        row = mods[i:i + 3]
        tiers = [m['tier'] for m in row]
        if tiers != [1, 2, 3]:
            die('第 %d 行不是完整的一/二/三级三档：%s' % (i // 3 + 1, tiers))
        yield row


def render(page, prefix):
    o = ['<!doctype html>', '<html lang="zh-CN">', '<head>',
         '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>%s</title>' % PAGE_TITLE,
         '<meta name="theme-color" content="#0b0d14">',
         '<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">',
         '<link rel="stylesheet" href="../assets/site.css">',
         '<link rel="stylesheet" href="%sstyle.css">' % prefix,
         '<script src="../assets/app.js" defer></script>',
         '</head>', '<body>', NAV,
         # 源表格的三串标题各担一个角色：副标题降为 eyebrow，主标题作 h1，
         # 「神器模组」作正文区段标签。三串文本全部保留，不再叠三层同义标题。
         '<header class="page-head">',
         '<p class="eyebrow">%s</p>' % page['sub'],
         '<h1>%s</h1>' % page['h1'],
         '</header>', '<main>', '<section class="intro">']
    units = []   # 逐块文本，与导出文件的单元格文本对账；h1/副标题不在表格里，只走字符级比对

    o.append('<h2 class="sect-label">%s</h2>' % page['lede'][0])
    units.append(text_of(page['lede'][0]))
    for p in page['lede'][1:]:
        o.append('<p class="lede">%s</p>' % p)
        units.append(text_of(p))

    n = page['notice']
    o += ['<aside class="notice">', n['emblems'][0],
          '<div class="notice-body">',
          '<h3>%s</h3>' % n['title'], '<p>%s</p>' % n['body'],
          '</div>', n['emblems'][1], '</aside>', '</section>']
    units += [n['title'], n['body']]

    for i, s in enumerate(page['sections'], 1):
        # 神器名与档位轨合为一个 sticky 单元（.art-bar）。
        # 徽章只输出一枚：源表格左右两侧是同一张图，对称是表格的排版手段而非内容。
        o += ['<section class="artifact" id="art-%d">' % i,
              '<div class="art-bar">',
              '<header class="art-head">', s['emblems'][0],
              '<h2>%s%s</h2>' % (s['name'],
                                 ' <small>%s</small>' % s['paren'] if s['paren'] else '')]
        units.append((s['name'] + ' ' + s['paren']).strip())
        if s['tags']:
            o.append('<p class="art-tags">%s</p>' % s['tags'])
            units.append(text_of(s['tags']))
        o.append('</header>')
        # 档位轨：三枚 CSS 绘制的菱形，点亮枚数 = 档位。
        # 档位文字由 CSS content 生成，不进 HTML，因此既不进 units 也不进字符比对。
        # 原先用 ⯁（U+2BC1）表示档位，该字形在中文字体栈下无字形、整条表头渲染为空带。
        o.append('<div class="tier-rail">')
        for tier in (1, 2, 3):
            pips = ''.join('<i class="on"></i>' if t <= tier else '<i></i>'
                           for t in (1, 2, 3))
            o.append('<div class="tier-head" data-tier="%d">'
                     '<span class="rhombi" aria-hidden="true">%s</span></div>' % (tier, pips))
        o += ['</div>', '</div>', '<div class="tiers">']
        # 行是结构：按行包裹后，搜索隐藏任一模组都不会让其后模组的列位偏移
        for row in rows_of(s['mods']):
            o.append('<div class="mod-row">')
            for mod in row:
                o += ['<article class="mod" data-tier="%d">' % mod['tier'], mod['icon'],
                      '<h4>%s</h4>' % mod['name'],
                      '<p>%s</p>' % mod['desc'], '</article>']
                units += [text_of(mod['name']), text_of(mod['desc'])]
            o.append('</div>')
        o += ['</div>', '</section>']

    o += ['</main>',
          '<footer class="site-foot">',
          '<a href="../index.html">← Starside</a> · '
          '数值以游戏内实测为准，标注 <span class="unsure">[?]</span> 的条目尚待核实。',
          '</footer>',
          '</body>', '</html>', '']
    return '\n'.join(o), units


# ── 自检 ────────────────────────────────────────────────────────────────
def check(src, out, page, units, icons):
    def eq(label, got, want):
        if got != want:
            die('%s：得到 %r，期望 %r' % (label, got, want))

    eq('分节数', len(page['sections']), 7)
    mods = [m for s in page['sections'] for m in s['mods']]
    eq('模组数', len(mods), 147)
    for m in mods:
        if not (m['icon'] and m['name'] and m['desc']):
            die('模组字段有空：%r' % m)
    eq('图标引用数', out.count('<img '), 156)   # 147 模组 + 7 神器徽章 + 2 使用限制徽章
    eq('图标文件数', len(icons.written), 133)   # 引用去重后；部分模组共用图标
    eq('残留 data: 图片', out.count('data:image'), 0)
    eq('残留内联着色', len(re.findall(r'style="[^"]*color:', out)), 0)
    eq('残留内联样式', out.count('style="'), 0)   # 全部表现层声明都归 CSS
    for junk in ('immersive-translate', 'sf-hidden', 'shadowrootmode', 'sf-img',
                 'contenteditable', 'content-security-policy', 'waffle', 'ritz', 'csep'):
        eq('残留 %s' % junk, out.count(junk), 0)
    eq('着色 span 总数', sum(STATS.values()), 1176)
    eq('用到的色值数', len(STATS), 51)

    # 保真一：导出文件每个非空单元格的文本，都要在产出里对应到一个块
    old_units = Counter(t for t in (text_of(c) for _, c in
                                    re.findall(r'<td([^>]*)>(.*?)</td>',
                                               src[src.find('<tbody>'):src.find('</table>')],
                                               re.S))
                        if t and '⯁' not in t)
    new_units = Counter(t for t in units if t and '⯁' not in t)
    # 分节标题在导出里是「名称 ( 副本 )」一格，产出里是 h2 + small，文本一致
    if old_units != new_units:
        for t, n in (old_units - new_units).items():
            print('  仅在导出里 ×%d: %r' % (n, t[:90]), file=sys.stderr)
        for t, n in (new_units - old_units).items():
            print('  仅在产出里 ×%d: %r' % (n, t[:90]), file=sys.stderr)
        die('单元格文本与产出块文本对不上（上面列出了差异）')

    # 保真二：字符级多重集比对，顺序无关，任何丢字都会暴露
    old_body = src[src.find('<body'):]
    # 扩展注入的死 CSS 与 shadowroot 模板不是页面内容，比对前剥掉
    old_body = re.sub(r'<(style|template|script)[^>]*>.*?</\1>', '', old_body, flags=re.S)
    # 比对窗口 = 页首 + 正文。导航条与页脚是站点外壳、不含源文本，落在窗口外。
    new_body = out[out.find('<header'):out.rindex('</main>')]
    a = Counter(text_of(old_body).replace(' ', ''))
    b = Counter(text_of(new_body).replace(' ', ''))
    # 档位表头属于外壳而非内容：源导出用 ⯁ 表示档位，产出改为 CSS 绘制的菱形 +
    # CSS content 生成的档位文字。两侧都不参与字符比对——先断言各自计数再移除，
    # 不放宽比对强度（原先两侧各 42 个恰好相互抵消，掩盖了这一点）。
    eq('源导出档位表头 ⯁ 数', a.get('⯁', 0), 42)
    eq('产出残留 ⯁ 数', b.get('⯁', 0), 0)
    del a['⯁']
    if a != b:
        print('  多出:', dict((b - a).most_common(12)), file=sys.stderr)
        print('  缺失:', dict((a - b).most_common(12)), file=sys.stderr)
        die('全文字符比对不一致')


STATS = Counter()

if __name__ == '__main__':
    if len(sys.argv) != 3:
        die(__doc__)
    src_path, outdir = sys.argv[1], sys.argv[2]
    src = open(src_path, encoding='utf-8').read()

    css_vars = dict(re.findall(
        r'(--sf-img-\d+):\s*url\("?data:image/png;base64,([A-Za-z0-9+/=]+)"?\)', src))
    icons = Icons(outdir, css_vars)

    page = parse(src, icons)
    out, units = render(page, url_prefix(outdir))
    check(src, out, page, units, icons)

    with open(os.path.join(outdir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('index.html %.1f KB（原 %.1f KB），图标 %d 个，着色 span %d 处 → %d 个 token'
          % (len(out.encode()) / 1024, len(src.encode()) / 1024,
             len(icons.written), sum(STATS.values()), len(set(COLOR_MAP.values()))))
