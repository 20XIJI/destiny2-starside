#!/usr/bin/env python3
"""本地审核台：审配装投稿，改源稿，攒够一批再构建。

    python3 tools/review.py          # 起在 127.0.0.1:3100，浏览器打开

投稿由 builds/new/ 的「投稿」按钮发到 CloudBase 的 subs 集合，这个页面把它们
列出来。**审核在本地做**：站点是纯静态、页面由生成器产出，通过之后仍然要跑一遍
构建再部署——在线面板改不了这一点。

版面与站内同形：列表是配装索引页那套 `.entry` 卡片，点进去是一页详情，源稿在
一个 textarea 里就地改。**样式表直接引仓库里的那两份**（`assets/site.css` 与
`builds/style.css`），本页只补几条卡片状态旗与编辑器的规则——审核台再写一套配色
就是把 design.md 抄第二遍。所以这个服务还兼一个只读的静态文件路由。

五个动作各管一件事：

    通过   把（改过的）源稿写进 references/builds/<赛季>/<slug>.md，库里标 ok=1
    驳回   库里标 ok=-1，源稿不落盘
    撤回   删掉源稿，退回待审
    保存   改写一份已经在站上的配装源稿
    构建   跑一次 npm run build，把这一批一起建出来，跟着提交一次

**通过与构建分开**：一次审一批，每通过一份就重跑一遍全站构建是白等。所以源稿
建不出页面这件事要到按构建时才暴露；报错里带着 slug，回列表把那一条撤回，或者
就地改完再构建一次。

**投稿与站上的源稿都能就地改**：填表页管不住推荐人写什么，注解里的错字、跑偏的
描述在这里改完再通过。改的是 markdown 源稿本身，与手写一份的结果没有区别。

「等待构建」的判据现取，不另存一份状态：库里标了 ok=1，而
builds/<赛季号>/<slug>/index.html 还不在。

没有 JS：全部是表单 POST + 302。库里那几条走后端那支云函数的审核动作，凭据在 .env.local 的 ADMIN_TOKEN。
"""

import html
import http.server
import importlib.util
import json
import mimetypes
import os
import random
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser

import shell
from markup import must, uncolor

ROOT = shell.ROOT
SRC_DIR = os.path.join(ROOT, 'references', 'builds')
OUT_DIR = os.path.join(ROOT, 'builds')
PORT = 3100
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]*$')
# 职业 → slug 尾巴那一截。默认 slug 只要能落盘、能一眼看出是哪个职业就够，
# 起名是人的事，所以写成「数字-职业」：补不补名字都读得出来。
LATIN = {'猎人': 'hunter', '泰坦': 'titan', '术士': 'warlock'}



def token():
    """审核台的凭据，放 .env.local（已 gitignore），与云函数的 ADMIN_TOKEN 同一个。"""
    path = os.path.join(ROOT, '.env.local')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                if line.startswith('ADMIN_TOKEN='):
                    return line.split('=', 1)[1].strip()
    raise RuntimeError('.env.local 里没有 ADMIN_TOKEN，审核台读不到待审队列')


def api(action, **kw):
    """打后端那支云函数。

    **不走 tcb CLI**：那条路每次要起一个 Node 进程，实测一次 5.9 秒，刷一下列表
    就是干等；同一件事直接打 HTTP 是 0.37 秒。
    """
    req = urllib.request.Request(
        shell.API,
        data=json.dumps(dict(kw, a=action, k=token()), ensure_ascii=False).encode(),
        headers={'content-type': 'application/json'})
    out = json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
    if isinstance(out, dict) and out.get('error'):
        raise RuntimeError('后端拒了 %s：%s' % (action, out['error']))
    return out


def all_subs():
    """**一次请求取回全部**，再在这边分档。投稿是几十条的量级，内存里筛不花什么。"""
    out = api('list')['subs']
    for d in out:
        d['ok'] = int(d.get('ok') or 0)
    out.sort(key=lambda d: d.get('at', ''), reverse=True)
    return out


def rows(ok, subs=None):
    """某一档的投稿，新的在前。"""
    return [d for d in (subs if subs is not None else all_subs()) if d['ok'] == ok]


def mark(sub_id, ok, **more):
    api('mark', id=sub_id, ok=ok, **more)


def one_sub(sub_id, subs=None):
    for d in (subs if subs is not None else all_subs()):
        if d['_id'] == sub_id:
            return d
    return None


# ── 源稿 ──────────────────────────────────────────────────────────────

def seasons():
    """references/builds/ 下的赛季目录，与 convert-build.py 认的是同一批。"""
    out = [n for n in sorted(os.listdir(SRC_DIR))
           if os.path.isdir(os.path.join(SRC_DIR, n)) and re.match(r'^s\d+-', n)]
    if not out:
        raise RuntimeError('references/builds/ 下没有赛季目录')
    return out


