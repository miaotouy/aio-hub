# 移动端资产管理器架构

> 状态：Phase 1 施工中。当前只提供资产内核和跨工具服务，不注册用户界面路由。

## 1. 边界

- 全局资产由 `asset-manager` 管理；智能体私有资产继续归 `agent-manager`。
- 消费者持久化 `assetId + 轻量快照`，不持久化系统 URI、绝对路径或资产库相对路径。
- 系统选择器引用只进入资产导入命令。新调用方使用 import job；`asset_import_sources` 仅保留为兼容入口。Rust 使用 plugin-fs 打开引用，并在应用私有目录内完成暂存、哈希、去重和原子落盘。
- 前端服务只负责领域命令调用。数据库、对象路径、事务和来源 locator 不暴露给 WebView。

## 2. 存储

```text
AppData/assets/
  asset_manager.db
  objects/<hash-prefix>/<sha256>.<ext>
  tmp/imports/<job-id>.part
```

`asset_manager.db` 使用独立 SQLx migration，连接固定启用 WAL、`foreign_keys`、`busy_timeout` 和 `synchronous=NORMAL`。数据库保存 `assets`、`asset_origins`、`asset_usages`、`asset_variants` 与 `import_jobs`。

对象目录只使用后端生成的相对路径。`AssetRecord` 序列化给前端时明确跳过 `relative_path`。

## 3. 已有命令

- `asset_import_sources`：逐项返回 imported/deduplicated/restored/failed，不把单项失败扩大为整批回滚。
- `asset_start_import_job`：持久化任务后立即返回，通过 Tauri Channel 推送状态和字节进度。
- `asset_get_import_job` / `asset_list_import_jobs`：读取单个或最近任务，供 WebView 重载后恢复进度与结果。
- `asset_cancel_import_job`：请求取消等待中或运行中的任务；流式读取在块边界终止。
- `asset_list`：分页读取可见、可用资产，支持类型与名称筛选。
- `asset_get_detail`：返回资产、脱敏来源摘要和 usage，不返回来源 locator。
- `asset_replace_entity_usages`：按业务实体整体替换 usage，供消费者 outbox 幂等投递。
- `asset_analyze_delete`：汇总 pinned、blocking/advisory usage 与确认要求，不执行副作用。
- `asset_set_retention_policy`：批量切换 reclaimable/pinned；任一 ID 不存在时整批回滚。
- `asset_set_library_state`：批量隐藏或恢复资产；隐藏不改变原件、usage 或保留策略。
- `asset_get_library_facets`：按创建月份以及来源类型/模块聚合 ready 资产，默认排除隐藏项。
- `asset_clear_rebuildable_cache`：清理全库或指定资产的可重建 variant，不触碰原件和不可重建 variant。
- `asset_delete`：重新校验影响后删除无引用资产，或为 advisory usage 保留 reclaimed tombstone。
- `asset_get_storage_summary`：返回原件、可回收量、缓存、临时文件和类型聚合。
- `asset_repair_library`：排空删除队列、清理临时/孤儿文件并标记缺失原件。

## 4. 导入一致性

1. Rust 读取系统引用，同时写入 `.part` 并计算 SHA-256。
2. 哈希已存在且对象可用时，只追加来源。
3. 新对象在同一文件系统内原子改名后写数据库；数据库提交失败时删除本次新建对象。
4. `reclaimed` 或 `missing` 记录重新导入相同内容时复用原 `assetId`。
5. 当前用进程内互斥锁串行化导入提交，避免同一内容并发导入产生对象与唯一索引竞争。

## 5. 导入任务

- `import_jobs` 保存任务状态、累计读取字节、当前项、完成项数和脱敏结果；来源 URI、临时路径和资产相对路径不返回 WebView。
- Channel 只用于降低实时刷新延迟，SQLite 任务记录是查询和恢复的权威状态。前端服务会持有 Channel 到任务终态，同时轮询任务记录。
- 取消不回滚已经完成的资产；当前 `.part` 会被删除，未处理项记录为 cancelled。
- 首版不承诺跨进程断点续传。启动时遗留的 pending/running 任务标为 `failed / ASSET_IMPORT_INTERRUPTED`，随后清理 `.part`；最近任务列表可恢复展示中断原因。

## 6. 删除与恢复一致性

- 删除事务先把原件和 variant 相对路径写入 `pending_file_deletions`，再更新 tombstone 或删除资产行。事务提交后才删除物理文件。
- 物理删除失败只增加队列重试信息，不回滚已经确认的业务删除；下一次资产服务启动或手动修复会继续排空队列。
- 启动恢复会清理未完成的 `.part`、排空删除队列、把数据库中 ready 但原件不存在的记录标为 missing，并删除对象目录中无数据库引用的孤儿文件。
- 所有导入、usage replacement、保留策略和删除事务共用 mutation lock，删除时仍会重新分析 usage，不能依赖较早的 UI 分析结果。
- 可重建缓存清理同样先在事务中写入待删除队列并删除 variant 行，提交后再删除缓存文件；失败由启动恢复或手动修复重试。

## 7. 平台状态

- Android 已有 `content://` 读取与 SQLite 真机报告。正式 Rust 导入命令仍需在 `ui-tester` 补固定场景。
- iOS 因当前缺少编译与真机设备条件暂缓补验。security-scoped URL 的关闭时机、备份排除和预览协议在设备条件具备前不得冻结。

## 8. 查询与库状态

- `asset_list` 支持 visible/hidden/all、创建月份、来源类型和来源模块筛选；旧 `includeHidden` 参数继续兼容。
- 月份与来源 facets 只聚合 ready 资产。来源聚合在同一来源类型/模块内按资产去重；同一资产属于多个来源分组时允许重复计入，各分组不可直接相加推导总占用。
- hidden 只影响普通资产列表与默认 facets，不改变资产可用性。恢复仅把 `library_state` 改回 visible。

## 9. 后续施工

- 受控预览描述符与 `managed-asset-ref` 原生 LLM 传输。
- Phase 2 再注册资产/空间页面与移动端交互。
