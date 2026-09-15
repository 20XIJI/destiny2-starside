#!/usr/bin/env python3
"""人写层：站内实测出来的东西，以及它落在哪几个主键上。

事实层（data/manifest/）是 Bungie 说的，这一层是我们测的。两边按主键合成
data/entities/，那一份是产物。**人只编辑这一层。**

一页一份 references/research/<页>.json：

    {
      "page": "weapon-perks",
      "columns": [[["PERK", "name"], ["图标", "icon"], ["说明", "realgame_details"]],
                  [["PERK", "name"], ["图标", "icon"], ["来源", "来源"],
                   ["说明", "realgame_details"]]],
      "entries": [
        {"kind": "武器 PERK",
         "members": [2679249093, 788178929],
         "icon": "icons/ff23ad5551.webp",
         "i18n": {"zh-CN": {"name": "雪上加霜",
                            "realgame_details": "命中 12 {enh|↑10} 颗弹丸时：\\\\…"}}}
      ]
    }

三件事值得先说清楚。

**columns 一张表一份，按位置写。**一个页面可以有好几张表，表头各不相同，
异域护甲页还有一张 `左栏|图标|说明|右栏|图标|说明`——一行摆两件东西，列名重复。
按列名建一张页级的表对不上这些，所以按表、按位置存「列名 → 字段名」的有序对。

**columns 写在文件里，不写在代码里。**站内 37 页有 96 种表头、287 种列名
（「排名」「评级」「框架\\\\射速」「Perk 三号位」…）。把「列名 → 字段名」硬编码
进脚本，等于每迁一页改一次脚本；写在文件里，迁一页只是多一份数据。

字段名只有三个是另起的：首列叫 name、「图标」叫 icon、「说明」叫
realgame_details（与 database_details 分开——那一份是 manifest 说的）。**其余一律
用列名本身**，和 references/items/*.json 一个规矩：列名就是作者对这一列的定义，
换成别的名字等于替他改说法。

**条目是有序表，不是按名字建的字典。**这一页 406 行里有 2 对同名不同物
（「渗透」两条，一条讲手雷技能一条讲职业技能，图标与正文都不同），名字当不了
主键。顺序也是页面的一部分，字典存不下。

**值存源稿原文**，带 {token|…} 与格内换行 \\\\：页面要能从记录逐字重建。
着色标记是人对这一处语义的判断记录（「重击」6 处是电弧星相、68 处是刀剑重击），
不是排版脏东西，剥掉就丢了信息。

不随语言变的字段（icon）留在条目根上，语言相关的进 i18n.<语言>。
"""

import argparse
import json
import os
import re
import sys

import markup
import shell
from markup import die

# 人写层落在 references/ 下：那里就是「入库的源稿」，而这一层正是源稿。
# 放仓库根上还会让目录名盖住 tools/research.py（命名空间包），import 撞车。
DIR = os.path.join(shell.ROOT, 'references', 'research')
ZH = 'zh-CN'
# 不随语言变的字段名。其余一律进 i18n.<语言>。
PLAIN = frozenset({'icon'})
ICON_SRC = re.compile(r'!\[\]\(([^)]+)\)')
RULE_LINE = re.compile(r'^\|[\s:|-]+\|$')
SECTION = re.compile(r'^##\s+(.+?)\s*$')
# 表内横幅行 `| == 近战技能 == |`。与 convert-doc.lane_of() 同一条判据。
LANE = re.compile(r'^==\s*(.+?)\s*==$')


def path(page):
    return os.path.join(DIR, page.replace('/', '__') + '.json')


def read(page):
    """这一页的人写层。没有就返回 None——还没迁过来的页走老路。"""
    p = path(page)
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def must_read(page):
    """这一页的人写层，读不到即中止。与 pagedex.must_read() 一个规矩。"""
    got = read(page)
    if got is None:
        die('还没有人写层：%s' % os.path.relpath(path(page), shell.ROOT))
    return got


def write(page, columns, entries):
    """落盘。条目一行一条：改一条 git 只标一行，人读得动，diff 也读得动。"""
    os.makedirs(DIR, exist_ok=True)
    body = ',\n'.join('    %s' % json.dumps(e, ensure_ascii=False, sort_keys=True)
                      for e in entries)
    heads = ',\n'.join('    %s' % json.dumps(c, ensure_ascii=False) for c in columns)
    text = ('{\n  "page": %s,\n  "columns": [\n%s\n  ],\n  "entries": [\n%s\n  ]\n}\n'
            % (json.dumps(page, ensure_ascii=False), heads, body))
    with open(path(page), 'w', encoding='utf-8') as f:
        f.write(text)
    return os.path.getsize(path(page))