def src_of(season, slug):
    """源稿路径。两截都现验——它们从表单来，直接拼路径就能被写出仓库。"""
    if season not in seasons() or not SLUG.match(slug or ''):
        return None
    return os.path.join(SRC_DIR, season, slug + '.md')


def default_slug(md, season):
    """给一条待审投稿配一个能直接落盘的 slug：`四位随机数-职业`。

    审的人多数时候不想在这一格上停下来想名字，而这一格是 required，空着过不了。
    撞上已有的那一份就换一个数——slug 即文件名，重了会把上一份盖掉。
    """
    hit = re.search(r'^职业：(.+?)\s*$', md, re.M)
    tail = LATIN.get(hit.group(1).strip() if hit else '', 'build')
    for _ in range(20):
        slug = '%d-%s' % (random.randrange(1000, 10000), tail)
        path = src_of(season, slug)
        if not path or not os.path.exists(path):
            return slug
    return ''


def page_of(season, slug):
    return os.path.join(OUT_DIR, season.split('-')[0], slug, 'index.html')


def waiting(subs=None):
    """通过了、还没建出页面的那几条。"""
    return [d for d in rows(1, subs)
            if d.get('slug') and not os.path.exists(page_of(d.get('season', ''), d['slug']))]


def onsite():
    """站上已有的配装源稿，(赛季, slug, 正文) 一串。"""
    out = []
    for season in seasons():
        for name in sorted(os.listdir(os.path.join(SRC_DIR, season))):
            if not name.endswith('.md'):
                continue
            with open(os.path.join(SRC_DIR, season, name), encoding='utf-8') as f:
                out.append((season, name[:-3], f.read()))
    return out


def field(md, key):
    """源稿头部的「键：值」，取不到给空串。卡片上的名字、描述、推荐人都从这里读。"""
    m = re.search(r'^%s：(.*)$' % re.escape(key), md, re.M)
    return m.group(1).strip() if m else ''


def title_of(md):
    first = md.split('\n')[0]
    return first[2:].strip() if first.startswith('# ') else '（没写配装名）'


def put(path, md):
    """落盘。表单里的换行是 CRLF，源稿一律 LF。"""
    md = md.replace('\r\n', '\n')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(md if md.endswith('\n') else md + '\n')


# ── 真渲染 ────────────────────────────────────────────────────────────

_CB = None
_IDX = None


def cb():
    """convert-build.py 那个模块。文件名带连字符，import 不到，按路径加载。"""
    global _CB
    if _CB is None:
        spec = importlib.util.spec_from_file_location(
            'convert_build', os.path.join(ROOT, 'tools', 'convert-build.py'))
        if spec is None or spec.loader is None:
            raise RuntimeError('加载不了 tools/convert-build.py')
        _CB = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_CB)
    return _CB


def index():
    """配装词表。扫一遍全站产出，几秒，所以只建一次；构建之后作废重建。"""
    global _IDX
    if _IDX is None:
        _IDX = cb().vocab.build()
    return _IDX


def name_of(season):
    return season.split('-', 1)[1] if '-' in season else season


def default_season():
    """待审的稿还没定赛季，预览按当前赛季那个目录渲染——铭牌上那半行要用它。"""
    here = [x for x in seasons() if x.startswith(shell.SEASON + '-')]
    return here[0] if here else seasons()[0]


def preview(md, season, slug):
    """把源稿渲染成真正的配装页，取 <main> 那一段。

    **审核台看的就是站上那一版**——同一个 render()，不另写一套预览，两套版面
    改一处得改两遍。渲染不过就把中止那句话带回去：那是构建会报的同一句，
    在这里就看得见，不必等按了构建才知道。
    """
    m = cb()
    try:
        out, _ = m.render(index(), m.extra('移动'), m.extra('神器本体'),
                          md, slug, season.split('-')[0], name_of(season))
    except SystemExit as e:
        return None, str(e)
    except Exception as e:                       # noqa: BLE001 —— 什么都不该吞
        return None, '%s: %s' % (type(e).__name__, e)
    open_at = out.index('<main')
    body = out[out.index('>', open_at) + 1:out.index('</main>')]
    cls = must(re.search(r'class="([^"]*)"', out[open_at:out.index('>', open_at)]),
               '产出的 <main> 上没有分支类').group(1)
    # 产出里的资源前缀是配装页那三层，审核台的地址只有一层，改成站点根。
    # 页头右上那两枚按钮要摘掉：它们的脚本在 </main> 外面，搬进来就是两枚按不动的钮。
    body = body.replace('../../../', '/')
    body = re.sub(r'<div class="head-acts">.*?</div>', '', body, flags=re.S)
    return '<div class="%s">%s</div>' % (cls, body), None


