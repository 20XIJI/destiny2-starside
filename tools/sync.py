#!/usr/bin/env python3
"""源稿与记录上的站内文字在库与仓库之间对账。

库（CloudBase 的 docs 与 recs 两个集合）是在线编辑台的工作副本，git 是发布本。
**三方比**：除了盘上与库里两份，还在 .git 里记一份「上次对完账时每篇的 hash」当基线，
所以「两边不一样」能分出是我改的还是别人改的。

    盘变了、库没变        → 推上去
    库变了、盘没变        → 拉下来
    两边都变了            → 当场报出是哪几篇，一个字不动
    盘上删了、库里没人动   → 库里跟着删
    盘上删了、库里有人改过 → 也算撞车
    盘上新加一篇          → 推上去（库里没东西可丢，不算撞车）

两种东西走这一套：

    docs  源稿，一篇一条。资料页盘上库里都是 markdown；配装盘上是结构化记录
          （references/builds/<赛季>/<slug>.json），库里、编辑台与填表页用的是
          markdown，在这里的边界上互转（migrate.write / migrate.parse）
    recs  data/ 里每条记录上站内写的文字，一条记录一条（facts.site_text()），
          主键页的就地编辑改的就是它

编辑台上通过的配装投稿也在这一步落盘：库里标了 ok=1 且带着 season 与 slug 的那些，
盘上还没有就写成 references/builds/<season>/<slug>.json。**在线只能标状态，写盘只在
本机**——那两截是路径，验在云函数（形状与查重），落在这里。

只比 hash 不记基线的话，「不同」永远推不出方向：那样一次推送就会把线上刚
通过的改动静默覆盖掉，而它从来没落过盘，git 历史上一点痕迹都没有。

    python3 tools/sync.py                 # 对账，双向都走
    python3 tools/sync.py --seed          # 盘整个覆盖库，首次灌库或对不上账时用
    python3 tools/sync.py --mine   <_id>… # 撞车了，这几篇以盘上的为准
    python3 tools/sync.py --theirs <_id>… # 撞车了，这几篇以库里的为准

一条源稿的 _id 即它在 references/ 下的相对路径去掉扩展名：docs/boss-hp、
keys/exotic-weapon、builds/s29-凯旋纪念碑/xxx-warlock。换算只有 path_of / id_of 两处。
一条记录的 _id 是「表名/裸 hash」：inventory-items/999767358、minted/4294967316，
与 editmap 写进页面的出处同一个。--mine / --theirs 两种 _id 都认。
"""
import argparse
import base64
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import facts
import migrate
import shell

ROOT = shell.ROOT
REFS = os.path.join(ROOT, 'references')
# 基线与 refs/deploy 同一个道理：它记的是这台机器对到哪儿了，不入库、不跨机器。
BASE = os.path.join(ROOT, '.git', 'starside-sync.json')


def token():
    """与云函数的 ADMIN_TOKEN 同一个，放 .env.local（已 gitignore）。"""
    path = os.path.join(ROOT, '.env.local')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                if line.startswith('ADMIN_TOKEN='):
                    return line.split('=', 1)[1].strip()
    raise RuntimeError('.env.local 里没有 ADMIN_TOKEN，连不上库')


def api(action, **kw):
    """打后端那支云函数。不走 tcb CLI：那条路每次起一个 Node 进程，实测 5.9 秒。

    **撞 429 就退避重试**：网关的 qpsPolicy 是单 IP 5 QPS，而灌库是一趟 75 次的
    连发。固定睡一个常数也压得住，但那个常数会在限流改了之后静默失效；按回应退避
    不必猜，也顺带兜住别处同时在打这支函数的情况。
    """
    target = '%s%s' % (action, ' ' + str(kw['id']) if kw.get('id') is not None else '')
    body = json.dumps(dict(kw, a=action, k=token()), ensure_ascii=False).encode()
    for wait in (0.3, 1, 3, 8, 0):
        req = urllib.request.Request(
            shell.API, data=body, headers={'content-type': 'application/json'})
        try:
            out = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
        except urllib.error.HTTPError as e:
            if e.code != 429 or not wait:
                raise RuntimeError('%s：HTTP %d；写请求结果可能未知' % (target, e.code)) from None
            time.sleep(wait)
            continue
        except (OSError, json.JSONDecodeError, UnicodeDecodeError) as e:
            raise RuntimeError('%s：%s；写请求结果可能未知' % (target, type(e).__name__)) from None
        if isinstance(out, dict) and out.get('error'):
            raise RuntimeError('后端拒了 %s：%s' % (target, out['error']))
        return out
    raise RuntimeError('%s 一直被限流挡着' % action)


