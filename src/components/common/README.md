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

- **使用示例** (来自 [`ExportAgentDialog.vue`](../../tools/llm-chat/components/export/ExportAgentDialog.vue)):
  ```vue
  <Avatar
    :src="resolveAvatarPath(agent, 'agent') || ''"
    :alt="agent.name"
    :size="18"
    shape="square"
    :radius="3"
  />
  ```

### BaseDialog

**完全自主实现**的基础对话框组件，旨在提供比 Element Plus Dialog 更干净的样式控制和原生毛玻璃效果支持。

> [!WARNING]
> **不要将其视为 `el-dialog` 的封装**。它不接收 `el-dialog` 的属性。如果你传递了 `close-on-click-modal` 这样的属性，Vue 会因为无法在多根节点组件上继承属性而报错。

- **Props**:
  - `modelValue` (boolean): v-model 控制显示。
  - `title` (string): 标题。
  - `width` / `height` (string): 尺寸（支持数字或带单位字符串）。
  - `top` (string): 距离顶部的距离。
  - `bare` (boolean): 是否为无样式模式（透明背景，无边框）。
  - `showCloseButton` (boolean): 是否显示关闭按钮。
  - `closeOnBackdropClick` (boolean): 点击遮罩层是否关闭。
  - `destroyOnClose` (boolean): 关闭时是否销毁内容。
  - `loading` (boolean): 内容区域显示加载状态。
- **Slots**: `default`, `header`, `footer`

- **使用示例** (来自 [`CreateUserProfileDialog.vue`](../../views/Settings/user-profile/components/CreateUserProfileDialog.vue)):
  ```vue
  <BaseDialog
    :model-value="visible"
    title="创建用户档案"
    width="500px"
    @update:model-value="emit('update:visible', $event)"
  >
    <template #content>
      <UserProfileForm v-model="formData" />
    </template>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确认</el-button>
    </template>
  </BaseDialog>
  ```

### DraggablePanel

一个功能强大的悬浮面板组件，支持拖拽、调整大小、最小化、视口边缘吸附和状态持久化。

- **核心特性**:
  - **拖拽与缩放**: 用户可以自由移动和调整面板大小。
  - **状态持久化**: 通过 `persistenceKey`，面板的位置和尺寸会自动保存到本地存储，并在下次打开时恢复。
  - **最小化**: 支持将面板收起到标题栏，节省屏幕空间。
  - **视口感知**: 面板会自动适应窗口大小变化，并防止被拖拽到屏幕外。
  - **激活**: 支持从外部调用方法，将面板带到前台并展开。

- **Props**:
  - `modelValue` (boolean): `v-model` 控制面板的显示与隐藏。
  - `title` (string): 面板标题。
  - `persistenceKey` (string): 用于本地存储的唯一键。如果提供，位置和尺寸将被持久化。
  - `width` / `height` (string): 初始宽度和高度 (e.g., "400px")。
  - `initialX` / `initialY` (number): 初始位置的 x/y 坐标。
  - `resizable` (boolean): 是否允许用户调整大小，默认 `true`。
  - `minWidth` / `minHeight` (number): 调整大小时的最小宽度和高度。
  - `destroyOnClose` (boolean): 是否在关闭时从 DOM 中销毁组件，默认 `false`。

- **Slots**:
  - `default`: 面板的主内容区域。
  - `header-actions`: 位于标题栏右侧的自定义操作区域，可用于放置额外的控制按钮。

- **Events**:
  - `update:modelValue (value: boolean)`: 在面板显示/隐藏状态改变时触发。
  - `close`: 在用户点击关闭按钮时触发。

- **Exposed Methods**:
  - `activate()`: 激活面板。如果面板已最小化，则会展开；同时会确保面板完整显示在视口内。

- **使用示例** (来自 [`RichTextRendererTester.vue`](../../tools/rich-text-renderer/RichTextRendererTester.vue)):

  ```vue
  <script setup>
  import DraggablePanel from "@/components/common/DraggablePanel.vue";
  import type { DraggablePanelInstance } from "@/components/common/DraggablePanel.vue";

  const styleEditorPanelRef = ref<DraggablePanelInstance | null>(null);
  </script>

  <template>
    <DraggablePanel
      ref="styleEditorPanelRef"
      v-model="showStyleEditor"
      title="样式编辑器"
      persistence-key="rich-text-style-editor"
      :resizable="true"
    >
      <MarkdownStyleEditor v-model="richTextStyleOptions" />
    </DraggablePanel>
  </template>
  ```

### InfoCard

是对 Element Plus `el-card` 的封装，用于展示信息的卡片，支持代码高亮、一键复制和毛玻璃效果。

- **Props**:
  - `title` (string): 标题。
  - `content` (string): 内容文本。
  - `isCode` (boolean): 是否作为代码块显示（等宽字体、背景色）。
  - `bare` (boolean): 是否仅显示头部（折叠模式）。
  - `shadow` ('never' | 'always' | 'hover'): 阴影显示策略。

