#!/usr/bin/env python3
"""官方物品表 → 站内术语表：着色该落在哪个 token 上，由查表定，不由人判断。

Bungie 的 manifest 导出里 `typeName_zh` 已经按元素给技能分好类（「烈日碎片」
「电弧星相」「缚丝手雷」），`tierName_zh` 分好稀有度。三桶蒸馏进 tools/items.json：

  元素   碎片／星相／手雷／近战／超能  → el-arc … el-prismatic
  异域   异域稀有度的武器与护甲        → exotic
  神器   typeName_zh 为「传说 神器特性」→ art-perk

两个消费者：

  --suggest   列出源稿里还没着色的裸出现与建议标记，只打印不改文件。
              全自动铺色不可行——库里 6738 个模组名与中文常用词大量同形
              （充能 618 次、爆炸 413 次、霰弹枪 65 次都是物品名），
              按词表铺开会把正文里的普通动词染成专名。所以出建议交人裁决。
  --builds    配装源稿的散文（描述、注解与审核意见）就地着色，构建时自动跑。投稿的人不写
              着色标记，逐条手补是把构建变成一串「某某没着色」的报错。资料页的
              源稿不走这条：那些是自己写的长文，铺色前该先 --suggest 看一眼。
  check_terms.py 的 G6  已着色的术语，token 必须与库里的归属一致。
              --el-solar 与 --deb-solar 渲染色相同，着成哪个眼睛查不出来。

原始导出 49 MB，不入库；改赛季重抽时跑一次 --distill。

用法：
    python3 tools/items.py --distill ~/Downloads/MISC/items-full.json
    python3 tools/items.py --suggest [slug]
    python3 tools/items.py --apply   [slug]
    python3 tools/items.py --builds
"""

import functools
import json
import os
import re
import sys
import stat
import tempfile

import markup
import migrate
import shell

OUT = 'tools/items.json'
PERKS = 'tools/perks.json'

EL = {'电弧': 'el-arc', '烈日': 'el-solar', '虚空': 'el-void',
      '缚丝': 'el-strand', '冰影': 'el-stasis', '棱镜': 'el-prismatic'}
KINDS = ('碎片', '星相', '手雷', '近战', '超能')

# 三桶在库里的条数。这是库侧的事实，与下面的 STOP／同名冲突无关——
# 那两样是站内判断，剔掉之后剩多少不该拿来当闸门。改了判据要同步改这里。
N_EL, N_EXOTIC, N_ARTPERK = 230, 282, 198

# 与中文常用词同形的物品名。留在表里会把正文里的普通动词染成专名，
# 每条都按实测的出现次数与用法裁定过，不是按词长一刀切。
STOP = {
    # 电弧星相「重击」只占 6 处（已手工着好），另外 68 处是刀剑与偃月的重击：
    # 「轻-轻-重击连招」「空中重击 ｜ 消耗 8% 超能能量」。
    '重击',
    # 同名神器模组，但站内 27 处讲的全是榴弹发射器那条属性（+40 爆炸范围）。
    '爆炸范围',
    # 异域斥候步枪，但 crafting 页的来源列有「任务同调」——那是任务名不是枪。
    '同调',
    # 神器模组，但「动量转移」「棱镜转移」是更长的名字，还有一处当动词用。
    '转移',
    # 烈日增益「恢复」已手工着好 65 处；另外 99 处是动词与武器属性：
    # 「开火恢复延迟」「射速恢复延迟」「恢复 140 生命值」「+100 恢复」。
    '恢复',
    # 异域 Perk，但正文里 23 处无一是它：光芒复仇、凯德的复仇、普莱蒂斯的复仇
    # 都是更长的武器名。长名单会随新武器变长，整词不入表比逐个 GUARD 稳。
    '复仇',
    # 异域 Perk「命运眷顾」的短名，但正文里的「命运」全是别的：命运终结者、
    # 命运的逆转（传说 Perk），以及游戏本身（「命运 2 购物清单」）。
    '命运',
    # 既是克洛塔的末日那件起源特性，也是邪魔族的战斗人员名。同名撞两桶，
    # 不按名字铺色：购物清单的起源特性列照旧写 {perk|…}，正文里各按上下文判。
    '诅咒怨魂',
    # 地牢名，也是异域霰弹枪。轮换、首领生命值与刷取清单里的都是那座地牢。
    '二象性',
    # 异域胸甲，也是传说速射狙击步枪。DPS 排行里那两条讲的是枪。
    '全知之眼',
    # 异域手枪，也是智谋里入侵对面的那个守护者（「对智谋入侵者伤害提高」）。
    '入侵者',
    # 神器模组，也是虚空星相「手持超新星」的后半截。
    '超新星',
    # 「英勇利刃 2：冲击核心」那枚异域 Perk 与刀剑通用的光刃 Perk 同名，
    # 散文里的 4 处全是后者（DPS 页的刀剑连招、三套配装的光剑配法）。
    '冲击核心',
    # 神器模组，也是支援框架自动步枪与机枪施加的那个治疗状态。
    '快速治疗',
    # 电弧手雷，但战狮射出的「弹跳手雷」是虚空榴弹的射弹。
    '弹跳手雷',
    # 异域腿甲，也是职业物品上那个给手雷回能的模组名（冷却页讲的是模组）。
    '投弹手',
    # 异域头盔的 Perk 名，也是神器模组施加的那个状态（刀剑那条）。两处各按
    # 上下文着色：exotic-armor 页写 {exotic|…}，神器模组页跟着刀剑走动能。
    '迷惑',
}

