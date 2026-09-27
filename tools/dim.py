"""配装 → DIM 的导入链接。

DIM 认 `https://app.destinyitemmanager.com/loadouts?loadout=<JSON>`，JSON 是
dim-api 的 `Loadout`（DIM `src/app/loadout/loadout-share/loadout-import.ts` 的
`decodeUrlLoadout`）。不要 API key，不要登录本站。我们只有 manifest 的 hash、没有
玩家那一件的实例 id，于是各部分落到 DIM 里是这样（按 DIM 源码 af544ef 核对）：

- 子职业与神器按 hash 认，`socketOverrides` 应用时插进去。
- 武器与护甲只按实例 id 认，只给 hash 时是一格灰色的缺失件，点开由玩家挑自己
  那一件；异域护甲同时成为优化器锁定的异域。
- `parameters.mods` 装到应用时身上穿着的那几件护甲上。

DIM 在导入与应用时都不校验插件属不属于那一栏：插错了编辑器里照样显示，应用时才被
Bungie 拒掉。所以这里每一枚都要落在那一栏自己的插件池里，落不上即中止。
"""

import json
from urllib.parse import quote

import items
import migrate
import resolve
import rows
from markup import BRANCH, CLASSES, die

DIM = 'https://app.destinyitemmanager.com/loadouts?loadout='

# Bungie 的 DestinyClass：0 泰坦、1 猎人、2 术士。
CLASS_TYPE = {'泰坦': 0, '猎人': 1, '术士': 2}
assert set(CLASS_TYPE) == set(CLASSES)
# 分支 → 子职业插槽白名单里的那一段（hunter.prism.supers 的 prism）。只有棱镜与
# 站内的分支 slug 不同：manifest 写 prism，站内写 prismatic。
BRANCH_ID = {b: 'prism' if slug == 'prismatic' else slug for b, slug in BRANCH.items()}
# 护甲五个部位的 InventoryBucket hash，顺序即套装件往空部位里填的顺序。
BUCKETS = {'头盔': 3448274439, '护臂': 3551918588, '胸甲': 14239492,
           '腿部': 20886954, '职业物品': 1585787867}
# 配装的技能格 → socket-types 的 derived.kind（facts.LOADOUT_KIND 归一出来的那一位）。
SKILLS = {'超能': 'super', '手雷': 'grenade', '近战': 'melee', '移动': 'movement',
          '职业技能': 'class_ability', '星相': 'aspect', '碎片': 'fragment'}
NAME_MAX = 120            # dim-api 的校验
MINTED_FAMILY = '模组族'


def sockets(h):
    """一件东西的插槽：`[(栏号, kind, [插得进的 hash…])]`。池子由 rows.socket_pool()
    给：冰影的超能栏没有插件集，只有初始那一枚。"""
    entries: list = (rows.facts().items[str(h)].get('sockets') or {}).get('socketEntries') or []
    return [(i, rows.socket_kind(e), [int(x) for x in rows.socket_pool(e)])
            for i, e in enumerate(entries)]


def plug_in(key, name, pool, what):
    """配装写的那一枚 → 这一栏池子里的那一枚。

    同一个技能在元素页与棱镜页、同一个职业技能在五个分支上各是一枚 hash；配装戳的
    是资料页那一行的，池子里是这个子职业自己的。同名且只有一枚才认，否则中止。
    没戳主键的格子（移动）只按名字找。"""
    f = rows.facts()
    if key and int(key) in pool:
        return int(key)
    if key:
        name = resolve.text(f.items.get(str(key)))
    hits = sorted({p for p in pool if resolve.text(f.items.get(str(p))) == name})
    if len(hits) != 1:
        die('%s「%s」(%s) 落不到这一栏：池子里同名的有 %d 枚 %s'
            % (what, name, key, len(hits), hits))
    return hits[0]


