# 处理器详解与执行顺序

上下文管道由一系列有序的处理器组成。了解它们的默认执行顺序有助于你更好地调试和优化 Prompt。

## 默认处理器序列

| 顺序 | 处理器名称                  | 核心职责                                                            |
| :--- | :-------------------------- | :------------------------------------------------------------------ |
| 1    | **Session Loader**          | 从树状会话中提取当前活跃路径的线性消息列表。                        |
| 2    | **Regex Processor**         | 执行全局、Agent 及用户层的[正则替换规则](./regex-pipeline)。        |
| 3    | **Injection Assembler**     | 处理 Agent 预设消息的注入，包括深度注入和锚点定位。                 |
| 4    | **Knowledge Processor**     | 执行 RAG 检索，将[知识库](./knowledge-processor)条目注入上下文。    |
| 5    | **Transcription Processor** | 处理附件的转写结果及纯文本文件的内容提取。                          |
| 6    | **Worldbook Processor**     | 扫描关键词并注入关联的[世界书](../worldbook/index)条目。            |
| 7    | **Token Limiter**           | 核心预算管理，按优先级裁剪超长上下文。                              |
| 8    | **Async Task Processor**    | 汇总并注入关联的异步任务执行状态。                                  |
| 9    | **Variable Processor**      | 处理[会话变量](../macro-system/session-variables)的动态展开与快照。 |
| 10   | **Macro Processor**         | 展开 `{{宏}}`，执行三阶段宏处理管道。                               |
| 11   | **Message Formatter**       | 调整消息结构以符合 OpenAI/Claude/Gemini 等厂商的 API 要求。         |
| 12   | **Asset Resolver**          | 将资产占位符转换为最终的 Base64 或安全资源 URL。                    |

## 关键处理逻辑说明

### 1. 注入与顺序

- **Session Loader** 总是最先运行，因为它提供了后续处理器所需的基础消息流。
- **Regex Processor** 运行较早，确保后续处理器（如 Worldbook）扫描的是经过清洗后的文本。
- **Macro Processor** 运行较晚，因为它可能需要引用由之前处理器（如 Knowledge）注入的内容。

### 2. 异步任务注入

**Async Task Processor** 会检查当前会话关联的后台任务（如文件下载、FFmpeg 处理）。如果任务正在运行或已完成，它会将任务状态注入上下文，使 LLM 能够感知任务进度。

### 3. 厂商适配 (Formatter)

不同的 LLM 厂商对消息格式有不同要求（例如：某些厂商不支持连续的两条 `user` 消息）。**Message Formatter** 会自动合并、拆分或调整角色类型，以确保请求不会被 API 拒绝。

## 调整管道配置

在 **聊天设置 -> 上下文管道** 中：

- **启用/禁用**: 某些任务不需要 RAG 或世界书时，关闭对应处理器可显著提升响应速度。
- **拖拽排序**: 高级用户可以调整处理器的物理顺序。例如，如果你希望正则规则也应用到世界书注入的内容上，可以将 Regex Processor 移动到 Worldbook Processor 之后。

---

### 相关阅读

- [上下文分析器](./analyzer)
- [正则管道系统](./regex-pipeline)
- [Token 预算管理](./token-management)
