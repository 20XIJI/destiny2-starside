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
                with open(p, encoding='utf-8') as f:
                    out[id_of(p)] = f.read()
    for name in ('artifact-mods.md', 'armor-sets.md'):
        p = os.path.join(REFS, name)
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                out[id_of(p)] = f.read()
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


def land(subs, dropped=()):
    """编辑台上通过的投稿 → references/builds/<season>/<slug>.md。

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
        put(p, md)
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
    disk, db = on_disk(), in_db()
    pushed, pulled, dropped, stuck = [], [], [], list(conflicts)

    for doc_id in sorted(set(disk) | set(db)):
        if doc_id in conflicts:
            continue
        d = disk.get(doc_id)
        r = db.get(doc_id)
        b = base.get(doc_id)
        dh = sha1(d) if d is not None else None
        rh = sha1(r) if r is not None else None
        completed = ''

        if dh == rh:
            pass
        elif b is None:
            if r is None:
                send(doc_id, d)
                pushed.append(doc_id)   # 本地新加的一篇，库里没东西可丢
                completed = '已推送'
            else:
                stuck.append(doc_id)    # 库里有、且与盘上不同，猜不得
                continue
        elif dh != b and rh != b:
            stuck.append(doc_id)
            continue
        elif dh != b:
            if d is None:
                api('drop', id=doc_id)
                dropped.append(doc_id)
                completed = '已删除库稿'
            else:
                send(doc_id, d)
                pushed.append(doc_id)
                completed = '已推送'
        elif r is None:
            # 缺少删除意图时不以库里缺稿为由删本地。
            stuck.append(doc_id)
            continue
        else:
            put(path_of(doc_id), r)
            pulled.append(doc_id)
            dh = sha1(r)
            completed = '已拉取'
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

    if stuck:
        # 撞车的那几篇把库里那份写在旁边，好逐字比对再定夺；references/ 整个
        # 走「全忽略 + 白名单」，.remote 不是 .md，不会入库。
        for doc_id in stuck:
            if doc_id in db:
                put(path_of(doc_id) + '.remote', db[doc_id])
        print('\n冲突 %d 篇：这些源稿未改动；其他已完成项见上方回执' % len(stuck))
        for doc_id in stuck:
            print('  %s' % doc_id + ('  库里那份写在 %s.md.remote' % doc_id if doc_id in db else ''))
        print('比过之后择一：')
        print('  python3 tools/sync.py --mine   ' + ' '.join(stuck))
        print('  python3 tools/sync.py --theirs ' + ' '.join(stuck))

    # 删除在 sweep 中显式清除基线，冲突目标始终保留原值。
    baseline(base)
    return 1 if stuck else 0


def take(ids, mine):
    disk, db, base = on_disk(), in_db(), baseline()
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
            put(path_of(doc_id), db[doc_id])
            base[doc_id] = sha1(db[doc_id])
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
    baseline({k: sha1(v) for k, v in disk.items()})
    print('灌了 %d 篇，基线重记' % len(disk))


def main():
    ap = argparse.ArgumentParser(description=__doc__, allow_abbrev=False,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--seed', action='store_true', help='盘整个覆盖库，并重记基线')
    ap.add_argument('--mine', nargs='+', metavar='_id', help='撞车了，这几篇以盘上的为准')
    ap.add_argument('--theirs', nargs='+', metavar='_id', help='撞车了，这几篇以库里的为准')
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
