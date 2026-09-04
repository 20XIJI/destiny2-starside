#!/usr/bin/env python3
"""源稿在库与仓库之间对账。

库（CloudBase 的 docs 集合）是在线编辑台的工作副本，git 是发布本。**三方比**：
除了盘上与库里两份，还在 .git 里记一份「上次对完账时每篇的 hash」当基线，
所以「两边不一样」能分出是我改的还是别人改的。

    盘变了、库没变        → 推上去
    库变了、盘没变        → 拉下来
    两边都变了            → 当场报出是哪几篇，一个字不动
    盘上删了、库里没人动   → 库里跟着删
    盘上删了、库里有人改过 → 也算撞车
    盘上新加一篇          → 推上去（库里没东西可丢，不算撞车）

编辑台上通过的配装投稿也在这一步落盘：库里标了 ok=1 且带着 season 与 slug 的那些，
盘上还没有就写成 references/builds/<season>/<slug>.md。**在线只能标状态，写盘只在
本机**——那两截是路径，验在云函数（形状与查重），落在这里。

只比 hash 不记基线的话，「不同」永远推不出方向：那样一次 --push 就会把线上刚
通过的改动静默覆盖掉，而它从来没落过盘，git 历史上一点痕迹都没有。

    python3 tools/sync.py                 # 对账，双向都走
    python3 tools/sync.py --seed          # 盘整个覆盖库，首次灌库或对不上账时用
    python3 tools/sync.py --mine   <_id>… # 撞车了，这几篇以盘上的为准
    python3 tools/sync.py --theirs <_id>… # 撞车了，这几篇以库里的为准

一条源稿的 _id 即它在 references/ 下的相对路径去掉 .md：docs/exotic-weapon、
artifact-mods、builds/s29-凯旋纪念碑/xxx-warlock。换算只有 path_of / id_of 两处。
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
    body = json.dumps(dict(kw, a=action, k=token()), ensure_ascii=False).encode()
    for wait in (0.3, 1, 3, 8, 0):
        req = urllib.request.Request(
            shell.API, data=body, headers={'content-type': 'application/json'})
        try:
            out = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
        except urllib.error.HTTPError as e:
            if e.code != 429 or not wait:
                raise
            time.sleep(wait)
            continue
        if isinstance(out, dict) and out.get('error'):
            raise RuntimeError('后端拒了 %s：%s' % (action, out['error']))
        return out
    raise RuntimeError('%s 一直被限流挡着' % action)


def sha1(text):
    return hashlib.sha1(text.encode()).hexdigest()


def id_of(path):
    """绝对路径 → 库里的 _id。"""
    return os.path.relpath(path, REFS)[:-3].replace(os.sep, '/')


def path_of(doc_id):
    """库里的 _id → 绝对路径。**必须落在 references/ 之内**，realpath 挡穿越——
    _id 从库里来，而库是联网的那一侧。"""
    p = os.path.realpath(os.path.join(REFS, doc_id + '.md'))
    if not p.startswith(REFS + os.sep):
        raise RuntimeError('这个 _id 指到 references/ 外面去了：%s' % doc_id)
    return p


def on_disk():
    """盘上的全部源稿：{_id: 正文}。清单即 .gitignore 白名单放行的那几处。"""
    out = {}
    heads = [os.path.join(REFS, 'docs')]
    builds = os.path.join(REFS, 'builds')
    if os.path.isdir(builds):
        heads += [os.path.join(builds, d) for d in sorted(os.listdir(builds))]
    for d in heads:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith('.md'):
                p = os.path.join(d, name)
                out[id_of(p)] = open(p, encoding='utf-8').read()
    for name in ('artifact-mods.md', 'armor-sets.md'):
        p = os.path.join(REFS, name)
        if os.path.exists(p):
            out[id_of(p)] = open(p, encoding='utf-8').read()
    return out


def in_db():
    return {d['_id']: (d.get('md') or '') for d in api('pull')['docs']}


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
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(md.replace('\r\n', '\n').rstrip('\n') + '\n')


def send(doc_id, md):
    # 网关的请求体上限 100 KB，最长那篇源稿 159 KB，所以一律压过再发。
    api('push', id=doc_id, gz=base64.b64encode(gzip.compress(md.encode(), 9)).decode())


def land(dropped=()):
    """编辑台上通过的投稿 → references/builds/<season>/<slug>.md。

    只写盘上还没有的那些：重跑一次不该把已经改过的源稿按投稿原文盖回去。

    **通过了删除申请的那几套要跳过。**一套配装是先投稿上站、后来才申请删除的，
    两条记录都标着 ok=1 且指着同一个 season/slug：sweep() 刚删掉，land() 转头
    又按那条投稿写回来，每跑一次 sync 都重演一遍，那一篇永远删不掉。
    """
    wrote = []
    for sub in api('list')['subs']:
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
        put(p, md)
        wrote.append('builds/%s/%s' % (season, slug))
    if wrote:
        print('落盘 %d 套配装：%s' % (len(wrote), '、'.join(wrote)))
    return wrote


def sweep():
    """编辑台上通过的删除申请 → 删掉那一篇源稿，再把库里那条一并清掉。

    与 land() 对称：**只删申请里点名的那一篇**。库里没了就删盘上的那条路不走——
    库里少一篇既可能是有人申请删除，也可能是手工清过或漏拉，分不出来就不该动盘上
    的东西（那一支照旧报进 stuck）。删除因此必须是一条走过审核、留了记录的申请。
    """
    gone = []
    for sub in api('list')['subs']:
        if int(sub.get('ok') or 0) != 1 or not sub.get('drop'):
            continue
        season, slug = sub.get('season'), sub.get('slug')
        if not season or not slug:
            print('  ? 删除申请 %s 没有 season/slug，跳过' % sub['_id'])
            continue
        doc_id = 'builds/%s/%s' % (season, slug)
        p = path_of(doc_id)
        if os.path.exists(p):
            os.remove(p)
        api('drop', id=doc_id)
        gone.append(doc_id)
    if gone:
        print('删掉 %d 套配装：%s' % (len(gone), '、'.join(gone)))
    return gone


def sync():
    # 先删后写：同一轮里既有删除申请又有新投稿时，两者互不干扰。删掉的那几篇
    # 要告诉 land()——它们在 subs 里还留着当初那条已通过的投稿，不挡住就会被
    # 原样写回来。
    land(dropped=set(sweep()))
    disk, db, base = on_disk(), in_db(), baseline()
    pushed, pulled, dropped, stuck = [], [], [], []

    for doc_id in sorted(set(disk) | set(db)):
        d = disk.get(doc_id)
        r = db.get(doc_id)
        b = base.get(doc_id)
        dh = sha1(d) if d is not None else None
        rh = sha1(r) if r is not None else None

        if dh == rh:
            continue
        if b is None:
            # 基线缺失有三种来路，只有一种真的分不出方向。
            if r is None:
                pushed.append(doc_id)   # 本地新加的一篇，库里没东西可丢
                send(doc_id, d)
            else:
                stuck.append(doc_id)    # 库里有、且与盘上不同，猜不得
            continue
        mine = dh != b
        theirs = rh != b
        if mine and theirs:
            stuck.append(doc_id)
        elif mine:
            if d is None:
                api('drop', id=doc_id)
                dropped.append(doc_id)
            else:
                send(doc_id, d)
                pushed.append(doc_id)
        else:
            if r is None:
                # 库里没了、盘上没动过：库那边不提供删除入口，所以这只可能是
                # 手工清过。不替人删盘上的源稿，报出来。
                stuck.append(doc_id)
            else:
                put(path_of(doc_id), r)
                pulled.append(doc_id)

    for name, ids in (('推上去', pushed), ('拉下来', pulled), ('库里删掉', dropped)):
        if ids:
            print('%s %d 篇：%s' % (name, len(ids), '、'.join(ids)))
    if not (pushed or pulled or dropped or stuck):
        print('两边一致，%d 篇' % len(disk))

    if stuck:
        # 撞车的那几篇把库里那份写在旁边，好逐字比对再定夺；references/ 整个
        # 走「全忽略 + 白名单」，.remote 不是 .md，不会入库。
        for doc_id in stuck:
            if doc_id in db:
                put(path_of(doc_id) + '.remote', db[doc_id])
        print('\n撞车 %d 篇，一个字没动：' % len(stuck))
        for doc_id in stuck:
            print('  %s' % doc_id + ('  库里那份写在 %s.md.remote' % doc_id if doc_id in db else ''))
        print('比过之后择一：')
        print('  python3 tools/sync.py --mine   ' + ' '.join(stuck))
        print('  python3 tools/sync.py --theirs ' + ' '.join(stuck))

    # 只把这一轮真对上的记进基线，撞车那几篇的基线不动——不然下一轮就分不出方向了。
    keep = dict(base)
    for doc_id in sorted(set(disk) | set(db)):
        if doc_id in stuck:
            continue
        if doc_id in disk:
            keep[doc_id] = sha1(disk[doc_id])
        else:
            keep.pop(doc_id, None)
    for doc_id in pulled:
        keep[doc_id] = sha1(db[doc_id])
    baseline(keep)
    return 1 if stuck else 0


def take(ids, mine):
    disk, db, base = on_disk(), in_db(), baseline()
    for doc_id in ids:
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
            put(path_of(doc_id), db[doc_id])
            base[doc_id] = sha1(db[doc_id])
        leftover = path_of(doc_id) + '.remote'
        if os.path.exists(leftover):
            os.remove(leftover)
        print('%s ← %s' % (doc_id, '盘上那份' if mine else '库里那份'))
    baseline(base)


def seed():
    disk = on_disk()
    for doc_id, md in sorted(disk.items()):
        send(doc_id, md)
    baseline({k: sha1(v) for k, v in disk.items()})
    print('灌了 %d 篇，基线重记' % len(disk))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--seed', action='store_true', help='盘整个覆盖库，并重记基线')
    ap.add_argument('--mine', nargs='+', metavar='_id', help='撞车了，这几篇以盘上的为准')
    ap.add_argument('--theirs', nargs='+', metavar='_id', help='撞车了，这几篇以库里的为准')
    a = ap.parse_args()
    if a.seed:
        seed()
    elif a.mine or a.theirs:
        take(a.mine or [], True)
        take(a.theirs or [], False)
    else:
        sys.exit(sync())


if __name__ == '__main__':
    main()
