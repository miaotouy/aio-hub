# LLM Provider Adapter 多端共享与 Rust 边界调查

> 状态：实施中（阶段 0 移动端首批与阶段 1.5 移动端 OpenAI-Compatible 解耦已完成）
>
> 最后更新：2026-07-15
>
> 移动端校准基线：`af864a1f0a8ac82d46460e80bf6cdc8df862f466`
>
> 关联现状文档：[`docs/architecture/llm-apis-architecture.md`](../architecture/llm-apis-architecture.md)

## 实施进度（2026-07-15）

已完成首个可验证批次：

- 新增 `packages/llm-core` Bun workspace，并由桌面端和移动端通过 `@aiohub/llm-core` 引用。
- 建立纯 TypeScript 的 canonical `LlmRequest`、`LlmResponse`、`ProviderAdapter`、`WireRequest`、`WireResponse`、`LlmTransport`、Observer 和流式事件类型。
- 为 JSON、multipart 和顶层请求体定义显式 `LocalFileRef`，并提供严格 tagged 校验与嵌套引用检测，避免把普通 Provider JSON 误判为本地文件。
- 实现与应用框架无关的增量 SSE / JSONL 分帧器，覆盖 UTF-8 跨 chunk、逐字节切块、CRLF/LF、粘包、流末尾无换行、`[DONE]` 和取消。
- 将桌面端与移动端原有 `sse-parser` 入口改为共享 Core 的兼容 Facade；现有 Adapter 导入路径和调用签名不变。
- 将两端正文与推理 delta 提取逻辑合并为共享实现，保留 OpenAI、OpenAI Responses、DeepSeek/OneAPI、Claude、Gemini、Vertex AI、Cohere 和 Hugging Face 行为并集。
- 共享包独立类型检查通过，独立 Vitest 共 23 个用例通过；桌面 SSE 回归 3 个用例、移动端现有 5 个用例、移动端类型检查和两端 Vite 构建通过。

已完成第二个可验证批次：

- 将移动端 `useLlmRequest` 的 Profile Store、KeyManager、Provider 执行器、logger 和 error handler 收束为显式 `LlmRequestDependencies`，新增可直接测试的 `createLlmRequest`；现有无参 `useLlmRequest()` 入口和 Provider 分派行为保持不变。
- 冻结 `sendRequest(options, profileId?)` 的首批 Facade 契约：显式 Profile 覆盖当前选中 Profile、默认流式与 5 分钟超时、Profile 网络选项注入、Key 轮询结果注入、成功/失败上报及错误重抛。
- 覆盖 Agent 已接线的 `maxTokens`、`temperature`、`topP`、`frequencyPenalty`、`presencePenalty`、`stop` 透传，并验证正文流、推理流和最终 API usage 三条交付路径保持独立且无丢失。
- 新增移动端 OpenAI-Compatible wire payload 基线，覆盖 URL、鉴权/自定义 Header、标准生成参数映射和未知 Provider 扩展参数透传。
- 新增 OpenAI-Compatible 固定 SSE fixture，验证正文 delta、推理 delta、详细 usage 和 `[DONE]` 的解析结果；移动端 Vitest 现为 10 个用例，移动端类型检查通过。

已完成第三个可验证批次：

- 将移动端 OpenAI-Compatible 的请求构建与非流式响应解析拆成可独立调用的纯函数，并通过 `createOpenAiCompatibleApi` 显式注入 Transport、响应状态校验和 logger；现有 `callOpenAiCompatibleApi(profile, options)` 兼容入口保持不变。
- 修正自定义 Chat Completions 端点构建时未传入 Profile 的问题，纯 builder 现可直接覆盖自定义相对端点、Header 和最终 Provider body。
- 将 `relaxIdCerts`、`http1Only` 收束为 Transport 控制字段：它们会进入移动网络层，但不再被未知参数透传机制误写入 Provider JSON。
- OpenAI-Compatible 单测不再通过模块 mock 劫持平台网络函数，改为直接注入测试 Transport，并新增纯 builder、自定义端点和非流式拒绝响应覆盖。
- 共享包 23 个用例、移动端全量 12 个用例、移动端与桌面端类型检查及两端 Vite 生产构建通过；构建仅保留既有的第三方 `vconsole` eval、大 chunk 和动态导入提示。

