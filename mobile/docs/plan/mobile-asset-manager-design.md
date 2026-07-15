# 移动端资产管理器调查与设计方案

> 状态：待评审
> 日期：2026-07-15
> 范围：产品信息架构、移动端存储语义、数据模型与实施边界。本文件不包含功能实现。

## 1. 结论

移动端资产管理器不应是桌面端页面的缩小版。它应当是聊天、媒体生成等工具共用的可回收资产基础设施，同时承担用户可理解的本机空间管理入口。它不是不可丢失数据的统一保险箱。

保留桌面端的三个核心语义：

- 统一资产 ID，供聊天、媒体生成等需要共享工作集的工具复用。
- 内容哈希去重，同一份内容只保存一个托管原件。
- 来源与使用关系可追踪，能回答“从哪里来”“正在被什么使用”和“删除后会影响什么”。

移动端改用以下实现原则：

- 默认“导入即托管”：从照片、文件、相机、分享入口获得内容后，流式复制到应用私有资产库。
- 全局资产默认可回收：允许按月份、来源、类型或使用状态批量清理；业务引用用于影响分析，不默认把原件永久锁死。
- 智能体附带资产继续由 `agent-manager` 私有管理，随智能体打包、导入、导出和删除，不进入全局资产库。
- 托管原件、可重建缓存、外部来源定位信息分层保存，三者采用不同的清理策略。
- 资产索引使用资产模块独占的 `asset_manager.db`，不沿用桌面端 `assets.jsonl`。
- 文件写入、哈希、数据库登记、回滚由 Rust 资产服务统一编排，前端不直接修改资产表。
- 首版不申请全量相册或宽泛存储权限，优先使用系统选择器授权用户明确选择的内容。
- 首版不做外部文件的长期“仅引用”模式。该模式依赖 Android 持久 URI 权限和 iOS 安全作用域书签，应在独立能力验证后再开放。

## 2. 当前状态调查

### 2.1 桌面端已有能力

桌面端 `asset-manager` 当前以 `$APPDATA/assets/` 为统一存储根目录，使用 Rust 命令完成导入、哈希去重、分页查询、来源追踪、缩略图与删除等操作。索引为 `assets.jsonl`，前端提供侧边栏筛选、网格/列表切换、分组、排序、重复文件扫描和“打开所在目录”等 PC 交互。

可复用的是领域语义和部分数据字段，不应直接复用页面结构、索引实现和文件操作语义。

### 2.2 移动端已有基础

- 技术栈为 Tauri v2、Vue 3、TypeScript 与 Rust。
- 已安装 `@tauri-apps/plugin-fs`，当前 capability 只允许应用数据目录读写。
- `mobile/src/utils/fsUtils.ts` 仅封装了应用数据目录下的文本文件与目录操作，没有二进制资产服务。
- 移动端尚未安装 dialog、SQL、相册、相机或分享相关插件。
- `llm-chat` 的 `_attachments` 仍为 `any[]` 占位，架构文档已把完整 Asset 系统列为待办。
- `agent-manager` 的 `assets` 与 `assetGroups` 仍是占位类型，但其桌面端语义是智能体私有资产，不应因此并入全局资产库。
- 工作区已有“一模块一数据库”的移动端 SQLite 计划，但尚未形成资产库实现。

因此，资产管理器不是一个孤立工具页。它会成为聊天附件、媒体生成输入输出和后续通用导入/导出能力的共同依赖。智能体私有资产只在用户明确执行“复制到智能体”或“从智能体复制到资产库”时与全局资产发生内容复制，不共享物理对象或生命周期。

## 3. 平台存储机制调查

### 3.1 Android

Android 10 及以上以分区存储为默认边界。应用可以无额外存储权限地访问自己的私有目录，但不能把公共存储当成 PC 文件系统任意遍历。

| 机制 | 适合用途 | 生命周期与限制 |
| --- | --- | --- |
| 应用私有 Files/AppData | 托管原件、SQLite、不可丢失的衍生数据 | 卸载时删除；普通文件管理器不可直接管理；不需要存储权限 |
| 应用私有 Cache | 缩略图、视频封面、波形、临时导入文件 | 空间紧张时可被系统清理；必须允许重建 |
| Storage Access Framework | 用户从系统文件提供方选择文档 | 返回 `content://` URI；一次授权不等于永久路径；长期引用需持久 URI 权限且提供方必须支持 |
| 系统 Photo Picker | 用户选择指定图片或视频 | 不需要全量相册权限；适合隐私优先的选择式导入 |
| MediaStore | 将图片、视频或音频保存到系统媒体库 | 适合“保存到相册/媒体库”，不适合作为 AIO 私有资产索引 |
| Android 分享 Intent | 从其他应用接收一个或多个文件 | URI 授权通常跟随 Intent 生命周期；应尽快复制到导入暂存区 |

