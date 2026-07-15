# 移动端当前实现盘点与后续参考

> 状态：Current Snapshot
> 调查日期：2026-07-15
> 调查范围：`mobile/` 当前代码、移动端计划/架构文档，以及直接影响移动端的跨端 LLM Core 计划
> 验证边界：本次完成宿主机前端构建、Vitest、Rust Clippy 和 Cargo Test；未执行 Android/iOS 安装包构建或真机验收

## 1. 结论

移动端已经形成可使用的 Beta 主链路：

```text
LLM 渠道与模型配置
  -> Agent 创建、导入与模型绑定
  -> 创建普通会话或 Agent 绑定会话
  -> 上下文管道与本地 Token 统计
  -> 原生/HTTP Transport 发起流式请求
  -> 树形消息、usage 与会话文件持久化
```

当前不是空壳或单纯 UI 原型。核心文本对话链路、Agent 主链、跨端 Provider Core、原生文件请求边界和主题系统均已有真实实现。尚未闭环的主体是 SQLite 持久化、全局资产与聊天附件、Agent 高级执行语义、设计层 API 收敛，以及 Android/iOS 真机发布验收。

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
- [x] 本次 Vitest 10 个测试文件、34 个测试全部通过。
- [x] 本次 `bun run check:backend` 通过。
- [x] 本次 Cargo Test 5 个测试全部通过。

## 3. 未完成清单

### 3.1 持久化与资产主线

- [ ] 引入 `tauri-plugin-sql` 并建立移动端数据库服务和 migration 机制。
- [ ] 将 LLM Chat 从 JSON 会话文件迁移到 `llm_chat.db`。
- [ ] 建立 `chat_sessions`、`chat_messages`、`chat_attachments`、FTS5 和 usage outbox。
- [ ] 实现消息/分支/会话删除时的附件引用释放和幂等 outbox 投递。
- [ ] 完成资产管理 Phase 0 的 Android/iOS 文件选择、权限、后台和空间不足实验。
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
- [ ] 消息复制真正写入系统剪贴板；当前聊天处理器只显示成功提示。
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
- [ ] 拆分首页超过 500 kB 的构建 chunk，重点检查工具 registry eager import 与共享配置进入首页包的影响。
- [ ] 增加 Agent 存储/导入、会话绑定、分支操作和上下文管道专项测试。

设计分层决议见 [`mobile-design-language-investigation.md`](./mobile-design-language-investigation.md)。

### 3.4 平台与发布验收

- [ ] 运行并记录 Android 安装包构建和至少一台 Android 真机验收。
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
- `llm-provider-adapter-sharing-investigation.md` 的代码与自动化验收已完成，剩余人工性能与双平台真机验收。

后续更新本文件时，应以代码、依赖和本次可复现验证为准；计划文档中的历史勾选只作为施工记录，不应覆盖当前代码事实。

## 5. 建议实施顺序

1. 先完成资产 Phase 0 真机实验，锁定 Android/iOS 文件入口与权限边界。
2. 并行确定 SQLite Schema 最终版，但在资产引用契约稳定前不要提前固化聊天附件字段。
3. 完成资产内核与 `ManagedAssetRef` 后，再实施聊天 SQLite、附件、usage outbox 和搜索。
4. 在数据主线稳定后补 Agent 私有资产、用户档案及高级注入语义。
5. 最后集中完成设计 API 收敛、包体优化、专项测试和双平台发布验收。

这个顺序的关键约束是：聊天附件依赖全局资产契约，Agent 私有资产则保持独立 Handle/相对路径语义，两者不能合并成同一个 `assetId` 生命周期。
