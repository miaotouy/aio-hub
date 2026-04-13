# 画布 (Canvas) 模块实施计划 (影子文件预览方案)

## 1. 概述

画布模块旨在为 Agent 提供一个独立于聊天流的、持久化的多文件协作空间。通过**"内存预览 + 异步持久化"**方案，确保 Agent 的修改可以被即时预览、人工审核，并最终安全地存储在物理文件系统中。

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
- **路由约定**：使用 `/detached-component/canvas:preview?id={canvasId}`，由前端路由负责解析 ID 并加载对应数据。
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
  - 采用**双视图切换**架构：项目大厅 ↔ 编辑视图，由 `store.activeCanvasId` 控制切换。
  - **项目大厅**：顶部 Header（新建按钮、搜索框、卡片/列表视图切换），下方渲染 `CanvasProjectList`。
  - **编辑视图**：当选中某个项目后，整体替换为 `CanvasEditorPanel`。

### 4.2 CanvasRegistry (工具调用接口 - 手术刀模式)

注册为标准的 `ToolRegistry`，遵循项目的 **VCP (Variable & Command Protocol)** 协议规范。Agent 通过以下指令操作影子文件系统：

- **`read_canvas_file(path)`**: 读取文件内容（**带行号**）。优先从 `pendingUpdates` 读取。
- **`apply_canvas_diff(path, diff)`**: 使用 Search/Replace 块模式修改影子文件。**自动记录到 Undo 栈**。
- **`write_canvas_file(path, content)`**: 全量覆盖影子文件内容。
- **`undo_canvas_diff()`**: 撤回上一次内存修改。
- **`commit_changes()`**: 执行物理落盘并完成 Git Commit。
- **`discard_changes()`**: 丢弃缓冲区内容，清空 Undo 栈。
- **`list_canvas_files()`**: 获取文件树。

> **设计变更**：已移除 `create_canvas(title)` 方法。画布的创建和绑定完全由用户在 UI 中操作，Agent 不参与画布生命周期管理。当 Agent 调用写入操作但当前未绑定画布时，系统自动创建画布并绑定（见 §5.5.3）。

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

### 4.3 CanvasWindow (独立窗口 UI - "舞台模式")

CanvasWindow 采用**"极致纯净"**设计，旨在作为一个独立的展示/运行环境。**不包含任何管理 UI**（文件树、控制台等），所有管理功能统一集成在主窗口的 `CanvasEditorPanel` 中。

- **UI 交互与控制**：
  - **无边框设计**：默认隐藏标题栏，支持通过 `useDetachable` 的无边框窗口配置。
  - **全屏/桌面化**：支持无边框最大化，可作为桌面背景或全屏应用使用。
  - **悬浮控制条 (Floating Controller)**：鼠标悬停在窗口顶部 40px 热区时，平滑滑出一个半透明毛玻璃控制条。包含：
    - 左侧：画布标题
    - 中间：刷新预览、状态栏开关、切换渲染引擎、在 VSCode 中打开
    - 右侧：关闭按钮
  - **底部状态栏**：可通过悬浮控制条的开关切换显隐。显示当前文件名、文件总数、待定更改数量。
  - **全局快捷键**：`F5` (刷新), `Alt+Enter` (全屏/窗口模式切换)。
- **技术实现**：基于 `useCanvasPreview` 引擎，支持 `srcdoc` (内联模式) 和 `physical` (物理路径模式) 双引擎。通过 `convertFileSrc` 加载本地物理路径资源。

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

