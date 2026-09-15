#!/usr/bin/env python3
"""待判清单：把数据层里「只能人判」的那几类做成一份本地自包含的 HTML。

用法：
    python3 tools/pending.py                    # 生成并打开
    python3 tools/pending.py --out <路径.html>   # 落到别处

页面上一条一张卡，矛盾双方连图并排摆着，选完点一次「生成文本」得到一段纯文本，
贴回给做事的那一侧照着改。**这份 HTML 自己不改任何数据**，它只负责让人看清楚。

图直接链 `assets/icons/`——那批 WebP 的文件名就是官方图的名字，从主键的 `icon`
字段换个扩展名即得，不需要任何映射表。链的是绝对路径，本机双击即可看。
"""

import argparse
import collections
import glob
import json
import os
import subprocess
import sys

import resolve
import shell

ICONS = os.path.join(shell.ROOT, 'assets', 'icons')
OUT = os.path.join(os.path.expanduser('~'), 'Desktop', 'docs', '2609',
                   '260915-待判清单.html')


def collect(facts):
    """四类待判项。每一类给出：为什么要判、可选项、以及判完要落到哪。"""
    minted = json.load(open(os.path.join(shell.ROOT, 'references', 'minted.json'),
                            encoding='utf-8'))
    pages = {}
    for p in sorted(glob.glob(os.path.join(shell.ROOT, 'references', 'research', '*.json'))):
        d = json.load(open(p, encoding='utf-8'))
        if 'said' in d:
            pages[os.path.basename(p)[:-5]] = d

    def nm(h):
        return resolve.text(facts.at(h))

    def ty(h):
        return resolve.text(facts.at(h), 'itemTypeAndTierDisplayName')

    def icon(h):
        r = facts.at(h) or {}
        if r.get('icon'):
            return r['icon']
        for b in r.get('setPerks') or ():
            got = (facts.perks.get(str(b['perk'][1])) or {}).get('icon')
            if got:
                return got
        return None

    def rel(h):
        return ((facts.items.get(str(h)) or {}).get('derived') or {}).get('release') or ''

    groups = []

    # ① 同名武器在两页落到两枚主键
    by = collections.defaultdict(list)
    for slug, d in pages.items():
        for h, blocks in d['said'].items():
            row = facts.items.get(h)
            if row and row.get('itemType') == 3:
                by[resolve.text(row)].append((slug, h))
    items = []
    for name, rows in sorted(by.items()):
        keys = sorted({h for _, h in rows})
        if len(keys) < 2:
            continue
        items.append({'label': name, 'options': [
            {'value': h, 'title': nm(h), 'icon': icon(h),
             'lines': ['主键 %s' % h, ty(h), '发布 %s' % (rel(h) or '—'),
                       '在这几页：' + '、'.join(sorted({s for s, hh in rows if hh == h})),
                       (facts.source(h) or '（无来源）')[:52]]}
            for h in keys]})
    groups.append({
        'id': 'dup', 'title': '同一件武器在两页顶着两枚主键',
        'note': 'legendary-* 与 shopping-* 各挑各的版本。选中的那一枚两页统一用。',
        'items': items})

    # ② 几行共用同一串主键，只能靠序位区分
    items = []
    for slug, d in pages.items():
        for h, blocks in d['said'].items():
            if len(blocks) < 2:
                continue
            items.append({'label': '%s · %s' % (slug, nm(h) or h),
                          'shared': {'title': nm(h) or h, 'icon': icon(h),
                                     'lines': ['主键 %s' % h, ty(h),
                                               '覆盖 %d 枚' % (1 + len(blocks[0].get('covers') or []))]},
                          'rows': [b['i18n']['zh-CN'].get('name', '') for b in blocks],
                          'options': [
                              {'value': 'keep', 'title': '保持现状',
                               'lines': ['源稿里第 k 次出现取第 k 块']},
                              {'value': 'split', 'title': '拆成各自的主键',
                               'lines': ['按适用范围把那串主键分开', '分不出的发自发号']},
                              {'value': 'merge', 'title': '合成一行',
                               'lines': ['几条说明并成一块']}]})
    items.sort(key=lambda x: -len(x['rows']))
    groups.append({
        'id': 'seq', 'title': '几行共用同一串主键，只能靠序位区分',
        'note': '「攻击型框架」五行共用同一串 40 枚主键，行名只靠括注分。'
                'manifest 里没有任何一位说这枚插件属于哪种枪。',
        'items': items})

    # ③ covers 里装的不是「同一物的另一个 hash」
    items = []
    for slug, d in pages.items():
        for h, blocks in d['said'].items():
            for b in blocks:
                cov = b.get('covers') or []
                if not cov or not facts.at(h):
                    continue
                names = {nm(x) for x in cov} | {nm(h)}
                tiers = {((facts.items.get(str(x)) or {}).get('inventory') or {}).get('tierType')
                         for x in [h] + cov}
                if len(names) < 2 or tiers == {2, 3}:
                    continue          # 普通版＋强化版是正常的，不必判
                items.append({
                    'label': '%s · %s' % (slug, b['i18n']['zh-CN'].get('name', '')),
                    'members': [{'title': nm(x) or x, 'icon': icon(x),
                                 'lines': ['主键 %s' % x, ty(x),
                                           '行首' if x == h else 'covers']}
                                for x in [h] + cov],
                    'options': [
                        {'value': 'split', 'title': '拆成各自的行',
                         'lines': ['每一枚一行，各自的说明']},
                        {'value': 'keep', 'title': '保持合并',
                         'lines': ['一行盖住一族，说明抄给每一枚']}]})
    groups.append({
        'id': 'cov', 'title': 'covers 里装的不是「同一物的另一个 hash」',
        'note': '有的装了相关物（「射击套件（邪冬的谎言）」把一把传说霰弹枪 cover 进了一条固有 Perk），'
                '有的把几个独立实体并成一行（之灵、永劫系列）。',
        'items': items})

    # ④ 台账里从未被引用的主键
    used = set()
    for d in pages.values():
        for k, blocks in d['said'].items():
            used.add(k)
            for b in blocks:
                used.update(b.get('covers') or [])
    items = [{'label': '%s · %s' % (v['kind'], v['name']),
              'members': [{'title': v['name'], 'icon': icon(h),
                           'lines': ['主键 %s' % h, v['from']]}],
              'options': [{'value': 'keep', 'title': '留着',
                           'lines': ['配装工具要引用职业与来源']},
                          {'value': 'drop', 'title': '删掉',
                           'lines': ['站内没有任何一处指它']}]}
             for h, v in sorted(minted.items(), key=lambda kv: int(kv[0]))
             if h not in used]
    groups.append({
        'id': 'dead', 'title': '台账里从未被引用的主键',
        'note': '三个职业与十一个副本来源发了号，站内一次都没引用到。',
        'items': items})
    return groups


