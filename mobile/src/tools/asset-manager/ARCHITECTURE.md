# 移动端资产管理器架构

> 状态：Phase 1 施工中。当前只提供资产内核和跨工具服务，不注册用户界面路由。

## 1. 边界

- 全局资产由 `asset-manager` 管理；智能体私有资产继续归 `agent-manager`。
- 消费者持久化 `assetId + 轻量快照`，不持久化系统 URI、绝对路径或资产库相对路径。
- 系统选择器引用只进入 `asset_import_sources`。Rust 使用 plugin-fs 打开引用，并在应用私有目录内完成暂存、哈希、去重和原子落盘。
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
- `asset_list`：分页读取可见、可用资产，支持类型与名称筛选。
- `asset_get_detail`：返回资产、脱敏来源摘要和 usage，不返回来源 locator。
- `asset_replace_entity_usages`：按业务实体整体替换 usage，供消费者 outbox 幂等投递。
- `asset_analyze_delete`：汇总 pinned、blocking/advisory usage 与确认要求，不执行副作用。
- `asset_set_retention_policy`：批量切换 reclaimable/pinned；任一 ID 不存在时整批回滚。
- `asset_delete`：重新校验影响后删除无引用资产，或为 advisory usage 保留 reclaimed tombstone。
- `asset_get_storage_summary`：返回原件、可回收量、缓存、临时文件和类型聚合。
- `asset_repair_library`：排空删除队列、清理临时/孤儿文件并标记缺失原件。

## 4. 导入一致性

1. Rust 读取系统引用，同时写入 `.part` 并计算 SHA-256。
2. 哈希已存在且对象可用时，只追加来源。
3. 新对象在同一文件系统内原子改名后写数据库；数据库提交失败时删除本次新建对象。
4. `reclaimed` 或 `missing` 记录重新导入相同内容时复用原 `assetId`。
5. 当前用进程内互斥锁串行化导入提交，避免同一内容并发导入产生对象与唯一索引竞争。

## 5. 删除与恢复一致性

- 删除事务先把原件和 variant 相对路径写入 `pending_file_deletions`，再更新 tombstone 或删除资产行。事务提交后才删除物理文件。
- 物理删除失败只增加队列重试信息，不回滚已经确认的业务删除；下一次资产服务启动或手动修复会继续排空队列。
- 启动恢复会清理未完成的 `.part`、排空删除队列、把数据库中 ready 但原件不存在的记录标为 missing，并删除对象目录中无数据库引用的孤儿文件。
- 所有导入、usage replacement、保留策略和删除事务共用 mutation lock，删除时仍会重新分析 usage，不能依赖较早的 UI 分析结果。

## 6. 平台状态

- Android 已有 `content://` 读取与 SQLite 真机报告。正式 Rust 导入命令仍需在 `ui-tester` 补固定场景。
- iOS 因当前缺少编译与真机设备条件暂缓补验。security-scoped URL 的关闭时机、备份排除和预览协议在设备条件具备前不得冻结。

## 7. 后续施工

- import job 进度、取消与可恢复状态展示。
- 清理可重建缓存、隐藏/恢复和按月份/来源聚合。
- 受控预览描述符与 `managed-asset-ref` 原生 LLM 传输。
- Phase 2 再注册资产/空间页面与移动端交互。
