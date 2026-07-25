# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无测试框架、无打包器。

## 命令

```bash
npm start                                     # npx serve . -l 3000

# 重新生成神器模组页（源导出存在 git 里）
git show 003317d:artfactmods/index.html > /tmp/sheet-export.html
python3 tools/convert-artifact-mods.py /tmp/sheet-export.html artifact-mods/

ruff check tools/convert-artifact-mods.py     # 改完 Python 跑这两条
pyright tools/convert-artifact-mods.py
```

`ruff format` 会重排 `convert-artifact-mods.py`，但该文件从未按 ruff 格式写过（`git show HEAD:` 同样报 would reformat）。只跑 `ruff check`，不跑 `ruff format`。

## 生成物与保真自检

`artifact-mods/index.html` 由 `tools/convert-artifact-mods.py` 生成，**不手改**。要改这一页的结构就改 `render()`，然后重跑脚本。

脚本的 `check()` 是本仓库最重要的约束，它保证 147 个模组的文本与源表格逐字一致：

1. **单元格文本比对** — 源导出每个非空 `<td>` 的文本，都要在 `units` 里对应到一个块。
2. **全文字符多重集比对** — 比对窗口是 `out.find('<header')` 到 `out.rindex('</main>')`。
3. **一组计数断言** — 分节 7、模组 147、图标引用 156、图标文件 133、着色 span 1176、产出着色 span 1147、描述段落 366、色值 51、残留内联样式 0 等。

两道比对都**不把空格当内容**：中文里的空格是表格导出的产物，由 `tidy()` 清掉。改任何一侧的口径都要两侧一起改。

由此推出改 `render()` 时的规则：

- **可以**自由重排、重新嵌套标签。两道比对都是多重集，顺序无关。
- **不能**增删任何源文本。
- 新增的外壳文字（导航、页脚、按钮）必须落在比对窗口外——`<header class="page-head">` 之前或 `</main>` 之后。
- 分节内的外壳文字（如档位标签）用 CSS `content` 生成，不进 HTML 文本。
- 改了徽章数、图标数一类的结构，同步改 `check()` 里的常量，不要放宽比对。
- 源导出与产出都含 42 个 `⯁`，`check()` 先断言计数再从两侧移除。新增类似的"两侧恰好抵消"的字符时照此显式处理。
- 页首取源表格的副标题作 h1，源 `<h1>` 不显示，`check()` 从源侧按解析结果扣除，扣多了出现负计数即报错。站点补充的 `EXTRA_TAGS` 反向处理：从产出侧按 `data-source="site"` 整块剥离并核对块数。**不要**为了让比对通过而放宽这两处，扣除量必须来自 `parse()` 实际读到的字符串。

改动后必须重跑脚本并确认退出码 0，且 `git status --porcelain artifact-mods/icons/` 为空。

## 排版规整层：tidy() 与 paras()

源表格把空格塞进着色 span、塞在中文标点两侧，还用连续 `<br>` 撑段距。`tidy()` 把这些搬正，`paras()` 把双 `<br>` 还原成真正的段落。这一层只搬空白与标签边界：

- `tidy()` 跑到不动点为止——移出句号会重新露出尾随空格，四条规则互相制造新的匹配位置。
- `tidy()` 与 `paras()` 都断言 `chars_of()`（去空格的文本视图）前后逐字相等。**新增规则必须过这道断言**，改不动就是这条规则动了文本，属于修订层的事。
- 着色 span 只覆盖词本身：空白、句读、换行一律移出 span，剥空剩下的壳。
- `paras()` 只在着色 span 之外断段——span 内部也有双换行，从那里切会切出未闭合标签。

## 站点补充内容

源表格缺的分节标签写在脚本的 `EXTRA_TAGS`（键为分节序号）。产出侧带 `data-source="site"`，`check()` 在字符比对前按标记整块剥离并核对块数——源表格内容仍逐字比对，补充范围由块数锁死。

两道护栏会中止转换：某分节源表格已带标签又写了补充；剥离块数与 `len(EXTRA_TAGS)` 对不上。

## 配色的两处契约

改配色改两处并保持一致：

- `tools/convert-artifact-mods.py` 的 `COLOR_MAP`：51 个源色值 → 23 个语义 token。
- `assets/site.css` 的 `:root`：23 个 token → 7 个元素色相 + 3 个机制色 + `--c-term`。

