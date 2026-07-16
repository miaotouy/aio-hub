# LLM 渠道检查改进调查与实施计划

> 状态：已实施
>
> 最后更新：2026-07-15
>
> 适用范围：桌面端 LLM 服务设置；共享探测核心应保持可供移动端复用
>
> 关联文档：[`docs/architecture/llm-apis-architecture.md`](../architecture/llm-apis-architecture.md)、[`docs/Plan/llm-provider-adapter-sharing-investigation.md`](./llm-provider-adapter-sharing-investigation.md)、[`docs/design/mobile-llm-model-probe-interaction-design.md`](../design/mobile-llm-model-probe-interaction-design.md)

## 1. 背景

AIO Hub 已经建立共享 `@aiohub/llm-core`、canonical 请求/响应、Provider Adapter、Executor 和平台 Transport，但设置页中的渠道检查仍停留在较轻量的 UI Composable：

- “测试连接”只调用模型列表接口。
- 模型检查和 Key 检查直接调用 `useLlmRequest.sendRequest()`。
- 检查结果只通过临时消息展示，没有统一的结果、阶段和错误分类。
- 模型检查缺少批量执行、取消、结构化失败详情和能力级探测模板。

### 1.1. 最终 UI 集成

模型检查复用设置页现有的模型列表，不在列表下方再渲染一套独立模型表格：

- 原模型行的“测试模型”按钮打开统一的模型检查弹窗，并默认选中当前模型。
- 原模型列表头提供批量检查入口，复用同一个弹窗和同一套探测状态。
- 检查结果以状态和耗时回显在原模型行，完整阶段、HTTP、TTFB、Usage 与响应摘要在弹窗中查看。
- 切换渠道时清理当前检查结果和运行状态，避免相同模型 ID 复用旧渠道结果。

本计划基于 AIO Hub 当前实现，并调查以下两个本地项目的渠道检查方案：

| 项目             | 调查基线    | 主要参考点                                                               |
| ---------------- | ----------- | ------------------------------------------------------------------------ |
| `E:\git\sub2api` | `d515c30`   | 独立健康检查 Adapter、算术挑战、请求模板覆盖、SSRF 防护、定时监控        |
| `E:\git\new-api` | `c99eadb4a` | 复用正式 Relay Adaptor、能力端点探测、模型批测、错误分类、自动禁用与恢复 |
| AIO Hub          | `335f70984` | 共享 Provider Core、Executor、桌面/移动 Transport、模型能力元数据        |

## 2. 调查结论

### 2.1. 推荐决策

AIO Hub 不新增第二套协议级 `HealthProbeAdapter`，而是在现有 Provider Adapter 和 Executor 之上增加探测编排层：

```text
当前 Profile 快照
  -> ProbePlanResolver
  -> 现有 Provider Adapter / Executor / Transport
  -> ProbeValidator
  -> ProbeResult
  -> 可选 KeyHealthPolicy
```

该方案组合三方优势：

- 沿用 AIO Hub 的纯协议核心和多端共享边界。
- 采用 `new-api` 的“测试走正式适配器”原则，避免测试协议与真实请求漂移。
- 吸收 `sub2api` 的严格成功判定、敏感信息处理和可控探测模板思想。

### 2.2. 不采用的方向

- 不复制 `new-api` 的大而全 `Adaptor` 接口；聊天、Embedding、同步媒体、异步媒体和模型列表继续使用独立能力契约。
- 不在 UI Composable 中再实现一次 URL、Header、请求体或流式解析逻辑。
- 不使用模型名称包含 `embed`、`rerank` 等字符串作为首要分派依据；优先读取模型对象自身的 `capabilities`。
- 不在首批实现后台定时自动禁用渠道。AIO Hub 是本地客户端，服务端网关的自动摘除策略不能直接照搬。
- 不默认自动探测视频、音乐等高成本异步媒体能力。

## 3. AIO Hub 当前实现与问题

当前入口位于 `src/views/Settings/llm-service/composables/useConnectionTest.ts`。

