# 移动端 LLM Chat — 实现情况

> **文档状态**: Implementing  
> **最后更新**: 2026-06-23  
> **对应路径**: `mobile/src/tools/llm-chat/`

## 1. 概述

LLM Chat 是 AIO Hub 移动端的核心交互工具，提供与 LLM 的即时对话体验。本实现为桌面端 `src/tools/llm-chat` 的**移动端适配移植版**，整体架构与桌面端对齐，但针对移动端环境做了精简和调整：

- **UI 框架**: 使用 Varlet 替代 Element Plus
- **类型系统**: 精简了部分桌面端复杂类型（如完整 `ChatAgent`、完整 `Asset` 类型），保留核心契约
- **存储**: 会话采用独立文件存储 + JSON 索引，与桌面端策略一致
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
│   ├── useChatSettings.ts     # 聊天设置管理（持久化）
│   ├── useNodeManager.ts      # 消息节点管理（CRUD）
│   └── useSessionManager.ts   # 会话管理（索引 + 独立文件存储）
├── core/
│   └── pipeline/
│       └── processors/
│           └── session-loader.ts  # 管道处理器：会话历史加载器
├── docs/                      # 规划文档（已删除，仅 Git 记录中存在）
├── locales/
│   ├── zh-CN.json             # 中文语言包
│   └── en-US.json             # 英文语言包
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
│   └── chatFeedback.ts        # 移动端提示/确认封装
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
| `messageCount`            | 可选 number                       | 消息数量快照             |
| `createdAt` / `updatedAt` | `string`                          | 时间戳                   |

**设计特点**:

- 采用**字典 + 指针**方式而非嵌套树，方便增减节点
- `activeLeafId` 指向当前分支末端，配合 `parentId` 可回溯完整路径
- `lastSelectedChildId` 实现分支记忆导航

### 3.4. 可处理消息 (`types/context.ts`)

`ProcessableMessage` 是**管道处理后的中间格式**，比 `ChatMessageNode` 更丰富，包含：

| 字段               | 说明                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `role` / `content` | 核心字段，支持 `string \| LlmMessageContent[]`（多模态）            |
| `sourceType`       | 消息来源：`session_history` / `agent_preset` / `depth_injection` 等 |
| `sourceId`         | 来源标识（预设索引或节点ID）                                        |
| `_attachments`     | 暂存附件列表（移动端用 `any[]` 占位）                               |
| `_originalContent` | 原始内容快照（宏调试用）                                            |
| `_mergedSources`   | 被合并的原始消息                                                    |

### 3.5. 管道上下文 (`types/pipeline.ts`)

`PipelineContext` 是处理器之间的数据总线：

```
PipelineContext
├── messages: ProcessableMessage[]   # 核心可变数据，处理器可增删改
├── session（只读）                    # 当前会话
├── agentConfig / settings（只读）     # 配置（移动端暂为 {}）
├── capabilities （只读）              # 模型能力信息
├── sharedData: Map<string, any>     # 共享黑板
└── logs: Array<{processorId, level, message, details?}>
```

### 3.6. 设置 (`types/settings.ts`)

包含完整的 `ChatSettings` 接口和默认值 `DEFAULT_SETTINGS`：

```
ChatSettings
├── uiPreferences         # 流式输出、时间戳、Token统计、模型信息、自动滚动、字体、消息导航
├── modelPreferences      # 默认模型
├── messageManagement     # 删除/清空确认开关
└── requestSettings       # 超时（60s）、重试次数（2）
```

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

管道执行流程：
LlamaChatView.send() → useChatExecutor.execute()
  → 构建 PipelineContext
  → pipelineStore.executePipeline(context)
  → [session-loader, ...其他处理器]
  → 输出 messages[] 给 llmRequest.sendRequest()
