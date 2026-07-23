# AGENTS.md - AIO Hub 智能体协作规范

> 本文件只记录全仓库稳定约束、高风险边界和文档入口。版本、脚本、依赖、目录细节与 API 用法以仓库当前文件和链接文档为准。

## 1. 工作边界

- 修改前必须读取目标文件和直接相关调用，确认当前实现、注册入口与相邻写法。
- 不要从本文推断版本、依赖或脚本。需要时读取根目录与移动端的 `package.json`、`tauri.conf.json`、相关 `Cargo.toml` 和实际源码。
- 优先复用已有组件、composable、service、registry 和工具函数。改动应聚焦，但不能为了减少文件数或 diff 大小而牺牲完整实现。
- 不得回退、覆盖或整理与当前任务无关的用户改动。
- 未经用户明确允许，不得创建 Git 提交。需要提交时遵循[贡献指南](docs/guide/contribution-guide.md)中的提交规范。

## 2. 任务与文档同步

- 用户基于 plan、architecture 或 spec 发起实施任务且未要求确认时，没有实质性疑问就直接开工，不要过多询问。
- 实现与原文档存在偏差时，完成代码后同步修正文档或标记偏差，保持文档与代码一致。
- 遇到重大偏差或影响后续步骤的阻塞问题，写回原文档后告知用户；微小偏差可直接静默回写。
- 工具计划放在 `src/tools/{toolId}/docs/Plan/`，工具架构放在 `src/tools/{toolId}/ARCHITECTURE.md`；跨模块计划、架构和设计分别放在 `docs/Plan/`、`docs/architecture/`、`docs/design/`。

## 3. 命令与验证

- 包管理器使用 Bun；没有明确兼容性原因不要改用 npm、yarn 或 pnpm。TypeScript/JavaScript 脚本默认用 Bun 运行。
- 运行检查、测试、构建或开发服务前先读取对应 `package.json` 的 scripts，并优先使用已有脚本。
- 前端改动确认前除类型检查外还必须运行对应 Vite 构建；打包期导入、插件和 CSS 错误不能由 `tsc` 单独覆盖。
- 普通浏览器只能验证明确具有 mock 或 browser fallback 的纯前端场景，不能替代真实 Tauri WebView、IPC、插件或窗口运行态。
- Tauri 单测、真实窗口 E2E、原生文件对话框和 Windows UI Automation 的边界与运行方式见[工具测试指南](docs/guide/tool-testing-guide.md)、[Tauri E2E 说明](tests/tauri-e2e/README.md)和[Windows UI Automation 说明](tests/windows-ui-automation/README.md)。

## 4. 工具、插件与专项模块

- 桌面端和移动端工具分别位于 `src/tools/` 与 `mobile/src/tools/`，注册文件使用 `{toolId}.registry.ts`。新增或修改工具前阅读[添加新工具指南](docs/guide/adding-new-tool.md)和[工具注册指南](docs/guide/tool-registry-guide.md)。
- `plugins/` 下的插件是独立 Git 仓库，拥有独立版本和生命周期。修改插件时必须在对应插件仓库中操作，并遵循该仓库规范与 [`plugins/AGENTS.template.md`](plugins/AGENTS.template.md)。
- 涉及 VCP 时，必须先阅读 [`tool-calling` 架构](src/tools/tool-calling/ARCHITECTURE.md)与 [`vcp-connector` 架构](src/tools/vcp-connector/ARCHITECTURE.md)，不得根据名称猜测协议含义。
- 模型元数据规则只在模型创建、导入、刷新或显式应用预设时写入模型对象。`media-generator` 运行时只读取模型自身的 `mediaGenParams`，不得实时合并或回退到全局元数据规则。
- 移动端特有的文档入口、验证边界和实现约定见 [`mobile/AGENTS.md`](mobile/AGENTS.md)；处理 `mobile/**` 时先读取该局部指引。

## 5. 前端规范

- 模块使用 `createModuleLogger` 和 `createModuleErrorHandler`；不要直接使用全局 `errorHandler`，也不要在同一 `catch` 中用 logger 与 errorHandler 重复记录。`wrapAsync` / `wrapSync` 的调用方必须处理 `null`。详见[日志与错误处理指南](docs/guide/logging-error-handling.md)。
- 常规扁平持久化配置优先使用 `createConfigManager`；高频修改使用 `saveDebounced`。复杂索引、多文件关联、二进制和大文件存储使用领域专用方案。详见[配置管理指南](docs/guide/config-management.md)。
- 用户提示使用平台封装：桌面端优先使用 `src/utils/customMessage.ts`，移动端使用 `mobile/src/utils/feedback.ts`。使用 `ElMessageBox` 时设置 `lockScroll: false`；`BaseDialog` 的属性契约见[通用组件说明](src/components/common/README.md)。
- 背景、边框、文字、模糊等视觉值使用项目主题变量；毛玻璃使用 `backdrop-filter: blur(var(--ui-blur))`。详见[主题系统架构](docs/architecture/theme-system-architecture.md)。
- 移动端以原生 Vue 结构、项目组件和 AIO Hub token 为主，Varlet 只作为可替换的底层原子组件库。详见[移动端 UI 开发指南](docs/guide/mobile-ui-development.md)。

## 6. Rust、Tauri 与数据处理

- 返回前端的 Rust 结构体使用 `#[serde(rename_all = "camelCase")]`。
- 新增 Tauri command 后，在对应端 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册。
- Rust 模块优先使用 `commands.rs` 一类文件模块，不新增无必要的 `mod.rs`。
- 不要用 `fetch(dataUrl)` 读取 data URL；Tauri CSP 可能拦截 `data:`。需要解码 base64 data URL 时使用 `atob()` 与 `Uint8Array` 等纯 JavaScript 方式。

## 7. 版本与发布

- 版本文件、tag 规则和发布流程以当前 workflow 与[应用内更新发布说明](docs/guide/release-updater.md)为准，不要凭记忆修改。
- 桌面应用版本以根 `package.json` 为唯一来源，移动应用版本以 `mobile/package.json` 为唯一来源；两端 `tauri.conf.json` 通过路径读取对应 `package.json`。
- `src-tauri` 中的 Cargo package 使用固定内部版本，不作为应用发布版本。不要为应用发版修改 Cargo version。
- 使用 `bun run version:set -- <desktop|mobile> <version>` 修改应用版本，发版前运行 `bun run version:check`。桌面发布 tag 使用 `v<version>`，移动端使用 `mv<version>`，iOS 测试构建使用 `miv<version>`。
