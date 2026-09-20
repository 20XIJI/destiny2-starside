#!/usr/bin/env python3
"""首页卡片的内容预览 → index.html。

首页手写，但每张卡里 `<!--pv-->` 与 `<!--/pv-->` 之间那一段由本脚本写：读者靠
预览认出那一页讲什么，而预览里的名字、数值、图标一律从那一页的产出现取，页面
一改、重跑即跟上。挑哪几项是人定的，写在下面的 PICK_* 里；取值的规则写在各自的
函数里。首页其余部分（分组、节点图标、数值、更新时间）照旧手写或由 sync_home() 改写。

用法：python3 tools/build-home.py      改写 index.html。npm run build 里排在各生成器之后，
                                     它读的是那些生成器刚写出的页面。
"""

import html
import json
import os
import re

import markup
import shell

HOME = os.path.join(shell.SITE, 'index.html')

# 人定的挑选。名字按页面上的正名写，页面里找不到即中止。
PICK_PERKS = ('聚合充能', '元素磨砺', '加速突击', '失时弹匣')
PICK_ARTIFACT = ('粒子重建', '动能合成', '狙击手冥想', '银白重炮')
PICK_SETS = (('埃希恩记忆', '2 件'), ('埃希恩记忆', '4 件'), ('溢冰', '2 件'), ('欧里克斯记忆', '2 件'))
PICK_FARMING = ('购物清单-白弹', '购物清单-绿弹', '购物清单-威能', '刷取清单-异域武器', '刷取清单-护甲套装')
PICK_SOURCES = ('Destiny Data Compendium', 'Destiny 2: Boss Damage', 'DIM 社区')
# 增伤：(名称里含, 触发里含, 首页上写的名字, 小字)。小字写 None 取「时长」那一格，
# 写 '触发' 取触发那一格，其余照写。
PICK_BUFFS = (('牵引器火炮', '命中', '牵引器火炮', None),
              ('狩猎陷阱', '陷落锚', '狩猎陷阱', None),
              ('光焰之井', '站在井内', '光焰之井', '触发'),
              ('武器属性', '0–100 区间，威能', '武器属性', '威能武器'))
# 游戏机制：护甲属性表里的两行，再加修改器、祸因两张表的首行图标与三类勇士各自的图
PICK_STATS = ('超能', '武器')
CHAMPIONS = ('屏障勇士', '过载勇士', '势不可挡勇士')
PICK_SCALARS = ('自动步枪', '斥候步枪')
SCALAR_COLS = ('红血', '橙血', '勇士', '首领')
DELTA_AT = (-50, -30, -20, -10, -5, 0, 5, 10, 20)
DELTA_MARK = (-20, 0)
PALETTE = ('c-arc', 'c-solar', 'c-void', 'c-stasis', 'c-strand', 'c-prism',
           'c-exotic', 'c-enemy', 'c-ammo', 'c-artifact')
ELEMENTS = (('电弧', 'el-arc'), ('烈日', 'el-solar'), ('虚空', 'el-void'),
            ('冰影', 'el-stasis'), ('缚丝', 'el-strand'), ('棱镜', 'el-prismatic'))

# 1440×900 下首屏装得下装备库那一排与两张配装卡：20 + 3 + 3
N_EAGER = 26

MARK = re.compile(r'<!--pv-->.*?<!--/pv-->', re.S)


def read(rel):
    with open(os.path.join(shell.SITE, rel), encoding='utf-8') as f:
        return f.read()


def text(s):
    """一格的纯文本；格内换行记成 ' / '，好按行拆"""
    return markup.text_of(re.sub(r'<br\s*/?>', ' / ', s), collapse=True).strip()


def esc(s):
    return html.escape(s, quote=True)


def near(slug, src):
    """页面里的相对图片路径 → 站点根起算的路径"""
    return os.path.normpath(os.path.join(slug, src))


def tables(slug):
    return re.findall(r'<table.*?</table>', read(slug + '/index.html'), re.S)


