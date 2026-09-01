"""配装词表：从已生成的资料页现扫「名字 → 图标、页面、锚点、着色」。

配装源稿只写名字，图标与链接由这里查出来——图标文件名是内容的 md5，抄进配装源稿
就等于把它记在两处，换图时配装页会静默指向不存在的文件。

扫产出而不是扫源稿：三个生成器的产出结构统一（section[id] + .gen 行、.mod、.set），
一份实现覆盖全部页面；源稿那边要按生成器分三种方言处理，且没有分节 id，链过去
落不到位置。这一条与 build-search.py 同理。

同名撞车由 pick() 处理：配装源稿写了「分支：棱镜」，同名条目优先取该分支那一页
（星相「地狱火」在烈日页与棱镜页各有一条，棱镜配装该链到棱镜页）；仍然分不出来
就报出全部候选中止，不猜。
"""

import hashlib
import json
import os
import re

import shell
from markup import die, must, text_of

# 元素页 → 着色 token。六个分支页上的碎片、星相、超能、手雷、近战都归本元素。
ELEM_PAGES = ['elements/%s' % e for e in
              ('arc', 'solar', 'void', 'stasis', 'strand', 'prismatic')]

ELEMENTS = {'arc': 'el-arc', 'solar': 'el-solar', 'void': 'el-void',
            'stasis': 'el-stasis', 'strand': 'el-strand', 'prismatic': 'el-prismatic'}

# 每一页给一个 token；空串表示这一页的名字不着色，身份靠链接与图标表达。
# 传说武器与护甲模组在站内本来就是不着色的行标题，这里不给它们新造颜色。
TOKENS = dict({'elements/%s' % e: t for e, t in ELEMENTS.items()},
              **{'elements/class-abilities': '',
                 'exotic-weapon': 'exotic', 'exotic-armor': 'exotic',
                 'artifact-mods': 'art-perk', 'weapon-perks': 'perk',
                 'armor-mods': '', 'armor-sets': '',
                 'shopping-primary': '', 'shopping-special': '',
                 'shopping-heavy': '', 'shopping-other': ''})

SECTION = re.compile(r'<section class="(?:block|artifact|cat)" id="([^"]+)"')
LABEL = re.compile(r'<h2[^>]*>(.*?)</h2>', re.S)
ROW = re.compile(r'<tr>\s*<th scope="row">(.*?)</th>(.*?)</tr>', re.S)
LANE = re.compile(r'<tr class="lane">\s*<th[^>]*>(.*?)</th>', re.S)
MOD = re.compile(r'<article class="mod" data-tier="(\d)"[^>]*>\s*'
                 r'<img[^>]*src="([^"]+)"[^>]*>\s*<h4>(.*?)</h4>\s*'
                 r'<div class="mod-desc">(.*?)</div>', re.S)
SET = re.compile(r'<article class="set" id="([^"]+)">(.*?)</article>', re.S)
BONUS = re.compile(r'<img class="bonus-icon" src="([^"]+)"[^>]*>'
                   r'<span class="piece">(.*?)</span><span class="bonus-name">(.*?)</span>'
                   r'\s*</h4>\s*<div class="bonus-body">(.*?)</div>', re.S)
TD = re.compile(r'<td([^>]*)>(.*?)</td>', re.S)
CLS = re.compile(r'class="([^"]+)"')
IMG = re.compile(r'<img[^>]*src="(icons/[^"]+)"')
# 异域职业物品那张表一行摆两条词条：行标题一条，中间一格再一条（源稿写
# `{spirit|噬星者之灵}`，整格只有这一个标记，class 因此落在 <td> 上）。
# 只认行标题会漏掉一半——36 条里只进来 18 条。
SPIRIT = re.compile(r'<td class="spirit">(.*?)</td>\s*<td class="ico">'
                    r'<img[^>]*src="(icons/[^"]+)"', re.S)


# 带页内搜索框的页面：链接落到行上而不是分节上。app.js 见 ?q= 即先过滤再滚，
# 所以锚点给到分节就够，行由 q 挑出来。没有搜索框的页面加了 q 也没人接。
SEARCHABLE = {}


