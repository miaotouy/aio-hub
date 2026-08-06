# 调查笔记已知问题核验清单

> 状态：已完成首轮静态核验与相关单测，待按优先级修复和运行态验收
>
> 核验日期：2026-08-05
>
> 调查来源：`G:\BaiduSyncdisk\git\项目调查笔记`
>
> 影响范围：`src/tools/vcp-connector`、`src/tools/aio-file-operator`、`src/tools/data-filter`、`src/tools/tool-calling`、`src/tools/llm-chat`、`src/tools/agent-manager`、`src/llm-apis`、`src-tauri`

## 1. 文档定位

本文记录外部调查笔记中已抽样核验的问题、当前源码证据、风险边界和建议处理顺序。它是问题清单和修复门禁，不代表问题已经修复。

状态约定：

- `已确认`：当前源码中存在明确代码路径，必要时已做局部运行验证。
- `设计风险`：实现方式已确认，但实际性能或用户影响仍需运行态数据。
- `已修复/笔记过时`：调查笔记描述与当前源码不再一致，不应重复立项。
- `待验证`：仍缺少真实 Tauri、外部服务器或大数据量场景验证。

## 2. 待处理问题总表

| ID     | 问题                                                   | 状态                 | 风险 | 建议优先级 |
| ------ | ------------------------------------------------------ | -------------------- | ---- | ---------- |
| KI-001 | VCP `internal_request_file` 绕过本地文件安全策略和审批 | 已修复，待运行态验收 | 高   | P0         |
| KI-002 | `data-filter` 自定义条件通过 `new Function` 执行脚本   | 已修复               | 高   | P0         |
| KI-003 | Agent 可通过 `set_agent_field` 修改自身工具审批配置    | 已确认，利用链有前提 | 高   | P1         |
| KI-004 | 崩溃或强退后，残留 `generating` 消息节点缺少启动自愈   | 已确认               | 中   | P1         |
| KI-005 | 所有 API Key 不可用时仍回退到第一个 Key                | 已确认               | 中   | P1         |
| KI-006 | 工具审批 Promise 没有超时或生命周期清理                | 已确认               | 中   | P1         |
| KI-007 | VCP 未闭合请求块会终止后续扫描                         | 已确认并运行复现     | 中低 | P2         |
| KI-008 | 跨会话全文搜索每次遍历并读取全部会话文件               | 设计风险，未压测     | 中低 | P2         |

## 3. 问题详情

### KI-001：`internal_request_file` 绕过文件安全策略和审批

**状态：已修复，待真实 VCP/Tauri 运行态验收**

修复前链路：

1. `vcpNodeProtocol.handleExecuteTool()` 收到 `internal_request_file` 后提前进入专用分支；
2. 该分支位于普通工具注册、方法暴露名单和禁用规则校验之前；
3. 调用不会进入 `toolCallingStore` 审批流程；
4. 路径被直接传给 Tauri `read_file_as_base64`；
5. Rust 命令仅检查文件是否存在，随后直接 `fs::read`，没有目录白名单、敏感目录、大小或符号链接边界检查。

主要证据：

- `src/tools/vcp-connector/services/vcpNodeProtocol.ts`
- `src-tauri/src/commands/file_operations.rs`
- `src-tauri/src/commands.rs`
- `src/tools/vcp-connector/docs/internal-file-request.md`

风险边界：

- 不是本地聊天模型直接触发的普通 Agent 工具路径；
- 前提是 AIO Hub 作为分布式节点连接到 VCP 主服务器；
- 一旦服务器能够向节点发送对应 `execute_tool` 请求，当前节点没有逐次审批和路径限制。

#### 架构决策

不把整个 VCP 协议处理器移动到 `aio-file-operator`，采用“协议留在 VCP、文件能力下沉”的分层：

