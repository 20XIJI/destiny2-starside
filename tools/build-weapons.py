#!/usr/bin/env python3
"""武器库：一把枪一页，事实层与人写层按同一个主键合在一起。

站内关于一把枪的信息从前散在六七页上——购物清单写评级与推荐 Perk，刷取清单写
另一套评级与评语，异域武器详解写机制，manifest 给出词条池与数值。这一页不新写
任何数据，它按主键把那几处**合起来显示**：改源稿这一页跟着变，它不是第七处真相。

    data/facts/          manifest 蒸馏：名字、类型、元素、数值、词条池、图标
    references/items/    人写层：每位作者各占一块，各写各的列
    data/icons.json      主键 → 官方图文件名

产出两份：weapons/data.js 是投影，weapons/index.html 只有外壳与一个空容器，
交互在手写的 weapons/app.js 里。

用法：
    python3 tools/build-weapons.py
"""

import json
import os
import re
import sys

import icons
import shell

OUT_DIR = os.path.join(shell.ROOT, 'weapons')
ITEM_DIR = os.path.join(shell.ROOT, 'references', 'items')

PAGE_TITLE = '武器库'
PAGE_DESC = ('Destiny 2 武器库——按名字查一把枪，一页看全它的词条池、数值、'
             '评级与推荐配搭，Aegis 与小棒猪两份口径并列显示。')

# 元素由 manifest 的 defaultDamageType 给，是个枚举。名字与着色 token 站内已有
# 定义（assets/site.css 的 :root），这里只把枚举号翻成那个 token。
ELEMENT = {1: ('动能', 'el-kinetic'), 2: ('电弧', 'el-arc'), 3: ('烈日', 'el-solar'),
           4: ('虚空', 'el-void'), 6: ('冰影', 'el-stasis'), 7: ('缚丝', 'el-strand')}

# 勇士克制同样是枚举，名字取自 DestinyBreakerTypeDefinition。
BREAKER = {1: '贯穿护盾', 2: '干扰', 3: '眩晕'}

# 作者标签 → 显示名与主页。归属的真相是 references/docs/sources.md 那两张表，
# 这里只存展示用的那一行；改了那边要跟着改这里，闸门在 entities.AUTHORS 上。
AUTHORS = {
    'aegis': ('Aegis · Endgame Analysis',
              'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY'),
    'lgpig': ('小棒猪-LGpig · 刷取清单', 'https://space.bilibili.com/169548478'),
    'compendium': ('Destiny Data Compendium',
                   'https://docs.google.com/spreadsheets/u/0/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4'),
}

# 词条栏在 manifest 里的机器名 → 中文。少一个就按机器名原样显示，不中止：
# 换一批武器进来时多出一个栏名是常事，不该卡住整页。
COLUMN = {
    'intrinsics': '固有', 'frames': '特性', 'origins': '起源特性',
    'barrels': '枪管', 'magazines': '弹匣', 'magazines_gl': '弹匣',
    'tubes': '发射管', 'scopes': '瞄准镜', 'batteries': '电池',
    'blades': '刀锋', 'guards': '刀剑格', 'bowstrings': '弓弦',
    'arrows': '箭矢', 'hafts': '把手', 'stocks': '枪托', 'grips': '握把',
    'rails': '导轨', 'bolts': '弩弦',
}


def records():
    """人写层：{主键: 记录}，几卷合起来。"""
    out = {}
    for name in sorted(os.listdir(ITEM_DIR)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(ITEM_DIR, name), encoding='utf-8') as f:
            out.update(json.load(f))
    return out


# 作者那一行里对这一页没用的列：图标由主键定，这一页用的是共享图库那一张；
# 行标题那一格是主键本身。留着只是让投影白大一圈。
SKIP_COL = frozenset({'图标'})


def payload(facts, recs, table):
    """投影分两层。

    **首屏只要挑枪要用的那几样**：名字、类型、元素、图标、两家的评级——906 把
    合起来约 20 KB gzip。词条池、数值、注解按枪各存一份，点到哪把取哪份。
    全塞进一份要 365 KB gzip，而读者一次只看一把。

    每把枪那一份自带它用到的词条名与图标，不引全局字典：一份一两 KB，省下的
    那点重复不值得让详情依赖另一次请求。
    """
    plugs, plug_at, stats, stat_at = [], {}, [], {}

    def plug_of(h):
        h = str(h)
        if h not in plug_at:
            row = facts.items.get(h) or {}
            path = icons.icon_of(facts, h)
            got = table.get(path or '')
            plug_at[h] = len(plugs)
            plugs.append([row.get('n', {}).get('zh', h),
                          got['file'] if got else '',
                          (row.get('desc') or {}).get('zh', '')])
        return plug_at[h]

    def stat_of(h):
        if h not in stat_at:
            stat_at[h] = len(stats)
            stats.append((facts.stats.get(h) or {}).get('n', {}).get('zh', h))
        return stat_at[h]

    out, detail, used = [], {}, {}
    for key in sorted(recs, key=int):
        row = facts.items.get(key)
        if not row or row.get('ty') != 3:
            continue
        cols = []
        for col in facts.pools.get(key) or ():
            seen = []
            for p in list(col.get('plugs') or ()) + ([col['init']] if col.get('init') else []):
                at = plug_of(p)
                if at not in seen:
                    seen.append(at)
            if seen:
                cols.append([COLUMN.get(col['kind'], col['kind']), seen])
        path = icons.icon_of(facts, key)
        got = table.get(path or '')
        by = {who: {col: strip(val) for col, val in block.items()
                    if col not in SKIP_COL and strip(val)}
              for who, block in (recs[key].get('来自') or {}).items()}
        out.append({
            'h': key,
            'n': row['n']['zh'],
            'en': row['n'].get('en', ''),
            't': (row.get('t') or {}).get('zh', ''),
            'el': ELEMENT.get(row.get('dmg') or 0, ('', ''))[0],
            'tk': ELEMENT.get(row.get('dmg') or 0, ('', ''))[1],
            'tier': row.get('tier'),
            'ico': got['file'] if got else '',
            'br': BREAKER.get(row.get('breaker') or 0, ''),
            # 评级进索引：左栏要按它排、要显示它，为这一列再取一次详情不值当。
            'r': {who: b['评级'] for who, b in by.items() if b.get('评级')},
        })
        detail[key] = {
            'src': (row.get('src') or {}).get('zh', ''),
            'fl': (row.get('flavor') or {}).get('zh', ''),
            'st': [[stat_of(sh), val] for sh, val in row.get('stats') or ()],
            'c': cols,
            'by': by,
            'p': None,      # 收尾时填这把枪用到的那几条
        }
        used[key] = cols
    for key, cols in used.items():
        want = sorted({i for _, col in cols for i in col})
        at = {i: n for n, i in enumerate(want)}
        detail[key]['p'] = [plugs[i] for i in want]
        detail[key]['c'] = [[name, [at[i] for i in col]] for name, col in cols]
    return {'a': AUTHORS, 's': stats, 'w': out}, detail


