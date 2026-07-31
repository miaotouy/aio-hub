# Recall 检索管线模块化实施计划

**状态**：Phase 0 至 Phase 6 的工程施工已完成，但本周期内改名拆分迁移与本次管线模块化均未发布过中间版本；当前仍处于 Release Gate 未通过状态。发布前必须以最近一次正式发布版本的数据和配置作为唯一迁移基线，完成全量迁移、产品回归、合并报告和发布包 smoke test。

**最近修订**：2026-07-23
**范围**：`src/tools/recall/`、`src-tauri/src/recall/`、Recall Playground、Agent Recall 配置与 Chat 召回入口。

本目录只保留本施工计划。稳定的管线契约见 [`../architecture/retrieval-pipeline-contract.md`](../architecture/retrieval-pipeline-contract.md)，存储、备份与迁移约束见 [`../architecture/storage-migration-contract.md`](../architecture/storage-migration-contract.md)，测试运行边界见 [`../architecture/retrieval-testing.md`](../architecture/retrieval-testing.md)，现行实现结构见 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)。

## 本周期发布语境

此前的 Recall 改名/拆分迁移和本次检索管线模块化都只存在于未发布分支，不能把当前工作区、某个中间提交或当前生成的 SQLite 作为“上一版本”。因此本次发布验收按一次完整迁移处理：

- 迁移输入必须来自最近一次正式发布版本的完整 appData 副本，不能只用当前分支生成的 fixture、空目录或已经迁移过的目录证明兼容性。
- 旧目录、旧 workspace、Agent Recall 配置、binding、Knowledge 授权和旧占位符必须在同一个隔离数据根中联合验证；单独的 Recall 单元测试不构成发布证据。
- 任何迁移失败、部分成功、进程中断或只读源场景都必须留下可复核的结构化报告，并证明源数据仍可重新恢复；不能以“当前代码可启动”代替迁移回滚证据。
- `recall-pipeline` 等现有 debug Tauri E2E 只证明切片功能和 IPC 链路。它们不自动证明最近一次正式版本到当前版本的迁移、发布二进制资源打包或失败恢复。

## 当前状态

| 阶段         | 已落地                                                                                                                                                                                                                                                                                                                                                                              | 完成前还需做什么 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Phase 0 至 2 | Runner、compiler、artifact store、公共过滤/finalizer、`algorithmic` 和生产 IPC 已可用；旧 Keyword 重复实现已随 Phase 6 删除。                                                                                                                                                                                                                                                       | 已完成。         |
| Phase 3      | 内容向量、标签种子、受限共现图传播和标签到条目扩展已进入生产管线，并共享一次查询向量；查询残差标签扩展已确定不进入本轮稳定预设；历史投射、折射、texture、动态权重与 resonance runtime 已删除。                                                                                                                                                                                      | 已完成。         |
| Phase 4      | `comprehensive` 已组合关键词、内容向量和标签图候选；weighted fusion v1、独立 `relevanceScore`、预算/priority/阈值边界、工程夹具和显式 fallback 已冻结。                                                                                                                                                                                                                             | 已完成。         |
| Phase 5      | service、Chat、Agent tool、Agent 配置及全局/绑定预设已使用 `presetId`；Agent 编辑器已由 preset summary 和 compile result 驱动 override 范围与能力预检；后台入口只读全局活动模型且不弹交互提示；模型切换会轮换活动资产代际并隔离缓存；Playground 已使用 pipeline 状态机、双预设、批量回放、trace 和受限阶段模块编辑；结果详情与 Monitor 已区分分数语义并展示 pipeline/legacy trace。 | 已完成。         |
| Phase 6      | 管理页局部搜索和 Agent 条目定位已改用 pipeline service；前端旧 orchestrator、engine capability 和动态设置，以及后端 legacy registry、commands 与引擎实现均已删除。旧 ID 只在版本化迁移、夹具和历史 trace 中读取。                                                                                                                                                                   | 已完成。         |

## 施工顺序

### Phase 3：收口旧能力取舍

