# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Destiny 2 中文资料台（Starside）。纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。仓库无打包器；回归测试走标准库，入口 `npm test`。

资料页全部由生成器从 `references/` 下的 markdown 源稿产出，产出一律不手改：改文案改 markdown，改结构改生成器的 `render()`，两种情况都重跑脚本。只有首页 `index.html` 是手写的。

本文件写每次都用得上的那些：站点骨架、命令、闸门、部署与验证。视觉与排版规范在 `design.md`，四份子系统手册在 `.claude/rules/`，见《子系统手册》。

## 目录

| 节 | 答什么 |
|---|---|
| 站点骨架 | 页面与样式怎么组织，源稿放哪 |
| tools/ 的分层 | 二十个脚本各管一段 |
| 子系统手册 | 改配装页、后端、资料页、搜索之前读哪一份 |
| 命令 | 构建、测试、部署、蒸馏词表 |
| 闸门 | 术语与着色七条、排版与结构三条、外壳一条 |
| 前端性能约定 | 首屏预算、注释剥离、`content-visibility` |
| 部署 | 增量发布与三条红线 |
| 验证 | 四样验证手段，起浏览器的两条红线 |
| 工作流 | solo 项目，直接提交 main |

## 站点骨架

首页 `index.html` 手写，每个资料页在首页有一张 `.entry` 卡片（更新时间写卡片上的 `.entry-stamp`）。新增资料页要同时加卡片，否则页面没有入口。三张配装卡（配装推荐、配装合集、配装工具）的更新时间与套数由 `convert-build.py` 的 `sync_home()` 在构建时按产出改写，这几处不手改。

页面清单不在这里维护：源稿即清单（`ls references/docs/*.md`），`check_shell.py` 也从那里现扫。只有 `armor-sets/` 与 `artifact-mods/` 有专属生成器，其余全部走 `convert-doc.py`。

样式按层引，顺序即优先级：`assets/site.css`（全站 token、外壳、字体、资料页骨架）在前，本页 `<页目录>/style.css` 在后。深一层的页面自动多引一层父目录的 `style.css`（`shell.py` 的 `head()` 按 `up` 判断）：六个元素页共用 `elements/style.css` 的版式，各自的 `style.css` 只留一行 `--accent`。`assets/app.js` 只有带 `.toolbar` 的页面需要引。

`serve.json` 关掉了 `cleanUrls`，站内链接一律写全 `xxx/index.html`。

`references/` 入库的是源稿：`artifact-mods.md`、`armor-sets.md`，以及 `docs/` 下的资料文档。转写中间产物 `armor_transcription.*` 在 `.archived/`，整个目录已 gitignore，不当源稿用。

`.gitignore` 对 `references/` 是「全忽略 + 白名单」：只放行上面那两个文件与 `docs/*.md`。新增文档源稿一律放 `references/docs/`，丢在 `references/` 根下会被静默忽略，`git status` 干净但源稿没入库。放进去之后 `git check-ignore -v <路径>` 应无输出。

规范在 `design.md`，改样式、定颜色、加页面之前先读。那里写死了色相归属、ΔE 判据、中文空格规矩、版心与外壳的分工。

配色只有一处定义：`assets/site.css` 的 `:root`。源稿里的着色 token 直接引用这些语义名，改渲染色只改 `:root` 的右值，生成器不必重跑。同一处还放着三样东西，改它们同样不必重跑生成器：外壳叠色 `--tint-1/2/3`、`--head-fill`、`--row-hover`、`--field-fill`；UI 强调色 `--accent`（焦点环、当前 chip、卡片左缘，子页面覆盖这一个变量即可换色）；版心一档 `--wrap` 与最小内容宽度 `--min`。

资料页的骨架也在 `assets/site.css`：版心、`.block` 分节、`.gen` 表格、八档色阶、sticky 让位。页面样式表只写真差异：`--wrap` / `--min` 两个右值，表格是否 `border-collapse: separate`，以及本页专属的列宽与列对齐。

## tools/ 的分层