# ── 页面 ──────────────────────────────────────────────────────────────

# 本页只补三样：卡片左格那枚状态旗（站上那套 .entry 的第一格本来放节点图标，
# 这里没有图可放）、源稿编辑器、两枚动作按钮的字色。其余全部来自站点样式表。
STYLE = """
.entry .flag { display: grid; place-items: center; align-self: center;
               width: 64px; height: 64px;
               color: var(--bone-dim); font-family: var(--font-disp); font-size: 12px;
               letter-spacing: .1em; border: 1px solid var(--hair); background: var(--tint-2) }
.entry .flag[data-s="待审"] { color: var(--accent); border-color: var(--accent) }
.entry .flag[data-s="待建"] { color: var(--c-solar); border-color: var(--c-solar) }
/* 驳回理由压在卡底，与站上那张卡的时间与赞数同一个位子。 */
.entries .entry p.why { display: block; min-height: 0; margin-top: auto;
                        color: var(--bone-faint); font-size: 11px; line-height: 1.5 }
textarea.src { display: block; width: 100%; box-sizing: border-box; margin: 0 0 16px;
               padding: 16px; color: var(--bone); font: 12.5px/1.8 var(--font-mono, ui-monospace),
               Menlo, monospace; background: var(--ink-lift); border: 1px solid var(--hair);
               resize: vertical }
.acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
        margin: 0 0 28px; padding: 0 0 20px; border-bottom: 1px solid var(--hair) }
.acts .state { margin-right: auto; color: var(--bone-dim); font-size: 12.5px }
.acts form { display: contents }
.acts a.chip { text-decoration: none }
details.srcbox { margin: 40px 0 0; padding-top: 24px; border-top: 1px solid var(--hair) }
details.srcbox summary { color: var(--bone-dim); font-family: var(--font-disp);
                         font-size: 12px; letter-spacing: .1em; cursor: pointer }
details.srcbox textarea { margin-top: 16px }
.acts .chip, .buildbar .chip { padding: 5px 12px; border: 1px solid var(--hair-lit) }
.acts .chip:hover, .buildbar .chip:hover { border-color: var(--accent) }
.chip.ok { color: var(--c-strand); border-color: var(--c-strand) }
.chip.no { color: var(--c-solar); border-color: var(--c-solar) }
.buildbar { display: flex; gap: 10px; align-items: center }
.gate { margin: 0 0 24px; padding: 16px 20px; border: 1px solid var(--c-solar) }
.gate pre { overflow: auto; max-height: 60vh; margin: 12px 0 0; padding: 12px;
            font-size: 12px; background: var(--ink-lift); border: 1px solid var(--hair) }
"""


def page(current, body, parent=False):
    """整页。站头、版心与页脚都用站内那套类名，样式表直接引仓库里的两份。"""
    nav = [shell.MARK, '<a class="home" href="/">%s</a>' % shell.SITE_NAME,
           '<span class="sep">/</span>']
    if parent:
        nav += ['<a class="home" href="/">配装审核台</a>', '<span class="sep">/</span>']
    nav.append('<span aria-current="page">%s</span>' % esc(current))
    return '\n'.join([
        '<!doctype html>', '<html lang="zh-CN">', '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>%s · 配装审核台</title>' % esc(current),
        '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
        '<link rel="stylesheet" href="/assets/site.css">',
        '<link rel="stylesheet" href="/builds/style.css">',
        '<style>%s</style>' % STYLE,
        '</head>', '<body>',
        '<div class="site-head"><nav class="site-nav">%s</nav></div>' % ''.join(nav),
        '<main>', body, '</main>',
        '<footer class="site-foot"><p>本地审核台，只在 127.0.0.1:%d 上跑。'
        '通过与保存改的都是 references/builds/ 下的源稿，改完按「构建并提交」才上站。</p>'
        '</footer>' % PORT,
        '</body>', '</html>', ''])


def esc(s):
    return html.escape(str(s))


def build_button():
    return ('<div class="buildbar"><form method="post" action="/build">'
            '<button class="chip" type="submit">构建并提交</button></form></div>')


