# 贡献指南

本指南记录 AIO Hub 的通用开发与提交约定。脚本、依赖和版本以仓库当前文件为准。

## 1. 开始之前

- 包管理器使用 Bun。安装依赖前先确认根目录或对应 workspace 的 `package.json`。
- 修改前阅读目标代码、相邻实现和相关架构文档，不要只根据目录名推断调用关系。
- 桌面端、移动端和 `packages/` workspace 可能有不同脚本；优先运行各自 `package.json` 中已有的命令。

## 2. 代码规范

### TypeScript / JavaScript

- 项目使用 Oxlint 做静态检查，使用 Prettier 统一格式。
- 避免无约束的 `any`；对跨模块数据、组件 Props 和公开方法定义明确类型。
- 变量与函数使用 `camelCase`，类型、类和组件使用 `PascalCase`，常量使用 `UPPER_SNAKE_CASE`。

### Vue

- 使用 Vue 3 Composition API 与 `<script setup lang="ts">`。
- 优先复用项目组件、composable、主题 token 和反馈封装。
- 桌面与移动端的 UI 分层不同；新增工具前阅读[添加新工具指南](./adding-new-tool.md)和[移动端 UI 开发指南](./mobile-ui-development.md)。

## 3. Commit Message 规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，description 使用当前协作语言。首行后必须包含背景和变更要点，不能只写单行标题。

```text
<type>(<scope>): <简述>

背景：
<为什么需要这次改动>

变更要点：
- <具体改动 1>
- <具体改动 2>
```

常用类型：

- `feat`：真正面向用户的新功能。
- `fix`：缺陷修复。
- `docs`：纯文档修改。
- `refactor`：不改变外部行为的重构。
- `test`：测试补充或调整。
- `chore`：配置、依赖、版本和构建维护。

提交信息不得包含 AI 内部状态标记。AI 智能体还必须遵守根目录 `AGENTS.md` 的授权边界，未经用户明确允许不得自行提交。

## 4. 验证

- 根据改动范围运行 lint、类型检查、单元测试和后端检查。
- 前端改动除类型检查外还要运行对应 Vite 构建。
- Tauri 真实运行态和系统级交互按[工具测试指南](./tool-testing-guide.md)选择验证层级，不能用普通浏览器结果替代。
- 提交前检查 diff，确认没有无关格式化、生成物、密钥或本地调试数据。

## 5. Git 工作流

仓库采用常规分支与 Pull Request 工作流。创建分支、推送、提交或发起 PR 前，先确认任务授权和目标分支；不要假定所有改动都需要立即提交。
