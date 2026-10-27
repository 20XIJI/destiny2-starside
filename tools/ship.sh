#!/bin/sh
# 一轮发版：本地纠正 → 对账 → 构建 → 回归 → 提交 → 部署 → 推送。任一步失败即停，不往下走。
# 用法：tools/ship.sh "提交信息"
# 工作区没有改动时不必给信息，直接走部署与推送。
set -e
cd "$(dirname "$0")/.."

t=$(date +%s)
python3 tools/build.py --normalize-only
python3 tools/sync.py
echo "sync $(($(date +%s) - t))s"

t=$(date +%s)
npm run build
echo "build $(($(date +%s) - t))s"

t=$(date +%s)
npm test
echo "test $(($(date +%s) - t))s"

t=$(date +%s)
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$1" ]; then
    echo "工作区有改动，要一句提交信息：tools/ship.sh \"…\"" >&2
    exit 1
  fi
  git add -A
  git commit -q -m "$1"
fi
echo "commit $(($(date +%s) - t))s"

t=$(date +%s)
python3 tools/deploy.py --no-sync
echo "deploy $(($(date +%s) - t))s"

t=$(date +%s)
git push
echo "push $(($(date +%s) - t))s"
