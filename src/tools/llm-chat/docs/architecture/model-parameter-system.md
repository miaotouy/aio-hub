# 模型参数配置系统 (Model Parameter System)

为了应对日益复杂的模型能力差异，系统构建了一套分层、动态且高度可扩展的参数配置引擎（核心类型定义见 [`types/llm.ts`](../../types/llm.ts) 中的 `LlmParameters`），实现了从基础采样、结构化输出、原生工具调用到多模态输出与上下文后处理的全方位控制。

## 1. 分层配置架构

### 1.1 基础采样参数 (Basic Sampling)

标准化的采样控制，如 `temperature`、`maxTokens`、`topP`、`topK`、`frequencyPenalty`、`presencePenalty`、`seed`、`stop`（停止序列）。

### 1.2 高级参数 (Advanced)

进阶控制选项，包括 `n`（响应数量）、`logprobs` / `topLogprobs`、`maxCompletionTokens`（替代 `maxTokens`，优先级更高）、`logitBias`（标记偏差）、`store`（蒸馏存储开关）、`user`（用户标识符）、`serviceTier`（服务层级 `auto`/`default`/`flex`）、`streamOptions`（流式选项，如 `includeUsage`）、`metadata`（请求级元数据键值对）。

### 1.3 思考能力 (Thinking)

标准化的推理能力控制体系。

- **统一抽象**: 将不同厂商（Claude, Gemini, DeepSeek 等）的推理参数抽象为统一的 `thinkingEnabled` (开关)、`thinkingBudget` (预算)、`reasoningEffort` (等级，主要用于 o 系列模型)，并通过 `includeThoughts`（Gemini）控制是否返回思考摘要。
- **智能适配**: 根据模型元数据 (`capabilities`) 自动渲染适配的 UI 控件（如滑块或下拉框）。
- **参数联动**: 实现了 `thinkingBudget` 与 `maxTokens` 的自动联动逻辑，确保总 Token 上限始终能容纳推理预算。
- **思考解析**: 配合 `llmThinkRules`，系统可以精准提取并单独展示模型的推理过程，支持折叠和样式定制。

### 1.4 结构化输出 (Response Format)

- **`responseFormat`**: `{ type: 'text' | 'json_object' | 'json_schema', json_schema?: { name, schema, strict? } }`，用于约束模型输出为指定 JSON Schema 的结构化数据。

### 1.5 原生工具调用 (Native Tool Calling)

- **`tools`**: `Array<{ type: 'function', function: { name, description?, parameters?, strict? } }>`，向 LLM 声明可调用的函数列表。
- **`toolChoice`**: `'none' | 'auto' | 'required' | { type: 'function', function: { name } }`，控制工具选择策略。
- **`parallelToolCalls`**: `boolean`，是否允许模型在一次响应内并行返回多个工具调用。
- **注意**: 此处的原生工具调用参数与"工具调用系统"协同工作；具体注入哪些工具由 `toolCallConfig` 与上下文管道中的工具宏决定。

### 1.6 多模态输出 (Modalities)

- **`modalities`**: `Array<'text' | 'audio'>`，声明模型本次响应应输出哪些模态。
- **`audio`**: `{ voice, format }`，音频输出参数（voice 支持 `alloy`/`ash`/`ballad`/`coral`/`echo`/`fable`/`nova`/`onyx`/`sage`/`shimmer`；format 支持 `wav`/`mp3`/`flac`/`opus`/`pcm16`）。
- **`prediction`**: `{ type: 'content', content: string | Array<{ type: 'text', text }> }`，预测输出配置（Predicted Outputs），用于加速可预测内容的生成。

### 1.7 联网搜索 (Web Search)

- **`webSearchEnabled`**: `boolean`，统一的联网搜索开关，各 Provider 自动适配。
- **`webSearchOptions`**: OpenAI 高级配置，包含 `searchContextSize` (`'low' | 'medium' | 'high'`) 与 `userLocation`（含 `approximate.city/country/region/timezone`）。

### 1.8 上下文管理 (Context Management)

- **`contextManagement`**: `{ enabled, maxContextTokens, retainedCharacters? }`，允许为特定模型设置独立的上下文长度上限与截断时的头部保留字符数。
- **实时统计**: 集成 `ContextStatsCard`,实时计算并显示当前会话的上下文消耗与剩余空间。

### 1.9 上下文后处理管道 (Context Post-Processing) ★

