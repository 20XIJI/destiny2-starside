#!/usr/bin/env python3
"""术语与着色的一致性闸门。

站内做过两次人工术语统一，两次都被后来新增的页面冲掉：`fb739f1` 把「装填」全站
改成「填装」，六天后新增的武器框架页又带回 17 处。人工扫一遍管不住下一页，
所以把结论落成闸门。

四条检查，全部以 TERMS 那一张表为准：

  G1 中文正名   源稿里不许出现禁用写法。
  G2 token 唯一 同一个术语只能落到同一个着色 token 上。渲染色相同的两个 token
                （--el-solar 与 --deb-solar 同值）用眼睛看不出来，只有这里管得住。
  G3 token 有定义 源稿里每个 {token|文字} 都要在 site.css 或该页样式表里有类；
                反过来，site.css 的着色类一次都没被用到即死配置，当场报出。
  G4 更新时间一致 资料页页脚的「更新 YYYY.M.D」与首页卡片上那个必须相等。

用法：python3 tools/check_terms.py    改源稿或改术语表之后跑一次。
"""

import os
import re
import sys

import shell

SRC_FILES = ['references/artifact-mods.md', 'references/armor-sets.md']
DOC_DIR = 'references/docs'

# 一行钉两件事：中文怎么写，以及着色落到哪个 token 上。
#   (正名, 唯一 token 或 None, [禁用写法])
# token 写 None 表示这个词不强制着色，只管中文写法。
TERMS = [
    # ── 中文正名 ──
    ('填装', None, ['装填']),
    # 装备稀有度：紫装在游戏内叫「传说」，与「传说战役」是同一个词
    ('传说', None, ['传奇']),
    ('回复倍率', None, ['技能块']),
    ('起源特性', None, ['源头特性']),
    # 「处决」不进禁用表：「优雅处决」是星相里的机制名，与终结技不是一回事
    ('终结技', 'enemy', []),
    ('冰霜护甲', 'el-stasis', ['冰霜铠甲']),
    # 红血是敌人档位的最低一档，照血条颜色叫。「普通战斗人员」在正名之后与它同义
    ('红血', 'bar-red', ['杂兵', '普通士兵', '普通敌人', '普通战斗人员']),
    ('橙血', 'bar-orange', ['精英']),
    # 四档敌人：红血、橙血、初级首领、首领。「黄血」「小头目」是同一档的旧写法
    ('初级首领', 'bar-yellow', ['黄血', '小头目']),
    # 敌人统称用游戏内的官方译名。放在「红血」之后：先认掉「普通敌人」那一组
    # 「敌方」不进禁用表：那是形容词（敌方守护者），不是战斗人员的同义词
    ('战斗人员', 'enemy', ['敌人']),
    # 威能弹药：站内 token 就叫 --ammo-heavy，注释与 design.md 都写「威能弹药」
    ('威能弹药', 'ammo-heavy', ['重型弹药']),
    ('虚弱', 'deb-void', ['削弱']),
    # 打中弱点叫「精准」。「精密」留给武器框架名（精密框架、精密自动步枪），两者同源
    # 于 Precision，混用会让读者以为框架名与命中判定是一回事
    ('精准命中', 'stack', ['精密命中']),
    ('精准击杀', None, ['精密击杀']),
    # 打在目标本体上的那一份叫「直击」，与溅射／径向相对；「接触」在正文里
    # 还当动词用（接触时引爆、接触点），只有当伤害名讲时才是这一条
    ('直击伤害', None, ['接触伤害']),
    # 三种勇士各自一行：中文早就统一了，钉在这里是为了 token。三个名字同属
    # 战斗人员，着色必须都落到 enemy 上——只钉一个，另两个会在新页面上分叉，
    # 而 --enemy 与相近的几个 token 渲染色接近，眼睛查不出来。
    ('势不可挡勇士', 'enemy', ['不屈勇士']),
    ('过载勇士', 'enemy', ['超载勇士']),
    ('屏障勇士', 'enemy', ['壁垒勇士']),

    # ── 只管 token，不改中文 ──
    # 下面这些词的着色曾经分叉，两个 token 渲染色又相同或相近，肉眼查不出来
    ('护甲充能', 'armor-charge', []),
    ('焕光', 'el-solar', []),
    ('恢复', 'el-solar', []),
    # 覆盖护盾分两个词：虚空分支的那层是虚空增益，其余来源（职业属性、还治彼身、
    # 无畏护甲）不属于任何元素。两者同色时读者会把无畏护甲当成虚空技能
    ('虚空覆盖护盾', 'el-void', []),
    ('覆盖护盾', 'pickup', []),
    ('不稳定', 'deb-void', []),
    ('压制', 'deb-void', []),
    ('减速', 'deb-stasis', []),
    ('灼烧', 'deb-solar', []),
    ('点燃', 'deb-solar', []),
    ('能量球', 'orb', []),
    ('特殊弹药', 'el-strand', []),
    ('生命值', 'health', []),
    ('首领', 'bar-yellow', ['头目', 'Boss', 'boss']),
    # 守护者按战斗力对齐橙血那一档；「自己」是玩家一侧的表述层，留在 enemy 色
    ('守护者', 'bar-orange', []),
    ('自己', 'enemy', []),
    ('异域', 'exotic', []),
    ('增益', 'buff', []),
    ('减益', 'debuff', []),
]

