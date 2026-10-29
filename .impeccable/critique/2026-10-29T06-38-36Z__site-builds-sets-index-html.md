---
target: 配装推荐与配装合集页 /builds/sets/index.html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/eliver/code/MISC/destiny2-starside/site/builds/sets/index.html"
target_fingerprint: "sha256:b37d36b8f793f01057b3b659f2ed4bac5bc670f22ae3d3953dd9eae51295db22"
target_path: /Users/eliver/code/MISC/destiny2-starside/site/builds/sets/index.html
timestamp: 2026-10-29T06-38-36Z
slug: site-builds-sets-index-html
closed: true
---
Method: dual-agent (A: 77bcf49b-8369-47e6-8611-2629dbc25ac9 · B: 14450bbc-45af-45d6-89a7-b5b853c35dee)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | 2 | 筛选 0 命中时 `<main>` 变为空白黑屏且无提示；`.toolbar[data-miss] .tool-search` 注释写「描边转红」却用了 `--c-health`（`#41b349` 绿色） |
| 2 | Match System / Real World | 2 | `sets/index.html` 下 7 个「多职业」武器合集均回退显示「同一角色 N 套遭遇战阶段切换配装方案」；15 张合集卡在 `.st-role` 定位槽中把元素名（烈日/棱镜）当成职责标签输出 |
| 3 | User Control and Freedom | 3 | `history.replaceState` 保持筛选状态良好，但无「重置全部筛选」入口，且 `职业` 缺 `全部` 按钮 |
| 4 | Consistency and Standards | 2 | 同一 `.facet-block` 内 `职业` 是多选 toggle（无 `全部`），而 `场景`/`强度` 是单选 `:single`（带 `全部`）；`convert-build.py:1748` 用字符串比较日期导致 `2026.9.9 > 2026.10.27`，页脚更新时间倒退 |
| 5 | Error Prevention | 2 | 稀疏的合集页（19 套）不置灰/禁用 0 命中的交叉筛选项（如点「猎人」再点「日常」直接掉进空白页） |
| 6 | Recognition Rather Than Recall | 3 | 装备图标与阶段时间轴识别度极高；但收起「筛选」抽屉后仅显示数字角标，看不见已选中的分支或标签名 |
| 7 | Flexibility and Efficiency | 4 | 零延迟客户端筛选、`regroup()` 动态归并多场景卡片不复制 DOM、支持 `/` 与 `Cmd/Ctrl+K` 聚焦搜索 |
| 8 | Aesthetic and Minimalist Design | 2 | `.id-ribbon` 塞入多达 9 项行内元数据（含与外层分节重复的职业/场景）；单行 `20px` 的 `.say` 让长 `审核意见` 把作者简介 `<p>` 挤压至 `0px` |
| 9 | Error Recovery | 2 | 0 命中无原因说明、无一键清空筛选按钮 |
| 10 | Help and Documentation | 3 | 页首说明清晰，但缺 `meta / 强力 / 创意` 分档判据与 `审核意见` 警示机制的简短说明 |
| **Total** | | **25/40** | **Acceptable（底子扎实、响应极快，但受困于单行文本挤压、0 命中黑屏、合集语义错位及局部违背 `design.md` 的霓虹发光样式）** |

---

#### Design Specificity Verdict

**LLM assessment（未锚定独立设计评审）**：
这两个页面的骨架与内容组织极具 **Destiny 2 · Starside** 专属辨识度，绝不可能被误认为通用 SaaS 或电商卡片墙。切角 16px 的 `.entry` 档案卡、页首星空窗（`sky-page.js`）、单套卡底部的三格真实核心装备带（`.card-strip`）以及合集卡底部的 `01 / 02 / 03` 遭遇战阶段切装轴（`.set-stages`），严格落实了 `design.md`「卡片不写概括句，放那一页的真实内容」的铁律。
然而，`site/builds/style.css` 在演进中出现了与 `design.md` 总原则（「整页唯一的饱和色来自游戏自身的编码；不给外壳加彩色、不加发光边框、不加投影；源稿与页面样式表只引 `:root` 语义名，不写色值」）正面冲突的局部漂移：`meta` 档位引入了五色霓虹流光渐变与品红发光阴影（`#ff4fd8aa`），职责胶囊（`输出`/`机制`/`五壮举`）与小节标题硬编码了色值并与电弧蓝（`#79d4f7`）、烈日橙（`#f0884a`）、异域金（`#f6c467`）撞色。

