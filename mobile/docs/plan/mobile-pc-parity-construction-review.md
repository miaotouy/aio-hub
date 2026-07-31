# 移动端近期 AI 施工复核与 PC 对照记录

> 状态：近期已知问题已处理，保留跨端与平台验收项
> 复核日期：2026-07-28
> 复核范围：`codex/mobile-dev` 相对 `upstream/codex/mobile-dev` 的近期移动端施工提交，以及直接对应的 PC 实现
> 关联入口：[`mobile-development-checklist.md`](./mobile-development-checklist.md)

## 1. 文档目的

本文记录 2026-07-28 对近期移动端 AI 施工的代码复核结果，重点判断：

1. 移动端实现是否偏离 PC 当前行为或移动端既定计划；
2. 已勾选能力是否只完成了表面接线，仍缺少关键调用链或生命周期处理；
3. 问题是移动端新引入、从 PC 继承，还是合理的平台差异；
4. 后续修复应优先处理可复现的正确性问题，而不是继续扩大没有产品依据的安全工程。

本文是施工问题记录，不把移动端目标改成机械复制 PC。工具调用、向量 RAG、Knowledge/Recall、桌面 HTML 扩展和完整 VCP 执行链仍以移动端产品需求为准。

## 2. 复核原则：安全服从明确威胁模型与产品边界

本轮复核不采用“凡是本地地址、私网地址、自定义协议或外部资源都先禁止”的默认思路。安全措施必须回答以下问题：

- 具体保护什么资产或权限；
- 攻击输入来自哪里，是否真实可达；
- 由渲染器、调用方、服务鉴权、Tauri capability 还是平台网络层负责；
- 限制是否会破坏 PC 已有能力、VCP/局域网集成或用户明确配置的资源；
- 是否有测试、故障记录或平台行为证明该措施必要。

因此，本轮结论是：

- **不因为推测性风险恢复对 localhost、回环和私网图片的一刀切封禁。** PC 当前允许这些资源，VCP 和用户自建服务也可能合理依赖本地或局域网地址。
- **不把 CSP、capability 或“调用方负责”当作没有实际接线时的抽象挡箭牌。** 如果责任转移给调用方，就必须存在明确 resolver、配置来源和测试。
- **优先修复可复现的正确性与生命周期问题。** 例如重复解析 URL、流式 response 泄漏、错误正文丢失和状态报告失真。
- **跨端共有行为不应被包装成移动端独有安全缺陷。** 如需改变，应作为跨端语义调整另行处理。
- **安全加固不得以明显牺牲兼容性为代价。** 若确需限制，应优先采用可配置、按来源启用和最小范围的规则，而不是全局拒绝。

## 3. 结论摘要

| 项目                                | PC 对照结果                                          | 当前判断                                      | 后续动作                                                         |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| 普通 Markdown 图片允许本地/私网 URL | PC 同样宽松                                          | 保留兼容性，已补 `no-referrer`                | 完成当前产品范围修复；VCP resolver 等需求出现后再接入            |
| VCP 图片解析                        | PC 有 base URL、表情包路径和鉴权参数修复             | 移动端只放开 URL，没有对应 resolver           | 若纳入移动产品，再移植窄范围 resolver；否则删除不准确的 VCP 理由 |
| `resolveAsset` 调用次数             | PC AST 模式只在资源节点解析一次                      | 已取消全文解析，普通图片 URL 仅在资源节点解析 | 已修复并补非幂等 resolver 测试                                   |
| 原生流式非 2xx                      | PC 能读取真实错误正文                                | Rust 已受限读取错误正文，非 2xx 不注册 stream | 已修复；取消同步清理 request/response registry                   |
| 世界书 `depth`                      | 移动端与 PC 使用相同公式，但均未完整复现 SillyTavern | 移动端已改为注入前 history 锚点并恢复默认 4   | 移动端已修复并补 fixture；PC 另行同步                            |
| 固定注入超过 Token 预算             | PC 同样保留固定消息并删除历史                        | 已恢复 `degraded`/warn 与结构化溢出详情       | 已修复；硬预算另立跨端设计                                       |
| Pipeline 失败边界                   | PC `wrapAsync` 失败后可能继续                        | 移动端显式结果与 fail-fast 更可靠             | 保留移动端实现，可考虑反向同步 PC                                |
| Pipeline 配置初始化                 | 两端均 fire-and-forget                               | 共享技术债                                    | 跨端统一增加初始化屏障                                           |
| RichText AST/Patch/Worker           | PC 已具备，移动端仍是 `marked` 全量重算              | 计划中仍未完成，不算虚假完成                  | 明确长期路线，避免无限扩展临时解析器                             |

