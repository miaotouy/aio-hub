# 画布 (Canvas) 模块实施计划 (影子文件预览方案)

## 1. 概述

画布模块旨在为 Agent 提供一个独立于聊天流的、持久化的多文件协作空间。通过**“内存预览 + 异步持久化”**方案，确保 Agent 的修改可以被即时预览、人工审核，并最终安全地存储在物理文件系统中。

## 2. 存储与预览架构 (Hybrid Storage & Preview)

### 2.1 核心理念：双重缓存影子文件系统 (Dual-Cache Shadow FS)

为了提高预览性能并确保数据安全，Canvas 采用主从分布式的双重缓存结构：

1.  **主级缓存 (Hub Layer)**：主窗口的 `CanvasStore` 始终维护一份 `pendingUpdates` (内存影子文件)。
    - **作用**：作为权威源。即便画布窗口未打开或卡死，数据依然安全，主窗口可随时执行物理落盘。
2.  **次级缓存 (Stage Layer)**：画布窗口在打开后，从主窗口同步并维护本地副本。
    - **作用**：实现**画布自治预览**。所有渲染逻辑均在画布窗口本地内存完成，避免了大文件在窗口间的全量同步压力。

### 2.2 目录结构与 Git 初始化

所有画布项目持久化存储在用户数据目录下的 `canvases/` 文件夹中：

```
{appDataDir}/canvases/
├── {canvasId}/
│   ├── .canvas.json        # 画布元数据 (标题、最后打开文件、窗口配置)
│   ├── .git/               # 内置 Git 仓 (创建即初始化)
│   ├── index.html          # 项目入口
│   ├── style.css
│   ├── script.js
│   └── ...                 # 其他项目文件
```

- **创建即初始化**：在新建画布时，主窗口立即执行 `git init`。
- **外部协作**：标准的 `.git` 目录让 VSCode 等外部工具能立刻识别并提供版本控制。

### 2.3 文件操作流 (The "Commit" Flow)

1.  **指令下发 (Preview)**：Agent 调用 `update_file` -> 主窗口拦截并更新 `pendingUpdates` -> 通过同步总线通知画布窗口。
2.  **自治渲染 (Zero-Click)**：画布窗口在本地内存层合并更新，并自动刷新预览（优先读取内存影子文件，缺失时回退到物理层）。
3.  **人工审核 (Pending)**：用户在聊天界面看到"待定更改"提示，可直接在 Canvas 窗口查看效果，然后选择：
    - **确认 (Commit)**：主窗口从自己的 `pendingUpdates` 读数据 -> 执行物理写入并完成 `git add/commit` -> 清空内存缓存。
    - **拒绝 (Discard)**：清空内存缓存，预览窗口回退到物理文件版本。
4.  **外部变更**：由主窗口的 Tauri FS Watcher 触发，同步到内存层并通知预览。

### 2.4 增量更新策略 (Cline-Style Diff)

- **上策 (Search/Replace)**：通过提供 `apply_canvas_diff` 工具，采用 Cline 风格的 Search/Replace 块匹配模式。由 Agent 输出局部修改块，在内存层进行精准合并。
- **行号增强**：在 `read_canvas_file` 时提供带行号的内容，帮助 Agent 构造极其精确的匹配块，减少因缩进或空行导致的匹配失败。
- **下策 (Sync Engine)**：底层的 `useStateSyncEngine` 仅用于同步元数据，不再背负同步整个大文件的压力。

### 2.5 版本控制 (Internal Version Control)

为了在不依赖系统 Git 环境的前提下提供专业级版本管理，Canvas 引入内置 Git 引擎：

- **引擎**：使用 `isomorphic-git` (纯 JS 实现)。
- **存储格式**：标准的 `.git` 文件夹，确保跨工具兼容性（VSCode 可直接识别）。
- **协同分析**：由于采用标准 Git 格式，该画布项目可被 **Git Analyzer** 模块直接加载，进行深度的代码演进统计和可视化。

## 3. 后端实现 (Rust/Tauri)

经调查，后端基础设施已 P0 级完备，画布模块将**全量复用**现有指令，无需新增 Rust 代码。

### 3.1 窗口管理复用

复用 `window_manager.rs` 中的统一分离系统：

- **指令**：`create_tool_window`
- **配置**：通过 `DetachableConfig` 传递窗口尺寸、标题和路由。
- **路由约定**：使用 `/detached-component/canvas?id={canvasId}`，由前端路由负责解析 ID 并加载对应数据。
- **窗口类型**：Canvas 独立窗口为 **`detached-component`** 类型（纯展示的"舞台"），**不是** `detached-tool`。这意味着：
  - 它只接收状态，不推送状态（`autoPush: false`）
  - 所有操作代理回主窗口（通过 `bus.requestAction('canvas:xxx', params)`）
  - 系统内置的 5 秒启动保护期和重连防抖自动生效，无需额外处理
- **视觉**：自动继承系统的透明度、毛玻璃 (`ui-blur`) 和无边框样式。

### 3.2 文件系统指令复用

复用 `file_operations.rs` 和 `directory_tree.rs` 中的强力指令：

- **写入**：`write_text_file_force(path, content)`
  - 优势：自动创建父目录，直接传输字符串（避免二进制序列化开销）。
- **读取**：`read_text_file_force(path)`
- **快照**：`generate_directory_tree(path, ...)`
  - 优势：高性能并行扫描，支持获取完整递归结构和文件大小，直接用于 LLM 上下文注入。
