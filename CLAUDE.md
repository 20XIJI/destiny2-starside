# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无测试框架、无打包器。

资料页全部由生成器从 `references/` 下的 markdown 源稿产出，**产出一律不手改**：改文案改 markdown，改结构改生成器的 `render()`，两种情况都重跑脚本。只有首页 `index.html` 是手写的。

**视觉与排版规范在 `design.md`。**本文件写机制与验证，不重复设计规则。

## 站点骨架

首页 `index.html` 手写，每个资料页在首页有一张 `.entry` 卡片（更新时间写卡片上的 `.entry-stamp`）。新增资料页要同时加卡片，否则页面没有入口。

现有十四页：`ammo/` 弹药生成机制、`armor-mods/` 护甲模组、`armor-sets/` 护甲套装、`artifact-mods/` 神器模组、`boss-hp/` 首领生命值、`twisted-planet/` 扭曲星球速查表、`weapon-frames/` 武器框架、`elements/` 属性详解总览与其下六个元素页（`elements/arc/`、`solar/`、`void/`、`stasis/`、`strand/`、`prismatic/`）。`armor-sets/` 与 `artifact-mods/` 各有专属生成器，其余十二页走 `convert-doc.py`。

样式按层引，顺序即优先级：`assets/site.css`（全站 token、外壳、字体、资料页骨架）在前，本页 `<页目录>/style.css` 在后。**深一层的页面自动多引一层父目录的 `style.css`**（`shell.py` 的 `head()` 按 `up` 判断）：六个元素页共用 `elements/style.css` 的版式，各自的 `style.css` 只留一行 `--accent`。`assets/app.js` 只有带 `.toolbar` 的页面需要引。

`serve.json` 关掉了 `cleanUrls`，站内链接一律写全 `xxx/index.html`。

`references/` 入库的是源稿：`artifact-mods.md`、`armor-sets.md`，以及 `docs/` 下的资料文档。转写中间产物 `armor_transcription.*` 在 `.archived/`，整个目录已 gitignore，不当源稿用。

`.gitignore` 对 `references/` 是「全忽略 + 白名单」：只放行上面那两个文件与 `docs/*.md`。**新增文档源稿一律放 `references/docs/`**，丢在 `references/` 根下会被静默忽略，`git status` 干净但源稿没入库。放进去之后 `git check-ignore -v <路径>` 应无输出。

## tools/ 的分层

```
markup.py          源稿方言与公共件：{token|文字} 着色、「键：值」行、空行分段、
                   剥标签取文本、保真前的归一化、计数比对、图片尺寸、图标登记
shell.py           站点外壳与落盘：head 元信息、导航条、页脚、ROOT、emit()
convert-*.py       三个生成器，各自只写自己那种数据形状的结构层
check_shell.py     外壳闸门，从 shell.py 现取参照，不另存副本
check_terms.py     术语与着色闸门，全部以 TERMS 那一张表为准
```

**一个目的只留一份实现。**剥标签取文本用 `markup.text_of`，保真比对前的归一化用 `markup.plain`，计数比对用 `markup.eq(名目, 实际, 期望)`，中止用 `markup.die`，图片宽高用 `markup.img_size`，图标登记与首屏优先级用 `markup.Icons` / `markup.loading_attr`。要新加一件，先看 `markup.py` 里有没有。

外壳与源稿方言各只有一处定义。**加一条外壳内容（meta、资源提示、页脚段落）只改 `shell.py`**，各资料页重跑即生效；手写的首页 `index.html` 要跟着改，`check_shell.py` 会提醒。页脚那句待测值说明走 `shell.unsure_note(标记)`，一句话只有一处定义，标记形状按该页实际用的填。

`markup.py` 的 `inline()` 默认只处理着色，富文本标记（`**粗体**`、`*强调*`、`[文字](链接)`）由调用方传 `rich=True` 开启。神器模组页不开——它的源稿里有孤立的 `*`（「呈 * 形释放」），开着会在有人再加一个星号时静默变成 `<em>`。

## 命令

```bash
npm start                                     # npx serve . -l 3000

python3 tools/convert-artifact-mods.py        # 源稿 references/artifact-mods.md
python3 tools/convert-armor-sets.py           # 源稿 references/armor-sets.md
python3 tools/convert-doc.py [slug]           # 源稿 references/docs/*.md，省略 slug 即全部
python3 tools/check_shell.py                  # 各页外壳一致性
python3 tools/check_terms.py                  # 术语正名、着色 token、更新时间

ruff check tools/*.py                         # 改完 Python 跑这两条
pyright tools/*.py
```