```
mods.py            官方物品表 → tools/mod-variants.json（护甲模组变体）
                   与 tools/moves.json（位移技能）、tools/artifacts.json（七件神器），
                   图标一并取回
vocab.py           配装词表：从已生成的资料页现扫「名字 → 图标、页面、锚点、着色」，
                   槽位 → 来源页的对应在这里一处定义
markup.py          源稿方言与公共件：职业／分支／类别三张词表、{token|文字} 着色、
                   「键：值」行、空行分段、
                   剥标签取文本、保真前的归一化、计数比对、图片尺寸、图标登记
shell.py           站点外壳与落盘：head 元信息、导航条、页脚、ROOT、页面清单、emit()
convert-*.py       四个生成器，各自只写自己那种数据形状的结构层
build-search.py    各页产出 → assets/search.js，首页那只搜索框搜的就是它
build-terms.py     两道闸门的词表 → admin/terms.js（前端提示），
                   资料页树与配装的三张词表 → admin/pages.js（审核台左栏与列表）
sync.py            源稿在库与仓库之间对账：记一份基线三方比，撞车就报、不猜方向
deploy.py          增量部署：与 refs/deploy 一 diff 即得清单，只发改过的文件；
                   keep() 一处挡掉源稿、工具、云函数与配置
check_shell.py     外壳闸门，从 shell.py 现取参照，不另存副本
check_type.py      排版、CSS 有效性与产出结构：中文不吃拉丁字距、background
                   简写非末层不许写颜色、产出的开闭标签配得上
check_terms.py     术语与着色闸门，全部以 TERMS 那一张表为准
items.py           官方物品表 → tools/items.json，Perk 名 → tools/perks.json：
                   物品专名与 Perk 名该着哪个 token 由查表定；
                   出建议清单、就地落标记，配装源稿的散文构建时自动着色，
                   另供 check_terms.py 的 G6 反查
sheet-grab.user.js 油猴脚本：在 Google 表格页面上导出「替换后的文本 + 内联图片」
json2xlsx.py       把上面那份 JSON 还原成 xlsx，供核对与二次编辑
```

一个目的只留一份实现。剥标签取文本用 `markup.text_of`，保真比对前的归一化用 `markup.plain`，计数比对用 `markup.eq(名目, 实际, 期望)`，中止用 `markup.die`，图片宽高用 `markup.img_size`，图标登记与首屏优先级用 `markup.Icons` / `markup.loading_attr`，判断某处文本落在哪个标记里用 `markup.inner_marker`。要新加一件，先看 `markup.py` 里有没有。

外壳与源稿方言各只有一处定义。加一条外壳内容（meta、资源提示、页脚段落）只改 `shell.py`，各资料页重跑即生效；手写的首页 `index.html` 要跟着改，`check_shell.py` 会提醒。页脚那句待测值说明走 `shell.unsure_note(标记)`，一句话只有一处定义，标记形状按该页实际用的填。

`markup.py` 的 `inline()` 默认只处理着色，富文本标记（`**粗体**`、`*强调*`、`[文字](链接)`）由调用方传 `rich=True` 开启。神器模组页不开：它的源稿里有孤立的 `*`（「呈 * 形释放」），开着会在有人再加一个星号时静默变成 `<em>`。

## 子系统手册

四份手册在 `.claude/rules/`，头部各带一段 `paths:`，改到对应文件时由 harness 自动载入；
做计划、还没碰文件时不会触发，那时按这张表自己去读。

| 手册 | 管什么 | 改到这些文件时载入 |
|---|---|---|
| `.claude/rules/pages.md` | 三个资料生成器与源稿方言、页脚归属、更新日志的写法、从 Google 表格做一页资料 | `tools/convert-doc.py`、`convert-artifact-mods.py`、`convert-armor-sets.py`、`markup.py`、`shell.py`、`references/**/*.md` |
| `.claude/rules/builds.md` | 推荐配装页：版面、护甲模组变体、源稿格式、合集、悬停详情、填表页 | `tools/convert-build.py`、`vocab.py`、`mods.py`、`builds/**`、`references/builds/**` |
| `.claude/rules/backend.md` | 云函数与在线编辑台：认证、角色、三张表、就地编辑、审核台、配装投稿 | `functions/**`、`admin/**`、`tools/sync.py`、`build-terms.py` |
| `.claude/rules/frontend.md` | 全站搜索索引与 `assets/app.js` | `assets/app.js`、`assets/search.js`、`tools/build-search.py` |

