#!/usr/bin/env python3
"""并行运行 Python 与 Node 离线回归测试，统一输出单行摘要，失败时完整展开日志。

用法：
  python3 tools/run_tests.py          # 日常增量（常跑层全跑，未变动语料校验跳过）
  python3 tools/run_tests.py --all    # 强制无缓存全量（发版使用）
"""

from __future__ import annotations

import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_PY_RAN = re.compile(r"Ran (\d+) tests?")
_PY_SKIP = re.compile(r"skip\s+(\d+)\s+corpus")
_NODE_PASS = re.compile(r"(\d+/\d+)\s+quality regressions passed")


def _run(label: str, cmd: list[str]) -> tuple[str, int, str, str, float]:
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return label, proc.returncode, proc.stdout, proc.stderr, time.perf_counter() - t0


def _py_summary(code: int, out: str, err: str) -> str:
    text = out + "\n" + err
    ran = _PY_RAN.search(text)
    n = ran.group(1) if ran else "?"
    skip = _PY_SKIP.search(text)
    if code != 0:
        return "python FAIL"
    if skip:
        return "python %s/%s（跳过 %s 组语料）" % (n, n, skip.group(1))
    return "python %s/%s" % (n, n)


def _node_summary(code: int, out: str, err: str) -> str:
    if code != 0:
        return "node FAIL"
    m = _NODE_PASS.search(out + "\n" + err)
    return "node %s" % (m.group(1) if m else "OK")


def main() -> int:
    t0 = time.perf_counter()
    py_args = [a for a in sys.argv[1:] if a != "--"]
    full = "--all" in py_args or "--force" in py_args
    tasks = [
        ("python", [sys.executable, "tools/check_quality.py", *py_args]),
        ("node", ["node", "tools/check_quality.cjs"]),
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = dict((r[0], r) for r in pool.map(lambda item: _run(*item), tasks))

    _, py_code, py_out, py_err, _ = results["python"]
    _, nd_code, nd_out, nd_err, _ = results["node"]
    dt = time.perf_counter() - t0
    ok = py_code == 0 and nd_code == 0
    mode = "（全量）" if full and ok else ""
    summary = "%s · %s%s" % (
        _py_summary(py_code, py_out, py_err),
        _node_summary(nd_code, nd_out, nd_err),
        mode,
    )
    print("%s %-6s %4.1fs  %s" % ("✓" if ok else "✗", "test", dt, summary), flush=True)

    if not ok:
        for label, code, out, err, _ in (results["python"], results["node"]):
            if code != 0:
                print("\n── %s 失败现场 ──" % label, file=sys.stderr)
                if out.strip():
                    print(out.rstrip(), file=sys.stderr)
                if err.strip():
                    print(err.rstrip(), file=sys.stderr)
        return py_code or nd_code
    return 0


if __name__ == "__main__":
    sys.exit(main())
