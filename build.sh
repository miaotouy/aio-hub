#!/bin/bash
# Tauri 桌面端构建
set -e

export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
CURRENT_DIR=$(pwd)
VM_REPO="/home/mty/aio-hub-Ubuntu"

# 智能检测：如果在共享目录下运行，自动重定向到 VM 原生目录并同步代码
if [[ "$CURRENT_DIR" == /mnt/hgfs/* ]]; then
  echo "⚠️ 检测到您在 VMware 共享目录下运行 ($CURRENT_DIR)"
  echo "🔄 正在自动切换到 VM 原生目录 ($VM_REPO) 并同步代码..."
  
  # 确保原生目录存在
  if [ ! -d "$VM_REPO" ]; then
    echo "📁 原生目录不存在，正在从共享目录克隆..."
    git config --global --add safe.directory "$CURRENT_DIR" || true
    git clone "$CURRENT_DIR" "$VM_REPO"
  fi
  
  # 同步代码
  git -C "$VM_REPO" fetch origin
  git -C "$VM_REPO" checkout codex/aio-hub-ubuntu || git -C "$VM_REPO" checkout -b codex/aio-hub-ubuntu
  git -C "$VM_REPO" pull origin codex/aio-hub-ubuntu --ff-only || true
  
  cd "$VM_REPO"
  echo "✅ 已切换到原生目录，开始执行 build..."
fi

bun run tauri:build