# 知识库迁移方式重构方案：基于 Guided Flow 的分步迁移

> 状态：Phase 0–3 已实现；正式旧数据与真实 Tauri 发布验收待补
>
> 日期：2026-07-25
>
> 关联计划：[Guided Flow 引导模块实施与验收计划](../../../../../docs/Plan/guided-flow-plan.md)
>
> 适用范围：旧知识库/Recall 文件目录迁移、新知识库模块重构后的首次升级迁移

## 1. 背景

知识库模块正在进行较大重构，涉及数据结构、模块入口和产品语义变化。新版可能需要将旧“知识库”数据迁移到新的 Recall/Knowledge 结构，且部分迁移是不可逆的。

当前 Recall 底层已经具备部分迁移能力：

- `schema_migrations` 管理 SQLite schema 版本；
- `legacy_import_state` 保存旧目录迁移状态；
- 迁移通过 source fingerprint 识别来源；
- 主数据和向量数据分别记录状态；
- 迁移报告包含数量、问题和恢复建议；
- 旧目录清理有独立的确认命令。

重构前 `RecallState::initialize()` 在发现旧目录后会直接调用导入逻辑。当前实现已经拆开“发现旧数据”和“执行迁移”：启动阶段只初始化新存储并记录旧来源，实际导入只允许在 Guided Flow 中经用户明确确认后调用 `recall_run_legacy_migration`。

本方案将其重构为基于 Guided Flow 的用户确认式迁移：

```text
只读检测 → 迁移预览 → 备份确认 → 用户确认 → 执行迁移 → 校验报告 → 可选清理
```

## 2. 目标与非目标

### 2.1 目标

- 启动阶段只检测，不执行不可逆迁移；
- 让用户知道旧数据规模、目标位置、保留和丢失的语义；
- 迁移可延后、可恢复、可重试；
- 使用迁移 ID 和 source fingerprint 保证幂等；
- 主数据、向量、索引重建和清理状态分别可见；
- 迁移完成后保留旧数据，清理作为独立操作；
- 将迁移过程接入统一 Guided Flow，同时可从版本升级中心、关于页和知识库模块入口打开。

### 2.2 非目标

- 本方案不改变 Recall 和 Knowledge 的领域边界；
- 不把旧 `.aio-kb` 备份恢复、用户主动导入和版本升级迁移混成同一流程；
- 不在前端复制领域数据或实现迁移算法；
- 不承诺所有历史格式都可以自动转换；
- 不在第一阶段实现自动删除旧目录；
- 不以应用版本号单独作为迁移完成标记。

## 3. 当前实现与问题定位

相关实现：

- `src-tauri/src/recall/state.rs`：Recall 初始化和旧目录导入触发点；
- `src-tauri/src/recall/storage/legacy_import.rs`：旧文件目录扫描、导入、报告和清理；
- `src-tauri/src/recall/storage/migrations.rs`：SQLite schema migration；
- `src-tauri/src/recall/commands/migration.rs`：迁移检查和旧目录清理命令；
- `src/tools/recall/docs/architecture/storage-migration-contract.md`：存储与迁移契约；
- `src/tools/knowledge-base/ARCHITECTURE.md`：Knowledge 存储和领域边界。

必须明确区分两类迁移：

| 类型                    | 当前/目标责任              | 是否应在启动时自动执行   |
| ----------------------- | -------------------------- | ------------------------ |
| SQLite schema migration | 数据库存储层               | 可以自动执行，但必须幂等 |
| 旧用户数据迁移          | 领域迁移服务 + Guided Flow | 不应自动执行             |

SQLite schema migration 是为了让数据库可读写，属于存储初始化；旧知识库转换会改变用户数据语义，属于用户需要知情和确认的业务迁移。

## 4. 目标用户流程

### 4.1 启动时发现迁移

应用启动完成后执行只读检测。若发现旧来源，进入待处理状态，不调用真正的导入写入逻辑。

升级中心显示：

```text
AIO Hub 0.7.0

本版本包含知识库模块重构。
检测到旧知识库数据，需要迁移后才能在新的模块结构中继续使用。

旧知识库：12 个
内容条目：1286 条
向量数据：3421 条

[查看迁移方案] [稍后处理]
```

版本说明和迁移存在关联时，合并在同一 Guided Flow 中，不连续弹出多个独立弹窗。

