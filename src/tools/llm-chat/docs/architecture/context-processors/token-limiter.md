# Token 限制器 (`token-limiter`)

源码：[`token-limiter.ts`](../../../core/context-processors/token-limiter.ts)

## 基本信息

| 字段       | 值                                         |
| ---------- | ------------------------------------------ |
| 处理器 ID  | `primary:token-limiter`                    |
| 显示名称   | Token 限制器                               |
| 默认优先级 | `600`                                      |
| 默认启用   | 是                                         |
| 管道位置   | 注入、知识库、变量处理之后，消息格式化之前 |

## 职责

Token 限制器根据智能体上下文管理配置裁剪历史消息，保证最终上下文不超过预算。它优先保留非历史消息，也就是预设、注入、世界书、知识库等结构性内容，再把剩余预算分配给历史消息。

## 输入

- `context.messages`：已完成注入和变量替换的消息列表。
- `context.agentConfig.parameters.contextManagement`：
  - `enabled`
  - `maxContextTokens`
  - `retainedCharacters`
- `context.agentConfig.modelId`：Token 计算模型。
- `tokenCalculatorService.calculateMessageTokens()`：同时计算文本和附件占用。

## 输出

- 覆盖 `context.messages` 为裁剪后的消息列表。
- 在 `context.sharedData.tokenLimiterStats` 写入统计信息，供预览界面展示。
- 在 `context.logs` 中记录跳过、警告或裁剪结果。

## 裁剪策略

1. 计算每条消息的文本 Token，并把 `_attachments` 传入 Token 计算服务估算附件占用。
2. 按 `sourceType === "session_history"` 区分历史消息和预设/注入消息。
3. 先汇总非历史消息 Token，占用固定预算。
4. 如果非历史消息已经耗尽预算，则删除全部历史消息。
5. 否则从最新历史向旧历史倒序保留。
6. 遇到第一条放不下的历史消息时，如果 `retainedCharacters > 0`，尝试保留该消息开头并追加 `...(已截断)`。
7. 更早的历史消息全部丢弃。

## 统计字段

`tokenLimiterStats` 包含：

- `originalHistoryCount`
- `finalHistoryCount`
- `truncatedCount`
- `presetTokens`
- `historyTokens`
- `totalTokens`
- `savedTokens`
- `savedChars`
- `originalTotalChars`

## 维护注意事项

- Token 限制必须在变量替换和知识库替换后执行，否则预算会低估。
- 处理器保留原始消息顺序，而不是把预设和历史重新分组。
- 截断只对字符串内容做部分保留；多模态数组内容不能部分截断。
- `sourceType` 对裁剪策略很关键，新增处理器插入消息时应准确设置来源类型。

