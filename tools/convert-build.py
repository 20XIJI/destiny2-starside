"""推荐配装：references/builds/<赛季>/<slug>.md → builds/<赛季号>/<slug>/index.html。

用法：python3 tools/convert-build.py [slug]，省略 slug 即全部。

源稿只写名字，图标、链接与着色由 tools/vocab.py 从已生成的资料页现查——所以这个
生成器必须排在三个资料生成器之后、build-search.py 之前。查不到的名字当场中止：
错别字与站内改名因此暴露在构建时，而不是让页面上出现一个没图没链接的格子。

赛季走目录：references/builds/s29-凯旋纪念碑/ 里的配装出到 builds/s29/ 下，
「凯旋纪念碑」直接落成面包屑与徽章文字，不另建「赛季名 → 拉丁 slug」的对应表。
SEASON 是当前赛季，只有它的配装进索引页与全站搜索；旧赛季照常生成（外壳因此不
分叉），但站内点不到，手里已有链接的人仍打得开。
"""

import json
import os
import re
import sys
from urllib.parse import quote

import items
import shell
import vocab
from markup import Icons, die, inline, must, text_of

SRC_DIR = shell.BUILD_DIR
OUT_DIR = 'builds'
SEASON = shell.SEASON        # 当前赛季只有一处定义，见 shell.py

META_KEYS = ('推荐人', '描述', '更新', '场景', '定位', '分支', '核心')
# 六维恒为六格，顺序钉死：游戏内就是这个顺序，配装之间横着比才对得上位置。
STATS = ('生命', '近战', '手雷', '超能', '职业', '武器')
PARTS = ('头盔', '护臂', '胸甲', '腿部', '职业物品')
CLASSES = ('猎人', '泰坦', '术士')
# 分支名 → 元素页。同名条目优先取本分支那一页（星相「地狱火」在烈日页与棱镜页
# 各有一条，棱镜配装该链到棱镜页）。
BRANCH = {'电弧': 'arc', '烈日': 'solar', '虚空': 'void', '冰影': 'stasis',
          '缚丝': 'strand', '棱镜': 'prismatic'}
# 元素名走全站那一份编码，徽章上照样着色——素着等于这一页自己开了个例外。
ELEMENT_TOKEN = {b: 'el-%s' % slug for b, slug in BRANCH.items()}
# 一格一个名字的槽位：键即槽位名，源稿一行写完，值之间用「、」隔开。
# 「移动：」不查表——跳跃与瞬移这类移动手段站内还没有资料页，落成纯文本。


def meta(md, key, required=True):
    hit = re.search(r'^%s：(.*)$' % key, md, re.M)
    if hit is None:
        if required:
            die('源稿缺「%s：」一行' % key)
        return ''
    return hit.group(1).strip()


def names(md, key, required=True):
    v = meta(md, key, required)
    return [x.strip() for x in v.split('、') if x.strip()]


# 格档 → 图标边长。主角格（异域、传说枪、套装）56，配料格 32，rig 里的 Perk 24。
# 两档的判据见 builds/style.css：主角格图左名右 13px，配料格 32px + 11.5px 不折行。
CELL_ICON = {'item': 32, 'item gun': 56, 'item gear': 56, 'item set': 56,
             'item perk-cell': 24}


def icon_of(e, size):
    """词表条目的图标。图标一律是正方形，宽高只用来占位与定宽高比，所以按显示
    尺寸写；文件本身在它自己那一页里已经复核过「文件名即内容 md5」。"""
    if not e['icon']:
        return ''
    return ('<img src="%s%s" alt="" width="%d" height="%d" loading="lazy">'
            % (UP, e['icon'], size, size))


def item(idx, slot, name, prefer, kind=None, cls='item', bare=False, tail='', label=''):
    """一格：图标 + 名字，整格是指向资料页的链接。着色由词表给，不由源稿写。

    bare 只出格子本身，不套 <li>——一把枪与它的两个 Perk 要包在同一个 <li> 里，
    才不会在换行时被拆到两行去。tail 接在名字后面（套装的「2 件」）。

    label 换掉显示的名字，查表仍按 name 走：元素那一格查的是分支页上「那个职业」
    的分节图（一枚图编码职业与元素两件事），显示的却该是分支名。
    """
    e = vocab.pick(idx, name, slot, kind=kind, prefer=prefer)
    icon = icon_of(e, CELL_ICON[cls])
    shown = label or e['name']
    label = ('<span class="%s">%s</span>' % (e['token'], shown)
             if e['token'] else shown)
    sub = ('<span class="sub">%s</span>' % e['sub']) if e.get('sub') else ''
    # 带页内搜索框的页面加 ?q=：落地先过滤到那一行再滚，不然读者落在一整节里
    # 还得自己找。app.js 的 filter() 接这个参数，与全站搜索的命中链接同一套。
    q = ('?q=%s' % quote(e['q'])) if e['q'] and vocab.searchable(e['page']) else ''
    cell = ('<a class="%s" href="%s%s/index.html%s#%s">%s<span class="nm">%s%s%s</span></a>'
            % (cls, UP, e['page'], q, e['anchor'], icon, label, sub, tail))
    return cell if bare else '<li>%s</li>' % cell


# 面板与六维的小图标：站内没有部位与属性的图，这两套自己画。图形语义一律 CSS/SVG
# 绘制，不借字形（design.md 二节：⯁ 与 ◈ 在中文字体栈下无字形）。
# 16×16 视框、1.4 描边、currentColor——颜色跟着标题走，不引入新色相。
GLYPH = {
    # 技能：三道叠起来的尖角，读作「一组技能」。与近战那把刀、手雷那颗弹都不撞。
    '技能': 'M4 6.5 8 3l4 3.5M4 10 8 6.5l4 3.5M4 13.5 8 10l4 3.5',
    '星相': 'M8 1.5 14.5 8 8 14.5 1.5 8Z',
    '碎片': 'M8 2 14 12.5H2Z',
    '头盔': 'M3 9a5 5 0 0 1 10 0v4H10v-2H6v2H3Z',
    '护臂': 'M4.5 2h7l-1 5 1.5 7h-8L5.5 7Z',
    '胸甲': 'M3 3.5h10l-1.5 9h-7Zm5 0v9',
    '腿部': 'M6 2h4v7l3 5H6Z',
    '职业物品': 'M4 2h8l-1.5 12h-5Zm4 0v12',
    '神器': 'M8 1.5 14 5v6l-6 3.5L2 11V5Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
    '生命': 'M6.5 2h3v4.5H14v3H9.5V14h-3V9.5H2v-3h4.5Z',
    # 近战是一把短刃：菱形（星相）与三角（碎片）已经占了几何形，刀有握柄与刃尖，
    # 16px 下仍分得出朝向。旧那枚是个钝五边形，放到 96px 也读不出是什么。
    '近战': 'M2.6 13.4 6.9 9.1M5.7 7.7 9.4 4l3.7 3.7-3.7 3.7Z',
    '手雷': 'M8 5.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4ZM6.5 4h3v1.6h-3ZM10 2.5l2.5 2',
    '超能': 'M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z',
    '职业': 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
    # 武器是一把枪的侧影。旧那枚是右上箭头，读作「外链」或「增长」。
    # 不用弹壳：站内「弹药」是另一个概念，有自己的 --ammo-* 与四张购物清单页。
    '武器': 'M1.6 6.2h12.8v2.4h-3.1l-1.3 2.6H7.5L7 8.6H5v3.5H3.2V8.6H1.6Z',
}