# 元素机制名：增益、减益与拾取物。它们不在 Bungie 的物品表里（那张表只有装备与
# 模组的名字），但在正文里与碎片、星相同样是专名，同样按元素编码着色。手写在这里，
# 与 items.json 合表，共用 --suggest／--apply 的跳过规则与 G6 的反查。
# 归属取自各元素分支页的效果表，一行一个效果，token 与 check_terms.py 的 TERMS 对齐。
MECH = {
    # 七个元素名本身。库里没有（manifest 那张表只有装备与模组的名字），
    # 但正文里「缚丝和虚空」与碎片、星相一样是专名，同样按元素编码着色。
    '电弧': 'el-arc', '烈日': 'el-solar', '虚空': 'el-void', '缚丝': 'el-strand',
    '冰影': 'el-stasis', '棱镜': 'el-prismatic', '动能': 'el-kinetic',
    '增幅': 'el-arc', '电光充能': 'el-arc', '离子轨迹': 'el-arc',
    '致盲': 'deb-arc', '震颤': 'deb-arc',
    '治愈': 'el-solar', '焕光': 'el-solar', '恢复': 'el-solar', '焰灵': 'el-solar',
    '灼烧': 'deb-solar', '点燃': 'deb-solar',
    '吞食': 'el-void', '隐身': 'el-void', '虚空覆盖护盾': 'el-void', '虚空裂口': 'el-void',
    # 覆盖护盾本身不属于任何元素（泰坦屏障、神圣之光都给），走拾取物那一支；
    # 「虚空覆盖护盾」是更长的专名，长词在前，两者不会互相盖住。
    '覆盖护盾': 'pickup',
    '压制': 'deb-void', '不稳定': 'deb-void', '虚弱': 'deb-void',
    '冰霜护甲': 'el-stasis', '冰影碎片': 'el-stasis',
    '减速': 'deb-stasis', '冻结': 'deb-stasis', '碎裂': 'deb-stasis',
    '织造铠甲': 'el-strand', '缠结': 'el-strand',
    '割裂': 'deb-strand', '悬停': 'deb-strand', '瓦解': 'deb-strand',
    '超凡': 'el-prismatic',
}




# 更长的专名：这几段文字整体屏蔽，里面的短词不再单独命中。与 STOP 的区别是
# 它不牺牲那个词本身——「千语」照常着色，只有「千语魅痕」（首领名）里的不算。
# TERMS 里定了 token、但不强制正查的词：同形的普通用法比术语用法还多，
# 铺开会把动词染成机制名。token 仍然留着，G2 照旧管「着错了色」。
LOOSE = {
    '恢复',        # 「恢复生命值」「恢复延迟」多数是动词，不是烈日的恢复
}

GUARD = [
    '千语魅痕',    # 最后一愿的首领，不是异域融合步枪「千语」
    '冻结计时',    # 限热器把计时冻住，不是冰影的冻结
    '层数冻结',    # 日焰熔炉的层数不增不减，不是冰影的冻结
    '治愈裂痕',    # 术士的职业技能，不是烈日的治愈
    '迷惑爆发',    # weapon-perks 的传说 Perk，不是异域头盔那个「迷惑」
    '守护者游戏',  # 每年的活动名，不是战斗人员档位里的守护者
    '动能震颤',    # 武器 Perk，不是电弧的震颤
    '震颤反馈',    # 武器 Perk，同上
    '不稳定弹药',  # 武器 Perk，不是虚空的不稳定
    '势不可挡射击',  # 勇士机制的硬直射击，不是偃月那个同名 Perk
    '二象性地牢',  # 地牢名，不是异域霰弹枪「二象性」
    '快速启动模组',  # 护甲模组那一族（手雷/近战/实用），不是武器 Perk「快速启动」
    '计时会冻结',  # 限热器把计时冻住，不是冰影的冻结
    '逐渐减速',    # 屏障滑行慢下来，不是冰影的减速
    '减速飞行',    # 射弹飞得慢，同上
    '落地减速',    # 手雷落地滚停，同上
    '准星悬停',    # 准星停在目标附近，不是缚丝的悬停
    '权利的真相',  # 第七炽天使套装的 4 件效果名，不是异域火箭发射器「真相」
]


# 汉字与拉丁之间那个排版空格的插入点。pattern() 与 variants() 共用这一条判据：
# 前者给 Python 侧的扫描用，后者给送去浏览器的词表用，两边不各写一份。
BOUND = re.compile(r'(?<=[一-鿿])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[一-鿿])')
GAPS = ('', ' ', '\u00a0')


def pattern(word):
    """表里的名字 → 匹配式：中英之间允许有那个排版空格。

    表的键是归一化过的（库里就没有空格），源稿按 design.md 三节在汉字与拉丁
    之间补一个空格（半角或不折行空格）。拿键去字面匹配，「Vex 揭秘者」这类
    中英混排的名字一个都对不上——12 个名字曾经这么整批漏掉。
    """
    return BOUND.sub('[ \u00a0]?', re.escape(word))


def variants(word):
    """这个名字在源稿里写得出的全部形状，含原样那一种。

    浏览器那侧按字面比对，不跑正则（1400 条现编译会拖垮编辑台的逐行提示）。
    所以把 pattern() 允许的写法在这里展开成几行数据送过去——**规则留在
    Python，浏览器只认数据**。中英混排的只有 38 条，展开后多 166 行。
    """
    parts = BOUND.split(word)
    if len(parts) == 1:
        return [word]
    out = ['']
    for i, part in enumerate(parts):
        out = [head + (gap if i else '') + part for head in out for gap in (GAPS if i else ('',))]
    return out


# 词表 1400 条、源稿两万行：现拼模式串会把 re 那 512 条的缓存冲垮，每行每词重编译
# 一次。编译一次留着，扫描本身不变。
@functools.lru_cache(maxsize=None)
def rx(word):
    return re.compile(pattern(word))


GUARD_RX = [re.compile(re.escape(g)) for g in GUARD]


