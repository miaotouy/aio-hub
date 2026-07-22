# Recall 检索管线模块化实施计划

**状态**：Phase 0 至 Phase 2 已完成；Phase 3 至 Phase 5 部分完成；Phase 6 未开始。

**最近修订**：2026-07-22
**范围**：`src/tools/recall/`、`src-tauri/src/recall/`、Recall Playground、Agent Recall 配置与 Chat 召回入口。

本目录只保留本施工计划。稳定的管线契约见 [`../architecture/retrieval-pipeline-contract.md`](../architecture/retrieval-pipeline-contract.md)，存储、备份与迁移约束见 [`../architecture/storage-migration-contract.md`](../architecture/storage-migration-contract.md)，测试运行边界见 [`../architecture/retrieval-testing.md`](../architecture/retrieval-testing.md)，现行实现结构见 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)。

## 当前状态

| 阶段         | 已落地                                                                                  | 完成前还需做什么                                                              |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Phase 0 至 2 | Runner、compiler、artifact store、公共过滤/finalizer、`algorithmic` 和生产 IPC 已可用。 | 仅随 Phase 6 删除 Keyword 重复实现。                                          |
| Phase 3      | 内容向量、标签向量与 Lens entry ID/raw score 候选已进入生产管线，并共享一次查询向量。   | 决定 Lens 的历史投射/折射/标签图传播，以及 Blender gravity/resonance 的去留。 |
| Phase 4      | `comprehensive` 已组合四路候选并使用 weighted fusion v1。                               | 固化分数与参数契约，补工程夹具和显式 fallback。                               |
| Phase 5      | service、Chat、Agent tool、Agent 配置及全局/绑定预设已使用 `presetId`。                 | 完成 capability UI、全局模型代际、Playground、Monitor 和 workspace 收口。     |
| Phase 6      | legacy runner 仍服务 `recall_search`、旧 Playground 和迁移夹具。                        | 完成调用扫描后删除 legacy registry 与已替代实现。                             |

## 施工顺序

### Phase 3：收口旧能力取舍

- [ ] 决定 Lens 历史投射、折射和标签图传播是独立模块还是删除。
- [ ] 决定 Blender gravity/resonance 是否需要独立模块；literal/semantic 必须继续复用现有候选。
- [ ] 记录 Vector、Lens、Blender 的保留、替代、删除和回滚边界。

完成门槛：每个保留能力都有独立模块契约；每个删除能力都有明确替代或迁移结论。

### Phase 4：完成综合预设 v1

- [ ] 固化 weighted fusion v1 的分数语义、权重、配置约束、性能边界和 trace 字段；RRF 不属于 v1。
- [ ] 固化候选上限、各路归一化、最终阈值和 priority 的合法范围、默认值来源与版本边界。
- [ ] 用工程夹具覆盖精确字面、内容向量、标签、Lens、空候选、无向量数据和稳定 tie-break。
- [ ] 建立可追踪的 `fallbackPresetId` 降级路径。

完成门槛：综合预设的编译、执行、trace、缓存隔离和 fallback 都有确定性验证；默认参数与算法版本可追溯。

### Phase 5：完成产品收口

- [ ] Agent 编辑器根据 preset summary / compile result 渲染 allowed overrides 和 capability 预检。
- [ ] 验证 Chat、Agent、占位符和普通 service 都只读取 Recall 全局活动模型，后台执行不弹交互对话框。
- [ ] 实现全局模型切换的资产代际标识、覆盖提示和缓存隔离验证。
- [ ] 以编译后的 external requirements 与参数 schema 驱动 `idle -> compile -> prepare -> run -> outcome`，并隔离 stale response。
- [ ] 将 Playground 收口为双配置诊断工作面，提供阶段模块编辑、fixture 批量重放、batch run 与 trace 调试；首期只使用全局活动模型。
- [ ] 在结果详情和 Monitor 展示分数语义、信号贡献、requested/actual preset、降级和版本化 trace，并兼容 legacy trace。
- [ ] 移除 Playground workspace 的结果和运行态持久化；确认无动态引用后删除闲置搜索组件与 engine capability 分支。

完成门槛：产品调用不发送底层 engine ID；旧配置可迁移且问题可定位；真实 Tauri UI 可区分 success、empty、blocked、fallback、failed 和 cancelled。

### Phase 6：删除旧运行时

- [ ] 扫描并清除产品、Agent、Chat、测试与迁移层以外对 `RetrievalEngine` 的调用。
- [ ] 删除 legacy registry，以及 Keyword、Vector、Lens、Blender 和 facade 中已被模块替代的实现。
- [ ] 仅在独立 legacy migration 层保留旧 ID 解析。

完成门槛：后端只保留 module registry 与 pipeline runner；删除旧实现不影响当前产品调用，legacy 配置仍能得到确定转换结果或结构化问题。

## 发布前的 Recall 遗留门禁

这些项目不阻塞上述各 Phase 的日常施工，但在本轮 Recall / Knowledge 重构发布前必须完成：

- [ ] 使用完整隔离 appData 副本，通过具名 Tauri E2E preset 验证 Recall 首次启动迁移、进程重启、失败回滚与旧目录只读恢复。
- [ ] 按存储迁移契约和[报告样例](./recall-knowledge-migration-report-sample.md)导出生产态 Recall 与 Agent 的合并迁移报告，核对集合、条目、向量、标签、Recall binding、Knowledge 授权和旧占位符统计。
- [ ] 对发布二进制执行 smoke test。Knowledge 的固定跨模块 Tauri 回归由其自身施工清单跟踪。

## 明确不纳入本轮

retrieve 并行化、RRF、多样性重排、Playground 非活动模型对比，以及独立 Recall 质量评测都需要单独立项；不得以工程夹具或旧结果快照推导质量结论。