Canvas 的 UI 分为两个主要场景：**主窗口管理/编辑界面**、**独立窗口（舞台）**。所有管理功能（文件树、待定更改管理、代码编辑）统一集成在主窗口的 `CanvasEditorPanel` 中，独立窗口仅保留悬浮控制条和状态展示，保持"极致纯净"。

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
│   └── useCanvasPreview.ts         # 预览引擎（VFS 合并 + iframe 控制）
├── services/
│   └── GitInternalService.ts       # isomorphic-git 封装
├── components/
│   ├── workbench/                  # === 主窗口工作台组件 ===
│   │   ├── CanvasProjectList.vue   # 项目大厅
│   │   ├── CanvasProjectCard.vue   # 单个项目卡片
│   │   ├── CreateCanvasDialog.vue  # 新建画布对话框
│   │   └── CanvasEditorPanel.vue   # 编辑视图容器（含侧边栏文件树 + Monaco 编辑器）
│   ├── window/                     # === 独立窗口（舞台）组件 ===
│   │   ├── CanvasWindow.vue        # 舞台顶层容器
│   │   ├── CanvasPreviewPane.vue   # 预览区域（VFS-aware iframe）
│   │   ├── CanvasFloatingBar.vue   # 悬浮控制条
│   │   └── CanvasStatusBar.vue     # 底部状态栏
│   ├── sidebar/                    # === 文件树组件（仅被主窗口 EditorPanel 引用） ===
│   │   ├── CanvasFileTree.vue      # 文件树组件
│   │   └── CanvasFileTreeItem.vue  # 文件树节点
│   └── shared/                     # === 跨场景共享组件 ===
│       └── PendingChangesBar.vue   # 待定更改操作栏（Commit/Discard）
└── doc/
    └── Plan/
        └── canvas-implementation-plan.md
```

#### 4.5.2 主窗口管理界面 (`CanvasWorkbench.vue`)

管理界面是用户在主程序侧边栏点击"画布"后看到的页面，由 `store.activeCanvasId` 控制项目大厅与编辑视图的切换。

**项目大厅视图**（`activeCanvasId === null` 时显示）：

```
┌─────────────────────────────────────────────────────┐
│  WorkbenchHeader                                    │
│  [+ 新建画布]  [搜索...]                [列表/卡片] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CanvasProjectList                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Project  │ │ Project  │ │ Project  │            │
│  │ Card     │ │ Card     │ │ Card     │            │
│  │          │ │          │ │          │            │
│  │ [打开]   │ │ [打开]   │ │ [打开]   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**编辑视图**（`activeCanvasId !== null` 时显示 `CanvasEditorPanel`）：

```
┌─────────────────────────────────────────────────────┐
│  EditorHeader                                       │
│  [← 返回] | 📄 画布名称  [Tab1][Tab2][Tab3]  [Commit All] [独立预览] │
├──────┬──────────────────────────────────────────────┤
│ 资源 │                                              │
│ 管理 │           Monaco 代码编辑器                   │
│ 器   │          (当前活跃 Tab 的文件内容)             │
│      │                                              │
│ 📁   │                                              │
│ 文件 │                                              │
│ 树   │                                              │
│      │                                              │
├──────┤                                              │
│ 待定 │                                              │
│ 更改 │                                              │
│ 列表 │                                              │
├──────┴──────────────────────────────────────────────┤
│ Footer: [📄 当前文件路径]        [🕐 N 个待定更改]   │
└─────────────────────────────────────────────────────┘
```

**组件职责**：

- **`CanvasWorkbench.vue`**：顶层路由组件，通过 `store.activeCanvasId` 切换项目大厅和编辑视图。
- **`CanvasProjectList.vue`**：项目列表容器，支持卡片网格和紧凑列表两种布局。空状态显示引导提示。
- **`CanvasProjectCard.vue`**：单个项目卡片。展示：缩略图（可选）、标题、最后修改时间、文件数量。操作：打开、在 VSCode 中打开、删除。
- **`CreateCanvasDialog.vue`**：新建画布对话框（基于 `BaseDialog`）。输入项目标题，选择模板（空白 / HTML 基础 / Vue SFC / React），确认后调用 Store 创建。
- **`CanvasEditorPanel.vue`**：编辑视图容器，集成了：
  - **左侧侧边栏**：资源管理器（`CanvasFileTree`）+ 待定更改列表（`PendingChangesBar`），可通过折叠按钮收起。
  - **中心编辑区**：`RichCodeEditor`（Monaco 引擎），支持多文件 Tab 切换。
  - **顶部操作栏**：返回按钮、画布名称、Tab 栏、Commit All 按钮、独立预览按钮。
  - **底部状态栏**：当前文件路径、待定更改数量。

#### 4.5.3 独立窗口 — 舞台模式 (`CanvasWindow.vue`)

