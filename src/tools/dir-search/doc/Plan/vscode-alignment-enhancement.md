# Dir Search: VSCode 对齐增强计划

**状态**: RFC  
**创建日期**: 2025-05-15  
**优先级**: P1

---

## 1. 背景与目标

当前 Dir Search 工具在功能完整性和交互体验上与 VSCode 的搜索面板存在明显差距。本计划旨在从三个维度进行全面对齐：

1. **工具栏与历史记录** — 补齐缺失的全局操作入口
2. **搜索结果交互** — 实现悬停操作、右键菜单、视图切换
3. **搜索性能** — 后端并行化 + IPC 批处理

---

## 2. 需求清单

### 2.1 工具栏缺失项

| 功能           | VSCode 行为                | 当前状态          | 优先级      |
| -------------- | -------------------------- | ----------------- | ----------- |
| 搜索历史       | 输入框内 ArrowUp/Down 切换 | ❌ 无             | P0          |
| 目录历史       | 输入框内 ArrowUp/Down 切换 | ❌ 无             | P0          |
| 刷新按钮       | 重新执行当前搜索           | ❌ 无             | P0          |
| 全部展开       | 展开所有文件节点           | ✅ 有（在结果区） | P1 调整位置 |
| 全部收起       | 收起所有文件节点           | ✅ 有（在结果区） | P1 调整位置 |
| 清除结果       | 清空搜索结果               | ❌ 无             | P1          |
| 树形/列表切换  | 切换结果展示模式           | ❌ 无             | P1          |
| 新建搜索编辑器 | 打开独立搜索标签           | ❌ 无             | P2 暂不实现 |

### 2.2 搜索结果交互缺失项

| 功能                | VSCode 行为                                             | 当前状态 |
| ------------------- | ------------------------------------------------------- | -------- |
| 悬停替换按钮        | 匹配项右侧显示替换/消除图标                             | ❌ 无    |
| 悬停 Tooltip        | 展示匹配行上下文片段                                    | ❌ 无    |
| 右键菜单 - 文件级   | 全部替换、消除、排除/包含类型、复制路径、资源管理器显示 | ❌ 无    |
| 右键菜单 - 匹配项级 | 替换、消除、复制                                        | ❌ 无    |
| 列表视图            | 平铺展示所有匹配项（不按文件分组）                      | ❌ 无    |

### 2.3 性能问题

| 问题         | 原因                                | 影响                 |
| ------------ | ----------------------------------- | -------------------- |
| 大目录搜索慢 | 单线程 `WalkBuilder` 串行遍历       | 万级文件目录耗时明显 |
| 结果渲染卡顿 | 每匹配一个文件就 emit 一次 IPC 事件 | 前端频繁重渲染       |

---

## 3. 技术方案

### 3.1 键盘优先的历史记录

**设计原则**：零 UI 负担，不增加任何下拉框或弹出层。

**实现方式**：

- 在 `SearchInput.vue` 的搜索 textarea 中监听 `ArrowUp` / `ArrowDown`
- 在 `DirectoryBar.vue` 的目录 input 中监听 `ArrowUp` / `ArrowDown`
- 历史栈存储在 `useDirSearchUiState.ts` 中，通过 `createConfigManager` 持久化

**交互逻辑**：

```
光标在首行 + ArrowUp → 切换到上一条历史记录
光标在末行 + ArrowDown → 切换到下一条历史记录
按 Escape → 退出历史浏览，恢复当前输入
执行搜索时 → 将当前输入推入历史栈（去重） 【这里可以把记录的阈值拉高，比如两三秒不动才记录】
```

**数据结构**：

```typescript
interface SearchHistoryState {
  searchHistory: string[]; // 最近 20 条搜索词
  directoryHistory: string[]; // 最近 10 条目录路径
  includeHistory: string[]; // 最近 10 条包含 glob
  excludeHistory: string[]; // 最近 10 条排除 glob
}
```

**新增 Composable**：`useInputHistory(historyArray, currentValue)`

- 返回 `{ onKeydown, historyIndex }`
- 封装上下键切换逻辑，可复用于所有输入框

### 3.2 顶部功能条

**位置**：在搜索结果状态栏（`results-tree__status`）同一行右侧。