def subclass_of(cls, branch):
    """职业 + 分支 → 子职业 hash。按首栏白名单里的分支段认（hunter.prism.class_abilities），
    必须恰好一件：两件时按字典序挑一件，导出的就可能是玩家没有的那一件。"""
    f = rows.facts()
    want = '.%s.' % BRANCH_ID[branch]
    hits = [h for h, r in f.items.items()
            if r.get('itemType') == 16 and r.get('classType') == CLASS_TYPE[cls]
            and want in f.kind_of(r['sockets']['socketEntries'][0])]
    if len(hits) != 1:
        die('%s·%s在库里对到 %d 个子职业：%s' % (branch, cls, len(hits), hits))
    return hits[0]


def keys(val):
    """一格或一串格子 → [(主键, 名字)]。没戳主键的格子（移动）主键是 None。"""
    vals = val if isinstance(val, list) else [val]
    return [(v.get('主键'), v.get('名字')) if isinstance(v, dict) else (None, v)
            for v in vals if v]


def stamped(val, slot):
    """戳了主键的那几个槽位：[(主键, 名字)]，主键一定在。"""
    out = []
    for key, name in keys(val):
        if not key:
            die('「%s」这一格没戳主键：%s' % (slot, name))
        out.append((int(key), name))
    return out


def subclass(sec, cls, branch):
    """子职业那一件：`{hash, socketOverrides}`；配装一栏都没写时返回 None。

    `socketOverrides` 只要在，哪怕是 `{}`，DIM 应用时都把没给的技能栏（超能、手雷、
    近战、移动、职业技能）重置成默认，所以写了的都给，一栏都没写的整件不导出：
    多职业配装（「标术士是因为不能留白」）导出一个空的子职业，会把读者切到那个分支、
    五栏技能全部重置。星相与碎片按栏序连着填：DIM 只读前 N 个碎片栏，N 由星相定。"""
    h = subclass_of(cls, branch)
    socks = sockets(h)
    over = {}
    for slot, kind in SKILLS.items():
        free = [(i, pool) for i, k, pool in socks if k == kind]
        got = keys(sec.get(slot) or [])
        if len(got) > len(free):
            die('「%s：」写了 %d 项，%s·%s只有 %d 栏' % (slot, len(got), branch, cls, len(free)))
        for (i, pool), (key, name) in zip(free, got):
            over[str(i)] = plug_in(key, name, pool, slot)
    return {'hash': int(h), 'socketOverrides': over} if over else None


def artifact(sec):
    """神器那一件：玩家背包里的是影子条目（本体的 derived.socketed），七个槽按档位
    累积——一档槽只收一档，三档槽三档都收。先放能去的槽最少的那一枚，每枚落进
    收得下它的槽里池子最小的那一个；池子层层包含，这样放不会把后面的挤掉。

    只写了神器、没写模组时只给 hash：DIM 照样换上这件神器，不动槽。"""
    f = rows.facts()
    name = items.norm(sec.get('神器') or '')
    body = [r for r in f.items.values()
            if r.get('itemType') == 28 and (r.get('derived') or {}).get('socketed')
            and items.norm(resolve.text(r)) == name]
    if len(body) != 1:
        die('「神器：%s」在库里对到 %d 件本体' % (sec.get('神器'), len(body)))
    shadow = body[0]['derived']['socketed']
    slots = [(i, pool) for i, k, pool in sockets(shadow) if k == 'artifact']
    union = sorted({p for _, pool in slots for p in pool})
    perks = [plug_in(key, name, union, '神器模组') for key, name in keys(sec.get('模组') or [])]
    perks.sort(key=lambda p: sum(p in pool for _, pool in slots))
    over, used = {}, set()
    for p in perks:
        fit = sorted((len(pool), i) for i, pool in slots if p in pool and i not in used)
        if not fit:
            die('神器模组 %d 放不进%s剩下的槽' % (p, sec.get('神器')))
        used.add(fit[0][1])
        over[str(fit[0][1])] = p
    return {'hash': int(shadow), 'socketOverrides': over} if over else {'hash': int(shadow)}


