# DDC 订正前后对比报告

日期：2026-10-08。按用户要求，弹药搜寻者保留本站规则；其他上一轮审计发现按 Destiny Data Compendium 当前条目订正。修改的是资料来源同步与翻译，不宣称游戏内复测，也不把所有差异称为近期平衡变更。

## 保留项、适用范围与待核实差异

- **搜寻者不变**：特殊、威能均保留本站 1.25× / 1.4× / 1.5×。整条 minted/4294967296 与订正前完全相同。
- **灼烧无冲突**：`2.7 + 0.175 × 层数` 是 PvE 公式，1／30／50／60／80 层对应的 3／5／6.5／7.21／8.64 是 PvP 每跳伤害，不是该公式的验算示例。按用户指出的口径修正，并读取 DDC 原始富文本：公式为 `#a4c2f4`，PvP 数值及 2.3 秒／0.04 秒衰减数据为 `#ea9999`。页面明确区分 PvE／PvP，使用现有 `{pvp|…}` 标记，已撤销错误冲突提示。
- **暴雷之触**：重新核对原始富文本后，手雷段的 4 米/秒、158 伤害与星相段的 5.5 米/秒、164 伤害均为 PvE 蓝色数据；两段的 PvP 数值都为 [3] 米/秒、[30] 伤害。这不是把 PvE 和 PvP 混在一起产生的差异。仍采用星相详细条目（4.5+1.5 秒、1.6 秒后5.5[3]米/秒、164[30]伤害），保留重复条目差异的说明，不认定游戏实际行为。
- **罗蕾莱强化烈焰战锤**：原始富文本同一罗蕾莱段落同时写35秒与每秒3.63%，两者均为 `#ffd966` 超能数据，未标为 PvP 分支。按源保留；两者的对应关系仍需核对，不凭算术推导替换源值。本条只是报告中的待核实说明，不宣称页面存在额外冲突警告。
- **冰影碎片**：已有 traits.enhanced 的大型20点生命值保留；三个Harvest详细条目仍按源保留问号。富文本中20与问号都属于生命值说明，不是已识别的 PvE／PvP 两套数值；问号表示未知，不能当作与20相矛盾的已知值。
- **凤凰俯冲**：职业技能表写5米，烈日表写6.5米，均未标为 PvP 专属范围。本站各自匹配对应来源，均不改；仅记录跨表文字不同，不擅自推定为 PvE／PvP 分支。
- **反应冲击、凉意袭人、solo**：准确翻译源表，不创作源未写明的周期、失效范围或最后存活者条件；具体见字段对比。
- **职业金之灵**：恢复7条正文的主键归属并移除废弃跨主键右栏副本。多数插件正文原已正确，因此归属清理不等同于线上正文全面错位；另将噬星者之灵在实际读取的插件正文中，从仅灼烧扩展为源表的全部烈日效果。
- **独立技能冷却表**：references/docs/ability-cooldown.md 来自 Ability Cooldowns & Scalers，PvE按职业区分猎人/泰坦118.7秒、术士107.9秒；本轮DDC实体基础冷却改为107.9秒，不覆盖另一数据源的整张属性表。
- **回旋喝彩**：上一轮提到的207%/104%相邻档增幅经算术核对分别对应(3303−1076)/1076、(6728−3303)/3303，未确认另有应修改的差异，不凭印象改动。

本轮口径纠正核对的是保留内联颜色与上标的原始富文本，而不是 CSV：[烈日](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/htmlview/sheet?headers=true&gid=1186062409)、[电弧](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/htmlview/sheet?headers=true&gid=618967225)、[冰影](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/htmlview/sheet?headers=true&gid=1088259962)、[职业技能](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/htmlview/sheet?headers=true&gid=527596209)。不同 PvE／PvP 模式、版本或强化条件下的数据不互相验算；CSV 丢失格式时，不凭相邻位置判定源内矛盾。

## 修改规模


| 文件 | 变更记录 | 最终变更字段 |
|---|---:|---:|
| `data/inventory-items.json` | 52 | 52 |
| `data/sandbox-perks.json` | 62 | 94 |
| `data/traits.json` | 3 | 3 |

共117条实体记录、149个最终字段差异；其中包含跨主键废弃字段删除，不等于148项平衡改动。下列文本去掉着色标记便于阅读，保留数值、问号与规则；结构字段按JSON展示。

## 实体字段逐项对比

### 利刃专注 · `109046536` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A3 AND；源仅说命中，非限战斗人员。

**修正前**

```text
刀剑格挡 1.35 秒后：

获得“利刃专注就绪”，持续 1 秒。  
此时挥刀或命中战斗人员会消耗“利刃专注就绪”，并获得“利刃专注”，持续 7 秒。

利刃专注：

- 10% 额外刀剑伤害
- 100% 额外刀剑前冲距离
- 战斗冥想提供的能量增多，变为 8% 手雷和职业技能能量

利刃专注将在格挡或收起刀剑时失效。
```

**修正后**

```text
刀剑格挡 1.35 秒后：

获得“利刃专注就绪”，持续 1 秒。  
此时挥刀并命中目标会消耗“利刃专注就绪”，并获得“利刃专注”，持续 7 秒。

利刃专注：

- 10% 额外刀剑伤害
- 100% 额外刀剑前冲距离
- 战斗冥想提供的能量增多，变为 8% 手雷和职业技能能量

利刃专注将在格挡或收起刀剑时失效。
```

### 坏死之灵 · `1553686800` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
放置裂痕 1 秒后：
 触发一道电弧冲击波，在 7.5 米半径内造成 400[100] 点电弧伤害并打断动作。
 之后每 5 秒再触发一道，直到裂痕消失。
 
 装备电弧超能技能时，冲击波附带致盲。
```

**修正后**

```text
（字段不存在／已删除）
```

### 坏死之灵 · `1553686800` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
晚星之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 锇素之灵 · `1553686801` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
处于焕光状态，或站在光焰之井或强能裂痕上时：
 武器每次命中提供 5% 固定手雷技能能量。
 两次获取之间有 0.4 秒冷却。
 武器击杀提供 15% 固定手雷技能能量。
```

**修正后**

```text
（字段不存在／已删除）
```

### 锇素之灵 · `1553686801` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
星火之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 纤维之灵 · `1553686803` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
摧毁缠结时：
 生成 2 只线虫。
```

**修正后**

```text
（字段不存在／已删除）
```

### 纤维之灵 · `1553686803` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
虫群之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 雄鹿之灵 · `1553686804` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
额外提供一次近战技能充能。
```

**修正后**

```text
（字段不存在／已删除）
```

### 雄鹿之灵 · `1553686804` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
利爪之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 神化之灵 · `1553686806` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
用与超能同元素的武器击杀时：
 按战斗人员档位提供额外超能能量。
 红血 = 1.5%｜橙血 = 2%｜初级首领 = ?%｜首领 = 2.5%｜守护者 = ?%
```

**修正后**

```text
（字段不存在／已删除）
```

### 神化之灵 · `1553686806` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
和谐之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 晚星之灵 · `1553686807` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
站在自己创造的裂痕内的守护者获得 25%[5%] 伤害抗性。
 裂痕与光焰之井重叠或位于其中时，该抗性在光焰之井里同样生效。
```

**修正后**

```text
放置裂痕 1 秒后：
 触发一道电弧冲击波，在 7.5 米半径内造成 400[100] 点电弧伤害并打断动作。
 之后每 5 秒再触发一道，直到裂痕消失。
 
 装备电弧超能技能时，冲击波附带致盲。
```

### 晚星之灵 · `1553686807` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
额外提供一次近战技能充能。
```

**修正后**

```text
（字段不存在／已删除）
```

### 晚星之灵 · `1553686807` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
利爪之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 噬梦者 · `1567556261` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认源不确定性。

**修正前**

```text
对橙血或更高级战斗人员使用终结技时：

获得吞食，持续 6+3 秒。

当吞食生效时：

获得 20% 对战斗人员减伤。
```

**修正后**

```text
对橙血或更高级战斗人员使用终结技时：

获得吞食，持续 6+3 秒。

当吞食生效时：

获得 20?% 对战斗人员减伤。
```

### 光子耀斑 · `1704472354` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
用电弧击杀疲惫或割裂状态的战斗人员时：

触发一次致盲爆发，致盲 5 米内的战斗人员。
触发有 6 秒冷却时间。
```

**修正后**

```text
用电弧击杀疲惫或割裂状态的战斗人员时：

触发一次致盲爆发，致盲 5? 米内的战斗人员。
触发有 6? 秒冷却时间。
```

### 集体之力 · `17188253` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A11 治疗裂痕例外；待确认源保留问号。

**修正前**

```text
在任意元素增益生效时造成 5 次伤害：

生成一个含有 0.8% 超能能量的能量球。  
产生能量球后，1 秒内不会再对伤害计数。  
每次计数间隔至少为 0.8 秒，即 Perk 至少需要 4 秒触发。 
连续触发至少需要等待 5 秒才能再次生效。

对无敌战斗人员造成伤害也算入计数。

元素增益：

- 增幅、电光充能
- 治愈、焕光、恢复
- 吞食、隐身、覆盖护盾
- 冰霜护甲
- 织造铠甲
```

**修正后**

```text
在任意元素增益生效时造成 5 次伤害：

生成一个含有 0.8?% 超能能量的能量球。  
产生能量球后，1 秒内不会再对伤害计数。  
每次计数间隔至少为 0.8 秒，即 Perk 至少需要 4 秒触发。 
连续触发至少需要等待 5 秒才能再次生效。

对无敌战斗人员造成伤害也算入计数。

元素增益：

- 增幅、电光充能
- 治愈、焕光、恢复
- 吞食、隐身、覆盖护盾
- 冰霜护甲
- 织造铠甲

站在治疗裂痕内也可满足触发条件。
```

### 光明虫群 · `1836665910` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A8 伤害归类；保留源半径不确定性。

**修正前**

```text
拾取能量球时：

延长“典礼”持续时间至 30 秒。

“典礼”激活时：

造成 2 次技能最后一击会生成一只电弧忠诚飞蛾，存在 8 秒。  
电弧忠诚飞蛾会持续飞向 60+ 👀 米内最近的战斗人员，在 6 米范围内施加致盲 8 秒，并造成最高 180 电弧伤害。  
可消耗电光充能的东西也计入最后一击，包括未充能近战、先驱者巨岩手雷，但不包括英勇利刃 😐。
```

**修正后**

```text
拾取能量球时：

延长“典礼”持续时间至 30 秒。

“典礼”激活时：

造成 2 次技能最后一击会生成一只电弧忠诚飞蛾，存在 8 秒。  
电弧忠诚飞蛾会持续飞向 60+ 👀 米内最近的战斗人员，在约 6? 米范围内施加致盲 8 秒，并造成最高 180 电弧伤害。  
可消耗电光充能的东西也计入最后一击，包括未充能近战、先驱者巨岩手雷，但不包括英勇利刃 😐。

飞蛾伤害属于一般电弧伤害，不受手雷、近战或技能增益加成，也不与这些增益互动。
```

### 发热寒颤 · `1916452735` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
在 3 秒内对同一目标造成多次精准命中时：
烈日武器：获得焕光，持续 10 +5 秒。
冰影武器：获得一层冰霜护甲。

触发后有 1.5 秒冷却，冷却期间的额外命中不计。

多次精准命中的次数要求：
（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。
```

**修正后**

```text
在 3 秒内造成多次精准命中时：
烈日武器：获得焕光，持续 10 +5 秒。
冰影武器：获得一层冰霜护甲。

触发后有 1.5 秒冷却，冷却期间的额外命中不计。

多次精准命中的次数要求：
（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。
```

### 乘胜追击 · `193266676` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
击破战斗人员护盾：

+20 稳定性，
+20 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

**修正后**

```text
击破战斗人员护盾：

+20 稳定性，
+20? 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

### 满溢金库 · `2162040231` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A4 源未观察到效果。

**修正前**

```text
**>> 熔炉竞技场中禁用 <<　智谋可用**

当持有 5 层或更多“无尽贪婪”时：

能量球额外提供 +?% 超能能量。  
元素拾取物提供的对应能量显著提升。

- 焰灵（+120%）｜11.25% → 25% 手雷能量
- 离子轨迹（+100% 职业、+85% 手雷/近战）｜11.25% 手雷/近战 + 13.5% 职业 → 21% 手雷/近战 + 27% 职业 + 2% 超能
- 虚空裂口（+120%）｜11.25% → 25% 职业技能能量
- 冰影碎片（+260%）｜10% → 36% 近战能量。配合仇恨之吟 +60% 拾取获得的近战能量，每次拾取总计可得 42.5%。
- 缚丝缠结｜350% 额外伤害。也作用于回旋流涡！

拥有 5 层或更多“无尽贪婪”濒死时：

消耗所有层数生成 4 枚能量球，每枚包含约 3.15% 超能能量。  
能量球将高速从穿戴者前方喷出，极有可能穿过墙壁。

向上/向下转动视角不会影响能量球喷发的方向。  
友方守护者也会获得能量球。
```

**修正后**

```text
**>> 熔炉竞技场中禁用 <<　智谋可用**

当持有 5 层或更多“无尽贪婪”时：

对能量球没有可观察到的效果。  
元素拾取物提供的对应能量显著提升。

- 焰灵（+120%）｜11.25% → 25% 手雷能量
- 离子轨迹（+100% 职业、+85% 手雷/近战）｜11.25% 手雷/近战 + 13.5% 职业 → 21% 手雷/近战 + 27% 职业 + 2% 超能
- 虚空裂口（+120%）｜11.25% → 25% 职业技能能量
- 冰影碎片（+260%）｜10% → 36% 近战能量。配合仇恨之吟 +60% 拾取获得的近战能量，每次拾取总计可得 42.5%。
- 缚丝缠结｜350% 额外伤害。也作用于回旋流涡！

拥有 5 层或更多“无尽贪婪”濒死时：

消耗所有层数生成 4 枚能量球，每枚包含约 3.15% 超能能量。  
能量球将高速从穿戴者前方喷出，极有可能穿过墙壁。

向上/向下转动视角不会影响能量球喷发的方向。  
友方守护者也会获得能量球。
```

