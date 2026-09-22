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
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
REF = "refs/deploy"
CLOUD = "destiny2-starside"  # 静态托管上的挂载路径，与 tcb app deploy 的 --deploy-path 相同
# 只发 site/ 下的文件，上传时去掉这一层：仓库里的 site/index.html 在站上是
# destiny2-starside/index.html。源稿、工具、data/ 与云函数都在 site/ 之外。
PREFIX = "site/"


def keep(path: str) -> bool:
    """git 给的仓库相对路径发不发。"""
    return path.startswith(PREFIX)


# 字符串字面量里的 /* 与 */。剥注释前先拿它探一遍：命中就整个文件原样发。
RISK = re.compile(r"""(['"])(?:\\.|(?!\1)[^\\\n])*\1""")
BLOCK = re.compile(r"/\*.*?\*/", re.S)


def uncomment(text: str) -> str:
    """块注释换成等量换行：读者不必下设计依据，行号仍与源稿对得上。

    只动 /* */，不碰 //——app.js 里有 'http://www.w3.org/2000/svg'，按 // 剥会剥坏它。
    换行不删，是为了让 devtools 报的位置照旧落在源稿的同一行上；比删干净只多付
    788 字节 gzip。
    """
    return BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def strippable(text: str) -> bool:
    """字符串字面量里冒出 /* 或 */ 就不许剥。

    search.js 与 desc.js 是从源稿生成的，正文里写一句「伤害 100/*不含*加成」，
    那对括号就进了数据字符串。正则会从那里一路吃到下一个 */，而吃完往往仍是合法
    JS（{"x":"a/*b"},{"x":"c*/d"} → {"x":"ad"}），语法闸门查不出来，页面也看不出来，
    只是搜不到东西。所以判据下在剥之前，且**跳过该文件、不中止部署**——剥注释是
    优化，不该有能力挡住发版。
    """
    return not any("/*" in m.group(0) or "*/" in m.group(0) for m in RISK.finditer(text))


def dedent(text: str) -> str:
    """每行去掉行首缩进与行尾空白，换行一个不删：行号仍与源稿对得上，列号左移缩进那么多。

    只认空格与制表符。NBSP 在 CSS 里是标识符字符、不是空白，不带参数的 str.strip()
    会连它一起剥掉，改掉以 NBSP 开头的标识符。行内的空格一个不动：`a :hover` 与
    `a:hover` 选中的不是同一批元素，calc() 的加减号两边必须有空格。
    """
    return "\n".join(line.strip(" \t") for line in text.split("\n"))


def dedentable(rel: str, text: str) -> bool:
    """行首空白是内容的文件不许去缩进。text 是剥完块注释的那一份。

    行首空白只在跨行的字面量里算内容，跨行只有两条路：JS 的模板字符串（反引号），
    与行尾反斜杠续行的字符串（CSS 与 JS 都有）。前者按整个 .js 文件里有没有反引号判，
    后者按去掉行尾空白后是不是以反斜杠结尾判：行尾是「反斜杠 + 空格」的，空格剥掉后
    反斜杠就转义了换行，同样不许。判得宽：// 注释与字符串里的反引号也算，这类文件
    只剥注释、照旧发。
    """
    if rel.endswith(".js") and "`" in text:
        return False
    return not any(line.rstrip(" \t").endswith("\\") for line in text.split("\n"))


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if r.returncode:
        sys.exit(f"git {' '.join(args)} 失败：{r.stderr.strip()}")
    return r.stdout


def listing(out: str) -> list[str]:
    """git 的 -z 输出 → 要发的文件，相对站点根（即站上的路径）。"""
    return [p[len(PREFIX):] for p in out.split("\0") if p and keep(p)]


