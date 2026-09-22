"""站点外壳：head 元信息、导航条、页脚。三个生成器共用这一份定义。

外壳曾散在三个生成器 + 手写首页 + 外壳闸门共五处，加一条内容要改五个文件。
收成一份之后，`tools/check_shell.py` 拿这里生成参照去比对手写的 `index.html`，
闸门自己不再是副本。

首页 index.html 保持手写——它的 .entry 卡片与资料页结构不同，为三张卡片再造
一种源稿格式不划算。改了这里的署名或免责声明，首页要跟着改，闸门会提醒。
"""

import gzip
import json
import os
import re

import markup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 站点根：上线的页面与资源全在这一层，源稿、工具、数据与云函数留在仓库根。
# 页面清单、站内链接、索引里的图标路径都相对它。
SITE = os.path.join(ROOT, 'site')

HOME = 'index.html'
# 两个专属生成器各出一页，其余的从源稿现扫——新增一篇资料就不必记得回来改这张表了。
FIXED = [HOME, 'armor-sets/index.html', 'artifact-mods/index.html',
         'weapons/index.html']
# 源稿分两处，判据是这一页的行写不写主键：`keys/` 是主键骨架，行的内容在 data/ 的
# 记录上，源稿只写主键、顺序与分节；`docs/` 是散文与表，内容就在源稿里。两处同构
# ——一篇 .md 一个页面，库里的 `_id` 就是它在 `references/` 下的相对路径去掉 `.md`，
# 所以清单、闸门与词表都走下面这两个函数，不各自拼路径。
DOC_DIR = os.path.join(ROOT, 'references', 'docs')
KEY_DIR = os.path.join(ROOT, 'references', 'keys')
BUILD_DIR = os.path.join(ROOT, 'references', 'builds')


def src_dirs():
    """两处源稿的绝对路径。**按 ROOT 现拼**：回归把 ROOT 换成临时目录，
    模块加载时算死的常量跟不过去，整套夹具会落在真仓库上。"""
    return (os.path.join(ROOT, 'references', 'docs'),
            os.path.join(ROOT, 'references', 'keys'))
# 当前赛季。配装按赛季目录存档，**只有这一季进页面清单**——旧赛季照常生成（外壳
# 因此不与全站分叉），但索引页、全站搜索与外壳闸门都不收，站内点不到；手里已有
# 链接的人仍打得开。换季改这一个字符串。
SEASON = 's29'


def sources():
    """全部资料页源稿：[(slug, 绝对路径)]，按 slug 排，两处合成一份清单。

    两个专属生成器那两篇（artifact-mods、armor-sets）也在里面：它们与别的资料页
    同构，只是各有各的生成器。
    """
    out = []
    for d in src_dirs():
        if not os.path.isdir(d):
            continue
        out += [(n[:-len('.md')], os.path.join(d, n))
                for n in os.listdir(d) if n.endswith('.md')]
    return sorted(out)


def source_path(slug):
    """一篇源稿的绝对路径。两处现找，找不到回 None。"""
    for d in src_dirs():
        p = os.path.join(d, slug + '.md')
        if os.path.exists(p):
            return p
    return None


def doc_id(path):
    """源稿路径 → 库里的 `_id`（`docs/arc`、`keys/weapon-perks`）。"""
    return os.path.relpath(path, os.path.join(ROOT, 'references')).replace(
        os.sep, '/')[:-len('.md')]


