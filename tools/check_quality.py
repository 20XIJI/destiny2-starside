#!/usr/bin/env python3
"""离线回归：部署闸门、审核删除三方比、配装生成生命周期、装备库。

python3 tools/check_quality.py
只用标准库；真实入口搭配内存 API/命令替身，全部写入独占 TemporaryDirectory。
不读取令牌、不连接网络。生成器只替换资料词表来源，渲染与落盘走实码。
唯一的子进程是 WeaponPage 起的一次 node：把 weapons/app.js 的属性函数抠出来，
与 facts.shown() 逐值比。
"""
import base64
import collections
import copy
from email.message import Message
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import check_terms
import facts
import items
import markup
import rows
import migrate
import shell

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, TOOLS / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build_terms = load('quality_build_terms', 'build-terms.py')
deploy = load('quality_deploy', 'deploy.py')
sync = load('quality_sync', 'sync.py')
build = load('quality_build', 'convert-build.py')
doc = load('quality_doc', 'convert-doc.py')
weapons = load('quality_weapons', 'build-weapons.py')
build_home = load('quality_build_home', 'build-home.py')


def forbidden(*args, **kwargs):
    raise AssertionError('离线回归触发了未声明的外部动作：%r %r' % (args, kwargs))


class Isolated(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory(prefix='starside-quality-'))).resolve()
        self.output = io.StringIO()
        self.stack.enter_context(redirect_stdout(self.output))
        self.stack.enter_context(patch.object(socket.socket, 'connect', forbidden))
        self.stack.enter_context(patch.object(urllib.request, 'urlopen', forbidden))
        self.stack.enter_context(patch.object(subprocess, 'run', forbidden))
        self.stack.enter_context(patch.object(sync, 'token', forbidden))

    def replace(self, obj, name, value):
        return self.stack.enter_context(patch.object(obj, name, value))

    def file(self, path, text):
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding='utf-8')
        return dest

    def exits(self, call):
        with self.assertRaises(SystemExit) as caught:
            call()
        self.assertNotIn(caught.exception.code, (0, None))
        return str(caught.exception.code)


class Entrypoints(Isolated):
    def test_help_and_invalid_options_have_no_side_effects(self):
        search = load('quality_search', 'build-search.py')
        terms = load('quality_terms', 'build-terms.py')
        wpn = load('quality_weapons_cli', 'build-weapons.py')
        self.replace(deploy, 'ROOT', self.root)
        self.replace(deploy, 'git', forbidden)
        self.replace(search.shell, 'pages', forbidden)
        self.replace(terms, 'build', forbidden)
        self.replace(wpn, 'build', forbidden)
        for module, cases in (
            (deploy, [('--help', 0), ('--dryrun', 2), ('--all --pruen', 2),
                      ('--check --all', 2), ('--prune', 2), ('--dry', 2), ('extra', 2)]),
            (search, [('--help', 0), ('--dry-run', 2)]),
            (terms, [('--help', 0), ('--dry-run', 2)]),
            (wpn, [('--help', 0), ('--dry-run', 2), ('extra', 2)]),
        ):
            sentinel = self.file('output.js', 'unchanged')
            before = sentinel.stat().st_mtime_ns
            if hasattr(module, 'OUT'):
                self.replace(module, 'OUT', str(sentinel))
            for args, code in cases:
                with self.subTest(module=module.__name__, args=args):
                    self.replace(sys, 'argv', [module.__name__, *args.split()])
                    with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                        module.main()
                    self.assertEqual(caught.exception.code, code)
                    self.assertEqual(sentinel.read_text(), 'unchanged')
                    self.assertEqual(sentinel.stat().st_mtime_ns, before)


class ExcelSafety(Isolated):
    def test_preflight_never_requires_third_party_imports(self):
        import builtins
        original = builtins.__import__

        def guarded(name, *args, **kw):
            if name.startswith(('openpyxl', 'PIL')):
                raise AssertionError('preflight imported ' + name)
            return original(name, *args, **kw)

        self.replace(builtins, '__import__', guarded)
        excel = load('quality_excel', 'json2xlsx.py')
        with self.assertRaises(SystemExit) as caught:
            excel.main(['json2xlsx.py', '--help'])
        self.assertEqual(caught.exception.code, 0)
        src = self.file('sheet.json', '{"rows":[]}')
        out = self.file('sheet.xlsx', 'human work')
        hard = self.root / 'hard.xlsx'
        os.link(src, hard)
        link = self.root / 'link.xlsx'
        link.symlink_to(src)
        for dest, force in ((out, False), (src, False), (src, True),
                            (hard, True), (link, True), (self.root, True),
                            (self.root / 'missing/out.xlsx', False)):
            with self.subTest(dest=dest, force=force), redirect_stderr(io.StringIO()):
                self.exits(lambda: excel.main(['json2xlsx.py', str(src), str(dest),
                                              *(['--force'] if force else [])]))
                self.assertEqual(src.read_text(), '{"rows":[]}')
                self.assertEqual(out.read_text(), 'human work')


class EditAnchors(unittest.TestCase):
    """产出上那个 data-src 必须指得回一篇真源稿。

    `edit.js` 拿它当库里的 `_id` 去取正文（`pend` 带 md 那一路），而 `_id` 的算法
    是 `sync.py` 的 `id_of()`：`references/` 下的相对路径去掉 `.md`。

    配装那一支踩过一次：产出目录是 `builds/s29/`，源稿目录却是
    `builds/s29-凯旋纪念碑/`，`data-src` 一度写成前者。症状是站上一切正常、三道闸门
    全绿，只有点开「编辑」那一下取回一份空正文——而那个失败当时抛在 `.then` 的成功
    回调里，chip 永远停在「载入中…」，一句话都不报。
    """

    SITE = TOOLS.parent / 'site'
    ANCHOR = re.compile(r'<main[^>]*\sdata-src="([^"]*)"')

    def test_every_data_src_resolves_to_a_source_file(self):
        seen = 0
        for page in sorted(self.SITE.rglob('index.html')):
            hit = self.ANCHOR.search(page.read_text(encoding='utf-8'))
            if not hit:
                continue
            seen += 1
            doc = hit.group(1)
            # 换算走 sync.path_of()，不在这里另写一份：这条断言要证的就是
            # data-src 与 id_of() 那条算法对得上，自己再推一遍等于跟自己的副本对账。
            with self.subTest(page=str(page.relative_to(self.SITE))):
                self.assertTrue(os.path.isfile(sync.path_of(doc)),
                                'data-src=%r 指不到 references/%s.md' % (doc, doc))
        # 光「全都对得上」不够：正则一旦失配，零命中也是全绿。
        self.assertGreater(seen, 100, '带 data-src 的页面只有 %d 个，标记漏了？' % seen)


class MarkerIndex(unittest.TestCase):
    """`markup.Markers` 与「从命中处向前回扫」那个定义逐字等价。

    回扫是这条规则的**定义**，读起来一眼就对；索引是它的快法子，读起来不是。
    换过来的理由是回扫是文档长度的平方：闸门逐匹配调用它，同一份文本扫上千遍。
    带标记的合成语料上，旧版每翻一倍长度涨 4 倍、新版涨 2 倍，59 KB 那一档
    5591 ms → 4.3 ms。真实源稿快得多（`{` 密集，回扫很快就停），但同一篇资料页
    剥掉着色标记之后小了 40%、反而慢 16 倍——那正是「又长又还没跑过
    items.py --apply 的新稿」的样子，也就是这条路最该快的时候。

    定义原样留在这里当参照：快法子漂了，这里当场就红。
    """

    OPEN = re.compile(r'\{([\w-]+)\|')

    @classmethod
    def scan(cls, text, at):
        """回扫版，即 Markers 之前那一份实现，逐字保留。"""
        depth, i = 0, at - 1
        while i >= 0:
            if text[i] == '}':
                depth += 1
            elif text[i] == '{':
                if depth == 0:
                    m = cls.OPEN.match(text, i)
                    if not m:
                        return None
                    start = m.end()
                    j, d = start, 1
                    while j < len(text) and d:
                        d += text[j] == '{'
                        d -= text[j] == '}'
                        j += 1
                    return m.group(1), text[start:j - 1]
                depth -= 1
            i -= 1
        return None

    # 花括号能摆出的形状：空标记、嵌套、未闭合、不是标记的裸括号、多竖线、
    # 孤立的 `*`（神器模组页源稿里真有）。
    SHAPES = ['', '{', '}', '{}', '{a|x}', '{a|}', '{ }', '{a|{b|y}}', '{a|前{b|y}后}',
              '{a|x', '{未闭合', 'x}y', '{a|x}{b|y}', '{{a|x}}', '{a|{}}', '}{a|x',
              '{a-b|x}', '{a_b|x}', '{a b|x}', '{a|x}}', '{{', '}}', '{a||x}',
              '{a|{b|{c|z}}}', '呈 * 形释放 {orb|能量球} 与 {enemy|护甲充能}']

    def test_every_position_of_every_shape_agrees(self):
        for text in self.SHAPES:
            idx = markup.Markers(text)
            for at in range(len(text) + 1):
                with self.subTest(text=text, at=at):
                    self.assertEqual(idx.at(at), self.scan(text, at))

    # 语料按窗口切片比：形状取自真实源稿，代价有界。**参照那一份是平方的**，
    # 拿整篇跑就是让这条断言自己犯被修的那个毛病——它曾把 1 秒的套件拖到分钟级。
    # 切片顺带造出未闭合的括号，那是整篇里少见、而 Markers 必须处理对的形状。
    # 600 × 2 窗：17000 个比对点、约 0.2 秒。整篇跑是 1.8 秒，而这一套承诺「约 1 秒」。
    WINDOW = 600
    WINDOWS = 2

    def test_real_source_shapes_agree_window_by_window(self):
        seen = 0
        for src in sorted(TOOLS.parent.joinpath('references').rglob('*.md')):
            text = src.read_text(encoding='utf-8')
            for start in range(0, min(len(text), self.WINDOWS * self.WINDOW), self.WINDOW):
                chunk = text[start:start + self.WINDOW]
                if '{' not in chunk:
                    continue
                idx = markup.Markers(chunk)
                spots = set()
                for m in re.finditer(r'[{}|]', chunk):
                    spots.update(q for q in (m.start() - 1, m.start(), m.start() + 1)
                                 if 0 <= q <= len(chunk))
                for at in sorted(spots):
                    seen += 1
                    if idx.at(at) != self.scan(chunk, at):
                        self.fail('%s 第 %d 字节起那一窗 at=%d 索引与回扫不一致'
                                  % (src.name, start, at))
        # 光「全都对得上」不够：读不到源稿时零命中也是全绿。
        # 此刻 5579 个点：主键骨架那 23 篇几乎没有着色标记，点都在 docs/ 那几篇上。
        self.assertGreater(seen, 4500, '只比对了 %d 个括号边界点，语料没读到？' % seen)


class CellSplitting(unittest.TestCase):
    """切格只剩两份实现，跨语言那条缝由这些对语料的断言钉住。

    Python 是 markup.cells()，JS 是 admin/dialect.js（云函数那份是构建复制的）。
    两种语言没法共用源码，所以两份是下限。从前是六份，且**并不等价**：行首空白、
    缺末尾竖线、全角空格贴格边、`}` 深度可否为负、`{` 的判据，五处各有分歧。
    合并时五处各选了一种，选定的那一种与旧实现在全部语料上结果逐字相同。

    这里断言的是「源稿还落在两份都认的形状里」。踩线的那一行本地照常渲染成页面、
    闸门全绿，只有编辑台会静默定位不到：那一格永远改不了，报的还是「底稿已变，
    请回资料页重新提交」，而资料页永远是最新的。

    JS 那一份自己的行为由 check_quality.cjs 的同名一组管，那边不必起 Python。
    """

    ROOT = TOOLS.parent

    @classmethod
    def rows(cls):
        for path in sorted((cls.ROOT / 'references').rglob('*.md')):
            for n, line in enumerate(path.read_text(encoding='utf-8').split('\n'), 1):
                if line.lstrip().startswith('|'):
                    yield path.relative_to(cls.ROOT), n, line

    def test_corpus_stays_within_the_shape_both_implementations_agree_on(self):
        found = 0
        for where, n, line in self.rows():
            found += 1
            at = '%s:%d' % (where, n)
            self.assertFalse(line[:1].isspace(),
                             '%s 行首有空白：两份实现都会整行返回 None' % at)
            self.assertTrue(line.rstrip('\r').endswith('|'),
                            '%s 没有末尾竖线：JS 侧无条件砍掉最后一格，末格永远改不了' % at)
            self.assertNotIn('\\|', line, '%s 用了 \\| 转义：两份实现都不认它' % at)
            for edge in ('|\t', '\t|', '|\u3000', '\u3000|'):
                self.assertNotIn(edge, line,
                                 '%s 格边贴着制表符或全角空格：Python 的 strip() 剥它，JS 只剥半角' % at)

    def test_corpus_keeps_tint_braces_balanced(self):
        for where, n, line in self.rows():
            depth = 0
            for ch in line:
                depth += (ch == '{') - (ch == '}')
                self.assertGreaterEqual(
                    depth, 0,
                    '%s:%d 出现了孤立的 }：合并时选的是钳位那一种，'
                    '这一行的花括号本身写错了' % (where, n))
            self.assertEqual(depth, 0, '%s:%d 花括号没配平' % (where, n))

    def test_every_row_splits_into_at_least_one_cell(self):
        for where, n, line in self.rows():
            self.assertTrue(doc.split_cells(line), '%s:%d 切不出格' % (where, n))

    def test_the_scan_actually_found_the_corpus(self):
        # 语料挪走或者上面的判据写错时，前三条会变成"零行全过"的空转。
        # 主键骨架那 23 篇没有表格行（行写成主键），语料就是 docs/ 那 16 篇，
        # 此刻 2027 行；下限取 1800 留出编辑余量。
        self.assertGreater(sum(1 for _ in self.rows()), 1800)



