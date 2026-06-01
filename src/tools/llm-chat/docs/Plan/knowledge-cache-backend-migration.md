# 知识库 RAG 检索缓存后端化改造计划

> **状态**: Draft  
> **作者**: 咕咕  
> **日期**: 2025-12-01  
> **范围**: `llm-chat` 工具的知识库检索缓存层 + `extractContextParts` 行为修复  
> **相关模块**: `src/tools/llm-chat/core/context-processors/knowledge-processor.ts`、`src/tools/llm-chat/core/context-utils/knowledge-cache.ts`、`src-tauri/src/knowledge/`

---

## 1. 背景与目标

### 1.1 当前缓存现状

知识库相关共有三层缓存，分布在前后端：

| 层级                           | 位置                                                                 | 状态                                                                                                  | 说明                                                             |
| ------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **L1 Embedding 向量缓存**      | [`vectorCache.ts`](../../../knowledge-base/utils/vectorCache.ts)     | ✅ 已有后端层 ([`kb_get_embedding_cache`](../../../../../src-tauri/src/knowledge/commands/vector.rs)) | 三级路径：JS 内存 → 后端 → LLM API                               |
| **L2 RAG 检索结果缓存**        | [`KBSessionCache`](../../core/context-utils/knowledge-cache.ts)      | ❌ 纯前端                                                                                             | 按 `sessionId` 隔离，应用关闭即丢                                |
| **L3 检索历史 `TurnRecord[]`** | [`getSessionHistory()`](../../core/context-utils/knowledge-cache.ts) | ❌ 纯前端                                                                                             | 仅调试用，未参与命中判定（已废弃，由全局 `kb-monitor` 机制平替） |

### 1.2 痛点

L2 缓存与 L3 历史的问题：

1. **跨窗口/跨工具不共享** — 主窗口、分离窗口各持一份
2. **应用关闭即丢** — 无持久化（本次改造也暂不引入磁盘持久化，依赖后端进程级存活即可）
3. **按 sessionId 隔离命中率低** — 同一查询在不同会话/不同 agent 间无法复用
4. **预设污染检索查询** — [`extractContextParts()`](../../core/context-processors/knowledge-processor.ts) 没区分 `sourceType`，预设里的示例对话会被当成"历史轮次"参与查询构造，导致：
   - 检索查询语义不准
   - 预设变动会无意义地刷新缓存
5. **已有废弃代码未清理** — `findSimilar`/`cosineSimilarity`/`TurnRecord.queryVector`
6. **L3 历史重复造轮子且无人消费** — `TurnRecord` 仅在 `knowledge-processor.ts` 中被 push，没有任何 UI 消费它。而知识库模块早已实现了基于 Tauri 事件流的全局 `kb-monitor` 监控系统（[`MonitorView.vue`](../../../knowledge-base/views/MonitorView.vue)），`TurnRecord` 属于死代码。

### 1.3 目标

- [x] 把 L2 缓存搬到后端，进程级存活、跨窗口共享
- [x] 取消 sessionId 隔离，改为**全局共享**
- [x] Cache key 包含所有"影响检索结果"的参数，并用 SHA-256 哈希
- [x] 修复 `extractContextParts` 只取 `session_history` 类型消息
- [x] **彻底删除 L3 检索历史 `TurnRecord` 及其关联的 `sessionCaches` 内存 Map**，统一由全局 `kb-monitor` 机制接管
- [x] 清理废弃代码

---

## 2. 设计方案

### 2.1 后端缓存设计

#### 2.1.1 状态层（[`state.rs`](../../../../../src-tauri/src/knowledge/state.rs)）

新增 `retrieval_cache` 字段：

