#!/usr/bin/env python3
"""一轮发版：本地纠正 → 对账 → 构建 → 全量回归 → 提交 → 并行部署与推送。

用法：tools/ship.sh "提交信息"
工作区没有改动时不必给信息，直接走部署与推送。任一步失败即停并展开现场。
"""

from __future__ import annotations

import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDENT = " " * 16


def row(sym: str, stage: str, dt: float, summary: str) -> None:
    print("%s %-6s %4.1fs  %s" % (sym, stage, dt, summary), flush=True)


def detail(line: str) -> None:
    print("%s%s" % (INDENT, line), flush=True)


def run_cmd(cmd: list[str]) -> tuple[int, str, str, float]:
    t0 = time.perf_counter()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr, time.perf_counter() - t0


def fail(stage: str, dt: float, summary: str, out: str = "", err: str = "") -> int:
    row("✗", stage, dt, summary)
    if out.strip():
        print(out.rstrip(), file=sys.stderr)
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return 1


def git_out(*args: str) -> str:
    p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else ""


def main() -> int:
    t_total = time.perf_counter()
    msg = sys.argv[1] if len(sys.argv) > 1 else ""

    # 1. sync：先纠正源稿再三方对账
    t0 = time.perf_counter()
    c1, o1, e1, _ = run_cmd([sys.executable, "tools/build.py", "--normalize-only"])
    if c1 != 0:
        return fail("sync", time.perf_counter() - t0, "源稿纠正失败", o1, e1)
    c2, o2, e2, _ = run_cmd([sys.executable, "tools/sync.py"])
    dt_sync = time.perf_counter() - t0
    if c2 != 0:
        return fail("sync", dt_sync, "对账失败或存在冲突", o2, e2)
    sync_lines = [ln.strip() for ln in o2.splitlines() if ln.strip()]
    row("✓", "sync", dt_sync, sync_lines[-1] if sync_lines else "完成")
    for ln in sync_lines[:-1]:
        detail(ln)

    # 2. build
    c, out, err, dt = run_cmd([sys.executable, "tools/build.py"])
    if c != 0:
        return fail("build", dt, "构建失败", out, err)
    build_lines = [ln for ln in out.splitlines() if ln.strip()]
    summary_line = build_lines[-1] if build_lines else ""
    if summary_line.startswith(("✓ ", "· ")):
        print(summary_line, flush=True)
        for ln in build_lines[:-1]:
            if ln.lstrip().startswith("· "):
                detail(ln.strip())
    else:
        row("✓", "build", dt, summary_line or "完成")

    # 3. test（发版固定无缓存全量）
    c, out, err, dt = run_cmd([sys.executable, "tools/run_tests.py", "--all"])
    if c != 0:
        if out.strip():
            print(out.rstrip(), flush=True)
        if err.strip():
            print(err.rstrip(), file=sys.stderr)
        return c
    if out.strip():
        print(out.rstrip(), flush=True)

    # 4. commit
    t0 = time.perf_counter()
    if git_out("status", "--porcelain"):
        if not msg:
            return fail(
                "commit",
                time.perf_counter() - t0,
                '工作区有改动，需要提交信息：tools/ship.sh "…"',
            )
        c1, o1, e1, _ = run_cmd(["git", "add", "-A"])
        if c1 != 0:
            return fail("commit", time.perf_counter() - t0, "git add 失败", o1, e1)
        c2, o2, e2, _ = run_cmd(["git", "commit", "-q", "-m", msg])
        dt_c = time.perf_counter() - t0
        if c2 != 0:
            return fail("commit", dt_c, "git commit 失败", o2, e2)
        row("✓", "commit", dt_c, git_out("rev-parse", "--short", "HEAD"))
    else:
        row("·", "commit", time.perf_counter() - t0, "无改动")

    # 5. 并行 deploy + push（各自缓冲，按固定顺序输出，零交错）
    prev_deploy = git_out("rev-parse", "--verify", "refs/deploy")
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_dep = pool.submit(run_cmd, [sys.executable, "tools/deploy.py", "--no-sync"])
        f_push = pool.submit(run_cmd, ["git", "push", "--porcelain"])
        dc, dout, derr, ddt = f_dep.result()
        pc, pout, perr, pdt = f_push.result()

    if dc != 0:
        return fail("deploy", ddt, "部署失败", dout, derr)
    dep_items = [ln.strip() for ln in dout.splitlines() if re.match(r"^\s+[+-]\s+", ln)]
    ref_m = re.search(r"refs/deploy = ([0-9a-f]+)", dout)
    if dep_items:
        ref_tail = " → %s" % ref_m.group(1) if ref_m else ""
        row("✓", "deploy", ddt, "增量 %d 个文件%s" % (len(dep_items), ref_tail))
        for item in dep_items:
            detail(item)
    else:
        row("·", "deploy", ddt, "无静态文件变更")

    if pc != 0:
        return fail("push", pdt, "推送失败", pout, perr)
    push_lines = [
        ln.strip()
        for ln in pout.splitlines()
        if ln.strip() and not ln.startswith(("To ", "Done"))
    ]
    if any("[up to date]" in ln for ln in push_lines):
        row("·", "push", pdt, "已是最新")
    else:
        brief = push_lines[0].split("\t")[-1] if push_lines else "main -> origin/main"
        row("✓", "push", pdt, brief)

    if prev_deploy and git_out(
        "diff", "--name-only", "%s..HEAD" % prev_deploy, "--", "functions/api/"
    ):
        print(
            "! %-6s         functions/api/ 有改动，按需执行：tcb fn deploy api --force"
            % "api",
            flush=True,
        )

    print("─" * 58, flush=True)
    row("─", "ship", time.perf_counter() - t_total, "完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
