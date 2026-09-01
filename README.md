# destiny2-starside

Destiny 2 资料台，纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。

## 结构

```
index.html                        导航首页（CloudBase 默认入口）
assets/
  site.css                        共用：字体、主题 token、22 个配色 token 与工具类、
                                  导航条、工具条、资料页骨架（版心 / .block / .gen /
                                  八档色阶）、首页、页脚
  app.js                          工具条构建、搜索过滤、当前分节高亮、首页全站搜索
  search.js                       全站搜索索引（由 tools/build-search.py 生成，勿手改）
  favicon.svg                     菱形站点标记
  fonts/chakra-petch-{600,700}.woff2   显示字体（Google Fonts latin 子集，各约 10 KB）
  fonts/OFL.txt                   Chakra Petch 许可（SIL OFL 1.1）
armor-sets/
  index.html                      护甲套装效果（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
  icons/*.png                     110 枚效果图标（56px，共 114 KB）
artifact-mods/
  index.html                      神器模组组件（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
  icons/*.webp                    133 个模组图标
ammo/
  index.html                      弹药生成机制（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
boss-hp/
  index.html                      首领生命值（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
weapon-frames/
  index.html                      武器框架（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
  icons/*.webp                    121 枚框架、示例武器与勇士图标（49px，共 104 KB）
twisted-planet/
  index.html                      扭曲星球速查表（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
power-delta/
  index.html                      压光伤害（由转换脚本生成，勿手改）
  style.css                       该组件专属样式与折线图版式
elements/
  index.html                      职业分支详解总览（由转换脚本生成，勿手改）
  style.css                       六个元素页共用的版式（子页面由 shell.py 自动引）
  {arc,solar,void,stasis,strand,prismatic}/
    index.html                    六个元素页（由转换脚本生成，勿手改）
    style.css                     只有一行 --accent：本页的元素色相
    icons/*.webp                  该页图标，按内容哈希命名（六页共 398 枚）
references/
  artifact-mods.md                神器模组页源稿
  armor-sets.md                   护甲套装页源稿
  docs/*.md                       通用资料文档源稿（一篇一页）
tools/markup.py                   源稿方言：着色标记、键值行、分段
tools/shell.py                    站点外壳：head、导航条、页脚
tools/convert-artifact-mods.py    源稿 → 神器模组页
tools/convert-armor-sets.py       源稿 → 护甲套装页
tools/convert-doc.py              源稿 → 通用资料页
tools/build-search.py             各页产出 → assets/search.js
tools/check_shell.py              各页外壳一致性闸门
tools/check_terms.py              术语正名、着色 token、更新时间、更新日志类型闸门
```

资料页全部由生成器产出，只有首页 `index.html` 手写。改文案改源稿，改结构改生成器的 `render()`。

页面之间用显式相对路径互链（`../artifact-mods/index.html`），不依赖静态托管的目录索引解析。资源引用同样用相对路径——站内绝对路径在 `file://` 下会指向磁盘根目录，双击打开即丢样式。

## 本地预览

```bash
npm start          # npx serve . -l 3000
```

## 部署与缓存

托管在腾讯云 CloudBase 静态网站托管，发布走 `python3 tools/deploy.py`。

**只发改过的文件。**站上 3859 个文件里 3735 个是图标，文件名即内容哈希、改内容
必然换名，整目录重发就是把不会变的那批又传一遍（一次 47 秒）。上次发到哪个 commit
记在 `.git` 的 `refs/deploy` 上，与 HEAD 一 diff 即得清单，改过的那几个复制进临时
目录，一次 `tcb hosting deploy` 发上去；源稿、生成器、云函数与 markdown 不上传。

```bash
python3 tools/deploy.py            # 发改动
python3 tools/deploy.py --dry-run  # 只列要发什么
python3 tools/deploy.py --all      # 整站重发，首次部署或对不上账时用
```

工作区不干净时拒发：产出与源稿对不上就先按审核台那枚「构建并提交」。远端删文件
由脚本按 diff 里的删除项发 `tcb hosting delete`。`tcb` 失败时 `refs/deploy` 不动，
改完重跑即可。

