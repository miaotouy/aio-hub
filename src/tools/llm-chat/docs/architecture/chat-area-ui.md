# 会话区域 UI 架构 (ChatArea)

`ChatArea` 是用户与 LLM 进行交互的核心界面，它集成了消息展示、输入管理、树状导航和多窗口同步等复杂功能。本节对应 [`src/tools/llm-chat/components/ChatArea.vue`](../../components/ChatArea.vue) 及其子组件的架构设计。

## 1. 布局概览 (Layout Overview)

`ChatArea` 采用 **Flex Column** 布局（[`ChatArea.vue:584`](../../components/ChatArea.vue:584) `.chat-area-container { display: flex; flex-direction: column; height: 100% }`），**不使用 CSS Grid**。容器内有三个并列子结构：

- **CSS 实现**: 容器 `.chat-area-container` 是垂直 Flex 容器，并附加 `contain: size layout style` + `overscroll-behavior: none` 实现渲染隔离与滚动链阻断。`tabindex="0"` 用于接收键盘导航事件（如 `ArrowUp` / `ArrowDown` 触发消息滚动）。
- **头部 (`.chat-header`)**: 由 [`ChatAreaHeader.vue`](../../components/ChatAreaHeader.vue) 渲染，**使用 `position: absolute; top: 0; z-index: 10`**——头部是悬浮在容器最顶部的层，**不参与 Flex 文档流的高度分配**。`min-height: 64px`，并通过 `mask-image: linear-gradient(to bottom, black 60%, transparent 100%)` 让底部 40% 高度向下虚化淡出（[`ChatAreaHeader.vue:268`](../../components/ChatAreaHeader.vue:268)），与下方消息列表形成"消息从头部下方淡入"的视觉效果。
- **主内容区 (`.main-content` → `.chat-content`)**: 占据剩余空间（`flex: 1; min-height: 0`），内部又是 `flex-direction: column`，按顺序排列三个子元素：
  - **消息列表容器 (`.message-list-wrapper`)**: `flex: 1 1 0%; height: 0; overflow: hidden`，关键是同时使用 `flex-basis: 0%` 和 `height: 0` 强制让浏览器把剩余空间分配给它，同时不会因内容增长撑大父容器（这是 Flex 滚动容器的标准做法）。内部根据 `viewMode` 渲染 `MessageList` 或 `FlowTreeGraph`。顶部还通过 `::before` 伪元素叠加一道 60px 高度的渐变遮罩（避免 mask 与 backdrop-filter 冲突，[`ChatArea.vue:656`](../../components/ChatArea.vue:656)）。
  - **工具调用确认栏 (`ToolCallingApprovalBar`)**: `flex-shrink: 0` 自然占位。
  - **输入框 (`.chat-message-input`)**: 显式 `flex-shrink: 0`（[`ChatArea.vue:676`](../../components/ChatArea.vue:676)），**关键防止被消息列表挤压消失**——这是处理"输入框区域不能被压缩"这一硬约束的核心方式。
- **分离层 (Detached Layer)**: 通过 `.chat-area-container.detached-mode` class 注入（容器根元素的条件 class），样式调整集中在三处：
  1. 容器本身（[`ChatArea.vue:597`](../../components/ChatArea.vue:597)）增加 `margin: 32px` / `height: calc(100% - 64px)` / `border-radius: 16px` / 双层 box-shadow / `--detached-base-bg` 背景；
  2. 可选壁纸层 `.detached-wallpaper`（[`ChatArea.vue:609`](../../components/ChatArea.vue:609)），由 `settings.uiPreferences.showWallpaperInDetachedMode` 控制 v-if 显示，`position: absolute` 铺满容器，`z-index: 0` 垫在所有内容下面，背景图与透明度由 CSS 变量 `--wallpaper-url` / `--wallpaper-opacity` 驱动；
  3. 头部 `chat-header` 整体启用 `-webkit-app-region: drag` 让用户可拖动 OS 窗口（[`ChatAreaHeader.vue:283`](../../components/ChatAreaHeader.vue:283)），头部内的可交互子元素（`.detachable-handle` / `.agent-model-info`）再用 `no-drag` 抠出可点击区。
  4. 右下角浮动一个 `.window-resize-indicator` 调整窗口大小手柄，由 [`ChatAreaHeader.vue:258`](../../components/ChatAreaHeader.vue:258) 在 detached 模式下渲染。

## 2. 头部区域 (Header)

头部是信息展示与交互的混合入口，**实现见 [`ChatAreaHeader.vue`](../../components/ChatAreaHeader.vue)**；与弹窗/实体解析共享的状态由 [`useChatAreaContext.ts`](../../composables/useChatAreaContext.ts) 通过 `provide` / `inject` 提供：

### 2.1 `ComponentHeader` 在分离/内嵌模式的差异