### 4.2 迁移流程步骤

建议流程如下：

1. **本次版本变化**
   - 知识库模块为什么重构；
   - 入口、名称和数据组织方式发生了什么变化。
2. **检测结果**
   - 旧来源路径；
   - 集合、条目、向量和标签池数量；
   - 当前 source fingerprint；
   - 是否存在上一次未完成迁移。
3. **迁移方案**
   - 目标数据结构；
   - 保留字段；
   - 需要重建或无法保留的内容；
   - 迁移对 Recall/Knowledge 绑定的影响。
4. **备份和确认**
   - 提醒用户退出其他相关窗口；
   - 提醒备份目标数据库和旧目录；
   - 显示不可逆风险；
   - 要求用户明确确认“开始迁移”。
5. **执行迁移**
   - 显示集合、条目、向量和标签池的分阶段进度；
   - 支持取消，但取消语义由当前阶段决定；
   - 中断后保留结构化状态，不标记为成功。
6. **校验结果**
   - 比较源数据和目标数据数量；
   - 校验 ID、内容 hash、向量维度和模型关联；
   - 展示成功、跳过、待重建和问题数量。
7. **完成与后续操作**
   - 允许进入新模块；
   - 保留旧目录；
   - 提供查看报告和重新索引入口；
   - 将清理旧目录作为之后单独的操作。

没有待迁移数据时，不展示迁移步骤；已经完成且 source fingerprint 未变化时，显示已完成摘要，不再次执行。

## 5. 迁移状态和幂等规则

### 5.1 迁移身份

迁移身份由以下组合决定：

```text
migrationId + sourceFingerprint
```

建议本次迁移使用稳定 ID，例如：

```text
knowledge-to-recall-v2
```

不得用当前应用版本号直接作为迁移完成标记。因为：

- 同一个迁移可能跨多个应用版本修复；
- 开发版本可能反复启动；
- 用户可能手动升级、降级或使用便携版；
- 旧目录内容改变后应被识别为新的来源状态。

### 5.2 状态机

```text
not-detected
    │
    ▼
pending ── 用户关闭/稍后 ──► deferred
    │
    ▼
previewed
    │
    ├─ 用户拒绝 ───────────► deferred
    │
    ▼
confirmed
    │
    ▼
running
    ├─ 用户取消/进程中断 ───► interrupted
    ├─ 部分数据失败 ────────► partial
    ├─ 不可恢复错误 ────────► failed
    │
    ▼
verifying
    ├─ 校验失败 ────────────► failed
    │
    ▼
completed
    │
    └─ 独立清理确认 ───────► cleaned
```

实际持久化状态可以继续复用现有的 `pending / running / partial / completed / failed`，但前端 Guided Flow 需要能够区分“尚未确认”“用户暂缓”“执行中断”和“已完成待清理”。如果不扩展领域枚举，应至少将这些信息编码在迁移报告和流程状态中，而不是用 `completed` 或 `failed` 模糊表示。

### 5.3 关键不变量

- 同一 `migrationId + sourceFingerprint` 已完成且校验通过时，不再次导入；
- 迁移过程中不能把目标记录当作已完成记录；
- 主数据未完整成功时，不允许进入新的可写业务状态；
- 向量迁移不完整时，必须明确标记待重建，不能标记为 ready；
- source fingerprint 变化后，旧的完成状态不能直接套用；
- 清理前必须重新计算 fingerprint，并重新检查迁移报告；
- 迁移失败不能自动删除旧目录；
- 前端流程完成状态不能替代后端迁移状态。

## 6. 后端接口调整

### 6.1 保留并明确只读检测

现有 `recall_inspect_legacy_migration` 应保持只读职责：

```text
recall_inspect_legacy_migration
```

它应：

- 检测旧来源是否存在；
- 计算 source fingerprint；
- 读取已有迁移记录；
- 返回当前状态、数量和问题摘要；
- 不导入、不删除、不修改旧目录。

如果当前 `inspect()` 为了创建 schema 表而执行安全的数据库初始化，应在文档中明确这是存储初始化，不是用户数据迁移。

### 6.2 增加预览命令

建议新增：

```text
recall_preview_legacy_migration
```

预览可以复用检测结果，但需要返回更适合用户阅读的结构化 DTO：

