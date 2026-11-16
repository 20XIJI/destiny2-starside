#!/usr/bin/env python3
"""突袭与地牢（Raid & 地牢）详情页渲染与校对：HERO 顶栏 + 双列首领数值卡 + 对称关卡掉落卡。

由 tools/convert-doc.py 在源稿声明「版式：副本」时调起，保留 `## 首领数值` 与
`## 关卡掉落` 两块独立分节，统一居中平衡并放大武器/护甲/首领图。
"""

from __future__ import annotations

import html as htmllib
import os
import posixpath
import re
from typing import Any, Callable

import markup
import resolve
import shell
from markup import (
    IMG,
    LINK,
    bmark,
    die,
    inline,
    meta_of,
    no_nested_span,
    plain,
    text_of,
)

CELL_BREAK = "\\\\"
ANY_SLOTS = ("头", "手臂", "护甲", "腿", "职业物品")
SLOT_ORDER = {
    "头": 0,
    "头部": 0,
    "臂": 1,
    "手臂": 1,
    "胸": 2,
    "胸部": 2,
    "胸甲": 2,
    "护甲": 2,
    "腿": 3,
    "腿部": 3,
    "职": 4,
    "职业物品": 4,
    "任意": 5,
    "任意部位": 5,
}
SLOT_SHORT = {
    "头部": "头",
    "手臂": "手臂",
    "胸部": "护甲",
    "腿部": "腿",
    "职业物品": "职业物品",
}

_CACHE: dict[str, Any] = {}


