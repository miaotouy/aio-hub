# Recall 检索管线契约

本文记录已冻结的检索管线兼容性与运行时约束，不维护施工进度。当前实施顺序见 [`../Plan/recall-retrieval-pipeline-modularization-plan.md`](../Plan/recall-retrieval-pipeline-modularization-plan.md)。

## 稳定接口

- 内置产品预设只有 `algorithmic`（算法召回）和 `comprehensive`（综合召回），均为 `product/stable`。普通产品界面不得展示 legacy engine 或模块图。
- 结构化接口使用 `presetId`，新文本占位符使用 `preset`。`profile` 和 `engineId` 只允许版本化 legacy parser 读取。
- pipeline schema 使用 v1；trace 使用 `recall-pipeline-trace-v1`；legacy 配置迁移使用 `recall-retrieval-migration-v1`。不同预设、算法版本和 Embedding 身份必须使用隔离的缓存空间。
- 每次编译分配 `runId`。compile、prepare、run response 和 trace 必须共同携带 `runId + configHash`；不匹配的晚响应只能标记为 stale，不能覆盖当前结果。需要查询向量的 bundle 还必须携带当前活动 Embedding 模型身份与资产代际。

## 执行与评分边界

- `algorithmic` 不声明外部产物依赖，不读取查询向量，也不得触发 Embedding 请求。
- `comprehensive` 复用一次查询向量 bundle，组合关键词、内容向量和原子标签图候选。`tag-vector-recall` 只输出标签种子，`bounded-tag-propagation` 以受限共现图生成查询级能量场，`tag-to-entry-expansion` 才输出 `tag-graph` 候选。当前稳定预设不执行查询残差标签扩展，也不以标签上下文改写供内容向量召回使用的原始查询向量。它使用版本化的 weighted fusion；权重、归一化、阈值或分数语义发生变化时必须提升算法版本。
- 候选模块只产生候选或信号。集合范围、启用状态、标签等硬过滤、最终阈值、稳定排序、TopK 和条目回源由公共尾部统一处理；同分使用 entry ID 稳定打破平局。
- `priority` 只在 rerank 阶段应用一次。标签文本匹配不是纯算法预设的额外评分信号，标签仍可作为过滤条件。
- 缺少 `comprehensive` 的阻塞能力时默认失败；只有显式 `fallbackPresetId=algorithmic` 才能降级。不得静默以部分覆盖结果代替完整预设。
- fallback 请求必须同时携带 `requestedPresetId=comprehensive`、`actualPresetId=algorithmic`、`fallbackPresetId=algorithmic` 和非空原因；Runner 对未授权组合返回 `fallback-not-allowed`。fallback 即使没有候选也使用 `outcome=fallback`，空结果由 `results` 表达。

### Weighted fusion v1

- `keyword-normalize` 对每次查询、每种信号类型分别计算 `ln(1 + max(rawScore, 0)) / max(ln(1 + rawScore))`，输出范围为 `[0, 1]`。不同信号类型不共享最大值；没有正分的类型归一化为 `0`。
- `relevanceScore` 是归一化信号乘固定权重后的加和，不包含 priority。每个权重必须位于 `[0, 1]`，且权重总和必须为正数，compiler 会拒绝不满足约束的配置。`algorithmic-v2` 的 `key/keyword` 权重为 `1.0/0.7`，理论范围为 `[0, 1.7]`；`comprehensive-v3` 的 `key/keyword/content-vector/tag-vector/tag-graph` 权重为 `0.45/0.35/0.55/0/0.2`，理论范围为 `[0, 1.55]`。`tag-vector` 在当前预设中只产生标签种子，因此候选权重固定为 `0`。RRF 不属于 v1。
- `minScore` 合法范围为 `[0, 1]`，依次读取集合 `config.minScore`、请求 `filters.minScore`，均未提供时不执行分数过滤。集合配置优先于请求值。阈值只比较 `relevanceScore`，不比较 priority rerank 后的 `score`。
- priority 的持久化默认值是 `100`，评分时有效范围固定为 `[0, 999]`；越界旧数据只在评分计算中截取到该范围，不改写存储。rerank 公式为 `score = relevanceScore * (1 + max(log10(effectivePriority / 100), 0) * 0.1)`，仅执行一次。最终按 `score desc, recallId asc, entryId asc` 稳定排序。
- 内置预设候选预算默认 `80`，管线级候选和扩展预算上限均为 `10000`；`comprehensive` 的标签种子上限为 `40`、每节点邻居上限为 `12`、传播状态上限为 `80`。最终 `limit` 默认 `6`，产品 override 合法范围为 `[1, 100]`。候选预算、扩展预算和最终 limit 是三个独立边界。
- `normalize`、`weighted-fusion`、`priority-boost`、`score-threshold` 和 `result-finalizer` 的 trace step `details` 分别记录归一化算法、固定权重与分数范围、priority 公式与范围、阈值来源/字段及最终排序规则。评分模块版本为 `2`；上述语义、权重、范围或顺序变化时必须再次提升评分模块和受影响预设的算法版本。

