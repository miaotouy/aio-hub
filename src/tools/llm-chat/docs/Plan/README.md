# LLM Chat 计划文档索引

> 最近盘点：2026-09-20
>
> 桌面端总优先级与跨模块依赖见 [桌面端计划总览](../../../../../docs/Plan/README.md)。

## 当前施工入口

| 顺序 | 文档                                                                              | 状态       | 当前动作                                                                    |
| ---- | --------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 1    | [上下文管道扩展测试](./pipeline-extension-test-plan.md)                           | 待收口     | 示例插件和宿主接线已存在，完成真实 Tauri 启停、设置、持久化、改写与日志验收 |
| 2    | [多会话状态与未来规划](./multi-session-status.md)                                 | 扩展待实施 | Phase 1–4 核心重构已落地；先做后台会话执行服务，再排多窗口 UI               |
| 3    | [会话树性能优化调查](./tree-graph-performance-investigation.md)                   | 按需       | 阶段一、二已完成；阶段三必须由 100+ 节点性能基线触发                        |

多会话计划不是整体待实施：Phase 1–4 核心重构已经落地，待实施项仅指后台会话服务与后续多窗口 UI。上下文管道扩展示例插件和宿主接线已存在，剩余为真实 Tauri 运行态验收。

## 已完成记录

- **Agent 配置解耦与智能体大厅 / User Profile 配置解耦**：分别落在 `src/tools/agent-manager/`、`src/tools/user-profile-manager/`，已随 `v0.6.6-r.1` 发布，活动路径已统一。后续以现有目录、存储实现和迁移代码为基线，不再执行早期 RFC 中的历史 `git mv` 指令。
- **会话持久化损坏与启动阻塞调查**：Phase 0–2 的单写者协调、Rust 原子提交、索引备份恢复、坏文件隔离和非阻塞重建已落地；真实进程中止、Windows 文件占用和多 WebView 竞争矩阵作为 `0.7.0` 正式版前检查（见[桌面端计划总览](../../../../../docs/Plan/README.md) `D-P0-07`）。

已完成计划的稳定契约已转入对应架构文档（如 Gemini 思考参数 wire 映射见 [LLM API 架构](../../../../../docs/architecture/llm-apis-architecture.md)）。

## 相关跨模块计划

- [Agent 模型参数适配规则草案](../../../agent-manager/docs/Plan/agent-model-parameter-rules-draft.md)：记录随角色分享的模型匹配参数规则、侧边栏与临时模型接入构想；全局规则暂缓。
- [模型元数据系统优化](../../../../../docs/Plan/model-metadata-system-optimization-plan.md)：提供模型能力、API family 与物化边界。
- [原生工具调用适配与编排](../../../../../docs/Plan/native-tool-calling-adapter-and-orchestration-plan.md)：统一 Tool IR、格式解析、审批、执行和续轮。
- [Knowledge 计划索引](../../../knowledge-base/docs/Plan/README.md)：Chat 显式引用、主动工具和研究任务的现行契约。
- [Recall 检索管线计划](../../../recall/docs/Plan/recall-retrieval-pipeline-modularization-plan.md)：Chat 注入与 Agent 检索的迁移正式版前检查。

## 维护规则

- 本文件是 `llm-chat` 计划入口；详细完成状态仍写回对应计划。
- 已完成计划移入“已完成记录”，不要继续与活动计划并列。
- 新增 Chat 计划时写清状态、最近更新、影响范围、验收命令和真实 Tauri 边界。
