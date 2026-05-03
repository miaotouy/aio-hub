---
name: test-skill
description: 一个用于测试 AIO Skill 系统功能的演示技能。包含脚本执行、参考文档和资源文件操作示例。
metadata:
  version: "1.0.0"
  author: Kilo
  purpose: "smoke-test"
---

# Test Skill — AIO 技能系统冒烟测试

此技能用于验证 AIO 的 Skill 管理系统是否正常工作。

## 功能概述

1. **指令注入** — 激活后 LLM 可以看到这段 Markdown 指令
2. **脚本执行** — 支持通过标准 CLI 方式运行 `scripts/` 下的脚本
3. **文件读取** — 支持读取 `references/` 等目录下的参考文档
4. **目录浏览** — 支持浏览 Skill 内部资源结构

## 使用示例

本技能支持标准 CLI 调用方式。在 AIO 环境中，请使用 `skill:system` 工具来执行这些命令。

### 1. 运行测试脚本

```bash
npx test-skill hello.js --name 咕咕
```

### 2. 读取参考文档

```bash
cat test-skill/references/guide.md
```

### 3. 浏览目录结构

```bash
ls test-skill/assets
```

## 预期行为

| 操作               | 预期结果                                       |
|--------------------|-----------------------------------------------|
| 在列表中看到 test-skill | ✅ 显示名称 "test-skill" 和描述信息           |
| 激活技能           | ✅ 完整指令注入，状态改为已激活               |
| 执行 hello.js      | ✅ 返回 JSON，包含 "Hello, 咕咕!" 等信息       |
| 读取 guide.md      | ✅ 返回本技能的说明文档内容                   |
| 浏览 assets        | ✅ 列出 template.json                          |