def glyph(key):
    """面板标题前那一枚。没登记就不画，标题照旧只有文字。"""
    if key not in GLYPH:
        return ''
    return ('<svg class="gl" viewBox="0 0 16 16" aria-hidden="true">'
            '<path d="%s" fill="none" stroke="currentColor" stroke-width="1.4" '
            'stroke-linejoin="round" stroke-linecap="round"/></svg>' % GLYPH[key])


# 站内没有图的两类：位移技能连资料页都没有，神器在站内只是分节标题一行字。
# 两张表都由 tools/mods.py 从官方物品表蒸馏，图标放 builds/icons/。
EXTRAS = {'移动': ('moves.json', '--moves'), '神器本体': ('artifacts.json', '--arts')}


def extra(kind):
    """{名字: 图标路径}。查不到图标就中止——没图的格子在页面上看不出是漏了。"""
    fname, flag = EXTRAS[kind]
    path = os.path.join(shell.ROOT, 'tools', fname)
    if not os.path.exists(path):
        die('缺 tools/%s，跑一次 tools/mods.py %s <官方物品表>' % (fname, flag))
    with open(path, encoding='utf-8') as f:
        table = json.load(f)
    for name, meta in table.items():
        if not meta.get('icon'):
            die('%s 还没有图标，跑一次 tools/mods.py --icons' % name)
    return {n: 'builds/icons/%s' % m['icon'] for n, m in table.items()}


def move_cell(name, table):
    """位移技能的格子：有图有名，但不是链接——站内没有可跳的页面。"""
    if name not in table:
        die('「移动：%s」不在位移技能表里。官方叫法见 tools/moves.json：%s'
            % (name, '、'.join(sorted(table))))
    return ('<li><span class="item move">'
            '<img src="%s%s" alt="" width="32" height="32" loading="lazy">'
            '<span class="nm">%s</span></span></li>' % (UP, table[name], name))


def group(title, cells, key=None, cols=None, tool='', icon='', head=''):
    """一个面板：标题 + 若干格。

    --n 同时是两件事：格子网格的列数，以及这个面板在行里占的份额（护甲那五个
    部位是唯一的例外，它们列数恒为 1、三枚模组竖排，见 render() 里 cols=1 那一处）。

    同一行里各面板的格子等宽不是自然发生的：面板还有 18px 固定开销与格间的
    8px 沟，样式表把它们写进 flex-basis 才成立，见 builds/style.css 的 .slot。

    head 整个替掉标题那一行的内容，给填表页放神器选择器用：详情页把神器名写在
    标题位上，填表页就得在同一个位置选它，两页的行数因此一致。
    """
    n = len(cells) if cols is None else cols
    if head:
        bar = ['<h3>%s</h3>' % head]
    elif title:
        # 神器那枚图与它统辖的模组图同为 32px：20px 时这一节的身份比节里任何
        # 一枚模组都弱，读者先看见模组才看见它属于哪件神器。
        mark = ('<img class="gl-img" src="%s%s" alt="" width="32" height="32">' % (UP, icon)
                if icon else glyph(key or title))
        bar = ['<h3%s>%s<span>%s</span>%s</h3>'
               % (' class="art"' if icon else '', mark, title, tool)]
    else:
        bar = []
    return (['<div class="slot" style="--n:%d">' % n] + bar
            + ['<ul class="cells">'] + cells + ['</ul>', '</div>'])


def row(panels, cls=''):
    """一行面板。行宽恒为版心：左右两缘落在同一条垂直线上，那是这一页的脊柱。

    cls='lead' 的行不拉满——主角行最多三格，拉满会让一格宽到 500px。
    """
    return ['<div class="slot-row%s">' % (' ' + cls if cls else '')] + panels + ['</div>']


def rig_of(cells, tool=''):
    """一把枪与它的 Perk 包成一组，换行时不会被拆开——「岁时之巅」跟「聚合充能」
    分处两行时，读者对不上哪个 Perk 属于哪把枪。

    --n 是这一组在行里的份额，按格子实际需要的宽度加权，不按格数：枪是主角格
    （56px 的图 + 13px 的名字），Perk 是配料格（24px + 11px）。等分会让独占一组的
    异域枪只拿到七分之一行宽，「英勇利刃」四个字折成两行。

    **权重是 15 与 10，不是 16 与 10。**枪在组内占 1.5 个单位
    （builds/style.css 的 `.rig > .item.gun { flex: 1.5 }`），15∶10 才与它成比例；
    16 会让独占一组的异域枪比传说组里的枪宽 3.0px。

    --c 是本组露出来的格数，样式表拿它算 flex-basis 里那份固定开销
    （面板 18px + 格间 8px × (c-1)）。--n 在这里是加权份额、不是格数，
    所以这两个数必须分开给。
    """
    live = [c for c in cells if ' hidden' not in c]
    guns = sum(1 for c in live if 'item gun' in c)
    return ('<div class="rig" style="--n:%d;--c:%d">%s%s</div>'
            % (guns * 15 + (len(live) - guns) * 10, len(live), ''.join(cells), tool))