- **使用示例** (来自 [`ThemeAppearanceSettings.vue`](../../views/Settings/general/ThemeAppearanceSettings.vue)):
  ```vue
  <InfoCard :class="{ 'glass-card': isGlassEffectActive }">
    <template #header>
      <span>壁纸设置</span>
    </template>
    <template #headerExtra>
      <el-button size="small" @click="resetWallpaper">重置</el-button>
    </template>
    <el-form label-position="top">
      <!-- 表单内容 -->
    </el-form>
  </InfoCard>
  ```

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

- **使用示例** (来自 [`ConfigPanel.vue`](../../tools/directory-janitor/components/ConfigPanel.vue)):
  ```vue
  <DropZone
    drop-id="janitor-path"
    :directory-only="true"
    placeholder="拖拽文件夹到此处，或点击选择"
    @drop="handlePathDrop"
  >
    <div v-if="config.targetPath" class="path-display">
      <span class="path-text">{{ config.targetPath }}</span>
      <el-button size="small" @click="clearPath">清除</el-button>
    </div>
  </DropZone>
  ```

---

## 图标与媒体

### DynamicIcon

动态图标组件，支持 SVG 内容直接渲染（用于主题变色）或图片 URL。

- **Props**:
  - `src` (string): 图标源。
  - `alt` (string): 替代文本。
  - `lazy` (boolean): 懒加载。

- **使用示例** (来自 [`MessageHeader.vue`](../../tools/llm-chat/components/message/MessageHeader.vue)):
  ```vue
  <DynamicIcon :src="agentProfileInfo.modelIcon || ''" class="model-icon" />
  ```

### FileIcon

根据文件名后缀或类型自动显示对应的 VSCode 风格图标。

- **Props**:
  - `fileName` (string): 文件名。
  - `fileType` (AssetType): 文件类型（作为后备）。
  - `size` (number | string): 图标大小。

- **使用示例** (来自 [`AttachmentCard.vue`](../../tools/llm-chat/components/AttachmentCard.vue)):
  ```vue
  <FileIcon :file-name="asset.name" :file-type="asset.type" :size="36" />
  ```

### ImageViewer

基于 Viewer.js 的图片查看器，支持缩放、旋转、翻转等操作。通常通过 `useImageViewer` composable 调用，也可以作为组件使用。

- **Props**:
  - `images` (string[]): 图片 URL 列表。
  - `initialIndex` (number): 初始索引。

- **使用示例** (通常通过 `useImageViewer` composable 调用，来自 [`PreviewPanel.vue`](../../tools/smart-ocr/components/PreviewPanel.vue)):

  ```vue
  <script setup>
  import { useImageViewer } from "@/composables/useImageViewer";

  const imageViewer = useImageViewer();

  const handleImageClick = (imageUrl: string) => {
    imageViewer.show([imageUrl], 0);
  };
  </script>
  ```

### VideoPlayer

全功能视频播放器，基于 `plyr` 进行了深度定制和功能增强。

- **核心功能**:
  - **逐帧播放**: 支持通过快捷键 (`,` 和 `.`) 进行精确的逐帧前进/后退。
  - **画中画 (PiP)**: 支持将视频窗口置顶播放。
  - **截图**: 可将当前帧保存为 PNG 图片。
  - **快捷键支持**: 提供丰富的快捷键，如 `Space` (播放/暂停), `↑`/`↓` (音量), `←`/`→` (快进/快退)。
  - **智能标题**: 自动从 `src` 中提取文件名作为标题。

- **Props**:
  - `src` (string): 视频源。
  - `title` (string): 视频标题 (可选, 会覆盖自动提取的标题)。
  - `poster` (string): 封面图。
  - `autoplay` (boolean): 自动播放。
  - `loop` (boolean): 循环播放。

- **使用示例** (来自 [`VideoViewer.vue`](./VideoViewer.vue) 内部):
  ```vue
  <VideoPlayer v-if="visible" :src="src" :title="title" autoplay />
  ```

### VideoViewer

模态框形式的视频查看器，封装了 VideoPlayer。

- **Props**:
  - `visible` (boolean): v-model 控制显示。
  - `src` (string): 视频源。

- **使用示例** (通常通过 `useVideoViewer` composable 调用，来自 [`AttachmentCard.vue`](../../tools/llm-chat/components/AttachmentCard.vue)):

  ```vue
  <script setup>
  import { useVideoViewer } from "@/composables/useVideoViewer";

  const { previewVideo } = useVideoViewer();

  const handleVideoClick = (videoUrl: string, title?: string) => {
    previewVideo(videoUrl, title);
  };
  </script>
  ```

---

## 选择器与输入

### AvatarSelector

高级头像选择器，是一个集多种选择方式于一体的强大组件。

- **核心功能**:
  - **预设图标**: 支持从一个可搜索、可分类的图标库中选择。
  - **图片上传**: 支持拖拽或点击上传本地图片，图片会自动存入 AppData 并返回 `appdata://` 协议的引用。
  - **历史记录**: 自动记录用户最近使用过的头像，方便快速复用。
  - **响应式布局**: 自动适应不同的容器宽度。