## 4. 已处理的移动端问题

### 4.1 `resolveAsset` 在顶层图片上可能执行两次

修复前，移动端先在 `processedContent` 中对完整 Markdown 调用一次 `resolveAsset`，解析为 token 后又在 `resolveImageUrl()` 中对图片 URL 调用一次。

相关位置：

- `mobile/src/tools/rich-text-renderer/RichTextRenderer.vue`

PC AST 模式明确不对全文做资产替换，而是由 `ImageNode`、`VideoNode`、`AudioNode` 等具体资源节点解析一次，以避免本地 URL 二次编码或重复注入参数。

风险不是抽象安全问题，而是可预期的功能错误：非幂等 resolver 可能重复追加鉴权参数、重复编码或破坏签名 URL。当前测试只使用幂等字符串替换，未覆盖该情况。

建议：

- 移动端取消顶层全文级资源解析，只在资源节点解析 URL；或
- 拆分 `resolveContent()` 与 `resolveResourceUrl()` 两个不同契约；
- 增加非幂等 resolver 测试，确保每个图片 URL 只处理一次。

**处理结果（2026-07-28）**：已取消 Markdown 全文级 `resolveAsset`，普通图片只把节点 URL 交给 resolver；测试使用追加查询参数的非幂等函数断言只调用一次。

### 4.2 图片放开策略缺少与 PC 等价的调用链，但不应退回全局封禁

PC 图片链路包含：

1. 消息资产和 Agent 资产占位符解析；
2. VCP base URL 匹配；
3. 表情包路径识别；
4. `pw=` 鉴权参数修复或清单 URL 归一化；
5. `appdata://`、本地路径和协议相对 URL 转换；
6. 图片元素 `referrerpolicy="no-referrer"`；
7. 加载失败后的无凭据 fetch 回退与 object URL 生命周期清理。

移动端正式聊天目前只传 `resolveMediaItem`，没有传普通图片 `resolveAsset`；移动端也不存在 VCP base URL、image key 或表情包清单配置。最新提交虽然允许本地和私网图片，但“由调用方控制”的调用方实现并不存在。

这里的处理原则不是重新禁止私网图片，而是：

- 普通 HTTP(S)、本地和局域网图片继续允许按产品兼容性显示；
- 至少补充 `referrerpolicy="no-referrer"`；
- 不使用尚未实现的 VCP 调用链为全局策略背书；
- 若移动端未来正式接入 VCP 图片，再按 PC 的配置 base URL 做窄范围修复，不为所有 URL 注入 VCP 参数；
- 受管 `asset://` 继续只允许解析当前消息自有附件，该边界比 PC 路径型资产更清晰，应保留。

**处理结果（2026-07-28）**：普通图片已增加 `referrerpolicy="no-referrer"`，并同步修正文档，不再把尚未接入的 VCP resolver 当作现有调用方能力；本地和局域网兼容性保持不变。

### 4.3 原生流式非 2xx 丢失错误正文

PC transport 将真实 `Response` 交给 `ensureResponseOk()`，因此可以读取上游 400/401/429/500 的错误正文。

修复前，移动端原生流只在启动阶段返回 status、statusText 和 headers，前端随后使用 `new Response(null, ...)` 检查状态。结果是错误正文永远为空，用户只能看到缺少具体原因的通用错误。

建议在 Rust 端处理非成功响应：

- 受限读取错误 body；
- 返回结构化状态和错误正文；
- 不把非成功 response 注册为待拉取 stream；
- 保留响应大小限制，避免错误端点返回无限 body。

**处理结果（2026-07-28）**：Rust 在非 2xx 启动响应上复用受限 body 读取，返回 `errorBody` 后立即清理 request，且不写入 stream registry；前端用该正文构造状态校验响应，恢复上游错误详情。

### 4.4 原生流取消没有立即清理 registry

修复前，`cancel_llm_stream_request` 只触发 `CancellationToken`。实际删除 `NativeStreamState.streams` 和 `NativeRequestState.requests` 只发生在 `read_llm_stream_chunk` 的结束或错误路径。

当以下情况发生时，不会再有后续 read 负责清理：

- 启动后立即发现 HTTP 非成功状态；
- body iterator 开始前被用户停止；
- 上层取得 response 后放弃消费 body。

建议让 cancel command 同时接收 stream state，并立即移除 response 与 request；token cancellation 继续用于唤醒正在执行的 read。

