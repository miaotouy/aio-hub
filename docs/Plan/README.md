# 桌面端计划总览与待做清单

> 状态：现行桌面端计划入口
>
> 最近盘点：2026-07-23
>
> 范围：根目录跨模块计划、`src/tools/*/docs/Plan/` 与全部已注册桌面工具；移动端和独立插件仅在构成桌面任务依赖时列入

## 1. 使用规则

- 本文负责跨模块优先级、依赖和入口，不替代模块计划中的详细验收项。
- 模块存在施工清单时，以模块清单为完成状态来源；本文只同步阶段级状态。
- `已完成` 文档保留作实施记录，不继续产生待办；`候选` 项进入施工前需要重新确认范围。
- 新的跨模块计划放在本目录；单工具计划放在 `src/tools/{toolId}/docs/Plan/`。
- 没有活动计划的工具保持现状，不因本次盘点自动产生重构任务。

状态口径：

| 状态   | 含义                                           |
| ------ | ---------------------------------------------- |
| 待收口 | 主体代码已落地，只缺真实运行态、迁移或发布门禁 |
| 待实施 | 方案已明确，可以按计划开工                     |
| 候选   | 调查或 RFC 已存在，尚未进入承诺施工队列        |
| 按需   | 优化或增强项，需要数据、平台或排期触发         |
| 活动   | 模块包含多个不同状态的现行计划，以模块索引为准 |
| 已完成 | 仅保留实施记录，不进入当前清单                 |

## 2. 当前执行顺序

优先级先处理数据与发布门禁，再处理共享基础设施，最后扩展产品能力。相同优先级内按编号顺序执行。

### P0：发布、数据与资源安全收口

- [ ] **D-P0-01 Knowledge 最终门禁**：完成真实 Tauri 下的 Agent 主动查询、显式引用、文件/目录摄取、重建恢复、研究成功/取消回归，并关闭 `P5-T06` 与 `P5-GATE`。详见 [Knowledge 施工清单](../../src/tools/knowledge-base/docs/Plan/knowledge-base-implementation-checklist.md)。
- [ ] **D-P0-02 Recall 发布迁移门禁**：在干净工作区完成全量工程检查、具名迁移 E2E、真实 Recall/Agent/Knowledge 合并报告和发布二进制 smoke test。详见 [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)。
- [ ] **D-P0-03 Agent / User Profile 发布后路径收口**：两项解耦已随 `v0.6.6-r.1` 发布，但 2026-07-23 代码审计发现 Agent 导入、内置预设资产、升级覆盖和 Rust 搜索仍残留旧 `llm-chat/agents` 路径；User Profile 的实际多档案迁移与原计划单文件描述不符，且缺少部分迁移恢复、重复启动和首载设置一致性测试。先修正残余路径并补迁移级测试，再恢复“已完成”状态。详见 [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)。
- [ ] **D-P0-04 Agent 目录搜索资源保护**：一次宽范围 VCP 搜索超时后未取消底层 walker，随后与新搜索重叠；当前单次默认最多使用 12 个 worker，且缺少深度、扫描文件数、deadline、总并发和 searchId 隔离。按组合资源预算、按请求取消、超时 signal 传播和替换完整性门禁实施。详见 [目录搜索资源占用调查与加固计划](../../src/tools/dir-search/docs/Plan/agent-search-resource-safety-investigation.md)。

### P1：共享基础设施

- [ ] **D-P1-01 模型元数据 v3**：依次完成共享纯核心、v3 Store 与迁移、模型物化、更新/刷新 UI、移动端共享收口。它应先于依赖模型能力和 API family 的新运行时判断。详见 [模型元数据优化计划](./model-metadata-system-optimization-plan.md)。
- [ ] **D-P1-02 原生工具调用闭环**：先冻结 Tool IR、渠道执行所有权和 Runtime Tool Event 存储决策，再完成 OpenAI、Anthropic、Gemini、Cohere 等 Adapter 契约与 `llm-chat` 编排闭环。开工前先关闭计划第 14.2 节的阻塞决策。详见 [原生工具调用计划](./native-tool-calling-adapter-and-orchestration-plan.md)。
- [ ] **D-P1-03 LLM Chat 插件扩展验收**：现有示例插件与宿主接线已存在；在真实 Tauri 中验证启停、设置注入、配置持久化、上下文改写和日志，再将计划转为已完成。详见 [上下文管道扩展测试计划](../../src/tools/llm-chat/docs/Plan/pipeline-extension-test-plan.md)。
- [ ] **D-P1-04 后台会话服务**：先实现无 UI 的后台会话执行 API 和取消/等待语义；多窗口 UI 在服务契约稳定后再排。详见 [多会话状态与未来规划](../../src/tools/llm-chat/docs/Plan/multi-session-status.md)。

