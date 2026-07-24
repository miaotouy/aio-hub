# 移动端资产管理器架构

> 状态：Android MVP 收尾。资产内核、跨工具服务和首版资产/存储页面已注册；当前只剩真实上游附件发送与 Android 真机主流程门禁。iOS 能力仍受编译与真机条件约束，不在本轮扩展实现。

## 1. 边界

- 全局资产由 `asset-manager` 管理；智能体私有资产继续归 `agent-manager`。
- 消费者持久化 `assetId + 轻量快照`，不持久化系统 URI、绝对路径或资产库相对路径。
- 系统选择器引用只进入资产导入命令。新调用方使用 import job；`asset_import_sources` 仅保留为兼容入口。Rust 在桌面及普通 file URI 上使用 plugin-fs；Android `content://` 由 `AssetContentPlugin` 通过 `ContentResolver.openFileDescriptor` 提供文件描述符，再在应用私有目录内完成暂存、哈希、去重和原子落盘。
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
- `asset_get_preview_source` / `asset_revoke_preview_source`：签发或撤销短期受控预览 URL；URL 只含不透明 token。
- `asset_extract_text`：受控读取不超过 2 MiB 的 ready/managed UTF-8 文本类原件；拒绝不支持类型、空文本、NUL/二进制和超限内容。
- `asset_export`：复核 managed/ready 资产后，将原件流式复制到系统 save-picker 目标。
- `asset_share`：仅接受资产 ID；Android 复核后复制到受控 cache 并打开系统 `ACTION_SEND`，其他平台返回未支持。
- `asset_capture_photo`：Android 调用系统相机并返回一次性 `content://` 导入源；非 Android 返回未支持。
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

- Android `emulator-5558` 已验证 Photo Picker `content://` 经原生 bridge 正式导入：1 项成功写入托管库，MIME 为 `image/png`、类型为 `image`、状态为 `ready`；数字 provider 展示名已回退为 MIME 格式的 `photo-<8hex>.png`。同一 bridge 也验证 save-picker `content://` 导出，导出文件与托管对象字节数和 SHA-256 一致。
- `tauri-plugin-fs` 2.5.1 在测试 provider 上的 `openAssetFileDescriptor` 不兼容是已知边界；不得把该 plugin-fs 路径作为 Android `content://` 正式链的唯一实现。bridge 仅在 Android content URI 分支启用，避免改变桌面与 iOS 路径。
- Android 图片 `<img>`、视频 `<video>` 和音频 `<audio>` 受控预览已在实际 WebView 渲染并播放；系统分享已在 chooser 中验证图片预览和只读 cache 副本；相机 bridge 已实现但当前模拟器没有 `IMAGE_CAPTURE` Activity。`ui-tester` 已在 `emulator-5558` 验证跨源 Range、HEAD 和主动撤销。
- iOS 因当前缺少编译与真机设备条件暂缓补验。security-scoped URL 的关闭时机、备份排除和预览协议在设备条件具备前不得冻结。

## 8. 查询与库状态

- `asset_list` 支持 visible/hidden/all、创建月份、来源类型、来源模块、保留策略（reclaimable/pinned）和使用影响（used/unused）筛选；旧 `includeHidden` 参数继续兼容。
- 月份与来源 facets 只聚合 ready 资产。来源聚合在同一来源类型/模块内按资产去重；同一资产属于多个来源分组时允许重复计入，各分组不可直接相加推导总占用。
- hidden 只影响普通资产列表与默认 facets，不改变资产可用性。恢复仅把 `library_state` 改回 visible。

## 9. 原生资产读取

- 共享 wire 引用使用 `{ kind: "managed-asset-ref", assetId }`，不附带 MIME 快照或任何路径字段。
- 移动端 LLM 原生传输在 Rust 内部查询资产库，只接受 managed、ready 且对象文件存在的资产；JSON 内联、顶层 body 和 multipart 共用同一解析入口。
- managed multipart 的 MIME 与文件名取自资产记录，流长度取自打开前的实际文件元数据。`reclaimed`、`missing`、非 managed 或对象缺失均拒绝读取。

## 10. 受控预览

- `aio-asset` 自定义协议在 Android/Windows 使用 `http://aio-asset.localhost/<token>`，在 iOS/macOS/Linux 使用 `aio-asset://localhost/<token>`；前端只接收运行时描述符，不持久化 URL。
- token 默认 5 分钟有效，可由 `asset_revoke_preview_source` 主动撤销；协议每次请求重新验证 token、资产 availability 和对象存在性。
- 仅允许 GET/HEAD/OPTIONS；支持单个 `Range`，每次最多返回 1 MiB。无 Range 的原件响应上限为 16 MiB，超限返回 413，避免把大原件整体读入 WebView 进程。
- 响应带 `Cache-Control: private, no-store`、`Accept-Ranges`、`Content-Range` 和 `nosniff`；Range 解析复用 `http-range`，不手写范围语法。
- Android WebView 固定场景已验证 206 Range body 和跨源响应头读取。HEAD 在 WebView 层返回 200、空 body 与 `Accept-Ranges`，但可见 `content-length` 被归一为 0；验证台记录该平台差异，不用它断言原件长度。
- 主动撤销和 Android 自然到期后再次请求原 URL 都返回 404，统一隐藏未知、过期和已撤销 token 的历史状态。iOS scheme/HEAD/Range/CORS 尚未验收，因此 URL 形态仍不是跨平台永久协议。

