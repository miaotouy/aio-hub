# 核心逻辑参考 (Composables Reference)

`llm-chat` 把核心业务逻辑封装在多个 Composables 中，遵循单一职责原则。下文按职责域分组列出主要模块。

## 1. 树形对话管理

- **`useNodeManager`**: **树的底层操作者**。提供原子级别的节点操作功能（创建、删除、获取路径、嫁接子树、单点移动等）。
- **`useBranchManager`**: **用户的直接交互层**。基于 `useNodeManager`，提供面向用户操作的高级功能（切换分支、编辑消息、创建分支等）。

## 2. 对话处理核心

- **`useChatHandler`** ([`composables/chat/useChatHandler.ts`](../../composables/chat/useChatHandler.ts)): **对话流程的协调者**。负责处理 `sendMessage` 和 `regenerateFromNode` 的完整逻辑，协调各子模块（消息节点构建、宏预处理、待发送虚拟节点、撤销栈管理等）协同工作，最终把请求委托给执行器层。
- **`useChatExecutor`** ([`composables/chat/useChatExecutor.ts`](../../composables/chat/useChatExecutor.ts)): **请求执行器入口**。承担"用户消息 → 助手响应"的整体流程，根据是否启用工具调用决定走 `useToolCallOrchestrator`（带工具调用循环）还是直接走 `useSingleNodeExecutor`（单轮请求），并负责续写、重生成等场景的入口分发。
- **`useSingleNodeExecutor`** ([`composables/chat/useSingleNodeExecutor.ts`](../../composables/chat/useSingleNodeExecutor.ts)): **单次 LLM 请求执行器**。负责为一个助手节点构造 `PipelineContext`、执行统一上下文管道、调用 `useLlmRequest.sendRequest` 发送请求（含流式回调、推理流、流式预览图）、根据重试设置执行指数/线性退避、最后调用 `useChatResponseHandler` 完成节点终结与异步触发上下文压缩。
- **`useToolCallOrchestrator`** ([`composables/chat/useToolCallOrchestrator.ts`](../../composables/chat/useToolCallOrchestrator.ts)): **工具调用编排器**。在 `useSingleNodeExecutor` 之上叠加多轮工具调用循环：检测助手回复中的工具请求 → 创建独立的 `tool` 角色节点 → 通过 `useToolCalling` 走审批 / 执行流程 → 将工具结果格式化后挂回会话树 → 自动创建下一个助手节点继续迭代，直到达到 `maxIterations`、所有请求被拒绝、或命中 `isSilent` 静默标记。同时提供 `reparseAndOrchestrate` 用于在不重新请求 LLM 的前提下重新解析现有节点中的工具调用。
- **`useChatResponseHandler`** ([`composables/chat/useChatResponseHandler.ts`](../../composables/chat/useChatResponseHandler.ts)): **响应处理器**。专门负责处理流式数据更新（含节流逻辑）、节点状态终结、Base64 附件转换以及错误处理。

## 3. 上下文构建 (统一管道)

上下文构建由 **统一上下文管道** 的各个处理器协同完成。详见 [`context-pipeline.md`](./context-pipeline.md)。

- **`useContextPipelineStore`** ([`stores/contextPipelineStore.ts`](../../stores/contextPipelineStore.ts)): **管道的中央管理器**（Pinia Store）。负责注册、存储、排序和执行所有上下文处理器。
- **`useContextCompressor`** ([`composables/features/useContextCompressor.ts`](../../composables/features/useContextCompressor.ts)): **上下文压缩器**。负责检测压缩触发条件、调用 LLM 生成摘要、创建压缩节点并重构对话树。详见 [`context-compression.md`](./context-compression.md)。
- **`buildPreviewDataFromContext`** ([`core/context-utils/preview-builder.ts`](../../core/context-utils/preview-builder.ts)): **上下文预览构建器**。在管道执行完毕后，基于 `PipelineContext` 构建用于 UI 展示的 `ContextPreviewData`，包括分段消息列表（预设 / 历史）、Token 统计、世界书激活条目、附件 Token 计算与截断统计等，供上下文分析器等 UI 消费。

