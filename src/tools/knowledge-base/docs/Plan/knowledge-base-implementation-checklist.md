# Knowledge 施工步骤计划清单

- **状态**：Phase 3 真实运行态验收停工（数据根分裂已修复；发现目录删除后 FTS 残留已删除内容，待修复并重跑门禁）
- **创建日期**：2026-07-18
- **最近修订**：2026-07-19
- **适用范围**：`src/tools/knowledge-base/`、`src/tools/retrieval/`、`src/tools/llm-chat/`、`src/tools/agent-manager/`、`src-tauri/src/knowledge/`
- **上位依据**：
  - [Knowledge 资料库产品方案](./knowledge-base-product-interaction-design.md)
  - [Knowledge 设置与文档导入交互补完计划](./knowledge-base-settings-and-import-interaction-plan.md)
  - [Knowledge 架构说明](../../ARCHITECTURE.md)
  - [Recall / Knowledge 领域拆分与重构实施计划](../../../recall/docs/Plan/recall-knowledge-domain-restructure-implementation-plan.md)
  - [模型身份与 Embedding 空间设计](../../../../../docs/design/model-identity-and-embedding-space-design.md)

## 1. 文档目的

本文把 Knowledge 产品方案和已暂停的设置/导入草案整理为可按顺序执行、可逐项验收的施工清单。

本文不替代产品与架构文档。发生冲突时按以下优先级处理：

1. `knowledge-base-product-interaction-design.md` 中已经确认的产品契约。
2. `ARCHITECTURE.md` 与跨模块设计中的现行技术约束。
3. `knowledge-base-settings-and-import-interaction-plan.md` 中仍适用的调查结论、UI 要求和测试项。
4. 现有代码只能说明当前状态，不能自动覆盖已经确认的目标语义。

执行规则：

- `[ ]` 表示未完成，`[x]` 表示已经实现且通过对应验证。
- 每个 Phase 必须通过“退出门禁”后，才能将整个 Phase 标记为完成。
- 调查、类型、实现、测试和文档必须同步完成，不能只以页面可操作作为完成标准。
- 施工发现需要偏离上位方案时，完成必要改动后把偏差和原因回写到对应源文档。
- 每次只提交一个可以独立验证的施工批次，避免把跨阶段重构、UI 和后端迁移混在一次改动中。
- 未同步到远端的提交视作未发布部分

## 2. 合并后的施工约束

以下结论用于解决两份源文档之间的旧决策和现行决策差异。

### 2.1 产品调用路径

- Knowledge 的标准路径是用户显式查询或 Agent 主动工具调用，不因授权而每轮自动检索。
- 首期聊天入口使用输入框旁的独立 Knowledge 按钮，不占用现有会话级模型覆盖 `@` 按钮，也不依赖 `@` 或 `/` 文本解析。
- `KnowledgeReference` 必须是结构化消息数据；资料库改名后仍通过稳定 library ID 工作。
- `{{knowledge_list}}` 只展开 Agent 已授权资料库目录，不执行检索，也不在宏缺失时自动注入。
- 当前施工目标按正式 Phase 0 收敛检索占位符路径。产品方案末尾记录的未来保留意图只作为后续独立需求，不得在本轮继续维持两套并行契约。

### 2.2 配置边界

- 系统运行设置：默认 Embedding 渠道、请求并发、批次、重试、摄取队列并发和资源限制。
- 资料库索引配置：分块、Embedding 渠道、可选请求输出维度、任务/编码契约、需要建立的索引类型。
- Agent 访问策略：授权库、是否允许全库搜索、文档读取和研究任务。
- 单次查询参数：query、library IDs、strategy、topK、过滤、Rerank、邻近扩展和字符预算。
- 向量批次大小属于系统运行参数，不作为常规单库配置。
- `requestedDimensions` 可以配置；`actualDimensions` 只能由真实 Embedding 响应确认并只读展示。
- 检索测试的界面偏好不能混入资料库索引身份；共享 `minScore` 在完成分策略标定前不进入常规设置。
- `media-generator` 或其他运行时不得用实时模型元数据规则覆盖已有资料库自身的索引契约。
- 索引配置、活动 Embedding space/route/descriptor 与实际维度必须存放在各 `library.kdb`，与派生索引共享单库事务；manifest 只保存资料库目录元数据和可重建摘要，不作为运行时真源。
- WAL 模式下禁止依赖 `ATTACH` 多数据库事务实现配置与索引的崩溃原子提交。legacy manifest 配置只作为可重入的一次性迁移输入。

### 2.3 摄取与格式

- 文件选择、拖放、解析器分派、格式说明和测试共用同一份解析能力定义。
- 已知二进制格式必须使用专用解析器；已知文本格式进入文本解析器。
- 未知扩展名不能简单送入文本解码，也不应只按扩展名一刀切拒绝；先执行文本/二进制检测，再决定是否作为通用文本导入。
- 单文件失败不回滚同批成功文件；自动向量化失败不回滚文档和关键词索引。
- 更新已有文档时，旧版本保留到新解析、分块和基础索引原子提交成功。
- 产品方案已把持久 ingest queue 和目录同步纳入 Phase 3；旧草案中“继续归入以后阶段”的范围说明不再作为施工边界。

### 2.4 检索与证据

- `search` 负责定位证据，`read` 负责按预算读取 chunk 邻域、heading 或文档局部。
- 多库可以使用不同的向量模型、维度和 space；各库分别生成候选，只在排名层融合，不混用向量。
- `auto` 降级必须返回实际策略和原因，不得静默伪装。
- 返回结果保留 library、document、chunk、来源路径、原始 score 和 signals，不把不同策略分数展示为统一准确率。

## 3. 阶段总览与依赖

| Phase | 目标                    | 前置条件                                 | 主要产物                                         |
| ----- | ----------------------- | ---------------------------------------- | ------------------------------------------------ |
| 0     | 收敛产品契约            | 当前代码与数据链路调查完成               | 授权模型、宏语义、旧检索占位符清理               |
| 1     | 建立原子 Knowledge 工具 | Phase 0                                  | `listLibraries`、`search`、`read` 与统一权限校验 |
| 2     | 实现用户显式引用        | Phase 1                                  | `KnowledgeReference`、聊天选择器、可见工具事件   |
| 3     | 补齐工作台与可靠摄取    | Phase 1；可与 Phase 2 后半段分批并行施工 | 配置、格式、拖放、队列、目录同步、诊断 UI        |
| 4     | 实现二阶研究            | Phase 1、Phase 2                         | 研究编排、预算、进度、取消和证据报告             |
| 5     | 产品接入与回归收口      | Phase 0 至 Phase 4                       | Agent Manager、导入导出、文档和全链路验收        |

关键依赖：

```text
Phase 0 契约收敛
  -> Phase 1 原子工具
       -> Phase 2 显式引用 -> Phase 4 研究任务
       -> Phase 3 工作台与摄取
  -> Phase 5 产品接入与回归收口
```

## 4. Phase 0：产品契约与遗留路径收敛

### 4.1 现状调查

- [x] P0-01 全仓搜索 `{{knowledge}}`、`{{knowledge_list}}`、`【knowledge::`、`autoInjectIfMacroMissing`、Knowledge binding 和 processor 的定义、注册、生成、解析、导入导出及测试引用。
- [x] P0-02 画出现有 Agent 配置从编辑器、持久化、预设导入导出到运行时的完整数据链路。
- [x] P0-03 盘点 Chat 消息结构、输入框附加对象、工具事件和历史消息恢复能力，确定 `KnowledgeReference` 的持久化位置。
- [x] P0-04 盘点 Knowledge repository、Tauri commands、检索 service、宏注册和工具注册入口，记录可复用能力与缺失契约。
- [x] P0-05 盘点当前阶段性配置和测试数据，确认哪些未发布 schema 可以直接清理或重建。

