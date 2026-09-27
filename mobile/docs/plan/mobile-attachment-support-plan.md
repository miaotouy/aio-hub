# 移动端附件支持整合计划

> **文档状态**: 现状盘点与施工队列；附件 3 的 `assetGroups` 分组与 `{{assets}}` 宏已施工（2026-09-26），其余条目规划中（已含桌面端对照）
> **创建日期**: 2026-09-26
> **涉及模块**: `mobile/src/tools/llm-chat/`、`mobile/src/tools/agent-manager/`、`mobile/src/tools/asset-manager/`、`mobile/src/components/media/`、`packages/llm-core/`
> **关联文档**: 移动端 [`mobile-media-components-plan.md`](./mobile-media-components-plan.md)、[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)、[`mobile-character-card-parity-plan.md`](./mobile-character-card-parity-plan.md)、[`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)、[`mobile-development-checklist.md`](./mobile-development-checklist.md)；桌面端 [`src/tools/llm-chat/docs/architecture/attachment-system.md`](../../../src/tools/llm-chat/docs/architecture/attachment-system.md)

## 1. 定位

移动端附件基础设施已经成熟：全局资产内核（`asset_manager.db` + 内容寻址去重 + usage/tombstone）、跨工具 `ManagedAssetRef` 轻量引用、受管短期预览 descriptor、`MediaPreviewHost` 媒体组件、Agent 私有资产目录与私有附件运行时均已落地。

本文**不重开上述范围**，只收拢「附件在正式聊天与 Agent 场景中可用、可见、正确送达模型」的剩余缺口，作为跨模块施工队列。资产内核与媒体组件的实现细节仍以各自计划与 `ARCHITECTURE.md` 为准。

## 2. 移动端现状与证据（消费者视角）

| 链路 | 现状 | 关键证据 |
| --- | --- | --- |
| 全局聊天附件发送 | 选资产（`assetId + usagePolicy + 轻量快照`）或聊天内直接导入 → `attachment-preparer` 校验可用性 → `buildMessageContent` 转 `LlmMessageContent`（source 为 `managed-asset-ref`）→ Rust 原生传输解析为字节/流 | `components/AssetPickerSheet.vue`、`core/pipeline/processors/attachment-preparer.ts:63`、`utils/attachmentContent.ts:4`、`src-tauri/src/llm_file_transport.rs:580` |
| 附件可用性状态 | `getAssetDetail` 查 `AssetAvailability`，5s 缓存 + 并发去重，映射 reclaimed/missing | `utils/attachmentStatus.ts:9` |
| 文档文本回退 | 快照 `extractedText` 或替换缓存存在时生效；新选纯文本类附件在确认选择前按需写入快照 | `attachment-preparer.ts:24`、`tools/asset-manager/services/assetTextSnapshotService.ts`、`tools/asset-manager/services/assetTextReplacementService.ts:90` |
| 发送前预处理 | 基本直接按 kind 转 part，无「按模型能力选择文本化/转写/转图」的决策层 | `utils/attachmentContent.ts:4` |
| Agent 私有附件 | 预设/开局附件经 `injection-assembler`/`session-loader` 归一化为 `_privateAttachments`，`preset-attachment-processor`（priority 850）从 `agents/{id}/` 读取：图片内联 vision、文本内联回退、音视频降级描述 | `core/context-utils/preset-attachment-resolver.ts:416`、`core/pipeline/processors/preset-attachment-processor.ts:46` |
| 附件宏 `{{assets}}` | 已纳入 Agent 私有附件并支持 `{{assets::group}}` / `{{assets::default}}` 过滤；全局附件摘要与顺序不变；移动端不引入 `agent-asset://` | `core/pipeline/processors/macros-renderer.ts:217`、`agent-manager/types/agent.ts:111` |
| 媒体预览 | `MediaPreviewHost` + 三个子组件 + `useManagedMediaPreview` 已接入资产详情、正式消息附件、RichText 受管节点 | `components/media/`、`components/MessageContent.vue:207`、`rich-text-renderer/RichTextRenderer.vue:580` |
| 正式消息附件呈现 | 对齐桌面端 AttachmentCard：图片方形缩略图卡，音频/视频/文档/其它横条卡片，点击走统一受控预览；输入区 chip 带缩略图/类型图标 | `components/MessageContent.vue`、`components/ChatInput.vue`、`components/AttachmentThumbnail.vue` |
| 资产管理器 | 导入 job、列表/筛选/详情、预览、导出/分享、删除影响、缓存清理、启动恢复均已落地 | `tools/asset-manager/`、`asset-manager/ARCHITECTURE.md:48` |

## 3. 桌面端（PC）对照

### 3.1 Provider wire：两端共用 `@aiohub/llm-core`，缺口同源

PC 的 `src/llm-apis/adapters/*/chat.ts` 只是薄封装，最终调用 `@aiohub/llm-core` 的 `openAiCompatibleAdapter` / `anthropicMessagesAdapter` / `googleGenerateContentAdapter` / `cohereChatAdapter`（`src/llm-apis/adapters/openai/chat.ts:70`、`src/composables/useLlmRequest.ts:446`），并**原样透传 source**（`src/llm-apis/adapters/openai/chat.ts:282`）。

移动端同样走共享 core（`mobile/src/tools/llm-api/core/adapters/openai-compatible.ts` 的 `toOpenAiCompatibleCoreRequest`）。因此以下 wire 缺口**两端共有**：

- 音频：`input_audio.data` 只读 `source.data`，`format` 仅 `wav`/`mp3`，其它格式被错标（`packages/llm-core/src/providers/openai-compatible.ts:431`）。
- 视频：映射为 `image_url` + `video_metadata`（`openai-compatible.ts:444`）。
- 文档：非 PDF、非图片的 document 输出非标准 `{ type: "document", source }`（`openai-compatible.ts:474`）。
- Anthropic：audio/video 无分支，被静默丢弃（`packages/llm-core/src/providers/anthropic-messages.ts:422-478`）。
- OpenAI Responses：有 `input_file`/`input_audio` 路径（`openai-responses.ts:536-568`），可作为支持原生文档/音频模型的优先通道。

结论：这是 `packages/llm-core` 的**共享修复项**，不应在移动端单独打补丁。

### 3.2 发送前预处理：PC 的规避层是移动端缺的部分

PC 在进入 provider 前按模型能力做了决策，显著降低了对 wire 缺口的依赖：

- **文档**按 `capabilities.documentFormat`（`base64` / `openai_file`）选择形态；`openai_file` 未实现时回退 base64（`src/tools/llm-chat/core/context-processors/asset-resolver.ts:98-147`）。
- **PDF** 在「无原生 document 能力但有 vision」时现场 `convertPdfToImages` 转图片序列（同上）。
- **非 PDF 文档**（docx/pptx/xlsx）在进入 provider 前解析为文本（`core/context-utils/attachment-resolver.ts:136-193`）。
- **纯文本**用 `smartDecode` 多编码识别后按 `\n[文件: name]\n```\n{text}\n```\n` 注入，全程不走 base64（`attachment-resolver.ts:108-134`）。
- **音频**按模型能力原样发送或转写（`attachment-resolver.ts:195-254`），并有独立 `transcription` 工具协作。
- **图片**做安全缩放/压缩（`asset-resolver.ts:32-93`）。

移动端目前没有等价决策层，`buildMessageContent` 只按 kind 机械转换，这是附件 1 在移动端的主要落差。

### 3.3 消息呈现：PC 用 `AttachmentCard`

PC 消息气泡遍历 `message.attachments` 渲染 `AttachmentCard`（`src/tools/llm-chat/components/message/MessageContent.vue:977`）：图片方形缩略图、视频内联封面、非图片横条文件卡，附 Token 计数、转写状态与导入进度；点击走 `useImageViewer`/`useVideoViewer`/`useAudioViewer`/`DocumentViewer`（`components/AttachmentCard.vue`）。该组件依赖 Element Plus、Viewer.js、Tauri `convertFileSrc` 和桌面缩略图后端。

### 3.4 Agent 私有资产与宏

- `AssetGroup` 是**分组元数据**（id/displayName/description/icon/sortOrder），`AgentAsset.group` 归类（`src/tools/agent-manager/types/agent.ts:55-94`）。
- `{{assets}}` 宏支持按 `group` 过滤，并生成 `agent-asset://{group}/{id}.{ext}` 引用（`src/tools/llm-chat/macro-engine/macros/assets.ts:27-115`）。
- 预设附件解析从 `agent.assets` 按 `assetId` 构造 `source.kind="agent-private"`（`core/context-utils/preset-attachment-resolver.ts:89`）。

移动端 `assetGroups` 仍是 `unknown[]` 占位；但移动端预设附件解析（按 assetId/path/filename 定位）比 PC 仅按 assetId 更强。

### 3.5 数据契约与传输：平台差异

| 维度 | 桌面端 | 移动端（Keep） |
| --- | --- | --- |
| 持久化 | 消息直接存完整 `Asset`（含 `path`），整对象序列化 | `ManagedAssetRef { assetId, snapshot }`，禁止路径入业务数据 |
| 读取 | JS 侧 `getAttachmentBuffer` 读成 ArrayBuffer 再 base64（`core/context-utils/attachment-binary.ts:34`） | `managed-asset-ref` 交 Rust 原生流式解析（`transports/mobile.ts:206`） |
| 缺失处理 | catch 后跳过；转写失败降级文本 | `availability` 分区 + `extractedText` 回退 + Rust 复核 managed/ready |

## 4. 施工队列

### 附件 1：附件形态正确性（优先）

**1a. `packages/llm-core` 共享 wire 修复（跨端）**
修正音频仅 wav/mp3、视频当 `image_url`、非 PDF document 非标准、Anthropic 丢弃 audio/video；优先让支持原生文档/音频的模型走 OpenAI Responses 的 `input_file`/`input_audio`。两端共用，修复一处两端受益，需桌面端确认。入口：`packages/llm-core/src/providers/*`。

**1b. 移动端发送前预处理决策层（参考 PC）**
在 `buildMessageContent` 之前按模型能力决策：文本类先 `smartDecode` 文本化不走 base64；非 PDF 文档可文本化；PDF 在无 document 能力但有 vision 时转图片序列；音频按能力原样发送或转写；图片按需压缩。入口：`mobile/src/tools/llm-chat/utils/attachmentContent.ts` 上游新增处理器，参照 `src/tools/llm-chat/core/context-utils/attachment-resolver.ts`、`core/context-processors/asset-resolver.ts`。

### 附件 2：正式聊天附件呈现（参考 PC 信息结构）— 已完成

- [x] 消息附件区对齐桌面端 `AttachmentCard`：图片用方形缩略图卡，音频/视频/文档/其它用横条卡片（图标 + 名称 + 元信息），点击可预览者打开播放器/查看器；不在附件区内联播放器。输入区 chip 加缩略图/类型图标。
- [x] 采用移动端 `MediaItem`/`MediaPreviewHost`，借鉴 PC `AttachmentCard` 的信息层级（缩略图、大小、状态），**不照搬组件**。
- [x] 保持 reclaimed/missing 只读降级语义：非 `ready` 附件不申请 descriptor，仍显示原状态标签与文件卡片。

实现：新增 `components/AttachmentThumbnail.vue`（受管方形缩略图/类型图标，视口懒加载）与 `composables/useLazyManagedThumbnail.ts`（descriptor 生命周期）；`MessageContent.vue` 按桌面端 `AttachmentCard` 结构重排附件区（图片方形缩略图卡、非图片横条卡片，可预览附件点击由 `MediaPreviewHost` `sheet` 打开），`ChatInput.vue` chip 加缩略图/类型图标。未修改媒体组件公共契约。

入口：`components/MessageContent.vue`、`components/ChatInput.vue`；对应 checklist 队列 B。真实设备手势与长列表表现仍属附件 5 后置验证。

### 附件 3：Agent 私有附件高级能力（参考 PC）

- [x] 把 `assetGroups` 从占位转为 `AgentAssetGroup` 元数据（`id`/`displayName`/`description`/`icon`/`sortOrder`）+ `AgentAsset.group`，用于管理与分组；导入器归一化并无损保留，旧 `unknown[]` 数据不崩溃（2026-09-26）。
- [x] `{{assets}}` 宏纳入 Agent 私有附件并支持按分组过滤（`{{assets::group}}`，`{{assets::default}}` 对齐桌面未分组/无效分组语义）；全局附件摘要与输出顺序保持不变（2026-09-26）。**移动端不引入 `agent-asset://{group}/{id}` 引用协议**：没有对应 resolver，私有资产只输出 `[类型] 文件名 (handle: id)` 可读文本，不产生可解析引用。
- [ ] 私有音频/视频按 provider 能力进入请求，无法表达时保留显式降级（仍后置，见附件 1a / 1b）。
- [ ] Agent 资产管理 UI（移动端暂无该页面，后置）。

入口：`agent-manager/types/agent.ts:111`、`macros-renderer.ts:217`、`preset-attachment-resolver.ts:416`；参照 `src/tools/llm-chat/macro-engine/macros/assets.ts`。对应 parity 计划批次 4 剩余项。

### 附件 4：附件回退与输入体验（参考 PC）

**已实施（2026-09-26）**

- 聊天内 `AssetPickerSheet` 接入资产导入入口：复用 `asset-manager/services/assetImportEntry.ts`（封装系统文件选择器、媒体选择器与相机，沿用 import job），导入完成后刷新可选列表；不新建资产页面，不直接触碰 `asset_manager.db`。
- 可选列表仍只列 visible/ready 资产，选择结果仍只写 `assetId + 轻量快照`，不写路径或系统 URI。
- 窄范围文本快照回退：确认选择前对纯文本类附件（`text/*`、`application/json`、`application/xml`、`text/yaml`、`text/csv` 或已知文本扩展名）按需调用 `asset_extract_text`，写入 `snapshot.extractedText`；超过原生 2 MiB 读取上限跳过，超过 20 万字符截断，非文本、提取失败或超限均不阻断添加并 warning。实现见 `asset-manager/services/assetTextSnapshotService.ts`。
- `attachment-preparer` 沿用既有快照/替换缓存回退逻辑，未改动发送 wire 与 `packages/llm-core`。

**后置（缺少现成依赖，未新增库）**

- docx/pptx/xlsx 深度解析（参照 PC `attachment-resolver.ts:108-193`）：移动端无 mammoth/xlsx 一类依赖，本轮不做，不新增第三方库。
- 文件类型魔数检测（参照 `src/utils/fileTypeDetector.ts`）：当前只用 MIME 与扩展名判定纯文本，魔数检测后置。

入口：`components/AssetPickerSheet.vue`、`attachment-preparer.ts`、`asset-manager/services/assetTextSnapshotService.ts`、`asset-manager/services/assetImportEntry.ts`。

### 附件 5：平台验证（后置，不阻塞施工）

- Android 真机资产主流程、媒体手势/方向/安全区/设备音频/长媒体、iOS 资产能力。
- 上游真实模型附件发送验收尚未通过（`asset-manager/ARCHITECTURE.md:121`）。

## 5. 优先级与依赖

1. **附件 1a**（跨端正确性前置，两端共享）。
2. **附件 1b**（移动端预处理决策，降低对 1a 的依赖，两者可部分并行）。
3. **附件 2**（用户可见，独立于 1）。
4. **附件 3**（角色卡衔接，分组宏/私有音视频依赖 1 的结论）。
5. **附件 4**（健壮性，独立）。
6. **附件 5**（功能链稳定后集中处理）。

## 6. 平台差异（不照搬 PC）

- 数据契约：移动端坚持 `assetId + snapshot`，不把路径/URI 写入业务数据（`mobile/AGENTS.md`）。
- 传输：保持 `managed-asset-ref` + Rust 原生流式解析，不反向移植 PC 的 JS 侧 base64 物化。
- UI：基于原生 Vue + AIO Hub token + `MediaPreviewHost`，只借鉴 PC 的信息结构，不复用 Element Plus / Viewer.js / `convertFileSrc` / 桌面缩略图后端。
- 规模与流程：PC 的 100 附件 / 50MB 限制与后端异步导入 stage 流程按移动端平台约束独立设计。
- 移动端预设附件解析（assetId/path/filename 多重定位）优于 PC，不要为对齐而退化。

## 7. 明确边界（不做）

- 不重开资产内核、内容寻址、usage/tombstone、受管预览协议。
- 不接管 Agent 私有资产与全局资产的边界（两者只做显式内容复制，不共享 `assetId`）。
- 不做外部文件长期仅引用模式；不做后台转码中心或复杂文档渲染。
- 相机、分享进入 AIO、文件关联、批量转写/PDF-Office 深度提取继续留在 `asset-manager` Phase 3。
- VCP/表情包 resolver、HTML 白名单/沙箱不属附件支持范围。

## 8. 与现有计划关系

| 本计划批次 | 归属现有计划 |
| --- | --- |
| 附件 1a | 新缺口（`packages/llm-core`），两端共享，需桌面端确认 |
| 附件 1b | `mobile-media-components-plan` / 附件计划新增预处理层 |
| 附件 2 | `mobile-media-components-plan` Phase 3/4、checklist 队列 B |
| 附件 3 | `mobile-character-card-parity-plan` 批次 4 剩余项、`mobile-agent-manager-plan` 后续增强 |
| 附件 4 | `mobile-asset-manager-design` 文本替代与导入入口 |
| 附件 5 | 各计划后置验证队列 |

## 9. 验证口径

- 每批次：`bun run check:frontend` + `bun run test:run`（相关用例）；收尾统一 `bun run build`。
- Provider 形态：以固定 fixture 断言请求 wire 的标准形态，覆盖受管 ref、data URL 与不支持的降级路径。
- 呈现层：类型检查 + 生产构建 + 真实消息界面走查；媒体手势与设备行为仍按后置平台验证处理。
- 涉及 `packages/llm-core` 的改动需同时验证桌面端消费方与移动端。