```rust
// state.rs

/// 缓存的检索结果（含可选查询向量）
#[derive(Clone, Serialize, Deserialize)]
pub struct CachedRetrievalEntry {
    pub results: Vec<SearchResult>,
    pub vector: Option<Vec<f32>>,
}

/// Key 为 SHA-256 字符串，Value 为 (结果, 最后访问时间戳)
pub type RetrievalCache = HashMap<String, (CachedRetrievalEntry, u64)>;

pub struct KnowledgeState {
    // ... 已有字段
    /// 全局 RAG 检索结果缓存（不按 session 隔离）
    pub retrieval_cache: Arc<RwLock<RetrievalCache>>,
}
```

#### 2.1.2 命令层（新文件 `src-tauri/src/knowledge/commands/retrieval_cache.rs`）

```rust
use crate::knowledge::core::SearchResult;
use crate::knowledge::state::{CachedRetrievalEntry, KnowledgeState};
use sha2::{Digest, Sha256};
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalCacheInput {
    pub query: String,
    pub kb_ids: Vec<String>,
    pub tags: Vec<String>,
    pub limit: u32,
    pub min_score: f32,
    pub engine_id: String,
    pub model_id: String,
}

/// 后端统一哈希函数：对参数进行规范化（排序）后哈希
fn build_cache_key(input: &RetrievalCacheInput) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.query.as_bytes());
    hasher.update(b"\0");

    let mut kb_ids = input.kb_ids.clone();
    kb_ids.sort();
    hasher.update(kb_ids.join(",").as_bytes());
    hasher.update(b"\0");

    let mut tags = input.tags.clone();
    tags.sort();
    hasher.update(tags.join(",").as_bytes());
    hasher.update(b"\0");

    hasher.update(input.limit.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.min_score.to_le_bytes());
    hasher.update(b"\0");
    hasher.update(input.engine_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(input.model_id.as_bytes());

    format!("{:x}", hasher.finalize())
}

#[tauri::command]
pub async fn kb_retrieval_cache_get(
    state: State<'_, KnowledgeState>,
    input: RetrievalCacheInput,
) -> Result<Option<CachedRetrievalEntry>, String> {
    let key = build_cache_key(&input);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 命中后更新时间戳（LRU 触发）
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取缓存写锁失败".to_string())?;

    if let Some((entry, ts)) = cache.get_mut(&key) {
        *ts = now;
        return Ok(Some(entry.clone()));
    }
    Ok(None)
}

#[tauri::command]
pub async fn kb_retrieval_cache_set(
    state: State<'_, KnowledgeState>,
    input: RetrievalCacheInput,
    entry: CachedRetrievalEntry,
    max_items: usize,
) -> Result<(), String> {
    let key = build_cache_key(&input);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取缓存写锁失败".to_string())?;

    // LRU 淘汰：超量删除最旧 20%
    if cache.len() >= max_items {
        let mut items: Vec<(String, u64)> =
            cache.iter().map(|(k, (_, ts))| (k.clone(), *ts)).collect();
        items.sort_by_key(|(_, ts)| *ts);

        let delete_count = (max_items / 5).max(1);
        for (k, _) in items.iter().take(delete_count) {
            cache.remove(k);
        }
    }

    cache.insert(key, (entry, now));
    Ok(())
}

#[tauri::command]
pub async fn kb_retrieval_cache_clear(
    state: State<'_, KnowledgeState>,
) -> Result<(), String> {
    let mut cache = state
        .retrieval_cache
        .write()
        .map_err(|_| "获取缓存写锁失败".to_string())?;
    cache.clear();
    Ok(())
}

#[tauri::command]
pub async fn kb_retrieval_cache_stats(
    state: State<'_, KnowledgeState>,
) -> Result<usize, String> {
    let cache = state
        .retrieval_cache
        .read()
        .map_err(|_| "获取缓存读锁失败".to_string())?;
    Ok(cache.len())
}
```

#### 2.1.3 注册（[`commands.rs`](../../../../../src-tauri/src/knowledge/commands.rs) + [`lib.rs`](../../../../../src-tauri/src/lib.rs)）

```rust
// commands.rs
pub mod retrieval_cache;

// lib.rs - tauri::generate_handler!
knowledge::retrieval_cache::kb_retrieval_cache_get,
knowledge::retrieval_cache::kb_retrieval_cache_set,
knowledge::retrieval_cache::kb_retrieval_cache_clear,
knowledge::retrieval_cache::kb_retrieval_cache_stats,
```

