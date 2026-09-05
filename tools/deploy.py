#!/usr/bin/env python3
"""增量部署：只发自上次部署以来改过的文件。

站上 3958 个文件里 3735 个是图标，文件名即内容哈希、改内容必然换名，所以
每次整目录重发是把不会变的那 3735 个又传一遍。改动清单由 git 现算：上次发到
哪个 commit 记在 .git 的 refs/deploy 上，与 HEAD 一 diff 即得。

    python3 tools/deploy.py            # 发改动
    python3 tools/deploy.py --dry-run  # 只列要发什么
    python3 tools/deploy.py --all      # 整站重发，首次部署或对不上账时用
    python3 tools/deploy.py --all --prune  # 整站重发，并删掉远端多出来的文件
"""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = "refs/deploy"
CLOUD = "destiny2-starside"  # 静态托管上的挂载路径，与 tcb app deploy 的 --deploy-path 相同
SKIP_DIRS = ("tools/", "references/", "functions/", ".github/", ".claude/")
SKIP_FILES = {"package.json", "cloudbaserc.json", "serve.json", ".gitignore", ".env.example", "LICENSE"}


def keep(path: str) -> bool:
    return not (path.startswith(SKIP_DIRS) or path.endswith(".md") or path in SKIP_FILES)


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if r.returncode:
        sys.exit(f"git {' '.join(args)} 失败：{r.stderr.strip()}")
    return r.stdout


def listing(out: str) -> list[str]:
    return [p for p in out.split("\0") if p and keep(p)]


def tcb(*args: str, env: str, confirm: bool = False) -> None:
    # --prune 会弹一句 y/N。脚本这一侧替你按 y——闸门是命令行上那个显式的 --prune，
    # 不是这一问；stdin 交给 tcb 时它在非交互场景下读到 EOF 当 N，静默不清理。
    r = subprocess.run(["tcb", *args, "-e", env], cwd=ROOT, input="y\n" if confirm else None, text=True)
    if r.returncode:
        sys.exit("tcb 失败，refs/deploy 不动，改完重跑即可")


def check() -> None:
    assert keep("armor-mods/icons/0a1b2c3d4e.webp")
    assert keep("index.html") and keep("assets/search.js")
    assert keep("admin/index.html") and keep("admin/terms.js")
    assert not keep("tools/deploy.py")
    assert not keep("references/docs/changelog.md")
    assert not keep("CLAUDE.md") and not keep("cloudbaserc.json")
    assert listing("a.md\0index.html\0") == ["index.html"]
    print("ok")


def unchanged(target: str) -> None:
    if git("rev-parse", "HEAD").strip() != target or git("status", "--porcelain").strip():
        sys.exit("部署准备期间 HEAD 或工作区变了，未继续部署，refs/deploy 不变")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--all", action="store_true", help="整站重发")
    parser.add_argument("--dry-run", action="store_true", help="只列清单，不同步或发送")
    parser.add_argument("--prune", action="store_true", help="配合 --all 删除远端额外文件")
    parser.add_argument("--check", action="store_true", help="仅检查部署文件筛选规则")
    args = parser.parse_args()
    full, dry, prune = args.all, args.dry_run, args.prune
    if prune and not full:
        parser.error("--prune 只跟 --all 一起用：增量那份清单不是完整的一版，会把没改的文件全删了")
    if args.check and (full or dry or prune):
        parser.error("--check 不能与发布选项同时使用")
    if args.check:
        return check()
    env = json.loads((ROOT / "cloudbaserc.json").read_text())["envId"]
    print(f"模式：{'全量' if full else '增量'}；环境：{env}；挂载：{CLOUD}；"
          f"预演：{'是' if dry else '否'}；prune：{'开启' if prune else '关闭'}")
    if full and prune and dry:
        print("远端额外文件将在实际部署时由 tcb 删除；本次预演未查询远端，不提供待删清单")

    if not dry and git("status", "--porcelain").strip():
        sys.exit("工作区不干净：先 npm run build 再 commit，然后部署")

    base = subprocess.run(["git", "rev-parse", "--verify", REF], cwd=ROOT, text=True, capture_output=True).stdout.strip()
    if not full and not base:
        sys.exit("没有上次部署的记录，先跑一次：python3 tools/deploy.py --all")
    if not dry:
        # 即使没有静态文件差异也要对账；失败或落盘改稿都不能继续发布旧产出。
        result = subprocess.run([sys.executable, "tools/sync.py"], cwd=ROOT)
        if result.returncode:
            sys.exit("同步失败，未部署，refs/deploy 不变；同步可能已有部分完成，见上方回执")
        if git("status", "--porcelain").strip():
            sys.exit("同步改动了源稿：先 npm run build 再 commit，然后部署")
    target = git("rev-parse", "HEAD").strip()
    if full:
        files, gone = listing(git("ls-files", "-z")), []
    else:
        # **--no-renames**：站上一堆同构的页面，git 很容易把「删掉一套配装」与
        # 「新收一套配装」按内容相似度配成一次改名（实测 51% 就配上了）。配成
        # 改名之后旧路径既不在 files 也不在 gone 里，远端于是一直挂着那个已经
        # 删掉的页面。
        files = listing(git("diff", "--no-renames", "--name-only", "-z",
                            "--diff-filter=d", base, target))
        gone = listing(git("diff", "--no-renames", "--name-only", "-z",
                           "--diff-filter=D", base, target))

    print(f"发 {len(files)} 个文件" + (f"，删 {len(gone)} 个" if gone else ""))
    for p in files + gone:
        print(("  - " if p in gone else "  + ") + p)
    if dry:
        return

    if not files and not gone:
        return

    unchanged(target)
    if files:
        stage = pathlib.Path(tempfile.mkdtemp(prefix="starside-deploy-"))
        try:
            for p in files:
                dst = stage / p
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / p, dst)
            extra = ["--prune", "--safe"] if prune else []
            unchanged(target)
            tcb("hosting", "deploy", str(stage), CLOUD, *extra, env=env, confirm=prune)
        finally:
            shutil.rmtree(stage, ignore_errors=True)
    for p in gone:
        unchanged(target)
        tcb("hosting", "delete", f"{CLOUD}/{p}", env=env)

    git("update-ref", REF, target)
    print(f"已记下 refs/deploy = {target[:7]}")


if __name__ == "__main__":
    main()