加一条子系统约定就改对应那一份，不搬回本文件。本文件只收每次都用得上的东西；
搬回来等于让每个 session 都为一次都不会读的内容付 context。

## 命令

```bash
npm start                                     # npx serve . -l 3000
npm run build                                 # 四个生成器 + 源稿自动纠正 + 搜索索引 + 编辑台词表 + 三道闸门
npm test                                      # 两份离线回归，0.3 秒；改发布链或云函数前必跑

python3 tools/convert-artifact-mods.py        # 源稿 references/artifact-mods.md
python3 tools/convert-armor-sets.py           # 源稿 references/armor-sets.md
python3 tools/convert-doc.py [slug]           # 源稿 references/docs/*.md，省略 slug 即全部
python3 tools/convert-build.py                # 源稿 references/builds/<赛季>/*.md
python3 tools/build-search.py                 # 全站搜索索引 assets/search.js
python3 tools/check_shell.py                  # 各页外壳逐字一致
python3 tools/check_terms.py                  # 术语正名、着色 token、更新时间
python3 tools/check_type.py                   # 字距与中文、CSS 简写有效性、产出结构

python3 tools/mods.py --distill <导出.json>   # 护甲模组变体 → tools/mod-variants.json
python3 tools/mods.py --moves   <导出.json>   # 位移技能 → tools/moves.json
python3 tools/mods.py --arts    <导出.json>   # 七件神器 → tools/artifacts.json
python3 tools/mods.py --icons                # 按两张表下载图标并转 WebP

python3 tools/items.py --distill <导出.json>  # 官方物品表 → tools/items.json，换赛季跑
python3 tools/items.py --perks               # 武器 PERK 页 + 购物清单列 → tools/perks.json
python3 tools/items.py --suggest [slug]      # 列出还没着色的物品专名与建议标记
python3 tools/items.py --apply   [slug]      # 就地落进源稿，可重复跑
python3 tools/items.py --builds              # 只给配装源稿的描述与注解着色
python3 tools/items.py --normalize [slug]    # 按词表纠正全部源稿，构建时自动跑

python3 tools/json2xlsx.py <抓取的.json>      # 还原成 xlsx，供核对与手改

tools/ship.sh "提交信息"                       # 一轮发版：对账 → 构建 → 提交 → 部署 → 推送
python3 tools/sync.py                         # 库与仓库对账，双向都走，部署后自动跑
python3 tools/sync.py --seed                  # 盘整个覆盖库，首次灌库或对不上账时用
python3 tools/sync.py --mine   <_id>…         # 撞车了，这几篇以盘上的为准
python3 tools/sync.py --theirs <_id>…         # 撞车了，这几篇以库里的为准
python3 tools/build-terms.py                  # 闸门词表 → admin/terms.js，资料页树 → admin/pages.js
python3 tools/deploy.py                       # 增量部署站点，只发改过的文件
python3 tools/deploy.py --dry-run             # 只列这次要发什么
python3 tools/deploy.py --all                 # 整站重发
python3 tools/deploy.py --all --prune         # 整站重发，并删掉远端多出来的文件
tcb fn deploy api --force                     # 改完 functions/api/ 部署后端

ruff check tools/*.py                         # 改完 Python 跑这两条
pyright tools/*.py
```

## 闸门

`npm run build` 末尾跑三道，任一条不过即中止、卡住整次构建。报错自己改，
散文按正名改源稿，物品专名进 `KEEP`。

| 闸门 | 管什么 |
|---|---|
| `check_terms.py` | 术语正名、着色 token、更新时间、更新日志类型、色板齐全，七条，编号 G1–G7 |
| `check_type.py` | 字距与中文、CSS 简写有效性、产出结构，三条，编号 T1–T3 |
| `check_shell.py` | 各页 head 元信息、站标、署名、免责声明逐字一致，更新时间格式合规，页面清单里每一页都进了搜索索引 |