实施顺序相对原计划有一处受控调整：仓库已经存在多组 Provider Adapter 单测，因此先落地阶段 1 的无业务侵入骨架和公共分帧器，再继续补齐阶段 0 的完整 wire fixture、两端差分记录和性能基线。现阶段阶段 0 已完成移动端 Facade 与 OpenAI-Compatible 首批基线，但其他 Provider fixture、两端差分记录和性能基线仍未完成；阶段 1.5 已完成移动 Facade 及移动端 OpenAI-Compatible 的 Transport/logger 隔离，其余移动端 Provider 与桌面 Adapter 仍待解耦，也尚未进入阶段 2 的共享 OpenAI-Compatible 迁移。

此前记录的全仓验证阻塞均已处理：Smart OCR 历史表格引用改用 Element Plus 导出的 `TableInstance`；OpenAI Adapter 测试已与第三方兼容模型支持 `reasoning_effort` 的现行契约对齐，并保留不支持模型的负向覆盖；聊天草稿测试将一次性模块加载移出 `beforeEach`，避免全量并发时触发 hook 超时。桌面 `check:frontend`、根 Vitest 全集（59 个测试文件、417 个用例）及桌面 Vite 生产构建均已通过。

## 1. 背景

AIO Hub 桌面端与移动端都包含 LLM Provider 适配能力，但目前分别维护实现：

- 桌面端适配器位于 `src/llm-apis/`，覆盖聊天、Responses、Embedding、图片、音频、视频等能力。
- 移动端适配器位于 `mobile/src/tools/llm-api/core/adapters/`，独立实现 OpenAI、OpenAI Responses、Claude、Gemini、Cohere、Vertex AI 等协议。
- 桌面端默认通过 `src-tauri/src/commands/llm_proxy.rs` 中的 Rust 代理访问上游，但 Provider 请求结构构建和响应语义解析仍在 TypeScript 中完成。

初步讨论曾考虑将整个 LLM 渠道适配器下沉到 Rust，以统一桌面端和移动端实现。进一步调查后，本文件建议调整方向：

> **Provider 请求结构构建与响应语义解析继续使用共享 TypeScript；Rust 仅承担稳定、系统相关的 Transport 能力。**

该方案优先解决多端重复实现和大请求传输问题，同时避免 Provider 协议变化导致频繁 Rust 编译和双端原生构建。

## 2. 调查结论

### 2.1. 推荐决策

1. 新建纯 TypeScript 的共享 LLM Provider Core，供桌面端和移动端共同使用。
2. 将当前 Adapter 拆分为请求构建、非流式响应解析和流式响应解析三个纯逻辑部分。
3. 通过依赖注入提供平台 Transport、日志、Inspector 和运行时取消能力。
4. Rust 保留并增强网络代理、TLS、HTTP 版本、系统代理、本地文件读取、连接池和底层取消能力。
5. 不因“统一多端实现”而把 Provider 协议整体迁移到 Rust。
6. 只有在基准测试证明某段响应解析存在实际瓶颈，或需要脱离 WebView 后台运行时，才选择性下沉该能力。

### 2.2. 不建议整体下沉 Rust 的原因

Provider Adapter 属于变化频繁的协议防腐层，常见变更包括：

- 新增或调整请求字段。
- 修改自定义端点和请求头规则。
- 兼容第三方 OpenAI-Compatible 渠道的非标准行为。
- 扩展流式事件、reasoning artifact、tool call、usage 和媒体结果解析。
- 跟进 OpenAI Responses、Gemini、Claude 等上游协议演进。

这些工作在 TypeScript 中具备更快的开发反馈：

- 可使用 Vitest 快速验证请求体和响应 fixture。
- 不需要等待 Cargo 增量编译、Tauri 重启或移动端原生重新构建。
- 更容易检查和调试原始 JSON/SSE 数据。
- `Record<string, unknown>`、自定义参数和非标准响应兼容成本较低。

请求对象的字段映射和普通 JSON 解析通常不是性能瓶颈。当前更明显的成本来自大请求序列化、重复 JSON 编解码、Base64 跨边界传输和二进制流处理。

### 2.3. `af864a1f` 合并后的校准结论

本次移动端合并没有修改 `mobile/src/tools/llm-api/` 下的 Provider Adapter、请求类型或请求入口，因此“共享 TypeScript Provider Core + 平台 Transport”的主决策保持不变。合并后需要纳入迁移约束的是 Adapter 上下游已经扩展的业务契约：

