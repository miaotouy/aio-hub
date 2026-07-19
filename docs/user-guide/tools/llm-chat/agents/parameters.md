# 角色设定与参数配置 (Personality & Parameters)

这是 Agent 的“灵魂”所在，通过配置模型、预设消息、关联资源和 Knowledge 访问权限，定义 Agent 的行为逻辑和资料边界。

## 1. 核心设定

- **模型配置**: 为该 Agent 指定默认的服务渠道（Profile）和模型 ID。你可以为不同 Agent 分配擅长不同领域的模型。
- **关联用户档案**: 绑定特定的[用户档案](./user-profiles)，在发送请求时自动注入用户姓名、性格、背景等信息，实现个性化交互。
- **预设消息 (Presets)**:
  - **角色定义**: 支持 `system` (系统提示)、`user` (用户示例)、`assistant` (助手示例)。
  - **注入策略**:
    - **深度 (Depth)**: 控制消息插入到对话历史的深度。
    - **高级深度**: 支持多点或循环语法（如 `3, 10~5`），实现极其复杂的上下文排布。
    - **锚点 (Anchor)**: 将消息固定在上下文的特定位置（如最顶部或最底部）。
  - **开场白显示**: 设置前 N 条预设消息在聊天界面中作为“开场白”展示，方便快速进入状态。

## 2. 关联资源

Agent 可以通过关联其他子系统来增强能力：

- **快捷操作**: 关联[快捷操作组](../quick-actions/index)。激活该 Agent 后，对应的快捷按钮将直接出现在输入框上方。
- **世界书 (Worldbook)**: 关联[世界书](../worldbook/index)，实现关键词自动触发背景设定注入。
  - **禁用递归扫描**: 防止世界书条目互相触发导致的上下文爆炸。
  - **扫描深度**: 控制系统回溯多少条历史消息来匹配关键词。

## 3. Knowledge 资料访问权限

在 **「知识库 (Knowledge) -> Knowledge 资料访问权限」** 中配置 Agent 是否可以按需使用资料库：

- **启用 Knowledge**：关闭时不会暴露 Knowledge 工具，也不会展开资料库目录。
- **允许资料库**：只保存稳定的 library ID，资料库改名后授权不会失效。
- **允许全库搜索**：未指定库时是否可以搜索全部已授权库。
- **允许文档读取**：是否可以从命中继续读取 chunk 邻域或文档范围。
- **允许研究任务**：是否可以启动有轮次、证据和成本预算的多轮研究。

检索策略、Top-K、过滤器、证据字符预算等属于本次 `knowledge.search` / `knowledge.read` / `knowledge.research` 调用参数，不会改变 Agent 的长期授权。

## 4. 模型高级参数

在「模型参数编辑器」中，你可以精细调整模型的生成行为：

- **基础参数**: Temperature (随机性)、Top P、Max Tokens。
- **惩罚参数**: Frequency Penalty (频率惩罚)、Presence Penalty (存在惩罚)。
- **安全设置**: 配置模型的内容过滤级别（Hate, Harassment, Sexually Explicit 等）。
- **后处理 (Post-processing)**:
  - **停止词 (Stop Sequences)**: 遇到特定字符串时停止生成。
  - **逻辑偏置 (Logit Bias)**: 强制模型更多或更少地使用特定 Token。

---

### 相关阅读

- [上下文压缩配置](../context-pipeline/context-compression)
- [Agent 资产管理](./assets)
- [快捷操作模板语法](../quick-actions/template-syntax)
