#!/usr/bin/env python3
"""站点外壳一致性闸门。

各资料页的外壳由 tools/shell.py 生成，天然一致；会漂的只有手写的首页
index.html。本脚本从 shell.py 现取不变片段去比对每一个页面——
**这里不另存副本**，否则闸门自己就成了要维护的另一份定义。

用法：python3 tools/check_shell.py    改完 shell.py 或手写首页后跑一次。

页面清单取自 shell.pages()，从 references/docs/ 与 references/keys/ 现扫，新增一篇不必回来改这个文件。
"""

import glob
import gzip
import os
import re
import sys

import deploy
import shell

# head 里与页面无关的那几行。标题与描述是变量，用哨兵值生成后按前缀挑出不变量。
HEAD_KEEP = (
    '<meta name="theme-color"',
    '<meta property="og:site_name"',
    '<meta property="og:locale"',
    '<link rel="preload"',
    '<link rel="icon"',
    '<link rel="stylesheet" href="../assets/site.css">',
)

STAMP = re.compile(
    r'<span class="(?:entry-)?stamp">更新 \d{4}\.\d{1,2}\.\d{1,2}</span>'
)

# 外壳三件的首屏预算，gzip 字节。这三样每一页都要下，所以它们涨一 KB 就是全站涨一 KB。
# 量的是 deploy.py 剥掉块注释之后的样子——线上发的就是那一份。
#
# **这个数会漂，而且漂过。**文档里写了很久的「site.css 10K + app.js 5K」，实测是
# 35.6K 与 20.4K，翻了三四倍，多出来的全是注释；没有人量，所以没有人知道。撑不下就
# 回来改这个数字，像 convert-armor-sets.py 的 N_* 一样——那是「改了要人确认一次」，
# 不是「放宽比对」。
SHELL_BUDGET = 34 * 1024
SHELL_PARTS = (
    "assets/site.css",
    "assets/app.js",
    "assets/fonts/chakra-petch-600.woff2",
)
def shipped_size(rel):
    """这个文件发上去有多大。CSS 与 JS 按 deploy.py 剥完注释的样子算。"""
    raw = os.path.join(shell.SITE, rel)
    with open(raw, "rb") as f:
        blob = f.read()
    if rel.endswith((".css", ".js")):
        blob = deploy.uncomment(blob.decode("utf-8")).encode("utf-8")
    return len(gzip.compress(blob, 9))


def check_weight():
    """外壳三件合起来不许超预算。超了说明每一页都变重了。"""
    sizes = {rel: shipped_size(rel) for rel in SHELL_PARTS}
    total = sum(sizes.values())
    if total <= SHELL_BUDGET:
        return [], total, sizes
    detail = "，".join(
        "%s %.1fK" % (os.path.basename(r), n / 1024) for r, n in sizes.items()
    )
    return (
        [
            "外壳三件 %.1fK gzip，超出预算 %.1fK（%s）。撑不下就改 check_shell.SHELL_BUDGET"
            % (total / 1024, SHELL_BUDGET / 1024, detail)
        ],
        total,
        sizes,
    )


def invariants(home=False):
    """各页必须一字不差共有的片段，全部取自 shell.py。

    **首页不挂导航条。**那一行只写得出「Starside / 当前页」，而字标本身就是站标，
    同一件事说两遍；回首页的入口在首页上也没有意义。站头的三条因此只钉资料页，
    head 元信息与页脚仍然全站一致。
    """
    head = shell.head("__T__", "__D__")
    frags = [ln for ln in head.split("\n") if ln.startswith(HEAD_KEEP)]
    foot = [
        shell.CREDIT,
        shell.LEGAL,
        shell.ICP,
        shell.SPEC,
        shell.HIT,
        shell.EDIT,
        shell.NOTICE,
        shell.ANNOUNCE,
    ]
    if home:
        return frags + foot
    # 站头的包裹结构：各资料页要用同一套骨架，只查 MARK 查不出包裹漂移
    return (
        frags + ['<div class="site-head">', '<nav class="site-nav">', shell.MARK] + foot
    )


