# AGENTS.md - AIO Hub 插件开发协作规范

> 本文件用于 AIO Hub 独立插件仓库。复制到插件仓库根目录后，请按当前插件类型和实际目录结构补充细节。

## 1. 插件定位

- 本仓库是 AIO Hub 的独立插件仓库，不是 AIO Hub 主仓库的一部分。
- 插件应通过 `manifest.json` 声明 `id`、`name`、`version`、`type`、`host`、`methods`、`contributions`、`ui` 等能力。
- 插件类型以 `manifest.json` 的 `type` 为准，常见值包括：
  - `javascript`
  - `native`
  - `sidecar`

## 2. 工作原则

- 修改前先读取目标文件当前内容，确认现有实现和上下文。
- 优先复用本插件已有目录结构、构建脚本、SDK 调用方式和日志/错误处理模式。
- 保持改动聚焦，不要顺手重构无关代码。
- 不要把主仓库源码当成本插件的一部分修改；需要宿主能力时，通过 `aiohub-sdk`、`manifest.json`、插件方法或贡献点对接。
- 本仓库独立版本管理；提交、tag、发布包应在本插件仓库内完成。

## 3. 命令与包管理

- 包管理器优先使用 Bun；不要擅自切换到 npm、yarn 或 pnpm。
- 运行检查、测试、构建前，先读取当前仓库的 `package.json`、`Cargo.toml` 或相关构建配置。
- TypeScript / JavaScript 脚本默认用 Bun 运行。
- 不要临时新增全局依赖；需要依赖时写入当前插件仓库的配置文件。

## 4. Manifest 规范

- `manifest.json` 是插件能力的事实来源。
- 修改插件能力时，同步更新：
  - `version`
  - `host.appVersion`
  - `host.apiVersion`
  - `methods`
  - `contributions`
  - `settingsSchema`
  - `sidecar`
  - `ui`
- 对外暴露给 Agent 调用的方法必须提供清晰的 `description`、参数结构和返回语义。
- Native / Sidecar 插件没有 TypeScript 反射能力时，必须在 `manifest.json` 中声明可调用方法。

## 5. JavaScript 插件

- 入口通常由 `manifest.json` 的 `main` 指向，例如 `index.ts` 或构建后的 `index.js`。
- 推荐默认导出插件对象，并按需实现：
  - `activate(context)`
  - `deactivate()`
  - `getMetadata()`
  - 可被宿主调用的业务方法
- 访问宿主能力时优先使用 `aiohub-sdk` 和 `PluginContext`。
- 插件 UI 使用 Vue 组件时，优先遵循 AIO Hub 现有主题变量和交互习惯。

## 6. Sidecar 插件

- Sidecar 可执行文件路径必须通过 `manifest.json` 的 `sidecar.executable` 声明，并使用相对插件根目录的路径。
- 常驻 Sidecar 应遵循 JSON Lines 协议：每条 stdout 输出必须是单行 JSON。
- stdout 用于协议消息；调试日志应输出到 stderr 或插件自己的日志文件。
- 收到 shutdown 指令时应优雅退出，释放子进程、文件句柄和临时资源。
- Sidecar 之间需要通信时，通过 AIO Hub Broker 中转，不要直接启动其他插件的 sidecar。

## 7. Native 插件

- Native 插件应保持 ABI 契约稳定，避免破坏宿主加载流程。
- 对外结构体和错误码变更需要同步更新文档和 `manifest.json` 方法声明。
- 跨平台二进制产物应按平台架构清晰命名。

## 8. 配置、数据与临时文件

- 用户配置通过 `settingsSchema` 声明，并使用宿主提供的配置 API 读取和写入。
- 插件私有数据使用 `PluginContext.storage` 或插件约定的数据目录，不要写入主仓库目录。
- 临时文件优先使用 AIO Hub 共享临时目录约定，并保证可清理。
- 不要提交用户密钥、模型文件缓存、构建产物或本地调试数据，除非发布流程明确要求。

## 9. UI 与用户提示

- 插件 UI 应使用 AIO Hub 主题变量，避免硬编码大面积颜色、圆角、阴影。
- 用户提示优先使用宿主封装能力，例如 `customMessage` / `customDialog`。
- 涉及输入框发送交互时，默认保持 Ctrl+Enter 发送，不要改成单 Enter。
- 如果插件使用弹窗或浮层，确保不会破坏宿主应用滚动和焦点管理。

## 10. 调试与验证

- Tauri 真实运行态需要通过 AIO Hub 的 Tauri 开发环境验证；普通浏览器只能做纯前端外观检查。
- 修改后优先运行当前插件仓库已有的 lint、typecheck、test、build 脚本。
- Sidecar / Native 插件还应验证目标平台二进制能被宿主正确加载。
- 修改 Agent 可调用方法后，检查方法元数据是否能被宿主发现，参数名和说明是否对 AI 友好。

## 11. 文档同步

- 变更插件能力、配置、构建或发布方式时，同步更新当前插件仓库的 `README.md` 和相关开发文档。
- 如果实现偏离既有计划或设计文档，先完成代码，再把偏差写回文档并标注原因。

