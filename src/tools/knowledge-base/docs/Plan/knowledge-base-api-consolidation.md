# 知识库模块对外接口治理 · 施工清单

> **状态**: Archived (已完工)
> **作者**: 咕咕
> **创建时间**: 2026-06-02
> **预计工期**: 中等
> **影响范围**: `src/tools/knowledge-base/` · `src/tools/llm-chat/` · 跨模块配置迁移

---

## 1. 背景

当前知识库相关能力的访问路径混乱，违反了"模块自治"原则：

1. **chat 直连后端**：`llm-chat` 模块直接 `invoke("kb_*")` 调用知识库后端命令，绕过了知识库的 service 层
2. **代理配置泛滥**：`chatSettings.knowledgeBase.*` 维护了三个本应属于知识库的配置项（`defaultEngineId`、`embeddingCacheMaxItems`、`retrievalCacheMaxItems`）
3. **配置失效 Bug**：`embeddingCacheMaxItems` 设置项虽在 chat 设置 UI 中存在，但底层 [`vectorCache.ts:135`](src/tools/knowledge-base/utils/vectorCache.ts:135) 硬编码 `maxItems: 500`，用户调节完全不生效
4. **半托管 service**：[`src/tools/llm-chat/services/knowledge-service.ts`](src/tools/llm-chat/services/knowledge-service.ts) 放在 chat 目录下，却直接 import 知识库的 `SearchOrchestrator`，归属错乱

## 2. 目标

**收口知识库模块的对外接口，让消费方（chat 及未来其他工具）只通过 service 门面访问知识库能力。**

具体目标：

- ✅ chat 模块零 `invoke("kb_*")` 直连
- ✅ 所有知识库相关配置归位到 `WorkspaceConfig`，单一可信源
- ✅ `embeddingCacheMaxItems` 配置真正生效
- ✅ 设置 UI 入口统一在知识库本体的 `SettingsView.vue`
- ✅ 知识库内部细节（`SearchOrchestrator`、`vectorCacheManager`、缓存 key 拼接）对外完全隐藏

## 3. 目标架构

```
┌─────────────────────────────────────────┐
│ 消费方 (llm-chat 等)                    │
│ - context-processors/knowledge-processor│
│ - components/agent/editors/KBPlaceholder│
│ 仅调用 ↓                                │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ knowledge-base/services/api.ts (新增)   │ ← 对外门面
│ - search(...)                            │
│ - searchWithCache(...)                   │
│ - getEntries(ids)                        │
│ - loadBaseMeta(kbId, modelId?)           │
│ - clearRetrievalCache()                  │
│ - getRetrievalCacheStats()               │
└──────────────────┬──────────────────────┘
                   │ 内部调用
                   ▼
┌─────────────────────────────────────────┐
│ knowledge-base 内部                     │
│ - stores/knowledgeBaseStore (读 config) │
│ - utils/vectorCache                      │
│ - logic/orchestrator                     │
│ - invoke("kb_*") 后端命令                │
└─────────────────────────────────────────┘
```

## 4. 越界点清查

### 4.1 chat 直连后端命令

