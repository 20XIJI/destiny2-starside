"""站点外壳：head 元信息、导航条、页脚。三个生成器共用这一份定义。

外壳曾散在三个生成器 + 手写首页 + 外壳闸门共五处，加一条内容要改五个文件。
收成一份之后，`tools/check_shell.py` 拿这里生成参照去比对手写的 `index.html`，
闸门自己不再是副本。

首页 index.html 保持手写——它的 .entry 卡片与资料页结构不同，为三张卡片再造
一种源稿格式不划算。改了这里的署名或免责声明，首页要跟着改，闸门会提醒。
"""

import os
import re

import markup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOME = 'index.html'
# 两个专属生成器各出一页，其余的从 references/docs/ 现扫——新增一篇资料就不必
# 记得回来改这张表了。
FIXED = [HOME, 'armor-sets/index.html', 'artifact-mods/index.html']
DOC_DIR = os.path.join(ROOT, 'references', 'docs')
BUILD_DIR = os.path.join(ROOT, 'references', 'builds')
# 当前赛季。配装按赛季目录存档，**只有这一季进页面清单**——旧赛季照常生成（外壳
# 因此不与全站分叉），但索引页、全站搜索与外壳闸门都不收，站内点不到；手里已有
# 链接的人仍打得开。换季改这一个字符串。
SEASON = 's29'


def pages():
    """站内页面清单，相对站点根。源稿即清单，不另存一份名单。

    外壳闸门与全站搜索索引都从这里取，两处因此不会各扫各的。
    """
    out = list(FIXED)
    for name in sorted(os.listdir(DOC_DIR)):
        if not name.endswith('.md'):
            continue
        with open(os.path.join(DOC_DIR, name), encoding='utf-8') as f:
            md = f.read()
        where = re.search(r'^路径：(.*)$', md, re.M)
        out.append('%s/index.html' % (where.group(1).strip() if where else name[:-3]))
    # 合集索引页只在真有合集时才出，也只在那时进清单——一个都没有时出一张空
    # 索引不如不出，而清单里挂一个不存在的页面会让外壳闸门当场报错。判据与
    # convert-build.py 的 main() 同一条。
    detail, has_set = [], False
    for season in sorted(os.listdir(BUILD_DIR)):
        if not season.startswith(SEASON + '-'):
            continue
        for name in sorted(os.listdir(os.path.join(BUILD_DIR, season))):
            if not name.endswith('.md'):
                continue
            detail.append('builds/%s/%s/index.html' % (SEASON, name[:-3]))
            with open(os.path.join(BUILD_DIR, season, name), encoding='utf-8') as f:
                if re.search(r'^合集：是$', f.read(), re.M):
                    has_set = True
    out.append('builds/index.html')
    if has_set:
        out.append('builds/sets/index.html')
    out += ['builds/new/index.html', 'builds/new/set/index.html']
    return out + detail

SITE_NAME = 'Starside'
THEME = '#0b0d14'
BILIBILI = 'https://space.bilibili.com/26117485'
COMPENDIUM_URL = ('https://docs.google.com/spreadsheets/u/0/d/'
                  '1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4')

# 数据源那一段：出处 + 二次加工声明。**声明只有这一处定义**——同一个数据源在
# 不同页面换着说法写，读者会以为是不同来源。各页只给出处，句子由这里拼。
SOURCE_TAIL = '。本页在其基础上统一了术语、标点与排版。'


def source_note(html):
    """数据源一段。html 是出处本身，链接与限定语由调用方给。"""
    return '<p>数据源：%s%s</p>' % (html, SOURCE_TAIL)


COMPENDIUM_SRC = ('<a href="%s" target="_blank" rel="noopener">'
                  'Destiny Data Compendium</a>' % COMPENDIUM_URL)
COMPENDIUM = source_note(COMPENDIUM_SRC)

CREDIT = ('<p>© 2026 日栎w · <a href="%s" target="_blank" rel="noopener">'
          '哔哩哔哩</a></p>' % BILIBILI)

LEGAL = ('<p class="legal">Starside 为非官方资料站，与 Bungie, Inc. 无从属关系。'
         'Destiny 2 及相关名称、标识为 Bungie, Inc. 的商标。</p>')

# 备案号。每一页都要挂，且必须链到工信部的查询页——这是备案要求，不是版式选择。
ICP = ('<p class="legal"><a href="https://beian.miit.gov.cn/" '
       'target="_blank" rel="noopener">鲁ICP备2026052166号-1</a></p>')

