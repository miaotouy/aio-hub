# LLM 聚合渠道与模型级适配器路由调查

> 状态：Phase 0–3 已实施；Phase 4–5 待排期
> 调查日期：2026-07-30（OpenCode Go 补充核查：2026-08-06；Phase 0–2 实施：2026-08-06；Phase 3 实施：2026-08-12）
> 范围：桌面端、移动端（尚未发布）、`@aiohub/llm-core`、渠道导入导出、模型发现与探测  
> 本地参考仓库：`E:\git\new-api`、`E:\git\sub2api`、`E:\git\cherry-studio`

## 1. 结论

给 LLM 渠道增加“聚合渠道”类型的方向是成立的，但**不能直接把它实现为新增一个 `ProviderType = "aggregate"`，再给 `LlmModelInfo` 增加单个 `adapterType` 字段**。

当前真正缺少的前置能力是：

1. **模型执行路由（model execution routing）**：在运行时根据“渠道 + 模型 + 操作类型”统一解析实际使用的线协议适配器。
2. **渠道身份与线协议解耦**：`profile.type` 目前同时承担渠道预设、模型列表协议、请求适配器、鉴权头、参数过滤和展示语义，聚合渠道会打破这个一对一关系。
3. **模型发现结果中的端点能力保真**：模型列表解析目前会保留原始响应，但不会把 `supported_endpoint_types` 一类信息带入可持久化模型对象。
4. **探测结果可应用**：现有模型探测已经能临时切换 OpenAI Chat、Responses、Anthropic Messages、Gemini GenerateContent 等端点，但结果只能查看，不能写回模型路由。
5. **按操作类型绑定，而不是单一适配器**：同一模型可能同时支持 Chat、Responses、Embedding、Image 或 Rerank，单个 `adapterType` 会把不同能力错误地压成一个选择。

推荐先建立一个向后兼容的统一解析入口：

```ts
resolveModelExecution(profile, model, operation);
```

它至少应返回实际 `adapterId`、有效端点、有效参数方言和用于调用的 profile 视图。桌面端聊天、探测、Embedding、Rerank 和媒体生成调用先收口到这里。**移动端目前尚未发布，无需历史兼容路径**，Phase 1 完成后直接对接新解析器，不需要兼容垫片，可列为 Phase 1 尾项或 Phase 2 前置。之后再增加聚合渠道类型和模型路由编辑 UI。

## 2. 外部实现调查

### 2.1 New API

本地 `E:\git\new-api` 当前分支同时暴露多种客户端协议：

- `/v1/chat/completions`：OpenAI Chat Completions
- `/v1/responses`：OpenAI Responses
- `/v1/messages`：Anthropic Messages
- `/v1beta/models/*`：Gemini 原生协议
- `/v1/embeddings`、`/v1/rerank`、图片和音频等独立能力端点

对应路由见 `E:\git\new-api\router\relay-router.go:69-152`。

该仓库的模型列表对象还包含：

```json
{
  "id": "...",
  "owned_by": "...",
  "supported_endpoint_types": [
    "openai",
    "openai-response",
    "anthropic",
    "gemini"
  ]
}
```

字段定义见 `E:\git\new-api\dto\pricing.go:6-12`，写入逻辑见 `E:\git\new-api\controller\model.go:153-169`。

它的 `Advanced Custom` 渠道进一步证明了“路由必须按入口路径和模型匹配”的必要性：每条 route 同时包含 `incoming_path`、`upstream_path`、`converter`、`models` 和独立鉴权设置，见 `E:\git\new-api\dto\channel_settings.go:82-98`。这不是传统的“一渠道对应一适配器”模型。

### 2.2 Sub2API

Sub2API 同样在一个服务地址上注册了多种兼容路由，但实际行为还受 API Key 所属 Group 的 `platform` 影响：

- `/v1/messages`
- `/v1/responses`
- `/v1/chat/completions`
- `/v1/embeddings`
- `/v1/images/*`
- `/v1beta/models/*` 与 Gemini 原生操作

见 `E:\git\sub2api\backend\internal\server\routes\gateway.go:110-220`。

