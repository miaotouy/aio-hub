# LLM Inspector 2.0：分批改造主清单 (Master Plan)

> **状态**: Living Document (持续演进) — 跟随施工进度更新
> **创建时间**: 2026-06-01
> **最后更新**: 2026-06-01
> **作者**: 咕咕 (Architect)
> **取代**: [`llm-inspector-internal-monitoring.md`](./llm-inspector-internal-monitoring.md:1)（架构层）+ [`llm-inspector-llm-aware-detail-upgrade.md`](./llm-inspector-llm-aware-detail-upgrade.md:1)（视图层）
> **施工方**: AI（按本清单分 commit 推进，但允许灵活调整 — 见 §0.2）

---

## 0. 阅读须知

### 0.1. 原子提交的硬约束（不可妥协）

本文档以**单次原子提交 (atomic commit)** 为最小颗粒。每个任务必须满足以下**四条硬约束**：

1. **自我完整**：合入后仓库能编译、能运行、不引入断头代码。
2. **行为可解释**：要么"纯加法"（新增文件，零调用），要么"行为可开关"（默认 OFF），要么"等价重构"（外部行为不变）。
3. **可独立 revert**：单独回滚不留下需要二次清理的孤儿。
4. **review 友好**：单 commit 改动面尽量集中在 1-3 个文件 / 1 个职责。

> 这四条是**底线**。任何施工调整都不能破坏这四条，否则要拆分或合并任务直到满足为止。

### 0.2. 灵活施工准则（鼓励应变）

本文档是**地图，不是合同**。施工过程中遇到以下情况，**鼓励主动调整并标注**：

| 情况                                           | 应对方式                                                         | 是否需更新文档                 |
| :--------------------------------------------- | :--------------------------------------------------------------- | :----------------------------- |
| 发现任务实际范围比预期大                       | 拆成 X.a / X.b / X.c 多个子提交                                  | ✅ 在 §15 变更日志记录拆分理由 |
| 发现任务实际范围比预期小，且与下一任务高度耦合 | 合并为单个 commit（需仍满足 §0.1 四条）                          | ✅ 在 §15 变更日志记录合并理由 |
| 发现新的前置依赖（如必须先改某个 Composable）  | 在依赖任务前插入新任务（编号取相邻字母 + 数字，如 A1.5）         | ✅ 在 §15 记录新增任务         |
| 发现某个任务已不再必要（如现状已满足）         | 标记为 `[已跳过]` 但保留任务条目供追溯                           | ✅ 在 §15 记录跳过原因         |
| 发现原计划方案有缺陷（如选错了 API）           | 修改任务描述 + 在条目下加 `> ⚠️ 修订: ...` 注释，并在 §15 总结   | ✅ 必须记录                    |
| 发现新需求 / 新风险 / 新坑                     | 在对应 Group 末尾追加任务，或新增 Group                          | ✅ 在 §15 记录新增条目         |
| 实施时某个文件路径与文档不符                   | 直接采用实际路径施工，在 commit message 注明，文档可批量回头更新 | ⏸️ 可批量延后更新              |

**核心原则**：

- 调整不是失败，是对现实的诚实回应。
- 但调整必须**留痕**，让后来者（包括姐姐自己 review、未来重启项目时）能看懂"为什么从 A 改成了 B"。
- 调整完一组后，建议用 `attempt_completion` 同步一次现状，让姐姐有 review 机会。

### 0.3. 任务编号约定

- 字母 (A/B/C/...) = Group 分组，跨组按依赖箭头顺序。
- 数字 (1/2/3/...) = Group 内任务序号，同 Group 内可灵活调换顺序。
- 字母数字 + 小数 (如 A1.5) = 施工中插入的新任务。
- 字母数字 + 字母 (如 B4.a / H1.a) = 一个任务拆分出的子任务。

---

## 1. 总体依赖图

```
A (基础设施 / 纯新增)
   │
   ├─→ B (钩子注入，开关 OFF 等于 no-op)
   │     │
   │     └─→ C (Inspector 接钩子，旧 UI 可见内部请求)
   │           │
   │           └─→ D (UI Layout 2.0 重构)
   │                 │
   │                 └─→ E (RecordDetail 4-Tab 化)
   │                       │
   │                       └─→ F (Token & 元数据增强卡片)
   │
   └─→ G (收尾 / 文档 / 体验小修)

H (可选 P2，单独立项)
```

**关键节点**：

- **B 全部合入即可发布 v2.0-α**（仅内部监控能力，UI 不变）。
- **D 全部合入即可发布 v2.0-β**（新 UI + 内部监控，详情仍是裸 JSON）。
- **F 全部合入即可发布 v2.0**（LLM 语义化详情完成）。

---

## 2. Group A — 基础设施层（纯新增，零风险）

> 全组 commit 都是**新增独立文件**，不修改任何现有代码，不会被任何引用方调用。每个都可独立 review/merge/revert。

### A1. `feat(llm-inspector): 新增 hookRegistry 钩子注册器与事件契约`

- **新增**:
  - [`src/tools/llm-inspector/types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts) — `InspectorRequestEvent` / `InspectorResponseEvent` / `InspectorStreamEvent` / `InspectorHooks` / `InspectorState` / `ProxyStatus` 类型定义。
  - [`src/tools/llm-inspector/core/hookRegistry.ts`](src/tools/llm-inspector/core/hookRegistry.ts) — 单例 `inspectorHookRegistry`，提供 `register / shouldCaptureInternal / triggerRequest / triggerResponse / triggerStream / triggerError`，每个 trigger 内部同时调用本地回调和 Tauri `emit`。
- **不修改**: 任何现有文件。
- **验收**: `check:frontend` 通过；新文件无引用方；运行时不被调用。
- **回滚**: `git revert` 即可，零副作用。

### A2. `feat(llm-inspector): 新增 messageParser 请求/响应消息块解析器`

- **新增**: [`src/tools/llm-inspector/core/messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts)
  - `parseRequestMessages(body, format): RequestParseResult`
  - `parseResponseMessages(body, format): ResponseParseResult`
  - 复用 [`utils.ts:225`](src/tools/llm-inspector/core/utils.ts:225) 的 `detectApiFormat` 与各格式提取器。
- **新增类型**: `ParsedMessage` / `RequestParseResult` / `ResponseParseResult` 追加到 [`types.ts`](src/tools/llm-inspector/types.ts:1)（向后兼容追加，不改现有类型）。
- **不修改**: 任何调用方。
- **验收**: 写单测覆盖 OpenAI Chat / Anthropic / Gemini 三种格式的请求/响应解析。
- **回滚**: 纯新增可 revert。

### A3. `feat(llm-inspector): 新增 tokenEstimator 客户端估算与服务端 usage 提取`

- **新增**: [`src/tools/llm-inspector/core/tokenEstimator.ts`](src/tools/llm-inspector/core/tokenEstimator.ts)
  - `estimateMessages(messages, model): Promise<{ text, attachment, total, algorithm }>` — 复用 [`tokenCalculatorEngine`](src/tools/token-calculator/core/tokenCalculatorEngine.ts:656) 单例。
  - `extractServerUsage(responseBody, format): { promptTokens, completionTokens, totalTokens } | null` — 三家格式各自的 `usage` 字段提取。
  - **附件估算暂留 stub**，先返回 0，避免依赖未完成的多模态策略（F2/F3 再实装）。
- **依赖**: 复用现有 token-calculator 工具链（无需新装依赖）。
- **验收**: 单测验证 `extractServerUsage` 在三家格式都能拿到非空结果；`estimateMessages` 调用通畅。
- **回滚**: 纯新增可 revert。

---

## 3. Group B — 钩子注入层（接入但默认 OFF）

> 全组 commit 在合入后行为**不发生变化**（默认开关 OFF），仅当后续 C/D 开启开关时才生效。

### B1. `feat(llm-apis): 扩展 LlmRequestOptions 加 inspectorContext 字段`

- **修改**: [`src/llm-apis/common.ts`](src/llm-apis/common.ts:132) — `LlmRequestOptions` 接口追加可选字段：
  ```ts
  inspectorContext?: {
    sessionId?: string;
    toolName?: string;
    purpose?: string;  // 如 "chat" / "translate" / "regen-title"
  };
  ```
