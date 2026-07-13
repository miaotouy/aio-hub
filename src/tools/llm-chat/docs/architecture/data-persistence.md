# 数据持久化 (Data Persistence)

为了性能和数据安全，本模块采用**分离式存储策略**，将索引和数据文件分开存储。所有持久化文件统一存放在应用配置目录下的 `llm-chat/` 子目录中（即 `{appConfigDir}/llm-chat/`），由 [`useChatStorageSeparated()`](../../composables/storage/useChatStorageSeparated.ts) 与 [`useAgentStorageSeparated()`](../../composables/storage/useAgentStorageSeparated.ts) 分别管理会话与智能体。

## 1. 会话存储 ([`useChatStorageSeparated`](../../composables/storage/useChatStorageSeparated.ts))

- **索引文件**: `llm-chat/sessions-index.json`，存储 `currentSessionId` 与会话元信息列表（`ChatSessionIndex[]`），通过 `createConfigManager` 管理读写与版本。
- **会话文件**: 每个会话的完整数据存储为 `llm-chat/sessions/{sessionId}.json`（直接以 `sessionId` 作为文件名，无 `session-` 前缀）。
- **目录结构**:
  ```
  {appConfigDir}/llm-chat/
  ├── sessions-index.json        # 会话索引（含 currentSessionId）
  └── sessions/
      ├── {sessionId-1}.json     # 单会话完整数据
      ├── {sessionId-2}.json
      └── ...
  ```
- **加载过程**: 启动时先读索引以快速展示列表，点击会话时再通过 `loadSession(sessionId)` 异步加载完整数据；索引会在加载时按需扫描 `sessions/` 目录自愈，自动补全新增或清理已删除的会话项。

## 2. 智能体存储 ([`useAgentStorageSeparated`](../../composables/storage/useAgentStorageSeparated.ts))

- **索引文件**: `llm-chat/agents-index.json`，存储 `currentAgentId` 与智能体元信息列表（含 `id` / `name` / `icon` / `category` / `tags` 等），同样由 `createConfigManager` 管理。
- **智能体目录**: 每个智能体在 `llm-chat/agents/{agentId}/` 下拥有**独立的目录**（而非单个 JSON 文件），用于承载配置、头像和私有资产，保证 Agent 的自包含性。
  - `agent.json`: 智能体完整配置（`ChatAgent` 结构）。
  - 头像文件（如 `avatar-{timestamp}.{ext}`、历史头像等图片）：直接平铺在目录根部，由 `agent.icon` / `avatarHistory` 引用相对文件名。
  - `assets/`: 智能体私有资产子目录（表情包、BGM、场景图等），通过 `agent-asset://{group}/{id}.{ext}` 协议引用，详见 [`agent-assets.md`](./agent-assets.md)。
- **目录结构**:
  ```
  {appConfigDir}/llm-chat/
  ├── agents-index.json          # 智能体索引（含 currentAgentId）
  └── agents/
      ├── {agentId-1}/
      │   ├── agent.json         # 智能体配置
      │   ├── avatar-xxx.png     # 头像（直接放在目录根）
      │   └── assets/            # 私有资产子目录
      │       ├── biaoqingbao/
      │       └── bgm/
      ├── {agentId-2}/
      │   └── ...
      └── ...
  ```
- **历史迁移**: 加载索引时会自动检测旧版 `agents/{agentId}.json` 单文件结构，将其升级为 `agents/{agentId}/agent.json` 目录结构，并把 `appdata://` 形式的头像迁移为智能体目录内的相对文件名。

## 3. 多会话架构与子管理器 (Multi-Session Sub-Managers)

系统采用多会话架构，支持多窗口 UI 并发操作与后台会话独立执行。核心状态管理（`llmChatStore`）采用职责聚合的设计模式，将复杂的会话控制委托给一组专职的子管理器：

- **`sessionAccessManager`**: 负责解析会话标识（ID/索引/详情），计算会话的活跃路径（active path），并提供节点 ID 到所属会话的反查索引。
- **`sessionRuntimeManager`**: 集中管理生成中的节点、`AbortController` 实例以及会话级发送队列。支持按会话粒度中止生成，并在会话销毁时联动清理所有关联的运行态资源。
- **`sessionHistoryManager`**: 维护会话级的撤销/重做历史栈，按会话 ID 延迟创建并缓存 `HistoryManager` 实例。
- **`sessionGenerationManager`**: 封装消息发送、续写、重生成、输入补全及排队自动触发等核心生成链路。
- **`sessionLifecycleManager`**: 集中管理会话的创建、删除、切换、导入导出、收藏夹归档及自动命名等生命周期行为。

此外，多会话架构在数据流与状态上实现了以下隔离与解耦：

- **会话级输入草稿隔离**: `useChatInputManager` 内部维护 `sessionId -> draft` 的映射关系，使文本、附件、临时模型及续写模型在会话间完全隔离。
- **生成状态只读化**: 全局 `isSending` 状态是由 `generatingNodes` 集合大小推导的计算属性，避免了手动维护全局可写状态引入的竞态风险。
- **发送链路与 UI 状态解耦**: 核心发送函数（如 `sendMessage`）支持显式指定 `sessionId` 与 `agentId`，允许后台 SubAgent 向非当前活动会话发送消息，而不干扰前台 UI 焦点。