## 4. 正则管道处理

正则管道在请求阶段的处理逻辑已统一并入上下文管道处理器，不再通过独立的 composable 暴露给业务层。详见 [`chat-regex-pipeline.md`](./chat-regex-pipeline.md)。

- **`regexProcessor`** ([`core/context-processors/regex-processor.ts`](../../core/context-processors/regex-processor.ts)): **正则管道处理器**。作为 `ContextProcessor` 注册到统一上下文管道（id 为 `primary:regex-processor`，priority 200）。内部完成 Global → Agent → User 三层 `ChatRegexConfig` 的合并、按预设 `priority` 和规则 `order` 排序、按消息角色 (`targetRoles`) 与深度 (`depthRange`) 过滤，并使用 `parseRegexString` 解析与 UI 测试一致的正则语法后对每条消息执行替换。处理结果与日志统一写回 `PipelineContext`。
- **工具函数 ([`utils/chatRegexUtils.ts`](../../utils/chatRegexUtils.ts))**: 为 `regexProcessor`、渲染阶段以及正则管理 UI 提供共享的纯函数能力，主要导出包括：
  - `resolveRawRules` / `collectRulesForPipeline`: 从多个 `ChatRegexConfig` 中按阶段收集已启用规则并完成排序。
  - `filterRulesByRole` / `filterRulesByDepth`: 按消息角色与深度过滤规则。
  - `resolveRulesForMessage`: 一次性完成「收集 + 角色过滤 + 深度过滤」的复合解析。
  - `processRulesWithMacros`: 在应用前对规则的 `replacement` 等字段进行宏预处理。
  - `applyRegexRules`: 将一组规则按顺序应用到文本内容上，返回替换后的结果。
  - `parseRegexString`: 解析形如 `/pattern/flags` 的字符串，统一前端正则语法。
  - `executeReplacementScript` / `scanScriptForRisks` / `clearScriptCache`: 脚本式替换的执行、风险扫描与缓存控制。
  - `convertSillyTavernScriptToRule` / `convertFromSillyTavern` / `convertSillyTavernArrayToPreset` / `convertMultipleFromSillyTavern` / `checkPresetHasScript`: SillyTavern 正则脚本与本工程 `ChatRegexRule` / `ChatRegexPreset` 之间的互转和检查。

## 5. 附件与输入管理

- **`useAttachmentManager`**: **附件的完整管理者**。负责附件的添加、移除、验证、去重和状态追踪。
- **`useChatInputManager`**: **全局输入状态管理器**。处理输入框文本和附件的跨窗口同步与持久化。
- **`useTranscriptionManager`**: **转写业务协调者**。
  - 它是对 `transcriptionRegistry` 的本地封装，处理 `llm-chat` 特有的转写逻辑。
  - **同步配置**: 负责将聊天设置中的转写偏好同步给全局转写引擎。
  - **自动触发**: 监听附件导入事件，根据策略自动发起转写任务。
  - **等待机制**: 实现 `ensureTranscriptions`，在发送消息前确保所有必要的转写任务已完成。

## 6. 会话、工具与同步

- **`useSessionManager`**: **会话的生命周期管理者**。负责会话的创建、加载、删除和持久化。
- **`useLlmChatSync`**: **跨窗口同步引擎**。初始化状态同步引擎，注册操作代理处理器，确保多窗口协同工作。
- **`useTopicNamer`**: **话题命名器**。负责调用 LLM 为新会话自动生成简洁、有意义的标题。
- **`useModelSelectDialog`**: **全局模型选择器**。提供弹窗式的模型选择 UI。
- **`useAnchorRegistry`**: **锚点注册表**。管理上下文注入系统中可用的锚点列表（如 `chat_history`）。

## 7. 宏处理引擎

宏引擎以纯类 + 纯函数形式提供，**不存在 `useMacroProcessor` 这一 composable 包装**，业务侧（如 [`useChatHandler.ts`](../../composables/chat/useChatHandler.ts)、[`injection-assembler.ts`](../../core/context-processors/injection-assembler.ts)、[`useMessageInputActions.ts`](../../composables/input/useMessageInputActions.ts) 等）直接 `new MacroProcessor()` 使用。所有公共能力统一从 [`macro-engine/index.ts`](../../macro-engine/index.ts) 导出。

