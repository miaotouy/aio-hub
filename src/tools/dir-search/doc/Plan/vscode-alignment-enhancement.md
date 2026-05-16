# Dir Search: VSCode 对齐增强计划

**状态**: Done
**创建日期**: 2025-05-15
**完成日期**: 2025-05-16
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

| 功能           | VSCode 行为                           | 当前状态          | 优先级      |
| -------------- | ------------------------------------- | ----------------- | ----------- |
| 搜索历史       | 输入框内 ArrowUp/Down 切换            | ❌ 无             | P0          |
| 目录历史       | 输入框内 ArrowUp/Down 切换            | ❌ 无             | P0          |
| 刷新按钮       | 重新执行当前搜索                      | ❌ 无             | P0          |
| 全部展开       | 展开所有文件节点                      | ✅ 有（在结果区） | P1 调整位置 |
| 全部收起       | 收起所有文件节点                      | ✅ 有（在结果区） | P1 调整位置 |
| 清除结果       | 清空搜索结果                          | ❌ 无             | P1          |
| 树形/列表切换  | 切换结果展示模式（树形=目录层级展开） | ❌ 无             | P1          |
| 新建搜索编辑器 | 打开独立搜索标签                      | ❌ 无             | P2 暂不实现 |

### 2.1.1 布局优化项

| 功能             | VSCode 行为                                 | 当前状态                      | 优先级 |
| ---------------- | ------------------------------------------- | ----------------------------- | ------ |
| 替换展开按钮侧置 | Chevron 放在搜索/替换行的左侧，不占垂直空间 | ❌ 当前独占一行，浪费垂直空间 | P0     |

### 2.2 搜索结果交互缺失项

| 功能                | VSCode 行为                                             | 当前状态 |
| ------------------- | ------------------------------------------------------- | -------- |
| 悬停替换按钮        | 匹配项右侧显示替换/消除图标                             | ❌ 无    |
| 悬停 Tooltip        | 展示匹配行上下文片段                                    | ❌ 无    |
| 右键菜单 - 文件级   | 全部替换、消除、排除/包含类型、复制路径、资源管理器显示 | ❌ 无    |
| 右键菜单 - 匹配项级 | 替换、消除、复制                                        | ❌ 无    |
| 树形目录视图        | 按目录层级树状展开（类似文件资源管理器）                | ❌ 无    |

### 2.3 性能问题（已解决）

| 问题         | 原因                                | 影响                 | 解决方案                                      |
| ------------ | ----------------------------------- | -------------------- | --------------------------------------------- |
| 大目录搜索慢 | 单线程 `WalkBuilder` 串行遍历       | 万级文件目录耗时明显 | ✅ `build_parallel()` 多线程并行遍历          |
| 结果渲染卡顿 | 每匹配一个文件就 emit 一次 IPC 事件 | 前端频繁重渲染       | ✅ IPC 批处理（每 20ms/50 条批量 emit）       |
| 前端滚动卡顿 | 大量 DOM 节点                       | 预期需要虚拟滚动     | ❌ 实测 2 万条无卡顿，Vue 处理简单元素性能充足 |

---

## 3. 技术方案

### 3.0 替换展开按钮侧置

**当前问题**：`SearchInput.vue` 中的"替换"展开/收起按钮（第 56-59 行）独占一行，浪费垂直空间。

**目标布局**：对齐 VSCode，将 chevron 按钮移到搜索/替换输入行的**左侧**，作为侧边控件。

**当前结构**：

```
┌─────────────────────────────────────┐
│ [搜索 textarea] [Aa] [.*] [W]       │  搜索行
├─────────────────────────────────────┤
│ [替换 textarea] [替换全部]           │  替换行 (v-if showReplace)
├─────────────────────────────────────┤
│ ▶ 替换                              │  ← 独占一行（问题所在）
├─────────────────────────────────────┤
│ 过滤器...                            │
└─────────────────────────────────────┘
```

**目标结构**：

```
┌───┬──────────────────────────────────┐
│   │ [搜索 textarea] [Aa] [.*] [W]    │  搜索行
│ ▶ ├──────────────────────────────────┤
│   │ [替换 textarea] [替换全部]        │  替换行 (v-if showReplace)
├───┴──────────────────────────────────┤
│ 过滤器...                             │
└──────────────────────────────────────┘
```

