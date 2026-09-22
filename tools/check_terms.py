#!/usr/bin/env python3
"""术语与着色的一致性闸门。

站内做过两次人工术语统一，两次都被后来新增的页面冲掉：`fb739f1` 把「装填」全站
改成「填装」，六天后新增的武器框架页又带回 17 处。人工扫一遍管不住下一页，
所以把结论落成闸门。

五条检查，前四条以 items.py 的 TERMS 那一张表为准：

  G1 中文正名   源稿里不许出现禁用写法。
  G2 token 唯一 同一个术语只能落到同一个着色 token 上。渲染色相同的两个 token
                （--el-solar 与 --deb-solar 同值）用眼睛看不出来，只有这里管得住。
  G3 token 有定义 源稿里每个 {token|文字} 都要在 site.css 或该页样式表里有类；
                反过来，site.css 的着色类一次都没被用到即死配置，当场报出。
  G4 更新时间一致 资料页页脚的「更新 YYYY.M.D」与首页卡片上那个必须相等。
  G5 更新日志的类型 只有新增、改动、订正三种，且同一天里每种只能连成一段——
                标签只在段首显形，交错着写会渲出一串空标签。
  G7 色板齐全   配色总览页列的渲染色与着色类，必须与 site.css 现有的逐条相等——
                两个方向都管：改了 :root 的色号忘了改源稿、加了新 token 忘了上页。
                认哪些类算着色类见 tint_classes()：源稿里写得出 {name|…} 的才算，
                外壳与组件的类照样引强调色，但它们写不进源稿，不进色板页。
  G6 该着色的都着了 tools/items.json 里的词、items.py 的 MECH（元素机制名），以及
                items.py 的 TERMS 里定了 token 的术语，正文里出现就得着色；已着色的那些
                token 还必须与库里的归属一致。「骨灰余烬」属烈日、「连锁闪电」属电弧
                是 Bungie 的 manifest 定的，不由人记；着成隔壁元素只差一点色相，
                眼睛查不出来。G2 只管「着错了色」，没着色时它一句话也不说——
                「勇士」「守护者」「能量球」这类档位与拾取物不在 manifest 里，
                曾因此全站漏了八百多处。漏着色跑 python3 tools/items.py --apply 补上。

用法：python3 tools/check_terms.py    改源稿或改术语表之后跑一次。
"""

import glob
import importlib.util
import os
import re
import sys

import items
import markup
import shell

DOC_DIR = 'references/docs'
KEY_DIR = 'references/keys'

def read(path):
    # 配装源稿是结构化记录，就按它本身检——**不渲染回 markdown 再用正则扫**，
    # 那等于拿一份派生文本当源稿。着色标记写在记录的字符串值里，正则照样找得到，
    # 报错行号指的也是源稿自己那一行。
    with open(os.path.join(shell.ROOT, path), encoding='utf-8') as f:
        return f.read()


def read_site(path):
    with open(os.path.join(shell.SITE, path), encoding='utf-8') as f:
        return f.read()


def classes_in(css):
    """样式表里真正下了规则的 class。**先剥注释**：注释里提到的类名不是定义，
    带着它比对会让「{token|…} 有没有对应的类」这条闸门放行没有规则的标记——
    site.css 有一段注释拿 .amp 举例，武器框架页的 {amp|∞} 就是这么漏过去的。"""
    return set(re.findall(r'\.([a-zA-Z][\w-]*)', re.sub(r'/\*.*?\*/', '', css, flags=re.S)))


def tint_classes(css):
    """单类规则里设了 color: var(…) 的那些 → (它引的 token, 规则体是否只有这一条)。
    判据只此一处，G3 与 G7 共用，两条各取所需的那一半。

    **「规则体只有 color」不等于「是着色类」，两件事都要。**只负责染色、别的什么
    都不做的规则一定是个 token（G3 据此认出没人用的死配置）；但真 token 也可以
    多写一行版式——.note 带 font-weight、.unsure 带虚下划线——所以 G7 不能只认
    这一种，它另按「源稿里被写成过 {name|…}」来认。反过来，外壳与组件的类照样
    引强调色（首屏那枚发电能量核 .pledge 静置就是 var(--accent)），它们写不进
    源稿，因此不进色板页。

    选择器之间只认逗号，不认空格——.site-nav .sep 那种后代选择器不是着色类。
    **先剥注释**，注释里的示例规则不是定义。"""
    out = {}
    plain = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for m in re.finditer(r'(?:^|\n)((?:\.[\w-]+,\s*)*\.[\w-]+)\s*\{([^}]*)\}', plain):
        hit = re.search(r'color:\s*var\(--([\w-]+)\)', m.group(2))
        if not hit:
            continue
        sole = not re.sub(r'color:\s*var\(--[\w-]+\);?', '', m.group(2)).strip()
        for cls in re.findall(r'\.([\w-]+)', m.group(1)):
            out[cls] = (hit.group(1), sole)
    return out


