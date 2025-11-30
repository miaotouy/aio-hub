# 通用组件库 (Common Components)

本文档介绍了 `src/components/common` 目录下的通用 UI 组件。这些组件旨在提供一致的用户体验和高度的复用性。

## 目录

- [通用组件库 (Common Components)](#通用组件库-common-components)
  - [目录](#目录)
  - [基础 UI](#基础-ui)
    - [Avatar](#avatar)
    - [BaseDialog](#basedialog)
    - [DraggablePanel](#draggablepanel)
    - [InfoCard](#infocard)
    - [DropZone](#dropzone)
  - [图标与媒体](#图标与媒体)
    - [DynamicIcon](#dynamicicon)
    - [FileIcon](#fileicon)
    - [ImageViewer](#imageviewer)
    - [VideoPlayer](#videoplayer)
    - [VideoViewer](#videoviewer)
  - [选择器与输入](#选择器与输入)
    - [AvatarSelector](#avatarselector)
    - [IconPresetSelector](#iconpresetselector)
    - [LlmModelSelector](#llmmodelselector)
    - [ModelSelectDialog](#modelselectdialog)
  - [编辑器与查看器](#编辑器与查看器)
    - [RichCodeEditor](#richcodeeditor)
    - [DocumentViewer](#documentviewer)
  - [其他](#其他)
    - [DetachPreviewHint](#detachpreviewhint)

---

## 基础 UI

### Avatar

通用头像组件，支持自动处理多种源（图片 URL、`appdata://` 协议、本地路径、Emoji 或文字回退）。

- **Props**:
  - `src` (string): 头像源。
  - `size` (number): 尺寸，默认 40。
  - `shape` ('circle' | 'square'): 形状，默认 'square'。
  - `radius` (number): 圆角大小（仅 square 有效），默认 6。
  - `alt` (string): 回退文字（取首字母）。
  - `backgroundColor` (string): 背景色。
  - `lazy` (boolean): 是否启用懒加载，默认 true。

### BaseDialog

基础对话框组件，修复了 Element Plus Dialog 的样式问题，支持毛玻璃效果和自定义布局。

- **Props**:
  - `modelValue` (boolean): v-model 控制显示。
  - `title` (string): 标题。
  - `width` / `height` (string): 尺寸。
  - `bare` (boolean): 是否为无样式模式（透明背景，无边框）。
  - `showCloseButton` (boolean): 是否显示关闭按钮。
- **Slots**: `default`, `header`, `footer`

### DraggablePanel

可拖拽、可调整大小的悬浮面板，支持位置持久化。

- **Props**:
  - `modelValue` (boolean): v-model 控制显示。
  - `title` (string): 标题。
  - `persistenceKey` (string): 用于本地存储位置和尺寸的唯一键。
  - `resizable` (boolean): 是否可调整大小。
  - `minWidth` / `minHeight` (number): 最小尺寸。

### InfoCard

是对 Element Plus `el-card` 的封装，用于展示信息的卡片，支持代码高亮、一键复制和毛玻璃效果。

- **Props**:
  - `title` (string): 标题。
  - `content` (string): 内容文本。
  - `isCode` (boolean): 是否作为代码块显示（等宽字体、背景色）。
  - `bare` (boolean): 是否仅显示头部（折叠模式）。
  - `shadow` ('never' | 'always' | 'hover'): 阴影显示策略。

### DropZone

文件拖放区域，支持文件类型过滤、目录检测和视觉反馈。

- **Props**:
  - `dropId` (string): 区域唯一标识。
  - `placeholder` (string): 占位文本。
  - `accept` (string[]): 允许的文件扩展名列表（如 `['.png', '.jpg']`）。
  - `directoryOnly` (boolean): 仅接受文件夹。
  - `variant` ('default' | 'border' | 'input'): 样式变体。
- **Events**:
  - `drop`: (paths: string[]) => void

---

## 图标与媒体

### DynamicIcon

动态图标组件，支持 SVG 内容直接渲染（用于主题变色）或图片 URL。

- **Props**:
  - `src` (string): 图标源。
  - `alt` (string): 替代文本。
  - `lazy` (boolean): 懒加载。

### FileIcon

根据文件名后缀或类型自动显示对应的 VSCode 风格图标。

- **Props**:
  - `fileName` (string): 文件名。
  - `fileType` (AssetType): 文件类型（作为后备）。
  - `size` (number | string): 图标大小。

### ImageViewer

基于 Viewer.js 的图片查看器，支持缩放、旋转、翻转等操作。通常通过 `useImageViewer` composable 调用，也可以作为组件使用。

- **Props**:
  - `images` (string[]): 图片 URL 列表。
  - `initialIndex` (number): 初始索引。

### VideoPlayer

全功能视频播放器，支持截图、倍速、画中画、逐帧播放、快捷键控制。

- **Props**:
  - `src` (string): 视频源。
  - `title` (string): 视频标题。
  - `poster` (string): 封面图。
  - `autoplay` (boolean): 自动播放。
  - `loop` (boolean): 循环播放。

### VideoViewer

模态框形式的视频查看器，封装了 VideoPlayer。

- **Props**:
  - `visible` (boolean): v-model 控制显示。
  - `src` (string): 视频源。

---

## 选择器与输入

### AvatarSelector

高级头像选择器，支持预设图标、本地图片引用、上传图片（自动存入 AppData）和历史记录管理。

- **Props**:
  - `modelValue` (string): 当前头像路径。
  - `entityId` (string): 实体 ID（用于上传路径隔离）。
  - `profileType` ('agent' | 'user'): 实体类型。

### IconPresetSelector

预设图标选择器，支持分类过滤和搜索。

- **Props**:
  - `icons` (PresetIconInfo[]): 图标数据列表。
  - `showSearch` (boolean): 显示搜索栏。
  - `showCategories` (boolean): 显示分类标签。

### LlmModelSelector

LLM 模型下拉选择器，按服务商分组，支持按能力（如 vision, tool_use）筛选模型。

- **Props**:
  - `modelValue` (string): 格式为 `profileId:modelId`。
  - `capabilities` (Partial<ModelCapabilities>): 需要的模型能力。

### ModelSelectDialog

弹窗式的 LLM 模型选择器，提供更详细的模型信息和筛选功能。通常配合 `useModelSelectDialog` 使用。

---

## 编辑器与查看器

### RichCodeEditor

双引擎代码编辑器，支持 CodeMirror (轻量) 和 Monaco (强大) 两种引擎，支持 Diff 模式。

- **Props**:
  - `modelValue` (string): 代码内容。
  - `language` (string): 语言（如 'javascript', 'python'）。
  - `editorType` ('codemirror' | 'monaco'): 编辑器引擎。
  - `diff` (boolean): 是否开启 Diff 模式。
  - `original` / `modified` (string): Diff 模式下的原始内容和修改后内容。
  - `readOnly` (boolean): 只读模式。

### DocumentViewer

多格式文档查看器，智能识别并渲染 Markdown、HTML、代码或二进制文件占位。

- **Props**:
  - `content` (string | Uint8Array): 文档内容。
  - `fileName` (string): 文件名（用于推断语言）。
  - `editorType`: 默认使用的编辑器引擎。
  - `showEngineSwitch`: 是否显示切换引擎的按钮。

---

## 其他

### DetachPreviewHint

用于窗口拖拽分离时的视觉提示组件（显示“松手创建窗口”等提示）。通常配合 `useDetachable` 使用。

- **Props**:
  - `visible` (boolean): 是否显示。
