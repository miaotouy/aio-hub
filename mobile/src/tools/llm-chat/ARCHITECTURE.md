# 移动端 LLM Chat — 实现情况

> **文档状态**: Implementing
> **最后更新**: 2026-07-27
> **对应路径**: `mobile/src/tools/llm-chat/`

## 1. 概述

LLM Chat 是 AIO Hub 移动端的核心交互工具，提供与 LLM 的即时对话体验。本实现为桌面端 `src/tools/llm-chat` 的**移动端适配移植版**，整体架构与桌面端对齐，但针对移动端环境做了精简和调整：

当前产品目标是先完成不依赖工具调用、向量 RAG、Knowledge/Recall 或高级 Agent 的完整角色聊天体验。参考基线是桌面端引入这些后续模块之前的聊天能力，并结合移动端交互独立取舍；“与桌面端对齐”只表示复用成熟的聊天语义，不表示复制桌面当前全部模块或依赖关系。

- **UI 分层**: 页面与聊天骨架由原生 Vue 结构和 AIO Hub 主题 token 主导，Varlet 仅作为按钮、开关、弹层等底层组件库
- **类型系统**: 精简了部分桌面端复杂类型（如完整 `ChatAgent`、完整 `Asset` 类型），保留核心契约
- **存储**: 会话与消息由 Rust 领域 command 增量写入独立 `llm_chat.db`，ConfigManager 只保存当前会话 ID
- **组件**: 复用 `llm-api` 工具的模型选择器（`LlmModelSelector`）和请求封装（`useLlmRequest`）

## 2. 目录结构

```
llm-chat/
├── llm-chat.registry.ts       # 工具注册入口（路由、语言包、元数据）
├── ARCHITECTURE.md            # 本文档
├── components/                # 可复用的 Vue 组件
│   ├── BranchSwitcher.vue     # 分支切换器（树形对话的兄弟节点导航）
│   ├── BranchSelector.vue     # 分支选择抽屉（移动端版本列表）
│   ├── ChatInput.vue          # 聊天输入框
│   ├── ChatMessage.vue        # 单条消息展示
│   ├── MessageContent.vue     # 消息内容渲染（纯文本/富文本）
│   ├── MessageList.vue        # 消息列表容器
│   └── MessageMenubar.vue     # 消息操作菜单栏（重新生成、编辑、删除等）
├── composables/               # 可复用的组合式逻辑
│   ├── useBranchManager.ts    # 分支管理（切换、编辑、重试）
│   ├── useChatExecutor.ts     # 对话执行器（构建上下文、发起 LLM 请求）
│   ├── useChatResponseHandler.ts # 流式响应、usage 和消息状态收口
│   ├── useChatSettings.ts     # 聊天设置管理（持久化）
│   ├── useContextTokenUsage.ts # 输入区上下文 Token 统计与预警
│   ├── useNodeManager.ts      # 消息节点管理（CRUD）
│   ├── useSessionManager.ts   # 会话管理（SQLite 增量变更 + 旧 JSON 一次性导入）
│   └── useTopicNamer.ts       # 首轮消息自动命名
├── core/
│   └── pipeline/
│       └── processors/
│           ├── session-loader.ts       # 管道处理器：会话历史加载器
│           ├── user-profile-injector.ts # 管道处理器：基础档案系统上下文
│           ├── regex-processor.ts      # 管道处理器：导入 Agent 请求正则
│           ├── injection-assembler.ts  # 管道处理器：预设/深度/锚点组装器
│           ├── macros-renderer.ts      # 管道处理器：角色聊天宏与局部变量
│           ├── token-limiter.ts        # 管道处理器：文本历史 Token 截断
│           └── message-formatter.ts    # 管道处理器：合并/角色格式化
├── docs/                      # 规划文档（已删除，仅 Git 记录中存在）
├── locales/
│   ├── zh-CN.json             # 中文语言包
│   └── en-US.json             # 英文语言包
├── services/
│   ├── chatStorageCodec.ts     # 树形会话与 SQLite DTO 的集中转换/差异计算
│   └── chatStorageService.ts   # 聊天领域 Tauri command 薄客户端
├── stores/
│   ├── contextPipelineStore.ts  # 上下文管道状态管理
│   └── llmChatStore.ts          # 核心聊天 Store
├── types/
│   ├── common.ts              # 基础类型（MessageRole, MessageStatus）
│   ├── context.ts             # 可处理消息类型（ProcessableMessage）
│   ├── index.ts               # 类型导出入口
│   ├── message.ts             # ChatMessageNode（树形节点）
│   ├── pipeline.ts            # 管道上下文和处理器接口
│   ├── session.ts             # ChatSession（树形会话）
│   └── settings.ts            # ChatSettings（用户偏好）
├── utils/
│   ├── BranchNavigator.ts     # 分支导航工具类
│   ├── chatFeedback.ts        # 移动端提示/确认封装
│   └── contextTokenUsage.ts   # Token usage 优先级、占比与风险计算
└── views/
    ├── ChatHome.vue           # 主页（入口卡片）
    ├── ChatSettingsView.vue   # 设置页
    ├── LlmChatView.vue        # 聊天主界面
    └── SessionList.vue        # 会话列表页
```

