"""站点外壳：head 元信息、导航条、页脚。三个生成器共用这一份定义。

外壳曾散在三个生成器 + 手写首页 + 外壳闸门共五处，加一条内容要改五个文件。
收成一份之后，`tools/check_shell.py` 拿这里生成参照去比对手写的 `index.html`，
闸门自己不再是副本。

首页 index.html 保持手写——它的 .entry 卡片与资料页结构不同，为三张卡片再造
一种源稿格式不划算。改了这里的署名或免责声明，首页要跟着改，闸门会提醒。
"""

SITE_NAME = 'Starside'
THEME = '#0b0d14'
BILIBILI = 'https://space.bilibili.com/26117485'
COMPENDIUM_URL = ('https://docs.google.com/spreadsheets/u/0/d/'
                  '1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4')

# 来自 Destiny Data Compendium 的页面，数据源一行一字不差地用这句。同一个数据源
# 在不同页面换着说法写，读者会以为是不同来源。
COMPENDIUM = ('<p>数据源：<a href="%s" target="_blank" rel="noopener">'
              'Destiny Data Compendium</a>。本页在其基础上统一了术语、标点与排版，'
              '数值未作改动。</p>' % COMPENDIUM_URL)

CREDIT = ('<p>© 2026 日栎w · <a href="%s" target="_blank" rel="noopener">'
          '哔哩哔哩</a></p>' % BILIBILI)

LEGAL = ('<p class="legal">Starside 为非官方资料站，与 Bungie, Inc. 无从属关系。'
         'Destiny 2 及相关名称、标识为 Bungie, Inc. 的商标。</p>')

# 站内导航预取：悬停即取，页面本身十几 KB，切换基本无感。不支持的浏览器忽略。
SPEC = ('<script type="speculationrules">'
        '{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}'
        '</script>')

# 三条杠站标
MARK = '<span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>'


def head(title, desc, app_js=False, up=1):
    """<!doctype> 到 <body> 为止。title 已含 · Starside 后缀。

    字体在 CSS 解析完才会被发现，preload 让它与样式表并行下载；只预载首屏用到的
    600 字重。app.js 用 defer，放 head 里比放 body 末尾更早被发现，执行时机不变。

    up 是页面离站点根有几层。**深一层的页面自动引父目录的 style.css**：同一组
    子页面（六个元素页）共用一份版式，各自的 style.css 只留自己那一两行差异，
    不必抄六遍。用 <link> 而不是 CSS 里的 @import——@import 要等父表下载完才
    发现子表，白搭一个往返。
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
    if up > 1:
        o.append('<link rel="stylesheet" href="../style.css">')
    o.append('<link rel="stylesheet" href="style.css">')
    if app_js:
        o.append('<script src="%sassets/app.js" defer></script>' % at)
    o += ['</head>', '<body>']
    return '\n'.join(o)


def nav(current, toolbar=None, up=1, parent=None):
    """顶部 sticky 单元：导航行 + 可选的工具条槽位。

    工具条内容由 assets/app.js 从 DOM 构建，这里不写任何源文本——写了就等于
    页面出现源稿文本的第二份副本。toolbar 传 data-* 字典；空字典表示要槽位但
    全用缺省选择器（神器模组页那一套）。
    """
    o = ['<div class="site-head">', '<nav class="site-nav">', MARK,
         '<a class="home" href="%sindex.html">%s</a>' % ('../' * up, SITE_NAME)]
    # 面包屑多一层：子页面要能一眼看出自己挂在哪个资料页下面，并直接跳回去
    if parent:
        o += ['<span class="sep">/</span>',
              '<a class="home" href="../index.html">%s</a>' % parent]
    o += ['<span class="sep">/</span>',
          '<span aria-current="page">%s</span>' % current,
          '</nav>']
    if toolbar is not None:
        attrs = ''.join(' %s="%s"' % (k, v) for k, v in toolbar.items())
        o.append('<div class="toolbar"%s></div>' % attrs)
    o += ['</div>', '']
    return '\n'.join(o)


def page_head(h1, note=None):
    o = ['<header class="page-head">', '<h1>%s</h1>' % h1]
    if note:
        o.append('<p class="page-note">%s</p>' % note)
    o += ['</header>', '']
    return '\n'.join(o)


def foot(stamp, first, compendium=False, thanks=None):
    """页脚。stamp 写成 YYYY.M.D，first 是接在更新时间后面的那句。

    thanks 只写在该译者实际参与的页面上，不做全站铺开。
    """
    o = ['<footer class="site-foot">',
         '<p><span class="stamp">更新 %s</span>%s</p>' % (stamp, first)]
    if compendium:
        o.append(COMPENDIUM)
    if thanks:
        o.append('<p>特别鸣谢：%s</p>' % thanks)
    o += [CREDIT, LEGAL, '</footer>', SPEC, '</body>', '</html>', '']
    return '\n'.join(o)