class WeaponsExtras(unittest.TestCase):
    """装备库多出来的两块：护甲套装效果，与「用过它的配装」。

    后者按主键收——配装源稿主键化之后才做得到。按名字收会把同名不同物（故我在的
    狼群弹药与加拉尔号角的那一条）的配装混成一堆。
    """

    SITE = TOOLS.parent / 'site'

    def load(self, name, var):
        text = (self.SITE / 'weapons' / name).read_text(encoding='utf-8')
        return json.loads(text[len('window.%s = ' % var):].rstrip().rstrip(';'))

    def test_every_armor_set_is_there_with_both_effects(self):
        got = self.load('index.js', 'WPN')['t']
        self.assertEqual(len(got), 56, '护甲套装不是 56 套：%d' % len(got))
        for row in got:
            with self.subTest(set=row[1]):
                self.assertTrue(row[0].startswith('set:'), '%s 的主键不是 set: 那一种' % row[1])
                self.assertEqual([f[1] for f in row[7]], [2, 4],
                                 '%s 不是「2 件 + 4 件」两条效果' % row[1])
                for one in row[7]:
                    self.assertTrue(one[2], '%s 的效果没有图' % row[1])
                # 来源那一列写活动名，类型那一列写活动种类，56 套各写其一。
                self.assertTrue(row[3] or row[4], '%s 既没有来源也没有类型' % row[1])
        text = self.load('text.js', 'WPN_TEXT')
        self.assertEqual(len(text['st']), 56, '套装的详情正文条数对不上')

    def test_the_builds_that_used_it_land_on_real_cards(self):
        text = self.load('text.js', 'WPN_TEXT')
        index = self.load('index.js', 'WPN')
        cards = text['bdc']
        self.assertGreater(len(cards), 100, '配装卡只有 %d 张' % len(cards))
        live = ({str(r[0]) for r in index['w']} | {str(r[0]) for r in index['a']}
                | {str(r[0]) for r in index['t']})
        for key, ats in text['bd'].items():
            with self.subTest(key=key):
                self.assertIn(key, live, '%s 不是这一页上的一件东西' % key)
                for at in ats:
                    self.assertLess(at, len(cards), '卡片下标越界')
        # 卡片整段只存一份，主键那一侧记下标：直接存要多 33 KB gzip。
        self.assertEqual(len(cards), len({c for c in cards}), '卡片存了重复的')
        for card in cards:
            self.assertIn('class="entry"', card, '卡片不是配装推荐页那一张')
        sheet = (self.SITE / 'weapons' / 'index.html').read_text(encoding='utf-8')
        self.assertIn('.entries .entry {', sheet,
                      '页壳里没有内联配装卡的样式，那张卡会散架')


class BuildKeys(unittest.TestCase):
    """配装源稿的槽位值写成 `名字#主键`，**主键是唯一真相**。

    主键让站内改名不牵动源稿、同名不同物不必靠人写的消歧括注；代价是每一格都得
    有主键、且查得到——下面各一条。
    名字留作显示与人读 diff，对不上只报一行、不中止（vocab.NAME_DRIFT）。
    """

    SITE = TOOLS.parent / 'site'

    # 源稿的键 → 它查哪个槽位。护甲那五个部位查「护甲模组」，模组查「神器」。
    SLOT_OF = {'职业': '职业', '超能': '超能', '手雷': '手雷', '近战': '近战',
               '星相': '星相', '碎片': '碎片', '职业技能': '职业技能',
               '异域护甲': '异域护甲', '头盔': '护甲模组', '护臂': '护甲模组',
               '胸甲': '护甲模组', '腿部': '护甲模组', '职业物品': '护甲模组',
               '模组': '神器'}

    @staticmethod
    def lines():
        """每篇源稿写回 markdown 之后的每一行：`(篇名, 键, 值)`。

        走 write() 而不是直接读记录：那是导出格式，填表页与审核台看见的就是它。
        """
        sys.path.insert(0, str(TOOLS))
        import migrate
        for path in sorted(TOOLS.parent.glob('references/builds/*/*.json')):
            for line in migrate.write(migrate.load(str(path))).split('\n'):
                key, sep, val = line.partition('：')
                if sep and val.strip():
                    yield path.name, key.strip(), val.strip()

    def test_every_slot_value_carries_a_key(self):
        """一格一个主键。缺了就是旧格式混进来了，而两种写法并存时改一处就漏一处。"""
        sys.path.insert(0, str(TOOLS))
        import migrate
        bad = []
        for name, key, val in self.lines():
            if key not in self.SLOT_OF:
                continue
            for seg in val.split('、'):
                if migrate.MARK not in seg:
                    bad.append('%s｜%s：%s' % (name, key, seg))
        self.assertEqual(bad[:6], [], '%d 个槽位值没有主键' % len(bad))

    def test_a_shared_key_lands_on_the_row_its_own_section_names(self):
        """同一枚主键在一页上挂好几行时，按分节挑那一条。

        一枚神器模组挂在好几件神器下、档位与位置各不相同（群敌飞梭在好奇之器上是
        一级、在女王兰香炉上是三级）；一套护甲的 2 件与 4 件是同一枚 set: 主键。
        只按主键取第一条时，74 篇配装的神器模组链到了别的神器上，「埃希恩记忆
        2 件 × 4 件」画成了两个 2 件。
        """
        sys.path.insert(0, str(TOOLS))
        import migrate
        wrong_art, wrong_set = [], []
        for path in sorted(TOOLS.parent.glob('references/builds/*/*.json')):
            page = self.SITE / 'builds' / 's29' / path.stem / 'index.html'
            if not page.exists():
                continue
            html = page.read_text(encoding='utf-8')
            rec = migrate.load(str(path))
            arts = {((b.get('节') or {}).get('神器') or {}).get('神器')
                    for b in migrate.blocks(rec)} - {None}
            for mod, art in re.findall(
                    r'data-d="artifact-mods&#9;([^&]*)&#9;([^"]*?)(?: （[^"]*)?"', html):
                if arts and art not in arts:
                    wrong_art.append('%s｜%s 链到了 %s' % (path.stem, mod, art))
            # 名字与件数都比：一套的站内名与来源名（「埃希恩记忆」「玻璃拱顶」）共用
            # 一枚 set: 主键，按主键取第一条会把源稿写的那一个换成另一个。
            want = sorted('%s %s' % (x['名字'], x['件数']) for b in migrate.blocks(rec)
                          for x in ((b.get('节') or {}).get('护甲') or {}).get('套装') or ())
            got = sorted('%s %s' % m for m in re.findall(
                r'data-d="armor-sets&#9;([^&]*)&#9;([24] 件)"', html))
            # 页头那一行印的是职业名：职业那一格带着主键，原样印出来就是
            # 「猎人#row:elements/class-abilities/分节/猎人」。
            head = re.search(r'<p class="cls">(.*?)</p>', html, re.S)
            if head and '#' in re.sub(r'<[^>]+>', '', head.group(1)):
                wrong_art.append('%s｜页头印出了主键' % path.stem)
            if want and got != want:
                wrong_set.append('%s｜源稿 %s，页面 %s' % (path.stem, want, got))
        self.assertEqual(wrong_art[:4], [], '%d 处神器模组链到了别的神器上' % len(wrong_art))
        self.assertEqual(wrong_set[:4], [], '%d 篇的套装件数画错了' % len(wrong_set))

    def test_every_key_lands_on_a_row_the_form_can_pick(self):
        """主键查得到。查不到说明那一页删了那一行，或者主键抄错了。"""
        sys.path.insert(0, str(TOOLS))
        import migrate
        text = (self.SITE / 'builds' / 'vocab.js').read_text(encoding='utf-8')
        slots = json.loads(markup.must(
            re.search(r'^slots: (\{.*\})[,;]?$', text, re.M),
            'builds/vocab.js 里没有 slots').group(1))
        keys = {slot: {r[7] for r in ArtifactPicker.rows(text, owner)
                       if len(r) > 7 and r[7]}
                for slot, owner in slots.items()}
        bad = []
        for name, key, val in self.lines():
            slot = self.SLOT_OF.get(key)
            if not slot:
                continue
            for seg in val.split('、'):
                got = seg.partition(migrate.MARK)[2].strip()
                if got and got not in keys.get(slot, ()):
                    bad.append('%s｜%s：%s' % (name, key, seg))
        self.assertEqual(bad[:6], [], '%d 个主键在词表里查不到' % len(bad))


class FormCandidates(unittest.TestCase):
    """填表页每一格只列这一格选得出来的。

    按栏收：一栏的词条在另一栏上开不出来。

    两格共用一份候选时，填表人选得出一套游戏里配不出来的枪——「无足雨燕」第一栏
    的萤火虫与第二栏的亡命之徒能同时选上，而那两条本来就在同一把枪的两列里各选
    一条。异域那一组同理：故我在是「五种刀剑框架 | 八条异域固有」，英勇利刃是
    「四枚催化 | 三枚核心」。

    另一条：**选得出来才出格子**。141 把异域里只有 18 把的词条是掉落时开的，
    其余钉死：没得选的格子点开是一张挑不出东西的网格，所以一格都不出。
    """

    SITE = TOOLS.parent / 'site'

    def vocab(self):
        text = (self.SITE / 'builds' / 'vocab.js').read_text(encoding='utf-8')
        self.text = text

        def field(key):
            hit = markup.must(re.search(r'^%s: (\{.*\})[,;]?$' % key, text, re.M),
                              'builds/vocab.js 里没有 %s：先跑一次 npm run build' % key)
            return json.loads(hit.group(1))
        return field('perks'), field('exoticCols'), ArtifactPicker.rows(text, 'Perk')

    def test_a_legendary_gun_lists_each_column_on_its_own_cell(self):
        perks, _, plist = self.vocab()
        self.assertGreater(len(perks), 700, '武器的词条池是空的')
        for name, cols in perks.items():
            with self.subTest(gun=name):
                self.assertEqual(len(cols), 3,
                                 '%s 的词条池不是「一栏、二栏、起源栏」三份' % name)
                for at in [i for c in cols for i in c]:
                    self.assertLess(at, len(plist), '%s 的下标指到 Perk 列表之外' % name)
        both = [n for n, c in perks.items() if c[0] and c[1]]
        self.assertGreater(len(both), 700, '两栏都有候选的枪只剩 %d 把' % len(both))
        # 同一把枪的两栏不该是同一份：两格共用一份候选就是让人两栏各选一条互斥的。
        same = [n for n, c in perks.items() if c[0] and c[0] == c[1]]
        self.assertEqual(same[:5], [], '这些枪的两栏候选一模一样')

    def test_only_an_exotic_with_a_real_choice_gets_perk_cells(self):
        _, ex, _ = self.vocab()
        for name, cols in ex.items():
            with self.subTest(gun=name):
                self.assertLessEqual(len(cols), 2, '%s 列了两栏以上' % name)
                for one in cols:
                    self.assertGreater(len(one), 1,
                                       '%s 有一栏只有一个选项，那不是「选」' % name)
        self.assertEqual([len(c) for c in ex['故我在']], [5, 8],
                         '故我在应是五种刀剑框架加八条异域固有')
        self.assertEqual([len(c) for c in ex['英勇利刃']], [4, 3],
                         '英勇利刃应是四枚催化加三枚核心')
        self.assertNotIn('荆棘', ex, '词条钉死的异域不该出词条格')
        self.assertLess(len(ex), 40, '有得选的异域忽然多了一批：%d 把' % len(ex))

    def test_the_exotic_gun_cell_lists_each_gun_once(self):
        """异域武器那一栏只收真装备：组合行是同一把枪换一套固有，不是另一把异域。"""
        self.vocab()
        guns = [r[0] for r in ArtifactPicker.rows(self.text, '异域武器')]
        self.assertEqual(len(guns), len(set(guns)), '异域武器那一栏有重名')
        for name in ('故我在', '英勇利刃'):
            same = [n for n in guns if n.startswith(name)]
            self.assertEqual(same, [name], '%s 在清单里出现了 %d 次' % (name, len(same)))

    def test_a_weapon_knows_which_slot_it_takes(self):
        """三个槽位各装一把枪：填表页靠 `buckets` 挡住两把枪抢同一个槽。

        购物清单那四页按弹药分（主武器、特殊、威能），不是按槽位分——动能与能量两个
        槽都装得下主武器与特殊武器，按页面判会把半数选项判错。
        """
        text = (self.SITE / 'builds' / 'vocab.js').read_text(encoding='utf-8')
        got = json.loads(markup.must(
            re.search(r'^buckets: (\{.*\})[,;]?$', text, re.M),
            'builds/vocab.js 里没有 buckets').group(1))
        self.assertEqual(set(got.values()), {'k', 'e', 'h'}, '槽位不是那三个')
        self.assertEqual((got.get('故我在'), got.get('英勇利刃')), ('e', 'k'),
                         '故我在占能量槽、英勇利刃占动能槽')
        for key in ('异域武器', '传说武器'):
            miss = [r[0] for r in ArtifactPicker.rows(text, key) if r[0] not in got]
            self.assertEqual(miss[:5], [], '%s 里有 %d 把枪没有槽位' % (key, len(miss)))

    def test_the_armor_cell_lists_only_what_can_be_worn(self):
        """异域护甲那一栏：穿得上的才进词表，之灵留着但归那两格。

        「永劫教派」那三条是 itemType 19 的模组，配装里穿不上；之灵不是单独穿得上
        的一件，摆在主格里会让人把「噬星者之灵」当成一件异域护甲填进去。
        """
        self.vocab()
        armor = ArtifactPicker.rows(self.text, '异域护甲')
        kinds = {r[1] for r in armor}
        self.assertNotIn('永劫教派', kinds, '穿不上的学派模组又进了异域护甲那一栏')
        spirits = json.loads(markup.must(
            re.search(r'^spirits: (\{.*\})[,;]?$', self.text, re.M),
            'builds/vocab.js 里没有 spirits').group(1))
        names = {n for cols in spirits.values() for one in cols for n in one}
        self.assertEqual(len(names), 36, '之灵不是 36 条：%d' % len(names))
        have = {r[0] for r in armor}
        self.assertTrue(names <= have, '之灵掉出了词表，那两格就列不出候选')
        # 主格列的是这一栏减掉之灵：三个职业各 45 件加三件职业物品。
        self.assertEqual(len(have - names), 138,
                         '主格列得出 %d 件，应是 45×3 加三件职业物品' % len(have - names))


