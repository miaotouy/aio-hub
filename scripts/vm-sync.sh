#!/bin/bash
# VM 共享目录检测与同步公共脚本
# 必须通过 source scripts/vm-sync.sh 调用以改变当前 shell 的工作目录

CURRENT_DIR=$(pwd)

# 仅在 VMware 共享目录下运行才触发同步
if [[ "$CURRENT_DIR" == /mnt/hgfs/* ]]; then
  # 尝试加载本地环境变量
  if [ -f ".env.local" ]; then
    source .env.local
  elif [ -f ".env" ]; then
    source .env
  fi

  # 配置默认值（优先使用环境变量，其次回退到默认值）
  VM_REPO="${AIO_VM_REPO:-/home/mty/aio-hub-Ubuntu}"
  
  # 自动获取当前分支，若获取失败则回退
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  VM_BRANCH="${AIO_VM_BRANCH:-${CURRENT_BRANCH:-codex/aio-hub-ubuntu}}"

  echo "⚠️ 检测到您在 VMware 共享目录下运行 ($CURRENT_DIR)"
  echo "🔄 正在自动切换到 VM 原生目录 ($VM_REPO) 并同步代码 (分支: $VM_BRANCH)..."
  
  # 确保原生目录存在
  if [ ! -d "$VM_REPO" ]; then
    echo "📁 原生目录不存在，正在从共享目录克隆..."
    git config --global --add safe.directory "$CURRENT_DIR" || true
    git clone "$CURRENT_DIR" "$VM_REPO"
  fi
  
  # 同步代码
  git -C "$VM_REPO" fetch origin
  git -C "$VM_REPO" checkout "$VM_BRANCH" || git -C "$VM_REPO" checkout -b "$VM_BRANCH"
  git -C "$VM_REPO" pull origin "$VM_BRANCH" --ff-only || true
  
  cd "$VM_REPO"
  echo "✅ 已切换到原生目录，继续执行后续操作..."
fi