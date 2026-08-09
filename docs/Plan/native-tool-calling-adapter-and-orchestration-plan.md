# LLM 原生工具调用适配修补与编排设计

> 状态：渠道工具处理声明已实施；Azure 运行时 Adapter 已修复；Provider Adapter 其余协议修补与原生工具编排仍待实施
> 更新日期：2026-08-09
> 影响范围：`packages/llm-core`、`src/llm-apis`、`src/tools/llm-chat`、`src/tools/tool-calling`、`src/tools/agent-manager`

## 1. 背景

AIO Hub 当前通过 VCP 文本协议完成本地工具调用闭环：工具定义进入 Prompt，模型输出 `<<<[TOOL_REQUEST]>>>`，系统解析并执行工具，再以 `<<<[TOOL_RESULT]>>>` 回注上下文。该方案不依赖厂商原生 Function Calling，过去能够覆盖大量模型和中转渠道。

近期模型行为发生了变化：

- 新模型越来越依赖训练时使用的原生工具格式，文本自定义协议的服从度下降。
- 模型可能在正文中表示“准备调用工具”，但没有输出完整 VCP 标记，导致调用落空。
- DeepSeek 等模型对工具调用行为耦合较深；当请求没有提供模型熟悉的结构化出口时，可能只保留调用意图文本。
- 部分 API 会返回只有原生 `tool_calls`、没有正文的响应。AIO 当前聊天层只消费正文，因此即使 Adapter 已经解析出调用，上层仍可能忽略它。
- 同时注入原生工具和文本工具协议可能产生双重调用、正文泄漏协议格式或相互抑制，不能作为长期默认方案。
- OpenAI-Compatible 只是 API 外形，不代表上游工具处理方式。若前端发送原生工具、后端同时以 VCP 文本约束模型，两种格式会竞争模型注意力并导致能力下降或格式错误。

因此，后续工作拆成两条主要工作线：

1. **修补 Provider Adapter 的现有协议缺陷**，建立可信的请求编码、响应解码和续轮能力。
2. **设计并实现原生工具调用编排**，让 `llm-chat` 能基于统一语义执行厂商原生 Tool Call，同时保留 VCP 文本模式。

两条工作线有明确依赖方向：原生编排依赖稳定的统一 Tool IR 和 Adapter 契约；编排器本身不直接理解任何厂商 wire format。

## 2. 范围与非目标

### 2.1. 本计划覆盖

- 主流 LLM 工具调用格式调查与 AIO 当前支持矩阵。
- OpenAI Chat、OpenAI Responses、Anthropic、Gemini、Cohere、Vertex、Azure、Ollama 的现有缺陷修补。
- Gemini Interactions 与 AWS Bedrock Converse 的缺失情况记录。
- 统一工具定义、调用、结果和 Provider 重放状态的内部契约。
- `llm-chat` 原生调用检测、审批、执行、结果回传和多轮循环。
- 工具提示配置与 Agent 预设编排的职责调整。
- VCP 文本与 Provider 原生两种提示格式，以及 AIO 本地消费、VCP 分布式消费、上游自管三种执行路由的独立解析。
- 原始响应诊断、上下文预览和端到端测试。

### 2.2. 本计划不要求

- 为每个厂商派生一套 Agent 预设或 System Prompt。
- 让新预设结构在运行时透明兼容所有旧版工具包装文本。
- 废弃 VCP 文本协议或 VCP Connector。
- 在同一轮默认混用原生 Tool Calling 和 VCP 文本工具定义。
- 将 Provider 协议语义迁入 Rust；Provider 编解码继续位于共享 TypeScript Core。
- 在第一批施工中同时实现 Gemini Interactions 和 Bedrock Converse。

## 3. 市场常见工具调用格式

### 3.1. 协议矩阵

| 协议族                   | 工具声明                      | 模型返回调用                     | 工具结果回传                                              | 常见渠道                                                                                         |
| ------------------------ | ----------------------------- | -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| OpenAI Chat Completions  | `tools[].function`            | `message.tool_calls[]`           | `role: "tool"` + `tool_call_id`                           | OpenAI、DeepSeek、Groq、OpenRouter、xAI、SiliconFlow、LM Studio、vLLM、Ollama 兼容端点及多数中转 |
| OpenAI Responses         | 扁平 `tools[]`                | `output[].type: "function_call"` | `type: "function_call_output"` + `call_id`                | OpenAI Responses 及兼容实现                                                                      |
| Anthropic Messages       | `tools[].input_schema`        | `content[].type: "tool_use"`     | `type: "tool_result"` + `tool_use_id`                     | Anthropic Claude、部分 Vertex Claude                                                             |
| Gemini `generateContent` | `functionDeclarations`        | `parts[].functionCall`           | `parts[].functionResponse`                                | Google Gemini、Vertex Gemini                                                                     |
| Gemini Interactions      | 扁平函数工具                  | `steps[].type: "function_call"`  | `function_result` + `call_id` + `previous_interaction_id` | 新 Gemini Interactions API                                                                       |
| Cohere V2 Chat           | `tools[].function`            | `message.tool_calls[]`           | `role: "tool"` + `tool_call_id`                           | Cohere Command 系列                                                                              |
| Bedrock Converse         | `toolConfig.tools[].toolSpec` | `content[].toolUse`              | `content[].toolResult` + `toolUseId`                      | AWS Bedrock 多模型统一入口                                                                       |
| 文本模板协议             | Prompt 中注入定义和语法       | 模型输出约定文本块               | 文本结果块回注                                            | VCP、ReAct/XML/JSON 模板及不提供原生工具字段的渠道                                               |

### 3.2. 格式收敛趋势

市场渠道数量很多，但底层格式主要收敛到上述少数协议族。大量国产平台、聚合中转和本地推理服务已经提供 OpenAI-Compatible 接口。AIO 不需要为每个品牌建立独立编排器，但必须准确维护各协议族的 Adapter Codec。

需要区分三层概念：

- **工具注册与执行能力**：AIO 中有哪些工具、方法、审批和超时策略。
- **LLM wire format**：工具定义、调用和结果如何通过某个厂商 API 传输。
- **工具运行时桥接**：例如 VCP Connector 或 MCP 将外部工具暴露给运行时；它们不等同于模型 API 的 Tool Calling 格式。

## 4. AIO 当前实际情况

### 4.1. 当前可用闭环

AIO 当前真正可用的本地 Agent 工具闭环仍是 VCP 文本协议：

```text
{{tools}} / {{tool_usage}}
  -> 模型输出 <<<[TOOL_REQUEST]>>>
  -> parseToolRequests()
  -> 审批与工具执行
  -> <<<[TOOL_RESULT]>>>
  -> 下一轮模型请求
```