- **`MacroProcessor`** ([`macro-engine/MacroProcessor.ts`](../../macro-engine/MacroProcessor.ts)): **宏执行的核心引擎**。按 `PRE_PROCESS → SUBSTITUTE → POST_PROCESS` 三阶段处理文本中的 `{{...}}` 占位符，支持参数解析、上下文传递与执行结果统计；同时提供静态方法 `extractMacros` / `executeDirectly` / `getContextFreeMacros` / `isContextFree`，用于在不构建完整管道的情况下做轻量调用与校验。
- **`MacroRegistry`** ([`macro-engine/MacroRegistry.ts`](../../macro-engine/MacroRegistry.ts)): **宏定义的中心化管理器**（单例）。负责注册、注销、查询所有内置与扩展宏的 `MacroDefinition`，并提供 `getInstance()` / `getAllMacros()` / `getMacro()` 等接口供 UI（如 `MacroSelector`、`PresetMessageEditor`）和处理器消费。
- **`initializeMacroEngine`** ([`macro-engine/index.ts`](../../macro-engine/index.ts)): **宏引擎全局初始化函数**。在应用层（[`LlmChat.vue`](../../LlmChat.vue) 的 `onMounted`）调用一次，会清空注册表并依次注册 9 类内置宏：`core` / `datetime` / `variables` / `functions` / `system` / `assets` / `tools` / `knowledge` / `cssVariables`；UI 组件在 registry 为空时也会按需触发它，保证宏列表始终可用。
- **`createMacroContext`** ([`macro-engine/MacroContext.ts`](../../macro-engine/MacroContext.ts)): **基础宏上下文构造器**。根据 `userName`、`charName`、`agent`、`userProfile`、`modelId`、`modelName`、`profileId`、`providerType`、`timestamp` 等可选选项构建初始 `MacroContext`，初始化空的 `variables` / `globalVariables` Map，供 `MacroProcessor.process()` 使用。
- **`extractContextFromSession`** ([`macro-engine/MacroContext.ts`](../../macro-engine/MacroContext.ts)): **会话级上下文增量提取器**。基于 `ChatSessionIndex` + `ChatSessionDetail` 沿 `activeLeafId`（或指定 `targetNodeId`）回溯活跃路径上启用的节点，提取 `lastMessage` / `lastUserMessage` / `lastCharMessage` 等会话语义字段，并把 `index` / `detail` / `agent` / `userProfileObj` 一起返回为 `Partial<MacroContext>`，由调用方与 `createMacroContext` 的基础上下文合并后使用。

## 8. 历史记录管理

- **`useSessionNodeHistory`**: **撤销/重做管理器**。
  - 维护 `history` 栈和 `historyIndex`。
  - 实现 `recordHistory`（记录快照或增量）、`undo`、`redo` 和 `jumpToState`。
  - 处理复杂的节点关系恢复逻辑。
  - 详见 [`undo-redo-system.md`](./undo-redo-system.md)。

## 9. 导出管理

- **`useExportManager`**: **导出工具**。
  - `exportSessionAsMarkdown`: 导出当前活动路径。
  - `exportBranchAsMarkdown`: 导出指定分支。
  - `exportSessionAsMarkdownTree`: 以树状结构导出完整会话。
  - `exportBranchAsJson`: 导出分支为 JSON 数据。

## 10. 翻译服务

- **`useTranslation`**: **翻译服务核心**。
  - 封装了文本翻译的 LLM 请求逻辑。
  - 处理 XML 标签保护（如 `<think>`）。
  - 管理翻译模型和提示词配置。

## 11. 渲染引擎集成