- `useChatExecutor` 会优先使用智能体绑定的 Profile 和 Model，并将 `maxTokens`、`temperature`、`topP`、`frequencyPenalty`、`presencePenalty`、`stop` 传入 `useLlmRequest`。
- 移动端聊天运行时分别消费 `onStream` 和 `onReasoningStream`，最终再从 `LlmResponse` 合并正文、推理内容和 usage。
- `useChatResponseHandler` 优先使用 API 返回的 `promptTokens` / `completionTokens`，缺失时调用移动端 Rust Token Counting command 做本地估算。
- Agent Preset 注入、上下文 Token 风险计算、会话树和自动命名均位于 Provider Adapter 上游，不能随 Adapter 一起迁入共享 Core。
- 移动端已增加独立的 `test:run` 脚本，可以承担共享 Adapter 接入后的移动端契约与回归测试。

因此，阶段 0 不能只冻结 Provider wire fixture，还必须冻结当前移动端 `useLlmRequest.sendRequest(options, profileId?)` 的兼容入口，以及正文流、推理流、最终 usage 三类消费行为。共享事件模型可以作为 Core 内部的 canonical contract，但移动端迁移期间需要由兼容层映射回现有回调和最终响应，避免同时重构 LLM Chat。

## 3. 当前边界与问题

### 3.1. 当前桌面端链路

```text
useLlmRequest
  -> TypeScript Provider Adapter
  -> 构建 Provider 请求体并序列化
  -> fetchWithTimeout
  -> 解析已序列化 JSON
  -> 包装为 ProxyRequest 并再次序列化
  -> Axum localhost 代理
  -> Rust 反序列化 ProxyRequest
  -> reqwest 再次序列化 Provider body
  -> 上游 API
  -> 原始 SSE / JSON / 二进制响应
  -> localhost 代理转发
  -> TypeScript Provider Adapter 解析
  -> LlmResponse
```

其中 Provider 请求结构与响应语义都在 TypeScript，Rust 代理只理解通用 HTTP 请求。

### 3.2. 主要问题

#### 多端重复实现

桌面端与移动端分别维护 Provider Adapter，容易产生以下漂移：

- 同一 Provider 的字段支持不一致。
- 流式事件、usage、tool call 或 reasoning 解析行为不一致。
- 修复只落在其中一端。
- 测试用例和协议 fixture 重复建设。

#### 桌面端 JSON 重复编解码

对于普通 JSON 请求，当前代理路径会经历多次 parse/stringify。请求体结构构建本身成本不高，但重复处理会放大大型上下文和多模态请求的内存占用。

#### 大文件和 Base64 跨边界

项目历史上曾使用 Tauri IPC Channel 代理原始请求和响应，后因大型多媒体数据的 IPC 序列化与流处理成本改为 Axum 回环 HTTP。后续设计不能简单恢复旧 Channel 实现。

大文件应继续通过路径或资产引用交给 Rust 读取，避免 Base64 在 WebView、IPC 和 Rust 之间重复复制。

#### Adapter 与平台代码耦合

当前部分桌面 Adapter 直接依赖以下平台模块：

- `fetchWithTimeout`
- 应用 logger 和 error handler
- Inspector hook
- 设置页中的自定义 Header 模板解析
- 桌面路径别名

移动端则直接依赖自己的请求工具和类型。这些依赖使 Adapter 不能直接作为共享包使用。

#### 移动端业务层与请求入口的契约已加深

合并 `af864a1f` 后，移动端 `useLlmRequest` 不再只服务简单文本聊天。智能体绑定、预设注入、推理流展示、API usage 校准和生成速度统计都通过该入口串联。这里的耦合不应进入共享 Provider Core，但迁移必须提供稳定的 Facade：

- 保留显式 `profileId` 覆盖能力，不能退回只读取当前选中 Profile。
- 保留调用方已传入的标准生成参数和未知扩展参数；当前 Agent 已接线的六类参数不得丢失，参数清理仍由 Provider Adapter 完成。
- 同时交付正文增量和推理增量，并在完成时返回完整的 canonical response。
- 保留 API usage 的精度；本地 Token Counting 只作为聊天业务层回退，不能混入 Provider 解析。

#### 回环代理安全边界

当前 Axum 服务绑定 `127.0.0.1`，使用宽松 CORS，并接受调用方提供的目标 URL、Headers 和 Body。即使暂不移除回环代理，也应增加每次应用启动生成的 capability token，并收紧 Origin/CORS 策略，避免它成为无鉴权的本地通用 HTTP 代理。

## 4. 目标架构

