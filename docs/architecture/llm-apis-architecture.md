# LLM API 系统架构

本文档系统性地介绍 AIO Hub 的 LLM API 调用体系。整个系统分为 **三层架构**，从上层配置到底层协议适配逐层递进：

```
┌──────────────────────────────────────────────────┐
│                   预设层 (Preset)                  │
│  llm-presets.ts — 42个预设模板（快速创建渠道）      │
├──────────────────────────────────────────────────┤
│                 渠道管理层 (Channel)               │
│  useLlmProfiles.ts  — 渠道 CRUD / 持久化          │
│  useLlmKeyManager.ts — 多 Key 轮询 / 熔断/恢复    │
│  useLlmRequest.ts    — 请求编排 / 中间件           │
├──────────────────────────────────────────────────┤
│                 适配器层 (Adapter)                 │
│  common.ts            — 统一请求/响应接口           │
│  request-builder.ts   — 参数过滤 / 消息解析         │
│  model-fetcher.ts     — 模型列表发现 / 元数据增强    │
│  embedding.ts         — 嵌入任务统一入口             │
│  embedding-types.ts   — 嵌入类型定义                │
│  adapters/            — 各服务商协议适配实现         │
└──────────────────────────────────────────────────┘
```

---

## 1. 预设层 (Preset Layer)

**文件路径**: [`src/config/llm-presets.ts`](/src/config/llm-presets.ts)

预设层提供开箱即用的服务商模板，用户可以通过 UI 一键创建渠道并自动填充 baseUrl、logo、默认模型列表。

### 1.1 预设结构

```typescript
export interface LlmPreset {
  type: ProviderType; // 对应适配器层分发的 Provider 类型
  name: string; // 显示名称，如 "OpenAI", "Google Gemini"
  description: string; // 简短描述
  defaultBaseUrl: string; // 默认 API 地址
  logoUrl?: string; // Logo 路径
  defaultModels?: LlmModelInfo[]; // 预设的默认模型列表
  links?: LlmLink[]; // 快捷链接（官网、控制台、文档等）
  customEndpoints?: LlmProfile["customEndpoints"]; // 自定义端点配置
}
```

### 1.2 当前预设列表（42 个）

**主流大厂**：
OpenAI · OpenAI Responses · Google Gemini · Anthropic Claude · Cohere · xAI (Grok) · Vertex AI · Azure OpenAI

**国产平台**（均走 `openai-compatible` 协议）：
阿里云百炼 (Qwen) · 火山引擎 (豆包) · 智谱 AI (GLM) · 百度文心 (ERNIE) · 腾讯混元 · 月之暗面 (Kimi) · 零一万物 (Yi) · 百川智能 · MiniMax (ABAB) · 商汤日日新

**聚合/中转平台**：
OpenRouter · SiliconFlow · Together AI · Fireworks AI · DeepInfra · NewAPI · Hugging Face · Perplexity · 魔搭 ModelScope

**本地/私有部署**：
Ollama · Ollama Cloud · LM Studio

**其他/特定**：
Mistral AI · AI21 Labs (Jamba) · Suno (via NewAPI) · VCP

> **注意**：预设层仅提供 UI 层面的配置模板。实际请求的分发由 **适配器层** 根据 `profile.type` 决定，上述国产平台均通过 `openAiAdapter` 处理。

---

## 2. 渠道管理层 (Channel Management Layer)

这是整个系统的"中枢神经系统"，由三个 Composable 协同工作。

### 2.1 渠道配置管理 — [`useLlmProfiles`](/src/composables/useLlmProfiles.ts)

负责渠道配置的增删改查与持久化。

**核心职责**：

- **加载/保存**: 通过 `createConfigManager` 将渠道配置持久化到 `profiles.json`（[第 120 行](/src/composables/useLlmProfiles.ts:120)）
- **数据迁移**: 自动从旧版 localStorage 迁移到文件系统（[第 86-105 行](/src/composables/useLlmProfiles.ts:86)）
- **数据规范化**: `normalizeProfile()` 处理旧版单 Key 到多 Key 数组的兼容（[第 38 行](/src/composables/useLlmProfiles.ts:38)）
- **预设创建**: `createFromPreset()` 将预设模板实例化为可编辑的渠道配置（[第 258 行](/src/composables/useLlmProfiles.ts:258)）
- **能力查询**: `getSupportedParameters()` 基于 `providerTypes` 查询渠道支持的参数（[第 278 行](/src/composables/useLlmProfiles.ts:278)）

