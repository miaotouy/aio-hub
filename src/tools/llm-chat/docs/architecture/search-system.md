# 搜索系统 (Search System)

为海量对话和智能体提供了毫秒级的全文检索能力，前端入口为 [`useLlmSearch`](../../composables/chat/useLlmSearch.ts)，后端实现为 Tauri command [`search_llm_data`](../../../../../src-tauri/src/commands/llmchat_search.rs:519)。

## 1. 多维搜索 (Scope)

支持 `agent` / `session` / `all` 三种作用域。Agent 范围内可命中 `name` / `displayName` / `description` / `presetMessage` / `presetMessageName` 字段；Session 范围内可命中 `name` / `content`（消息正文）/ `reasoningContent`（推理内容）字段，每条结果最多返回 5 条节点匹配 / 3 条预设匹配，按匹配数量与更新时间降序排序。

## 2. 匹配模式 (`matchMode`)

后端 [`SearchMatcher::build`](../../../../../src-tauri/src/commands/llmchat_search.rs:105) 将查询字符串转换为三种内部结构：

- **`exact`**（默认）: 把整个查询用 `regex::escape` 转义后作为**单个正则**进行整体匹配，适合带空格的精确短语。
- **`and`**: 按 `split_whitespace()` 切词后为每个词构建独立 Regex，要求**全部 `is_match`** 才算命中；单个关键词时自动降级为 `exact`，避免无意义遍历。
- **`or`**: 按 `split_whitespace()` 切词后拼成 `kw1|kw2|kw3` 形式的**单个正则**做任一匹配；单关键词同样降级为 `exact`。

## 3. 中文分词与编码

- **不做真正的分词**：所有模式都依赖 `split_whitespace()`，对没有空格的中文文本只能整体当作一个关键词处理；**不支持拼音匹配**。
- **字符级偏移用 graphemes**：返回 `match_offsets` 时使用 [`unicode_segmentation`](https://crates.io/crates/unicode-segmentation) 的 `graphemes(true)` 计数，确保 emoji、CJK 字符簇与 JS 字符串的 `String.length` 对齐，前端 `formatMatchContext` 可直接做截断和高亮拼接。
- **大小写不敏感 + 正则转义**：所有模式在 `RegexBuilder` 上统一开启 `case_insensitive(true)`，并对用户输入用 `regex::escape` 转义，保证 `.` / `*` / `?` 等正则元字符被当成普通字符匹配，杜绝注入风险。

## 4. 后端实现：无索引的并发全表扫描

**没有任何持久化索引结构**（不是倒排表、不是 Trie、不是 SQLite FTS）。每次搜索都走以下流程（见 [`llmchat_search.rs:289-514`](../../../../../src-tauri/src/commands/llmchat_search.rs:289)）：

1.  **walkdir** 递归遍历 `{appConfigDir}/llm-chat/agents/{id}/agent.json` 与 `{appConfigDir}/llm-chat/sessions/{id}.json` 收集所有文件路径。
2.  通过 `tokio::join!` **并行**执行 `search_agents` 与 `search_sessions`（`scope = all` 时）。
3.  `stream::iter(paths).buffer_unordered(50)` 以 **50 并发**异步读取每个文件，先用 `matcher.is_match(&content)` 做**全文预过滤**：原始字符串都不命中则直接跳过昂贵的 `serde_json` 反序列化，这是核心性能优化点。
4.  命中文件用 `PartialAgent` / `PartialSession`（带 `#[serde(borrow)]` 零拷贝结构）解析后逐字段调用 `matcher.extract_context` 提取片段。

**索引刷新时机**: **不适用** —— 由于不存在索引，所以也没有刷新/重建机制，写入会话/智能体后立即可搜索；优势是零维护成本，缺点是单次搜索的最差耗时与磁盘数据量线性相关。

## 5. 前端防抖与 Loading 延迟

[`useLlmSearch`](../../composables/chat/useLlmSearch.ts:83) 默认配置：

- **`debounceMs = 300`**：通过 `useDebounceFn` 对搜索请求做防抖，连续输入只触发最后一次。
- **`loadingDelayMs = 300`**：通过 `setTimeout` 延迟显示 loading 指示器，命中时长低于阈值时不展示 spinner，避免短查询闪烁。
- 暴露 `isSearching`（内部状态，用于逻辑判断）与 `showLoadingIndicator`（带延迟的展示状态，UI 直接绑定）两套响应式状态，分别承担不同语义。

## 6. 搜索结果高亮 (Highlight)

**前后端协作完成**：

- 后端 [`extract_context_with_regex`](../../../../../src-tauri/src/commands/llmchat_search.rs:205) 在提取上下文片段时同时返回 `match_offsets: (start_char, end_char)[]` 字符索引数组（基于 grapheme 计数），并合并重叠区间。
- 前端 [`formatMatchContext`](../../composables/chat/useLlmSearch.ts:297) 据此构建 `HighlightPart[]` 数组（含 `text` 与 `isMatch` 标记），UI 层（如 `LlmChatSidebar` 的搜索结果项）用 `<mark>` 渲染高亮，并提供按字符数智能截断窗口（前缀 1/4 后缀 3/4）。
- **同会话消息列表的搜索**（[`ChatSearchPanel.vue`](../../components/search/ChatSearchPanel.vue)）是**另一套独立的纯前端搜索**，直接在内存中对当前会话的 `messages[]` 做 `toLowerCase().includes(query)`，与 Rust 后端搜索互不依赖；高亮通过简单的 `split(new RegExp(query, 'gi'))` + `<mark>` 实现。