def people(md, avatars):
    """推荐人：一行一个，名字必填，链接与头像可省。"""
    out = []
    for line in re.findall(r'^推荐人：(.*)$', md, re.M):
        parts = [x.strip() for x in line.split('|')]
        name, url = parts[0], parts[1] if len(parts) > 1 else ''
        face = parts[2] if len(parts) > 2 else ''
        if not name:
            die('「推荐人：」的名字不能空')
        if len(parts) > 3:
            die('「推荐人：」最多三段（名字 | 链接 | 头像），源稿写的是 %r' % line)
        img = avatars.html(face) if face else ''
        body = '%s<span class="nm">%s</span>' % (img, name)
        out.append('<a class="who" href="%s" target="_blank" rel="noopener">%s</a>'
                   % (url, body) if url else '<span class="who">%s</span>' % body)
    if not out:
        die('源稿缺「推荐人：」一行')
    return out


def sets_of(idx, spec):
    """「埃希恩记忆 2 件 × 玻璃拱顶 2 件」或「埃希恩记忆 4 件」。"""
    cells = []
    for seg in spec.split('×'):
        m = must(re.match(r'^(.+?)\s*([24])\s*件$', seg.strip()),
                 '「套装：」要写「套装名 N 件」，N 是 2 或 4，源稿写的是 %r' % seg)
        cells.append(item(idx, '套装', m.group(1).strip(), '',
                          kind='%s 件' % m.group(2), cls='item set',
                          tail='<span class="pc">%s 件</span>' % m.group(2)))
    if len(cells) not in (1, 2):
        die('「套装：」最多两段，源稿写的是 %r' % spec)
    return cells


def stats_of(spec):
    parts = [x.strip() for x in spec.split('｜')]
    if len(parts) != len(STATS):
        die('「六维：」要写六格、用「｜」隔开，源稿写的是 %d 格' % len(parts))
    out = []
    for want, cell in zip(STATS, parts):
        if not cell.startswith(want):
            die('「六维：」第 %d 格要以「%s」开头，源稿写的是 %r'
                % (STATS.index(want) + 1, want, cell))
        out.append('<li>%s<span class="nm">%s</span><span class="val">%s</span></li>'
                   % (glyph(want), want, cell[len(want):].strip() or '—'))
    return out


# 填表页那两组标签的预设。受控词表：一套配装的适用环境与定位就这几种，让人自由
# 填会写出「宗师」「大师终极」「终极难度」三种说法，索引页的筛选就分不出来了。
FACETS = (('场景', '适用环境', ('突袭', '地牢', '宗师终极', '日常', '通用', 'PVP')),
          ('定位', '标签', ('输出', '清怪', '续航', '功能', '通用', 'PVP')))


def facet_picks(key, label, tags):
    """填表页的一栏多选标签。与详情页 facet() 同形（小标签 + 一排标签框），
    只是标签可点。值收在同一段里的隐藏 input 上，源稿的键不变——val() 照旧按
    data-key 读一个 .value，不必为这两格另开一条取值路径。"""
    return ('<div><p class="by-label">%s</p><span class="tags tagset">%s</span>'
            '<input type="hidden" data-key="%s"></div>'
            % (label,
               ''.join('<button type="button" aria-pressed="false">%s</button>' % t
                       for t in tags),
               key))


SPIRIT = '之灵'


def exotic_armor(md):
    """异域护甲，一件或两件。

    两件只有异域职业物品那一种——它一件装备带两条异域词条，站内把那些词条各自
    列成一条（「刺客之灵」「毒蛇之灵」），所以配装里它占两格。别的异域护甲一次
    只能穿一件。
    """
    got = names(md, '异域护甲', required=False)
    if len(got) > 2:
        die('「异域护甲：」最多两件，源稿写的是 %r' % '、'.join(got))
    if len(got) == 2 and not all(n.endswith(SPIRIT) for n in got):
        die('「异域护甲：」写两件只有异域职业物品那一种，两件都得是「…%s」，'
            '源稿写的是 %r' % (SPIRIT, '、'.join(got)))
    return got


def page_items(md):
    """源稿配过的每一件东西：(名字, 槽位, kind)。

    核心从这里挑，闸门与填表页的候选是同一份。**顺序即同名时的优先级**：主角在前
    （异域、传说枪、套装），配料在后——「全知之眼」既是异域护甲也是一把传说狙，
    两格都配了时那枚 96px 的图该是主角那一件。位移技能不在内：站内没有它的资料页，
    查不到图。
    """
    out = []
    got = meta(md, '异域武器', required=False)
    if got:
        out.append((got, '异域武器', None))
    out += [(n, '异域护甲', None) for n in exotic_armor(md)]
    for line in re.findall(r'^传说武器：(.*)$', md, re.M):
        parts = [x.strip() for x in line.split('|')]
        out.append((parts[0], '传说武器', None))
        out += [(p.strip(), 'Perk', None)
                for p in (parts[1].split('、') if len(parts) > 1 else []) if p.strip()]
    for seg in meta(md, '套装').split('×'):
        m = re.match(r'^(.+?)\s*([24])\s*件$', seg.strip())
        if m:
            out.append((m.group(1).strip(), '套装', '%s 件' % m.group(2)))
    for key in ('超能', '手雷', '近战', '职业技能', '星相', '碎片'):
        out += [(n, key, None) for n in names(md, key, required=False)]
    for part in PARTS:
        out += [(n, '护甲模组', part) for n in names(md, part, required=False)]
    art = meta(md, '神器', required=False)
    if art:
        out += [(n, '神器', art) for n in names(md, '模组', required=False)]
    return out


def core_pick(idx, md, prefer):
    """核心那枚 96px 的图。可以是本页配过的任一件东西，不限异域。"""
    core = meta(md, '核心')
    hit = [x for x in page_items(md) if x[0] == core]
    if not hit:
        die('「核心：」要等于本页配过的某一件东西，源稿写的是 %r' % core)
    return vocab.pick(idx, core, hit[0][1], kind=hit[0][2], prefer=prefer)


def facet(label, tags):
    """铭牌下面的一栏：一行小标签 + 若干 chip。"""
    return ('<div><p class="by-label">%s</p><ul class="tags">%s</ul></div>'
            % (label, ''.join('<li>%s</li>' % t for t in tags)))