## 3. 核心类型定义

### 3.1. 基础类型 (`types/common.ts`)

```typescript
type MessageRole = "user" | "assistant" | "system";
type MessageStatus = "generating" | "complete" | "error";
type MessageType = "message" | string;
```

### 3.2. 消息节点 — 树形结构 (`types/message.ts`)

`ChatMessageNode` 是对话树的**基础单元**，支持分支对话：

| 字段                  | 类型             | 说明                              |
| --------------------- | ---------------- | --------------------------------- |
| `id`                  | `string`         | UUID v4                           |
| `parentId`            | `string \| null` | 父节点ID，根节点为 null           |
| `childrenIds`         | `string[]`       | 子节点ID列表（分支）              |
| `lastSelectedChildId` | `string`（可选） | 上次选择的子节点（记忆分支）      |
| `content`             | `string`         | 消息文本内容                      |
| `role`                | `MessageRole`    | 角色                              |
| `status`              | `MessageStatus`  | 生成状态                          |
| `timestamp`           | `string`         | ISO 8601 时间戳                   |
| `metadata`            | 对象             | 模型ID/名称、错误信息、推理内容等 |

### 3.3. 会话 — 树形容器 (`types/session.ts`)

`ChatSession` 包含一棵完整的对话树：

| 字段                      | 类型                              | 说明                     |
| ------------------------- | --------------------------------- | ------------------------ |
| `id`                      | `string`                          | 会话唯一标识             |
| `nodes`                   | `Record<string, ChatMessageNode>` | 所有节点字典（树结构）   |
| `rootNodeId`              | `string`                          | 根节点ID（role: system） |
| `activeLeafId`            | `string`                          | 当前活跃分支的叶节点     |
| `name`                    | `string`                          | 会话标题                 |
| `displayAgentId`          | 可选 `string \| null`             | 当前会话绑定的智能体 ID  |
| `messageCount`            | 可选 number                       | 消息数量快照             |
| `createdAt` / `updatedAt` | `string`                          | 时间戳                   |

**设计特点**:

- 采用**字典 + 指针**方式而非嵌套树，方便增减节点
- `activeLeafId` 指向当前分支末端，配合 `parentId` 可回溯完整路径
- `lastSelectedChildId` 实现分支记忆导航
- 新建绑定 Agent 的会话会将有效开局消息固化为根节点下的兄弟分支，优先激活 `defaultGreetingId`；未迁移的宏和 Agent 私有附件不会在此阶段隐式处理
- 聊天内切换 Agent 仅更新会话 `displayAgentId`；历史节点保持原样，后续助手节点固化 Agent 身份与模型/渠道快照

### 3.4. 可处理消息 (`types/context.ts`)

`ProcessableMessage` 是**管道处理后的中间格式**，比 `ChatMessageNode` 更丰富，包含：

| 字段               | 说明                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `role` / `content` | 核心字段，支持 `string \| LlmMessageContent[]`（多模态）            |
| `sourceType`       | 消息来源：`session_history` / `agent_preset` / `depth_injection` 等 |
| `sourceId`         | 来源标识（预设索引或节点ID）                                        |
| `_attachments`     | 管道中的强类型 `ManagedAssetRef[]` 附件列表                         |
| `_originalContent` | 原始内容快照（宏调试用）                                            |
| `_mergedSources`   | 被合并的原始消息                                                    |

聊天附件已经采用 [`mobile-asset-manager-design.md`](../../../docs/plan/mobile-asset-manager-design.md) 的全局可回收资产契约，使用 `assetId + 轻量快照`，不能直接移植桌面端包含路径的完整 `Asset` 对象。`_attachments` 由 codec、session loader 和消息视图共同维护，纯附件消息也必须保留。

