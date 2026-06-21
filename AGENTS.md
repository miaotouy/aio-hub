# AGENTS.md — AIO Hub 代理协作规范

> 本文件面向 Codex、Claude Code、Copilot 等 AI 编码代理。它只记录稳定约束和高风险坑点；版本、脚本、目录、依赖等实时信息请以仓库当前文件为准。

## 1. 项目定位

AIO Hub 是基于 Tauri v2、Vue 3、TypeScript 和 Rust 的跨平台 AI 工具枢纽应用。项目采用模块化工具架构，每个工具作为独立单元接入前端 UI 与可选服务能力。

## 2. 工作原则

- **【铁律】在 kilo code 等xml工具链应用中，严禁使用 Shell/PowerShell 管道命令或复杂脚本来修改文件**。所有文件读取、修改、写入操作**必须**使用平台提供的专用工具链（如 `read_file`、`apply_diff`、`write_to_file`）。
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
- 但是也不要过分追求最小化改动导致功能实现不理想。说的就是你codex！！！！

### 任务执行与文档同步

- 用户基于文档（plan / architecture / spec 等）发起任务且未要求确认时，没有实质性疑问就直接开工，不要反复确认。
- 施工过程中如果发现与文档不符或需要偏离文档，先把工作做完，再把偏差写回原文档（具体路径见第 10 节）做标记，保持文档与代码同步。
- 重大偏差或影响后续步骤的，写回文档后同步告知用户；微小偏差直接静默回写即可。

## 3. 命令与包管理

- **【铁律】在 kilo code 等xml工具链应用中，禁止通过 `execute_command` 运行 `powershell`、`sed`、`awk`、`Get-Content`、`Set-Content` 等命令来读写或修改文件**。命令行工具仅用于运行项目预设脚本（如 `bun run dev`、`check` 等）、依赖管理或 Git 操作。
- 包管理器使用 Bun；不要改用 npm、yarn 或 pnpm。
- 运行检查、测试、构建、开发服务前，先读取 `package.json` 中的 scripts，优先使用项目已有脚本。
- TypeScript / JavaScript 脚本默认用 Bun 运行。
- 开发服务端口应避开 `3000`、`5000`、`8000`、`8080` 等过于滥用的端口。

## 4. 调试与测试

- Tauri 应用不能用普通浏览器直接访问 Vite 页面来验证真实运行态；普通浏览器缺少 Tauri WebView 注入的 IPC、插件和窗口运行时。
- 不要为了调试真实 Tauri 功能而单独启动 Vite 或使用 Codex / 浏览器插件打开 `localhost` 页面；这类方式只能用于明确做了 mock 或 browser fallback 的纯前端外观检查。
- 自动验证优先使用项目脚本：`lint`、`build:tsc` / `check:frontend`、`test:run`、`check:backend` 等，具体命令以当前 `package.json` 为准。
- 涉及 Tauri API 的前端单测可使用 `@tauri-apps/api/mocks` mock `invoke`、事件和窗口等能力；这只验证前端逻辑与调用契约，不等同于真实 Rust command / plugin 验证。
- 真实运行态调试应使用 `tauri dev` / 项目对应脚本启动 Tauri 窗口，并在 WebView DevTools 中检查控制台、DOM 和网络。
- 自动化 E2E 只有在项目已提供稳定脚本和驱动配置时再运行，例如 `tauri-driver` / WebDriver 或 Windows WebView2 CDP；不要临时用普通浏览器替代 Tauri WebView。

## 5. 工具模块

- 工具模块通常位于 `src/tools/`，移动端工具通常位于 `mobile/src/tools/`；具体以当前目录为准。
- 每个工具应有对应的 `{toolId}.registry.ts` 注册文件。
- 新增或修改工具时，先查找同类工具的 registry、组件组织和服务接入方式，再按现有风格实现。

## 6. 前端规范

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

### 移动端 UI 分层

- 移动端整体架构是 **Tauri v2 + Vue 3 + TypeScript + Rust**，不是 Varlet 应用框架；不要把 Varlet / Material Design 3 当成移动端设计语言或页面骨架来源。
- Varlet 在移动端的定位等同于桌面端的 Element Plus：只作为可替换的底层组件库使用，优先承担按钮、输入、选择器、开关、加载态等原子件，以及被封装后的 Snackbar / Dialog 能力。
- 页面结构、工具骨架、导航容器、弹层骨架、列表信息架构、聊天输入区、设置页分组等应优先使用原生 Vue 组件 + 项目 CSS / composable 自研实现，必要时沉淀到 `mobile/src/components/base/` 或 `mobile/src/components/common/`。
- 新增移动端页面时，不要直接用 `var-app-bar`、`var-cell`、`var-card`、`var-paper`、`var-popup`、`var-bottom-navigation` 搭主结构；确需使用时，应先说明它只是叶子控件或临时兼容层，并避免把业务样式绑定到 Varlet 的结构和主题语义上。
- 移动端主题以 AIO Hub 自有 token 为主；Varlet CSS 变量只能作为适配输出，不能反向决定项目的颜色、圆角、间距、阴影和交互气质。
- 移动端用户提示应封装为与桌面端 `customMessage` / `customDialog` 对齐的工具；不要在业务代码里继续散落直接调用 `Snackbar` / `Dialog`。

## 7. Rust / Tauri 规范

- 返回给前端的 Rust 结构体应使用 `#[serde(rename_all = "camelCase")]`。
- 新增 Tauri command 后，需要在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册。
- Rust 模块命名优先使用文件名形式，例如 `commands.rs`，避免新增不必要的 `mod.rs`。

## 8. CSP 与数据处理

- 不要使用 `fetch(dataUrl)` 读取 data URL；Tauri CSP 可能拦截 `data:` 协议请求。
- 需要处理 base64 data URL 时，使用 `atob()` + `Uint8Array` 等纯 JS 解码方式。

## 9. 版本与发布

- 桌面端版本必须同步：
  - `package.json`
  - `src-tauri/tauri.conf.json`
- 移动端版本必须同步：
  - `mobile/package.json`
  - `mobile/src-tauri/tauri.conf.json`
- 发布 tag 规则以当前 GitHub Actions / 发布文档为准；不要只凭记忆修改。

## 10. 文档位置

- 工具修改计划：`src/tools/{toolId}/docs/Plan/`
- 工具架构说明：`src/tools/{toolId}/ARCHITECTURE.md`
- 全局或跨模块计划：`docs/Plan/`
- 架构文档：`docs/architecture/`
- 设计草案：`docs/design/`

如果需要更细的局部规范，优先查找仓库内现有文档和相邻代码。

