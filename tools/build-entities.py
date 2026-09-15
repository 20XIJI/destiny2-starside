#!/usr/bin/env python3
"""实体层：一个主键一条记录，输入一个 hash 就拿得到关于它的全部事实。

    data/manifest/        Bungie 说的（类型、品阶、官方描述、官方图路径）
    references/research/  我们测的（实际机制、评级、图标、它落在哪几个主键上）
    data/index/           它在页面上的位置（锚点、分节、渲染后的说明）
          ↓  合
    data/entities/   items · effects · stats · armor-sets · mechanics

**按 manifest 的表分，不按页分。**hash 是主键，主键不该先问「它在哪一页」才查得到。站内
2715 件东西里有 487 件出现在两页上（异域武器的详解页与评级页、同一把枪在 Aegis
的购物清单与 LGpig 的刷取清单），按页分文件就是同一个 hash 存两份，而且从记录
本身看不出为什么会有两份。

**这一份是产物，不手改。**改机制改 references/research/，改 manifest 重跑
facts.py --distill，两种情况都重跑这个脚本（npm run build 里已经排上）。

一条记录长这样：

    "2679249093": {
      "hash": 2679249093, "index": 7617, "itemType": 19, "itemSubType": 0,
      "classType": 3, "itemCategoryHashes": [59, 3708671066, 610365472],
      "inventory": {"tierType": 2, "bucketTypeHash": 1469714392},
      "plug": {"plugCategoryIdentifier": "frames"},
      "perks": [374284927],
      "icon": {"source": "013a56db….png"},
      "i18n": {
        "zh-CN": {"name": "雪上加霜", "itemTypeDisplayName": "特性",
                  "itemTypeAndTierDisplayName": "普通 特性",
                  "database_details": "一发弹药的所有弹片均命中同一敌人……"},
        "en":    {"name": "One-Two Punch", …}
      },
      "relations": {"members": ["788178929", "2679249093"], "role": "normal"},
      "pages": {
        "weapon-perks": {
          "kind": "武器 PERK", "anchor": "sec-1",
          "icon": "weapon-perks/icons/ff23ad5551.webp",
          "details_html": "<p>命中 12 <span class=\\"enh\\">↑10</span> 颗弹丸时：……",
          "i18n": {"zh-CN": {"name": "雪上加霜",
                             "realgame_details": "命中 12 {enh|↑10} 颗弹丸时：……"}}
        }
      }
    }

四条规矩。

**凡是随语言变的，都在某个 i18n 底下。**根上一个双语字段都没有：名字、类型名、
品阶名、官方描述、风味文本、来源串，全部进 i18n.<语言>。反过来，i18n 里一个与
语言无关的字段都没有。判据只有一条：换一种语言，这个值会不会变。

**页面相关的东西收进 pages，一页一块。**评级、排名、评级理由、注解、备注、枪管、
弹匣、Perk 列……站内 23 页有 287 种列名，写死字段名等于每加一页改一次脚本。一块里
除了位置（kind／anchor／icon／details_html）之外全在它自己的 i18n 下。同一件东西被
两位作者各写一套时，两块并列，谁也不盖谁，而且从 pages 的键上看得出是谁写的。

**database_details 与 realgame_details 严格分开。**前者是官方数据库怎么描述，后者
是它在游戏里实际怎么工作。manifest 说「一发弹药的所有弹片均命中」，实测是 12 颗；
强化版 manifest 说「几乎所有弹片」，实测是 10 颗。合并等于把测出来的盖掉。

**一份人写说明展开到它的每个成员。**「雪上加霜」在 manifest 里是两个 hash，有的
Perk 是 58 个。人只写一份，这里抄给每一个——抄是机器做的，而且 relations.members
写明了为什么这几条一样。谁是普通版谁是强化版由各自的 tierType 现算（2 / 3）。

    python3 tools/build-entities.py
"""

import argparse
import collections
import json
import os
import re
import sys

import entitydb
import pagedex
import icons
import markup
import research
import resolve
from markup import die

