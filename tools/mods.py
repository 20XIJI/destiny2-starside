#!/usr/bin/env python3
"""从官方物品表蒸馏两张配装页要用的表，并取回它们的图标。

用法：
    python3 tools/mods.py --distill <items-full.json>   # 护甲模组变体，顺带报缺口
    python3 tools/mods.py --moves   <items-full.json>   # 位移技能
    python3 tools/mods.py --arts    <items-full.json>   # 七件赛季神器
    python3 tools/mods.py --icons                       # 按两张表下载图标并转 WebP

**位移技能与神器本体站内都没有图**：位移技能（跳跃、滑翔、瞬移）连资料页都没有；
神器在站内只是神器模组页的分节标题，一行文字。两者的名字与图标都只能从官方物品表来，
按 `typeName_zh` 认（「位移技能」十条、「传说 神器」七件），去重后各写一张表。

站内的护甲模组页把一个族收成一行（「虹吸」一行盖住 16 枚元素虹吸），行上写的是
族的机制与三档数值。配装要指到具体那一枚（电弧虹吸而不是虹吸），所以这里从官方
物品表把变体名蒸馏出来，**每个变体指回它所属的那一行**：跳转仍然落在复合行上，
那里才有说明。

归族靠名字，不靠人记：多数变体的名字里整段包含行名（电弧虹吸 ⊃ 虹吸），包含不到
的两族写在 PATTERN 里，各带一行判定依据。都归不进去的当场列出来——那是站内缺的
条目，补不补由人定，脚本不猜。
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request

import shell
import vocab
from markup import die, img_size

OUT = os.path.join(shell.ROOT, 'tools', 'mod-variants.json')
MOVES = os.path.join(shell.ROOT, 'tools', 'moves.json')
ARTS = os.path.join(shell.ROOT, 'tools', 'artifacts.json')
# 位移技能与神器的图标：站内没有哪一页拥有它们，所以跟头像一样放配装页自己的目录下。
# 文件名即内容 md5，将来别的页面要引同一枚图，复制过去自然是同一个文件。
EXTRA_ICON_DIR = os.path.join(shell.ROOT, 'builds', 'icons')
# 变体图标与站内护甲模组图标同族、同规格（64×64 WebP），所以放同一个目录：
# 文件名即内容 md5，两处引到同一枚图时自动是同一个文件。
ICON_DIR = os.path.join(shell.ROOT, 'armor-mods', 'icons')

# 官方物品表的类型名 → 站内护甲模组页的分节。「一般护甲模组」是属性调整与套装加成，
# 站内没有对应分节，整类不进表。
PART = {'普通 头盔护甲模组': '头盔', '普通 手臂护甲模组': '护臂',
        '普通 胸部护甲模组': '胸甲', '普通 腿部护甲模组': '腿部',
        '普通 职业物品护甲模组': '职业物品',
        # 副本模组同样有复合：站内「光能意志」一行盖住五枚元素版，
        # 「梦魇放逐器」一行盖住强化与超级两档。
        '普通 玻璃拱顶护甲模组': '玻璃拱顶', '玻璃拱顶护甲模组': '玻璃拱顶',
        '普通 深岩墓室突袭模组': '深岩墓室', '普通 门徒誓约突袭模组': '门徒誓约',
        '普通 救赎花园突袭模组': '救赎花园', '普通 最后一愿突袭模组': '最后一愿',
        '国王的陨落模组': '国王的陨落', '克洛塔的末日模组': '克洛塔的末日',
        '梦魇根源护甲模组': '梦魇根源', '救赎的边缘护甲模组': '救赎的边缘',
        '普通 梦魇模组': '梦魇狩猎'}

# 名字里包含不到行名的两族。键是站内行名，值是变体名的形状。
PATTERN = {
    # 站内写「稳定瞄准」，官方把元素插在中间：稳定电弧瞄准、稳定虚空瞄准…
    '稳定瞄准': re.compile(r'^稳定.+瞄准$'),
    # 站内写「回收利用」，官方叫「元素回收器」：电弧回收器、冰影回收器…
    '回收利用': re.compile(r'^.+回收器$'),
}

# 名字里没有行名、也套不上 PATTERN 的，逐条钉在这里，各带一行依据。
ALIAS = {
    # 游戏内同为抗性族、同样三档；站内那一行已经收着狙击伤害抗性与近战伤害抗性。
    '震荡阻尼器': '抗性',
}

SKIP = ('已锁定护甲模组', '空模组插槽', '空调整模组插槽', '追踪模组插槽')

# 官方物品表留着已从游戏里移除的条目（manifest 不删历史），但拿不到的东西列进填表页
# 只会让人选出一份挂不上站的配装。双元素虹吸（电弧/冰影双虹吸、电弧/缚丝虹吸组合…）
# 已被移除；这一族里带斜杠的名字只有它们，判据因此写成「虹吸族且名字里有斜杠」，
# 不另抄一份五条的名单。
GONE_NAMES = (
    # 元素之外的三枚动能虹吸（混乱／电荷／热量）已从游戏移除，「动能虹吸」本身还在。
    '动能混乱虹吸', '动能电荷虹吸', '动能热量虹吸',
)


def gone(row, name):
    # 双元素虹吸（电弧/冰影双虹吸、电弧/缚丝虹吸组合…）也已移除；这一族里带斜杠的
    # 名字只有它们，判据因此写成形状，不另抄一份五条的名单。
    return name in GONE_NAMES or (row == '虹吸' and '/' in name)


def rows_of():
    """站内护甲模组页的行：{部位: {行名: 锚点}}。源稿即清单，不另存一份名单。"""
    out = {}
    for e in vocab.scan_page('armor-mods'):
        out.setdefault(e['kind'], {})[e['name']] = e['anchor']
    return out


def distill(path):
    rows = rows_of()
    # 已经下好的图标沿用：地址没变就没必要重下，也不该换文件名——文件名换一次，
    # 读者的浏览器缓存就白掉一份。
    old = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            old = json.load(f)
    with open(path, encoding='utf-8') as f:
        items = json.load(f)['items']
    table, gaps = {}, {}
    for v in items.values():
        part = PART.get(v.get('typeName_zh') or '')
        name = v.get('name_zh')
        if not part or not name or name in SKIP:
            continue
        base = rows.get(part, {})
        if name in base:
            continue                      # 站内已经单列，不是变体
        hit = [b for b in base if b in name]
        hit += [b for b, pat in PATTERN.items() if b in base and pat.match(name)]
        if name in ALIAS and ALIAS[name] in base:
            hit.append(ALIAS[name])
        if not hit:
            gaps.setdefault(part, set()).add(name)
            continue
        row = max(hit, key=len)           # 最长的那个：特殊弹药斥候归弹药斥候，不归弹药
        if gone(row, name):
            continue
        url = v.get('icon', '')
        was = old.get(name, {})
        table[name] = {'row': row, 'part': part, 'anchor': base[row], 'url': url,
                       'icon': was.get('icon', '') if was.get('url') == url else ''}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=0, sort_keys=True)
    fam = {}
    for meta in table.values():
        fam[meta['row']] = fam.get(meta['row'], 0) + 1
    # 不在这里清孤儿：这个目录同时装着护甲模组页自己在用的 139 枚图，
    # 按本表去清会把它们一并删掉。变体换图留下的旧文件由 git status 看得见。
    print('%s —— %d 个变体，%d 个族' % (os.path.relpath(OUT, shell.ROOT), len(table), len(fam)))
    for row, n in sorted(fam.items(), key=lambda kv: -kv[1]):
        print('  %-10s %2d' % (row, n))
    if gaps:
        print('\n归不进任何一行的（站内没有这一条，补不补由人定）：')
        for part, names in gaps.items():
            print('  %-6s %s' % (part, '、'.join(sorted(names))))


def arts_of():
    """站内神器模组页的七个分节就是七件神器。源稿即清单，不另存一份名单——
    官方物品表里躺着二十件历代神器，按名单硬筛会在换季时悄悄漏掉新的那一件。"""
    return {vocab.bare_kind(e['kind']) for e in vocab.scan_page('artifact-mods')}


def pull(path, type_zh, out_path, want, keep=None):
    """官方物品表里某一类 → {名字: {url, icon}}。位移技能与神器共用这一份。

    表里同名条目有好几份（位移技能每个职业各挂一份，神器有赛季版与常驻版），
    按名字去重取一条即可——图与名字都一样。已下好的图标沿用，地址没变就不重下，
    也不该换文件名：文件名换一次，读者的浏览器缓存就白掉一份。
    """
    old = {}
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as f:
            old = json.load(f)
    with open(path, encoding='utf-8') as f:
        items = json.load(f)['items']
    table = {}
    for v in items.values():
        if v.get('typeName_zh') != type_zh or not v.get('name_zh'):
            continue
        if keep is not None and v['name_zh'] not in keep:
            continue
        name, url = v['name_zh'], v.get('icon', '')
        if not url:
            die('%s 没有图标地址' % name)
        was = old.get(name, {})
        table.setdefault(name, {'url': url,
                                'icon': was.get('icon', '') if was.get('url') == url else ''})
    if len(table) != want:
        missing = sorted(set(keep or ()) - set(table))
        die('「%s」应有 %d 条，实际 %d 条%s'
            % (type_zh, want, len(table),
               '，官方物品表里找不到：' + '、'.join(missing) if missing
               else '：' + '、'.join(sorted(table))))
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=0, sort_keys=True)
    print('%s —— %d 条「%s」：%s'
          % (os.path.relpath(out_path, shell.ROOT), len(table), type_zh,
             '、'.join(sorted(table))))


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'starside-build'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def icons(table_path=None, icon_dir=None):
    """按表下载图标并转 WebP。两张表共用这一份：编码参数、按内容 md5 命名、
    已下好的沿用，三件事只有一处定义。"""
    table_path = table_path or OUT
    icon_dir = icon_dir or ICON_DIR
    if not os.path.exists(table_path):
        die('还没有 %s，先跑一次蒸馏' % os.path.relpath(table_path, shell.ROOT))
    with open(table_path, encoding='utf-8') as f:
        table = json.load(f)
    os.makedirs(icon_dir, exist_ok=True)
    got = 0
    for name, meta in sorted(table.items()):
        if meta.get('icon') and os.path.exists(os.path.join(icon_dir, meta['icon'])):
            continue
        if not meta['url']:
            die('%s 没有图标地址' % name)
        raw = fetch(meta['url'])
        # 编码参数与站内其余图标一致；哈希按编码之后的字节算——先编码再命名，
        # 顺序反了文件名对不上内容。
        src = os.path.join(icon_dir, '_tmp' + os.path.splitext(meta['url'])[1])
        with open(src, 'wb') as f:
            f.write(raw)
        webp = os.path.join(icon_dir, '_tmp.webp')
        subprocess.run(['cwebp', '-quiet', '-q', '82', '-alpha_q', '100',
                        '-resize', '64', '0', src, '-o', webp], check=True)
        with open(webp, 'rb') as f:
            data = f.read()
        final = hashlib.md5(data).hexdigest()[:10] + '.webp'
        os.replace(webp, os.path.join(icon_dir, final))
        os.remove(src)
        meta['icon'] = final
        got += 1
    with open(table_path, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=0, sort_keys=True)
    sizes = {img_size(open(os.path.join(icon_dir, m['icon']), 'rb').read())
             for m in table.values() if m.get('icon')}
    print('%s —— 新取 %d 枚，图标合计 %d 枚，尺寸 %s'
          % (os.path.relpath(icon_dir, shell.ROOT), got,
             len({m['icon'] for m in table.values() if m.get('icon')}),
             '、'.join('%dx%d' % s for s in sorted(sizes))))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--distill':
        distill(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == '--moves':
        pull(sys.argv[2], '位移技能', MOVES, 10)
    elif len(sys.argv) == 3 and sys.argv[1] == '--arts':
        # 官方物品表里躺着二十件历代神器，只取站内那一页有的七件
        keep = arts_of()
        pull(sys.argv[2], '传说 神器', ARTS, len(keep), keep)
    elif len(sys.argv) == 2 and sys.argv[1] == '--icons':
        icons()
        icons(MOVES, EXTRA_ICON_DIR)
        icons(ARTS, EXTRA_ICON_DIR)
    else:
        die(__doc__)


if __name__ == '__main__':
    main()
