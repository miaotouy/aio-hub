# 移动端当前实现盘点与后续参考

> 状态：Current Snapshot
> 代码调查日期：2026-07-18
> Android 真机补充验证：2026-07-20（报告导出时间 `2026-07-19T23:20:44.419Z`）
> 调查范围：`mobile/` 当前代码、移动端计划/架构文档，以及直接影响移动端的跨端 LLM Core 计划
> 验证边界：2026-07-18 从仓库根目录恢复 Bun workspace 依赖后，完成宿主机前端构建、Vitest、Rust Clippy 和 Cargo Test；2026-07-20 补录一份 Android 真机上的 Tauri 验证台报告。该报告未记录设备型号和 Android 版本，未覆盖 iOS、10k/100k SQLite 基准、真实多文件选择、大文件、空间不足等最终验收项

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

## 2. 已完成清单

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
- [x] 本次 Vitest 12 个测试文件、42 个测试全部通过。
- [x] 本次 `bun run check:backend` 通过。
- [x] 本次 Cargo Test 5 个测试全部通过。

本次验证前执行了仓库根目录的 `bun install --frozen-lockfile`，以恢复 `mobile` 对 `@aiohub/llm-core` 及其 `testing` 子路径的 workspace 符号链接。仅在 `mobile/` 保留旧依赖目录而未同步根 workspace 时，前端构建和相关测试会因无法解析共享包而在导入阶段失败。

### 2.6 Android 真机验证台结果

2026-07-20 补录的 `aio-validation-2026-07-19.json` 为 schema `1.0` 脱敏报告，运行环境统一记录为 Android、应用 `0.1.1-m-beta.2`、Tauri `2.11.5`。报告共 20 条 run：16 条 `passed`、3 条用户主动取消产生的 `cancelled`，以及 1 条较早的后台恢复 `manualPending`；同一后台恢复场景随后已有一条人工判定 `passed`，因此该待判定记录不代表仍有阻塞。

**SQLite 隔离验证库**

- [x] Migration：历史 v0 fixture 升级到 v1，失败事务回滚为 0 行，并拒绝 schema version 999。
- [x] Codec：包含可选时间戳、未知 metadata 和附件快照的消息结构完成无损 round-trip；编码结果为 410 bytes。
- [x] 搜索：7 组固定查询共命中 9 条，3 字及以上走 trigram FTS，1/2 字走受限 `LIKE` 降级。
- [x] 事务强杀恢复：重启后 `partialRows = 0`、`foreignKeys = true`、`integrity = ok`。
- [x] 1k 基准：Rust 侧生成 1,000 行，整步耗时 19 ms；报告记录插入 3 ms、删除 1 ms、索引重建 1 ms、数据库 114,688 bytes，冷/热查询和会话查询均为 0 ms（计时粒度下限）。
- [ ] 该报告没有执行 10k/100k 预设；`peakSqliteMemoryBytes = 0` 也不能作为真实峰值内存结论，因此大规模性能与内存仍待补测。

**平台文件**

- [x] 单文件选择返回 Android `content://` 引用；样本 798,643 bytes，首字节 91 ms，读取 65,536 bytes 探针总耗时 94 ms。
- [x] 照片过滤入口返回 `content://` 引用；样本 139,437 bytes，首字节 59 ms，读取探针总耗时 60 ms。系统返回 MIME 为 `application/octet-stream`，后续业务不能依赖 picker MIME 判断图片类型。
- [x] 单文件、多文件入口和照片入口的用户取消均未产生错误或验证沙箱文件。
- [x] 固定 cache 沙箱原子写入/重开、写入失败后的 `.part` 清理和最终沙箱清理通过。
- [x] 后台返回、云端下载与预览由人工判定通过；系统终止后自动续测确认没有半成品文件。
- [ ] “多文件”通过记录的 `selectionCount` 实际为 1，只证明多选入口可返回并读取单个 `content://` 项，不能证明多个文件的返回、顺序和逐项权限行为。
- [ ] 未覆盖大文件、`file://`、云端离线/取消、预览令牌过期或原件缺失、空间不足、原生 Photo Picker、分享导入/导出及 iOS security-scoped URL。

上述结果只来自验证工具的隔离数据库与 cache 沙箱，不代表 `llm_chat.db`、`asset_manager.db` 或正式聊天附件链路已经落地。

## 3. 未完成清单

### 3.1 持久化与资产主线

- [ ] 引入 `tauri-plugin-sql` 并建立移动端数据库服务和 migration 机制。
- [ ] 将 LLM Chat 从 JSON 会话文件迁移到 `llm_chat.db`。
- [ ] 建立 `chat_sessions`、`chat_messages`、`chat_attachments`、FTS5 和 usage outbox。
- [ ] 实现消息/分支/会话删除时的附件引用释放和幂等 outbox 投递。
- [ ] 完成资产管理 Phase 0。Android 已有一轮部分场景报告，仍缺真实多文件、大文件、空间不足、专用照片/分享入口等覆盖；iOS 尚未开始真机验收。
- [ ] 建立 `asset_manager.db`、内容寻址、来源、usage、分页查询和一致性恢复。
- [ ] 实现资产/空间页面、详情、筛选、清理、影响分析和保留策略。
- [ ] 在聊天中接入 `ManagedAssetRef`、图片/文件发送、预览和 `reclaimed` 降级展示。