### P2：产品能力与性能

- [ ] **D-P2-01 批量文件翻译 Phase 1**：先交付可靠纯文本批量、预检、受控并发、安全写出、中止和失败重试；结构化格式、任务持久化和翻译记忆分后续阶段。详见 [批量文件翻译方案](../../src/tools/translator/docs/Plan/batch-files-translation-design.md)。
- [ ] **D-P2-02 Rich Text Renderer 基准与低风险修补**：先用固定长文本、代码/公式和重型节点样例记录基线，再决定增量扫描、调度背压和重型节点 pending 策略。详见 [性能优化调查](../../src/tools/rich-text-renderer/docs/Plan/performance-optimization-investigation.md)。
- [ ] **D-P2-03 分词器远端下载**：实施 Token Calculator Phase 5，包括下载源、校验、缓存、版本与失败恢复；移动端 Phase 7 继续独立排期。详见 [分词器资产注册表方案](../../src/tools/token-calculator/docs/Plan/分词器资产注册表方案.md)。
- [ ] **D-P2-04 会话树大图扩展**：仅在 100+ 节点基准证明需要后，再评估显式修订号和可见元素渲染；避免与节点尺寸测量假设冲突。详见 [会话树性能调查](../../src/tools/llm-chat/docs/Plan/tree-graph-performance-investigation.md)。
- [ ] **D-P2-05 Web Distillery 身份卡增强**：确认域名自动推荐是否仍缺失；文件级整体加密属于可选增强，不与已有 cookie value 平台加密重复立项。详见 [身份卡片规划](../../src/tools/web-distillery/docs/Plan/identity-card-feature-plan.md)。
- [ ] **D-P2-06 AI 小说工作台垂直切片**：在 Knowledge/Recall 门禁稳定后，再验证“项目、正文、事实状态、证据可追溯、可回退修改”的最小闭环，不直接建设完整产品。详见 [AI 小说模块调查](./ai-novel-studio-investigation.md)。
- [ ] **D-P2-07 MiniMax Music 工作流验收**：补 provider/模型能力测试、两步翻唱 workflow 单测，以及 URL、本地附件、过期重试、任务中止和真实音频入库验收。详见 [Media Generator 计划索引](../../src/tools/media-generator/docs/Plan/README.md)。

### P3：平台验证与观察项

- [ ] **D-P3-01 壁纸探测跨平台真机验证**：在 macOS、GNOME、KDE 分别核对系统 API、权限拒绝、路径解析和定位行为。详见 [壁纸探测器计划](../../src/tools/wallpaper-detector/docs/Plan/wallpaper-detector-plan.md)。
- [ ] **D-P3-02 Provider 共享运行态观测**：保留真实 Tauri WebView 性能观测；Android/iOS 真机验收属于移动端队列，不阻塞桌面已完成代码。详见 [Provider Adapter 共享调查](./llm-provider-adapter-sharing-investigation.md)。

## 3. 依赖关系

| 上游                              | 下游                   | 原因                                                                               |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| D-P1-01 模型元数据 v3             | D-P1-02 原生工具调用   | 原生工具能力不能继续只依赖单个 `tools: true`，需要稳定的模型能力与 API family 来源 |
| D-P0-01 Knowledge、D-P0-02 Recall | D-P2-06 小说垂直切片   | 小说工作台依赖稳定检索、来源追踪、迁移与恢复能力                                   |
| D-P2-02 富文本基准                | D-P2-04 会话树大图扩展 | 两项都会影响 Chat 性能判断，应先用可重复数据区分渲染器和树图成本                   |
| D-P1-04 后台会话服务              | 多窗口 UI / SubAgent   | 先稳定 session 级执行与生命周期，再增加多个 UI 消费方                              |

## 4. 跨模块计划台账

