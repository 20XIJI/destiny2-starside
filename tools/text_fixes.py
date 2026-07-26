"""神器模组页的文本修订表。

convert-artifact-mods.py 先跑完对源表格的逐字保真自检，再按这里的表改写产出。
源表格是社区机翻稿：句子不通、术语打架、还留着 %%% 一类的占位符。保真自检证明
「源表格的内容一字不少地落到了页面上」，这张表穷举「页面在此之上偏离了源表格多少」。
两者相加才是产出，中间没有第三条改动源文本的路径。

每条声明期望命中数，数目不符即中止——源表格一旦变动，这里当场报错而不是静默漏改。
FORBIDDEN 是常驻闸门：改完仍出现即中止，以后新写的文本再引入旧写法也会被拦下。

术语以页内自洽为准：取页面内出现次数最多的写法，不对站外事实做断言。三处例外经确认
后另行定夺——「装填速度」「悬停」按游戏内写法定（页内多数分别写「填装」「悬浮」）；
抗性层数写「抵抗 xN」，与护甲套装页取齐（本页源表格里 5 处写「抗性」、2 处写「抵抗」，
按页内多数本该取「抗性」，但两页说的是同一个游戏机制，跨页不一致更碍事）。

SUBS 按顺序施加，每条的 old 写的是「轮到它时」的文本。改顺序就要改 old。
"""

SUBS = [
    # ── 术语统一 ──────────────────────────────────────────────────────
    ('填装速度', '装填速度', 12),
    ('填装持续时间', '装填持续时间', 1),
    ('战斗单位', '战斗人员', 5),
    ('战斗员护盾', '战斗人员护盾', 1),
    ('普通战斗员', '普通战斗人员', 1),
    ('精确命中', '精准命中', 2),
    ('精确击杀', '精准击杀', 1),
    ('瓦解弹匣', '瓦解弹药', 1),
    ('悬浮', '悬停', 1),

    # ── 记法统一 ──────────────────────────────────────────────────────
    # 抗性层数一律「抵抗 xN」，与护甲套装页同一写法：源表格里「抵抗」「抗性」两词
    # 混用，空格也时有时无。先补齐空格，再统一用词。
    # 「伤害抗性」「防御抗性」「抖动抗性」是另一回事，不动。
    ('抵抗x1', '抵抗 x1', 1),
    ('抗性x2', '抗性 x2', 4),
    ('抗性 x1', '抵抗 x1', 1),
    ('抗性 x2', '抵抗 x2', 4),
    # 待测值统一用半角问号，与页内既有的 99 处一致
    ('？', '?', 16),
    # 触发条件后的冒号一律全角。先吃掉带后空格的那批，剩下的再统一
    (' : ', '：', 11),
    (' :', '：', 20),
    # 生命值不写 HP
    ('恢复 15 HP', '恢复 15 点生命值', 1),
    ('恢复 100 HP', '恢复 100 点生命值', 1),
    ('[100? HP]', '[100? 生命值]', 1),

    # ── 中文语境里的半角标点 ──────────────────────────────────────────
    ('超能能量.', '超能能量。', 1),
    ('向下取整, 弓箭', '向下取整，弓箭', 2),
    ('单发榴弹发射器, 刀剑', '单发榴弹发射器、刀剑', 2),
    ('瓦解, 割裂, 悬停', '瓦解、割裂、悬停', 1),

    # ── 残缺与占位 ────────────────────────────────────────────────────
    # 源表格用 %%% 表示「是个百分比，但没测出来」，改写成站点既有的待测记法
    ('的伤害的 %%%, 可眩晕', '的伤害的 <span class="unsure">[?]%</span>，可眩晕', 1),
    ('动能决裂', '动能裂口', 1),
    ('<span class="deb-void">击杀被削弱敌人<span class="plain">配合时</span></span>：',
     '<span class="deb-void">击杀被削弱的敌人</span>时：', 1),
    # 源表格用长连字符当分隔线与删除线。分隔线还原成段落，删除线直接去掉
    ('。<br>' + '-' * 43 + '<br>造成', '。</p>\n<p>造成', 1),
    ('<span class="note">无效 ' + '-' * 32 + '</span>', '<span class="note">无效</span>', 1),
    ('<span class="note">无效果 ' + '-' * 34 + '</span>', '<span class="note">无效果</span>', 1),
]


