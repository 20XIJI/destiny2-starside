# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无测试框架、无打包器。

两个资料页：`artifact-mods/` 由生成器产出，**不手改**；`ammo/` 是手写页，改 HTML 就是改内容。

**视觉与排版规范在 `design.md`。**本文件写机制与验证，不重复设计规则。

## 命令

```bash
npm start                                     # npx serve . -l 3000

# 重新生成神器模组页（源导出存在 git 里）
git show 003317d:artfactmods/index.html > /tmp/sheet-export.html
python3 tools/convert-artifact-mods.py /tmp/sheet-export.html artifact-mods/

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