### 傀儡捕食者 · `2264837439` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:html&gid=441434520)

处理：Equipment Taken种族误译。

**修正前**

```text
对智谋入侵者与堕落者战斗人员伤害提高 25%。
```

**修正后**

```text
对智谋入侵者与傀儡战斗人员伤害提高 25%。
```

### 主要幸存者 · `2562518502` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认solo中性直译，不等同最后存活者。

**修正前**

```text
友军阵亡时：

获得一层“主要幸存者”，持续 ? 秒。  
作为最后的守护者时获得 ? 层“主要幸存者”。

- 主要幸存者 x1｜使主武器 +? 操控性、+? 填装速度、+? 辅助瞄准，并获得 ?% 抖动抗性。
- 主要幸存者 x2｜使主武器 +? 操控性、+? 填装速度、+? 辅助瞄准，并获得 ?% 抖动抗性。
```

**修正后**

```text
友军阵亡时：

获得一层“主要幸存者”，持续 ? 秒。  
单人行动时获得 ? 层“主要幸存者”。

- 主要幸存者 x1｜使主武器 +? 操控性、+? 填装速度、+? 辅助瞄准，并获得 ?% 抖动抗性。
- 主要幸存者 x2｜使主武器 +? 操控性、+? 填装速度、+? 辅助瞄准，并获得 ?% 抖动抗性。
```

### 动能冲击 · `2612719899` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：源没有该确定限制，删除。

**修正前**

```text
在 3 秒内用威能榴弹发射器造成 3 次非同时伤害，或用主武器／特殊榴弹发射器造成单次非致命伤害：

在战斗人员脚下触发一次冲击波，造成 227×2 = 454 点动能伤害，并在 7 米范围内踉跄并眩晕势不可挡勇士。
来自主武器与特殊榴弹发射器的冲击波只造成 150×2 伤害。
冲击波无伤害衰减；两次结算之间有 1 秒冷却时间。

造成榴弹发射器伤害时：
获得一层快速冲击，持续 5 秒，最多叠加 5 层。
填装速度：+5 | +10 | +15? | +20? | +30
填装持续时间倍率：0.99× | 0.99× | 0.98× | 0.96× | 0.94×

可以被除了激涌和武器属性之外的增益加成。
```

**修正后**

```text
在 3 秒内用威能榴弹发射器造成 3 次非同时伤害，或用主武器／特殊榴弹发射器造成单次非致命伤害：

在战斗人员脚下触发一次冲击波，造成 227×2 = 454 点动能伤害，并在 7 米范围内踉跄并眩晕势不可挡勇士。
来自主武器与特殊榴弹发射器的冲击波只造成 150×2 伤害。
冲击波无伤害衰减；两次结算之间有 1 秒冷却时间。

造成榴弹发射器伤害时：
获得一层快速冲击，持续 5 秒，最多叠加 5 层。
填装速度：+5 | +10 | +15? | +20? | +30
填装持续时间倍率：0.99× | 0.99× | 0.98× | 0.96× | 0.94×
```

### 寒脑凝滞 · `2612719903` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
被冻结的战斗人员会对 4 米内尚未受冰影减益影响的战斗人员施加 x? 减速。
```

**修正后**

```text
被冻结的战斗人员会对 4? 米内尚未受冰影减益影响的战斗人员施加 x? 减速。
```

### 卡利班之灵 · `2644022224` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
额外提供一次职业技能充能。
```

**修正后**

```text
（字段不存在／已删除）
```

### 卡利班之灵 · `2644022224` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
郊狼之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 觅敌者之灵 · `2644022225` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用职业技能时：
 获得 2 层治愈。
 
 每 3 秒内连续击杀把计数推满 100%：
 红血 = 34%｜橙血及以上与守护者 = 50%
 获得 1 层燃烧之魂，持续 10 秒，最多 3 层。
 全部层数同时到时。重新触发燃烧之魂会刷新时长。
 
 燃烧之魂：职业技能的治疗效果被强化，并扩散到 15? 米内的盟友：
 1 层 = 3 层治愈。
 2 层 = 1 层治愈加 1 层恢复，持续 3 秒。
 3 层 = 2 层治愈加 1 层恢复，持续 5 秒。
 若恢复已在生效，则按对应时长延长。
```

**修正后**

```text
（字段不存在／已删除）
```

### 觅敌者之灵 · `2644022225` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
虫骸之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 加拉诺之灵 · `2644022226` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用手雷技能时：
 获得织造铠甲，持续 10 秒。
```

**修正后**

```text
（字段不存在／已删除）
```

### 加拉诺之灵 · `2644022226` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
曲腹蛛之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 巨龙之灵 · `2644022227` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
受到近战伤害，或打出充能近战命中时：
 3 秒内的下一次近战命中获得交叉反击。
 
 交叉反击使基础近战与电弧近战伤害提高 400%。
 交叉反击的近战攻击造成电弧伤害。
```

**修正后**

```text
（字段不存在／已删除）
```

### 巨龙之灵 · `2644022227` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
骗徒之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 矛隼之灵 · `2644022229` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
对橙血、初级首领、勇士、首领或守护者造成技能伤害时：
 获得 4 层与技能同元素的武器激涌，持续 16[11] 秒。
 该增益不可刷新。
```

**修正后**

```text
脱离虚空隐身时：
 获得不稳定弹药，持续 9[3] 秒。
```

### 矛隼之灵 · `2644022229` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用职业技能时：
 获得 2 层治愈。
 
 每 3 秒内连续击杀把计数推满 100%：
 红血 = 34%｜橙血及以上与守护者 = 50%
 获得 1 层燃烧之魂，持续 10 秒，最多 3 层。
 全部层数同时到时。重新触发燃烧之魂会刷新时长。
 
 燃烧之魂：职业技能的治疗效果被强化，并扩散到 15? 米内的盟友：
 1 层 = 3 层治愈。
 2 层 = 1 层治愈加 1 层恢复，持续 3 秒。
 3 层 = 2 层治愈加 1 层恢复，持续 5 秒。
 若恢复已在生效，则按对应时长延长。
```

**修正后**

```text
（字段不存在／已删除）
```

### 矛隼之灵 · `2644022229` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
虫骸之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 曲腹蛛之灵 · `2644022230` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
对橙血、初级首领、勇士、首领或守护者造成技能伤害时：
 获得 4 层与技能同元素的武器激涌，持续 16[11] 秒。
 该增益不可刷新。
```

**修正后**

```text
使用手雷技能时：
 获得织造铠甲，持续 10 秒。
```

### 曲腹蛛之灵 · `2644022230` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用职业技能时：
 获得 2 层治愈。
 
 每 3 秒内连续击杀把计数推满 100%：
 红血 = 34%｜橙血及以上与守护者 = 50%
 获得 1 层燃烧之魂，持续 10 秒，最多 3 层。
 全部层数同时到时。重新触发燃烧之魂会刷新时长。
 
 燃烧之魂：职业技能的治疗效果被强化，并扩散到 15? 米内的盟友：
 1 层 = 3 层治愈。
 2 层 = 1 层治愈加 1 层恢复，持续 3 秒。
 3 层 = 2 层治愈加 1 层恢复，持续 5 秒。
 若恢复已在生效，则按对应时长延长。
```

**修正后**

```text
（字段不存在／已删除）
```

### 曲腹蛛之灵 · `2644022230` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
虫骸之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 复兴之灵 · `2644022231` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
脱离虚空隐身时：
 获得不稳定弹药，持续 9[3] 秒。
```

**修正后**

```text
（字段不存在／已删除）
```

### 复兴之灵 · `2644022231` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
矛隼之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 虫骸之灵 · `2644022235` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
对橙血、初级首领、勇士、首领或守护者造成技能伤害时：
 获得 4 层与技能同元素的武器激涌，持续 16[11] 秒。
 该增益不可刷新。
```

**修正后**

```text
使用职业技能时：
 获得 2 层治愈。
 
 每 3 秒内连续击杀把计数推满 100%：
 红血 = 34%｜橙血及以上与守护者 = 50%
 获得 1 层燃烧之魂，持续 10 秒，最多 3 层。
 全部层数同时到时。重新触发燃烧之魂会刷新时长。
 
 燃烧之魂：职业技能的治疗效果被强化，并扩散到 15? 米内的盟友：
 1 层 = 3 层治愈。
 2 层 = 1 层治愈加 1 层恢复，持续 3 秒。
 3 层 = 2 层治愈加 1 层恢复，持续 5 秒。
 若恢复已在生效，则按对应时长延长。
```

### 虫骸之灵 · `2644022235` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用职业技能时：
 获得 2 层治愈。
 
 每 3 秒内连续击杀把计数推满 100%：
 红血 = 34%｜橙血及以上与守护者 = 50%
 获得 1 层燃烧之魂，持续 10 秒，最多 3 层。
 全部层数同时到时。重新触发燃烧之魂会刷新时长。
 
 燃烧之魂：职业技能的治疗效果被强化，并扩散到 15? 米内的盟友：
 1 层 = 3 层治愈。
 2 层 = 1 层治愈加 1 层恢复，持续 3 秒。
 3 层 = 2 层治愈加 1 层恢复，持续 5 秒。
 若恢复已在生效，则按对应时长延长。
```

**修正后**

```text
（字段不存在／已删除）
```

### 虫骸之灵 · `2644022235` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
虫骸之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 白霜之灵 · `2810944064` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
放置屏障或使用推进器时：
 立即为自己与 12 米内视野可见的盟友回复生命值与护盾。
 屏障回复 160 点生命值与 110 点护盾，推进器回复 30 点生命值。
 两次治疗脉冲之间有 5 秒冷却。
 
 治疗盟友提供 ?%职业技能能量。
```

**修正后**

```text
（字段不存在／已删除）
```

### 白霜之灵 · `2810944064` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
阿尔法·鲁皮之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 断舍之灵 · `2810944065` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
打出充能近战命中时：
 被命中目标 15 米内的战斗人员遭到闪电击中。
 闪电造成 181[50] 点电弧伤害并施加震颤。
```

**修正后**

```text
（字段不存在／已删除）
```

### 断舍之灵 · `2810944065` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
接触之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 中止之灵 · `2810944066` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
用与超能同元素的武器击杀时：
 为自己与 15? 米内的盟友提供 1 层恢复，持续 3+1.5 秒。
 两次触发之间有 3 秒冷却。
```

**修正后**

```text
（字段不存在／已删除）
```

### 中止之灵 · `2810944066` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
伤痕之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 永恒战士之灵 · `2810944067` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
放置屏障时：
 释放 3 道追踪的烈日波形，最远飞行 18.5 米。
 烈日波形造成 480[100] 伤害并施加 60[30] 层灼烧。
 波形命中[击杀]战斗人员时在其脚下生成太阳黑子。
 
 使用推进器时：
 释放一枚烈日球，? 秒后爆炸，呈 X 形放出 4 道烈日波形，效果同上。
```

**修正后**

```text
（字段不存在／已删除）
```

### 永恒战士之灵 · `2810944067` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
号角之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 承负之灵 · `2810944069` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
额外提供一次手雷技能充能。
```

**修正后**

```text
（字段不存在／已删除）
```

### 承负之灵 · `2810944069` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
医疗设备之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 号角之灵 · `2810944070` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
强化勇士之鞭：
 
 屏障：
 多生成 2 条鞭。
 鞭追击战斗人员更加激进，飞行距离增加 ?%。
 
 推进器：
 缠结最长存在 ? 秒，会朝 ? 米内的战斗人员抛掷自身，接触即引爆。
```

**修正后**

```text
放置屏障时：
 释放 3 道追踪的烈日波形，最远飞行 18.5 米。
 烈日波形造成 480[100] 伤害并施加 60[30] 层灼烧。
 波形命中[击杀]战斗人员时在其脚下生成太阳黑子。
 
 使用推进器时：
 释放一枚烈日球，? 秒后爆炸，呈 X 形放出 4 道烈日波形，效果同上。
```

### 号角之灵 · `2810944070` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
用与超能同元素的武器击杀时：
 为自己与 15? 米内的盟友提供 1 层恢复，持续 3+1.5 秒。
 两次触发之间有 3 秒冷却。
```

**修正后**

```text
（字段不存在／已删除）
```

### 号角之灵 · `2810944070` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
伤痕之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 反应冲击 · `2840280304` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：源末句自指Reactive Shock，忠实翻译，不推断新的周期。

**修正前**

```text
当“力量吸收”激活时：

被近战命中时触发一次迷失冲击，眩晕 ? 米内的战斗人员，持续 ? 秒。  
仅在每次力量吸收激活时可触发一次。
```

**修正后**

```text
当“力量吸收”激活时：

被近战命中时触发一次迷失冲击，眩晕 ? 米内的战斗人员，持续 ? 秒。  
每次“反应冲击”激活仅可触发一次。
```

### 极致机动 · `3091068917` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认按源原始距离而非33%。

**修正前**

```text
被动 +20 敏捷、6.25% 冲刺速度加成、33% 滑行距离加成。

译注：等效于各职业跑鞋的加速效果，不会与其叠加——能部分替代踢踢 S、沙丘行者、横断之步，但分别会牺牲跳跃高度加成、充能近战连锁闪电、快速进入冲刺的效果。
```

**修正后**

```text
被动 +20 敏捷，冲刺速度从 8 米/秒提升至 8.5 米/秒，滑行距离从 6.5 米提升至 8.5 米。

译注：等效于各职业跑鞋的加速效果，不会与其叠加——能部分替代踢踢 S、沙丘行者、横断之步，但分别会牺牲跳跃高度加成、充能近战连锁闪电、快速进入冲刺的效果。
```

### 风寒 · `3097906009` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
在 3 秒内对同一目标造成多次非同时的冰影武器伤害时：
获得一层冰霜护甲。

两次触发之间有 0.45 秒冷却，冷却期间的额外命中不计；收起武器时计数器重置。

触发冰霜护甲所需的命中次数：
弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 35%，向下取整）+ 2
无需手持冰影武器，按当前武器的弹匣计算。

在 3 秒内对减速的战斗人员造成多次冰影武器伤害时：
在战斗人员上方生成一个冰影碎片。
所需命中次数为弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 25%，向下取整）+ 2。
```

