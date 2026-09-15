#!/usr/bin/env python3
"""图标按主键取官方图：一件东西一张图，落 assets/icons/，由 data/icons.json 索引。

从前每一页自己存一份图标，源稿里写死文件名（`![](icons/5f164b2bda.webp)`）。
两处坏处：**同一件东西的图在页与页之间各存一份、还各是一个像素尺寸**（站内量到
8 种，47/59/69/70 那几档是从 Google 表格里抠出来的图，不是官方原图）；以及**图标
与它画的那件东西之间没有联系**，换图要人去每一页的源稿里找。

这里把两件事都交给主键：图由 data/manifest/ 里那件东西的 icon 字段定，官方原图
96×96 拉回来按版式转一档，文件名仍是内容的 md5 前 10 位（图标目录一年的浏览器
缓存就建立在「改内容必然换名」上，见 README「换图」）。

用法：
    python3 tools/icons.py            # 只报要拉多少、缺什么，不下载
    python3 tools/icons.py --pull     # 拉取并转换，已在盘上的沿用
"""

import argparse
import collections
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

import pagedex
import resolve
import shell
from markup import die

HOST = 'https://www.bungie.net'
BASE = HOST + '/common/destiny2_content/icons/'

# 叠在武器图标上的那几张，路径写在 DestinyInventoryItemConstantsDefinition 里。
# 它们不按主键取——是一套固定的装饰层，每张都是整幅、把图案画在自己那一侧的
# 透明区上，所以摆位不用这边定，原样叠满即可。
#
# 阶级那五张按档位递增（2 阶两颗菱形……5 阶五颗金菱形，1 阶是空图）。定义表里
# 查不到某一把现在是几阶——那是掉落实例上的 DestinyItemInstanceComponent.gearTier。
# 这里取第五张：吃阶级的枪，它的升级插槽里恒是「2 阶到 5 阶」五条，所以「最高
# 可升到 5 阶」是定义层面的事实，角标画的就是这一件事。
# 锻造那两层整体镜像到右侧（红条到右缘、四点到右下角），与阶级角标分居两边。
#
# 强化 Perk 不在这里：那是画在 48px 圆图标上的，官方那张 enhanced-item-overlay
# 是给方形物品图准备的，圆图标上用 CSS 画一道内环加一枚箭头更锐利，也少一次请求。
# 三种破盾的官方图标，路径取自 DestinyBreakerTypeDefinition 的 displayProperties.icon
# （enum 1/2/3 ＝ 贯穿护盾／干扰／眩晕）。这张表只有三条、不按物品主键走，所以写在
# 这里；路径若随 manifest 变了，--pull 会当场 404 报出来，不会静默用旧图。
CHAMP = {
    1: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_07b9ba0194e85e46b258b04783e93d5d.png',
    2: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_da558352b624d799cf50de14d7cb9565.png',
    3: '/common/destiny2_content/icons/DestinyBreakerTypeDefinition_825a438c85404efd6472ff9e97fc7251.png',
}

# 六个元素的官方图标，路径取自 DestinyDamageTypeDefinition 的 displayProperties.icon
# （键是 defaultDamageType 那个枚举）。5 是「突袭」，库里没图，站内也用不到。
ELEM = {
    1: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_3385a924fd3ccb92c343ade19f19a370.png',
    2: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_092d066688b879c807c3b460afdd61e6.png',
    3: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_2a1773e10968f2d088b97c22b22bba9e.png',
    4: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_ceb2f6197dccf3958bb31cc783eb97a0.png',
    6: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_530c4c3e7981dc2aefd24fd3293482bf.png',
    7: '/common/destiny2_content/icons/DestinyDamageTypeDefinition_b2fe51a94f3533f97079dfa0d27a4096.png',
}

