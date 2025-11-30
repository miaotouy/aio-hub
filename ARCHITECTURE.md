# AIO Hub 架构概览

本文档提供了 AIO Hub 项目的整体架构视图，旨在帮助开发者快速理解项目的核心结构、设计理念和关键系统。

## 1. 技术栈 (Tech Stack)

AIO Hub 是一个基于现代 Web 技术构建的高性能桌面应用。

- **核心框架**: [Tauri 2.0](https://tauri.app/) (Rust + WebView)
  - 提供轻量级、安全的桌面运行时环境。
  - 后端逻辑使用 **Rust** 编写，保证高性能和安全性。
  - 前端界面使用系统原生 WebView 渲染。
- **前端框架**: [Vue 3](https://vuejs.org/) (Composition API)
  - 使用 `<script setup>` 语法糖，代码简洁高效。
  - 状态管理: [Pinia](https://pinia.vuejs.org/)
  - 路由管理: [Vue Router](https://router.vuejs.org/)
- **开发语言**:
  - **TypeScript**: 前端逻辑全覆盖，提供严格的类型安全。
  - **Rust**: 后端核心服务、系统交互和计算密集型任务。
- **构建工具**: [Vite](https://vitejs.dev/)
- **包管理器**: [Bun](https://bun.sh/) (推荐) 或 npm/pnpm

## 2. 目录结构 (Directory Structure)

项目遵循清晰的模块化结构，将前端视图、业务逻辑和底层服务分离。

```
e:/rc20/allinweb/all-in-one-tools/
├── src/
│   ├── tools/              # 工具模块 (核心业务)
│   │   ├── llm-chat/       # 示例: LLM 对话工具
│   │   ├── smart-ocr/      # 示例: 智能 OCR 工具
│   │   └── ...             # 每个工具都是一个独立的模块
│   ├── services/           # 核心服务层 (插件、执行器、注册表)
│   ├── llm-apis/           # LLM API 适配层 (OpenAI, Claude, Gemini 等)
│   ├── composables/        # 组合式函数 (业务逻辑复用)
│   ├── components/         # 通用 UI 组件
│   ├── stores/             # Pinia 全局状态
│   ├── views/              # 应用级页面 (设置、主页等)
│   ├── router/             # 路由配置
│   ├── styles/             # 全局样式和主题定义
│   ├── utils/              # 工具函数
│   ├── types/              # TypeScript 类型定义
│   ├── config/             # 静态配置
│   ├── App.vue             # 根组件
│   └── main.ts             # 入口文件
├── src-tauri/              # Tauri 后端 (Rust 代码)
├── plugins/                # 插件目录 (JS/Native/Sidecar 插件)
├── docs/                   # 项目文档
│   ├── architecture/       # 架构文档
│   ├── design/             # 设计文档
│   └── guide/              # 开发指南
└── ...
```

### 2.1 工具模块化设计 (`src/tools/`)

每个工具（如 `llm-chat`, `smart-ocr`）都被设计为相对独立的模块，通常包含：
- `ToolName.vue`: 工具入口组件（例如 `LlmChat.vue`, `SmartOcr.vue`），**避免使用 `index.vue`** 以便在编辑器标签页中快速识别。
- `components/`: 工具私有组件
- `composables/`: 工具私有逻辑
- `ARCHITECTURE.md`: 工具特定的架构文档 (强烈推荐)

这种设计使得工具易于维护、测试和迁移。

## 3. 核心设计理念

### 3.1 工具离线化 (Offline First)
优先保证核心工具的离线可用性。除了 LLM 对话等必须联网的功能外，文件处理、OCR（本地引擎）、Git 分析等功能应尽量在本地完成，减少对网络的依赖，确保数据安全和响应速度。

### 3.2 透明化与人性化 (Transparent & Human-Centric)
工具不应是黑盒。我们致力于让工具的运行过程对用户可见（例如显示详细的日志、进度和中间结果），并提供直观的 UI 让用户干预。AI 是增强人类能力的助手，而非替代者。

### 3.3 插件化架构 (Plugin Architecture)
核心功能通过服务注册表 (`registry.ts`) 暴露，允许通过插件系统扩展应用能力。无论是内部工具还是第三方插件，都通过统一的接口进行交互。

## 4. 关键系统概览

### 4.1 服务与插件系统
- **服务注册表**: 统一管理应用提供的各种能力（如 OCR、文件处理）。
- **插件支持**: 支持 JavaScript (UI/逻辑)、Native (Rust DLL) 和 Sidecar (独立进程) 三种类型的插件。
- **文档**: [服务架构文档](docs/architecture/services-architecture.md)

### 4.2 LLM 多模型集成
- **统一适配器**: 通过 `llm-apis` 层屏蔽了不同 LLM 供应商（OpenAI, Claude, Gemini 等）的接口差异。
- **流式响应**: 全链路支持流式输出，提供打字机般的流畅体验。
- **文档**: [LLM API 架构文档](docs/architecture/llm-apis-architecture.md)

### 4.3 窗口分离与状态同步
- **自由布局**: 支持将聊天窗口、工具面板拖拽分离为独立窗口。
- **多源同步**: 采用基于 Bus 的状态同步机制，支持主窗口与分离窗口、分离窗口与分离窗口之间的数据实时同步。
- **文档**: [窗口同步架构文档](docs/architecture/window-sync-architecture.md)

### 4.4 主题与外观系统
- **原生融合**: 支持 Windows Mica / macOS Vibrancy 等原生毛玻璃特效。
- **深度定制**: 提供 CSS 变量级的主题定制能力和动态壁纸系统。
- **文档**: [主题系统架构文档](docs/architecture/theme-system-architecture.md)

## 5. 开发指南导航

- **添加新工具**: [新工具开发指南](docs/guide/adding-new-tool.md)
- **开发插件**: [插件开发指南](docs/guide/plugin-development-guide.md)
- **UI 开发**: [插件 UI 开发指南](docs/guide/plugin-ui-development-guide.md)
- **状态管理**: [状态管理指南](docs/guide/state-management-guide.md)