def pages():
    """有人写层的那些页，按页名排。"""
    if not os.path.isdir(DIR):
        return []
    return sorted(n[:-len('.json')].replace('__', '/')
                  for n in os.listdir(DIR) if n.endswith('.json'))


def numbered(page):
    """[(条目, 它在文件里的行号)]。

    write() 保证一条一行，所以行号按行数即可；着色闸门要拿它报错，报到条目上
    才找得回来——报「第 3 条」对着一份 406 条的文件没有用。
    """
    with open(path(page), encoding='utf-8') as f:
        lines = f.read().split('\n')
    out, got = [], must_read(page)
    at = {}
    for i, line in enumerate(lines, start=1):
        body = line.strip().rstrip(',')
        if body.startswith('{') and body.endswith('}'):
            at.setdefault(body, []).append(i)
    for e in got['entries']:
        body = json.dumps(e, ensure_ascii=False, sort_keys=True)
        rows = at.get(body) or []
        out.append((e, rows.pop(0) if rows else 0))
    return out


def prose(entry, lang=ZH):
    """这一条里该参与着色的字段。

    name 那一格不参与：它有结构身份（行标题），和 markdown 那一侧
    row_title_end() 跳过首格是同一条规矩，着进去等于把名字改了。
    """
    return [(k, v) for k, v in sorted(((entry.get('i18n') or {}).get(lang) or {}).items())
            if k != 'name' and isinstance(v, str)]


def field(entry, name, lang=ZH):
    """条目的某个字段。不随语言变的在根上，其余在 i18n.<语言> 里。"""
    if name in PLAIN:
        return entry.get(name) or ''
    return ((entry.get('i18n') or {}).get(lang) or {}).get(name) or ''


def put(entry, name, value, lang=ZH):
    if name in PLAIN:
        entry[name] = value
    else:
        entry.setdefault('i18n', {}).setdefault(lang, {})[name] = value


def icon_paths(cell):
    """图标那一格里引到的图，按出现顺序。

    **格子存原文，不拆成路径。**站内那一列有四种形状：{ico|![](…)}（3044 处）、
    {ico2|…}、{ico4|…}，以及裸的 ![](…)。拆开存等于挑一种当唯一形状，另外三种
    要么丢信息要么要额外记一位；存原文则往返天然逐字节相同，要路径的在这里取。
    """
    return ICON_SRC.findall(cell or '')


def split(line):
    """表格行 → 每一格的原文。不是表格行返回 None。"""
    got = markup.cells(line)
    return None if got is None else [line[a:b] for a, b in got]


def source(page):
    """一篇资料页源稿的完整正文：盘上那份 + 人写层补回去的行。

    **凡是要读行内容的地方都走这里。**源稿瘦身之后，直接 open() 读到的只有分节与
    表头；漏一处的症状都不是报错，而是那一处静默地当这一页没有行——跨页链接丢掉
    ?q=、复刻消歧掉到末档选错版本、词表少收一批 Perk 名。只读页面头部键
    （路径／更新／卡片／数据源／鸣谢）的地方不必走这里，那些键还在盘上那份里。
    """
    path = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
    with open(path, encoding='utf-8') as f:
        return inject(f.read(), page)


def tables(lines):
    """文档里每张表的 (表头行号, 表头各格)，按出现顺序。

    **表按序号定位，不按分节名。**一节里可以有好几张表（棱镜页每个职业三张），
    分节标题里还可能带图；名字当不了坐标，序号可以。
    """
    out = []
    for i, line in enumerate(lines[:-1]):
        if not RULE_LINE.match(lines[i + 1].strip()):
            continue
        head = split(line)
        if head is not None:
            out.append((i, head))
    return out