| 文件                                                                                                 | 行号 | 命令                       | 替换为                     |
| ---------------------------------------------------------------------------------------------------- | ---- | -------------------------- | -------------------------- |
| [`knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts:26)                  | 26   | `kb_retrieval_cache_get`   | service 内部消化           |
| [`knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts:41)                  | 41   | `kb_retrieval_cache_set`   | service 内部消化           |
| [`knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts:49)                  | 49   | `kb_retrieval_cache_clear` | `clearRetrievalCache()`    |
| [`knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts:58)                  | 58   | `kb_retrieval_cache_stats` | `getRetrievalCacheStats()` |
| [`knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts:383)    | 383  | `kb_get_entries`           | `getEntries(ids)`          |
| [`knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts:427)    | 427  | `kb_load_base_meta`        | `loadBaseMeta(kbId)`       |
| [`knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts:439)    | 439  | `kb_get_entries`           | `getEntries(ids)`          |
| [`KBPlaceholderEditor.vue`](src/tools/llm-chat/components/agent/editors/KBPlaceholderEditor.vue:281) | 281  | `kb_load_base_meta`        | `loadBaseMeta(kbId)`       |

### 4.2 跨域配置

| 配置项                   | 当前位置                     | 迁移到                                         |
| ------------------------ | ---------------------------- | ---------------------------------------------- |
| `defaultEngineId`        | `chatSettings.knowledgeBase` | `WorkspaceConfig.defaultEngineId`              |
| `embeddingCacheMaxItems` | `chatSettings.knowledgeBase` | `WorkspaceConfig.cache.embeddingCacheMaxItems` |
| `retrievalCacheMaxItems` | `chatSettings.knowledgeBase` | `WorkspaceConfig.cache.retrievalCacheMaxItems` |

> ⚠️ **本表只列需要迁移/删除的"chat 全局级配置"。Agent 级别的 [`AgentKnowledgeSettings`](src/tools/llm-chat/types/agent.ts:261) 和 [`AgentKnowledgeBaseConfig`](src/tools/llm-chat/types/agent.ts:117) 一律保留，详见 §4.4。**

### 4.3 错位的 service 文件

| 文件                                                                                                                   | 处理                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`src/tools/llm-chat/services/knowledge-service.ts`](src/tools/llm-chat/services/knowledge-service.ts)                 | 整文件删除，能力转移到 `knowledge-base/services/api.ts` |
| [`src/tools/llm-chat/core/context-utils/knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts) | 整文件删除                                              |

### 4.4 Agent 级配置说明（保留范围）

经过排查，知识库相关配置在 chat 模块下分**三个层级**，本次治理**只动 L1**：

| 层级      | 位置                                                                           | 字段                                                                              | 处置          |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------- |
| L1 全局   | [`chatSettings.knowledgeBase`](src/tools/llm-chat/types/settings.ts:306)       | `defaultEngineId`、`embeddingCacheMaxItems`、`retrievalCacheMaxItems`             | **迁移/删除** |
| L2 Agent  | [`AgentBaseConfig.knowledgeSettings`](src/tools/llm-chat/types/agent.ts:486)   | 9 个字段（见下）                                                                  | **保留**      |
| L2 Agent  | [`AgentBaseConfig.knowledgeBaseConfig`](src/tools/llm-chat/types/agent.ts:483) | `enabled`、`bindings`、`groups`、`autoInjectIfMacroMissing`、`autoInjectPosition` | **保留**      |
| L3 占位符 | `【kb::xxx engineId=... limit=...】`                                           | `engineId`、`limit`、`minScore` 等                                                | **保留**      |

#### 4.4.1 `AgentKnowledgeSettings` 字段清单（保留，UI 见 [`KnowledgeSection.vue:177-301`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue:177)）

| 字段              | UI 控件          | 类型来源                                                | 备注                                     |
| ----------------- | ---------------- | ------------------------------------------------------- | ---------------------------------------- |
| `defaultEngineId` | ElSelect         | [`agent.ts:262`](src/tools/llm-chat/types/agent.ts:262) | ⚠️ fallback 链调整，见 Phase 5.5         |
| `defaultLimit`    | SliderWithInput  | [`agent.ts:270`](src/tools/llm-chat/types/agent.ts:270) | 业务策略，agent 私有                     |
| `defaultMinScore` | SliderWithInput  | [`agent.ts:280`](src/tools/llm-chat/types/agent.ts:280) | 业务策略，agent 私有                     |
| `maxRecallChars`  | SliderWithInput  | [`agent.ts:273`](src/tools/llm-chat/types/agent.ts:273) | 业务策略，agent 私有                     |
| `gateScanDepth`   | SliderWithInput  | [`agent.ts:289`](src/tools/llm-chat/types/agent.ts:289) | 业务策略，agent 私有                     |
| `contextWindow`   | SliderWithInput  | [`agent.ts:296`](src/tools/llm-chat/types/agent.ts:296) | 业务策略，agent 私有                     |
| `enableCache`     | ElSwitch         | [`agent.ts:302`](src/tools/llm-chat/types/agent.ts:302) | 业务策略，agent 私有（与 §6.1 判定一致） |
| `resultTemplate`  | ElInput textarea | [`agent.ts:283`](src/tools/llm-chat/types/agent.ts:283) | 这是 chat 提示词工程，属 agent           |
| `emptyText`       | ElInput          | [`agent.ts:286`](src/tools/llm-chat/types/agent.ts:286) | 这是 chat 提示词工程，属 agent           |