def card(href, flag, md, note):
    """一张卡。形状与配装索引页那套竖式 .entry 一样，两处不同：左格是状态旗
    （投稿还没渲染出核心图，没有图可放），卡底那一行是这条的出处或驳回理由。

    类别排在标签最前：它是这套配装的第一层身份，与场景、定位不是一档。"""
    tags = [f for f in (field(md, '类别'),) if f]
    tags += [t for t in re.split(r'[、,]', field(md, '场景') + '、' + field(md, '定位')) if t]
    by = re.split(r'\s*\|\s*', field(md, '推荐人'))[0]
    return '\n'.join([
        '<li>', '<a class="entry" href="%s">' % esc(href),
        '<span class="flag" data-s="%s">%s</span>' % (esc(flag), esc(flag)),
        '<h3>%s</h3>' % esc(title_of(md)),
        '<span class="who">%s</span>' % esc(by) if by else '',
        '<p>%s</p>' % esc(uncolor(field(md, '描述')) or '（没写描述）'),
        '<span class="tags">%s</span>'
        % ''.join('<i>%s</i>' % esc(t) for t in tags),
        '<p class="why">%s</p>' % esc(note),
        '</a>', '</li>'])


def listing():
    subs = all_subs()
    todo, hold, live = rows(0, subs), waiting(subs), onsite()
    o = ['<header class="page-head"><div class="head-row">',
         '<h1>配装审核台</h1>', build_button(), '</div>',
         '<p class="page-note">点一张卡进去看源稿。通过只把它写进 references/builds/，'
         '不构建——审完一批再按上面那一枚，一起建出来。</p>',
         '</header>', '']

    o += ['<section class="block">',
          '<h2 class="sect-label">待审 %d</h2>' % len(todo)]
    o.append('<ul class="entries">' if todo else '<p class="page-note">队列是空的。</p>')
    for d in todo:
        o.append(card('/item?id=' + d['_id'], '待审', d['md'], '投于 ' + d.get('at', '')))
    o += (['</ul>'] if todo else []) + ['</section>', '']

    o += ['<section class="block">',
          '<h2 class="sect-label">已通过，等待构建 %d</h2>' % len(hold)]
    o.append('<ul class="entries">' if hold else '<p class="page-note">没有。</p>')
    for d in hold:
        o.append(card('/item?id=' + d['_id'], '待建', d['md'],
                      '%s/%s.md' % (d.get('season', ''), d['slug'])))
    o += (['</ul>'] if hold else []) + ['</section>', '']

    o += ['<section class="block">',
          '<h2 class="sect-label">站上的配装 %d</h2>' % len(live),
          '<ul class="entries">']
    for season, slug, md in live:
        o.append(card('/item?season=%s&slug=%s' % (urllib.parse.quote(season), slug),
                      '在站', md, '%s/%s.md' % (season, slug)))
    o += ['</ul>', '</section>']
    return page('配装审核台', '\n'.join(o))


def editor(name, note, md, hidden, primary, second=None, third=None,
           fields=(), season='', slug='', saved=False, edit_href=''):
    """详情页：上面是照站上那一版渲染出来的配装，下面折着源稿。

    **看的是渲染结果，不是一屏 markdown**——审核要判的是配装本身，纯文本读不出
    哪一格是什么。渲染走的就是生成器那一个 render()，所以这里看到的与构建出来的
    是同一版；渲染不过时把中止那句话摆在这里，不必等按了构建才知道。

    源稿仍然改得动，收在 <details> 里。按钮统统摆在渲染结果上面那一排，
    **靠 form= 属性接上各自的表单**——把 <div> 开在一个表单里、关在另一个外面，
    浏览器会自己拆，拆完按钮就落在表单外，按下去什么也不提交。
    """
    def hid(where):
        return ''.join('<input type="hidden" name="%s" value="%s" form="%s">'
                       % (esc(k), esc(v), where) for k, v in hidden.items())

    shown, bad = preview(md, season or default_season(), slug or 'preview')

    # **不另给一个 <h1>**：下面渲染出来的那一版自带标题，两个标题上下贴着读作
    # 重复。这一排只写状态与动作。
    o = ['<form id="edit" method="post" action="%s">%s</form>' % (esc(primary[0]), hid('edit')),
         '<div class="acts">',
         '<span class="state">%s%s</span>' % (esc(note), '　已保存。' if saved else '')]
    if 'season' in fields:
        o.append('<select name="season" form="edit">%s</select>'
                 % ''.join('<option value="%s">%s</option>' % (esc(x), esc(x))
                           for x in seasons()))
    if 'slug' in fields:
        o.append('<input name="slug" form="edit" size="30" required '
                 'pattern="[a-zA-Z0-9][a-zA-Z0-9-]*" value="%s" '
                 'placeholder="拉丁 slug，如 prismatic-lightsaber">'
                 % esc(slug or default_slug(md, season or default_season())))
    o.append('<button class="chip ok" type="submit" form="edit">%s</button>' % esc(primary[1]))
    for i, act in enumerate([a for a in (second, third) if a]):
        tag = 'alt%d' % i
        o += ['<form id="%s" method="post" action="%s">%s</form>'
              % (tag, esc(act[0]), hid(tag)),
              '<button class="chip no" type="submit" form="%s">%s</button>'
              % (tag, esc(act[1]))]
    if edit_href:
        o.append('<a class="chip" href="%s">用配装工具改</a>' % esc(edit_href))
    o += [build_button(), '</div>']

    if bad:
        o += ['<div class="gate"><p>这份源稿渲染不过，构建也会卡在同一句上。</p>',
              '<pre>%s</pre></div>' % esc(bad)]
    elif shown:
        o.append(shown)

    o += ['<details class="srcbox"><summary>源稿</summary>',
          '<textarea class="src" name="md" form="edit" rows="30" spellcheck="false">%s'
          '</textarea>' % esc(md),
          '<p class="page-note">改完按上面那一枚「%s」落盘。</p>' % esc(primary[1]),
          '</details>']
    return page(name, '\n'.join(o), parent=True)