缓存在控制台按**文件后缀 / 文件夹路径 / 具体文件**三种方式匹配，输出的就是 `Cache-Control: max-age=<秒>`，分浏览器缓存与节点缓存两层。

**错误文档指向 `404.html`。**控制台「静态网站托管 → 基础配置」里，索引文档填 `index.html`，错误文档填 `404.html`；不填时挪走的页面返回 COS 的 `NoSuchKey` XML。`404.html` 只有一行 `meta refresh`，把旧链接送回首页。

**长缓存只给文件名带内容标识的资源。**控制台上传会自动刷新节点缓存，但已经发到读者浏览器里的缓存收不回来——同名文件换了内容，读者就得等缓存过期才看得到新的。

应设置的规则：

| 匹配 | 浏览器缓存 | 换内容时会怎样 |
|---|---|---|
| 后缀 `.webp` | 1 年 | 文件名是内容哈希，改内容必然换名，读者立刻拿到新图 |
| 后缀 `.png` | 7 天 | 只有 `armor-sets/icons` 是 PNG，序号命名，同名替换后最多 7 天全员生效 |
| 文件夹 `/assets/fonts` | 1 年 | 同名替换会让读者看一年的旧字体，**换字体必须连带改文件名** |
| 后缀 `.css`、`.js` | 5 分钟 | 5 分钟内生效 |
| 后缀 `.html` | 0 | 立刻生效 |

**图片按后缀匹配，不逐个目录列。**24 个 `icons/` 目录合计 5.85 MB，逐个列会让每加
一页就得回来登记一次，漏登记的那些回访时重下（这张表曾只覆盖 4 个目录、约 800 KB，
另外 8 MB 在规则外）。按后缀一条盖住全部，新增页面自动生效。

**两条后缀规则不重叠，所以不依赖控制台的规则顺序。**哈希命名的那批全是 `.webp`，
序号命名的那批全是 `.png`，各归各的后缀。写成「`.png` 也给一年、再拿文件夹规则盖回
7 天」就要赌控制台按什么顺序匹配——那是列表优先级，不是选择器特异性，赌错了
`armor-sets` 的图会被缓存一年。

控制台在「静态网站托管 → 缓存配置」，一条规则填一行，多个值用**分号**分隔，
时间填秒（上限 365 天）。照着填：

| 类型 | 内容 | 秒 |
|---|---|---|
| 文件后缀 | `.webp` | `31536000` |
| 文件后缀 | `.png` | `604800` |
| 文件夹 | `/assets/fonts` | `31536000` |
| 文件后缀 | `.css;.js` | `300` |
| 文件后缀 | `.html` | `0` |

### 换图

**除 `armor-sets/icons/` 外，各页图标目录都不要原地覆盖。**文件名是内容的 md5 前 10 位，`markup.Icons.html()` 每次转换都复核一遍，对不上就中止并报出正确的名字。换图三步：

1. 把新图按新哈希存进 `icons/`（跑一次生成器，报错信息里就有该用的文件名）
2. 改源稿里引用它的那一处（神器模组页的「图标：」一行，其余页表格里的 `![](icons/…)`）
3. 删掉旧文件，重跑生成器确认退出码 0

这条纪律不是洁癖：它是那一年缓存成立的前提。原地覆盖会让读者看一年的旧图，而控制台刷新只清得掉节点缓存。

**`armor-sets/icons/`——原地覆盖即可**，最多 7 天全员生效。这一批只在换了英文原表、重跑 `--icons` 时整体重抽，不单张替换。要立刻生效就临时把该目录的缓存调短，等新图铺开再调回来。

**不要为了 CSS/JS 引入文件名哈希。**两者合计 8 KB gzip，与 HTML 的重新验证走同一个连接、同一轮往返，改成长缓存省不出可测量的时间，却要给生成器加一层重写引用的机制。同理，`armor-sets/icons` 的序号命名是可读的（`001.png` 即文档里第一条效果），换成哈希会丢掉这个性质，为 114 KB 不值得——7 天缓存已经覆盖绝大多数回访。

## 视觉体系

外壳全部去饱和为骨白／石墨发丝线，整页唯一的饱和色来自游戏自身的元素编码（电弧青、烈日橙、虚空紫…）。新增界面元素沿用这条线：外壳不与数据争夺注意力。