- [x] 新管线不再使用 `Lens`、`Blender` 作为模块、预设或产品能力名称；旧名称只在 legacy migration、夹具和历史诊断信息中保留。
- [x] 用原子模块替换当前 legacy Lens helper：标签种子召回、受限标签图传播和标签到条目候选扩展。
- [x] 查询残差标签扩展不进入本轮 `comprehensive`；如后续立项，只能作为 Playground 独立实验模块，且不得重复执行字面或内容向量检索。
- [x] 删除历史投射、折射、`texture`、Blender 动态 literal/semantic/gravity 权重和 resonance 乘法；literal、内容向量、标签向量与 priority 复用现有原子模块。
- [x] 记录 legacy Vector、Lens、Blender 的保留、替代、删除和回滚边界。

完成门槛：每个保留能力都有独立模块契约；每个删除能力都有明确替代或迁移结论。

#### Phase 3 调研结论：原子标签管线（2026-07-22）

用户已确认新管线的命名方向：不再将一组算法包装为 `Lens` 或 `Blender`。目标能力按输入、输出和可观测性拆分；旧名称不能以换名 facade 的形式继续存在。

建议的目标链路如下：

```text
query embedding
  -> tag-vector-recall（标签种子）
  -> bounded-tag-propagation（可选，输出 query-energy-field）
  -> tag-to-entry-expansion（输出 tag-graph CandidateSignal）
  -> normalize / weighted-fusion / threshold / priority / finalizer
```

- `tag-vector-recall` 是现有标签邻居候选的稳定名称和职责；它不修改查询向量。
- `bounded-tag-propagation` 只接收标签种子和版本化共现传播核，输出查询级 `query-energy-field`；它限制跳数、按权重稳定截取的每节点邻居数、整次查询总状态数和总出流，并记录截断与回流抑制。当前首版以内存集合的受限标签共现关系生成内容寻址的 `cooccurrence-v1` 图代际；后续预计算 artifact 必须保持相同的身份与 trace 契约。
- `tag-to-entry-expansion` 将查询能量场与标签到条目的权重映射转换为 `CandidateSignal`；信号类型应表达 `tag-graph`，不得称为 Lens。
- `query-residual-tag-expansion` 不属于当前稳定管线。若后续独立立项，它是查询级标签种子扩展模块：用首层已匹配标签的正交子空间解释查询，再以剩余向量寻找补充标签；它不得修改供 `content-vector-recall` 使用的原始查询向量，也不得直接产生条目候选。
- 现有历史向量投射、显式/自动折射和 `texture` 已不进入 pipeline service 或 Playground；对应 runtime 已删除，旧字段只在迁移夹具和能力盘点中保留。
- Blender 的 residual mining 实现不迁移。其对多个非正交标签投影直接求和，不能作为新模块数学实现；未来实验只能复用标签池等基础设施，并以稳定排序的正交投影重新实现。Blender 的动态融合和 resonance 同样不迁移。priority 继续只由 `priority-boost` 应用一次；固定、版本化权重由 `weighted-fusion` 负责。

此结论参考了 VCPToolBox 的 TagMemo V9.1 调研：其将查询残差分解、受限标签图传播、查询级能量场和候选重排分离，并将 pairwise、残差、传播核和有效配置作为按模型签名、图代际、算法版本绑定的不可变 artifact bundle 发布。相关来源为 `VCPToolBox\docs\TagMemo_Wave_Algorithm_Deep_Dive.md`、`TagMemoEngine.js` 和 `ResidualPyramid.js`。VCPToolBox 不是本模块依赖，其生产观测也不得作为 Recall 的质量结论或参数依据。

Recall 尚不具备 VCPToolBox 的有序标签序位、pairwise 相似度和内生残差资产。因此首版传播只能基于版本化的标签共现/条目映射，不能推断叙事方向，也不能复制其测地线重排。后续将当前请求内构图改为预计算图资产前，必须先冻结模型签名、图资产代际、配置哈希、构建/发布原子性、缓存身份以及 trace 字段；`query-energy-field` 已是可复用的 artifact key。

#### Phase 3 决策：查询残差标签扩展（2026-07-22）

本轮不实现 `query-residual-tag-expansion`，也不将其加入 `comprehensive`。VCPToolBox 的设计证明查询残差分解可以与节点内生残差、图传播和候选重排分开，但其现有生产观测来自整套 TagMemo 链路，没有隔离证明查询残差扩展在 Recall 的数据、Embedding 模型和标签质量下具有独立正收益。

如后续单独立项，实验边界固定为：