def item(q):
    """一条投稿或一份站上的源稿。两者共用同一个编辑器，只是按钮不同。"""
    if q.get('id'):
        d = one_sub(q['id'][0])
        if not d:
            return fail('库里没有这条投稿')
        if d['ok'] == 0:
            return editor(title_of(d['md']), '待审，投于 ' + d.get('at', ''), d['md'],
                          {'id': d['_id']}, ('/approve', '通过'), ('/reject', '驳回'),
                          fields=('season', 'slug'), edit_href='/edit?id=' + d['_id'])
        return editor(title_of(d['md']),
                      '已通过，等待构建：%s/%s.md' % (d.get('season', ''), d.get('slug', '')),
                      read_src(d) or d['md'], {'id': d['_id']},
                      ('/save-sub', '保存'), ('/withdraw', '撤回'),
                      season=d.get('season', ''), slug=d.get('slug', ''),
                      edit_href='/edit?id=' + d['_id'])

    season, slug = (q.get('season') or [''])[0], (q.get('slug') or [''])[0]
    path = src_of(season, slug)
    if path is None or not os.path.exists(path):
        return fail('没有 %s/%s.md 这份源稿' % (season, slug))
    with open(path, encoding='utf-8') as f:
        md = f.read()
    return editor(title_of(md), '站上的配装：%s/%s.md' % (season, slug), md,
                  {'season': season, 'slug': slug}, ('/save', '保存'),
                  ('/delete', '删除'), season=season, slug=slug,
                  saved=bool(q.get('saved')),
                  edit_href='/edit?season=%s&slug=%s'
                            % (urllib.parse.quote(season), slug))


def read_src(d):
    path = src_of(d.get('season', ''), d.get('slug', ''))
    if path and os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return f.read()
    return None


def fail(msg, detail=''):
    o = ['<header class="page-head"><h1>没成</h1></header>',
         '<div class="gate"><p>%s</p>' % esc(msg)]
    if detail:
        o.append('<pre>%s</pre>' % esc(detail))
    o += ['<p><a href="/">回列表</a></p></div>']
    return page('没成', '\n'.join(o), parent=True)


# ── 配装工具编辑模式 ──────────────────────────────────────────────────