**按钮列表**（从左到右）：

1. 刷新 (`RefreshCw`) — 重新执行 `executeSearch()`
2. 清除 (`X`) — 清空结果和输入
3. 全部折叠 (`ChevronsUp`) — 已有逻辑，移动位置
4. 全部展开 (`ChevronsDown`) — 已有逻辑，移动位置
5. 树形/列表切换 (`List` / `TreePine`) — 切换 `viewMode`

**布局**：与状态信息（"1254 文件中有 2829 个结果"）在同一行，左侧状态文字，右侧按钮组。

### 3.3 结果项悬停操作

**文件节点悬停**：

- 右侧显示"全部替换"图标（仅在替换模式开启时）

**匹配项节点悬停**：

- 右侧显示：
  - `Replace` 图标 — 单项替换（仅替换模式）
  - `X` 图标 — 从结果中消除此项

**Tooltip 预览**：

- 悬停 500ms 后显示 Tooltip
- 内容：匹配行 ± 2 行上下文，匹配部分高亮
- 后端需要在 `SearchMatch` 中增加 `contextBefore: string[]` 和 `contextAfter: string[]` 字段（可选，由前端请求时指定 `contextLines`）

### 3.4 右键菜单

**实现方式**：自定义 ContextMenu 组件（使用 `position: fixed` + `@contextmenu.prevent`）

**文件节点菜单项**：
| 菜单项 | 动作 |
|--------|------|
| 全部替换 | 替换该文件内所有匹配 |
| 消除 | 从结果中移除该文件 |
| --- | 分隔线 |
| 从搜索中排除此文件类型 | 将 `*.ext` 追加到排除 glob |
| 在搜索中包含此文件类型 | 将 `*.ext` 设为包含 glob |
| --- | 分隔线 |
| 复制 | 复制文件名 |
| 复制路径 | 复制文件绝对路径 |
| 全部复制 | 复制该文件所有匹配行文本 |
| --- | 分隔线 |
| 在资源管理器中显示 | 调用 Tauri `shell.open` 打开所在目录 |

**匹配项节点菜单项**：

| 菜单项   | 动作                   |
| -------- | ---------------------- |
| 替换     | 单项替换               |
| 消除     | 从结果中移除此匹配     |
| -------- | 分隔线                 |
| 复制     | 复制匹配行内容         |
| 全部复制 | 复制所在文件所有匹配行 |

### 3.5 视图模式切换

**树形模式 (Tree)**：当前默认，按文件分组展示。

**列表模式 (List)**：平铺展示所有匹配项，每项显示：

```
[文件图标] 匹配内容高亮片段    文件名:行号
```

### 3.6 后端性能优化

#### 3.6.1 并行搜索

将 `WalkBuilder.build()` 替换为 `WalkBuilder.build_parallel()`：

```rust
use std::sync::mpsc;
use ignore::WalkState;

let (tx, rx) = mpsc::channel::<FileSearchResult>();

builder.build_parallel().run(|| {
    let tx = tx.clone();
    let matcher = matcher.clone();
    let cancelled = cancellation.cancelled.clone();

    Box::new(move |entry| {
        if cancelled.load(Ordering::SeqCst) {
            return WalkState::Quit;
        }
        // ... 搜索逻辑 ...
        if !file_matches.is_empty() {
            let _ = tx.send(result);
        }
        WalkState::Continue
    })
});
```

#### 3.6.2 IPC 批处理

在主线程中消费 `rx`，每 20ms 或每 50 个结果批量发送：

```rust
// 新增事件类型
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultBatch {
    pub results: Vec<FileSearchResult>,
}

// 批量发送逻辑
let mut batch: Vec<FileSearchResult> = Vec::with_capacity(50);
let mut last_emit = Instant::now();

while let Ok(result) = rx.recv_timeout(Duration::from_millis(20)) {
    batch.push(result);

    if batch.len() >= 50 || last_emit.elapsed() >= Duration::from_millis(20) {
        window.emit("dir-search-result-batch", &SearchResultBatch {
            results: std::mem::take(&mut batch)
        });
        last_emit = Instant::now();
    }
}

// 发送剩余
if !batch.is_empty() {
    window.emit("dir-search-result-batch", &SearchResultBatch { results: batch });
}
```