# 一行钉两件事：中文怎么写，以及着色落到哪个 token 上。
#   (正名, 唯一 token 或 None, [禁用写法])
# token 写 None 表示这个词不强制着色，只管中文写法。
TERMS = [
    # ── 中文正名 ──
    ('填装', None, ['装填']),
    # 装备稀有度：紫装在游戏内叫「传说」，与「传说战役」是同一个词
    ('传说', None, ['传奇']),
    ('回复倍率', None, ['技能块']),
    # Exhaust 站内叫「疲惫」。「力竭」指同一个减益——心灵骇入与问题解决者施加的
    # 都是它，两边都写「战斗人员输出伤害降低 25%」，靠这个数认定，不靠字面
    ('疲惫', None, ['力竭']),
    # 站内「特性」一律写 Perk，「起源特性」是唯一的例外：游戏内就叫这个名
    ('起源特性', None, ['源头特性', '起源 Perk']),
    # 「处决」不进禁用表：「优雅处决」是星相里的机制名，与终结技不是一回事
    ('终结技', 'enemy', []),
    ('冰霜护甲', 'el-stasis', ['冰霜铠甲']),
    # 红血是敌人档位的最低一档，照血条颜色叫。「普通战斗人员」在正名之后与它同义
    ('红血', 'bar-red', ['杂兵', '普通士兵', '普通敌人', '普通战斗人员']),
    ('橙血', 'bar-orange', ['精英']),
    # 四档敌人：红血、橙血、初级首领、首领。「黄血」「小头目」是同一档的旧写法
    ('初级首领', 'bar-yellow', ['黄血', '小头目']),
    # 敌人统称用游戏内的官方译名。放在「红血」之后：先认掉「普通敌人」那一组
    # 「敌方」不进禁用表：那是形容词（敌方守护者），不是战斗人员的同义词
    ('战斗人员', 'enemy', ['敌人']),
    # 威能弹药：站内 token 就叫 --ammo-heavy，注释与 design.md 都写「威能弹药」
    ('威能弹药', 'ammo-heavy', ['重型弹药']),
    ('虚弱', 'deb-void', ['削弱']),
    # Jolt：arc.md 里定义的那个连锁闪电减益。「电击」不进禁用表——「闪电击中」
    # 与游戏机制页里敌人的「电击充能」都是同形不同义，钉死会满页误报
    ('震颤', 'deb-arc', ['感电']),
    # 打中弱点叫「精准」。「精密」留给武器框架名（精密框架、精密自动步枪），两者同源
    # 于 Precision，混用会让读者以为框架名与命中判定是一回事
    ('精准命中', 'stack', ['精密命中']),
    ('精准击杀', None, ['精密击杀']),
    # 打在目标本体上的那一份叫「直击」，与溅射／径向相对；「接触」在正文里
    # 还当动词用（接触时引爆、接触点），只有当伤害名讲时才是这一条
    ('直击伤害', None, ['接触伤害']),
    # 三种勇士各自一行：中文早就统一了，钉在这里是为了 token。三个名字同属
    # 战斗人员，着色必须都落到 enemy 上——只钉一个，另两个会在新页面上分叉，
    # 而 --enemy 与相近的几个 token 渲染色接近，眼睛查不出来。
    ('势不可挡勇士', 'enemy', ['不屈勇士']),
    ('过载勇士', 'enemy', ['超载勇士']),
    ('屏障勇士', 'enemy', ['壁垒勇士']),
    # 职业技能名：三处写「特技闪身」、一处写「杂技闪身」，后者是孤例；
    # 「裂缝」三处全指术士的职业技能，不是同名的 PvP 模式
    ('特技闪身', None, ['杂技闪身']),
    ('裂痕', None, ['裂缝']),
    # 物品专名的写法分叉，正名一侧取该物品所在资料页的行标题。
    # 这几组渲染出来毫无异样，只有搜索与跨页对照时才露馅
    ('伏特子弹', None, ['福特子弹']),        # weapon-perks 行标题；刷取两页写成同音的「福特」
    ('嫉妒军械库', None, ['嫉妒军火库', '嫉妒军火']),  # 同上；刷取两页写「军火库」与「军火」
    ('战嚎炮管', None, ['战壕炮管']),        # weapon-perks 行标题；刷取三页写成同音的「战壕」
    ('换挡', None, ['换档']),               # 同上；刷取三页写成同音的「换档」
    ('精准工具', None, ['精装工具']),        # 同上；legendary-special 一处写「精装」
    ('终局螺旋钻', None, ['终极螺旋钻']),    # exotic-weapon 行标题；crafting 一处写「终极」
    ('冰冻奇点', None, ['冰封奇点']),        # prismatic 行标题；buff-debuffs 一处写「冰封」
    ('层层不绝', None, ['层层不觉']),        # armor-mods 行标题；farming-sets 三处写「不觉」
    # 突袭名。站内两种写法各占一半，取「最后一愿」
    ('最后一愿', None, ['最后遗愿']),

    # ── 只管 token，不改中文 ──
    # 下面这些词的着色曾经分叉，两个 token 渲染色又相同或相近，肉眼查不出来
    ('护甲充能', 'armor-charge', []),
    ('焕光', 'el-solar', []),
    ('恢复', 'el-solar', []),
    # 覆盖护盾分两个词：虚空分支的那层是虚空增益，其余来源（职业属性、还治彼身、
    # 无畏护甲）不属于任何元素。两者同色时读者会把无畏护甲当成虚空技能
    ('虚空覆盖护盾', 'el-void', []),
    ('覆盖护盾', 'pickup', []),
    ('不稳定', 'deb-void', []),
    ('压制', 'deb-void', []),
    ('减速', 'deb-stasis', []),
    ('灼烧', 'deb-solar', []),
    ('点燃', 'deb-solar', []),
    ('能量球', 'orb', []),
    ('特殊弹药', 'ammo-special', []),
    ('生命值', 'health', []),
    ('首领', 'bar-yellow', ['头目', 'Boss', 'boss']),
    # 守护者按战斗力对齐橙血那一档；「自己」是玩家一侧的表述层，留在 enemy 色
    ('守护者', 'bar-orange', []),
    ('自己', 'enemy', []),
    # 「铸造者」是刀剑框架名，不能拿来指释放技能的那个人
    ('施法者', 'enemy', []),
    ('异域', 'exotic', []),
    ('增益', 'buff', []),
    ('减益', 'debuff', []),

    # ── 按官方 manifest 校过的正名 ──
    # 下面这一批出自 2026.8.30 用 Bungie manifest 的 description_zh 逐条对读，
    # 每条的官方原文写在 ~/Desktop/docs/260830-术语校对清单.html。
    # 站内曾经写的是社区叫法或旧译，官方文本里一次都不出现。
    ('烈焰火苗', None, ['鬼火', '幽灵手雷']),
    ('束缚', None, ['系缚']),
    ('狂啸', None, ['暴风雪']),
    ('击败他们', None, ['击倒']),
    ('速度加成', None, ['速度助推器', '速度增强']),
    ('力量学派', None, ['力量教派']),
    ('洞察学派', None, ['洞察教派']),
    ('活力学派', None, ['活力教派']),
    ('忧愁武器', None, ['悲叹武器']),
    ('太阳黑子', None, ['日斑']),
    ('恢复炮台', None, ['治疗炮台', '治疗炮塔']),
    ('虚空灵魂', None, ['虚空之魂']),
    ('高贵追踪弹', None, ['高尚追踪弹']),
    ('纳米蜂群', None, ['纳米机器人', '水银纳米机器']),
    ('类虫机器人', None, ['昆虫机器人']),
    ('闪烁重击', None, ['瞬移重击']),
    ('遥测规律', None, ['遥测模块']),
    ('压迫能量', None, ['压倒性力量']),
    ('释放力量', None, ['释放能量']),
    ('蜕变圆球', None, ['蜕变球体']),
    ('活性放射体液', None, ['放射虫液', '放射虫池']),
    ('先锋决心', None, ['先锋决绝']),
    ('斥候步枪', None, ['侦察步枪']),
    ('眩晕', None, ['击晕']),
    ('迷失方向', None, ['迷乱']),
    ('风暴怒吼', 'el-stasis', ['冰川咆哮']),
    ('区域拒止', None, ['区域拒绝']),
    # 生命值见底那个状态官方叫「重伤」。站内曾有三种写法，「关键{health|生命值}」
    # 带着标记，纯文本的禁用词对不上，所以连标记一起钉
    ('重伤', None, ['濒死生命值', '危急', '关键{health|生命值}']),
    # 「焦灼」只在烈日减益那个意思上是错的；活动修改器「卡巴尔：焦灼大地」进 KEEP
    ('灼烧', 'deb-solar', ['焦灼']),
    # 「残存」是阿莱索尼姆与荆棘的掉落物，官方作「残余」；流明那把官方作「遗灵」。
    # 虚空碎片「残存回声」是另一件事，进 KEEP
    ('残余', None, ['残存']),

    # ── 副本、活动与人物：官方名取自 manifest 的 source_zh 与 activities 表 ──
    ('玻璃拱顶', None, ['玻璃宝库']),
    ('救赎的边缘', None, ['救赎边缘']),
    ('众神殿', None, ['万神殿']),
    ('幽梦之城', None, ['梦城']),
    ('铁旗', None, ['铁骑']),
    ('赛雀联赛', None, ['快雀竞赛', '快雀竞速']),
    ('忧伤祭坛', None, ['月球祭坛']),
    ('异端深渊', None, ['异端深坑']),
    ('永恒沙漠（史诗）', None, ['史诗沙漠']),
    ('至日', None, ['高塔二至点']),
    ('守护者游戏', None, ['高塔运动会']),
    ('克洛塔的末日', None, ['克洛塔末日']),
    # Xûr 的官方中文名。「老九」是社区叫法
    ('仄', None, ['老九']),
]