```text
shared query embedding
  -> tag-vector-recall（基础标签种子）
  -> query-residual-tag-expansion（补充标签种子）
  -> seed merge
  -> bounded-tag-propagation
  -> tag-to-entry-expansion
```

- 首版只扩展标签种子，不改写原始查询向量，不改变内容向量候选，不直接执行标签到条目扩展。
- 基础种子、残差种子和合并后种子必须使用可区分的 artifact；不得让多个模块通过覆盖同一 `query-energy-field` 隐式通信。
- 正交投影必须使用归一化向量、确定性邻居顺序和稳定的 Modified Gram-Schmidt 一类实现，并限制最大层数、每层邻居数、总种子数和最小残差能量比例。
- trace 至少记录每层标签及贡献、残差能量前后值、重复标签抑制、截断数、停止原因、模型签名和配置哈希。
- 工程夹具只验证数值范围、能量不增、稳定顺序、预算和 trace，不得作为质量结论。
- 质量裁决先在同一查询向量、搜索范围、下游模块和候选预算下比较有无残差种子的差异，再执行端到端双配置回放；只有形成跨查询、跨集合的可重复正收益后，才允许提出提升 `comprehensive` 算法版本的变更。

### Phase 4：完成综合预设

- [x] 固化 weighted fusion v1 的分数语义、权重、配置约束、性能边界和 trace 字段；RRF 不属于 v1。
- [x] 固化候选上限、各路归一化、最终阈值和 priority 的合法范围、默认值来源与版本边界；`relevanceScore` 是独立且可解释的阈值分数，priority 仅用于一次 rerank。
- [x] 用工程夹具覆盖精确字面、内容向量、标签、标签图、空候选、无向量数据和稳定 tie-break。
- [x] 建立可追踪的 `fallbackPresetId` 降级路径。

显式 fallback 仅允许 `requestedPresetId=comprehensive`、`fallbackPresetId=algorithmic` 和 `actualPresetId=algorithmic` 的组合，并要求非空结构化原因。前端只在外部 artifact 准备失败且调用方显式允许时重新编译 `algorithmic`；后端再次校验授权，成功或空结果都以 `outcome=fallback` 返回，并在 trace 中保留 requested/actual preset 与原因。未声明 fallback 的生产请求继续失败，不执行部分综合召回。

完成门槛：综合预设的编译、执行、trace、缓存隔离和 fallback 都有确定性验证；默认参数与算法版本可追溯。

### Phase 5：完成产品收口

- [x] Agent 编辑器根据 preset summary / compile result 渲染 allowed overrides 和 capability 预检。
- [x] 验证 Chat、Agent、占位符和普通 service 都只读取 Recall 全局活动模型，后台执行不弹交互对话框。
- [x] 实现全局模型切换的资产代际标识、覆盖提示和缓存隔离验证。
- [x] 以编译后的 external requirements 与参数 schema 驱动 `idle -> compile -> prepare -> run -> outcome`，并隔离 stale response。
- [x] 将 Playground 收口为双配置诊断工作面，提供受限阶段模块编辑、fixture 批量重放、batch run 与 trace 调试；首期只使用全局活动模型。
- [x] 在结果详情和 Monitor 展示分数语义、信号贡献、requested/actual preset、降级和版本化 trace，并兼容 legacy trace。
- [x] 移除 Playground workspace 的结果和运行态持久化；确认无动态引用后删除闲置搜索组件与 engine capability 分支。

Playground 当前已固定为 `algorithmic / comprehensive` 双配置诊断工作面，使用全局活动模型，支持多行查询批量回放、batch run、编译阶段与完整 trace 调试。每个槽位可从当前预设模板进入自定义阶段编辑：后端只暴露已注册模块的清单、内置模板和专用 custom compile/run IPC，强制 `playground-custom` 执行身份、固定算法版本并限制节点数；同一 compiler 继续校验参数、依赖、artifact、预算和唯一 finalizer。custom 运行不允许 fallback，且不会写回产品 preset、Agent 配置、workspace 或缓存命名空间。workspace 只保存集合、查询和 `presetId / limit`，旧 `engineId / config / results` 经迁移后失效；旧 `SearchPanel`、`useRecallSearch` 和 `useRecallSearchManager` 已在无静态或动态引用后删除。

