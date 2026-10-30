# 注入组装器 (`injection-assembler`)

源码：[`injection-assembler.ts`](../../../core/context-processors/injection-assembler.ts)

## 基本信息

| 字段       | 值                               |
| ---------- | -------------------------------- |
| 处理器 ID  | `primary:injection-assembler`    |
| 显示名称   | 注入组装器                       |
| 默认优先级 | `400`                            |
| 默认启用   | 是                               |
| 管道位置   | 世界书之后，知识库和变量处理之前 |

## 职责

注入组装器把智能体预设消息、历史消息、深度注入、锚点注入和宏处理结果组装成最终的高层消息骨架。

它是上下文结构成形的核心阶段：前面的处理器主要修改历史消息或追加局部注入，到了这里会根据预设锚点重新排布上下文整体顺序。

## 输入

- `context.messages`：已加载并经过前置处理的历史消息。
- `context.agentConfig.presetMessages`：智能体预设消息。
- `context.agentConfig.modelId`、`context.sharedData.model`、`context.sharedData.profile`：用于模型/渠道匹配规则。
- `context.sharedData.anchorDefinitions`：锚点注册表，决定模板锚点是否需要渲染自身内容。
- `context.userProfile`、`context.timestamp` 等宏上下文数据。

## 输出

- 覆盖 `context.messages` 为组装后的最终消息顺序。
- 为预设和注入消息补充：
  - `sourceType`
  - `sourceId`
  - `sourceIndex`
  - `_originalContent`
  - `_timestamp`
  - `_userName`
  - `_userDisplayName`
  - `_userIcon`
  - `_name`
- 在 `context.logs` 中记录组装后的消息数。

## 关键流程

1. 根据消息自身启用状态和模型/渠道匹配规则，得到活动预设消息。
2. 如果工具调用开启且缺少 `{{tools}}`、`{{tool_usage}}`、`{{tool_context}}` 宏，可自动追加保底工具宏消息。
3. 对活动预设消息执行宏处理，结果放入 `processedContents`。
4. 按注入策略将预设消息分类为：
   - 骨架消息 `skeleton`
   - 深度注入 `depthInjections`
   - 锚点注入 `anchorInjections`
5. 通过共享预设核心 `assembleHistoryInjections()`，在同一份原始历史上计算深度与动态消息锚点边界，统一排序后插入。
6. 再围绕 `chat_history` 和其他占位锚点组装骨架、锚点前后注入和历史。

## 深度注入语法

高级深度配置 `depthConfig` 支持：

- 单点：`5`
- 多点：`3, 10, 15`
- 循环：`10~5` 或 `10:5`
- 混合：`3, 10~5`

旧格式 `depth` 仍被兼容。

## 维护注意事项

- 显式 `type` 决定策略；旧数据按 `depth/depthConfig > anchorTarget > default` 推断。
- 锚点消息本身可能只是占位符；只有 `anchorDefinitions` 标记为模板锚点且内容不是旧固定占位文本时，才渲染骨架消息自身内容。
- `sourceIndex` 基于完整预设列表计算，不能只用活动列表，否则预览和定位会错位。
- 宏处理只针对活动预设消息执行，但分类要使用完整预设列表，才能保留禁用消息对锚点位置的影响。


## 动态消息锚点与边界

桌面与移动共用 `packages/agent-preset-core/src/injection-anchors.ts`：

| 目标 | 匹配 |
| --- | --- |
| `last_user` | 最后一条原始 User 历史消息 |
| `last_assistant` | 最后一条原始 Assistant 历史消息 |
| `last_message` | 最后一条有效历史消息，包含 Tool |

- 仅 `sourceType: session_history` 参与目标查找；待发送预览输入以该来源加入，因此与发送后的节点使用同一规则。
- `session-loader` 保留 `_historyRole`。转为 User 展示的工具结果仍按 Tool 定位，其他注入同角色消息保持独立。
- 所有深度点基于插入前的历史长度计算。多个深度钳制到头部时也共享同一边界；动态与深度注入统一按 `order` 升序、预设原顺序排列。
- Assistant 及后续连续 Tool 构成完整区段。落在区段内的 before 动态注入前移到调用前；after 动态注入和深度注入后移到结果后。无结果或并行结果尚未齐全的调用，尾部注入跳过；结果身份通过 `toolCall` / `toolCalls` 与 `toolCallsRequested` 对应。
- 缺失目标跳过；`context.logs` 提供带预设名称的说明，`sharedData.historyInjectionDiagnostics` 保留 `sourceId`、`target`、`reason` 与调整前后边界。原因包括 `target_missing`、`tool_chain_relocated`、`tool_results_pending`。
- `AnchorDefinition.kind` 区分 `placeholder` 与 `dynamic_message`；省略时沿用占位卡语义。动态目标只出现在注入选择器，编辑器自动补卡仅覆盖占位锚点。

该处理器输出组装阶段的位置。后置 System 头部合并、连续角色合并及 Provider 顶层指令抽取仍按现有配置执行，最终物理位置以发送前预览及协议投影为准。