```mermaid
flowchart TD
    Desktop[桌面端业务层] --> Core[共享 TypeScript LLM Core]
    Mobile[移动端业务层] --> Core

    Core --> Builder[Provider Request Builder]
    Core --> Parser[Provider Response Parser]
    Core --> Stream[Provider Stream Decoder]

    Builder --> Transport[LlmTransport 接口]
    Transport --> DesktopTransport[桌面 Rust Proxy Transport]
    Transport --> MobileTransport[移动端 Tauri HTTP Transport]

    DesktopTransport --> DesktopRust[桌面 Rust 网络层]
    MobileTransport --> MobileNative[移动端原生网络层]

    Desktop -.注入.-> Observer[Logger / Inspector Observer]
    Mobile -.注入.-> Observer
```

### 4.1. 共享 TypeScript Core 的职责

- 统一请求、响应和 Provider 类型。
- 根据统一请求构建 Provider wire payload。
- 构建 Provider URL 和 Headers。
- 解析非流式 JSON 响应。
- 对 SSE、JSONL 等流进行分帧和 Provider 语义解析。
- 归一化文本、推理、工具调用、usage、引用和媒体元数据。
- 保留 `extraBody`、自定义 Header 和自定义端点扩展能力。
- 提供纯函数和 fixture 测试，不直接访问应用状态。

### 4.2. 应用业务层保留的职责

- Profile 的 CRUD 和持久化。
- API Key 轮询、熔断和恢复。
- 模型能力与参数过滤策略。
- Agent Manager 的模型绑定、生成参数、预设消息和导入兼容字段。
- LLM Chat 上下文管道、会话树和持久化。
- 上下文 Token 预估、风险阈值、生成速度等会话指标。
- VCP 工具发现、审批、执行和迭代循环。
- UI 消息、错误展示和生成状态。
- Inspector 的界面状态和跨窗口同步。

### 4.3. Rust / 平台 Transport 的职责

- 执行通用 HTTP 请求。
- 系统代理、自定义代理和直连策略。
- TLS 证书策略和 HTTP/1.1、HTTP/2 控制。
- `reqwest::Client` 连接池复用。
- 本地文件和资产引用读取。
- 大型 JSON、multipart 和二进制请求传输。
- 原始响应状态、Headers 和 Body 流转发。
- 请求取消、连接超时和底层网络错误归一化。

Rust Transport 不应理解以下概念：

- OpenAI、Claude、Gemini 等 Provider 类型。
- `LlmProfile`、`ModelCapabilities` 或智能体配置。
- Provider 请求字段和响应事件含义。
- VCP 工具调用或聊天会话状态。

## 5. 建议的共享包结构

推荐使用独立 Bun workspace package，而不是让移动端继续跨目录引用桌面端源码。

```text
packages/llm-core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── request.ts
│   │   ├── response.ts
│   │   ├── transport.ts
│   │   └── provider.ts
│   ├── providers/
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── gemini/
│   │   ├── cohere/
│   │   └── vertexai/
│   ├── request-builder/
│   ├── response-parser/
│   ├── stream-parser/
│   └── utils/
└── tests/
    └── fixtures/
```

根 `package.json` 的 workspace 配置届时需要加入 `packages/*`。

### 5.1. 共享包约束

共享包不得直接依赖：

- Vue、Pinia、Element Plus、Varlet。
- 桌面端或移动端 Store。
- `@tauri-apps/*`。
- DOM UI 元素和组件生命周期。
- 应用级 logger、error handler 或 Inspector 单例。
- `@/` 等绑定单一应用 Vite root 的路径别名。
- `src/views/`、`mobile/src/views/` 等 UI 目录。

允许使用的运行时基础类型包括：

- `Uint8Array`
- `AbortSignal`，但只能出现在运行时 TransportOptions 中，不能进入可序列化请求 DTO。
- `AsyncIterable<Uint8Array>` 或项目自定义流接口。
- JSON-safe 数据结构。

## 6. 接口草案

### 6.1. Provider Adapter

```typescript
export interface ProviderAdapter {
  readonly id: string;

  buildRequest(
    profile: ProviderProfile,
    request: LlmRequest
  ): Promise<WireRequest> | WireRequest;

  parseResponse(response: WireResponse): Promise<LlmResponse>;

  createStreamDecoder(context: StreamDecoderContext): ProviderStreamDecoder;
}
```

`buildRequest` 只负责协议映射，不直接执行网络请求。

### 6.2. Wire Request

