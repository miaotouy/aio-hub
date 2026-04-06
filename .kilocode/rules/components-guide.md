# 自定义组件与封装指南

本文档详细说明项目中的自定义组件和 Composables 的使用方法。

## 1. `customMessage` (消息提示)

- **文件路径**: `src/utils/customMessage.ts`
- **目的**: 封装 Element Plus 的 `ElMessage` 组件。
- **核心功能**: 自动为消息提示框添加 `offset`，防止其被自定义的无边框标题栏遮挡。
- **使用方法**: 调用方式与 `ElMessage` 完全一致，例如 `customMessage.success('操作成功')`。在项目中应优先使用 `customMessage` 而不是直接使用 `ElMessage`。

## 2. 通用 UI 组件

项目主要在 `src/components/common/` 目录下（部分位于 `src/components/` 或 `src/tools/`）封装了一系列可复用的通用组件：

- **BaseDialog** - **完全自主实现**的对话框组件，用于替代 Element Plus Dialog 以解决样式和毛玻璃效果问题。
  - **重要限制**: 它不是 `el-dialog` 的封装，**严禁**向其传递 `el-dialog` 的专有属性（如 `close-on-click-modal`、`show-close` 等），否则会导致 Vue 警告。
  - **对应关系**: 使用 `close-on-backdrop-click` 替代 `close-on-click-modal`，使用 `show-close-button` 替代 `show-close`。
  - **尺寸准则**: 对于功能性表单或管理界面，应优先使用响应式尺寸（如 `width="90%"` 或 `width="1200px"`），高度建议设为 `height="80vh"` 或以上，确保内容展示充分。

- **DraggablePanel** - 通用悬浮面板组件，支持拖拽移动、调整大小、最小化、视口自动吸附和状态持久化。

- **Avatar** - 通用头像组件，自动识别图片/Emoji/文字，支持 `appdata://` 路径，支持名字首字回退。

- **AvatarSelector** - 高级头像选择器（暂时只支持chat相关的头像选择），支持预设图标、本地图片引用、图片上传（自动存入 AppData）和历史记录管理。

- **RichCodeEditor** - 双引擎代码编辑器（CodeMirror/Monaco），自动适配主题。

- **LlmModelSelector** - LLM 模型下拉选择器，支持按能力筛选和分组显示。

- **ModelSelectDialog** - LLM 模型弹窗，提供可视化的模型选择界面和搜索筛选功能。

- **ImageViewer** - 基于 Viewer.js 的图片查看器组件，支持缩放、旋转等操作。

- **VideoPlayer** - 全功能视频播放器，支持倍速、画中画、截图、快捷键控制。

- **VideoViewer** - 基于 VideoPlayer 的模态框视频查看器。

- **FileIcon** - 文件图标组件，基于文件名后缀自动匹配 VSCode 风格或 Lucide 图标。

- **DropZone** - 文件拖放区域组件，支持文件类型过滤和自定义验证。

- **IconPresetSelector** - 图标预设选择器，支持搜索和分类过滤。

- **DynamicIcon** - 动态图标加载组件，用于从 URL 或路径加载 SVG/图片资源。其核心是支持主题自适应（特别是对 SVG 的动态着色），并提供懒加载和字符回退。注意：它并非通用图标组件，不应用于替代 `lucide-vue-next` 等常规图标。

- **DetachPreviewHint** - 可分离窗口的预览提示组件。

- **InfoCard** - 信息卡片组件，el-card的封装，用于展示结构化信息。

- **DocumentViewer** - 多格式文档预览组件，支持 Markdown 渲染、HTML 页面预览和代码文件预览，提供源码/预览模式切换和双引擎代码编辑器。

- **ComponentHeader** - (`src/components/`) 专用于**可分离/悬浮窗组件**的头部，提供置顶、分离（开启悬浮窗）等特定交互逻辑，并自动适配拖拽模式。普通工具页面不应使用。

## 3. 核心 Composables

项目通过 Vue Composables 实现了许多核心功能的高度复用。

### 3.1. LLM 与 OCR 功能集成

- `useLlmProfiles` 和 `useOcrProfiles` 负责管理用户的服务配置（如 API Key、模型偏好等）。
- `useLlmRequest` 封装了向 LLM 发起请求的核心逻辑。
- `useModelMetadata` 管理着不同 LLM 模型的元数据和能力信息。
- `useModelSelectDialog` 提供全局的模型选择对话框功能。

### 3.2. 资产管理

- `useAssetManager` 提供统一的资产管理接口，支持文件导入、读取和协议转换等功能。

### 3.3. 主题与样式

- `useTheme` 负责应用整体主题（明/暗）的切换和管理。
- `useThemeAwareIcon` 用于图标的主题自适应处理。

### 3.4. 文件交互

- `useFileDrop` 提供了文件拖拽到应用窗口的功能。
- `useFileInteraction` 统一处理文件的拖放和粘贴交互，支持自动转换为 Asset 或直接处理文件对象。
- `useChatFileInteraction` 专门用于聊天附件场景，自动将粘贴的文件转换为 Asset。
- `useImageFileInteraction` 专门用于图片上传场景，只接受图片文件。

### 3.5. 窗口管理

- `useDetachable` 统一处理可分离组件/工具的拖拽逻辑，支持将组件拖拽为独立窗口。
- `useDetachedManager` 管理分离窗口的生命周期和状态同步。

### 3.6. UI 交互

- `useImageViewer` 提供全局的图片查看功能，支持缩放、旋转等操作。

### 3.7. 消息通知系统

- `useNotification` 提供统一的消息推送接口，支持持久化存储、已读管理和路由跳转。
- **便捷方法**: `info`, `success`, `warning`, `error`, `system`。
- **高级配置**: 支持 `source` (来源标识) 和 `metadata` (如 `path` 用于点击跳转)。
- **示例**:
  ```typescript
  const notify = useNotification();
  notify.success("任务完成", "文件已导出", { source: "my-tool" });
  notify.error("配置错误", "请检查 API Key", {
    metadata: { path: "/settings" },
  });
  ```