def searchable(page, html=None):
    """这一页有没有页内搜索框。扫页时登记，取用时只读——没登记就是调用方
    在 build() 之前问的，静默当成「没有」会让链接整批丢掉 ?q=。

    判据按 app.js 的三档来：列组模式与折线图模式整块不建搜索；有工具条且认得出
    条目的才建。**不能只看 data-item**——神器模组页用的是缺省选择器，工具条上
    一个 data-* 都没有，按那一条会被判成没有搜索框，链接整批丢掉 ?q=。"""
    if html is not None:
        SEARCHABLE[page] = ('class="toolbar"' in html
                            and 'data-cols=' not in html
                            and 'data-chart=' not in html
                            and ('data-item=' in html or 'data-section=' not in html))
    elif page not in SEARCHABLE:
        die('还没扫过 %s，问不出它有没有搜索框' % page)
    return SEARCHABLE[page]


def entry(page, anchor, kind, name, icon, sub='', q='', pos='', desc=''):
    # pos 只有神器模组给：'行,档' —— 那一页每件神器恰好七行、每行一/二/三级三枚，
    # 填表页的选择器照这个位置摆成 7 列 × 3 行，与神器盘同形，挑起来不用数。
    return {'page': page, 'anchor': anchor, 'kind': kind, 'name': name, 'pos': pos,
            'icon': '%s/%s' % (page, icon) if icon else '',
            # q 是落地时的过滤词，'—' 表示这一条不过滤（分节标题那一类）
            'token': TOKENS[page], 'sub': sub, 'q': '' if q == '—' else (q or name),
            # desc 是这一条在站内那一页上的说明，原样带着着色 span：填表页悬停时
            # 摆出来，选装备不必另开一页去查。它不进 vocab.js，另出一份 desc.js。
            'desc': desc}


def tds(body):
    """一行里 <th> 之后那些格：(class, 内部 HTML)。"""
    return [(hit.group(1) if (hit := CLS.search(a)) else '', inner)
            for a, inner in TD.findall(body)]


# 说明旁边那一格：冷却与能耗。配装时要算的正是这两样，各自不过十几个字，一并
# 收进来排在说明上方。属性变化那一列没有 class（有值时是裸格），由 panel() 切在
# 说明后面一并收进来；写「—」的占位不收。
# 星相那一列是碎片槽位图，不收：面板里只放读得出来的字。
VALUE_CLS = ('cd', 'cost')

# 购物清单那四页没有说明列——一行是十七格属性（排名、评级、框架、来源、几列
# Perk），首个裸格取到的是评级那个孤零零的「A」。这四页不出说明。
NO_DESC = ('shopping-primary', 'shopping-special', 'shopping-heavy', 'shopping-other')


def panel(cells):
    """(说明 HTML, 数值 HTML)。

    **说明是第一个裸 <td>。**列数在同一页里都不定——起源特性那一节比同页别的分节
    多一个来源列，护甲模组有 3 列与 4 列两种——按列号取必然取错；而碎片那一列
    「属性变化」有值时也是裸格，按「最后一个裸格」取会取到它。第一个裸格恒是说明。
    """
    desc, val = '', []
    for i, (cls, inner) in enumerate(cells):
        if not cls and not desc:
            desc = inner
            continue
        if not desc or (cls and cls not in VALUE_CLS):
            continue
        if text_of(inner, collapse=True) in ('', '—'):
            continue
        val.append(inner)
    return desc, ' '.join(val)


def split_spirit(cells):
    """异域职业物品那张表一行摆两条词条，左半属行标题，右半属 <td class="spirit">
    里那一条。不在这里切开，左边那条会把右边整条说明当成自己的数值格。"""
    for i, (cls, _) in enumerate(cells):
        if cls == 'spirit':
            return cells[:i], cells[i + 1:]
    return cells, []