def sha1(text):
    return hashlib.sha1(text.encode()).hexdigest()


def is_build(doc_id):
    """配装那一档：盘上是结构化记录，库里是 markdown。投稿这条入口也只开给它。"""
    return doc_id.startswith('builds/')


def is_rec(doc_id):
    """记录上的站内文字那一档：_id 的第一截是一张实体表的名字。"""
    return doc_id.split('/', 1)[0] in facts.TABLES


def db_form(doc_id, text):
    """盘上那一份 → 库里存的那一份。配装盘上是记录，库里、编辑台与填表页用 markdown：
    编辑台读头部那几行、云函数按头部算指纹、填表页灌入与导出，认的都是 markdown。
    三方比的 hash 一律按这一份算。"""
    return migrate.write(json.loads(text)) if is_build(doc_id) else text


def as_source(doc_id, text):
    """库里那一份 → 落盘的那一份。db_form() 反过来，投稿落盘与拉下来都走它。"""
    return migrate.dump(migrate.parse(text)) if is_build(doc_id) else text


def id_of(path):
    """绝对路径 → 库里的 _id。扩展名不进 _id：配装与人写层是 .json，别处是 .md。"""
    rel = os.path.relpath(path, REFS).replace(os.sep, '/')
    return rel.rsplit('.', 1)[0]


def path_of(doc_id):
    """库里的 _id → 绝对路径。**必须落在 references/ 之内**，realpath 挡穿越——
    _id 从库里来，而库是联网的那一侧。"""
    ext = '.json' if is_build(doc_id) else '.md'
    p = os.path.realpath(os.path.join(REFS, doc_id + ext))
    if not p.startswith(REFS + os.sep):
        raise RuntimeError('这个 _id 指到 references/ 外面去了：%s' % doc_id)
    return p


def on_disk():
    """盘上的全部源稿：{_id: 库里那种写法的正文}。清单即 .gitignore 白名单放行的那几处。

    资料页分两处：`docs/` 散文与表、`keys/` 主键骨架。两处同构，`_id` 就是它在
    `references/` 下的相对路径去掉扩展名，编辑台因此不必知道一篇落在哪一边。
    """
    out = {}
    heads = [os.path.join(REFS, 'docs'), os.path.join(REFS, 'keys')]
    builds = os.path.join(REFS, 'builds')
    if os.path.isdir(builds):
        heads += [os.path.join(builds, d) for d in sorted(os.listdir(builds))]
    for d in heads:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith(('.md', '.json')):
                p = os.path.join(d, name)
                with open(p, encoding='utf-8') as f:
                    out[id_of(p)] = db_form(id_of(p), f.read())
    return out


def in_db(docs=None):
    """库里每篇的正文。docs 给了就不再请求，与同一次 pull 的别的字段共用一次调用。"""
    if docs is None:
        docs = api('pull')['docs']
    return {d['_id']: (d.get('md') or '') for d in docs}


def baseline(save=None):
    if save is not None:
        with open(BASE, 'w', encoding='utf-8') as f:
            json.dump(save, f, ensure_ascii=False, indent=0, sort_keys=True)
        return save
    if os.path.exists(BASE):
        with open(BASE, encoding='utf-8') as f:
            return json.load(f)
    return {}


