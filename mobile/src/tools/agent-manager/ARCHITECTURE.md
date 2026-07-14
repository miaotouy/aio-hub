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

预设编辑器通过 `mobile/src/utils/tokenCounting.ts` 批量调用 Rust `count_tokens_batch`，以 500ms 防抖更新启用消息的 `o200k` 估算。禁用消息、禁用消息组和过期异步结果不会进入总数；IPC 异常时只退回字符估算。

`agent-manager` 发起对话时只传递路由参数，不 import `llm-chat`，从而避免循环依赖。

## 当前边界

- **已支持**：基础 CRUD、搜索与分类筛选、模型绑定、会话绑定、预设注入，以及完整预设消息编辑器体系（多轮消息、消息组、注入策略、模型匹配、触摸排序、批量管理、Rust o200k Token 估算、AIO/SillyTavern 导入与预设导入导出）。
- **待移植**：头像与资产管理、完整参数编辑和用户档案。