# 审核台不自己造编辑器：`builds/new/` 那一页已经能「从源稿导入」，也一直在生成
# 源稿。**把它原封端过来**，注入一段脚本灌进这一份稿、换掉底下那排出口即可；
# 两套编辑器会让槽位改一处得改两遍。
#
# <base> 指回 builds/new/，那一页里的相对路径（../vocab.js、form.js、图标）
# 因此与真被访问时解析成同一批地址。
EDIT_JS = """
<script id="review-md" type="application/json">%(md)s</script>
<style>
.rv-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
          margin: 0 0 28px; padding: 0 0 20px; border-bottom: 1px solid var(--hair) }
.rv-bar .state { margin-right: auto; color: var(--bone-dim); font-size: 12.5px }
.rv-bar .chip { padding: 5px 12px; border: 1px solid var(--hair-lit) }
.rv-bar .chip:hover { border-color: var(--accent) }
.rv-bar .go { color: var(--c-strand); border-color: var(--c-strand) }
.rv-bar input, .rv-bar select { padding: 5px 10px; color: var(--bone);
                                background: var(--ink-lift); border: 1px solid var(--hair-lit) }
.rv-bar .warn { color: var(--c-solar); font-size: 12.5px }
</style>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var F = window.starsideForm;
  var main = document.querySelector('main');
  if (!F || !main) return;
  var skip = F.load(JSON.parse(document.getElementById('review-md').textContent));
  document.getElementById('send').hidden = true;   // 投稿口在审核台里没有意义

  var form = document.createElement('form');
  form.method = 'post';
  form.action = '%(action)s';
  form.hidden = true;
  // 隐藏字段按 JSON 传进来再建元素：拼成一串 HTML 塞进 JS 字符串要嵌两层引号，
  // 值里带一个撇号就把整句断在半路。
  var hid = %(hidden)s;
  Object.keys(hid).forEach(function (k) {
    var i = document.createElement('input');
    i.type = 'hidden';
    i.name = k;
    i.value = hid[k];
    form.appendChild(i);
  });
  var box = document.createElement('textarea');
  box.name = 'md';
  form.appendChild(box);
  document.body.appendChild(form);

  // **动作摆在正文顶上，不塞进右下角那个出口盒**：那盒子是竖排固定条，
  // 多两个输入框就撑到三百像素宽，压在配装版面上。
  var bar = document.createElement('div');
  bar.className = 'rv-bar';
  bar.innerHTML = '<span class="state">%(state)s</span>%(fields)s';
  main.insertBefore(bar, main.firstChild);

  var tip = document.createElement('span');
  tip.className = 'warn';
  tip.setAttribute('role', 'status');
  tip.textContent = skip.length
    ? '导入时跳过 ' + skip.length + ' 条：' + skip.join('，')
    : '';

  var go = document.createElement('button');
  go.type = 'button';
  go.className = 'chip go';
  go.textContent = '%(label)s';
  go.addEventListener('click', function () {
    // 大小写都收，转小写在服务端一处做；这里拦住大写只会让人白改一遍。
    // 报的也是规则而不是「先写 slug」——写了不合规的字的人看着那句话会以为自己没写。
    var need = bar.querySelector('[name="slug"]');
    if (need && !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(need.value.trim())) {
      tip.textContent = need.value.trim()
        ? 'slug 只能用字母、数字与连字符，且以字母或数字开头'
        : '先写 slug';
      return;
    }
    box.value = F.read();
    [].forEach.call(bar.querySelectorAll('[data-into]'), function (el) {
      var h = document.createElement('input');
      h.type = 'hidden';
      h.name = el.name;
      h.value = el.value.trim();
      form.appendChild(h);
    });
    form.submit();
  });

  var back = document.createElement('a');
  back.className = 'chip';
  back.href = '%(back)s';
  back.textContent = '回审核台';

  bar.appendChild(go);
  bar.appendChild(back);
  bar.appendChild(tip);
});
</script>
"""


def edit(q, subs=None):
    """把填表页端过来当编辑器：灌进这一份源稿，出口换成审核台的动作。"""
    if q.get('id'):
        d = one_sub(q['id'][0], subs)
        if not d:
            return fail('库里没有这条投稿')
        md = read_src(d) or d['md']
        if d['ok'] == 0:
            cfg = {'action': '/approve', 'label': '通过', 'hidden': {'id': d['_id']},
                   'fields': ('season', 'slug'),
                   'state': '待审，投于 ' + d.get('at', '')}
        else:
            cfg = {'action': '/save-sub', 'label': '保存', 'hidden': {'id': d['_id']},
                   'fields': (),
                   'state': '已通过，等待构建：%s/%s.md'
                            % (d.get('season', ''), d.get('slug', ''))}
        back = '/item?id=' + d['_id']
    else:
        season, slug = (q.get('season') or [''])[0], (q.get('slug') or [''])[0]
        path = src_of(season, slug)
        if path is None or not os.path.exists(path):
            return fail('没有 %s/%s.md 这份源稿' % (season, slug))
        with open(path, encoding='utf-8') as f:
            md = f.read()
        cfg = {'action': '/save', 'label': '保存',
               'hidden': {'season': season, 'slug': slug}, 'fields': (),
               'state': '站上的配装：%s/%s.md' % (season, slug)}
        back = '/item?season=%s&slug=%s' % (urllib.parse.quote(season), slug)

    with open(os.path.join(ROOT, 'builds', 'new', 'index.html'), encoding='utf-8') as f:
        html_src = f.read()

    fields = ''
    if 'season' in cfg['fields']:
        fields += ('<select name=\\"season\\" data-into>%s</select>'
                   % ''.join('<option>%s</option>' % x for x in seasons()))
    if 'slug' in cfg['fields']:
        fields += ('<input name=\\"slug\\" data-into size=\\"26\\" '
                   'placeholder=\\"\u62c9\u4e01 slug\\">')

    inject = EDIT_JS % {
        'md': json.dumps(md, ensure_ascii=False).replace('<', '\\u003c'),
        'action': cfg['action'],
        'label': cfg['label'],
        'back': back,
        'hidden': json.dumps(cfg['hidden'], ensure_ascii=False),
        'fields': fields,
        'state': cfg['state'],
    }
    out = html_src.replace('<head>', '<head>\n<base href="/builds/new/">', 1)
    return out.replace('</body>', inject + '\n</body>', 1)


