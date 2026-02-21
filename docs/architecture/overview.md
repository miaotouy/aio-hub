# AIO Hub 架构概览 (Architecture Overview)

本文档旨在详尽阐述 AIO Hub 的核心设计理念、全栈技术架构、关键子系统实现及工程化规范，为开发者提供深度的技术蓝图。

---

## 1. 项目愿景与设计理念 (Philosophy)

AIO Hub 不仅仅是一个工具集合，它是一个以开发者为中心、高度模块化且隐私优先的智能助手平台。

- **离线优先 (Offline First)**: 核心能力（OCR、正则、文件处理、代码格式化）均提供本地引擎支持，确保在无网环境下依然可用，且数据不离端。
- **透明化 (Transparency)**: 拒绝“黑盒”操作。通过全链路日志 (`logger`) 和标准化错误处理 (`errorHandler`)，让每一个任务的进度、中间结果和异常都清晰可见。
- **插件化 (Extensibility)**: 核心功能与 UI 解耦，通过统一的服务注册机制，支持 JS、Native 和 Sidecar 插件扩展。
- **多端对等 (Multi-Platform)**: 桌面端与移动端共享核心逻辑架构，但在 UI 交互上针对平台特性进行深度重构。

---

## 2. 全栈技术栈 (Tech Stack)

### 2.1 基础运行时

