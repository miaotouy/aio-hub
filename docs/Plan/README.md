# 桌面端计划总览与待做清单

> 状态：现行桌面端计划入口
>
> 最近盘点：2026-07-29
>
> 范围：根目录跨模块计划与 `src/tools/*/docs/Plan/`；移动端和独立插件仅在构成桌面任务依赖时列入

## 1. 维护规则

- 本文只维护跨模块优先级、依赖和权威入口；详细验收以对应模块计划为准。
- `docs/Plan/` 只保留待实施、待收口、候选或仍有长期决策价值的文档。
- 施工完成后，将稳定契约写入架构、指南或源码附近文档；没有剩余待办的施工记录不再进入当前执行顺序，可直接删除并由 Git 保留历史，或在仍有复盘价值时明确标记“已完成”并只作为完成记录保留。
- Review 文档不长期并列：未解决问题合并回主计划，已解决问题只保留必要结论。
- 新的跨模块计划放在本目录；单工具计划放在 `src/tools/{toolId}/docs/Plan/`。
- 没有活动计划的工具保持现状，不因盘点自动产生重构任务。
- 执行优先级、专项“最终门禁”和具体版本的发布阻断项是三个不同维度：进入 P0 或仍有最终门禁，不代表自动阻断当前 Alpha；具体版本门禁以对应发布计划中的风险分层为准。

状态口径：

| 状态   | 含义                                           |
| ------ | ---------------------------------------------- |
| 待收口 | 主体代码已落地，只缺真实运行态、迁移或发布门禁 |
| 待实施 | 方案已明确，可以按计划开工                     |
| 候选   | 调查或 RFC 已存在，尚未进入承诺施工队列        |
| 按需   | 需要数据、平台或排期触发的优化项               |
| 活动   | 模块有多个不同状态的现行计划，以模块索引为准   |

发布门禁口径：

| 层级             | 含义                                                                                                      | 版本处理                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Alpha 硬门禁     | 数据损坏、安全/隐私、不可控资源消耗、无法安装/启动/升级、核心能力不可试用或产物兼容声明失真等不可接受风险 | 必须在对应 Alpha 发布前关闭，或通过缩小范围消除暴露面 |
| Alpha 可接受风险 | 已知的中低风险问题，影响有限且可绕过、重试或恢复                                                          | 记录影响、恢复方式和目标版本后可随 Alpha 发布         |
| 正式版最终门禁   | 面向普通用户稳定发布所需的完整体验、迁移、可靠性、兼容、平台矩阵及尚未补齐的完整证据                      | 最迟在不带预发布标识的正式版前关闭                    |

