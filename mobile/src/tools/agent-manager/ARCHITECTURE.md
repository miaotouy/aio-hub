# 移动端智能体管理器架构

## 模块职责

`agent-manager` 负责智能体配置、模型绑定和本地持久化，不依赖聊天运行时。`llm-chat` 单向依赖本模块，通过会话的 `displayAgentId` 读取智能体配置。

## 数据与存储

```text
{appConfigDir}/agent-manager/
├── agents-index.json
└── agents/
    └── {agentId}/
        └── agent.json
```

- `agents-index.json` 保存列表所需元数据；每个 `agent.json` 保存完整 `ChatAgent`。
- Store 当前全量加载详情，磁盘结构保留未来按需加载能力。
- 索引损坏时扫描智能体目录恢复有效条目；缺失或损坏的单项会从索引清理。
- 编辑器以完整对象为基础覆盖受支持字段，未知高级字段和未编辑的预设消息原样保留。

## 依赖与数据流

```text
AgentList / AgentDetail
  -> agentStore
  -> useAgentStorage
  -> Tauri plugin-fs

AgentList --route query(agentId)--> ChatHome
  -> llmChatStore.createSession(name, agentId)
  -> useChatExecutor reads agentStore
  -> agent-preset-loader injects preset messages
  -> useLlmRequest uses the agent profile/model/parameters
```

`agent-manager` 发起对话时只传递路由参数，不 import `llm-chat`，从而避免循环依赖。

## 当前边界

- **已支持**：基础 CRUD、搜索、模型绑定、会话绑定和预设注入。
- **重构中（阶段 2）**：完整预设消息编辑器体系（多轮消息、消息组、注入策略、模型匹配、批量管理、Token 估算、AIO/SillyTavern 导入导出）。
- **待移植**：头像与资产管理、完整参数编辑和用户档案。