# 同一页上两条人写记录抢同一个主键的现存主键数。**只许降不许升**：每一个都是一行
# 人写说明照不到的地方。现存 215 个、30 组，全部是既有缺陷——索引里只是把同一串
# hash 存两遍，至今没有人交叉核对过。
#
# 一、泛称与括注限定名解析成同一串（10 组，占 187 个主键）。「精密框架」列的是全部
#     58 枚精密框架，而「精密框架（手炮）」本该只是其中手炮那几枚；resolve.norm()
#     把括注当版本后缀剥掉了。同类：攻击型框架 40、速射框架 35、重型点射 15、
#     适配框架 13、微型导弹框架 12、高冲击力框架 10，以及烈焰战锤、故我在、英勇利刃。
# 二、短名是长名的一截（3 组）：缠结／抓钩缠结、瓦解／瓦解弹药、不稳定／不稳定弹药。
# 三、两行名字一模一样（11 组）：渗透、布瑞遗产、暴雷之触、食莲者、应许之物……
#     要分开得先改源稿，把两行的标题写得能区分。
CLAIM_BASELINE = 215

# 引用格里解不出主键的名字数。**只许降不许升**：每一处都是页面上写着一件东西、
# 而实体层指不到它。现存 126 处，大半是起源特性——那一列写的名字不在这把枪自己的
# socket 池里（复刻版本之间池不同，源稿标的是另一版）。与 build-weapons 的
# BASELINE['miss'] 同一类，治法也一样：改源稿的写法，或往 resolve.PERK_ALIAS 里
# 添一条。
MISS_BASELINE = 126

# 随语言变的 manifest 字段，整份搬进 i18n.<语言>。displayProperties.description
# 改叫 database_details——它与我们测的 realgame_details 并排摆着，
# 叫 description 分不出谁是谁。
BILINGUAL = ('itemTypeDisplayName', 'itemTypeAndTierDisplayName',
             'flavorText', 'sourceString')


def role_of(row):
    """普通版还是强化版。按 manifest 的 tierType 现算，不人工记。"""
    tier = (row.get('inventory') or {}).get('tierType')
    return {2: 'normal', 3: 'enhanced'}.get(tier or 0)


def from_index(page):
    """主键 → (锚点, 渲染后的说明 HTML, 图标)。

    这三样都由渲染器现出：锚点是这一行在页面上的位置，说明是把源稿方言渲出来的
    那一份，图标是这一页目录下的那张。取完就收进实体层，索引那一侧只留主键清单
    ——站内要它们的地方都按主键查，让每个消费者各自去索引里按名字捞是第二个入口。
    """
    got = pagedex.read(page)
    out = {}
    if not got:
        return out
    for e in got['entries']:
        for h in e.get('keys') or ():
            out.setdefault(h, e)
    return out


def manifest_part(row):
    """manifest 那一半：与语言无关的留根上，随语言变的进 i18n。"""
    out, i18n = {}, {}
    for key, val in row.items():
        if key == 'displayProperties':
            for lang, text in (val.get('name') or {}).items():
                i18n.setdefault(lang, {})['name'] = text
            for lang, text in (val.get('description') or {}).items():
                i18n.setdefault(lang, {})['database_details'] = text
            if val.get('icon'):
                out['icon'] = {'source': val['icon']}
            continue
        if key in BILINGUAL:
            for lang, text in (val or {}).items():
                i18n.setdefault(lang, {})[key] = text
            continue
        out[key] = val
    return out, i18n