# 整条描述改写，键是（分节 id, 模组名）。跑在 SUBS 之后，所以这里写的是已经统一过
# 术语的文本。改写红线：只改表达与着色范围，不改数值、不改机制断言、不删原作者的
# 存疑标记（[?]）与注释（note 类整句）。
#
# 重名模组以「最完整的那一份」为基准，其余向它对齐；真有机制差异的保留差异（苦痛
# 之力在杀手公爵药剂师背包上多生成一个虚空裂口，元素虹吸原文就写明与废墟石板不同）。
DESCS = {
    # 「刀剑获得 +20 防御抗性」整句被染成威能紫，收到「刀剑」一词
    ('art-1', '乘胜追击'):
        '<p>击破<span class="enemy">战斗人员护盾</span>：</p>\n'
        '<p>+20 稳定性，<br>+20 操控性，<br>+20 装填速度，持续 10 秒。<br>'
        '<span class="ammo-heavy">刀剑</span>获得 +20 防御抗性。</p>',

    # 「电弧减益敌人」两次出现着色不一，统一为 deb-arc
    ('art-1', '电介质'):
        '<p>击杀<span class="deb-arc">电弧减益敌人</span>：</p>\n'
        '<p>获得 <span class="el-arc">x1 电光充能</span>。</p>\n'
        '<p>在 6 秒内连续击杀 3 名<span class="deb-arc">电弧减益敌人</span>：<br>'
        '生成一个<span class="orb">能量球</span>，提供 <span class="orb">7.15% 超能能量</span>，'
        '并<span class="health">恢复 40 点生命值</span>。</p>',

    ('art-1', '元素能量球：电弧'):
        '<p>使用<span class="el-arc">电弧武器</span>击杀 6 <span class="unsure">[2?]</span> '
        '名敌人：<br>生成一个<span class="el-arc">电弧元素能量球</span>。</p>\n'
        '<p><span class="el-arc">电弧元素能量球</span>：<br>'
        '落地后最多停留 20 秒，随后消失。<br>拾取后最多可持有 20 秒。</p>\n'
        '<p>造成最多 405 <span class="unsure">[101]</span> 点伤害，'
        '随距离最低衰减至 90%，并在 8 米范围内施加<span class="deb-arc">震颤</span>。</p>',

    # 「红血击杀」＝页内别处的「普通敌人」；弯引号补回、句末半角句点改全角
    ('art-1', '动能合成'):
        '<p>造成<span class="el-kinetic">动能武器伤害</span>或完成'
        '<span class="el-kinetic">动能武器击杀</span>会推进计数器，达到 100% 时生成一个独特的'
        '<span class="el-kinetic">动能弹药盒</span>。<br>计数器持续 15 秒，'
        '每次造成<span class="el-kinetic">动能武器伤害</span>都会刷新。</p>\n'
        '<p>每点伤害提供 0.0265% 进度，即需要造成 3770 点伤害才能生成一个弹药盒。<br>'
        '<span class="ammo-heavy">A499</span> 提供的进度减少 75%，'
        '需要 15000 点伤害才能生成一个弹药盒。<br>'
        '<span class="enemy">普通敌人 = 8% | 精英 = 15% | 小头目 = 25%</span><br>'
        '伤害需求<span class="note">忽略光等差距</span>，但计入实际伤害系数——'
        '也就是说，无论<span class="note">光等差距</span>把伤害压低多少，'
        '需要的“基础伤害”都一样。</p>\n'
        '<p>收集一个<span class="el-kinetic">动能弹药盒</span>时：<br>'
        '获得 <span class="el-strand">+5% 特殊弹药</span>与 '
        '<span class="ammo-heavy">+5% 威能弹药</span>进度。<br>'
        '装填当前装备的<span class="el-kinetic">动能武器</span>，并为它们生成'
        '<span class="el-strand">特殊</span>／<span class="ammo-heavy">威能</span>弹药。<br>'
        '每次生成（弹匣容量的 1/3）+ 1 发弹药，个别武器例外。<br>'
        '计入弹药拾取效果。<span class="el-kinetic">动能弹药生成</span>不受回收器影响。</p>\n'
        '<p><span class="orb">堡垒</span> = <span class="el-strand">+1 弹药</span> | '
        '<span class="orb">库尔之影</span> = <span class="el-strand">+2 弹药</span> | '
        '<span class="orb">英勇利刃</span> = <span class="el-strand">+2 弹药</span> | '
        '<span class="orb">缩影</span> = <span class="ammo-heavy">+12 弹药</span>。</p>',

    # 半角括号改全角；「也会提高超能近战伤害」是作者补注，金色改 note
    ('art-1', '护甲匠'):
        '<p>击破一个<span class="enemy">战斗人员护盾</span>时：</p>\n'
        '<p><span class="enemy">10%</span> <span class="unsure">[2.5%]</span> '
        '伤害抗性（抵抗 x1），持续 6 秒。<br>'
        '<span class="el-arc">近战伤害提高 100%</span>，持续 6 秒。<br>'
        '<span class="note">超能近战伤害同样提高</span>。</p>',

    # 「会击退战斗人员」是机制不是批注，去掉 note 降级
    ('art-1', '动能裂口'):
        '<p>对<span class="enemy">精英 +</span> <span class="enemy">战斗人员</span>造成足够次数的'
        '<span class="el-kinetic">动能武器伤害</span>时：<br>'
        '生成一个<span class="el-kinetic">动能裂口</span>，持续 ? 秒。</p>\n'
        '<p><span class="el-kinetic">动能裂口</span>可以被攻击，受到伤害 ? 秒后'
        '<span class="el-kinetic">激活</span>。</p>\n'
        '<p><span class="el-kinetic">动能裂口</span>的爆炸伤害等于它受到的伤害的 '
        '<span class="unsure">[?]%</span>，可眩晕势不可挡勇士，并会击退战斗人员。</p>',

    # 三行「xN | +? 装填速度」信息量为零，并成一句；层数上限由该表本身给出
    ('art-1', '远距填装'):
        '<p>使用弓或狙击步枪造成<span class="stack">精准命中</span>时：</p>\n'
        '<p>获得一层<span class="stack">远距填装</span>，持续 ? 秒，'
        '最多 <span class="stack">3 层</span>。</p>\n'
        '<p><span class="stack">远距填装</span>：每层提供 +? 装填速度。</p>',

    ('art-1', '反制能量'):
        '<p>每当<span class="enemy">勇士</span>被<span class="enemy">眩晕</span>时：</p>\n'
        '<p>为<span class="pickup">充能最少的技能</span>提供 '
        '<span class="pickup">25% 技能能量</span>。<br>'
        '<span class="note">不包括超能技能</span>。</p>',

    # 数值表的标签原本吊在行尾，提到行首；Buff 一律改「效果」
    ('art-1', '狙击手冥想'):
        '<p>狙击步枪命中时：<br>获得一层<span class="orb">狙击手冥想</span>，持续 7 秒。<br>'
        '<span class="ammo-heavy">威能狙击步枪</span>命中获得 <span class="orb">2 层</span>。<br>'
        '<span class="orb">狙击手冥想</span>在收起武器后仍然保留。</p>\n'
        '<p><span class="orb">狙击手冥想</span>按层数提高伤害、稳定性与装填速度：<br>'
        '伤害：2.8% | 5.7% | 9% | 12% | 15%<br>'
        '稳定性：+? | +? | +? | +? | +?<br>'
        '装填速度：+15 | +30 | +35 | +40 | +45</p>',

    ('art-1', '组合银白利刃'):
        '<p>攻击后等待 0.5 秒再次攻击：<br>'
        '获得<span class="el-arc">银白利刃</span>，持续 5 秒。<br>该效果无法刷新。</p>\n'
        '<p><span class="el-arc">银白利刃</span>：<br>刀剑伤害提高 15%，充能效率 +100。</p>',

    ('art-1', '刀剑风暴连击'):
        '<p>连续 3 次轻攻击后再打出一次重攻击：<br>'
        '获得<span class="el-kinetic">刀剑风暴连击</span>，持续 5 秒。<br>'
        '额外的刀剑击杀会刷新该效果。</p>\n'
        '<p><span class="el-kinetic">刀剑风暴连击</span>：<br>'
        '自动对使用者周围 6 米内的敌人每 0.53 秒造成 103 <span class="unsure">[?]</span> 点'
        '<span class="el-kinetic">刀剑动能伤害</span>并施加<span class="el-kinetic">迷惑</span>，'
        '持续 3 秒。<br>距离小于 4 米时，伤害最多提高 15%。</p>',

    ('art-1', '苦痛之力'):
        '<p>在 4 秒内连续击杀 <span class="deb-void">3 名被削弱的敌人</span>：</p>\n'
        '<p>获得<span class="el-void">吞食</span>，持续 5 <span class="el-void">+2.5</span> 秒。</p>\n'
        '<p>本应造成<span class="deb-void">削弱</span>的命中，即使当场击杀敌人也计入。</p>',

    ('art-1', '奇点利刃'):
        '<p>当拥有<span class="el-void">虚空元素增益</span>'
        '（<span class="el-void">吞食</span>、<span class="el-void">隐身</span>或'
        '<span class="pickup">覆盖护盾</span>）时：<br>'
        '<span class="el-arc">近战</span>与刀剑命中造成<span class="deb-void">削弱</span>，'
        '持续 6 秒。<br><span class="note">在命中时检测，而非在使用时快照</span>。</p>\n'
        '<p>当拥有<span class="el-void">虚空元素增益</span>时，用'
        '<span class="el-arc">近战</span>或刀剑击杀：<br>'
        '触发一次<span class="deb-void">削弱爆发</span>，对 4 米内的敌人造成'
        '<span class="deb-void">削弱</span>，持续 6 秒。</p>',

    ('art-1', '虚空感染'):
        '<p>击杀一个<span class="deb-void">被削弱的敌人</span>后：</p>\n'
        '<p>生成一个<span class="el-void">追踪弹头</span>，寻找 15 米内的敌人。</p>\n'
        '<p><span class="el-void">弹头</span>造成 87 <span class="unsure">[?]</span> 点'
        '<span class="el-void">虚空伤害</span>，并在 ? 米范围内施加'
        '<span class="deb-void">削弱</span>。</p>',

    ('art-1', '凶险距离'):
        '<p><span class="enemy">使用终结技</span>：</p>\n'
        '<p>获得 <span class="el-solar">25% 手雷</span>与<span class="el-arc">近战</span>'
        '技能能量。</p>',

    ('art-1', '致盲震颤'):
        '<p><span class="deb-arc">击杀被震颤的敌人</span>时：</p>\n'
        '<p>对 8 米内的敌人施加<span class="deb-arc">致盲</span>，持续 10 秒。</p>',

    # 「约 ~800」重复表意；感叹号改分号，注释归 note
    ('art-1', '泰瑟电触'):
        '<p>造成<span class="el-arc">电弧近战伤害</span>时：</p>\n'
        '<p>施加<span class="deb-arc">震颤</span>，并每 0.25 秒造成 '
        '<span class="el-arc">23 点电弧持续伤害</span>，'
        '8.75 秒内合计约 <span class="el-arc">800 点电弧伤害</span>。<br>'
        '<span class="note">此数值不含震颤伤害；计入震颤后总伤害为 1245 点</span>。</p>',

    ('art-1', '快速治疗'):
        '<p>在 3 秒内取得 <span class="ammo-heavy">3 次机枪击杀</span>时：</p>\n'
        '<p><span class="health">恢复 15 点生命值</span>，并'
        '<span class="health">开始生命回复</span>。</p>',

    ('art-1', '精准平等'):
        '<p><span class="stack">精准击杀</span>提供<span class="orb">精准平等</span>'
        '<span class="stack">层数</span>，最高 <span class="stack">10 层</span>。<br>'
        '<span class="enemy">普通敌人</span> = <span class="stack">1</span> | '
        '<span class="enemy">精英</span> = <span class="stack">2</span> | '
        '<span class="enemy">小头目</span> = <span class="stack">5</span> | '
        '<span class="enemy">勇士 +</span> = <span class="stack">10</span><br>'
        '<span class="note">层数不会溢出，也不会超过 x10</span>。</p>\n'
        '<p>达到 <span class="stack">x10 层数</span>时：<br>'
        '<span class="stack">消耗全部层数</span>，生成一个<span class="orb">大型能量球</span>，'
        '该<span class="orb">能量球</span>提供 <span class="orb">12.5% 超能能量</span>。</p>\n'
        '<p>拾取<span class="orb">大型能量球</span>时：<br>'
        '获得<span class="pickup">武器激涌 x2</span>，持续 11 秒。<br>'
        '<span class="note">不会覆盖更强的武器激涌，对所有伤害类型均生效</span>。</p>',

    ('art-1', '黏附冲击'):
        '<p><span class="el-arc">电弧粘性电浆手雷</span>、<span class="el-solar">融合手雷</span>与'
        '<span class="el-void">磁性手雷</span>的直接命中伤害提高。<br>'
        '<span class="el-arc">电弧粘性电浆手雷 = 60%</span> | '
        '<span class="el-solar">融合手雷 = 30%</span> | '
        '<span class="el-void">磁性手雷 = 总计提升 22.5%</span><br>'
        '其中只有第一次<span class="el-void">磁性手雷</span>获得 45% 的加成。<br>'
        '<span class="note">不会提高融合手雷的烈日效果伤害</span>。</p>\n'
        '<p>用上述<span class="el-solar">手雷</span>击杀敌人时：<br>'
        '在<span class="health">敌人死亡位置</span>上方生成 '
        '<span class="el-kinetic">4 枚追踪动能微型导弹</span>，'
        '追踪 30 米内最近的敌人。</p>\n'
        '<p><span class="el-kinetic">微型导弹</span>命中时造成 216 '
        '<span class="unsure">[?]</span> 点<span class="el-kinetic">动能伤害</span>。<br>'
        '<span class="note">行为与辅助炸药的导弹完全相同</span>。</p>',

    # ── art-2 好奇之器（溯回）────────────────────────────────────────
    # 本节是六个重名模组的基准：发热寒颤、线织爆破、护盾粉碎、冰霜复兴、
    # 群敌飞梭、极寒凝视，后面几件神器上的同名模组向这里对齐。

    # 注释块把两段挤进一个 span，拆成独立段落
    ('art-2', '发热寒颤'):
        '<p>在 3 秒内对同一目标造成<span class="stack">多次精准命中</span>时：<br>'
        '<span class="el-solar">烈日武器</span>：获得<span class="orb">焕光</span>，'
        '持续 10 <span class="el-solar">+5</span> 秒。<br>'
        '<span class="el-stasis">冰影武器</span>：获得一层'
        '<span class="el-stasis">冰霜护甲</span>。</p>\n'
        '<p><span class="note">触发后有 1.5 秒冷却，冷却期间的额外命中不计</span>。</p>\n'
        '<p><span class="stack">多次精准命中</span>的次数要求：<br>'
        '（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。</p>',

    ('art-2', '线织爆破'):
        '<p>使用<span class="el-strand">缚丝</span>摧毁<span class="el-strand">缠结</span>时：</p>\n'
        '<p><span class="el-strand">爆炸</span>额外造成一次 288 '
        '<span class="unsure">[?]</span> 点<span class="el-strand">伤害</span>，'
        '在 17 米半径内衰减至 75%。<br>'
        '<span class="note">额外伤害计为缠结伤害，在所有交互中均如此</span>。</p>',

    ('art-2', '焕光碎片'):
        '<p>处于<span class="orb">焕光</span>状态时，造成相当于敌人'
        '<span class="health">生命值</span>与<span class="pickup">护盾</span>之和 10% 的武器伤害，'
        '或用武器击杀<span class="el-solar">灼烧状态战斗人员</span>：</p>\n'
        '<p>目标释放 <span class="el-solar">1 枚烈日弹片</span>，造成 54 '
        '<span class="unsure">[?]</span> 点伤害与最多 289 <span class="unsure">[20]</span> '
        '点爆炸伤害，并在 ? 米范围内施加 <span class="el-solar">x20+0 灼烧</span>。</p>\n'
        '<p><span class="note">弹片生成有 1 秒冷却时间</span>。<br>'
        '<span class="note">弹片有轻微追踪，但经常会错过生成时瞄准的那个敌人</span>。</p>',

    ('art-2', '元素仁慈'):
        '<p>向<span class="enemy">盟友</span>施加<span class="pickup">元素增益</span>时：</p>\n'
        '<p>获得约 15% <span class="unsure">[?]</span> '
        '<span class="el-void">职业技能能量</span>。</p>\n'
        '<p><span class="note">每个盟友触发后各有 ? 秒冷却时间</span>。</p>',

    # 「表现为黄色数字」「与其他削弱叠加」是作者补注，金色与紫色改 note
    ('art-2', '灼烧暗影'):
        '<p>对<span class="enemy">非首领战斗人员</span>施加'
        '<span class="deb-solar">暗影减益</span>时：</p>\n'
        '<p><span class="el-solar">造成的烈日伤害提高 75%</span>。<br>'
        '<span class="note">表现为烈日伤害跳出黄色数字</span>。<br>'
        '<span class="note">与其他削弱来源按层数叠加</span>。</p>\n'
        '<p><span class="note">重复施加暗影减益以再次触发，需要 2? 秒冷却时间</span>。</p>',

    # 「50% 提升充能近战伤害」一律改成「…提高 50%」，与全页句式看齐
    ('art-2', '护盾粉碎'):
        '<p>当<span class="el-stasis">冰霜护甲</span>、'
        '<span class="pickup">虚空覆盖护盾</span>或<span class="el-strand">织造铠甲</span>激活时：<br>'
        '<span class="el-arc">近战充能速率</span>额外提高 ?% '
        '<span class="unsure">[?%]</span>。<br>'
        '<span class="el-arc">充能近战伤害</span>提高 50% '
        '<span class="unsure">[5%]</span>。<br>'
        '<span class="note">超能近战伤害同样提高</span>。</p>\n'
        '<p>当<span class="el-arc">增幅</span>或<span class="el-solar">焕光</span>激活时：<br>'
        '<span class="el-solar">手雷充能速率</span>额外提高 ?% '
        '<span class="unsure">[?%]</span>。<br>'
        '<span class="el-solar">手雷伤害</span>提高 25% <span class="unsure">[5%]</span>。</p>\n'
        '<p><span class="note">抓钩近战改为提高 12% 伤害，特性的两半各提供一半</span>。</p>',

    ('art-2', '冰霜复兴'):
        '<p><span class="el-stasis">冰霜护甲</span>激活期间，'
        '<span class="enemy">护盾被战斗人员的伤害击破</span>时：</p>\n'
        '<p>在 10 米范围内释放<span class="el-stasis">冰影爆发</span>。<br>'
        '<span class="el-stasis">冰影爆发</span><span class="deb-stasis">冻结</span>敌人，'
        '并为使用者与<span class="enemy">范围内的盟友</span>各提供一层'
        '<span class="el-stasis">冰霜护甲</span>。</p>',

    # 元素对照表里「烈日」被染成电弧色，各归各的元素
    ('art-2', '元素眩晕'):
        '<p>用<span class="pickup">元素武器</span><span class="enemy">眩晕勇士</span>时：</p>\n'
        '<p>触发一次<span class="pickup">元素匹配爆炸</span>，造成最多 '
        '<span class="pickup">315 点元素伤害</span>，并在 5 米范围内施加'
        '<span class="pickup">对应的元素减益</span>（伤害向外递减至 0%）。</p>\n'
        '<p><span class="el-arc">电弧</span>：<span class="deb-arc">震颤</span> | '
        '<span class="el-solar">烈日</span>：<span class="deb-solar">点燃</span> | '
        '<span class="el-void">虚空</span>：<span class="deb-void">不稳定</span><br>'
        '<span class="el-stasis">冰影</span>：<span class="deb-stasis">冻结</span> | '
        '<span class="el-strand">缚丝</span>：<span class="deb-strand">割裂</span></p>\n'
        '<p><span class="note">对动能武器无效</span>。</p>',

    ('art-2', '元素超驰'):
        '<p>拾取<span class="pickup">元素拾取物</span>时：</p>\n'
        '<p><span class="pickup">与拾取物类型匹配的武器伤害</span>提高 22% '
        '<span class="unsure">[?%]</span>，持续 7 秒。<br>'
        '<span class="note">显示为武器激涌，但与武器激涌是乘算</span>。</p>',

    ('art-2', '群敌飞梭'):
        '<p>对<span class="deb-strand">被瓦解的敌人</span>造成相当于其'
        '<span class="health">生命值</span>与<span class="el-stasis">护盾</span>之和 10% '
        '<span class="unsure">[100? 生命值]</span> 的武器伤害时：</p>\n'
        '<p>生成一个<span class="el-strand">线虫</span>。<br>'
        '<span class="note">生成线虫有 0.5 秒冷却时间</span>。</p>\n'
        '<p><span class="el-strand">线虫</span>造成伤害时施加'
        '<span class="deb-strand">割裂</span>。</p>',

    ('art-2', '并肩作战'):
        '<p>在 <span class="enemy">2 名盟友</span> 15 米范围内持续造成'
        '<span class="stack">精准伤害</span>时：</p>\n'
        '<p>获得 <span class="enemy">25% 伤害抗性（抵抗 x2）</span>，持续 10 ? 秒。</p>',

    ('art-2', '纠缠罗网'):
        '<p>击杀<span class="deb-strand">受到缚丝减益的战斗人员</span>时：</p>\n'
        '<p>触发一次<span class="deb-strand">悬停爆破</span>。<br>'
        '<span class="note">仅在生成<span class="deb-strand">缠结</span>时触发</span>。</p>',

    ('art-2', '醒神丝线'):
        '<p>拾取一个<span class="orb">与超能元素匹配的</span>'
        '<span class="pickup">元素拾取物</span>时：</p>\n'
        '<p>为充能最少的技能提供 <span class="pickup">25% 技能能量</span>。<br>'
        '<span class="el-strand">缠结</span>也会触发。</p>\n'
        '<p><span class="note">两次触发之间有 0.3 秒冷却</span>。<br>'
        '<span class="note">不会对已有至少 1 层充能的技能触发</span>。</p>',

    ('art-2', '元素聚合'):
        '<p>击杀足够数量的敌人后：<br>生成一个与<span class="orb">超能元素</span>匹配的'
        '<span class="pickup">元素拾取物</span>。</p>\n'
        '<p>所需击杀数因<span class="pickup">元素拾取物</span>而异：<br>'
        '<span class="el-solar">焰灵</span>、<span class="el-void">虚空裂口</span>：'
        '4–7 次击杀。<br><span class="el-arc">离子轨迹</span>、'
        '<span class="el-stasis">冰影碎片</span>、<span class="el-strand">缠结</span>：'
        '9–11 次击杀。</p>\n'
        '<p>会触发<span class="el-solar">焰灵</span>、<span class="el-void">虚空裂口</span>'
        '与<span class="el-strand">缠结</span>的<span class="note">全局冷却</span>。<br>'
        '<span class="note">冷却期间的击杀不计入下一个拾取物</span>。</p>\n'
        '<p><span class="note">伤害类型与超能元素匹配时没有额外加成</span>。</p>',

    ('art-2', '极寒凝视'):
        '<p><span class="el-stasis">冰霜护甲</span>激活期间，用'
        '<span class="el-stasis">冰影武器</span>取得<span class="stack">精准击杀</span>：</p>\n'
        '<p>在敌人死亡位置触发一次<span class="deb-stasis">冰冻爆发</span>，'
        '影响 7 米内的敌人。</p>',

    ('art-2', '集群战术'):
        '<p>造成<span class="el-strand">线虫伤害</span>时：<br>'
        '获得一层<span class="el-strand">集群战术</span>，持续 10 秒，'
        '最多叠加至 <span class="el-strand">2 层</span>。<br>'
        '再次造成<span class="el-strand">线虫伤害</span>会刷新持续时间。</p>\n'
        '<p><span class="el-strand">集群战术 x1</span> | '
        '<span class="el-strand">线虫伤害提高 15%</span>。<br>'
        '<span class="el-strand">集群战术 x2</span> | '
        '<span class="el-strand">线虫伤害提高 30%</span>。</p>\n'
        '<p><span class="el-strand">线虫伤害</span>会眩晕'
        '<span class="enemy">势不可挡勇士</span>。</p>',

    ('art-2', '鲜弹芬芳'):
        '<p>拾取<span class="ammo-heavy">弹药盒</span>时：</p>\n'
        '<p>获得<span class="el-kinetic">动能武器激涌</span>，持续 11 秒。<br>'
        '<span class="el-strand">特殊弹药盒</span> = '
        '<span class="el-kinetic">x2 动能武器激涌</span>。<br>'
        '<span class="ammo-heavy">威能弹药盒</span> = '
        '<span class="el-kinetic">x3 动能武器激涌</span>。</p>\n'
        '<p><span class="note">不会覆盖更强的武器激涌</span>。</p>',

    ('art-2', '钢铁领主的活力'):
        '<p>在 3 秒内用刀剑取得 3 次击杀：</p>\n'
        '<p>获得 <span class="ammo-heavy">+3 弹药</span>。<br>'
        '<span class="orb">英勇利刃</span>与<span class="orb">故我在</span>改为获得 '
        '<span class="ammo-heavy">+1 弹药</span>。</p>\n'
        '<p><span class="note">与描述相反，它不提供任何伤害抗性</span>。</p>',

    ('art-2', '半自动强袭'):
        '<p><span class="enemy">护甲充能</span>低于 <span class="el-stasis">2</span> 层，'
        '且在 3 秒内用弓、狙击步枪或斥候步枪造成'
        '<span class="stack">多次精准命中</span>时：</p>\n'
        '<p>获得一层<span class="enemy">护甲充能</span>。</p>\n'
        '<p><span class="stack">多次精准命中</span>的次数要求：<br>'
        '斥候步枪 = 5 | 弓 = 3 | 狙击步枪 = 2</p>',

    ('art-2', '能量加速'):
        '<p>在 3 秒内造成 2 次非同时的微型导弹伤害，或取得一次微型导弹击杀后：</p>\n'
        '<p>目标释放一道<span class="el-kinetic">动能冲击波</span>，对 7 米范围内的敌人造成 '
        '120 <span class="unsure">[20]</span> 点<span class="el-kinetic">动能伤害</span>，'
        '并<span class="enemy">眩晕势不可挡勇士</span>。<br>'
        '<span class="el-kinetic">冲击波</span>无伤害衰减。<br>'
        '<span class="note">触发后进入 ? 秒冷却时间</span>。</p>',

    # 「弑神狩猎箭头」只此一处，与全篇的「弑神箭头」并轨
    ('art-2', '银白箭袋'):
        '<p><span class="enemy">护甲充能</span>激活时：</p>\n'
        '<p>装填弓可获得 3 层<span class="deb-arc">弑神箭头</span>。<br>'
        '收起武器会移除所有层数。</p>\n'
        '<p>持有<span class="deb-arc">弑神箭头</span>时开火：<br>'
        '消耗 1 层以提高伤害，并获得 +? 装填速度。</p>\n'
        '<p><span class="el-kinetic">主武器</span> = 对战斗人员伤害提高 35%。<br>'
        '<span class="ammo-heavy">威能武器</span> = 对战斗人员伤害提高 25%。<br>'
        '<span class="note">层数与所有效果叠加</span>。</p>',

    # ── art-3 废墟石板（异端）────────────────────────────────────────
    ('art-3', '死守防线'):
        '<p>15 米范围内有 3 名敌人，且装备偃月或机枪时：</p>\n'
        '<p>偃月与<span class="ammo-heavy">机枪</span>各获得 +? 稳定性与 +30 装填速度。<br>'
        '偃月的<span class="el-strand">射弹</span>、<span class="el-arc">近战</span>或'
        '<span class="ammo-heavy">机枪</span>击杀可'
        '<span class="health">恢复 55 点生命值</span>。</p>\n'
        '<p>条件不再满足后，<span class="el-arc">属性加成</span>再持续 5 秒。<br>'
        '<span class="note">击杀回血效果不会延续</span>。</p>',

    ('art-3', '邪恶编织'):
        '<p><span class="el-strand">缠结</span>造成伤害时施加'
        '<span class="deb-strand">割裂</span>，持续 10 <span class="el-strand">+5</span> 秒。</p>\n'
        '<p>拾取<span class="el-strand">缠结</span>时：<br>'
        '<span class="el-strand">缠结冷却时间</span>减少 4 秒。</p>\n'
        '<p><span class="note">可由<span class="orb">摩伊拉</span>的线织尖刺击中缠结触发，'
        '也可由<span class="orb">卢扎卡的丰饶之巢</span>产出的缠结触发</span>。</p>',

    # 「粒子重建削弱」被切成三个不同颜色的 span；末段各武器的触发条件排成列表
    ('art-3', '粒子重建'):
        '<p>（线性）融合步枪命中时施加一个<span class="deb-void">独特的可叠加削弱</span>，'
        '提高自身对该目标的伤害。<br>各层对应：'
        '<span class="deb-void">5% | 10.25% | 15.8% | 21.6% | 27.6%</span>。<br>'
        '<span class="deb-void">30% 削弱</span>会覆盖'
        '<span class="deb-void">粒子重建削弱</span>；'
        '<span class="orb">神圣裁决</span>的泡泡会把它压到 <span class="deb-void">15%</span>。</p>\n'
        '<p>多次直接命中会补充 10% 的弹匣，向上取整。<br>'
        '<span class="note">融合步枪的弹匣中每一发弹药通常都算一次命中；'
        '攻击融合步枪（含<span class="orb">库尔之影</span>）例外，每两次点射才触发一次</span>。</p>\n'
        '<p><span class="ammo-heavy">精密线性融合步枪</span>：弹匣 + 2<br>'
        '<span class="ammo-heavy">适配点射线性融合步枪</span>：3 x（弹匣 + 4）</p>\n'
        '<p>以下武器的触发条件另计：<br>'
        '<span class="orb">堡垒</span> = 每 7 次点射<br>'
        '<span class="orb">悦耳之声</span> = <span class="el-strand">线虫</span>算作命中，'
        '否则需要 30 次命中（8 次点射）<br>'
        '<span class="orb">精致坟墓</span> = 每 3 次完整点射<br>'
        '<span class="orb">冰霜巨人</span> = 8 次射击后<br>'
        '<span class="orb">Vex 揭秘者</span> = 每 25 次命中</p>',

    ('art-3', '电介质'):
        '<p>击杀<span class="deb-arc">电弧减益敌人</span>：</p>\n'
        '<p>获得 <span class="el-arc">x1 电光充能</span>。</p>\n'
        '<p>在 6 秒内连续击杀 3 名<span class="deb-arc">电弧减益敌人</span>：<br>'
        '生成一个<span class="orb">能量球</span>，提供 <span class="orb">7.15% 超能能量</span>，'
        '并<span class="health">恢复 40 点生命值</span>。</p>',

    ('art-3', '邪恶收割'):
        '<p>在 5 秒内<span class="pickup">施加不稳定</span> 4 次时：</p>\n'
        '<p>接下来 10 秒内的下一次<span class="el-void">虚空</span>伤害会释放一个'
        '<span class="deb-void">削弱爆发</span>，影响 7 米内的敌人。</p>\n'
        '<p>对<span class="pickup">尚未被削弱的敌人</span>施加'
        '<span class="deb-void">削弱</span>时：<br>'
        '<span class="pickup">虚空覆盖护盾生命值 +25</span>，'
        '持续 10 <span class="el-void">+5</span> 秒。<br>'
        '<span class="note">每个削弱来源只触发一次，例如'
        '<span class="ammo-heavy">烟雾弹</span>不会重复触发</span>。</p>\n'
        '<p><span class="note">用法夫纳或牵引器火炮时不会获得虚空覆盖护盾</span>。</p>',

    ('art-3', '元素超充器'):
        '<p>用<span class="orb">与超能元素匹配的武器</span>击杀'
        '<span class="health">疲惫</span>或<span class="deb-strand">割裂</span>状态的敌人时：</p>\n'
        '<p>额外获得 <span class="orb">2?% 超能技能能量</span>。</p>',

    ('art-3', '不稳定神枪手'):
        '<p>在 3 秒内用<span class="el-void">虚空武器</span>造成多次'
        '<span class="stack">精准命中</span>，或在 3 秒内取得 3 次击杀：</p>\n'
        '<p>获得<span class="pickup">不稳定弹药</span>，持续 10 '
        '<span class="unsure">[6]</span> 秒。</p>\n'
        '<p><span class="stack">多次精准命中</span>的次数要求：<br>'
        '<span class="stack">（弹匣容量的 25%）+ 1</span>，向下取整；'
        '弓为 <span class="stack">2</span> 次。</p>\n'
        '<p>触发<span class="pickup">不稳定爆炸</span>可获得 '
        '<span class="el-void">10% 职业技能能量</span>。</p>',

    # 两行伤害构成的标签原本吊在行尾，提到行首
    ('art-3', '闪电过载'):
        '<p>达到 <span class="el-arc">x10 电光充能</span>时：<br>'
        '获得<span class="el-arc">增幅</span>，持续 15 秒。</p>\n'
        '<p><span class="el-arc">闪电过载对战斗人员的伤害提高 50%</span>：<br>'
        '<span class="el-arc">基础：405 伤害 + 270 溅射 = 675</span><br>'
        '<span class="el-arc">闪电过载：608 伤害 + 406 溅射 = 1014</span></p>\n'
        '<p><span class="note">不会提高对守护者的伤害</span>。</p>',

    ('art-3', '重型军械回复'):
        '<p>在 7 秒内造成 <span class="ammo-heavy">8 次机枪伤害</span>或 '
        '<span class="ammo-heavy">2 次火箭发射器伤害</span>时：</p>\n'
        '<p>获得 <span class="enemy">25% <span class="unsure">[5%]</span> 伤害抗性</span>'
        '（抵抗 x2），持续 15.5 秒。<br>'
        '<span class="el-solar">手雷</span>与<span class="el-arc">近战</span>技能的'
        '基础充能速率额外提高 85%，持续 10 秒。</p>\n'
        '<p>当<span class="ammo-heavy">威能军械</span>激活时：<br>'
        '击杀<span class="enemy">精英 + 战斗人员</span>会'
        '<span class="el-kinetic">使 10 米内的普通战斗人员迷失方向</span>。</p>',

    ('art-3', '瓦解能量球'):
        '<p>拾取<span class="orb">能量球</span>或<span class="el-strand">缠结</span>时：</p>\n'
        '<p>获得<span class="deb-strand">瓦解弹药</span>，'
        '持续 14 <span class="unsure">[?]</span> 秒。</p>',

    ('art-3', '群敌飞梭'):
        '<p>对<span class="deb-strand">被瓦解的敌人</span>造成相当于其'
        '<span class="health">生命值</span>与<span class="el-stasis">护盾</span>之和 10% '
        '<span class="unsure">[100? 生命值]</span> 的武器伤害时：</p>\n'
        '<p>生成一个<span class="el-strand">线虫</span>。<br>'
        '<span class="note">生成线虫有 0.5 秒冷却时间</span>。</p>\n'
        '<p><span class="el-strand">线虫</span>造成伤害时施加'
        '<span class="deb-strand">割裂</span>。</p>',

    ('art-3', '除颤爆破'):
        '<p><span class="enemy">眩晕</span>一名<span class="enemy">勇士</span>时：<br>'
        '获得 <span class="el-arc">x10 电光充能</span>。</p>\n'
        '<p><span class="el-arc">闪电过载的溅射伤害部分</span>会施加'
        '<span class="deb-arc">震颤</span>。</p>\n'
        '<p>触发<span class="el-arc">闪电过载</span>时：<br>'
        '<span class="health">恢复约 55 点生命值</span>，并'
        '<span class="health">开始生命回复</span>。<br>'
        '<span class="note">但不会重新开始<span class="el-stasis">护盾</span>充能</span>。</p>',

    # 「致盲」是电弧减益，源表格却染成动能灰
    ('art-3', '光子耀斑'):
        '<p>用<span class="el-arc">电弧</span>击杀<span class="health">疲惫</span>或'
        '<span class="deb-strand">割裂</span>状态的敌人时：</p>\n'
        '<p>触发一次<span class="deb-arc">致盲爆发</span>，'
        '<span class="deb-arc">致盲</span> 5 米内的敌人。<br>'
        '<span class="note">触发有 6 秒冷却时间</span>。</p>',

    ('art-3', '静铃无响'):
        '<p>在 3 秒内取得 <span class="el-arc">2 次偃月近战击杀</span>时：<br>'
        '为<span class="el-strand">特殊弹药偃月</span>补充 '
        '<span class="el-strand">+2 备用弹药</span>。</p>\n'
        '<p>用<span class="pickup">偃月护盾</span>格挡伤害时：<br>'
        '<span class="el-arc">偃月近战伤害</span>提高 85% '
        '<span class="unsure">[?%]</span>，持续 6 秒。<br>'
        '<span class="note"><span class="enemy">友方</span>射击该'
        '<span class="pickup">护盾</span>也会触发</span>。</p>',

    ('art-3', '虚空助焊'):
        '<p>用<span class="el-void">虚空武器</span>'
        '<span class="deb-void">击杀被削弱的敌人</span>时：</p>\n'
        '<p>对 ? 米内的敌人施加<span class="pickup">不稳定</span>。<br>'
        '对<span class="enemy">精英 +</span> <span class="unsure">[?]</span> 战斗人员与'
        '<span class="enemy">守护者</span> <span class="unsure">[?]</span>，'
        '范围扩大至 ? 米。</p>',

    ('art-3', '元素虹吸'):
        '<p>用<span class="el-kinetic">动能武器</span>或'
        '<span class="orb">与超能元素匹配的武器</span>在 3 秒内取得 3 次击杀时：</p>\n'
        '<p>生成一个与所装备<span class="orb">超能元素</span>匹配的'
        '<span class="pickup">元素拾取物</span>。</p>\n'
        '<p>拾取<span class="pickup">元素拾取物</span>时：<br>'
        '获得 5% <span class="unsure">[1%]</span> '
        '<span class="pickup">对应元素的超能技能</span>充能。<br>'
        '<span class="note">两次额外充能之间有 2 秒冷却时间</span>。</p>',

    # ↓ 箭头原本被染成 note 与动能灰，减益各归各的元素
    ('art-3', '严酷折射'):
        '<p>对受到<span class="deb-void">元素匹配减益</span>的敌人造成 3 次追踪步枪命中时：<br>'
        '追踪步枪伤害提高，持续 4 秒。</p>\n'
        '<p>传说追踪步枪 = 50%<br>'
        '<span class="orb">异域</span><span class="el-strand">特殊追踪步枪</span>与'
        '<span class="orb">北极星</span> = 35%</p>\n'
        '<p><span class="orb">缩影</span>对受到<span class="deb-void">任意元素减益</span>的敌人'
        '造成 4 次命中后，伤害提高 20%。</p>\n'
        '<p><span class="el-arc">电弧</span> = ↓<span class="deb-arc">致盲</span> '
        '↓<span class="deb-arc">震颤</span><br>'
        '<span class="el-solar">烈日</span> = ↓<span class="deb-solar">灼烧</span> '
        '↓<span class="deb-solar">点燃</span><br>'
        '<span class="el-void">虚空</span> = ↓<span class="deb-void">压制</span> '
        '↓<span class="deb-void">不稳定</span> ↓<span class="deb-void">削弱</span><br>'
        '<span class="el-stasis">冰影</span> = ↓<span class="deb-stasis">减速</span> '
        '↓<span class="deb-stasis">冻结</span> ↓<span class="deb-stasis">碎裂</span><br>'
        '<span class="el-strand">缚丝</span> = ↓<span class="deb-strand">割裂</span> '
        '↓<span class="deb-strand">悬停</span> ↓<span class="deb-strand">瓦解</span></p>',

    ('art-3', '极限突破'):
        '<p><span class="orb">释放超能</span>时处于<span class="health">低生命值</span>，'
        '或拥有<span class="pickup">元素匹配增益</span>：</p>\n'
        '<p><span class="orb">超能技能伤害提高 15%</span>。<br>'
        '<span class="orb">一次性超能</span>只获得 8 秒加成，'
        '<span class="orb">持续型超能</span>的加成持续到结束。</p>\n'
        '<p><span class="el-arc">电弧</span> = ↑<span class="el-arc">增幅</span> '
        '↑<span class="el-arc">电光充能</span><br>'
        '<span class="el-solar">烈日</span> = ↑<span class="health">治愈</span> '
        '↑<span class="el-solar">焕光</span> ↑<span class="health">恢复</span><br>'
        '<span class="el-void">虚空</span> = ↑<span class="el-void">吞食</span> '
        '↑<span class="el-void">隐身</span> ↑<span class="pickup">虚空覆盖护盾</span><br>'
        '<span class="el-stasis">冰影</span> = ↑<span class="el-stasis">冰霜护甲</span><br>'
        '<span class="el-strand">缚丝</span> = ↑<span class="el-strand">织造铠甲</span></p>',

    ('art-3', '永恒毁灭'):
        '<p>2–3 秒内的每次<span class="note">非异域</span>'
        '<span class="ammo-heavy">火箭发射器击杀</span>都会'
        '<span class="ammo-heavy">推进计数器</span>：<br>'
        '<span class="enemy">普通敌人</span> = <span class="ammo-heavy">25%</span> | '
        '<span class="enemy">精英</span> = <span class="ammo-heavy">34%</span> | '
        '<span class="enemy">小头目</span> = <span class="ammo-heavy">100%</span></p>\n'
        '<p>计数器达到 <span class="ammo-heavy">100%</span> 时：<br>'
        '<span class="ammo-heavy">火箭发射器</span>获得 '
        '<span class="ammo-heavy">+1 弹药</span>，'
        '<span class="ammo-heavy">精密框架火箭发射器</span>'
        '（或任何带双脚架的框架）获得 <span class="ammo-heavy">+2 弹药</span>。<br>'
        '同时获得 +? 装填速度与 0.?x 装填持续时间倍率，持续 10 秒。<br>'
        '<span class="note">不受回收器模组影响</span>。</p>',

    ('art-3', '弹中藏金'):
        '<p>拾取 <span class="el-strand">5–6 个特殊弹药盒</span>时：<br>'
        '<span class="ammo-heavy">生成 8% 威能弹药</span>，向上取整。</p>\n'
        '<p><span class="note"><span class="el-strand">拾取计数器</span>在死亡时重置；'
        '不受回收器模组影响；在熔炉竞技场中无效</span>。</p>',

    ('art-3', '崩解'):
        '<p>对<span class="deb-strand">割裂状态的敌人</span>造成 6 次武器伤害时：<br>'
        '施加<span class="deb-strand">瓦解</span>。</p>\n'
        '<p>击杀<span class="deb-strand">割裂状态的敌人</span>时：<br>'
        '在敌人死亡位置释放 <span class="health">3 个治疗脉冲</span>，每 2 秒一次，'
        '各<span class="health">恢复 15 点生命值</span>，并为使用者与 10 米内的'
        '<span class="enemy">盟友</span>提供<span class="el-strand">织造铠甲</span>，'
        '持续 <span class="el-strand">10 秒</span>。</p>',

    # ── art-4 杀手公爵药剂师背包（怨魂）──────────────────────────────
    ('art-4', '风寒'):
        '<p>在 3 秒内对同一目标造成<span class="el-stasis">多次'
        '<span class="note">非同时的</span>冰影武器伤害</span>时：<br>'
        '获得一层<span class="el-stasis">冰霜护甲</span>。</p>\n'
        '<p><span class="note">两次触发之间有 0.45 秒冷却，冷却期间的额外命中不计；'
        '收起武器时计数器重置</span>。</p>\n'
        '<p>触发<span class="el-stasis">冰霜护甲</span>所需的命中次数：<br>'
        '弓：3 | 单发榴弹发射器、刀剑：2 | 其余为（弹匣的 35%，向下取整）+ 2<br>'
        '<span class="note">无需手持冰影武器，按当前武器的弹匣计算</span>。</p>\n'
        '<p>在 3 秒内对<span class="el-stasis">减速的敌人</span>造成'
        '<span class="el-stasis">多次冰影武器伤害</span>时：<br>'
        '在敌人上方生成一个<span class="el-stasis">冰影碎片</span>。<br>'
        '所需命中次数为弓：3 | 单发榴弹发射器、刀剑：2 | '
        '其余为（弹匣的 25%，向下取整）+ 2。</p>',

    ('art-4', '冰霜复兴'):
        '<p><span class="el-stasis">冰霜护甲</span>激活期间，'
        '<span class="enemy">护盾被战斗人员的伤害击破</span>时：</p>\n'
        '<p>在 10 米范围内释放<span class="el-stasis">冰影爆发</span>。<br>'
        '<span class="el-stasis">冰影爆发</span><span class="deb-stasis">冻结</span>敌人，'
        '并为使用者与<span class="enemy">范围内的盟友</span>各提供一层'
        '<span class="el-stasis">冰霜护甲</span>。</p>',

    ('art-4', '寒脑凝滞'):
        '<p><span class="deb-stasis">被冻结的敌人</span>会对 4 米内'
        '<span class="el-stasis">尚未受冰影减益影响</span>的敌人施加 '
        '<span class="el-stasis">x? 减速</span>。</p>',

    # 源表格里混着英文 or；碎片数与水晶数两行本是一张对照表
    ('art-4', '晶体转换器'):
        '<p>拾取<span class="el-stasis">冰影碎片</span>会推进'
        '<span class="el-stasis">晶体转换器计数器</span>。</p>\n'
        '<p>造成<span class="el-stasis">冰影近战伤害</span>或'
        '<span class="el-stasis">钻石长矛伤害</span>时：<br>'
        '消耗<span class="el-stasis">晶体转换器计数器</span>，'
        '按已拾取的<span class="el-stasis">碎片</span>数量生成'
        '<span class="el-stasis">水晶</span>——<br>'
        '<span class="el-stasis">拾取 8 | 12 | 15 个碎片，'
        '分别生成 1 | 2 | 3 个水晶</span>。</p>\n'
        '<p>使用<span class="pickup">职业技能</span>时：<br>'
        '下一次<span class="el-stasis">冰影武器击杀</span>会生成一个'
        '<span class="el-stasis">冰影碎片</span>。</p>',

    ('art-4', '迎接风暴'):
        '<p><span class="deb-stasis">击碎</span><span class="el-stasis">冰影水晶</span>时：</p>\n'
        '<p>呈 * 形释放 <span class="el-stasis">5 枚追踪冰刺</span>，每枚造成 46 点伤害，'
        '并施加 <span class="el-stasis">x? <span class="unsure">[x10]</span> 减速</span>，'
        '持续 ? 秒。<br>'
        '<span class="note">冰刺均匀散开，其中一枚会飞向最近的敌人</span>。</p>\n'
        '<p>在<span class="deb-stasis">敌人身上击碎</span>额外造成 12.5% '
        '<span class="unsure">[?%]</span> 伤害；'
        '<span class="el-stasis">击碎水晶</span>额外造成 25% '
        '<span class="unsure">[?%]</span> 伤害。</p>',

    ('art-4', '超新星'):
        '<p>拾取<span class="el-void">虚空裂口</span>时：</p>\n'
        '<p>10 秒内的下一次<span class="el-void">虚空</span>伤害会释放一个'
        '<span class="deb-void">削弱爆发</span>，对 5 米内的敌人施加'
        '<span class="deb-void">削弱</span>。</p>',

    ('art-4', '大肆屠杀'):
        '<p><span class="enemy">消灭</span>一个<span class="enemy">精英 + 战斗人员</span>时：</p>\n'
        '<p><span class="health">恢复 100 点生命值</span>，并'
        '<span class="health">开始生命回复</span>。<br>'
        '获得 <span class="health">25% 伤害抗性</span>'
        '<span class="enemy">（抵抗 x2）</span>，持续 11 秒。</p>',

    ('art-4', '弱化波'):
        '<p><span class="enemy">消灭</span>一个<span class="enemy">战斗人员</span>时：</p>\n'
        '<p>触发一道波形，造成 <span class="enemy">180 点超能元素匹配伤害</span>，'
        '最远波及 15 米。<br>'
        '<span class="note">波会朝终结技的方向推进，并追踪敌人</span>。</p>\n'
        '<p>装备<span class="el-arc">电弧</span>、<span class="el-void">虚空</span>或'
        '<span class="el-stasis">冰影超能</span>时，'
        '<span class="pickup">波</span>会额外施加'
        '<span class="pickup">与超能元素匹配的减益</span>：</p>\n'
        '<p><span class="el-arc">电弧</span> = <span class="deb-arc">致盲</span><br>'
        '<span class="el-void">虚空</span> = <span class="deb-void">削弱</span><br>'
        '<span class="el-stasis">冰影</span> = <span class="deb-stasis">减速</span></p>',

    ('art-4', '传导宇宙水晶'):
        '<p>对<span class="el-stasis">冰影减益敌人</span>：</p>\n'
        '<p><span class="el-arc">电弧</span>与<span class="el-void">虚空</span>'
        '技能伤害提高 5%?</p>',

    ('art-4', '苦痛之力'):
        '<p>在 4 秒内连续击杀 <span class="deb-void">3 名被削弱的敌人</span>：</p>\n'
        '<p>获得<span class="el-void">吞食</span>，持续 5 <span class="el-void">+2.5</span> 秒，'
        '并生成一个<span class="el-void">虚空裂口</span>。</p>\n'
        '<p>本应造成<span class="deb-void">削弱</span>的命中，即使当场击杀敌人也计入。</p>',

    ('art-4', '削弱清敌'):
        '<p>用榴弹发射器对<span class="enemy">首领</span>或<span class="enemy">勇士</span>'
        '造成伤害，或击破<span class="enemy">战斗人员的护盾</span>时：</p>\n'
        '<p>施加<span class="deb-void">削弱</span>，持续 20 秒，'
        '同时装填已收起的武器。</p>\n'
        '<p><span class="note">该减益无法由榴弹发射器自己刷新，但可以由任何其他来源重新施加；'
        '施加削弱与装填各有 10 秒冷却时间</span>。</p>',

    ('art-4', '冰冷伺候'):
        '<p><span class="el-stasis">冰影碎片</span>额外提供 '
        '<span class="el-void">10% 职业技能能量</span>。</p>\n'
        '<p><span class="el-void">虚空裂口</span>额外提供 '
        '<span class="el-arc">10?% 近战技能能量</span>。</p>',

    ('art-4', '轨迹证据'):
        '<p>在 1? 秒内对<span class="el-arc">受到电弧减益的敌人</span>造成 '
        '<span class="stack">2 次精准命中</span>，或在 ? 秒内击杀 '
        '<span class="el-arc">3 名受到电弧减益的敌人</span>：</p>\n'
        '<p>生成一个<span class="el-arc">离子轨迹</span>。<br>'
        '<span class="note">离子轨迹生成有 4 秒冷却时间</span>。</p>\n'
        '<p>拾取<span class="el-arc">离子轨迹</span>时：<br>'
        '获得一层<span class="enemy">护甲充能</span>。</p>',

    ('art-4', '视网膜灼烧'):
        '<p><span class="enemy">护甲充能</span>激活期间，于 ? 秒内对'
        '<span class="enemy">尚未致盲的战斗人员</span>造成 <span class="stack">2 次</span>'
        '<span class="el-arc">电弧武器</span><span class="stack">精准命中</span>：</p>\n'
        '<p><span class="armor-charge">消耗 1 层护甲充能</span>，触发'
        '<span class="deb-arc">致盲爆发</span>，对 ? 米半径内的敌人施加'
        '<span class="deb-arc">致盲</span>，持续 ? 秒。</p>',

    # 末段两行数值表的标签原本吊在行尾
    ('art-4', '动能冲击'):
        '<p>在 3 秒内用<span class="ammo-heavy">威能榴弹发射器</span>造成 3 次非同时伤害，'
        '或用<span class="orb">主武器</span>／<span class="el-strand">特殊</span>榴弹发射器'
        '造成单次<span class="note">非致命</span>伤害：</p>\n'
        '<p>在敌人脚下触发一次<span class="el-kinetic">冲击波</span>，造成 '
        '<span class="el-kinetic">227x2 = 454 点动能伤害</span>，'
        '并在 7 米范围内<span class="enemy">踉跄并眩晕势不可挡勇士</span>。<br>'
        '来自<span class="orb">主武器</span>与<span class="el-strand">特殊</span>'
        '榴弹发射器的冲击波只造成 <span class="el-kinetic">150x2 伤害</span>。<br>'
        '<span class="note">冲击波无伤害衰减；两次结算之间有 1 秒冷却时间</span>。</p>\n'
        '<p>造成榴弹发射器伤害时：<br>'
        '获得一层<span class="stack">快速冲击</span>，持续 5 秒，最多叠加 5 层。<br>'
        '装填速度：+5 | +10 | +15? | +20? | +30<br>'
        '装填持续时间倍率：0.99x | 0.99x | 0.98x | 0.96x | 0.94x</p>',

    ('art-4', '置身其中'):
        '<p>15? 米范围内有 3? 名敌人，且在 ? 秒内击杀 3 名敌人时：<br>'
        '获得一层<span class="enemy">护甲充能</span>。</p>\n'
        '<p>15? 米范围内有 3? 名敌人时：<br>获得 +? 操控性与 +? 充能效率。</p>',

    ('art-4', '治疗能量球'):
        '<p>首次击破<span class="enemy">战斗人员护盾</span>或'
        '<span class="orb">超能状态下的</span><span class="unsure">守护者护盾</span>时：</p>\n'
        '<p>生成一个<span class="orb">能量球</span>，提供 '
        '<span class="orb">7.15% 超能能量</span>。<br>'
        '对尚未触发过该效果的<span class="enemy">战斗人员</span>使用'
        '<span class="enemy">终结技</span>也会生成一个<span class="orb">能量球</span>。</p>\n'
        '<p>拾取<span class="orb">能量球</span>、<span class="pickup">元素拾取物</span>'
        '或摧毁<span class="el-strand">缠结</span>时：<br>'
        '<span class="health">恢复 40 点生命值</span>。</p>',

    ('art-4', '电弧复合'):
        '<p><span class="el-arc">对致盲敌人造成的电弧伤害</span>提高 15% '
        '<span class="unsure">[7.5%]</span>。<br>'
        '<span class="note">与所有效果叠加</span>。</p>',

    ('art-4', '杀戮之风'):
        '<p>在 3 秒内用武器击杀 3 名敌人：</p>\n'
        '<p>获得 +? 敏捷，持续 7 秒。<br><span class="note">再次触发会刷新</span>。</p>',

    ('art-4', '虚空复兴'):
        '<p><span class="el-void">吞食</span>激活时：</p>\n'
        '<p><span class="el-void">虚空武器击杀</span>会推进计数器，'
        '达到 100% 时生成一个<span class="el-void">虚空裂口</span>：<br>'
        '<span class="enemy">普通战斗人员</span> = <span class="el-void">16.7%</span> | '
        '<span class="enemy">精英</span> = <span class="el-void">34%</span> | '
        '<span class="enemy">小头目 +</span> = <span class="el-void">50%</span> | '
        '<span class="unsure">守护者</span> = <span class="el-void">?%</span></p>\n'
        '<p>拾取<span class="el-void">虚空裂口</span>时：<br>'
        '获得 +? 操控性与 +? 装填速度，持续 ? 秒，'
        '并装满霰弹枪与榴弹发射器的弹药。</p>',

    ('art-4', '古神仪式'):
        '<p>拾取<span class="el-void">虚空裂口</span>时：</p>\n'
        '<p>10 秒内的下一次<span class="el-void">虚空武器伤害</span>会开启一个'
        '<span class="el-void">虚空门户</span>。</p>\n'
        '<p><span class="el-void">虚空门户</span>：<br>'
        '向约 10 米内的敌人释放 <span class="el-void">8 枚追踪虚空球</span>，'
        '每枚在约 3 米范围内造成最多 334 <span class="unsure">[?]</span> 点溅射伤害。<br>'
        '<span class="enemy">普通战斗人员</span>每枚<span class="el-void">球</span>受到 '
        '<span class="el-void">540 点伤害</span>，'
        '<span class="enemy">小头目 +</span> 每枚受到 '
        '<span class="el-void">180 点伤害</span>。</p>',

    # ── art-5 猎人日志（回响）────────────────────────────────────────
    # 本节是持续火力、瞄准自动填装器、震慑行动的基准，NPA 斥力调节器向这里对齐。

    # 原文自己写明与废墟石板的版本不同，这处差异保留，只把整句归回 note
    ('art-5', '元素虹吸'):
        '<p>用<span class="el-kinetic">动能武器</span>或'
        '<span class="orb">与超能元素匹配的武器</span>在 3 秒内连续击杀 3 名敌人时：</p>\n'
        '<p>生成一个与所装备<span class="orb">超能元素</span>匹配的'
        '<span class="pickup">元素拾取物</span>。</p>\n'
        '<p><span class="note">与废墟石板上的同名模组不同，此处不提供超能能量</span>。</p>',

    ('art-5', '反制能量'):
        '<p>每当<span class="enemy">勇士</span>被<span class="enemy">眩晕</span>时：</p>\n'
        '<p>为<span class="pickup">充能最少的技能</span>提供 '
        '<span class="pickup">25% 技能能量</span>。</p>',

    ('art-5', '棱镜转移'):
        '<p><span class="orb">释放超能</span>时：</p>\n'
        '<p>15 米内<span class="orb">超能元素</span>与<span class="orb">施法者</span>不同的'
        '<span class="enemy">盟友</span>获得 20% <span class="unsure">[10%]</span> 伤害加成，'
        '持续 10 <span class="unsure">[5]</span> 秒。</p>\n'
        '<p><span class="note">伤害加成不可刷新，也不与'
        '<span class="orb">焕光</span>一类的强化增益叠加</span>。</p>',

    ('art-5', '能量扩散基质'):
        '<p>获得 5%? 对<span class="enemy">战斗人员</span>的伤害抗性。</p>',

    ('art-5', '利刃耐力'):
        '<p>用<span class="ammo-heavy">刀剑</span>在 5 秒内连续击杀 '
        '<span class="enemy">3 名战斗人员</span>时：</p>\n'
        '<p>获得 <span class="ammo-heavy">+3 弹药</span>。<br>'
        '<span class="orb">英勇利刃</span>与<span class="orb">故我在</span>改为获得 '
        '<span class="ammo-heavy">+2 弹药</span>。</p>',

    ('art-5', '银白利刃'):
        '<p>造成<span class="ammo-heavy">刀剑伤害</span>时：<br>'
        '<span class="armor-charge">消耗</span>一层<span class="enemy">护甲充能</span>，'
        '获得<span class="ammo-heavy">银白利刃</span>，持续 5 秒。</p>\n'
        '<p><span class="ammo-heavy">银白利刃</span>：<br>'
        '刀剑伤害提高 15%，充能效率 +100。</p>\n'
        '<p><span class="note">与其他增益叠加；持续期间不会再'
        '<span class="armor-charge">消耗</span>额外的'
        '<span class="enemy">护甲充能</span></span>。</p>',

    ('art-5', '凉意袭人'):
        '<p>对<span class="el-stasis">冰影减益敌人</span>取得'
        '<span class="el-stasis">冰影击杀</span>时：<br>'
        '在 6 米范围内触发<span class="el-stasis">减速爆发</span>。</p>\n'
        '<p><span class="el-stasis">减速爆发</span>：<br>'
        '对敌人施加 <span class="el-stasis">x20 减速</span>，'
        '持续 2? <span class="el-stasis">+?</span> 秒。<br>'
        '为使用者与<span class="enemy">盟友</span>提供 '
        '<span class="enemy">x? 冰霜护甲</span>。</p>\n'
        '<p><span class="note">冰霜护甲部分实测无效</span>。</p>',

    ('art-5', '虚空霸权'):
        '<p>装备<span class="el-void">虚空</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业时：</p>\n'
        '<p>击杀<span class="deb-void">被削弱的敌人</span>可获得 '
        '<span class="pickup">15 点生命值的覆盖护盾</span>。</p>',

    ('art-5', '扩展深渊'):
        '<p>对<span class="deb-void">被削弱的敌人</span>造成的'
        '<span class="el-void">虚空伤害</span>提高。<br>'
        '削弱强度随之变化，括号内为实际伤害增幅：</p>\n'
        '<p><span class="unsure">7.5% → 10%（伤害提升 2.3%）</span><br>'
        '<span class="unsure">15% → 25%（伤害提升 8.7%）</span><br>'
        '<span class="deb-void">30% → 35%（伤害提升 3.8%）</span><br>'
        '<span class="deb-void">35% → 40%（伤害提升 3.7%）</span></p>\n'
        '<p><span class="note">神圣裁决的削弱效果不受影响</span>。</p>',

    ('art-5', '乘胜追击'):
        '<p>击破<span class="enemy">战斗人员护盾</span>：</p>\n'
        '<p><span class="el-kinetic">+20 稳定性，<br>+20 操控性，<br>'
        '+20 装填速度，持续 10 秒。<br>刀剑获得 +20 防御抗性</span>。</p>',

    ('art-5', '焕光能量球'):
        '<p>装备<span class="el-solar">烈日</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业时：</p>\n'
        '<p><span class="orb">能量球</span>额外提供<span class="orb">焕光</span>。</p>',

    ('art-5', '护盾粉碎'):
        '<p>当<span class="el-stasis">冰霜护甲</span>、'
        '<span class="pickup">虚空覆盖护盾</span>或<span class="el-strand">织造铠甲</span>激活时：<br>'
        '<span class="el-arc">近战充能速率</span>额外提高 ?% '
        '<span class="unsure">[?%]</span>。<br>'
        '<span class="el-arc">充能近战伤害</span>提高 50% '
        '<span class="unsure">[5%]</span>。<br>'
        '<span class="note">超能近战伤害同样提高</span>。</p>\n'
        '<p>当<span class="el-arc">增幅</span>或<span class="el-solar">焕光</span>激活时：<br>'
        '<span class="el-solar">手雷充能速率</span>额外提高 ?% '
        '<span class="unsure">[?%]</span>。<br>'
        '<span class="el-solar">手雷伤害</span>提高 25% <span class="unsure">[5%]</span>。</p>\n'
        '<p><span class="note">抓钩近战改为提高 12% 伤害，特性的两半各提供一半</span>。</p>',

    ('art-5', '线织爆破'):
        '<p>使用<span class="el-strand">缚丝</span>摧毁<span class="el-strand">缠结</span>时：</p>\n'
        '<p><span class="el-strand">爆炸</span>额外造成一次 288 '
        '<span class="unsure">[?]</span> 点<span class="el-strand">伤害</span>，'
        '在 17 米半径内衰减至 75%。<br>'
        '<span class="note">额外伤害计为缠结伤害，在所有交互中均如此</span>。</p>',

    ('art-5', '妨害振幅'):
        '<p>对<span class="enemy">勇士</span>造成<span class="el-arc">电弧技能伤害</span>时：</p>\n'
        '<p>对该<span class="enemy">勇士</span>施加<span class="deb-arc">震颤</span>。</p>',

    ('art-5', '转移'):
        '<p><span class="el-prismatic">超凡</span>激活期间：<br>'
        '手雷与近战伤害提高 <span class="el-solar">10%</span>。</p>\n'
        '<p><span class="el-prismatic">超凡</span>结束后：<br>'
        '每次武器击杀返还 <span class="el-prismatic">4.2%</span> 的'
        '<span class="el-arc">光能</span>与<span class="deb-solar">暗影</span>能量，'
        '最多累计至 <span class="el-prismatic">50%</span>（需要 12 次击杀）。</p>',

    ('art-5', '燃烧步枪弹药'):
        '<p>用<span class="el-solar">烈日狙击步枪</span>造成'
        '<span class="stack">精准命中</span>时：<br>'
        '施加 <span class="el-solar">x30+15 灼烧</span>。</p>\n'
        '<p><span class="note">不受武器框架与弹药类型影响</span>。</p>',

    ('art-5', '烈日爆发'):
        '<p><span class="el-solar">点燃</span>会额外造成一次伤害。</p>\n'
        '<p><span class="el-solar">爆燃</span>在 12 米半径内造成 171 '
        '<span class="unsure">[30]</span> 点<span class="el-solar">烈日伤害</span>，'
        '并视为<span class="el-solar">点燃</span>效果，'
        '没有伤害衰减 <span class="unsure">[待确认]</span>。</p>\n'
        '<p>装备<span class="el-solar">烧焦余烬</span>时：<br>'
        '<span class="el-solar">爆燃</span>额外施加 '
        '<span class="el-solar">x40+20 灼烧</span>。</p>',

    ('art-5', '狙击手冥想'):
        '<p>狙击步枪直接命中时：<br>获得一层<span class="orb">狙击手冥想</span>，持续 7 秒。<br>'
        '<span class="ammo-heavy">威能狙击步枪</span>命中提供 <span class="orb">2 层</span>。<br>'
        '<span class="orb">狙击手冥想</span>在收起武器后仍然保留。</p>\n'
        '<p><span class="orb">狙击手冥想</span>按层数提高伤害、稳定性与装填速度：<br>'
        '伤害：2.8% | 5.7% | 9% | 12% | 15%<br>'
        '稳定性：+? | +? | +? | +? | +?<br>'
        '装填速度：+15 | +30 | +35 | +40 | +45</p>',

    # 「抵抗 x2（25% 伤害减免）」与全页别处的「N% 伤害抗性（抵抗 xN）」并轨
    ('art-5', '持续火力'):
        '<p>在 1.5 秒内对<span class="enemy">同一名战斗人员</span>造成 '
        '10 次自动步枪命中时：</p>\n'
        '<p>获得 <span class="enemy">25% 伤害抗性（抵抗 x2）</span>，持续 6 秒。<br>'
        '<span class="note">该效果可刷新，收起武器后仍然保留</span>。</p>\n'
        '<p><span class="health">支援型自动步枪</span>可通过'
        '<span class="health">治疗受伤的盟友</span>触发。</p>',

    ('art-5', '瞄准自动填装器'):
        '<p>用自动步枪<span class="enemy">击杀战斗人员</span>会推进'
        '<span class="deb-void">计数器</span>：<br>'
        '普通击杀提供 <span class="deb-void">50% 进度</span>；<br>'
        '15 米内有 3 名敌人时，或已有 <span class="deb-void">5 层</span>时，'
        '击杀提供 <span class="deb-void">100% 进度</span>。<br>'
        '<span class="note">计数器进度在收起武器后保留</span>。</p>\n'
        '<p><span class="deb-void">计数器进度达到 100%</span> 时：<br>'
        '获得一层<span class="deb-void">瞄准自动填装器</span>，持续 15 秒，'
        '最多叠加至 <span class="deb-void">5 层</span>，可刷新。</p>\n'
        '<p><span class="deb-void">瞄准自动填装器</span>按层数生效：<br>'
        '装填弹匣：20% | 20% | 30% | 40% | 40%<br>'
        '自动步枪伤害提高：10% | 13% | 16% | 18% | 20%<br>'
        '<span class="note">与其他增益叠加；切换到<span class="note">非自动步枪</span>'
        '武器时移除</span>。</p>',

    ('art-5', '震慑行动'):
        '<p>装备<span class="el-arc">电弧</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业，且处于'
        '<span class="el-arc">增幅</span>状态时：</p>\n'
        '<p><span class="el-arc">电弧击杀</span>会触发一次'
        '<span class="el-arc">闪电爆发</span>，在 8 米半径内造成最多 126 '
        '<span class="unsure">[?]</span> 点<span class="el-arc">电弧伤害</span>，'
        '并施加<span class="deb-arc">震颤</span>。</p>\n'
        '<p><span class="note">两次触发之间有 5 秒冷却时间</span>。</p>',

    # ── art-6 女王兰香炉（终愿）──────────────────────────────────────
    ('art-6', '发热寒颤'):
        '<p>在 3 秒内对同一目标造成<span class="stack">多次精准命中</span>时：<br>'
        '<span class="el-solar">烈日武器</span>：获得<span class="orb">焕光</span>，'
        '持续 10 <span class="el-solar">+5</span> 秒。<br>'
        '<span class="el-stasis">冰影武器</span>：获得一层'
        '<span class="el-stasis">冰霜护甲</span>。</p>\n'
        '<p><span class="note">触发后有 1.5 秒冷却，冷却期间的额外命中不计</span>。</p>\n'
        '<p><span class="stack">多次精准命中</span>的次数要求：<br>'
        '（弹匣容量的 25%）+ 1，向下取整；弓为 3 次。</p>',

    ('art-6', '瓦解能量球'):
        '<p>拾取<span class="orb">能量球</span>或投掷<span class="el-strand">缠结</span>时：</p>\n'
        '<p>获得<span class="deb-strand">瓦解弹药</span>，'
        '持续 14 <span class="unsure">[?]</span> 秒。</p>',

    ('art-6', '群敌飞梭'):
        '<p>对<span class="deb-strand">被瓦解的敌人</span>造成相当于其'
        '<span class="health">生命值</span>与<span class="el-stasis">护盾</span>之和 10% '
        '<span class="unsure">[100? 生命值]</span> 的武器伤害时：</p>\n'
        '<p>生成一个<span class="el-strand">线虫</span>。<br>'
        '<span class="note">生成线虫有 0.5 秒冷却时间</span>。</p>\n'
        '<p><span class="el-strand">线虫</span>造成伤害时施加'
        '<span class="deb-strand">割裂</span>。</p>',

    ('art-6', '火炬'):
        '<p>处于<span class="orb">焕光</span>状态时：</p>\n'
        '<p>对受<span class="el-strand">缚丝</span>或<span class="el-stasis">冰影</span>'
        '减益影响的<span class="enemy">非头目战斗人员</span>，武器伤害提高 5%。</p>\n'
        '<p><span class="el-strand">缚丝减益</span>：'
        '<span class="deb-strand">瓦解、割裂、悬停</span><br>'
        '<span class="el-stasis">冰影减益</span>：'
        '<span class="deb-stasis">减速或冻结</span>。</p>',

    ('art-6', '冰柱'):
        '<p>击杀一个<span class="deb-stasis">被冻结的敌人</span>时：</p>\n'
        '<p>生成 <span class="el-stasis">1 个冰影水晶</span>，'
        '<span class="enemy">头目</span>则生成 <span class="el-stasis">2 个</span>。<br>'
        '<span class="note">水晶生成在敌人死亡位置附近</span>。</p>',

    ('art-6', '迎接风暴'):
        '<p>击碎<span class="el-stasis">冰影水晶</span>时：</p>\n'
        '<p>呈 * 形释放 <span class="el-stasis">5 枚追踪冰刺</span>，每枚造成 46 点伤害，'
        '并施加 <span class="el-stasis">x? <span class="unsure">[x10]</span> 减速</span>，'
        '持续 ? 秒。<br>'
        '<span class="note">冰刺均匀散开，其中一枚会飞向最近的敌人</span>。</p>\n'
        '<p>在<span class="deb-stasis">敌人身上击碎</span>额外造成 12.5% '
        '<span class="unsure">[?%]</span> 伤害；'
        '<span class="el-stasis">击碎水晶</span>额外造成 25% '
        '<span class="unsure">[?%]</span> 伤害。</p>',

    # 「超能伤害提高」的六档数值原本吊在标签之后，标签提到行首
    ('art-6', '烈焰之心'):
        '<p>释放<span class="el-solar">烈日超能</span>时：<br>'
        '<span class="orb">施法者</span>与 15 米内的<span class="enemy">盟友</span>获得'
        '<span class="orb">焕光</span>。</p>\n'
        '<p>按<span class="enemy">盟友数量</span>提供<span class="orb">超能伤害加成</span>，'
        '<span class="note">施法者本人也算一名盟友</span>：<br>'
        '<span class="enemy">6% | ?% | ?% | ?% | ?% | 15?%</span></p>\n'
        '<p><span class="note">光焰之井的施法者只受益 5 秒</span>。</p>',

    ('art-6', '复苏爆破'):
        '<p><span class="enemy">眩晕</span>一名<span class="enemy">勇士</span>时：<br>'
        '该<span class="enemy">勇士</span>被<span class="deb-solar">点燃</span>。</p>',

    ('art-6', '精密射线'):
        '<p>处于<span class="orb">焕光</span>状态时：</p>\n'
        '<p><span class="el-solar">烈日精准击杀</span><span class="enemy">战斗人员</span>'
        '会触发<span class="deb-solar">点燃</span>。</p>',

    ('art-6', '护甲匠'):
        '<p>击破一个<span class="enemy">战斗人员护盾</span>时：</p>\n'
        '<p><span class="enemy">10%</span> <span class="unsure">[2.5%]</span> '
        '伤害抗性（抵抗 x1），持续 6 秒。<br>'
        '<span class="el-arc">近战伤害提高 100%</span>，持续 6 秒。<br>'
        '<span class="note">超能近战伤害同样提高</span>。</p>',

    ('art-6', '反勇士弹头'):
        '<p><span class="ammo-heavy">火箭发射器</span>对<span class="enemy">勇士</span>的'
        '<span class="enemy">伤害提高 33%</span>。</p>',

    ('art-6', '单人特工'):
        '<p>单人游玩时：</p>\n'
        '<p><span class="stack">精准击杀</span>叠加一层<span class="stack">伤害增益</span>，'
        '层数无上限（<span class="stack">∞</span>），'
        '<span class="note">死亡时全部失去</span>。</p>\n'
        '<p>每层提供 1.2% 对<span class="enemy">战斗人员</span>的武器伤害加成，'
        '<span class="stack">x25 层</span>时即 '
        '<span class="enemy">30% 武器伤害加成</span>。<br>'
        '<span class="note">该加成与所有效果叠加</span>。</p>',

    ('art-6', '愿望成真'):
        '<p><span class="orb">超能能量</span>高于 60% 但'
        '<span class="note">尚未充满</span>时：</p>\n'
        '<p><span class="pickup">技能击杀</span>会生成 '
        '<span class="orb">3 个能量球</span>，每个提供 '
        '<span class="orb">7.15% 超能能量</span>。<br>'
        '<span class="note">生成能量球有 30 秒冷却时间</span>。</p>\n'
        '<p><span class="note">只要<span class="orb">超能能量</span>高于 60%，'
        '就能与<span class="orb">漫游超能</span>配合使用</span>。</p>',

    ('art-6', '龙之啮'):
        '<p>每用<span class="el-strand">缚丝</span>或<span class="el-stasis">冰影</span>'
        '武器击破第 3 个<span class="enemy">战斗人员护盾</span>时：</p>\n'
        '<p><span class="el-strand">缚丝</span>施加'
        '<span class="deb-strand">悬停</span>，'
        '<span class="el-stasis">冰影</span>施加'
        '<span class="deb-stasis">冻结</span>。</p>',

    ('art-6', '银白重炮'):
        '<p>发射火箭发射器时：<br>'
        '<span class="armor-charge">消耗 x1 护甲充能</span>，获得'
        '<span class="stack">弑神弹头</span>，持续 4.5 秒。</p>\n'
        '<p><span class="stack">弑神弹头</span>：<br>'
        '伤害提高 15%，可叠加；<br>+? 装填速度，0.?x 装填持续时间倍率。</p>\n'
        '<p><span class="note">持续期间不会再<span class="armor-charge">消耗</span>额外的'
        '<span class="armor-charge">护甲充能</span></span>。</p>',

    ('art-6', '火种扳机'):
        '<p>处于<span class="orb">焕光</span>状态时：</p>\n'
        '<p><span class="el-solar">烈日武器</span>对尚无'
        '<span class="el-solar">灼烧层数</span>的<span class="enemy">战斗人员</span>'
        '施加 <span class="el-solar">x30+15 灼烧</span>。</p>\n'
        '<p><span class="note">由火种扳机首次触发的灼烧不受武器或技能伤害加成影响；'
        '在光焰之井内无效</span>。</p>',

    ('art-6', '凉意袭人'):
        '<p>对<span class="el-stasis">冰影减益敌人</span>取得'
        '<span class="el-stasis">冰影击杀</span>时：<br>'
        '在 6 米范围内触发一次<span class="el-stasis">减速爆发</span>。</p>\n'
        '<p><span class="el-stasis">减速爆发</span>：<br>'
        '对敌人施加 <span class="el-stasis">x20 减速</span>，'
        '持续 2? <span class="el-stasis">+?</span> 秒。<br>'
        '为使用者与<span class="enemy">盟友</span>提供 '
        '<span class="el-stasis">x? 冰霜护甲</span>。</p>\n'
        '<p><span class="note">冰霜护甲部分实测无效</span>。</p>',

    ('art-6', '极寒凝视'):
        '<p><span class="el-stasis">冰霜护甲</span>激活期间，用'
        '<span class="el-stasis">冰影武器</span>取得<span class="stack">精准击杀</span>：</p>\n'
        '<p>在<span class="health">敌人死亡位置</span>触发一次'
        '<span class="deb-stasis">冰冻爆发</span>，影响 7 米内的敌人。</p>',

    ('art-6', '爆炸范围'):
        '<p>在 ? 秒内用榴弹发射器或<span class="ammo-heavy">火箭发射器</span>'
        '取得 2 次击杀时：</p>\n'
        '<p>获得一层<span class="enemy">护甲充能</span>。</p>',

    ('art-6', '永恒毁灭'):
        '<p>2–3? 秒内的每次<span class="note">非异域火箭发射器击杀</span>都会'
        '<span class="ammo-heavy">推进计数器</span>：<br>'
        '<span class="enemy">普通敌人</span> = <span class="ammo-heavy">25%</span> | '
        '<span class="enemy">精英</span> = <span class="ammo-heavy">34%</span> | '
        '<span class="enemy">小头目</span> = <span class="ammo-heavy">100%</span></p>\n'
        '<p><span class="ammo-heavy">计数器达到 100%</span> 时：<br>'
        '<span class="ammo-heavy">火箭发射器</span>获得 '
        '<span class="ammo-heavy">+1 弹药</span>，'
        '<span class="ammo-heavy">精密框架火箭发射器（或任何带双脚架的框架）</span>'
        '获得 <span class="ammo-heavy">+2 弹药</span>。<br>'
        '同时获得 +? 装填速度与 0.?x 装填持续时间倍率，持续 10 秒。<br>'
        '<span class="note">不受回收器模组影响</span>。</p>',

    ('art-6', '崩解'):
        '<p>对<span class="deb-strand">割裂状态的敌人</span>造成 6 次武器伤害时：<br>'
        '施加<span class="deb-strand">瓦解</span>。</p>\n'
        '<p>击杀<span class="deb-strand">割裂状态的敌人</span>时：<br>'
        '在敌人死亡位置释放 <span class="health">3 个治疗脉冲</span>，每 2 秒一次，'
        '各<span class="health">恢复 15 点生命值</span>，并为使用者与 10 米内的'
        '<span class="enemy">盟友</span>提供<span class="el-strand">织造铠甲</span>，'
        '持续 <span class="el-strand">10 秒</span>。</p>',

    # ── art-7 NPA 斥力调节器（深渊）─────────────────────────────────
    ('art-7', '改良版瓦解'):
        '<p><span class="deb-strand">瓦解织线</span>额外造成 15% 伤害。</p>',

    ('art-7', '缚丝士兵'):
        '<p>装备<span class="el-strand">缚丝</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业，'
        '并获得<span class="el-strand">织造铠甲</span>时：</p>\n'
        '<p>获得<span class="deb-strand">瓦解弹药</span>，持续 8 秒。</p>',

    ('art-7', '传导宇宙织针'):
        '<p>对<span class="el-strand">受缚丝减益影响的敌人</span>：</p>\n'
        '<p><span class="el-arc">电弧</span>与<span class="el-void">虚空</span>'
        '技能伤害提高 5%。</p>',

    ('art-7', '不稳定流动'):
        '<p>拾取<span class="orb">能量球</span>或<span class="el-void">虚空裂口</span>时：</p>\n'
        '<p>获得<span class="pickup">不稳定弹药</span>，持续 9 '
        '<span class="unsure">[?]</span> 秒。</p>',

    ('art-7', '压制偃月'):
        '<p>用<span class="el-strand">偃月</span>对<span class="enemy">战斗人员</span>'
        '造成伤害时：<br>施加<span class="el-void">压制</span>，持续 10 秒。</p>\n'
        '<p><span class="el-arc">偃月近战</span>会消耗 '
        '<span class="pickup">10% 偃月能量</span>来施加'
        '<span class="el-void">压制</span>；'
        '<span class="note">敌人已被压制时不消耗能量</span>。</p>',

    ('art-7', '震慑行动'):
        '<p>装备<span class="el-arc">电弧</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业，且处于'
        '<span class="el-arc">增幅</span>状态时：</p>\n'
        '<p><span class="el-arc">电弧击杀</span>会触发一次'
        '<span class="el-arc">闪电爆发</span>，在 8 米半径内造成最多 126 '
        '<span class="unsure">[?]</span> 点<span class="el-arc">电弧伤害</span>，'
        '并施加<span class="deb-arc">震颤</span>。</p>\n'
        '<p><span class="note">两次触发之间有 5 秒冷却时间</span>。</p>',

    ('art-7', '朝向裂口'):
        '<p>装备<span class="el-void">虚空</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业时，'
        '击杀<span class="el-void">虚空减益敌人</span>：</p>\n'
        '<p>生成一个<span class="el-void">虚空裂口</span>。</p>',

    ('art-7', '防护裂口'):
        '<p>拾取<span class="el-void">虚空裂口</span>时：</p>\n'
        '<p><span class="pickup">虚空覆盖护盾 +45</span>，'
        '持续 <span class="pickup">10 +5</span> 秒。</p>',

    ('art-7', '超新星'):
        '<p>拾取<span class="el-void">虚空裂口</span>时：</p>\n'
        '<p>10 秒内的下一次<span class="el-void">虚空</span>伤害会释放一次'
        '<span class="deb-void">削弱爆发</span>，对 5 米内的敌人施加'
        '<span class="deb-void">削弱</span>，持续 8 秒。</p>',

    ('art-7', '持久增幅'):
        '<p>装备<span class="el-arc">电弧</span>或'
        '<span class="el-prismatic">棱镜</span>分支职业时：</p>\n'
        '<p><span class="el-arc">增幅</span>的持续时间延长至 20 秒。</p>',

    ('art-7', '反制充能'):
        '<p><span class="enemy">眩晕</span>一名<span class="enemy">勇士</span>时：</p>\n'
        '<p>获得一层<span class="enemy">护甲充能</span>。</p>',

    ('art-7', '小队目标'):
        '<p>在<span class="orb">超能元素匹配增益</span>的影响下使用'
        '<span class="enemy">终结技</span>时：</p>\n'
        '<p>? 米范围内的<span class="enemy">盟友</span>获得'
        '<span class="pickup">对应分支职业的增益</span>：<br>'
        '<span class="el-arc">电弧：增幅</span> | '
        '<span class="el-void">虚空：吞食</span> | '
        '<span class="el-strand">缚丝：织造铠甲</span></p>',

    ('art-7', '雷霆反击'):
        '<p>处于<span class="health">重伤</span>或<span class="el-arc">增幅</span>状态时：</p>\n'
        '<p><span class="el-arc">电弧超能</span>伤害提高 30%。</p>\n'
        '<p><span class="note">只影响超能动画期间造成的伤害，'
        '因此<span class="orb">雷霆冲击</span>与<span class="orb">风起云涌</span>'
        '实际吃到的加成偏低</span>。</p>',

    ('art-7', '远方砖块'):
        '<p>每取得 <span class="ammo-heavy">3? 次对精英 + 敌人的虚空武器击杀</span>：</p>\n'
        '<p>为使用者与 ? 米范围内的<span class="enemy">盟友</span>提供 '
        '<span class="ammo-heavy">50?% 威能弹药进度</span>。</p>',

    ('art-7', '两次闪电打击'):
        '<p>使用<span class="el-arc">电弧手雷技能</span>时：</p>\n'
        '<p>5 秒内<span class="el-arc">手雷基础充能速率额外提高 130%</span>。</p>\n'
        '<p><span class="el-arc">电弧击杀</span>会为该效果延长 +3? 秒，'
        '最多累计至 20 秒。</p>',

    ('art-7', '持续火力'):
        '<p>在 1.5 秒内对<span class="enemy">同一名战斗人员</span>造成 '
        '10 次自动步枪命中时：</p>\n'
        '<p>获得 <span class="enemy">25% 伤害抗性（抵抗 x2）</span>，持续 6 秒。<br>'
        '<span class="note">该效果可刷新，收起武器后仍然保留</span>。</p>\n'
        '<p><span class="health">支援型自动步枪</span>也可通过'
        '<span class="health">治疗盟友</span>触发。</p>',

    ('art-7', '超载手雷'):
        '<p><span class="el-void">虚空手雷技能伤害</span>会施加'
        '<span class="el-void">干扰</span>。</p>',

    ('art-7', '被动攻击刀剑格'):
        '<p>装备偃月时：</p>\n'
        '<p>对 ? 米范围内的<span class="enemy">战斗人员</span>获得 '
        '<span class="enemy">50% 伤害抗性</span>。</p>',

    ('art-7', '碎裂能量球'):
        '<p>首次击破<span class="enemy">战斗人员护盾</span>时：</p>\n'
        '<p>生成一个<span class="orb">能量球</span>，提供 '
        '<span class="orb">7.15% 超能能量</span>。<br>'
        '对尚未触发过该效果的<span class="enemy">战斗人员</span>使用'
        '<span class="enemy">终结技</span>也会生成一个<span class="orb">能量球</span>。</p>\n'
        '<p><span class="note">每个敌人只生效一次</span>。</p>',

    ('art-7', '瞄准自动填装器'):
        '<p>用自动步枪<span class="enemy">击杀战斗人员</span>会推进'
        '<span class="deb-void">计数器</span>：<br>'
        '普通击杀提供 <span class="deb-void">50% 进度</span>；<br>'
        '15 米内有 3 名敌人时，或已有 <span class="deb-void">5 层</span>时，'
        '击杀提供 <span class="deb-void">100% 进度</span>。<br>'
        '<span class="note">计数器进度在收起武器后保留</span>。</p>\n'
        '<p><span class="deb-void">计数器进度达到 100%</span> 时：<br>'
        '获得一层<span class="deb-void">瞄准自动填装器</span>，持续 15 秒，'
        '最多叠加至 <span class="deb-void">5 层</span>，可刷新。</p>\n'
        '<p><span class="deb-void">瞄准自动填装器</span>按层数生效：<br>'
        '装填弹匣：20% | 20% | 30% | 40% | 40%<br>'
        '自动步枪伤害提高：10% | 13% | 16% | 18% | 20%<br>'
        '<span class="note">与其他增益叠加；切换到<span class="note">非自动步枪</span>'
        '武器时移除</span>。</p>',

    ('art-7', '虚空武器输能'):
        '<p>持有至少 1 层<span class="el-void">虚空技能</span>充能时，'
        '用<span class="el-void">虚空武器</span>取得击杀：</p>\n'
        '<p>按<span class="ammo-heavy">虚空手雷、近战与超能技能</span>的充能层数，'
        '获得等量的<span class="el-stasis">武器激涌</span>，持续 11 秒。</p>\n'
        '<p>拥有 <span class="ammo-heavy">4 层虚空技能充能</span>时最多获得 '
        '<span class="el-stasis">x4 武器激涌</span>，'
        '例如 2 手雷 + 2 近战 = x4 激涌。</p>\n'
        '<p><span class="note">只有当前<span class="el-stasis">层数</span>不超过'
        '<span class="el-void">虚空技能充能</span>数量时才能刷新；'
        '<span class="el-prismatic">在棱镜上表现正常</span></span>。</p>',
}

# 改完仍出现即中止。新写的文本再引入这些写法会被当场拦下。
FORBIDDEN = [
    # 硬伤与占位
    '%%%', '动能决裂', '配合时', '----', ' or ',
    # 术语：装填、战斗人员、精准、瓦解弹药、悬停
    '填装速度', '填装持续时间', '填装弹匣',
    '战斗单位', '战斗员护盾', '普通战斗员',
    '精确命中', '精确击杀',
    '瓦解弹匣', '悬浮', '弓箭',
    # 记法：抵抗 xN、伤害抗性、增益、半角问号与冒号、生命值
    '抵抗x1', '抗性x2', '抗性 x', '伤害减免',
    'Buff', 'buff',
    '？', ' :', ' HP', '超能能量.',
]
