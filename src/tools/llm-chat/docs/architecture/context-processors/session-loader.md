# 会话加载器 (`session-loader`)

源码：[`session-loader.ts`](../../../core/context-processors/session-loader.ts)

## 基本信息

| 字段       | 值                                                         |
| ---------- | ---------------------------------------------------------- |
| 处理器 ID  | `primary:session-loader`                                   |
| 显示名称   | 会话加载器                                                 |
| 默认优先级 | `100`                                                      |
| 默认启用   | 是                                                         |
| 管道位置   | 第一阶段，负责把会话树转换为后续处理器可消费的线性消息列表 |

## 职责

会话加载器是上下文管道的入口。它从 `context.detail` 的树状会话结构中抽取当前活动分支，过滤被上下文压缩节点隐藏的历史节点，然后生成 `ProcessableMessage[]` 写回 `context.messages`。

它还负责三类早期规范化：

- 将较旧的 HTML 消息按设置转换为 Markdown，以降低上下文占用。
- 根据智能体工具调用设置，把 `tool` 角色转换为 `user` 角色。
- 追加待发送消息预览 `pendingInput`，让预览模式能看到尚未正式入库的用户输入。

## 输入

- `context.detail`：当前会话详情，包含 `nodes`、`activeLeafId` 和压缩节点元数据。
- `context.settings.contextOptimization`：控制 HTML 到 Markdown 的转换开关与最近保留条数。
- `context.agentConfig.toolCallConfig.convertToolRoleToUser`：控制 tool 角色是否降级为 user。
- `context.agentConfig.llmThinkRules`：用于保护思考块标签，避免 Turndown 转换破坏 `<think>` 等内容。
- `context.sharedData.pendingInput`：预览模式下的待发送文本与附件。

## 输出

- 覆盖 `context.messages`。
- 每条消息会尽量保留：
  - `role`
  - `content`
  - `reasoningContent`
  - `sourceType: "session_history"`
  - `sourceId: node.id`
  - `_attachments`
  - `metadata`
- 在 `context.logs` 中记录加载结果或缺失 `detail` 的告警。

## 关键流程

1. 从活动叶子节点向根节点回溯，先收集启用的压缩节点所覆盖的 `compressedNodeIds`。
2. 再次回溯活动分支，跳过根节点和被压缩隐藏的节点，得到线性历史。
3. 遍历历史消息，跳过无正文且无附件的空节点。
4. 对旧消息执行可选的 HTML 到 Markdown 转换，并保护思考块标签。
5. 处理 tool 角色转换和 assistant 推理内容裁剪。
6. 将待发送输入追加为虚拟 `session_history` 消息。

## 维护注意事项

- 这是唯一应该从会话树批量重建 `context.messages` 的内置处理器。后续处理器默认基于它产出的线性数组进行增删改。
- HTML 转 Markdown 只处理较旧消息，最近消息保留原格式，避免破坏用户正在查看的富文本结构。
- 思考块保护依赖标签名列表；新增思考格式时，优先通过 `llmThinkRules` 配置，不要硬编码到转换逻辑。
- `_attachments` 必须保留到后续处理器，文本附件由 `transcription-processor` 消费，二进制附件由 `asset-resolver` 最终解析。

