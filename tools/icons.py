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
import json
import glob
import os
import re
import subprocess
import sys
import urllib.request

import resolve
import shell

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
# 勇士那三档。站内写法是「反屏障／反过载／反势不可挡」，不是 manifest 的效果名
# （贯穿护盾／干扰／眩晕）——按站内出现频次定，见 .claude/rules/weapons.md。
# **一处定义**：武器库按它画标签，实体层按它把表格里那一格的破盾图标解成档位。
BREAKER = {1: '反屏障', 2: '反过载', 3: '反势不可挡'}
# 站内那张破盾图（内容 md5 前 10 位）→ 档位。
CHAMP_FILE = {'a9911a3dfe': 1, '8b37bb6db2': 2, 'b7c4048b87': 3}
CHAMP_CELL = re.compile(r'icons/(\w+)\.webp')


def champ_of(cell):
    """表格里那一格破盾图 → 档位名。认不出就回空串。"""
    got = CHAMP_CELL.search(cell or '')
    return BREAKER.get(CHAMP_FILE.get(got.group(1), 0), '') if got else ''


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

OUT_DIR = os.path.join(shell.SITE, 'assets', 'icons')

# 两档版式：表格行内的小图 64，大图 96。档位按各页现有的渲染尺寸定，一页一档
# ——同一张图在两页要两个尺寸时这里会报出来，实测站内没有这种。
WIDE = frozenset({'shopping-primary', 'shopping-special', 'shopping-heavy',
                  'shopping-other', 'legendary-primary', 'legendary-special',
                  'legendary-heavy'})

# 图标不由主键定的那几页，这里不管：
#   armor-sets / farming-sets  图是套装效果那条 SandboxPerk 的；armor-sets 的 112 枚效果图
#                              已经是 manifest 的 sandboxPerk 官方图（--fill-icons 补的），
#                              且按序号命名、走另一套缓存规矩（README）。
SKIP = frozenset({'armor-sets', 'farming-sets'})


def file_of(path):
    """官方图路径 → 站内文件名。Bungie 的图名本身是内容哈希，只换扩展名。"""
    return os.path.splitext(os.path.basename(path))[0] + '.webp'


def width(page):
    return 96 if page in WIDE else 64


def icon_of(facts, key):
    """一个主键在库里的官方图路径。查不到的返回 None。

    套装自己没有图，图挂在它的 setPerks 指向的那条 SandboxPerk 上——一个套装的
    2 件与 4 件效果各有一张，取第一张。
    """
    row = facts.at(key)
    got = resolve.icon_path(row)
    if got:
        return got
    for bonus in (row or {}).get('setPerks') or ():
        got = resolve.icon_path(facts.ref(bonus['perk']))
        if got:
            return got
    return None


def wanted():
    """{官方图路径: 档宽}。范围是**站内寻址得到的一切**：

    人写层那 21 页每一行的主键（含 covers），加事实层里全部武器与它们各栏的插件
    ——武器库那一页列的是 2208 把，其中一千多把不在任何资料页上有行。

    从前这一圈扫 `data/index/`，那是渲染器交出来的中间产物；现在按主键扫，
    图与页面位置因此彻底分开。
    """
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    need = {}

    def add(key, wide):
        got = icon_of(facts, key)
        if got:
            need.setdefault(got, wide)

    for path in sorted(glob.glob(os.path.join(shell.ROOT, 'references',
                                              'research', '*.json'))):
        with open(path, encoding='utf-8') as fh:
            got = json.load(fh)
        for h, blocks in (got.get('said') or {}).items():
            add(h, 64)
            for b in blocks:
                for x in b.get('covers') or ():
                    add(x, 64)
    # 武器库：每把枪与每件异域护甲自己那张，加武器各栏插件的图（含可选模组与
    # 大师杰作）、催化剂，以及护甲固有与特征栏里的异域 Perk。
    for key, row in facts.items.items():
        if row.get('itemType') not in (2, 3):
            continue
        add(key, 64)
        for field in ('iconWatermark', 'iconWatermarkFeatured'):
            if row.get(field):
                need.setdefault(row[field], 96)
        for c in (row.get('derived') or {}).get('catalyst') or ():
            add(str(c), 64)
        if row.get('itemType') == 2:
            for e in (row.get('sockets') or {}).get('socketEntries') or ():
                kind = ((facts.socket_types.get(str(e.get('socketTypeHash'))) or {})
                        .get('derived') or {}).get('kind')
                if kind in ('intrinsic', 'trait') and e.get('singleInitialItemHash'):
                    add(str(e['singleInitialItemHash']), 64)
            continue
        for col in facts.pool(key):
            for one in list(col.get('plugs') or ()) + ([col['init']] if col.get('init') else []):
                add(str(one), 64)
    for path in CHROME.values():
        need.setdefault(path, 96)
    for path in list(CHAMP.values()) + list(ELEM.values()):
        need.setdefault(path, 64)
    return need