class ArtifactPicker(unittest.TestCase):
    """填表页挑神器模组，靠 form.js 的 bare() 把分节标题「废墟石板 （异端）」切成
    神器名。切分符号从前在 vocab.bare_kind 与 form.js 各写一份，改一处就错开：
    七个神器格全部列不出候选，而页面照常渲染、三道闸门全绿；那时这条测试只能
    拿正则去 form.js 的源码里刮那个字面量。

    现在符号随 vocab.js 发过去（vocab.KIND_TAIL 一处定义），这里读那个字段，
    断言七件神器各自收得到自己那 21 枚模组。
    """

    SITE = TOOLS.parent / 'site'
    VOCAB = SITE / 'builds' / 'vocab.js'

    @staticmethod
    def rows(text, key):
        # 每份列表恰好占一行，末尾那个逗号只有非最后一份才有。
        head = '"%s":[' % key
        start = text.index(head) + len(head) - 1
        return json.loads(text[start:text.index('\n', start)].rstrip(','))

    def test_every_artifact_collects_its_own_mods(self):
        vocab = self.VOCAB.read_text(encoding='utf-8')
        sep = json.loads(markup.must(re.search(r'^sep: (".*?"),?$', vocab, re.M),
                                     'builds/vocab.js 里没有 sep：契约没发出去').group(1))
        form = (self.SITE / 'builds' / 'new' / 'form.js').read_text(encoding='utf-8')
        self.assertIn('split(V.sep)', form,
                      'form.js 又自己写了一份切分符号，应该读 vocab.js 带过来的那个')
        mods = self.rows(vocab, '神器')
        self.assertGreater(len(mods), 100, '神器模组词表是空的，先跑一次 npm run build')
        for name, *_ in self.rows(vocab, '神器本体'):
            hit = [m for m in mods if m[1].split(sep)[0].strip() == name]
            self.assertTrue(hit, '填表页选中「%s」之后一枚模组都列不出来：'
                                 'form.js 的 bare() 按 %r 切，词表里的分节是 %r'
                            % (name, sep, mods[0][1]))


def prose_of(rec, where=''):
    """一条配装记录里的散文：[(字段名, 正文)]，合集的成员一并走。"""
    out = []
    for key in items.PROSE_FIELDS:
        if rec.get(key):
            out.append((where + key, rec[key]))
    for key in items.PROSE_SECTIONS:
        node = (rec.get('节') or {}).get(key)
        if node:
            out.append((where + key, node))
    for k, member in enumerate(rec.get('成员') or (), 1):
        out += prose_of(member, '第%d套·' % k)
    return out


def as_record(md):
    """夹具正文按 markdown 写（一眼看得出形状），落盘是结构化记录。"""
    return migrate.dump(migrate.parse(md))


class Generated(unittest.TestCase):
    """入库的生成物与它们的来源对得上。

    `admin/terms.js` 与 `admin/pages.js` 是「Python 定义 → 浏览器只认数据」那条
    管道的产物，而 `npm run build` 里 build-terms.py 排在三道闸门之前——闸门那一侧
    永远看到的是刚生成的那一份，查不出过期。这条放在 `npm test` 里才不是空转。

    过期的后果不是少一个词：G6 的匹配规则（中英之间那个排版空格允许回来）
    如今也是随词表送过去的数据，词表旧了，编辑台的提示就按旧规则走。
    """

    def read(self, rel):
        return (TOOLS.parent / 'site' / rel).read_text(encoding='utf-8')

    def test_terms_table_matches_its_sources(self):
        self.assertEqual(build_terms.build(), self.read('admin/terms.js'),
                         'admin/terms.js 过期了，跑 python3 tools/build-terms.py')

    def test_page_tree_matches_its_sources(self):
        self.assertEqual(build_terms.tree(), self.read('admin/pages.js'),
                         'admin/pages.js 过期了，跑 python3 tools/build-terms.py')

    def test_home_previews_match_the_pages(self):
        """首页卡片里的预览是 build-home.py 从各页产出现取的。页面改了而首页没重跑时，
        首页上的前三名、数值与图标停在旧的那一版，页面照旧渲染，三道闸门也看不出来。"""
        home = self.read('index.html')
        self.assertEqual(build_home.render(home), home,
                         'index.html 的卡片预览过期了，跑 python3 tools/build-home.py')

    def test_the_search_index_carries_the_english_names(self):
        """搜 One-Two Punch 要搜得到雪上加霜。

        英文名一直在事实层里（18840/19356 条），这一条钉住它露在搜索索引的全文
        那一格上。掉了的症状是「搜中文照样能搜到」，没有人会发现。
        """
        rows = [json.loads(line.rstrip(','))
                for line in self.read('assets/search.js').split('\n')
                if line.strip().startswith('{')]
        entries = [r for r in rows if 'n' in r]
        self.assertGreater(len(entries), 3000, '只读到 %d 个条目' % len(entries))
        got = [r for r in entries if r['n'] == '雪上加霜']
        self.assertTrue(got, '搜索索引里没有雪上加霜')
        for r in got:
            self.assertTrue(r['x'].endswith('One-Two Punch'),
                            '雪上加霜的全文没带上英文名：%r' % r['x'][-40:])
        withen = sum(1 for r in entries
                     if re.search(r"[A-Za-z][A-Za-z .,'-]{2,}\Z", r['x']))
        self.assertGreater(withen, 1500,
                           '只有 %d 个条目带英文名，英文没接进来' % withen)

    def test_the_cloud_function_carries_the_same_dialect(self):
        # 云函数只 require 得到自己目录下的东西，所以那一份是复制过去的。
        fn = (TOOLS.parent / 'functions' / 'api' / 'dialect.js').read_text(encoding='utf-8')
        self.assertEqual(fn, self.read('admin/dialect.js'),
                         'functions/api/dialect.js 与 admin/dialect.js 分家了，跑一次构建')


class EntitySource(unittest.TestCase):
    """源稿与记录对得上：每一行的主键都落得到记录，那条记录名下有站内写的东西。

    源稿只剩分节、表头与主键清单，内容全在记录里。这两边一旦对不上，页面就会
    少一行或画出一行空的，而两边各自都是合法的 JSON 与 markdown，没有别的闸门
    看得见。同一页里同一枚主键出现 k 次时，那个来源名下要有 k 段（本体 1 段 +
    variants k-1 段）。
    """

    ROOT = TOOLS.parent
    # 一页的正文归谁（记录本体还是某位作者）只在 rows.py 定一次，渲染与这里共用。
    BODY = tuple(sorted(rows.BODY))
    AUTHORED = rows.AUTHORED
    # 这几个键是 manifest 那一侧的，不算「站内写的东西」。
    MANIFEST_TEXT = frozenset({'name', 'database_details', 'itemTypeDisplayName',
                               'itemTypeAndTierDisplayName', 'flavorText',
                               'sourceString', 'displaySource'})
    LANE = re.compile(r'^==\s*(.+?)\s*==$')

    def rows(self, slug):
        """一页源稿的表区：每一行的主键清单，按出现顺序。"""
        path = Path(shell.source_path(slug) or '')
        inside = False
        for n, line in enumerate(path.read_text(encoding='utf-8').split('\n'), 1):
            if line.startswith('列：'):
                inside = True
                continue
            if not line.strip() or line.startswith('##'):
                inside = False
                continue
            if not inside or self.LANE.match(line.strip()):
                continue
            keys = line.partition('  ')[0].split()
            if keys:
                yield n, keys

    def page_rows(self):
        """页面 JSON 点名的主键。矩阵表那种一行指向别的主键的格子放在那里——
        列头是版面、格子是引用，都不是这枚实体自己的事实。"""
        got = collections.defaultdict(set)
        for path in sorted((self.ROOT / 'references' / 'pages').glob('*.json')):
            one = json.loads(path.read_text(encoding='utf-8'))
            for sec in one.get('matrix') or ():
                got[one['page']].update(sec.get('行') or ())
        return got

    def points_at(self, facts, head):
        """这一行指到的实体：组合的成员，固有栏那几枚插件，加它的催化剂。

        异域拆开之后，护甲那一行的正文整段归它那一枚异域 perk，装备记录上确实
        一个字都不剩——那是对的结果，不是缺陷。所以这一条问的是「这一行说的那件
        东西，站内有没有写过什么」，而不是「行首那一条记录上有没有字」。
        「故我在（任意元素）」这种组合行只有名字，正文在它两枚固有 Perk 名下。
        """
        row = facts.at(head) or {}
        kinds = self.socket_kinds()
        out = list(row.get('members') or ())
        out += (row.get('derived') or {}).get('catalyst') or ()
        for e in (row.get('sockets') or {}).get('socketEntries') or ():
            if kinds.get(str(e.get('socketTypeHash'))) not in ('intrinsic', 'trait'):
                continue
            if e.get('singleInitialItemHash'):
                out.append(e['singleInitialItemHash'])
            out += [p['plugItemHash'] for p in e.get('reusablePlugItems') or ()]
        # 再往下一跳：护甲那一侧的名字按 resolve.perk_key() 落在 SandboxPerk 上，
        # 不在插槽里那枚插件上——`facts.pool()` 只覆盖武器。两侧最终都在效果这一层
        # 对得上（武器那一侧由 link() 从插件抄过去），所以这里两跳都走。
        out += [p['perkHash'] for key in list(out)
                for p in (facts.at(str(key)) or {}).get('perks') or ()]
        return ['perk:%s' % x for x in out] + [str(x) for x in out]

    @classmethod
    def socket_kinds(cls):
        if not hasattr(cls, '_kinds'):
            with open(cls.ROOT / 'data' / 'lookup' / 'socket-types.json',
                      encoding='utf-8') as f:
                cls._kinds = {h: v['derived']['kind'] for h, v in json.load(f).items()}
        return cls._kinds

    def test_every_source_row_lands_on_a_record_that_says_something(self):
        import resolve
        facts = resolve.Facts()
        inpage = self.page_rows()
        nrows = refs = 0
        for slug in tuple(self.BODY) + tuple(self.AUTHORED):
            who = self.AUTHORED.get(slug)
            seen = collections.Counter()
            for n, keys in self.rows(slug):
                nrows += 1
                refs += len(keys)
                for key in keys:
                    self.assertIsNotNone(facts.at(key),
                                         '%s:%d 主键 %s 落不到记录上' % (slug, n, key))
                seen[keys[0]] += 1
            for head, times in seen.items():
                row = facts.at(head)
                if who is None:
                    said = {k: v for k, v in (row.get('i18n') or {}).get('zh-CN', {}).items()
                            if k not in self.MANIFEST_TEXT}
                    said.update({k: row[k] for k in ('weaponTypes', 'enhanced') if row.get(k)})
                    more = row.get('variants') or ()
                else:
                    said = rows.author_block(row, who)
                    more = said.get('variants') or ()
                if not said and who is None:
                    said = {k: v for h in self.points_at(facts, head)
                            for k, v in ((facts.at(h) or {}).get('i18n')
                                         or {}).get('zh-CN', {}).items()
                            if k not in self.MANIFEST_TEXT}
                self.assertTrue(said or head in inpage.get(slug, ()),
                                '%s 的 %s 名下没有站内写的东西' % (slug, head))
                if not said:
                    continue
                self.assertLessEqual(
                    times, 1 + len(more),
                    '%s 的 %s 在源稿里出现 %d 次，记录里只有 %d 段'
                    % (slug, head, times, 1 + len(more)))
        # 3026 ＝ 2390 行的行首加上它们的 covers。元素页、棱镜页与职业技能页的行
        # 从前互相写着对方分支的那一枚（电弧的「重击」与棱镜的「重击」是两枚不同的
        # hash，各自有一段说明），摘掉那 88 枚、再摘掉烈焰战锤那一行写的「无敌索尔」
        # （那不是它的另一枚 hash，是改造它的那个星相）之后是这个数。异域护甲页的
        # 职业金那一节列的是三件职业物品，不是 18 行之灵：两栏各有哪些之灵写在
        # 记录的 site_perkColumns 上。
        self.assertEqual((nrows, refs), (2390, 3026),
                         '源稿的行数或主键引用数变了：%d 行、%d 个引用' % (nrows, refs))

    def test_an_enhancement_names_the_aspects_that_cause_it(self):
        """技能记录上的 `enhanced`：装上 `by` 里任一枚星相之后，这项技能多出来的效果。

        页面在技能那一行下面画一行强化版，名字与图取 `by` 那几条记录，所以 `by`
        里每一枚都必须是星相；冰影分支的星相类目以 `.totems` 结尾。碎片对各项技能
        的作用写在碎片自己的说明里，不进这里。
        """
        import resolve
        facts = resolve.Facts()
        seen = 0
        for table in (facts.items, facts.perks, facts.traits):
            for key, row in table.items():
                for e in row.get('enhanced') or ():
                    seen += 1
                    self.assertEqual(set(e), {'by', 'realgame_details'},
                                     '%s 的 enhanced 字段不对：%s' % (key, sorted(e)))
                    self.assertTrue(e['realgame_details'], '%s 的 enhanced 没有说明' % key)
                    self.assertTrue(e['by'], '%s 的 enhanced 没写星相' % key)
                    for by in e['by']:
                        aspect = facts.at(str(by))
                        self.assertIsNotNone(aspect,
                                             '%s 的 enhanced.by %s 落不到记录上' % (key, by))
                        self.assertTrue(((aspect.get('plug') or {})
                                         .get('plugCategoryIdentifier', '')
                                         .endswith(('.aspects', '.totems'))),
                                        '%s 的 enhanced.by %s 不是星相' % (key, by))
        self.assertEqual(seen, 30, '技能强化的条数变了：%d' % seen)

    def test_a_frame_note_per_weapon_type_names_types_that_carry_the_frame(self):
        """框架记录上的 `weaponTypes`：这枚框架在这几种枪型上的说明。

        同名框架在 manifest 里有好几枚 hash，却不是一个枪型一枚（攻击型框架的
        3468089894 同时用在七种枪型上），所以按枪型记在页面那一枚上，与
        `derived.rate[itemSubType]` 同一种键法。列出的每个枪型都要真有武器用着同名框架。
        """
        import resolve
        facts = resolve.Facts()
        carried = collections.defaultdict(set)
        for row in facts.items.values():
            frame = (row.get('derived') or {}).get('archetype')
            if frame:
                name = ((facts.items.get(str(frame)) or {}).get('i18n') or {}).get(
                    'zh-CN', {}).get('name')
                carried[name].add(row.get('itemSubType'))
        seen = 0
        for key, row in facts.items.items():
            name = row['i18n']['zh-CN']['name'] if row.get('weaponTypes') else None
            for e in row.get('weaponTypes') or ():
                seen += 1
                self.assertEqual(set(e), {'itemSubType', 'realgame_details'},
                                 '%s 的 weaponTypes 字段不对：%s' % (key, sorted(e)))
                self.assertTrue(e['realgame_details'], '%s 的 weaponTypes 没有说明' % key)
                self.assertTrue(e['itemSubType'], '%s 的 weaponTypes 没写枪型' % key)
                stray = set(e['itemSubType']) - carried[name]
                self.assertFalse(stray, '%s「%s」列了没有武器用它的枪型 %s'
                                 % (key, name, sorted(stray)))
        self.assertEqual(seen, 12, '按枪型的框架说明条数变了：%d' % seen)

    def test_a_combination_row_lists_members_that_exist(self):
        """站内自发的「组合」：一行说的是几件东西合在一起——故我在与它的固有 Perk、
        框架，英勇利刃与插着的核心，手持超新星与四颗手雷加混沌加速。

        成员都要落到库里的记录上；成员本身再是站内自发的号，组合就套了第二层。
        """
        import resolve
        facts = resolve.Facts()
        combos = {k: r for k, r in facts.minted.items() if r.get('kind') == '组合'}
        for key, row in combos.items():
            members = row.get('members') or ()
            self.assertGreaterEqual(len(members), 2, '组合 %s 的成员不到两个' % key)
            for m in members:
                self.assertTrue(str(m) in facts.items,
                                '组合 %s 的成员 %s 不是库里的物品' % (key, m))
        self.assertEqual(len(combos), 11, '组合的条数变了：%d' % len(combos))


