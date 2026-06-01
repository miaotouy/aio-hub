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