# ── 动作 ──────────────────────────────────────────────────────────────

def approve(sub_id, season, slug, md):
    path = src_of(season, slug)
    if path is None:
        return fail('赛季要选列表里的那几个，slug 只能是字母、数字与连字符'
                    '（大写自动转小写）；收到的是 %r / %r' % (season, slug))
    if os.path.exists(path):
        return fail('%s/%s.md 已经存在。换一个 slug，或者去改站上那一份。' % (season, slug))
    if not md.startswith('# '):
        return fail('源稿第一行要写成「# 配装名」')
    if not [d for d in rows(0) if d['_id'] == sub_id]:
        return fail('这条投稿已经不在待审队列里了')
    put(path, md)
    mark(sub_id, 1, season=season, slug=slug)
    return None


def save(season, slug, md):
    path = src_of(season, slug)
    if path is None or not os.path.exists(path):
        return fail('没有 %s/%s.md 这份源稿' % (season, slug))
    if not md.startswith('# '):
        return fail('源稿第一行要写成「# 配装名」')
    put(path, md)
    return None


def save_sub(sub_id, md):
    """改一条已通过、还没构建的：落的仍是它那份源稿。"""
    hit = [d for d in rows(1) if d['_id'] == sub_id]
    if not hit:
        return fail('这条不在已通过的那一档里')
    return save(hit[0].get('season', ''), hit[0].get('slug', ''), md)


def confirm_delete(season, slug):
    path = src_of(season, slug)
    if path is None or not os.path.exists(path):
        return fail('没有 %s/%s.md 这份源稿' % (season, slug))
    with open(path, encoding='utf-8') as f:
        name = title_of(f.read())
    o = ['<header class="page-head"><h1>删掉「%s」？</h1></header>' % esc(name),
         '<div class="gate">',
         '<p>删的是源稿 <code>%s/%s.md</code> 与产出目录 '
         '<code>builds/%s/%s/</code>，两样都不进回收站；'
         '库里那条投稿记录留着。索引页与全站搜索要按一次「构建并提交」才会跟着少一条。</p>'
         % (esc(season), esc(slug), esc(season.split('-')[0]), esc(slug)),
         '<div class="acts">',
         '<form method="post" action="/delete">',
         '<input type="hidden" name="season" value="%s">' % esc(season),
         '<input type="hidden" name="slug" value="%s">' % esc(slug),
         '<input type="hidden" name="sure" value="1">',
         '<button class="chip no" type="submit">确定删除</button>',
         '</form>',
         '<a class="chip" href="/item?season=%s&slug=%s">回去</a>'
         % (urllib.parse.quote(season), esc(slug)),
         '</div></div>']
    return page('删除', '\n'.join(o), parent=True)


def delete(season, slug):
    path = src_of(season, slug)
    if path is None or not os.path.exists(path):
        return fail('没有 %s/%s.md 这份源稿' % (season, slug))
    os.remove(path)
    shutil.rmtree(os.path.join(OUT_DIR, season.split('-')[0], slug), ignore_errors=True)
    # 库里那条通过记录跟着标成驳回。留着 ok=1 会让它挂在「等待构建」里指向一份
    # 已经不存在的源稿，点进去改不了也构建不出。
    for d in rows(1):
        if d.get('season') == season and d.get('slug') == slug:
            mark(d['_id'], -1)
    return None


def withdraw(sub_id):
    """把一条已通过的退回待审：删源稿，标回 0。构建报到哪一条就撤哪一条。"""
    hit = [d for d in rows(1) if d['_id'] == sub_id]
    if not hit:
        return fail('这条不在已通过的那一档里')
    path = src_of(hit[0].get('season', ''), hit[0].get('slug', ''))
    if path and os.path.exists(path):
        os.remove(path)
    mark(sub_id, 0)
    return None


def git(*args):
    return subprocess.run(('git',) + args, capture_output=True, text=True, cwd=ROOT)