def banned_pairs():
    """禁用写法 → 正名，摊平成一张对照表。

    TERMS 的元组形状（`t[0]` 正名、`t[2]` 禁用写法）只由这一个函数知道。
    从前 build-weapons、items 与两处回归各自把这句推导抄了一遍，改 TERMS 的
    结构要同时动四个文件。
    """
    return [(w, t[0]) for t in TERMS for w in t[2]]

# 游戏内的专有名词，字面撞上禁用写法时按原名放行。整条短语落在里面才算数，
# 「削弱」单用照旧报错。
KEEP = ['削弱清敌', 'Destiny 2: Boss Damage', '吞食裂缝',
        '卡巴尔：焦灼大地', '残存回声', '结晶残花',
        # 官方物品表里的护甲模组名（tools/mod-variants.json）。配装源稿的槽位行
        # 必须逐字写它才查得到，正名那条规矩管的是散文，不管物品的专名。
        '重型弹药搜寻者', '重型弹药斥候',
        # 官方物品表里的专名，不受正名管：Perk「双重装填」（Dual Loader）里的
        # 「装填」、深岩墓室模组「种群削弱」里的「削弱」。
        '双重装填', '种群削弱',
        # 护甲套装效果名按官方写法，站内正名不改它们：「能量装填」是 Bungie 给
        # 那条 SandboxPerk 的名字，改成「能量填装」就与库里对不上了。
        '能量装填']


# G6 管得住的 token：元素归属与异域稀有度这两样库里是事实。别的不归它管——
# {named|冥府三头犬 +1} 里的 named 是排版标记不是着色，强判会满页误报；
# 神器模组的元素归属库里没有（typeName_zh 一律是「传说 神器特性」），
# 神器模组页按各自的元素给了 12 处更细的着色，钉死反而是降级。
# 元素机制名的归属同样是事实（取自各元素分支页的效果表），一并纳入反查——
# 「冻结」着成 el-stasis 与 deb-stasis 渲染色相同，只有这里管得住。
# orb 也纳入：它是能量球与超能那一支金色，写不进异域装备名。神器模组页曾把
# 「库尔之影」「故我在」「Vex 揭秘者」等 10 个异域名着成 orb，15 处无人报出。
MANAGED = set(EL.values()) | {'exotic', 'orb'} | set(MECH.values())


class Names(list):
    """词表的名字，长词在前（先认长的），另带首字索引。

    首字必然字面出现——空格只允许插在中英交界处，插不到词首。hits_in() 每行只试
    首字在这一行里出现过的那些词：逐词判 `word[0] in line` 本身就是一趟 1400 次的
    Python 循环，占正查的大半。
    """

    def __init__(self, words):
        super().__init__(sorted(words, key=len, reverse=True))
        self.first = {}
        for k, word in enumerate(self):
            self.first.setdefault(word[0], []).append(k)

    def within(self, line):
        """首字在 line 里出现过的词，顺序与整张表相同。"""
        return [self[k] for k in sorted(k for c in set(line) for k in self.first.get(c, ()))]


def norm(s):
    """比对前归一化：去中英之间的排版空格，去站内自加的消歧后缀。

    源稿按 design.md 三节在汉字与拉丁之间补空格（Vex 揭秘者），库里没有；
    同名的几件东西站内加括号区分（故我在（电弧元素）、精密框架（手炮）），
    库里是同一个名字。两条都归一化掉才对得上。
    """
    s = re.sub(r'[（(][^）)]*[）)]$', '', s)
    s = re.sub(r'(?<=[一-鿿])\s+(?=[A-Za-z0-9])'
               r'|(?<=[A-Za-z0-9])\s+(?=[一-鿿])', '', s)
    return s.strip()


# ── 蒸馏 ──────────────────────────────────────────────────────────────


def bucket(item):
    """一件物品落在哪个桶里，返回 (token, 分类名)；不属于三桶即 None。"""
    tn = (item.get('typeName_zh') or '').strip()
    if not tn:
        return None
    if tn == '传说 神器特性':
        return 'art-perk', tn
    for el, token in EL.items():
        if tn.startswith(el):
            for k in KINDS:
                if k in tn:
                    return token, tn
            return None
    cats = set(item.get('categories_zh') or [])
    if item.get('tierName_zh') == '异域' and ({'武器', '护甲'} & cats):
        return 'exotic', tn
    return None