class ManifestLayer(unittest.TestCase):
    """事实层自身对得上：主键即记录里的 hash，双语键是那两个，前缀不混。

    蒸馏要读仓库外那份 190 MB 的 manifest，所以这里不跑 --distill，只查入库的
    那八份产物。查的是**换赛季重跑之后还成立的那些**：一条记录的 hash 与它的键
    对不上，下游按键查、按 hash 显示，两边指的就不是同一件东西了。
    """

    ROOT = TOOLS.parent / 'data'
    # 实体表：站内寻址得到的东西，键是裸 hash、文件即命名空间。
    ENTITIES = ('inventory-items.json', 'sandbox-perks.json', 'traits.json',
                'stats.json', 'equipable-item-sets.json')
    # 查表：算栏位与数值用的字典，没有任何页面指向它们，而且 hash 空间与实体撞号
    # （plug-sets 最小号是 1，socket-types 里有 0），所以不进实体那一档。
    LOOKUPS = ('plug-sets.json', 'socket-types.json', 'stat-groups.json')

    def table(self, name):
        where = self.ROOT / 'lookup' if name in self.LOOKUPS else self.ROOT
        with open(where / name, encoding='utf-8') as f:
            return json.load(f)

    def test_the_key_is_the_record_s_own_hash(self):
        """记录里不写 `hash`：键就是它。

        写下来是同一个事实存两处，30058 条逐条核对过零例外，还白占 1.1 MB。
        """
        for name in self.ENTITIES + self.LOOKUPS:
            with self.subTest(table=name):
                rows = self.table(name)
                bad = [k for k, v in rows.items() if 'hash' in v]
                self.assertEqual(bad[:5], [], '%s 有 %d 条又把 hash 写进了记录里'
                                 % (name, len(bad)))
                bad = [k for k in rows if not k.isdigit()]
                self.assertEqual(bad[:5], [], '%s 的键不是裸十进制 hash' % name)

    def test_only_the_lookups_reuse_the_small_numbers(self):
        """实体那几张表的号都在 1000 以上，站内自发号因此可以从小号开始发。

        Bungie 确实用小号——plug-sets 里最小的是 1，socket-types 里有 0——但那两张
        是算栏位用的字典，没有任何页面或配装指向它们。哪天有人把它们并进实体那一档，
        这一条当场报出，而不是静默撞号。
        """
        for name in self.ENTITIES:
            with self.subTest(table=name):
                small = sorted(int(k) for k in self.table(name) if int(k) < 1000)
                self.assertEqual(small, [], '%s 里有小于 1000 的主键：%s' % (name, small[:5]))

    def test_bilingual_text_uses_bcp47_and_never_the_old_keys(self):
        """zh/en 换成了 zh-CN/en。漏改一处的症状是名字整列变空，不是报错。"""
        def walk(node, path=''):
            if isinstance(node, dict):
                if 'zh' in node and 'displayProperties' not in node:
                    bad.append(path)
                for k, v in node.items():
                    walk(v, path + '.' + k)
            elif isinstance(node, list):
                for v in node:
                    walk(v, path + '[]')

        for name in self.ENTITIES:
            bad = []
            with self.subTest(table=name):
                walk(self.table(name))
                self.assertEqual(sorted(set(bad))[:5], [], '%s 里还有旧的 zh 键' % name)

    def test_manifest_facts_and_our_own_stay_on_their_own_sides(self):
        """根上只放 manifest 的字段，本项目算出来的只在 derived 里。

        边界一模糊就没人再分得清某个字段能不能跟着 manifest 重生成。
        """
        ours = {'release', 'season', 'breakerType', 'craftable', 'tierable', 'tiers',
                'archetype', 'catalyst', 'foundry', 'rate', 'kind', 'lowerIsBetter'}
        # breakerType 是唯一两头都有的：根上那一位是 manifest 自己的字段，照原样留着。
        only_ours = ours - {'breakerType'}
        items = self.table('inventory-items.json')
        stray = sorted({k for v in items.values() for k in v} & only_ours)
        self.assertEqual(stray, [], '这些是本项目算的，不该出现在根上：%s' % stray)
        seen = {k for v in items.values() for k in v.get('derived') or {}}
        self.assertTrue(seen <= ours, 'derived 里冒出没登记的字段：%s' % sorted(seen - ours))
        # breakerType 两头都有：根上那一位是 manifest 写的（写不写只看键在不在，
        # 所以每条都有，绝大多数是 0），derived 那一位是按固有框架的 SandboxPerk
        # 推出来的，消费方读的是它，覆盖 2208 把武器。
        nonzero = sum(bool(v.get('breakerType')) for v in items.values())
        got = sum('breakerType' in (v.get('derived') or {}) for v in items.values())
        self.assertGreater(nonzero, 0, 'manifest 自带的 breakerType 一条都没留下')
        self.assertGreater(got, 2000, 'derived.breakerType 只覆盖 %d 条，推导没跑' % got)

    def test_the_normalised_socket_kinds_cover_what_the_site_slices(self):
        """插槽的语义标签是一处定义，切栏那一侧只读它，不再各归各的。

        manifest 的 categoryIdentifier 有 14 种叫法说的却是同几件事。这一条钉住
        六档主要标签都还在——某一档掉了的症状是那一栏整列不见，页面上看不出来。
        """
        kinds = collections.Counter(v['derived']['kind']
                                    for v in self.table('socket-types.json').values())
        for want in ('intrinsic', 'trait', 'origin', 'stat', 'masterwork', 'mod'):
            self.assertIn(want, kinds, '语义标签少了 %s' % want)
        self.assertLess(kinds['other'], 80,
                        '认不出的插槽类型涨到 %d 种，词表跟不上 manifest 了' % kinds['other'])

    def test_the_hand_kept_facts_are_still_there(self):
        """manifest 里推不出来、只能人记的那几位。

        `lowerIsBetter` 那三项与另外 23 项的 statCategory 与 aggregationType 完全
        相同，没有任何一位把它们分开。掉了的症状是属性条方向画反，读者看不出来。
        """
        low = {h for h, v in self.table('stats.json').items()
               if (v.get('derived') or {}).get('lowerIsBetter')}
        self.assertEqual(low, {'447667954', '2961396640', '3481294762'},
                         '越低越好的那三项变了：%s' % sorted(low))
        items = self.table('inventory-items.json')
        arch = sum(1 for v in items.values()
                   if (v.get('derived') or {}).get('archetype'))
        self.assertGreater(arch, 2000, 'derived.archetype 只覆盖 %d 把枪' % arch)
        # 射速挂在框架那枚插件上、按枪型分档：同一枚「攻击型框架」在霰弹枪上是 60、
        # 在火箭发射器上是 25，掉成一个数就有一半的枪显示错的射速。
        rate = {h: v['derived']['rate'] for h, v in items.items()
                if (v.get('derived') or {}).get('rate')}
        self.assertGreater(len(rate), 150, '只有 %d 枚框架挂上射速' % len(rate))
        self.assertEqual(rate['3468089894']['7'], 60, '霰弹枪攻击型框架的射速应是 60')
        self.assertEqual(rate['3468089894']['10'], 25, '火箭攻击型框架的射速应是 25')

    def test_the_artifact_tiers_ride_on_the_artifact_s_own_item_record(self):
        """七件神器的档位分组挂在本体那条物品上，不单出一张表。

        那张表的键本来就是本体的 itemHash——单出一张等于同一个实体在两处各有
        一条记录，而且改了一处另一处不会跟着动。
        """
        items = self.table('inventory-items.json')
        arts = {k: v['derived']['tiers'] for k, v in items.items()
                if 'tiers' in (v.get('derived') or {})}
        self.assertEqual(len(arts), 7, '神器应有 7 件，实际 %d 件' % len(arts))
        for key, tiers in arts.items():
            with self.subTest(artifact=key):
                self.assertTrue(tiers, '%s 没有档位' % key)
                for tier in tiers:
                    self.assertTrue(tier['items'], '%s 有一档是空的' % key)

    def test_the_source_line_rides_on_the_item_not_a_second_table(self):
        """来源那一句并进物品记录，不单出一张收藏条目表。

        钉的是**接上没有**，不是接上多少条：库的范围随裁剪变，条数跟着变，而
        「有 collectibleHash 的都该有来源那一句」这条不变。
        """
        items = self.table('inventory-items.json')
        want = [k for k, v in items.items() if v.get('collectibleHash')]
        got = [k for k in want
               if 'sourceString' in (items[k].get('i18n') or {}).get('zh-CN', {})]
        self.assertGreater(len(want), 1000, '带 collectibleHash 的只有 %d 条' % len(want))
        # 差的那几条是**收藏条目自己的 sourceString 就是空串**（manifest 里如此），
        # 不是没接上。库尔之影、原谅、狼毒那几件异域是这样，现在 9 条。
        self.assertLess(len(want) - len(got), 20,
                        '%d 条有收藏条目却没接上来源' % (len(want) - len(got)))
        self.assertFalse((self.ROOT / 'collectibles.json').exists(),
                         'collectibles.json 又出现了——它是物品记录的一部分')


class NakedText(unittest.TestCase):
    """两道漏着色闸门共用的裸文本视图：剥掉的标签必须留下隔断。

    「覆盖{el-void|虚空}护盾」剥完直接拼起来就是「覆盖护盾」，那是词表里的另一个
    术语。闸门因此报一条源稿里根本没有的漏着色，而源稿怎么改都过不去——着色标记
    本身就是那个隔断。s29 一篇配装源稿撞上过，整次构建卡死在这里。
    """

    def test_a_stripped_span_does_not_glue_its_neighbours(self):
        naked = items.naked_text(['长时间覆盖<span class="el-void">虚空</span>护盾'])
        self.assertNotIn('覆盖护盾', naked)
        self.assertIn('护盾', naked)

    def test_separate_fragments_do_not_glue(self):
        self.assertNotIn('覆盖护盾', items.naked_text(['…覆盖', '护盾…']))

    def test_a_genuinely_naked_term_still_shows(self):
        self.assertIn('覆盖护盾', items.naked_text(['神圣之光给一层覆盖护盾']))


class BuildProseColors(unittest.TestCase):
    """配装散文的着色必须全部补得回来：剥掉标记再跑自动着色，逐字还原。

    填表页编辑时框里只放文字（form.js 的 ink），改动碰到的词去掉颜色，由构建第一步的
    items.py --normalize 重新补。有人在本机手写了一个补不回来的标记，那个词在线上改一次
    颜色就没了，而页面上一切正常。
    """

    def test_stripping_then_normalizing_restores_every_build(self):
        terms = items.forward_terms()          # 与构建时补色同一份词表
        kw = dict(terms=terms, names=sorted(terms, key=len, reverse=True),
                  banned=check_terms.banned_pairs())
        seen, bad = 0, []
        for path in items.build_pages():
            rec = migrate.load(path)
            for label, text in prose_of(rec):
                for i, line in enumerate(text.split('\n'), 1):
                    if '{' not in line:
                        continue
                    seen += 1
                    if items.normalize_text(markup.uncolor(line), **kw)[0] != line:
                        bad.append('%s %s:%d'
                                   % (os.path.relpath(path, items.shell.ROOT), label, i))
        # 一行都没读到时这条也是全绿：配装源稿挪了地方就当场报出来。
        self.assertGreater(seen, 100, '只读到 %d 行带着色的配装散文，字段变了？' % seen)
        self.assertEqual(bad, [], '剥掉标记再补色补不回原样：\n  ' + '\n  '.join(bad))


