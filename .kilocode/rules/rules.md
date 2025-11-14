# AIO Hub

**一站式桌面AI工具枢纽 | 开发者的效率利器**

# 项目规范与特性指南

本文档旨在阐述项目的主要技术栈、开发规范、核心特性及自定义组件，帮助开发者快速了解项目并遵循统一标准。

## 1. 技术栈概览

本项目是一个基于 Tauri v2 构建的跨平台桌面应用，前端采用 Vue 3，后端核心逻辑由 Rust 编写。

### 1.1. 前端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: Element Plus + lucide-vue-next
- **状态管理**: Pinia
- **核心工具**: VueUse, Lodash-es, ECharts
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

项目采用统一的全局错误处理机制，定义于 `src/utils/errorHandler.ts`。其核心设计是**模块化**和**自动日志记录**。

- **核心规范：必须使用模块化处理器**
  - 所有模块（如 `services`, `composables`, `stores`）都**必须**使用 `createModuleErrorHandler(moduleName)` 创建独立的错误处理器。这能确保错误来源清晰可追溯。
  - **禁止**直接导入和使用全局的 `errorHandler` 单例。
  - **示例**:
    ```typescript
    // a/b/c.ts
    import { createModuleErrorHandler } from "@/utils/errorHandler";
    const errorHandler = createModuleErrorHandler("a/b/c");
    ```

- **使用模式一：自动包装 (推荐)**
  - 使用 `wrapAsync` 和 `wrapSync` 函数可以极大地简化 `try...catch` 样板代码。
  - **重要**: 包装函数在捕获到错误后会返回 `null`。**调用方必须处理 `null` 返回值**，以避免后续逻辑出错。
  - **示例**:

    ```typescript
    const result = await errorHandler.wrapAsync(async () => someApiCall(), {
      userMessage: "获取数据失败，请重试",
    });

    if (result === null) {
      // 错误已被自动处理（提示用户 + 记录日志），此处执行回退逻辑
      return;
    }
    // ...继续处理 result
    ```

- **使用模式二：手动处理**
  - 在 `try...catch` 块中，使用模块处理器的快捷方法 `.error()`, `.warn()` 等。
  - **重要**: `errorHandler` **会自动调用日志系统**。因此，**严禁**在 `catch` 块中同时调用 `logger.error()` 和 `errorHandler.error()`，这会导致日志重复记录。
  - **示例**:

    ```typescript
    try {
      // ...
    } catch (error) {
      // 正确：只调用 errorHandler，它会负责提示用户和记录日志
      errorHandler.error(error, "操作失败", { attachedData: 123 });

      // 错误：重复记录
      // logger.error('操作失败', error); // 不要这样做！
    }
    ```

- **关键选项**
  - `showToUser: false`: 静默处理错误，只记录日志而不向用户显示任何提示。适用于后台或非关键操作。
  - `userMessage: '...'`: 自定义向用户显示的消息，覆盖默认生成的友好提示。
  - `context: { ... }`: 附加的结构化数据，会一并记录到日志中，用于调试。
  - **特殊规则**: `AbortError` (通常由用户取消操作触发) 会被系统自动降级为 `INFO` 级别并且静默处理，业务代码中**无需**进行额外捕获和处理。

### 2.2. 日志系统

项目使用统一的日志系统，定义于 `src/utils/logger.ts`，支持结构化、分级和持久化。

- **核心规范：必须使用模块化日志**
  - 所有模块都**必须**使用 `createModuleLogger(moduleName)` 创建独立的日志记录器。
  - **示例**:
    ```typescript
    // a/b/c.ts
    import { createModuleLogger } from "@/utils/logger";
    const logger = createModuleLogger("a/b/c");
    ```