def put(path, md):
    """CRLF→LF，补上末尾换行。"""
    try:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(md.replace('\r\n', '\n').rstrip('\n') + '\n')
    except OSError as e:
        parent = os.path.dirname(os.path.abspath(path))
        reason = ('父目录不存在：%s；先创建该目录，再重跑原命令' % parent
                  if not os.path.isdir(parent) else str(e))
        raise RuntimeError('落盘失败 %s：%s' % (os.path.abspath(path), reason)) from None


def send(doc_id, md):
    # 网关的请求体上限 100 KB，最长那篇源稿 159 KB，所以一律压过再发。
    api('push', id=doc_id, gz=base64.b64encode(gzip.compress(md.encode(), 9)).decode())


def fetch(doc_id, text):
    """库里那一份落盘，回盘上此刻那一份（库里的写法）。

    配装落盘要经 markdown → 记录 → markdown 走一趟，头部键的顺序、空行这些会被
    规范成 migrate.write() 的写法。规范完与库里不同时把规范的那一份推回去，
    两边从此逐字相同，下一轮不会再把它当成本机改过。"""
    put(path_of(doc_id), as_source(doc_id, text))
    with open(path_of(doc_id), encoding='utf-8') as f:
        now = db_form(doc_id, f.read())
    if now != text:
        send(doc_id, now)
    return now


def plan(d, r, b):
    """三方比：盘上、库里、基线三个 hash（缺了是 None）→ 这一篇做什么。

        same   两边一样
        push   盘上变了库里没变，或者盘上新加、库里没有
        pull   库里变了盘上没变
        drop   盘上删了、库里没人动：库里跟着删
        stuck  两边都变了；库里有而盘上与基线都没有；库里没了而盘上没动——
               最后这一种缺删除意图，不以库里缺稿为由删本地
    """
    if d == r:
        return 'same'
    if b is None:
        return 'push' if r is None else 'stuck'
    if d != b and r != b:
        return 'stuck'
    if d != b:
        return 'drop' if d is None else 'push'
    return 'stuck' if r is None else 'pull'


# ── 记录上的站内文字 ──────────────────────────────────────────────────
# 一批推多少由请求体定：网关上限 100 KB，压过之后一批两百条约二十几 KB，
# 云函数那一侧另有 500 条的防跑飞闸。
REC_BATCH = 200
REC_BYTES = 300_000


def recs_on_disk():
    """盘上每条记录那一份站内文字：{_id: 规范文本}。一个字都没有的记录不进库。"""
    out = {}
    for table in facts.TABLES:
        with open(facts.table_file(table), encoding='utf-8') as f:
            rows = json.load(f)
        for key, row in rows.items():
            flat = facts.site_text(table, row)
            if flat:
                out['%s/%s' % (table, key)] = facts.canon(flat)
    return out


def recs_in_db():
    """库里的全部记录：({_id: 规范文本}, {_id: landed})。按 _id 翻页取到底。

    库里那份必须已经是规范写法：云函数的 canon() 与 facts.canon() 逐字节相同，
    不同就是两边的写法分了岔，hash 从此对不上，审核台会把每条都标成「已改」。"""
    out, landed, skip = {}, {}, 0
    while True:
        got = api('rpull', skip=skip)
        for row in got['recs']:
            text = row.get('json') or ''
            if facts.canon(json.loads(text)) != text:
                raise RuntimeError('库里 %s 那一份不是规范写法，两边的 canon() 分岔了' % row['_id'])
            out[row['_id']] = text
            landed[row['_id']] = row.get('landed') or ''
        if not got.get('more'):
            return out, landed
        skip += len(got['recs'])


def rsend(items):
    """[(_id, 规范文本)] → 按批推上去。云函数写 landed 与 hash。"""
    batch, size = [], 0
    for rid, text in items + [(None, '')]:
        n = len(text.encode())
        if batch and (rid is None or len(batch) >= REC_BATCH or size + n > REC_BYTES):
            body = json.dumps(batch, ensure_ascii=False).encode()
            api('rpush', gz=base64.b64encode(gzip.compress(body, 9)).decode())
            batch, size = [], 0
        if rid is not None:
            batch.append([rid, text])
            size += n


