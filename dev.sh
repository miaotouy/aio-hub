#!/bin/bash
# Tauri 桌面端开发模式
set -e

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# 引入 VM 共享目录同步逻辑
if [ -f "scripts/vm-sync.sh" ]; then
  source scripts/vm-sync.sh
fi

bun run tauri:dev