**Deterministic scan（机械检测器 + 浏览器实测）**：
- **CLI 静态扫描**（`impeccable detect --json site/builds/sets/index.html site/builds/index.html`）：共检出 **607** 项（`builds/index.html` 396 项，`builds/sets/index.html` 211 项）。
- **Live URL 像素扫描**（`http://localhost:3000/...`）：共检出 **629** 项（含 `app.js` 动态生成的 `.facet-block`）。
- **两方交叉吻合的真问题**：
  1. `dark-glow`（2 处）与 `gradient-text`（32 处有效命中）：指向 `site/builds/style.css:1017, 1337, 1355` 中 `[data-tier="meta"]` 的 `#ff4fd8` 零偏移发光阴影与 `background-clip: text` 彩色渐变字——这恰好也是 Assessment A 指出违背 `design.md` 的位置。
  2. `low-contrast`（静态 60 处，URL 像素扫描新增 `.facet-label` 与 `.tool-search::placeholder`）：`--bone-faint`（`#5b6472`）被用在了非占位的正文级导航副标题 `.new-link span`（`2.9:1–3.0:1`）、筛选行标题 `.facet-label`（`3.1:1`）、搜索框占位符（`3.0:1`）、卡片时间戳 `.entry-stamp`（`2.9:1`）及合集阶段序号 `.st-idx`（`2.7:1–2.8:1`）上，均低于 4.5:1 AA 标准（改用 `--bone-dim: #9aa0ac` 可达 `6.7:1`）。
  3. `undersized-ui-text`（505 处）：卡片标签 `.tags > i`（`突袭`/`宗师/终极`/`输出`/`五壮举`）、合集阶段标签 `.st-role`、`.set-more`（`+N 套阶段`）、`.verdict > b`（`审核意见`）及 `.entry-stamp` 均设为 `10.5px`，低于 11px 下限（且低于 `.claude/rules/builds.md:94` 规定的配料格 `11.5px` 下限），多笔画汉字（如「宗师/终极」「五壮举」「棱镜」）在标准屏上笔画粘连。
  4. **浏览器实测发现的额外几何溢出（LLM 未单凭代码算出的像素问题）**：在 `<1174px` 视口下，`sets/index.html` 的 `body` 最小宽度为 `--min: 1104px`，但顶部 `.head-row` 因并排放置了两个长文案 `.new-link`（`投稿一组合集` + `单套配装推荐`），将 `document.documentElement.scrollWidth` 撑到了 **`1174px`**，导致页面右侧溢出 `body` 背景 70px。
- **判为 False Positives（符合 `design.md` 规范，予以排除）**：
  - `codex-grid-background`（`site.css:202` 的 88px 天体仪刻线网格，属全站规范推导设计）。
  - `pulsing-dot` / `repeating-stripes-gradient` / `.wordmark.sheen`（位于共用 `site.css` 的首页星轨 `.route` 与字标上，配装页 DOM 中并不存在）。
  - `ai-color-palette`（URL 扫描将 `.el-arc` 电弧青与 `.el-void` 虚空紫误判为 AI 霓虹色，实为游戏内标准元素色相）。

**Visual overlays**：
No reliable user-visible `[Human]` browser tab is exposed in this harness; used headless `playwright-cli` (`1440×900` and `390×844`) and live URL detector scan against `http://localhost:3000/builds/sets/index.html` and `http://localhost:3000/builds/index.html` instead.

---

#### Overall Impression