# 游戏内的专有名词，字面撞上禁用写法时按原名放行。整条短语落在里面才算数，
# 「削弱」单用照旧报错。
KEEP = ['削弱清敌', 'Destiny 2: Boss Damage']


def read(path):
    with open(os.path.join(shell.ROOT, path), encoding='utf-8') as f:
        return f.read()


def classes_in(css):
    """样式表里真正下了规则的 class。**先剥注释**：注释里提到的类名不是定义，
    带着它比对会让「{token|…} 有没有对应的类」这条闸门放行没有规则的标记——
    site.css 有一段注释拿 .amp 举例，武器框架页的 {amp|∞} 就是这么漏过去的。"""
    return set(re.findall(r'\.([a-zA-Z][\w-]*)', re.sub(r'/\*.*?\*/', '', css, flags=re.S)))


def sources():
    """[(源稿相对路径, 该页能用的 class 集合)]。"""
    site = read('assets/site.css')
    base = classes_in(site)
    out = [('references/artifact-mods.md', base | classes_in(read('artifact-mods/style.css')))]
    for name in sorted(os.listdir(os.path.join(shell.ROOT, DOC_DIR))):
        if not name.endswith('.md'):
            continue
        rel = '%s/%s' % (DOC_DIR, name)
        md = read(rel)
        where = re.search(r'^路径：(.*)$', md, re.M)
        where = where.group(1).strip() if where else name[:-3]
        ok = set(base)
        parts = where.split('/')
        for i in range(len(parts)):
            sheet = os.path.join(*parts[:i + 1], 'style.css')
            if os.path.exists(os.path.join(shell.ROOT, sheet)):
                ok |= classes_in(read(sheet))
        out.append((rel, ok))
    return out


def inner_marker(text, at):
    """text[at] 落在哪个 {token|内容} 里，返回 (token, 内容)；不在标记里就是 None。"""
    depth, i = 0, at - 1
    while i >= 0:
        if text[i] == '}':
            depth += 1
        elif text[i] == '{':
            if depth == 0:
                m = re.match(r'\{([\w-]+)\|', text[i:])
                if not m:
                    return None
                start = i + m.end()          # m 是对 text[i:] 匹配的，偏移要加回 i
                j, d = start, 1
                while j < len(text) and d:
                    d += text[j] == '{'
                    d -= text[j] == '}'
                    j += 1
                return m.group(1), text[start:j - 1]
            depth -= 1
        i -= 1
    return None


def at_line(text, at):
    return text.count('\n', 0, at) + 1


