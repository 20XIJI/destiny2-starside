#!/usr/bin/env python3
"""资料页、装备库、首页、搜索、词表与三道闸门。能并行的步骤并行。"""
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

WAVES = (
    (('tools/items.py', '--normalize'),),
    (('tools/convert-artifact-mods.py',),
     ('tools/convert-armor-sets.py',),
     ('tools/convert-doc.py',)),
    (('tools/convert-build.py',),),
    (('tools/build-weapons.py',),),
    (('tools/build-home.py',),),
    (('tools/build-search.py',),),
    (('tools/build-terms.py',),),
    (('tools/check_shell.py',),
     ('tools/check_terms.py',),
     ('tools/check_type.py',)),
)


def run_one(script, *args):
    t0 = time.perf_counter()
    code = subprocess.run([sys.executable, script, *args], cwd=ROOT).returncode
    print('  %s  %.1fs' % (script, time.perf_counter() - t0), flush=True)
    return code


def run_wave(jobs):
    if len(jobs) == 1:
        return run_one(*jobs[0])
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = [pool.submit(run_one, *job) for job in jobs]
        codes = [f.result() for f in futs]
    for code in codes:
        if code:
            return code
    return 0


def main():
    t0 = time.perf_counter()
    for jobs in WAVES:
        code = run_wave(jobs)
        if code:
            return code
    print('build  %.1fs' % (time.perf_counter() - t0), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