| 文档                                                                          | 当前状态 | 下一动作                            |
| ----------------------------------------------------------------------------- | -------- | ----------------------------------- |
| [LLM 渠道配置导入](./llm-channel-config-import-plan.md)                       | 已完成   | 仅保留实施记录                      |
| [LLM 渠道探测改进](./llm-channel-probe-improvement-plan.md)                   | 已完成   | 运行态健康能力另行立项              |
| [Provider Adapter 多端共享](./llm-provider-adapter-sharing-investigation.md)  | 待收口   | 真实 Tauri 性能观测；移动端真机另排 |
| [模型元数据系统优化](./model-metadata-system-optimization-plan.md)            | 待实施   | D-P1-01，从批次 1 开始              |
| [原生工具调用与编排](./native-tool-calling-adapter-and-orchestration-plan.md) | 待实施   | D-P1-02，先关闭设计决策             |
| [AI 小说专精模块调查](./ai-novel-studio-investigation.md)                     | 候选     | D-P2-06，做垂直切片验证             |

## 5. 工具模块计划台账

| 模块                          | 状态   | 权威入口或下一动作                                                                                                     |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `agent-manager`               | 待收口 | 已随 `v0.6.6-r.1` 发布；执行 D-P0-03，清理活动写入与搜索旧路径并补迁移级测试                                           |
| `user-profile-manager`        | 待收口 | 已随 `v0.6.6-r.1` 发布；执行 D-P0-03，对齐实际多档案迁移语义并补恢复、幂等与首载测试                                   |
| `knowledge-base`、`retrieval` | 待收口 | [Knowledge 计划索引](../../src/tools/knowledge-base/docs/Plan/README.md)，执行 D-P0-01                                 |
| `recall`                      | 待收口 | [Recall 检索管线计划](../../src/tools/recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)，执行 D-P0-02 |
| `llm-chat`                    | 活动   | [LLM Chat 计划索引](../../src/tools/llm-chat/docs/Plan/README.md)，按 D-P1-03、D-P1-04、D-P2-04 排序                   |
| `rich-text-renderer`          | 按需   | 先实施 D-P2-02 基准；思考标签修复已完成                                                                                |
| `token-calculator`            | 待实施 | D-P2-03，仅剩桌面远端下载活动阶段                                                                                      |
| `translator`                  | 待实施 | D-P2-01，从可靠纯文本批量开始                                                                                          |
| `wallpaper-detector`          | 待收口 | D-P3-01，仅剩非 Windows 真机验证                                                                                       |
| `web-distillery`              | 按需   | D-P2-05，先复核旧计划与现代码差异                                                                                      |
| `embedding-playground`        | 待收口 | 主体重构已实施；补核心交互、阈值校准和检索模拟的行为验收                                                               |
| `media-generator`             | 待收口 | [Media Generator 计划索引](../../src/tools/media-generator/docs/Plan/README.md)，主体代码已实施，执行 D-P2-07          |
| `dir-search`                  | 待实施 | 执行 D-P0-04，增加组合资源预算、按请求取消、超时传播、并发隔离和真实 Tauri 资源验收                                    |
| `tool-calling`                | 已完成 | 核心解耦计划已完成；新原生协议工作统一进入 D-P1-02                                                                     |
| `transcription`               | 待收口 | 本地 OCR 引擎接入已实施；补 OCR/VLM 分流测试和真实 Tauri 运行态验收                                                    |

以下 31 个已注册桌面工具当前没有活动计划：

`aio-file-operator`、`api-tester`、`asset-manager`、`code-formatter`、`color-picker`、`component-tester`、`config-converter`、`content-deduplicator`、`danmaku-player`、`data-filter`、`directory-janitor`、`directory-tree`、`ffmpeg-tools`、`git-analyzer`、`git-committer`、`json-formatter`、`llm-inspector`、`media-info-reader`、`realtime-subtitle-ocr`、`regex-applier`、`service-monitor`、`sketch-pad`、`skill-manager`、`smart-ocr`、`st-worldbook-manager`、`symlink-mover`、`system-pulse`、`text-diff`、`vcp-connector`、`web-canvas`、`window-automator`。

## 6. 完成一次任务后的回写顺序

1. 先更新模块施工清单中的勾选项、验证命令和偏差。
2. 再更新本文对应 `D-*` 项和模块台账状态。
3. 主体已完成但仍有平台验证时，改为“待收口”，不要继续写“实施中”。
4. 全部验收通过后改为“已完成”；历史计划继续留在原位置，只有被明确替代的文档才进入模块 `Archived/`。