# 站内导航预取：悬停即取，页面本身十几 KB，切换基本无感。不支持的浏览器忽略。
SPEC = ('<script type="speculationrules">'
        '{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}'
        '</script>')

# 站点唯一的后端：functions/api/，HTTP 访问服务。访问计数、点赞、配装投稿都走它。
API = 'https://dea-mods-d1g0j2rile2323f73.service.tcloudbase.com/api'

# 访问计数：**同一个浏览器每天只算一次**，记的因此是访客数不是页面加载数。
# 计费按数据库调用次数算，而这一路是写、挡不进缓存，唯一能压的就是发的次数：
# 一天一次，调用数与访客数持平，翻多少页都不再涨。窗口写在 localStorage 的一个
# 定长键上（svd 存天），不一天一个键，那样一年攒 365 个。localStorage 不可用时
# 去不了重，那台机器每次加载都算一次。
# 落在计数窗口外、页面又没有 <span id="sv"> 时一个请求都不发。
# 页面级热度看托管控制台的 URL 排行，不自己存。
HIT = ('<script>(function(){'
       'var d=new Date(Date.now()+288e5).toISOString().slice(0,10);'
       'var o=document.getElementById("sv"),f=1;'
       'try{f=localStorage.getItem("svd")===d?0:1;if(f)localStorage.setItem("svd",d)}catch(_){}'
       # 首页那句数字在窗口内直接用上一次的：不加这一层，刷十次首页就是十次冷启动。
       # svt 只在 svd===d 时读得到，天然按天作废，不必另存时间戳。
       'if(!f){if(!o)return;'
       'try{var c=localStorage.getItem("svt");if(c){o.textContent=c;return}}catch(_){}}'
       'var r=f?fetch("%s",{method:"POST",headers:{"content-type":"application/json"},'
       'body:JSON.stringify({a:"hit",s:o?1:0})}):fetch("%s?a=stats");'
       'r.then(function(x){return x.json()})'
       '.then(function(s){if(o){var t="今日 "+s.today+" 位访客 · 累计 "+s.total;'
       'o.textContent=t;try{localStorage.setItem("svt",t)}catch(_){}}},'
       'function(x){if(o)o.textContent="访问统计取不到："+x})})()</script>' % (API, API))


# 就地编辑的引子：**有令牌、且这一页反查得回源稿，才把编辑台那份脚本拉进来**。
# 与 HIT 分成两段——那个 IIFE 里有 early return，接在它后面会被跳过。
# 相对前缀从 site.css 那个 <link> 上现取：每页都有它（check_shell 钉着），而页面
# 深浅不一，写死 ../ 会在 elements/arc/ 这种两层的页面上指错；站内绝对路径又会在
# file:// 下指到磁盘根目录。
#
# **判据要连 main[data-src] 一起看。**只看令牌的话，填表页、索引页与首页也会各下
# 一份 edit.js，而它们没有 data-src，edit.js 进去第一件事就是 return。编辑台把填表页
# 当 iframe 载进来，那 20 KB 因此每换一条配装白下一次。
#
# 戴 data-src 的是资料页与配装详情页两支，各走一条路，由 <main> 上的 data-kind 分：
# 资料页逐格改（有 data-b 可反查源稿），配装页整篇替换（没有 data-b，走填表页）。
EDIT = ('<script>try{if(localStorage.sa_at&&document.querySelector("main[data-src]")){'
        'var l=document.querySelector(\'link[href$="assets/site.css"]\');'
        'if(l)import(l.href.replace("assets/site.css","admin/edit.js"))'
        '}}catch(_){}</script>')


# 正式域名。测试域名与它服务的是同一个桶，收藏了测试域名的人不会自己发现换了家。
SITE_URL = 'https://starside.work'