**实现方式**：

1. 在 `SearchInput.vue` 中，将搜索行和替换行包裹在一个 flex 容器中
2. Chevron 按钮作为该容器的左侧元素，垂直居中对齐
3. 右侧为搜索行 + 替换行的纵向堆叠
4. 删除原来独占一行的 `search-input__expand-btn`

**HTML 结构变更**：

```html
<div class="search-input__main">
  <!-- 左侧 chevron -->
  <button class="search-input__replace-toggle" @click="showReplace = !showReplace">
    <ChevronRight :size="14" :class="{ rotated: showReplace }" />
  </button>

  <!-- 右侧输入区 -->
  <div class="search-input__inputs">
    <!-- 搜索行 -->
    <div class="search-input__row">...</div>
    <!-- 替换行 -->
    <div v-if="showReplace" class="search-input__row">...</div>
  </div>
</div>
```

**CSS 要点**：

```css
.search-input__main {
  display: flex;
  align-items: flex-start; /* chevron 对齐搜索行顶部 */
  gap: 4px;
}

.search-input__replace-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 26px; /* 与搜索行等高 */
  /* 无边框、透明背景、hover 变色 */
}

.search-input__inputs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

**节省空间**：此改动可节省约 24px 的垂直空间（原按钮行高 + gap），对于侧边栏式的搜索面板来说非常有价值。

---

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

### 3.2 顶部标题栏功能按钮组

**位置**：搜索面板最顶部的标题行，左侧为"搜索"标题文字，右侧为功能按钮组。**常驻显示**，不随搜索结果的有无而隐藏。

**按钮状态逻辑**：

- 无搜索结果时，依赖结果的按钮（刷新、清除、折叠、展开）显示为 **disabled（灰色不可点击）**
- 有搜索结果时，所有按钮正常可用

**按钮列表**（从左到右）：

1. 刷新 (`RefreshCw`) — 重新执行 `executeSearch()`，无结果时 disabled
2. 全部折叠 (`ChevronsUp`) — 已有逻辑，移动位置，无结果时 disabled
3. 清除结果 (`X`) — 清空搜索结果，无结果时 disabled
4. 树形/列表切换 (`TreePine` / `List`) — 切换 `viewMode`，始终可用
5. 新建搜索编辑器 (`SquarePen`) — P2 暂不实现，预留位置

**布局示意**（对齐 VSCode 截图）：

```
┌──────────────────────────────────────────────┐
│ 搜索          [🔄] [⊞] [✕] [≡] [□]         │  ← 标题行，按钮常驻
├──────────────────────────────────────────────┤
│ [▶] [搜索输入框...]       [Aa] [ab] [.*]    │
│     [替换输入框...]       [AB] [全部替换]    │
├──────────────────────────────────────────────┤
│ ...过滤器...                                  │
└──────────────────────────────────────────────┘
```

**注意**：搜索结果区域的状态栏（"N 文件中有 M 个结果"）和结果列表保持原有位置不变，不做移动。

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

**列表模式 (List)**：当前默认，按文件平铺分组展示（文件名 + 相对路径在同一行，展开后显示匹配项）。

**树形模式 (Tree)**：按目录层级树状展开，类似 VSCode 文件资源管理器的结构：

```
src/
  tools/
    dir-search/
      components/
        ▶ ResultsTree.vue (3)
            L42: ...匹配内容高亮...
            L58: ...匹配内容高亮...
        ▶ ResultItem.vue (1)
            L15: ...匹配内容高亮...
      composables/
        ▶ useDirSearch.ts (5)
            ...