### 2.2 前端改造

#### 2.2.1 [`knowledge-cache.ts`](../../core/context-utils/knowledge-cache.ts) 瘦身

**删除**：

- `KBSessionCache` 类（含 `findSimilar`/`cosineSimilarity`/`add`/`findByText` 等）
- `getSessionRetrievalCache()`
- `clearSessionCache()`、`clearAllCaches()` 中 retrieval 相关部分
- `TurnRecord` 接口及 `TurnRecord.queryVector` 字段
- `getSessionHistory()`
- `getCacheStats()`
- `sessionCaches` 内存 Map（由于 L2 搬走、L3 删除，此 Map 彻底空了，直接移除）
- 全部 `@deprecated` 标记的代码

**新增薄壳函数**：

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface RetrievalCacheInput {
  query: string;
  kbIds: string[];
  tags: string[];
  limit: number;
  minScore: number;
  engineId: string;
  modelId: string;
}

export interface CachedRetrievalEntry {
  results: SearchResult[];
  vector: number[] | null;
}

export async function getRetrievalCache(
  input: RetrievalCacheInput
): Promise<CachedRetrievalEntry | null> {
  try {
    return await invoke<CachedRetrievalEntry | null>("kb_retrieval_cache_get", {
      input,
    });
  } catch (err) {
    logger.warn("读取后端检索缓存失败", err);
    return null;
  }
}

export async function setRetrievalCache(
  input: RetrievalCacheInput,
  entry: CachedRetrievalEntry,
  maxItems: number
): Promise<void> {
  try {
    await invoke("kb_retrieval_cache_set", { input, entry, maxItems });
  } catch (err) {
    logger.warn("写入后端检索缓存失败", err);
  }
}

export async function clearAllRetrievalCache(): Promise<void> {
  try {
    await invoke("kb_retrieval_cache_clear");
  } catch (err) {
    logger.warn("清空后端检索缓存失败", err);
  }
}
```

#### 2.2.2 [`knowledge-processor.ts`](../../core/context-processors/knowledge-processor.ts) 改造

**位置：第 154~281 行**

**当前逻辑**：

```typescript
const sessionCache = getSessionRetrievalCache(sessionId, ...);
// ...
const cacheKey = `${userText}|||${aiText}`;
let cached = enableCache ? sessionCache.findByText(cacheKey) : null;
```

**改造后**：

```typescript
// 不再需要 sessionCache 变量
const { userText, aiText } = this.extractContextParts(context);

// 构造完整的检索参数（用于缓存 key 和实际检索）
const kbIds: string[] = /* 从 agent 配置提取，同原逻辑 */;
const finalLimit = ph.limit || knowledgeSettings?.defaultLimit || 5;
const finalMinScore = ph.minScore || knowledgeSettings?.defaultMinScore || 0.3;

// 1. 先用裸 query 尝试命中缓存（用户文本可能尚未预处理）
//    Tags 此时为空，命中后跳过预处理
const cacheInput: RetrievalCacheInput = {
  query: `${userText}|||${aiText}`,  // 合并 user/AI 文本作为查询主体
  kbIds,
  tags: [],  // 注意：缓存阶段不预处理 tags（除非姐姐改主意）
  limit: finalLimit,
  minScore: finalMinScore,
  engineId,
  modelId: pureModelId,
};