- **清理**：`delete_directory_in_app_data(relative_path)`
  - 优势：安全移入系统回收站。

### 3.3 资源加载协议

- **协议**：复用内置 `asset` 协议。
- **权限**：`tauri.conf.json` 已配置 `assetProtocol.scope` 包含 `$APPLOCALDATA/**`。
- **实现**：前端使用 `convertFileSrc(physicalPath)` 即可在预览器中引用画布项目内的图片、字体等资源。

## 4. 前端架构 (Frontend)

### 4.1 注册与管理 (Tool Registration)

画布模块将遵循项目的标准工具注册规范：

- **`canvas.registry.ts`**：
  - 定义 `ToolConfig`，包含图标 (`LayoutTemplate` 或 `Brush`)、名称 ("画布")。
  - 注册主视图路由 `/canvas-manager`。
  - 导出 `CanvasRegistry` 类，对接 `tool-calling` 系统。
- **工作台界面 (`CanvasWorkbench.vue`)**：
  - **采用“主控制台”架构**：顶层提供持久化的 `WorkbenchHeader`，支持多项目标签页切换。
  - **WorkbenchHeader**：
    - **主页按钮**：固定在最左侧，点击回到项目大厅（卡片列表）。
    - **项目标签页**：显示当前已打开编辑的画布项目，支持点击切换、关闭，并显示“未提交更改”的小圆点提示。
    - **全局操作**：新建项目按钮、独立预览窗口全局开关、一键 Commit/Discard 所有项目更改。
  - **主页视图 (`CanvasProjectList.vue`)**：
    - 以卡片或列表形式展示所有物理存储的画布项目。
    - **预览图**：(可选) 展示画布最后一次运行的截图。
    - **操作栏**：导入/导出项目、批量删除。
  - **编辑视图 (`CanvasEditorPanel.vue`)**：
    - 当从主页选中某个项目后，在当前 Tab 下加载。
    - **左侧文件树**：展示当前项目的文件结构，支持双击打开文件。
    - **中心编辑区**：基于 `RichCodeEditor`，支持多文件 Tab 切换。
    - **底部面板**：集成 Diff 审核视图、控制台日志、Git 版本历史。

### 4.2 CanvasRegistry (工具调用接口 - 手术刀模式)

注册为标准的 `ToolRegistry`，遵循项目的 **VCP (Variable & Command Protocol)** 协议规范。Agent 通过以下指令操作影子文件系统：

- **`create_canvas(title)`**: 初始化新画布。
- **`read_canvas_file(path)`**: 读取文件内容（**带行号**）。优先从 `pendingUpdates` 读取。
- **`apply_canvas_diff(path, diff)`**: 使用 Search/Replace 块模式修改影子文件。**自动记录到 Undo 栈**。
- **`write_canvas_file(path, content)`**: 全量覆盖影子文件内容。
- **`undo_canvas_diff()`**: 撤回上一次内存修改。
- **`commit_changes()`**: 执行物理落盘并完成 Git Commit。
- **`discard_changes()`**: 丢弃缓冲区内容，清空 Undo 栈。
- **`list_canvas_files()`**: 获取文件树。

#### VCP 调用示例 (以 `apply_canvas_diff` 为例)：

LLM 将使用 VCP 协议的书名号标记格式发送请求：

```text
<<<[TOOL_REQUEST]>>>
tool_name:「始」canvas「末」,
command:「始」apply_canvas_diff「末」,
path:「始」src/App.vue「末」,
diff:「始」
[Search/Replace 块内容]
「末」
<<<[END_TOOL_REQUEST]>>>
```

> **注意**：VCP 协议使用 `「始」` 和 `「末」` 标记包裹参数值，这天然支持 `diff` 内容中的多行文本和特殊字符，无需额外的转义处理。

### 4.2 CanvasWindow (独立窗口 UI - "舞台模式")

CanvasWindow 采用“极致纯净”设计，旨在作为一个独立的展示/运行环境：

- **UI 交互与控制**：
  - **无边框设计**：默认隐藏标题栏，支持通过 `useDetachable` 的无边框窗口配置。
  - **全屏/桌面化**：支持无边框最大化，可作为桌面背景或全屏应用使用。
  - **悬浮控制条 (Floating Controller)**：鼠标悬停在窗口顶部边缘时，平滑滑出一个半透明毛玻璃控制条，作为全局操作中心。包含：窗口控制、置顶切换、**侧边栏开关、状态栏开关**以及“管理面板”入口。
  - **显式 UI 开关 (Manual Toggle)**：文件树侧边栏和底部状态栏默认**隐藏**，且**不使用**自动滑出逻辑，以避免干扰页面交互。用户必须通过控制条、右键菜单或快捷键显式开启。
  - **右键上下文菜单**：提供“显示/隐藏文件树”、“显示/隐藏状态栏”、“在 VSCode 中打开”、“刷新预览”、“复制项目路径”、“切换渲染引擎”等操作。
  - **全局快捷键**：`F5` (刷新), `Ctrl+B` (切换管理面板), `Alt+Enter` (全屏/窗口模式切换)。
- **技术实现**：基于 `HtmlInteractiveViewer` 的 VFS 升级版，直接加载本地物理路径资源（通过 Tauri `convertFileSrc`）。

### 4.3 CanvasSidebar (管理侧边栏/独立面板)

文件管理和项目配置功能从 CanvasWindow 中剥离，承载于：

