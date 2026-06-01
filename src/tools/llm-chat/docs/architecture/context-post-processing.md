# 上下文后处理管道 (Context Post-Processing Pipeline)

上下文后处理管道是 `llm-chat` 在消息送达 LLM 之前的**最后一道格式适配层**，负责把统一上下文管道前段输出的线性消息列表整理成各家 Provider 都能接受的形态。

它的存在源于一个现实问题：不同模型对 `role` 序列、`system` 角色的处理存在差异——Anthropic Claude 不接受 `system` 角色出现在消息流中、部分模型要求严格的 `user/assistant` 交替、还有些只能消费一条头部 `system`——直接把内部多 `system`、可能存在连续同角色的消息列表丢出去会导致 API 报错或行为退化。后处理管道用一组可独立开关的小规则解决这个问题，确保前置处理（预设注入、世界书、变量、压缩等）的设计自由度不被下游 Provider 的形态限制所约束。

## 1. 定位与执行时机 (Positioning)

- 后处理管道由统一的 [`messageFormatter`](../../core/context-processors/message-format-processors.ts:263) 单一处理器承载，挂在标准管道 **priority 800** 的槽位上，定义见 [`message-format-processors.ts:263-410`](../../core/context-processors/message-format-processors.ts:263)。
- 此时上下文压缩（priority 600）、上下文窗口截断（priority 700）等已经完成，消息内容已经定型，后处理只负责"结构"层面的整形，不再修改消息文本本身（除合并时引入分隔符或插入占位符外）。
- 与 [`registerCoreProcessors`](../../core/context-pipeline.ts:1) 默认注册的 `message-formatter` 是同一处理器，UI（如 Agent 设置 / Inspector）展示的 4 条子规则只是它内部按固定顺序调度的「子任务」，对外仍然只占用一个 ContextProcessor 槽位。

## 2. 四条内置子规则 (Built-in Sub-Rules)

| 子规则 ID                                                                                         | priority | 默认启用 | 行为                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`post:merge-system-to-head`](../../core/context-processors/message-format-processors.ts:172)     | 810      | ✅       | 将分散在消息流中的所有 `system` 消息合并为一条，并固定放到列表最前面；多条之间使用 `separator`（默认 `\n\n---\n\n`）连接，合并出的消息标记为 `sourceType: "merged"` 并保留 `_mergedSources`、`_attachments` 以便追溯。仅在 system 条数 > 1 时实际触发，见 [`handleMergeSystemToHead`](../../core/context-processors/message-format-processors.ts:44)。 |
| [`post:merge-consecutive-roles`](../../core/context-processors/message-format-processors.ts:191)  | 820      | ✅       | 合并连续同角色的消息（如两条相邻的 `user` 或 `assistant`），同样使用 `separator` 连接并写入 `_mergedSources`，解决 Claude 等模型拒绝连续同角色输入的问题，见 [`handleMergeConsecutiveRoles`](../../core/context-processors/message-format-processors.ts:83)。                                                                                          |
| [`post:convert-system-to-user`](../../core/context-processors/message-format-processors.ts:210)   | 830      | ❌       | 将所有 `system` 消息整体改写为 `user` 角色，适用于完全不支持 `system` 角色的 Provider；只改 `role`，不动 `content`，见 [`handleConvertSystemToUser`](../../core/context-processors/message-format-processors.ts:159)。                                                                                                                                 |
| [`post:ensure-alternating-roles`](../../core/context-processors/message-format-processors.ts:221) | 840      | ❌       | 强制 `user/assistant` 严格交替：遇到相邻同角色对时在中间插入对侧占位消息（默认 `user` 占位 `"继续"`、`assistant` 占位 `"好的"`，可通过 `userPlaceholder` / `assistantPlaceholder` 覆盖），见 [`handleEnsureAlternatingRoles`](../../core/context-processors/message-format-processors.ts:135)。                                                        |

这里的 `priority` 数字仅作为「UI 展示顺序 + 元数据排序」，实际运行时由 [`messageFormatter.execute`](../../core/context-processors/message-format-processors.ts:269) 按 **「合并 system → 合并连续角色 → system→user → 强制交替」** 的固定顺序串联（见 [`message-format-processors.ts:355-388`](../../core/context-processors/message-format-processors.ts:355)），不依赖优先级数值动态排序。

## 3. 配置入口与数据结构 (Configuration)

用户/Agent 配置入口为 [`LlmParameters.contextPostProcessing.rules`](../../types/llm.ts:211)，结构为 `ContextPostProcessRule[]`：

```ts
interface ContextPostProcessRule {
  type: string; // 子规则 ID，如 "post:merge-system-to-head"
  enabled: boolean; // 是否启用
  [key: string]: any; // 子规则自定义字段：separator / userPlaceholder / assistantPlaceholder
}
```

- 每条子规则的可选字段由 [`AvailableFormatters`](../../core/context-processors/message-format-processors.ts:252) 中各处理器的 `configFields` 声明，例如 `merge-*` 系列支持 `separator`，`ensure-alternating-roles` 支持两个占位符；缺省时回落到 [`DEFAULT_SEPARATOR`](../../core/context-processors/message-format-processors.ts:19) 等常量。
- 模型侧可通过 [`LlmModelInfo.defaultPostProcessingRules`](../../types/llm.ts:1) 给出兼容默认值，并支持两种历史格式：纯 ID 数组（旧）会在运行时被自动升级为 `{ type, enabled: true }`，新格式则是完整的 `ContextPostProcessRule[]`，兼容逻辑见 [`message-format-processors.ts:310-328`](../../core/context-processors/message-format-processors.ts:310)。

## 4. 启用优先级合并 (Rule Merge Priority)

- 合并实现集中在 [`messageFormatter.execute` 的 mergedRulesMap 构建段](../../core/context-processors/message-format-processors.ts:330)：先以 `AvailableFormatters` 的 `defaultEnabled` 写入基线，再依次让模型 `defaultPostProcessingRules` 覆盖、最后让 Agent `parameters.contextPostProcessing.rules` 覆盖。
- 由此得出确定的优先级链：**Agent `contextPostProcessing.rules` > 模型 `defaultPostProcessingRules` > 处理器自身 `defaultEnabled`**。同一 `type` 后写入者整条记录覆盖前者（包括 `enabled` 与 `separator` / 占位符等额外字段），因此调一条规则的占位符不会与启用状态分裂存储。
- 是否实际执行某条子规则只看最终 map 中该 `type` 的 `enabled === true`（见 [`isEnabled`](../../core/context-processors/message-format-processors.ts:351)），与是否传入额外字段无关。

## 5. 与统一管道的对应关系 (Pipeline Integration)

- 在统一上下文管道中，本节对应「priority 800：消息格式化」槽位，由 [`registerCoreProcessors`](../../core/context-pipeline.ts:1) 注册的同一个 `messageFormatter` 实例承担。
- 后处理管道运行在 token 限制器（priority 700）之后、最终交付给 LLM 适配层之前，因此**它不会再触发裁剪、压缩或注入**；如果想给 LLM 看到的最终结构再做一层观察，可通过 Inspector / Context Analyzer 抓取该处理器执行后的 `context.messages` 快照。
- 在预览（`isPreviewMode`）场景中，`messageFormatter` 还会额外计算后处理前后的 Token / 字符差值并写入 `sharedData` 的 `postProcessingTokenDelta` / `postProcessingCharDelta`，供分析视图展示合并/占位插入带来的成本变化（见 [`message-format-processors.ts:390-407`](../../core/context-processors/message-format-processors.ts:390)）。
