#!/usr/bin/env python3
"""就地编辑的出处表：页面上每段来自记录的文字，出自哪条记录的哪个字段。

主键页（references/keys/）的行内容在 data/ 的记录上，源稿里没有那段文字，编辑台
照源稿行号反查不到它。生成器渲染一段记录上的文字时，拿 `Origins.attr()` 给那个
元素戴上 `data-e="N"`（几段拼成的一处写成 `N,M`），N 是这一页出处表里的序号。
表落成 `<页目录>/edit.json`，只在就地编辑时加载，读者不下载。

出处表的一项是 `[记录, 字段路径, 构建时的值, 标签]`：记录写成「表名/裸 hash」，
即库里 recs 集合的 `_id`；字段路径是 `facts.site_text()` 的键。`recs` 另记本页每条
记录那一份站内文字的 sha1：编辑台拿它与库里比，相等就没有待上站的改动。

同一条记录在几页上都有时，几页的出处表各记一份、指向同一个 `_id`：线上改一处，
重建之后引用它的每一页一起变，编辑态里每一页也都看得见那一处待审。
"""

import hashlib
import json
import os
import re

import facts
import markup
import resolve

FILE = 'edit.json'


class Origins:
    """一页的出处表。生成器每页新建一份，渲染时登记，seal() 重编号，写页面之后落盘。"""

    def __init__(self):
        self.rows = []
        self.at = {}
        self.recs = {}
        self.flat = {}

    def attr(self, *spots):
        """`(主键, 字段路径, 标签)` 若干 → ` data-e="N"`。空的 spot 跳过，全空回空串。"""
        ids = []
        for spot in spots:
            if spot:
                n = self.one(*spot)
                if n not in ids:
                    ids.append(n)
        return ' data-e="%s"' % ','.join(str(n) for n in ids) if ids else ''

    def one(self, key, path, label):
        f = resolve.shared()[0]
        rid = f.rec_id(key)
        if rid not in self.flat:
            table, bare = rid.split('/', 1)
            row = f.tables[table].get(bare)
            if row is None:
                markup.die('出处 %s 落不到记录上' % rid)
            self.flat[rid] = facts.site_text(table, row)
            self.recs[rid] = hashlib.sha1(facts.canon(self.flat[rid]).encode()).hexdigest()
        flat = self.flat[rid]
        # 生成器标出来的只能是站内写的文字：标到 manifest 字段上，线上改完 sync.py
        # 写不回去，而页面上看不出哪一处是这样。
        if path not in flat and not facts.NEW_LEAF.match(path):
            markup.die('%s 的 %s 不是站内写的文字，编辑台改不了它（%s）' % (rid, path, label))
        k = (rid, path)
        if k not in self.at:
            self.at[k] = len(self.rows)
            self.rows.append([rid, path, flat.get(path, ''), label])
        return self.at[k]

    MARK = re.compile(r' data-e="([0-9,]+)"')

    def seal(self, html):
        """按页面上出现的先后给出处重新编号，写回之前走一遍。

        渲染时登记的顺序与产出里的顺序不同（作者区先算、排在正文后面），登记了却没
        画出来的（空的说明）也要剔掉。重编之后每一处新出处的号恰是「已出现的最大号
        + 1」，写成空串：`data-e=""` 整页逐字相同，gzip 几乎不占地方；指回前面某一处
        的才写号。解码在 admin/edit.js 的 origins()，按文档顺序逐个还原。
        """
        order, rows = {}, []

        def one(m):
            out = []
            for n in m.group(1).split(','):
                n = int(n)
                if n in order:
                    out.append(str(order[n]))
                    continue
                order[n] = len(rows)
                rows.append(self.rows[n])
                out.append('')
            return ' data-e="%s"' % ','.join(out)

        html = self.MARK.sub(one, html)
        self.rows = rows
        self.recs = {r: h for r, h in self.recs.items() if any(x[0] == r for x in rows)}
        return html

    def write(self, outdir):
        """落 `<页目录>/edit.json`，回登记了几处。这一页没有出处就删掉旧的那一份。"""
        path = os.path.join(outdir, FILE)
        if not self.rows:
            if os.path.exists(path):
                os.remove(path)
            return 0
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({'recs': self.recs, 'e': self.rows}, f, ensure_ascii=False,
                      separators=(',', ':'))
            f.write('\n')
        return len(self.rows)
