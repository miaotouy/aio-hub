#!/bin/bash
# 运行项目全量检查（前端类型检查 + 后端 Clippy 检查）
set -e
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun run check