def fetch(path):
    # 以 / 打头的是站点绝对路径（装饰层在 /img/ 下，不在图标目录里）；
    # 其余仍按图标目录相对取，data/icons.json 里已有的两千多条键不受影响。
    req = urllib.request.Request((HOST + path) if path.startswith('/') else BASE + path,
                                 headers={'User-Agent': 'starside-build'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def convert(raw, path, wide):
    """官方原图 → webp。编码参数与站内其余图标一致（mods.icons 同一套）。

    **文件名就是官方图的名字**，只换扩展名。Bungie 的图名本身是内容哈希，所以
    「改内容必然换名」这条照旧成立，而且从主键的 `icon` 字段直接推得出文件名，
    不需要任何映射表——从前那张 data/icons.json 正是为了认回这件事而存在的。
    """
    ext = os.path.splitext(path)[1]
    src = os.path.join(OUT_DIR, '_tmp' + ext)
    webp = os.path.join(OUT_DIR, '_tmp.webp')
    with open(src, 'wb') as f:
        f.write(raw)
    subprocess.run(['cwebp', '-quiet', '-q', '82', '-alpha_q', '100',
                    '-resize', str(wide), '0', src, '-o', webp], check=True)
    os.remove(src)
    name = file_of(path)
    os.replace(webp, os.path.join(OUT_DIR, name))
    return name


def pull(need):
    """缺哪张拉哪张。判据是「盘上有没有这个名字」，不再要一张映射表。"""
    os.makedirs(OUT_DIR, exist_ok=True)
    done = failed = 0
    for path, wide in sorted(need.items()):
        if os.path.exists(os.path.join(OUT_DIR, file_of(path))):
            continue
        try:
            raw = fetch(path)
        except Exception as why:                      # noqa: BLE001
            # 拉不动就报出来接着拉下一张：整批两千多张，一张 404 不该让整轮白跑。
            print('  拉不到 %s：%s' % (path, why))
            failed += 1
            continue
        convert(raw, path, wide)
        done += 1
        if done % 200 == 0:
            print('  已拉 %d / %d' % (done, len(need)))
    return done, failed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pull', action='store_true', help='拉取并转换，已在盘上的沿用')
    a = ap.parse_args()

    need = wanted()
    missing = [p for p in need if not os.path.exists(os.path.join(OUT_DIR, file_of(p)))]
    print('站内寻址得到的官方图 %d 张（64 档 %d、96 档 %d），盘上已有 %d，还缺 %d'
          % (len(need), sum(1 for w in need.values() if w == 64),
             sum(1 for w in need.values() if w == 96),
             len(need) - len(missing), len(missing)))
    if not a.pull:
        return 0
    done, failed = pull(need)
    print('新拉 %d 张，失败 %d 张，%s 共 %d 张'
          % (done, failed, os.path.relpath(OUT_DIR, shell.SITE),
             len(os.listdir(OUT_DIR))))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