依据：

- `src/tools/tool-calling/ARCHITECTURE.md` 明确说明 VCP 是当前唯一实现的工具调用协议。
- `useToolCallOrchestrator.ts` 读取 `response.content`，再调用 `parseToolRequests()` 解析文本。
- `session-loader.ts` 明确记录项目使用自定义文本工具调用，而非官方 Function Calling。
- `emptyResponseDiagnostics.ts` 会提示检测到原生工具调用字段，但当前聊天正文只直接显示文本。

VCP Connector 还支持 AIO 与 VCP 服务器双向暴露工具和 WebSocket `execute_tool/tool_result`。这是远端运行时桥接能力，与 AIO 本地解析 VCP 文本、厂商原生 Tool Calling 均属于不同层次。

### 4.2. 底层支持与聊天闭环矩阵

| 协议/渠道                |   Adapter 声明工具 |                 解析调用 |                     续轮结果编码 | `llm-chat` 执行闭环 | 当前判断             |
| ------------------------ | -----------------: | -----------------------: | -------------------------------: | ------------------: | -------------------- |
| OpenAI Chat / Compatible |                 是 |           是，含流式聚合 |      Core 支持，桌面消息角色受限 |                  否 | 底层较完整，上层未接 |
| OpenAI Responses         |                 是 |      是，含 replay items |                               是 |                  否 | 底层较完整，上层未接 |
| Anthropic Messages       |                 是 |       是，含并行流式调用 |                               是 |                  否 | 底层较完整，上层未接 |
| Gemini `generateContent` |                 是 | 是，含 thought signature |              有已知 name/ID 缺陷 |                  否 | 底层部分可用         |
| Gemini Interactions      |                 否 |                       否 |                               否 |                  否 | 未实现               |
| Cohere V2                |                 是 |                       是 |               工具消息构造不完整 |                  否 | 不能完成续轮         |
| Vertex Gemini / Claude   |                 是 |                       是 | 继承 Gemini/Anthropic 能力和缺陷 |                  否 | 底层已分发，上层未接 |
| Azure OpenAI             |         配置声明是 |     不可稳定到达 Adapter |             不可稳定到达 Adapter |                  否 | 分发缺失             |
| Ollama OpenAI-Compatible | 配置未声明工具能力 |   Adapter 能解析兼容格式 |         受参数过滤和端点配置影响 |                  否 | 配置与实现不一致     |
| Bedrock Converse         |                 否 |                       否 |                               否 |                  否 | 未实现               |
| VCP 文本                 |        Prompt 注入 |                       是 |                               是 |                  是 | 当前稳定闭环         |

`supportedParameters.tools: true` 只表示参数过滤和 Adapter 可能允许工具字段通过，不能代表聊天工具闭环已经可用。

### 4.3. 聊天层断点

当前最直接的断点如下：

1. `useToolCallOrchestrator` 只把 `response.content` 交给工具周期，不消费 `response.toolCalls`。
2. 会话上下文仍以文本工具调用为中心，没有为原生 assistant tool call 和 tool result 建立完整重放契约。
3. 桌面 `LlmMessage.role` 只允许 `system | user | assistant`，而共享 Core 已允许 `tool`。
4. 原生调用只有诊断，没有审批、执行、状态更新和续轮入口。
5. Adapter 单测覆盖 wire format，但没有 `llm-chat` 原生工具端到端编排测试。

### 4.4. VCP 后端 + AIO 前端的实际工具链

VCP 后端参与请求时，不能把“提示词由谁注入”和“调用由谁执行”合并为一个“后端接管”判断。用户当前常用组合的真实链路是：

```text
AIO 前端：根据 Agent 工具开关生成 AIO 工具定义和 VCP 文本协议提示
  -> VCP 后端：处理请求，并只展开 Agent 文本中显式放置的 VCP 占位符
  -> 模型：输出 <<<[TOOL_REQUEST]>>>
  -> VCP 后端：解析请求，在 PluginManager 中找到已注册的分布式 AIO 工具
  -> executeDistributedTool() / WebSocket execute_tool
  -> AIO 分布式节点：执行本地工具并返回 tool_result
  -> VCP 后端：回注结果并继续模型循环
```

这里 AIO 仍然拥有 **AIO 工具的提示注入**；VCP 拥有 **文本请求解析、循环推进和分布式执行路由**；AIO 分布式节点是最终工具执行端。三者不是同一个职责。

VCPToolBox 当前实现也确认了这个边界：

- `WebSocketServer.js` 收到 `register_tools` 后，只把分布式 manifest 注册进 `PluginManager`。
- `PluginManager.registerDistributedTools()` 会重建可查询的插件描述，并让 `processToolCall()` 能把调用路由到 `executeDistributedTool()`；注册动作本身不会修改当前 Agent Prompt。
- `messageProcessor.js` 只有在消息文本显式包含 `{{VCPAllTools}}`、`{{VCPDynamicTools}}` 或某个 `VCP<PluginName>` 标记时，才把对应插件描述展开进 Prompt。
- 用户所说的罕见 `tools-all` 对应当前代码中的 `{{VCPAllTools}}`；它会聚合 `individualPluginDescriptions`，其中也可能包含已注册的分布式 AIO 工具。`{{VCPDynamicTools}}` 同样可能按语义选中分布式工具。
- 实际 `AIOgugu.txt` 使用 `{{VarToolList}}` 和若干明确的 VCP 工具箱占位符；这些内容用于 VCP 自身工具提示，不等于 AIO 工具定义，也不会因 AIO 节点注册而自动扩大。

因此，VCP 渠道下继续由 AIO 注入文本工具提示是正常路径，不应被默认判为重复注入。只有用户显式使用 VCP 全量/动态聚合占位符并再次覆盖同一批 AIO 分布式工具时，才可能出现重复定义；这是可诊断、可提示的高级配置结果，不应由 AIO 擅自清空用户已配置的工具提示。

## 5. Adapter 已确认缺陷

### 5.1. Azure OpenAI

- 已确认当前 Azure 渠道配置采用 deployment 风格的 Chat Completions，并复用 OpenAI 请求体与响应解析。
- `src/llm-apis/adapters/azure/` 负责替换 `{resource}` / `{deployment}`、补充 `api-version`、将 API Key 放入 `api-key` 请求头，并提供 Chat 与 Embedding facade。
- `src/llm-apis/adapters/index.ts` 已注册 `azure`；映射通过 `ProviderType` 完整性约束，后续新增可创建渠道但漏注册 Adapter 时会在类型检查阶段失败。
- 渠道探测在 OpenAI Chat 与 Embedding 端点下保留 Azure Adapter，不再降级成普通 `openai-compatible` 鉴权。
- Responses API 尚未作为 Azure 渠道默认协议开放；如后续启用，应单独补充 v1/preview 路由与能力契约。