字体分三个角色，`site.css` 的 `--font-*` 定义：

| 角色 | 变量 | 覆盖范围 |
|---|---|---|
| 显示、标签、档位、数据摘要 | `--font-disp` | Chakra Petch（自托管，仅含拉丁）→ PingFang SC |
| 中文标题 | `--font-cn` | PingFang SC |
| 正文与数字 | `--font-body` | 等宽字族 → PingFang SC |

`--font-disp` 与 `--font-body` 都靠浏览器按字符逐族回退：拉丁与数字取前一族的字面，中文自动落到 PingFang，不需要拆标签。正文首选等宽字族即为此——模组数值（`405`、`7.15%`、`0.0265%`）取等宽字面，配合 `font-variant-numeric: tabular-nums` 纵向对齐。

字距只施加于拉丁与数字。中文本身是等宽方块，`.sect-label` 这类可能是纯中文的位置用 `.2em` 封顶。

## 新增一个组件

普通资料文档不必新建组件——写一篇 markdown 丢进 `references/docs/`，建好 `<slug>/style.css`，跑 `python3 tools/convert-doc.py`，再去首页加卡片即可。下面这套只在需要一种全新数据形状（像三档并排对照）时才走。

1. 建目录 `<组件名>/`，放 `style.css`，写一个生成器产出 `index.html`。外壳（head、导航条、页脚）从 `tools/shell.py` 取，行内标记从 `tools/markup.py` 取，生成器只写自己那种数据形状的结构层。
2. 页面骨架照 `artifact-mods/index.html`：
   - `<div class="site-head">` 包住 `<nav class="site-nav">` 与 `<div class="toolbar"></div>`，整块 sticky。
   - `<header class="page-head">` 放 h1，`<main>` 放正文，`<footer class="site-foot">` 收尾。
   - 需要工具条就引 `<script src="../assets/app.js" defer></script>`。`app.js` 从 DOM 读取分节与其标题，构建搜索框与跳转 chip，并把 `.site-head` 实测高度写回 `--stick`。工具条不在 HTML 里写任何源文本。选择器缺省是神器模组页那一套（`.artifact` / `.mod` / `.mod-row` / `.art-head h2`），换一套结构就在 `.toolbar` 上写 `data-section` / `data-item` / `data-label` / `data-noun` / `data-chip-label`，参见 `armor-sets/index.html`。
3. 着色文字用 `site.css` 里的语义 class（`.el-arc` `.enemy` `.note` 等），不写内联 `style="color:…"`。
4. 分节内需要 sticky 表头时，把表头包进 `position: sticky; top: var(--stick)` 的容器，底色取不透明的 `--ink-lift`，并给分节 `scroll-margin-top: var(--stick)`。
5. 首页 `index.html` 的 `.entries` 里加一条 `<li><a class="entry">`，卡片上的更新时间与页脚必须一致（`check_terms.py` 比对）。
6. 不要在承载 sticky 表头的祖先上开 `overflow`。一旦祖先成为滚动容器，其内部的 `position: sticky` 不再相对视口生效。横向溢出交给页面本身，用 `body { min-width: … }` 表达最小内容宽度。

## 更新神器模组

内容源是 `references/artifact-mods.md`。改文案就改这份 markdown，然后重跑：

```bash
python3 tools/convert-artifact-mods.py
```

源稿格式：`## ` 起分节、`### 档位 · 名称` 起模组，空行分段，段内换行落成 `<br>`。着色写成 `{token|文字}`，token 即 `site.css` `:root` 里的语义名，可嵌套。结构信息走「键：值」行——`副标题`、`小标题`、`标题`、`徽章`、`括注`、`图标`、`标签`、`标签（站点补充）`。

`标签（站点补充）` 与 `标签` 的区别只在产出侧留痕：前者带 `data-source="site"`，标明该分节的标签不来自原表格。同一分节两者只能写一个。

图标已压在 `artifact-mods/icons/` 里，按内容哈希命名，生成器按文件名引用，宽高从文件头现读。

自检覆盖的项与当前期望值：