**判定逻辑**：这些字段都是"该 agent 怎么用知识库"的业务策略——召回多少条、分数门槛多少、检索结果怎么塞进 prompt——理应留在 agent 配置里，不该被推到知识库本体。

#### 4.4.2 `engineId` 的三层 fallback 链路（关键发现）

[`knowledge-processor.ts:184-187`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts:184) 当前逻辑：

```ts
const engineId =
  ph.engineId || // L3 占位符
  knowledgeSettings?.defaultEngineId || // L2 agent
  settings.value.knowledgeBase.defaultEngineId || // L1 chat 全局
  "vector"; // L0 硬编码兜底
```

本次治理**删 L1、保留 L2**，新链路为：

```ts
const engineId =
  ph.engineId ||
  knowledgeSettings?.defaultEngineId ||
  kbStore.config.defaultEngineId || // 替换原 L1
  "vector";
```

**更优方案**：把 fallback 逻辑下沉到 `knowledge-base/services/api.ts`，service 的 `search/searchWithCache` 接收可选 `engineId`，内部自己做 fallback。chat 完全不需要知道知识库默认引擎是什么。

## 5. 施工步骤

### Phase 1：扩充知识库配置与设置 UI

#### 1.1 修改 [`src/tools/knowledge-base/config.ts`](src/tools/knowledge-base/config.ts)

**任务**：在 `DEFAULT_WORKSPACE_CONFIG` 中追加缓存配置和默认引擎：

```ts
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  // ...现有字段
  defaultEngineId: "vector",
  cache: {
    embeddingCacheMaxItems: 500,
    retrievalCacheMaxItems: 200,
  },
};
```

#### 1.2 修改 [`src/tools/knowledge-base/types/knowledge-base.ts`](src/tools/knowledge-base/types/knowledge-base.ts)（或对应类型文件）

**任务**：在 `WorkspaceConfig` 类型中增加：

```ts
interface WorkspaceConfig {
  // ...现有字段
  defaultEngineId: string;
  cache: {
    embeddingCacheMaxItems: number;
    retrievalCacheMaxItems: number;
  };
}
```

#### 1.3 修改 [`src/tools/knowledge-base/config.ts`](src/tools/knowledge-base/config.ts) 的 `knowledgeSettingsConfig`

**任务**：新增"缓存管理"分组，包含两个滑块（参考现有 `chatSettings` 中已有的配置项配置，包括范围、步长、tooltip 等）。

放在"向量化请求配置"分组之后。

#### 1.4 顺手修复 [`config.ts:227`](src/tools/knowledge-base/config.ts:227)

**任务**：删除 `tagGenBatchSize` 的 hint 中"目前主要用于向量化"这个错位文案。

---

### Phase 2：修复 `vectorCacheManager` 接通配置

#### 2.1 修改 [`src/tools/knowledge-base/utils/vectorCache.ts`](src/tools/knowledge-base/utils/vectorCache.ts:131)

**任务**：让 `getVector` 内部读取 `knowledgeBaseStore.config.cache.embeddingCacheMaxItems`：

```ts
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";

// 在 getVector 函数内：
const kbStore = useKnowledgeBaseStore();
await invoke("kb_set_embedding_cache", {
  modelId,
  text: query,
  vector,
  maxItems: kbStore.config.cache.embeddingCacheMaxItems,
});
```

**注意**：`vectorCacheManager` 是单例，引入 store 时要注意 pinia 初始化顺序。如果初始化时机不安全，改用 lazy getter 或者把 `maxItems` 作为可选参数传入。

---

### Phase 3：新建对外 service 门面

#### 3.1 新建 `src/tools/knowledge-base/services/api.ts`

**任务**：实现以下导出函数：