**处理结果（2026-07-28）**：`cancel_llm_stream_request` 已改为异步接收两类 state，先取消并移除 request，再立即移除 response；启动注册前增加取消检查，避免并发取消后重新留下 stream。

### 4.5 Token 固定消息超预算时应恢复 PC 的告警语义

PC 和移动端都优先保留非历史消息。当固定注入本身超过预算时，两端都会删除全部历史而保留固定消息，因此当前 `maxContextTokens` 不是绝对硬上限。

这属于 PC 继承策略，不在移动端单独重写。但 PC 会记录“预设消息已耗尽预算”的 warn，移动端修复前仍返回普通 `applied`。

建议移动端至少返回 `degraded`，并记录：

- `presetTokens`；
- `maxContextTokens`；
- `overflowTokens`；
- 历史被全部删除。

是否把预算改成硬上限，需要先确定固定注入内部的裁剪优先级，再作为跨端设计处理。

**处理结果（2026-07-28）**：固定消息耗尽或超过预算时返回 `degraded`，日志为 warn；详情新增 `maxContextTokens`、`overflowTokens` 和 `historyFullyRemoved`，同时保留原有固定消息优先策略。

### 4.6 世界书 `depth` 与 SillyTavern 的真实行为不一致

本轮补充对照了本地 SillyTavern `51ad27fb8`（2026-05-03）的实际生成链，而不再只根据 AIO Hub PC 注释判断：

- `public/scripts/world-info.js` 先按 `depth + role` 聚合同深度世界书条目，再注册为 `IN_CHAT` extension prompt；
- Chat Completion 在 `public/scripts/openai.js` 的 `populationInjectionPrompts()` 中处理反向排列的纯聊天消息，注入后再恢复时间顺序；
- 文本补全在 `public/script.js` 的 `doChatInject()` 中同样先反转纯聊天消息再插入；
- 两条链的普通生成语义一致：`depth = 0` 位于最新消息之后，`depth = 1` 位于最新消息之前，`depth = N` 位于最近 N 条消息之前；超过聊天长度时夹在最旧聊天消息之前，而不会越过到角色定义、主提示词等聊天外区域；
- Continue 是显式例外：文本补全会把 `depth = 0` 调整到反向数组位置 1，避免插到被续写消息之后；
- SillyTavern 世界书条目的默认 `depth` 是 `4`，移动端修复前新条目和缺省归一化使用 `0`。

PC 与移动端修复前都使用：

```ts
Math.max(0, lastHistoryIndex + 1 - depth);
```

该公式至少有两项可复现偏差：

1. **大深度边界错误。** 索引夹到整个 Pipeline 消息数组的 `0`，短会话会把世界书插到角色预设之前；SillyTavern 只夹到聊天历史起点。
2. **不同深度的注入会互相计数。** 移动端按深度升序逐组插入后重新查找 `lastHistoryIndex`，先插入的浅层世界书会被后续公式当成索引距离的一部分。例如两条历史消息先插 `depth = 1`、再插 `depth = 2` 时，后者会落在最旧历史之后；SillyTavern 通过反向聊天数组和 `totalInsertedMessages` 保持深度始终相对原始聊天消息计算。

因此，这不只是“是否严格理解历史起点”的产品争议，而是已确认的 SillyTavern 兼容偏差。移动端应基于**注入前的 session history 锚点**计算所有深度，夹到最旧历史边界，并补齐 `0`、`1`、等于历史长度、大于历史长度及多深度组合 fixture；若移动端继续宣称兼容酒馆世界书，默认值也应改为 `4`。PC 的同源实现另立同步修复，不要求与移动端绑在同一个提交中。

**处理结果（2026-07-28）**：移动端先捕获原始 `session_history` 对象作为锚点，所有深度均相对该集合计算并夹到历史长度；新增上述五类 fixture，新建/缺省条目深度改为 `4`。PC 同源问题仍按跨端任务处理。

## 5. PC 继承问题，不作为移动端单独阻塞项

### 5.1 中文 whole-word 匹配

两端都基于 `\W` 判断单词边界。中文字符不属于正则 `\w`，因此单字关键词可能在连续中文文本中被误判为完整词。

该问题应基于真实世界书样本设计中文边界语义，不因抽象正确性直接引入复杂分词器。

### 5.2 Pipeline 配置首次加载竞态

PC 与移动端都在 Store 创建时 fire-and-forget 调用 `loadSettings()`，第一次执行不等待初始化。该问题属于共享基础设施债务，后续可统一提供 `ensureInitialized()`，不归因于近期移动端 PipelineEngine 加固。

## 6. 合理且应保留的移动端差异

