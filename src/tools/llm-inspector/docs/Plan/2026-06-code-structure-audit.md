# LLM Inspector 代码结构审计报告

> 状态: Implementing · 作者: 咕咕 · 日期: 2026-06-02
> 范围: [`src/tools/llm-inspector/`](src/tools/llm-inspector/) 全量

## ✅ 实施进度（2026-06-02 更新）

| 阶段   | 项                           | 状态     | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 阶段一 | 3.1 类型归一化               | ✅ 完成  | `types.ts` 已拆为 [`types/records.ts`](src/tools/llm-inspector/types/records.ts:1) / [`types/config.ts`](src/tools/llm-inspector/types/config.ts:1) / [`types/stream.ts`](src/tools/llm-inspector/types/stream.ts:1) / [`types/events.ts`](src/tools/llm-inspector/types/events.ts:1) / [`types/ui.ts`](src/tools/llm-inspector/types/ui.ts:1) / [`types/parser.ts`](src/tools/llm-inspector/types/parser.ts:1) + [`types/index.ts`](src/tools/llm-inspector/types/index.ts:1) 聚合入口；原有 `types/hooks.ts` 保留 |
| 阶段一 | 3.8 文件改名                 | ✅ 完成  | `useProxyManager.ts` → [`useInspectorManager.ts`](src/tools/llm-inspector/composables/useInspectorManager.ts:1)（git mv 保留历史）                                                                                                                                                                                                                                                                                                                                                                                  |
| 阶段一 | 3.9 删除过期 README          | ✅ 完成  | 过期内容已删除，使用 [`ARCHITECTURE.md`](src/tools/llm-inspector/ARCHITECTURE.md:1) 作为唯一架构文档                                                                                                                                                                                                                                                                                                                                                                                                                |
| 阶段二 | 3.3 拆分 useInspectorManager | ✅ 完成  | 508 行 → 220 行 facade + [`useInspectorConfig.ts`](src/tools/llm-inspector/composables/useInspectorConfig.ts:1)（138 行配置/历史/复制层）+ [`useExternalProxy.ts`](src/tools/llm-inspector/composables/useExternalProxy.ts:1)（240 行外部代理生命周期层）。状态机仍由 facade 集中持有                                                                                                                                                                                                                               |
| 阶段二 | 3.5 拆分 utils.ts            | ✅ 完成  | 613 行 → 168 行；抽出 [`core/apiFormat.ts`](src/tools/llm-inspector/core/apiFormat.ts:1)（`ApiFormat` + `detectApiFormat`）与 [`core/contentExtractor.ts`](src/tools/llm-inspector/core/contentExtractor.ts:1)（流式 / JSON 正文与思维链提取）                                                                                                                                                                                                                                                                      |
| 阶段二 | 3.4 LRU 抽象                 | ✅ 完成  | 新建 [`core/lruCache.ts`](src/tools/llm-inspector/core/lruCache.ts:1) 暴露 `LruCache<K,V>` + `LruSet<T>`；3 处替换：`useTokenEstimate` 用 `LruCache.touch()` 实现真·LRU；`useInternalMonitor` 用 `LruSet`；`useFormattedBody` 用 `LruCache`                                                                                                                                                                                                                                                                         |
| 阶段三 | 3.2 Pinia 迁移               | ⏸ 待执行 | 模块级响应式单例（recordManager / streamProcessor / contextStore）尚未迁出。改动面较大，暂缓。**注意**: `isGlobalEnabled` / `monitorInternal` 等开关字段已带跨窗口同步语义（见 [2026-06-cross-window-sync.md](src/tools/llm-inspector/docs/Plan/2026-06-cross-window-sync.md:1)），迁入 store 时需保留 ENABLE_CHANGED 广播 + listen 机制                                                                                                                                                                            |
| 阶段三 | 3.6 / 3.7 状态上提           | ⏸ 待执行 | useRecordDetail 多组件重复 setup + 详情面板嵌套 Tab/Segment/SubView 状态散落，待 Pinia 化后一并解决                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 阶段三 | 3.10 messageParser 增量化    | ⏸ 远期   | 大改造，标记 P2，先搁置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 阶段四 | 3.11 文档治理                | ⏸ 待执行 | ARCHITECTURE.md 中的开发期叙事剥离到 archive，待下次执行                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**全量验证**：`vue-tsc --noEmit` 0 错；`bun test src/tools/llm-inspector` 34/34 pass；`oxlint` 0 warning。

**指标对比**：

