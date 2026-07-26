# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无测试框架、无打包器。

三个资料页：`armor-sets/` 与 `artifact-mods/` 由生成器产出，**不手改**；`ammo/` 是手写页，改 HTML 就是改内容。

**视觉与排版规范在 `design.md`。**本文件写机制与验证，不重复设计规则。

## 命令

```bash
npm start                                     # npx serve . -l 3000

# 重新生成神器模组页（源导出存在 git 里）
git show 003317d:artfactmods/index.html > /tmp/sheet-export.html
python3 tools/convert-artifact-mods.py /tmp/sheet-export.html artifact-mods/

# 重新生成护甲套装页（源稿在 references/armor-sets.md）
python3 tools/convert-armor-sets.py

ruff check tools/*.py                         # 改完 Python 跑这两条
pyright tools/*.py
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

## 三层与各自的闸门

产出经过三层，每层有独立的中止条件，任何一层对不上都不出文件：

```
page = parse(src, icons)
out, units = render(page, prefix)      # 1 排版：只搬空白与标签边界
check(src, out, page, units, icons)    # 保真闸门：源表格逐字比对，规则不放宽
out = revise(out)                      # 2 文本修订：逐条带命中数断言
```

第三层是配色，只在 `assets/site.css` 的 `:root` 改右值，生成器不必重跑。

第 1 层对两道保真比对都不可见（`text_of()` 剥标签、比对忽略空格），所以排版改动**不削弱**保真强度。第 2 层是唯一真正偏离源表格的地方，偏离量由 `tools/text_fixes.py` 穷举锁死。

### 第 1 层：tidy() 与 paras()

源表格把空格塞进着色 span、塞在中文标点两侧，还用连续 `<br>` 撑段距。

- `unwrap_edges()` 把空白、句读、换行移出着色 span，剥掉只剩壳的空 span，**跑到不动点**——移出句号会重新露出尾随空格，规则互相制造新的匹配位置。
- `space_cjk()` 管中文的空格规矩：标点两侧不留空格、汉字之间不分词、括号内侧紧贴。它**只认空格不认换行**，换行是产出的行结构。
- `paras()` 把双 `<br>` 还原成 `<p>`，只在着色 span 之外断段——span 内部也有双换行，从那里切会切出未闭合标签。
- `tidy()` 与 `paras()` 都断言 `chars_of()`（去空格的文本视图）前后逐字相等。**新增规则必须过这道断言**，过不了就是这条规则动了文本，属于第 2 层的事。

### 第 2 层：revise() 与 tools/text_fixes.py

源表格是社区机翻稿：句子不通、术语打架、留着 `%%%` 一类占位符。`check()` 证明源表格的内容一字不少地落到了产出里，`text_fixes.py` 穷举产出在此之上偏离了多少。两者相加才是页面，中间没有第三条改动源文本的路径。

三张表，按 `SUBS` → `DESCS` → `FORBIDDEN` 的顺序施加：

- `SUBS`（全文替换）每条声明期望命中数，数目不符即中止。每条的 `old` 写的是「轮到它时」的文本，**改顺序就要改 `old`**。
- `DESCS`（整条描述改写）键是 `(分节 id, 模组名)`，按 `<h4>` 的**文本**定位而非其标记——有 18 个模组名自带着色。命中数必须为 1。跑在 `SUBS` 之后，写进去的是已经统一过术语的文本，改写掉的内容也就不再扰动 `SUBS` 的命中数。
- `FORBIDDEN` 是常驻术语闸门：改完仍出现即中止。以后新写的文本再引入旧写法会被当场拦下。改术语就要同步往这里加一条，否则统一不住。

其余约束：

- 术语以**页内自洽**为准：取页面内出现次数最多的写法，不对站外事实做断言。例外要在 `text_fixes.py` 的文档字符串里记下依据。
- 改写红线：只改表达与着色范围，**不改数值、不改机制断言、不删原作者的存疑标记（`[?]`）与注释**（`note` 类整句）。
- 重名模组以「最完整的那一份」为基准，其余向它对齐；真有机制差异的保留差异，并在该条的注释里写明。
- 改完文本要重走一遍 `unwrap_edges()` + `space_cjk()`：`tidy()` 跑在修订之前，看不到修订换出来的新相邻关系。这一段同样有 `chars_of()` 断言兜底。

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

### 重抽图标

图标已压好在 `armor-sets/icons/001.png … 112.png`，按 markdown 文档顺序编号，生成器按序号引用，不建映射表。只有换了英文原表才需要重抽：

```bash
python3 tools/convert-armor-sets.py --icons <英文原表导出.html>
```

原图 70×70、纯白剪影 + alpha，三个色通道恒为白，丢掉彩色通道是无损的；再降到 56px、alpha 量化到 16 档，112 枚合计 238 KB → 114 KB，3× 放大与原图并排看不出差别。中英两侧的套装靠效果名对应（52 个直接对上），余下 4 个英文侧效果名没被机翻覆盖，写在 `MANUAL_PAIRS` 里按来源认领。

## 页脚归属

来自 Destiny Data Compendium 的页面，数据源一行**一字不差地照抄这句**：

```html
<p>数据源：<a href="https://docs.google.com/spreadsheets/u/0/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4" target="_blank" rel="noopener">Destiny Data Compendium</a>。本页在其基础上统一了术语、标点与排版，数值未作改动。</p>
```

同一个数据源在不同页面上换着说法写，读者会以为是不同来源。别的数据源另起一句，不套这个模板。

更新时间写在页脚首句句首的 `<span class="stamp">`，格式 `更新 YYYY.M.D`；首页则写在每张卡片的 `.entry-stamp` 上。

特别鸣谢只写在该译者实际参与的页面上，不做全站铺开。

## 站点补充内容

源表格缺的分节标签写在脚本的 `EXTRA_TAGS`（键为分节序号）。产出侧带 `data-source="site"`，`check()` 在字符比对前按标记整块剥离并核对块数——源表格内容仍逐字比对，补充范围由块数锁死。

两道护栏会中止转换：某分节源表格已带标签又写了补充；剥离块数与 `len(EXTRA_TAGS)` 对不上。

## 视觉与排版

**规范在 `design.md`，改样式、定颜色、加页面之前先读。**那里写死了色相归属、ΔE 判据、中文空格规矩、版心与外壳的分工。

与生成器耦合的部分只有一处：配色要改两个文件并保持一致——`tools/convert-artifact-mods.py` 的 `COLOR_MAP`（51 个源色值 → 23 个语义 token）与 `assets/site.css` 的 `:root`（23 个 token → 渲染色）。

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