```

**扩展点**: `registerProcessor()` / `unregisterProcessor()` 可动态增删处理器，`reorderProcessors()` 可调整执行顺序。当前仅内置 `session-loader`，桌面端的其他处理器（如宏替换、深度注入、用户档案注入等）尚未移植。

### 4.3. 对话执行流程

```
用户输入 → useChatExecutor.execute(session, content, parentNodeId?)
  │
  ├─ 1. 校验模型有效性（profile + model）
  ├─ 2. 创建用户消息节点（推入树）
  ├─ 3. 创建助手消息节点（生成中状态）
  ├─ 4. 更新 activeLeaf
  ├─ 5. 执行 pipeline（加载历史消息 → 构建 ProcessableMessage[]）
  ├─ 6. 调用 useLlmRequest.sendRequest()（流式）
  │    └─ onStream: 逐 chunk 追加到 assistantNode.content
  ├─ 7. 更新节点状态（complete / error）
  └─ 8. 持久化会话
```

## 5. 路由与页面

注册于 `llm-chat.registry.ts`，采用嵌套路由结构：

| 路由路径                   | 页面组件               | 说明                  |
| -------------------------- | ---------------------- | --------------------- |
| `/tools/llm-chat`          | —                      | 根路由，重定向到 home |
| `/tools/llm-chat/home`     | `ChatHome.vue`         | 主页入口，4个操作卡片 |
| `/tools/llm-chat/sessions` | `SessionList.vue`      | 历史会话列表          |
| `/tools/llm-chat/chat/:id` | `LlmChatView.vue`      | 聊天主界面            |
| `/tools/llm-chat/settings` | `ChatSettingsView.vue` | 聊天设置页面          |

### 5.1. ChatHome.vue — 主页

- 加载设置、LLM Profiles、会话索引
- 4个操作卡片：
  - **开启新对话** — `createSession()` + 跳转
  - **历史会话** — 跳转到 `SessionList`
  - **角色大厅** — 禁用状态（"敬请期待"）
  - **用户档案** — 禁用状态（"敬请期待"）
- 使用 SafeTop 组件处理刘海屏

### 5.2. LlmChatView.vue — 聊天主界面

- 全屏模式（`position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1001`）
- 使用 `var-app-bar` 作为导航栏
- 监听键盘弹出状态（`useKeyboardAvoidance`）
- 消息变化时自动滚动到底部
- 支持删除消息、重新生成

### 5.3. SessionList.vue — 会话列表

- 从 `chatStore.sessionMetas` 渲染列表
- 支持点击跳转、滑动删除
- 空状态提示

### 5.4. ChatSettingsView.vue — 设置页

- 4个设置分组：界面偏好、模型偏好、消息管理、请求设置
- 使用 Varlet 的 `var-cell`、`var-switch`、`var-slider` 组件
- 重置按钮（右上角）

## 6. 组件层

### 6.1. 列表组件

| 组件                 | 职责                                             |
| -------------------- | ------------------------------------------------ |
| `MessageList.vue`    | 消息列表容器，处理滚动和自动滚动                 |
| `MessageContent.vue` | 渲染消息正文（纯文本/Markdown）                  |
| `ChatMessage.vue`    | 单条消息的整体排版（头像、气泡、元信息）         |
| `MessageMenubar.vue` | 操作菜单（重新生成、复制、编辑、删除、分支切换） |
| `BranchSwitcher.vue` | 兄弟分支切换器（上一分支/下一分支）              |
| `BranchSelector.vue` | 底部抽屉式分支列表，支持直接切换到任意同级分支   |

### 6.2. 输入组件

| 组件            | 职责                 |
| --------------- | -------------------- |
| `ChatInput.vue` | 消息输入框，发送按钮 |

## 7. 持久化策略

### 7.1. 会话存储

采用**独立文件存储 + JSON 索引**的方案：

```
{appConfigDir}/llm-chat/
├── sessions-index.json     # 会话索引（元数据列表 + 当前ID）
└── sessions/
    ├── {uuid1}.json        # 单个会话完整数据
    └── {uuid2}.json
