#!/usr/bin/env python3
"""把 references/artifact-mods.md 转成神器模组页。

用法：
    python3 tools/convert-artifact-mods.py

产出 artifact-mods/index.html。图标已压在 artifact-mods/icons/ 里，按文件名引用，
尺寸从 PNG 的 IHDR 现读，不在源稿里重复记。
解析不上的结构、对不上的计数一律抛错中止，不出半成品。
"""

import html as htmllib
import os
import re
import struct
import sys
from typing import NoReturn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'references', 'artifact-mods.md')
OUT_DIR = os.path.join(ROOT, 'artifact-mods')

PAGE_TITLE = '神器模组 · Starside'
PAGE_DESC = '7 件神器、147 个模组的效果与数值，一级／二级／三级并排对照。'

N_SECTIONS = 7
N_MODS = 147
N_ICON_REFS = 156          # 147 个模组 + 7 枚神器徽章 + 2 枚提示徽章
N_ICON_FILES = 133

# 1440×900 首屏内的图标数（提示徽章 2 + 首个神器徽章 1 + 首行模组 3）。给首屏图片
# 加 loading="lazy" 会让它们等布局算完才开始下载，是反模式；这几张改成高优先级预取。
N_EAGER = 6

# 站点页脚。
FOOT = ('<footer class="site-foot">'
        '<p><span class="stamp">更新 2026.7.26</span>'
        '数值以游戏内实测为准，标注 <span class="unsure">[?]</span> 的条目尚待核实。</p>'
        '<p>数据源：<a href="https://docs.google.com/spreadsheets/u/0/d/'
        '1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4" target="_blank" rel="noopener">'
        'Destiny Data Compendium</a>。本页在其基础上统一了术语、标点与排版，数值未作改动。</p>'
        '<p>© 2026 Eliver · '
        '<a href="https://space.bilibili.com/26117485" target="_blank" rel="noopener">'
        '哔哩哔哩</a></p>'
        '<p class="legal">Starside 为非官方资料站，与 Bungie, Inc. 无从属关系。'
        'Destiny 2 及相关名称、标识为 Bungie, Inc. 的商标。</p>'
        '</footer>')

# 顶部 sticky 单元：导航行 + 空工具条槽位（内容由 assets/app.js 从 DOM 构建）。
NAV = ('<div class="site-head">'
       '<nav class="site-nav">'
       '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>'
       '<a class="home" href="../index.html">Starside</a>'
       '<span class="sep">/</span>'
       '<span aria-current="page">神器模组</span>'
       '</nav>'
       '<div class="toolbar"></div>'
       '</div>')

# 字体在 CSS 解析完才会被发现，preload 让它与样式表并行下载。只预载首屏用到的
# 600 字重，700 等到用时再取。
PRELOAD = ('<link rel="preload" href="../assets/fonts/chakra-petch-600.woff2" '
           'as="font" type="font/woff2" crossorigin>')

# 站内导航预取：悬停即取，页面本身十几 KB，切换基本无感。不支持的浏览器忽略。
SPEC = ('<script type="speculationrules">'
        '{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}'
        '</script>')


TIERS = {'一级': 1, '二级': 2, '三级': 3}

# 源稿里的「键：值」行。键名固定，正文行不会被误认。
META_KEYS = ('副标题', '小标题', '标题', '徽章', '括注', '图标', '标签（站点补充）', '标签')
META_LINE = re.compile(r'^(?:%s)：.*$' % '|'.join(META_KEYS), re.M)


def die(msg) -> NoReturn:
    raise SystemExit('转换中止：' + msg)


def must(m: 're.Match[str] | None', msg) -> 're.Match[str]':
    """结构对不上就当场报错，不给 None 往下传的机会。"""
    if m is None:
        die(msg)
    return m


# 组件页内的资源引用前缀。用相对路径（空前缀）而非站内绝对路径：绝对路径在 file://
# 下会指向磁盘根目录，双击打开即丢样式。代价是访问 /artifact-mods（无尾斜杠）时 base
# 会落到站点根，所以站内链接一律写全 <目录>/index.html。
URL_PREFIX = ''