def check_home_meta(home_src, bad):
    """首页卡片上的更新日期与配装数量，必须与对应页面页脚及磁盘产出一致。"""
    for m in re.finditer(
        r'<a class="entry" href="([^"]+)".*?entry-stamp">更新 ([\d.]+)<',
        home_src,
        re.S,
    ):
        page, want = m.group(1), m.group(2)
        path = os.path.join(shell.SITE, page)
        if not os.path.exists(path):
            bad.append("%s：首页卡片指向的文件不存在" % page)
            continue
        with open(path, encoding="utf-8") as f:
            got = re.search(r'<span class="stamp">更新 ([\d.]+)</span>', f.read())
        if not got:
            bad.append("%s：页脚没有更新时间" % page)
        elif got.group(1) != want:
            bad.append("%s：页脚写 %s，首页卡片写 %s" % (page, got.group(1), want))

    counts = {"builds/index.html": 0, "builds/sets/index.html": 0}
    for path in sorted(
        glob.glob(os.path.join(shell.SITE, "builds", shell.SEASON, "*", "index.html"))
    ):
        with open(path, encoding="utf-8") as f:
            key = (
                "builds/sets/index.html"
                if '<main class="set ' in f.read()
                else "builds/index.html"
            )
            counts[key] += 1
    for href, want in counts.items():
        card = re.search(
            r'<a class="entry" href="%s".*?</a>' % re.escape(href), home_src, re.S
        )
        if not card:
            if want == 0:
                continue
            bad.append("首页找不到 %s 那张卡" % href)
            continue
        m = re.search(r"<dd>(\d+)</dd>", card.group(0))
        if not m:
            bad.append("首页 %s 那张卡没写数" % href)
        elif int(m.group(1)) != want:
            bad.append("首页 %s 那张卡写 %s，站上是 %d" % (href, m.group(1), want))


def check_home_accents(home_src: str, bad: list[str]) -> None:
    """首页带 k-* 左缘色的卡片，对应内页样式表的 --accent 必须取同一支颜色变量。"""
    with open(os.path.join(shell.SITE, "assets/site.css"), encoding="utf-8") as f:
        site_css = f.read()
    edge_map = dict(
        re.findall(
            r"\.entries\s*>\s*li\.(k-[\w-]+)\s*\{\s*--edge:\s*([^;}\s]+)\s*;?\s*\}",
            site_css,
        )
    )
    for m in re.finditer(r'<li([^>]*)>\s*<a[^>]+href="([^"]+)"', home_src):
        k_hit = re.search(r"\b(k-[\w-]+)\b", m.group(1))
        if not k_hit:
            continue
        k_cls, href = k_hit.group(1), m.group(2)
        want = edge_map.get(k_cls)
        if not want:
            bad.append("首页 %s 使用了未在 site.css 定义的左缘类 .%s" % (href, k_cls))
            continue
        css_path = os.path.join(shell.SITE, os.path.dirname(href), "style.css")
        if not os.path.isfile(css_path):
            bad.append(
                "首页 %s（.%s → %s）缺少目标页样式表 %s" % (href, k_cls, want, css_path)
            )
            continue
        with open(css_path, encoding="utf-8") as f:
            css = re.sub(r"/\*.*?\*/", "", f.read(), flags=re.S)
        acc = re.search(r"(?<![\w-])--accent\s*:\s*([^;{}]+)(?=[;}])", css)
        got = acc.group(1).strip() if acc else "(未设置)"
        if got != want:
            bad.append(
                "首页 %s 左缘 .%s 为 %s，但内页 %s 的 --accent 为 %s"
                % (href, k_cls, want, os.path.relpath(css_path, shell.SITE), got)
            )