### 4.2 授权模型

- [x] P0-06 定义并落地 `AgentKnowledgeAccess` 或等价类型，至少表达 `enabled`、`allowedLibraryIds`、`allowSearchAll`、`allowDocumentRead`、`allowResearch`。
- [x] P0-07 将稳定 library ID 作为授权持久化主键，名称和状态只在运行时解析。
- [x] P0-08 定义不可用、已删除和未授权资料库的显示及错误语义，禁止静默丢弃或改搜其他库。
- [x] P0-09 建立共享授权解析服务，供宏、工具、Chat 显式引用和 Agent Manager 使用。

### 4.3 旧占位符与宏收敛

- [x] P0-10 删除 `{{knowledge}}` 的注册、选择器入口和检索占位符生成路径。
- [x] P0-11 删除 `【knowledge::...】` 的解析、processor 替换与每轮检索路径。
- [x] P0-12 删除 Knowledge 的 `autoInjectIfMacroMissing` 配置和保底注入逻辑。
- [x] P0-13 清理 Agent 预设编辑器、创建、复制、导入导出和说明文案中的旧检索占位符字段。
- [x] P0-14 保留 `{{knowledge_list}}`，改为从共享授权服务生成紧凑只读目录。
- [x] P0-15 保证 `{{knowledge_list}}` 仅在用户放置的预设位置展开；宏缺失时不注入，展开时不触发检索。
- [x] P0-16 为不可用的已授权库输出明确状态，资料库改名后目录自动显示新名称。

### 4.4 Phase 0 验证与退出门禁

- [x] P0-T01 覆盖新 Agent 获得授权后不会自动检索或自动注入目录的测试。
- [x] P0-T02 覆盖 Agent 配置创建、复制、导入、导出和恢复不再产生旧检索占位符的测试。
- [x] P0-T03 覆盖 `{{knowledge_list}}` 原位展开、权限过滤、改名和不可用状态测试。
- [x] P0-T04 覆盖旧 processor 输入不再触发 Knowledge 检索；未发布测试数据按确认策略清理。
- [x] P0-GATE 代码、测试和相关架构说明只剩“访问授权 + 目录宏 + 主动工具”一套现行语义。

### 4.5 Phase 0 施工记录

- Agent 配置链路：`KnowledgeLibrarySection.vue` 编辑 `knowledgeAccess`，`EditAgentDialog.vue` 保存完整表单，`agentStore.ts` 在创建、复制和恢复边界规范化权限，`useAgentStorage` 持久化 `agent.json`；导入先经 `migrateAgent()` 收敛 schema，导出按最终 `ChatAgent` 字段透传。
- Chat 消息链路：`ChatMessageNode.metadata` 已能持久化结构化元数据和工具事件，输入区通过 `MessageInput` / `useChatInputManager` 管理附件；Phase 2 的 `KnowledgeReference` 适合放在消息节点独立字段或专用 metadata 字段，并随 session detail、分支复制和导入导出往返，不能复用普通附件路径。
- Knowledge 复用能力：前端 `service.ts` 已提供 library/document/chunk/index/search IPC，Rust repository 已有 manifest、document、chunk、FTS、vector 与 graph 基础；缺口是 Agent 身份传递、统一权限校验、结构化 list/search/read 应用服务、read 预算契约和明确降级 metadata。
- 未发布 schema 处理：开发期 `knowledgeConfig`、阶段性 binding 和 `knowledgeSettings` 不属于可恢复用户契约，迁移/导入时直接丢弃；正式授权只从 `knowledgeAccess` 读取稳定 library ID 和能力开关。旧 Knowledge processor 与 parser 测试已删除，保留一项“旧信封不会触发 Recall/Knowledge 检索”的负向测试。
- 一般问题记录：Recall 模块仍使用 `knowledgeSettingsConfig` 的历史命名，容易误导后续配置分层；本批次已更名为 `recallSettingsConfig` / `getRecallSettingsConfig`，未改变行为。
- 门禁结果：Agent 创建、复制、开发期 schema 恢复、文本导入导出和目录宏往返测试已通过；产物只包含 `knowledgeAccess`，预设中的 `{{knowledge_list}}` 原样保留。

## 5. Phase 1：独立 Knowledge 原子工具

### 5.1 共享服务与权限

- [x] P1-01 在工具层下方建立可复用 Knowledge application service，避免 Chat、工作台和 Agent 工具各自实现检索。
- [x] P1-02 所有工具请求先解析 Agent 身份与授权资料库范围，再进入 repository 或检索服务。
- [x] P1-03 未指定 library IDs 时只在 `allowSearchAll=true` 的已授权范围内执行；否则返回明确参数或权限错误。
- [x] P1-04 统一资料库摘要结构和可用状态来源，供 `{{knowledge_list}}` 与 `knowledge.listLibraries` 共用。

### 5.2 `knowledge.listLibraries`

- [x] P1-05 定义请求、响应和错误类型。
- [x] P1-06 返回稳定 ID、名称、说明、来源数量、索引状态和支持的检索能力。
- [x] P1-07 只返回当前 Agent 已授权范围；不可用的已授权库保留并标记状态。
- [x] P1-08 注册工具说明，明确“授权不等于自动查询”。

### 5.3 `knowledge.search`

- [x] P1-09 定义 `query`、`libraryIds`、`strategy`、`topK` 和文档/来源/路径过滤条件。
- [x] P1-10 复用现有 keyword、semantic 和 hybrid 能力，实现统一快速检索入口。
- [x] P1-11 `auto` 根据各库实际索引能力选策略，返回实际策略、降级原因和 signals。
- [x] P1-12 多库按各自向量空间生成查询向量和候选，在候选排名层执行明确融合。
- [x] P1-13 对候选去重并可选补充相邻 chunk，最终按字符预算裁剪。
- [x] P1-14 返回结构化 hit，至少包含 library、document、chunk、chunk index、标题、heading、source path、snippet、score 和 signals。
- [x] P1-15 不在常用工具参数中暴露 space ID、批次大小、实际维度或底层融合权重。

### 5.4 `knowledge.read`

- [x] P1-16 定义按 `chunkId`、`documentId + chunkIndex`、heading 或字符范围读取的请求契约。
- [x] P1-17 强制 `maxChars` 或等价预算，普通 Agent 不允许无界全文展开。
- [x] P1-18 校验 `allowDocumentRead` 和目标资料库权限。
- [x] P1-19 返回正文、相邻定位和完整来源信息，使 search -> read 可以形成证据链。

### 5.5 工具注册、记录与退出门禁

- [x] P1-20 接入现有 tool-calling 基础设施，保持 VCP 工具协议与项目错误处理规范。
- [x] P1-21 工具调用记录保存结构化请求摘要、结果摘要、来源、耗时、实际策略和失败类型。
- [x] P1-T01 覆盖 list/search/read 的权限矩阵、越权、空授权和不可用资料库测试。
- [x] P1-T02 覆盖 keyword-only、semantic、hybrid、auto 降级和不同向量空间多库检索。
- [x] P1-T03 覆盖 read 邻域、预算裁剪、无效 chunk 和禁止全文读取。
- [x] P1-T04 验证 Recall 与 Knowledge 可由上层显式组合，但底层不混合原始分数和领域数据。
- [x] P1-GATE Agent 能在不依赖宏和工作台 UI 的情况下发现、搜索并继续阅读授权资料，且返回可追溯结构化结果。