`/v1/models` 根据当前 Group platform 返回模型；OpenAI、Gemini 和 Anthropic 的默认回退列表也不同，见 `E:\git\sub2api\backend\internal\handler\gateway_handler.go:992-1044`。因此，对 Sub2API 来说，模型适配器既可能来自用户选择，也可能受 Key/Group 的服务端配置约束。AIO Hub 不能只通过模型名称猜测协议。

### 2.3 Cherry Studio 的 New API 兼容实现

本地 Cherry Studio 已实现了与本设想非常接近的方案，可作为先例：

- Provider 有独立的 `new-api` 类型。
- Model 保存 `endpoint_type` 和 `supported_endpoint_types`，见 `E:\git\cherry-studio\src\renderer\src\types\index.ts:283-324`。
- 模型列表保留 New API 返回的 `supported_endpoint_types`，见 `E:\git\cherry-studio\src\renderer\src\services\models\ModelAdapter.ts:116-145`。
- 运行时根据模型的 `endpoint_type` 选择 Anthropic、Gemini、OpenAI Responses 或 OpenAI 客户端，见 `E:\git\cherry-studio\src\renderer\src\aiCore\legacy\clients\newapi\NewAPIClient.ts:47-87`。
- 新版 provider 配置同样会把 New API provider 临时解析成具体 provider type，见 `E:\git\cherry-studio\src\renderer\src\aiCore\provider\config\newApi.ts:9-49`。

但该实现也暴露了不应照搬的限制：

1. `endpoint_type` 是单值，不能自然表达“同一模型的 Chat 使用 Responses、Embedding 使用 Embeddings、Image 使用 Image Generation”。
2. 导入模型时若支持图片端点，会优先选择 `image-generation`，见 `E:\git\cherry-studio\src\renderer\src\pages\settings\ProviderSettings\ModelList\ManageModelsPopup.tsx:130-145`；这说明单一默认端点会把“能力支持”和“默认聊天协议”混在一起。
3. 未识别的端点类型会被剪掉。AIO Hub 更适合同时保留原始声明和已识别映射，避免未来新增协议后丢失信息。

### 2.4 OpenCode Go

OpenCode Go 是比 New API/Sub2API 更直接的内置预设候选，同时也进一步证明了模型级执行路由是前置能力，而不是可选优化。

截至 2026-08-06，官方 Go 文档（页面标注最近更新于 2026-08-05）公开了同一服务根地址下的三种请求协议：

- OpenAI Chat Completions：`https://opencode.ai/zen/go/v1/chat/completions`
- OpenAI Responses：`https://opencode.ai/zen/go/v1/responses`
- Anthropic Messages：`https://opencode.ai/zen/go/v1/messages`

官方模型表明确要求按模型选择端点：多数 Grok、GLM、Kimi、DeepSeek、MiMo 和 Hy 模型走 Chat Completions；`gpt-5.6-luna` 走 Responses；MiniMax 与 Qwen 的部分模型走 Anthropic Messages。模型列表端点 `https://opencode.ai/zen/go/v1/models` 则只返回标准 OpenAI 风格的 `id/object/created/owned_by`，没有 `supported_endpoint_types` 或等价路由字段。

因此 OpenCode Go 属于**非自描述聚合渠道**：

1. 不能把整个渠道固定为 `openai-compatible`、`openai-responses` 或 `claude` 中的任意一种，否则只能正确覆盖部分模型。
2. 不能仅依赖模型列表响应自动生成 binding；首版预设需要随应用维护一份官方模型到 adapter 的内置路由表。
3. 对内置表尚未认识的新模型，应标记为“待选择/待探测”，禁止仅凭模型名称静默猜测协议。
4. 认证也随协议变化：Chat/Responses 使用 Bearer，Messages 使用 `x-api-key`；应由解析后的实际 adapter 负责生成请求头，而不是在渠道层硬编码单一鉴权方言。

套餐边界也需要谨慎表述。官方文档说明“每个工作空间只能有一名成员订阅”，并按 5 小时、每周、每月的美元使用额度限流；它没有公开声明“接入客户端数量无限”。API Key 可以被兼容客户端直接调用，但 AIO Hub 的预设说明不应宣传“不限客户端”，更准确的文案是“提供标准兼容 API，可供外部客户端接入；所有调用共享工作空间/API Key 的 Go 配额”。

