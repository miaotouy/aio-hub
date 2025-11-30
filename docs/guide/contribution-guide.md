# 贡献指南

欢迎为 AIO Hub 做出贡献！为了保持代码质量和协作效率，请遵循以下规范。

## 1. 代码规范

### 1.1 TypeScript / JavaScript

- **Linter**: 项目使用 ESLint 和 Prettier。提交前请确保代码通过检查。
- **类型安全**: 避免使用 `any`，除非万不得已。尽量定义清晰的 Interface 或 Type。
- **命名**:
  - 变量/函数: `camelCase`
  - 类/组件: `PascalCase`
  - 常量: `UPPER_SNAKE_CASE`

### 1.2 Vue 组件

- **Composition API**: 统一使用 `<script setup lang="ts">`。
- **组件名**: 多单词组合，如 `UserProfile.vue`。
- **Props**: 必须定义类型。

## 2. Git 工作流

我们采用简化的 GitHub Flow。

1.  **Fork** 仓库。
2.  基于 `main` 分支创建你的特性分支: `git checkout -b feature/my-new-feature`。
3.  提交更改。
4.  推送到你的 Fork。
5.  发起 **Pull Request** 到 `main` 分支。

## 3. Commit Message 规范

请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

格式: `<type>(<scope>): <subject>`

- **feat**: 新功能
- **fix**: 修复 Bug
- **docs**: 文档变更
- **style**: 代码格式（不影响逻辑）
- **refactor**: 代码重构
- **perf**: 性能优化
- **test**: 测试相关
- **chore**: 构建过程或辅助工具的变动

示例: `feat(llm-chat): add support for deepseek model`

## 4. 开发环境

1.  安装依赖: `bun install`
2.  启动开发服务器: `bun run tauri dev`
3.  构建生产版本: `bun run tauri build`

## 5. 报告问题

如果你发现了 Bug 或有新功能建议，请在 GitHub Issues 中提交。请提供清晰的复现步骤和环境信息。
