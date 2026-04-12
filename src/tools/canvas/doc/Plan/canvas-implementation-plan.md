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
- **管理界面 (`CanvasManager.vue`)**：
  - **项目列表**：以卡片或列表形式展示所有物理存储的画布项目。
  - **预览图**：(可选) 展示画布最后一次运行的截图。
  - **操作栏**：新建项目、导入/导出项目、批量删除。
  - **状态指示**：显示哪些画布当前正处于“独立窗口打开”状态。

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
  - **悬浮控制条 (Floating Controller)**：鼠标悬停在窗口顶部边缘时，平滑滑出一个半透明毛玻璃控制条，包含：窗口控制（关闭/最小化/最大化）、置顶切换、以及“管理面板”入口。
  - **侧边触发菜单 (Edge Trigger)**：鼠标悬停在左/右侧边缘时，可滑出极简的文件切换列表或项目快照。
  - **右键上下文菜单**：提供“在 VSCode 中打开”、“刷新预览”、“复制项目路径”、“切换渲染引擎”等高级操作。
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

### 4.5 Git Analyzer 联动 (Ecosystem Integration)

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

### 第一阶段：基础设施与“影子文件”系统 (P0)

1. 创建 `src/tools/canvas/` 目录结构。
2. 实现 `canvas.registry.ts`，接入主程序侧边栏。
3. 实现 `CanvasStore` (Pinia)：支持 `pendingUpdates` 状态管理。
4. **实现 `GitInternalService.ts`**：封装 `isomorphic-git`，提供基础的 init/add/commit 能力。
5. 开发基础管理界面 `CanvasManager.vue`。
6. 实现 `CanvasRegistry.ts` (Agent 接口)：
   - `update_file` 改为写入 Store 内存。
   - 暴露 `commit` / `discard` 接口给 UI。
7. 实现 `useCanvasStorage` composable，统一管理物理路径逻辑。
8. **实现 `useCanvasSync.ts`**：在第一阶段即引入同步基础设施：
   - 注册 `canvas` 命名空间 Action 处理器（`bus.onActionRequest('canvas', handler)`）
   - 使用 `registerSyncSource` 注册影子文件同步源
   - 创建 Layer 1 元数据同步引擎
   - 参照 `useLlmChatSync.ts` 的延迟初始化模式：监听 `bus.hasDownstreamWindows` 动态创建/清理引擎

### 第二阶段：独立窗口开发 (P1)

1. 开发极致纯净的 `CanvasWindow.vue` (无边框舞台模式)。
2. 实现悬浮控制条与边缘触发交互逻辑。
3. **实现混合渲染逻辑**：
   - 优先从本地影子文件副本读取内容。
   - 缺失时通过 `convertFileSrc` 从物理路径加载。
4. 实现 `CanvasSidePanel.vue`，作为管理侧边栏。
5. 实现“在 VSCode 中打开”的桥接指令。
6. **实现 `useCanvasStateConsumer.ts`**（画布窗口端）：
   - 参照 `useLlmChatStateConsumer.ts`，只接收不推送（`autoPush: false`）
   - 监听 `canvas:file-delta` 增量通道，实时更新本地副本并刷新预览
   - 启动时调用 `bus.requestInitialState()` 触发批量初始同步
7. 实现文件监听刷新（主窗口 Tauri FS Watcher → 同步到画布窗口）。

### 第三阶段：Chat 集成 (P2)

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
