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
│   ├── MessageList.vue        # 消息列表容器与可视消息定位
│   ├── MessageNavigator.vue   # 可选的浮层消息导航器
│   └── MessageMenubar.vue     # 消息操作菜单栏（续写、重新生成、编辑、删除等）
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
│           ├── regex-processor.ts      # 管道处理器：request 阶段正则（render 见消息渲染）
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
│   ├── chatRegex.ts           # 正则规则/预设/配置与阶段开关类型
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
│   ├── chatRegex.ts           # 正则解析/多源合并/阶段排序与应用（render 与 request 共用）
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
- 新建绑定 Agent 的会话会将有效开局消息固化为根节点下的兄弟分支，优先激活 `defaultGreetingId`；开局消息的 Agent 私有附件引用保留在节点 metadata，请求时由 `preset-attachment-processor` 从私有目录读取并进入请求内容；未迁移的宏仍不在固化阶段隐式处理
- 聊天内切换 Agent 仅更新会话 `displayAgentId`；历史节点保持原样，后续助手节点固化 Agent 身份与模型/渠道快照
- Assistant 续写创建同父节点的生成中分支，初始文本复制源回复并记录 `isContinuation + continuationPrefix`；旧分支不变。续写分支会清除旧 error、usage、Token、推理和中断状态，再固化本次实际使用的 Agent/模型快照

### 3.4. 可处理消息 (`types/context.ts`)

`ProcessableMessage` 是**管道处理后的中间格式**，比 `ChatMessageNode` 更丰富，包含：

| 字段               | 说明                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `role` / `content` | 核心字段，支持 `string \| LlmMessageContent[]`（多模态）            |
| `sourceType`       | 消息来源：`session_history` / `agent_preset` / `depth_injection` 等 |
| `sourceId`         | 来源标识（预设索引或节点ID）                                        |
| `_attachments`     | 管道中的强类型 `ManagedAssetRef[]` 全局资产附件列表                 |
| `_privateAttachments` | Agent 私有附件引用（`AgentAttachmentRef[]`），由预设 `presetAttachments` 与开局消息 `attachments` 归一化而来 |
| `_originalContent` | 原始内容快照（宏调试用）                                            |
| `_mergedSources`   | 被合并的原始消息                                                    |

聊天附件已经采用 [`mobile-asset-manager-design.md`](../../../docs/plan/mobile-asset-manager-design.md) 的全局可回收资产契约，使用 `assetId + 轻量快照`，不能直接移植桌面端包含路径的完整 `Asset` 对象。`_attachments` 由 codec、session loader 和消息视图共同维护，纯附件消息也必须保留。

