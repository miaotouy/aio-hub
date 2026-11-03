# VCP 消息拆分后的跨轮历史与缓存调查

> 日期：2026-11-03
> 状态：调查完成；2026-11-03 已实施 AIO 新拆分历史的发送合并，VCP 协议扩展保留为后续候选。
> 范围：AIO Hub 桌面聊天、`E:/rc20/vcp/VCPToolBox` 流式工具循环，补充核对 VCPChat 的历史组装入口。

## 1. 结论

当前采用 **AIO 发送时合并新拆分历史** 的最小方案：界面和存储继续分段，发往 VCP 时按同请求恢复成一条 assistant，与配套 VCPChat 的发送形态对齐。已有旧段保持原回传方式。

下述差异与复现记录基于实施前代码，用于区分客户端拆分引入的差异和 VCP 自身的展示/模型输入差异。由 VCP 提供权威回放数据保留为完整解决工具 payload 差异的后续候选。

当前至少存在三种确定的请求差异：

1. VCP 循环内的工具结果是 `user + VCP_TOOL_PAYLOAD + 原始结果`；客户端收到的是批次、可读结果和摘要。AIO 将收到的展示正文回传为 user，角色一致，内容不同。
2. VCP 循环内只回填模型原始正文；AIO 对后接 VCP 工具结果的 assistant 保留独立推理，并在 OpenAI Chat 请求中发送 `reasoning_content`。
3. VCP 可仅在发给客户端时把独立推理转换为 `<think>` 正文；AIO 保存该展示正文，下一轮与 VCP 循环内的原始正文不同。

另有条件性差异：`EnableRoleDivider` 与 `EnableRoleDividerInLoop` 控制不同阶段；只开前者时，模型生成的角色标签可能在下一轮历史中才被拆分。

以上能够解释“预设与最前面的历史可复用，进入上一轮拆分区域便发生变化”。具体线上首个断点仍要结合该轮实发请求确认。本文的消息前缀统计是结构对照，无法据此计算真实缓存 Token 或费用。

## 2. 两种“拆分”处理不同内容

### 2.1 VCP 服务端：按文本标签转换实际消息角色

入口：`E:/rc20/vcp/VCPToolBox/modules/roleDivider.js`。

- `processSingleMessage()`（185 行起）识别 `ROLE_DIVIDE_SYSTEM / ASSISTANT / USER` 及其结束标签，输出多条 `{ role, content }`。
- 普通正文沿用原角色，被标签包围的内容使用标签指定角色。纯空白外段通常丢弃，实际输出正文中的换行保持原样。
- `protectToolContent()`（67 行起）保护工具请求、工具结果框和原子批次。`VCP_TOOL_PAYLOAD` 消息直接跳过角色解析，结果内的协议示例保持数据身份。
- 角色开关、来源角色扫描开关和忽略列表还会影响结果；数组内容走独立的多模态处理分支。

两个调用阶段：

| 阶段                       | 入口                                         | 条件                | 跳过范围                               |
| -------------------------- | -------------------------------------------- | ------------------- | -------------------------------------- |
| 每次客户端请求的最终预处理 | `modules/chatCompletionHandler.js:1174–1186` | `EnableRoleDivider` | `skipCount: 1`，第一条消息保留         |
| 一次 HTTP 响应内的工具循环 | `modules/handlers/streamHandler.js:482–492`  | 两个开关同时开启    | `skipCount: 0`，处理新生成的 assistant |

`server.js:385–386` 中两个开关的源码默认值均为 false。调查未读取实际私密配置，运行值待按目标环境确认。

### 2.2 AIO：按服务端 SSE 阶段创建会话节点

入口：[`vcp-stream-segmenter.ts`](../../core/tool-calling/vcp-stream-segmenter.ts)。

- 通过服务端 chunk ID 区分模型生成、工具批次和分隔阶段。
- 新批次正文完整保留，包括外层角色围栏；旧工具 chunk 清除其外层 user 围栏。
- 模型自己写出的标签示例留在模型段，AIO 的该分段器没有复刻 VCP 的通用角色标签解析器。
- [`useSingleNodeExecutor.ts`](../../composables/chat/useSingleNodeExecutor.ts:428) 保存请求关联、段类型、上游响应 ID 等信息；现有 `metadata.vcpResponse` 没有服务端权威历史正文。
- [`session-loader.ts`](../../core/context-processors/session-loader.ts:295) 在组装历史时将 VCP tool 节点转为 user，正文取 `node.content`。