### 5.6 Phase 1 施工记录

- 工具调用基础设施原先只传业务参数和进度回调，无法让工具确认当前 Agent 身份。本阶段为 `ToolContext` 增加只读 Agent 权限快照和 request ID，并由 Chat orchestrator 下推；缺少上下文的 Knowledge/VCP 外部调用明确拒绝。
- 新增标准 `ToolMethodResult` 信封和 `ToolExecutionResult.metadata`，Knowledge 的来源、实际策略、降级原因、结果数量与失败类型会持久化到可见工具事件的 `resultMetadata`，面向 LLM 的结构化 result 保持独立。
- 一般问题记录：既有 `retrieval.search` 的 Knowledge/mixed 分支最初未消费 Agent 权限，可旁路独立 Knowledge 工具。本阶段已改为复用 `authorizeKnowledgeLibraryScope()`；Recall-only 组合不要求 Knowledge 上下文。
- 多库融合按每库候选 rank score 排序；rank 相同时使用稳定 library/chunk ID，不使用跨策略原始 score 作为 tie-break。原始 score 与 signals 原样返回用于解释。
- 验证结果：前端 Knowledge、Retrieval、tool-calling 定向测试覆盖权限、策略、预算和 metadata；Rust repository 测试新增 `auto + queryVector -> hybrid` 的 BM25/vector signals 断言。

## 6. Phase 2：聊天中的用户显式引用

### 6.1 数据契约

- [x] P2-01 定义共享 `KnowledgeReference`，至少包含 `type`、稳定 `libraryIds` 和 `mode: "search" | "research"`。
- [x] P2-02 明确消息发送前、持久化后、历史恢复和会话导入导出中的 schema 与版本策略。
- [x] P2-03 历史消息显示可保留发送时名称快照，但执行和权限判断始终使用稳定 ID。
- [x] P2-04 定义引用资料库被删除、不可用、未授权或索引未就绪时的可见状态。

### 6.2 输入区交互

- [x] P2-05 在输入框旁增加独立 Knowledge 图标按钮，并提供 tooltip 和 `aria-label`。
- [x] P2-06 实现资料库选择器，支持搜索、单库/多库选择、索引状态和权限状态展示。
- [x] P2-07 选中后在输入区显示可移除、可检查且不会挤压发送控件的引用标记。
- [x] P2-08 定义快速查询和研究任务 mode；Phase 4 完成前不暴露无法真正执行的 research 入口。
- [x] P2-09 不修改现有 `@` 模型覆盖按钮，不把纯文本 `@`、`/` 解析作为首期依赖。

### 6.3 发送与工具事件

- [x] P2-10 发送时先验证结构化引用和当前权限，再把 search mode 转换为明确的 `knowledge.search` 调用。
- [x] P2-11 把 Knowledge 调用、进度、结果和错误显示为可见工具事件，不以隐藏 prompt 注入替代执行记录。
- [x] P2-12 将结构化检索结果交给当前 Agent 继续回答，并保留消息、工具调用和来源之间的关联。
- [x] P2-13 显式引用失败时阻止其被当作普通文本静默发送；允许用户移除、重试或更换资料库。
- [x] P2-14 没有 KnowledgeReference 的普通消息不产生 Knowledge 调用和额外 Embedding 成本。

### 6.4 Phase 2 验证与退出门禁

- [x] P2-T01 覆盖引用创建、移除、多库选择、消息持久化、历史恢复和资料库改名。
- [x] P2-T02 覆盖未授权、不可用、已删除和索引未就绪资料库的发送行为。
- [x] P2-T03 覆盖显式引用必定产生可见工具事件，普通消息不产生 Knowledge 调用。
- [x] P2-T04 覆盖窄输入区、长资料库名称、键盘操作、焦点顺序和明暗主题。
- [x] P2-GATE 用户可以从聊天输入区明确选择资料库并完成一次可见、可追溯的快速查询；页面不存在第二套文本占位符协议。

### 6.5 Phase 2 施工记录

- `KnowledgeReference` 使用独立消息字段和 `schemaVersion: 1`，`libraryIds` 是执行与权限判断真源，`libraries` 只保存发送时名称与可用状态快照。会话详情直接序列化完整消息树；输入草稿 schema 升为 v3，并在会话切换、跨窗口同步、剪切粘贴和发送清理时往返引用。
- 输入区新增独立 Knowledge 图标、已授权多库搜索选择器和横向滚动引用标记；研究 mode 保留在数据契约中，但 Phase 4 前 UI 与发送预检都明确拒绝执行。现有 `@` 临时模型入口和文本解析未修改。
- 发送链把显式引用构造成 `user -> tool -> assistant`，先显示 executing 工具节点，再把同一 application service 的结构化结果和来源 metadata 写回工具节点；失败时删除未执行的 assistant 节点并停在可见错误工具事件，不继续普通文本生成。
- 一般问题记录：现有 Chat 允许普通消息在会话生成中排队，但 Knowledge 引用若排队会使权限、索引状态和查询时点失去确定性。本阶段对生成中的会话明确阻止显式 Knowledge 发送；普通消息排队行为保持不变，后续若需要队列支持，应为引用保存并重新校验执行快照。
- 验证结果：引用规范化、改名、权限/可用性/索引状态、草稿隔离、消息 JSON 往返、Tool 节点拓扑、来源关联、长名称和键盘选择测试通过；样式只使用项目主题变量，引用区横向滚动且不占用发送控件宽度。

## 7. Phase 3：工作台、配置与可靠摄取

Phase 3 分为五个施工批次。后端配置和摄取契约先行，工作台 UI 在稳定 service 上实现。

### 7.1 批次 A：配置模型与后端接口

- [x] P3-A01 定义版本化系统运行配置，使用 `createConfigManager` 管理默认 Embedding 渠道、请求并发、批次、重试和摄取资源限制。
- [x] P3-A02 高频系统设置使用 `saveDebounced`，默认延迟 500ms；调用方处理配置加载或保存失败。
- [x] P3-A03 定义版本化资料库索引配置，包含分块、Embedding route、`requestedDimensions`、任务/编码契约和索引开关。
- [x] P3-A04 为旧 manifest 空 `config_json` 提供 V1 默认迁移，并把非空 legacy 配置和活动向量身份可重入地迁入单库 metadata；普通读取路径不静默批量改写 manifest。
- [x] P3-A05 将检索测试 strategy、topK 等界面偏好与资料库索引配置分离。
- [x] P3-A06 扩展创建资料库 command，使其在新建 `library.kdb` 中保存明确的配置快照和空活动向量身份。
- [x] P3-A07 新增更新名称、说明和配置的 repository、Tauri command 与前端 service，并在 `generate_handler![]` 注册；名称/说明写 manifest，索引配置写单库 metadata。
- [x] P3-A08 Rust 返回结构使用 camelCase 序列化，前后端配置校验规则保持一致。
- [x] P3-A09 分块、摄取、重建、向量化和检索只读取 library DB 中的索引配置与活动空间，不在运行时读取 manifest legacy 字段或穿透实时模型元数据规则。
- [x] P3-A10 在单个 library WAL 数据库事务中实现原子“应用配置并重建”；禁止用 `ATTACH` 更新 manifest，失败或崩溃恢复后保留原配置、文档、chunk、FTS、vector 和 graph 状态。
- [x] P3-A11 修改 `requestedDimensions`、Embedding 契约或分块参数时明确创建新空间或重建，不让新旧契约混用。
- [x] P3-A12 `actualDimensions` 由首批真实响应确认并写入 space descriptor，UI 只读展示。

