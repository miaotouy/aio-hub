#!/bin/bash
# 运行项目全量检查（前端类型检查 + 后端 Clippy 检查）
set -e

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# 引入 VM 共享目录同步逻辑
if [ -f "scripts/vm-sync.sh" ]; then
  source scripts/vm-sync.sh
fi

bun run check