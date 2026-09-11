#!/usr/bin/env python3
"""离线回归：部署闸门、审核删除三方比、配装生成生命周期。

python3 tools/check_quality.py
只用标准库；真实入口搭配内存 API/命令替身，全部写入独占 TemporaryDirectory。
不读取令牌、不启动子进程、不连接网络。生成器只替换资料词表来源，渲染与落盘走实码。
"""
import base64
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
import items
import markup

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
        self.replace(deploy, 'ROOT', self.root)
        self.replace(deploy, 'git', forbidden)
        self.replace(search.shell, 'pages', forbidden)
        self.replace(terms, 'build', forbidden)
        for module, cases in (
            (deploy, [('--help', 0), ('--dryrun', 2), ('--all --pruen', 2),
                      ('--check --all', 2), ('--prune', 2), ('--dry', 2), ('extra', 2)]),
            (search, [('--help', 0), ('--dry-run', 2)]),
            (terms, [('--help', 0), ('--dry-run', 2)]),
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

    ROOT = TOOLS.parent
    ANCHOR = re.compile(r'<main[^>]*\sdata-src="([^"]*)"')

    def test_every_data_src_resolves_to_a_source_file(self):
        seen = 0
        for page in sorted(self.ROOT.rglob('index.html')):
            if '.archived' in page.parts or 'node_modules' in page.parts:
                continue
            hit = self.ANCHOR.search(page.read_text(encoding='utf-8'))
            if not hit:
                continue
            seen += 1
            doc = hit.group(1)
            # 换算走 sync.path_of()，不在这里另写一份：这条断言要证的就是
            # data-src 与 id_of() 那条算法对得上，自己再推一遍等于跟自己的副本对账。
            with self.subTest(page=str(page.relative_to(self.ROOT))):
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
        self.assertGreater(seen, 10000, '只比对了 %d 个括号边界点，语料没读到？' % seen)


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
        self.assertGreater(sum(1 for _ in self.rows()), 4000)



class ArtifactPicker(unittest.TestCase):
    """填表页挑神器模组，靠 form.js 的 bare() 把分节标题「废墟石板 （异端）」切成
    神器名。切分符号从前在 vocab.bare_kind 与 form.js 各写一份，改一处就错开：
    七个神器格全部列不出候选，而页面照常渲染、三道闸门全绿；那时这条测试只能
    拿正则去 form.js 的源码里刮那个字面量。

    现在符号随 vocab.js 发过去（vocab.KIND_TAIL 一处定义），这里读那个字段，
    断言七件神器各自收得到自己那 21 枚模组。
    """

    ROOT = TOOLS.parent
    VOCAB = ROOT / 'builds' / 'vocab.js'

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
        form = (self.ROOT / 'builds' / 'new' / 'form.js').read_text(encoding='utf-8')
        self.assertIn('split(V.sep)', form,
                      'form.js 又自己写了一份切分符号，应该读 vocab.js 带过来的那个')
        mods = self.rows(vocab, '神器')
        self.assertGreater(len(mods), 100, '神器模组词表是空的，先跑一次 npm run build')
        for name, *_ in self.rows(vocab, '神器本体'):
            hit = [m for m in mods if m[1].split(sep)[0].strip() == name]
            self.assertTrue(hit, '填表页选中「%s」之后一枚模组都列不出来：'
                                 'form.js 的 bare() 按 %r 切，词表里的分节是 %r'
                            % (name, sep, mods[0][1]))


class Generated(unittest.TestCase):
    """入库的生成物与它们的来源对得上。

    `admin/terms.js` 与 `admin/pages.js` 是「Python 定义 → 浏览器只认数据」那条
    管道的产物，而 `npm run build` 里 build-terms.py 排在三道闸门之前——闸门那一侧
    永远看到的是刚生成的那一份，查不出过期。这条放在 `npm test` 里才不是空转。

    过期的后果不是少一个词：G6 的匹配规则（中英之间那个排版空格允许回来）
    如今也是随词表送过去的数据，词表旧了，编辑台的提示就按旧规则走。
    """

    def read(self, rel):
        return (TOOLS.parent / rel).read_text(encoding='utf-8')

    def test_terms_table_matches_its_sources(self):
        self.assertEqual(build_terms.build(), self.read('admin/terms.js'),
                         'admin/terms.js 过期了，跑 python3 tools/build-terms.py')

    def test_page_tree_matches_its_sources(self):
        self.assertEqual(build_terms.tree(), self.read('admin/pages.js'),
                         'admin/pages.js 过期了，跑 python3 tools/build-terms.py')

    def test_the_cloud_function_carries_the_same_dialect(self):
        # 云函数只 require 得到自己目录下的东西，所以那一份是复制过去的。
        self.assertEqual(self.read('functions/api/dialect.js'), self.read('admin/dialect.js'),
                         'functions/api/dialect.js 与 admin/dialect.js 分家了，跑一次构建')


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
        terms, _ = items.load()
        kw = dict(terms=terms, names=sorted(terms, key=len, reverse=True),
                  banned=[(w, t[0]) for t in check_terms.TERMS for w in t[2]])
        seen, bad = 0, []
        for path in items.build_pages():
            lines = Path(path).read_text(encoding='utf-8').splitlines()
            for i, off in items.prose_spans(lines).items():
                text = lines[i][off:]
                if '{' not in text:
                    continue
                seen += 1
                if items.normalize_text(markup.uncolor(text), **kw)[0] != text:
                    bad.append('%s:%d' % (os.path.relpath(path, items.shell.ROOT), i + 1))
        # 一行都没读到时这条也是全绿：配装源稿挪了地方就当场报出来。
        self.assertGreater(seen, 100, '只读到 %d 行带着色的配装散文，路径变了？' % seen)
        self.assertEqual(bad, [], '剥掉标记再补色补不回原样：\n  ' + '\n  '.join(bad))


class DeploySelection(unittest.TestCase):
    """发什么、剥不剥注释、清单怎么读——四个纯函数各自的判据。

    这些断言从前挂在 `deploy.py --check` 上，而那个选项**没有任何调用方**：
    package.json、ship.sh、.github 里都不拉它。keep()/uncomment()/strippable()/
    listing() 因此是发布链上唯一没有网的四个函数，而剥错注释的症状是
    「页面正常、闸门全绿，只是搜不到东西」。
    """

    def test_site_files_ship_and_sources_do_not(self):
        self.assertTrue(deploy.keep('armor-mods/icons/0a1b2c3d4e.webp'))
        self.assertTrue(deploy.keep('index.html') and deploy.keep('assets/search.js'))
        self.assertTrue(deploy.keep('admin/index.html') and deploy.keep('admin/terms.js'))
        self.assertFalse(deploy.keep('tools/deploy.py'))
        self.assertFalse(deploy.keep('references/docs/changelog.md'))
        self.assertFalse(deploy.keep('CLAUDE.md') or deploy.keep('cloudbaserc.json'))

    def test_listing_drops_the_files_that_never_ship(self):
        self.assertEqual(deploy.listing('a.md\0index.html\0'), ['index.html'])

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
                                   'assets/chart.js', 'assets/rota.js', 'assets/home.js')
                   if not deploy.strippable((TOOLS.parent / rel).read_text(encoding='utf-8'))]
        self.assertEqual(skipped, [], '这些文件的字符串里出现了 /* 或 */，整个文件会原样发')


