# 贡献指南

本指南记录 AIO Hub 的通用开发与提交约定。脚本、依赖和版本以仓库当前文件为准。

## 1. 开始之前

- 包管理器使用 Bun。安装依赖前先确认根目录或对应 workspace 的 `package.json`。
- 修改前阅读目标代码、相邻实现和相关架构文档，不要只根据目录名推断调用关系。
- 桌面端、移动端和 `packages/` workspace 可能有不同脚本；优先运行各自 `package.json` 中已有的命令。

### 桌面开发运行模式

日常修改使用 `bun run dev`，前端通过 Vite HMR 更新。

需要用生产前端产物进行长时间运行或构建行为排查时，使用：

```powershell
bun run dev:static
```

启动时准备前端资源并进行生产构建，随后由仅绑定 `127.0.0.1` 的本地静态服务提供产物。构建进程结束后释放构建内存，应用保留 Rust debug 运行态。

修改前端后，在另一终端使用相同的实例环境变量重新构建：

```powershell
bun run dev:static:build
```

等待构建成功，再点击应用托盘菜单的“重启前端”。这会刷新主窗口，Rust 进程继续运行；分离窗口、弹幕窗口和后台页面需要各自重新加载。尚未持久化的页面状态会随刷新重置。

希望保存源码后自动重新构建时，可以启动监听模式：

```powershell
bun run dev:static:watch
```

监听模式保持手动刷新，构建失败时继续提供上一版产物。修改 Vite 配置或构建环境变量后重新启动该模式。监听期间由该进程负责构建，额外的手动构建命令会提示等待或停止监听。

两种开发模式共用 `AIO_ID_SUFFIX`、`AIO_PORT`、`AIO_PROXY_PORT`、`AIO_DATA_DIR` 和 `AIO_PRODUCT_NAME`。同时运行多个实例时，为每个实例设置独立端口与数据目录；手动构建终端应使用与目标实例相同的环境变量。静态模式按最终前端端口隔离产物，保存在 `.dev-data/static-frontend/<port>/`，发布构建仍使用 `dist`。

完整产物发布后才切换服务入口，同时保留当前版和上一版资源，便于旧页面继续请求延迟加载的 chunk。静态资源响应禁用缓存，路由刷新支持 SPA 回退，多页面 HTML 入口分别提供。

这个模式适合前端生产构建行为排查。本地 HTTP origin 与打包版的应用资源协议仍有区别，Rust debug/release 条件编译行为也有区别；发布行为验证继续使用 `bun run test:build-app`。

### 本地构建提速

`bun run build:tsc` 使用增量类型检查，缓存保存到已忽略的 `.tmp/typecheck/vue-tsc.tsbuildinfo`。`bun run build` 及桌面构建会复用这份缓存，检查范围保持原样。首次运行会生成缓存，后续根据源码和配置变化更新检查结果；需要重新生成缓存时可删除该文件。

`bun run build:portable` 和 `bun run build:portable:local` 内部使用 `--no-bundle`，构建 release EXE 后导出便携版及 `portable.flag`。需要安装包时继续使用 `bun run tauri:build` 或 `bun run tauri:build:local`。

### 构建日志

桌面构建（`bun run tauri:build:local`、`build.bat`、`build.sh`）、便携版构建和 Android 构建会在终端实时输出，并将完整标准输出与错误输出保存到仓库的 `.tmp/build-logs/`。该目录已被 Git 忽略。

每次构建生成带构建类型、UTC 时间戳和进程号的独立 `.log` 文件；终端启动时会显示日志的绝对路径，日志末尾记录结束时间和退出码。便携版及其内部桌面构建共用同一份日志。排查失败时可直接查看对应日志，旧日志按需手动清理。

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

## 5. 文档维护

文档站按发布清单收录用户手册和精选开发文档，维护方式见 [文档站维护与教程截图](./docs-maintenance.md)。教程截图可由 Agent 通过项目开发控制 CLI 自行准备和采集，并按需要添加引导标注。