- **内嵌模式 (`!isDetached`)**: 仅在 `settings.uiPreferences.enableDetachableHandle === true` 时渲染（[`ChatAreaHeader.vue:131`](../../components/ChatAreaHeader.vue:131)）；传入 `drag-mode="detach"`，鼠标按下由 `ChatAreaHeader` emit `drag-start`，父级 `ChatArea.vue` 的 `handleDragStart` 调用 [`useDetachable.startDetaching(config)`](../../../../composables/useDetachable.ts) 启动"拖拽分离会话"，把 ChatArea 拖出成独立 Tauri 悬浮窗。`config` 中的窗口尺寸与手柄偏移会基于整个 `.chat-area-container` 而非 ComponentHeader 自身重新计算（[`ChatArea.vue:145`](../../components/ChatArea.vue:145)），以确保拖出窗口的初始位置与视觉一致。
- **分离模式 (`isDetached`)**: 始终渲染；传入 `drag-mode="window"`，此时 ComponentHeader 自身不再处理分离逻辑，而是配合头部 `-webkit-app-region: drag` 让整个头部区域作为 OS 原生窗口拖动条；右上角"右键菜单 → 分离"功能通过 `@detach` 上抛给父级 `handleDetach`，再触发 [`begin_detach_session` + `finalize_detach_session`](../../components/ChatArea.vue:229) 走 Tauri 命令式分离。

### 2.2 左侧 `.agent-model-info`（智能体 + 模型）

- **智能体点击 / 长按**: 点击触发 [`handleAgentInfoClick`](../../components/ChatAreaHeader.vue:87) → context 中的 `handleEditAgent(tab?, section?)` → 打开 [`EditAgentDialog`](../../components/agent/management/EditAgentDialog.vue)（[`ChatArea.vue:545`](../../components/ChatArea.vue:545)）；长按 500ms 触发 [`onLongPress`](../../components/ChatAreaHeader.vue:62) → 弹出 [`QuickAgentSwitch`](../../components/agent/selectors/QuickAgentSwitch.vue) 列出所有智能体快捷切换。两个手势用 `isLongPressConsumed` 标记互斥（长按后松手的 click 事件被 `e.preventDefault() + e.stopImmediatePropagation()` 拦截）。
- **模型点击**: 触发 context 中的 [`handleSelectModel`](../../composables/useChatAreaContext.ts:121) → `useModelSelectDialog().open()` 弹出**全局模型选择器**（不是 EditAgentDialog 的"模型"标签页，是 `@/composables/useModelSelectDialog` 提供的独立 Dialog），选择后直接 `agentStore.updateAgent(agentId, { profileId, modelId })` 写回当前智能体；分离窗口下走 `bus.requestAction("llm-chat:update-agent")` 上行到主窗口执行。
- **模型失效降级**: 当 `currentModel` 找不到时（profile 被删 / model id 改了），显示 `AlertCircle` 警告图标 + "未选择模型"占位文案 + 黄色虚线边框（`.model-info.model-invalid` 样式 [`ChatAreaHeader.vue:353`](../../components/ChatAreaHeader.vue:353)），点击同样进入模型选择器但提示"模型未选择或已失效，点击重新选择"。

### 2.3 右侧 `.header-actions`（用户档案 + 视图切换 + 搜索 + 设置）

- **用户档案点击**: 触发 context 中的 [`handleEditUserProfile`](../../composables/useChatAreaContext.ts:204) → 打开 [`EditUserProfileDialog`](../../components/user-profile/EditUserProfileDialog.vue)（[`ChatArea.vue:557`](../../components/ChatArea.vue:557)），显示的是 `getEffectiveProfile(agent.userProfileId)` 计算出的"智能体绑定优先于全局默认"的生效档案。
- **视图切换器 (`ViewModeSwitcher`) 的持久化字段**: 状态字段为 [`LlmChatUiState.viewMode: "linear" | "force-graph"`](../../composables/ui/useLlmChatUiState.ts:45)，持久化到 `{appConfigDir}/llm-chat/ui-state.json`，由 [`createConfigManager`](../../../../utils/configManager.ts) 管理，**防抖 300ms** 自动保存（[`useLlmChatUiState.ts:79`](../../composables/ui/useLlmChatUiState.ts:79)），与侧边栏宽度、参数面板折叠态等 17 项 UI 偏好共用同一份 JSON。`viewMode === "linear"` 时渲染 `MessageList`，`"force-graph"` 时渲染 `FlowTreeGraph`。
- **搜索按钮**: 切换 `showSearchPanel` 显示/隐藏 [`ChatSearchPanel`](../../components/search/ChatSearchPanel.vue)（**纯前端搜索**当前会话消息，与跨会话搜索不同），快捷键 `Ctrl+F` 全局触发（[`handleKeyDown`](../../components/ChatArea.vue:352)），CodeMirror 编辑器内的 `Ctrl+F` 不被拦截（让编辑器自己的搜索面板处理）。
- **设置按钮**: 打开 [`ChatSettingsDialog`](../../components/settings/ChatSettingsDialog.vue) 全局聊天设置弹窗（[`ChatArea.vue:565`](../../components/ChatArea.vue:565)）。

### 2.4 响应式收缩策略

通过 [`useElementSize(containerRef)`](../../components/ChatArea.vue:74) 持续监测容器宽度，并将 `containerWidth` 传入 `ChatAreaHeader`。头部内四个 computed 阈值控制文本显隐（[`ChatAreaHeader.vue:104`](../../components/ChatAreaHeader.vue:104)）：`showViewModeText > 700px` / `showModelName > 560px` / `showProfileName > 300px` / `showAgentName > 200px`，依次让视图切换器文字、模型名、档案名、智能体名在窄屏下逐级隐藏，保住头像/图标/关键操作。视图切换器额外用 `flex-shrink: 10` 拿到极高收缩优先级，最先被压缩。