```rust
#[serde(rename_all = "camelCase")]
pub struct RecallMigrationPreview {
    pub migration_id: String,
    pub source_fingerprint: String,
    pub source_path: String,
    pub target_description: String,
    pub source_collections: usize,
    pub source_entries: usize,
    pub source_vectors: usize,
    pub preserved_fields: Vec<String>,
    pub rebuilt_fields: Vec<String>,
    pub unsupported_fields: Vec<String>,
    pub warnings: Vec<String>,
    pub requires_backup: bool,
}
```

前端不能自行从文件读取并推断这些数据，预览必须由领域服务生成。

### 6.3 增加显式执行命令

建议新增：

```text
recall_run_legacy_migration
```

参数至少包含：

```rust
pub struct RecallMigrationConfirmation {
    pub migration_id: String,
    pub source_fingerprint: String,
    pub confirmed: bool,
}
```

后端执行前必须重新检查：

- `confirmed == true`；
- migration ID 匹配；
- source fingerprint 未变化；
- 当前状态允许执行；
- 目标数据库和旧目录路径仍在受管范围内；
- 没有其他迁移任务占用同一资源。

不能只相信前端几秒前拿到的预览。

### 6.4 进度和报告

长时间迁移应使用现有任务/事件能力或增加专用进度事件，至少包含：

```text
phase: main | vector | tag-pool | verify
current
 total
 completedCollections
 completedEntries
 pendingVectors
 issues
```

事件和日志不得包含条目正文、资产内容、API Key 或完整向量。

迁移结束后返回现有 `RecallMigrationReport` 或其扩展版本。前端只负责展示，不复制报告为新的事实来源。

### 6.5 保留清理命令，但提高约束

现有：

```text
recall_confirm_legacy_cleanup
```

继续作为独立的最后一步。执行前必须：

- 重新检测来源 fingerprint；
- 主数据和向量状态均满足清理条件；
- `pending_vectors == 0`；
- 没有未解决问题；
- 用户再次确认；
- 清理路径仍然位于受管旧数据根目录下。

迁移完成时不要自动调用该命令。

## 7. 启动链路重构

### 7.1 目标链路

```text
RecallState::initialize()
  ├─ 初始化 SQLite repository/schema
  ├─ 恢复新数据
  ├─ 只读检测旧数据状态
  └─ 暴露 repository 和待迁移状态

应用 ready
  ├─ GuidedFlowManager 查询待处理迁移
  ├─ 生成 knowledge-to-recall-v2 流程
  └─ 在用户确认后调用 recall_run_legacy_migration
```

`RecallState::initialize()` 不再因为 `has_legacy_source()` 直接调用 `import()`。

### 7.2 模块可用性

如果旧知识库尚未迁移：

- 应用其他模块仍可以正常启动；
- 新知识库入口显示“待迁移”；
- 进入相关模块时可以重新打开迁移流程；
- 不应在用户未确认的情况下混合读取旧目录和新数据库；
- 若迁移是使用新模块的前置条件，应将该模块置为只读或显示迁移引导。

这比阻塞整个应用启动更安全，也比静默自动迁移更可解释。

## 8. 前端 Guided Flow 接入

建议新增流程定义：

```text
src/flows/knowledge-migration/
  knowledge-migration.flow.ts
  steps/
    MigrationDiscoveryStep.vue
    MigrationPreviewStep.vue
    MigrationBackupStep.vue
    MigrationExecuteStep.vue
    MigrationVerifyStep.vue
    MigrationCompleteStep.vue
```

流程上下文只保存：

- migration ID；
- source fingerprint；
- 当前预览摘要；
- 用户确认状态；
- 当前任务引用；
- 最终报告引用或摘要。

详细数据仍由 Recall 服务和数据库保存。

流程关闭时：

- `pending` 可变为 deferred；
- `running` 不应仅因关闭 UI 就被标记为 cancelled；
- 重新打开时先查询后端真实状态；
- 如果任务仍在运行，显示当前进度；
- 如果任务已失败或中断，提供重新检测和重试选项。

## 9. 开发环境行为

开发环境不能依靠“每次启动时重新执行”来方便测试。正确行为是：