富文本渲染引擎是一个**独立模块** [`src/tools/rich-text-renderer/`](../../../rich-text-renderer/)，详细内部架构见其自带的 [`ARCHITECTURE.md`](../../../rich-text-renderer/ARCHITECTURE.md)。本节聚焦 `llm-chat` 侧的**集成契约**：入口组件的 props、AST/Patch 类型来源、流式更新节流策略，以及代码块 / Mermaid / StyleNode 等关键节点的隔离机制。

### 11.1 `RichTextRenderer` 入口 props

[`RichTextRenderer.vue`](../../../rich-text-renderer/RichTextRenderer.vue) 同时支持「静态 content + isStreaming」与「订阅 streamSource」两种数据接入方式，关键 props 按用途分为以下几组：

- **内容输入**：`content?: string`（静态文本，默认与流式互斥）、`streamSource?: StreamSource`（可订阅的流数据源，存在时优先于 content）、`isStreaming?: boolean`（流式标记，控制思考块闭合、待定区呈现等行为，默认 false）。
- **解析与样式**：`version: RendererVersion`（默认 `V2_CUSTOM_PARSER`）、`llmThinkRules: LlmThinkRule[]`（识别 `<think>` / `<thinking>` 等思考标签的规则集，默认含 `standard-think`）、`styleOptions: RichTextRendererStyleOptions`（一组 CSS 变量映射，会被合成到 `cssVariables` 并作为根元素 style）、`regexRules: ChatRegexRule[]`（渲染阶段正则规则，在解析前对 content / buffer 应用 [`applyRegexRules`](../../utils/chatRegexUtils.ts)）。
- **资产与协议**：`resolveAsset?: (content: string) => string`（资产路径解析钩子，AST 模式下只对纯渲染器全局生效，AST 模式由 `ImageNode` 等具体节点按需调用以避免对 `agent-asset://` 链接的二次编码）、`allowDangerousHtml?: boolean`（是否允许危险 HTML 标签）、`allowExternalScripts?: boolean`（是否允许加载外部脚本/样式）、`enableCdnLocalizer?: boolean`（CDN 资源本地化）。
- **节流与性能**：`throttleMs?: number`（默认 80ms，传递给 `useMarkdownAst` 作为 patch flush 间隔上限）、`throttleEnabled?: boolean`（默认 true，关闭后 patch 立即应用，仍受 rAF 调度约束）、`smoothingEnabled?: boolean`（默认 true，启用 `StreamController` 对流式 chunk 做"打字机平滑"输出）、`safetyGuardEnabled?: boolean`（默认 true，启用解析器与 AST 状态的硬上限保护）、`verboseLogging?: boolean`（默认 false，启用后会刷屏打印解析/patch 调试日志）。
- **节点行为**：`defaultRenderHtml?: boolean`（自动预览完整 HTML 页面 / SVG）、`seamlessMode?: boolean`（HTML 预览无边框模式）、`defaultCodeBlockExpanded?: boolean`（代码块默认展开）、`defaultToolCallCollapsed?: boolean`（VCP 工具调用默认折叠）、`codeEditorEngine?: "monaco" | "codemirror"`（代码块底层引擎，默认 `codemirror`）、`shouldFreeze?: boolean`（HTML 预览冻结，配合长会话节流）、`showTokenCount?: boolean`（在代码块头部展示 Token 数）、`enableEnterAnimation?: boolean`（节点进入动画）、`generationMeta?: any`（携带 modelId 等信息供 Token 估算使用）。

### 11.2 AST 节点与 Patch 指令的类型来源

渲染器维护两套独立的类型族，分别用于「解析中间产物」与「渲染状态树」，需要区分以避免混淆。