def rfetch(items):
    """[(_id, 规范文本)] → 写回 data/ 的那几张表，一张表只落一次盘。"""
    by_table = {}
    for rid, text in items:
        table, key = rid.split('/', 1)
        by_table.setdefault(table, []).append((key, text))
    for table, got in by_table.items():
        with open(facts.table_file(table), encoding='utf-8') as f:
            rows = json.load(f)
        for key, text in got:
            if key not in rows:
                raise RuntimeError('%s/%s 在盘上的表里没有这条记录，写不回去' % (table, key))
            facts.put_site_text(table, rows[key], json.loads(text))
        facts.dump(facts.table_file(table), rows)


def rlanded(items):
    for i in range(0, len(items), 500):
        api('rlanded', items=items[i:i + 500])


def rdiff(rid, d, r):
    """撞车的那一条两边差在哪几格，逐格打出来。记录没有 .remote 旁置文件：一格
    通常一两句话，比开文件对照快。"""
    a = json.loads(d) if d is not None else {}
    b = json.loads(r) if r is not None else {}
    for path in sorted(set(a) | set(b)):
        if a.get(path) != b.get(path):
            print('  %s  %s\n    盘上：%r\n    库里：%r' % (rid, path, a.get(path), b.get(path)))


def sync_recs(base):
    """记录那一路的三方比。回撞车的那几条 _id。"""
    disk = recs_on_disk()
    db, landed = recs_in_db()
    push, pull, drop, stuck, done = [], [], [], [], {}
    for rid in sorted(set(disk) | set(db)):
        d, r = disk.get(rid), db.get(rid)
        dh = sha1(d) if d is not None else None
        act = plan(dh, sha1(r) if r is not None else None, base.get(rid))
        if act == 'stuck':
            stuck.append(rid)
            continue
        if act == 'push':
            push.append((rid, d))
        elif act == 'pull':
            pull.append((rid, r))
            dh = sha1(r)
        elif act == 'drop':
            drop.append(rid)
        done[rid] = dh
    if pull:
        rfetch(pull)
    if push:
        rsend(push)
    for i in range(0, len(drop), 500):
        api('rdrop', ids=drop[i:i + 500])
    # 推上去那一路云函数写过 landed；拉下来的与库里还没有这个值的在这里补。
    # **稳态下全部相等，一次调用都不发。**
    pushed = {rid for rid, _ in push}
    rlanded([[rid, dh] for rid, dh in sorted(done.items())
             if dh is not None and rid not in pushed and landed.get(rid) != dh])
    for rid, dh in done.items():
        if dh is None:
            base.pop(rid, None)
        else:
            base[rid] = dh
    baseline(base)
    for name, n in (('记录推上去', len(push)), ('记录拉下来', len(pull)), ('记录库里删掉', len(drop))):
        if n:
            print('%s %d 条' % (name, n))
    if stuck:
        print('\n记录冲突 %d 条：这些记录未改动' % len(stuck))
        for rid in stuck:
            rdiff(rid, disk.get(rid), db.get(rid))
    return stuck