## 术语与着色的一处定义

**`tools/check_terms.py` 的 `TERMS` 是全站术语的唯一真相。**一行钉两件事：中文怎么写，以及着色落到哪个 token 上。加一条术语就往表里加一行，不在源稿里逐处约定。

四条闸门：

1. **中文正名** — 源稿不许出现禁用写法。「装填」曾被统一成「填装」，六天后新增的页面又带回 17 处；这一条就是为此存在的。
2. **token 唯一** — 同一个术语只能落到同一个着色 token 上。只查「整个标记就是这个词」的那种（`{enemy|护甲充能}`）；词嵌在更长的短语里时着色属于短语（`{el-arc|电弧元素能量球}`），按词强判会把整句的颜色拆碎。这一条眼睛查不出来：`--el-solar` 与 `--deb-solar` 渲染色相同，灼烧着成哪个都看不出。
3. **token 有定义** — 源稿里每个 `{token|文字}` 都要在 `site.css` 或该页样式表里有对应类；反过来，`site.css` 的着色类一次都没被用到即死配置，当场报出。
4. **更新时间一致** — 资料页页脚的「更新 YYYY.M.D」与首页卡片上那个必须相等。

**不进禁用表的两类词**：一是同形不同义（「优雅处决」是星相里的机制名，不是终结技；「敌方」是形容词，不是战斗人员的同义词）；二是游戏内的效果名各自独立（「治愈」与「治疗」、「恢复」与「治疗」不是同义词，别合并）。

**类名按语义命名，不按颜色命名。**敌人分档写 `.bar-red` / `.bar-orange` / `.bar-yellow`——游戏内的血条本来就是这三色，读者能反推出颜色为什么是这个颜色。同一个颜色不给两个名字。

## 神器模组页

`artifact-mods/index.html` 由 `tools/convert-artifact-mods.py` 从 `references/artifact-mods.md` 生成，**不手改**。改文案改 markdown，改结构改 `render()`，两种情况都重跑脚本。

与护甲套装页同构：源稿是可编辑的 markdown，转换本身即保真，git diff 即变更记录，不设补丁表。

### 源稿格式

`## ` 起分节，`### ` 起模组，其余是正文。空行分段，段内换行落成 `<br>`。

「键：值」行携带结构信息，键名固定在 `META_KEYS`：`副标题`、`小标题`、`标题`、`徽章`、`括注`、`图标`、`标签`、`标签（站点补充）`。这些行按整行剥离，剩下的即正文——所以**正文里出现同名的键会被吃掉**。`keys_in()` 逐块核对键行条数，数目不符即中止，不让内容悄悄消失。键行里的值必须占一行，其中的换行写成字面 `<br>`。

模组标题写成 `### 一级 · 名称`，档位取自 `TIERS`。同一分节内按源稿顺序三个一组切行，`rows_of()` 断言每组恰好是一/二/三级。

`标签（站点补充）` 与 `标签` 的区别只在产出侧留痕：前者带 `data-source="site"`，标明该分节的标签不来自原表格。同一分节两者只能写一个。

### 行内着色

源稿用 `{token|文字}` 写着色，token 即 `assets/site.css` `:root` 里的语义名。文本里从不出现 `{` 与 `}`，所以这对括号可以当标记字符；`|` 在文本里常见，但只有紧跟在 token 名后面的那个才是分隔符。支持嵌套（说明里套术语有 10 处）。

`inline()` 是一趟栈式扫描，不是正则替换——嵌套用正则做不干净。

### `check()` 的闸门

结构计数：分节 7、模组 147、图标引用 156、图标文件 133、span 开闭相等、残留内联样式 0、未转换的着色标记 0。分节没有模组也报错。

改了分节数、模组数一类的结构，同步改文件头的 `N_*` 常量，不要放宽比对。

图标已压在 `artifact-mods/icons/` 里，按文件名引用，宽高从 PNG 的 IHDR 现读，不在源稿里重复记。改动后确认 `git status --porcelain artifact-mods/icons/` 为空。

## 护甲套装页

`armor-sets/index.html` 由 `tools/convert-armor-sets.py` 从 `references/armor-sets.md` 生成，**不手改**。改文案改 markdown，改结构改 `render()`，两种情况都重跑脚本。

