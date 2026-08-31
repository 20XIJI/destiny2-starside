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


def icon_of(e, size):
    """词表条目的图标。图标一律是正方形，宽高只用来占位与定宽高比，所以按显示
    尺寸写；文件本身在它自己那一页里已经复核过「文件名即内容 md5」。"""
    if not e['icon']:
        return ''
    return ('<img src="%s%s" alt="" width="%d" height="%d" loading="lazy">'
            % (UP, e['icon'], size, size))


def item(idx, slot, name, prefer, kind=None, cls='item', bare=False, tail=''):
    """一格：图标 + 名字，整格是指向资料页的链接。着色由词表给，不由源稿写。

    bare 只出格子本身，不套 <li>——一把枪与它的两个 Perk 要包在同一个 <li> 里，
    才不会在换行时被拆到两行去。tail 接在名字后面（套装的「2 件」）。
    """
    e = vocab.pick(idx, name, slot, kind=kind, prefer=prefer)
    icon = icon_of(e, 48)
    label = ('<span class="%s">%s</span>' % (e['token'], e['name'])
             if e['token'] else e['name'])
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
    '超能与技能': 'M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z',
    '星相': 'M8 1.5 14.5 8 8 14.5 1.5 8Z',
    '碎片': 'M8 2 14 12.5H2Z',
    '武器与 Perk': 'M2 11.5 11 2.5l2.5 2.5-9 9Zm2.5-2.5 2.5 2.5',
    '装备与套装': 'M8 1.8 13.5 4v4.2c0 3-2.4 5-5.5 6-3.1-1-5.5-3-5.5-6V4Z',
    '头盔': 'M3 9a5 5 0 0 1 10 0v4H10v-2H6v2H3Z',
    '护臂': 'M4.5 2h7l-1 5 1.5 7h-8L5.5 7Z',
    '胸甲': 'M3 3.5h10l-1.5 9h-7Zm5 0v9',
    '腿部': 'M6 2h4v7l3 5H6Z',
    '职业物品': 'M4 2h8l-1.5 12h-5Zm4 0v12',
    '神器': 'M8 1.5 14 5v6l-6 3.5L2 11V5Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
    '生命': 'M6.5 2h3v4.5H14v3H9.5V14h-3V9.5H2v-3h4.5Z',
    '近战': 'M3 9.5 8.5 4l4.5 4.5-3 3H5.5Z',
    '手雷': 'M8 5.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4ZM6.5 4h3v1.6h-3ZM10 2.5l2.5 2',
    '超能': 'M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z',
    '职业': 'M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 3.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
    '武器': 'M2 12 12 2m-4 0h4v4',
}


def glyph(key):
    """面板标题前那一枚。没登记就不画，标题照旧只有文字。"""
    if key not in GLYPH:
        return ''
    return ('<svg class="gl" viewBox="0 0 16 16" aria-hidden="true">'
            '<path d="%s" fill="none" stroke="currentColor" stroke-width="1.4" '
            'stroke-linejoin="round"/></svg>' % GLYPH[key])


def plain_cell(text):
    """站内没有资料页的格子：纯文本，不伪装成链接。"""
    return '<li><span class="item plain"><span class="nm">%s</span></span></li>' % text


def group(title, cells, key=None):
    return ['<div class="slot">',
            '<h3>%s<span>%s</span></h3>' % (glyph(key or title), title),
            '<ul class="cells">'] + cells + ['</ul>', '</div>']


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