`_privateAttachments` 与全局资产严格分离：它不对应全局 `assetId`、不接入 `asset_manager.db`、不登记 usage，仅携带 Agent Handle（`AgentAsset.id`）或相对路径。预设消息经 `injection-assembler` 从 `presetAttachments` 填充，开局消息节点经 `session-loader` 从 `node.metadata.privateAttachments` 填充；两者都由 `preset-attachment-processor` 在请求构建末期从 `agents/{id}/` 私有目录读取字节后消费，处理完成后字段清空。只有附件而无正文的预设消息和开局节点必须保留。

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
├── modelPreferences      # 默认模型（主页/聊天页初始化时校验并同步当前选择）
├── messageManagement     # 删除/清空确认开关
└── requestSettings       # 超时（60s）与重试次数（2）
```

设置已接入实际执行路径：流式开关、时间戳、Token 与模型信息展示、自动滚动、消息字号、消息导航器、默认模型、请求超时/重试，以及消息/会话删除和清空确认均已消费。消息导航器关闭时不创建浮层；开启后由 `MessageList` 根据滚动容器的可视消息索引提供首条、上一条、下一条和末条跳转，不改变自动滚动偏好。

### 3.7 世界书类型 (`types/worldbook.ts`)

`MobileWorldbookEntry` 在旧字段（`keys` / `content` / `enabled` / `constant` / `order` / `position` / `depth` / `scanDepth` / `caseSensitive` / `matchWholeWords`）之上扩展 ST 高级语义子集：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `selective` / `secondaryKeys` / `selectiveLogic` | `boolean?` / `string[]?` / `"and_any"｜"not_all"｜"not_any"｜"and_all"?` | 次要关键词选择性匹配，缺省 `and_any` |
| `probability` / `useProbability` | `number?` / `boolean?` | 概率激活，`probability` 统一 0-100（对齐 ST），需 `useProbability` 才生效 |
| `role` | `"system"｜"user"｜"assistant"?` | 注入消息角色，缺省 `system`；ST `role` 0/1/2 转换 |
| `stPosition` | `number?` | ST 原始位置 0-7，仅记录用于无损回写 |
| `excludeRecursion` / `preventRecursion` / `delayUntilRecursion` / `delayUntilRecursionLevel` | `boolean?` / `number?` | 递归字段，当前仅无损保存，运行时未执行 |
| `raw` / `[key: string]: unknown` | `Record<string, unknown>?` | 原始条目与未知字段（`group`、`groupWeight`、`vectorized`、`automationId` 等）无损保留 |

`WorldbookEntryPosition` 为 `before_character｜after_character｜before_history｜after_history｜depth｜outlet`；旧三值 `before_history｜after_character｜depth` 语义不变，旧数据无需迁移。ST `before_an`/`before_em` 降级为 `before_history`，`after_an`/`after_em` 降级为 `after_history`，`outlet` 不注入消息；这些有损映射与递归/分组/向量一样会在导入时汇总 warning。`MobileWorldbookSettings`（`MobileWorldbook.settings` 或 `ChatAgent.worldbookSettings`）当前只消费 `defaultScanDepth`，递归相关字段保留为后续项。

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
   ├── 合并全局（如存在，移动端当前恒空）与导入 Agent 的 `regexConfig`，按预设优先级、角色与消息深度应用 `applyTo.request` 规则
   ├── 排序语义与 render 阶段一致：预设 `priority` 越小越先，其次规则 `order`，同权重保持来源顺序
   ├── 仅改写文本或多模态消息的 text part；无效规则记录日志但不会阻断请求
   └── 脚本类型规则不会在移动端执行；全局/用户档案正则存储与 UI 仍待完整桌面契约迁移

4. primary:injection-assembler (priority: 400)
   ├── 读取会话绑定的 ChatAgent，过滤禁用消息和禁用消息组
   ├── 将默认预设作为骨架，并以 `chat_history` 占位符切分前后位置
   ├── 按 order 组装锚点注入，并按深度/高级深度规则插入会话历史
   └── 保留来源 ID、索引与注入来源类型，供后续处理器和 Token 统计使用

5. primary:worldbook-injector (priority: 450)
   ├── 从执行器预加载的 Agent `worldbookIds` 获取全局 `worldbooks.json` 的已启用世界书
   ├── 对最近 N 条同分支历史执行确定性关键词匹配，N 取 `entry.scanDepth > 书级 settings.defaultScanDepth > Agent worldbookSettings.defaultScanDepth > 8`；常量条目始终激活
   ├── 支持次要关键词选择性逻辑（and_any / and_all / not_any / not_all）与 0-100 概率激活；随机源可注入以便测试
   ├── 用选中世界书顺序、条目 order 与 ID 作为稳定排序；`depth` 默认 4，并始终相对注入前的 session history 锚点计算，超长深度夹到最旧历史之前
   ├── 位置支持 before_character / after_character / before_history / after_history / depth / outlet，并按条目 `role` 决定注入消息角色
   └── 不执行递归扫描、分组竞争、sticky/cooldown、向量、Outlet 宏提取或 Knowledge/Recall；相关字段无损保存但运行时忽略

6. primary:macros-renderer (priority: 500)
   ├── 按管线顺序展开角色、用户、会话、模型、全局 `ManagedAssetRef` 摘要与 Agent 私有资产宏
   ├── `{{assets}}` 先保留全局附件的原有去重摘要，再追加 `agent.assets` 私有资产（可读文本 + Handle 标识）；`{{assets::group}}` 只列该分组私有资产，`{{assets::default}}` 对齐桌面语义表示未分组或引用了不存在分组的资产
   ├── 不引入桌面 `agent-asset://` 资源协议：移动端没有对应 resolver，私有资产只输出 `[类型] 文件名 (handle: id)` 文本，不产生可解析引用
   ├── 从导入 Agent 的 `variableConfig` 初始化局部变量，并应用 `<svar>`、`getvar` / `setvar` / `incvar` / `decvar`
   ├── 对历史 `last*` 宏只读取该消息之前的同分支历史；转义和未知宏保持字面文本
   └── 仅把替换前文本写到 `ProcessableMessage._originalContent`，不把资产路径或系统 URI 写入聊天数据

7. primary:attachment-preparer (priority: 600)
   ├── 通过 AssetManager 检查历史 `ManagedAssetRef` 可用性；ready 资产先经过发送前文本化决策
   ├── ready 的纯文本类附件（document/other 且 MIME 或扩展名可直读）优先内联为带名称和 MIME 标识的 `<attachment_text>` 块，不再进入 managed wire；优先使用选择时持久化的 `snapshot.extractedText`，缺失时对不超过原生 2 MiB 的原件调用 `asset_extract_text` 受控提取，并按内容寻址 `assetId` 做运行时内联缓存；提取失败或超限时保留托管引用原样发送
   ├── 图片、音频、视频与非文本文档保留匿名托管引用，由 Rust 原生传输读取；原件已清理、缺失或读取失败时跳过二进制引用，快照已有 `extractedText` 或替换缓存命中时以文本块确定性回退
   ├── 文本内联与回退都发生在 Token 限制器之前，因此会参与历史裁剪和最终请求 Token 快照
   ├── `useChatExecutor` 只对没有文本回退的失效历史附件显示跳过提示；可用引用继续在最终序列化时交给 Rust 原生传输读取
   └── 纯文本类附件的 `snapshot.extractedText` 由 `AssetPickerSheet` 在确认选择前按需写入（复用 `asset_extract_text`），使新附件在原件被回收后仍有文本回退

