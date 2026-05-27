# Git Analyzer 后端性能优化计划

> **状态**: RFC (Request for Comments)  
> **创建时间**: 2025-05-27  
> **目标**: 将主加载速度提升 5-20x，同时保持搜索功能完整可用

## 1. 问题概述

当前 `git_load_repository_stream` 在主加载循环中为每个 commit 执行了过重的操作：

| 操作                                            | 耗时/commit | 必要性          |
| ----------------------------------------------- | ----------- | --------------- |
| `find_commit` + 读取元数据                      | ~0.01ms     | ✅ 必须         |
| `tags_map` / `branch_tips` 查找                 | ~0.001ms    | ✅ 必须（O(1)） |
| `get_commit_branches_optimized` (DAG 遍历)      | 1-50ms      | ❌ 可延后       |
| `diff_tree_to_tree` + `diff.foreach` (文件路径) | ~1-2ms      | ✅ 搜索需要     |
| `diff.stats()` (总增删统计)                     | 1-10ms      | ❌ 可延后       |
| `diff.print(Patch)` (逐行比较)                  | 5-100ms     | ❌ 可延后       |

**当前默认 `includeFiles = true`**，意味着每个 commit 都要执行完整 diff（含最重的 `diff.print`），这是主要瓶颈。

## 2. 设计目标

1. **主加载极速化**：只获取元数据 + 轻量文件路径列表（path + status），搜索功能不受影响
2. **重信息用户触发**：行级统计（additions/deletions）和分支推断不自动拉取，由用户显式触发
3. **导出交互重设计**：提供明确的"补充数据"按钮，避免勾选选项后自动占位拉取

## 3. 架构变更

### 3.1 后端：拆分 diff 计算为两级

#### Level 1：轻量文件列表（主加载中执行）

```rust
/// 只获取文件路径和变更状态，不统计行数
fn get_commit_file_paths(
    repo: &Repository,
    commit: &git2::Commit,
) -> Result<Vec<FileChange>, String> {
    let a = /* parent tree */;
    let b = commit.tree()?;
    let diff = repo.diff_tree_to_tree(a.as_ref(), Some(&b), None)?;

    let mut files = Vec::new();
    diff.foreach(
        &mut |delta, _| {
            let status = match delta.status() { /* A/M/D/R/C/T */ };
            if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                files.push(FileChange {
                    path: path.to_string(),
                    status: status.to_string(),
                    additions: 0,  // 占位，Level 2 补充
                    deletions: 0,
                });
            }
            true
        },
        None, None, None,
    )?;
    Ok(files)
}
```

开销：每 commit ~1-2ms，1000 commits ≈ 1-2s，可接受。

#### Level 2：完整行级统计（enrich 阶段执行）

```rust
/// 获取每文件的增删行数 + 总统计
fn get_commit_full_diff_info(
    repo: &Repository,
    commit: &git2::Commit,
) -> Result<(CommitStats, Vec<FileChange>), String> {
    // 合并为单次遍历（优化点 D）
    let diff = /* diff_tree_to_tree */;

    let mut files: HashMap<String, FileChange> = HashMap::new();
    let mut total_add = 0u32;
    let mut total_del = 0u32;

    // 单次 diff.print 同时收集文件信息和行统计
    diff.print(DiffFormat::Patch, |delta, _hunk, line| {
        if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
            let entry = files.entry(path.to_string()).or_insert_with(|| FileChange {
                path: path.to_string(),
                status: delta_status_str(delta.status()),
                additions: 0,
                deletions: 0,
            });
            match line.origin() {
                '+' => { entry.additions += 1; total_add += 1; }
                '-' => { entry.deletions += 1; total_del += 1; }
                _ => {}
            }
        }
        true
    })?;

    let stats = CommitStats {
        additions: total_add,
        deletions: total_del,
        files: files.len() as u32,
    };
    Ok((stats, files.into_values().collect()))
}
```