`check_shell.py` 的页面清单从 `references/docs/` 现扫，新增一篇资料不必回去登记；
不变片段表里有 `shell.HIT` 与 `shell.EDIT`，改这两处要连手写的首页 `index.html` 一起改。

### 术语与着色的一处定义

`tools/check_terms.py` 的 `TERMS` 是全站术语的唯一真相。一行钉两件事：中文怎么写，以及着色落到哪个 token 上。加一条术语就往表里加一行，不在源稿里逐处约定。

七条闸门，编号即 `check_terms.py` 报错行的前缀（G6 排在末位，与脚本一致）：

1. G1 中文正名：源稿不许出现禁用写法。「装填」曾被统一成「填装」，六天后新增的页面又带回 17 处；这一条就是为此存在的。
2. G2 token 唯一：同一个术语只能落到同一个着色 token 上。只查「整个标记就是这个词」的那种（`{enemy|护甲充能}`）；词嵌在更长的短语里时着色属于短语（`{el-arc|电弧元素能量球}`），按词强判会把整句的颜色拆碎。这一条眼睛查不出来：`--el-solar` 与 `--deb-solar` 渲染色相同，灼烧着成哪个都看不出。
3. G3 token 有定义：源稿里每个 `{token|文字}` 都要在 `site.css` 或该页样式表里有对应类；反过来，`site.css` 的着色类一次都没被用到即死配置，当场报出。
4. G4 更新时间一致：资料页页脚的「更新 YYYY.M.D」与首页卡片上那个必须相等。首页那三张配装卡的更新时间与套数由构建改写（`convert-build.py` 的 `sync_home()`），这一条兜住手改；别的卡片写的是页面结构，由各生成器的 `N_*` 钉着。
5. G5 更新日志的类型：只有新增、改动、订正三种，同一天里每种连成一段。写法见 `.claude/rules/pages.md` 的《更新日志的写法》。
6. G7 色板齐全：配色总览页 `references/docs/palette.md` 列的渲染色与着色类，必须与 `site.css` 现有的逐条相等，两个方向都管：改了 `:root` 的色号忘了改源稿、加了新 token 忘了上页，都当场报出。认哪些类算着色类只有 `tint_classes()` 一处（G3 与 G7 共用）：源稿里写得出 `{name|…}` 的才算，外壳与组件的类照样引强调色，但它们写不进源稿，不进色板页。那一页「## 页面专属」以下的一节比对到此为止：页面专属的类定义在各页样式表里，不归 `site.css` 管。
7. G6 该着色的都着了：两个方向都管。正查的范围是三份表的并集：`tools/items.json`、`items.py` 的 `MECH`，以及 `TERMS` 里定了 token 的术语。G2 只管「着错了色」：`inner_marker` 返回 `None` 时它整条跳过，所以没有这一条正查时「勇士」「守护者」「能量球」可以全站裸着不被发现（曾漏 774 处）。正查里的词在正文里出现就得着色，漏了当场报出，跑 `python3 tools/items.py --apply` 补上。不参与正查的写进 `items.py` 的 `LOOSE`（同形的普通用法比术语用法还多，如「恢复」），token 留着让 G2 照旧管着色对错。反查：已着色的 token 必须与库里的归属一致。「骨灰余烬」属烈日、「连锁闪电」属电弧是 Bungie 的 manifest 定的事实，不由人记。反查管元素、异域与 `orb` 三桶（`orb` 是能量球与超能那一支金色，写不进异域装备名——神器模组页曾把「库尔之影」「故我在」等 10 个异域名着成 `orb`，15 处无人报出）：神器模组的元素归属库里没有（`typeName_zh` 一律是「传说 神器特性」），钉死会把神器模组页那 12 处更细的着色降级；`{named|…}` `{stack|…}` 这类排版标记也不归它管。

Perk 名整条包在 `{perk|…}` 里，走 `--c-perk`。`.perk` 定义在 `assets/site.css`，全站一处。
Perk 名不属于任何元素，颜色只标「这是一个名字」；必须整名包起来。不包时
G6 正查会把「动能震颤」「不稳定弹药」从中间切开，各染各的色，一个名字看着像两个词。
同名撞车的那几个（动能震颤、震颤反馈、不稳定弹药、势不可挡射击）写进 `items.py` 的
`GUARD`，两头都撞的（诅咒怨魂既是起源特性也是邪魔族战斗人员名）写进 `STOP`。