### 3.5. 管道上下文 (`types/pipeline.ts`)

`PipelineContext` 是处理器之间的数据总线：

```
PipelineContext
├── messages: ProcessableMessage[]   # 核心可变数据，处理器可增删改
├── session（只读）                    # 当前会话
├── agentConfig / settings（只读）     # 当前 ChatAgent（可空）与聊天配置
├── capabilities （只读）              # 模型能力信息
├── sharedData: Map<string, any>     # 共享黑板
└── logs: Array<{processorId, level, message, details?}>
```

### 3.6. 设置 (`types/settings.ts`)

包含完整的 `ChatSettings` 接口和默认值 `DEFAULT_SETTINGS`：

```
ChatSettings
├── uiPreferences         # 流式输出、时间戳、Token统计、模型信息、自动滚动、字体、消息导航
├── modelPreferences      # 默认模型（当前仅持久化，运行时尚未消费）
├── messageManagement     # 删除/清空确认开关
└── requestSettings       # 超时（60s）、重试次数（2，当前仅持久化）
```

设置界面和持久化结构已经建立，但运行时接线尚未全部完成。目前明确生效的是 Token 显示、上下文预警阈值和消息删除确认；流式开关、时间戳、模型信息开关、自动滚动开关、消息字号、默认模型、请求超时/重试，以及会话删除/清空确认仍需逐项接入实际执行路径。

## 4. 数据流架构

### 4.1. 核心 Store: `llmChatStore`

`llmChatStore`（Pinia）是对话功能的主状态管理器：

```
状态：
├── sessionMetas           # 会话元数据列表（用于列表展示）
├── currentSessionId       # 当前会话 ID
├── currentSessionDetail   # 当前会话完整数据（ChatSession）
├── isSending              # 发送中标志
├── isLoaded               # 初始化完成
└── selectedModelValue     # 选中模型 "profileId:modelId"

Getter:
├── currentSession         # 当前会话（computed）
└── currentActivePath      # 线性活跃路径（从 root→activeLeaf 过滤 root）

Actions:
├── init()                 # 加载索引、恢复上次会话
├── createSession()        # 创建新会话（含 rootNode）
├── switchSession()        # 切换会话
├── deleteSession()        # 删除会话（文件 + 索引）
├── persistCurrentSession() # 持久化
├── syncSelectedModel()    # 同步并校验选中模型
└── switchSibling()        # 切换兄弟分支
```

**数据流**: `init()` 只在应用启动时调用一次，通过 `sessionManager.loadSessions()` 加载索引，如果上次有活跃会话则自动恢复。

### 4.2. 上下文管道: `contextPipelineStore`

这是一个**可扩展的处理器链**，用于在发送 LLM 请求前对消息列表进行预处理：

```
当前注册处理器：
1. primary:session-loader (priority: 100)
   ├── 从 ChatSession 的树形结构提取活跃分支
   ├── 过滤掉空内容和根节点
   └── 转换为 ProcessableMessage[] 放入 context.messages

2. primary:user-profile-injector (priority: 200)
   └── 将启用的 Agent 绑定或全局默认基础档案注入为历史前的系统上下文

3. primary:regex-processor (priority: 300)
   ├── 读取导入 Agent 的 `regexConfig`，按预设优先级、角色与消息深度应用 request 规则
   ├── 仅改写文本或多模态消息的 text part；无效规则记录日志但不会阻断请求
   └── 脚本类型规则不会在移动端执行；全局/用户档案正则 UI 仍待完整桌面契约迁移

4. primary:injection-assembler (priority: 400)
   ├── 读取会话绑定的 ChatAgent，过滤禁用消息和禁用消息组
   ├── 将默认预设作为骨架，并以 `chat_history` 占位符切分前后位置
   ├── 按 order 组装锚点注入，并按深度/高级深度规则插入会话历史
   └── 保留来源 ID、索引与注入来源类型，供后续处理器和 Token 统计使用

5. primary:worldbook-injector (priority: 450)
   ├── 从执行器预加载的 Agent `worldbookIds` 获取全局 `worldbooks.json` 的已启用世界书
   ├── 对最近 `scanDepth` 条同分支历史执行确定性关键词匹配，常量条目始终激活
   ├── 用选中世界书顺序、条目 order 与 ID 作为稳定排序，并在预设/历史之间或相对历史尾部注入
   └── 不实现递归、概率、分组竞争、向量、Outlet、自动化或 Knowledge/Recall

6. primary:macros-renderer (priority: 500)
   ├── 按管线顺序展开角色、用户、会话、模型与 `ManagedAssetRef` 轻量摘要宏
   ├── 从导入 Agent 的 `variableConfig` 初始化局部变量，并应用 `<svar>`、`getvar` / `setvar` / `incvar` / `decvar`
   ├── 对历史 `last*` 宏只读取该消息之前的同分支历史；转义和未知宏保持字面文本
   └── 仅把替换前文本写到 `ProcessableMessage._originalContent`，不把资产路径或系统 URI 写入聊天数据

管道执行流程：
LlamaChatView.send() → useChatExecutor.execute()
  → 构建 PipelineContext
  → pipelineStore.executePipeline(context)
  → [session-loader, user-profile-injector, regex-processor, injection-assembler, worldbook-injector, macros-renderer, token-limiter, message-formatter]
  → 输出 messages[] 给 llmRequest.sendRequest()
```