- **关键点**: **不能复用现有 `metadata` 字段**，该字段已被透传给 OpenAI/Anthropic 的 `metadata` API 参数，混用会污染 LLM 请求。
- **不修改**: 任何调用方（字段是可选）。
- **验收**: `check:frontend` 通过；现有所有 `useLlmRequest` 调用零变化。
- **回滚**: 纯加字段可 revert。

### B2. `feat(llm-apis): fetchWithTimeout 注入 inspector 钩子触发点`

- **修改**: [`fetchWithTimeout()`](src/llm-apis/common.ts:697) 加三个埋点：
  - 进入函数：`if (inspectorHookRegistry.shouldCaptureInternal()) triggerRequest(...)`
  - 拿到 response：克隆 + `triggerResponse(...)`（**只有开关 ON 时才 clone**，避免常态性能开销）
  - catch 块：`triggerError(...)`
- **修改**: [`src/llm-apis/common.ts`](src/llm-apis/common.ts:1) import `inspectorHookRegistry`。
- **关键点**:
  - 必须在**真正发起 fetch 的两个分支**（代理分支 + 直连分支）都埋点，且在**统一入口**生成 requestId，确保流式 chunk 能正确关联。
  - 开关默认 OFF → 三个判断都是 `false` → no-op，行为完全不变。
- **不修改**: 调用方。
- **验收**:
  - `check:frontend` 通过；
  - 现有 LLM 适配器测试（[`__tests__/chat.test.ts`](src/llm-apis/adapters/openai/__tests__/chat.test.ts:1) 等）全绿；
  - 手工验证：开关 OFF 时，llm-chat 发请求行为完全不变。
- **回滚**: 单独 revert，开关已默认 OFF，无副作用残留。

### B3. `feat(useLlmRequest): 透传 inspectorContext + 自动补 profileId/modelId/requestId`

- **修改**: [`src/composables/useLlmRequest.ts`](src/composables/useLlmRequest.ts:38) — `sendRequest` 内：
  - 若 `options.inspectorContext` 已传，原样透传；
  - 自动补 `profileId / modelId / requestId`（这些已在 options 里）到一个合并后的 `inspectorContext`，由 `fetchWithTimeout` 在 trigger 时塞入 `InspectorRequestEvent.metadata`。
- **不修改**: 调用方。
- **验收**: `check:frontend` 通过。
- **回滚**: 单独 revert。

### B4 ~ B4.N. `feat({tool}): 在 LLM 调用入口标注 inspectorContext.toolName`

> 一个工具一个提交，按需推进，互不阻塞。即使只完成部分，其他工具的内部请求也只是显示为 `internal:unknown`，不影响整体能力。

- **B4.a**: `llm-chat` —— 在 [`useChat`](src/tools/llm-chat/composables/useChat.ts) 系列发请求处加 `inspectorContext: { toolName: "llm-chat", sessionId: ..., purpose: "chat" }`。
- **B4.b**: `translator` —— 翻译/扫描请求加 `toolName: "translator"`。
- **B4.c**: `vcp-connector` —— 加 `toolName: "vcp-connector"`。
- **B4.d**: `tool-calling`、`embedding-playground`、`media-generator` 等其他 LLM 消费者 —— 按需逐个加。
- **特殊**: 模型列表获取、Profile 探测等"非用户语义"请求加 `purpose: "system-probe"`，便于 UI 过滤。
- **验收**: 每个 commit 后该工具行为不变。

---

## 4. Group C — Inspector 数据层（接入钩子，旧 UI 复用）

> 完成本组后，**只要打开总开关，旧 UI 就能看到内部请求**，先验证链路再动 UI。

### C1. `feat(llm-inspector): recordManager 支持 source 字段与内部记录注入`

- **修改**: [`types.ts`](src/tools/llm-inspector/types.ts:42) — `CombinedRecord` 追加：
  ```ts
  source?: "internal" | "external";
  inspectorMetadata?: { profileId?: string; modelId?: string; sessionId?: string; toolName?: string; purpose?: string };
  ```
  （可选字段，向后兼容；外部 Rust Proxy 来的记录 source 设为 `"external"`，未标注的视为 external）。
- **修改**: [`recordManager.ts`](src/tools/llm-inspector/core/recordManager.ts:1) — `addRequestRecord` 接受可选 source/metadata；`getFilteredRecords` 不变。
- **不修改**: 旧的 Rust event 路径继续传 external 记录。
- **验收**: 旧 UI 行为完全不变；现有外部代理请求显示正常。
- **回滚**: 单独 revert。

### C2. `feat(llm-inspector): 新增 useInternalMonitor composable`

- **新增**: [`src/tools/llm-inspector/composables/useInternalMonitor.ts`](src/tools/llm-inspector/composables/useInternalMonitor.ts)
  - 注册本地钩子（同窗口零延迟）→ 写入 recordManager（source: internal）。
  - 监听 Tauri event `inspector:request/response/stream/error` → 同样写入 recordManager（**通过 event id 去重，避免主窗口双倍记录**）。
  - `onUnmounted` 清理。
- **修改**: [`useProxyManager.ts`](src/tools/llm-inspector/composables/useProxyManager.ts:31)（暂未改名）—— 在 `useInspectorManager` 内调用 `useInternalMonitor()`。
- **验收**:
  - 打开 `inspectorHookRegistry.enable()` 后，llm-chat 发送消息会在 inspector 列表里出现，标签显示 internal；
  - 关闭后 llm-chat 行为不变，inspector 不收新记录。
- **回滚**: 单独 revert。

### C3. `refactor(llm-inspector): useProxyManager 扩展状态机 (isGlobalEnabled / monitorInternal / monitorExternal / externalProxyStatus)`

- **修改**: [`useProxyManager.ts`](src/tools/llm-inspector/composables/useProxyManager.ts:1) —— 内部加 `state: InspectorState`，保留旧 `isRunning` 为 `computed(() => state.externalProxyStatus === RUNNING)` 兼容旧 UI。
- **不变更**: 对外 API 字段名兼容（D3 重构 UI 时再删除旧字段）。
- **验收**: 旧 UI 行为不变；新增 state 可被未来 UI 读取。
- **回滚**: 单独 revert。

> **里程碑 v2.0-α**: 合到 C3 即可发布"内部监控可用 + 旧 UI"的版本，先在内部使用验证。

---

## 5. Group D — UI Layout 2.0（核心重构）

> 本组是破坏性重构，但严格遵循"先建新组件 → 再切换挂载"的模式，每步都能 revert。

### D1. `feat(llm-inspector): 新增 HeaderToolbar 组件（左总控 / 中模式切换 / 右操作）`

- **新增**: [`src/tools/llm-inspector/components/HeaderToolbar.vue`](src/tools/llm-inspector/components/HeaderToolbar.vue)
  - 左：`[●] INSPECTOR` 总开关（呼吸灯）。
  - 中：`[内置监控]` / `[外部代理]` 两个 toggle，前者瞬间切换，后者带 loading 状态（依赖 C3 的 state.externalProxyStatus）。
  - 右：搜索按钮（展开为 input）、清空按钮、`[⚙️]` 设置按钮。
- **不挂载**: 组件创建但不在 `LlmInspector.vue` 中使用。
- **验收**: 组件可单独 mount 看效果（可写 dev-only 路由或 storybook 风格 demo，但不必强求）。
- **回滚**: 纯新增可 revert。

### D2. `feat(llm-inspector): 新增 SettingsDrawer 组件（端口 / Target / Header 规则 / 打码）`

- **新增**: [`src/tools/llm-inspector/components/SettingsDrawer.vue`](src/tools/llm-inspector/components/SettingsDrawer.vue)
  - 复用现有 [`HeaderOverrideDialog.vue`](src/tools/llm-inspector/components/HeaderOverrideDialog.vue:1) 的表单内容。
  - 使用 `BaseDialog` 或 Element Plus `el-drawer` + `:lock-scroll="false"`（参考规范）。
- **不挂载**: 同上。
- **回滚**: 纯新增可 revert。

### D3. `refactor(llm-inspector): LlmInspector.vue 切换到 Header + Split + Drawer 主布局`

- **修改**: [`LlmInspector.vue`](src/tools/llm-inspector/LlmInspector.vue:1) —— 全量重写 template 与 style：
  - 顶部 48px Header 替换原 `config-panel`；
  - 主区改为 Split View（25% 列表 / 75% 详情），用 `<div class="split-pane">` + CSS Grid `1fr 3fr`；
  - 配置 Drawer 由 `[⚙️]` 触发。