8. primary:preset-attachment-processor (priority: 850，位于 token-limiter 700 与 message-formatter 800 之后)
   ├── 读取消息上暂存的 `_privateAttachments`，通过 `useAgentStorage.readAgentAsset` 从 `agents/{id}/` 私有目录读取字节
   ├── 图片：纯 JS 编码为内联 base64，写入 vision part（`source.type = "base64"`），不经过全局资产或 Rust 原生传输
   ├── 文本文档：以内联 `<attachment_text name mime_type>` 块确定性回退，超长截断
   ├── 音频 / 视频 / 其它二进制：降级为 `<attachment …>` 文本描述并 warning，不静默丢弃
   ├── 资产引用缺失或读取失败：记录缺失并 warning；无附件时直接 skipped，不改变任何消息
   └── 放在 message-formatter 之后，避免私有图片在连续的 system / 同角色消息合并时被文本化丢弃；处理结果写入 `sharedData.presetAttachmentResolutionStats`

管道执行流程：
LlamaChatView.send() → useChatExecutor.execute()
  → 构建 PipelineContext
  → pipelineStore.executePipeline(context)
  → [session-loader, user-profile-injector, regex-processor, injection-assembler, worldbook-injector, macros-renderer, attachment-preparer, token-limiter, message-formatter, preset-attachment-processor]
  → buildMessageContent() 序列化可用托管引用；私有附件已由 preset-attachment-processor 内联进 content
  → Rust 原生传输在发网前解析托管引用资产字节
  → 输出 messages[] 给 llmRequest.sendRequest()
```

**扩展点**: `registerProcessor()` / `unregisterProcessor()` 可动态增删处理器，`reorderProcessors()` 可调整执行顺序。当前内置会话加载、基础用户档案注入、导入 Agent 的 request 阶段正则、预设注入组装、移动端限定范围的关键词世界书注入、宏/局部变量渲染、附件可用性与提取文本回退、Token 裁剪和最终消息格式化；预设支持默认、深度、高级深度、锚点与模型匹配，格式化支持模型默认规则与 Agent 覆盖的 system 合并、连续角色合并、system 转 user 和角色交替。宏只覆盖角色聊天当前消费的 `user` / `agent` / `char`、用户档案、会话 `last*` / `input`、模型、`assets`（全局附件摘要 + Agent 私有资产，支持 `{{assets::group}}` 分组过滤）与导入角色局部变量；移动端不识别桌面 `agent-asset://` 资源协议，私有资产以可读文本与 Handle 标识输出，不产生可解析引用；未知与转义宏不会被执行。Agent 私有预设/开局附件在请求构建末期由 `preset-attachment-processor` 从私有目录读取：图片内联进 vision，文本以内联块回退，其余降级为文本描述；它不接入全局资产管理，也不转换成全局 `assetId`，无附件时处理器直接跳过。世界书由 `worldbookStore` 用 `llm-chat/worldbooks.json` 单独持久化，数据包含文本、关键词、扫描深度、位置、顺序、次要关键词/选择性逻辑、概率与角色等 ST 高级语义子集（未知字段保留在条目 `raw`）；世界书管理页创建条目，Agent 编辑页使用既有 `worldbookIds` 选择。资源解析当前边界为：聊天只持久化 `assetId +` 轻量快照；可用纯文本类附件在发送前由 `attachment-preparer` 内联为文本上下文（快照优先，缺失时受控提取并按 `assetId` 缓存），可用图片、音频、视频与非文本文档以托管引用在 Rust 原生传输层读取，历史文档在用户执行“提取文本并清理原件”后可用持久化 `extractedText` 回退；新选中的纯文本类附件在 `AssetPickerSheet` 确认选择前按需写入快照，超过原生 2 MiB 读取上限则跳过，超过 20 万字符则截断并提示；同一进程中的活跃会话通过轻量缓存立即可见，重载后以 SQLite 快照为准。媒体压缩、PDF/Office 深度解析、转写、工具调用、向量 RAG、Knowledge/Recall 不属于这条管线完成的前置条件。Token 限制器当前计算文本，附件和其他多模态成本继续按实际模型与渠道协议独立估算。当前施工顺序见 [`mobile-development-checklist.md`](../../../docs/plan/mobile-development-checklist.md)。

### 4.3. Token 统计与上下文预警