设计影响：

- 数据库不得把 Android `content://` 当作普通绝对路径。
- 分享入口和普通文件选择器得到的 URI 应先进入暂存导入流程，再变成托管资产。
- 如果后续支持外部长期引用，需要原生插件调用 `takePersistableUriPermission`，并处理权限被撤销、文档被移动、云端内容暂不可用等状态。
- 不应为了“浏览所有照片”默认申请全量媒体读取权限。Android 13/14 的媒体权限与部分照片授权会让该方案更复杂，也不符合首版最小权限目标。

### 3.2 iOS

iOS 应用运行在沙盒中。应用自己的 Documents、Library/Application Support、Library/Caches 和 tmp 具有不同的备份及清理语义，外部文件提供方并不是可永久信任的普通路径。

| 机制 | 适合用途 | 生命周期与限制 |
| --- | --- | --- |
| Application Support | 托管原件、SQLite、不可重建的元数据 | 应用私有；默认可能参与备份，需按产品备份策略设置排除属性 |
| Caches | 缩略图、波形、可重建转码 | 系统可清理；不能存唯一原件 |
| tmp | 单次导入、导出与分享的中间文件 | 系统可随时清理；任务完成后主动释放 |
| Document Picker | 从 Files/iCloud Drive/第三方提供方选择文档 | Tauri dialog 返回 `file://` URI；长期原地访问需安全作用域书签与失效恢复 |
| Photos Picker | 用户选择指定照片或视频 | 适合最小权限导入；选择结果应复制到托管库 |
| Share Sheet / Photo Library | 导出到其他应用、Files 或照片库 | 应由系统分享/保存入口承接，不使用“打开所在目录”概念 |

设计影响：

- 首版应将外部选择结果复制到 Application Support 下的资产库。
- 可重建预览进入 Caches，不能和原件放在同一清理策略中。
- 若后续支持长期外部引用，需要保存并恢复 security-scoped bookmark，处理 stale bookmark 与提供方离线。
- 大型生成内容是否进入 iCloud 备份必须有明确策略。建议默认排除可再生成内容和缓存，用户主动保留且不可重建的原件再考虑备份。

### 3.3 Tauri v2 能力边界

- 官方 dialog 插件在 Android 返回 content URI，在 iOS 返回 `file://` URI。
- 官方 fs 插件可以读取这些格式，但 capability 仍需按命令和目录最小授权。
- Tauri 支持移动端文件关联，可通过 `bundle.fileAssociations` 接收 `View`、`Send`、`SendMultiple` 等入口。
- 照片选择、相机、保存到照片库、分享面板和长期外部授权仍可能需要移动端原生插件层，不能假设 Web `<input type="file">` 覆盖全部真实运行态能力。

## 4. 产品边界

### 4.1 首版目标

1. 统一查看 AIO Hub 在本机托管的图片、视频、音频、文档和其他文件。
2. 从系统照片、系统文件和其他 AIO 工具导入资产。
3. 支持搜索、按类型筛选、预览、分享/导出、查看来源和使用位置。
4. 清晰展示 AIO Hub 占用空间，并按月份、来源、类型和影响范围安全回收原件、缓存与失败任务。
5. 为聊天附件与媒体生成等共享工作集提供稳定的 `assetId` 和读取接口。
6. 支持将音视频或文档批量转写/提取为文本，在消费者完成替代后删除原件。

### 4.2 首版不做

- 不浏览或接管整台手机的文件系统。
- 不把系统照片库镜像成 AIO 资产列表。
- 不提供 PC 式目录树、侧边栏、右键菜单、卡片尺寸切换或“打开所在目录”。
- 不提供系统级垃圾清理，也不声称可以清理其他应用的数据。
- 不做全库重复文件扫描。内容寻址导入已在写入时去重，重复扫描不应成为常用功能。
- 不默认支持外部文件长期仅引用。
- 不接管 `agent-manager` 的智能体私有资产、头像和资源包生命周期。
- 不在首版实现复杂文档渲染或后台媒体转码中心。

