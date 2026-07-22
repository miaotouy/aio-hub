# 移动端实现盘点快照与当前工作入口

> 状态：Historical Snapshot（施工状态与范围以各工具当前计划为准）
> 代码调查日期：2026-07-18
> Android 真机补充验证：2026-07-20（报告导出时间 `2026-07-20T01:27:44.309Z`，文件名现包含完整 UTC 时分秒与毫秒）
> 调查范围：`mobile/` 当前代码、移动端计划/架构文档，以及直接影响移动端的跨端 LLM Core 计划
> 验证边界：2026-07-18 从仓库根目录恢复 Bun workspace 依赖后，完成宿主机前端构建、Vitest、Rust Clippy 和 Cargo Test；2026-07-20 补录 Android 11 真机上的 Tauri 验证台报告。该报告未记录具体设备型号，固定 ENOSPC 也不等于真实低存储设备；iOS、云端异常、专用照片/分享入口等最终验收项仍未覆盖

## 1. 结论

移动端已经形成可使用的 Beta 主链路：

```text
LLM 渠道与模型配置
  -> 模型批量检查、身份识别与 Embedding 空间配置
  -> Agent 创建、导入与模型绑定
  -> 创建普通会话或 Agent 绑定会话
  -> 上下文管道与本地 Token 统计
  -> 原生/HTTP Transport 发起流式请求
  -> 树形消息、usage 与会话文件持久化
```

当前不是空壳或单纯 UI 原型。核心文本对话链路、Agent 主链、跨端 Provider Core、原生文件请求边界和主题系统均已有真实实现。Android 真机已完成一轮隔离验证台测试，证明 SQLite spike 和部分系统文件场景能够在真实 Tauri 运行态工作，但这不等同于 SQLite 业务迁移、资产内核或双平台 Phase 0 已完成。尚未闭环的主体是 SQLite 持久化、全局资产与聊天附件、Agent 高级执行语义、设计层 API 收敛，以及 Android/iOS 最终真机发布验收。

## 2. 2026-07-18 已完成快照

### 2.1 应用基础

- [x] Tauri v2 + Vue 3 + TypeScript + Rust 工程骨架。
- [x] Pinia、Vue Router、Vue I18n、应用初始化与工具初始化流程。
- [x] `*.registry.ts` 自动扫描注册和工具路由聚合。
- [x] SafeTop、安全区、全局键盘避让和移动端滚动容器。
- [x] Vue I18n、中英文语言包、日志系统和模块级 logger/error handler 基础设施。
- [x] AIO Hub 主题 token、明暗主题、自定义主题色、壁纸、模糊、透明度、字号与圆角配置。

当前已注册 6 个工具：`llm-api`、`llm-chat`、`agent-manager`、`rich-text-renderer`、`log-manager` 和 `ui-tester`。其中后两项分别承担运行日志查看和开发期 UI/平台能力验证。

### 2.2 LLM 渠道与跨端 Core

- [x] 渠道与模型 CRUD、启停、预设创建和批量选择。
- [x] 多 API Key、Key 状态/熔断管理、自定义 Header 与自定义 Endpoint。
- [x] 模型拉取、模型元数据写入和模型能力/Token 上限编辑。
- [x] 移动端模型批量检查，包含模型选择、检查选项、成本确认、任务进度、结果详情和 Key 健康状态处理。
- [x] 模型身份解析、内置身份预设、自定义身份修订和 Embedding 空间分离配置。
- [x] 移动端通过 `@aiohub/llm-core` 复用共享 Provider Adapter、执行器和 Transport 合约。
- [x] OpenAI-Compatible、OpenAI Responses、Claude、Cohere、Gemini、Vertex AI 和 Embedding 主协议接线与自动化回归。
- [x] 共享模型列表、同步媒体和异步媒体协议能力；当前移动端没有对应的完整媒体生成业务工具页。
- [x] 移动端原生 `LocalFileRef` 请求，覆盖 tagged JSON、顶层文件、multipart 和取消。