落地建议：将 OpenCode Go 作为 Phase 4 的首个内置 `aggregateFlavor`/预设验收样例，但在 Phase 1 resolver、Phase 2 模型路由持久化以及最小可用的内置 route table 之前，不直接新增单渠道预设。临时兼容只能拆成 Chat Completions、Responses、Anthropic Messages 三个渠道，体验与密钥管理都不理想。

官方参考：

- `https://opencode.ai/docs/zh-cn/go/`
- `https://opencode.ai/zen/go/v1/models`
- `https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/chat/completions.ts`
- `https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/responses.ts`
- `https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/messages.ts`

## 3. AIO Hub 当前耦合点

### 3.1 `profile.type` 是运行时唯一适配器键

桌面端统一请求入口在验证模型后直接执行：

```ts
const adapter = adapters[effectiveProfile.type];
```

见 `src/composables/useLlmRequest.ts:142-175`。主聊天、Embedding 和媒体能力均沿用该 profile 级选择。

同样的直接选择还存在于：

- `src/llm-apis/embedding.ts`
- `src/llm-apis/embedding-core.ts`
- `src/tools/recall/utils/vectorCache.ts`
- `src/views/Settings/llm-service/probe/channel-probe-service.ts`
- 移动端 `mobile/src/tools/llm-api/composables/useLlmRequest.ts:52-71`（**尚未发布，迁移无历史兼容负担，可直接对接新解析器**）

如果只在桌面 `useLlmRequest` 中增加模型级分支，Embedding、Recall、模型探测、媒体生成和移动端仍会走渠道级适配器，最终形成不一致行为。

### 3.2 `ProviderType` 混合了至少六类职责

当前 `LlmProfile.type` 会影响：

1. 渠道创建 UI 和预设文案。
2. 默认 Base URL 与渠道特有配置字段。
3. 模型列表 URL、鉴权头和响应解析。
4. 请求/响应适配器选择。
5. 参数过滤和 Provider 特有参数处理。
6. 日志、Inspector、消息元数据与部分图标/展示逻辑。

相关入口包括：

- `src/types/llm-profiles.ts:24-45`、`434-462`
- `src/config/llm-providers.ts`
- `src/llm-apis/model-fetcher.ts:36-83`
- `src/llm-apis/request-builder.ts:814-947`
- `src/llm-apis/adapters/index.ts:78-110`

聚合渠道的“渠道身份”是 New API/Sub2API，而某次请求的“线协议”可能是 OpenAI Chat、Responses、Anthropic 或 Gemini。继续让一个字段表达两者会产生大量临时改写 `profile.type` 的代码。

### 3.3 模型的 `provider` 字段不能复用

`LlmModelInfo.provider` 当前定义为模型所属提供商标识，主要用于图标和展示，见 `src/types/llm-profiles.ts:293-321`。它可能是 `openai`、`anthropic`、`google` 或模型列表返回的 `owned_by`，并不表示请求应使用哪种线协议。

例如一个 `owned_by = anthropic` 的 Claude 模型完全可能只开放 OpenAI Chat 兼容端点。把 `provider` 当适配器会再次制造错误耦合。

### 3.4 模型列表解析丢失端点提示

共享 Core 的 `ProviderModelInfo` 有 `raw`，但没有结构化的端点支持字段，见 `packages/llm-core/src/types/model-list.ts:11-26`。

OpenAI 风格模型解析只提取 owner、上下文、模态、参数和价格，见 `packages/llm-core/src/providers/model-list.ts:118-149`；桌面映射到 `LlmModelInfo` 时也不会读取 raw 中的 `supported_endpoint_types`，见 `src/llm-apis/model-fetcher.ts:99-150`。

因此即使 New API 已明确返回每个模型支持的端点，AIO Hub 目前仍会丢掉该信息，只能依赖用户再次手工判断。

### 3.5 探测层已经有“临时路由”，但没有稳定领域模型

现有 Probe 支持：

- `openai-chat`
- `openai-responses`
- `anthropic-messages`
- `gemini-generate-content`
- `embeddings`
- `jina-rerank`
- `image-generation`

