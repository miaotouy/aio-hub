# Knowledge 资料库产品与交互设计

- **状态**：第一阶段已实现，目录同步阶段待施工
- **创建日期**：2026-07-17
- **最近修订**：2026-07-18
- **适用范围**：`src/tools/knowledge-base/`、`src-tauri/src/knowledge/`

## 1. 目标

Knowledge 资料库把本地文档转换为可检索、可引用、可维护的资料来源。产品必须同时回答四个问题：

1. 当前库包含哪些来源文档。
2. 实际进入索引的分块是什么。
3. 关键词索引与语义索引是否可用。
4. 一次检索为什么命中这些结果，结果来自哪里。

Knowledge 与 Recall 的差异是数据形态和索引生命周期，不是冷热层级或 Agent 所有权。Knowledge 不复制 TagMemo、标签海、priority、梦系统或 Recall entry。

## 2. VCPToolBox 对照

本方案对照 `E:/rc20/vcp/VCPToolBox` 的 `TDBKnowledge.js`、`KnowledgeBaseManager.js`、`modules/knowledgeBase/` 和 AdminPanel 管理界面。

| VCP 设计               | AIO 采用方式                                                   | 当前状态 |
| ---------------------- | -------------------------------------------------------------- | -------- |
| 文件与派生索引分离     | document/source 是真源，chunk、FTS、vector、graph 是可重建资产 | 已实现   |
| checksum 增量摄取      | `sourcePath` 稳定定位，内容变化时事务替换派生资产              | 已实现   |
| 每库独立索引           | 每个 library 使用独立 `.kdb`，manifest 只保存库元数据          | 已实现   |
| 关键词与向量双通道     | BM25 始终可用；vector 完成后开放 semantic/hybrid               | 已实现   |
| 管理界面展示运行态     | 展示文档数、分块数、当前模型、维度和向量覆盖                   | 已实现   |
| 批处理失败隔离         | 单文件解析或入库失败不回滚其他成功文件                         | 已实现   |
| watcher 文件稳定性检查 | 目录同步时避免读取仍在写入的文件                               | 待实现   |
| 持久化 ingest queue    | pending/processing/failed、lease 恢复、有限重试                | 待实现   |
| TriviumDB              | 只保留 repository 适配可能性，不进入当前运行路径               | 暂不采用 |
| TagMemo / 语义组       | 属于 Recall 或实验层，不进入 Knowledge schema                  | 不采用   |

VCP 的关键启发是“索引生命周期可观测”，不是把所有 RAG 算法堆入一个界面。AIO 只借鉴可恢复摄取和运维契约。

## 3. 信息架构

```text
资料库侧栏
  新建资料库
  筛选资料库
  资料库列表

当前资料库
  标题、说明、文档数、分块数、索引状态
  导入文档
  语义索引
  更多：重建分块、删除资料库

  文档模式
    文档筛选
    文档列表 -> 文档详情 -> 实际分块

  检索测试模式
    查询、策略
    结果列表 -> 结果详情 -> 来源与命中信号
```

文档管理和检索调试是两个不同任务，不再同时挤在固定三栏中。两种模式内部都采用 master-detail，保证列表扫描效率和详情上下文连续性。

## 4. 核心交互

### 4.1 创建资料库

- 侧栏内联展开名称和用途说明，不弹出阻断式对话框。
- 创建成功后自动选中新库。
- 空工作台只提供一个明确入口。

### 4.2 导入文档

```text
选择多个文件
  -> 逐文件解析，显示 n/total
  -> 成功文件逐个入库，显示 n/total
  -> 刷新 document/chunk/index status
  -> 汇总失败项，成功项不回滚
```

- PDF、DOCX、HTML 和纯文本使用各自解析器。
- 重复 `sourcePath` 表示更新同一文档。
- 一个文件失败不应中断批次。
- 第一阶段允许用户重新选择失败文件重试；持久队列阶段再提供任务检查器。

### 4.3 文档与分块

- 文档列表按标题与来源路径筛选。
- 选择文档后读取实际 chunk，而不是展示原文件的假预览。
- 分块详情显示 heading、chunk index 和完整文本，用于解释检索输入。
- 删除文档需要确认，并同步清理 FTS、vector 和 graph edge。

### 4.4 语义索引

- “语义索引”对话框展示当前覆盖率和可选 Embedding 模型。
- 目标设计将“调用渠道”与“向量空间”分离，详见 [模型身份与 Embedding 空间设计](../../../../../docs/design/model-identity-and-embedding-space-design.md)。`profileId:modelId` 只定位调用渠道；向量按包含 canonical model、版本、维度和任务契约的 `spaceId` 隔离。同空间手工切换渠道不重建，不同空间切换才需要确认并重新计算覆盖率。当前代码仍使用组合键，等待空间 schema 迁移。
- 进度使用已写入 chunk 数，不使用无法校验的估算时间。
- 失败后已提交批次保留，再次构建可覆盖写入并完成剩余覆盖。
- 关键词索引始终独立可用。

### 4.5 检索测试

- 无语义向量时只开放 `auto` 与 `keyword`；`auto` 会退化为 BM25。
- 有可用向量后开放 `semantic` 与 `hybrid`。
- 结果列表用于比较候选，详情用于阅读完整 chunk 与来源。
- signal 显示“关键词、向量、相邻扩展”，score 显示原始值，不显示伪精确百分比。
- “查看文档”切回文档模式并定位对应来源。

### 4.6 重建

重建只用于重新切片和修复派生索引。确认文案必须说明语义向量会被清除，完成后用户需要重新构建语义索引。

## 5. 状态与错误

| 场景           | UI 状态                  | 恢复动作             |
| -------------- | ------------------------ | -------------------- |
| 初始化         | 与最终布局一致的加载遮罩 | 自动完成             |
| 文档/分块读取  | 列表骨架                 | 重新选择或刷新       |
| 空资料库       | 导入入口                 | 选择文档             |
| 仅关键词索引   | “关键词索引可用”         | 可选构建语义索引     |
| 部分向量覆盖   | 显示 `vectorized/total`  | 继续构建             |
| 完整向量覆盖   | 显示模型维度与就绪状态   | 可重新构建或切换模型 |
| 单文件导入失败 | 批次完成后汇总           | 重新选择失败文件     |
| 检索无结果     | 保留查询与策略           | 修改查询或策略       |

## 6. 下一阶段：目录同步

目录同步必须同时落 watcher 和 ingest queue，不能只加一个文件监听器：

```text
SourceRoot
  -> watcher debounce + stability check
  -> persistent ingest_queue
  -> parser worker
  -> document transaction
  -> optional embedding worker
  -> index status / failure inspector
```

队列最小字段：`id`、`libraryId`、`action`、`sourcePath`、`status`、`priority`、`retryCount`、`lastError`、`lockedAt`、`nextAttemptAt`、`createdAt`、`updatedAt`。应用异常退出后，超出 lease 的 processing 任务恢复为 pending。

## 7. 验收标准

- 创建、切换、删除资料库时列表和详情状态一致。
- 一批文件包含成功与失败项时，成功文档保留，失败数量明确。
- 文档更新后旧 chunk、FTS、vector 与 graph edge 不残留。
- 语义索引进度与数据库覆盖数量一致。
- 切换模型后 semantic/hybrid 只使用当前模型和维度的向量。
- 重建后覆盖率归零，keyword 仍可检索。
- 检索结果能定位到 library、document、source path、heading 与 chunk index。
- `build:tsc`、相关测试、`check:backend` 和 Vite build 通过。
- 最终发布前在隔离 appData 的 Tauri WebView 中完成真实文件导入与模型调用验收。
