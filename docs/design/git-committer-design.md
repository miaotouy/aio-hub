# Git Committer (AI 提交助手) 设计方案

本文档详细阐述了 `git-committer` (AI 提交助手 / 多仓库提交管理器) 的设计方案。该工具旨在解决多仓库并发施工场景下，频繁切换 VSCode 窗口进行代码检查、AI 提交和推送的痛点。

通过采用**Edge 级可展开垂直仓库栏**、**多标签页 Diff 视图**以及**多仓库状态持久化记忆**，提供一个比 VSCode 更轻量、更专注于多仓库协同的专用 Git 提交工作流。

---

## 1. 背景与痛点

In AI-assisted programming (such as concurrent Agent construction), developers often face the following pain points:

1. **多仓库并发施工**：AI 在不同的本地目录中同时修改代码，开发者需要频繁在多个仓库之间切换以检查修改并提交。
2. **VSCode 切换开销重**：VSCode 切换项目目录需要重新加载大量的插件、语言服务和项目环境，耗时且占用大量内存。
3. **堆叠布局拥挤**：传统的堆叠式或下拉菜单式仓库选择器在管理多个仓库时非常拥挤，无法直观地同时监控多个仓库的实时状态。
4. **缺乏上下文记忆**：在不同仓库间切换时，写到一半的提交信息、打开的 Diff 视图容易丢失，导致工作流被打断。

---

## 2. 核心定位与对比

`git-committer` 的核心定位是**“写操作与工作流偏重的轻量级多仓库 Git 提交助手”**。它与现有的 `git-analyzer` 互补，但职责完全分离：

| 维度           | `git-analyzer` (Git 分析器)                  | `git-committer` (AI 提交助手)                                     |
| :------------- | :------------------------------------------- | :---------------------------------------------------------------- |
| **核心定位**   | **历史分析与可视化**（只读偏重）             | **工作流与写操作**（写操作偏重）                                  |
| **核心数据流** | 流式加载历史 commits、生成统计图表和报告。   | 监控工作区状态、暂存、AI 提交、推送。                             |
| **仓库管理**   | **单仓库模式**：一次只能加载和分析一个仓库。 | **多仓库并发管理**：Edge 级垂直仓库栏常驻，一键刷新所有仓库状态。 |
| **UI 布局**    | 复杂的筛选面板、图表和历史树。               | 可展开垂直仓库栏 + 极简侧边栏 + 多标签页 Diff 视图。              |

---

## 3. 界面布局设计 (Layout v6 - 双侧边栏对称美学与多 Tab 视图)

为了保证 Diff 视图有绝对充足的宽度，同时兼顾“写操作”与“历史/图表查看”的并行动作，我们采用**“最左侧 Edge 级可展开垂直仓库栏、左侧控制栏、中间多标签页主视图、右侧可折叠图表侧边栏”**的专业对称布局。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TitleBar (标题栏：工具名称、全局状态、📊 右侧栏切换按钮)                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────┐┌──────────────┐┌──────────────────────────────────────────┐┌──────────────────────┐ │
│ │ Edge ││ 左侧极简侧边  ││ 中间主区域 (Main Area)                   ││ 右侧图表侧边栏       │ │
│ │ 级可 ││ 栏 (Sidebar) ││ ┌──────────────────────────────────────┐ ││ (Right Sidebar)      │ │
│ │ 展开 ││              ││ │ File Tabs (tab1.ts | tab2.rs [x])  │ ││                      │ │
│ │ 垂直 ││ ┌──────────┐ ││ ├──────────────────────────────────────┤ ││ ┌──────────────────┐ │ │
│ │ 仓库 ││ │ 提交面板 │ ││ │                                      │ ││ │  简易 Commit     │ │ │
│ │ 栏   ││ └──────────┘ ││ │                                      │ ││ │  历史树 / 分支图 │ │ │
│ │      ││ ┌──────────┐ ││ │         Monaco Diff Editor           │ ││ └──────────────────┘ │ │
│ │      ││ │ 更改列表 │ ││ │                                      │ ││ ┌──────────────────┐ │ │
│ │      ││ └──────────┘ ││ │   (支持并排/内联堆叠自适应切换)      │ ││ │  提交统计图表    │ │ │
│ │      ││              ││ │                                      │ ││ └──────────────────┘ │ │
│ │      ││ ┌──────────┐ ││ └──────────────────────────────────────┘ ││                      │ │
│ │      ││ │⚙️ 设置入口│ ││                                          ││                      │ │
│ │      ││ └──────────┘ ││                                          ││                      │ │
│ └──────┘└──────────────┘└──────────────────────────────────────────┘└──────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. 最左侧 Edge 级可展开垂直仓库栏 (Edge-style Vertical Repo Bar)