见 `src/views/Settings/llm-service/probe/types.ts:15-23` 和 `probe/endpoint-options.ts:18-89`。

`resolveProbeTarget()` 会复制 profile、临时修改 `type`，并调整对应自定义端点，见 `probe/endpoint-options.ts:160-199`。这已经是一个原型版的 route resolver，但它仅服务 Probe，且结果没有“应用到模型”的入口。`ModelProbeDialog.vue` 只发出 `test` / `batch` 事件并展示结果，没有持久化操作。

### 3.6 单一模型 ID 暂时只容纳一个默认路由

大量业务配置通过 `(profileId, modelId)` 引用模型。若允许同一模型以多个独立适配器实例重复出现，当前引用无法区分它们。

首期应优先采用“一个模型对象，按操作类型保存默认 binding”的方式，而不是复制多个同 ID 模型。只有当产品明确需要让用户在模型选择器中同时看到“GPT-5 / Chat”和“GPT-5 / Responses”两个独立项时，才需要引入稳定的 `routeId` 并升级所有模型引用结构。

## 4. 推荐领域模型

### 4.1 先定义协议适配器 ID

适配器 ID 应表达线协议，而不是厂商品牌或渠道来源。例如：

```ts
type LlmAdapterId =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content"
  | "cohere-chat"
  | "vertex-google"
  | "vertex-anthropic"
  | "openai-embeddings"
  | "jina-rerank"
  | "openai-image-generation";
```

现有 `ProviderType` 可以在迁移期映射到默认 adapter，但不应继续被视为 adapter ID。

### 4.2 路由必须按操作类型保存

推荐的数据结构方向：

```ts
type LlmOperation =
  "chat" | "embedding" | "rerank" | "image" | "audio" | "video" | "music";

interface ModelRouteBinding {
  adapterId: LlmAdapterId;
  endpointType?: string;
  endpoint?: string;
  source?: "manual" | "discovered" | "probe" | "profile-default";
}

interface LlmModelRouting {
  bindings?: Partial<Record<LlmOperation, ModelRouteBinding>>;
  supportedEndpointTypes?: string[];
  discoveredAt?: string;
}

interface LlmModelInfo {
  // existing fields...
  routing?: LlmModelRouting;
}
```

设计要点：

- `supportedEndpointTypes` 表达服务端声明的“可用集合”。
- `bindings` 表达用户或系统最终选择的“实际默认路由”。
- 未识别的 endpoint type 仍保留在原始数组中，只是不自动映射成 adapter。
- 首期允许只编辑 `chat` binding，但数据结构不要锁死为单值。

### 4.3 建立唯一解析入口

推荐新增共享解析器，桌面和移动端共同使用：

```ts
resolveModelExecution({
  profile,
  model,
  operation,
}): {
  adapterId: LlmAdapterId
  effectiveProfile: LlmProfile
  endpoint?: string
  routeSource: "manual" | "discovered" | "profile-default"
}
```

**该解析器应实现在 `@aiohub/llm-core` 包中，不在桌面侧单独实现后再移植**；这保证桌面和移动端共用同一份代码，Phase 1 结束时不会遗留两套解析逻辑。

建议优先级：

1. 模型该 operation 的手工 binding。
2. 用户明确确认过的 Probe 结果。
3. 发现结果中唯一且已识别的可用端点。
4. 渠道类型映射出的默认 adapter。
5. 无法唯一判断时提示用户选择，禁止按模型名静默猜测协议。

`effectiveProfile` 仅作为迁移期兼容现有适配器的内部视图；长期应让适配器显式接收协议配置，不再依赖伪造的 `profile.type`。

### 4.4 聚合渠道只负责渠道级默认值

未来的聚合渠道类型应主要定义：

- 展示名称与说明。
- 默认模型列表协议和端点。
- 默认鉴权方式。
- endpoint type 到 adapter ID 的映射表。
- 没有模型级 binding 时的回退协议。
- 是否支持读取 `supported_endpoint_types` 等扩展字段。

它不应自己实现一套巨型 adapter。运行时仍复用 OpenAI、Responses、Anthropic、Gemini 等现有协议适配器。