# ── 一格里写的是什么 ───────────────────────────────────────────────────
#
# 站内 23 页有 287 种列名，**按列名分类等于每加一页改一次脚本**。判据下在格子
# 自己的形状上：整格是不是标记、标记名是不是枚举、剥干净之后还剩不剩文字。
#
#   引  整格引的是别的实体（枪管、弹匣、Perk 1、起源特性）→ refs，存主键
#   值  整格是数值或枚举（排名、赛季、勇士、元素、来源）→ values，存原值
#   文  真正的文字（注解、评级理由、机制说明）→ i18n，按语言分
MARKER = re.compile(r'\{([\w-]+)\|([^{}]*)\}')
MARKED = re.compile(r'^\s*(?:\{[\w-]+\|[^{}]*\}|\\\\|\s)+\s*$')
NUMERIC = re.compile(r'^\s*(?:[\d.,%+×-]|\s|\\\\|／|/|｜)+\s*$')
# 图与链接不提供文字身份，**剥在切分之前**——反过来做会把 icons/x.webp 的路径
# 按 / 切碎，切出来的「碎片」再去查主键，自然一个都查不到。
IMG_SRC = re.compile(r'!\[\]\([^)]*\)')
LINK_SRC = re.compile(r'\[([^\]]*)\]\([^)]*\)')
# 一格里并列几件东西时用的分隔符。
SPLIT = re.compile(r'%s|／|/|｜|、' % re.escape(markup.CELL_BREAK))
# 这几个标记里写的是数值或枚举，不是别的实体。元素与勇士在实体自己身上已经有了
# （defaultDamageType 与 derived.breakerType），这里记的是这一页怎么写它。
ENUM = frozenset({'num', 'champ', 'cd', 'slot', 'cost', 'na', 'src', 'stack',
                  'el-kinetic', 'el-arc', 'el-solar', 'el-void', 'el-stasis',
                  'el-strand', 'el-prismatic'})


def bare(text):
    """剥掉图与链接，只留文字。"""
    return LINK_SRC.sub(r'\1', IMG_SRC.sub('', text)).strip()


def vocab_of(entries):
    """一页里哪几列写的是词表，不是散文。

    **判据从数据本身读，不拍阈值也不列名单**：词表会重复（356 把枪的「评级」只有
    6 个取值、「框架」16 个），散文不会（21 条评级理由 21 个取值）。所以「这一列
    出现过重复的值」即词表。两类在实测上分得很开——词表的异值率 ≤0.08，散文是
    1.00，中间没有东西。
    """
    seen = {}
    for entry in entries:
        for field, val in ((entry.get('i18n') or {}).get(resolve.ZH) or {}).items():
            if val and not MARKER.search(val):
                seen.setdefault(field, []).append(val)
    return {f for f, vals in seen.items() if len(set(vals)) < len(vals)}


def cell_kind(text):
    if not text.strip():
        return ''
    tags = {t for t, _ in MARKER.findall(text)}
    if MARKED.match(text) and tags:
        return '值' if tags <= ENUM else '引'
    return '值' if NUMERIC.match(bare(text)) else '文'


def names_in(text):
    """一格引用里并列的那几个名字，按出现顺序。"""
    out = []
    for tag, body in MARKER.findall(text):
        if tag in ENUM:
            continue
        for part in SPLIT.split(bare(body)):
            part = part.strip().lstrip('↑')
            if part:
                out.append(part)
    return out


def refs_of(perk_key, keys, text):
    """一格引用 → 它引到的那些主键，按出现顺序。解不出来的名字原样报出。"""
    out, miss = [], []
    for name in names_in(text):
        got = perk_key(keys, name)
        if got:
            out.extend(got)
        elif got is not None:
            miss.append(name)
    return out, miss


def value_of(text, champ_of):
    """一格数值或枚举 → 它的值。**把标记的壳剥掉**：存 `{num|56}` 等于把渲染形态
    当数据，读的人还要自己解一次。勇士那一格写的是破盾图标，图标即档位。"""
    out, marks = [], MARKER.findall(text)
    for tag, body in marks:
        got = champ_of(body) if tag == 'champ' else bare(body)
        if got:
            out.append(got)
    if out:
        return markup.CELL_BREAK.join(out)
    # 整格全是标记、而标记里一个字都没有（空槽位 `{slot|}`）：值就是空，不是
    # 那串标记本身。回落到原文会把渲染形态当值存下来。
    return '' if marks and MARKED.match(text) else bare(text)