let cached = enableCache ? await getRetrievalCache(cacheInput) : null;
if (cached) {
  results = cached.results;
  vector = cached.vector;
  logger.debug("命中后端 RAG 检索缓存");
} else {
  // 走完整检索流程（同原逻辑）...

  // 检索完写回缓存
  if (enableCache) {
    await setRetrievalCache(
      cacheInput,
      { results, vector },
      settings.value.knowledgeBase.retrievalCacheMaxItems
    );
  }
}
```

> **⚠️ 注意一个小细节**：原逻辑中 `tags` 是 `preprocessQuery` 提取的，依赖 `query` 内容。如果把 tags 也放进 cache key，相同 query 会得到相同 tags，等价于不放（除非未来允许外部传入 tags）。**为保持简单，初版 cache key 中 tags 数组始终为空数组**，反正它由 query 唯一决定。

#### 2.2.3 [`llmChatStore.ts`](../../stores/llmChatStore.ts) 清理

```typescript
// 第 37-40 行
import {} from // clearSessionCache,  ← 删除
// clearAllCaches,     ← 删除（或保留用于"清空所有缓存"按钮）
"../core/context-utils/knowledge-cache";

// 第 423-425 行
// clearSessionCache(sessionId);  ← 删除整行

// 第 482-484 行
// clearSessionCache(sessionId);  ← 删除整行
```

> 由于缓存全局共享，会话删除时不需要清理任何缓存。如果用户改了 binding/limit，旧 key 会自然失效（不会再被查询命中），最终被 LRU 淘汰。

#### 2.2.4 修复 [`extractContextParts()`](../../core/context-processors/knowledge-processor.ts) 的预设污染

**位置：第 492~546 行**

```typescript
private extractContextParts(context: PipelineContext): {
  userText: string;
  aiText: string;
} {
  const { messages, agentConfig } = context;
  const windowSize = /* 同原逻辑 */;

  // ★ 新增：过滤出真实历史消息
  //   排除 agent_preset / depth_injection / anchor_injection / merged 等"非历史"消息
  //   仅保留 session_history 类型
  const historyOnly = messages.filter(
    (m) => m.sourceType === "session_history"
  );

  // 原逻辑：在 historyOnly 上按轮次提取（不再用 messages）
  const userParts: string[] = [];
  const aiParts: string[] = [];
  let i = historyOnly.length - 1;
  let roundCount = 0;

  while (i >= 0 && roundCount < windowSize) {
    while (i >= 0 && historyOnly[i].role !== "user") i--;
    if (i < 0) break;

    const userIdx = i;
    const userContent = historyOnly[userIdx].content;
    if (typeof userContent === "string" && userContent.trim()) {
      userParts.unshift(userContent.trim());
    }

    for (let j = userIdx + 1; j < historyOnly.length; j++) {
      const msg = historyOnly[j];
      if (msg.role === "user") break;
      if (typeof msg.content !== "string") continue;

      if (msg.role === "assistant" && msg.content.trim()) {
        aiParts.unshift(msg.content.trim());
      } else if (msg.role === "tool" && msg.content.trim()) {
        aiParts.unshift(msg.content.trim());
      }
    }

    roundCount++;
    i = userIdx - 1;
  }

  return {
    userText: userParts.join("\n"),
    aiText: aiParts.join("\n"),
  };
}
```

**边界确认**：

- [`session-loader.ts`](../../core/context-processors/session-loader.ts) 在 primary pipeline 阶段就为每一条历史消息节点打上 `sourceType: "session_history"`（包括 pending input 虚拟节点）。该字段远早于知识库出现，是会话消息的通用元数据。
- 当前正在发送的用户消息以 pending input 形式注入，也带 `session_history` 标记，因此严格过滤是安全的。
- **不需要做兜底**：若过滤后为空，说明 primary pipeline 上游出了问题，应该暴露而非隐藏（兜底回退到全量消息反而会重新引入预设污染，违背本次改造目标）。

### 2.3 设置项调整

#### 2.3.1 [`types/settings.ts`](../../types/settings.ts)（第 311-313 行）

```typescript
/** 检索结果缓存最大条目数（全局共享，不再按 session 隔离） */
retrievalCacheMaxItems: number;
```

#### 2.3.2 [`settingsConfig.ts`](../../components/settings/settingsConfig.ts)（第 1768-1779 行）

- 默认值：`30` → **`200`**
- 最大值：建议从 30 提到 `1000`
- 描述更新："全局共享的知识库检索结果缓存最大数量。所有会话共用，按 LRU 策略淘汰。"

---

## 3. 实施步骤

| #   | 端   | 文件                                                                             | 类型                                      |
| --- | ---- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Rust | [`state.rs`](../../../../../src-tauri/src/knowledge/state.rs)                    | 新增字段、新增类型定义                    |
| 2   | Rust | `src-tauri/src/knowledge/commands/retrieval_cache.rs`                            | 新建文件                                  |
| 3   | Rust | [`commands.rs`](../../../../../src-tauri/src/knowledge/commands.rs)              | 导出模块                                  |
| 4   | Rust | [`lib.rs`](../../../../../src-tauri/src/lib.rs)                                  | 注册 4 个 command                         |
| 5   | TS   | [`knowledge-cache.ts`](../../core/context-utils/knowledge-cache.ts)              | 大幅瘦身 + 新增薄壳函数                   |
| 6   | TS   | [`knowledge-processor.ts`](../../core/context-processors/knowledge-processor.ts) | 改造缓存调用 + 修复 `extractContextParts` |
| 7   | TS   | [`llmChatStore.ts`](../../stores/llmChatStore.ts)                                | 清理 `clearSessionCache` 调用             |
| 8   | TS   | [`types/settings.ts`](../../types/settings.ts)                                   | 注释更新 + 默认值调整                     |
| 9   | TS   | [`settingsConfig.ts`](../../components/settings/settingsConfig.ts)               | UI 文案 + 范围调整                        |
| 10  | Doc  | [`ARCHITECTURE.md`](../../ARCHITECTURE.md)                                       | 同步架构说明（可选）                      |

**建议执行顺序**：先后端（步骤 1-4）跑通 `cargo check` → 再前端薄壳层（步骤 5）→ 接入业务（步骤 6-7）→ UI（步骤 8-9）→ 文档（步骤 10）。

---

## 4. 验证清单

- [-] `cargo check` 后端通过
- [-] `bun run check:frontend` 前端通过
- [ ] 同一会话连发两条相同的话，第二条命中后端缓存（日志可见）
- [ ] **跨会话**发相同的话，能命中缓存
- [ ] 改 agent 的 `kb binding`/`limit`/`minScore` 后，原 cache key 失效（不命中）
- [ ] 预设里含示例对话的 agent，检索查询不再包含预设内容（对比改造前后 `extractContextParts` 输出）
- [ ] 删除会话不报错（`clearSessionCache` 已移除）
- [ ] 重启应用后缓存清空（符合预期，本次不引入持久化）

---

## 5. 未来扩展（不在本次范围）

1. **磁盘持久化**：用 `configManager` 落盘 `retrieval_cache.json`，重启后保留
2. **TTL**：每条缓存加过期时间，后端定时清理
3. **缓存预热**：常用查询启动时预加载
4. **缓存监控页扩展**：在已有的 [`MonitorView.vue`](../../../knowledge-base/views/MonitorView.vue) 中，增加 Cache 命中率/容量/淘汰统计的展示

---

## 6. 风险与回滚

| 风险                                     | 影响                              | 缓解                                  |
| ---------------------------------------- | --------------------------------- | ------------------------------------- |
| 后端缓存被错误 key 命中（哈希碰撞）      | 返回错误结果                      | SHA-256 概率可忽略                    |
| `extractContextParts` 修复后查询语义改变 | 旧 cache key 全部失效，需重新积累 | 一次性事件，可接受                    |
| `sourceType` 未标记的旧消息漏判          | 部分会话查询变空                  | session-loader 强制标记，不存在此风险 |
| 后端服务异常导致缓存调用失败             | 降级为不缓存（每次实查）          | 薄壳函数已 `try/catch`，不阻塞主流程  |

**回滚方案**：保留旧 `KBSessionCache` 代码到一个 `legacy/` 子目录，通过设置开关切换前后端缓存（如果担心首次上线风险）。本计划默认不引入开关，直接替换。