def heads(table):
    """表头的格内换行是排版不是分隔（「基础<br>伤害」），直接接上"""
    return [markup.text_of(x, collapse=True).strip() for x in re.findall(r'<th[^>]*scope="col"[^>]*>(.*?)</th>', table, re.S)]


def rows(slug, table):
    """表体逐行：[(单元格文本, 单元格里第一张图)]。分组横幅那种单格行跳过。"""
    out = []
    for body in re.findall(r'<tbody.*?</tbody>', table, re.S):
        for row in re.findall(r'<tr.*?</tr>', body, re.S):
            cells = []
            for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.S):
                src = re.findall(r'<img[^>]+src="([^"]+)"', c)
                cells.append((text(c), near(slug, src[0]) if src else ''))
            if len(cells) > 1:
                out.append(cells)
    return out


def sections(slug):
    """[(分节标题, 分节 HTML)]"""
    parts = re.split(r'(?=<section class="block")', read(slug + '/index.html'))[1:]
    return [(text(search(r'<h2[^>]*>(.*?)</h2>', p, slug + ' 的分节').group(1)), p) for p in parts]


def need(ok, msg):
    """条件不成立就中止。markup.must 只认 re.Match，布尔值要走这一条。"""
    if not ok:
        markup.die(msg)


def search(pattern, s, what):
    return markup.must(re.search(pattern, s, re.S), '首页预览：%s的结构对不上' % what)


def find(what, pool, name):
    need(name in pool, '首页预览：%s里找不到「%s」' % (what, name))
    return pool[name]


class Imgs:
    """按文档序给图编号：前 N_EAGER 张高优先级，其余懒加载"""

    def __init__(self):
        self.n = 0

    def __call__(self, path, size, title=''):
        need(os.path.exists(os.path.join(shell.SITE, path)), '首页预览：图不存在 %s' % path)
        w, h = size if isinstance(size, tuple) else (size, size)
        at = markup.loading_attr(self.n, N_EAGER)
        self.n += 1
        return '<img src="%s" alt=""%s width="%d" height="%d" %s>' % (
            path, ' title="%s"' % esc(title) if title else '', w, h, at)


# ── 预览件 ──

def pv_icons(img, items, size, extra=''):
    return '<span class="pv pv-icons%s">%s</span>' % (extra, ''.join(img(p, size, n) for n, p in items))