IMG_MARK = re.compile(r'!\[\]\([^)]*\)')


def strip(text):
    """作者写的那一格 → 这一页要显示的字。

    源稿里的 {token|文字} 是着色标记、\\\\ 是格内换行，两样都留给渲染那一侧处理；
    图片标记在这里就去掉：勇士那一格写的是一枚图标，这一页画不了它，留着只是
    让投影里多出一串路径。"""
    return IMG_MARK.sub('', text).strip()


def stamp():
    """本页的更新时间：它汇总的那几页里最新的那个。

    这一页没有自己的源稿，写死一个日期就会与它显示的内容脱节；取 max 则是
    「这一页显示的东西里最新的一份是什么时候改的」，正是读者要的那个意思。
    """
    import entities
    days = []
    for page in entities.AUTHORS:
        path = os.path.join(shell.ROOT, 'references', 'docs', page + '.md')
        with open(path, encoding='utf-8') as f:
            for line in f:
                if line.startswith('更新：'):
                    days.append(line[len('更新：'):].strip())
                    break
    return max(days, key=lambda d: [int(x) for x in d.split('.')])


def render(n_weapon):
    o = [shell.head(PAGE_TITLE, PAGE_DESC, app_js=False),
         shell.nav('武器库'),
         # 两份脚本都 defer：data.js 是投影，app.js 只读它，顺序即依赖。
         # 不放进 shell.head()——那一段是全站逐字一致的外壳，页面专属的东西
         # 进去就等于给每一页都开一个口子。
         '<script defer src="data.js"></script>',
         '<script defer src="app.js"></script>',
         shell.page_head(PAGE_TITLE, PAGE_DESC),
         '<main class="wpn">',
         # 整页只有一个分节：内容由 app.js 按选中的那把枪现画，落地锚点是
         # #<主键>，不是分节。全站搜索要求每一页至少有一个带 id 的分节
         # （链过去得落得到位置），这一个就是它。
         '<section id="find">',
         '<h2 class="sect-label">按名字挑一把枪</h2>',
         '<form class="wpn-find" role="search" onsubmit="return false">',
         '<input id="q" type="search" autocomplete="off" spellcheck="false"'
         ' placeholder="按名字找一把枪" aria-label="按名字找一把枪">',
         '</form>',
         '<div class="wpn-body">',
         '<div class="wpn-aside">',
         '<p id="count" class="wpn-count"></p>',
         '<ol id="hits" class="wpn-hits"></ol>',
         '</div>',
         '<article id="one" class="wpn-one"></article>',
         '</div>',
         # 悬停说明用一个浮层反复画，不给每枚图标各挂一个：一把枪的词条矩阵
         # 有上百格。hidden 由 app.js 开合，无 JS 时它一直是隐藏的。
         '<div id="tip" class="wpn-tip" role="tooltip" hidden></div>',
         '</section>',
         '</main>', '',
         shell.foot(stamp(), '两位作者的口径并列显示，不合并；共 %d 把。' % n_weapon,
                    source='本页不另立数据：词条池与数值来自 Bungie 的 manifest，'
                           '评级、推荐与评语来自各自作者那一份。')]
    return '\n'.join(o) + '\n'


def main():
    sys.path.insert(0, os.path.join(shell.ROOT, 'tools'))
    import resolve
    facts = resolve.Facts()
    recs = records()
    data, detail = payload(facts, recs, icons.load())
    os.makedirs(os.path.join(OUT_DIR, 'w'), exist_ok=True)
    body = 'window.WPN=%s;\n' % json.dumps(data, ensure_ascii=False,
                                           separators=(',', ':'), sort_keys=True)
    with open(os.path.join(OUT_DIR, 'data.js'), 'w', encoding='utf-8') as f:
        f.write(body)
    total = 0
    for key, one in detail.items():
        text = json.dumps(one, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        total += len(text.encode())
        with open(os.path.join(OUT_DIR, 'w', key + '.json'), 'w', encoding='utf-8') as f:
            f.write(text)
    print('weapons/data.js —— %.1f KB，武器 %d、属性 %d；'
          'weapons/w/ %d 份，合计 %.1f KB，每份平均 %.1f KB'
          % (len(body.encode()) / 1024, len(data['w']), len(data['s']),
             len(detail), total / 1024, total / 1024 / max(1, len(detail))))
    shell.emit(OUT_DIR, render(len(data['w'])), '武器 %d' % len(data['w']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