```typescript
export interface LocalFileRef {
  kind: "local-file-ref";
  path: string;
  contentType?: string;
}

export type WireJsonValue =
  | JsonPrimitive
  | LocalFileRef
  | WireJsonValue[]
  | { [key: string]: WireJsonValue };

export interface WireRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: WireBody;
  streaming: boolean;
}

export type WireBody =
  | { kind: "json"; value: WireJsonValue }
  | { kind: "text"; value: string; contentType?: string }
  | { kind: "bytes"; value: Uint8Array; contentType: string }
  | { kind: "multipart"; parts: MultipartPart[] }
  | { kind: "file-ref"; ref: LocalFileRef };
```

Provider Adapter 构建由 JSON 值和受控 `LocalFileRef` 组成的结构化 payload；Transport 负责校验文件引用并进行一次最终序列化。`LocalFileRef` 还必须允许作为 multipart part 的数据源，不能只覆盖“整个请求体就是一个文件”的少数场景。普通 Provider JSON 不得被误判为文件引用。

### 6.3. Transport

```typescript
export interface LlmTransport {
  send(request: WireRequest, options: TransportOptions): Promise<WireResponse>;
}

export interface TransportOptions {
  requestId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  network?: NetworkOptions;
  observer?: TransportObserver;
}

export interface WireResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
}
```

共享 Adapter 只依赖 `LlmTransport` 接口，不关心桌面端使用 Axum 代理还是移动端使用 Tauri HTTP 插件。

### 6.4. 流式 Decoder

```typescript
export type LlmStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "tool-call"; toolCall: LlmToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "partial-image"; asset: MediaAssetRef; index: number }
  | { type: "completed"; response: LlmResponse };

export interface ProviderStreamDecoder {
  push(chunk: Uint8Array): LlmStreamEvent[];
  finish(): LlmStreamEvent[];
}
```

Decoder 自己维护 UTF-8 边界、SSE/JSONL 缓冲和 Provider 累积状态。调用方消费统一事件，不再通过多个可选回调拼装最终结果。

移动端首次接入时不要求同步改造 LLM Chat。应用侧 Facade 应将 `text-delta` 映射到现有 `onStream`，将 `reasoning-delta` 映射到 `onReasoningStream`，并将 `completed.response` 返回给 `useChatResponseHandler`。`usage`、`reasoningContent`、`finishReason`、`toolCalls` 和 annotations 必须以最终 response 为准，流式事件不能导致最终结果缺字段。

### 6.5. Observer

```typescript
export interface TransportObserver {
  onRequest?(event: TransportRequestEvent): void;
  onResponseStart?(event: TransportResponseStartEvent): void;
  onResponseChunk?(event: TransportChunkEvent): void;
  onError?(event: TransportErrorEvent): void;
}
```

桌面端可通过 Decorator 或 `TransportOptions.observer` 注入 Inspector。共享 Provider Adapter 不应直接导入 `inspectorHookRegistry`。

## 7. Rust Transport 优化方向

### 7.1. 拆分 raw 与 json-expand 路径

建议将当前 `/proxy` 拆分为两个明确路径：

#### `/proxy/raw`

- 原样转发 JSON、文本、二进制和 multipart。
- 不解析 Provider 请求体。
- 避免 TypeScript `JSON.parse`、ProxyRequest 包装和 Rust `.json()` 再序列化。
- 支持原始 method，而不是固定为 POST。

#### `/proxy/json-expand`

- 仅用于包含 `local-file://` 或后续结构化 FileRef 的 JSON 请求。
- Rust 解析一次 JSON，读取并展开本地文件，再序列化一次发送上游。
- 保持现有大文件不经过 IPC/Base64 的设计目标。

### 7.2. Client 池

当前代理每次请求重新构建 `reqwest::Client`。后续应按以下网络策略组合缓存 Client：

- proxy mode / proxy URL
- relax invalid certs
- HTTP/1.1 only
- 其他会影响 ClientBuilder 的稳定选项

目标是复用连接池和 TLS 会话，避免每次请求重新创建 Client。

### 7.3. 回环代理鉴权

启动代理时生成随机 capability token，通过 `start_llm_proxy_server` 返回给当前 WebView。每个代理请求必须携带该 token，Rust 端验证后才允许转发。

同时应：

- 移除 `CorsLayer::permissive()`。
- 仅允许实际 Tauri WebView 所需的 Origin 和 Headers。
- 不把 capability token 持久化到磁盘。
- 应用重启后使旧 token 自动失效。

### 7.4. 不恢复旧式原始 Channel 代理

如果未来使用 Tauri Channel，应只发送小型、批量后的规范化事件，不能传输大块 Base64 或二进制，也不能在 Channel 接收端累积完整响应后才构造结果。