借鉴 Microsoft Edge 浏览器的垂直标签页设计，完美平衡“空间占用”与“信息可读性”。为了实现**“悬停时悬浮不抖动，固定时挤压占位”**的丝滑效果，我们采用**双层容器 CSS 架构**：

```html
<!-- 布局结构示意 -->
<div
  class="repo-bar-container"
  :class="{ 'is-pinned': isPinned, 'is-hovered': isHovered }"
>
  <div class="repo-bar-content">
    <!-- 仓库列表、固定按钮、底部操作 -->
  </div>
</div>
```

#### 3.1.1. 核心 CSS 布局实现

- **外层占位容器 (`.repo-bar-container`)**：
  - **作用**：负责在 Flex 布局中进行物理占位。
  - **未固定状态 (`is-pinned = false`)**：宽度硬编码为 `64px`（`width: 64px; flex-shrink: 0; position: relative;`）。无论内部如何展开，它在页面上永远只占 `64px`，因此**绝对不会挤压或抖动右侧的侧边栏和 Diff 视图**。
  - **已固定状态 (`is-pinned = true`)**：宽度变为 `240px`（`width: 240px; transition: width 0.2s ease;`），此时会物理挤压右侧布局，将侧边栏向右推。
- **内层渲染主体 (`.repo-bar-content`)**：
  - **作用**：负责实际的视觉呈现与展开动画。
  - **定位属性**：采用绝对定位（`position: absolute; left: 0; top: 0; bottom: 0; z-index: 100;`），高度占满，宽度默认为 `64px`。
  - **悬停展开 (`is-hovered = true` 且 `is-pinned = false`)**：
    - 当鼠标悬停在外层容器上时，内层主体的宽度平滑过渡到 `240px`（`width: 240px; transition: width 0.2s ease;`）。
    - 配合 `box-shadow: var(--el-box-shadow-dark)` 和毛玻璃背景（`backdrop-filter: blur(var(--ui-blur))`），完美悬浮在右侧极简侧边栏上方，遮挡部分侧边栏内容，但**不触发任何重排（Reflow）**。
  - **固定状态 (`is-pinned = true`)**：
    - 内层主体宽度常驻 `240px`，阴影减弱或去除，与右侧侧边栏无缝拼接。

#### 3.1.2. 状态与交互细节

- **收起状态 (Collapsed - 默认)**：
  - 只显示仓库的圆形/方形图标（或首字母缩写），以及右上角的状态徽章。
  - **状态徽章 (Status Badge)**：
    - **红色徽章**：未提交的文件数（Staged + Unstaged）。
    - **蓝色徽章**：未推送的提交数 (Ahead)。
- **悬停展开状态 (Hover to Expand)**：
  - 展开后，每个仓库项显示：
    - 左侧：仓库图标与徽章。
    - 右侧：**仓库别名/名字（带长度限制，超出显示省略号）**，下方显示**当前分支名**（如 `main` 或 `feature/xxx`）。
- **固定模式 (Pin Mode)**：
  - 顶部提供一个“固定”针图标 📌。点击固定后，切换 `isPinned` 状态，触发外层容器占位加宽。
- **底部操作**：
  - 一键刷新所有仓库状态按钮 🔄。
  - 一键拉取/推送所有仓库按钮。

### 3.2. 极简侧边栏 (Sidebar - 宽度可拖拽调整)