- **`contextPostProcessing`**: `{ rules: ContextPostProcessRule[] }`，对最终发送给 LLM 的消息列表执行格式转换的规则列表，按数组顺序依次执行。
- **`ContextPostProcessRule`**: `{ type: string, enabled: boolean, [key]: any }`，`type` 对应注册到 `contextPipelineStore` 中的处理器 ID（如 `post:merge-system-to-head`、`post:merge-consecutive-roles`、`post:ensure-alternating-roles`、`post:convert-system-to-user`），允许处理器扩展自有配置项（如分隔符、用户占位符等）。
- **协同关系**: 与 priority 800 的 `message-formatter` 配套使用，由各 Agent / 模型默认值合并决定具体启用哪些规则。详见 [`context-post-processing.md`](./context-post-processing.md)。

### 1.10 图片压缩 (Image Compression) ★

- **`imageCompression`**: `{ enabled, maxDimension?, format: 'original' | 'jpeg' | 'webp', quality }`，发送前对图片附件进行用户侧压缩与尺寸缩放，节省 Token 与带宽。`quality` 为 0.1~1.0 的有损质量参数（对 `original` 无效）。详见 [`image-compression.md`](./image-compression.md)。

### 1.11 上下文压缩 (Context Compression)

压缩配置位于 `contextCompression` 字段，允许按 Agent/Session 进行精细化控制。详见 [`context-compression.md`](./context-compression.md)。

### 1.12 厂商专属配置 (Provider Specific)

- **Gemini**: `safetySettings` 数组，按 `HARM_CATEGORY_*` 维度配置安全过滤阈值（`BLOCK_NONE` / `BLOCK_ONLY_HIGH` / `BLOCK_MEDIUM_AND_ABOVE` / `BLOCK_LOW_AND_ABOVE` / `OFF` 等）。
- **Claude**: `stopSequences`（Claude 专用停止序列数组）、`claudeMetadata`（`{ user_id? }`，附加在请求中的元数据）。

### 1.13 自定义参数 (Custom)

`custom: { enabled: boolean, params: Record<string, any> }`，允许用户直接透传任意非标准 API 参数，并提供 UI 开关，确保对新模型特性的零日支持。

## 2. 显式启用列表 (Enabled Parameters)

通过 `enabledParameters: Array<keyof Omit<LlmParameters, 'custom'>>` 显式声明本次请求要发送的参数白名单。当存在此字段时，只有列入白名单的字段会被实际发送给 LLM API；不存在时回退到旧行为（发送所有非 `undefined` 的参数）。这避免了因隐式默认值污染请求体而引发的兼容性问题。

## 3. 动态能力适配 (`ModelParametersEditor`)

编辑器位于 [`components/agent/parameters/ModelParametersEditor.vue`](../../components/agent/parameters/ModelParametersEditor.vue)，由 [`config/parameter-config.ts`](../../config/parameter-config.ts) 中的 `parameterConfigs` 表驱动，配合 [`ParameterItem.vue`](../../components/agent/parameters/ParameterItem.vue) 渲染单条参数。

### 3.1 参数分组动态过滤

每个参数携带 `group: "basic" | "advanced" | "special"` 与 `supportedKey` 字段，由 [`shouldShowParameter()`](../../components/agent/parameters/ModelParametersEditor.vue:249) 与 `getSupportedParameters(providerType)` 联合裁剪——某 `supportedKey` 在该 Provider 上为 `false` 时整条参数隐藏，从而避免给不支持的 Provider 展示无用项。

### 3.2 思考能力控件三态切换

所有思考参数共享 `supportedKey: "thinking"`，最终控件类型完全由模型 `capabilities.thinkingConfigType` 决定（**不是简单的"滑块 vs 下拉"二选一**）：

- `"switch"` → 仅显示 `thinkingEnabled` 开关，不暴露任何细粒度控件；
- `"budget"` → 显示 `thinkingEnabled` 开关，并在 `thinkingEnabled === true` 时**追加显示 `thinkingBudget` 滑块**；
- `"effort"` → 隐藏开关，显示 `reasoningEffort` 下拉，选项由 `capabilities.reasoningEffortOptions` **动态注入**（前面加一条 `"默认" → ""` 兜底，见 [`processedConfigs`](../../components/agent/parameters/ModelParametersEditor.vue:218)）；
- `"none"` 或缺省 → 整组思考参数都不显示；
- `includeThoughts`（Gemini 思考摘要回传）单独走 `supportedKey: "thinkingConfig"` 检查 Provider 支持，与上述三态正交。

### 3.3 `thinkingBudget` ↔ `maxTokens` 联动

由 [`ModelParametersEditor.vue`](../../components/agent/parameters/ModelParametersEditor.vue) 中三个独立的 `watch` 实现，常量 `THINKING_OUTPUT_BUFFER = 4096`（推理后留给最终回答的预算）：

