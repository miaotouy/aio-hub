# AGENTS.md - AIO Hub 智能体协作规范

> 本文件只记录全仓库稳定约束、高风险边界和文档入口。版本、脚本、依赖、目录细节与 API 用法以仓库当前文件和链接文档为准。

## 1. 工作边界

- 修改前读取目标文件和直接相关调用，确认当前实现、注册入口与相邻写法。
- 版本、依赖与脚本直接从根目录与移动端的 `package.json`、`tauri.conf.json`、相关 `Cargo.toml` 和实际源码中读取。
- 优先复用已有组件、composable、service、registry 和工具函数。改动保持聚焦且确保实现完整。
- 完整保留与当前任务无关的用户改动，修改范围仅聚焦于任务目标。
- 仅在获得用户明确许可后创建 Git 提交。需要提交时遵循[贡献指南](docs/guide/contribution-guide.md)中的提交规范。

## 2. 任务与文档同步

- 用户基于 plan、architecture 或 spec 发起实施任务且未要求确认时，无实质性疑问直接开工。
- 实现与原文档存在偏差时，完成代码后同步修正文档或标记偏差，保持文档与代码一致。
- 遇到重大偏差或影响后续步骤的阻塞问题，写回原文档后告知用户；微小偏差可直接静默回写。
- 工具计划放在 `src/tools/{toolId}/docs/Plan/`，工具架构放在 `src/tools/{toolId}/ARCHITECTURE.md`；跨模块计划、架构和设计分别放在 `docs/Plan/`、`docs/architecture/`、`docs/design/`。

## 3. 命令与验证

- 包管理器与脚本运行统一使用 Bun。
- 运行检查、测试、构建或开发服务前先读取对应 `package.json` 的 scripts，并优先使用已有脚本。
- 前端改动确认前除类型检查外同步运行 Vite 构建，以覆盖打包期导入、插件和 CSS 检查。
- 普通浏览器用于验证明确具有 mock 或 browser fallback 的纯前端场景；涉及 Tauri WebView、IPC、插件或真实窗口运行态的功能，在真实环境中进行验证。
- Tauri 单测、真实窗口 E2E、原生文件对话框和 Windows UI Automation 的边界与运行方式见[工具测试指南](docs/guide/tool-testing-guide.md)、[Tauri E2E 说明](tests/tauri-e2e/README.md)和[Windows UI Automation 说明](tests/windows-ui-automation/README.md)。
- 默认仅运行与当前改动相关的测试用例，保持执行高效。
- 测试由回归风险和可稳定验证的行为驱动。新增测试需明确其防护的具体回归点；断言应面向目标行为契约，避免机械镜像实现细节。迁移旧测试时以当前目标契约为验证依据。
- UI 自动化承担可确定验证的交互状态、数据写入边界和关键可访问性契约。视觉质量、信息层级、响应式布局与交互体验在真实运行态中走查；展示性 UI 通过类型检查、生产构建和界面走查验收。

## 4. 工具、插件与专项模块

- 桌面端和移动端工具分别位于 `src/tools/` 与 `mobile/src/tools/`，注册文件使用 `{toolId}.registry.ts`。新增或修改工具前阅读[添加新工具指南](docs/guide/adding-new-tool.md)和[工具注册指南](docs/guide/tool-registry-guide.md)。
- `plugins/` 下的插件是独立 Git 仓库，拥有独立版本和生命周期。修改插件时在对应插件仓库中操作，并遵循该仓库规范与 [`plugins/AGENTS.template.md`](plugins/AGENTS.template.md)。
- Native / Sidecar 插件的构建脚本将当前平台产物部署到稳定相对路径，manifest 统一引用该路径。验证时以运行 manifest 对应平台键指向的文件为准。
- 涉及 VCP 时，阅读 [`tool-calling` 架构](src/tools/tool-calling/ARCHITECTURE.md)与 [`vcp-connector` 架构](src/tools/vcp-connector/ARCHITECTURE.md)，以文档规范为唯一协议依据。
- 模型元数据规则在模型创建、导入、刷新或显式应用预设时固化写入模型对象。`media-generator` 运行时直接读取模型自身的 `mediaGenParams`。
- 移动端特有的文档入口、验证边界和实现约定见 [`mobile/AGENTS.md`](mobile/AGENTS.md)；处理 `mobile/**` 时先读取该局部指引。

## 5. 前端规范

- 模块使用 `createModuleLogger` 和 `createModuleErrorHandler`；在同一 `catch` 块中保持单一记录方式。`wrapAsync` / `wrapSync` 的调用方需妥善处理 `null`。详见[日志与错误处理指南](docs/guide/logging-error-handling.md)。
- 常规扁平持久化配置优先使用 `createConfigManager`；高频修改使用 `saveDebounced`。复杂索引、多文件关联、二进制和大文件存储使用领域专用方案。详见[配置管理指南](docs/guide/config-management.md)。
- 用户提示使用平台封装：桌面端优先使用 `src/utils/customMessage.ts`，移动端使用 `mobile/src/utils/feedback.ts`。使用 `ElMessageBox` 时设置 `lockScroll: false`；`BaseDialog` 的属性契约见[通用组件说明](src/components/common/README.md)。
- 背景、边框、文字、模糊等视觉值使用项目主题变量；毛玻璃使用 `backdrop-filter: blur(var(--ui-blur))`。详见[主题系统架构](docs/architecture/theme-system-architecture.md)。
- 移动端以原生 Vue 结构、项目组件和 AIO Hub token 为主，Varlet 只作为可替换的底层原子组件库。详见[移动端 UI 开发指南](docs/guide/mobile-ui-development.md)。
- 使用 `DropZone` 时，默认通过内置“选择文件”按钮或拖放区域交互；整块区域需要点击时才配置 `click-zone`。内置按钮的原生点击与键盘交互保持独立可用。
- 界面按专业桌面软件交互设计：默认即展示完整工作区（工具栏、面板、编辑区、操作入口），仅内容区留白并用内联占位、禁用态或默认示例填充。禁止 web 式「先打开/上传才出现完整界面」的引导式空页面，空数据与未选择状态同样保留可操作的整体框架。

## 6. Rust、Tauri 与数据处理

- 返回前端的 Rust 结构体使用 `#[serde(rename_all = "camelCase")]`。
- 新增 Tauri command 后，在对应端 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册。
- Rust 模块优先使用 `commands.rs` 等文件模块命名风格。
- 解码 base64 data URL 时使用 `atob()` 与 `Uint8Array` 等纯 JavaScript 方式，以适配 Tauri CSP 策略。

## 7. 版本与发布

- 版本文件、tag 规则和发布流程以当前 workflow 与[应用内更新发布说明](docs/guide/release-updater.md)为准。
- 桌面应用版本以根 `package.json` 为唯一来源，移动应用版本以 `mobile/package.json` 为唯一来源；两端 `tauri.conf.json` 通过路径读取对应 `package.json`。
- `src-tauri` 中的 Cargo package 使用固定内部版本，仅在桌面与移动端对应 `package.json` 中维护发布版本。
- 使用 `bun run version:set -- <desktop|mobile> <version>` 修改应用版本，发版前运行 `bun run version:check`。桌面发布 tag 使用 `v<version>`，移动端使用 `mv<version>`，iOS 测试构建使用 `miv<version>`。
