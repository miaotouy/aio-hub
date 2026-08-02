# LLM Chat 计划文档索引

> 最近盘点：2026-07-29
>
> 桌面端总优先级与跨模块依赖见 [桌面端计划总览](../../../../../docs/Plan/README.md)。

## 当前施工入口

| 顺序 | 文档                                                                              | 状态       | 当前动作                                                                    |
| ---- | --------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 1    | [会话持久化损坏与启动阻塞调查](./session-persistence-corruption-investigation.md) | 待收口     | Phase 0–2 已实施；补真实进程中止、Windows 文件占用和多 WebView 竞争验收     |
| 2    | [Agent 配置解耦与智能体大厅](./agent-decoupling-plan.md)                          | 待收口     | 已发布；活动路径已统一，补部分迁移恢复、递归校验、重复启动和真实升级测试    |
| 3    | [User Profile 配置解耦](./user-profile-decoupling-plan.md)                        | 待收口     | 已发布；按实际多档案结构补部分迁移恢复、首载设置一致性和真实升级证据        |
| 4    | [上下文管道扩展测试](./pipeline-extension-test-plan.md)                           | 待收口     | 示例插件和宿主接线已存在，完成真实 Tauri 启停、设置、持久化、改写与日志验收 |
| 5    | [多会话状态与未来规划](./multi-session-status.md)                                 | 扩展待实施 | Phase 1–4 核心重构已落地；先做后台会话执行服务，再排多窗口 UI               |
| 6    | [会话树性能优化调查](./tree-graph-performance-investigation.md)                   | 按需       | 阶段一、二已完成；阶段三必须由 100+ 节点性能基线触发                        |

Agent 与 User Profile 已分别存在 `src/tools/agent-manager/`、`src/tools/user-profile-manager/`，并随 `v0.6.6-r.1` 发布。两份早期 RFC 中的“待创建”描述已失效；后续以现有目录、存储实现和迁移代码为基线，不重新执行文档中的历史 `git mv` 指令。发布事实仅表示功能进入过发布包，不替代当前代码路径审计和迁移验收。

会话持久化计划的 Phase 0–2 已完成单写者协调、Rust 原子提交、索引备份恢复、坏文件隔离和非阻塞重建；当前不是重新施工这些能力，而是补依赖真实进程退出、Windows 文件占用和多 WebView 竞争的专项验收。多会话计划同样不是整体待实施：Phase 1–4 核心重构已经落地，待实施项仅指后台会话服务与后续多窗口 UI。

## 已完成记录

- [Chat 思考参数与 Gemini 摘要适配](./chat-thinking-parameter-adapter-fix.md)：2026-07-16 已实施并完成定向测试、类型检查与 Vite 构建。

## 相关跨模块计划

- [Agent 模型参数适配规则草案](../../../agent-manager/docs/Plan/agent-model-parameter-rules-draft.md)：记录随角色分享的模型匹配参数规则、侧边栏与临时模型接入构想；全局规则暂缓。
- [模型元数据系统优化](../../../../../docs/Plan/model-metadata-system-optimization-plan.md)：提供模型能力、API family 与物化边界。
- [原生工具调用适配与编排](../../../../../docs/Plan/native-tool-calling-adapter-and-orchestration-plan.md)：统一 Tool IR、格式解析、审批、执行和续轮。
- [Knowledge 计划索引](../../../knowledge-base/docs/Plan/README.md)：Chat 显式引用、主动工具和研究任务的现行契约。
- [Recall 检索管线计划](../../../recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)：Chat 注入与 Agent 检索的迁移发布门禁。

## 维护规则

- 本文件是 `llm-chat` 计划入口；详细完成状态仍写回对应计划。
- 已完成计划移入“已完成记录”，不要继续与活动计划并列。
- 新增 Chat 计划时写清状态、最近更新、影响范围、验收命令和真实 Tauri 边界。