- **主窗口视图**：在主程序的 Canvas 模块中提供完整的文件树、控制台和日志。
- **VSCode 桥接**：提供“Bridge to VSCode”功能，一键调用 `code {path}` 打开对应目录。
- **独立控制台**：(可选) 允许将文件树和日志作为另一个独立的小窗口弹出。

### 4.4 CanvasStore (Pinia) & 跨窗口同步

Canvas 采用 **"主控端 (Main) + 舞台端 (Detached)"** 的多窗口协同架构。基于最近对 `useStateSyncEngine`、`useWindowSyncBus` 和 LLM Chat 同步层的重构经验，Canvas 的同步设计分为**三层**。

#### 4.4.1 核心状态 (`CanvasState`)

```typescript
interface CanvasState {
  activeCanvasId: string | null; // 当前操作的画布 ID
  pendingUpdates: Record<string, string>; // filePath → content 影子文件
  undoStack: PendingSnapshot[]; // 影子文件快照历史
  projectMetadata: CanvasMetadata; // 画布元数据
  previewConfig: PreviewConfig; // 预览配置
}
```

#### 4.4.2 三层同步架构

Canvas 的跨窗口同步分为三个层次，各有明确职责：

**Layer 1：元数据同步（`useStateSyncEngine`）**

使用标准的 `useStateSyncEngine` 同步轻量级元数据，自动 diff/patch，低频更新：

```typescript
// 在 useCanvasSync.ts 中
const createStateEngine = (stateSource, stateKey) => {
  return useStateSyncEngine(stateSource, {
    stateKey,
    autoPush: true, // 主窗口自动推送
    autoReceive: true, // 画布窗口自动接收
    enableDelta: true,
    debounce: 100,
  });
};

// 同步的状态键
createStateEngine(activeCanvasId, "canvas-active-id");
createStateEngine(projectMetadata, "canvas-metadata");
createStateEngine(previewConfig, "canvas-preview-config");
```

> **参照**：`useLlmChatSync.ts` 中对 `chat-current-session-id`、`chat-settings` 等轻量状态的同步方式。

**Layer 2：影子文件同步（`registerSyncSource` + 自定义逻辑）**

影子文件 (`pendingUpdates`) 的体积可能较大，不适合走标准 StateSyncEngine 的 diff 计算。采用 `registerSyncSource()` 注册到全局同步注册中心，实现：

- **初始连接**：当画布窗口通过 `bus.requestInitialState()` 请求初始状态时，系统自动调用 `getStatePayload()` 将影子文件打包进批量同步包（`syncStateBatch`）
- **增量推送**：文件变更时通过 `bus.syncState('canvas:file-update', ...)` 单独推送

```typescript
// 在 useCanvasSync.ts 中（主窗口端）
registerSyncSource({
  stateKey: "canvas-pending-updates",
  getStatePayload: async (isFullSync) => ({
    stateType: "canvas-pending-updates",
    version: VersionGenerator.next(),
    isFull: true,
    data: canvasStore.pendingUpdates,
  }),
  pushState: async (isFullSync, targetWindowLabel, silent) => {
    await bus.syncState(
      "canvas-pending-updates",
      canvasStore.pendingUpdates,
      VersionGenerator.next(),
      true,
      targetWindowLabel,
    );
  },
});
```

> **参照**：`ChatInputManager` 和 `MediaGenInputManager` 中使用 `registerSyncSource` 的模式。

**Layer 3：预览增量通道（直接 `bus.syncState`）**

当 Agent 调用 `apply_canvas_diff` 或 `write_canvas_file` 修改影子文件时，通过**独立于 StateSyncEngine 的轻量级通道**将增量推送到画布窗口，实现实时预览：

```typescript
// 发送端（主窗口，Agent 修改文件后）
bus.syncState(
  "canvas:file-delta" as any,
  {
    canvasId: activeCanvasId,
    filePath: "index.html",
    content: newContent, // 该文件的完整新内容
    changeType: "diff" | "full",
  },
  0,
  false,
);

// 接收端（画布窗口）
bus.onMessage("state-sync", (payload) => {
  if (payload.stateType === "canvas:file-delta") {
    const { filePath, content } = payload.data;
    // 更新本地影子文件副本
    localPendingUpdates[filePath] = content;
    // 触发预览刷新
    refreshPreview();
  }
});
```

> **参照**：`useChatResponseHandler.ts` 中 `chat:streaming-delta` 流式增量通道的设计。绕过 StateSyncEngine 的版本号和 diff 计算，用最低开销实现高频更新。

#### 4.4.3 操作代理（Action Proxy）

画布窗口作为 `detached-component`，所有写操作都代理回主窗口。主窗口注册 `canvas` 命名空间的 Action 处理器：

```typescript
// 主窗口注册（在 useCanvasSync.ts 中）
bus.onActionRequest("canvas", async (action, params) => {
  switch (action) {
    case "commit-changes":
      return canvasStore.commitChanges();
    case "discard-changes":
      return canvasStore.discardChanges();
    case "apply-diff":
      return canvasStore.applyDiff(params.path, params.diff);
    case "write-file":
      return canvasStore.writeFile(params.path, params.content);
    case "undo-diff":
      return canvasStore.undoDiff();
    case "refresh-preview":
      // 通知画布窗口强制刷新
      await bus.syncState("canvas:file-delta" as any, { action: "force-refresh" }, 0, false);
      return;
    default:
      throw new Error(`Unknown canvas action: ${action}`);
  }
});

// 画布窗口调用
await bus.requestAction("canvas:commit-changes", {});
await bus.requestAction("canvas:apply-diff", { path, diff });
```

