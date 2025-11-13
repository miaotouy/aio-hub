# AIO Hub

**一站式桌面AI工具枢纽 | 开发者的效率利器**

# 项目规范与特性指南

本文档旨在阐述项目的主要技术栈、开发规范、核心特性及自定义组件，帮助开发者快速了解项目并遵循统一标准。

## 1. 技术栈概览

本项目是一个基于 Tauri v2 构建的跨平台桌面应用，前端采用 Vue 3，后端核心逻辑由 Rust 编写。

### 1.1. 前端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: Element Plus
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

### 3.2. 通用 UI 组件

项目在 `src/components/common/` 目录下封装了一系列可复用的通用组件，详细使用方法请参考各组件的示例文档：

- **BaseDialog** - 解决 Element Plus Dialog 样式问题的干净对话框组件，支持精确高度控制和 bare 模式。详见 [`BaseDialog-example.md`](../../src/components/common/BaseDialog-example.md)
- **Avatar** - 通用头像组件，自动识别图片/Emoji/文字，支持 `appdata://` 路径。详见 [`Avatar-example.md`](../../src/components/common/Avatar-example.md)
- **RichCodeEditor** - 双引擎代码编辑器（CodeMirror/Monaco），自动适配主题。详见 [`RichCodeEditor-example.md`](../../src/components/common/RichCodeEditor-example.md)
- **LlmModelSelector** - LLM 模型选择器，支持按能力筛选和分组显示。
- **ModelSelectDialog** - 模型搜索对话框，提供可视化的模型选择界面。
- **ImageViewer** - 基于 Viewer.js 的图片查看器组件，支持缩放、旋转等操作。
- **DropZone** - 文件拖放区域组件，支持文件类型过滤和自定义验证。
- **IconPresetSelector** - 图标预设选择器，支持搜索和分类过滤。详见 [`README.md`](../../src/components/common/README.md)
- **DynamicIcon** - 动态图标加载组件，支持 SVG/图片/Emoji。
- **DetachPreviewHint** - 可分离窗口的预览提示组件。
- **InfoCard** - 信息卡片组件，用于展示结构化信息。

## 4. 核心特性与 Composables

项目通过 Vue Composables 实现了许多核心功能的高度复用。

- **LLM 与 OCR 功能集成**:
  - `useLlmProfiles` 和 `useOcrProfiles` 负责管理用户的服务配置（如 API Key、模型偏好等）。
  - `useLlmRequest` 封装了向 LLM 发起请求的核心逻辑。
  - `useModelMetadata` 管理着不同 LLM 模型的元数据和能力信息。
  - `useModelSelectDialog` 提供全局的模型选择对话框功能。

- **资产管理**:
  - `useAssetManager` 提供统一的资产管理接口，支持文件导入、读取和协议转换等功能。

- **主题与样式**:
  - `useTheme` 负责应用整体主题（明/暗）的切换和管理。
  - `useThemeAwareIcon` 用于图标的主题自适应处理。

- **文件交互**:
  - `useFileDrop` 提供了文件拖拽到应用窗口的功能。
  - `useFileInteraction` 统一处理文件的拖放和粘贴交互，支持自动转换为 Asset 或直接处理文件对象。
  - `useChatFileInteraction` 专门用于聊天附件场景，自动将粘贴的文件转换为 Asset。
  - `useImageFileInteraction` 专门用于图片上传场景，只接受图片文件。

- **窗口管理**:
  - `useDetachable` 统一处理可分离组件/工具的拖拽逻辑，支持将组件拖拽为独立窗口。
  - `useDetachedManager` 管理分离窗口的生命周期和状态同步。

- **UI 交互**:
  - `useImageViewer` 提供全局的图片查看功能，支持缩放、旋转等操作。

## 5. 主题外观系统 (Theme Appearance)

项目包含一个强大的主题外观系统，允许用户动态调整应用的透明度、模糊等视觉效果。核心逻辑封装在 `src/composables/useThemeAppearance.ts` 中。

#### 核心机制

该系统通过在 `<html>` 根元素上动态设置 CSS 自定义属性 (CSS Variables) 来工作。所有组件都应优先使用这些变量来定义背景、边框等样式，以确保与用户设置保持一致。

#### 如何适配新组件

要使你的组件支持动态主题外观，请遵循以下原则：

1.  **背景**: 根据组件的角色，使用对应的背景变量。这些变量已经包含了基于用户设置的透明度。
    *   **卡片/面板**: `background-color: var(--card-bg);`
    *   **输入框**: `background-color: var(--input-bg);`
    *   **侧边栏**: `background-color: var(--sidebar-bg);`
    *   **对话框/遮罩层**: `background-color: var(--container-bg);`

2.  **模糊效果 (Glassmorphism)**: 如果希望组件拥有毛玻璃效果，请添加 `backdrop-filter` 属性。模糊强度由用户设置动态控制。
    *   `backdrop-filter: blur(var(--ui-blur));`

3.  **边框**: 边框颜色已经预设了透明度，可以直接使用 `--border-color` 变量。
    *   `border: 1px solid var(--border-color);`

4.  **代码编辑器**: 对于代码编辑区域（如 CodeMirror/Monaco），应使用特定变量以匹配用户设置：
    *   `background-color: var(--vscode-editor-background);`

#### 示例

一个正确适配主题的卡片组件样式可能如下：

```css
.my-custom-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light); /* 复用 Element Plus 的阴影 */
}
```

通过遵循这些规范，可以确保所有 UI 元素都能响应设置中的“界面质感”调整，提供统一、高度可定制的用户体验。