```typescript
// 核心暴露
const {
  profiles,
  saveProfile,
  deleteProfile,
  getProfileById,
  createFromPreset,
} = useLlmProfiles();
```

### 2.2 多 Key 管理 — [`useLlmKeyManager`](/src/composables/useLlmKeyManager.ts)

支持一个渠道配置绑定多个 API Key，自动实现**轮询 + 熔断 + 恢复**的负载均衡。

**轮询策略**（[`pickKey()`](/src/composables/useLlmKeyManager.ts:102)）：

1. 调用 `syncKeyStates()` 同步所有 Key 的状态
2. 过滤出可用 Key：`isEnabled && !isBroken`
3. 从 `lastUsedIndices` 记录的下标开始轮询下一个可用 Key
4. 若无可用 Key，回退到第一个 Key，由下游 API 报错触发反馈

**熔断逻辑**（[`reportFailure()`](/src/composables/useLlmKeyManager.ts:188)）：

- 识别 `429 Too Many Requests`，直接熔断
- 连续 3 次非 429 错误也触发熔断
- 熔断后的 Key 标记 `isBroken: true`，记录 `disabledTime`
- 错误消息截断至 2000 字符，防止配置文件膨胀（[第 196 行](/src/composables/useLlmKeyManager.ts:196)）

**自动恢复**（[`pickKey()`](/src/composables/useLlmKeyManager.ts:112)）：

- `autoRecoveryTime` 默认 60 秒
- 轮询时检查已熔断 Key 是否超期，超期则重置

**持久化**：

- 状态存储于 `key-states.json`（[第 16 行](/src/composables/useLlmKeyManager.ts:16)）
- 写入采用**防抖保存**，不阻塞请求流程（[第 57 行](/src/composables/useLlmKeyManager.ts:57)）

```typescript
// 核心暴露
const { pickKey, reportSuccess, reportFailure, resetAllBroken } =
  useLlmKeyManager();
```

### 2.3 请求编排中间件 — [`useLlmRequest`](/src/composables/useLlmRequest.ts)

这是整个 LLM 请求的**中心调度器**，串联渠道配置、Key 管理、参数过滤和适配器分发。

**完整请求流程**（[`sendRequest()`](/src/composables/useLlmRequest.ts:34)）：

```
sendRequest(options)
  │
  ├─ 1. 获取渠道配置（getProfileById）
  │     └─ 检查启用状态、检查模型是否存在
  │
  ├─ 2. 选取 API Key（pickKey）
  │     └─ 构造 effectiveProfile，注入选中的 Key
  │
  ├─ 3. 特种请求自动分发
  │     ├─ Embedding → adapter.embedding()
  │     └─ Rerank → 模拟响应（暂未完整实现）
  │
  ├─ 4. 参数过滤（filterParametersByCapabilities）
  │     └─ 合并模型 customParameters
  │     └─ 注入网络行为配置（hasLocalFile / forceProxy 等）
  │     └─ 自动检测本地/IP 地址，强制代理
  │
  ├─ 5. 适配器分发
  │     ├─ videoGeneration → adapter.video()
  │     ├─ imageGeneration → adapter.image()
  │     ├─ audioGeneration → adapter.audio()
  │     └─ default → adapter.chat()
  │
  ├─ 6. 成功 → reportSuccess() → 返回 LlmResponse
  │
  └─ 7. 失败
        ├─ TimeoutError → 记录警告
        ├─ AbortError (用户取消)
        │     └─ 有 requestId → 向上游发送 /v1/interrupt 停止信号
        └─ 其他错误 → reportFailure() → 抛出原始错误
```

**关键特性**：

- **自动代理协商**: 检测 `local-file://` 协议或本地/IP 地址时，自动开启 Rust 后端代理（[第 149-223 行](/src/composables/useLlmRequest.ts:149)）
- **forceChatMode**: 支持通过 `_forceChatMode` 或 `preferChat` 能力标记，强制使用对话接口进行媒体生成（如 Gemini 原生生图模型）（[第 252 行](/src/composables/useLlmRequest.ts:252)）
- **取消传播**: 用户取消请求时，若提供了 `requestId`，自动补发 `/v1/interrupt` 通知上游服务端停止生成（[第 320-346 行](/src/composables/useLlmRequest.ts:320)）