def distill(src):
    with open(src, encoding='utf-8') as f:
        items = json.load(f)['items']

    # {名字: {token: {分类名}}}。同一个名字在库里可能出现好几件（同名的不同
    # 版本、光能与暗影两套写法），token 相同即同一条术语，分类名合并起来展示。
    seen: dict[str, dict[str, set]] = {}
    for item in items.values():
        name = norm((item.get('name_zh') or '').strip())
        if len(name) < 2:
            continue
        hit = bucket(item)
        if hit:
            seen.setdefault(name, {}).setdefault(hit[0], set()).add(hit[1])

    counts = {'el': 0, 'exotic': 0, 'art-perk': 0}
    for kinds in seen.values():
        for token in kinds:
            counts['exotic' if token == 'exotic' else
                   'art-perk' if token == 'art-perk' else 'el'] += 1
    markup.eq('元素术语', counts['el'], N_EL)
    markup.eq('异域装备', counts['exotic'], N_EXOTIC)
    markup.eq('神器模组', counts['art-perk'], N_ARTPERK)

    terms, skipped = {}, {}
    for name, kinds in seen.items():
        label = ' / '.join(sorted(k for ks in kinds.values() for k in ks))
        if name in STOP:
            skipped[name] = '停用词：' + label
        elif len(kinds) > 1:
            # 同名撞两个桶（堡垒既是虚空星相又是异域融合步枪）。着哪个色是
            # 逐处判断，不能按名字定，所以整条剔出去交人裁决。
            skipped[name] = '同名冲突：' + label
        else:
            terms[name] = [next(iter(kinds)), label]

    # 一条记录一行：这份文件随赛季重生成并入库，按行写让 git 存得下增量。
    body = ',\n'.join('  %s: %s' % (json.dumps(k, ensure_ascii=False),
                                    json.dumps(v, ensure_ascii=False))
                      for k, v in sorted(terms.items()))
    skip = ',\n'.join('  %s: %s' % (json.dumps(k, ensure_ascii=False),
                                    json.dumps(v, ensure_ascii=False))
                      for k, v in sorted(skipped.items()))
    with open(os.path.join(shell.ROOT, OUT), 'w', encoding='utf-8') as f:
        f.write('{\n "terms": {\n%s\n },\n "skipped": {\n%s\n }\n}\n' % (body, skip))

    print('%s：库里 %d 条（元素 %d、异域 %d、神器 %d），入表 %d 条，剔出 %d 条'
          % (OUT, sum(counts.values()), counts['el'], counts['exotic'],
             counts['art-perk'], len(terms), len(skipped)))
    for name, why in sorted(skipped.items()):
        print('  剔出 %s —— %s' % (name, why))


# ── 读表 ──────────────────────────────────────────────────────────────


# 异域装备的专属 Perk 名。这一类的真相不在 Bungie 的物品表里——manifest 那边
# perk 属于 sandbox 条目，typeName 分不出「异域装备自带」与别的特性。真相在
# exotic-armor / exotic-weapon 两页的 PERK 列上，顺着那两页的行主键取。
# 着 exotic 而不是 perk：site.css 的 --c-exotic 注释写着「专属 Perk 名同族」，
# 两者渲染色相同，而 {perk|…} 按 .claude/rules/pages.md 是整格排版标记，不是行内着色 token。
PERK_DOCS = ('exotic-armor.md', 'exotic-weapon.md')


@functools.cache
def exotic_perks():
    """异域两页「异域 PERK」那一格上的名字 → (全部, 那一格只写着一个名字的)。

    **格子怎么排就怎么取**：名字由 `rows.exotic_perks()` 一处给，与页面同一份实现。
    去掉 `perk_names()` 里已有的：那一格也列催化剂给的效果与特征栏里随枪滚出来的
    Perk（玉兔的「边打边劫」、狼毒催化剂的「羸弱能量球」），那些是通用 Perk 名，
    购物清单与配装散文里一律写 `{perk|…}`。

    分出「单名格」是为了正查，见 no_forward()。
    """
    import rows
    whole, solo = set(), set()
    for page in PERK_DOCS:
        for head in rows.heads(page[:-len('.md')]):
            got = [norm(n.lstrip('\u2191')) for n in rows.exotic_perks(head)[0]]
            got = [n for n in got if len(n) > 1 and '[' not in n]
            whole |= set(got)
            if len(got) == 1:
                solo.add(got[0])
    known = set(perk_names())
    return whole - known, solo - known


def perks():
    return exotic_perks()[0]


# 武器 Perk 名的词表：两个来源现扫，落成 tools/perks.json。
#   武器 PERK 详解页的行标题     —— 站内那 400 多条 Perk 的正名
#   购物清单四页的 Perk 名列     —— 枪管、弹匣、起源特性这些不在上一份里的名字
# 换赛季或加了新 Perk 时跑一次 --perks 重生成。
PERK_SRC = 'weapon-perks.md'
# 只收这四节。固有 PERK 那一节列的是框架（重型点射、支援框架），偃月与刀剑那两节
# 列的是机制与属性（充能效率、防御抗性）——它们在正文里是框架名与数值，不是 Perk 名。
PERK_SECTS = ('武器 PERK', '武器模组', '重型弩机制', '起源特性')
PERK_PAGES = ('shopping-primary.md', 'shopping-special.md',
              'shopping-heavy.md', 'shopping-other.md')
PERK_CELL = re.compile(r'\{perk\|([^{}]*)\}')

# 两字的 Perk 名一律不入表：转向、战术、切割、瓦解、医治这些在正文里绝大多数是
# 普通词或元素机制名，按词铺开会把动词染成 Perk 名。三字以上才收。
PERK_MIN = 3


def distill_perks():
    """两个来源 → tools/perks.json。"""
    names = set()
    lines = read_source(PERK_SRC[:-len('.md')]).split('\n')
    sect = None
    for i, line in enumerate(lines):
        if line.startswith('## '):
            sect = line[3:].strip()
        if sect not in PERK_SECTS:
            continue
        if not line.startswith('|') or RULE_LINE.match(line.strip()):
            continue
        if i + 1 < len(lines) and RULE_LINE.match(lines[i + 1].strip()):
            continue                      # 表头行写的是列名
        cell = line[1:markup.row_title_end(line)].rstrip('|')
        name = norm(markup.uncolor(cell).strip())
        if len(name) >= PERK_MIN:
            names.add(name)
    for page in PERK_PAGES:
        if shell.source_path(page[:-len('.md')]) is None:
            continue
        for mo in PERK_CELL.finditer(read_source(page[:-len('.md')])):
            name = norm(mo.group(1).replace('~~', '').strip())
            if len(name) >= PERK_MIN:
                names.add(name)
    names = sorted(n for n in names if n not in STOP and '|' not in n)
    with open(os.path.join(shell.ROOT, PERKS), 'w', encoding='utf-8') as f:
        f.write('[\n%s\n]\n' % ',\n'.join('  ' + json.dumps(n, ensure_ascii=False)
                                            for n in names))
    print('%s —— %d 条 Perk 名（来源：%s 与购物清单四页的 Perk 列）'
          % (PERKS, len(names), PERK_SRC))