- **Token 类型**（[`parser/types.ts`](../../../rich-text-renderer/parser/types.ts)）：`CustomParser` 内部的 25+ 种联合 Token（如 `text` / `newline` / `html_open` / `html_close` / `strong_delimiter` / `triple_delimiter` / `code_fence` / `katex_block` / `vcp_tool` / `vcp_role` / `vcp_daily_note` 等），**仅用于解析阶段**，外部不接触。
- **AST 节点类型**（[`types.ts` 的 `AstNode` 联合类型](../../../rich-text-renderer/types.ts:374)）：是 patch / diff / 渲染层共同消费的稳定结构，包含 30+ 种节点。按类别划分：
  - **内联节点**：`text` / `strong` / `em` / `strikethrough` / `quote` / `inline_code` / `link` / `html_inline` / `hard_break` / `generic_html` / `katex_inline`。
  - **基础块级节点**：`paragraph` / `heading` / `code_block` / `mermaid` / `list` / `list_item` / `image` / `video` / `audio` / `blockquote` / `alert` / `hr` / `html_block` / `table` / `table_row` / `table_cell` / `katex_block`。
  - **专属扩展节点**：`llm_think`（LLM 思考块）、`action_button`（可交互按钮）、`session_variable`（`<svar>` 标签可视化）、`vcp_tool`（VCP 工具调用块）、`vcp_role`（VCP 角色分割块）、`vcp_daily_note`（VCP 日记块）。
- **Patch 指令类型**（[`types.ts` 的 `Patch` 联合类型](../../../rich-text-renderer/types.ts:588)）：[`useMarkdownAst.applyPatches`](../../../rich-text-renderer/composables/useMarkdownAst.ts:289) 可识别的 8 种指令——`text-append`（追加文本，会被自动合并）、`set-prop`（设置节点属性）、`replace-node`（整体替换单个节点）、`insert-after` / `insert-before`（在指定节点前后插入新节点，支持递归到子节点查找）、`remove-node`（删除节点）、`replace-children-range`（替换指定父节点的子节点区段）、`replace-root`（替换整个根节点列表）。

### 11.3 流式更新节流策略

[`useMarkdownAst`](../../../rich-text-renderer/composables/useMarkdownAst.ts) 的核心调度循环：

- **核心调度循环基于 `requestAnimationFrame`** 实现，由 [`throttleTick`](../../../rich-text-renderer/composables/useMarkdownAst.ts:362) 在每帧检查 `performance.now() - lastFlushTime` 是否达到 `throttleMs`（默认 32ms，`RichTextRenderer` 传入 80ms）；未到时间则 `requestAnimationFrame(throttleTick)` 继续等下一帧，到时间或禁用节流时立即 `flushPatches()`。代码中保留的 `timeoutHandle` 字段是历史兼容残留，**实际调度只走 rAF**，不存在真正的"setTimeout + rAF 混合"实现。
- **三道安全护栏**保证极端场景下不卡死：
  - `MAX_QUEUE_SIZE = 1000`：[`enqueuePatch`](../../../rich-text-renderer/composables/useMarkdownAst.ts:403) 入队后若队列超过 1000 条立即同步 flush，避免单帧批处理过载。
  - `MAX_RAF_RETRIES = 1000`：单次未触达节流间隔的 rAF 重试上限，超出后强制 flush，防止"rAF 持续 < 16ms 节流间隔却跑不满"的死循环。
  - `MAX_TOTAL_NODES = 10_000_000`：每次 flush 后检查 `nodeMap.size`，触发上限调用 [`emergencyShutdown()`](../../../rich-text-renderer/composables/useMarkdownAst.ts:435) 进入降级，清空队列与 rAF 句柄，停止接受新 patch（但保留已渲染内容）。
- **`text-append` 合并优化**：flush 前 [`coalesceTextAppends`](../../../rich-text-renderer/composables/useMarkdownAst.ts:60) 会把连续命中同一节点 ID 的 text-append 指令合成一条，减少递归遍历次数。
- **不可变更新**：[`applySinglePatch`](../../../rich-text-renderer/composables/useMarkdownAst.ts:101) 全部走 `nodes.map(...)` + 浅拷贝路径，引用未变的子树直接复用，触发 `shallowRef` 比较跳过即可阻止下游 Vue 组件重渲染。
- **`dispose()`** 在 `onBeforeUnmount` 时主动清空 `ast.value` / `nodeMap` / 队列，缓解 WebView2 长会话内存压力。

### 11.4 关键节点的隔离与沙箱机制

富文本渲染器允许 LLM 输出动态 HTML / 样式 / 图表 / 代码 / 交互按钮，这些能力都通过独立的节点组件做收敛，避免污染宿主应用：