- `vcp-connector` 保留 `toolName`、`requestId`、`fileUrl` 解析和 VCP `tool_result` 包装；
- `aio-file-operator` 增加非 `agentCallable` 的安全原始文件传输服务；
- 服务复用 `aio-file-operator` 的配置、路径安全规则、大小限制和审计日志；
- 不直接复用现有 `read_file`，因为它返回解析后的文本，而 VCP 需要原始字节 Base64；
- 最终应由 Rust 命令原子完成真实路径解析、安全判断、大小检查和读取，降低检查与读取之间的竞态窗口。

建议新增内部接口：

```ts
readFileForExternalTransfer({
  path,
  source: {
    type: "vcp",
    serverId,
    requestId,
  },
}): Promise<{
  fileData: string;
  mimeType: string;
  size: number;
}>;
```

安全门禁：

- [x] VCP 外部文件传输能力默认开启，并提供显式关闭开关；默认开启仅代表协议能力可用，不得绕过路径安全、审批、大小限制和审计。
- [x] 只接受格式正确的 `file://` URL，删除宽松字符串替换 fallback。
- [x] 解析后必须是本机绝对路径。
- [x] 使用真实路径校验，阻止 `..`、目录前缀碰撞和符号链接逃逸。
- [x] 白名单内可按配置允许；死区直接阻断；审批区必须本地确认。
- [ ] 没有可用审批 UI、审批超时或窗口关闭时默认拒绝。
- [x] 审批 UI 展示服务器身份、完整路径、大小、MIME 和请求 ID。
- [x] 设置严格的单文件大小上限和并发/速率限制。
- [x] 审计日志记录来源、规范化路径、判断结果和文件大小，但不保存文件内容。
- [x] 增加 Rust 原子安全读取命令及路径穿越、符号链接、UNC、大小上限测试。
- [ ] 使用真实 Tauri WebView 和 VCP 测试服务器验证允许、拒绝、超时和断线场景。

### KI-002：`data-filter` 可执行调用方提供的 JavaScript

**状态：已修复**

`data-filter` 的 `custom` 操作符通过 `new Function("item", "value", ...)` 执行 `customScript`，而 `applyFilter` 同时标记为 `agentCallable: true`。当工具启用且调用被批准或自动批准时，模型生成的字符串会作为 JavaScript 执行。

主要证据：

- `src/tools/data-filter/logic/dataFilter.logic.ts`
- `src/tools/data-filter/data-filter.registry.ts`
- `src/tools/data-filter/__tests__/dataFilter.logic.test.ts`

处理门禁：

- [x] 明确决定是否删除 Agent 调用中的 `custom` 操作符。
- [x] 若 UI 仍需脚本能力，将脚本模式与 Agent 工具入口分离。
- [x] Agent 路径只保留声明式操作符，禁止表达式访问全局对象和函数构造器。
- [x] 在参数校验层拒绝 `customScript`，而不是只依赖 Prompt 约束。
- [x] 增加恶意表达式、全局对象访问和构造器逃逸回归测试。

### KI-003：Agent 可修改自身审批配置

**状态：已确认，利用链有前提**

`set_agent_field` 的保护字段不包含 `toolCallConfig`，因此可以修改：

- `toolCallConfig.mode`
- `toolCallConfig.defaultAutoApprove`
- `toolCallConfig.autoApproveTools`
- `toolCallConfig.autoApproveMethods`
- `toolCallConfig.toolToggles`

执行器会实际读取这些字段决定是否自动批准。攻击链的前提是 `set_agent_field` 本身已经被自动批准，或用户先批准了这次配置修改。

主要证据：

- `src/tools/agent-manager/services/agentManagementService.ts`
- `src/tools/llm-chat/llm-chat.registry.ts`
- `src/tools/tool-calling/core/executor.ts`
- `src/tools/agent-manager/types/agent.ts`

处理门禁：

- [ ] 将 `toolCallConfig` 加入 Agent 工具修改黑名单，或使用精确字段允许列表。【不能禁用，这会砍掉我的功能设计】
- [ ] 安全相关配置只能通过受信任 UI 修改。
- [ ] 禁止工具修改自己的启用、自动批准和权限覆盖项。
- [ ] 对安全配置修改增加独立确认和审计记录。
- [ ] 增加“修改自身工具策略”回归测试。