def check_terms(files, bad):
    banned = [(w, t[0]) for t in TERMS for w in t[2]]
    for rel in files:
        md = read(rel)
        keep = [(m.start(), m.end()) for k in KEEP for m in re.finditer(re.escape(k), md)]
        # 链接目标不是正文，站内路径用的是 ASCII slug（../boss-hp/index.html），
        # 字面撞上禁用写法与译名无关。只放行括号里那一段，链接文字照常受检。
        keep += [(m.start(1), m.end(1)) for m in re.finditer(r'\]\(([^)]*)\)', md)]
        for wrong, right in banned:
            for m in re.finditer(re.escape(wrong), md):
                if any(a <= m.start() and m.end() <= b for a, b in keep):
                    continue
                bad.append('G1 %s:%d 用了「%s」，正名是「%s」'
                           % (rel, at_line(md, m.start()), wrong, right))
        for word, token, _ in TERMS:
            if not token:
                continue
            for m in re.finditer(re.escape(word), md):
                hit = inner_marker(md, m.start())
                # 只管「整个标记就是这个词」的那种。词嵌在更长的短语里时，
                # 着色属于短语（{el-arc|电弧元素能量球}、{health|治疗能量球}），
                # 按词强判会把整句的颜色拆碎。
                if hit and hit[1] == word and hit[0] != token:
                    bad.append('G2 %s:%d 「%s」着色成 {%s|…}，应是 {%s|…}'
                               % (rel, at_line(md, m.start()), word, hit[0], token))


def check_tokens(pairs, site, bad):
    used = set()
    for rel, ok in pairs:
        md = read(rel)
        for m in re.finditer(r'\{([\w-]+)\|', md):
            used.add(m.group(1))
            if m.group(1) not in ok:
                bad.append('G3 %s:%d 用了 {%s|…}，样式表里没有这个类'
                           % (rel, at_line(md, m.start()), m.group(1)))
    # 护甲套装页走词表，token 写在生成器里
    used |= set(re.findall(r"\('[^']+', '([\w-]+)'\)", read('tools/convert-armor-sets.py')))
    # site.css 里只设 color 的单类即着色类；一次都没被用到就是死配置。
    # 选择器之间只认逗号，不认空格——.site-nav .sep 那种后代选择器不是着色类。
    for m in re.finditer(r'(?:^|\n)((?:\.[\w-]+,\s*)*\.[\w-]+)\s*\{\s*color: var\(--[\w-]+\);?\s*\}', site):
        for cls in re.findall(r'\.([\w-]+)', m.group(1)):
            if cls not in used:
                bad.append('G3 assets/site.css 的 .%s 一次都没被用到，删掉或改写' % cls)


def check_stamps(bad):
    home = read('index.html')
    for m in re.finditer(r'<a class="entry" href="([^"]+)".*?entry-stamp">更新 ([\d.]+)<', home, re.S):
        page, want = m.group(1), m.group(2)
        got = re.search(r'<span class="stamp">更新 ([\d.]+)</span>', read(page))
        if not got:
            bad.append('G4 %s 页脚没有更新时间' % page)
        elif got.group(1) != want:
            bad.append('G4 %s 页脚写 %s，首页卡片写 %s' % (page, got.group(1), want))


def main() -> int:
    site = read('assets/site.css')
    pairs = sources()
    bad: list[str] = []

    check_terms(SRC_FILES + [rel for rel, _ in pairs if rel.startswith(DOC_DIR)], bad)
    check_tokens(pairs, site, bad)
    check_stamps(bad)

    if bad:
        print('术语与着色不一致：', file=sys.stderr)
        for line in bad[:60]:
            print('  ' + line, file=sys.stderr)
        if len(bad) > 60:
            print('  …另有 %d 条' % (len(bad) - 60), file=sys.stderr)
        return 1
    print('术语一致：%d 条规则，%d 篇源稿' % (len(TERMS), len(pairs) + 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
