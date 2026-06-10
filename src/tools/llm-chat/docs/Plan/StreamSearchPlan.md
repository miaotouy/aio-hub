# 施工文档：LLM 聊天搜索流式返回重构计划（实施完成）

> 状态：完成（2026-06-10）
> 前后端编译检查均已通过。

本篇文档详细记录了将 LLM 聊天数据搜索（智能体与会话全文搜索）重构为流式返回（Stream）的技术方案与实施步骤。

---

## 1. 背景与目标

### 现状

目前 `src-tauri/src/commands/llmchat_search.rs` 中的 `search_llm_data` 采用**一次性返回**机制：

1. 扫描 `agents` 和 `sessions` 目录下的所有 JSON 文件。
2. 并发读取、解析并进行正则/多关键词匹配。
3. 在后端进行全局排序（匹配数降序 -> 更新时间降序）。
4. 截取前 `limit` 条（默认 500 条）一次性返回给前端。

### 痛点

当用户会话（Sessions）数量较多或单个会话文件较大时，解析所有 JSON 并进行全局排序会产生明显的首字节延迟（TTFB），导致前端搜索框出现短暂的“卡死”或无响应感。

### 目标

1. **流式返回**：采用 Tauri v2 的 `Channel` 机制，边搜索边分批推送结果，让前端能够瞬间展示第一批匹配项。
2. **前端动态排序**：在前端对陆续接收到的数据进行动态插入排序，保证最终呈现的排序质量与重构前一致。
3. **取消机制**：支持在用户连续输入时，自动取消上一次未完成的搜索，避免无用的磁盘 I/O 和 IPC 开销。

---

## 2. 架构设计

### 2.1. 后端流式推送机制 (Tauri v2 Channel)

Tauri v2 提供了强类型的 `tauri::ipc::Channel`，非常适合用于单次 IPC 调用中的流式数据传输。

```
+------------------+                 +--------------------+
|   Rust 后端      |                 |   Vue 前端         |
|                  |                 |                    |
|  [搜索线程池]    |                 |  [useLlmSearch]    |
|        |         |                 |         |          |
|  (搜到新结果)    |                 |         |          |
|        v         |                 |         v          |
|  mpsc::channel   |                 |   调用命令并传入    |
|        |         |                 |   Channel 监听器   |
|        v         |                 |         |          |
|  [主消费循环]    |                 |         |          |
|  分批打包结果    |                 |         |          |
|        |         |                 |         |          |
|        +------------(Channel)--------------->+          |
|                  |  推送 ResultBatch |   动态合并并排序 |
|                  |                   |   更新 UI 渲染   |
+------------------+                 +--------------------+
```

### 2.2. 排序逻辑的妥协与重建

- **后端限制**：由于是边搜边发，后端在发送第一批数据时，无法预知后面尚未解析的文件中是否有匹配度更高、时间更新的数据。因此，**无法在后端做到完美的流式全局排序**。
- **解决方案**：
  1. **后端局部排序**：后端每搜到一定数量（如 10 条）或每隔一定时间（如 100ms），对当前批次进行排序并发送。
  2. **前端动态重排**：前端维护一个统一的结果列表，每当收到新批次时，将新数据追加进去，并**在前端执行一次轻量级的重新排序**（JS 对几百条数据进行排序耗时通常小于 1ms，完全不会造成卡顿）。

---

## 3. 实施步骤与代码设计

### 步骤 1：定义后端流式数据载体

在 `src-tauri/src/commands/llmchat_search.rs` 中定义流式传输的 Payload 结构：

```rust
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum SearchStreamPayload {
    /// 搜索进度更新
    Progress {
        files_scanned: usize,
        files_matched: usize,
    },
    /// 发现一批新结果
    ResultBatch(Vec<SearchResult>),
    /// 搜索完成汇总
    Done {
        duration_ms: f64,
    },
}
```

### 步骤 2：实现流式搜索命令 `search_llm_data_stream`

在 `src-tauri/src/commands/llmchat_search.rs` 中新增命令：

