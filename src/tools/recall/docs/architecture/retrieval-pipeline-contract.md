# Recall 检索管线契约

本文记录已冻结的检索管线兼容性与运行时约束，不维护施工进度。当前实施顺序见 [`../Plan/recall-retrieval-pipeline-modularization-plan.md`](../Plan/recall-retrieval-pipeline-modularization-plan.md)。

## 稳定接口

- 内置产品预设只有 `algorithmic`（算法召回）和 `comprehensive`（综合召回），均为 `product/stable`。普通产品界面不得展示 legacy engine 或模块图。
- 结构化接口使用 `presetId`，新文本占位符使用 `preset`。`profile` 和 `engineId` 只允许版本化 legacy parser 读取。
- pipeline schema 使用 v1；trace 使用 `recall-pipeline-trace-v1`；legacy 配置迁移使用 `recall-retrieval-migration-v1`。不同预设、算法版本和 Embedding 身份必须使用隔离的缓存空间。
- 每次编译分配 `runId`。compile、prepare、run response 和 trace 必须共同携带 `runId + configHash`；不匹配的晚响应只能标记为 stale，不能覆盖当前结果。

## 执行与评分边界

- `algorithmic` 不声明外部产物依赖，不读取查询向量，也不得触发 Embedding 请求。
- `comprehensive` 复用一次查询向量 bundle，组合关键词、内容向量、标签向量和 Lens 候选。它使用版本化的 weighted fusion；权重、归一化、阈值或分数语义发生变化时必须提升算法版本。
- 候选模块只产生候选或信号。集合范围、启用状态、标签等硬过滤、最终阈值、稳定排序、TopK 和条目回源由公共尾部统一处理；同分使用 entry ID 稳定打破平局。
- `priority` 只在 rerank 阶段应用一次。标签文本匹配不是纯算法预设的额外评分信号，标签仍可作为过滤条件。
- 缺少 `comprehensive` 的阻塞能力时默认失败；只有显式 `fallbackPresetId=algorithmic` 才能降级。不得静默以部分覆盖结果代替完整预设。

## 调用与兼容边界

- Recall service、Chat 被动召回、Agent tool 与 Agent 配置通过 pipeline service 调用；该 service 先编译，再按 external requirements 准备产物，最后执行 Runner。
- 常规产品路径仅使用 Recall 全局活动 Embedding 模型。Chat、Agent、占位符和普通 service 不得逐查询切换模型；切换全局模型时，向量资产与缓存必须按模型/空间身份隔离。
- 自定义管线仅属于 Playground。常规产品只允许 preset summary 声明的 overrides；Playground 不保存运行结果或 trace，也不输出自动质量评分。
- legacy parser 在旧运行时删除前保留。未知 legacy ID 返回 `legacy-id-unknown`，不得静默选择默认预设；删除前必须扫描 workspace、Agent、preset message 和 Agent tool 参数。

## Legacy 能力盘点与拆分边界

旧引擎输出没有独立的模块版本，只能用于迁移诊断，不能进入新管线缓存或充当质量基线。下表保留 Phase 0 对旧行为的必要盘点，避免后续删除运行时时丢失能力取舍依据。

| 旧能力        | 旧行为摘要                                                                                                        | 现行处理                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `keyword`     | 倒排候选、key contains 加成、全局非线性归一化，并在集合内提前执行阈值、排序与 TopK。                              | 迁为 `query-tokenize`、`keyword-recall`、独立归一化、policy 与 finalizer；不沿用旧分数和提前裁剪顺序。    |
| `vector`      | Tag Anchoring、内容余弦与长度调整、tag pool 邻居、动态内容/标签权重、priority 和字面加成；融合前存在候选粗过滤。  | 拆为内容向量、标签向量、字面信号、priority 与 normalize/fuse；不沿用动态权重、阈值和裁剪顺序。            |
| `lens`        | 历史向量衰减投射、显式或自动标签折射、标签邻居、texture affinity、图传播和标签到条目能量汇聚。                    | 当前只保留 entry ID/raw score 候选 helper；历史投射、折射、texture 与标签图传播必须分别决定模块化或删除。 |
| `blender`     | 重复执行字面和内容向量检索，并包含标签残差挖掘、动态 literal/semantic/gravity 权重、resonance 与 priority boost。 | 字面、内容向量、标签和 priority 必须复用现有模块；gravity、残差与 resonance 只有具备独立契约时才保留。    |
| `semantic`    | 直接委托 `vector`，继承其提前裁剪和旧 trace。                                                                     | legacy parser 映射到 `comprehensive`，不建立等价 facade。                                                 |
| `associative` | 分别执行 Blender 与 Lens，再以固定权重融合；子引擎和 facade 都可能提前裁剪。                                      | legacy parser 映射到 `comprehensive`，不保留引擎包含引擎或固定旧权重。                                    |

迁移后的公共规则：

- 集合范围、enabled、标签过滤、最终阈值、稳定排序与最终 TopK 由公共尾部统一处理；候选安全上限必须与最终 `limit` 区分。
- 归一化模块声明输入信号域与算法版本；不同旧引擎的原始分数不能直接比较或解释成百分比。
- 候选 artifact 只携带集合和条目 ID，完整条目由 finalizer 回源；priority 只在 rerank 阶段执行一次。
- 内容向量、标签向量和 Lens 可以共享同一 query embedding bundle，但必须保留可区分的信号与 trace。

## Legacy 调用与删除门槛

- `recall_search`、legacy registry 和 Monitor 的旧 engine metadata 在 Playground 完成迁移前保留，不得继续扩展产品能力。
- Playground 迁移时保留 slot 配置，将 `engineId` 转换为 `presetId`，并清理持久化的 results、trace 和运行状态。
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