def armor(sec, cls):
    """护甲：异域一件 + 套装件，各占一个部位，都只给 hash（灰色缺失格）。

    返回 (equipped 里的护甲, exoticArmorHash, 异域职业物品的两条之灵, setBonuses)。"""
    f = rows.facts()
    out, perks, bonuses = [], [], {}
    free = list(BUCKETS.values())
    exotic = None
    # 「异域护甲：」是一件护甲，或异域职业物品加它的两条之灵；也有只写之灵的。
    # 之灵是插件不是护甲，交给优化器按词条筛（parameters.perks）。
    for key, name in stamped(sec.get('异域护甲') or [], '异域护甲'):
        rec = f.items[str(key)]
        if rec.get('itemType') == 2:
            if exotic:
                die('「异域护甲：」写了两件护甲（%s、%s），一次只能穿一件' % (exotic, name))
            exotic = key
            free.remove(rec['inventory']['bucketTypeHash'])
            out.append({'hash': exotic})
        else:
            perks.append(key)
    want = {}
    for s in sec.get('套装') or ():
        h = s['主键'].removeprefix('set:')
        want[h] = max(want.get(h, 0), int(s['件数'].split()[0]))
    if sum(want.values()) > len(free):
        die('套装一共要 %d 件，异域之外只剩 %d 个部位' % (sum(want.values()), len(free)))
    for h, n in sorted(want.items(), key=lambda kv: -kv[1]):
        bonuses[h] = n
        mine = {p['bucketTypeHash']: p['itemHash']
                for p in f.sets[h]['derived']['pieces'] if p['classType'] == CLASS_TYPE[cls]}
        for b in free[:n]:
            out.append({'hash': mine[b]})
        free = free[n:]
    return out, exotic, perks, bonuses


def mods(sec):
    """五个部位的护甲模组，按部位顺序拼成一串。只写了模组族的格子（「抗性」）
    没有具体那一枚，跳过。"""
    f = rows.facts()
    out = []
    for part in BUCKETS:
        for key, name in stamped(sec.get(part) or [], part):
            minted = f.minted.get(str(key))
            if minted:
                if minted.get('kind') != MINTED_FAMILY:
                    die('%s的「%s」(%s) 不是护甲模组' % (part, name, key))
                continue
            cat = (f.items[str(key)].get('plug') or {}).get('plugCategoryIdentifier', '')
            if not cat.startswith('enhancements.'):
                die('%s的「%s」(%s) 不是护甲模组：%s' % (part, name, key, cat))
            out.append(key)
    return out


def weapons(sec):
    """武器：(equipped, unequipped)。一个槽位只装一把，同槽位的第二把起是候补——
    源稿有「龙息、拜龙教镰刀」两把威能写在一套里的，两把都算装备的话，DIM 应用时
    后一把顶掉前一把。异域在前，其余按源稿顺序。"""
    f = rows.facts()
    guns = []
    if sec.get('异域武器'):
        guns.append(int(sec['异域武器']['主键']))
    guns += [int(g['主键']) for g in sec.get('传说武器') or ()]
    on, off, taken = [], [], set()
    for g in guns:
        bucket = f.items[str(g)]['inventory']['bucketTypeHash']
        (off if bucket in taken else on).append({'hash': g})
        taken.add(bucket)
    return on, off


def loadout(rec, url):
    """一套配装 → DIM 的 Loadout。rec 是 migrate 的记录（合集里的一套），url 是
    这一套在站上的地址，备注里只写它。"""
    sec = migrate.flat(rec)
    cls = sec['职业']['名字']
    equipped = [x for x in (subclass(sec, cls, sec['分支']),) if x]
    if sec.get('神器'):
        equipped.append(artifact(sec))
    on, off = weapons(sec)
    equipped += on
    gear, exotic, perks, bonuses = armor(sec, cls)
    equipped += gear
    picked = mods(sec)
    params = {}
    if picked:
        params['mods'] = picked
    if exotic:
        params['exoticArmorHash'] = exotic
    if perks:
        params['perks'] = perks
    if bonuses:
        params['setBonuses'] = bonuses
    out = {'id': 'starside', 'name': rec['标题'][:NAME_MAX], 'classType': CLASS_TYPE[cls],
           'equipped': equipped, 'unequipped': off, 'notes': url}
    if params:
        out['parameters'] = params
    return out


def link(rec, url):
    return DIM + quote(json.dumps(loadout(rec, url), ensure_ascii=False,
                                  separators=(',', ':')), safe='')