具名 Tauri E2E preset `recall-pipeline` 已在隔离数据根验证稳定 preset 与 custom 的模块清单、模板、compile、stale config hash、run、trace，以及编辑器打开、取消和应用流程。该场景不替代发布前首次启动迁移、重启、失败回滚和旧目录只读恢复门禁。

新管线运行会发送兼容扩展后的 `recall-monitor` RAG 事件。事件在旧 `steps / results / stats / metadata` 之外可选携带完整 `pipelineTrace` 和结构化 `pipelineError`，metadata 标记 `executionPath / runId / outcome / requestedPresetId / actualPresetId`；历史 `recall_search` 事件仍可通过 `engineId` 和条目级 legacy trace 展示。结果详情和 Monitor 不再将未知分数域格式化为百分比：pipeline 的 `relevanceScore` 由信号贡献求和，`score` 表示 priority 重排后的排序分数；legacy 分数只按原值展示。

完成门槛：产品调用不发送底层 engine ID；旧配置可迁移且问题可定位；真实 Tauri UI 可区分 success、empty、blocked、fallback、failed 和 cancelled。

### Phase 6：删除旧运行时

- [x] 扫描并清除产品、Agent、Chat、测试与迁移层以外对 `RetrievalEngine` 的调用。
- [x] 删除 legacy registry，以及 Keyword、Vector、legacy Lens/Blender 和 facade 中已被原子模块替代的实现。
- [x] 仅在独立 legacy migration 层保留旧 ID 解析；历史 monitor payload 与 legacy trace 类型只负责旧事件展示。

完成门槛：后端只保留 module registry 与 pipeline runner；删除旧实现不影响当前产品调用，legacy 配置仍能得到确定转换结果或结构化问题。

#### Phase 6 调用扫描结论（2026-07-22）

- `RecallCollectionList` 的跨集合内容筛选与 `RecallEntryList` 的当前集合筛选属于管理界面即时搜索，固定使用 `algorithmic` preset；前者显式传入全部集合 ID，后者只传入活动集合 ID。两者不再读取或选择底层 engine。
- Agent `updateEntryContent` 的 `searchQuery` 只用于定位一个待更新条目，同样固定使用 `algorithmic`；Agent 对外检索能力 `searchEntries` 继续接受 `presetId` 并调用同一 pipeline service。
- 前端 `SearchOrchestrator`、`EngineSelector`、`engineCapabilities`、`RetrievalEngineInfo`、store engine registry 与动态 engine 参数注入已删除。索引和向量同步仍由原 orchestrator 文件中的独立类负责。
- `src/` 产品代码已无 `recall_search` 或 `recall_list_engines` 调用；后端 command、registry、旧引擎实现与 `TagSea` 也已删除。迁移基线改由当前 pipeline runner 验证旧数据转换后的结果与 SQLite 重启一致。
- workspace 加载会剥离 `defaultEngineId`、历史投射/折射/texture 和旧评分参数；生产 request/service 类型不再接受 `engineId`。版本化 workspace、Agent 和 pipeline migration 仍确定性转换旧 ID，未知值继续报告结构化问题。

## 发布前 Recall Release Gate

以下门禁属于本周期发布的必要条件，不再视为“不阻塞日常施工”的可选遗留项。任一门禁缺少真实输入、结构化产物或明确的 skip/fail 结果，都视为未通过。

### Gate 0：代码与契约基线

- [ ] 在干净工作区运行完整 `bun run test:run`、`cargo test --manifest-path src-tauri/Cargo.toml`、`bun run check`、`bun run build`；定向 Recall 单测、`vue-tsc`、Vite build、clippy 只能作为开发期证据，不能替代全量门禁。
- [ ] 固定并记录本次发布的应用版本、pipeline schema/trace/migration 版本、数据库 schema 版本和构建提交；测试产物不得混用不同版本的 fixture 或缓存。
- [ ] 检查生产包中不存在 dev server URL、旧 Recall command 注册、旧 engine registry 或未声明的旧配置写回路径。

### Gate 1：正式版本 appData 迁移与恢复

