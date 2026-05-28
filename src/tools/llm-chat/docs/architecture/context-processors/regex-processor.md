# 正则处理器 (`regex-processor`)

源码：[`regex-processor.ts`](../../../core/context-processors/regex-processor.ts)

## 基本信息

| 字段       | 值                                                     |
| ---------- | ------------------------------------------------------ |
| 处理器 ID  | `primary:regex-processor`                              |
| 显示名称   | 正则处理器                                             |
| 默认优先级 | `200`                                                  |
| 默认启用   | 是                                                     |
| 管道位置   | 会话消息加载和异步任务状态更新之后，附件转写和注入之前 |

## 职责

正则处理器在请求阶段对消息正文应用聊天正则规则，用于上下文清洗、格式转换、角色语气增强或兼容外部角色卡格式。

它从全局设置、智能体配置和用户档案中收集 `applyTo.request` 为真的规则，按预设优先级和规则顺序排序，再按消息角色与消息深度过滤后逐条替换。

## 输入

- `context.messages`：当前线性消息列表。
- `useChatSettings().settings.regexConfig`：全局正则配置。
- `context.agentConfig.regexConfig`：智能体正则配置。
- `context.userProfile?.regexConfig`：用户档案正则配置。
- `parseRegexString()`：兼容 `/pattern/flags` 字符串与普通 pattern。

## 输出

- 就地修改每条消息的文本内容。
- 对多模态数组内容，只修改第一个 `type: "text"` 的部分。
- 在 `context.logs` 中记录替换次数或单条规则执行错误。

## 规则过滤顺序

1. 配置源过滤：只读取启用的 preset 和启用的 rule。
2. 阶段过滤：只保留 `rule.applyTo.request` 为真的规则。
3. 排序：先按 preset `priority`，再按 rule `order`。
4. 角色过滤：匹配 `rule.targetRoles`。
5. 深度过滤：`depth = totalMessages - 1 - index`，最新消息深度为 `0`。

## 维护注意事项

- 当前实现按“当前全局 + 当前 Agent + 当前用户档案”合并规则，没有按消息元数据做 Message-Bound 解析；如果恢复或引入 Message-Bound 策略，需要同步更新本处理器和相关文档。
- 单条规则异常不会中断管道，会记录到 `context.logs` 后继续处理其他规则。
- 处理多模态消息时只改写文本部分，不应提前展开或解析附件。

