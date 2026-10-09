# 职业分支详解：DDC 逐条对照报告

日期：2026-10-08。覆盖电弧、烈日、虚空、冰影、缚丝、棱镜与职业技能。本次对分支仅做审计，不将新发现自动改进页面；四页修复另见 [修复与前后对比报告](ddc-repair-report.md)。不是线上部署核验或游戏实测。

## 覆盖

|页面|主条目|增强子行|额外核对|
|---|---:|---:|---|
|电弧|55|5|16 份碎片属性、冷却与模式限定|
|烈日|61|9|16 份碎片属性、冷却、重复效果正文|
|虚空|58|4|16 份碎片属性、冷却与未知值|
|冰影|44|6|16 份碎片属性、冷却、28 份重复效果正文|
|缚丝|44|5|14 份碎片属性、10 组冷却、重复效果正文|
|棱镜|43|0|21 份琢面属性、30 个共享技能矩阵格|
|职业技能|12|1|9 组冷却与回复倍率|

合计 317 个主条目、30 个增强子行；共享技能矩阵格与主条目存在复用，不把它们当作新增独立技能。各附件均有完整覆盖矩阵、原句、主键、字段、差异与来源疑点，没有只抽查代表技能。

## 优先处理的结论

- 烈日：烈焰之歌的伤害、消耗与例外规则有遗漏；烈日手雷混合了 PvE/PvP 条件；点燃遗漏 PvP 衰减。灼烧 PvE 公式与其下方 PvP 示例不是冲突，不再报错。
- 电弧/虚空：专注火花、坚韧回声的职业限定属性被显示成无条件并列惩罚；流动状态与若干星相的生效条件、目标范围或未知值未完整保留
- 冰影：碎片存在时间被写成破碎状态时长；Grounded 误译为扎根；部分未知回复倍率、减速层数/时间与接触伤害排除规则遗漏
- 缚丝：抓钩最大距离、束缚手雷接触触发、心纺输入条件与相邻事件间隔需要订正
- 棱镜：目标档位、触发计时、条件增量与部分星相副本存在漂移；详见逐项证据
- 跨页呈现：原表小字条件增量被铺成无条件算式；部分 PvP 未知数只有待测标记而失去模式标识；搜索索引的增强条目没有 desc，但实际 HTML 有正文，不能把索引问题说成页面缺文
- 来源自身疑点单列：风暴手雷强化两处 PvE 参数、凤凰俯冲 5/6.5 米、罗蕾莱与大型冰影碎片等不凭记忆或算术定真实机制

## 原表图片元数据补核（优先于附件早期的“槽位未知”结论）

DDC 文本快照不保存图片。父审计另取六张原表 HTML 的星相槽位图片，直接查看原图，并按同一源图片资产的身份核对不同尺寸引用；共核对 75 项。原图表示 2 或 3 个槽位，不用 manifest 数字反推 DDC 图示。四个重复尺寸链接返回 403，但同一源图片的另一尺寸已经直接读取，未把失败链接猜成一致。

74 项对应；唯一不对应：**虚空 Soul Siphon／灵魂虹吸，inventory 2321824286：DDC 图示 2，本站/manifest 3**（META-01）。这是两来源不一致，尚未自行改为 2，也不能凭此断定游戏内值。其它星相的具体对照如下。

|分支|星相（DDC）|主键|DDC 图示|本站实体值|结论|
|---|---|---|---:|---:|---|
|arc|Ascension|`4194622039`|3|3|对应|
|arc|Flow State|`4194622036`|2|2|对应|
|arc|Lethal Current|`4194622038`|2|2|对应|
|arc|Tempest Strike|`4194622037`|2|2|对应|
|arc|Juggernaut|`1656549673`|2|2|对应|
|arc|Knockout|`1656549674`|2|2|对应|
|arc|Storm's Keep|`1656549675`|2|2|对应|
|arc|Arc Soul|`1293395731`|2|2|对应|
|arc|Electrostatic Mind|`1293395729`|2|2|对应|
|arc|Ionic Sentry|`1293395728`|2|2|对应|
|arc|Lightning Surge|`1293395730`|3|3|对应|
|solar|Crackshot|`3066103997`|2|2|对应|
|solar|Gunpowder Gamble|`3066103996`|2|2|对应|
|solar|Knock 'Em Down|`3066103998`|2|2|对应|
|solar|On Your Mark|`3066103999`|3|3|对应|
|solar|Consecration|`2984351206`|3|3|对应|
|solar|Roaring Flames|`2984351204`|2|2|对应|
|solar|Shieldburst|`2984351207`|3|3|对应|
|solar|Sol Invictus|`2984351205`|2|2|对应|
|solar|Heat Rises|`83039194`|2|2|对应|
|solar|Hellion|`83039192`|2|2|对应|
|solar|Icarus Dash|`83039195`|3|3|对应|
|void|On the Prowl|`187655375`|3|3|对应|
|void|Stylish Executioner|`187655374`|2|2|对应|
|void|Trapper's Ambush|`187655372`|2|2|对应|
|void|Vanishing Step|`187655373`|2|2|对应|
|void|Bastion|`1602994569`|3|3|对应|
|void|Controlled Demolition|`1602994568`|2|2|对应|
|void|Offensive Bulwark|`1602994570`|2|2|对应|
|void|Unbreakable|`1602994571`|3|3|对应|
|void|Chaos Accelerant|`2321824285`|2|2|对应|
|void|Child of the Old Gods|`2321824287`|3|3|对应|
|void|Feed the Void|`2321824284`|2|2|对应|
|void|Soul Siphon|`2321824286`|2|3|不同：META-01|
|stasis|Grim Harvest|`1920417385`|2|2|对应|
|stasis|Shatterdive|`2934767476`|3|3|对应|
|stasis|Winter's Shroud|`2934767477`|3|3|对应|
|stasis|Cryoclasm|`2031919265`|3|3|对应|
|stasis|Diamond Lance|`3866705246`|3|3|对应|
|stasis|Howl of the Storm|`1563930741`|2|2|对应|
|stasis|Tectonic Harvest|`2031919264`|2|2|对应|
|stasis|Bleak Watcher|`2642597904`|2|2|对应|
|stasis|Frostpulse|`668903197`|3|3|对应|
|stasis|Glacial Harvest|`2651551055`|2|2|对应|
|stasis|Iceflare Bolts|`668903196`|2|2|对应|
|strand|Ensnaring Slam|`4249729126`|2|2|对应|
|strand|Threaded Specter|`4249729125`|3|3|对应|
|strand|Whirling Maelstrom|`4249729124`|2|2|对应|
|strand|Widow's Silk|`4249729127`|3|3|对应|
|strand|Banner of War|`988980154`|2|2|对应|
|strand|Drengr's Lash|`988980152`|3|3|对应|
|strand|Flechette Storm|`988980155`|2|2|对应|
|strand|Into the Fray|`988980153`|2|2|对应|
|strand|The Wanderer|`262821319`|2|2|对应|
|strand|Weaver's Call|`262821317`|2|2|对应|
|strand|Weavewalk|`262821312`|3|3|对应|
|prismatic|Ascension|`2835214901`|2|2|对应|
|prismatic|Gunpowder Gamble|`2835214903`|3|3|对应|
|prismatic|Stylish Executioner|`2835214900`|2|2|对应|
|prismatic|Winter's Shroud|`2835214902`|2|2|对应|
|prismatic|Threaded Specter|`2835214897`|3|3|对应|
|prismatic|Knockout|`1262901523`|2|2|对应|
|prismatic|Consecration|`1262901520`|2|2|对应|
|prismatic|Unbreakable|`1262901521`|3|3|对应|
|prismatic|Diamond Lance|`1262901522`|3|3|对应|
|prismatic|Drengr's Lash|`1262901525`|3|3|对应|
|prismatic|Lightning Surge|`790664812`|3|3|对应|
|prismatic|Hellion|`790664814`|2|2|对应|
|prismatic|Feed the Void|`790664815`|2|2|对应|
|prismatic|Bleak Watcher|`790664813`|2|2|对应|
|prismatic|Weaver's Call|`790664810`|3|3|对应|
|arc|Touch of Thunder|`1656549672`|2|2|对应|
|solar|Touch of Flame|`83039193`|2|2|对应|
|stasis|Touch of Winter|`4184589900`|2|2|对应|
|strand|Mindspun Invocation|`262821318`|2|2|对应|


# 附件：电弧


## 来源、范围与统计

源表：[Destiny Data Compendium — Arc，gid=618967225](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=618967225)。证据使用 data/ddc/618967225.json（下文 R 是 JSON 顶层数组索引 +1，不宣称是 Google UI 的物理行号）。全部 78 行均已读取；导航、表头、职业标题不当成技能。本站为本次读取时的生成索引/HTML，未自行构建。

覆盖：效果 5，碎片 16，手雷 7，猎人近战 2/超能 3/星相 4，泰坦职业技能 1/近战 3/超能 2/星相 4，术士近战 2/超能 2/星相 4，共 55 主条目；另 4 个暴雷之触手雷 enhanced 和 1 个电弧法杖-飞升 enhanced，共 60 本站语义核对单元。DDC 为 55 主资料行 +4 手雷强化资料行 =59 行，Arc Staff-Ascension 已写在同一主行。

映射：55/55 主条目、5/5 子行已定位；未映射实体 0；DDC 原文未能判定的槽位值 12 个，明确列在边界，不计作一致。50 inventory 英文名逐条读取；5 trait 英文名为 Amplified、Bolt Charge、Ionic Trace、Blind、Jolted。

结论：**不是全语义对应。**以下 16 个 findingID 按问题类型列证据，不把其数量等同为 16 个独立机制错误。数字多数对应不代表条件、对象范围或模式对应。

字段约定：I=inventory-items.json；T=traits.json；D=i18n.zh-CN.realgame_details；E=enhanced[0].realgame_details。所有矩阵正文都定位到相应 hash+D，除明确写 E/属性/冷却。矩阵“对应”表示在本次文本比较中除列出的全局问题外未发现其他差异，不宣称游戏实测。

## 差异、疑点完整清单

### ARC-01：专注火花职业限定属性变化丢失（确认）
DDC R15 Focus 属性格原句：`-10 Weapons (Hunter) / -10 Health (Titan) / -10 Class (Warlock)`。I/1727069360 的 investmentStats 保留三条 isConditionallyActive=true，但生成索引/HTML 数值栏实际为 `职业 -10 / 武器 -10 / 生命值 -10`，没有猎人/泰坦/术士限定。主文 `冲刺 1.25 秒后...基础充能速度额外 +150%[75%]...攒够 1 次充能即停止` 对应。不是应同时对三个属性无条件减值。

### ARC-02：流动状态闪身抗性的增幅条件被拆开（确认）
DDC R49 Flow State：`While Amplified: 200% Additional Base Class Ability Regeneration Rate, +50 Reload Speed, and 0.8x Reload Duration Multiplier. 66% [32%] Damage Resist during Dodge Animation.` 原始 cell 中 While Amplified 下两句间没有空白段。I/4194622036 D 当前：`增幅期间：职业技能基础恢复速率额外 +200%。+50 填装速度，换弹时长 ×0.8。` 随后独立段落 `闪身动画期间获得 66%[32%] 伤害抗性。` HTML 也是另一个 p，读者可理解成无条件闪身抗性；应在报告明确其原表增幅限定。

### ARC-03：风暴手雷 PvP 一轮/单发命中语义误译（确认）
DDC R37 Storm Grenade：`Guardians can only be hurt once by the barrage of bolts, regardless of pattern, for a maximum of 120 damage.` I/2481624867 D/HTML：`守护者每轮弹幕的每发矢弹也只受一次伤害，最多 120 伤害。` 原文是弹幕只能伤害一次、与 X/+ 图案无关，不是每发各伤害一次；本站遗漏 regardless of pattern 并扩大命中次数。PvE `Combatants can only be damaged once per barrage...751 [1062]` 则正确拆成未装/装量级 751/1062，不要把 PvP 120 或图案独立伤害拿来改 PvE 公式。

### ARC-04：DDC 风暴强化两处内部冲突，本站未披露（来源冲突，不判哪组真实）
DDC R38 手雷 Touch of Thunder 原句：`Creates a roaming storm for 4+1.5 seconds...initial speed of 2 [1.5] m/s, increasing to 4 [3] m/s after 1.3 seconds...deal 158 [30] damage up to 11+4 times.`
DDC R66 星相 Touch of Thunder 原句：`Creates a roaming storm for 4.5+1.5 seconds...initial speed of 2 [1.5] m/s, increasing to 5.5 [3] m/s after 1.6 seconds...deal 164 [30] damage up to 11+4 times.`
I/2481624867 E/HTML 采用 R66：`持续 4.5+1.5 秒，以 2 [1.5] 米/秒的初速...1.6 秒后提速到 5.5 [3] 米/秒...164 [30]...最多 11+4 次。` 差异四项：基础持续 4 vs4.5、提速后 PvE 4 vs5.5、提速时点 1.3 vs1.6、PvE 单次158 vs164。两处 PvP 初速1.5、最终3、单次30、次数11+4相同；不能把红色 `[3]` 当 PvE。本站只写一组确定数，未说明另一组冲突。

### ARC-05：闪光强化两处内部详略不同（确认来源遗漏）
DDC R30 手雷子行：`...dealing up to 684 [?] damage over 7.5 meters and inflicting blind...within 5 meters.`
DDC R66 星相详文：`...dealing up to 684 [?] damage, down to 0% damage over 7.5 meters...blind...within 5 meters.`
I/2909720723 E 当前 `接触时额外爆炸一次，最多造成 684 [?] 伤害，范围 7.5 米，并对 5 米内的战斗人员施加致盲。` 对应 R30，但少了 R66 的“7.5米衰减至0%”。它不是二者数值互相矛盾，而是星相处更详细。未知 PvP `[?]` 应继续未知。

### ARC-06：量级条件在风暴 enhanced 中退化成裸算式（确认呈现风险）
DDC R27 全局说明：`Numbers in [Smaller Parenthesis] are with Spark of Magnitude equipped!` R66 的 `+1.5` 与 `+4` 是蓝绿色 small；R20 明说 `Enhanced Storm's Roaming Storm lasts 1.5 seconds longer.` I/2481624867 E/HTML 实际 `持续 4.5+1.5 秒...最多 11+4 次`，没有明确“量级火花装备时额外+1.5秒/+4次”，没有小字标识；容易被当成无条件6秒/15次。R38 没给+1.5 small，但 R20/R27/R66 能明确其条件。闪电和脉冲基础段已显式拆未装/装量级，不能因此漏掉强化风暴的条件。

### ARC-07：全部五个 enhanced 在生成索引正文为空（确认结构差异）
DDC R30/33/35/38 和 R44 最末句都有正文；I/2909720723、2994412667、1713935764、2481624867、3769507633 的 E 都有文字。data/index/elements__arc.json 中 `闪光手雷（暴雷之触）`、`闪电手雷（暴雷之触）`、`脉冲手雷（暴雷之触）`、`风暴手雷（暴雷之触）`、`电弧法杖（飞升）` 都有 keys/name/icon 却没有 desc。HTML L50/L54 的 r-sub-row 实际含全部强化文字。故不能把“索引没正文”判为“页面没显示”，但依赖索引的说明读取无法获得它；本审计从 HTML 和原记录补齐子行，未静默跳过。

### ARC-08：enemy→战斗人员的全局范围风险（确认术语差异，不能据此断定已锁PvE）
原表明确区分 Enemy 与 Combatant。下列对应 D 实际把英文 enemy/enemies 写成 `战斗人员`，同时多处仍有红色 PvP 方括号：T/2935077680 R5 `over the damaged enemy`→`在被伤害的战斗人员上方`；T/3221118171 R8 `Jolted Enemies...all enemies within12`→`震颤的战斗人员...所有战斗人员`；I/1727069367 R11 `enemies within7.5`→`7.5米内的战斗人员`；3277705905 R12 `Blinded Enemies...enemies`→`被致盲的战斗人员...战斗人员`；3478354816 R18 `enemies within?`→`?米内的战斗人员`；1727069363 R19 `Jolted Enemies`→`震颤的战斗人员`；1727069366 R23 `at least3 enemies`→`至少3名战斗人员`；1582574009 R28 全部 scan/chain敌人→战斗人员；2909720723 R29及E R30/66 致盲 enemies→战斗人员；4198689901 R31 attach/stick enemy→战斗人员；2994412667 R32 attach enemies→战斗人员；146194908 R36 seeker enemies→战斗人员；2481624867 E R38/66 chasing enemies→战斗人员；2716335210 R42 blind enemies→战斗人员；3769507633 R44 airborne blind→战斗人员；3769507635 R46 radial/whirling enemies→战斗人员；4194622039 R48 jolting enemies→战斗人员；4194622036 R49 Jolted Enemy Kill→战斗人员；4194622038 R50 direct hits/aftershock enemies→战斗人员；4194622037 R51 Jolted Enemy Kill→战斗人员；2708585276 R56 radius/per enemy→战斗人员；2708585277 R57 no enemy hit/autotarget/radial→战斗人员；119041299 R60 knock enemies→战斗人员；119041298 R61 collision/impact enemy→战斗人员；1656549674 R64 Enemy Shield/enemy below30→战斗人员；1232050830 R69 enemy under/direct enemy→战斗人员；1232050831 R70 直击/连锁/不同目标/一次命中 enemies→战斗人员；1081893461 R72 same enemy→战斗人员；1081893460 R73 knock/targets enemies→战斗人员；1293395731 R75 targets enemies→战斗人员；1293395729 R76 affected enemies→战斗人员；1293395728 R77 landing/shooting/chain enemies→战斗人员；1293395730 R78 per enemy hit→战斗人员。
这不是要求把原表 Combatants 的抗性/反射规则扩大到PvP；其原词必须保留。本站现有方括号说明PvP数值，不能轻率声称这些规则都是PvE-only；应按原词“敌人/目标”与“战斗人员”分清，或报告明确术语风险。矩阵对应结论均受本条限定。

### ARC-09：Bosses 被写为初级首领（确认原词粒度不对应）
DDC R5 小字 `Freeze Shatter (Not auto-shatter on Bosses)`、`Suspend Snap on Bosses`；T/2935077680 D 实际 `冻结碎裂（初级首领的自动碎裂不算）`、`初级首领身上的悬停急拽`。Bosses 不是 Minibosses；不应把此例外/触发对象缩到初级首领。
另 R4/R13/R64 `Miniboss+` 的本站 `初级首领` 没有“及以上”：T/3291013836计数100%、I/1727069362计数100%、I/1656549674回血100。原表加号覆盖更高档，不应丢失。

### ARC-10：计时窗口措辞风险（确认原文不同精度）
DDC R4 `within 6 seconds of each`；T/3291013836 D `6 秒内用电弧击杀把计数推满`，容易变成从第一杀起固定6秒窗口，而原句是相邻事件间隔。DDC R5 `Weapon Damage Instances within 5 seconds of each`；T/2935077680 D `每在 5 秒内攒够规定次数的武器伤害实例`同样容易变成固定窗口。R10 `2 kills within 4 seconds of each`本站 `4秒内连续击杀2次`，只有两个事件，不产生同样的累计总窗口差异。

### ARC-11：反馈火花PvP重击限定不够明确（条件表达风险）
DDC R14：`100% [50% | 15% while Knockout is active] Increased Melee Damage...`，重击的15%嵌在红色PvP括号内。I/3277705907 D `伤害提高100% [50%]；重击激活期间为 [15%]。` 虽15%仍pvp着色，中文分号后的无模式主语可被读成连PvE100%也替换；应明确“PvP在重击期间15%，PvE仍100%”，不自行猜额外交互。

### ARC-12：浩劫之拳添加“每段”方向键要求（确认过强断言）
DDC R60：`Slam deals 4 additional damage instances...if the user is in the animation for at least 1 second. Requires inputting a directional key.` I/119041299 D/HTML `若在动画中停留至少1秒...且每段需要输入方向键。` 原表只要求输入方向键，未要求四段分别输入。

### ARC-13：推进器额外地面限定（本站有、Arc原表无）
DDC R54 Thruster 原句仅第一人称dash、Combatant Projectile Tracking?、Guardian Aim Assist、8米输入/4米后退；I/489583098 D 附 `只能在地面上使用。` 该句在本目标DDC Arc行无出处。只标原表未支持，不推断游戏一定错误。

### ARC-14：雷霆一击添加乘算标签（本站有、Arc原表无）
DDC R58 `gradually dealing up to100% increased damage after charging for2seconds`；I/2708585279 D `最多+100%（乘算）`。“乘算”对与其他增益叠加的解释原表未给；百分比increase本身并不能证明所有外部叠加关系。

### ARC-15：频率火花把DDC作者断言标成本站实测（归属风险）
DDC R16 `In-game tooltip mentions increasing the fragment's effects, which is not true, at least for the Reload Speed bonuses.` I/1727069361 D `游戏内提示称...实测并非如此——至少填装速度加成不受影响。` 效果语义对应，但“实测”是谁测的不明。全文footer只说DDC基础上统一术语/排版，无法证明Starside自测，应归属DDC说明。

### ARC-16：源表内部未解疑点（保留证据、不算本站擅自算错）
(a) R20 Magnitude `Pulse Grenade...maximum of8pulses` 与 R34 `on impact156[50]`+`additional5+2times249[80]` 的计次数可通过将初始爆炸也计为一段理解，但 R34 明列总值 `1245 [1743] [530 [690]]`。I/1727069374 D `最多8次`、I/1713935764 D `此后...共5次...合计最多1245[530]...1743[690]`沿用源值，PvE所称总值不像包含初始156，PvP530/690又包含50。不能擅用算术改成1401/1899；应说明“原表所列total”并记录是否含初始爆炸待确认。
(b) R69 Ball Lightning 额外每道163[?]，总714[240]；I/1232050830 D沿用这些值。PvP额外道未知，不能从240反解并伪装已测；本站 `3道全部直接命中`会把直接冲击与3道落雷混成一类，原句为 `upon scoring a direct hit alongside all3lightning strikes`，更准确应是“直接命中并且3道闪电全部命中”。
(c) R73 Stormtrance `5% every0.33seconds...65% after3.33seconds` 看起来分段增长/到顶时点有疑点；I/1081893460 D沿用原文，不应自行猜替换。R63 Juggernaut50HP/33%DR/75eHP是源表近似数，不凭舍入认为本站错误。

## 全覆盖语义证据矩阵

下表D均为真实中文正文对应，不仅数字集合。`[ ]`模式依原始颜色：红色为PvP；蓝绿色small为量级火花，不能混同。未逐字复写所有颜色标签，但未知值保留问号。属性列未标变动即DDC `-`，本站无属性增减（另16枚皆显示碎片消耗1，该cost不来自本DDC表）。

### 效果（T）
|R / 英文|主键/中文|原句及实际中文证据/覆盖|结论|
|4 Amplified|3291013836 增幅|`Intrinsic Arc Subclass Buff...100%Counter...6seconds of each...25/50/100/50`; 中文固有增益、6秒推满、红25橙50初级首领100守护者50；+50Mobility/8.5m/+40Handling/0.95x/15s均显示；对Combatants15%抗性/瞄准精度、冲刺2.5s、SpeedBooster满速度/11m/+25%跳高/15%抗性/停留2s/死前基础6.5→8.5滑铲皆有|ARC09/10；其余对应|
|5 Bolt Charge|2935077680 电光充能|`next damage instance from any source...swapping resets...1stack per simultaneous instance`; 中文下一次任意来源、换武器清零/同刻至多1；mag15%floor+1/刀剑榴弹2/三发狙1、2.5%每层/超10仍返还/9+4返10%示例、满10技能或非充能近战0.5s、405+270=675[36+30]/?m/非Ability通用Arc、7项触发与4项不触发均已写|ARC08/09/10|
|6 Ionic Trace|3824458961 离子轨迹|`home...6m/s...11.25% Grenade and Melee...13.5%Class...Allies do not receive`; 中文6米/秒、11.25%手雷近战/13.5%职业、盟友不生效|对应|
|7 Blind|500183315 致盲|`Combatants...unable to attack or use abilities10s; GuardiansHUD...whitened...audio3s; Unstoppable...Stunned`; 中文对应全部三段|对应|
|8 Jolted|3221118171 震颤|`10[5]s...119[51]...12m...taking115[45]...refresh...applyinghitcounts...0.8s...Guardians...unless otherGuardians...OverloadStunned`; 中文阈值/链击/刷新/计数/冷却/PvP例外/勇士全部在|ARC08|

### 碎片（I；R10–25全部）
|R/英文|hash/中文|原句→实际中文核对，属性|结论|
|10 Amplitude|3277705906 增幅火花|`WhileAmplified...2killswithin4s...Orb2.5%...triggeringkillcounts...10scooldown/killsdon'tcount`→增幅2杀4秒/球2.5%/触发增幅那杀计入/10秒期间不计数；无属性|对应|
|11 Beacons|1727069367 信标火花|`Special and Heavy Ammo ArcWeaponKills whileAmplified...Blind7.5m`→增幅期间特殊与威能电弧武器击杀7.5米致盲；无属性|ARC08|
|12 Brilliance|3277705905 光辉火花|`PrecisionKills againstBlindedEnemies...blastBlind7.5m`→精准击杀致盲目标再爆炸致盲；+10Super→超能+10|ARC08|
|13 Discharge|1727069362 放电火花|`ArcWeaponKills100%...34/67/100/67; pickup x1Bolt`→34/67/初级首领100/守护者67与轨迹1层；-10Melee→近战-10|ARC09|
|14 Feedback|3277705907 反馈火花|`physicallystruck...nextMeleeHitwithin5s...notrefreshable`→物理命中后5秒下一次近战/不可刷新；100%[50%|15%Knockout]，+10Health→生命值+10|ARC11|
|15 Focus|1727069360 专注火花|`1.25ssprint...maintainingbothsprintandspeedatleast5...150%[75%]AdditionalBase...1charge readied`→条件/基础速率/停止条件均有；职业特定减10见ARC01|ARC01|
|16 Frequency|1727069361 频率火花|`MeleeHit+15Stability/+50Reload/0.8x5.25s; whileAmplified(almost)allsourcesextra1; tooltipnottrueatleastReload`→稳定15/填装50/0.8/5.25秒/几乎所有来源额外1/提示不符均有；无属性|ARC15归属|
|17 Haste|3478354817 急速火花|`1.25ssprint...atleast5m/s...+50HealthStat`→条件完整/生命值属性+50；无常驻属性变化|对应|
|18 Instinct|3478354816 直觉火花|`CriticalHealth...damaged...up to46[20]/Jolt?m/15?scooldown`→重伤受伤/最多46[20]/?米/15?秒；无属性|ARC08|
|19 Ions|1727069363 离子火花|`KillingJoltedEnemies orBoltChargeKill...Trace...10scooldown`→两种击杀/轨迹/10秒；无属性|ARC08|
|20 Magnitude|1727069374 量级火花|`Lightningadditional1max5; Pulseadditional2max8; Stormadditionalbarrage; enhancedStorm+1.5s`→四项完整；无属性|ARC16a来源疑点|
|21 Momentum|1727069365 动量火花|`slidingAmmoBricks notFull ofrespective type...Refills equippedweapon/x3Bolt`→同类型未满/滑铲补满已装备武器/3层；无属性|对应|
|22 Recharge|1727069375 充能火花|`reachingCritical...400%[200%]AdditionalBaseGrenade/Melee...untilShieldsfullyrestored`→进入重伤/基础+400[200]/盾全恢复；无属性|对应|
|23 Resistance|1727069366 抗性火花|`within15m atleast3enemies...25%[10%]DR...lingers2s`→15米3名/25[10]/2秒；+10Melee→近战+10|ARC08|
|24 Shock|1727069364 震颤火花|`ArcGrenadesJoltonhit; ArcSoul/IonicSentry4scooldownbeforeJoltagain`→手雷命中震颤/两种造物4秒再施加；-10Grenade→手雷-10|对应|
|25 Volts|3277705904 伏特火花|`FinishersAmplified/x1Bolt`→终结技增幅1层；+10Class→职业+10|对应|

### 手雷与强化（I）
|R/英文|hash/中文|完整条件/伤害/小字/冷却核对|结论|
|28 Arcbolt|1582574009 电光手雷|HeavyTrajectory/Scan→重型弹道扫描；impactLoS12m nearest/after1s/chainnearestunhit10m/max4→完整；521[85]；CD151.5/chunk0.75→基础冷却151.5/回复0.75|ARC08|
|29 Flashbang|2909720723 闪光手雷|Medium；speedreduced/briefdelay；684[120]falloff0%7.5m/blind10m up to5[3]s/selfimmune→全部有；CD131.7/chunk0.875|ARC08|
|30+66 Flashbang enhanced|2909720723 E|additionalimpact684[?]/7.5m/blind5m→额外一次684[?]/7.5米/5米致盲|ARC05/07/08|
|31 Flux|4198689901 粘性电浆手雷|almoststraight/slighttracking/sticky；enemy/surface1.7s；901[150]falloff0%6m；stuckenemy+66.7%→1500[250]；CD105.4/0.875均有|ARC08|
|32 Lightning|2994412667 闪电手雷|medium/wallmounted；attachenemy/surface/laser1s；every1.67s4+small1；373[120]，1492[1865-small]与480[600-small]→明确拆4道1492[480]/量级5道1865[600]；CD219.5/0.5|ARC08；量级模式拆正确|
|33+66 Lightning enhanced|2994412667 E|extraGrenadeCharge/Joltafterfirst/x5Bolt onceperbolt→额外一次充能/首道之后震颤/每道至多5层；两处一致|ARC07|
|34 Pulse|1713935764 脉冲手雷|medium；impact156[50]/6m；0.7s/249[80]/additional5+small2；total1245[1743-small]/530[690-small]→完整拆未装/装量级；CD175.6/0.625|ARC16a；不擅算纠正源值|
|35+66 Pulse enhanced|1713935764 E|hits/damagingenemy Trace1scooldown/ramp2/9/18.5/24/25%第5起→全部对应；R66另说25%最大亦由序列写出|ARC07|
|36 Skip|146194908 弹跳手雷|medium/seekers；impact4；chase6m/explodeafterdamage/selfdestruct~2slowvelocity；each24[4]twice+90[15]/all4total552[92]；CD151.5/0.75均有|ARC08|
|37 Storm|2481624867 风暴手雷|medium/impactfocusedafter0.85s440[70]7m；0.6safterfirst X311[50]/Magnitude+311[50]；Combatantonce/barrage751-small1062正确，Guardian规则错；CD175.6/0.625|ARC03|
|38+66 Storm enhanced|2481624867 E|本站采用R66的4.5/5.5/1.6/164，未披露R38的4/4/1.3/158；相同PvP1.5→3/30及11+4|ARC04/06/07/08|