着色按术语铺，不按列。词表 `tools/perks.json` 由 `items.py --perks` 从两处现扫：
武器 PERK 详解页四个分节的行标题（武器 PERK、武器模组、重型弩机制、起源特性），
以及购物清单四页 Perk 列里的 `{perk|…}`。两字的名字一律不入表：转向、战术、
切割、瓦解在正文里绝大多数是普通词或元素机制名，按词铺开会把动词染成 Perk 名。
固有 PERK 那一节不收：它列的是框架（重型点射、支援框架），不是 Perk。

#### 物品专名的着色查表，不靠人记

`tools/items.json` 是物品专名与 token 的对应表，由 `tools/items.py --distill` 从 Bungie 的 manifest 导出蒸馏。三桶共 704 条，判据全部现取，不硬编码名单：

| 桶 | 判据 | 条数 | token |
|---|---|---|---|
| 元素 | `typeName_zh` 以六个元素名之一开头，且含碎片／星相／手雷／近战／超能 | 228 | `el-arc` … `el-prismatic` |
| 异域 | `tierName_zh` 为「异域」且 `categories_zh` 含武器或护甲 | 280 | `exotic` |
| 神器模组 | `typeName_zh` 为「传说 神器特性」 | 196 | `art-perk` |

建表时归一化：去汉字与拉丁之间的排版空格（源稿按 design.md 三节写「Vex 揭秘者」，库里没有那个空格），去站内自加的消歧后缀（「故我在（电弧元素）」）。匹配那一侧要把空格允许回来：`pattern()` 在中英交界处插 `[ \u00a0]?`，拿归一化过的键去字面匹配会让 12 个中英混排的名字整批漏掉；落标记时包的是源稿原文，不是表的键，否则那个排版空格会被吃掉。原始导出 49 MB，不入库；换赛季重跑 `--distill`。

范围是 `references/docs/` 去掉 changelog 与 palette，加上 `references/artifact-mods.md`，`pages()` 一处定义，`--suggest`、`--apply` 与 G6 共用。那一页也走显式 `{token|文字}`，模组名写在 `### 一级 · 名称` 标题行上不参与铺色（`items.py` 遇到 `#` 开头的行直接跳过）。`armor-sets.md` 不在内：它走词表着色，源稿是纯中文，落标记等于换掉那一页的着色路径。

新词先 `--suggest` 看一眼再 `--apply`。库里 6738 个模组名与中文常用词大量同形（充能 618 次、爆炸 413 次、霰弹枪 65 次都是物品名），按词表铺开会把正文里的普通动词染成专名。`--suggest` 只打印，确认无误再 `--apply` 就地落进源稿。跳过四处：行标题那一格（已有结构身份，但只算到格内换行 `\\` 为止，首格留空即向上合并，身份在第二格）、链接目标与图片路径、`GUARD` 里那些更长的专名、已经在某个 `{token|…}` 里面的。

同形词有两条路，按「那个词本身值不值得救」选。

| 情形 | 办法 | 例 |
|---|---|---|
| 整个词大多数时候是普通词 | 写进 `STOP`，整词不入表 | 「重击」6 处是电弧星相，68 处是刀剑重击；「爆炸范围」27 处全是武器属性 |
| 只在某个更长的名字里撞车 | 写进 `GUARD`，那一段整体屏蔽 | 「千语魅痕」是首领名，屏蔽后「千语」照常着色 |
| 库里的名字写错了 | 写进 `NAME_FIX`，改表的键 | 库里的 `D.A.R.C.I` 漏了词尾那一点 |

同名撞两个桶的（「堡垒」既是虚空星相又是异域融合步枪）由蒸馏时自动剔出，逐处判断。两条表各带一行判定依据，不写「同形词」了事。

