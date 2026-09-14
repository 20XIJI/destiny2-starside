#!/usr/bin/env python3
"""内容层迁移：配装源稿 markdown ⇄ 结构化记录。

用法：
    python3 tools/migrate.py --check          # 全部源稿跑一遍来回，逐字节比对
    python3 tools/migrate.py --check <文件>    # 只跑一篇，不等时打印差异

**验收靠反向序列化**：解析成记录再写回 markdown，与原文逐字节相同才算这个 schema
没丢东西。不等就报出，不放过。这套手法照搬各生成器已有的逐字保真闸门。

记录用中文键，与源稿逐条对得上：键名即源稿那一行的键，读 JSON 的人不必先学一套
英文对照。多值字段（碎片、模组、护甲每个部位）切成数组，传说武器切成
{名字, 词条} 一对；能切开又拼得回去，才证明切法没丢信息。

合集一个文件几套：`成员` 是成员记录的数组，头部键由整份共用的那几个补齐，
与 convert-build.py 的 solo_src() 同一条规矩。
"""

import argparse
import json
import os
import re
import sys

import markup
import shell
from markup import die, must

SRC_DIR = shell.BUILD_DIR

# 头部键，顺序即写回时的顺序。
HEAD_KEYS = ('合集', '推荐人', '描述', '更新', '场景', '标签', '分支', '强度', '核心')

# 分节 → 这一节里允许出现的槽位键，顺序即写回顺序。空表示这一节是散文。
SECTIONS = (
    ('审核意见', ()),
    ('合集介绍', ()),
    ('职业', ('职业', '超能', '星相', '碎片', '手雷', '近战', '移动', '职业技能')),
    ('武器', ('异域武器', '传说武器')),
    ('护甲', ('异域护甲', '套装', '头盔', '护臂', '胸甲', '腿部', '职业物品')),
    ('神器', ('神器', '模组')),
    ('六维', ('六维',)),
    ('注解', ()),
)
SECT_KEYS = dict(SECTIONS)

# 切成数组的键。传说武器另有一套切法（枪名 | 词条、词条），单独处理。
MULTI = frozenset({'星相', '碎片', '手雷', '近战', '职业技能', '移动', '模组',
                   '头盔', '护臂', '胸甲', '腿部', '职业物品', '场景', '标签'})
GUN = '传说武器'
# 推荐人一行一个，名字与链接用 | 分开。
PEOPLE = '推荐人'

KEY_LINE = re.compile(r'^([^：\n]+)：(.*)$')


def split_set(md):
    """合集切成 [整份头部, 成员一, 成员二…]。判据与 convert-build.split_set 同一条。"""
    parts = re.split(r'^# ', md, flags=re.M)
    return [p for p in parts if p.strip()]


def parse_block(text):
    """一套配装（或合集的整份头部）→ 记录。text 不含开头的「# 」。"""
    head, _, rest = text.partition('\n')
    rec = {'标题': head.strip()}
    body = rest
    cut = body.find('\n## ')
    front, sections = (body[:cut], body[cut:]) if cut >= 0 else (body, '')
    for line in front.split('\n'):
        m = KEY_LINE.match(line)
        if not m:
            if line.strip():
                die('头部有一行既不是键值也不是空行：%r' % line)
            continue
        key, val = m.group(1), m.group(2).strip()
        if key not in HEAD_KEYS:
            die('头部出现没登记的键「%s」' % key)
        if key == PEOPLE:
            rec.setdefault(key, []).append(val)
        elif key in MULTI:
            rec[key] = [x.strip() for x in val.split('、') if x.strip()]
        else:
            rec[key] = val
    for chunk in sections.split('\n## ')[1:]:
        name, _, content = chunk.partition('\n')
        name = name.strip()
        keys = SECT_KEYS.get(name)
        if keys is None:
            die('出现没登记的分节「%s」' % name)
        rec.setdefault('节', {})[name] = (
            parse_fields(content, name, keys) if keys else prose(content).rstrip('\n'))
    return rec


def prose(text):
    """散文原样存一个字段，连空白一起。

    **不按空行分段**：源稿里有只含空格的行，也有连着两个空行，按空行切再拼回去
    会把它们抹平。分段是渲染时的事，`convert-build.prose()` 已经在做。"""
    return text[1:] if text.startswith('\n') else text


def parse_fields(text, sect, keys):
    out = {}
    for line in text.split('\n'):
        if not line.strip():
            continue
        m = must(KEY_LINE.match(line),
                 '「%s」一节里有一行不是键值：%r' % (sect, line))
        key, val = m.group(1), m.group(2).strip()
        if key not in keys:
            die('「%s」一节里出现没登记的键「%s」' % (sect, key))
        if key == GUN:
            gun, _, perks = val.partition('|')
            out.setdefault(key, []).append(
                {'名字': gun.strip(),
                 '词条': [x.strip() for x in perks.split('、') if x.strip()]})
        elif key in MULTI:
            out[key] = [x.strip() for x in val.split('、') if x.strip()]
        else:
            out[key] = val
    return out