def stats_card(spec):
    """六维那张小卡：三列两行，跟着护甲主角行走。

    它不走 group()——那里出的是 <ul class="cells">，格子形状与 .item 绑死；
    六维的六格是数值不是条目，各自一套版式。

    不给标题：同一行的异域与套装两个面板都没有标题，多出一行「六维」会让这张卡
    的六格整体下沉，与旁边的格子对不齐；每一格里已经写着属性名。
    """
    return (['<div class="slot stats-card" style="--n:3">',
             '<ul class="stats">'] + stats_of(spec) + ['</ul>', '</div>'])


def render(idx, mv, arts, avatars, md, slug, season, name_cn):
    title = must(re.match(r'^#\s+(.+)$', md.split('\n')[0]),
                 '源稿第一行必须是「# 配装名」').group(1).strip()
    stamp, desc = meta(md, '更新'), meta(md, '描述')
    # 描述在这一页是正文（首页卡片与 meta 也用它），所以允许写着色标记：
    # 正文走 inline()，meta 与卡片用剥干净的那一份，不然标记会漏进 <meta>。
    desc_text = text_of(inline(desc, rich=True), collapse=True)
    if not re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}', stamp):
        die('「更新：」要写成 YYYY.M.D，源稿写的是 %r' % stamp)
    branch = meta(md, '分支')
    if branch not in BRANCH:
        die('「分支：」要写六个分支之一（%s），源稿写的是 %r'
            % ('、'.join(BRANCH), branch))
    prefer = 'elements/%s' % BRANCH[branch]

    if meta(md, '职业') not in CLASSES:
        die('「职业：」要写猎人、泰坦、术士之一，源稿写的是 %r' % meta(md, '职业'))

    ex_gun = meta(md, '异域武器', required=False)
    ex_armor = exotic_armor(md)
    core_e = core_pick(idx, md, prefer)

    o = [shell.head('%s · %s · Starside' % (title, SITE_SECTION), desc_text, up=3,
                    sheets=['../../style.css']),
         shell.nav(title, up=3, parent=[SITE_SECTION, name_cn],
                   parent_href='../../index.html'),
         # 分支色驱动整页的 UI 强调色：区段那枚方块、页头竖线、格子悬停的左缘都跟着
         # 走。--accent 是 design.md 写明「子页面覆盖这一个即可换色」的槽位，六个元素
         # 页就是这么做的；这里不新增任何渲染色。
         '<main class="b-%s">' % BRANCH[branch],
         # 页头去盒：核心异域在左，一道由 align-items: stretch 撑满高度的竖线，右侧
         # 是配装名与铭牌。与全站 .page-head 同形（h1 + 一道发丝线），与首页
         # .wordmark-row 同语言。
         '<header class="build-head">',
         # 推荐人跟着核心那枚图走：他是这套配装的出处，与标题、铭牌、描述不是一
         # 类信息。竖线左边一列因此写成「图 + 谁推荐的」。
         '<div class="core">%s<p class="by-label">推荐者：</p>%s</div>'
         % (icon_of(core_e, 96), ''.join(people(md, avatars))),
         '<div class="build-id">',
         '<h1>%s</h1>' % title,
         '<p class="cls">%s%s · %s<span class="season">%s · %s</span></p>'
         % (icon_of(vocab.pick(idx, meta(md, '职业'), '职业', kind='分节'), 32),
            meta(md, '职业'),
            '<span class="%s">%s</span>' % (ELEMENT_TOKEN[branch], branch),
            season.upper(), name_cn),
         '<p class="desc">%s</p>' % inline(desc, rich=True),
         # 场景与定位分两栏各带一行标签：混在一排里读者分不出「地牢」说的是适用
         # 环境、「清怪」说的是这套配装干什么用的。
         '<div class="facets">%s%s</div>'
         % (facet('适用环境', names(md, '场景')), facet('标签', names(md, '定位'))),
         '</div>', '</header>', '']

    # 职业：一行是身份与主动技能（职业 · 超能 · 技能），一行是子职业树（星相 ·
    # 碎片）。「技能」收的是手雷、近战、移动与职业技能——游戏里是四个键位，在配装
    # 表里是同一档信息，分成四个面板会把一行豁成四段。「移动」不查这套表：站内还
    # 没有位移技能的资料页。
    #
    # **身份那两格排在最前，星相跟碎片同行。**它们同属子职业树，读者是一起看的；
    # 碎片独占一行时那五格宽到 193px，与上一行的 130px 差 50%。两行都是 7 份，
    # 格宽因此落在 130 与 133，整节读作一块。
    skills = []
    for key in ('手雷', '近战'):
        for n in names(md, key, required=False):
            skills.append(item(idx, key, n, prefer))
    if meta(md, '移动', required=False):
        skills.append(move_cell(meta(md, '移动'), mv))
    for n in names(md, '职业技能', required=False):
        skills.append(item(idx, '职业技能', n, prefer))
    who = meta(md, '职业')
    ident = [item(idx, '职业', who, prefer, kind='分节'),
             item(idx, '元素', who, prefer, kind='分节', label=branch)]
    o += ['<section class="block" id="sec-1">', '<h2 class="sect-label">职业</h2>']
    o += row(group('职业', ident, key='职业')
             + group('超能', [item(idx, '超能', meta(md, '超能'), prefer)])
             + group('技能', skills))
    o += row(group('星相', [item(idx, '星相', n, prefer) for n in names(md, '星相')])
             + group('碎片', [item(idx, '碎片', n, prefer) for n in names(md, '碎片')]))
    o += ['</section>', '']

    # 武器：一把枪一组。面板不给标题——上面那行 sect-label 已经写着「武器」，再写一遍
    # 「武器与 Perk」是噪声，格子形状（56px 图的是枪，24px 图的是 Perk）自己说明身份。
    rigs = []
    if ex_gun:
        rigs.append(rig_of([item(idx, '异域武器', ex_gun, prefer,
                                 cls='item gun', bare=True)]))
    for line in re.findall(r'^传说武器：(.*)$', md, re.M):
        gun, _, perks = line.partition('|')
        cells = [item(idx, '传说武器', gun.strip(), prefer, cls='item gun', bare=True)]
        cells += [item(idx, 'Perk', p.strip(), prefer, cls='item perk-cell', bare=True)
                  for p in perks.split('、') if p.strip()]
        rigs.append(rig_of(cells))
    o += ['<section class="block" id="sec-2">',
          '<h2 class="sect-label">武器</h2>'] + row(rigs) + ['</section>', '']

    # 神器模组页的 7 个分节就是 7 件神器，模组归属写在分节标题上。源稿先写用的是
    # 哪一件，模组按它限定——「电介质」在加密数据盘与废墟石板下各有一条，不限定
    # 就只能猜；限定之后，混进别件神器的模组当场中止。
    art = meta(md, '神器')
    mods = [item(idx, '神器', n, prefer, kind=art) for n in names(md, '模组')]
    o += ['<section class="block" id="sec-3">', '<h2 class="sect-label">神器模组</h2>']
    if art not in arts:
        die('「神器：%s」不在神器表里。站内那一页的七个分节即是全部：%s'
            % (art, '、'.join(sorted(arts))))
    o += row(group(art, mods, icon=arts[art]))
    o += ['</section>', '']

    # 护甲：主角行（异域护甲 + 套装）不拉满——它最多三格，拉满会让一格宽到 500px；
    # 格子封顶、左对齐，行末那半截空档给六维那张卡。部位行五个部位并排，每列三枚
    # 模组竖排，合起来是一张 5×3 的矩阵，那是这一页的视觉重心。
    # 异域职业物品一件装备带两条异域词条，站内把词条各自列成一条，所以它在这里
    # 占一格、两条上下并排——摊成两格会读成穿了两件异域。
    lead = (['<li class="stack">%s</li>'
             % ''.join(item(idx, '异域护甲', n, prefer, cls='item gear', bare=True)
                       for n in ex_armor)] if ex_armor else [])
    lead += sets_of(idx, meta(md, '套装'))
    o += ['<section class="block" id="sec-4">', '<h2 class="sect-label">护甲</h2>']
    # 六维挂在主角行右端：异域与套装最多占三格，剩下的半行本来是空的。套装可能
    # 是两格（4 件同时给 2 件效果），那时这张卡换行落下去，见 .slot-row.lead 的
    # flex-wrap。
    o += row(group('', lead) + stats_card(meta(md, '六维')), cls='lead')
    parts = []
    for part in PARTS:
        got = names(md, part, required=False)
        if got:
            parts.append(group(part, [item(idx, '护甲模组', n, prefer, kind=part)
                                      for n in got], cols=1))
    if parts:
        o += row([x for panel in parts for x in panel])
    o += ['</section>', '']

    note = md.split('## 注解', 1)
    if len(note) == 2 and note[1].strip():
        o += ['<section class="block" id="sec-5">',
              '<h2 class="sect-label">注解</h2>']
        o += ['<p>%s</p>' % inline('<br>'.join(b.strip().split('\n')), rich=True)
              for b in re.split(r'\n\s*\n', note[1].strip()) if b.strip()]
        o += ['</section>', '']

    o += ['</main>', '',
          shell.foot(stamp, '，%s' % meta(md, '页脚', required=False)
                     if meta(md, '页脚', required=False) else '')]
    return '\n'.join(x for x in o if x != '') + '\n', title