# **位置信息一概不进实体。**锚点、页内筛选词、神器排盘坐标、渲染后的说明 HTML、
# 这一页目录下的那张图——这些说的是「它在页面上长在哪、画成什么样」，是构建期的
# 东西，不是关于这件东西的事实。它们留在 data/index/（不入库的中间产物）里，谁
# 要位置谁去那里取。实体里存一份，等于把同一件事记在了错的一侧。
#
# 只有两样从索引来：显示名（人写层存的是源稿原格「陨落铡刀\\猛攻版本」，带格内
# 换行；索引那份是渲染后的名字，页面与词表要的是后者），以及套装的副名。
FROM_INDEX_I18N = (('name', 'name'), ('sub', 'sub'))


def page_part(page, entry, row, keys, perk_key, miss, mine, vocab, shown):
    """页面块：这一页对这件东西说了什么，外加它在这一页的位置。

    entry 是人写层那一条，可能没有——带图标的分节标题、异域 PERK 列的子条目都
    只在索引里有。分节名以索引那一份为准：人写层记的是这一行落在哪个分节，索引
    记的是渲染时真正的那个。

    格子按形状分三处，**不按列名**：
      refs    整格引的是别的实体（枪管、弹匣、Perk 1、起源特性）→ 主键数组
      values  整格是数值或枚举（排名、赛季、评级、勇士、元素）→ 原值，与语言无关
      i18n    真正的文字（注解、评级理由、机制说明）→ 按语言分
    """
    block = {'kind': row.get('kind') or entry.get('kind', '')}
    for lang, fields in (entry.get('i18n') or {}).items():
        for field, val in fields.items():
            # 行标题那一格不进页面块：人写层存的是源稿原格，索引那份是渲染后的
            # 显示名，两者只留后者，而且只在与实体自己那个名字不同时才留。
            if not val or field == 'name':
                continue
            if field in vocab and not MARKER.search(val):
                # 这一列是词表（评级、框架、大师），不是语言文本也不是散文。
                block.setdefault('values', {})[field] = val
                continue
            if field == 'realgame_details':
                # **机制说明挂在实体上，不挂在页面块上。**它说的是这件东西在游戏里
                # 怎么工作，换一页不会变；写在哪一页只是它被谁记下来。
                mine.setdefault(lang, {}).setdefault(field, val)
                continue
            if lang != resolve.ZH:
                block.setdefault('i18n', {}).setdefault(lang, {})[field] = val
                continue
            got = cell_kind(val)
            if got == '引':
                hits, bad = refs_of(perk_key, keys, val)
                if hits:
                    block.setdefault('refs', {})[field] = hits
                for name in bad:
                    miss.append((page, field, name))
                if hits and not bad:
                    continue
                block.setdefault('i18n', {}).setdefault(lang, {})[field] = val
            elif got == '值':
                plain = value_of(val, icons.champ_of)
                if plain:
                    block.setdefault('values', {})[field] = plain
            else:
                block.setdefault('i18n', {}).setdefault(lang, {})[field] = val
    for src, dst in FROM_INDEX_I18N:
        if row.get(src):
            block.setdefault('i18n', {}).setdefault(resolve.ZH, {})[dst] = row[src]
    # 与实体自己那个名字一样就不再存一份：页面块只记这一页写得不一样的那些
    # （「故我在（电弧元素）」是站内加的消歧后缀，manifest 里没有）。
    zh = (block.get('i18n') or {}).get(resolve.ZH) or {}
    if zh.get('name') == shown:
        zh.pop('name')
        if not zh:
            block['i18n'].pop(resolve.ZH)
        if not block['i18n']:
            block.pop('i18n')
    return block