```

**实现要点**：

- 将 `FileSearchResult[]` 按 `relativePath` 的目录层级构建为嵌套树结构
- 目录节点可展开/收起，叶子节点为文件（再展开显示匹配项）
- 目录节点显示其下所有文件的匹配总数
- 空目录层级自动折叠（如 `src/tools/dir-search/` 可合并为一行）

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

## 4. 文件变更清单（按 Batch 归属）

### 4.1 前端新增文件

| 文件                               | 引入批次 | 用途                     |
| ---------------------------------- | -------- | ------------------------ |
| `composables/useInputHistory.ts`   | B3       | 键盘历史回溯逻辑         |
| `composables/useContextMenu.ts`    | B5       | 右键菜单状态管理         |
| `composables/useContextBlocks.ts`  | B8c      | 上下文行合并去重算法     |
| `components/ContextMenu.vue`       | B5       | 通用右键菜单组件         |
| `components/DirectoryTreeView.vue` | B6       | 树形目录视图组件         |
| `components/ContextBlockView.vue`  | B8c      | 上下文块渲染组件（可选） |

### 4.2 前端修改文件

| 文件                                 | 涉及批次            | 变更内容                                                     |
| ------------------------------------ | ------------------- | ------------------------------------------------------------ |
| `types.ts`                           | B2, B6, B7, B8c     | `ViewMode`、`DirectoryNode`、`SearchResultBatch`、上下文类型 |
| `composables/useDirSearch.ts`        | B2, B3, B4, B7, B8c | clearResults、历史推入、消除逻辑、批量事件、contextLines     |
| `composables/useDirSearchUiState.ts` | B2, B3, B8b, B8c    | viewMode + 历史记录 + 设置折叠 + 上下文行设置                |
| `components/SearchInput.vue`         | B1, B3, B8b         | 布局重构 + 集成 useInputHistory + 折叠设置区域               |
| `components/DirectoryBar.vue`        | B3                  | 集成 useInputHistory                                         |
| `components/ResultsTree.vue`         | B4, B5, B6, B8c     | 悬停操作、右键菜单、视图切换、上下文块渲染切换               |
| `components/ResultItem.vue`          | B4, B5, B8a         | 悬停按钮、右键菜单触发、Tooltip 预览                         |
| `components/SearchPanel.vue`         | B2                  | 顶部标题栏按钮组（常驻，disabled 状态控制）                  |

### 4.3 后端修改文件

| 文件                                   | 涉及批次 | 变更内容                         |
| -------------------------------------- | -------- | -------------------------------- |
| `src-tauri/src/commands/dir_search.rs` | B7, B8c  | 并行搜索、批量发送、上下文行支持 |

---

## 5. 实施阶段（按提交批次）

> 每个 Batch 完成后都是一个可独立提交、可测试的状态。
> 依赖关系：B1 → B2 → B3 可并行 | B4 → B5 | B6 独立 | B7 → B8
> 注意，这些都可以根据实际情况做调整，和细化提交内容等

---

### Batch 1: 布局重构 — 替换按钮侧置 ✅

**范围**: 纯 HTML/CSS 结构调整，零逻辑变更
**风险**: 低
**涉及文件**: `SearchInput.vue`

- [x] 将搜索行 + 替换行包裹进 `search-input__main` flex 容器
- [x] Chevron 按钮移至容器左侧，删除原 `search-input__expand-btn` 独占行
- [x] 调整 CSS：`.search-input__main` flex 布局、`.search-input__replace-toggle` 尺寸对齐
- [x] 验证：替换展开/收起动画正常，垂直空间节省 ~24px

**提交信息**: `feat(dir-search): 替换按钮侧置，对齐 VSCode 布局`

---

### Batch 2: 顶部标题栏按钮组 ✅

**范围**: 在搜索面板顶部标题行新增常驻功能按钮组（刷新/折叠/清除/视图切换），无结果时按钮 disabled 灰显
**风险**: 低
**涉及文件**: `SearchPanel.vue`（或顶层面板组件）, `types.ts`, `useDirSearchUiState.ts`, `useDirSearch.ts`

- [x] 在 `types.ts` 中新增 `ViewMode = 'list' | 'tree'` 类型
- [x] 在 `useDirSearchUiState.ts` 中新增 `viewMode` 持久化字段
- [x] 在面板顶部标题行（"搜索"文字右侧）添加按钮组：
  - 按钮：刷新 / 全部折叠 / 清除结果 / 树形列表切换
  - 按钮始终渲染，无搜索结果时设置 `disabled` 属性（灰色不可点击）
  - 将原 `ResultsTree.vue` 中的折叠/展开按钮移除，改由顶部按钮组统一控制
- [x] 在 `useDirSearch.ts` 中新增 `clearResults()` 方法
- [x] 搜索结果区域（状态栏 + 结果列表）保持原有位置和布局不变
- [x] 验证：按钮 disabled 状态正确切换，功能正常，视图切换按钮暂时只切换图标（树形视图在 B6 实现）

**提交信息**: `feat(dir-search): 顶部标题栏按钮组，常驻显示，无结果时灰显`

---

### Batch 3: 键盘历史记录系统 ✅

**范围**: 新增 composable + 集成到所有输入框
**风险**: 低（纯前端新增，不影响现有逻辑）
**涉及文件**: 新增 `useInputHistory.ts`，修改 `SearchInput.vue`, `DirectoryBar.vue`, `useDirSearchUiState.ts`

- [x] 新增 `composables/useInputHistory.ts`：
  - 接口：`useInputHistory(historyArray: Ref<string[]>, currentValue: Ref<string>)`
  - 返回：`{ onKeydown, historyIndex }`
  - 逻辑：光标首行 + ArrowUp 向上翻，末行 + ArrowDown 向下翻，Escape 退出
- [x] 在 `useDirSearchUiState.ts` 中新增历史字段（加入 `createDefaultState()`，随现有 `createConfigManager` 自动持久化到 `AppData/dir-search/ui-state.json`）：
  - `searchHistory: string[]` (上限 20)
  - `replacementHistory: string[]` (上限 20)
  - `directoryHistory: string[]` (上限 10)
  - `includeHistory: string[]` (上限 10)
  - `excludeHistory: string[]` (上限 10)
- [x] 在 `useDirSearch.ts` 的 `executeSearch()` 中，搜索执行时推入历史（去重 + 稳定排序）
- [x] `SearchInput.vue`：搜索 textarea + 替换 textarea + 包含/排除 glob 全部集成 `useInputHistory`
- [x] `DirectoryBar.vue`：目录 input 集成 `useInputHistory`
- [x] 验证：上下键切换历史正常，持久化重启后保留

**提交信息**: `feat(dir-search): 键盘历史记录，支持搜索词/目录/glob 回溯`

---

### Batch 4: 结果项消除 + 悬停操作按钮 ✅

**范围**: 结果交互的基础能力
**风险**: 中（修改结果数据结构的操作逻辑）
**涉及文件**: `useDirSearch.ts`, `ResultItem.vue`, `ResultsTree.vue`

- [x] 在 `useDirSearch.ts` 中新增：
  - `dismissFile(filePath: string)` — 从 results Map 中移除整个文件
  - `dismissMatch(filePath: string, matchIndex: number)` — 移除单个匹配项（文件无匹配时自动移除文件）
- [x] 修改 `ResultItem.vue`：
  - 悬停时右侧显示操作按钮区域（opacity 过渡）
  - 按钮：`X`（消除此匹配）、`Replace`（单项替换，仅替换模式显示）
- [x] 修改 `ResultsTree.vue` 文件头：
  - 悬停时右侧显示：`Replace`（全部替换该文件，仅替换模式）、`X`（消除该文件）
- [x] 验证：消除后计数实时更新，替换按钮仅在 showReplace 时显示

**提交信息**: `feat(dir-search): 结果项悬停操作，支持消除和单项替换`

---

### Batch 5: 右键菜单 ✅

**范围**: 通用右键菜单组件 + 集成
**前置依赖**: Batch 4（消除逻辑）
**风险**: 中
**涉及文件**: 新增 `ContextMenu.vue`, `useContextMenu.ts`，修改 `ResultsTree.vue`, `ResultItem.vue`

- [x] 新增 `components/ContextMenu.vue`：
  - `position: fixed` 定位，`@contextmenu.prevent` 触发
  - 支持分隔线、禁用项、图标
  - 点击外部或 Escape 关闭
- [x] 新增 `composables/useContextMenu.ts`：
  - 管理菜单显示状态、位置、菜单项列表
  - 提供 `show(event, items)` / `hide()` 方法
- [x] 在 `ResultsTree.vue` 文件头绑定 `@contextmenu`：
  - 菜单项：全部替换 / 消除 / --- / 排除此类型 / 包含此类型 / --- / 复制名 / 复制路径 / 全部复制 / --- / 资源管理器显示
- [x] 在 `ResultItem.vue` 绑定 `@contextmenu`：
  - 菜单项：替换 / 消除 / --- / 复制 / 全部复制
- [x] 实现"排除/包含文件类型"联动：将 `*.ext` 追加到对应 glob 输入框
- [x] 实现"在资源管理器中显示"：调用 Tauri `opener.revealItemInDir`
- [x] 验证：右键菜单定位准确，各操作功能正常

**提交信息**: `feat(dir-search): 右键菜单，支持文件级和匹配项级操作`

---

### Batch 6: 树形目录视图 ✅

**范围**: 新增视图模式，独立于其他功能
**前置依赖**: Batch 2（viewMode 状态已就绪）
**风险**: 中高（新增较多渲染逻辑）
**涉及文件**: 新增 `components/DirectoryTreeView.vue`, `components/DirectoryTreeNode.vue`，修改 `ResultsTree.vue`, `SearchPanel.vue`, `types.ts`

- [x] 在 `types.ts` 中新增 `DirectoryNode` 树节点接口
- [x] 新增 `components/DirectoryTreeView.vue`：
  - 接收 `FileSearchResult[]`，按 `relativePath` 构建嵌套目录树
  - 空目录层级自动折叠合并（如 `src/tools/dir-search/` 合并为一行）
  - 目录节点显示子树匹配总数
  - 叶子节点为文件，展开后显示匹配项（复用 `ResultItem`）
  - 暴露 `expandAllDirs` / `collapseAllDirs` 方法
- [x] 新增 `components/DirectoryTreeNode.vue`：
  - 递归组件，渲染目录/文件节点
  - 支持右键菜单、悬停操作按钮
  - 空路径根节点默认展开
- [x] 修改 `ResultsTree.vue`：
  - 根据 `viewMode` 条件渲染列表视图或 `DirectoryTreeView`
  - 两种视图共享展开/折叠/消除等操作
  - 暴露 `expandAllTree` / `collapseAllTree` 方法
- [x] 修改 `SearchPanel.vue`：
  - 传递 `viewMode` 给 `ResultsTree`
  - 展开/折叠按钮同时控制树形视图的目录节点
- [x] 验证：类型检查通过，视图切换流畅，树形模式下目录层级正确，匹配数准确

**提交信息**: `feat(dir-search): 树形目录视图模式`

---

### Batch 7: 后端并行搜索 + IPC 批处理 + 可配置上限 ✅

**范围**: 后端性能重构 + 前端事件适配 + 搜索上限设置
**风险**: 高（核心搜索逻辑重写）
**涉及文件**: `src-tauri/src/commands/dir_search.rs`, `useDirSearch.ts`, `useDirSearchUiState.ts`, `types.ts`, `SearchInput.vue`

- [x] 后端：将 `WalkBuilder.build()` 替换为 `build_parallel()`
  - 使用 `mpsc::channel` 收集并行结果
  - 保留取消机制（`AtomicBool` 检查，传入并行闭包）
  - 使用 `AtomicUsize` 跟踪总匹配数（线程安全）
- [x] 后端：实现 IPC 批处理
  - 新增 `SearchResultBatch { results: Vec<FileSearchResult> }` 事件类型
  - 主线程消费 channel，每 20ms 或每 50 个结果批量 emit
  - 搜索结束后 flush 剩余
  - 进度每 200ms 汇报一次
- [x] 后端：`max_results` 支持 0/None 表示无限制（映射为 `usize::MAX`）
- [x] 前端 `types.ts`：新增 `SearchResultBatch` 接口
- [x] 前端 `useDirSearch.ts`：
  - 监听事件从 `dir-search-result` 改为 `dir-search-result-batch`
  - 批量写入 results Map
  - 使用 `uiState.maxResults` 作为请求参数
- [x] 前端 `useDirSearchUiState.ts`：新增 `maxResults` 持久化字段（默认 10000）
- [x] 前端 `SearchInput.vue`：过滤器区域新增"上限"数字输入框（0 = 无限制）
- [x] 验证：前后端类型检查 + clippy 全部通过

**提交信息**: `perf(dir-search): 后端并行搜索 + IPC 批处理，支持可配置搜索上限`

---

### Batch 8: Tooltip 预览 + 折叠设置区域 + 上下文行功能 ✅

本批次拆分为三个子任务，可按顺序独立提交。

---

#### Batch 8a: 结果项 Tooltip 预览（纯前端） ✅

**范围**: 悬停显示匹配行的完整内容（对齐 VSCode 行为）
**风险**: 极低（纯前端 UI 增强，无后端变更）
**涉及文件**: `ResultItem.vue`

**设计说明**：

VSCode 的 tooltip 悬停显示的就是那一行的完整内容。当前 `ResultItem` 已经做了行内截断（前后各 60 字符 + 省略号），所以 tooltip 的价值在于展示**未被截断的完整行**。不需要后端提供额外的上下文行数据。

**实现方式**：

- 使用 `el-tooltip` 包裹 `.result-item__content`
- `content` 为 `match.lineContent`（完整行内容）
- `:show-after="500"` 延迟 500ms 显示
- `:disabled="!isContentTruncated"` — 当行内容未被截断时不显示 tooltip（避免冗余）
- tooltip 内容使用 `monospace` 字体，保持代码可读性

**截断判断逻辑**：

```typescript
const isContentTruncated = computed(() => {
  const { lineContent, matchStart, matchEnd } = props.match;
  const contextChars = 60;
  const displayStart = Math.max(0, matchStart - contextChars);
  const displayEnd = Math.min(lineContent.length, matchEnd + contextChars);
  return displayStart > 0 || displayEnd < lineContent.length;
});
```

- [x] 修改 `ResultItem.vue`：
  - 新增 `isContentTruncated` 计算属性
  - 用 `el-tooltip` 包裹内容区域，显示完整 `lineContent`
  - tooltip 样式：`max-width: 600px`，`word-break: break-all`，`monospace` 字体
- [x] 验证：长行悬停显示完整内容，短行不显示冗余 tooltip

**提交信息**: `feat(dir-search): 结果项 Tooltip 预览，显示匹配行完整内容`

---

#### Batch 8b: 折叠设置区域 ✅

**范围**: 将散落的设置项收纳到一个可折叠的"搜索设置"区域
**风险**: 低（纯布局重构）
**涉及文件**: `SearchInput.vue`, `useDirSearchUiState.ts`

**设计说明**：

当前设置项（自动展开、搜索上限）散落在过滤器区域最后一行，随着设置项增多（上下文行开关、行数等），需要一个专门的折叠区域。

**目标布局**：

```
┌──────────────────────────────────────┐
│ [▶] [搜索输入框...]    [Aa] [.*] [W] │  搜索行
│     [替换输入框...]    [替换全部]      │  替换行
├──────────────────────────────────────┤
│ 包含: [*.md, *.txt]                   │  过滤器
│ 排除: [node_modules, *.lock]          │
│ ☑ 使用 .gitignore                     │
├──────────────────────────────────────┤
│ ⚙ 搜索设置                      [▾]  │  ← 折叠标题行
│ ┌──────────────────────────────────┐ │
│ │ ☑ 自动展开    上限: [10000]      │ │  设置项（展开时显示）
│ │ ☑ 扩展上下文  行数: [2]          │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**实现要点**：