def sources():
    """[(源稿相对路径, 该页能用的 class 集合)]。"""
    site = read_site('assets/site.css')
    base = classes_in(site)
    out = []
    for slug, path in shell.sources():
        rel = os.path.relpath(path, shell.ROOT)
        md = read(rel)
        where = re.search(r'^路径：(.*)$', md, re.M)
        where = where.group(1).strip() if where else slug
        ok = set(base)
        parts = where.split('/')
        for i in range(len(parts)):
            sheet = os.path.join(*parts[:i + 1], 'style.css')
            if os.path.exists(os.path.join(shell.SITE, sheet)):
                ok |= classes_in(read_site(sheet))
        out.append((rel, ok))
    # 配装源稿：注解那一段是散文，中文正名与着色 token 照样要守。**不进 G6 正查**
    # ——配装正文几乎全是物品名（「碎片：保护琢面、黎明琢面」），正查会要求给每一个
    # 都套 {token|}，而它们本该由查表变成带图标的链接，源稿不写颜色。
    build_ok = base | classes_in(read_site('builds/style.css'))
    for season in sorted(os.listdir(shell.BUILD_DIR)):
        d = os.path.join(shell.BUILD_DIR, season)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith('.json'):
                out.append(('references/builds/%s/%s' % (season, name), build_ok))
    return out



def at_line(text, at):
    return text.count('\n', 0, at) + 1


def check_terms(files, bad):
    terms, _ = items.load()
    items.check_token_targets(terms)
    for rel in files:
        md = read(rel)
        for at, wrong, right in items.misspelled(md):
            bad.append('G1 %s:%d 用了「%s」，正名是「%s」'
                       % (rel, at_line(md, at), wrong, right))
        # 括号索引一份源稿建一次，92 条术语共用。**逐次现查是文档长度的平方**，
        # 见 markup.Markers 的说明。
        marks = markup.Markers(md)
        for word, token, _ in items.TERMS:
            if not token:
                continue
            for m in re.finditer(re.escape(word), md):
                hit = marks.at(m.start())
                # 只管「整个标记就是这个词」的那种。词嵌在更长的短语里时，
                # 着色属于短语（{el-arc|电弧元素能量球}、{health|治疗能量球}），
                # 按词强判会把整句的颜色拆碎。
                want = items.expected_token(hit[0], word, terms) if hit and hit[1] == word else None
                if hit and want:
                    bad.append('G2 %s:%d 「%s」着色成 {%s|…}，应是 {%s|…}'
                               % (rel, at_line(md, m.start()), word, hit[0], want))


def armor_sets_tokens(bad, site):
    """护甲套装页用到的 token。它走词表着色，源稿里没有 {token|…} 可扫，
    token 全在生成器里：词表那一份由 merge() 并出来，另有三个写在 inline() 的
    分支表上。从生成器现取，不在这里另存一份名单——从前这里用正则捞元组，
    只捞得到 PAGE_TERMS 那 7 个，merge() 来的几十个与那三个分支一个都不算数。

    在函数里 import：convert-armor-sets 自己 import check_terms，模块级会转圈。
    """
    gen = os.path.join(shell.ROOT, 'tools', 'convert-armor-sets.py')
    if not os.path.exists(gen):
        return set()          # 这棵树里没有那个生成器，也就没有那一页
    spec = importlib.util.spec_from_file_location('convert_armor_sets', gen)
    if spec is None or spec.loader is None:
        markup.die('读不出 %s' % gen)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    used = {t for _, t in mod.GLOSSARY} | mod.INLINE_TOKENS
    sheet = os.path.join(shell.SITE, 'armor-sets', 'style.css')
    if os.path.exists(sheet):
        ok = classes_in(site) | classes_in(read_site('armor-sets/style.css'))
        for t in sorted(used - ok):
            bad.append('G3 tools/convert-armor-sets.py 会发 {%s|…}，样式表里没有这个类' % t)
    return used


