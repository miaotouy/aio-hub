# 知识库重构前按库备份与恢复功能计划

**状态**: 待实施，必须先于 Recall / Knowledge 重构发布
**创建日期**: 2026-07-17
**最近修订**: 2026-07-17
**适用范围**: `src/tools/knowledge-base/`、`src-tauri/src/knowledge/`、全局 AssetManager 的既有导入能力

关联文档：

- [Recall / Knowledge 领域拆分与重构实施计划](./recall-knowledge-domain-restructure-implementation-plan.md)
- [后端存储数据库化设计调查](./backend-storage-database-design.md)
- [检索模式与思绪引擎设计调查](./retrieval-profile-knowledge-memory-design.md)

> 本功能是重构前的独立发布门槛。先在现有 `knowledge-base` 文件存储上提供用户可操作、可验证的按库备份与恢复，再开始 Recall 迁名、数据库迁移和 Knowledge 领域拆分。

---

## 1. 背景与目标

当前已经存在单库“导出”菜单，但能力不足以作为重构前恢复通道：

- `kb_export_base` 只返回当前内存读模型中的 `KnowledgeBase { meta, entries }`。
- 前端只负责将结果写为 JSON / YAML，没有对应的整库导入入口。
- 导出数据没有格式标识、格式版本、完整性校验和冲突处理约定。
- `AssetRef` 只保存全局 AssetManager 引用，现有导出不包含资产二进制，换设备或资产丢失后无法恢复附件。
- 向量、tag pool 和运行时索引混在现有“知识库”概念中，但它们是可重建派生数据，不应放大备份包和恢复风险。

本阶段目标：

1. 用户只选择一次目标目录，即可把全部知识库按库导出为相互独立的备份包。
2. 用户可选择一个或多个备份包导入，每个包恢复为一个独立知识库。
3. 单个备份包包含恢复源条目所需的数据和资产，不依赖原应用数据目录。
4. 备份格式带稳定版本，后续 Recall 数据库迁移器必须继续读取该格式。
5. 发布版本完成真实导出后再导入验证，后续重构才允许开始。

---

## 2. 已确认产品边界

### 2.1 “一键”与“按库分”的定义

- **导出全部**：用户选择一次目标目录，系统为每个知识库生成一个独立 `.aio-kb` 备份包，并在目录根部生成一次导出的 `backup-index.json` 汇总清单。
- **导出单库**：保留知识库列表中的单库导出入口，生成同一种 `.aio-kb` 备份包，不再另造不兼容格式。
- **导出选中库**：复用现有批量选择能力，将选中的每个库分别导出为独立备份包。
- **导入备份**：文件选择器允许多选 `.aio-kb`；每个包独立校验、独立提交，最终显示成功、跳过和失败汇总。
- 不把全部库封装为一个不可拆分的大包。单库包可以独立保存、分享、导入和定位损坏范围。

### 2.2 备份内容

必须包含：

- 库 ID、名称、描述、作者、创建与更新时间、标签、图标引用和库级配置。
- 完整条目，包括条目 ID、标题、正文、摘要、标签及权重、priority、enabled、创建与更新时间、content hash 和 AssetRef。
- 该库图标和条目实际引用到的 AssetManager 原始资产文件。
- 资产原始 ID、文件名、MIME、hash 与包内相对路径，用于导入时去重和引用重映射。
- manifest、文件大小和内容校验信息，以及导出时发现的缺失资产告警。

明确不包含：

- 条目向量、向量矩阵、HNSW、tag pool 向量和检索缓存。
- `refs/refBy`、搜索 trace、Lens / Blender 中间结果等运行时派生数据。
- Agent binding、占位符、工具权限、聊天记录和全局工作区配置。

导入后派生索引标记为待重建。UI 必须在导出和导入结果中明确说明“备份包含库内容和引用资产，不包含可重建向量与 Agent 配置”。

### 2.3 缺失资产策略

- 导出前按 Asset ID 查询全局 AssetManager，并对库图标和条目资产去重。
- 单个资产缺失不能阻止条目源数据导出，但必须把原 AssetRef 和缺失原因写入 manifest 告警。
- 导入时只为成功恢复或已按 hash 命中的资产建立新 AssetRef；未恢复资产不制造悬空的新引用，并写入导入报告。
- 同一资产被多个库引用时允许分别进入各自包，保证每个单库包自包含；导入时由 AssetManager 的 hash 去重避免重复落盘。

---

## 3. 稳定备份格式

### 3.1 文件与目录结构

