---
paths:
  - "tools/deploy.py"
  - "tools/ship.sh"
  - "cloudbaserc.json"
---

# 部署架构与性能约束

记录 `starside.work` 的实测线上拓扑、平台硬约束与对应的前端工程化策略（基于 `starside.work` 抓包、DNS 与 `tcb` CLI 实测）。

## 线上拓扑

| 维度 | 实测配置 |
|---|---|
| 正式域名 | `starside.work` → `CNAME starside.work.tcbaccess.tencentcloudbase.com.` |
| 接入层 | CloudBase **HTTP 网关**（`server: tcbgw`），非独立 CDN 节点 |
| 环境与套餐 | `dea-mods-d1g0j2rile2323f73` · `ap-shanghai` · **CloudBase 个人版**（无权自定义 CDN 规则） |
| 路由绑定 | `/` → 静态托管 `destiny2-starside`（COS 桶 `ff38-static-dea-mods-d1g0j2rile2323f73-1351976047`）<br>`/api` → 云函数 `api`（`lam-i2hsm5gr`，`Nodejs20.19`，512 MB，60s 超时） |
| 测试域名 | `https://dea-mods-d1g0j2rile2323f73-1351976047.tcloudbaseapp.com`（固定 `cache-control: no-store, max-age=0`） |

## 平台实测硬约束（`tcbgw`）

1. **协议锁死 `HTTP/1.1`**：浏览器单域名并发上限 6 条连接，单请求回源 COS 约 `56–104 ms`（总 TTFB 约 `180–240 ms`）。
2. **无服务端 Gzip / Brotli 压缩**：所有 `.html` / `.css` / `.js` / `.json` 均以原始体积下发；但预压缩 `.gz` 文件可正常以 `200 OK` + `content-type: application/gzip` 原样透传。
3. **默认统一 5 分钟缓存**：全资源类型（含 `.webp` 图标与 `.woff2` 字体）默认返回 `cache-control: public, max-age=300, s-maxage=600`。可在 CloudBase 控制台「HTTP 网关 → 缓存配置 / Headers 设置」按需补充长缓存规则。

## 工程应对策略

- **大体积纯数据载荷走预压缩 `.json.gz` + 客户端 `DecompressionStream('gzip')`**：
  - 生成器以 `gzip.compress(raw, compresslevel=9, mtime=0)` 输出确定性 `.json.gz`（保留 `.js` 作旧浏览器兜底与离线单测输入）。
  - 客户端解压前必须检查魔数前两字节 `0x1f 0x8b`，避免未来切换支持自动压缩的 CDN 后发生双解压报错。
  - 装备库 `weapons/{index,pool,text}.json.gz` 将首次进入+详情数据量从 `3.18 MB` 压至 `713 KB`（-78%）。
- **按构建版本号 `ver` 写入浏览器 `Cache API`**：
  - 缓存键绑定 `?v=<ver>`，发版变版本号时自动清理同名前缀旧缓存；`localhost` / `127.0.0.1` 跳过持久缓存以保证本地开发实时性。
- **按需懒加载非首屏大索引**：
  - 装备库 `assets/pinyin.js`（157 KB）仅在搜索框聚焦/输入或 URL 带 `q=` 时动态载入，不阻塞首屏。
- **后续可扩展方向**：
  - `assets/search.js`（1.28 MB → 406 KB gz）、`builds/{vocab,desc}.js`（2.75 MB → 560 KB gz）迁移 `.json.gz`；
  - `builds/index.html`、`builds/sets/index.html` 接入 `rest.gz` 分片；
  - 在 CloudBase 控制台「HTTP 网关 → 缓存配置」或通过轻量 Service Worker 为不可变 `.webp` 图标与 `.woff2` 字体提供长缓存。
