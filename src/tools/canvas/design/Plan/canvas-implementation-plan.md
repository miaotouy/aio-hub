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

### 2.4 增量更新策略

- **上策 (Agent-Side)**：通过提供 `replace_content` 等增量操作工具，由 Agent 输出短文本，从源头降低传输压力。
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
- **路由约定**：使用 `/detached-window/canvas?id={canvasId}`，由前端路由负责解析 ID 并加载对应数据。
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

### 4.2 CanvasRegistry (工具调用接口)

注册为标准的 `ToolRegistry`，暴露给 Agent：

- `create_canvas(title)`: 初始化新画布。
- `update_file(path, content)`: 提交更新到内存缓冲区。
- `commit_changes()`: 将缓冲区内容全部写入磁盘。
- `discard_changes()`: 丢弃缓冲区内容。
- `delete_file(path)`: 删除文件。
- `get_snapshot()`: 获取当前文件列表和结构。

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

Canvas 采用 **“主控端 (Main) + 舞台端 (Detached)”** 的多窗口协同架构，利用项目现有的 `WindowSyncBus` 和 `useStateSyncEngine` 实现状态同步：

- **核心状态 (`CanvasState`)**：
  - `activeCanvasId`: 当前操作的画布 ID。
  - `pendingUpdates`: `Record<filePath, content>` 存储内存层（影子文件）数据。
  - `projectMetadata`: 画布元数据（标题、最后修改时间等）。
  - `previewConfig`: 预览配置（自动刷新开关、缩放比例等）。
- **同步策略**：
  - **影子同步**：主窗口更新 `pendingUpdates` 后，通过总线发送 `canvas:apply-preview` 动作。
  - **画布自治**：画布窗口接收到动作后，在本地更新自己的影子文件副本并触发预览刷新。
  - **初始同步**：Canvas 窗口启动时通过 `bus.requestInitialState()` 自动从主窗口同步当前活跃画布的所有状态。
- **Action 通信**：
  - **`canvas:refresh`**：主窗口或 Agent 可通过 `requestAction` 强制要求 Canvas 窗口重新加载预览器，解决某些脚本状态残留问题。

### 4.5 Git Analyzer 联动 (Ecosystem Integration)

- **入口接入**：在 Canvas 管理界面提供“在 Git Analyzer 中分析”按钮。
- **数据共享**：Git Analyzer 通过 Rust 后端的 `git2-rs` 直接读取画布目录下的 `.git` 文件夹，生成开发者报告。

## 5. 上下文集成 (Context Injection)

### 5.1 CanvasInjectionProcessor

注册到 `llm-chat` 的上下文流水线（优先级 300）：

- **注入逻辑**：
  1. 检测当前会话是否关联了活跃画布。
  2. 如果有关联，读取文件树快照。
  3. 构造环境信息块：
     ```text
     <canvas_context id="...">
     Project Files: [index.html, style.css, ...]
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

### 第二阶段：独立窗口开发 (P1)

1. 开发极致纯净的 `CanvasWindow.vue` (无边框舞台模式)。
2. 实现悬浮控制条与边缘触发交互逻辑。
3. **实现混合渲染逻辑**：
   - 优先从 `CanvasStore.pendingUpdates` 读取文件内容。
   - 缺失时通过 `convertFileSrc` 从物理路径加载。
4. 实现 `CanvasSidePanel.vue`，作为管理侧边栏。
5. 实现“在 VSCode 中打开”的桥接指令。
6. 实现跨窗口状态同步与文件监听刷新。

### 第三阶段：Chat 集成 (P2)

1. 编写 `CanvasInjectionProcessor` 并接入上下文管道。
2. 在 Chat 界面增加“打开画布”快捷入口。
3. 优化 VCP 协议在传输大段 HTML 代码时的稳定性。

## 7. 风险与优化

- **IO 性能**：对于频繁的小文件修改，考虑在 Store 中做防抖写入。
- **Token 压力**：文件过多时，只注入文件树和当前正在编辑的文件内容。
- **清理机制**：提供清理临时/过期画布的功能，防止磁盘占用。