- **代码块 HTML 预览沙箱** ([`CodeBlockNode.vue`](../../../rich-text-renderer/components/nodes/CodeBlockNode.vue) → [`HtmlInteractiveViewer.vue`](../../../rich-text-renderer/components/HtmlInteractiveViewer.vue))：HTML / SVG 代码块的"预览模式"通过**真实 `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals">`** 装载，**不使用 Shadow DOM**。`sandbox` 属性的组合允许脚本与表单交互，同时由浏览器维持文档边界，阻止预览页面修改主应用 DOM、读取 cookie 等敏感资源；iframe 的运行时错误会被宿主捕获并在工具栏显示 `iframeErrors` 列表。
- **代码编辑器双引擎与延迟初始化** ([`MonacoSourceViewer.vue`](../../../rich-text-renderer/components/nodes/code-block/MonacoSourceViewer.vue) / [`CodeMirrorSourceViewer.vue`](../../../rich-text-renderer/components/nodes/code-block/CodeMirrorSourceViewer.vue))：按 `codeEditorEngine` prop 二选一加载，编辑器本身在组件进入视口后通过 `IntersectionObserver` 延迟创建实例，避免长会话中所有代码块同时实例化的内存峰值。
- **Mermaid 延迟加载** ([`MermaidNode.vue`](../../../rich-text-renderer/components/nodes/MermaidNode.vue))：通过 `onMounted` 内的 `await import("mermaid")` **动态分包导入**，Mermaid 主模块仅在首个图表节点挂载时才被网络/磁盘加载并执行 `initialize`，常规消息列表不会引入这份较重的依赖。同时配合"流式状态自动剥离末尾未完成行"、"渲染失败自动调用 `fixMermaidCode` 二次尝试"、以及 `lastRenderId` 并发标识，保证流式期不会反复抛错。
- **动态 CSS 作用域隔离** ([`StyleNode.vue`](../../../rich-text-renderer/components/nodes/StyleNode.vue) + [`cssUtils.scopeCss`](../../../rich-text-renderer/utils/cssUtils.ts:12))：把 LLM 输出的 `<style>` 内容通过隐藏锚点 `<span id="style-scope-xxxx">` 加缀为 `#style-scope-xxxx ~ {sel}, #style-scope-xxxx ~ * {sel}` 形式，让样式只命中该锚点之后的兄弟节点；同时对 `:root` / `html` / `body` 选择器进行重定向到容器、`@keyframes` / `@font-face` 内部跳过加缀、检测到孤立 `fadeIn` keyframes 时自动补一条 `animation: fadeIn 0.8s ease-out both;` 防漏接。这是**"软隔离"**——浏览器层面没有 Shadow DOM 边界，但通过选择器加缀让样式不会轻易逃逸到宿主 UI。
- **可交互按钮安全收敛** ([`ActionButtonNode.vue`](../../../rich-text-renderer/components/nodes/ActionButtonNode.vue))：详见 [`chat-area-ui.md`](./chat-area-ui.md) 的"可交互按钮安全策略"小节，其通过 `toolRegistryManager.getRegistry<LlmChatRegistry>("llm-chat")` 间接调用聊天服务，**完全不直接依赖 store 内部实现**，符合渲染器与业务解耦原则。

## 12. 对话树图逻辑 (Tree Graph Logic)

- **`useFlowTreeGraph`**: **树图逻辑入口 (Facade)**。整合物理引擎、交互行为和数据转换，对外提供统一接口。
- **`useGraphD3Simulation`**: **物理仿真核心**。基于 D3.js 实现高性能的节点布局计算，支持自定义重力场。
- **`useGraphConnectionPreview`**: **连线交互引擎**。负责节点间的嫁接（Graft）与移动（Move）逻辑及实时预览。
- **`useGraphSubtreeDrag`**: **批量拖拽处理器**。支持带修饰键的子树整体拖拽位移计算。
- **`graphContentUtils`**: **内容解析工具**。处理树图节点内的思考块剥离、角色头像解析等纯逻辑。