def pages():
    """站内页面清单，相对站点根。源稿即清单，不另存一份名单。

    外壳闸门与全站搜索索引都从这里取，两处因此不会各扫各的。
    """
    out = list(FIXED)
    for slug, path in sources():
        if '%s/index.html' % slug in FIXED:
            continue
        with open(path, encoding='utf-8') as f:
            md = f.read()
        where = re.search(r'^路径：(.*)$', md, re.M)
        out.append('%s/index.html' % (where.group(1).strip() if where else slug))
    # 合集索引页只在真有合集时才出，也只在那时进清单——一个都没有时出一张空
    # 索引不如不出，而清单里挂一个不存在的页面会让外壳闸门当场报错。判据与
    # convert-build.py 的 main() 同一条。
    detail, has_set = [], False
    for season in sorted(os.listdir(BUILD_DIR)):
        if not season.startswith(SEASON + '-'):
            continue
        for name in sorted(os.listdir(os.path.join(BUILD_DIR, season))):
            if not name.endswith('.json'):
                continue
            detail.append('builds/%s/%s/index.html' % (SEASON, name[:-5]))
            with open(os.path.join(BUILD_DIR, season, name), encoding='utf-8') as f:
                # 配装源稿是结构化记录：合集的判据是「成员」非空，不再扫文本。
                if json.load(f).get('成员'):
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

# 备案号。每一页都要挂，且必须链到各自的查询页——这是备案要求，不是版式选择。
# 公安那枚盾形标不写 <img>：相对路径按页面深度各不相同，而 CSS 里 url() 按样式表
# 的位置解析，与页面深浅无关，所以徽章走 site.css 里 a.beian::before 的背景图。
# 图是无损 WebP（36×40，四角透明），文件名取内容 md5 前 10 位：.webp 按后缀给
# 一年缓存，换图必须换名（与 icons/ 同一条，见 README「部署与缓存」）。
ICP = ('<p class="legal">ICP备案/许可证号：'
       '<a href="https://beian.miit.gov.cn/" '
       'target="_blank" rel="noopener">鲁ICP备2026052166号-1</a> '
       '<a class="beian" href="https://beian.mps.gov.cn/#/query/webSearch?code=37010202700801" '
       'target="_blank" rel="noreferrer">鲁公网安备37010202700801号</a></p>')

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
       # 首页那句数字十分钟内直接用上一次取到的：不加这一层，刷十次首页就是十次冷启动。
       # svt 存「取到时刻|文本」，按自己的时刻作废。不能借 svd 判当天：svd 由当天先开
       # 的那一页写，svt 只有首页写，先开别的页再进首页，读到的是几天前那一句。
       'if(!f){if(!o)return;'
       'try{var c=localStorage.getItem("svt")||"",i=c.indexOf("|"),a=Date.now()-c.slice(0,i);'
       'if(i>0&&a>=0&&a<6e5){o.textContent=c.slice(i+1);return}}catch(_){}}'
       # POST 不写 content-type：字符串正文缺省是 text/plain，属于跨域的简单请求，
       # 不必先发一次 OPTIONS 预检；云函数照样把正文当 JSON 解。
       'var r=f?fetch("%s",{method:"POST",body:JSON.stringify({a:"hit",s:o?1:0})}):fetch("%s?a=stats");'
       'r.then(function(x){return x.json()})'
       '.then(function(s){if(o){var t="今日 "+s.today+" 位访客 · 累计 "+s.total;'
       'o.textContent=t;try{localStorage.setItem("svt",Date.now()+"|"+t)}catch(_){}}},'
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


def sync_card(home, href, count=None):
    """首页一张卡随那一页改写：更新时间取那一页页脚，count=(小标题, 数) 时改那个数。
    返回改过的首页。**改数要带上小标题那个锚点**：一张卡里将来多一对 <dt><dd>，
    不带锚点就把它也改了，而 check_terms 的 G4 只读第一个 <dd>，查不出来。"""
    card = markup.must(re.search(r'<a class="entry" href="%s".*?</a>' % re.escape(href), home, re.S),
                       '首页找不到 %s 那张卡' % href)
    with open(os.path.join(SITE, href), encoding='utf-8') as f:
        page = f.read()
    stamp = markup.must(re.search(r'<span class="stamp">更新 ([\d.]+)</span>', page),
                        '%s 的页脚没有更新时间' % href).group(1)
    fixed = re.sub(r'(entry-stamp">更新 )[\d.]+', lambda m: m.group(1) + stamp, card.group(0))
    if count:
        label, n = count
        fixed, hit = re.subn(r'(<dt>%s</dt><dd>)\d+' % re.escape(label),
                             lambda m: m.group(1) + str(n), fixed)
        if hit != 1:
            markup.die('首页 %s 那张卡上「%s」那个数有 %d 处，应当只有一处' % (href, label, hit))
    return home[:card.start()] + fixed + home[card.end():]