- **删除**: 原有 `<div class="config-panel">` 及其所有表单（已迁入 SettingsDrawer）。
- **保留**: `HeaderOverrideDialog` 继续可被 Drawer 内按钮触发（或将其内联进 Drawer，二选一）。
- **关键点**: 此 commit **破坏性**，但 D1/D2 已就绪，可独立完整 revert 到旧 UI。
- **验收**:
  - 主页打开 inspector 工具，新布局正常；
  - 启停内部/外部监控均工作；
  - 记录列表与详情面板可正常选择查看；
  - 主题外观（透明度、模糊）三档切换显示正常。
- **回滚**: 单 commit revert 即可恢复旧 UI。

### D4. `feat(llm-inspector): Split View 加可拖拽分割条与比例持久化`

- **新增**: [`src/tools/llm-inspector/composables/useSplitPane.ts`](src/tools/llm-inspector/composables/useSplitPane.ts) — 拖拽逻辑 + `localStorage` 或 settings 文件持久化（建议放进 `LlmInspectorSettings.layout.splitRatio`）。
- **修改**: [`configManager.ts`](src/tools/llm-inspector/core/configManager.ts:1) 与 [`types.ts`](src/tools/llm-inspector/types.ts:54) 追加 `layout?: { splitRatio: number }`。
- **修改**: [`LlmInspector.vue`](src/tools/llm-inspector/LlmInspector.vue:1) 引入分割条。
- **验收**: 拖动正常、双击恢复默认、刷新后比例保持。
- **回滚**: 单独 revert（已是 D3 之后的独立增量）。

> **里程碑 v2.0-β**: 合到 D4 即可发布"新 UI + 内部监控"，详情仍是旧裸 JSON 模式。

---

## 6. Group E — RecordDetail 4-Tab 化

> 严格遵循"先包一层，再逐 Tab 加新内容"。

### E1. `refactor(llm-inspector): RecordDetail 拆出 RecordOverviewTab 组件（行为不变）`