## 5. 建议实施顺序

### Phase 0：产出稳定契约

Phase 1 能否无争议地推进，完全取决于本阶段产出以下四份文档/定义，**全部就绪并经桌面、移动端、llm-core 三方确认后**，才能开始 Phase 1 代码改动：

1. **`LlmAdapterId` 枚举草稿**：只覆盖现有已知线协议，不预留未来扩展位。
2. **`ProviderType → { defaultAdapterId, defaultOperation }` 映射表**：每个现有渠道类型对应的默认 adapter 和默认 operation；此表是 Phase 1 resolver 初始版本的地基，一旦定错后续所有 binding 都会漂移。
3. **`resolveModelExecution()` 函数签名**：TypeScript interface，含入参和返回值类型，不含实现；冻结后不允许 Phase 1 期间单方面修改。
4. **桌面调用点清单与测试策略**：列出桌面 + packages 所有直接调用 `adapters[profile.type]` 的位置，并为每个调用点确定迁移前的"行为快照"方案；移动端尚未发布，本阶段暂不纳入。

契约决策：使用 operation-level bindings（不是单一 `adapterType`）；首期不允许同模型多个可见路由（避免引入 `routeId`）；endpoint type 内外部值之间保留映射层，不直接让外部字符串成为核心 adapter ID。

### Phase 1：抽取统一运行时解析器，不改变现有行为

**前提**：Phase 0 四份产出全部就绪并确认后再动代码。

1. 在 `@aiohub/llm-core` 中新增 `LlmAdapterId`、`LlmOperation` 和 `resolveModelExecution()` 实现；**不允许在桌面侧单独实现后再移植**，否则 Phase 1 结束时仍会遗留两套解析逻辑。
2. 按 Phase 0 映射表为每个现有 `ProviderType` 注册默认 adapter 映射。
3. **迁移每个调用点前，先按 Phase 0 方案为该调用点建立行为快照/回归测试**；测试覆盖到位后再替换调用，不在迁移完成后统一补测。
4. 将桌面聊天、Embedding、Recall、Probe 和媒体生成的直接 `adapters[profile.type]` 调用迁移到解析器。
5. Inspector 和日志同时记录 `channelType` 与 `effectiveAdapterId`。
6. 移动端 `useLlmRequest` 迁移列为本阶段尾项或 Phase 2 前置；移动端尚未发布，可直接对接新 resolver，不需要任何兼容垫片。

本阶段所有旧桌面 profile 的行为必须完全不变，是聚合渠道功能的真正前置施工。

### Phase 1 实施记录（2026-08-06）

已新增共享 `LlmAdapterId` / `LlmOperation` / `LlmModelRouting` 契约与 `resolveModelExecution()` 实现，默认渠道路径保留原始 `profile.type`，因此未改变旧渠道的 URL、鉴权、参数方言或特化 adapter 行为。桌面聊天、Embedding、Recall 与 Probe 的 adapter 选择，以及移动端聊天分发，均已先经过共享 resolver；桌面 Inspector 与日志同时记录渠道类型、实际 adapter、operation 和路由来源。

Phase 1 完成时未提供模型路由编辑或服务端端点声明持久化；`routing` 先作为兼容读取的可选结构。详细契约、默认映射、调用点与回归策略见 [`LLM 模型执行路由契约`](../architecture/llm-execution-routing.md)。

### Phase 2：模型结构与发现链路

1. 在共享 `ProviderModelInfo` 增加 `supportedEndpointTypes?: string[]`。
2. OpenAI 风格模型解析识别 `supported_endpoint_types`。
3. 桌面和移动端映射到 `LlmModelInfo.routing`。
4. 更新模型刷新/合并策略，区分“远端声明”“用户 binding”和“本地能力元数据”，刷新时不得覆盖用户选择。
5. 补渠道包导入导出验证和迁移测试。

这一步应与现有模型元数据优化计划保持边界：路由 binding 是运行时执行配置，不属于全局模型元数据规则，不能在每次请求时从全局规则回退合并。

### Phase 2 实施记录（2026-08-06）

