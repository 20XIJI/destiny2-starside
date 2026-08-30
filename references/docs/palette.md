# 配色总览

描述：Starside 全站着色的色板——32 支渲染色与它们的语义 token，各带色号、色样与用途。
更新：2026.8.24
页脚：色号与 assets/site.css 的 :root 由 check_terms.py 逐条比对，两处必须一致。

## 渲染色

| 变量 | 色号 | 色样 | 用途 |
|---|---|---|---|
| == 七个元素 == |
| --c-arc | #5fd8e0 | {c-arc|Aa 汉字 123} | 电弧元素与其减益 |
| --c-stasis | #7fb4ff | {c-stasis|Aa 汉字 123} | 冰影元素与其减益 |
| --c-void | #c08cff | {c-void|Aa 汉字 123} | 虚空元素与其减益 |
| --c-strand | #7fdc86 | {c-strand|Aa 汉字 123} | 缚丝元素与其减益 |
| --c-solar | #ffb35c | {c-solar|Aa 汉字 123} | 烈日元素与其减益 |
| --c-kinetic | #eef7f2 | {c-kinetic|Aa 汉字 123} | 动能元素 |
| --c-prism | #f58fc8 | {c-prism|Aa 汉字 123} | 棱镜与超凡 |
| == 游戏内的其他编码 == |
| --c-artifact | #20c4b0 | {c-artifact|Aa 汉字 123} | 神器模组名 |
| --c-legend | #cf4a9c | {c-legend|Aa 汉字 123} | 稀有度：传说，行标题后那一截武器类别 |
| --c-exotic | #fcb70a | {c-exotic|Aa 汉字 123} | 稀有度：异域，含专属 Perk 名 |
| --c-orb | #dbc46a | {c-orb|Aa 汉字 123} | 能量球与超能能量 |
| --c-stack | #dbc46a | {c-stack|Aa 汉字 123} | 精准命中与增益层数 |
| --c-charge | #2f9fd6 | {c-charge|Aa 汉字 123} | 护甲充能与模组耗费，技能能量、充能与护盾 |
| --c-ammo | #cc44ff | {c-ammo|Aa 汉字 123} | 威能弹药 |
| --c-ammo-special | #3ff24f | {c-ammo-special|Aa 汉字 123} | 特殊弹药 |
| --c-health | #41b349 | {c-health|Aa 汉字 123} | 生命值与治疗 |
| --c-enemy | #d94452 | {c-enemy|Aa 汉字 123} | 战斗人员、勇士与数值 |
| --c-term | #d6c39a | {c-term|Aa 汉字 123} | 词表着色里不属于元素的游戏术语，兼图表曲线、强调色与轮换页的突袭标签 |
| --c-perk | #f9e9cd | {c-perk|Aa 汉字 123} | 武器 Perk 名 |
| --c-buff | #2f9fd6 | {c-buff|Aa 汉字 123} | 增益与引号里的 buff 名，首领生命值页的减伤列 |
| --c-bar-red | #ff8e86 | {c-bar-red|Aa 汉字 123} | 战斗人员档位：红血 |
| --c-bar-orange | #ffb35c | {c-bar-orange|Aa 汉字 123} | 战斗人员档位：橙血与守护者 |
| --c-bar-yellow | #f2ce5b | {c-bar-yellow|Aa 汉字 123} | 战斗人员档位：初级首领与首领 |
| == 站点自己的话 == |
| --c-debuff | #a2848c | {c-debuff|Aa 汉字 123} | 减益 |
| --c-unsure | #a2848c | {c-unsure|Aa 汉字 123} | 待测数值 |
| --c-pvp | #ee2746 | {c-pvp|Aa 汉字 123} | 方括号里的 PvP 数值 |
| --c-note | #eea6b7 | {c-note|Aa 汉字 123} | 注解：作者的话与限制说明，兼 DPS 页的模拟值 |

## 语义