`.aio-kb` 是 ZIP 容器，扩展名用于产品识别，不依赖扩展名判断内容是否合法。

```text
{safeLibraryName}_{libraryId}_{yyyy-MM-dd}.aio-kb
├── manifest.json
├── library.json
└── assets/
    ├── {logicalAssetId}/{originalFileName}
    └── ...
```

`manifest.json` 最低字段：

```ts
interface KnowledgeLibraryBackupManifestV1 {
  format: "aiohub.knowledge-library";
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  libraryId: string;
  libraryName: string;
  entryCount: number;
  assetCount: number;
  files: Array<{
    path: string;
    size: number;
    blake3: string;
  }>;
  assets: Array<{
    originalAssetId: string;
    packagePath: string | null;
    name: string;
    mimeType: string;
    sha256?: string;
    missingReason?: string;
  }>;
}
```

`library.json` 使用版本化 DTO 保存 `meta + entries`。DTO 只描述导入导出契约，不直接序列化 `InMemoryBase`，也不包含运行时锁、索引和缓存字段。

### 3.2 兼容约束

- 新版本只写 `formatVersion = 1`，读取端必须按 `format + formatVersion` 分派，不能通过猜字段解释未知版本。
- 导入器同时只读兼容现有 `kb_export_base` 生成的 legacy JSON / YAML `KnowledgeBase { meta, entries }`，方便用户使用已经手工导出的文件。
- legacy JSON / YAML 不含资产二进制，导入报告必须标记其为“内容恢复”，不能宣称完整资产备份。
- 后续 Recall 迁移器必须读取 `.aio-kb` v1，并将其映射为 `RecallCollection`；未来 Recall 新导出使用独立的 `aiohub.recall-collection` 格式，不能悄悄改变 v1 语义。
- 所有包内路径必须是规范化相对路径。导入时拒绝绝对路径、`..` 穿越、符号链接和超出上限的解压内容。

---

## 4. 导入语义与数据安全

### 4.1 默认恢复行为

- 目标环境不存在相同库 ID 时，恢复原库 ID 和原条目 ID，保证后续结构化 Agent binding 仍有机会按 ID 迁移。
- 已存在相同库 ID 时，默认“导入为副本”：生成新库 ID，保留条目 ID；名称追加可读的“导入副本”后缀。
- “替换现有库”必须由用户显式选择并二次确认；v1 不提供字段级合并，避免无法解释的覆盖和重复条目。
- 批量导入时每个库是独立原子单元。一个包失败不回滚其他已成功导入的库，但最终报告必须完整列出部分成功状态。

### 4.2 原子写入顺序

1. 打开包并校验 manifest、格式版本、数量、大小、hash 和路径安全。
2. 将 `library.json` 反序列化为专用 DTO，校验库 ID、条目 ID 唯一性和必需字段。
3. 导入或复用资产，建立 `originalAssetId -> importedAssetId` 映射；尚未提交库数据前记录本次新增资产，供失败清理。
4. 在 `appData/knowledge/.import-staging/{operationId}` 写入完整 legacy 库目录并复读校验。
5. 以目录重命名提交到 `bases/{libraryId}`，再加载或同步后端内存读模型。
6. 后端成功后才更新 `workspace.bases`；任何失败都不能留下“workspace 有库但后端无目录”的半完成状态。
7. 返回结构化导入报告；只清理由本次导入创建且没有其他来源使用的资产。

导出同样先写临时文件，完成 ZIP close、hash 复核和可重新打开校验后再原子重命名到用户目标路径。禁止直接覆盖已有备份文件，重名时自动追加序号。

### 4.3 完整性与资源限制

- 导入前检查包文件数、单文件大小、总解压大小和压缩比，防止 ZIP bomb。
- JSON / YAML 解析错误、重复 ID、条目数不一致和 checksum 错误必须在写入前失败。
- 导出数据从文件持久化真源读取，或在命令内确保完整加载；不能直接假定异步 warmup 已结束后再复制 `base.entries`。
- 导出过程只持有必要的短锁，不在持有知识库写锁时压缩大资产。
- 日志使用结构化上下文，不记录正文、资产二进制或完整备份内容。

---

## 5. UI 与调用边界

### 5.1 前端入口