**扩展点**: `registerProcessor()` / `unregisterProcessor()` 可动态增删处理器，`reorderProcessors()` 可调整执行顺序。当前内置会话加载、基础用户档案注入、导入 Agent 的 request 阶段正则、预设注入组装、移动端限定范围的关键词世界书注入、宏/局部变量渲染、Token 裁剪和最终消息格式化；预设支持默认、深度、高级深度、锚点与模型匹配，格式化支持模型默认规则与 Agent 覆盖的 system 合并、连续角色合并、system 转 user 和角色交替。宏只覆盖角色聊天当前消费的 `user` / `agent` / `char`、用户档案、会话 `last*` / `input`、模型、`assets` 与导入角色局部变量；未知与转义宏不会被执行。世界书由 `worldbookStore` 用 `llm-chat/worldbooks.json` 单独持久化，数据只包含文本、关键词、扫描深度、位置和顺序；世界书管理页创建条目，Agent 编辑页使用既有 `worldbookIds` 选择。后续只按角色聊天需求补资源解析和必要正则能力；工具调用、向量 RAG、Knowledge/Recall 不属于这条管线完成的前置条件。Token 限制器当前计算文本，附件和其他多模态成本继续按实际模型与渠道协议独立估算。当前施工顺序见 [`mobile-development-checklist.md`](../../../docs/plan/mobile-development-checklist.md)。

### 4.3. Token 统计与上下文预警

- `useContextTokenUsage` 对当前分支、启用的智能体预设和输入草稿执行 500ms 防抖批量计数，输入变化后用请求序号丢弃过期结果。
- 发送前，`useChatExecutor` 对管道最终文本调用同一 `count_tokens_batch`，保存消息级估算和本次请求的上下文快照；工具 schema、附件和非文本多模态开销不在该通用计数中。`LlmRequestOptions` 虽支持 `tools`，当前聊天执行器未传递它；未来接入工具调用时，schema、tool choice 与协议包装成本必须另行估算。
- API 返回 usage 后，助手消息的 `completionTokens` 和本次请求的 `promptTokens` 优先显示为实际值；usage 缺失时使用 Rust `o200k`，IPC 异常时使用字符 fallback。已有实际值不会被后续估算覆盖。
- 上下文窗口来自模型对象自身的 `tokenLimits.contextLength`。80% / 90% 阈值集中在 `ChatSettings.contextManagement`，Rust 后端不持有业务预警策略。
- `token-limiter` 已位于 `injection-assembler` 之后、`message-formatter` 之前：复用 `countTokensBatch()`，让预设先占预算并从最新历史倒序保留文本消息，必要时截断单条字符串。最终发送前计数继续用于风险提示、消息级估算和请求快照；附件、工具 schema 和非文本多模态开销不在该通用文本计数中。
- 只有真实设备数据证明需要时，才评估 Worker、Rust 或原生层调整。

### 4.4. 对话执行流程

```
用户输入 → useChatExecutor.execute(session, content, parentNodeId?)
  │
  ├─ 1. 校验模型有效性（profile + model）
  ├─ 2. 创建用户消息节点（推入树）
  ├─ 3. 创建助手消息节点（生成中状态）
  ├─ 4. 更新 activeLeaf
  ├─ 5. 读取会话绑定的 Agent 与模型/常用生成参数
  ├─ 6. 执行 pipeline（加载历史消息，并按默认/深度/锚点策略组装 Agent 预设 → 构建 ProcessableMessage[]）
  ├─ 7. 统计最终请求上下文 Token 并写入风险快照
  ├─ 8. 调用 useLlmRequest.sendRequest()（流式）
  │    └─ onStream: 逐 chunk 追加到 assistantNode.content
  ├─ 9. 收口实际/估算 usage，更新节点状态（complete / error）
  └─ 10. 持久化会话
```