1. 在 `useDirSearchUiState.ts` 中新增 `showAdvancedSettings: boolean`（默认 `false`，持久化）
2. 将 `.gitignore` 复选框保留在过滤器区域（它是过滤逻辑的一部分）
3. 将"自动展开"和"搜索上限"移入折叠设置区域
4. 折叠设置区域使用 `<div v-show="showAdvancedSettings">` + 过渡动画
5. 标题行点击切换展开/收起，右侧显示 chevron 图标

**新增 UI 状态字段**：

```typescript
// useDirSearchUiState.ts createDefaultState() 中新增
showAdvancedSettings: false,
```

- [x] 在 `useDirSearchUiState.ts` 中新增 `showAdvancedSettings` 字段
- [x] 重构 `SearchInput.vue` 过滤器区域：
  - `.gitignore` 复选框保留在过滤器行
  - 新增折叠设置标题行（"搜索设置" + chevron）
  - 设置内容区域包含：自动展开、搜索上限
  - 使用 `max-height` + `overflow: hidden` + `transition` 实现折叠动画
- [x] 验证：折叠/展开动画流畅，设置项功能不受影响，状态持久化正常

**提交信息**: `refactor(dir-search): 折叠设置区域，收纳高级搜索选项`

---

#### Batch 8c: 上下文行功能（前后端联动） ✅

