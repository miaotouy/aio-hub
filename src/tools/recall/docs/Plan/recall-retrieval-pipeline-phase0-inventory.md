# Recall 检索管线 Phase 0 盘点与契约决策

**状态**: Phase 0 冻结记录  
**日期**: 2026-07-21  
**适用版本**: `recall-retrieval-migration-v1`、`recall-retrieval-pipeline-v1`

本文记录旧检索实现的算法与配置迁移清单、动态调用入口和 Phase 0
契约决策。它是工程迁移依据，不是召回质量报告；旧结果快照不构成新实现的排序或分数门槛。

## 1. 旧实现算法清单

底层 `keyword`、`vector`、`lens`、`blender` 没有独立算法版本字段；
`semantic`、`associative` facade 的结果 trace 使用 `recall-profile-v1`。
迁移时将所有旧输出视为 legacy、未分模块版本的结果，不能写入新缓存空间。

| 旧 ID         | 输入与配置                                                                                                 | 候选和分数步骤                                                                                                                                 | 裁剪、过滤与排序                                                                                               | 新管线取舍                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `keyword`     | text；`recallIds/tags/enabledOnly/minScore/limit`；集合 `minScore/searchTopK`                              | 倒排索引候选；key contains 加 10；全局 `log(1+s)/log(1+max)`                                                                                   | 集合内先排序和 `searchTopK`；归一化后按集合/请求阈值过滤；全局排序和 `limit`                                   | 迁到 `query-tokenize`、`keyword-recall`、独立 normalize/policy/finalizer；不保留旧分数与排序            |
| `vector`      | vector/model/query；`k1/b` 与通用过滤；集合 `minScore/searchTopK`                                          | Tag Anchoring；内容余弦 + BM25 风格长度调整；tag pool 邻居；随样本量变化的向量/标签权重；priority 与 key/content 字面加成；纯标签 fallback     | 内容向量在融合前按 `minScore * 0.6` 粗过滤；集合内 `searchTopK`；全局排序、平滑压缩/可选 min-max、请求 `limit` | 拆成内容向量、标签向量、字面信号、priority 和 normalize/fuse 模块；旧动态权重、阈值和裁剪顺序不迁移     |
| `lens`        | vector/model；`historyVectors/requiredTags/texture/refractionIndex` 与通用过滤；集合 `minScore/searchTopK` | 历史衰减投射；显式/自动标签折射；80 个标签邻居；texture affinity；正则化图拉普拉斯反演；标签到条目能量汇聚                                     | 集合内 `searchTopK`；全局 max normalize；集合/请求阈值；全局 `limit`                                           | 历史投射、标签扩散与能量汇聚作为独立候选/共享 artifact；旧单引擎分数不保留                              |
| `blender`     | vector/model/query；`maxResidualLayers/layerDecay` 与通用过滤；集合 `searchTopK`                           | 重做倒排与 key boost；重做内容向量长度调整；标签残差挖掘；按查询词数动态分配 literal/semantic/gravity 权重；激活路数 resonance；priority boost | 集合内 `searchTopK`；全局 max normalize；请求阈值与 `limit`                                                    | 删除重复检索，复用 keyword/vector/tag 模块；残差与 resonance 只有在独立模块契约下保留；旧融合语义不迁移 |
| `semantic`    | 与 `vector` 相同                                                                                           | 直接委托 `vector`                                                                                                                              | 沿用 `vector` 全部提前裁剪并补 `recall-profile-v1` trace                                                       | legacy parser 映射 `comprehensive`；不建立等价 facade                                                   |
| `associative` | vector/model/query；通用过滤                                                                               | 分别完整执行 Blender 与 Lens；候选合并后固定 `0.65/0.35` 融合                                                                                  | 子引擎候选 `limit=max(requested*4,20)`；子引擎仍可能集合级提前裁剪；最终默认阈值 `0.45`、排序和 `limit`        | legacy parser 映射 `comprehensive`；删除引擎包含引擎结构，不保留固定权重                                |

## 2. 重复逻辑盘点

| 逻辑                 | 重复位置                                                      | 问题与迁移归属                                                      |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| 集合范围扫描         | 四个底层引擎                                                  | Runner 检索上下文统一固定数据范围；多集合先合并候选再全局处理       |
| `enabledOnly`        | 四个底层引擎                                                  | 可下推的 `entry-policy-filter`，trace 记录下推条件                  |
| 集合 `searchTopK`    | 四个底层引擎                                                  | 改为候选模块 `candidateBudget`；不得冒充最终 `limit`                |
| 集合/请求 `minScore` | keyword、vector、lens；blender 使用请求值；associative 再过滤 | 最终阈值仅作用于 fused score；候选粗阈值改名 `candidateFloor`       |
| 排序                 | 所有引擎与 associative facade                                 | finalizer 统一稳定排序并使用 entry ID tie-break                     |
| 归一化               | keyword、vector、lens、blender 各自实现                       | 独立 normalize 模块声明输入信号域、算法和版本                       |
| 字面召回             | keyword、vector boost、blender literal                        | 只保留一个 `keyword-recall` 信号来源                                |
| 内容向量             | vector、blender semantic                                      | 只保留一个内容向量模块，共享 query embedding                        |
| 标签向量/扩散        | vector、lens、blender gravity                                 | 分离 tag-vector 与 lens association，复用同一 bundle/tag pool 代际  |
| priority             | vector、blender                                               | 只在 `rerank` 阶段执行一次，不进入候选生成或 fusion                 |
| 完整条目 clone       | 所有候选分支                                                  | 候选 artifact 仅保存 `recallId/entryId`，finalizer 回源完整条目     |
| TopK                 | 集合层、引擎全局层、associative facade                        | 候选安全裁剪与产品 final `limit` 分离，只有 finalizer 执行最终 TopK |