## 5. 路由与页面

注册于 `llm-chat.registry.ts`，采用嵌套路由结构：

| 路由路径                   | 页面组件               | 说明                  |
| -------------------------- | ---------------------- | --------------------- |
| `/tools/llm-chat`          | —                      | 根路由，重定向到 home |
| `/tools/llm-chat/home`     | `ChatHome.vue`         | 主页入口，4个操作卡片 |
| `/tools/llm-chat/sessions` | `SessionList.vue`      | 历史会话列表          |
| `/tools/llm-chat/chat/:id` | `LlmChatView.vue`      | 聊天主界面            |
| `/tools/llm-chat/profiles` | `UserProfilesView.vue` | 用户档案管理          |
| `/tools/llm-chat/settings` | `ChatSettingsView.vue` | 聊天设置页面          |

### 5.1. ChatHome.vue — 主页

- 加载设置、LLM Profiles、会话索引
- 4个操作卡片：
  - **开启新对话** — `createSession()` + 跳转
  - **历史会话** — 跳转到 `SessionList`
  - **角色大厅** — 跳转到独立 `agent-manager`，可选择智能体发起绑定会话
  - **用户档案** — 跳转到 `UserProfilesView`，管理基础档案和默认选择
- 使用 SafeTop 组件处理刘海屏

### 5.2. LlmChatView.vue — 聊天主界面

- 全屏模式（`position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1001`）
- 使用 `var-app-bar` 作为导航栏
- 监听键盘弹出状态（`useKeyboardAvoidance`）
- 消息变化和键盘弹出时仅在“自动滚动”偏好开启时滚动到底部；显式搜索定位不受该开关影响
- 将“聊天字体缩放”偏好传递至消息列表，统一缩放用户与助手消息正文
- 导航栏展示当前绑定的 Agent 名称和头像标识
- 输入区可直接切换当前模型；绑定 Agent 时优先使用 Agent 的渠道与模型
- 支持删除消息、重新生成

### 5.3. SessionList.vue — 会话列表

- 从 `chatStore.sessionMetas` 渲染列表
- 支持点击跳转和删除按钮
- 空状态提示

### 5.4. ChatSettingsView.vue — 设置页

- 4个设置分组：界面偏好、模型偏好、消息管理、请求设置
- 使用 Varlet 的 `var-cell`、`var-switch`、`var-slider` 组件
- 重置按钮（右上角）

## 6. 组件层

### 6.1. 列表组件

| 组件                 | 职责                                                     |
| -------------------- | -------------------------------------------------------- |
| `MessageList.vue`    | 消息列表容器，处理滚动；自动滚动与字号由聊天 UI 偏好控制 |
| `MessageContent.vue` | 渲染消息正文、附件状态与统一受控媒体预览                 |
| `ChatMessage.vue`    | 单条消息的整体排版（头像、气泡、模型、时间戳等元信息）   |
| `MessageMenubar.vue` | 操作菜单（重新生成、复制、编辑、删除、分支切换）         |
| `BranchSwitcher.vue` | 兄弟分支切换器（上一分支/下一分支）                      |
| `BranchSelector.vue` | 底部抽屉式分支列表，支持直接切换到任意同级分支           |

### 6.2. 输入组件

| 组件            | 职责                                                  |
| --------------- | ----------------------------------------------------- |
| `ChatInput.vue` | 模型选择、上下文 Token 占比与预警、消息输入和发送按钮 |

## 7. 持久化策略

### 7.1. 会话存储

采用**独立 SQLite 数据库 + 轻量导航配置**：

```
{appDataDir}/llm-chat/
└── llm_chat.db             # 会话、消息、附件预留表、FTS 与 usage outbox

sessions-index.json         # ConfigManager：currentSessionId + 旧数据导入标记
```

- **领域访问**: `chatStorageService` 只封装固定 Tauri command，前端不能执行任意 SQL
- **结构转换**: `chatStorageCodec` 集中处理 flat rows 与 `nodes + childrenIds`，以 `siblingOrder` 恢复分支顺序
- **增量写入**: `useSessionManager` 对比最近一次实际落盘快照，只提交变化消息和最小删除分支根；会话内并发写入串行化
- **导航配置**: `currentSessionId` 继续由 ConfigManager 管理；会话列表元数据以 SQLite 为权威来源
- **旧数据导入**: 旧索引和逐会话 JSON 只读取一次，成功后写 migration marker，不参与持续读写或双写