---

## 3. 适配器层 (Adapter Layer)

**目录**: [`src/llm-apis/`](/src/llm-apis/)

适配器层作为**防腐层 (Anti-Corruption Layer)**，屏蔽不同服务商 API 的差异性，为上层提供统一的多模态调用接口。

### 3.1 目录结构

```
src/llm-apis/
├── common.ts               # 统一请求/响应接口、错误类型、超时控制
├── request-builder.ts      # 参数过滤、消息解析、模型家族识别
├── model-fetcher.ts        # 模型列表发现与元数据增强
├── embedding.ts            # Embedding 任务的统一入口
├── embedding-types.ts      # Embedding 相关类型定义
├── adapters/
│   ├── index.ts            # 适配器注册表 / LlmAdapter 接口
│   ├── openai/             # OpenAI 兼容协议（chat / image / audio / video / responses）
│   ├── anthropic/          # Anthropic Claude 协议
│   ├── gemini/             # Google Gemini 协议
│   ├── vertexai/           # Google Vertex AI 协议
│   ├── cohere/             # Cohere v2 协议
│   ├── xai/                # xAI Grok 协议
│   ├── siliconflow/        # SiliconFlow 图片生成（独立于 OpenAI 兼容）
│   └── suno-newapi/        # Suno 音乐生成 (NewAPI 协议)
└── 参考docs/               # 各 API 的参考文档（非代码）
```

### 3.2 统一适配器接口 — [`LlmAdapter`](/src/llm-apis/adapters/index.ts:16)

```typescript
export interface LlmAdapter {
  chat(profile: LlmProfile, options: LlmRequestOptions): Promise<LlmResponse>;
  embedding?(
    profile: LlmProfile,
    options: EmbeddingRequestOptions
  ): Promise<EmbeddingResponse>;
  image?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;
  audio?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;
  video?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;
}
```

### 3.3 适配器分发映射 — [`adapters`](/src/llm-apis/adapters/index.ts:47)

| adapters key        | 实现                               | ProviderType        | 说明              |
| ------------------- | ---------------------------------- | ------------------- | ----------------- |
| `openai`            | `openAiAdapter`                    | `openai`            | OpenAI 官方       |
| `openai-compatible` | `openAiAdapter`                    | `openai-compatible` | 第三方中转        |
| `openai-responses`  | `openAiResponsesAdapter`           | `openai-responses`  | OpenAI 有状态接口 |
| `groq`              | `openAiAdapter`                    | `groq`              | Groq LPU          |
| `mistral`           | `openAiAdapter`                    | —                   | Mistral AI        |
| `perplexity`        | `openAiAdapter`                    | —                   | Perplexity        |
| `deepseek`          | `openAiAdapter`                    | `deepseek`          | 深度求索          |
| `together`          | `openAiAdapter`                    | —                   | Together AI       |
| `openrouter`        | `openAiAdapter`                    | `openrouter`        | OpenRouter        |
| `ollama`            | `openAiAdapter`                    | `ollama`            | Ollama 本地       |
| `lmstudio`          | `openAiAdapter`                    | —                   | LM Studio         |
| `vllm`              | `openAiAdapter`                    | —                   | vLLM              |
| `volcengine`        | `openAiAdapter`                    | —                   | 火山引擎          |
| `dashscope`         | `openAiAdapter`                    | —                   | 阿里百炼          |
| `zhipu`             | `openAiAdapter`                    | —                   | 智谱 AI           |
| `moonshot`          | `openAiAdapter`                    | —                   | 月之暗面          |
| `siliconflow`       | `openAiAdapter` (+ image override) | `siliconflow`       | 硅基流动          |
| `xai`               | `xAiAdapter`                       | `xai`               | xAI Grok          |
| `gemini`            | `geminiAdapter`                    | `gemini`            | Google Gemini     |
| `claude`            | `anthropicAdapter`                 | `claude`            | Anthropic         |
| `vertexai`          | `vertexAiAdapter`                  | `vertexai`          | Vertex AI         |
| `cohere`            | `cohereAdapter`                    | `cohere`            | Cohere            |
| `suno-newapi`       | `sunoNewApiAdapter`                | `suno-newapi`       | 音乐生成          |

