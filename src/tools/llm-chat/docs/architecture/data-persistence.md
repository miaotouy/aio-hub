# 数据持久化 (Data Persistence)

为了性能和数据安全，会话与智能体都采用**分离式存储策略**，将索引和数据文件分开存储。会话由 LLM Chat 持有，保存在 `{appConfigDir}/llm-chat/`；智能体由 Agent Manager 持有，保存在 `{appConfigDir}/agent-manager/`。

## 1. 会话存储 ([`useChatStorageSeparated`](../../composables/storage/useChatStorageSeparated.ts))

- **索引文件**: `llm-chat/sessions-index.json`，存储 `currentSessionId`、收藏夹与会话元信息列表（`ChatSessionIndex[]`）。索引额外维护 `sessions-index.json.bak`，保存最近一次有效主索引。
- **会话文件**: 每个会话的完整数据存储为 `llm-chat/sessions/{sessionId}.json`（直接以 `sessionId` 作为文件名，无 `session-` 前缀）。会话和索引均带有 `_persistence` 元数据（schema、revision、committedAt）；旧文件以 revision 0 兼容读取。
- **写入模型**: `useChatStorageSeparated()` 仅作为兼容 facade。`SessionPersistenceCoordinator` 对每个会话保持“一个运行中写入 + 一个最新 dirty 标记”，索引使用全局单写者；快照在真正提交前同步 JSON 序列化。内容保存不会修改 `currentSessionId`。
- **原子提交**: 前端调用限定用途的 Rust command `llm_chat_atomic_write`。该命令只解析 llm-chat 的逻辑标识，校验 JSON/revision/sessionId，按逻辑路径获取进程内锁和跨进程文件锁，在同目录临时文件 `sync_all()` 后执行原子替换。索引只会在原主文件有效时轮换备份，避免损坏主文件覆盖最后有效备份。
- **目录结构**:
  ```
  {appConfigDir}/llm-chat/
  ├── sessions-index.json        # 会话索引（含 currentSessionId）
  ├── sessions-index.json.bak    # 最后有效索引备份
  ├── sessions/
  │   ├── {sessionId-1}.json     # 单会话完整数据
  │   ├── {sessionId-2}.json
  │   └── ...
  └── sessions-corrupt/
      ├── corruption-manifest.json # 原子维护的隔离记录
      └── {sessionId}.{timestamp}.json # 无法解析的原始会话字节
  ```
- **加载与恢复**: 启动只读取主索引或有效备份，并按需读取当前会话详情；不会为首屏扫描全部会话。索引缺失且会话目录为空时才创建默认索引。主索引和备份均不可用时，facade 返回恢复状态而非静默写入空索引；`repairIndex()` 是显式恢复操作，支持固定并发度、进度回调与 `AbortSignal` 取消。无法解析的会话被移动到 `sessions-corrupt/`，并写入隔离清单，避免下次启动重复解析。

## 2. 智能体存储 ([`useAgentStorage`](../../../agent-manager/composables/storage/useAgentStorage.ts))

- **索引文件**: `agent-manager/agents-index.json`，存储智能体元信息列表（含 `id` / `name` / `icon` / `category` / `tags` 等），由 `createConfigManager` 管理；当前聊天所选智能体属于 LLM Chat UI 状态，不写入该索引。
- **智能体目录**: 每个智能体在 `agent-manager/agents/{agentId}/` 下拥有**独立的目录**（而非单个 JSON 文件），用于承载配置、头像和私有资产，保证 Agent 的自包含性。
  - `agent.json`: 智能体完整配置（`ChatAgent` 结构）。
  - 头像文件（如 `avatar-{timestamp}.{ext}`、历史头像等图片）：直接平铺在目录根部，由 `agent.icon` / `avatarHistory` 引用相对文件名。
  - `assets/`: 智能体私有资产子目录（表情包、BGM、场景图等），通过 `agent-asset://{group}/{id}.{ext}` 协议引用，详见 [`agent-assets.md`](./agent-assets.md)。
- **目录结构**:
  ```
  {appConfigDir}/agent-manager/
  ├── agents-index.json          # 智能体元数据索引
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
- **历史迁移**: Agent 索引及实体读写前运行一次版本化收敛迁移。迁移通过跨 WebView 锁串行化，只补齐目标目录缺失的旧配置与嵌套资产，不覆盖有效目标文件、不交换整个模块目录；完成后仅检查版本标记。旧 `appdata://llm-chat/agents/...` 头像协议仍会在解析时重定向到新路径。

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