以下差异符合当前产品计划，不应为了“安全”或“PC 对齐”继续扩大施工：

- raw HTML 在移动端保持字面回退，不迁移 PC 的危险 HTML、外部脚本和样式执行能力；
- VCP 只读展示不等于连接或执行桌面 VCP 工具链；
- 移动端世界书首阶段不复制递归、概率、组竞争、向量、Outlet、自动化和 Knowledge/Recall；
- 移动端附件只保存 `assetId +` 轻量快照，不回退到业务数据持久化本地路径；
- 当前消息 `asset://` 只能解析当前消息附件，不允许模型枚举全局资产；
- 移动端 PipelineEngine 的显式执行结果和 fail-fast 强于 PC，应保留；
- Android/iOS 真机数据出现前，不因假设的性能或安全热点提前下沉 Worker、Rust 或原生实现。

## 7. RichTextRenderer 路线偏移

PC RichTextRenderer 是 AST、Tokenizer Worker、稳定区/待定区、Patch 和节点复用架构。移动端当前仍以 `marked` token 递归渲染，并通过 80ms 节流执行完整 Markdown 重算。

现有计划没有把 PC AST/Patch 标为完成，因此当前不是状态造假；但施工路线已经从“直接迁移 PC 核心”逐渐变成“在移动端轻量渲染器中逐个重写节点”。继续施工前需要明确长期选择：

1. **移动端独立轻量路线**：承认不追求引擎级 PC parity，只维护产品需要的安全子集；
2. **PC 核心迁移路线**：停止继续扩展临时 parser，开始迁移 AST/Patch/Worker 的可复用核心。

在真实设备没有显示长消息性能问题前，不要求立即迁移 Worker；但也不应把表面节点数量等同于 PC 引擎迁移进度。

## 8. 修复优先级

### 近期已处理

1. [x] 修复 `resolveAsset` 双重执行；
2. [x] 修复原生流非 2xx 错误正文丢失；
3. [x] 修复原生流取消后的 registry 清理；
4. [x] 恢复固定消息超预算时的 `degraded`/warn 语义；
5. [x] 修复世界书 `depth` 的历史边界和多深度互相计数，并确认默认值 `4`；
6. [x] 同步 RichTextRenderer 已接入受管媒体的清单状态和图片回退描述。

### 等真实需求或跨端任务再处理

1. PC 端世界书 `depth` 同源兼容偏差；
2. 中文 whole-word 匹配；
3. Pipeline 初始化屏障；
4. PC 与移动端统一图片来源治理；
5. 完整 VCP 图片 resolver；
6. AST/Patch/Worker 引擎迁移。

### 当前不做

1. 无证据地重新禁止全部 localhost、回环和私网图片；
2. 为尚未进入移动产品范围的 VCP 工具执行、HTML 沙箱或外部脚本体系提前建设复杂安全框架；
3. 仅为减少理论攻击面而破坏 PC 资源兼容、局域网服务或用户明确配置的地址；
4. 将 PC 共有问题包装成移动端发布阻塞项。

## 9. 本轮验证记录

复核期间已完成：

- 移动端完整 Vitest：64 个测试文件、302 个测试通过；
- 针对 RichText、Pipeline、世界书、移动 transport 和媒体组件的 76 个测试通过；
- `mobile` 生产 Vite 构建通过；
- 移动端 Rust Clippy `-D warnings` 通过；
- 使用当前实现复现了世界书大 `depth` 越过角色预设，以及固定注入超过 Token 预算但仍保留的行为；
- 对照 SillyTavern `51ad27fb8` 的 Chat Completion 与文本补全生成链，确认 `depth` 只相对原始聊天消息计数、大深度夹到最旧聊天边界，并发现移动端多深度注入会互相计数。

这些结果说明当前主要问题位于测试未覆盖的调用次数、非成功响应、资源清理和历史注入锚点，而不是类型或编译层错误。

修复完成后重新验证：

- 移动端完整 Vitest：64 个测试文件、310 个测试通过；
- RichText、移动 transport、Token 限制器、世界书 injector/store 定向回归：5 个测试文件、83 个测试通过；
- Rust `llm_file_transport`：5 个单元测试通过；
- `bun run build` 通过（包含 `vue-tsc --noEmit` 与生产 Vite 构建）；
- `bun run check:backend` 通过，Rust Clippy `-D warnings` 无告警。

普通浏览器与单元测试不替代真实 Tauri WebView、Android/iOS 网络栈和取消时序验收；相关平台门禁继续由现有移动端测试计划跟踪。