在 Provider 解析继续保留于 TypeScript 的前提下，现阶段保留流式 HTTP Response 比把原始字节改走 Channel 更直接。

## 8. 迁移计划

### 阶段 0：契约冻结与基线测试

- 为桌面端现有 Adapter 补齐请求体 snapshot/fixture。
- 收集 OpenAI Chat、Responses、Claude、Gemini、Cohere、Vertex 的流式响应 fixture。
- 覆盖 UTF-8 跨 chunk、CRLF、粘包、拆包、`[DONE]`、异常事件和中途取消。
- 记录桌面端与移动端当前行为差异。
- 以 `af864a1f` 为移动端基线，冻结 `sendRequest(options, profileId?)` Facade 契约。
- 覆盖智能体 Profile/Model 优先级、生成参数透传、正文/推理双流和最终 usage 回填。
- 建立大文本、本地文件和媒体请求的序列化时间及内存基线。

### 阶段 1：建立共享包骨架

- 新增 `packages/llm-core` workspace。
- 迁移统一 JSON 类型、WireRequest、WireResponse 和 Adapter 接口。
- 迁移通用 SSE/JSONL 分帧器和纯工具函数。
- 配置独立 Vitest 测试，不依赖桌面端或移动端 alias。

### 阶段 1.5：原地解耦应用依赖

- 在桌面端原地将 `fetchWithTimeout`、logger、error handler、Inspector 和 Header 模板解析抽到 Facade、Transport 或 Observer。
- 在移动端原地隔离 `@tauri-apps/plugin-http`、Store 和 `useLlmKeyManager`，使 Adapter 只接收显式 Profile、Request 和平台依赖。
- 保持桌面端 `useLlmRequest` 和移动端 `sendRequest(options, profileId?)` 的现有业务入口不变。
- 为旧 Adapter 与新纯 Adapter 建立差分测试，确认解耦本身不改变 wire payload 和解析结果。

### 阶段 2：迁移 OpenAI-Compatible

- 将 OpenAI Chat 请求构建与响应解析抽为纯 Adapter。
- 桌面端通过 Transport 注入继续使用现有 Rust 代理。
- 保持现有 `useLlmRequest`、KeyManager、Inspector 和 UI 行为不变。
- 使用差分测试比较迁移前后的请求体和最终响应。

### 阶段 3：接入移动端

- 移动端使用共享 OpenAI-Compatible Adapter。
- 注入移动端 Transport、logger 和 error mapping。
- 先通过兼容 Facade 映射 `text-delta`、`reasoning-delta`、`usage` 和 `completed`，不在同一批次重构 LLM Chat。
- 验证智能体绑定的 Profile/Model 优先级，以及当前已接线的 `maxTokens`、`temperature`、`topP`、`frequencyPenalty`、`presencePenalty`、`stop` 仍能进入共享请求构建器。
- 保持 API usage 优先、本地 Rust Token Counting 回退的现有策略；Token Counting 不进入共享 Provider Core。
- 删除移动端对应的重复 Adapter 实现。
- 验证 Android/iOS 流式读取、取消和后台切换行为。

### 阶段 4：迁移其他 Provider

建议顺序：

1. OpenAI Responses
2. Anthropic Claude
3. Gemini
4. Cohere
5. Vertex AI
6. Embedding 与模型列表
7. 图片、音频、视频和音乐等媒体 Adapter

每个 Provider 单独迁移、验证和删除重复实现，不进行一次性目录搬迁。

### 阶段 5：优化 Rust Transport

- 实现 `/proxy/raw` 和 `/proxy/json-expand`。
- 增加 Client 池。
- 增加 capability token 和严格 CORS。
- 重新测量 JSON 编解码次数、峰值内存和 TTFB。
- 根据实测结果决定是否还需要下沉任何响应解析逻辑。

## 9. 测试策略

### 9.1. 请求构建测试

每个 Provider 至少覆盖：

- 最小文本请求。
- System/User/Assistant 多轮消息。
- 多模态内容。
- 工具定义、tool choice 和 tool result。
- 推理参数和 reasoning artifact 回放。
- 自定义 Header、端点和 `extraBody`。
- 参数清理和未知参数透传。

测试应比较最终 WireRequest，而不是只验证中间辅助函数。

### 9.2. 流式解析测试

同一个 fixture 必须以多种切块方式输入 Decoder：

- 完整事件一个 chunk。
- 每个字节一个 chunk。
- UTF-8 多字节字符中间切断。
- 多个事件粘在一个 chunk。
- CRLF 与 LF 混合。
- 流末尾无换行。