### 2.5 动态毛玻璃样式

头部 `:style="chatHeaderStyle"` 由 [`chatHeaderStyle` computed](../../components/ChatAreaHeader.vue:109) 实时生成，**独立于全局 `--card-bg` 与 `--ui-blur`**——根据 `settings.uiPreferences.headerBackgroundOpacity`（默认 0.7）与 `headerBlurIntensity`（默认 12px）调用 [`getBlendedBackgroundColor("--card-bg-rgb", opacity)`](../../../../composables/useThemeAppearance.ts) 合成包含颜色叠加效果的背景色，再叠加 `backdrop-filter: blur(...)` 形成毛玻璃。这套独立配置允许用户为头部单独调透明度，与主题面板的整体毛玻璃强度解耦。

## 3. 消息列表与渲染 (Message List & Rendering)

消息列表是会话的核心展示组件，集成了高性能渲染和富文本处理能力。

### 3.1 CSS 原生虚拟渲染 (CSS Native Virtual Rendering)

- 应用位置由 [`MessageList.vue`](../../components/message/MessageList.vue:962) 通过 `:deep(.chat-message)` 选择器统一作用到所有消息根元素，启用 `content-visibility: auto !important` + `contain-intrinsic-size: auto 500px !important`，让浏览器跳过屏外消息的渲染，无需第三方虚拟滚动库即可流畅承载数千条消息。
- **末尾消息回退方案**: [`.chat-message:last-child`](../../components/message/MessageList.vue:968) 单独覆盖为 `content-visibility: visible !important`，确保底部锚定计算（`scrollHeight`）始终准确，防止流式输出过程中的滚动回弹。
- **富文本层级独立优化**: rich-text-renderer 内部对块级 AST 节点（段落、标题、代码块、表格、Mermaid、思考块等，详见 `BLOCK_NODE_TYPES` 集合）也独立应用 `content-visibility: auto`，与消息层级形成双层渲染裁剪。
- **滚动锚定控制**: [`.message-list`](../../components/message/MessageList.vue:939) 设置 `overflow-anchor: none` 禁用浏览器默认滚动锚定，配合 `contain: size layout paint` 渲染隔离，避免程序化 `scrollTo` 与浏览器自动锚定产生对抗导致布局抖动。
- **滚动位置保持（分支切换）**: 切换分支或编辑创建分支前，通过 [`captureSwitchingMessagePosition`](../../components/message/MessageList.vue:606) 记录目标消息相对视口顶部的偏移量（`messageRect.top - containerRect.top`）；切换后由 [`restoreSwitchingMessagePosition`](../../components/message/MessageList.vue:627) 沿 `nextTick → setTimeout 50ms → setTimeout 150ms` 三次重试恢复，对抗 DOM 异步更新和 `content-visibility` 渐进渲染带来的高度变化。
- **底部锁定与 ResizeObserver**: 维护 `shouldStickToBottom` 意图标志，由 `ResizeObserver` 监听内容容器，**仅在内容增长时**自动跟随到底部，缩小（如删除消息）时不动以避免跳动。

### 3.2 消息导航器 (MessageNavigator)

实现位于 [`MessageNavigator.vue`](../../components/message/MessageNavigator.vue)：

- 悬浮于列表左侧的悬浮控件，鼠标进入或靠近时展开，离开后自动半透明收起。
- 通过 `@vueuse/core` 的 [`useScroll`](../../components/message/MessageNavigator.vue:38) 监听 `arrivedState`（top/bottom 偏移 50px 视为已到达），驱动「跳顶部 / 上一条 / 下一条 / 跳底部」四个按钮的可用状态。
- 显示 `currentIndex / messageCount` 的当前可见消息计数，索引由父组件 [`MessageList`](../../components/message/MessageList.vue:435) 基于"视口中心命中"算法计算并向下传入。
- **新消息提示判定**: **不是基于滚动距离阈值**，而是由父组件传入的 `hasNewMessages` prop（由业务层根据新消息到达事件决定）+ `arrivedState.bottom === true` 自动清除两条线协作。当 `hasNewMessages && canScrollDown` 时，在「下一条」与「跳底部」按钮上叠加 `new-message-dot` 红点徽章；用户滚动触底（50px 阈值）后自动 emit `seen-new-messages` 让父组件清除标记。

### 3.3 富文本渲染系统 (Rich Text Rendering System)

详见独立的 [`rich-text-renderer/ARCHITECTURE.md`](../../../rich-text-renderer/ARCHITECTURE.md)。本节聚焦集成要点：

- **流式友好**: 采用增量解析和更新策略，实现打字机般的流畅体验。
- **零闪烁**: 通过精细的 Diff 算法和 Patch 系统，仅更新变化的部分，避免全量重绘。
- **架构分层**:
  - **处理层 (Processor)**: 接收文本流，利用自研的 **V2 解析器** (CustomParser) 将其转换为 AST。
  - **状态层 (State)**: 维护 AST 结构，计算变更并生成 Patch 指令。
  - **视图层 (View)**: 基于 Vue 组件树递归渲染 AST。