> **参照**：`useLlmChatSync.ts` 中 `bus.onActionRequest('llm-chat', handleActionRequest)` 的 20+ 种操作代理模式。

#### 4.4.4 动态同步频率

当 Agent 批量修改文件时（如连续多次 `apply_canvas_diff`），动态调整同步频率以避免性能问题：

```typescript
// 检测到 Agent 开始批量修改
if (isBatchEditing) {
  metadataEngine.setDebounce(2000); // 降低元数据同步频率
}

// 批量修改结束
metadataEngine.setDebounce(100); // 恢复正常频率
metadataEngine.manualPush(true); // 全量兜底广播
```

> **参照**：`useLlmChatSync.ts` 中监听 `isSending` 动态调整 `sessionDataEngine.setDebounce()` 的模式。

#### 4.4.5 初始同步流程

画布窗口启动时的同步流程完全由系统基础设施自动处理：

1. 画布窗口初始化 → `initializeSyncBus()` → 自动发送握手
2. 画布窗口调用 `bus.requestInitialState()` → 广播请求
3. 主窗口的 `StateSyncEngine` 全局注册中心自动收集所有注册源的状态 → 通过 `syncStateBatch()` 批量推送
4. 画布窗口接收批量包，各 `useStateSyncEngine` 实例自动匹配并应用对应状态
5. 系统内置 5 秒启动保护期，避免焦点切换导致的同步风暴

> **注意**：无需手动实现初始同步逻辑。只需确保 Layer 1 的引擎使用 `autoReceive: true`，Layer 2 的 `registerSyncSource` 正确注册即可。

### 4.5 UI 组件体系 (Component Architecture)

Canvas 的 UI 分为三个场景：**主窗口管理界面**、**独立窗口（舞台）**、**共享组件**。以下是完整的组件树和职责定义。

#### 4.5.1 目录结构

```
src/tools/canvas/
├── canvas.registry.ts              # 工具注册入口
├── CanvasWorkbench.vue             # 主窗口工作台（顶层路由组件）
├── types/
│   ├── index.ts                    # 核心类型定义
│   └── canvas-metadata.ts          # 画布元数据类型
├── stores/
│   └── canvasStore.ts              # Pinia Store
├── composables/
│   ├── useCanvasStorage.ts         # 物理路径与文件 IO
│   ├── useCanvasSync.ts            # 主窗口端同步层
│   ├── useCanvasStateConsumer.ts   # 画布窗口端同步消费者
│   ├── useCanvasPreview.ts         # 预览引擎（VFS 合并 + iframe 控制）
│   ├── useCanvasFileTree.ts        # 文件树状态管理
│   ├── useCanvasConsole.ts         # 控制台日志收集
│   └── useCanvasKeyboard.ts        # 全局快捷键绑定
├── services/
│   └── GitInternalService.ts       # isomorphic-git 封装
├── components/
│   ├── workbench/                  # === 主窗口工作台组件 ===
│   │   ├── WorkbenchHeader.vue     # 持久化导航头部（主页+项目Tab）
│   │   ├── WorkbenchFooter.vue     # 全局状态栏
│   │   ├── CanvasProjectList.vue   # 项目大厅（卡片/列表双视图）
│   │   ├── CanvasProjectCard.vue   # 单个项目卡片
│   │   ├── CreateCanvasDialog.vue  # 新建画布对话框
│   │   └── CanvasEditorPanel.vue   # 编辑视图容器
│   ├── window/                     # === 独立窗口（舞台）组件 ===
│   │   ├── CanvasWindow.vue        # 舞台顶层容器
│   │   ├── CanvasPreviewPane.vue   # 预览区域（VFS-aware iframe）
│   │   ├── CanvasFloatingBar.vue   # 悬浮控制条
│   │   ├── CanvasStatusBar.vue     # 底部状态栏
│   │   └── CanvasContextMenu.vue   # 右键上下文菜单
│   ├── sidebar/                    # === 侧边栏组件 ===
│   │   ├── CanvasSidePanel.vue     # 侧边栏容器（可折叠）
│   │   ├── CanvasFileTree.vue      # 文件树组件
│   │   ├── CanvasFileTreeItem.vue  # 文件树节点
│   │   └── CanvasConsolePanel.vue  # 控制台/日志面板
│   └── shared/                     # === 跨场景共享组件 ===
│       ├── PendingChangesBar.vue   # 待定更改操作栏（Commit/Discard）
│       ├── CanvasVersionHistory.vue # 版本历史面板（Git log 可视化）
│       └── CanvasFileIcon.vue      # 画布文件图标（复用 FileIcon）
└── doc/
    └── Plan/
        └── canvas-implementation-plan.md
```

#### 4.5.2 主窗口管理界面 (`CanvasManager.vue`)

管理界面是用户在主程序侧边栏点击"画布"后看到的页面，负责画布项目的 CRUD 和全局状态展示。