**色相只发给元素。**不属于任何元素的游戏术语（`--enemy` 战斗人员/勇士/精英、`--pickup` 元素拾取物/技能能量/护盾）走 `--c-term`，只提亮度与字重。给它们色相就要从元素那里借一个，借来的色相会让「颜色即元素编码」失效。机制色 `--c-orb`／`--c-health`／`--ammo-heavy` 是例外：它们在游戏内本来就是那个颜色。

元素色相是游戏的既有编码、属于内容，只调亮度不改色相。`--note`（作者注释）与 `--unsure`（`[?]` 待测值）共用 `--c-aside`，字重回到正文，`.unsure` 带虚下划线。

## 视觉体系

外壳全部去饱和为骨白／石墨发丝线，**整页唯一的饱和色来自游戏自身的元素编码**。新增界面元素沿用这条线：不给外壳加彩色、不加发光边框与投影。着色文字统一 `font-weight: 600`、无 `text-shadow`。

字体三个角色（`site.css` 的 `--font-*`）：显示层 Chakra Petch（自托管 latin 子集，24 KB）、中文标题 PingFang、正文与数字等宽字族。`--font-disp` 与 `--font-body` 都靠浏览器按字符逐族回退：拉丁与数字取前一族字面，中文自动落到 PingFang，不需要拆标签。

字距只施加于拉丁与数字。`.sect-label` 这类可能是纯中文的位置用 `.2em` 封顶。

不要用字形表达图形语义（档位、装饰）。`⯁`（U+2BC1）在中文字体栈下无字形，`◈`（U+25C8）在 serif 下无字形。图形一律 CSS 绘制，见 `.rhombi`。

## 布局约束

- **不要在 sticky 元素的祖先链上开 `overflow`。** 一旦祖先成为滚动容器，其内部 `position: sticky` 不再相对视口生效，且滚动条会落在约 20000px 高元素的底部、实际不可达。横向溢出交给页面本身，用 `body { min-width: … }` 表达最小内容宽度。
- **`.mod` 必须按 `data-tier` 钉 `grid-column`，模组必须按行包在 `.mod-row` 里。** 纯靠行主序自动布局时，搜索隐藏任一模组会让其后所有模组列位偏移（三级会落到一级列）。
- 分节 sticky 单元贴 `top: var(--stick)`，底色取不透明的 `--ink-lift`，分节带 `scroll-margin-top: var(--stick)`。`--stick` 由 `app.js` 按 `.site-head` 实测高度写回。
- **不做窄屏适配**，这是明确取向。不新增断点、不做三档纵向堆叠。`:focus-visible` 与 `prefers-reduced-motion` 属于质量底线，保留。

## assets/app.js

工具条（搜索框、7 件神器跳转 chip）从 DOM 读取分节标题构建，**不在 HTML 里写任何源文本**——写了就等于页面出现源表格文本的第二份副本，保真自检立即报重复。

搜索按 `.mod` 的 `textContent` 过滤，整行不命中隐藏 `.mod-row`，整节不命中隐藏 `.artifact` 与其 chip。检索期间三档并排对照关系失效，清空即恢复。

## 验证

仓库无测试框架，不要引入。验证靠三样：

1. **生成器自检** — 内容保真的主闸门，见上。
2. **headless Chrome 截图** — Chrome Beta 未安装，chrome-devtools MCP 不可用。用：
   ```bash
   ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --hide-scrollbars --no-first-run --user-data-dir=<临时目录> --window-size=W,H \
     --screenshot=<out.png> "file://<绝对路径>" >/dev/null 2>&1 &)
   ```
   模组页有 163 张图，必须后台起进程再轮询产物，前台调用会超时。用 `sips -c H W --cropOffset Y X` 裁剪长图看局部。
3. **JS 行为断言** — 在 scratchpad 写断言页（复制生成物 + 追加 `<script>`，结果写进 `<pre>`），用 `--dump-dom` 取回。断言页留在 scratchpad，不进仓库。

headless Chrome 无法滚动视口，`--dump-dom` 与 `--screenshot` 都不行。滚动类行为靠断言其配置来验证：`position`、`top` 解析值、底色不透明、祖先链无 overflow 容器、`scroll-margin-top`。

## 工作流

solo 项目。直接提交到 `main`，非指定不开分支。提交前跑一遍生成器自检与 `ruff check` + `pyright`。push 只在明确要求时做。