| 项 | 期望 | 说明 |
|---|---|---|
| 分节数 | 7 | 神器件数 |
| 模组数 | 147 | 7 分节 × 7 行 × 3 档 |
| 图标引用数 | 156 | 147 模组 + 7 神器徽章 + 2 使用限制徽章 |
| 图标文件数 | 133 | 按内容哈希去重后 |
| span 开闭 | 相等 | |
| 残留内联样式 | 0 | 表现层声明全部归 CSS |
| 未转换的着色标记 | 0 | |
| 「键：值」行条数 | 逐块核对 | 正文里真出现这样一行会被静默吃掉，数目不符即中止 |

结构变化（例如某行不足三档）由 `rows_of()` 当场报错；计数变化改文件头的 `N_*` 常量，不要放宽比对。

## 更新护甲套装

内容源是 `references/armor-sets.md`——Flamia 的中文人工翻译稿，按 7 个分类重排过，数值已逐条对照英文原表核对。改文案就改这份 markdown，然后重跑：

```bash
python3 tools/convert-armor-sets.py
```

英文原表（Destiny Data Compendium 的 Google 表格导出）不入库：21 MB、大半是内嵌字体，且正文一个字都不取自它。它只在两种场合用到——核对数值、重抽图标：

```bash
python3 tools/convert-armor-sets.py --icons <英文原表导出.html>
```

图标按 markdown 文档顺序编号 `001.png … 112.png`，生成器按序号引用，不建映射表。原图 70×70 纯白剪影 + alpha，三个色通道恒为白，丢掉彩色通道无损；再降到 56px、alpha 量化到 16 档，112 枚合计 238 KB → 114 KB。中英两侧的套装靠效果名对应，52 个直接对上，余下 4 个写在 `MANUAL_PAIRS` 里按来源认领。

自检覆盖的项与当前期望值：

| 项 | 期望 | 说明 |
|---|---|---|
| 分类数 | 7 | 目的地／先锋／熔炉竞技场／智谋／突袭／地牢／活动 |
| 套装数 | 56 | |
| 效果数 | 112 | 每套装一条 2 件加一条 4 件 |
| 图标引用数 | 110 | 另 2 处英文原表本身就是空白占位 |
| 词表死配置 | 0 | `GLOSSARY` 里一次都没命中的词即报错 |
| 嵌套着色 span | 0 | 嵌套说明 `INLINE` 的分支顺序被改坏了 |

正文保真是主闸门：产出剥掉标签后与源稿逐字相等，两侧同样去空格、去 `*` 与反引号与 `“”`（这些标记在页面上由字重与颜色承担，不落成字符）。行内正则吃掉一个数字这类事故会当场暴露。

着色走词表（`GLOSSARY`），token 全部复用 `site.css` 既有的，不新增渲染色。`INLINE` 的分支顺序即优先级，`GLOSSARY` 内部长词必须在前。

## 改配色

只有一处定义：`assets/site.css` 的 `:root`（22 个语义 token → 渲染色）。源稿里的着色 token 直接引用这些名字，改渲染色只改右值，生成器不必重跑。渲染色共 11 个槽位（7 个元素色相 + 能量球金 + 生命红 + 批注色 + 术语暖沙），元素色相是游戏的既有编码、属于内容，只调亮度不改色相。同一处还有外壳叠色 `--tint-*`、UI 强调色 `--accent` 与版心 `--wrap` / `--min`。

**同一个术语只落到同一个 token 上，同一个颜色不给第二个名字。**两条由 `tools/check_terms.py` 钉住——`--el-solar` 与 `--deb-solar` 渲染色相同，着成哪个用眼睛看不出来。

`--note`（作者注释）与 `--unsure`（`[?]` 待测数值）共用 `--c-aside`，字重回到正文、`.unsure` 带虚下划线——它们读作限定语，不是警报。

## 档位表头

档位用 CSS 绘制的三枚菱形表示（`.rhombi` 的 `<i>`，点亮枚数 = 档位），档位文字由 `.tier-head::after` 的 `content` 生成。二者都不进 HTML 文本，因此不参与保真比对。不要用 `⯁`（U+2BC1）这类字形表达档位：该字符在中文字体栈下无字形，整条表头会渲染为空带。
