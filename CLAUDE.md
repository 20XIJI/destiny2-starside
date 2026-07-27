# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无测试框架、无打包器。

三个资料页全部由生成器从 `references/` 下的 markdown 源稿产出，**产出一律不手改**：改文案改 markdown，改结构改生成器的 `render()`，两种情况都重跑脚本。只有首页 `index.html` 是手写的。

**视觉与排版规范在 `design.md`。**本文件写机制与验证，不重复设计规则。

## 站点骨架

首页 `index.html` 手写，每个资料页在首页有一张 `.entry` 卡片（更新时间写卡片上的 `.entry-stamp`）。新增资料页要同时加卡片，否则页面没有入口。

样式分两层，每页都按这个顺序引：`assets/site.css`（全站 token、外壳、字体）在前，本页 `<页目录>/style.css`（版心与本页组件）在后。`assets/app.js` 只有带 `.toolbar` 的页面需要引。

`serve.json` 关掉了 `cleanUrls`，站内链接一律写全 `xxx/index.html`。

`references/` 入库的是源稿：`artifact-mods.md`、`armor-sets.md`，以及 `docs/` 下的资料文档。`armor_transcription.*` 是转写中间产物，已 gitignore，不当源稿用。

## 命令

```bash
npm start                                     # npx serve . -l 3000

python3 tools/convert-artifact-mods.py        # 源稿 references/artifact-mods.md
python3 tools/convert-armor-sets.py           # 源稿 references/armor-sets.md
python3 tools/convert-doc.py [slug]           # 源稿 references/docs/*.md，省略 slug 即全部
python3 tools/check_shell.py                  # 四页外壳一致性

ruff check tools/*.py                         # 改完 Python 跑这两条
pyright tools/*.py
```

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

跟神器模组页的分工不同：那边的源是嵌套 span 的乱麻，必须有逐字保真闸门加一层文本修订；这边的源是干净 markdown，转换本身即保真，所以没有 `revise()` 那一层——**改文案就是直接改 markdown**，git diff 即变更记录，不设补丁表。

`check()` 的闸门：

1. **正文逐条保真** — 产出剥掉标签后与源稿逐字相等。两侧同样归一化：去空格，去 `*`、反引号、`“”`（这些标记在页面上由字重与颜色承担，不落成字符）。
2. **计数断言** — 分类 7、套装 56、效果 112、图标引用 110（另 2 处英文原表本身就是空白占位）、每个套装恰好一条 2 件加一条 4 件。
3. **词表体检** — `GLOSSARY` 里一次都没命中的词即死配置，当场报出。不写死每个词的命中数：源稿是要持续编辑的，写死会让每次改句子都误报。
4. **着色 span 不得嵌套** — 嵌套说明 `INLINE` 的分支顺序被改坏了。

### 行内着色

中文稿是纯文本。英文原表的着色只附在英文 span 上，且中文稿已重写重排，span 级别搬不过来（1147 个着色 span 里只有 919 个落在已知色上，`#cccccc` 连标点和 `On`/`While` 都染，语义不可靠）。所以按 `design.md`「术语以页内自洽为准」改用**词表着色**，token 全部复用 `site.css` 既有的，不新增渲染色。

`INLINE` 是一趟正则走完的分支表，**顺序即优先级**：`**粗体**` → 反引号代码 → `“buff 名”` → `[?]` 待测 → `[数值]` PvP → 数值位上的 `?` → `GLOSSARY` 词表。引号在前保证 buff 名整体一个颜色，不会被词表再切一刀。`GLOSSARY` 内部必须长词在前（`能量球` 先于 `能量`、`重型弹药` 先于 `弹药`）。

否定前缀 `非` 与后面的术语构成一个复合术语（非首领战斗人员＝一类敌人，非超能＝一种状态），一并着色——留在着色外面会让扫读的人读到反义。`除非`、`而非` 里的 `非` 不构词，由后顾断言 `(?<![除而])` 排除。谓语性的否定（`尚无灼烧层数`）不算构词，术语照常单独着色。

### 重抽图标

图标已压好在 `armor-sets/icons/001.png … 112.png`，按 markdown 文档顺序编号，生成器按序号引用，不建映射表。只有换了英文原表才需要重抽：

```bash
python3 tools/convert-armor-sets.py --icons <英文原表导出.html>
```

原图 70×70、纯白剪影 + alpha，三个色通道恒为白，丢掉彩色通道是无损的；再降到 56px、alpha 量化到 16 档，112 枚合计 238 KB → 114 KB，3× 放大与原图并排看不出差别。中英两侧的套装靠效果名对应（52 个直接对上），余下 4 个英文侧效果名没被机翻覆盖，写在 `MANUAL_PAIRS` 里按来源认领。

## 资料文档页

