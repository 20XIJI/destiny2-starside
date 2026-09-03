#!/usr/bin/env python3
"""源稿在库与仓库之间对账。

库（CloudBase 的 docs 集合）是在线编辑台的工作副本，git 是发布本。两边没有合并
逻辑，只有覆盖，判据是内容 hash：

    --pull   库 → 盘。编辑台上通过的改动落到 references/ 下，跟着跑 npm run build。
    --push   盘 → 库。部署成功后自动跑一次，把本地修的闸门错误送回库里。

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
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shell

ROOT = shell.ROOT
REFS = os.path.join(ROOT, 'references')


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


def put(path, md):
    """CRLF→LF，补上末尾换行。与旧审核台的 put() 同一条规矩。"""
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(md.replace('\r\n', '\n').rstrip('\n') + '\n')


def pull():
    disk = on_disk()
    got = {d['_id']: d for d in api('pull')['docs']}
    wrote = []
    for doc_id, row in sorted(got.items()):
        md = row.get('md') or ''
        if doc_id not in disk:
            # 库里有、盘上没有：多半是本地删了那一篇。不凭空造回来，报出来由人定。
            print('  ? %s 只在库里，盘上没有，跳过' % doc_id)
            continue
        if sha1(md) == sha1(disk[doc_id]):
            continue
        put(path_of(doc_id), md)
        wrote.append(doc_id)
    for doc_id in sorted(set(disk) - set(got)):
        print('  ? %s 只在盘上，库里没有，跑 --push 灌进去' % doc_id)
    print('拉下来 %d 篇' % len(wrote) + ('：' + '、'.join(wrote) if wrote else ''))
    return wrote


def push(force=False):
    disk = on_disk()
    got = {} if force else {d['_id']: d.get('hash') for d in api('pull')['docs']}
    sent = []
    for doc_id, md in sorted(disk.items()):
        if not force and got.get(doc_id) == sha1(md):
            continue
        # 网关的请求体上限 100 KB，最长那篇源稿 159 KB，所以一律压过再发。
        api('push', id=doc_id, gz=base64.b64encode(gzip.compress(md.encode(), 9)).decode())
        sent.append(doc_id)
    print('推上去 %d 篇' % len(sent) + ('：' + '、'.join(sent) if sent else ''))
    return sent


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pull', action='store_true', help='库 → 盘')
    ap.add_argument('--push', action='store_true', help='盘 → 库')
    ap.add_argument('--all', action='store_true', help='配合 --push：不比 hash，整库重灌')
    a = ap.parse_args()
    if a.pull == a.push:
        ap.error('--pull 与 --push 二选一')
    if a.pull:
        pull()
    else:
        push(a.all)


if __name__ == '__main__':
    main()
