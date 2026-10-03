# Git Committer (Git 提交助手): 架构与技术指南

本文档深入解析 Git Committer 工具的系统架构、设计理念、状态模型与交互设计，为后续功能演进与维护提供技术指引。

---

## 1. 核心定位与设计理念

Git Committer 是面向开发者多仓库并发开发场景设计的轻量级 Git 提交与版本管理工作台。

- **多仓库并发与快速切换**：通过左侧 Edge 风格垂直仓库栏（RepoBar）及全景看板（PanoramaDashboard），支持数十个 Git 仓库的无缝切换、状态监控与批量拉取/推送。
- **状态隔离与会话记忆**：每个仓库拥有独立的运行状态（拉取/推送/生成/提交中）、已打开的差异标签页列表（`openTabs`）、激活的 Tab 及 Commit Message 草稿，切换仓库不丢失上下文。
- **AI 赋能提交信息生成**：基于 Unified Diff 增量差异提取上下文，结合独立仓库级提示词模板与首选语言，智能生成规范的提交信息。
- **专业级可视化与交互**：内建 Git 分支泳道拓扑图谱、全局工作区文件名与 Diff 内容秒级检索、多媒体资产（图片/音频/视频）差异对比以及覆盖全区域的原生右键菜单。

---

## 2. 架构概览

### 2.1 整体分层