**修正后**

```text
在 3 秒内造成多次非同时的冰影武器伤害时：
获得一层冰霜护甲。

两次触发之间有 0.45 秒冷却，冷却期间的额外命中不计；收起武器时计数器重置。

触发冰霜护甲所需的命中次数：
弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 35%，向下取整）+ 2
无需手持冰影武器，按当前武器的弹匣计算。

在 3 秒内对减速的战斗人员造成多次冰影武器伤害时：
在战斗人员上方生成一个冰影碎片。
所需命中次数为弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 25%，向下取整）+ 2。
```

### 钢铁信念 · `3157066725` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A1 恢复护盾前不能重触发。

**修正前**

```text
濒死时：

+35 弹药生成属性、?% 抖动抗性，及对 10 米内战斗人员的 15% 减伤，持续 7 秒。  
期间造成的最后一击可刷新效果持续时间。

在任何护盾生命值恢复后，即无法再次触发。

译注：除血条自带护盾外，还包括虚空覆盖护盾、职业技能护盾。
```

**修正后**

```text
濒死时：

+35 弹药生成属性、?% 抖动抗性，及对 10 米内战斗人员的 15% 减伤，持续 7 秒。  
期间造成的最后一击可刷新效果持续时间。

在恢复任何护盾生命值之前，无法再次触发。

译注：除血条自带护盾外，还包括虚空覆盖护盾、职业技能护盾。
```

### 超光速运动 · `3376007202` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认按源值保留问号，不宣称实测削弱。

**修正前**

```text
使用超能造成伤害且移速不为零时：

每秒恢复 30? [15?] 生命值，持续 11 秒。  
继续造成超能伤害可刷新效果持续时间。
```

**修正后**

```text
使用超能造成伤害且移速不为零时：

每秒恢复 2? [?] 生命值，持续 11 秒。  
继续造成超能伤害可刷新效果持续时间。
```

### 丰富弹药 · `3432283356` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A5/A6 补禁用。

**修正前**

```text
“肾上腺素充沛”激活时：

- 消灭红血战斗人员 +3% 特殊弹药进度。
- 消灭橙血或更高级战斗人员 +16% 特殊弹药进度。
- 消灭傀儡橙血或更高级战斗人员 +24% 特殊弹药进度。
- 消灭守护者 +?% 特殊弹药进度。

破坏可摧毁物件与构造体同样可触发效果，并提供 +16% 特殊弹药进度。
```

**修正后**

```text
**>> 熔炉竞技场中禁用 <<**

“肾上腺素充沛”激活时：

- 消灭红血战斗人员 +3% 特殊弹药进度。
- 消灭橙血或更高级战斗人员 +16% 特殊弹药进度。
- 消灭傀儡橙血或更高级战斗人员 +24% 特殊弹药进度。
- 消灭守护者 +?% 特殊弹药进度。

破坏可摧毁物件与构造体同样可触发效果，并提供 +16% 特殊弹药进度。
```

### 合成感受器之灵 · `3465434112` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
使用手雷或职业技能，或造成充能近战伤害时：
 为另外两项技能各提供 1 层强化技能，持续 5 秒，最多 2 层。
 例：造成组合打击伤害 → 手雷与职业技能回复加快。
 
 强化技能：
 1 层 = 基础手雷与近战回复速率额外 +400%[100%]｜2 层 = +800%[200%]。
 1 层 = 基础职业技能回复速率额外 +25%｜2 层 = +50%。
 
 界面上的层数显示与实际生效的技能回复并不一致。
 接上例：近战给出的强化 1 层还没到时就使用职业技能，手雷强化会升到 2 层并刷新时长，近战获得 1 层强化持续 5 秒，而职业技能那一份不会刷新——尽管界面写着强化 2 层。
```

**修正后**

```text
15 米内有 3 名战斗人员时：
 获得生物强化，持续 5 秒。
 
 生物强化：
 近战伤害提高 165%[100%]。
 偃月近战伤害提高 100%。
 
 对守护者使用闪电激涌时效果降低。
```

### 合成感受器之灵 · `3465434112` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
15 米内有 3 名战斗人员时：
 获得生物强化，持续 5 秒。
 
 生物强化：
 近战伤害提高 165%[100%]。
 偃月近战伤害提高 100%。
 
 对守护者使用闪电激涌时效果降低。
```

**修正后**

```text
（字段不存在／已删除）
```

### 合成感受器之灵 · `3465434112` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
合成感受器之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 刺客之灵 · `3465434116` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
超能充满期间拾取能量球：
 获得 1 层光能盛宴，最多 6 层。
 换到另一件带噬星者之灵的异域职业物品时，当前层数保留。
 
 施放超能时：
 消耗全部光能盛宴层数，超能伤害提高，持续 14 秒。
 超能伤害 +18.2%｜+36.4%｜+54.6%｜+59.7%｜+64.8%｜+70%。
 
 部分超能技能收益降低：
 烈焰之歌不吃灼烧效果的伤害提升。
 新星炸弹、雷霆冲击与暮光军火最高 +50% 超能伤害。
 织针风暴最高 +35% 超能伤害。
```

**修正后**

```text
（字段不存在／已删除）
```

### 刺客之灵 · `3465434116` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
噬星者之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 至纯光能之灵 · `3465434117` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
15 米内有 3 名战斗人员时：
 获得生物强化，持续 5 秒。
 
 生物强化：
 近战伤害提高 165%[100%]。
 偃月近战伤害提高 100%。
 
 对守护者使用闪电激涌时效果降低。
```

**修正后**

```text
（字段不存在／已删除）
```

### 至纯光能之灵 · `3465434117` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
合成感受器之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 毒蛇之灵 · `3465434118` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
用与手雷同元素的武器击杀时：
 获得 1 层死亡阵痛，最多 5 层，每层提高手雷技能伤害并每秒额外提供手雷技能能量。
 到时只掉 1 层，不是全部清空。
 获得一层后 2 秒，该层的计时才开始走。
 
 死亡阵痛：
 1 层｜手雷伤害 +40%[20%]，每秒额外 +0.5% 手雷能量，持续 8 秒。
 2 层｜手雷伤害 +55%[40%]，每秒额外 +1% 手雷能量，持续 7 秒。
 3 层｜手雷伤害 +70%[60%]，每秒额外 +1.5% 手雷能量，持续 6 秒。
 4 层｜手雷伤害 +85%[80%]，每秒额外 +2% 手雷能量，持续 5 秒。
 5 层｜手雷伤害 +100%，每秒额外 +2.5% 手雷能量，持续 4 秒。
```

**修正后**

```text
（字段不存在／已删除）
```

### 毒蛇之灵 · `3465434118` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
真理之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 噬星者之灵 · `3465434119` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；DDC Solar Effect不限于灼烧；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
超能结束时：
 获得 4 层与超能同元素的武器激涌，持续 30[6?] 秒。
```

**修正后**

```text
超能充满期间拾取能量球：
 获得 1 层光能盛宴，最多 6 层。
 换到另一件带噬星者之灵的异域职业物品时，当前层数保留。
 
 施放超能时：
 消耗全部光能盛宴层数，超能伤害提高，持续 14 秒。
 超能伤害 +18.2%｜+36.4%｜+54.6%｜+59.7%｜+64.8%｜+70%。
 
 部分超能技能收益降低：
 烈焰之歌不获得烈日效果伤害提升。
 新星炸弹、雷霆冲击与暮光军火最高 +50% 超能伤害。
 织针风暴最高 +35% 超能伤害。
```

### 噬星者之灵 · `3465434119` · `i18n.zh-CN.realgame_details#2`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；DDC Solar Effect不限于灼烧；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
放置屏障时：
 释放 3 道追踪的烈日波形，最远飞行 18.5 米。
 烈日波形造成 480[100] 伤害并施加 60[30] 层灼烧。
 波形命中[击杀]战斗人员时在其脚下生成太阳黑子。
 
 使用推进器时：
 释放一枚烈日球，? 秒后爆炸，呈 X 形放出 4 道烈日波形，效果同上。
```

**修正后**

```text
（字段不存在／已删除）
```

### 噬星者之灵 · `3465434119` · `i18n.zh-CN.右栏`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：Equipment归属恢复；正确原规则与当前DDC吻合；DDC Solar Effect不限于灼烧；废弃矩阵右栏副本属于另一hash；每个之灵自身正文已存在/本轮恢复，删除错归属字段。

**修正前**

```text
号角之灵
```

**修正后**

```text
（字段不存在／已删除）
```

### 主动治疗 · `3599123168` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A2 每脉冲不是每秒。

**修正前**

```text
“主动出击”激活时释放职业技能：

生成一个固定治疗光环，在 7 米半径内每 2 秒恢复一次生命值。生成时立即释放首次治疗脉冲。  
每层“主动出击”使治疗光环每秒恢复 10 点生命值，最多释放 5 次治疗脉冲。  
治疗光环不参与碰撞，但可以阻挡弹道。
```

**修正后**

```text
“主动出击”激活时释放职业技能：

生成一个固定治疗光环，在 7 米半径内每 2 秒恢复一次生命值。生成时立即释放首次治疗脉冲。  
每层“主动出击”使治疗光环每次治疗脉冲恢复 10 点生命值，最多释放 5 次治疗脉冲。  
治疗光环不参与碰撞，但可以阻挡弹道。
```

### 杀戮之风 · `35992461` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
在 3 秒内用武器击杀 3 名战斗人员：

获得 +? 敏捷，持续 7 秒。
再次触发会刷新。
```

**修正后**

```text
在 3 秒内用武器击杀 3 名战斗人员：

获得 +50? 敏捷，持续 7 秒。
再次触发会刷新。
```

### 诅咒铁拳 · `3872620150` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A12 误译。

**修正前**

```text
造成近战最后一击时：

使战斗人员发生诅咒爆炸，在 4.5 米的范围内造成最高 ? [?] 电弧（?）伤害。  
僵尸近战也可触发。  
两次触发间内置 0.5? 秒冷却。
```

**修正后**

```text
造成近战最后一击时：

使战斗人员发生诅咒爆炸，在 4.5 米的范围内造成最高 ? [?] 电弧（?）伤害。  
偃月近战也可触发。  
两次触发间内置 0.5? 秒冷却。
```

### 跃步直击 · `3916960436` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A9 触发类别、时长与减益。

**修正前**

```text
使用刀剑、偃月近战或近战技能对战斗人员造成伤害时：

施加疲惫，持续 ? 秒。
```

**修正后**

```text
使用刀剑、偃月或近战攻击对目标造成伤害时：

施加疲惫，持续 5 秒，使战斗人员造成的伤害降低 25%。
```

### 光铸电涌 · `4048287940` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认源不确定性。

**修正前**

```text
生命值不满时获得任意治疗：

+20 操控性、+10 填装速度、0.85× 填装动作倍率，烈日武器获得 ?% 抖动抗性，持续 4 秒。  
任何来源的治疗均生效，包括拾取能量球。恢复可持续刷新此效果。
```

**修正后**

```text
生命值不满时获得任意治疗：

+20? 操控性、+10 填装速度、0.85× 填装动作倍率，烈日武器获得 ?% 抖动抗性，持续 4 秒。  
任何来源的治疗均生效，包括拾取能量球。恢复可持续刷新此效果。
```

### 烧灼止血 · `4048287941` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认源不确定性。

**修正前**

```text
在 3 秒的间隔内造成 3 次烈日最后一击：

恢复 30 生命值。  
两次治疗间内置 1 秒冷却。
```

**修正后**

```text
在 3? 秒的间隔内造成 3 次烈日最后一击：

恢复 30 生命值。  
两次治疗间内置 1 秒冷却。
```

### 灵脉馈赠 · `4083289735` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认源不确定性。

**修正前**

```text
在 5 秒的间隔内累计造成 3 次虚空最后一击：

生成一道虚空裂口。
```

**修正后**

```text
在 5? 秒的间隔内累计造成 3 次虚空最后一击：

生成一道虚空裂口。
```

### 网络管理员 · `4110483281` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认Network Admin距离问号；A10 受益人为穿戴者。

**修正前**

```text
15 米内存在友军时：

+? 操控性、+? 填装速度。  
使 15 米内的友方网络管理员 +? 生命值属性。
```

**修正后**

```text
15? 米内存在友军时：

+? 操控性、+? 填装速度。  
15 米内存在友方网络管理员时，穿戴者获得 +? 生命值属性。
```

### 凉意袭人 · `4192675786` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
对冰影减益战斗人员取得冰影击杀时：
在 6 米范围内触发一次减速爆发。

减速爆发：
对战斗人员施加 x20 减速，持续 2? +? 秒。
为使用者与盟友提供 x? 冰霜护甲。

冰霜护甲部分实测无效。
```

**修正后**

```text
对冰影减益战斗人员取得冰影击杀时：
在 6 米范围内触发一次减速爆发。

减速爆发：
对战斗人员施加 x20 减速，持续 2? +? 秒。
为使用者与盟友提供 x? 冰霜护甲。

没有效果。
```

### 乘胜追击 · `4192675789` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
击破战斗人员护盾：

+20 稳定性，
+20 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

**修正后**

```text
击破战斗人员护盾：

+20 稳定性，
+20? 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

### 滑行搜刮 · `4261390988` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A13 拾取物种类；不外推微粒纹章范围。

**修正前**

```text
滑行时：

拾取 15 米内的弹药盒。  
+25 操控性、+25 填装速度，持续 10 秒。
```

**修正后**

```text
滑行时：

拾取 15 米内的弹药盒，也会拾取微粒和纹章。  
+25 操控性、+25 填装速度，持续 10 秒。
```

### 滑行射击 · `4261390989` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认按源距离。

**修正前**

```text
使用武器造成伤害时：

延长 33% 滑行距离，持续 3? 秒。

滑行时：

50% [10%] 减伤（抵抗 x4）。
```

**修正后**

```text
使用武器造成伤害时：

滑行距离从 6.5 米提升至 8.5 米，持续 3? 秒。

滑行时：

50% [10%] 减伤（抵抗 x4）。
```

