#!/usr/bin/env python3
"""排版、CSS 有效性与产出结构的闸门。

这个仓库的纪律分布得很不均匀：颜色有 G1–G7 七道闸门，43 份样式表里 39 份一个裸色值
都没有；而字距、CSS 是否有效、产出的 HTML 结构一道闸门都没有，于是各自漂了很久。
三条检查各对应一个真发生过、且现有闸门一声不吭的缺陷：

  T1 中文不吃拉丁字距  `.block > .sect-label` 把基类的 .2em 封顶顶到 .24em，而资料页
                       502 个分节标题里 477 个是纯中文，12px 下每两字撑开 2.88px。
                       同病还有三处（神器模组的「使用限制」.28em、护甲套装常驻视口的
                       分类行 .24em、首页卡片字段名 .22em）。design.md 写着这条规矩，
                       但它是一句散文，不是断言，所以四处一起活了下来。
  T2 background 简写    `.src-tools` 写着 `background: var(--tint-3), var(--ink-lift)`。
                       简写里只有末层允许颜色，非末层写颜色整条声明作废，回落
                       transparent——而那条规则的注释正在论证这一层底为什么必要。
                       浏览器不报错，页面看着只是「淡了点」。
  T3 产出的结构        一次改动把 27 个 `<a class="entry">` 各复制了一份，形如
                       `href="x"<a class="entry" href="x">`。浏览器容错渲染正常，
                       check_shell.py 管外壳片段与更新时间、不看结构，一声不吭。

用法：python3 tools/check_type.py    改样式或改首页之后跑一次，已接进 npm run build。
"""

import os
import re
import sys
from html.parser import HTMLParser

import shell

CJK = re.compile(r'[㐀-鿿]')
# 站内自己的判据：design.md 二节「可能是纯中文的位置用 .2em 封顶」
CAP_EM = 0.2
# 跟踪这些标签的开闭配对。行内排版标签（em、strong、b、i、s）不跟——
# 它们在正文里由生成器成对出，出错会被逐字保真闸门先抓到。
PAIRED = ('a', 'li', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tr',
          'section', 'main', 'header', 'footer', 'nav', 'figure')


def read(rel: str) -> str:
    with open(os.path.join(shell.ROOT, rel), encoding='utf-8') as f:
        return f.read()


def css_files() -> list[str]:
    """全站样式表。现扫，不维护清单。"""
    out = []
    for base, dirs, names in os.walk(shell.ROOT):
        dirs[:] = [d for d in dirs
                   if not d.startswith(('.', 'node_modules', 'icons', 'references'))]
        for n in names:
            if n.endswith('.css'):
                out.append(os.path.relpath(os.path.join(base, n), shell.ROOT))
    return sorted(out)


def pages() -> list[str]:
    """全站产出的 HTML。首页手写、其余由生成器出，两种都要验。"""
    out = []
    for base, dirs, names in os.walk(shell.ROOT):
        dirs[:] = [d for d in dirs
                   if not d.startswith(('.', 'node_modules', 'icons', 'references', 'tools'))]
        for n in names:
            if n.endswith('.html'):
                out.append(os.path.relpath(os.path.join(base, n), shell.ROOT))
    return sorted(out)


def strip_comments(css: str) -> str:
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


# ── T1 ───────────────────────────────────────────────────────────────────────