- **宽度调整与拖拽手柄 (Resizer Handle)**：
  - 侧边栏与右侧主区域之间提供一条 `1px` 的分割线作为拖拽手柄。
  - **视觉表现**：平时为细线（`border-right: 1px solid var(--border-color)`），鼠标悬停（Hover）在左右 `4px` 范围内时，光标切换为 `col-resize`，手柄高亮为激活色（`var(--el-color-primary)`）并略微加宽。
  - **尺寸约束**：默认宽度 `260px`，最小限制 `200px`，最大限制 `480px`（或不超过视口宽度的 `40%`）。
  - **双击恢复**：双击手柄，宽度立即平滑恢复至默认的 `260px`。
  - **性能优化**：拖拽时在右侧主区域上方覆盖透明遮罩层（Drag Overlay），防止鼠标滑入 Monaco 导致事件丢失；拖拽过程中对 Monaco 的 `layout()` 进行节流，或仅在拖拽结束（`pointerup`）时触发一次性重绘。
- **顶部：当前仓库信息与操作**
  - 显示当前仓库名、当前分支名。
  - 快捷操作：拉取 (Pull)、推送 (Push)。
- **中部：AI 提交面板 (Commit Panel)**
  - **Commit 消息输入框**：支持 `Ctrl+Enter` 快捷提交。
  - **✨ AI 闪亮按钮**：紧贴在输入框上方。点击后，调用 LLM 提取当前暂存的 diff，自动生成 commit message 并填入输入框。
  - **【 提交 (Commit) 】大按钮**：支持下拉切换为“提交并推送 (Commit & Push)”。
- **下部：更改列表 (Changes List)**
  - **暂存的更改 (Staged Changes)** 折叠面板。
  - **更改 (Changes / Unstaged)** 折叠面板。
  - 文件项悬浮时显示 `+` (暂存) 或 `-` (取消暂存) 按钮。
  - 点击文件，在右侧主区域**打开或激活该文件的 Diff 标签页**。
- **底部：设置入口**
  - 一个精致的齿轮按钮 ⚙️，点击后右侧主区域切换为**设置面板**。

### 3.3. 中间主区域 (Main Area - 弹性宽度，占满其余空间)

- **文件标签栏 (File Tabs)**：
  - 类似 VSCode 的编辑器 Tab 栏，支持同时打开多个文件的 Diff。
  - 每个 Tab 显示：文件名、文件状态图标（M: Modified, A: Added, D: Deleted）、关闭按钮。
  - 支持右键菜单：“关闭其他”、“关闭全部”、“复制文件路径”。
- **Monaco Diff Editor**：
  - 展示当前激活 Tab 的文件 Diff。
  - 默认采用 **Side-by-Side (左右并排)** 模式。
  - **自适应切换**：当两侧边栏展开导致主区域宽度低于 `800px` 时，自动切换为 **Inline (内联/上下堆叠)** 模式。
- **默认状态（无打开的 Tab 时）**：
  - 显示优雅的空状态（如品牌 Logo、快捷键提示或“请选择文件查看 Diff”的引导页）。由于简易 Commit 历史树已移至右侧侧边栏，中间区域在无 Tab 时保持极简，避免视觉干扰。

### 3.4. 右侧图表侧边栏 (Right Chart Sidebar - 可展开收起、调宽度)

为了在不打断 Diff 审查工作流的前提下，提供直观的提交历史脉络与统计分析，我们引入右侧可折叠图表侧边栏。

- **宽度调整与拖拽手柄 (Resizer Handle)**：
  - 侧边栏与中间主区域之间提供一条 `1px` 的分割线作为拖拽手柄。
  - **视觉表现**：平时为细线（`border-left: 1px solid var(--border-color)`），鼠标悬停（Hover）在左右 `4px` 范围内时，光标切换为 `col-resize`，手柄高亮为激活色（`var(--el-color-primary)`）并略微加宽。
  - **尺寸约束**：默认宽度 `280px`，最小限制 `220px`，最大限制 `500px`（或不超过视口宽度的 `40%`）。
  - **双击恢复**：双击手柄，宽度立即平滑恢复至默认的 `280px`。
  - **性能优化**：拖拽时在中间主区域上方覆盖透明遮罩层（Drag Overlay），防止鼠标滑入 Monaco 导致事件丢失；拖拽过程中对 Monaco 的 `layout()` 进行节流，或仅在拖拽结束（`pointerup`）时触发一次性重绘。