CanvasWindow 是画布的核心展示/运行环境，以**极致纯净**为设计目标。默认全屏预览，所有控制元素均为悬浮/触发式，不占用永久空间。**不包含文件树、控制台等管理 UI。**

```
┌─────────────────────────────────────────────────────┐
│ (悬浮控制条 - 鼠标悬停顶部 40px 热区时滑出)          │
│  CanvasFloatingBar                                  │
│  [🖌️ 标题] [刷新] [状态栏] [引擎] [VSCode]     [×]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│              CanvasPreviewPane                      │
│           (iframe 全屏预览区域)                      │
│                                                     │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ CanvasStatusBar (底部状态栏 - 可通过控制条开关显隐)   │
│ [index.html]      [Files: 3]      [● 2 pending]    │
└─────────────────────────────────────────────────────┘
```

**组件职责**：

- **`CanvasWindow.vue`**：舞台顶层容器。职责：
  - 组合所有子组件（预览、控制条、状态栏）
  - 管理状态栏的显隐状态（`showStatusBar`）
  - 通过 `useCanvasStateConsumer` 接收同步数据
  - 通过 `useCanvasPreview` 驱动预览引擎
  - 监听 `activeCanvasId` 变化加载元数据
  - 监听 `pendingUpdates` 变化自动刷新预览

- **`CanvasPreviewPane.vue`**：VFS-aware 的 iframe 预览器。核心特性：
  - **双模式渲染**：`srcdoc` (内联模式) 和 `src` (物理路径模式)，通过 `effectiveMode` 自动选择。
  - **影子文件覆盖**：当存在 `pendingUpdates` 时，自动回退到 `srcdoc` 模式以确保影子文件可见。
  - **错误捕获**：通过注入的 `logCaptureScript`，将 iframe 内的 console/error 转发到父窗口。
  - **加载指示器**：刷新期间显示 Loading Overlay。

- **`CanvasFloatingBar.vue`**：悬浮控制条。交互设计：
  - **触发方式**：鼠标进入窗口顶部 40px 热区时，以 `transform: translateY` 动画从上方滑出。
  - **自动隐藏**：鼠标离开控制条区域 1.5 秒后自动滑回。
  - **视觉**：半透明毛玻璃背景（`backdrop-filter: blur(var(--ui-blur))`），圆角胶囊形。
  - **按钮组**：
    - 左侧：画布标题图标 + 标题文字
    - 中间：刷新预览、状态栏开关、切换渲染引擎（srcdoc ↔ physical）、在 VSCode 中打开
    - 右侧：关闭窗口
  - **拖拽**：整个控制条区域支持 `data-tauri-drag-region` 拖拽窗口。

- **`CanvasStatusBar.vue`**：底部状态栏。单行极简设计：
  - 左侧：当前活跃文件名
  - 中间：项目文件总数
  - 右侧：待定更改数量（有更改时显示脉冲动画圆点）
  - 高度固定 28px，背景使用 `var(--card-bg)` 半透明。

#### 4.5.4 文件树组件（`sidebar/` 目录）

文件树组件仅被主窗口的 `CanvasEditorPanel` 引用，不在独立窗口中使用。

- **`CanvasFileTree.vue`**：文件树容器。
  - **数据源**：合并物理文件树（来自 `generate_directory_tree`）和影子文件（`pendingUpdates` 中的新文件）。
  - **交互**：单击文件在编辑器中打开对应 Tab。

- **`CanvasFileTreeItem.vue`**：文件树节点组件。
  - 展示：缩进层级、展开/折叠箭头（目录）、文件图标、文件名、修改状态标记。
  - **状态标记**：
    - 🟢 `modified` — 影子文件中有更改（绿色圆点）
    - 🟡 `new` — 仅存在于影子文件中的新文件（黄色加号）
    - ⚪ `clean` — 与物理文件一致（无标记）

#### 4.5.5 共享组件

- **`PendingChangesBar.vue`**：待定更改操作栏。
  - **位置**：在主窗口 `CanvasEditorPanel` 的侧边栏底部区域。
  - **展示**：列出所有有更改的文件名和变更类型。
  - **操作**：
    - **Commit All**：提交所有更改（调用 `store.commitChanges`）
    - **Discard All**：丢弃所有更改（调用 `store.discardChanges`，需二次确认）