class WeaponPage(unittest.TestCase):
    """装备库：入库的三份载荷与页壳是不是现跑生成器的产物；浏览器那一份属性算法
    与 facts.shown() 是不是逐值一致。"""

    @classmethod
    def setUpClass(cls):
        cls.facts = rows.facts()
        cls.out, cls.stats = weapons.build(cls.facts)

    def test_the_payload_on_disk_is_what_the_generator_makes_now(self):
        for rel, body in self.out.items():
            if rel.endswith('index.html'):
                body = markup.delta_bmarks(body)
            with self.subTest(rel=rel):
                disk = (TOOLS.parent / 'site' / rel).read_text(encoding='utf-8')
                self.assertTrue(disk == body, '%s 与现跑生成器的产出对不上：跑 python3 tools/build-weapons.py' % rel)

    def test_every_enhanced_perk_has_its_base_and_author_names_resolve(self):
        self.assertEqual(self.stats['orphans'], [])
        self.assertLessEqual(len(self.stats['mark_miss']), weapons.MARK_MISS_BASELINE,
                             '\n'.join(self.stats['mark_miss']))

    def test_artifact_mods_follow_type_element_and_precision(self):
        """神器模组的适用范围：精准按枪型认，元素、枪型与稀有度按武器记录认。"""
        precise, typed = weapons.precise_types()
        self.assertEqual(typed - precise, {10, 11, 18, 23, 33},
                         '打不出精准的只有火箭发射器、融合步枪、刀剑、榴弹发射器、偃月')
        _, _, scopes = weapons.artifact_mods(self.facts)
        F = self.facts

        def first(**want):
            for r in F.items.values():
                if r.get('itemType') == 3 and all(
                        (r['inventory']['tierType'] == 6) == v if k == 'exotic' else r[k] == v
                        for k, v in want.items()):
                    return weapons.traits_of(r, precise)
            self.fail('库里没有 %s 的武器' % want)

        sword, hand_cannon = first(itemSubType=18), first(itemSubType=9, defaultDamageType=1)
        rocket, exotic_rocket = first(itemSubType=10, exotic=False), first(itemSubType=10, exotic=True)
        for key, w, ok in (('2903198432', sword, False),        # 精准平等：刀剑打不出精准
                           ('2903198432', hand_cannon, True),
                           ('2742146822', hand_cannon, True),   # 动能裂口：动能且能打精准
                           ('3585856467', rocket, True),        # 永恒毁灭：非异域火箭发射器
                           ('3585856467', exotic_rocket, False),
                           ('521275124', hand_cannon, False)):  # 不稳定神枪手：虚空武器
            with self.subTest(key=key, w=w['itemSubType']):
                self.assertIs(weapons.fits(scopes[key], w), ok)

    def test_same_as_is_one_hop_to_a_real_record(self):
        items_ = self.facts.items
        for h, r in items_.items():
            if 'sameAs' not in r:
                continue
            with self.subTest(h=h):
                target = items_.get(str(r['sameAs']))
                self.assertIsNotNone(target, '%s 的 sameAs 指到库外' % h)
                self.assertNotIn('sameAs', target or {}, '%s 的 sameAs 跳了两层' % h)

    def js_function(self, text, name):
        """与 check_quality.cjs 的 funcSource() 同一个判据：按缩进找收尾。"""
        head = re.search(r'^([ \t]*)function ' + name + r' ?\(', text, re.M)
        assert head is not None, 'weapons/app.js 里找不到 %s()' % name
        rest = text[head.end():]
        close = re.search(r'^' + head.group(1) + r'\}$', rest, re.M)
        assert close is not None, 'weapons/app.js 的 %s() 没找到收尾' % name
        return text[head.start():head.end() + close.end()]

    def test_the_browser_computes_stats_exactly_like_facts_shown(self):
        """全部武器 ×（基础、基础 + 各栏每一枚插件、基础 + 大师杰作 10+T）逐值比。"""
        F = self.facts
        cases = {}
        for h, r in F.items.items():
            if r.get('itemType') != 3:
                continue
            gh = str(r['stats']['statGroupHash'])
            base = collections.Counter()
            for s in r.get('investmentStats') or ():
                if not s.get('isConditionallyActive'):
                    base[str(s['statTypeHash'])] += s['value']
            adds = set()
            for col in F.pool(h):
                for p in col.get('plugs') or ():
                    for s in F.items[str(p)].get('investmentStats') or ():
                        if not s.get('isConditionallyActive'):
                            adds.add((str(s['statTypeHash']), s['value']))
            for row in F.groups[gh].get('scaledStats') or ():
                sh = str(row['statHash'])
                values = {base[sh]} | {base[sh] + v for s, v in adds if s == sh}
                values |= {base[sh] + 10 + t for t in range(6)}
                for v in values:
                    cases[(gh, sh, v)] = None
        self.assertGreater(len(cases), 20000, '覆盖的格子少得不对，抽样逻辑坏了')
        rows_ = []
        for gh, sh, v in cases:
            want = facts.shown({'investmentStats': [{'statTypeHash': int(sh), 'value': v}]},
                                       F.groups[gh], sh)
            row = next(x for x in F.groups[gh]['scaledStats'] if str(x['statHash']) == sh)
            curve = [n for p in row['displayInterpolation'] for n in (p['value'], p['weight'])]
            rows_.append([v, row['maximumValue'], curve, want])
        text = (TOOLS.parent / 'site' / 'weapons' / 'app.js').read_text(encoding='utf-8')
        prog = '\n'.join(self.js_function(text, n) for n in ('bankers', 'interp', 'shown')) + (
            '\nvar rows = JSON.parse(require("fs").readFileSync(0, "utf8")), bad = [];'
            '\nrows.forEach(function (r) { var got = shown(r[0], [0, r[1], r[2], 0]);'
            ' if (got !== r[3]) { bad.push([r[0], r[1], r[2].length, r[3], got]); } });'
            '\nprocess.stdout.write(JSON.stringify(bad.slice(0, 20)) + "\\n" + bad.length);')
        done = subprocess.run(['node', '-e', prog], input=json.dumps(rows_), capture_output=True,
                              text=True, check=True)
        sample, count = done.stdout.rsplit('\n', 1)
        self.assertEqual(int(count), 0, '浏览器与 facts.shown 算得不一样（投资值, 上限, 曲线点数, 期望, 实得）：%s' % sample)
        print('\n  装备库属性：%d 格与 facts.shown 逐值一致' % len(rows_), file=sys.stderr)


class DeploySelection(unittest.TestCase):
    """发什么、剥不剥注释、清单怎么读——四个纯函数各自的判据。

    这些断言从前挂在 `deploy.py --check` 上，而那个选项**没有任何调用方**：
    package.json、ship.sh、.github 里都不拉它。keep()/uncomment()/strippable()/
    listing() 因此是发布链上唯一没有网的四个函数，而剥错注释的症状是
    「页面正常、闸门全绿，只是搜不到东西」。
    """

    def test_site_files_ship_and_sources_do_not(self):
        self.assertTrue(deploy.keep('site/armor-mods/icons/0a1b2c3d4e.webp'))
        self.assertTrue(deploy.keep('site/index.html') and deploy.keep('site/assets/search.js'))
        self.assertTrue(deploy.keep('site/admin/index.html') and deploy.keep('site/admin/terms.js'))
        self.assertFalse(deploy.keep('index.html') or deploy.keep('functions/api/index.js'))
        self.assertFalse(deploy.keep('tools/deploy.py'))
        self.assertFalse(deploy.keep('references/docs/changelog.md'))
        self.assertFalse(deploy.keep('CLAUDE.md') or deploy.keep('cloudbaserc.json'))

    def test_the_fact_layer_is_not_uploaded_and_nothing_on_the_site_wants_it(self):
        """data/ 是构建的输入，不是站点的资源。

        两头都要断言。keep() 挡住它，是因为产出里没有任何读者；哪天有人让某一页
        去 fetch 一份事实表，keep() 会静默地让那次请求 404——症状是「本地 npm start
        好好的，发上去那一块空了」。所以正查 keep()，反查产出里没有人引用它。
        """
        self.assertFalse(deploy.keep('data/manifest/items.json'))
        self.assertFalse(deploy.keep('data/index/weapon-perks.json'))
        root = TOOLS.parent
        want = re.compile(r'(?<![\w-])data/')
        wired, seen = [], 0
        for path in root.rglob('*'):
            if path.suffix not in ('.html', '.js', '.css') or not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            if not deploy.keep(rel):
                continue
            seen += 1
            if want.search(path.read_text(encoding='utf-8', errors='ignore')):
                wired.append(rel)
        self.assertEqual(wired, [], '这些产出引用了 data/，而 keep() 不发它，线上会 404')
        # 反查那一半靠扫得到东西才成立：keep() 或后缀表一变，零命中也是全绿。
        self.assertGreater(seen, 200, '只扫到 %d 个产出，反查这一半没生效' % seen)

    def test_listing_drops_the_files_that_never_ship(self):
        self.assertEqual(deploy.listing('a.md\0site/index.html\0tools/x.py\0'), ['index.html'])

    def test_block_comments_go_but_line_numbers_stay(self):
        self.assertEqual(deploy.uncomment('a/*x\ny*/b'), 'a\nb')   # 换行数保住，行号不移
        self.assertEqual(deploy.uncomment('a/*x*/b'), 'ab')        # 单行注释不留空行
        self.assertEqual(deploy.uncomment('a'), 'a')               # 没有注释就原样

    def test_a_comment_marker_inside_a_string_makes_the_file_untouchable(self):
        self.assertTrue(deploy.strippable('i{color:red} /* 说明 */'))
        self.assertFalse(deploy.strippable('var a = "x/*y";'))
        self.assertFalse(deploy.strippable("var a = 'x*/y';"))

    def test_every_shipped_stylesheet_and_script_survives_the_stripper(self):
        # 剥注释是优化，不该有能力挡住发版：跳过的文件原样发。这里断言的是
        # 「今天站上这些文件走的是哪条路」，改文案时会跟着变，变了要看一眼。
        skipped = [rel for rel in ('assets/site.css', 'assets/app.js', 'assets/search.js',
                                   'admin/admin.js', 'admin/dialect.js', 'builds/new/form.js',
                                   'assets/chart.js', 'assets/rota.js', 'assets/home.js',
                                   'weapons/app.js', 'weapons/style.css')
                   if not deploy.strippable((TOOLS.parent / 'site' / rel).read_text(encoding='utf-8'))]
        self.assertEqual(skipped, [], '这些文件的字符串里出现了 /* 或 */，整个文件会原样发')


