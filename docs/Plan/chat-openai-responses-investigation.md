# 调查报告：Chat 模块对 openai-responses 上游变更的实际影响

**状态**: Completed (Updated 2026-04-25)
**覆盖范围**: `llm-chat` 下游（`useSingleNodeExecutor` → `useChatResponseHandler`）、`media-generator` 下游

---

## 一、核心架构回顾：差异屏蔽层与调用链路

### 1.1 Chat 的工具调用不走 OpenAI Function Calling

Chat 的完整调用链路：

```
useChatHandler
  └─ useToolCallOrchestrator.orchestrate()
       ├─ [loop] useSingleNodeExecutor.execute()
       │    ├─ contextPipelineStore.executePipeline()   ← 统一上下文管道
       │    └─ useLlmRequest.sendRequest()              ← 统一 LLM 请求层
       │         └─ adapter.chat(profile, options)       ← 适配器（差异已被屏蔽）
       │
       └─ processCycle(responseContent, toolCallConfig) ← VCP 文本协议解析
            ├─ parseToolRequests()   ← 扫描 <<<[TOOL_REQUEST]>>> 标记块
            ├─ executeToolRequests() ← 执行本地工具方法
            └─ formatCycleResults() ← 格式化 <<<[TOOL_RESULT]>>> 结果文本
```

关键证据在 [`useToolCallOrchestrator.ts:125`](src/tools/llm-chat/composables/chat/useToolCallOrchestrator.ts:125)：

```ts
if (executionAgent.toolCallConfig?.enabled && !isVcpChannel) {
  const cycleResult = await processCycle(
    responseContent,   // ← 直接对 LLM 回复的文本内容做解析
    executionAgent.toolCallConfig,
    ...);
```

**结论：Chat 的工具调用完全基于 VCP 文本协议（`<<<[TOOL_REQUEST]>>>` 标记块解析），与 OpenAI Responses API 的 function calling / `image_generation_call` 机制无关。**

### 1.2 `useLlmRequest` 的分发逻辑

[`useLlmRequest.ts:237`](src/composables/useLlmRequest.ts:237) 的分发逻辑：

```ts
if (!forceChatMode && model.capabilities?.imageGeneration && adapter.image) {
  response = await adapter.image(effectiveProfile, filteredOptions);
} else {
  response = await adapter.chat(effectiveProfile, filteredOptions);
}
```

Chat 正常走 `adapter.chat`。`openAiResponsesAdapter` 的 `.chat` 和 `.image` 均指向同一个 `callOpenAiResponsesApi`，仅 options 不同。

---

## 二、现状审计：修复实施情况

Git status 显示 `M`（已修改）的文件：

- `src/llm-apis/adapters/openai/responses.ts`
- `src/tools/llm-chat/composables/chat/useChatResponseHandler.ts`
- `src/tools/llm-chat/composables/chat/useSingleNodeExecutor.ts`
- `src/tools/llm-chat/types/message.ts`
- `src/tools/media-generator/composables/useMediaGenerationManager.ts`

### 2.1 ✅ Fix 1 — `useSingleNodeExecutor.ts`：`onPartialImage` 已补充

[`useSingleNodeExecutor.ts:224-234`](src/tools/llm-chat/composables/chat/useSingleNodeExecutor.ts:224) 已实现：

```ts
onPartialImage: settings.value.uiPreferences.isStreaming
  ? (base64: string, index: number) => {
      if (!session.nodes || !session.nodes[assistantNode.id]) return;
      const node = session.nodes[assistantNode.id];
      if (!node.metadata) node.metadata = {};
      const previews = [...(node.metadata.partialImagePreviews || [])];
      previews[index] = base64;
      node.metadata.partialImagePreviews = previews;
    }
  : undefined,
```

**状态：✅ 已实施。** 预览图存入 `metadata.partialImagePreviews[]`，不会污染正文。

### 2.2 ✅ Fix 2 — `useChatResponseHandler.ts`：`finalizeNode` 已处理 `response.images[]`

[`useChatResponseHandler.ts:317-352`](src/tools/llm-chat/composables/chat/useChatResponseHandler.ts:317) 已实现完整的 `response.images` 处理：

```ts
if (response.images && response.images.length > 0) {
  const { importAssetFromBytes } = await import("@/composables/useAssetManager").then((m) => m.useAssetManager());
  // 遍历 images[].b64_json → atob → Uint8Array → importAssetFromBytes
  // 追加到 finalNode.attachments
}
```

**状态：✅ 已实施。** 图像数据会通过 `importAssetFromBytes` 转换为 Asset 并追加到 `finalNode.attachments`。

### 2.3 ✅ `message.ts` 类型已补充