```ts
// 不带缓存的纯检索
export async function search(params: {
  query: string;
  kbIds?: string[];
  tags?: string[];
  limit?: number;
  minScore?: number;
  engineId?: string;
  vector?: number[];
  modelId?: string;
}): Promise<SearchResult[]>;

// 带缓存的检索（chat RAG 专用）
export async function searchWithCache(params: {
  userText: string; // 拆开传，service 内部决定融合策略
  aiText: string;
  kbIds: string[];
  tags?: string[];
  limit?: number;
  minScore?: number;
  engineId?: string; // 不传则读 config.defaultEngineId
  enableCache?: boolean;
}): Promise<SearchResult[]>;

// 条目读取
export async function getEntries(ids: string[]): Promise<Caiu[]>;

// 元数据读取
export async function loadBaseMeta(
  kbId: string,
  modelId?: string
): Promise<KnowledgeBaseMeta | null>;

// 缓存管理
export async function clearRetrievalCache(): Promise<void>;
export async function getRetrievalCacheStats(): Promise<number>;
```

**内部实现要点**：

- 所有 `invoke("kb_*")` 调用都在这里
- 所有读 `knowledgeBaseStore.config` 的逻辑都在这里
- `searchWithCache` 内部包揽：
  - 决定 engineId 默认值
  - 拆 user/AI 文本分别 embed
  - 向量加权融合（保留当前 0.7/0.3 策略）
  - 拼缓存 key（保留当前 `userText|||aiText` 策略）
  - 读写 `kb_retrieval_cache_*`
  - 读 `knowledgeBaseStore.config.cache.retrievalCacheMaxItems` 作为容量

---

### Phase 4：chat 端瘦身

#### 4.1 改写 [`src/tools/llm-chat/core/context-processors/knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts)

**任务**：

- 移除所有 `invoke("kb_*")` 调用
- 移除 `vectorCacheManager` 直接调用
- 移除 `buildContextQueryVector`、`weightedAverageVector` 方法（搬到知识库 service 内部）
- 移除 `getRetrievalCache`、`setRetrievalCache` 引用
- `execute()` 主流程改为：

```ts
import {
  searchWithCache,
  getEntries,
  loadBaseMeta,
} from "@/tools/knowledge-base/services/api";

// 在 execute() 中
const { userText, aiText } = this.extractContextParts(context);
results = await searchWithCache({
  userText,
  aiText,
  kbIds,
  limit: finalLimit,
  minScore: finalMinScore,
  engineId, // 可选，不传则用知识库默认
  enableCache: agentConfig.knowledgeSettings?.enableCache ?? false,
});
```

- `handleStaticMode` 和 `handleStaticAll` 中的 `kb_get_entries`、`kb_load_base_meta` 改为调用 service

**保留**：`extractContextParts`（这是 chat 的对话历史提取逻辑，属于 chat 自己的职责）。

#### 4.2 修改 [`src/tools/llm-chat/components/agent/editors/KBPlaceholderEditor.vue:281`](src/tools/llm-chat/components/agent/editors/KBPlaceholderEditor.vue:281)

**任务**：把 `invoke("kb_load_base_meta")` 改为 `loadBaseMeta(kbId)`。

#### 4.3 删除文件

- 删除 [`src/tools/llm-chat/services/knowledge-service.ts`](src/tools/llm-chat/services/knowledge-service.ts)
- 删除 [`src/tools/llm-chat/core/context-utils/knowledge-cache.ts`](src/tools/llm-chat/core/context-utils/knowledge-cache.ts)
- 检查并清理所有 import 引用

---

### Phase 5：移除 chat 端的代理配置

> ⚠️ **重要警示**：本 Phase 只动 `chatSettings.knowledgeBase`（L1 全局），**严禁触碰 `agent.knowledgeSettings`（L2 agent 级）**——后者是 agent 业务配置，需要完整保留。详见 §4.4。

#### 5.1 修改 [`src/tools/llm-chat/types/settings.ts:306-313`](src/tools/llm-chat/types/settings.ts:306)

**任务**：删除 `chatSettings.knowledgeBase` 整个字段（或保留为空对象以便未来扩展 chat 自己的知识库相关配置，如 `enableCache` 等 agent 级开关）。