### 拉斯普廷的怒火 · `4287944422` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认Explosive Damage类别。

**修正前**

```text
使用非直接命中、烈日技能、第七炽天使/似像者武器、睡者之吼、全面爆发造成最后一击时：

获得一层“战争思维充能”，持续 10 秒，最多叠至 10 层。  
在过期时失去所有层数。

每层“战争思维充能”提供 +3 手雷属性和 +3 武器属性，10 层时达到 +30 手雷属性、+30 武器属性。
```

**修正后**

```text
使用爆炸伤害、烈日技能、第七炽天使/似像者武器、睡者之吼、全面爆发造成最后一击时：

获得一层“战争思维充能”，持续 10 秒，最多叠至 10 层。  
在过期时失去所有层数。

每层“战争思维充能”提供 +3 手雷属性和 +3 武器属性，10 层时达到 +30 手雷属性、+30 武器属性。
```

### 强化武装 · `627214276` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A14 时长。

**修正前**

```text
主武器对迷失的战斗人员造成 15% 额外伤害。  
对电弧致盲不生效。
```

**修正后**

```text
主武器对迷失的战斗人员造成 15% 额外伤害。  
迷失的持续时间短于动画，通常约为 2.7 秒。  
对电弧致盲不生效。
```

### 强化爆破 · `627214277` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A7 例外。

**修正前**

```text
手雷技能爆炸时：

使 10 米内的战斗人员迷失，持续 2.7 秒。  
对抓钩无效。
```

**修正后**

```text
手雷技能爆炸时：

使 10 米内的战斗人员迷失，持续 2.7 秒。  
对抓钩及年幼阿罕卡拉之脊的绊雷无效。
```

### 刀剑风暴连击 · `679036011` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：源无此确定限制，按源删除。

**修正前**

```text
连续 3 次轻攻击后再打出一次重攻击：
获得刀剑风暴连击，持续 5 秒。
额外的刀剑击杀会刷新该效果。

刀剑风暴连击：
自动对使用者周围 6 米内的战斗人员每 0.53 秒造成 103 [?] 点刀剑动能伤害并施加迷惑，持续 3 秒。
距离小于 4 米时，伤害最多提高 15%。

只受银白利刃加成。
```

**修正后**

```text
连续 3 次轻攻击后再打出一次重攻击：
获得刀剑风暴连击，持续 5 秒。
额外的刀剑击杀会刷新该效果。

刀剑风暴连击：
自动对使用者周围 6 米内的战斗人员每 0.53 秒造成 103 [?] 点刀剑动能伤害并施加迷惑，持续 3 秒。
距离小于 4 米时，伤害最多提高 15%。
```

### 狙击手冥想 · `679036012` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：护甲待确认对应sandbox，按当前源原句、不添加确定规则。

**修正前**

```text
狙击步枪命中时：
获得一层狙击手冥想，持续 7 秒。
威能狙击步枪命中获得 2 层。
狙击手冥想在收起武器后仍然保留。

狙击手冥想按层数提高伤害、稳定性与填装速度：
伤害：2.8% | 5.7% | 9% | 12% | 15%
稳定性：+? | +? | +? | +? | +?
填装速度：+15 | +30 | +35 | +40 | +45
```

**修正后**

```text
狙击步枪直接命中时：
获得一层狙击手冥想，持续 7 秒。
威能狙击步枪命中获得 2 层。
狙击手冥想在收起武器后仍然保留。

狙击手冥想按层数提高伤害、稳定性与填装速度：
伤害：2.8% | 5.7% | 9% | 12% | 15%
稳定性：+? | +? | +? | +? | +?
填装速度：+15 | +30 | +35 | +40 | +45
```

### 再补给 · `793561548` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：待确认源不确定性。

**修正前**

```text
造成最后一击会生成包含 1% 超能能量的能量球，并给予 +20% 特殊弹药进度、+20% 威能弹药进度。  
再次触发具有 12 秒内置冷却。
```

**修正后**

```text
造成最后一击会生成包含 1?% 超能能量的能量球，并给予 +20% 特殊弹药进度、+20% 威能弹药进度。  
再次触发具有 12 秒内置冷却。
```

### 来自风暴 · `793561549` · `i18n.zh-CN.realgame_details`

文件：`data/sandbox-perks.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1287885342)

处理：A5/A6 补禁用。

**修正前**

```text
保持未受到或造成伤害 12 秒后：

每 3 秒获得一层冰霜护甲。  
最多叠至 5 层，每 3 秒刷新其持续时间。
```

**修正后**

```text
**>> 熔炉竞技场中禁用 <<**

保持未受到或造成伤害 12 秒后：

每 3 秒获得一层冰霜护甲。  
最多叠至 5 层，每 3 秒刷新其持续时间。
```

### 灼烧 · `1096356879` · `i18n.zh-CN.realgame_details`

文件：`data/traits.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409)

**修正前**

```text
灼烧的战斗人员在 0.5 秒后开始受伤，此后每 0.56 秒跳一次伤害（第 2 跳有 0.93 秒延迟）。
 层数攒到 100 层时清空并触发点燃。
 
 每跳伤害 = 2.7 + 0.075 × 层数，非首领战斗人员再提高 20%：
 1 层 = 3 ｜ 30 层 = 5 ｜ 50 层 = 6.5 ｜ 60 层 = 7.21 ｜ 80 层 = 8.64。
 灼烧伤害不致命。
 攒到 60 层以上时每跳多打 2.5%，界面上显示为黄色伤害数字。
 
 衰减：
 持续 2.3 秒后开始掉层，每 0.04 秒掉 1 层（约 25 层/秒），具体随难度浮动。
```

**修正后**

```text
灼烧的战斗人员在 0.5 秒后开始受伤，此后每 0.56 秒跳一次伤害（第 2 跳有 0.93 秒延迟）。
 层数攒到 100 层时清空并触发点燃。
 
 PvE 每跳伤害 = 2.7 + 0.175 × 层数，非首领战斗人员再提高 20%。
 
 PvP 每跳伤害：1 层 = 3 ｜ 30 层 = 5 ｜ 50 层 = 6.5 ｜ 60 层 = 7.21 ｜ 80 层 = 8.64。
 PvP 中，灼烧伤害不致命。
 攒到 60 层以上时每跳多打 2.5%，界面上显示为黄色伤害数字。
 
 衰减：
 持续时间与衰减速率随难度变化。
 PvP 中，持续 2.3 秒后开始掉层，每 0.04 秒掉 1 层（约 25 层/秒）。
```

### 焕光 · `157469667` · `i18n.zh-CN.realgame_details`

文件：`data/traits.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409)

**修正前**

```text
武器伤害提高 20% [10%]，持续 10 秒，默认最长可延到 15 秒。黄金枪的伤害同样受它影响。
 
 重新施加焕光会把持续时间刷新到此前达到过的最长值。
 焕光激活期间对勇士的武器伤害额外提高 10%。
```

**修正后**

```text
武器伤害提高 20% [10%]，持续 10 秒，默认最长可延到 15 秒。黄金枪的伤害同样受它影响。
 
 重新施加焕光会把持续时间刷新到此前达到过的最长值。
 对勇士的武器伤害提高 30%；光焰之井的 25% 增伤会覆盖这份 30% 增伤。
```

### 线虫 · `2724747993` · `i18n.zh-CN.realgame_details`

文件：`data/traits.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1870531554)

**修正前**

```text
缚丝召唤物，追逐 20? 米内的战斗人员，在 ? 米内跃向目标。
 
 接触或跃起后爆炸，在小范围内最多造成 366 [35] 伤害。
 接触前丢失目标的线虫会落地另寻战斗人员，而不是自爆。
 线虫的伤害计入其生成来源，但一旦停栖就失去这层继承关系。
 
 术士互动：
 未开始追踪战斗人员的线虫飞行 14 米后返回并停栖，最多 5 只。
 造成武器伤害或近战命中时逐只释放，每次释放间隔 0.5 秒。
 以这种方式释放的线虫可以在任意射程追踪。
```

**修正后**

```text
缚丝召唤物，追逐 20? 米内的战斗人员，在 ? 米内跃向目标。
 
 接触或跃起后爆炸，在小范围内最多造成 366 [35] 伤害。
 接触前丢失目标的线虫会落地另寻战斗人员，而不是自爆。
 线虫的伤害计入其生成来源，但一旦停栖就失去这层继承关系。
 
 术士互动：
 未开始追踪战斗人员的线虫飞行 14 米后返回并停栖，最多 5 只。
 造成武器伤害或充能近战命中时逐只释放，每次释放间隔 0.5 秒。
 瞬间击杀目标不会释放停栖的线虫。
 以这种方式释放的线虫可以在任意射程追踪。
```

### 抓钩 · `1225978592` · `site_cooldownSeconds`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1918152785)

处理：Abilities2 棱镜独立冷却字段同步当前源。

**修正前**

```text
118.7
```

**修正后**

```text
107.9
```

### 连锁闪电 · `1232050831` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=618967225)

处理：Abilities1；Abilities1。

**修正前**

```text
突进距离延长到 6 米的近战攻击。
 电弧分支职业专属，拥有 2 次技能充能。
 
 直接打击战斗人员：
 造成 490? [100] 伤害，施加震颤，并使其释放连锁闪电。
 连锁闪电对 9 米内的战斗人员造成 266? [54] 伤害，最多连锁 5 次，但无法连回最近一次瞄准的战斗人员。
 
 增幅期间：
 释放两轮连锁闪电，各自瞄准不同的战斗人员，命中战斗人员的上限翻倍。
 同一名战斗人员仍然只会被连锁闪电命中一次。
```

**修正后**

```text
突进距离延长到 6 米的近战攻击。
 电弧分支职业专属，拥有 2 次技能充能。
 
 直接打击战斗人员：
 造成 390 [100] 伤害，施加震颤，并使其释放连锁闪电。
 连锁闪电对 9 米内的战斗人员造成 265 [54] 伤害，最多连锁 5 次，但无法连回最近一次瞄准的战斗人员。
 
 增幅期间：
 释放两轮连锁闪电，各自瞄准不同的战斗人员，命中战斗人员的上限翻倍。
 同一名战斗人员仍然只会被连锁闪电命中一次。
```

### 勇士之鞭 · `1262901525` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1918152785)

处理：待确认F 棱镜源省略回能段。

**修正前**

```text
击杀受元素减益影响的战斗人员提供 10% 职业技能能量。
 
 放置屏障时：
 释放一条缚丝鞭，向前飞行最远 30 米，追踪路径上的战斗人员，命中造成 60 [30] 伤害并施加悬停。
 
 使用推进器职业技能时：
 生成一枚缚丝结，? 秒后爆炸，最多造成 60 [30] 伤害并在 ? 米半径内施加悬停。
```

**修正后**

```text
放置屏障时：
 释放一条缚丝鞭，向前飞行最远 30 米，追踪路径上的战斗人员，命中造成 60 [30] 伤害并施加悬停。
 
 使用推进器职业技能时：
 生成一枚缚丝结，? 秒后爆炸，最多造成 60 [30] 伤害并在 ? 米半径内施加悬停。
```

### 护盾粉碎 · `1533272844` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F17；F17/F18 不推算总倍率。

**修正前**

```text
当冰霜护甲、虚空覆盖护盾或织造铠甲激活时：
近战充能速率额外提高 ?% [?%]。
充能近战伤害提高 50% [5%]。
超能近战伤害同样提高。

当增幅或焕光激活时：
手雷充能速率额外提高 ?% [?%]。
手雷伤害提高 25% [5%]。

抓钩近战改为提高 12% 伤害，Perk 的两半各提供一半。
```

**修正后**

```text
当冰霜护甲、虚空覆盖护盾或织造铠甲激活时：
近战充能速率额外提高 ?% [?%]。
充能近战伤害提高 50% [5%]。
超能近战与点燃伤害同样提高。

当增幅或焕光激活时：
手雷充能速率额外提高 ?% [?%]。
手雷伤害提高 25% [5%]。

Perk 的两部分各为抓钩近战提高 12% 伤害；组合打击生效时，护盾粉碎不提高抓钩近战伤害。
```

### 传导宇宙织针 · `2311625538` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F3。

**修正前**

```text
对受缚丝减益影响的战斗人员：

电弧与虚空技能伤害提高 5%。
```

**修正后**

```text
装备电弧或虚空超能，对受缚丝减益影响的战斗人员：

每种缚丝减益使电弧与虚空技能伤害叠乘提高 5%。
1 / 2 / 3 种减益分别提高 5% / 10.25% / 15.76%。
```

### 虚空武器输能 · `2311625540` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F11；F11。

**修正前**

```text
持有至少 1 层虚空技能充能时，用虚空武器取得击杀：

按虚空手雷、近战与超能技能的充能层数，获得等量的武器激涌，持续 11 秒。

拥有 4 层虚空技能充能时最多获得 x4 武器激涌，例如 2 手雷 + 2 近战 = x4 激涌。

只有当前层数不超过虚空技能充能数量时才能刷新；在棱镜上表现正常。
```

**修正后**

```text
持有至少 1 层虚空技能充能时，用虚空武器取得击杀：

按虚空手雷、近战、职业技能与超能技能的充能层数，获得等量的武器激涌，持续 11 秒。

拥有 4 层虚空技能充能时最多获得 x4 武器激涌，例如手雷 + 近战 + 职业技能 + 超能 = x4 激涌，或 2 手雷 + 2 近战 = x4 激涌。

只有当前层数不超过虚空技能充能数量时才能刷新；在棱镜上表现正常。
```

### 小队目标 · `2311625543` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F10。

**修正前**

```text
在超能元素匹配增益的影响下使用终结技时：

? 米范围内的盟友获得对应分支职业的增益：
电弧：增幅 | 虚空：吞食 | 缚丝：织造铠甲
```

**修正后**

```text
自身有增幅、吞食或织造铠甲生效时，使用终结技：

? 米范围内的盟友获得自身当前已生效的一种增益，不要求超能元素匹配：
增幅：15 秒 | 吞食：5 秒 | 织造铠甲：10 秒
只能赠予一种增益，优先级按上述顺序。
```

### 灵魂虹吸 · `2321824286` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1907852650)