共享 `ProviderModelInfo` 与 OpenAI 风格模型列表解析现已保留服务端的 `supported_endpoint_types`，包括当前未知的字符串值；桌面与移动端在模型对象的 `routing.supportedEndpointTypes` 和 `discoveredAt` 中持久化这份远端声明。模型列表刷新仅替换远端端点声明，保留既有的手工/Probe `bindings` 与本地 `capabilities` 等模型配置。渠道包对 routing 执行结构校验，但不拒绝未知 endpoint 或 adapter 字符串；未知 adapter 在当前 resolver 中安全回退到渠道默认路由，数据仍可导出和后续恢复。

### Phase 3：手工分配与 Probe 应用

1. 模型编辑器增加"请求协议/适配器"区域。
2. 聚合渠道模型列表展示当前 binding 和服务端支持集合。
3. 支持批量设置 Chat binding。
4. Probe 成功后提供"应用到该模型"与"应用到选中模型"。
5. 当发现多个可用 Chat 协议时不擅自选择；允许渠道设置默认优先级。

### Phase 3 实施记录（2026-08-12）

- 共享解析器新增 `listAdaptersForOperation()` 与 `resolveAdapterIdForEndpointType()`，供路由编辑器与探测结果转换复用；解析优先级与旧渠道行为不变。
- 模型编辑器新增"请求协议 / 适配器"区域（`ModelRoutingEditor`）：按模型已声明能力逐操作编辑 binding（对话恒可编辑，Embedding / Rerank / 图片 / 音频 / 视频 / 音乐跟随能力开关出现），支持绑定专用端点与重置；同时展示服务端声明端点集合和当前生效路由（binding → 唯一发现端点 → 渠道默认）。
- 模型列表展示每个模型的 Chat 绑定与服务端声明端点集合，并提供"批量设置协议"入口：一次为全部模型设置 Chat binding（`source: manual`），覆盖已有 Chat 绑定但不触碰其他操作与模型列表解析。
- 模型检查对话框在成功结果后可"应用成功结果到选中"或逐行应用：结果转换为对应 operation 的 probe binding（仅当端点类型可映射且能力匹配），"auto" 结果、失败结果与未知端点不提供应用入口，不猜测协议；应用需用户显式点击。
- 写入模型路由时仅覆盖对应 operation 的 binding，保留 `supportedEndpointTypes` / `discoveredAt` 与其他 operation 绑定；旧渠道包与旧模型数据不受影响。

### Phase 4：增加聚合渠道类型

建议至少区分：

- `new-api`：理解 `supported_endpoint_types`，模型列表默认走 OpenAI `/v1/models`。
- `sub2api`：默认按 Key/Group platform 工作；没有端点声明时使用渠道默认或 Probe。
- `aggregate-compatible`：通用手工模式，不假设服务端扩展字段。

是否需要三个独立 ProviderType 可在实施时再决定，也可以表现为一个 `aggregate` 类型加 `aggregateFlavor` 配置。无论 UI 如何命名，底层都必须复用同一 route resolver。

### Phase 5：多能力路由与高级兼容

1. 为 Embedding、Rerank、Image 等 operation 开放独立 binding。
2. 支持每个 binding 的自定义 endpoint 和必要的鉴权覆盖。
3. 若确有需求，再引入 `routeId` 支持同模型多个可见路由变体。
4. 增加端点健康状态、最近 Probe 时间和失败回退策略；不要在没有明确用户策略时自动跨协议重试，避免重复计费和非幂等副作用。

## 6. 主要影响面

