# Git Committer (AI 提交助手) 架构体检与重构计划

## 1. 调查背景与体检结果

在对 `src/tools/git-committer` 模块进行全面体检后，发现了以下不同阶段施工堆叠导致的坏味道与严重 Bug：

### 1.1. 状态管理层 (`useGitCommitterState.ts`)

- **严重 Bug (数据丢失)**：设置项（如 `autoPushAfterCommitRef`、`autoPullOnSwitchRef`、`aiIncludeUnstagedRef`、`defaultModelRef`、`systemPromptRef`）在 `loadRepositories` 初始化函数中**完全漏掉了恢复读取**。这导致用户在设置面板修改了配置并保存后，每次重启应用，界面上的开关和模型选择都会重置为默认值。
- **堆叠坏味道**：设置项状态被作为“补丁”写在了文件尾部，与前半部分的核心状态割裂，且命名带了 `Ref` 后缀（如 `defaultModelRef`），而核心状态不带，导致组件调用时极其不一致。

### 1.2. 业务执行层 (`useGitCommitterRunner.ts`)

- **职责混乱**：在文件尾部重新 `export` 了 `State` 中的大量响应式变量，导致组件在引入状态时极其混乱（有的从 `State` 引入，有的从 `Runner` 引入，甚至在同一个组件里混用）。
- **代码重复 (Duplicated Code)**：`Runner` 中的 `buildDiffPrompt` 和 `PanoramaDashboard.vue` 中的 `buildDiffPromptForRepo` 逻辑有 90% 的重合度，都是在组装单仓库的 Diff 文本。

### 1.3. 视图与组件层

- **主入口 `GitCommitter.vue` 逻辑堆叠**：左右侧边栏的“鼠标拖拽调整宽度”逻辑直接平铺在主入口中，使骨架组件变得不够纯粹。
- **全景看板 `PanoramaDashboard.vue` 过于庞大 (862行)**：它绕过了 `Runner` 编排层，自己在组件内部直接调用 `sendRequest`（LLM 请求）和 `invoke`（Tauri 命令）来实现“一键暂存/生成/提交/推送”，导致全景看板组件极难维护。
- **右侧栏 `RightSidebar.vue` 职责不单一**：同时承担了“最近提交历史树”和“ECharts 提交频次图表”的渲染。图表的初始化、自适应、CSS 变量获取等逻辑让组件变得臃肿。
- **辅助函数重复声明**：`getFileName` 和 `getFileDir` 在 `Sidebar.vue` 和 `MainArea.vue` 中被重复复制粘贴定义。

---

## 2. 重构目标与要做什么

### 2.1. 状态层彻底重构 (`useGitCommitterState.ts`)

- 消除 `Ref` 后缀，将所有设置项并入核心状态流（如 `autoPushAfterCommit`、`autoPullOnSwitch`、`aiIncludeUnstaged`、`defaultModel`、`systemPrompt`）。
- 在 `loadRepositories` 中完整恢复所有设置项，确保持久化闭环。
- `Runner` 不再重新导出 `State` 的变量，组件严格按职责分工引入：状态找 `State`，方法找 `Runner`。

### 2.2. 业务逻辑下沉与去重 (`useGitCommitterRunner.ts`)

- 将单仓库的 Diff 文本组装逻辑统一凝聚到 `Runner` 的 `buildDiffPrompt(repoPath)` 中。
- 将全景看板中的“一键暂存所有”、“一键 AI 生成”、“一键提交所有”、“一键推送所有”等高阶编排逻辑下沉到 `Runner` 中，使 `PanoramaDashboard.vue` 瘦身。

### 2.3. 组件精细化拆分与优化

- **新增 `composables/useResizable.ts`**：将主入口中的侧边栏拖拽调整宽度逻辑封装为通用的 Composable。
- **新增 `components/CommitChart.vue`**：将 ECharts 相关的初始化、自适应、14天频次计算逻辑完整剥离到此组件中。
- **提取通用工具函数**：将 `getFileName`、`getFileDir`、`getFileLanguage` 等文件路径处理函数统一归拢，避免重复声明。
- **全景看板瘦身**：重构 `PanoramaDashboard.vue`，使其核心业务逻辑全部调用 `Runner` 提供的方法，组件自身只负责 UI 渲染。

---

## 3. 实施步骤

1.  **创建重构计划文档**（已完成）
2.  **重构状态管理层**：修改 `useGitCommitterState.ts`，统一命名，修复重启丢失数据的 Bug。
3.  **重构业务执行层**：修改 `useGitCommitterRunner.ts`，下沉单仓库 Diff 组装逻辑，下沉全景看板一键操作逻辑，移除重复导出。
4.  **创建拖拽 Composable**：新建 `composables/useResizable.ts`，并将拖拽逻辑从 `GitCommitter.vue` 移入。
5.  **创建图表组件**：新建 `components/CommitChart.vue`，将 ECharts 逻辑从 `RightSidebar.vue` 移入。
6.  **重构主入口与子组件**：
    - 重构 `GitCommitter.vue`，使用新 Composable。
    - 重构 `RightSidebar.vue`，引入 `CommitChart.vue`。
    - 重构 `PanoramaDashboard.vue`，调用 `Runner` 的下沉方法。
    - 重构 `Sidebar.vue`、`MainArea.vue`、`SettingsPanel.vue`，适配新的状态命名和导入路径。
7.  **运行项目检查**：执行 `bun run check:frontend` 确保类型和编译无误。
