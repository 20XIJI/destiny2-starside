#!/usr/bin/env python3
"""排版、CSS 有效性与产出结构的闸门。

T1／T2 只看样式表。T3 在 shell.emit() 落盘前验刚写出的那一份 HTML；
本脚本只补手写页（首页、编辑台）——生成器是唯一作者，不必事后全站回溯。

  T1 中文不吃拉丁字距  字距超过 .2em 的规则，主语 class 必须是拉丁专名（现只放行 .en）。
  T2 background 简写    非末层不许写颜色，整条声明否则作废。
  T3 产出的结构        开闭配对、开标签被复制一份时冒出的坏属性。生成页走 emit()。
  T4 整数阶梯与残留    禁小数像素字号、已退役的 --font-read，以及页面无 .gen 表时残留的 .gen 选择器。

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
LATIN = frozenset({"en"})
# 跟踪这些标签的开闭配对。行内排版标签（em、strong、b、i、s）不跟——
# 它们在正文里由生成器成对出，出错会被逐字保真闸门先抓到。
PAIRED = (
    "a",
    "li",
    "ul",
    "ol",
    "dl",
    "table",
    "thead",
    "tbody",
    "tr",
    "section",
    "main",
    "header",
    "footer",
    "nav",
    "figure",
)


def read(rel: str) -> str:
    with open(os.path.join(shell.SITE, rel), encoding="utf-8") as f:
        return f.read()


def css_files() -> list[str]:
    """全站样式表。现扫，不维护清单。"""
    out = []
    for base, dirs, names in os.walk(shell.SITE):
        dirs[:] = [d for d in dirs if not d.startswith((".", "icons"))]
        for n in names:
            if n.endswith(".css"):
                out.append(os.path.relpath(os.path.join(base, n), shell.SITE))
    return sorted(out)


def handwritten() -> list[str]:
    """不经 emit() 的 HTML：首页、404、光尘商店与编辑台手写。"""
    out = ["index.html", "404.html", "eververse/index.html"]
    admin = os.path.join(shell.SITE, "admin")
    if os.path.isdir(admin):
        for n in os.listdir(admin):
            if n.endswith(".html"):
                out.append(os.path.join("admin", n).replace("\\", "/"))
    return sorted(out)


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


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
            if "<" in name or ">" in name:
                self.bad.append(
                    "第 %d 行 <%s> 上有个名叫 %r 的属性，"
                    "多半是开标签被复制了一份" % (self.getpos()[0], tag, name)
                )
        if tag in PAIRED:
            self.open.append((tag, self.getpos()))
        if tag in ("br", "img", "meta", "link", "input", "hr"):
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
            self.bad.append(
                "第 %d 行 </%s> 配不上，最近的未闭合是 %s"
                % (self.getpos()[0], tag, near)
            )


def check_html(html: str, rel: str) -> list[str]:
    """一份 HTML 的 T3 报错行，不含文件名前缀。"""
    p = Page()
    p.feed(html)
    p.close()
    return p.bad + ["第 %d 行 <%s> 没有闭合" % (pos[0], tag) for tag, pos in p.open]


def assert_shape(html: str, rel: str) -> None:
    """emit() 落盘前调用。坏了当场中止，不写出半成品。"""
    bad = check_html(html, rel)
    if bad:
        sys.exit("T3 %s：%s" % (rel, bad[0]))


# ── T1 ───────────────────────────────────────────────────────────────────────


def wide_tracking(css: str) -> list[tuple[str, str, float]]:
    """(选择器, 主语 class, 字距) —— 字距超过封顶的那些规则。

    **主语取选择器最后一个 class**：`.block > .sect-label` 施加在 .sect-label 上，
    前面那些是限定条件。"""
    out = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", strip_comments(css)):
        hit = re.search(r"letter-spacing:\s*(\.\d+|\d+(?:\.\d+)?)em", m.group(2))
        if not hit:
            continue
        em = float(hit.group(1))  # `.24em` 与 `0.24em` 都读成 0.24
        if em <= CAP_EM:
            continue
        for sel in m.group(1).split(","):
            names = re.findall(r"\.([\w-]+)", sel)
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
            bad.append("T1 %s:%s 字距 %.2fem 超过 %.2fem 封顶" % (rel, sel, em, CAP_EM))
    return n


# ── T2 ───────────────────────────────────────────────────────────────────────

COLOR = re.compile(
    r"^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|color-mix)\(|"
    r"transparent$|currentcolor$|white$|black$)",
    re.I,
)


def root_colors(site: str) -> set[str]:
    """`:root` 里取值是颜色的那些变量名。判据只看右值长什么样，不硬编名单。"""
    block = re.search(r":root\s*\{(.*?)\n\}", strip_comments(site), re.S)
    out = set()
    for name, val in re.findall(
        r"--([\w-]+):\s*([^;]+);", block.group(1) if block else ""
    ):
        if COLOR.match(val.strip()):
            out.add(name)
    # 语义层是一对一转发（--el-arc: var(--c-arc)），跟着上游算
    for _ in range(3):
        for name, val in re.findall(
            r"--([\w-]+):\s*var\(--([\w-]+)\)", block.group(1) if block else ""
        ):
            if val in out:
                out.add(name)
    return out


def layers(value: str) -> list[str]:
    """按顶层逗号切图层。括号里的逗号是 gradient 自己的参数，不切。"""
    out, depth, cur = [], 0, ""
    for ch in value:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    out.append(cur.strip())
    return out


def nested_has(css: str) -> list[str]:
    """选择器里 `:has()` 套 `:has()`：CSS Selectors 4 禁套，整条规则静默作废且不报错。"""
    out = []
    for m in re.finditer(r"([^{}]+)\{[^{}]*\}", strip_comments(css)):
        for sel in m.group(1).split(","):
            s = sel.strip()
            i, depth, has_at = 0, 0, []
            while i < len(s):
                if s.startswith(":has(", i):
                    if has_at:
                        out.append(s)
                        break
                    depth += 1
                    has_at.append(depth)
                    i += 5
                    continue
                if s[i] == "(":
                    depth += 1
                elif s[i] == ")":
                    if has_at and has_at[-1] == depth:
                        has_at.pop()
                    depth = max(0, depth - 1)
                i += 1
    return out


def check_background(bad: list[str], colors: set[str]) -> int:
    n = 0
    for rel in css_files():
        text = strip_comments(read(rel))
        for sel in nested_has(text):
            n += 1
            bad.append(
                "T2 %s：选择器 %s 在 :has() 里又套了 :has()，整条规则静默作废"
                % (rel, sel)
            )
        for m in re.finditer(r"(?<![\w-])background:\s*([^;{}]+);", text):
            parts = layers(m.group(1))
            if len(parts) < 2:
                continue
            for layer in parts[:-1]:  # 末层允许颜色，其余不允许
                var = re.fullmatch(r"var\(--([\w-]+)\)", layer)
                if COLOR.match(layer) or (var and var.group(1) in colors):
                    n += 1
                    bad.append(
                        "T2 %s：background 简写的非末层写了颜色（%s），"
                        "整条声明作废、回落 transparent。"
                        "要叠一层纯色写成 linear-gradient(<色>, <色>)" % (rel, layer)
                    )
                    break
    return n


# ── T3 手写页 ────────────────────────────────────────────────────────────────


def check_shape(bad: list[str]) -> int:
    n = 0
    for rel in handwritten():
        for line in check_html(read(rel), rel):
            n += 1
            bad.append("T3 %s：%s" % (rel, line))
    return n


# ── T4 整数阶梯与残留 ────────────────────────────────────────────────────────

FRAC_FONT = re.compile(r"(?<![\w-])font(?:-size)?\s*:\s*[^;{}]*?\b(\d+\.\d+px)\b")


def fractional_font_sizes(css: str) -> list[str]:
    """font-size 或 font 简写里出现的小数像素字号（如 12.5px）。"""
    return [m.group(1) for m in FRAC_FONT.finditer(strip_comments(css))]


def check_tokens(bad: list[str]) -> int:
    n = 0
    for rel in css_files():
        text = strip_comments(read(rel))
        for px in fractional_font_sizes(text):
            n += 1
            bad.append("T4 %s：字号 %s 带小数像素，应归入整数字号阶梯" % (rel, px))
        if "--font-read" in text:
            n += 1
            bad.append("T4 %s：引用了已退役的 --font-read，请改用 --font-body" % rel)
        if rel != "assets/site.css" and re.search(r"\.gen\b", text):
            html_rel = os.path.join(os.path.dirname(rel), "index.html")
            html_path = os.path.join(shell.SITE, html_rel)
            if os.path.isfile(html_path):
                html = read(html_rel)
                if 'class="gen"' not in html and 'class="gen ' not in html:
                    n += 1
                    bad.append(
                        'T4 %s：对应页面无 <table class="gen">，样式表仍残留 .gen 规则'
                        % rel
                    )
    return n


def main() -> int:
    bad: list[str] = []
    n1 = check_tracking(bad)
    n2 = check_background(bad, root_colors(read("assets/site.css")))
    n3 = check_shape(bad)
    n4 = check_tokens(bad)
    if bad:
        print("排版与结构不一致：", file=sys.stderr)
        for line in bad:
            print("  " + line, file=sys.stderr)
        return 1
    print(
        "排版与结构一致：%d 份样式表，手写 %d 页（字距 %d、简写 %d、结构 %d、阶梯 %d）"
        % (len(css_files()), len(handwritten()), n1, n2, n3, n4)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
