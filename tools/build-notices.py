#!/usr/bin/env python3
"""从 references/docs/notices.md 提取最新一条公告，写出 site/assets/notice-data.js。"""

from __future__ import annotations

import html as htmllib
import json
import os
import re

import markup
import shell

SRC = os.path.join(shell.ROOT, "references", "docs", "notices.md")
OUT = os.path.join(shell.SITE, "assets", "notice-data.js")
HREF_REL = re.compile(r'href="\.\./([^"]+)"')
NOTICE_TAG = re.compile(r"<script>[^<]*assets/notice\.js[^<]*</script>")


def _rewrite_links(fragment: str) -> str:
    """将相对 notices/ 目录的 ../ 链接转成 data-to，由 notice.js 按当前页深度补全前缀。"""
    return HREF_REL.sub(lambda m: 'data-to="%s" href="#"' % m.group(1), fragment)


def _render_chunk(chunk: str) -> str:
    """将第一条公告的分节正文（段落与无序列表）转成弹窗 HTML。"""
    lines = chunk.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith("- "):
            out.append("<ul>")
            while i < len(lines) and lines[i].startswith("- "):
                item = markup.inline(lines[i][2:].strip(), rich=True)
                out.append("<li>%s</li>" % _rewrite_links(item))
                i += 1
            out.append("</ul>")
            continue
        para: list[str] = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith("- "):
            para.append(lines[i].strip())
            i += 1
        joined = "<br>".join(markup.inline(p, rich=True) for p in para)
        out.append("<p>%s</p>" % _rewrite_links(joined))
    return "".join(out)


def parse_latest(md: str) -> dict[str, str]:
    """解析公告源稿最新一期分节，返回 {id, date, title, html}。"""
    got = shell.parse_notice(md)
    if got is None:
        markup.die("notices.md 至少需要一条「## 标题」公告分节")
    return {
        "id": got["id"],
        "date": got["date"],
        "title": htmllib.unescape(got["title"]),
        "html": _render_chunk(got["chunk"]),
    }


def _sync_handwritten(tag: str) -> None:
    """手写页面的内联公告脚本与 shell.announce_tag 保持同步，确保已读跳过与闸门一致。"""
    for rel in (shell.HOME, os.path.join("eververse", "index.html")):
        path = os.path.join(shell.SITE, rel)
        with open(path, encoding="utf-8") as f:
            src = f.read()
        new, n = NOTICE_TAG.subn(lambda _: tag, src, count=1)
        if n != 1:
            markup.die("%s 里找不到唯一一条 assets/notice.js 内联脚本" % rel)
        if new != src:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)


def main() -> int:
    with open(SRC, encoding="utf-8") as f:
        md = f.read()
    latest = parse_latest(md)
    payload = "export default %s;\n" % json.dumps(latest, ensure_ascii=False)
    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = f.read()
    if old != payload:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(payload)
    _sync_handwritten(shell.announce_tag(latest["id"]))
    print("站内公告：已更新 assets/notice-data.js（当前 %s）" % latest["id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