| 指标                                 | 改前       | 改后                  |
| ------------------------------------ | ---------- | --------------------- |
| `core/utils.ts`                      | 613 行     | 168 行                |
| `composables/useInspectorManager.ts` | 508 行     | 220 行（facade）      |
| 类型文件双轨                         | 是         | 否（统一 `types/`）   |
| LRU 实现散落                         | 3 处       | 1 处（`lruCache.ts`） |
| API 格式检测 / 内容提取              | 混在 utils | 独立模块              |

---

## 0. TL;DR（一句话结论）

整体架构清晰、模块边界讲究、文档详尽（[`ARCHITECTURE.md`](src/tools/llm-inspector/ARCHITECTURE.md:1) 是项目里少见的“能照着读懂代码”的好范本），但 **若干技术债集中在“类型组织/单例耦合/全局缓存/视觉组件命名”**，处于「能跑能改，但越改越涨」的临界状态，建议趁着 v2.0 GA 收敛一波再开 v3。

---

## 1. 总体架构鸟瞰

```
LlmInspector.vue (入口 Shell)
  ├── HeaderToolbar.vue            (顶部三态开关 + 操作)
  ├── SettingsDrawer.vue           (设置抽屉 + 触发 HeaderOverrideDialog)
  ├── RecordsList.vue              (左栏: 记录列表 + 来源徽章)
  └── RecordDetail.vue             (右栏: 3-Tab 详情)
        ├── detail/RecordOverviewTab.vue
        ├── detail/RequestPanel.vue
        │     ├── views/RequestStructuredView.vue → StructuredMessagesView.vue
        │     └── views/RequestRawView.vue
        └── detail/ResponsePanel.vue
              ├── views/ResponseStructuredView.vue (含可视化 + 标准化 JSON 双子视图)
              └── views/ResponseRawView.vue

composables/  (响应式胶水层)
  ├── useProxyManager.ts        (== useInspectorManager 状态机 + 配置 + 事件桥)
  ├── useInternalMonitor.ts     (本地钩子 + Tauri 跨窗口去重)
  ├── useRecordDetail.ts        (单条记录派生数据 + 复制)
  ├── useTokenEstimate.ts       (Token 估算 + 服务端 usage 对比 + 缓存)
  ├── useSplitPane.ts           (左右分栏拖拽)
  └── useFormattedBody.ts       (formatJson 缓存)

core/  (无依赖的纯逻辑/单例模块)
  ├── hookRegistry.ts           (内部钩子单例 + contextStore)
  ├── recordManager.ts          (模块级 ref 单例数据仓库)
  ├── streamProcessor.ts        (模块级 ref + 100ms 节流)
  ├── streamMerger.ts           (SSE → 厂商原生 JSON 合并)
  ├── messageParser.ts          (5 大格式 → ParsedMessage)
  ├── tokenEstimator.ts         (客户端估算 + 服务端 usage 提取)
  ├── configManager.ts          (持久化包装)
  ├── proxyService.ts           (Tauri invoke/listen 封装)
  └── utils.ts                  (格式化 + ApiFormat 检测 + content/reasoning 提取)

types.ts        (业务数据类型)
types/hooks.ts  (钩子事件契约 + InspectorState)
```

整体遵循了 **「核心层 → composables → 组件」** 的三段式，且核心层做到了 **「无 Vue 依赖（除 ref/shallowRef 单例外）」**，可测试性良好（已经有 [`core/__tests__/`](src/tools/llm-inspector/core/__tests__/messageParser.test.ts:1)）。

---

## 2. 亮点（值得保留 / 推广）