## 调用与兼容边界

- Recall service、Chat 被动召回、Agent tool 与 Agent 配置通过 pipeline service 调用；该 service 先编译，再按 external requirements 准备产物，最后执行 Runner。
- 常规产品路径仅使用 Recall 全局活动 Embedding 模型。Chat、Agent、占位符和普通 service 不得逐查询切换模型；切换全局模型时必须轮换版本化活动资产代际，并让 query bundle 与缓存同时按完整模型身份和资产代际隔离。
- 自定义管线仅属于 Playground。常规产品只允许 preset summary 声明的 overrides；Playground 不保存运行结果或 trace，也不输出自动质量评分。查询残差标签扩展如后续立项，只能先作为独立实验模块进入自定义管线；实验存在不代表稳定预设获得该能力。
- legacy parser 在旧运行时删除前保留。未知 legacy ID 返回 `legacy-id-unknown`，不得静默选择默认预设；删除前必须扫描 workspace、Agent、preset message 和 Agent tool 参数。

## Legacy 能力盘点与拆分边界

旧引擎输出没有独立的模块版本，只能用于迁移诊断，不能进入新管线缓存或充当质量基线。下表保留 Phase 0 对旧行为的必要盘点，避免后续删除运行时时丢失能力取舍依据。

| 旧能力        | 旧行为摘要                                                                                                        | 现行处理                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keyword`     | 倒排候选、key contains 加成、全局非线性归一化，并在集合内提前执行阈值、排序与 TopK。                              | 迁为 `query-tokenize`、`keyword-recall`、独立归一化、policy 与 finalizer；不沿用旧分数和提前裁剪顺序。                                                                                                 |
| `vector`      | Tag Anchoring、内容余弦与长度调整、tag pool 邻居、动态内容/标签权重、priority 和字面加成；融合前存在候选粗过滤。  | 拆为内容向量、标签向量、字面信号、priority 与 normalize/fuse；不沿用动态权重、阈值和裁剪顺序。                                                                                                         |
| `lens`        | 历史向量衰减投射、显式或自动标签折射、标签邻居、texture affinity、图传播和标签到条目能量汇聚。                    | 已从生产管线移除。新管线使用标签种子、受限共现图传播和标签到条目扩展；历史投射、折射与 texture 仅在 legacy engine 和迁移诊断保留，待 Phase 6 删除。                                                    |
| `blender`     | 重复执行字面和内容向量检索，并包含标签残差挖掘、动态 literal/semantic/gravity 权重、resonance 与 priority boost。 | 不迁移 residual mining 实现、动态权重、gravity 与 resonance；字面、内容向量、标签和 priority 复用现有模块。查询残差标签扩展只保留独立实验立项入口，不进入当前 `comprehensive`，也不保留 Blender 名称。 |
| `semantic`    | 直接委托 `vector`，继承其提前裁剪和旧 trace。                                                                     | legacy parser 映射到 `comprehensive`，不建立等价 facade。                                                                                                                                              |
| `associative` | 分别执行 Blender 与 Lens，再以固定权重融合；子引擎和 facade 都可能提前裁剪。                                      | legacy parser 映射到 `comprehensive`，不保留引擎包含引擎或固定旧权重。                                                                                                                                 |

迁移后的公共规则：

- 集合范围、enabled、标签过滤、最终阈值、稳定排序与最终 TopK 由公共尾部统一处理；候选安全上限必须与最终 `limit` 区分。
- 归一化模块声明输入信号域与算法版本；不同旧引擎的原始分数不能直接比较或解释成百分比。
- 候选 artifact 只携带集合和条目 ID，完整条目由 finalizer 回源；priority 只在 rerank 阶段执行一次。
- 内容向量、标签向量和原子标签扩展模块可以共享同一 query embedding bundle，但必须保留可区分的信号与 trace。
- 查询残差标签扩展若进入后续实验，必须消费同一 query embedding 和基础标签种子，只输出可区分的补充标签种子；它不得修改原始 query embedding、直接产生候选或复用 legacy Blender 的非正交投影累加实现。基础、残差和合并种子必须使用显式 artifact 契约。
- `bounded-tag-propagation` 使用 `maxHops <= 3`、每节点邻居数、整次查询总状态数和总出流约束；邻居按共现权重和标签名稳定截取。`query-energy-field` 记录模型签名、配置哈希、截断及回流抑制；图代际由确定性序列化后的 `cooccurrence-v1` 图内容计算，外部 artifact generation 仅作为来源代际另行记录。
- 新管线不得将多项原子能力重新包装成 Lens、Blender 或等价 facade；旧名称只允许 legacy parser、迁移报告和删除前诊断读取。

## Legacy 调用与删除门槛

- `recall_search`、legacy registry 和 Monitor 的旧 engine metadata 只为尚未迁移的管理页局部搜索、迁移夹具和删除前诊断保留，不得继续扩展产品能力。
- Playground workspace 只保留集合、查询和 `presetId / limit`；legacy migration 将 `engineId` 转换为 `presetId`，并使旧 config、results、trace 和运行状态失效。
- service、管理页搜索、Chat processor 和 Agent tool 必须统一经过 pipeline service；后台 Chat 路径不得弹出交互式模型或覆盖率对话框。
- Agent settings、binding、占位符和工具参数只保留版本化 legacy read；新写入只能使用 `defaultPresetId`、`presetId` 和 `preset`。
- legacy 检索缓存不转换到新缓存空间。删除 registry 前必须再次扫描动态调用、workspace 和测试夹具；迁移层以外仍有消费者时不得执行 Phase 6 删除。

## 可观测性

真实管线运行记录至少包含以下字段：

```text
executionPath = retrieval-pipeline
runId
pipelineId
requestedPresetId
actualPresetId
configHash
algorithmVersion
traceVersion
```

分数、信号贡献、requested/actual preset 与降级信息必须在 trace 中分层表达；分数不应被统一解释为百分比，也不能据工程夹具的差异推导召回质量结论。

生产 pipeline command 必须为每次后端运行发送 `recall-monitor` RAG 事件，包括成功、空结果、降级与结构化失败。事件保留 legacy RAG payload 的 `steps / results / stats / metadata` 外形，并以可选字段增加完整 `pipelineTrace`、`pipelineError` 以及 `executionPath / runId / outcome / requestedPresetId / actualPresetId`；因此历史事件和 legacy `recall_search` 事件仍可由同一 Monitor 读取。pipeline 结果的 Monitor metadata 以 `ranking-score` 标记 `score`，另传由信号 contribution 求和得到的 `relevanceScore`；legacy 结果以 `legacy-engine-score` 标记，不推断统一数值范围。