具体保留范围视实际情况判断——目前看三个字段都该删。

**注意**：不要误删 [`agent.ts:486`](src/tools/llm-chat/types/agent.ts:486) 的 `AgentBaseConfig.knowledgeSettings`，那是 agent 级别的配置，跟这里完全不同。

#### 5.2 修改 [`src/tools/llm-chat/components/settings/settingsConfig.ts:1742-1783`](src/tools/llm-chat/components/settings/settingsConfig.ts:1742)

**任务**：

- 删除"知识库设置"分组中的 `embeddingCacheMaxItems`、`retrievalCacheMaxItems` 两个滑块
- 保留 `kbEmbeddingModelInfo` 那个"当前 Embedding 模型"信息展示组件（它只读不写）
- 视情况是否保留整个分组（取决于是否还有其他配置项）

#### 5.3 修改 [`src/tools/llm-chat/types/settings.ts`](src/tools/llm-chat/types/settings.ts) 的 `DEFAULT_SETTINGS`

**任务**：同步删除 `knowledgeBase` 默认值（[`settings.ts:466-471`](src/tools/llm-chat/types/settings.ts:466) 附近）。

#### 5.4 写设置迁移逻辑

**任务**：在 chat 设置初始化时，检测旧的 `chatSettings.knowledgeBase.*` 字段并迁移到 `knowledgeBaseStore.config`：

- 位置：可在 `useChatSettings` 初始化处或专门的 migration 文件
- 逻辑：
  1. 读旧配置（如果存在）
  2. 写入 `knowledgeBaseStore.config.defaultEngineId` / `.cache.*`
  3. 持久化 `knowledgeBaseStore`
  4. 从 `chatSettings` 中清除旧字段
- **谨慎**：迁移只跑一次，需要标记位防止重复执行
- **范围警示**：迁移只处理 `chatSettings.knowledgeBase.*`，**不要碰 `agent.knowledgeSettings.*`**（每个 agent 自己维护，无需迁移）

---

### Phase 5.5：调整 engineId fallback 链与 KnowledgeSection 残留

#### 5.5.1 修改 [`src/tools/llm-chat/core/context-processors/knowledge-processor.ts:184-187`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts:184)

**任务**：删除 L1 chat 全局的 fallback 层。

**首选方案（推荐）**：fallback 逻辑下沉到 service，processor 不再关心默认值：

```ts
// processor 中
const engineId = ph.engineId || knowledgeSettings?.defaultEngineId || undefined; // 让 service 内部决定

// service 内部
function resolveEngineId(input?: string): string {
  return input || kbStore.config.defaultEngineId || "vector";
}
```

**备选方案**：processor 直接读知识库 store：

```ts
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";
const kbStore = useKnowledgeBaseStore();

const engineId =
  ph.engineId ||
  knowledgeSettings?.defaultEngineId ||
  kbStore.config.defaultEngineId ||
  "vector";
```

#### 5.5.2 修复 [`KnowledgeSection.vue:42`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue:42) 硬编码

**任务**：当前初始化把 `defaultEngineId` 写死为 `"blender"`，这违反了 fallback 语义（用户没主动选过就不该有具体值）。

```ts
// 当前
editForm.knowledgeSettings = {
  defaultEngineId: "blender", // ❌ 硬编码
  // ...
};

// 改为
editForm.knowledgeSettings = {
  defaultEngineId: undefined, // ✅ 让 processor 走 fallback
  // ...
};
```

#### 5.5.3 优化 [`KnowledgeSection.vue:186-191`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue:186) 引擎下拉选项

**任务**：ElSelect 选项首位增加"使用知识库默认"占位项，让用户能显式表达"跟随全局"语义。

```ts
options: () => [
  {
    label: "使用知识库默认",
    value: "",
    description: "跟随知识库设置中的默认引擎",
  },
  ...kbStore.engines.map((e) => ({
    label: `${e.name} (${e.id})`,
    value: e.id,
    description: e.description,
  })),
],
```

同步把 [`L183`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue:183) 的 hint 改为"通过占位符引用知识库时使用的默认检索引擎，留空则跟随知识库设置"。