def check_tokens(pairs, site, bad):
    used = set()
    for rel, ok in pairs:
        md = read(rel)
        for m in markup.OPEN.finditer(md):
            used.add(m.group(1))
            if m.group(1) not in ok:
                bad.append('G3 %s:%d 用了 {%s|…}，样式表里没有这个类'
                           % (rel, at_line(md, m.start()), m.group(1)))
    used |= armor_sets_tokens(bad, site)
    # 只负责染色、别的什么都不做的单类规则一定是个 token；没人用就是死配置。
    for cls, (_, sole) in tint_classes(site).items():
        if sole and cls not in used:
            bad.append('G3 assets/site.css 的 .%s 一次都没被用到，删掉或改写' % cls)
    return used


def check_stamps(bad):
    home = read_site('index.html')
    for m in re.finditer(r'<a class="entry" href="([^"]+)".*?entry-stamp">更新 ([\d.]+)<', home, re.S):
        page, want = m.group(1), m.group(2)
        got = re.search(r'<span class="stamp">更新 ([\d.]+)</span>', read_site(page))
        if not got:
            bad.append('G4 %s 页脚没有更新时间' % page)
        elif got.group(1) != want:
            bad.append('G4 %s 页脚写 %s，首页卡片写 %s' % (page, got.group(1), want))


def check_build_count(bad):
    """首页那两张配装卡上的数每收一套就变一次，是首页仅有的会随投稿漂的手写数字。
    别的卡片写的是页面结构（PERK 406、模组 128），由各自生成器的 N_* 钉着。

    单套与合集出在同一个目录下（builds/<赛季>/<slug>/），分不分得开只看产出：
    合集那一份的 <main> 上多一个 set 类。
    """
    n = {'builds/index.html': 0, 'builds/sets/index.html': 0}
    for path in sorted(glob.glob(os.path.join(shell.SITE, 'builds', shell.SEASON,
                                              '*', 'index.html'))):
        with open(path, encoding='utf-8') as f:
            n['builds/sets/index.html' if '<main class="set ' in f.read()
              else 'builds/index.html'] += 1
    home = read_site('index.html')
    for href, want in n.items():
        card = re.search(r'<a class="entry" href="%s".*?</a>' % re.escape(href),
                         home, re.S)
        # 一个合集都没有时那一页不出，首页那张卡也撤掉了——两样都没有是一致的。
        if not card:
            if want == 0:
                continue
            bad.append('G4 首页找不到 %s 那张卡' % href)
            continue
        m = re.search(r'<dd>(\d+)</dd>', card.group(0))
        if not m:
            bad.append('G4 首页 %s 那张卡没写数' % href)
        elif int(m.group(1)) != want:
            bad.append('G4 首页 %s 那张卡写 %s，站上是 %d'
                       % (href, m.group(1), want))


def check_items(files, bad):
    # 反查：已着色的对不对
    terms, _ = items.load()
    items.check_token_targets(terms)
    for rel in files:
        md = read(rel)
        # 只认「整个标记就是这个词」的那种，与 G2 同一条道理：词嵌在更长的短语里
        # 时着色属于短语，按词强判会把整句的颜色拆碎。
        for m in markup.LEAF.finditer(md):
            token, text = m.group(1), m.group(2)
            if token not in items.MANAGED:
                continue
            want = terms.get(items.norm(text))
            target = items.expected_token(token, text, terms)
            if want and want[0] in items.MANAGED and target:
                bad.append('G6 %s:%d 「%s」着色成 {%s|…}，官方物品表说它是%s，应是 {%s|…}'
                           % (rel, at_line(md, m.start()), text, token, want[1], target))

    # 正查：表里的词出现了就得着色。新写的一页里提到「骨灰余烬」却留着素色，
    # 这一条当场报出——不必记得回去跑一趟 --suggest。
    for rel, line, _, _, word in items.scan():
        bad.append('G6 %s:%d 「%s」没着色，应是 {%s|%s}；跑 '
                   'python3 tools/items.py --apply 落进去'
                   % (rel, line, word, terms[word][0], word))


ACTS = ('新增', '改动', '订正')       # 顺序即同一天之内的排法


