# destiny2-starside

Destiny 2 资料台，纯静态站点，零依赖、零构建步骤，托管在腾讯云 CloudBase。

## 结构

```
index.html                        导航首页（CloudBase 默认入口）
assets/site.css                   共用：主题、23 个配色 token 与工具类、页首、导航、卡片
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

## 新增一个组件

1. 建目录 `<组件名>/`，放 `index.html`，`<head>` 里先 `<link rel="stylesheet" href="/assets/site.css">`，再 link 组件自己的 CSS。
2. 页面骨架照 `artifact-mods/index.html`：`.site-nav` 导航条 + `.monument-header` 页首 + `<main>` 正文。着色文字用 `site.css` 里的语义 class（`.el-arc` `.enemy` `.note` 等），不写内联 `style="color:…"`。
3. 首页 `index.html` 的 `.cards` 里加一张 `<a class="card">`。

## 更新赛季神器模组

模组表的内容源是 Google 表格。表格改动后重新导出，再跑转换脚本覆盖生成：

```bash
python3 tools/convert-artifact-mods.py <导出的.html> artifact-mods/
```

导出方式：Google 表格 htmlview 页面用 SingleFile 保存为单文件 HTML。脚本负责剥离浏览器扩展注入的死 CSS、把 base64 图标外置到 `icons/`、把内联着色转成语义 class，并做结构与文本保真自检——分节数、模组数、图标数、着色数任一对不上，或出现配色映射表以外的颜色，即报错中止，不会产出半成品。

改配色改两处并保持一致：脚本里的 `COLOR_MAP`（色值 → token）和 `assets/site.css` 的 `:root`（token → 渲染色）。