### 5.2. Ollama

- 默认运行时通过 OpenAI Adapter 访问 `/v1/chat/completions`，Ollama 官方提供该兼容端点，因此默认普通聊天路径可行。
- 渠道 UI 的聊天端点占位符是原生 `/api/chat`。用户若按该提示保存端点，OpenAI 请求体和响应解析会与 Ollama 原生协议错配。
- `supportedParameters` 没有声明 `tools`，`filterParametersByCapabilities()` 会过滤调用方传入的原生工具定义。

应选择一种明确策略：继续使用 OpenAI-Compatible 端点并修正配置，或新增独立 Ollama 原生 Adapter；不能把两种端点视为同一 wire format。

### 5.3. OpenAI Chat Completions

- 共享 Core 已支持工具声明、非流式/流式调用解析、assistant `tool_calls` 和 `tool_call_id` 结果编码。
- 桌面 Facade 的 `LlmMessage` 不允许 `role: "tool"`，无法自然表达标准续轮消息。
- 现有会话加载器还可能将工具角色转为 user，这只适用于文本协议兼容，不应覆盖原生 OpenAI 续轮。

### 5.4. OpenAI Responses

- 共享 Core 已支持 `function_call`、`function_call_output`、`call_id` 和 Provider replay items。
- 缺口主要位于上层：没有编排器消费调用、执行后构造下一轮输入。

### 5.5. Anthropic Messages

- 共享 Core 已支持 `input_schema`、`tool_use`、`tool_result`、`tool_use_id` 和并行流式调用。
- 桌面 Adapter 已能映射统一工具内容。
- 缺口主要位于会话编排与重放，而不是基础 wire codec。

### 5.6. Gemini `generateContent`

- 已支持 `functionDeclarations`、`functionCall`、`functionResponse`、流式调用解析和 thought signature replay。
- 当前工具结果把统一 `toolUseId` 写入 `functionResponse.name`，而旧版 `generateContent` 需要函数名。
- 新 Gemini 3.x 强调函数名和调用 ID严格匹配，当前结构没有完整保留并回传这组关系。
- 非流式解析可读取上游函数 ID，但流式聚合会重新生成 `call_N`，破坏真实 ID保真。

Gemini 修复不能只修改一个字段；统一 IR 必须同时保存 `callId` 和 `name`，Provider Codec 再按版本要求编码。

### 5.7. Cohere V2

- 已支持工具声明、`toolChoice` 和调用解析。
- `buildCohereMessage()` 对结构化消息只保留文本和图片，`tool_use/tool_result` 不会生成 Cohere 所需的 assistant tool calls 与 `role: "tool"` 消息。
- 桌面消息角色限制也会影响 Cohere 续轮。

### 5.8. 缺失协议

- 仓库中没有 Gemini Interactions 的 `interactions`、`function_result`、`previous_interaction_id` 实现。
- 仓库中没有 AWS Bedrock Provider、Converse Adapter 或 SigV4 请求链路。

这两项放在主流现有 Adapter 修补和第一批原生编排之后。

## 6. 实际 Agent 预设案例

本次讨论参考了用户实际使用的 `咕咕 5.agent.yaml`。该 Agent 的预设不是单一 System Prompt，而是一套带顺序、角色、宏、深度注入、锚点、分组和模型匹配的上下文编排：

- `基本预设`、`视觉化输出指南`、`可用资产` 等静态 System 消息位于历史前。
- `user_profile` 是显式上下文占位消息。
- 独立 `tools` System 消息包含人工边界标记、`{{tools}}` 和 `{{tool_usage}}`。
- VCP 后端身份说明通过 radio 分组和 Profile 匹配选择。
- `动态系统信息` 以 user 角色在深度 3 注入，混合系统时间、模型信息、RAG 和 `{{tool_context}}`。
- `vcp传送门` 使用模型和 Profile 条件以及高级深度注入。
- `chat_history` 是显式骨架占位符。

该案例带来两个结论：

1. AIO 工具定义、VCP 自有工具占位符、共享文本协议说明、VCP 后端说明和工具运行时上下文是不同内容，不能统一按“工具消息”粗暴删除。
2. VCP 后端负责消费文本调用并不意味着它会自动注入 AIO 分布式工具定义；AIO 工具提示仍应按 Agent 配置由 AIO 生成。
3. 预设编排应继续负责消息角色和位置，但 AIO 工具提示正文的组成不应由每个 Agent 手写。

## 7. 工具提示与预设编排决策

### 7.1. 职责划分

确认采用以下边界：

> **工具配置拥有工具提示内容，Agent 预设拥有消息角色与位置，宏连接两者，原生工具定义绕过文本宏进入请求旁路。**

不要求新增特殊的 `tool_manifest` 预设消息类型。新预设使用一条独立的纯宏消息作为工具提示槽位：

```yaml
- role: system
  content: "{{tool_prompt}}"
  injectionStrategy:
    type: anchor
    anchorTarget: chat_history
    anchorPosition: before
    order: 100
```

工具配置页面负责维护文本协议模板，例如：

```text
======AIO工具开始======
### AIO Hub 中的工具

{{tool_definitions}}

---

{{tool_protocol_instructions}}
======AIO工具结束======
```

`======AIO工具开始======` 等人工包装不再散落在 Agent 预设中。用户可以在工具配置页面统一编排、修改或替换包装，而 Agent 只保存工具提示的注入位置。

### 7.2. 宏职责

建议整理为以下职责：

- `{{tool_prompt}}`：面向 Agent 预设，输出工具配置编译后的完整文本工具提示。
- `{{tool_definitions}}`：工具提示模板内部使用，渲染当前启用工具及方法定义。
- `{{tool_protocol_instructions}}`：工具提示模板内部使用，渲染 VCP 等文本协议的输出要求。
- `{{tool_context}}`：继续作为独立环境宏，可与时间、RAG 等内容共同放置；它不是 VCP 语法，不应随原生模式自动删除。

为避免全局宏递归和职责混乱，`tool_definitions` 与 `tool_protocol_instructions` 可以由专用 `ToolPromptRenderer` 解析，不必注册为任意预设都能调用的公共宏。

### 7.3. 空消息清理

在原生工具模式或工具关闭时，`{{tool_prompt}}` 返回空字符串。上下文管道必须在宏展开后、消息分类/注入和 Token 计算前清理无内容消息：

