#!/bin/sh
# 一轮发版：本地纠正 → 对账 → 构建 → 回归 → 提交 → 并行部署与推送。
# 用法：tools/ship.sh "提交信息"
exec python3 "$(dirname "$0")/ship.py" "$@"