### 7.2. 设置存储

- 使用 `createConfigManager`，版本 `1.0.0`
- 支持部分更新（`updateSettings` / `updateSettingItem`）
- 合并策略：逐字段深度合并（防止新增字段被覆盖）

### 7.3. 管道存储

- 持久化处理器顺序和启用状态
- 版本 `1.0.0`

### 7.4. 用户档案存储与请求注入

- 使用 `createConfigManager` 在 `llm-chat/user-profiles.json` 持久化基础档案列表和全局默认档案 ID。
- 每个档案只包含移动端可完整支持的名称、显示名称、图标、纯文本内容、启用状态和使用时间；不冒充或替代桌面端完整用户档案/宏契约。
- 请求执行时，启用的 `ChatAgent.userProfileId` 优先于启用的全局默认档案；`user-profile-injector` 在会话历史之前插入 `<user_profile name="…">` 系统上下文，并更新最后使用时间。
- 管理页支持创建、编辑、启用/禁用、删除和设为默认；确定性 Android E2E 同时验证默认档案持久化与请求中存在档案标签。

### 7.5. 已实施的资产引用

会话与消息 SQLite 迁移、附件存储/outbox、聊天内资产选择、provider wire、受控图片预览、文本文档提取和实时原件状态降级均已接入。Android Studio AVD 的确定性附件发送与 Ollama opt-in 验收已完成；Android 真机主流程和 iOS 仍是平台门禁，剩余施工以 [`mobile-sqlite-migration-plan.md`](../../../docs/plan/mobile-sqlite-migration-plan.md) 为准。

- 聊天消息附件使用 `ManagedAssetRef`：持久化 `assetId`、`usagePolicy` 和名称、类型、MIME、大小、提取文本等轻量快照，不保存资产路径。
- `chat_attachments` 归 `llm_chat.db` 所有；资产原件和 tombstone 归 `asset_manager.db` 所有，两者不建立跨数据库外键。
- 消息、分支和会话变更在聊天事务内写 usage outbox，再由幂等投递器调用资产服务整体替换业务实体的 usage。
- `session-loader` 已把消息与附件引用一起加载到强类型 `_attachments`；只有文本为空但存在附件的消息不会被过滤。
- 附件预览统一由 `MessageContent` 映射 `ManagedAssetRef` 的 `assetId +` 轻量快照到 `MediaItem`，再交给 `MediaPreviewHost` 申请和撤销受控来源；图片、视频和音频共享返回/沉浸层/错误生命周期。发送给模型时仍只传递 `managed-asset-ref`，由 Rust 解析并流式读取，不把原件读入 JS 后再经 base64 IPC 复制。
- 移动端共享 wire 类型和 Rust 原生传输已经支持 `managed-asset-ref`；聊天附件持久化、usage outbox、消息快照展示和 reclaimed/missing 实时降级已接入，provider 请求组装已覆盖 OpenAI-compatible、Gemini 和 Anthropic。
- 资产为 `reclaimed` 时保留消息和附件快照，界面显示“原件已清理”；`missing` 表示异常缺失，两者不能合并处理。
- 智能体预设附件继续引用 Agent 私有资产 Handle，随 Agent 资源包迁移，不登记为全局聊天资产。

## 8. 已实现的功能清单

### ✅ 基础对话

- [x] 创建/切换/删除会话
- [x] 发送用户消息（纯文本）
- [x] 流式接收助手回复
- [x] 模型选择与校验
- [x] 会话历史持久化
- [x] 重启恢复上次会话
- [x] 会话名称自动生成（基于首条消息）
- [x] 通用思考过程展示（reasoningContent）

### ✅ 树形分支对话

- [x] 分支切换（`BranchNavigator`）
- [x] 兄弟节点向前/向后导航
- [x] 分支记忆（`lastSelectedChildId`）
- [x] 删除节点（级联删除子节点）
- [x] 编辑已有消息
- [x] 将编辑结果另存为同级分支
- [x] 重新生成（重试）

### ✅ 上下文管道架构

