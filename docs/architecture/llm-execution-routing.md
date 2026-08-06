# LLM 模型执行路由契约

> 状态：Phase 0 + Phase 1 已实施（2026-08-06）
> 范围：`@aiohub/llm-core`、桌面端请求 / Embedding / Recall / Probe、移动端聊天请求
> 后续：模型发现结果保真、路由编辑 UI 与聚合渠道类型仍按 `docs/Plan/llm-aggregate-channel-routing-investigation.md` 的 Phase 2–5 推进。

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

`LlmModelRouting` 已作为可选字段加入桌面与移动端 `LlmModelInfo`。本阶段只读取该字段；尚未实现 UI、模型发现写入或导入导出校验。

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

## 解析优先级

1. `model.routing.bindings[operation]`。
2. 模型声明的 `supportedEndpointTypes` 中，唯一可识别且与 operation 匹配的端点。
3. `PROVIDER_EXECUTION_DEFAULTS[profile.type]`。

多个候选发现端点不会按模型名猜测；解析器回退渠道默认值。未知渠道没有默认映射时抛出可恢复的配置错误。

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