处理：Abilities8。

**修正前**

```text
充能近战命中后，近战技能被替换为灵魂虹吸，持续 20 秒。
 
 使用时束缚 20 米内最多 4 名战斗人员，每 0.2 秒造成一跳递增的近战伤害，并在 3.2 秒内把它们拉向自己。
 最后一次拉扯（首跳后 0.6 秒）必定使战斗人员踉跄。
 
 每名战斗人员每跳提供 +15 虚空覆盖护盾（持续 15+7.5 秒）与 ?% 职业技能能量。
 装备坚韧回声时，覆盖护盾时长只有在低于 15 秒时才能刷新到 22.5 秒。
 
 伤害略有随机，平均每次施放对每名战斗人员约 1320 近战伤害，跳数为 2 / 11 / 26 / 62 / 100 / 137 加收尾 879，PvP 各档为 ? / ?? / ?? / ?? / ?? / ?? 加收尾 ?。
```

**修正后**

```text
充能近战命中后，近战技能被替换为灵魂虹吸，持续 20 秒。
 
 使用时束缚 20 米内最多 4 名战斗人员，每 0.2 秒造成一跳递增的近战伤害，并在 3.2 秒内把它们拉向自己。
 最后一次拉扯（首跳后 0.6 秒）必定使战斗人员踉跄。
 
 每名战斗人员每跳提供 +15 虚空覆盖护盾（持续 15+7.5 秒）与 ?% 职业技能能量。
 装备坚韧回声时，覆盖护盾时长只有在不超过 15 秒时才能刷新到 22.5 秒。
 
 伤害略有随机，平均每次施放对每名战斗人员约 1320 近战伤害，跳数为 2 / 11 / 26 / 62 / 100 / 137 加收尾 879，PvP 各档为 ? / ?? / ?? / ?? / ?? / ?? 加收尾 ?。
```

### 烈日爆发 · `2344320973` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F8；沿用官方中文术语；沿用现有中文术语。

**修正前**

```text
点燃会额外造成一次伤害。

爆燃在 12 米半径内造成 171 [30] 点烈日伤害，并视为点燃效果，没有伤害衰减 [待确认]。

装备烧焦余烬时：
爆燃额外施加 x40+20 灼烧。

不受任何加成。
```

**修正后**

```text
点燃会额外造成一次伤害。

爆燃在 12 米半径内造成 171 [30] 点烈日伤害，并视为点燃效果，没有伤害衰减 [待确认]。

装备烧焦余烬时：
爆燃额外施加 x40+20 灼烧。

可受点燃伤害加成影响，例如黎明副歌。
装备烧焦余烬与骨灰余烬时可连锁触发点燃。
```

### 焕光能量球 · `2344320975` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F12。

**修正前**

```text
装备烈日或棱镜分支职业时：

能量球额外提供焕光。
```

**修正后**

```text
装备烈日或棱镜分支职业时：

能量球额外提供焕光，持续 10+5 秒。
```

### 回天掌法 · `2447449706` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1934379638)

处理：M3。

**修正前**

```text
用充能近战击杀时：
 生成一枚能量球。
 
 能量球：
 0.8% ｜ 1.1% ｜ 1.25% ｜ 1.5% 超能能量。
 
 两枚能量球之间有 10 ｜ 5 ｜ 1 秒冷却。
 不与「火力无限」同时生效。
```

**修正后**

```text
用充能近战击杀时：
 生成一枚能量球。
 
 能量球：
 0.8% ｜ 1.1% ｜ 1.25% ｜ 1.5% 超能能量。
 
 两枚能量球之间有 10 ｜ 5 ｜ 1 秒冷却。
 按从左至右的槽位顺序装在「火力无限」后面时，可与其同时生效。
```

### 抓钩 · `2470512752` · `site_cooldownSeconds`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1870531554)

处理：Abilities2。

**修正前**

```text
118.7
```

**修正后**

```text
107.9
```

### 风暴手雷 · `2481624867` · `enhanced`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=618967225)

处理：待确认B 优先本体星相详细条目，手雷概要仍为4+1.5/1.3/4/158。

**修正前**

```text
[
  {
    "by": [
      1656549672
    ],
    "realgame_details": "引爆后生成一个漫游风暴，持续 4+1.5 秒，以 2 {pvp|[1.5]} 米/秒的初速追逐{enemy|战斗人员}，1.3 秒后提速到 4 {pvp|[3]} 米/秒。\\\\ 漫游风暴在{enemy|自己}下方发射闪电，造成 158 {pvp|[30]} 伤害，最多 11+4 次。"
  }
]
```

**修正后**

```text
[
  {
    "by": [
      1656549672
    ],
    "realgame_details": "引爆后生成一个漫游风暴，持续 4.5+1.5 秒，以 2 {pvp|[1.5]} 米/秒的初速追逐{enemy|战斗人员}，1.6 秒后提速到 5.5 {pvp|[3]} 米/秒。\\\\ 漫游风暴在{enemy|自己}下方发射闪电，造成 164 {pvp|[30]} 伤害，最多 11+4 次。"
  }
]
```

### 火力无限 · `2485657760` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1934379638)

处理：M2。

**修正前**

```text
用手雷击杀时：
 生成一枚能量球。
 
 能量球：
 0.8% ｜ 1.1% ｜ 1.25% ｜ 1.5% 超能能量。
 
 两枚能量球之间有 10 ｜ 5 ｜ 1 秒冷却。
 不与「回天掌法」同时生效。
```

**修正后**

```text
用手雷击杀时：
 生成一枚能量球。
 
 能量球：
 0.8% ｜ 1.1% ｜ 1.25% ｜ 1.5% 超能能量。
 
 两枚能量球之间有 10 ｜ 5 ｜ 1 秒冷却。
 按从左至右的槽位顺序装在「回天掌法」前面时，可与其同时生效。
```

### 平衡琢面 · `2626922114` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1918152785)

处理：待确认H 确认程度更新。

**修正前**

```text
3? 秒内用光能伤害击杀 3 名战斗人员提供 10% 近战能量。
 3? 秒内用暗影伤害击杀 3 名战斗人员提供 10% 手雷能量。
```

**修正后**

```text
3 秒内用光能伤害击杀 3 名战斗人员提供 10% 近战能量。
 3 秒内用暗影伤害击杀 3 名战斗人员提供 10% 手雷能量。
```

### 孤独琢面 · `2626922123` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1918152785)

处理：Abilities9。

**修正前**

```text
3 秒内精准命中次数达标后：
 此后 3 秒内，任意来源的下一次伤害实例触发一次割裂爆裂，对 3 米内的战斗人员施加割裂；超凡期间半径提高到 6 米。
 所需精准命中次数 = 弹匣容量的 20% + 1，向下取整；弓箭固定 2 次。
 割裂后有 4 秒冷却，冷却期间的精准命中不计入。准备割裂爆裂的那次精准命中不会触发三体坐观者、高爆载荷这类 Perk。
```

**修正后**

```text
3 秒内精准命中次数达标后：
 此后 3 秒内，任意来源的下一次伤害实例触发一次割裂爆裂，对 3 米内的战斗人员施加割裂；超凡期间半径提高到 6 米。
 所需精准命中次数 = 弹匣容量的 20% + 1，向下取整；弓箭固定 2 次。
 割裂后有 4 秒冷却，冷却期间的精准命中不计入。准备割裂爆裂的那次精准命中，即使附带同时发生的额外伤害实例，也不能立即触发割裂爆裂；例如三体坐观者与高爆载荷。
```

### 银白箭袋 · `2659604386` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F9。

**修正前**

```text
护甲充能激活时：

填装弓可获得 3 层弑神箭头。
收起武器会移除所有层数。

持有弑神箭头时开火：
消耗 1 层以提高伤害，并获得 +? 填装速度。

主武器 = 对战斗人员伤害提高 35%。
威能武器 = 对战斗人员伤害提高 25%。
层数与所有效果叠加。
```

**修正后**

```text
护甲充能激活时：

填装弓消耗 1 层护甲充能，获得 3 层弑神箭头。
增益期间不能再次消耗护甲充能或获得层数。
收起武器会移除所有层数。

持有弑神箭头时开火：
消耗 1 层以提高伤害，并获得 +? 填装速度。

主武器 = 对战斗人员伤害提高 35%。
威能武器 = 对战斗人员伤害提高 25%。
层数与所有效果叠加。
```

### 护盾粉碎 · `2659604391` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F17；F17/F18 不推算总倍率。

**修正前**

```text
当冰霜护甲、虚空覆盖护盾或织造铠甲激活时：
近战充能速率额外提高 ?% [?%]。
充能近战伤害提高 50% [5%]。
超能近战伤害同样提高。

当增幅或焕光激活时：
手雷充能速率额外提高 ?% [?%]。
手雷伤害提高 25% [5%]。

抓钩近战改为提高 12% 伤害，Perk 的两半各提供一半。
```

**修正后**

```text
当冰霜护甲、虚空覆盖护盾或织造铠甲激活时：
近战充能速率额外提高 ?% [?%]。
充能近战伤害提高 50% [5%]。
超能近战与点燃伤害同样提高。

当增幅或焕光激活时：
手雷充能速率额外提高 ?% [?%]。
手雷伤害提高 25% [5%]。

Perk 的两部分各为抓钩近战提高 12% 伤害；组合打击生效时，护盾粉碎不提高抓钩近战伤害。
```

### 刀剑风暴连击 · `2742146816` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F16；待确认11 按源省略额外加成。

**修正前**

```text
连续 3 次轻攻击后再打出一次重攻击：
获得刀剑风暴连击，持续 5 秒。
额外的刀剑击杀会刷新该效果。

刀剑风暴连击：
自动对使用者周围 6 米内的战斗人员每 0.53 秒造成 103 [?] 点刀剑动能伤害并施加迷惑，持续 3 秒。
距离小于 4 米时，伤害最多提高 15%。

只受银白利刃加成。
```

**修正后**

```text
连续 3 次轻攻击后在地面上再打出一次重攻击：
获得刀剑风暴连击，持续 5 秒。
额外的刀剑击杀会刷新该效果。

刀剑风暴连击：
自动对使用者周围 6 米内的战斗人员每 0.53 秒造成 103 [?] 点刀剑动能伤害并施加迷惑，持续 3 秒。
距离小于 4 米时，伤害最多提高 15%。
```

### 动能裂口 · `2742146822` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F21 保留问号；F21。

**修正前**

```text
对橙血 + 战斗人员造成足够次数的动能武器伤害时：
生成一个动能裂口，持续 ? 秒。

动能裂口可以被攻击，受到伤害 ? 秒后激活。

动能裂口的爆炸伤害等于它受到的伤害的 [?]%，可眩晕势不可挡勇士，并会击退战斗人员。
```

**修正后**

```text
对橙血 + 战斗人员造成足够次数的动能武器伤害时：
生成一个动能裂口，持续 ? 秒。

动能裂口可以被攻击，受到伤害 0.3? 秒后激活。

动能裂口的爆炸伤害等于它受到的伤害的 [?]%，可眩晕势不可挡勇士，并会击退战斗人员。

裂口计为弱点；对它造成的伤害不计为对战斗人员的伤害，也不计入命中或未命中。
对裂口使用 PvP 增伤数值：焕光 10%，武器激涌 3% / 4.5% / 5.5%，集体行动 11%。
```

### 狙击手冥想 · `2742146823` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认8 Direct Hit。

**修正前**

```text
狙击步枪命中时：
获得一层狙击手冥想，持续 7 秒。
威能狙击步枪命中获得 2 层。
狙击手冥想在收起武器后仍然保留。

狙击手冥想按层数提高伤害、稳定性与填装速度：
伤害：2.8% | 5.7% | 9% | 12% | 15%
稳定性：+? | +? | +? | +? | +?
填装速度：+15 | +30 | +35 | +40 | +45
```

**修正后**

```text
狙击步枪直接命中时：
获得一层狙击手冥想，持续 7 秒。
威能狙击步枪直接命中获得 2 层。
狙击手冥想在收起武器后仍然保留。

狙击手冥想按层数提高伤害、稳定性与填装速度：
伤害：2.8% | 5.7% | 9% | 12% | 15%
稳定性：+? | +? | +? | +? | +?
填装速度：+15 | +30 | +35 | +40 | +45
```

### 烈焰战锤 · `2747500761` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1186062409)

处理：待确认C 按源保留35秒/3.63%算术冲突，不自行更正。

**修正前**

```text
伤害抗性：90% [51%]
 基础持续：21 秒，或每秒消耗 4.75% 超能能量
 
 轻攻击 ｜ 消耗 12% 超能能量。
 投出接触即爆的飞锤，最多造成 445 [?] 伤害；两次投掷之间有 1.5 秒延迟。
 爆炸释放 4 片弹片，每片最多造成 396 [?] 伤害。飞锤在空中 0.7 秒后视觉上升空，弹片增加到 5 片。
 
 凤巢 ｜ 被动消耗降低 20%，持续时间提高到 26.25 秒（每秒 3.81%），轻攻击改为消耗 7.5% 超能能量，投掷间隔降到 1 秒。
 
 罗蕾莱辉煌头盔 ｜ 被动消耗降低 40%，持续时间提高到 35 秒（每秒 2.85%），轻攻击消耗 8.2% 超能能量，投掷间隔降到 1 秒。
 两种异域的数值都假设无敌索尔增益 100% 持续，实战未必做得到。
```

**修正后**

```text
伤害抗性：90% [51%]
 基础持续：21 秒，或每秒消耗 4.75% 超能能量
 
 轻攻击 ｜ 消耗 12% 超能能量。
 投出接触即爆的飞锤，最多造成 445 [?] 伤害；两次投掷之间有 1.5 秒延迟。
 爆炸释放 4 片弹片，每片最多造成 396 [?] 伤害。飞锤在空中 0.7 秒后视觉上升空，弹片增加到 5 片。
 
 凤巢 ｜ 被动消耗降低 20%，持续时间提高到 26.25 秒（每秒 3.81%），轻攻击改为消耗 7.5% 超能能量，投掷间隔降到 1 秒。
 
 罗蕾莱辉煌头盔 ｜ 被动消耗降低 40%，持续时间提高到 35 秒（每秒 3.63%），轻攻击消耗 8.2% 超能能量，投掷间隔降到 1 秒。
 两种异域的数值都假设无敌索尔增益 100% 持续，实战未必做得到。
```