## 5. 核心概念

### 5.1 资产与文件位置分离

`Asset` 是稳定的业务对象，文件位置只是它当前可用的一个存储实体。不能继续让一个 `path` 字段同时承担业务 ID、预览地址和外部来源三种职责。

建议将移动端领域拆成：

- `AssetRecord`：稳定 ID、类型、名称、MIME、大小、哈希、状态。
- `AssetObject`：托管原件或外部定位器，描述当前如何读取内容。
- `AssetOrigin`：照片选择、文件选择、相机、分享、网络、生成工具等来源历史。
- `AssetUsage`：聊天消息、生成任务等对全局资产的业务引用及删除影响策略。
- `AssetVariant`：缩略图、视频封面、波形、转码文件等衍生物。

### 5.2 所有权与保留语义

全局资产、智能体私有资产和缓存具有不同的所有权，不能只因为内容格式相同就合并存储：

| 类别 | 所有者 | 生命周期 | 全局资产 ID |
| --- | --- | --- | --- |
| 全局可回收资产 | `asset-manager` | 可按时间、来源、类型或影响范围清理；可由用户固定保留 | 有 |
| 智能体私有资产 | `agent-manager` | 随智能体导入、导出、复制和删除；Handle 与相对路径属于智能体包契约 | 无 |
| 可重建缓存 | 产生缓存的模块或资产服务 | 可自动清理并按需重建 | 仅关联到原资产，不作为独立业务资产 |

“可回收”不等于系统可以无提示随时删除。自动任务默认只清理缓存、临时文件和失败任务；删除托管原件需要用户明确操作或用户启用的保留策略。业务引用决定提示强度和替代流程，不把所有引用一律解释为永久保留。

### 5.3 三层存储

```text
持久原件层  AppData/Application Support（不被系统自动清理，但可由用户回收）
  asset_manager.db
  assets/objects/<hash-prefix>/<content-hash>.<ext>

可重建层    Cache
  assets/previews/<asset-id>/<variant>
  assets/waveforms/<asset-id>.bin

临时层      Cache/tmp
  assets/imports/<job-id>.part
  assets/exports/<job-id>/...
```

只持久化相对路径。运行时根据平台目录 API 解析根路径，避免应用迁移或 Android adopted storage 变化后绝对路径失效。

### 5.4 内容寻址与导入

导入时采用单次流式管线：一边读取来源，一边写入 `.part` 暂存文件并计算 SHA-256，避免大视频先完整哈希再复制导致双倍 I/O。

完成后：

1. 根据哈希检查是否已有托管对象。
2. 已存在则合并来源记录并删除暂存文件。
3. 不存在则原子移动到对象目录并创建资产记录。
4. 数据库提交失败时删除新对象；文件移动失败时不提交数据库。
5. 应用异常退出后，由恢复任务清理过期 `.part` 或继续可恢复任务。

## 6. 数据模型草案

资产模块使用独立的 `asset_manager.db`。以下是逻辑模型，不在本轮锁定具体 SQLite DDL。

### 6.1 `assets`

| 字段 | 说明 |
| --- | --- |
| `id` | UUID，跨工具稳定引用 |
| `content_hash` | 托管内容 SHA-256，唯一索引 |
| `kind` | image/audio/video/document/other |
| `mime_type` | 标准 MIME |
| `display_name` | 当前展示名称，不作为物理文件名 |
| `size_bytes` | 原件大小 |
| `storage_mode` | managed/linked；首版只创建 managed |
| `relative_path` | 托管原件相对路径，linked 时为空 |
| `availability` | ready/importing/reclaimed/missing/error；reclaimed 表示用户主动回收原件 |
| `library_state` | visible/hidden |
| `retention_policy` | reclaimable/pinned；默认 reclaimable |
| `created_at` / `updated_at` | UTC 时间 |

### 6.2 `asset_origins`

记录每次导入来源。同一内容被不同工具或入口重复导入时，不复制原件，只追加来源。

主要字段：`asset_id`、`origin_kind`、`source_module`、`original_name`、`locator`、`created_at`。`locator` 可能包含敏感 URI，不进入普通日志和导出诊断包。

### 6.3 `asset_usages`

