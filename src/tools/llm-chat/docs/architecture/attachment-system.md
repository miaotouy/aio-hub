# 附件系统 (Attachment System)

附件系统支持真实文件与消息内文本材料。真实文件通过统一的 Asset 管理系统存储和去重；文本附件以 `virtualAttachments` 保存标题和全文，由草稿或消息持有。

## 消息内文本附件

- 单次粘贴默认达到 6,000 Unicode 字符时转换成文本卡片，可在输入设置中关闭或调整阈值；输入区也支持手动创建。
- `VirtualTextAttachment` 包含 `id`、`kind: "text"`、`title`、`text`。草稿保存于聊天专用 `input-drafts.json`；发送后全文保存于对应消息，跟随会话导出和恢复。
- 草稿卡片支持编辑、移除、插入正文、复制和另存文件。历史消息支持预览、保存到当前消息或新分支；保存进入现有会话历史与同步通道。
- 管道通过 `message-text` 来源接收材料，在文本提取阶段组装全文。关闭转写仍保留文本材料，Token 预览与模型请求共用文本包装函数。
- 草稿、消息和复制出来的分支持有独立快照。跨窗口草稿编辑由主窗口检查原版本后保存；发送完成仅清理已提交且未继续改动的草稿。
- 迁移时先读取旧 localStorage 草稿，写入聊天草稿文件成功后清理旧数据。单份材料上限为 16 MiB（UTF-8），超过 1 MiB 提示确认。

类型见 `types/virtual-attachment.ts`，卡片与编辑器见 `components/VirtualTextAttachments.vue`，实施设计见 [长文本粘贴与虚拟文本附件](../Plan/virtual-text-attachments.md)。

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

### 3.1. 多模态转写模式与增强

- **文档转写 OCR 模式**: 针对扫描版 PDF、双栏排版或大体积文档，系统支持在 LLM 智能解析与 OCR 纯文字提取之间切换。通过 `DocumentSpecificConfig` 配置，可将 PDF 转换为图片后调用 Smart OCR 引擎进行文字识别。
- **图片转写本地 OCR 模式**: 支持图片转写切换为本地 OCR 引擎模式（如 Tesseract/Native/Cloud/Plugin），作为视觉大模型（VLM）的平替方案，满足高速度与零消耗场景。
- **强制重新转写**: 允许用户无视当前转写状态，对所有附件强制重新发起转写任务。

### 3.2. 总开关与自动重试边界

- **总开关最高优先级**: `settings.transcription.enabled` 关闭时，`transcription-processor` 直接短路，`useTranscriptionManager` 不创建任务、不等待在途任务、也不把既有转写文本注入上下文，消息侧的"将使用转写"判断返回否。附件按原始形态处理。
- **自动重试策略**: 发送时的自动补建任务（`shouldAutoCreateTranscriptionTask`）只针对 `none` 状态，`error` 视为终态，历史上下文重建时不会对失败附件重复发起任务；手动重试与强制重转仍直接调用 `addTask`。
- **失败降级**: 当模型本身依赖转写时（`shouldUseFailedTranscriptionFallback`），终态失败的附件降级为文本占位（`[附件未发送给模型: name（转写失败）]`）。

以上策略集中在 [`utils/transcriptionRetryPolicy.ts`](../../utils/transcriptionRetryPolicy.ts)，供 `useTranscriptionManager` 与 [`attachment-resolver.ts`](../../core/context-utils/attachment-resolver.ts) 共享。

## 4. 附件容器的响应式布局

附件列表的"响应式"采用最简方案——**纯 Flex 换行**，不使用 CSS Grid、也不使用 Container Query：

- **统一容器样式**: 所有挂载点（消息内容 / 输入框 / 编辑模式 / 树图节点 / 上下文分析器）共享同一套 `.attachments-list` 样式：`display: flex; flex-wrap: wrap; gap: 8~12px`（见 [`MessageContent.vue:1427`](../../components/message/MessageContent.vue:1427)、[`MessageInputAttachments.vue:125`](../../components/message-input/MessageInputAttachments.vue:125)、[`StructuredView.vue:1962`](../../components/context-analyzer/StructuredView.vue:1962)）。
- **列数自适应规则**: **不存在显式的列数控制**。每个 [`AttachmentCard`](../../components/AttachmentCard.vue) 按 `size` prop 渲染固定宽度（`small: 52px` / `medium: 80px` / `large: 120px` / `extra-large: 100%`），靠 `flex-wrap: wrap` 在父容器宽度变化时自然换行，因此"每行几个"完全由父容器的可用宽度与卡片宽度之比决定。
- **窄屏 / 分离窗口窄态**: **没有专门的单列回退媒体查询**，依赖 flex 自然换行 —— 当容器宽度小于一张卡片宽度时自动单列显示。长条布局额外通过 `min-width: 160px; max-width: 320px` 兜住极窄场景，避免文件名等元信息被压扁；图片卡片由于宽度固定，窄容器下天然单列。
- **气泡模式协同**: 截至当前实现，气泡模式与卡片模式**共用同一套 `.attachments-list` 样式**，没有在 CSS 层做差异化（即气泡内 vs 气泡外的附件网格行为一致），仅气泡外宽度更大时一行能排更多卡片，是布局算法的副作用而非显式策略。

## 5. H5 原生文件拖放支持

核心拖放引擎 `useFileDrop` 支持 H5 原生拖放事件与 Tauri 拖拽拦截器的双信号融合去重，解决拦截器禁用后无法获取文件绝对路径的问题，允许各工具直接通过字节流导入 File 对象。