class Deployment(Isolated):
    TARGET = '1' * 40

    def setUp(self):
        super().setUp()
        self.file('cloudbaserc.json', '{"envId":"offline-fixture"}')
        self.file('site/index.html', 'published contents')
        self.replace(deploy, 'ROOT', self.root)
        self.replace(deploy, 'SITE', self.root / 'site')
        self.replace(sys, 'argv', ['deploy.py'])
        self.statuses = ['', '', '', '', '']
        self.heads = [self.TARGET] * 5
        self.files = 'site/index.html\0'
        self.gone = 'site/old/index.html\0'
        self.base = '0' * 40
        self.sync_code = 0
        self.fail_tcb = ''
        self.calls = []
        self.uploaded = None
        self.replace(deploy, 'git', self.git)
        self.replace(subprocess, 'run', self.command)
        mkdtemp = tempfile.mkdtemp
        self.replace(tempfile, 'mkdtemp', lambda **kw: mkdtemp(dir=self.root, **kw))

    def git(self, *args):
        self.calls.append(('git', args))
        if args == ('status', '--porcelain'):
            return self.statuses.pop(0)
        if args == ('rev-parse', 'HEAD'):
            return self.heads.pop(0)
        if args == ('ls-files', '-z'):
            return self.files
        if args[:4] == ('diff', '--no-renames', '--name-only', '-z'):
            self.assertEqual(args[-2:], (self.base, self.TARGET))
            if args[4] == '--diff-filter=d':
                return self.files
            if args[4] == '--diff-filter=D':
                return self.gone
        if args == ('update-ref', deploy.REF, self.TARGET):
            return ''
        return forbidden(args)

    def command(self, args, **kw):
        self.assertEqual(kw['cwd'], self.root)
        self.calls.append(('command', tuple(args)))
        if args == ['git', 'rev-parse', '--verify', deploy.REF]:
            return SimpleNamespace(stdout=self.base, returncode=0 if self.base else 1)
        if args == [sys.executable, 'tools/sync.py']:
            return SimpleNamespace(returncode=self.sync_code)
        if args[:3] == ['tcb', 'hosting', 'deploy']:
            self.assertEqual(args[-2:], ['-e', 'offline-fixture'])
            self.assertEqual(kw.get('input'), 'y\n' if '--prune' in args else None)
            self.uploaded = (Path(args[3]) / 'index.html').read_text(encoding='utf-8')
            return SimpleNamespace(returncode=int(self.fail_tcb == 'deploy'))
        if args[:3] == ['tcb', 'hosting', 'delete']:
            return SimpleNamespace(returncode=int(self.fail_tcb == 'delete'))
        return forbidden(args, kw)

    def remote(self):
        return [args for kind, args in self.calls if kind == 'command' and args[0] == 'tcb']

    def refs(self):
        return [args for kind, args in self.calls if kind == 'git' and args[0] == 'update-ref']

    def test_the_manifest_answers_on_its_own_without_replaying_the_process(self):
        # plan() 是纯的：问它「这次要发什么」不必先摆好工作区状态、HEAD 与子进程。
        # 增量只发改过的、删删掉的；--all 发全部、不删任何东西。
        # 清单是站上的路径：仓库里的 site/ 那一层去掉。
        self.files, self.gone = 'site/index.html\0site/new/index.html\0', 'site/old/index.html\0'
        self.assertEqual(deploy.plan(False, self.base, self.TARGET),
                         (['index.html', 'new/index.html'], ['old/index.html']))
        self.assertEqual(deploy.plan(True, self.base, self.TARGET),
                         (['index.html', 'new/index.html'], []))

    def test_the_manifest_never_ships_sources_or_tools(self):
        self.files = 'site/index.html\0tools/deploy.py\0CLAUDE.md\0references/docs/a.md\0'
        self.gone = ''
        self.assertEqual(deploy.plan(False, self.base, self.TARGET), (['index.html'], []))

    def test_sync_failure_blocks_upload_delete_and_ref(self):
        self.sync_code = 1
        self.assertIn('同步失败', self.exits(deploy.main))
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_sync_failure_is_failure_even_without_files(self):
        self.files = self.gone = ''
        self.sync_code = 1
        self.exits(deploy.main)
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_sync_source_changes_require_build_commit(self):
        self.statuses[1] = ' M references/docs/a.md'
        self.assertIn('同步改动了源稿', self.exits(deploy.main))
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_head_changes_before_staging_stop_all_sends(self):
        self.heads[1] = '2' * 40
        self.exits(deploy.main)
        self.assertIsNone(self.uploaded)
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_head_changes_during_staging_stop_all_sends(self):
        self.heads[2] = '2' * 40
        self.exits(deploy.main)
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_worktree_changes_during_staging_stop_all_sends(self):
        self.statuses[3] = ' M site/index.html'
        self.exits(deploy.main)
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_upload_failure_prevents_deletion_and_ref(self):
        self.fail_tcb = 'deploy'
        self.exits(deploy.main)
        self.assertEqual([args[2] for args in self.remote()], ['deploy'])
        self.assertEqual(self.refs(), [])

    def test_delete_failure_never_advances_ref(self):
        self.fail_tcb = 'delete'
        self.exits(deploy.main)
        self.assertEqual([args[2] for args in self.remote()], ['deploy', 'delete'])
        self.assertEqual(self.refs(), [])

    def test_success_uploads_exact_contents_and_pins_target(self):
        deploy.main()
        self.assertEqual(self.uploaded, 'published contents')
        self.assertEqual([args[2] for args in self.remote()], ['deploy', 'delete'])
        self.assertEqual(self.remote()[1][3], '%s/old/index.html' % deploy.CLOUD)
        self.assertEqual(self.refs(), [('update-ref', deploy.REF, self.TARGET)])

    def test_dry_run_has_no_sync_remote_or_ref(self):
        self.replace(sys, 'argv', ['deploy.py', '--dry-run'])
        deploy.main()
        self.assertEqual((self.remote(), self.refs()), ([], []))
        self.assertNotIn(('command', (sys.executable, 'tools/sync.py')), self.calls)

    def test_missing_deploy_ref_requires_all_even_dry(self):
        self.base = ''
        self.replace(sys, 'argv', ['deploy.py', '--dry-run'])
        self.assertIn('--all', self.exits(deploy.main))
        self.assertEqual((self.remote(), self.refs()), ([], []))

    def test_full_prune_preserves_explicit_safe_confirm(self):
        self.base = ''
        self.replace(sys, 'argv', ['deploy.py', '--all', '--prune'])
        deploy.main()
        self.assertEqual(len(self.remote()), 1)
        self.assertIn('--prune', self.remote()[0])
        self.assertIn('--safe', self.remote()[0])
        self.assertEqual(self.refs(), [('update-ref', deploy.REF, self.TARGET)])


    def test_full_prune_preview_identifies_unqueried_deletions(self):
        self.replace(sys, 'argv', ['deploy.py', '--all', '--prune', '--dry-run'])
        deploy.main()
        text = self.output.getvalue()
        for part in ('全量', 'offline-fixture', deploy.CLOUD, 'prune：开启', '未查询远端'):
            self.assertIn(part, text)
        self.assertEqual((self.remote(), self.refs()), ([], []))
        self.assertNotIn(('command', (sys.executable, 'tools/sync.py')), self.calls)


class Deletion(Isolated):
    ID = 'builds/s29-fixture/one-hunter'
    # 配装的源稿是结构化记录：盘上与库里存的都是它。投稿那一侧递过来的仍是
    # 填表页导出的 markdown，由 sync.as_source() 在入口处转成记录。
    A_MD = '# A\n'
    B_MD = '# B\n'
    A = migrate.dump(migrate.parse(A_MD))
    B = migrate.dump(migrate.parse(B_MD))

    def setUp(self):
        super().setUp()
        self.replace(sync, 'ROOT', str(self.root))
        self.replace(sync, 'REFS', str(self.root / 'references'))
        self.replace(sync, 'BASE', str(self.root / '.git/starside-sync.json'))
        self.path = self.file('references/' + self.ID + '.json', self.A)
        self.file('.git/starside-sync.json', json.dumps({self.ID: sync.sha1(self.A)}))
        self.db = {self.ID: self.A}
        self.landed = {self.ID: sync.sha1(self.A)}
        self.subs = [
            {'_id': 'approved', 'ok': 1, 'drop': 0, 'season': 's29-fixture',
             'slug': 'one-hunter', 'md': self.A_MD},
            {'_id': 'delete', 'ok': 1, 'drop': 1, 'season': 's29-fixture',
             'slug': 'one-hunter', 'md': self.A_MD},
        ]
        self.calls = []
        self.fail_drop = False
        self.fail_mark = ''
        self.fail_push = ''
        self.replace(sync, 'api', self.api)

    def api(self, action, **kw):
        self.calls.append((action, kw))
        if action == 'pull':
            return {'docs': [{'_id': key, 'md': md, 'landed': self.landed.get(key, '')}
                             for key, md in self.db.items()]}
        if action == 'landed':
            self.landed[kw['id']] = kw['hash']
            return {'ok': 1}
        if action == 'list':
            return {'subs': copy.deepcopy(self.subs)}
        if action == 'drop':
            if self.fail_drop:
                raise RuntimeError('injected drop failure')
            self.db.pop(kw['id'], None)
            self.subs = [s for s in self.subs if not (
                s['ok'] == 1 and 'builds/%s/%s' % (s['season'], s['slug']) == kw['id'])]
            return {'ok': 1}
        if action == 'mark':
            if kw['id'] == self.fail_mark:
                raise RuntimeError('injected mark failure')
            for sub in self.subs:
                if sub['_id'] == kw['id']:
                    sub['ok'] = kw['ok']
                    return {'ok': 1}
            raise AssertionError('unknown sub')
        if action == 'push':
            if kw['id'] == self.fail_push:
                raise RuntimeError('injected push failure')
            md = gzip.decompress(base64.b64decode(kw['gz'])).decode()
            self.db[kw['id']] = md
            self.landed[kw['id']] = sync.sha1(md)
            return {'ok': 1}
        return forbidden(action, kw)

    def drops(self):
        return [kw['id'] for action, kw in self.calls if action == 'drop']

    def changed(self):
        self.path.write_text(self.B, encoding='utf-8')

    def test_conflicting_modes_reject_before_any_action(self):
        before = Path(sync.BASE).read_bytes()
        for args in (['--seed', '--mine', self.ID], ['--seed', '--theirs', self.ID],
                     ['--mine', self.ID, '--theirs', self.ID], ['--mi', self.ID]):
            with self.subTest(args=args):
                self.replace(sys, 'argv', ['sync.py', *args])
                with redirect_stderr(io.StringIO()):
                    self.assertEqual(self.exits(sync.main), '2')
                self.assertEqual(self.calls, [])
                self.assertEqual(self.path.read_text(), self.A)
                self.assertEqual(self.db, {self.ID: self.A})
                self.assertEqual(Path(sync.BASE).read_bytes(), before)

    def test_distinct_ids_can_choose_opposite_directions(self):
        self.subs = []
        self.changed()
        other = self.file('references/docs/other.md', self.A)
        self.db['docs/other'] = self.B
        self.replace(sys, 'argv', ['sync.py', '--mine', self.ID, '--theirs', 'docs/other'])
        sync.main()
        self.assertEqual(self.db[self.ID], self.B)
        self.assertEqual(other.read_text(), self.B)
        self.assertEqual(sync.baseline()['docs/other'], sync.sha1(self.B))

    def test_local_edit_conflict_is_not_deleted_or_pushed(self):
        self.changed()
        self.file('references/docs/new.md', '# unrelated\n')
        self.assertEqual(sync.sync(), 1)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(self.db[self.ID], self.A)
        self.assertEqual(self.drops(), [])
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))
        self.assertEqual(self.db['docs/new'], '# unrelated\n')
        self.assertIn('删除与本地修改冲突', self.output.getvalue())
        self.assertEqual(sum(a == 'list' for a, _ in self.calls), 1)

    def test_no_baseline_also_protects_existing_local_file(self):
        sync.baseline({})
        self.assertEqual(sync.sync(), 1)
        self.assertEqual(self.path.read_text(), self.A)
        self.assertEqual(self.drops(), [])
        self.assertEqual(sync.baseline(), {})

    def test_remote_failure_keeps_local_baseline_and_remote_sidecar(self):
        sidecar = self.file('references/' + self.ID + '.json.remote', 'compare')
        self.fail_drop = True
        with self.assertRaisesRegex(RuntimeError, 'injected drop'):
            sync.take([self.ID], False)
        self.assertEqual(self.path.read_text(), self.A)
        self.assertEqual(sidecar.read_text(), 'compare')
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))

    def test_normal_sync_remote_failure_never_unlinks(self):
        self.fail_drop = True
        with self.assertRaisesRegex(RuntimeError, 'injected drop'):
            sync.sync()
        self.assertEqual(self.path.read_text(), self.A)
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))

    def test_delete_is_deduplicated_and_old_submission_cannot_restore(self):
        second = dict(self.subs[-1], _id='delete-again')
        self.subs.append(second)
        self.assertEqual(sync.sync(), 0)
        self.assertFalse(self.path.exists())
        self.assertNotIn(self.ID, self.db)
        self.assertNotIn(self.ID, sync.baseline())
        self.assertEqual(self.drops(), [self.ID])
        self.assertEqual(sum(a == 'list' for a, _ in self.calls), 1)
        self.assertEqual(sync.sync(), 0)
        self.assertFalse(self.path.exists())

    def test_mine_rejects_every_deletion_before_restoring(self):
        self.changed()
        self.subs.append(dict(self.subs[-1], _id='delete-again'))
        sidecar = self.file('references/' + self.ID + '.json.remote', self.A)
        sync.take([self.ID], True)
        actions = [a for a, _ in self.calls if a in ('mark', 'push')]
        self.assertEqual(actions, ['mark', 'mark', 'push'])
        self.assertFalse(sidecar.exists())
        self.assertEqual(self.db[self.ID], self.B)
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.B))
        self.assertEqual(sync.sync(), 0)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(self.drops(), [])

    def test_partial_rejection_failure_does_not_push_or_resolve(self):
        self.changed()
        self.subs.append(dict(self.subs[-1], _id='delete-again'))
        self.fail_mark = 'delete-again'
        sidecar = self.file('references/' + self.ID + '.json.remote', self.A)
        with self.assertRaisesRegex(RuntimeError, 'injected mark'):
            sync.take([self.ID], True)
        self.assertEqual(self.db[self.ID], self.A)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(sidecar.read_text(), self.A)
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))
        self.assertFalse(any(a == 'push' for a, _ in self.calls))

    def test_theirs_explicitly_accepts_delete_despite_local_edits(self):
        self.changed()
        sidecar = self.file('references/' + self.ID + '.json.remote', self.A)
        sync.take([self.ID], False)
        self.assertFalse(self.path.exists())
        self.assertFalse(sidecar.exists())
        self.assertNotIn(self.ID, sync.baseline())
        self.assertEqual(sync.sync(), 0)
        self.assertFalse(self.path.exists())
        self.assertNotIn(self.ID, self.db)

    def test_unlink_failure_reports_partial_state_and_rerun_conflicts(self):
        remove = os.remove

        def blocked(path):
            if str(path) == str(self.path):
                raise OSError('injected unlink failure')
            return remove(path)

        with patch.object(os, 'remove', blocked):
            with self.assertRaisesRegex(RuntimeError, '远端已删除，本地删除失败') as caught:
                sync.sync()
        self.assertIn(str(self.path), str(caught.exception))
        self.assertEqual(self.path.read_text(), self.A)
        self.assertNotIn(self.ID, self.db)
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))
        self.assertEqual(sync.sync(), 1)
        self.assertEqual(self.path.read_text(), self.A)
        sync.take([self.ID], True)
        self.assertEqual(sync.sync(), 0)
        self.assertEqual(self.db[self.ID], self.A)

    def test_successful_deletion_baseline_survives_later_push_failure(self):
        self.file('references/docs/later.md', '# later\n')
        self.fail_push = 'docs/later'
        with self.assertRaisesRegex(RuntimeError, 'injected push'):
            sync.sync()
        self.assertFalse(self.path.exists())
        self.assertNotIn(self.ID, sync.baseline())
        self.assertNotIn('docs/later', sync.baseline())

    def test_invalid_deletion_path_is_rejected_before_remote_write(self):
        self.subs[-1]['season'] = '../../../../escape'
        with self.assertRaisesRegex(RuntimeError, 'references/ 外面'):
            sync.sync()
        self.assertEqual(self.drops(), [])
        self.assertEqual(self.path.read_text(), self.A)


    def test_partial_push_receipt_and_rerun_preserve_completed_baseline(self):
        self.subs = []
        self.file('references/docs/a.md', self.A)
        self.file('references/docs/b.md', self.B)
        self.fail_push = 'docs/b'
        self.replace(sys, 'argv', ['sync.py'])
        with redirect_stderr(io.StringIO()):
            self.exits(sync.main)
        self.assertEqual(self.db['docs/a'], self.A)
        self.assertEqual(sync.baseline()['docs/a'], sync.sha1(self.A))
        self.assertNotIn('docs/b', sync.baseline())
        self.assertIn('已推送 docs/a', self.output.getvalue())
        self.assertNotIn('已推送 docs/b', self.output.getvalue())
        self.calls.clear()
        self.fail_push = ''
        self.assertEqual(sync.sync(), 0)
        self.assertEqual([kw['id'] for action, kw in self.calls if action == 'push'], ['docs/b'])

    def test_missing_parent_take_preserves_baseline(self):
        self.subs = []
        target = 'builds/s30-new/new-hunter'
        self.db[target] = self.B
        before = Path(sync.BASE).read_bytes()
        with self.assertRaises(RuntimeError) as caught:
            sync.take([target], False)
        self.assertIn(str(self.root / 'references/builds/s30-new'), str(caught.exception))
        self.assertIn('先创建', str(caught.exception))
        self.assertEqual(Path(sync.BASE).read_bytes(), before)
        self.assertFalse((self.root / 'references/builds/s30-new').exists())

    def test_landed_backfills_once_then_follows_the_disk(self):
        """landed 是审核台判「线上改过、还没落盘」的那一半，由对账一处写。"""
        self.subs = []
        # 这个字段是后加的，早先推上去的那些篇没有它。第一轮补齐。
        self.landed = {}
        self.assertEqual(sync.sync(), 0)
        self.assertEqual([kw for action, kw in self.calls if action == 'landed'],
                         [{'id': self.ID, 'hash': sync.sha1(self.A)}])

        # 补完就不再发。**稳态零调用**——每轮都重发一遍就是按篇数收费。
        self.calls.clear()
        self.assertEqual(sync.sync(), 0)
        self.assertEqual([kw for action, kw in self.calls if action == 'landed'], [])

        # 线上改过、本机拉下来：landed 跟着走到落盘的那一版，那一套因此退出「通过」档。
        self.db[self.ID] = self.B
        self.calls.clear()
        self.assertEqual(sync.sync(), 0)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(self.landed[self.ID], sync.sha1(self.B))

        # 本机改过推上去：push 顺手写了，不再多补一次。
        self.path.write_text(self.A, encoding='utf-8')
        self.calls.clear()
        self.assertEqual(sync.sync(), 0)
        self.assertEqual([kw for action, kw in self.calls if action == 'landed'], [])
        self.assertEqual(self.landed[self.ID], sync.sha1(self.A))

    def test_taking_theirs_moves_landed_to_the_version_on_disk(self):
        """--theirs 接受库里那份，landed 跟着走，不留一套常挂「已改」的配装。"""
        self.subs = []
        self.db[self.ID] = self.B
        self.path.write_text(self.B.replace('\n', ' \n'), encoding='utf-8')
        self.assertEqual(sync.sync(), 1)          # 两边都动过，撞车
        self.calls.clear()
        sync.take([self.ID], False)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(self.landed[self.ID], sync.sha1(self.B))
        # 只在不等时才发：云函数据此把写不进去当成那条 doc 没了。
        self.calls.clear()
        sync.take([self.ID], False)
        self.assertEqual([kw for action, kw in self.calls if action == 'landed'], [])


