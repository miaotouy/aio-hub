# Recall 检索管线模块化实施计划

**状态**：Phase 0 至 Phase 2、Phase 4 已完成；Phase 3 与 Phase 5 部分完成；Phase 6 未开始。

**最近修订**：2026-07-22
**范围**：`src/tools/recall/`、`src-tauri/src/recall/`、Recall Playground、Agent Recall 配置与 Chat 召回入口。

本目录只保留本施工计划。稳定的管线契约见 [`../architecture/retrieval-pipeline-contract.md`](../architecture/retrieval-pipeline-contract.md)，存储、备份与迁移约束见 [`../architecture/storage-migration-contract.md`](../architecture/storage-migration-contract.md)，测试运行边界见 [`../architecture/retrieval-testing.md`](../architecture/retrieval-testing.md)，现行实现结构见 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)。

## 当前状态

| 阶段         | 已落地                                                                                                                                                                                                                                                                                             | 完成前还需做什么                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Phase 0 至 2 | Runner、compiler、artifact store、公共过滤/finalizer、`algorithmic` 和生产 IPC 已可用。                                                                                                                                                                                                            | 仅随 Phase 6 删除 Keyword 重复实现。                       |
| Phase 3      | 内容向量、标签种子、受限共现图传播和标签到条目扩展已进入生产管线，并共享一次查询向量；查询残差标签扩展已确定不进入本轮稳定预设。                                                                                                                                                                   | 收口 legacy 实现的删除边界，并记录独立实验的后续立项入口。 |
| Phase 4      | `comprehensive` 已组合关键词、内容向量和标签图候选；weighted fusion v1、独立 `relevanceScore`、预算/priority/阈值边界、工程夹具和显式 fallback 已冻结。                                                                                                                                            | 已完成。                                                   |
| Phase 5      | service、Chat、Agent tool、Agent 配置及全局/绑定预设已使用 `presetId`；Agent 编辑器已由 preset summary 和 compile result 驱动 override 范围与能力预检；后台入口只读全局活动模型且不弹交互提示；模型切换会轮换活动资产代际并隔离缓存；Playground 已使用 pipeline 状态机、双预设、批量回放和 trace。 | 完成 Playground 阶段模块编辑与 Monitor 收口。              |
| Phase 6      | legacy runner 仍服务 `recall_search`、管理页局部搜索和迁移夹具。                                                                                                                                                                                                                                   | 完成调用扫描后删除 legacy registry 与已替代实现。          |

## 施工顺序

### Phase 3：收口旧能力取舍

- [x] 新管线不再使用 `Lens`、`Blender` 作为模块、预设或产品能力名称；它们只在 legacy migration 和删除前的调试路径中保留。
- [x] 用原子模块替换当前 legacy Lens helper：标签种子召回、受限标签图传播和标签到条目候选扩展。
- [x] 查询残差标签扩展不进入本轮 `comprehensive`；如后续立项，只能作为 Playground 独立实验模块，且不得重复执行字面或内容向量检索。
- [ ] 删除历史投射、折射、`texture`、Blender 动态 literal/semantic/gravity 权重和 resonance 乘法；literal、内容向量、标签向量与 priority 必须复用现有原子模块。
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
- 现有历史向量投射、显式/自动折射和 `texture` 已不进入 pipeline service 或 Playground。它们仅留在 legacy engine、迁移基线和删除前诊断路径，Phase 6 删除前不得继续扩展。
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
- [ ] 将 Playground 收口为双配置诊断工作面，提供阶段模块编辑、fixture 批量重放、batch run 与 trace 调试；首期只使用全局活动模型。
- [ ] 在结果详情和 Monitor 展示分数语义、信号贡献、requested/actual preset、降级和版本化 trace，并兼容 legacy trace。
- [x] 移除 Playground workspace 的结果和运行态持久化；确认无动态引用后删除闲置搜索组件与 engine capability 分支。

Playground 当前已固定为 `algorithmic / comprehensive` 双配置诊断工作面，使用全局活动模型，支持多行查询批量回放、batch run、编译阶段与完整 trace 调试。workspace 只保存集合、查询和 `presetId / limit`，旧 `engineId / config / results` 经迁移后失效；旧 `SearchPanel`、`useRecallSearch` 和 `useRecallSearchManager` 已在无静态或动态引用后删除。尚未完成的是阶段模块编辑：后端目前只有内置 preset 的 compile/run IPC，还没有受限自定义 pipeline 的模块清单、编译和运行命令，因此本条保持未完成。

完成门槛：产品调用不发送底层 engine ID；旧配置可迁移且问题可定位；真实 Tauri UI 可区分 success、empty、blocked、fallback、failed 和 cancelled。

### Phase 6：删除旧运行时

- [ ] 扫描并清除产品、Agent、Chat、测试与迁移层以外对 `RetrievalEngine` 的调用。
- [ ] 删除 legacy registry，以及 Keyword、Vector、legacy Lens/Blender 和 facade 中已被原子模块替代的实现。
- [ ] 仅在独立 legacy migration 层保留旧 ID 解析。

完成门槛：后端只保留 module registry 与 pipeline runner；删除旧实现不影响当前产品调用，legacy 配置仍能得到确定转换结果或结构化问题。

## 发布前的 Recall 遗留门禁

这些项目不阻塞上述各 Phase 的日常施工，但在本轮 Recall / Knowledge 重构发布前必须完成：

- [ ] 使用完整隔离 appData 副本，通过具名 Tauri E2E preset 验证 Recall 首次启动迁移、进程重启、失败回滚与旧目录只读恢复。
- [ ] 按存储迁移契约和[报告样例](./recall-knowledge-migration-report-sample.md)导出生产态 Recall 与 Agent 的合并迁移报告，核对集合、条目、向量、标签、Recall binding、Knowledge 授权和旧占位符统计。
- [ ] 对发布二进制执行 smoke test。Knowledge 的固定跨模块 Tauri 回归由其自身施工清单跟踪。

## 明确不纳入本轮

retrieve 并行化、RRF、多样性重排、Playground 非活动模型对比、查询残差标签扩展，以及独立 Recall 质量评测都需要单独立项；不得以工程夹具、legacy Blender 结果或 VCPToolBox 的生产观测推导 Recall 质量结论。