## 3. 动态调用与保留/删除清单

| 入口                                                 | 当前动态调用                                                                                      | Phase 0 结论                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rust `RecallState` / `recall_search`                 | 注册六个引擎并按 `engineId` 分派；Monitor 仍写 legacy engine metadata                             | 保留到 Phase 5 产品切换完成；Phase 6 删除运行时 registry，仅 legacy migration 识别旧 ID |
| `SearchOrchestrator`                                 | service、store、`useRecallSearchManager` 分别实例化；前端生成向量后调用 `recall_search`           | 保留并冻结扩展；Phase 5 由唯一 pipeline service 取代                                    |
| `services/api.ts`                                    | Chat placeholder、session cache 清理、编辑器 metadata 读取；`searchWithCache` 是被动召回主入口    | 必须保留；Phase 5 将 search/cache 路径改接统一 Runner，metadata API 不受影响            |
| `recallCollectionStore.search`                       | `RecallCollectionList.vue`、`RecallEntryList.vue` 的管理页搜索                                    | 必须保留管理能力；Phase 5 收口到 pipeline service，不再维护独立 engine/embedding 分支   |
| Playground                                           | `PlaygroundView.vue` -> `SearchSlot.vue` -> `useRecallSearchManager` -> `SearchOrchestrator`      | 读取 `config.playground.globalQuery/selectedRecallIds/slots[]`；逐 slot 将 `engineId` 转为 `presetId`，保留 slot 配置，清理 `slots[].results` 等运行态结果 |
| Chat processor                                       | `RecallProcessor` -> `resolvePlaceholderRetrieval` -> `searchWithCache`                           | 必须保留；Phase 5 改传 `presetId`，后台路径禁止交互式覆盖率对话框                       |
| Agent tool                                           | `recall-basic.searchEntries` -> `agentActions.searchEntries` -> `recall_search`，默认 `keyword`   | 必须保留；Phase 5 参数改为 `presetId` 并走同一 Runner                                   |
| Agent binding/profile                                | `AgentRecallSettings.defaultProfile`、`RecallBinding.profile`、Recall macro 与 placeholder parser | 必须保留 legacy read；新结构字段为 `defaultPresetId/presetId`，新占位符字段为 `preset`  |
| Retrieval cache                                      | key 包含 engine/profile/model/旧算法版本，value 持久化 results/vector 于进程缓存                  | 切换算法时整空间失效，不转换旧 key/value                                                |
| `SearchPanel` / `EngineSelector` / `useRecallSearch` | 静态扫描只有三者互相引用，不在产品渲染路径                                                        | 不做 pipeline 适配；Phase 5 在再次确认无动态加载后删除                                  |

## 4. Phase 0 冻结决策

- 内置预设为 `algorithmic`（显示名“算法召回”）和 `comprehensive`
  （显示名“综合召回”）；两者均为 `product/stable`。普通产品只展示这两个摘要，
  不展示 legacy engine 或模块图。
- pipeline schema、trace 和 migration 分别使用版本
  `1`、`recall-pipeline-trace-v1`、`recall-retrieval-migration-v1`。
  `algorithmic` 与 `comprehensive` 使用独立 algorithm version/cache 空间。
- 结构化 API 字段使用 `presetId`；新文本占位符使用 `preset`。
  `profile` 与 `engineId` 只由版本化 legacy parser 读取。
- `priority` 只属于 `rerank`。纯算法首期包含 key/title/content 字面信号；
  标签仍可作为硬过滤条件，但标签文本匹配不在首期自动变成额外评分信号。
- 自定义 pipeline 首期只属于 Playground。常规产品只允许 preset summary
  声明的 overrides；Phase 0 仅开放 finalizer `limit`。
- `comprehensive` 缺少阻塞能力时默认失败；只有显式配置
  `fallbackPresetId=algorithmic` 才允许降级。默认不静默 partial coverage。
- Playground 首期最多两个可见诊断工作面，不输出自动质量评分。
- legacy parser 保留到 Phase 6，删除前必须完成 workspace、Agent、preset message
  和 Agent tool 参数扫描。未知 ID 返回 `legacy-id-unknown`，不选择默认预设。
- 每次 compile 开始即分配 `runId`，compile、prepare、run response 和 trace
  共同携带 `runId + configHash`。任何一项不匹配的晚响应都只能记为 stale，
  不能提交到当前结果状态。

综合预设最终使用 weighted fusion 还是 RRF 仍属于 Phase 4 的产品算法决策；
Phase 0 只冻结它必须消费显式归一化信号、记录贡献且提升算法版本后才能变更。

## 5. 测试装配边界

Phase 0 冻结独立真实窗口入口为 `recall-pipeline`，对应 spec 路径
`tests/tauri-e2e/specs/recall-pipeline-workflow.spec.ts`。运行元数据必须至少包含：

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

Runner、compiler 和 Tauri command 在 Phase 1 才存在，因此 Phase 0 不注册一个会
伪造 compile/run 结果的可执行 preset。Phase 1 实现该 spec 与 preset，并真实覆盖
`compile -> prepare -> run -> pipeline trace`；现有 `recall-vector/recall-chat`
继续明确代表 `legacy-engine` 路径。