```
┌─────────────────────────────────────────────────────┐
│  CanvasManagerToolbar                               │
│  [+ 新建] [导入] [搜索...]          [列表/卡片切换] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CanvasProjectList                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Project  │ │ Project  │ │ Project  │            │
│  │ Card     │ │ Card     │ │ Card     │            │
│  │          │ │ 🟢打开中  │ │ 🟡有更改  │            │
│  │ [打开]   │ │ [聚焦]   │ │ [打开]   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                     │
│  ┌──────────┐ ┌──────────┐                          │
│  │ Project  │ │ + 新建   │                          │
│  │ Card     │ │ 画布     │                          │
│  └──────────┘ └──────────┘                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**组件职责**：

- **`CanvasManager.vue`**：顶层路由组件，组合工具栏和项目列表，管理视图模式状态。
- **`CanvasManagerToolbar.vue`**：顶部操作栏。包含新建按钮、导入按钮、搜索框、视图切换（卡片/列表）。
- **`CanvasProjectList.vue`**：项目列表容器，支持卡片网格和紧凑列表两种布局。接收过滤/排序后的画布列表，渲染 `CanvasProjectCard`。空状态显示引导提示。
- **`CanvasProjectCard.vue`**：单个项目卡片。展示：缩略图（可选）、标题、最后修改时间、文件数量、状态徽章。操作：打开独立窗口、在 VSCode 中打开、删除、在 Git Analyzer 中分析。
- **`CreateCanvasDialog.vue`**：新建画布对话框（基于 `BaseDialog`）。输入项目标题，选择模板（空白 / HTML 基础 / Vue SFC / React），确认后调用 Store 创建。
- **`CanvasStatusBadge.vue`**：状态指示组件。状态枚举：`idle`（未打开）、`open`（独立窗口已打开）、`pending`（有未提交更改）、`syncing`（同步中）。

#### 4.5.3 独立窗口 — 舞台模式 (`CanvasWindow.vue`)

CanvasWindow 是画布的核心展示/运行环境，以**极致纯净**为设计目标。默认全屏预览，所有控制元素均为悬浮/触发式，不占用永久空间。

```
┌─────────────────────────────────────────────────────┐
│ (悬浮控制条 - 鼠标悬停顶部时滑出)                    │
│  CanvasFloatingBar                                  │
│  [标题] [刷新] [切换引擎] [VSCode] [置顶] [—][□][×] │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│              CanvasPreviewPane                      │
│           (iframe 全屏预览区域)                      │
│                                                     │
│                                                     │
│  ┌─────────┐                                        │
│  │[文件][Git][控制台]  ← 顶部水平 Tab 切换           │
│  │ Side    │ (显式开关 - 默认隐藏)                   │
│  │ Panel   │                                        │
│  │ (当前面板内容)                                    │
│  │  文件树 / Git 状态 / 控制台日志                   │
│  └─────────┘                                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│ CanvasStatusBar (底部状态栏 - 显式开关 - 默认隐藏)    │
│ [index.html] [3 files] [● 2 pending] [Git: clean]  │
└─────────────────────────────────────────────────────┘
```

**组件职责**：

- **`CanvasWindow.vue`**：舞台顶层容器。职责：
  - 组合所有子组件（预览、控制条、侧边栏、状态栏、右键菜单）
  - 管理 UI 组件的显隐持久化状态（`showSidebar`, `showStatusBar`）
  - 注册全局快捷键（通过 `useCanvasKeyboard`）
  - 分离模式下的壁纸层和 resize 手柄（参照 `ChatArea.vue` 的模式）
  - 通过 `useCanvasStateConsumer` 接收同步数据

- **`CanvasPreviewPane.vue`**：VFS-aware 的 iframe 预览器。核心升级点（相对于 `HtmlInteractiveViewer`）：
  - **VFS 合并渲染**：不直接使用 `srcdoc`，而是通过 `convertFileSrc` 加载物理文件，同时将影子文件（`pendingUpdates`）通过 Service Worker 或 iframe 内注入的方式覆盖。
  - **多文件项目支持**：处理 `<link>`, `<script src>`, `<img src>` 等相对路径引用，自动解析到画布项目目录。
  - **热重载**：监听影子文件变更，自动刷新 iframe（可配置为全量刷新或 CSS-only 热替换）。
  - **错误捕获**：复用 `HtmlInteractiveViewer` 的 `logCaptureScript`，将 iframe 内的 console/error 转发到控制台面板。
  - **CSP 策略**：在 Canvas 场景下放宽 CSP，允许 `asset:` 协议和本地资源加载。
  - **渲染引擎切换**：支持 `srcdoc`（内联模式）和 `src`（物理路径模式）两种引擎，用户可在控制条中切换。

- **`CanvasFloatingBar.vue`**：悬浮控制条。交互设计：
  - **触发方式**：鼠标进入窗口顶部 40px 热区时，以 `transform: translateY` 动画从上方滑出。
  - **自动隐藏**：鼠标离开控制条区域 1.5 秒后自动滑回。
  - **视觉**：半透明毛玻璃背景（`backdrop-filter: blur(var(--ui-blur))`），圆角胶囊形。
  - **按钮组**：
    - 左侧：画布标题（可编辑）、当前文件名
    - 中间：刷新预览、**[文件树开关]、[状态栏开关]**、切换渲染引擎
    - 右侧：在 VSCode 中打开、置顶切换、最小化、最大化/还原、关闭
  - **拖拽**：整个控制条区域支持 `data-tauri-drag-region` 拖拽窗口。

- **`CanvasStatusBar.vue`**：底部状态栏。单行极简设计：
  - 左侧：当前活跃文件名、项目文件总数
  - 中间：待定更改数量（点击展开 `PendingChangesBar`）
  - 右侧：Git 状态（clean/dirty）、渲染引擎标识
  - 高度固定 28px，背景使用 `var(--card-bg)` 半透明。

- **`CanvasContextMenu.vue`**：右键上下文菜单（使用 Teleport 到 body）。菜单项：
  - 刷新预览 (`F5`)
  - 在浏览器中打开
  - 在 VSCode 中打开 (`Ctrl+Shift+E`)
  - 切换管理面板 (`Ctrl+B`)
  - 复制项目路径
  - 切换渲染引擎
  - 全屏/窗口模式 (`Alt+Enter`)

#### 4.5.4 侧边栏组件 (`CanvasSidePanel`)

侧边栏承载文件管理和调试信息，可在独立窗口中通过边缘触发展开，也可在主窗口中作为常驻面板。

- **`CanvasSidePanel.vue`**：侧边栏容器。
  - **触发方式**（独立窗口）：通过 `CanvasFloatingBar` 开关或快捷键显式切换。展开时可选择"叠加（Overlay）"或"挤压（Push）"布局，宽度 280px。
  - **常驻模式**（主窗口）：作为 `CanvasManager` 的右侧面板，始终可见。
  - **选项卡设计**：在侧边栏**顶部**使用一行小型水平 Tab 切换（文件树 / Git / 控制台），**不采用** VSCode 式的左侧竖排图标栏。理由：主程序本身已有左侧竖排工具切换侧边栏，Canvas 内部不需要再嵌套一层竖排图标；且 Canvas 侧边栏的面板数量有限（3~4 个），水平 Tab 完全够用，视觉更简洁。
  - **Tab 样式**：紧凑的图标+文字组合（如 `📁 文件` / `🔀 Git` / `📋 控制台` 此处为示例，实施应使用项目规范的图标库），选中态使用底部高亮条，未选中态为半透明文字。Tab 栏高度约 32px，不占用过多纵向空间。
  - **视觉**：半透明毛玻璃背景，与主预览区域通过 1px 分隔线区分。

- **`CanvasFileTree.vue`**：文件树组件。
  - **数据源**：合并物理文件树（来自 `generate_directory_tree`）和影子文件（`pendingUpdates` 中的新文件）。
  - **节点渲染**：使用 `CanvasFileTreeItem` 递归渲染，每个节点显示文件图标（复用 `FileIcon`）、文件名、修改状态标记。
  - **状态标记**：
    - 🟢 `modified` — 影子文件中有更改（绿色圆点）
    - 🟡 `new` — 仅存在于影子文件中的新文件（黄色加号）
    - ⚪ `clean` — 与物理文件一致（无标记）
  - **交互**：
    - 单击文件：在预览中高亮/跳转到该文件（如果是入口文件则刷新预览）
    - 双击文件：（如果集成了编辑器）在编辑器中打开
    - 右键文件：复制路径、在 VSCode 中打开、删除
  - **过滤**：默认隐藏 `.git/` 和 `.canvas.json`，可通过设置显示。

- **`CanvasFileTreeItem.vue`**：文件树节点组件。
  - 展示：缩进层级、展开/折叠箭头（目录）、文件图标、文件名、状态标记。
  - 支持拖拽排序（未来扩展）。

- **`CanvasConsolePanel.vue`**：控制台/日志面板。
  - **数据源**：通过 `useCanvasConsole` 收集 iframe 内转发的 `console.log/warn/error` 和运行时错误。
  - **展示**：类似浏览器 DevTools 的控制台，支持 log/warn/error 级别过滤、时间戳、可折叠的对象展示。
  - **操作**：清空日志、复制全部、过滤级别切换。
  - **视觉**：暗色背景（`var(--vscode-editor-background)`），等宽字体。

#### 4.5.5 共享组件

- **`PendingChangesBar.vue`**：待定更改操作栏。
  - **触发位置**：在 CanvasWindow 的状态栏上方弹出，或在 CanvasManager 的项目详情中显示。
  - **展示**：列出所有有更改的文件名和变更类型（modified/new/deleted）。
  - **操作**：
    - **Commit All**：提交所有更改（调用 `canvas:commit-changes` Action）
    - **Discard All**：丢弃所有更改（调用 `canvas:discard-changes` Action，需二次确认）
    - **单文件操作**：对单个文件进行 Commit 或 Discard
  - **视觉**：类似 VSCode 的 Source Control 面板，紧凑的文件列表 + 操作按钮。

- **`CanvasVersionHistory.vue`**：版本历史面板。
  - **数据源**：通过 `GitInternalService` 读取 Git log。
  - **展示**：时间线形式，每个节点显示 commit hash（短）、commit message、时间。
  - **操作**：
    - 查看某次提交的 diff
    - 回滚到某个版本（`git checkout`）
    - 在 Git Analyzer 中打开（跳转到 Git Analyzer 工具）

- **`CanvasFileIcon.vue`**：画布文件图标。轻量封装，直接复用项目中的 `FileIcon` 组件，传入文件名即可自动匹配图标。

#### 4.5.6 交互状态机

**悬浮控制条 (`CanvasFloatingBar`) 状态机**：

```
                    ┌─────────────┐
                    │   hidden    │ (默认状态)
                    └──────┬──────┘
                           │ mouseenter 顶部热区
                           ▼
                    ┌─────────────┐
           ┌───────│  revealing  │ (200ms 动画滑出)
           │       └──────┬──────┘
           │              │ 动画完成
           │              ▼
           │       ┌─────────────┐
           │       │   visible   │ (完全可见)
           │       └──────┬──────┘
           │              │ mouseleave 控制条区域
           │              ▼
           │       ┌─────────────┐
           │       │   waiting   │ (等待 1.5s)
           │       └──────┬──────┘
           │              │ 1.5s 超时 / mouseenter 取消等待
           │              ▼
           │       ┌─────────────┐
           └───────│   hiding    │ (200ms 动画滑入)
                   └──────┬──────┘
                          │ 动画完成
                          ▼
                   ┌─────────────┐
                   │   hidden    │
                   └─────────────┘