class SyncErrors(Isolated):
    def test_api_failure_context_does_not_leak_request_or_response(self):
        self.replace(sync, 'token', lambda: 'secret-token')
        for outcome in (TimeoutError('secret-body'),
                        urllib.error.HTTPError('secret-url', 503, 'secret-body', Message(), None),
                        SimpleNamespace(read=lambda: b'secret-body'),
                        SimpleNamespace(read=lambda: b'{"error":"conflict"}')):
            def response(*args, **kw):
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome
            self.replace(urllib.request, 'urlopen', response)
            with self.assertRaises(RuntimeError) as caught:
                sync.api('push', id='docs/a', gz='secret-gz')
            message = str(caught.exception)
            self.assertIn('push', message)
            self.assertIn('docs/a', message)
            if not isinstance(outcome, SimpleNamespace) or outcome.read() == b'secret-body':
                self.assertIn('结果可能未知', message)
            for secret in ('secret-token', 'secret-gz', 'secret-body', 'secret-url'):
                self.assertNotIn(secret, message)

    def test_rate_limit_backoff_is_unchanged(self):
        self.replace(sync, 'token', lambda: 'fixture')
        replies: list[Exception | SimpleNamespace] = [urllib.error.HTTPError('', 429, '', Message(), None)] * 4
        replies.append(SimpleNamespace(read=lambda: b'{"ok":1}'))
        def response(*args, **kw):
            result = replies.pop(0)
            if isinstance(result, Exception):
                raise result
            return result
        waits = []
        self.replace(urllib.request, 'urlopen', response)
        self.replace(sync.time, 'sleep', waits.append)
        self.assertEqual(sync.api('push', id='docs/a'), {'ok': 1})
        self.assertEqual(waits, [0.3, 1, 3, 8])


class BadSubmission(Isolated):
    """一篇解析不了的投稿不许把整轮对账带走。

    投稿的 markdown 在编辑台上改得动，而云函数那侧只校验首行以 `# ` 开头。改出
    一个没登记的头部键，migrate.parse() 就 markup.die()。对账排在 deploy.py 发
    文件之前且必须成功，所以那一篇会让整站发不出去，同一批里别的投稿也落不了盘。
    """

    SEASON = 's29-fixture'
    GOOD = '# 好的\n推荐人：甲\n'
    BAD = '# 坏的\n碎片1：这个键没登记\n'

    def setUp(self):
        super().setUp()
        self.replace(sync, 'ROOT', str(self.root))
        self.replace(sync, 'REFS', str(self.root / 'references'))
        (self.root / 'references' / 'builds' / self.SEASON).mkdir(parents=True)

    def subs(self, *pairs):
        return [{'_id': 'sub-' + slug, 'ok': 1, 'drop': 0,
                 'season': self.SEASON, 'slug': slug, 'md': md}
                for slug, md in pairs]

    def test_a_broken_submission_is_skipped_and_named(self):
        wrote = sync.land(self.subs(('bad-hunter', self.BAD),
                                    ('good-hunter', self.GOOD)))
        self.assertEqual(wrote, ['builds/%s/good-hunter' % self.SEASON],
                         '坏的那一篇应当跳过，好的那一篇照常落盘')
        said = self.output.getvalue()
        for want in ('sub-bad-hunter', 'builds/%s/bad-hunter' % self.SEASON, '碎片1'):
            self.assertIn(want, said, '跳过要说清是哪一篇、为什么：%s' % said)
        self.assertFalse((self.root / ('references/builds/%s/bad-hunter.json'
                                       % self.SEASON)).exists(), '解析不了就不该留半截文件')

    def test_other_failures_still_surface(self):
        """只接 markup.die() 那一种中止，别的异常照旧抛出去，不许被这层吞掉。"""
        def boom(*args, **kwargs):
            raise RuntimeError('别的毛病')
        self.replace(sync, 'as_source', boom)
        with self.assertRaises(RuntimeError):
            sync.land(self.subs(('good-hunter', self.GOOD)))