def tcb(*args: str, env: str, confirm: bool = False) -> None:
    # --prune 会弹一句 y/N。脚本这一侧替你按 y——闸门是命令行上那个显式的 --prune，
    # 不是这一问；stdin 交给 tcb 时它在非交互场景下读到 EOF 当 N，静默不清理。
    r = subprocess.run(["tcb", *args, "-e", env], cwd=ROOT, input="y\n" if confirm else None, text=True)
    if r.returncode:
        sys.exit("tcb 失败，refs/deploy 不动，改完重跑即可")


def stage_one(rel: str, dst: pathlib.Path) -> None:
    """把一个文件放进暂存目录。CSS 与 JS 顺手剥掉块注释与缩进，别的原样复制。

    site.css 有 38% 的字符在 /* */ 里，app.js 也差不多，而 .css/.js 的浏览器缓存
    只有 5 分钟，站上也不压缩——那些设计依据与缩进每次访问都按原始字节重发一遍。
    源稿一个字不动，剥只发生在这里，本地 npm start 服务的仍是带注释的那一份。

    改过的 .js 落盘后过一遍 node --check，不过就中止部署并报出文件名。跳不跳过由
    strippable() 与 dedentable() 在动手之前判定；动手之后语法坏了，说明剥的规则
    本身有漏洞，原样发出去会把这个漏洞藏起来。
    """
    if not rel.endswith((".css", ".js")):
        shutil.copy2(SITE / rel, dst)
        return
    text = (SITE / rel).read_text(encoding="utf-8")
    if not strippable(text):
        print(f"  ! {rel} 的字符串里有 /* 或 */，原样发")
        shutil.copy2(SITE / rel, dst)
        return
    out = uncomment(text)
    if dedentable(rel, out):
        out = dedent(out)
    else:
        print(f"  ! {rel} 有反引号或行尾反斜杠，只剥注释、不去缩进")
    dst.write_text(out, encoding="utf-8")
    if rel.endswith(".js") and out != text:
        r = subprocess.run(["node", "--check", str(dst)], cwd=ROOT, text=True, capture_output=True)
        if r.returncode:
            sys.exit(f"{rel} 剥完注释与缩进后 node --check 不过，未部署，refs/deploy 不变：\n"
                     f"{r.stderr.strip()}")


def plan(full: bool, base: str, target: str) -> "tuple[list[str], list[str]]":
    """这次要发哪些文件、删哪些文件。只问 git，不碰远端，也不写任何东西。

    从 main() 里分出来，是因为「这次要发什么」本来只有一条路问得到：跑 --dry-run
    读它打印的那几行，或者在测试里把整个进程形状复原一遍（工作区状态、HEAD、
    子进程，按调用顺序排好）。它是纯的，就该单独问得到。

    **--no-renames**：站上一堆同构的页面，git 很容易把「删掉一套配装」与
    「新收一套配装」按内容相似度配成一次改名（实测 51% 就配上了）。配成改名
    之后旧路径既不在 files 也不在 gone 里，远端于是一直挂着那个已经删掉的页面。
    """
    if full:
        return listing(git("ls-files", "-z")), []
    files = listing(git("diff", "--no-renames", "--name-only", "-z",
                        "--diff-filter=d", base, target))
    gone = listing(git("diff", "--no-renames", "--name-only", "-z",
                       "--diff-filter=D", base, target))
    return files, gone


def unchanged(target: str) -> None:
    if git("rev-parse", "HEAD").strip() != target or git("status", "--porcelain").strip():
        sys.exit("部署准备期间 HEAD 或工作区变了，未继续部署，refs/deploy 不变")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--all", action="store_true", help="整站重发")
    parser.add_argument("--dry-run", action="store_true", help="只列清单，不同步或发送")
    parser.add_argument("--prune", action="store_true", help="配合 --all 删除远端额外文件")
    args = parser.parse_args()
    full, dry, prune = args.all, args.dry_run, args.prune
    if prune and not full:
        parser.error("--prune 只跟 --all 一起用：增量那份清单不是完整的一版，会把没改的文件全删了")
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
    files, gone = plan(full, base, target)

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
                stage_one(p, dst)
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