这是一套信息密度极高、领域建模非常内行的配装检索目录：单套配装用「三格核心装备」定性，合集用「三行遭遇战时间轴」定性，一眼就能看懂配装骨架。目前最大的改进空间在于**清理合集页的自动回退文案与卡片行内挤压**，并**将 `site/builds/style.css` 中偏离 `design.md` 的硬编码发光色、低对比度灰字与筛选空状态收敛回全站严密的设计纪律中**。

---

#### What's Working

1. **真实装备与遭遇战时间轴预览（`.card-strip` 与 `.set-stages`）**：
   `tools/convert-build.py` 的 `card_strip()` 与 `set_stages()` 彻底摒弃了空洞的摘要句。单套卡底部直接摆出「异域护甲 ｜ 核心武器 ｜ 超能」三格（配 24px 图标与分支色左缘）；合集卡底部直接摆出 `01 / 02 / 03` 阶段切装表与 `+N 套阶段` 角标，老玩家扫视两秒即可判断整套方案的机制闭环。
2. **零克隆 DOM 动态归组（`assets/app.js` 的 `regroup()`）**：
   多场景配装（`突袭、地牢`）在 DOM 中只存一份，切到「地牢」单选时由 `regroup()` 按全局序 `ord` 借调进地牢网格、切回「全部」时原位归还，既避免了「全部」视图下重复出现两张卡，又保证了点赞数与命中计数绝对准确。
3. **同构双页生成器架构（`render_index(sets=...)`）**：
   单套推荐（126 套）与配装合集（19 套）完全共用同一套 HTML 骨架、四维筛选契约与样式表，仅在卡片局部替换核心马赛克（`.core-mosaic`）与底部阶段表，任何一处结构修复都能同时惠及两页。

---

#### Priority Issues

