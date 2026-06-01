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

- [ ] C1. recordManager 支持 source 字段
- [ ] C2. 新增 useInternalMonitor composable
- [ ] C3. useProxyManager 扩展状态机
- [ ] 🏁 **里程碑 v2.0-α**

### Group D — UI Layout 2.0

- [ ] D1. HeaderToolbar 组件
- [ ] D2. SettingsDrawer 组件
- [ ] D3. LlmInspector.vue 主布局切换
- [ ] D4. Split View 拖拽与持久化
- [ ] 🏁 **里程碑 v2.0-β**

### Group E — RecordDetail 4-Tab

- [ ] E1. 拆出 RecordOverviewTab
- [ ] E2. StructuredMessagesView + RecordStructuredTab
- [ ] E3. 响应消息块渲染
- [ ] E4. 拆出 RawTab 与 StreamTab

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

<!-- 后续条目从这里追加 -->

---

> 待姐姐 review 后，可切到 `code` 模式从 **A1** 开始施工。建议每完成一组（A / B / C / D / E / F / G）后做一次 review 间歇，更新 §14 进度与 §15 变更日志（如有调整），确认方向后再推进下一组。