- [x] PipelineContext 定义
- [x] ContextProcessor 接口
- [x] 处理器注册/注销/排序/启用
- [x] 核心处理器：session-loader、user-profile-injector（基础档案系统上下文）、regex-processor（导入 Agent 的请求正则，不执行脚本规则）、injection-assembler（默认、深度、高级深度、锚点和模型匹配）、token-limiter（文本历史预算）、message-formatter（最终角色格式化）
- [x] 待处理器的执行、日志和共享黑板

### ✅ Agent 对话接入

- [x] 从角色大厅创建绑定 Agent 的会话
- [x] 会话通过 `displayAgentId` 持久化 Agent 绑定
- [x] 加载并按默认、深度和锚点策略组装启用的 Agent 预设消息
- [x] Agent 渠道、模型与常用生成参数进入请求层
- [x] 聊天导航栏展示当前 Agent 标识

### ✅ Token 统计与展示

- [x] Rust `o200k_base` 单条/批量计数与字符 fallback
- [x] 输入草稿、当前分支和 Agent 预设的防抖批量统计
- [x] 发送前最终管道上下文统计及 80% / 90% 分级预警
- [x] API usage 优先、本地估算补位且不覆盖已有实际值
- [x] 输入区上下文占比和消息级 Token 展示

### ✅ 设置与管理

- [x] UI、模型、消息管理、请求和上下文阈值的设置界面与持久化结构
- [x] Token 显示、上下文预警阈值和消息删除确认运行时接线
- [x] 流式开关、时间戳、模型信息、自动滚动和消息字号运行时接线
- [x] 重置为默认
- [x] 中英文语言包与工具级 i18n 注册

### ✅ 移动端适配

- [x] 全屏聊天界面
- [x] 键盘避让
- [x] SafeTop / 刘海屏适配
- [x] 原生 Vue 页面骨架与 Varlet 叶子控件的移动端适配
- [x] 手势友好（触摸反馈、放大态）

## 9. 待实现/待完善的功能

### 🔄 管道处理器

- [ ] `macros-renderer`：宏替换/模板渲染
- [x] `regex-processor`：兼容导入 Agent 的 request 阶段文本正则，按预设优先级、角色和消息深度执行；脚本规则与全局/用户档案配置仍待独立能力
- [x] `message-formatter`：模型默认规则与 Agent 覆盖的消息合并、角色转换和交替补位
- [x] `injection-assembler`：默认、深度/高级深度和锚点预设组装；私有预设附件待 Agent 资源包完成后接入
- [x] `user-profile-injector`：启用的 Agent 绑定或全局默认基础档案在历史前以 `<user_profile>` 系统上下文注入；完整桌面用户档案宏契约仍不在此范围
- [ ] `model-match-filter`：按模型与渠道筛选预设消息
- [x] `token-limiter`：复用现有 Rust `o200k` 批量计数，预设先占预算、从最新历史倒序保留，并支持字符串部分截断；附件、工具 schema 和多模态额外开销仍由独立估算处理
- [x] `ProcessableMessage._attachments` 的强类型加载与空文本消息保留

### 🔄 多模态支持

- [x] 消息中的图片/文件附件 provider wire 组装和聊天输入区资产选择
- [x] 按移动端资产设计引入 `ManagedAssetRef + 轻量快照`
- [x] 接入 `chat_attachments`、usage outbox 和消息/分支/会话删除释放流程
- [x] 接入 `managed-asset-ref` 原生发送与 `reclaimed`/`missing` 降级展示
- [x] 图片、视频和音频附件的统一受控预览（`MediaPreviewHost`、短期 descriptor、Teleport 沉浸层和关闭/卸载主动撤销）
- [x] 文本文档提取结果写入附件快照、blocking usage 降级和 replacement outbox

### 🔄 智能体支持

- [x] 本地角色大厅与基础编辑
- [x] 基础用户档案管理：多档案 CRUD、启用/禁用、全局默认选择、Agent `userProfileId` 覆盖与请求系统上下文注入
- [x] 智能体预设加载
- [x] 执行预设消息的 `injectionStrategy` 和 `modelMatch`
- [x] `primary:macros-renderer` 已在预设装配后展开角色、用户、会话、模型和当前附件的轻量摘要宏，并复用导入 Agent `variableConfig` 的局部变量定义；仅支持 `<svar>`、`getvar` / `setvar` / `incvar` / `decvar`，不注册工具、Recall、Knowledge、CSS 或全局变量宏
- [ ] 接入传统关键词世界书或同类确定性上下文注入；向量 RAG 与 Knowledge/Recall 不属于本阶段依赖
- [x] 聊天内切换 Agent（顶部选择器仅更新会话绑定；历史节点保留原快照，后续助手消息保存 Agent 和模型/渠道快照）
- [x] 将 Agent 开局消息实例化到新会话（根节点兄弟分支、默认开局选择和旧字符串兼容；聊天宏与私有附件后续按各自范围接入）