**范围**: 后端支持上下文行数据 + 前端内联展示 + 多行合并去重
**前置依赖**: Batch 8b（设置区域已就绪）
**风险**: 中（后端搜索逻辑变更 + 前端渲染逻辑较复杂）
**涉及文件**: `src-tauri/src/commands/dir_search.rs`, `types.ts`, `useDirSearch.ts`, `useDirSearchUiState.ts`, `SearchInput.vue`, `ResultItem.vue`, `ResultsTree.vue`

**设计说明**：

上下文行是一个独立的增强功能，在结果列表中直接展示匹配行的上下文（类似 `grep -C`）。核心难点是**多行结果的合并去重**：当同一文件中多个匹配行相邻时，它们的上下文会重叠，需要合并为连续的代码块展示。

**后端变更**：

```rust
// SearchMatch 新增字段
pub struct SearchMatch {
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
    // 新增
    pub context_before: Option<Vec<String>>,  // 匹配行之前的 N 行
    pub context_after: Option<Vec<String>>,   // 匹配行之后的 N 行
}
```

- `context_before` / `context_after` 为 `Option`，当 `context_lines = 0` 时不序列化（节省带宽）
- 后端在读取文件行时，根据 `context_lines` 参数向前/后取对应行数
- 使用 `#[serde(skip_serializing_if = "Option::is_none")]` 避免无用字段传输