> **重要**：大部分国产/聚合平台通过 `openai-compatible` 协议走 `openAiAdapter`，无需编写独立适配器。只要 API 格式与 OpenAI Chat Completions 一致，只需在 `adapters/index.ts` 添加映射并可在 `llm-presets.ts` 添加预设即可。

### 3.4 请求构建器 — [`request-builder.ts`](/src/llm-apis/request-builder.ts)

这是适配层的核心逻辑模块，负责：

- **模型家族识别** — [`getModelFamily()`](/src/llm-apis/request-builder.ts:485)
  基于元数据系统中的 `group` 字段判断模型家族（`openai` / `claude` / `gemini` / `cohere` / `deepseek` / `qwen` / `xai`），以应用特定参数规则。若元数据未匹配，回退到 `provider` 字符串推断。

- **多模态消息解析** — [`parseMessageContents()`](/src/llm-apis/request-builder.ts:75)
  将统一消息数组解析为分类结构，支持：文本、图片、音频、视频、文档、tool_use、tool_result。

- **智能参数过滤** — [`filterParametersByCapabilities()`](/src/llm-apis/request-builder.ts:570)
  三重过滤策略：
  1. **Provider 级**: 基于 `supportedParameters` 参数定义表初筛
  2. **Model 级**: 基于 `ModelCapabilities` 细化
  3. **Model Family 级**: 基于 `getModelFamily()` 的结果保护专有参数（如 `stopSequences` 仅在 `claude` 家族保留）

- **自定义参数透传** — [`applyCustomParameters()`](/src/llm-apis/request-builder.ts:962)
  将不在 [`KNOWN_NON_MODEL_OPTIONS_KEYS`](/src/llm-apis/request-builder.ts:846) 黑名单中的参数透传到请求体，支持未知参数的灵活下发。

### 3.5 统一消息与响应格式

**消息内容类型**（[`LlmMessageContent`](/src/llm-apis/common.ts:102)）：

```typescript
type LlmMessageContent =
  | TextContent // type: "text"
  | ImageContent // type: "image" — base64图片
  | AudioContent // type: "audio" — 支持 base64 / file_uri
  | VideoContent // type: "video" — 支持 startOffset / endOffset / fps
  | DocumentContent // type: "document" — PDF等文档
  | ToolUseContent // type: "tool_use"
  | ToolResultContent; // type: "tool_result"
```

**响应结构**（[`LlmResponse`](/src/llm-apis/common.ts:386)）：

标准字段：`content`, `usage`, `reasoningContent`, `toolCalls`, `finishReason`
媒体字段：`images[]`, `videos[]`, `audios[]`, `audioData`
高级字段：`annotations`(引用注释), `timings`(性能指标), `revisedPrompt`, `thought`

### 3.6 统一超时与错误处理 — [`common.ts`](/src/llm-apis/common.ts)

- 默认超时：145 秒 (`DEFAULT_TIMEOUT`)
- 媒体生成超时：600 秒 (`DEFAULT_MEDIA_TIMEOUT`)
- 超时控制：[`fetchWithTimeout()`](/src/llm-apis/common.ts:612) — 带双重中止信号管理
- 代理劫持：检测 `local-file://` / `forceProxy` / 底层网络配置，自动切到 Rust 代理
- FormData 透明转发：`options.body instanceof FormData` 时，直接透传给代理服务
- 错误类型：`TimeoutError`, `LlmApiError`, `isAbortError()`

### 3.7 嵌入任务入口 — [`embedding.ts`](/src/llm-apis/embedding.ts) + [`embedding-types.ts`](/src/llm-apis/embedding-types.ts)

根据 `profile.type` 自动路由到对应的适配器实现。嵌入类型定义支持 `dimensions`、`taskType` (Gemini/Cohere)、`encodingFormat` (Cohere) 等参数。

### 3.8 模型获取与元数据 — [`model-fetcher.ts`](/src/llm-apis/model-fetcher.ts)

- 动态发现：调用服务商 `models` 端点获取模型列表
- 元数据丰富：结合 `model-metadata.ts` 推断模型分组、Token 限制、能力标识（thinkingConfigType 等）
- 图标匹配：通过 `normalizeIconPath()` 和 `getModelIconPath()` 自动匹配预设图标

---

## 4. 完整请求生命周期