def perk_names():
    path = os.path.join(shell.ROOT, PERKS)
    if not os.path.exists(path):
        markup.die('%s 不存在，先跑 python3 tools/items.py --perks' % PERKS)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def library():
    """tools/items.json 原样：物品专名与 token 的对应表。"""
    path = os.path.join(shell.ROOT, OUT)
    if not os.path.exists(path):
        markup.die('%s 不存在，先跑 python3 tools/items.py --distill <导出.json>' % OUT)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load():
    """{名字: (token, 分类名)}。check_terms.py 的 G6 与 --suggest 共用这一份。"""
    data = library()
    # 库侧也照 STOP 滤一道。distill 落盘时已经滤过一遍，但那份 json 只在换赛季
    # 重跑时才更新；加载时再滤，改 STOP 当场生效，不必先拿到 49 MB 的官方导出。
    terms = {k: tuple(v) for k, v in data['terms'].items() if k not in STOP}
    # 库里没有的元素机制名。库侧的名字优先——同形时那是装备名，更具体。
    for word, token in MECH.items():
        if word not in STOP:
            terms.setdefault(word, (token, '元素机制'))
    # 异域装备的专属 Perk 名，来源见 perks()。库侧优先——同形时那是装备名，更具体。
    for word in perks():
        if word not in STOP:
            terms.setdefault(word, ('exotic', '异域 Perk'))
    # 武器 Perk 名。放在库侧与异域 Perk 之后：同形时那两样更具体（「堡垒」是异域
    # 融合步枪，不是同名的 Perk），Perk 只补上没人认领的那些。
    for word in perk_names():
        if word not in STOP:
            terms.setdefault(word, ('perk', '武器 Perk'))
    # 站内术语表里定了 token 的那些，走同一条正查——「勇士」「守护者」「能量球」
    # 这类档位与拾取物不在 Bungie 的 manifest 里，此前没有任何一条闸门要求它们着色，
    # 全站因此漏了八百多处。放在这里而不是另起一条闸门：正查只有一个实现。
    for word, token, _ in TERMS:
        if token and word not in STOP and word not in LOOSE:
            terms.setdefault(word, (token, '站内术语'))
    return terms, data['skipped']


def protected_spans(text):
    """G1 与自动正名共用：专名全文及链接目标不可改。"""
    return ([(m.start(), m.end()) for k in KEEP if k in text
             for m in re.finditer(re.escape(k), text)]
            + [(m.start(1), m.end(1))
               for m in re.finditer(r'\]\(([^)]*)\)', text)])


def expected_token(token, text, terms):
    """完整术语的唯一归属；两份真相冲突时拒绝猜测。"""
    targets = {t for w, t, _ in TERMS if w == text and t}
    item = terms.get(norm(text))
    if item and item[0] in MANAGED:
        if targets and targets != {item[0]}:
            markup.die('词表冲突「%s」：%s / %s' %
                       (text, '、'.join(sorted(targets)), item[0]))
        if token in MANAGED:
            targets.add(item[0])
    if len(targets) > 1:
        markup.die('词表冲突「%s」：%s' % (text, '、'.join(sorted(targets))))
    want = next(iter(targets), None)
    return want if want != token else None


def check_token_targets(terms):
    """任何源稿落盘之前核对词表交集。"""
    for word, token, _ in TERMS:
        if token:
            expected_token(token, word, terms)


# ── 建议清单 ──────────────────────────────────────────────────────────


def read_source(page):
    """一篇源稿的全文。主键骨架在 references/keys/，散文与表在 docs/。"""
    path = shell.source_path(page)
    if path is None:
        markup.die('找不到源稿：%s' % page)
    with open(path, encoding='utf-8') as f:
        return f.read()


def pages(slug=None):
    matched = False
    for name, path in shell.sources():
        # 更新日志是日志不是资料：它的条目名指向别的页面，句式与字数另有约定
        # （.claude/rules/pages.md「文案七条」），不跟着全站铺色。
        # 配色总览是站务页，正文里的术语是在讲颜色不是在讲机制。
        # 护甲套装页不在内：它走词表着色，源稿是纯中文，落标记等于换掉那一页的
        # 着色路径（design.md「两条着色路径」）。
        if name in ('changelog', 'palette', 'armor-sets'):
            continue
        if slug is not None and name != slug:
            continue
        matched = True
        yield os.path.relpath(path, shell.ROOT)
    if slug is not None and not matched:
        markup.die('没有可处理的资料源稿：%s；参数应为裸 slug，不含 .md 或路径' % slug)


# 头部的「键：值」与分节里的结构行（色阶、列组、卡片、攻略、轮换）不是正文：
# 描述那一行会原样进 meta description，色阶与列组里写的是列名，着色进去即写坏结构。
KEY_LINE = re.compile(r'^[\u4e00-\u9fff]{1,6}(（[^）]*）)?：')

# 分隔行；它上面那一行是表头。表头写的是列名，不是正文，不着色。
RULE_LINE = re.compile(r'^\|[-| ]+\|$')


def head_rows(lines):
    """表头行的下标集合。列名与标题同属「标签」，与行标题一样已有结构身份。"""
    return {i - 1 for i, line in enumerate(lines) if RULE_LINE.match(line.strip()) and i}


def hits_in(line, terms, names, keys=True):
    """这一行里该着色的裸出现，[(起, 止, 词)]，按位置倒序——就地替换从后往前改。

    六处跳过：标题行与行标题那一格（已有结构身份）、链接目标与图片路径（不是正文）、
    GUARD 里那些更长的专名、已经在某个 {token|…} 里面的（别人已经判过了）。
    表头行由调用方按 head_rows() 排除——那要看下一行是不是分隔行，一行看不出来。
    表里的词长词在前，先认长的。

    keys=False 时不认「键：值」行。配装源稿的注解是自由散文，推荐人写的
    「缺点：如果有其他术士用千语…」是正文不是键；按键行整行跳过，会让 check()
    要着色、这里拒绝着色，构建怎么跑都过不去。
    """
    if (keys and KEY_LINE.match(line)) or line.startswith('#'):
        return []
    head = markup.row_title_end(line)
    # 括号索引一行建一次，1400 条词共用：逐次现查是行长的平方。
    marks = markup.Markers(line)
    taken = [False] * len(line)
    for m in re.finditer(r'\]\([^)]*\)', line):
        for i in range(m.start(), m.end()):
            taken[i] = True
    for g, rex in zip(GUARD, GUARD_RX):    # 更长的专名整段屏蔽
        if g not in line:
            continue
        for m in rex.finditer(line):
            for i in range(m.start(), m.end()):
                taken[i] = True
    out = []
    for word in names.within(line):
        for m in rx(word).finditer(line):
            if m.start() < head or any(taken[m.start():m.end()]):
                continue
            if marks.at(m.start()):
                continue
            for i in range(m.start(), m.end()):
                taken[i] = True
            out.append((m.start(), m.end(), word))
    return sorted(out, reverse=True)


