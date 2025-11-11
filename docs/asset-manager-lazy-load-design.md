# 资产管理器懒加载与分页查询设计文档

本文档定义了为实现资产管理器懒加载功能所需的前后端接口合同与数据结构。

## 1. 目标

- **后端**: 提供一个高效、可分页、可筛选、可排序的资产查询接口。
- **前端**: 实现无限滚动（懒加载）的用户界面，显著降低初次加载时间与内存占用。

## 2. 核心变更：后端数据源

- **引入 `assets.jsonl`**: 在资产根目录的 `.catalog/` 子目录下，创建一个 `assets.jsonl` 文件。
- **格式**: 每行是一个独立的 JSON 对象，代表一个 `Asset` 的核心元数据。
- **目的**: 作为快速查询的数据源，避免全量扫描文件系统。在资产导入/删除时进行增量更新。

## 3. 后端接口 (Rust Commands)

### 3.1. 分页查询: `list_assets_paginated`

此命令将取代现有的 `list_all_assets` 作为前端列表的主要数据源。

#### Rust 请求参数 (`ListAssetsPaginatedPayload`)

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetSortBy {
    Date,
    Name,
    Size,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAssetsPaginatedPayload {
    pub page: u32,
    pub page_size: u32,
    pub sort_by: AssetSortBy,
    pub sort_order: SortOrder,
    pub filter_type: Option<AssetType>,
    pub filter_origin: Option<AssetOriginType>,
    pub search_query: Option<String>,
    #[serde(default)]
    pub show_duplicates_only: bool,
}
```

#### Rust 返回结构 (`PaginatedAssetsResponse`)

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedAssetsResponse {
    /// 当前页的资产列表
    pub items: Vec<Asset>,
    /// 符合筛选条件的总资产数
    pub total_items: u64,
    /// 总页数
    pub total_pages: u32,
    /// 是否有下一页
    pub has_more: bool,
    /// 当前页码
    pub page: u32,
}
```

### 3.2. 统计信息: `get_asset_stats`

用于高效获取侧边栏所需的统计数据。

#### Rust 返回结构 (`AssetStats`)

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetStats {
    pub total_assets: u64,
    pub total_size: u64,
    pub type_counts: std::collections::HashMap<AssetType, u64>,
}
```

## 4. 前端接口 (TypeScript Types)

这些类型定义在 `src/types/asset-management.ts` 中，用于与后端命令交互。

#### TypeScript 请求参数

```typescript
export type AssetSortBy = 'date' | 'name' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface ListAssetsPaginatedPayload {
  page: number;
  pageSize: number;
  sortBy: AssetSortBy;
  sortOrder: SortOrder;
  filterType?: AssetType | 'all';
  filterOrigin?: AssetOriginType | 'all';
  searchQuery?: string;
  showDuplicatesOnly?: boolean;
}
```

#### TypeScript 返回结构

```typescript
export interface PaginatedAssetsResponse {
  items: Asset[];
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
  page: number;
}

export interface AssetStats {
  totalAssets: number;
  totalSize: number;
  typeCounts: Record<AssetType, number>;
}


---

在现状基础上已完成初步代码审阅与链路分析，下面给出后端索引与前端懒加载的整体设计方案与执行清单。关键调用与文件位置均以可点击形式标注。

现状与瓶颈
- 前端一次性加载全部资产：
  - 初次加载在 [useAssetManager.loadAssets()](src/composables/useAssetManager.ts:304) 内调用 [assetManagerEngine.listAllAssets()](src/composables/useAssetManager.ts:147)，映射到后端 [list_all_assets](src-tauri/src/commands/asset_manager.rs:774) 完整目录扫描。
  - 之后在 [AssetManager.vue filteredAndSortedAssets](src/tools/asset-manager/AssetManager.vue:148) 执行前端过滤与排序，再在 [groupedAssets](src/tools/asset-manager/AssetManager.vue:362) 做分组。
  - 组内渲染时， [AssetGroup.vue loadAssetUrls](src/tools/asset-manager/components/AssetGroup.vue:68) 遍历当前组全部资产生成 URL Map（虽然 [assetManagerEngine.convertToAssetProtocol()](src/composables/useAssetManager.ts:70) 同步且廉价，但对海量列表仍有遍历/内存开销）。
  - 网格视图缩略图位于 [AssetGridView.vue](src/tools/asset-manager/components/AssetGridView.vue:1)，列表视图位于 [AssetListView.vue](src/tools/asset-manager/components/AssetListView.vue:1)，当前未做虚拟滚动或分页。
- 后端方面：
  - 列表构建依赖目录扫描与 [build_asset_from_path()](src-tauri/src/commands/asset_manager.rs:820)，对大数据量 IO 开销大。
  - 已有月度哈希索引用于查重：生成在 [rebuild_hash_index](src-tauri/src/commands/asset_manager.rs:900)，查重命令 [find_duplicate_files](src-tauri/src/commands/asset_manager.rs:1128)。该索引仅服务哈希，不适用于列表分页/排序。

设计方案（后端）
- 新增“目录级资产目录索引（Catalog Index）”以支持高效分页/排序/筛选：
  - 结构建议：JSONL（每行一个条目），路径 base_dir/.catalog/assets.jsonl，条目包含 {id, path, name, size, mimeType, type, createdAt, originType?}。在导入/删除时实时维护；提供重建命令。
  - 重建命令： [Rust.rebuild_catalog_index()](src-tauri/src/commands/asset_manager.rs:1300)（新增），遍历五类目录（images/audio/videos/documents/other）构建 JSONL，必要时输出进度事件类似 [rebuild-index-progress](src-tauri/src/commands/asset_manager.rs:974)。
- 新增分页查询命令：
  - [Rust.list_assets_paginated()](src-tauri/src/commands/asset_manager.rs:1228)（新增）
  - 入参：{ page: number, pageSize: number, sortBy: 'date'|'name'|'size', sortOrder: 'asc'|'desc', filterType?: 'image'|'audio'|'video'|'document'|'other'|'all', filterOrigin?: 'local'|'clipboard'|'network'|'all', searchQuery?: string, groupBy?: 'month'|'type'|'origin'|'none', duplicateOnly?: boolean }
  - 返回：{ items: Asset[], total: number, hasMore: boolean, page: number }
  - 实现细节：读取 .catalog/assets.jsonl 到内存（或流式过滤），完成服务端过滤+排序后切片返回；当 duplicateOnly 为 true 时，先从 [find_duplicate_files](src-tauri/src/commands/asset_manager.rs:1128) 取重复集合进行过滤。
- 导入/删除时维护 Catalog：
  - 在 [import_asset_from_path](src-tauri/src/commands/asset_manager.rs:376) 与 [import_asset_from_bytes](src-tauri/src/commands/asset_manager.rs:495) 成功后，追加写入一行 JSONL。
  - 在 [delete_asset](src-tauri/src/commands/asset_manager.rs:1060) 成功后，写入 tombstone（如 base_dir/.catalog/deleted.jsonl 或维护一个 id->deleted 的 Map）并在分页查询阶段排除；或执行“惰性清理”以避免频繁改写大文件。
- 统计接口（侧边栏用）：
  - [Rust.get_asset_type_counts()](src-tauri/src/commands/asset_manager.rs:1350)（新增），基于 Catalog 汇总 typeCounts 与总大小/总数；避免前端自行统计。

设计方案（前端）
- Engine 扩展：
  - [TypeScript.assetManagerEngine.listAssetsPaginated()](src/composables/useAssetManager.ts:560)（新增），invoke 'list_assets_paginated'。
  - [TypeScript.assetManagerEngine.getTypeCounts()](src/composables/useAssetManager.ts:580)（新增），invoke 'get_asset_type_counts'。
- 新增分页型可组合：
  - [TypeScript.useAssetPagination()](src/composables/useAssetManager.ts:600)（新增）：管理查询参数（viewMode/search/sort/group/type/origin/duplicateOnly），维护 {items, total, page, pageSize, hasMore, isLoading, error}，提供 loadFirstPage/reset/loadNextPage。
  - 变更 [AssetManager.vue](src/tools/asset-manager/AssetManager.vue:86)：挂载时改为 loadFirstPage；滚动到底触发 loadNextPage；筛选/排序/搜索/分组变更时 reset 并重新加载。
- 滚动触发与虚拟化策略：
  - 容器：使用主视图容器 [el-main.main-view-container](src/tools/asset-manager/AssetManager.vue:569)（overflow-y: auto）；在其中添加一个“观察锚点”DOM，IntersectionObserver 触底时触发 loadNextPage。
  - 网格/列表渲染：
    - 初期先采用“分页+增量渲染”替代全量虚拟滚动，避免引入第三方虚拟化库；后续可评估引入 Vue Virtual Scroll List。
    - [AssetGroup.vue](src/tools/asset-manager/components/AssetGroup.vue:35)：取消对 props.assets 的全量 URL 预生成，调整为“按视口懒算”。方案 A：保持 convertFileSrc（廉价）但仅针对当前页 items；方案 B：在 [AssetGridView.vue](src/tools/asset-manager/components/AssetGridView.vue:23) 与 [AssetListView.vue](src/tools/asset-manager/components/AssetListView.vue:26) 中对图片使用 thumbnailPath 并调用 [assetManagerEngine.getAssetUrl(asset, true)](src/composables/useAssetManager.ts:89)，进一步减轻带宽。
- 交互与体验：
  - 初次加载显示骨架/占位（现有 loading 已在 [AssetManager.vue](src/tools/asset-manager/AssetManager.vue:47)）。
  - 当 hasMore 为 false，显示“已到底”提示。
  - 保持现有多选逻辑 [handleAssetSelection](src/tools/asset-manager/AssetManager.vue:229) 不变，但注意跨页选择的状态持久；selectedIds 以 Set 管理即可（当前已满足）。
- 兼容重复文件视图：
  - “只看重复”切换为 duplicateOnly 参数，后端利用现有查重索引 [find_duplicate_files](src-tauri/src/commands/asset_manager.rs:1128) 输出集合，再在分页过滤时匹配 id（uuid 取自路径 stem，现有处理在 [handleFindDuplicates](src/tools/asset-manager/AssetManager.vue:500) 与 [updateDuplicateHashesAfterDeletion](src/tools/asset-manager/AssetManager.vue:473)）。
- 侧边栏统计：
  - [Sidebar.vue](src/tools/asset-manager/components/Sidebar.vue:1) 的 typeCounts/totalAssets/totalSize 来源改用 getTypeCounts（避免大列表前端自行统计）。

性能与边界
- 目标：1 万级资产，首屏数据 ≤ 100 条，加载时间 < 200ms（SSD），滚动分页每次 ≤ 100 条。
- JSONL Catalog 的内存开销可控；如需更强查询能力可升级为 SQLite（后续阶段）。
- 排序支持：date/name/size 均后端实现。若后端未构建 Catalog，可暂时限制排序为 date desc（按目录/文件时间近似），并提示“重建目录索引以启用全部排序”。

审批后的实施顺序
- 后端优先：Catalog 重建与分页接口 → 导入/删除维护索引 → 统计接口。
- 前端其次：useAssetPagination → AssetManager.vue 接入 → AssetGroup/视图懒算与缩略图优先。
- 最后：重复只看模式与统计接入、体验细节与文档。

需要确认的参数（建议值）
- 默认 pageSize：grid 60、list 200。
- 初期排序默认：date desc。
- 搜索是否只匹配 name/mimeType（当前 [searchAssets](src/composables/useAssetManager.ts:284) 即如此），是否扩展到 origin.source。