def _guide_map() -> dict[str, tuple[str, str]]:
    """从 raid-guides.md 现扫各副本的 (模式名, 相对 raid-guides/ 的封面路径)。"""
    cached = _CACHE.get("guides")
    if cached is not None:
        return cached
    out: dict[str, tuple[str, str]] = {}
    path = shell.source_path("raid-guides")
    if path and os.path.exists(path):
        mode = "突袭"
        with open(path, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if line.startswith("## "):
                    heading = line[3:].strip()
                    mode = "地牢" if "地牢" in heading else "突袭"
                elif line.startswith("攻略："):
                    parts = [p.strip() for p in line[3:].split("|")]
                    if len(parts) >= 3 and parts[2].endswith(".html"):
                        out[parts[2]] = (mode, parts[1])
    _CACHE["guides"] = out
    return out


def _weapon_info() -> dict[str, dict[str, str]]:
    """武器中文名（含去空格键）→ {hash, icon, type, frame, el_cls, el_zh}。"""
    cached = _CACHE.get("weapons")
    if cached is not None:
        return cached
    out: dict[str, dict[str, str]] = {}
    wpn_path = os.path.join(shell.SITE, "weapons", "index.js")
    wpn_el: dict[str, tuple[str, str]] = {}
    if os.path.exists(wpn_path):
        with open(wpn_path, encoding="utf-8") as f:
            js_src = f.read()
        el_map = {
            "1": ("el-kinetic", "动能"),
            "2": ("el-arc", "电弧"),
            "3": ("el-solar", "烈日"),
            "4": ("el-void", "虚空"),
            "6": ("el-stasis", "冰影"),
            "7": ("el-strand", "缚丝"),
        }
        for m in re.finditer(r'\["(\d{6,})",\s*"[^"]*",\s*\d+,\s*(\d+),', js_src):
            pair = el_map.get(m.group(2))
            if pair:
                wpn_el[m.group(1)] = pair
    facts, _ = resolve.shared()
    for h, rec in facts.items.items():
        if rec.get("sameAs"):
            continue
        if wpn_el and h not in wpn_el:
            continue
        zh = (rec.get("i18n") or {}).get("zh-CN") or {}
        nm = zh.get("name")
        if not nm or nm in out:
            continue
        arch = (rec.get("derived") or {}).get("archetype")
        frame = ""
        if arch is not None:
            frec = facts.items.get(str(arch)) or {}
            frame = ((frec.get("i18n") or {}).get("zh-CN") or {}).get("name") or ""
        el_cls, el_zh = wpn_el.get(h, ("", ""))
        info = {
            "hash": h,
            "icon": rec.get("icon_local") or "",
            "type": zh.get("itemTypeDisplayName") or "",
            "frame": frame,
            "el_cls": el_cls,
            "el_zh": el_zh,
        }
        out[nm] = info
        p_nm = plain(nm)
        if p_nm and p_nm not in out:
            out[p_nm] = info
    _CACHE["weapons"] = out
    return out


def _lookup_weapon(wmap: dict[str, dict[str, str]], name: str) -> dict[str, str]:
    return wmap.get(name) or wmap.get(plain(name)) or {}


def _set_info() -> dict[str, dict[str, Any]]:
    """护甲套装名 → {href, bonuses: [{pieces, name, icon, w, h, body_html}]}。"""
    cached = _CACHE.get("sets")
    if cached is not None:
        return cached
    out: dict[str, dict[str, Any]] = {}
    sets_html = os.path.join(shell.SITE, "armor-sets", "index.html")
    if os.path.exists(sets_html):
        html_src = shell.read_page(sets_html)
        for m in re.finditer(
            r'<article class="set" id="([^"]+)">.*?<h3>([^<]+)</h3>(.*?)</article>',
            html_src,
            re.S,
        ):
            sid, sname, inner = (
                m.group(1),
                htmllib.unescape(m.group(2)).strip(),
                m.group(3),
            )
            bonuses: list[dict[str, Any]] = []
            for bm in re.finditer(
                r'<section class="bonus">.*?<img[^>]*src="([^"]+)"[^>]*>\s*'
                r'<span class="piece">([^<]+)</span>\s*<span class="bonus-name">([^<]+)</span>\s*</h4>\s*'
                r'<div class="bonus-body"[^>]*>(.*?)</div>\s*</section>',
                inner,
                re.S,
            ):
                icon_rel = "armor-sets/" + bm.group(1).lstrip("/")
                icon_abs = os.path.join(shell.SITE, icon_rel)
                w, h = 40, 40
                if os.path.exists(icon_abs):
                    with open(icon_abs, "rb") as img_f:
                        w, h = markup.img_size(img_f.read())
                body_clean = re.sub(r'\sdata-(?:b|e)="[^"]*"', "", bm.group(4)).strip()
                bonuses.append(
                    {
                        "icon": icon_rel,
                        "w": w,
                        "h": h,
                        "pieces": bm.group(2).strip(),
                        "name": bm.group(3).strip(),
                        "body_html": body_clean,
                    }
                )
            out[sname] = {
                "href": "armor-sets/index.html#" + sid,
                "bonuses": bonuses,
                "tags": "",
            }
    facts, _ = resolve.shared()
    for h, rec in facts.sets.items():
        zh = (rec.get("i18n") or {}).get("zh-CN") or {}
        nm = zh.get("name")
        if not nm:
            continue
        if nm in out:
            out[nm]["tags"] = zh.get("标签") or ""
        else:
            out[nm] = {
                "href": "weapons/index.html?s=sets&w=" + h,
                "bonuses": [],
                "tags": zh.get("标签") or "",
            }
    _CACHE["sets"] = out
    return out


def _set_map() -> dict[str, str]:
    return {k: v["href"] for k, v in _set_info().items()}


def _strip_img_and_link(text: str) -> str:
    return LINK.sub(r"\1", IMG.sub("", text)).strip()


def _split_sections(body: str) -> list[tuple[str, str, int]]:
    parts = re.split(r"^## ", body, flags=re.M)
    if parts[0].strip():
        die(
            "第一个 ## 之前有正文，资料页的正文一律归在分节里：%r"
            % parts[0].strip()[:60]
        )
    if len(parts) == 1:
        die("源稿一个 ## 分节都没有")
    off = 0
    offs: list[int] = []
    for p in parts:
        offs.append(off)
        off += p.count("\n")
    out: list[tuple[str, str, int]] = []
    for si, part in enumerate(parts[1:], 1):
        head, _, chunk = part.partition("\n")
        out.append((head.strip(), chunk, offs[si]))
    return out


def _parse_table(
    lines: list[str],
    split_cells: Callable[[str], list[str]],
    is_rule: Callable[[list[str]], bool],
) -> tuple[list[str], list[list[str]]]:
    rows = [split_cells(ln) for ln in lines]
    if len(rows) < 2 or not is_rule(rows[1]):
        die("首领或掉落表格缺 |---| 分隔行")
    headers = rows[0]
    body = [r for r in rows[2:] if not is_rule(r)]
    return headers, body


def _split_tables_and_prose(
    chunk: str,
) -> tuple[list[tuple[int, str]], list[tuple[int, list[str]]]]:
    """将分节切分成文本段落与连续 markdown 表格块（保留源行相对偏移）。"""
    lines = chunk.split("\n")
    prose: list[tuple[int, str]] = []
    tables: list[tuple[int, list[str]]] = []
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            i += 1
            continue
        if s.startswith("|"):
            start = i
            tlines: list[str] = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                tlines.append(lines[i])
                i += 1
            tables.append((start, tlines))
        else:
            prose.append((i, s))
            i += 1
    return prose, tables


def _guide_kind(url: str) -> str:
    if "docs.qq.com" in url:
        return "图文攻略 · 腾讯文档"
    if "bilibili.com" in url:
        return "视频攻略 · 哔哩哔哩"
    if "youtube.com" in url or "youtu.be" in url:
        return "视频攻略 · YouTube"
    if url.startswith("http"):
        return "站外攻略"
    return "站内攻略"


def _extract_guides(
    prose: list[tuple[int, str]],
) -> list[tuple[int, str, str, str, str]]:
    """提取攻略条目 → [(相对行偏移, 标题, 链接, 类型标签, 作者/说明)]。"""
    out: list[tuple[int, str, str, str, str]] = []
    for off, raw in prose:
        line = raw.lstrip("- ").strip()
        m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", line)
        if not m:
            continue
        title = m.group(1).rstrip(" →").strip()
        url = m.group(2).strip()
        rest = line[m.end() :].strip()
        parts = (
            [p.strip() for p in rest.lstrip("|").split("|") if p.strip()]
            if "|" in rest
            else []
        )
        kind = parts[0] if len(parts) >= 1 else _guide_kind(url)
        note = parts[1] if len(parts) >= 2 else ""
        out.append((off, title, url, kind, note))
    return out


def _link_weapons_and_sets(md_frag: str, at_root: str) -> str:
    """将概览句里的护甲套装名与 {exotic|武器名} 转成站内可点击链接。"""
    smap = _set_map()
    wmap = _weapon_info()
    out = inline(md_frag, rich=True)
    for name, rel in sorted(smap.items(), key=lambda x: -len(x[0])):
        esc = htmllib.escape(name)
        if esc in out and f">{esc}</a>" not in out:
            out = out.replace(
                esc,
                '<a class="rg-inline-link" href="%s%s">%s</a>' % (at_root, rel, esc),
                1,
            )
    for name, info in sorted(wmap.items(), key=lambda x: -len(x[0])):
        wh = info.get("hash")
        if not wh:
            continue
        esc = htmllib.escape(name)
        span = '<span class="exotic">%s</span>' % esc
        if span in out:
            out = out.replace(
                span,
                '<a class="rg-inline-link" href="%sweapons/index.html?w=%s">%s</a>'
                % (at_root, wh, span),
                1,
            )
    return out


def _render_boss_card(
    cells: list[str],
    headers: list[str],
    scales: dict[str, list[float]],
    icons: Any,
    tier_of: Callable[[str, list[float]], int | None],
    grouped: Callable[[str], str],
    row_attr: str,
) -> str:
    padded = list(cells) + [""] * max(0, len(headers) - len(cells))
    boss_cell, hp_cell, dist_cell, time_cell, kill_dps, one_dps, note_cell = padded[:7]

    m_img = IMG.search(boss_cell)
    portrait = icons.html(m_img.group(1), cls="rg-boss-img") if m_img else ""
    boss_name = inline(IMG.sub("", boss_cell).strip(), rich=True)

    hp_raw = hp_cell.strip()
    hp_bounds = scales.get("生命值")
    tier = tier_of(hp_raw, hp_bounds) if hp_bounds else None
    tier_attr = ' data-tier="%d"' % tier if tier is not None else ""
    hp_html = grouped(hp_raw) if hp_raw.isdigit() else inline(hp_raw, rich=True)

    def stat_val(raw: str, suffix: str = "") -> str:
        val = raw.strip()
        if not val:
            return '<span class="na">—</span>'
        rendered = inline(val, rich=True)
        if suffix and re.fullmatch(r"\d+(?:\.\d+)?", val):
            rendered += '<small class="rg-unit">%s</small>' % suffix
        return rendered

    note_raw = note_cell.strip()
    if note_raw:
        wm = markup.whole_marker(note_raw)
        if wm:
            note_html = '<div class="rg-boss-note %s">%s</div>' % (
                wm[0],
                inline(wm[1], rich=True),
            )
        else:
            note_html = '<div class="rg-boss-note">%s</div>' % inline(
                note_raw, rich=True
            )
    else:
        note_html = ""

    return (
        '<article class="rg-boss"%s>'
        '<header class="rg-boss-head">'
        "%s"
        '<div class="rg-boss-title">'
        '<h3 class="rg-boss-name">%s</h3>'
        "</div>"
        '<div class="rg-boss-hp">'
        '<span class="rg-k">生命值</span>'
        '<strong class="rg-hp"%s>%s</strong>'
        "</div>"
        "</header>"
        '<dl class="rg-boss-stats">'
        "<div><dt>距离</dt><dd>%s</dd></div>"
        "<div><dt>输出时间</dt><dd>%s</dd></div>"
        "<div><dt>击杀 DPS</dt><dd>%s</dd></div>"
        "<div><dt>一波 DPS</dt><dd>%s</dd></div>"
        "</dl>"
        "%s"
        "</article>"
        % (
            row_attr,
            portrait,
            boss_name,
            tier_attr,
            hp_html,
            stat_val(dist_cell),
            stat_val(time_cell, "s"),
            stat_val(kill_dps),
            stat_val(one_dps),
            note_html,
        )
    )


def _render_weapon_drop(
    frag: str, icons: Any, at_root: str, wmap: dict[str, dict[str, str]]
) -> str:
    raw = frag.strip()
    if not raw:
        return ""
    m_img = IMG.search(raw)
    if not m_img:
        return '<div class="rg-wild-txt">%s</div>' % inline(raw, rich=True)

    img_html = icons.html(m_img.group(1), cls="rg-wpn-img")
    rest = IMG.sub("", raw).strip()

    # 形态 1：{exotic|回旋喝彩}（{el-strand|缚丝} 火箭发射器）
    m_exo = re.match(r"^\{exotic\|([^}]+)\}(?:（(.+?)）)?$", rest)
    # 形态 2：{el-arc|电弧} · 超前（微型冲锋枪）
    m_leg = re.match(r"^(\{([^|]+)\|[^}]+\})\s*·\s*([^（(]+?)(?:（([^）]+)）)?$", rest)

    exotic = bool(m_exo)
    el_attr = ""
    if m_exo:
        name = m_exo.group(1).strip()
        sub = (m_exo.group(2) or "").strip()
        title_html = inline("{exotic|%s}" % name, rich=True)
        sub_html = inline(sub, rich=True) if sub else "异域武器"
    elif m_leg:
        elem_tok = m_leg.group(1).strip()
        el_attr = ' data-el="%s"' % htmllib.escape(m_leg.group(2).strip())
        name = m_leg.group(3).strip()
        wtype = (m_leg.group(4) or "").strip()
        title_html = '%s<span class="rg-dot"> · </span>%s' % (
            inline(elem_tok, rich=True),
            htmllib.escape(name),
        )
        sub_html = htmllib.escape(wtype)
    else:
        name = text_of(markup.uncolor(rest), collapse=True)
        title_html = inline(rest, rich=True)
        sub_html = ""

    winfo = _lookup_weapon(wmap, name)
    wh = winfo.get("hash")
    frame = winfo.get("frame") or ""
    if frame and not exotic:
        sub_html = (
            "%s · %s" % (sub_html, htmllib.escape(frame))
            if sub_html
            else htmllib.escape(frame)
        )

    cls = "rg-wpn is-exo" if exotic else "rg-wpn"
    body = '%s<div class="rg-wpn-meta"><div class="rg-wpn-name">%s</div>%s</div>' % (
        img_html,
        title_html,
        '<div class="rg-wpn-sub">%s</div>' % sub_html if sub_html else "",
    )
    if wh:
        return '<a class="%s"%s href="%sweapons/index.html?w=%s">%s</a>' % (
            cls,
            el_attr,
            at_root,
            wh,
            body,
        )
    return '<div class="%s"%s>%s</div>' % (cls, el_attr, body)


def _parse_armor_slot(frag: str) -> tuple[int, str, list[str]]:
    raw = frag.strip()
    imgs = [m.group(1) for m in IMG.finditer(raw)]
    slot_label = text_of(markup.uncolor(IMG.sub("", raw)), collapse=True)
    return SLOT_ORDER.get(slot_label, 9), slot_label, imgs


def _render_armor_drops(arm_frags: list[str], icons: Any, set_name: str) -> str:
    """只渲染猎人单职业护甲，去掉套盒边框并按「头 → 手臂 → 护甲 → 腿 → 职业物品」排序。"""
    parsed = sorted(
        (_parse_armor_slot(f) for f in arm_frags),
        key=lambda item: item[0],
    )
    single_rows: list[str] = []
    any_blocks: list[str] = []
    sub_line = htmllib.escape(set_name) if set_name else "猎人护甲"

    for _, slot_label, imgs in parsed:
        if len(imgs) == 5 and "任意" in slot_label:
            items = "".join(
                '<figure class="rg-any-piece">%s<figcaption>%s</figcaption></figure>'
                % (icons.html(src, cls="rg-any-img"), lbl)
                for lbl, src in zip(ANY_SLOTS, imgs)
            )
            any_blocks.append(
                '<div class="rg-any-wrap">'
                '<div class="rg-any-lbl">%s</div>'
                '<div class="rg-any-row">%s</div>'
                "</div>" % (htmllib.escape(slot_label), items)
            )
        elif imgs:
            # 源稿中 3 枚图标固定为「猎人 / 泰坦 / 术士」，只取首枚猎人图标
            caption = SLOT_SHORT.get(slot_label, slot_label)
            single_rows.append(
                '<div class="rg-arm">%s'
                '<div class="rg-arm-meta">'
                '<div class="rg-arm-lbl">%s</div>'
                '<div class="rg-arm-sub">%s</div>'
                "</div>"
                "</div>"
                % (
                    icons.html(imgs[0], cls="rg-arm-img"),
                    htmllib.escape(caption),
                    sub_line,
                )
            )

    return "".join(single_rows + any_blocks)


def _render_loot_row(
    idx: int,
    cells: list[str],
    icons: Any,
    at_root: str,
    wmap: dict[str, dict[str, str]],
    set_name: str,
    row_attr: str,
) -> str:
    padded = list(cells) + [""] * max(0, 3 - len(cells))
    enc_raw, wpn_raw, arm_raw = padded[:3]
    enc_name = inline(enc_raw.strip(), rich=True)

    wpn_frags = [p.strip() for p in wpn_raw.split(CELL_BREAK) if p.strip()]
    arm_frags = [p.strip() for p in arm_raw.split(CELL_BREAK) if p.strip()]

    wpn_items = [_render_weapon_drop(f, icons, at_root, wmap) for f in wpn_frags]
    arm_html = _render_armor_drops(arm_frags, icons, set_name)

    return (
        '<article class="rg-loot-row"%s>'
        '<div class="rg-cell rg-cell-id">'
        '<span class="rg-enc-idx">%02d</span>'
        '<h3 class="rg-enc-name">%s</h3>'
        "</div>"
        '<div class="rg-cell rg-cell-wpns">%s</div>'
        '<div class="rg-cell rg-cell-arms">%s</div>'
        "</article>"
        % (
            row_attr,
            idx,
            enc_name,
            "".join(wpn_items) or '<div class="rg-wild-txt">—</div>',
            arm_html or '<div class="rg-wild-txt">—</div>',
        )
    )


def _prose_p(txt: str, mark_attr: str, link_refs: bool, at_root: str) -> str:
    """整段仅包裹单个 {token|...} 时将 class 提上 <p>，避免与内部着色构成嵌套 span。"""
    wm = markup.whole_marker(txt.strip())
    if wm:
        cls, inner = wm
        body = (
            _link_weapons_and_sets(inner, at_root)
            if link_refs
            else inline(inner, rich=True)
        )
        return '<p class="rg-loot-note %s"%s>%s</p>' % (cls, mark_attr, body)
    body = _link_weapons_and_sets(txt, at_root) if link_refs else inline(txt, rich=True)
    return '<p class="rg-loot-note"%s>%s</p>' % (mark_attr, body)


def render(
    md: str,
    slug: str,
    digest: str,
    *,
    icons: Any,
    scale_of: Callable[[str], tuple[str, list[float]]],
    tier_of: Callable[[str, list[float]], int | None],
    grouped: Callable[[str], str],
    split_cells: Callable[[str], list[str]],
    is_rule: Callable[[list[str]], bool],
    render_blocks: Callable[..., list[str]],
    where_of: Callable[[str, str], str],
    doc_id_of: Callable[[str], str],
    scale_line: re.Pattern[str],
    meta_line: re.Pattern[str],
) -> tuple[str, str]:
    """将副本攻略与掉落源稿渲染为均衡居中的 Raid/Dungeon 详情页。"""
    m = re.match(r"^#\s+(.+)$", md.split("\n")[0])
    if not m:
        die("源稿第一行必须是「# 页面标题」")
    title = m.group(1).strip()

    desc = meta_of(md, "描述")
    stamp = meta_of(md, "更新")
    foot = meta_of(md, "页脚", required=False)
    thanks = meta_of(md, "鸣谢", required=False)
    mark = meta_of(md, "待测标记", required=False)
    src = meta_of(md, "数据源", required=False)
    where = where_of(md, slug)
    up = where.count("/") + 1
    at_root = "../" * up

    body = meta_line.sub("", md[md.index("\n") :])
    sections = _split_sections(body)

    guide_section: tuple[str, list[tuple[int, str, str, str, str]], int] | None = None
    boss_section: tuple[str, str, int] | None = None
    loot_section: tuple[str, str, int] | None = None
    for head, chunk, at in sections:
        if head in ("相关攻略", "图文攻略"):
            prose, _ = _split_tables_and_prose(chunk)
            guides = _extract_guides(prose)
            if guides:
                guide_section = (head, guides, at)
        elif head == "首领数值":
            boss_section = (head, chunk, at)
        elif head == "关卡掉落":
            loot_section = (head, chunk, at)

    sub_rel = where.removeprefix("raid-guides/") + "/index.html"
    _, raw_cover = _guide_map().get(sub_rel, ("副本", ""))
    cover_src = posixpath.normpath("../" + raw_cover) if raw_cover else ""
    cover_html = icons.html(cover_src, cls="rg-hero-art") if cover_src else ""

    full = "%s · Starside" % title
    o: list[str] = [
        shell.head(full, desc, app_js=False, up=up, sky=True),
        shell.nav(
            title,
            None,
            up=up,
            parent=[
                x.strip()
                for x in meta_of(md, "上级", required=False).split("、")
                if x.strip()
            ],
        ),
        shell.page_head(title),
        '<main data-src="%s" data-src-hash="%s">' % (doc_id_of(slug), digest),
    ]

    # ── 先提取首领与掉落行，用来填充 Hero 摘要 + 按顺序登记图标 ──
    boss_prose_pre: list[tuple[int, str]] = []
    boss_prose_post: list[tuple[int, str]] = []
    boss_cards: list[str] = []
    boss_count = 0
    if boss_section is not None:
        _, b_chunk, b_at = boss_section
        scales: dict[str, list[float]] = {}
        for hit in scale_line.finditer(b_chunk):
            col, bounds = scale_of(hit.group(1).strip())
            scales[col] = bounds
        b_clean = scale_line.sub("", b_chunk)
        b_prose, b_tables = _split_tables_and_prose(b_clean)
        b_table_off = b_tables[0][0] if b_tables else len(b_clean.splitlines())
        boss_prose_pre = [(p, t) for p, t in b_prose if p < b_table_off]
        boss_prose_post = [(p, t) for p, t in b_prose if p > b_table_off]
        if b_tables:
            t_off, t_lines = b_tables[0]
            headers, brows = _parse_table(t_lines, split_cells, is_rule)
            boss_count = len(brows)
            for ri, row in enumerate(brows):
                boss_cards.append(
                    _render_boss_card(
                        row,
                        headers,
                        scales,
                        icons,
                        tier_of,
                        grouped,
                        bmark(b_at + 1 + t_off + 2 + ri),
                    )
                )

    loot_prose: list[tuple[int, str]] = []
    loot_prose_pre: list[tuple[int, str]] = []
    loot_prose_post: list[tuple[int, str]] = []
    enc_cards: list[str] = []
    wmap = _weapon_info()
    sets = _set_info()
    set_name = ""
    if loot_section is not None:
        _, l_chunk, l_at = loot_section
        loot_prose, l_tables = _split_tables_and_prose(l_chunk)
        l_table_off = l_tables[0][0] if l_tables else len(l_chunk.splitlines())
        loot_prose_pre = [(p, t) for p, t in loot_prose if p < l_table_off]
        loot_prose_post = [(p, t) for p, t in loot_prose if p > l_table_off]
        prose_txt = " ".join(txt for _, txt in loot_prose)
        set_m = re.search(r"护甲套装：([^（；。\n]+)", prose_txt)
        if set_m:
            cand = markup.uncolor(set_m.group(1)).strip()
            if cand in sets:
                set_name = cand
        if not set_name:
            for nm in sorted(sets, key=lambda x: -len(x)):
                if nm in prose_txt:
                    set_name = nm
                    break
        if l_tables:
            t_off, t_lines = l_tables[0]
            _, erows = _parse_table(t_lines, split_cells, is_rule)
            for ei, row in enumerate(erows, 1):
                enc_cards.append(
                    _render_loot_row(
                        ei,
                        row,
                        icons,
                        at_root,
                        wmap,
                        set_name,
                        bmark(l_at + 1 + t_off + 2 + (ei - 1)),
                    )
                )

    # ── Hero 概览条（两格对齐首领数值的双层材质结构：--surf-2 头带 + --surf-1 左对齐主体 + 右侧无遮罩封面） ──
    hero_panes: list[str] = []
    if set_name and set_name in sets:
        sinfo = sets[set_name]
        set_tags = htmllib.escape(sinfo.get("tags") or "详情 →")
        set_lines = "".join(
            '<div class="rg-set-line">'
            '<img src="%s%s" alt="" width="%d" height="%d">'
            "<b>%s</b>"
            "<span>%s</span>"
            "</div>"
            % (
                at_root,
                b["icon"],
                b["w"],
                b["h"],
                htmllib.escape(b["pieces"].replace(" ", "")),
                htmllib.escape(b["name"]),
            )
            for b in sinfo["bonuses"]
        )
        hero_panes.append(
            '<a class="rg-hero-pane" href="%s%s">'
            '<div class="rg-hero-head"><span>护甲套装</span><span class="rg-hero-hint">%s</span></div>'
            '<div class="rg-hero-body">'
            '<div class="rg-hero-v">%s</div>'
            '<div class="rg-set-lines">%s</div>'
            "</div>"
            "</a>"
            % (at_root, sinfo["href"], set_tags, htmllib.escape(set_name), set_lines)
        )

    if loot_prose:
        prose_txt = " ".join(txt for _, txt in loot_prose)
        exo_sub_map: dict[str, str] = {}
        exo_note_map: dict[str, str] = {}
        if loot_section is not None:
            for m_es in re.finditer(
                r"\{exotic\|([^}]+)\}（([^）]+)）", loot_section[1]
            ):
                exo_sub_map[m_es.group(1).strip()] = m_es.group(2).strip()
        for m_en in re.finditer(r"\{exotic\|([^}]+)\}（([^）]+)）", prose_txt):
            exo_note_map[m_en.group(1).strip()] = m_en.group(2).strip()
        seen_exo: set[str] = set()
        for m_ex in re.finditer(r"\{exotic\|([^}]+)\}", prose_txt):
            exo_nm = m_ex.group(1).strip()
            if exo_nm == "异域" or exo_nm in seen_exo:
                continue
            seen_exo.add(exo_nm)
            winfo = _lookup_weapon(wmap, exo_nm)
            wh = winfo.get("hash")
            w_icon = winfo.get("icon") or ""
            w_icon_rel = (at_root + w_icon) if w_icon else ""
            exo_img_html = (
                '<img class="rg-hero-exo-img" src="%s" alt="" width="96" height="96">'
                % htmllib.escape(w_icon_rel)
                if w_icon_rel
                else ""
            )
            el_cls = winfo.get("el_cls") or ""
            el_zh = winfo.get("el_zh") or ""
            w_type = winfo.get("type") or ""
            if w_type:
                sub_raw = (
                    "{%s|%s} %s" % (el_cls, el_zh, w_type)
                    if el_cls and el_zh
                    else w_type
                )
            else:
                sub_raw = exo_sub_map.get(exo_nm) or "异域武器"
            note_raw = exo_note_map.get(exo_nm) or ""
            note_html = (
                '<div class="rg-hero-note">%s</div>' % inline(note_raw, rich=True)
                if note_raw and note_raw != sub_raw
                else ""
            )
            inner = (
                '<div class="rg-hero-head"><span>异域武器</span><span class="rg-hero-hint">%s</span></div>'
                '<div class="rg-hero-body rg-hero-exo-body">'
                "%s"
                '<div class="rg-hero-exo-meta">'
                '<div class="rg-hero-v exotic">%s</div>'
                '<div class="rg-hero-sub">%s</div>'
                "%s"
                "</div>"
                "</div>"
                % (
                    "查看词条 →" if wh else "副本专属",
                    exo_img_html,
                    htmllib.escape(exo_nm),
                    inline(sub_raw, rich=True),
                    note_html,
                )
            )
            if wh:
                hero_panes.append(
                    '<a class="rg-hero-pane" href="%sweapons/index.html?w=%s">%s</a>'
                    % (at_root, wh, inner)
                )
            else:
                hero_panes.append('<div class="rg-hero-pane">%s</div>' % inner)

    hero_grid = (
        '<div class="rg-hero-panes" data-panes="%d">%s</div>'
        % (len(hero_panes), "".join(hero_panes))
        if hero_panes
        else '<div class="rg-hero-panes" data-panes="1">'
        '<div class="rg-hero-pane">'
        '<div class="rg-hero-head"><span>副本概览</span><span class="rg-hero-hint">%s</span></div>'
        '<div class="rg-hero-body"><p class="rg-overview">%s</p></div>'
        "</div></div>" % (htmllib.escape(title), htmllib.escape(desc))
    )

    o.append(
        '<section class="rg-hero">%s<div class="rg-hero-media">%s</div></section>'
        % (hero_grid, cover_html)
    )

    cur_sec = 0
    for head, chunk, at in sections:
        if head in ("相关攻略", "图文攻略"):
            if guide_section is None:
                continue
            cur_sec += 1
            g_head, guides, g_at = guide_section
            cols = 1 if len(guides) == 1 else (2 if len(guides) in (2, 4) else 3)
            guide_rows = []
            for g_off, g_title, g_url, g_kind, g_note in guides:
                ext = (
                    ' target="_blank" rel="noopener"'
                    if g_url.startswith("http")
                    else ""
                )
                note_html = (
                    '<span class="rg-guide-note">%s</span>' % inline(g_note, rich=True)
                    if g_note
                    else ""
                )
                guide_rows.append(
                    '<a class="rg-guide-item" href="%s"%s%s>'
                    '<div class="rg-guide-kind">%s</div>'
                    '<div class="rg-guide-main">'
                    '<div class="rg-guide-title">%s</div>'
                    "%s"
                    "</div>"
                    '<span class="rg-guide-arrow" aria-hidden="true">→</span>'
                    "</a>"
                    % (
                        htmllib.escape(g_url),
                        ext,
                        bmark(g_at + 1 + g_off),
                        inline(g_kind, rich=True),
                        htmllib.escape(g_title),
                        note_html,
                    )
                )
            o += [
                '<section class="block" id="sec-%d">' % cur_sec,
                '<h2 class="sect-label"%s>%s</h2>'
                % (bmark(g_at), inline(g_head, rich=True)),
                '<div class="rg-guides" data-cols="%d">' % cols,
                *guide_rows,
                "</div>",
                "</section>",
            ]
        elif head == "首领数值":
            cur_sec += 1
            boss_pre_html = "".join(
                _prose_p(txt, bmark(at + 1 + p_off), False, at_root)
                for p_off, txt in boss_prose_pre
            )
            boss_post_html = "".join(
                _prose_p(txt, bmark(at + 1 + p_off), False, at_root)
                for p_off, txt in boss_prose_post
            )
            o += [
                '<section class="block" id="sec-%d">' % cur_sec,
                '<h2 class="sect-label"%s>%s</h2>'
                % (bmark(at), inline(head, rich=True)),
                *([] if not boss_pre_html else [boss_pre_html]),
                '<div class="rg-bosses">',
                *boss_cards,
                "</div>",
                *([] if not boss_post_html else [boss_post_html]),
                "</section>",
            ]
        elif head == "关卡掉落":
            cur_sec += 1
            overview_html = "".join(
                _prose_p(txt, bmark(at + 1 + p_off), True, at_root)
                for p_off, txt in loot_prose_pre
            )
            loot_post_html = "".join(
                _prose_p(txt, bmark(at + 1 + p_off), True, at_root)
                for p_off, txt in loot_prose_post
            )
            set_row_html = ""
            if set_name and set_name in sets and sets[set_name]["bonuses"]:
                sinfo = sets[set_name]
                bonuses_html = "".join(
                    '<div class="rg-cell rg-set-bonus">'
                    '<div class="rg-set-bonus-head">'
                    '<img class="rg-set-bonus-img" src="%s%s" alt="" width="%d" height="%d" loading="lazy">'
                    '<span class="rg-set-piece">%s</span>'
                    '<span class="rg-set-bname">%s</span>'
                    "</div>"
                    '<div class="rg-set-body">%s</div>'
                    "</div>"
                    % (
                        at_root,
                        b["icon"],
                        b["w"],
                        b["h"],
                        htmllib.escape(b["pieces"]),
                        htmllib.escape(b["name"]),
                        b["body_html"],
                    )
                    for b in sinfo["bonuses"]
                )
                set_row_html = (
                    '<div class="rg-set-row">'
                    '<div class="rg-cell rg-cell-id">'
                    '<span class="rg-enc-idx">套装效果</span>'
                    '<a class="rg-set-link" href="%s%s">%s</a>'
                    "</div>"
                    "%s"
                    "</div>"
                    % (at_root, sinfo["href"], htmllib.escape(set_name), bonuses_html)
                )
            o += [
                '<section class="block" id="sec-%d">' % cur_sec,
                '<h2 class="sect-label"%s>%s</h2>'
                % (bmark(at), inline(head, rich=True)),
                *([] if not overview_html else [overview_html]),
            ]
            if enc_cards or set_row_html:
                o += [
                    '<div class="rg-loot">',
                    '<div class="rg-loot-head">'
                    '<div class="c">关卡</div>'
                    '<div class="l">武器掉落</div>'
                    '<div class="l">护甲部位</div>'
                    "</div>",
                    *enc_cards,
                    set_row_html,
                    "</div>",
                ]
            if loot_post_html:
                o.append(loot_post_html)
            o.append("</section>")
        else:
            cur_sec += 1
            o += [
                '<section class="block" id="sec-%d">' % cur_sec,
                '<h2 class="sect-label"%s>%s</h2>'
                % (bmark(at), inline(head, rich=True)),
                *render_blocks(chunk, {}, {}, {}, {}, up, None, at + 1),
                "</section>",
            ]

    first = inline(foot, rich=True) if foot else ""
    if mark:
        first += shell.unsure_note(mark)
    o += [
        "</main>",
        "",
        shell.foot(
            stamp,
            first,
            source=inline(src, rich=True) if src else None,
            thanks=inline(thanks, rich=True) if thanks else None,
        ),
    ]
    return "\n".join(o), title


def check(
    md: str,
    out: str,
    slug: str,
    *,
    split_cells: Callable[[str], list[str]],
    is_rule: Callable[[list[str]], bool],
    scale_line: re.Pattern[str],
    meta_line: re.Pattern[str],
) -> None:
    """校验副本页关键条目全部落进 <main>，无未展开标记与嵌套 span。"""
    main = out[out.index("<main ") : out.index("</main>")]
    if "{" in main or "}" in main:
        die("%s 有没转换的着色标记" % slug)
    no_nested_span(main, "%s（检查 raid.py 行内渲染）" % slug)

    got = plain(text_of(main))
    body = scale_line.sub("", meta_line.sub("", md[md.index("\n") :]))
    missing: list[str] = []
    for raw in body.split("\n"):
        line = raw.strip()
        if not line.startswith("|"):
            continue
        cells = split_cells(line)
        if not cells or is_rule(cells):
            continue
        # 表头行不逐字强判（页面里改成卡片标签），只校验所有数据行的首格与非图片文本
        if cells[0] in ("首领名称", "关卡"):
            continue
        title = plain(text_of(inline(_strip_img_and_link(cells[0]), rich=True)))
        if title and title not in got:
            missing.append(title)
    if missing:
        die("%s 遗漏条目：%s" % (slug, "、".join(missing[:5])))