### 3.2 后端：新增 `git_enrich_commits_stream` 命令

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum GitEnrichEvent {
    Start { total: usize },
    Data {
        enriched: Vec<CommitEnrichment>,
        progress: usize,
    },
    End,
    Cancelled,
    Error { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitEnrichment {
    pub hash: String,
    pub stats: Option<CommitStats>,
    pub files: Option<Vec<FileChange>>,  // 带行数的完整版
    pub branches: Option<Vec<String>>,
}

#[tauri::command]
pub async fn git_enrich_commits_stream(
    window: tauri::Window,
    path: String,
    hashes: Vec<String>,
    batch_size: Option<usize>,   // 默认 50
    include_stats: Option<bool>, // 默认 true
    include_files: Option<bool>, // 默认 true（带行数）
    include_branches: Option<bool>, // 默认 false
) -> Result<(), String>
```

特点：

- 使用独立的 `ENRICH_CANCEL_TOKEN`（不与主加载共享）
- 事件名：`git-enrich-progress`（与主加载事件隔离）
- 分批处理，每批完成后 emit

### 3.3 后端：`get_total_commits` 异步化

```rust
// 修改 git_load_repository_stream：
// 1. 先发 Start 事件（total = 0，表示未知）
// 2. 在 revwalk 遍历过程中实时更新 total（通过 Meta 事件或在 Data 事件中携带）
// 3. 或者：保留 get_total_commits 但改为可选（前端可以选择不等待）

// 新增事件类型
GitProgressEvent::Meta { total: usize }  // 异步补发总数
```

### 3.4 后端：主加载流程修改

`parse_commit_optimized` 修改为：

```rust
fn parse_commit_optimized(
    repo: &Repository,
    oid: Oid,
    include_file_paths: bool,  // 重命名：只获取路径，不含行数
    tags_map: &HashMap<Oid, Vec<String>>,
    branch_tips: &HashMap<Oid, Vec<String>>,
) -> Result<GitCommit, String> {
    // ... 元数据获取不变 ...

    // branches：只做 O(1) 的 tip 查找，不做启发式推断
    let branches = branch_tips.get(&oid).cloned().unwrap_or_default();

    // files：只获取路径和状态（Level 1）
    let files = if include_file_paths {
        Some(get_commit_file_paths(repo, &commit)?)
    } else {
        None
    };

    // stats：主加载中不计算
    let stats = None;

    Ok(GitCommit { /* ... */ })
}
```

### 3.5 前端：状态管理变更

```typescript
// useGitAnalyzerState.ts 新增
const enriching = ref(false);
const enrichProgress = ref({ loaded: 0, total: 0 });
const enrichedHashes = ref(new Set<string>()); // 已补充完整数据的 hash 集合

// includeFiles 改为只控制主加载中的 Level 1 文件路径
// 默认保持 true（因为现在很轻量了）
const includeFiles = ref(true);
```

### 3.6 前端：导出模块交互重设计

**核心原则**：补充拉取由用户显式触发，不自动开始。

```
┌─────────────────────────────────────────────────┐
│  导出配置面板                                      │
├─────────────────────────────────────────────────┤
│  ☑ 包含统计信息                                   │
│  ☑ 包含提交列表                                   │
│  ☑ 包含贡献者                                     │
│  ☐ 包含文件变更详情 (需要补充数据)                  │
│  ☐ 包含行级统计 (需要补充数据)                      │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ ⚠️ 当前有 2 个选项需要补充数据                  │ │
│  │                                              │ │
│  │ 需要为 156 个提交获取行级统计信息。              │ │
│  │ 预计耗时：约 15 秒                            │ │
│  │                                              │ │
│  │        [ 开始补充数据 ]                        │ │
│  │                                              │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [ 导出 ] (数据不完整时禁用或提示)                  │
└─────────────────────────────────────────────────┘
```

交互流程：

1. 用户勾选需要行级统计的选项 → 面板显示"需要补充数据"提示区
2. 提示区显示：需要补充的 commit 数量 + 预估耗时
3. 用户点击"开始补充数据"按钮 → 触发 `git_enrich_commits_stream`
4. 进度条显示补充进度
5. 补充完成 → 提示区消失，导出按钮可用
6. 如果用户取消勾选 → 提示区消失，无需补充

**关键设计决策**：

- 不在主加载完成后自动触发 enrich
- 不在打开导出面板时自动触发 enrich
- 只在用户明确点击"开始补充数据"时触发
- 补充过程可取消

### 3.7 前端：Loader 层新增

```typescript
// useGitLoader.ts 新增

export interface EnrichOptions {
  path: string;
  hashes: string[];
  batchSize?: number;
  includeStats?: boolean;
  includeFiles?: boolean;
  includeBranches?: boolean;
}

export interface GitEnrichEvent {
  type: "start" | "data" | "end" | "cancelled" | "error";
  total?: number;
  enriched?: CommitEnrichment[];
  progress?: number;
  message?: string;
}

export interface CommitEnrichment {
  hash: string;
  stats?: CommitStats;
  files?: FileChange[];
  branches?: string[];
}

export async function streamEnrichCommits(
  options: EnrichOptions,
  onProgress: (event: GitEnrichEvent) => void,
): Promise<void> {
  /* ... */
}

export async function cancelEnrich(): Promise<void> {
  /* ... */
}
```

### 3.8 前端：Runner 层新增

```typescript
// useGitAnalyzerRunner.ts 新增

/**
 * 显式触发数据补充
 * 由导出面板的"开始补充数据"按钮调用
 */
async function enrichCommits(options?: { includeStats?: boolean; includeFiles?: boolean; includeBranches?: boolean }) {
  const state = useGitAnalyzerState();
  const hashesToEnrich = state.commits.value.filter((c) => !state.enrichedHashes.value.has(c.hash)).map((c) => c.hash);

  if (hashesToEnrich.length === 0) return;

  state.enriching.value = true;
  state.enrichProgress.value = { loaded: 0, total: hashesToEnrich.length };

  await streamEnrichCommits(
    {
      path: state.repoPath.value,
      hashes: hashesToEnrich,
      batchSize: 50,
      ...options,
    },
    (event) => {
      switch (event.type) {
        case "data":
          // 更新 commits 数组中对应项
          for (const enrichment of event.enriched || []) {
            const commit = state.commits.value.find((c) => c.hash === enrichment.hash);
            if (commit) {
              if (enrichment.stats) commit.stats = enrichment.stats;
              if (enrichment.files) commit.files = enrichment.files;
              if (enrichment.branches) commit.branches = enrichment.branches;
            }
            state.enrichedHashes.value.add(enrichment.hash);
            // 同步更新 commitCache
            commitCache.setCommitDetail(enrichment.hash, commit);
          }
          state.enrichProgress.value.loaded = event.progress || 0;
          break;
        case "end":
          state.enriching.value = false;
          // 重新应用筛选以更新视图
          filterCommits();
          break;
        // ...
      }
    },
  );
}
```

## 4. 加载配置弹窗设计

在 InfoCard 头部按钮组中新增一个"⚙️ 设置"按钮（与"刷新""导出"并列），点击弹出配置弹窗，让用户自主选择初始拉取的信息层级。不放在下方筛选区域，避免挤占空间。

```vue
<!-- GitAnalyzer.vue headerExtra 区域 -->
<template #headerExtra>
  <el-button-group>
    <el-button :icon="Setting" @click="showLoadConfig = true"> 设置 </el-button>
    <el-button :icon="Refresh" @click="refreshRepository" :loading="loading"> 刷新 </el-button>
    <el-button :icon="Upload" @click="showExportDialog" :disabled="commits.length === 0"> 导出 </el-button>
  </el-button-group>
</template>
```

### 4.1 弹窗 UI 布局

```
┌─────────────────────────────────────────────────┐
│  ⚙️ 加载设置                              [×]   │
├─────────────────────────────────────────────────┤
│                                                   │
│  🎯 快速预设                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ ⚡ 极速  │ │ 🔍 标准  │ │ 📊 完整  │         │
│  │          │ │  (当前)  │ │          │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                   │
│  📦 初始加载包含的数据                              │
│  ─────────────────────────────────────────────── │
│  ☑ 文件路径列表                                   │
│    获取每个提交修改了哪些文件（支持文件路径搜索）      │
│    ⚡ 开销极低，推荐保持开启                        │
│                                                   │
│  ☐ 行级统计 (additions/deletions)                 │
│    获取每个文件的增删行数，列表中显示 +N/-M          │
│    ⚠️ 开销较高，大仓库建议关闭后按需补充             │
│                                                   │
│  ☐ 分支归属推断                                   │
│    启发式推断每个提交所属的功能分支                   │
│    ⚠️ 开销中等，分支多时较慢                        │
│                                                   │
│  ─────────────────────────────────────────────── │
│  💡 提示：行级统计和分支归属可在加载完成后            │
│     通过导出面板的"补充数据"按钮按需获取。           │
│                                                   │
│           [ 恢复默认 ]    [ 确定 ]                 │
└─────────────────────────────────────────────────┘
```

### 4.2 职责划分：设置弹窗 vs ControlPanel

| 参数                                       | 归属                     | 原因                       |
| ------------------------------------------ | ------------------------ | -------------------------- |
| 数据获取层级（文件路径/行级统计/分支推断） | **设置弹窗**             | 策略配置，不常改           |
| 加载条数 (`limitCount`)                    | **ControlPanel toolbar** | 操作参数，每次加载可能调整 |
| 批次大小 (`batchSize`)                     | **ControlPanel toolbar** | 操作参数，调试/调优时用    |
| 预设模式                                   | **设置弹窗**             | 一键切换策略               |

设置弹窗只管"获取什么信息"，ControlPanel 管"获取多少条、怎么发送"。两者互不干扰。

Enrich 阶段的 batchSize（异步补充每批处理多少条）使用固定默认值 50，不暴露给用户。

### 4.3 配置项说明

| 配置项       | 对应后端参数               | 默认值  | 说明                        |
| ------------ | -------------------------- | ------- | --------------------------- |
| 文件路径列表 | `include_file_paths`       | ✅ 开启 | Level 1，搜索功能依赖此数据 |
| 行级统计     | `include_line_stats`       | ❌ 关闭 | Level 2，最重的操作         |
| 分支归属推断 | `include_branch_inference` | ❌ 关闭 | 启发式 DAG 遍历             |

### 4.4 配置持久化

- 使用 `localStorage` 存储用户偏好（key: `git-analyzer-load-config`）
- 首次使用时采用默认值（标准模式）
- 配置变更后下次加载生效，不影响当前已加载的数据

### 4.5 与现有控制面板的关系

ControlPanel toolbar 保留：

- 仓库路径输入 + 目录选择
- 分支选择
- 加载条数 (`limitCount`)
- 批次大小 (`batchSize`)
- 加载/终止按钮

筛选区域保留不变。

头部按钮组（InfoCard headerExtra）：

- **⚙️ 设置**（打开加载配置弹窗，管理数据获取层级）
- **🔄 刷新**（强制全量重新加载）
- **📤 导出**（打开导出面板）

迁移内容：只有 `includeFiles` 从 ControlPanel 迁移到设置弹窗（因为它现在拆分为三个独立的层级选项）。`limitCount` 和 `batchSize` 保留在 toolbar 中。

### 4.6 预设模式

| 预设                | 文件路径 | 行级统计 | 分支推断 | 适用场景               |
| ------------------- | -------- | -------- | -------- | ---------------------- |
| ⚡ 极速模式         | ❌       | ❌       | ❌       | 超大仓库，只看提交消息 |
| 🔍 标准模式（默认） | ✅       | ❌       | ❌       | 日常使用，支持文件搜索 |
| 📊 完整模式         | ✅       | ✅       | ✅       | 小仓库，需要完整统计   |

用户点击预设卡片后自动填充对应选项，也可以手动微调。选中的预设高亮显示，手动修改后预设标记变为"自定义"。

## 5. 实施步骤

### Step 1：后端 - 拆分 diff 函数 + 合并遍历优化

- 新增 `get_commit_file_paths()`（Level 1，轻量）
- 重写 `get_commit_diff_info()` 为 `get_commit_full_diff_info()`（Level 2，合并为单次遍历）
- 修改 `parse_commit_optimized()`：`include_files` 参数改为只调用 Level 1
- 移除分支启发式推断（`get_commit_branches_optimized`）从主加载路径

### Step 2：后端 - 新增 enrich 命令

- 新增 `ENRICH_CANCEL_TOKEN`
- 实现 `git_enrich_commits_stream` 命令
- 新增 `git_cancel_enrich` 命令
- 注册到 `lib.rs` 的 `generate_handler![]`

### Step 3：后端 - `get_total_commits` 异步化

- 修改 `git_load_repository_stream`：先发 Start(total=0)，后补发 Meta 事件
- 或保留同步计数但作为可选行为（前端传参控制）

### Step 4：前端 - Loader 层适配

- 新增 `streamEnrichCommits()` 和 `cancelEnrich()`
- 新增 `GitEnrichEvent` 类型定义

### Step 5：前端 - State 层适配

- 新增 `enriching`、`enrichProgress`、`enrichedHashes` 状态
- `includeFiles` 语义调整为"主加载是否包含文件路径"（默认 true，因为现在很轻量）
- 新增 `loadConfig` 持久化配置对象

### Step 6：前端 - Runner 层适配

- 新增 `enrichCommits()` 方法
- `handleProgressEvent` 中移除自动补充逻辑
- `loadRepository()` 读取 `loadConfig` 决定传递哪些参数

### Step 7：前端 - 加载配置弹窗组件

- 新增 `LoadConfigDialog.vue` 组件
- 实现预设模式切换
- 配置持久化到 localStorage
- 从 ControlPanel 中迁移相关选项

### Step 8：前端 - 导出模块 UI 重设计

- 检测哪些选项需要补充数据
- 显示"需要补充数据"提示区 + 按钮
- 按钮触发 `enrichCommits()`
- 进度展示 + 取消支持
- 数据不完整时导出按钮的状态管理

### Step 9：前端 - CommitListView 适配

- 列表中的 +/- 统计显示：未补充时显示占位符或隐藏
- 补充完成后自动更新显示

## 6. 兼容性与迁移

- `git_get_commit_detail`（单条详情）保持不变，仍返回完整数据
- `git_load_repository_stream` 的 `include_files` 参数语义变更：从"包含完整 diff"变为"包含文件路径列表"
- 前端 `includeFiles` state 语义不变（控制是否在主加载中获取文件信息），但实际开销大幅降低
- Agent actions 中的 `includeFiles` 选项：走 enrich 路径或 `git_get_commit_detail` 单条路径

## 7. 实施优先级

```
Phase A（核心提速，必做）:
  Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6

Phase B（UI 适配，必做）:
  Step 7 → Step 8 → Step 9

推荐顺序：Phase A 全部完成后再做 Phase B
预计agent工作量：Phase A ~15分钟，Phase B ~5分钟
```

## 8. 预期收益

| 场景                         | 当前耗时 (1000 commits) | 优化后               |
| ---------------------------- | ----------------------- | -------------------- |
| 主加载（includeFiles=true）  | 10-60s                  | 2-4s                 |
| 主加载（includeFiles=false） | 3-8s                    | 1-3s                 |
| 搜索文件路径                 | 即时（数据已有）        | 即时（Level 1 已有） |
| 导出带行级统计               | 即时（数据已有）        | 用户触发后 10-30s    |
| 首帧显示                     | 2-5s（等 total 计数）   | <0.5s                |