def check_acts(bad):
    """更新日志：改动类型只有三种，且同一天里每种连成一段。

    段首之外的标签由 convert-doc.py 打上 is-same、样式表收掉，靠的就是「同类型相邻」
    这一条。交错着写会在中间渲出空标签，页面上是一行没有类型的改动——眼睛查不出来。
    """
    path = os.path.join(DOC_DIR, 'changelog.md')
    seen, prev = set(), None
    for n, line in enumerate(read(path).split('\n'), start=1):
        if line.startswith('## '):          # 换一天，重新开始数
            seen, prev = set(), None
            continue
        hit = re.match(r'- \{act\|([^}]*)\}', line)
        if not line.startswith('- ') or not hit:
            if line.startswith('- '):
                bad.append('G5 %s:%d 这一条没以 {act|类型} 开头' % (path, n))
            continue
        act = hit.group(1)
        if act not in ACTS:
            bad.append('G5 %s:%d 写了「%s」，类型只有%s'
                       % (path, n, act, '、'.join(ACTS)))
        elif act != prev and act in seen:
            bad.append('G5 %s:%d 「%s」在这一天里断开了，同类型的几条要连成一段'
                       % (path, n, act))
        seen.add(act)
        prev = act


PALETTE = os.path.join(DOC_DIR, 'palette.md')


def palette_of(site, used):
    """site.css 现有的 (渲染色 → 色号, 着色类 → 渲染色)。判据现取，不硬编码名单：
    着色类由 tint_classes() 认，再按 used 收一道——源稿里写得出 {name|…} 的才算，
    外壳与组件的类因此落在外面。语义 token 在这里顺着 :root 的 var 链解到渲染色，
    解不到 --c-* 的（外壳那些骨白灰阶）同样落在外面。"""
    root = site.split(':root {', 1)[1].split('\n}', 1)[0]
    hexes = dict(re.findall(r'--(c-[\w-]+):\s*(#[0-9a-f]{3,8})\s*;', root))
    links = dict(re.findall(r'--([\w-]+):\s*var\(--([\w-]+)\)\s*;', root))
    classes = {}
    for cls, (token, _) in tint_classes(site).items():
        base = links.get(token, token)
        if cls in used and base in hexes:
            classes[cls] = base
    return hexes, classes


def check_palette(site, used, bad):
    # 页面专属那一节的类定义在各页样式表里，不归 site.css 管，比对到那里为止。
    md = read(PALETTE).split('## 页面专属')[0]
    want_hex, want_cls = palette_of(site, used)
    got_hex = dict(re.findall(r'^\| --(c-[\w-]+) \| (#[0-9a-f]{3,8}) \|', md, re.M))
    got_cls = dict(re.findall(r'^\| \{([\w-]+)\|[^}]*\} \| --(c-[\w-]+) \|', md, re.M))
    for name, want, got in (('渲染色', want_hex, got_hex), ('着色类', want_cls, got_cls)):
        for key in sorted(set(want) | set(got)):
            if key not in got:
                bad.append('G7 %s 少了%s %s（site.css 里是 %s）' % (PALETTE, name, key, want[key]))
            elif key not in want:
                bad.append('G7 %s 多出%s %s，site.css 里没有' % (PALETTE, name, key))
            elif want[key] != got[key]:
                bad.append('G7 %s %s %s 写的是 %s，site.css 里是 %s'
                           % (PALETTE, name, key, got[key], want[key]))


def main() -> int:
    site = read_site('assets/site.css')
    pairs = sources()
    bad: list[str] = []

    # G1／G2 管两处：资料页的源稿（散文与主键骨架各一处），以及配装的结构化记录。
    check_terms([rel for rel, _ in pairs
                 if rel.startswith((DOC_DIR, KEY_DIR, 'references/builds/'))], bad)
    used = check_tokens(pairs, site, bad)
    check_stamps(bad)
    check_build_count(bad)
    check_acts(bad)
    check_palette(site, used, bad)
    # G6 的反查（已着色的对不对）是纯正则；正查那一半走 items.scan()，范围由
    # items.pages() 定。
    check_items([rel for rel, _ in pairs
                 if rel.startswith((DOC_DIR, KEY_DIR))], bad)

    if bad:
        print('术语与着色不一致：', file=sys.stderr)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        return 1
    print('术语一致：%d 条规则，%d 篇源稿' % (len(items.TERMS), len(pairs)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