**前端适配**：

- 监听事件从 `dir-search-result` 改为 `dir-search-result-batch`
- 一次性将批次中所有结果写入 `results` Map

#### 3.6.3 上下文行支持

为 Tooltip 预览提供数据支持，在 `SearchMatch` 中增加可选字段：

```rust
pub struct SearchMatch {
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
    // 新增
    pub context_before: Vec<String>,  // 匹配行之前的 N 行
    pub context_after: Vec<String>,   // 匹配行之后的 N 行
}
```

由 `SearchRequest.context_lines` 控制（默认 0，Tooltip 需要时设为 2）。

---

## 4. 文件变更清单

### 4.1 前端新增文件

| 文件                             | 用途             |
| -------------------------------- | ---------------- |
| `composables/useInputHistory.ts` | 键盘历史回溯逻辑 |
| `composables/useContextMenu.ts`  | 右键菜单状态管理 |
| `components/ContextMenu.vue`     | 通用右键菜单组件 |
| `components/ResultToolbar.vue`   | 顶部功能条组件   |

### 4.2 前端修改文件

| 文件                                 | 变更内容                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| `types.ts`                           | 增加 `SearchResultBatch`、`ViewMode`、`ContextMenuItem` 类型 |
| `composables/useDirSearch.ts`        | 增加历史管理、视图模式、消除逻辑、批量事件监听               |
| `composables/useDirSearchUiState.ts` | 持久化历史记录和视图模式                                     |
| `components/SearchInput.vue`         | 集成 `useInputHistory`，增加键盘监听                         |
| `components/DirectoryBar.vue`        | 集成 `useInputHistory`                                       |
| `components/ResultsTree.vue`         | 集成右键菜单、悬停操作、列表视图、Tooltip                    |
| `components/ResultItem.vue`          | 增加悬停按钮、右键菜单触发                                   |
| `components/SearchPanel.vue`         | 集成 `ResultToolbar`                                         |
| `DirSearch.vue`                      | 布局微调                                                     |

### 4.3 后端修改文件

| 文件                                   | 变更内容                         |
| -------------------------------------- | -------------------------------- |
| `src-tauri/src/commands/dir_search.rs` | 并行搜索、批量发送、上下文行支持 |

---

## 5. 实施阶段

### Phase 1: 工具栏 + 历史记录 (前端)

- [ ] 实现 `useInputHistory.ts`
- [ ] 修改 `SearchInput.vue` 集成搜索历史
- [ ] 修改 `DirectoryBar.vue` 集成目录历史
- [ ] 实现 `ResultToolbar.vue`（刷新、清除、折叠/展开、视图切换）
- [ ] 更新 `useDirSearchUiState.ts` 持久化新状态

### Phase 2: 结果交互增强 (前端)

- [ ] 实现 `ContextMenu.vue` 通用右键菜单
- [ ] 实现 `useContextMenu.ts`
- [ ] 修改 `ResultItem.vue` 增加悬停操作按钮
- [ ] 修改 `ResultsTree.vue` 集成右键菜单和 Tooltip
- [ ] 实现列表视图模式
- [ ] 实现"消除"逻辑（从结果中移除）
- [ ] 实现"排除/包含文件类型"联动过滤器

### Phase 3: 后端性能优化

- [ ] 重构 `dir_search` 命令为并行架构
- [ ] 实现 IPC 批处理机制
- [ ] 增加 `context_lines` 支持
- [ ] 前端适配批量事件 `dir-search-result-batch`

---

## 6. 风险与注意事项

1. **并行搜索的结果顺序**：`WalkParallel` 不保证文件顺序，前端需要按路径排序或接受乱序。
2. **单项替换的原子性**：单项替换需要精确定位到文件中的具体位置，需要确保替换时文件未被外部修改。
3. **历史记录膨胀**：需要设置上限（搜索词 20 条，目录 10 条），超出时 FIFO 淘汰。
4. **Tooltip 性能**：上下文行数据会增加 IPC 传输量，默认搜索时 `contextLines=0`，仅在用户悬停时按需加载（或统一设为 2，视性能测试结果决定）。