1. **双层监控架构清晰**：外部 Rust 代理（端口转发）+ 内部钩子（[`inspectorHookRegistry`](src/tools/llm-inspector/core/hookRegistry.ts:236)）通过 `X-Request-ID` + `contextStore` 反查，**0 侵入 adapter** 就实现了上下文穿透，这是非常聪明的设计。
2. **状态机集中**：[`InspectorState`](src/tools/llm-inspector/types/hooks.ts:118) 把 `isGlobalEnabled / monitorInternal / monitorExternal / externalProxyStatus` 收拢到一个 reactive，避免散落的 boolean 互相打架。
3. **零成本短路**：[`shouldCaptureInternal()`](src/tools/llm-inspector/core/hookRegistry.ts:77) 让 OFF 状态下所有埋点真的为 no-op，不会 clone Response。
4. **跨窗口去重**：[`useInternalMonitor.markAndCheck()`](src/tools/llm-inspector/composables/useInternalMonitor.ts:125) 用 `${type}:${requestId}:${timestamp}` 做 LRU 去重，干净利落。
5. **流式优化得当**：[`streamProcessor.ts`](src/tools/llm-inspector/core/streamProcessor.ts:1) 用 `shallowRef + pendingUpdates + 100ms triggerRef` 控制高频 SSE 的重绘代价；完成时强制 flush 保证完整。
6. **Token 估算闭环**：客户端估算 + 服务端 usage + 偏差三档高亮 + 签名缓存（`${reqLen}|${resLen}|${modelHint}`）+ 手动重算，是一个完整产品级的方案。
7. **SSE 合并器各厂商分支细致**：[`streamMerger.ts`](src/tools/llm-inspector/core/streamMerger.ts:1) 对 OpenAI Chat / Responses / Anthropic / Gemini / Cohere / Ollama 都分别写了合并逻辑，连 Claude 的 `signature_delta`、Gemini 的 `parts.thought` 都覆盖了。
8. **架构文档质量**：[`ARCHITECTURE.md`](src/tools/llm-inspector/ARCHITECTURE.md:1) 写得相当扎实，含 mermaid 图、版本里程碑、数据流时序图、类型契约，新人能直接看懂。

---

## 3. 主要问题（按严重度排序）

### 🔴 P0 - 必改

#### 3.1 类型文件双轨：`types.ts` 与 `types/` 目录冲突

```
src/tools/llm-inspector/
  ├── types.ts            ← 既存在文件
  └── types/
        └── hooks.ts      ← 又存在同名目录
```