- **一键折叠/展开 (Toggle Collapse)**：
  - 在 TitleBar 右侧或中间主区域 Tab 栏右侧提供一个 📊 (或 `LayoutSidebarRight` 图标) 切换按钮。
  - 点击可一键折叠/展开右侧侧边栏。折叠时，右侧栏宽度变为 `0`（`width: 0; overflow: hidden; border-left: none;`），中间主区域自动弹性拉伸占满剩余空间。
- **视图块内容 (View Blocks)**：
  - **简易 Commit 历史树 (Commit History Tree)**：
    - 位于右侧栏上半部分，展示当前分支的最近提交历史。
    - 节点连线清晰，支持点击历史 Commit 节点，在中间主区域以只读模式打开该 Commit 的 Diff 视图。
  - **提交统计图表 (Commit Statistics Charts)**：
    - 位于右侧栏下半部分，采用 ECharts 渲染。
    - **提交频次热力图/折线图**：展示最近 14 天的提交活跃度，帮助开发者直观感受开发节奏。
    - **修改文件类型分布图 (Pie Chart)**：展示当前仓库中各类文件（如 `.ts`, `.rs`, `.vue`, `.md`）的修改比例，直观呈现工作重心。

---

## 4. 🧠 状态持久化与上下文记忆 (Session Persistence)

为了保证在多个仓库之间频繁切换时，工作流不被打断，系统引入**多仓库上下文记忆机制**：

1.  **全局记忆 (Global Session)**：
    - 应用启动时，自动恢复到上次关闭前选中的仓库。
    - 记忆左右两侧边栏的宽度（`sidebarWidth`、`rightSidebarWidth`）以及右侧栏的展开状态（`isRightSidebarExpanded`）。
2.  **仓库独立记忆 (Per-Repo Session)**：
    - 每个仓库独立记录其**当前打开的 Diff Tabs 列表**以及**当前激活的 Tab**。切换仓库时，中间的 Tabs 自动恢复。
    - 每个仓库独立记录其输入框中的 **Commit Message 草稿**。即使切换到别的仓库，写到一半的 commit message 也不会丢失，切回来时依然在。
3.  **持久化存储**：
    - 上述状态实时保存到本地的 `appData` 配置文件中，确保应用重启后依然能完美恢复现场。

---

## 5. 后端 Rust 接口设计 (`git_committer.rs`)

基于 `git2-rs` 原生实现，避开命令行调用，保证极致性能。

### 5.1. 数据结构定义

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub status: String, // "Modified", "Added", "Deleted", "Untracked", etc.
}
```

### 5.2. 核心 Tauri 命令

1.  **`git_get_repo_status(path: String) -> Result<RepoStatus, String>`**
    - 使用 `repo.statuses(None)` 获取工作区和暂存区的文件状态。
    - 使用 `repo.head()` 获取当前分支名。
    - 使用 `repo.graph_ahead_behind()` 计算未推送 (Ahead) 和未拉取 (Behind) 的提交数。
2.  **`git_get_file_diff(path: String, file_path: String, is_staged: bool) -> Result<(String, String), String>`**
    - 获取单个文件的 Diff 原始与修改后文本，返回 `(original_content, modified_content)`。
    - 如果是 `is_staged = true`：对比 HEAD 提交中的文件内容与暂存区（Index）中的内容。
    - 如果是 `is_staged = false`：对比暂存区（Index）中的内容与工作区（Working Directory）中的实际文件内容。
3.  **`git_stage_files(path: String, files: Vec<String>) -> Result<(), String>`**
    - 将指定文件添加到暂存区（相当于 `git add`）。
4.  **`git_unstage_files(path: String, files: Vec<String>) -> Result<(), String>`**
    - 将指定文件移出暂存区（相当于 `git reset HEAD`）。
5.  **`git_commit(path: String, message: String) -> Result<(), String>`**
    - 提交暂存区的更改。
6.  **`git_push(path: String) -> Result<(), String>`**
    - 推送更改到远程仓库（回退到系统 `git push` 命令行执行，以处理凭据和网络代理）。
7.  **`git_pull(path: String) -> Result<(), String>`**
    - 从远程仓库拉取更改（回退到系统 `git pull` 命令行执行）。

---

## 6. 前端状态与逻辑设计 (Composables)

### 6.1. `useGitCommitterState.ts` (单例状态)

管理多仓库的全局状态与持久化：

```typescript
export interface RepositoryConfig {
  path: string;
  name: string;
  alias?: string;
}