def thumbs(groups):
    """把记录上的官方图名换成本机那张 WebP 的地址。

    `assets/icons/` 里的文件名就是官方图的名字（Bungie 的图名本身是内容哈希），
    所以这一步只是换个扩展名，没有映射表。盘上没有的留空，卡片照画。
    """
    missing = set()

    def walk(node):
        if isinstance(node, dict):
            got = node.get('icon')
            if got:
                name = os.path.splitext(got)[0] + '.webp'
                path = os.path.join(ICONS, name)
                if os.path.exists(path):
                    node['icon'] = 'file://' + path
                else:
                    missing.add(got)
                    node['icon'] = ''
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(groups)
    if missing:
        print('  盘上没有这几张图：%d 张，例 %s' % (len(missing), sorted(missing)[:2]))
    return len(missing)


CSS = """
:root{--bg:#0b0d12;--card:#141821;--line:#232838;--ink:#e8e6e0;--dim:#8b90a0;
--accent:#7fd4e8;--warn:#e8b87f;--ok:#8fd49b}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:14px/1.7 -apple-system,"PingFang SC","Helvetica Neue",sans-serif;padding:0 0 140px}
header{position:sticky;top:0;z-index:9;background:rgba(11,13,18,.96);
border-bottom:1px solid var(--line);padding:18px 28px}
h1{margin:0 0 4px;font-size:19px;letter-spacing:.04em;font-weight:600}
.sub{color:var(--dim);font-size:13px}
main{max-width:1180px;margin:0 auto;padding:0 28px}
section{margin:34px 0}
h2{font-size:15px;letter-spacing:.06em;margin:0 0 6px;font-weight:600}
h2 .n{color:var(--dim);font-weight:400;margin-left:8px}
.note{color:var(--dim);font-size:13px;margin:0 0 16px;max-width:76ch}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
padding:14px 16px;margin:10px 0}
.card.done{border-color:#2f5d43}
.lbl{font-weight:600;margin-bottom:10px}
.rows{color:var(--warn);font-size:13px;margin:-4px 0 10px}
.opts{display:flex;flex-wrap:wrap;gap:10px}
label.opt{display:flex;gap:10px;align-items:flex-start;cursor:pointer;
border:1px solid var(--line);border-radius:8px;padding:10px 12px;min-width:250px;
flex:1 1 250px;background:#0f131b}
label.opt:hover{border-color:#39405a}
label.opt input{margin:3px 0 0}
label.opt.sel{border-color:var(--accent);background:#10202a}
img{width:44px;height:44px;border-radius:6px;background:#1b2130;flex:none}
.t{font-weight:600;margin-bottom:2px}
.l{color:var(--dim);font-size:12px;line-height:1.55}
.members{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px}
.mem{display:flex;gap:9px;align-items:flex-start;border:1px dashed var(--line);
border-radius:8px;padding:8px 10px;min-width:210px}
footer{position:fixed;left:0;right:0;bottom:0;background:rgba(11,13,18,.97);
border-top:1px solid var(--line);padding:12px 28px;display:flex;gap:12px;align-items:center}
button{background:var(--accent);color:#06222b;border:0;border-radius:7px;
padding:9px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
button.ghost{background:#1b2130;color:var(--ink)}
#tally{color:var(--dim);font-size:13px}
textarea{width:100%;height:230px;background:#0f131b;color:var(--ink);
border:1px solid var(--line);border-radius:8px;padding:12px;font:12px/1.6
ui-monospace,Menlo,monospace;margin-top:12px;display:none}
"""