源稿是 Flamia 的中文人工翻译稿，按 7 个分类重排过。英文原表（Destiny Data Compendium 的 Google 表格导出）比它新，只承担两件事：提供 112 枚效果图标，以及核对数值。它 21 MB、大半是内嵌字体，已在 `.gitignore` 里，**不入库**。

与神器模组页同构：源稿是可编辑的 markdown，转换本身即保真，**改文案就是直接改 markdown**，git diff 即变更记录，不设补丁表。两页的差别只在着色路径——这一页走词表，那一页走显式 `{token|文字}` 标记，理由见 `design.md`「两条着色路径」。

`check()` 的闸门：

1. **正文逐条保真** — 产出剥掉标签后与源稿逐字相等。两侧同样归一化：去空格，去 `*`、反引号、`“”`（这些标记在页面上由字重与颜色承担，不落成字符）。
2. **计数断言** — 分类 7、套装 56、效果 112、图标引用 110（另 2 处英文原表本身就是空白占位）、每个套装恰好一条 2 件加一条 4 件。
3. **词表体检** — `GLOSSARY` 里一次都没命中的词即死配置，当场报出。不写死每个词的命中数：源稿是要持续编辑的，写死会让每次改句子都误报。
4. **着色 span 不得嵌套** — 嵌套说明 `INLINE` 的分支顺序被改坏了。

### 行内着色

中文稿是纯文本。英文原表的着色只附在英文 span 上，且中文稿已重写重排，span 级别搬不过来（1147 个着色 span 里只有 919 个落在已知色上，`#cccccc` 连标点和 `On`/`While` 都染，语义不可靠）。所以按 `design.md`「术语以页内自洽为准」改用**词表着色**，token 全部复用 `site.css` 既有的，不新增渲染色。

`INLINE` 是一趟正则走完的分支表，**顺序即优先级**：`**粗体**` → 反引号代码 → `“buff 名”` → `[?]` 待测 → `[数值]` PvP → 数值位上的 `?` → `GLOSSARY` 词表。引号在前保证 buff 名整体一个颜色，不会被词表再切一刀。`GLOSSARY` 内部必须长词在前（`能量球` 先于 `能量`、`威能弹药` 先于 `弹药`）。

否定前缀 `非` 与后面的术语构成一个复合术语（非首领战斗人员＝一类战斗人员，非超能＝一种状态），一并着色——留在着色外面会让扫读的人读到反义。`除非`、`而非` 里的 `非` 不构词，由后顾断言 `(?<![除而])` 排除。谓语性的否定（`尚无灼烧层数`）不算构词，术语照常单独着色。

### 重抽图标

图标已压好在 `armor-sets/icons/001.png … 112.png`，按 markdown 文档顺序编号，生成器按序号引用，不建映射表。只有换了英文原表才需要重抽：

```bash
python3 tools/convert-armor-sets.py --icons <英文原表导出.html>
```

原图 70×70、纯白剪影 + alpha，三个色通道恒为白，丢掉彩色通道是无损的；再降到 56px、alpha 量化到 16 档，112 枚合计 238 KB → 114 KB，3× 放大与原图并排看不出差别。中英两侧的套装靠效果名对应（52 个直接对上），余下 4 个英文侧效果名没被机翻覆盖，写在 `MANUAL_PAIRS` 里按来源认领。

## 资料文档页

`tools/convert-doc.py` 是通用的一篇 markdown 一个页面：`references/docs/<slug>.md` → `<slug>/index.html`。加一篇资料就是往 `references/docs/` 丢一个 .md、建好输出目录与 `style.css`、跑一次脚本，再去首页 `index.html` 加一张卡片。`check_shell.py` 从 `references/docs/` 现扫页面清单，不必回去登记。前两个生成器各自绑定一种数据形状（神器/模组/档位、分类/套装/2 件 4 件），这一个不绑，走的是通用文档结构。

排版按 `design.md` 第四节：版心一档写在页面表的 `:root { --wrap: … }` 上（连续阅读 760px、宽表 1060px、全量宽表 1500px），表格一律 `width: auto` + `margin-inline: auto` 按内容定宽再居中。