1. `watch(thinkingBudget)`：当 `budget + 4096 > maxTokens` 时，自动把 `maxTokens` 抬高到 `min(budget + 4096, maxTokensLimit)`，保证 Claude 等模型要求的 `max_tokens > budget_tokens`。
2. `watch(maxTokens)`：当 `maxTokens - budget < 1024`（最小缓冲）时反向调低 `thinkingBudget = max(1024, maxTokens - 1024)`，避免推理预算挤掉所有输出空间。
3. `watch(thinkingEnabled)`：开关从 false 切到 true 时执行一次初始检查，必要时把 `maxTokens` 抬到 `currentBudget + 4096`。

三条 watch 都受 `capabilities.thinkingConfigType === "budget"` 守护，对 `switch` / `effort` 类型模型完全短路。

### 3.4 `maxTokensLimit` 动态计算

取 `tokenLimits?.output → contextLengthLimit → 131072` 三级回退，并通过 `overrides` 在 `ParameterItem` 上覆盖 `max` 属性；同时 `watch(contextLengthLimit)` 在上下文限制变小时自动把超限的 `maxTokens` / `contextManagement.maxContextTokens` 调回新上限。

### 3.5 厂商专属配置的条件渲染

- **Gemini `safetySettings`**: 由 [`showSafetySettings`](../../components/agent/parameters/ModelParametersEditor.vue:409) 计算属性控制——`supportedParameters.safetySettings === true` 或 `getModelFamily(modelId, providerType) === "gemini"` 任一成立即显示 [`SafetySettingsPanel`](../../components/agent/parameters/SafetySettingsPanel.vue)。
- **Claude `stopSequences` / `claudeMetadata`**: 这两个参数**不走单独的厂商面板**，而是在 [`ALL_LLM_PARAMETER_KEYS`](../../config/parameter-config.ts:11) 白名单中作为标准参数与 `temperature` 等并列；UI 显示与否完全由 `enabledParameters` 白名单和参数表的 `supportedKey` 共同决定，没有专门的"Claude 配置区"。

### 3.6 `enabledParameters` 白名单 UI

**没有独立的"启用列表编辑器"面板**，而是把启用/停用开关直接内嵌到每个 [`ParameterItem`](../../components/agent/parameters/ParameterItem.vue) 的右上角 `el-switch`（受 `hideSwitch` 控制，少数固定项如 `maxContextTokens` 隐藏开关默认启用）。状态由 [`isParameterEnabled()`](../../components/agent/parameters/ModelParametersEditor.vue:136) 与 [`toggleParameterEnabled()`](../../components/agent/parameters/ModelParametersEditor.vue:143) 双向管理，开关切换会立刻把 key 加入 / 移出 `enabledParameters` 数组；最终发送给 LLM 时由 [`buildEffectiveParameters()`](../../config/parameter-config.ts:406) 严格按白名单过滤。

### 3.7 `enabledParameters` 智能初始化

首次加载或外部 `modelValue` 变化时，[`initLocalParams()`](../../components/agent/parameters/ModelParametersEditor.vue:83) 会检测 `enabledParameters` 字段——不存在则取所有"已有非 undefined 值且不属于 custom"的 key 自动构造白名单，兼容旧版未带白名单的 Agent 配置，避免在升级后误把已设值的参数置为"未启用"。

## 4. 推理状态精确回放 (Reasoning Artifacts)

针对 DeepSeek、Gemini 和 OpenAI Responses 等提供商专属的推理状态，系统引入了统一的推理状态回放机制：

- **数据与展示分离**: 引入 `LlmReasoningArtifact` 类型，将不透明的 API 推理状态（如 Gemini 的 `thought` 签名 parts、OpenAI 的 `response.output`）与用于前端展示的 `reasoningContent` 文本分离。
- **精确回放**: 在多轮对话或工具调用时，上下文处理器会保护 `reasoningArtifacts` 不被合并、转换或截断，确保其能被原样回传给 API。
- **安全降级**: 当触发 Token 限制或上下文压缩导致 artifact 被迫丢弃时，系统会记录警告并向用户展示对应的丢弃状态提示。

## 5. 空回复诊断系统 (Empty Response Diagnostics)

当 LLM API 响应成功但未返回任何可见文本时，系统通过 `emptyResponseDiagnostics` 模块进行启发式扫描与诊断：

- **启发式扫描**: 递归扫描响应对象，过滤掉已知的元数据字段（如 ID、模型、结束原因等），寻找隐藏的非空 string 字段、未展示的工具调用或拒绝字段。
- **元数据存储**: 诊断出的异常信息存储在消息节点的元数据（`metadata.emptyResponseDiagnostics`）中，避免污染后续的 LLM 对话上下文。
- **UI 友好展示**: 在消息元数据区域直观展示诊断报告，并提供一键复制功能，方便用户排查 API 异常。
