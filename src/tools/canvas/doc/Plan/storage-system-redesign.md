# 画布存储架构重构方案

> **状态**: Done (已完成核心重构)
> **日期**: 2025-04-15  
> **影响范围**: `src/tools/canvas/` 存储层、Store 层、初始化流程

---

## 一、 现状分析

根据对 [`useCanvasStorage.ts`](src/tools/canvas/composables/useCanvasStorage.ts) 和 [`canvasStore.ts`](src/tools/canvas/stores/canvasStore.ts) 的调查，当前存储系统存在以下具体问题：

1.  **路径硬编码与平铺结构**:
    - [`useCanvasStorage.ts:18`](src/tools/canvas/composables/useCanvasStorage.ts:18) 的 `getCanvasBasePath` 直接拼接 `canvases/{canvasId}`。
    - [`deleteCanvas`](src/tools/canvas/composables/useCanvasStorage.ts:174) 硬编码了 `canvases/${canvasId}`。
    - 这种结构导致用户项目与未来可能存在的 `templates/` 目录混杂。
2.  **加载性能 O(N)**:
    - [`listAllCanvases`](src/tools/canvas/composables/useCanvasStorage.ts:139) 使用 `readDir` 遍历根目录并逐个读取 `.canvas.json`，在项目较多时会产生明显的 IO 延迟。
3.  **ID 语义化缺失**:
    - [`canvasStore.ts:151`](src/tools/canvas/stores/canvasStore.ts:151) 使用 `nanoid()` 生成纯随机 ID，无法从文件名判断创建时间或进行自然排序。
4.  **缺乏一致性校验**:
    - [`loadCanvasList`](src/tools/canvas/stores/canvasStore.ts:105) 没有任何健康检查逻辑，无法处理“有索引无目录”或“有目录无索引”的情况。

## 二、 目标设计

### 2.1 ID 生成策略 (New)

弃用纯随机 ID，改用 **时间戳 + 短随机码**。

- **格式**: `cp_{yyyyMMdd}_{short_id}`
- **实现**: 使用 `date-fns` 的 `format` 和 `nanoid(6)`。
- **优点**: 磁盘目录天然按日期排序，易于手动维护和排查问题。

### 2.2 目录结构标准化

```
AppData/canvases/
├── projects/               # 用户项目 (ID 为 cp_20250415_xxxx)
│   └── {id}/
│       ├── .canvas.json    # 项目元数据
│       └── ...             # 项目文件
├── templates/              # 预设模板
└── projects.json           # 全局索引文件 (快照)
```

### 2.3 全局索引 (`projects.json`)

```typescript
export interface CanvasIndexItem {
  id: string;
  name: string;
  updatedAt: number;
  relPath: string; // "projects/cp_xxx"
}

export interface CanvasIndex {
  version: string;
  lastUpdated: number;
  projects: CanvasIndexItem[];
}
```

### 2.4 健康检查与修复矩阵

| 状态          | 表现                 | 修复动作 (`repairProject`)                              |
| :------------ | :------------------- | :------------------------------------------------------ |
| **Healthy**   | 索引与磁盘对齐       | 无                                                      |
| **Missing**   | 索引有，磁盘无       | `remove_index`: 移除孤儿索引记录                        |
| **Unindexed** | 磁盘有，索引无       | `reindex`: 读取物理 `.canvas.json` 补全索引             |
| **Corrupted** | 磁盘有，但元数据损毁 | `restore_metadata`: 利用索引快照尝试恢复 `.canvas.json` |

## 三、 详细实施计划

> **注意**: 鉴于功能尚未发布，本项目暂不考虑旧数据的自动迁移逻辑，采取直接切换新结构的策略。

### Phase 1: 基础设施改造

1.  **ID 工具**: 创建 `src/tools/canvas/utils/id.ts`。
2.  **索引管理器**: 创建 `src/tools/canvas/services/CanvasIndexManager.ts`。
    - 实现原子化写入（先写 `.tmp` 文件再 `rename`）。
    - 仅由 Workbench 进程负责维护，预览窗仅读不写。
3.  **Storage 层适配**:
    - 修改 `useCanvasStorage.ts`：
      - `getCanvasBasePath`: 改为返回 `canvases/projects/{id}`。
      - `deleteCanvas`: 更新相对路径逻辑。
      - 新增 `listIndexedProjects`: 直接读取 `projects.json`。

### Phase 2: Store 逻辑重构

1.  **类型扩展**:
    - [`CanvasListItem`](src/tools/canvas/types/index.ts:19) 增加 `health: 'healthy' | 'missing' | 'unindexed' | 'corrupted'` 字段。
2.  **加载流程改造**:
    - `loadCanvasList`:
      1. 首先从 `CanvasIndexManager` 加载快照。
      2. 启动异步扫描任务（对比磁盘 `projects/` 目录）。
      3. 更新列表中的 `health` 状态。
3.  **Action 原子化**:
    - `createCanvas`: 磁盘写入成功后，必须同步调用 `IndexManager.addProject`。
    - `deleteCanvas`: 磁盘删除成功后，同步调用 `IndexManager.removeProject`。

### Phase 3: UI 增强

1.  **CanvasProjectCard**:
    - 针对非 `healthy` 状态显示黄色/红色警告图标。
    - 点击警告图标弹出修复菜单。
2.  **管理工具**:
    - 在项目列表顶部增加“深度扫描”按钮，手动触发全量健康检查。

## 四、 风险评估

- **索引同步**：多窗口环境下索引文件的并发写入导致数据丢失。
  - _对策_：采用单点写入模式，仅 Workbench 负责维护 `projects.json`。预览窗口仅通过启动参数或 IPC 获取特定项目的 `canvasId`，直接访问其物理目录，无需感知索引。
- **磁盘与索引不一致**：操作中断导致只有一半成功。
  - _对策_：遵循“磁盘先行”原则，并依靠启动时的健康检查机制自动发现并引导用户修复。
