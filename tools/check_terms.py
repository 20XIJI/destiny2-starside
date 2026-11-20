#!/usr/bin/env python3
"""术语、着色与样式色板的一致性闸门（G1–G5）。

规则以 tools/items.py、tools/items.json、tools/perks.json 为唯一术语真相：
  G1 中文正名       源稿、`data/*.json` 与手写页/脚本不许出现禁用写法
  G2 术语着色唯一   items.TERMS 中已着色词的 token 归属唯一
  G3 官方物品着色   官方物品/机制的已着色反查 + 漏着色正查（配装源稿不进正查）
  G4 样式类与死类   {token|…} 须在对应样式表有定义；site.css 零引用纯着色类报错
  G5 色板总览一致   palette.md 与 site.css 的渲染色及着色类双向核对

用法：python3 tools/check_terms.py [--all]
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import sys

import facts
import items
import markup
import shell

DOC_DIR = "references/docs"
KEY_DIR = "references/keys"
PALETTE = os.path.join(DOC_DIR, "palette.md")
RULES_FILES = (
    "tools/check_terms.py",
    "tools/items.py",
    "tools/items.json",
    "tools/perks.json",
    "tools/markup.py",
    "tools/facts.py",
)
DATA_TABLES = (
    "inventory-items",
    "sandbox-perks",
    "traits",
    "stats",
    "equipable-item-sets",
    "minted",
)
HANDWRITTEN_G1 = (
    "index.html",
    "eververse/index.html",
    "eververse/app.js",
    "assets/armor-rng.js",
)


def read(path: str) -> str:
    with open(os.path.join(shell.ROOT, path), encoding="utf-8") as f:
        return f.read()


def read_site(path: str) -> str:
    with open(os.path.join(shell.SITE, path), encoding="utf-8") as f:
        return f.read()


def at_line(text: str, at: int) -> int:
    return text.count("\n", 0, at) + 1


def classes_in(css: str) -> set[str]:
    """样式表里去除注释后的全部 class 名。"""
    return set(
        re.findall(r"\.([a-zA-Z][\w-]*)", re.sub(r"/\*.*?\*/", "", css, flags=re.S))
    )


def tint_classes(css: str) -> dict[str, tuple[str, bool]]:
    """单类规则里设了 color: var(…) 的类 → (引用的变量名, 规则体是否仅此一条)。"""
    out: dict[str, tuple[str, bool]] = {}
    plain = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for m in re.finditer(r"(?:^|\n)((?:\.[\w-]+,\s*)*\.[\w-]+)\s*\{([^}]*)\}", plain):
        hit = re.search(r"color:\s*var\(--([\w-]+)\)", m.group(2))
        if not hit:
            continue
        sole = not re.sub(r"color:\s*var\(--[\w-]+\);?", "", m.group(2)).strip()
        for cls in re.findall(r"\.([\w-]+)", m.group(1)):
            out[cls] = (hit.group(1), sole)
    return out


def sources() -> list[tuple[str, set[str]]]:
    """[(源稿相对路径, 该页可用的 class 集合)]。"""
    site = read_site("assets/site.css")
    base = classes_in(site)
    sheet_cache: dict[str, set[str]] = {}

    def sheet_classes(rel_sheet: str) -> set[str]:
        if rel_sheet not in sheet_cache:
            full = os.path.join(shell.SITE, rel_sheet)
            sheet_cache[rel_sheet] = (
                classes_in(read_site(rel_sheet)) if os.path.exists(full) else set()
            )
        return sheet_cache[rel_sheet]

    out: list[tuple[str, set[str]]] = []
    for slug, path in shell.sources():
        rel = os.path.relpath(path, shell.ROOT)
        md = read(rel)
        m = re.search(r"^路径：(.*)$", md, re.M)
        where = m.group(1).strip() if m else slug
        ok = set(base)
        parts = where.split("/")
        for i in range(len(parts)):
            ok |= sheet_classes(os.path.join(*parts[: i + 1], "style.css"))
        out.append((rel, ok))

    build_ok = base | sheet_classes("builds/style.css")
    if os.path.isdir(shell.BUILD_DIR):
        for season in sorted(os.listdir(shell.BUILD_DIR)):
            d = os.path.join(shell.BUILD_DIR, season)
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if name.endswith(".json"):
                    out.append(("references/builds/%s/%s" % (season, name), build_ok))
    return out


def _mask_spaces(m: re.Match[str]) -> str:
    return re.sub(r"[^\n]", " ", m.group(0))


def _mask_html_tag(m: re.Match[str]) -> str:
    tag = m.group(0)
    out = [" "] * len(tag)
    for attr in re.finditer(
        r'\b(?:aria-label|placeholder|title|alt)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', tag
    ):
        g = 1 if attr.group(1) is not None else 2
        for i in range(attr.start(g), attr.end(g)):
            out[i] = tag[i]
    for i, ch in enumerate(tag):
        if ch == "\n":
            out[i] = "\n"
    return "".join(out)


def mask_handwritten(rel: str, src: str) -> str:
    """屏蔽手写 HTML/JS 的注释、标签属性与 URL，只留可见文本供 G1 检查（保留换行）。"""
    if rel.endswith(".html"):
        src = re.sub(r"<!--.*?-->", _mask_spaces, src, flags=re.S)
        src = re.sub(
            r"<script\b[^>]*>.*?</script>", _mask_spaces, src, flags=re.S | re.I
        )
        src = re.sub(r"<style\b[^>]*>.*?</style>", _mask_spaces, src, flags=re.S | re.I)
        src = re.sub(r"<[^>]+>", _mask_html_tag, src)
    else:
        src = re.sub(r"/\*.*?\*/", _mask_spaces, src, flags=re.S)
        src = re.sub(r"//[^\n]*", _mask_spaces, src)
    return re.sub(r'https?://[^\s"\'<>]+', _mask_spaces, src)


def _iter_table_texts(table: str):
    path = os.path.join(shell.ROOT, "data", table + ".json")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    for h, rec in rows.items():
        for fp, txt in facts.site_text(table, rec).items():
            yield ("data/%s.json#%s:%s" % (table, h, fp), txt)


def all_site_classes(site: str) -> set[str]:
    ok = classes_in(site)
    if not os.path.isdir(shell.SITE):
        return ok
    for dirpath, _, filenames in os.walk(shell.SITE):
        for name in filenames:
            if name.endswith(".css"):
                with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                    ok |= classes_in(f.read())
    return ok


def armor_sets_tokens(site: str, bad: list[str] | None = None) -> set[str]:
    """护甲套装页由生成器词表着色的 token 集合。"""
    gen = os.path.join(shell.ROOT, "tools", "convert-armor-sets.py")
    if not os.path.exists(gen):
        return set()
    spec = importlib.util.spec_from_file_location("convert_armor_sets", gen)
    if spec is None or spec.loader is None:
        markup.die("读不出 %s" % gen)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    used: set[str] = {t for _, t in mod.GLOSSARY} | set(mod.INLINE_TOKENS)
    if bad is not None:
        sheet = os.path.join(shell.SITE, "armor-sets", "style.css")
        if os.path.exists(sheet):
            ok = classes_in(site) | classes_in(read_site("armor-sets/style.css"))
            for t in sorted(used - ok):
                bad.append(
                    "G4 tools/convert-armor-sets.py 会发 {%s|…}，样式表里没有这个类" % t
                )
    return used


def scan_text(
    loc: str,
    text: str,
    terms: dict,
    g2_words: set[str],
    *,
    allowed_classes: set[str] | None = None,
    check_g1: bool = True,
    check_g23: bool = True,
    check_g3_rev: bool = True,
    with_line: bool = True,
) -> tuple[list[str], set[str]]:
    """单趟扫描一段文本，返回 (G1/G2/G3反查/G4 报错列表, 出现的 token 集合)。"""
    errs: list[str] = []
    used: set[str] = set()

    if check_g1:
        for at, wrong, right in items.misspelled(text):
            where = "%s:%d" % (loc, at_line(text, at)) if with_line else loc
            errs.append("G1 %s 用了「%s」，正名是「%s」" % (where, wrong, right))

    if "{" not in text:
        return errs, used

    for m in markup.OPEN.finditer(text):
        tok = m.group(1)
        used.add(tok)
        if allowed_classes is not None and tok not in allowed_classes:
            where = "%s:%d" % (loc, at_line(text, m.start())) if with_line else loc
            errs.append("G4 %s 用了 {%s|…}，样式表里没有这个类" % (where, tok))

    if check_g23:
        marks = markup.Markers(text)
        for token, start, end in marks.frames:
            if token is None or start >= end:
                continue
            word = text[start:end]
            if word in g2_words:
                want = items.expected_token(token, word, terms)
                if want:
                    where = "%s:%d" % (loc, at_line(text, start)) if with_line else loc
                    errs.append(
                        "G2 %s 「%s」着色成 {%s|…}，应是 {%s|…}"
                        % (where, word, token, want)
                    )
            elif (
                check_g3_rev
                and token in items.MANAGED
                and "{" not in word
                and "}" not in word
                and "|" not in word
            ):
                want_item = terms.get(items.norm(word))
                target = items.expected_token(token, word, terms)
                if want_item and want_item[0] in items.MANAGED and target:
                    where = "%s:%d" % (loc, at_line(text, start)) if with_line else loc
                    errs.append(
                        "G3 %s 「%s」着色成 {%s|…}，官方物品表说它是%s，应是 {%s|…}"
                        % (where, word, token, want_item[1], target)
                    )

    return errs, used


def _file_sha1(abs_path: str) -> str:
    with open(abs_path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()


def _rules_digest(terms: dict | None = None, forward: dict | None = None) -> str:
    h = hashlib.sha1()
    for rel in RULES_FILES:
        abs_path = os.path.join(shell.ROOT, rel)
        if not os.path.isfile(abs_path):
            return ""
        h.update(rel.encode())
        h.update(b"\0")
        with open(abs_path, "rb") as f:
            h.update(f.read())
    if terms is not None:
        h.update(b"\0terms\0")
        h.update(json.dumps(sorted(terms.items()), ensure_ascii=False).encode("utf-8"))
    if forward is not None:
        h.update(b"\0forward\0")
        h.update(
            json.dumps(sorted(forward.items()), ensure_ascii=False).encode("utf-8")
        )
    return h.hexdigest()


def _cache_path() -> str | None:
    git_dir = os.path.join(shell.ROOT, ".git")
    return (
        os.path.join(git_dir, "starside-terms.json") if os.path.isdir(git_dir) else None
    )


def _load_cache(
    force: bool = False,
    *,
    terms: dict | None = None,
    forward: dict | None = None,
) -> dict:
    path = _cache_path()
    rules = _rules_digest(terms, forward)
    empty = {"rules": rules, "files": {}}
    if force or not path or not rules:
        return empty
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return empty
    if not isinstance(data, dict) or data.get("rules") != rules:
        return empty
    files = data.get("files")
    return {"rules": rules, "files": dict(files) if isinstance(files, dict) else {}}


def _save_cache(cache: dict) -> None:
    path = _cache_path()
    if not path or not cache.get("rules"):
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=0, sort_keys=True)
        f.write("\n")


def used_tokens(
    site: str | None = None, pairs: list[tuple[str, set[str]]] | None = None
) -> set[str]:
    """全站源稿、护甲套装生成器与 data/*.json 实际用过的 token 并集（供 build-terms.py 调用）。"""
    if site is None:
        site = read_site("assets/site.css")
    if pairs is None:
        pairs = sources()
    terms, _ = items.load()
    forward = items.forward_terms()
    cached_files = _load_cache(force=False, terms=terms, forward=forward)["files"]
    used: set[str] = set()

    for rel, _ in pairs:
        abs_path = os.path.join(shell.ROOT, rel)
        entry = cached_files.get(rel)
        if entry and entry.get("sha1") == _file_sha1(abs_path):
            used.update(entry.get("used", ()))
        else:
            md = read(rel)
            used.update(m.group(1) for m in markup.OPEN.finditer(md))

    used |= armor_sets_tokens(site)

    data_dir = os.path.join(shell.ROOT, "data")
    if os.path.isdir(data_dir):
        for table in DATA_TABLES:
            path = os.path.join(data_dir, table + ".json")
            if not os.path.exists(path):
                continue
            key = "data:" + table
            entry = cached_files.get(key)
            if entry and entry.get("sha1") == _file_sha1(path):
                used.update(entry.get("used", ()))
            else:
                for _, txt in _iter_table_texts(table):
                    used.update(m.group(1) for m in markup.OPEN.finditer(txt))
    return used


def palette_of(site: str, used: set[str]) -> tuple[dict[str, str], dict[str, str]]:
    """site.css 现有的 (渲染色 → 色号, 着色类 → 渲染色)。"""
    root = site.split(":root {", 1)[1].split("\n}", 1)[0]
    hexes = dict(re.findall(r"--(c-[\w-]+):\s*(#[0-9a-f]{3,8})\s*;", root))
    links = dict(re.findall(r"--([\w-]+):\s*var\(--([\w-]+)\)\s*;", root))
    classes: dict[str, str] = {}
    for cls, (token, _) in tint_classes(site).items():
        base = links.get(token, token)
        if cls in used and base in hexes:
            classes[cls] = base
    return hexes, classes


def check_palette(site: str, used: set[str], bad: list[str]) -> None:
    md = read(PALETTE).split("## 页面专属")[0]
    want_hex, want_cls = palette_of(site, used)
    got_hex = dict(re.findall(r"^\| --(c-[\w-]+) \| (#[0-9a-f]{3,8}) \|", md, re.M))
    got_cls = dict(re.findall(r"^\| \{([\w-]+)\|[^}]*\} \| --(c-[\w-]+) \|", md, re.M))
    for name, want, got in (
        ("渲染色", want_hex, got_hex),
        ("着色类", want_cls, got_cls),
    ):
        for key in sorted(set(want) | set(got)):
            if key not in got:
                bad.append(
                    "G5 %s 少了%s %s（site.css 里是 %s）"
                    % (PALETTE, name, key, want[key])
                )
            elif key not in want:
                bad.append("G5 %s 多出%s %s，site.css 里没有" % (PALETTE, name, key))
            elif want[key] != got[key]:
                bad.append(
                    "G5 %s %s %s 写的是 %s，site.css 里是 %s"
                    % (PALETTE, name, key, got[key], want[key])
                )


def check_all(*, force: bool = False) -> tuple[list[str], int, set[str]]:
    """执行 G1–G5 全量/增量校验，返回 (报错列表, 源稿篇数, 全站已用 token 集合)。"""
    terms, _ = items.load()
    items.check_token_targets(terms)
    forward = items.forward_terms()
    cache = _load_cache(force=force, terms=terms, forward=forward)
    cached_files: dict = cache["files"]
    next_files: dict = {}
    site = read_site("assets/site.css")
    pairs = sources()
    g2_words = {word for word, token, _ in items.TERMS if token}
    bad: list[str] = []
    used: set[str] = set()
    dirty_g3_fwd: list[str] = []
    g3_pages = set(items.pages())

    # 1. 源稿（docs / keys / builds）：单趟完成 G1/G2/G3反查/G4
    for rel, ok in pairs:
        abs_path = os.path.join(shell.ROOT, rel)
        sig = _file_sha1(abs_path)
        entry = cached_files.get(rel)
        is_doc_or_key = rel.startswith((DOC_DIR, KEY_DIR))
        if entry and entry.get("sha1") == sig:
            file_used = set(entry.get("used", ()))
            used |= file_used
            if file_used - ok:
                md = read(rel)
                for m in markup.OPEN.finditer(md):
                    if m.group(1) not in ok:
                        bad.append(
                            "G4 %s:%d 用了 {%s|…}，样式表里没有这个类"
                            % (rel, at_line(md, m.start()), m.group(1))
                        )
            else:
                next_files[rel] = entry
            continue

        md = read(rel)
        errs, file_used = scan_text(
            rel,
            md,
            terms,
            g2_words,
            allowed_classes=ok,
            check_g3_rev=is_doc_or_key,
        )
        bad.extend(errs)
        used |= file_used
        if rel in g3_pages:
            dirty_g3_fwd.append(rel)
        if not errs:
            next_files[rel] = {"sha1": sig, "used": sorted(file_used)}

    # 2. G3 正查：仅扫描未命中缓存的页面，命中漏着色则从 next_files 撤出
    if dirty_g3_fwd:
        for rel, line, _, _, word in items.scan(files=dirty_g3_fwd):
            next_files.pop(rel, None)
            bad.append(
                "G3 %s:%d 「%s」没着色，应是 {%s|%s}；跑 python3 tools/items.py --apply 落进去"
                % (rel, line, word, terms[word][0], word)
            )

    # 3. 手写页面/脚本的 G1 检查
    for rel_site in HANDWRITTEN_G1:
        path = os.path.join(shell.SITE, rel_site)
        if not os.path.exists(path):
            continue
        key = "site:" + rel_site
        sig = _file_sha1(path)
        entry = cached_files.get(key)
        if entry and entry.get("sha1") == sig:
            next_files[key] = entry
            continue
        with open(path, encoding="utf-8") as f:
            src = f.read()
        errs, _ = scan_text(
            "site/" + rel_site,
            mask_handwritten(rel_site, src),
            terms,
            g2_words,
            check_g23=False,
        )
        bad.extend(errs)
        if not errs:
            next_files[key] = {"sha1": sig, "used": []}

    # 4. data/*.json 站内文本：单趟完成 G1/G2/G3反查/G4
    data_dir = os.path.join(shell.ROOT, "data")
    if os.path.isdir(data_dir):
        all_ok = all_site_classes(site)
        for table in DATA_TABLES:
            path = os.path.join(data_dir, table + ".json")
            if not os.path.exists(path):
                continue
            key = "data:" + table
            sig = _file_sha1(path)
            entry = cached_files.get(key)
            if entry and entry.get("sha1") == sig:
                table_used = set(entry.get("used", ()))
                used |= table_used
                if table_used - all_ok:
                    for loc, txt in _iter_table_texts(table):
                        for m in markup.OPEN.finditer(txt):
                            if m.group(1) not in all_ok:
                                bad.append(
                                    "G4 %s 用了 {%s|…}，样式表里没有这个类"
                                    % (loc, m.group(1))
                                )
                else:
                    next_files[key] = entry
                continue

            table_errs: list[str] = []
            table_used = set()
            for loc, txt in _iter_table_texts(table):
                errs, row_used = scan_text(
                    loc,
                    txt,
                    terms,
                    g2_words,
                    allowed_classes=all_ok,
                    with_line=False,
                )
                table_errs.extend(errs)
                table_used |= row_used
            bad.extend(table_errs)
            used |= table_used
            if not table_errs:
                next_files[key] = {"sha1": sig, "used": sorted(table_used)}

    # 5. 护甲套装生成器 token + G4 死类清理 + G5 色板总览
    used |= armor_sets_tokens(site, bad)
    for cls, (_, sole) in tint_classes(site).items():
        if sole and cls not in used:
            bad.append("G4 assets/site.css 的 .%s 一次都没被用到，删掉或改写" % cls)
    if os.path.exists(os.path.join(shell.ROOT, PALETTE)):
        check_palette(site, used, bad)

    if not bad:
        _save_cache({"rules": cache["rules"], "files": next_files})
    return bad, len(pairs), used


def main() -> int:
    force = "--all" in sys.argv[1:] or "--force" in sys.argv[1:]
    bad, count, _ = check_all(force=force)
    if bad:
        print("术语与着色不一致：", file=sys.stderr)
        for line in bad:
            print("  " + line, file=sys.stderr)
        return 1
    print("术语一致：%d 条规则，%d 篇源稿" % (len(items.TERMS), count))
    return 0


if __name__ == "__main__":
    sys.exit(main())