- **Props**:
  - `modelValue` (string): 当前头像路径。
  - `entityId` (string): 实体 ID（用于上传路径隔离）。
  - `profileType` ('agent' | 'user'): 实体类型。

- **使用示例** (来自 [`UserProfileForm.vue`](../../views/Settings/user-profile/components/UserProfileForm.vue)):

  ```vue
  <script setup>
  import AvatarSelector from "@/components/common/AvatarSelector.vue";
  import type { IconUpdatePayload } from "@/components/common/AvatarSelector.vue";

  const handleIconUpdate = (payload: IconUpdatePayload) => {
    formData.value.icon = payload.icon;
  };
  </script>

  <template>
    <el-form-item label="头像">
      <AvatarSelector
        :model-value="formData.icon || ''"
        :entity-id="formData.id"
        profile-type="user"
        @update:model-value="handleIconUpdate"
      />
    </el-form-item>
  </template>
  ```

### IconPresetSelector

预设图标选择器，支持分类过滤和搜索。

- **Props**:
  - `icons` (PresetIconInfo[]): 图标数据列表。
  - `showSearch` (boolean): 显示搜索栏。
  - `showCategories` (boolean): 显示分类标签。

- **使用示例** (来自 [`ModelMetadataSettings.vue`](../../views/Settings/model-metadata/ModelMetadataSettings.vue)):

  ```vue
  <script setup>
  import IconPresetSelector from "@components/common/IconPresetSelector.vue";
  import { presetIcons } from "@/config/preset-icons";

  const handleIconSelect = (iconPath: string) => {
    selectedIcon.value = iconPath;
  };
  </script>

  <template>
    <IconPresetSelector :icons="presetIcons" @select="handleIconSelect" />
  </template>
  ```

### LlmModelSelector

LLM 模型下拉选择器，按服务商分组，支持按能力（如 vision, tool_use）筛选模型。

- **Props**:
  - `modelValue` (string): 格式为 `profileId:modelId`。
  - `capabilities` (Partial<ModelCapabilities>): 需要的模型能力。

- **使用示例** (来自 [`EditAgentDialog.vue`](../../tools/llm-chat/components/agent/EditAgentDialog.vue)):
  ```vue
  <el-form-item label="模型" required>
    <LlmModelSelector v-model="editForm.modelCombo" />
  </el-form-item>
  ```

### ModelSelectDialog

弹窗式的 LLM 模型选择器，提供更详细的模型信息和筛选功能。通常配合 `useModelSelectDialog` 使用。

- **使用示例** (来自 [`MessageMenubar.vue`](../../tools/llm-chat/components/message/MessageMenubar.vue)):

  ```vue
  <script setup>
  import { useModelSelectDialog } from "@/composables/useModelSelectDialog";

  const { open: openModelSelectDialog } = useModelSelectDialog();

  const handleModelChange = async () => {
    const currentSelection = `${currentProfileId}:${currentModelId}`;
    const result = await openModelSelectDialog(currentSelection);
    if (result) {
      // result 格式为 "profileId:modelId"
      const [profileId, modelId] = result.split(":");
      // 处理选择结果...
    }
  };
  </script>
  ```

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

- **使用示例** (来自 [`RequestPanel.vue`](../../tools/api-tester/components/RequestPanel.vue)):

  ```vue
  <!-- 基础用法 -->
  <RichCodeEditor v-model="store.requestBody" language="json" editor-type="monaco" />

  <!-- Diff 模式 (来自 TextDiff.vue) -->
  <RichCodeEditor
    ref="richCodeEditorRef"
    :diff="true"
    :original="leftContent"
    :modified="rightContent"
    editor-type="monaco"
    language="plaintext"
  />
  ```

### DocumentViewer

多格式文档查看器，智能识别并渲染 Markdown、HTML、代码或二进制文件占位。

- **Props**:
  - `content` (string | Uint8Array): 文档内容。
  - `fileName` (string): 文件名（用于推断语言）。
  - `editorType`: 默认使用的编辑器引擎。
  - `showEngineSwitch`: 是否显示切换引擎的按钮。

- **使用示例** (来自 [`DocumentViewerTester.vue`](../../tools/component-tester/components/DocumentViewerTester.vue)):

  ```vue
  <!-- Markdown 预览 -->
  <DocumentViewer :content="markdownContent" file-name="README.md" />

  <!-- JSON 源码视图（带引擎切换） -->
  <DocumentViewer
    :content="jsonContent"
    file-name="config.json"
    editor-type="monaco"
    :show-engine-switch="true"
  />
  ```

---

## 其他

### DetachPreviewHint

用于窗口拖拽分离时的视觉提示组件（显示“松手创建窗口”等提示）。通常配合 `useDetachable` 使用。

- **Props**:
  - `visible` (boolean): 是否显示。

- **使用示例** (来自 [`DetachedWindowContainer.vue`](../../views/DetachedWindowContainer.vue)):

  ```vue
  <script setup>
  import DetachPreviewHint from "../components/common/DetachPreviewHint.vue";

  const isPreview = ref(false);
  </script>

  <template>
    <!-- 预览模式提示 -->
    <DetachPreviewHint :visible="isPreview" />
  </template>
  ```
