# DDC 上游疑点反馈报告

核对日期：2026-10-08。依据 DDC 原始 HTML 表格中的文字、颜色与上标，不依据丢失格式的 CSV 判断 PvE／PvP。下列是文档一致性与适用范围问题，没有游戏内复测，不宣称已确认游戏机制错误。行号取自原表显示的行标题；以后插入或删除行可能使位置变化，可用条目名定位。

灼烧不列入反馈：PvE 公式与 PvP 每跳伤害是两套数据，已撤销此前的错误冲突判断。搜寻者是本站选择保留的规则，也不列为上游错误。

## 本站处理建议

| 项目 | 作者确认前 | 作者确认后 |
|---|---|---|
| 暴雷之触强化风暴手雷 | 保留目前采用的星相详细段：4.5+1.5秒、1.6秒后5.5[3]米/秒、164[30]伤害；不称其为已实测正确值。 | 用作者确认的当前参数同步手雷说明与星相引用；若存在模式或版本差异，明确写出适用条件。 |
| 罗蕾莱强化烈焰战锤 | 保留源表35秒／3.63%每秒；不要用100÷35推算的约2.86%直接覆盖。 | 作者确认耗能率或持续时间后再改。若有额外能量规则，应补条件，而不是只改数字。 |
| 凤凰俯冲强化落地范围 | 暂时保留各自来源的5米／6.5米；不要把跨表文字差异擅自解释成棱镜／烈日或PvE／PvP机制差异。 | 同一机制则统一到作者确认值；确有差异则明确模式、版本或强化条件。 |
| 大型冰影碎片治疗量 | 汇总页的20 HP与收获星相的? HP各自保留。问号是未知标记，不是另一项数值。 | 作者确认20 HP适用于三个星相后，把三处问号补齐；若汇总值本身仍待测，应让汇总与详细段的确定性标注一致。 |

优先级：前三项请作者裁定当前数值或解释条件；第四项属于未知标记的同步确认。本轮只写报告，不继续改网站数值。

## Discord 英文反馈

建议先发送下面的引言，再逐条发送四个独立问题。每个编号节是可独立复制的消息；中文建议部分不用发送。

### Introduction

Hi! While syncing a Chinese reference site with DDC, I noticed a few duplicated descriptions with different values, plus one unknown-value marker that may need updating.

I checked the original sheet formatting, including PvE/PvP colors and superscripts. These are documentation clarification questions, not claims from in-game testing. Could you confirm the intended current values or any conditions that explain the differences?

### 1. Arc — Touch of Thunder / enhanced Storm Grenade

Two descriptions of the roaming storm list different parameters:

- Grenade section, row 49: duration **4+1.5 seconds**; accelerates after **1.3 seconds** to **4 [3] m/s**; lightning damage **158 [30]**.
- Titan Aspect section, row 110: duration **4.5+1.5 seconds**; accelerates after **1.6 seconds** to **5.5 [3] m/s**; lightning damage **164 [30]**.

The initial speed is **2 [1.5] m/s** in both. The **4 vs 5.5 m/s** and **158 vs 164 damage** values are both PvE-colored; the PvP values remain **[3] m/s** and **[30] damage**. The superscript **+1.5** and **+4** in the Aspect description are separate modifiers, not PvP values.

Sources:
- [Grenade section, row 49](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=618967225&range=A49:N49)
- [Titan Aspect section, row 110](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=618967225&range=A110:N110)

Which set is current? Are these duplicate descriptions that should be synchronized, or do they describe different conditions?

### 2. Solar — Hammer of Sol / Loreley Splendor Helm interaction

The Loreley paragraph in row 105 says:

> Reduces Passive Drain by 40%, increasing duration to 35 seconds, or 3.63% Super Drain per second.

It also states that the Exotic interactions assume **100% Sol Invictus buff uptime**. The **35 seconds** and **3.63% per second** are both formatted as Super-related values in the same paragraph, rather than a PvE/PvP pair.

If they both describe constant passive drain from a full Super bar, with no attacks or extra energy changes:
- **35 seconds** corresponds to approximately **2.857% per second**.
- **3.63% per second** corresponds to approximately **27.55 seconds**.

[Source: Solar, Hammer of Sol, row 105](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409&range=A105:N105)

Is either figure outdated, or is there an additional energy/duration rule that explains the pairing? I have not replaced either figure with the calculated value.

### 3. Phoenix Dive — Heat Rises landing damage radius

Both entries describe the landing effect **while Heat Rises is active**, with **100 damage** and **x40+20 Scorch**, but give different radii:

- Class Abilities, row 45: “to enemies within **5 metres** upon landing.”
- Solar, row 125: “to enemies within **6.5 metres** upon landing.”

Neither radius is marked as a PvP-only value in the current formatting.

Sources:
- [Class Abilities, row 45](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=527596209&range=A45:N45)
- [Solar, row 125](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1186062409&range=A125:N125)

Do both entries describe the same enhanced landing damage radius? If so, which value is current? If there is a mode/version difference, could it be labeled explicitly?

### 4. Stasis Shards — large-shard healing / Harvest descriptions

The Stasis Shard glossary, row 6, explicitly covers **Glacial, Grim or Tectonic Harvest** and says:

> Large Stasis Shards restore 20 HP and x3 Frost Armor.

However, all three Aspect descriptions still say:

> Picking up Large Stasis Shards restore ? HP and grant x3 Frost Armor.

Sources:
- [Stasis Shard glossary, row 6](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1088259962&range=A6:N6)
- [Grim Harvest, row 59](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1088259962&range=A59:N59)
- [Tectonic Harvest, row 87](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1088259962&range=A87:N87)
- [Glacial Harvest, row 107](https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4/edit#gid=1088259962&range=A107:N107)

This is an unknown-marker consistency question, not two conflicting measured values: is **20 HP** confirmed for all three Harvest Aspects, so their **? HP** can be updated, or is the glossary value still awaiting verification?