- **症状**：[`types.ts`](src/tools/llm-inspector/types.ts:1) 是文件，里面定义业务类型；[`types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts:1) 是目录里的文件，定义钩子契约。在文件资源管理器、IDE 大纲、git diff 里都会出现「`types.ts` 旁边一个 `types/` 文件夹」的诡异景象。
- **后果**：
  - 新人不知道该把新类型加进哪个里；
  - 某些打包工具/TypeScript path mapping 在 case-insensitive 文件系统上可能解析歧义；
  - 阻碍了进一步拆分（比如想把 `types.ts` 也按模块拆出去时无法 `mv` 同名实体）。
- **建议**：二选一统一：
  - **方案 A（推荐）**: 全部进 `types/` 目录，拆成 `types/records.ts`（CombinedRecord 等）、`types/parser.ts`（ParsedMessage 等）、`types/hooks.ts`、`types/index.ts`（re-export）。
  - **方案 B（保守）**: 把 `types/hooks.ts` 内容并回 `types.ts`，删掉 `types/` 目录。但 `types.ts` 已经 226 行了，再涨不健康，所以推荐 A。

#### 3.2 模块级响应式单例的 SSR/测试灾难

[`recordManager.ts`](src/tools/llm-inspector/core/recordManager.ts:17-25) 与 [`streamProcessor.ts`](src/tools/llm-inspector/core/streamProcessor.ts:15-23) 在 **模块顶层** 直接 `const records = ref([])` / `shallowRef({})`。

```ts
// recordManager.ts
const records = ref<CombinedRecord[]>([]);
const selectedRecord = ref<CombinedRecord | null>(null);
const filterOptions = reactive<FilterOptions>({ ... });
```

- **后果**：
  - **测试隔离失效**：跑多条单测时，记录会跨用例污染（除非每次手动 `clearAllRecords`）；
  - **无法多实例化**：未来想做「对比两个 Inspector 实例」「打开两套独立检查窗口」时无法实现；
  - **HMR 行为不可预测**：模块热替换时 ref 可能被新模块重新初始化，但订阅它的组件还在用旧 ref；
  - **与 Pinia 体系格格不入**：项目其他工具用的是 `defineStore`，唯独 Inspector 自己造了个「模块级 ref 单例」的轮子。
- **建议**：
  - 短期：保持现状（已经能跑），但在 [`useRecordManager()`](src/tools/llm-inspector/core/recordManager.ts:290) 函数里加注释明确「这是全局单例，不是工厂」；
  - 中期：迁移到 Pinia `defineStore('inspectorRecords', ...)`，复用其 devtools 集成与 SSR 安全性。

#### 3.3 `useProxyManager` 名实不符 + 职责膨胀

文件叫 [`useProxyManager.ts`](src/tools/llm-inspector/composables/useProxyManager.ts:1)，但导出 `useInspectorManager`（注释里写 `useInspectorManager / useProxyManager` 两个名字）；508 行内塞了：

- 状态机（state）
- 配置加载/保存
- 外部代理 start/stop/update
- 内部监控接入（调 useInternalMonitor）
- 事件监听器三件套（request/response/stream）
- 历史 URL 管理
- 复制+打码
- 5 个 watch（自动保存 × 2、监控联动、总开关联动）
- 生命周期挂载

属于典型的「上帝 Composable」。LlmInspector.vue 把它整个解构出来，然后传一堆 props 给子组件——出现了 [`LlmInspector.vue`](src/tools/llm-inspector/LlmInspector.vue:89) 一上来 30 行解构的壮观场面。

- **建议**：
  - 文件改名为 `useInspectorManager.ts`，与函数同名；
  - 拆分为：
    - `useInspectorState.ts` —— 仅 state + watch 联动；
    - `useInspectorConfig.ts` —— loadSettings/saveSettings + targetUrlHistory；
    - `useExternalProxy.ts` —— start/stop/update + 事件监听器；
    - `useInspectorManager.ts` —— 外观层，把上面三个组合起来对外暴露；
  - 让 [`LlmInspector.vue`](src/tools/llm-inspector/LlmInspector.vue:89) 只 import 一个 facade，子组件按需通过 provide/inject 拿到细分状态。

### 🟡 P1 - 应改

#### 3.4 全局缓存 Map 散落且策略不统一

| 位置                                                                                               | 缓存内容                | 上限 | 淘汰策略      |
| -------------------------------------------------------------------------------------------------- | ----------------------- | ---- | ------------- |
| [`useTokenEstimate.ts: cache`](src/tools/llm-inspector/composables/useTokenEstimate.ts:48)         | TokenEstimateCacheEntry | 200  | 取前 1/4 删除 |
| [`useFormattedBody.ts: formatCache`](src/tools/llm-inspector/composables/useFormattedBody.ts:4)    | 格式化 JSON             | 100  | 删第一个      |
| [`useInternalMonitor.ts: seen Set`](src/tools/llm-inspector/composables/useInternalMonitor.ts:122) | 去重键                  | 500  | 取前 1/4 删除 |

三套都在文件顶层直接 `new Map()`，**与组件生命周期完全脱钩**：

- 切换 Inspector 工具页、卸载组件，缓存仍然存在；
- 跨工具切换时，旧 record 的缓存可能命中（虽然有签名校验，但浪费内存）；
- 测试用例无法独立清理。

**建议**：抽一个 [`core/lruCache.ts`](src/tools/llm-inspector/core/lruCache.ts:1)（新建）统一管理：

```ts
export function createLruCache<K, V>(maxSize: number) {
  // 标准 LRU 实现（Map 按插入序天然支持）
  // 暴露 .get/.set/.delete/.clear/.size
}
```

三处替换，并在 `clearRecords()` 时一并清空所有缓存。

#### 3.5 `core/utils.ts` 已 613 行，是个大杂烩

[`utils.ts`](src/tools/llm-inspector/core/utils.ts:1) 里塞了：

- 格式化（formatUrl/formatTime/formatSize/formatJson/formatStreamingResponse）
- 状态码 CSS 映射（getStatusClass）
- API Key 打码（maskSensitiveData）
- 剪贴板（copyToClipboard）
- 过滤器（filterRecords）
- **API 格式检测**（detectApiFormat + ApiFormat 类型）
- **流式内容提取**（extractStreamContent/extractStreamReasoning + 5 个 by-format 提取器）
- **JSON 响应提取**（extractJsonContent + 5 个 by-format 提取器）

后两块（约 350 行）实际上是与 [`messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts:1) 同源的「按厂商格式归一化」逻辑，只是侧重点不同。

**建议**：

- 把 `ApiFormat` + `detectApiFormat` 抽到 [`core/apiFormat.ts`](src/tools/llm-inspector/core/apiFormat.ts:1)（messageParser 和 streamMerger 都依赖它）；
- 把 `extractStream*` + `extractJsonContent` 抽到 [`core/contentExtractor.ts`](src/tools/llm-inspector/core/contentExtractor.ts:1)；
- `utils.ts` 只留通用工具（format/copy/mask/filter）。

#### 3.6 `useRecordDetail` 在多个组件里被「重复 setup」