`--apply` 只改源稿不碰产出，git diff 即变更记录；着色标记在保真比对时被剥掉，逐字保真闸门照旧成立。全站 1159 处着色让 span 从 12462 涨到 13600 上下，最大的页面 gzip +558 字节（1.5%）。

**不进禁用表的两类词**：一是同形不同义（「优雅处决」是星相里的机制名，不是终结技；「敌方」是形容词，不是战斗人员的同义词）；二是游戏内的效果名各自独立（「治愈」与「治疗」、「恢复」与「治疗」不是同义词，别合并）。

类名按语义命名，不按颜色命名。敌人分档写 `.bar-red` / `.bar-orange` / `.bar-yellow`：游戏内的血条本来就是这三色，读者能反推出颜色为什么是这个颜色。同一个颜色不给两个名字。

### 排版与结构

`tools/check_type.py` 三条，各对应一个真发生过、且别的闸门一声不吭的缺陷。
颜色有七道闸门，所以 43 份样式表里 39 份零裸色值；字距、CSS 是否有效、产出的结构
一道都没有，于是各自漂了很久。

| | 管什么 | 它抓过的那一次 |
|---|---|---|
| **T1** | 字距超过 `.2em` 封顶的规则，反查它选中的产出里有没有中文 | `.block > .sect-label` 把基类的 `.2em` 顶到 `.24em`，而 502 个分节标题里 477 个是纯中文。同病另有三处 |
| **T2** | `background` 简写的非末层不许写颜色 | `.src-tools` 写着 `background: var(--tint-3), var(--ink-lift)`，整条声明作废回落 transparent，而注释正在论证那一层底为什么必要 |
| **T3** | 产出的开闭标签配得上，属性名里不许有 `<` | 一次改动把 27 个 `<a class="entry">` 各复制了一份，浏览器容错渲染正常，`check_shell.py` 只管外壳片段与更新时间 |

判据全部现取：样式表与页面清单走 `os.walk`，颜色变量从 `:root` 的右值形状认，
封顶值取 design.md 二节那一个。加一页、加一份样式表都不必回来登记。

T1 的主语取选择器最后一个 class：`.block > .sect-label` 施加在 `.sect-label` 上，
前面那些是限定条件。取文按标签名配对弹栈：空元素不入栈，无条件弹会让文字记到上一层
的 class 上去。

## 前端性能约定

站点是纯静态、零依赖。以神器模组页为例，首屏约 48 KB gzip（HTML 20K + site.css 8K + 本页样式表 1K + app.js 9K + 首个字重字体 10K）。别引框架或打包器，任何 runtime 都比整站资源还大。以下几条是已经落地的约定，改页面时保持住。

注释不上线，剥在部署那一步。`site.css` 有 38% 的字符在 `/* */` 里，`app.js` 也差不多，而 `.css`/`.js` 的浏览器缓存只有 5 分钟，那些设计依据每次访问都要重发一遍。`deploy.py` 的 `stage_one()` 在复制进暂存目录时把块注释换成等量换行（行号因此不移，devtools 报的位置照旧对得上源稿），源稿一个字不动，本地 `npm start` 服务的仍是带注释的那一份。整站 `.css`/`.js` 因此从 824 KB gz 降到 692 KB，每页首屏省 37–41 KB。`//` 行注释一概不剥：`app.js` 里有 `'http://www.w3.org/2000/svg'`。字符串字面量里冒出 `/*` 或 `*/` 的文件整个跳过、原样发（`strippable()`）：`search.js` 与 `desc.js` 是从源稿生成的，正文里写一句「伤害 100/\*不含\*加成」那对括号就进了数据，正则会一路吃到下一个 `*/`，而吃完往往仍是合法 JS，语法闸门与页面都看不出来，只是搜不到东西。跳过而不是中止：剥注释是优化，不该有能力挡住发版。

公共版式放 `site.css`，不为共用另开文件。`site.css` 每页都要下、且跨页共用一份缓存；页面样式表则是一页一份。共用的东西放前者，首访多几 KB，从第二页起每页省下更多（资料页的样式表因此从 6.6 KB 降到 2.9 KB）。再开一个 `table.css` 只会多一轮请求，省不出东西。