- 知识库列表工具栏增加“导入备份”和“导出”入口；“导出”菜单包含“导出全部”和“导出选中库”。
- 单库更多菜单保留“导出备份”。
- 导入冲突使用项目对话框约定展示“导入为副本 / 替换现有库 / 取消”，替换操作必须说明库名称、ID 和条目数。
- 长任务显示当前库、已完成库数和失败数；完成后提供可展开的结构化报告，不用多条消息逐库刷屏。
- 用户取消文件选择不报错；实际失败使用模块级 `createModuleErrorHandler("knowledge-base/backup")` 和 `customMessage`。

### 5.2 后端职责

建议新增专用 commands，具体命名可在施工时按相邻代码校正：

```text
kb_export_backup
kb_export_backups
kb_inspect_backup
kb_import_backup
```

- Rust 负责读取持久化源、组装 ZIP、hash 校验、路径安全、staging、冲突提交和结构化报告。
- 前端只负责文件 / 目录选择、冲突选择、进度展示和刷新 store，不在 WebView 中拼装大型 ZIP 或搬运资产字节。
- 复用仓库已有 `zip`、`blake3`、AssetManager 查询 / 导入和 Tauri command 注册模式，不新增压缩依赖。

---

## 6. 实施步骤

### Step 1：冻结 DTO 与测试夹具

- 定义 v1 manifest、library DTO、asset mapping、inspect result、import options 和 import report。
- 准备空库、普通库、多库、重复标签、禁用条目、同资产跨库引用、缺失资产、损坏 JSON、重复 ID 和恶意 ZIP 路径夹具。
- 为当前 legacy JSON / YAML 导出样例建立只读兼容测试。

### Step 2：实现后端单库导出与导入

- 先完成单库 `.aio-kb` 导出、复读校验和原子落盘。
- 实现 inspect，不写入任何数据即可返回库摘要、格式版本、冲突状态和告警。
- 实现 staging 导入、资产映射、原库 ID 恢复、冲突副本和显式替换。
- 命令注册到 `tauri::generate_handler![]`，返回结构体使用 `#[serde(rename_all = "camelCase")]`。

### Step 3：接入批量编排与 UI

- 加入导出全部、导出选中库和多文件导入。
- 完成进度、取消、冲突确认和汇总报告。
- 导入成功后统一刷新 workspace、库列表、当前激活库和内存缓存，避免前后端列表漂移。

### Step 4：建立后续迁移兼容夹具

- 将 v1 `.aio-kb` 样例加入 Stage 0 迁移夹具。
- 在 `LegacyFileRecallImporter` 契约中登记 `.aio-kb` v1 和 legacy JSON / YAML 输入。
- 固定“导出旧库 -> 导入当前版本 -> 再导入 Recall 数据库”的 ID、条目数、内容 hash 和资产引用预期。

---

## 7. 验证与发布门槛

自动验证：

- Rust：DTO 序列化、ZIP 路径安全、checksum、资源上限、staging 回滚、冲突策略、重复导入和部分损坏测试。
- 前端：文件选择取消、多文件导入、冲突选择、进度、部分成功报告和 store 刷新测试。
- 运行项目现有 frontend check、backend check、单元测试和 Vite build。
- 在真实 Tauri WebView 中执行导出 / 导入 smoke test，不使用普通浏览器替代文件系统与 IPC 验证。

发布前必须完成一轮真实往返：

```text
现有用户态目录
  -> 一键导出全部（每库一个 .aio-kb）
  -> 使用独立临时 appData 启动
  -> 多选全部备份包导入
  -> 对比库数、库 ID、条目 ID、内容 hash、时间、标签、priority、enabled、资产 hash
  -> 随机抽查浏览、编辑、关键词搜索和重新向量化
```

完成门槛：

- 导出目录中的包数与知识库数一致，`backup-index.json` 统计一致。
- 每个包可独立导入，不依赖原 `appData/knowledge` 或原 AssetManager 目录。
- 源条目字段逐项一致；可用资产逐 hash 一致；缺失资产有明确报告。
- 同包重复导入不会静默覆盖现有库，替换失败可恢复原库。
- 发布说明明确要求用户在后续重构版本前执行一次“导出全部”。
- 该备份版本已发布且真实往返通过后，Recall / Knowledge 重构 Stage 0 才可开始。

---

## 8. 明确不做

- 不在本阶段迁名 Recall、引入 SQLite 或修改检索算法。
- 不把向量和 tag pool 打进备份包；恢复后按当前配置重新生成。
- 不做跨库字段级合并，也不根据库名猜测同一库。
- 不把备份包当成实时同步、增量备份或版本控制系统。
- 不因已有单库 JSON / YAML 导出而省略新格式版本、完整性校验和导入闭环。
