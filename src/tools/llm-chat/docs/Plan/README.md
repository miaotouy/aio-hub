# LLM Chat 计划文档索引

> 最近盘点：2026-10-29
>
> 桌面端总优先级与跨模块依赖见 [桌面端计划总览](../../../../../docs/Plan/README.md)。

## 当前施工入口

| 顺序 | 文档                                                            | 状态       | 当前动作                                                                    |
| ---- | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 1    | [上下文管道扩展测试](./pipeline-extension-test-plan.md)         | 待收口     | 示例插件和宿主接线已存在，完成真实 Tauri 启停、设置、持久化、改写与日志验收 |
| 2    | [多会话状态与未来规划](./multi-session-status.md)               | 扩展待实施 | Phase 1–4 核心重构已落地；先做后台会话执行服务，再排多窗口 UI               |
| 3    | [会话树性能优化调查](./tree-graph-performance-investigation.md) | 按需       | 阶段一、二已完成；阶段三必须由 100+ 节点性能基线触发                        |

多会话计划不是整体待实施：Phase 1–4 核心重构已经落地，待实施项仅指后台会话服务与后续多窗口 UI。上下文管道扩展示例插件和宿主接线已存在，剩余为真实 Tauri 运行态验收。

## 功能调查

- [动态消息注入锚点待办](./dynamic-message-injection-anchors-todo.md)：2026-10-29 待实施；补齐最后一条用户消息、AI 消息及任意消息的前后注入，同步桌面与移动端，并修正酒馆预设的位置、深度与顺序转换。

- [上下文变化诊断与缓存用量分析](./context-change-cache-analysis-investigation.md)：2026-10-29 待实施，已完成既有样例离线验证；复用传输观察接口采集逐次实发投影，修正 Usage 口径，按消息与内容块定位变化，并以条数和字节预算约束会话快照。

- [缓存友好型上下文组装优化（动静分离）](./context-cache-auto-optimization-investigation.md)：2026-10-29 候选设计，已完成既有样例离线验证；通过可选模式拆分工具说明与动态环境、调整 Recall 自动块，明确尾部注入生命周期、角色边界与时间宏对齐范围，收益由实发诊断确认。

## 性能调查

- [消息变动与滚动位置调查](./message-scroll-investigation.md)：2026-10-28 对照日用构建与近期提交；已修复代码区内部滚轮误恢复底部跟随，隔离 WebView2 验证新增消息保持阅读位置；导航器按显式交互保留现状。

- [对话消息处理与显示管线性能调查](./message-pipeline-performance-investigation.md)：2026-10-28 完成五项修复：同步生命周期、折叠思考、流式增量与检查点、工具结果分层显示和长消息恢复；相关回归与隔离 WebView2 验证通过，提供可复用原生回放入口。全会话保存保留为后续采样项。

## 待验收方案

- [Chat 输入区上方功能面板插槽](./input-composer-panel-slot-plan.md)：六组持续操作面板已统一接入，提供同位置替换、折叠、关闭和焦点处理；类型检查、生产构建及相关测试通过，界面与分离窗口交互由主人验收。

## 近期实施记录

- [Chat 输入工具栏自定义收纳](./input-toolbar-customization-research.md)：2026-10-11 已实施并完成验证；涵盖常驻/菜单配置、排序、快捷操作展示、窄窗口溢出和分离窗口同步。

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