无论切块方式如何，输出的 `LlmStreamEvent[]` 和最终 `LlmResponse` 必须一致。

### 9.3. Transport 合约测试

桌面和移动 Transport 应共享一套合约用例：

- 状态码与 Headers 保真。
- 非流式 JSON 和文本响应。
- SSE 持续传输。
- 用户取消。
- TTFB 超时和流中断。
- 本地文件引用。
- multipart 与二进制响应。

### 9.4. 移动端 Facade 回归测试

- 显式 `profileId` 覆盖当前选中 Profile，且 Key 轮询/熔断仍作用于最终选中的 Profile。
- Agent 的 `maxTokens`、`temperature`、`topP`、penalty 和 stop 参数无损进入 WireRequest。
- `text-delta` 与 `reasoning-delta` 分别且有序地进入现有两个回调。
- 流结束后返回的 `LlmResponse` 保留 usage、reasoning、finish reason、tool calls 和 annotations。
- API usage 缺失时仍由聊天业务层触发本地 Token Counting 回退；共享 Core 不伪造 usage。
- 取消、超时和 Provider 错误仍能触发 KeyManager 上报与当前错误处理路径。

### 9.5. 构建验证

实施阶段每个迁移批次至少执行：

- `bun run check:frontend`
- `bun run build`
- `cd mobile && bun run test:run`
- `cd mobile && bun run check:frontend`
- `cd mobile && bun run build`

涉及 Rust Transport 时额外执行对应桌面端和移动端后端检查。

## 10. 验收标准

### 架构验收

- 桌面端和移动端使用同一个 Provider Adapter 实现。
- 共享包不导入 Vue、Pinia、Tauri、应用 Store 或 UI 模块。
- Provider Adapter 不直接执行 fetch/invoke。
- Transport 不理解 Provider 语义。
- Inspector、logger 和错误处理通过注入或包装接入。

### 行为验收

- 同一请求在桌面端和移动端生成等价 WireRequest。
- 相同响应 fixture 在两端得到等价的 LlmResponse 和流式事件。
- Key 轮询、熔断、取消、超时和主动 interrupt 行为无回归。
- reasoning artifact、tool call、usage、annotations 和媒体元数据不丢失。
- `extraBody` 与非标准 OpenAI-Compatible 字段保持兼容。
- 移动端智能体绑定的 Profile、Model 和生成参数在迁移后保持等价。
- 正文流、推理流和最终 response 三条交付路径不重复、不丢失且顺序稳定。
- API usage 缺失时仍可走移动端本地 Token Counting 回退，Core 不生成虚假的精确 usage。

### 性能验收

- 普通 JSON 代理路径不再进行不必要的重复 parse/stringify。
- 本地大文件不会以 Base64 穿过 Tauri IPC。
- 流式输出不会等待完整响应结束后才交付给 UI。
- 峰值内存和主线程阻塞不高于迁移前基线。

### 安全验收

- 回环代理请求必须携带当次运行有效的 capability token。
- 不再使用任意 Origin 可访问的宽松 CORS。
- Rust 只读取明确标记的本地文件引用。
- 日志和 Inspector 不意外持久化 API Key 或 capability token。

## 11. 风险与应对

| 风险                                | 影响                        | 应对                                                |
| ----------------------------------- | --------------------------- | --------------------------------------------------- |
| 当前 Adapter 混入 UI/Store 依赖     | 无法直接迁移共享包          | 先通过 Transport、Observer、HeaderResolver 接口解耦 |
| 桌面与移动类型已发生漂移            | 共享类型迁移困难            | 先建立 canonical DTO，再写兼容转换层                |
| 第三方 OpenAI-Compatible 行为不标准 | 严格类型导致兼容下降        | 保留 JsonValue、extraBody 和 Header 扩展口          |
| 流式解析重构造成边界问题            | 丢字、重复字或完成状态异常  | 使用多切块 fixture 和差分测试                       |
| 媒体请求包含大二进制                | 共享层或 IPC 内存膨胀       | 使用 FileRef/AssetRef，Transport 负责读取和上传     |
| Workspace/alias 配置不一致          | Vite 或 Vitest 构建失败     | 共享包只用包内相对路径和 package exports            |
| 移动端聊天依赖旧回调式流接口        | 接入共享 Decoder 时行为回归 | 先保留 Facade 映射，再单独迁移消费接口              |
| usage 缺失或字段命名不一致          | Token 展示和上下文风险失真  | fixture 覆盖 Provider usage，并保留应用层本地回退   |
| 一次迁移范围过大                    | 难以定位回归                | 按 Provider 逐个迁移，保留短期 fallback             |