### 线织幽灵 · `2835214897` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1918152785)

处理：Abilities3 仅棱镜。

**修正前**

```text
使用职业技能生成一个缚丝诱饵。
 
 诱饵有 175 生命值，最多持续 12 秒；战斗人员会被吸引去攻击它，它对战斗人员有 70% 伤害抗性。
 盟友与施法者对它造成的技能与武器伤害提高 150%。
 诱饵始终计为敌对目标，盟友、战斗人员与施法者都能伤害它，且不会触发任何击杀效果。
 
 失去全部生命值或 ? 米内有战斗人员时爆炸，最多造成 600 [60 守护者 ｜ 121 物体] 伤害，范围 ? 米；战斗人员靠近触发的爆炸会生成 2 只线虫。
 装备时被动施加 0.6 倍职业技能充能速度，装备特技闪身时除外。
```

**修正后**

```text
使用职业技能生成一个缚丝诱饵。
 
 诱饵有 175 生命值，最多持续 12 秒；战斗人员会被吸引去攻击它，它对战斗人员有 70% 伤害抗性。
 盟友与施法者对它造成的技能与武器伤害提高 150%。
 诱饵始终计为敌对目标，盟友、战斗人员与施法者都能伤害它，且不会触发任何击杀效果。
 
 失去全部生命值或 ? 米内有战斗人员时爆炸，最多造成 479 [60 守护者 ｜ 121 物体] 伤害，范围 ? 米；战斗人员靠近触发的爆炸会生成 2 只线虫。
 装备时被动施加 0.6 倍职业技能充能速度，装备特技闪身时除外。
```

### 组合银白利刃 · `2903198435` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F15。

**修正前**

```text
攻击后等待 0.5 秒再次攻击：
获得银白利刃，持续 5 秒。
该效果无法刷新。

银白利刃：
刀剑伤害提高 15%，充能效率 +100。
```

**修正后**

```text
攻击后等待 0.5 秒在地面上再次攻击：
获得银白利刃，持续 5 秒。
该效果无法刷新。

银白利刃：
刀剑伤害提高 15%，充能效率 +100。
```

### 护甲匠 · `2903198437` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F2。

**修正前**

```text
击破一个战斗人员护盾时：

10% [2.5%] 伤害抗性（抵抗 x1），持续 6 秒。
近战伤害提高 100%，持续 6 秒。
超能近战伤害同样提高。
```

**修正后**

```text
击破一个战斗人员护盾或使用终结技时：

10% [2.5%] 伤害抗性（抵抗 x1），持续 6 秒。
近战伤害提高 100%，持续 6 秒。
超能近战伤害同样提高。
```

### 英勇利刃 · `3049715579` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=441434520)

处理：Equipment1。

**修正前**

```text
特殊弹药、可穿透护盾的光剑型偃月。
 可更换刀柄、握把、Perk、模组与催化剂。
 对战斗人员护盾伤害提高 50%，对屏障护盾伤害提高 200%。
 防御形态没有任何增伤，可用来读对橙血的基础伤害。
 
 [轻攻击]打出近战连段，每击造成 479[256] 点动能伤害。近战攻击可以释放电光充能。
 
 [格挡]在 ?° 锥形范围内提供 100%[≈46%] 伤害抗性。
 
 平衡形态｜每次间隔 5 秒内打出 3 次近战击杀，补充 1 发弹药、回复 65 点生命值并开始生命值回复。
 对红血与橙血战斗人员伤害提高 10%。因属性换算实际为 11.2%。
 
 防御形态｜开始格挡后 1 秒内挡下攻击，伤害提高 20%，持续 2 秒。
 每次间隔 ? 秒内格挡 ? 次攻击补充 1 发弹药，每秒最多一次。
 
 进攻形态｜每次间隔 ? 秒内造成 3 次伤害补充 1 发弹药。
 对首领与载具伤害提高 15%。
```

**修正后**

```text
特殊弹药、可穿透护盾的光剑型刀剑。
 可更换刀柄、握把、Perk、模组与催化剂。
 对战斗人员护盾伤害提高 50%，对屏障护盾伤害提高 200%。
 防御形态没有任何增伤，可用来读对橙血的基础伤害。
 
 [轻攻击]打出近战连段，每击造成 479[256] 点动能伤害。近战攻击可以释放电光充能。
 
 [格挡]在 ?° 锥形范围内提供 100%[≈46%] 伤害抗性。
 
 平衡形态｜每次间隔 5 秒内打出 3 次近战击杀，补充 1 发弹药、回复 65 点生命值并开始生命值回复。
 对红血与橙血战斗人员伤害提高 10%。因属性换算实际为 11.2%。
 
 防御形态｜开始格挡后 1 秒内挡下攻击，伤害提高 20%，持续 2 秒。
 每次间隔 ? 秒内格挡 ? 次攻击补充 1 发弹药，每秒最多一次。
 
 进攻形态｜每次间隔 ? 秒内造成 3 次伤害补充 1 发弹药。
 对首领与载具伤害提高 15%。
```

### 凉意袭人 · `3116632769` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认2 忠实保留源末句不限定范围。

**修正前**

```text
对冰影减益战斗人员取得冰影击杀时：
在 6 米范围内触发一次减速爆发。

减速爆发：
对战斗人员施加 x20 减速，持续 2? +? 秒。
为使用者与盟友提供 x? 冰霜护甲。

冰霜护甲部分实测无效。
```

**修正后**

```text
对冰影减益战斗人员取得冰影击杀时：
在 6 米范围内触发一次减速爆发。

减速爆发：
对战斗人员施加 x20 减速，持续 2? +? 秒。
为使用者与盟友提供 x? 冰霜护甲。

没有效果。
```

### 乘胜追击 · `3116632774` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认10 Handling保留源问号。

**修正前**

```text
击破战斗人员护盾：

+20 稳定性，
+20 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

**修正后**

```text
击破战斗人员护盾：

+20 稳定性，
+20? 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

### 动能冲击 · `3117519994` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F20；F20；F20；待确认11 按源省略额外加成。

**修正前**

```text
在 3 秒内用威能榴弹发射器造成 3 次非同时伤害，或用主武器／特殊榴弹发射器造成单次非致命伤害：

在战斗人员脚下触发一次冲击波，造成 227×2 = 454 点动能伤害，并在 7 米范围内踉跄并眩晕势不可挡勇士。
来自主武器与特殊榴弹发射器的冲击波只造成 150×2 伤害。
冲击波无伤害衰减；两次结算之间有 1 秒冷却时间。

造成榴弹发射器伤害时：
获得一层快速冲击，持续 5 秒，最多叠加 5 层。
填装速度：+5 | +10 | +15? | +20? | +30
填装持续时间倍率：0.99× | 0.99× | 0.98× | 0.96× | 0.94×

可以被除了激涌和武器属性之外的增益加成。
```

**修正后**

```text
在 3 秒内用威能榴弹发射器造成 3 次非同时伤害，或用主武器／特殊榴弹发射器造成单次非致命、非持续伤害：
或累计造成 5 次持续伤害，每 0.5 秒最多计入一次。

在战斗人员脚下触发一次冲击波，造成 227×2 = 454 点动能伤害，并在 7 米范围内踉跄并眩晕势不可挡勇士。
来自主武器与特殊榴弹发射器的冲击波只造成 150×2 伤害。
冲击波无伤害衰减；触发后 1 秒内的伤害不计入触发计数。

造成榴弹发射器伤害时：
获得一层快速冲击，持续 5 秒，最多叠加 5 层。
填装速度：+5 | +10 | +15? | +20? | +30
填装持续时间倍率：0.99× | 0.99× | 0.98× | 0.96× | 0.94×
```

### 寒脑凝滞 · `3117519998` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认10 范围保留源问号。

**修正前**

```text
被冻结的战斗人员会对 4 米内尚未受冰影减益影响的战斗人员施加 x? 减速。
```

**修正后**

```text
被冻结的战斗人员会对 4? 米内尚未受冰影减益影响的战斗人员施加 x? 减速。
```

### 发热寒颤 · `3153265450` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认7 按源省略同一目标限制。

**修正前**

```text
在 3 秒内对同一目标造成多次精准命中时：
烈日武器：获得焕光，持续 10 +5 秒。
冰影武器：获得一层冰霜护甲。

触发后有 1.5 秒冷却，冷却期间的额外命中不计。

多次精准命中的次数要求：
（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。
```

**修正后**

```text
在 3 秒内造成多次精准命中时：
烈日武器：获得焕光，持续 10 +5 秒。
冰影武器：获得一层冰霜护甲。

触发后有 1.5 秒冷却，冷却期间的额外命中不计。

多次精准命中的次数要求：
（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。
```

### 集群战术 · `3153265453` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F19。

**修正前**

```text
造成线虫伤害时：
获得一层集群战术，持续 10 秒，最多叠加至 2 层。
再次造成线虫伤害会刷新持续时间。

集群战术 x1 | 线虫伤害提高 15%。
集群战术 x2 | 线虫伤害提高 30%。

处于集群战术 x2 期间，每次线虫命中再把线虫伤害提高 1.03 倍，直到增益到期。

线虫伤害会眩晕势不可挡勇士。
```

**修正后**

```text
造成线虫伤害时：
获得一层集群战术，持续 10 秒，最多叠加至 2 层。
再次造成线虫伤害会刷新持续时间。

集群战术 x1 | 线虫伤害提高 15%。
集群战术 x2 | 线虫伤害提高 30%。

处于集群战术 x2 期间，每次线虫命中再把线虫伤害提高 1.03 倍，直到增益到期。

处于集群战术 x2 期间，线虫伤害会眩晕势不可挡勇士。
```

### 生成丝线 · `3192552691` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1870531554)

处理：Abilities4。

**修正前**

```text
造成伤害时提供一部分手雷技能能量。
 回能随来源与伤害量而变，通常造成的伤害越高，回的能量越多。
```

**修正后**

```text
造成伤害时提供一部分手雷技能能量。
 回能随来源与伤害量而变，通常造成的伤害越高，回的能量越多。
 不提供切线手雷能量。
```

### 能量加速 · `3459646245` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F7。

**修正前**

```text
在 3 秒内造成 2 次非同时的微型导弹伤害，或取得一次微型导弹击杀后：

目标释放一道动能冲击波，对 7 米范围内的战斗人员造成 120 [20] 点动能伤害，并眩晕势不可挡勇士。
冲击波无伤害衰减。
触发后进入 ? 秒冷却时间。
```

**修正后**

```text
在 3 秒内造成 2 次非同时的微型导弹伤害，或取得一次微型导弹击杀后：

目标释放一道动能冲击波，对 7 米范围内的战斗人员造成 120 [20] 点动能伤害，并眩晕势不可挡勇士。
冲击波无伤害衰减。
触发后进入 2 秒冷却时间。
```

### 牵引器火炮 · `3580904581` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=441434520)

处理：Equipment2。

**修正前**

```text
虚空爆炸霰弹枪。
 
 ↑财力雄厚：被动 +3 弹匣容量（4 → 7）、+3 储备弹药（14 → 17）。
```

**修正后**

```text
虚空爆炸霰弹枪。
 
 ↑财力雄厚：被动 +3 弹匣容量（4 → 7）、+3 储备弹药（15 → 18）。
```

### 瓦解能量球 · `3585856464` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F13。

**修正前**

```text
拾取能量球或缠结时：

获得瓦解弹药，持续 14 [?] 秒。
```

**修正后**

```text
拾取能量球或投掷缠结时：

获得瓦解弹药，持续 14 [?] 秒。
```

### 光子耀斑 · `3585856465` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认10 范围保留源问号；待确认10 冷却保留源问号。

**修正前**

```text
用电弧击杀疲惫或割裂状态的战斗人员时：

触发一次致盲爆发，致盲 5 米内的战斗人员。
触发有 6 秒冷却时间。
```

**修正后**

```text
用电弧击杀疲惫或割裂状态的战斗人员时：

触发一次致盲爆发，致盲 5? 米内的战斗人员。
触发有 6? 秒冷却时间。
```

### 永恒毁灭 · `3585856467` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F14。

**修正前**

```text
2–3? 秒内的每次非异域火箭发射器击杀都会推进计数器：
红血 = 25% | 橙血 = 34% | 初级首领 = 100%

计数器达到 100% 时：
火箭发射器获得 +1 弹药，精密框架火箭发射器（或任何带双脚架的框架）获得 +2 弹药。
同时获得 +? 填装速度与 0.?× 填装持续时间倍率，持续 10 秒。
不受回收器模组影响。
```

**修正后**

```text
2–3? 秒内的每次非异域火箭发射器击杀都会推进计数器：
红血 = 25% | 橙血 = 34% | 初级首领 = 100%

计数器达到 100% 时：
火箭发射器获得 +1 弹药，精密或高冲击框架火箭发射器（或任何带双脚架的框架）获得 +2 弹药。
同时获得 +? 填装速度与 0.?× 填装持续时间倍率，持续 10 秒。
不受回收器模组影响。
```

### 电介质 · `3585856470` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F1 废墟石板独立版本。

**修正前**

```text
击杀电弧减益战斗人员：

获得 x1 电光充能。

在 6 秒内连续击杀 3 名电弧减益战斗人员：
生成一个能量球，提供 7.15% 超能能量，并恢复 40 点生命值。
```

**修正后**

```text
击杀电弧减益战斗人员：

获得 x1 电光充能。

与加密数据磁盘版本不同，此版本不生成能量球，也不恢复生命值。
```

### 乘胜追击 · `3834273543` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认10 Handling保留源问号。

**修正前**

```text
击破战斗人员护盾：

+20 稳定性，
+20 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

**修正后**

```text
击破战斗人员护盾：