- **稳定区与待定区策略**:
  - 由 [`StreamProcessorV2`](../../../rich-text-renderer/core/StreamProcessorV2.ts) 的 `splitByBlockBoundary` 按"最近一个安全空行"切出稳定区与待定区；稳定区做增量 diff，待定区每次全量重解析。
  - 通过 `markNodesStatus(nodes, "stable" | "pending")` 递归把状态写入每个节点的 `meta.status`，渲染层据此控制特定节点的动画 / 交互：
    - `llm_think` 节点：`isThinking = (status === "pending")`，控制思考中动画与折叠交互。
    - `vcp_tool` 节点：`isPending = (status === "pending" && !closed)`，控制工具执行中状态条。
  - 从 pending → stable 时由 `finalizePendingNodes` 自动清除 `isThinking` / `isPending`，让节点呈现「已完成」形态。
- **更新节流**: 由 `useMarkdownAst` 的混合 `setTimeout` + `requestAnimationFrame` 批处理策略实现，默认 `throttleMs = 80`，可与 `StreamController` 的流式平滑化协同降低 CPU 负载。
- **特色功能**: 代码块沙箱（CodeMirror + IntersectionObserver 延迟初始化）、Mermaid 图表渲染、动态 CSS 样式与作用域隔离（`StyleNode` + `cssUtils`）、CDN 资源本地化、可交互按钮等。
- **可交互按钮安全策略 (`<button>` 白名单)**: 由 [`ActionButtonNode.vue`](../../../rich-text-renderer/components/nodes/ActionButtonNode.vue) 实现，对 LLM 输出的 `<button>` 标签做严格收敛：
  - **操作白名单**: 仅允许 `action="send" | "input" | "copy"` 三种，其它取值不会触发任何行为（类型层面已收窄为这三种）。
  - **内容长度限制**: 单次操作内容硬上限 5000 字符，超出自动截断并弹出 `customMessage.warning` 提示。
  - **控制字符过滤**: 通过正则 `/[\x00-\x08\x0b\x0c\x0e-\x1f]/g` 移除不可见控制字符，仅保留换行（`\n` / `\r`）与制表符（`\t`）。
  - **内联样式安全过滤**: `style` 属性按分号切分后，禁止 `position` / `z-index` / `top` / `left` / `right` / `bottom` 等可能脱离文档流的属性，最后强制追加 `position: relative; z-index: 1;` 兜底，杜绝按钮覆盖主应用 UI 的可能。
  - **send 操作分支策略**: 当 Agent 配置 `interactionConfig.sendButtonCreateBranch = true` 且当前消息节点存在时，自动以当前消息为父节点创建新分支发送，否则走默认续接流程。
  - **服务解耦**: 通过 `toolRegistryManager.getRegistry<LlmChatRegistry>("llm-chat")` 间接获取聊天服务，避免按钮组件直接依赖 store 内部实现。

## 4. 对话树图视图 (Tree Graph View)

对话树图视图是一个高度交互的可视化工具，旨在将对话的非线性树状结构直观地呈现给用户。核心组件为 [`FlowTreeGraph.vue`](../../components/conversation-tree-graph/flow/FlowTreeGraph.vue)。

### 4.1 Vue Flow 与 D3 的集成边界

- **Vue Flow** 完全负责**节点与边的 DOM 渲染**（通过 `<VueFlow :nodes :edges>` 接收响应式数据）、视口缩放/平移控制、`@connect` / `@node-drag-*` / `@node-context-menu` 等交互事件分发；自定义节点通过 `#node-custom` 插槽绑定 [`GraphNode`](../../components/conversation-tree-graph/flow/components/GraphNode.vue)，自定义连接线通过 `#connection-line` 插槽绑定 [`CustomConnectionLine`](../../components/conversation-tree-graph/flow/components/CustomConnectionLine.vue)。
- **D3** 在 [`useGraphD3Simulation`](../../components/conversation-tree-graph/flow/composables/useGraphD3Simulation.ts) 内充当**纯布局引擎**：`tree` 模式调用 `d3-hierarchy.tree()` 计算确定性坐标；`physics` 模式由 `d3-force` 持续运行（`forceManyBody` / `forceCenter` / `forceLink` / `forceCollide`），通过 `simulation.on("tick")` 把 D3 节点的 `(x, y)` 映射回 Vue Flow 的 `node.position`，**D3 不接触 DOM**，仅负责坐标计算。

### 4.2 三种布局模式与切换 UI 入口

由 [`useGraphLayoutMode`](../../components/conversation-tree-graph/flow/composables/useGraphLayoutMode.ts) 管理 `layoutMode: "tree" | "physics" | "static"`，配合 HUD 角标（`TREE` / `PHYSICS` / `STATIC`）展示当前模式：

- **`tree`**: 动态树状布局，每次节点变化都重新跑 `d3-hierarchy.tree()` 重新计算所有节点位置。
- **`physics`**: 实时力导向仿真，节点持续受力，用户拖动后会重新平衡。
- **`static`**: 静态固定布局，节点位置完全由用户拖拽决定，不会自动重排。
- **切换入口**: ① 浮动控制栏左上角的"布局模式"按钮，三态循环（tree → physics → static → tree）；② 视图设置弹窗中的 `defaultLayoutMode` 下拉，控制初始模式。

