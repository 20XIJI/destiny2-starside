#!/usr/bin/env python3
"""实体层：一个主键一条记录，输入一个 hash 就拿得到关于它的全部事实。

    data/manifest/    Bungie 说的（名字、类型、品阶、官方描述、官方图路径）
    references/research/  我们测的（实际机制、图标、它落在哪几个主键上）
    data/index/       它在页面上的位置（锚点、分节）
          ↓  合
    data/entities/<页>.json

**这一份是产物，不手改。**改机制改 references/research/，改 manifest 重跑
facts.py --distill，两种情况都重跑这个脚本（npm run build 里已经排上）。

一条记录长这样：

    "2679249093": {
      ……data/manifest/items.json 里那一条的全部字段……,
      "i18n": {"zh-CN": {"name": "雪上加霜",
                         "database_details": "一发弹药的所有弹片均命中同一敌人……",
                         "realgame_details": "命中 12 {enh|↑10} 颗弹丸时：……"},
               "en":    {"name": "One-Two Punch",
                         "database_details": "Hitting an enemy with every pellet……",
                         "realgame_details": null}},
      "research": {"page": "weapon-perks", "kind": "武器 PERK", "name": "雪上加霜",
                   "members": [2679249093, 788178929], "role": "normal"},
      "icon": {"source": "013a56db….png", "file": "weapon-perks/icons/ff23ad5551.webp"},
      "anchor": "sec-1"
    }

三件事值得先说清楚。

**database_details 与 realgame_details 严格分开。**前者是官方数据库怎么描述这件
东西，后者是它在游戏里实际怎么工作。两者常常不一致——manifest 说「一发弹药的所有
弹片均命中」，实测是 12 颗；强化版 manifest 说「几乎所有弹片」，实测是 10 颗。
合并等于把测出来的数盖掉。

**一份人写说明展开到它的每个成员。**「雪上加霜」在 manifest 里是两个 hash（普通版
与强化版），有的 Perk 是 58 个（每个武器原型一枚 plug）。人只写一份，这里抄给每
一个——**抄是机器做的**，人不维护 58 份。谁是普通版谁是强化版由各自的 tierType
现算（2 / 3），不人工记。

**同一个主键被两条人写记录认领时当场报出。**站内真有这种：「渗透」两行，一行讲手雷
技能一行讲职业技能，图标与正文都不同，而解析器给两行的主键完全相同。静默取其一
的后果是第二行的说明从此不上站，而且没有任何人知道。

    python3 tools/build-entities.py            # 全部有人写层的页
    python3 tools/build-entities.py weapon-perks
"""

import argparse
import json
import os
import sys

import pagedex
import research
import resolve
import shell
from markup import die

OUT_DIR = os.path.join(shell.ROOT, 'data', 'entities')
# 同一个主键被两条以上人写记录认领的现存主键数。**只许降不许升**：每一个都是
# 一行人写说明照不到的地方。现存 193 个，集中在 9 组，分两类。
#
# 七组是同一个病：泛称与限定名拿到同一串主键。「精密框架」列的是全部 58 枚精密
# 框架，而「精密框架（手炮）」本该只是其中的手炮那几枚——括注是限定词，可
# resolve.norm() 把它当消歧后缀剥掉了，两行于是解析成同一串。要治得让解析器认得
# 出括注里写的是武器类型，不是版本。涉及：精密框架 58、攻击型框架 40、速射框架 35、
# 重型点射 15、适配框架 13、微型导弹框架 12、高冲击力框架 10。
#
# 两组是两件真不同的东西同名：「渗透」一条讲手雷技能一条讲职业技能，图标与正文都
# 不同；「布瑞遗产」一条是深岩墓室那件一条是晚星之主武器那件。要分开得先改源稿，
# 把两行的标题写得能区分。
CLAIM_BASELINE = 193


def role_of(row):
    """普通版还是强化版。按 manifest 的 tierType 现算，不人工记。"""
    tier = (row.get('inventory') or {}).get('tierType')
    return {2: 'normal', 3: 'enhanced'}.get(tier or 0)


