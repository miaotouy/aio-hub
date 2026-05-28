# Context Processors 维护索引

本目录记录 `src/tools/llm-chat/core/context-processors` 下每个上下文处理器的职责、输入输出、执行位置和维护注意事项。

上下文管道以 `PipelineContext` 为唯一载体，处理器按 `priority` 从小到大串行执行，主要通过直接修改 `context.messages` 完成上下文构建；少量跨步骤信息通过 `context.sharedData` 传递。整体设计见上一层的 [context-pipeline.md](../context-pipeline.md)。

## 默认处理器顺序

| 优先级 | 处理器 ID                     | 文档                                                           |
| ------ | ----------------------------- | -------------------------------------------------------------- |
| 100    | `primary:session-loader`      | [session-loader.md](./session-loader.md)                       |
| 110    | `async-task-processor`        | [async-task-processor.md](./async-task-processor.md)           |
| 200    | `primary:regex-processor`     | [regex-processor.md](./regex-processor.md)                     |
| 250    | `transcription-processor`     | [transcription-processor.md](./transcription-processor.md)     |
| 300    | `primary:worldbook-processor` | [worldbook-processor.md](./worldbook-processor.md)             |
| 400    | `primary:injection-assembler` | [injection-assembler.md](./injection-assembler.md)             |
| 450    | `primary:knowledge-processor` | [knowledge-processor.md](./knowledge-processor.md)             |
| 500    | `primary:variable-processor`  | [variable-processor.md](./variable-processor.md)               |
| 600    | `primary:token-limiter`       | [token-limiter.md](./token-limiter.md)                         |
| 800    | `message-formatter`           | [message-format-processors.md](./message-format-processors.md) |
| 10000  | `asset-resolver`              | [asset-resolver.md](./asset-resolver.md)                       |

## 维护约定

- 新增处理器时同步更新本索引、`context-pipeline.md` 和 `contextPipelineStore.ts` 的默认注册列表。
- 处理器应只负责单一阶段的上下文改写；跨处理器临时数据优先放入 `sharedData`，不要写入全局可变状态。
- 会改变消息数量或顺序的处理器，应明确维护 `sourceType`、`sourceId`、`_attachments` 等追踪字段，便于预览、Token 统计和资产解析。
- 处理二进制附件时应保持延迟解析原则：在 `asset-resolver` 前尽量保留 `_attachments` 引用，避免 Base64 提前进入文本处理链路。