**前端类型变更**：

```typescript
// types.ts
export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
  // 新增
  contextBefore?: string[];
  contextAfter?: string[];
}
```

**前端合并去重逻辑**：

当同一文件中多个匹配行的上下文存在重叠时，需要合并为连续的"上下文块"（ContextBlock）：

```typescript
interface ContextBlock {
  /** 块的起始行号 */
  startLine: number;
  /** 块内所有行（含匹配行和上下文行） */
  lines: ContextLine[];
}

interface ContextLine {
  lineNumber: number;
  content: string;
  /** 该行中的匹配信息（null 表示纯上下文行） */
  matchInfo: { matchStart: number; matchEnd: number } | null;
}
```

**合并算法**：

1. 对文件内所有匹配按 `lineNumber` 排序
2. 遍历匹配，计算每个匹配的上下文范围 `[lineNumber - contextLines, lineNumber + contextLines]`
3. 如果当前匹配的上下文范围与前一个块的范围重叠或相邻（gap ≤ 1），则合并到同一个块
4. 否则创建新块
5. 块与块之间用分隔线（`···`）分隔显示

**渲染方式**：

当上下文功能开启时，`ResultItem` 的渲染从"单行"变为"上下文块"：

```
  40 │ import { ref } from 'vue'        ← 上下文行（灰色）
  41 │ import { computed } from 'vue'    ← 上下文行（灰色）
  42 │ import { watch } from 'vue'       ← 匹配行（高亮）
  43 │ import { onMounted } from 'vue'   ← 上下文行（灰色）
  44 │ import { nextTick } from 'vue'    ← 上下文行（灰色）
  ···
  58 │ const result = ref(null)          ← 上下文行（灰色）
  59 │ const pattern = ref('')           ← 匹配行（高亮）
  60 │ const isRegex = ref(false)        ← 匹配行（高亮，与上一个合并）
  61 │ const caseSensitive = ref(false)  ← 上下文行（灰色）
```