def emit(outdir, out, detail='', rest=0):
    """写出 index.html 并报一行。detail 是该页特有的结构计数。

    落盘前把 data-b 的绝对行号改成增量——四个生成器共用这一个出口，
    编码因此只有一处，各生成器与它们的 check() 面对的都还是绝对值。

    rest 是源稿「首屏记录：」的数：非零时只把前 rest 条记录留在 index.html，
    其余移进同目录的 rest.html 与 rest.gz（见 split_rest）。切在 delta_bmarks
    之后：data-b 的增量按整页的文档顺序算，插回原位之后 edit.js 照常解码。
    """
    out = markup.delta_bmarks(out)
    path = os.path.join(outdir, 'index.html')
    page, frag = split_rest(out, rest) if rest else (out, '')
    if frag and merge_rest(page, frag) != out:
        markup.die('%s：拆出去的记录插不回原样，split_rest 与 merge_rest 对不上'
                   % os.path.relpath(path, SITE))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(page)
    for name in (REST, REST_GZ):
        stale = os.path.join(outdir, name)
        if not frag and os.path.exists(stale):
            os.remove(stale)
    if frag:
        with open(os.path.join(outdir, REST), 'w', encoding='utf-8') as f:
            f.write(frag)
        with open(os.path.join(outdir, REST_GZ), 'wb') as f:
            f.write(gzip.compress(frag.encode(), compresslevel=9, mtime=0))
    print('%s —— %.1f KB%s%s' % (os.path.relpath(path, SITE), len(page.encode()) / 1024,
                                 '，其余 %d 段另存 %s %.1f KB（%s %.1f KB）'
                                 % (frag.count('<template data-rest='), REST_GZ,
                                    os.path.getsize(os.path.join(outdir, REST_GZ)) / 1024,
                                    REST, len(frag.encode()) / 1024) if frag else '',
                                 '，' + detail if detail else ''))


# ── 首屏之后的记录另存一份 ─────────────────────────────────────────────
# 托管不压缩，购物清单一页上千 KB，慢网要七八秒才下完。源稿写「首屏记录：N」的页面
# 只把前 N 条记录留在 index.html，其余整段移进同目录两个文件：rest.gz 是 gzip，
# 浏览器用内建的 DecompressionStream 解开，只有原样的一成大小；rest.html 是原样，
# 给没有 DecompressionStream 的浏览器，也给构建里要读整页的脚本（read_page）。
# 两份的正文都是生成器原本产出的那段 HTML，插回原位与不拆逐字相同，emit 当场核对。
REST = 'rest.html'
REST_GZ = 'rest.gz'
REST_PART = re.compile(r'<template data-rest="([^"]+)">(.*?)</template>', re.S)
SECTION_OPEN = re.compile(r'<section class="block" id="([^"]+)">')
REC_OPEN = re.compile(r'<article class="rec[ "]')


def rest_wait(sec):
    """留在分节里的占位：记录到了就被换掉。没有脚本时一直藏着，由 REST_JS 立起来。"""
    return '<p class="rest-wait" data-rest-wait="%s" hidden>其余条目载入中…</p>' % sec


