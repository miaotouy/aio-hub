# LLM API 系统架构

本文档系统性地介绍 AIO Hub 的 LLM API 调用体系。系统由应用配置/编排、应用 Facade、共享 Provider Core 与平台 Transport 组成；桌面和移动共享协议语义，但保留各自运行时边界：

```
┌──────────────────────────────────────────────────┐
│                   预设层 (Preset)                  │
│  llm-presets/ — 41个预设模板（快速创建渠道）      │
├──────────────────────────────────────────────────┤
│                 渠道管理层 (Channel)               │
│  useLlmProfiles.ts  — 渠道 CRUD / 持久化          │
│  useLlmKeyManager.ts — 多 Key 轮询 / 熔断/恢复    │
│  useLlmRequest.ts    — 请求编排 / 中间件           │
├──────────────────────────────────────────────────┤
│              应用 Facade 层 (Desktop/Mobile)        │
│  Profile/Key/元数据映射、回调兼容、错误与日志接入      │
├──────────────────────────────────────────────────┤
│            @aiohub/llm-core (Shared Core)         │
│  canonical DTO / Provider Adapter / 执行器 / fixture │
├──────────────────────────────────────────────────┤
│                 平台 Transport 层                  │
│  Desktop Rust Proxy / Mobile HTTP + Native FileRef │
└──────────────────────────────────────────────────┘
```

---

## 1. 预设层 (Preset Layer)

**文件路径**: [`src/config/llm-presets/`](/src/config/llm-presets/index.ts)

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

### 1.2 当前预设列表（43 个）

**主流大厂**：
OpenAI · OpenAI Responses · Google Gemini · Anthropic Claude · Cohere · xAI (Grok) · Vertex AI · Azure OpenAI · TypeSafe AI

**国产平台**（均走 `openai-compatible` 协议）：
阿里云百炼 (Qwen) · 火山引擎 (豆包) · 智谱 AI (GLM) · 百度文心 (ERNIE) · 腾讯混元 · 月之暗面 (Kimi) · 零一万物 (Yi) · 百川智能 · MiniMax (ABAB) · 商汤日日新

**聚合/中转平台**：
OpenRouter · SiliconFlow · Together AI · Fireworks AI · DeepInfra · NewAPI · Hugging Face · Perplexity · 魔搭 ModelScope · OpenCode Go · Sub2API

**本地/私有部署**：
Ollama · Ollama Cloud · LM Studio · audio.cpp (本地音频)

**其他/特定**：
Mistral AI · AI21 Labs (Jamba) · Suno (via NewAPI) · VCP

> **注意**：预设层仅提供 UI 层面的配置模板。实际请求的分发由 **模型执行路由与适配器层** 根据 `profile.type` 及模型 binding 决定，大部分国产平台均通过 `openAiAdapter` 处理。

---

## 2. 渠道管理层 (Channel Management Layer)

这是整个系统的"中枢神经系统"，由三个 Composable 协同工作。

### 2.1 渠道配置管理 — [`useLlmProfiles`](/src/composables/useLlmProfiles.ts)

负责渠道配置的增删改查与持久化。

**核心职责**：

- **凭证隔离与混淆存储**: 彻底将 API Key 与敏感 `customHeaders` 从通用渠道配置文件 `profiles.json` 中剥离，移入独立存储文件（桌面端 `llm-service/secrets.dat`，移动端 `AppData/llm_service_secrets.dat`，见 [`src/utils/llm-secret/`](/src/utils/llm-secret/)）。混淆文件使用轻量级动态盐混淆格式（`AIOHUBVLT1.<base64 salt>.<base64 cipher>`），每次落盘盐值不同。加载时按 `profile.id` 透明注入内存，落盘时 `profiles.json` 中的 `apiKeys` 恒为空数组，兼顾运行时无缝调用与磁盘静态安全。
- **数据迁移**: 自动从旧版 localStorage 迁移到文件系统，并在首次加载时把 `profiles.json` 中残留的明文 API Key 迁移进独立混淆存储（[useLlmProfiles.ts](/src/composables/useLlmProfiles.ts)）。
- **数据规范化**: `normalizeProfile()` 处理旧版单 Key 到多 Key 数组的兼容（[第 38 行](/src/composables/useLlmProfiles.ts:38)）。
- **预设创建**: `createFromPreset()` 将预设模板实例化为可编辑的渠道配置（[第 258 行](/src/composables/useLlmProfiles.ts:258)）。
- **能力查询**: `getSupportedParameters()` 基于 `providerTypes` 查询渠道支持的参数（[第 278 行](/src/composables/useLlmProfiles.ts:278)）。

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