JS = """
const DATA = __DATA__;
const picked = {};
function mark(el, name){
  el.closest('.opts').querySelectorAll('label.opt').forEach(x=>x.classList.remove('sel'));
  el.closest('label.opt').classList.add('sel');
  el.closest('.card').classList.add('done');
  picked[name] = el.value;
  tally();
}
function tally(){
  let n = 0; DATA.forEach(g=>n += g.items.length);
  document.getElementById('tally').textContent = `已选 ${Object.keys(picked).length} / ${n}`;
}
function build(){
  const main = document.querySelector('main');
  DATA.forEach(g=>{
    const s = document.createElement('section');
    s.innerHTML = `<h2>${g.title}<span class="n">${g.items.length} 条</span></h2>
                   <p class="note">${g.note}</p>`;
    g.items.forEach((it, i)=>{
      const key = `${g.id}.${i}`;
      const card = document.createElement('div');
      card.className = 'card';
      let head = `<div class="lbl">${it.label}</div>`;
      if (it.rows) head += `<div class="rows">这几行：${it.rows.join(' ｜ ')}</div>`;
      const box = o => `<div class="mem">${o.icon?`<img src="${o.icon}" alt="">`:''}
        <div><div class="t">${o.title}</div><div class="l">${(o.lines||[]).join('<br>')}</div></div></div>`;
      if (it.shared) head += `<div class="members">${box(it.shared)}</div>`;
      if (it.members) head += `<div class="members">${it.members.map(box).join('')}</div>`;
      const opts = it.options.map(o=>`
        <label class="opt"><input type="radio" name="${key}" value="${o.value}"
          onchange="mark(this,'${key}')">
          ${o.icon?`<img src="${o.icon}" alt="">`:''}
          <div><div class="t">${o.title}</div><div class="l">${(o.lines||[]).join('<br>')}</div></div>
        </label>`).join('');
      card.innerHTML = head + `<div class="opts">${opts}</div>`;
      card.dataset.key = key;
      s.appendChild(card);
    });
    main.appendChild(s);
  });
  tally();
}
function make(){
  const out = [];
  DATA.forEach(g=>{
    const lines = [];
    g.items.forEach((it,i)=>{
      const v = picked[`${g.id}.${i}`];
      if (v === undefined) return;
      const o = it.options.find(x=>String(x.value)===String(v));
      lines.push(`  ${it.label}  →  ${o ? o.title : v}${o && o.value !== o.title ? ` [${o.value}]` : ''}`);
    });
    if (lines.length) out.push(`## ${g.title}（${g.id}，选了 ${lines.length}/${g.items.length}）\\n` + lines.join('\\n'));
  });
  const box = document.getElementById('text');
  box.style.display = 'block';
  box.value = out.length ? out.join('\\n\\n') : '一条都还没选。';
  box.focus(); box.select();
}
function copy(){
  const box = document.getElementById('text');
  if (box.style.display === 'none') make();
  box.select(); document.execCommand('copy');
  const b = document.getElementById('cp'); const t = b.textContent;
  b.textContent = '已复制'; setTimeout(()=>b.textContent = t, 1400);
}
build();
"""


def render(groups, out):
    n = sum(len(g['items']) for g in groups)
    body = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>待判清单 · Starside 数据层</title><style>%s</style></head><body>
<header><h1>待判清单</h1>
<div class="sub">数据层里只能人判的 %d 条。选完点「生成文本」，把那段贴回对话里。</div></header>
<main></main>
<footer><button onclick="make()">生成文本</button>
<button class="ghost" id="cp" onclick="copy()">复制</button>
<span id="tally"></span></footer>
<textarea id="text" spellcheck="false"></textarea>
<script>%s</script></body></html>
""" % (CSS, n, JS.replace('__DATA__', json.dumps(groups, ensure_ascii=False)))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(body)
    return n, os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--no-open', action='store_true')
    a = ap.parse_args()
    facts = resolve.Facts()
    groups = collect(facts)
    for g in groups:
        print('%-6s %-38s %4d 条' % (g['id'], g['title'], len(g['items'])))
    miss = thumbs(groups)
    n, size = render(groups, a.out)
    print('\n%s\n  %d 条待判，%.1f KB，缺图 %d 张' % (a.out, n, size / 1024, miss))
    if not a.no_open:
        subprocess.run(['open', a.out], check=False)


if __name__ == '__main__':
    sys.exit(main())