```

- **索引文件**: 使用 `createConfigManager` 管理，版本 `1.1.2`
- **会话文件**: 每次变更后重新序列化整个 `ChatSession`（含全部节点）
- **防抖保存**: `createDebouncedSave(1000ms)` 提供延迟写入
- **差异写入**: `saveSessionFile` 会对比新旧内容，内容无变化时跳过写入

### 7.2. 设置存储

- 使用 `createConfigManager`，版本 `1.0.0`
- 支持部分更新（`updateSettings` / `updateSettingItem`）
- 合并策略：逐字段深度合并（防止新增字段被覆盖）

### 7.3. 管道存储

- 持久化处理器顺序和启用状态
- 版本 `1.0.0`

## 8. 已实现的功能清单

### ✅ 基础对话

- [x] 创建/切换/删除会话
- [x] 发送用户消息（纯文本）
- [x] 流式接收助手回复
- [x] 模型选择与校验
- [x] 会话历史持久化
- [x] 重启恢复上次会话

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
- [x] 核心处理器：session-loader
- [x] 待处理器的执行、日志和共享黑板

### ✅ 设置与管理

- [x] UI 偏好（流式、时间戳、Token、模型信息、自动滚动、字体）
- [x] 模型偏好（默认模型选择）
- [x] 消息管理确认开关
- [x] 请求设置（超时、重试）
- [x] 重置为默认
- [x] 中英文双语

### ✅ 移动端适配

- [x] 全屏聊天界面
- [x] 键盘避让
- [x] SafeTop / 刘海屏适配
- [x] Varlet 组件替换
- [x] 手势友好（触摸反馈、放大态）

## 9. 待实现/待完善的功能

### 🔄 管道处理器

- [ ] `macros-renderer`：宏替换/模板渲染
- [ ] `depth-injector`：深度注入（系统提示词）
- [ ] `user-profile-injector`：用户档案注入
- [ ] `agent-preset-loader`：智能体预设加载
- [ ] `token-counter`：Token 计数（与桌面端对齐）
- [ ] 对于ProcessableMessage中的多媒体`_attachments`字段的完整解析

### 🔄 多模态支持

- [ ] 消息中的图片/文件附件发送与展示
- [ ] Asset 系统的完整引入（当前 `_attachments` 用 `any[]` 占位）
- [ ] 图片预览（`ImageViewer`）

### 🔄 智能体支持

- [ ] 角色大厅（市场）
- [ ] 用户档案管理
- [ ] 智能体预设加载

### 🔄 体验优化

- [ ] 会话名称自动生成（基于首条消息）
- [ ] 消息搜索/过滤
- [ ] 消息引用（回复模式）
- [ ] 会话列表的搜索和排序
- [ ] 删除/编辑前的确认弹窗
- [ ] DeepSeek 推理内容的展示（reasoningContent）
- [ ] Token 用量统计展示
- [ ] 模型切换下拉按钮（当前仅在设置页切换默认模型）

## 10. 与桌面端的差异

| 维度           | 桌面端 (`src/tools/llm-chat`)                                                  | 移动端 (`mobile/src/tools/llm-chat`)            |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **UI 框架**    | Element Plus                                                                   | Varlet                                          |
| **类型**       | 完整 `ChatAgent`, `Asset`, `ChatSettings`                                      | 精简版，部分类型用 `any` 占位                   |
| **管道处理器** | 完整：session-loader + macros + depth-injection + user-profile + token-counter | 仅 `session-loader`                             |
| **组件**       | 丰富（BaseDialog, ImageViewer 等）                                             | 基础的列表/输入组件                             |
| **编辑器**     | RichCodeEditor（双引擎）                                                       | 纯文本输入                                      |
| **路由**       | `main`, `settings` 两页                                                        | `home`, `sessions`, `chat/:id`, `settings` 四页 |
| **存储**       | 同（ConfigManager + 独立文件）                                                 | 同                                              |
| **多模态**     | 支持完整 Asset 系统                                                            | 仅占位                                          |

## 11. 关键代码约定

1. **模型选择格式**: `"profileId:modelId"`（例如 `"openai:gpt-4"`）
2. **会话根节点**: 每个会话必有 `rootNode`，`role: "system"`, `content: ""`，不计入 `messageCount`
3. **无法编辑根节点**: `hardDeleteNode` 明确禁止删除根节点
4. **分支切换策略**: 优先使用 `lastSelectedChildId` 记忆，无记忆时用第一个子节点
5. **空消息过滤**: `session-loader` 处理器会跳过纯文本空内容的消息
6. **错误处理**: 使用 `createModuleErrorHandler(moduleName)` 和 `createModuleLogger(moduleName)`