### 🔄 体验优化

- [x] 消息全文搜索、结果 snippet、分支定位与目标消息高亮
- [x] 消息引用（回复模式）：操作栏选择任意消息后在输入区保留可取消的引用快照；新用户消息经 `metadata.replyTo` 持久化，在会话恢复后继续展示，并在请求历史中以 `<reply_to>` 明确传递给模型
- [x] 会话列表排序（历史会话页提供最近更新、创建时间、消息数和名称的双向排序；跨会话消息搜索结果保持服务端相关性顺序）
- [x] 消息复制通过 `tauri-plugin-clipboard-manager` 写入系统剪贴板；仅在原生写入成功后显示成功反馈，失败时提示检查权限
- [x] 消息删除前按设置显示确认弹窗
- [x] 会话删除和清空确认设置完整接线（历史会话页会在设置开启时确认单个删除或清空全部；取消不会触发写入，完成后给出本地化反馈）
- [x] Token 用量统计展示
- [x] 聊天输入区模型切换下拉按钮
- [x] 默认模型偏好运行时接线：当前选择为空或失效时优先使用设置的可用默认模型，再回退到第一个可用模型；不覆盖仍有效的手动选择
- [x] 请求超时和最大重试次数运行时接线：超时传递至 provider transport；仅在尚未收到流式内容且遇到可恢复的超时、限流或服务端错误时退避重试，避免重复拼接响应
- [x] 聊天页、会话列表、编辑弹窗、输入与附件提示已改用工具私有语言包，补齐中英文覆盖

## 10. 与桌面端的差异

| 维度           | 桌面端 (`src/tools/llm-chat`)                                        | 移动端 (`mobile/src/tools/llm-chat`)                                                                                                       |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **UI 分层**    | 自研业务组件 + Element Plus 叶子控件                                 | 原生 Vue/AIO token 骨架 + Varlet 叶子控件                                                                                                  |
| **类型**       | 完整 `ChatAgent`, `Asset`, `ChatSettings`                            | 已接入兼容 `ChatAgent` 和 `ManagedAssetRef + 轻量快照`，不持久化全局资产路径                                                               |
| **管道处理器** | 完整：会话、注入、宏/变量、世界书/召回、Token 限制、格式化和资源解析 | `session-loader` + `user-profile-injector` + `regex-processor` + `injection-assembler` + `macros-renderer` + `token-limiter` + `message-formatter`；宏仅覆盖角色聊天范围，Token 仅裁剪文本，附件、工具 schema 与多模态成本独立处理 |
| **组件**       | 丰富（BaseDialog, ImageViewer 等）                                   | 基础的列表/输入组件                                                                                                                        |
| **编辑器**     | RichCodeEditor（双引擎）                                             | 纯文本输入                                                                                                                                 |
| **路由**       | `main`, `settings` 两页                                              | `home`, `sessions`, `chat/:id`, `settings` 四页                                                                                            |
| **存储**       | ConfigManager + 独立文件                                             | `llm_chat.db` 增量存储；ConfigManager 仅保存当前会话 ID                                                                                    |
| **多模态**     | 支持完整 Asset 系统                                                  | 已接入 `ManagedAssetRef`、SQLite 附件快照、受控预览和 Rust 原生传输；平台门禁独立跟踪                                                      |

## 11. 关键代码约定

1. **模型选择格式**: `"profileId:modelId"`（例如 `"openai:gpt-4"`）
2. **会话根节点**: 每个会话必有 `rootNode`，`role: "system"`, `content: ""`，不计入 `messageCount`
3. **无法编辑根节点**: `hardDeleteNode` 明确禁止删除根节点
4. **分支切换策略**: 优先使用 `lastSelectedChildId` 记忆，无记忆时用第一个子节点
5. **空消息过滤**: `session-loader` 处理器会跳过纯文本空内容的消息
6. **错误处理**: 使用 `createModuleErrorHandler(moduleName)` 和 `createModuleLogger(moduleName)`
7. **附件引用**: 消费者只持久化 `assetId + 轻量快照`；不得把全局资产路径写入聊天数据
8. **Agent 附件边界**: 智能体预设附件属于 Agent 私有资源，不转换成全局资产 ID