因此，将 UI 工具节点改成其它角色，或复制一份 `roleDivider.js` 到客户端，都无法补齐缺失的真实工具结果。

## 3. 首个稳定性断点

### 3.1 工具展示内容与模型输入来自两条支路

VCP `streamHandler.js`：

- 521–532 行：`emitToolBatch()` 将 `visibleToolResults` 经 `formatToolResultBatch()` 发给客户端。
- 660–689 行：可读结果按展示开关决定是否发送；调用摘要仍进入展示批次。
- 694–716 行：原始工具结果序列化为 `VCP_TOOL_PAYLOAD`，追加到 `currentMessagesForLoop`。
- 728–737 行：将循环消息提交给下一次模型调用。

固定样例中的实际循环请求：

```text
user:
<!-- VCP_TOOL_PAYLOAD -->
[{"type":"text","text":"{\"answer\":42}"}]
```

同一结果经 AIO 保存、下一轮回传，再经过 VCP 最终处理后：

```text
user:
【工具返回批次开始｜时间：……】
[[VCP调用结果信息汇总:
- 工具名称: Demo
- 执行状态: ✅ SUCCESS
- 返回内容: {"answer":42}
VCP调用结果结束]]
[本轮工具调用摘要:]
Demo 调用成功。
[本轮工具调用摘要结束]
【工具返回批次结束｜时间：……】
```

`modules/toolResultBatch.js:66–128` 的 `projectToolBatchForUpstream()` 仅将批次起止标记改为可读边界，保留内容与时间戳；它没有把展示文本恢复成 `VCP_TOOL_PAYLOAD`。

这里的批次时间戳是生成后被保存的固定值，调查未发现同一历史批次每次发送都重新计时。当前首要问题是两份正文不同，删除时间戳仍无法恢复原始结果。

关闭详细结果展示时，客户端甚至只拿到调用摘要；成功状态、工具名称和记录 ID 无法唯一还原实际返回值。图片结果在 VCP 循环内还有多模态处理，进一步排除了通用的客户端逆向还原方案。

### 3.2 推理字段可让差异提前到 assistant

VCP `streamHandler.js:198–210` 的 `appendDelta()` 将独立推理放入日志字段，循环使用的 `collectedContentThisTurn` 只包含原始 `delta.content`。

AIO `session-loader.ts:311–334` 对后接同请求工具段的 assistant 保留 `reasoningContent`；`packages/llm-core/src/providers/openai-compatible.ts:465` 将其写为 `reasoning_content`。现有 session-loader 测试也明确覆盖这一回传行为。

因此，即使 assistant 正文相同，下一轮也可能比 VCP 内部循环多出推理字段。具体上游是否把该字段计入缓存取决于实际协议和模型，本调查确认的是请求结构差异。

VCP `streamHandler.js:212` 起还可在客户端响应副本上将推理转成 `<think>` 正文；循环内维持原始正文。该条件成立时，AIO 保存的 assistant 正文从开头便会不同。通用正则去除 `<think>` 容易误伤模型原本生成的文本，应优先使用服务端提供的原始回放内容。

### 3.3 循环内和跨请求角色处理可能不一致

当模型正文包含有效角色标签时：

- 两个分割开关都开启：循环内与下一轮入口可得到相同角色分段；工具结果正文差异仍然存在。
- 仅开启 `EnableRoleDivider`：循环内保留标签，下一轮历史才进行角色转换，角色和消息数量都可能变化。

单纯关闭 AIO 拆分也无法保证一致。固定样例中，未拆分的组合回复在工具围栏前附带展示换行，VCP 下一轮切分后的首条 assistant 比循环内多一个换行；后续工具结果仍来自展示支路。

### 3.4 VCPChat 沿用展示历史，无法直接作为正确回放基准

`E:/rc20/vcp/VCPChat/modules/chat/singleChatRequestOrchestrator.js:185–210, 355–399` 从历史的 `message.content` 构造 text parts，使用原消息角色。它会移除被手动标为隐藏的工具结果，但该入口未提供循环原始消息的权威回放数据。

补充核对主窗口和 IPC 发送链路：