def anchors(page):
    """主键 → 它在页面上的锚点。位置不是事实，所以从索引取，不进人写层。

    **渲染后的 HTML 不进实体层。**实体层存的是事实，说明的事实形态是源稿方言那
    一份（realgame_details）；渲染成 `<p>…<span class="enh">…` 是渲染器的产物，
    两份都存等于把同一件事按两种形状各抄一遍——而人写说明要抄给它的每个成员，
    58 个成员就是 58 份，整份文件因此大一倍。
    """
    got = pagedex.read(page)
    out = {}
    if not got:
        return out
    for e in got['entries']:
        for h in (e.get('hash') or '').split():
            out.setdefault(h, e.get('anchor') or '')
    return out


def build(page, facts):
    entries = research.must_read(page)['entries']
    where = anchors(page)
    out, claims, orphan = {}, {}, 0
    for entry in entries:
        keys = [str(h) for h in entry.get('members') or ()] + list(entry.get('keys') or ())
        if not keys:
            orphan += 1
            continue
        name = research.field(entry, 'name')
        for key in keys:
            row = facts.at(key)
            if row is None:
                die('%s 的「%s」指到一个库里没有的主键：%s' % (page, name, key))
            if key in out:
                claims.setdefault(key, [out[key]['research']['name']]).append(name)
                continue
            got = dict(row)
            i18n = {}
            for lang in (resolve.ZH, resolve.EN):
                shown = resolve.text(row, lang=lang)
                official = resolve.text(row, 'description', lang=lang)
                mine = research.field(entry, 'realgame_details', lang) or None
                if shown or official or mine:
                    i18n[lang] = {'name': shown, 'database_details': official or None,
                                  'realgame_details': mine}
            got['i18n'] = i18n
            # members 照抄人写层那一份，不另换一种写法：那里写的什么，这里就是什么。
            got['research'] = {'page': page, 'kind': entry['kind'], 'name': name,
                               'members': (entry.get('members') or [])
                               + list(entry.get('keys') or ()),
                               'role': role_of(row)}
            src = resolve.icon_path(row)
            mine = research.field(entry, 'icon')
            if src or mine:
                got['icon'] = {'source': src or None,
                               'file': '%s/%s' % (page, mine) if mine else None}
            anchor = where.get(key, '')
            if anchor:
                got['anchor'] = anchor
            out[key] = got
    return out, claims, orphan


def dump(page, rows):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, page.replace('/', '__') + '.json')
    # 一条记录一行，主键按数值排（带前缀的按前缀再按数值）：改一条 git 只标一行。
    def order(key):
        tag, _, num = key.rpartition(':')
        return (tag, int(num)) if num.isdigit() else (key, 0)

    body = ',\n'.join('  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False,
                                                              sort_keys=True))
                      for k, v in sorted(rows.items(), key=lambda kv: order(kv[0])))
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % body)
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('page', nargs='?', help='只做这一页，省略即全部')
    a = ap.parse_args()
    facts = resolve.Facts()
    pages = [a.page] if a.page else research.pages()
    claims, total = {}, 0
    for page in pages:
        rows, bad, orphan = build(page, facts)
        claims.update({(page, k): v for k, v in bad.items()})
        total += len(rows)
        size = dump(page, rows)
        note = '，没有主键的 %d 条' % orphan if orphan else ''
        print('data/entities/%s.json  %d 条  %.1f KB%s'
              % (page.replace('/', '__'), len(rows), size / 1024, note))
    if claims:
        # 按「哪几条记录抢同一批主键」归组报：371 次认领挤在 9 组里，逐条打印
        # 没人看得下去，而组才是要修的单位。
        groups = {}
        for (page, key), names in claims.items():
            groups.setdefault((page, tuple(dict.fromkeys(names))), []).append(key)

        print('同一个主键被两条以上人写记录认领，只有第一条进了实体层'
              '（%d 个主键，%d 组）：' % (len(claims), len(groups)))
        for (page, names), keys in sorted(groups.items(), key=lambda x: -len(x[1])):
            others = names[1:]
            print('  %-14s %3d 个主键  留了「%s」，丢了 %s'
                  % (page, len(keys), names[0],
                     '、'.join('「%s」' % x for x in others) if others
                     else '另一条同名的'))
    if len(claims) > CLAIM_BASELINE:
        die('主键认领撞车从 %d 个涨到 %d 个，又多丢了人写说明照到的地方。'
            '要分开就改源稿把两行区分出来，或让解析器认得出括注里的限定词'
            % (CLAIM_BASELINE, len(claims)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