SQLite 施工顺序见 [`mobile-sqlite-migration-plan.md`](./mobile-sqlite-migration-plan.md)，资产边界见 [`mobile-asset-manager-design.md`](./mobile-asset-manager-design.md)。

### 3.2 Chat 与 Agent 功能

- [ ] `macros-renderer` 宏替换/模板渲染。
- [ ] `depth-injector` 深度注入。
- [ ] 用户档案管理和 `user-profile-injector`。
- [ ] 执行 Agent 预设消息的 `injectionStrategy` 和 `modelMatch`；当前只编辑和保存这些字段。
- [ ] 聊天内切换 Agent。
- [ ] 将 Agent 开局消息实例化到新会话。
- [ ] Agent 私有头像、背景、预设附件和二进制资产管理。
- [ ] Agent 完整参数编辑和与桌面端最新类型/分类定义的兼容性收尾。
- [ ] 消息搜索/过滤、消息引用回复、会话搜索和排序。
- [ ] 补齐消息复制失败反馈与 Android/iOS 剪贴板权限验收；当前已调用 `navigator.clipboard.writeText()`，但失败分支会静默关闭菜单。
- [ ] 会话删除、清空确认设置的完整接线。
- [ ] 流式开关、时间戳、模型信息开关、自动滚动开关和消息字号的运行时接线。
- [ ] 默认模型偏好的运行时接线；当前无有效选择时直接回退到第一个可用模型。
- [ ] 请求超时和最大重试次数的运行时接线。
- [ ] 清理聊天页、会话列表、编辑弹窗和输入提示中的硬编码中文，完成双语覆盖。

### 3.3 设置、设计分层与工程收尾

- [ ] 实现触感反馈。
- [ ] 实现当前设置页中禁用的全局网络/代理设置，或删除无效入口并明确 Profile 网络设置边界。
- [ ] 完成设计语言 Phase 1：业务代码统一通过项目 `customMessage/customDialog`，不再直接调用 Varlet `Snackbar/Dialog`。
- [ ] 按实际痛点逐步减少 `var-cell`、`var-app-bar`、`var-popup`、`var-paper` 对页面骨架的承担。
- [ ] 根据真实复用需求建立 `mobile/src/components/base/`，不预建无消费者的组件库。
- [ ] 将设置页硬编码版本 `0.1.0` 改为与 `0.1.1-m-beta.1` 的单一版本来源同步。
- [ ] 处理或接受记录 `vconsole` 直接 `eval` 的构建警告。
- [ ] 拆分首页超过 500 kB 的构建 chunk；本次生产构建中 `Home` chunk 为 580.68 kB，重点检查工具 registry eager import 与共享配置进入首页包的影响。
- [ ] 增加 Agent 存储/导入、会话绑定、分支操作和上下文管道专项测试。
- [x] 将 `ui-tester` 升级为“组件与平台测试”验证台，已交付平台文件与 SQLite 操作板块、统一运行记录、跨重启续测和脱敏报告导出。

设计分层决议见 [`mobile-design-language-investigation.md`](./mobile-design-language-investigation.md)。

### 3.4 平台与发布验收

- [x] 完成 Android universal APK/AAB 构建，并在至少一台 Android 真机运行验证台和导出 schema `1.0` 报告。
- [ ] 补齐 Android 真机最终验收：至少包括 SQLite 10k/100k 与峰值内存、真实多文件、大文件、空间不足、云端异常、专用照片/分享入口，并记录设备型号和 Android 版本。
- [ ] 初始化或补齐仓库中的 iOS 生成工程，并完成 iOS 构建与真机验收。
- [ ] 在真实 Tauri WebView 验证长流逐段交付、取消、前后台切换和系统终止行为。
- [ ] 验证 JSON/顶层/multipart 文件引用在 Android/iOS 的权限和生命周期行为。
- [ ] 采集大文本与文件请求的 WebView/Rust 峰值内存、主线程阻塞和 TTFB。
- [ ] 验证 Token 初始化耗时、批量性能和真机峰值内存。

## 4. 文档状态与使用规则

- `mobile/src/tools/llm-chat/ARCHITECTURE.md` 已于本次调查同步到当前代码状态。
- `mobile-agent-manager-plan.md` 和 `mobile-token-counting-plan.md` 的阶段状态与当前代码基本一致。
- `mobile-sqlite-migration-plan.md` 是未施工的实施计划，不代表已有数据库代码。
- `mobile-asset-manager-design.md` 状态仍为待评审，所有 Phase 均应视为未开始。
- `mobile-design-language-investigation.md` 的 Phase 0 已完成，Phase 1 只完成了包装 API 的局部落地，业务调用尚未收口。
- `platform-validation-workbench-plan.md` 的验证台、平台文件 spike 和 SQLite spike 已施工，并取得首份 Android 真机脱敏报告；由于 Android 覆盖仍不完整且没有 iOS 报告，资产与 SQLite Phase 0 尚未最终验收。
- `llm-provider-adapter-sharing-investigation.md` 的代码与自动化验收已完成；本次真机报告未覆盖 LLM transport，相关人工性能与双平台真机验收仍未完成。
- 2026-07-16 完成的移动端模型批量检查和 2026-07-18 完成的模型身份/Embedding 空间分离已纳入本快照；它们属于现有 `llm-api` 工具能力，不新增工具 registry。