[`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:114)、[`ResponsePanel.vue`](src/tools/llm-inspector/components/detail/ResponsePanel.vue:57)、[`RequestRawView.vue`](src/tools/llm-inspector/components/detail/views/RequestRawView.vue:74)、[`ResponseRawView.vue`](src/tools/llm-inspector/components/detail/views/ResponseRawView.vue:98)、[`ResponseStructuredView.vue`](src/tools/llm-inspector/components/detail/views/ResponseStructuredView.vue:310)、[`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:355) 都各自调 `useRecordDetail(props)`。

虽然 composable 本身是纯函数（每次返回新对象），但里面 4 个 `computed` × 6 个组件 = 24 个独立 watcher 在跑相同的派生逻辑。

- **后果**：响应式开销 ×6；切换记录时所有派生重算 6 次；
- **建议**：在 [`RecordDetail.vue`](src/tools/llm-inspector/components/RecordDetail.vue:1) setup 里调用一次后用 `provide('recordDetail', ...)`，子组件 `inject('recordDetail')` 获取。或者干脆把派生数据移到 store 里以 recordId 为 key 缓存。

#### 3.7 Vue 组件层级过深

详情面板的渲染链：

```
RecordDetail (3-tab)
  └─ ResponsePanel (2-segment)
        └─ ResponseStructuredView (2-sub-view)
              └─ StructuredMessagesView (search + scroll)
```

四层组件嵌套，且每一层都有自己的 `mode/subView/activeTab` 局部状态，记录切换时这些状态有的需要重置、有的不重置（见 [`RequestPanel.vue:48`](src/tools/llm-inspector/components/detail/RequestPanel.vue:48) 的 `// 保留模式，不重置` 注释）。

**建议**：把 Tab/Segment/SubView 的当前选择**全部上提到 store**，子组件无状态化。这样：

- 切换记录可统一决定保留 vs 重置；
- 分离窗口时状态能同步；
- 减少 4 层 props/emits 透传。

### 🟢 P2 - 可改可不改

#### 3.8 命名一致性问题

- 同一概念两个名字：`useProxyManager` 文件 / `useInspectorManager` 函数；
- 厂商命名风格不一：`openai-chat`、`anthropic`、`gemini` 用横线，但代码里有时拼成 `OpenAIChat`；
- 注释里大量 `(A1)` `(C1)` `(F1)` `(D4)` 任务编号引用，对刚来的人是噪音（开发期遗物，可以做一遍清理）；

#### 3.9 README.md 严重过时

[`README.md`](src/tools/llm-inspector/README.md:1) 还在讲「本地 HTTP 代理服务」「修改 client api_base」这种 v1 时代的用法，完全没提双层监控、Token 估算、4-Tab 详情等 v2 能力。

**建议**：要么删了（已有 ARCHITECTURE.md），要么改成「用户视角的使用说明」放进 [`docs/user-guide/tools/`](docs/user-guide/tools/) 而非工具自己的根目录。

#### 3.10 `extractContent / extractReasoning` 与 `messageParser` 功能重叠

- 流式场景走 [`extractStream*`](src/tools/llm-inspector/core/utils.ts:265)（utils.ts 内嵌的 ApiFormat 派发）；
- 非流式场景走 [`messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts:1) 的 ParsedMessage 路径；
- ResponseStructuredView 同时消费两条路径，逻辑分叉成两套。

ARCHITECTURE.md 里也承认了这个尴尬：「非流式：返回空，交由 messageParser 处理」（见 [`utils.ts:219`](src/tools/llm-inspector/core/utils.ts:219)）。

**建议**：长期看应该让 `messageParser` 支持「增量 / 部分输入」模式，吃流式 SSE 累积文本，输出 ParsedMessage，从而消除 utils.ts 里的 `extractStream*` 系列。但这是大改造，P2 收着。

#### 3.11 `docs/Plan/` 目录是空的

按项目规范，工具修改计划应放在 [`src/tools/{toolId}/docs/Plan/`](src/tools/llm-inspector/docs/Plan/)，但目前该目录为空。架构文档 [`ARCHITECTURE.md`](src/tools/llm-inspector/ARCHITECTURE.md:1) 里散落着大量「v2.0-α/β/GA」「detail-panel-rework」之类的开发期事件，应该把那些「执行完毕的 plan」归档成 markdown 落到这里（哪怕做一份 `archive/` 子目录），避免架构文档继续吃版本史的负担。

---

## 4. 量化指标

| 指标             | 数值                                                                                                                | 评价               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 总文件数         | 28                                                                                                                  | 中等规模工具       |
| 最大单文件行数   | [`ResponseStructuredView.vue`](src/tools/llm-inspector/components/detail/views/ResponseStructuredView.vue:1) 885 行 | ⚠️ 偏大，可拆      |
| 最大 core 文件   | [`streamMerger.ts`](src/tools/llm-inspector/core/streamMerger.ts:1) 799 行                                          | OK（按厂商分函数） |
| 第二大 core 文件 | [`messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts:1) ~600 行（27K chars）                          | OK                 |
| 第三大 core 文件 | [`utils.ts`](src/tools/llm-inspector/core/utils.ts:1) 613 行                                                        | ⚠️ 杂烩，建议拆    |
| 最大 composable  | [`useProxyManager.ts`](src/tools/llm-inspector/composables/useProxyManager.ts:1) 508 行                             | 🔴 上帝 composable |
| 测试覆盖         | core 层 2 个测试文件                                                                                                | 👍 已有起步        |
| ARCHITECTURE.md  | 323 行 + mermaid                                                                                                    | 👍 优秀            |
| 全局响应式单例   | 3 处（records/streamBuffer/各种 cache）                                                                             | ⚠️ 见 §3.2/§3.4    |

