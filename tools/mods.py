#!/usr/bin/env python3
"""护甲模组变体：官方物品表 → tools/mod-variants.json，图标 → builds/icons/。

用法：
    python3 tools/mods.py --distill <items-full.json>   # 建表，顺带报缺口
    python3 tools/mods.py --icons                       # 按表下载图标并转 WebP

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


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'starside-build'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def icons():
    with open(OUT, encoding='utf-8') as f:
        table = json.load(f)
    os.makedirs(ICON_DIR, exist_ok=True)
    got = 0
    for name, meta in sorted(table.items()):
        if meta.get('icon') and os.path.exists(os.path.join(ICON_DIR, meta['icon'])):
            continue
        if not meta['url']:
            die('%s 没有图标地址' % name)
        raw = fetch(meta['url'])
        # 编码参数与站内其余图标一致；哈希按编码之后的字节算——先编码再命名，
        # 顺序反了文件名对不上内容。
        src = os.path.join(ICON_DIR, '_tmp' + os.path.splitext(meta['url'])[1])
        with open(src, 'wb') as f:
            f.write(raw)
        webp = os.path.join(ICON_DIR, '_tmp.webp')
        subprocess.run(['cwebp', '-quiet', '-q', '82', '-alpha_q', '100',
                        '-resize', '64', '0', src, '-o', webp], check=True)
        with open(webp, 'rb') as f:
            data = f.read()
        final = hashlib.md5(data).hexdigest()[:10] + '.webp'
        os.replace(webp, os.path.join(ICON_DIR, final))
        os.remove(src)
        meta['icon'] = final
        got += 1
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, indent=0, sort_keys=True)
    sizes = {img_size(open(os.path.join(ICON_DIR, m['icon']), 'rb').read())
             for m in table.values() if m.get('icon')}
    print('%s —— 新取 %d 枚，变体图标合计 %d 枚，尺寸 %s'
          % (os.path.relpath(ICON_DIR, shell.ROOT), got,
             len({m['icon'] for m in table.values() if m.get('icon')}),
             '、'.join('%dx%d' % s for s in sorted(sizes))))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--distill':
        distill(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == '--icons':
        icons()
    else:
        die(__doc__)


if __name__ == '__main__':
    main()