**给整格上色的 CSS 别写在 `td` 上。**整格只有一个 `{标记|…}` 时 class 落在 `<td>` 本身（见下条），此时 `.gen tbody td:last-child` 这类三选择器会以权重压过单类的 `.amp`，整列着色静默退成默认色。基色给 `tbody` 由继承落下来，格子选择器只管排版，两者就不争同一个元素。`boss-hp/style.css` 里记着这条。

### 源稿格式

首行 `# 页面标题`，其后是「键：值」行。键名固定在 `META_KEYS`，读取只走 `meta_of()` 一条路：

| 键 | 作用 |
|---|---|
| `描述：` | 进 meta description 与 og |
| `更新：` | `YYYY.M.D`，落在页脚 `.stamp`。与首页卡片的 `.entry-stamp` 由 `check_terms.py` 比对 |
| `页脚：` | 可选，接在更新时间后面的那句 |
| `鸣谢：` | 可选，落成页脚的「特别鸣谢：」一句，只写在该贡献者实际参与的页面上 |
| `数据源：是` | 可选，输出 `shell.py` 里那句 Destiny Data Compendium 归属，一字不改 |
| `路径：` | 可选，把页面挂到子目录里（`elements/arc`）。缺省是 slug 本身、挂在站点根下；层数决定资源前缀、面包屑与父目录样式表 |
| `上级：` | 可选，导航条上多一级面包屑，指向 `../index.html` |
| `导航：是` | 可选，顶部工具条：搜索框 + 每个分节一枚跳转 chip |
| `跳转分行：` | 可选，chip 从这一节起另起一行，值写分节标题（图标不算），要配合 `导航：是` |
| `列组：`／`默认列组：`／`互斥列组：` | 可选，见下 |
| `首屏图标：` | 可选，前 N 张图标改用 `fetchpriority="high"`，其余 `loading="lazy"`；按实测定，缺省 0 |
| `此刻：是` | 可选，见下 |

**`数据源`／`导航`／`此刻` 是布尔键，只认「是」。**写别的值（包括「否」）当场报错——不需要就把整行删掉，不留一行写着「否」的开关。

**带「导航：是」的表不能用首格留空合并**：搜索按行隐藏，合并块会被豁开，行标题要逐行写全。

**分节多到 chip 一行放不下时用「跳转分行：」按内容分组换行**，不交给自动折行随便断在哪。产出侧只多一个 `data-chip-break`，`app.js` 在那枚 chip 前插一个占满整行的空项（`site.css` 的 `.chip-break`）。指的分节不存在即中止——写错了会静默不分行，看不出来。

**`此刻：是` 打开当前时刻高亮。**产出侧只多一个 `<div class="toolbar" data-clock="">`，`assets/app.js` 据此按本机时钟打两个属性：整行的 `data-now-row` 落在 `<tr>` 上，整列的 `data-now-col` 落在每个格子上，颜色归页面样式表。时刻只有运行时才知道，写不进产出，所以这一条走 JS 而不是生成器。

**行的那层必须落在 `<tr>`、列的那层落在格子。**同落在格子上时两条规则争同一个背景，只有一条生效；分两层则格子压在行上，交点是真的叠加。**开关叫 `data-clock`，与两个标记不同名**——同名时选择器会把工具条自己也选进去。

app.js 按表头文本找列、按首格开头的两位时刻找行（首列写的是时段区间 `00:00-01:00`，起始时刻就在开头那两位），**不按序号**：序号会在源稿调整行列顺序时静默指错格子，对不上则 `console.warn` 报出，不静默留空。整点重排一次。

`## ` 起分节（对应 `<section class="block">` + `<h2 class="sect-label">`）。分节之外不许有正文。段内换行落成 `<br>`，空行分段。

**色阶的阈值写在源稿里，一张表一套。**分档是内容判断（多少算高随体系而变——突袭与地牢的血量差 2.7 倍，共用一套阈值会让整个地牢表挤在最低两档），生成器只负责比对阈值、打 `data-tier`，不内建任何领域常识。阈值须严格升序，指的列不能是首列（那是行标题），列里出现非数值格即中止。

定阈值的两条经验：**按人数均分，不按数值区间等距**（数值聚在中段时等距会让某一档塞进十几行，那一档内部又分不出高低）；**离群值单独占顶档**（`boss-hp/` 的卡鲁斯是次高值的 15 倍，留在分位里会占掉一整档还带偏切点）。档数上限由颜色定，不由数据定——色阶相邻档的 CIELAB ΔE 要 ≥ 12，低于这个数就是画了档位但看不出区别。