```
用户发送消息
    │
    ▼
useLlmRequest.sendRequest(options)
    │
    ├── 获取渠道配置 (useLlmProfiles.getProfileById)
    ├── 验证渠道启用 + 模型存在
    ├── 选取 Key 注入渠道 (useLlmKeyManager.pickKey)
    │
    ├── 特种请求分流 (Embedding / Rerank)
    │
    ├── 参数过滤 (filterParametersByCapabilities)
    │   ├── Provider 级
    │   ├── Model 级
    │   └── Model Family 级
    │
    ├── 注入网络行为配置
    │   ├── hasLocalFile → 代理
    │   ├── forceProxy → 代理
    │   └── 本地/IP 地址 → 自动代理
    │
    ├── 适配器分发 (adapters[profile.type])
    │   ├── adapter.video()
    │   ├── adapter.image()
    │   ├── adapter.audio()
    │   └── adapter.chat()
    │       │
    │       ├── fetchWithTimeout (含超时 + 代理劫持)
    │       ├── 流式解析 (onStream / onReasoningStream)
    │       └── 响应标准化 → LlmResponse
    │
    ├── 成功 → reportSuccess() → 返回响应
    │
    └── 失败
        ├── 超时 → warn + 抛出 TimeoutError
        ├── 取消 → 补发 /v1/interrupt 停止信号
        └── 其他 → reportFailure() + 抛出错误
```

---

## 5. 扩展指南

### 5.1 添加新服务商（三步骤）

**步骤 1: 类型注册**

- 在 [`ProviderType`](/src/types/llm-profiles.ts:24) 中添加新类型
- 在 [`providerTypes`](/src/config/llm-providers.ts) 中添加 `ProviderTypeInfo` 配置（参数支持范围、端点等）
- 在 [`llmPresets`](/src/config/llm-presets.ts) 中添加预设模板（可选，仅需 UI 快捷创建时）

**步骤 2: 适配实现**

- 若 API 格式与 OpenAI Chat Completions 兼容 → 只需注册到 `adapters` 映射复用 `openAiAdapter`
- 若不兼容 → 在 `adapters/` 下创建目录，实现 `LlmAdapter` 接口
- 在 [`adapters`](/src/llm-apis/adapters/index.ts:47) 注册表中添加映射

**步骤 3: 协议参考**

- 在 `src/llm-apis/参考docs/` 下添加 API 参考文档（可选，方便后续维护）

### 5.2 添加新模型能力

1. 在 [`ModelCapabilities`](/src/types/llm-profiles.ts:137) 中定义新能力
2. 在 [`filterParametersByCapabilities()`](/src/llm-apis/request-builder.ts:570) 中添加对应过滤逻辑
3. 在 [`KNOWN_NON_MODEL_OPTIONS_KEYS`](/src/llm-apis/request-builder.ts:846) 中注册参数名（防止被透传或清理）
4. 在 [`model-metadata-presets.ts`](/src/config/model-metadata-presets.ts) 中为对应模型配置该能力

### 5.3 添加新的预设模板

在 `llmPresets[]` 数组中添加新条目：

```typescript
{
  type: "openai",            // 适配器 key
  name: "My Custom Service", // UI 显示名称
  description: "...",
  defaultBaseUrl: "https://api.example.com/v1",
  logoUrl: "/model-icons/myservice.svg",
  links: [{ label: "官网", url: "https://..." }],
  defaultModels: [
    {
      id: "my-model-1",
      name: "My Model 1",
      group: "My Models",
      provider: "myservice",
      capabilities: { toolUse: true },
    },
  ],
}
```

---

## 6. 最佳实践

- **能力驱动开发**: 业务逻辑应依赖 `ModelCapabilities` 检测（如 `capabilities.thinking`），而非硬编码模型 ID
- **利用 Request Builder**: 优先使用 `filterParametersByCapabilities` 和 `cleanPayload` 处理请求体，确保 API 兼容性
- **统一媒体处理**: 图片、音频、视频应通过 `ParsedMessageContent` 统一处理，由适配器决定映射方式（`inline_data` vs `url`）
- **Key 管理**: 合理配置 `autoRecoveryTime`，429 熔断后自动恢复，无需人工干预
- **代理策略**: 本地地址和 `local-file://` 协议会强制走 Rust 代理，外部地址默认走代理，可通过 `networkStrategy: "native"` 强制直连