def build(facts):
    """索引 + 人写层 → ({主键: 实体}, {页: 元信息与行序})。

    **按索引迭代，不按人写层。**索引是页面结构的权威：它知道这一页有哪些行、什么
    顺序，也知道人写层不知道的那几类——带图标的分节标题、异域 PERK 列里挂在行标题
    下的子条目。人写层按主键回接，交出这一行写了什么。
    """
    out, order_of, claims, orphan, miss, told = {}, {}, {}, 0, [], []
    perk_key = resolve.perk_stamper()
    # **页名一律用产出路径**（elements/class-abilities），不用源稿的 slug
    # （class-abilities）：索引、配装词表、页内锚点都按产出路径说话，实体层跟着
    # 它们，才不必在每个消费者那里各转一次。
    slug_of = {research.where_of(s): s for s in research.pages()}
    # **覆盖全部出索引的页**，不只是有人写层的那些：神器模组页与护甲套装页走各自的
    # 生成器、还没有人写层，但配装词表照样要按主键查得到它们。
    for page in sorted(pagedex.TOKENS):
        got = pagedex.read(page)
        if got is None:
            continue
        said, every, vocab = {}, [], set()
        slug = slug_of.get(page)
        if slug:
            for entry in research.must_read(slug)['entries']:
                if 'banner' in entry:
                    continue
                keys = ([str(h) for h in entry.get('members') or ()]
                        + list(entry.get('keys') or ()))
                if keys:
                    said.setdefault(tuple(keys), entry)
                    every.append((keys, research.field(entry, 'name')))
                else:
                    orphan += 1
            vocab = vocab_of(research.must_read(slug)['entries'])
        # 撞车从人写层那一侧算：两条人写记录的主键集合撞上了，后一条的说明就
        # 进不了实体层。索引那一侧同一个主键出现好几行是常态（护甲套装给同一个
        # set: 挂套装名与来源名两个入口、异域 PERK 挂在好几把枪底下），不是问题。
        by_key = {}
        for keys, shown in every:
            for key in keys:
                by_key.setdefault(key, []).append(shown)
        for key, names in by_key.items():
            if len(names) > 1:
                claims[(page, key)] = names
        for row in got['entries']:
            keys = list(row.get('keys') or ())
            if not keys:
                orphan += 1
                continue
            entry = said.get(tuple(keys)) or {}
            # 行序一行一条，**不按主键逐个记**：一行带六个主键（一族词条）时
            # 按主键记会把这一行在页面上重复六次。块下标取第一个主键那一条——
            # 那是这一行说的那件东西。
            first = True
            for key in keys:
                lib = {} if key.startswith('row:') else facts.at(key)
                if lib is None:
                    die('%s 的「%s」指到一个库里没有的主键：%s'
                        % (page, row.get('name', ''), key))
                have = out.get(key)
                if have is None:
                    plain, i18n = manifest_part(lib)
                    have = dict(plain)
                    if i18n:
                        have['i18n'] = i18n
                    if not key.startswith('row:'):
                        have['relations'] = {'members': keys, 'role': role_of(lib)}
                    out[key] = have
                mine = {}
                have.setdefault('pages', {}).setdefault(page, []).append(
                    page_part(page, entry, row, keys, perk_key, miss, mine, vocab,
                              resolve.text(lib)))
                for lang, fields in mine.items():
                    got = have.setdefault('i18n', {}).setdefault(lang, {})
                    for field, val in fields.items():
                        if got.setdefault(field, val) != val:
                            told.append((page, key, field))
                if first:
                    order_of.setdefault(page, []).append(
                        (keys, len(have['pages'][page]) - 1))
                    first = False
    # **被引用到的也要有实体。**refs 里写的是主键，主键就该指得到东西；站上没有
    # 独立一行的那些（枪管、弹匣这些词条）照样有 manifest 事实，补进来引用图才
    # 自洽，「输入一个 hash 拿到实体」也就没有例外。它们没有 pages，一眼看得出
    # 是被引用进来的。
    for key in sorted({k for row in list(out.values())
                       for blocks in (row.get('pages') or {}).values()
                       for b in blocks
                       for ks in (b.get('refs') or {}).values() for k in ks}):
        if key in out:
            continue
        lib = facts.at(key)
        if lib is None:
            continue
        plain, i18n = manifest_part(lib)
        got = dict(plain)
        if i18n:
            got['i18n'] = i18n
        out[key] = got
    return out, order_of, claims, orphan, miss, told


def order(key):
    """主键按数值排，带前缀的按前缀再按数值。"""
    tag, _, num = key.rpartition(':')
    return (tag, int(num)) if num.isdigit() else (key, 0)