GAP = '\x01'    # 剥掉的标签留下的占位，两侧不许粘成一个词


def naked_text(frags):
    """一组产出片段剥掉着色 span 之后的裸文本，供闸门反查漏着色。

    标签换成占位符，不是删掉：「覆盖{el-void|虚空}护盾」剥完直接拼起来就是
    「覆盖护盾」，那是词表里的另一个术语，闸门会报一条源稿里根本没有的漏着色，
    而源稿怎么改都过不去（着色标记本身就是那个隔断）。片段之间同理。
    """
    out = []
    for frag in frags:
        # markup.typeset() 的 .cond 是排印层，包着着色 span，不当着色标记剥
        frag = re.sub(r'<span class="(?!cond")[^"]*">.*?</span>', GAP, frag, flags=re.S)
        out.append(re.sub(r'<[^>]+>', GAP, frag))
    return markup.text_of(GAP.join(out))


def no_forward():
    """只参与反查、不参与正查的词：LOOSE，加异域 PERK 那一格里连写的名字。

    一格写着好几个名字时（多数异域），那几个名字与散文里的普通词、别的装备名
    大量同形：大师、解构、救赎、不屈、集群猎人。要求全站给这些词着色会把「大师
    杰作」「解构完装备」染成装备名。一格只有一个名字的（光能盛宴、屏障手雷）照旧
    参与正查——站内散文里的这些词一直是着色的，不放行的话填表页擦掉颜色就补不回来。
    库侧认领了的（破冰者既是异域狙击枪也是它自己的固有 Perk）按装备名办，照旧正查。
    token 留着，G2 照旧管「着错了色」。
    """
    whole, solo = exotic_perks()
    return LOOSE | (whole - solo - set(library()['terms']))


def forward_terms():
    """正查与自动补色共用的那份词表：load() 去掉只参与反查的那些。一处定义。"""
    terms, _ = load()
    skip_words = no_forward()
    return {k: v for k, v in terms.items() if k not in skip_words}


def scan(slug=None):
    """[(源稿路径, 行号, 起, 止, 词)]，按源稿顺序。"""
    terms = forward_terms()
    names = Names(terms)
    out = []
    for rel in pages(slug):
        with open(os.path.join(shell.ROOT, rel), encoding='utf-8') as f:
            lines = f.read().split('\n')
        skip = head_rows(lines)
        for n, line in enumerate(lines, start=1):
            if n - 1 in skip:
                continue
            for a, b, word in reversed(hits_in(line, terms, names)):
                out.append((rel, n, a, b, word))
    return out


def suggest(slug=None):
    terms, _ = load()
    found = scan(slug)
    for rel in pages(slug):
        rows = [h for h in found if h[0] == rel]
        if not rows:
            continue
        print('\n%s —— %d 处' % (rel, len(rows)))
        lines = open(os.path.join(shell.ROOT, rel), encoding='utf-8').read().split('\n')
        for _, n, a, b, word in rows:
            token, kind = terms[word]
            text = lines[n - 1][a:b]
            print('  L%-5d %-14s → {%s|%s}  (%s)' % (n, text, token, text, kind))
    print('\n合计 %d 处待着色。--apply 落进源稿，再跑 npm run build。' % len(found))


def apply(slug=None):
    """把建议就地落进源稿。可重复跑——已经着色的那些下一趟自然跳过。"""
    terms, _ = load()
    names = Names(terms)
    total = 0
    for rel in pages(slug):
        path = os.path.join(shell.ROOT, rel)
        with open(path, encoding='utf-8') as f:
            lines = f.read().split('\n')
        n = 0
        skip = head_rows(lines)
        for i, line in enumerate(lines):
            if i in skip:
                continue
            line, count = color_text(line, terms, names)
            n += count
            lines[i] = line
        if n:
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            print('%s —— 落了 %d 处' % (rel, n))
            total += n
    print('合计 %d 处。跑 npm run build，再看 git diff。' % total)


# 配装源稿里的散文：「描述：」那一行的值，以及「## 注解」「## 合集介绍」
# 「## 审核意见」三节以下的正文。槽位行写的是物品名（「碎片：保护琢面、黎明琢面」），
# 由词表查表变成带图标的链接，源稿不写颜色——着进去就把名字改了，查表当场中止。
DESC_LINE = re.compile(r'^(描述：)(.*)$')
NOTE_HEADS = ('## 注解', '## 合集介绍', '## 审核意见')


def build_pages():
    """配装源稿一串。清单现扫，与 check_terms.py 的那一份同形。"""
    root = shell.BUILD_DIR
    if not os.path.isdir(root):
        return
    for season in sorted(os.listdir(root)):
        d = os.path.join(root, season)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith('.json'):
                yield os.path.join(d, name)


def prose_spans(lines):
    """{行下标: 从第几个字符起是散文}。描述那一行要跳过「描述：」三个字——
    hits_in() 见到「键：值」整行不着色，而这一行的值恰恰是要着色的那一段。"""
    out = {}
    note = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('# ') or stripped.startswith('## '):
            note = stripped in NOTE_HEADS
            continue
        hit = DESC_LINE.match(line)
        if hit:
            out[i] = len(hit.group(1))
        elif note and not stripped.startswith('#'):
            out[i] = 0
    return out


def misspelled(text):
    """G1：禁用写法的出现 [(位置, 禁用写法, 正名)]，按 TERMS 的顺序。专名全文与链接
    目标不算（protected_spans()）。闸门报它，rename() 改它，判据只有这一份。"""
    keep = protected_spans(text)
    out = []
    for wrong, right in banned_pairs():
        if wrong not in text:
            continue
        for m in re.finditer(re.escape(wrong), text):
            if not any(a <= m.start() and m.end() <= b for a, b in keep):
                out.append((m.start(), wrong, right))
    return out