### KI-004：启动时不修复残留的 `generating` 节点

**状态：已确认**

当前僵死节点修复依赖 `generatingNodes.size` 从大到小变化。应用重启后运行时集合从空集合开始，加载会话详情时也没有重置落盘节点的 `generating` 状态，因此崩溃或强退期间写入的状态可能长期残留。

主要证据：

- `src/tools/llm-chat/stores/llmChatStore.ts`
- `src/tools/llm-chat/stores/session/sessionLifecycleManager.ts`

处理门禁：

- [ ] 加载当前会话和按需加载其他会话时统一修复残留生成状态。
- [ ] 有正文的节点转为 `complete`，空正文节点转为 `error` 并写入“生成意外中断”。
- [ ] 修复后同步消息数量、更新时间并持久化。
- [ ] 增加模拟重启加载的单元测试。
- [ ] 使用真实数据根验证崩溃恢复和多会话按需加载。

### KI-005：全部 Key 不可用时回退首 Key

**状态：已确认**

`pickKey()` 在没有可用 Key 时返回 `profile.apiKeys[0]`，导致已知不可用的凭据继续收到请求。“全部熔断”当前不是硬隔离。

主要证据：

- `src/composables/useLlmKeyManager.ts`
- `src/composables/__tests__/useLlmKeyManager.test.ts`

处理门禁：

- [ ] 区分“全部被用户禁用”和“全部暂时熔断”。
- [ ] 全部被用户禁用时直接返回配置错误，不得请求。
- [ ] 全部熔断时明确决定：失败、等待最近恢复时间，或仅在用户确认后强制探测。
- [ ] 不静默回退到已知坏 Key。
- [ ] 增加全部禁用、全部熔断、自动恢复和最后一个可用 Key 的测试。

### KI-006：审批等待没有超时和生命周期清理

**状态：已确认**

`toolCallingStore.requestApproval()` 创建的 Promise 仅在批准或拒绝时结束。聊天编排和 VCP 审批请求会直接等待该 Promise，没有统一超时、会话删除、窗口关闭或连接断开清理。

主要证据：

- `src/tools/llm-chat/stores/toolCallingStore.ts`
- `src/tools/llm-chat/composables/chat/useToolCallOrchestrator.ts`
- `src/tools/tool-calling/core/executor.ts`
- `src/tools/vcp-connector/services/vcpNodeProtocol.ts`

处理门禁：

- [ ] 审批请求支持超时时间和 `AbortSignal`。
- [ ] 超时默认拒绝，并从 `pendingRequests` 中移除。
- [ ] 会话删除、生成中止、窗口关闭和 VCP 断线时清理对应请求。
- [ ] UI 展示剩余时间或超时原因。
- [ ] 增加超时、取消、批量审批与断线清理测试。

### KI-007：未闭合 VCP 请求块终止后续扫描

**状态：已确认并运行复现**

解析器发现缺少 `END_TOOL_REQUEST` 时执行 `break`。这会保留此前已经解析的请求，但放弃扫描文本中的其余内容。

主要证据：

- `src/tools/tool-calling/core/protocols/vcp-protocol.ts`

已复现场景：

- 两个完整请求块：两个均被解析；
- 第一个完整、第二个未闭合：仅返回第一个并记录 warning；
- 未闭合块之后即使存在完整请求块，也不会继续扫描。

处理门禁：

- [ ] 明确流式未完成文本和最终完整文本的不同解析语义。
- [ ] 最终文本中遇到未闭合块时，评估是否能安全跳到下一个起始标记继续扫描。
- [ ] 防止恢复扫描造成嵌套块或参数内容误执行。
- [ ] 增加“坏块前后均有合法块”、代码围栏和嵌套转义测试。

### KI-008：跨会话搜索缺少索引

**状态：设计风险，未压测**