def dump(rows):
    """按主键的前缀分表落盘，与 data/manifest/ 一一对应。"""
    os.makedirs(entitydb.OUT_DIR, exist_ok=True)
    split = {}
    for key, val in rows.items():
        split.setdefault(entitydb.table_of(key), {})[key] = val
    out = []
    for name in sorted({n for _, n in entitydb.TABLES} | {'items'}):
        got = split.get(name) or {}
        # 一条记录一行：改一条 git 只标一行，两千多条的文件因此存得下增量。
        body = ',\n'.join(
            '  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False,
                                                    sort_keys=True))
            for k, v in sorted(got.items(), key=lambda kv: order(kv[0])))
        with open(entitydb.path(name), 'w', encoding='utf-8') as f:
            f.write('{\n%s\n}\n' % body)
        out.append((name, len(got), os.path.getsize(entitydb.path(name))))
    return out


def dump_pages(order_of):
    """每一页要哪些实体、什么顺序，外加这一页自己的两位：着色 token 与有没有页内
    搜索框。一页一行。"""
    out = {}
    for page, rows in order_of.items():
        got = pagedex.read(page)
        out[page] = {'token': pagedex.TOKENS.get(page, ''),
                     'searchable': bool(got['searchable']) if got else True,
                     'rows': rows}
    body = ',\n'.join(
        '  %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, sort_keys=True))
        for k, v in sorted(out.items()))
    with open(entitydb.path('pages'), 'w', encoding='utf-8') as f:
        f.write('{\n%s\n}\n' % body)
    return os.path.getsize(entitydb.path('pages'))


def main():
    argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    rows, order_of, claims, orphan, miss, told = build(resolve.Facts())
    spread = sum(len(v.get('pages') or ()) for v in rows.values())
    for name, n, size in dump(rows):
        print('data/entities/%-14s %5d 条  %8.1f KB' % (name + '.json', n, size / 1024))
    size = dump_pages(order_of)
    print('data/entities/%-14s %5d 页  %8.1f KB' % ('pages.json', len(order_of), size / 1024))
    minted_n = sum(1 for k in rows if k.startswith('row:'))
    print('  合计 %d 条，页面块 %d 块，合成主键 %d 个' % (len(rows), spread, minted_n))
    if told:
        print('  两页给同一件东西写了不一样的机制说明 %d 处，留了先出现的那一份：%s'
              % (len(told), '、'.join('%s·%s' % (p, k) for p, k, _ in told[:4])))
    if miss:
        where = collections.Counter('%s · %s' % (p, f) for p, f, _ in miss)
        print('  引用格里解不出主键的名字 %d 处，前六列：%s'
              % (len(miss), '、'.join('%s %d' % (k, v) for k, v in where.most_common(6))))
    if len(miss) > MISS_BASELINE:
        die('引用格解不出主键的从 %d 处涨到 %d 处，页面上写着一件东西而实体层指不到它。'
            '改源稿的写法，或往 resolve.PERK_ALIAS 里添一条' % (MISS_BASELINE, len(miss)))
    if orphan:
        print('  没有索引、也就没有主键的行 %d 条（数值表，行标题不是身份）' % orphan)
    if claims:
        groups = {}
        for (page, key), names in claims.items():
            groups.setdefault((page, tuple(dict.fromkeys(names))), []).append(key)
        print('  同一页上两条人写记录抢同一个主键，只有第一条进了实体层'
              '（%d 个主键，%d 组）：' % (len(claims), len(groups)))
        for (page, names), keys in sorted(groups.items(), key=lambda x: -len(x[1])):
            others = names[1:]
            print('    %-14s %3d 个主键  留了「%s」，丢了 %s'
                  % (page, len(keys), names[0],
                     '、'.join('「%s」' % x for x in others)
                     if others else '另一条同名的'))
    if len(claims) > CLAIM_BASELINE:
        die('主键认领撞车从 %d 个涨到 %d 个，又多丢了人写说明照到的地方。'
            '要分开就改源稿把两行区分出来，或让解析器认得出括注里的限定词'
            % (CLAIM_BASELINE, len(claims)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