def main() -> int:
    listed = shell.pages()
    bad: list[str] = []
    home_src = ""
    # 全站搜索的索引也按这份清单建。新增一页却没重跑 build-search.py 时，那一页
    # 在首页搜不出来——这里当场报出，不等读者搜不到才发现。
    with open(os.path.join(shell.SITE, "assets", "search.js"), encoding="utf-8") as f:
        index = f.read()
    for rel in listed:
        want = invariants(rel == shell.HOME)
        path = os.path.join(shell.SITE, rel)
        if not os.path.exists(path):
            bad.append("%s：文件不存在" % rel)
            continue
        with open(path, encoding="utf-8") as f:
            src = f.read()
        if rel == shell.HOME:
            home_src = src

        for frag in want:
            # 资源前缀按页面所在层数改写：首页在站点根，子目录页深一层
            at = "../" * rel.count("/")
            probe = frag.replace("../assets/", at + "assets/")
            if probe not in src:
                bad.append("%s：与 shell.py 对不上 —— %s" % (rel, probe[:64]))

        # 提了 Compendium 就得用 shell.py 里那一句原文；没提则不管（弹药页是别的来源）。
        # sources/ 是全站出处的汇总表，整页就是各来源的清单，逐页归属那一句在这里不成立；
        # 首页「数据源与鸣谢」那张卡预览的正是那张表里的来源名，同理。
        if (
            "Destiny Data Compendium" in src
            and shell.COMPENDIUM not in src
            and rel not in ("sources/index.html", shell.HOME)
        ):
            bad.append("%s：Destiny Data Compendium 归属句被改写了" % rel)

        if not STAMP.search(src):
            bad.append('%s：缺 <span class="stamp">更新 YYYY.M.D</span>' % rel)

        # 页首那片星空窗由 sky-page.js 画：带 .page-head 的页面不引它，窗就是一块空白
        if 'class="page-head"' in src and "assets/sky-page.js" not in src:
            bad.append(
                "%s：带 .page-head 却没引 assets/sky-page.js（shell.head 的 sky 参数）"
                % rel
            )

        tb = re.search(r'<div class="toolbar"([^>]*)>', src)
        has_search = "hero-search" in src or (
            bool(tb)
            and "data-chart=" not in tb.group(1)
            and "data-cols=" not in tb.group(1)
            and ("data-item=" in tb.group(1) or "data-section=" not in tb.group(1))
        )
        if "assets/app.js" in src:
            if has_search and "assets/pinyin.js" not in src:
                bad.append("%s：引了 app.js 却没引 pinyin.js，条目名的拼音检索会失效" % rel)
            if not has_search and "assets/pinyin.js" in src:
                bad.append("%s：页面不带检索框却多余引入 assets/pinyin.js" % rel)
        if rel == "weapons/index.html":
            with open(os.path.join(shell.SITE, "weapons/app.js"), encoding="utf-8") as f:
                wpn_app = f.read()
            if "assets/pinyin.js" not in src and "assets/pinyin.js" not in wpn_app:
                bad.append("%s：装备库未引入或按需加载 pinyin.js，武器名的拼音检索会失效" % rel)
        if "form.js" in src and "assets/pinyin.js" not in src:
            bad.append("%s：配装工具没引 pinyin.js，候选的拼音检索会失效" % rel)

        if rel != shell.HOME and '"%s"' % rel not in index:
            bad.append("%s：不在全站搜索索引里，跑一次 tools/build-search.py" % rel)

    if home_src:
        check_home_meta(home_src, bad)
        check_home_accents(home_src, bad)
    weight, total, sizes = check_weight()
    bad += weight

    if bad:
        print("外壳不一致：", file=sys.stderr)
        for line in bad:
            print("  " + line, file=sys.stderr)
        return 1
    print(
        "外壳一致：%d 个页面，%d 条不变片段（首页免去站头那三条），全部在搜索索引里"
        % (len(listed), len(invariants()))
    )
    print(
        "外壳三件 %.1fK / %.0fK gzip（%s）"
        % (
            total / 1024,
            SHELL_BUDGET / 1024,
            "，".join(
                "%s %.1fK" % (os.path.basename(r), n / 1024) for r, n in sizes.items()
            ),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