def pv_items(img, items):
    """图标在左、名字在右，最多两行：列数取条数的一半向上取整，同一列上下对齐"""
    out = []
    for icons, name, sub, cls in items:
        size = 28 if len(icons) == 1 else 22
        out.append('<span class="pv-it%s"><span class="pv-ic">%s</span><span class="pv-tx">'
                   '<span class="pv-nm">%s</span>%s</span></span>'
                   % (' ' + cls if cls else '', ''.join(img(p, size) for p in icons), esc(name),
                      '<span class="pv-sb">%s</span>' % sub if sub else ''))
    return ('<span class="pv pv-items" style="grid-template-columns: repeat(%d, max-content)">%s</span>'
            % ((len(items) + 1) // 2, ''.join(out)))


def pv_rank(img, items):
    """前三名：名次、图标、名字（下面一道按数值比例的短线）、数值"""
    top = max(v for _, v, _ in items)
    out = []
    for i, (name, v, icon) in enumerate(items):
        out.append('<span class="pv-rn">%d</span>%s<span class="pv-rname">%s<s style="width:%.1f%%"></s></span><b>%s</b>'
                   % (i + 1, img(icon, 24) if icon else '<i></i>', esc(name), 100 * v / top,
                      format(v, ',') if isinstance(v, int) else '%.3f' % v))
    return '<span class="pv pv-rank">%s</span>' % ''.join(out)


def pv_curve(points, xlab, ylab, marks):
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h, pad = 300, 64, 4

    def fx(x):
        return pad + (x - x0) / (x1 - x0) * (w - 2 * pad)

    def fy(y):
        return h - pad - (y - y0) / ((y1 - y0) or 1) * (h - 2 * pad)

    path = 'M' + ' L'.join('%.1f %.1f' % (fx(x), fy(y)) for x, y in points)
    dots = ''.join('<circle cx="%.1f" cy="%.1f" r="2.6"/><text x="%.1f" y="%.1f">%s</text>'
                   % (fx(x), fy(y), fx(x), fy(y) - 7 if fy(y) > 20 else fy(y) + 15, esc(lab))
                   for x, y, lab in marks)
    return ('<span class="pv pv-curve"><svg viewBox="0 0 %d %d" preserveAspectRatio="none" aria-hidden="true">'
            '<path d="%s"/>%s</svg><span class="pv-ax"><span>%s</span><span>%s</span></span></span>'
            % (w, h, path, dots, esc(xlab), esc(ylab)))


def pv_chips(items, sep=''):
    joint = '<em>%s</em>' % sep if sep else ''
    return '<span class="pv pv-chips">%s</span>' % joint.join(
        '<span class="pv-chip%s">%s</span>' % (' ' + c if c else '', esc(n)) for n, c in items)


def pv_table(head, body):
    cells = ''.join('<small>%s</small>' % esc(x) for x in head)
    for r in body:
        cells += '<span class="pv-th">%s</span>' % esc(r[0]) + ''.join('<b>%s</b>' % esc(v) for v in r[1:])
    return ('<span class="pv pv-table" style="grid-template-columns: auto repeat(%d, auto)">%s</span>'
            % (len(head) - 1, cells))


# ── 各页取值 ──

REC = re.compile(r'<article class="rec[^"]*"[^>]*>(.*?)</article>', re.S)
REC_NAME = re.compile(r'<div class="r-nm[^"]*">(.*?)</div>', re.S)
REC_ICON = re.compile(r'<img[^>]+src="([^"]+)"')
REC_TIER = re.compile(r'<span class="r-tier [^"]*">(.*?)</span>', re.S)
REC_TAG = re.compile(r'<b class="r-tag">(.*?)</b>', re.S)
# 评级写成一整句的那种不装徽标，单独一行（见 render.author_rows）
REC_TIER_LONG = re.compile(r'<div class="r-tier-long">(.*?)</div>', re.S)


def lg_list(slug):
    """LGpig 刷取清单：按分节 → [(名字, 图, 评级或定位)]，页内顺序即他的排序。

    按记录排版的那几页一条记录一个 article.rec，评级在作者格的徽标上、定位在
    标签上；还是表格的页面照旧按行取。
    """
    out = []
    for _, sec in sections(slug):
        got = []
        for t in re.findall(r'<table.*?</table>', sec, re.S):
            for r in rows(slug, t):
                if r[1][1]:
                    got.append((r[0][0], r[1][1], r[2][0]))
        for m in REC.finditer(sec):
            body = m.group(1)
            name, icon = REC_NAME.search(body), REC_ICON.search(body)
            if not (name and icon):
                continue
            grade = (REC_TIER.search(body) or REC_TIER_LONG.search(body)
                     or REC_TAG.search(body))
            got.append((text(name.group(1)),
                        re.sub(r'^(\.\./)+', '', icon.group(1)),
                        text(grade.group(1)) if grade else ''))
        out.append(got)
    return out


def weapons_index():
    s = read('weapons/index.js')
    return json.loads(s[s.index('{'):s.rstrip().rstrip(';').rindex('}') + 1])


def weapons(img):
    """装备库：LGpig 评 T0 的异域武器 8 把、Aegis 评 S 且 LGpig 评 T0 的传说武器
    每类一把共 6 把、三职业异域护甲各前 2 件，三类交替排。"""
    ew = [(n, p) for n, p, g in lg_list('exotic-weapons')[0] if re.search(r'T0(?!\.)', g)][:8]
    seen, leg = set(), []
    # 行：[hash, 名字, 枪型, …, tierType(8), …, 图(10), …, 评级(14)=[Aegis, LGpig]]
    for w in weapons_index()['w']:
        if w[8] == 5 and w[14] and w[14][0] == 'S' and 'T0' in w[14][1].split() and w[2] not in seen:
            seen.add(w[2])
            leg.append((w[1], 'assets/icons/%s.webp' % w[10]))
    ea = [(n, p) for sec in lg_list('exotic-armors') for n, p, _ in sec[:2]]
    need(len(ew) == 8 and len(leg) >= 6 and len(ea) == 6,
                '首页预览：装备库那一排凑不齐（T0 异域 %d、传说 %d、护甲 %d）' % (len(ew), len(leg), len(ea)))
    shelf = []
    for i in range(6):
        shelf += [ew[i], leg[i], ea[i]]
    return pv_icons(img, shelf + ew[6:], 48, ' pv-shelf')


def builds_top(slug, n):
    h = read(slug + '/index.html')
    out = []
    for m in re.finditer(r'<li class="(b-[a-z]+)"[^>]*>\s*<a class="entry"[^>]*>\s*<span class="node">(.*?)<h3>(.*?)</h3>',
                         h, re.S):
        sets = re.findall(r'<span class="n-sets">([^<]*)</span>', m.group(2))
        out.append((text(m.group(3)), m.group(1), near(slug, re.findall(r'src="([^"]+)"', m.group(2))[0]),
                    sets[0] if sets else ''))
        if len(out) == n:
            break
    need(len(out) == n, '首页预览：%s 取不到 %d 套' % (slug, n))
    return out


def builds(img):
    return pv_items(img, [([p], n, '', c) for n, c, p, _ in builds_top('builds', 3)])


def build_sets(img):
    return pv_items(img, [([p], n, esc(k), c) for n, c, p, k in builds_top('builds/sets', 3)])


def perks(img):
    pool = {}
    for t in tables('weapon-perks'):
        for r in rows('weapon-perks', t):
            if r[1][1]:
                pool.setdefault(r[0][0], r[1][1])
    # 这一页已按记录排版：一条记录一个 article.rec，名字与图各在格里
    for _, sec in sections('weapon-perks'):
        for m in REC.finditer(sec):
            name, icon = REC_NAME.search(m.group(1)), REC_ICON.search(m.group(1))
            if name and icon:
                pool.setdefault(text(name.group(1)),
                                re.sub(r'^(\.\./)+', '', icon.group(1)))
    return pv_items(img, [([find('武器 PERK 页', pool, n)], n, '', '') for n in PICK_PERKS])


def frames(img):
    """自动步枪的各框架按基础伤害取前三"""
    t = tables('weapon-frames')[0]
    col = [h.replace(' ', '') for h in heads(t)].index('基础伤害')
    got = []
    for r in rows('weapon-frames', t):
        if r[0][0] == '自动步枪':
            r = r[1:]
        elif got and len(r) == len(heads(t)):
            break
        elif not got:
            continue
        got.append((r[0][0], float(r[col - 1][0]), r[1][1]))
    need(len(got) >= 3, '首页预览：武器框架页取不到自动步枪的框架')
    return pv_rank(img, sorted(got, key=lambda x: -x[1])[:3])


def armor_mods(img):
    return pv_items(img, [([r[1][1]], r[0][0], '', '') for r in rows('armor-mods', tables('armor-mods')[0])[:4]])


def armor_sets(img):
    pool = {}
    for art in re.findall(r'<article class="set".*?</article>', read('armor-sets/index.html'), re.S):
        name = text(search(r'<h3>(.*?)</h3>', art, '护甲套装页').group(1))
        for src, piece, bonus in re.findall(r'<img class="bonus-icon" src="([^"]+)".*?<span class="piece">([^<]*)</span>'
                                            r'<span class="bonus-name">([^<]*)</span>', art, re.S):
            pool['%s %s' % (name, piece)] = (near('armor-sets', src), bonus)
    items = []
    for name, piece in PICK_SETS:
        icon, bonus = find('护甲套装页', pool, '%s %s' % (name, piece))
        items.append(([icon], '%s %s' % (name, piece), esc(bonus), ''))
    return pv_items(img, items)


def exotic_weapon(img):
    return pv_icons(img, [(n, p) for n, p, _ in lg_list('exotic-weapons')[0][:8]], 40)


def exotic_armor(img):
    return pv_icons(img, [(n, p) for sec in lg_list('exotic-armors') for n, p, _ in sec[:3]], 40)


def elements(_img):
    return pv_chips(ELEMENTS)


def artifact(img):
    pool = {}
    for m in re.finditer(r'<img class="mod-icon" src="([^"]+)"[^>]*>\s*<h4[^>]*>(.*?)</h4>', read('artifact-mods/index.html')):
        pool.setdefault(text(m.group(2)), near('artifact-mods', m.group(1)))
    return pv_items(img, [([find('神器模组页', pool, n)], n, '', '') for n in PICK_ARTIFACT])


def cooldown(_img):
    t = tables('ability-cooldown')[0]
    hd = heads(t)
    row = [r for r in rows('ability-cooldown', t) if r[0][0] == '闪电手雷'][0]
    at = [(i, re.fullmatch(r'(\d+) ?属性', h)) for i, h in enumerate(hd)]
    pts = [(int(m.group(1)), float(row[i][0])) for i, m in at if m]
    (a, ya), (b, yb) = pts[0], pts[-1]
    return pv_curve(pts, '闪电手雷 · %d → %d 属性' % (a, b), '%g → %g 秒' % (ya, yb),
                    [(a, ya, '%g' % ya), (b, yb, '%g' % yb)])


def boss_hp(img):
    t = tables('boss-hp')[0]
    got = []
    for r in rows('boss-hp', t):
        c = [x for x, _ in r]
        i = 1 if len(c) == len(heads(t)) else 0
        got.append((c[i], int(c[i + 1]), ''))
    return pv_rank(img, got[:3])


def farming(_img):
    names = {text(x) for x in re.findall(r'<h3>(.*?)</h3>', read('pve-farming/index.html'), re.S)}
    for n in PICK_FARMING:
        need(n in names, '首页预览：刷取指南页里找不到「%s」' % n)
    return pv_chips([(n, '') for n in PICK_FARMING])


def raids(img):
    got = re.findall(r'<img class="guide-shot" src="([^"]+)"[^>]*>\s*<span class="guide-name">([^<]*)</span>',
                     read('raid-guides/index.html'))[:2]
    return '<span class="pv pv-shots">%s</span>' % ''.join(
        '<span>%s<small>%s</small></span>' % (img(near('raid-guides', s), (128, 72)), esc(n)) for s, n in got)


def ranking(slug, col):
    def make(img):
        t = tables(slug)[0]
        at = heads(t).index(col)
        return pv_rank(img, [(r[0][0].split(' / ')[0], int(r[at][0]), r[1][1]) for r in rows(slug, t)[:3]])
    return make


def rotation(_img):
    """周常轮换的三行。页面上先写顺序的前三站，由首页那段内联脚本按本机时钟换成
    当前那一格；算法与 assets/rota.js 同一套，数据取自轮换页，不在首页另存一份。"""
    page = read('rotation/index.html')
    t0 = search(r'data-rota="([^"]+)"', page, '轮换页').group(1)
    body = rows('rotation', tables('rotation')[0])
    raids_ = [r[1][0] for r in body if r[1][0]]
    dungeons = [r[2][0] for r in body if r[2][0]]
    chain = [x.strip() for x in text(search(r'<p[^>]*class="chain"[^>]*>(.*?)</p>', page, '轮换页').group(1)).split('→')
             if x.strip() != '回到开头']

    def line(k, label, names, note):
        return ('<small>%s</small><span class="pv-rv" data-k="%s">%s</span><em data-k="%s-n">%s</em>'
                % (label, k, '<i>→</i>'.join('<span class="pv-chip">%s</span>' % esc(n) for n in names), k, note))

    return ('<span class="pv pv-rota" data-t0="%s" data-raids="%s" data-dungeons="%s" data-chain="%s">%s%s%s</span>'
            % (esc(t0), esc('|'.join(raids_)), esc('|'.join(dungeons)), esc('|'.join(chain)),
               line('raid', '突袭', raids_[:3], '每周'), line('dungeon', '地牢', dungeons[:3], '每周'),
               line('chain', '扭曲', chain[:3], '每小时')))


def buffs(img):
    pool = []
    for t in tables('buff-debuffs'):
        hd = heads(t)
        if '触发' in hd and '增伤' in hd:
            pool += [(hd, r) for r in rows('buff-debuffs', t)]
    items = []
    for name, trig, label, note in PICK_BUFFS:
        hit = [(hd, r) for hd, r in pool if name in r[0][0] and trig in r[hd.index('触发')][0]]
        need(hit, '首页预览：增伤页找不到 %s / %s' % (name, trig))
        hd, r = hit[0]
        value = re.findall(r'\d+(?:\.\d+)?%', re.sub(r'\[[^\]]*\]', '', r[hd.index('增伤')][0]))[-1]
        if note is None:
            note = re.sub(r'\[[^\]]*\]', '', r[hd.index('时长')][0]).strip()
        elif note == '触发':
            note = r[hd.index('触发')][0]
        items.append(([r[1][1]], label, '<b>%s</b>%s' % (value, esc(note)), ''))
    return pv_items(img, items)


def mechanics(img):
    secs = dict(sections('game-mechanics'))
    stats = {r[0][0]: r[1][1] for r in rows('game-mechanics', re.findall(r'<table.*?</table>', find('游戏机制页的分节', secs, '护甲属性'), re.S)[0])}

    def first(title, row):
        """row 为真取那一节表体里的第一张图，否则取分节开头那张图。两种都要：修改器
        那一节表前的段落里另有一张图，而三类勇士的图就在分节开头、表里是别的图。"""
        sec = find('游戏机制页的分节', secs, title)
        body = re.findall(r'<tbody.*?</tbody>', sec, re.S)
        need(body or not row, '首页预览：游戏机制页「%s」一节没有表' % title)
        src = re.findall(r'<img[^>]+src="([^"]+)"', ''.join(body) if row else sec)
        need(src, '首页预览：游戏机制页「%s」一节没有图' % title)
        return near('game-mechanics', src[0])

    items = [([find('角色属性表', stats, n)], n, '', '') for n in PICK_STATS]
    items += [([first('活动修改器', True)], '活动修改器', '', ''), ([first('战斗人员祸因', True)], '祸因', '', ''),
              ([first(c, False) for c in CHAMPIONS], '勇士', '', '')]
    return pv_items(img, items)


def ammo(_img):
    t = tables('ammo')[0]
    return pv_table([''] + heads(t)[1:], [[c for c, _ in r[:4]] for r in rows('ammo', t)[:2]])


def delta(_img):
    t = tables('power-delta')[0]
    val = {int(r[0][0].replace('−', '-')): float(r[1][0]) for r in rows('power-delta', t)}
    pts = [(x, find('压光伤害页', val, x)) for x in DELTA_AT]

    def sign(x):
        return ('−%d' % -x) if x < 0 else ('+%d' % x if x else '0')

    return pv_curve(pts, '光等差 %s → %s' % (sign(DELTA_AT[0]), sign(DELTA_AT[-1])),
                    '×%.3f → ×%.3f' % (pts[0][1], pts[-1][1]),
                    [(x, val[x], '%s ×%g' % (sign(x), val[x])) for x in DELTA_MARK])


def scalars(_img):
    t = tables('combatant-scalars')[0]
    hd = heads(t)
    body = {r[0][0]: r for r in rows('combatant-scalars', t)}
    return pv_table([''] + list(SCALAR_COLS),
                    [[n] + ['×' + find('战斗人员倍率页', body, n)[hd.index(c)][0] for c in SCALAR_COLS]
                     for n in PICK_SCALARS])


def changelog(_img):
    """最新两条：日期、类型、页面、条目名（「：」之前那一截）"""
    out = []
    for date, sec in sections('changelog'):
        for li in re.findall(r'<li[^>]*>(.*?)</li>', sec, re.S):
            m = re.match(r'<span class="act[^"]*">([^<]*)</span><a [^>]*>([^<]*)</a>(.*)', li, re.S)
            if m:
                out.append('%s %s %s %s' % (date, m.group(1), m.group(2), text(m.group(3)).split('：')[0]))
            if len(out) == 2:
                return '<span class="pv pv-lines">%s</span>' % ''.join('<span>%s</span>' % esc(x) for x in out)
    markup.die('首页预览：更新日志取不到两条')


def sources(_img):
    names = {r[0][0] for r in rows('sources', tables('sources')[0])}
    for n in PICK_SOURCES:
        need(n in names, '首页预览：数据源页里找不到「%s」' % n)
    return pv_chips([(n, '') for n in PICK_SOURCES])


def palette(_img):
    return '<span class="pv pv-swatch">%s</span>' % ''.join(
        '<i style="background:var(--%s)" title="--%s"></i>' % (c, c) for c in PALETTE)


def steps(names):
    def make(_img):
        return pv_chips([(n, 'is-hot' if i == len(names) - 1 else '') for i, n in enumerate(names)], '→')
    return make


PREVIEW = {
    'weapons/index.html': weapons,
    'builds/index.html': builds,
    'builds/sets/index.html': build_sets,
    'builds/new/index.html': steps(('技能', '武器', '护甲', '神器模组', '生成文本')),
    'builds/new/set/index.html': steps(('逐套选装备', '左侧目录切换', '生成合集文本')),
    'weapon-perks/index.html': perks,
    'weapon-frames/index.html': frames,
    'armor-mods/index.html': armor_mods,
    'armor-sets/index.html': armor_sets,
    'exotic-weapon/index.html': exotic_weapon,
    'exotic-armor/index.html': exotic_armor,
    'elements/index.html': elements,
    'artifact-mods/index.html': artifact,
    'ability-cooldown/index.html': cooldown,
    'boss-hp/index.html': boss_hp,
    'pve-farming/index.html': farming,
    'raid-guides/index.html': raids,
    'dps/index.html': ranking('dps', 'DPS'),
    'swap-dps/index.html': ranking('swap-dps', '切枪 DPS'),
    'skill-damage/index.html': ranking('skill-damage', '200 属性'),
    'rotation/index.html': rotation,
    'buff-debuffs/index.html': buffs,
    'game-mechanics/index.html': mechanics,
    'ammo/index.html': ammo,
    'power-delta/index.html': delta,
    'combatant-scalars/index.html': scalars,
    'changelog/index.html': changelog,
    'sources/index.html': sources,
    'palette/index.html': palette,
}


def render(home):
    """把首页每张卡的预览换成现取的那一份，返回新的首页。纯函数：测试与 main() 共用。"""
    img = Imgs()
    seen = []

    def fill(m):
        href = m.group(1)
        card = m.group(0)
        need(href in PREVIEW, '首页 %s 那张卡没有预览，在 build-home.py 的 PREVIEW 里加一条' % href)
        need(len(MARK.findall(card)) == 1, '首页 %s 那张卡要有且只有一对 <!--pv--><!--/pv-->' % href)
        seen.append(href)
        return MARK.sub(lambda _: '<!--pv-->%s<!--/pv-->' % PREVIEW[href](img), card)

    out = re.sub(r'<a class="entry" href="([^"]+)">.*?</a>', fill, home, flags=re.S)
    extra = sorted(set(PREVIEW) - set(seen))
    need(not extra, '首页已经没有这些卡，从 build-home.py 的 PREVIEW 里删掉：%s' % '、'.join(extra))
    return out


def main():
    with open(HOME, encoding='utf-8') as f:
        home = f.read()
    new = render(home)
    if new != home:
        with open(HOME, 'w', encoding='utf-8') as f:
            f.write(new)
    print('首页预览：%d 张卡%s' % (len(PREVIEW), '，已改写' if new != home else '，无变化'))


if __name__ == '__main__':
    main()