特殊规则：
- 如果用户正在与控制条内的元素交互（如编辑标题），锁定为 visible
- 右键菜单打开时，锁定为 visible
- 全屏模式下，热区扩大到顶部 60px
```

**侧边栏 (`CanvasSidePanel`) 状态机**：

```
                    ┌─────────────┐
                    │   hidden    │ (默认状态)
                    └──────┬──────┘
                           │ Ctrl+B / 控制条开关 / 右键菜单
                           ▼
                    ┌─────────────┐
                    │   visible   │ (280px 宽度)
                    └──────┬──────┘
                           │ Ctrl+B / 关闭按钮 / Esc
                           ▼
                    ┌─────────────┐
                    │   hidden    │
                    └─────────────┘

特殊规则：
- 状态持久化：记录用户在每个画布中是否开启了侧边栏
- 自动避让：检测到 Agent 正在大规模修改文件时，如果侧边栏开启，可提供“自动折叠”选项
- 主窗口中始终为常驻模式
```

#### 4.5.7 快捷键映射

| 快捷键         | 作用域                     | 功能                                 |
| -------------- | -------------------------- | ------------------------------------ |
| `F5`           | 独立窗口                   | 刷新预览（浏览器自带）               |
| `Ctrl+B`       | 独立窗口                   | 切换侧边栏（文件树）                 |
| `Ctrl+J`       | 独立窗口                   | 切换底部状态栏                       |
| `Ctrl+Shift+E` | 独立窗口                   | 在 VSCode 中打开                     |
| `Alt+Enter`    | 独立窗口                   | 全屏/窗口模式切换                    |
| `Ctrl+S`       | 独立窗口                   | 提交所有待定更改（Commit）           |
| `Ctrl+Z`       | 独立窗口（非编辑器焦点时） | 撤回上一次影子文件修改（Undo）       |
| `Esc`          | 独立窗口                   | 关闭侧边栏 / 关闭右键菜单 / 取消选中 |

#### 4.5.8 预览引擎设计 (`useCanvasPreview`)

Canvas 的预览引擎是对 `HtmlInteractiveViewer` 的重大升级，核心差异在于**多文件项目支持**和**VFS 合并**。

**渲染模式对比**：

| 特性         | 模式 A：srcdoc 内联               | 模式 B：物理路径                       |
| ------------ | --------------------------------- | -------------------------------------- |
| 入口加载     | 将 `index.html` 内容注入 `srcdoc` | 使用 `convertFileSrc(path)` 设置 `src` |
| CSS/JS 引用  | 需要内联合并所有引用文件          | 浏览器自动解析相对路径                 |
| 影子文件覆盖 | 直接替换 srcdoc 中的内容          | 需要 Service Worker 拦截请求           |
| 适用场景     | 单文件 HTML、简单项目             | 多文件项目、复杂资源引用               |
| 热重载       | 全量替换 srcdoc                   | 可实现 CSS-only 热替换                 |

**VFS 合并策略**：

```typescript
// useCanvasPreview.ts 核心逻辑
function resolveFileContent(filePath: string): string {
  // 1. 优先从影子文件读取（内存层）
  if (pendingUpdates[filePath]) {
    return pendingUpdates[filePath];
  }
  // 2. 回退到物理文件（通过 Tauri read_text_file_force）
  return await readPhysicalFile(canvasBasePath + "/" + filePath);
}

