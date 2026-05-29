#!/bin/bash
# Tauri 桌面端构建
set -e
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun run tauri:build