```
┌────────────────────────────────────────────────────────────────────────┐
│  View 层 (UI 展现)                                                     │
│  GitCommitter.vue (主容器 + DropZone 仓库拖拽导入)                      │
│  ├── RepoBar.vue (垂直仓库栏) + RepoCard.vue + PanoramaDashboard.vue   │
│  ├── GitHeaderBar.vue (顶部状态栏 + 分支信息 + 搜索栏入口)               │
│  ├── Sidebar.vue (变更区: 暂存/工作区列表 + AI 提交面板)               │
│  ├── MainArea.vue (Monaco Diff / 文件内容 / 多媒体差异标签页)          │
│  ├── RightSidebar.vue (提交历史 + CommitGraphTrack 泳道 + 提交详情)    │
│  └── 弹窗层: RepositoryPromptDialog, RepositoryColorDialog, Settings   │
├────────────────────────────────────────────────────────────────────────┤
│  Interaction & Visuals (交互与可视化增强)                              │
│  ├── GitContextMenu.vue (Teleport 单例右键菜单)                        │
│  ├── GitSearchDropdown.vue (工作区搜索下拉浮层)                        │
│  ├── GitMediaDiffPreview.vue (图像/音频/视频差异预览)                   │
│  └── CommitGraphTrack.vue (分支图谱 Canvas / SVG 紧凑泳道渲染)         │
├────────────────────────────────────────────────────────────────────────┤
│  Logic & Composables 层 (业务逻辑编排)                                  │
│  ├── useGitCommitterState.ts (全局与多仓库状态管理、持久化配置)        │
│  ├── useGitCommitterRunner.ts (状态刷新、暂存/放弃修改、提交与推送)     │
│  ├── useGitRepoWorkflow.ts (AI 提交流程、Unified Diff 组装、Prompt)    │
│  ├── useGitWorkspaceSearch.ts (工作区全文/文件名并发检索与高亮)        │
│  ├── useGitContextMenu.ts + contextMenus.ts (右键菜单状态与项构建)     │
│  ├── useGitRepositoryManagement.ts (仓库增删、改名、选色、拖拽排序)    │
│  └── useCommitDetails.ts / useGitRemoteInfo.ts (提交详情与远端联动)   │
├────────────────────────────────────────────────────────────────────────┤
│  Utils 层 (算法与辅助函数)                                             │
│  ├── gitTimelineGraph.ts (分支图谱拓扑排序与活跃泳道计算)              │
│  └── utils.ts (路径解析、高亮切片、Diff 文本清洗、状态映射)            │
├────────────────────────────────────────────────────────────────────────┤
│  Tauri IPC 接口 (Rust 后端 git_committer.rs / git_analyzer.rs)         │
│  git_get_status, git_diff, git_stage_file, git_unstage_file,           │
│  git_discard_changes, git_commit, git_push, git_pull, git_remote_info   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 前端核心文件职责

| 模块 / 文件 | 职责说明 |
| --- | --- |
| `useGitCommitterState.ts` | 状态真源。管理仓库列表、当前激活仓库、全局配置（自动推送/拉取、色盘、默认模型等）及各仓库会话记忆（`repoSessions`） |
| `useGitCommitterRunner.ts` | 核心执行器。封装文件暂存/取消暂存、放弃修改、物理删除未跟踪文件、拉取、推送及提交操作 |
| `useGitRepoWorkflow.ts` | AI 提交流程编排。负责组装 unified diff、注入提示词、调用模型流式生成、剔除 Markdown 围栏并写入草稿 |
| `useGitWorkspaceSearch.ts` | 工作区搜索核心。异步并发检索文件名与文件 Diff 文本，提供内存缓存与防抖匹配 |
| `gitTimelineGraph.ts` | 纯数学/拓扑算法。将线性提交历史解析为分支泳道矩阵，计算连线拐点与合并节点 |
| `useGitContextMenu.ts` | 右键菜单控制器。管理右键菜单激活位置、单例 Teleport 挂载及视口边界碰撞校正 |
| `contextMenus.ts` | 纯函数菜单项构建器。根据点击的目标类型（仓库/Tab/变更文件/提交节点）生成标准菜单模型 |

---

## 3. 关键子系统机制

### 3.1 分支泳道与图谱可视化 (Branch Timeline Graph)

在右侧边栏（RightSidebar）的提交历史中，为了让多分支协同、分叉与合并流向清晰可见，工具实现了拓扑泳道算法与渲染组件：

1. **拓扑排序与活跃槽位复用 (`gitTimelineGraph.ts`)**：
   - 接收按时间倒序排列的提交列表（`commits: GitCommitSummary[]`）。
   - 维护一个**活跃泳道数组**（`activeLanes: (string | null)[]`），数组的索引即为视觉列（Lane Index）。
   - 当遍历到某个 commit 时：
     - 若该 commit 已在 `activeLanes` 中被先前的子节点跟踪，则当前 commit 接入该泳道；
     - 若未被跟踪（如多个分支 HEAD），在空闲槽位或末尾分配新泳道；
     - 处理合并提交（`isMerge = parents.length > 1`）时，为每个父提交建立出向连接（`outgoingConnections`），并占用或分配对应槽位。
   - 采用标准 8 色循环配色板（`GIT_GRAPH_COLORS`），主干分支与首条泳道优先采用鲜明主题色。
2. **紧凑行内渲染 (`CommitGraphTrack.vue`)**：
   - 统计每行实际涉及的泳道数（`rowLanes`），避免全局最大泳道宽度带来的过度留白。
   - 渲染节点圆点、穿越线（`passThroughLanes`）与贝塞尔拐角连接线（`fromLane -> toLane`），直观呈现分支分叉与 Merge 节点。

### 3.2 完整右键菜单体系 (Context Menu System)

Git Committer 采用基于 **Teleport 单例模式** 的独立右键菜单（`GitContextMenu.vue`），统一覆盖四个高频交互区域：

1. **仓库列表 (RepoBar)**：
   - 支持快速切换仓库、在系统文件管理器中打开、手动刷新状态、触发拉取/推送。
   - 提供修改仓库别名、调整仓库个性化图标颜色、编辑专属 AI 提示词、从列表中移除等操作。
2. **文件差异标签页 (MainArea Tab 栏)**：
   - 标签管理：关闭、关闭其他、关闭右侧、全部关闭。
   - 路径交互：复制相对仓库路径、复制完整物理路径、在文件管理器中定位。
   - 模式切换：差异模式（Diff View）与单文件原始内容查看（File View）无缝切换；暂存/取消暂存。
3. **更改列表 (Sidebar 与 ChangesDiffView)**：
   - **安全操作区分**：
     - 已跟踪文件的修改：提供“放弃更改（git checkout / restore）”；
     - **未跟踪文件（Untracked / "?"）**：显式区分**物理删除到系统回收站**与清理，并在操作前弹出风险确认，杜绝误删未提交代码。
   - 暂存区与工作区文件的就地暂存/取消暂存、打开差异、查看文件内容。
4. **提交历史 (RightSidebar)**：
   - 提交节点（Commit Node）：查看该次提交所有更改总览、展开/折叠文件、复制 Commit Hash、复制提交消息、通过远端信息（`useGitRemoteInfo`）在浏览器直接打开 GitHub/GitLab 提交页面。
   - 提交所含文件行（Commit File）：独立右键打开该历史文件的变更 Diff、复制完整路径。

### 3.3 全局工作区搜索 (`useGitWorkspaceSearch`)

为了在大型项目中快速定位被改动的文件或代码段：

1. **双向联合匹配**：
   - 检索关键词同时在**文件路径/文件名**和**文件 Diff 变更文本**中执行匹配。
2. **精准高亮与摘要截取**：
   - 单文件最多提取展示前 3 个内容匹配行（避免单文件过多结果撑爆下拉），并在右侧明确标注剩余未展示命中数（`+N`）。
   - 高亮切片（`highlightTextParts`）智能划分命中文本与常规文本，保证高亮样式精准。
3. **缓存与性能保护**：
   - 建立 `diffContentCache` 内存缓存，键为 `${repoPath}:${isStaged}:${filePath}`。
   - 监听仓库状态刷新事件，当仓库产生新变更或切换时，自动使当前仓库缓存失效。
   - 结合 200ms 防抖，保障在数十个改动文件时输入依然如丝般顺滑。

### 3.4 媒体文件差异对比 (`GitMediaDiffPreview`)

Git 仓库中常包含图片、音频、视频等资产。传统 Diff 视图仅显示“二进制文件已更改”，Git Committer 对此提供了开箱即用的多媒体可视化对比：

- **类型智能分流**：根据文件扩展名与元数据识别 `image`、`audio`、`video`、`binary` 四种预览类型。
- **双侧并排预览**：
  - **图片**：并排渲染“工作区/暂存版本”与“HEAD/基础版本”，直观对比视觉变化，点击可展开高分辨率大图预览。
  - **音频/视频**：内嵌轻量级播放器组件（`AudioPlayer`、`VideoPlayer`），支持分别试听修改前后的音频轨道或播放视频切片。
  - **尺寸与元数据**：头部清晰展示双方文件的字节大小（Byte Size）差异。

### 3.5 提示词与外观个性化定制

针对团队中不同仓库规范不同的痛点（例如有的仓库要求 Angular 提交规范，有的要求纯中文，有的要求带 Issue 编号）：

- **仓库级 AI 提示词覆盖**：
  - 全局默认提示词（`systemPrompt`）作为底座。
  - 每个仓库可配置专属的 `systemPrompt`（存储在 `RepositoryConfig` 中）；存在专属提示词时优先应用，未设置时继承全局配置。
- **首选提交语言 (`commitLanguage`)**：
  - 支持指定生成提交信息的自然语言（简体中文、英文等），并在 Prompt 组装时强制注入语言限制。
- **仓库专属调色板与配色选择**：
  - 支持在设置中自定义候选色盘数组（`repoAvatarPalette`）。
  - 新增仓库时根据色盘哈希自动分配初始色；用户可通过 `RepositoryColorDialog` 自定义选取颜色，便于在多仓库垂直栏中一眼识别。

### 3.6 提交流程与 Prompt 优化

- **Unified Diff 替代全量快照**：
  - 弃用传统的读取整个文件内容发送给 LLM 的做法，改为仅提取 `git diff` 生成的 unified diff 文本块。大幅缩减 Prompt Token 开销，并使 LLM 能够专注于实际代码增量。
- **Markdown 围栏自动剥离**：
  - 针对大语言模型常常在提交信息外层包裹 ````markdown ... ```` 或 ````gitcommit ... ```` 的习惯，在数据清洗层使用专用正则表达式自动剔除首尾围栏，保证填入 Commit Message 输入框的内容纯净可用。
- **未暂存文件可选包含 (`aiIncludeUnstaged`)**：
  - 当工作区没有执行 `git add`（暂存区为空）但用户需要直接生成提建议时，可配置允许 AI 读取未暂存文件生成提交信息，满足快节奏小步提交习惯。

---

## 4. 数据结构与持久化

### 4.1 核心数据接口

```typescript
export interface RepositoryConfig {
  path: string;
  name: string;
  alias?: string;
  systemPrompt?: string;
  color?: string;
}

export interface RepoSession {
  openTabs: DiffTabRef[];
  activeTabPath: string;
  commitDraft: string;
}

export interface GitCommitterConfig {
  repositories: RepositoryConfig[];
  currentRepoPath: string;
  sidebarWidth: number;
  rightSidebarWidth: number;
  isRightSidebarExpanded: boolean;
  isRepoBarPinned: boolean;
  hideUnchangedRegions: boolean;
  repoSessions: Record<string, RepoSession>;
  autoPushAfterCommit: boolean;
  autoPullOnSwitch: boolean;
  aiIncludeUnstaged: boolean;
  defaultModel: string;
  commitLanguage: string;
  systemPrompt: string;
  enableAutoRefresh: boolean;
  autoRefreshInterval: number;
  repoAvatarPalette: string[];
}
```

配置采用 `createConfigManager` 管理并持久化至应用配置目录下的 `git-committer-config.json`，确保用户重启应用后布局、草稿和仓库设置完好保留。