SITE_SECTION = '推荐配装'
# 填表页在首页「攻略与工具」里就叫这个名字，面包屑与标题跟着它，一处定义。
# 它不挂在推荐配装下面：首页直接进得来，读者也不必先看过配装才来填一份。
FORM_NAME = '配装工具'
INDEX_DESC = '按职业分类的 Destiny 2 推荐配装：职业、武器、护甲、神器模组与六维属性，每一格都链回站内资料页。'
UP = '../../../'


def season_dirs():
    """references/builds/ 下的赛季目录，返回 (s29, 凯旋纪念碑) 一串。"""
    out = []
    for name in sorted(os.listdir(SRC_DIR)):
        if not os.path.isdir(os.path.join(SRC_DIR, name)):
            continue
        m = must(re.match(r'^(s\d+)-(.+)$', name),
                 '赛季目录要写成「s29-赛季名」，现在叫 %r' % name)
        out.append((name, m.group(1), m.group(2)))
    if not out:
        die('references/builds/ 下没有赛季目录')
    return out


def build(idx, dirname, season, name_cn, slug):
    outdir = os.path.join(shell.ROOT, OUT_DIR, season, slug)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(SRC_DIR, dirname, slug + '.md'), encoding='utf-8') as f:
        md = f.read()
    # 头像是配装页自己的图，放 builds/avatars/：Icons 顺带复核「文件名即内容
    # md5」，那是给图标目录设一年浏览器缓存的前提。词表查出来的图标不走这里，
    # 它们在各自那一页已经复核过。
    avatars = Icons(os.path.join(shell.ROOT, OUT_DIR), 1)
    out, title = render(idx, extra('移动'), extra('神器本体'), avatars,
                        md, slug, season, name_cn)
    check(out, slug)
    shell.emit(outdir, out, title)
    core = core_pick(idx, md, 'elements/%s' % BRANCH[meta(md, '分支')])
    return {'u': '%s/%s/%s/index.html' % (OUT_DIR, season, slug), 't': title,
            'season': season, 'slug': slug, 'stamp': meta(md, '更新'),
            'desc': text_of(inline(meta(md, '描述'), rich=True), collapse=True), 'class': meta(md, '职业'),
            'tags': names(md, '场景') + names(md, '定位'), 'branch': BRANCH[meta(md, '分支')],
            'by': ''.join(people(md, avatars)),
            'core': '<span class="node">%s</span>' % icon_of(core, 64).replace(UP, '../')}