| 领域          | 主要文件/目录                                                        | 必须处理的问题                                                           |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 类型与持久化  | `src/types/llm-profiles.ts`、`src/composables/useLlmProfiles.ts`     | 路由字段、默认值、迁移与用户值保留                                       |
| 共享 Core     | `packages/llm-core/src/types/*`、`providers/model-list.ts`           | adapter ID、operation、发现字段与解析                                    |
| 桌面请求      | `src/composables/useLlmRequest.ts`、`src/llm-apis/*`                 | 统一 execution resolver，移除直接 profile.type 分发                      |
| Probe         | `src/views/Settings/llm-service/probe/*`                             | 复用 resolver、应用结果、记录 route source                               |
| 设置 UI       | `src/views/Settings/llm-service/components/*`                        | 单模型/批量路由编辑、冲突提示                                            |
| 参数系统      | `src/llm-apis/request-builder.ts`                                    | 使用 effective adapter/parameter dialect，而不是只看 profile.type        |
| 媒体与 Recall | `src/tools/media-generator/*`、`src/tools/recall/*`                  | 按 operation 解析，不走聊天默认 binding                                  |
| 移动端        | `mobile/src/tools/llm-api/*`                                         | 尚未发布，Phase 1 尾项或 Phase 2 前置；直接对接新 resolver，无需兼容垫片 |
| 导入导出      | `src/utils/llm-profile-transfer.ts`、`src/utils/llm-config-import/*` | 新字段校验、未知值保留、向后兼容                                         |
| 可观测性      | Inspector、消息 metadata、日志                                       | 同时展示渠道类型与实际 adapter                                           |

## 7. 验收场景

### 7.1 向后兼容

- 所有旧桌面渠道不配置 routing 时，请求 URL、Headers、Body 和响应解析与当前完全一致。
- 旧渠道包可直接导入，新渠道包中未知 adapter/endpoint type 给出可恢复提示，不导致整包数据丢失。
- 移动端尚未发布，不存在历史数据需要兼容；移动端实现直接使用新 resolver，与桌面共用同一 `@aiohub/llm-core` 实现。

### 7.2 New API

在同一个 profile、base URL 和 API Key 下：

- GPT 模型可绑定 OpenAI Chat。
- 另一个 GPT/推理模型可绑定 OpenAI Responses。
- Claude 模型可绑定 Anthropic Messages。
- Gemini 模型可绑定 Gemini GenerateContent。
- `/v1/models` 返回的 `supported_endpoint_types` 能显示并保存。
- 服务端声明多个端点时，用户选择不会在模型刷新后被覆盖。

### 7.3 Sub2API

- 依据当前 Key/Group platform 的默认协议可以正常调用。
- 没有端点扩展字段时可通过手工选择或 Probe 建立 binding。
- 选择服务端不支持的协议时，Probe/连接错误能明确指出实际 adapter 和 endpoint。

### 7.4 多能力

- Chat binding 不影响 Embedding binding。
- 图片模型支持 `image-generation` 不会自动把聊天默认路由改成图片端点。
- Rerank 和媒体请求不因 profile 的聊天 adapter 不支持对应方法而错误失败。

## 8. 不建议的实现

1. **只新增 `aggregate` ProviderType 并在一个 adapter 内按模型名判断。** 模型命名可映射、可伪装，也不能表达服务端实际开放的协议。
2. **复用 `LlmModelInfo.provider` 作为 adapter。** 该字段是模型归属/展示语义。
3. **只增加单个 `model.adapterType`。** 它无法处理 Chat、Embedding、Image 等多 operation。
4. **仅修改桌面 `useLlmRequest`。** 会导致 Probe、Recall、Embedding、媒体和移动端行为分裂。
5. **在各调用点临时改写 `profile.type`。** Probe 已证明这种方法能短期工作，但扩散后无法维护和观测。
6. **完全信任 `/v1/models` 一定返回端点声明。** New API 版本、分支和其他聚合程序可能不提供扩展字段，必须保留手工和 Probe 路径。
7. **默认自动跨协议失败重试。** 流式、工具调用和媒体生成可能产生重复计费或非幂等副作用。

## 9. 推荐下一步

Phase 0–3 已完成，下一份施工计划应只覆盖 **Phase 4：增加聚合渠道类型**，暂不开放 Embedding / Rerank / Image 的独立路由编辑之外的自动跨协议重试。

**Phase 4 的完成标准**：新增 `new-api` / `sub2api` / `aggregate-compatible`（或单一 `aggregate` 类型 + `aggregateFlavor`）渠道类型，复用现有 route resolver；渠道级默认优先级（没有模型级 binding 时的回退协议）可配置；OpenCode Go 作为首个内置聚合预设验收样例，模型默认走内置 route table，未收录模型标记"待选择/待探测"而非静默猜测。完成前，OpenCode Go 只能拆分为三个独立渠道使用。