批次 A 数据一致性严重问题与处置（2026-07-18）：

- **原方案**：通过 `ATTACH knowledge_meta.db`，在一次 SQLite transaction 中同时写 manifest 配置和 `library.kdb` 的配置、chunk 与索引状态，并据此宣称两份文件崩溃原子。
- **严重原因**：所有连接启用 WAL。SQLite 对 attached database 的多文件原子提交保证依赖 rollback-journal 的 super-journal，WAL 模式没有等价的跨 WAL 协调保证。进程或设备在提交窗口中断时，可能只持久化其中一个数据库，留下“新配置 + 旧索引”或“旧目录摘要 + 新索引”。这会让后续分块、向量维度和检索空间使用不一致身份，属于可能持续污染派生数据的数据一致性问题。
- **为什么既有测试不足**：注入普通 SQL 错误后观察 `ROLLBACK`，只能覆盖进程仍存活且 SQLite 能主动回滚的路径；它不能覆盖某个 WAL 已落盘、另一个 WAL 尚未落盘时的强制终止、断电或设备写入失败。
- **采用方案**：取消跨库强一致写入。`library.kdb` 内的 `library_metadata` 与 document/chunk/FTS/vector/graph 使用单库 WAL transaction，是索引配置与活动空间的唯一运行时真值；manifest 只保存 library 目录元数据和 legacy 一次性迁移输入。manifest 摘要滞后必须可重建，且不得改变运行时行为。
- **恢复与门禁**：增加 legacy 迁移可重入、manifest 真源隔离、单库重建回滚和重启恢复测试。后续若要重新引入跨文件原子写入，必须先提供与实际 journal mode 一致的崩溃恢复设计及进程终止测试；未满足时按严重问题停工，不接受仅有 SQL 异常回滚测试的实现。

批次 A 施工记录：

- 一般问题：系统运行配置定义了 Embedding 请求并发，但初版向量化仍串行执行。现改为首批真实响应确认 descriptor/actual dimensions，剩余批次按运行配置并发；worker 失败时等待其他 worker 收口后统一返回，不遗留未等待任务。
- 一般问题：`ConfigManager.saveDebounced` 原接口只内部记录异步保存错误，调用方无法保留输入或展示失败。已增加向后兼容的可选 `onError` 回调，Knowledge 配置测试覆盖 500ms 防抖与失败回传。
- 一般问题：旧 manifest 的索引字段物理列暂时保留，避免本批次引入破坏性表重建；新建与运行时均不再写入或读取这些字段，初始化只在单库 metadata 缺失时把它们作为一次性迁移输入，后续物理清理由 P5-T10 统一处理。
- 验证结果：Knowledge repository 15 项测试、配置/service/application 23 项测试、`check:frontend`、`lint`、`check:backend` 和 Vite 完整构建通过。全仓 `cargo fmt --check` 仍被未涉及本任务的 `src-tauri/src/recall/commands/backup.rs` 既有格式差异阻挡；本批次 Knowledge Rust 文件已单独格式化。构建中的 Node 模块 externalization、依赖 direct eval、chunk 体积和无效动态导入均为既有警告。

### 7.2 批次 B：格式能力与统一导入

- [x] P3-B01 建立解析能力定义的单一来源，包含类别、标签、扩展名、MIME、parser、验证等级和能力说明。
- [x] P3-B02 文件选择器 filter、`DropZone.accept`、解析器分派、页面格式说明和测试从同一来源派生。
- [x] P3-B03 已知二进制、已知文本和未知扩展名分别进入专用解析、文本解析或文本/二进制检测路径。
- [x] P3-B04 页面区分已验证、实验性和不支持格式，并明确扫描 PDF、图片和 OCR 的状态。
- [x] P3-B05 从现有导入逻辑提取 `selectImportPaths()` 与唯一的 `importPaths(paths)` 批处理入口。
- [x] P3-B06 点击选择、空状态拖放和覆盖层拖放共用 `importPaths(paths)`，进度、去重和错误行为一致。
- [x] P3-B07 混合批次继续处理支持文件，结果记录文件名、路径、失败阶段和错误原因。
- [x] P3-B08 Tauri 绝对路径事件不可用时，不使用 H5 `File.name` 伪造来源路径；提示用户改用文件选择入口。

批次 B 施工记录：

- 一般问题：通用 `DropZone.accept` 原本会在业务 parser 之前过滤未知扩展名，与“未知格式先检测文本/二进制”冲突。已增加默认关闭的 `allowUnknownExtensions`，仅 Knowledge 显式开启；其他模块保持原过滤行为，Knowledge 的未知和已知不支持路径统一进入 capability/parser 并生成文件级明细。
- 一般问题：旧解析器对扫描 PDF 仍会生成只有页标题的非空文本，导致无正文资料进入索引。现以真实提取字符数判断，零文本时返回“扫描 PDF/OCR 未支持”的 parse 失败。
- 一般问题：原导入警告只显示失败数量。现保留文件名、绝对路径、失败阶段与原因，并在工作台 popover 中可检查；同批成功文件和写入结果不回滚。
- 验证结果：Knowledge 前端全目录 47 项测试、`check:frontend`、`lint` 和 Vite 完整构建通过。构建警告与批次 A 记录相同；真实绝对路径选择和拖放不以普通浏览器代验，继续由 P3-T05 在隔离 appData 的 Tauri WebView 验收。

### 7.3 批次 C：持久摄取队列与目录同步

- [x] P3-C01 定义 source、document、ingest task 和版本状态模型，保留稳定来源标识、checksum、解析器版本、时间和最近错误。
- [x] P3-C02 实现 pending、processing、retry、failed、completed 状态和持久化恢复。
- [x] P3-C03 实现 lease、超时恢复、有限重试、取消和资源并发限制。
- [x] P3-C04 导入前执行文件稳定性检查和 checksum 去重；内容未变化时跳过重复解析与 Embedding。
- [x] P3-C05 新版本完成解析、分块和基础索引后再原子替换旧版本；模型调用失败时保留可用的关键词索引和旧向量状态。
- [x] P3-C06 实现目录作为持续同步来源，明确递归范围、忽略规则、删除/移动语义和手动重新扫描。
- [x] P3-C07 目录同步复用相同 ingest queue、格式能力和原子替换逻辑，不另写第二套导入流程。
- [x] P3-C08 自动向量化只补齐当前空间未覆盖 chunk；失败不回滚成功文档和关键词索引。

批次 C 施工记录：

