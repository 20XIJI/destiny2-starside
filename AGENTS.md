# AGENTS.md

Destiny 2 中文资料台（Starside）。零依赖纯静态站点（`site/`）+ 腾讯云 CloudBase 云函数（`functions/api/`），回归测试走标准库 `npm test`。

> 生成产物一律不手改：资料页改 `references/` 或 `data/`，结构改生成器的 `render()`，均通过重跑构建脚本生效。视觉与排版细则在 `design.md`，子系统详规在 `.agents/rules/`。

## 仓库骨架

| 目录 / 文件 | 职责与改法 |
|---|---|
| `site/` | 唯一部署目录。仅 `index.html`、`404.html`、`assets/`、`admin/`、`eververse/` 与 `weapons/{app,pvp}.js` 等脚本样式手写；其余 HTML 与索引由生成器产出 |
| `references/docs/` | 散文与表资料页源稿（45 篇），改文案直接改 `.md` |
| `references/keys/` | 主键骨架源稿（23 篇，含 `artifact-mods.md`、`armor-sets.md`），改行文案改 `data/` 记录 |
| `references/builds/` | 按赛季存放配装源稿 JSON；`references/pages/` 存矩阵映射 |
| `data/` | 构建输入层（不上线）：五张实体 JSON + `minted.json` + `lookup/` + `index/`（每次构建重写，不入库）+ `ddc/`。读取统一走 `resolve.Facts`、`resolve.text()`、`resolve.icon_path()` |
| `tools/` | 生成器、数据工具、离线测试与三道构建闸门 |
| `functions/api/` | CloudBase 云函数；`dialect.js`、`source.js`、`eververse.js`、`xur.js`、`xur-recs.json` 由 `tools/build-terms.py` 从主源码复制，**不手改** |

`.gitignore` 对 `references/` 采用「全忽略 + 白名单」，仅放行 `docs/`、`keys/`、`builds/` 与 `pages/`；新增源稿须落入对应子目录。

### 子系统手册（`.agents/rules/`）

| 手册 | 覆盖范围 |
|---|---|
| `.agents/rules/pages.md` | 资料生成器、源稿方言（`META_KEYS`）、页脚归属、更新日志写法 |
| `.agents/rules/builds.md` | 推荐配装页、合集、填表页（`builds/new/`）、`vocab.SLOTS`、DIM 导出与 `shot.js` 截图 |
| `.agents/rules/backend.md` | CloudBase 认证、`LEVEL` 权限、四张集合表、`sync.py` 三方对账、在线编辑与审核台 |
| `.agents/rules/frontend.md` | `assets/app.js`、星空模块 `sky*.js`、条件注入 `pinyin.js` 与 `assets/search.js` 全站搜索 |
| `.agents/rules/weapons.md` | `weapons/` 三份载荷、DIM 查询语法、属性与 T 级算法、框架数值与作者光圈 |
| `.agents/rules/deploy.md` | CloudBase 实测部署拓扑、`tcbgw` 协议/压缩/缓存硬约束与全站性能优化路线 |

### 站点与数据约定

- **静态路由**：`serve.json` 禁用 `cleanUrls`，站内链接写全 `xxx/index.html`；新增资料页须同步在首页 `site/index.html` 加 `.entry` 卡片及 `tools/build-home.py` 的 `PREVIEW` 登记。
- **样式层**：先引 `assets/site.css`（全部语义配色、版心 `--wrap`/`--min`、外壳叠色与 UI 强调色 `--accent` 只在此定义），再引页面 `style.css`。
- **数据层读写**：换 manifest 跑 `python3 tools/facts.py --distill`；改完 `data/*.json` 站内字段跑 `python3 tools/facts.py --link`；`sameAs` 只跳一层且正文只在行首记录上；`minted.json` 自发主键从 `2^32`（`4294967296`）起。
- **公共辅助一处定义**：文本剥离、归一化、计数断言、标记解析与图标登记统一调用 `tools/markup.py`（`inline()` 默认关闭 `rich=True` 富文本，按需开启）；外壳与弹窗检查标签唯一定义在 `tools/shell.py`。

## 常用命令