```ts
function isEmptyExpandedMessage(message: ProcessableMessage): boolean {
  return (
    message.type !== "chat_history" &&
    !message._attachments?.length &&
    typeof message.content === "string" &&
    message.content.trim().length === 0
  );
}
```

预期流程：

```text
system: "{{tool_prompt}}"
  -> system: ""
  -> 删除消息
  -> 不进入注入、合并、Token 预算和最终请求
```

只有独立的纯宏消息能完整隐藏。如果用户在同一消息中保留其他文字，原生模式只清空宏展开结果，其他文字继续存在。这是明确且可预期的行为；编辑器应提示希望自动隐藏时使用独立消息。

### 7.4. 不以旧提示透明兼容为设计前提

新结构允许移除旧 Agent 中手写的工具边界标记，迁移为：

```text
旧：边界文本 + {{tools}} + {{tool_usage}}
新：{{tool_prompt}}
```

可以提供一次性迁移、编辑器提示或默认模板更新，但不应长期通过运行时扫描任意旧文本来猜测和删除工具包装。旧数据兼容是迁移问题，不是新编排模型的核心约束。

## 8. 工具模式与请求输出

### 8.1. 请求格式模式与现有审批模式

当前 `toolCallConfig.mode = "auto" | "manual"` 表示工具调用的自动批准/手动审批策略，不是工具格式选择。原生工具设计不能复用该字段，否则 `auto` 会同时具有审批和协议协商两种含义。

新增字段应使用独立命名：

```ts
type RequestedToolFormatMode = "auto" | "text" | "native";
```

- `auto`：经过工具格式解析管道选择唯一格式，不表示同时尝试文本和原生。
- `text`：显式请求由 AIO 生成 VCP 文本工具提示；调用既可由 AIO 本地消费，也可由 VCP 后端消费并分布式路由。
- `native`：显式请求当前 Provider 的原生工具协议。

显式选择也必须经过渠道能力校验。若 Agent 请求 `native`，但 VCP 后端仍按文本协议消费调用，系统应报告配置冲突，不能一边向模型发送原生工具字段，一边让后端按 VCP 文本格式编排。反过来，VCP 后端消费文本调用并不与 AIO 注入文本工具定义冲突。

### 8.2. 工具格式适配器管道

统一工具定义之后、Provider 请求编码之前，需要增加独立的工具格式适配器环节。它只负责决定 AIO 工具定义通过文本 Prompt 还是原生请求字段表达；调用由 AIO 本地消费还是由 VCP 后端消费，属于独立的执行路由决策，不能继续混在格式适配器里。

```ts
interface ToolFormatAdapter {
  id: "vcp-text" | "provider-native";

  prepareRequest(
    definitions: UnifiedToolDefinition[],
    context: ToolFormatContext
  ): ToolRequestContribution;

  parseCalls(response: LlmResponse): UnifiedToolCall[];

  buildContinuation(
    calls: UnifiedToolCall[],
    results: UnifiedToolResult[],
    context: ToolFormatContext
  ): ToolContinuationContribution;
}
```

两类实现的边界如下：

- `vcp-text`：调用 `ToolPromptRenderer` 生成 AIO 工具定义与 VCP 文本协议提示；仅当执行路由是 `aio-local` 时才由前端解析请求并生成结果文本。
- `provider-native`：选择原生工具旁路，调用解析来自 `response.toolCalls`；具体 OpenAI、Anthropic、Gemini 等 wire codec 仍委托 Provider Adapter。

工具格式适配器解决“AIO 工具如何呈现给模型”，执行路由解决“谁消费调用并推进循环”，Provider Adapter 解决“该厂商 JSON/SSE 如何编码”。三者不能合并成按 Provider 名称写死的分支，否则 OpenAI-Compatible 外观下的 VCP 后端仍会被误判为 OpenAI 原生工具渠道。

### 8.3. 渠道工具处理声明与解析计划

工具格式不能只根据模型元数据或 `profile.type` 选择。至少要同时考虑：

- Agent 请求的 `formatMode`。
- Provider Adapter 是否完整支持声明、调用解析和结果续轮。
- 模型是否支持对应的原生工具能力。
- 当前 LLM 渠道是直连、透明代理，还是会消费 VCP 文本调用并执行/转发工具的后端。
- VCP Connector 或渠道探测提供的协议证据。
- AIO 工具是否已通过分布式节点暴露给当前 VCP 实例。

渠道配置需要能够明确声明工具处理所有权和上游协议，例如：

> **已决定（2026-08-09）：** 第一版将用户可编辑的静态声明保存到 `LlmProfile.toolHandling`。该声明优先于运行时推断；未设置的旧 Profile 继续使用“API 地址与 VCP WebSocket 同主机”的兼容期启发式。`aioDistributedExposure` 只表达已知的分布式执行路由状态，不能推断 VCP Agent 已经把 AIO 工具定义写入 Prompt。后续 VCP 握手与渠道探测可提供更高质量的动态证据，但不改变 Profile 显式声明优先的规则。

```ts
interface ChannelToolHandling {
  callConsumer: "aio" | "upstream";
  upstreamProtocol: "provider-native" | "vcp-text" | "transparent" | "none";
  aioDistributedExposure?: "complete" | "partial" | "none" | "unknown";
  evidence?: "explicit" | "handshake" | "probe" | "heuristic";
}
```

解析器输出的不应只是一个字符串，而是一份排他的执行计划：

```ts
interface ResolvedToolPlan {
  transport: ResolvedToolTransport;
  formatAdapterId?: ToolFormatAdapter["id"];
  callConsumer: "aio" | "upstream" | "none";
  executionRoute: "aio-local" | "vcp-distributed" | "upstream-local" | "none";
  injectTextPrompt: boolean;
  attachNativeTools: boolean;
  consumeTextCallsLocally: boolean;
  consumeNativeCallsLocally: boolean;
  evidence: string[];
  conflicts: string[];
}
```

必须满足以下不变量：

1. `injectTextPrompt` 与 `attachNativeTools` 对同一批 AIO 本地工具互斥。
2. `consumeTextCallsLocally` 与 `consumeNativeCallsLocally` 在正常执行路径中互斥。
3. `callConsumer === "upstream"` 时，AIO 不执行本地解析循环；但在 `vcp-text` 路径下仍可注入 AIO 工具提示。
4. 显式配置冲突必须阻止发送或要求用户修正，不能静默混合两种格式。
5. 自动回退不能在同一有副作用的请求中重新尝试另一格式。
6. VCP 插件注册表包含分布式 AIO manifest，只能作为“可路由执行”的证据，不能推导出“VCP 已把这些工具注入 Prompt”。