风险等级按严重度、暴露概率和可恢复性判断。缺少某项测试不自动阻断 Alpha，但若它是排除高风险问题的唯一证据，仍属于 Alpha 硬门禁。P0 表示应优先处理的发布安全或专项收口工作，不表示其中每个未完成项都阻断当前 Alpha。详见 [0.7.0-alpha.1 分层门禁](./v0.7.0-alpha.1-release-readiness-and-experience-plan.md#2-分层发布门禁)。

## 2. 当前执行顺序

优先处理当前版本硬门禁和高风险数据/资源问题，再处理专项正式版最终门禁与共享基础设施，最后扩展产品能力。同一优先级内按编号执行；若专项剩余项仅属于正式版最终门禁，可与 Alpha 反馈周期并行。

### P0：发布安全与专项最终收口（按版本分层）

- [ ] **D-P0-01 Knowledge 专项最终门禁**：完整目标仍是完成真实 Tauri 下的 Agent 主动查询、显式引用、文件/目录摄取、重建恢复、研究成功/取消回归，并关闭 `P5-T06` 与 `P5-GATE`。其中已知数据损坏、权限越界、不可恢复重建或核心路径完全不可用问题阻断 Alpha；其余完整场景证据默认作为 `0.7.0` 正式版最终门禁。详见 [Knowledge 施工清单](../../src/tools/knowledge-base/docs/Plan/knowledge-base-implementation-checklist.md)。
- [ ] **D-P0-02 Recall 迁移专项最终门禁**：完整目标仍是在干净工作区完成全量工程检查、具名迁移 E2E、真实 Recall/Agent/Knowledge 合并报告和发布二进制 smoke test。Alpha 必须关闭会损坏既有数据、无法启动或使核心检索不可试用的风险；全量矩阵和完整报告可进入正式版最终门禁。详见 [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)。
- [ ] **D-P0-03 Agent / User Profile 迁移收口**：两项解耦已随 `v0.6.6-r.1` 发布；补 Agent 部分迁移恢复、递归校验、重复启动与真实升级证据，以及 User Profile 多档案迁移恢复、幂等和首载设置一致性测试。除非发现仍会破坏用户数据或阻断启动的回归，否则剩余完整证据作为 `0.7.0` 正式版最终门禁。详见 [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)。
- [ ] **D-P0-04 Agent 目录搜索专项收口**：主仓资源预算、按请求取消、超时传播、总并发与 `searchId` 隔离已经实施，并已通过 LLM/VCP 普通搜索和 2 GiB 宽范围资源止损的真实 dev/Tauri 验收；会重新造成资源失控或替换误写的回归阻断 Alpha，并发 `busy`、服务端取消、节点断线 abort、CPU/线程/UI 响应完整基准及 VCPToolBox 上游集成默认进入正式版最终门禁。详见 [目录搜索资源占用调查与加固计划](../../src/tools/dir-search/docs/Plan/agent-search-resource-safety-investigation.md)。
- [ ] **D-P0-05 Guided Flow 迁移专项最终门禁**：补进程中断恢复、部分主数据失败重试、可溯源旧正式版本 fixture 和发布候选安装包 smoke test。会造成数据破坏、升级阻断且不可恢复的路径以及发布候选基本 smoke 属于 Alpha 硬门禁；更完整的旧版本 fixture 和故障矩阵可在风险可控时进入正式版最终门禁。详见 [Guided Flow 收口计划](./guided-flow-plan.md#114-旧数据迁移自动化验收)。
- [ ] **D-P0-06 0.7 Alpha 1 分层发布收口**：冻结 Alpha 范围，关闭数据、安全、隐私、资源、安装启动升级和产物一致性硬门禁；用发布候选主应用与插件完成 Sidecar API v3 最小兼容主路径，人工核对 Alpha 发布说明并登记可接受风险。系统性 UI 打磨、完整升级说明信息架构和长尾联合验收进入 `0.7.0` 正式版最终门禁。详见 [发布收口记录](./v0.7.0-alpha.1-release-readiness-and-experience-plan.md)与 [Sidecar API v3 收口计划](./sidecar-plugin-api-v3-migration.md)。
- [ ] **D-P0-07 LLM Chat 会话持久化专项验收**：Phase 0 至 Phase 2 的单写者协调、Rust 原子替换、备份恢复、坏文件隔离和非阻塞重建已经实施；已知会造成会话损坏、丢失或启动阻断的路径属于 Alpha 硬门禁，真实进程中止、Windows 文件占用和多 WebView 竞争的完整矩阵可在无高风险证据时作为正式版最终门禁。详见 [会话持久化损坏与启动阻塞调查](../../src/tools/llm-chat/docs/Plan/session-persistence-corruption-investigation.md)。

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
- [ ] **D-P2-09 Embedding Playground 交互与结果验收**：多模型竞技场、阈值校准和重构主体已经实施；补极简 A/B、多模型结果一致性、错误态和核心交互的真实验收。详见 [Embedding 测试场重构计划](../../src/tools/embedding-playground/docs/Plan/refactoring-plan.md)。

### P3：平台验证与观察项

- [ ] **D-P3-01 壁纸探测跨平台真机验证**：在 macOS、GNOME、KDE 核对系统 API、权限拒绝、路径解析和定位行为。详见 [壁纸探测器计划](../../src/tools/wallpaper-detector/docs/Plan/wallpaper-detector-plan.md)。
- [ ] **D-P3-02 Provider 共享运行态观测**：记录真实 Tauri WebView 性能；Android/iOS 真机验收属于移动端队列，不阻塞桌面已完成代码。详见 [Provider Adapter 收口记录](./llm-provider-adapter-sharing-investigation.md)。
- [ ] **D-P3-03 Transcription OCR 行为验收**：图片 VLM/OCR 配置、设置联动和引擎分流已经实施；补 OCR/VLM 行为、错误回退和真实运行验证。详见 [引入本地 OCR 引擎计划](../../src/tools/transcription/docs/Plan/introduce-ocr-engine.md)。

## 3. 关键依赖

| 上游                              | 下游                   | 原因                                              |
| --------------------------------- | ---------------------- | ------------------------------------------------- |
| D-P1-01 模型元数据 v3             | D-P1-02 原生工具调用   | 工具能力需要稳定的模型能力与 API family 来源      |
| D-P0-01 Knowledge、D-P0-02 Recall | D-P2-06 小说垂直切片   | 小说工作台依赖稳定检索、来源追踪、迁移与恢复      |
| D-P2-02 富文本基准                | D-P2-04 会话树大图扩展 | 先用可重复数据区分渲染器和树图成本                |
| D-P1-04 后台会话服务              | 多窗口 UI / SubAgent   | 先稳定 session 级执行与生命周期，再增加 UI 消费方 |

## 4. 根目录计划台账

| 文档                                                                                | 状态   | 下一动作                                                                      |
| ----------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| [0.7.0-alpha.1 发布收口](./v0.7.0-alpha.1-release-readiness-and-experience-plan.md) | 待收口 | D-P0-06，关闭 Alpha 硬门禁、登记可接受风险并保留正式版最终门禁                |
| [Guided Flow](./guided-flow-plan.md)                                                | 待收口 | D-P0-05，按风险拆分 Alpha 数据/安装硬门禁与正式版完整迁移矩阵                 |
| [Sidecar Plugin API v3](./sidecar-plugin-api-v3-migration.md)                       | 待收口 | D-P0-06，先验收 Alpha 最小发布组合，正式版前补齐完整矩阵                      |
| [前端 Chunk 治理](./frontend-chunk-size-investigation.md)                           | 按需   | D-P2-08，先做自动分包与真实 Tauri A/B                                         |
| [Provider Adapter 多端共享](./llm-provider-adapter-sharing-investigation.md)        | 待收口 | D-P3-02，仅剩人工运行态观测                                                   |
| [LLM 聚合渠道与模型路由](./llm-aggregate-channel-routing-investigation.md)          | 候选   | 先实施模型执行路由 resolver；以 OpenCode Go 验证内置路由表，再增加聚合渠道 UI |
| [模型元数据系统优化](./model-metadata-system-optimization-plan.md)                  | 待实施 | D-P1-01，从批次 1 开始                                                        |
| [原生工具调用与编排](./native-tool-calling-adapter-and-orchestration-plan.md)       | 待实施 | D-P1-02，先关闭设计决策                                                       |
| [AI 小说专精模块调查](./ai-novel-studio-investigation.md)                           | 候选   | D-P2-06，做垂直切片验证                                                       |

## 5. 活动工具计划入口

| 模块                                    | 状态   | 权威入口或下一动作                                                                                                     |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `agent-manager`、`user-profile-manager` | 待收口 | [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)，执行 D-P0-03                                        |
| `knowledge-base`、`retrieval`           | 待收口 | [Knowledge 计划索引](../../src/tools/knowledge-base/docs/Plan/README.md)，执行 D-P0-01                                 |
| `recall`                                | 待收口 | [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)，执行 D-P0-02 |
| `llm-chat`                              | 活动   | [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)，按 D-P0-07、D-P1-03、D-P1-04、D-P2-04 排序          |
| `dir-search`                            | 待收口 | LLM/VCP 普通调用与宽范围资源止损已验收，执行 D-P0-04 的专项安全、资源基准和上游集成                                    |
| `translator`                            | 待实施 | 执行 D-P2-01                                                                                                           |
| `token-calculator`                      | 待实施 | 桌面核心 Phase 0–4.5、6 已完成，仅执行 D-P2-03 的 Phase 5 远端下载                                                     |
| `rich-text-renderer`、`web-distillery`  | 按需   | 先复核基线或现代码差异                                                                                                 |
| `media-generator`                       | 待收口 | [计划索引](../../src/tools/media-generator/docs/Plan/README.md)，执行 D-P2-07                                          |
| `wallpaper-detector`                    | 待收口 | 执行 D-P3-01                                                                                                           |
| `embedding-playground`                  | 待收口 | 主体代码已实施，执行 D-P2-09 的核心交互与结果验收                                                                      |
| `transcription`                         | 待收口 | OCR 配置、UI 和引擎分流已实施，执行 D-P3-03                                                                            |

## 6. 回写顺序

1. 更新模块施工清单中的状态、验证命令和实现偏差。
2. 更新本文对应 `D-*` 项和台账。
3. 主体完成但仍有平台验证时，改为“待收口”，并删去已完成的逐步施工说明。
4. 全部验收通过后，将稳定契约转入架构或指南，删除无剩余任务的计划与 review 文档。
