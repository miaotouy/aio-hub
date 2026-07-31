# 移动端智能体管理器架构

> 状态：基础角色配置能力已落地并进入维护；非当前移动端主施工线，不以桌面 Agent 完全对齐为目标。

## 模块职责

`agent-manager` 负责智能体配置、模型绑定和本地持久化，不依赖聊天运行时。`llm-chat` 单向依赖本模块，通过会话的 `displayAgentId` 读取智能体配置。

## 数据与存储

```text
{appConfigDir}/agent-manager/
├── agents-index.json
└── agents/
    └── {agentId}/
        ├── agent.json
        ├── avatar-xxx.png   # 计划中的私有头像
        └── assets/          # 计划中的随包二进制资产
```

- `agents-index.json` 保存列表所需元数据；每个 `agent.json` 保存完整 `ChatAgent`。
- Store 当前全量加载详情，磁盘结构保留未来按需加载能力。
- 索引损坏时扫描智能体目录恢复有效条目；缺失或损坏的单项会从索引清理。
- 编辑器以完整对象为基础覆盖受支持字段，未知高级字段和未编辑的预设消息原样保留。

头像、背景、预设消息附件和 `assets[]` 属于 Agent 私有资源，使用 Agent 内稳定 Handle 与相对路径，随 Agent 一起复制、导入、导出和删除。它们不进入全局 `asset_manager.db`，也不受全局资产按月份回收、批量转写或清理策略影响。用户从全局资产添加资源时执行内容复制，复制后两侧不共享 ID 或生命周期。

该私有资产边界目前仍是计划态，具体实施见 [`mobile-agent-manager-plan.md`](../../../docs/plan/mobile-agent-manager-plan.md)；全局可回收资产契约见 [`mobile-asset-manager-design.md`](../../../docs/plan/mobile-asset-manager-design.md)。桌面端预设附件使用 Agent Handle 的既有语义见 [`preset-message-multimodal-attachments.md`](../../../../docs/design/preset-message-multimodal-attachments.md)。

## 依赖与数据流

```text
AgentList / AgentDetail
  -> agentStore
  -> useAgentStorage
  -> Tauri plugin-fs

AgentList --route query(agentId)--> ChatHome
  -> llmChatStore.createSession(name, agentId)
  -> instantiateAgentGreetings materializes greeting branches
  -> LlmChatView updates session displayAgentId when switching
  -> useChatExecutor reads agentStore and snapshots Agent metadata
  -> agent-preset-loader injects preset messages
  -> useLlmRequest uses the agent profile/model/parameters
```

预设编辑器通过 `mobile/src/utils/tokenCounting.ts` 批量调用 Rust `count_tokens_batch`，以 500ms 防抖更新启用消息的 `o200k` 估算。禁用消息、禁用消息组和过期异步结果不会进入总数；IPC 异常时只退回字符估算。

`agent-manager` 发起对话时只传递路由参数，不 import `llm-chat`，从而避免循环依赖。

## 当前边界

- **已支持**：基础 CRUD、搜索与分类筛选、模型绑定、会话绑定、聊天内 Agent 切换、开局消息实例化、预设注入，以及完整预设消息编辑器体系（多轮消息、消息组、注入策略、模型匹配、触摸排序、批量管理、Rust o200k Token 估算、AIO/SillyTavern 导入与预设导入导出）。Agent 详情页还可编辑当前移动端请求层实际传递的 `temperature`、`maxTokens`、`topP`、频率/存在惩罚、停止序列，以及 Token limiter 的上下文预算和截断保留字符；留空时不覆盖渠道或模型默认值。切换只更新会话 `displayAgentId`；既有消息不被改写，后续助手消息会固化 Agent 身份和模型/渠道快照。绑定 Agent 的新会话会将有效开局消息固化为根节点下的兄弟分支并优先使用 `defaultGreetingId`；旧字符串开局消息兼容读取，宏展开与私有附件仍等待对应能力。分类采用与桌面端一致的 `AgentCategory` 枚举；历史 `custom` 在加载时归一化为 `other`，未知未来值仍保留在完整 Agent 对象中。
- **后续可选增强**：Agent 私有头像与资产管理，以及工具调用、Knowledge/Recall、媒体/压缩等桌面高级参数均不属于当前 Chat 完整性或移动端 MVP 的前置条件。移动端如需这些能力，应按自身产品和平台约束独立设计，不默认复制桌面实现。用户档案已由 `llm-chat` 的基础档案管理页和上下文注入支持；私有资产如后续实施，仍不得以全局 `assetId` 代替 Handle 或相对路径。