**UI 状态新增字段**：

```typescript
// useDirSearchUiState.ts createDefaultState() 中新增
contextLinesEnabled: false,   // 上下文行开关（默认关闭）
contextLinesCount: 2,         // 上下文行数（默认 2）
```

**设置区域新增项**（在 Batch 8b 的折叠设置区域中）：

- `☑ 扩展上下文` — 开关
- `行数: [2]` — 数字输入框（1-10）

**搜索请求联动**：

```typescript
// useDirSearch.ts executeSearch() 中
contextLines: uiState.contextLinesEnabled.value ? uiState.contextLinesCount.value : 0;
```

- [x] 后端 `dir_search.rs`：
  - `SearchMatch` 新增 `context_before: Option<Vec<String>>` 和 `context_after: Option<Vec<String>>`
  - 添加 `#[serde(skip_serializing_if = "Option::is_none")]`
  - 在文件搜索逻辑中，当 `context_lines > 0` 时读取上下文行
  - 移除 `context_lines` 字段上的 `#[allow(dead_code)]`
- [x] 前端 `types.ts`：
  - `SearchMatch` 新增 `contextBefore?: string[]` 和 `contextAfter?: string[]`
  - 新增 `ContextBlock` 和 `ContextLine` 接口
- [x] 前端 `useDirSearchUiState.ts`：新增 `contextLinesEnabled` 和 `contextLinesCount` 字段
- [x] 前端 `SearchInput.vue`：在折叠设置区域新增"扩展上下文"开关和"行数"输入框
- [x] 前端 `useDirSearch.ts`：搜索请求中根据设置传递 `contextLines`
- [x] 新增 composable `useContextBlocks.ts`：
  - 接收 `SearchMatch[]`，输出 `ContextBlock[]`
  - 实现合并去重算法
