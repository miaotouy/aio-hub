# 消息数据编辑器 (高级)

消息数据编辑器是一个面向高级用户的调试工具，允许你直接查看并修改消息在数据库中的原始 JSON 结构。

## 1. 进入编辑器

1. 将鼠标悬停在消息上。
2. 点击更多菜单 (`···`)。
3. 选择 **🗄️ 数据编辑 (高级)**。

## 2. 核心编辑区域

编辑器提供了一个全功能的代码编辑器（基于 CodeMirror 或 Monaco），加载了该消息的原始数据：

- **Role (角色)**: `system`, `user`, `assistant`, `tool` 等。
- **Content (内容)**: 消息的文本原文。
- **Metadata (元数据)**:
  - `tokens`: 预估的 Token 数。
  - `model`: 生成该消息的模型 ID。
  - `sessionVariableSnapshot`: 该时刻的[会话变量](../macro-system/session-variables)快照。
  - `toolCalls`: 如果是工具调用消息，包含具体的函数名和参数。
  - `attachments`: 关联的附件列表。

## 3. 使用场景

### 3.1 修复损坏的数据

如果你在导入第三方角色卡或会话时发现某些消息渲染异常，可以通过数据编辑器手动修正元数据或角色定义。

### 3.2 模拟特定的上下文状态

通过手动修改 `sessionVariableSnapshot`，你可以强制改变会话变量的值，从而测试 Agent 在不同变量状态下的反应，而无需重新进行多轮对话。

### 3.3 深度调试工具调用

你可以直接查看 `toolCalls` 的原始参数和 `tool` 角色的原始返回结果，这对于排查工具调用逻辑错误非常有用。

## 4. 注意事项

> [!WARNING] **数据风险**
> 直接编辑原始数据具有一定风险。不合法的 JSON 格式或错误的字段定义可能导致消息无法渲染或应用崩溃。在保存修改前，请务必确认数据的完整性。

---

### 相关阅读

- [会话变量系统](../macro-system/session-variables)
- [工具调用调试](../tool-calling/execution-debug)
- [上下文分析器](../context-pipeline/analyzer)