# 接在 </main> 后面。内联而不另开文件：它要在页面解析到这里时就发出请求，
# 不等 defer 脚本；也就省了一次往返。window.starsideRest 在记录插回之后兑现，
# app.js 听 starside:rest 重新收条目，edit.js 进编辑态之前等它。
# 取回来的前两个字节不是 gzip 头（1f 8b）说明服务器自己加了 Content-Encoding、
# 浏览器已经解过一次，这时拿到的就是正文。
REST_JS = (
    '<noscript><p class="rest-wait">本页其余条目要启用 JavaScript 才能显示。</p></noscript>'
    '<script>(function(){'
    'var w=document.querySelectorAll("[data-rest-wait]"),i;'
    'for(i=0;i<w.length;i++)w[i].hidden=false;'
    'var gz=typeof DecompressionStream==="function";'
    'window.starsideRest=fetch(gz?"' + REST_GZ + '":"' + REST + '").then(function(r){'
    'if(!r.ok)throw new Error(r.status+" "+r.url);'
    'if(!gz)return r.text();'
    'return r.arrayBuffer().then(function(b){var h=new Uint8Array(b,0,2);'
    'if(h[0]!==31||h[1]!==139)return new TextDecoder().decode(b);'
    'return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text()})'
    '}).then(function(t){'
    'var box=document.createElement("template");box.innerHTML=t;'
    'var ps=box.content.querySelectorAll("template[data-rest]");'
    'for(i=0;i<ps.length;i++){'
    'var at=document.querySelector(\'[data-rest-wait="\'+ps[i].getAttribute("data-rest")+\'"]\');'
    'at.parentNode.insertBefore(ps[i].content,at);at.remove()}'
    'document.dispatchEvent(new Event("starside:rest"))'
    '});'
    'window.starsideRest.catch(function(e){console.error(e);'
    'for(i=0;i<w.length;i++)w[i].textContent="其余条目载入失败："+e.message+"，刷新重试"})'
    '})();</script>')


def split_rest(html, keep):
    """整页 → (index.html, rest.html 的正文)。

    按文档顺序数记录（article.rec），前 keep 条留在页面上；此后每个分节从第一条
    没留下的记录起、到分节结束为止整段移走，原位换成 rest_wait()。分节标题与列名
    留着，工具条的分节标签从一开始就是齐的。rest.html 里每段一个
    <template data-rest="分节 id">，插回时按 id 找占位。
    """
    page, parts, at, kept = [], [], 0, 0
    for m in SECTION_OPEN.finditer(html):
        end = html.index('</section>', m.end())
        body = html[m.end():end]
        if '<section' in body:
            markup.die('分节里又套了分节（%s），split_rest 切不准' % m.group(1))
        recs = []
        for r in REC_OPEN.finditer(body):
            close = body.index('</article>', r.start()) + len('</article>')
            if '<article' in body[r.start() + 1:close]:
                markup.die('记录里又套了 article（%s），split_rest 切不准' % m.group(1))
            recs.append((r.start(), close))
        take = min(max(keep - kept, 0), len(recs))
        kept += take
        if take == len(recs):
            continue
        cut = m.end() + (recs[take - 1][1] if take else recs[0][0])
        page += [html[at:cut], rest_wait(m.group(1))]
        parts.append('<template data-rest="%s">%s</template>' % (m.group(1), html[cut:end]))
        at = end
    if not parts:
        markup.die('「首屏记录：%d」已经盖住了全部记录，这一页不必拆，把那一行删掉' % keep)
    tail = html[at:]
    close = tail.index('</main>') + len('</main>')
    page += [tail[:close], REST_JS, tail[close:]]
    return ''.join(page), '\n'.join(parts) + '\n'


def merge_rest(page, frag):
    """split_rest 的逆运算：把 rest.html 的各段插回占位，拿掉 REST_JS。"""
    out = page.replace(REST_JS, '', 1)
    for sec, body in REST_PART.findall(frag):
        wait = rest_wait(sec)
        if out.count(wait) != 1:
            markup.die('rest.html 的分节 %s 在页面上找不到唯一的占位' % sec)
        out = out.replace(wait, body)
    return out


def read_page(path):
    """一页产出的整页 HTML：拆出去的记录并回来。构建里要读页面内容的脚本走它。"""
    with open(path, encoding='utf-8') as f:
        html = f.read()
    frag = os.path.join(os.path.dirname(path), REST)
    if os.path.basename(path) != 'index.html' or not os.path.exists(frag):
        return html
    with open(frag, encoding='utf-8') as f:
        return merge_rest(html, f.read())


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