def inject(md, page):
    """把人写层的条目补回源稿的表里。

    源稿留的是分节、表头与页面元信息，行的内容在人写层。补回来之后交给现有的
    render_table，**产出因此与迁移前逐字节相同是构造性的**，不靠事后比对。

    条目按 table 序号落回它那张表，顺序即人写层里的顺序。横幅行（`| == 组名 == |`）
    也是行，照样按序回去。
    """
    got = read(page)
    if got is None:
        return md
    columns = got['columns']
    lines = md.split('\n')
    heads = tables(lines)
    rows = {}
    for e in got['entries']:
        rows.setdefault(e['table'], []).append(e)
    if len(columns) != len(heads):
        die('%s 的人写层登记了 %d 张表，源稿里有 %d 张'
            % (page, len(columns), len(heads)))
    stray = sorted(set(rows) - set(range(len(heads))))
    if stray:
        die('%s 的人写层指到第 %s 张表，源稿里只有 %d 张'
            % (page, '、'.join(map(str, stray)), len(heads)))

    out, at = [], {i: n for n, (i, _) in enumerate(heads)}
    for i, line in enumerate(lines):
        out.append(line)
        if i == 0 or i - 1 not in at:
            continue
        n = at[i - 1]
        head = heads[n][1]
        want = [c for c, _ in columns[n]]
        if want != head:
            die('%s 第 %d 张表的表头与人写层登记的对不上：\n  源稿 %s\n  登记 %s'
                % (page, n, ' | '.join(head), ' | '.join(want)))
        for e in rows.get(n) or ():
            if 'banner' in e:
                out.append('| %s |' % e['banner'])
                continue
            out.append('| %s |' % ' | '.join(field(e, f) for _, f in columns[n]))
    return '\n'.join(out)


# 列名 → 字段名。只有这三个另起名字，其余用列名本身。
RENAME = {'图标': 'icon', '说明': 'realgame_details'}


def fields_of(head):
    """表头各格 → 各自的字段名。

    重名列加序号后缀：异域护甲页有一张 `左栏|图标|说明|右栏|图标|说明`，一行摆
    两件东西。不加后缀，后三格会盖掉前三格，一行两件变成同一件画两遍。
    """
    out, seen = [], {}
    for col in head:
        name = 'name' if col == head[0] else RENAME.get(col, col)
        seen[name] = seen.get(name, 0) + 1
        out.append(name if seen[name] == 1 else '%s#%d' % (name, seen[name]))
    return out


def where_of(page):
    """页面的产出目录。「路径：」把它挂到子目录里，缺省就是 slug 本身。

    与 convert-doc.where_of() 同一条判据；戳号器按目录取槽位，取错了整页戳空。
    """
    src = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
    with open(src, encoding='utf-8') as f:
        got = re.search(r'^路径：(.*)$', f.read(), re.M)
    return got.group(1).strip() if got else page


def extract(page, stamp):
    """源稿的表 → 人写层，并把源稿瘦成「分节 + 表头 + 页面元信息」。

    stamp 是 resolve.stamper(产出目录) 给的戳号器，按行标题定这一行落在哪几个
    主键上。**戳出来就存下来**：分不出的那几处要人改，改在数据里比改在脚本里好。
    """
    src = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
    with open(src, encoding='utf-8') as f:
        lines = f.read().split('\n')
    heads = tables(lines)
    at = {i: n for n, (i, _) in enumerate(heads)}

    columns, entries, thin, sec, head, table = [], [], [], '', None, -1
    for i, line in enumerate(lines):
        m = SECTION.match(line)
        if m:
            sec = m.group(1)
        if i in at:
            table, head = at[i], heads[at[i]][1]
            columns.append([[c, f] for c, f in zip(head, fields_of(head))])
            thin.append(line)
            continue
        cells = split(line)
        if cells is None or RULE_LINE.match(line.strip()) or head is None:
            thin.append(line)
            continue
        lane = LANE.match(cells[0]) if len(cells) == 1 else None
        if lane:
            # 横幅行也是行，按序收进来；它没有格，只有组名。
            entries.append({'table': table, 'kind': sec, 'banner': cells[0]})
            continue
        if len(cells) != len(head):
            die('%s「%s」有一行 %d 格，表头是 %d 格：%r'
                % (page, sec, len(cells), len(head), cells[0][:30]))
        entry = {'table': table, 'kind': sec}
        for name, text in zip(fields_of(head), cells):
            put(entry, name, text)
        # 没有槽位限定的那几页（buff-debuffs、ability-cooldown）没有戳号器，
        # 行标题落不到主键上是这几页的常态，不是错。
        got = stamp(markup.text_of(cells[0], collapse=True)) if stamp else None
        if got:
            entry['members'] = [int(h) for h in got if h.isdigit()]
            other = [h for h in got if not h.isdigit()]
            if other:
                entry['keys'] = other
        entries.append(entry)
    size = write(page, columns, entries)
    with open(src, 'w', encoding='utf-8') as f:
        f.write('\n'.join(thin))
    return len(entries), size


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--extract', metavar='SLUG', help='源稿的表 → 人写层，源稿就地瘦身')
    a = ap.parse_args()
    if not a.extract:
        ap.print_help()
        return 0
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    n, size = extract(a.extract, resolve.stamper(where_of(a.extract)))
    print('references/research/%s.json  %d 条  %.1f KB'
          % (a.extract, n, size / 1024))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
