#!/usr/bin/env python3
"""增量部署：只发自上次部署以来改过的文件。

站上 3958 个文件里 3735 个是图标，文件名即内容哈希、改内容必然换名，所以
每次整目录重发是把不会变的那 3735 个又传一遍。改动清单由 git 现算：上次发到
哪个 commit 记在 .git 的 refs/deploy 上，与 HEAD 一 diff 即得。

    python3 tools/deploy.py            # 发改动
    python3 tools/deploy.py --dry-run  # 只列要发什么
    python3 tools/deploy.py --all      # 整站重发，首次部署或对不上账时用
"""

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


def tcb(*args: str, env: str) -> None:
    if subprocess.run(["tcb", *args, "-e", env], cwd=ROOT).returncode:
        sys.exit("tcb 失败，refs/deploy 不动，改完重跑即可")


def check() -> None:
    assert keep("armor-mods/icons/0a1b2c3d4e.webp")
    assert keep("index.html") and keep("assets/search.js")
    assert not keep("tools/deploy.py")
    assert not keep("references/docs/changelog.md")
    assert not keep("CLAUDE.md") and not keep("cloudbaserc.json")
    assert listing("a.md\0index.html\0") == ["index.html"]
    print("ok")


def main() -> None:
    if "--check" in sys.argv:
        return check()
    env = json.loads((ROOT / "cloudbaserc.json").read_text())["envId"]
    full = "--all" in sys.argv
    dry = "--dry-run" in sys.argv

    if not dry and git("status", "--porcelain").strip():
        sys.exit("工作区不干净：先按审核台那枚「构建并提交」，再部署")

    base = subprocess.run(["git", "rev-parse", "--verify", REF], cwd=ROOT, text=True, capture_output=True).stdout.strip()
    if full:
        files, gone = listing(git("ls-files", "-z")), []
    elif base:
        files = listing(git("diff", "--name-only", "-z", "--diff-filter=d", base, "HEAD"))
        gone = listing(git("diff", "--name-only", "-z", "--diff-filter=D", base, "HEAD"))
    else:
        sys.exit("没有上次部署的记录，先跑一次：python3 tools/deploy.py --all")

    print(f"发 {len(files)} 个文件" + (f"，删 {len(gone)} 个" if gone else ""))
    for p in files + gone:
        print(("  - " if p in gone else "  + ") + p)
    if dry:
        return
    if not files and not gone:
        return

    if files:
        stage = pathlib.Path(tempfile.mkdtemp(prefix="starside-deploy-"))
        try:
            for p in files:
                dst = stage / p
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / p, dst)
            tcb("hosting", "deploy", str(stage), CLOUD, env=env)
        finally:
            shutil.rmtree(stage, ignore_errors=True)
    for p in gone:
        tcb("hosting", "delete", f"{CLOUD}/{p}", env=env)

    git("update-ref", REF, "HEAD")
    print(f"已记下 refs/deploy = {git('rev-parse', '--short', 'HEAD').strip()}")


if __name__ == "__main__":
    main()