# 劝返：只在腾讯云那两个默认域名上建节点（webapps.tcloudbase.com 与
# tcloudbaseapp.com），正式域名、localhost 与 file://（hostname 为空）一个节点都不建，
# 本地预览与截图照旧。判据是主机名后缀，不是等于某个字符串——将来再多一个默认域名
# 也照样命中。
#
# **不记住「仍要留在这里」。**记住了就只拦一次，收藏不会改；每次加载重新拦，
# 到读者改收藏为止。标题前缀让收藏夹里那一条自带「测试地址」四个字。
#
# 常驻条固定在底部：顶部那条 .site-head 是 sticky 的，压在它上面要连着改 --stick
# 与 app.js 里 IntersectionObserver 的 rootMargin。
#
# 样式内联，不进 site.css——那份每页都下，且算进 check_shell 的外壳预算，
# 为一段绝大多数访客看不到的东西占预算不划算；色号仍引 :root 的 token。
# href 用属性赋值、文字用文本节点，不拼 innerHTML：路径来自 location，
# 拼字符串等于把地址栏接进 HTML。
NOTICE = ('<script>(function(){'
          'if(!/\\.tcloudbase(app)?\\.com$/.test(location.hostname))return;'
          'var u="%s"+location.pathname+location.search+location.hash;'
          'document.title="【测试地址】"+document.title;'
          'function link(t,big){var a=document.createElement("a");a.href=u;'
          'a.textContent=t;a.style.cssText=big?'
          '"padding:.7em 1.6em;border:1px solid var(--accent);border-radius:2px;'
          'color:var(--accent);text-decoration:none;font-size:16px":'
          '"color:var(--accent);white-space:nowrap";return a}'
          'var bar=document.createElement("div");'
          'bar.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:99;'
          'display:flex;flex-wrap:wrap;gap:.2em 1em;align-items:center;'
          'justify-content:center;padding:.55em 1em;'
          'background-color:var(--ink-lift);border-top:1px solid var(--hair-lit);'
          'color:var(--bone);font:13px/1.7 var(--font-cn)";'
          'bar.append("这是测试地址，站点已经搬到 starside.work ",link("立即换过去"));'
          'var box=document.createElement("div");'
          'box.style.cssText="position:fixed;inset:0;z-index:999;display:flex;'
          'flex-direction:column;gap:1.4em;align-items:center;justify-content:center;'
          'padding:2em;text-align:center;background-color:var(--ink);'
          'color:var(--bone);font:15px/1.9 var(--font-cn)";'
          'var say=document.createElement("p");'
          'say.textContent="你打开的是测试地址。站点的正式地址是 starside.work，'
          '请改用它并更新收藏。";'
          'say.style.cssText="margin:0;max-width:32em";'
          'var stay=document.createElement("button");'
          'stay.type="button";stay.disabled=true;'
          'stay.style.cssText="background:none;border:0;color:var(--bone-faint);'
          'font:13px/1.7 var(--font-cn);cursor:pointer";'
          'var n=5;stay.textContent="仍要留在测试地址（"+n+"）";'
          'var t=setInterval(function(){n--;'
          'stay.textContent="仍要留在测试地址"+(n?"（"+n+"）":"");'
          'if(!n){clearInterval(t);stay.disabled=false}},1000);'
          'stay.onclick=function(){box.remove();document.body.appendChild(bar)};'
          'box.append(say,link("去 starside.work",1),stay);'
          'document.body.appendChild(box)})()</script>' % SITE_URL)


# 三条杠站标
MARK = '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>'


def head(title, desc, app_js=False, up=1, sheets=None):
    """<!doctype> 到 <body> 为止。title 已含 · Starside 后缀。

    字体在 CSS 解析完才会被发现，preload 让它与样式表并行下载；只预载首屏用到的
    600 字重。app.js 用 defer，放 head 里比放 body 末尾更早被发现，执行时机不变。

    up 是页面离站点根有几层。**深一层的页面自动引父目录的 style.css**：同一组
    子页面（六个元素页）共用一份版式，各自的 style.css 只留自己那一两行差异，
    不必抄六遍。用 <link> 而不是 CSS 里的 @import——@import 要等父表下载完才
    发现子表，白搭一个往返。

    sheets 显式给出要引的样式表，给了就不按 up 推。配装页深三层却共用一份
    builds/style.css——按 up 推会要求每套配装各有一个 style.css，而它们的版式
    一模一样，那种文件建出来只是为了不 404。
    """
    at = '../' * up
    o = ['<!doctype html>', '<html lang="zh-CN">', '<head>',
         '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">',
         '<title>%s</title>' % title,
         '<meta name="description" content="%s">' % desc,
         '<meta name="theme-color" content="%s">' % THEME,
         '<meta property="og:type" content="article">',
         '<meta property="og:site_name" content="%s">' % SITE_NAME,
         '<meta property="og:locale" content="zh_CN">',
         '<meta property="og:title" content="%s">' % title,
         '<meta property="og:description" content="%s">' % desc,
         '<link rel="preload" href="%sassets/fonts/chakra-petch-600.woff2" '
         'as="font" type="font/woff2" crossorigin>' % at,
         '<link rel="icon" href="%sassets/favicon.svg" type="image/svg+xml">' % at,
         '<link rel="stylesheet" href="%sassets/site.css">' % at]
    if sheets is None:
        sheets = (['../style.css'] if up > 1 else []) + ['style.css']
    o += ['<link rel="stylesheet" href="%s">' % s for s in sheets]
    if app_js:
        o.append('<script src="%sassets/app.js" defer></script>' % at)
    o += ['</head>', '<body>']
    return '\n'.join(o)


