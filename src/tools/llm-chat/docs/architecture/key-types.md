# 关键类型定义 (Key Types)

本文档汇总 `llm-chat` 中最常被引用的核心类型，便于跨模块的开发者快速查阅。完整定义见 [`types/`](../../types/) 目录。

## 1. `ChatMessageNode` — 树的基本构建块

定义文件：[`types/message.ts`](../../types/message.ts)。

- `id`, `parentId`, `childrenIds`: 定义树结构。
- `role`, `content`, `status`: 消息基本信息。
- `attachments`: `Asset[]`，支持多模态对话。
- `isEnabled`: 核心状态，标记节点内容是否参与上下文构建。
- `injectionStrategy`: 注入策略，支持高级深度配置 (`depthConfig`)。
- `modelMatch`: 按模型 ID 或渠道名称正则表达式过滤消息的生效范围。
- `metadata`: 存储丰富元数据（完整字段定义见 [`types/message.ts`](../../types/message.ts)），核心分组如下：

### 1.1 配置快照

- `agentId` / `agentName` / `agentDisplayName` / `agentIcon`
- `userProfileId` / `userProfileName` / `userProfileDisplayName` / `userProfileIcon`
- `profileId` / `profileName` / `profileDisplayName` / `providerType`
- `modelId` / `modelName` / `modelDisplayName`

### 1.2 Token 统计

- `usage`（`promptTokens` / `completionTokens` / `totalTokens`）
- `contentTokens`（本地计算的单条文本 + 附件 Token 数）
- `tokenCount`、`tokenCountEstimated`、`lastCalcHash`（Token 计算缓存键）

### 1.3 推理与性能

- `reasoningContent`
- `reasoningStartTime` / `reasoningEndTime`
- `requestStartTime` / `requestEndTime`
- `firstTokenTime`（TTFT）、`tokensPerSecond`（TPS）

### 1.4 请求快照

- `requestParameters`（实际生效的 LLM 参数快照，含 `toolCallingEnabled` 等）
- `virtualTimeConfig`（虚拟时间基准与流速快照）
- `stPromptName`（SillyTavern 预设导入时的原始名称）

### 1.5 预设与开局

- `isPresetDisplay`（是否为预设消息的显示副本）
- `isGreeting`（是否为开局消息节点）
- `greetingId`（来源开局消息 ID）
- `greetingLive`（是否仍跟随 Agent 配置同步，固化后置 false）
- `pendingInputOriginal`（虚拟待发送节点上保存的宏展开前的原始输入，不持久化）

### 1.6 工具调用

- `toolCallsRequested`（助手节点上的工具请求列表）
- `toolCall`（单工具调用结果）
- `toolCalls`（多工具调用结果数组）
- 状态机覆盖 `pending / awaiting_approval / executing / completed / denied / error / success`

### 1.7 翻译

- `translation`（`content` / `targetLang` / `modelIdentifier` / `timestamp` / `visible` / `displayMode`）

### 1.8 续写与重新解析

- `isContinuationPrefix`（续写前缀节点）
- `isContinuation`（续写生成结果）
- `continuationPrefix`（原始前缀内容）
- `isReparse`（是否由"重新解析工具"流程产生）
- `isSilent`（静默模式标记，执行完后不再继续工具循环）
- `isCancelled`（工具执行是否被取消）

### 1.9 压缩节点

- `isCompressionNode`
- `compressedNodeIds`（被该节点替代的原始消息列表）
- `compressionTimestamp`
- `originalTokenCount` / `originalMessageCount`
- `compressionConfig`（`triggerMode` / `thresholds` / `summaryRole` 快照）

### 1.10 会话变量

- `sessionVariableSnapshot`（[`SessionVariableSnapshot`](../../types/sessionVariable.ts:85)，由 `variable-processor` 写入的最近变量快照与变更列表）

### 1.11 流式预览与其它

- `partialImagePreviews`（图像生成模型在流式阶段返回的中间帧 Base64 数组）
- `isTruncated`（消息是否被截断）
- `error`（错误信息）
- `summarizedFrom`（摘要节点引用的原始节点列表）

## 2. `ChatSessionIndex` — 会话的轻量索引

用于列表展示，对应 `sessions-index.json` 中的条目。

- `id`: 会话唯一标识符。
- `name`: 会话标题。
- `displayAgentId`: 用于 UI 展示的智能体 ID（当前活动路径最新助手消息所使用的智能体，可为空）。
- `messageCount`: 缓存的有效消息总数（排除根节点和未固化开场白），用于列表性能优化。
- `createdAt` / `updatedAt`: 创建与最后更新时间戳。

## 3. `ChatSessionDetail` — 会话的完整数据

按需异步加载，对应 `sessions/{sessionId}.json`。

- `id`: 与索引中的 `id` 对应。
- `updatedAt`: 最后更新时间戳（用于同步校验）。
- `nodes`: `Record<string, ChatMessageNode>`，消息节点字典。
- `rootNodeId`: 根节点 ID。
- `activeLeafId`: 当前活跃叶节点 ID。
- `parameterOverrides`: `Partial<LlmParameters>`，会话级参数覆盖（可选）。
- `history`: `HistoryEntry[]`，撤销/重做历史栈。
- `historyIndex`: 当前在历史记录中的索引。
- `agentUsage`: `Record<string, number>`，会话中各智能体的使用次数统计（可选）。