// 模式 A：srcdoc 合并
function buildSrcdoc(): string {
  let html = resolveFileContent("index.html");
  // 将 <link href="style.css"> 替换为内联 <style>
  // 将 <script src="script.js"> 替换为内联 <script>
  return inlineAllReferences(html, resolveFileContent);
}

// 模式 B：物理路径 + Service Worker
function getPreviewSrc(): string {
  return convertFileSrc(canvasBasePath + "/index.html");
  // Service Worker 拦截子资源请求，优先返回影子文件内容
}
```

**热重载策略**：

- 当 `pendingUpdates` 中的文件变更时，判断变更文件类型：
  - `.css` 文件：尝试 CSS-only 热替换（通过 `postMessage` 通知 iframe 内的注入脚本重新加载 `<link>` 标签）
  - `.js` / `.html` 文件：全量刷新 iframe
- 防抖：连续变更时，300ms 防抖后执行刷新，避免 Agent 批量修改时的频繁刷新。

### 4.6 Git Analyzer 联动 (Ecosystem Integration)

- **入口接入**：在 Canvas 管理界面提供“在 Git Analyzer 中分析”按钮。
- **数据共享**：Git Analyzer 通过 Rust 后端的 `git2-rs` 直接读取画布目录下的 `.git` 文件夹，生成开发者报告。

## 5. 上下文集成 (Context Injection)

### 5.1 CanvasInjectionProcessor

注册到 `llm-chat` 的上下文流水线（优先级 300）：

- **注入逻辑**：
  1. 检测当前会话是否关联了活跃画布。
  2. 如果有关联，读取文件树快照及**未提交变更状态**。
  3. 构造环境信息块：
     ```text
     <canvas_context id="...">
     Project Files: [index.html, style.css, ...]
     Uncommitted Changes: [index.html (modified)]
     Current Active File: index.html
     Content: ... (可选，根据 Token 预算决定是否注入)
     </canvas_context>
     ```

## 6. 实施步骤

### 第一阶段：基础设施与“影子文件”系统 (P0) - [已完成]

1.  **✅ 目录结构**：已创建 `src/tools/canvas/` 及其子目录（components, composables, services, stores, types）。
2.  **✅ 工具注册**：实现 `canvas.registry.ts` 并注册到 `src/config/tools.ts`。
3.  **✅ 状态管理**：实现 `CanvasStore` (Pinia)，支持多画布的 `pendingUpdates` 影子文件管理及 Search/Replace Diff 应用引擎。
4.  **✅ 版本控制**：实现 `GitInternalService.ts`，封装 `isomorphic-git` 并提供完整的 Tauri FS 适配层。
5.  **✅ 管理界面**：实现 `CanvasWorkbench.vue`、`CanvasProjectList.vue`、`CanvasProjectCard.vue` 和 `CreateCanvasDialog.vue`。
6.  **✅ Agent 接口**：在 `CanvasRegistry` 中定义了 `create_canvas`, `read_canvas_file`, `apply_canvas_diff`, `write_canvas_file`, `commit_changes` 等接口。
7.  **✅ 存储逻辑**：实现 `useCanvasStorage`，对接 Tauri FS 插件及 Rust 后端高性能指令（`generate_directory_tree`, `delete_directory_in_app_data`）。
8.  **✅ 同步基础设施**：实现 `useCanvasSync.ts`，注册了 Action 处理器及 Layer 1/2 同步引擎。

### 第二阶段：编辑器与独立窗口开发 (P1) - [已完成]

1.  **✅ 编辑器面板**：实现 `CanvasEditorPanel.vue`，集成 Monaco 编辑器（`RichCodeEditor`）及多文件 Tab 切换。
2.  **✅ 文件树**：实现 `CanvasFileTree.vue` 和 `CanvasFileTreeItem.vue`，支持状态标记（Modified/New）。
3.  **✅ 影子文件管理**：实现 `PendingChangesBar.vue` 用于 Commit/Discard 操作。
4.  **✅ 独立预览窗口**：实现 `CanvasWindow.vue`（无边框舞台模式）及 `CanvasPreviewPane.vue`。
5.  **✅ 悬浮控制条**：实现 `CanvasFloatingBar.vue`，支持热区触发、自动隐藏及窗口控制。
6.  **✅ 预览引擎**：实现 `useCanvasPreview.ts`，支持基于 `srcdoc` 的多文件内联渲染及控制台日志捕获。
7.  **✅ 状态消费者**：实现 `useCanvasStateConsumer.ts`，处理跨窗口增量同步及初始状态请求。
8.  **✅ 状态栏**：实现 `CanvasStatusBar.vue` 展示项目统计及同步状态。

### 第三阶段：Chat 集成与细节优化 (P2) - [待启动]

1. 编写 `CanvasInjectionProcessor` 并接入上下文管道。
2. 在 Chat 界面增加“打开画布”快捷入口。
3. 优化 VCP 协议在传输大段 HTML 代码时的稳定性。

## 7. 风险与优化

- **IO 性能**：对于频繁的小文件修改，考虑在 Store 中做防抖写入。
- **Token 压力**：文件过多时，只注入文件树和当前正在编辑的文件内容。
- **清理机制**：提供清理临时/过期画布的功能，防止磁盘占用。
- **同步风暴**：Agent 连续修改多个文件时，利用动态 debounce（参照 Chat 的 `setDebounce(2000)`）降低全量同步频率，结束后执行一次兜底广播。
- **大文件 diff 开销**：对影子文件同步禁用 StateSyncEngine 的增量 diff 计算（参照 Chat 对 `chat-sessions` 的 `enableDelta: false` 策略），改用 Layer 3 的直接推送通道。

## 附录 A：同步基础设施参照表

| 基础设施                  | 文件路径                                    | Canvas 使用场景                    |
| ------------------------- | ------------------------------------------- | ---------------------------------- |
| `useStateSyncEngine`      | `src/composables/useStateSyncEngine.ts`     | Layer 1 元数据同步                 |
| `registerSyncSource`      | `src/composables/useStateSyncEngine.ts:105` | Layer 2 影子文件注册到全局同步中心 |
| `useWindowSyncBus`        | `src/composables/useWindowSyncBus.ts`       | 所有层的底层通信                   |
| `bus.onActionRequest(ns)` | `useWindowSyncBus.ts:618`                   | 注册 `canvas` 命名空间操作处理器   |
| `bus.syncStateBatch`      | `useWindowSyncBus.ts:524`                   | 初始连接时批量推送（自动）         |
| `bus.syncState` (直接)    | `useWindowSyncBus.ts:503`                   | Layer 3 预览增量通道               |
| `setDebounce()`           | `useStateSyncEngine.ts:220`                 | 动态调整同步频率                   |
| `manualPush()`            | `useStateSyncEngine.ts:327`                 | 操作完成后强制全量推送             |

**参照实现**：

- 完整同步层：`src/tools/llm-chat/composables/chat/useLlmChatSync.ts`
- 状态消费者：`src/tools/llm-chat/composables/ui/useLlmChatStateConsumer.ts`
- 自定义同步源：`src/tools/llm-chat/composables/input/useChatInputManager.ts`
- 流式增量通道：`src/tools/llm-chat/composables/chat/useChatResponseHandler.ts:107`