#### 4.5.6 交互状态机

**悬浮控制条 (`CanvasFloatingBar`) 状态机**：

```
                    ┌─────────────┐
                    │   hidden    │ (默认状态)
                    └──────┬──────┘
                           │ mouseenter 顶部 40px 热区
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

#### 4.5.7 快捷键映射

| 快捷键         | 作用域                     | 功能                       |
| -------------- | -------------------------- | -------------------------- |
| `F5`           | 独立窗口                   | 刷新预览                   |
| `Ctrl+J`       | 独立窗口                   | 切换底部状态栏             |
| `Ctrl+Shift+E` | 独立窗口                   | 在 VSCode 中打开           |
| `Alt+Enter`    | 独立窗口                   | 全屏/窗口模式切换          |
| `Ctrl+S`       | 独立窗口（非编辑器焦点时） | 提交所有待定更改（Commit） |
| `Esc`          | 独立窗口                   | 关闭右键菜单 / 取消选中    |

> **注意**：快捷键逻辑目前散落在各组件内部，尚未抽取为统一的 `useCanvasKeyboard.ts`。

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

// 模式 B：物理路径
function getPreviewSrc(): string {
  return convertFileSrc(canvasBasePath + "/index.html");
}
```

**影子文件覆盖策略**：当存在 `pendingUpdates` 时，`effectiveMode` 自动回退到 `srcdoc` 模式，确保影子文件的修改能立即在预览中体现。仅当没有待定更改时，才允许使用物理路径模式。

**热重载策略**：

- 当 `pendingUpdates` 中的文件变更时，判断变更文件类型：
  - `.css` 文件：尝试 CSS-only 热替换（通过 `postMessage` 通知 iframe 内的注入脚本重新加载 `<style data-file>` 标签内容）
  - `.js` / `.html` 文件：全量刷新 iframe
- 防抖：连续变更时，300ms 防抖后执行刷新，避免 Agent 批量修改时的频繁刷新。

### 4.6 Git Analyzer 联动 (Ecosystem Integration)

- **入口接入**：在 Canvas 管理界面提供"在 Git Analyzer 中分析"按钮。
- **数据共享**：Git Analyzer 通过 Rust 后端的 `git2-rs` 直接读取画布目录下的 `.git` 文件夹，生成开发者报告。

## 5. 上下文集成 (Context Injection)

### 5.1 架构约束：模块间依赖方向（⚠️ 强制规则）

Canvas 模块（`src/tools/canvas/`）与 llm-chat 模块（`src/tools/llm-chat/`）之间存在严格的**单向依赖**约束：

```
✅ 合法方向：llm-chat → canvas
   llm-chat 的 UI 组件可以 import canvasStore 来读写画布状态

❌ 违规方向：canvas → llm-chat
   canvas 模块内的任何文件 **严禁** import llm-chat 内部模块
   包括但不限于：agentStore、sessionStore、useChatContext 等
```

**原因**：Canvas 是一个独立工具，它不知道也不应该知道"谁在使用它"。Agent 的绑定配置存储在 `Agent.toolCallConfig.toolSettings.canvas` 中，但 Canvas 模块不应该去读取这个配置。

**正确的数据流**：

```
用户在 Chat UI 中选择画布绑定
  → llm-chat 侧写入 Agent.toolSettings.canvas.canvasId
  → llm-chat 侧同时调用 canvasStore.openCanvas(canvasId) 来同步激活状态
  → Canvas 的 getExtraPromptContext() 只读自己的 canvasStore.activeCanvasId
```

> **给 AI 施工者的警告**：如果你发现自己在 `src/tools/canvas/` 下的文件中写出了 `import { useAgentStore } from "../llm-chat/..."` 或类似的导入，**立即停止**。这是架构违规。Canvas 只依赖自己的 store 和公共基础设施（`@/composables`、`@/services`、`@/utils` 等）。

### 5.2 设计变更说明

**架构缺陷**：原计划使用独立的 `CanvasInjectionProcessor` 注册到 llm-chat 的上下文流水线中。该方案存在三个根本问题：