---

## 5. 推荐改进路线（按优先级）

### 阶段一（≤ 半天，纯重构无功能变化）

1. **【P0-3.1】 类型归一化**：选方案 A，把 `types.ts` 拆进 `types/` 目录，加 `types/index.ts` 统一导出。所有外部 import 路径不变（如果之前都是 `../types`，仍然能从 `types/index.ts` 解析）。
2. **【P2-3.8】 文件改名**：`useProxyManager.ts` → `useInspectorManager.ts`。
3. **【P2-3.9】 删除/迁移过期 README**。

### 阶段二（1 天，结构性重构）

4. **【P0-3.3】 拆分 useInspectorManager**：4 个子 composable + 1 个 facade。
5. **【P1-3.5】 拆分 utils.ts**：抽出 `apiFormat.ts` + `contentExtractor.ts`。
6. **【P1-3.4】 LRU 抽象**：新建 `core/lruCache.ts`，三处替换。

### 阶段三（2-3 天，架构升级）

7. **【P0-3.2】 迁移到 Pinia store**：`useInspectorStore` 取代模块级 ref 单例。
8. **【P1-3.6 / 3.7】 状态上提**：详情面板 Tab/Segment/SubView 全部入 store；子组件改用 provide/inject 或直接读 store。
9. **【P2-3.10】 messageParser 增量化**（远期目标，可暂搁）。

### 阶段四（持续）

10. **【P2-3.11】 文档治理**：把 ARCHITECTURE.md 里的开发期叙事（「detail-panel-rework」「(F1)/(C3)」之类）剥离到 `docs/Plan/archive/`，让架构文档稳定描述「现在是什么」而非「怎么演化来的」。

---

## 6. 不建议改的部分

- **hookRegistry 单例**：钩子注册器本身就该是全局唯一，模块级单例是正确选择，不要为了 Pinia 化而硬塞。
- **streamMerger 的厂商分支**：虽然长，但每个 case 都有明确的厂商语义，再抽公共代码会牺牲可读性。
- **shallowRef + 100ms 节流**：性能方案已经验证，别动。
- **`useRecordDetail` 的 props.toRefs 设计**：保持纯函数性质，便于测试。

---

## 7. 风险与决策点

| 改动            | 风险                                        | 决策建议                                                          |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Pinia 迁移      | 影响所有 import；可能破坏分离窗口的状态同步 | 先用 `useInspectorStore` 包装现有 ref，逐步替换                   |
| 类型目录重构    | 几乎无风险，全是 import 路径调整            | **立即做**                                                        |
| Composable 拆分 | LlmInspector.vue 的解构需要重写             | 一次性改完，配 e2e 冒烟测                                         |
| README 删除     | 可能有用户文档链接到此                      | 改成 redirect 到 `docs/user-guide/tools/llm-inspector.md`（新建） |

---

## 8. 结论

LLM Inspector 是一个 **「架构思想清晰、实现细节精致、但承担了过多增量演化负担」** 的工具。它的核心数据流（双层监控 + 状态机 + 流式节流 + Token 偏差对比）质量很高，**问题主要集中在「外围组织」**：类型双轨、单例散落、大 composable、大 utils、子组件 setup 重复。

按上面的三阶段路线推进，可以在不破坏现有功能的前提下，把这个工具从「v2.0 GA」级别带到「v3 Ready」级别——为未来加 TTFB 统计、请求重放、对比、token 趋势 chart 等扩展点扫清路障。
