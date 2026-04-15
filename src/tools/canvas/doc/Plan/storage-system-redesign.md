# 画布存储架构重构方案

> **状态**: RFC (Request for Comments)  
> **日期**: 2025-04-15  
> **影响范围**: `src/tools/canvas/` 存储层、Store 层、初始化流程

---

## 一、 现状与问题

目前画布项目直接存储在 `AppData/canvases/{id}` 目录下，存在以下问题：

1. **加载性能**：每次启动需遍历磁盘目录并读取每个项目的 `.canvas.json`。
2. **状态不一致**：
   - **僵尸项目**：前端删除失败或手动移动目录导致的索引残留（目前无索引，仅表现为读取失败）。
   - **残留目录**：创建失败或后端删除失败导致的孤儿目录，占用空间且无法管理。
3. **结构混乱**：项目与未来规划的模板目录混杂，缺乏清晰的命名空间。

## 二、 目标设计

### 2.0 ID 生成策略改进 (New)

为了提高文件系统的辨识度和管理效率，弃用纯随机 ID，改用语义化 ID：

- **格式**: `cp_{yyyyMMdd}_{short_id}`
- **示例**: `cp_20240415_x7r2p9`
- **优点**: 目录排序自然按时间排列，且一眼能看出项目创建时间。

### 2.1 目录结构标准化

重构后的 `AppData/canvases/` 目录结构：

```
AppData/canvases/
├── projects/               # 用户画布项目存储区
│   ├── {id_1}/             # 项目目录
│   └── ...
├── templates/              # 模板存储区（由模板系统重设计方案管理）
└── projects.json           # 全局项目索引文件
```

### 2.2 索引文件 (`projects.json`)

维护一份轻量级的项目快照，用于快速渲染列表：

```typescript
interface CanvasIndex {
  version: string;
  projects: {
    id: string;
    name: string;
    updatedAt: number;
    relPath: string; // 相对于 projects/ 目录
  }[];
}
```

### 2.3 健康检查与修复机制 (Health Check & Repair)

在 `loadCanvasList` 时进行双向校验，并提供相应的修复策略：

| 状态        | 定义                              | UI 处理      | 修复动作                                |
| :---------- | :-------------------------------- | :----------- | :-------------------------------------- |
| `healthy`   | 索引与磁盘目录均存在且完整        | 正常展示     | -                                       |
| `missing`   | 索引有记录，但磁盘目录丢失        | 标记“异常”   | 提供“移除索引”选项                      |
| `unindexed` | 磁盘有完整目录，但索引无记录      | 标记“未识别” | 读取 `.canvas.json` 重新加入索引        |
| `corrupted` | 磁盘有目录，但缺少 `.canvas.json` | 标记“损坏”   | 利用索引快照数据重新生成 `.canvas.json` |

## 三、 实施计划

> **注意**: 鉴于功能尚未发布，本项目暂不考虑旧数据的自动迁移逻辑，采取直接切换新结构的策略。

### Phase 1: 基础设施

1. 新增 `src/tools/canvas/utils/id.ts` 实现 `generateCanvasId()` (格式: `cp_{yyyyMMdd}_{nanoid(6)}`)。
2. 新增 `src/tools/canvas/types/storage.ts` 定义索引类型。
3. 封装 `CanvasIndexManager`：
   - 负责 `projects.json` 的原子化读写。
   - 明确 Workbench 为唯一操作主体，其他辅助窗口（如预览窗）不接触索引文件。
4. 改造 `useCanvasStorage.ts`：
   - 路径逻辑收口至 `resolveProjectPath(id)`，指向 `projects/` 子目录。
   - 移除基于 `readDir` 的全量扫描逻辑。

### Phase 2: Store 逻辑重构

1. 修改 `canvasStore.ts` 的 `loadCanvasList`：
   - 优先加载索引文件。
   - 触发异步健康扫描对比物理目录。
2. 完善 Action 流程：
   - `createCanvas`: 先确保磁盘目录和初始文件写入成功，再更新索引。
   - `deleteCanvas`: 先执行磁盘安全删除（进回收站），成功后移除索引记录。
3. 增加修复 Action：`repairProject(id, action: 'delete' | 'reindex' | 'remove_index' | 'restore_metadata')`。

### Phase 3: UI 适配

1. 在 `CanvasProjectCard` 中增加异常状态的视觉反馈。
2. 增加“扫描并清理”管理界面。

## 四、 风险评估

- **索引同步**：多窗口环境下索引文件的并发写入导致数据丢失。
  - _对策_：采用单点写入模式，仅 Workbench 负责维护 `projects.json`。预览窗口仅通过启动参数或 IPC 获取特定项目的 `canvasId`，直接访问其物理目录，无需感知索引。
- **磁盘与索引不一致**：操作中断导致只有一半成功。
  - _对策_：遵循“磁盘先行”原则，并依靠启动时的健康检查机制自动发现并引导用户修复。
