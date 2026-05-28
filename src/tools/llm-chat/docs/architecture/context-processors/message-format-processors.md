# 消息格式化处理器 (`message-format-processors`)

源码：[`message-format-processors.ts`](../../../core/context-processors/message-format-processors.ts)

## 基本信息

| 字段       | 值                           |
| ---------- | ---------------------------- |
| 处理器 ID  | `message-formatter`          |
| 显示名称   | 消息格式化                   |
| 默认优先级 | `800`                        |
| 默认启用   | 是                           |
| 管道位置   | Token 限制之后，资产解析之前 |

## 职责

`message-formatter` 是统一后处理入口，负责按模型和智能体配置执行消息格式化规则，使最终消息序列满足目标模型的角色约束。

该文件还导出 `AvailableFormatters`，供 UI 和配置层展示四个可选子处理器。子处理器本身的 `execute` 是空函数，实际执行由 `message-formatter` 统一调度。

## 子处理器

| ID                              | 名称                   | 默认启用 | 作用                                             |
| ------------------------------- | ---------------------- | -------- | ------------------------------------------------ |
| `post:merge-system-to-head`     | 合并 System 消息到头部 | 是       | 将所有 system 消息合并为一条，并放到消息列表开头 |
| `post:merge-consecutive-roles`  | 合并连续相同角色       | 是       | 合并相邻且角色相同的消息                         |
| `post:convert-system-to-user`   | 转换 System 为 User    | 否       | 将 system 角色统一改为 user                      |
| `post:ensure-alternating-roles` | 确保角色交替           | 否       | 在连续 user 或 assistant 之间插入占位消息        |

## 输入

- `context.messages`：Token 限制后的消息列表。
- `context.agentConfig.parameters.contextPostProcessing.rules`：智能体后处理规则。
- `context.sharedData.model.defaultPostProcessingRules`：模型默认后处理规则。
- `context.sharedData.isPreviewMode`：预览模式下启用前后 Token/字符差异统计。

## 输出

- 覆盖 `context.messages` 为格式化后的消息列表。
- 合并消息会设置：
  - `sourceType: "merged"`
  - `_mergedSources`
  - `_attachments` 合并列表
- 预览模式下写入：
  - `context.sharedData.postProcessingTokenDelta`
  - `context.sharedData.postProcessingCharDelta`

## 配置合并顺序

1. 从 `AvailableFormatters` 的默认启用状态生成基础配置。
2. 模型默认规则覆盖基础配置。
3. 智能体规则覆盖模型配置。

执行顺序固定为：

1. 合并 system 到头部。
2. 合并连续相同角色。
3. 转换 system 为 user。
4. 确保 user/assistant 交替。

## 默认占位和分隔符

- `DEFAULT_SEPARATOR = "\n\n---\n\n"`
- `DEFAULT_USER_PLACEHOLDER = "继续"`
- `DEFAULT_ASSISTANT_PLACEHOLDER = "好的"`

## 维护注意事项

- 合并时只把多模态内容中的文本部分拼接成字符串，但会保留所有 `_attachments`，让 `asset-resolver` 后续仍能处理附件。
- 如果目标模型不支持 system，应开启 `post:convert-system-to-user`，通常在 system 合并之后执行。
- `ensureAlternatingRoles` 只处理 user 和 assistant 连续，不会主动处理 system；需要与前面的 system 转换规则搭配。
- 子处理器优先级 `810-840` 用于配置展示和概念排序，不参与实际管道执行。