- `modules/renderer/mainChatStreamConsumer.js:5–22` 为一次请求建立 assistant，正文 chunk 持续累积；`modules/renderer/streamManager.js:1901–1927` 将完整终稿交给 transient history，整次 VCP 工具循环保存在该 assistant 中。
- `modules/ipc/chatHandlers.js:1100` 附近把仅含一个 text part 的消息转回字符串，因此常规纯文本历史会进入 VCP 的字符串角色解析分支。
- 普通流正文提取 `modules/chat/contentRuntime.js:3–11` 主要读取 `delta.content`；发送白名单仅保留 role、content、name 与工具调用关联字段，未回传独立 `reasoning_content`。
- `modules/ipc/chatHandlers.js:1227–1250` 在 `enableThoughtChainInjection !== true` 时清除历史思维链；`modules/contextSanitizer.js:204–211` 只将起止标签独占行的 `<think>` / `<thinking>` 和 VCP 元思考链视为待清除块。该默认策略有助于减少服务端“推理转展示正文”带来的历史差异。
- `vcpchatExtensions`（`modules/ipc/chatHandlers.js:74–120`）提供时间戳绑定、消息定位及会话来源；该入口没有携带循环原始工具结果的回放数据。

常规配合方式是：VCPChat 保存一条带协议标签的 assistant，下次将其原文回传，再由 VCP 按开关拆为实际角色消息。UI 中的工具卡片和角色分界属于渲染结果。

因此，仅仿照 VCPChat 把整段回复重新合成一条 assistant，同样没有解决原始工具 payload 与展示文本的差异。它的独立推理回传策略与 AIO 存在差别，可以作为局部对齐依据。本文未运行 VCPChat 完整请求管道，多模态、预处理器和用户配置仍会影响其最终结果。

## 4. 固定输入复现与边界

临时复现脚本：`.tmp/vcp-split-cache-investigation/analyze.ts`；结果：同目录 `results.json`。

运行方式：

```powershell
bun .tmp/vcp-split-cache-investigation/analyze.ts
```

脚本调用 VCP 当前 `StreamHandler`、`ToolCallParser`、`roleDivider`、批次投影函数以及 AIO 当前 `VcpStreamSegmenter`。工具执行器与模型响应使用固定数据，拦截循环 fetch 并记录请求，不启动服务、不执行真实工具、不访问模型网络。

AIO 历史部分按当前 session-loader 的角色和中间推理规则组装；完整会话存储、媒体解析、正则、动态注入、RAG 与其它预处理器保持在本次模拟之外。比较对象为“第一轮内部工具后续调用的请求前缀”与“第二轮用户消息进入 VCP 最终处理后的历史”。

最小前缀为 `system 预设 → user 问题 → assistant 工具请求 → user 工具结果`：

| 场景                             | 完全相同的前置消息数 | 首个差异                                     |
| -------------------------------- | -------------------: | -------------------------------------------- |
| 拆分，详细结果展示               |                    3 | 第 4 条 user：原始 payload 与展示批次不同    |
| 拆分，仅摘要                     |                    3 | 第 4 条 user：只有调用摘要                   |
| 拆分，关闭服务端角色分割         |                    3 | 第 4 条 user：仍是展示批次                   |
| 拆分，带独立推理                 |                    2 | 第 3 条 assistant：增加 reasoning_content    |
| 拆分，推理转可见 think           |                    2 | 第 3 条 assistant：正文增加 think 块         |
| 拆分，模型角色标签，循环分割关闭 |                    2 | 第 3 条：循环内 assistant，历史重放后 system |
| 拆分，模型角色标签，循环分割开启 |                    4 | 前面的模型角色段一致，工具结果处分叉         |
| 关闭 AIO 拆分，详细结果展示      |                    2 | 第 3 条 assistant：围栏前多一个展示换行      |

相关既有测试：3 个文件、27 个用例通过：

```powershell
bun run test:run src/tools/llm-chat/core/tool-calling/__tests__/vcp-stream-segmenter.test.ts src/tools/llm-chat/core/context-processors/__tests__/session-loader.test.ts src/tools/llm-chat/composables/chat/__tests__/useSingleNodeExecutor.vcp.test.ts
```

