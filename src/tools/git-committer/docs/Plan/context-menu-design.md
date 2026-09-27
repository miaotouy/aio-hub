# Git 提交助手右键菜单设计

## 目标

为 git-committer 的四个核心交互区域补充统一的右键菜单，把散落在悬浮按钮与下拉菜单中的高频操作收敛到右键入口，减少鼠标移动距离：

1. **仓库列表**（RepoBar）
2. **文件标签页**（MainArea Tab 栏）
3. **更改列表**（Sidebar 文件列表 + ChangesDiffView 文件列表）
4. **提交历史**（RightSidebar 提交节点与提交内文件）

## 技术选型

项目内现有两种右键菜单模式：

- 模式 A：`el-dropdown trigger="contextmenu"`（SidebarMenu.vue 等，简单但样式与动态项受限）
- 模式 B：自建 Teleport 菜单 + 状态 composable（dir-search 的 `useContextMenu.ts` + `ContextMenu.vue`，支持视口校正、Escape 关闭、任意动态项）

本设计采用 **模式 B**，在 git-committer 工具内部复刻并增强（新增图标、danger 项、provide/inject 共享单例）。不引入全局组件，保持工具自包含，与 dir-search 的现有实现互不影响。

## 交互设计

### 1. 仓库列表（repo-item）

| 菜单项 | 说明 |
| --- | --- |
| 打开仓库 | 切换到该仓库（当前仓库时禁用） |
| 在资源管理器中显示 | `open_file_directory`（目录直接打开） |
| 刷新状态 | `refreshStatus(repo.path)` |
| 拉取 / 推送 | `pullRepo` / `pushRepo` |
| — | 分隔线 |
| 修改别名 / 修改颜色 / 设置 AI 提示词 | 与 RepoActionsMenu 一致 |
| — | 分隔线 |
| 移出列表 | danger，带确认（`useGitRepositoryManagement.remove`） |

`RepositoryPromptDialog` / `RepositoryColorDialog` 从 RepoActionsMenu 提升到 RepoBar 持有（单实例），RepoActionsMenu 改为只发 command 事件，与右键菜单共用同一处理函数。

### 2. 文件标签页（tab-item）

| 菜单项 | 适用 Tab | 说明 |
| --- | --- | --- |
| 关闭 | 全部 | 现有 `closeDiffTab` |
| 关闭其他标签页 | 全部 | 仅剩一个时禁用 |
| 关闭右侧标签页 | 全部 | 已是最右侧时禁用 |
| 关闭所有标签页 | 全部 | 无 Tab 时菜单不会弹出 |
| — | 分隔线 | |
| 复制完整路径 | 文件类 Tab | `joinRepoPath(repoPath, tab.path)` |
| 复制相对路径 | 文件类 Tab | `tab.path` 本身（git 返回相对仓库根路径） |
| 在资源管理器中显示 | 文件类 Tab | 使用完整路径；文件不存在时走错误提示 |
| 查看文件当前内容 / 查看差异 | 普通 diff/文件 Tab | 视图模式互切 |
| 暂存文件 / 取消暂存 | 普通 diff Tab | 按来源切换 |
| 复制提交哈希 | 提交类 Tab（含总览） | 复制完整 hash |

「关闭右侧」按 `openTabs` 数组顺序（即视觉顺序）判定。

### 3. 更改列表（Sidebar file-item 与 ChangesDiffView 文件行共用）

| 菜单项 | 暂存区 | 工作区 |
| --- | --- | --- |
| 打开差异 | ✓ | ✓ |
| 查看文件当前内容 | ✓（`D` 状态禁用） | ✓（`D` 状态禁用） |
| 复制完整路径 | ✓ | ✓ |
| 复制相对路径 | ✓ | ✓ |
| 在资源管理器中显示 | ✓（`D` 状态禁用） | ✓（`D` 状态禁用） |
| 暂存文件 | — | ✓ |
| 取消暂存 | ✓ | — |
| 放弃更改 | — | ✓（danger，带确认） |