### 猎人（I）
|R/英文|hash/中文|语义覆盖证据|结论|
|41 Combination Blow|2716335211 组合打击|MeleeKill100%Class/100Health/stack20smax3/BasicArcInfused/70ClassfullGambler；层1/2/3伤害133[23]/266[51.3]/400[86]与回血80/60/40全部有；CD58.1/chunk1|对应|
|42 Disorienting Blow|2716335210 迷失一击|162[?]impact/976[?]splash/?%7m/blind8.5s9.6m/onhitAmplified2Bolt→完整；CD118.8/0.9|ARC08|
|44 Arc Staff|3769507633 电弧法杖|DR90[53]/20s5%drain/kill1Bolt；light2.5%864[?]8mgroundchain3；groundheavy8%1264[?]45°8m；airheavy8%?1264[?]blind7m；palmLightLightHeavy2950[?]blind45°8m；guard?%/180?°allblockreflect/1Boltperreflect/projectilesreticle100%Combatant；classnodrain/dodge?%[?%]；T2/CD556均有|ARC08；未知均保留|
|44 Ascension enhanced|3769507633 E by4194622039|`Allows repeatedusageofAscension whileAspectequipped atcost?%Super`→装备飞升可反复使用/消耗?%超能，HTML可见|ARC07；机制对应|
|45 Gathering Storm|3769507632 风起云涌|DR90[49]；throw/embed；impact544[300]Jolt/explosion608[?]10m；after2s1350[500]10m；after1.2sfield446[60]every0.7s10mfor8s；T3/CD500完整|对应|
|46 Storm's Edge|3769507635 风暴边缘|DR90[45]/duration?drain?；homingknife90[?]+171[45?]3m/teleport/whirl1440x2[300?]6m/?%eachmax3；T1/CD625全部有|ARC08|
|48 Ascension|4194622039 飞升|airborne/classchargeready/AirMoveconsumes/upwardsTwirl/triggersclassuse；Amplifiedselfallies10m/damage181[?]Jolt10m/ClassStat>100up to65[?]%at200→完整|ARC08；槽3见边界|
|49 Flow State|4194622036 流动状态|JoltedEnemyKillAmplified；whileAmplifiedClassBase+200/Reload50/0.8；DodgeDR66[32]|ARC02/08；槽2见边界|
|50 Lethal Current|4194622038 致命电流|DirectMeleeJolted→Blind；ClassUseLunge7m/nextMeleeTempestwithin10sJolt/aftershock195[?]6m→完整|ARC08；槽2|
|51 Tempest Strike|4194622037 裂空打击|JoltedKill1Bolt/nonstackDielectric；slideMeleeuppercutArcWave22m739[125]Jolt/75%CombatantDR4?s/no use ifshooting；Combinationeffects/damageyes Disorientno→全部有|ARC08；槽2|

### 泰坦（I）
|R/英文|hash/中文|语义覆盖证据|结论|
|54 Thruster|489583098 推进器|firstpersondash/CombatantProjectileTracking?/GuardianAimAssist/8mhelddirection/noinputback4m；CD52.1/chunk1全部有|ARC13；未知追踪仍?|
|56 Ballistic Slam|2708585276 弹道猛击|airborne/sprint0.03/descendground/min210[65]nofalloff8m/perenemy3%Super3Bolt/fallingtime/~1000maxjumpdiagonal/cannotmelee0.9s；CD164.6/0.7完整|ARC08|
|57 Seismic Strike|2708585277 地震打击|sharedshoulder/sprint1.25/noenemy15%/no slideifshoot/Guardianlungeoff0.5s；lunge6.8m/autotarget；1073[110]+391[40]radial6mBlind8[1.6]；AmplifiedBlind10m10[3]s；CD131.7/0.8完整|ARC08|
|58 Thunderclap|2708585279 雷霆一击|chargeable703[120]cone7.5wide16m/charge2smax100%/80%CombatantDRanimation+?s；CD131.7/0.9完整|ARC14|
|60 Fists of Havoc|119041299 浩劫之拳|DR90[58]/25s4%drain/light6%499[?]knock/nextheavy4x273[?]；heavy12%1619[?]11mBlind/castwithoutaftershock/animation≥1s4x273/directionalinput/up to4aftershocks292[?]；T2/CD556完整|ARC12/08|
|61 Thundercrash|119041298 雷霆冲击|DR90[25]/up to4.5s22.2%drain/closeflight150[?]collision/impact180[?]+8260[?]over10m/after0.75s108[?]every1s4s；T2/CD556完整|ARC08|
|63 Juggernaut|1656549673 无畏护甲|sprint>~4/fullClass/Frontal50HP/perblock1Bolt/Amplified33%DR75eHP/active60[10]%splash+10CombatantDR/lastabsorbeddepleteClass/stackotherovershield→完整|对应；槽2|
|64 Knockout|1656549674 重击|MeleeKill0.1sheal/startregen/Amplified；rank50elite75Miniboss+100Guardian30；breakShield orenemy<30%6s；BasicGlaive160[30]/Charged160[20]/BasicArcPowered/LungeCombatant6m完整|ARC08/09；槽2|
|65 Storm's Keep|1656549675 风暴要塞|Classuse4Bolt/Thruster6；behindBarricade1every0.6/weaponcantrigger/Frequencydoesnotincrease/nonstackmultiple→完整|对应；槽2|
|66 Touch of Thunder|1656549672 暴雷之触|D只写`强化闪光、闪电、脉冲、风暴四种手雷，逐条效果见手雷技能`；全部机制已转挂各手雷E/HTML，非遗漏整个星相|ARC04/05/06/07；槽2|

### 术士（I）
|R/英文|hash/中文|语义覆盖证据|结论|
|69 Ball Lightning|1232050830 球形闪电|forward35m/strikeenemyunder4?m|maxdistance|impact；271[70]over2?m/directextra117[30]；Amplifiedadditional2each163[?]/total714[240]direct+3strikes；CD164.6/0.7完整|ARC08/16b|
|70 Chain Lightning|1232050831 连锁闪电|lunge6m/ArcExclusive2charges/direct390[100]Jolt/releasechain265[54]9mmax5/notmostrecent；Amplified2setsdifferenttargetdoublemax/eachonlyonce；CD131.7/0.9完整|ARC08|
|72 Chaos Reach|1081893461 混沌之触|DR90[55]/4s25%drain/moves4.5；beamreticle378[?]every0.13/no damagefirst0.67/7hitsoneenemy202[?]Joltstrike/earlyrefundmax30immediate；T4/CD455完整|ARC08|
|73 Stormtrance|1081893460 雷霆万钧|DR90[58]/16s6.25%drain/cast690[?]6mknock/5seekers440[150]Jolt16s；light?%/range12m178[90]every0.34/5%every0.33max65after3.33/decayafter2nodamage；heavySprint/IonicBlink6.25%7mcurrentdirection；T2/CD556完整|ARC08/16c|
|75 Arc Soul|1293395731 电弧之魂|Riftself/allies/reentryrefresh；15s/69[11]ArcGrenade/3burst100RPM24m/Grenadeinteractions；allies15?m BaseClass40[20]/80[40]/120[60]；Amplified5burstoverall225RPM完整|ARC08；槽2|
|76 Electrostatic Mind|1293395729 电荷思维|ArcAbilityKills orArcDebuffedEnemyKills Trace/1?scooldown/pickupAmplified完整|ARC08；槽2|
|77 Ionic Sentry|1293395728 离子哨兵|Arc/KineticKill6charges/Weapon1[2]Ability2[?]/replacegrenade/countArcGrenadeAbilityinteractions；landingBlind5m10?[3?]s/shootevery1srange16m202[50]/chainadditional6m/1Boltonhit/15s/?ConstructHP/selfimmune/6scooldown killsdon'tcharge完整|ARC08；槽2；未知不反算|
|78 Lightning Surge|1293395730 闪电激涌|slideMeleewarp10m/5pentagonbolts7mfromexit/perenemy1Bolt/Amplifiedonuse/notpast1without hit/CombatantDR?%?s/no slideifshoot/634+127=761[105+47=152]simultaneousJolt完整|ARC08；槽3|

## 属性、冷却、槽位、附注核对边界

1. 全部7个手雷、7个近战、1个推进器：Base Cooldown和Chunk Scalar都按矩阵逐项核对，未发现对应数值差异。7个超能Tier/冷却亦逐项对应；没有把Chunk Scalar误判成Base regeneration，中文“回复倍率”的进一步解释不在这份Arc表中。
2. 16碎片属性变化：光辉超能+10、放电近战-10、反馈生命+10、专注职业限定三个-10（丢限定）、抗性近战+10、震颤手雷-10、伏特职业+10；其余9枚原表无属性变化，生成页亦无额外常驻属性。所有碎片显示cost1，这是本站manifest元信息，本DDC表无cost列，**不计作DDC核实**。
3. 12个星相在DDC JSON各行尾的Fragment Slots数据缺失（单元格是空或整行数组至D格即止），不能用生成HTML的i个数证明DDC对应。本站实际槽数：飞升3、流动2、致命2、裂空2；无畏2、重击2、风暴要塞2、暴雷2；电弧之魂2、电荷思维2、离子哨兵2、闪电激涌3。已经尝试原书htmlview?gid=618967225：reader只返回标题/元信息，未给表体；再尝试pubhtml/sheet?headers=false&gid=618967225得到HTTP401。故槽位是明确未完成原表值证实的维度，不假装匹配，也不猜其图片中的圆点。父代理若能通过完整raw htmlview拿到图/表体，可补这一列；这不影响本次全部文本条目已映射的结论。
4. 原快照所有small/sup/sub已按原HTML检索：small涉及Bolt Charge溢出例子/Boss例外/非技能来源括注、Frequency(almost)、Lightning量级次数/总伤害、Pulse量级次数/总伤害、Storm量级PvE总伤害、星相Storm +1.5/+4；没有发现另一个未映射sup/sub公式。PvP模式值依red style，不凭方括号形状判断。
5. 全局R27量级小括号说明已纳入，但本站footer只声明DDC与术语排版统一，没解释风暴强化的裸+1.5/+4条件、DDC两组风暴值冲突、未知符号约定，也无本站验证证据。未知问号仍大量保留且HTML用了unsure，这本身是正确保留来源不确定性，不能据游戏记忆补确定数。
6. 当前索引和HTML是审计对象，不是此次修复后产物。本轮纯审计，没修改任何字段、源稿或生成HTML，没有build/test/lint/format/browser/deploy/git动作。完整报告通过本次结构化输出交付，供父代理保存；不宣称已落盘 local文件。


# 附件：烈日


## 证据与边界

主源：[DDC Solar，gid=1186062409](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409)，本机 data/ddc/1186062409.json。下文 R 是这个 JSON 顶层数组的 1 起序号，不宣称等同 Google 表格原始行号。跨表源：[DDC Class Abilities，gid=527596209](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=527596209)。本站证据是当前 data/index/elements__solar.json 和实际 site/elements/solar/index.html，未构建。

本站中文引用剥去 HTML/着色包装，保留正文、数值及未知符号。下面矩阵以每个主条目为单位完整覆盖机制正文；冷却与回复倍率另列，不用数值集合替代语义比对。重复 perk 用命名空间 perk:hash，不与 inventory-item 混同。

字段缩写：T = data/traits.json/<hash>/i18n.zh-CN.realgame_details；I = data/inventory-items.json/<hash>/i18n.zh-CN.realgame_details；M = data/minted.json/<hash>/i18n.zh-CN.realgame_details；E = data/inventory-items.json/<hash>/enhanced[index].realgame_details；P = data/sandbox-perks.json/<hash>/i18n.zh-CN.realgame_details。冷却 = inventory.site_cooldownSeconds；回复倍率 = inventory.site_recoveryMultiplier；槽位与属性变化 = inventory.investmentStats，经实际 HTML 呈现确认。

只读工具不提供写入，未尝试写 local；父代理可直接将此完整 report 保存为 local://solar-branch-audit.md。未编辑分支发现，未触及搜寻者记录；未运行 build/test/lint/formatter、浏览器、部署或 git 操作。

### 覆盖统计

- 主条目 61/61：效果/缩放 7，碎片 16，手雷 8，猎人 12，泰坦 8，术士 10。
- enhanced 子行 9/9：火焰之触强化手雷 4，无敌索尔强化超能 2，炙热升腾强化凤凰俯冲/烈焰之歌 2，伊卡洛斯突进强化黎明 1。
- 碎片属性变化 16/16；本站碎片消耗均为 1，DDC 本页不提供消耗字段，不能把这个额外 manifest 数值说成 DDC 核验通过。
- 星相槽位实际 HTML 12/12 已读；DDC 快照这 12 行的 Fragment Slots 单元格没有可读值，故槽位不能与 DDC 文本独立核实。列出本站值，不报伪匹配。
- 全部重复 perk 索引正文已读；28 个机制正文（16 碎片+12 星相）及 11 个属性变化重复条目均覆盖。发现 4 个星相重复正文与主条目明显不一致。
- DDC Solar 的实体行均能映射，未发现整项实体漏收；DDC 独立的 Hammer of Sol (Sol Invictus Aspect) 已映射为 enhanced，不是缺页。
- 20 组审计发现（SOL-01 至 SOL-20），其中 SOL-18/19 为应保留的来源疑点，SOL-20 为呈现/可检索边界。每组可含多个原子差异，不能将 20 误写成仅 20 个错误句。

## 真实差异、额外断言与来源疑点

### SOL-01 点燃遗漏 PvP 衰减
T/3268862716。R8：`in a 8 meter radius without [with] damage falloff.` 原始 inline 无衰减为蓝色 PvE，`[with]` 为粉色 PvP。本站：`范围内无衰减。` 无模式限定，丢失 PvP 有衰减。其余 676/[120 Guardians|250 Construct]、1.6 秒、初始灼烧来源、近战不缩放及勇士眩晕一致。

### SOL-02 Solar Effect 归属与范围收窄
M/4294967314。R10：`the source used for initially scorching will determine what it will be counted as.` 本站：`最初点燃它的那个来源`，把最初施加灼烧误译为最初点燃。原文全篇 Solar Effect 明定 `(Scorch | Ignition)`，本站后续多处只称 `灼烧效果`，标题也是 `灼烧效果伤害缩放`，容易漏掉点燃。原文 `on top of Combatant Rank Scalars` 未保留，本站 5% 句缺少在战斗人员等级标量之上的条件。其它武器/技能分别归属、只加武器活动修正、Grenade/Super respectively、近战增益和 100+ 近战属性不缩放、全技能和全烈日活动修正，均已收录。

### SOL-03 仁慈自触发遗漏与额外限制
I/362132292，重复 P/3947122023 同样有问题。R14：`Can self-trigger Benevolence with Empowering/Well of Radiance Seekers from Assembler Boots.` 本站：`光焰之井追踪器经装配工之靴强化后，可以自己触发一次仁慈。` 漏 Empowering seekers；`一次` 是原句没有的限制；装配工之靴与同段的汇编器战靴命名不统一。7/[4] 秒、额外基础充能 +300%、触发/不触发列表其余项一致。

### SOL-04 烧焦例外对象扩大
I/362132291、P/2243276296。R16：`Does not apply to the ignited enemy.` 本站：`对已被点燃的战斗人员不生效。` 原句指引发本次点燃的那个目标，不是所有已经被点燃过/正在点燃的目标。40+20 层一致。

### SOL-05 烈日手雷混合 PvE/PvP 并删不稳定性
I/2216698406。R36 原始 inline：蓝色 PvE `Does not Scorch within its DoT Field ... up to x17+13 ... when it expires, although it's inconsistent.` 粉色 PvP `Inflicts x1 Scorch after 0.75 seconds, followed by x7.5+2.5 Scorch every 0.533 seconds, up to x53+27 ...`。本站把两段全部作为无模式的统一机制，且将前者写为 `场域内不会立刻烧起来`（不是“不会在持续伤害场域中施加灼烧”），漏 `although it's inconsistent`；最后 1 秒开始 `dealing damage or inflicting scorch` 只保留造成伤害。不能把 0.75 秒与 1 秒直接拿来算冲突；必须保留原表模式和时序措辞。伤害、范围、持续、冷却、强化子行数值一致。

### SOL-06 速射神枪附带条件丢失
I/3066103997、P/2968111151。R54：`lower framerate = slower same animation duration` 本站仅 `射速随帧率变化`，遗漏低帧率变慢但动画时长不变。原句 `Acrobat Dodge's Radiant applies before Crackshot is fired.` 本站 `空中闪身的焕光在开火之前就已施加`，将 Acrobat's Dodge（特技闪身，特定装备职业技能）误写为任何空中闪身。标记◇的形状丢失属呈现，不报数值错误。

### SOL-07 各就各位源内范围重复句未表达
I/3066103999、P/146926598。R57 首段给 user+15m allies，但另单列 `Class Ability Usage grants a stack ... to the user.` 本站只保留统一“自己与盟友”，省略后面的 user-only 重复句。原表自身有作用范围歧义，不能自行推断职业技能一定给盟友或只给自己，应引用并注明待确认。未知填装速度/倍率已保留；守护者精准命中的 1 秒冷却在 HTML 作为普通文字，没有 PvP 包装。

### SOL-08 投掷飞锤边界轻微扩大
I/852252789。R61 `<2m = Base | 2-4m = 6%`。本站 `2 米以内 基础 ｜ 2–4 米 +6%` 使 2 米落入两档；“2 米以内”通常包含 2 米，原文是严格小于。不是要求算术纠正；应保持原表边界。539/[90]、其余距离档、121.5%、治愈、10 秒爆炸和近战归属一致。

### SOL-09 烈焰战锤 flares up 被误译为升空
I/2747500761。R64 `Hammers visually flares up after being airborne for 0.7 seconds, increasing Shrapnel amount to 5.` 本站 `飞锤在空中 0.7 秒后视觉上升空`。原文是飞锤视觉上燃起/闪耀，不是继续升空。其余基础弹片/攻击参数一致；罗蕾莱数值另见 SOL-18。

### SOL-10 神圣献祭动作条件误译
I/2984351206。R67 `Only consumes 50% Melee Ability Energy if the slam is not activated.` 本站 `未处于猛击状态时只消耗 50%`，原句是未发动第二段猛击的条件，不是“某状态”。伤害和非近战减伤一致。重复 P/410180492 另丢 +20 骨灰增量，见 SOL-17。

### SOL-11 盾爆漏资格、充能速率单位及指引
I/2984351207、P/2994175687。R69 `allows usage of Hammer Strike until landing, even after firing midair.` 本站末条件 `even after firing midair` 未收录；这里正是与肩撞开火规则的交互。R69 `Dealing damage ... ~100 damage per 1 second charged.` 本站 `造成伤害按每秒约 100 点伤害额外积攒`，把“约造成 100 伤害换 1 秒充能”写成了伤害每秒速率，缺换算的 1 秒。`Towering | Rally` 本站被动进度段译成 `高墙 | 集束`，与其它段 `巍峨屏障 | 集结屏障` 不统一。Scorching Rounds 只写名字，原表明确指向 Song of Flame section；本站盾爆段无指引，读者无法就地知道武器分档规则。其余引爆、构造体、职业属性>100不提供覆盖护盾、接触冷却、伤害/未知范围均已保留。

### SOL-12 凤凰俯冲强化误暗示替代治愈
E/2979486801/0。R73 `While Heat Rises is active: Applies Restoration x2 ... upon diving.` 本站 `俯冲改为施加 2 层恢复`。“改为”把原本治愈暗示成被恢复替代，原句没有取消原本治愈。enhanced 标题只说“装上炙热升腾之后”，记录正文没保留 `is active`；不能把装备与生效状态混为一谈。6.5m/5m 跨表差异另见 SOL-19。

### SOL-13 烈焰之歌多项真实差异
I/2274196884，R78：
- `dealing up to 647 [?] Damage`；本站 `最多造成 685 [?] 伤害`。
- `if an enemy is within 22 meters`；本站 `若 15? 米内还有战斗人员`。
- `Each Grenade Ability Usage can spawn a total of 4 Wisps, with each wisp after the first dealing 10% less damage.` 本站最多多生成 3 团（总数可对应 4）但遗漏第一团之后每团伤害低 10% 的原句，不自行推导递减曲线。
- `Celestial Fire ... each ... 246 [87]`；本站 `200 [87]`。
- 紧接 Celestial Fire 的自动近战 `1,224 [?] ... x60+30 ... tiny radius ... consuming Super Energy and a Melee Ability Charge` 全段缺失。
- `Incinerator Snap ... each ... 139 [41]`；本站 `155 [41]`。
- Snap 自动近战 `899 [456]`；本站 `1000 [456]`；`over a tiny radius` 未保留。
- 灼热子弹原句是 `Non-DoT ... Direct/Explosive Weapon Hit`；本站省略 direct/explosive 区别。偃月原句明确 `(Melee/Projectile)`，本站只列“偃月”。
- 所有超能成本、技能间冷却、+100 属性、团队15米、每秒15%固定回能、超能结束补满、武器击杀计超能但伤害不计技能、武器五档层数和内置冷却均与源一致。
- E/2274196884/0 的消耗火苗治疗（x3治愈+x2恢复4+2秒/9m）与源一致，确实在 HTML；不能因索引 desc 空误报缺失。

### SOL-14 黎明误译 impact 与长度
I/2274196886。R79 `exploding on impact` 本站 `受到伤害时爆炸`，原句是弹体撞击，不是弹体受到伤害。`Flame streaks travel ahead, scaling from ~4m to 9m if the Daybreak Projectile traveled at least 12 meters` 本站 `宽度从约 4 米放大到 9 米`，原句没有说宽度，上下文是向前行进/距离；不应擅定为宽度。其它数值与强化俯冲一致。E/2274196886/0 的无冷却4.2%突进存在于 HTML，不能误报漏收。

### SOL-15 光焰之井增伤范围扩大
I/2274196887。R80 `25% Increased Weapon Damage` 本站 `伤害提高 25%`，漏“武器”。其余持续/200超能上限、恢复、范围、能量球、800HP/0.25倍构造体、抗性、冰影免疫、移除恢复、施法者武器计超能与最多5枚球一致。

### SOL-16 炙热升腾额外断言与遗漏
I/83039194、P/3439133383。R82 `Burst Glide: Strong Directional Control` 本站 `爆发滑翔 ｜ 强化方向控制与占领模式`；“与占领模式”无源。R82 消耗 Song Wisp 给 `Restoration x2 for 4+2 seconds ... user and allies within 9 meters`，本站本条这句话没保留时长，范围靠前段上下文，另一个 E/2274196884/0 已收录，但本条仍存在句内信息遗漏。T2T3 在 HTML 两个 span 直接相连，无“与”或分隔，属于呈现可读性。被动/激活空效、空中回能档、消耗手雷治疗、滑翔消耗-99%、雷达25m、空中延时分档/30s上限、强制覆写15s均已收录。

### SOL-17 索引重复 perk 与主项不一致
- P/528482921 火药博弈：R55 `Ignition & Scorch = 3 [4]`；主 I/3066103996 正确写点燃与灼烧；重复 perk 写 `元素减益 3 [4]`，扩大到全部元素减益。另额外 `只有自动引爆时才触发手雷效果` 原源无此限制。源有被射击/3秒触发，不支持只自动引爆断言。
- P/410180492 神圣献祭：R67 `x40+20 Scorch`；主项写40+20，重复 perk 写40，丢骨灰余烬增量。
- P/1821367741 地狱火：R83 `up to 32 meters`、`x30+10`；主项32m/30+10，重复 perk40m/30。
- P/3694014520 伊卡洛斯突进：R84 `while Airborne within 5 seconds of each`、`Bosses = 100%`；主项保留5秒/首领，重复 perk丢5秒并写初级首领。
其余24个重复机制正文与对应主项语义相同，故继承主项同样的翻译/模式问题，而不是独立匹配正确。11个重复属性变化条目与主项相同。

### SOL-18 罗蕾莱源内疑点，不算术修正
I/2747500761，R64 原句 `Reduces Passive Drain by 40%, increasing duration to 35 seconds, or 3.63% Super Drain per second.` 本站原样写35秒/每秒3.63%。这不是本站与源数字不一致；是源给出的持续/每秒消耗组合疑点。当前只注“假设无敌索尔100%持续，实战未必”，不足以明确这个组合待确认；最终报告应保留来源原值和疑点，不改成推算结果。与 E/2747500761/0 的27.5秒/3.63%是两个不同段，不能合并。

### SOL-19 凤凰俯冲跨 Class/Solar 表疑点
Solar R73 `enemies within 6.5 metres upon landing`；Class Abilities gid527596209 R16 `enemies within 5 metres upon landing`。I/2979486801/E0 当前6.5m忠实Solar，但两表不一致，应明确来源与待确认，不能擅改为5m。100伤害、40+20灼烧、79.6秒、0.8倍、恢复3+1.5两表一致。

### SOL-20 全局呈现和核对边界
- 原表大量 `x40<small>+20</small>` / `4<small>+2</small>` 的第二数分别是骨灰余烬/抚慰余烬条件增量。本站正文显示平排40+20/4+2，并保留两碎片的解释，但未真的显示“小字”，两解释仍声称会用小字。数值未丢不等于条件呈现一致；不能把基础+条件增量写成无条件总数。
- 未知的 PvP 值在 HTML 多数只用 unsure 或 note，而没有 pvp 包装：利刃弹幕 `[没多少?]`/`[基本团灭?]`/`[死]`，其它超能 `[?]`、烈焰之歌 `[~50%?]`/盟友`[?%]`等。原表粉色明确 PvP，本站问号保留了不确定性但没有保留模式的颜色层级。光线余烬 Song Projectiles 的 `?` 是 note/plain，不是 unsure。页脚没有统一未知数说明，只写“统一术语、标点与排版”。
- 英文 Enemies 多处译成 `{enemy|战斗人员}`，不得进一步宣称PvE-only。特别主条目同时明确 PvP 数值；可用“敌人”保持两模式，不应把译法当排除守护者的证据。原文确实写 Combatants 的句应保留战斗人员范围。
- enhanced 全部在 HTML；索引9个 enhanced desc为空，审计已通过HTML补齐。本报告不推定搜索运行时一定漏索引内容，因为未执行浏览器/搜索。
- 源页 Fragment Slots 没有可读快照值：12个槽位目前只能报本站呈现，不能报DDC已核实。
- Firebolt 强化在 R30 写12m，在 R85 又写 `increased by 50% to 12 meters`；基础8.5m与该百分比描述之间源内存在精度/写法问题。本站给12m/5目标并未给50%推导，不能因此报本站数值错。
- Incendiary 源同时写814、31.5%、1202；本站忠实同列值，不能凭算术改成别的数。Blade Barrage 源总计8512/12160与单枚数值也未在本轮推算修正。

## 全覆盖矩阵：效果与缩放 7/7

### R4 Cure — trait:3263723277 — T
原句：`Restores 60 [30] HP per stack of Cure over 0.1 seconds. Incurs a 1 second cooldown between Cure activations. Additional activations will not recover health.`
当前中文：`每层治愈在 0.1 秒内恢复 60 [30] 生命值。两次激活之间有 1 秒冷却，冷却期间再次激活不恢复生命值。`
结论：一致。

### R5 Firesprite — trait:37177486 — T
原句：`Solar Elemental Pickup. Grants 11.25% Grenade Ability Energy on Pickup. Allies do not receive Firesprites created by the user. Lasts 25 seconds before disappearing. Incurs a 5 second cooldown between Firesprite spawns.`
当前中文：`烈日元素拾取物。拾取提供 11.25% 手雷技能能量。自己生成的焰灵对盟友不生效。停留 25 秒后消失，两次生成之间有 5 秒冷却。`
结论：一致；“不 receive”译成不生效没有独立扩为共享拾取机制。

### R6 Radiant — trait:157469667 — T
原句：`Increases Weapon Damage by 20% [10%] for 10 seconds and can be extended up to 15 seconds by default. Also affects Golden Gun's Damage. Reapplying Radiant will refresh its duration to its longest achieved duration. Damage Buff effect is increased to 30% against Champions. Well of Radiance's 25% overrides the 30% against Champions.`
当前中文：`武器伤害提高 20% [10%]，持续 10 秒，默认最长可延到 15 秒。黄金枪的伤害同样受它影响。重新施加焕光会把持续时间刷新到此前达到过的最长值。对勇士的武器伤害提高 30%；光焰之井的 25% 增伤会覆盖这份 30% 增伤。`
结论：一致。

### R7 Restoration — trait:3488482714 — T
原句：`Continuously restores health. Effect is uninterruptible and can be extended up to 15 seconds by default. x1 = 35 [17.5] HP/s | x2 = 50 [25] HP/s. Healing Effect does not stack with Healing Rift. Reapplying Restoration will refresh its duration to its longest achieved duration, keeping the highest Restoration stack. If the new duration is longer than the previous longest, the new duration is used instead. Eg: If the maximum Restoration duration achieved was 15 seconds, a Phoenix Dive or Healing Grenade will refresh it to 15 seconds. Using a Phoenix Dive after using a Healing Grenade will refresh its duration to 4+2 seconds. Empyrean and Mercy are both duration extenders, and do not count as reapplying Restoration. Extending a Solar Effect that is at >15 seconds will set it to 15 seconds.`
当前中文：`持续恢复生命值，效果不可中断，默认最长持续 15 秒。1 层 = 35 [17.5] 生命值/秒 ｜ 2 层 = 50 [25] 生命值/秒。治疗效果不与治愈裂痕叠加。重新施加恢复把持续时间刷新到此前的最长值，并保留最高层数；若新的持续时间更长则采用新的。至高天与慈悲属于延长效果，不计为重新施加；把持续时间延长到 15 秒以上时会被压回 15 秒。`
结论：核心规则一致；两个具体示例省略。末句原文是已有>15秒再延长会设为15，中文“延长到15秒以上时”容易理解为普通延长越过15，条件须区分。

### R8 Ignition — trait:3268862716 — T
原句：`Explosion that deals 676 [120 Guardians | 250 Construct] Solar Damage in a 8 meter radius without [with] damage falloff. Ignitions remove all Scorch, and incur a 1.6 second cooldown before Scorch can be reapplied. Ignition damage can be increased through certain damage increases if the initial Scorch source had a damage increase. Eg: Verity's Brow x5 + Fusion Grenade = 100% Increased Ignition Damage. Melee Damage Buffs do not scale Ignition nor Scorch damage. Unstoppable Champions become Stunned upon receiving Ignition damage.`
当前中文：`在 8 米半径内引爆，造成 676 [120 守护者 ｜ 250 构造体] 烈日伤害，范围内无衰减。点燃会清空全部灼烧层数，并在 1.6 秒内无法重新施加灼烧。若最初施加灼烧的来源本身带伤害提升，点燃伤害也随之提高——例如真理之容 5 层 + 融合手雷 = 点燃伤害提高 100%。近战伤害增益不缩放点燃与灼烧。势不可挡勇士受到点燃伤害时进入眩晕。`
结论：SOL-01。

### R9 Scorch — trait:1096356879 — T
原句：`Scorched Enemies are dealt Scorch-stack based damage every 0.56 seconds after being scorched for 0.5 seconds. All Scorch is removed upon reaching x100 Scorch to trigger an Ignition. The 2nd Scorch tick has a 0.93s delay for some reason. Scorch Stack Damage Scaling per Tick: 2.7 + (0.175 * Scorch Stacks) | Non-Boss Combatants receive 20% increased damage. x1 = 3 | x30 = 5 | x50 = 6.5 | x60 = 7.21 | x80 = 8.64 | Scorch Damage is non-lethal. Deals 2.5% increased damage upon reaching at least x60 Scorch, indicated by Yellow Damage Numbers. Scorch Decay: Scorch duration and decay rate is difficulty-dependent. Scorch lasts for 2.3 seconds, then decreases by x1 stacks every 0.04 seconds (-25/s).`
[…251ln elided…]

