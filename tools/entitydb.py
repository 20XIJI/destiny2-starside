#!/usr/bin/env python3
"""实体层的读取入口：data/entities/。

这一层由 tools/build-entities.py 把 data/manifest/ 与 references/research/ 按主键
合起来写出，**是产物，不手改**。站内凡是要「这一行叫什么、用哪张图、说明是什么」
的地方都从这里取，不再各自去索引里拿——索引只说这一行在页面上的位置。

与 tools/entities.py 不是一回事：那一份是武器库的人写层抽取器（按主键把两位作者
写的列合成 references/items/*.json），名字撞了，各看各的 docstring。

    entitydb.all()['2679249093']['i18n']['zh-CN']['name']

**不按页分，按 manifest 的表分。**与 data/manifest/ 一一对应：物品进 items.json，
效果进 effects.json，属性进 stats.json，套装进 armor-sets.json，库里没有对应物的
那几行进 mechanics.json。切分判据是主键自己的前缀，不是人分的类。

按页分过一版，错在两处：hash 是主键，不该先问「它在哪一页」才查得到；而且 2715 件
东西里有 487 件出现在两页上，按页分就是同一个 hash 存两份，从记录本身还看不出
为什么会有两份。页面相关的东西现在收在每条记录的 pages 键下，一页一块。
"""

import json
import os

import shell
from markup import die

OUT_DIR = os.path.join(shell.ROOT, 'data', 'entities')
ZH = 'zh-CN'
# 主键前缀 → 它落在哪张表。裸数字是物品。与 data/manifest/ 的表名对齐，
# mechanics 那一张是站内独有的：库里没有对应物的行（弩弹、刀剑格挡）。
TABLES = (('perk:', 'effects'), ('trait:', 'effects'), ('stat:', 'stats'),
          ('set:', 'armor-sets'), ('row:', 'mechanics'))
_CACHE: dict = {}


def table_of(key):
    """这个主键该落在哪张表里。"""
    for prefix, name in TABLES:
        if key.startswith(prefix):
            return name
    return 'items'


def path(name):
    return os.path.join(OUT_DIR, name + '.json')


def table(name):
    """一张表。读不到即中止——它由 build-entities.py 写出，缺了说明还没生成，
    静默回空会让下游拿着半份词表继续跑。"""
    if name not in _CACHE:
        p = path(name)
        if not os.path.exists(p):
            die('还没有实体层的 %s 表：先跑 python3 tools/build-entities.py' % name)
        with open(p, encoding='utf-8') as f:
            _CACHE[name] = json.load(f)
    return _CACHE[name]


def all():
    """{主键: 实体}，五张表合起来。要按主键查而不关心它属于哪张表时用这个。"""
    out = {}
    for name in sorted({n for _, n in TABLES} | {'items'}):
        out.update(table(name))
    return out


def page(page_name):
    """这一页的元信息与行序：{token, searchable, rows: [[这一行的主键…]…]}。

    顺序是页面的一部分，实体本身没有顺序，所以单列一份。
    """
    return table('pages').get(page_name) or {'token': '', 'searchable': True,
                                             'rows': []}


def order(page_name):
    return page(page_name)['rows']


def rows(page, lang=ZH):
    """这一页的行，按页面顺序：[(主键表, 实体, 这一行对应的那一块)]。

    一行可能带好几个主键（普通版与强化版、一族词条），实体取第一个那条——那是
    这一行说的那件东西，其余是它的成员。同一件东西在一页上可以有好几行（护甲套装
    的 2 件与 4 件），所以行序里除了主键还记着它对应第几块。
    """
    lib = all()
    out = []
    for keys, at in order(page):
        head = keys[0] if keys else ''
        got = lib.get(head)
        if got is None:
            continue
        got_blocks = blocks(got, page)
        if at >= len(got_blocks):
            continue
        out.append((keys, got, got_blocks[at]))
    return out


def blocks(row, page_name):
    """这件东西在这一页上的那几块。一页一般一块；护甲套装的 2 件与 4 件效果各占
    一行，那就是两块。"""
    return (row.get('pages') or {}).get(page_name) or []


def text(row, field='name', lang=ZH):
    """实体本身的某个语言字段（名字、类型名、官方描述……）。"""
    return ((row.get('i18n') or {}).get(lang) or {}).get(field) or ''


def said(block, field, lang=ZH):
    """某一页对它说的某个字段（说明、评级、注解、枪管……）。"""
    return ((block.get('i18n') or {}).get(lang) or {}).get(field) or ''