class Deployment(Isolated):
    TARGET = '1' * 40

    def setUp(self):
        super().setUp()
        self.file('cloudbaserc.json', '{"envId":"offline-fixture"}')
        self.file('index.html', 'published contents')
        self.replace(deploy, 'ROOT', self.root)
        self.replace(sys, 'argv', ['deploy.py'])
        self.statuses = ['', '', '', '', '']
        self.heads = [self.TARGET] * 5
        self.files = 'index.html\0'
        self.gone = 'old/index.html\0'
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
        self.files, self.gone = 'index.html\0new/index.html\0', 'old/index.html\0'
        self.assertEqual(deploy.plan(False, self.base, self.TARGET),
                         (['index.html', 'new/index.html'], ['old/index.html']))
        self.assertEqual(deploy.plan(True, self.base, self.TARGET),
                         (['index.html', 'new/index.html'], []))

    def test_the_manifest_never_ships_sources_or_tools(self):
        self.files = 'index.html\0tools/deploy.py\0CLAUDE.md\0references/docs/a.md\0'
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
        self.statuses[3] = ' M index.html'
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
    A = '# A\n'
    B = '# B\n'

    def setUp(self):
        super().setUp()
        self.replace(sync, 'ROOT', str(self.root))
        self.replace(sync, 'REFS', str(self.root / 'references'))
        self.replace(sync, 'BASE', str(self.root / '.git/starside-sync.json'))
        self.path = self.file('references/' + self.ID + '.md', self.A)
        self.file('.git/starside-sync.json', json.dumps({self.ID: sync.sha1(self.A)}))
        self.db = {self.ID: self.A}
        self.landed = {self.ID: sync.sha1(self.A)}
        self.subs = [
            {'_id': 'approved', 'ok': 1, 'drop': 0, 'season': 's29-fixture',
             'slug': 'one-hunter', 'md': self.A},
            {'_id': 'delete', 'ok': 1, 'drop': 1, 'season': 's29-fixture',
             'slug': 'one-hunter', 'md': self.A},
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
        sidecar = self.file('references/' + self.ID + '.md.remote', 'compare')
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
        sidecar = self.file('references/' + self.ID + '.md.remote', self.A)
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
        sidecar = self.file('references/' + self.ID + '.md.remote', self.A)
        with self.assertRaisesRegex(RuntimeError, 'injected mark'):
            sync.take([self.ID], True)
        self.assertEqual(self.db[self.ID], self.A)
        self.assertEqual(self.path.read_text(), self.B)
        self.assertEqual(sidecar.read_text(), self.A)
        self.assertEqual(sync.baseline()[self.ID], sync.sha1(self.A))
        self.assertFalse(any(a == 'push' for a, _ in self.calls))

    def test_theirs_explicitly_accepts_delete_despite_local_edits(self):
        self.changed()
        sidecar = self.file('references/' + self.ID + '.md.remote', self.A)
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


class Generation(Isolated):
    SOLO = ('# 示例\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n'
            '场景：突袭\n标签：输出\n分支：烈日\n强度：强力\n核心：测试超能\n\n## 职业\n'
            '职业：猎人\n超能：测试超能\n星相：\n碎片：\n\n## 武器\n\n'
            '## 护甲\n套装：测试套装 2 件\n\n## 神器\n神器：测试神器\n模组：\n\n'
            '## 六维\n六维：生命 ~ ｜ 近战 ~ ｜ 手雷 ~ ｜ 超能 ~ ｜ 职业 ~ ｜ 武器 ~\n')
    SET = ('# 示例合集\n合集：是\n推荐人：示例作者\n描述：示例说明\n更新：2026.9.5\n'
           '场景：突袭\n强度：强力\n\n' + SOLO + '\n'
           + SOLO.replace('# 示例\n', '# 第二套\n', 1))

    def setUp(self):
        super().setUp()
        self.replace(build.shell, 'ROOT', str(self.root))
        self.replace(build, 'SRC_DIR', str(self.root / 'references/builds'))
        self.replace(build, 'SEASON', 's29')
        self.replace(sys, 'argv', ['convert-build.py'])
        self.file('references/builds/s29-fixture/alpha-hunter.md', self.SOLO)
        self.beta = self.file('references/builds/s29-fixture/beta-hunter.md', self.SOLO)
        self.file('references/builds/s28-history/history-hunter.md', self.SOLO)
        self.orphan = self.file('builds/s29/orphan-hunter/index.html', 'orphan')
        self.unknown = self.file('builds/s29/orphan-hunter/notes.txt', 'keep unknown')
        self.file('builds/s29/orphan-hunter/style.css', 'keep style')
        self.file('builds/s29/orphan-hunter/icons/icon.webp', 'keep icon')
        self.file('builds/not-season/unknown/index.html', 'keep shape')
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
        self.replace(build.vocab, 'SEARCHABLE', {page: False for page in build.vocab.TOKENS})

    def home(self, sets):
        links = [('builds/index.html', '配装'), ('builds/new/index.html', ''),
                 ('builds/new/set/index.html', '')]
        if sets:
            links.append(('builds/sets/index.html', '合集'))
        text = '<ul>' + ''.join('<li><a class="entry" href="%s"><span class="entry-stamp">'
            '更新 2020.1.1</span>%s</a></li>' % (href,
            '<dl><dt>%s</dt><dd>0</dd></dl>' % label if label else '')
            for href, label in links) + '</ul>'
        self.file('index.html', text)


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
        page = (self.root / 'builds/index.html').read_text(encoding='utf-8')
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
            self.beta.write_text(md)
            error = self.exits(build.main)
            self.assertIn('references/builds/s29-fixture/beta-hunter.md', error)
            self.assertIn(missing, error)
            self.assertIn(title, error)

    def test_table_error_identifies_real_source_line_without_writing(self):
        doc = load('quality_doc_location', 'convert-doc.py')
        self.replace(doc, 'SRC_DIR', str(self.root / 'references/docs'))
        self.file('references/docs/fixture.md',
                  '# 示例\n描述：测试\n更新：2026.9.5\n\n## 正文\n'
                  '| 名称 | 说明 |\n|---|---|\n| 条目 |\n')
        self.file('fixture/style.css', '')
        out = self.file('fixture/index.html', 'previous page')
        error = self.exits(lambda: doc.build('fixture'))
        self.assertIn('references/docs/fixture.md', error)
        self.assertIn('第 8 行', error)
        self.assertIn('1 格', error)
        self.assertEqual(out.read_text(), 'previous page')

    def test_normalization_does_not_rescue_unknown_equipment(self):
        self.replace(items.shell, 'BUILD_DIR', str(self.root / 'references/builds'))
        self.beta.write_text(self.SOLO.replace('测试超能', '不存在的装备'),
                             encoding='utf-8')
        before = self.beta.read_bytes()
        with patch.object(items.shell, 'ROOT', str(TOOLS.parent)):
            terms, _ = items.load()
        with patch.object(items, 'load', return_value=(terms, [])):
            items.apply_builds()
        self.assertEqual(self.beta.read_bytes(), before)
        self.assertIn('不存在的装备', self.exits(build.main))



    def test_full_generation_prunes_only_orphan_html_across_all_seasons(self):
        self.beta.write_text(self.SET, encoding='utf-8')
        self.home(True)
        build.main()
        self.assertFalse(self.orphan.exists())
        self.assertEqual(self.unknown.read_text(), 'keep unknown')
        for path in ('builds/s29/orphan-hunter/style.css',
                     'builds/s29/orphan-hunter/icons/icon.webp',
                     'builds/not-season/unknown/index.html'):
            self.assertTrue((self.root / path).is_file(), path)
        for path in ('builds/s29/alpha-hunter/index.html', 'builds/s29/beta-hunter/index.html',
                     'builds/s28/history-hunter/index.html', 'builds/index.html',
                     'builds/sets/index.html', 'builds/new/index.html',
                     'builds/new/set/index.html', 'builds/vocab.js', 'builds/desc.js'):
            self.assertTrue((self.root / path).is_file(), path)
        self.assertIn('href="sets/index.html"', (self.root / 'builds/index.html').read_text())

    def test_a_build_without_an_artifact_drops_that_section(self):
        """「神器：」可省，省了那一节整个不出；写了模组却没写神器则中止。

        投稿的填表页允许七个神器格全空，生成器从前必须有那一行——两边口径
        不一致时，一份进得了库的源稿卡住整次构建，而卡住的那一篇与改动无关。
        """
        self.replace(sys, 'argv', ['convert-build.py', 'beta-hunter'])
        self.beta.write_text(self.SOLO.replace('神器：测试神器\n模组：\n', ''),
                             encoding='utf-8')
        build.main()
        page = (self.root / 'builds/s29/beta-hunter/index.html').read_text()
        self.assertNotIn('神器模组', page)

        self.beta.write_text(self.SOLO.replace('神器：测试神器\n', '')
                             .replace('模组：', '模组：测试模组'), encoding='utf-8')
        error = self.exits(build.main)
        self.assertIn('神器', error)
        self.assertIn('示例', error)

    def test_single_slug_never_prunes(self):
        self.replace(sys, 'argv', ['convert-build.py', 'alpha-hunter'])
        build.main()
        self.assertEqual(self.orphan.read_text(), 'orphan')
        self.assertFalse((self.root / 'builds/index.html').exists())

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
        for path in (self.root / 'references/builds').glob('*/*.md'):
            path.unlink()
        self.exits(build.main)
        self.assertEqual(self.orphan.read_text(), 'orphan')

    def test_last_set_removal_enforces_home_gate_then_removes_link(self):
        self.beta.write_text(self.SET, encoding='utf-8')
        self.home(True)
        build.main()
        self.beta.write_text(self.SOLO, encoding='utf-8')
        # 留一个孤儿，确认首页闸门失败时也不能开始详情清理。
        self.file('builds/s29/orphan-hunter/index.html', 'orphan')
        message = self.exits(build.main)
        self.assertIn('首页还挂着 builds/sets/index.html', message)
        self.assertFalse((self.root / 'builds/sets/index.html').exists())
        self.assertEqual(self.orphan.read_text(), 'orphan')
        self.home(False)
        build.main()
        self.assertFalse(self.orphan.exists())
        self.assertNotIn('href="sets/index.html"', (self.root / 'builds/index.html').read_text())
        self.assertNotIn('同一角色的多套配装', (self.root / 'builds/index.html').read_text())
        self.assertIn('href="new/index.html"', (self.root / 'builds/index.html').read_text())

    def test_old_season_set_stays_without_creating_current_set_entry(self):
        self.file('references/builds/s28-history/history-hunter.md', self.SET)
        build.main()
        self.assertTrue((self.root / 'builds/s28/history-hunter/index.html').is_file())
        self.assertFalse((self.root / 'builds/sets/index.html').exists())
        self.assertNotIn('href="sets/index.html"', (self.root / 'builds/index.html').read_text())

    def test_pruning_never_follows_season_detail_or_page_symlinks(self):
        external = self.file('outside/season/entry/index.html', 'external')
        (self.root / 'builds/s77').symlink_to(external.parent.parent, target_is_directory=True)
        (self.root / 'builds/s29/linked-hunter').symlink_to(external.parent, target_is_directory=True)
        page = self.root / 'builds/s29/linked-page/index.html'
        page.parent.mkdir()
        page.symlink_to(external)
        build.main()
        self.assertEqual(external.read_text(), 'external')
        self.assertTrue(page.is_symlink())
        self.assertTrue((self.root / 'builds/s77').is_symlink())
        self.assertTrue((self.root / 'builds/s29/linked-hunter').is_symlink())


class Normalization(Isolated):
    def setUp(self):
        super().setUp()
        terms, skipped = items.load()
        self.replace(items, 'load', lambda: (terms, skipped))
        self.replace(items.shell, 'ROOT', str(self.root))
        self.replace(items.shell, 'BUILD_DIR', str(self.root / 'references/builds'))
        self.kw = dict(terms=terms, names=sorted(terms, key=len, reverse=True),
                       banned=[(w, t[0]) for t in check_terms.TERMS for w in t[2]])
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
        self.file('assets/site.css', '')
        self.replace(check_terms, 'SRC_FILES', [])
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
        path = self.file('references/builds/s29-fixture/set.md', md)
        items.apply_builds()
        self.assertEqual(path.read_text(), md.replace('能量球', '{orb|能量球}'))

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