记录资产正在被什么使用：`asset_id`、`module_id`、`entity_type`、`entity_id`、`role`、`usage_policy`、`created_at`。

`usage_policy` 分为：

- `blocking`：删除前必须先解除引用或完成替代，例如用户明确设置“保留原件”的消息附件。
- `advisory`：允许删除，但必须展示影响范围；删除后消费者保留名称、MIME、大小、转写文本等轻量快照，并显示“原件已清理”。聊天附件与媒体生成历史默认使用该策略。

usage 是删除影响索引，不是跨模块数据库外键。消费者数据与 `asset_manager.db` 分属不同事务域，写入必须幂等；建议对 `(asset_id, module_id, entity_type, entity_id, role)` 建唯一约束，并提供按业务实体整体替换 usage 的批量接口。启动恢复任务应能根据消费者数据重建或校验 usage，避免崩溃造成漏引用或僵尸引用。

### 6.4 `asset_variants`

记录衍生文件：`asset_id`、`variant_kind`、`relative_path`、`size_bytes`、`rebuildable`、`created_at`。

空间管理按 `rebuildable` 清理，而不是根据文件扩展名猜测。

### 6.5 `import_jobs`

记录大型导入的状态与恢复信息：`id`、`source_kind`、`state`、`bytes_copied`、`total_bytes`、`temp_path`、`error_code`、`created_at`。

首版可以只支持失败清理和取消，不承诺跨进程断点续传；保留表结构是为了避免任务状态只能活在 WebView 内存中。

### 6.6 跨工具引用契约

消费者只持久化全局资产 ID 和业务所需的轻量快照，不保存资产库相对路径、绝对路径或外部 URI：

```ts
interface ManagedAssetRef {
  assetId: string;
  usagePolicy: "advisory" | "blocking";
  snapshot: {
    displayName: string;
    kind: "image" | "audio" | "video" | "document" | "other";
    mimeType: string;
    sizeBytes: number;
    extractedText?: string;
  };
}
```

轻量快照属于消费者数据，用于原件被清理后的历史展示，不反向覆盖资产记录。聊天消息附件表、媒体生成任务输入输出等结构都应引用 `assetId`，不得另建 `file_path` 作为资产真相来源。

存在 `advisory` usage 时，回收操作删除物理原件和可重建变体，但保留最小资产 tombstone，将 `availability` 设为 `reclaimed`。这样消费者可以区分“用户主动清理”和“文件意外缺失”，`assetId` 也能继续解析。没有任何 usage 的 tombstone 可以彻底删除；相同内容以后重新导入时，应优先恢复原 tombstone 和 `assetId`，再追加新的来源记录。

需要把原件交给 LLM 或其他 Rust 服务时，跨模块传递 `{ kind: "managed-asset-ref", assetId }`，由 Rust 资产服务在内部解析并流式读取。现有只接受真实路径的 `local-file-ref` 不能作为移动端全局资产的长期公共契约。

## 7. 删除与空间回收语义

移动端应用私有目录没有可依赖的系统回收站。“删除”不能照搬桌面端文案。

建议统一为三类操作：

| 操作 | 行为 | 风险 |
| --- | --- | --- |
| 从资产库隐藏 | 不再出现在普通资产列表，保留原件与业务引用 | 可恢复，低风险 |
| 清理可重建内容 | 删除缩略图、波形、临时导出、失败导入 | 可自动重建，低风险 |
| 删除无引用原件 | 删除未被业务使用且未固定保留的托管原件 | 不可恢复，中风险 |
| 删除有建议型引用的原件 | 展示受影响位置，确认后删除物理原件并保留 `reclaimed` tombstone；消费者保留轻量快照 | 历史附件或结果无法再次打开，高风险 |
| 删除有阻止型引用的原件 | 拒绝删除，要求先解除引用、取消保留或完成文本替代 | 防止违反用户明确的保留承诺 |

详情页和批量清理确认页应显示“正在被 3 个对话使用”等影响信息，并提供跳转查看使用位置。删除原件不级联删除聊天消息或生成任务；消费者必须能在原件不存在时继续加载，并根据 `reclaimed` tombstone 明确展示“原件已清理”，不能与 `missing` 故障混为一谈。

“可清理资产”定义为：

- 不处于导入或处理中；
- 超过可配置保留期；
- `retention_policy = reclaimable`；
- 没有 `blocking` usage；
- 若存在 `advisory` usage，进入“有影响可清理”分组并要求额外确认。