CHROME = {
    'mw': '/img/destiny_content/items/masterwork-overlay.png',
    'tier': '/img/destiny_content/items/inventory-item-tier5.png',
    'craft': '/img/destiny_content/items/crafted-icon-overlay.png',
    'craft-bg': '/img/destiny_content/items/crafted-icon-background.png',
}

OUT_DIR = os.path.join(shell.ROOT, 'assets', 'icons')
TABLE = os.path.join(shell.ROOT, 'data', 'icons.json')

# 两档版式：表格行内的小图 64，大图 96。档位按各页现有的渲染尺寸定，一页一档
# ——同一张图在两页要两个尺寸时这里会报出来，实测站内没有这种。
WIDE = frozenset({'shopping-primary', 'shopping-special', 'shopping-heavy',
                  'shopping-other', 'legendary-primary', 'legendary-special',
                  'legendary-heavy'})

# 图标不由主键定的那几页，这里不管：
#   armor-sets / farming-sets  行标题是套装，套装自己没有图；那一页的 112 枚效果图
#                              已经是 manifest 的 sandboxPerk 官方图（--fill-icons 补的），
#                              且按序号命名、走另一套缓存规矩（README）。
SKIP = frozenset({'armor-sets', 'farming-sets'})


def width(page):
    return 96 if page in WIDE else 64


def icon_of(facts, key):
    """一个主键在库里的官方图路径。

    **套装与属性这两类取页面本地图，不取官方图。**不是库里没有——229 条走这条路
    的条目里 225 条在 armor-sets.json 的 setPerks 与 stats.json 上都有 icon 字段。
    它们没进来是因为这两页的图是从英文原表抠的，换成官方图是换图不是补图。
    """
    if key.startswith(('set:', 'stat:')):
        return None
    return resolve.icon_path(facts.at(key))


def wanted():
    """{官方图路径: 档宽}，外加「有图却落不到主键上」的逐页计数。

    子条目不进来：异域 PERK 那一列里几个名字共用打头那一枚图，那是整件异域的
    词条图，按每一条各取各的图会换掉那一页的版式。
    """
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    need, clash, blank = {}, [], collections.Counter()
    for page in pagedex.TOKENS:
        if page in SKIP:
            continue
        got = pagedex.read(page)
        if got is None:
            die('%s 还没有索引：先跑一次 npm run build' % page)
        for row in got['entries']:
            if row.get('of') or not row['icon']:
                continue
            path = next((p for p in (icon_of(facts, k)
                                     for k in (row['hash'] or '').split()) if p), None)
            if not path:
                blank[page] += 1
                continue
            if need.setdefault(path, width(page)) != width(page):
                clash.append((path, page))
    # 武器库那一页要画每把枪的词条网格，图是插件自己的。这些插件多数不在任何
    # 资料页上有行，靠上面那一圈扫不到。范围是**事实层里的全部武器**：那一页
    # 列的就是这 2208 把，没有作者记录的那些照样画词条池。可选模组与大师杰作
    # 两栏的图也在这里一并要回来。
    for key, row in facts.items.items():
        if row.get('itemType') != 3:
            continue
        # 枪自己那一张：左栏每一行与右栏的「别的版本」都要画它。资料页上有行的
        # 那几百把由上面那一圈带进来了，剩下的一千多把只有这一页显示。
        own = icon_of(facts, key)
        if own:
            need.setdefault(own, 64)
        # 赛季水印：一张整幅图，角标画在它自己那个角上。全库 45 种。
        if row.get('wm'):
            need.setdefault(row['wm'], 96)
        for col in facts.pools.get(key) or ():
            plugs = list(col.get('plugs') or ())
            if col.get('init'):
                plugs.append(col['init'])
            for one in plugs:
                path = icon_of(facts, str(one))
                if path:
                    need.setdefault(path, 64)
    for path in CHROME.values():
        need.setdefault(path, 96)
    for path in CHAMP.values():
        need.setdefault(path, 64)
    for path in ELEM.values():
        need.setdefault(path, 64)
    if clash:
        die('这几张图在两页要两个尺寸，得先定版式：\n  %s'
            % '\n  '.join('%s ← %s' % x for x in clash[:10]))
    return need, blank