### 3.1. 渠道连接检查语义不准确

`testConnection()` 只调用 `fetchModelsFromApi(editForm.value)`：

- 模型列表成功不代表推理权限正常。
- 某些渠道不支持模型列表，但聊天或其他能力可正常使用。
- 模型列表与推理端点可能使用不同权限。
- 当前只使用渠道的第一个 Key。

应将其拆成两个明确动作：

- **模型列表检查**：验证模型发现 URL、鉴权和响应解析。
- **推理检查**：使用指定模型执行最小真实请求。

### 3.2. Key 健康状态被重复上报

`sendRequest()` 已在成功和失败路径调用 KeyManager 的 `reportSuccess()` / `reportFailure()`，`handleTestKey()` 外层又调用一次。这会造成一次检查被重复计数。

此外，`handleTestKey()` 捕获任意异常后直接写入 `isBroken: true`。以下错误不应直接判定 Key 已损坏：

- 模型不存在或不支持目标能力。
- 请求参数或自定义端点配置错误。
- 请求被用户取消。
- 网络超时或临时断网。
- HTTP 429 限流。
- Provider 5xx 临时故障。
- 本地文件、代理或证书策略错误。

### 3.3. 检查对象可能不一致

- 模型列表检查直接使用当前 `editForm`。
- 模型和 Key 检查只传 `profileId`，`sendRequest()` 再从 Profile Store 读取配置。
- Profile 编辑采用 1 秒防抖保存，用户修改后立即检查时可能命中旧配置。

所有设置页检查都应使用同一个不可变 Profile 快照，不依赖防抖保存是否已经完成。

### 3.4. 能力覆盖不完整

当前最小请求只明确处理：

- Chat
- Embedding
- Rerank

图片、音频、视频和音乐模型没有对应探测策略。带媒体能力的模型可能进入正式媒体分派，却缺少 `prompt` 或其他必需字段，从而得到与渠道健康无关的失败。

### 3.5. 结果和交互能力不足

当前只展示成功/失败消息和总耗时，缺少：

- 失败阶段和稳定错误码。
- HTTP 状态、Provider 错误摘要和可展开详情。
- 总耗时与首字节耗时（TTFB）的区分。
- usage、响应内容或媒体资产摘要。
- 批量模型检查、并发限制和主动取消。
- 最近一次检查结果。
- 针对该 Composable 的直接自动化测试。

## 4. 参考项目分析

### 4.1. `sub2api`

`sub2api` 的 `providerAdapter` 只服务渠道监控，契约包含：

- `buildPath`
- `buildBody`
- `buildHeaders`
- `textPath`

其优点是探测逻辑轻量且边界清晰：

- 使用算术挑战验证 Provider 确实返回了有效模型内容。
- 支持 `off`、`merge`、`replace` 三种请求体模板模式。
- merge 模式保护 `model`、`messages`、`input`、`stream` 等关键字段。
- 使用 SSRF-safe HTTP Client、响应大小限制和敏感信息脱敏。
- 支持定时执行和聚合历史。

局限：

- 监控 Adapter 与正式网关协议实现分离，存在行为漂移风险。
- 当前只覆盖 OpenAI、OpenAI Responses、Grok、Anthropic 和 Gemini。
- 完整新增 Provider 仍要同步后端常量、默认值和前端选项，不是真正的单表注册。

### 4.2. `new-api`

`new-api` 的 `testChannel()` 复用正式 Relay Adaptor：

```text
构造类型化请求
  -> 渠道上下文和模型映射
  -> Convert*Request
  -> SetupRequestHeader
  -> DoRequest
  -> DoResponse
  -> 响应体/流式事件校验
```

其能力包括：

- Chat Completions、Responses、Responses Compact、Anthropic、Gemini。
- Embedding、Rerank 和图片生成。
- 非流式和流式测试。
- 单模型和批量模型测试；前端批量并发为 5。
- 响应时间持久化、定时系统任务、失败自动禁用和恢复启用。
- Header Override、参数覆盖、模型映射和代理配置与真实请求一致。

