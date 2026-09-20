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
        path = os.path.join(shell.SITE, 'armor-mods', 'icons', meta['icon'])
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
                    # 表是 mods.py 从官方物品表蒸的，那一步没记主键；按名字回实体层
                    # 现查，87 条逐条唯一命中。
                    'keys': [h for h in [variant_key(name)] if h],
                    'token': '', 'sub': meta['row'], 'pos': '', 'desc': '',
                    # 落地过滤用复合行的名字：变体名在那一页一次都不出现，
                    # 拿它去过滤会滤成空页，看着像跳错了。
                    'q': meta['row']})
    return out


_VARIANT_KEYS = None


def variant_key(name):
    """一枚护甲模组变体的主键：按名字在实体层里查，唯一命中才算。

    同名多枚或查不到都回 None——戳主键那一趟会把它当成「条目上没有主键」报出来，
    比在这里猜一枚强。
    """
    global _VARIANT_KEYS
    if _VARIANT_KEYS is None:
        import resolve
        got = {}
        for h, rec in resolve.shared()[0].items.items():
            n = ((rec.get('i18n') or {}).get('zh-CN') or {}).get('name')
            if n:
                got.setdefault(n, []).append(h)
        _VARIANT_KEYS = {n: v[0] for n, v in got.items() if len(v) == 1}
    return _VARIANT_KEYS.get(name)


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

    读 data/index/ 那批索引，不扫产出的 HTML：锚点、分节与说明本来就只有生成器
    自己知道，由它写进索引；回头用正则猜要咬死产出结构（给套装那一格加一个属性
    就让 id="…" 后面不再紧跟 >），还猜不出主键。
    """
    idx = {}
    BY_KEY.clear()
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
            e = dict(row, page=page, token=got['token'])
            idx.setdefault(key_of(row['name']), []).append(e)
            for h in row['keys']:
                BY_KEY.setdefault(str(h), []).append(e)
    for e in variants():
        # 变体在站内没有独立的一行，说明只有复合那一行有（「电弧虹吸」的机制就写
        # 在「虹吸」那一行上）。sub 存的正是那一行的名字，照它借过来。
        e['desc'] = next((r['desc'] for r in idx.get(key_of(e['sub']), ())
                          if r['page'] == 'armor-mods'), '')
        idx.setdefault(key_of(e['name']), []).append(e)
        for h in e['keys']:
            BY_KEY.setdefault(str(h), []).append(e)
    return idx


# 主键 → 条目。一枚主键可能被几页收（同一把枪在购物清单与刷取清单各有一行），
# 所以存成列表，由槽位限定的来源页挑出那一条。
BY_KEY = {}


def by_key(key, slot):
    """按主键取这一槽位该用的那一条。取不到回 None。"""
    pages = SLOTS.get(slot) or ()
    got = [e for e in BY_KEY.get(str(key), ()) if e['page'] in pages]
    return got[0] if got else None


# 槽位 → 允许的来源页。查表按槽位限定范围，同名撞车因此撞不上：
# 「全知之眼」既是异域护甲又是一把传说狙，源稿写在哪个键上就只查哪几页。
SLOTS = {
    '超能': tuple(ELEM_PAGES), '星相': tuple(ELEM_PAGES), '碎片': tuple(ELEM_PAGES),
    '手雷': tuple(ELEM_PAGES), '近战': tuple(ELEM_PAGES),
    # 职业技能只查这一页：三个职业的全部职业技能都在它上面，而分支页里也各自
    # 列了一遍（凤凰俯冲在烈日页与这一页各有一条），限定到一页即不必猜。
    '职业技能': ('elements/class-abilities',),
    '异域武器': ('exotic-weapon',),
    # 异域自己开得出来的词条（故我在的八条固有、英勇利刃的三枚核心与四枚催化）。
    # 与武器行同页，靠分节分开，见 SLOT_KIND。
    '异域词条': ('exotic-weapon',),
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


# 槽位只认这一种分节。异域那一页上武器行与它的词条同页，页面限定分不开，靠这一位
# 分；反过来，钉了分节的那几种不进别的槽位——「异域武器：光能聚集」因此查不到。
SLOT_KIND = {'异域词条': '异域词条'}


# 分节标题里那个消歧括注的起头。**只有这一处定义**：它随 vocab.js 发到填表页，
# form.js 的 bare() 读的是同一个值，不再各写一份。
KIND_TAIL = ' （'


def bare_kind(kind):
    """分节标题去掉括注：「废墟石板 （异端）」→「废墟石板」。"""
    return kind.split(KIND_TAIL)[0].strip()


# 主键跟在名字后面，用 # 分开（migrate.MARK 同一个字符）。**主键是唯一真相**：
# 查表只按它，名字留作显示与人读 diff。名字里不出现 #。
MARK = '#'


def cut(value):
    """`名字#主键` → `(名字, 主键)`。没戳主键的回 `(名字, '')`。"""
    name, sep, key = str(value).partition(MARK)
    return (name.strip(), key.strip()) if sep else (str(value).strip(), '')


def bare(value):
    """源稿里那一段去掉主键，只剩显示用的名字。"""
    return cut(value)[0]


def key_of(name):
    """查表用的键：去掉汉字与拉丁之间那个排版空格。

    配装源稿两种写法都有（「斗牛士 64」「赫沃斯托夫7G-0X」），而记录里一律没有
    这个空格、页面上一律有。两侧都按去空格比，写法差一个空格不再算查不到。
    """
    return name.replace(' ', '').replace('\u00a0', '')


def pick(idx, name, slot, kind=None, prefer=''):
    """按名字取条目。范围由槽位限定，kind 再按分节收一道（部位、件数）。

    prefer 是配装分支所在的元素页：星相「地狱火」在烈日页与棱镜页各有一条，
    棱镜配装该链到棱镜页。同页同名的几条是同一件东西的不同档（神器模组的
    一/二/三级），取第一条即可，链过去落在同一页同一节。

    **按名字查只剩「核心：」一条路**：它是指回本页某一格的引用，不是独立的一件
    东西，所以不戳主键。别的槽位都写着主键，消歧括注那一层因此撤了。
    """
    got, err = find(idx, name, slot, kind=kind, prefer=prefer)
    if got is None:
        die(err or '「%s：%s」查不到' % (slot, name))
    return got


def find(idx, name, slot, kind=None, prefer=''):
    """pick() 的本体，取不到回 `(None, 该报的那句话)`，不中止。

    戳主键那一趟（`migrate.py --stamp`）要一次看全查不到的有哪些，一条一中止
    得跑上百遍才看得到全貌；渲染那一条照旧由 pick() 当场中止。

    **源稿写了主键就只按主键查**：站内改名不再牵动源稿，同名不同物也不必靠消歧
    括注那一层人写的判断。名字对不上时按主键那一条渲染，并报一行——那是站内改了
    名字，源稿跟着改一次即可，不该中止整次构建。
    """
    if slot not in SLOTS:
        return None, '槽位「%s」没有登记来源页' % slot
    name, key = cut(name)
    if key:
        got = by_key(key, slot)
        if got is None:
            return None, ('「%s：%s#%s」的主键在 %s 里查不到。那一页删了这一行，'
                          '或者主键抄错了。' % (slot, name, key, '、'.join(SLOTS[slot])))
        if key_of(got['name']) != key_of(name):
            NAME_DRIFT.append((slot, name, got['name'], key))
        return got, None
    want = SLOT_KIND.get(slot)
    hits = [h for h in idx.get(key_of(name), [])
            if h['page'] in SLOTS[slot]
            and (bare_kind(h['kind']) == want if want
                 else bare_kind(h['kind']) not in set(SLOT_KIND.values()))]
    if kind is not None:
        # 分节标题带括注时按括注前那一截比（神器模组页写「废墟石板 （异端）」），
        # 括注是来源赛季，不是这件神器的名字。
        hits = [h for h in hits if bare_kind(h['kind']) == kind]
    if not hits:
        where = '、'.join(SLOTS[slot])
        return None, ('「%s：%s」在 %s 里查不到。站内查得到才写得进配装——'
                      '确认写法与资料页一致，或先把它补进对应的资料页。'
                      % (slot, name, where))
    if prefer:
        same = [h for h in hits if h['page'] == prefer]
        if same:
            hits = same
    if len({h['page'] for h in hits}) > 1:
        return None, ('「%s：%s」在站内有多条同名条目，分不出该链哪一条：\n  %s\n'
                      '在名字后面写分节挑一条，如「%s：%s（%s）」'
                      % (slot, name,
                         '\n  '.join('%s · %s' % (h['page'], h['kind']) for h in hits),
                         slot, name, bare_kind(hits[0]['kind'])))
    return hits[0], None


# 源稿写的名字与库里的对不上：站内改了名字，源稿跟着改一次即可。攒着一次报完，
# 不中止——主键那一位已经把它落到了正确的一条上。
NAME_DRIFT = []


ITEM = (re.compile(r'<tr(?![^>]*class="lane")[^>]*>(.*?)</tr>', re.S),
        re.compile(r'<article class="mod"[^>]*>(.*?)</article>', re.S),
        re.compile(r'<article class="set"[^>]*>(.*?)</article>', re.S),
        # 按记录排版的那几页：一条记录一个 article.rec（tools/render.py），
        # 职业物品的之灵行同样是 article.sp-row.rec。
        re.compile(r'<article class="[^"]*\brec\b[^"]*"[^>]*>(.*?)</article>', re.S))


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
        with open(os.path.join(shell.SITE, *page.split('/'), 'index.html'),
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
