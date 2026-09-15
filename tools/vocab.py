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

import pagedex
from pagedex import ELEM_PAGES
import shell
from markup import die, text_of

SEARCHABLE = {}


def searchable(page):
    """这一页有没有页内搜索框。索引里带着这一位，build() 时登记，取用时只读。

    没登记就是调用方在 build() 之前问的，静默当成「没有」会让跨页链接整批丢掉
    ?q=，落地时读者就停在一整节里自己找。"""
    if page not in SEARCHABLE:
        die('还没建索引就问 %s 有没有搜索框' % page)
    return SEARCHABLE[page]


VARIANTS = os.path.join(shell.ROOT, 'tools', 'mod-variants.json')


def variants():
    """护甲模组的变体：站内一行盖住一族（「虹吸」一行盖住 16 枚元素虹吸），
    配装要指到具体那一枚。表由 tools/mods.py 从事实层蒸馏，图标现取现存。

    **锚点仍是复合那一行**——说明、数值与三档能耗都写在那里，跳过去才有东西读；
    格子上把行名写成副名，读者知道自己点过去会落在哪一条上。"""
    if not os.path.exists(VARIANTS):
        die('缺 tools/mod-variants.json，跑一次 tools/mods.py --distill')
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
                    # 变体自己的主键：它是一枚具体的模组，不是复合行那一条的别名。
                    'keys': meta.get('keys') or [],
                    'token': '', 'sub': meta['row'], 'pos': '', 'desc': '',
                    # 落地过滤用复合行的名字：变体名在那一页一次都不出现，
                    # 拿它去过滤会滤成空页，看着像跳错了。
                    'q': meta['row']})
    return out


def sources():
    """配装词表读哪几页：从 SLOTS 现取。

    **索引覆盖的页比这里多**——资料页只要行标题落得到主键就建索引，那是站内自己的
    物品表；配装词表只是它的一个消费者，读的是 SLOTS 逐槽位写明的那几页。两件事
    从前共用 pagedex.TOKENS 一张表，于是给索引加一页就等于给「异域武器」这种查法
    多一个撞车来源。真相留在 SLOTS 一处，这里现取。
    """
    return sorted({p for pages in SLOTS.values() for p in pages})


def build():
    """全部条目。同名的挂在一个键下，取用时由 pick() 挑。

    读 data/entities/，不扫产出的 HTML：锚点、分节与说明本来就只有生成器自己
    知道，由它经实体层交出来；回头用正则猜要咬死产出结构（给套装那一格加一个
    属性就让 id="…" 后面不再紧跟 >），还猜不出主键。
    """
    idx = {}
    for page in sources():
        got = pagedex.must_read(page)
        SEARCHABLE[page] = got['searchable']
        # **位置与渲染从索引取，事实从实体层取。**锚点、页内筛选词、图、渲染后的
        # 说明都是渲染器才知道的事，实体层里没有它们，也不该有。
        for row in got['entries']:
            if not row['name'] or row['of']:
                # 子条目不进配装词表：异域那两页 PERK 列里的词条挂在行标题下，
                # 是另一件东西。混进来，「异域武器：狂暴」会查到一枚词条。
                continue
            idx.setdefault(row['name'], []).append(
                dict(row, page=page, token=got['token']))
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


# 分节标题里那个消歧括注的起头。**只有这一处定义**：它随 vocab.js 发到填表页，
# form.js 的 bare() 读的是同一个值，不再各写一份。
KIND_TAIL = ' （'


def bare_kind(kind):
    """分节标题去掉括注：「废墟石板 （异端）」→「废墟石板」。"""
    return kind.split(KIND_TAIL)[0].strip()


# 消歧括注：源稿在名字后面写分节挑一条同名的（「隐士（冲锋枪）」）。
# Bungie 在不同弹药档上复用枪名，站内因此有真正的同名不同物。
TAIL = re.compile(r'（([^（）]+)）$')


def pick(idx, name, slot, kind=None, prefer=''):
    """按名字取条目。范围由槽位限定，kind 再按分节收一道（部位、件数）。

    prefer 是配装分支所在的元素页：星相「地狱火」在烈日页与棱镜页各有一条，
    棱镜配装该链到棱镜页。同页同名的几条是同一件东西的不同档（神器模组的
    一/二/三级），取第一条即可，链过去落在同一页同一节。

    prefer 也定不下来时看名字末尾的消歧括注：「隐士（冲锋枪）」只取冲锋枪那一条。
    **括注只在整名查不到时才拆**——站内自加的消歧后缀本身就是名字的一部分
    （「故我在（电弧元素）」），见名就拆会把那条正主弄丢。
    """
    if slot not in SLOTS:
        die('槽位「%s」没有登记来源页' % slot)
    tail = ''
    if name not in idx:
        hit = TAIL.search(name)
        if hit:
            tail, name = hit.group(1), name[:hit.start()]
    hits = [h for h in idx.get(name, []) if h['page'] in SLOTS[slot]]
    if kind is not None:
        # 分节标题带括注时按括注前那一截比（神器模组页写「废墟石板 （异端）」），
        # 括注是来源赛季，不是这件神器的名字。
        hits = [h for h in hits if bare_kind(h['kind']) == kind]
    if tail and hits:
        narrowed = [h for h in hits if bare_kind(h['kind']) == tail]
        if not narrowed:
            die('「%s：%s（%s）」的括注对不上任何一条。站内的同名条目是：\n  %s'
                % (slot, name, tail,
                   '\n  '.join('%s · %s' % (h['page'], h['kind']) for h in hits)))
        hits = narrowed
    if not hits:
        where = '、'.join(SLOTS[slot])
        die('「%s：%s」在 %s 里查不到。站内查得到才写得进配装——'
            '确认写法与资料页一致，或先把它补进对应的资料页。' % (slot, name, where))
    if prefer:
        same = [h for h in hits if h['page'] == prefer]
        if same:
            hits = same
    if len({h['page'] for h in hits}) > 1:
        die('「%s：%s」在站内有多条同名条目，分不出该链哪一条：\n  %s\n'
            '在名字后面写分节挑一条，如「%s：%s（%s）」'
            % (slot, name, '\n  '.join('%s · %s' % (h['page'], h['kind']) for h in hits),
               slot, name, bare_kind(hits[0]['kind'])))
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
    for page in sources():
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
    for page in sources():
        print('%-26s %4d' % (page, per.get(page, 0)))
    print('合计 %d 条，%d 个名字，%d 个名字撞车' % (total, len(idx), len(dup)))
    print('落地检查：%d 条带过滤词，全部滤得出条目；'
          '无搜索框的页面 %s 只滚到分节'
          % (check_landing(idx),
             '、'.join(p for p in sources() if not searchable(p)) or '无'))
    for k, v in sorted(dup.items())[:15]:
        print('  %s ← %s' % (k, '、'.join(h['page'] for h in v)))


if __name__ == '__main__':
    main()