class Texts(HTMLParser):
    """收「每个 class 底下出现过哪些文字」。只取直接文字，不含后代——
    字距施加在这个元素上，判据就该是它自己那一行字。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.by_class: dict[str, set[str]] = {}
        self.stack: list[tuple[str, list[str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ('br', 'img', 'meta', 'link', 'input', 'hr'):
            return
        cls = dict(attrs).get('class') or ''
        self.stack.append((tag, cls.split()))

    def handle_endtag(self, tag: str) -> None:
        # **按标签名配对弹**：空元素在 handle_starttag 里没入栈，无条件弹会让栈
        # 与文档错位，文字就记到上一层的 class 上去了。
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text or not self.stack:
            return
        for cls in self.stack[-1][1]:
            self.by_class.setdefault(cls, set()).add(text)


def wide_tracking(css: str) -> list[tuple[str, str, float]]:
    """(选择器, 主语 class, 字距) —— 字距超过封顶的那些规则。

    **主语取选择器最后一个 class**：`.block > .sect-label` 施加在 .sect-label 上，
    前面那些是限定条件。"""
    out = []
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', strip_comments(css)):
        hit = re.search(r'letter-spacing:\s*(\.\d+|\d+(?:\.\d+)?)em', m.group(2))
        if not hit:
            continue
        em = float(hit.group(1))            # `.24em` 与 `0.24em` 都读成 0.24
        if em <= CAP_EM:
            continue
        for sel in m.group(1).split(','):
            names = re.findall(r'\.([\w-]+)', sel)
            if names:
                out.append((sel.strip(), names[-1], em))
    return out


def check_tracking(bad: list[str]) -> int:
    seen: dict[str, set[str]] = {}
    for rel in pages():
        p = Texts()
        p.feed(read(rel))
        p.close()
        for cls, texts in p.by_class.items():
            seen.setdefault(cls, set()).update(texts)
    n = 0
    for rel in css_files():
        for sel, cls, em in wide_tracking(read(rel)):
            cjk = sorted(t for t in seen.get(cls, ()) if CJK.search(t))
            if not cjk:
                continue
            n += 1
            bad.append('T1 %s:%s 字距 %.2fem 超过 %.2fem 封顶，而它装的是中文：%s'
                       % (rel, sel, em, CAP_EM,
                          '、'.join(cjk[:3]) + ('…' if len(cjk) > 3 else '')))
    return n


# ── T2 ───────────────────────────────────────────────────────────────────────

COLOR = re.compile(r'^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|color-mix)\(|'
                   r'transparent$|currentcolor$|white$|black$)', re.I)


def root_colors(site: str) -> set[str]:
    """`:root` 里取值是颜色的那些变量名。判据只看右值长什么样，不硬编名单。"""
    block = re.search(r':root\s*\{(.*?)\n\}', strip_comments(site), re.S)
    out = set()
    for name, val in re.findall(r'--([\w-]+):\s*([^;]+);', block.group(1) if block else ''):
        if COLOR.match(val.strip()):
            out.add(name)
    # 语义层是一对一转发（--el-arc: var(--c-arc)），跟着上游算
    for _ in range(3):
        for name, val in re.findall(r'--([\w-]+):\s*var\(--([\w-]+)\)',
                                    block.group(1) if block else ''):
            if val in out:
                out.add(name)
    return out


def layers(value: str) -> list[str]:
    """按顶层逗号切图层。括号里的逗号是 gradient 自己的参数，不切。"""
    out, depth, cur = [], 0, ''
    for ch in value:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur.strip())
            cur = ''
        else:
            cur += ch
    out.append(cur.strip())
    return out


def check_background(bad: list[str], colors: set[str]) -> int:
    n = 0
    for rel in css_files():
        for m in re.finditer(r'(?<![\w-])background:\s*([^;{}]+);', strip_comments(read(rel))):
            parts = layers(m.group(1))
            if len(parts) < 2:
                continue
            for layer in parts[:-1]:                       # 末层允许颜色，其余不允许
                var = re.fullmatch(r'var\(--([\w-]+)\)', layer)
                if COLOR.match(layer) or (var and var.group(1) in colors):
                    n += 1
                    bad.append('T2 %s：background 简写的非末层写了颜色（%s），'
                               '整条声明作废、回落 transparent。'
                               '要叠一层纯色写成 linear-gradient(<色>, <色>)'
                               % (rel, layer))
                    break
    return n


# ── T3 ───────────────────────────────────────────────────────────────────────

class Shape(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.open: list[tuple[str, tuple[int, int]]] = []
        self.bad: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, _ in attrs:
            # `<a href="x"<a href="x">` 会被解析成一个名叫 `<a` 的属性
            if '<' in name or '>' in name:
                self.bad.append('第 %d 行 <%s> 上有个名叫 %r 的属性，'
                                '多半是开标签被复制了一份' % (self.getpos()[0], tag, name))
        if tag in PAIRED:
            self.open.append((tag, self.getpos()))

    def handle_endtag(self, tag: str) -> None:
        if tag not in PAIRED:
            return
        if self.open and self.open[-1][0] == tag:
            self.open.pop()
        else:
            near = self.open[-1] if self.open else None
            self.bad.append('第 %d 行 </%s> 配不上，最近的未闭合是 %s'
                            % (self.getpos()[0], tag, near))


def check_shape(bad: list[str]) -> int:
    n = 0
    for rel in pages():
        p = Shape()
        p.feed(read(rel))
        p.close()
        for line in p.bad + ['第 %d 行 <%s> 没有闭合' % (pos[0], tag)
                             for tag, pos in p.open]:
            n += 1
            bad.append('T3 %s：%s' % (rel, line))
    return n


def main() -> int:
    bad: list[str] = []
    n1 = check_tracking(bad)
    n2 = check_background(bad, root_colors(read('assets/site.css')))
    n3 = check_shape(bad)
    if bad:
        print('排版与结构不一致：', file=sys.stderr)
        for line in bad:
            print('  ' + line, file=sys.stderr)
        return 1
    print('排版与结构一致：%d 份样式表，%d 个页面（字距 %d、简写 %d、结构 %d）'
          % (len(css_files()), len(pages()), n1, n2, n3))
    return 0


if __name__ == '__main__':
    sys.exit(main())
