# AGENTS.md — AIO Hub 代理协作规范

> 本文件面向 Codex、Claude Code、Copilot 等 AI 编码代理。它只记录稳定约束和高风险坑点；版本、脚本、目录、依赖等实时信息请以仓库当前文件为准。

## 1. 项目定位

AIO Hub 是基于 Tauri v2、Vue 3、TypeScript 和 Rust 的跨平台 AI 工具枢纽应用。项目采用模块化工具架构，每个工具作为独立单元接入前端 UI 与可选服务能力。

## 2. 工作原则

- 修改前必须读取目标文件当前内容，确认现有实现和上下文。
- 优先用你所处环境提供的工具探查文件、注册入口、调用关系和现有写法。
- 不要凭本文件推断当前版本、依赖、脚本或目录结构；需要时现场读取：
  - `package.json`
  - `mobile/package.json`
  - `src-tauri/tauri.conf.json`
  - `mobile/src-tauri/tauri.conf.json`
  - 相关 `Cargo.toml`
- 优先复用项目已有模式、组件、composable、service 和工具注册方式。
- 保持改动聚焦；不要顺手重构无关代码。

## 3. 命令与包管理

- 包管理器使用 Bun；不要改用 npm、yarn 或 pnpm。
- 运行检查、测试、构建、开发服务前，先读取 `package.json` 中的 scripts，优先使用项目已有脚本。
- TypeScript / JavaScript 脚本默认用 Bun 运行。
- 开发服务端口应避开 `3000`、`5000`、`8000`、`8080` 等过于滥用的端口。

## 4. 工具模块

- 工具模块通常位于 `src/tools/`，移动端工具通常位于 `mobile/src/tools/`；具体以当前目录为准。
- 每个工具应有对应的 `{toolId}.registry.ts` 注册文件。
- 新增或修改工具时，先查找同类工具的 registry、组件组织和服务接入方式，再按现有风格实现。

## 5. 前端规范

### 错误处理

- 使用 `createModuleErrorHandler(moduleName)` 创建模块级错误处理器。
- 不要直接使用全局 `errorHandler` 单例。
- 不要在同一个 `catch` 块中同时调用 `logger.error()` 和 `errorHandler.error()`，避免重复记录。
- 使用 `wrapAsync` / `wrapSync` 后，调用方必须处理 `null` 返回值。

### 日志

- 使用 `createModuleLogger(moduleName)` 创建模块级 logger。
- 日志上下文使用结构化对象参数，不要通过字符串拼接塞入数据。

### 消息与弹窗

- 用户提示优先使用 `customMessage`，不要直接使用 `ElMessage`。
- 使用 `ElMessageBox` 时必须设置 `lockScroll: false`。
- `BaseDialog` 是项目自研对话框，不是 `el-dialog` 封装：
  - 使用 `close-on-backdrop-click`，不要传 `close-on-click-modal`。
  - 使用 `show-close-button`，不要传 `show-close`。

### UI 细节

- `el-dropdown` 和 `el-tooltip` 组合时，tooltip 外层必须包裹一个 `<div>`。
- 背景色使用项目主题变量，例如 `--card-bg`、`--input-bg`、`--sidebar-bg`。
- 毛玻璃效果使用 `backdrop-filter: blur(var(--ui-blur))`。
- 输入框发送交互默认使用 Ctrl+Enter，不要改成单 Enter 发送。

## 6. Rust / Tauri 规范

- 返回给前端的 Rust 结构体应使用 `#[serde(rename_all = "camelCase")]`。
- 新增 Tauri command 后，需要在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册。
- Rust 模块命名优先使用文件名形式，例如 `commands.rs`，避免新增不必要的 `mod.rs`。

## 7. CSP 与数据处理

- 不要使用 `fetch(dataUrl)` 读取 data URL；Tauri CSP 可能拦截 `data:` 协议请求。
- 需要处理 base64 data URL 时，使用 `atob()` + `Uint8Array` 等纯 JS 解码方式。

## 8. 版本与发布

- 桌面端版本必须同步：
  - `package.json`
  - `src-tauri/tauri.conf.json`
- 移动端版本必须同步：
  - `mobile/package.json`
  - `mobile/src-tauri/tauri.conf.json`
- 发布 tag 规则以当前 GitHub Actions / 发布文档为准；不要只凭记忆修改。

## 9. 文档位置

- 工具修改计划：`src/tools/{toolId}/docs/Plan/`
- 工具架构说明：`src/tools/{toolId}/ARCHITECTURE.md`
- 全局或跨模块计划：`docs/Plan/`
- 架构文档：`docs/architecture/`
- 设计草案：`docs/design/`

如果需要更细的局部规范，优先查找仓库内现有文档和相邻代码。
