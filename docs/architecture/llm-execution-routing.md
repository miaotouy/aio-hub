# LLM 模型执行路由契约

> 状态：Phase 0–4 已实施（Phase 0–2：2026-08-06；Phase 3：2026-08-12；Phase 4：2026-08-12）
> 范围：`@aiohub/llm-core`、桌面端请求 / Embedding / Recall / Probe、移动端聊天请求、模型路由编辑与探测结果应用、聚合渠道类型
> 后续：多能力路由高级编辑与跨协议重试（Phase 5）仍按 `docs/Plan/llm-aggregate-channel-routing-investigation.md` 推进。

## 目标与边界

`profile.type` 继续表示**渠道身份**。它决定旧渠道的预设、鉴权、URL 构造和参数兼容行为；它不再被当作模型实际使用的唯一线协议标识。

所有运行时调用应通过 `@aiohub/llm-core` 的：

```ts
resolveModelExecution({ profile, model, operation });
```

解析器返回：

- `adapterId`：实际的线协议标识，用于日志、Inspector 和后续模型级路由。
- `effectiveProfile`：为现有适配器准备的兼容视图。旧渠道的 profile-default 路径返回原对象，不改变任何旧行为；模型级 binding 才会切换兼容渠道类型或注入专用端点。
- `endpoint`：binding 的显式端点（如有）。
- `routeSource`：`manual`、`probe`、`discovered` 或 `profile-default`。

首期不增加可见 `routeId`，一个模型只可按 operation 保存一个默认 binding。

## 聚合渠道

Phase 4 新增四种聚合渠道类型，渠道身份与线协议解耦：

| 渠道类型              | 模型列表       | 默认回退                                     | 说明                                                                 |
| --------------------- | -------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `new-api`             | `/v1/models`   | OpenAI Chat Completions + embedding/rerank/image | 理解 `supported_endpoint_types`；模型级绑定与探测优先生效         |
| `sub2api`             | `/v1/models`   | OpenAI Chat Completions + embedding/rerank/image | 按 Key/Group platform 工作，无端点声明时用渠道默认或探测           |
| `aggregate-compatible` | `/v1/models`   | 无（必须手工绑定/探测/渠道默认）              | 通用手工模式，不假设服务端扩展字段                                  |
| `opencode-go`         | `/v1/models`   | 内置官方模型路由表（`modelRoutes`）           | 未收录模型抛出 `UnresolvedModelRouteError`，标记"待选择/待探测"      |

聚合渠道在 `PROVIDER_EXECUTION_DEFAULTS` 中标记 `aggregate: true`，并满足：

1. **渠道级默认协议可配置**：`profile.options.routingDefaults`（`Partial<Record<LlmOperation, LlmAdapterId>>`）是用户配置的回退协议，优先级高于内置路由表。清空或未知 adapter 视为未设置，继续回退。
2. **回退优先级**：模型 binding → 唯一发现端点 → 用户渠道默认（routingDefaults）→ 内置模型路由表（opencode-go）→ 渠道静态默认 → 否则抛出可恢复的 `UnresolvedModelRouteError`（禁止按模型名猜测协议）。
3. **兼容视图重映射**：聚合渠道的 profile-default 路径会把 `effectiveProfile.type` 重映射为实际协议适配器的旧渠道类型（如 `openai-compatible` / `claude` / `openai-responses`），请求构建、参数过滤和鉴权头因此看到真实协议；旧渠道路径保持返回原 profile 不变。
4. **桌面注册**：`src/llm-apis/adapters/index.ts` 与 `src/utils/llm-api-url.ts` 为聚合类型提供防御性的 OpenAI 兼容条目（运行时实际经过解析器重映射，不会命中）；`OPENAI_FAMILY` 纳入四类以便 `/v1/models` 解析与 `supported_endpoint_types` 保留；渠道包白名单与 Probe 自动端点集合同步加入。
5. **UI 提示**：模型列表对聚合渠道中无法解析对话协议的模型显示"待选协议"标签；路由编辑器显示"待选择/待探测"提示并引导选择或探测。Probe 服务对未解析模型返回"该模型尚未选择协议"的配置错误而不是猜测协议。