### 4.3 子树拖拽嫁接的预览交互

由 [`useGraphConnectionPreview`](../../components/conversation-tree-graph/flow/composables/useGraphConnectionPreview.ts) 与 [`useGraphSubtreeDrag`](../../components/conversation-tree-graph/flow/composables/useGraphSubtreeDrag.ts) 协同实现：

- **连线预览**: 用户从源节点拖出连线时，`ConnectionPreviewState` 记录 `isConnecting / sourceNodeId / targetNodeId / isTargetValid / isGrafting`；`CustomConnectionLine` 根据 `isTargetValid` 染色（合法绿色 / 非法红色 / 嫁接虚线），目标节点通过 `is-target` + `is-target-valid` props 显示高亮边框。
- **五条连接有效性规则**: ① 不能连到自己；② 不能连到子孙节点（避免循环）；③ 不能连到当前父节点（无意义操作）；④ 不能连到 root 节点（无法嫁接到根）；⑤ 修饰键决定操作模式 —— 默认连接 = 嫁接整棵子树（`graftBranch`），按住 `Shift` = 仅移动单节点（`moveNode`）。

### 4.4 节点内"思考块剥离"

由 [`graphContentUtils`](../../components/conversation-tree-graph/flow/composables/graphContentUtils.ts) 提供三个工具函数：

- **`THINK_TAG_NAMES = ["think", "guguthink", "thinking"]`**：识别三种思考块标签。
- **`stripThinkingBlocks(content)`**: 用正则 `/<(think|guguthink|thinking)[^>]*>[\s\S]*?<\/\1>/gi` 移除所有思考块，让节点卡片显示纯净的回复内容。
- **`extractThinkingPreview(content, maxLength)`**: 提取第一个思考块的前 N 个字符作为悬停预览。
- **`hasThinkingContent(content)`**: 检测是否包含思考块，用于决定是否在节点卡片上显示"🧠 思考"角标。

## 5. 输入区域 (Input Area)

输入区域 (`MessageInput`) 是用户指令的入口，由全局单例 [`useChatInputManager`](../../composables/input/useChatInputManager.ts) 管理。

- **全局单例的初始化时机**: 通过 [`getOrCreateInstance("ChatInputManager", ...)`](../../composables/input/useChatInputManager.ts:18) 实现**进程级单例**，**首次调用 `useChatInputManager()` 时才懒创建**（不在应用启动时主动初始化），由首个调用方（通常是 `ChatArea` 或 `MessageInput` 组件的 `setup`）触发；后续主窗口、分离窗口、Agent 编辑器等任意调用方都拿到同一个实例，确保跨组件状态一致。
- **草稿持久化的 Key 与作用域**: 使用单一全局 Key [`STORAGE_KEY = "llm-chat-input-draft"`](../../composables/input/useChatInputManager.ts:46)，**作用域为全局而非按会话**——切换会话不会切换草稿，所有会话共用同一份草稿。持久化结构 `ChatInputDraft` 包含 `text` / `attachments` / `temporaryModel` / `continuationModel` / `timestamp`，文本变化通过 `watch` 自动序列化写入 `localStorage`；这与"按会话隔离"的设计是有意取舍——便于跨会话粘贴未完成的草稿，但缺点是切换会话前需要手动清空或发送。
- **跨窗口同步**: 通过 `registerSyncSource` 把 `inputText` / `attachments` / `temporaryModel` / `continuationModel` 注册到 [`useStateSyncEngine`](../../../../composables/useStateSyncEngine.ts)，本地修改自动通过 `useWindowSyncBus` 广播到所有窗口；远端状态变更时设置 `isApplyingSyncState` 标记避免循环回写。
- **QuickActionSelector 在工具栏的位置**: **不在主输入框工具栏内**——`QuickActionSelector` 组件被复用于 ① Agent 编辑器的"快捷操作"绑定项（[`PersonalitySection.vue`](../../components/agent/agent-editor/sections/PersonalitySection.vue)）、② 全局聊天设置中的"全局关联快捷操作"项（[`settingsConfig.ts`](../../components/settings/settingsConfig.ts)）。在工具栏（[`MessageInputToolbar.vue`](../../components/message-input/MessageInputToolbar.vue)）中的入口是不同的呈现形式：① 顶部 `.quick-actions-bar` 平铺栏，按 Agent / Profile / Global 三层合并的 `activeActionSets` 平铺显示所有已激活的快捷操作按钮（支持按组分行展示，由 `groupQuickActionsBySet` 开关控制）；② "更多工具菜单"下拉中的"管理快捷操作"入口打开 `QuickActionManagerDialog`。**无折叠/收起策略**，全部按钮始终展示，依赖 `flex-wrap` 自然换行适配窄屏。
- **外观服务**: 通过 `llmChat.registry.ts` 提供一个轻量级的外观，为其他工具（如 Agent）提供一个稳定的编程接口来与输入框交互。

## 6. 窗口分离与同步 (Detached Window & Sync)

`ChatArea` 支持被"拽出"成为独立的浮动窗口，以适应多任务场景。核心通信层为 [`useWindowSyncBus`](../../../../composables/useWindowSyncBus.ts)（全局单例），LLM Chat 业务侧的同步引擎为 [`useLlmChatSync`](../../composables/chat/useLlmChatSync.ts)。