export interface RepoSession {
  openTabs: { path: string; isStaged: boolean }[];
  activeTabPath: string;
  commitDraft: string;
}

export const repositories = ref<RepositoryConfig[]>([]);
export const currentRepoPath = ref<string>("");
export const sidebarWidth = ref<number>(260); // 侧边栏宽度记忆
export const repoStatuses = ref<Record<string, RepoStatus>>({});
export const repoSessions = ref<Record<string, RepoSession>>({}); // 仓库独立记忆
```

### 6.2. `useGitCommitterRunner.ts` (业务编排)

封装核心操作逻辑：

- `loadRepositories()`: 从本地配置加载仓库列表与 Session 记忆。
- `refreshAllStatuses()`: 并发刷新所有仓库的状态。
- `stageFile(filePath: string)` / `unstageFile(filePath: string)`: 暂存/取消暂存。
- `openDiffTab(filePath: string, isStaged: boolean)`: 打开或激活一个 Diff 标签页。
- `closeDiffTab(filePath: string)`: 关闭一个 Diff 标签页。
- `generateCommitMessage()`: 提取当前 Staged 文件的 diff，调用 LLM 生成提交信息。
- `executeCommit()`: 执行提交，并根据配置决定是否自动推送。

---

## 7. ⚙️ 独立设置页设计 (Settings Panel)

设置页作为独立视图，提供以下配置项：

1.  **仓库路径管理**：
    - 支持点击“添加仓库”选择本地文件夹。
    - 支持拖拽排序、设置仓库别名。
2.  **AI 偏好设置**：
    - 选择默认模型（`LlmModelSelector`）。
    - 自定义 System Prompt（教 AI 怎么写 commit message）。
    - 配置是否在生成时自动忽略某些文件。
3.  **工作流自动化**：
    - 开关：`Commit 后自动 Push`。
    - 开关：`切换仓库时自动 Pull`。
    - 开关：`无暂存文件时，AI 生成自动包含所有未暂存修改`。

---

## 8. 实施计划步骤

### 第一阶段：地基建设（Rust 后端）

- 新建 `src-tauri/src/commands/git_committer.rs`，实现多仓库状态获取、文件 diff 提取、Stage/Commit/Push 等核心 API。
- 在 `src-tauri/src/lib.rs` 中注册这些命令。

### 第二阶段：骨架搭建（前端基础）

- 新建 `src/tools/git-committer/` 目录。
- 创建 `git-committer.registry.ts` 注册工具。
- 创建 `useGitCommitterState.ts` 和 `useGitCommitterRunner.ts` 管理多仓库状态、Session 记忆和 Git 操作。

### 第三阶段：血肉填充（UI 界面与 AI 对接）

- 实现垂直仓库栏、极简侧边栏、多标签页 Diff 视图。
- 集成 `RichCodeEditor` 的 Diff 模式。
- 集成 `LlmModelSelector`，编写 AI Commit Message 生成的 Prompt 逻辑。

### 第四阶段：联调与抛光

- 测试多仓库并发施工时的刷新与切换性能。
- 优化 Session 记忆的持久化逻辑，确保无缝恢复现场。