- [x] 修改 `ResultItem.vue` / 新增 `ContextBlockView.vue`：
  - 当上下文功能关闭时，保持当前单行渲染
  - 当上下文功能开启时，按 `ContextBlock` 渲染多行代码块
  - 上下文行灰色显示，匹配行保持高亮
  - 块间分隔线
- [x] 修改 `ResultsTree.vue`：根据上下文开关选择渲染模式
- [x] 验证：
  - 上下文关闭时行为与当前完全一致
  - 上下文开启时相邻匹配正确合并
  - 性能对比：`contextLines=0` vs `contextLines=2` 的搜索耗时差异可接受
  - 类型检查 + clippy 通过

**提交信息**: `feat(dir-search): 上下文行功能，支持内联展示与多行合并去重`

---

## 6. 风险与注意事项

1. **并行搜索的结果顺序**：`WalkParallel` 不保证文件顺序，前端需要按路径排序或接受乱序。
2. **单项替换的原子性**：单项替换需要精确定位到文件中的具体位置，需要确保替换时文件未被外部修改。
3. **历史记录膨胀**：需要设置上限（搜索词 20 条，目录 10 条），超出时 FIFO 淘汰。
4. **上下文行性能**：`contextLines > 0` 时每个匹配需要额外读取前后行，会增加内存占用和 IPC 传输量。默认关闭（`contextLinesEnabled: false`），由用户主动开启。开启后搜索耗时预计增加 10-20%（需实测验证）。
5. **上下文合并复杂度**：合并算法在前端执行，对于单文件数百个匹配的极端情况需要注意性能。可考虑对超过阈值的文件跳过合并，直接逐行展示。
6. **Tooltip 与上下文行的关系**：两者独立——Tooltip 始终显示匹配行完整内容（纯前端，无后端依赖），上下文行是结果列表的内联展示（需后端数据）。两者可同时生效互不干扰。

---

## 7. 实施总结

所有 8 个 Batch 已全部完成（B1-B8c ✅）。

**关于虚拟滚动的决策**：经实测，2 万条搜索结果在 Vue 中渲染简单 DOM 元素不会出现滚动卡顿，虚拟滚动的引入复杂度（动态行高、上下文块展开等）远大于收益，决定不予引入。

**性能优化成果**：
- 后端：`build_parallel()` 多线程并行 + IPC 批处理，大目录搜索速度显著提升
- 前端：批量事件处理避免高频重渲染，2 万条结果流畅无卡顿