def render_index(made):
    """builds/index.html：当前赛季的配装卡片，按三个职业分节。

    卡片复用首页那套 .entry 形状（左图标 + 正文 + 右列），不为配装另造一种卡。
    每张卡落一个分支类，.entry 左缘那条 2px 亮边因此跟着该配装的元素色走——
    一屏卡片扫下来，棱镜与冰影一眼分得开。
    筛选交给工具条那只搜索框——把卡片声明成 data-item，输入「地牢」就滤出带
    地牢标签的卡片，零新代码。多标签 chip 筛选等配装过二十套再说。
    """
    live = [m for m in made if m['season'] == SEASON]
    if not live:
        die('当前赛季 %s 一套配装都没有，索引页会是空的' % SEASON)
    stamp = max(m['stamp'] for m in live)
    o = [shell.head('%s · Starside' % SITE_SECTION, INDEX_DESC, app_js=True, up=1),
         shell.nav(SITE_SECTION, up=1, toolbar={
             'data-section': '.block', 'data-item': '.entries > li',
             'data-label': '.sect-label', 'data-noun': '配装',
             'data-chip-label': '职业'}),
         # 投稿入口挂在标题右边。这是填表页在站内唯一的入口（别处没有理由指向
         # 它，而没有入口的页面等于不存在），单独占一段会在卡片上面多出一整块
         # 空白。页首那句说明只留给 <meta>，正文里它把首屏推下去半屏。
         shell.page_head(SITE_SECTION, aside=(
             '<p class="new-link"><a href="new/index.html">投稿一套配装 →</a>'
             '<span>选完技能、武器、护甲与神器模组，页面直接生成标准配装文本</span></p>')),
         '<main>']
    n = 0
    for cls in CLASSES:
        mine = [m for m in live if m['class'] == cls]
        if not mine:
            continue
        n += 1
        o += ['<section class="block" id="sec-%d">' % n,
              '<h2 class="sect-label">%s</h2>' % cls, '<ul class="entries">']
        for m in mine:
            o += ['<li class="b-%s">' % m['branch'],
                  '<a class="entry" href="%s/%s/index.html">'
                  % (m['season'], m['slug']),
                  m['core'],
                  '<span class="entry-body">',
                  '<h3>%s</h3>' % m['t'],
                  '<p>%s</p>' % m['desc'],
                  '<span class="entry-stamp">更新 %s</span>' % m['stamp'],
                  '</span>',
                  '<span class="entry-side">%s<span class="tags">%s</span></span>'
                  % (m['by'], ''.join('<i>%s</i>' % t for t in m['tags'])),
                  '</a>', '</li>']
        o += ['</ul>', '</section>', '']
    o += ['</main>', '', shell.foot(stamp, '，配装由各位推荐人提供，随赛季更新。')]
    out = '\n'.join(x for x in o if x != '') + '\n'
    shell.emit(os.path.join(shell.ROOT, OUT_DIR), out, '%d 套配装' % len(live))