### 8.4. 已解析投递方式

工具格式与执行路由解析完成后，使用以下确定状态：

```ts
type ResolvedToolTransport =
  | "disabled"
  | "local_text"
  | "local_native"
  | "vcp_distributed_text"
  | "upstream_managed";
```

- `disabled`：不发送工具定义，`{{tool_prompt}}` 为空。
- `local_text`：`{{tool_prompt}}` 渲染文本协议，AIO 本地文本解析器执行调用。
- `local_native`：`{{tool_prompt}}` 为空，统一工具定义通过原生请求字段发送，AIO 本地原生编排器执行调用。
- `vcp_distributed_text`：`{{tool_prompt}}` 仍由 AIO 渲染；AIO 不做本地解析，VCP 后端解析相同的文本协议，并把匹配到的分布式工具路由回 AIO 节点执行。
- `upstream_managed`：本轮不向上游贡献 AIO 工具定义；仅使用 VCP Agent 自己显式配置的工具占位符及后端工具。它是用户明确选择“不提供 AIO 工具”的状态，不是检测到 VCP 渠道后的默认值。

`auto` 是协商入口，不是最终运行态，更不是混用开关。解析结果、证据和冲突必须进入上下文预览和请求诊断，避免用户无法判断一次请求实际采用了哪种工具协议。

建议解析优先级：

1. 工具关闭时直接选择 `disabled`。
2. 渠道确认由 VCP 按文本协议消费调用，且本轮选中的 AIO 工具/方法已完整暴露给该 VCP 实例时，`auto` / `text` 选择 `vcp_distributed_text`。
3. 渠道确认由 VCP 按文本协议消费调用，但本轮工具暴露状态为 `partial`、`none` 或 `unknown` 时，列出缺失/未确认项并报告不可执行配置；不能只注入定义后让调用落空。
4. 用户显式选择 `native` 时校验上游是否透明传递并返回完整原生调用契约；VCP 文本编排模式与其冲突时停止请求。
5. 用户明确关闭 AIO 工具贡献、只依赖 VCP Agent 自有占位符时，选择 `upstream_managed`。
6. 直连渠道的 `auto` 根据完整原生契约、模型能力和探测证据选择 `local_native`，否则选择 `local_text`。
7. 自定义 OpenAI-Compatible 渠道若无法确认调用消费方，应提示用户确认或运行工具能力探测，不应仅凭 OpenAI 请求外形推断。

### 8.5. VCP 后端与原生前端冲突

以下组合是本计划必须防止的已知风险：

```text
前端 AIO：附加 OpenAI/Gemini/Anthropic 原生 tools 字段
上游 VCP：向模型注入 VCP 文本工具定义和输出约束
结果：模型同时接收两套工具格式要求
```

实践中，这类组合会拉扯模型注意力，造成能力下降、正文描述调用但不输出有效格式、原生调用字段和 VCP 标记竞争，或两种格式均不完整。它不是可以忽略的重复提示，而是协议冲突。

但下面这个常用组合不是冲突：

```text
AIO 前端：注入 AIO 工具定义 + VCP 文本调用格式
VCP Agent：通过 {{VarToolList}} / 明确的 {{VCP...}} 占位符注入 VCP 自有工具
VCP 后端：统一解析 <<<[TOOL_REQUEST]>>>，本地工具本地执行，分布式 AIO 工具转发给 AIO
```

两侧使用的是同一文本协议，工具集合和提示所有者可以不同。VCP 的 `register_tools` 只增加可执行路由，不会自动把分布式 AIO 工具追加到 Agent Prompt。若用户主动放入 `{{VCPAllTools}}`、`{{VCPDynamicTools}}` 或相应单工具占位符，使 VCP 又注入同一批 AIO 工具定义，系统可以在预览中提示潜在重复，但应尊重这个显式高级配置，不把它当作渠道级硬冲突。

当前 `useIsVcpChannel.ts` 通过 LLM Profile `baseUrl` 与 VCP Connector `wsUrl` 是否同主机来推断调用由 VCP 后端消费。现有 `useToolCallOrchestrator.ts` 也会在 `isVcpChannel` 时跳过 AIO 本地解析，而上下文管道仍照常展开 AIO 工具宏；这与 `vcp_distributed_text` 的职责边界一致。该启发式可以作为迁移期执行路由证据，但不能同时用来推断“VCP 已注入 AIO 工具提示”：

- 同主机不必然是同一工具后端。
- VCP 可能通过反向代理使用不同主机。
- OpenAI-Compatible URL 不代表后端使用原生工具格式。
- 连接到 VCP Connector 不代表当前 LLM Profile 一定由该 VCP 实例处理。
- 即使确认是同一 VCP 实例，也只能确认可能的解析/路由关系，不能从连接状态知道 Agent 使用了哪些 VCP Prompt 占位符。

长期顺序应是“渠道显式声明 > 后端握手/能力探测 > 已知预设 > 主机启发式”。启发式命中时应在预览中标明证据来源，并允许用户确认或覆盖。

冲突矩阵：

| 渠道情况                              | Agent 请求        | 结果                                                                    |
| ------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| 直连且原生契约完整                    | `auto` / `native` | `local_native`，只发送原生工具                                          |
| 直连但不支持完整原生续轮              | `auto` / `text`   | `local_text`，发送 `{{tool_prompt}}` 并由 AIO 本地执行                  |
| VCP 文本后端 + AIO 分布式工具已注册   | `auto` / `text`   | `vcp_distributed_text`，AIO 注入文本提示，VCP 解析并分布式路由          |
| VCP 文本后端 + AIO 分布式工具未注册   | `auto` / `text`   | 配置错误：定义可见但无法执行，阻止或明确降级                            |
| VCP 文本后端                          | `native`          | 默认配置冲突；仅在后端明确支持原生透明传递及续轮时允许                  |
| 用户明确只使用 VCP Agent 自有工具     | `auto`            | `upstream_managed`，AIO 不贡献工具定义                                  |
| VCP Agent 显式全量/动态聚合分布式工具 | `text`            | 允许发送；预览提示可能与 AIO `{{tool_prompt}}` 重复，由用户决定如何编排 |
| 自定义渠道调用消费方未知              | `auto`            | 先探测或提示确认，不依据 Provider 外形盲选                              |

### 8.6. 管道输出

上下文管道需要从“只返回消息”扩展为可携带原生工具旁路：

