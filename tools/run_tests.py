#!/usr/bin/env python3
"""并行运行 Python 与 Node 离线回归测试。

用法：
  python3 tools/run_tests.py          # 日常增量（常跑层全跑，未变动语料校验跳过）
  python3 tools/run_tests.py --all    # 强制无缓存全量（发版使用）
"""

from __future__ import annotations

import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _run(label: str, cmd: list[str]) -> tuple[str, int, str, str, float]:
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return label, proc.returncode, proc.stdout, proc.stderr, time.perf_counter() - t0


def main() -> int:
    t0 = time.perf_counter()
    py_args = [a for a in sys.argv[1:] if a != "--"]
    tasks = [
        ("python", [sys.executable, "tools/check_quality.py", *py_args]),
        ("node", ["node", "tools/check_quality.cjs"]),
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda item: _run(*item), tasks))

    rc = 0
    for label, code, out, err, dt in results:
        if out.strip():
            print(out.rstrip(), flush=True)
        if err.strip():
            print(err.rstrip(), file=sys.stderr, flush=True)
        print("  %s  %.2fs%s" % (label, dt, "" if code == 0 else "  FAIL"), flush=True)
        if code != 0:
            rc = code
    print("test  %.2fs" % (time.perf_counter() - t0), flush=True)
    return rc


if __name__ == "__main__":
    sys.exit(main())