1. **位置不可控**：Processor 直接操作 `context.messages` 数组硬编码插入位置，用户无法控制画布上下文在 prompt 中的位置。
2. **激活条件不可控**：依赖全局的 `canvasStore.activeCanvasId`，用户在画布页面点开任何项目，所有聊天会话都会被注入。
3. **缺少 Chat 侧控制入口**：没有 UI 让用户选择"哪个画布绑定到当前 Agent/会话"。

**正确方案**：复用项目已有的**工具上下文注入基础设施**（[`tool-calling/ARCHITECTURE.md`](src/tools/tool-calling/ARCHITECTURE.md)）：

```
CanvasRegistry.getExtraPromptContext()  ← 工具提供动态上下文（只读自己的 store）
        ↓
discovery.getAgentContexts()           ← 自动收集所有已启用工具的上下文
        ↓
{{tool_context}} / {{tool_context::canvas}}  ← 宏引擎展开，用户控制位置
        ↓
<context_provider id="canvas">...</context_provider>  ← 最终注入 prompt
```

### 5.3 CanvasRegistry.getExtraPromptContext()

`CanvasRegistry` 必须实现 [`AgentExtension.getExtraPromptContext()`](src/services/types.ts:129) 接口，提供运行时画布上下文。

**⚠️ 关键约束**：此方法**只读取 Canvas 自己的 store**（`canvasStore.activeCanvasId`），**不 import 也不读取 agentStore 或任何 llm-chat 内部模块**。"当前激活的画布是哪个"由 llm-chat 侧在发送消息前通过调用 `canvasStore.openCanvas()` 来同步（见 §5.6）。

```typescript
// src/tools/canvas/canvas.registry.ts
// ⚠️ 注意：此文件只 import canvas 自己的模块和公共基础设施
import { useCanvasStore } from "./stores/canvasStore";
import type { CanvasFileNode } from "./types";

export default class CanvasRegistry implements ToolRegistry {
  // ... 现有 getMetadata() 代码 ...

  async getExtraPromptContext(): Promise<string> {
    let canvasStore;
    try {
      canvasStore = useCanvasStore();
    } catch {
      return ""; // Canvas 模块未加载
    }

    // 只读自己 store 中的 activeCanvasId
    // 这个值由 llm-chat 侧在发送消息前同步设置
    const canvasId = canvasStore.activeCanvasId;
    if (!canvasId) return "";

    const activeCanvas = canvasStore.activeCanvas;
    if (!activeCanvas) return "";

    const fileTree = await canvasStore.getFileTree(canvasId);
    const pendingFiles = canvasStore.pendingUpdates[canvasId] || {};

    const buildFileList = (nodes: CanvasFileNode[], indent = ""): string => {
      return nodes
        .map((node) => {
          const statusTag =
            node.status === "modified"
              ? " (modified)"
              : node.status === "new"
                ? " (new)"
                : node.status === "deleted"
                  ? " (deleted)"
                  : "";
          if (node.isDirectory) {
            const children = node.children ? buildFileList(node.children, indent + "  ") : "";
            return `${indent}- ${node.name}/${children ? "\n" + children : ""}`;
          }
          return `${indent}- ${node.name}${statusTag}`;
        })
        .join("\n");
    };

    const fileListStr = buildFileList(fileTree);
    const pendingFileNames = Object.keys(pendingFiles);
    const changesStr = pendingFileNames.length > 0 ? pendingFileNames.map((f) => `- ${f}`).join("\n") : "None";

    return `Canvas Project: ${activeCanvas.metadata.name}
Entry File: ${activeCanvas.metadata.entryFile}

Project Files:
${fileListStr}

Uncommitted Changes: ${pendingFileNames.length} files
${changesStr}`;
  }
}
```

`discovery.getAgentContexts()` 会自动将其包裹为：

```xml
<context_provider id="canvas">
...getExtraPromptContext() 返回的内容...
</context_provider>
```

### 5.4 宏注入控制

用户在 Agent 的 system prompt 中使用宏控制注入位置：