- **架构模式**: **主从架构 (Master-Slave)**。主窗口是状态的唯一真实来源，分离窗口只负责渲染与用户交互。
- **`useWindowSyncBus` 的事件分类**: Bus 内部注册 **8 种 `WindowMessageType`**（定义在 [`types/window-sync.ts`](../../../../types/window-sync.ts)），严格分为两类：
  - **状态广播类**: `handshake`（握手）/ `state-sync`（单字段状态同步）/ `state-sync-batch`（批量状态同步）/ `request-initial-state`（请求初始状态）/ `heartbeat`（心跳）/ `disconnect`（断开通知）—— 单向通知，不期待响应。
  - **操作请求类**: `action-request`（操作请求）/ `action-response`（操作响应）—— 成对出现，分离窗口的"上行操作"通过这对消息走完整请求/响应链路。
- **操作上行的请求格式与超时**:
  - **请求格式**: [`requestAction<TParams, TResult>(action, params)`](../../../../composables/useWindowSyncBus.ts:592) 自动生成 `requestId`（`${windowLabel}-${timestamp}-${random}`）唯一标识；`ActionRequestPayload = { action, requestId, params }` 包装后通过 `tauriEmit("window-sync-message", ...)` 广播。
  - **超时处理**: 调用方收到 `Promise`，**硬编码 10 秒超时**（[`useWindowSyncBus.ts:610-611`](../../../../composables/useWindowSyncBus.ts:610)）；主窗口收到请求后调用对应 `actionHandler(params)` 处理，结果通过 `action-response` 携带 `requestId` 回传；调用方根据 `requestId` 匹配 Promise 并 `resolve(result)`，超时则 `reject(new Error("操作请求超时: ${action}"))`。
  - **典型上行操作**: `llm-chat:send-message` / `llm-chat:create-branch` / `llm-chat:update-agent` / `llm-chat:open-agent-settings` / `llm-chat:open-quick-action-manager` 等。
- **窗口关闭时的资源清理**:
  - **业务层清理**: [`useLlmChatSync`](../../composables/chat/useLlmChatSync.ts) 通过 `onUnmounted` 钩子清理所有注册的同步引擎（`stateEngines.forEach(e => e.cleanup())`）；额外提供 `hasDownstreamWindows` computed，当下游窗口数量归零时自动调用 `cleanup()` 释放未使用的引擎，避免常驻无意义订阅。
  - **总线层清理**: `WindowSyncBus.cleanup()` 停止心跳定时器（`clearInterval(heartbeatInterval)`）、清空所有 `messageHandlers` / `actionHandlers` / `connectionHandlers` / `initialStateRequestHandlers`、调用 `eventUnlisteners.forEach(fn => fn())` 注销所有 Tauri 事件监听器；连接状态映射 `connectedWindows` 重置为空。
  - **会话状态回收**: 由于状态仅在主窗口持久化，分离窗口关闭不会丢失任何对话数据；分离窗口本地仅缓存广播来的 Store 快照，关闭即销毁。
- **UI 适配**: 分离模式下，`ChatArea` 会自动调整样式（如圆角、阴影、壁纸背景），并显示窗口调整手柄（详见第 1 节分离层样式描述）。

## 7. 核心交互 (Core Interactions)

为了提升对话的灵活性和探索效率，系统提供了一系列高级交互功能。

### 7.1 临时模型切换 (Temporary Model Switch)

- **覆盖范围**: **仅作用于本次发送 / 本次重新生成 / 本次工具重解析**，**不会**修改 Agent 配置或会话默认模型。底层通过 `useChatInputManager.temporaryModel` (`Ref<ModelIdentifier | null>`) 承载，在 [`useChatHandler`](../../composables/chat/useChatHandler.ts:118)、[`useChatExecutor`](../../composables/chat/useChatExecutor.ts:298)、[`MessageMenubar`](../../components/message/MessageMenubar.vue:169) 等多处统一作为 `options.temporaryModel` 注入，临时覆盖 `agentConfig.profileId` / `agentConfig.modelId`。
- **粘性持续**: `temporaryModel` 一旦设置会**持续保留到用户主动清除**（点击工具栏 X 按钮触发 `clearTemporaryModel`），不会在单次发送后自动重置；这是有意设计——支持"连续多轮用 GPT-4 临时验证"的工作流。同时 `temporaryModel` 也被持久化到 `ChatInputDraft` 并跨窗口同步（详见第 5 节）。
- **UI 反馈**: 工具栏右侧通过 [`temporary-model-indicator`](../../components/message-input/MessageInputToolbar.vue:854) 胶囊标签展示 `@图标 + 模型名 + X 清除按钮`，悬停 Tooltip 显示完整 `渠道名 · 模型名`；标签使用 `rgba(--el-color-primary-rgb, 0.1)` 主题色背景与边框（与续写模型的橙色 `--el-color-warning` 区分）。Token 预览（[`useChatInputTokenPreview`](../../composables/input/useChatInputTokenPreview.ts)）也会优先使用 `temporaryModel.modelId` 计算预览 Token 数。**没有专门的 Toast 提示**——状态由胶囊标签持续可视化，避免重复打扰用户。

