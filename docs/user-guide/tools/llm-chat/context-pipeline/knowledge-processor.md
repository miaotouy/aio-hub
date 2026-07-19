<div v-pre>

# Knowledge 在当前管道中的位置

Knowledge 没有独立的上下文管道处理器，也不会因为 Agent 获得资料库权限而自动执行 RAG。它是一个按需调用的工具领域：Agent 主动调用 `knowledge.listLibraries`、`knowledge.search`、`knowledge.read`，或用户在聊天输入区显式引用资料库时，系统才执行检索。

## 1. 工作原理

1. **授权**：从当前 Agent 快照读取 `knowledgeAccess`，校验资料库 ID 和能力权限。
2. **检索**：通过 Knowledge application service 调用 `listLibraries`、`search` 或 `read`，不复制另一套权限逻辑。
3. **证据回传**：工具事件保留资料库、文档、chunk、来源路径、实际策略和失败原因。
4. **回答编排**：快速查询或研究任务的结构化结果交回当前 Agent，由当前 Agent 决定如何回答。

## 2. Agent 级权限

在 Agent 编辑器的 **「Recall 与 Knowledge -> Knowledge 资料访问权限」** 面板中编辑 `knowledgeAccess`：是否启用、允许的资料库、是否允许省略资料库范围、是否允许继续读取文档，以及是否允许研究任务。检索策略、预算和过滤条件属于单次工具调用参数，不会写入 Agent 的资料库授权。

## 3. 调试与分析

如果你觉得 AI “胡言乱语”或没有引用知识库内容：

1. 查看聊天中的 Knowledge 工具节点和引用列表。
2. 检查工具结果中的资料库 ID、文档、chunk、来源路径和实际检索策略。
3. 研究任务还会显示轮次、证据预算、空缺、冲突和终止原因。

---

### 相关阅读

- [知识库管理工具指南](../../knowledge-base)
- [Agent 参数配置](../agents/parameters)
- [Knowledge Agent 集成](../../knowledge-base/agent-integration)

</div>