- `useContextTokenUsage` 对当前分支、启用的智能体预设和输入草稿执行 500ms 防抖批量计数，输入变化后用请求序号丢弃过期结果。
- 发送前，`useChatExecutor` 对管道最终文本调用同一 `count_tokens_batch`，保存消息级估算和本次请求的上下文快照；工具 schema、附件和非文本多模态开销不在该通用计数中。`LlmRequestOptions` 虽支持 `tools`，当前聊天执行器未传递它；未来接入工具调用时，schema、tool choice 与协议包装成本必须另行估算。
- API 返回 usage 后，助手消息的 `completionTokens` 和本次请求的 `promptTokens` 优先显示为实际值；usage 缺失时使用 Rust `o200k`，IPC 异常时使用字符 fallback。已有实际值不会被后续估算覆盖。
- 上下文窗口来自模型对象自身的 `tokenLimits.contextLength`。80% / 90% 阈值集中在 `ChatSettings.contextManagement`，Rust 后端不持有业务预警策略。
- `token-limiter` 已位于 `injection-assembler` 之后、`message-formatter` 之前：复用 `countTokensBatch()`，让预设先占预算并从最新历史倒序保留文本消息，必要时截断单条字符串。固定消息耗尽或超出预算时仍按继承策略保留固定消息并删除历史，但处理结果必须为 `degraded`/warn，并记录 `presetTokens`、`maxContextTokens`、`overflowTokens` 与历史是否全部删除。最终发送前计数继续用于风险提示、消息级估算和请求快照；附件、工具 schema 和非文本多模态开销不在该通用文本计数中。
- 只有真实设备数据证明需要时，才评估 Worker、Rust 或原生层调整。

### 4.4. 对话执行流程

```
用户输入 → useChatExecutor.execute(session, content, parentNodeId?)
Assistant 续写 → useChatExecutor.continueGeneration(session, assistantNode)
  │
  ├─ 1. 校验模型有效性（profile + model）
  ├─ 2. 普通发送创建用户节点；重新生成复用父用户节点；续写创建复制源内容的 Assistant 同级分支
  ├─ 3. 创建或复用生成中的助手节点并更新 activeLeaf
  ├─ 4. 读取会话绑定的 Agent 与模型/常用生成参数，固化本次助手快照
  ├─ 5. 执行 pipeline（续写时活跃路径以复制前缀的 Assistant 分支结尾；加载历史并按默认/深度/锚点策略组装 Agent 预设；在 Token 裁剪前筛除失效附件并回退已持久化的提取文本；在最终格式化后从 Agent 私有目录解析预设与开局附件，图片进 vision、文本内联回退）
  ├─ 6. 统计最终请求上下文 Token 并写入风险快照
  ├─ 7. 调用 useLlmRequest.sendRequest()（流式）
  │    ├─ onStream: 逐 chunk 追加到 assistantNode.content
  │    └─ ChatInput 的停止按钮通过共享 AbortController 传入 request signal
  ├─ 8. 收口实际/估算 usage，更新节点状态（complete / error）；续写响应只返回新增文本时会自动保留前缀，主动停止同样保留前缀和已流式输出，以 complete + metadata.interrupted 持久化
  └─ 9. 持久化会话
```

原生 reqwest 流在成功响应时注册为前端拉取式 stream；非 2xx 在 Rust 端按响应上限读取错误正文后直接返回状态，不进入 stream registry。取消命令会先触发 token，再立即移除 request 与 response registry；已在执行的 read 由 token 唤醒并自行收口。

请求参数由 `useChatExecutor` 从当前 Agent 固化：标准字段（`maxTokens` / `temperature` / `topP` / `frequencyPenalty` / `presencePenalty` / `stop`）与 `parameters.custom` 一并进入 `LlmRequestOptions`。`custom` 由 `llm-api` 共享的 `toOpenAiCompatibleCoreRequest` 按桌面 `buildEffectiveParameters` 语义解包——包裹结构仅在 `enabled` 为真时取 `params`，旧版扁平对象整体合并——解包结果放在 core request 的 `extensions` 末尾，由各 provider 在标准字段之后合并进请求体，因此允许覆盖 `temperature` 等标准字段，但会剔除 `messages` / `stream` 以保护消息数组与流式声明。所有移动端文本适配器（openai-compatible、OpenAI Responses、Claude、Gemini、Vertex AI、Cohere）共享此解包，不重复实现。

## 5. 路由与页面

注册于 `llm-chat.registry.ts`，采用嵌套路由结构：

| 路由路径                     | 页面组件               | 说明                  |
| ---------------------------- | ---------------------- | --------------------- |
| `/tools/llm-chat`            | —                      | 根路由，重定向到 home |
| `/tools/llm-chat/home`       | `ChatHome.vue`         | 主页入口，5个操作卡片 |
| `/tools/llm-chat/sessions`   | `SessionList.vue`      | 历史会话列表          |
| `/tools/llm-chat/chat/:id`   | `LlmChatView.vue`      | 聊天主界面            |
| `/tools/llm-chat/profiles`   | `UserProfilesView.vue` | 用户档案管理          |
| `/tools/llm-chat/worldbooks` | `WorldbooksView.vue`   | 关键词世界书管理      |
| `/tools/llm-chat/settings`   | `ChatSettingsView.vue` | 聊天设置页面          |