- **[P1] What：单行 `.say` 容器（`20px` 高）让长「审核意见」将作者简介 `<p>` 挤压至 `0px` 宽，且双方均被截断**
  - **Why it matters**：在 [site/builds/style.css](file:///Users/eliver/code/MISC/destiny2-starside/site/builds/style.css#L1083-L1114) 中，`.entry .say` 被锁死为 `height: 20px; display: flex; white-space: nowrap; overflow: hidden`，`.verdict` 与 `<p>` 水平争抢同一行。当卡片带有较长的 `审核意见`（如 `sets/index.html` 的「猎人日志solo见证者配装」76 字、或 `builds/index.html` 的「霉B喷子」112 字）时，`.verdict` 占满整行并半句截断，而作者写的配装简介 `<p>` 被直接压成 `0px` 完全消失（且无键盘聚焦或悬停展开手段）。这也违背了 [.claude/rules/builds.md](file:///Users/eliver/code/MISC/destiny2-starside/.claude/rules/builds.md#L180) 原本「简介之上那两行：裁到两行」的设计初衷。
  - **Fix**：将 `.entry .say` 改为纵向两行或允许两行高度预算（当同时存在 `.verdict` 与 `<p>` 时各自独占一行 `20px` 单行省略，或允许 2 行 `-webkit-line-clamp: 2`），并为 `.verdict` 补上 `title` 或复用 `builds/tip.js` 浮层以支持查看完整审核意见。
  - **Suggested command**：`/impeccable layout`

- **[P1] What：`sets/index.html` 存在三处合集语义与几何失真（「多职业」回退写「同一角色」、阶段职责槽重复印元素名、`.core-mosaic` 64px 塞入 60px 内盒被裁切 4px）**
  - **Why it matters**：
    1. 在 [tools/convert-build.py](file:///Users/eliver/code/MISC/destiny2-starside/tools/convert-build.py#L1645) 中，未写描述的合集一律回退为 `"同一角色 %d 套遭遇战阶段切换配装方案"`。但在 `sets/index.html` 的 `<h3>多职业</h3>` 小节下，7 套跨职业武器评测合集（如 `合集·刀剑`、`合集·光芒复仇`）第一行印着「多职业」，第二行紧接着印「同一角色 6 套遭遇战阶段切换配装方案」，产生明显的事实矛盾。
    2. 在 [`set_stages()`](file:///Users/eliver/code/MISC/destiny2-starside/tools/convert-build.py#L463-L471) 中，当子配装未标 `输出`/`机制` 标签时，`.st-role` 胶囊回退显示**元素名**（`<em class="st-role el-solar">烈日</em>`）。19 张合集卡里有 15 张把元素名当职责标签印在左列，既与本行左缘色条和右侧超能元素色重复，又混淆了「元素」与「遭遇战分工」。
    3. 在 [`core_mosaic()`](file:///Users/eliver/code/MISC/destiny2-starside/tools/convert-build.py#L905-L922) 与 [site/builds/style.css](file:///Users/eliver/code/MISC/destiny2-starside/site/builds/style.css#L817-L833) 中，`.core-mosaic` 声明了 `width: 64px; height: 64px; border: 2px solid var(--ink)`（`border-box` 实际内容区仅 `60×60px`），但生成器写入 `--tile: 31px`（`31×2 + 2px gap = 64px`），导致所有四宫格马赛克右下角被裁掉 4px；此外，5 套共用同一金装的合集（如「光焰之井Raid用全配装」）被按名字去重成单张 64px 图标，外观与单套配装无法区分。
  - **Fix**：
    1. 在 `convert-build.py:1645` 区分 `m["cls"] == "多职业"`（回退为 `"跨职业 %d 套同武器/机制配装方案"`）与单职业合集。
    2. 在 `set_stages()` 中，当子配装无职责标签时，若为跨职业合集则显示该套的**职业名**（`猎人`/`泰坦`/`术士`），否则留空或收窄该列，不再重复印元素名。
    3. 将 `core_mosaic()` 的卡片 `tile` 修正为 `(size - 4 - 2) // 2 = 29px`（或去掉 `.core-mosaic` 的 2px 内边框），并仅在同节卡片数 `>1` 时才填充 `.st-empty` 占位行。
  - **Suggested command**：`/impeccable clarify`

- **[P1] What：筛选 `0` 命中时 `<main>` 静默黑屏无恢复入口、搜索框 0 命中描边误用绿色（`--c-health`）、且 `sets/index.html` 在窄视口下 `.head-row` 横向溢出 `70px`**
  - **Why it matters**：
    1. 在只有 19 张卡的 `sets/index.html` 上，点击「职业：猎人」+「场景：日常」即触发 `0 / 19`，`app.js:277-286` 隐藏全部 `<section>` 后 `<main>` 变成一片空白，没有任何提示文案或「重置筛选」按钮。
    2. [site/assets/site.css](file:///Users/eliver/code/MISC/destiny2-starside/site/assets/site.css#L420-L422) 写着 `/* 0 命中：输入框描边转红 */ .toolbar[data-miss] .tool-search { border-color: var(--c-health); }`，但 `:root` 中 `--c-health` 是 `#41b349`（游戏内治疗绿，战斗人员红是 `--c-combatant: #e05252`），报错反而亮起安全绿框。
    3. 浏览器实测显示，在 `<1174px` 视口下，`sets/index.html` 的 `.head-row` 因并排放置两个长副标题 `.new-link` 将 `scrollWidth` 撑到 `1174px`，超出 `body` 的 `--min: 1104px` 达 70px，向右滚动时页首背景断裂。
  - **Fix**：
    1. 在 `<main>` 内增加 `0` 命中空状态提示与一键「重置全部筛选」按钮（由 `app.js` 在 `hits === 0` 时切换显示）。
    2. 将 `site.css:421` 的 `var(--c-health)` 修正为 `var(--c-combatant)`（或 `var(--c-solar)`）。
    3. 允许 `site/builds/style.css:1521` 的 `.head-row` / `.new-link` 在 `1104px` 版心内换行或收窄副标题宽度，消除 70px 横向溢出。
  - **Suggested command**：`/impeccable harden`

- **[P2] What：`site/builds/style.css` 引入违背 `design.md` 的硬编码霓虹发光阴影、彩色渐变字与撞色职责标签**
  - **Why it matters**：`design.md` 规定「整页唯一的饱和色来自游戏自身的编码；不给外壳加彩色、不加发光边框、不加投影；页面样式表只引 `:root` 语义名」。但 `site/builds/style.css` 对 `[data-tier="meta"]` 施加了 `#ff4fd8` 品红发光 `box-shadow` 与五色旋转渐变（被检测器报 `dark-glow` 与 32 处 `gradient-text`），对 `.facet-block` 施加了投影（`:567`），且 `.role[data-rk]` 与 `.sub-label` 硬编码了 `#79d4f7`、`#f0884a`、`#f6c467`、`#8ee0a1`，导致在烈日猎人卡上，「机制」标签呈现出电弧青色（`#79d4f7`），破坏了「色彩即元素/稀有度编码」的单义性。
  - **Fix**：移除卡片头像与筛选容器上的 `box-shadow` 外发光，将 `site/builds/style.css` 中的硬编码色号收敛回 `site.css` `:root` 语义变量；将职责胶囊（`输出`/`机制`/`五壮举`）改为去饱和骨白/石墨发丝线胶囊（`--bone-hi` / `--bone-dim`），把饱和色完全交还给游戏元素与稀有度；为 `<h3>多职业</h3>` 补齐一致的 `.sub-label` 样式。
  - **Suggested command**：`/impeccable quieter`

- **[P2] What：`10.5px` 超小字号与 `--bone-faint`（`2.7:1–3.1:1`）低对比度文本集中出现在功能性文案上，且 `.facet-block` 混用多选与单选交互**
  - **Why it matters**：
    1. 检测器检出 505 处 `10.5px` 功能性中文标签（`.tags > i`、`.st-role`、`.set-more`、`.verdict > b`、`.entry-stamp`）与 60+ 处 `2.7:1–3.1:1` 低对比度文本（`.new-link span`、`.facet-label`、`.tool-search::placeholder`、`.st-idx`、`.entry-stamp`）。`--bone-faint` 在 `design.md` 中仅供表格无数据占位符 `.na` 使用，用于导航副标题与阶段序号会导致阅读吃力。
    2. `convert-build.py:1798` 中 `职业=cls` 未加 `:single`，导致同一 `.facet-block` 面板里第一行「职业」是多选（无 `全部` 按钮，点完猎人再点泰坦会同时选中两者），而紧挨着的「场景」和「强度」却是单选（带 `全部` 按钮）。
    3. `convert-build.py:1748` 用字符串 `max()` 计算页脚日期，导致 `"2026.9.9" > "2026.10.27"`，`builds/index.html` 页脚停留在 `2026.9.9`。
  - **Fix**：将卡片与阶段标签字号从 `10.5px` 提升至 `11px`–`11.5px`；将 `.new-link span`、`.facet-label`、`.st-idx` 等非占位文本从 `--bone-faint` 提亮至 `--bone-dim`（`#9aa0ac`，对比度 >6:1）；在 `convert-build.py:1798` 中为 `职业` 加上 `:single`（或统一交互提示），并按 `(int(y), int(mo), int(d))` 修正页脚日期排序。
  - **Suggested command**：`/impeccable typeset`

---

#### Persona Red Flags

- **Alex（追求效率的老玩家 / Power User）**：
  - 在 `.facet-block` 点击「猎人」看完后再点「泰坦」，预期像下一行「突袭 / 地牢」一样直接切换职业，结果变成了「猎人 + 泰坦」并集多选；想切回单看泰坦还得多点一次「猎人」取消。
  - 展开「筛选」抽屉选了某个分支或标签并合上抽屉后，按钮只显示数字 `1`，看不出当前锁了哪个细分条件，也没有一键清除按钮。
- **Sam（依赖无障碍与高对比度的用户 / Accessibility User）**：
  - 每张卡片的 `<a class="entry">` 内部同时输出了可见的 `<span class="id-tier" data-t="强力">强力</span>`（`convert-build.py:1681`）和屏幕阅读器专用的 `<span class="tier off-screen">强力</span>`（`convert-build.py:1727`），导致读屏软件在每张卡上把强度连读两遍。
  - 导航副标题（`.new-link span`）、筛选类别名（`.facet-label`）与合集阶段序号（`.st-idx`）对比度仅 `2.7:1–3.1:1`，且 `10.5px` 的中文标签在非 Retina 屏上发虚。
- **Destiny 2 开荒队长 / 配装投稿与审稿人（Starside 核心领域用户）**：
  - **开荒玩家**在 `sets/index.html` 翻到「多职业」分节时，看到 7 个跨职业武器合集全部写着「同一角色 N 套遭遇战阶段切换配装方案」，且阶段表把元素名（`烈日`/`棱镜`）印在职责槽里，难以一眼分辨哪套是单角色切装、哪套是跨职业同武器横向收录；同时第 2 张卡（`合集·虚空猎人三箭`）右侧第三件装备文本在卡片右缘被硬生生截断（`暗影箭矢：莫比乌斯箭袋...`）。
  - **审稿人与投稿者**在卡片上写下关键版本失效或生存短板提示（`审核意见`）后，不仅提示本身在 35 字处被截断且无法悬停查看全文，还顺手把投稿者写的配装简介 `<p>` 挤成了 `0px` 消失。

---

#### Minor Observations

- **`builds/index.html` 页脚更新时间倒退 Bug**：[tools/convert-build.py](file:///Users/eliver/code/MISC/destiny2-starside/tools/convert-build.py#L1748) 的 `max(m["stamp"] for m in live)` 对日期字符串做字典序比较（`"2026.9.9" > "2026.10.27"`，因为 `'9' > '1'`），导致页面内明明有 `2026.10.27` 的新配装，页脚和首页卡片却显示 `2026.9.9`。
- **单卡分节多余的 `.st-empty` 空白占位行**：在 `sets/index.html` 的「宗师/终极 → 泰坦」分节下，只有「风暴要塞打雷泰坦」1 张两阶段合集卡，根本不需要与邻卡对齐高度，但 `set_stages()` 依然塞入了一行 `26px` 高的 `<div class="st-row st-empty">`，在卡片底部留出一条突兀的空槽。
- **吸顶 `.toolbar` 右侧 75% 留空与筛选面板滚出视口**：两页的 `.toolbar` 均未传跳转 chip，吸顶栏右侧四分之三完全空白，而真正高频使用的 `.facet-block` 却留在 `<main>` 顶部随页面滚走。
- **手册文档滞后**：`.claude/rules/builds.md` 第 295–319 行仍记录 `职业=cls:tuck` 收在折叠面板里、触发器绝对定位在左缘，与当前 `convert-build.py`（`职业` 常驻主面板、触发器在右缘）不一致。

---

#### Questions to Consider

- **合集页的两种合集模式是否应该在阶段表上显式分野？** 当一份合集是「同一角色在遭遇战 1/2/3 阶段切装」时，左列显示 `01 机制 / 02 输出` 非常合理；但当一份合集是「跨三个职业的刀剑/线性融合步枪配装横向合集」时，把左列换成 `猎人 / 泰坦 / 术士` 职业徽记，是否比全部回退成「同一角色阶段切换」和重复元素名准确得多？
- **当一张卡片被站方加上 `审核意见` 时，它是否值得多占一行高度？** 既然只有少数需要特别提醒玩家的配装才有 `审核意见`，让 `.verdict` 独立占一行（不再把作者简介 `<p>` 挤成 `0px`）并支持悬停看全文，是否比强求所有卡片锁死同一像素高度更有用？
- **强度分档（`meta` / `强力` / `创意`）是否需要违背 `design.md` 的霓虹流光？** 如果去掉头像外圈的 `#ff4fd8` 发光阴影与彩色旋转渐变，改用克制的金属/骨白双线几何角标区分 `meta`，是否反而能让左侧的分支元素色条和 64px 核心装备图重新成为真正的视觉主角？