路径说明：git 后端（`repository_relative_path`）返回的文件路径统一为相对仓库根、以 `/` 分隔的形式。「复制相对路径」直接使用该路径；「复制完整路径」与「在资源管理器中显示」通过 `joinRepoPath(repoPath, relativePath)` 拼接为绝对路径（分隔符跟随仓库根风格）。

### 4. 提交历史

**commit-node：**

| 菜单项 | 说明 |
| --- | --- |
| 打开更改总览 | `openCommitChangesTab` |
| 展开/收起变更文件 | label 随状态切换 |
| — | 分隔线 |
| 复制提交哈希 | 完整 hash |
| 复制提交信息 | 首行 message |
| 在远端打开 | `getRemoteInfo` 解析后 `open_url`；无已知远端时警告 |

**commit-file（展开后的文件行，事件 `stop` 阻止冒泡到 commit-node）：**

| 菜单项 | 说明 |
| --- | --- |
| 打开文件差异 | `openCommitFileDiffTab` |
| 复制完整路径 | `joinRepoPath` 拼接 |
| 复制相对路径 | — |

## 实现结构

### 新增

| 文件 | 职责 |
| --- | --- |
| `composables/useGitContextMenu.ts` | 菜单状态（visible/x/y/items/context）、`show/hide`、document click/Escape/contextmenu 关闭、`provideGitContextMenu` / `useGitContextMenu`（inject 不到时降级为本地实例） |
| `contextMenus.ts` | 纯函数菜单项构建器（按区域一个函数），产出 `GitContextMenuItem[]`；不含动作，动作由各组件按 `item.id` 分发 |
| `components/GitContextMenu.vue` | Teleport 到 body 的菜单渲染；图标（lucide 组件）、danger、disabled、分隔线、渲染后视口边界校正 |
| `__tests__/contextMenus.test.ts` | 构建器单测（项集合、禁用条件、staged/unstaged 分支） |

### 修改

| 文件 | 变更 |
| --- | --- |
| `utils.ts` | 新增 `copyTextToClipboard`（clipboard + customMessage 反馈）与 `joinRepoPath`（仓库相对路径 → 完整路径，分隔符跟随仓库根风格） |
| `useGitCommitterRunner.ts` | 新增 `closeOtherDiffTabs` / `closeDiffTabsToRight` / `closeAllDiffTabs`（激活 Tab 被关闭时回落到剩余第一个） |
| `GitCommitter.vue` | 创建菜单实例并 provide；挂载 `<GitContextMenu>` |
| `RepoBar.vue` | repo-item 绑定 `@contextmenu`；持有提升后的两个对话框与统一 command 处理 |
| `RepoActionsMenu.vue` | 精简为触发 `action` 事件，不再自带对话框 |
| `MainArea.vue` | tab-item 绑定 `@contextmenu.prevent.stop`，按 Tab 类型构建菜单 |
| `Sidebar.vue` | file-item 绑定 `@contextmenu.prevent.stop` |
| `ChangesDiffView.vue` | 文件行绑定 `@contextmenu.prevent.stop` |
| `RightSidebar.vue` | commit-node / commit-file 绑定右键 |

### 类型

```ts
export interface GitContextMenuItem {
  id: string;
  label: string;
  icon?: Component;      // lucide-vue-next 组件
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;   // 该项渲染为分隔线
}
```

菜单打开策略：`show()` 内 `preventDefault + stopPropagation`；document 上监听 `contextmenu`（右键其他区域时关闭旧菜单）、`click`（点击外部关闭）、`keydown Escape`。

## 验证

- `bun run check:frontend`（vue-tsc）
- `bun run test:run -- git-committer`（构建器单测）
- `bun run build:vite`
- 真实仓库手动验收：四个区域各菜单项的实际行为、`D` 状态文件的禁用、菜单视口边界、拖拽管理模式共存

## 非目标

- 键盘上下键导航与快捷键提示（后续增强）
- 子菜单（二级菜单）
- PanoramaDashboard 看板卡片的右键菜单（后续可复用构建器）
- 多选文件批量操作（现架构一次仅一个右键目标）