def commit():
    """构建完就地提交一次。**构建与提交是同一件事**：产出改了却留在工作区，
    下一批建完就分不出哪些改动属于哪一次。

    什么都没变时不提交——空暂存区上 `git commit` 返回 1，那不是错。
    路径带中文，取文件名要用 `-z`：不加它 git 会把路径整条加引号转义，
    前缀判断当场落空。
    """
    git('add', '-A')
    if not git('diff', '--cached', '--quiet').returncode:
        return None
    out = git('diff', '--cached', '--name-only', '--diff-filter=A', '-z').stdout
    new = [os.path.basename(p)[:-3] for p in out.split('\0')
           if p.startswith('references/builds/') and p.endswith('.md')]
    msg = ('收配装 %d 套：%s' % (len(new), '、'.join(new))) if new else '重跑构建'
    r = git('commit', '-m', msg)
    if r.returncode:
        return fail('构建过了，提交没过。改动都在暂存区里，命令行上接着处理。',
                    r.stdout + '\n' + r.stderr)
    return None


def run_build():
    global _IDX
    _IDX = None                      # 产出变了，词表跟着作废，下次预览重扫
    r = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True, cwd=ROOT)
    if r.returncode:
        return fail('构建没过。源稿都还在——按报错里那个 slug 回列表把它撤回，'
                    '或者就地改完再构建一次。', r.stdout + '\n' + r.stderr)
    return commit()


# ── 服务 ──────────────────────────────────────────────────────────────

class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, body, code=200):
        raw = body.encode()
        self.send_response(code)
        self.send_header('content-type', 'text/html; charset=utf-8')
        self.send_header('content-length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def go(self, where='/'):
        self.send_response(302)
        self.send_header('location', where)
        self.send_header('content-length', '0')
        self.end_headers()

    def send_asset(self, rel):
        """仓库里的只读静态文件。**realpath 必须落在 ROOT 之内**——路径从 URL 来。"""
        path = os.path.realpath(os.path.join(ROOT, rel.lstrip('/')))
        if not path.startswith(ROOT + os.sep) or not os.path.isfile(path):
            self.reply(fail('没有这个文件：' + rel), 404)
            return
        with open(path, 'rb') as f:
            raw = f.read()
        self.send_response(200)
        self.send_header('content-type', mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('content-length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if url.path == '/':
            self.reply(listing())
        elif url.path == '/item':
            self.reply(item(q))
        elif url.path == '/edit':
            self.reply(edit(q))
        else:
            # 渲染出来的配装页要引各资料页的 icons/，白名单列不完，
            # 所以放行 ROOT 下的任意只读文件，穿越由 send_asset 的 realpath 挡。
            self.send_asset(url.path)

    def do_POST(self):
        n = int(self.headers.get('content-length') or 0)
        form = urllib.parse.parse_qs(self.rfile.read(n).decode(), keep_blank_values=True)
        f = {k: v[0] for k, v in form.items()}
        sub_id, md = f.get('id', '').strip(), f.get('md', '')
        season = f.get('season', '').strip()
        # slug 就地转小写。它既是 builds/<赛季>/<slug>/ 的目录名，也是点赞 _id 的
        # 后半截（云函数按 /^[a-z0-9]+_[a-z0-9-]+$/ 收，大写进去点赞会被拒），所以
        # 只能是小写；可大小写不是填的人要判断的事，转掉就是了。全部 POST 从这一
        # 行取 slug，转在这里即处处生效。
        slug = f.get('slug', '').strip().lower()
        if self.path == '/build':
            bad = run_build()
        elif self.path == '/delete':
            # 不可逆，所以走两步：第一下出确认页，带着 sure 的那一下才真删。
            if not f.get('sure'):
                self.reply(confirm_delete(season, slug))
                return
            bad = delete(season, slug)
        elif self.path == '/save':
            bad = save(season, slug, md)
            if not bad:
                self.go('/item?season=%s&slug=%s&saved=1'
                        % (urllib.parse.quote(season), slug))
                return
        elif not sub_id:
            self.reply(fail('表单里没有投稿 id'), 400)
            return
        elif self.path == '/reject':
            mark(sub_id, -1)
            bad = None
        elif self.path == '/withdraw':
            bad = withdraw(sub_id)
        elif self.path == '/save-sub':
            bad = save_sub(sub_id, md)
            if not bad:
                self.go('/item?id=' + sub_id)
                return
        elif self.path == '/approve':
            bad = approve(sub_id, season, slug, md)
        else:
            self.reply(fail('没有这个地址'), 404)
            return
        self.reply(bad) if bad else self.go()

    def log_message(self, format, *args):  # noqa: A002 —— 名字由基类定
        sys.stderr.write('%s %s\n' % (self.command, self.path))


def main():
    srv = http.server.HTTPServer(('127.0.0.1', PORT), Handler)
    url = 'http://127.0.0.1:%d/' % PORT
    print('审核台 %s，Ctrl-C 退出' % url)
    webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print()
    return 0


if __name__ == '__main__':
    sys.exit(main())