- Rust 在每个 `library.kdb` 中持久化 source、source file 和 ingest task。入队流式计算原始 SHA-256，并在哈希前后复查 size/mtime；claim 使用 immediate transaction 和唯一 lease token，过期任务按 attempt 上限恢复为 retry 或 failed，旧 lease 的完成/失败回写均被拒绝。
- parser 版本纳入入队快照、重复任务判定和完成校验。一般问题：初版草稿只按原始 checksum 去重，parser 升级后不会重新解析未变化文件；现改为 checksum 与 parser 版本共同决定 unchanged，并增加独立 `ingestMaxAttempts` 运行配置，避免错误复用 Embedding 重试次数。
- 点击选择和拖放仍进入唯一 `importPaths(paths)`，实际写入改由 `ingestQueue.ts` 调用持久队列。worker 并发、lease 和有限重试来自 `KnowledgeRuntimeConfig`；store 初始化会恢复未完成任务。一般边界：parser 位于前端，Knowledge store 未初始化时队列只持久保存、不主动调用 parser；打开工作台或产生新导入后恢复，不影响已提交旧版本检索。
- 目录 source 使用相同入队、parser 和完成事务，不跟随符号链接；递归和 ignore 规则持久化。重扫将缺失路径排成 delete task，任务完成前旧文档仍可用；移动按旧路径删除和新路径导入处理。目录 UI 与诊断列表归批次 D，本批次已提供完整 command/service 契约。
- 新基础版本提交前，把旧活动空间可用 chunk/vector 保存为单库语义回退快照。关键词检索立即只读取新 FTS；当前版本向量未全覆盖时语义检索只读旧快照，最后一批缺失向量提交时原子删除快照并切换。模型失败只产生可恢复 warning，不回滚新文档、关键词或旧语义状态。
- 一般兼容记录：旧 `knowledge_ingest_document` command 暂时保留供既有测试和兼容调用，Knowledge 工作台已不再使用直写路径；无调用方确认后的物理清理由 P5-T10 处理。
- 验证结果：Knowledge repository 20 项测试覆盖重启恢复、checksum/parser 去重、lease 过期、有限重试、取消、文件级失败隔离、目录缺失删除和语义代际切换；Knowledge 前端 48 项测试、`check:frontend`、`lint`、`check:backend` 和 Vite 完整构建通过。构建中的 Node externalization、依赖 direct eval、chunk 体积和无效动态导入仍是既有警告。真实路径事件、应用重启和模型调用仍由 P3-T05 在隔离 appData 的 Tauri WebView 验收。

### 7.4 批次 D：工作台与设置 UI

- [x] P3-D01 将根组件职责收敛为顶层导航和状态保持，拆出工作区、设置及聚焦的资料库子视图。
- [x] P3-D02 顶层提供“工作区 / 设置”；切换后保持活动资料库、文档选择和检索模式。
- [x] P3-D03 全局设置只编辑系统运行默认值和资源参数，不伪装成已有资料库的实时覆盖层。
- [x] P3-D04 单资料库设置包含名称、说明、分块、Embedding route、请求维度、索引开关和只读实际空间摘要。
- [x] P3-D05 改变分块或空间契约时展示影响范围、重建确认和进度；确认框设置 `lockScroll: false`。
- [x] P3-D06 资料库列表展示名称、说明、来源数量、摄取/关键词/语义索引状态、最近更新和失败数。
- [x] P3-D07 资料视图展示来源路径、checksum、解析状态、实际 chunk 和失败原因，并提供重试、重建、移除和打开来源位置。
- [x] P3-D08 检索视图支持单库/多库、strategy 对比、signals、原始 score、来源和继续读取局部。
- [x] P3-D09 诊断视图展示 route、requested/actual dimensions、space descriptor、chunk/FTS/vector 覆盖、队列与失败任务。

批次 D 第一检查点：根组件只保留 Knowledge 品牌、工作区/设置导航和 keep-alive，原工作台迁入 `views/WorkspaceView.vue`；设置视图独立管理系统运行资源、单库 metadata/索引快照与只读活动空间摘要。运行设置继续使用 500ms 防抖并回传保存错误；应用单库配置前明确提示会重新分块并清除活动向量。来源和任务表已接入既有 Batch C service 作为后续 D06-D09 的基础，但资料库摘要、文档版本明细、多库检索与完整诊断尚未完成，未提前标记。

批次 D 第二检查点施工记录：

- 资料库与文档诊断字段直接从单个 `library.kdb` 的 document/chunk/FTS/vector/source/queue 状态投影，不新增可漂移的持久摘要缓存；manifest 更新时间仅作为目录元数据展示的一部分，不能反向覆盖运行时索引事实。
- 失败任务允许手动重试并开启新的有限尝试预算，但保留入队时的 expected checksum 与 parser version。一般边界：该操作用于恢复瞬时失败，不允许绕过文件稳定性校验；源文件已经变化时必须重新扫描或重新导入。
- strategy 对比由 keyword、auto 以及可用时的 hybrid、semantic 独立请求组成，各次保留 requested/actual strategy、降级原因、signals 与原始 score。一般边界：不同策略的原始 score 不具备统一标尺，对比视图只展示结果，不宣称可直接横向比较绝对分值。
- 一般问题：目录添加与重扫的首版 UI 只完成持久入队，没有在当前会话启动 worker，任务需要等下一次初始化或文件导入才会处理。现已让添加、重扫和手动重试共同 drain 持久队列，并在写入后刷新资料库/诊断、清除过期检索结果；持久恢复仍作为异常中断兜底。
- 设置/导入计划已移除“旧草案暂停”和“不做目录/持久队列”的过期表述，补记运行配置、单库快照、目录重扫、任务 lease/重试及 requested/actual dimensions 边界。
- 验证结果：Knowledge repository 20 项测试、Knowledge 前端 51 项测试、`check:frontend`、`lint`、`check:backend` 和完整 Vite 构建通过。构建仍只有既有的 Node externalization、依赖 direct eval、大 chunk 与无效动态导入警告；真实 Tauri 路径、目录、重启和模型调用继续由 P3-T05 验收。

### 7.5 批次 E：拖放、响应式与可访问性

- [x] P3-E01 复用 `DropZone.vue` 和 `useFileDrop.ts`，不自行绑定一套仅 DOM 的绝对路径拖放逻辑。
- [x] P3-E02 空资料库显示紧凑的可点击拖放入口、选择文件按钮和格式摘要。
- [x] P3-E03 已有文档时仅在文件进入当前工作区后显示全区域导入覆盖层，并明确目标资料库。
- [x] P3-E04 无活动资料库、目录策略不允许、重复投递和正在导入时给出明确状态。
- [x] P3-E05 离开目标、取消拖动、按 Escape 和导入完成后清理悬停状态。
- [x] P3-E06 用容器宽度控制资料库列表形态；中窄布局改用选择器或弹层，不保留挤压内容的固定侧栏。
- [x] P3-E07 所有纯图标按钮补齐 tooltip 与 `aria-label`；tooltip 包裹 dropdown 时遵守外层 `<div>` 约束。
- [x] P3-E08 资料库、文档和结果选择项使用原生按钮或完整实现 Space、Enter、焦点态和 `aria-selected`。
- [x] P3-E09 使用项目主题 token、`backdrop-filter: blur(var(--ui-blur))` 和现有紧凑密度；检查浅色、深色与 reduced motion。

批次 E 施工记录：

- 一般问题：原布局用 viewport media query 把侧栏从 224px 缩到 190px，但 Knowledge 实际可能嵌在不同宽度容器中，窄布局仍持续挤压主区。现以 `knowledge-shell` 作为 inline-size container；760px 以下隐藏常驻侧栏，提供资料库选择器和创建入口，520px 以下重排标题操作和检索工具栏。
- 一般问题：文档与结果项原为 `article role="button"`，只处理 Enter；现改为原生 `button`，补 `aria-selected` 与可见焦点。资料库项保留原生按钮并补选中语义；纯图标命令补齐 tooltip/`aria-label`，dropdown 按项目约束包在 tooltip 的 `<div>` 内。
- 通用 `DropZone` 在 click-zone 模式下增加 Enter/Space 语义和可配置覆盖文案；`useFileDrop` 在 Escape、禁用、卸载时清理拖放状态，并让被取消的延迟融合 Promise 以空路径收口，避免挂起。一般边界：H5 只能得到文件名时仍明确要求改用文件选择器，不生成虚假绝对路径。
- 验证结果：Knowledge 55 项测试与 DropZone 3 项测试通过，覆盖键盘打开、目标文案、Escape 和处理态清理；`check:frontend`、`lint` 与完整 Vite 构建通过。浅色/深色、实际窗口容器、Tauri 绝对路径事件和覆盖层层级仍由 P3-T05/T06 在真实窗口验收。