| 宏                         | 说明                                      |
| -------------------------- | ----------------------------------------- |
| `{{tools::canvas}}`        | 注入画布工具定义（8 个操作方法）          |
| `{{tool_context}}`         | 注入所有已启用工具的上下文（包括 canvas） |
| `{{tool_context::canvas}}` | 仅注入画布工具的上下文                    |

**示例**（Agent Preset 的 presetMessages）：

```text
你是一个前端开发助手，可以操作画布项目。

## 可用工具
{{tools::canvas}}

## 当前画布状态
{{tool_context::canvas}}

请根据用户需求，使用画布工具创建或修改项目。
```

### 5.5 启用控制

通过 Agent 配置中的开关控制画布功能：

```typescript
// Agent.toolCallConfig
{
  enabled: true,
  toolToggles: {
    canvas: true,  // 启用画布工具
    // ... 其他工具
  },
  toolSettings: {
    canvas: {
      canvasId: "xxx-xxx-xxx"  // 绑定的画布项目 ID（可选）
      // null/undefined = 跟随全局 activeCanvasId（向后兼容）
    }
  }
}
```

### 5.6 Chat 侧画布绑定与同步机制

#### 5.6.1 数据结构

```typescript
// 存储在 Agent.toolCallConfig.toolSettings.canvas
interface CanvasToolSettings {
  canvasId: string | null;
  // null/undefined = 未绑定，首次写入时自动创建
}
```

#### 5.6.2 同步职责划分

**llm-chat 侧**（`src/tools/llm-chat/` 内部）负责：

1. 在**发送消息前**，从 `Agent.toolCallConfig.toolSettings.canvas.canvasId` 读取绑定的画布 ID
2. 调用 `canvasStore.openCanvas(canvasId)` 同步激活状态
3. 这样 Canvas 的 `getExtraPromptContext()` 自然能读到正确的 `activeCanvasId`

**Canvas 侧**（`src/tools/canvas/` 内部）负责：

1. 维护自己的 `activeCanvasId` 状态
2. 在 `getExtraPromptContext()` 中只读自己的 store
3. **不关心**是谁设置了 `activeCanvasId`

```typescript
// llm-chat 侧的同步逻辑（在发送消息的流程中）
// 位置：src/tools/llm-chat/composables/chat/ 中的某个 composable
import { useCanvasStore } from "@/tools/canvas/stores/canvasStore";

function syncCanvasBinding(agent: ChatAgent) {
  const canvasId = agent.toolCallConfig?.toolSettings?.canvas?.canvasId;
  if (canvasId) {
    const canvasStore = useCanvasStore();
    canvasStore.openCanvas(canvasId);
  }
}
```

> **依赖方向**：`llm-chat → canvas`（llm-chat import canvasStore）✅ 合法

#### 5.6.3 自动创建逻辑

当 Agent 调用画布写入操作（`write_canvas_file` / `apply_canvas_diff`）但当前未绑定画布时：

1. Canvas 的 `canvasStore` 检测到 `activeCanvasId === null`
2. 自动创建一个新画布（以默认名称如 "未命名画布" 命名）
3. 设置 `activeCanvasId` 为新画布 ID
4. **通过事件总线通知 llm-chat 侧**更新 Agent 的 `toolSettings.canvas.canvasId`

```typescript
// canvasStore 中的自动创建逻辑
async function ensureActiveCanvas(): Promise<string> {
  if (activeCanvasId.value) return activeCanvasId.value;

  // 自动创建
  const metadata = await createCanvas("未命名画布");
  if (!metadata) throw new Error("自动创建画布失败");

  // 通知外部（通过事件总线，不直接 import llm-chat）
  // llm-chat 侧监听此事件并更新 Agent 配置
  window.dispatchEvent(
    new CustomEvent("canvas:auto-created", {
      detail: { canvasId: metadata.id },
    }),
  );

  return metadata.id;
}
```

> **注意**：Canvas 通过 DOM 事件或全局事件总线通知外部，**不直接 import agentStore**。llm-chat 侧监听事件并自行更新 Agent 配置。

#### 5.6.4 Chat 侧画布控制 UI (展示+控制合一)

**位置**：[`MessageInputToolbar.vue`](src/tools/llm-chat/components/message-input/MessageInputToolbar.vue) 的右侧 `.input-actions` 区域。

