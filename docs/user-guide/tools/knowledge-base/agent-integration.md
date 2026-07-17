# Agent 集成

Knowledge 通过独立的 `knowledgeConfig`、`knowledgeSettings` 和稳定 `libraryId` binding 接入 Agent。资料库不保存 Agent、会话或消息外键；绑定只决定本次上下文可以访问哪些资料库。

## 宏

- `{{knowledge}}`：生成 Knowledge 检索占位符。
- `{{knowledge_list}}`：列出当前可用的 Knowledge 资料库。

历史 `{{kb}}`、`【kb】` 和不含命名参数的旧 `【knowledge】` 曾指向 CAIU 数据，属于迁移输入，不是新版 Knowledge 语法。

## 占位符

新版占位符使用命名参数：

```text
【knowledge::library=<library-id>::strategy=auto::limit=5::min-score=0::when=always::citation=required】
```

| 参数        | 说明                                                |
| ----------- | --------------------------------------------------- |
| `library`   | 稳定资料库 ID，可重复指定；省略时使用已启用 binding |
| `strategy`  | `auto`、`keyword`、`semantic` 或 `hybrid`           |
| `limit`     | 返回 chunk 数上限                                   |
| `min-score` | 当前 Knowledge 策略的最低分数                       |
| `when`      | 第一阶段只接受 `always`                             |
| `citation`  | `required`、`preferred` 或 `off`                    |

Knowledge 不接受 Recall 的 `profile`、`entries`、`gate-tags` 或 `every-turns`。不合法参数会产生明确错误，不会被静默忽略。

## 被动注入

上下文管道遇到合法 Knowledge 占位符后：

1. 解析并校验命名参数。
2. 根据 binding 解析稳定资料库 ID。
3. 使用当前对话构建查询。
4. 调用 Knowledge document/chunk 检索。
5. 按 citation 规则格式化来源与 chunk 信息。
6. 用检索结果替换占位符。

结果保留 library、source path、heading 和 chunk index，便于模型引用来源。

## 主动检索

启用工具调用后，Agent 可通过 retrieval registry 选择：

- `recall`：只查询思绪条目。
- `knowledge`：只查询文档资料。
- `mixed`：分别召回两域结果，保留分域配额后使用 RRF 融合。

mixed 不直接比较 Recall activation 与 Knowledge hybrid score。

## 使用建议

- 事实问答、手册、论文、代码文档优先使用 Knowledge。
- 项目经验、偏好、灵感和完整语义条目使用 Recall。
- 需要强来源约束时使用 `citation=required`。
- 专有名词查询可使用 `keyword`；自然语言问题通常使用 `auto`。
- semantic/hybrid 前应确认资料库有可用向量覆盖。