局限：

- `controller/channel-test.go` 超过千行，重复编排正式 Relay 的多个步骤。
- `Adaptor` 接口过宽，Provider 必须承载大量与自身无关的方法。
- `GetAdaptor()` 是大型中心化 `switch`。
- 自动端点选择存在模型名称启发式判断。
- 流式成功只要求出现一个非空 `data:` 事件，不要求 canonical 完成事件。
- 测试会消耗真实上游额度和限流配额。
- Provider Base URL 出于私网部署需要使用普通 Relay Client，不适合作为不可信 URL 的通用探测器。

## 5. 目标架构

### 5.1. 模块边界

实施后的模块边界如下：

```text
packages/llm-core/src/probe/
├── types.ts                 # 共享探测结果与错误契约
├── plan-resolver.ts         # 根据显式模型能力生成 canonical 最小请求计划
├── validator.ts             # canonical 响应语义校验
└── error-classifier.ts      # 跨端共享错误分类

src/views/Settings/llm-service/probe/
├── types.ts                 # 带桌面 Profile 快照的请求契约
├── key-health-policy.ts     # 探测结果到 Key 状态动作的映射
└── channel-probe-service.ts # Adapter 编排、TTFB 与批量执行
```

纯能力解析和结果契约如需移动端复用，应进一步下沉到 `packages/llm-core`；包含 Profile Store、KeyManager、UI 消息或 Inspector 的逻辑必须保留在应用层。

### 5.2. 探测请求契约草案

```ts
export type ProbeKind = "model-list" | "inference" | "key" | "batch-model";

export type ProbeCapability =
  | "chat"
  | "embedding"
  | "rerank"
  | "image"
  | "audio"
  | "video"
  | "music";

export interface ChannelProbeRequest {
  kind: ProbeKind;
  profile: LlmProfile;
  modelId?: string;
  apiKey?: string;
  capability?: ProbeCapability;
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

约束：

- `profile` 必须是发起检查时生成的快照。
- Key 检查必须显式注入目标 Key，不参与轮询。
- Probe 不允许隐式修改传入 Profile 或模型对象。
- 视频和音乐只作为拒绝型 `ProbeCapability` 出现在结构化结果中，不生成请求计划，避免昂贵异步任务被误触发。

### 5.3. 结构化结果草案

```ts
export type ProbePhase =
  | "prepare"
  | "build-request"
  | "transport"
  | "response-status"
  | "decode"
  | "semantic-validation";

export type ProbeErrorCategory =
  | "authentication"
  | "authorization"
  | "rate-limit"
  | "bad-request"
  | "model-unavailable"
  | "unsupported-capability"
  | "configuration"
  | "network"
  | "timeout"
  | "provider"
  | "cancelled"
  | "unknown";