### 7.1 转写或文本提取后删除

“批量转写后删除原件”是跨模块替代流程，不由 Rust 资产服务自行调用模型：

1. 资产管理器按类型、月份或来源筛选音视频和文档，并查询 usage 影响。
2. 前端编排层调用已有 LLM/转写能力生成文本；资产服务只提供受控读取和任务进度。
3. 对每个消费者写入转写文本、提取文本或摘要快照，并提交消费者自身数据。
4. 消费者将对应 usage 释放或从 `blocking` 降为 `advisory`，记录原件已被文本替代。
5. 全部阻止型引用解除后删除托管原件；失败项保留原件并允许重试。

该流程必须逐项可恢复，不能在文本尚未持久化时先删除原件，也不能因为部分项目失败而回滚已经成功保存的其他项目。

## 8. 信息架构与交互

### 8.1 一级结构

资产管理器只有两个一级视图：

- `资产`：查找、预览、导入与使用资产。
- `空间`：理解占用、清理可重建内容和未使用资产。

不设置常驻侧边栏。类型、来源与使用模块通过顶部筛选条和底部筛选面板完成。

### 8.2 资产首页线框

```text
┌─────────────────────────────┐
│ ‹ 资产管理            搜索  ⋮ │
│ [ 资产 ] [ 空间 ]             │
├─────────────────────────────┤
│ AIO Hub 已使用 1.8 GB         │
│ 图片  视频  音频  文档  其他    │
│                               │
│ 从照片   从文件   拍摄          │
├─────────────────────────────┤
│ [全部] [图片] [视频] [文档] ... │
│ 最近                  筛选/排序 │
│                               │
│  □  □  □                      │
│  □  □  □    三列缩略图网格      │
│  □  □  □                      │
│                               │
│          加载更多              │
└─────────────────────────────┘
```

交互规则：

- 点击资产进入全屏详情，不用桌面端单击选择语义。
- 长按进入多选，底部出现“分享、隐藏、删除”上下文操作栏。
- 搜索按钮展开为整行搜索输入，结果按最近使用排序。
- 类型使用横向可滚动筛选控件；月份、来源、使用影响和保留策略等复杂条件进入底部筛选面板。
- 视觉资产使用稳定的 1:1 三列网格，文档和无预览文件使用同尺寸类型占位，避免布局跳动。
- 平板或横屏可增加列数，但不切换为 PC 侧边栏布局。

### 8.3 空间页线框

```text
┌─────────────────────────────┐
│ AIO Hub 存储                  │
│ 1.8 GB                        │
│ ████████ 图片 / 视频 / 其他    │
│                               │
│ 可安全清理                     │
│ 预览与缓存            126 MB  › │
│ 失败的导入             38 MB  › │
│ 较早的可回收资产       412 MB  › │
│ 有使用影响的资产       186 MB  › │
│                               │
│ 按工具查看                     │
│ LLM 聊天              820 MB  › │
│ 媒体生成              640 MB  › │
└─────────────────────────────┘
```

空间页只报告全局资产库及其缓存，不纳入智能体私有资产。设备总容量与剩余容量只有在平台 API 能稳定获得且语义一致时才显示，不能用不完整数据制造“系统清理器”错觉。按工具统计表示“与该工具有关联的资产体积”，同一资产被多个工具使用时可以重复出现，因此各工具数值不承诺与总占用相加相等。

### 8.4 资产详情

详情页包含：

1. 顶部大预览或文件类型占位。
2. 名称、类型、大小、创建时间和离线可用状态。
3. 来源记录，例如“来自照片，由 LLM 聊天导入”。
4. 使用位置与引用策略，例如“2 个对话，其中 1 个要求保留原件”。
5. 保留策略，例如“可回收”或“固定保留”。
6. 底部主要操作：分享；次要菜单：保存到照片/文件、隐藏、转写后删除、永久删除。

“保存到照片”只对系统照片库支持的媒体显示；其他文件使用系统分享或保存到 Files，不把不同平台能力伪装成同一个目录选择操作。

## 9. 权限与失败体验

### 9.1 权限策略