```ts
interface CompiledLlmContext {
  messages: ProcessableMessage[];
  nativeTools?: UnifiedToolDefinition[];
  toolPlan: ResolvedToolPlan;
  contributions?: ContextContribution[];
}
```

原生模式的工具 Schema 不能由 `{{tool_prompt}}` 文本反向解析生成。正确数据流是：

```text
工具注册表 / Agent 工具开关
  -> UnifiedToolDefinition[]
  -> ToolFormatResolver -> ResolvedToolPlan
  -> local_text: ToolPromptRenderer -> {{tool_prompt}} -> AIO 本地解析/执行
  -> vcp_distributed_text: ToolPromptRenderer -> {{tool_prompt}} -> VCP 解析 -> AIO 分布式执行
  -> provider-native: Provider Adapter -> 原生 tools 字段
  -> upstream_managed: 不产生 AIO 工具贡献，仅保留普通预设中的 VCP 自有占位符
```

### 8.7. 自动注入

`autoInjectIfMacroMissing` 的文本保底消息应从三个宏合并消息改为单一纯宏消息：

```yaml
role: system
content: "{{tool_prompt}}"
```

`local_text` 与 `vcp_distributed_text` 下该消息都展开；原生模式和 `upstream_managed` 下它为空并被清理。原生工具定义是否发送不依赖 Agent 是否放置了 `{{tool_prompt}}`，只依赖工具配置、已解析模式和 Adapter 能力。

## 9. 统一 Tool IR

统一 IR 必须同时覆盖工具定义、模型调用、执行结果和 Provider 私有重放状态：

```ts
interface UnifiedToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  strict?: boolean;
}

interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: unknown;
  providerState?: unknown;
}

interface UnifiedToolResult {
  callId: string;
  name: string;
  output: unknown;
  isError?: boolean;
  providerState?: unknown;
}
```

约束：

- `id` 和 `name` 分开保存，不能用调用 ID代替函数名。
- 并行调用必须保留每个调用的稳定 ID和结果关联。
- `providerState` 只保存必须原样重放、但编排器不应理解的厂商数据，例如 Gemini thought signature、Responses replay items。
- Provider Adapter 负责 Tool IR 与 wire format 的双向转换。
- 编排器只处理审批、执行、结果关联、循环和终止条件。

## 10. 工作线一：Adapter 修补

### 10.1. 目标

每个已声明支持原生工具的 Adapter 都必须满足完整契约：

```text
工具声明
  -> 模型返回一个或多个调用
  -> Adapter 解码为 UnifiedToolCall
  -> 工具结果编码回厂商格式
  -> 模型返回最终正文或下一批调用
```

### 10.2. 建议批次

#### A1. 统一契约与诊断

- 将桌面 Facade 消息角色和工具内容契约与 `@aiohub/llm-core` 对齐。
- 明确 Tool IR 与 Provider replay state。
- 将“完整原生工具契约”拆成声明编码、调用解析、结果续轮和流式 ID保真能力，不能继续用单个 `tools: true` 表示。
- 在 Inspector/诊断中记录最终请求是否携带工具、原始停止原因、原始调用字段、Adapter 解码结果和正文是否含 VCP 标记。
- 给共享 Core 增加跨协议工具调用 fixture 模板。

#### A2. OpenAI 系与渠道分发

- 修复 OpenAI Chat 的 assistant tool calls 和 `role: "tool"` 续轮。
- 验证 OpenAI Responses `function_call_output` 与 replay items。
- 修复 Azure 分发、URL、API version 和鉴权。
- 统一 Ollama 使用 OpenAI-Compatible 端点的配置，补 `tools` 能力声明和负向模型能力测试。

#### A3. Anthropic、Gemini、Cohere、Vertex

- 验证 Anthropic 并行 `tool_use/tool_result` 顺序和流式调用。
- 修正 Gemini 函数名、调用 ID、流式 ID保真和 thought signature 重放。
- 补 Cohere assistant tool calls 与 `role: "tool"` 消息构造。
- 让 Vertex Gemini/Claude 继承修复后的共享契约并增加双发布者测试。

#### A4. 后续协议

- 评估 Gemini Interactions Adapter。
- 评估 Bedrock Converse、SigV4 与多模型差异。
- 不阻塞第一批 `llm-chat` 原生编排上线。

### 10.3. 当前实施进度（2026-08-09）

- **已完成：Azure OpenAI 运行时 Adapter 修补。** Azure 已注册到桌面 Adapter 分发，覆盖 deployment URL、`api-version`、`api-key` 鉴权和 Chat / Embedding facade；对应变更已在此前的 `28d48741e` 提交中完成。
- **已完成：渠道工具处理声明。** `LlmProfile.toolHandling` 已可持久化、导入导出和在设置页编辑；`llm-chat` 以显式声明优先、同主机启发式兼容旧 Profile 的方式，决定文本工具调用是否由 AIO 本地消费。该实现只解决路由归属，不替代 Provider codec 或原生多轮编排。
- **待实施：A1 统一契约与诊断。** 桌面 `LlmMessage` 仍未完整对齐 Core 的 `tool` 角色、`toolCallId` 与工具内容契约；Tool IR、Provider replay state 的聊天层承载、Inspector 诊断和跨协议 fixture 仍待补齐。
- **待实施：A2 其余项。** OpenAI Chat 的 assistant `tool_calls` + `role: "tool"` 续轮、Ollama 端点/Codec 一致性与 `tools` 能力声明，以及 Responses 通过聊天层的执行—结果续轮闭环尚未完成。
- **待实施：A3。** Gemini 的函数名/调用 ID/流式 ID/thought signature 修补、Cohere 的 assistant tool calls 与工具结果消息构造，以及对应 Anthropic/Vertex 回归验证尚未开始。
- **后置：A4。** Gemini Interactions 与 Bedrock Converse 保持在第一批原生编排之后评估。

## 11. 工作线二：原生工具编排

### 11.1. 目标架构

```text
Agent 工具配置
  -> Agent formatMode + 渠道工具处理声明 + Adapter/模型能力
  -> ToolFormatResolver
  -> 唯一 ResolvedToolPlan
       upstream_managed -> 不产生 AIO 工具贡献，仅保留 VCP Agent 自有占位符
       其余状态 -> 工具发现与 UnifiedToolDefinition
         -> ToolFormatAdapter
              vcp-text        -> {{tool_prompt}} 文本消息
                -> local_text: AIO 本地解析/执行
                -> vcp_distributed_text: VCP 解析并路由到 AIO 分布式节点
              provider-native -> nativeTools 请求旁路
  -> Provider Adapter
  -> LlmResponse(content + toolCalls)
  -> local_*: AIO 统一工具编排器 -> 审批 / 执行 / UnifiedToolResult -> Adapter 续轮
  -> vcp_distributed_text: VCP 已完成解析、分布式调用和续轮，AIO 不再二次编排
  -> 最终回答或下一轮调用
```