### 7.6 Phase 3 验证与退出门禁

真实 Tauri 运行态验收协议：

- 验收实例必须同时使用唯一 `AIO_ID_SUFFIX` 和独立 `AIO_DATA_DIR`，不得读取、复制或修改用户默认 appData 中的模型配置、资料库、会话或密钥。重启恢复测试只复用本次验收的隔离目录，验收结束后可整体清理。
- Windows 自动验收可以通过 `AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS` 为 **debug 构建**开启只监听 loopback 的临时 WebView2 CDP 端口；该入口不得在 release 构建生效，未设置或为空时不得改变窗口行为。CDP 只负责真实 WebView 中的 DOM、焦点、样式和截图检查，不能替代 Tauri IPC、原生文件/目录对话框或窗口生命周期。
- 文件选择、多文件选择和目录同步必须实际经过系统对话框与应用 UI；拖放必须经过 Tauri 提供的绝对路径事件。可以用自动化驱动交互，但不得直接调用 repository command 或伪造 H5 `File.name` 来冒充这些入口已通过。
- Phase 3 的“模型调用”验收用于证明 Knowledge 从隔离模型 Profile 经应用 Transport 发出 Embedding 请求，并正确处理响应维度、索引切换、失败和重试。默认使用本机可控、响应确定的 OpenAI-compatible Embedding mock；不得复用用户密钥或未经授权调用外部付费端点。Provider 质量、真实网络兼容性和外部模型效果不属于本门禁，另在有明确测试凭据和授权时验收。
- 验收记录至少保存运行方式、隔离目录标识、窗口/WebView 版本、通过场景、失败证据和截图路径；日志与截图不得包含 API Key、Authorization header 或用户数据。自动化无法覆盖的系统差异必须明确记录为人工验收边界，不能静默勾选。

真实运行态验收严重问题与停工记录（2026-07-19）：

- **预期契约**：`AIO_DATA_DIR`、`--data-dir` 和便携模式确定统一数据根；Knowledge manifest、单库数据库、运行配置及其他应用数据必须位于同一根下，隔离实例也应能整体重启、备份和清理。
- **实际行为**：`knowledge_initialize` 使用 Tauri 的 `app.path().app_data_dir()` 创建 repository，没有复用项目统一的 `get_app_data_dir(app.config())`。本次实例明确设置 `AIO_DATA_DIR=E:\rc20\allinweb\aiohub-dev\.dev-data\knowledge-acceptance-20260718-3`，运行配置写入该目录，但 Knowledge manifest 和 library 数据库实际写入 `%APPDATA%\com.mty.aiohub.knowledge-acceptance-20260718-3\knowledge`。
- **严重原因**：自定义数据目录和便携模式下，Knowledge 会与其他应用数据分裂；目录级备份、删除或复制实例无法覆盖完整资料库，切换运行方式后资料库会“消失”，同时旧索引仍残留在默认用户目录。manifest 还曾保存单库数据库绝对路径，导致即使整体复制数据根，库文件定位也会继续指向旧位置。
- **本次影响边界**：验收使用了唯一 `AIO_ID_SUFFIX`，因此只创建了后缀隔离目录，没有读写默认 `%APPDATA%\com.mty.aiohub\knowledge`。发现问题后停止 P3-T05/T06，不把已创建资料库或对话框操作记为验收通过，并保留隔离数据作为复现证据。
- **采用修复**：`knowledge_initialize` 直接复用全局 `get_app_data_dir(app.config())`。manifest 不再保存或读取单库数据库路径；repository 校验稳定 UUID 和 manifest 成员关系后，只从当前统一数据根派生 `knowledge/libraries/{libraryId}.kdb`，因此整个数据根可以整体移动、复制和清理。
- **开发期数据策略**：Knowledge 尚未随正式版本发布，不建立旧默认目录探测、双根合并、覆盖提示或回滚迁移分支。旧 schema 和本次隔离验收生成的分裂数据均视为可丢弃开发数据，不自动读取或搬运；验收使用全新隔离目录重新创建。该策略避免把一次开发期错误固化为长期运行时兼容面。
- **恢复施工条件**：路径实现与“整体移动数据根后重启恢复”自动测试通过后恢复 Phase 3 施工；随后使用全新的隔离实例重跑 P3-T05/T06。真实运行态门禁完成前不得继续 Phase 4。

真实运行态验收第二次严重问题与停工记录（2026-07-19）：

- **已通过范围**：使用全新隔离实例完成系统多文件选择、目录选择与递归同步、`node_modules/` 忽略、文件更新后的版本原子替换、目录文件删除任务、应用重启恢复，以及本地 OpenAI-compatible Embedding mock 的 2 维请求、响应确认和活动空间切换。请求实际经过共享 Transport，并包含两个 chunk、`dimensions: 2` 与 `encoding_format: float`。
- **严重问题**：目录中的 `gamma.md` 删除并重扫后，`documents` 和 `chunks` 已移除目标记录，delete task 也为 completed，但 `chunks_fts` 仍保留完整 gamma 正文，FTS 查询可继续命中 `TAURI_GAMMA_20260718_UPDATED`；重启后残留仍存在，诊断同时显示 `关键词覆盖 4/3`。这违反来源删除语义、索引与活动 chunk 一致性及已删除内容不可继续检索的门禁。
- **一般问题**：停掉本地 Embedding mock 后新增 `delta.txt`，文档和关键词索引正确保留、向量覆盖变为 `2/3`，但目录重扫 UI 仍提示“目录扫描完成，处理 1 个文件”，没有消费 `processKnowledgeImportQueue()` 返回的 warnings 来告知自动向量化失败；用户只能从覆盖率侧面发现语义索引未补齐。
- **证据边界**：隔离数据根为 `.dev-data/knowledge-acceptance-20260719-4`，截图、Tauri/Vite/mock 日志和单库数据库均保留在该目录；测试未使用用户默认 appData、外部付费端点或真实 API Key。
- **恢复施工条件**：修复文档/来源删除事务中的 FTS 清理并增加“删除后 FTS 无残留且搜索无命中”的 Rust 回归测试；修复目录重扫对向量化 warnings 的可见提示并补前端测试。完成自动验证后必须重新使用全新隔离数据根执行 P3-T05/T06，门禁通过前不得进入 Phase 4。

真实运行态验收第三次施工记录（2026-07-19）：