- **新增**: [`src/tools/llm-inspector/components/detail/RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue) —— 把现有 [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) 内 `请求信息 / 响应信息 / 请求体 / 响应体` 完整搬过去。
- **修改**: [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) —— 顶层包一层 `<el-tabs>`，目前只有 `总览` 一个 tab，内容就是 `<RecordOverviewTab>`。
- **关键点**: 这是**纯结构搬迁**，外观与行为零变化。
- **验收**: 详情面板视觉与功能完全等价于改造前。
- **回滚**: 单独 revert。

### E2. `feat(llm-inspector): 新增 StructuredMessagesView 与 RecordStructuredTab`

- **新增**:
  - [`src/tools/llm-inspector/components/detail/StructuredMessagesView.vue`](src/tools/llm-inspector/components/detail/StructuredMessagesView.vue) —— 通用消息块渲染：横向锚点 sticky tabs + 搜索框 + 角色色彩卡片列表。
  - [`src/tools/llm-inspector/components/detail/RecordStructuredTab.vue`](src/tools/llm-inspector/components/detail/RecordStructuredTab.vue) —— 调用 `parseRequestMessages` + `StructuredMessagesView`。
- **修改**: [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) 加 `结构化` tab。
- **样式规范**:
  - 角色色彩：system→info / user→success / assistant→primary；
  - 严禁 `--el-color-X-light-9`，使用 `rgba(var(--el-color-X-rgb), calc(var(--card-opacity) * 0.1))` 模式；
  - 与 context-analyzer 视觉差异化：本工具卡片打 `🌐 真实` 徽章（context-analyzer 是 `📐 预测`）。
- **验收**: OpenAI Chat / Anthropic / Gemini 三种请求都能正常结构化展示；21+ 消息的长对话滚动顺畅。
- **回滚**: 单独 revert（删 Tab + 删两个组件文件）。

### E3. `feat(llm-inspector): 结构化 Tab 加入响应消息块渲染`

- **修改**: [`RecordStructuredTab.vue`](src/tools/llm-inspector/components/detail/RecordStructuredTab.vue:1) 增加调用 `parseResponseMessages`，把响应消息（含 reasoning / tool_calls / refusal / thinking）渲染在请求消息之后。
- **复用**: 同一个 `StructuredMessagesView`。
- **验收**: 含 reasoning 的 o1 响应、含 tool_calls 的响应、含 thinking 的 Claude 响应均正常展示。
- **回滚**: 单独 revert。

### E4. `refactor(llm-inspector): 拆出 RawTab 与 StreamTab（流式专属）`

- **新增**:
  - [`components/detail/RecordRawTab.vue`](src/tools/llm-inspector/components/detail/RecordRawTab.vue) —— 把原 RecordDetail 的"原始 / 正文模式"切换搬过去（即现有 `displayResponseBody` / `extractedContent` 那套）。
  - [`components/detail/RecordStreamTab.vue`](src/tools/llm-inspector/components/detail/RecordStreamTab.vue) —— 仅当 `isStreamingResponse` 时显示，专门展示 SSE chunk 累积的实时打字机视图。
- **修改**: [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) tabs 拆为 `总览 / 结构化 / 原始 / 流式`；流式 tab 用 `v-if` 控制可见性。
- **验收**: 流式响应实时显示在流式 tab；非流式响应仅显示前三个 tab。
- **回滚**: 单独 revert。

---

## 7. Group F — Token 与元数据增强

### F1. `feat(llm-inspector): 总览 Tab 加 Token 客户端估算卡`

- **修改**: [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:1) 加 Token 统计区，调用 `tokenEstimator.estimateMessages`，展示：
  - 文本 Token（估算）+ 算法标识 Tag。
  - 附件 Token 显示 `--`（待 F3 实装）。
- **修改**: 估算结果缓存到 `record.tokenEstimate`，避免切换 record 重复计算。
- **验收**: 切换记录估算秒出；同一记录重复打开走缓存。
- **回滚**: 单独 revert。

### F2. `feat(llm-inspector): Token 卡加服务端 usage 提取与偏差对比`

- **修改**: [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:1) 在估算下方加：
  - `服务端 usage`: `prompt_tokens / completion_tokens / total`（从 `extractServerUsage` 拿）。
  - 偏差 > 5% 时高亮 + tooltip 提示"可能 tokenizer 选错"。
- **验收**: 三家格式都能正确读取 usage；偏差计算正确。
- **回滚**: 单独 revert。

### F3. `feat(llm-inspector): 请求来源链路卡（依赖 C2 metadata）`

- **修改**: [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:1) 顶部加来源卡：
  - `[internal]` 链路示例：`llm-chat · Profile:OpenAI · Model:gpt-4-turbo · Session:xxx`
  - `[external]` 链路示例：`http://localhost:8999 → https://api.openai.com (Header 覆盖: 2 条)`
- **修改**: 列表项 [`RecordsList.vue`](src/tools/llm-inspector/components/RecordsList.vue:1) 加来源标签。
- **验收**: 内部 / 外部记录都显示正确来源信息。
- **回滚**: 单独 revert。

### F4. `feat(llm-inspector): 详情页加 "重新解析" 按钮`

- **修改**: [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) 标题栏加 `[🔄]` 按钮，触发后清除 `record.tokenEstimate / record.parseResult` 缓存重算。
- **附**: 设置抽屉里加"默认 tokenizer 算法"选项（参考 token-calculator），切换后此按钮重算用新算法。
- **验收**: 点击后估算重算；切换算法后偏差变化。
- **回滚**: 单独 revert。

---

## 8. Group G — 收尾 / 文档 / 小修

### G1. `feat(llm-inspector): 时间显示升级（ISO 8601 + 相对时间）`

- **修改**: [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:1) 时间字段加 ISO 8601 完整精度（毫秒）+ 相对时间（"3 秒前"），用 date-fns 实现。
- **修改**: [`RecordsList.vue`](src/tools/llm-inspector/components/RecordsList.vue:1) 保持 `HH:mm:ss`，tooltip 显示完整 ISO。
- **回滚**: 单独 revert。

### G2. `feat(llm-inspector): 总览卡显式展示 Stream 状态`

- **修改**: [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:1) 请求信息加 `Stream: true (按配置)` / `false`，判断来源：
  - request body `stream: true` 字段；
  - response headers `content-type: text/event-stream`；
  - 运行时 `streamProcessor.isStreamingRecord()` 状态。
- **回滚**: 单独 revert。

### G3. `docs(llm-inspector): 更新 ARCHITECTURE.md 反映 2.0 架构`

- **修改**: [`ARCHITECTURE.md`](src/tools/llm-inspector/ARCHITECTURE.md:1) —— 增加：
  - 双层监控（外部 Proxy + 内部钩子）说明；
  - 跨窗口 Event 广播机制；
  - 新 UI Layout（Header + Split + Drawer）说明；
  - 4-Tab RecordDetail 结构；
  - Token 估算与对比能力。
- **回滚**: 文档 revert。

### G4. `chore(llm-inspector): 归档已合并的旧 plan 文档`

- **修改**:
  - [`plan/llm-inspector-internal-monitoring.md`](src/tools/llm-inspector/plan/llm-inspector-internal-monitoring.md:1) — 顶部加 `> **状态**: Archived，已合并入 llm-inspector-2.0-master-plan.md`。
  - [`plan/llm-inspector-llm-aware-detail-upgrade.md`](src/tools/llm-inspector/plan/llm-inspector-llm-aware-detail-upgrade.md:1) — 同样加归档标记。
- **保留文件**: 用于追溯设计推演过程，不删除。
- **回滚**: 文档 revert。

> **里程碑 v2.0 GA**: 合到 G4 即可作为正式版本发布。

---

## 9. Group H — 可选 P2（独立立项，本期不强求）

### H1. `feat(llm-inspector): TTFB 与首 token 延迟统计`

- **涉及 Rust 改动**: `StreamUpdate` 结构加 `chunk_timestamp` 字段；前端在收到第一个非空 chunk 时计算首 token 延迟。
- **单独立项**：跨 Rust+前端的提交建议拆为：
  - H1.a `feat(rust): StreamUpdate 加 chunk_timestamp 字段`；
  - H1.b `feat(llm-inspector): 总览卡加 TTFB / 首 token 延迟`。

### H2. `feat(llm-inspector): 列表上方加 Token 趋势 mini-chart`

- 用 echarts 折线图展示最近 N 条请求 token 消耗趋势。

### H3. `feat(llm-inspector): 请求重放与请求对比`

- 选中记录后可"重发"或"与另一条对比"。

---

## 10. 不实施清单

| 项                                               | 不实施原因                                               |
| :----------------------------------------------- | :------------------------------------------------------- |
| VCP 的"刷新列表"按钮                             | 列表已是响应式推送（事件驱动），无需手动刷新             |
| 把内部监控用 LlmRequestOptions.metadata 字段携带 | 该字段已被 OpenAI/Anthropic API 占用，混用会污染请求     |
| 直接抄 context-analyzer 视觉                     | 两者定位不同（预测 vs 复盘），视觉需差异化以避免用户混淆 |

---

## 11. 提交规范

每个 commit message 遵循项目根 `.kilocode/rules/rules.md` 的规范，建议格式：

```
<type>(llm-inspector): <简短中文描述>

<可选：动机 / 关键决策 / 注意事项>

Refs: src/tools/llm-inspector/plan/llm-inspector-2.0-master-plan.md#<任务编号>
```

**type 取值**：

- `feat`: 新增功能（A1-A3, B*, C*, D*, E2-E4, F*, G1/G2, H\*）
- `refactor`: 等价重构（C3, D3, E1, E4 部分）
- `docs`: 文档（G3）
- `chore`: 杂项（G4）

每个 commit **只引用本任务编号**，避免一次提交关联多个任务。

---

## 12. 验收闭环

每个 commit 合入前**必须**：

1. `bun run check:frontend` 通过；
2. 若涉及 Rust：`bun run check:backend` 通过；
3. 若涉及测试相关文件：`bun run test:run` 通过；
4. 手工验证本任务"验收"小节列出的要点；
5. 视觉变更需在透明度 0% / 50% / 100% 三档下检查显示正常。

---

## 13. 总结：本计划相对原两份 plan 的关键改进

1. **修正了 metadata 字段冲突**：原计划要直接用 `LlmRequestOptions.metadata`，实际该字段已被 OpenAI API 占用，本计划改用 `inspectorContext`。
2. **修正了 token-calculator 依赖**：原计划提到 `@dqbd/tiktoken`，实际项目用的是 `transformers.js` + huggingface profile 机制（[`tokenCalculatorEngine`](src/tools/token-calculator/core/tokenCalculatorEngine.ts:656)），需复用而非新引入依赖。
3. **明确了破坏性步骤的隔离**：D3 是唯一一个"破坏性 UI 切换"，前置 D1/D2 已建好新组件，可独立 revert。
4. **按 atomic commit 切分**：每个任务自包含、可独立 review、可独立回滚。
5. **三个里程碑节点**：α (C3) / β (D4) / GA (G4)，每个节点都可发布可用版本。
6. **保留旧 plan 作为设计推演记录**：归档而非删除，便于回溯当初的思考过程。

---

## 14. 进度追踪

> 每完成一个任务，把状态标记从 `[ ]` 改为 `[x]`；遇到调整在 §15 留痕。

### Group A — 基础设施

- [x] A1. hookRegistry 钩子注册器与事件契约
- [x] A2. messageParser 请求/响应消息块解析器
- [x] A3. tokenEstimator 客户端估算与服务端 usage 提取

### Group B — 钩子注入

- [x] B1. LlmRequestOptions 加 inspectorContext 字段
- [x] B2. fetchWithTimeout 注入钩子触发点
- [x] B3. useLlmRequest 透传 inspectorContext
- [x] B4.a. llm-chat 标注 toolName
- [x] B4.b. translator 标注 toolName
- [已跳过] B4.c. vcp-connector 标注 toolName（不直接调用 useLlmRequest/sendRequest，详见 §15）
- [x] B4.d. 其他 LLM 消费者（settings/smart-ocr/transcription/media-generator/knowledge-base）

### Group C — Inspector 数据层

- [x] C1. recordManager 支持 source 字段
- [x] C2. 新增 useInternalMonitor composable
- [x] C3. useProxyManager 扩展状态机
- [x] 🏁 **里程碑 v2.0-α**

### Group D — UI Layout 2.0

- [x] D1. HeaderToolbar 组件
- [x] D2. SettingsDrawer 组件
- [x] D3. LlmInspector.vue 主布局切换
- [x] D4. Split View 拖拽与持久化
- [x] 🏁 **里程碑 v2.0-β**

### Group E — RecordDetail 4-Tab

- [x] E1. 拆出 RecordOverviewTab
- [x] E2. StructuredMessagesView + RecordStructuredTab
- [x] E3. 响应消息块渲染
- [x] E4. 拆出 RawTab 与 StreamTab

### Group F — Token 与元数据增强

- [ ] F1. Token 客户端估算卡
- [ ] F2. 服务端 usage 提取与偏差对比
- [ ] F3. 请求来源链路卡
- [ ] F4. 重新解析按钮

### Group G — 收尾

- [ ] G1. 时间显示升级
- [ ] G2. 总览卡显式展示 Stream 状态
- [ ] G3. 更新 ARCHITECTURE.md
- [ ] G4. 归档旧 plan 文档
- [ ] 🏁 **里程碑 v2.0 GA**

### Group H — P2 可选

- [ ] H1.a. Rust StreamUpdate 加 chunk_timestamp
- [ ] H1.b. 总览卡加 TTFB / 首 token 延迟
- [ ] H2. Token 趋势 mini-chart
- [ ] H3. 请求重放与对比

---

## 15. 变更日志 (Changelog)

> 施工过程中对本计划的所有调整都在此记录。每条记录格式：
>
> ```
> ### YYYY-MM-DD — <调整类型> <任务编号> <一句话标题>
>
> **背景**: 施工时遇到了什么 / 发现了什么
> **决策**: 怎么调整的
> **影响**: 对后续任务有什么影响（如有）
> ```

### 2026-06-01 — 文档创建

- 整合 [`llm-inspector-internal-monitoring.md`](./llm-inspector-internal-monitoring.md:1) 与 [`llm-inspector-llm-aware-detail-upgrade.md`](./llm-inspector-llm-aware-detail-upgrade.md:1)，按 atomic commit 切分成 A-H 七组任务。
- 修正了原计划中 `metadata` 字段冲突、`@dqbd/tiktoken` 误用、UI 重构工作量低估 三个坑。

### 2026-06-01 — 加入灵活施工机制

- 在 §0 加入 0.2 灵活施工准则，明确"调整可，留痕必须"。
- 加入 §14 进度追踪与 §15 变更日志。
- 状态从 `Draft (RFC)` 改为 `Living Document`。

### 2026-06-01 — 完成 Group A（A1/A2/A3）

**背景**: 按计划逐个推进 Group A 三个 atomic commit，全程未偏离计划。
**决策**:

- A1 hookRegistry：按计划实现，新增 `types/hooks.ts` 与 `core/hookRegistry.ts`。
  附加微调：emit 跨窗口广播失败时降级为 debug 日志（避免非 Tauri 环境噪音），
  并新增 `INSPECTOR_INTERNAL_EVENT` 常量集，明确区分内部钩子事件与 Rust 外部
  代理已有的 `inspector-request` 等事件名（前缀 `inspector:internal:`）。
- A2 messageParser：按计划实现，types.ts 向后兼容追加 `ParsedMessage` 等类型，
  解析器覆盖 OpenAI Chat/Responses/Completions、Anthropic、Gemini、Cohere、
  Ollama 五大格式 + 通用兜底。新增 18 个单测全部通过。
- A3 tokenEstimator：按计划实现，复用 `tokenCalculatorEngine` 单例；附件估算
  按计划留 stub 返回 0；新增 16 个单测覆盖三家 usage 提取 + estimateMessages
  路径，全部通过。
  **影响**: Group A 全部为新增独立文件，零运行时影响。`check:frontend` 与
  `test:run` 全部通过；不修改任何现有代码逻辑。后续 Group B 可基于此基础设施
  开始接入 fetchWithTimeout。

### 2026-06-01 — 完成 Group B（B1/B2/B3/B4.a/B4.b/B4.d）

**背景**: 按计划推进钩子注入层共 6 个 atomic commit。施工中有两处主动偏离计划，均已留痕；B4.c 经搜索确认无适用入口已跳过。

**实际提交**（按时间序）：

1. **B1** (`ed5e9979`) `feat(llm-apis): LlmRequestOptions 加 inspectorContext 字段`
   - 计划只要求改 `common.ts`；实际同步修改 `request-builder.ts`：在 `KNOWN_NON_MODEL_OPTIONS_KEYS` 与 `cleanPayload` 的 `forbiddenKeys` 中加入 `"inspectorContext"`，防止该字段污染上游 OpenAI/Anthropic 请求 body。
2. **B2** (`6434361b`) `feat(llm-apis): fetchWithTimeout 注入 inspector 钩子触发点`
   - 三个 fetch 路径（FormData 代理 / 普通代理 / 直连）全部埋点。
   - requestId 优先复用 headers 中已存在的 `X-Request-ID`，确保流式 chunk 与请求记录可关联。
   - 非流式响应 clone + 异步 text() 后广播，流式响应仅广播头部状态（避免阻塞流处理）。
   - 验证：`test:run` 报告 3 处 `temperature: 0.7 → 1` 失败，stash 本次改动后失败仍存在 → 确认为预先存在的历史问题，与本改动无关。
3. **B3** (`b91dd7fe`) `feat(useLlmRequest): 透传 inspectorContext + 自动补 profileId/modelId/requestId`
   - **重要偏离**：原计划只描述"由 fetchWithTimeout 在 trigger 时塞入 metadata"，但实际 fetchWithTimeout 有 **28 处调用分布在 17 个文件**（各 adapter 自行 build options 后直接 fetch）。逐个修改 adapter 会严重违反 "review 友好" 原则。
   - 改用 **contextStore + X-Request-ID 关联机制**：在 `hookRegistry` 新增 `setContext/getContext/deleteContext` API（module-level Map）；`useLlmRequest` 在调用 adapter 前 `setContext(requestId, ctx)`，`finally` 清理；`fetchWithTimeout` 进入时若 options.inspectorContext 缺失，自动通过 X-Request-ID 反查 `getContext()`。
   - 优点：只改 3 个核心文件即可全面覆盖，零侵入 adapter，零破坏 adapter 测试。
4. **B4.a** (`1f865caa`) `feat(llm-chat): 在 LLM 调用入口标注 inspectorContext.toolName`
   - 实际有 5 处入口（远超计划提到的 useChat 单文件）：
     - `useSingleNodeExecutor.ts` — `purpose: "chat"` 带 sessionId
     - `useTopicNamer.ts` — `purpose: "regen-title"` 带 sessionId
     - `useTranslation.ts` — `purpose: "translate"`
     - `useChatHandler.ts` — `purpose: "complete-input"`
     - `useContextCompressor.ts` — `purpose: "context-compress"`
5. **B4.b** (`fc4ee0ac`) `feat(translator): 标注 inspectorContext.toolName`
   - `useTranslatorCore.ts` 唯一入口，`purpose: "translate"` 带 channel.id。
6. **B4.c** [已跳过]
   - **背景**：搜索 vcp-connector 全部源码（`useLlmRequest`/`sendRequest`/`createChatCompletion` 等关键字）均无匹配。
   - **结论**：vcp-connector 是 VCP 协议桥接工具，所有 LLM 流量通过外部 VCP Toolbox 服务转发，**不直接消费 useLlmRequest**。因此无标注入口，任务跳过。
7. **B4.d** (`bd4cdf1d`) `feat(llm-inspector): 其他 LLM 消费者标注 inspectorContext.toolName`
   - 实际覆盖 9 个文件：
     - `settings/llm-service/useConnectionTest.ts` — `toolName: "settings-llm-service"`, `purpose: "system-probe"`
     - `smart-ocr/useVlmEngine.ts` — `purpose: "ocr"`
     - `transcription/engines/audio.engine.ts` — `purpose: "transcribe-audio"` 带 assetId
     - `transcription/engines/image.engine.ts` — 2 处：`"transcribe-image-batch"` / `"transcribe-image"` 带 assetId
     - `transcription/engines/video.engine.ts` — `purpose: "transcribe-video"` 带 assetId
     - `transcription/engines/pdf.engine.ts` — 3 处：`"transcribe-pdf-native"` / `"transcribe-pdf-vision"` / `"transcribe-pdf-vision-batch"` 带 assetId
     - `media-generator/useMediaGenAILogic.ts` — 2 处：`"session-naming"` / `"prompt-translate"`
     - `media-generator/useMediaGenerationManager.ts` — `purpose: "media-gen"` 带 taskId
     - `knowledge-base/tagGenerator.ts` — `purpose: "tag-gen"`

**影响**:

- 全组合入后行为无变化（钩子默认 OFF，inspectorContext 在 request-builder 过滤）。
- 每个 commit `bun run check:frontend` 通过。
- B3 的 contextStore 方案为后续 C 组数据层接入提供了天然的关联通道，无需再次修改 adapter。
- Group B 达成里程碑前置条件，可继续推进 Group C。

### 2026-06-01 — 完成 Group C（C1/C2/C3）→ 🏁 v2.0-α

**背景**: 按计划完成 Inspector 数据层接入。三个 atomic commit 全部 `check:frontend`
通过，旧 UI 行为零变化，新内部监控链路就位。

**实际提交**（按时间序）：

1. **C1** (`406a0413`) `feat(llm-inspector): recordManager 支持 source 字段与内部记录注入`
   - `types.ts` 追加 `RecordSource` 与 `RecordInspectorMetadata` 类型，
     `CombinedRecord` 加可选 `source` / `inspectorMetadata` 字段。
   - `recordManager.addRequestRecord` 签名扩展为 `(request, source = "external", metadata?)`，
     默认走 `external`，旧 Rust 外部代理路径（[`proxyService.ts:110`](src/tools/llm-inspector/core/proxyService.ts:110)）
     无需任何修改即自动归类正确。
   - `getFilteredRecords` 等查询接口未动。

2. **C2** (`c02191b6`) `feat(llm-inspector): 新增 useInternalMonitor composable`
   - 新增 [`composables/useInternalMonitor.ts`](src/tools/llm-inspector/composables/useInternalMonitor.ts)。
     双通道接入：本地钩子 `inspectorHookRegistry.register(...)` + Tauri
     `listen(INSPECTOR_INTERNAL_EVENT.*)`。
   - **去重方案最终选择**：以 `${type}:${requestId}:${timestamp}` 为短期 LRU 键，
     容量上限 500 条，超限清掉前 1/4。优点是不依赖事件投递顺序，且 stream chunk
     因 timestamp 不同不会冲突。本地 + Tauri 同事件在主窗口会被去重为一次，
     符合预期。
   - 跨窗口监听**保留实装**而非简化：考虑到 D 组分离窗口场景需要主窗口持续收
     到分离窗口广播，提前打好基础避免后续返工。
   - 错误事件处理策略：仅当对应请求记录已存在且无响应时，补一条 status=0 的
     占位响应，body 为 `[errorName] errorMessage`；避免产生孤立的无意义错误条目。
   - 在 `useInspectorManager` 内 unconditionally 调用 `useInternalMonitor()`，
     跟随 inspector 页面 mount/unmount。

3. **C3** (`8f8fb518`) `refactor(llm-inspector): useInspectorManager 扩展状态机`
   - **state 字段最终命名**（与计划完全一致）：
     - `isGlobalEnabled: boolean` — 总开关
     - `monitorInternal: boolean` — 内部监控开关
     - `monitorExternal: boolean` — 外部代理开关
     - `externalProxyStatus: ProxyStatus` — 外部代理状态机（"stopped" / "starting"
       / "running" / "stopping" / "error"）
   - `isRunning` 改为兼容 computed：`computed(() => state.externalProxyStatus === 'running')`，
     旧 UI 调用方零破坏。
   - `startInspector` / `stopInspector` / `checkInspectorStatus` 同步驱动
     `externalProxyStatus` 与 `monitorExternal`，异常路径走 `"error"`。
   - watch `state.isGlobalEnabled && state.monitorInternal`（联动逻辑，immediate: true），
     true → `inspectorHookRegistry.enable()`，false → `disable()`。
     总开关 OFF 时即使 `monitorInternal=true` 也强制停用。
   - **unmount 不强制 disable hookRegistry**：避免分离窗口场景下主窗口卸载导致全局
     钩子失效。开关由用户在 UI 上显式控制。
   - state 通过 return 暴露给未来 D 组 UI 直接读取。

**关键链路手工验证**:

⚠️ **未实地手工验证** — 当前会话仅做了静态类型检查（`bun run check:frontend` 三次全绿）。
手工验证「打开内部监控开关 → llm-chat 发消息 → inspector 列表出现 internal
来源记录」需要启动 Tauri dev 环境，建议在合入主分支前由人类完成下列流程：

1. 打开 inspector 工具页（确保 `useInspectorManager` 已 setup，钩子已 register）；
2. 在 DevTools console 执行：
   ```js
   const { inspectorHookRegistry } =
     await import("@/tools/llm-inspector/core/hookRegistry");
   inspectorHookRegistry.enable();
   ```
   或在 inspector store 中直接置 `state.monitorInternal = true`（watch 会联动 enable）；
3. 切到 llm-chat 发一条消息；
4. 切回 inspector，应能看到新记录，C1 添加的 `source: "internal"` 字段已落库
   （UI 暂无显示，但可通过 DevTools 检查 `record.source` 与 `record.inspectorMetadata`）；
5. 关闭开关后 llm-chat 发消息，inspector 不应新增记录。

**v2.0-α 里程碑达成度评估**:

- ✅ 静态链路完整：A→B→C 全部就位，开关 OFF 行为完全等价，开关 ON 时内部
  请求会通过 hookRegistry 抵达 recordManager。
- ✅ 旧 UI 行为零破坏：`isRunning` 兼容 computed，外部代理启停、记录列表、详情面板
  调用方均未触动。
- ⚠️ 实地链路验证待补：建议人类在 Tauri dev 环境跑一次最简验证流程后再发布；
  从代码审查角度看链路完备无明显风险。
- 🎯 **可发布为 α 内部预览版**，但建议先在内部组手工跑通验证流程，再决定是否
  对外释放。

**影响**:

- 后续 Group D 重构 UI 时可直接读取 `state` 字段渲染三层开关，无需再加额外 API。
- 内部监控目前在 UI 层没有可视化区分（list/detail 仍按 external 风格显示），
  这是 D 组的工作（HeaderToolbar 切换 + RecordsList 加来源标签）。
- `inspectorHookRegistry` 上的 contextStore 已在 B3 就绪，C2 写入的 metadata
  会原样落到 `record.inspectorMetadata`，F3「请求来源链路卡」可直接读取。

### 2026-06-01 — 完成 Group D（D1/D2/D3/D4）→ 🏁 v2.0-β

**背景**: 按计划推进 UI Layout 2.0 全部 4 个 atomic commit，每个 commit 单独
`check:frontend` 通过。Group D 全部完成即达成 v2.0-β 里程碑（新 UI + 内部
监控可工作，详情仍是旧裸 JSON 模式）。

**实际提交**（按时间序）：

1. **D1** (`bd3e37cc`) `feat(llm-inspector): 新增 HeaderToolbar 组件`
   - 纯新增 [`components/HeaderToolbar.vue`](src/tools/llm-inspector/components/HeaderToolbar.vue)，不挂载。
   - 三段式布局完全按计划实现：左 INSPECTOR 总开关（呼吸灯 + has-active-monitor 联动）、
     中 内置监控 + 外部代理两个 toggle（外部代理带 starting/stopping/error 状态机），
     右 展开式搜索 + 状态过滤下拉 + 清空 + 设置。
   - 透明度全程用 `rgba(var(--el-color-X-rgb), calc(var(--card-opacity) * N))` 模式，
     严格遵守主题外观三档透明度规范。
   - 一次微调：实现时把第二次重复声明的 defineEmits 合并掉了。

2. **D2** (`0e1a079f`) `feat(llm-inspector): 新增 SettingsDrawer 组件`
   - 纯新增 [`components/SettingsDrawer.vue`](src/tools/llm-inspector/components/SettingsDrawer.vue)，不挂载。
   - 使用 `el-drawer` + `:lock-scroll="false"` + rtl + 480px。
   - 四个分区：基础配置（端口/Target，含 currentTargetUrl 比对的应用按钮）、
     请求头覆盖规则（徽章 + 编辑按钮触发 HeaderOverrideDialog）、隐私设置（打码）、
     高级设置占位。
   - **关键决策**: HeaderOverrideDialog 保留作为独立弹窗由 Drawer 内按钮触发，
     **未内联**。原因：HeaderOverrideDialog 本身 500 行 + 含嵌套编辑子弹窗，
     内联会让 Drawer 文件爆炸、嵌套过深。按钮触发反而让 Drawer 保持精简、
     HeaderOverrideDialog 可继续复用。

3. **D3** (`858d5d3d`) `refactor(llm-inspector): LlmInspector.vue 切换到 Header + Split + Drawer 主布局`
   - **唯一破坏性 commit**，删除 344 行 + 新增 153 行（净减 191 行）。
   - LlmInspector.vue 全量重写：顶部 HeaderToolbar 替换 config-panel，
     主区 CSS Grid 左右 1fr/3fr 分栏，错误提示改为 Header 下方全宽 banner，
     SettingsDrawer 由 HeaderToolbar 的 [⚙️] 按钮触发。
   - **未修改 RecordsList / RecordDetail**：它们内部样式（卡片背景/边框/blur）保留不动，
     仅在 LlmInspector.vue 用 `:deep()` 让其填满 pane 容器（width/height: 100%）。
     没有触发 D3.5 拆分需求。
   - **useProxyManager 联动语义最终设计**：
     - 总开关 `state.isGlobalEnabled` OFF 时：内部钩子由原 watch 自动 disable，
       外部代理由 D3 新增的 watch 自动 stopInspector（如在运行）。
     - 总开关 ON 时：不自动开任何子开关，让用户显式控制。
     - 这样设计保持状态机自洽：总开关是"检查器整体使能"的统一控制点，
       OFF 后外部代理仍占用端口但 inspector 不再记录会造成困惑，故一并停服。
   - **canStartInspector 类型修正**：原 computed 由于 `config.value.target_url`（string）
     参与 `&&` 短路求值产生 `string | boolean`，TS 严格模式下传入 HeaderToolbar 的
     `:boolean` props 会报错。用 `Boolean()` 包裹修正。

4. **D4** (`95f472ff`) `feat(llm-inspector): Split View 加可拖拽分割条与比例持久化`
   - 新增 [`composables/useSplitPane.ts`](src/tools/llm-inspector/composables/useSplitPane.ts)：
     ratio ref + clamp 边界 + 全局 mousemove/mouseup（用 `@vueuse/core` 的
     useEventListener 自动清理）+ resetRatio 双击恢复。持久化由调用方 watch ratio
     触发，composable 不直接读写 settings，保持职责单一。
   - types.ts 追加 `InspectorLayoutSettings` 与 `LlmInspectorSettings.layout?` 可选字段，
     向后兼容（旧配置缺 layout 时自动填默认）。
   - configManager.ts 加 `DEFAULT_SPLIT_RATIO=0.25` / `MIN=0.1` / `MAX=0.9` 常量；
     loadSettings 健壮性处理：缺失填默认、非法值钳制。
   - useProxyManager 加 layout ref，纳入自动持久化 watch 依赖列表。
   - LlmInspector.vue 主区改三列 Grid（`{ratio}% 6px 1fr`），中间 `.split-divider`
     hover/dragging 时显示 primary 色高亮把手；双向 watch 同步 splitRatio ↔ layout
     带 1e-4 容差防止抖动。

**视觉自检**:

⚠️ 本次仅做了 `bun run check:frontend` 静态类型检查，**未在 Tauri dev 环境实际
渲染验证三档透明度**。代码层面所有背景色都严格使用 `var(--card-bg) / var(--input-bg) /
var(--container-bg)` 或 `rgba(var(--el-color-X-rgb), calc(var(--card-opacity) * N))`
模式，理论上应自动响应主题外观系统。建议姐姐在合入主分支前手工验证一次三档透明度
（0% / 50% / 100%）下的视觉效果。

**v2.0-β 里程碑达成度评估**:

- ✅ 新 UI Layout 完整：Header（48px）+ Split View（可拖拽，比例持久化）+
  Drawer（设置抽屉）三件套就位。
- ✅ 内部监控可工作：HeaderToolbar 的「内置监控」toggle 直接驱动
  `state.monitorInternal`，watch 联动 `inspectorHookRegistry.enable/disable`。
- ✅ 外部代理保持兼容：HeaderToolbar 的「外部代理」toggle 根据
  `state.externalProxyStatus` 调用 `startInspector` / `stopInspector`，
  原 Rust 代理路径无变化。
- ✅ 错误处理：错误从 config-panel 内的提示框迁移到 Header 下方全宽 banner，
  保持可见性。
- ⚠️ 详情面板仍是裸 JSON：这是 Group E 的工作（4-Tab RecordDetail），按计划推进。

**给姐姐的手工验证脚本**:

启动 Tauri dev（`bun run tauri:dev`）后：

A. **内部监控验证**（v2.0-α + v2.0-β 联合验证）：

1.  打开 LLM Inspector 工具页（会自动 setup hookRegistry）。
2.  点击 Header 中间的 `[🪝 内置监控 OFF]` toggle，应变为 `[🪝 内置监控 ON]`
    绿色高亮，同时左侧 `[● INSPECTOR]` 呼吸灯开始动画。
3.  切到 llm-chat 发送一条消息（任意 profile）。
4.  切回 Inspector，左侧记录列表应出现新条目（注意：UI 暂未区分
    internal/external 来源标签，这是 F3 的工作；可在 DevTools 检查
    `record.source === "internal"` 与 `record.inspectorMetadata.toolName === "llm-chat"`）。
5.  关闭「内置监控」toggle，再次发消息应不增加记录。

B. **外部代理验证**（保持原有能力）：

1.  确保「内置监控」OFF 避免干扰。
2.  点击右上角 `[⚙️]` 打开设置抽屉，确认端口 8999 + Target `https://api.openai.com`。
3.  关闭抽屉，点击 Header 中间 `[🌐 外部代理 OFF]` toggle。
4.  应短暂显示 `[启动中]` 黄色状态，随后变为 `[ON]` 绿色。左侧呼吸灯仍动画。
5.  用任意 HTTP 客户端把请求指向 `http://localhost:8999` 应能转发并出现在列表。
6.  再次点击 toggle 应正常停止（短暂 `[停止中]` → `[OFF]`）。

C. **总开关联动验证**：

1.  同时开启内置监控 + 外部代理。
2.  点击 `[● INSPECTOR]` 关闭总开关。
3.  预期：呼吸灯静止变灰；外部代理自动停止（短暂 `[停止中]`）；
    内置监控显示 OFF（监控状态 UI 同步，内部已通过 watch 钳制 disable）。
4.  再次点击开启总开关，子开关保持 OFF 不自动恢复（用户需显式重新启用）。

D. **Split View 拖拽验证**：

1.  鼠标悬停左右两栏中间，应看到 1px 灰色分隔线变 2px 主色高亮 +
    中间出现垂直胶囊把手。
2.  拖动调整左栏宽度，整页 cursor: col-resize，松开后比例保留。
3.  关闭工具页再打开，比例应保持（持久化到 settings.json）。
4.  双击分割条恢复 0.25 默认比例。

E. **设置抽屉验证**：

1.  点击 `[⚙️]` 抽屉从右滑入，宽 480px。
2.  外部代理 ON 时，端口输入框应禁用。
3.  点击「编辑规则」按钮应弹出原 HeaderOverrideDialog，规则数量徽章
    在保存后立即更新。
4.  切换 API Key 打码 checkbox 后，详情页复制全部时应能看到效果（继承自旧逻辑）。

**视觉三档透明度验证**：

1.  主题外观设置中将「界面质感」依次调到 0% / 50% / 100% 三档。
2.  每档检查：HeaderToolbar 背景、SettingsDrawer 背景、左右两栏卡片、
    分割条把手、错误 banner 颜色都应平滑变化，无突兀实色或过深背景。

**影响**:

- Group D 全部就位，后续 Group E（RecordDetail 4-Tab 化）可基于 Split View 右栏
  直接重构，无需触动 LlmInspector.vue 主布局。
- 内部监控链路在用户层面终于可控（之前 α 阶段只能在 DevTools 手动 enable）。
- F3「请求来源链路卡」可读取 `record.source` 和 `record.inspectorMetadata`
  在 RecordsList 加来源徽章，UI 已就绪。

### 2026-06-02 — 完成 Group E（E1/E2/E3/E4）

**背景**: 按计划推进详情面板 4-Tab 化，全程 `check:frontend` 通过。施工中应姐姐
要求把所有残留 emoji（📋/⏳/🔴/🔄/🔒/×）全部替换为 lucide-vue-next 图标，从 E1
开始贯穿到 E4 全组保持图标库统一。

**实际提交**（按时间序）：

1. **E1** (`d4a5663e`) `refactor(llm-inspector): RecordDetail 拆出 RecordOverviewTab 组件并 Tabs 化`
   - 新增 `components/detail/RecordOverviewTab.vue`，把原 RecordDetail 的「请求
     信息 / 响应信息 / 请求体 / 响应体」完整搬迁，纯结构搬迁、行为零变化。
   - RecordDetail 顶层加 `<el-tabs>` 包裹，目前仅含「总览」一个 tab。
   - **附加调整**：姐姐反馈"图标换图标库，别再用emoji了"，所以连带把头部「复制
     全部」按钮和子组件内的 📋/⏳/🔴/🔄/🔒/× 全部换成 lucide-vue-next 图标
     （Copy / LoaderCircle / Circle / Activity / Lock / X / ClipboardList）。
   - 这是符合 §0.2 「应变即合理」原则的微调，已在 commit message 注明。

2. **E2** (`5a27a8d8`) `feat(llm-inspector): 新增 StructuredMessagesView 与 RecordStructuredTab`
   - **StructuredMessagesView (通用消息块渲染器)**：
     - 顶部工具栏：消息总数 + 「真实/预测」徽章 + 搜索框 + 匹配计数
     - 横向锚点 sticky tabs：每条消息按角色着色 chip，点击平滑滚动到对应卡片
     - 消息卡片：左侧 3px 角色色条 + 标签色（system→info / user→success /
       assistant·model→primary / tool→warning）
     - 块类型完整覆盖：text / thinking / tool_call / tool_result / refusal /
       image / unknown
     - 搜索关键字本地高亮（mark 标签），不匹配的消息半透明 dim
   - **RecordStructuredTab (业务接入层)**：
     - 顶部信息条：格式 / 模型 / Stream 三个 chip
     - 调用 `parseRequestMessages(record.request.body, detectApiFormat(url))`
     - E2 阶段仅渲染请求消息，响应消息在 E3 加入
   - 与 context-analyzer 视觉差异化：本工具使用 Globe 图标 + 「真实」徽章
     （context-analyzer 后续可用 Compass + 「预测」徽章）
   - 严格遵守透明度规范：所有彩色背景均使用
     `rgba(var(--el-color-X-rgb), calc(var(--card-opacity) * N))` 模式

3. **E3** (`24aca18a`) `feat(llm-inspector): 结构化 Tab 加入响应消息块渲染`
   - RecordStructuredTab 追加响应消息 section（位于请求消息之后），复用同一个
     StructuredMessagesView 组件。
   - 顶部信息条扩展：新增「响应模型」（与请求模型不同时显示）和「停止原因」chip。
   - 解析失败时友好降级：响应体非 JSON（典型场景为 SSE 流式）时显示 info-note
     提示信息，并提示用户可切到流式 Tab 查看。
   - 仅在 `record.response.body` 存在时执行响应解析，避免无意义的解析尝试。
   - 覆盖能力（继承自 messageParser）：OpenAI Chat reasoning_content/tool_calls/
     refusal、OpenAI Responses output[].type、Anthropic thinking/tool_use、
     Gemini parts.thought/functionCall、Cohere v1/v2、Ollama。

4. **E4** (`74f0ca84`) `feat(llm-inspector): 拆出 RawTab 与 StreamTab，详情面板 4-Tab 化完成`
   - **新增 RecordRawTab.vue (原始 Tab)**：
     - 请求体：含 JSON 自动美化
     - 响应体：完整继承「原始 / 正文模式」切换 + 流式徽章 + 复制按钮
     - 空状态优雅降级：GET 无请求体 / 等待响应到达 / 204 无内容
   - **新增 RecordStreamTab.vue (流式专属 Tab)**：
     - 顶部状态条：实时呼吸灯（active 时 danger 红 + 闪烁）/ 已结束状态切换
     - 缓冲/正文字符数实时统计
     - 双视图模式：打字机正文 (text) / 原始 SSE 缓冲 (raw)
     - 自动滚动到底部开关（默认开启，可手动关闭）
     - 切换记录时滚动重置到顶部
     - 支持 maskApiKeys 复制
     - 仅在 `isStreamingResponse` 时显示（`el-tab-pane v-if` 控制）
   - **精简 RecordOverviewTab.vue (总览 Tab)**：
     - 移除请求体 / 响应体 body 区块（已迁移到 RawTab）
     - 改为「元数据一览」定位：方法/URL/时间/请求大小 + Headers + 响应状态/
       耗时/大小/流式标识 + 响应 Headers
     - 增加底部「跳转提示」: 指向 原始 / 结构化 Tab
     - 紧凑化样式：method-badge 主色徽章 + url-full 等宽字体
   - **RecordDetail.vue 主控变更**：
     - Tabs 总数 2→4，新增 raw + 条件性 stream
     - activeTab 类型扩展为 `TabName` 联合类型
     - 切换记录时若当前 tab 为「流式」但新记录非流式，自动回退到「总览」（watch
       联动）

**视觉自检**:

⚠️ 全程仅做了 `bun run check:frontend` 静态类型检查（4 次全绿），**未在 Tauri
dev 环境实际渲染验证三档透明度**。代码层面所有背景色都严格遵守主题外观系统规范
（`var(--card-bg) / var(--input-bg) / var(--container-bg) / var(--bg-color)`
和 `rgba(var(--el-color-X-rgb), calc(var(--card-opacity) * N))`），理论上应自动
响应主题。建议姐姐在合入主分支前手工验证一次三档透明度（0% / 50% / 100%）下的
视觉效果，以及各类 LLM 请求（OpenAI Chat 含 tool_calls、Anthropic 含 thinking、
Gemini multi-candidate、Ollama 单消息等）的结构化渲染正确性。

**给姐姐的手工验证脚本**（基于 E1-E4 完整流程）:

启动 Tauri dev (`bun run tauri:dev`) 后：

A. **4-Tab 切换基础验证**：

1.  打开 LLM Inspector 工具页，启用「内置监控」开关。
2.  切到 llm-chat 发一条普通消息（非流式 GPT-4o 等），切回 Inspector 选中该记录。
3.  应看到 3 个 Tab：「总览 / 结构化 / 原始」（无 「流式」Tab，因为非流式）。
4.  「总览」：显示方法/URL/时间/请求大小 + 请求 Headers + 响应状态码/耗时/大小
    - 响应 Headers，**不再有请求体/响应体内容**（已迁移）。底部有「跳转提示」
      引导查看原始 / 结构化 Tab。
5.  「结构化」：顶部信息条显示 格式/请求模型，下方「请求消息」section 展示完整
    对话（system + user 卡片），下方「响应消息」section 展示 assistant 回复。
    横向锚点点击可平滑滚动。搜索框输入关键字可看到匹配高亮 + 不匹配消息半透明
    dim。
6.  「原始」：上方请求体（JSON 美化），下方响应体（默认原始模式，可切换正文）。

B. **流式响应 Tab 验证**：

1.  发起一个流式 LLM 请求（如 Claude 流式响应）。
2.  Inspector 选中该流式记录，Tabs 应变为 4 个：「总览 / 结构化 / 原始 / 流式」。
3.  「流式」Tab：进入后顶部呼吸灯应实时跳动 + 显示「实时接收中」红色高亮。
    缓冲字符数 / 正文字符数实时增长。
4.  默认「正文」模式显示打字机风格累积文本，可切换到「原始」看 SSE 缓冲。
5.  自动滚动默认开启（按钮蓝色高亮），内容到达时滚动条会自动跟到底部；
    点一下「自动滚动」按钮关闭，再继续接收时滚动条不再自动跟随。
6.  请求结束后呼吸灯停止 + 状态变为「流式传输已结束」灰色。
7.  选中另一条非流式记录，「流式」Tab 应消失。如果之前停留在「流式」Tab，
    应自动回退到「总览」（watch 联动）。

C. **结构化 Tab 复杂场景验证**：

1.  发一条带 tool_calls 的请求（如 GPT-4 Function Calling）：
    - 应看到 user 消息卡片 + assistant 卡片含 tool_call 块（橙色 tool-name 徽章
      - JSON 美化的 toolArguments）+ tool 卡片含 tool_result 块。
2.  发一条 Claude 含 thinking 的请求：
    - assistant 卡片应同时显示 thinking 块（斜体灰色 + Brain 图标）+ text 块。
3.  发一条 o1 含 reasoning_content 的请求：
    - assistant 卡片首块应为 thinking 块（reasoning_content 内容）。
4.  顶部信息条「响应模型」chip 仅当与请求模型不同时显示（如声明 gpt-4-turbo
    但实际返回 gpt-4-turbo-2024-04-09）。

**v2.0 GA 里程碑达成度评估**:

- ✅ 详情面板 4-Tab 拆分完成：总览（元数据）/ 结构化（语义化）/ 原始（完整 body）
  / 流式（实时打字机）四个视图各司其职。
- ✅ LLM 语义化能力：通过 messageParser + StructuredMessagesView 覆盖 5 大格式
  - 8 大块类型，搜索/锚点/角色着色/匹配高亮等交互完备。
- ✅ 流式专属视图：实时统计 + 双视图 + 自动滚动 + maskApiKeys 复制等用户体验
  细节就位。
- ⚠️ Group F（Token & 元数据增强卡片）尚未推进 — token-estimator 已在 A3 就绪，
  但 UI 卡片 (F1/F2/F3/F4) 待开。
- ⚠️ Group G（收尾 / 文档 / 体验小修）尚未推进。

**影响**:

- 后续 Group F 的 Token 估算卡 + 服务端 usage 对比 + 来源链路卡可以全部挂到
  RecordOverviewTab.vue 的顶部位置，与「跳转提示」并列，不再影响 4-Tab 主体结构。
- F3「请求来源链路卡」可直接读取 record.source 和 record.inspectorMetadata，
  这两个字段在 C 组就绪。
- 详情面板每个 Tab 现在都是独立组件，未来扩展（如「对比」Tab、「重放」Tab）
  只需新增一个 detail/RecordXxxTab.vue 并在 RecordDetail.vue 加 el-tab-pane 即可。

<!-- 后续条目从这里追加 -->

---

> 待姐姐 review 后，可切到 `code` 模式从 **A1** 开始施工。建议每完成一组（A / B / C / D / E / F / G）后做一次 review 间歇，更新 §14 进度与 §15 变更日志（如有调整），确认方向后再推进下一组。