```bash
npm start                                     # 本地静态预览（serve site -l 3000 -c ../serve.json）
npm run build                                 # 增量构建（--force / --all 全量重建；--normalize-only 仅纠正源稿）
npm test                                      # Python unittest + Node offline 回归（发版/改云函数必跑）

python3 tools/convert-doc.py [slug]           # 通用资料页（省略 slug 即全部）
python3 tools/convert-artifact-mods.py        # 神器模组页
python3 tools/convert-armor-sets.py           # 护甲套装页
python3 tools/convert-build.py                # 推荐配装页、合集与词表
python3 tools/build-weapons.py                # 装备库载荷与页壳
python3 tools/build-home.py                   # 首页预览与 rota.js 攻略映射
python3 tools/build-search.py                 # 全站搜索索引 search.js 与裁切版 pinyin.js
python3 tools/build-terms.py                  # 编辑台词表、页面树与复制共享模块到 functions/api/

python3 tools/facts.py --link                 # 修改 data/*.json 站内字段后重算关联与图标
python3 tools/resolve.py --audit              # 校验站内全部引用名可落到主键
python3 tools/migrate.py --check              # 配装源稿 markdown ⇄ JSON 往返一致性
python3 tools/icons.py --pull                 # 拉取缺失官方图转 WebP
python3 tools/ddc.py --check                  # 检查上游 Destiny Data Compendium 差异（--update 刷新；例外记 data/ddc-ignore.json）

tools/ship.sh "提交信息"                       # 完整发版：--normalize-only → sync → build → test → commit → deploy --no-sync → push
python3 tools/sync.py                         # 与线上编辑台三方对账（--mine / --theirs 解冲突）
python3 tools/deploy.py --dry-run             # 预演增量上传清单（--all 全量；--all --prune 清理远端孤儿）
tcb fn deploy api --force                     # 修改 functions/api/ 后单独部署云函数

ruff check tools/*.py && pyright tools/*.py   # Python 静态检查
oxlint --type-aware --type-check site/ functions/ tools/
```

## 构建闸门（`npm run build` 自动执行）

1. **`check_terms.py`（G1–G5）**：以 `tools/items.py`、`tools/items.json`、`tools/perks.json` 为唯一术语真相。覆盖全部源稿（G1–G5）、`data/*.json` `facts.site_text`（G1/G2/G3 反查/G4）及手写页面/脚本（`index.html`、`eververse/{index.html,app.js}`、`assets/armor-rng.js` 的 G1）；任何禁用词、错色 token、未定义 class 或色板不一致直接中止。
2. **`check_type.py`（T1–T5）**：禁止中文吃进宽字距（`>.2em`）、禁用非法 `background` 简写颜色层、检查 HTML 开闭标签、禁止小数像素字号与无 `.gen` 表残留规则、禁止资料页正文块加窄 `max-width`。
3. **`check_shell.py`**：校验 `shell.py` 外壳在全站逐字一致、首页卡片时间戳与配装数与磁盘产出一致，以及所有资料页进入搜索索引。改 `shell.HIT`/`shell.EDIT` 或公告内联检查需同步手写页面。

## 前端性能与部署红线

- **首屏与按需加载**：`markup.loading_attr()` 统一判定 `fetchpriority="high"` 与 `loading="lazy"`；`assets/pinyin.js` 仅在带搜索框页面加载；长页 `content-visibility: auto` 不可套在含 `sticky` 后代的容器上，且只写 `contain-intrinsic-height`（禁写含宽度的 `contain-intrinsic-size`）。
- **静态资源与缓存**：`deploy.py` 上传时自动剥离非数据 JS/CSS 的块注释与缩进并做 `node --check`。图标均按内容 md5 前 10 位命名 `.webp`，**严禁原地覆盖 `.webp`**。线上 `starside.work` 走 CloudBase 个人版 HTTP 网关（`tcbgw`，HTTP/1.1、无服务端 gzip、全类型默认 `max-age=300`；详规见 `.agents/rules/deploy.md`），大体积纯数据载荷统一走 `.json.gz` + 客户端 `DecompressionStream('gzip')` 与 `Cache API` 持久缓存；不引入构建哈希文件名。
- **发布纪律**：部署前工作区必须干净；`--prune` 禁止与增量部署混用；严禁使用 CloudBase 控制台「更新服务」（仅用于紧急回滚）。

## 验证与工作流

- **验证层次**：`npm run build`（三道闸门）→ `npm test`（离线单元测试与一致性回归）→ 隔离 HTTP 端口 + `playwright-cli`（禁止在含 `content-visibility: auto` 长页用 `--full-page` 截图；用完立即 `close` 并清理会话）→ `ruff` / `pyright` / `oxlint`。
- **提交规则**：Solo 项目直接提交 `main`；仅在用户明确要求时执行 `sync.py`、`deploy.py`、`tcb fn deploy` 或 `git push`。