跨端共享工作的代码与自动化验收已经完成，剩余项是记录真实 Tauri 性能数据和 Android/iOS 真机行为。详见 [`docs/Plan/llm-provider-adapter-sharing-investigation.md`](../../../docs/Plan/llm-provider-adapter-sharing-investigation.md)。

### 2.3 LLM Chat

- [x] 会话创建、切换、删除、恢复和自动命名。
- [x] 流式正文、推理内容、API usage 和错误状态收口。
- [x] 树形消息、分支记忆、兄弟分支切换、编辑另存分支、重新生成和级联删除。
- [x] 聊天输入区模型切换与模型有效性校验。
- [x] 独立会话文件 + JSON 索引持久化，包含差异写入和防抖保存。
- [x] UI、模型、消息管理和请求设置持久化。
- [x] 消息删除确认、自动滚动、键盘避让和全屏聊天布局。
- [x] `session-loader` 与 `agent-preset-loader` 上下文处理器。
- [x] 输入区上下文 Token 占比、消息级 Token、实际 usage 优先和 80%/90% 预警。

详细实现边界以 [`mobile/src/tools/llm-chat/ARCHITECTURE.md`](../../src/tools/llm-chat/ARCHITECTURE.md) 为准。

### 2.4 Agent Manager

- [x] 一智能体一目录、轻量索引、损坏索引恢复和未知字段保留。
- [x] Agent CRUD、搜索、分类筛选、默认智能体和模型绑定。
- [x] 多轮预设消息、消息组、启停、触摸排序和批量管理。
- [x] 注入策略与模型匹配字段的编辑和持久化。
- [x] AIO Agent JSON、SillyTavern JSON/PNG 导入，预设 JSON 导入导出。
- [x] 从角色大厅创建绑定 Agent 的会话。
- [x] 会话执行时加载 Agent 预设，并透传绑定模型与常用生成参数。
- [x] Rust `o200k_base` Token 估算在预设编辑器中的防抖接入。