### 2.2 多 Key 管理与熔断防御 — [`useLlmKeyManager`](/src/composables/useLlmKeyManager.ts)

支持一个渠道配置绑定多个 API Key，提供**哈希索引状态管理 + 轮询 + 熔断硬阻断 + 自动恢复**能力。熔断开关和恢复时长按渠道独立存储，自动熔断默认关闭，建议仅在多 Key 配置且确认需要故障摘除时开启。

**哈希索引与安全清洗**（[`apiKeyHash.ts`](/src/utils/llm-secret/apiKeyHash.ts) & [`keyStates.ts`](/src/utils/llm-secret/keyStates.ts)）：

- 状态存储于 `llm-service/key-states.json`，索引采用不可逆的 64 位稳定哈希（双段 32 位 FNV-1a 拼接为 `k_<16位hex>`），磁盘上彻底消除明文 Key 索引。
- 历史明文索引在加载时由 `normalizeKeyStatesStorage()` 自动识别并迁移为哈希键，触发即刻回写清洗。
- 错误信息脱敏：持久化前自动将历史错误与上游返回中的当前明文 Key 替换为 `[redacted-key]`，防止凭据在错误日志或持久化状态中回显泄露。

**轮询策略**（[`pickKey()`](/src/composables/useLlmKeyManager.ts:102)）：

1. 调用 `syncKeyStates()` 同步所有 Key 的状态
2. 过滤出可用 Key：`isEnabled && !isBroken`
3. 从 `lastUsedIndices` 记录的下标开始轮询下一个可用 Key
4. 若无可用 Key，执行严格的**全熔断硬阻断**防御机制

**全熔断硬阻断与降级策略加固**：

- **修复静默回退漏洞**：早期版本在所有 Key 均不可用时会静默回退至首个已损坏的 Key 盲目发起请求，导致死循环报错。当前版本实施硬阻断策略，并抛出 `ApiKeyUnavailableError`：
  - 若所有 Key 均被用户手动禁用，抛出 `code: "all-disabled"` 异常，引导用户在渠道设置中启用至少一个 Key。
  - 若所有已启用的 Key 均处于熔断状态，抛出 `code: "all-enabled-circuit-broken"` 异常，并计算各 Key 熔断时间戳与冷却时间，在报错中给出明确的最早冷却恢复时间提示（`retryAt`），禁止无效网络开销。

**熔断逻辑**（[`reportFailure()`](/src/composables/useLlmKeyManager.ts:188)）：

- 开启自动熔断后，识别 `429 Too Many Requests`，直接熔断
- 开启自动熔断后，连续 3 次非 429 暂态错误也触发熔断
- 仅当同一渠道仍有另一把可用 Key 时才熔断当前 Key；单 Key 不进入熔断态
- 熔断后的 Key 标记 `isBroken: true`，记录 `disabledTime`
- 错误消息截断至 2000 字符，防止配置文件膨胀

**自动恢复**（[`pickKey()`](/src/composables/useLlmKeyManager.ts:112)）：

- `autoRecoveryTime` 默认 60 秒
- 轮询时检查已熔断 Key 是否超期，超期则重置状态

**持久化**：