| 写法 | 产出 |
|---|---|
| `- 条目` | `<ul><li>` |
| `术语` 换行 `: 定义` | `<dl class="rules"><dt><dd>` |
| `\| 表头 \|` + `\|---\|` + 数据行 | `<table class="gen">`，每行首格是 `<th scope="row">` |
| 表格里再来一行 `\|---\|` | 另起一个 `<tbody>` |
| 单独一格的一行 `\| == 组名 == \|` | 横幅行：`<tr class="lane">` + 跨满表宽的 `<th scope="colgroup">`，自领一个 `<tbody>` |
| 数据行首格留空 | 向上合并进上一个行标题（`rowspan`），整表带 `data-band` 交替位 |
| 分节里一行 `色阶：列名 阈值 阈值 …` | 该列的数值格按落在第几档带上 `data-tier`，颜色由页面样式表定。一节可写多条，一列一条 |
| 头部一行 `列组：组名 = 列名、列名 …` | 该组各列的 `<thead> th` 带上 `data-g`，`app.js` 据此在工具条上建列组开关 |
| 头部的 `默认列组：`／`互斥列组：` | 落成 `.toolbar` 上的 `data-cols`／`data-solo`，前者是加载时打开的组，后者是一次只能开一组的那几组 |
| `**粗**` `*强调*` `[文字](链接)` | `<strong>` `<em>` `<a>`，`http` 开头的自动带 `target="_blank" rel="noopener"` |
| `![](icons/xxx.png)` | `<img src alt="" width height>`，宽高从文件头现读，文件名须是内容的 md5 前 10 位 |
| `{token\|文字}` | `<span class="token">`，token 即 `assets/site.css` 或页面样式表里的类名，可嵌套 |
| 单元格里的 `\\` | `<br>`。一行源稿就是一行表格，格内换行只能靠标记；选 `\\` 是因为中文正文、数值与链接里都不会出现它——用 `//` 会把链接里的 `https://` 一并切开 |

**一个块的内容整体只有一个 `{标记|…}` 时，class 落在块上，不套 span。** `<th class="bar-red">红血</th>` 比套一层 span 干净，`p.note`、`p.formula` 同理。判据是首个标记的闭括号落在块末尾——`{a|白弹} → {b|绿弹}` 是两个标记，照常套 span。

**整格版式也走这条路，用的是同一种括号。**元素页的 `{ico|![](…)}`（图标格）、`{slot|…}`（碎片槽位格）、`{cd|…}`（冷却与回复倍率格）、`{ico2|…}`／`{ico4|…}`（一格多图）、`{lead|…}`（网格表的左上角首格）、`{sk-arc|…}`…`{sk-strand|…}`（共享技能的属性列），首领生命值页的 `{na|…}`、`{amp|…}`、`{res|…}`、`{buff|…}`，武器框架页的 `{g-a|…}`…`{g-s|…}`、`{cfg|…}`，弹药页的 `{from|…}`、`{formula|…}`，都是这一族。它们不是着色 token，是把 class 落到 `<td>` / `<th>` / `<p>` 上的排版标记。

**别按「格里有没有 img」猜格子的用途。**说明格后面挨着的正是槽位格，按 `:has(+ td img)` 认名称格会把整列说明判成名称、吃到 `nowrap`，整张表横着溢出去。要认就按源稿写的整格标记认（`:has(+ td.ico)`）。

表格的行组分界由 CSS 的 `tbody + tbody` 画，不落成类名。

**一张表里分好几组、各组末列装的东西又不一样时，组名走横幅行，不摊成「类别」列。**六个元素页的职业表照源表分成 `近战技能`／`超能技能`／`星相` 三块，末列同一列复用——技能填 `{cd|…}`，星相填 `{slot|…}`。摊成一个逐行重复的「类别」列，再把冷却与槽位拆成两列，会让两列各空一半、还得拿 `{note|—}` 占位。横幅行的样式在 `assets/site.css` 的 `.gen tr.lane > th`。

**横幅行不是条目，不参与搜索。**`data-item` 因此写成 `.gen tbody tr:not(.lane)`；横幅自领一个 `<tbody>`，`app.js` 按这个 `tbody` 数「这一组还剩几行可见」，整组被搜没了就把组名一并收起，不留光杆。