def land(subs, dropped=()):
    """编辑台上通过的投稿 → references/builds/<season>/<slug>.json。

    只写盘上还没有的那些：重跑一次不该把已经改过的源稿按投稿原文盖回去。

    **通过了删除申请的那几套要跳过。**一套配装是先投稿上站、后来才申请删除的，
    两条记录都标着 ok=1 且指着同一个 season/slug：sweep() 刚删掉，land() 转头
    又按那条投稿写回来，每跑一次 sync 都重演一遍，那一篇永远删不掉。
    """
    wrote = []
    for sub in subs:
        if int(sub.get('ok') or 0) != 1 or sub.get('drop'):
            continue
        season, slug = sub.get('season'), sub.get('slug')
        if not season or not slug:
            print('  ? 投稿 %s 标了通过却没有 season/slug，跳过' % sub['_id'])
            continue
        if 'builds/%s/%s' % (season, slug) in dropped:
            continue
        p = path_of('builds/%s/%s' % (season, slug))
        if os.path.exists(p):
            continue
        if not os.path.isdir(os.path.dirname(p)):
            print('  ? 赛季目录不在：%s，跳过' % season)
            continue
        md = sub.get('md') or ''
        if not md.startswith('# '):
            print('  ? 投稿 %s 首行不是配装名，跳过' % sub['_id'])
            continue
        try:
            body = as_source('builds/%s/%s' % (season, slug), md)
        except SystemExit as why:
            # 投稿的 markdown 在控制台里改得动，改出一个没登记的头部键，
            # migrate.parse() 就 markup.die()。**不许让这一篇把整轮对账带走**：
            # deploy.py 每次发文件之前无条件对一次账，对账停住即整站发不出去，
            # 而同一批里别的投稿本来都是好的。这里跳过它并带上解析器的原话，
            # 下一轮它还在库里，改对了自然落盘。只接 SystemExit——那是
            # markup.die() 的信号，别的异常照旧抛出去。
            print('  ? 投稿 %s（builds/%s/%s）解析不了，跳过：%s'
                  % (sub['_id'], season, slug, why))
            continue
        put(p, body)
        wrote.append('builds/%s/%s' % (season, slug))
        print('已落盘配装 %s' % wrote[-1], flush=True)
    if wrote:
        print('落盘 %d 套配装' % len(wrote))
    return wrote


def deletions(subs):
    """同一目标的全部已通过删除申请；所有路径先经 path_of 验证。"""
    targets = {}
    for sub in subs:
        if int(sub.get('ok') or 0) != 1 or not sub.get('drop'):
            continue
        season, slug = sub.get('season'), sub.get('slug')
        if not season or not slug:
            print('  ? 删除申请 %s 没有 season/slug，跳过' % sub['_id'])
            continue
        doc_id = 'builds/%s/%s' % (season, slug)
        path_of(doc_id)
        targets.setdefault(doc_id, []).append(sub)
    return targets


def sweep(subs, disk, base, force=()):
    """审核删除先与本机基线对比，再删库、删盘；不猜未同步修改的去向。"""
    gone, conflicts = [], []
    for doc_id in deletions(subs):
        p = path_of(doc_id)
        if doc_id not in force and doc_id in disk and (
                doc_id not in base or sha1(disk[doc_id]) != base[doc_id]):
            conflicts.append(doc_id)
            print('  %s：删除与本地修改冲突' % doc_id)
            continue
        api('drop', id=doc_id)
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError as e:
            raise RuntimeError('远端已删除，本地删除失败：%s：%s' % (p, e)) from e
        base.pop(doc_id, None)
        baseline(base)
        gone.append(doc_id)
        print('已删除配装 %s' % doc_id, flush=True)
    if gone:
        print('删掉 %d 套配装' % len(gone))
    return gone, conflicts


