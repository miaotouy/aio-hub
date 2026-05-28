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
5. 先把深度注入插入历史消息。
6. 再围绕 `chat_history` 和其他锚点组装骨架、锚点前后注入和历史。

## 深度注入语法

高级深度配置 `depthConfig` 支持：

- 单点：`5`
- 多点：`3, 10, 15`
- 循环：`10~5` 或 `10:5`
- 混合：`3, 10~5`

旧格式 `depth` 仍被兼容。

## 维护注意事项

- 注入策略优先级为 `depth > anchorTarget > default`，即同时带多个旧字段时会优先进入深度注入。
- 锚点消息本身可能只是占位符；只有 `anchorDefinitions` 标记为模板锚点且内容不是旧固定占位文本时，才渲染骨架消息自身内容。
- `sourceIndex` 基于完整预设列表计算，不能只用活动列表，否则预览和定位会错位。
- 宏处理只针对活动预设消息执行，但分类要使用完整预设列表，才能保留禁用消息对锚点位置的影响。