- [ ] 新增并运行具名 Tauri E2E preset（建议命名为 `recall-release-migration`），输入为最近一次正式发布版本的完整隔离 appData 副本；同一套场景覆盖空目录、有效旧目录、损坏集合/向量、缺失 `recall-vectors.db`、旧 workspace/Agent 配置、Knowledge 已存在和重复启动。
- [ ] 首次启动后核对集合、条目、原始 ID、内容 hash、priority、enabled、标签、向量模型/维度、Recall binding、Knowledge 授权、旧权限 key 和旧占位符统计；不得只断言“窗口打开”。
- [ ] 对同一数据根执行进程重启和重复启动，证明迁移幂等、不重复写入、不重复转换、不改变 source fingerprint，并证明迁移后的 pipeline/placeholder/Agent 调用仍可运行。
- [ ] 通过失败注入覆盖主库写入失败、向量迁移失败、损坏 JSON、维度不一致和进程中断；主数据失败必须阻止可写态，向量失败只能降级为待重建，staging 和临时资产必须清理。
- [ ] 将旧目录置为只读后重新启动、检查和运行关键词检索；旧源不得被修改或删除，应用仍能浏览/编辑已迁移主数据。未满足清理条件时不得出现清理入口成功路径。
- [ ] 每次场景保存脱敏的迁移报告、状态转移、数据库/源目录指纹和重启结果；不得记录正文、密钥、完整向量或真实私有路径。

现有 `recall-pipeline`、`recall-chat` 和 `corpus-full` preset 不覆盖上述完整输入：前者只覆盖管线 IPC，后两者分别面向 Chat 恢复和外部 `.aio-kb` 导入，不能直接替代正式版本 appData 迁移门禁。

### Gate 2：迁移后产品回归

- [ ] 在 Gate 1 迁移成功且重启过的同一数据根中运行 `algorithmic`、`comprehensive`、显式 fallback、空结果、blocked、failed、cancelled 和 stale config hash 场景。
- [ ] 覆盖 Chat 注入、Agent `searchEntries`/条目定位、占位符、Recall 管理页搜索、Playground、结果详情和 Monitor；断言产品调用只使用 `presetId`，并核对 pipeline/legacy trace 的分数语义和执行结果。
- [ ] 运行 curated corpus 结构回放，验证迁移前后集合/条目可见性、向量覆盖状态和稳定排序；该回放只证明结构和确定性，不得宣称 Recall 质量提升或旧引擎分数等价。

### Gate 3：合并迁移报告

- [ ] 按[报告样例](./recall-knowledge-migration-report-sample.md)导出真实生产态 Recall + Agent 合并报告，至少包含集合、条目、向量、标签、Recall binding、Knowledge 授权、旧权限 key、旧占位符和问题/恢复说明。
- [ ] 报告必须由真实 `RecallMigrationReport`、Agent migration report 和 Knowledge 检查结果生成；当前设置页只导出 Recall 报告的实现不能标记此门禁完成。
- [ ] 报告中的数量、状态和 fingerprint 必须能与 Gate 1 的隔离 appData 和数据库重新核对；样例数字、工程 fixture 或手工填写的摘要不能作为证据。

### Gate 4：发布二进制 smoke test

- [ ] 使用与拟发布版本完全相同的 `tauri:build` 产物，在全新隔离 appData 中启动发布二进制，检查窗口/WebView、资源加载、默认数据根、Recall 初始化和日志无致命错误。
- [ ] 使用包含正式版本旧数据的第二个隔离根启动同一发布二进制，至少执行一次迁移检查、关键词检索、向量缺失后的可用性检查和进程重启；debug-only WebDriver E2E 不能替代该步骤。
- [ ] 记录构建版本、二进制 hash、平台、数据根、迁移报告摘要和退出码；若发布包无法注入 WebDriver，smoke test 仍需使用进程/窗口/日志和持久化结果完成验证，而不是把测试改回 debug binary。

### Release Gate 判定

只有 Gate 0 至 Gate 4 都有通过证据，且没有未解释的 skip、数据丢失、结构化问题或发布包启动错误，才允许把本计划状态改为“可发布”。在此之前，Phase 0 至 Phase 6 只能描述为“工程实现完成”，不能描述为“本次重构已完成发布验收”。

## 明确不纳入本轮

retrieve 并行化、RRF、多样性重排、Playground 非活动模型对比、查询残差标签扩展，以及独立 Recall 质量评测都需要单独立项；不得以工程夹具、legacy Blender 结果或 VCPToolBox 的生产观测推导 Recall 质量结论。