后续更新本文件时，应以代码、依赖和本次可复现验证为准；计划文档中的历史勾选只作为施工记录，不应覆盖当前代码事实。

## 5. 下一步施工路线

### 5.1. 当前收尾：冻结边界与双端能力验证

验证台及两个隔离 spike 已完成实现，并取得一份 Android 真机部分覆盖报告。进入业务数据施工前仍需收完以下边界：

1. **资产 Phase 0**：保留本次 Android 已通过的 `content://`、取消、后台、系统终止和沙箱清理结论；补测真实多文件、大文件、空间不足、云端异常、专用照片/分享入口，并在 iOS 验证 `file://` 与 security-scoped URL。完成后输出首版文件入口范围和预览方案决策。
2. **SQLite Phase 0**：保留本次 Android migration、codec、FTS、事务强杀恢复和 1k 基准结论；补跑 Android 10k/100k、可解释的峰值内存指标，并完成 iOS 全套固定场景。
3. **验证 UI**：实现已完成；继续用现有结构化步骤、人工判定、跨重启续测和脱敏报告导出补齐双端运行记录。没有双端 UI 运行记录的 spike 不算完成。
4. **契约冻结**：锁定 `ManagedAssetRef`、资产服务领域命令、聊天 storage command、Schema v1 与 metadata codec；聊天前端不得获得任意 SQL 执行入口。

SQLite 旧计划中的 JS `db.ts`、`PRAGMA user_version` 和前端事务方案已被后续调查否决；当前实施边界以 Rust 领域命令、原生 migration runner 和统一连接配置为准。

验证台的信息架构、隔离策略和场景清单见 [`platform-validation-workbench-plan.md`](../../src/tools/ui-tester/docs/Plan/platform-validation-workbench-plan.md)。

### 5.2. 两条可并行主线

**A 线：全局资产内核**

- 建立 `asset_manager.db` 与 Rust repository，完成流式导入、内容寻址、来源、usage、tombstone、分页查询和一致性恢复。
- 建立 `ManagedAssetRef` 和跨工具服务接口；扩展原生 LLM 文件传输，由 Rust 解析托管资产，不把大文件转成 base64 穿过 IPC。
- 此阶段只做最小验证入口，不先建设完整资产页面。

**B 线：聊天 SQLite 基础**

- 建立 `llm_chat_storage`、SQLx migrations、连接池、无损 codec 和领域级 Tauri commands。
- 先迁移会话列表、单会话加载和消息 change set；`currentSessionId` 继续由 ConfigManager 管理。
- 保留 JSON 实现作为短期开发回退，Android/iOS 数据闭环通过后删除；资产契约稳定前不固化附件写入流程。

### 5.3. 两线汇合：附件、引用与搜索闭环

1. 在聊天库落地 `chat_attachments` 和 transactional usage outbox，覆盖附件替换、分支删除、会话删除、崩溃重试和幂等投递。
2. 接入聊天图片/文件选择、发送、预览及 `reclaimed` 降级展示，作为资产内核的第一个真实消费者。
3. 基于真机验证结果实现 FTS5 或 basic-search 降级，明确中日韩短查询、英文前缀、特殊字符、rank、snippet 和结果上限。
4. 完成资产/空间页面、影响分析、保留策略和安全清理流程。

### 5.4. 数据主线稳定后的产品补全

- **Agent 执行语义**：`injectionStrategy`、`modelMatch`、聊天内切换 Agent、开局消息实例化、宏渲染、深度注入和用户档案。
- **Agent 私有资产**：头像、背景和预设附件继续使用 Agent Handle + 相对路径，导入导出携带私有二进制；不得改成全局 `assetId` 生命周期。
- **Chat 完整性**：搜索/排序/引用回复、设置运行时接线、请求超时与重试、复制失败反馈和双语覆盖。

### 5.5. 可穿插的低耦合收尾

- 统一业务层 `customMessage/customDialog`，测试工具可保留底层 Varlet 验证入口。
- 修复设置页硬编码版本来源，处理 `vconsole` 警告，拆分过大的 `Home` chunk。
- 增加 Agent 存储/导入、会话绑定、分支、上下文管道、SQLite codec/migration/crash recovery 和资产一致性测试。

每个主批次都必须通过 `bun run test:run`、`bun run check:frontend`、`bun run check:backend` 和 `bun run build`。涉及平台能力的批次还必须使用真实 Tauri Android/iOS 构建与真机验收，普通浏览器不能替代。

施工顺序的硬约束是：聊天附件依赖全局资产契约；Agent 私有资产属于不可被全局清理策略回收的角色包内容。两者只能复制内容，不能共享 ID 或生命周期。
