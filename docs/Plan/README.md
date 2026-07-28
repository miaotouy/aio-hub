# 桌面端计划总览与待做清单

> 状态：现行桌面端计划入口
>
> 最近盘点：2026-07-28
>
> 范围：根目录跨模块计划与 `src/tools/*/docs/Plan/`；移动端和独立插件仅在构成桌面任务依赖时列入

## 1. 维护规则

- 本文只维护跨模块优先级、依赖和权威入口；详细验收以对应模块计划为准。
- `docs/Plan/` 只保留待实施、待收口、候选或仍有长期决策价值的文档。
- 施工完成后，将稳定契约写入架构、指南或源码附近文档；没有剩余待办的施工记录直接删除，历史由 Git 保留。
- Review 文档不长期并列：未解决问题合并回主计划，已解决问题只保留必要结论。
- 新的跨模块计划放在本目录；单工具计划放在 `src/tools/{toolId}/docs/Plan/`。
- 没有活动计划的工具保持现状，不因盘点自动产生重构任务。

状态口径：

| 状态   | 含义                                           |
| ------ | ---------------------------------------------- |
| 待收口 | 主体代码已落地，只缺真实运行态、迁移或发布门禁 |
| 待实施 | 方案已明确，可以按计划开工                     |
| 候选   | 调查或 RFC 已存在，尚未进入承诺施工队列        |
| 按需   | 需要数据、平台或排期触发的优化项               |
| 活动   | 模块有多个不同状态的现行计划，以模块索引为准   |

## 2. 当前执行顺序

优先处理数据与发布门禁，再处理共享基础设施，最后扩展产品能力。同一优先级内按编号执行。

### P0：发布、数据与资源安全收口

