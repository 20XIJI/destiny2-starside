# 配色总览

描述：Starside 全站着色的色板——14 支渲染色与 30 个着色类，各带色号、色样与用途。
更新：2026.8.24
页脚：色号与 assets/site.css 的 :root 由 check_terms.py 逐条比对，两处必须一致。

## 渲染色

| 渲染色 | 色号 | 色样 | 用途 |
|---|---|---|---|
| --c-arc | #5fd8e0 | {c-arc|Aa 汉字 123} | 电弧色相 |
| --c-stasis | #7fb4ff | {c-stasis|Aa 汉字 123} | 冰影色相 |
| --c-void | #c08cff | {c-void|Aa 汉字 123} | 虚空色相 |
| --c-strand | #7fdc86 | {c-strand|Aa 汉字 123} | 缚丝色相 |
| --c-solar | #ffb35c | {c-solar|Aa 汉字 123} | 烈日色相 |
| --c-kinetic | #eef3f9 | {c-kinetic|Aa 汉字 123} | 动能色相，游戏内即白 |
| --c-prism | #f58fc8 | {c-prism|Aa 汉字 123} | 棱镜色相 |
| --c-orb | #f2ce5b | {c-orb|Aa 汉字 123} | 能量球金黄 |
| --c-health | #ff8e86 | {c-health|Aa 汉字 123} | 生命值红 |
| --c-aside | #a2848c | {c-aside|Aa 汉字 123} | 限定语灰粉 |
| --c-note | #eea6b7 | {c-note|Aa 汉字 123} | 注解玫瑰粉 |
| --c-legend | #9c7ab8 | {c-legend|Aa 汉字 123} | 传说紫 |
| --c-term | #d6c39a | {c-term|Aa 汉字 123} | 不属于任何元素的游戏术语，暖沙 |
| --c-artifact | #20c4b0 | {c-artifact|Aa 汉字 123} | 神器青绿 |

## 语义

| 标记 | 渲染色 | 用途 |
|---|---|---|
| {deb-arc|deb-arc} | --c-arc | 电弧减益：震颤、致盲 |
| {el-arc|el-arc} | --c-arc | 电弧元素 |
| {deb-stasis|deb-stasis} | --c-stasis | 冰影减益：冻结、碎裂 |
| {el-stasis|el-stasis} | --c-stasis | 冰影元素 |
| {ammo-heavy|ammo-heavy} | --c-void | 威能弹药 |
| {deb-void|deb-void} | --c-void | 虚空减益：虚弱、压制 |
| {el-void|el-void} | --c-void | 虚空元素 |
| {deb-strand|deb-strand} | --c-strand | 缚丝减益：割裂、瓦解 |
| {el-strand|el-strand} | --c-strand | 缚丝元素，特殊弹药同色 |
| {bar-orange|bar-orange} | --c-solar | 橙血与守护者 |
| {deb-solar|deb-solar} | --c-solar | 烈日减益：灼烧、点燃 |
| {el-solar|el-solar} | --c-solar | 烈日元素 |
| {el-kinetic|el-kinetic} | --c-kinetic | 动能 |
| {el-prismatic|el-prismatic} | --c-prism | 棱镜与超凡 |
| {armor-charge|armor-charge} | --c-orb | 护甲充能 |
| {bar-yellow|bar-yellow} | --c-orb | 初级首领与首领 |
| {exotic|exotic} | --c-orb | 异域装备 |
| {orb|orb} | --c-orb | 能量球与超能能量 |
| {stack|stack} | --c-orb | 精准命中与增益层数 |
| {bar-red|bar-red} | --c-health | 红血 |
| {health|health} | --c-health | 生命值与治疗 |
| {debuff|debuff} | --c-aside | 减益 |
| {pvp|pvp} | --c-aside | 方括号里的 PvP 数值 |
| {unsure|unsure} | --c-aside | 待测数值 [?] |
| {note|note} | --c-note | 注解：作者的话与限制说明 |
| {kind|kind} | --c-legend | 行标题后面那一截武器类别 |
| {buff|buff} | --c-term | 增益 |
| {enemy|enemy} | --c-term | 战斗人员、勇士与数值 |
| {pickup|pickup} | --c-term | 元素拾取物、技能能量与护盾 |
| {art-perk|art-perk} | --c-artifact | 神器模组名 |
