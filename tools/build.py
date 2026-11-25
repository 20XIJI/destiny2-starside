#!/usr/bin/env python3
"""资料页、装备库、首页、搜索、词表与三道闸门。

用法：python3 tools/build.py [--force | --all | --normalize-only]
产物图：源稿 + 生成器 + facts 的内容哈希变了才渲染；Facts 只构造一次。
无改动时只哈希、不拉起生成器。闸门只在有产物写出之后跑。
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def stamp_path() -> Path:
    return Path(ROOT) / ".git" / "starside-build.json"


SHARED = (
    "tools/markup.py",
    "tools/shell.py",
    "tools/raid.py",
    "tools/rows.py",
    "tools/resolve.py",
    "tools/render.py",
    "tools/pagedex.py",
    "tools/editmap.py",
    "tools/facts.py",
    "tools/icons.py",
)
ORCH = "tools/build.py"

CORE_FACTS = (
    "data/inventory-items.json",
    "data/sandbox-perks.json",
    "data/traits.json",
    "data/stats.json",
    "data/minted.json",
)
SET_FACTS = ("data/equipable-item-sets.json",)
LOOKUP_FACTS = (
    "data/lookup/plug-sets.json",
    "data/lookup/socket-types.json",
    "data/lookup/stat-groups.json",
)


def digest_files(
    paths,
    cache: dict[str, bytes] | None = None,
    extra: str = "",
    stat_cache: dict[str, list] | None = None,
    next_stat: dict[str, list] | None = None,
) -> str:
    """路径集合 + 各自字节 → sha1。输入文件必须存在，缺失当场抛 FileNotFoundError。"""
    h = hashlib.sha1()
    if extra:
        h.update(extra.encode())
        h.update(b"\0")
    for raw in sorted({str(p) for p in paths}):
        entry = None if cache is None else cache.get(raw)
        if entry is None:
            p = Path(raw)
            rel = p.as_posix()
            try:
                rel = p.resolve().relative_to(ROOT).as_posix()
            except (ValueError, OSError):
                pass
            st = p.stat()
            sig = [st.st_mtime_ns, st.st_size]
            prev = stat_cache.get(rel) if stat_cache is not None else None
            if prev is not None and len(prev) == 3 and prev[0] == sig[0] and prev[1] == sig[1]:
                entry = bytes.fromhex(prev[2])
            else:
                fh = hashlib.sha1()
                fh.update(rel.encode())
                fh.update(b"\0")
                fh.update(p.read_bytes())
                entry = fh.digest()
            if next_stat is not None:
                next_stat[rel] = [sig[0], sig[1], entry.hex()]
            if cache is not None:
                cache[raw] = entry
        h.update(entry)
    return h.hexdigest()


def facts_groups() -> tuple[list[Path], list[Path], list[Path]]:
    core = [ROOT / r for r in CORE_FACTS if (ROOT / r).is_file()]
    sets = [ROOT / r for r in SET_FACTS if (ROOT / r).is_file()]
    lookup = [ROOT / r for r in LOOKUP_FACTS if (ROOT / r).is_file()]
    return core, sets, lookup


def source_files() -> list[Path]:
    out = []
    for sub in ("docs", "keys"):
        out.extend(sorted((ROOT / "references" / sub).glob("*.md")))
    builds = ROOT / "references" / "builds"
    if builds.is_dir():
        out.extend(sorted(builds.glob("*/*.json")))
    return out


def load_stamp() -> dict:
    try:
        return json.loads(stamp_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_stamp(stamp: dict) -> None:
    path = stamp_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(stamp, indent=0, sort_keys=True) + "\n", encoding="utf-8"
    )


def load_tool(filename: str):
    name = "starside_" + filename.replace(".py", "").replace("-", "_")
    spec = importlib.util.spec_from_file_location(name, Path(ROOT) / "tools" / filename)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def invoke(mod, extra_args: tuple[str, ...] = ()) -> None:
    old = sys.argv
    sys.argv = [str(Path(mod.__file__).resolve()), *extra_args]
    t0 = time.perf_counter()
    try:
        code = mod.main()
    finally:
        sys.argv = old
    name = Path(mod.__file__).resolve().name
    print("  · %-28s %4.1fs" % (name, time.perf_counter() - t0), flush=True)
    if code not in (0, None):
        sys.exit(code)


def under(*rel) -> list[Path]:
    return [ROOT / r for r in rel]


def doc_slugs(shell) -> list[tuple[str, Path]]:
    out = []
    for slug, path in shell.sources():
        if "%s/index.html" % slug in shell.FIXED:
            continue
        out.append((slug, Path(path)))
    return out


def main() -> int:
    t0 = time.perf_counter()
    force = "--force" in sys.argv[1:] or "--all" in sys.argv[1:]
    normalize_only = "--normalize-only" in sys.argv[1:]
    if "--help" in sys.argv[1:]:
        print(__doc__)
        return 0

    stamp = {} if force else load_stamp()
    stat_cache: dict[str, list] = {} if force else (stamp.get("_files") or {})
    next_stat: dict[str, list] = {}
    next_stamp: dict = {"_files": next_stat}
    file_cache: dict[str, bytes] = {}
    ran = False
    executed = 0
    skipped = 0

    def dirty(key: str, paths, *, extra: str = "") -> bool:
        got = digest_files(paths, file_cache, extra=extra, stat_cache=stat_cache, next_stat=next_stat)
        next_stamp[key] = got
        return force or stamp.get(key) != got

    orch = under(ORCH)
    shared = under(*SHARED)
    core_facts, set_facts, lookup_facts = facts_groups()
    entity_facts = core_facts + set_facts
    all_facts = entity_facts + lookup_facts
    sources = source_files()

    if dirty("orch", orch) and not force:
        force = True
        stamp = {}
        stat_cache.clear()

    # ── 纠正源稿：改的是 md，必须在算页哈希之前 ──
    norm_deps = (
        under("tools/items.py", "tools/items.json", "tools/perks.json")
        + shared
        + entity_facts
    )
    if dirty("normalize", sources + norm_deps):
        items = load_tool("items.py")
        t = time.perf_counter()
        items.normalize()
        print("  · %-28s %4.1fs" % ("items.py", time.perf_counter() - t), flush=True)
        ran = True
        executed += 1
        file_cache.clear()
        sources = source_files()
        next_stamp["normalize"] = digest_files(sources + norm_deps, file_cache, next_stat=next_stat)
    else:
        skipped += 1
    if normalize_only:
        save_stamp(
            {**stamp, "orch": next_stamp["orch"], "normalize": next_stamp["normalize"]}
        )
        return 0

    import shell  # noqa: WPS433  — 清单现扫，与生成器同一处

    notice_id = shell.notice_id()

    card_re = re.compile(r"^卡片：(.*)$", re.M)
    link_re = re.compile(r"\[[^\]]+\]\((?!http)([^)#?]+/index\.html)\)")

    def doc_refs(src: Path) -> list[Path]:
        text = src.read_text(encoding="utf-8")
        refs: list[str] = []
        for m in card_re.finditer(text):
            refs.extend(s.strip() for s in m.group(1).split("、") if s.strip())
        for m in link_re.finditer(text):
            refs.append(Path(m.group(1)).parent.name)
        seen: dict[Path, None] = {}
        for ref_slug in refs:
            p = shell.source_path(ref_slug)
            if p is not None:
                seen[Path(p)] = None
        return sorted(seen)

    slugs = doc_slugs(shell)
    page_gen = shared + under(
        "tools/convert-doc.py",
        "references/pages/prismatic.json",
        "references/keys/armor-sets.md",
    )
    page_dirty: list[str] = []
    for slug, path in slugs:
        key = "page:%s" % slug
        if dirty(
            key, [path, *doc_refs(path), *page_gen, *core_facts, *lookup_facts], extra=notice_id
        ):
            page_dirty.append(slug)
    art_dirty = dirty(
        "artifact-mods",
        [
            ROOT / "references" / "keys" / "artifact-mods.md",
            *shared,
            *core_facts,
            *under("tools/convert-artifact-mods.py"),
        ],
        extra=notice_id,
    )
    sets_dirty = dirty(
        "armor-sets",
        [
            ROOT / "references" / "keys" / "armor-sets.md",
            *shared,
            *entity_facts,
            *under("tools/convert-armor-sets.py"),
        ],
        extra=notice_id,
    )

    if page_dirty or art_dirty or sets_dirty:
        import resolve

        resolve.shared()

    if art_dirty:
        invoke(load_tool("convert-artifact-mods.py"))
        ran = True
        executed += 1
    else:
        skipped += 1
    if sets_dirty:
        invoke(load_tool("convert-armor-sets.py"))
        ran = True
        executed += 1
    else:
        skipped += 1
    if page_dirty:
        cdoc = load_tool("convert-doc.py")
        t = time.perf_counter()
        if len(page_dirty) > 3:
            shell.hush_emit(True)
        try:
            for slug in page_dirty:
                cdoc.build(slug)
            cdoc.unbuilt()
        finally:
            shell.hush_emit(False)
        label = "convert-doc.py (%d pages)" % len(page_dirty)
        print("  · %-28s %4.1fs" % (label, time.perf_counter() - t), flush=True)
        ran = True
        executed += 1
    else:
        skipped += 1

    notices_dirty = dirty(
        "notices",
        under(
            "tools/build-notices.py",
            "references/docs/notices.md",
            "tools/markup.py",
            "tools/shell.py",
        ),
    )
    if notices_dirty:
        invoke(load_tool("build-notices.py"))
        ran = True
        executed += 1
    else:
        skipped += 1

    index_files = sorted((ROOT / "data" / "index").glob("*.json"))
    index_files += sorted((ROOT / "data" / "index").glob("*/*.json"))
    build_json = sorted((ROOT / "references" / "builds").glob("*/*.json"))
    builds_dirty = dirty(
        "builds",
        build_json
        + index_files
        + under(
            "tools/convert-build.py",
            "tools/vocab.py",
            "tools/dim.py",
            "tools/mods.py",
            "tools/migrate.py",
            "tools/items.py",
            "tools/items.json",
            "tools/perks.json",
            "tools/mod-variants.json",
            "tools/moves.json",
            "tools/artifacts.json",
        )
        + shared
        + all_facts,
        extra=notice_id,
    )
    if builds_dirty:
        invoke(load_tool("convert-build.py"))
        ran = True
        executed += 1
    else:
        skipped += 1

    weapons_dirty = dirty(
        "weapons",
        all_facts
        + index_files
        + build_json
        + under(
            "tools/build-weapons.py",
            "tools/type-icons.json",
            "tools/items.py",
            "tools/items.json",
            "tools/perks.json",
            "references/docs/ammo.md",
            "references/docs/weapon-frames.md",
            "site/builds/style.css",
            "site/builds/index.html",
            "site/builds/sets/index.html",
        )
        + shared,
        extra=notice_id,
    )
    if weapons_dirty:
        invoke(load_tool("build-weapons.py"))
        ran = True
        executed += 1
    else:
        skipped += 1

    home_inputs = under("tools/build-home.py", "site/assets/rota.js") + [
        ROOT / "site" / "index.html",
        ROOT / "references" / "docs" / "raid-guides.md",
    ]
    home_dirty = (
        dirty("home", home_inputs)
        or art_dirty
        or sets_dirty
        or bool(page_dirty)
        or builds_dirty
        or weapons_dirty
    )
    if home_dirty:
        invoke(load_tool("build-home.py"))
        ran = True
        executed += 1
        for p in home_inputs:
            file_cache.pop(str(p), None)
        next_stamp["home"] = digest_files(home_inputs, file_cache, next_stat=next_stat)
    else:
        skipped += 1

    search_dirty = (
        dirty(
            "search",
            entity_facts
            + under(
                "tools/build-search.py",
                "tools/pinyin.py",
                "tools/pinyin.json",
                "tools/pinyin-match.js",
                "site/eververse/index.html",
            ),
        )
        or art_dirty
        or sets_dirty
        or bool(page_dirty)
        or builds_dirty
        or weapons_dirty
    )
    if search_dirty:
        invoke(load_tool("build-search.py"))
        ran = True
        executed += 1
    else:
        skipped += 1

    css_files = sorted((ROOT / "site").rglob("*.css"))
    terms_dirty = dirty(
        "terms",
        all_facts
        + css_files
        + under(
            "tools/build-terms.py",
            "tools/items.py",
            "tools/items.json",
            "tools/perks.json",
            "tools/check_terms.py",
            "site/index.html",
            "site/admin/dialect.js",
            "site/builds/source.js",
            "tools/sync-eververse.js",
            "tools/sync-xur.js",
        )
        + sources,
    )
    if terms_dirty:
        invoke(load_tool("build-terms.py"))
        ran = True
        executed += 1
    else:
        skipped += 1

    gates_dirty = dirty(
        "gates",
        under(
            "tools/check_shell.py",
            "tools/deploy.py",
            "tools/check_terms.py",
            "tools/check_type.py",
            "tools/items.py",
            "tools/items.json",
            "tools/perks.json",
            "site/index.html",
            "site/eververse/index.html",
            "site/eververse/app.js",
            "site/assets/armor-rng.js",
            "site/weapons/app.js",
            "design.md",
        )
        + shared
        + entity_facts
        + sources
        + css_files,
        extra=notice_id,
    )
    if ran or gates_dirty:
        gate_args = ("--all",) if force else ()
        for name in ("check_shell.py", "check_terms.py", "check_type.py"):
            invoke(load_tool(name), gate_args if name == "check_terms.py" else ())
        ran = True
        executed += 1
    else:
        skipped += 1

    save_stamp(next_stamp)
    dt = time.perf_counter() - t0
    if ran:
        tail = "（跳过 %d 步）" % skipped if skipped else ""
        print("✓ %-6s %4.1fs  执行 %d 步%s" % ("build", dt, executed, tail), flush=True)
    else:
        print("· %-6s %4.1fs  无改动（跳过 %d 步）" % ("build", dt, skipped), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