def nav(current, toolbar=None, up=1, parent=None, parent_href='../index.html'):
    """顶部 sticky 单元：导航行 + 可选的工具条槽位。

    工具条内容由 assets/app.js 从 DOM 构建，这里不写任何源文本——写了就等于
    页面出现源稿文本的第二份副本。toolbar 传 data-* 字典；空字典表示要槽位但
    全用缺省选择器（神器模组页那一套）。
    """
    o = ['<div class="site-head">', '<nav class="site-nav">', MARK,
         '<a class="home" href="%sindex.html">%s</a>' % ('../' * up, SITE_NAME)]
    # 面包屑多一层：子页面要能一眼看出自己挂在哪个资料页下面，并直接跳回去。
    # parent 可以给多层。**只有第一层是链接**——它对应上一级目录里那个真实页面；
    # 再往下的层次是分组名，站内没有单独的页面，写成纯文本。给它们指同一个 URL
    # 会让相邻两枚面包屑落到同一处，指分节锚点则会在那一页增删分节时静默指错
    # ——两条都比不给链接差。
    # parent_href 缺省是上一级目录，那个页面深一层就得写出来：配装详情页在
    # builds/<赛季>/<slug>/ 下，它的索引在 builds/，隔着两级。
    for i, step in enumerate(parent or []):
        o += ['<span class="sep">/</span>',
              '<a class="home" href="%s">%s</a>' % (parent_href, step) if i == 0
              else '<span class="step">%s</span>' % step]
    o += ['<span class="sep">/</span>',
          '<span aria-current="page">%s</span>' % current,
          '</nav>']
    if toolbar is not None:
        attrs = ''.join(' %s="%s"' % (k, v) for k, v in toolbar.items())
        o.append('<div class="toolbar"%s></div>' % attrs)
    o += ['</div>', '']
    return '\n'.join(o)


def page_head(h1, note=None, aside=''):
    """页首：标题，可选的一句说明，可选的一段挂在标题右边的东西。

    aside 落在与 h1 同一行上（配装推荐的索引页拿它放投稿入口），标题下那道规线
    因此改由 .head-row 画——留在 h1 上时线只有标题那么长。
    """
    o = ['<header class="page-head">']
    o += (['<div class="head-row">', '<h1>%s</h1>' % h1, aside, '</div>'] if aside
          else ['<h1>%s</h1>' % h1])
    if note:
        o.append('<p class="page-note">%s</p>' % note)
    o += ['</header>', '']
    return '\n'.join(o)


def unsure_note(mark='[?]'):
    """页脚首句：待测值的说明。全站同一句话，只有标记形状按该页实际用的那个填。

    同一句免责语在不同页面换着说法写，读者会以为是不同约定。
    """
    return ('数值以游戏内实测为准，标注 <span class="unsure">%s</span> 的条目尚待核实。'
            % mark)


def emit(outdir, out, detail=''):
    """写出 index.html 并报一行。detail 是该页特有的结构计数。

    落盘前把 data-b 的绝对行号改成增量——四个生成器共用这一个出口，
    编码因此只有一处，各生成器与它们的 check() 面对的都还是绝对值。
    """
    out = markup.delta_bmarks(out)
    path = os.path.join(outdir, 'index.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(out)
    print('%s —— %.1f KB%s' % (os.path.relpath(path, ROOT), len(out.encode()) / 1024,
                               '，' + detail if detail else ''))


def foot(stamp, first, source=None, thanks=None):
    """页脚，三段式：本页口径、数据源、特别鸣谢，每段一件事。

    stamp 写成 YYYY.M.D，first 是接在更新时间后面的那句本页口径（可省）。
    source 只给出处，那句二次加工声明由 source_note() 接上。
    thanks 只写人，且只写在该贡献者实际参与的页面上，不做全站铺开。
    """
    o = ['<footer class="site-foot">',
         '<p><span class="stamp">更新 %s</span>%s</p>' % (stamp, first)]
    if source:
        o.append(source_note(source))
    if thanks:
        o.append('<p>特别鸣谢：%s</p>' % thanks)
    o += [CREDIT, LEGAL, ICP, '</footer>', SPEC, HIT, EDIT, NOTICE,
          '</body>', '</html>', '']
    return '\n'.join(o)