## 4. `HistoryEntry` & `HistoryDelta` — 历史记录

- `HistoryActionTag`: 操作类型（如 `NODE_EDIT`, `BRANCH_GRAFT`）。
- `HistoryDelta`: 记录具体的变更（创建、删除、更新、关系变化）。

## 5. `ChatAgent` — 可复用的配置模板

继承自 `AgentBaseConfig`，并追加 `id` / `profileId` / `modelId` / `userProfileId` / `createdAt` / `lastUsedAt` 等运行时字段。

### 5.1 核心配置

- `presetMessages`: 预设消息序列。
- `greetings`: (`GreetingMessage[]`) 独立的开局消息列表。**不参与 `presetMessages` 的上下文装配**，创建会话时会被实例化为根节点的真实子节点，多个开局天然形成兄弟分支。
- `displayPresetCount`: 在聊天界面显示的预设消息数量。
- `parameters`: (`LlmParameters`) 强大的 LLM 参数配置中心，详见 [`model-parameter-system.md`](./model-parameter-system.md)。

### 5.2 知识库

- `knowledgeSettings`: (`AgentKnowledgeSettings`) RAG 检索的全局参数配置，包含召回上限、分数阈值、上下文窗口（轮数）、精确文本缓存开关等。
- `knowledgeBaseConfig`: (`AgentKnowledgeBaseConfig`) 知识库**关联配置**，与 `knowledgeSettings` 不同：管理具体绑定的知识库列表 (`bindings`)、每个 KB 的激活模式覆盖、分组 (`groups`)，以及宏缺失时的自动注入开关与位置 (`context_head` / `before_last_user`)。

### 5.3 工具与扩展

- `toolCallConfig`: 工具调用策略（自动/手动模式、最大迭代次数、并行执行等）。
- `extensionConfig`: (`AgentExtensionConfig`) Agent 扩展插件配置，控制扩展整体开关、单个插件启停 (`extensionToggles`) 及新发现插件的默认启用行为。

### 5.4 私有资产与正则

- `assets` & `assetGroups`: 智能体私有资产管理，支持 `agent-asset://` 协议引用，详见 [`agent-assets.md`](./agent-assets.md)。
- `regexConfig`: 绑定的正则管道规则集，详见 [`chat-regex-pipeline.md`](./chat-regex-pipeline.md)。

### 5.5 交互与世界书

- `interactionConfig`: 交互偏好（如发送按钮是否强制创建分支、媒体音量等）。
- `worldbookIds` & `worldbookSettings`: 关联的世界书条目及扫描策略。
- `quickActionSetIds`: (`string[]`) 关联的快捷操作组 ID 列表。

### 5.6 分类与标签

- `category`: 智能体分类。
- `tags`: (`string[]`) 筛选标签，用于在 UI 中进行分组和筛选，与 `category` 并行存在以支持多层次的智能体组织。

### 5.7 虚拟时间与思考

- `virtualTimeConfig`: 虚拟时间配置（基准时间、流速）。
- `llmThinkRules`: LLM 思考过程的解析规则。

### 5.8 样式与变量

- `richTextStyleOptions`: 智能体专属的 Markdown 渲染样式。
- `variableConfig`: (`VariableConfig`) 会话变量配置，与 `variable-processor` 配套，定义可被 `<svar>` 标签解析与操作的变量集合及其元信息（类型、默认值、数值边界等），详见 [`session-variable-system.md`](./session-variable-system.md)。

### 5.9 UI 偏好

- `defaultToolCallCollapsed`: UI 中工具调用消息块是否默认折叠的偏好开关。
- `visualGuideline`: 视觉化输出指南，用于在上下文中指导 LLM 如何使用 HTML/CSS/JS 进行可视化输出。
- `avatarHistory`: (`string[]`，仅 `ChatAgent` 运行时字段) 历史头像的相对文件名列表，由系统自动维护，供头像选择器快速展示历史选项。

## 6. `InjectionStrategy` — 消息注入策略

- `type`: 策略类型（`default` / `depth` / `advanced_depth` / `anchor`）。
- `depth`: 基础深度注入位置。
- `depthConfig`: 高级深度语法，支持单点、多点及循环注入（如 `10~5`）。
- `anchorTarget`: 锚点注入目标（如 `chat_history`, `user_profile`）。
- `anchorPosition`: 相对锚点的位置（`before` / `after`）。
- `order`: 同位置多消息的排序权重。

## 7. `ChatRegexRule` — 单条正则规则

- `regex`, `replacement`, `flags`: 核心正则配置。
- `applyTo`: 应用阶段控制（`render` / `request`）。
- `targetRoles`: 目标消息角色（`system` / `user` / `assistant`）。
- `depthRange`: 消息深度范围限制。
- `substitutionMode`: 宏替换模式（`NONE` / `RAW` / `ESCAPED`）。
- `trimStrings`: 捕获组后处理字符串列表。

## 8. `ChatRegexPreset` — 正则预设/规则组

- `name`, `description`, `author`, `version`: 元信息。
- `enabled`: 预设级开关。
- `rules`: 规则列表。
- `priority`: 预设优先级（越小越先执行，默认 100）。

## 9. `ChatRegexConfig` — 正则配置根对象

- `presets`: 预设列表，用于 Global、Agent、User 三层配置。
- `bindingMode`: 绑定模式 (`'message' | 'session'`)，控制规则配置的归属策略。