- 写入采用**防抖保存**（`saveDebounced`），不阻塞实时请求流程

```typescript
// 核心暴露
const { pickKey, reportSuccess, reportFailure, resetAllBroken } =
  useLlmKeyManager();
```

### 2.3 安全导入与导出 (Profile Transfer) — [`llm-profile-transfer.ts`](/src/utils/llm-profile-transfer.ts)

渠道配置的导入与导出由专用的配置打包器处理，支持 JSON 与 TOML 双向解析边界：

- **安全脱敏导出**：导出配置包（`LlmProfileBundle`）时默认支持安全脱敏（`includeSecrets = false`），通过递归字段扫描识别所有 `apiKey`、`customHeaders` 中的敏感 Authorization 字段并清空，同时在包元数据中记录 `redactedPaths`（脱敏路径列表）。
- **导入脱敏感知与诊断**：导入时若检测到脱敏文件（`redactedPaths.length > 0`），解析器自动标记 `aiohub-profile-bundle-redacted` 警告，提示用户导入后需补充配置 API Key 才能发起调用。
- **解析边界加固**：严格规范 JSON 与 TOML 的解析与字段验证边界，避免恶意配置结构导致内存注入或解析崩溃。

### 2.4 请求编排中间件 — [`useLlmRequest`](/src/composables/useLlmRequest.ts)

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