首屏图片不加 `loading="lazy"`。给首屏图片加 lazy 会让它们等布局算完才开始下载，是反模式。排在首屏之内的图标改用 `fetchpriority="high"`，判定只有 `markup.loading_attr()` 一处。数目按 1440×900 实测给：资料页写在源稿的 `首屏图标：` 一行，神器模组页与护甲套装页各是生成器里的 `N_EAGER`（6 与 2）。改版式让首屏塞得下更多图标时，同步改这个数。

长页用 `content-visibility: auto` 跳过屏外渲染。神器模组页约 16700px、护甲套装页约 28700px，屏外内容不必参与布局与绘制。

套的位置有讲究：只能套在不含 sticky 后代的元素上。`content-visibility` 带 paint containment，会把内部的 sticky 裁在自己的盒子里。所以神器模组页套 `.mod-row`（不是 `.artifact`，它含 sticky 的 `.art-bar`），护甲套装页套 `.set-bonuses`（不是 `.set`，它含 sticky 的 `.set-id`）。

`contain-intrinsic-size: auto <值>` 里的 `auto` 让浏览器渲染过一次后改用真实高度，那个值只是从没渲染过时的初始估值，不需要跟着内容维护。它唯一影响首屏滚动条长度与锚点跳转的过冲量，估错不会渲染错。现值取 1440px 宽下的实测中位数（`.mod-row` 278px、`.set-bonuses` 386px），实测总高偏差 5%–7%。

量真实高度时必须让页面自己的 `style.css` 也加载：断言页用 `<base href>` 指回真实目录，只重写 `../assets/` 的路径会漏掉页内相对引用，量出来能差 3 倍。量之前先把 `content-visibility` 临时置成 `visible`，否则量到的是估值本身。

当前分节高亮走 `IntersectionObserver`，不在滚动事件里读 `getBoundingClientRect()`。rootMargin 把视口顶端裁掉 `--stick + 8` 像素，落在剩下那块里最靠上的分节即当前分节。`--stick` 变了要重建观察者（`watch()`），resize 时已经这么做。搜索隐藏分节走 `display: none`，观察者自动报离开，不必手动同步。

外壳里的两条资源提示由 `check_shell.py` 钉住：字体 `preload`（只预载首屏用到的 600 字重）与 `speculationrules` 导航预取。

缓存策略见 `README.md` 的「部署与缓存」。长缓存只给文件名带内容标识的资源；不要为了 CSS/JS 引入文件名哈希，它们与 HTML 的重新验证走同一轮往返，省不出可测量的时间。

除 `armor-sets/icons/`（序号命名）外，各页图标目录的文件名都是内容的 md5 前 10 位，`markup.Icons.html()` 每次转换都复核。**不要原地覆盖图标**：那一年的浏览器缓存就建立在「改内容必然换名」上，覆盖了读者会看一年旧图。换图按 README「换图」那三步走。

## 部署

站点由 `tools/deploy.py` 发，只发改过的文件。站上 3982 个文件里 3770 个是图标，
文件名即内容哈希、改内容必然换名，整目录重发就是把不会变的那批又传一遍。上次发到
哪个 commit 记在 `.git` 的 `refs/deploy` 上，与 HEAD 一 diff 即得清单：改过的复制进
临时目录，一次 `tcb hosting deploy <临时目录> destiny2-starside` 发上去；删掉的按
diff 发 `tcb hosting delete`。全部成功才动 `refs/deploy`，中途失败重跑即可，不会漏。
挂载路径与缓存规则见 `README.md`。

部署时自动跑一次 `sync.py` 对账：编辑台读的是库里那一份，本地修的闸门错误
要这样才回得去。它排在发文件之前，且不受「这次没文件要发」影响：源稿在库里那一份
与站上发了什么无关，只改了 `tools/` 一样要对一次账。

发之前工作区必须干净：产出与源稿对不上时先 `npm run build` 再 commit。
`refs/deploy` 记的是 commit，与一份没提交的产出对不上账。
同步失败即停止，零文件差异也不例外；同步拉回或删掉源稿后，工作区不再干净，也必须
先构建、提交再部署。清单在同步之后按固定的 `target` commit 计算，复制前和每次发送前
复核 HEAD 与工作区；成功只把 `refs/deploy` 推到那个 target。`--dry-run` 不同步、不发送。