**合并块的交替底色靠 `data-band`，只出现在真用到合并的表上。**每个合并块行数不等，`:nth-child` 数不出「第几块」，CSS 计数器又不能参与着色，所以这一位由生成器打。没有合并的表照旧输出干净的 `<tr>`，弹药页因此零 diff。

**表头里的空格是折行点，不是列名的一部分。**中文默认可以在任意两字之间断行，一排表头因此各断各的（「基础间 / 隔」挨着「测试 / 弹匣」）。`site.css` 给 `.gen thead th` 上了 `word-break: keep-all`，中文因此不再任意断，只剩空格是断点，断点就写在表头文本里（`weapon-frames/` 照抄源表的两行表头）。汉字与拉丁之间那个排版空格要写成不折行空格 `\xa0`，否则又多出一个断点。「色阶：」与「列组：」按去掉空格比对列名（`colkey()`），所以那两处照常写不带空格的列名。

**列线只在表格最左缘去掉，判据是「贴着表格左边」而不是「这一行的第一格」。**合并行没有 `<th>`，首领名格就成了该行的首格，按 `td:first-child` 去边框会把它左侧的竖线吃掉——每个合并块只有第一行闭合，往下豁开一道口子。要写成 `thead th:first-child` 与 `tbody th[scope="row"]`。

### 列组开关

列多到一屏放不下的表（`weapon-frames/` 42 列）靠列组分批显示：源稿头部按组列出列名，`默认列组：` 写加载时打开哪几组，`互斥列组：` 写哪几组一次只能开一组，工具条给出 chip，读者自己拼视图。

约束四条：**表头里的每一列都要落在某个组里**（漏了即中止，否则工具条会漏掉它）；**首列所在的那一组不给 chip**，它是行的身份，任何时候都在；**默认隐藏由 `app.js` 在加载时施加，不写进 HTML**——无 JS 时全部列可见，与工具条为空容器时正文完整可读是同一条约定；**数值组之间互斥**——几十列同屏会把行撑得过长，扫读时对不上行。

隐藏走 `app.js` 内建的一张样式表按列序下规则，不给每个格子挂属性（94 行 43 列挂一遍要多出十万字节）。**合并行没有 `<th>`，序号整体前移一位，所以同一列要下两条规则**（`tr:has(> th)` 与 `tr:not(:has(> th))`），只下一条会让合并行错位隐藏。

### `check()` 的闸门

**正文逐字保真** —— 产出剥掉标签后与源稿逐字相等。两侧同样归一化：去空格，去 `*`、反引号、着色标记（这些在页面上由字重与颜色承担，不落成字符），表格只去分隔符与分隔行，块标记只去行首那一个。不写死每种块的条数：源稿是要持续编辑的，写死会让每次改句子都误报。

另外两条：着色 span 不得嵌套（嵌套说明 `wrap()` 的整块判定被改坏了）；产出里不得有没转换的 `{` `}`。

## 页脚归属

来自 Destiny Data Compendium 的页面，数据源一行**一字不差地照抄这句**：

```html
<p>数据源：<a href="https://docs.google.com/spreadsheets/u/0/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4" target="_blank" rel="noopener">Destiny Data Compendium</a>。本页在其基础上统一了术语、标点与排版，数值未作改动。</p>
```

同一个数据源在不同页面上换着说法写，读者会以为是不同来源。别的数据源另起一句，不套这个模板。

更新时间写在页脚首句句首的 `<span class="stamp">`，格式 `更新 YYYY.M.D`；首页则写在每张卡片的 `.entry-stamp` 上。

特别鸣谢只写在该译者实际参与的页面上，不做全站铺开。

`tools/check_shell.py` 把这些约定钉成闸门：各个页面的 head 元信息、站标、署名、免责声明必须逐字一致，提到 Destiny Data Compendium 就必须用上面那一句，每页都要有格式合规的更新时间。页面清单从 `references/docs/` 现扫，新增一篇资料不必回去登记。

## 视觉与排版

**规范在 `design.md`，改样式、定颜色、加页面之前先读。**那里写死了色相归属、ΔE 判据、中文空格规矩、版心与外壳的分工。

配色只有一处定义：`assets/site.css` 的 `:root`。源稿里的着色 token 直接引用这些语义名，改渲染色只改 `:root` 的右值，生成器不必重跑。同一处还放着三样东西，改它们同样不必重跑生成器：外壳叠色 `--tint-1/2/3`、`--head-fill`、`--row-hover`；UI 强调色 `--accent`（焦点环、当前 chip、卡片左缘，子页面覆盖这一个变量即可换色）；版心一档 `--wrap` 与最小内容宽度 `--min`。