当前实现进度详见 [`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)。

### 2.5 辅助工具与验证

- [x] RichTextRenderer 完成模块化迁移、测试用例预设和移动端测试页。
- [x] 日志查看、搜索、级别筛选、清空、导出和复制能力。
- [x] Android 生成工程已存在；Token 计划已记录 Android 构建通过。
- [x] 本次 `bun run build` 通过。
- [x] 本次 Vitest 17 个测试文件、56 个测试全部通过。
- [x] 本次 `bun run check:backend` 通过。
- [x] 本次 Cargo Test 5 个测试全部通过。

本次验证前执行了仓库根目录的 `bun install --frozen-lockfile`，以恢复 `mobile` 对 `@aiohub/llm-core` 及其 `testing` 子路径的 workspace 符号链接。仅在 `mobile/` 保留旧依赖目录而未同步根 workspace 时，前端构建和相关测试会因无法解析共享包而在导入阶段失败。

### 2.6 Android 真机验证台结果

2026-07-20 导出的 `aio-validation-2026-07-20.json`（报告内 `exportedAt = 2026-07-20T01:27:44.309Z`；旧版本文件名只精确到日期）为 schema `1.0` 脱敏报告。运行环境统一记录为 Android 11.0.0、aarch64、应用 `0.1.1-m-beta.2`、Tauri `2.11.5`，视口为 393 x 851、像素比 2.75。报告共 20 条 run，全部 `passed`。

**SQLite 隔离验证库**

- [x] Migration：历史 v0 fixture 升级到 v1，失败事务回滚为 0 行，并拒绝 schema version 999。
- [x] Codec：包含可选时间戳、未知 metadata 和附件快照的消息结构完成无损 round-trip；编码结果为 410 bytes。
- [x] 搜索：7 组固定查询共命中 9 条，3 字及以上走 trigram FTS，1/2 字走受限 `LIKE` 降级。
- [x] 事务强杀恢复：重启后 `partialRows = 0`、`foreignKeys = true`、`integrity = ok`。
- [x] 1k/10k/100k 基准：Rust 侧生成数据，1k/10k/100k 整步耗时分别为 21/94/697 ms；对应插入耗时为 5/40/434 ms。100k 数据库 6,594,560 bytes，SQLite high-water 5,343,704 bytes（10k 为 1,043,080 bytes，1k 为 185,440 bytes）。
- [x] 100k 基准冷/热查询为 33/24 ms，插入 434 ms，删除 82 ms，索引重建 96 ms；各规模会话查询均在计时粒度下限内。

**平台文件**

- [x] 多文件入口返回 2 个 Android `content://` 引用；首项样本 798,643 bytes，首字节 135 ms，读取 65,536 bytes 探针总耗时 140 ms。
- [x] 照片过滤入口返回 1 个 `content://` 引用；样本 2,283,162 bytes，首字节 90 ms，读取探针总耗时 92 ms。系统返回 MIME 为 `application/octet-stream`，后续业务不能依赖 picker MIME 判断图片类型。
- [x] 大文件完整顺序读取通过：66,603,617 bytes（63.52 MiB），64 KiB 分块，首字节 102 ms，总耗时 25,936 ms，平均 2.45 MiB/s，`failurePhase = none`。
- [x] 首份真机报告已证明单文件、多文件入口和照片入口的用户取消均未产生错误或验证沙箱文件；本次 20 条全通过报告未重复导出取消记录。
- [x] 固定 cache 沙箱原子写入/重开、写入失败后的 `.part` 清理和最终沙箱清理通过。
- [x] 固定 ENOSPC 故障注入在写入 65,536 bytes 后清理 `.part`；本次后台返回与系统终止后自动续测通过，首份真机报告中的云端下载与预览已由人工判定通过。
- [ ] 仍未覆盖真实低存储设备、云端离线/取消、预览令牌过期或原件缺失、原生 Photo Picker、分享导入/导出及 iOS security-scoped URL。

上述结果只来自验证工具的隔离数据库与 cache 沙箱，不代表 `llm_chat.db`、`asset_manager.db` 或正式聊天附件链路已经落地。

### 2.7 验证台增量实现与报告导出

在首份 Android 报告之后，验证台已补充以下可重复入口，并通过宿主机单元测试、类型检查和构建验证：

- [x] 使用官方 `plugin-os` 记录平台、系统版本和架构，并记录视口尺寸与像素比；旧 schema `1.0` 报告保持兼容。
- [x] 多文件场景要求至少返回 2 项，步骤标题直接显示选择数量；Android 系统选择器需长按首项进入多选。
- [x] 大文件完整顺序读取使用固定 64 KiB 缓冲区，提供实时进度和停止，记录总字节、首字节、总耗时、MiB/s 与失败阶段；provider 无法报告大小时以 EOF 判断完成。
- [x] 大文件吞吐基线使用固定 1 MiB 有界分块读取，减少 WebView/Tauri IPC 往返并记录完整读取速度；不使用一次性 `readFile`，避免把完整大文件载入 WebView 内存。
- [x] 文件读取中断恢复场景在 4 MiB（小文件取中点）关闭句柄，重新打开同一引用、精确 `seek` 到中断点并续读到 EOF，记录恢复偏移与延迟；该场景不等于跨进程断点续传。
- [x] 空间不足清理使用固定 ENOSPC 故障注入，写入 64 KiB 后确认 `.part` 被删除；该结果不替代真实低存储设备观察。
- [x] SQLite 基准内存从 `PRAGMA memory_used` 改为 `sqlite3_status64` current/high-water，宿主机测试断言 high-water 大于 0。

环境、多选、64 KiB 大文件读取、固定 ENOSPC 和 SQLite high-water 已包含在新的 Android 真机报告中；1 MiB 吞吐基线与中断后重开续读为报告之后追加，已取得 Android 16 x86_64 虚拟机报告，仍待 Android/iOS 真机报告。大文件入口验证的是 `plugin-fs` 分块读取链，不是正式 Rust 资产导入管线；固定 ENOSPC 是故障注入，不替代真实低存储设备观察。报告默认文件名已改为带 UTC 时分秒和毫秒的 `aio-validation-YYYY-MM-DD_HH-mm-ss-mmmZ.json`，避免同日导出互相覆盖或难以区分。

### 2.8 Android 虚拟机增量验证

2026-07-20 的 schema `1.0` 报告记录环境为 Android `16.0.0`、x86_64、应用 `0.1.1-m-beta.2`、Tauri `2.11.5`，视口为 412 x 891、像素比 2.625。新增环境字段、SQLite memory high-water 和 ENOSPC 注入均在报告中正常输出。

| 规模 | 总步骤 |   插入 |  冷/热查询 |  删除 | 索引重建 |          数据库 | SQLite high-water |
| ---- | -----: | -----: | ---------: | ----: | -------: | --------------: | ----------------: |
| 1k   |  33 ms |   8 ms |   0 / 0 ms |  3 ms |     3 ms |   118,784 bytes |     181,944 bytes |
| 10k  |  81 ms |  32 ms |   2 / 2 ms |  5 ms |    12 ms |   659,456 bytes |   1,043,080 bytes |
| 100k | 665 ms | 396 ms | 21 / 20 ms | 78 ms |   111 ms | 6,594,560 bytes |   5,343,704 bytes |

- [x] SQLx 环境与连接烟测通过：SQLite `3.46.0`、FTS5、WAL、foreign key、`synchronous=NORMAL` 和 4 连接池符合预期，写锁等待 86 ms。
- [x] Migration、codec、FTS 与事务强杀恢复再次通过。
- [x] 固定 ENOSPC 注入通过，写入 65,536 bytes 后没有残留 `.part`。
- [x] 大文件完整读取复测通过：Android `content://` 样本 14,714,525 bytes（14.03 MiB），使用 65,536-byte 块完整读取；首字节 231 ms、总耗时 4,360 ms、平均 3.22 MiB/s，`failurePhase = none`。
- [x] 1 MiB 吞吐基线复测通过：14.03 MiB 样本两次为 15.54/18.69 MiB/s，155.81 MiB 样本为 30.71 MiB/s。现有非通过记录分别是选择器取消（`bytesRead = 0`）和应用重启恢复时将未完成 run 标记为 `RUN_INTERRUPTED`，均不是读取链失败。
- [x] 155.81 MiB 样本的中断后重开续读三次通过：均在 4,194,304 bytes 关闭原句柄并从同一偏移恢复，恢复延迟为 14/19/65 ms，完整读取平均 17.92/18.45/32.82 MiB/s；另有一条用户主动停止后的 `cancelled` 记录。
- [x] 语言设置即时应用通过：Settings Store 更新后会同步 i18n locale。验证页自身仍有大量硬编码中文，因此在测试页内不能通过整页文案切换观察效果；该 i18n 覆盖作为后续 UI 收尾项保留。

大文件复测证明 64 KiB/1 MiB IPC 块、EOF 完成判定以及同一运行内的关闭、重开和 `seek` 续读可在当前 Android 16 x86_64 虚拟机工作。恢复只需 14–65 ms，旧 UI 来不及呈现中断阶段；验证台现已保留阶段提示和独立报告步骤。应用在吞吐 run 进行中重启时，现有恢复逻辑会将未完成 run 标记为 `RUN_INTERRUPTED`，不会自动续读文件。该结果仍属于验证台方向性吞吐，不代表正式资产导入管线或跨进程断点续传，也不替代 Android 真机和 iOS 验收。

## 3. 当前工作入口

本次盘点不再维护跨模块未完成清单。该清单已混入 2026-07-18 前的实现假设，继续保留会与已完成的 SQLite、资产和搜索链路冲突。后续施工按模块进入对应的唯一计划或架构文档：

- 聊天 SQLite、附件 outbox 和搜索：[`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)。
- 资产 Android MVP、真实设备与 iOS 门禁：[`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)。
- Android Studio AVD 自动化、确定性附件发送与失败产物：[`mobile-android-avd-e2e-plan.md`](./mobile-android-avd-e2e-plan.md)。
- Agent 管理器剩余管道与私有资产：[`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md) 和 [`ARCHITECTURE.md`](../../src/tools/agent-manager/ARCHITECTURE.md)。
- 设计分层和项目级 UI 收尾：[`mobile-design-language-investigation.md`](./mobile-design-language-investigation.md)。
- Token 的设备性能和 iOS 验证：[`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

## 4. 文档状态与使用规则

- `mobile/src/tools/llm-chat/ARCHITECTURE.md` 已于本次调查同步到当前代码状态。
- `mobile-agent-manager-plan.md` 和 `mobile-token-counting-plan.md` 的阶段状态与当前代码基本一致。
- `mobile-sqlite-migration-plan.md` 已进入施工并完成聊天 SQLite 与附件消费主链；其当前状态以该文件为准。
- `mobile-asset-manager-design.md` 是资产管理器唯一施工范围来源，当前为 Android MVP 收尾；本快照不得覆盖其状态。
- `mobile-design-language-investigation.md` 的 Phase 0 已完成，Phase 1 只完成了包装 API 的局部落地，业务调用尚未收口。
- `platform-validation-workbench-plan.md` 的验证台、平台文件 spike 和 SQLite spike 已施工，并取得 Android 真机报告；平台结论按 Android/iOS 分别记录，iOS 报告保留为 iOS 发布门禁。
- `mobile-android-avd-e2e-plan.md` 已建立移动端脚本化测试补齐路线；当前仍为待实施，既有 Android 模拟器记录以人工 smoke 为主，不得写成自动化回归已完成。
- `llm-provider-adapter-sharing-investigation.md` 的代码与自动化验收已完成；本次真机报告未覆盖 LLM transport，相关人工性能与双平台真机验收仍未完成。
- 2026-07-16 完成的移动端模型批量检查和 2026-07-18 完成的模型身份/Embedding 空间分离已纳入本快照；它们属于现有 `llm-api` 工具能力，不新增工具 registry。

本文件保留 2026-07-18 的盘点事实，不承担资产或聊天的实时施工清单。后续施工必须读取对应工具当前计划和架构，不能从本快照扩展范围。

## 5. 当前收敛路线（2026-07-21）

1. 冻结资产 Android MVP 范围，只完成文件/照片导入、资产页、基础预览、导出、删除影响、恢复修复和一个真实聊天附件消费者。
2. 优先完成 Android Studio AVD 中的端到端附件发送和一轮 Android 真机主流程。附件默认由本机确定性 OpenAI-compatible 服务校验 MIME、字节数与 SHA-256 并返回流式响应，Ollama 多模态模型作为可选语义验收；不再为聊天搜索、相机、文本替代或 token 长时间到期验证创建资产施工批次。
3. 相机、分享进入 AIO、文件关联、批量转写/文本提取和其他消费者移至资产 Phase 3。已经存在的实现可以保留，但不作为 MVP 门禁继续扩展。
4. iOS 在设备条件具备后执行同一套平台场景，作为 iOS 发布门禁；缺少 iOS 设备不重复阻塞 Android 开发，也不能被记录为通过。
5. 开发循环只跑受影响测试；功能批次结束运行全量测试、Clippy、类型检查和 Vite 构建；单 ABI debug APK 用于原生能力变化，四 ABI APK/AAB 只用于里程碑或发布候选。

Android 模拟器回归的后续施工以 [`mobile-android-avd-e2e-plan.md`](./mobile-android-avd-e2e-plan.md) 为准：默认只使用 Android Studio AVD，所有设备操作显式绑定 serial，禁止自动接管用户正在使用的 LDPlayer/雷电等第三方模拟器；截图只作为失败证据和视觉复核，不作为逐步控制手段。

施工顺序的硬约束保持不变：聊天附件依赖全局资产契约；Agent 私有资产属于不可被全局清理策略回收的角色包内容。两者只能复制内容，不能共享 ID 或生命周期。
