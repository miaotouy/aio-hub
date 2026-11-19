#!/usr/bin/env bash
# Tauri 桌面端开发模式
set -e

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

# 引入 VM 共享目录同步逻辑
if [[ -f "scripts/vm-sync.sh" ]]; then
  source scripts/vm-sync.sh
fi

exec bun run dev -- "$@"
