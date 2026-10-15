# VCP 上游响应分段

VCP 文本渠道的流式 Chat Completions 请求，可以在一次 HTTP 响应内执行多次模型生成和工具调用。聊天执行器将这些阶段实时写入同一分支的消息节点：

```text
用户 → assistant 回复／工具请求 → tool 结果或摘要 → assistant 后续回复
```

## 启用与事件链路

- 沿用 `resolveChannelToolHandling()` 的渠道识别结果，仅对上游消费 `vcp-text` 的流式聊天请求启用。
- `useSingleNodeExecutor` 注册 `onResponseChunk`，并请求 `stream_options.include_usage`。OpenAI Chat 适配器将该观察回调映射为 llm-core 的 `captureResponseChunks`；这个内部选项留在解码侧。
- llm-core 按需提供 `response-chunk` 事件，包含响应 ID、正文、独立推理、完成原因和用量。普通文本／推理事件与最终 `completed` 契约保持原样。
- 未提供这些事件的适配器沿用原有单节点处理，包括经过 Responses、Anthropic、Gemini 协议桥的请求。

## 分段规则

`core/tool-calling/vcp-stream-segmenter.ts` 消费已解码的完整 SSE 数据：

1. 上游 `finish_reason` 标记一次模型生成结束；紧随其后的 usage 归到该 assistant 段。
2. VCP 服务端生成的 `chatcmpl-vcp-*` 结果／摘要 chunk 进入 tool 段；角色围栏与 separator 控制阶段切换。上游未提供完成原因时，工具 chunk 也能建立阶段边界。
3. 工具区后的模型正文／独立推理创建新的 assistant 段。重复使用响应 ID 的上游也按阶段拆分。
4. `chatcmpl-VCP-final-*` 是请求的最终完成信息，最终 `[DONE]` 仍由通用 decoder 处理。
5. 模型正文中的标记示例保留在原段；角色围栏只根据服务端 chunk 来源识别。VCP 注入的 reasoning 闭合标签保留在前一个 assistant 段。

## 节点与请求生命周期

- 首段复用原 assistant 节点，后续段通过节点管理器追加为其后代，并更新活动叶子。
- 每段在 `metadata.vcpResponse` 中记录原请求 ID、段类型和可用的上游完成信息；每个 assistant 节点分别保存 usage。
- 仅保存各段正文，最终合并响应用于请求返回；会话树中的历史按各节点各回传一次。
- VCP tool 节点在上下文管道中转换为 user 文本，以匹配 VCP 的工具结果注入方式。
- 所有新增节点共用原请求的 AbortController。阶段切换刷新流缓冲；失败时保留已收到内容，错误归到活动段；请求结束后统一清理生成状态。
- 上游未给出有效 usage 时，沿用已有本地 token 估算。后续轮次估算纳入先前可见回复与工具结果；服务端隐藏的上下文处理可能导致估算与真实账单存在差异。

## 可见结果边界

关闭 VCP 详细结果展示时，tool 节点保存服务端发来的摘要；详细结果块出现时一并保存。现有协议的摘要与展示文本可能省略工具返回字段，节点内容以实际收到的数据为准。