## 11. 用户界面

- `asset-manager.registry.ts` 注册 `/tools/asset-manager`，页面使用原生 Vue 结构、Lucide 图标和 AIO Hub token；Varlet 只保留在全局反馈封装中。
- 资产视图支持名称、类型、可见状态、月份、来源模块、保留策略和使用影响筛选，包含加载、空、错误、导入中、missing/reclaimed/error 与多选状态。
- 资产列表按后端 `limit/offset` 契约分批加载；首批达到 100 项时显示“加载更多”，筛选重载会使迟到的旧分页响应失效，避免跨查询混入资产。
- 手机资产列表使用稳定 1:1 三列网格，平板增加列数；普通点击打开详情，长按进入多选，显式选择按钮继续作为无障碍和精确操作入口。
- 多选操作复用后端原子命令完成隐藏/恢复、固定/取消固定和安全删除。删除前必须重新调用影响分析，advisory usage 经平台对话框确认后才传入 `confirmAdvisory`。
- 存储视图展示原件、可回收量、缓存、临时文件和类型占用，并提供全库可重建缓存清理与资产库修复入口。
- 详情面板只展示脱敏来源和 usage 摘要。`mobile/src/components/media/` 提供 `MediaPreviewHost`、图片/视频/音频主体和 `useManagedMediaPreview`；详情只传 `assetId +` 轻量媒体元数据，不持有或持久化预览 URL。
- `useManagedMediaPreview` 统一处理 descriptor 请求序号、迟到响应撤销、换资源、重复清理、过期重试和媒体错误映射。host 负责加载/错误层、安全区、背景滚动锁定和“先退出沉浸层、再关闭宿主”的返回顺序；各媒体组件分别保留适合触屏的播放或缩放控制。
- 详情页的固定/取消固定、隐藏/恢复和清理原件都按详情自身 `assetId` 调用领域命令，不借用列表选择；清理仍复用删除影响分析与 advisory 确认，完成后才关闭详情并撤销预览。
- 文件导入通过系统文件选择器或移动端 media picker 获得引用后交给 import job；WebView 不读取原件字节。页面可恢复最近任务、显示累计进度与中断错误码，并取消 pending/running 任务。
- 详情页的“保存到文件”使用系统 save picker，目标引用直接传给 `asset_export`；Rust 对 Android `content://` 目标通过 `AssetContentPlugin` 的 `openFileDescriptor(..., "wt")` 打开，其他目标按平台使用 plugin-fs，并流式复制 managed 原件，内部对象路径不返回 WebView。
- 详情页的“系统分享”只传 `assetId`；Rust 将原件复制到 cache 的 UUID 目录，Android bridge 用 `FileProvider`、`ClipData` 和只读 grant 发出 `ACTION_SEND`。分享副本由延迟任务清理，启动恢复/资产库修复会清除遗留目录，并把其大小计入临时文件。
- 导入面板的“拍摄照片”只调用 `asset_capture_photo`；Android bridge 把相机输出写入 cache/captures，通过 `FileProvider` 返回临时 `content://`，前端交给既有 import job。取消、无相机和异常结果不产生可见资产，启动恢复/资产库修复清除 captures。
- 文本文档详情和批量选择提供“文本化”操作。编排层只接受全部 usage 均属于 `llm-chat/message/attachment` 的资产，先提取文本并调用聊天领域 command 持久化快照，再投递 usage outbox、重新分析删除影响，最后清理原件；逐项失败不删除原件且不阻断后续项。批量动作区在窄屏内横向滚动。

## 12. 后续门禁

- Android 预览 token 自然过期已在 `emulator-5558` 真实 WebView 验证；iOS scheme/HEAD/Range/CORS/撤销仍受编译与设备条件门禁约束。
- 新媒体组件的 jsdom 自动化只验证生命周期和 DOM 交互契约；图片手势、视频全屏 fallback、音频播放、横竖屏、安全区和快速切换仍需在 Android AVD 与真机复验。
- Android 真机需完成一次导入、预览、导出、删除影响和应用重启恢复主流程，并记录结果；不得用 emulator 或普通浏览器替代。
- `ManagedAssetRef` 需完成一次真实上游模型附件发送验收；模型未配置时保持门禁未通过，不新增旁支功能。
- 相机、分享进入 AIO、文件关联、批量/复杂格式文本化和其他消费者替代均属于 Phase 3，本轮不继续扩展。
- iOS 因缺少编译与真机设备条件继续跳过，不声明平台能力通过。
