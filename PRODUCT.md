# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Destiny 2 中文玩家（主力用户）**：在日常刷本、突袭/地牢开荒、调整配装、评估武器词条（God Roll）或核对机制数值时，需要快速、准确地检索中文官方译名、英文原名或拼音简拼，查看经过实测验证的具体数值（含 PvP 差异）、词条属性加成曲线以及可直接导入 DIM 的场景配装方案。
- **社区贡献者与站内编辑者**：通过配装工具投稿配装方案，或在登录编辑态后对主键资料页进行在线就地编辑、在 `/admin/` 审核台审阅投稿与词条修订。

## Product Purpose

**Starside（Destiny 2 中文资料台）** 为中文《命运 2》社区提供一处零废话、高密度、实测驱动的综合资料与工具台。它将散落在游戏客户端定义表、英文社区实测表格（Destiny Data Compendium）、评测作者表格（Aegis、LGpig）以及玩家社区配装中的信息，统一收敛在以 Bungie 实体 hash 为主键的单源架构下，让玩家在几秒内完成「查实测数值 → 模拟装备词条属性 → 抄配装并一键导入 DIM」的闭环。

## Positioning

- **Hash 主键单源实体层 + 实测数据融合**：全站以 Bungie Manifest 定义表的十进制 hash 为唯一实体主键（`data/` 五张实体表 + `minted.json`），将官方描述（`database_details`）、DDC 社区实测数值（`realgame_details`）与创作者评级（`site_authors`）挂载在同一实体名下，跨页引用、配装词表与悬停详情全部同源推导，杜绝多处维护产生的数据分叉。
- **中文原生检索与工具链闭环**：支持中文全拼、简拼、多音字与英文原名混搜（`assets/pinyin.js`）及全站离线可用索引（`assets/search.js`）；装备库提供对齐 `destiny.report` 的 DIM 语法检索、实时词条/大师杰作/T 级属性曲线模拟与作者推荐光圈；配装页支持直接生成 DIM 导入链接与源稿复制。
- **机械闸门护航的在线协作流**：虽为纯静态零依赖站点，但通过单支 CloudBase 云函数（`functions/api/`）与三方基线对账脚本（`tools/sync.py`），实现了主键页在线就地编辑、配装投稿审核及本地仓库双向同步，并由术语着色（`check_terms.py`）、排版结构（`check_type.py`）、外壳一致性（`check_shell.py`）与数据质量（`check_quality.*`）四道自动化闸门严守内容与视觉底线。

## Operating Context

- **玩家使用场景**：常与游戏客户端、DIM（Destiny Item Manager）并排在桌面端多窗口或副屏打开，亦有移动端群聊分享速查需求；包含首页轮换速查（按本机时钟与游戏周三 01:00 重置周界实时计算突袭/地牢/扭曲/光尘商店）、装备库检索模拟、当前赛季场景配装浏览与导出、以及 40+ 篇职业分支/武器护甲/副本机制速查表。
- **维护与构建流水线**：源稿（`references/keys/` 主键骨架、`references/docs/` 散文与表、`references/builds/` 配装 JSON）与实体数据（`data/`）经 Python 生成器（`tools/convert-*.py`、`tools/build-*.py`）产出纯静态 `site/` 目录；产出一律不手改；通过 `tools/ship.sh` 与 `tools/deploy.py` 增量发布至腾讯云 CloudBase 静态托管。

## Capabilities and Constraints

- **纯静态、零前端依赖、零打包器**：上线文件全在 `site/` 下，使用原生 HTML/CSS 与原生 ES Module JS，无第三方运行时框架，不引 CloudBase JS SDK（前端统一用裸 `fetch` 调用接口），保证极速首屏与 `file://` 本地直接打开的兼容性。
- **生成产物严禁手改**：除 `site/index.html` 骨架（卡片预览 `<!--pv-->` 除外）、`site/weapons/app.js` 与各页 `style.css` 外，所有资料页 HTML、装备库数据载荷、配装页与搜索索引均由构建脚本生成。
- **URL 与路由约定**：本地与线上关闭 `cleanUrls`（见 `serve.json`），站内链接一律显式写全 `xxx/index.html`。
- **术语与色彩铁律**：全站术语正名与着色 token 严格受 `check_terms.py` 约束；页面上唯一的饱和色来自游戏内语义编码（七元素色相、稀有度、弹药、勇士与机制色），外壳一律去饱和为骨白与石墨发丝线，不可逆操作靠位置分隔（`.op-sep` / `.x-cut`）而非红色警告。

## Brand Commitments

- **名称与署名**：站点名为 **Starside · Destiny 2 中文资料台**，主创署名为 **BY 日栎w**（附爱发电支持入口与交流 QQ 群 `1095954157`）。
- **数据归属与透明标注**：明确标注数据取自游戏定义表与社区实测（Destiny Data Compendium、Aegis、LGpig 等及各页特别鸣谢）；方括号如 `[10%]` 固定表示 PvP 数值，`?` 表示尚待核实的条目。

## Evidence on Hand

- **实体数据层（`data/`）**：`inventory-items.json`（5942 条）、`sandbox-perks.json`（5200 条）、`traits.json`（46 条）、`stats.json`（79 条）、`equipable-item-sets.json`（56 条）、`minted.json`（56 条）及 `data/lookup/` 构建字典。
- **源稿库（`references/`）**：`references/keys/`（23 篇主键资料页）、`references/docs/`（19 篇散文与表格资料页）、`references/builds/`（各赛季配装源稿）。
- **设计规范与工程手册**：`design.md`（已同步为 `DESIGN.md`）记录完整色彩、字体、版心、表格与控件规范；`AGENTS.md` 与 `.claude/rules/*.md`（`pages.md`、`builds.md`、`backend.md`、`frontend.md`、`weapons.md`）记录全部子系统契约。

## Product Principles

1. **单源事实，派生一切**：一件游戏实体只在一个 hash 名下存一份事实；页面表格、装备库模拟、配装词表、搜索索引与首页卡片预览全部从数据层或产出机械派生，绝不人工同步两份副本。
2. **形式服从游戏语义**：任何视觉编码（色彩、字重、图标尺寸、面板份额）必须能反推出游戏内依据或信息层级推导；无游戏语义的外壳彻底退后，把视觉带宽留给高密度数据。
3. **闸门守底线，拒绝静默降级**：错别字、术语偏离、孤立标签、色彩撞车或缺失主键在构建与测试阶段当场报错中止，绝不用兜底默认值掩盖数据或渲染缺陷。
4. **首屏克制与渐进增强**：严控首屏字节与 DOM 体积（注释缩进剥离、长页 `rest.gz` 分片、载荷按需分级加载）；无 JS 时核心数据表格依然完整可读、无障碍树不丢失。