- 同一 source fingerprint 已完成时，启动只返回已完成报告；
- source fingerprint 未变化时，不重复写入；
- 需要重新测试时，使用隔离的临时 appData 或显式测试重置；
- 单元测试直接构造旧目录 fixture 并验证迁移状态；
- 不允许为了测试而在生产启动链路加入“开发模式强制迁移”。

开发测试应覆盖：

- 首次检测；
- 已完成后重启；
- 主数据部分成功；
- 向量部分成功；
- source fingerprint 改变；
- 迁移过程中进程中断；
- 重试和最终清理。

## 10. 与旧知识库、Recall 和 Knowledge 的边界

旧数据去向必须在迁移说明中明确：

- 旧 Recall 结构迁移到新的 Recall 集合时，保留 Recall 的 ID、条目和相关可保留字段；
- 旧 `.aio-kb` 备份默认通过备份恢复入口处理；
- 只有用户明确选择将旧内容作为传统文档资料时，才转换到 Knowledge；
- 转换到 Knowledge 时不能暗中声称保留 Recall 的标签、priority、enabled、条目关联或附件语义；
- 向量、索引、缓存等派生数据在目标结构中需要重建时，必须展示为待重建，不得伪装成已经迁移完成。

本方案只改变“如何让用户完成版本升级迁移”，不改变上述领域边界。

## 11. 发布和文档同步

包含该迁移的版本必须同时提供：

- 本地版本更新说明；
- migration ID 和来源格式；
- 迁移前置条件和备份建议；
- 保留、丢失、重建字段说明；
- 迁移失败后的恢复方式；
- 清理旧目录的条件。

实现完成后需要同步更新：

- `src/tools/knowledge-base/ARCHITECTURE.md`；
- `src/tools/recall/docs/architecture/storage-migration-contract.md`；
- 知识库用户指南；
- 版本发布说明；
- 迁移和 Tauri E2E 测试说明；具体数据目录、夹具和清理策略见 [Guided Flow 计划的旧数据迁移自动化验收](../../../../../docs/Plan/guided-flow-plan.md#114-旧数据迁移自动化验收)。

现有文档中“旧目录自动迁移”的描述需要改为“启动时只读检测，用户确认后通过迁移流程执行”，避免文档与代码行为不一致。

## 12. 实施阶段

### Phase 0：冻结契约（已完成）

- 确认旧知识库来源、目标结构和不可保留字段；
- 确认 migration ID；
- 确认报告字段和清理条件；
- 用最近一次正式发布版本数据建立迁移基线。

### Phase 1：拆分启动检测和执行（已完成）

- 修改 `RecallState::initialize()`，移除自动 `import()`；
- 保留安全的 schema 初始化；
- 完善只读 inspect；
- 增加执行命令和后端状态校验；
- 保证已完成 fingerprint 不重复写入。

### Phase 2：接入 Guided Flow（已完成）

- 实现检测、预览、备份确认、执行、校验和完成步骤；
- 在升级中心、关于页和知识库入口提供打开方式；
- 显示真实任务进度和结构化报告；
- 支持延后和恢复。

### Phase 3：清理和发布收口（代码已完成，发布验收待补）

- 增加独立旧目录清理步骤；
- 完成中断、重试、部分成功和 source fingerprint 变化测试；
- 更新架构文档和用户指南；
- [待发布验收] 使用正式发布数据进行完整迁移验收和安装包 smoke test。

## 13. 验收标准

### 用户体验

- 用户在迁移前能看到版本变化、迁移规模和风险；
- 未点击明确确认前，不执行用户数据迁移；
- 迁移过程中看到分阶段任务进度；
- 失败、部分成功和待重建都有明确结果；
- 关闭后可以从正确步骤恢复或重新检测；
- 关于页和知识库入口都能重新打开流程或报告。

### 数据安全

- 迁移前旧目录仍存在且只读；
- 同一 migration ID 和 fingerprint 不重复导入；
- 主数据迁移失败时不进入可写完成态；
- 向量未完成时不标记为 ready；
- 清理前重新校验指纹和迁移报告；
- 清理失败时不影响已迁移目标数据。

### 工程质量

- `RecallState::initialize()` 不再自动执行旧用户数据导入；
- Tauri command 已在对应 `generate_handler![]` 注册；
- Rust 返回结构使用 camelCase；
- 有迁移单元测试、状态恢复测试和真实 Tauri 验证；
- 代码、架构文档、用户指南和发布说明保持一致。
