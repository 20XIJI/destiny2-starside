#!/bin/sh
# 一轮发版：对账 → 构建 → 回归 → 提交 → 部署 → 推送。任一步失败即停，不往下走。
# 用法：tools/ship.sh "提交信息"
# 工作区没有改动时不必给信息，直接走部署与推送。
set -e
cd "$(dirname "$0")/.."

python3 tools/sync.py
npm run build
npm test

if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$1" ]; then
    echo "工作区有改动，要一句提交信息：tools/ship.sh \"…\"" >&2
    exit 1
  fi
  git add -A
  git commit -q -m "$1"
fi

python3 tools/deploy.py
git push

# deploy.py 末尾会再对一次账，那一趟可能从库里拉回新的源稿。拉回来的东西没进
# 这次的 commit，也没上站，所以要说出来，不能让工作区悄悄脏着。
if [ -n "$(git status --porcelain)" ]; then
  echo "部署后对账拉回了改动，工作区不干净——再跑一次 tools/ship.sh 收掉" >&2
  exit 1
fi
