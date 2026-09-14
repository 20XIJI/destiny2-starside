#!/usr/bin/env python3
"""页面索引：生成器渲染时把每一条条目登记下来，落成 data/index/<页>.json。

从前配装页要引资料页上的某一条，靠 tools/vocab.py 用正则回头扫产出的 HTML。那条
链有两处脆：**同名撞车**（2200 个名字里 150 个重名，只能靠槽位限定与分节括注兜），
以及**正则咬死产出结构**（给套装那一格加一个属性就让 id="…" 后面不再紧跟 >，构建
当场中止）。

改成生成器主动写：锚点、分节、说明本来就只有生成器自己知道，让它顺手交出来，
比让别人回头猜便宜也稳。索引以主键为准，名字只是显示用的一个字段。

一条条目的字段与 vocab.entry() 逐一对应，迁移期间两边可以直接比对：

    hash    主键，一族东西可能有几个（词条的普通与强化）
    anchor  这一条在页面上的锚点
    kind    分节名或横幅组名
    name    显示名
    icon    图标路径，相对站根
    sub     副名（套装的来源、变体所属的复合行）
    q       落地时的页内过滤词，空串表示这一条不过滤
    pos     只有神器模组给：'行,档'
    desc    这一条在站内的说明，原样带着着色 span
"""

import json
import os

import shell

OUT_DIR = os.path.join(shell.ROOT, 'data', 'index')

FIELDS = ('hash', 'anchor', 'kind', 'name', 'icon', 'sub', 'q', 'pos', 'desc')


class Index:
    """一页的条目登记处。生成器渲染时 add()，收尾 write()。"""

    def __init__(self, page, token=''):
        self.page = page
        self.token = token
        self.rows = []

    def add(self, *, hash='', anchor='', kind='', name='', icon='',
            sub='', q=None, pos='', desc=''):
        # q 缺省跟着 name 走；显式给空串表示这一条不参与页内过滤（分节标题那一类）。
        self.rows.append({'hash': hash, 'anchor': anchor, 'kind': kind,
                          'name': name, 'icon': icon, 'sub': sub,
                          'q': name if q is None else q, 'pos': pos, 'desc': desc})

    def write(self):
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, self.page.replace('/', '__') + '.json')
        body = ',\n'.join(
            '  ' + json.dumps({k: r[k] for k in FIELDS if r[k]},
                              ensure_ascii=False, sort_keys=True)
            for r in self.rows)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('{\n "page": %s,\n "token": %s,\n "entries": [\n%s\n ]\n}\n'
                    % (json.dumps(self.page), json.dumps(self.token), body))
        return path, len(self.rows)


def read(page):
    path = os.path.join(OUT_DIR, page.replace('/', '__') + '.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        got = json.load(f)
    for row in got['entries']:
        for key in FIELDS:
            row.setdefault(key, '')
    return got
