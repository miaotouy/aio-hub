#!/bin/bash
# Tauri 桌面端开发模式
set -e
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun run tauri:dev