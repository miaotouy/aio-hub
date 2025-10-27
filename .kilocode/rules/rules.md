# 项目规范与特性指南

本文档旨在阐述项目的主要技术栈、开发规范、核心特性及自定义组件，帮助开发者快速了解项目并遵循统一标准。

## 1. 技术栈概览

本项目是一个基于 Tauri 构建的跨平台桌面应用，前端采用 Vue 3，后端核心逻辑由 Rust 编写。

### 1.1. 前端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: Element Plus + Naive UI (混合使用)
- **状态管理**: Pinia
- **核心工具**: VueUse, Lodash-es
- **代码编辑**: CodeMirror, Monaco Editor
- **桌面框架**: Tauri 2.0
- **包管理器**: Bun

### 1.2. 后端 (Rust) 技术栈

- **核心语言**: Rust
- **本地 Web 服务**: Axum, Tokio, Hyper (用于 LLM 代理等)
- **原生能力**:
  - Windows OCR API
  - 全局鼠标监听 (`rdev`)
  - 文件安全删除至回收站 (`trash`)
  - 文件系统操作 (`fs_extra`)

## 2. 核心开发规范

为了保证代码质量和项目可维护性，所有开发活动应遵循以下核心规范。

### 2.1. 错误处理

项目采用统一的全局错误处理机制，定义于 `src/utils/errorHandler.ts`。

- **核心理念**: 所有错误都应被捕获并交由 `errorHandler` 单例处理。
- **模块化**: 使用 `createModuleErrorHandler(moduleName)` 为每个功能模块创建独立的错误处理器。
- **错误级别**:
  - `INFO`: 信息，不中断操作。
  - `WARNING`: 警告，可能影响体验。
  - `ERROR`: 错误，影响功能但不崩溃。
  - `CRITICAL`: 严重错误，可能导致应用崩溃。
- **用户提示**:
  - `ERROR` 及以下级别默认使用自定义的 `customMessage` (封装 ElMessage) 进行提示。
  - `CRITICAL` 级别使用 `ElNotification` 进行强提示，且通知不会自动关闭。
- **使用方式**:
  - 推荐使用 `wrapAsync` 和 `wrapSync` 函数包装器来自动捕获和处理函数中的异常。

### 2.2. 日志系统

项目使用统一的日志系统，定义于 `src/utils/logger.ts`。

- **核心理念**: 所有重要的操作和错误都应被记录，以便调试和追踪。
- **模块化**: 使用 `createModuleLogger(moduleName)` 为每个模块创建独立的日志记录器。
- **日志级别**: `DEBUG`, `INFO`, `WARN`, `ERROR`。
- **日志输出**: 日志会同时输出到开发者控制台和本地日志文件 (`appDataDir/logs/app-YYYY-MM-DD.log`)。
- **使用规范**:
  - 业务流程的关键节点使用 `info` 级别。
  - 潜在问题或非致命异常使用 `warn` 级别。
  - 在 `errorHandler` 中捕获的错误会自动记录 `error` 级别日志。

## 3. 自定义组件与封装

### 3.1. `customMessage` (消息提示)

- **文件路径**: `src/utils/customMessage.ts`
- **目的**: 封装 Element Plus 的 `ElMessage` 组件。
- **核心功能**: 自动为消息提示框添加 `offset`，防止其被自定义的无边框标题栏遮挡。
- **使用方法**: 调用方式与 `ElMessage` 完全一致，例如 `customMessage.success('操作成功')`。在项目中应优先使用 `customMessage` 而不是直接使用 `ElMessage`。

## 4. 核心特性与 Composables

项目通过 Vue Composables 实现了许多核心功能的高度复用。

- **LLM 与 OCR 功能集成**:
  - `useLlmProfiles` 和 `useOcrProfiles` 负责管理用户的服务配置（如 API Key、模型偏好等）。
  - `useLlmRequest` 封装了向 LLM 发起请求的核心逻辑。
  - `useModelMetadata` 管理着不同 LLM 模型的元数据和能力信息。

- **主题与样式**:
  - `useTheme` 负责应用整体主题（明/暗）的切换和管理。
  - `useIconColorAnalyzer` 用于分析图标颜色，可能用于动态调整 UI 元素以匹配图标。

- **文件交互**:
  - `useFileDrop` 提供了文件拖拽到应用窗口的功能。
  - `useFileInteraction` 统一处理文件的拖放和粘贴交互，支持自动转换为 Asset 或直接处理文件对象。
  - `useChatFileInteraction` 专门用于聊天附件场景，自动将粘贴的文件转换为 Asset。
  - `useImageFileInteraction` 专门用于图片上传场景，只接受图片文件。