- 只有在用户点击“从照片”“拍摄”等明确动作后请求对应权限。
- 文件选择优先使用系统选择器，不请求宽泛文件系统权限。
- Android 首版优先 Photo Picker，不默认请求 `READ_MEDIA_*`。
- 权限被拒绝时保持页面可用，显示就地说明和“前往系统设置”动作，不循环弹窗。
- 分享导入获得的临时 URI 立即复制，不把临时授权当成持久资产。
- capability 不向 WebView 开放 `asset_manager.db`、托管原件目录或缓存目录的直接写权限；其他模块通过资产命令和受控引用访问。

### 9.2 必须覆盖的异常状态

- 来源正在从云端下载，暂时无法读取。
- URI 权限已撤销或外部文件已移动。
- 导入过程中应用进入后台或被系统终止。
- 本机空间不足，暂存文件已占用部分空间。
- 哈希命中已有资产，只新增来源和 usage。
- 缩略图生成失败，回退到稳定文件类型图标。
- 数据库有记录但原件缺失，或磁盘有对象但数据库未提交。
- 用户主动回收后只剩 `reclaimed` tombstone；恢复任务不得把它误判为 `missing` 或重新生成原件。

启动恢复任务应修复可自动修复的不一致，并把无法修复的记录标为 `missing`，不能静默从列表消失。

## 10. 服务边界

### 10.1 前端职责

- 页面状态、筛选条件、选择状态与进度展示。
- 调用资产命令，不直接拼接真实文件路径。
- 消费受控预览来源；不把预览 URL、临时令牌或真实路径持久化到业务数据。
- 使用模块级 logger 与 error handler。
- 通过后续统一的 `customMessage` / `customDialog` 显示提示，不新增裸 Varlet 命令式调用。

### 10.2 Rust 资产服务职责

- 系统来源 URI 的流式读取。
- 暂存、哈希、去重、原子落盘与回滚。
- `asset_manager.db` 的 schema、迁移和所有写事务。
- 分页查询、空间统计、usage 校验与安全删除。
- 清理任务、启动一致性恢复与进度事件。
- 平台原生桥接的统一门面。
- 为 WebView 预览和原生 LLM 传输生成短期、只读、可撤销的受控读取来源；不向消费者返回资产库真实路径。

### 10.3 建议的命令面

命令名只表达领域行为，不暴露平台路径实现：

- `asset_import_sources`
- `asset_import_bytes`
- `asset_list`
- `asset_get_detail`
- `asset_get_preview_source`
- `asset_list_usages`
- `asset_register_usage` / `asset_release_usage` / `asset_replace_entity_usages`
- `asset_analyze_delete`
- `asset_set_retention_policy`
- `asset_get_storage_summary`
- `asset_clear_rebuildable_cache`
- `asset_delete`
- `asset_export`
- `asset_repair_library`

`asset_get_preview_source` 返回的是运行时预览描述符，不是可持久化路径。具体采用受控资源协议、短期令牌还是其他 WebView 可读取形式，由 Phase 0 真机实验决定。

`asset_import_bytes` 只用于有明确大小上限的小型内联结果。系统选择器、分享入口、网络下载和大型生成结果应交给 Rust 按 URI/URL 流式导入，避免二进制或 base64 跨 IPC 复制。

返回给前端的 Rust 结构体统一使用 `#[serde(rename_all = "camelCase")]`。

## 11. 与桌面端的兼容策略

移动端与桌面端对齐的是资产交换契约，不是数据库文件或物理目录。

应共享或保持兼容的字段：

- `id`、`type/kind`、`mimeType`、`name/displayName`、`size`、`createdAt`；
- `origins` 与 `sourceModule` 语义；
- 图片尺寸、音视频时长、哈希和 derived 元数据的可交换形式。

不跨端直接同步：

- 绝对路径、content URI、security-scoped bookmark；
- 缩略图缓存路径；
- 导入任务状态；
- 本机 usage 内部主键。

未来如做设备同步，应传输资产清单、业务引用与内容对象，由接收端重新落盘和生成本机定位信息。

智能体私有资产不属于该交换契约。智能体导入导出继续由 `agent-manager` 定义资源包格式、Handle、相对路径和完整性校验；与全局资产之间只提供显式复制，不共享 `assetId`。

## 12. 实施分期

### Phase 0：能力验证

- 在 Android 与 iOS 真机验证 Tauri dialog 对大文件、云端文件、多个文件和取消操作的返回行为。
- 验证 plugin-fs 读取 `content://` 与 `file://` 的真实运行态。
- 验证应用进入后台、系统杀进程和空间不足时的暂存文件行为。
- 做原生照片选择、分享导入、分享导出的最小插件实验，确认首版范围。