def rename(body):
    """一段散文里的禁用写法换成正名。返回改过的那一段与处数。

    长词先占位：「重型弹药」与「弹药」同时进禁用表时，按起点升序、长度降序挑一遍
    非重叠的命中，短的那条就落在长的里面被跳过，不会把已经换过的字再切一刀。
    """
    hits = [(at, at + len(wrong), right) for at, wrong, right in misspelled(body)]
    taken, end = [], -1
    for a, b, right in sorted(hits, key=lambda x: (x[0], -x[1])):
        if a >= end:
            taken.append((a, b, right))
            end = b
    for a, b, right in reversed(taken):
        body = body[:a] + right + body[b:]
    return body, len(taken)


def color_text(text, terms, names, *, keys=True):
    """补色只有这一处；包原文，保留中英排版空格。"""
    hits = hits_in(text, terms, names, keys=keys)
    for a, b, word in hits:
        text = text[:a] + '{%s|%s}' % (terms[word][0], text[a:b]) + text[b:]
    return text, len(hits)


def normalize_text(text, *, terms, names):
    """正名 → 完整叶标记纠色 → 裸词补色，每步重算坐标。"""
    text, fixed = rename(text)
    protected = protected_spans(text)
    tinted = 0
    for match in reversed(list(markup.LEAF.finditer(text))):
        if any(a <= match.start() and match.end() <= b for a, b in protected):
            continue
        token, word = match.groups()
        target = expected_token(token, word, terms)
        if target:
            text = text[:match.start(1)] + target + text[match.end(1):]
            tinted += 1
    # 片段可能从表格身份格之后开始，不再把开头的 | 当作新行身份。
    text, colored = color_text(' ' + text, terms, names, keys=False)
    return text[1:], fixed, tinted, colored


def atomic_write(path, text):
    """同目录替换；失败保留旧文件，权限不变。"""
    mode = stat.S_IMODE(os.stat(path).st_mode)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='',
                                         dir=os.path.dirname(path), delete=False) as f:
            tmp = f.name
            f.write(text)
            os.chmod(tmp, mode)
        os.replace(tmp, path)
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


# 配装记录里要着色的那几个字段：描述与三个散文分节。与从前 prose_spans() 选中的
# 那些行一一对应——「描述：」那一行的值，以及注解／审核意见／合集介绍整段。
PROSE_FIELDS = ('描述',)
PROSE_SECTIONS = ('审核意见', '注解', '合集介绍')


def normalize_record(rec, terms, names, path, reports, where=''):
    """一条配装记录里的散文就地纠正。逐行处理，与它还是 markdown 时同一口径。"""
    totals = [0, 0, 0]

    def fix(text, label):
        out, counts = [], [0, 0, 0]
        for line in text.split('\n'):
            # 散文里以 # 开头的行是作者写的小标题，不参与正名与补色。
            if line.lstrip().startswith('#'):
                out.append(line)
                continue
            body, *got = normalize_text(line, terms=terms, names=names)
            out.append(body)
            counts = [a + b for a, b in zip(counts, got)]
            if body != line:
                reports.append('%s %s [正名 %d，纠色 %d，补色 %d] %s → %s'
                               % (os.path.relpath(path, shell.ROOT), label, *got,
                                  line, body))
        return '\n'.join(out), counts

    for key in PROSE_FIELDS:
        if rec.get(key):
            rec[key], got = fix(rec[key], where + key)
            totals = [a + b for a, b in zip(totals, got)]
    for key in PROSE_SECTIONS:
        node = (rec.get('节') or {}).get(key)
        if node:
            rec['节'][key], got = fix(node, where + key)
            totals = [a + b for a, b in zip(totals, got)]
    for k, member in enumerate(rec.get('成员') or (), 1):
        got = normalize_record(member, terms, names, path, reports,
                               where='第%d套·' % k)
        totals = [a + b for a, b in zip(totals, got)]
    return totals


def normalize_files(documents, builds):
    check_token_targets(load()[0])
    terms = forward_terms()
    names = Names(terms)
    totals = [0, 0, 0]
    changed = 0
    for path in builds:
        rec = migrate.load(path)
        reports = []
        counts = normalize_record(rec, terms, names, path, reports)
        if any(counts):
            totals = [a + b for a, b in zip(totals, counts)]
            atomic_write(path, migrate.dump(rec))
            changed += 1
            print('\n'.join(reports))
    for path, prose in [(os.path.join(shell.ROOT, p), False) for p in documents]:
        with open(path, encoding='utf-8', newline='') as f:
            original = f.read()
        lines = original.splitlines(keepends=True)
        if prose:
            spans = prose_spans(lines)
        else:
            skip = head_rows(lines)
            spans = {i: markup.row_title_end(line) for i, line in enumerate(lines)
                     if i not in skip and not line.lstrip().startswith('#')
                     and not KEY_LINE.match(line) and not RULE_LINE.match(line.strip())}
        reports = []
        for i, off in spans.items():
            old = lines[i]
            body, fixed, tinted, colored = normalize_text(
                old[off:], terms=terms, names=names)
            new = old[:off] + body
            if new == old:
                continue
            lines[i] = new
            counts = (fixed, tinted, colored)
            totals = [a + b for a, b in zip(totals, counts)]
            reports.append('%s:%d [正名 %d，纠色 %d，补色 %d] %s → %s' %
                           (os.path.relpath(path, shell.ROOT), i + 1, *counts,
                            old.rstrip('\r\n'), new.rstrip('\r\n')))
        result = ''.join(lines)
        if result != original:
            atomic_write(path, result)
            changed += 1
            print('\n'.join(reports))
    print('自动纠正：正名 %d，纠色 %d，补色 %d；改动 %d 个文件' % (*totals, changed))


def normalize(slug=None, *, builds=True):
    documents = list(pages(slug))
    normalize_files(documents, list(build_pages()) if builds else [])


def apply_builds():
    """独立运行时也只纠正配装散文，不碰槽位。"""
    normalize_files([], list(build_pages()))


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ['--distill'] and len(args) == 2:
        distill(os.path.expanduser(args[1]))
    elif args == ['--perks']:
        distill_perks()
    elif args == ['--builds']:
        apply_builds()
    elif args[:1] == ['--normalize'] and len(args) <= 2:
        normalize(args[1], builds=False) if len(args) == 2 else normalize()
    elif args[:1] in (['--suggest'], ['--apply']) and len(args) <= 2:
        (suggest if args[0] == '--suggest' else apply)(
            args[1] if len(args) == 2 else None)
    else:
        print('用法：\n'
              '    python3 tools/items.py --distill <items-full.json>\n'
              '    python3 tools/items.py --perks\n'
              '    python3 tools/items.py --suggest [slug]\n'
              '    python3 tools/items.py --apply   [slug]\n'
              '    python3 tools/items.py --normalize [slug]\n'
              '    python3 tools/items.py --builds', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
