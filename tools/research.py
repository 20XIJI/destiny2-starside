#!/usr/bin/env python3
"""人写层：站内实测出来的东西，以及它落在哪几个主键上。

事实层（data/manifest/）是 Bungie 说的，这一层是我们测的。两边按主键合成
data/entities/，那一份是产物。**人只编辑这一层。**

一页一份 references/research/<页>.json：

    {
      "page": "weapon-perks",
      "columns": {"PERK": "name", "图标": "icon", "说明": "realgame_details",
                  "来源": "来源"},
      "entries": [
        {"kind": "武器 PERK",
         "members": [2679249093, 788178929],
         "icon": "icons/ff23ad5551.webp",
         "i18n": {"zh-CN": {"name": "雪上加霜",
                            "realgame_details": "命中 12 {enh|↑10} 颗弹丸时：\\\\…"}}}
      ]
    }

三件事值得先说清楚。

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
ICON_CELL = re.compile(r'^\{ico\|!\[\]\((.+)\)\}$')
RULE_LINE = re.compile(r'^\|[\s:|-]+\|$')
SECTION = re.compile(r'^##\s+(.+?)\s*$')


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
    text = ('{\n  "page": %s,\n  "columns": %s,\n  "entries": [\n%s\n  ]\n}\n'
            % (json.dumps(page, ensure_ascii=False),
               json.dumps(columns, ensure_ascii=False),
               body))
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


def to_cell(entry, name, lang=ZH):
    """字段 → 源稿里那一格的原文。图标那一格要把 {ico|![]()} 的壳套回去。"""
    got = field(entry, name, lang)
    return '{ico|![](%s)}' % got if name == 'icon' and got else got


def from_cell(name, text):
    """源稿里那一格的原文 → 字段值。"""
    if name != 'icon':
        return text
    m = ICON_CELL.match(text)
    if not m:
        die('图标那一格不是 {ico|![](…)} 的形状：%r' % text[:60])
    return m.group(1)


def split(line):
    """表格行 → 每一格的原文。不是表格行返回 None。"""
    got = markup.cells(line)
    return None if got is None else [line[a:b] for a, b in got]


def inject(md, page):
    """把人写层的条目补回源稿的表里。

    源稿留的是分节、表头与页面元信息，行的内容在人写层。补回来之后交给现有的
    render_table，**产出因此与迁移前逐字节相同是构造性的**，不靠事后比对。

    行按 kind 落进同名的那个分节，顺序即人写层里的顺序。
    """
    got = read(page)
    if got is None:
        return md
    columns = got['columns']
    lanes = {}
    for e in got['entries']:
        lanes.setdefault(e['kind'], []).append(e)

    out, lines, sec = [], md.split('\n'), ''
    used = set()
    for i, line in enumerate(lines):
        out.append(line)
        m = SECTION.match(line)
        if m:
            sec = m.group(1)
            continue
        # 分隔行的上一行是表头：在分隔行之后把这一节的行补进去。
        if not RULE_LINE.match(line.strip()) or i == 0:
            continue
        head = split(lines[i - 1])
        if head is None:
            continue
        miss = [c for c in head if c not in columns]
        if miss:
            die('%s「%s」的表头有没登记的列：%s\n'
                '  references/research/%s.json 的 columns 里加上它们'
                % (page, sec, '、'.join(miss), page.replace('/', '__')))
        if sec in used:
            die('%s 的「%s」出现了两次表头，人写层分不出行该落哪一张表' % (page, sec))
        used.add(sec)
        for e in lanes.get(sec) or ():
            out.append('| %s |' % ' | '.join(to_cell(e, columns[c]) for c in head))
    stray = sorted(set(lanes) - used)
    if stray:
        die('%s 的人写层里有这些分节，源稿里却没有同名的表：%s' % (page, '、'.join(stray)))
    return '\n'.join(out)


# 列名 → 字段名。只有这三个另起名字，其余用列名本身。
RENAME = {'图标': 'icon', '说明': 'realgame_details'}


def field_of(col, first):
    return 'name' if col == first else RENAME.get(col, col)


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

    columns, entries, thin, sec, head = {}, [], [], '', None
    for i, line in enumerate(lines):
        m = SECTION.match(line)
        if m:
            sec, head = m.group(1), None
            thin.append(line)
            continue
        cells = split(line)
        if cells is None:
            thin.append(line)
            continue
        if i + 1 < len(lines) and RULE_LINE.match(lines[i + 1].strip()):
            head = cells
            for c in cells:
                columns[c] = field_of(c, cells[0])
            thin.append(line)
            continue
        if RULE_LINE.match(line.strip()) or head is None:
            thin.append(line)
            continue
        if len(cells) != len(head):
            die('%s「%s」有一行 %d 格，表头是 %d 格：%r'
                % (page, sec, len(cells), len(head), cells[0][:30]))
        entry = {'kind': sec}
        for col, text in zip(head, cells):
            put(entry, field_of(col, head[0]), from_cell(field_of(col, head[0]), text))
        got = stamp(markup.text_of(cells[0], collapse=True))
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
