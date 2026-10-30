# 动态消息注入锚点实施记录

> 日期：2026-10-29
> 状态：实现完成，相关回归与桌面真实窗口走查通过；移动端原生界面待走查。
> 范围：桌面端与移动端的预设注入、锚点配置，以及关联的酒馆预设导入兼容。

## 已完成

- [x] 锚点定义增加 `kind: placeholder | dynamic_message`，保留插件省略类别时的占位语义。
- [x] 增加最后一条 User、Assistant、任意历史消息三个动态目标，支持之前 / 之后和顺序权重。
- [x] 桌面与移动共用 `@aiohub/agent-preset-core` 中的历史边界计算；两端配置入口已接入。
- [x] 动态定位只查找有效 `session_history`；待发送预览输入按相同来源参与匹配。预设和其他注入保持独立。
- [x] 深度与动态注入统一基于插入前历史计算边界；同边界按权重升序、预设原顺序排列，多个深度点互不影响。
- [x] 目标缺失跳过并记录原因；诊断包含预设来源、目标与工具区段调整信息。
- [x] 保留 `_historyRole`，工具结果转为 User 后仍按 Tool 定位；保护调用与连续结果区段。
- [x] 动态目标只作为定位选项；预设编辑器自动补卡与占位卡识别继续限制为占位锚点。
- [x] 沿用现有宏、来源、附件和组合消息处理；同步组装器、类型、架构与酒馆兼容文档。
- [x] 基于新结构复测相邻两个 cache 方案并写回结果。

## 动态目标与定位规则

| 目标 | ID | 相对位置 |
| --- | --- | --- |
| 最后一条用户消息 | `last_user` | 之前、之后 |
| 最后一条 AI 消息 | `last_assistant` | 之前、之后 |
| 最后一条消息，包含工具结果 | `last_message` | 之前、之后 |

有效历史由会话加载和前置处理器确定。桌面 `session-loader` 已将待发送预览输入作为历史 User 加入，因此预览和保存后发送节点共用匹配规则。原始 Tool 身份优先于显示角色，转换为 User 的工具结果继续归为工具消息。

工具区段内部的 before 动态注入移到调用之前；after 动态注入和深度注入移到完整结果之后。工具结果为空或并行结果尚未齐全时，尾部注入跳过，原因记为 `tool_results_pending`。缺失动态目标记为 `target_missing`，安全边界调整记为 `tool_chain_relocated`。

组装诊断进入 `context.logs` 和 `sharedData.historyInjectionDiagnostics`。后置 System 头部合并、连续角色合并和渠道顶层指令抽取仍按现有配置执行；配置入口提供说明，最终位置结合上下文预览查看。

稳定规则见[注入组装器](../architecture/context-processors/injection-assembler.md)、[关键类型](../architecture/key-types.md)及[移动端架构](../../../../../mobile/src/tools/llm-chat/ARCHITECTURE.md)。

## 酒馆预设导入修正

2026-10-29 对照 release 分支 `public/scripts/PromptManager.js`：`RELATIVE = 0`、`ABSOLUTE = 1`，默认深度 `4`、顺序 `100`。

- [x] `injection_position = 1` 映射为深度注入，保留深度 `0`；缺省深度取 `4`。
- [x] 读取 `injection_order`，保留 `0`，缺省取 `100`。
- [x] 相对位置或未给位置时按 `prompt_order` 排列，忽略残留的深度字段。
- [x] 前置、后置和未排序消息共用转换规则，前置的 in-chat 消息也执行深度策略。
- [x] 核查旧 `2` / `4` 分支：PromptManager 格式缺少对应定义，按列表顺序导入并记录警告；世界书枚举中的 `2 = ANTop`、`4 = atDepth` 属于另一格式。

已保存的 AIO Hub 策略沿用原值，修正作用于后续导入。`injection_trigger` 继续作为独立需求处理。详见[酒馆兼容说明](../architecture/sillytavern-compatibility.md)。

## 验证与 cache 复测

回归保护动态角色定位、注入互不影响、稳定排序、多深度坐标、目标缺失、工具链完整性、预览/发送一致性、宏与附件来源，以及编辑器自动补卡边界。相关测试分布于共享预设核心、桌面组装器/会话加载器/预设编辑器/酒馆解析器及移动组装器。

验证结果：共享核心 30 项、桌面相关 23 项、移动组装器 7 项、cache 回放 39 项通过；共享核心类型检查、桌面 `build:tsc` 与 `build:vite`、移动端 `build` 均通过。

桌面真实 WebView2 使用隔离开发实例走查：新建智能体仍只自动补用户档案与会话历史卡；消息编辑器列出三个动态目标，可选择最后 User 之前并调整权重。截图与临时记录保存在本机忽略目录；Android/iOS 原生界面尚未走查。

两个 cache 方案使用同一批 8 组、361 个节点重新离线回放：

- 121 对用户轮次，动态块后移后完整消息级追加仍为 0 / 121；收益继续按动态块之前的公共前缀解释。
- 18 个工具候选边界中，17 个完成尾部注入，1 个因并行结果尚未齐全跳过。
- 5 对历史移除、6 对同角色边界扩展保持一致；用量口径与协议投影的原有缺口继续按诊断方案实施。

复测使用真实 `injectionAssembler` 与共享定位逻辑。自动 Recall 内容、User 环境块载体和快照存储仍采用受控实验，服务端读写量等待实发诊断采集。详细结果已回写[缓存友好组装方案](./context-cache-auto-optimization-investigation.md)与[变化诊断方案](./context-change-cache-analysis-investigation.md)。