def text_of(frag):
    t = re.sub(r'<(?:"[^"]*"|\'[^\']*\'|[^>])*>', '', frag)
    t = htmllib.unescape(t).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def chars_of(frag):
    """去空格的文本视图。分段的不变量。"""
    return text_of(frag).replace(' ', '')


# ── 行内着色 ────────────────────────────────────────────────────────────
# 源稿用 {token|文字} 写着色，token 即 assets/site.css :root 里的语义名。
# 文本里从不出现 { 与 }，所以这对括号可以当标记字符；| 在文本里常见，但只有紧跟
# 在 token 名后面的那个才是分隔符。支持嵌套（「说明里套一个术语」有 10 处）。
COLOR_OPEN = re.compile(r'\{([\w-]+)\|')


def inline(md):
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


# ── 图标 ────────────────────────────────────────────────────────────────
def png_size(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        die('图标不是 PNG（IHDR 缺失）')
    return struct.unpack('>II', data[16:24])


class Icons:
    """按文件名引用已压好的图标，尺寸从 PNG 头现读，不在源稿里重复记。"""

    def __init__(self, outdir):
        self.dir = os.path.join(outdir, 'icons')
        self.url = URL_PREFIX + 'icons/'
        self.size = {}
        self.refs = 0

    def img(self, name, cls):
        if name not in self.size:
            path = os.path.join(self.dir, name)
            if not os.path.exists(path):
                die('源稿引用的图标不存在：icons/%s' % name)
            with open(path, 'rb') as f:
                self.size[name] = png_size(f.read(64))
        w, h = self.size[name]
        # 引用顺序即文档顺序：parse() 按提示徽章 → 分节徽章 → 模组图标依次取图
        eager = self.refs < N_EAGER
        self.refs += 1
        return ('<img class="%s" src="%s%s" alt="" width="%d" height="%d" %s>'
                % (cls, self.url, name, w, h,
                   'fetchpriority="high"' if eager else 'loading="lazy"'))


# ── 解析源稿 ────────────────────────────────────────────────────────────
def blocks_of(chunk):
    """空行分段，段内换行还原成 <br>。"""
    return ['<br>'.join(b.strip().split('\n'))
            for b in re.split(r'\n\s*\n', chunk.strip()) if b.strip()]


def parse(md, icons):
    """源稿 → page 字典。字典的形状就是 render() 的契约。"""
    page = {'sub': '', 'lede': [], 'notice': {}, 'sections': []}

    def meta(chunk, key, where):
        return must(re.search(r'^%s：(.*)$' % key, chunk, re.M),
                    '%s 缺「%s：」一行' % (where, key)).group(1).strip()

    def meta_opt(chunk, key):
        m = re.search(r'^%s：(.*)$' % key, chunk, re.M)
        return m.group(1).strip() if m else ''

    def keys_in(chunk, want, where):
        """「键：值」行的条数必须与预期相符。

        body() 按键名整行剥离，正文里真出现这样一行会被静默吃掉——数目对不上
        就当场中止，不让内容悄悄消失。
        """
        got = len(META_LINE.findall(chunk))
        if got != want:
            die('%s 的「键：值」行有 %d 条，期望 %d 条' % (where, got, want))

    def body(chunk):
        """剥掉「键：值」行，剩下的就是正文。

        键名是固定的一小撮，不按「短前缀 + 冒号」猜——正文里「伤害：2.8% | …」
        「单人游玩时：」这类行长得一模一样，猜就会把正文吃掉。
        """
        return META_LINE.sub('', chunk)

    parts = re.split(r'^## ', md, flags=re.M)
    head = parts[0]
    page['sub'] = inline(must(re.search(r'^副标题：(.*)$', head, re.M),
                              '源稿开头缺「副标题：」').group(1).strip())

    for part in parts[1:]:
        title, _, chunk = part.partition('\n')
        title = title.strip()

        if title == '导语':
            keys_in(chunk, 1, '导语')
            page['lede'].append(inline(meta(chunk, '小标题', '导语')))
            page['lede'] += [inline(b) for b in blocks_of(body(chunk))]
            continue

        if title == '提示':
            keys_in(chunk, 2, '提示')
            embs = meta(chunk, '徽章', '提示').split()
            if len(embs) != 2:
                die('提示需要两枚徽章，源稿给了 %d 枚' % len(embs))
            page['notice'] = {
                'emblems': [icons.img(n, 'emblem') for n in embs],
                'title': inline(meta(chunk, '标题', '提示')),
                'body': inline('\n'.join(blocks_of(body(chunk)))),
            }
            continue

        if not title.startswith('神器：'):
            die('认不出的分节标题：## %s' % title)

        name = title.removeprefix('神器：').strip()
        head_chunk, _, mods_chunk = chunk.partition('\n### ')
        tags = meta_opt(head_chunk, '标签')
        site_tags = meta_opt(head_chunk, '标签（站点补充）')
        if tags and site_tags:
            die('分节「%s」同时写了标签与标签（站点补充），二选一' % name)
        sec = {
            'name': inline(name),
            'paren': inline(meta_opt(head_chunk, '括注')),
            'emblems': [icons.img(meta(head_chunk, '徽章', name), 'art-emblem')],
            'tags': inline(tags) if tags else '',
            'site_tags': inline(site_tags) if site_tags else '',
            'mods': [],
        }
        if body(head_chunk).strip():
            die('分节「%s」的头部有认不出的正文：%r' % (name, body(head_chunk).strip()[:80]))
        page['sections'].append(sec)

        for mod_chunk in ('\n### ' + mods_chunk).split('\n### ')[1:]:
            mod_title, _, mod_body = mod_chunk.partition('\n')
            keys_in(mod_body, 1, '模组「%s」' % mod_title.strip())
            tier_cn, sep, mod_name = mod_title.strip().partition(' · ')
            if not sep or tier_cn not in TIERS:
                die('模组标题要写成「### 一级 · 名称」，源稿写的是：%s' % mod_title.strip())
            sec['mods'].append({
                'tier': TIERS[tier_cn],
                'icon': icons.img(meta(mod_body, '图标', mod_name), 'mod-icon'),
                'name': inline(mod_name),
                'desc': '<br><br>'.join(inline(b) for b in blocks_of(body(mod_body))),
            })
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


def paras(desc):
    """描述按双 <br> 分段，段距交给 CSS，不靠连续换行撑开。

    只在着色 span 之外断开——span 内部也有双换行，从那里切会切出未闭合标签。
    """
    parts, depth, last = [], 0, 0
    for m in re.finditer(r'<span\b[^>]*>|</span>|(?:<br>\s*){2,}', desc):
        if m.group(0).startswith('<span'):
            depth += 1
        elif m.group(0).startswith('</span'):
            depth -= 1
        elif depth == 0:
            parts.append(desc[last:m.start()])
            last = m.end()
    parts.append(desc[last:])
    parts = [re.sub(r'^(?:<br>\s*)+|(?:<br>\s*)+$', '', p.strip()) for p in parts]
    parts = [p for p in parts if p]
    if chars_of(''.join(parts)) != chars_of(desc):
        die('分段丢了字符：%r' % desc[:160])
    return parts


def render(page, prefix):
    o = ['<!doctype html>', '<html lang="zh-CN">', '<head>',
         '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>%s</title>' % PAGE_TITLE,
         '<meta name="description" content="%s">' % PAGE_DESC,
         '<meta name="theme-color" content="#0b0d14">',
         '<meta property="og:type" content="article">',
         '<meta property="og:site_name" content="Starside">',
         '<meta property="og:locale" content="zh_CN">',
         '<meta property="og:title" content="%s">' % PAGE_TITLE,
         '<meta property="og:description" content="%s">' % PAGE_DESC,
         PRELOAD,
         '<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">',
         '<link rel="stylesheet" href="../assets/site.css">',
         '<link rel="stylesheet" href="%sstyle.css">' % prefix,
         '<script src="../assets/app.js" defer></script>',
         '</head>', '<body>', NAV,
         '<header class="page-head">',
         '<h1>%s</h1>' % page['sub'],
         '</header>', '<main>', '<section class="intro">']

    o.append('<h2 class="sect-label">%s</h2>' % page['lede'][0])
    for p in page['lede'][1:]:
        o.append('<p class="lede">%s</p>' % p)

    n = page['notice']
    o += ['<aside class="notice">', n['emblems'][0],
          '<div class="notice-body">',
          '<h3>%s</h3>' % n['title'], '<p>%s</p>' % n['body'],
          '</div>', n['emblems'][1], '</aside>', '</section>']

    for i, s in enumerate(page['sections'], 1):
        # 神器名与档位轨合为一个 sticky 单元。徽章只输出一枚——源表格左右两侧
        # 是同一张图，对称属于表格的排版手段而非内容。
        o += ['<section class="artifact" id="art-%d">' % i,
              '<div class="art-bar">',
              '<header class="art-head">', s['emblems'][0],
              '<h2>%s%s</h2>' % (s['name'],
                                 ' <small>%s</small>' % s['paren'] if s['paren'] else '')]
        if s['tags']:
            o.append('<p class="art-tags">%s</p>' % s['tags'])
        elif s['site_tags']:
            # 源表格没有、由站点补上的分节标签，来源在产出里留痕
            o.append('<p class="art-tags" data-source="site">%s</p>' % s['site_tags'])
        o.append('</header>')
        # 档位轨：三枚 CSS 绘制的菱形，点亮枚数 = 档位。档位文字由 CSS content 生成。
        o.append('<div class="tier-rail">')
        for tier in (1, 2, 3):
            pips = ''.join('<i class="on"></i>' if t <= tier else '<i></i>'
                           for t in (1, 2, 3))
            o.append('<div class="tier-head" data-tier="%d">'
                     '<span class="rhombi" aria-hidden="true">%s</span></div>' % (tier, pips))
        o += ['</div>', '</div>', '<div class="tiers">']
        # 行是结构：搜索隐藏任一模组时，其后模组的列位不受影响
        for row in rows_of(s['mods']):
            o.append('<div class="mod-row">')
            for mod in row:
                o += ['<article class="mod" data-tier="%d">' % mod['tier'], mod['icon'],
                      '<h4>%s</h4>' % mod['name'], '<div class="mod-desc">']
                o += ['<p>%s</p>' % p for p in paras(mod['desc'])]
                o += ['</div>', '</article>']
            o.append('</div>')
        o += ['</div>', '</section>']

    o += ['</main>', FOOT, SPEC, '</body>', '</html>', '']
    return '\n'.join(o)


# ── 自检 ────────────────────────────────────────────────────────────────
def check(page, out, icons):
    """结构计数闸门。

    源稿是可编辑的 markdown，转换本身即保真，所以没有逐字比对那一层——
    改文案就是改源稿，git diff 即变更记录。这里只钉住结构性的数目：
    源稿被误删一段、模组档位串位、图标引丢，都会在这里当场露出来。
    """
    def eq(label, got, want):
        if got != want:
            die('%s：%d，期望 %d' % (label, got, want))

    eq('分节数', len(page['sections']), N_SECTIONS)
    eq('模组数', sum(len(s['mods']) for s in page['sections']), N_MODS)
    eq('图标引用', icons.refs, N_ICON_REFS)
    eq('图标文件', len(os.listdir(icons.dir)), N_ICON_FILES)
    eq('span 闭合', out.count('<span'), out.count('</span>'))
    eq('残留内联样式', len(re.findall(r'style=', out)), 0)
    eq('未转换的着色标记', len(re.findall(r'\{[\w-]+\|', out)), 0)

    for s in page['sections']:
        if not s['mods']:
            die('分节「%s」一个模组都没有' % text_of(s['name']))


def main():
    if len(sys.argv) != 1:
        die(__doc__)
    with open(SRC, encoding='utf-8') as f:
        md = f.read()

    icons = Icons(OUT_DIR)
    page = parse(md, icons)
    out = render(page, URL_PREFIX)
    check(page, out, icons)

    with open(os.path.join(OUT_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('index.html %.1f KB，分节 %d、模组 %d、图标引用 %d，着色 %d 处'
          % (len(out.encode()) / 1024, len(page['sections']),
             sum(len(s['mods']) for s in page['sections']), icons.refs,
             out.count('<span class="')))


if __name__ == '__main__':
    main()