def sync():
    disk, db, base = on_disk(), in_db(), baseline()
    subs = api('list')['subs']
    gone, conflicts = sweep(subs, disk, base)
    # 冲突目标也不能由旧投稿恢复，更不能在后面的三方比中反手推回库。
    land(subs, dropped=set(gone) | set(conflicts))
    # landed 与正文出自同一次 pull：审核台判 hash != landed 即「线上改过、还没落盘」，
    # 这一轮对完账之后每篇都该相等。
    raw = api('pull')['docs']
    disk, db = on_disk(), in_db(raw)
    landed = {d['_id']: (d.get('landed') or '') for d in raw}
    pushed, pulled, dropped, stuck = [], [], [], list(conflicts)

    for doc_id in sorted(set(disk) | set(db)):
        if doc_id in conflicts:
            continue
        d = disk.get(doc_id)
        r = db.get(doc_id)
        b = base.get(doc_id)
        dh = sha1(d) if d is not None else None
        act = plan(dh, sha1(r) if r is not None else None, b)
        completed = ''
        if act == 'stuck':
            stuck.append(doc_id)
            continue
        if act == 'push':
            send(doc_id, d)
            landed[doc_id] = dh         # push 顺手写了 landed，别再补一次
            pushed.append(doc_id)
            completed = '已推送'
        elif act == 'drop':
            api('drop', id=doc_id)
            dropped.append(doc_id)
            completed = '已删除库稿'
        elif act == 'pull':
            dh = sha1(fetch(doc_id, r))
            landed[doc_id] = dh if dh != sha1(r) else landed.get(doc_id)
            pulled.append(doc_id)
            completed = '已拉取'
        # 对完账之后盘上就是这一版，landed 记住它的 hash。推上去那一路云函数已经写过、
        # 上面同步了本地这一份，比一下就跳过；拉下来的与库里还没有这个值的在这里补。
        # **稳态下全部相等，一次调用都不发。**
        if dh is not None and landed.get(doc_id) != dh:
            api('landed', id=doc_id, hash=dh)

        # 每篇成功立即记录；后面的 API/落盘失败不抹掉已完成的对账。
        if dh != b:
            if dh is None:
                base.pop(doc_id, None)
            else:
                base[doc_id] = dh
            baseline(base)
        if completed:
            print('%s %s' % (completed, doc_id), flush=True)

    for name, ids in (('推上去', pushed), ('拉下来', pulled), ('库里删掉', dropped)):
        if ids:
            print('%s %d 篇' % (name, len(ids)))
    if not (pushed or pulled or dropped or stuck):
        print('两边一致，%d 篇' % len(disk))
    rec_stuck = sync_recs(base)

    if stuck:
        # 撞车的那几篇把库里那份写在旁边，好逐字比对再定夺；references/ 整个
        # 走「全忽略 + 白名单」，.remote 不是 .md，不会入库。
        for doc_id in stuck:
            if doc_id in db:
                # 旁置的那一份留 markdown：它是给人比对用的，不是源稿。
                put(path_of(doc_id) + '.remote', db[doc_id])
        print('\n冲突 %d 篇：这些源稿未改动；其他已完成项见上方回执' % len(stuck))
        for doc_id in stuck:
            print('  %s' % doc_id + ('  库里那份写在 %s' % os.path.relpath(path_of(doc_id) + '.remote', ROOT)
                                     if doc_id in db else ''))
        print('比过之后择一：')
        print('  python3 tools/sync.py --mine   ' + ' '.join(stuck))
        print('  python3 tools/sync.py --theirs ' + ' '.join(stuck))

    if rec_stuck:
        print('比过之后择一：')
        print('  python3 tools/sync.py --mine   ' + ' '.join(rec_stuck))
        print('  python3 tools/sync.py --theirs ' + ' '.join(rec_stuck))

    # 删除在 sweep 中显式清除基线，冲突目标始终保留原值。
    baseline(base)
    return 1 if stuck or rec_stuck else 0


def take(ids, mine):
    """撞车的那几篇（几条）择一边。源稿与记录两种 _id 混着给也行，各走各的。"""
    recs = [i for i in ids if is_rec(i)]
    docs = [i for i in ids if not is_rec(i)]
    if docs:
        take_docs(docs, mine)
    if recs:
        take_recs(recs, mine)


def take_recs(ids, mine):
    base = baseline()
    disk = recs_on_disk()
    db, landed = recs_in_db()
    for rid in ids:
        if mine:
            if rid in disk:
                rsend([(rid, disk[rid])])
                base[rid] = sha1(disk[rid])
            else:
                api('rdrop', ids=[rid])
                base.pop(rid, None)
        else:
            if rid not in db:
                sys.exit('%s 库里没有，谈不上以库里的为准' % rid)
            rfetch([(rid, db[rid])])
            base[rid] = sha1(db[rid])
            if landed.get(rid) != base[rid]:
                rlanded([[rid, base[rid]]])
        baseline(base)
        print('%s ← %s' % (rid, '盘上那份' if mine else '库里那份'), flush=True)


