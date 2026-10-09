#!/usr/bin/env python3
"""data/ 物品名 → 拼音与英文检索表。

构建时按物品、套装、护甲模组族的中文名里出现过的汉字，从 tools/pinyin.json
裁出一份，写成 site/assets/pinyin.js（词典 + 中文白名单 + 英文名 + 匹配函数）。
介绍、正文、首领名、副本名不进表。全表来自 mozillazg/pinyin-data（MIT），
换表才跑 --distill。

用法：
    python3 tools/pinyin.py --distill     # 从 GitHub 重蒸 tools/pinyin.json
    python3 tools/pinyin.py               # 按 data/ 物品名写出 pinyin.js
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess

import markup
import shell
from resolve import EN, Facts, norm, text

ROOT = shell.ROOT
TABLE = os.path.join(ROOT, 'tools', 'pinyin.json')
MATCH_JS = os.path.join(ROOT, 'tools', 'pinyin-match.js')
OUT = os.path.join(shell.SITE, 'assets', 'pinyin.js')
HAN = re.compile(r'[\u4e00-\u9fff]')
TONES = str.maketrans({
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ü': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ǖ': 'v',
    'ń': 'n', 'ň': 'n', 'ǹ': 'n', 'ñ': 'n',
    'ḿ': 'm',
})
PINYIN_LINE = re.compile(r'U\+([0-9A-F]+):\s*(\S+)')


def load() -> dict[str, str]:
    with open(TABLE, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, dict) or not data:
        markup.die('tools/pinyin.json 不是一份汉字→拼音表')
    return data


def used_chars(names: list[str]) -> list[str]:
    seen: set[str] = set()
    for name in names:
        seen.update(HAN.findall(name))
    return sorted(seen)


_CATALOG: tuple[list[str], list[str]] | None = None


def item_catalog() -> tuple[list[str], list[str]]:
    """中文名与一一对应的英文名。英文与中文相同或库里没有的写空串。

    机制、来源、枪型、职业、组合不收：副本名（最后一愿）与机制名（恢复）
    不是一件装备，收进去首页搜拼音或英文会把首领页、机制页一并带上。
    原文与 resolve.norm 之后各收一次，站内消歧括注与排版空格在客户端剥掉后
    仍能对上。
    """
    global _CATALOG
    if _CATALOG is not None:
        return _CATALOG
    facts = Facts()
    seen: set[str] = set()
    en_of: dict[str, str] = {}

    def add(rec: dict) -> None:
        zh = text(rec)
        if not zh:
            return
        seen.add(zh)
        folded = norm(zh)
        if folded:
            seen.add(folded)
        en = text(rec, lang=EN)
        if en and en != zh:
            en_of.setdefault(zh, en)
            if folded:
                en_of.setdefault(folded, en)

    for rec in facts.items.values():
        add(rec)
    for rec in facts.sets.values():
        add(rec)
    for rec in facts.minted.values():
        if rec.get('kind') == '模组族':
            add(rec)
    names = sorted(seen)
    _CATALOG = (names, [en_of.get(n, '') for n in names])
    return _CATALOG


def item_names() -> list[str]:
    """资料库物品、套装、护甲模组族的中文名。"""
    return item_catalog()[0]


def build() -> str:
    """词典 + 中文白名单 + 英文名（与白名单同序）+ 匹配函数。"""
    names, ens = item_catalog()
    table = load()
    used = used_chars(names)
    missing = [ch for ch in used if ch not in table]
    if missing:
        markup.die('拼音表缺这些字：%s。跑 python3 tools/pinyin.py --distill'
                   % ''.join(missing))
    data = {ch: table[ch] for ch in used}
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    items = json.dumps(names, ensure_ascii=False, separators=(',', ':'))
    english = json.dumps(ens, ensure_ascii=False, separators=(',', ':'))
    with open(MATCH_JS, encoding='utf-8') as f:
        match = f.read()
    if not match.startswith('/*'):
        markup.die('tools/pinyin-match.js 形状不对')
    return (
        'window.starsidePinyin = %s;\n'
        'window.starsidePyItems = %s;\n'
        'window.starsidePyEn = %s;\n%s' % (blob, items, english, match)
    )


def emit(dest: str = OUT) -> str:
    body = build()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(body)
    return body


def distill() -> None:
    """从 pinyin-data 蒸一份无声调、带 ü→v/u/yu 的全表。要联网。"""
    raw = subprocess.check_output(
        ['gh', 'api', 'repos/mozillazg/pinyin-data/contents/pinyin.txt',
         '--jq', '.content'],
        text=True)
    src = base64.b64decode(''.join(raw.split())).decode('utf-8')
    table: dict[str, str] = {}
    for line in src.splitlines():
        if not line or line.startswith('#'):
            continue
        m = PINYIN_LINE.match(line)
        if not m:
            continue
        cp = int(m.group(1), 16)
        if not (0x4E00 <= cp <= 0x9FFF):
            continue
        ch = chr(cp)
        pys: list[str] = []
        seen: set[str] = set()
        for p in m.group(2).split(','):
            p = p.translate(TONES)
            p = re.sub(r'[^a-zA-ZüÜvV]', '', p).lower().replace('ü', 'v')
            alts = [p]
            if 'v' in p:
                alts.append(p.replace('v', 'u'))
                alts.append(p.replace('v', 'yu'))
            for a in alts:
                if a and a not in seen:
                    seen.add(a)
                    pys.append(a)
        if pys:
            table[ch] = ','.join(pys)
    if len(table) < 10000:
        markup.die('拼音全表只有 %d 个字，蒸馏失败' % len(table))
    with open(TABLE, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    print('tools/pinyin.json —— %d 个字，%.1f KB' % (len(table), os.path.getsize(TABLE) / 1024))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    ap.add_argument('--distill', action='store_true',
                    help='从 pinyin-data 重蒸 tools/pinyin.json（要联网）')
    args = ap.parse_args()
    if args.distill:
        distill()
        return 0
    names, ens = item_catalog()
    body = emit()
    print('assets/pinyin.js —— %.1f KB，%d 个物品名 %d 个汉字 %d 个英文名'
          % (len(body.encode()) / 1024, len(names), len(used_chars(names)),
             sum(1 for e in ens if e)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