[`message.ts:243`](src/tools/llm-chat/types/message.ts:243) 已添加：

```ts
/** 流式图像预览（Base64 数组） */
partialImagePreviews?: string[];
```

**状态：✅ 已实施。**

### 2.4 ✅ `media-generator` 侧的 `onPartialImage` 已注入

[`useMediaGenerationManager.ts:157-170`](src/tools/media-generator/composables/useMediaGenerationManager.ts:157) 已实现：

```ts
if (selectedProfile?.type === "openai-responses") {
  (finalOptions as any).onPartialImage = (base64: string, index: number) => {
    const currentTask = mediaStore.getTask(taskId);
    const previews = [...(currentTask?.previewUrls || [])];
    previews[index] = base64;
    mediaStore.updateTaskStatus(taskId, "processing", {
      statusText: `正在生成预览图 ${index + 1}...`,
      previewUrls: previews,
    });
  };
}
```

**状态：✅ 已实施。** 预览图通过 `updateTaskStatus` 的标准 `previewUrls` 字段写入任务状态（已从非标准 `previewImages` 修复为标准字段）。

### 2.5 ✅ Fix 3 — UI 渲染层（partialImagePreviews）已实施

**Chat 侧**：[`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue) 在 `message.status === 'generating'` 且 `message.metadata.partialImagePreviews` 有内容时，渲染滚动预览图区域，使用 `Loader2` 图标和 `imageViewer` 支持点击放大。

**媒体生成侧**：[`MessageContent.vue`](src/tools/media-generator/components/message/MessageContent.vue) 在 `task.status === 'processing'` 时读取 `task.previewUrls` 渲染渐进预览图，带预览角标和点击放大。

**状态：✅ 已实施。** 两个 UI 层均已消费预览图数据。

### 2.6 ✅ Fix 4 — 媒体生成参数面板扩展（partialImages 滑块 + 默认值）已完成

**当前状态**：

| 功能点              | 上游(common.ts) |   参数规则层(sanitizeParams)   |  ParameterPanel UI  |   透传至 sendRequest    |        默认值        |
| ------------------- | :-------------: | :----------------------------: | :-----------------: | :---------------------: | :------------------: |
| `responsesStore`    |    ✅ 已定义    |           ❌ 无规则            |      ❌ 无控件      | ⚠️ 通过`...options`透传 |          ❌          |
| `partialImages`     |    ✅ 已定义    | ✅ 已清理 + `fillDefaults`支持 |  ✅ 滑块控件 (0-3)  |       ✅ 自动透传       |   ✅ `default: 0`    |
| `inputFidelity`     |    ✅ 已定义    |           ✅ 已清理            |     ✅ UI 控件      |       ✅ 自动透传       |  N/A（单选无缺省）   |
| `outputCompression` |    ✅ 已定义    |   ✅ 已清理 + `fillDefaults`   | ✅ 滑块控件 (0-100) |       ✅ 自动透传       |   ✅ `default: 0`    |
| `moderation`        |    ✅ 已定义    |   ✅ 已清理 + `fillDefaults`   |     ✅ 单选控件     |       ✅ 自动透传       | ✅ `default: "auto"` |

**已完成改动**：

1. **类型系统**（`src/types/model-metadata.ts`）：`moderation`、`outputCompression`、`partialImages` 接口均追加了 `default` 字段
2. **模型元数据预设**（`src/config/model-metadata-presets.ts`）：`gpt-image-1` 和 `gpt-image-2` 的规则中添加了 `partialImages: { ..., default: 0 }`、`outputCompression: { ..., default: 0 }`、`moderation: { ..., default: "auto" }`
3. **`useMediaGenParamRules.ts`**：`sanitizeParams` 新增 `fillDefaults` 选项参数，当为 `true` 时会根据规则中的 `default` 值重置参数（对所有支持 `default` 的参数均生效）
4. **`ParameterPanel.vue`**：
   - 模型切换 `watch` 中增加 `sanitizeParams(params, rules, { fillDefaults: true })` 调用，切换模型后自动填充默认值
   - `partialImages` 滑块控件已存在（0-3），使用 `supportsPartialImages` / `maxPartialImages` 计算属性
5. **`types.ts` `MediaTypeConfig.params`**：已追加 `partialImages?: number` 字段

**状态：✅ 已完成（P2）。** 仅 `responsesStore`（P3）待处理。

---

## 三、上游变更对下游的影响矩阵

### 3.1 上游新增能力（↔ 下游影响）

| 新增内容                             |  上游(common.ts + responses.ts)   |                             LLM Chat 下游                             |                       Media Generator 下游                        |
| ------------------------------------ | :-------------------------------: | :-------------------------------------------------------------------: | :---------------------------------------------------------------: |
| `onPartialImage` 流式预览            | ✅ `responses.ts` 已实现事件处理  |      ✅ **数据层已修复** — 存入 `metadata.partialImagePreviews`       |           ✅ **数据层已修复** — 存入任务 `previewUrls`            |
| 预览图 UI 渲染                       |                N/A                | ✅ **UI 层已修复** — `MessageContent.vue` 渲染 `partialImagePreviews` |   ✅ **UI 层已修复** — `MessageContent.vue` 渲染 `previewUrls`    |
| `response.images[]` 处理             | ✅ 已解析 `image_generation_call` |              ✅ **已修复** — `finalizeNode` 导入为 Asset              |   ✅ **已正确处理** — `handleResponseAssets` 即处理 `images[]`    |
| `responsesStore` 参数                |     ✅ 已定义 + 适配器已转发      |                        N/A（Chat 不需此参数）                         |                     ❌ 无 UI 控件，无规则定义                     |
| `partialImages` 参数                 |     ✅ 已定义 + 适配器已转发      |                                  N/A                                  |            ✅ UI 控件 + `sanitizeParams` 规则 + 默认值            |
| `partialImages` 默认值               |        N/A—新增于本次施工         |                                  N/A                                  | ✅ 类型新增 `default` 字段 + 预设 default:0 + `fillDefaults` 逻辑 |
| `inputFidelity` 参数                 |     ✅ 已定义 + 适配器已转发      |                                  N/A                                  |             ✅ UI 控件 + `sanitizeParams` 规则已完备              |
| `outputCompression` 默认值           |        N/A—新增于本次施工         |                                  N/A                                  |            ✅ 类型新增 `default` 字段 + 预设 default:0            |
| `moderation` 默认值                  |        N/A—新增于本次施工         |                                  N/A                                  |         ✅ 类型新增 `default` 字段 + 预设 default:"auto"          |
| `reasoningContent` 推理内容          |             ✅ 已解析             |                    ✅ 流式 + finalize 均已正确处理                    |                                N/A                                |
| `image_generation_call` 工具调用解析 |     ✅ `responses.ts` 已实现      |                 🔶 **无影响** — Chat 走 VCP 文本协议                  |                                N/A                                |

### 3.2 优先级汇总

| 优先级 | 位置                                                                                                 | 问题                                    |                     状态                      |
| ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------- | :-------------------------------------------: |
| **P0** | [`useSingleNodeExecutor.ts:203`](src/tools/llm-chat/composables/chat/useSingleNodeExecutor.ts:203)   | 未传 `onPartialImage`，base64 注入正文  |                 ✅ **已修复**                 |
| **P0** | [`useChatResponseHandler.ts:291`](src/tools/llm-chat/composables/chat/useChatResponseHandler.ts:291) | `finalizeNode` 丢弃 `response.images[]` |                 ✅ **已修复**                 |
| **P2** | [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)                     | Chat 预览图渲染                         |                 ✅ **已实施**                 |
| **P2** | [`MessageContent.vue`](src/tools/media-generator/components/message/MessageContent.vue)              | 媒体生成预览图渲染                      |                 ✅ **已实施**                 |
| **P2** | `ParameterPanel.vue` + 模型元数据 + `sanitizeParams`                                                 | `partialImages` UI 控件 + 默认值        |                 ✅ **已实施**                 |
| **P2** | 类型 `moderation/outputCompression/partialImages`                                                    | 缺少 `default` 字段                     | ✅ **已修复**（类型 + 预设 + `fillDefaults`） |
| **P3** | `ParameterPanel.vue` + 模型元数据                                                                    | `responsesStore` 无 UI 配置入口         |                   ❌ 未实施                   |
| **P3** | [`responses.ts:43`](src/llm-apis/adapters/openai/responses.ts:43)                                    | 适配器内 prompt 注入分支死代码          |                    🔶 无害                    |

---

## 四、未完成项明细

### 4.1 Chat 消息组件 — 流式预览图渲染（P2）

**目标文件**：`src/tools/llm-chat/components/message/ChatMessage.vue`

**当前状态**：`metadata.partialImagePreviews[]` 已有数据但 UI 层未消费。

**实现方案**：在助手消息模板中，当 `message.status === 'generating'` 且 `message.metadata.partialImagePreviews` 有内容时，渲染滚动预览图区域。生成完成后预览图可保留或清理（视产品需求）。

**风险**：低。纯 UI 渲染层改动，不影响数据流。

**实施时机**：与 Chat 消息组件其他 UI 改动一同进行。

### 4.2 媒体生成 — 流式预览图渲染（P2）

**目标文件**：`src/tools/media-generator/components/GenerationStream.vue` 内部的消息列表组件

**当前状态**：`task.previewImages` 已有数据但 UI 层未消费。

**实现方案**：在 `MessageList.vue` 或 `ChatMessage.vue`（`media-generator/components/message/`）中，当任务状态为 `processing` 时，读取 `task.previewImages` 渲染预览图。

**风险**：低。

### 4.3 媒体生成 — `partialImages` 参数面板控件（P2）

**需改动**：

1. **模型元数据预设**：在 `openai-responses` 模型的 `mediaGenParams` 中添加 `partialImages` 规则定义（`supported: true`, `min: 0`, `max: 3`）。
2. **`ParameterPanel.vue`**：参照 `inputFidelity` 的实现模式，添加 `partialImages` 的 UI 控件（数字滑块或选择器，0-3 张）。
3. **`useMediaGenParamRules.ts`**：当前 `sanitizeParams` 已处理 `partialImages` 的清理逻辑（第136-139行），无需额外修改。
4. **`types.ts` `MediaTypeConfig.params`**：可选——追加 `partialImages?: number` 字段以增强类型安全。

### 4.4 媒体生成 — `responsesStore` 参数面板控件（P3）

**需改动**：

1. **模型元数据预设**：在 `openai-responses` 模型的 `mediaGenParams` 中添加 `responsesStore` 规则定义（`supported: true`, `type: "boolean"`）。
2. **`useMediaGenParamRules.ts`**：增加 `responsesStore` 的规则处理和清理逻辑。
3. **`ParameterPanel.vue`**：添加 `responsesStore` 的开关控件（仅在 `openai-responses` 渠道下显示）。
4. **`types.ts` `MediaTypeConfig.params`**：追加 `responsesStore?: boolean`。

---

## 五、已确认无需修改的边界

1. **VCP 工具调用协议** — Chat 走 `<<<[TOOL_REQUEST]>>>` 文本标记，与 OpenAI Responses API 的 function calling 机制完全无关。适配器层 `responses.ts` 中的 function_call 解析仅对 `media-generator` 或其他直接使用适配器的模块有意义。
2. **`useLlmRequest.ts`** — 分发逻辑（`forceChatMode` + `capabilities.imageGeneration`）已正确隔离对话与图像生成路径。
3. **`isVcpChannel` 判断** — `useIsVcpChannel.ts`（第48行）通过 baseUrl 与 wsUrl 的主机对比判断，逻辑独立于适配器类型。
4. **`responses.ts` 中的 `prompt→messages` 死代码** — 虽然对正常调用路径永远不触发，但无害且可作为兜底。

---

## 六、总结

| 模块                                        |                 数据层                  |               UI 层                | 备注               |
| ------------------------------------------- | :-------------------------------------: | :--------------------------------: | ------------------ |
| **Chat 侧** — `onPartialImage` 数据污染     | ✅ 存入 `metadata.partialImagePreviews` | ✅ `MessageContent.vue` 渲染预览图 | 完整链路已打通     |
| **Chat 侧** — `response.images[]` 丢失      |     ✅ `finalizeNode` 导入为 Asset      |  ✅ 自动渲染（现有图片附件机制）   | 用户能看到生成的图 |
| **媒体生成侧** — `onPartialImage` 流式预览  |       ✅ 存入 `task.previewUrls`        | ✅ `MessageContent.vue` 渲染预览图 | 完整链路已打通     |
| **媒体生成侧** — `response.images[]` 丢失   |  ✅ `handleResponseAssets` 已正确处理   |            ✅ 自动展示             | 无问题             |
| **媒体生成侧** — `partialImages` UI 控件    |    ✅ 滑块 (0-3) + `sanitizeParams`     |   ✅ `ParameterPanel.vue` 已实现   | 含默认值 `0`       |
| **媒体生成侧** — `outputCompression` 默认值 |     ✅ 类型 + 预设 + `fillDefaults`     |        ✅ 参数面板已有滑块         | 默认值 `0`         |
| **媒体生成侧** — `moderation` 默认值        |     ✅ 类型 + 预设 + `fillDefaults`     |        ✅ 参数面板已有单选         | 默认值 `"auto"`    |
| **媒体生成侧** — `responsesStore` UI 控件   |              ❌ 无规则定义              |   ❌ `ParameterPanel.vue` 无控件   | P3 低优先级        |

**当前待处理项**：

1. **P3 — `responsesStore` 控件**：低优先级，目前通过 extraBody 可手动配置
2. **P3 — 适配器死代码清理**：`responses.ts:43` 的 prompt 注入分支无害，可保留兜底