### 5.1. ChatHome.vue — 主页

- 加载设置、LLM Profiles、会话索引
- 5个操作卡片：
  - **开启新对话** — `createSession()` + 跳转
  - **历史会话** — 跳转到 `SessionList`
  - **角色大厅** — 跳转到独立 `agent-manager`，可选择智能体发起绑定会话
  - **用户档案** — 跳转到 `UserProfilesView`，管理基础档案和默认选择
  - **世界书** — 跳转到 `WorldbooksView`，管理关键词背景条目
- 使用 SafeTop 组件处理刘海屏

### 5.2. LlmChatView.vue — 聊天主界面

- 全屏模式（`position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1001`）
- 使用 `var-app-bar` 作为导航栏
- 监听键盘弹出状态（`useKeyboardAvoidance`）
- 消息变化和键盘弹出时仅在“自动滚动”偏好开启时滚动到底部；显式搜索定位不受该开关影响
- 将“聊天字体缩放”偏好传递至消息列表，统一缩放用户与助手消息正文
- `showMessageNavigator` 开启时，在消息区右下角显示紧凑导航器；它以当前可视消息计数定位，不影响自动滚动开关
- 导航栏展示当前绑定的 Agent 名称和头像标识
- 输入区可直接切换当前模型；绑定 Agent 时优先使用 Agent 的渠道与模型
- 支持删除消息、助手消息续写、重新生成与分支切换；续写只在非生成中的 Assistant 消息菜单展示

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

| 组件                 | 职责                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `MessageList.vue`    | 消息列表容器，处理滚动；自动滚动与字号由聊天 UI 偏好控制                                       |
| `MessageContent.vue` | 渲染消息正文、附件状态与统一受控媒体预览；可用媒体附件内联缩略图/封面/播放器，其余保持文件卡片 |
| `ChatMessage.vue`    | 单条消息的整体排版（头像、气泡、模型、时间戳等元信息）                                         |
| `MessageMenubar.vue` | 操作菜单（重新生成、复制、编辑、删除、分支切换）                                               |
| `BranchSwitcher.vue` | 兄弟分支切换器（上一分支/下一分支）                                                            |
| `BranchSelector.vue` | 底部抽屉式分支列表，支持直接切换到任意同级分支                                                 |

### 6.1.1. 附件呈现组件

