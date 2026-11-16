#!/usr/bin/env python3
"""从 references/docs/notices.md 提取最新一条公告，写出 site/assets/notice-data.js。"""

from __future__ import annotations

import hashlib
import html as htmllib
import json
import os
import re

import markup
import shell

SRC = os.path.join(shell.ROOT, "references", "docs", "notices.md")
OUT = os.path.join(shell.SITE, "assets", "notice-data.js")
DATE_HEAD = re.compile(r"^(\d{4}\.\d{1,2}\.\d{1,2})\s*[·|:\-—]?\s*(.*)$")
HREF_REL = re.compile(r'href="\.\./([^"]+)"')


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
    parts = re.split(r"^## ", md, flags=re.M)
    if len(parts) < 2:
        markup.die("notices.md 至少需要一条「## 标题」公告分节")
    first = parts[1]
    raw_head, _, chunk = first.partition("\n")
    head = raw_head.strip()
    hit = DATE_HEAD.match(head)
    if hit:
        date = hit.group(1)
        title = markup.text_of(hit.group(2).strip()) or head
    else:
        date = markup.meta_of(md, "更新", required=False) or ""
        title = markup.text_of(head)
    digest = hashlib.sha1((head + "\n" + chunk.strip()).encode("utf-8")).hexdigest()[:8]
    nid = "%s-%s" % (date, digest) if date else digest
    return {
        "id": nid,
        "date": date,
        "title": htmllib.unescape(title),
        "html": _render_chunk(chunk),
    }


def main() -> int:
    with open(SRC, encoding="utf-8") as f:
        md = f.read()
    payload = "export default %s;\n" % json.dumps(parse_latest(md), ensure_ascii=False)
    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = f.read()
    if old != payload:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(payload)
    print("站内公告：已更新 assets/notice-data.js（当前 %s）" % parse_latest(md)["id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