### 11.2. 编排器职责

- 同时消费文本正文和结构化 `toolCalls`，不能再假设工具请求只存在于正文。
- `local_text` 继续走现有 VCP parser 和结果格式化。
- `local_native` 直接消费 Tool IR，不经过 VCP 文本解析。
- 两种 AIO 本地模式复用审批、超时、并行执行、自动批准、状态更新和最大轮次控制。
- `vcp_distributed_text` 只负责让上下文继续携带 AIO 工具提示，并跳过 AIO 本地解析循环；VCP 后端负责解析、结果回注和迭代，AIO 分布式节点仅执行收到的 `execute_tool`。
- 编排器接收已经确定的 `ResolvedToolPlan`，不得自行根据响应内容切换格式。
- 一轮只能有一个工具格式适配器作为主路径；原生与 VCP 混合检测只用于诊断，不默认双执行。
- 保留模型在工具调用同时返回的可见正文，但不得因正文非空而忽略结构化调用。
- `callConsumer === "upstream"` 时跳过 AIO 本地解析和循环，避免重复调用；这条规则不得反向抑制 `vcp_distributed_text` 的 AIO 文本提示。
- 若响应出现与计划不符的另一种调用格式，应记录协议冲突，不应自动执行第二条路径。

### 11.3. 会话持久化与重放

运行时真正的工具调用和工具结果需要结构化保存。它们与预设中的 `{{tool_prompt}}` 不是同一类“工具消息”：

```ts
type RuntimeToolEvent =
  | { type: "tool_call"; call: UnifiedToolCall }
  | { type: "tool_result"; result: UnifiedToolResult };
```

需要决定这些事件是继续保存在现有节点 metadata，还是升级为显式内容块/节点类型。无论采用哪种存储方式，重新发送上下文时必须由 Provider Adapter 恢复正确的 assistant call 和 tool result 顺序。

### 11.4. 工具提示配置页面

配置页面至少需要支持：

- 文本工具提示模板编辑与恢复默认值。
- 工具定义块和协议说明块的排列。
- 自定义前后包装文本。
- 当前协议渲染预览。
- 当前启用工具数量、方法数量和估算 Token。
- 提示用户在 Agent 预设中使用独立的 `{{tool_prompt}}` 消息。
- 显示 Agent 工具格式请求、渠道执行所有权、最终格式适配器和冲突原因。

第一版可以使用模板编辑器；是否升级为拖拽块编排器是 UI 决策，不影响底层 `ToolPromptRenderer` 契约。

### 11.5. 上下文预览

原生模式下工具提示消息被清理，但用户仍需看到请求旁路贡献。预览建议显示：

```text
工具投递：Gemini Native Function Calling
工具数量：6
文本工具提示：未注入
原生请求字段：functionDeclarations
本地执行：启用
格式决策：显式渠道声明 + Adapter 完整契约 + 模型能力
```

`local_text` 显示 `{{tool_prompt}}` 展开后的消息、Token 和“AIO 本地消费”。`vcp_distributed_text` 同样显示展开后的 AIO 工具提示，但执行信息应标为“VCP 解析 / AIO 分布式节点执行”，并单独列出 VCP Agent 占位符内容不受 AIO 控制。`upstream_managed` 才明确显示 AIO 未发送文本或原生工具贡献。空消息清理应在处理日志中记录抑制原因，不能静默到无法追踪。

## 12. 测试与验收

### 12.1. 已执行的调查验证

2026-07-18 调查阶段已运行：

- `bun run test:llm-core`：18 个文件、92 个测试通过。
- VCP 与原生空响应诊断定向测试：2 个文件、31 个测试通过。
- OpenAI Chat/Responses、Anthropic、Gemini、Cohere、Vertex Adapter 定向测试：6 个文件、43 个测试通过。

本轮补充对照了 VCPToolBox 的 `Agent/AIOgugu.txt`、`modules/messageProcessor.js`、`modules/dynamicToolRegistry.js`、`Plugin.js` 与 `WebSocketServer.js`，确认“分布式注册进入执行注册表”和“占位符展开进入 Prompt”是两条独立链路。

这些结果证明现有 Adapter 单元测试基线稳定，不证明 `llm-chat` 原生工具闭环已存在。

### 12.2. Adapter 契约测试

每个协议至少覆盖：

- 单工具声明与强制工具选择。
- 非流式单调用。
- 流式参数增量聚合。
- 并行调用与稳定调用 ID。
- 成功结果、错误结果和最终回答。
- Provider replay state 原样回放。
- 空正文但存在工具调用。
- 调用正文与工具字段同时存在。

### 12.3. 上下文管道测试

- 当前 `mode = auto/manual` 继续只控制审批；新增 `formatMode` 不与其混淆。
- `ToolFormatResolver` 在 AIO 需要贡献工具时只选择一个格式适配器；`disabled` / `upstream_managed` 不选择适配器。
- `local_text` 下 `{{tool_prompt}}` 展开为配置模板。
- `vcp_distributed_text` 下 `{{tool_prompt}}` 同样展开，但 `consumeTextCallsLocally = false`。
- `local_native`、`disabled` 下宏返回空且整条纯宏消息被清理。
- `upstream_managed` 下不注入 AIO 文本提示，也不附加 AIO 原生工具；普通预设中的 VCP Agent 占位符不受影响。
- 混有其他正文的消息只清空宏，不删除剩余正文。
- 空消息不进入 Token 预算和消息格式化。
- `{{tool_context}}` 在原生模式继续保留。
- `autoInjectIfMacroMissing` 只注入纯 `{{tool_prompt}}` 消息。
- 原生工具旁路不依赖预设中是否存在工具宏。
- VCP 文本消费与显式原生请求产生可见配置冲突，不生成混合请求。
- VCP 文本消费与 AIO 文本提示组合为合法的 `vcp_distributed_text`，不误报重复接管冲突。
- 分布式 manifest 注册不会自动改变 Prompt；只有显式 VCP 聚合/单工具占位符才会增加 VCP 侧工具描述。
- `{{VCPAllTools}}` / `{{VCPDynamicTools}}` 与 AIO `{{tool_prompt}}` 覆盖同一工具时只产生可见重复提示，不擅自删除任一侧配置。
- 同主机 VCP 判断只作为启发式证据，并覆盖同主机误判、反向代理漏判和显式声明优先级。

### 12.4. 编排端到端测试

