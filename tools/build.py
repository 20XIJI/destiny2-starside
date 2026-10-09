#!/usr/bin/env python3
"""资料页、装备库、首页、搜索、词表与三道闸门。

产物图：源稿 + 生成器 + facts 的内容哈希变了才渲染；Facts 只构造一次。
无改动时只哈希、不拉起生成器。闸门只在有产物写出之后跑。
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def stamp_path() -> Path:
    return Path(ROOT) / '.git' / 'starside-build.json'


SHARED = (
    'tools/markup.py', 'tools/shell.py', 'tools/rows.py', 'tools/resolve.py',
    'tools/layout.py', 'tools/pagedex.py', 'tools/editmap.py', 'tools/facts.py',
)
ORCH = 'tools/build.py'


def digest_files(paths) -> str:
    """路径集合 + 各自字节 → sha1。缺文件当空，好让「还没落盘」与「删了」同形。"""
    h = hashlib.sha1()
    for path in sorted({str(p) for p in paths}):
        p = Path(path)
        rel = p.as_posix()
        try:
            rel = p.resolve().relative_to(ROOT).as_posix()
        except (ValueError, OSError):
            pass
        h.update(rel.encode())
        h.update(b'\0')
        try:
            h.update(p.read_bytes())
        except OSError:
            h.update(b'-')
        h.update(b'\n')
    return h.hexdigest()


def facts_files() -> list[Path]:
    out = sorted((ROOT / 'data').glob('*.json'))
    lookup = ROOT / 'data' / 'lookup'
    if lookup.is_dir():
        out.extend(sorted(lookup.glob('*.json')))
    return out


def source_files() -> list[Path]:
    out = []
    for sub in ('docs', 'keys'):
        out.extend(sorted((ROOT / 'references' / sub).glob('*.md')))
    builds = ROOT / 'references' / 'builds'
    if builds.is_dir():
        out.extend(sorted(builds.glob('*/*.json')))
    return out


def load_stamp() -> dict:
    try:
        return json.loads(stamp_path().read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}


def save_stamp(stamp: dict) -> None:
    path = stamp_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(stamp, indent=0, sort_keys=True) + '\n', encoding='utf-8')


def load_tool(filename: str):
    name = 'starside_' + filename.replace('.py', '').replace('-', '_')
    spec = importlib.util.spec_from_file_location(name, Path(ROOT) / 'tools' / filename)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod



def invoke(mod) -> None:
    old = sys.argv
    sys.argv = [str(Path(mod.__file__).resolve())]
    t0 = time.perf_counter()
    try:
        code = mod.main()
    finally:
        sys.argv = old
    print('  %s  %.1fs' % (Path(mod.__file__).resolve().relative_to(ROOT).as_posix(),
                           time.perf_counter() - t0), flush=True)
    if code not in (0, None):
        sys.exit(code)



def under(*rel) -> list[Path]:
    return [ROOT / r for r in rel]


def doc_slugs(shell) -> list[tuple[str, Path]]:
    out = []
    for slug, path in shell.sources():
        if '%s/index.html' % slug in shell.FIXED:
            continue
        out.append((slug, Path(path)))
    return out


def main() -> int:
    t0 = time.perf_counter()
    force = '--force' in sys.argv[1:]
    if '--help' in sys.argv[1:]:
        print(__doc__)
        return 0

    stamp = {} if force else load_stamp()
    next_stamp: dict = {}
    ran = False

    def dirty(key: str, paths) -> bool:
        got = digest_files(paths)
        next_stamp[key] = got
        return force or stamp.get(key) != got

    orch = under(ORCH)
    shared = under(*SHARED)
    facts = facts_files()
    sources = source_files()

    if dirty('orch', orch) and not force:
        force = True
        stamp = {}

    # ── 纠正源稿：改的是 md，必须在算页哈希之前 ──
    if dirty('normalize', sources + under('tools/items.py')):
        items = load_tool('items.py')
        t = time.perf_counter()
        items.normalize()
        print('  tools/items.py  %.1fs' % (time.perf_counter() - t), flush=True)
        ran = True
        sources = source_files()
        next_stamp['normalize'] = digest_files(sources + under('tools/items.py'))
    else:
        print('  skip  items.py --normalize', flush=True)

    import shell  # noqa: WPS433  — 清单现扫，与生成器同一处
    slugs = doc_slugs(shell)
    page_gen = shared + under('tools/convert-doc.py')
    page_dirty: list[str] = []
    for slug, path in slugs:
        key = 'page:%s' % slug
        if dirty(key, [path, *page_gen, *facts]):
            page_dirty.append(slug)
    art_dirty = dirty('artifact-mods', [
        ROOT / 'references' / 'keys' / 'artifact-mods.md',
        *shared, *facts, *under('tools/convert-artifact-mods.py'),
    ])
    sets_dirty = dirty('armor-sets', [
        ROOT / 'references' / 'keys' / 'armor-sets.md',
        *shared, *facts, *under('tools/convert-armor-sets.py'),
    ])

    if page_dirty or art_dirty or sets_dirty:
        import resolve
        resolve.shared()

    if art_dirty:
        invoke(load_tool('convert-artifact-mods.py'))
        ran = True
    else:
        print('  skip  convert-artifact-mods.py', flush=True)
    if sets_dirty:
        invoke(load_tool('convert-armor-sets.py'))
        ran = True
    else:
        print('  skip  convert-armor-sets.py', flush=True)
    if page_dirty:
        cdoc = load_tool('convert-doc.py')
        t = time.perf_counter()
        if len(page_dirty) > 3:
            shell.hush_emit(True)
        try:
            for slug in page_dirty:
                cdoc.build(slug)
            cdoc.unbuilt()
        finally:
            shell.hush_emit(False)
        print('  tools/convert-doc.py  %.1fs  %d pages' % (
            time.perf_counter() - t, len(page_dirty)), flush=True)
        ran = True
    else:
        print('  skip  convert-doc.py  %d pages' % len(slugs), flush=True)

    index_files = sorted((ROOT / 'data' / 'index').glob('*.json'))
    index_files += sorted((ROOT / 'data' / 'index').glob('*/*.json'))
    build_json = sorted((ROOT / 'references' / 'builds').glob('*/*.json'))
    builds_dirty = dirty('builds', build_json + index_files + under(
        'tools/convert-build.py', 'tools/vocab.py', 'tools/dim.py', 'tools/mods.py',
        'tools/migrate.py',
    ) + shared)
    if builds_dirty:
        invoke(load_tool('convert-build.py'))
        ran = True
    else:
        print('  skip  convert-build.py', flush=True)

    weapons_dirty = dirty('weapons', facts + under(
        'tools/build-weapons.py', 'tools/type-icons.json',
    ) + [
        ROOT / 'site' / 'builds' / 'index.html',
        ROOT / 'site' / 'builds' / 'sets' / 'index.html',
    ] + shared)
    if weapons_dirty:
        invoke(load_tool('build-weapons.py'))
        ran = True
    else:
        print('  skip  build-weapons.py', flush=True)

    home_dirty = dirty('home', under('tools/build-home.py') + [
        ROOT / 'site' / 'index.html',
    ]) or art_dirty or sets_dirty or bool(page_dirty) or builds_dirty or weapons_dirty
    if home_dirty:
        invoke(load_tool('build-home.py'))
        ran = True
        next_stamp['home'] = digest_files(under('tools/build-home.py') + [
            ROOT / 'site' / 'index.html',
        ])
    else:
        print('  skip  build-home.py', flush=True)

    search_dirty = dirty('search', under(
        'tools/build-search.py', 'tools/pinyin.py',
    )) or art_dirty or sets_dirty or bool(page_dirty) or builds_dirty or weapons_dirty
    if search_dirty:
        invoke(load_tool('build-search.py'))
        ran = True
    else:
        print('  skip  build-search.py', flush=True)

    terms_dirty = dirty('terms', under(
        'tools/build-terms.py', 'tools/items.py',
        'site/admin/dialect.js', 'site/builds/source.js',
    ) + sources)
    if terms_dirty:
        invoke(load_tool('build-terms.py'))
        ran = True
    else:
        print('  skip  build-terms.py', flush=True)

    gates_dirty = dirty('gates', under(
        'tools/check_shell.py', 'tools/check_terms.py', 'tools/check_type.py',
        'site/assets/site.css',
    ))
    if ran or gates_dirty:
        for name in ('check_shell.py', 'check_terms.py', 'check_type.py'):
            invoke(load_tool(name))
        ran = True
    else:
        print('  skip  gates', flush=True)


    save_stamp(next_stamp)
    print('build  %.1fs%s' % (time.perf_counter() - t0, '' if ran else '  (up to date)'),
          flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