```rust
use tauri::ipc::Channel;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

// 1. 定义取消令牌（使用 tokio_util::sync::CancellationToken）
pub struct LlmChatSearchCancellation {
    pub(crate) token: CancellationToken,
}

impl LlmChatSearchCancellation {
    pub fn new() -> Self { Self { token: CancellationToken::new() } }
    pub fn cancel(&self) { self.token.cancel(); }
}

// 2. 新增流式命令
#[tauri::command]
pub async fn search_llm_data_stream(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
    scope: Option<String>,
    match_mode: Option<String>,
    cancellation: State<'_, LlmChatSearchCancellation>,
    on_event: Channel<SearchStreamPayload>,
) -> Result<(), String> {
    let start_time = Instant::now();
    let query = query.trim().to_string();

    if query.is_empty() {
        let _ = on_event.send(SearchStreamPayload::Done { duration_ms: 0.0 });
        return Ok(());
    }

    let scope = scope.unwrap_or_else(|| "all".to_string());
    let match_mode = match_mode.unwrap_or_else(|| "exact".to_string());
    let max_results = limit.unwrap_or(500);

    let app_data_dir = crate::get_app_data_dir(app.config());
    let llm_chat_dir = app_data_dir.join("llm-chat");

    // 3. 异步并发搜索，通过 tokio mpsc::channel 汇总
    // Agent 和 Session 搜索并行，buffer_unordered(50) 限制并发度
    // 主消费循环中每 100ms/10 条通过 on_event 发送 ResultBatch
    // 搜索结束发送 Done

    Ok(())
}

// 4. 取消命令
#[tauri::command]
pub async fn cancel_llm_chat_search(
    cancellation: State<'_, LlmChatSearchCancellation>,
) -> Result<(), String> {
    cancellation.cancel();
    Ok(())
}
```

### 步骤 3：在 `src-tauri/src/lib.rs` 中注册新命令

- 在 `use commands::{}` 导入块中添加 `search_llm_data_stream`、`cancel_llm_chat_search` 及 `LlmChatSearchCancellation`
- 在 `generate_handler!` 中添加 `search_llm_data_stream` 和 `cancel_llm_chat_search`
- 在 `.manage()` 中注册 `LlmChatSearchCancellation` 状态

### 步骤 4：重构前端 `useLlmSearch.ts`

修改 `src/tools/llm-chat/composables/chat/useLlmSearch.ts`，引入 `Channel` 机制：

```typescript
import { Channel, invoke } from "@tauri-apps/api/core";

// 定义流式 Payload 类型
type SearchStreamPayload =
  | { type: "progress"; data: { filesScanned: number; filesMatched: number } }
  | { type: "resultBatch"; data: SearchResult[] }
  | { type: "done"; data: { durationMs: number } };

// executeSearchStream 逻辑
const executeSearchStream = async (query: string) => {
  searchResults.value = [];
  const channel = new Channel<SearchStreamPayload>();
  channel.onmessage = (payload) => {
    if (payload.type === "progress") { ... }
    else if (payload.type === "resultBatch") {
      // 合并并动态排序
      const merged = [...searchResults.value, ...payload.data];
      merged.sort((a, b) => {
        const countDiff = b.matches.length - a.matches.length;
        if (countDiff !== 0) return countDiff;
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
      searchResults.value = merged;
    } else if (payload.type === "done") { isSearching.value = false; }
  };
  await invoke("search_llm_data_stream", { query, ..., onEvent: channel });
};

// search / searchImmediate 中：在发起新搜索前，如果已有搜索进行，调用 cancel_llm_chat_search
```

---

## 5. 实施记录

- **2026-06-10**: 完成全部实施。
  - Rust 后端新增 `search_llm_data_stream` 流式命令 + `cancel_llm_chat_search` 取消命令。
  - 前端 `useLlmSearch.ts` 重构为 `Channel` 流式接收，支持动态排序和取消。
  - 前后端类型检查通过，编译通过。

---

## 4. 验证与测试计划

1. **编译验证**：
   - 运行 `bun run check:backend` 确保 Rust 端编译无误。
   - 运行 `bun run check:frontend` 确保前端 TypeScript 类型契合。
2. **功能验证**：
   - 在 LLM 聊天侧边栏输入关键词，观察搜索结果是否是“渐进式”呈现，而非等待数秒后一次性刷出。
   - 验证连续快速输入时，旧的搜索请求是否被正确取消，且不会产生残留的旧数据。
