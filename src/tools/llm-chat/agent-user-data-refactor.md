# Agent & User Profile 数据存储重构方案 (最终修订版)

## 1. 背景与动机

经过深入分析，我们发现应用已通过 `useAgentStorageSeparated.ts` 实现了一套基于文件系统的分离式存储方案，每个 Agent 的配置被保存为独立的 JSON 文件，并使用 `agents-index.json` 进行索引，这已经是一个非常优秀的设计。

然而，当前的设计仍存在一个待改进点：**Agent 的资源文件（尤其是头像）无法与其配置文件绑定存储。** 目前的实现是将 Agent 的配置存储为 `.../agents/{id}.json` 文件，资源文件（如头像）则需要存放在全局的 `assets` 目录中，导致：

- **逻辑耦合**：Agent 的身份（配置）与其形象（头像）物理上是分离的，管理不便。
- **数据清理困难**：删除 Agent 时，只能删除其 JSON 配置文件，其头像作为通用资产仍会保留在 `assets` 目录中，成为难以追踪的“孤儿”文件。

本次重构的目标，是在现有优秀设计的基础上进行**演进式升级**，解决资源绑定问题。

## 2. 核心目标

1.  **实现资源内聚**：将每个 Agent 的存储从**单个文件**升级为**独立目录**，使其配置文件 (`agent.json`) 和所有相关资源（如 `avatar.png`）都存放在同一个命名空间下。
2.  **彻底解耦头像管理**：将 Agent 和 User Profile 的头像管理从全局 `assets` 系统中完全剥离。
3.  **简化数据操作**：确保删除 Agent 时，其专属目录及所有内容能被原子化地彻底清除。
4.  **兼容性与灵活性**：提供两种头像设置模式，既支持新的独立上传，也兼容原有的任意路径输入。

## 3. 目录结构演进

#### 当前结构 (Before)

```
%APPDATA%/com.aio.hub/
└── llm-chat/
    ├── agents/
    │   ├── {agent_id_1}.json
    │   └── {agent_id_2}.json
    └── agents-index.json
```

#### 目标结构 (After)

```
%APPDATA%/com.aio.hub/
└── llm-chat/
    ├── agents/
    │   ├── {agent_id_1}/          # <-- 从文件变为目录
    │   │   ├── agent.json         # <-- 配置文件移入目录内
    │   │   └── avatar.png         # <-- 头像等资源存放在此 (固定文件名)
    │   └── {agent_id_2}/
    │       ├── agent.json
    │       └── avatar.webp
    └── agents-index.json        # <-- 索引文件保持不变
```
*类似的结构也将应用于 User Profile。*

## 4. 实施步骤

### 第一阶段：后端能力确认与补充 (Rust)

在 `src-tauri/src/commands/file_operations.rs` 中，我们需要以下命令：

1.  **`read_app_data_file_binary(relative_path: String) -> Vec<u8>` (需新增)**:
    -   **目的**: 安全地读取应用数据目录下的任意二进制文件（如头像）。
    -   **实现**: 接收一个相对路径，与 `app_data_dir()` 拼接成完整路径后，读取文件内容。
2.  **`delete_directory_in_app_data(relative_path: String)` (需新增)**:
    -   **目的**: 在删除 Agent/Profile 时，将其整个专属目录移入回收站。
    -   **实现**: 接收相对路径，拼接完整路径后，使用 `trash::delete` 进行操作。
3.  **`copy_file_to_app_data(...)` (复用现有)**: 用于上传新头像。
4.  **`writeTextFile`, `readTextFile`, `readDir`, `mkdir` (复用 Tauri API)**: 用于读写 `agent.json` 和管理目录。

### 第二阶段：前端数据层升级 (`useAgentStorageSeparated.ts`)

1.  **路径逻辑修改**:
    -   `getAgentPath` 函数重命名为 `getAgentDirPath`，返回 `.../agents/{id}/` 目录路径。
    -   所有读写操作都将基于这个目录路径进行，例如读取 `.../{id}/agent.json`。
2.  **目录扫描与同步**:
    -   `scanAgentDirectory` 函数的逻辑从扫描 `.json` 文件改为扫描 `agents/` 目录下的**子目录**。每个子目录名即为一个 `agentId`。
    -   `syncIndex` 逻辑保持不变，但其输入源变为目录列表。
3.  **CRUD 操作调整**:
    -   `saveAgent`: 在写入 `agent.json` 前，需确保 `{id}` 目录存在 (`mkdir -p`)。
    -   `deleteAgent`: 调用后端新增的 `delete_directory_in_app_data` 命令来删除整个 Agent 目录。

### 第三阶段：UI 组件核心改造

#### 1. `IconEditor.vue` 组件改造

*   **新增 `mode` 属性**: 可选值为 `'path'` | `'upload'`。
*   **`mode='path'` (默认行为)**:
    -   完全保留现有的所有逻辑：输入框、预设图标选择、上传按钮（调用 `assetManager`）。
    -   `icon` 字段存储用户输入的完整路径。
*   **`mode='upload'` (新增功能)**:
    -   **隐藏**输入框和预设图标选择器。
    -   **只显示**头像预览和上传按钮。
    -   上传按钮调用新的、与 `assets` 解耦的逻辑，将文件保存到 `llm-chat/agents/{id}/avatar.png` (固定文件名)。
    -   上传成功后，`v-model` (即 `icon` 字段) 会被设置为**标准化的相对文件名**，例如 `'avatar.png'`。
    
    #### 2. 调用方 (Parent Component) 负责路径解析
    
    *   任何需要展示头像的父组件（如 `ChatArea.vue`、`AgentsSidebar.vue`）将负责**解析路径**。
    *   它会读取 `agent.icon` 字段。
    *   通过一个计算属性（`computed`）或一个 `Composable` 函数来生成最终的 `src`：
        -   **如果 `icon` 是一个完整路径**（以 `http://`, `https://`, `appdata://` 开头）或表情符号，则直接使用。
        -   **如果 `icon` 只是一个文件名**（如 `'avatar.png'`），则说明它是一个内聚的资源。此时，调用方会根据自身的上下文（`agent.id`）拼接出完整的 `appdata://` 路径：`appdata://llm-chat/agents/${agent.id}/${icon}`。
    *   这个**最终计算出的完整路径**才被传递给 `Avatar.vue` 的 `src` prop。
    
    #### 3. `Avatar.vue` 组件回归纯粹
    
    *   回归为一个**纯粹的展示组件**。
    *   它只接收一个完整的 `src` prop，并根据其协议（`http`, `appdata`, `emoji` 等）来渲染图像。
    *   它**不再需要**任何关于“上传模式”的判断逻辑，也不再需要关心 Agent ID 或上下文。
    
    #### 4. `EditAgentDialog.vue` 适配

*   在**编辑模式**下，向 `IconEditor` 传入 `mode='upload'` 和 `agentId`。
*   在**创建模式**下，由于没有 `agentId`，无法确定上传位置，依然传入 `mode='path'`，并修改提示文案：“创建后可在编辑页面为智能体上传专属头像”。

### 第四阶段：数据迁移

- 检测index中的版本是否是1.0.0
- 如果是就执行迁移方法
- 迁移完成后将版本改造2.0.0