- [ ] **D-P0-01 Knowledge 最终门禁**：完成真实 Tauri 下的 Agent 主动查询、显式引用、文件/目录摄取、重建恢复、研究成功/取消回归，并关闭 `P5-T06` 与 `P5-GATE`。详见 [Knowledge 施工清单](../../src/tools/knowledge-base/docs/Plan/knowledge-base-implementation-checklist.md)。
- [ ] **D-P0-02 Recall 发布迁移门禁**：在干净工作区完成全量工程检查、具名迁移 E2E、真实 Recall/Agent/Knowledge 合并报告和发布二进制 smoke test。详见 [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)。
- [ ] **D-P0-03 Agent / User Profile 迁移收口**：两项解耦已随 `v0.6.6-r.1` 发布；补 Agent 部分迁移恢复、递归校验、重复启动与真实升级证据，以及 User Profile 多档案迁移恢复、幂等和首载设置一致性测试。详见 [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)。
- [ ] **D-P0-04 Agent 目录搜索资源保护**：实施组合资源预算、按请求取消、超时传播、总并发和 `searchId` 隔离。详见 [目录搜索资源占用调查与加固计划](../../src/tools/dir-search/docs/Plan/agent-search-resource-safety-investigation.md)。
- [ ] **D-P0-05 Guided Flow 迁移发布门禁**：补进程中断恢复、部分主数据失败重试、可溯源旧正式版本 fixture 和发布候选安装包 smoke test。详见 [Guided Flow 收口计划](./guided-flow-plan.md#114-旧数据迁移自动化验收)。
- [ ] **D-P0-06 0.7 Alpha 1 发布体验收口**：打磨新功能 UI，完成升级说明信息架构与正式文案，并用发布候选主应用和插件完成 Sidecar API v3 联合验收后同步发布。详见 [发布收口记录](./v0.7.0-alpha.1-release-readiness-and-experience-plan.md)与 [Sidecar API v3 收口计划](./sidecar-plugin-api-v3-migration.md)。

### P1：共享基础设施

- [ ] **D-P1-01 模型元数据 v3**：完成共享纯核心、v3 Store 与迁移、模型物化、更新/刷新 UI 和移动端共享收口。详见 [模型元数据优化计划](./model-metadata-system-optimization-plan.md)。
- [ ] **D-P1-02 原生工具调用闭环**：先冻结 Tool IR、渠道执行所有权和 Runtime Tool Event 存储决策，再完成 Adapter 契约与 `llm-chat` 编排闭环。详见 [原生工具调用计划](./native-tool-calling-adapter-and-orchestration-plan.md)。
- [ ] **D-P1-03 LLM Chat 插件扩展验收**：在真实 Tauri 中验证启停、设置注入、配置持久化、上下文改写和日志。详见 [上下文管道扩展测试计划](../../src/tools/llm-chat/docs/Plan/pipeline-extension-test-plan.md)。
- [ ] **D-P1-04 后台会话服务**：先实现无 UI 的后台会话执行 API 和取消/等待语义，多窗口 UI 后排。详见 [多会话状态与未来规划](../../src/tools/llm-chat/docs/Plan/multi-session-status.md)。

### P2：产品能力与性能

- [ ] **D-P2-01 批量文件翻译 Phase 1**：先交付可靠纯文本批量、预检、受控并发、安全写出、中止和失败重试。详见 [批量文件翻译方案](../../src/tools/translator/docs/Plan/batch-files-translation-design.md)。
- [ ] **D-P2-02 Rich Text Renderer 基准与低风险修补**：先记录固定样例基线，再决定增量扫描、调度背压和重型节点策略。详见 [性能优化调查](../../src/tools/rich-text-renderer/docs/Plan/performance-optimization-investigation.md)。
- [ ] **D-P2-03 分词器远端下载**：实施 Token Calculator Phase 5，包括下载源、校验、缓存、版本与失败恢复。详见 [分词器资产注册表方案](../../src/tools/token-calculator/docs/Plan/分词器资产注册表方案.md)。
- [ ] **D-P2-04 会话树大图扩展**：仅在 100+ 节点基准证明需要后，再评估显式修订号和可见元素渲染。详见 [会话树性能调查](../../src/tools/llm-chat/docs/Plan/tree-graph-performance-investigation.md)。
- [ ] **D-P2-05 Web Distillery 身份卡增强**：先确认域名自动推荐与现代码差异；文件级整体加密仅作可选增强。详见 [身份卡片规划](../../src/tools/web-distillery/docs/Plan/identity-card-feature-plan.md)。
- [ ] **D-P2-06 AI 小说工作台垂直切片**：在 Knowledge/Recall 门禁稳定后，验证项目、正文、事实状态、证据追踪和可回退修改的最小闭环。详见 [AI 小说模块调查](./ai-novel-studio-investigation.md)。
- [ ] **D-P2-07 MiniMax Music 工作流验收**：补 provider/模型能力测试、两步翻唱 workflow 单测和真实音频入库验收。详见 [Media Generator 计划索引](../../src/tools/media-generator/docs/Plan/README.md)。
- [ ] **D-P2-08 前端构建边界收口**：先验证移除粗粒度 `manualChunks` 的自动分包基线，再按真实 Tauri 数据决定低风险 registry 懒加载；不要继续提高 chunk 警告阈值。详见 [前端 Chunk 治理计划](./frontend-chunk-size-investigation.md)。

### P3：平台验证与观察项

- [ ] **D-P3-01 壁纸探测跨平台真机验证**：在 macOS、GNOME、KDE 核对系统 API、权限拒绝、路径解析和定位行为。详见 [壁纸探测器计划](../../src/tools/wallpaper-detector/docs/Plan/wallpaper-detector-plan.md)。
- [ ] **D-P3-02 Provider 共享运行态观测**：记录真实 Tauri WebView 性能；Android/iOS 真机验收属于移动端队列，不阻塞桌面已完成代码。详见 [Provider Adapter 收口记录](./llm-provider-adapter-sharing-investigation.md)。

## 3. 关键依赖

| 上游                              | 下游                   | 原因                                              |
| --------------------------------- | ---------------------- | ------------------------------------------------- |
| D-P1-01 模型元数据 v3             | D-P1-02 原生工具调用   | 工具能力需要稳定的模型能力与 API family 来源      |
| D-P0-01 Knowledge、D-P0-02 Recall | D-P2-06 小说垂直切片   | 小说工作台依赖稳定检索、来源追踪、迁移与恢复      |
| D-P2-02 富文本基准                | D-P2-04 会话树大图扩展 | 先用可重复数据区分渲染器和树图成本                |
| D-P1-04 后台会话服务              | 多窗口 UI / SubAgent   | 先稳定 session 级执行与生命周期，再增加 UI 消费方 |

## 4. 根目录计划台账

| 文档                                                                                | 状态   | 下一动作                                 |
| ----------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| [0.7.0-alpha.1 发布收口](./v0.7.0-alpha.1-release-readiness-and-experience-plan.md) | 待收口 | D-P0-06，完成 UI、升级说明与联合发布验收 |
| [Guided Flow](./guided-flow-plan.md)                                                | 待收口 | D-P0-05，仅保留真实迁移和安装包门禁      |
| [Sidecar Plugin API v3](./sidecar-plugin-api-v3-migration.md)                       | 待收口 | D-P0-06，完成发布候选组合矩阵            |
| [前端 Chunk 治理](./frontend-chunk-size-investigation.md)                           | 按需   | D-P2-08，先做自动分包与真实 Tauri A/B    |
| [Provider Adapter 多端共享](./llm-provider-adapter-sharing-investigation.md)        | 待收口 | D-P3-02，仅剩人工运行态观测              |
| [模型元数据系统优化](./model-metadata-system-optimization-plan.md)                  | 待实施 | D-P1-01，从批次 1 开始                   |
| [原生工具调用与编排](./native-tool-calling-adapter-and-orchestration-plan.md)       | 待实施 | D-P1-02，先关闭设计决策                  |
| [AI 小说专精模块调查](./ai-novel-studio-investigation.md)                           | 候选   | D-P2-06，做垂直切片验证                  |

## 5. 活动工具计划入口

| 模块                                    | 状态   | 权威入口或下一动作                                                                                                     |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `agent-manager`、`user-profile-manager` | 待收口 | [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)，执行 D-P0-03                                        |
| `knowledge-base`、`retrieval`           | 待收口 | [Knowledge 计划索引](../../src/tools/knowledge-base/docs/Plan/README.md)，执行 D-P0-01                                 |
| `recall`                                | 待收口 | [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)，执行 D-P0-02 |
| `llm-chat`                              | 活动   | [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)，按 D-P1-03、D-P1-04、D-P2-04 排序                   |
| `dir-search`                            | 待实施 | 执行 D-P0-04                                                                                                           |
| `translator`、`token-calculator`        | 待实施 | 执行 D-P2-01、D-P2-03                                                                                                  |
| `rich-text-renderer`、`web-distillery`  | 按需   | 先复核基线或现代码差异                                                                                                 |
| `media-generator`                       | 待收口 | [计划索引](../../src/tools/media-generator/docs/Plan/README.md)，执行 D-P2-07                                          |
| `wallpaper-detector`                    | 待收口 | 执行 D-P3-01                                                                                                           |

## 6. 回写顺序

1. 更新模块施工清单中的状态、验证命令和实现偏差。
2. 更新本文对应 `D-*` 项和台账。
3. 主体完成但仍有平台验证时，改为“待收口”，并删去已完成的逐步施工说明。
4. 全部验收通过后，将稳定契约转入架构或指南，删除无剩余任务的计划与 review 文档。
