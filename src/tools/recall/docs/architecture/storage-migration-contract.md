# Recall 存储、备份与迁移契约

本文记录 Recall 当前稳定的数据所有权、备份兼容和旧目录迁移约束，不维护数据库选型过程、施工阶段或已完成的测试日志。现行模块结构见 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)，未完成的发布门禁见 [`../Plan/recall-retrieval-pipeline-modularization-plan.md`](../Plan/recall-retrieval-pipeline-modularization-plan.md)。

## 数据真源与派生资产

- `appData/recall/recall.db` 是 Recall 唯一不可丢的源数据真源，保存集合、条目、内容 hash、活动模型身份和稳定配置。
- `appData/recall/recall-vectors.db` 保存条目向量、模型统计和标签向量。它是可重建的派生资产库，不得反向成为集合、条目或用户配置的唯一依据。
- `InMemoryDatabase`、倒排索引、向量矩阵、tag pool HNSW、`refs/refBy` 和检索缓存都是派生读模型。启动时从 repository warmup，不能作为导出或迁移的数据真源。
- 删除或损坏 `recall-vectors.db` 后，应用仍须能启动、浏览和编辑条目、执行关键词检索，并把相关向量状态显示为待重建。
- Recall 主库与向量库独立维护 schema migration，不声明跨库外键或跨库强事务。向量库的算法演进不能阻塞主库源内容读取。
- 前端 workspace 只保存 UI 配置与轻量偏好；集合列表、统计和数据库路径不在前端形成第二份真源。

## 写入与状态一致性

- 条目写入顺序是主库短事务提交、同步内存读模型、幂等清理失效向量、失效检索缓存并发出监控事件。主库提交失败时不得修改内存或提前清理缓存。
- 内容 hash 变化后，旧向量即使未成功删除，也必须因 hash 不匹配而派生为未就绪；`vectorStatus` 和 `vectorizedModels` 不以冗余布尔字段作为真源。
- 批量条目和向量写入必须使用批量事务，不能逐条提交。删除路径必须清理 meta、倒排索引和向量矩阵，即使完整条目尚未加载。
- 数据库保存原始模型 ID；文件时代的 safe model ID 只允许在 legacy importer 中反查。
- `createdAt`、`updatedAt`、priority、enabled、带权标签和 AssetRef 属于源字段。查询期时间衰减、标签增强、分数和 trace 不回写条目。

## 备份格式与内容

| 类型        | 格式与版本                                                                 | 主数据文件                                  | 写入策略     |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| 单集合      | `aiohub.recall-collection@1`，data/config schema 均为 v1                   | `collection.json`                           | 当前版本写入 |
| 多集合      | `aiohub.recall-collection-backup-collection@1`，data/config schema 均为 v1 | `collections/` 下各集合的 `collection.json` | 当前版本写入 |
| 旧单库      | `aiohub.knowledge-library@1` `.aio-kb`                                     | `library.json`                              | 只读兼容     |
| 旧多库      | `aiohub.knowledge-library-backup-collection@1` ZIP                         | 各旧库的 `library.json`                     | 只读兼容     |
| Legacy 内容 | `KnowledgeBase { meta, entries }` JSON/YAML                                | 单文件                                      | 只读内容恢复 |

- 新备份包含集合元数据、完整条目和实际引用资产，并记录文件大小、hash、缺失资产与恢复告警。
- 向量、tag pool、HNSW、运行时索引、检索缓存、trace、Agent binding、占位符、工具权限和聊天记录不进入集合备份；恢复后重建派生资产。
- 读取端必须按 `format + formatVersion + dataSchemaVersion + configSchemaVersion` 严格分派，不能猜测未知版本。Legacy JSON/YAML 不含资产二进制，报告只能声明内容恢复。
- 包内路径必须是规范化相对路径；拒绝绝对路径、`..`、符号链接、重复 ID、checksum 错误和超出文件数、单文件大小、总解压大小或压缩比上限的输入。
- Rust 负责 ZIP、hash、资源限制、staging、冲突提交和结构化报告；前端只负责文件选择、冲突决策、进度和结果展示。

## 导入、导出与冲突

- 导出从 repository 读取完整源数据，写入临时文件并在 ZIP 可重新打开、manifest 与 hash 复核通过后原子提交；不能复制尚未完成 warmup 的内存 entries。
- 导入先检查格式、数量、大小、hash 和路径，再解析专用 DTO、恢复或按 hash 复用资产，最后以单集合事务提交 repository。失败时清理本次 staging 和未被其他来源使用的新资产。
- 无 ID 冲突时保留集合和条目 ID。存在集合 ID 冲突时，默认导入副本；替换必须显式选择并确认，v1 不做字段级合并。
- 多集合包中的每个集合是独立原子单元；单个集合失败不回滚其他成功集合，但最终报告必须列出成功、跳过、失败和取消状态。
- 旧 `.aio-kb` 默认恢复到 Recall。只有用户明确确认旧内容应作为传统文档资料时，才转换到 Knowledge；转换不携带标签、priority、enabled、条目关联或附件语义，失败时回滚本次新建资料库。

## 旧目录自动迁移

- 自动迁移源为旧 `appData/knowledge/bases`、`vectors` 和 `tag_pool`；正式备份包通过备份恢复入口处理，不与旧目录扫描混为同一职责。
- 导入以源指纹和版本化 source ID 保证幂等。旧集合和条目 ID 原样保留；缺失时间字段才使用迁移时刻并记录问题。
- 主库和向量库分别记录迁移状态。主库未完整成功时阻止 Recall 进入可写态；向量迁移失败可以保留已迁移源内容并降级为待重建。
- 损坏 JSON、模型 ID 无法反查、维度不一致和 hash 不匹配必须进入问题报告。有效集合和条目可继续迁移，但不能把损坏向量标记为 ready。
- 旧目录迁移后保持只读且不自动删除。显式清理前必须重新校验源指纹，并同时满足主库完成、向量库完成、待重建向量为零且问题列表为空。
- 恢复前必须退出应用并备份 `recall.db` 与 `recall-vectors.db`；不得手工合并 SQLite 文件。

## 迁移报告契约

Recall 旧目录报告至少包含：

```text
sourcePath / legacyDataPath / sourceFingerprint
mainStatus / vectorStatus
sourceCollections / migratedCollections
sourceEntries / migratedEntries / skippedEntries
sourceVectorModels / migratedVectorModels
sourceVectors / migratedVectors / pendingVectors
tagVectorCount
issues[]
recoveryInstructions[]
```

报告状态必须能区分未开始、运行中、完成、部分成功和需重建，不得以一条成功消息掩盖向量降级或跳过项。报告和日志不得包含条目正文、资产内容、API Key 或完整向量。

发布收口时，在 Recall 报告之外汇总 Agent migration 结果，至少核对 Recall binding、Knowledge 授权、旧权限 key 和旧占位符统计。该合并报告是发布证据，不改变 `RecallMigrationReport` 的运行时所有权，也不能用固定样例数字代替真实统计。