---

### Phase 6：验证与收尾

#### 6.1 运行检查

- `bun run check:frontend` —— 确认 TS 类型通过
- `bun run check:backend` —— 确认 Rust 编译通过（理论上不该影响后端）
- `bun run check` —— 全量

#### 6.2 手动测试清单

- [ ] 知识库设置页能看到新的缓存配置项
- [ ] 调整 `embeddingCacheMaxItems` 后，后端实际存储数量符合预期（看日志或重启验证）
- [ ] chat 中触发 RAG 检索，能正常命中两层缓存
- [ ] chat 中的 `【kb】` 占位符、`static::all` 模式、`KBPlaceholderEditor` 选择面板均正常
- [ ] 老用户升级后，原有的 chat 知识库配置自动迁移到新位置，旧字段被清除
- [ ] 跨工具一致性：知识库自己的搜索面板与 chat 中的检索使用同一份配置
- [ ] **Agent 编辑器 → 知识库 tab**：原 `knowledgeSettings.*` 9 个字段全部正常显示、可编辑、可保存
- [ ] **引擎 fallback 链**：agent 不设 `defaultEngineId`（留空）时，能正确回退到知识库默认引擎；agent 显式选了就用 agent 的
- [ ] **新建 Agent**：默认配置中 `knowledgeSettings.defaultEngineId` 为 `undefined`，不再写死 `"blender"`

#### 6.3 文档更新

- 更新 [`docs/architecture/embedding-infrastructure.md`](docs/architecture/embedding-infrastructure.md)（如有相关描述）
- 更新 [`src/tools/llm-chat/docs/architecture/context-pipeline.md`](src/tools/llm-chat/docs/architecture/context-pipeline.md) 中关于知识库缓存的章节
- 本文件状态从 `Draft` 改为 `Implementing` → 完工后改 `Archived`

---

## 6. 待确认事项

### 6.1 `enableCache` 字段归属

当前 `agentConfig.knowledgeSettings.enableCache` 是 **agent 级别**的开关。建议保留——agent 决定要不要用缓存（业务策略），知识库决定缓存容量（基础设施）。**双层结构合理，不动**。

### 6.2 `defaultEngineId` 与 `searchSettings.engineId` 关系

知识库本身已有 `searchSettings.engineId`（运行时切换，未持久化）。新加的 `defaultEngineId` 是持久化的默认值。

**建议**：

- `WorkspaceConfig.defaultEngineId` —— 持久化默认值（新增）
- `searchSettings.engineId` —— session 内临时覆盖（保留）
- 应用启动时 `searchSettings.engineId = config.defaultEngineId`

### 6.3 `searchWithCache` 参数设计

**采用方案**：service 接收 `(userText, aiText)` 双参数，融合策略在 service 内部实现。

**理由**：

- 缓存 key 拼接逻辑由 service 内部决定，chat 不需要关心
- 未来如果调整权重（如 0.7/0.3 → 0.8/0.2），只改一处
- 如果其他工具未来也要做类似的 RAG，可以复用

**代价**：知识库 service 需要知道 "user/AI" 这种 chat 语义。可以通过更通用的命名（如 `primaryQuery` / `secondaryQuery` + 可选 weights）来淡化。

**最终建议**：service 参数命名用语义通用版：

```ts
searchWithCache({
  primaryQuery: userText,
  secondaryQuery: aiText,
  fusionWeights: [0.7, 0.3], // 可选，有默认
  // ...其他参数
});
```

## 7. 风险评估