def render(idx, avatars, md, slug, season, name_cn):
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

    core = meta(md, '核心')
    exotics = [meta(md, '异域武器', required=False), meta(md, '异域护甲', required=False)]
    if core not in [x for x in exotics if x]:
        die('「核心：」要等于本页的异域武器或异域护甲之一，源稿写的是 %r' % core)
    core_slot = '异域武器' if core == exotics[0] else '异域护甲'
    core_e = vocab.pick(idx, core, core_slot, prefer=prefer)

    o = [shell.head('%s · %s · Starside' % (title, SITE_SECTION), desc_text, up=3,
                    sheets=['../../style.css']),
         shell.nav(title, up=3, parent=[SITE_SECTION, name_cn]),
         '<main>',
         '<header class="build-head">',
         '<span class="core">%s</span>' % icon_of(core_e, 96),
         '<div class="build-id">',
         '<h1>%s<span class="cls">%s<span>%s · %s</span></span></h1>'
         % (title, icon_of(vocab.pick(idx, meta(md, '职业'), '职业', kind='分节'), 28),
            meta(md, '职业'),
            '<span class="%s">%s</span>' % (ELEMENT_TOKEN[branch], branch)),
         '<p class="desc">%s</p>' % inline(desc, rich=True),
         '<p class="by">%s</p>' % ''.join(people(md, avatars)),
         '<ul class="tags">%s</ul>'
         % ''.join('<li>%s</li>' % t for t in names(md, '场景') + names(md, '定位')),
         '<p class="season">%s · %s</p>' % (season.upper(), name_cn),
         '</div>', '</header>', '']

    # 三块按参考图那种读法分：先是职业与技能，再是星相，最后碎片。
    # 「职业」与「移动」不查表——职业是三选一，移动手段站内还没有资料页。
    skills = [item(idx, '超能', meta(md, '超能'), prefer)]
    for key in ('手雷', '近战'):
        for n in names(md, key, required=False):
            skills.append(item(idx, key, n, prefer))
    if meta(md, '移动', required=False):
        skills.append(plain_cell(meta(md, '移动')))
    for n in names(md, '职业技能', required=False):
        skills.append(item(idx, '职业技能', n, prefer))
    o += ['<section class="block" id="sec-1">', '<h2 class="sect-label">职业</h2>']
    o += group('超能与技能', skills)
    o += group('星相', [item(idx, '星相', n, prefer) for n in names(md, '星相')])
    o += group('碎片', [item(idx, '碎片', n, prefer) for n in names(md, '碎片')])
    o += ['</section>', '']

    # 一把枪与它的 Perk 包成一组，换行时不会被拆开——「岁时之巅」跟「聚合充能」
    # 分处两行时，读者对不上哪个 Perk 属于哪把枪。
    guns = []
    if exotics[0]:
        guns.append('<li class="rig">%s</li>'
                    % item(idx, '异域武器', exotics[0], prefer, cls='item gun', bare=True))
    for line in re.findall(r'^传说武器：(.*)$', md, re.M):
        gun, _, perks = line.partition('|')
        rig = [item(idx, '传说武器', gun.strip(), prefer, cls='item gun', bare=True)]
        rig += [item(idx, 'Perk', p.strip(), prefer, cls='item perk-cell', bare=True)
                for p in perks.split('、') if p.strip()]
        guns.append('<li class="rig">%s</li>' % ''.join(rig))
    o += ['<section class="block" id="sec-2">',
          '<h2 class="sect-label">武器</h2>'] + group('武器与 Perk', guns) + ['</section>', '']

    # 神器模组页的 7 个分节就是 7 件神器，模组归属写在分节标题上。源稿先写用的是
    # 哪一件，模组按它限定——「电介质」在加密数据盘与废墟石板下各有一条，不限定
    # 就只能猜；限定之后，混进别件神器的模组当场中止。
    art = meta(md, '神器')
    mods = [item(idx, '神器', n, prefer, kind=art) for n in names(md, '模组')]
    o += ['<section class="block" id="sec-3">',
          '<h2 class="sect-label">神器模组</h2>'] + group(art, mods, key='神器')
    o += ['</section>', '']

    armor = [item(idx, '异域护甲', exotics[1], prefer, cls='item gear')] if exotics[1] else []
    armor += sets_of(idx, meta(md, '套装'))
    o += ['<section class="block" id="sec-4">',
          '<h2 class="sect-label">护甲</h2>'] + group('装备与套装', armor)
    for part in PARTS:
        mods = names(md, part, required=False)
        if mods:
            o += group(part, [item(idx, '护甲模组', n, prefer, kind=part) for n in mods])
    o += ['</section>', '']

    o += ['<section class="block" id="sec-5">',
          '<h2 class="sect-label">六维</h2>',
          '<ul class="stats">'] + stats_of(meta(md, '六维')) + ['</ul>', '</section>', '']

    note = md.split('## 注解', 1)
    if len(note) == 2 and note[1].strip():
        o += ['<section class="block" id="sec-6">',
              '<h2 class="sect-label">注解</h2>']
        o += ['<p>%s</p>' % inline('<br>'.join(b.strip().split('\n')), rich=True)
              for b in re.split(r'\n\s*\n', note[1].strip()) if b.strip()]
        o += ['</section>', '']

    o += ['</main>', '',
          shell.foot(stamp, '，%s' % meta(md, '页脚', required=False)
                     if meta(md, '页脚', required=False) else '')]
    return '\n'.join(x for x in o if x != '') + '\n', title


SITE_SECTION = '推荐配装'
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
    out, title = render(idx, avatars, md, slug, season, name_cn)
    check(out, slug)
    shell.emit(outdir, out, title)
    core = vocab.pick(idx, meta(md, '核心'),
                      '异域武器' if meta(md, '核心') == meta(md, '异域武器', required=False)
                      else '异域护甲')
    return {'u': '%s/%s/%s/index.html' % (OUT_DIR, season, slug), 't': title,
            'season': season, 'slug': slug, 'stamp': meta(md, '更新'),
            'desc': text_of(inline(meta(md, '描述'), rich=True), collapse=True), 'class': meta(md, '职业'),
            'tags': names(md, '场景') + names(md, '定位'),
            'by': ''.join(people(md, avatars)),
            'core': '<span class="node">%s</span>' % icon_of(core, 64).replace(UP, '../')}