def take_docs(ids, mine):
    raw = api('pull')['docs']
    disk, db, base = on_disk(), in_db(raw), baseline()
    landed = {d['_id']: (d.get('landed') or '') for d in raw}
    subs = api('list')['subs']
    targets = deletions(subs)
    for doc_id in ids:
        path_of(doc_id)
        if doc_id in targets:
            if mine:
                # 全部撤销成功才允许本地择边写回；失败保留基线与 .remote。
                for sub in targets[doc_id]:
                    api('mark', id=sub['_id'], ok=-1)
            else:
                sweep(targets[doc_id], disk, base, force={doc_id})
                leftover = path_of(doc_id) + '.remote'
                if os.path.exists(leftover):
                    os.remove(leftover)
                print('%s ← 接受删除' % doc_id, flush=True)
                continue
        if mine:
            if doc_id not in disk:
                api('drop', id=doc_id)
                base.pop(doc_id, None)
            else:
                send(doc_id, disk[doc_id])
                base[doc_id] = sha1(disk[doc_id])
        else:
            if doc_id not in db:
                sys.exit('%s 库里没有，谈不上以库里的为准' % doc_id)
            now = fetch(doc_id, db[doc_id])
            base[doc_id] = sha1(now)
            if now != db[doc_id]:
                landed[doc_id] = base[doc_id]   # fetch() 把规范过的那一份推回去了
            # 盘上就是库里这一版了，landed 跟着走：不写的话审核台一直标着「已改」，
            # 直到下一次整轮 sync 才收敛。**只在不等时才发**，与 sync() 同一个契约
            # ——云函数据此把「写不进去」当成那条 doc 没了，当场报出来。
            if landed.get(doc_id) != base[doc_id]:
                api('landed', id=doc_id, hash=base[doc_id])
        baseline(base)
        leftover = path_of(doc_id) + '.remote'
        if os.path.exists(leftover):
            os.remove(leftover)
        print('%s ← %s' % (doc_id, '盘上那份' if mine else '库里那份'), flush=True)
    baseline(base)


def seed():
    disk = on_disk()
    for doc_id, md in sorted(disk.items()):
        send(doc_id, md)
        print('已灌库 %s（基线将在全部成功后重记）' % doc_id, flush=True)
    recs = recs_on_disk()
    rsend(sorted(recs.items()))
    print('已灌库记录 %d 条' % len(recs), flush=True)
    base = {k: sha1(v) for k, v in disk.items()}
    base.update({k: sha1(v) for k, v in recs.items()})
    baseline(base)
    print('灌了 %d 篇、%d 条记录，基线重记' % (len(disk), len(recs)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, allow_abbrev=False,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--seed', action='store_true', help='盘整个覆盖库，并重记基线')
    ap.add_argument('--mine', nargs='+', metavar='_id', help='撞车了，这几篇（条）以盘上的为准')
    ap.add_argument('--theirs', nargs='+', metavar='_id', help='撞车了，这几篇（条）以库里的为准')
    a = ap.parse_args()
    if a.seed and (a.mine or a.theirs):
        ap.error('--seed 与 --mine/--theirs 不能同时使用')
    overlap = set(a.mine or ()) & set(a.theirs or ())
    if overlap:
        ap.error('同一 _id 不能同时以盘上和库里为准：' + '、'.join(sorted(overlap)))
    try:
        if a.seed:
            seed()
        elif a.mine or a.theirs:
            if a.mine:
                take(a.mine, True)
            if a.theirs:
                take(a.theirs, False)
        else:
            sys.exit(sync())
    except (OSError, RuntimeError) as e:
        print('%s\n已完成项保留；结果不明的写入请核对后重跑，未执行全轮回滚' % e,
              file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