- **框架**: [Tauri v2](https://tauri.app/) (Rust + WebView)
  - **后端 (Rust)**: 处理文件系统、系统原生 API（如 Windows OCR）、全局输入监听 (`rdev`)、文件回收站 (`trash`)、高性能计算。
  - **前端 (Vue 3)**: 负责 UI 渲染与业务逻辑编排。
- **包管理器**: [Bun](https://bun.sh/) (用于快速安装与脚本运行)。

### 2.2 前端架构 (PC 端)

- **UI 框架**: [Element Plus](https://element-plus.org/) + [lucide-vue-next](https://lucide.dev/)。
- **数据可视化与增强**: [ECharts](https://echarts.apache.org/) (图表), [Mermaid](https://mermaid.js.org/) (流程图), [KaTeX](https://katex.org/) (数学公式), [@vue-flow/core](https://vueflow.dev/) (节点编辑器)。
- **状态管理**: [Pinia](https://pinia.vuejs.org/) (用于全局配置、工具状态、用户 Profile)。
- **核心工具库**: `@vueuse/core` (响应式能力), `lodash-es` (工具函数), `markdown-it` (文档渲染), `dompurify` (安全净化)。

### 2.3 前端架构 (移动端)

- **UI 框架**: [@varlet/ui](https://varlet.gitee.io/varlet-ui/) (Material Design 3 风格)。
- **设计原则**: 逻辑函数化 (Functional Core)，减少对 Vue 生命周期钩子的重度依赖，便于逻辑在多端间复用。

---

## 3. 核心子系统架构 (Core Subsystems)

### 3.1 统一执行器与服务注册 (Unified Executor & Registry)

项目采用高度解耦的服务化架构，通过 `src/services/` 建立了一套标准化的工具间通信机制。

- **统一执行器 (Executor)**: 位于 `src/services/executor.ts`，是 UI 层与业务逻辑层的核心桥梁。程序通过发送 `ToolCall` 请求并返回 `ServiceResult`，实现调用者与实现者的彻底解耦。支持开发模式下的 `-dev` 实例自动路由。
- **自动扫描注册 (Auto Register)**: `src/services/auto-register.ts` 是应用初始化的核心入口，利用 Vite 的 `import.meta.glob` 机制扫描 `src/tools/` 下所有 `.registry.ts` 模块，并依次完成：① 将 `toolConfig` 注册到 `toolsStore`（UI 工具注册）；② 实例化并注册实现了 `ToolRegistry` 接口的服务类；③ 调用 `pluginManager` 加载所有外部插件；④ 初始化工具排序并标记 store 就绪。
- **双轨注册约定 (Registry Convention)**: 每个 `.registry.ts` 文件导出两类内容——`toolConfig`（必选，供 UI 发现与渲染）和默认导出的 `ToolRegistry` 实现类（可选，仅需对外暴露编程接口的工具才提供，实现"工具即服务"）。

### 3.2 插件化适配器架构 (Plugin Adapter Architecture)

系统通过三层适配器模式满足不同场景的扩展需求，统一包装为 `PluginProxy`：

- **JS Adapter**: 处理 ESM 动态导入的前端逻辑，支持 `logicHook` 注入。
- **Native Adapter**: 桥接 Rust 编写的原生插件能力。
- **Sidecar Adapter**: 管理独立的二进制子进程（如 Python/Go 程序），通过标准 IO 或网络协议通信。

### 3.3 LLM 基础设施 (LLM Infrastructure)

- **多模态协议栈**: 统一的 `LlmMessageContent` 协议，原生支持文本、图像、音频、视频及 PDF 文档的混合输入。针对不同厂商（如 Gemini 视频采样、Claude Files API）进行深度适配。
- **深度思考与推理 (Reasoning)**:
  - **双流并行**: 全链路支持 `Content` 与 `Reasoning` (思考流) 独立解析，适配 DeepSeek R1、OpenAI o-series、Gemini Thinking 等推理模型。
  - **精细化控制**: 针对不同架构提供 `Thinking Budget` (Token 限制) 或 `Reasoning Effort` (强度等级) 的自适应配置。
- **能力感知参数过滤**: 具备模型能力 (Capabilities) 感知，根据模型是否支持 Vision、Tool Use、FIM 等特性自动过滤/降级请求参数，确保 API 调用稳定性。
- **增强特性**:
  - **前缀续写 (Prefill)**: 支持 Claude/DeepSeek 的 Assistant 消息续写，实现引导式生成。
  - **Responses 有状态 API**: 适配 OpenAI 新一代 Responses 接口，内置联网搜索与文件检索增强。
- **高可用 Key 调度**: 内置多 Key 轮询与健康状态检测，具备自动熔断与成功率反馈机制。

### 3.4 跨窗口分离架构 (Window Detachment Architecture)

项目通过独立的根容器组件实现窗口分离，避免在 `App.vue` 中进行复杂的环境判断：

- **分离容器 (Views)**:
  - **工具分离**: 由 `src/views/DetachedWindowContainer.vue` 承载，根据路由参数动态加载工具组件。
  - **组件分离**: 由 `src/views/DetachedComponentContainer.vue` 承载，实现 UI 片段（如 ChatArea）的透明悬浮。
- **状态同步与生命周期**:
  - **预览与固化**: 窗口在拖拽过程中处于 `isPreview` 预览状态，通过 `finalize_detach_session` 固化为最终模式。
  - **Window Sync Bus**: 提供基于 Tauri Event 的跨窗口同步总线，负责握手、全量状态同步及增量 Patch 更新。
  - **逻辑挂载**: 通过 `logicHook` 和 `initializeEnvironment` 确保分离窗口拥有与主窗口一致的业务逻辑上下文。

### 3.5 主题与质感系统 (Theme Appearance)

- **多层级视觉引擎**:
  - **原生融合**: 深度集成 Windows Mica/Acrylic 和 macOS Vibrancy 效果。
  - **毛玻璃特效 (Glassmorphism)**: 通过 `backdrop-filter` 与动态 CSS 变量 (`--ui-blur`, `--card-opacity`) 实现细腻的通透感。
- **智能壁纸系统**:
  - **全场景适配**: 支持静态壁纸、目录轮播及内置精选库。
  - **色彩算法**: 内置智能取色引擎，根据壁纸主色调自动计算并注入 UI 叠加色（Overlay），确保视觉一致性且不“刺眼”。
- **高度定制化 (Custom CSS)**:
  - **运行时覆盖**: 支持用户编写自定义 CSS 片段或使用内置预设（如“赛博朋克”、“复古终端”），实现 UI 的深度重塑。

---

## 4. 目录结构与模块组织 (Directory Structure)

```text
aio-hub/
├── src/                    # PC 端前端源码
│   ├── tools/              # 工具特区：包含工具组件、Store 及 `.registry.ts` 服务定义
│   ├── services/           # 核心基础设施：执行器、适配器、注册表、插件管理
│   ├── llm-apis/           # LLM 适配层：统一协议转换与厂商适配
│   ├── composables/        # 组合式逻辑：跨窗口分离、资产管理、主题系统等
│   ├── config/             # 全局配置与 Agent 预设 (YAML/JSON)
│   ├── views/              # 顶层视图容器：主窗口及各类分离窗口容器
│   ├── components/         # 通用 UI 组件库 (common/icons)
│   └── stores/             # 全局状态管理 (Pinia)
├── mobile/                 # 移动端项目 (Vue 3 + Varlet + Tauri)
│   ├── src/tools/          # 移动端适配工具 (llm-api, llm-chat 等)
│   └── src/utils/          # 移动端基础设施 (与 PC 端接口对齐)
├── src-tauri/              # Rust 核心：命令定义 (commands/)、系统集成、插件载体
├── plugins/                # 外部插件存放目录
├── docs/                   # 深度文档库
│   ├── architecture/       # 子系统详细设计 (Sync, Theme, LLM)
│   ├── design/             # 功能 RFC 与草案
│   └── guide/              # 开发者上手指南
└── scripts/                # 自动化脚本：i18n 检查、便携版构建等
```

---

## 5. 开发者导航 (Navigation)

- 想要了解如何开发新工具？请参考 [新工具开发指南](docs/guide/adding-new-tool.md)。
- 对插件系统感兴趣？阅读 [插件开发深度手册](docs/guide/plugin-development-guide.md)。
- 需要处理窗口分离？查看 [窗口同步技术内幕](docs/architecture/window-sync-architecture.md)。
- 关于日志与错误处理的细节？参见 [日志与错误处理规范](docs/guide/logging-error-handling.md)。