## 全覆盖矩阵：术士 10/10 + enhanced 3/3

### R73 Phoenix Dive — 2979486801 — I；79.6/0.8（匹配）
原句：`Dive that applies Cure x2 to the user and their allies within 9 meters. While Heat Rises is active: Applies Restoration x2 for 3+1.5 seconds upon diving. Deals 100 damage and inflicts x40+20 Scorch to enemies within 6.5 metres upon landing.`
当前I：`俯冲，为自己与 9 米内的盟友施加 2 层治愈。`
当前E/0：`俯冲改为施加 2 层恢复，持续 3+1.5 秒。落地对 6.5 米内的战斗人员造成 100 伤害并施加 40+20 层灼烧。`
结论：SOL-12/SOL-19；不是正文缺失，是条件/替代措辞错误与跨表源疑点。

### R75 Celestial Fire — 1470370539 — I；162.6/0.7（匹配）
原句：`Sends out a spiral of 3 homing Solar blasts. Solar blasts each deal up to 150 [35] damage and inflict x10+5 Scorch in a ? meter radius. Can deal up to 450 [105] damage and inflict x30+15 Scorch by scoring hits with all 3 Solar blasts.`
当前：`发出 3 团追踪的烈日爆炸，呈螺旋前进。每团最多造成 150 [35] 伤害并施加 10+5 层灼烧，范围 ? 米。3 团全中最多合计 450 [105] 伤害与 30+15 层灼烧。`
结论：一致。

### R76 Incinerator Snap — 1470370538 — I；119.8/0.9（匹配）
原句：`Creates a fan of 5 burning sparks. Sparks explode after ? meters, each dealing up to 90 [27?] damage and apply x20+10 [x10+5] Scorch over a ? meter radius. Can deal up to 450 [135?] damage and apply up to x100+50 [x50+25] Scorch by scoring hits with all 5 burning sparks.`
当前：`扇形生成 5 发燃烧花火。每发飞行 ? 米后爆炸，在 ? 米内最多造成 90 [27?] 伤害并施加 20+10 [10+5] 层灼烧。5 发全中最多合计 450 [135?] 伤害与 100+50 [50+25] 层灼烧。`
结论：机制与源未知一致；未知PvP数值包装见SOL-20。

### R78 Song of Flame — 2274196884 — I；Tier2/556（匹配）
原句：`Damage Resistance: 90% [~50?%]. Base Duration: 25 seconds, or 4% Super Drain per Second. Song of Flame: Caster is granted +100 Grenade, +100 Melee, +100 Class, Radiant and Scorching Rounds. Weapon Kills by the Caster count as Super Kills. Weapon damage does not count as Ability damage. Allies within 15 metres are granted 30% [?%] Damage Resist, Scorching Rounds, and 15% Fixed Bonus Grenade, Melee, and Class Ability Energy per second. Grants full Grenade and Melee Ability Charges on Super End. Scorching Rounds: Scoring a Non-DoT Kinetic or Solar Direct/Explosive Weapon Hit inflicts Scorch, with the stack amount and cooldown between Scorching Round triggers varying per Weapon Type. x5+0 Scorch every 0.2 seconds = Auto Rifles | Submachine Guns. x5+5 Scorch every 0.2 seconds = Machine Guns | Trace Rifles. x10+5 Scorch every 0.3 seconds = Hand Cannon | Pulse Rifle | Scout Rifles | Sidearms. x15+5 Scorch every 0.4 seconds = Fusion Rifles | Glaive (Melee/Projectile) | Shotgun | Sniper Rifle | Swords. x20+10 Scorch every 0.6? seconds = Bows | Heavy Grenade Launchers | Special Grenade Launchers | Linear Fusion Rifles (+Arbalest) | Rocket Launchers. Hitting multiple enemies at once only scorches one of them. Grenade Ability: Drains 4.8% Super Energy, and has a 2 second cooldown between usages. Sends forth a homing Solar Wisp that detonates on impact, dealing up to 647 [?] Damage and inflicting x40+20 Scorch. Wisps have ? HP. Another Wisp is spawned on the impact location if an enemy is within 22 meters, seeking the closest enemy it hasn't already damaged. Each Grenade Ability Usage can spawn a total of 4 Wisps, with each wisp after the first dealing 10% less damage. Consuming a Solar Wisp while Heat Rises is equipped grants Cure x3 and Restoration x2 for 4+2 seconds to the user and their allies within 9 meters. Melee Ability: Drains 2.4% Super Energy, and has a 1.75 second cooldown between usages. Celestial Fire sends out 5 Solar blasts, each dealing up to 246 [87] Damage and inflicting x10+5 Scorch. [Auto Melee] within Melee Lunge Distance instead deals 1,224 [?] Damage and inflicts x60+30 Scorch over a tiny radius, consuming Super Energy and a Melee Ability Charge. Incinerator Snap releases a barrage of 7 Solar Sparks, each dealing up to 139 [41] damage and inflicting x20+10 [x10+5] Scorch. [Auto Melee] within Melee Lunge Distance performs an Powered Melee, dealing 899 [456] Damage and inflicts x60+30 Scorch over a tiny radius, consuming Super Energy and a Melee Ability Charge. Class Ability: Drains 6% Super Energy, and has a 2.85 second cooldown between usages. Functions as the selected Class Ability, recharging quickly at the cost of Super Energy.`
当前I：`伤害抗性：90% [~50%?]。基础持续：25 秒，或每秒消耗 4% 超能能量。施法者获得 +100 手雷、+100 近战、+100 职业属性，以及焕光与灼热子弹；其武器击杀计为超能击杀（武器伤害不计为技能伤害）。15 米内的盟友获得 30% [?%] 伤害抗性、灼热子弹，以及手雷、近战与职业技能每秒 15% 的固定能量。超能结束时补满手雷与近战技能。灼热子弹：非持续伤害的动能或烈日武器命中会施加灼烧，层数与冷却随武器类型而定。5+0 层 / 0.2 秒 ｜ 自动步枪、微型冲锋枪。5+5 层 / 0.2 秒 ｜ 机枪、追踪步枪。10+5 层 / 0.3 秒 ｜ 手炮、脉冲步枪、斥候步枪、手枪。15+5 层 / 0.4 秒 ｜ 融合步枪、偃月、霰弹枪、狙击步枪、刀剑。20+10 层 / 0.6? 秒 ｜ 弓箭、重型榴弹发射器、特殊榴弹发射器、线性融合步枪（含劲弩）、火箭发射器。同时命中多名战斗人员时只烧其中一名。手雷技能 ｜ 消耗 4.8% 超能能量，两次之间有 2 秒冷却。发出一团接触即爆的烈日烈焰火苗，最多造成 685 [?] 伤害并施加 40+20 层灼烧，有 ? 点构造体生命值。若 15? 米内还有战斗人员，会在接触位置再生成一团去追尚未伤到的最近战斗人员，每次最多多生成 3 团。近战技能 ｜ 消耗 2.4% 超能能量，两次之间有 1.75 秒冷却。星界之火改为发出 5 团爆炸，每团最多造成 200 [87] 伤害并施加 10+5 层灼烧。焚烧响指改为释放 7 发花火，每发最多造成 155 [41] 伤害并施加 20+10 [10+5] 层灼烧。装备焚烧响指时对近战突进距离内的战斗人员使用自动近战，会打出强化基础近战，造成 1000 [456] 烈日伤害并施加 60+30 层灼烧，同时消耗超能能量与一次近战技能充能。职业技能 ｜ 消耗 6% 超能能量，两次之间有 2.85 秒冷却。按所选职业技能发挥作用，以超能能量换取快速充能。`
当前E/0：`装备炙热升腾时消耗一团烈焰火苗，为自己与 9 米内的盟友提供 3 层治愈与 2 层恢复，持续 4+2 秒。`
结论：SOL-13，治疗enhanced完整且一致。

### R79 Daybreak — 2274196886 — I；Tier2/556（匹配）
原句：`Damage Resistance: 90% [51%]. Base Duration: 24 seconds, or 4.167% Super Drain per Second. Light Attack | Drains 6.5% Super Energy to launch a Daybreak Projectile. Daybreak Projectile deal 426 [?] Impact Damage, exploding on impact, dealing up to 598 [?] Splash Damage, down to 0% damage, inflicting x50+0 Scorch over 5 meters, and launching a streak of flames behind them. Flame streaks travel ahead, scaling from ~4m to 9m if the Daybreak Projectile traveled at least 12 meters, dealing up to 292 [?] Damage on hit. Allows the usage of an enhanced Icarus Dash without cooldown that drains 4.2% Super Energy per usage. Phoenix Dive is enhanced, dealing up to 642 [220?] Damage, down to a minimum of 292 [?] Damage, and inflicting x60+30 Scorch over a 6 meter radius. Deals 45% damage at max falloff. Phoenix Dive damage is enhanced by Super Damage Increases.`
当前I：`伤害抗性：90% [51%]。基础持续：24 秒，或每秒消耗 4.167% 超能能量。轻攻击 ｜ 消耗 6.5% 超能能量，发射黎明弹体。弹体造成 426 [?] 直击伤害，受到伤害时爆炸，最多造成 598 [?] 溅射伤害（衰减至 0%），在 5 米内施加 50+0 层灼烧，并在身后拉出一道火焰长流。火焰条纹向前飞行；若弹体飞行至少 12 米，宽度从约 4 米放大到 9 米，命中最多造成 292 [?] 伤害。凤凰俯冲被强化：最多造成 642 [220?] 伤害（最低降至 292 [?]），并在 6 米半径内施加 60+30 层灼烧，最大衰减处仍有 45% 伤害。其伤害吃超能伤害提升。`
当前E/0：`允许无冷却使用强化伊卡洛斯突进，每次消耗 4.2% 超能能量。`
结论：SOL-14；增强突进已收录。

### R80 Well of Radiance — 2274196887 — I；Tier4/455（匹配）
原句：`Places down a Well of Radiance for 30 seconds, restoring 300HP to the caster, dealing up to 150 damage, and inflicting 40+20 Scorch to enemies within 8.5 metres. Creates 3 Orbs of Power, each granting 3.6% Super Energy. Super Duration scales with Super Stat, up to 40 seconds at 200 Super. Well of Radiance: Construct with 800 HP. Can be frozen and damaged by Stasis Shatter. Projects an aura that buffs the caster and allies within 6 metres. Leaving the aura grants Radiant for 8+4 seconds. Combatants deal 0.25x Damage against the Well of Radiance. For Guardians inside the Well of Radiance: 25% Increased Weapon Damage, 20% Damage Resist against Combatants (10% vs Boss Combatants), immunity to Stasis Effects, and restores 50HP/s. Guardians receive 50% Damage Resist against Special and Power Weapons, as well as Abilities. Primary Weapons remain at 40% Damage Resist. Removes any active Restoration effect. Weapon Damage dealt by the Caster is counted as Super Ability Damage. Caster can spawn up to 5 Orbs from scoring kills within the Well.`
当前：`放下一口持续 30 秒的光焰之井：为施法者恢复 300 生命值。对 8.5 米内的战斗人员最多造成 150 伤害并施加 40+20 层灼烧。生成 3 枚能量球，每枚提供 3.6% 超能能量。持续时间随超能属性缩放，200 超能时最长 40 秒。井本身是拥有 800 生命值的构造体，可以被冻结，也会被碎裂伤到；战斗人员对它只造成 0.25 倍伤害。它向 6 米内的施法者与盟友投射增益光环，离开光环时提供焕光持续 8+4 秒。站在井里的守护者：伤害提高 25%。对战斗人员获得 20% 伤害抗性（对首领 10%）。对特殊与威能武器及技能获得 50% 伤害抗性，主武器 40%。免疫冰影效果，每秒恢复 50 生命值。进入时会移除已有的恢复。施法者在井里造成的武器伤害计为超能技能伤害，井内击杀最多生成 5 枚能量球。`
结论：SOL-15。

### R82 Heat Rises — 83039194 — I；本站2槽，DDC未可读
原句：`Passively grants +20 Airborne Effectiveness, and allows Weapon and Ability Usage while gliding. Kills while Airborne grant Melee Energy. Tier 1 Combatant = 20% | T2 = 25% | T3 = 35% | T4 = 50% | Guardians = 50%. Hold [Grenade] to consume a Grenade Ability Charge, granting Heat Rises and releasing a burst of Cure x2 that affects the user and their allies within 9 meters. Consuming a Healing Grenade increases Cure to x3. Consuming a Touch of Flame Healing Grenade additionally grants Restoration x1 for 4+2 seconds. Consuming a Song of Flame' Wisp releases a burst of Cure x3 and grants Restoration x2 for 4+2 seconds to the user and their allies within 9 meters. Heat Rises: Grants +50 Airborne Effectiveness, and a modified Glide that changes depending on the selected Movement Ability for 15 seconds. Combatants are less accurate at targeting the wearer while active. Modified Glide has -99% Glide Upkeep and Activation cost, extending maximum glide duration by 100 times, and marks the user's location on radar to Guardians within 25 meters. Balanced Glide: Strong Directional and Initial Burst | Burst Glide: Strong Directional Control | Strafe Glide: Strong Initial Burst. Scoring additional Airborne Kills while Heat Rises is active extends the buff duration, up to 30 seconds. Tier 1 Combatant = +5 seconds | T2 & T3 = +10 seconds | T4 = +15 seconds | Guardians = +5 seconds. Consuming a Grenade always overwrites the duration to 15 seconds, even if it was previously higher.`
当前：`被动 +20 空中效率，并允许滑翔期间使用武器与技能。空中击杀按等级提供近战技能能量：T1 级战斗人员 20% ｜ T2 25% ｜ T3 35% ｜ T4 50% ｜ 守护者 50%。按住［手雷］：消耗一次手雷技能充能进入炙热升腾，并为自己与 9 米内的盟友释放 2 层治愈。消耗治愈手雷时提升到 3 层。消耗火焰之触强化过的治愈手雷还额外给 1 层恢复，持续 4+2 秒。消耗烈焰之歌的烈焰火苗则给 3 层治愈与 2 层恢复。炙热升腾：提供 +50 空中效率与一种随移动技能变化的改良滑翔，持续 15 秒。均衡滑翔 ｜ 强化方向控制与初始爆发。爆发滑翔 ｜ 强化方向控制与占领模式。专注滑翔 ｜ 强化初始爆发。激活期间战斗人员对使用者的瞄准精度下降。改良滑翔的维持与激活消耗降低 99%，最大滑翔时长延长 100 倍，并在 25 米内守护者的雷达上标出自己的位置。激活期间的空中击杀延长时长，最长 30 秒：T1 +5 秒 ｜ T2T3 +10 秒 ｜ T4 +15 秒 ｜ 守护者 +5 秒。消耗手雷总是把时长覆盖为 15 秒，即使原本更长。`
结论：SOL-16。

### R83 Hellion — 83039192 — I；本站2槽，DDC未可读
原句：`On Class Ability Usage: Grants Hellion for 20 seconds. Hellion: Lobs scorching Solar projectiles every 1.35 seconds towards enemies up to 32 meters away. Solar projectiles deal up to 217 [38] Solar Grenade Ability Damage and inflict x30+10 Scorch per hit in a 4 meter radius. Can trigger Grenade Ability interactions. Hellion-inflicted Solar Effects are not scaled by Grenade Damage.`
当前：`使用职业技能提供地狱火，持续 20 秒。期间每 1.35 秒向最远 32 米外的战斗人员抛出一颗灼热的烈日弹体，最多造成 217 [38] 烈日手雷技能伤害，并在 4 米半径内施加 30+10 层灼烧。可以触发手雷技能的交互效果。地狱火施加的灼烧效果不随手雷伤害缩放。`
结论：主要数值一致；最后Solar Effects包括灼烧/点燃，本站仍只称灼烧效果（SOL-02同类范围问题）。重复perk见SOL-17。

### R84 Icarus Dash — 83039195 — I；本站3槽，DDC未可读
原句：`Horizontal dash that travels 8 meters. Distance is increased by 25% while in Daybreak. Incurs a 4 second cooldown after usage. While Heat Rises is active, or during the Song of Flame Super Ability while the Incinerator Snap Melee Ability is equipped: Gains an additional charge, and recharges both charges simultaneously, but increases cooldown to 5 seconds. Does not grant 2 charges while in Song of Flame if the Celestial Fire Melee Ability is equipped. ¯\_(ツ)_/¯ Upon reaching 100% Counter Progress through Weapon or Super Kills while Airborne within 5 seconds of each: Rank-And-File = 34% | Elites = 67% | Bosses = 100% | Guardians = 67%. Grants Cure x1.`
当前：`水平冲刺 8 米，黎明期间距离提高 25%，使用后有 4 秒冷却。炙热升腾激活时，或装备焚烧响指近战的烈焰之歌期间：额外获得一次充能且两次同时充能，但冷却提高到 5 秒。装备星界之火近战时，烈焰之歌中不会获得 2 次充能。空中用武器或超能击杀，每次击杀间隔不超过 5 秒时推进计数，满 100% 提供 1 层治愈：红血 34% ｜ 橙血 67% ｜ 首领 100% ｜ 守护者 67%。`
结论：主项一致；重复perk缺5秒/首领等级变更见SOL-17。

### R85 Touch of Flame — 83039193 — I；本站2槽，DDC未可读
原句：`Enhances certain Grenade types: Healing Grenades grant Cure x2 and Restoration x2 for 4+2 seconds. Firebolt Grenades seek radius is increased by 50% to 12 meters and target up to 5 enemies. Solar Grenades linger for 2 seconds longer and release Magma Orbs that deal 125 [50] damage each. Magma Orbs do not have damage falloff. Fusion Grenades explode again after 0.5 seconds, dealing up to 851 [50] damage in a 8 metre radius.`
当前：`强化治愈、烈焰、烈日、融合四种手雷，逐条效果见「手雷技能」一节。`
结论：全部机制已转移到4个E子行并在HTML读到。唯Firebolt原表R85的50%未重述，而R30只给12m；不凭基础8.5算术改源。

## 重复 perk 全覆盖映射

以下每项当前中文主正文与上面对应I矩阵相同，除已明确列出的四项。对应字段均为P，即 sandbox-perks.i18n.zh-CN.realgame_details；因此无需把同一正文再复制一次才算覆盖。

碎片：Ashes317874944；Beams3462817390；Benevolence3947122023；Blistering960769778；Char2243276296；Combustion3237901259；Empyrean2435363846；Eruption295687839；Mercy1765272724；Resolve3336316048；Searing1525207249；Singeing3432541693；Solace2018490388；Tempering194233190；Torches3276935912；Wonder891758557。

星相：Crackshot2968111151；Gunpowder528482921（差异）；Knock2582690032；OnYourMark146926598；Consecration410180492（差异）；Roaring3363068263；Shieldburst2994175687；SolInvictus603081928；HeatRises3439133383；Hellion1821367741（差异）；Icarus3694014520（差异）；Touch1325324426。

11项属性变化重复索引（同hash可服务两片）：Beams3040188318 `+10 超能 ▲`；Benevolence2364771258 `-10 手雷 ▼`；Char484330834 `+10 手雷 ▲`；Combustion1198358047 `+10 近战 ▲`；Empyrean1899933457 `-10 生命值 ▼`；Eruption1198358047 `+10 近战 ▲`；Mercy833744803 `+10 生命值 ▲`；Searing1026637393 `+10 职业 ▲`；Tempering511479895 `-10 职业 ▼`；Torches2364771258 `-10 手雷 ▼`；Wonder833744803 `+10 生命值 ▲`。均与DDC对应属性变化一致。

### 四项不同重复正文的完整差异上下文

P/528482921 当前：`击杀为简易爆炸物蓄力，攒够 6 次充能即可使用。武器击杀 1 [2] ｜ 元素减益 3 [4] ｜ 技能击杀 4 ｜ 超能 6。手雷技能被替换为棍上点燃：被射击或 3 秒后触发点燃，伤害提高 50%。射击炸药会让它的伤害提高 50% [5%]、半径提高 ?% 达到 ? 米，并释放 9 枚追踪子弹药，每枚最多造成 80 [?] 伤害。只有自动引爆时才触发手雷效果。激活后有 6 秒冷却，冷却期间的击杀不提供充能。` 原句与R55矩阵同。

P/410180492 当前：`滑铲时按［近战技能］：向前发出一道 20 米的烈日能量波形，造成 40 [30] 伤害并施加 40 层灼烧。未处于猛击状态时只消耗 50% 近战技能能量。开火状态下无法在滑铲期间使用。由此进入空中后按［近战技能］：猛击地面，形成第二道更宽的波形向前 20 米，并碎裂水晶。对非灼烧战斗人员造成 486 [120] 伤害。命中灼烧的战斗人员则造成 472.5 [50] 伤害并触发点燃。近战动画期间对非近战伤害提供 25% 伤害抗性。` 原句与R67矩阵同。

P/1821367741 当前：`使用职业技能提供地狱火，持续 20 秒。期间每 1.35 秒向最远 40 米外的战斗人员抛出一颗灼热的烈日弹体，最多造成 217 [38] 烈日手雷技能伤害，并在 4 米半径内施加 30 层灼烧。可以触发手雷技能的交互效果。地狱火施加的灼烧效果不随手雷伤害缩放。` 原句与R83矩阵同。

P/3694014520 当前：`水平冲刺 8 米，黎明期间距离提高 25%，使用后有 4 秒冷却。炙热升腾激活时，或装备焚烧响指近战的烈焰之歌期间：额外获得一次充能且两次同时充能，但冷却提高到 5 秒。装备星界之火近战时，烈焰之歌中不会获得 2 次充能。空中用武器或超能击杀推进计数，满 100% 提供 1 层治愈：红血 34% ｜ 橙血 67% ｜ 初级首领 100% ｜ 守护者 67%。` 原句与R84矩阵同。

## 最终交接

本轮分支新发现仅审计，不自行扩成修复。父代理保存完整报告后，可将SOL-01/02/03/04/05/06/09/10/11/12/13/14/15/16/17作为明确差异；SOL-07/18/19及源内Firebolt/Incendiary写法作为来源疑点；SOL-08及恢复/灼烧/铝热/grounded/Sunspot-buff的小范围措辞问题已在矩阵逐条列出，不应遗漏。所有 unknown、模式、小字条件以及重复 perk 需一并纳入任何获授权后续修复，不能只替换数字。父代理统一构建与验证；本审计没有声称已完成这些检查。