class Generation(Isolated):
    SOLO = ('# 示例\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n'
            '场景：突袭\n标签：输出\n分支：烈日\n强度：强力\n核心：测试超能\n\n## 职业\n'
            '职业：猎人\n超能：测试超能\n星相：\n碎片：\n\n## 武器\n\n'
            '## 护甲\n套装：测试套装 2 件\n\n## 神器\n神器：测试神器\n模组：\n\n'
            '## 六维\n六维：生命 ~ ｜ 近战 ~ ｜ 手雷 ~ ｜ 超能 ~ ｜ 职业 ~ ｜ 武器 ~\n')
    SET = ('# 示例合集\n合集：是\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n'
           '场景：突袭\n强度：强力\n\n' + SOLO + '\n'
           + SOLO.replace('# 示例\n', '# 第二套\n', 1))

    def build_file(self, path, md):
        """配装夹具：正文仍按 markdown 写（那样一眼看得出形状），落盘是结构化
        记录。两种形态一一对应，由 migrate.py --check 钉着。"""
        return self.file(path, migrate.dump(migrate.parse(md)))

    def setUp(self):
        super().setUp()
        self.replace(build.shell, 'ROOT', str(self.root))
        self.site = self.root / 'site'
        self.replace(build.shell, 'SITE', str(self.site))
        self.replace(build, 'SRC_DIR', str(self.root / 'references/builds'))
        self.replace(build, 'SEASON', 's29')
        self.replace(sys, 'argv', ['convert-build.py'])
        self.build_file('references/builds/s29-fixture/alpha-hunter.json', self.SOLO)
        self.beta = self.build_file('references/builds/s29-fixture/beta-hunter.json', self.SOLO)
        self.build_file('references/builds/s28-history/history-hunter.json', self.SOLO)
        self.orphan = self.file('site/builds/s29/orphan-hunter/index.html', 'orphan')
        self.unknown = self.file('site/builds/s29/orphan-hunter/notes.txt', 'keep unknown')
        self.file('site/builds/s29/orphan-hunter/style.css', 'keep style')
        self.file('site/builds/s29/orphan-hunter/icons/icon.webp', 'keep icon')
        self.file('site/builds/not-season/unknown/index.html', 'keep shape')
        self.file('tools/moves.json', '{}')
        self.file('tools/artifacts.json', '{"测试神器":{"icon":"fixture.webp"}}')
        self.home(False)
        rows = [('猎人', '分节', 'elements/class-abilities'),
                ('猎人', '分节', 'elements/solar'),
                ('测试超能', '超能技能', 'elements/solar'),
                ('测试套装', '2 件', 'armor-sets')]
        idx = {}
        for name, kind, page in rows:
            idx.setdefault(name, []).append(dict(name=name, kind=kind, page=page,
                icon='fixture.webp', token='', anchor='sec-1', q='', desc='示例说明'))
        self.replace(build.vocab, 'build', lambda: copy.deepcopy(idx))
        # 词表夹具声明没有页内搜索；落地校验、渲染、结构闸门与 emit 均走真实实现。
        self.replace(build.vocab, 'SEARCHABLE',
                     {page: False for page in build.vocab.sources()})

    def home(self, sets):
        links = [('builds/index.html', '配装'), ('builds/new/index.html', ''),
                 ('builds/new/set/index.html', '')]
        if sets:
            links.append(('builds/sets/index.html', '合集'))
        text = '<ul>' + ''.join('<li><a class="entry" href="%s"><span class="entry-stamp">'
            '更新 2020.1.1</span>%s</a></li>' % (href,
            '<dl><dt>%s</dt><dd>0</dd></dl>' % label if label else '')
            for href, label in links) + '</ul>'
        self.file('site/index.html', text)


    def test_index_facet_keys_match_the_cards(self):
        """工具条声明的每一维，都要能在卡片上读到值。

        app.js 那一维读的是 `it.dataset[键]`，键由 data-facets 里的 `名=键` 给。
        生成器改了卡片上的属性名而忘了改声明（或反过来），那一维会静默变成空表：
        整行不出，页面照旧渲染，三道闸门也照旧过——**这条是那种情形唯一的哨兵**。

        顺带钉住带 :tuck 的那几维在页面上有个落座的地方。生成器漏掉
        `[data-facet-tuck]` 时 app.js 退回工具条，面板照旧建得出来、页面照旧渲染，
        只是悄悄挪了位置——没有别的东西会报。
        """
        self.replace(sys, 'argv', ['convert-build.py'])
        build.main()
        page = (self.site / 'builds/index.html').read_text(encoding='utf-8')
        found = re.search(r'data-facets="([^"]+)"', page)
        self.assertIsNotNone(found, '索引页的工具条没有 data-facets')
        assert found is not None      # pyright：上一行已经保证了
        spec = found.group(1)
        dims = [d.split('=') for d in spec.split(';')]
        for name, mods in dims:
            key, *flags = mods.split(':')
            attr = 'data-' + re.sub(r'([A-Z])', r'-\1', key).lower()
            self.assertIn('%s="' % attr, page,
                          '维度「%s」声明读 %s，卡片上一张都没有' % (name, attr))
            if 'tuck' in flags:
                self.assertIn('data-facet-tuck', page,
                              '维度「%s」带 :tuck，页面却没有 [data-facet-tuck] '
                              '那个空容器，面板会悄悄退回工具条' % name)

    def test_source_errors_identify_file_and_collection_member(self):
        self.replace(sys, 'argv', ['convert-build.py', 'beta-hunter'])
        for md, missing, title in ((self.SOLO.replace('超能：测试超能\n', '').replace('核心：测试超能', '核心：测试套装'), '超能', '示例'),
                                   (self.SET.replace('# 第二套\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n场景：突袭\n标签：输出\n分支：烈日\n',
                                                     '# 第二套\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n场景：突袭\n标签：输出\n'), '分支', '第二套')):
            self.beta.write_text(as_record(md))
            error = self.exits(build.main)
            self.assertIn('references/builds/s29-fixture/beta-hunter.json', error)
            self.assertIn(missing, error)
            self.assertIn(title, error)

    def test_table_error_identifies_real_source_line_without_writing(self):
        doc = load('quality_doc_location', 'convert-doc.py')
        self.replace(doc.shell, 'ROOT', str(self.root))
        self.file('references/docs/fixture.md',
                  '# 示例\n描述：测试\n更新：2026.9.5\n\n## 正文\n'
                  '| 名称 | 说明 |\n|---|---|\n| 条目 |\n')
        self.file('site/fixture/style.css', '')
        out = self.file('site/fixture/index.html', 'previous page')
        error = self.exits(lambda: doc.build('fixture'))
        self.assertIn('references/docs/fixture.md', error)
        self.assertIn('第 8 行', error)
        self.assertIn('1 格', error)
        self.assertEqual(out.read_text(), 'previous page')

    def test_normalization_does_not_rescue_unknown_equipment(self):
        self.replace(items.shell, 'BUILD_DIR', str(self.root / 'references/builds'))
        self.beta.write_text(as_record(self.SOLO.replace('测试超能', '不存在的装备')),
                             encoding='utf-8')
        before = self.beta.read_bytes()
        with patch.object(items.shell, 'ROOT', str(TOOLS.parent)):
            terms, _ = items.load()
            forward = items.forward_terms()
        with patch.object(items, 'load', return_value=(terms, [])), \
                patch.object(items, 'forward_terms', return_value=forward):
            items.apply_builds()
        self.assertEqual(self.beta.read_bytes(), before)
        self.assertIn('不存在的装备', self.exits(build.main))



    def test_full_generation_prunes_only_orphan_html_across_all_seasons(self):
        self.beta.write_text(as_record(self.SET), encoding='utf-8')
        self.home(True)
        build.main()
        self.assertFalse(self.orphan.exists())
        self.assertEqual(self.unknown.read_text(), 'keep unknown')
        for path in ('builds/s29/orphan-hunter/style.css',
                     'builds/s29/orphan-hunter/icons/icon.webp',
                     'builds/not-season/unknown/index.html'):
            self.assertTrue((self.site / path).is_file(), path)
        for path in ('builds/s29/alpha-hunter/index.html', 'builds/s29/beta-hunter/index.html',
                     'builds/s28/history-hunter/index.html', 'builds/index.html',
                     'builds/sets/index.html', 'builds/new/index.html',
                     'builds/new/set/index.html', 'builds/vocab.js', 'builds/desc.js'):
            self.assertTrue((self.site / path).is_file(), path)
        self.assertIn('href="sets/index.html"', (self.site / 'builds/index.html').read_text())

    def test_a_build_without_an_artifact_drops_that_section(self):
        """「神器：」可省，省了那一节整个不出；写了模组却没写神器则中止。

        投稿的填表页允许七个神器格全空，生成器从前必须有那一行——两边口径
        不一致时，一份进得了库的源稿卡住整次构建，而卡住的那一篇与改动无关。
        """
        self.replace(sys, 'argv', ['convert-build.py', 'beta-hunter'])
        self.beta.write_text(as_record(self.SOLO.replace('神器：测试神器\n模组：\n', '')),
                             encoding='utf-8')
        build.main()
        page = (self.site / 'builds/s29/beta-hunter/index.html').read_text()
        self.assertNotIn('神器模组', page)

        self.beta.write_text(as_record(self.SOLO.replace('神器：测试神器\n', '')
                                       .replace('模组：', '模组：测试模组')),
                             encoding='utf-8')
        error = self.exits(build.main)
        self.assertIn('神器', error)
        self.assertIn('示例', error)

    def test_single_slug_never_prunes(self):
        self.replace(sys, 'argv', ['convert-build.py', 'alpha-hunter'])
        build.main()
        self.assertEqual(self.orphan.read_text(), 'orphan')
        self.assertFalse((self.site / 'builds/index.html').exists())

    def test_failed_detail_generation_never_prunes(self):
        self.beta.write_text('bad source', encoding='utf-8')
        self.exits(build.main)
        self.assertEqual(self.orphan.read_text(), 'orphan')

    def test_failed_form_generation_never_prunes(self):
        self.replace(build, 'render_new', lambda *a, **kw: (_ for _ in ()).throw(RuntimeError('form failure')))
        with self.assertRaisesRegex(RuntimeError, 'form failure'):
            build.main()
        self.assertEqual(self.orphan.read_text(), 'orphan')

    def test_empty_sources_do_not_clear_existing_site(self):
        for path in (self.root / 'references/builds').glob('*/*.json'):
            path.unlink()
        self.exits(build.main)
        self.assertEqual(self.orphan.read_text(), 'orphan')

    def test_last_set_removal_enforces_home_gate_then_removes_link(self):
        self.beta.write_text(as_record(self.SET), encoding='utf-8')
        self.home(True)
        build.main()
        self.beta.write_text(as_record(self.SOLO), encoding='utf-8')
        # 留一个孤儿，确认首页闸门失败时也不能开始详情清理。
        self.file('site/builds/s29/orphan-hunter/index.html', 'orphan')
        message = self.exits(build.main)
        self.assertIn('首页还挂着 builds/sets/index.html', message)
        self.assertFalse((self.site / 'builds/sets/index.html').exists())
        self.assertEqual(self.orphan.read_text(), 'orphan')
        self.home(False)
        build.main()
        self.assertFalse(self.orphan.exists())
        self.assertNotIn('href="sets/index.html"', (self.site / 'builds/index.html').read_text())
        self.assertNotIn('同一角色的多套配装', (self.site / 'builds/index.html').read_text())
        self.assertIn('href="new/index.html"', (self.site / 'builds/index.html').read_text())

    def test_old_season_set_stays_without_creating_current_set_entry(self):
        self.build_file('references/builds/s28-history/history-hunter.json', self.SET)
        build.main()
        self.assertTrue((self.site / 'builds/s28/history-hunter/index.html').is_file())
        self.assertFalse((self.site / 'builds/sets/index.html').exists())
        self.assertNotIn('href="sets/index.html"', (self.site / 'builds/index.html').read_text())

    def test_pruning_never_follows_season_detail_or_page_symlinks(self):
        external = self.file('outside/season/entry/index.html', 'external')
        (self.site / 'builds/s77').symlink_to(external.parent.parent, target_is_directory=True)
        (self.site / 'builds/s29/linked-hunter').symlink_to(external.parent, target_is_directory=True)
        page = self.site / 'builds/s29/linked-page/index.html'
        page.parent.mkdir()
        page.symlink_to(external)
        build.main()
        self.assertEqual(external.read_text(), 'external')
        self.assertTrue(page.is_symlink())
        self.assertTrue((self.site / 'builds/s77').is_symlink())
        self.assertTrue((self.site / 'builds/s29/linked-hunter').is_symlink())


class Normalization(Isolated):
    def setUp(self):
        super().setUp()
        terms, skipped = items.load()
        # 词表与正查排除表都从仓库这一份现取：它们读 tools/ 与 data/，与这里
        # 造的临时源稿无关，跟着 ROOT 搬会让每条测试都得先摆一套数据层。
        forward = items.forward_terms()
        self.replace(items, 'load', lambda: (terms, skipped))
        self.replace(items, 'forward_terms', lambda: forward)
        self.replace(items.shell, 'ROOT', str(self.root))
        self.replace(items.shell, 'SITE', str(self.root / 'site'))
        self.replace(items.shell, 'BUILD_DIR', str(self.root / 'references/builds'))
        self.kw = dict(terms=terms, names=sorted(terms, key=len, reverse=True),
                       banned=check_terms.banned_pairs())
        self.doc = self.file('references/docs/fixture.md', '# 示例\n\n## 正文\n')

    def test_unknown_targets_fail_without_writes_or_success_summary(self):
        before = self.doc.read_bytes()
        for option in ('--suggest', '--apply', '--normalize'):
            for slug in ('missing', 'fixture.md', 'changelog', 'palette'):
                self.output.seek(0)
                self.output.truncate()
                self.replace(sys, 'argv', ['items.py', option, slug])
                self.assertIn(slug, self.exits(items.main))
                self.assertNotIn('合计', self.output.getvalue())
                self.assertEqual(self.doc.read_bytes(), before)
            self.replace(sys, 'argv', ['items.py', option, 'fixture'])
            self.assertEqual(items.main(), 0)
        self.assertEqual(list(items.pages()), ['references/docs/fixture.md'])

    def test_all_real_term_errors_are_reported(self):
        self.doc.write_text('装填\n' * 65)
        self.file('site/assets/site.css', '')
        self.replace(check_terms, 'sources', lambda: [('references/docs/fixture.md', set())])
        for name in ('check_tokens', 'check_stamps', 'check_build_count',
                     'check_acts', 'check_palette', 'check_items'):
            self.replace(check_terms, name, lambda *args: set())
        errors = io.StringIO()
        with redirect_stderr(errors):
            self.assertEqual(check_terms.main(), 1)
        self.assertIn('fixture.md:65', errors.getvalue())
        self.assertEqual(errors.getvalue().count('G1 '), 65)

    def test_shared_corrections_and_real_gates(self):
        self.doc.write_text('# 示例\n\n## 正文\n装填后拾取能量球\n'
                            '{enemy|护甲充能} {el-arc|骨灰余烬}\n', encoding='utf-8')
        items.normalize('fixture', builds=False)
        self.assertEqual(self.doc.read_text(), '# 示例\n\n## 正文\n填装后拾取{orb|能量球}\n'
                         '{armor-charge|护甲充能} {el-solar|骨灰余烬}\n')
        bad = []
        check_terms.check_terms(['references/docs/fixture.md'], bad)
        check_terms.check_items(['references/docs/fixture.md'], bad)
        self.assertEqual(bad, [])

    def test_urls_keep_nested_and_semantic_wrappers(self):
        text = ('[boss](../boss-hp/index.html) ![](icons/装填-boss.png) '
                '重型弹药搜寻者 {el-void|残存回声} {el-arc|电弧元素能量球} '
                '{named|骨灰余烬} {note|{el-arc|骨灰余烬}}')
        result, fixed, tinted, colored = items.normalize_text(text, **self.kw)
        self.assertEqual(result, text.replace('[boss]', '[{bar-yellow|首领}]')
                         .replace('{note|{el-arc|骨灰余烬}}', '{note|{el-solar|骨灰余烬}}'))
        self.assertEqual((fixed, tinted, colored), (1, 1, 1))

    def test_all_collection_prose_and_section_boundaries(self):
        md = ('# 合集装填\n合集：是\n推荐人：装填\n核心：装填\n'
              '## 合集介绍\n能量球\n'
              '# 第一套装填\n描述：能量球\n## 注解\n缺点：能量球\n'
              '### 装填\n能量球\n## 武器\n传说武器：装填\n'
              '# 第二套装填\n描述：能量球\n## 护甲\n头盔：重型弹药搜寻者\n'
              '## 注解\n能量球\n')
        path = self.file('references/builds/s29-fixture/set.json', as_record(md))
        items.apply_builds()
        self.assertEqual(path.read_text(),
                         as_record(md.replace('能量球', '{orb|能量球}')))

    def test_table_identity_whitespace_and_idempotence(self):
        md = ('# 装填\r\n列组：装填 = 能量球\r\n## 正文\r\n'
              '| 装填 | 能量球 |\r\n|---|---|\r\n'
              '| 装填 |  装填能量球  |\r\n'
              '| | 装填 | 能量球 |\r\n'
              '| {named|装填} | 能量球 |\r\n'
              '| 装填\\\\能量球 | [boss](../boss-hp/index.html) |')
        self.doc.write_bytes(md.encode())
        self.doc.chmod(0o640)
        items.normalize('fixture', builds=False)
        expected = md.replace('|  装填能量球  |', '|  填装{orb|能量球}  |')
        expected = expected.replace('| | 装填 | 能量球 |', '| | 装填 | {orb|能量球} |')
        expected = expected.replace('| {named|装填} | 能量球 |',
                                    '| {named|装填} | {orb|能量球} |')
        expected = expected.replace('装填\\\\能量球', '装填\\\\{orb|能量球}')
        expected = expected.replace('[boss]', '[{bar-yellow|首领}]')
        self.assertEqual(self.doc.read_bytes(), expected.encode())
        self.assertEqual(self.doc.stat().st_mode & 0o777, 0o640)
        before = self.doc.stat().st_mtime_ns
        self.output.seek(0)
        self.output.truncate()
        items.normalize('fixture', builds=False)
        self.assertEqual(self.doc.read_bytes(), expected.encode())
        self.assertEqual(self.doc.stat().st_mtime_ns, before)
        self.assertIn('正名 0，纠色 0，补色 0；改动 0 个文件', self.output.getvalue())

    def test_conflict_preflight_and_failed_write_preserve_source(self):
        self.doc.write_text('## 正文\n能量球\n', encoding='utf-8')
        original = self.doc.read_bytes()
        terms = dict(self.kw['terms'])
        terms['护甲充能'] = ('el-solar', '冲突')
        with patch.object(items, 'load', return_value=(terms, [])):
            self.assertIn('词表冲突', self.exits(lambda: items.normalize('fixture')))
        self.assertEqual(self.doc.read_bytes(), original)
        with patch.object(items.os, 'replace', side_effect=OSError('write denied')):
            with self.assertRaisesRegex(OSError, 'write denied'):
                items.normalize('fixture', builds=False)
        self.assertEqual(self.doc.read_bytes(), original)
        self.assertEqual(list(self.doc.parent.iterdir()), [self.doc])

    def test_unknown_token_and_unclosed_marker_remain_rejected(self):
        text = '{unknown|无法确定} {orb|能量球'
        result = items.normalize_text(text, **self.kw)[0]
        self.assertEqual(result, text)
        self.doc.write_text('## 正文\n' + result, encoding='utf-8')
        bad = []
        self.file('tools/convert-armor-sets.py',
                  (TOOLS / 'convert-armor-sets.py').read_text(encoding='utf-8'))
        check_terms.check_tokens([('references/docs/fixture.md', set())], '', bad)
        self.assertTrue(any('unknown' in error for error in bad), bad)
        doc = load('quality_doc', 'convert-doc.py')
        self.exits(lambda: doc.wrap('p', '{orb|能量球'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