- OpenAI Chat、Responses、Anthropic、Gemini 各完成一次“用户请求 -> 工具调用 -> 工具结果 -> 最终回答”。
- 覆盖审批拒绝、自动批准、执行错误、超时、并行调用和最大迭代终止。
- 覆盖会话保存、重新加载和继续对话。
- 覆盖 VCP 渠道保留 AIO 文本工具提示、跳过 AIO 本地解析，并由 VCP 经 `execute_tool/tool_result` 完成一次分布式 AIO 工具调用。
- 覆盖 VCP 只注入自身显式占位符、不会因分布式注册自动追加 AIO 工具描述。
- 覆盖 OpenAI-Compatible 外观但由 VCP 消费文本调用的渠道，不发送前端原生 `tools`。
- 覆盖模型只输出调用意图正文、只返回原生调用字段以及二者同时出现的诊断差异。
- 覆盖响应出现与 `ResolvedToolPlan` 不一致格式时只诊断、不双执行。

### 12.5. 完整验证

按仓库规范，相关施工完成后至少运行：

```text
bun run test:llm-core
bun run test:run -- <相关测试>
bun run check:frontend
bun run build
```

涉及移动端共享 Core 消费时，还需运行移动端对应类型检查、测试和 Vite 构建。真实 Tauri 运行态需要通过项目 Tauri 开发脚本验证，不能用普通浏览器替代。

## 13. 分阶段验收标准

### 13.1. Adapter 修补完成

- 已声明支持工具的渠道能完成请求、调用解析和结果续轮三段契约。
- Azure 不再出现配置存在但 Adapter 缺失。
- Ollama 端点提示和实际 Codec 一致。
- Gemini/Cohere 已知结果回传缺陷修复。
- 所有调用 ID和函数名在流式与非流式路径保持一致。

### 13.2. 原生编排第一批完成

- `llm-chat` 能执行 OpenAI Chat、Responses、Anthropic、Gemini 的原生调用。
- VCP 文本模式保持现有闭环。
- `auto` 能产生可解释、可预览的确定投递方式。
- `auto` 在 AIO 贡献工具时每轮最多选择一个 `ToolFormatAdapter`，不会同时注入文本约束和原生工具字段。
- 原生模式不向模型发送 VCP 工具定义和协议说明。
- VCP 文本后端消费调用时，前端不会附加原生工具或启动 AIO 本地工具循环，但会在 `vcp_distributed_text` 下继续注入 AIO 文本工具提示。
- AIO 分布式工具注册与 VCP Prompt 占位符展开保持解耦；默认不会因注册而重复注入定义。
- `{{tool_prompt}}` 空展开后的消息被正确清理。
- 工具配置页面统一拥有文本工具提示包装与编排。
- 不为厂商协议派生 Agent 预设变体。

## 14. 风险与待确认事项

### 14.1. 主要风险

- Provider 协议继续演进，尤其是 Gemini Interactions 与 Gemini 3.x 严格调用匹配。
- 中转渠道宣称 OpenAI-Compatible，但可能不完整支持并行调用、strict schema 或工具结果角色。
- 会话压缩或截断可能破坏 assistant call 与 tool result 的配对。
- 原生工具和推理状态存在顺序依赖，错误丢弃 Provider replay state 可能导致空响应。
- OpenAI-Compatible 自定义渠道可能隐藏 VCP 或其他 Agent 后端，仅依赖 Provider 类型会选择错误工具格式。
- VCP 调用消费方检测如果只依赖同主机启发式，既可能误判，也可能漏掉反向代理后的 VCP 渠道。
- AIO 无法仅从 HTTP/WS 连接状态得知 VCP Agent 实际展开了哪些占位符，因此重复提示检测只能基于可获得的配置证据并保持非破坏性。
- 工具配置模板过度自由可能产生格式错误，需要默认模板、预览和恢复能力。
- 一次性迁移旧 Agent 工具提示时，不能通过宽泛正则误改用户自定义正文。

### 14.2. 实施前仍需决定

1. `ToolPromptRenderer` 第一版采用自由模板还是结构化块列表。
2. 旧 `{{tools}}` / `{{tool_usage}}` 宏是直接迁移后移除，还是保留一段弃用期。
3. `upstream_managed` 作为显式“不贡献 AIO 工具”选项放在 Agent、LLM Profile 还是渠道预设中。
4. **[已决定，2026-08-09]** 用户可编辑的静态渠道工具处理声明放入 LLM Profile 的 `toolHandling`；它保存调用消费方、上游协议及可选的分布式暴露状态。渠道预设不承载该职责；后续独立探测/握手作为更高质量的运行时证据接入解析器，但不覆盖用户显式声明。
5. VCP 是否提供稳定握手字段，用于确认调用消费协议、AIO 分布式工具注册状态；Prompt 占位符展开仍应视为 Agent 配置，不能从注册状态推断。
6. Runtime Tool Event 保存在节点 metadata、消息内容块还是独立节点类型。
7. 原生模式失败后是否允许自动回退文本模式；默认建议只提示并由用户重试，避免同一请求产生重复副作用。
8. 模型能力来自静态元数据、渠道探测还是二者组合；`tools: true` 不能继续作为唯一依据。

## 15. 外部资料

- OpenAI Chat Completions：https://developers.openai.com/api/docs/api-reference/chat/object
- OpenAI Responses 迁移：https://developers.openai.com/api/docs/guides/migrate-to-responses
- Anthropic Messages Tool Use：https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts
- Gemini Function Calling：https://ai.google.dev/gemini-api/docs/function-calling
- Gemini Interactions 迁移：https://ai.google.dev/gemini-api/docs/migrate-to-interactions
- AWS Bedrock Tool Use：https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-client-side.html
- Cohere Tool Use：https://docs.cohere.com/docs/tool-use-usage-patterns
- Ollama OpenAI Compatibility：https://docs.ollama.com/api/openai-compatibility

## 16. 相关仓库文档与对照实现

- `src/tools/tool-calling/ARCHITECTURE.md`
- `src/tools/vcp-connector/ARCHITECTURE.md`
- `src/tools/llm-chat/ARCHITECTURE.md`
- `docs/architecture/agent-tool-skill-integration.md`
- `docs/architecture/llm-apis-architecture.md`
- `docs/Plan/llm-provider-adapter-sharing-investigation.md`
- VCPToolBox `Agent/AIOgugu.txt`
- VCPToolBox `modules/messageProcessor.js`
- VCPToolBox `modules/dynamicToolRegistry.js`
- VCPToolBox `Plugin.js`
- VCPToolBox `WebSocketServer.js`