| 组件                         | 职责                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AttachmentThumbnail.vue`    | 通用受管内联缩略图：图片按 `assetId` 申请短期 descriptor 显示方形缩略图，其余类型显示类型图标；支持懒加载与撤销 |
| `useLazyManagedThumbnail.ts` | 内联缩略图的 descriptor 生命周期：视口懒加载、资源切换/卸载撤销，URL 不写入消息或持久状态                        |

消息附件区对齐桌面端 `AttachmentCard` 的信息结构：图片用方形缩略图卡（点击打开 `MediaPreviewHost` `sheet` 查看），音频/视频/文档/其它用横条卡片（类型图标或封面 + 文件名 + 大小/状态，可预览者点击打开 `MediaPreviewHost`），不在附件区内联播放器；`reclaimed`/`missing`/`importing` 只显示状态标签且不申请 descriptor。

### 6.2. 输入组件

| 组件            | 职责                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `ChatInput.vue` | 模型选择、上下文 Token 占比与预警、消息输入和发送按钮；待发附件 chip 带缩略图/类型图标 |

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

会话与消息 SQLite 迁移、附件存储/outbox、聊天内资产选择、provider wire、受控图片预览、文本文档提取和实时原件状态降级均已接入。Android Studio AVD 的确定性附件发送与 Ollama opt-in 验收已完成；Android 真机主流程和 iOS 仍是平台后续验证，剩余施工以 [`mobile-sqlite-migration-plan.md`](../../../docs/plan/mobile-sqlite-migration-plan.md) 为准。

- 聊天消息附件使用 `ManagedAssetRef`：持久化 `assetId`、`usagePolicy` 和名称、类型、MIME、大小、提取文本等轻量快照，不保存资产路径。
- `chat_attachments` 归 `llm_chat.db` 所有；资产原件和 tombstone 归 `asset_manager.db` 所有，两者不建立跨数据库外键。
- 消息、分支和会话变更在聊天事务内写 usage outbox，再由幂等投递器调用资产服务整体替换业务实体的 usage。
- `session-loader` 已把消息与附件引用一起加载到强类型 `_attachments`；只有文本为空但存在附件的消息不会被过滤。
- 附件预览统一由 `MessageContent` 映射 `ManagedAssetRef` 的 `assetId +` 轻量快照到 `MediaItem`，再交给 `MediaPreviewHost` 申请和撤销受控来源；图片、视频和音频共享返回/沉浸层/错误生命周期。发送给模型时仍只传递 `managed-asset-ref`，由 Rust 解析并流式读取，不把原件读入 JS 后再经 base64 IPC 复制。
- 消息附件区对 `ready` 的图片/视频/音频内联呈现：图片使用 `AttachmentThumbnail` 的受管方形缩略图（视口懒加载），视频使用不自动播放的封面占位，音频/视频/文档/其它使用横条卡片（类型图标 + 文件名 + 大小/状态，视频/音频可预览者叠加播放图标），点击可预览附件由 `MessageContent` 打开 `MediaPreviewHost`（`sheet`），不在附件区内联播放器；`reclaimed`/`missing`/`importing` 只显示状态标签且不申请 descriptor。输入区 `ChatInput` 的待发附件 chip 同样通过 `AttachmentThumbnail` 显示图片缩略图或类型图标。缩略图与全屏预览的 descriptor 均随组件卸载、资源切换或来源变化撤销，preview URL 不写入消息或持久状态。
- 聊天内 `AssetPickerSheet` 已接入资产管理器的文件/照片/相机导入入口（复用 `assetImportEntry` 与 import job），导入完成后刷新可选列表；导入只产生 `assetId`，不把文件路径、系统 URI 或资产库相对路径写入聊天数据。
- 纯文本类附件（`text/*`、`application/json` 等，或已知文本扩展名）在确认选择前按需调用 `asset_extract_text` 写入 `snapshot.extractedText`；超过原生 2 MiB 读取上限跳过、超过 20 万字符截断，非文本或提取失败时不写快照且不阻断添加，均以 warning 提示。docx/pptx/xlsx 的深度解析未在移动端实现。
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
- [x] 核心处理器：session-loader、user-profile-injector、regex-processor、injection-assembler（含模型/渠道匹配）、worldbook-injector（移动端限定关键词世界书）、macros-renderer（角色聊天限定宏/局部变量）、attachment-preparer、token-limiter、message-formatter
- [x] 处理器的顺序执行、日志和共享黑板；处理器必须明确返回 `applied`、`skipped`、`degraded` 或 `failed`，未命中和安全降级继续执行，显式失败、无效结果或未恢复异常终止请求构造

处理结果契约：

| 状态       | 含义                                 | 管线行为               |
| ---------- | ------------------------------------ | ---------------------- |
| `applied`  | 处理器成功完成适用工作               | 记录 `info`，继续      |
| `skipped`  | 未配置、未命中或当前上下文不适用     | 记录 `info`，继续      |
| `degraded` | 发生预期问题，但处理器已完成安全回退 | 记录 `warn`，继续      |
| `failed`   | 无法保证后续请求正确性               | 记录 `error`，立即终止 |

处理器抛出的未恢复异常和未返回合法结果都按 `failed` 处理。可恢复问题必须由处理器完成回退后显式返回 `degraded`；不得由管线引擎静默吞掉异常。`session-loader` 缺少会话、附件准备无法完成、Token 限制或最终格式化发生未恢复异常等情况不得继续发网。

### ✅ Agent 对话接入

- [x] 从角色大厅创建绑定 Agent 的会话
- [x] 会话通过 `displayAgentId` 持久化 Agent 绑定
- [x] 加载并按默认、深度和锚点策略组装启用的 Agent 预设消息
- [x] Agent 渠道、模型与常用生成参数进入请求层
- [x] Agent 自定义参数（`parameters.custom`）按桌面语义解包并合并进请求体（共享 core request，允许覆盖标准字段）
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

- [x] `macros-renderer`：已完成移动端角色聊天限定范围的角色、用户、会话、模型、全局附件摘要与 Agent 私有资产分组宏（`{{assets}}` / `{{assets::group}}` / `{{assets::default}}`）与局部变量；私有资产只输出可读文本与 Handle 标识，不引入桌面 `agent-asset://` 协议；工具、Recall、Knowledge、CSS 和全局变量宏不属于当前范围
- [x] `regex-processor`：合并全局（移动端当前为空）与导入 Agent 配置，兼容旧配置缺 render 字段，按预设优先级、角色和消息深度执行 request 阶段文本正则；脚本规则不执行；全局/用户档案正则配置源仍待独立能力
- [x] 正则 render 阶段：`MessageContent` 在显示前应用 `applyTo.render` 规则，`ChatMessage` 以 Message-Bound（`metadata.agentId`）解析并合并 Agent 配置，深度由 `MessageList` 传入；规则解析、阶段排序与应用复用 `utils/chatRegex.ts`，无匹配规则时短路，不修改持久化内容
- [x] `message-formatter`：模型默认规则与 Agent 覆盖的消息合并、角色转换和交替补位
- [x] `injection-assembler`：默认、深度/高级深度和锚点预设组装；把 `presetAttachments` 归一化为 `ProcessableMessage._privateAttachments`，并保留只有附件而无正文的预设消息
- [x] `preset-attachment-processor`（priority 850）：从 Agent 私有目录读取预设与开局附件字节，图片内联进 vision，文本以内联块回退，其余类型降级为文本描述并 warning；不接入全局资产，无附件时跳过
- [x] `user-profile-injector`：启用的 Agent 绑定或全局默认基础档案在历史前以 `<user_profile>` 系统上下文注入；完整桌面用户档案宏契约仍不在此范围
- [x] 模型与渠道匹配：由 `injection-assembler` 统一执行；Agent 的 `profileId` 与 provider-native `modelId` 分字段保存，Ollama 等带冒号模型 ID 不再二次拆分
- [x] `token-limiter`：复用现有 Rust `o200k` 批量计数，预设先占预算、从最新历史倒序保留；部分截断保留消息开头并对候选文本重新计数，附件、工具 schema 和多模态额外开销仍由独立估算处理
- [x] `ProcessableMessage._attachments` 的强类型加载与空文本消息保留
- [x] `ProcessableMessage._privateAttachments` 的加载（预设经 injection-assembler、开局经 session-loader）与附件消失时的降级 warning

### 🔄 多模态支持

- [x] 消息中的图片/文件附件 provider wire 组装和聊天输入区资产选择
- [x] 按移动端资产设计引入 `ManagedAssetRef + 轻量快照`
- [x] 接入 `chat_attachments`、usage outbox 和消息/分支/会话删除释放流程
- [x] 接入 `managed-asset-ref` 原生发送与 `reclaimed`/`missing` 降级展示
- [x] 图片、视频和音频附件的统一受控预览（`MediaPreviewHost`、短期 descriptor、Teleport 沉浸层和关闭/卸载主动撤销）
- [x] 文本文档提取结果写入附件快照、blocking usage 降级和 replacement outbox
- [x] 聊天内 `AssetPickerSheet` 接入文件/照片/相机导入入口，导入完成后刷新可选列表
- [x] 可读纯文本附件在选定前按需写入 `snapshot.extractedText`，超限跳过或截断并 warning

### 🔄 智能体支持

- [x] 本地角色大厅与基础编辑
- [x] 基础用户档案管理：多档案 CRUD、启用/禁用、全局默认选择、Agent `userProfileId` 覆盖与请求系统上下文注入
- [x] 智能体预设加载
- [x] 执行预设消息的 `injectionStrategy` 和 `modelMatch`
- [x] `primary:macros-renderer` 已在预设装配后展开角色、用户、会话、模型、全局附件摘要与 Agent 私有资产分组宏（`{{assets}}` / `{{assets::group}}` / `{{assets::default}}`），并复用导入 Agent `variableConfig` 的局部变量定义；私有资产以可读文本和 Handle 标识输出，不引入桌面 `agent-asset://` 协议；仅支持 `<svar>`、`getvar` / `setvar` / `incvar` / `decvar`，不注册工具、Recall、Knowledge、CSS 或全局变量宏
- [x] 已接入移动端限定的传统关键词世界书：有限历史扫描、常量/关键词激活、次要关键词选择性逻辑、0-100 概率激活、六值位置与条目 role、确定性注入；递归扫描、分组竞争、sticky/cooldown、向量 RAG 与 Knowledge/Recall 不属于当前范围（相关字段无损保存但不执行）
- [x] 聊天内切换 Agent（顶部选择器仅更新会话绑定；历史节点保留原快照，后续助手消息保存 Agent 和模型/渠道快照）
- [x] 将 Agent 开局消息实例化到新会话（根节点兄弟分支、默认开局选择和旧字符串兼容）；开局消息的 Agent 私有附件以 `node.metadata.privateAttachments` 保留，请求时由 `preset-attachment-processor` 解析并进入请求内容；聊天宏后续按各自范围接入

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

| 维度           | 桌面端 (`src/tools/llm-chat`)                                        | 移动端 (`mobile/src/tools/llm-chat`)                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI 分层**    | 自研业务组件 + Element Plus 叶子控件                                 | 原生 Vue/AIO token 骨架 + Varlet 叶子控件                                                                                                                                                                                                                                                      |
| **类型**       | 完整 `ChatAgent`, `Asset`, `ChatSettings`                            | 已接入兼容 `ChatAgent` 和 `ManagedAssetRef + 轻量快照`，不持久化全局资产路径                                                                                                                                                                                                                   |
| **管道处理器** | 完整：会话、注入、宏/变量、世界书/召回、Token 限制、格式化和资源解析 | `session-loader` + `user-profile-injector` + `regex-processor` + `injection-assembler` + `worldbook-injector` + `macros-renderer` + `attachment-preparer` + `token-limiter` + `message-formatter` + `preset-attachment-processor`；宏仅覆盖角色聊天范围，Token 仅裁剪文本；全局附件由原生传输解析，已清理文档可回退持久化提取文本，Agent 私有预设/开局附件内联进请求内容，多模态成本独立处理 |
| **组件**       | 丰富（BaseDialog, ImageViewer 等）                                   | 基础的列表/输入组件                                                                                                                                                                                                                                                                            |
| **编辑器**     | RichCodeEditor（双引擎）                                             | 纯文本输入                                                                                                                                                                                                                                                                                     |
| **路由**       | `main`, `settings` 两页                                              | `home`, `sessions`, `chat/:id`, `settings` 四页                                                                                                                                                                                                                                                |
| **存储**       | ConfigManager + 独立文件                                             | `llm_chat.db` 增量存储；ConfigManager 仅保存当前会话 ID                                                                                                                                                                                                                                        |
| **多模态**     | 支持完整 Asset 系统                                                  | 已接入 `ManagedAssetRef`、SQLite 附件快照、受控预览和 Rust 原生传输；平台后续验证独立跟踪                                                                                                                                                                                                      |

## 11. 关键代码约定

1. **模型选择格式**: 选择器和会话设置使用 `"profileId:modelId"` 组合值并只在首个冒号处分割；Agent 持久化时 `profileId` 与 provider-native `modelId` 分字段保存，因此 `modelId` 自身可包含冒号（如 `llama3.2:latest`）
2. **会话根节点**: 每个会话必有 `rootNode`，`role: "system"`, `content: ""`，不计入 `messageCount`
3. **无法编辑根节点**: `hardDeleteNode` 明确禁止删除根节点
4. **分支切换策略**: 优先使用 `lastSelectedChildId` 记忆，无记忆时用第一个子节点
5. **空消息过滤**: `session-loader` 处理器会跳过纯文本空内容的消息
6. **错误处理**: 使用 `createModuleErrorHandler(moduleName)` 和 `createModuleLogger(moduleName)`
7. **附件引用**: 消费者只持久化 `assetId + 轻量快照`；不得把全局资产路径写入聊天数据
8. **Agent 附件边界**: 智能体预设附件属于 Agent 私有资源，不转换成全局资产 ID

## 12. 角色聊天的可用主路径

当前移动端优先保证“导入角色卡 → 选择角色 → 开始对话”这一条可用路径：

1. 在角色大厅点击导入，选择 PC 端 JSON 或 PNG 角色卡。
2. 导入器统一解析 SillyTavern V2/V3 字段，并把设定整理成预设消息，把多开场白整理成会话根节点的可选助手分支。
3. Agent Store 为角色补齐当前可用的 Profile/Model，角色头像和轻量配置写入 Agent 文件。
4. 点击开始对话后，ChatHome 创建绑定角色的新会话，LlmChatView 读取预设和开场白，用户可以直接输入消息。

### 消息列表交互

`MessageList` 将滚动状态、当前可见消息和消息操作状态分开维护。用户向上浏览时，流式新内容不会强行拉回底部；列表离开底部后显示“回到底部”浮动操作，点击后恢复到最新消息。消息正文点击仍可展开操作栏，但代码复制、链接、媒体预览和输入控件等交互元素不会误触发消息激活。

### 富文本渲染

聊天正文统一交给 `RichTextRenderer`。渲染器保留 Markdown 语义、代码块复制/换行、思考块折叠、KaTeX、Mermaid、提示块、表格和受管媒体节点；流式内容以 80ms 节流重排，完成响应立即刷新。排版使用移动端主题 token，长单词、代码和窄屏表格允许横向滚动或断行，原始 HTML 继续以字面文本展示。

### 消息显示前正则（render 阶段）

角色卡的「仅渲染」（ST `markdownOnly`）正则需要在消息显示前生效，但不改写持久化内容。数据流为：`MessageList` 按索引算出深度（`messages.length - 1 - index`）→ `ChatMessage` 以 `metadata.agentId` 做 Message-Bound 查找，`mergeRegexConfigs(全局源, Agent 源)` 合并（全局源当前恒空，合并顺序对齐桌面），并解析 render 宏值 `{{user}}`/`{{char}}`（Agent 名与有效用户档案名，缺省 `User`/`Assistant`）→ `MessageContent` 用 `collectStageRules("render", …)` 收集、按角色与 `depthRange` 过滤，经 `preprocessRegexRuleMacros` 做 `substitutionMode` 宏预处理后交给 `applyRegexRules`，分别生成 `displayedContent` 与 `displayedReasoningContent`（思考内容沿用同一套规则，无规则时短路）。`applyRegexRules` 在规则带 `trimStrings` 时走捕获组后处理路径。阶段排序、flags 解析与 request 阶段共用 `utils/chatRegex.ts`，保证两阶段语义一致；ST 导入器已把 `substituteRegex`（0→NONE、1→RAW、2→ESCAPED，未知值回退 NONE 并告警）与 `trimStrings` 真实转换为规则字段。request 阶段 `regex-processor` 同样用 `agentConfig`/`userProfile` 解析宏值后预处理规则。

性能上：`renderRules`、`preparedRenderRules`、`displayedContent` 与 `displayedReasoningContent` 都是 `computed`，规则集合只在配置/角色/深度变化时重算；无 render 规则时直接返回原文短路；流式 Markdown 重排仍由 `RichTextRenderer` 的 80ms 节流承担，`applyRegexRules` 只做字符串替换、不改写 `message.content`。全局与用户档案级配置源仍为后续项。