def scan_page(page):
    """一页 → 若干条目。表格行、神器模组、护甲套装三种形状。"""
    path = os.path.join(shell.ROOT, *page.split('/'), 'index.html')
    if not os.path.exists(path):
        die('词表要扫的页面还没生成：%s（先跑三个资料生成器）' % page)
    with open(path, encoding='utf-8') as f:
        html = f.read()
    out = []
    searchable(page, html)
    for anchor, body in chunks(html):
        head = LABEL.search(body)
        label = text_of(head.group(1), collapse=True) if head else ''
        if page == 'artifact-mods':
            for k, (tier, icon, n, d) in enumerate(MOD.findall(body)):
                out.append(entry(page, anchor, label, text_of(n, collapse=True), icon,
                                 pos='%d,%s' % (k // 3, tier), desc=d))
            continue
        if page == 'armor-sets':
            for sid, set_body in SET.findall(body):
                name = text_of(must(re.search(r'<h3>(.*?)</h3>', set_body, re.S),
                                    '套装 %s 没有名字' % sid).group(1), collapse=True)
                # 玩家按来源叫套装（「玻璃拱顶四件套」），所以来源也做一个键。
                # 两条指向同一处，写哪个都查得到，格子上把另一个写成副名。
                src = re.search(r'<dt>来源</dt><dd>(.*?)</dd>', set_body, re.S)
                src = text_of(src.group(1), collapse=True) if src else ''
                for icon, piece, bonus, d in BONUS.findall(set_body):
                    kind = text_of(piece, collapse=True)
                    # 效果名在站内是这条效果的标题，说明摆出来时接在它下面。
                    d = '<p class="bn">%s</p>%s' % (bonus, d)
                    out.append(entry(page, sid, kind, name, icon, sub=src, desc=d))
                    if src and src != name:
                        out.append(entry(page, sid, kind, src, icon, sub=name, desc=d))
            continue
        # 分节标题自带的图标（「## ![](…) 猎人」）也进词表：配装页首要用真的职业图标。
        head_img = IMG.search(head.group(1)) if head else None
        if head_img and label:
            # 分节标题是分节不是行，**不带 ?q=**：拿它去过滤会把整页行滤光，
            # 落地是一张空页。这一类只滚到分节。
            out.append(entry(page, anchor, '分节', label, head_img.group(1), q='—'))
        lane = ''
        for m in re.finditer(r'<tr class="lane">.*?</tr>|<tr>\s*<th scope="row">.*?</tr>',
                             body, re.S):
            hit = LANE.match(m.group(0))
            if hit:
                lane = text_of(hit.group(1), collapse=True)
                continue
            row = ROW.match(m.group(0))
            if not row:
                continue
            icon = IMG.search(row.group(2))
            mine, theirs = ((), ()) if page in NO_DESC else split_spirit(tds(row.group(2)))
            d, v = panel(mine)
            out.append(entry(page, anchor, lane or label,
                             text_of(row.group(1), collapse=True),
                             icon.group(1) if icon else '', desc=wrap(d, v)))
            for name, ico in SPIRIT.findall(m.group(0)):
                d, v = panel(theirs)
                out.append(entry(page, anchor, lane or label,
                                 text_of(name, collapse=True), ico, desc=wrap(d, v)))
    return out


def wrap(desc, val):
    """表格行的说明是一段带 <br> 的行内 HTML，套一层 <p> 才与神器模组、护甲套装
    那两处的多段 <p> 同形——面板一套样式管两种。数值排在说明上方一行。"""
    if not desc and not val:
        return ''
    return ('<p class="v">%s</p>' % val if val else '') + '<p>%s</p>' % desc


def chunks(html):
    """(锚点, 分节 HTML) 一串。分节之外的内容不进词表。"""
    parts = SECTION.split(html)
    return list(zip(parts[1::2], parts[2::2]))


VARIANTS = os.path.join(shell.ROOT, 'tools', 'mod-variants.json')


def variants():
    """护甲模组的变体：站内一行盖住一族（「虹吸」一行盖住 16 枚元素虹吸），
    配装要指到具体那一枚。表由 tools/mods.py 从官方物品表蒸馏，图标现取现存。

    **锚点仍是复合那一行**——说明、数值与三档能耗都写在那里，跳过去才有东西读；
    格子上把行名写成副名，读者知道自己点过去会落在哪一条上。"""
    if not os.path.exists(VARIANTS):
        die('缺 tools/mod-variants.json，跑一次 tools/mods.py --distill <官方物品表>')
    with open(VARIANTS, encoding='utf-8') as f:
        table = json.load(f)
    out = []
    for name, meta in table.items():
        if not meta.get('icon'):
            die('%s 还没有图标，跑一次 tools/mods.py --icons' % name)
        # 文件名即内容的 md5 前 10 位，每次转换都复核——图标目录设了一年的浏览器
        # 缓存，原地覆盖会让读者看一年的旧图（与 markup.Icons 同一条规矩）。
        path = os.path.join(shell.ROOT, 'armor-mods', 'icons', meta['icon'])
        if not os.path.exists(path):
            die('%s 的图标不在：armor-mods/icons/%s' % (name, meta['icon']))
        with open(path, 'rb') as f:
            want = hashlib.md5(f.read()).hexdigest()[:10] + '.webp'
        if want != meta['icon']:
            die('armor-mods/icons/%s 的内容与文件名对不上，应叫 %s'
                % (meta['icon'], want))
        out.append({'page': 'armor-mods', 'anchor': meta['anchor'], 'kind': meta['part'],
                    'name': name, 'icon': 'armor-mods/icons/%s' % meta['icon'],
                    'token': '', 'sub': meta['row'], 'pos': '', 'desc': '',
                    # 落地过滤用复合行的名字：变体名在那一页一次都不出现，
                    # 拿它去过滤会滤成空页，看着像跳错了。
                    'q': meta['row']})
    return out


def build():
    """全部条目。同名的挂在一个键下，取用时由 pick() 挑。"""
    idx = {}
    for page in TOKENS:
        for e in scan_page(page):
            if e['name']:
                idx.setdefault(e['name'], []).append(e)
    for e in variants():
        # 变体在站内没有独立的一行，说明只有复合那一行有（「电弧虹吸」的机制就写
        # 在「虹吸」那一行上）。sub 存的正是那一行的名字，照它借过来。
        e['desc'] = next((r['desc'] for r in idx.get(e['sub'], ())
                          if r['page'] == 'armor-mods'), '')
        idx.setdefault(e['name'], []).append(e)
    return idx


# 槽位 → 允许的来源页。查表按槽位限定范围，同名撞车因此撞不上：
# 「全知之眼」既是异域护甲又是一把传说狙，源稿写在哪个键上就只查哪几页。
SLOTS = {
    '超能': tuple(ELEM_PAGES), '星相': tuple(ELEM_PAGES), '碎片': tuple(ELEM_PAGES),
    '手雷': tuple(ELEM_PAGES), '近战': tuple(ELEM_PAGES),
    # 职业技能只查这一页：三个职业的全部职业技能都在它上面，而分支页里也各自
    # 列了一遍（凤凰俯冲在烈日页与这一页各有一条），限定到一页即不必猜。
    '职业技能': ('elements/class-abilities',),
    '异域武器': ('exotic-weapon',),
    '传说武器': ('shopping-primary', 'shopping-special', 'shopping-heavy', 'shopping-other'),
    'Perk': ('weapon-perks',),
    '异域护甲': ('exotic-armor',),
    '套装': ('armor-sets',),
    '护甲模组': ('armor-mods',),
    '神器': ('artifact-mods',),
    # 职业只取三个职业页的分节图标，那是站内唯一一处三个职业的图。
    '职业': ('elements/class-abilities',),
    # 元素查的是六个分支页上「那个职业」的分节图——一枚图同时编码职业与元素
    # （虚空页的猎人那枚就是猎人形 + 虚空色），站内没有单画一套分支图。
    # 查的名字因此是职业名，显示的名字由调用方用 label 换成分支名。
    '元素': tuple(ELEM_PAGES),
}


def bare_kind(kind):
    """分节标题去掉括注：「废墟石板 (异端)」→「废墟石板」。"""
    return kind.split(' (')[0].strip()


def pick(idx, name, slot, kind=None, prefer=''):
    """按名字取条目。范围由槽位限定，kind 再按分节收一道（部位、件数）。

    prefer 是配装分支所在的元素页：星相「地狱火」在烈日页与棱镜页各有一条，
    棱镜配装该链到棱镜页。同页同名的几条是同一件东西的不同档（神器模组的
    一/二/三级），取第一条即可，链过去落在同一页同一节。
    """
    if slot not in SLOTS:
        die('槽位「%s」没有登记来源页' % slot)
    hits = [h for h in idx.get(name, []) if h['page'] in SLOTS[slot]]
    if kind is not None:
        # 分节标题带括注时按括注前那一截比（神器模组页写「废墟石板 (异端)」），
        # 括注是来源赛季，不是这件神器的名字。
        hits = [h for h in hits if bare_kind(h['kind']) == kind]
    if not hits:
        where = '、'.join(SLOTS[slot])
        die('「%s：%s」在 %s 里查不到。站内查得到才写得进配装——'
            '确认写法与资料页一致，或先把它补进对应的资料页。' % (slot, name, where))
    if prefer:
        same = [h for h in hits if h['page'] == prefer]
        if same:
            hits = same
    if len({h['page'] for h in hits}) > 1:
        die('「%s：%s」在站内有多条同名条目，分不出该链哪一条：\n  %s'
            % (slot, name, '\n  '.join('%s · %s' % (h['page'], h['kind']) for h in hits)))
    return hits[0]


ITEM = (re.compile(r'<tr(?![^>]*class="lane")[^>]*>(.*?)</tr>', re.S),
        re.compile(r'<article class="mod"[^>]*>(.*?)</article>', re.S),
        re.compile(r'<article class="set"[^>]*>(.*?)</article>', re.S))


def check_landing(idx):
    """每条的 ?q= 拿到目标页上试一次：滤不出任何条目的当场报出。

    链接落地由那一页的搜索框接手过滤，过滤词在那一页一个字都不出现时，读者看到
    的是一张空页——比不加过滤更糟，且从产出上看不出来（href 本身是好的）。
    这一条只在有搜索框的页面上成立；没有搜索框的页面只滚到分节。
    """
    texts = {}
    for page in TOKENS:
        if not searchable(page):
            continue
        with open(os.path.join(shell.ROOT, *page.split('/'), 'index.html'),
                  encoding='utf-8') as f:
            html = f.read()
        texts[page] = [text_of(m, collapse=True) for pat in ITEM for m in pat.findall(html)]
    bad, n = [], 0
    for hits in idx.values():
        for e in hits:
            if not e['q'] or e['page'] not in texts:
                continue
            n += 1
            if not any(e['q'] in t for t in texts[e['page']]):
                bad.append('%s → %s（过滤词 %s）' % (e['name'], e['page'], e['q']))
    if bad:
        die('这些条目的链接落地会滤成空页：\n  %s' % '\n  '.join(bad[:20]))
    return n


def main():
    idx = build()
    total = sum(len(v) for v in idx.values())
    dup = {k: v for k, v in idx.items() if len(v) > 1}
    per = {}
    for hits in idx.values():
        for h in hits:
            per[h['page']] = per.get(h['page'], 0) + 1
    for page in TOKENS:
        print('%-26s %4d' % (page, per.get(page, 0)))
    print('合计 %d 条，%d 个名字，%d 个名字撞车' % (total, len(idx), len(dup)))
    print('落地检查：%d 条带过滤词，全部滤得出条目；'
          '无搜索框的页面 %s 只滚到分节'
          % (check_landing(idx),
             '、'.join(p for p in TOKENS if not searchable(p)) or '无'))
    for k, v in sorted(dup.items())[:15]:
        print('  %s ← %s' % (k, '、'.join(h['page'] for h in v)))


if __name__ == '__main__':
    main()