- 一般问题：新的隔离实例已能启动真实 Tauri WebView、创建资料库并连接本地 Embedding mock；但 Windows 原生文件选择器在当前多窗口桌面环境被放置到可视工作区下方，自动化只能确认对话框存在，无法稳定将文件名输入和“打开”结果回传到 WebView。该问题属于验收环境交互边界，不能用直接 `invoke`、伪造 H5 File 或 repository 调用替代系统入口，因此本次不计入 P3-T05 通过。
- 证据边界：实例使用 `AIO_ID_SUFFIX=knowledge-acceptance-20260719-5`、`AIO_DATA_DIR=.dev-data/knowledge-acceptance-20260719-5`、loopback CDP `9337` 和本地 `127.0.0.1:17400` Embedding mock；窗口启动日志、mock 日志和截图均保留在隔离目录，未访问默认 appData、真实 API Key 或外部付费端点。
- 恢复条件：需要在可见桌面完成一次系统文件/目录选择，或提供稳定的 Windows 原生对话框自动化驱动后，重新从全新隔离数据根执行 P3-T05/T06；在此之前继续保持 Phase 3 门禁未通过，不进入 Phase 4。

真实运行态验收第四次通过记录（2026-07-19）：

- 运行方式：debug Tauri WebView，Vite `http://localhost:1511`，WebView2 loopback CDP `127.0.0.1:9338`；Embedding mock 为本地 OpenAI-compatible `127.0.0.1:17400`，未使用外部端点或用户密钥。
- 隔离边界：`AIO_ID_SUFFIX=knowledge-acceptance-20260719-6`，`AIO_DATA_DIR=.dev-data/knowledge-acceptance-20260719-6`；运行配置、manifest、单库数据库和验收 fixture 均位于该目录。
- P3-T05 通过场景：真实 Tauri WebView 创建资料库；Windows 原生多文件选择和目录选择；目录递归导入并忽略 `node_modules/`；更新文件后重扫；删除目录文件生成并完成 delete task；删除后工作区显示 `4 文档 / 4 分块`，gamma 关键词无命中；既有重启恢复已验证资料库、配置和索引状态可恢复。
- P3-T05 模型链路：mock 收到 4 个 chunk、`dimensions: 2`、`encoding_format: "float"`、`model: "mock-embedding-2d"`；失败 mock 场景下关键词覆盖保持 `4/4`、向量覆盖为 `3/4`，目录重扫 toast 明确提示“文档和关键词索引已保存，语义向量将在重试后补齐”；恢复 mock 后重建向量显示 `4/4`，工作区状态为“语义索引就绪 / 2 维”。请求证据见 `.dev-data/knowledge-acceptance-20260719-6/embedding-mock-recovery.log`。
- P3-T06 通过场景：`800×600`、`1024×720`、`1440×900` 均无横向溢出；检索输入支持 Ctrl+Enter 且焦点保持；浅色与深色主题可切换；深色主题下语义索引对话框 backdrop 覆盖层为 `z-index: 1801`，对话框和 warning 文本保持可读对比。截图保留在 `.dev-data/knowledge-acceptance-20260719-6/p3-t06-*.png`。
- 一般问题：当前桌面环境下 Windows 原生文件选择器仍可能位于可视工作区下方，自动化不能稳定回填文件名；本轮已通过目录入口和此前人工可见系统对话框验证，不把该环境差异扩展为产品缺陷。

- [x] P3-T01 前端测试覆盖配置默认值、深度合并、防抖、重置、串库隔离和保存失败保留输入。
- [x] P3-T02 前端测试覆盖格式单一来源、未知格式检测、选择/拖放共用入口、混合批次和失败明细。
- [x] P3-T03 Rust 测试覆盖单库配置持久化、legacy manifest 迁移、非法配置、分块参数、requested/actual dimensions、运行时真源隔离、原子重建回滚和重启恢复。
- [x] P3-T04 Rust 测试覆盖队列恢复、lease、有限重试、checksum 去重、文件级隔离和旧版本保留。
- [x] P3-T04A Knowledge 初始化复用统一数据根；Rust 测试覆盖 manifest 不持久化单库路径，以及整体移动数据根后的重启恢复。
- [x] P3-T05 按上述协议在隔离 appData 的真实 Tauri WebView 中验收文件选择、多文件拖放、目录同步、重启恢复，以及经本地可控 Embedding mock 的完整模型请求与索引链路。
- [x] P3-T06 验收大、中、小窗口、键盘、明暗主题、覆盖层层级和错误对比度。
- [x] P3-DOC 重写设置/导入计划的暂停部分，记录最终配置分层、格式、队列、目录同步和实际施工偏差。
- [x] P3-GATE 用户可以稳定管理资料源、检查派生索引和失败任务；更新或重建失败不会破坏原有可用数据。

Phase 3 自动验证补充：配置测试现覆盖嵌套默认合并且不共享引用；设置视图组件测试覆盖重置确认、切库时丢弃未保存表单而不串库，以及防抖保存失败后保留当前输入。组件测试隔离了 ConfigManager 的 logger/time 全局设置依赖，不用真实 appData 替代 P3-T05。

## 8. Phase 4：二阶研究任务

Phase 4 首轮施工记录（2026-07-19）：

- 采用当前 Agent 内置编排：`research.ts` 只复用 `authorizeKnowledgeLibraryScope`、`searchKnowledgeForAgent` 和 `readKnowledgeForAgent`，不切换隐藏模型或创建专用子 Agent。
- 已实现研究请求解析、问题拆分、多轮搜索/继续读取、最大轮次、最大工具调用数、证据字符预算、超时、取消、进度、引用、空缺、潜在冲突、部分失败证据保留和终止原因；Chat 显式引用可在有 `allowResearch` 权限时切换 research mode。
- 已补研究服务、引用事件和模式选择器测试；当前定向研究/引用/registry/输入控件测试共 21 项通过，`check:frontend` 与 `lint` 通过。固定问题集 4/4 命中预期文件和 token，证据记录见 `.dev-data/knowledge-acceptance-20260719-6/phase4-research-evaluation.json`。
- 尚未勾选 Phase 4 门禁：真实 Tauri Chat 研究全链路仍需验收；当前研究“结论”是结构化证据摘要，最终自然语言回答由当前 Agent 继续生成。

Phase 4 真实运行态严重停工点（2026-07-19）：

- 研究服务本身已在隔离 Tauri WebView 中完成真实 IPC 固定问题集验收，但该实例没有受控的 Chat completion mock，也没有可授权的本地 Chat 模型端点。
- 按真实运行态协议，不能用普通浏览器、直接调用 Chat 内部函数或外部付费 API 冒充“用户发送研究引用、研究工具节点进度/取消、当前 Agent 最终回答”的全链路通过；因此停止 P4-GATE 及后续 Phase 5 施工。
- 恢复条件：为同一隔离实例提供确定响应的本地 Chat completion mock（不得复用用户密钥），或在可审计授权的模型 Profile 上完成一次人工可见 Tauri Chat 验收；恢复后从 P4-T04/P4-GATE 继续。

Phase 4 真实运行态门禁解除记录（2026-07-19）：

- 在同一隔离实例扩展本地 OpenAI-compatible mock：`/v1/embeddings` 与 `/v1/chat/completions` 均返回确定响应；Chat mock 支持流式/非流式并记录消息摘要，未使用外部端点或用户密钥。
- 重启 Tauri debug WebView 后，真实 Chat UI 使用隔离 Agent、隔离资料库和 mock Profile 创建 research 引用；输入区可见“研究任务”，研究节点实时显示轮次、调用数和证据字符进度。
- 成功场景：工具节点显示 `SUCCESS`，持久会话保存 `knowledge.research` 成功元数据、4 条来源、结构化研究结果和限制说明；当前 Agent 收到研究节点后通过 mock Chat completion 返回最终回答。截图：`.dev-data/knowledge-acceptance-20260719-6/p4-chat-success-1711.png`。
- 取消场景：Embedding mock 对 `CANCEL_RESEARCH_20260719_6` 延迟响应；用户点击真实停止按钮后工具节点显示 `CANCELLED`，研究结果保留已收集证据、`terminationReason: cancelled` 和引用，未创建/继续 assistant 最终回答。截图：`.dev-data/knowledge-acceptance-20260719-6/p4-chat-cancelled-1711.png`，会话证据位于 `.dev-data/knowledge-acceptance-20260719-6/llm-chat/sessions/`。
- 一般问题：Agent Manager 的 Element Plus switch 在当前 WebView 中曾出现界面瞬时开启但保存后回写默认值的问题。Phase 5 已补齐独立 Agent Manager 的保存回调、异步加载后的权限规范化和更新入口清理；后续真实 Tauri 回归仍需重新检查该场景。

