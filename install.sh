#!/bin/bash
# 安装依赖并恢复 bun.lock（防止在 VM 中被意外修改）
set -e
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun install
if ! git diff --quiet -- bun.lock; then
  echo "bun.lock changed during VM install; restoring it to keep the checkout clean."
  git restore -- bun.lock
fi