OpenCode Go 内置路由表（2026-08-12 官方模型表）位于 `PROVIDER_EXECUTION_DEFAULTS["opencode-go"].modelRoutes`，覆盖 19 个模型：Chat Completions（Grok/GLM/Kimi/DeepSeek/MiMo/Hy 系）、OpenAI Responses（`gpt-5.6-luna`）、Anthropic Messages（MiniMax/Qwen 系）。

## 稳定类型

共享定义位于：

- `packages/llm-core/src/types/routing.ts`
- `packages/llm-core/src/model-execution-routing.ts`

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
  | "openai-image-generation"
  | "suno-newapi"
  | "minimax-music";

type LlmOperation =
  "chat" | "embedding" | "rerank" | "image" | "audio" | "video" | "music";
```

`LlmModelRouting` 已作为可选字段加入桌面与移动端 `LlmModelInfo`。Phase 2 起模型发现写入 `supportedEndpointTypes`；Phase 3 起提供模型编辑器、批量设置与 Probe 应用入口，模型刷新只替换远端声明，不覆盖用户 binding（见 `mergeDiscoveredModelRouting`）。

## Provider 默认映射

`PROVIDER_EXECUTION_DEFAULTS` 是旧渠道的兼容基线。其返回的 `adapterId` 用于可观测性和未来覆盖；解析器保留原 `profile.type`，所以不会把 DeepSeek、Azure、xAI、SiliconFlow、Vertex 等现有特化实现错误降级成通用实现。

| 渠道类型                                                                                                | 默认 operation | 默认 adapterId            | 已声明的 operation 覆盖        |
| ------------------------------------------------------------------------------------------------------- | -------------- | ------------------------- | ------------------------------ |
| `openai`                                                                                                | chat           | `openai-chat-completions` | embedding, image               |
| `openai-compatible`                                                                                     | chat           | `openai-chat-completions` | embedding, rerank, image       |
| `azure`                                                                                                 | chat           | `openai-chat-completions` | embedding                      |
| `deepseek`                                                                                              | chat           | `openai-chat-completions` | embedding                      |
| `siliconflow`                                                                                           | chat           | `openai-chat-completions` | embedding, image               |
| `groq`                                                                                                  | chat           | `openai-chat-completions` | —                              |
| `mistral`、`perplexity`、`together`、`lmstudio`、`vllm`、`volcengine`、`dashscope`、`zhipu`、`moonshot` | chat           | `openai-chat-completions` | —                              |
| `ollama`                                                                                                | chat           | `openai-chat-completions` | embedding                      |
| `openrouter`                                                                                            | chat           | `openai-chat-completions` | embedding                      |
| `openai-responses`                                                                                      | chat           | `openai-responses`        | embedding, image               |
| `claude`                                                                                                | chat           | `anthropic-messages`      | —                              |
| `gemini`                                                                                                | chat           | `gemini-generate-content` | embedding, image, audio, video |
| `cohere`                                                                                                | chat           | `cohere-chat`             | embedding                      |
| `vertexai`                                                                                              | chat           | `vertex-google`           | embedding                      |
| `xai`                                                                                                   | chat           | `openai-chat-completions` | image                          |
| `suno-newapi`                                                                                           | music          | `suno-newapi`             | —                              |
| `minimax-music`                                                                                         | music          | `minimax-music`           | —                              |
| `new-api`、`sub2api`（聚合）                                                                            | chat           | `openai-chat-completions` | embedding, rerank, image；可配置渠道默认 |
| `aggregate-compatible`（聚合）                                                                          | chat           | 无（须绑定/探测/渠道默认） | —                              |
| `opencode-go`（聚合）                                                                                   | chat           | 内置 `modelRoutes` 路由表  | —                              |

## 发现与持久化

Phase 2 将 OpenAI 风格模型列表的 `supported_endpoint_types` 映射为 `ProviderModelInfo.supportedEndpointTypes`，随后写入模型自身的 `routing.supportedEndpointTypes` 与 `routing.discoveredAt`。该集合是服务端声明而非用户选择：保留未知字符串供未来协议支持或导入导出使用，resolver 只会识别已注册的 endpoint type。

刷新模型列表时，应用仅更新同 ID 模型的远端端点声明；`routing.bindings`（手工或 Probe 路由）以及本地 `capabilities`、分组、图标等模型配置都不被覆盖。渠道包会校验 routing 的结构，但保留未知 endpoint 和 adapter 值；未知 adapter binding 暂不生效并安全回退到渠道默认执行路径。

## 路由编辑与探测应用

Phase 3 提供以下写入入口，全部只覆盖对应 operation 的 binding：

- **模型编辑器**（`ModelRoutingEditor`）：按模型已声明能力逐操作编辑 adapter（对话恒可编辑），可附加绑定专用端点；选择即写 `source: "manual"`，重置即删除该 operation binding。编辑器同时展示服务端声明端点集合与当前生效路由。
- **批量设置**（`BatchRouteBindingDialog`）：为渠道全部模型设置 Chat binding，覆盖已有 Chat 绑定。
- **Probe 应用**（模型检查对话框）：成功结果可逐行应用或批量应用到选中模型，写 `source: "probe"`；仅当 `endpointType` 可映射到 adapter 且能力匹配时可用（`createProbeRouteApplication`），失败 / "auto" / 未知端点不提供应用入口，不猜测协议。

共享工具：`listAdaptersForOperation()` 提供各 operation 的可用 adapter；`resolveAdapterIdForEndpointType()` 把服务端端点字符串映射到 adapter，均以 `@aiohub/llm-core` 单一实现为准，桌面与移动端共用。

## 解析优先级

1. `model.routing.bindings[operation]`。
2. 模型声明的 `supportedEndpointTypes` 中，唯一可识别且与 operation 匹配的端点。
3. 聚合渠道：用户配置的渠道默认（`profile.options.routingDefaults`）→ 内置模型路由表（`modelRoutes`，OpenCode Go）→ 渠道静态默认；旧渠道直接使用渠道静态默认。
4. 全部缺失时，聚合渠道抛出 `UnresolvedModelRouteError`（可恢复配置错误，UI 标记"待选择/待探测"）；未知渠道没有默认映射时抛出可恢复的配置错误。

多个候选发现端点不会按模型名猜测；解析器回退渠道默认值。`UnresolvedModelRouteError` 与 `isAggregateChannelType()` 由 `@aiohub/llm-core` 导出，供 UI 与 Probe 服务复用。

## 桌面调用点与行为快照

| 调用点                                                          | 迁移方式                                                                               | 行为快照                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/composables/useLlmRequest.ts`                              | 依请求能力解析 chat / image / audio / video / music；Embedding 单独按 `embedding` 解析 | 旧 profile 走 `profile-default` 且沿用原 `profile.type`；参数过滤、URL 和 headers 不变 |
| `src/llm-apis/embedding.ts`                                     | 在公共 Embedding facade 解析 `embedding`                                               | `embedding-shared.test.ts` 覆盖 OpenAI 与 Vertex URL / 请求体                          |
| `src/tools/recall/utils/vectorCache.ts`                         | 在缓存未命中时解析 `embedding`                                                         | `vectorCache.test.ts` 覆盖缓存命中、provider 调用与不支持错误                          |
| `src/views/Settings/llm-service/probe/channel-probe-service.ts` | Probe 计划按 capability 解析；显式 endpoint 仍优先作为探测覆盖                         | `channel-probe-service.test.ts` 覆盖四种显式 Chat endpoint 与非流式能力                |
| `mobile/.../useLlmRequest.ts`                                   | 移动端聊天在 adapter switch 前解析 `chat`                                              | `useLlmRequest.test.ts` 保留默认调用与重试行为                                         |

Inspector 上下文和桌面请求日志记录 `channelType`、`effectiveAdapterId`、`executionOperation` 与 `routeSource`。

## 验证策略

1. `packages/llm-core/tests/model-execution-routing.test.ts` 锁定解析优先级、端点注入、歧义回退和未知渠道报错。
2. 每个迁移的既有桌面单测继续验证原 URL、请求体或调用选择。
3. 共享 core、桌面 TypeScript、移动 TypeScript 与对应 Vite 构建分别执行；移动端全量 build 若被无关测试编译错误阻断，应记录阻断文件并不修改无关代码。