**资料页的骨架也在 `assets/site.css`**：版心、`.block` 分节、`.gen` 表格、八档色阶、sticky 让位。页面样式表只写真差异——`--wrap` / `--min` 两个右值，表格是否 `border-collapse: separate`，以及本页专属的列宽与列对齐。

## 前端性能约定

站点是纯静态、零依赖。以神器模组页为例，首屏约 46 KB gzip（HTML 19K + site.css 10K + 本页样式表 3K + app.js 5K + 首个字重字体 10K）。别引框架或打包器——任何 runtime 都比整站资源还大。以下几条是已经落地的约定，改页面时保持住。

**公共版式放 `site.css`，不为共用另开文件。**`site.css` 每页都要下、且跨页共用一份缓存；页面样式表则是一页一份。共用的东西放前者，首访多几 KB，从第二页起每页省下更多（资料页的样式表因此从 6.6 KB 降到 2.9 KB）。再开一个 `table.css` 只会多一轮请求，省不出东西。

**首屏图片不加 `loading="lazy"`。** 给首屏图片加 lazy 会让它们等布局算完才开始下载，是反模式。排在首屏之内的图标改用 `fetchpriority="high"`，判定只有 `markup.loading_attr()` 一处。数目按 1440×900 实测给：资料页写在源稿的 `首屏图标：` 一行，神器模组页与护甲套装页各是生成器里的 `N_EAGER`（6 与 2）。改版式让首屏塞得下更多图标时，同步改这个数。

**长页用 `content-visibility: auto` 跳过屏外渲染。** 神器模组页约 16700px、护甲套装页约 28700px，屏外内容不必参与布局与绘制。

套的位置有讲究：**只能套在不含 sticky 后代的元素上**。`content-visibility` 带 paint containment，会把内部的 sticky 裁在自己的盒子里。所以神器模组页套 `.mod-row`（不是 `.artifact`，它含 sticky 的 `.art-bar`），护甲套装页套 `.set-bonuses`（不是 `.set`，它含 sticky 的 `.set-id`）。

`contain-intrinsic-size: auto <值>` 里的 `auto` 让浏览器渲染过一次后改用真实高度，**那个值只是从没渲染过时的初始估值，不需要跟着内容维护**。它唯一影响首屏滚动条长度与锚点跳转的过冲量，估错不会渲染错。现值取 1440px 宽下的实测中位数（`.mod-row` 278px、`.set-bonuses` 386px），实测总高偏差 5%–7%。

量真实高度时**必须让页面自己的 `style.css` 也加载**——断言页用 `<base href>` 指回真实目录，只重写 `../assets/` 的路径会漏掉页内相对引用，量出来能差 3 倍。量之前先把 `content-visibility` 临时置成 `visible`，否则量到的是估值本身。

**当前分节高亮走 `IntersectionObserver`，不在滚动事件里读 `getBoundingClientRect()`。** rootMargin 把视口顶端裁掉 `--stick + 8` 像素，落在剩下那块里最靠上的分节即当前分节。`--stick` 变了要重建观察者（`watch()`），resize 时已经这么做。搜索隐藏分节走 `display: none`，观察者自动报离开，不必手动同步。

**外壳里的两条资源提示**由 `check_shell.py` 钉住：字体 `preload`（只预载首屏用到的 600 字重）与 `speculationrules` 导航预取。

**缓存策略见 `README.md` 的「部署与缓存」。**长缓存只给文件名带内容标识的资源；不要为了 CSS/JS 引入文件名哈希，它们与 HTML 的重新验证走同一轮往返，省不出可测量的时间。

除 `armor-sets/icons/`（序号命名）外，各页图标目录的文件名都是内容的 md5 前 10 位，`markup.Icons.html()` 每次转换都复核。**不要原地覆盖图标**——那一年的浏览器缓存就建立在「改内容必然换名」上，覆盖了读者会看一年旧图。换图按 README「换图」那三步走。

## 神器模组页的布局约束