| 标记 | 渲染色 | 用途 |
|---|---|---|
| {el-arc|el-arc} | --c-arc | 电弧元素 |
| {deb-arc|deb-arc} | --c-arc | 电弧减益：震颤、致盲 |
| {el-stasis|el-stasis} | --c-stasis | 冰影元素 |
| {deb-stasis|deb-stasis} | --c-stasis | 冰影减益：冻结、碎裂 |
| {el-void|el-void} | --c-void | 虚空元素 |
| {deb-void|deb-void} | --c-void | 虚空减益：虚弱、压制 |
| {el-strand|el-strand} | --c-strand | 缚丝元素，特殊弹药同色 |
| {deb-strand|deb-strand} | --c-strand | 缚丝减益：割裂、瓦解 |
| {el-solar|el-solar} | --c-solar | 烈日元素 |
| {deb-solar|deb-solar} | --c-solar | 烈日减益：灼烧、点燃 |
| {el-kinetic|el-kinetic} | --c-kinetic | 动能 |
| {el-prismatic|el-prismatic} | --c-prism | 棱镜与超凡 |
| {art-perk|art-perk} | --c-artifact | 神器模组名 |
| {perk|perk} | --c-perk | 武器 Perk 名 |
| {kind|kind} | --c-legend | 行标题后面那一截武器类别 |
| {exotic|exotic} | --c-exotic | 异域装备 |
| {orb|orb} | --c-orb | 能量球与超能能量 |
| {stack|stack} | --c-stack | 精准命中与增益层数 |
| {armor-charge|armor-charge} | --c-charge | 护甲充能 |
| {ammo-heavy|ammo-heavy} | --c-ammo | 威能弹药 |
| {ammo-special|ammo-special} | --c-ammo-special | 特殊弹药 |
| {health|health} | --c-health | 生命值与治疗 |
| {enemy|enemy} | --c-enemy | 战斗人员、勇士与数值 |
| {buff|buff} | --c-buff | 增益 |
| {pickup|pickup} | --c-charge | 技能能量、充能与护盾 |
| {bar-red|bar-red} | --c-bar-red | 红血 |
| {bar-orange|bar-orange} | --c-bar-orange | 橙血与守护者 |
| {bar-yellow|bar-yellow} | --c-bar-yellow | 初级首领与首领 |
| {debuff|debuff} | --c-debuff | 减益 |
| {unsure|unsure} | --c-unsure | 待测数值 [?] |
| {pvp|pvp} | --c-pvp | 方括号里的 PvP 数值 |
| {note|note} | --c-note | 注解：作者的话与限制说明 |

## 页面专属

| 标记 | 渲染色 | 页面 | 用途 |
|---|---|---|---|
| {cost|cost} | --c-charge | armor-mods | 模组的充能耗费 |
| {perk|perk} | --c-exotic | exotic-weapon、exotic-armor | 异域装备的专属 Perk 名 |
| {amp|amp} | --c-void | 首领生命值页 | 易伤列 |
| {res|res} | --c-buff | 首领生命值页 | 减伤列 |
| {sim|sim} | --c-note | dps | 模拟值 |
| {sk-arc|sk-arc} | --c-arc | elements | 棱镜页共享技能的电弧列 |
| {sk-stasis|sk-stasis} | --c-stasis | elements | 棱镜页共享技能的冰影列 |
| {sk-void|sk-void} | --c-void | elements | 棱镜页共享技能的虚空列 |
| {sk-strand|sk-strand} | --c-strand | elements | 棱镜页共享技能的缚丝列 |
| {sk-solar|sk-solar} | --c-solar | elements | 棱镜页共享技能的烈日列 |

## 同色待裁定

一支色号被几个族共用的地方。有意共用的写明理由，剩下的按同屏那一列排先后。
色号定完这一节即删。

| 色号 | 共用的族 | 状态 |
|---|---|---|
| #dbc46a | 能量球、层数 | 有意：同为资源与层数 |
| #2f9fd6 | 护甲充能与耗费、增益、技能能量与护盾、减伤列 | 有意：同为增益一侧 |
| #a2848c | 待测、减益 | 有意：同为限定语 |
| #ffb35c | 烈日元素、橙血档 | 待裁定：exotic-armor 页烈日×163 与橙血×54 同屏 |