export interface ChannelProbeResult {
  success: boolean;
  kind: ProbeKind;
  capability?: ProbeCapability;
  modelId?: string;
  phase: ProbePhase;
  category?: ProbeErrorCategory;
  status?: number;
  totalMs: number;
  firstByteMs?: number;
  responsePreview?: string;
  usage?: TokenUsage;
  errorMessage?: string;
  testedAt: number;
}
```

禁止在结果中保存明文 API Key、完整鉴权 Header 或未经截断的上游错误体。

### 5.4. 能力探测模板

| 能力        | 默认最小请求                   | 成功判定                                                     |
| ----------- | ------------------------------ | ------------------------------------------------------------ |
| Chat        | `hi`，低输出 Token，默认非流式 | canonical 响应完成且正文、工具调用或其他有效输出至少一项存在 |
| Chat Stream | 同上，显式开启 stream          | 收到有效 delta，并最终收到 canonical `completed`             |
| Embedding   | 单条短文本                     | 至少一个有限数值向量且维度大于 0                             |
| Rerank      | 一条 query、两条短文档         | 至少一个合法排序结果，索引在输入范围内                       |
| Image       | 显式人工触发的低成本请求       | 至少一个可用媒体资产引用                                     |
| Audio       | 显式人工触发的短文本 TTS       | 返回非空二进制或可用音频资产                                 |
| Video/Music | 首批不支持                     | 明确返回 `unsupported-capability`，不得回退到 Chat           |

探测模板只定义 canonical 输入和语义判定，Provider URL、Header、Body 和响应解析继续由现有 Adapter 负责。

### 5.5. Key 健康策略

Probe Service 不直接写 `isBroken`，由 `KeyHealthPolicy` 决定动作：

| 分类                         | Key 状态动作                               |
| ---------------------------- | ------------------------------------------ |
| 明确的 401 或无效凭据错误    | 标记认证失败，可进入 broken                |
| 403 / 权限不足               | 记录失败，不直接判定 Key 永久损坏          |
| 400 / 请求格式或参数错误     | 记录 Probe 诊断，不修改 Key 健康状态       |
| 429                          | 进入限流/冷却语义，不标记 broken           |
| 模型不存在、能力不支持       | 不修改 Key 健康状态                        |
| 配置、端点、参数错误         | 不修改 Key 健康状态                        |
| 超时、网络错误、Provider 5xx | 交给既有失败阈值和熔断策略，不单次直接判坏 |
| 用户取消                     | 不记录失败                                 |
| 成功                         | 只上报一次成功并清理对应临时错误           |

必须删除 `handleTestKey()` 与 `sendRequest()` 之间的重复成功/失败上报。

## 6. UI 与交互建议

### 6.1. 渠道级动作

- 将现有“测试连接”改为“检查模型列表”。
- 新增“检查推理”主动作，允许选择一个模型。
- 两类结果分别展示，避免模型列表成功被理解为完整可用。

### 6.2. 模型检查面板

- 展示模型、能力、状态、总耗时、TTFB 和错误摘要。
- 支持单行检查和选中模型批量检查。
- 批量并发默认 3，后续可配置，避免本地客户端快速触发 Provider 限流。
- 使用一个批量 `AbortController`；停止时取消在途请求，而不是只停止后续批次。
- 流式开关只在 Chat 能力可用时展示。
- 图片和音频探测必须显示会产生真实调用成本，并由用户显式触发。
- 视频和音乐首批显示“不支持自动检查”，不允许静默回退到聊天请求。

### 6.3. 结果呈现

- 成功结果显示耗时、响应摘要和 usage。
- 失败结果显示稳定分类和短摘要，可展开查看已脱敏详情。
- Inspector 继续使用 `purpose: "system-probe"`，并补充 Probe kind、phase 和 capability 上下文。
- 最近结果默认保留在页面运行态；是否跨重启持久化在后续批次评估，不写入模型元数据规则。

## 7. 一次性实施清单

本计划不再拆分施工批次。探测核心、现有行为修复和设置页模型批测作为一个交付整体一次完成：

- [x] 删除 Key 检查的重复 `reportSuccess()` / `reportFailure()`，取消任意错误直接写 `isBroken: true` 的行为。
- [x] 设置页模型、Key 和模型列表检查统一使用当前 Profile 快照。
- [x] 新增共享 `ChannelProbeResult`、能力计划、语义校验和错误分类。
- [x] Chat、Chat Stream、Embedding、Rerank 接入正式 Provider Adapter / Executor / Transport。
- [x] 通过 Transport Observer 统计总耗时与 TTFB，并补充 Inspector 的 Probe 上下文。
- [x] 新增结构化模型检查面板，支持单模型、选中批量、并发限制、在途取消、结果过滤和失败详情。
- [x] 图片、音频只允许显式付费检查；视频、音乐明确返回不支持，禁止回退到 Chat。
- [x] 补齐共享核心、桌面 Probe Service 和 `useConnectionTest` 自动化测试。

实际代码落点：

- 共享核心：`packages/llm-core/src/probe/`、`packages/llm-core/src/providers/rerank.ts`、`packages/llm-core/src/rerank-executor.ts`
- 桌面编排：`src/views/Settings/llm-service/probe/`
- 设置页交互：`src/views/Settings/llm-service/components/ModelProbePanel.vue`
- 兼容入口：`src/views/Settings/llm-service/composables/useConnectionTest.ts`

### 后续可选的运行态健康能力

- 评估是否保存最近一次检查摘要。
- 评估是否为多 Key 增加批量检查和冷却状态可视化。
- 评估本地后台周期检查；默认关闭，不自动禁用整个 Profile。
- 若未来提供远程服务端监控，再单独定义 SSRF、调度、历史聚合和告警边界。

## 8. 测试策略

### 8.1. Probe Plan

- 每种能力生成正确的 canonical 最小请求。
- 显式能力优先于模型名称推断。
- 媒体能力不回退到 Chat。
- Profile 快照和显式 Key 不被修改。

### 8.2. Probe Validator

- 非流式空响应、Provider error、有效文本、工具调用和媒体资产。
- 流式只有 `[DONE]`、只有 error、存在 delta 但无完成事件、正常 completed。
- Embedding 空向量、非有限数值、合法向量。
- Rerank 越界索引、空结果和合法排序。

### 8.3. 错误分类与 Key 状态

- 400、401、403、404、408、429、5xx，以及 400/403 中明确的无效凭据错误。
- Timeout、Abort、DNS/网络异常、配置错误。
- 每次检查最多上报一次成功或失败。
- 取消、模型不支持和配置错误不污染 Key 健康状态。

### 8.4. 批量执行

- 并发不超过配置值。
- 取消会终止在途请求并停止后续任务。
- 单项失败不终止其他模型。
- 结果顺序和模型标识稳定，不因完成顺序错配。

### 8.5. 构建验证

本次施工完成后执行当前仓库脚本对应的：

- 相关 Vitest。
- `check:frontend` 或 `check`。
- 桌面端 Vite 生产构建。
- 涉及移动端共享接线时执行移动端类型检查、测试和生产构建。

真实 Tauri 网络策略、代理、无效证书、HTTP/1 和本地 Provider 地址仍需在 Tauri WebView 中人工验收。

## 9. 验收标准

### 行为

- 模型列表检查与推理检查语义分离。
- 设置页检查始终针对点击时的 Profile 快照。
- Chat、流式 Chat、Embedding 和 Rerank 可得到结构化结果。
- 不支持的媒体能力不会误走 Chat。
- Key 检查不会重复上报，且不会因非凭据错误被直接标记损坏。

### 架构

- 探测层不复制 Provider URL、Header、请求体和响应解析逻辑。
- Provider Adapter 不依赖设置页、Vue、Pinia 或 KeyManager。
- 错误分类、结果契约和能力计划可独立测试。
- 后续移动端接入不需要复制协议探测实现。

### 安全与成本

- 日志和结果不包含明文 Key、鉴权 Header 或未截断错误体。
- 用户取消不触发 Key 失败计数。
- 高成本异步媒体不被自动探测。
- 本地和私网 Provider 地址继续可用；若未来引入远程监控，必须另行建立 SSRF 信任边界。

## 10. 实施结论

本次已一次性完成设置页和移动端的探测核心、行为修复与模型批测界面。实现继续复用正式 Provider 行为，错误语义与 Key 健康写入由独立策略控制，纯探测能力位于共享包，可供移动端直接复用。

移动端已按 [`docs/design/mobile-llm-model-probe-interaction-design.md`](../design/mobile-llm-model-probe-interaction-design.md) 完成首批接入：支持单模型/批量检查、并发 1 至 4、取消、成本确认、失败重试、结构化诊断与当前编辑会话内的结果回显。跨重启历史、后台周期检查和跨渠道批量仍未实现。

后台周期检查、跨重启历史和自动禁用整个 Profile 仍属于可选运行态能力，未随本次设置页施工默认启用；若后续实现，必须继续遵守本地客户端的成本、SSRF 和用户授权边界。