- **`.mod` 必须按 `data-tier` 钉 `grid-column`，模组必须按行包在 `.mod-row` 里。** 纯靠行主序自动布局时，搜索隐藏任一模组会让其后所有模组列位偏移（三级会落到一级列）。
- 分节 sticky 单元贴 `top: var(--stick)`，底色取不透明的 `--ink-lift`，分节带 `scroll-margin-top: var(--stick)`。`--stick` 由 `app.js` 按 `.site-head` 实测高度写回。
- 这一页约 16700px 高、156 张图，所以 `main` 上不能开 `overflow-x`（理由见 `design.md`），横向溢出交给 `body { min-width: 1064px }`。

## assets/app.js

工具条（搜索框、跳转 chip）从 DOM 读取分节标题构建，**不在 HTML 里写任何源文本**——写了就等于页面出现源表格文本的第二份副本，保真自检立即报重复。

选择器由页面在 `.toolbar` 上用 `data-*` 声明，缺省是神器模组页那一套，所以那一页的 HTML 一个字不用改：

| 属性 | 缺省（神器模组页） | 护甲套装页 | 资料页（`导航：是`） |
|---|---|---|---|
| `data-section` | `.artifact` | `.cat` | `.block` |
| `data-item` | `.mod` | `.set` | `.gen tbody tr:not(.lane)` |
| `data-label` | `.art-head h2` | `.cat-head span` | `.sect-label` |
| `data-noun` | 模组 | 套装 | 条目 |
| `data-chip-label` | 神器 | 分类 | 分节 |

另有一个可选的 `data-chip-break`：值等于哪枚 chip 的文字，就在那枚之前插一个占满整行的空项，chip 从那里另起一行。源稿写「跳转分行：」，护甲模组页用它把五个部位与十一个副本分成两行。

搜索按条目的 `textContent` 过滤，整行不命中隐藏行，整节不命中隐藏分节与其 chip。隐藏靠 `hidden` 属性，`site.css` 里一条 `[hidden] { display: none !important }` 兜住——条目本身是 grid / flex，组件规则又排在 `site.css` 之后，不加 `!important` 就得每个组件页重述一遍。神器模组页检索期间三档并排对照关系失效，清空即恢复。

**`.toolbar` 带 `data-cols` 时走列组模式**（武器框架页），搜索与分节 chip 整块不建：chip 文字取自表头的 `data-g`（属性值，不是正文，不进保真比对），开关落成一张内建样式表按列序下的 `display: none`。**同一列要下两条规则**——合并行没有 `<th>`，序号整体前移一位，只下一条会让合并行错位隐藏。`data-solo` 里的组一次只开一组。

## 验证

仓库无测试框架，不要引入。验证靠三样：

1. **生成器自检 + `check_shell.py` + `check_terms.py`** — 结构、外壳、术语与着色的主闸门，见上。
2. **headless Chrome 截图** — Chrome Beta 未安装，chrome-devtools MCP 不可用。用：
   ```bash
   ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --hide-scrollbars --no-first-run --user-data-dir=<临时目录> --window-size=W,H \
     --screenshot=<out.png> "file://<绝对路径>" >/dev/null 2>&1 &)
   ```
   模组页有 163 张图，必须后台起进程再轮询产物，前台调用会超时。用 `sips -c H W --cropOffset Y X` 裁剪长图看局部。
3. **JS 行为断言** — 在 scratchpad 写断言页（复制生成物 + 追加 `<script>`，结果写进 `<pre>`），用 `--dump-dom` 取回。断言页留在 scratchpad，不进仓库。

**第 2、3 条起浏览器，两条红线**：

- **用户明确授权才起**。默认只跑第 1 条闸门，把改动说清楚；需要看渲染效果就先问，得到「跑」再起进程。chrome-devtools MCP 同此规矩。
- **拿到产物立刻收进程**。`--user-data-dir` 每次给一个独占的临时目录，收尾按这个目录精确回收，不误杀别的实例：
  ```bash
  pkill -9 -f "user-data-dir=<那个临时目录>"
  ```
  一次截图起 1 个主进程加数十个 helper，不收就是孤儿；收完 `pgrep -ifl chrome` 确认为空。

headless Chrome 无法滚动视口，`--dump-dom` 与 `--screenshot` 都不行。滚动类行为靠断言其配置来验证：`position`、`top` 解析值、底色不透明、祖先链无 overflow 容器、`scroll-margin-top`。

## 工作流

solo 项目。直接提交到 `main`，非指定不开分支。提交前跑一遍三个生成器、`check_shell.py`、`check_terms.py` 与 `ruff check` + `pyright`。push 只在明确要求时做。