`--all` 整站重发，首次部署与换机器时用：`refs/deploy` 只活在本机的 `.git` 里，
新 clone 上没有，脚本会拒发并叫你先跑一次。`--all` 只补不删，远端多出来的文件
要 `--all --prune` 才清；prune 的范围限于挂载路径这一层，桶里别的东西不受影响。
`--prune` 不许跟增量一起用，脚本挡着：增量那份清单不是完整的一版，带上 prune 会把
没改的文件全删了。

**别用控制台那颗「更新服务」**，除非要回滚。它按 GitHub 上的代码整站重发，本地
发了还没 push 的改动会被它抹掉；反过来，站上发坏了要退回，按它就是最快的一条路。
它走 docker runner，日志与版本记录都是那条线产出的。脚本这条路直接写存储桶，
控制台看不到日志，也没有版本可回滚。

上传时不上传源稿与工具：`tools/`、`references/`、`functions/`、`.md` 与几个
配置文件由 `keep()` 一处挡掉。改这份名单就改 `keep()`，`--all` 与增量共用它。

## 验证

不引第三方测试框架，pytest、vitest 一概不装。验证靠四样：

1. 生成器自检 + `check_shell.py` + `check_terms.py` + `check_type.py`：结构、外壳、术语、
   着色与排版的主闸门，见上。跑 `npm run build` 即全部执行。
2. **`npm test`**：两份标准库写的离线回归，跑 0.3 秒，排在 `ship.sh` 的构建之后、提交之前。
   `tools/check_quality.py` 用 `unittest`，管部署闸门、同步删除的三方比、配装生成生命周期、
   源稿自动纠正的幂等、切格三方一致；`tools/check_quality.cjs` 用 `node:assert` 加一份内存版
   database 适配器，管云函数的事务原子边界。两份都不联网、不读令牌、只写独占临时目录。
   改 `deploy.py`、`sync.py` 或 `functions/api/` 之前先跑它，那 13 条 `Deployment`
   测试是动发布链时唯一的安全网。
3. headless Chrome 截图：Chrome Beta 未安装，chrome-devtools MCP 不可用。用：
   ```bash
   ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
     --hide-scrollbars --no-first-run --user-data-dir=<临时目录> --window-size=W,H \
     --screenshot=<out.png> "file://<绝对路径>" >/dev/null 2>&1 &)
   ```
   模组页有 163 张图，必须后台起进程再轮询产物，前台调用会超时。用 `sips -c H W --cropOffset Y X` 裁剪长图看局部。
4. JS 行为断言：在 scratchpad 写断言页（复制生成物 + 追加 `<script>`，结果写进 `<pre>`），用 `--dump-dom` 取回。断言页留在 scratchpad，不进仓库。要反复跑的断言不留在这里，写进 `check_quality.py`：scratchpad 随 session 清掉，而它承诺的东西还写在这份文档里。

第 3、4 条起浏览器，两条红线：

- 用户明确授权才起。默认只跑第 1、2 条闸门，把改动说清楚；需要看渲染效果就先问，得到「跑」再起进程。chrome-devtools MCP 同此规矩。
- 拿到产物立刻收进程。`--user-data-dir` 每次给一个独占的临时目录，收尾按这个目录精确回收，不误杀别的实例：
  ```bash
  pkill -9 -f "user-data-dir=<那个临时目录>"
  ```
  一次截图起 1 个主进程加数十个 helper，不收就是孤儿；收完 `pgrep -ifl chrome` 确认为空。

headless Chrome 无法滚动视口，`--dump-dom` 与 `--screenshot` 都不行。滚动类行为靠断言其配置来验证：`position`、`top` 解析值、底色不透明、祖先链无 overflow 容器、`scroll-margin-top`。

## 工作流

solo 项目。直接提交到 `main`，非指定不开分支。提交前跑 `npm run build`（生成器加三道闸门）与 `npm test`；改过 Python 再跑 `ruff check tools/*.py` 与 `pyright tools/*.py`。push 只在明确要求时做。
