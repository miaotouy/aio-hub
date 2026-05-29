#!/bin/bash
# 生成当前修改的 git diff 文件（对应 diff.bat）
set -e

# 获取当前日期时间（格式: YYYY-MM-DD_HH-MM-SS）
DATETIME=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="temp_gitdiff_${DATETIME}.txt"

# 将未跟踪的文件标记为已跟踪，以便 git diff 能捕获到它们
git add -N .
git diff HEAD --output "$FILENAME"

echo "已生成: $FILENAME"