+20 稳定性，
+20? 操控性，
+20 填装速度，持续 10 秒。
刀剑获得 +20 防御抗性。
```

### 拳到力来 · `3938489430` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1934379638)

处理：待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位。

**修正前**

```text
用充能近战击杀时：
 额外提供超能能量。
 
 T1 超能：?% ｜ ?% ｜ ?%
 T2 超能：1.33%? ｜ ?% ｜ ?%
 T3 超能：?% ｜ ?% ｜ ?%
 T4 超能：5?% ｜ ?% ｜ ?%
 守护者：?% ｜ ?% ｜ ?%
 
 不与「点尸成金」同时生效。
```

**修正后**

```text
用充能近战击杀时：
 额外提供超能能量。
 
 T1 敌人：?% ｜ ?% ｜ ?%
 T2 敌人：1.33%? ｜ ?% ｜ ?%
 T3 敌人：?% ｜ ?% ｜ ?%
 T4 敌人：5?% ｜ ?% ｜ ?%
 守护者：?% ｜ ?% ｜ ?%
 
 不与「点尸成金」同时生效。
```

### 风寒 · `4037132128` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认7 按源省略同一目标限制。

**修正前**

```text
在 3 秒内对同一目标造成多次非同时的冰影武器伤害时：
获得一层冰霜护甲。

两次触发之间有 0.45 秒冷却，冷却期间的额外命中不计；收起武器时计数器重置。

触发冰霜护甲所需的命中次数：
弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 35%，向下取整）+ 2
无需手持冰影武器，按当前武器的弹匣计算。

在 3 秒内对减速的战斗人员造成多次冰影武器伤害时：
在战斗人员上方生成一个冰影碎片。
所需命中次数为弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 25%，向下取整）+ 2。
```

**修正后**

```text
在 3 秒内造成多次非同时的冰影武器伤害时：
获得一层冰霜护甲。

两次触发之间有 0.45 秒冷却，冷却期间的额外命中不计；收起武器时计数器重置。

触发冰霜护甲所需的命中次数：
弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 35%，向下取整）+ 2
无需手持冰影武器，按当前武器的弹匣计算。

在 3 秒内对减速的战斗人员造成多次冰影武器伤害时：
在战斗人员上方生成一个冰影碎片。
所需命中次数为弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 25%，向下取整）+ 2。
```

### 轨迹证据 · `4037132132` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F6；F6。

**修正前**

```text
在 1? 秒内对受到电弧减益的战斗人员造成 2 次精准命中，或在 ? 秒内击杀 3 名受到电弧减益的战斗人员：

生成一个离子轨迹。
离子轨迹生成有 4 秒冷却时间。

拾取离子轨迹时：
获得一层护甲充能。
```

**修正后**

```text
每次间隔 1 秒内对受到电弧减益的战斗人员造成 2 次精准命中，或每次间隔 3 秒内击杀 3 名受到电弧减益的战斗人员：

生成一个离子轨迹。
离子轨迹生成有 4 秒冷却时间。

拾取离子轨迹时：
获得一层护甲充能。
```

### 杀戮之风 · `4037132134` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：待确认9 保留问号。

**修正前**

```text
在 3 秒内用武器击杀 3 名战斗人员：

获得 +? 敏捷，持续 7 秒。
再次触发会刷新。
```

**修正后**

```text
在 3 秒内用武器击杀 3 名战斗人员：

获得 +50? 敏捷，持续 7 秒。
再次触发会刷新。
```

### 置身其中 · `4037132135` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F22；F22；F22。

**修正前**

```text
15? 米范围内有 3? 名战斗人员，且在 ? 秒内击杀 3 名战斗人员时：
获得一层护甲充能。

15? 米范围内有 3? 名战斗人员时：
获得 +? 操控性与 +? 充能效率。
```

**修正后**

```text
15 米范围内有 3 名战斗人员，且在 ? 秒内击杀 3 名战斗人员时：
获得一层护甲充能。

15 米范围内有 3 名战斗人员时：
获得 +35? 操控性与 +? 充能效率。
附近敌人条件不再满足后，属性增益仍持续 1.5 秒。
```

### 黎明护罩 · `4260353953` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1907852650)

处理：Abilities6；Abilities6 明确穹顶内触发；沿用官方中文术语。

**修正前**

```text
施法动画期间伤害抗性：?% [26.5%]
 
 施放时提供一次手雷技能充能，并生成 3 枚能量球，每枚提供 2.3% 超能能量。
 
 投出一座 8000 构造体生命值的防护穹顶，对战斗人员有 75%? 伤害抗性，内含一枚 200 生命值的核心。
 穹顶以核心为中心覆盖 8 米半径，持续 30 秒；摧毁核心即摧毁护罩。
 守护者对穹顶本身造成的伤害提高 50%，技能伤害另行缩放。
 除非穹顶内有战斗人员，否则所有弹体无法进出；穹顶内有战斗人员时，施法者与盟友可以射穿。
 部署或重新部署时会把 15 米内的战斗人员向内拉。超能属性最多把持续时间再延长 10 秒（200 超能）。
 
 站在穹顶内：
 施法者近战伤害 +50%，施法者的近战击杀会生成能量球（每次施放最多 5 枚）。
 战斗人员持续虚弱，? 米内的战斗人员被嘲讽走向穹顶内的守护者。
 光能护甲每秒生成 15 点虚空覆盖护盾，并提供 40% [?%] 伤害抗性、+50 操控性与 +50 填装速度。
 
 重新部署：
 核心在部署 3 秒后可由施法者拾起，每次施放最多两次，旋转的能量球表示剩余次数。
 持有期间，剩余护罩时长每（77 ÷ 拾取时剩余的光能护甲秒数）减少 1 秒。
```

**修正后**

```text
施法动画期间伤害抗性：?% [26.5%]
 
 施放时提供一次手雷技能充能，并生成 3 枚能量球，每枚提供 2.3% 超能能量。
 
 投出一座 8000 构造体生命值的防护穹顶，对战斗人员有 75%? 伤害抗性，内含一枚 200 生命值的核心。
 穹顶以核心为中心覆盖 8 米半径，持续 30 秒；摧毁核心即摧毁护罩。
 守护者对穹顶本身造成的伤害提高 50%，技能伤害另行缩放。
 除非穹顶内有战斗人员，否则所有弹体无法进出；穹顶内有战斗人员时，施法者与盟友可以射穿。
 部署或重新部署时会把 15 米内的战斗人员向内拉。超能属性最多把持续时间再延长 10 秒（200 超能）。
 
 站在穹顶内：
 施法者近战伤害 +50%，施法者的近战击杀会生成能量球（每次施放最多 5 枚）。
 战斗人员持续虚弱，? 米内的战斗人员被嘲讽走向穹顶内的守护者。
 光能护甲每秒生成 15 点虚空覆盖护盾，并提供 40% [?%] 伤害抗性、+50 操控性与 +50 填装速度。
 
 重新部署：
 核心在部署 3 秒后可由施法者拾起，每次施放最多两次，旋转的能量球表示剩余次数。
 持有期间，剩余护罩时长每（77 ÷ 拾取时剩余的光能护甲秒数）减少 1 秒。
 
 站在穹顶内获得光能武器 ｜ 武器伤害提高 25%，离开护罩后持续 0.3 秒；装备圣人14号的头盔时延长到 15 秒。
```

### 视网膜灼烧 · `611645145` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F5；F5；F5。

**修正前**

```text
护甲充能激活期间，于 ? 秒内对尚未致盲的战斗人员造成 2 次电弧武器精准命中：

消耗 1 层护甲充能，触发致盲爆发，对 ? 米半径内的战斗人员施加致盲，持续 ? 秒。
```

**修正后**

```text
护甲充能激活期间，于 2 秒内对尚未致盲的战斗人员造成 2 次电弧武器精准命中：

消耗 1 层护甲充能，触发致盲爆发，对 7 米半径内的战斗人员施加致盲，持续约 8.5 秒。
```

### 弱化波 · `611645151` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=473308249)

处理：F4。

**修正前**

```text
终结一个战斗人员时：

触发一道波形，造成 180 点超能元素匹配伤害，最远波及 15 米。
波会朝终结技的方向推进，并追踪战斗人员。

装备电弧、虚空或冰影超能时，波会额外施加与超能元素匹配的减益：

电弧 = 致盲
虚空 = 虚弱
冰影 = 减速
```

**修正后**

```text
终结一个战斗人员时：

触发一道波形，造成 180 点超能元素匹配伤害，最远波及 20 米。
伤害不受光等差影响，始终为 180。
波会朝终结技的方向推进，并追踪战斗人员。

装备电弧、虚空或冰影超能时，波会额外施加与超能元素匹配的减益：

电弧 = 致盲
虚空 = 虚弱
冰影 = 减速
```

### 伊卡洛斯突进 · `83039195` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1186062409)

处理：Abilities7；Abilities7 Bosses 按当前源。

**修正前**

```text
水平冲刺 8 米，黎明期间距离提高 25%，使用后有 4 秒冷却。
 
 炙热升腾激活时，或装备焚烧响指近战的烈焰之歌期间：
 额外获得一次充能且两次同时充能，但冷却提高到 5 秒。
 装备星界之火近战时，烈焰之歌中不会获得 2 次充能。
 
 空中用武器或超能击杀推进计数，满 100% 提供 1 层治愈：
 红血 34% ｜ 橙血 67% ｜ 初级首领 100% ｜ 守护者 67%。
```

**修正后**

```text
水平冲刺 8 米，黎明期间距离提高 25%，使用后有 4 秒冷却。
 
 炙热升腾激活时，或装备焚烧响指近战的烈焰之歌期间：
 额外获得一次充能且两次同时充能，但冷却提高到 5 秒。
 装备星界之火近战时，烈焰之歌中不会获得 2 次充能。
 
 空中用武器或超能击杀，每次击杀间隔不超过 5 秒时推进计数，满 100% 提供 1 层治愈：
 红血 34% ｜ 橙血 67% ｜ 首领 100% ｜ 守护者 67%。
```

### 点尸成金 · `856936828` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1934379638)

处理：待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位；待确认12 纠正敌人档位误作超能档位。

**修正前**

```text
用手雷击杀时：
 额外提供超能能量。
 
 T1 超能：1%? ｜ ?% ｜ ?%
 T2 超能：?% ｜ ?% ｜ ?%
 T3 超能：?% ｜ ?% ｜ ?%
 T4 超能：5?% ｜ ?% ｜ ?%
 守护者：?% ｜ ?% ｜ ?%
 
 不与「拳到力来」同时生效。
 抓钩近战击杀提供的超能能量减少 50%。
```

**修正后**

```text
用手雷击杀时：
 额外提供超能能量。
 
 T1 敌人：1%? ｜ ?% ｜ ?%
 T2 敌人：?% ｜ ?% ｜ ?%
 T3 敌人：?% ｜ ?% ｜ ?%
 T4 敌人：5?% ｜ ?% ｜ ?%
 守护者：?% ｜ ?% ｜ ?%
 
 不与「拳到力来」同时生效。
 抓钩近战击杀提供的超能能量减少 50%。
```

### 勇士之鞭 · `988980152` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=1870531554)

处理：待确认F 缚丝源退回问号。

**修正前**

```text
击杀受元素减益影响的战斗人员提供 10% 职业技能能量。
 
 使用职业技能：
 释放一条缚丝鞭，向前飞行最远 30 米，追踪路径上的战斗人员，命中造成 61 [31] 伤害并施加悬停。
```

**修正后**

```text
击杀受元素减益影响的战斗人员提供 ?% 职业技能能量。
 
 使用职业技能：
 释放一条缚丝鞭，向前飞行最远 30 米，追踪路径上的战斗人员，命中造成 61 [31] 伤害并施加悬停。
```


### 噬星者之灵 · `1476923955` · `i18n.zh-CN.realgame_details`

文件：`data/inventory-items.json`；[DDC来源](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/gviz/tq?tqx=out:csv&gid=20898389)

处理：同步实际页面读取的插件正文；Solar Effects 表示全部烈日效果，不限于灼烧。

**修正前**

```text
超能充满期间拾取能量球：
 获得 1 层光能盛宴，最多 6 层。
 换到另一件带噬星者之灵的异域职业物品时，当前层数保留。
 
 施放超能时：
 消耗全部光能盛宴层数，超能伤害提高，持续 14 秒。
 超能伤害 +18.2%｜+36.4%｜+54.6%｜+59.7%｜+64.8%｜+70%。
 
 部分超能技能收益降低：
 烈焰之歌不吃灼烧效果的伤害提升。
 新星炸弹、雷霆冲击与暮光军火最高 +50% 超能伤害。
 织针风暴最高 +35% 超能伤害。
```

**修正后**

```text
超能充满期间拾取能量球：
 获得 1 层光能盛宴，最多 6 层。
 换到另一件带噬星者之灵的异域职业物品时，当前层数保留。
 
 施放超能时：
 消耗全部光能盛宴层数，超能伤害提高，持续 14 秒。
 超能伤害 +18.2%｜+36.4%｜+54.6%｜+59.7%｜+64.8%｜+70%。
 
 部分超能技能收益降低：
 烈焰之歌不获得烈日效果伤害提升。
 新星炸弹、雷霆冲击与暮光军火最高 +50% 超能伤害。
 织针风暴最高 +35% 超能伤害。