- **日志记录规范**
  - **结构化日志**: 所有日志方法 (`.info`, `.warn` 等) 的第二个参数用于传递结构化的 `data` 对象。**禁止**将数据通过字符串拼接的方式记录在消息中。
  - **错误日志**: `.error()` 方法的第二个参数应始终传递原始的 `Error` 对象，以保留完整的堆栈信息用于调试。
  - **控制台折叠**: 对于包含大量数据的日志，可以传递第三个参数 `collapsed: true`，使其在开发者控制台中默认折叠，保持日志主干清晰。
  - **示例**:

    ```typescript
    // 推荐做法
    logger.info("用户配置已加载", { userId: "abc", theme: "dark" });
    logger.error("API 请求失败", error, { url: "/api/data" });
    logger.debug(
      "组件状态更新",
      {
        newState: {
          /* ... */
        },
      },
      true
    ); // 折叠显示

    // 不推荐的做法
    logger.info(`用户 ${userId} 的配置已加载，主题是 ${theme}`);
    logger.error(`API 请求失败: ${error.message}`);
    ```

- **日志输出**: 日志会同时输出到开发者控制台和本地日志文件 (`appDataDir/logs/app-YYYY-MM-DD.log`)。

## 3. 自定义组件与封装

### 3.1. `customMessage` (消息提示)

- **文件路径**: `src/utils/customMessage.ts`
- **目的**: 封装 Element Plus 的 `ElMessage` 组件。
- **核心功能**: 自动为消息提示框添加 `offset`，防止其被自定义的无边框标题栏遮挡。
- **使用方法**: 调用方式与 `ElMessage` 完全一致，例如 `customMessage.success('操作成功')`。在项目中应优先使用 `customMessage` 而不是直接使用 `ElMessage`。

### 3.2. 通用 UI 组件

项目在 `src/components/common/` 目录下封装了一系列可复用的通用组件，详细使用方法请参考各组件的示例文档：

- **BaseDialog** - 解决 Element Plus Dialog 样式问题的干净对话框组件，支持精确高度控制和 bare 模式。
- **Avatar** - 通用头像组件，自动识别图片/Emoji/文字，支持 `appdata://` 路径，支持名字首字回退。
- **RichCodeEditor** - 双引擎代码编辑器（CodeMirror/Monaco），自动适配主题。
- **LlmModelSelector** - LLM 模型下拉选择器，支持按能力筛选和分组显示。
- **ModelSelectDialog** - LLM 模型弹窗，提供可视化的模型选择界面和搜索筛选功能。
- **ImageViewer** - 基于 Viewer.js 的图片查看器组件，支持缩放、旋转等操作。
- **DropZone** - 文件拖放区域组件，支持文件类型过滤和自定义验证。
- **IconPresetSelector** - 图标预设选择器，支持搜索和分类过滤。
- **DynamicIcon** - 动态图标加载组件，支持 SVG/图片/Emoji。
- **DetachPreviewHint** - 可分离窗口的预览提示组件。
- **InfoCard** - 信息卡片组件，el-card的封装，用于展示结构化信息。
- **DocumentViewer** - 多格式文档预览组件，支持 Markdown 渲染、HTML 页面预览和代码文件预览，提供源码/预览模式切换和双引擎代码编辑器。

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
    - **卡片/面板**: `background-color: var(--card-bg);`
    - **输入框**: `background-color: var(--input-bg);`
    - **侧边栏**: `background-color: var(--sidebar-bg);`
    - **对话框/遮罩层**: `background-color: var(--container-bg);`

2.  **模糊效果 (Glassmorphism)**: 如果希望组件拥有毛玻璃效果，请添加 `backdrop-filter` 属性。模糊强度由用户设置动态控制。
    - `backdrop-filter: blur(var(--ui-blur));`

3.  **边框**: 边框颜色已经预设了透明度，可以直接使用 `--border-color` 变量。
    - `border: 1px solid var(--border-color);`

4.  **代码编辑器**: 对于代码编辑区域（如 CodeMirror/Monaco），应使用特定变量以匹配用户设置：
    - `background-color: var(--vscode-editor-background);`

#### 示例

一个正确适配主题的卡片组件样式参考可能如下：

```css
.my-custom-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  /*box-shadow: var(--el-box-shadow-light); /* 可选，复用 Element Plus 的阴影 */
}
```

通用组件中的已经预先适配过了

通过遵循这些规范，可以确保所有 UI 元素都能响应设置中的“界面质感”调整，提供统一、高度可定制的用户体验。