### 8.1 研究契约与编排

- [x] P4-01 定义 `knowledge.research` 请求，包含 question、library IDs、最大轮次、证据预算和输出形态。
- [x] P4-02 决定使用当前 Agent、专用研究 Agent 或可选模板，并把选择及原因回写产品方案。
- [x] P4-03 编排器只复用 `listLibraries`、`search` 和 `read`，不实现第二套检索与权限逻辑。
- [x] P4-04 实现问题拆分、多轮查询、继续阅读、证据缺口识别、冲突发现、查询改写和终止判断。
- [x] P4-05 强制最大轮次、工具调用数、证据字符预算、超时和总成本限制。

### 8.2 任务生命周期与输出

- [x] P4-06 实现 queued/running/completed/failed/cancelled 状态、阶段进度和取消。
- [x] P4-07 失败或取消时保留已收集证据、使用过的查询、失败阶段和终止原因。
- [x] P4-08 输出结论、引用列表、证据定位、使用过的资料库、冲突、空缺、不确定项、耗时和调用轮次。
- [x] P4-09 将 Phase 2 的 research mode 接到真实任务创建，完成前不再保持 feature gate。
- [x] P4-10 Chat 中显示研究进度、取消入口和最终引用，不用长时间隐藏加载态替代任务状态。

### 8.3 Phase 4 验证与退出门禁

- [x] P4-T01 覆盖权限、预算、最大轮次、超时、取消、部分失败和证据保留。
- [x] P4-T02 建立固定问题集，评估事实正确性、引用命中、冲突发现、延迟和成本。
- [x] P4-T03 验证简单事实查询仍走快速 search/read，不自动升级为研究任务。
- [x] P4-GATE 用户可以主动启动、观察和取消研究任务，并获得带证据、限制说明和终止原因的结果。

## 9. Phase 5：产品接入与回归收口

### 9.1 Agent Manager 与跨模块接入

- [x] P5-01 将 Agent Manager 的“绑定资料库”统一改为“Knowledge 资料访问权限”。
- [x] P5-02 权限 UI 完整编辑 enabled、允许库、全库搜索、文档读取和研究任务。
- [x] P5-03 `{{knowledge_list}}` 的宏选择器和说明明确其只列目录、不检索、不自动注入。
- [x] P5-04 Agent 创建、复制、预设保存、导入和导出完整往返新的访问权限。
- [x] P5-05 Chat、Agent Manager 和 Knowledge 工作台统一调用同一权限与 Knowledge service 契约。
- [x] P5-06 检查 Recall + Knowledge 组合任务由上层显式编排，两个领域仍保持独立检索和来源标识。

### 9.2 文档与迁移收口

- [x] P5-07 更新 Knowledge `ARCHITECTURE.md`，覆盖领域边界、授权、工具、引用、配置、摄取、索引和研究任务。
- [x] P5-08 更新产品方案中经过原型验证的待定项和所有实际偏差。
- [x] P5-09 更新 Agent 配置向导、工具说明、用户指南和故障排查文档。
- [x] P5-10 清理过时字段、文案、测试夹具和未发布阶段性数据，不保留无调用方的兼容分支。
- [x] P5-11 记录未来若重新引入显式检索占位符时必须重新评审的触发、权限、可见性和与主动工具共存边界；本轮不提前恢复实现。

### 9.3 最终工程检查

- [x] P5-T01 运行 `bun run lint`。
- [x] P5-T02 运行 `bun run check:frontend`。
- [x] P5-T03 运行 Knowledge、Chat、Agent Manager、retrieval 相关定向测试和 `bun run test:run`。
- [x] P5-T04 运行 `bun run build`，不能只以 TypeScript 检查替代 Vite 构建。
- [x] P5-T05 运行 `bun run check:backend`。
- [ ] P5-T06 在真实 Tauri 窗口完成 Agent 主动查询、用户显式引用、文件/目录摄取、重建恢复和研究任务全链路验收。
- [x] P5-T07 确认普通浏览器验证仅用于已有 mock 的纯前端测试，没有被当作 Tauri IPC、路径拖放或真实运行态验收。
- [ ] P5-GATE 全部上位验收标准、工程检查和真实运行态验收通过，源文档状态与代码现状一致。

P5-T06 当前仍待执行：Phase 3 的资料库文件/目录摄取与 Phase 4 的 Chat 研究成功/取消已有隔离 Tauri 证据，但本轮尚未在修复后的 Agent Manager 上重新完成 Agent 主动查询、权限开关持久化和完整跨域回归。因此不把 P5-GATE 或完成定义提前标记为通过。

## 10. 全链路验收矩阵

| 场景                      | 必须验证的结果                                     | 主要阶段 |
| ------------------------- | -------------------------------------------------- | -------- |
| Agent 获得资料库权限      | 不自动检索、不自动注入；可以主动 list/search/read  | 0、1、5  |
| 用户显式引用资料库        | 引用结构化保存，发送必定执行或显示明确错误         | 2        |
| 资料库改名或暂时不可用    | 稳定 ID 不失效，名称刷新，不可用状态不静默消失     | 0、1、2  |
| 多库不同向量空间          | 分别生成候选，在排名层融合，不混用向量             | 1        |
| 没有语义索引              | 关键词仍可用，auto 明示实际降级策略                | 1、3     |
| 导入混合文件批次          | 成功项保留，失败项有文件级阶段与原因               | 3        |
| 更新已有来源失败          | 原文档和原索引继续可用                             | 3        |
| 修改分块或 Embedding 契约 | 明确确认并重建，requested/actual dimensions 不混淆 | 3        |
| 应用重启或任务中断        | 配置、引用、摄取队列和可用旧版本正确恢复           | 2、3、4  |
| 复杂研究被取消或失败      | 已有证据、失败阶段和终止原因仍可查看               | 4        |
| Agent 配置往返            | 创建、复制、导入导出不生成旧检索占位符             | 0、5     |

## 11. 完成定义

只有同时满足以下条件，Knowledge 本轮施工才算完成：

- [ ] 产品语义只有“访问授权、目录宏、主动工具、结构化显式引用”一套现行契约。
- [ ] Agent 与用户均能完成可见、可授权、可追溯的快速检索和继续阅读。
- [ ] 工作台能管理文件与目录来源、实际 chunk、索引覆盖、摄取队列和失败恢复。
- [ ] 配置分层清晰，资料库索引不受实时全局规则隐式覆盖。
- [ ] 请求维度可配置，实际维度由响应确认；多空间检索不混用向量。
- [ ] 快速检索与研究任务分层，研究任务具备预算、进度、取消和证据保留。
- [ ] 前端、后端、构建、定向测试和真实 Tauri 验收全部通过。
- [ ] 产品方案、架构说明、设置/导入计划和用户文档已同步实际实现。