def fetch(path):
    # 以 / 打头的是站点绝对路径（装饰层在 /img/ 下，不在图标目录里）；
    # 其余仍按图标目录相对取，data/icons.json 里已有的两千多条键不受影响。
    req = urllib.request.Request((HOST + path) if path.startswith('/') else BASE + path,
                                 headers={'User-Agent': 'starside-build'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def convert(raw, ext, wide):
    """官方原图 → webp。编码参数与站内其余图标一致（mods.icons 同一套）。

    哈希按**编码之后**的字节算：先编码再命名，顺序反了文件名对不上内容。
    """
    src = os.path.join(OUT_DIR, '_tmp' + ext)
    webp = os.path.join(OUT_DIR, '_tmp.webp')
    with open(src, 'wb') as f:
        f.write(raw)
    subprocess.run(['cwebp', '-quiet', '-q', '82', '-alpha_q', '100',
                    '-resize', str(wide), '0', src, '-o', webp], check=True)
    with open(webp, 'rb') as f:
        data = f.read()
    os.remove(src)
    name = hashlib.md5(data).hexdigest()[:10] + '.webp'
    os.replace(webp, os.path.join(OUT_DIR, name))
    return name


def pull(need, table):
    os.makedirs(OUT_DIR, exist_ok=True)
    done = failed = 0
    for path, wide in sorted(need.items()):
        have = table.get(path)
        if have and os.path.exists(os.path.join(OUT_DIR, have['file'])):
            continue
        try:
            raw = fetch(path)
        except Exception as why:                      # noqa: BLE001
            # 拉不动就报出来接着拉下一张：整批两千多张，一张 404 不该让整轮白跑。
            # 收尾会把没拿到的逐条列出来，不会静默当成拉完了。
            print('  拉不到 %s：%s' % (path, why))
            failed += 1
            continue
        table[path] = {'file': convert(raw, os.path.splitext(path)[1], wide),
                       'w': wide}
        done += 1
        if done % 200 == 0:
            # 边拉边落盘：文件名是内容的 md5，盘上那张图认不回自己是哪个官方
            # 地址来的，表丢了就只能整批重拉。收尾再写一次的话中途挂掉就全白跑。
            save(table)
            print('  已拉 %d / %d' % (done, len(need)))
    return done, failed


def load():
    if not os.path.exists(TABLE):
        return {}
    with open(TABLE, encoding='utf-8') as f:
        return json.load(f)


def save(table):
    os.makedirs(os.path.dirname(TABLE), exist_ok=True)
    body = ',\n'.join(' %s: %s' % (json.dumps(k), json.dumps(v, sort_keys=True))
                      for k, v in sorted(table.items()))
    with open(TABLE, 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % body)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pull', action='store_true', help='拉取并转换，已在盘上的沿用')
    a = ap.parse_args()

    need, blank = wanted()
    table = load()
    missing = [p for p in need if p not in table
               or not os.path.exists(os.path.join(OUT_DIR, table[p]['file']))]
    print('索引要的官方图 %d 张（64 档 %d、96 档 %d），盘上已有 %d，还缺 %d'
          % (len(need), sum(1 for w in need.values() if w == 64),
             sum(1 for w in need.values() if w == 96),
             len(need) - len(missing), len(missing)))
    if blank:
        print('有图却落不到主键上的条目（这一轮不换）：%s'
              % '、'.join('%s %d' % kv for kv in sorted(blank.items())))
    if not a.pull:
        return 0
    done, failed = pull(need, table)
    save(table)
    print('新拉 %d 张，失败 %d 张，%s 共 %d 张'
          % (done, failed, os.path.relpath(OUT_DIR, shell.ROOT), len(table)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