这些测试确认当前拆分与回传契约；跨进程循环输入等价性由本次固定输入复现揭示。本轮未新增永久测试。运行代码与 UI 均未改动，因此未运行类型检查、Vite 构建或真实窗口走查。

## 5. 调整方案比较

| 方案                                               | 收益                                           | 代价与判断                                                             |
| -------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| AIO 只改 tool 角色、去围栏或删时间戳               | 可消除个别格式差异                             | 原始结果缺失，无法完整修复                                             |
| AIO 将拆分节点重新拼成一条 assistant               | 接近普通客户端的发送形式                       | 仍会重放展示支路，并可能引入换行；收益有限                             |
| VCP 循环内改用展示文本                             | 可统一部分纯文本路径                           | 展示关闭时只剩摘要，可能损失完整结果与图片；不宜为缓存削减模型输入     |
| VCP 保存原始消息并返回受控回放引用                 | 服务端可直接恢复循环历史，客户端传输小         | 需要明确留存、授权、失效、迁移和缺失回退；适合工具数据留在服务端的场景 |
| VCP 提供可选的结构化权威回放数据，AIO 持久化并回传 | 保留拆分展示，同时恢复真实角色、正文和媒体结构 | 两端协议协作；建议作为实现方向                                         |

### 后续候选：服务端权威回放契约

1. **先定义 VCP 的回放契约。** 在实际循环消息确定后提供逐阶段回放数据，覆盖 assistant 与工具结果，携带服务端最终使用的角色、正文、推理回传规则和媒体结构。通过独立结构化字段或事件传递，文本展示流保持现状。该扩展须显式协商，尤其要区分“隐藏展示”与“允许把完整工具数据传给客户端”；敏感或大型媒体可使用受控回放引用。
2. **AIO 接入并持久化。** 消息节点继续负责展示，在元数据或关联存储中保存回放数据。历史组装优先采用有效的权威回放内容，缺少数据的旧消息沿用现状。用户编辑、压缩、删段或分支变动后，要同步失效对应回放数据，保证发送内容符合用户当前操作。
3. **服务端明确回放数据的处理阶段。** 已规范化历史应保持稳定，避免再次进行角色拆分或展示改写；仍执行必要的校验与安全规则。RAG 刷新、变量替换和会话级预处理仍可能影响更早的前缀，需要单独观测。
4. **只修 AIO 可作为有限止损。** 针对已确认的 VCP 能力，避免套用本地工具循环的中间推理回传策略；这只能消除特定 assistant 差异，工具结果仍需服务端配合。避免全局删除推理字段或清洗正文标签。

后续验证应对照实际发往模型的请求：VCP 首次上游调用和工具循环后续调用都需要可观察。当前 `chatCompletionHandler.js:1226` 的 `finalContextStore` 只在首次 fetch 前写入；循环 handler 中的后续 fetch 未更新该存储，单看这个快照会遗漏本文的关键比较对象。

权威回放能够消除本次定位到的结构性差异；缓存收益还受模型、路由、缓存期限、动态预设、RAG 和其它上下文处理影响，应以实际 usage 为准。


## 6. 最小方案实施记录（2026-11-03）

主人选定先在 AIO 发送时合回，并明确旧记录无需猜测性恢复。

- 新段通过 `metadata.vcpResponse.contextReplay` 保留被展示分段略过的围栏、分隔换行和边界空白，正文继续只保存一份。
- VCP 目标的历史加载按相邻段、同请求与直接父子关系合为 assistant；普通渠道和旧段沿用逐段回传。
- 合并投影汇总附件并保留 `_mergedSources` 来源，发送与上下文预览共用实现；独立推理回传仅在该新投影内收敛为正文。
- 相关测试覆盖新批次与旧式控制 chunk 在新版本中的精确文本回放、普通渠道投影、用户与请求边界、预览终点和附件。测试还核对原会话树保持原样。
- VCPToolBox 与 VCPChat 运行代码保持原样。实际缓存收益待新生成对话的上游 usage 确认。

实施验证：相关 4 个测试文件共 41 个用例通过；`bun run build:tsc` 与 `bun run build:vite` 通过。生产构建仍提示依赖中的 eval、较大 chunk 和 CSS 插件耗时，均为警告。本次改动集中在纯前端历史投影与流事件处理，未运行真实模型请求；缓存收益由后续新请求的 usage 观测。