| 风险                                                           | 等级  | 缓解                                                                                                   |
| -------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| `vectorCacheManager` 引入 pinia store 导致循环依赖             | 🟡 中 | 用 lazy getter 或者 maxItems 作为参数传入                                                              |
| 老用户配置迁移失败                                             | 🟡 中 | 加 try/catch + 日志 + 迁移标记位                                                                       |
| chat 端某些 KB 占位符场景遗漏适配                              | 🟢 低 | 手动测试清单覆盖                                                                                       |
| 删除 `knowledge-service.ts` 影响其他未发现的引用               | 🟢 低 | 全局搜索 import 路径确认                                                                               |
| **误删 `agent.knowledgeSettings` 导致 agent 业务配置丢失**     | 🔴 高 | Plan §5.1 与 §4.4 显式标注"只动 chatSettings.knowledgeBase，不动 agent.knowledgeSettings"              |
| **`engineId` fallback 链调整后旧 agent 行为变化**              | 🟡 中 | agent.knowledgeSettings.defaultEngineId 已存在的值会继续生效，影响仅限"agent 从未设置过 engine 的场景" |
| **KnowledgeSection.vue 中硬编码 `"blender"` 与新默认值不一致** | 🟡 中 | Phase 5.5 一并修复                                                                                     |

## 8. 验收标准

- ✅ `grep -r "invoke.*kb_" src/tools/llm-chat/` 零结果
- ✅ `grep -r "chatSettings.knowledgeBase" src/` 零结果
- ✅ `grep -r "settings\.value\.knowledgeBase" src/tools/llm-chat/` 零结果（chat 全局配置访问被清理）
- ✅ `grep -r "knowledgeSettings\." src/tools/llm-chat/` 仍有结果（确认 agent 级别保留）
- ✅ `grep -r "embeddingCacheMaxItems" src/tools/knowledge-base/` 至少 3 处（类型、默认值、UI、读取）
- ✅ KnowledgeSection.vue 初始化中 `defaultEngineId` 不再硬编码 `"blender"`
- ✅ 知识库设置页能看到"缓存管理"分组，调整值可持久化
- ✅ `vectorCacheManager.getVector` 实际传给后端的 `maxItems` 等于用户配置值
- ✅ 所有 `bun run check` 通过
- ✅ 手动测试清单全部通过

---

## 附录：相关文件清单

### 修改

- [`src/tools/knowledge-base/config.ts`](src/tools/knowledge-base/config.ts)
- [`src/tools/knowledge-base/types/knowledge-base.ts`](src/tools/knowledge-base/types/knowledge-base.ts)
- [`src/tools/knowledge-base/utils/vectorCache.ts`](src/tools/knowledge-base/utils/vectorCache.ts)
- [`src/tools/llm-chat/core/context-processors/knowledge-processor.ts`](src/tools/llm-chat/core/context-processors/knowledge-processor.ts)
- [`src/tools/llm-chat/components/agent/editors/KBPlaceholderEditor.vue`](src/tools/llm-chat/components/agent/editors/KBPlaceholderEditor.vue)
- [`src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeSection.vue)（Phase 5.5：修复硬编码 + ElSelect 占位项）
- [`src/tools/llm-chat/types/settings.ts`](src/tools/llm-chat/types/settings.ts)
- [`src/tools/llm-chat/components/settings/settingsConfig.ts`](src/tools/llm-chat/components/settings/settingsConfig.ts)

### 新增

- `src/tools/knowledge-base/services/api.ts`

### 删除

- `src/tools/llm-chat/services/knowledge-service.ts`
- `src/tools/llm-chat/core/context-utils/knowledge-cache.ts`

### 涉及但不一定改动

- [`src/tools/knowledge-base/stores/knowledgeBaseStore.ts`](src/tools/knowledge-base/stores/knowledgeBaseStore.ts)（确认 config 字段同步保存）
- [`src/tools/knowledge-base/views/SettingsView.vue`](src/tools/knowledge-base/views/SettingsView.vue)（自动渲染新配置项，应该无需改动）

### 明确保留（不要动）

- [`src/tools/llm-chat/types/agent.ts:261-303`](src/tools/llm-chat/types/agent.ts:261) - `AgentKnowledgeSettings` 接口（agent 级业务配置）
- [`src/tools/llm-chat/types/agent.ts:117-140`](src/tools/llm-chat/types/agent.ts:117) - `AgentKnowledgeBaseConfig` 接口（agent 关联知识库 bindings）
- [`src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeBaseItem.vue`](src/tools/llm-chat/components/agent/agent-editor/sections/KnowledgeBaseItem.vue) - agent 单个 KB 绑定的 UI 项
- KnowledgeSection.vue 中除 §5.5.2 / §5.5.3 之外的所有代码
