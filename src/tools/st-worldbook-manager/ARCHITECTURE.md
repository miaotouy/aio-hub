# ST 世界书管理器架构文档 (ST Worldbook Manager)

## 概述

ST 世界书管理器（`st-worldbook-manager`）是一个完全自治、独立的工具模块，用于管理和编辑 SillyTavern 格式的世界书（Worldbook）。
该模块最初作为 `llm-chat` 的子模块存在，现已完全剥离解耦，成为平级工具。`llm-chat` 和 `user-profile` 等模块通过单向依赖引用该工具提供的组件、Store 和类型定义。

## 目录结构

```
st-worldbook-manager/
├── st-worldbook-manager.registry.ts   # 工具注册文件
├── StWorldbookManager.vue             # 主入口组件（独立窗口/内嵌面板）
├── ARCHITECTURE.md                    # 本文件
├── components/                        # 世界书相关 UI 组件
│   ├── WorldbookDetail.vue            # 世界书详情编辑组件
│   ├── WorldbookFullManager.vue       # 完整管理器（含侧边栏和详情）
│   ├── WorldbookManager.vue           # 简易管理器
│   ├── WorldbookManagerDialog.vue     # 管理器弹窗
│   ├── WorldbookOverview.vue          # 世界书概览卡片
│   └── WorldbookSelector.vue          # 世界书下拉选择器
├── composables/
│   └── storage/
│       └── useWorldbookStorage.ts     # 存储层（支持冷启动自动迁移）
├── services/
│   ├── worldbookExportService.ts      # 导出服务
│   └── worldbookImportService.ts      # 导入服务
├── stores/
│   └── worldbookStore.ts              # Pinia 状态管理（Store ID: stWorldbookManager）
└── types/
    └── worldbook.ts                   # 世界书强类型定义
```

## 设计原理

### 1. 完全自治与单向依赖

世界书管理器不再依赖 `llm-chat` 模块的任何内容。它拥有完整的数据流闭环：

- **存储层**：通过 `useWorldbookStorage` 读写本地 JSON 文件。
- **状态层**：通过 `worldbookStore` 管理内存状态，并支持跨窗口同步。
- **业务层**：提供导入（`worldbookImportService`）和导出（`worldbookExportService`）能力。
- **UI 层**：提供从原子选择器（`WorldbookSelector`）到完整管理面板（`WorldbookFullManager`）的多层级组件。

其他模块（如 `llm-chat`）如果需要使用世界书，只需单向导入 `@/tools/st-worldbook-manager` 下的资源。

### 2. 冷启动自动迁移 (Data Migration Pipeline)

为了确保老用户升级后数据不丢失，我们在 `useWorldbookStorage` 中设计了冷启动自动迁移管道：

- 当工具首次加载（`worldbookStore` 初始化）时，会检测新存储路径 `{appConfigDir}/st-worldbook-manager/worldbooks/` 是否存在数据。
- 如果新路径为空，且旧路径 `{appConfigDir}/llm-chat/worldbooks/` 存在数据，则会自动将旧路径下的所有世界书文件安全复制到新路径下。
- 迁移完成后，新工具将完全基于新路径运行，实现无缝过渡。

### 3. 跨窗口状态同步

由于世界书支持在独立窗口中打开，我们利用了项目的窗口同步机制。在 `worldbookStore` 初始化时，会调用 `initializeSync()`，确保主窗口和分离窗口之间的世界书增删改操作能够实时同步。

## 依赖关系

- **被依赖项**：
  - `@/utils/configManager`：配置管理
  - `@/utils/errorHandler`：模块化错误处理
  - `@/utils/logger`：模块化日志系统
- **依赖它的模块**：
  - `llm-chat`：用于在角色卡编辑、上下文组装、消息渲染中关联和触发世界书。
  - `user-profile`：用于在用户档案中关联全局世界书。
