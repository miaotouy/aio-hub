# 异步任务处理器 (`async-task-processor`)

源码：[`async-task-processor.ts`](../../../core/context-processors/async-task-processor.ts)

## 基本信息

| 字段       | 值                             |
| ---------- | ------------------------------ |
| 处理器 ID  | `async-task-processor`         |
| 显示名称   | 异步任务处理器                 |
| 默认优先级 | `110`                          |
| 默认启用   | 是                             |
| 核心标记   | `isCore: true`                 |
| 管道位置   | 会话加载之后，其他内容改写之前 |

## 职责

异步任务处理器为 Tool Calling 的异步任务节点补齐最新状态。它扫描 `tool` 角色消息，从内容中提取 `taskId`，再到 `asyncTaskStore` 查询任务的实时状态，并用状态摘要替换原 tool 消息内容。

这样模型下一轮看到的不是旧的占位文本，而是任务当前的完成、运行、失败、取消或中断状态。

## 输入

- `context.messages`：由 `session-loader` 产生的线性消息。
- `useAsyncTaskStore()`：异步任务状态源。
- `extractTaskId(content)`：从工具消息文本中识别任务 ID。

## 输出

- 直接改写匹配到的 `tool` 消息 `content`。
- 若任务已完成且包含 `resultAssetIds`，将资产 ID 累积到 `context.sharedData.asyncTaskAssetIds`。
- 在 `context.logs` 中记录检测数量和替换数量。

## 状态输出格式

- `completed`：优先输出 `任务已完成。结果：\n${result}`。
- `running`、`failed`、`cancelled`、`interrupted`、`pending` 和未知状态：输出结构化 JSON 字符串，包含 `type: "async_task"`、`taskId`、`status` 和状态说明。

## 维护注意事项

- 处理器只处理 `tool` 角色消息；如果上游已经把 tool 转为 user，则该处理器将无法识别任务节点。因此它必须在可能的角色格式化之前执行。
- 当前只把 `resultAssetIds` 放入 `sharedData`，没有在此处直接解析资产。真正的二进制解析仍应留给后续资产处理链路。
- 如果 `asyncTaskStore` 未初始化，处理器会静默跳过，避免构建上下文时强依赖工具调用模块启动完成。