交付物是实验记录和 API 决策，不接业务 UI。

### Phase 1：资产内核

- 建立独立 `asset_manager.db` 与 Rust repository。
- 完成流式导入、内容寻址、来源、带策略的 usage、分页查询和一致性恢复。
- 建立移动端 Asset 类型与跨工具服务接口。
- 将聊天 SQLite 附件预案从 `file_path` 改为 `asset_id + 轻量快照`，并统一资产类型枚举。
- 扩展移动端原生 LLM 文件传输，使其接受 `managed-asset-ref` 并由 Rust 解析资产内容。
- 优先接入一个真实消费者，建议 LLM Chat 附件，验证 advisory/blocking usage、附件快照和删除降级生命周期。

### Phase 2：资产页

- 实现资产/空间双视图、搜索筛选、详情、按月份清理、影响分析和保留策略。
- 实现加载、空、错误、缺失、导入中和多选状态。
- 接入系统分享/保存能力。
- 接入批量转写或文本提取后的原件删除流程。

### Phase 3：平台增强

- 相机、移动端文件关联与分享进入 AIO。
- 评估外部长期引用模式。
- 按真实需求增加后台任务、转码、备份策略与跨设备同步。

## 13. 验收标准

### 数据正确性

- 同一内容从两个入口导入后只有一份托管原件，并保留两条来源记录。
- 有 `blocking` usage 或固定保留策略的资产不能被物理删除。
- 有 `advisory` usage 的资产经影响确认后可删除，消费者仍能加载文本与附件快照并显示“原件已清理”。
- 有建议型引用的原件被回收后保留 `reclaimed` tombstone；相同内容重新导入可恢复原 `assetId`。
- 批量转写只在文本成功写回消费者后释放引用和删除原件，失败项保留原件。
- 清理缓存不影响原件和业务引用，预览可重建。
- 中断导入不会产生可见的半成品资产或永久遗留大文件。
- 数据库和对象目录出现不一致时可检测、恢复或明确标记。
- 消费者数据库不持久化全局资产的真实路径；原件移动或应用目录变化后 `assetId` 仍可解析。

### 移动体验

- 360 px 宽度下顶部操作、筛选、网格和底部多选栏不重叠。
- 所有触控目标不小于项目移动端基准，长文件名不会撑破卡片。
- 首次进入、空库、权限拒绝、离线来源、空间不足都有完整状态。
- 只使用 AIO Hub 主题 token；Varlet 仅用于按钮、输入等叶子控件。
- 真机验证 Android WebView 与 iOS WKWebView，不用普通浏览器替代平台能力测试。

### 性能

- 列表与缩略图按需加载，不把原始大图整体读入 JS 内存。
- 大文件通过流式管线处理，避免双倍读取和 base64 跨 IPC。
- 空间统计来自数据库聚合与文件元数据，不在进入页面时递归扫描全库。
- 缩略图缓存有大小上限和最近使用清理策略。

## 14. 待评审决策

以下问题不阻塞本方案，但应在 Phase 0 后锁定：

1. 用户主动保留的托管原件是否进入 iOS 设备备份，还是全部默认排除并依赖未来同步。
2. 首版是否同时提供“从照片”和“拍摄”，还是先只做照片与文件选择。
3. 未使用资产的默认保留期，例如 7 天、30 天或只由用户手动清理。
4. advisory usage 的批量删除是否每次逐项确认，还是允许用户对特定筛选条件记住确认策略。
5. 平板是否仅增加网格列数，还是增加常驻详情双栏；建议首版只增加列数。
6. WebView 预览采用受控资源协议还是短期读取令牌，以 Android 与 iOS 真机行为为准。

## 15. 调查来源

- [Tauri v2 File System Plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri v2 Dialog Plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri v2 Mobile File Associations](https://v2.tauri.app/learn/mobile-file-associations/)
- [Tauri v2 Developing Mobile Plugins](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [Android Data and File Storage Overview](https://developer.android.com/guide/topics/data/data-storage)
- [Android App-Specific Storage](https://developer.android.com/training/data-storage/app-specific)
- [Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker)
- [Apple File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [Apple Document Picker](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)
- [Apple Photos Picker](https://developer.apple.com/documentation/photosui/photospicker)
