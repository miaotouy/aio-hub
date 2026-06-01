# 附件系统 (Attachment System)

附件系统允许用户在消息中添加文件，实现多模态对话。它基于统一的 Asset 管理系统进行文件存储和去重。

## 1. 智能文件类型检测

- **实现位置**: 全部在**前端**完成，由 [`src/utils/fileTypeDetector.ts`](../../../../utils/fileTypeDetector.ts) 提供 `detectFileType(path, fileName)` 入口，[`useAttachmentManager.handleFile()`](../../composables/features/useAttachmentManager.ts:337) 在导入时调用。
- **魔数检测**: 使用 [`file-type`](https://www.npmjs.com/package/file-type) 库的 `fileTypeFromBuffer`，通过 Tauri `@tauri-apps/plugin-fs` 的 `readFile` 读取文件前 **4100 字节**（库推荐最小值）做魔数识别。
- **安全过滤**: 外部受限路径（不在 `com.mty.aiohub` 或 `AppData` 下的绝对路径）直接跳过魔数读取，避免触发 Tauri 的 `forbidden path` 错误。
- **回退策略**: 魔数检测失败或返回 null 时，回退到扩展名映射表 [`MIME_TYPE_MAP`](../../../../utils/fileTypeDetector.ts:46)；再失败则使用 `application/octet-stream` 作为兜底 MIME 类型。

## 2. 多类型支持与展示策略

### 2.1 图片 (Image)

在 [`AttachmentCard.vue`](../../components/AttachmentCard.vue:454) 中通过 `useImageViewer().show(imageUrls, currentIndex)` 触发全局图片查看器（基于 Viewer.js）。预览前会从 `allAssets` 过滤出所有 `type === 'image'` 的附件并按消息原始顺序构建 URL 列表，**多图预览的前/后按钮、缩略图条、键盘导航（←/→/Esc）、滚轮缩放等交互全部由 Viewer.js 内置提供**，本模块不再二次封装。

### 2.2 视频 (Video)

通过 `useVideoViewer().previewVideo(asset, { poster })` 打开模态视频查看器（[`VideoViewer`](../../../../components/common/VideoViewer.vue) 内嵌 [`VideoPlayer`](../../../../components/common/VideoPlayer.vue)），支持倍速、画中画、截图、快捷键控制；缩略图作为 `poster` 传入以减少首帧延迟。

### 2.3 音频 (Audio)

通过 `useAudioViewer().previewPlaylist(audioAssets, currentIndex)` 将同条消息内的所有音频组成播放列表，支持封面、波形与歌词。

### 2.4 文本 (Text)

在 [`attachment-resolver.ts`](../../core/context-utils/attachment-resolver.ts:43) 中，当 `asset.type === 'document' && isTextFile(name, mime)` 时调用 `assetManagerEngine.getAssetBinary` 取二进制，再用 [`smartDecode(buffer)`](../../../../utils/encoding.ts) 智能识别编码（UTF-8 / GBK / GB18030 / Big5 等，基于 BOM 与启发式判定），最终格式化为 `\n[文件: {name}]\n\`\`\`\n{textContent}\n\`\`\`\n` 后作为消息文本发送给 LLM；**全程不经过 Base64**，节省 Token 与编码开销。

### 2.5 文档 (Document)

在 [`asset-resolver.ts:processDocumentAsset`](../../core/context-processors/asset-resolver.ts:77) 中处理，格式选择**完全由模型 `capabilities.documentFormat` 决定**（`'base64' | 'openai_file'`），**与文件大小无关**：

- `'base64'`：Claude / Gemini / 默认行为，输出 `{ type: 'document', source: { type: 'base64', media_type, data } }`。
- `'openai_file'`：OpenAI Responses 协议（`file_url` / `file_id` / `file_data` 三种 source 形态），**当前实现尚未完全支持，运行时会打 warn 日志并临时回退到 base64**（见 [`asset-resolver.ts:111-114`](../../core/context-processors/asset-resolver.ts:111)）。
- **PDF 特殊路径**：当 `mimeType === 'application/pdf' && !capabilities.document && capabilities.vision` 时，asset-resolver 会现场调用 [`convertPdfToImages(buffer)`](../../../../utils/pdfUtils.ts) 把 PDF 转成图片序列发送，作为视觉降级方案。

### 2.6 其他类型 (Other)

AttachmentCard 通过计算属性 `isBarLayout = computed(() => !isImage)` 决定布局——**只要不是图片，全部走长条布局**（视频/音频/文档/未知类型都共用）。CSS 实现位于 [`AttachmentCard.vue`](../../components/AttachmentCard.vue:1253) 的 `.attachment-card.is-bar-layout` 与 `.bar-layout-container`：横向 `display: flex` + 36×36 文件图标 + 文件名 + 元信息行（大小 / 扩展名 / Token / 转写状态），`min-width: 160px; max-width: 320px`。

## 3. 转写协作

与独立的 `transcription` 工具深度集成。当模型不具备原生多模态能力时，系统可自动触发转写流程（详见 [`context-pipeline.md`](./context-pipeline.md) 中的转写处理器章节）。

## 4. 附件容器的响应式布局

附件列表的"响应式"采用最简方案——**纯 Flex 换行**，不使用 CSS Grid、也不使用 Container Query：

- **统一容器样式**: 所有挂载点（消息内容 / 输入框 / 编辑模式 / 树图节点 / 上下文分析器）共享同一套 `.attachments-list` 样式：`display: flex; flex-wrap: wrap; gap: 8~12px`（见 [`MessageContent.vue:1427`](../../components/message/MessageContent.vue:1427)、[`MessageInputAttachments.vue:125`](../../components/message-input/MessageInputAttachments.vue:125)、[`StructuredView.vue:1962`](../../components/context-analyzer/StructuredView.vue:1962)）。
- **列数自适应规则**: **不存在显式的列数控制**。每个 [`AttachmentCard`](../../components/AttachmentCard.vue) 按 `size` prop 渲染固定宽度（`small: 52px` / `medium: 80px` / `large: 120px` / `extra-large: 100%`），靠 `flex-wrap: wrap` 在父容器宽度变化时自然换行，因此"每行几个"完全由父容器的可用宽度与卡片宽度之比决定。
- **窄屏 / 分离窗口窄态**: **没有专门的单列回退媒体查询**，依赖 flex 自然换行 —— 当容器宽度小于一张卡片宽度时自动单列显示。长条布局额外通过 `min-width: 160px; max-width: 320px` 兜住极窄场景，避免文件名等元信息被压扁；图片卡片由于宽度固定，窄容器下天然单列。
- **气泡模式协同**: 截至当前实现，气泡模式与卡片模式**共用同一套 `.attachments-list` 样式**，没有在 CSS 层做差异化（即气泡内 vs 气泡外的附件网格行为一致），仅气泡外宽度更大时一行能排更多卡片，是布局算法的副作用而非显式策略。