`tools/convert-doc.py` 是通用的一篇 markdown 一个页面：`references/docs/<slug>.md` → `<slug>/index.html`。加一篇资料就是往 `references/docs/` 丢一个 .md、建好 `<slug>/style.css`、跑一次脚本，再去首页 `index.html` 加卡片。前两个生成器各自绑定一种数据形状（神器/模组/档位、分类/套装/2 件 4 件），这一个不绑，走的是通用文档结构。

排版按 `design.md` 第四节：连续阅读版心 760px 居中，表格 `width: auto` + `margin-inline: auto` 按内容定宽再居中。

### 源稿格式

首行 `# 页面标题`，其后三个「键：值」行：`描述：`（进 meta description 与 og）、`更新：`（`YYYY.M.D`，落在页脚 `.stamp`）、`页脚：`（可选，接在更新时间后面的那句）。

`## ` 起分节（对应 `<section class="block">` + `<h2 class="sect-label">`）。分节之外不许有正文。段内换行落成 `<br>`，空行分段。

| 写法 | 产出 |
|---|---|
| `- 条目` | `<ul><li>` |
| `术语` 换行 `: 定义` | `<dl class="rules"><dt><dd>` |
| `\| 表头 \|` + `\|---\|` + 数据行 | `<table class="gen">`，每行首格是 `<th scope="row">` |
| 表格里再来一行 `\|---\|` | 另起一个 `<tbody>` |
| `**粗**` `*强调*` `[文字](链接)` | `<strong>` `<em>` `<a>`，`http` 开头的自动带 `target="_blank" rel="noopener"` |
| `{token\|文字}` | `<span class="token">`，token 即页面样式表里的类名，可嵌套 |

**一个块的内容整体只有一个 `{标记|…}` 时，class 落在块上，不套 span。** `<th class="t-red">红血</th>` 比套一层 span 干净，`p.note`、`p.formula` 同理。判据是首个标记的闭括号落在块末尾——`{a|白弹} → {b|绿弹}` 是两个标记，照常套 span。

表格的行组分界由 CSS 的 `tbody + tbody` 画，不落成类名。

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

`tools/check_shell.py` 把这些约定钉成闸门：四个页面的 head 元信息、站标、署名、免责声明必须逐字一致，提到 Destiny Data Compendium 就必须用上面那一句，每页都要有格式合规的更新时间。新增资料页时把它加进 `PAGES`。

## 视觉与排版

**规范在 `design.md`，改样式、定颜色、加页面之前先读。**那里写死了色相归属、ΔE 判据、中文空格规矩、版心与外壳的分工。

配色只有一处定义：`assets/site.css` 的 `:root`。两份 markdown 源稿里的着色 token 直接引用这些语义名，改渲染色只改 `:root` 的右值，生成器不必重跑。

## 神器模组页的布局约束

- **`.mod` 必须按 `data-tier` 钉 `grid-column`，模组必须按行包在 `.mod-row` 里。** 纯靠行主序自动布局时，搜索隐藏任一模组会让其后所有模组列位偏移（三级会落到一级列）。
- 分节 sticky 单元贴 `top: var(--stick)`，底色取不透明的 `--ink-lift`，分节带 `scroll-margin-top: var(--stick)`。`--stick` 由 `app.js` 按 `.site-head` 实测高度写回。
- 这一页约 20000px 高、163 张图，所以 `main` 上不能开 `overflow-x`（理由见 `design.md`），横向溢出交给 `body { min-width: 1064px }`。

## assets/app.js

工具条（搜索框、跳转 chip）从 DOM 读取分节标题构建，**不在 HTML 里写任何源文本**——写了就等于页面出现源表格文本的第二份副本，保真自检立即报重复。

选择器由页面在 `.toolbar` 上用 `data-*` 声明，缺省是神器模组页那一套，所以那一页的 HTML 一个字不用改：

| 属性 | 缺省 | 护甲套装页 |
|---|---|---|
| `data-section` | `.artifact` | `.cat` |
| `data-item` | `.mod` | `.set` |
| `data-row` | `.mod-row` | 不给（没有并排的行） |
| `data-label` | `.art-head h2` | `.cat-head span` |
| `data-noun` | 模组 | 套装 |
| `data-chip-label` | 神器 | 分类 |

给了 `data-section` 而不给 `data-row`，行这一层就整个跳过。搜索按条目的 `textContent` 过滤，整行不命中隐藏行，整节不命中隐藏分节与其 chip。神器模组页检索期间三档并排对照关系失效，清空即恢复。

## 验证

仓库无测试框架，不要引入。验证靠三样：

1. **生成器自检 + `check_shell.py`** — 结构与外壳的主闸门，见上。
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

solo 项目。直接提交到 `main`，非指定不开分支。提交前跑一遍两个生成器、`check_shell.py` 与 `ruff check` + `pyright`。push 只在明确要求时做。