**设计意图**：将原来的左侧独立控制按钮与右侧展示标签合并。右侧的药丸标签既是状态展示区，也是 `MiniCanvasControl` 的 Popover 触发器。

**显示条件**：当前 Agent 的 `toolToggles.canvas === true` 时显示。

**交互逻辑**：

- **未绑定**：显示为 `[🖌️ 未绑定]` (半透明/虚线边框)。
- **已绑定**：显示图标 + 画布名称。点击弹出管理面板。
- **有待定更改**：药丸变为 warning 色，并显示脉冲圆点。
- **解绑**：点击药丸内的 `×` 按钮。

```
工具栏布局：
┌─────────────────────────────────────────────────────────────────────┐
│ [A_] [🪄] [📎] [💬] [@] [⊞] [···] [🔧] [⚙] [⤡]                     │
│                                                                     │
│                    [🖌️ 我的项目 · ●] [Token计数] [发送]              │
│                     ↑                                               │
│            点击弹出 MiniCanvasControl Popover                        │
└─────────────────────────────────────────────────────────────────────┘
```

**MiniCanvasControl Popover 内容**：

```
┌─────────────────────────────────────┐
│  🖌️ 画布控制                        │
├─────────────────────────────────────┤
│  当前画布                            │
│  ┌─────────────────────────────┐    │
│  │ 📁 我的前端项目        [×]  │    │  ← 下拉选择器
│  └─────────────────────────────┘    │
│  ○ 首次写入时自动创建               │  ← 未绑定时提示
│  │                                     │
│  ● 2 个待定更改 (工具调用预览)       │  ← 接入审批系统的待定更改
│  │                                     │
├─────────────────────────────────────┤
│  [+ 新建画布]  [👁 预览]  [📂 管理]  │
└─────────────────────────────────────┘
```

**数据流**（全部在 llm-chat 内部，合法的 `llm-chat → canvas` 方向）：

```typescript
// MiniCanvasControl.vue 中
import { useCanvasStore } from "@/tools/canvas/stores/canvasStore";
import { useAgentStore } from "../../stores/agentStore";

// 读取画布列表
const canvasStore = useCanvasStore();
const canvasList = computed(() => canvasStore.canvasList);

// 读/写 Agent 的画布绑定
const agentStore = useAgentStore();
function bindCanvas(canvasId: string | null) {
  const agent = agentStore.currentAgent;
  if (!agent?.toolCallConfig) return;
  if (!agent.toolCallConfig.toolSettings) {
    agent.toolCallConfig.toolSettings = {};
  }
  agent.toolCallConfig.toolSettings.canvas = { canvasId };
  // 同时同步到 canvasStore
  if (canvasId) canvasStore.openCanvas(canvasId);
  agentStore.persistAgent(agent);
}
```

### 5.7 工具调用审批集成 (Preview/Discard 钩子)

为了与系统的统一审批 UI ([`ToolCallingApprovalBar.vue`](src/tools/llm-chat/components/message-input/ToolCallingApprovalBar.vue)) 集成，Canvas 实现了预览和丢弃钩子。

#### 5.7.1 预览机制 (onToolCallPreview)

当 Agent 发起 `apply_canvas_diff` 或 `write_canvas_file` 调用时，在进入审批挂起状态前，`executor` 会调用此钩子：

1. `CanvasRegistry` 拦截调用，将变更写入 `canvasStore` 的 `pendingUpdates`。
2. 此时变更标记为 `preview` 状态，并关联 `requestId`。
3. 画布预览窗口通过 Layer 3 通道实时同步此变更，用户可以**在点击批准前看到修改效果**。

#### 5.7.2 丢弃机制 (onToolCallDiscarded)

如果用户在审批栏点击"拒绝"或"清空"：

1. `executor` 调用此钩子。
2. `canvasStore` 根据 `requestId` 找到对应的快照，撤销 `pendingUpdates` 中的临时变更。
3. 预览窗口自动回退到物理文件版本。

#### 5.7.3 确认机制 (Approve)

如果用户点击"批准"：

1. `executor` 执行实际的工具方法。
2. 工具方法检测到 `pendingUpdates` 中已存在该 `requestId` 的预览数据，直接将其转正（或跳过重复写入逻辑）。