### 7.2 从编辑创建分支 (Branch from Edit)

- **入口**: 用户编辑消息后，编辑器底部"保存到新分支"按钮触发 [`save-to-branch`](../../components/message/MessageList.vue:851) 事件，最终调用 `store.createBranchFromEdit(msgId, newContent, attachments)`。
- **实现路径**: **不复用 `useBranchManager.createBranch`**（后者仅创建空白分支节点）。实际由 [`useGraphActions.createBranchFromEdit`](../../composables/visualization/useGraphActions.ts:515) 内部调用 [`useNodeManager.createBranchFromEdit`](../../composables/session/useNodeManager.ts:1075) 完成——后者会**保留源节点角色**（user 编辑得到 user 分支，assistant 编辑得到 assistant 分支）+ **直接附带新内容与附件**（无需事后再调 `editMessage`），等同于 "createBranch + editMessage" 的原子化合并版本。
- **历史与持久化**: 写入历史栈使用专属 `BRANCH_CREATE_FROM_EDIT` 标签，与普通 `BRANCH_CREATE` 区分；新节点写入后调用 `nodeManager.updateActiveLeaf` 切换为活跃叶节点，并自动重算 Token + 持久化。

### 7.3 输入草稿剪切与粘贴 (Draft Cut & Paste)

- **跨会话复用**: 系统支持在不同会话间剪切和粘贴输入草稿。通过全局草稿剪贴板，用户可一键将当前会话的输入框文本、附件及临时模型配置剪切并粘贴到另一个会话中。
- **状态同步与持久化**: 草稿剪贴板状态同步至 `localStorage` 和跨窗口状态，确保存久化与多窗口间的一致性。

### 7.4 面板尺寸调整 (Resizable Panels)

- **统一拖拽行为**: 采用通用的 `useResizable` 组合函数，支持左、右、上、下四个方向的尺寸调整，自动管理鼠标事件、光标样式与面板宽度配置的持久化，移除了各工具本地冗余的拖拽处理代码。

## 8. 气泡布局模式 (Bubble Layout Mode)

为了同时满足"知识型工作流"和"沉浸式聊天"等多种使用场景，消息列表支持在 **卡片模式 (Card)** 和 **气泡模式 (Bubble)** 之间无缝切换。该能力由 `BubbleLayoutConfig` 配置驱动，并通过 CSS 变量 + `data-*` 属性实现，**完全不影响**默认卡片模式的渲染路径，确保零回归。

### 8.1 双布局模式

- **卡片模式 (Card)**: 默认行为，所有消息（含工具调用、压缩节点）保持全宽展示，适合代码审阅、长文档分析等专业场景。
- **气泡模式 (Bubble)**: 经典 IM 风格，按角色对齐并限制宽度，适合角色扮演、自然对话场景。

### 8.2 多维度对齐策略

- **用户 / 助手对齐**: `userAlign` 与 `assistantAlign` 可独立配置 (`left` / `right`)，自由组合出 ChatGPT 经典布局、镜像布局或同侧布局。
- **系统 / 压缩消息**: `systemAlign` 支持 `center`（旁白式）或 `left`，作为剧情/系统提示的统一锚点。
- **工具消息粘附**: `toolAttachment` 提供 `follow-prev`（智能跟随上一条同链消息对齐）或 `center`（独立旁白）两种策略，让工具链调用既能视觉聚合又能突显。

### 8.3 宽度双兜底机制

- **百分比 (`maxWidthPercent`)**: 相对消息列表容器，适配不同窗口尺寸。
- **像素上限 (`maxWidthPx`)**: 作为大屏幕下的硬上限，避免气泡过宽影响阅读节奏。
- 系统消息独立的 `systemMaxWidthPercent` 支持居中场景下的差异化宽度。

### 8.4 头像显示与位置 (`uiPreferences.showAvatar` + `avatarPlacement`)

- **全局开关**: 顶层 `uiPreferences.showAvatar` 控制是否显示头像（卡片模式和气泡模式都生效），关闭后所有消息均隐藏头像。
- **`inside`**: 头像在气泡内部（沿用 `MessageHeader` 行为）。
- **`outside`**: 经典 IM 风格，头像独立于气泡渲染在左右两侧，由 `MessageExternalAvatar` 组件承载。该模式下会自动扣除头像列宽度，避免气泡压到头像横坐标。
- 外置模式下，`avatarSize` 与 `avatarGap` 提供精细的尺寸与间距控制；粘附消息和居中消息会渲染透明占位以保持气泡对齐基线。

### 8.5 头部信息分离 (`headerPlacement`)

- **`inside`**: 名字、模型信息、时间戳在气泡内部（默认）。
- **`outside`**: IM 经典布局，头部信息抽离到气泡上方，气泡内只剩纯净的消息内容，通过 `headerGap` 控制垂直间距。
- 仅对 user / assistant 普通消息生效，工具调用与压缩节点保留各自装饰条。

### 8.6 双侧信息错位布局（CSS 实现）

气泡模式下，**底部 Token 信息** (`message-meta`) 跟随消息方向对齐（信息粘附气泡），而**操作栏** (`menubar-wrapper`) 对齐到对面方向。CSS 选择器位于 [`MessageList.vue:1218-1266`](../../components/message/MessageList.vue:1218)：

