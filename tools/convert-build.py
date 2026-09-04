"""配装推荐：references/builds/<赛季>/<slug>.md → builds/<赛季号>/<slug>/index.html。

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
from html import escape

from markup import BRANCH, CATEGORIES, CLASSES, die, inline, must, text_of, uncolor

SRC_DIR = shell.BUILD_DIR
OUT_DIR = 'builds'
SEASON = shell.SEASON        # 当前赛季只有一处定义，见 shell.py

META_KEYS = ('推荐人', '描述', '更新', '场景', '定位', '分支', '类别', '核心')
# 六维恒为六格，顺序钉死：游戏内就是这个顺序，配装之间横着比才对得上位置。
STATS = ('生命', '近战', '手雷', '超能', '职业', '武器')
# 合集：一份源稿装 N 套可切换的配装，`# ` 分隔。头部写整份共有的那几个键
# （推荐人、描述、更新、场景、类别、核心），每套各写描述、定位、分支、核心与职业
# ——描述与定位正是它们互相区分的地方，写在头部就成了一排全选，什么也没说。
# 游戏内能存 20 套，站上收到 12：再多左栏那列比右栏还长，而一个角色常用的就五六套。
SET_MAX = 12
# 一队人各穿一套那种合集的职业格。索引页拿它当小节标题，与三个职业并列。
MIXED = '多职业'
PARTS = ('头盔', '护臂', '胸甲', '腿部', '职业物品')
# 职业、分支与类别三张表在 markup.py：那三样是源稿的词汇，而 build-terms.py
# 要把它们导给编辑台（审核台左栏按类别与职业建树、列表按分支上色），本文件的
# 名字带短横，import 不进去。分支同时决定同名条目查哪一页（星相「地狱火」在
# 烈日页与棱镜页各有一条，棱镜配装该链到棱镜页）。
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
    # 悬停详情认的是 data-d：「页面\t名字\t分节」，builds/tip.js 拿它去 desc.js 里查。
    # 制表符在属性里写成 &#9;，源码里看得见；查得到说明的格子才写这一位，别的
    # 格子上多一个空属性只会让人以为它该弹而没弹。
    d = (' data-d="%s"' % escape('%s\t%s\t%s'
                                 % (e['page'], e['name'], e['kind'])).replace('\t', '&#9;')
         if e.get('desc') else '')
    cell = ('<a class="%s"%s href="%s%s/index.html%s#%s">%s<span class="nm">%s%s%s</span></a>'
            % (cls, d, UP, e['page'], q, e['anchor'], icon, label, sub, tail))
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


def people(md, link=True):
    """推荐人：一行一个，`名字 | 链接`，链接可省。

    link=False 出纯文本那一版，给索引页用：那张卡整张是一个 <a>，里面再套一个
    会被 HTML 解析器在内层处把外层关掉，卡片右半边就不再是通往配装的链接。
    """
    out = []
    for line in re.findall(r'^推荐人：(.*)$', md, re.M):
        parts = [x.strip() for x in line.split('|')]
        name, url = parts[0], parts[1] if len(parts) > 1 else ''
        if not name:
            die('「推荐人：」的名字不能空')
        if len(parts) > 2:
            die('「推荐人：」最多两段（名字 | 链接），源稿写的是 %r' % line)
        body = '<span class="nm">%s</span>' % name
        out.append('<a class="who" href="%s" target="_blank" rel="noopener">%s</a>'
                   % (url, body) if url and link
                   else '<span class="who">%s</span>' % body)
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
FACETS = (('场景', '适用环境', ('突袭', '地牢', '宗师终极', '日常', '通用')),
          ('定位', '标签', ('输出', '清怪', '续航', '功能', '通用')))


def facet_picks(key, label, tags, single=False):
    """填表页的一栏标签。与详情页 facet() 同形（小标签 + 一排标签框），只是标签
    可点。值收在同一段里的隐藏 input 上，源稿的键不变——val() 照旧按 data-key 读
    一个 .value，不必为这几格另开一条取值路径。

    single 那一栏一次只选一个（类别），标在容器上让 form.js 现读；多选那两栏
    （场景、定位）不带这个标记。两种排出来一模一样，差别只在点第二枚时。
    """
    return ('<div><p class="by-label">%s</p><span class="tags tagset"%s>%s</span>'
            '<input type="hidden" data-key="%s"></div>'
            % (label, ' data-single=""' if single else '',
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


def core_pick(idx, md, prefer, pool=None):
    """核心那枚 96px 的图。可以是本页配过的任一件东西，不限异域。

    pool 给合集用：它的头部一件装备都没写，核心要在全体成员的并集里挑。
    """
    core = meta(md, '核心')
    hit = [x for x in (page_items(md) if pool is None else pool) if x[0] == core]
    if not hit:
        die('「核心：」要等于本页配过的某一件东西，源稿写的是 %r' % core)
    return vocab.pick(idx, core, hit[0][1], kind=hit[0][2], prefer=prefer)


def facet(label, tags):
    """铭牌下面的一栏：一行小标签 + 若干 chip。

    一条都没有就整栏不出——PVP 那一类配装的场景与定位本来就可以空着（那两张表
    列的是 PVE 的），留一个光杆小标签比不写更难读。
    """
    if not tags:
        return ''
    return ('<div><p class="by-label">%s</p><ul class="tags">%s</ul></div>'
            % (label, ''.join('<li>%s</li>' % t for t in tags)))


def facets(md):
    """铭牌下面那两栏。两栏都空即整块不出，见调用处。"""
    rows = facet('适用环境', names(md, '场景')) + facet('标签', names(md, '定位'))
    return '<div class="facets">%s</div>' % rows if rows else ''


def stats_card(spec):
    """六维那张小卡：三列两行，跟着护甲主角行走。

    它不走 group()——那里出的是 <ul class="cells">，格子形状与 .item 绑死；
    六维的六格是数值不是条目，各自一套版式。

    不给标题：同一行的异域与套装两个面板都没有标题，多出一行「六维」会让这张卡
    的六格整体下沉，与旁边的格子对不齐；每一格里已经写着属性名。
    """
    return (['<div class="slot stats-card" style="--n:3">',
             '<ul class="stats">'] + stats_of(spec) + ['</ul>', '</div>'])


def branch_of(md):
    branch = meta(md, '分支')
    if branch not in BRANCH:
        die('「分支：」要写六个分支之一（%s），源稿写的是 %r' % ('、'.join(BRANCH), branch))
    return branch


def class_of(md):
    who = meta(md, '职业')
    if who not in CLASSES:
        die('「职业：」要写猎人、泰坦、术士之一，源稿写的是 %r' % who)
    return who


def cat_of(md):
    cat = meta(md, '类别')
    if cat not in CATEGORIES:
        die('「类别：」要写 %s 之一，源稿写的是 %r' % ('、'.join(CATEGORIES), cat))
    return cat


def stamp_of(md):
    stamp = meta(md, '更新')
    if not re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}', stamp):
        die('「更新：」要写成 YYYY.M.D，源稿写的是 %r' % stamp)
    return stamp


def split_set(md):
    """源稿 → (头部, [每套的源稿, …])。`# ` 起一块，首块是头部。

    单套配装只有一个 `# `，切出来成员为空、头部即整份——两条路因此共用一个入口。
    **全脚本只有这一处认这个分隔符**：成员块内部就是单套配装的源稿，一字不改，
    blocks_of() 与填表页的 write()/importMd() 都按块原样复用。

    「合集：是」与第二个 `# ` 互为断言，缺一即中止。只按标记判，写了标记忘了写
    第二套会出一个空合集；只按 `# ` 判，注解里手滑打出的一个 `# ` 会把半篇正文
    静默切成第二套。
    """
    parts = re.split(r'\n(?=# )', md.strip())
    head, members = parts[0], parts[1:]
    flag = meta(head, '合集', required=False)
    if flag and flag != '是':
        die('「合集：」只认「是」；不是合集就把整行删掉，源稿写的是 %r' % flag)
    if bool(members) != bool(flag):
        die('「合集：是」与第二个「# 」要么都在要么都不在：现在标记%s、成员 %d 套'
            % ('在' if flag else '不在', len(members)))
    if members and not 2 <= len(members) <= SET_MAX:
        die('一个合集要 2 到 %d 套，源稿写了 %d 套' % (SET_MAX, len(members)))
    return head, members


def scenes_of(md):
    """合集的适用环境。**第一个是主场景**，索引页按它分大节。

    多值照旧（一份合集常在突袭与地牢都成立），但大节只进一个：同一张卡出现在
    两个节里，读者会以为是两份合集。顺序因此有意义，与 page_items() 的
    「顺序即同名时的优先级」同一条。
    """
    got = names(md, '场景')
    if not got:
        die('合集的「场景：」不能空，它决定这份合集进索引页的哪一个大节')
    for x in got:
        if x not in FACETS[0][2]:
            die('「场景：」要写 %s 之中的，源稿写的是 %r' % ('、'.join(FACETS[0][2]), x))
    return got


def set_facts(idx, head, members):
    """一份合集摊平之后的四件事：强调色取哪个分支、核心那枚图、职业、标签。

    详情页与索引页的卡片都要它们，算法只此一处。
    """
    # 页面级的强调色取第一套的分支：一份合集常在同一个分支里换装，换了也总得挑
    # 一个，第一套是作者摆在最前面的那一套。每套自己那一层另戴 b-<分支>。
    branch = branch_of(members[0])
    core = core_pick(idx, head, 'elements/%s' % BRANCH[branch],
                     pool=[x for m in members for x in page_items(m)])
    who = [c for c in CLASSES if c in {class_of(m) for m in members}]
    roles = []
    for m in members:
        for r in names(m, '定位', required=False):
            if r not in roles:
                roles.append(r)
    return branch, core, who, roles


def solo_src(head, md):
    """「复制这一套」给的那一份：成员块补上从合集头部继承的那几个键，粘回配装
    工具就是一份完整的单套源稿。少了它们，导入之后推荐人与类别是空的。"""
    add = ['%s：%s' % (k, meta(head, k, required=False))
           for k in ('推荐人', '更新', '场景', '类别')]
    lines = md.strip().split('\n')
    return '\n'.join(lines[:1] + [x for x in add if not x.endswith('：')] + lines[1:])


def finish(o, scripts):
    """收尾：把 <script defer> 接在 </body> 之前。shell.foot() 已经吐了
    </body></html>，直接往后接会让它跑到文档外面去。"""
    out = '\n'.join(x for x in o if x != '') + '\n'
    tags = ''.join('<script src="%s" defer></script>\n' % s for s in scripts)
    return out.replace('\n</body>\n', '\n' + tags + '</body>\n')


def blocks_of(idx, mv, arts, md, ns=''):
    """五个分节：职业、武器、神器模组、护甲、注解。单套与合集里的每一套共用。

    ns 是分节 id 的前缀——一份合集里 N 套各有五节，不加前缀 id 就撞了。单套传
    空串，产出与从前逐字相同。
    """
    branch = branch_of(md)
    prefer = 'elements/%s' % BRANCH[branch]
    ex_gun = meta(md, '异域武器', required=False)
    ex_armor = exotic_armor(md)
    o = []
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
    who = class_of(md)
    ident = [item(idx, '职业', who, prefer, kind='分节'),
             item(idx, '元素', who, prefer, kind='分节', label=branch)]
    o += ['<section class="block" id="%ssec-1">' % ns, '<h2 class="sect-label">职业</h2>']
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
    o += ['<section class="block" id="%ssec-2">' % ns,
          '<h2 class="sect-label">武器</h2>'] + row(rigs) + ['</section>', '']

    # 神器模组页的 7 个分节就是 7 件神器，模组归属写在分节标题上。源稿先写用的是
    # 哪一件，模组按它限定——「电介质」在加密数据盘与废墟石板下各有一条，不限定
    # 就只能猜；限定之后，混进别件神器的模组当场中止。
    art = meta(md, '神器')
    mods = [item(idx, '神器', n, prefer, kind=art) for n in names(md, '模组')]
    o += ['<section class="block" id="%ssec-3">' % ns, '<h2 class="sect-label">神器模组</h2>']
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
    lead = (['<li class="pair">%s</li>'
             % ''.join(item(idx, '异域护甲', n, prefer, cls='item gear', bare=True)
                       for n in ex_armor)] if ex_armor else [])
    lead += sets_of(idx, meta(md, '套装'))
    o += ['<section class="block" id="%ssec-4">' % ns, '<h2 class="sect-label">护甲</h2>']
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
        o += ['<section class="block" id="%ssec-5">' % ns,
              '<h2 class="sect-label">注解</h2>']
        o += ['<p>%s</p>' % inline('<br>'.join(b.strip().split('\n')), rich=True)
              for b in re.split(r'\n\s*\n', note[1].strip()) if b.strip()]
        o += ['</section>', '']
    return o


def render(idx, mv, arts, md, slug, season, name_cn):
    """一份源稿一个页面。有第二个 `# ` 就是合集，走另一条路。"""
    head, members = split_set(md)
    if members:
        return render_set(idx, mv, arts, head, members, slug, season, name_cn)
    return render_solo(idx, mv, arts, md, slug, season, name_cn)


def render_solo(idx, mv, arts, md, slug, season, name_cn):
    title = must(re.match(r'^#\s+(.+)$', md.split('\n')[0]),
                 '源稿第一行必须是「# 配装名」').group(1).strip()
    stamp, desc = stamp_of(md), meta(md, '描述')
    # 描述在这一页是正文（首页卡片与 meta 也用它），所以允许写着色标记：
    # 正文走 inline()，meta 与卡片用剥干净的那一份，不然标记会漏进 <meta>。
    desc_text = text_of(inline(desc, rich=True), collapse=True)
    branch, cat = branch_of(md), cat_of(md)
    class_of(md)
    prefer = 'elements/%s' % BRANCH[branch]
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
         % (icon_of(core_e, 96), ''.join(people(md))),
         '<div class="build-id">',
         # 标题那一行右端挂三枚动作：点赞、复制与详情开关。它们是对整套
         # 配装的操作，与标题同级；挂在推荐者下面时读者会以为赞的是那个人。
         # 开关的按下状态由 tip.js 从 localStorage 现读，写不进产出，所以这里
         # 只出一个空位——与点赞那个数同一条约定。
         '<div class="id-row"><h1>%s</h1><div class="head-acts">%s%s%s</div></div>'
         % (title, like_box(season, slug, button=True),
            '<button class="copy" type="button">复制配装</button>',
            TIP_SW),
         # 铭牌一行读完这套配装的身份：职业 · 元素 · 类别。类别接在这里而不是另起
         # 一栏标签——它只有一个值，占一整栏显得空。
         '<p class="cls">%s%s · %s · %s<span class="season">%s · %s</span></p>'
         % (icon_of(vocab.pick(idx, meta(md, '职业'), '职业', kind='分节'), 32),
            meta(md, '职业'),
            '<span class="%s">%s</span>' % (ELEMENT_TOKEN[branch], branch),
            cat, season.upper(), name_cn),
         '<p class="desc">%s</p>' % inline(desc, rich=True),
         # 场景与定位分两栏各带一行标签：混在一排里读者分不出「地牢」说的是适用
         # 环境、「清怪」说的是这套配装干什么用的。两栏都空就连这一层也不出——
         # 空的 .facets 在 .build-id 那道 grid 里照样占一个 gap。
         facets(md),
         '</div>',
         # 「复制配装」复制的就是这一份：剥掉着色标记的源稿，粘回配装工具能直接
         # 导入。站内没有第二处存它，所以它落在页面上而不是另拉一个文件。
         '<pre id="src" hidden>%s</pre>' % escape(uncolor(md)),
         '</header>', '']
    o += blocks_of(idx, mv, arts, md)
    o += ['</main>', '', LIKE_JS, COPY_JS,
          shell.foot(stamp, '，%s' % meta(md, '页脚', required=False)
                     if meta(md, '页脚', required=False) else '')]
    return finish(o, ['../../tip.js']), title


def one_of(idx, mv, arts, head, md, n):
    """合集里的一套：页头 + 五个分节，整块包在 <section class="set-one"> 里。

    页头不给 96px 核心图与推荐人——那两样属于整份合集、写在页顶，每套重复一遍会
    与左栏那列图打架。铭牌末位写定位；单套写在那个位置的是类别，而类别对整份
    合集只有一个值，已经写在页顶的铭牌上。
    """
    title = must(re.match(r'^#\s+(.+)$', md.split('\n')[0]),
                 '合集里每一套的第一行必须是「# 配装名称」').group(1).strip()
    branch, who = branch_of(md), class_of(md)
    desc = meta(md, '描述', required=False)
    role = '、'.join(names(md, '定位', required=False))
    o = ['<section class="set-one b-%s" id="set-%d">' % (BRANCH[branch], n),
         '<header class="one-head">',
         '<div class="id-row"><h2>%s</h2><div class="head-acts">'
         '<button class="copy" type="button">复制配装</button></div></div>' % title,
         '<p class="cls">%s%s · <span class="%s">%s</span>%s</p>'
         % (icon_of(vocab.pick(idx, who, '职业', kind='分节'), 32), who,
            ELEMENT_TOKEN[branch], branch, ' · ' + role if role else '')]
    if desc:
        o.append('<p class="desc">%s</p>' % inline(desc, rich=True))
    # 复制按钮取的就是这一份。每套各存一份，按钮按 .set-one 就近找，
    # 与单套页那个 <pre id="src"> 同一条约定。
    o += ['</header>',
          '<pre class="src" hidden>%s</pre>' % escape(uncolor(solo_src(head, md))),
          '']
    o += blocks_of(idx, mv, arts, md, ns='set%d-' % n)
    o += ['</section>', '']
    return o


def render_set(idx, mv, arts, head, members, slug, season, name_cn):
    """合集详情页：页顶是整份合集，往下左目录右配装。

    **N 套全部写进 HTML，主从视图下收起 N−1 套由 builds/set.js 在加载时施加**
    ——与列组页、折线图页「默认隐藏不写进 HTML」同一条约定。无 JS 时它天然就是
    竖排，全部可读，#set-3 照旧跳得到。
    """
    title = must(re.match(r'^#\s+(.+)$', head.split('\n')[0]),
                 '源稿第一行必须是「# 合集名」').group(1).strip()
    stamp, desc = stamp_of(head), meta(head, '描述')
    desc_text = text_of(inline(desc, rich=True), collapse=True)
    cat = cat_of(head)
    scenes = scenes_of(head)
    branch, core_e, who, roles = set_facts(idx, head, members)
    badge = ('%s%s' % (icon_of(vocab.pick(idx, who[0], '职业', kind='分节'), 32), who[0])
             if len(who) == 1 else MIXED)

    o = [shell.head('%s · %s · Starside' % (title, SETS_SECTION), desc_text, up=3,
                    sheets=['../../style.css']),
         shell.nav(title, up=3, parent=[SETS_SECTION, name_cn],
                   parent_href='../../sets/index.html'),
         '<main class="set b-%s">' % BRANCH[branch],
         '<header class="build-head">',
         '<div class="core">%s<p class="by-label">推荐者：</p>%s</div>'
         % (icon_of(core_e, 96), ''.join(people(head))),
         '<div class="build-id">',
         # 复制不在这一排：游戏里导入是一套一套的，整份合集复制出去粘不回任何
         # 地方。那枚按钮跟着每一套走，见 one_of()。
         '<div class="id-row"><h1>%s</h1><div class="head-acts">%s%s</div></div>'
         % (title, like_box(season, slug, button=True), TIP_SW),
         '<p class="cls">%s · %d 套 · %s<span class="season">%s · %s</span></p>'
         % (badge, len(members), cat, season.upper(), name_cn),
         '<p class="desc">%s</p>' % inline(desc, rich=True),
         '<div class="facets">%s%s</div>'
         % (facet('适用环境', scenes), facet('标签', roles)),
         '</div>', '</header>', '']

    why = head.split('## 合集介绍', 1)
    if len(why) == 2 and why[1].strip():
        o += ['<section class="block" id="why">',
              '<h2 class="sect-label">合集介绍</h2>']
        o += ['<p>%s</p>' % inline('<br>'.join(b.strip().split('\n')), rich=True)
              for b in re.split(r'\n\s*\n', why[1].strip()) if b.strip()]
        o += ['</section>', '']

    # 视图开关落在左栏的头上，不做成 .toolbar：那一套由 app.js 建，而配装页不引
    # app.js（引了就为一枚按钮多下 5 KB）。契约只有 data-setview 一条。
    o += ['<div class="set-wrap">',
          '<nav class="set-list" aria-label="合集内的配装">',
          '<p class="by-label">%d 套<button class="viewsw" type="button" '
          'data-setview aria-pressed="false">展开全部</button></p>' % len(members),
          '<ol>']
    for n, m in enumerate(members, 1):
        mt = must(re.match(r'^#\s+(.+)$', m.split('\n')[0]),
                  '合集里每一套的第一行必须是「# 配装名称」').group(1).strip()
        mb = branch_of(m)
        o += ['<li class="b-%s"><a href="#set-%d">%s<b>%s</b><span>%s</span></a></li>'
              % (BRANCH[mb], n,
                 icon_of(core_pick(idx, m, 'elements/%s' % BRANCH[mb]), 32),
                 mt, '、'.join(names(m, '定位', required=False)) or mb)]
    o += ['</ol>', '</nav>', '<div class="set-body">']
    for n, m in enumerate(members, 1):
        o += one_of(idx, mv, arts, head, m, n)
    o += ['</div>', '</div>', '']

    o += ['</main>', '', LIKE_JS, COPY_JS,
          shell.foot(stamp, '，%s' % meta(head, '页脚', required=False)
                     if meta(head, '页脚', required=False) else '')]
    return finish(o, ['../../tip.js', '../../set.js']), title




# 详情开关，缺省开着。**按下状态由 tip.js 现读 localStorage**，生成器只出空位。
# 两种壳：详情页与点赞、复制同排，用 .head-acts 那套素框；填表页在右下角那一条
# 里，与另外四枚同为 chip。契约只有 data-tip-sw 一条。
TIP_SW = '<button class="tipsw" type="button" data-tip-sw>详情开关</button>'
TIP_SW_CHIP = '<button id="tipsw" class="chip" type="button" data-tip-sw>详情开关</button>'


# 点赞：数只有运行时才知道，写不进产出，所以跟资料页的当前时刻高亮同一条约定
# ——生成器只出一个带 data-like 的空位，数由这段脚本填。详情页给按钮，索引页
# 只给数字（卡片整张是 <a>，里面套 <button> 不成立）。
# 一次取回全站的赞数：配装几十套，分页请求反而更慢。
# ponytail: 防重复只认 localStorage，换浏览器能再点一次。
# 赞数按小时缓存，与访问计数同一个窗口：不缓存时翻十套配装就是十次冷启动，而
# 这个数不是行情。自己点的那一下就地改缓存，即时可见；别人的赞最多晚一小时，
# 函数那边还压着一层五分钟的实例内存缓存。
LIKE_JS = ('<script>(function(){'
           'var C=[].slice.call(document.querySelectorAll("[data-like]"));if(!C.length)return;'
           'function show(el,v){(el.querySelector("b")||el).textContent=v}'
           'function key(id){return "lk"+id}'
           'var H=new Date(Date.now()+288e5).toISOString().slice(0,13),M=null;'
           'function save(){try{localStorage.setItem("lkm",JSON.stringify({h:H,m:M}))}catch(_){}}'
           'function paint(m){M=m;C.forEach(function(el){var id=el.dataset.like;show(el,m[id]||0);'
           'if(el.tagName=="BUTTON"){var on=false;try{on=!!localStorage.getItem(key(id))}catch(_){}'
           'el.setAttribute("aria-pressed",on?"true":"false")}})}'
           'var c=null;try{c=JSON.parse(localStorage.getItem("lkm")||"null")}catch(_){}'
           'if(c&&c.h===H)paint(c.m);'
           'else fetch("%s?a=likes").then(function(r){return r.json()}).then(function(m){'
           'paint(m);save()},'
           'function(x){C.forEach(function(el){show(el,"取不到："+x)})});'
           'document.addEventListener("click",function(e){'
           'var b=e.target.closest&&e.target.closest("button.like");if(!b)return;'
           'var id=b.dataset.like,on=b.getAttribute("aria-pressed")=="true";'
           'b.setAttribute("aria-pressed",on?"false":"true");'
           'try{on?localStorage.removeItem(key(id)):localStorage.setItem(key(id),"1")}catch(_){}'
           # 新数自己算：那个数就在手边的缓存里，回读一次只为拿它不值一次数据库调用，
           # 也不必等一个往返才看见自己那一下。
           'var v=Math.max(0,((M&&M[id])||0)+(on?-1:1));show(b,v);if(M){M[id]=v;save()}'
           'fetch("%s",{method:"POST",headers:{"content-type":"application/json"},'
           'body:JSON.stringify({a:"like",id:id,d:on?-1:1})})'
           '.catch(function(x){show(b,"失败："+x)})})})()</script>'
           % (shell.API, shell.API))


# 复制配装：把页面上那份剥了着色标记的源稿放进剪贴板，粘回配装工具能直接导入。
# 非安全上下文（file:// 双击打开）下 navigator.clipboard 是 undefined，那时把源稿
# 显出来并选中，让人自己按一下——不吞掉，别让人以为复制成功了。
COPY_JS = ('<script>(function(){'
           'function tip(b,t){b.dataset.tip=t;setTimeout(function(){delete b.dataset.tip},1600)}'
           # 合集里一套一份源稿，就近找；单套页只有一份，落回 #src。
           'document.addEventListener("click",function(e){'
           'var b=e.target.closest&&e.target.closest("button.copy");if(!b)return;'
           'var one=b.closest(".set-one"),'
           's=one?one.querySelector("pre.src"):document.getElementById("src");if(!s)return;'
           'if(!navigator.clipboard){s.hidden=false;var r=document.createRange();'
           'r.selectNode(s);getSelection().removeAllRanges();getSelection().addRange(r);'
           'tip(b,"\u5df2\u9009\u4e2d\uff0c\u6309 \u2318C");return}'
           'navigator.clipboard.writeText(s.textContent).then('
           'function(){tip(b,"\u5df2\u590d\u5236")},'
           'function(x){tip(b,"\u590d\u5236\u5931\u8d25 "+x.name)})})})()</script>')


def like_box(season, slug, button):
    """点赞位。id 是「赛季_slug」，与后端那条 ^[a-z0-9]+_[a-z0-9-]+$ 对上。"""
    at = '%s_%s' % (season, slug)
    if not button:
        return '<span class="likes" data-like="%s"></span>' % at
    return ('<button class="like" type="button" data-like="%s" aria-pressed="false">'
            '<span aria-hidden="true">\u2665</span> <b></b></button>' % at)


SITE_SECTION = '配装推荐'
# 合集索引页在首页「配装」组里就叫这个名字，面包屑与标题跟着它，一处定义。
SETS_SECTION = '配装合集'
SETS_DESC = ('Destiny 2 配装合集：同一角色的多套配装按场景切换使用，'
             '按适用环境分类，逐套列出技能、武器、护甲与神器模组。')
# 填表页在首页「攻略与工具」里就叫这个名字，面包屑与标题跟着它，一处定义。
# 它不挂在配装推荐下面：首页直接进得来，读者也不必先看过配装才来填一份。
FORM_NAME = '配装工具'
# 合集那一页的名字。它挂在配装工具下面（面包屑 Starside / 配装工具 / 合集工具），
# 入口在合集索引页标题右边。
SET_FORM_NAME = '合集工具'
INDEX_DESC = '按职业分类的 Destiny 2 配装推荐：职业、武器、护甲、神器模组与六维属性，每一格都链回站内资料页。'
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
    out, title = render(idx, extra('移动'), extra('神器本体'),
                        md, slug, season, name_cn)
    check(out, slug)
    shell.emit(outdir, out, title)
    head, members = split_set(md)
    if members:
        branch, core, who, roles = set_facts(idx, head, members)
        # 跨职业的合集要有一个自己的格：索引页那一维由 app.js 读小节标题现扫，
        # 三个职业里挑不出它该站哪一格。
        cls = who[0] if len(who) == 1 else MIXED
        # 场景不进标签：它就是这一页的大节标题，跳转 chip 那一排写的正是这几个
        # 字，同一排字出现两遍读者分不出哪一排管什么（与索引页「类别不做成一行
        # chip」同一条）。次要场景在详情页的「适用环境」那一栏里读得到。
        scenes = scenes_of(head)
        scene = scenes[0]
        tags = roles
    else:
        branch = meta(md, '分支')
        core = core_pick(idx, md, 'elements/%s' % BRANCH[branch])
        cls = meta(md, '职业')
        scene = ''
        tags = names(md, '场景') + names(md, '定位')
    return {'u': '%s/%s/%s/index.html' % (OUT_DIR, season, slug), 't': title,
            'season': season, 'slug': slug, 'stamp': meta(head, '更新'),
            'desc': text_of(inline(meta(head, '描述'), rich=True), collapse=True),
            'class': cls, 'tags': tags, 'branch': BRANCH[branch],
            # 分支的中文名给索引页的筛选用。DOM 里只有 b-prismatic 这个 slug，
            # 中文名读不出来，而在 app.js 里再写一份 slug→中文 就是 BRANCH 的
            # 第二份定义。职业与类别不给——那两样就是卡片上方那两级标题。
            'branch_cn': branch,
            'cat': meta(head, '类别'),
            'by': ''.join(people(head, link=False)),
            # 图标路径按详情页那三层深写的，两个索引页深浅不同，前缀由 core_node()
            # 现换——存成算好的那一份，另一页就得再存第二份。
            'core': icon_of(core, 64),
            # 合集的适用环境单选，索引页按它分大节。单套的场景多值、不分大节。
            'scene': scene,
            'set': len(members)}


def core_node(html, up):
    return '<span class="node">%s</span>' % html.replace(UP, up)


def render_index(made, sets=False):
    """配装的两张索引页，同一份实现：

        builds/index.html       单套配装，按类别分大节
        builds/sets/index.html  合集，按适用环境分大节

    两页逐层同形，只有大节那一维不同，所以不分家：卡片、筛选、空节收起都只写
    一遍。**节内照旧按职业分小节**——app.js 的职业维度读的就是 <ul> 上面那一级
    标题，换成别的分法那一维就废了；跨职业的合集站在 MIXED 那一格。

    **卡片是竖式的，一排六张**（形状见 builds/style.css）：配装多起来之后，横式
    卡一屏只放得下六张。图在最上，往下是配装名、推荐人、简介、标签、时间与赞数。
    每张卡落一个分支类，.entry 左缘那条 2px 亮边因此跟着该配装的元素色走。

    跳转 chip 对应大节（工具条的 data-label 取 .sect-label）。职业小节只是节内的
    小标题，不占 chip——大节没几个时跳转本来就不难，找职业直接在旁边搜索框输
    「术士」。搜索把某个职业滤空时，那个小标题由 builds/style.css 的一条 :has()
    自己隐藏，不加 JS。
    """
    live = [m for m in made if m['season'] == SEASON and bool(m['set']) == sets]
    if not live:
        die('当前赛季 %s 一%s都没有，索引页会是空的'
            % (SEASON, '个合集' if sets else '套配装'))
    stamp = max(m['stamp'] for m in live)
    name = SETS_SECTION if sets else SITE_SECTION
    up = 2 if sets else 1
    # 合集页在 builds/sets/ 下，卡片要多退一层才回得到 builds/<赛季>/。
    href = '../%s/%s/index.html' if sets else '%s/%s/index.html'
    aside = ('<p class="new-link"><a href="../new/set/index.html">投稿一组合集 →</a>'
             '<span>逐套选择装备，页面直接生成标准格式的合集文本</span></p>'
             '<p class="new-link"><a href="../index.html">单套配装推荐 →</a>'
             '<span>一套一页的配装，按强度、创意与 PVP 分组</span></p>' if sets else
             # 投稿入口挂在标题右边。这是填表页在站内唯一的入口（别处没有理由指向
             # 它，而没有入口的页面等于不存在），单独占一段会在卡片上面多出一整块
             # 空白。页首那句说明只留给 <meta>，正文里它把首屏推下去半屏。
             '<p class="new-link"><a href="new/index.html">投稿一套配装 →</a>'
             '<span>选完技能、武器、护甲与神器模组，页面直接生成标准配装文本</span></p>'
             '<p class="new-link"><a href="sets/index.html">配装合集 →</a>'
             '<span>同一角色的多套配装，按场景切换使用</span></p>')
    o = [shell.head('%s · Starside' % name, SETS_DESC if sets else INDEX_DESC,
                    app_js=True, up=up,
                    sheets=['../style.css'] if sets else None),
         # data-facets：按职业、分支与标签筛。维度由 app.js 从卡片现扫（<li> 的
         # b-* 类、两级标题、.tags 里的 <i>），不写进 HTML——那些字页面上已经有
         # 了，写第二遍就是同一份文本的第二个来源。
         shell.nav(name, up=up, toolbar={
             'data-section': '.block', 'data-item': '.entries > li',
             'data-label': '.sect-label', 'data-noun': '合集' if sets else '配装',
             'data-chip-label': '适用环境' if sets else '类别', 'data-facets': ''}),
         shell.page_head(name, aside=aside),
         '<main>']
    n = 0
    for top in (FACETS[0][2] if sets else CATEGORIES):
        pool = [m for m in live if (m['scene'] if sets else m['cat']) == top]
        if not pool:
            continue
        n += 1
        o += ['<section class="block" id="sec-%d">' % n,
              '<h2 class="sect-label">%s</h2>' % top]
        for cls in CLASSES + (MIXED,):
            mine = [m for m in pool if m['class'] == cls]
            if not mine:
                continue
            o += ['<h3 class="sub-label">%s</h3>' % cls, '<ul class="entries">']
            for m in mine:
                o += ['<li class="b-%s" data-branch="%s">' % (m['branch'], m['branch_cn']),
                      '<a class="entry" href="%s">' % (href % (m['season'], m['slug'])),
                      core_node(m['core'], '../' * up),
                      # 「6 套」贴在卡片右上角：一排卡里合集与单套长得一样，
                      # 不标出来读者点进去才知道这一张是六套。
                      '<span class="n-sets">%d 套</span>' % m['set'] if sets else '',
                      '<h3>%s</h3>' % m['t'],
                      m['by'],
                      '<p>%s</p>' % m['desc'],
                      '<span class="tags">%s</span>'
                      % ''.join('<i>%s</i>' % t for t in m['tags']),
                      '<span class="entry-foot">'
                      '<span class="entry-stamp">更新 %s</span>%s</span>'
                      % (m['stamp'], like_box(m['season'], m['slug'], button=False)),
                      '</a>', '</li>']
            o += ['</ul>']
        o += ['</section>', '']
    o += ['</main>', '', LIKE_JS,
          shell.foot(stamp, '，配装由各位推荐人提供，随赛季更新。')]
    out = '\n'.join(x for x in o if x != '') + '\n'
    shell.emit(os.path.join(shell.ROOT, OUT_DIR, 'sets') if sets
               else os.path.join(shell.ROOT, OUT_DIR), out,
               '%d %s' % (len(live), '个合集' if sets else '套配装'))


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


def render_desc(idx):
    """builds/desc.js：填表页悬停时那块面板的正文。

    **说明不进 vocab.js。**站内的说明文本合计二十万字上下，塞进词表会让填表页一
    打开就下将近一兆——只想导入一份源稿看一眼的人也得等。所以照 assets/search.js
    那条已有约定另出一份：不进首屏，页面加载完在空闲时预取，第一次悬停再兜一次。
    取不到就不弹面板，填表本身照常。

    键是「页面\t名字\t分节」。分节那一段解决同名不同效果——「玻璃拱顶」的 2 件与
    4 件是两条效果，名字一样。值是那一条在站内那一页上的说明原文，带着着色 span：
    那些类定义在 assets/site.css，这一页已经引了它，带色不额外要钱。

    它与 search.js 同理是页面文本的第二份副本，但在另一个文件里、不进任何页面的
    HTML，各生成器的逐字保真闸门因此照旧成立。
    """
    seen = {}
    for hits in idx.values():
        for e in hits:
            if not e.get('desc'):
                continue
            if not any(e['page'] in pages for pages in vocab.SLOTS.values()):
                continue
            seen['%s\t%s\t%s' % (e['page'], e['name'], e['kind'])] = e['desc']
    rows = ['%s:%s' % (json.dumps(k, ensure_ascii=False),
                       json.dumps(v, ensure_ascii=False))
            for k, v in sorted(seen.items())]
    body = 'window.starsideDesc = {\n%s\n};\n' % ',\n'.join(rows)
    path = os.path.join(shell.ROOT, OUT_DIR, 'desc.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)
    print('builds/desc.js —— %.1f KB，%d 条说明' % (len(body.encode()) / 1024, len(seen)))


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


def new_blocks():
    """填表页的五个分节：与详情页同构的空槽版面。单套那一页与合集那一页共用。

    候选不写进 HTML：两千条选项写进来就是把词表抄了第二份，由 form.js 按
    builds/vocab.js 建。这里因此只有骨架，没有一个装备名。
    """
    o = []
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
                          '<button type="button" data-step="-1" aria-label="减少一格">−</button>'
                          '<b>5</b>'
                          '<button type="button" data-step="1" aria-label="增加一格">+</button>'
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
    pick = slot_cell('神器', kind='__art__', cls='item', label='选择神器', bare=True)
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
    armor = ('<li class="pair">'
             + slot_cell('异域护甲', cls='item gear', label='异域护甲', bare=True)
             + slot_cell('异域护甲', cls='item gear', label='第二条异域词条', bare=True,
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
          'placeholder="备选装备、打法要点等补充说明" aria-label="注解"></textarea>',
          '</section>', '']
    return o


def set_form_head(name_cn):
    """合集那一页的页顶：合集头部、「合集介绍」、左栏目录，再开 .set-body。

    **不给合集自己的核心选择器**：核心那枚 96px 图取第一套的核心，作者把主力那一
    套摆在最前面，页顶那枚图就该是它。多一个选择器就要在六套的并集里挑，而那份
    并集只在切到每一套时才在手边。
    """
    return ['<header class="build-head" id="set-head">',
            '<div class="core">',
            # 核心那一格是**只读的镜子**，不是选择器：整份合集的核心取第一套的
            # （导入时保留源稿写的那一个）。有它这一列才与详情页同形——那一页
            # 左列就是 96px 的图加推荐者，少了它两列的高度与宽度全对不上。
            '<span class="item empty" id="f-set-core" aria-hidden="true">'
            '<span class="nm">核心</span></span>',
            '<p class="by-label">推荐者：</p>',
            '<input class="who-in" data-key="推荐人" placeholder="ID" '
            'aria-label="推荐者">',
            '</div>',
            '<div class="build-id">',
            # h1 包进 .id-row：详情页的标题就在这一层里，不包的话上下间距差一截。
            '<div class="id-row"><h1><input data-key="合集名" placeholder="合集名称" '
            'aria-label="合集名称"></h1></div>',
            # 铭牌照着下面各套显示「职业 · N 套 · 类别」，与详情页逐段同形。
            '<p class="cls"><span class="cls-id" data-mirror="合集铭牌">'
            '<span class="hint">职业与元素在各套内选择</span></span>'
            '<span class="season">%s · %s</span></p>' % (SEASON.upper(), name_cn),
            '<p class="desc"><input data-key="描述" '
            'placeholder="一句话介绍这组配装" aria-label="描述"></p>',
            # 类别与适用环境是整份合集的；定位每套一个，写在下面那一套的头上。
            '<div class="facets">%s%s</div>'
            % (facet_picks('类别', '类别', CATEGORIES, single=True),
               facet_picks(*FACETS[0])),
            '</div>', '</header>', '',
            '<section class="block" id="sec-0">',
            '<h2 class="sect-label">合集介绍</h2>',
            '<textarea id="set-why" data-key="合集介绍" rows="3" '
            'placeholder="介绍这组配装的用途，以及各套的切换时机" '
            'aria-label="合集介绍"></textarea>',
            '</section>', '',
            '<div class="set-wrap">',
            '<nav class="set-list">',
            '<p class="by-label"><b id="set-n">1 套</b></p>',
            # 目录由 form.js 按已填的那几套现建：套数是可变的，写进 HTML 就得
            # 出满上限再收起来，而这里没有「上限即版面」那个约束。
            # **移除一套的叉挂在每一行上**，不做成一枚「删掉当前这一套」的按钮：
            # 要删的多半不是正在编辑的那一套，先切过去再删是多一步。
            '<ol id="set-tabs"></ol>',
            # 加一套是一枚占满目录宽度的加号，接在列表下面——它是列表的延长，
            # 不是标题旁的控件。
            '<button type="button" class="set-add" data-set-add '
            'aria-label="新增一套">＋</button>',
            '</nav>',
            '<div class="set-body">',
            '<header class="one-head">',
            # 「复制这一套」挂在这一行的右端，与详情页 .one-head 的 .head-acts
            # 同一个位置：它是对这一套的操作，与这一套的名字同级。
            # 核心排在名字左边，与左栏目录那一行（图 + 名字 + 定位）同形，也与
            # 页顶那枚 96px 的图同一个读法。每一套各有自己的核心：它决定目录上
            # 那枚图，源稿里也是每套一行。
            '<div class="id-row">'
            '<button type="button" class="item empty one-core" id="f-core-art" '
            'data-slot="核心" data-size="32" aria-expanded="false">'
            '<span class="nm">核心</span></button>'
            '<h2><input data-key="配装名" '
            'placeholder="配装名称" aria-label="配装名称"></h2>'
            '<div class="head-acts">'
            '<button type="button" data-set-copy>创建副本</button></div></div>',
            '<p class="cls"><span class="cls-id" data-mirror="铭牌">'
            '<span class="hint">在下方「职业」区域选择职业与元素</span></span></p>',
            '<p class="desc"><input data-key="描述" placeholder="这套配装的使用场景" '
            'aria-label="这套配装的描述"></p>',
            # 每一套各有自己的核心：它决定左栏目录上那枚 32px 的图，源稿里也是
            # 每套一行。**格子是 32px 不是 96px**——96 的那一枚是整份合集的，
            # 在页顶；这里再摆一个同样大的，两枚图会打架。
            '<div class="facets">%s</div>' % facet_picks(*FACETS[1]),
            '</header>', '']


def solo_form_head(name_cn):
    """单套填表页的页头。

    与详情页逐块同形：左列是核心那枚 96px 的图加推荐者，右列是配装名、铭牌、
    描述与两栏标签。可填的那几处换成输入位，其余照详情页的类名写，版式因此由
    同一份规则管，不为填表页另写一套。
    """
    return ['<header class="build-head">',
            '<div class="core">',
            '<button type="button" class="item empty" id="f-core-art" data-slot="核心" '
            'aria-expanded="false"><span class="nm">核心</span></button>',
            '<p class="by-label">推荐者：</p>',
            '<input class="who-in" data-key="推荐人" placeholder="ID" '
            'aria-label="推荐者">',
            '</div>',
            '<div class="build-id">',
            '<h1><input data-key="配装名" placeholder="配装名称" '
            'aria-label="配装名称"></h1>',
            # 铭牌照着下面「职业」那两格显示，本身不可点——身份在那两格上选。
            '<p class="cls"><span class="cls-id" data-mirror="铭牌">'
            '<span class="hint">在下方「职业」区域选择职业与元素</span></span>'
            '<span class="season">%s · %s</span></p>' % (SEASON.upper(), name_cn),
            '<p class="desc"><input data-key="描述" placeholder="一句话介绍这套配装" '
            'aria-label="描述"></p>',
            # 类别排在最前：它是这套配装的第一层身份（详情页写在铭牌上），选了它
            # 上面的铭牌才补得全。
            '<div class="facets">%s%s%s</div>'
            % (facet_picks('类别', '类别', CATEGORIES, single=True),
               facet_picks(*FACETS[0]), facet_picks(*FACETS[1])),
            '</div>', '</header>', '']


def render_new(stamp, name_cn, sets=False):
    """填表页。sets 为真时出 builds/new/set/，否则出 builds/new/。

    产出的是**与详情页同构的空槽版面**——同一套 group()/row()/glyph()，同一批
    CSS 类。填的人看着成品的形状往里填，填完页面就是成品。

    **两页共用同一份 form.js**，模式由 #sheet 上的 data-set 声明，与 app.js 从
    .toolbar 的 data-* 读配置同一条约定：格子、选择器、导入导出完全一样，抄第二份
    只会让两边各自漂。合集那一页多出来的只有页顶那一层合集头部与左边那列目录，
    中间那块空槽版面逐字相同（new_blocks()）。

    候选不写进 HTML：两千条选项写进来就是把词表抄了第二份，由 form.js 按
    builds/vocab.js 建。这两页因此只有骨架，没有一个装备名。
    """
    up = 3 if sets else 2
    name = SET_FORM_NAME if sets else FORM_NAME
    desc = ('填写配装合集：逐套选择技能、武器、护甲与神器模组，'
            '页面直接生成标准格式的合集文本。' if sets else
            '填一份配装推荐：选完技能、武器、护甲与神器模组，页面直接生成标准配装文本，复制发给站长即可挂上站。')
    # 外壳两页共用，页头各写各的。**不切片**：按下标取前几项时，将来在
    # shell.nav() 与 <main> 之间插一行就会静默丢掉 <main>，而填表页不跑 check()，
    # 没有闸门接得住。
    o = [shell.head('%s · Starside' % name, desc, up=up,
                    sheets=['../' * (up - 1) + 'style.css']),
         shell.nav(name, up=up, **({'parent': [FORM_NAME],
                                    'parent_href': '../index.html'} if sets else {})),
         '<main id="sheet"%s>' % (' data-set' if sets else '')]
    o += set_form_head(name_cn) if sets else solo_form_head(name_cn)
    o += new_blocks()
    if sets:
        # 只收 .set-body。**「配装文本」那一节与底部那条出口留在 .set-wrap 里**、
        # 占右边那一列：它们的宽度要跟着配装那一列走，左边 208px 是目录的地方。
        o += ['</div>', '']
    o += [
          # 类名给预览用：按 sec-N 认会在增删分节时静默指错一节，
          # 与 check() 里改掉的那处同一个理由。
          '<section class="block src-block" id="sec-6">',
          '<h2 class="sect-label">配装文本</h2>',
          '<details id="src"><summary>展开配装文本</summary>',
          '<textarea id="out" readonly rows="28" spellcheck="false"></textarea>',
          '</details>',
          '<details id="imp"><summary>从配装文本导入</summary>',
          '<p class="note">粘贴一份已有的配装文本。可识别的装备会自动填入，'
          '无法识别的条目会跳过并在下方列出。导入将覆盖当前已填写的内容。</p>',
          '<textarea id="in" rows="10" spellcheck="false" '
          'placeholder="将配装文本粘贴至此" aria-label="待导入的配装文本"></textarea>',
          '<p id="imp-tip" role="status"></p>',
          '</details>', '</section>', '',
          # 这一页的出口横排一条，落在正文末尾。**预览不另建一套 DOM**：它给 #sheet
          # 加一个类，把空槽、控件与源稿那一节收起来，剩下的就是成品；那时这一条
          # 也得够得着，所以它不在被收起的那一节里。
          # 按用途分两组：左边看这一页（预览、详情开关），中间管源稿（复制、导入），
          # 右端是终态那一个（投稿）。回执跟着它报告的那两枚走。
          '<div class="src-tools">',
          '<button id="preview" class="chip" type="button" aria-pressed="false">预览配装</button>',
          TIP_SW_CHIP,
          '<span class="tool-sep" aria-hidden="true"></span>',
          '<button id="copy" class="chip" type="button">复制配装</button>',
          # 导入是一个动作不是两个：这一枚永远「导入」，文本框还空着时它带你去粘贴。
          '<button id="to-import" class="chip" type="button">导入配装</button>',
          '<span id="copy-tip" role="status"></span>',
          # 投稿直接把配装文本发到后端的待审队列。**接口地址由生成器写在
          # data-api 上**，form.js 现读——与 app.js 从 .toolbar 的 data-* 读配置
          # 同一条约定，地址仍只有 shell.API 一处定义。
          '<button id="send" class="chip" type="button" data-api="%s">投稿</button>'
          % shell.API,
          '</div>', '']
    if sets:
        o += ['</div>', '']             # 收 .set-wrap
    o += ['</main>', '',
          shell.foot(stamp, '，选项与站内资料页同一份词表，列得出来的名字生成器就查得到。')]
    o = [x for x in o if x != '']
    # vocab.js 与 tip.js 在 builds/ 下，form.js 在 builds/new/ 下——
    # 两处深浅差一层，前缀因此各算各的。
    back = '../' * (up - 1)
    out = finish(o, [back + 'vocab.js', back + 'tip.js',
                     '../' * (up - 2) + 'form.js'])
    shell.emit(os.path.join(shell.ROOT, OUT_DIR, 'new', 'set') if sets
               else os.path.join(shell.ROOT, OUT_DIR, 'new'), out, name)


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
                                 out, re.S)
                    # 合集介绍与注解同为作者写的散文，一样归源稿管。漏了它，
                    # 合集正文里的术语裸着也过得去——配装源稿不进 G6 正查。
                    + re.findall(r'<h2 class="sect-label">合集介绍</h2>(.*?)</section>',
                                 out, re.S))
    naked = text_of(re.sub(r'<span class="[^"]*">.*?</span>', '', prose, flags=re.S))
    # 判据走 items.hits_in，与 --builds 那一趟自动着色同一条：裸子串判断认不得
    # GUARD，「治愈裂痕」里的「治愈」自动着色照 GUARD 跳过、这里照子串报错，
    # 撞上的源稿怎么改都过不去。
    names = sorted((w for w in items.MECH if w not in items.LOOSE),
                   key=len, reverse=True)
    left = sorted({w for _, _, w in items.hits_in(naked, items.MECH, names,
                                                  keys=False)})
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


def sync_home(counts):
    """首页那三张配装卡的更新时间与套数随投稿漂，构建时按产出改写。
    时间从各自的产出页脚现读——那正是 check_terms.py 的 G4 拿来比对的值。

    counts 是 {href: (小标题, 数)}。**改写要带上小标题那个锚点**：一张卡里
    将来多一对 <dt><dd>（比如再写一个赛季号），不带锚点就把它也改成套数了，
    而 G4 只读第一个 <dd>，查不出来。"""
    path = os.path.join(shell.ROOT, 'index.html')
    home = open(path, encoding='utf-8').read()
    for href in ('builds/index.html', 'builds/sets/index.html',
                 'builds/new/index.html', 'builds/new/set/index.html'):
        # 变量名不能叫 path：外层那个指着 index.html，收尾要写回它。
        src = os.path.join(shell.ROOT, href)
        if not os.path.exists(src):
            # 当前赛季一个合集都没有时那一页不出。首页那张卡指向它，所以卡也要
            # 一并撤掉——留着就是首页上一个点开是 404 的入口。
            die('%s 还没生成：当前赛季没有合集，那一页不出，'
                '首页对应的那张卡要一并从 index.html 里删掉' % href)
        page = open(src, encoding='utf-8').read()
        stamp = must(re.search(r'<span class="stamp">更新 ([\d.]+)</span>', page),
                     '%s 的页脚没有更新时间' % href).group(1)
        card = must(re.search(r'<a class="entry" href="%s".*?</a>' % re.escape(href),
                              home, re.S), '首页找不到 %s 那张卡' % href)
        fixed = re.sub(r'(entry-stamp">更新 )[\d.]+', lambda m: m.group(1) + stamp,
                       card.group(0))
        if href in counts:
            label, n = counts[href]
            pat = r'(<dt>%s</dt><dd>)\d+' % re.escape(label)
            fixed, hit = re.subn(pat, lambda m: m.group(1) + str(n), fixed)
            if hit != 1:
                die('首页 %s 那张卡上「%s」那个数有 %d 处，应当只有一处'
                    % (href, label, hit))
        home = home[:card.start()] + fixed + home[card.end():]
    open(path, 'w', encoding='utf-8').write(home)


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
        # 没有合集就不出那一页：出一张空索引不如不出。shell.pages() 用同一条
        # 判据，两处因此不会一个出页一个不收。
        if any(m['set'] for m in made if m['season'] == SEASON):
            render_index(made, sets=True)
        render_vocab(idx)
        render_desc(idx)
        here = [n for _, sn, n in season_dirs() if sn == SEASON]
        if not here:
            die('references/builds/ 下没有 %s- 开头的赛季目录，填表页写不出赛季名。'
                '换季时先建目录再改 shell.SEASON' % SEASON)
        render_new(max(m['stamp'] for m in made), here[0])
        render_new(max(m['stamp'] for m in made), here[0], sets=True)
        live = [m for m in made if m['season'] == SEASON]
        sync_home({'builds/index.html': ('配装', len([m for m in live if not m['set']])),
                   'builds/sets/index.html': ('合集', len([m for m in live if m['set']]))})
    live = [m for m in made if m['season'] == SEASON]
    print('配装 %d 套，当前赛季 %s %d 套（其中 %d 个合集）'
          % (len(made), SEASON, len(live), len([m for m in live if m['set']])))


if __name__ == '__main__':
    main()
