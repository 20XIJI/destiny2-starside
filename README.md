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
artifact-mods/
  index.html                      赛季神器模组组件（由转换脚本生成，勿手改）
  style.css                       该组件专属样式
  icons/*.png                     133 个模组图标
tools/convert-artifact-mods.py    Google Sheets 导出 → 组件页
```

页面之间用显式路径互链（`/artifact-mods/index.html`），不依赖静态托管的目录索引解析。

## 本地预览

```bash
npm start          # npx serve . -l 3000
```

## 视觉体系

外壳全部去饱和为骨白／石墨发丝线，整页唯一的饱和色来自游戏自身的元素编码（电弧青、烈日橙、虚空紫…）。新增界面元素沿用这条线：外壳不与数据争夺注意力。

字体分三个角色，`site.css` 的 `--font-*` 定义：

| 角色 | 变量 | 覆盖范围 |
|---|---|---|
| 显示、标签、档位、数据摘要 | `--font-disp` | Chakra Petch（自托管，仅含拉丁）→ PingFang SC |
| 中文标题 | `--font-cn` | PingFang SC |
| 正文与数字 | `--font-body` | 等宽字族 → PingFang SC |

`--font-disp` 与 `--font-body` 都靠浏览器按字符逐族回退：拉丁与数字取前一族的字面，中文自动落到 PingFang，不需要拆标签。正文首选等宽字族即为此——模组数值（`405`、`7.15%`、`0.0265%`）取等宽字面，配合 `font-variant-numeric: tabular-nums` 纵向对齐。

字距只施加于拉丁与数字。中文本身是等宽方块，`.eyebrow` 与 `.sect-label` 这类可能是纯中文的位置用 `.2em` 封顶。

## 新增一个组件

1. 建目录 `<组件名>/`，放 `index.html`，`<head>` 里先 `<link rel="stylesheet" href="/assets/site.css">`，再 link 组件自己的 CSS。
2. 页面骨架照 `artifact-mods/index.html`：
   - `<div class="site-head">` 包住 `<nav class="site-nav">` 与 `<div class="toolbar"></div>`，整块 sticky。
   - `<header class="page-head">` 放 eyebrow 与 h1，`<main>` 放正文，`<footer class="site-foot">` 收尾。
   - 需要工具条就引 `<script src="/assets/app.js" defer></script>`。`app.js` 从 DOM 读取 `.artifact` 分节与其 `.art-head h2`，构建搜索框与跳转 chip，并把 `.site-head` 实测高度写回 `--stick`。工具条不在 HTML 里写任何源文本。
3. 着色文字用 `site.css` 里的语义 class（`.el-arc` `.enemy` `.note` 等），不写内联 `style="color:…"`。
4. 分节内需要 sticky 表头时，把表头包进 `position: sticky; top: var(--stick)` 的容器，底色取不透明的 `--ink-lift`，并给分节 `scroll-margin-top: var(--stick)`。
5. 首页 `index.html` 的 `.entries` 里加一条 `<li><a class="entry">`。
6. 不要在承载 sticky 表头的祖先上开 `overflow`。一旦祖先成为滚动容器，其内部的 `position: sticky` 不再相对视口生效。横向溢出交给页面本身，用 `body { min-width: … }` 表达最小内容宽度。

## 更新赛季神器模组

模组表的内容源是 Google 表格。表格改动后重新导出，再跑转换脚本覆盖生成：

```bash
python3 tools/convert-artifact-mods.py <导出的.html> artifact-mods/
```

导出方式：Google 表格 htmlview 页面用 SingleFile 保存为单文件 HTML。当前产物对应的源导出留存在 `003317d:artfactmods/index.html`，可用 `git show` 取出重跑。

脚本负责剥离浏览器扩展注入的死 CSS、把 base64 图标外置到 `icons/`、把内联着色转成语义 class，并做结构与文本保真自检。任何解析不上的结构、映射表外的颜色、对不上的计数都直接报错中止，不产出半成品。

自检覆盖的项与当前期望值：

| 项 | 期望 | 说明 |
|---|---|---|
| 分节数 | 7 | 神器件数 |
| 模组数 | 147 | 7 分节 × 7 行 × 3 档 |
| 图标引用数 | 156 | 147 模组 + 7 神器徽章 + 2 使用限制徽章 |
| 图标文件数 | 133 | 按内容哈希去重后 |
| 着色 span 总数 | 1176 | |
| 用到的色值数 | 51 | `COLOR_MAP` 的键 |
| 残留内联样式 | 0 | 表现层声明全部归 CSS |
| 源导出档位表头 `⯁` 数 | 42 | 7 × (1+2+3) |

保真比对两道：导出文件每个非空单元格的文本都要在产出里对应到一个块；全文字符多重集比对，顺序无关，任何丢字都会暴露。比对窗口是「页首 + 正文」，导航条与页脚是站点外壳、不含源文本，落在窗口外。

赛季更替后若计数变化，改 `check()` 里对应的期望值；若结构变化（例如某行不足三档），`rows_of()` 会当场报错，先决定新结构怎么表达再改。

## 改配色

改两处并保持一致：脚本里的 `COLOR_MAP`（51 个源色值 → 23 个语义 token）和 `assets/site.css` 的 `:root`（token → 渲染色）。渲染色共 10 个槽位，元素色相是游戏的既有编码、属于内容，只调亮度不改色相。

`--note`（作者注释）与 `--unsure`（`[?]` 待测数值）共用 `--c-aside`，字重回到正文、`.unsure` 带虚下划线——它们读作限定语，不是警报。

## 档位表头

档位用 CSS 绘制的三枚菱形表示（`.rhombi` 的 `<i>`，点亮枚数 = 档位），档位文字由 `.tier-head::after` 的 `content` 生成。二者都不进 HTML 文本，因此不参与保真比对。不要用 `⯁`（U+2BC1）这类字形表达档位：该字符在中文字体栈下无字形，整条表头会渲染为空带。
