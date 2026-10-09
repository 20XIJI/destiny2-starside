#!/usr/bin/env python3
"""排版、CSS 有效性与产出结构的闸门。

T1／T2 只看样式表。T3 在 shell.emit() 落盘前验刚写出的那一份 HTML；
本脚本只补手写页（首页、编辑台）——生成器是唯一作者，不必事后全站回溯。

  T1 中文不吃拉丁字距  字距超过 .2em 的规则，主语 class 必须是拉丁专名（现只放行 .en）。
                       从前要扫全站 HTML 看「这个 class 有没有装中文」；那是把产物当源稿。
  T2 background 简写    非末层不许写颜色，整条声明否则作废。
  T3 产出的结构        开闭配对、开标签被复制一份时冒出的坏属性。生成页走 emit()。

用法：python3 tools/check_type.py    改样式或改首页之后跑一次，已接进 npm run build。
"""
import os
import re
import sys
from html.parser import HTMLParser

import shell

# 站内自己的判据：design.md 二节「可能是纯中文的位置用 .2em 封顶」
CAP_EM = 0.2
# 超过封顶仍合法的主语 class：英文专名，字距按拉丁排。
LATIN = frozenset({'en'})
# 跟踪这些标签的开闭配对。行内排版标签（em、strong、b、i、s）不跟——
# 它们在正文里由生成器成对出，出错会被逐字保真闸门先抓到。
PAIRED = ('a', 'li', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tr',
          'section', 'main', 'header', 'footer', 'nav', 'figure')


def read(rel: str) -> str:
    with open(os.path.join(shell.SITE, rel), encoding='utf-8') as f:
        return f.read()


def css_files() -> list[str]:
    """全站样式表。现扫，不维护清单。"""
    out = []
    for base, dirs, names in os.walk(shell.SITE):
        dirs[:] = [d for d in dirs if not d.startswith(('.', 'icons'))]
        for n in names:
            if n.endswith('.css'):
                out.append(os.path.relpath(os.path.join(base, n), shell.SITE))
    return sorted(out)


def handwritten() -> list[str]:
    """不经 emit() 的 HTML：首页手写，编辑台手写。"""
    out = ['index.html']
    admin = os.path.join(shell.SITE, 'admin')
    if os.path.isdir(admin):
        for n in os.listdir(admin):
            if n.endswith('.html'):
                out.append(os.path.join('admin', n).replace('\\', '/'))
    return sorted(out)


def strip_comments(css: str) -> str:
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


class Page(HTMLParser):
    """T3：PAIRED 标签开闭配对，以及开标签被复制一份时冒出来的坏属性。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[str] = []
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
        if tag in ('br', 'img', 'meta', 'link', 'input', 'hr'):
            return
        self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i] == tag:
                del self.stack[i:]
                break
        if tag not in PAIRED:
            return
        if self.open and self.open[-1][0] == tag:
            self.open.pop()
        else:
            near = self.open[-1] if self.open else None
            self.bad.append('第 %d 行 </%s> 配不上，最近的未闭合是 %s'
                            % (self.getpos()[0], tag, near))


def check_html(html: str, rel: str) -> list[str]:
    """一份 HTML 的 T3 报错行，不含文件名前缀。"""
    p = Page()
    p.feed(html)
    p.close()
    return p.bad + ['第 %d 行 <%s> 没有闭合' % (pos[0], tag) for tag, pos in p.open]


def assert_shape(html: str, rel: str) -> None:
    """emit() 落盘前调用。坏了当场中止，不写出半成品。"""
    bad = check_html(html, rel)
    if bad:
        sys.exit('T3 %s：%s' % (rel, bad[0]))


# ── T1 ───────────────────────────────────────────────────────────────────────


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
    n = 0
    for rel in css_files():
        for sel, cls, em in wide_tracking(read(rel)):
            if cls in LATIN:
                continue
            n += 1
            bad.append('T1 %s:%s 字距 %.2fem 超过 %.2fem 封顶'
                       % (rel, sel, em, CAP_EM))
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


# ── T3 手写页 ────────────────────────────────────────────────────────────────


def check_shape(bad: list[str]) -> int:
    n = 0
    for rel in handwritten():
        for line in check_html(read(rel), rel):
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
    print('排版与结构一致：%d 份样式表，手写 %d 页（字距 %d、简写 %d、结构 %d）'
          % (len(css_files()), len(handwritten()), n1, n2, n3))
    return 0


if __name__ == '__main__':
    sys.exit(main())