### 5.8 废弃 CanvasInjectionProcessor [已完成]

以下文件已删除或移除：

1. `src/tools/llm-chat/core/context-processors/canvas-injection-processor.ts` — 已删除
2. `src/tools/llm-chat/core/context-processors/index.ts` — 已移除导出
3. `src/tools/llm-chat/stores/contextPipelineStore.ts` — 已从 `getInitialProcessors()` 数组中移除

**原因**：该 Processor 的功能已被 `getExtraPromptContext()` + `{{tool_context}}` 宏完全替代，继续保留会导致重复注入。

## 6. 实施状态

### 第一阶段：基础设施与"影子文件"系统 (P0) - [已完成]

1.  **✅ 目录结构**：已创建 `src/tools/canvas/` 及其子目录。
2.  **✅ 工具注册**：实现 `canvas.registry.ts` 并注册。
3.  **✅ 状态管理**：实现 `CanvasStore` (Pinia)，支持 `pendingUpdates`。已实现增强版 Search/Replace Diff 引擎（支持模糊匹配和缩进容错），`getFileTree` 已支持影子文件中的新增文件展示。
4.  **✅ 版本控制**：实现 `GitInternalService.ts`。
5.  **✅ 管理界面**：实现 `CanvasWorkbench.vue` 等。
6.  **✅ Agent 接口**：在 `CanvasRegistry` 中定义了核心接口。
7.  **✅ 存储逻辑**：实现 `useCanvasStorage`。
8.  **✅ 同步基础设施**：已完成三层同步架构，包括 Layer 3 预览增量通道。

### 第二阶段：编辑器与独立窗口开发 (P1) - [已完成]

1.  **✅ 编辑器面板**：实现 `CanvasEditorPanel.vue`，集成 Monaco 编辑器及多文件 Tab 切换。
2.  **✅ 文件树**：实现 `CanvasFileTree.vue`，已支持 Modified 和 New 标记。
3.  **✅ 影子文件管理**：实现 `PendingChangesBar.vue` 用于 Commit/Discard 操作。
4.  **✅ 独立预览窗口**：实现 `CanvasWindow.vue`（无边框舞台模式，纯净预览，无管理 UI）。
5.  **✅ 悬浮控制条**：实现 `CanvasFloatingBar.vue`。
6.  **✅ 预览引擎**：已支持 srcdoc 内联模式和物理路径模式（convertFileSrc），支持 CSS-only 热替换。
7.  **✅ 状态消费者**：实现 `useCanvasStateConsumer.ts`。
8.  **✅ 状态栏**：实现 `CanvasStatusBar.vue`。

### 第三阶段：Chat 集成与细节优化 (P2) - [进行中]

1. ✅ 实现 `getExtraPromptContext()` + `{{tool_context}}` 宏注入（替代已废弃的 CanvasInjectionProcessor）。
2. ✅ 重构 Chat 界面画布控制 UI：展示+控制合一，移除左侧独立按钮。
3. ⏳ 接入工具调用审批系统：实现 `onToolCallPreview` 和 `onToolCallDiscarded` 钩子。
4. ✅ 实现 Agent 写入时自动创建画布逻辑。

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

## 8. 技术债清单 (Next Steps)

核心业务逻辑已 100% 交付。以下是需要补齐的交互细节和工程优化：

- **⚠️ `CanvasContextMenu.vue`**（交互缺失）：独立窗口缺失右键菜单。用户在全屏舞台模式下被迫寻找悬浮控制条，操作路径过长。
- **⚠️ `CanvasVersionHistory.vue`**（交互缺失）：底层 Git 基础设施已 100% 完成，但 UI 缺失导致用户无法在主窗口编辑视图中直接利用版本回溯能力。
- **⚠️ `useCanvasKeyboard.ts`**（维护性问题）：快捷键散落在各组件内，未形成统一的 Keymap 映射，增加了后期自定义快捷键的难度。
- **⚠️ `useCanvasConsole.ts`**（维护性问题）：日志收集逻辑内联化，主窗口暂无法复用舞台窗口捕获到的实时控制台日志。
