# destiny2-starside

Destiny 2 资料台，纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。

## 结构

```
index.html                        导航首页（CloudBase 默认入口）
assets/
  site.css                        共用：字体、主题 token、23 个配色 token 与工具类、
                                  导航条、工具条、首页、页脚
  app.js                          工具条构建、搜索过滤、当前分节高亮
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
  icons/*.png                     133 个模组图标
ammo/
  index.html                      弹药生成机制（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
references/
  artifact-mods.md                神器模组页源稿
  armor-sets.md                   护甲套装页源稿
  docs/*.md                       通用资料文档源稿（一篇一页）
tools/convert-artifact-mods.py    源稿 → 神器模组页
tools/convert-armor-sets.py       源稿 → 护甲套装页
tools/convert-doc.py              源稿 → 通用资料页
tools/check_shell.py              四页外壳一致性闸门
```

三个资料页全部由生成器产出，只有首页 `index.html` 手写。改文案改源稿，改结构改生成器的 `render()`。

页面之间用显式相对路径互链（`../artifact-mods/index.html`），不依赖静态托管的目录索引解析。资源引用同样用相对路径——站内绝对路径在 `file://` 下会指向磁盘根目录，双击打开即丢样式。

## 本地预览

```bash
npm start          # npx serve . -l 3000
```

## 部署与缓存

托管在腾讯云 CloudBase 静态网站托管。缓存在控制台按**文件后缀 / 文件夹路径 / 具体文件**三种方式匹配，输出的就是 `Cache-Control: max-age=<秒>`，分浏览器缓存与节点缓存两层。

**长缓存只给文件名带内容标识的资源。**控制台上传会自动刷新节点缓存，但已经发到读者浏览器里的缓存收不回来——同名文件换了内容，读者就得等缓存过期才看得到新的。

应设置的规则：

| 匹配 | 浏览器缓存 | 理由 |
|---|---|---|
| 文件夹 `/artifact-mods/icons` | 1 年 | 文件名是内容哈希，改图必改名，永远不会发脏 |
| 文件夹 `/assets/fonts` | 1 年 | 字体文件不会在同名下改内容 |
| 文件夹 `/armor-sets/icons` | 7 天 | 序号命名（`001.png`），换图不换名 |
| 后缀 `.css`、`.js` | 5 分钟 | 没有内容哈希，发版后要尽快换新 |
| 后缀 `.html` | 0 | 内容随时改，每次都重新验证 |

前两条覆盖约 610 KB，回访时完全不再请求。

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

1. 建目录 `<组件名>/`，放 `style.css`，写一个生成器产出 `index.html`。页面 `<head>` 里先 `<link rel="stylesheet" href="../assets/site.css">`，再 link 组件自己的 CSS。
2. 页面骨架照 `artifact-mods/index.html`：
   - `<div class="site-head">` 包住 `<nav class="site-nav">` 与 `<div class="toolbar"></div>`，整块 sticky。
   - `<header class="page-head">` 放 h1，`<main>` 放正文，`<footer class="site-foot">` 收尾。
   - 需要工具条就引 `<script src="../assets/app.js" defer></script>`。`app.js` 从 DOM 读取分节与其标题，构建搜索框与跳转 chip，并把 `.site-head` 实测高度写回 `--stick`。工具条不在 HTML 里写任何源文本。选择器缺省是神器模组页那一套（`.artifact` / `.mod` / `.mod-row` / `.art-head h2`），换一套结构就在 `.toolbar` 上写 `data-section` / `data-item` / `data-row` / `data-label` / `data-noun` / `data-chip-label`，参见 `armor-sets/index.html`。
3. 着色文字用 `site.css` 里的语义 class（`.el-arc` `.enemy` `.note` 等），不写内联 `style="color:…"`。
4. 分节内需要 sticky 表头时，把表头包进 `position: sticky; top: var(--stick)` 的容器，底色取不透明的 `--ink-lift`，并给分节 `scroll-margin-top: var(--stick)`。
5. 首页 `index.html` 的 `.entries` 里加一条 `<li><a class="entry">`。
7. 把新页面加进 `tools/check_shell.py` 的 `PAGES`，外壳才受闸门保护。
6. 不要在承载 sticky 表头的祖先上开 `overflow`。一旦祖先成为滚动容器，其内部的 `position: sticky` 不再相对视口生效。横向溢出交给页面本身，用 `body { min-width: … }` 表达最小内容宽度。

## 更新神器模组

内容源是 `references/artifact-mods.md`。改文案就改这份 markdown，然后重跑：

```bash
python3 tools/convert-artifact-mods.py
```

源稿格式：`## ` 起分节、`### 档位 · 名称` 起模组，空行分段，段内换行落成 `<br>`。着色写成 `{token|文字}`，token 即 `site.css` `:root` 里的语义名，可嵌套。结构信息走「键：值」行——`副标题`、`小标题`、`标题`、`徽章`、`括注`、`图标`、`标签`、`标签（站点补充）`。

`标签（站点补充）` 与 `标签` 的区别只在产出侧留痕：前者带 `data-source="site"`，标明该分节的标签不来自原表格。同一分节两者只能写一个。

图标已压在 `artifact-mods/icons/` 里，按内容哈希命名，生成器按文件名引用，宽高从 PNG 的 IHDR 现读。

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

只有一处定义：`assets/site.css` 的 `:root`（23 个语义 token → 渲染色）。两份 markdown 源稿里的着色 token 直接引用这些名字，改渲染色只改右值，生成器不必重跑。渲染色共 10 个槽位，元素色相是游戏的既有编码、属于内容，只调亮度不改色相。

`--note`（作者注释）与 `--unsure`（`[?]` 待测数值）共用 `--c-aside`，字重回到正文、`.unsure` 带虚下划线——它们读作限定语，不是警报。

## 档位表头

档位用 CSS 绘制的三枚菱形表示（`.rhombi` 的 `<i>`，点亮枚数 = 档位），档位文字由 `.tier-head::after` 的 `content` 生成。二者都不进 HTML 文本，因此不参与保真比对。不要用 `⯁`（U+2BC1）这类字形表达档位：该字符在中文字体栈下无字形，整条表头会渲染为空带。