def parse(md):
    parts = split_set(md.lstrip('\n'))
    if not parts:
        die('源稿是空的')
    first = parse_block(parts[0])
    if len(parts) > 1:
        first['成员'] = [parse_block(p) for p in parts[1:]]
    return first


def flat(rec):
    """记录 → {键: 值} 的扁平视图。

    32 个键跨分节零重名（107 篇源稿实测），所以摊平不会撞；摊平之后取值的人不必
    先知道「碎片」写在哪一节里。散文分节按分节名做键。
    """
    out = {k: v for k, v in rec.items() if k in HEAD_KEYS}
    for name, node in (rec.get('节') or {}).items():
        if isinstance(node, dict):
            out.update(node)
        else:
            out[name] = node
    return out


def load(path):
    """读一篇结构化源稿。坏掉的 JSON 当场报出文件名——生成器一次跑一百多篇，
    只说「第几个字符」找不着是哪一篇。"""
    with open(path, encoding='utf-8') as f:
        try:
            return json.load(f)
        except ValueError as e:
            die('%s 不是合法的结构化源稿：%s' % (os.path.basename(path), e))


def dump(rec):
    """规范化 JSON：稳定键序、稳定缩进。库里存的是这份文本，整篇 sha1 的三方比
    因此仍然成立——同一份记录任何时候都序列化成同样的字节。"""
    return json.dumps(rec, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


# ── 写回 ──────────────────────────────────────────────────────────────


def join(key, val):
    if key == GUN:
        return ['%s：%s' % (key, g['名字'] + (' | ' + '、'.join(g['词条'])
                                             if g['词条'] else ''))
                for g in val]
    if key == PEOPLE:
        return ['%s：%s' % (key, v) for v in val]
    if isinstance(val, list):
        return ['%s：%s' % (key, '、'.join(val))]
    return ['%s：%s' % (key, val)]


def write_block(rec):
    out = ['# %s' % rec['标题'], '']
    for key in HEAD_KEYS:
        if key in rec:
            out += join(key, rec[key])
    for name, keys in SECTIONS:
        node = (rec.get('节') or {}).get(name)
        if node is None:
            continue
        out += ['', '## %s' % name, '']
        if keys:
            for key in keys:
                if key in node:
                    out += join(key, node[key])
        else:
            out.append(node)
    return '\n'.join(out)


def write(rec):
    body = write_block(rec)
    for member in rec.get('成员') or ():
        body += '\n\n' + write_block(member)
    return body + '\n'


# ── 资料页分类 ────────────────────────────────────────────────────────

# 行标题上的装饰：神器模组页写「### 一级 · 名称」，技能冷却页写「**闪电手雷**」，
# 两者都不是名字的一部分。
TIER_TAIL = re.compile(r'^[一二三]级\s*·\s*')
BOLD = re.compile(r'\*\*([^*]+)\*\*')
SEPARATOR = re.compile(r'^\|[\s|:-]+\|?\s*$')


def row_title(cell):
    text = TIER_TAIL.sub('', strip_markup(cell).replace(markup.CELL_BREAK, '').strip())
    hit = BOLD.fullmatch(text)
    return (hit.group(1) if hit else text.replace('**', '')).strip()


def strip_markup(text):
    for _ in range(4):
        text = re.sub(r'\{[\w-]+\|([^{}]*)\}', r'\1', text)
    return re.sub(r'!\[\]\([^)]*\)', '', text).strip()


def row_titles(path):
    """一页里所有行标题。

    **表头按结构认，不按名字认**：下一行是 `|---|` 的那一行就是表头。列名各页不同
    （「武器」「名字」「PERK」「光等差」），列一张名单永远漏，而分隔行的位置是确定的。"""
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    out = []
    for i, line in enumerate(lines):
        if line.startswith('### '):
            out.append(row_title(line[4:]))
            continue
        spans = markup.cells(line)
        if not spans or len(spans) < 2:
            continue
        if i + 1 < len(lines) and SEPARATOR.match(lines[i + 1]):
            continue
        name = row_title(line[spans[0][0]:spans[0][1]])
        if not name or name.startswith('==') or set(name) <= set('-'):
            continue
        out.append(name)
    return out


def classify():
    """哪些资料页该转成结构化记录。**判据是机械的**：行标题能落到事实层的主键上
    就结构化，否则继续 markdown。不靠人逐篇拍板，加一页也不必回来登记。"""
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    composite, effects = resolve.variants(), resolve.effects()
    sources, hints = resolve.set_sources(), resolve.source_hints()

    known = {resolve.norm(v['n']['zh']) for v in facts.items.values()}
    known |= {resolve.norm(v['n']['zh']) for v in facts.effects.values()}
    known |= {resolve.norm(v['n']['zh']) for v in facts.stats.values()}
    known |= {resolve.set_key(s['name']['zh']) for s in facts.sets.values()}

    def lands(name, page):
        """这个名字落不落得到主键上。

        有范围定义的页走解析器那一条，别名、派生、复刻消歧都算数；没有范围定义的
        页（刷取清单、传说武器榜、技能冷却这些不进配装词表的）只问「这个名字在
        事实层里存不存在」——分类要判的是「行标题是不是具名实体」，范围收窄是
        精化，不是前提。"""
        if page in resolve.SCOPES:
            # 主键那一位传空：分类要判的是「这个名字解析得出来吗」，此时页面还
            # 没生成，索引里也就还没有它戳上的那一位。
            where, _ = resolve.classify(facts, name, page, '', composite, effects,
                                        sources, hints)
            return where in ('物品', '套装', '来源别名', '效果', '派生', '待指定')
        return resolve.norm(name) in known or resolve.set_key(name) in known

    docs = os.path.join(shell.ROOT, 'references', 'docs')
    paths = [os.path.join(docs, f) for f in sorted(os.listdir(docs)) if f.endswith('.md')]
    paths += [os.path.join(shell.ROOT, 'references', f)
              for f in ('artifact-mods.md', 'armor-sets.md')]
    rows = []
    for path in paths:
        slug = os.path.basename(path)[:-3]
        # 六个元素页在词表里挂在 elements/ 下，别处按文件名即页名。
        page = ('elements/%s' % slug) if 'elements/%s' % slug in resolve.SCOPES else slug
        names = row_titles(path)
        hit = sum(1 for n in names if lands(n, page))
        rows.append((slug, len(names), hit))

    groups = {'结构化': [], 'markdown': [], '无表格行': []}
    for name, total, hit in rows:
        where = ('无表格行' if not total
                 else '结构化' if 100 * hit / total >= 50 else 'markdown')
        groups[where].append((name, total, hit))
    for where in ('结构化', 'markdown', '无表格行'):
        got = groups[where]
        print('%s %d 篇' % (where, len(got)))
        for name, total, hit in sorted(got, key=lambda r: -(r[2] / r[1] if r[1] else 0)):
            pct = ('%5.1f%%' % (100 * hit / total)) if total else '    —'
            print('    %-22s %4d 行，命中 %4d %s' % (name, total, hit, pct))
    return 0


# ── 验收 ──────────────────────────────────────────────────────────────


def sources():
    for season in sorted(os.listdir(SRC_DIR)):
        root = os.path.join(SRC_DIR, season)
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            if name.endswith('.json'):
                yield os.path.join(root, name)


def check(only=None):
    """记录 → markdown → 记录，一圈回来必须是同一条记录。

    markdown 那一步是**导出格式**：填表页导出的文本要能粘回去。这一条守的是那条
    往返不丢东西——多值切得开又拼得回、散文连空白一起原样。"""
    bad, n = [], 0
    for path in sources():
        if only and only not in path:
            continue
        n += 1
        want = load(path)
        try:
            got = parse(write(want))
        except SystemExit as e:
            bad.append((path, str(e)))
            continue
        if got != want:
            bad.append((path, first_diff(dump(want), dump(got))))
    print('配装源稿 %d 篇，导出再读回仍是同一条记录 %d 篇，不等 %d 篇'
          % (n, n - len(bad), len(bad)))
    for path, why in bad[:12]:
        print('  %s\n      %s' % (os.path.relpath(path, shell.ROOT), why))
    return 1 if bad else 0


def first_diff(want, got):
    a, b = want.split('\n'), got.split('\n')
    for i in range(max(len(a), len(b))):
        x = a[i] if i < len(a) else '（没有这一行）'
        y = b[i] if i < len(b) else '（没有这一行）'
        if x != y:
            return '第 %d 行\n      原稿 %r\n      写回 %r' % (i + 1, x, y)
    return '长度不同'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true', help='记录→markdown→记录 的回环')
    ap.add_argument('--classify', action='store_true', help='资料页该结构化还是留 markdown')
    ap.add_argument('only', nargs='?', help='只跑文件名含这一段的那些')
    a = ap.parse_args()
    if a.classify:
        return classify()
    if not a.check:
        ap.error('要做什么？--check 跑回环比对，--classify 给资料页分类')
    return check(a.only)


if __name__ == '__main__':
    sys.exit(main())