## 12. 暂不实施的内容

本计划不包含：

- 将 LLM Chat 会话和上下文管道迁移到 Rust。
- 将 VCP 工具调用引擎迁移到 Rust。
- 将 Profile 或 KeyManager 的持久化迁移到 Rust。
- 将 Agent Manager、Preset 注入或移动端 Token Counting command 纳入共享 Provider Core。
- 立即移除所有桌面端 Adapter 文件。
- 立即使用 Tauri Channel 替代所有流式 HTTP 响应。
- 在没有基准测试的情况下迁移 Provider 响应解析到 Rust。

## 13. 最终建议

多端共享 TypeScript Provider Adapter 在技术上不存在明显阻碍，关键不在语言，而在依赖边界。优先将 Adapter 改造成纯协议模块，再通过 Transport 和 Observer 注入平台能力，可以同时获得：

- 桌面与移动协议行为一致。
- Provider 适配保持快速开发和测试反馈。
- Rust 专注处理其擅长的网络、文件和系统能力。
- 避免为高频 Provider 变更承担不必要的原生编译负担。
- 后续仍保留按实测结果选择性下沉的空间。

因此，建议以“**共享 TypeScript Provider Core + 平台 Transport**”作为下一阶段的正式演进方向。

## 14. 架构师审查意见与补充 (Gugu's Review)

在对桌面端 `src/llm-apis/`、移动端 `mobile/src/tools/llm-api/core/adapters/` 以及 Rust 端 `llm_proxy.rs` 进行深度源码审查后，补充以下关键工程与安全设计，以确保方案落地时的健壮性：

### 14.1. 安全防线：Capability Token 强鉴权

当前 Rust 端的 Axum 代理服务绑定在 `127.0.0.1` 且使用了宽松的 CORS 策略，这在本地多应用共存环境下存在潜在的安全隐患（如恶意网页通过本地回环读取敏感文件或盗用 API Key）。

- **设计补充**：
  1.  **Token 签发**：Tauri 启动并调用 `start_llm_proxy_server` 时，在 Rust 端生成一个随机的 `uuid`（Capability Token），仅保存在内存中。
  2.  **Token 传递**：将此 Token 作为 `ProxyServerInfo` 的一部分返回给前端 WebView。
  3.  **请求校验**：前端在向本地代理发送请求时，必须在 Header 中携带 `X-Proxy-Token: <token>`。
  4.  **严格 CORS**：Rust 端的 Axum 拒绝任何不带正确 Token 或 Origin 不匹配的请求。

### 14.2. 内存优化：WireBody 与结构化内容显式支持 FileRef

为了避免大文件（如音视频、大图片）在 TS 端被读取为 `Uint8Array` 导致 WebView 内存暴涨，需要在 `WireBody`、JSON 结构化内容和 multipart part 中显式支持 `LocalFileRef`（即本地路径或资产 ID）。只给顶层 `WireBody` 增加文件分支并不足以覆盖 Provider 常见的嵌套多模态 JSON。

- **设计补充**：
  ```typescript
  export type WireBody =
    | { kind: "json"; value: WireJsonValue }
    | { kind: "text"; value: string; contentType?: string }
    | { kind: "bytes"; value: Uint8Array; contentType: string }
    | { kind: "multipart"; parts: MultipartPart[] }
    | { kind: "file-ref"; ref: LocalFileRef };
  ```
  当整个请求体就是本地文件时可使用顶层 `file-ref`；当文件位于 Provider JSON 或 multipart 中时，应在对应叶子节点放置 tagged `LocalFileRef`。桌面端 Transport 仅对包含嵌套引用的 JSON 走 `/proxy/json-expand`，顶层文件和 multipart 则走对应的 raw/upload 路径，由 Rust 读取并上传，**文件内容全程不经过 WebView 内存**。

### 14.3. 迁移步骤微调：阶段 1.5 依赖解耦

目前桌面端的部分 Adapter 隐式依赖了 `fetchWithTimeout`、`logger` 和 `inspectorHookRegistry`，移动端 Adapter 则直接依赖 Tauri HTTP 与应用类型。在把代码搬到 `packages/llm-core` 之前，必须在两端**原地**进行解耦，将这些依赖抽象为接口，通过构造函数或配置项注入（Dependency Injection），避免搬迁到共享包时引发大面积的编译报错。该步骤已正式并入第 8 节迁移计划。