def render_index(made):
    """builds/index.html：当前赛季的配装卡片，按三个职业分节。

    卡片复用首页那套 .entry 形状（左图标 + 正文 + 右列），不为配装另造一种卡。
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
         shell.page_head(SITE_SECTION, INDEX_DESC),
         '<main>',
         # 填表页的入口只有这一处：站内别的地方没有理由指向它，
         # 而没有入口的页面等于不存在。
         '<p class="new-link"><a href="new/index.html">投稿一套配装 →</a>'
         '<span>选完技能、武器、护甲与神器模组，页面直接生成标准源稿</span></p>']
    n = 0
    for cls in CLASSES:
        mine = [m for m in live if m['class'] == cls]
        if not mine:
            continue
        n += 1
        o += ['<section class="block" id="sec-%d">' % n,
              '<h2 class="sect-label">%s</h2>' % cls, '<ul class="entries">']
        for m in mine:
            o += ['<li>', '<a class="entry" href="%s/%s/index.html">'
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
    """builds/vocab.js：填表页那几个下拉的选项表。

    与生成器查的是同一份词表，所以填表页列得出来的名字，生成器一定查得到；
    表只建一次，两处用。一条一行，git 存得下增量。
    """
    by_slot = {}
    for hits in idx.values():
        for e in hits:
            for slot, pages in vocab.SLOTS.items():
                if e['page'] in pages:
                    by_slot.setdefault(slot, set()).add((e['name'], e['kind']))
    rows = []
    for slot in vocab.SLOTS:
        opts = sorted(by_slot.get(slot, ()))
        rows.append('%s:[%s]' % (json.dumps(slot, ensure_ascii=False),
                                 ','.join(json.dumps([n, k], ensure_ascii=False)
                                          for n, k in opts)))
    body = 'window.starsideVocab = {\n%s\n};\n' % ',\n'.join(rows)
    path = os.path.join(shell.ROOT, OUT_DIR, 'vocab.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)
    print('builds/vocab.js —— %.1f KB，%d 个槽位'
          % (len(body.encode()) / 1024, len(by_slot)))


def render_new(stamp):
    """builds/new/index.html：填表页。表单由 form.js 按 vocab.js 建出来——
    选项两千条，写进 HTML 就是把词表抄了第二份。"""
    desc = '填一份推荐配装：选完技能、武器、护甲与神器模组，页面直接生成标准源稿，复制发给站长即可挂上站。'
    o = [shell.head('配装填表 · %s · Starside' % SITE_SECTION, desc, up=2,
                    sheets=['../style.css']),
         shell.nav('配装填表', up=2, parent=[SITE_SECTION]),
         shell.page_head('配装填表', desc),
         '<main>',
         '<section class="block" id="sec-1">',
         '<h2 class="sect-label">填表</h2>',
         '<div id="form"></div>',
         '<h2 class="sect-label">生成的源稿</h2>',
         '<textarea id="out" readonly rows="28" spellcheck="false"></textarea>',
         '<p><button id="copy" type="button">复制</button></p>',
         '</section>',
         '</main>', '',
         shell.foot(stamp, '，选项与站内资料页同一份词表，列得出来的名字生成器就查得到。'),
         '<script src="../vocab.js"></script>',
         '<script src="form.js" defer></script>']
    out = '\n'.join(x for x in o if x != '') + '\n'
    shell.emit(os.path.join(shell.ROOT, OUT_DIR, 'new'), out, '配装填表')


def check(out, slug):
    """结构闸门。正文没有可比的连续文本（全是查表补出来的图标与链接），
    所以这里查的是「该有的段都在、标记都转干净了」。

    另加一条着色闸门，只管作者写的那两段散文（描述与注解）：槽位那些名字由查表
    着色，不归源稿管；散文归源稿管，全站术语在里面素着就是漏了。词表与 G6 同一份
    （items.py 的 MECH 减去 LOOSE），不在这里另立一份。"""
    prose = ''.join(re.findall(r'<p class="desc">(.*?)</p>', out, re.S)
                    + re.findall(r'<section class="block" id="sec-6">(.*?)</section>',
                                 out, re.S))
    naked = text_of(re.sub(r'<span class="[^"]*">.*?</span>', '', prose, flags=re.S))
    left = sorted({w for w in items.MECH if w not in items.LOOSE and w in naked})
    if left:
        die('%s 的描述或注解里这些术语没着色：%s\n'
            '  写成 {token|词}，token 见 items.py 的 MECH' % (slug, '、'.join(left)))
    for want in ('<h1>', 'class="build-head"', 'class="stats"'):
        if want not in out:
            die('%s 的产出里缺 %s' % (slug, want))
    if '{' in out[out.index('<main>'):out.index('</main>')]:
        die('%s 有没转换的着色标记' % slug)


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
        render_new(max(m['stamp'] for m in made))
    print('配装 %d 套，当前赛季 %s %d 套'
          % (len(made), SEASON, len([m for m in made if m['season'] == SEASON])))


if __name__ == '__main__':
    main()