```

## 源稿、更新时间与更新日志

游戏机制来源：[Game Mechanics](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1800463143)。本轮涉及的页面更新日统一为2026.10.8。

| 源稿 | 修正前更新日 | 修正后更新日 |
|---|---|---|
| `references/keys/arc.md` | 2026.8.30 | 2026.10.8 |
| `references/keys/solar.md` | 2026.8.30 | 2026.10.8 |
| `references/keys/void.md` | 2026.8.30 | 2026.10.8 |
| `references/keys/strand.md` | 2026.8.10 | 2026.10.8 |
| `references/keys/prismatic.md` | 2026.8.30 | 2026.10.8 |
| `references/keys/armor-mods.md` | 2026.9.10 | 2026.10.8 |
| `references/keys/armor-sets.md` | 2026.10.1 | 2026.10.8 |
| `references/keys/artifact-mods.md` | 2026.10.1 | 2026.10.8 |
| `references/keys/exotic-weapon.md` | 2026.8.30 | 2026.10.8 |
| `references/keys/exotic-armor.md` | 2026.8.30 | 2026.10.8 |
| `references/docs/game-mechanics.md` | 2026.8.30 | 2026.10.8 |
| `references/docs/changelog.md` | 2026.10.1 | 2026.10.8 |
| `references/docs/elements.md` | 2026.8.23 | 2026.10.8 |

| 首页卡片 | 修正前 | 修正后 |
|---|---|---|
| 护甲模组 | 2026.9.10 | 2026.10.8 |
| 护甲套装效果 | 2026.10.1 | 2026.10.8 |
| 异域武器 | 2026.8.30 | 2026.10.8 |
| 异域护甲 | 2026.8.30 | 2026.10.8 |
| 职业分支详解 | 2026.8.23 | 2026.10.8 |
| 神器模组 | 2026.10.1 | 2026.10.8 |
| 游戏机制 | 2026.8.30 | 2026.10.8 |
| 更新日志 | 2026.10.1 | 2026.10.8 |

### references/docs/game-mechanics.md

```diff
--- 修正前
+++ 修正后
@@ -2,5 +2,5 @@
 
 描述：Destiny 2 底层机制速查表——六项护甲属性、敏捷与生命值护盾、护甲充能、超能能量获取、活动修改器全表、战斗人员档位与祸因、三类暗影勇士的难度分档，以及热量武器。
-更新：2026.8.30
+更新：2026.10.8
 数据源：是
 导航：是
@@ -37,5 +37,5 @@
 | 属性 | 图标 | 说明 |
 | --- | --- | --- |
-| 生命值 | {ico|![](icons/23436efaf2.webp)} | 拾取{orb|能量球}{el-solar|恢复}{health|生命值}，每点属性 +0.7，100 点时每颗{orb|能量球}最多 +70。\\ 另外每点属性在瞄准镜时提供 0.1% 受击抖动抗性，100 点时 10%。\\ \\ **↑ 强化收益**\\ 100 点以上每点提供更快的护盾回复，以及对{enemy|战斗人员}更高的护盾值。\\ 200 点时最多让护盾充能提前 25% 开始、充能速度提高 45%，并对{enemy|战斗人员} +20 护盾值。 |
+| 生命值 | {ico|![](icons/23436efaf2.webp)} | 拾取{orb|能量球}{el-solar|恢复}{health|生命值}，每点属性 +0.7，100 点时每颗{orb|能量球}最多 +70。\\ 另外每点属性在瞄准镜时提供 0.1% 受击抖动抗性，100 点时 10%。\\ \\ **↑ 强化收益**\\ 100 点以上每点提供更快的护盾回复，以及对{enemy|战斗人员}更高的护盾值。\\ 200 点时最多让护盾充能提前 25% 开始、充能速度提高 50%，并对{enemy|战斗人员} +20 护盾值。 |
 | 近战 | {ico|![](icons/3a3d08caaf.webp)} | 每点提供 {unsure|?}% 的近战技能基础回复速度，以及 {unsure|?}% 的{pickup|近战技能能量}获取提高。\\ 100 点时最多提供 {unsure|?}% 基础回复速度与 {unsure|?}% 能量获取提高。\\ \\ **↑ 强化收益**\\ 100 点以上每点提供 0.3%［0.2%］的近战伤害提高。\\ 200 点时最多 1.3×［20%］近战伤害。\\ 对未充能近战、充能近战与偃月近战伤害都生效，这份提高是相乘的。 |
 | 手雷 | {ico|![](icons/2f4b2db5b2.webp)} | 每点提供手雷技能基础回复速度与{pickup|手雷技能能量}获取的提高。\\ 100 点时最多提供 {unsure|?}% 基础回复速度与 211.5% 能量获取提高。\\ \\ **↑ 强化收益**\\ 100 点以上每点提供 0.65%［0.2%］的手雷技能伤害提高。\\ 200 点时最多 65%［20%］。 |
@@ -86,5 +86,5 @@
 
 基础移动速度是 5.6 米/秒，也就是不带任何额外效果向前移动的速度（基础 5 米/秒，外加固有的 +30 敏捷）。
-冲刺时向前的速度是 8 米/秒。
+泰坦与术士冲刺时向前的基础速度是 8 米/秒，猎人是 8.5 米/秒。
 
 基础移动速度（向前，含斜向左右）不能超过 9 米/秒，冲刺速度也算在这个上限里。
@@ -102,9 +102,9 @@
 | 敏捷档位 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
 | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
-| 步行速度\\ ［米/秒］ | 5.60 | 5.80 | 6.00 | 6.20 | 6.40 | 6.60 | 6.80 | 7 | {unsure|7.2?} | {unsure|7.4?} | {unsure|7.6?} |
-| 横移速度\\ ［米/秒］ | 4.76 | 4.93 | 5.10 | 5.27 | 5.44 | 5.61 | 5.78 | 5.95 | {unsure|6.12?} | {unsure|6.29?} | {unsure|6.46?} |
-| 下蹲速度\\ ［米/秒］ | 3.08 | 3.19 | 3.30 | 3.41 | 3.52 | 3.63 | 3.74 | 3.85 | {unsure|3.96?} | {unsure|4.07?} | {unsure|4.18?} |
-
-冲刺速度固定为 8 米/秒的基础移动速度，不随敏捷变化，只受轻质武器与冲刺加成影响，这两者相加最多提供 12.5% 的冲刺速度提升，各 6.25%。
+| 步行速度\\ ［米/秒］ | 5.60 | 5.80 | 6.00 | 6.20 | 6.40 | 6.60 | 6.80 | 7 | {unsure|7.2?} |  |  |
+| 横移速度\\ ［米/秒］ | 4.76 | 4.93 | 5.10 | 5.27 | 5.44 | 5.61 | 5.78 | 5.95 | {unsure|6.12?} |  |  |
+| 下蹲速度\\ ［米/秒］ | 3.08 | 3.19 | 3.30 | 3.41 | 3.52 | 3.63 | 3.74 | 3.85 | {unsure|3.96?} |  |  |
+
+基础冲刺速度不随敏捷变化，只受轻质武器与冲刺加成影响，这两者相加最多提供 12.5% 的冲刺速度提升，各 6.25%。
 
 泰坦与术士的敏捷基线是 30，猎人是 100［70］。强化运动腿部模组提供 +30 ｜ +50 ｜ +60 敏捷。
@@ -119,5 +119,5 @@
 打在{pickup|覆盖护盾}上的伤害不会中断{health|生命值}回复。
 
-强化后的{health|生命值}属性在 200 时最多让护盾充能提前 25% 开始，充能速度提高 45%。
+强化后的{health|生命值}属性在 200 时最多让护盾充能提前 25% 开始，充能速度提高 50%。
 
 | 不随属性变化的项 | 数值 |
@@ -132,8 +132,8 @@
 | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
 | 对战斗人员的护盾值 | 130 | 133 | 136 | 139 | 142 | 145 | 146 | 147 | 148 | 149 | 150 |
-| 护盾回复延迟 | 4.9 | - | - | - | - | - | - | - | - | - | 3.675 秒 |
+| 护盾回复延迟 | 4.9 | - | - | - | - | - | - | - | - |  |  |
 | 起始提前百分比 | - | - | - | - | - | - | - | - | - | - | 25% |
-| 护盾回复时长 ｜ 回复量 | 2.9 | - | - | - | - | - | - | - | - | - | 1.93 秒 ｜\\ 51.75/秒 |
-| 充能速度提升 | - | - | - | - | - | - | - | - | - | - | 45% |
+| 护盾回复时长 ｜ 回复量 | 2.9 | - | - | - | - | - | - | - | - |  |  |
+| 充能速度提升 | - | - | - | - | - | - | - | - | - |  | 50% |
 
 ## 护甲充能
@@ -355,5 +355,5 @@
 对护盾造成伤害会短暂中止{health|生命值}回复。
 
-破盾效果还能穿透这几种：护盾祸因的护盾、九头蛇护盾、高等哥布林免疫、（傀儡）方阵士兵护盾、嗤魅圆盾。
+破盾效果还能穿透这几种：{pickup|覆盖护盾}祸因的护盾、九头蛇护盾、高等哥布林免疫、（傀儡）方阵士兵护盾、傀儡暴徒护盾、嗤魅圆盾。
 武器对泰坦屏障的伤害提高 30%。
 
@@ -383,5 +383,4 @@
 {el-arc|电弧}的{deb-arc|震颤}在对{enemy|勇士}造成伤害时触发。
 {el-stasis|冰影}的{deb-stasis|减速}在对{enemy|勇士}叠加{deb-stasis|减速}层数时触发。
-{el-stasis|冰影}的{deb-stasis|冻结}在打碎{enemy|勇士}时触发。
 {el-void|虚空}的{deb-void|压制}在{deb-void|压制}{enemy|勇士}时触发。
 
@@ -407,4 +406,5 @@
 {el-arc|电弧}的{deb-arc|致盲}
 {el-solar|烈日}的{deb-solar|点燃}
+{el-stasis|冰影}的{deb-stasis|冻结}与{deb-stasis|碎裂}
 {el-strand|缚丝}的{deb-strand|悬停}
 
```

### references/docs/changelog.md

```diff
--- 修正前
+++ 修正后
@@ -2,6 +2,20 @@
 
 描述：Starside 各资料页的内容改动记录，按日期倒序，每条写明改动类型、所在页面与改动内容。
-更新：2026.10.1
+更新：2026.10.8
 页脚：改动类型只有三种：新增、改动、订正。
+
+## 2026.10.8
+
+- {act|订正}[游戏机制](../game-mechanics/index.html)：护盾回复加成改为 50%，补上猎人冲刺与勇士眩晕规则
+- {act|订正}[护甲模组](../armor-mods/index.html)：补上火力无限与回天掌法的槽位顺序共触发规则
+- {act|订正}[护甲套装效果](../armor-sets/index.html)：主动治疗改为每脉冲回血，订正钢铁信念与诅咒铁拳
+- {act|订正}[神器模组](../artifact-mods/index.html)：废墟石板电介质改为只给电光充能，弱化波范围改为 20 米
+- {act|订正}[职业分支详解](../elements/index.html) · [电弧](../elements/arc/index.html)：连锁闪电直击与连锁伤害改为 390 与 265
+- {act|订正}[职业分支详解](../elements/index.html) · [烈日](../elements/solar/index.html)：灼烧 PvE 系数改为 0.175，分清 PvP 伤害与衰减数据，撤销错误冲突提示，补上焕光对勇士的覆盖规则
+- {act|订正}[职业分支详解](../elements/index.html) · [虚空](../elements/void/index.html)：补上黎明护罩 25% 增伤与灵魂虹吸刷新边界
+- {act|订正}[职业分支详解](../elements/index.html) · [缚丝](../elements/strand/index.html)：抓钩冷却改为 107.9 秒，补上线虫与切线手雷例外
+- {act|订正}[职业分支详解](../elements/index.html) · [棱镜](../elements/prismatic/index.html)：线织幽灵伤害改为 479，订正孤独琢面的触发说明
+- {act|订正}[异域武器详解](../exotic-weapon/index.html)：英勇利刃归入刀剑，牵引器火炮备弹改为 15→18
+- {act|订正}[异域护甲详解](../exotic-armor/index.html)：职业金之灵正文归入各自主键，噬星者之灵的烈焰之歌例外改为全部烈日效果
 
 ## 2026.10.1
```

## 验证

- `python3 tools/facts.py --link`：完成，实体关联与图标路径已重算。
- `npm run build`：通过；全部生成器、首页预览、搜索索引、编辑台词表及三道闸门完成。外壳覆盖180页，术语覆盖174篇源稿，排版与结构覆盖185页。
- `npm test`：Python130项全部通过，Node84项全部通过；离线检查，未验证云端集成。
- 生成物烟测：上一轮其余23项通过，覆盖数值、触发条件、勇士分类、两版电介质、搜寻者不变及日志产出，36条职业金效果与页面所读插件正文逐一核对一致。本轮直接解析最新生成HTML，8项 PvE／PvP 口径检查全部通过；原来的“源内冲突提示”验收项已撤销。
- 最终结构化数据差异：117条记录、149个字段；搜寻者整条记录与订正前完全一致。
- 未启动浏览器；视觉效果、游戏内行为与线上发布未验证。没有部署或推送。

### 上一轮其他生成物烟测项目

- 电弧连锁闪电390/265伤害：通过。
- 缚丝抓钩基础冷却107.9秒：通过。
- 棱镜诱饵479伤害：通过。
- 缚丝诱饵600伤害仍保留：通过。
- 焕光勇士30%且光焰之井25%覆盖：通过。
- 火力无限左至右位于回天掌法之前可同时生效：通过。
- 搜寻者特殊和威能保留1.25/1.4/1.5：通过。
- 进化丝线不提供切线手雷能量：通过。
- 职业金合成之灵近战165%偃月100%：通过。
- 职业金矛隼之灵脱离隐身触发不稳定弹药：通过。
- 生命值强化护盾充能速度50%：通过。
- 猎人基础冲刺8.5米每秒：通过。
- 冻结碎裂属于势不可挡而非过载：通过。
- 破盾穿透列表包含傀儡暴徒：通过。
- 削弱波动半径20米：通过。
- 毁灭石板电介质明确不产球不回血：通过。
- 加密数据磁盘电介质仍产球与40点回血：通过。
- 职业金虫骸之灵按源使用职业技能治愈及燃烧之魂：通过。
- 牵引器火炮储备18：通过。
- 2026.10.8订正日志进入产出：通过。
- 噬星者之灵实际页面例外为全部烈日效果：通过。
- 36条职业金源记录与实际插件正文一致：通过。
- 搜寻者完整记录保持不变：通过。

### 本轮 PvE／PvP 口径烟测

- PvE公式0.175位于非PvP正文：通过。
- 五档每跳伤害位于PvP块：通过。
- 2.3秒与0.04秒衰减位于PvP块：通过。
- 不致命规则明确限定PvP：通过。
- 60层2.5%加成未误限为PvP：通过。
- 公式没有落入PvP块：通过。
- 错误冲突警告已从生成页移除：通过。
- 更新日志包含口径订正：通过。