- `data-align="left"` 的 `.message-meta` 使用 `flex-direction: column; align-items: flex-start; text-align: left`；同行的 `.menubar-wrapper` 反向 `justify-content: flex-end; padding-right: 12px`（操作栏靠右）。
- `data-align="right"` 的 `.message-meta` 使用 `align-items: flex-end; text-align: right`；同行的 `.menubar-wrapper` 反向 `justify-content: flex-start; padding-left: 12px`（操作栏靠左）。
- **典型效果**: 助手气泡（left-align）→ Token 信息靠左、操作栏靠右；用户气泡（right-align）→ Token 信息靠右、操作栏靠左，避免窄气泡下两块信息相互遮挡。

### 8.7 镜像化适配（`row-reverse` 应用范围）

右对齐场景下，系统对以下三个具体位置自动应用 `row-reverse`，确保所有元素都贴向气泡右侧边界：

- **消息头部** (`.message-header:not(.external-header)`): `flex-direction: row-reverse` + `.header-left` 也 `row-reverse`；同时反转 `.header-right` 的 `margin-left: auto` 为 `margin-right: auto`，并把 `.message-info` 改为 `align-items: flex-end; text-align: right`，保证名字行右对齐（[`MessageList.vue:1166-1197`](../../components/message/MessageList.vue:1166)）。
- **工具调用** (`.tool-call-message`): 整条 `flex-direction: row-reverse` 让装饰条 `.tool-bar` 贴到气泡右侧；内部 `.tool-header` + `.tool-header .header-left` 也跟随 `row-reverse`（[`MessageList.vue:1199-1216`](../../components/message/MessageList.vue:1199)）。
- **错误提示** (`.message-meta .error-info`): 内部按钮与文本通过 `flex-direction: row-reverse` + `text-align: right` 镜像（[`MessageList.vue:1243-1248`](../../components/message/MessageList.vue:1243)）。
- **特例**: 外置 header (`.external-header`) 使用 column 布局（名字在上、操作在下），**不应用 row-reverse**——否则会被错误翻转为 column-reverse；改为通过 `align-self: flex-end` 控制对齐。

### 8.8 样式驱动架构（`bubbleLayoutVars` 字段映射表）

[`MessageList.vue:206-217`](../../components/message/MessageList.vue:206) 的 `bubbleLayoutVars` computed 把 `BubbleLayoutConfig` 的 7 个字段一一映射为 CSS 自定义属性：

| CSS 变量                     | 来自配置字段            | 默认值  | 作用域                                     |
| ---------------------------- | ----------------------- | ------- | ------------------------------------------ |
| `--bubble-max-width-percent` | `maxWidthPercent`       | `75%`   | 普通气泡的百分比宽度上限                   |
| `--bubble-max-width-px`      | `maxWidthPx`            | `720px` | 普通气泡的像素宽度上限（与百分比取 `min`） |
| `--system-max-width-percent` | `systemMaxWidthPercent` | `60%`   | System / Compression 消息独立的居中宽度    |
| `--avatar-outside-size`      | `avatarSize`            | `36px`  | 外置头像尺寸，同时用于扣减气泡最大宽度     |
| `--avatar-outside-gap`       | `avatarGap`             | `8px`   | 外置头像与气泡的水平间距                   |
| `--header-outside-gap`       | `headerGap`             | `4px`   | 外置 header 与气泡的垂直间距               |
| `--bubble-radius`            | `borderRadius`          | `12px`  | 气泡圆角，覆盖消息组件内置的 `8px`         |

通过 `mode-card` / `mode-bubble` / `avatar-outside` / `header-outside` 等 class 与 `data-align` / `data-role` / `data-avatar-placement` 等 data 属性组合，**纯 CSS 即可驱动所有变体**，无需 JS 侵入消息组件内部。

### 8.9 信息密度搭配（5 个独立开关的真实生效路径）

气泡模式可与"界面偏好"中的多个独立信息显示开关组合使用，构建出从 **"工程态"** 到 **"纯净聊天态"** 的连续光谱。所有开关定义于 [`ChatSettings.uiPreferences`](../../types/settings.ts)，由 `useChatSettings` 提供响应式读取：

| 开关                      | 默认 | 控制范围                                                 |
| ------------------------- | ---- | -------------------------------------------------------- |
| `showTimestamp`           | ✅   | 消息头部时间戳显示                                       |
| `showTokenCount`          | ✅   | 消息级 Token 统计（位于 `message-meta` 底部信息区）      |
| `showTokenCountForBlocks` | ✅   | 块级 Token 统计（代码块、工具调用展开后的子项 Token 数） |
| `showModelInfo`           | ✅   | 助手消息头部的模型来源标识（`渠道名 · 模型名`）          |
| `showPerformanceMetrics`  | ❌   | TTFT（首字延迟）与 TPS（生成速度）等性能指标             |

以上 5 个开关**互相独立**，可任意组合；额外还有 `showAvatar`（全局头像开关，参见前述"头像显示与位置"）配合使用。**典型配置**: 关闭上述全部开关 + 启用气泡模式 + 外置头像 + 隐藏头部（`headerPlacement: outside` 或缩小 header）→ 得到接近原生 IM 软件的极简聊天界面，适合沉浸式角色扮演场景。