[Showing lines 1-133 and 385-463 of 463; 251 middle lines (44.5KB) elided. Read artifact://381 for full output]

# 附件：虚空


## 1. 边界、来源和统计

源：[DDC — Void Subclasses，gid=1907852650](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1907852650)。证据快照为 data/ddc/1907852650.json。下文 R 表示该 JSON 顶层数组的 1-based 行号，不宣称就是 Google Sheets 的原始物理行号。全部 78 行的全部单元格已读；其中 61 行是机制/碎片/技能/星相信息行，17 行是标题或导航。61 信息行映射为本站 58 主条目＋3 手雷强化行；源 Spectral Blades 行内还有 Trapper's Ambush 增强，本站另渲染一个子行，因此实际检查 62 个呈现单元（58＋4）。

本站证据为当前已有生成索引和 HTML，不是本轮重建后的结果。原句逐条核对包含：主效果、触发条件、目标范围、PvP 数值、伤害类别、刷新、持续、延时、未知值、冷却、属性、星相槽位、增强子行。未跑 build/lint/tests/formatters、未浏览器、未修改数据或生成文件。可用工具没有写入接口，遵照“无法写 local 则完整返回父”的要求，在本 report 返回全文，不声称已创建 local 文件。

字段约定：下表 inventory 裸 hash 正文均为 data/inventory-items.json / hash / i18n.zh-CN.realgame_details；trait:hash 为 data/traits.json 同路径；minted 两项为 data/minted.json 同路径。E0 为 enhanced[0].realgame_details。CD 为 site_cooldownSeconds，CM 为 site_recoveryMultiplier，ST 为 site_superTier，属性/槽位为 investmentStats。所有库存映射均读过 i18n.en.name，不仅靠中文名字猜配。

结论：无缺失整条、无新增整条、无未映射源信息行；有局部遗漏、语义改变、模式/小字丢失及源表自身疑点。数字存在不代表机制正确。下表“对应”只表示所列内容逐句未见额外差异，不免除 V01/V02 等全局呈现问题，也不等于游戏实测验证。

## 2. 全条目覆盖矩阵

### 效果：8/8

|源行/原名与原句证据|本站 namespace/hash|逐条核对结论|
|---|---|---|
|R4 Devour："Restores 70 HP on activation ... for 10+5 seconds"；"refreshes 5+3 seconds"；T1=7.5%, T2=11.6%, T3=13.75%, T4/Guardians=20%|trait:3078132110 吞食|激活/重新激活/击杀均恢复70、回能表和刷新对应；与虚空供养140区分正确。小字来源说明缺失，见V01。|
|R5 Invisibility："lowering Maximum Radar Range to 24 meters for 5+2 seconds"；"refreshes the duration of the longest lasting invisibility"；"radar will only ping every 5 seconds for 0.6 seconds"|trait:655301426 隐身|24米、刷新最长一份、PvE射击/追踪、守护者雷达、脱锁、全部攻势/高噪声动作均有；5+2呈现见V01。|
|R6 Overshield："up to 45 HP for 10+5 seconds"；"70% Damage Resist (150eHP) against Combatants"；"First In, First Out"|trait:2485406866 覆盖护盾|45上限、护盾部分70%、150eHP、不阻断回血、其它护盾叠层/FIFO均对应；未将抗性扩为整条生命。|
|R7 Void Breach："Grants 11.25% Class Ability Energy on Pickup"；"Allies do not receive Void Breaches created by the user"；25秒/5秒生成CD|trait:3328352616 虚空裂口|数值和CD对应；本站“对盟友不生效”可能把私有生成/接收规则写成效果无效，见U01。|
|R8 Suppression："Suppressed Enemies ... unable to use abilities for 10 [5] seconds"；红/橙战斗人员迷失，守护者退出超能/超凡，Overload眩晕|trait:2578642829 压制|10[5]和技能列表、勇士对应；Enemies 被写成战斗人员，见V02。|
|R9 Volatile："190 [200] damage or upon dying"；"up to 145 [80] Void Ability Damage in a 5 meter radius"；10[6]秒、施加命中不算阈值、爆后1秒CD|trait:4105407564 不稳定|全部数值/移除/到期无害规则对应；Enemies范围见V02。|
|R10 Volatile Rounds："Void Weapons inflict Volatile upon dealing damage and deal 10% increased Weapon Damage against Champions"|minted:4294967322 不稳定弹药|触发和勇士武器伤害对应；无本条额外差异。|
|R11 Weaken："15% [7.5%] ... 20% Decreased Movement Speed for 6 [2.5] seconds"；Moebius30[50]、Felwinter30[30]、Tractor/Fafnir30[50]、Deadfall35[50?]|trait:3336638905 虚弱|全部档位、持续、三外来源可被任何Weaken延长均有；Enemies范围见V02；中文专名不一致见V03。|

### 碎片：16/16，逐项属性均已核对

下表属性是源表 Stat Changes，不把本站额外“碎片消耗1”当源表事实。

|源行/原句|库存hash/中文|源属性及结论|
|---|---|---|
|R13 Cessation："Finishers inflicting Volatile to enemies within ? metres. Killing Volatile Enemies spawns a Void Breach."|3854948620 休止回声|无属性；终结半径?、击杀生成对应；Enemies见V02。|
|R14 Dilation："Crouch Speed is set to 4 meters per second and grants doubled radar resolution while crouched"；不能低于4m/s|2272984656 扩张回声|+10 Weapon/+10 Super，对应；与横越之步类比保留。|
|R15 Domineering："+30 Weapons and 4% Forward Movement Speed Bonus for 10 seconds and refills the readied weapon"；4秒CD；击杀压制敌人生成裂口|2272984657 霸道回声|+10 Grenade对应；readied限定保留，“10秒”语法只绑移动，见V04；Enemies见V02。|
|R16 Exchange："Melee Kills grant Grenade Energy based on Enemy Rank"；7.5/11/16.25/25|2272984667 交换回声|+10 Melee，对应；T3/Guardians、T4/Miniboss/Boss分组正确。|
|R17 Expulsion："Void Ability Kills ... up to 160 [130] damage in a 7 metre radius"|2272984665 驱逐回声|+10 Super，对应；Enemies见V02。|
|R18 Harvest："Killing Weakened Enemies creates an Orb of Power that grants 2.5% Super Energy and a Void Breach"；造球后10秒CD|2661180601 收割回声|无属性；球/裂口与CD归属对应；Enemies见V02。|
|R19 Instability："Grenade Kills grant Volatile Rounds ... 11.25 [7.5] seconds. Does not require Void Grenade Kills."|2661180600 失稳回声|+10 Melee，对应；未强加虚空手雷限定。|
|R20 Leeching："Melee Kills begin health regeneration for the user and allies within ? metres."|2272984670 吸吮回声|+10 Health，对应；半径?保留。|
|R21 Obscurity："Finishers grant Invisibility for 5+2 seconds."|2661180602 朦胧回声|+10 Class，对应；V01。|
|R22 Persistence："Void Buffs applied to the user last longer"；Devour50%、Invisibility40%、Overshield50%|2272984671 坚韧回声|效果对应；属性原文“-10 Weapons (Hunter) / -10 Health (Titan) / -10 Class (Warlock)”；本站三项并列未标职业，V05。|
|R23 Provision："Can only activate once per damage instance. Hitting multiple enemies counts as 1 instance. Does not work with Unbreakable."；3% Scatter/Spike/Voidwall/Vortex，8% Axion/HHS/Magnetic/Suppressor|2272984664 补能回声|+10 Grenade，对应；单伤害实例、多敌不叠、不适用于坚不可摧均有。|
|R24 Remnants："Axion Bolts last ?% longer"；Spike50%/提前0.1秒，Wall50%，Vortex25%/提前0.13秒，强化Vortex55%|2272984666 残存回声|无属性，全部逐项对应；对照其它手雷小字来源见V01。|
|R25 Reprisal："While surrounded by 3+ enemies within 8 meters"；3=.3,4=.65,5=1,6=1.6,7=2.3%；1秒CD|2272984669 报复回声|无属性；分档/半径/CD对应；“3名以上”容易读成严格>3，见V06；Enemies见V02。|
|R26 Starvation："On Orb of Power or Void Breach Pickup: Grants Devour for 5+2.5 seconds."|2661180603 饥饿回声|-10 Class，对应；V01。|
|R27 Undermining："Void Grenades inflict Weaken on hit for 6 [2.5] seconds."|2272984668 弱化回声|-10 Grenade，对应。|
|R28 Vigilance："Upon killing an enemy while at Critical Health: Grants Void Overshield for 5+2.5 seconds"；8秒CD|3854948621 警惕回声|无属性；条件/效果/CD对应；Enemies见V02，时长V01。|

### 手雷：8/8＋3强化

|源行/原句|hash/字段|核对内容与结论|
|---|---|---|
|R30 Axion Bolt："Scans up to 2 enemies in Line of Sight within 10 metres ... after a 1 second delay"；575[65]，速度?/持续?，10HP|3232422679 量子光束|弹道/视线/数量/延迟/HP均有；CD219.5/CM.5对应；slow-moving误写减速见V07。|
|R31 Charged："Scans up to ↑4 enemies within 12 meters ... ↑?% faster and deal 25% increased damage. Triggers again after 1 second of landing."|3232422679 E0 by2321824285|全部增强在HTML显示；源25%为蓝色PvE，本站无模式限定，见V08；索引desc缺失见V17。|
|R32 Handheld Supernova："While Magnetic Grenade, Void Spike, Suppressor Grenade, or Voidwall Grenade are equipped"；1.154x、蓄力?、最多4.5秒；150[50] blast，9矢弹各375[15]，12.5米/3米，75%自伤降低、不自施Volatile，总3525[185]|minted4294967323 手持超新星|组合/星相限定正确；全部数值、最大值与自伤规则有；源“before it dissipates”未直说消散，但“最多维持”已表达上限。成员列表不是要求四手雷同时装备。|
|R33 Magnetic："initially exploding after 1.2 seconds ... secondary explosion after 0.6 seconds"；每次472[75]/5米，总946[150]|1547656727 磁性手雷|CD151.5/CM.75对应；原表472×2与总946不一致，本站忠实保留，列U02，不能算术自改。|
|R34 Scatter："5 [1] damage and releasing 8 submunitions over 4 meters"；第一次70[16]，0.5秒后二次115[20]，总1480[288]|1514173218 散射手雷|弹道/半径/延时/全部最大值对应；CD151.5/CM.75。|
|R35 Charged："Adds 4 additional submunitions, totalling 12 ... strongly track enemies within 5 meters ... 25% increased damage towards Combatants"|1514173218 E0 by2321824285|HTML正确有12/5米/+25%；追踪对象Enemies→战斗人员见V02；伤害Combatants限定对应；索引见V17。|
|R36 Suppressor："Explodes after its speed is sufficiently reduced. Has a brief delay"；863[150]/9米，压制10[5]，免疫自压制|2265076177 抑制手雷|全部对应；CD175.6/CM.625。|
|R37 Void Spike："after 0.67-0.1 seconds"；80[28]/.217秒、16+9跳、3.5+1.75秒；1280[2000]/448[700]|1255073825 虚空尖刺|CD175.6/CM.625、增强总值区分PvP正确；小字来源解释见V01。|
|R38 Void Wall："perpendicular wall ... over ? meters ... up to 173 [46]"；.85秒后，120[35]/.2秒、18+9、3.75+1.875，总2160[3240]/630[945]|2809141585 虚空墙壁|数值/CD175.6/CM.625对应；perpendicular参照关系弱化见V09；小字V01。|
|R39 Vortex：195[25]/5米冲击；.833秒后拉5?米；1.45小字-.13秒，78[20]/.267秒、12+7、4+1秒/4米；13th小字20th；总990[1536]/240[380]|1016030582 涡流手雷|全部主体、CD219.5/CM.5对应；“第13至20跳”错读小字，V10；V01。|
|R40 Charged：.617秒后拉?米，1.2秒后78[20]/.267秒、17+7、4.3+2.3秒/7米；17th小字24th；1380[1926]/340[480]|1016030582 E0 by2321824285|HTML完整显示；“第17至24跳”错读小字V10；星相汇总与详细行疑点V14/U03；索引V17。|

### 猎人：9/9＋1超能增强

|源行/原句|hash|结论|
|---|---|---|
|R43 Phantom Surge："Slashes forward up to 12 meters ... 595 [?] ... within 2 meters"；每敌+10OS，Void debuff或Prowl目标+100[?]%，击杀额外45OS/返60%|1139822080 鬼灵激涌|所有触发、数值、未知PvP对应；CD130.7/CM.9；Enemies范围V02。|
|R44 Snare Bomb：附着9秒/雷达，6米盟友隐身5+2；33[10]直击、120+24[40+?]爆炸/范围?，虚弱迷失8[2.5]；烟5[2]秒/.6秒跳，.87起跳12.65[?]，+13%/跳，末第9跳24.8[?]，总156.7[?]|1139822081 陷阱炸弹|全部逐条对应，CD130.7/CM.9；enemy radar/探测/命中范围V02；小字V01。|
|R46 Spectral Blades："90% [59?% Invisible | 58% Visible]"；23.5秒/4.25%每秒、非隐身快50%；轻5?%/1107[?]/攻频?/25?%；重15?%/1620[?]/Weaken/invis|2722573682 鬼灵利刃|全部数值与未知保留；T2/CD556对应。|
|R46 尾句："Allows unlimited Trapper's Ambush usage, at the cost of 15%? Super Energy."|2722573682 E0 by187655372|HTML增强正确显示；这是装备星相带来的超能用法，未误写为所有玩家通用；索引V17。|
|R47 Deadfall：12.5米拉/检测、1秒延迟/30秒自动；2583[?]、构造体?HP，束缚30[10]、50% Bodyshot(Base)共享、独有35%，锚12秒、击杀+.5秒最多25秒|2722573683 暗影箭矢：狩猎陷阱|全部对应；T4/CD455；Base保留。Enemies范围V02。源通用虚弱行还给PvP50?，本超能行未给，本站在通用行保留，不报此行漏确定PvP值。|
|R48 Moebius：90[53]%、16秒[Orpheus20]；每轮3最多2轮，~3000伤害线性上限127%锚/150%弓/75%弩、无视Power-Delta但用实际伤害；1076[?]，压制/不稳定/虚弱、7米束缚、锚对束缚目标+20%、50%基础身体共享，6秒/击杀+.5最多25|2722573681 莫比乌斯箭袋|T3/CD500、全部主体对应；+20%主语不清V11；弩75%在源为器型例外（色#e06666），本站括注未误当PvP。|
|R50 On the Prowl：隐身或10秒无标记触发，45[25]米非Boss优先准星近红血；目标活时buff，标记无限[15]秒；击杀1层最多3、能量?%；烟133[?]/5米、虚弱6?、隐身5+2、烟7?秒/范围?/DOT|187655375 伺机而动|全部核心/未知对应；层数三档压成“每层”见V12；HTML槽3，源槽空，U08。|
|R51 Stylish Executioner："Killing Void-Debuffed Enemies ... 8+3.2 seconds ... Truesight for 4 seconds"；"While invisible from activating Stylish Execution"，+300[20]%/虚弱5[2.5]、lunge至?米、Too Stylish2[12]|187655374 潇洒行刑者|主要数值对应，但隐身来源条件扩大、未知射程漏出，V13；槽2源空U08。|
|R52 Trapper's Ambush：职业充能Quickfall/职业技能效果/再隐身；630[71 guardians/700 constructs]于?米，Void buff+50%，恢复?HP，击杀吞食10+5；搭Vanishing Step施迷失/虚弱并10米隐身；200Class+65[?]%|187655372 捕猎者的伏击|半径?/回血?/PvP缩放?遗漏，“改为”新增互斥语义，V15；槽2源空U08。|
|R53 Vanishing Step："Replaces Dodge Animation with a faster, farther traveling Dodge Animation ... 5+2 seconds"|187655373 隐身步法|动画/时长对应；槽2源空U08。|

### 泰坦：9/9

|源行/原句|hash|结论|
|---|---|---|
|R56 Shield Bash：冲刺1.25秒/未命中消耗15%/开火滑铲限制/守护者突进失效.5秒；6.8米、1073[110]直击/后方7米391[40]、2米压制；击杀45HP OS10+5|4220332375 圣盾强袭|所有公共肩撞和本技能规则对应；CD131.7/CM.7；Enemies范围V02。|
|R57 Shield Throw："Ricochets up to 4 times ... attempts to home in towards enemies ... affected by gravity"；400[70]，每命中15HP OS|4220332374 圣盾投掷|数量/伤害/每命中护盾对应；CD131.7/CM.9；Enemies范围V02。|
|R59 Sentinel：90[53]%抗性、17秒/5.88%，轻4.5末2%、地3连797/856/1516、空2连；重屏障-20%移速/正面免疫，7[?]/.05秒，格挡?[any]生球2.5?%/1.5秒CD，投掷最高+1787%；盟友5米25%/45OS/50操控填装/2.5秒补弹/3秒后9HP每秒；盟友数20/35/?/?/50；手雷投盾723[?]、不耗超能/3秒CD/反弹?追踪?|4260353952 哨兵圣盾|所有细项读过；T2/CD556正确；格挡生球阈值、技能伤害PvP范围、被动drain用词见V16；未知伤害门槛仍有其它?。|
|R60 Twilight："Damage Resistance while in Cast Animation: ?% [%]"；3斧、1250[?]冲击/1750[?]爆炸.6秒、落地20秒；携带10ammo/15秒、轻581[175]耗1/虚弱，重1337[?]+830[250]耗全、仅Void Surge modifier/debuff增伤|4260353955 暮光军火|T3/CD500，全部攻击与最大值对应；施法抗性整句缺失见V18；Surge modifier本站“修正”未宣称腿部模组，保留。|
|R61 Ward：施法?[26.5]%/手雷1充能/3球每2.3%；8000constructHP/75??%NEEDS TESTING/200HP核心，8米/30秒、守护者+50%/技能特殊缩放，projectile防护/内部Combatant射穿、部署拉15米、200Super+10秒；内部施法者近战50%/最多5球、持续虚弱/嘲讽?米、15OS每秒/40[?]%/50操控填装；25%武器光.3秒[Saint15]；3秒后拿核心最多2、77公式、投回最多2|4260353953 黎明护罩|T4/CD455、绝大多数对应；未知抗性待测强度/敌人范围/投回操作遗漏见V19；77公式源疑点U05。|
|R63 Bastion：超能15米盟友45OS；增强屏障自己和15?米盟友45OS/守护者伤害+20%；后方11OS每秒；Crucible-only100/80秒基础屏障CD|1602994569 堡垒|全部主体对应；明确熔炉限定没有写成所有模式；槽3源空U08。|
|R64 Controlled Demolition："Void Ability Damage inflicts Volatile. Volatile Explosions also count as Void Ability Damage"；"restore 90 HP ... allies within 40 meters of the user"|1602994568 克制破坏|对应；40米原点为使用者，本站上下文可理解，但未直写原点，不能误读为爆炸40米。槽2源空U08。|
|R65 Offensive Bulwark：额外超能投盾；OS或Ward内，击杀9%手雷+近战，160[20]%近战/5.5米突进，近战杀10OS，普通近战算Void powered但Doomfang/Severance除外|1602994570 进攻堡垒|全部规则对应；额外投盾本站没说“一次”，但没有加入其它次数断言；槽2源空U08。|
|R66 Unbreakable：base152秒，95?[64]%抗性/嘲讽迷失/10OS每秒5+2.5/每秒耗7.5%；格挡移速-50?%.5?秒，回能递减时间OR受伤?；无移动惩罚仅不能攀爬/冲刺取消；Sentinel装配生球2.5%/4.5CD；释放/耗尽，blast耗50%/11米、430[64?]min→1584[178?]after lots[?]damage；击杀吞食10+5|1602994571 坚不可摧|全部主体对应；“基础”冷却限定/手雷伤害类别/最大伤害所需格挡量未知见V20；槽3源空U08。|

### 术士：8/8

|源行/原句|hash|结论|
|---|---|---|
|R69 Pocket Singularity："Innately has 2 Melee Ability Charges"；2秒球、auto melee消耗充能突进/伤害降低65%-50%越近越低仍knockback/Volatile，2?米追最近、3.75米527[60]，守护者突进失效.5秒/断滑铲|2299867342 口袋奇点|CD131.7/CM.9、全部操作数值对应；本站把 ball 染orb“能量球”易混可拾取能量球，见V21。|
|R71 Cataclysm：90[49]%/慢追踪弹3241[?]/12米，400constructHP、caster对自己弹+300%；6seekers649[?]/~4米/各100constructHP、可打爆/施法者显著更高伤害|1656118682 新星炸弹：灾变|T3/CD500、全部对应，无将300%错误改为300%总倍率。|
|R72 Nova Vortex：90[49]%，快弧线3021[?]/?米、.43秒生成奇点立即拉，52[?]/.13秒持续10秒/范围?、每?秒把?米敌人拉向it|1656118681 新星炸弹：涡流|T3/CD500及未知值对应；拉扯终点“自己”可能错误指施法者，见V22。|
|R73 Nova Warp：90[58]%，24.5秒/4.1%，轻耗5%/964[200]/6米/最多衰减50%；.6蓄力/~14米拉/伤害和半径线性+120%/移速-?%；重/冲刺耗3.5%/4方向seekers/8米/193[?]/Weaken|1656118680 新星折跃|T2/CD556、全部对应；Enemies范围V02。|
|R75 Chaos Accelerant：extra Grenade Charge；Axion+2寻踪/PvE25%/复触发，Scatter+4/12/5米/PvE25%，Vortex"7.5% Increased Duration, 70% Increased Radius ... 0.275s sooner ... 0.2s earlier"；4种手雷HHS/1.15x|2321824285 混沌加速|操作/额外充能有；站文只“逐条效果见手雷”，未保留汇总Vortex相对值/与详细行差异及1.15vs1.154，V14/U03；槽2源空U08。|
|R76 Child：裂痕25秒就绪/最多2灵魂、武器命中发射；41[10]虚空手雷/.7秒/10米/9.25秒、虚弱4[2.5]且Combatants压制，150HP/主动汲取前?抗性；Healing每1.4秒4%手雷近战/Empowering25HP；击杀职业能T1 10/T2 15/T3 20/T4+50/Guardian33.4|2321824287 旧神之子|所有数值/条件对应；“开始主动消耗前”译draining不清但未赋额外机制；槽3源空U08。|
|R77 Feed："Void Ability Kills grant Devour. Devour becomes Enhanced Devour"；140激活/重新/击杀、10+5/5+3、回能15/23.2/27.5/40/40|2321824284 虚空供养|全部对应，明确与通用70吞食分开；V01，槽2源空U08。|
|R78 Soul Siphon：命中充能近战替换20秒；最多4/20米/.2秒递增/3.2秒拉；首跳后.6秒最后拉必踉跄；每敌每跳15OS/15+7.5秒/职业?%，Persistence需≤15才能刷新22.5；平均1320，"2 | 11 | 26 | 62 | 100 | 137 Ticks + 879 Finish"，PvP全?|2321824286 灵魂虹吸|所有主体/刷新条件对应；damage ticks被写“跳数”V23；源拉扯时间疑点U06；槽3源空U08。|

## 3. 差异证据和处理边界

以下是审计发现，不是本轮授权分支修复请求。除明确写不确定者外，证据是源表与现有页面的实际差别。引用的本站中文均来自当前索引/HTML，并在涉及字段时对照记录。

### V01：原表小字语义丢失，且页面没有解释增强时长

原表 R4 的 10 后 +5、5 后 +3，R5 的 5 后 +2，R6 的10后+5等均是紫色 small；手雷 R37–40 的延时差、跳数增加、持续增加、嵌套总伤害也是紫色 small。本站则直接“持续 10+5 秒”“刷新 5+3 秒”“0.67−0.1 秒”“最多 16+9 次”，视觉上是普通算式。HTML完整页脚只有更新、DDC来源、署名和法律声明，没有坚韧回声/残存回声/小字含义图例，也没有未知值说明。

字段：trait3078132110/655301426/2485406866，inventory2661180602/2661180603/3854948621/1139822081/187655375/187655374/1602994571/2321824284/2321824286，以及1255073825/2809141585/1016030582正文和1016030582.E0等。

因此页面不能让没有装备碎片的读者把10+5无条件读为15；同时不能靠50%自行把源刷新5+3纠成5+2.5，原表就是+3。明确标原表增强/碎片条件、对有冲突者给待确认，不算术猜补。

### V02：Enemies 被系统性收窄成“战斗人员”，与 Combatants 原有区分合并

例 R8 "Suppressed Enemies ... 10 [5] seconds" → trait2578642829：“被压制的战斗人员 ... 10 [5] 秒”；R9 "Volatile Enemies ...190 [200]" → trait4105407564：“不稳定的战斗人员 ...190 [200]”；R11 "Weakened Enemies receive15%[7.5%]" → trait3336638905：“被虚弱的战斗人员受到 ...”；同一源表又明确分 Combatants 与 Guardians，本站在这些“战斗人员”句内放PvP值，主语范围不一致。

此类还涉及碎片3854948620/2272984657/2272984667/2272984665/2661180601/2272984669/3854948621，手雷3232422679/1514173218增强/1547656727/1255073825/1016030582及E0，minted4294967323，猎人1139822080/1139822081/2722573683/2722573681/187655375/187655374/187655372，泰坦4220332375/4220332374/4260353952接触屏障与盾追踪/4260353955/4260353953持续虚弱，术士2299867342/1656118682/1656118681/1656118680/2321824287伤害及击杀/2321824286。不是要求全局替换全部enemy标记；源明确Combatants的蓝色抗性、嘲讽、迷失、强化伤害等必须保留PvE范围。列举范围表示相关正文中至少有源Enemies对应本站战斗人员的实例，不表示每句都错。

### V03：虚弱来源延长句专名漂移

R11 "Fafnir's, Felwinter's, Tractor's weaken duration can be extended by any other Weaken effect." trait3336638905正文实际：“法夫纳、费尔温特与牵引者的虚弱时长可以被任何其它虚弱效果延长。”上文却为“邪冬的头盔”“牵引器火炮”。同一段落用两个没有说明的译名指代同一来源，且后两项无既有exotic标记。效果数值正确，但名称/来源归属不清，应在最终报告列出。

### V04：霸道回声十秒只显式约束前向移动

R15原句 "Suppressing an enemy grants +30 Weapons and 4% Forward Movement Speed Bonus for 10 seconds and refills the readied weapon." inventory2272984657正文：“提供 +30 武器属性、10 秒内 4% 前向移动加成，并补满已准备的武器（4 秒内置冷却）。”+30属性持续没有明写，同源两个buff共用10秒的句法被拆掉。readied已经正确保留，不误报它缺失；4秒CD也正确。

### V05：坚韧回声三职业属性惩罚缺少职业限定

R22原句 "-10 Weapons (Hunter) / -10 Health (Titan) / -10 Class (Warlock)"。inventory2272984671.investmentStats保存三项-10并标isConditionallyActive。当前索引“职业 -10武器 -10生命值 -10”，页面三项数值亦无职业限定。render.py stats_of()按每条investmentStats直接显示名字和值，没有职业条件解释。读者会误认为三项同时扣。这是条件呈现问题，不应通过更改manifest属性或删掉其中两项来修。

### V06：报复回声3+边界中文不精确

R25 "surrounded by 3+ enemies" → inventory2272984669：“8 米内被 3 名以上战斗人员腹背受敌时”。“以上”通常含本数但日常也被读成超过；下一行3名档位存在，可避免把它误报为确定>3。报告为措辞风险，建议“不少于3名/至少3名”。

### V07：量子光束 slow-moving 被译成减速飞行

R30 "releasing a slow-moving Axion Bolt" → inventory3232422679：“放出减速飞行的量子光束”。源是低速度运动，不是持续减速。正文已保留未知速度?，不应补假速度。

### V08：强化量子光束25%伤害增幅失去PvE限定

R31 "25% increased damage" 整段该数字为蓝色#a4c2f4；R75同样蓝色。inventory3232422679.E0实际：“光束飞行速度提高 ?%、伤害提高 25%”。真实HTML同样无模式标签。原文对Axion未写Combatants文字但颜色给出了PvE；不能当PvP也+25%。Scatter则源明确"towards Combatants"，本站相应限定存在，不要把两条都视为无模式增强。

### V09：Voidwall perpendicular 的参照语义弱化

R38 "creating a perpendicular wall of Void Light" → inventory2809141585：“立起一道跨度 ? 米、垂直的虚空光能墙”。“垂直的”可能被读成竖直高度方向，源perpendicular是关系性方向词，但本gid没有显式参照物。列为翻译歧义，不凭游戏记忆写“相对投掷方向垂直”；源参照物需另证。

### V10：涡流小字“第13/20、17/24跳”被误转为区间

R39原始HTML为普通字号 "The 13th" ＋紫色small "20th"＋"tick has falloff"，不是“13th to20th”。inventory1016030582正文/真实页面：“第 13 至 20 跳有衰减”。R40普通"The17th"＋紫色small"24th"，inventory1016030582.E0：“第 17 至 24 跳有衰减”。源小字区分通常和延长状态的那一跳；本站却断言整个连续区间都衰减。不得根据纯文本串或伤害总和重建；应准确保留原表基准/延长端点及若有不一致则待确认。

### V11：莫比乌斯额外20%锚伤害主语丢失

R48在Moebius Anchor段 "Deals 20% increased damage to tethered enemies." inventory2722573681：“锚 7 米内的战斗人员被束缚，对它们的伤害提高 20%”。没有明确是“锚对束缚目标的伤害”，容易被理解成所有伤害都多20%，与通用虚弱30%进一步混淆。原表锚段主语应保留，不能把20%写成新的通用虚弱档位。

### V12：成功狩猎三档未知值被压成每层线性

R50分别给 "Succesful Hunt x1 | +? Stability ... 0.?x"、x2、x3，同样未知但逐档列出。inventory187655375正文：“每层提供 +? 稳定性、+? 填装速度，换弹时长 ×0.?”。这是增加“每层同样提供”的断言，原表没有确定线性关系。保持三个档位各自未知更忠实。

### V13：潇洒行刑者隐身来源条件扩大、射程未知省略

R51 "While invisible from activating Stylish Execution"；"Melee Lunge Range extended to ? metres"。inventory187655374实际：“隐身期间可以发动优雅处决 ... 并延长近战突进射程。”漏掉必须由此星相发动产生的隐身来源，也漏掉目标射程?米。它不是所有隐身通用效果。索引还出现perk:2534780615另一段（任意元素减益/0.5秒破隐后等），不应拿那条不同版本当本虚空星相原文；实际本页主条显示的是上述库存正文。

### V14：混沌加速“见手雷”没有涵盖源汇总全部内容及源内差异

R75 Vortex明确 "7.5% Increased Duration, 70% Increased Radius, begins dealing damage 0.275s sooner, and pulls enemies 0.2s earlier." inventory2321824285只有“逐条效果见手雷技能一节”。1016030582.E0有绝对4.3秒/7米/1.2秒/.617秒，但没有四项相对增量及其源语义；R75还写HHS "1.15x Grenade Regeneration Speed" 而R32写1.154x，本站只保留1.154。源汇总和详细行并不处处完全等价，见U03。不能假定详表自动证明/替代汇总全部；应报告差异或注明使用哪段原表。

### V15：捕猎者的伏击丢未知数值/模式，新增“改为”

R52 "dealing up to630 ... over ? meters"、"Restores ? HP"、"up to65% [?%] at200Stat"；同装Vanishing Step原句 "Quickfall inflicts disorient and weaken ..."。inventory187655372正文没有伤害范围?、回血量?、PvP属性缩放?，实际显示“恢复生命值”“200属性时最多+65%”。另写“快速坠落改为施加迷失与虚弱”，源只增加这些效果，没有宣称取代上述伤害/回血/吞食机制。应保留未知/模式及加成组合，不自行判断哪些效果被替换。

### V16：哨兵圣盾生球阈值和技能伤害模式遗漏，drain错称吸收

R59 "Blocking ? [any] damage generates an Orb ..."；?蓝色、[any]红色。inventory4260353952：“格挡伤害会生成能量球”，缺PvE阈值未知、PvP任意伤害的区分。下一源句 "Ability Damage removes Super Energy but partially extends it at the same time" 整句红色#dd7e6b，属于守护者伤害上下文，本站写“技能伤害会扣超能能量，但同时部分延长超能”而未给模式限定。

同条源 "Passive Super Energy Drain while Blocking can be decreased" → 本站“格挡时的被动超能能量吸收越少”。这里应是消耗/流失，不是吸收回能。重屏障另被染为星相名“坚不可摧”，源impenetrable为屏障性质而非Unbreakable星相，属于中文命名歧义；不可因此归到星相伤害规则。

### V17：全部4增强子行索引没有desc，但HTML有正文

当前elements__void.json中量子光束（混沌加速）、散射手雷（混沌加速）、涡流手雷（混沌加速）、鬼灵利刃（捕猎者的伏击）都只有名字/图标/keys，无desc。实际HTML四个r-sub-row均有完整描述，库存enhanced也有。

这是索引信息缺口，不是整页增强缺失。是否构成用户功能bug取决于跨页引用/悬停是否使用这些具体子条目，未运行行为测试，不能宣称已证实悬停坏了。该边界必须写入最终报告，否则单看索引会把4条增强误算成缺失。

### V18：暮光军火施法抗性未知整句遗漏

R60 "Damage Resistance while in Cast Animation: ?% [%]"，前?蓝色后[%]红色。inventory4260353955正文直接“召唤3把虚空斧”，索引/HTML都没有这句。未知也应列出，不因原表没有数值就省略。

### V19：黎明护罩原表待测强度、目标范围和投回步骤遗漏

R61 "75??% NEEDS TESTING Damage Resistance against Combatants" → inventory4260353953：“有75%?伤害抗性”。保留问号但漏原表明确NEEDS TESTING、双问号的高度不确定提示，不能当站内实测。R61 "Enemies are constantly weakened" → “战斗人员持续虚弱”，范围见V02。原表 "unless an enemy is within it" 的一般exception与下一句Combatant射穿条件在本站都写“战斗人员”，两级条件被合并。

R61最后 "The Core can be thrown to redeploy by the caster up to2 times per cast" 未在本站明确出现：只写部署3秒后可“拾起 ... 最多两次”和77公式，没有“施法者可抛出核心重新部署，最多两次”。标题“重新部署”不是操作/次数说明的充分替代。

### V20：坚不可摧base冷却、伤害类型及最大伤害未知条件丢失

R66 "Overrides Grenade Ability Cooldown to152 seconds at base" → inventory1602994571：“装备时手雷冷却覆盖为152秒”。与其它冷却格“基础冷却”不同，本句漏基础限定，容易读成各属性都固定152。

R66 "minimum ... Grenade Damage ... after receiving a lot [?] blocked damage" → 本站“未格挡任何伤害时最少430[64?]，随已格挡伤害提高，最高1584[178?]”。省略手雷伤害类别和达到上限所需格挡量未知。未把未明确技能分类误用为普通Void Damage；源此处是Grenade Damage。

### V21：口袋奇点“球”着成可拾取能量球语义

R69 "Launches an unstable ball of Void Energy" → inventory2299867342：“发射一颗 ... {orb|能量球}”。原表不是Orb of Power；本站orb token把它与可拾取超能能量球身份混在一起。原文unstable也不等于在发射球体上已经施了Volatile减益（后文爆炸才inflictsVolatile）。不是数值差异，是术语/着色额外语义。

### V22：新星炸弹涡流二次拉扯终点代词改变

R72 "repeatedly pulls enemies ... towards it"，it为前文Singularity。inventory1656118681实际：“并每?秒把?米内的战斗人员拉向自己”。第一句“奇点 ... 把战斗人员向内拉扯”正确，后句“自己”可能被读为施法者（源不是the user）。应明确拉向奇点，不能把它报告为有原表依据的追随施法者拉扯。

### V23：灵魂虹吸每跳伤害值被写成跳数

R78先称"Melee Damage Ticks"、给平均~1320，后 "2 |11 |26 |62 |100 |137 Ticks +879 Finish"。inventory2321824286：“跳数为2 /11 /26 /62 /100 /137加收尾879”。这里列的是逐跳伤害，不是各档跳数。PvP全部未知同样应描述为逐跳伤害，未知与PvP同时标，而非只有unsure。无需靠相加判断，也无需改平均1320；源“slightly randomized/averages”限定已保留。

## 4. 原表有、本站无 / 本站有、原表无 / 无法确认

### 原表有而本站缺少（不含整条缺失）

- 坚韧回声三职业属性条件：V05。
- 量子光束强化25%蓝色PvE限定：V08。
- 潇洒行刑者隐身来源与未知突进射程：V13。
- 混沌加速汇总相对参数及与详表差异：V14。
- 捕猎者伏击伤害半径?、回血?、PvP缩放?：V15。
- 哨兵生球?[any]门槛区分、技能伤害PvP上下文：V16。
- 暮光军火施法抗性未知：V18。
- 黎明护罩NEEDS TESTING及投核心重新部署句：V19。
- 坚不可摧base、Grenade Damage、上限格挡量未知：V20。
- 小字增强来源/图例：V01（源以样式表达，本站没有等价语义说明）。

### 本站新增或改变但本gid未支持

- 涡流“第13至20/17至24跳”连续区间：V10。
- 成功狩猎“每层”暗示线性：V12。
- 任意隐身均优雅处决、伏击“改为”互斥：V13/V15。
- 口袋奇点Orb of Power/Volatile着色身份：V21。
- 灵魂虹吸“跳数”而非伤害：V23。
- 全部碎片“碎片消耗1”、12星相槽数：来自本站manifest，不在本DDC信息单元格，属于额外来源数据，不自动判错误，见U08。

### 无法确认/源表疑点（明确不猜改）

U01 Void Breach："Allies do not receive ..."究竟表示拾取物仅向本人生成、盟友无法看到/拾取，还是拾取后无效，本gid没有更细描述。本站“对盟友不生效”不能作为已实测证据。

U02 Magnetic：每次472而总946，源和本站均如此；不由472×2决定改哪个。

U03 Chaos/Vortex：R75相对时长7.5%/半径70%/伤害提前.275/拉扯提前.2；R39与R40绝对数分别4→4.3、4→7、1.45→1.2、.833→.617；R32 HHS1.154而R75写1.15。保留源两处及其差异，不能把舍入或内部不一致擅自定为确定机制。R39/R40跳数与“最后一跳”及总伤害也需按小字原意核实，不由加总猜区间。

U04 Snare Bomb/R50 Prowl：烟幕持续、起跳时间、.6跳距、第9跳等源数据有明显待核细节；已保留未知，未根据9跳和5/7秒算出替代时长。Prowl各层稳定/填装、回复能量、烟幕半径/持续/增长/总伤害本来未知，不记为本站缺实数。

U05 Ward：原表明确75??% NEEDS TESTING。77 ÷ 拾取时剩余Armor of Light时长的重新部署公式，原表未详解该时长来源/单位与缩放关系。本站有同式，不把它简化成77/护罩剩余秒数或自行推导有效持有时长。

U06 Soul Siphon：原表“pulling ... over3.2 seconds”同时“final pull(after.6seconds fromfirsttick)”，可能有不同阶段/时序，不凭.2秒tick猜替换。原表平均~1320且伤害略随机，不用给定单次各跳和调整平均值。

U07 大量?值：本轮已核对原表与本站未知值。包括终结/回血距离、Axion速度/寿命、超能/构造体PvP伤害、Prowl全部档位、Sentinel格挡阈值/收益/延长/反弹、Unbreakable回能递减、Nova范围/拉扯间隔等；问号本身不是可填充数据。只对V13/V15/V18/V20等本站省去的问号列遗漏。

U08 槽位：源R50–53、R63–66、R75–78的Fragment Slots单元格为空（可能原表图像不在快照单元格正文里）；不能以本快照证实DDC槽数。本站manifest与实际HTML一致：猎人Prowl3/其余2；泰坦Bastion3/CD2/OB2/Unbreakable3；术士Chaos2/Child3/Feed2/Siphon3。全部16碎片显示消耗1；本gid Stat Changes仅给属性，不提供消耗。这里只确认本站来源和呈现一致，不声称DDC亦有这些数。

## 5. 核对边界与交付

- 58主条全部有hash映射，61源信息行全部映射；未发现未映射英文实体。
- 4增强正文已在真实HTML读取，不能因索引无desc称正文不存在。
- CD/CM/ST全部有原表的项都与本站对应：7基础手雷、5近战、9超能；HHS没有单独DDC CD，本站留空不算遗漏。星相Bastion熔炉100/80、Unbreakable基础152另在正文核对。
- 全部16碎片Stat Changes已核对，唯一确定职业条件呈现差异为Persistence；其它值对应。
- 通用70吞食与Feed强化140、通用虚弱15与特殊30/35、通用护盾45/70%抗性与技能生成/抗性、通用隐身与Stylish来源增强均分别核对，不把星相增强混成通用机制。
- 没有游戏实测，也没有本轮构建/验证。报告仅承诺指定DDC快照与当前实际索引/HTML的逐条语义审计；源表待测/矛盾均单列，不作为确定游戏事实。
- 所有分支新发现只审计。本代理没有向数据owner发修复指令，没有越界编辑，搜寻者记录完全未碰。


# 附件：冰影


## 边界、来源与计数

来源：[DDC Stasis，gid=1088259962](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1088259962)，使用指定已验证快照data/ddc/1088259962.json。下文R编号是JSON数组的一基行序，不声称是Google sheet的物理行号。中文取修改前data/index/elements__stasis.json、实际site/elements/stasis/index.html及其edit.json；namespace/hash通过i18n.en.name确认，绝非只按中文猜名。

只读：未构建、测试、lint、格式化、浏览器、部署、提交、推送。工具无写入能力，因此此report就是完整交付，父代理可保存local://stasis-audit.md。新发现仅审计，不给写入owner自动扩大修复范围。

全覆盖：44基础条目（traits 6，inventory-items 38；16碎片、4手雷、3近战、3超能、12星相）；6增强字段（碎片拾取1、四手雷4、冰川震击1）。DDC R4–9、R11–26、R28–35、R38/40/R42–45、R48/50/R52–55、R58/60/R62–65均已核对。DDC没有其他未映射正文条目。28份索引sandbox gameplay副本已核对，获取来源/官方说明不是DDC实测正文，不伪报为DDC新增机制。12星相槽位的DDC指定快照格为空，不能证明槽位与DDC相等；实际页数与manifest数字逐项一致，详见槽位矩阵。

矩阵中：T=traits.json，I=inventory-items.json，S=sandbox-perks.json；D= i18n.zh-CN.realgame_details；E=enhanced[0].realgame_details。中文去掉span和着色token，保留文字与数值；其语义和实际生成页相同。方括号源色#ea9999为PvP；小字增量是耐久之吟条件，不是无条件时间。说明中的enemy→战斗人员是既有术语习惯，但本页又明确把Combatants与Guardians区分，因此单纯enemy不应额外解释成PvE-only；下文将此作为全局范围风险，不把每个使用enemy的行重复计作独立数字差异。

## 差异清单（确认差异、表达风险与原表疑点分开）

### A. 本站正文/呈现确认差异

ST-A01，T/4043161234.D：R4原文“Shards last for 20 seconds.”；本站“破碎状态持续20秒”。这不是碎裂状态的持续时间，是场上碎片的存在时间。相同误译在三个Harvest冷却句“生成6份破碎”，源是6 Shards。涉及I/1920417385、2031919264、2651551055.D及S/3595066605、2847573064、2672933291.D。

ST-A02，T/2968599152.D：R8“Frozen Enemies shatter after receiving varying [200] damage.”；本站“在受到伤害后碎裂，PvP固定200伤害”。中文丢varying阈值，且可被读成碎裂造成200而非累计受到200后触发。应描述触发所需伤害，PvE因目标不同而变，PvP为200。不新增具体PvE阈值。

ST-A03，同字段：R8“Grounded Guardians can cast their Super Ability to instantly break out.”；本站“扎根的守护者可以立即施放超能挣脱”。Grounded为在地面上，不是扎根状态。

ST-A04，I/537774540.D、I/2368990401.D及对应S/3927793534、3229952126.D：R12/R13“Miniboss+ = 100%”；本站仅“初级首领100%”。漏掉“及以上”的等级覆盖，尤其Boss。

ST-A05，I/3469412971.D（S/314678700同）：R16“Falloff decreases damage dealt down to a minimum of 15 [4] damage at 10 [8] meters.”；本站“衰减后最低仍有15 [4]伤害”。数值本身相同，但省略达到最低值的10 [8]米位置；第一句只有半径，不能严格替代最低值位置说明。

ST-A06，I/1399218.site_recoveryMultiplier：R34“Chunk Scalar: 0.?x”；本站字段null，HTML只显示105秒，完全不显示未知回复倍率。未知值不是没有该项；原表明确保留0.?×。

ST-A07，I/2028772231.D：R48“upon releasing [Melee Attack]”；本站仅“跃过空中，发动突进距离延长的近战攻击”。漏松开近战键的触发方式。官方database_details有相关文字，但页面展示的实测正文没有，不算自动补齐。

ST-A08，I/2021620139.D：R50“except for Light Attacks and Contact Damage”；本站“轻攻击与直击伤害除外”。Contact Damage指上文接触被冻结对象/水晶每0.15秒造成300的接触伤害，不是下文攻击impact damage（直击伤害）。中文混淆两个伤害实例，影响310%排除范围。

ST-A09，I/1563930741.D与S/3083226865.D：R54“freezing [Slow x? for ? seconds] enemies within ? meters”；本站“冻结?米内的战斗人员[ PvP改为减速 ]”。漏PvP减速层数未知和持续时间未知，不能把原表两个未知维度省成泛泛减速。

ST-A10，I/3683904166.D：R60“Drains 4.5% Super Energy per twin-shards.”；本站“每次双重破碎消耗4.5%”。twin-shards为双联弹/双联碎片弹，不是双重碎裂；源“Casts two ... homing twin-shards”也被压成“两颗追踪弹”，损失双联弹结构。需保留源按twin-shards计费，不自行猜整个轻攻击总耗能。

ST-A11，同字段：R60溅射50 [33]“to unfrozen enemies”；本站每颗50 [33]句未限定未冻结目标，随后才说冻结目标减伤90%。后句有助推断但不等于准确基础伤害适用范围，宜明确未冻结目标。

ST-A12，全页耐久条件呈现：R15声明“value with Durance shown in smaller text next to the regular duration or stack amount”，实际HTML所有增量均普通文本，没有small/条件标记，但I/3469412969.D还声称本站“小字标出增量”。已核对实例：T/3385340084 1.5+0.5；I/1399219 4+2；1399216 2+2与7+2；1341767667 3.5+3.5 [1.5+0.5]；2625980631 14+2；2934767477 8+4? [1.5+0.5]；2642597904 4.5+4.5 [2+1.75]及25+5。未知?+?同样需要区分基本时长和耐久条件。本页没有全局耐久/PvP图例补足该区别。这是确认的markup语义丢失，不是数字算错。

ST-A13，I/3866705246.D与I/668903196.D及对应S：DDC R53“7 [17] second cooldown”、R65“7 [1] seekers”的PvP方括号有源颜色，本站这些句被整体note包住，17/1没有pvp span。数字保留但PvP色义丢失。类似其它未知PvP数值整体unsure包住（例如Freeze/Shatter未知值、Diamond Lance [6.75?]、Wrath [? and Non-Lethal]），未知性质与模式性质应该同时保留，不能未知覆盖PvP身份。

ST-A14，Harvest冷却起点不完整：R42/R55/R64“within ? seconds of the first shard?”；本站“?秒内生成6份破碎”。漏计时从首枚碎片开始及该起点本身问号；虽保留窗口未知，未保留原句起点疑问。涉及三个I与三个S Harvest D。

### B. 额外索引副本漂移/错误（不是实际基础HTML数值错误）

ST-B01，S/2796898066.D严冬帷幕：索引副本8 [1.5]秒，I/2934767477与DDC8+4? [1.5+0.5]。遗漏耐久增量；正文基础HTML正确保留数字，但呈现有ST-A12。

ST-B02，S/3356473147.D钻石长矛：DDC R53/I为136 [45]投掷、180 [90]猛击；索引副本150 [45]、200 [90]。此外副本“一次技能击杀”漏Stasis范围；额外断言“重击灌注的非充能近战击杀守护者不会生成”不在该DDC原文；缺“Diamond Lances instantly shatter Stasis Crystals upon damaging them”（只保留投掷直接接触碎晶，未覆盖通用任意伤害）。这些均已直接读S记录确认，不靠索引猜测。

ST-B03，S/1394191455.D凄凉观察者：副本“冷却覆盖159.6秒，回复倍率继承当前手雷”；DDC R62/I为冷却和scalar都设为Glacier（本站175.6秒、0.625×）。副本减速持续4.5 [2]及炮塔25秒，少耐久增量；记录没有说明“这里仅展示未装耐久基础值”，与I并存仍有漂移风险。

ST-B04，S/1603488897：索引显示名称“寒冰断破”但实际desc为Iceflare Bolts冰焰飞弹，q=冰焰飞弹。S记录en.name也是Cryoclasm，官方database_details却是“Shattering a frozen target spawns seekers...”的冰焰飞弹效果。这是manifest/实体身份本身异常的记录证据；不能擅自全局改manifest name或凭记忆换hash。基础页I/668903196名称与正文正确。审计记录映射异常即可。

### C. DDC自身疑点/重复条目信息不一致，不擅自推导确定值

ST-C01，已知大型碎片疑点：R4“Large Stasis Shards restore 20 HP and x3 Frost Armor”；R42/R55/R64“Large ... restore ? HP and grant x3”。本站T增强20HP、三个Harvest ?HP分别忠实于两处源；不是第二个已知数值冲突。应归类源表已知/未知标注不统一，注明DDC概要20、详细待确认；不能把?当0/另一确定值，也不能默改三条为已实测20。

ST-C02，Frost Armor/Rime：R6概述最大7层“50% [16%]”，R24碎片“50% [16?%]”。T/106947924把概述也写[16%?]，I/2483898430忠实碎片疑问。源疑点为概述确定16、详细待确认；本站概述传播问号是与所对行的标注差异，但不能当作确定游戏机制需要强行16%。另外R6每层7%、5层31.25%、7层50%与PvP每层2%、7层16%的计算关系并非简单同一公式；本轮未游戏实测，不用算术替源修值。

ST-C03，Touch of Winter冰川重复说明：R33“Creates ↑7 ... in a heptagon shape”；R44“form a heptagon hexagon, and creates an additional 2 Large Stasis Crystal”。raw里hexagon是灰色#999999，不能去色后宣称当前六边形；本站七边形7块与R33一致，但R44还包含新增两块是Large的尺寸信息，enhanced遗漏该限定。源层面记录灰色旧措辞/并列词疑点，尺寸遗漏单独存在。

ST-C04，Shatter增强回能条件：R35“Hitting Frozen Enemies grants FPS-based ...”；R44总结“upon directly hitting a Frozen Enemy ... ~30%”。本站enhanced用“直接命中”及详细FPS值，综合两处源，不算无出处新增direct限定。R35未重复direct是源摘要差异，不能只对R35报错误。同理~30不是第二个与42/30/28冲突的确定值。

ST-C05，Silence & Squall：R40“Lasts14+2... every0.1[0.17]...for6 seconds”内同时有总寿命与6秒，本站“风暴本身覆盖6秒”把6秒附到风暴本身，易误读为风暴总寿命又是6。源句本身6秒所属机制不清，需保留两个时间并注明源未明确6秒对象，不凭推测解释成目标间隔/风暴寿命。数字不冲突不等于语义已清。

ST-C06，Glacial Quake R50“Howl ... same base damage”“310%”“1.5x”及Synthoceps25%/50%复杂相乘说明，本站E基本全保留。没有根据“15%最多5次”等数值自行推算遗漏次数，也不改源100+属性边界。唯一明显翻译问题在Contact Damage见ST-A08。

### D. 全局范围/未能判定的独立事项

ST-D01，enemy与Combatant：DDC多处明确Enemies包含Guardians的PvP括号。本站统一翻战斗人员时可能被读成排除PvP。风险覆盖T六效果主句和I中所有冻结/碎裂/命中enemy条件，尤以Hedrons、Fractures、Rending、Bonds、Shatterdive、Silence300%/Howl1.5x（源为non-boss Enemies）为甚。不能由翻译推导PvE-only。Winter's Shroud的“against Combatants”50%抗性、Winter's Wrath额外361“Combatants”则确有Combatants限定，须保留，不能反向扩大所有Combatant到PvP。

ST-D02，DDC指定快照12星相Fragment Slots列皆空。本站确实展示2/3槽位，且来自investmentStats。此是来源覆盖边界，不是假装已逐一对DDC验证的数值。以下全矩阵标“DDC空/本站manifest”。若需要物理原表槽位图片二次审计，须取原表含图片的实际格；本轮只读工具没有urllib执行能力，不补造证据。

ST-D03，16碎片消耗1来自manifest investmentStats/plug.energyCost，不在DDC的Stat Changes列；DDC没有这些消耗文字，不构成无出处机制（manifest可追溯）。官方获取来源说明也同样不在DDC，未用“本站有/源表无”粗暴认作错误。

## 全文对照矩阵

以下逐行列出源全文与本站实际中文全文。基础D以共用字段缩写，增强另列；冷却/属性字段附于每条。所有“无独立数值差异”仍受上面ST-A12、ST-D01等全局事项约束，不代表游戏机制已实测。

### 效果（6 + 1增强）

**R4 Stasis Shard → T/4043161234.D 冰影碎片**
原文：Stasis Subclass Intrinsic: Shattering a Stasis Crystal or Frozen Enemy, or killing an enemy affected by a Stasis Debuff (Slow, Freeze) spawns a Stasis Shard. Small Stasis Shard = Rank-And-File. Large Stasis Shard = Elites, Minibosses, Bosses, and Guardians. Stasis Elemental Pickup: Stasis Shards grant Melee Ability Energy on pickup. Shards last for 20 seconds. Allies receive a copy of all Shards created by the user. Small Stasis Shards grant 10% Melee Energy, and Large Stasis Shards grant 50% Melee Energy. While Glacial, Grim or Tectonic Harvest is equipped: Small Stasis Shards restore 10 HP and grant x1 Frost Armor. Large Stasis Shards restore 20 HP and x3 Frost Armor.
中文D：冰影分支职业固有。碎裂一块冰影水晶或一名被冻结的战斗人员，或击杀受冰影减益（减速、冻结）影响的战斗人员，会生成一枚冰影碎片。红血掉小型碎片；橙血、初级首领、首领与守护者掉大型碎片。拾取提供近战技能能量：小型10%，大型50%。破碎状态持续20秒，盟友能拿到使用者生成的每一份。
中文E：小型碎片额外恢复10生命值并提供1层冰霜护甲；大型碎片恢复20生命值并提供3层。by=[2651551055,1920417385,2031919264]；实际HTML一条组合增强，索引拆3名字无desc。
结果：ST-A01；大型20与Harvest ?是ST-C01。生成条件、大小分类、10/50近战能量、盟友copy与增强层数均覆盖。

**R5 Stasis Crystal → T/3385340084.D 冰影水晶**
原文：Solid Pillars that can be spawned on surfaces, possessing a varying amounts of health depending on their size, lasting up to 15 seconds. Crystals, upon being created, inflict freeze [x15 Slow Stacks for 1.5+0.5 seconds] to enemies within 2.6 metres. Stasis Crystals can be destroyed by depleting their health, dealing up to generally 158 [25] damage over a 8 metre radius. Small Crystals: ? HP | Medium Crystal: ? HP | Large Crystal: ? HP. User deals double damage to their own Crystals.
中文：可在表面生成的实心柱，生命值随体型而定（小型?｜中型?｜大型?），最长存在15秒。生成时对2.6米内的战斗人员施加冻结（PvP为15层减速，持续1.5+0.5秒）。打空生命值即可摧毁，在8米半径内最多造成158 [25]伤害。使用者对自己的水晶造成双倍伤害。
结果：数值/未知尺寸血量覆盖；“generally”限定被省略，158不宜解释成每个来源唯一确定值；ST-A12/D01。

**R6 Frost Armor → T/106947924.D 冰霜护甲**
原文：Grants 7% [2%] Damage Resist per stack, up to 31.25% [10%] Damage Resist at x5 stacks. Frost Armor decays 1 stack at a time every 5 seconds. Damage Resist per stack is decreased to ?% [?%] while in Super. Whisper of Rime: Increases the maximum stack amount to x7, increasing the maximum Damage Resist to 50% [16%]. Increases the Frost Armor stack duration to 6 seconds.
中文：每层提供7% [2%]伤害抗性，5层时最高31.25% [10%]。每5秒衰减1层。超能期间每层提供的抗性会降低到?% [?%]。装备碎片「韵律之吟」时上限提高到7层，最高抗性50% [16%?]，每层持续时间变为6秒。
结果：ST-C02；超能未知与逐层衰减完整。

**R7 Slow → T/4239423954.D 减速**
原文：Slowed Enemies receive multiple penalties related to movement or weapon performance. Freeze occurs upon reaching x100 Slow. Slowed Combatants have 50% Decreased Movement Speed and are less accurate. Slowed Guardians have 50% Reduced Movement Speed, 50% Decreased Jump Height, are unable to use Movement Abilities, receive ?% increased Flinch, and have a penalty to their Weapon Stats. Slowed Weapon Stat Penalties: Stability, Handling, Reload Speed and Recoil Direction are decreased by 75%. Stat Reduction takes place after Weapon Perks. Weapon Stats are considered uncapped before slow's reduction is applied. Eg: 160 Reload Speed will be reduced be 40 Reload Speed. 80 Handling would be reduced to 20 Handling. Overload Champions become Stunned upon receiving any amount of Slow Stacks.
中文：被减速的战斗人员在移动与武器性能上受多项惩罚；层数攒到100层即冻结。被减速的战斗人员移动速度降低50%，精度下降。被减速的守护者移动速度与跳跃高度各降50%，无法使用移动技能，受到的退缩提高?%，武器属性也受惩罚。武器属性惩罚：稳定性、操控性、填装速度与后坐方向降低75%。惩罚在武器Perk结算之后施加，施加前属性视为无上限——例如160填装速度会降到40，80操控性会降到20。过载勇士受到任意层数减速时进入眩晕。
结果：完整保留顺序、uncapped和两个例子，未发现独立数值差异。

**R8 Freeze → T/2968599152.D 冻结**
原文：Frozen Enemies are completely immobilized, rendering them unable to shoot, use abilities, or move. Frozen Enemies receive 10% increased damage from Special and Power Weapons, 5% increased damage from Arc, Solar, and Void Abilities, and 5% [60%] decreased damage from Primary Weapons. Frozen Rank-and-File and Elite Combatants and Guardians receive 120% increased Basic Melee and Glaive Melee Attack Damage, on top of the aforementioned effects. Frozen Enemies shatter after receiving varying [200] damage. Frozen Enemies are immobilized for 6 [1.35 to 4.75] seconds. Boss Combatants are unhindered by freeze and automatically shatter after 3 seconds. Grounded Guardians can cast their Super Ability to instantly break out. Brief Freeze: Guardians frozen by other Guardians are frozen for 1.35 seconds. Prolonged Freeze: Guardians that become frozen by Combatants, or by Stasis Super Abilities, are frozen for 4.75 seconds. Frozen Guardians have their Class Ability replaced with Breakout, which allows breaking out of the long-lasting freeze, in exchange for ? Health. Guardians that are frozen during a Roaming Super automatically break out after a second, while One-off Supers get deactivated if frozen during the cast animation.
中文：被冻结的战斗人员被完全定身，无法射击、使用技能或移动。它们受到特殊与威能武器的伤害提高10%，受到电弧、烈日与虚空技能的伤害提高5%，受到主武器的伤害降低5% [60%]。被冻结的红血、橙血与守护者另外承受+120%的基础与偃月近战伤害。被冻结的战斗人员在受到伤害后碎裂，PvP固定200伤害。定身时长6 [1.35至4.75]秒；首领不受冻结阻碍，3秒后自动碎裂。扎根的守护者可以立即施放超能挣脱。短暂冻结｜被其它守护者冻结，持续1.35秒。长时间冻结｜被战斗人员或冰影超能冻结，持续4.75秒。被冻结的守护者职业技能被替换为突围，可以用?生命值换取挣脱持久冻结。漫游超能期间被冻结的守护者1秒后自动挣脱；一次性超能若在施放动画中被冻结则会被停用。
结果：ST-A02/A03；其余增减伤、近战适用等级、短/长冻结、超能交互均覆盖。

**R9 Shatter → T/37938188.D 碎裂**
原文：Frozen Enemies can be shattered through damage or directly through specific Stasis Aspects, dealing up to 361 [?] damage to enemies within ? metres. Unstoppable Champions become Stunned upon receiving shatter damage.
中文：被冻结的战斗人员可以被伤害打碎裂，也可以由特定冰影星相直接引爆，对?米内的战斗人员最多造成361 [?]伤害。势不可挡勇士受到碎裂伤害时进入眩晕。
结果：数值及未知覆盖；未知PvP颜色身份见ST-A13。

### 碎片（16；属性逐条）

全部D属于I；全部investmentStats的碎片消耗statTypeHash119204074=1，本站皆显示碎片消耗1，DDC不列该消耗。属性statTypeHash：144602215超能、1943323491职业、392767087生命值、4244567218近战、1735777505手雷。

**R11 Bonds → I/3469412974.D 束缚之吟；S/1445819510副本相同**
原文：Killing Frozen Enemies creates an Orb of Power that grants 2.5% Super Energy. Incurs a 10 second cooldown after creating an Orb of Power. Stat Changes: -10 Super.
中文：击杀被冻结的战斗人员生成一枚能量球，提供2.5%超能能量。生成能量球后有10秒冷却。属性：超能-10。
结果：覆盖；enemy范围风险ST-D01。

[…149ln elided…]
原文E：Howl of The Storm (Glacial Howl) | Drains15% Super Energy (Up to x5 per Cast). Behaves and deals the same base damage as the regular Aspect and is considered "Super Melee Damage". Glacial Howl stacks Glacial Quake's310% Frozen Enemy Damage Increase multiplicatively with Howl's intrinsic1.5x Damage against Frozen Non-Boss Combatants. Glacial Howl damage can be further scaled by100+ Super Stat, Super Melee Damage Buffs (Armorsmith, Shieldcrush, No Backup Plans), and Super Damage Buffs (Synthoceps). All those damage buffs stack multiplicatively with each other. No Backup Plans is additive to Armorsmith/Shieldcrush. Glacial Howl against Frozen Enemies while Synthoceps' buff is active removes Titan's intrinsic1.2x Melee Damage, only granting+25% Damage instead of the expected50%.
中文D：伤害抗性90% [47%]。基础持续25秒，或每秒消耗4%超能能量。期间跳跃高度提高，且寒冰断破没有冷却。施放时冻结8 [6]米内的战斗人员；超能结束时提供3次近战技能充能。激活期间以任何方式击杀都会生成能量球，每枚提供7.15%技能能量，每次施放最多7枚。被冻结的战斗人员与冰影水晶接触时每0.15秒受到300冰影超能伤害，几乎立即碎裂。所有冰影伤害（轻攻击与直击伤害除外）对被冻结的战斗人员提高310%，计为超能伤害并显示为黄色数字。轻攻击｜消耗7.45%超能能量。向前跃出，造成1838 [210]直击伤害并强力击退。命中附着延迟冰影爆炸物，1秒后最多造成897 [?]爆炸伤害并施加100? [?]层减速，8米内衰减至20%。直击伤害非致命。重击｜消耗7.45%超能能量。猛击地面，造成73 [50]伤害并冻结9米范围，同时生成3道冰影水晶波形，每道由小型、中型与大型水晶组成。前方约45°锥形内的战斗人员最多受到579 [?]伤害，8米内衰减至0%。水晶最多造成158 [?]冰影超能伤害，可随100以上的超能属性与其它超能伤害提升缩放。
中文E：风暴怒吼｜消耗15%超能能量，每次施放最多5次。行为与伤害同普通星相，但视为超能近战伤害。冰川震击对被冻结战斗人员的310%提高，与咆哮固有的对被冻结非首领战斗人员的1.5倍伤害相乘。风暴怒吼伤害还可以随100以上的超能属性、超能近战伤害增益（护甲匠、护盾粉碎、没有B计划）与超能伤害增益（合成感受器）缩放，这些增益彼此相乘，其中没有B计划与护甲匠／护盾粉碎相加。合成感受器增益期间，风暴怒吼对被冻结战斗人员会失去泰坦固有的1.2倍近战伤害，只提供+25%而非预期的50%。
字段：E.by=[1563930741]，实际HTML完整展示；数值T2、556秒。结果：ST-A08；E“same base damage”中文仅“伤害同”省略base限定，容易误解最终伤害也相同，宜保留基础伤害。其余加乘、例外及未知字段完整。

**R52 Cryoclasm → I/2031919265.D 寒冰断破；S/3255519215同**
原文：Sliding into Stasis Crystals and Frozen Enemies shatters on contact. Passively increases Slide Distance from6.5 meters to11 meters. Incurs a2 second cooldown after an extended slide. Sliding launches a Stasis wave that deals18 [?] Damage, shatters Stasis Crystals and Frozen Enemies.
中文：滑铲撞进冰影水晶与被冻结的战斗人员时，接触即碎裂。被动把滑铲距离从6.5米提高到11米，延长滑铲后有2秒冷却。滑铲会发射一道冰影波形，造成18 [?]伤害并碎裂冰影水晶与被冻结的战斗人员。
数值：本站3槽，DDC空。结果：完整。

**R53 Diamond Lance → I/3866705246.D 钻石长矛；S/3356473147漂移**
原文：Creates a Stasis Lance upon scoring1 [3] Stasis Weapon Kills, a Stasis Ability Kill, or a Shatter Kill. Stasis Lance is a single-use weapon that can be picked up while it is within3 meters and can held for up to10 seconds. Remains for up to25 seconds on the ground. [Fire] throws the Stasis Lance, freezing enemies within5 metres of the impact, shattering crystals on direct impact, and dealing136 [45] damage. [Melee] slams the Stasis Lance, freezing enemies within8 [6.75?] metres, dealing up to180 [90] damage, and bestowing the user and their allies within? meters x2 Frost Armor. Diamond Lances instantly shatter Stasis Crystals upon damaging them. Diamond Lance Damage is considered Generic Stasis Ability Damage. Not Grenade nor Melee Damage. Incurs a7 [17] second cooldown after spawning a Stasis Lance before another can be spawned.
中文I：1 [3]次冰影武器击杀、一次冰影技能击杀，或一次碎裂击杀后：生成一支冰影长矛。长矛是一次性武器，3米内可拾取，最多持有10秒，在地面上最多停留25秒。［开火］投出长矛｜冻结接触点5米内的战斗人员，直接接触时碎裂水晶，并造成136 [45]伤害。［近战］猛击｜冻结8 [6.75?]米内的战斗人员，最多造成180 [90]伤害，并为自己与?米内的盟友提供2层冰霜护甲。钻石长矛伤害到冰影水晶时立即碎裂它们；其伤害视为普通冰影技能伤害，既非手雷也非近战。生成长矛后有7 [17]秒冷却，之后才能再生成一支。
中文S全文：1 [3]次冰影武器击杀、一次技能击杀，或一次碎裂击杀时：生成一支冰影长矛。重击灌注的非充能近战击杀守护者不会生成。长矛是一次性武器，3米内可拾取，最多持有10秒，在地面上最多停留25秒。［开火］投出长矛｜冻结接触点5米内的战斗人员，直接接触时碎裂水晶，并造成150 [45]伤害。［近战］猛击｜冻结8 [6.75?]米内的战斗人员，最多造成200 [90]伤害，并为自己与?米内的盟友提供2层冰霜护甲。钻石长矛伤害视为普通冰影技能伤害，既非手雷也非近战。生成后有7 [17]秒冷却。
数值：本站3槽，DDC空。结果：I数值完整；ST-A13/B02。

**R54 Howl of the Storm → I/1563930741.D 风暴怒吼；S/3083226865同**
原文：Grants an additional Melee Ability Charge. Howl of the Storm deals1.5x Damage against Frozen Non-Boss Enemies. Does not apply the1.5x if Wormgod's Burning Fists is active. While Sliding: [Melee Ability] performs an uppercut, dealing146 [?] Melee Damage, freezing [Slow x? for? seconds] enemies within? meters, and creating multiple Stasis Crystals. Creates2 Small,4 Medium,and2 Large Crystal in a V formation ahead of the user. Uppercut damage scales with Melee Stat and Melee Damage Buffs. Unable to use during slide if user shoots. Howl of the Storm's Stasis Crystals deal158 [?] Powered Stasis Melee Damage, down to45% damage over8 meters. Howl's Crystal Damage counts as Powered Stasis Melee Damage and scale normally with Melee Damage Buffs. DOES NOT SCALE WITH100+ MELEE STAT. Howl of the Storm during Glacial Quake is complicated and is explained thoroughly in the Glacial Quake Super section.
中文：额外提供一次近战技能充能。对被冻结的非首领战斗人员造成1.5倍伤害（若尼芙神燃烧之拳激活则不适用）。滑铲时按［近战技能］：打出上勾拳，造成146 [?]近战伤害，冻结?米内的战斗人员[ PvP改为减速 ]，并在使用者前方呈V形生成2块小型、4块中型与2块大型冰影水晶。上勾拳伤害随近战属性与近战伤害增益缩放。开火状态下无法在滑铲期间使用。这些水晶造成158 [?]充能冰影近战伤害，8米内衰减至45%；伤害计为充能冰影近战伤害，正常随近战伤害增益缩放，但不随100以上的近战属性缩放。冰川震击期间的风暴怒吼另有一套缩放，详见冰川震击一条。
数值：本站2槽，DDC空。结果：ST-A09/D01；uppercut与crystal不同属性缩放边界完整，不错误合并。

**R55 Tectonic Harvest → I/2031919264.D 构造收割；S/2847573064同**
原文：Picking up Small Stasis Shards restores10 HP and grants x1 Frost Armor. Picking up Large Stasis Shards restore? HP and grant x3 Frost Armor. While Frost Armor is active: Kinetic and Stasis Weapon Kills progress a counter that, upon reaching100%, cause the kill to trigger a Stasis Shatter. Each Frost Armor stack increases the amount of progress gained per kill. Taking damage grants?% Melee Ability Energy, up to once a second?. Crucible-Only: Incurs a10 second cooldown upon creating6 Shards within? seconds of the first shard?, preventing additional Stasis Shard creation from Harvest Aspects for10 seconds. Shard creation count and cooldown is shared for the entire fireteam.
中文：拾取冰影碎片：小型恢复10生命值并提供1层冰霜护甲；大型恢复?生命值并提供3层。冰霜护甲激活期间：动能与冰影武器击杀推进计数，满100%时该次击杀触发冰影碎裂。护甲层数越高，每次击杀推进得越多。受到伤害提供?%近战技能能量，每秒最多一次?。仅限熔炉竞技场：?秒内生成6份破碎后进入10秒冷却，期间收割类星相不再生成冰影碎片；计数与冷却在整个火力小队内共享。
数值：本站2槽，DDC空。结果：ST-A01/A14/C01；回能类型近战正确。

### 术士（6）

**R58 Penumbral Blast → I/2543177538.D 半影冲击**
原文：Sends forth a freezing projectile that automatically detonates after traveling22 metres. Projectile detonates on impact, dealing up240 [30] damage and freezing enemies within2.7 [2] metres on detonation. Base Cooldown146.3 seconds; Chunk Scalar0.8x.
中文：发出一颗飞行22米后自动引爆的冻结弹体。弹体接触时引爆，最多造成240 [30]伤害，并冻结引爆点2.7 [2]米内的战斗人员。
数值：146.3秒、0.8×。结果：完整。

**R60 Winter's Wrath → I/3683904166.D 严冬之怒**
原文：General Super Information. Damage Resistance90% [51%]. Base Duration24.5 seconds, or4.08% Super Drain per Second. Glide becomes a variant of Strafe Glide with unlimited duration. Light Attack | Drains4.5% Super Energy per twin-shards. Casts two freezing homing twin-shards, one after another. Each projectile deals11 impact damage and up to50 [33] splash damage over? meters to unfrozen enemies. Frozen enemies receive90% decreased damage. Heavy Attack | Does not drain Super Energy. Casts a shockwave that deals45 [? and Non-Lethal] damage and heavily staggers enemies within30 metres. Shockwave travels45 meters per second. Stasis Crystals and Frozen Enemies hit by the shockwave are shattered, dealing3,453 [?] Shatter Damage. Combatants are dealt an additional damage instance of361 damage, totalling3814 Damage. Tier2 Super; Base Cooldown556 seconds.
中文：伤害抗性90% [51%]。基础持续24.5秒，或每秒消耗4.08%超能能量。滑翔变为无时长限制的专注滑翔。轻攻击｜每次双重破碎消耗4.5%超能能量。一前一后释放两颗冻结追踪弹，每颗造成11直击伤害，并在?米内造成最多50 [33]溅射伤害。对已被冻结的战斗人员伤害降低90%。重击｜不消耗超能能量。释放一道以45米/秒传播的冲击波，造成45 [?｜非致命]伤害并使30米内的战斗人员强力踉跄。被冲击波扫到的冰影水晶与被冻结的战斗人员直接碎裂，造成3453 [?]碎裂伤害；战斗人员再额外吃一次361伤害，合计3814。
数值：T2、556秒。结果：ST-A10/A11/A13；Strafe Glide=专注滑翔已额外查I/5333292官方中英名，不是误译，不列差异。PvP非致命仅在方括号，不能外推PvE。

**R62 Bleak Watcher → I/2642597904.D 凄凉观察者；S/1394191455漂移**
原文：Grenade Base Cooldown and Chunk Scalar is set to Glacier Grenade's while this Aspect is equipped. Hold [Grenade] to convert the Grenade Ability into a Stasis Turret. Stasis Turret: Automatically shoots a burst of5 seeking projectiles over0.7 seconds every2 seconds at enemies within35 metres, inflicting x20 [x10] Slow for4.5+4.5 [2+1.75] seconds per hit. Lasts for25+5 seconds, has150 Construct HP, and67% Damage Resist until it has fired. Bleak Watcher damage counts as Stasis Grenade Ability Damage.
中文I：装备时，手雷基础冷却与回复倍率变为冰川手雷的数值。按住［手雷］把手雷技能转成冰影炮塔：炮塔每2秒向35米内的战斗人员自动发射一轮5发追踪弹体（持续0.7秒），每次命中施加20 [10]层减速，持续4.5+4.5 [2+1.75]秒。炮塔持续25+5秒，拥有150构造体生命值，开火前获得67%伤害抗性。凄凉观察者伤害计为冰影手雷技能伤害。
中文S全文：装备时手雷冷却覆盖为159.6秒，回复倍率继承当前装备的手雷。按住［手雷］把手雷技能转成冰影炮塔：炮塔每2秒向35米内的战斗人员自动发射一轮5发追踪弹体（持续0.7秒），每次命中施加20 [10]层减速，持续4.5 [2]秒。炮塔持续25秒，拥有150构造体生命值，开火前获得67%伤害抗性。凄凉观察者伤害计为冰影手雷技能伤害。
数值：本站2槽，DDC空。结果：基础I完整，ST-B03/A12。

**R63 Frostpulse → I/668903197.D 冰霜脉冲；S/1634913408同**
原文：Grants11% Class Ability Energy upon freezing an enemy. On Class Ability Cast: Freezes enemies within8.5 [5] metres. Grants+2.5 Meters Melee Lunge Distance for1.2 seconds. Freezing an enemy with Frostpulse grants x5 Frost Armor. [Guardians within5-8 meters are inflicted with x50 Slow for?+? seconds instead.]
中文：冻结一名战斗人员提供11%职业技能能量。施放职业技能：冻结8.5 [5]米内的战斗人员，并提供+2.5米近战突进距离，持续1.2秒。（PvP中5–8米内的守护者改为受到50层减速，持续?+?秒。）用冰霜脉冲冻结一名战斗人员提供5层冰霜护甲。
数值：本站3槽，DDC空。结果：正文机制与数字全部覆盖，但PvP替代句普通括号无pvp class，ST-A13同类呈现风险。

**R64 Glacial Harvest → I/2651551055.D 冰川收获；S/2672933291同**
原文：Picking up Small Stasis Shards restores10 HP and grants x1 Frost Armor. Picking up Large Stasis Shards restore? HP and grant x3 Frost Armor. While Frost Armor is active: Kinetic and Stasis Weapon Kills has a chance to cause the kill to trigger a Stasis Shatter. Each Frost Armor stack increases the odds of it triggering. x1=10?% |x2=15?% |x3=?% |x4=?% |x5=50?% |x6=85?% |x7=100%. Taking damage grants?% Grenade Ability Energy, up to once a second?. Crucible-Only: Incurs a10 second cooldown upon creating6 Shards within? seconds of the first shard?, preventing additional Stasis Shard creation from Harvest Aspects for10 seconds. Shard creation count and cooldown is shared for the entire fireteam.
中文：拾取冰影碎片：小型恢复10生命值并提供1层冰霜护甲；大型恢复?生命值并提供3层。冰霜护甲激活期间：动能与冰影武器击杀有几率让该次击杀触发冰影碎裂，几率随护甲层数提高。1层10?%｜2层15?%｜3层?%｜4层?%｜5层50?%｜6层85?%｜7层100%。受到伤害提供?%手雷技能能量，每秒最多一次?。仅限熔炉竞技场：?秒内生成6份破碎后进入10秒冷却，期间收割类星相不再生成冰影碎片；计数与冷却在整个火力小队内共享。
数值：本站2槽，DDC空。结果：ST-A01/A14/C01；没有错误把术士概率写成猎人/泰坦累计进度，也没有把疑问概率转成确定数字。

**R65 Iceflare Bolts → I/668903196.D 冰焰飞弹；S/1603488897同机制、名称错位**
原文：Shattering a Frozen Enemy creates a seeker, targeting the closest enemy up to12 metres away. Seeker detonates upon reaching an enemy or expiring, freezing enemies within3 [1.75] meters. Incurs an8 second cooldown after creating7 [1] seekers.
中文：碎裂一名被冻结的战斗人员：生成一枚追踪器，瞄准12米内最近的战斗人员。追踪器到达战斗人员或到期时引爆，冻结3 [1.75]米内的战斗人员。生成7 [1]枚追踪器后有8秒冷却。
数值：本站2槽，DDC空。结果：基础正文完整，ST-A13/B04。

## 数字/冷却/槽位来源矩阵补充

### 星相槽位

全部I记录investmentStats中statTypeHash2223994109；实际HTML用相应数量<i>展示，索引desc纯文本只显示“碎片槽”，因此不能用索引文本未出现2/3判断HTML丢槽。

|DDC条目|hash|本站/manifest槽位|指定DDC快照|
|---|---|---:|---|
|Grim Harvest|1920417385|2|空格，未能对DDC数字核验|
|Shatterdive|2934767476|3|空格|
|Touch of Winter|4184589900|2|空格|
|Winter's Shroud|2934767477|3|空格|
|Cryoclasm|2031919265|3|空格|
|Diamond Lance|3866705246|3|空格|
|Howl of the Storm|1563930741|2|空格|
|Tectonic Harvest|2031919264|2|空格|
|Bleak Watcher|2642597904|2|空格|
|Frostpulse|668903197|3|空格|
|Glacial Harvest|2651551055|2|空格|
|Iceflare Bolts|668903196|2|空格|

### 全技能冷却/回复倍率

|hash|DDC冷却秒|实际页|DDC scalar|实际页|结论|
|---|---:|---:|---|---|---|
|1399219|175.6|175.6|0.625×|0.625×|相同|
|1399216|131.7|131.7|0.875×|0.875×|相同|
|1399217|175.6|175.6|0.625×|0.625×|相同|
|1399218|105|105|0.?×|无|ST-A06|
|1341767667|145.2|145.2|0.8×|0.8×|相同|
|2028772231|146.3|146.3|0.7×|0.7×|相同|
|2543177538|146.3|146.3|0.8×|0.8×|相同|
|2625980631|455/T4|455/T4|无|无|相同|
|2021620139|556/T2|556/T2|无|无|相同|
|3683904166|556/T2|556/T2|无|无|相同|

内部冷却全覆盖：Bonds10；Chill5?；Impetus5 buff duration；Torment1；三个Harvest10/6shards/?first-window共享PvP；Shatterdive4；Shroud base regen3与DR4?；Cryoclasm2且Quake期间无CD；Diamond7[17]；Iceflare8 after7[1]。没有把持续时间全部自动当冷却，Impetus是源明确绑定。

### 28份效果副本完整映射

除了列明漂移，其余副本的当前实际中文与上面相应I.D一致，读的是完整索引desc而非仅比数字集合：
Bonds S1445819510；Chains3927793534；Chill3229952126；Conduction279392737；Durance990621329；Fissures314678700；Fractures3927793532；Hedrons3458792659；Hunger279392739；Impetus3927793533；Refraction3852198730；Rending279392736；Reversal3257649895；Rime279392738；Shards2120864665；Torment3927793535；Grim3595066605；Shatterdive2778151823；Touch181665053；Shroud2796898066（ST-B01）；Cryoclasm3255519215；Diamond3356473147（ST-B02）；Howl3083226865；Tectonic2847573064；Bleak1394191455（ST-B03）；Frostpulse1634913408；Glacial2672933291；Iceflare1603488897（ST-B04）。这些副本在索引被kind标为“异域词条”，虽本体是碎片/星相词条，不应据kind推断它们都是Exotic。

## 交付统计与核对结论

- 全部44基础条目和6增强字段已给出原文、实际中文、namespace/hash/字段及结果；16属性、12槽位、10技能冷却逐项覆盖。
- 差异分类编号：A01–A14共14个正文/呈现主题，B01–B04共4个索引副本/身份主题，C01–C06共6个原表疑点主题，D01–D03共3个范围/来源边界主题。矩阵还独立指出generally158、E基础伤害限定、Shroud抗性给予对象措辞、Frostpulse PvP着色；父报告不要只抄编号清单而漏这些矩阵观察。
- 不把?HP当第二个已知值；不将DDC旧灰色hexagon与当前heptagon机械当成两种都有效形状；不将Squall6秒解释成已确认风暴寿命；不根据霜甲算术替源修抗性；不将所有enemy缩成PvE-only。
- 当前增强正文全部实际HTML存在，索引enhanced条目无desc是索引数据形状，不是HTML遗漏；组合增强标题把三个Harvest并列，源是or语义，不应让读者误以为需同时装三种职业星相。
- 本轮没有修复分支新发现。父代理统一构建验证之后若需确认最终修复页，应以新产出重新比较；本报告记录的是构建前现状，不宣称最终产物已验证。


[Showing lines 1-122 and 272-381 of 381; 149 middle lines (21.0KB) elided. Read artifact://382 for full output]

# 附件：缚丝


## 范围与证据约定

唯一 DDC 对照源：[Strand Subclasses，gid=1870531554](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1870531554)，使用 data/ddc/1870531554.json 全部非空正文和相关原始 inline HTML。本站对照为本轮读取到的生成索引、实际 HTML，以及目标记录。未构建，所以这是当前盘上产出审计，不承诺最终修复后产出。全部英文名称以 inventory/traits 的 i18n.en.name 对照；两个 minted 机制按英文原表条目与中文正文映射。

字段简写：R=i18n.zh-CN.realgame_details；E=enhanced[].realgame_details；C=site_cooldownSeconds；M=site_recoveryMultiplier；T=site_superTier；S=investmentStats。除 trait:/minted: 特别注明，hash 均属于 inventory-items.json。矩阵中文为当前实际文本摘录/完整机制摘要，不是拟议修复文案。方括号数值按原表 inline 颜色识别 PvP，不按括号形状猜。

覆盖：8 效果+14 碎片+4 手雷+3 近战+3 超能+12 星相=44 主体；另外 4 个心纺手雷增强+1 个诱捕猛击超能增强=5 子行。全部主体均已映射，无未映射主体。属性变化14/14、基础冷却10/10 已逐项核对。12 个槽位图示已读当前 HTML，但 DDC 快照的对应槽位单元格缺失，不能判定12/12与DDC一致。没有引用独立 ability-cooldown 页数表，因此未把不同来源冷却数表报成此页错误。未发现此页正文的暴击伤害乘数条目；precision hits 是精准命中触发条件，不应伪装成暴伤公式。

## 全覆盖矩阵：效果

1. **Tangle / 缠结 — trait:1577394840 / R**。原句 “While a Strand Ability is equipped”; “Killing an enemy affected by a Strand Debuff (Sever, Suspend, Unravel)”; “? HP”; “20 seconds”; “within 5 meters”; “held for up to 20 seconds”; “12 second cooldown ... barring exceptions”; “346 [100] ... 8 metre radius”; “Either method counts as an Elemental Interaction”; “fully refunds Grenade Energy”。本站：装备缚丝技能，击杀受割裂/悬停/瓦解影响的战斗人员生成缠结；? HP、存在/持有20秒、拾取5米、12秒冷却、346 [100]/8米、两种引爆计元素交互、抓钩全返还手雷能量。数值/交互一致；缺少“除特殊例外”且 enemy 被写为战斗人员，见 STR-01/12。
2. **Grapple Tangle / 抓钩缠结 — minted:4294967320 / R**。原句 “exclusively interacts with Grapple”; “Lasts for up to 20 seconds”; “refreshed by 5 seconds”; “Cannot be destroyed, nor picked up”; “within 27 meters (32m ... equipped) for 0.3 seconds”; “Non-Offensive Grapple”; “Prismatic Warlocks need to equip Arcane Needle”; “5 consecutive times ... refresh to 1 second”。本站对应全部条件、20秒/5秒/27米/32米/0.3秒/连续5次后1秒均存在，未见差异。原句 refreshed by 的用词本身不足以证明加算或重置，本站也未额外推导。
3. **Threadling / 线虫 — trait:2724747993 / R**。原句 “chase enemies within 20? metres”; “within ? metres”; “up to 366 [35]”; “lose their target ... another combatant”; “lose that inheritance if they perch”; “travelling 14 metres”; “maximum of 5”; “weapon damage or ... Powered Melee Hit”; “0.5 second cooldown”; “Instantly killing ... won't release”; “track at any range”。本站对应20?/ ?米、最大366 [35]、丢失目标另寻、停栖丢失来源继承、14米/5只、武器伤害/充能近战命中释放、0.5秒、瞬杀不放、无限距离全部存在。追踪原句 enemies 被缩为战斗人员，见STR-12；另寻目标处原句确为 combatant，不应全局盲改。
4. **Woven Mail / 织造铠甲 — trait:3173573497 / R**。原句 “45% [25%] ... 10 seconds”; “Precision Hits and Melee Attacks from Guardians bypass”; “removed upon casting any Super Ability”。本站45% [25%]/10秒、来自守护者的精准/近战绕过、任意超能移除，机制一致。
5. **Sever / 割裂 — trait:2519102437 / R**。原句 “enemy's outgoing damage ... 40% [15%] for 10<small>+5</small> [5<small>+2.5</small>] seconds”。本站“战斗人员造成的伤害降低40% [15%]，持续10+5 [5+2.5]秒”。数值一致，但延长小字被铺平，且 enemy 被缩窄，见STR-02/12。
6. **Suspend / 悬停 — trait:2679722414 / R**。原句 combatants unable to move/shoot/use abilities；Rank-and-File/Elite “6<small>+2</small>”、Miniboss “3<small>+1</small>”；Boss unimpeded、1秒、300 Strand Damage、仍带debuff；Guardians hover/hipfire/third-person “2<small>+1</small>”；Unstoppable stunned。本站全部机制和数值存在，无 Boss 控制免疫或守护者可腰射遗漏；但延长数字无小字身份，见STR-02。
7. **Unravel / 瓦解 — trait:945613349 / R**。原句 “3 seeking threads ... ? metres 0.25 seconds after receiving 40 damage”; “26 [4]”; “1.2 second cooldown”; “refresh ... original duration”; “9 second ... reapply ... 9”。本站3条、?米、40伤害后0.25秒、26 [4]、1.2秒、原时长/9秒示例齐全；enemy 范围见STR-12。
8. **Unraveling Rounds / 瓦解弹药 — minted:4294967321 / R**。原句 “Strand Weapons inflict Unravel upon dealing damage”。本站“缚丝武器造成伤害时施加瓦解”，一致。此 DDC glossary 没写屏障勇士破盾；不能据 manifest 官方描述额外报此 DDC 原句缺失。

## 全覆盖矩阵：碎片

全部14个当前 S 包含碎片消耗1；DDC本页碎片表仅给 Stat Changes，没有提供此消耗列，因此消耗1属 manifest 信息，不是已对照DDC确认值。

9. **Ascent / 上升丝线 — 4208512216 / R,S**。原句 “On Grenade Ability Usage: Refills readied weapon”; “+40? Handling, +40 Reload Speed, 0.925x ... +30 Airborne ... 15 seconds”; “4 second cooldown ... Ammo Refills”; “+10 Weapons”。本站“补满已准备的武器”，+40?操控/+40填装/×0.925/+30空效15秒/补弹4秒、武器+10；全部匹配，readied及未知被保留。
10. **Binding / 束缚丝线 — 3192552688 / R,S**。原句 “Super Kills ... Suspending Burst”; “108 [?] ... within 6 meters”; “+10 Health”。本站超能击杀触发108 [?]/6米悬停爆裂、生命值+10，数值/属性一致；enemy范围见STR-12。
11. **Continuity / 持续丝线 — 3192552690 / R,S**。原句 “normally last 50% longer”; “shown in smaller text next to the regular duration”; Stat “-”。本站“通常延长50%”“会在常规时长旁用小字标出增量”、无属性变动；文字一致，实际HTML不兑现小字承诺，见STR-02。
12. **Evolution / 进化丝线 — 4208512211 / R,S**。原句 “30?% faster, travel further”; “33% against Combatants | 12.5% against Guardians”; “+10 Super”。本站30?%/更远/战斗人员+33%、守护者+12.5%、超能+10，全部一致。
13. **Finality / 终局丝线 — 4208512217 / R,S**。原句 “Finishers create Threadlings”; “Rank-And-File=1 | Elite=2 | Miniboss=3”; “+10 Class”。本站终结技、红血1/橙血2/初级首领3、职业+10，全部一致。
14. **Fury / 狂怒丝线 — 4208512219 / R,S**。原句 “per damage instance”; T1 10/T2 18/T3 20/T4 30/Guardians25%；“1? second cooldown”; “-10 Melee”。本站每次伤害实例和全部回能、近战-10一致；“约有1秒”弱化未知状态，见STR-03。
15. **Generation / 生成丝线 — 3192552691 / R,S**。原句 “variable amount”; “Does not grant Slicewire Grenade Energy”; “source ... amount of damage”; “Generally ... more damage ... more Ability Energy”; “-10 Grenade”。本站完整包含来源/伤害量/通常伤害高回能多/切线不回能、手雷-10；主体一致。重复perk行少切线例外，见STR-14。
16. **Isolation / 孤立丝线 — 3192552689 / R,S**。原句 “within 2 seconds of each”; ?米 Severing Burst；4秒冷却/期间不计；“exclusively Weapon Archetype based”；Slug50、Bow/Sniper34、HC/Scout25、Sidearm20、AR15、MG/Pulse12、Trace/SMG10%；Stat“-”。本站全部计数和冷却齐全，但“2秒内连续取得多次”改变滚动计时，见STR-04；enemy范围见STR-12。
17. **Mind / 思维丝线 — 4208512218 / R,S**。原句 killing suspended enemies；T1 10/T2 12/T3 15/T4 30/Guardians15%；“1? second cooldown”; Stat“-”。本站全部回能一致；“约有1秒”未知问题见STR-03，enemy范围见STR-12。
18. **Propagation / 增殖丝线 — 4208512210 / R,S**。原句 “Powered Melee Ability Kill”; “Unraveling Rounds ... 8 [5] seconds”; “+10 Melee”。本站充能近战技能击杀、缚丝武器瓦解子弹8 [5]秒、近战+10；机制数值一致。
19. **Rebirth / 重生丝线 — 4208512220 / R,S**。原句 counter100%；Rank-and-File34%(1)、Elite67%(2)、Miniboss/Boss100%(3)、Guardians67%(2)；Stat“-”。本站全部计数/数量一致。
20. **Transmutation / 蜕变丝线 — 4208512221 / R,S**。原句 “While Woven Mail is active: Weapon Kills spawn a Tangle”; “+10 Melee”。本站织造铠甲期间武器击杀生缠结、近战+10，一致。
21. **Warding / 守护丝线 — 4208512222 / R,S**。原句 orb pickup、Woven Mail5秒、“-10 Health”。本站能量球拾取/5秒/生命值-10，一致。
22. **Wisdom / 智慧丝线 — 4208512223 / R,S**。原句 suspended enemies killed、Orb2.5% Super、生成后10秒；Stat“-”。本站全部值和冷却触发一致；enemy范围见STR-12。

## 全覆盖矩阵：手雷与增强

23. **Grapple / 抓钩 — 2470512752 / R,C,M**。原句 “Hooks up to 22 metres away”; impact38 [?]/stagger/attach；取消1秒内回50%；缠结抓钩全回充能、Returned4秒可立即再用、Kickstart不生效；近战速度条件及?秒、432 [61]直击+最多432 [61]/4?米径向、Unravel/推开、守护者突进禁0.5秒；同时计手雷/近战；Ashes to Assets减少50%；空中禁被动恢复、Silkstrike同样。本站除“钩住22米外的目标”误译最大距离外，全部机制齐全；C107.9/M0.875匹配。见STR-05/12。
24. **Shackle Grenade / 束缚手雷 — 2809342386 / R,C,M**。原句 “Bola Trajectory”; “explosion on impact ... 190 [?] ... ? metre radius”; direct2小球、surface3；小球81 [?]/命中悬停。本站捕缚球弹道/190/未知半径/2或3/81齐全，但“受到伤害时释放爆炸”误译 on impact。C219.5/M0.5一致。见STR-06/12。
25. **Slicewire / 切线手雷 — 1377143502 / R,C,M**。原句 “Medium? Trajectory”；弹跳、接触后爆炸、4次/6米、割裂10<small>+5</small>；Maximum Damage178/178/222/267各[?]，first hit any enemy额外307 [?]。本站所有伤害及最大值标签存在，C219.5/M0.5一致；但“中型弹道”丢?，10+5铺平，enemy范围见STR-02/07/12。
26. **Threadling Grenade / 线虫手雷 — 4228170798 / R,C,M**。原句 Medium Trajectory；空中3弹体、每发接触生1线虫。本站一致，C175.6/M0.625一致。
E1. **Grapple + Mindspun — 2470512752 / E[by262821318]**。原句 “Grapple Melee creates 3 Threadlings on hit”。本站HTML“抓钩近战命中时生成3只线虫”，一致。
E2. **Shackle + Mindspun — 2809342386 / E[by262821318]**。增强行原句 Weaver's Trance25秒、kills造成Suspending explosion108 [?]/6米/Strand Grenade Ability Damage；星相总行另明确 “Hold [Grenade] to consume a Grenade Charge”。本站有25秒/108 [?]/6米/手雷归属，但无按住/消耗手雷充能输入条件。见STR-08。
E3. **Slicewire + Mindspun — 1377143502 / E[by262821318]**。增强行原句 fourth explosion、4 submunition/X、最多64 [?]、生Tangle/忽略冷却；星相总行 “Hold [Grenade] to overcharge it”。本站效果全匹配，但缺按住过充输入。见STR-08。
E4. **Threadling + Mindspun — 4228170798 / E[by262821318]**。原句 “Hold [Grenade] to prepare a Nest Grenade”; impact Teeming Nest；300 ConstructHP/17.5秒、满血1.5秒后每秒6.7%(-20)HP、部署3虫/随后每5秒1虫。本站全部主体值/条件匹配，只省略原表显式“-20”HP数值，见STR-09；不能自行把6.7%×300的算数当原表校验，也不能凭它改17.5秒。

## 全覆盖矩阵：猎人

27. **Threaded Spike / 线织尖刺 — 1680616210 / R,C,M**。原句 bounce on hits/surfaces、up to9 enemies “within ? metres of each”、427 [82]、Sever?+?、首跳-18%/之后-42.5%；回能表0:5/20、1:10/30、2:20/50、3:30/70、4:35/85、5+:40/100；接取输入；Strand-exclusive接住后每杀2秒WovenMail最多10秒。本站全部值、输入、专属条件匹配；“最多飞向?米内的9名”没明确每一跳的邻近范围，见STR-10/12。C145.2/M0.8一致。
28. **Silkstrike / 丝线打击 — 2463983862 / R,C,T**。原句DR90 [45]、基础24.5秒/每秒4%；light耗4、1638 [260]、kill explosion最多1293 [?]/?米；heavy耗9、360°、蓝色[504]/粉色[80]/?米/两击；grenade不耗超能、grounded立刻恢复；class耗4.5/ArcStaff闪避。本站全部数值存在，C556/T2一致；“扎根后”误译 grounded，蓝色504去括号为合理模式归一，不能当PvP值。见STR-11/12。
E5. **Silkstrike + Ensnaring Slam — 2463983862 / E[by4249729126]**。原句 “repeated usage ... while ... Aspect ... equipped ... 4.5% Super Energy”。本站实际HTML增强子行“装备星相诱捕猛击时可以反复使用它，每次代价4.5%超能能量”，一致，不应因主索引没有desc误报正文遗漏。
29. **Ensnaring Slam / 诱捕猛击 — 4249729126 / R,S**。原句AirMove/class能量、61 [11]/8 [6.5]米/Suspend、职业效果+Specter、每敌4秒Mail最多20。本站齐全；enemy范围STR-12。本站槽2，DDC槽位未可核对。
30. **Threaded Specter / 线织幽灵 — 4249729125 / R,S**。原句class触发、175 ConstructHP/12秒、Combatants诱敌/DR70%、盟友/施法者技能武器+150%、hostile及无on-kill、失血或enemy ?米触爆、最多600 [60 Guardians |121 Objects]/?米、靠近触发2虫、装备回复0.6×。本站齐全；构造体标签省略为HP不改变本项数值，enemy范围STR-12。本站槽3。重复perk描述有额外特技闪身例外，见STR-14。
31. **Whirling Maelstrom / 回旋漩涡 — 4249729124 / R,S**。原句普通Tangle摧毁、追踪?米/加速最大6m/s、算GrappleTangle、? ConstructHP/12秒、29 [?]/每0.1秒/2?米、kill Unraveling projectiles、kills算Tangle但hits不算Tangle/Ability。本站全部存在；enemy范围STR-12。本站槽2。
32. **Widow's Silk / 寡妇之丝 — 4249729127 / R,S**。原句额外grenade充能、Grapple创建GrappleTangle、enemy/ally附着不建、近战命中创建、初始瞄准缠结免费不建。本站完整；enemy范围STR-12。本站槽3。

## 全覆盖矩阵：泰坦

33. **Frenzied Blade / 狂暴利刃 — 4094417246 / R,C,M**。原句3充能、0/1/2=1.15/1.55/1.95×、Prismatic额外0.7×、dash?米/569 [105]/Sever。本站一致；enemy范围STR-12。C159.6/M0.7一致。
34. **Bladefury / 剑刃之怒 — 3574662354 / R,C,T**。原句DR90 [50]、24秒/4.167%每秒、结束3近战；light耗3/851 [210]/无限chain、Suspended +25%、3次每秒、“after chaining 3 sustained light attacks”攻速+100%、heavy或断chain清除；heavy耗10.5/3秒CD、143×2 [61]直击/最多608×2 [36]溅射/?米、light hits/受伤各减1秒。本站全部数值一致，但“连续命中3次”把加速触发改为命中要求，见STR-13。enemy范围STR-12。C556/T2一致。不要自行把原表PvP [61]/[36]乘2，原句没有此标注。
35. **Banner of War / 战争旗帜 — 988980154 / R,S**。原句Sword/Melee/GlaiveMelee/SuperLightKill/Finisher、15秒/10米、max4层30秒；下一段又max24秒；“7 [2] enemies that either die within 20 meters, are killed by the user, or by allies within 20 metres”；文字延长+5、二层后每层-1至+3，表格x1+6/x2+5/x3+4/x4+3；脉冲20HP/2.5/2/1.5/1秒；近战100% [Varies]、Bladefury40%、Sword20%；粉色PvP每层?%表。本站保留全部攻击增益及表格数值、15/24/30，但未标原表矛盾；层数来源仅写20米死亡，漏两个OR分支；PvP未知每层表省略且“随层数而变”被置unsure而非PvP。见STR-15。本站槽2。
36. **Drengr's Lash / 勇士之鞭 — 988980152 / R,S**。原句击杀elementally-debuffed enemies回?%职业能量；class触发、30米、61 [31]/Suspend。本站主体一致；enemy范围STR-12。槽3。重复perk显示10%/60 [30]/推进器额外行为，见STR-14。
37. **Flechette Storm / 镖弹风暴 — 988980155 / R,S**。原句滑铲Melee输入、跳跃耗50%、?米knockback/135 [66]、射击不能发动；空中前置近战后耗50%、4弹171 [25.2]/?米、可连投、动画期间非近战DR25%。本站完整；enemy范围STR-12。槽2。
38. **Into the Fray / 投身激战 — 988980153 / R,S**。原句摧毁Tangle3脉冲、2秒/15HP/Mail/10?米自己盟友；SuperCast给?米盟友Mail；Mail下“300% [200%] Additional Base Melee Regeneration Rate”。本站全部一致，尤其额外基础倍率不能误当总倍率。槽2。

## 全覆盖矩阵：术士

39. **Arcane Needle / 神秘织针 — 2307689415 / R,C,M**。原句3充能、0/1/2=1.16/1.64/2.6×、Prismatic0.7×、追踪505 [68]、Unravel ?<small>+?</small> [7<small>+2.5</small>]。本站值一致；延长身份STR-02。C146/M0.8一致。
40. **Needlestorm / 织针风暴 — 1885339915 / R,C,T**。原句DR?% [53%]；9 tracking弹、每783 [?]嵌入、?秒后成虫、虫368 [?]。本站全部数值/未知存在，但DR写“?”没有百分比单位（STR-16）。C500/T3一致。
41. **Mindspun Invocation / 心纺祷告 — 262821318 / R,S**。原句四手雷总说明含Grapple3虫、Threadling按住投巢、Shackle按住消耗、Slicewire按住过充及各效果。本站“强化...四种手雷，逐条效果见手雷技能”；通过增强子行已承接效果，但Shackle/Slicewire输入条件未承接，STR-08。槽2。
42. **The Wanderer / 羁客 — 262821319 / R,S**。原句爆炸1秒后324 [?]/6米Suspend；投掷Tangle寻敌附着/无重力；ThreadlingKill生成Tangle并冷却-1秒。本站完整；enemy范围STR-12。槽2。
43. **Weaver's Call / 编织者之唤 — 262821317 / R,S**。原句“Threadling damage instances grant 10% Class Ability Energy”；累计700 [?]生停栖虫、2秒CD/最多一次1虫、显示数字/PowerDelta；class生成3/放全部停栖；kill counter100%，Miniboss及以下34/Boss100/Guardians67。本站数值和后续规则齐全，但“线虫命中提供10%”替换伤害实例触发（STR-17）。槽2。
44. **Weavewalk / 编织微步 — 262821312 / R,S**。原句空中+至少1近战充能、AirMove消耗20%；0.5秒1停栖虫、DR90% [90%,60% while carrying Spark]、每秒近战25%、同VoidInvisibility、ArcSoul/TimeSlip/Threadling伤害-50%、不能武器/技能/复活/拾取弹药能量球；退出?米盟友Mail、2秒至20秒/停留?秒最大。本站所有机制值齐全，但花火60%丢PvP模式标签（STR-18）。槽3。

## 差异清单与准确证据

- **STR-01 缠结冷却绝对化**：trait:1577394840.R，“生成后有12秒冷却，冷却结束前无法生成更多”对照Tangle “barring exceptions”。缺例外限定，且会与此页切线心纺忽略冷却的已展示机制冲突。
- **STR-02 持续丝线小字语义在数据/HTML丢失**：traits2519102437、2679722414；inventory1377143502、1680616210、2307689415.R。原表 +5/+2/+1/+2.5/+? 用 small 标出持续丝线增量；本站实际HTML是普通“10+5”“6+2”“3+1”“2+1”“?+?”。3192552690.R却承诺小字，所以用户可能把加号当基础总时长或阶段。不是数值差异，是增强条件呈现缺失。
- **STR-03 未知冷却弱化**：4208512219/4208512218.R 原句“1? second cooldown”；本站“约有1秒冷却”。近似值不等于待确认值，应记录为未知语义不完全保真，而非判定实际1秒错误。
- **STR-04 孤立丝线计时窗口**：3192552689.R，原句“within 2 seconds of each”，本站“2秒内连续取得多次精准命中”。原句是相邻命中间隔条件，中文容易理解为整组必须在2秒内；全部进度表值相同，不能以数字相同掩盖此差异。
- **STR-05 抓钩最大射程误译**：2470512752.R，“Hooks up to22 metres away”→“钩住22米外的目标”。本站把最大22米写为22米之外，明确方向性错误。
- **STR-06 束缚爆炸触发误译**：2809342386.R，“releasing an explosion on impact”→“受到伤害时释放爆炸”。应对照接触/撞击而不是球体被伤害。
- **STR-07 切线轨迹未知丢失**：1377143502.R，“Medium? Trajectory”→“中型弹道”。未知?消失；线虫手雷原句确是Medium无?，不可连带改它。
- **STR-08 心纺输入缺失**：2809342386.E、1377143502.E以及262821318.R；星相原句分别“Hold [Grenade] to consume a Grenade Charge”和“Hold [Grenade] to overcharge it”。本站子行直接“提供织者迷境…”/“第四次爆炸…”没有输入。线虫增强已有按住，抓钩无需按住，不得全局统一新增。
- **STR-09 巢穴显式HP耗值缺失**：4228170798.E 原句“6.7% (-20) HP per second”；本站仅6.7%。这是来源明示值的省略，不靠算术猜测修值；300HP/1.5秒/17.5秒原表自身关系未独立验证。
- **STR-10 尖刺逐跳范围不清**：1680616210.R 原句“up to9 enemies within ? metres of each”；本站“最多飞向?米内的9名战斗人员”。没有交代距离是相邻目标之间，不是起点固定半径。
- **STR-11 grounded 误译**：2463983862.R 原句“instantly recharges once grounded”；本站“扎根后立即充能”。应指落地，不是扎根状态。
- **STR-12 enemy 系统性缩窄**：DDC使用 enemies/enemy 的多处本站写战斗人员，且同条又列守护者/PvP伤害。直接涉及traits1577394840/2724747993/2519102437/945613349；inventory3192552688/3192552689/4208512218/4208512223/2470512752/2809342386/1377143502/1680616210/2463983862/4249729126/4249729125/4249729124/4249729127/4094417246/3574662354/988980154/988980152/988980155/262821319等R或E。例Sever原句“enemy's outgoing damage ... [15%]”，中文“战斗人员造成的伤害... [15%]”把PvP对象口径压窄。需逐句区分原表确实写Combatants的段落，不能全局把Combatants改成敌人，也不能因为本站enemy token名字而忽略中文对象含义。
- **STR-13 剑刃攻速触发增加命中要求**：3574662354.R “after chaining3 sustained light attacks”→“连续命中3次后”。原句是连续轻攻击链，不是3次命中；同段减少重击CD的规则才明确Light Attack Hits。
- **STR-14 索引重复perk正文不同步**：索引perk:3498667665生成丝线无“不提供切线手雷能量”；perk:3569371904线织幽灵写“装备特技闪身时除外”，本页DDC及inventory主体均无此例外；perk:2528120034勇士之鞭写10%/60 [30]以及推进器附加机制，主体是?%/61 [31]，DDC本页同主体。此项是当前索引中可观察的另namespace记录差异；不主张将本页DDC规则无条件套到棱镜专属来源，但这些额外来源在本索引未标明，不能把它们当已审计同义副本。线织幽灵该perk hash应以索引keys原值为准，见下面更正边界。
- **STR-15 战争旗帜缺条件、模式和原表疑点说明**：988980154.R，原句计层是“either die within20 meters, are killed by the user, or by allies within20 metres”，本站只有“在20米内死亡”；省去远处自己击杀等OR分支。原表30秒与24秒同时出现，延长文字+5与x1表+6也不一致；本站无来源疑点说明，读者会误认全为已确认机制。原表[Varies]及[x1=?%...x4=?%]为粉色PvP，本站仅unsure“随层数而变”，没逐层未知模式表。不可用游戏记忆挑24/30或改+6。
- **STR-16 织针风暴DR单位**：1885339915.R 原句“?% [53%]”，本站“? [53%]”，未知基础百分比单位省略；不等于DR数值有已知错误。
- **STR-17 编织者回能触发**：262821317.R，原句“Threadling damage instances grant10%”，本站“线虫命中提供10%”。伤害实例与命中事件不等价，原表没有把每次碰撞/命中都作为回能单位。
- **STR-18 编织微步花火模式**：262821312.R，原表粉色“[90%,60% while carrying Spark]”；本站“提供90%伤害抗性（携带花火时60%）”，失去PvP作用域。其余限制与退出效果齐全。

STR-14 hash证据边界：本次读取的索引线织幽灵重复perk记录keys在长行输出被截断，因此不能承诺上述候选perk:3569371904为实际主键；该候选不作为修复定位依据。已完整观察的证据是索引 name=线织幽灵 的perk描述带“装备特技闪身时除外”，主体4249729125无此句。其他两条重复perk主键3498667665/2528120034为实际输出可见值。报告保留此边界，不以未观察hash冒充确定映射。

## 索引与呈现附加发现

五个enhanced索引项全部desc=null，但HTML都有真实增强子行。这不是源正文消失，却意味着只读索引做全覆盖审计会漏掉增强机制；如其他代理要做源归属/搜索修复，应从通用增强索引生产路径解决，不给具体武器或技能硬编码。当前12个星相索引desc的数值段只有“碎片槽”，槽数只在HTML的<i>图示，不能靠剥标签索引验证槽数。

## 未知与核对边界

- DDC快照未含星相槽位单元格值，因此当前HTML槽数已完整记录但不宣称DDC匹配：猎人2/3/2/3，泰坦2/3/2/2，术士2/2/2/3，顺序同矩阵。
- 已保留的DDC未知：缠结HP?；线虫追踪20?/跳跃?；瓦解搜索?；上升操控+40?；进化速度30?；孤立爆裂?米；多处PvP伤害[?]；抓钩结束后近战?秒/径向4?米；束缚半径?；尖刺逐跳?米/割裂?+?；丝线打击爆裂/重击?米；线织幽灵触发/爆炸半径?；漩涡HP?/追踪?/2?米；狂暴利刃冲刺?；剑刃重击?米；旗帜PvP四层?%；勇士回能?%；镖弹击退/弹体?米；投身激战10?/超能?米；神秘织针?+? [7+2.5]；织针DR?%/伤害PvP?/成虫延迟?；羁客PvP?；编织者700 [?]；微步退出?米及达到最大需?秒。这些源未知不是本站漏测已知值，不能填游戏记忆。
- DDC小字持续增量有明确来源身份，而Continuity“normally50%”与Suspend6+2/3+1未必算术50%一致；报告按原表记录，不强行改为9秒/4.5秒。
- Silkstrike蓝色[504]和粉色[80]模式已查看原始inline，不把蓝色括号当PvP。Banner粉色[Varies]和层表是PvP未知，不得给PvE100%按层推断。
- DDC没有此页暴击伤害公式；Ascent/Isolation涉及操控、精准命中和计数，不可凭precision词推导暴伤。
- 此任务无写入工具且只读权限，未生成local文件；完整报告在本结构化返回。没有运行build/lint/tests/formatters、浏览器、部署、提交、推送。所有分支新发现只报告，不自行扩为修复。

# 附件：棱镜


## 证据与核对边界

源表：https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1918152785 。以下 R 为 data/ddc/1918152785.json 的数组序号 +1，不声称是 Google 工作表显示行号。已读所有 63 行的名称/正文/属性列，并针对计时和小字读原 HTML span。共享技能的详细规则另外逐条读取对应元素 gid，不以 30 个名称一致冒充规则一致。

本站对照主要为首读 data/index/elements__prismatic.json 及五元素生成索引，兼读实体/效果正文、sameAs、enhanced 和真实 HTML。协作期间 HTML 从 74 行变为 75 行，读取范围发生移动，故本报告是本轮读取的生成索引与部分随后 HTML 的审计，不是构建后验收。未执行任何 build/lint/tests/formatter/browser/部署/git 命令。无 write 工具，未保存 local 文档，也未发送写入请求；此 report 即交给父代理保存的完整附件。

字段约定：I = data/inventory-items.json；S = data/sandbox-perks.json；M = data/minted.json。正文默认为 i18n.zh-CN.realgame_details；搜索引用明确用 perk:<hash>，不是 inventory hash。

覆盖：棱镜本页 43 个逻辑规则项（4 机制 +21 碎片 +3 手雷 +15 星相）全部有明确映射；另 30 格共享技能全部映射并读详细规则、冷却/回复倍率。21 枚碎片属性变化全部对照。15 个星相 enhanced 字段均为空；共享技能所带的原分支 enhanced 单列说明。DDC 快照星相正文行只有 4 个数组格，槽位图未在数据中，故不能宣称本站槽位数已与原表图形完全一致。

## 一、全覆盖矩阵：机制

1. R4 Transcendence → I/1190101211 超凡；I/1396318109、3696633656 的 sameAs 均为 1190101211。原句“Instantly recharges 2 Grenade and Melee Ability Charges on activation.”；中文“立即充满 2 次手雷与近战技能充能”。光暗/动能 50% 与槽满后 40%、Overkill 不计、5% 武器伤害/额外 10% 充能/20% [5%] DR/20 秒、双方伤害分别触发 35% 每秒 2 秒、0.9? 累积递减均有。差异 P01：原“T3 Elites, Minibosses and Bosses = 15%”，中文“橙血、初级首领与首领 15%”，遗漏 T3 对 Elites 的限定；不能把全部橙血都列到 15% 档。
2. R5 Elemental Effects → M/4294967310 元素效果。正文与光暗五元素动词/拾取物均一致：Arc 增幅/电光充能/致盲/震颤/离子轨迹；Solar 治愈/焕光/恢复/灼烧/点燃/焰灵；Void 吞食/隐身/覆盖护盾/压制/不稳定/虚弱/裂口；Stasis 冰霜护甲/减速/冻结/碎裂/碎片；Strand 织造铠甲/割裂/悬停/瓦解/缠结。原“Thruster does not count as an Arc Ability”中文明确推进器例外；装备 Strand 技能或星相允许缠结与术士停栖线虫也有。无独立数值差异。
3. R6 → M/4294967311 移动与职业技能。“Hunters are able to use Blink and Acrobat's Dodge. Titans have Thruster. Warlocks can equip Blink and Phoenix Dive.”与中文猎人瞬移/特技闪身、泰坦推进器、术士瞬移/凤凰俯冲一致。Blink 的完整移动规则不在本 gid 或 class abilities 选中条目中，不据此声称移动参数全部验证。
4. R7–8 Crucible Exclusive Tweaks → M/4294967312 熔炉竞技场调整。原“0.85x Regeneration Speed … 0.8x Ability Chunk Gains … 0.68x … Super … 0.95x … Baseline's 0.75x … 0.71x”。中文数字全部一致；“回复倍率获取”译法不够清楚，原是离散回能收益的 0.8×，不是另一条被动再生速度。0.71 为来源自身的舍入值，不另改成 0.7125。

## 二、全覆盖矩阵：21 枚碎片

下表“—”表示原表无属性增减；正文中文摘引为实际生成索引，不是拟写修复。全部名称另用 I.i18n.en.name 确认 Facet of …。

|R|DDC / 中文 / inventory hash|源规则与本站中文对照|属性|结论|
|10|Awakening / 觉醒琢面 /124726505|“Killing 3 enemies … within 6 seconds of each, or a Super Kill” → “6 秒内…击杀 3 名…或一次超能击杀”；末次伤害元素决定拾取物，非缠结同种 5 秒冷却、冷却击杀不计另一拾取物均有|+10 Health →生命值+10|P02 相邻击杀窗口被写成总窗口|
|11|Balance /平衡琢面 /2626922114|“Killing 3 enemies within 3 seconds of each” →“3 秒内…击杀 3 名”；光能给10%近战、暗影给10%手雷一致|—|P03 同上；perk:4220175984 还保留 3?，DDC 已是3|
|12|Blessing /祝福琢面 /124726496|“Melee Kills begin health regeneration. … allies within ? metres while Transcendent” →近战击杀开始生命恢复、超凡时?米盟友|—|一致|
|13|Bravery /勇敢琢面 /124726503|“Volatile Rounds …11.25 [7.5] … Powered Melee …Unraveling Rounds” →手雷虚空不稳定弹/充能近战缚丝瓦解弹，时长匹配|—|一致|
|14|Command /指挥琢面 /124726497|“refills the readied weapon …+20? Stability,+? Aim Assist,+40 AE …11 seconds …4 second cooldown” →已准备武器、未知符号、时长、冷却匹配；冻结/压制击杀各自产碎片/裂口|—|一致；readied 未被误写成全部武器|
|15|Courage /勇气琢面 /2626922124|“Light Abilities …10% …Light Powered Melee …50% [10%]” →冰影/缚丝减益目标，光能技能10%、光能充能近战50%[10%]|+10 Grenade →手雷+10|一致；原表未说明两项叠乘，不自行加规则|
|16|Dawn /黎明琢面 /2626922126|“Powered Melee Hits …Radiant for5 …Kills …user and allies within?” →命中本人5秒、击杀本人及?米盟友5秒|-10 Melee→近战-10|一致|
|17|Defiance /违抗琢面 /74393640|“135 Super-Matching…7 meters”；Arc Jolt、Solar40 Scorch、Void Volatile、Stasis?Slow/?sec、Strand Sever →中文逐元素完整|+10 Class→职业+10|一致|
|18|Devotion /奉献琢面 /2626922125|“Rank-and-File1%|Elites3%|Minibosses+5%|Guardians?%” →“红血1%|橙血3%|初级首领5%|守护者?%”|+10 Melee|P04 Minibosses+ 的“及以上”遗漏|
|19|Dominance /统御琢面 /124726504|“Void Grenade Ability Damage …Weaken6[?] …Arc …Jolt…Arc Soul4 sec” →虚空6[?]、电弧震颤、电弧之魂4秒均有|-10 Grenade|一致；未知PvP值样式风险见P13|
|20|Generosity /慷慨琢面 /2626922127|“7.15%…allies…maximum4…T1 10/T2 15/T3 20/T4 34/Miniboss40/Boss50/Guardian?…threshold30/50/70/100” →中文全部匹配|—|一致|
|21|Grace /恩惠琢面 /2626922121|“Kinetic Weapon Kills…2%[?%]…Super Kills…user and allies within?” →中文全部匹配|-10 Health|一致|
|22|Honor /荣耀琢面 /124726501|“Picking up…or destroying a Tangle…7.5% Light …5% …10% Darkness” →离子轨迹/焰灵/裂口7.5%、碎片5%、摧毁缠结10%|+10 Melee|一致|
|23|Hope /希望琢面 /2626922122|“Additional Base Class Ability Regeneration Rate…x1=40%|x2=60%” →“职业技能基础充能速度…1个+40%|2个+60%”|—|一致；Base 保留|
|24|Justice /正义琢面 /2626922115|“up to130[?] Ability-Matching…? meters” →技能匹配、最多130[?]、?米|+10 Super|一致|
|25|Mending /修复琢面 /124726500|“Grenade Ability Kills…Cure x1…Prismatic…x2” →普通手雷治愈1、棱镜2|—|一致|
|26|Protection /保护琢面 /2626922120|“within15 metres of3 enemies:15%[?%]…NOT…increased…32%” →中文阈值、PvP未知、原表纠正及叠加32%完整|+10 Melee|一致；应标为DDC纠正说明而非站内新实测|
|27|Purpose /使命琢面 /124726498|“based on equipped Super…Arc x1 Bolt Charge…SolarRestoration1/5s…Void22.5HP/5s…StasisFrostArmor2/5s…StrandWovenMail5s” →中文全部完整|-10 Class|一致|
|28|Ruin /毁灭琢面 /124726499|“additional damage instance…up to25[9]…10[8]…minimum17[4]…Ignitions25% radius” →中文完整|+10 Weapons→武器+10|一致；最大/最小区分保留|
|29|Sacrifice /牺牲琢面 /124726502|“Arc,Solar,orVoid Elemental Buff…Ability Kills…additional1%[?%] Darkness” →中文范围完整|+10 Grenade|一致|
|30|Solitude /孤独琢面 /2626922123|“Precision Hits within3 seconds of each…next damage instance from any source within3 seconds…3m/6m…4secCD…20%Magazine+1 roundeddown…Bows2” →数字及后续伤害窗口完整；首句“3秒内精准命中次数达标”|—|P05 相邻命中窗口误成总窗口；P06 perk正文错误解释附加伤害例子|

碎片所有 unknown 均被保留；没有将 DDC 的 ? 擅改成确定数值。I 的碎片消耗1属于本站/manifest展示，DDC这里没有该列，不能称为DDC确认。

## 三、三职业超凡手雷与星相逐条覆盖

### 猎人

- R32 Hailfire Spike →I/1005476557 雹火尖刺。原“up to78[?]…15.6[?]…x13? Slow every0.25 seconds for3.45…After3.45…39[?]…x10 Scorch every0.25…4seconds”；中文锥形?米、爆发/减速/烈日两阶段数值与时间全部匹配，保留13?。未新增普通手雷基础冷却。
- R37 Ascension →I/2835214901 飞升。“Triggers the effects of the equipped Class Ability, as well as Threaded Specter if equipped”中文两者完整；10米盟友增幅、10米敌人181[30]/震颤一致。P07：索引 perk:3605775441 仍181[?]，缺线织幽灵触发，新增“200职业属性最多+65%[?%]”无棱镜本行依据。该 perk 是原分支记录，不能误把原分支不同规则当棱镜等价。需查原Arc归属后保留明确模式，而不是直接全删 manifest描述。
- R38 Gunpowder Gamble →I/2835214903 火药博弈。6充能，武器1[2]、元素减益3[4]、技能4、超能6；3秒或射击引爆、基础点燃+50%；射击额外伤害50%[5%]/半径?%/?米/9子弹药80[?]；仅自动触发手雷效果、6秒CD、CD内击杀无充能全部有。原文自身两个“50%”层级关系没有明说，不将其算成125%或叠乘结论。
- R39 Stylish Executioner →I/2835214900 潇洒行刑者。任意元素减益击杀、隐身8/真实视界4、隐身及因效果脱隐后0.5秒、近战+300%[20%]/虚弱5[2.5]/突进?米、Too Stylish2[12]均匹配。“因发动优雅处决”与条目名“潇洒行刑者”不统一，有歧义；属术语风险，不自行改成别的机制。
- R40 Winter's Shroud →I/2835214902 严冬帷幕。原“Additional Base…300%[150%]3sec”，中文保留Base；职业技能9[8]米施加60[40]Slow8[1.5]秒及对Combatants50%DR4?秒完整。这里Combatants明确可译战斗人员，不套到其他 enemy。
- R41 Threaded Specter →I/2835214897 线织幽灵。175HP/12sec/Combatants70%DR/盟友及施法者+150%伤害/永远敌对、不触发击杀/479[60Guardians|121Objects]/近敌爆炸生2虫/0.6x但特技闪身除外完整。P08：perk:2375800796 的实际生成索引正文还是600而非479；它的同名搜索结果不能当棱镜正确正文。

### 泰坦

- R43 Electrified Snare →I/275534325 电击陷阱。Arc/Strand，最多105[?]、悬停?米、?间隔/?伤害/?持续、附加Jolt，中文完整。
- R48 Knockout →I/1262901523 重击。0.1秒回血、50/75/100/30，增幅、破盾或<30%HP触发6秒、基础/偃月160%[30%]、充能160%[20%]、基础计Arc powered、Combatants突进6米完整。P09：原“Miniboss+ =100HP”，中文仅“初级首领100”，遗漏及以上。
- R49 Consecration →I/1262901520 神圣献祭。20米/40[30]/40Scorch、第二波20米/486[120]非灼烧、472.5[50]灼烧并点燃、碎晶、非近战25%DR、滑铲射击不能用完整。P10：原“Only consumes50%…if the slam is not activated”，中文“未处于猛击状态时只消耗50%”是状态描述，宜写“未发动第二段猛击时”，不把条件解释成动画中每次消耗。
- R50 Unbreakable →I/1262901521 坚不可摧。Hammer of Sol/Glacial Quake期间可用、格挡95?%[64%]、正面嘲讽/迷失、10HP/s、5+2.5s、7.5%能量/s、50?%前移惩罚0.5?秒、回能递减不确定、冲刺取消/禁攀爬、松开或耗尽耗50%、11米、430[64?]到1584[178?]、Devour10+5均保留。P11：原“Overrides Grenade Ability Cooldown to152seconds at base”，中文“装备时手雷冷却覆盖为152秒”，遗漏基础值；爆炸“Grenade Damage”中文只写伤害，也遗漏分类。原“after receiving a lot [?] blocked damage”中的阈值未知被概括成“随已格挡伤害提高，最高1584”，读者无法知道达到最大值的阈值也是未知。
- R51 Diamond Lance →I/1262901522 钻石长矛。1[3]冰影武器/任意技能/碎裂击杀、重击灌注非充能守护者击杀例外、3米拾取/持10秒/地25秒、投掷5米冻结150[45]/直接撞晶、猛击8[6.75?]米200[90]/友军?米FrostArmor2、Generic Stasis Ability非雷非近战、7[17]CD都有。P12：原另有“Diamond Lances instantly shatter Stasis Crystals upon damaging them.”，中文只保留“直接接触时碎裂水晶”；遗漏所有造成伤害即可即时碎晶的通用规则。7[17]秒中的[17]未着pvp token。未知PvP半径仍应双重保留pvp/unsure语义。
- R52 Drengr's Lash →I/1262901525 勇士之鞭。屏障30米追踪60[30]/悬停，推进器生成结?秒/?半径60[30]/悬停完整。P14：perk:2528120034 同名搜索条目额外“击杀受元素减益…10%职业能量”，棱镜原行没有；属于原分支扩写不能无条件继承，当前实体正文明显没有这一句。

### 术士

- R54 Freezing Singularity →M/4294967313 冰冻奇点。70[26]Void、拉12米、场域6米18[4]/13?Slow/0.25秒/3.65秒、5秒后7米570[150]/压制，中文完整。
- R59 Lightning Surge →I/790664812 闪电激涌。10米传送/出口7米五边形5闪电、每enemy命中BoltCharge1、使用增幅及BoltCharge1/未命中不超过1、Combatants未知DR/时间、滑铲射击禁用、634+127=761[105+47=152]/Jolt全有。P15：perk:3418800299 只写“使用时另提供增幅”，没有使用时1层电光充能；不能用“不超过1层”倒推明示的免费1层已经写了。
- R60 Hellion →I/790664814 地狱火，S/1821367741同名。20秒、每1.35秒/40米/217[38]Solar Grenade Ability Damage/4米Scorch30、Grenade interactions均有。P16：原“Hellion-inflicted Solar Effects are not scaled by Grenade Damage.”；两份中文均“地狱火施加的灼烧效果不随手雷伤害缩放”。Solar Effects不等于只Scorch，至少原文不允许缩范围到灼烧。
- R61 Feed the Void →I/790664815 虚空供养。技能/冻结敌人碎裂/不稳定爆炸/缠结击杀触发，强化吞食激活140HP/10秒，重新激活140/refresh5，击杀140/双倍雷能/refresh5，T1 15/T2 23.2/T3 27.5/T4 40/Guardian40全有。refresh5 的来源措辞自身可歧义，中文“刷新5秒”没有擅算，不新增最大持续时间。
- R62 Bleak Watcher →I/790664813 凄凉观察者。159.6秒覆盖/当前手雷chunk multiplier继承，35米/2秒一轮/5发0.7秒/20[10]Slow4.5[2]秒、持续25/150ConstructHP/开火前67%DR/Stasis Grenade Damage均有。没有把原Stasis的Durance额外时长移植进棱镜行。
- R63 Weaver's Call →I/790664810 编织者之唤。原“Threadling damage instances grant10% Class Ability Energy.”中文“线虫命中提供10%”，将damage instance缩为hit，P17措辞风险：如果多伤害实例/非直接命中，不能保证同义。700[?]显示伤害且PowerDelta惩罚、2秒CD/一次最多1、职业技能3虫/全部停栖虫、kills counter100%/34% Miniboss以下/Boss100/Guardian67均完整。

## 四、30格共享技能矩阵：每格来源、中文、hash、冷却与模式

P=棱镜矩阵hash；B=实际原元素索引主记录hash。P与B不同不代表错误，英文名均已对应；许多P仅官方description，本站正文在B，不应修改空P去建立第二份实现。冷却单位秒，括号内回复倍率。所有30名称均与棱镜源R34/35、45/46、56/57一致，下面列出逐条规则检查，不只计数。

### Hunter：R34手雷 / R35近战

1. Arcbolt Grenade 电光手雷 P=B1582574009，Arc gid618967225，151.5(0.75)。12米LOS扫描/1秒/10米连锁最多4/521[85]中文完整。
2. Swarm Grenade 蜂群手雷 P2842514288→B3199702642，Solar1186062409，137.7(0.75)。9无人机/7米追踪/10–11秒/58+54[8+8]/5+3Scorch/总1008[144]、45+27中文与数字原句一致；但+3/+27为Ashes小字不是棱镜固有，见P18。
3. Magnetic Grenade 磁性手雷 P886607940→B1547656727，Void1907852650，151.5(0.75)。1.2秒、再0.6秒两爆/5米/472[75]/总946[150]中文完整。源472×2与946总量算术不合，P22来源疑点，不擅算改944。
4. Duskfield Grenade 暮域手雷 P=B1399216，Stasis1088259962，131.7(0.875)。触地20[20]/Slow20[10]/2+2秒，场域4米/0.35[0.3]秒/伤害1/Slow10[5]/7+2秒完整；额外+2是Durance小字，P18。
5. Grapple 抓钩 P1225978592→B2470512752，Strand1870531554，107.9(0.875)。22米/38[?]/1秒取消退50%、缠结满返及4秒返还、快速启动不触发、近战432[61]+径向432[61]/4?米、雷+近战双分类、直接命中Guardian0.5秒突进禁用、点尸成金-50%、空中禁被动恢复完整。中文“钩住22米外的目标”vs源“Hooks up to22metres away”丢最远限定，P19。
6. Combination Blow 组合打击 P2657901005→B2716335211，Arc，58.1(1)。100%职业/100HP/20秒最多3层、Arc infused、70职业全额赌徒返还、133/266/400与PvP23/51.3/86、分层HP80/60/40全部一致。初始击杀100HP与已有层回血关系源自身未详解，不增加优先级。
7. Knife Trick 飞刀戏法 P2657901004→B4016776972，Solar，118.8(0.9)。3刀、257[38]、精准1.3、20+10[?无PvP单列]、全精准1002[147]/60+30匹配；Ashes+10/+30是模式限定P18。
8. Snare Bomb 陷阱炸弹 P=B1139822081，Void，130.7(0.9)。9秒雷达、盟友6米隐身5+2、?探测、33[10]/120+24[40+?]、虚弱8[2.5]/烟5[2]/0.6秒tick/0.87首跳/12.65递增13%至24.8九跳/156.7完整；5+2是Persistence附加，非棱镜固有P18。120+24是普通两段伤害，不能把所有加号都归成碎片。
9. Withering Blade 枯萎之刃 P=B1341767667，Stasis，145.2(0.8)。固有2充能、表面反3/敌4/12[8]米/296[72]/Slow60[40]/3.5+3.5[1.5+0.5]完整；Durance额外时长P18。
10. Threaded Spike 线织尖刺 P=B1680616210，Strand，145.2(0.8)。9敌/?米/427[82]/Sever?+?/首次-18之后-42.5，回收0至5+回能5/10/20/30/35/40、接住20/30/50/70/85/100均有。源“Strand Subclass Exclusive”接住击杀每次2秒Woven Mail最高10秒，中文明确缚丝专属；这是正确隔离，不能抄成棱镜收益。

### Titan：R45手雷 / R46近战

11. Pulse Grenade 脉冲手雷 P1323461861→B1713935764，Arc，175.6(0.625)。触地156[50]/6米、每0.7脉冲249[80]/5+2，中文明确量级火花额外2次及1245/1743[530/690]；没有擅算另一总量。棱镜无量级火花，需要共享说明隔离该条件P18。
12. Thermite Grenade 铝热手雷 P2400634603→B3969294337，Solar，159.6(0.625)。首波再3/1.45秒/20米/246+206[80+50]/Scorch10+10/4波1808[360]/40+40完整；Scorch额外+10/+40属Ashes；246+206是普通两段伤害，不能误删其后半。源PvP每波80+50与四波360疑点P22。
13. Suppressor Grenade 抑制手雷 P=B2265076177，Void，175.6(0.625)。速度低后短延迟、9米863[150]/压制10[5]/自己不被压制完整。
14. Glacier Grenade 冰川手雷 P=B1399217，Stasis，175.6(0.625)。垂直投掷方向5晶、碎裂158[?]/8米衰减66%完整。enhanced冬日之触七边形7晶不属于棱镜。
15. Shackle Grenade 束缚手雷 P1517917190→B2809342386，Strand，219.5(0.5)。源“releasing an explosion on impact”，实际“受到伤害时释放爆炸”；P20触发被错译。190[?]/?米悬停、直接2小球/表面3、每小球81[?]/悬停都完整。
16. Thunderclap 雷霆一击 P1980796563→B2708585279，Arc，131.7(0.9)。703[120]/7.5米宽/16米、2秒最多+100%、Combatants80%DR/使用后?秒完整；中文额外“乘算”为源没有的断言P21。
17. Hammer Strike 战锤打击 P=B852252788，Solar，131.7(0.8)。肩撞1.25秒/未命中耗15%/滑铲射击禁止/Guardian0.5秒、突进6.8/878[90]/Scorch40+20/后7米586[60]/直接击杀点燃完整；Ashes+20不可在棱镜当固有P18。
18. Shield Throw 圣盾投掷 P1980796560→B4220332374，Void，131.7(0.9)。最多4跳弹/尝试追踪/受重力/400[70]/每hit15HP Overshield完整。
19. Shiver Strike 战栗打击 P1980796561→B2028772231，Stasis，146.3(0.7)。延长突进、接触碎晶、miss80%[40%]、511[105]/强[中]击退/Slow50[40]、延迟1秒219[?]/Slow100[40]/8米到20%伤害、近战增伤同时作用两段、impact nonlethal、Guardian0.5秒完整。
20. Frenzied Blade 狂暴利刃 P1980796564→B4094417246，Strand，159.6(0.7)。3充能、余量0/1/2再生1.15/1.55/1.95、棱镜额外0.7×、前冲?米569[105]/Sever完整。已显式呈现棱镜惩罚，不应因名称相同忽略。

### Warlock：R56手雷 / R57近战

21. Storm Grenade 风暴手雷 P=B2481624867，Arc，175.6(0.625)。0.85秒440[70]/7米、之后0.6秒X形311[50]、量级火花+形再311[50]、Combatants每轮一次/751或1062完整。原“Guardians can only be hurt once by the barrage …regardless of pattern”中文“守护者每轮弹幕的每发矢弹也只受一次伤害”，P23把整个弹幕一次改成每发/每轮一次，虽仍写120上限，触发规则不等价。
22. Healing Grenade 治愈手雷 P=B1841016428，Solar，119.7(0.875)。7.5米Cure1、恢复orb7.5秒/100HP/7.5米拾取、Restoration1时长4+2匹配；+2属Solace，不可棱镜固有P18；恢复orb不是可提供超能的Orb of Power，现中文套orb token应明确只是恢复球。
23. Vortex Grenade 涡流手雷 P=B1016030582，Void，219.5(0.5)。触地5米195[25]、0.833秒拉5?米、1.45−0.13秒启动、0.267tick/78[20]/12+7/4+1秒/第13至20低54[?]/总990或1536[240或380]全部保留。+7/+1为Remnants扩展，非棱镜可装备碎片P18；“1.45−0.13”原句本来就是“1.45-0.13”，计时含义未明，列P22来源疑点，不能宣布负向推算。
24. Coldsnap Grenade 急冻手雷 P=B1399219，Stasis，175.6(0.625)。直中Slow50[?]/4+2秒及StasisGrenadeDamage、触地0.8秒/17m/s/20米/1秒追踪递弱、20[20]/冻结3[1.75]、再连2全有。+2 Durance模式P18。
25. Threadling Grenade 线虫手雷 P3994381207→B4228170798，Strand，175.6(0.625)。中型、空中3弹/每弹接触一虫完整。Mindspun Invocation enhanced巢穴300HP/17.5秒等不是棱镜星相。
26. Chain Lightning 连锁闪电 P=B1232050831，Arc，131.7(0.9)。6米突进/390[100]/Jolt、265[54]/9米/最多5/不能回最近、增幅两轮不同敌仍各一次完整；2 Ability Charges明确Arc Subclass Exclusive，中文已明确电弧分支专属，正确，不能棱镜写2充能。
27. Incinerator Snap 焚烧响指 P=B1470370538，Solar，119.8(0.9)。5花火/?射程/?半径/90[27?]/Scorch20+10[10+5]/全450[135?]/100+50[50+25]全部匹配；Ashes小字+10/+5/+50/+25非棱镜固有P18。
28. Pocket Singularity 口袋奇点 P=B2299867342，Void，131.7(0.9)。固有2充能、2秒/追2?米、3.75米/527[60]/Volatile、auto-melee耗一充能突进/击退与Volatile但按距伤害-65到-50、越近越低、Guardian0.5秒/打断滑铲完整。没有误把本条2充能写成原Void专属。
29. Penumbral Blast 半影冲击 P=B2543177538，Stasis，146.3(0.8)。22米自动爆/接触240[30]/冻结2.7[2]米完整。
30. Arcane Needle 神秘织针 P=B2307689415，Strand，146(0.8)。固有3、余量0/1/2再生1.16/1.64/2.6、棱镜额外0.7×、505[68]/Unravel?+?[7+2.5]完整；+?部分来自来源小字的扩展条件，不能无条件把未知两段合成棱镜持续时间。

### 共享技能的增强子行与范围

读取的 enhanced.by 显式来源：冬日之触4184589900（暮域/冰川/急冻）、暴雷之触1656549672（脉冲/风暴）、火焰之触83039193（治愈）、混沌加速2321824285（涡流）、Mindspun Invocation262821318（抓钩/束缚/线虫）。棱镜15星相名单不含任何这些 by；共享矩阵当前不展开 enhanced，因此不能将原分支增强参数当成棱镜正文缺项补上。

来源机制保留：DDC Stasis Durance原句“All affected Slow sources and abilities will have their value with Durance shown in smaller text next to the regular duration or stack amount.”；DDC Solar Ashes原句“Every source of Scorch will have its base number alongside Ember of Ashes' benefit in smaller text next to the regular stack amount.”。本站把这些小字变成没有来源注释的正常字号“3.5+3.5”“20+10”等；其加号不是原生叠加效果，且对应碎片棱镜不能装备。P18是组合/来源归属风险，不主张全局删除所有加号。伤害实例如120+24、246+206、634+127是真实主文本加号，必须区别。

## 五、职业技能/移动引用

- Acrobat's Dodge →原class gid527596209；本站B2711519343 特技闪身：56[148.4]秒、chunk0.5、10米Radiant10+5、6.5米40[20]Solar，数值逐条一致。+5为Solar Solace小字条件，不是棱镜必然15秒。
- Thruster →B489583098 推进器：52.1秒/chunk1、追踪?与GuardianAA去除、方向8米/无方向后4米/仅地面，原句逐条一致。棱镜机制页明确它不计Arc Ability。星相Drengr与Knockout没有由名称推断额外规则。
- Phoenix Dive →B1444664836 凤凰俯冲：79.6秒/chunk0.8、9米Cure2匹配；原源另“While Heat Rises is active…”Restoration2/3+1.5秒、5米100/40+20Scorch是炙热升腾限定，棱镜没有该星相，不应当棱镜缺项。本站另有凤凰俯冲（炙热升腾）索引子行，本次query只呈现其名字/图，没有desc，不能宣称该增强正文详细已审完。
- Blink 两职业可选的事实已由棱镜R6证实；快照目标未提供其距离/无敌帧等参数。本轮不凭记忆补移速或帧数据。

## 六、差异清单与疑点汇总

确认正文/索引差异：P01 T3 Elites限定丢失；P02 Awakening相邻6秒改总6秒；P03 Balance相邻3秒改总3秒且perk仍3?；P04 Devotion Minibosses+遗漏及以上；P05 Solitude相邻命中窗口改总3秒；P06 S4221964828“不会触发三体坐观者、高爆载荷这类Perk”把“额外同时伤害不能触发割裂爆裂”误译成“该精准命中不触发武器Perk”；P07原分支Ascension搜索条目和棱镜不一致，应注明模式归属；P08 Threaded Specter perk600 vs棱镜479；P09 Knockout Miniboss+仅初级首领；P11 Unbreakable遗漏at base、Grenade Damage分类及最大格挡阈值未知；P12 Diamond Lance通用伤害碎晶句遗漏；P14 Drengr同名perk额外回能未标原分支；P15 Lightning Surge perk遗漏使用时免费电光1；P16 Hellion Solar Effects縮成Scorch；P19 Grapple up to22米写成22米外；P20 Shackle impact误译受到伤害；P21 Thunderclap无源“乘算”；P23 Storm Guardian弹幕一次规则被改成每发/每轮。

表达/呈现风险：P10 Consecration未发动第二段的条件用“未处于猛击状态”；P13 PvP未知数仅unsure未同时pvp（包括Dominance、Justice、Protection、Unbreakable、DiamondLance6.75?等），DiamondLance[17]裸文本；P17 Weaver damage instances译线虫命中；P18所有共享技能小字扩展值必须说明来源/原分支限定，不能自动迁成棱镜固有。

P22 DDC自身疑点：Magnetic472×2却总946；Thermite每波PvP80+50/四波却总360；Pulse总1245不含最初156却PvP530含50；Vortex“1.45-0.13”含义不明；Gunpowder两个50%是否基础与射击额外的层级没有公式。这些均保持源句，注明DDC原表疑点，不凭算术修出更确定机制。Transcendence0.9?、Unbreakable递减随时间还是随伤害、未知最高伤害阈值也只能来源待确认。

全局enemy语义：DDC一般 enemy 与明确 Combatants/Guardians 区别存在；本站几乎所有enemy都套{enemy|战斗人员}。由于有PvP括号，此词未必表示站内PvE-only，但不得据此在修复时缩成“仅PvE战斗人员”。明确Combatants-only的Winter DR、Knockout lunge、LightningSurge DR可保留；其余enemy应采用兼容PvP的目标措辞。原表未枚举的叠加/上限/刷新优先级不可添加。

## 七、缺项、不可确认与交付

- 棱镜源全部有名碎片/手雷/星相均已映射，无未映射名称；三种超凡通过sameAs共享正文正确。
- 本页没有独立完整共享技能说明，只矩阵名/图；首读tools/rows.py的matrix_cells生成通用元素页链接，后读真实HTML却是<span>名称而非<a>，说明协作期间呈现已变化或实际渲染另有层。不能声称读者一定能点到所有来源，主代理需在最终统一构建后确认通用呈现路径，不硬编码某技能。
- Fragment Slots原表图形不在当前snapshot：R37等行长度4，而标题行有第14格。本站HTML可见星相槽位数字，但这不是DDC等价证据。必须将此边界写在最终报告；不猜缺失图形上的点数。
- 页面没有共享超能矩阵；目标DDC也没有对应共享超能清单，因此不是本轮确认遗漏。不能扩成全职业超能审计。
- 原元素页有其各自全局机制，棱镜元素效果行是一张动词/拾取物目录，不能当全量五元素机制替代。本轮检查到了小字、模式和相关源规则，不声称所有五元素机制已经由本棱镜附件重审。
- 本报告仅审计，不自行扩为分支修复；实际写入由父代理按用户范围决定。没有修改搜寻者记录或任何manifest/英语官方description/评级。
- 主代理应在所有owner落地后统一生成与检查；本审计未运行任何验证，也未将读到的旧索引冒充最终输出。

# 附件：职业技能


## 范围与证据边界

原表：[DDC Class Abilities，gid=527596209](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=527596209)，本地快照 data/ddc/527596209.json。下列行号为该JSON数组从1开始的行次；D列正文，N列冷却。交叉来源：[DDC Solar，gid=1186062409](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409)。

核对现有生成索引与HTML，没有重新生成。对英文名用inventory-items.i18n.en.name映射；固有Perk在minted没有英文名，按职业分节与完整正文映射，不把同名“固有Perk”合并。

覆盖：Class Abilities快照共16行，其中1行标题、3行职业分隔、12行实质条目。本站展示实质条目12/12：固有Perk3/3，职业技能9/9，凤凰俯冲炙热升腾增强1/1，基础冷却与Chunk Scalar配对9/9。页索引16条=分节3+主条目12+增强条目1。该快照没有另列双跳/三跳/滑翔/瞬移等通用移动技能，也没有独立全局属性/模式规则或独立移动页；本报告不声称全DDC、全部移动技能或全部职业分支覆盖。实际所含位移为三种闪身、推进器与凤凰俯冲，均已核对。没有漏映射的Class Abilities实质条目；没有本站独立新增主条目。其他元素表仅交叉读凤凰俯冲及解释小字的Solace/Ashes，不将此称为Solar全覆盖。

## 全覆盖矩阵与逐条证据

下文“正文”指 i18n.zh-CN.realgame_details；“冷却”指根字段 site_cooldownSeconds/site_recoveryMultiplier 以及实际HTML数值列。

### 1. 猎人固有Perk — minted/4294967307，DDC行3
原句：“Base Sprint Speed is 8.5 meters per second, compared to their baseline of 8m/s.”；“Baseline 100 [70] Mobility and 0.9x [0.95x] Ready/Stow Animation Duration.”；“Sprint Speed Increase is equivalent to that of an Exotic Armor-based Sprint Boost, only being able to stack with a Lightweight Weapon.”
本站正文/HTML：“基础疾跑速度 8.5 米每秒，另两个职业是 8 米每秒。基准敏捷 100 [70]，取出与收起动画时长 0.9× [0.95×]。这份疾跑加速等同于异域护甲提供的那一份，只与轻质框架武器叠加。”
结论：全部对应，含基础速度、PvP、动画时长和叠加范围，无新增差异；无冷却栏内容符合源表。

### 2. 特技闪身 / Acrobat's Dodge — inventory-items/2711519343，DDC行4
原句：“upon landing, grants the user and their allies within 10 meters Radiant for 10<small>+5</small> seconds.”；“Enemies within 6.5 meters are dealt up to 40 [20] Solar Damage upon landing.”；“Base Cooldown: 56 [148.4]s”“Chunk Scalar: 0.5x”。
本站正文/HTML：“落地时为自己与 10 米内的盟友提供焕光，持续 10+5 秒。落地对 6.5 米内的战斗人员造成最多 40 [20] 烈日伤害。”数值列“基础冷却56 [148.4]秒；回复倍率0.5×”。
结论：距离、最大伤害、元素、落地时机、冷却/PvP与倍率一致；enemy范围见CA-01；+5条件与排版见CA-02。

### 3. 赌徒闪身 / Gambler's Dodge — inventory-items/426473317，DDC行5
原句：“grants 1% [0.35%] Melee Ability Energy per Melee Stat, up to 100% [35%] Melee Ability Energy at 100 Melee Stat.”；“Dodging within 15 meters of an enemy doubles the Ability Energy gained. No Chunk or Stat Scalar.”；“Removes Combatant Projectile Tracking, as well as Aim Assist against Guardians during the Dodge Animation.”；“Base Cooldown:56 seconds”“Chunk Scalar:0.8x”。
本站：“每点近战属性提供1% [0.35%]近战技能能量；100点近战属性时提供100% [35%]。在战斗人员15米内闪身，获得的技能能量翻倍。这一份不受回复倍率与属性倍率影响。闪身动画期间移除战斗人员弹道的追踪，以及对守护者的自动瞄准辅助。”冷却56秒/0.8×。
结论：单位属性收益、100点数值、翻倍、无Scalar、动画及两类追踪/辅助、冷却均对应；enemy范围CA-01；明确“up to”上限遗漏CA-05。勿按算术自行推断翻倍后最终上限。

### 4. 射手闪身 / Marksman's Dodge — inventory-items/426473316，DDC行6
原句：“reloads all weapons and picks up Ammo Bricks within 15 meters.”；“Removes Combatant Projectile Tracking, as well as Aim Assist against Guardians during the Dodge Animation.”；冷却42秒/Chunk Scalar1x。
本站：“填装全部武器，并拾取15米内的弹药块。闪身动画期间移除战斗人员弹道的追踪，以及对守护者的自动瞄准辅助。”冷却42秒/1.0×。
结论：全部对应，无新增差异。

### 5. 泰坦固有Perk — minted/4294967308，DDC行8
原句：“20% [5%] Increased Basic Melee Damage.”；“Increased damage is multiplicative.”
本站：“基础近战伤害提高20% [5%]。该提升为乘算。”
结论：全部对应，无冷却。

### 6. 集结屏障 / Rally Barricade — inventory-items/489583097，DDC行9
原句：“Creates a short, curved barricade construct in front of the caster that blocks all damage dealt to it.”；“20% [20%] Damage Resist while in the Barricade Placement animation.”；“lasts for20 seconds, and has500 Construct HP. Barricades have90% Damage Resist against Combatants, and ?% against Boss Combatants.”；“Enemies that pass through the barricade rapidly receive ? [?] non-lethal damage every ? seconds.”；“While within ? meters behind the Rally Barricade:80% Damage Resist against Splash Damage from Combatants. Combatants up to ? meters in front of the barricade are taunted.”；“+30 Stability,+100 Reload Speed,0.9x Reload Duration Multiplier,10% Increased Damage Falloff Distance,and50% Flinch Resist.”；冷却55.1秒/1x。
本站：“低矮的弧形屏障，挡下打在它身上的全部伤害”；放置动画20% [20%]；持续20秒/结构生命值500/战斗人员90%/首领?%；“穿过屏障的战斗人员每?秒快速受到? [?]非致命伤害”；后方?米时溅射80%抗性、前方?米战斗人员吸引仇恨；稳定性+30、填装+100、时长0.9×、衰减距离+10%、抖动抗性50%；55.1秒/1.0×。
结论：逐项数值和后方条件均保留；穿越目标范围CA-01；原表自身Combatants与Boss Combatants重叠措辞CA-06；未知PvP呈现CA-07。

### 7. 推进器 / Thruster — inventory-items/489583098，DDC行10
原句：“Performs an evasive first-person dash that removes Combatant Projectile Tracking?, as well as Aim Assist against Guardians.”；“Quickly dashes8 metres towards the currently held movement direction. Not inputting a movement direction will result in a4 metre backwards dash.”；“Only usable while on the ground.”；冷却52.1秒/1x。
本站：“以第一人称冲刺的形式进行闪避，期间移除战斗人员的弹体追踪?与对守护者的瞄准辅助。朝当前保持的移动方向快速冲刺8米；不输入方向则向后冲刺4米。只能在地面上使用。”；52.1秒/1.0×。
结论：全部对应，尤其原表追踪后的问号已保留，不能升级为确认机制。记录zh-CN下还有重复的site_cooldownSeconds/site_recoveryMultiplier，值与根一致；这是字段组织现状，不计为DDC机制差异，不要求本轮清理。

### 8. 巍峨屏障 / Towering Barricade — inventory-items/489583096，DDC行11
原句：“Creates a tall, slightly curved barricade construct in front of the caster that blocks all damage dealt to it.”；放置动画20% [20%]；持续20秒/500 Construct HP；“90% Damage Resist against Non-Boss Combatants,and ?% against Boss Combatants.”；“Enemies that pass through ... ? [?] non-lethal damage every ? seconds.”；后方?米、对Combatants溅射80%抗性、前方?米Combatants被taunted；冷却101.3秒/0.5x。
本站：“高大、略带弧度的屏障”；20% [20%]；20秒/500；“非首领的战斗人员”90%/首领?%；“穿过屏障的战斗人员每?秒快速受到? [?]非致命伤害”；后方?米及80%/前方仇恨均保留；101.3秒/0.5×。
结论：全部明确数据对应；穿越目标范围CA-01，未知PvP呈现CA-07。无擅加集结专属属性。

### 9. 术士固有Perk — minted/4294967309，DDC行13
原句：“1.1x Grenade Regeneration Speed.”；“5% [2.5%] Increased Grenade Ability Damage.”
本站：“手雷回复速度1.1×。手雷技能伤害提高5% [2.5%]。”
结论：全部对应，无冷却。

### 10. 强能裂痕 / Empowering Rift — inventory-items/25156514，DDC行14
原句：“Conjures an Empowering Rift beneath the caster for15 seconds.”；“20% [15%] increased damage,260% [104%] Additional Base Grenade and Melee,and230% [92%] Additional Base Class Regeneration Rate in a5 meter radius.”；“Kills while in the Rift grant1.15x Ammo Generation Multiplier. Ammo Generation Multiplier is additive to Ammo Finder Multipliers.”；“Grants20% Damage Resist and allows movement at a speed of ?m/s while in the Rift Placement animation.”；118.7秒/0.5x。
本站：“施法者脚下…持续15秒。裂痕5米半径内：伤害提高20% [15%]，手雷与近战基础回复速度额外提高260% [104%]，职业技能基础回复速度额外提高230% [92%]。在裂痕内击杀提供1.15×弹药生成倍率。该倍率与弹药搜寻者的倍率加算。放置动画期间提供20%伤害抗性，并可以?米每秒的速度移动。”；118.7秒/0.5×。
结论：全部对应。Base/Additional正确保留，未误写为总倍率；没有根据官方描述把泛称damage另缩成weapon damage；搜寻者倍率仅说明加算，未改用户例外记录。

### 11. 治愈裂痕 / Healing Rift — inventory-items/25156515，DDC行15
原句：“restores40 [35]HP per second in a5 meter radius for15 seconds.”；“While at Full Health ... generates3 Overshield HP per second,up to15 Overshield HP. Having Void Overshield prevents this from happening.”；“Overshield can stack with other overshields,such as Turnabout's OS and Class Stat OS. Overshield layers are determined by First In,First Out.”；“Healing Rifts cause the users to count as having Overshields for the purpose of perk interactions.”；放置动画20%抗性/?m/s；118.7秒/0.5x。
本站：“5米半径内每秒恢复40 [35]生命值，持续15秒”；全满时每秒3点覆盖护盾/最多15点/已有虚空覆盖护盾不生成；可与还治彼身和职业属性护盾叠加/先进先出；Perk交互视为拥有覆盖护盾；20%抗性/?米每秒；118.7秒/0.5×。
结论：全部对应，完整保留条件、上限、排除、FIFO和Perk交互，无新增差异。

### 12. 凤凰俯冲 / Phoenix Dive — inventory-items/1444664836，DDC行16
原句：“Dive that applies Cure x2 to the user and their allies within9 meters.”；“While Heat Rises is active:Applies Restoration x2 for3<small>+1.5</small>seconds upon diving.”；“Deals100 damage and x40<small>+20</small>Scorch to enemies within5 metres upon landing.”；79.6秒/0.8x。
本站正文：“向下俯冲，为自己与9米内的盟友施加2层治愈。”enhanced[0].by=[83039194]；enhanced[0].realgame_details：“俯冲时施加2层恢复，持续3+1.5秒。落地对5米内的战斗人员造成100伤害与40+20层灼烧。”实际增强标题“装上炙热升腾之后”；79.6秒/0.8×。
结论：基础治愈、俯冲/落地时机、伤害、层数及冷却对应Class Abilities；enemy范围CA-01；增量CA-02；激活条件CA-03；跨原表范围冲突CA-04。

## 差异及疑点清单

### CA-01：Enemies/enemy被缩窄为战斗人员（5处）
证据与字段：2711519343正文“Enemies within6.5 meters”→“6.5米内的战斗人员”；426473317正文“within15 meters of an enemy”→“在战斗人员15米内”；489583097与489583096正文“Enemies that pass through”→“穿过屏障的战斗人员”；1444664836增强“to enemies within5 metres”→“5米内的战斗人员”。另Solar/2979486801增强同样把enemies写成战斗人员。
原表同条目中Combatants/Guardians分别使用，不能把泛称enemy无依据视为PvE-only。应在报告中明确范围翻译不一致；本轮只审计，不自行修。其他确实写Combatant的追踪、溅射抗性和吸引仇恨不属于此问题。

### CA-02：小字条件被抹平，三个增量不能当默认总值
原表Acrobat的+5、Phoenix的+1.5与+20都用small。本站HTML为普通“10+5秒”“3+1.5秒”“40+20层”，无small、无条件注释；页脚只有数据源和免责声明。依据Solar第24行Solace：“Restoration and Radiant effects last50% longer on the user”;“base duration alongside Ember of Solace's benefit in smaller text”，和第12行Ashes：“base number alongside Ember of Ashes' benefit in smaller text”。因此+5/+1.5是抚慰余烬效果，+20是骨灰余烬效果，而非默认量。特技闪身同时提自己与盟友，尤须避免读成施法者装碎片就让全体盟友默认15秒；来源强调“on the user”。同样风险在烈日另页2979486801增强可见。

### CA-03：Phoenix增强条件active被通用增强标题误写为装配条件
原表Class Abilities第16行与Solar第73行均明确“While Heat Rises is active”。实际两页都用“装上炙热升腾之后”，子行正文没有补“激活期间”。这不是索引名有增强项就算语义完整。字段enhanced.by只表达装配星相身份，不足以承载原表效果激活条件；报告需说明其呈现误导，而不是为武器/技能硬编码修法。

### CA-04：凤凰俯冲5米/6.5米是两份DDC原句差别，不可猜模式或版本
Class Abilities gid527596209第16行：“enemies within5 metres upon landing”；Solar gid1186062409第73行：“enemies within6.5 metres upon landing”。本站职业技能1444664836增强实际5米；烈日2979486801增强实际6.5米，各自匹配对应原表。基础9米Cure、100伤害、40+20灼烧、3+1.5恢复、79.6秒/0.8×两来源相同，没有明确标签称这两个范围分别是PvE/PvP、Solar/Prismatic差异或版本差异。两hash英文名都是Phoenix Dive，没有sameAs；hash不同本身不能证明范围区别。应独立记录为源表冲突待确认，不能统一改成一个“确定实测值”。

### CA-05：赌徒闪身少了明确上限措辞
原句“up to100% [35%] ... at100 Melee Stat”；本站写“100点近战属性时提供100% [35%]”，却不保留“最多”，前句“每点…提供1% [0.35%]”可能被读成100以上继续线性。计为上限措辞遗漏，不猜近敌翻倍与能量最终封顶之间如何结算。

### CA-06：集结屏障原表自身抗性分类措辞不严
DDC Rally写“90% ... against Combatants,and ?% against Boss Combatants”；Towering明确“Non-Boss Combatants”。本站集结忠实保留“战斗人员90%、首领?%”，但Combatants包含Boss的语言歧义尚在。不是可凭另一条目直接断定的本站数值错误，需标成原表疑点；巍峨条目已经正确保留“非首领”。

### CA-07：两屏障的未知PvP量保留了未知，但丢掉模式着色
DDC两条穿越伤害“? [?]”中首个?蓝色、[?]红色。本站两个问号均为unsure（HTML第二个为span.unsure而非pvp），数字未知没有被擅造，但方括号项的PvP语义没有用既有pvp标记表达。属于呈现差异，宜同时保留未知和PvP身份。推进器追踪?、首领抗性?、距离?、间隔?、裂痕移动速度?都已保留。

### CA-08：烈日另页Phoenix“改为施加”多出替代关系
此项仅交叉审计，不将本轮扩大为Solar修复。Solar第73行先写Cure x2，再在Heat Rises active项写“Applies Restoration x2”；没有“instead”“replaces”。2979486801.enhanced[0].realgame_details及实际Solar HTML却写“俯冲改为施加2层恢复”，容易理解为不再给予基础Cure。职业技能1444664836增强没有“改为”，这一点更忠实。仅原句不能支持用恢复替换治愈。

## 源表有本站无、本站有源表无、模式与全局说明

- Class Abilities未展示的实质条目：0；未映射：0；3条分隔与标题并非缺失机制内容。
- 原表小字增量的身份、Phoenix激活条件、赌徒up to上限均不能用数值集合相同抵销，详CA-02/03/05。
- 本站额外关系：Solar Phoenix“改为”详CA-08。职业技能页没有其他发现的额外机制断言；共享屏障与裂痕动画说明、护盾FIFO、弹药倍率加算均有对应原句。
- 基础冷却/Scalar9组全对应；特技闪身148.4为红色PvP，不作为PvE值。其他八技能冷却原表未另给模式值，本站没有凭空补值。
- 凤凰俯冲增强伤害100原表为中性白字，没有独立PvP数，本站没有凭算术补PvP伤害；不要把5/6.5拆成模式范围。
- 两个屏障非致命伤害量及周期、后方作用距离、前方仇恨距离、首领抗性均未知；推进器追踪是否移除本来带?；两裂痕动画移动速度?。这些本次均已读到并保留为未知，不报告为已测值。
- Class Abilities快照没有独立“Solar Effects范围”规则；解释小字的Solace/Ashes来自Solar，不假装Class Abilities原表本身提供页内脚注。本站职业技能页没有这份脚注，故它独立阅读时增量意义确实缺失。
- Solar第79行Daybreak另有强化Phoenix6米/最大642 [220?]/最小292 [?]/60+30灼烧/最大衰减45%及超能伤害提升，本站Solar的黎明条目已有对应说明；它不属于普通凤凰俯冲，不能拿6米消解上述5/6.5冲突。此处只确认相关说明归属，不对Daybreak其余机制做完整审计。

## 交付与未执行项

本报告为当前生成页面的只读语义审计，不自行执行职业分支修复。没有修改记录、源稿、HTML或日志，没有测试/构建/lint/formatter/浏览器/部署/提交/推送。当前工具无write，未创建local文件；父代理可将本report完整保存为local://class-abilities-audit.md。后续若另行批准修复，应由InventoryRepairs处理正文与enhanced字段、由呈现owner处理通用条件/小字呈现，父代理最终统一构建与验证。