当前 Rust 搜索会遍历会话与 Agent 文件，读取完整文本，执行正则预过滤后再反序列化；并发度 50 只能改善吞吐，不能改变数据量增长时总扫描量增加的事实。

主要证据：

- `src-tauri/src/commands/llmchat_search.rs`

处理门禁：

- [ ] 构造不同数量、平均大小和分支数量的会话数据集。
- [ ] 记录首批结果延迟、完成延迟、内存、磁盘读取量和取消响应时间。
- [ ] 在压测证明需要前，不提前引入复杂索引。
- [ ] 若超过体验门槛，再评估增量倒排索引或 SQLite FTS。

## 4. 已修复或笔记过时的条目

这些条目不应按当前描述重复立项，但可保留回归测试。

### CLOSED-001：Azure Provider 可配置但没有运行时 Adapter

**当前结论：笔记过时。**

当前 Adapter 表已经注册 `azureOpenAiAdapter`，并存在 Azure URL、鉴权和请求转换测试。

证据：

- `src/llm-apis/adapters/index.ts`
- `src/llm-apis/adapters/azure/`

回归门禁：

- [x] Azure Adapter 已注册。
- [x] Azure 工具测试通过。
- [ ] 真实 Azure 渠道连接仍需具备凭据的环境验证。

### CLOSED-002：VCP Bridge 不支持方法级禁用

**当前结论：笔记过时。**

当前 UI 可以按 `toolName:command` 写入 `disabledBridgeToolIds`，`VcpBridgeFactory` 会把禁用列表传给 `VcpToolProxy`，代理构建时过滤对应命令。

证据：

- `src/tools/vcp-connector/components/distributed/BridgedToolsList.vue`
- `src/tools/vcp-connector/services/VcpBridgeFactory.ts`
- `src/tools/vcp-connector/services/VcpToolProxy.ts`

### CLOSED-003：普通请求不区分错误类别，参数错误也会累计熔断

**当前结论：原描述已部分修复。**

当前统一请求路径使用 `key-health-policy` 分类错误。认证、限流和暂态故障分别处理，参数、配置、模型不可用等错误采用 `record-only`，不计入熔断阈值。

证据：

- `src/llm-apis/key-health-policy.ts`
- `src/composables/useLlmRequest.ts`
- `src/llm-apis/__tests__/key-health-policy.test.ts`

仍需关注：

- [ ] Provider 返回的非标准错误是否可能被误分类为暂态故障。
- [ ] 所有 Key 不可用后的首 Key 回退仍由 KI-005 跟踪。

## 5. 已执行验证

首轮核验已执行以下相关测试：

```text
src/llm-apis/adapters/azure/__tests__/utils.test.ts
src/composables/__tests__/useLlmKeyManager.test.ts
src/tools/tool-calling/__tests__/tool-calling.test.ts
src/tools/llm-chat/stores/session/__tests__/sessionManagers.test.ts

4 个测试文件，35 项测试通过。
```

另执行：

```text
src/tools/data-filter/__tests__/dataFilter.logic.test.ts

1 个测试文件，16 项测试通过。
```

现有测试通过只表示当前既有行为未回归，不代表上述安全和边界问题已被覆盖。KI-001、KI-003、KI-004、KI-006 和 KI-008 仍需要新增专项测试或真实运行态验证。

## 6. 建议处理顺序

1. **先处理 KI-001**：切断 VCP 远端任意路径读取，在保持文件读取能力默认开启的前提下，补齐关闭开关、白名单、审批、大小限制和审计。
2. **随后处理 KI-002**：从 Agent 工具入口移除动态 JavaScript 执行能力。
3. **同步处理 KI-003 与 KI-006**：固定安全配置修改边界，并为所有审批增加超时和生命周期清理。
4. **处理 KI-004 与 KI-005**：修复聊天恢复和多 Key 失败语义。
5. **处理 KI-007**：补齐解析器坏块恢复策略和回归测试。
6. **最后评估 KI-008**：先压测，再决定是否建设索引。
