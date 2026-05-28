# 知识库处理器 (`knowledge-processor`)

源码：[`knowledge-processor.ts`](../../../core/context-processors/knowledge-processor.ts)

## 基本信息

| 字段       | 值                                      |
| ---------- | --------------------------------------- |
| 处理器 ID  | `primary:knowledge-processor`           |
| 显示名称   | 知识库处理器                            |
| 默认优先级 | `450`                                   |
| 默认启用   | 是                                      |
| 管道位置   | 注入组装之后，变量处理和 Token 限制之前 |

## 职责

知识库处理器执行 RAG 检索并替换 `【kb】` 或 `【knowledge】` 占位符。它只扫描非历史消息中的占位符，避免历史对话被动触发检索；如果智能体开启知识库保底注入且未写占位符，则自动生成占位符并插入合适位置。

## 输入

- `context.messages`：注入组装后的消息列表。
- `context.agentConfig.knowledgeBaseConfig`：绑定的知识库、自动注入开关和位置。
- `context.agentConfig.knowledgeSettings`：默认召回数量、分数阈值、上下文窗口、模板、缓存等设置。
- `useChatSettings().settings.knowledgeBase`：全局知识库检索设置。
- `useKnowledgeBaseStore()`：知识库元信息、默认 Embedding 模型和标签池。
- `searchKnowledge()`、Tauri `invoke()`：实际检索与静态加载入口。

## 输出

- 将占位符替换为格式化后的知识库内容。
- 未激活的占位符会被移除。
- 自动注入时可能向 `context.messages` 插入一条承载 RAG 信息的 `user` 消息，或追加到已有 system 消息末尾。
- 在 `context.logs` 中记录每个占位符的替换结果。

## 占位符语法

匹配格式：

```text
【kb】
【knowledge】
【kb::kbName::limit::minScore::mode::modeParams::engineId】
```

参数说明：

| 参数         | 说明                                   |
| ------------ | -------------------------------------- |
| `kbName`     | 知识库名称，省略时检索所有已绑定知识库 |
| `limit`      | 召回上限                               |
| `minScore`   | 最低相关度阈值                         |
| `mode`       | `always`、`gate`、`turn`、`static`     |
| `modeParams` | 模式参数，使用逗号分隔                 |
| `engineId`   | 检索引擎，覆盖默认设置                 |

## 激活模式

- `always`：每次都检索。
- `gate`：最近 N 条消息包含任意关键词才检索。
- `turn`：用户轮次数满足间隔时检索。
- `static`：静态加载指定条目或 `all`。

## 检索策略

- 从最近若干轮中分别提取 user 文本和 assistant/tool 文本。
- 对 user 文本执行查询预处理和标签匹配。
- vector 或 hybrid 引擎会分别嵌入 user/AI 文本，并按 `0.7 / 0.3` 加权平均。
- 可选会话级缓存，先按精确文本组合命中，再避免重复向量化和检索。

## 维护注意事项

- `scanPlaceholders()` 会跳过 `sourceType === "session_history"` 的消息，这是有意设计。
- 自动注入优先追加到 system 消息；没有合适 system 时插入独立 user 消息，并用 `【RAG信息】` 围栏区分。
- `static::all` 通过后端加载知识库元数据和条目，失败时只记录警告并返回空结果。
- 结果格式化模板来自智能体设置，空结果使用 `emptyText` 或默认提示。