packages/llm-core/src/
├── types/                  # canonical 聊天、Embedding、媒体、模型列表与任务类型
├── providers/              # 纯 URL/Header/body 构建和响应语义解析
├── executor.ts             # 聊天统一执行器
├── embedding-executor.ts   # Embedding 执行器
├── media-executor.ts       # 同步媒体执行器
├── model-list-executor.ts  # 模型列表执行器
├── async-media-executor.ts # 异步媒体任务生命周期
└── stream-parser/          # 增量 SSE / JSONL 分帧
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
  transcribe?(
    profile: LlmProfile,
    options: TranscriptionRequestOptions
  ): Promise<TranscriptionResponse>;
  video?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;
}
```

### 3.3 适配器分发映射 — [`adapters`](/src/llm-apis/adapters/index.ts:47)

| adapters key        | 实现                               | ProviderType        | 说明                              |
| ------------------- | ---------------------------------- | ------------------- | --------------------------------- |
| `openai`            | `openAiAdapter`                    | `openai`            | OpenAI 官方                       |
| `openai-compatible` | `openAiAdapter`                    | `openai-compatible` | 第三方中转                        |
| `openai-responses`  | `openAiResponsesAdapter`           | `openai-responses`  | OpenAI 有状态接口                 |
| `azure`             | `azureOpenAiAdapter`               | `azure`             | Azure OpenAI                      |
| `groq`              | `openAiAdapter`                    | `groq`              | Groq LPU                          |
| `mistral`           | `openAiAdapter`                    | —                   | Mistral AI                        |
| `perplexity`        | `openAiAdapter`                    | —                   | Perplexity                        |
| `deepseek`          | `openAiAdapter`                    | `deepseek`          | 深度求索                          |
| `together`          | `openAiAdapter`                    | —                   | Together AI                       |
| `openrouter`        | `openAiAdapter`                    | `openrouter`        | OpenRouter                        |
| `ollama`            | `openAiAdapter`                    | `ollama`            | Ollama 本地                       |
| `lmstudio`          | `openAiAdapter`                    | —                   | LM Studio                         |
| `vllm`              | `openAiAdapter`                    | —                   | vLLM                              |
| `volcengine`        | `openAiAdapter`                    | —                   | 火山引擎                          |
| `dashscope`         | `openAiAdapter`                    | —                   | 阿里百炼                          |
| `zhipu`             | `openAiAdapter`                    | —                   | 智谱 AI                           |
| `moonshot`          | `openAiAdapter`                    | —                   | 月之暗面                          |
| `siliconflow`       | `openAiAdapter` (+ image override) | `siliconflow`       | 硅基流动                          |
| `xai`               | `xAiAdapter`                       | `xai`               | xAI Grok                          |
| `gemini`            | `geminiAdapter`                    | `gemini`            | Google Gemini                     |
| `claude`            | `anthropicAdapter`                 | `claude`            | Anthropic                         |
| `vertexai`          | `vertexAiAdapter`                  | `vertexai`          | Vertex AI                         |
| `cohere`            | `cohereAdapter`                    | `cohere`            | Cohere                            |
| `suno-newapi`       | `sunoNewApiAdapter`                | `suno-newapi`       | 音乐生成                          |
| `audiocpp`          | `openAiAdapter` (+ transcribe)     | `audiocpp`          | 本地 audio.cpp 音频推理 (TTS/ASR) |
| `typesafe`          | `systemOneCore` (独立决策通道)     | `typesafe`          | TypeSafe AI System One 结构化决策 |

> **重要**：大部分国产/聚合平台通过 `openai-compatible` 协议走 `openAiAdapter`，无需编写独立适配器。只要 API 格式与 OpenAI Chat Completions 一致，只需在 `adapters/index.ts` 添加映射并可在 `llm-presets/` 添加预设即可。
> Azure 渠道使用 deployment 风格的 Chat Completions / Embeddings；`azureOpenAiAdapter` 复用 OpenAI wire format，同时负责 `{resource}` / `{deployment}`、`api-version` 与 `api-key` 鉴权转换。
> TypeSafe AI 决策渠道使用独立的 `typesafe-system-one` 协议走 `system-one-core`，不通过生成式对话链路。

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
- 代理传输：桌面默认经带 capability token 的 Rust 回环代理；普通请求走 `/proxy/raw` 原样流式转发，含 tagged/兼容期文件引用的 JSON 才走 `/proxy/json-expand`
- 文件上传：浏览器 `FormData` 透明转发；顶层 `file-ref` 与含本地文件的 multipart manifest 由 Rust 流式读取，本地文件内容不进入 WebView
- 移动文件上传：普通请求继续走 Tauri HTTP；含 tagged JSON、顶层或 multipart `LocalFileRef` 的请求改走移动 Rust command，并按 `requestId` 支持取消。本地文件字节不进入 WebView
- 安全边界：代理只接受当次运行 token 与 Tauri/loopback Origin，过滤代理元 Header，并在日志 URL 中移除 query/fragment
- 错误类型：`TimeoutError`, `LlmApiError`, `isAbortError()`, `ApiKeyUnavailableError`

### 3.7 信道诊断与模型探测体系 — [`channel-probe-service.ts`](/src/views/Settings/llm-service/probe/channel-probe-service.ts)

桌面端提供信道诊断与模型探测服务（`ChannelProbeService` 与 `ModelProbeDialog`），支持对渠道模型进行点对点连通性测试与协议探测：

- **错误严格分级**：探测体系严格区分**本地代理/网络环境错误**（如代理端口未开放、本地连通性失败、证书问题）与**上游服务商业务错误**（如 HTTP 401 凭据失效、404 模型不存在、429 配额耗尽、协议不兼容等），杜绝将本地网络配置失误误报为上游失效。
- **探测计划解析与执行**：支持 Chat (`/v1/chat/completions`、Responses、Claude Messages)、Embedding、ASR/STT 等多能力的端点探测，验证非流式和流式首帧返回。
- **探测结果回写绑定**：探测成功识别出的端点类型可通过 `createProbeRouteApplication` 直接持久化绑定到模型的执行路由中（标记 `source: "probe"`），实现自动化协议适配。

### 3.8 嵌入任务入口 — [`embedding.ts`](/src/llm-apis/embedding.ts) + [`embedding-types.ts`](/src/llm-apis/embedding-types.ts)

根据 `profile.type` 或模型执行路由自动分发到对应的适配器实现。嵌入类型定义支持 `dimensions`、`taskType` (Gemini/Cohere)、`encodingFormat` (Cohere) 等参数。

### 3.9 模型获取与元数据 — [`model-fetcher.ts`](/src/llm-apis/model-fetcher.ts)

- 动态发现：共享 `modelListAdapter` 负责 Provider URL、鉴权、错误和响应归一化
- 元数据丰富：桌面/移动 Facade 在模型写入阶段结合各自 `model-metadata` 规则增强分组、Token 限制与能力；运行时请求不会反向读取规则
- 图标匹配：通过 `normalizeIconPath()` 和 `getModelIconPath()` 自动匹配预设图标

### 3.10 共享 Core 与执行器

- `ProviderAdapter`：聊天、Responses、Claude、Cohere、Gemini、Vertex 的纯请求构建、非流式解析和增量 Decoder
- `EmbeddingProviderAdapter`：OpenAI、Gemini、Cohere、Vertex 单条/批量 Embedding
- `SyncMediaProviderAdapter`：OpenAI/xAI/Gemini/SiliconFlow 图片与 OpenAI TTS
- `ModelListProviderAdapter`：OpenAI 系、Anthropic、Gemini、Cohere、Vertex、Ollama 模型发现
- `AsyncMediaTaskAdapter`：OpenAI/Ark/Agnes 视频、Gemini Veo、Suno 与 MiniMax 的创建、轮询、进度、取消和资产终态

共享包禁止导入 Vue、Pinia、Tauri、应用 Store、logger 或 UI。Provider Adapter 不执行 `fetch`/`invoke`，Transport 不理解 Provider 语义。

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
    ├── 应用 Facade 分发 (adapters[profile.type])
    │   ├── adapter.video()
    │   ├── adapter.image()
    │   ├── adapter.audio()
    │   └── adapter.chat()
    │       │
    │       ├── 映射 canonical DTO + 注入 Profile/TransportOptions
    │       ├── @aiohub/llm-core 构建 WireRequest / 解析响应
    │       ├── Desktop/Mobile Transport 执行网络与文件 I/O
    │       └── Facade 映射回现有 LlmResponse/回调
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
- 在 [`llmPresets`](/src/config/llm-presets/index.ts) 中添加预设模板（可选，仅需 UI 快捷创建时）

**步骤 2: 适配实现**

- 若 API 格式与 OpenAI Chat Completions 兼容 → 只需注册到 `adapters` 映射复用 `openAiAdapter`
- 若不兼容 → 在 `adapters/` 下创建目录，实现 `LlmAdapter` 接口
- 在 [`adapters`](/src/llm-apis/adapters/index.ts:47) 注册表中添加映射

**语音转写 (ASR/STT) 专用端点**

- 模型标记 `capabilities.asr` 时，`useLlmRequest` 会把带 `transcriptionInput` 的请求分发到适配器的可选方法 `transcribe()`（见 `LlmAdapter`）
- OpenAI 兼容实现位于 `src/llm-apis/adapters/openai/transcription.ts`，wire 协议在 `packages/llm-core/src/providers/transcription.ts`（Whisper 风格 multipart `/v1/audio/transcriptions`，复用 `customEndpoints.audioTranscriptions` 端点配置）
- 典型场景：audio.cpp 本地 ASR 模型；audio.cpp `/v1/models` 返回的 `task` 字段由 `model-fetcher.ts` 推导为 `audio/asr` 等能力

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

### 5.4 思考参数与多渠道运行时对齐

在各种主流模型生态中，思考（Reasoning / Thinking）协议差异较大。适配器层针对各生态实现了精细的参数转换与流式解析：

1. **Gemini 思考参数 wire 映射**：
   Gemini 模型经 `openai` / `openai-compatible` 渠道（典型场景：本地 NewAPI 转发 Gemini 官方 Key）访问时，OpenAI Chat Adapter 为 Gemini 模型家族生成 Google 扩展结构，而不是顶层推理参数：

   ```json
   {
     "extra_body": {
       "google": {
         "thinking_config": {
           "thinking_level": "high",
           "include_thoughts": true
         }
       }
     }
   }
   ```
   - Gemini 3.x 使用 `thinking_level`；Gemini 2.5 预算型使用 `thinking_budget`；摘要开关映射为 `include_thoughts`。
   - 生成 Google 扩展后，不再并发发送冲突的顶层 `reasoning_effort` 或通用 `thinking` 对象。
   - 原生 Gemini Adapter 继续使用 `generationConfig.thinkingConfig`，不改为 OpenAI wire 格式。
   - 自动生成的 Google 配置与显式 `extra_body` 深度合并，显式 `google.thinking_config` 值优先。

2. **DeepSeek 思考控制与流式截断**：
   - 针对通过 OpenAI-compatible 协议接入的 DeepSeek 模型，如果显式配置了 `thinkingEnabled` 开关，请求构建器将其转换为：
     ```json
     {
       "extra_body": {
         "thinking": {
           "type": "enabled" // 或 "disabled"
         }
       }
     }
     ```
   - 流式响应解析中，自动识别 `reasoning_content` delta 块并在首个正文文本 delta 到达时平滑衔接，防止思考过程溢出或由于非结构化流截断导致前端渲染崩溃。

3. **Claude 思考参数与自适应配置**：
   - Anthropic 适配器支持通过 `thinkingEnabled` 与 `thinkingBudget` 配置扩展思考，自动向上游注入 `thinking: { type: "enabled", budget_tokens: N }`。
   - 自动附加 `anthropic-beta: thinking-2025-12-05` 标头，流式解析中独立解包 `thinking_delta` 与普通 `text_delta`。

4. **OpenAI Responses 推理摘要流式解析**：
   - 适配 OpenAI 官方 `/v1/responses` 接口中最新的推理摘要结构（`summary_text`）。
   - 在流式接收 `response.reasoning_summary_text.delta`、`response.reasoning_summary_text.done` 与 `response.reasoning_summary_part.done` 时，精准保留推理摘要的阶段边界（如各思考阶段的双换行分段），并在流式完成后根据完整性优先保留完整摘要。

5. **Azure OpenAI 运行时适配**：
   - Azure deployment 风格接口通过 `azureOpenAiAdapter` 复用 OpenAI wire format，自动将标准 Chat Completions / Embeddings 转换为 Azure endpoint 规范：
     `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...`
   - 自动剔除 `Authorization: Bearer`，转换为 Azure 专用的 `api-key` 请求头鉴权。

---

## 6. 最佳实践

- **能力驱动开发**: 业务逻辑应依赖 `ModelCapabilities` 检测（如 `capabilities.thinking`），而非硬编码模型 ID
- **利用 Request Builder**: 优先使用 `filterParametersByCapabilities` 和 `cleanPayload` 处理请求体，确保 API 兼容性
- **统一媒体处理**: 新 Provider 的图片、音频、视频、音乐和模型列表协议优先实现于 `@aiohub/llm-core`，应用目录只保留 Profile、业务参数和响应兼容映射
- **文件引用**: 大文件使用 tagged `LocalFileRef`，不要在 Facade 中预读成 Base64；Provider JSON、multipart part 与顶层请求体均已有明确契约
- **Key 管理**: 多 Key 配置且开启自动熔断后，合理配置 `autoRecoveryTime`，429 熔断后自动恢复；单 Key 或无多渠道容灾时保持默认关闭
- **代理策略**: 桌面外部请求默认走 Rust 代理，可通过 `networkStrategy: "native"` 直连；涉及 `LocalFileRef` 或兼容期 `local-file://` 时始终走 Rust 原生文件路径，不能把路径或引用对象直接发送给 Provider