def render_vocab(idx):
    """builds/vocab.js：填表页的词表。

    与生成器查的是同一份词表，所以填表页列得出来的名字，生成器一定查得到；
    表只建一次，两处用。一条一行，git 存得下增量。

    一行七列 [名字, 分节, 页面, 图标, 着色, 副名, 位置]，尾部的空列剥掉。
    位置只有神器模组给（'行,档'），填表页照它把选择器摆成 7 列 × 3 行。页面那一列是
    填表页收窄候选的依据：源稿一选「分支：棱镜」，五个技能槽就只留 elements/
    prismatic 那一页的条目——与生成器 vocab.pick(prefer=…) 同一条规则。

    五个技能槽指向同一组元素页，候选完全相同，所以只存一份、其余指过来：
    存五遍是把同一份 316 行抄了五次。
    """
    by_slot = {}
    for hits in idx.values():
        for e in hits:
            for slot, pages in vocab.SLOTS.items():
                if e['page'] in pages:
                    by_slot.setdefault(slot, set()).add(
                        (e['name'], e['kind'], e['page'], e['icon'],
                         e['token'], e.get('sub', ''), e.get('pos', '')))
    # 页面集合相同的槽位共用一份列表，键取头一个用到它的槽位名。
    owner, slots = {}, {}
    for slot in vocab.SLOTS:
        key = vocab.SLOTS[slot]
        owner.setdefault(key, slot)
        slots[slot] = owner[key]
    # 位移技能不在 vocab.SLOTS 里——它没有来源页，名字与图标来自官方物品表。
    # 填表页照样要选得到，所以在这里并成一份普通的列表。
    for kind, tag in (('移动', '位移技能'), ('神器本体', '神器')):
        by_slot[kind] = {(n, tag, '', icon, '', '', '') for n, icon in extra(kind).items()}
        owner[('__%s__' % kind,)] = kind
        slots[kind] = kind
    rows = []
    for key, slot in owner.items():
        cells = []
        for cols in sorted(by_slot.get(slot, ())):
            cols = list(cols)
            while cols and cols[-1] == '':
                cols.pop()
            cells.append(json.dumps(cols, ensure_ascii=False))
        rows.append('%s:[%s]' % (json.dumps(slot, ensure_ascii=False), ','.join(cells)))
    body = ('window.starsideVocab = {\nlists: {\n%s\n},\nslots: %s\n};\n'
            % (',\n'.join(rows), json.dumps(slots, ensure_ascii=False)))
    path = os.path.join(shell.ROOT, OUT_DIR, 'vocab.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)
    print('builds/vocab.js —— %.1f KB，%d 个槽位共 %d 份列表'
          % (len(body.encode()) / 1024, len(slots), len(owner)))


def slot_cell(slot, kind='', cls='item', label='', bare=False, hidden=False,
              addable='', only=''):
    """填表页的空槽：点开就地展开图标网格，选中即落成与详情页一模一样的成品格。

    版面与候选范围写在这里一处，form.js 从 data-* 现读、不重抄一份——与 app.js
    从 .toolbar 的 data-* 读配置同一条约定。

    label 写在格子上当提示。面板标题已经说了这一格装什么的（碎片面板里的五个碎片
    格）只写一个加号；一个面板里几个格装的东西不一样时（技能面板里的手雷、近战、
    移动、职业技能）逐格写出来，不然填的人认不出该往哪一格填。

    bare 只出按钮本身，不套 <li>——rig 是 <div> 不是 <ul>，套了会多出一排项目符号。
    """
    # data-addable 是「这一格由某枚按钮叫出来」的记号，按钮上的 data-add 与它对上。
    # 记号落在最外层：不套 <li> 的（rig 里的格子）就落在按钮自己身上。
    mark = (' data-addable="%s"' % addable if addable else '') + (' hidden' if hidden else '')
    # data-only 再按名字收一道：异域护甲那第二格只列「…之灵」。
    cell = ('<button type="button" class="%s empty" data-slot="%s"%s%s%s>'
            '<span class="nm">%s</span></button>'
            % (cls, slot, ' data-kind="%s"' % kind if kind else '',
               ' data-only="%s"' % only if only else '',
               mark if bare else '', label or '+'))
    return cell if bare else '<li%s>%s</li>' % (mark, cell)


def render_new(stamp, name_cn):
    """builds/new/index.html：填表页。

    产出的是**与详情页同构的空槽版面**——同一套 group()/row()/glyph()，同一批
    CSS 类。填的人看着成品的形状往里填，填完页面就是成品。

    候选不写进 HTML：两千条选项写进来就是把词表抄了第二份，由 form.js 按
    builds/vocab.js 建。这一页因此只有骨架，没有一个装备名。
    """
    desc = '填一份推荐配装：选完技能、武器、护甲与神器模组，页面直接生成标准配装文本，复制发给站长即可挂上站。'
    o = [shell.head('%s · Starside' % FORM_NAME, desc, up=2,
                    sheets=['../style.css']),
         shell.nav(FORM_NAME, up=2),
         '<main id="sheet">',
         # 页头与详情页逐块同形：左列是核心那枚 96px 的图加推荐者，右列是配装名、
         # 铭牌、描述与两栏标签。可填的那几处换成输入位，其余照详情页的类名写，
         # 版式因此由同一份规则管，不为填表页另写一套。
         '<header class="build-head">',
         '<div class="core">',
         '<button type="button" class="item empty" id="f-core-art" data-slot="核心" '
         'aria-expanded="false"><span class="nm">核心</span></button>',
         '<p class="by-label">推荐者：</p>',
         '<input class="who-in" data-key="推荐人" placeholder="ID" '
         'aria-label="推荐者">',
         '</div>',
         '<div class="build-id">',
         '<h1><input data-key="配装名" placeholder="配装名" aria-label="配装名"></h1>',
         # 铭牌照着下面「职业」那两格显示，本身不可点——身份在那两格上选。
         '<p class="cls"><span class="cls-id" data-mirror="铭牌">'
         '<span class="hint">职业与元素在下面「职业」那一格选</span></span>'
         '<span class="season">%s · %s</span></p>' % (SEASON.upper(), name_cn),
         '<p class="desc"><input data-key="描述" placeholder="一句话说清这套配装靠什么打" '
         'aria-label="描述"></p>',
         '<div class="facets">%s%s</div>'
         % (facet_picks(*FACETS[0]), facet_picks(*FACETS[1])),
         '</div>', '</header>', '']

    # 身份那两格就是职业与分支的选择器。**它们不走 fill()**：两格的内容由 state
    # 算出来（元素那一格用的是分支页上「那个职业」的分节图，换职业要跟着换），
    # 所以选中只改 state，画由 mirror() 一处负责。
    ident = ['<li><button type="button" class="item empty" data-mirror="职业" '
             'data-slot="职业" data-kind="分节" aria-expanded="false">'
             '<span class="nm">职业</span></button></li>',
             '<li><button type="button" class="item empty" data-mirror="元素" '
             'data-slot="元素" data-kind="分节" aria-expanded="false">'
             '<span class="nm">元素</span></button></li>']
    o += ['<section class="block" id="sec-1">', '<h2 class="sect-label">职业</h2>']
    o += row(group('职业', ident, key='职业')
             + group('超能', [slot_cell('超能')])
             + group('技能', [slot_cell('手雷', label='手雷'),
                             slot_cell('近战', label='近战'),
                             slot_cell('职业技能', label='职业技能'),
                             # 移动默认收起：绝大多数配装不指定跳跃方式，
                             # 常驻一个空格子只是噪声。按钮叫出来才有。
                             slot_cell('移动', label='移动', hidden=True,
                                       addable='移动')],
                     cols=3,
                     tool='<button type="button" class="slot-tool" data-add="移动">'
                          '＋ 移动</button>'))
    # 碎片格数按配装变（棱镜五枚，别的分支可能少一枚或多到六枚），所以出满上限
    # 六格、默认显示五格，多的收起来，由标题右边那个计数器加减。
    o += row(group('星相', [slot_cell('星相')] * 2)
             + group('碎片', [slot_cell('碎片', hidden=i >= 5) for i in range(6)],
                     cols=5,
                     tool='<span class="slot-count" data-count="碎片">'
                          '<button type="button" data-step="-1" aria-label="少一格">−</button>'
                          '<b>5</b>'
                          '<button type="button" data-step="1" aria-label="多一格">+</button>'
                          '</span>'))
    o += ['</section>', '']

    o += ['<section class="block" id="sec-2">', '<h2 class="sect-label">武器</h2>']
    def gun_rig(name):
        # Perk 那两格只列「武器 PERK」：一把枪的两列可选 Perk 就是这一类。起源特性
        # 是另一条线（一把枪固定带一个，随出处走），混在同一份候选里挑不出来，
        # 所以单给一格、默认收起，按 ＋ 才出来。
        return rig_of([slot_cell(name, cls='item gun', label=name, bare=True),
                       slot_cell('Perk', kind='武器 PERK', cls='item perk-cell',
                                 label='Perk', bare=True),
                       slot_cell('Perk', kind='武器 PERK', cls='item perk-cell',
                                 label='Perk', bare=True),
                       slot_cell('Perk', kind='起源特性', cls='item perk-cell',
                                 label='起源特性', bare=True, hidden=True,
                                 addable='起源特性')],
                      tool='<button type="button" class="slot-tool" data-add="起源特性"'
                           ' title="加一个起源特性" aria-label="加一个起源特性">'
                           '＋</button>')

    o += row([rig_of([slot_cell('异域武器', cls='item gun', label='异域武器',
                                bare=True)]),
              gun_rig('传说武器'), gun_rig('传说武器')])
    o += ['</section>', '']

    # 神器先选件，七个模组按它限定——「电介质」在加密数据盘与废墟石板下各有一条。
    # **选择器落在标题位，与详情页同构。**详情页把神器名写在面板标题上，这里就在
    # 同一个位置选它；单独占一行 lead 会让填表页比详情页多一行，且那一行只有一格
    # 宽，右缘上多出一个断口。
    pick = slot_cell('神器', kind='__art__', cls='item', label='选一件神器', bare=True)
    o += ['<section class="block" id="sec-3">', '<h2 class="sect-label">神器模组</h2>']
    o += row(group('', [slot_cell('神器')] * 7, head=pick))
    o += ['</section>', '']

    o += ['<section class="block" id="sec-4">', '<h2 class="sect-label">护甲</h2>']
    # 六维与详情页同一张卡、同一个形状，一格就是「图 + 名 + 值」。**值那一格是
    # 按钮**：写法与数值要四个 chip 加两个数值框，摆进格子里要三倍宽，摆进选择器
    # 里格子就还是详情页那个尺寸——与这一页别处「点空槽 → 就地展开选择器」同一
    # 套动作。
    stats = ['<div class="slot stats-card" style="--n:3">', '<ul class="stats">']
    stats += ['<li><button type="button" class="stat" data-stat="%s" data-mode="~" '
              'aria-expanded="false">%s<span class="nm">%s</span>'
              '<span class="val">~</span></button></li>' % (k, glyph(k), k)
              for k in STATS]
    stats += ['</ul>', '</div>']
    # 异域护甲那一格里备着两个槽：选中「…之灵」时第二个自己冒出来（异域职业物品
    # 带两条词条），选别的异域时它收回去。收放由 form.js 按名字判，不给按钮——
    # 那是游戏规则不是版面偏好。
    armor = ('<li class="stack">'
             + slot_cell('异域护甲', cls='item gear', label='异域护甲', bare=True)
             + slot_cell('异域护甲', cls='item gear', label='第二条词条', bare=True,
                         hidden=True, only=SPIRIT)
             + '</li>')
    o += row(group('', [armor,
                        slot_cell('套装', cls='item set', label='套装'),
                        slot_cell('套装', cls='item set', label='套装（可选）')]) + stats,
             cls='lead')
    o += row([x for part in PARTS
              for x in group(part, [slot_cell('护甲模组', kind=part)] * 3, cols=1)])
    o += ['</section>', '']

    o += ['<section class="block" id="sec-5">', '<h2 class="sect-label">注解</h2>',
          '<textarea data-key="注解" rows="4" '
          'placeholder="备选装备、打法要点，与资料页正文同一套标记" aria-label="注解"></textarea>',
          '</section>', '',
          '<section class="block" id="sec-6">',
          '<h2 class="sect-label">配装文本</h2>',
          '<details id="src"><summary>展开配装文本</summary>',
          '<textarea id="out" readonly rows="28" spellcheck="false"></textarea>',
          '</details>',
          '<details id="imp"><summary>从配装文本导入</summary>',
          '<p class="note">粘贴一份已有的配装文本。认得出的格子照着填上，'
          '认不出的整条跳过并在下面列出来。导入会覆盖当前已填的内容。</p>',
          '<textarea id="in" rows="10" spellcheck="false" '
          'placeholder="把配装文本粘贴到这里" aria-label="待导入的配装文本"></textarea>',
          '<p id="imp-tip" role="status"></p>',
          '</details>', '</section>', '',
          # 这一页的三个出口常驻右下角。**预览不另建一套 DOM**：它给 #sheet 加一个
          # 类，把空槽、控件与源稿那一节收起来，剩下的就是成品；那时这一条也得
          # 够得着，所以它不在被收起的那一节里。
          '<div class="src-tools">',
          '<button id="preview" class="chip" type="button" aria-pressed="false">预览配装</button>',
          '<button id="copy" class="chip" type="button">复制配装</button>',
          # 导入是一个动作不是两个：这一枚永远「导入」，文本框还空着时它带你去粘贴。
          '<button id="to-import" class="chip" type="button">导入配装</button>',
          '<span id="copy-tip" role="status"></span>',
          '</div>', '',
          '</main>', '',
          shell.foot(stamp, '，选项与站内资料页同一份词表，列得出来的名字生成器就查得到。')]
    out = '\n'.join(x for x in o if x != '') + '\n'
    # 两个 script 要落在 </body> 之前。shell.foot() 已经吐了 </body></html>，
    # 直接往后接会让它们跑到文档外面去。
    out = out.replace('\n</body>\n',
                      '\n<script src="../vocab.js" defer></script>\n'
                      '<script src="form.js" defer></script>\n</body>\n')
    shell.emit(os.path.join(shell.ROOT, OUT_DIR, 'new'), out, FORM_NAME)


def check(out, slug):
    """结构闸门。正文没有可比的连续文本（全是查表补出来的图标与链接），
    所以这里查的是「该有的段都在、标记都转干净了」。

    另加一条着色闸门，只管作者写的那两段散文（描述与注解）：槽位那些名字由查表
    着色，不归源稿管；散文归源稿管，全站术语在里面素着就是漏了。词表与 G6 同一份
    （items.py 的 MECH 减去 LOOSE），不在这里另立一份。"""
    prose = ''.join(re.findall(r'<p class="desc">(.*?)</p>', out, re.S)
                    # 按分节标题认，不按 sec-N：编号跟着分节增减挪位，
                    # 挪错了这一条静默不查任何东西。
                    + re.findall(r'<h2 class="sect-label">注解</h2>(.*?)</section>',
                                 out, re.S))
    naked = text_of(re.sub(r'<span class="[^"]*">.*?</span>', '', prose, flags=re.S))
    left = sorted({w for w in items.MECH if w not in items.LOOSE and w in naked})
    if left:
        die('%s 的描述或注解里这些术语没着色：%s\n'
            '  写成 {token|词}，token 见 items.py 的 MECH' % (slug, '、'.join(left)))
    for want in ('<h1>', 'class="build-head"', 'class="stats"'):
        if want not in out:
            die('%s 的产出里缺 %s' % (slug, want))
    if '{' in out[out.index('<main'):out.index('</main>')]:
        die('%s 有没转换的着色标记' % slug)
    # 面板的 --n 同时是格子列数与行内份额，缺了它整行会塌成等宽，眼睛查不出来。
    if out.count('<div class="slot"') != out.count('<div class="slot" style="--n:'):
        die('%s 有面板没写 --n' % slug)


def main():
    if len(sys.argv) > 2:
        die(__doc__)
    only = sys.argv[1] if len(sys.argv) == 2 else None
    idx = vocab.build()
    vocab.check_landing(idx)         # 链接落地不许滤成空页
    made = []
    for dirname, season, name_cn in season_dirs():
        for f in sorted(os.listdir(os.path.join(SRC_DIR, dirname))):
            if not f.endswith('.md') or (only and f[:-3] != only):
                continue
            made.append(build(idx, dirname, season, name_cn, f[:-3]))
    if not made:
        die('没有配装源稿可生成' + ('：找不到 %s.md' % only if only else ''))
    if not only:
        render_index(made)
        render_vocab(idx)
        render_new(max(m['stamp'] for m in made),
                   [n for _, sn, n in season_dirs() if sn == SEASON][0])
    print('配装 %d 套，当前赛季 %s %d 套'
          % (len(made), SEASON, len([m for m in made if m['season'] == SEASON])))


if __name__ == '__main__':
    main()
