# AIO Hub 调查问题汇总与核验清单

> 状态：已完成静态复核；按「当前缺陷 / 安全设计风险 / 产品能力缺口 / 运行态验收缺口」分流，避免把未运行的场景误报为代码缺陷。
>
> 汇总日期：2026-08-21
>
> 当前代码基线：`9bb22ed727d0fb9af82684ebca97210edd2c0bda`（`dev`）
>
> 调查来源：`G:\BaiduSyncdisk\git\项目调查笔记` 中的 16 篇 AIO-Hub 类目笔记及其总览；早期安全/可靠性问题的历史核验见 [调查笔记已知问题核验清单](./known-issues-verification-checklist.md)。

## 1. 使用方式与状态口径

本清单只收录能定位到调查笔记或当前代码的事项。每项均说明它是事实缺陷、风险、能力边界还是测试空白；「未找到」不自动等于项目缺陷。

| 状态               | 含义                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `已确认，未修复`   | 当前代码存在可直接定位的实现或配置问题。                               |
| `已确认，设计风险` | 当前实现确实具备该边界；是否造成实际事故还取决于数据、权限或并发场景。 |
| `能力缺口`         | 当前产品不提供该能力；是否立项取决于产品决策，不按 defect 处理。       |
| `文档失真`         | 文档与当前代码不一致，可能误导使用者或后续开发。                       |
| `待运行态验收`     | 静态代码无法证明真实 Tauri、外部服务、设备或多窗口行为。               |
| `已关闭`           | 早期问题已有修复提交进入当前代码基线；仅保留回归或运行态验收。         |

优先级按潜在安全性、数据/资源影响、功能不可用范围和可恢复性排列；它不是自动发布阻断结论。

## 2. 当前需跟踪的总表

| ID        | 分类           | 事项                                                                                                                         | 当前结论           | 优先级 | 关闭条件                                                                                          |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| AIO-I-001 | 性能与可扩展性 | 跨会话搜索每次枚举并读取全部会话文件                                                                                         | `已确认，未修复`   | P1     | 完成持久化索引设计、实现迁移/重建/短查询策略，并以同量级语料证明尾部命中与无命中不再全量读取。    |
| AIO-I-002 | 功能与资源控制 | 媒体生成器的「最大并发任务数」和「自动清理已完成任务」只有设置定义，没有运行时消费者                                         | `已关闭`           | P1     | 已实现全局并发队列、完成任务延迟清理、设置联动、重启恢复和取消；保留真实 Provider 计费/取消验收。 |
| AIO-I-003 | 凭据安全       | LLM Profile 连同 API Key / 自定义请求头以普通 JSON 配置保存                                                                  | `已确认，设计风险` | P1     | 明确受支持平台的凭据保护策略、迁移与降级语义；至少验证本机 ACL/备份/导出边界。                    |
| AIO-I-004 | 功能契约       | content-deduplicator 暴露 fuzzy、`minSimilarity` 等配置，但扫描结果只有精确/规范化哈希匹配                                   | `已确认，未修复`   | P2     | 实现模糊匹配并测试阈值语义，或从类型、预设和 UI 移除/禁用该承诺。                                 |
| AIO-I-005 | Agent 接口设计 | regex-applier 尚未确定需要向 Agent 暴露的任务场景；现有格式化辅助方法未注册为 Agent 方法                                     | `待产品设计`       | P3     | 先决定是否需要 Agent 编写/维护规则或执行受控批处理；仅在确认场景后定义契约、注册方法并补回归。    |
| AIO-I-006 | 对话可移植性   | 单会话支持版本化备份 JSON 和历史 Raw JSON 导入；Markdown / 阅读型 JSON 仍为只读导出格式                                      | `已关闭`           | P3     | 回归验证版本化备份、Raw JSON、ZIP 备份、冲突策略与无效会话图拒绝行为。                            |
| AIO-I-007 | 文档准确性     | media-generator 架构文档仍称 `generateMedia(prompt, type)` 已声明但未实现；当前运行时实际已改为按可见模型动态构建 Agent 方法 | `文档失真`         | P3     | 更新架构文档和 Agent 接入说明，使其与 `buildAgentMethods()` / `getMetadata()` 的当前机制一致。    |
| AIO-I-008 | 文档准确性     | content-deduplicator 架构文档仍称自定义忽略规则未生效，但当前 Rust walker 已把 `OverrideBuilder` 产物绑定到 `WalkBuilder`    | `文档失真`         | P3     | 更正文档，并增加忽略规则正反例测试，避免以后再次回退。                                            |

## 3. 核验详情

### AIO-I-001：跨会话搜索缺少持久化索引

**结论：已确认，未修复。**

Rust 搜索实现仍通过 `WalkDir` 枚举 Agent 和会话 JSON，并对每个候选执行 `tokio::fs::read_to_string`；当前 `src-tauri/Cargo.toml` 虽已有 bundled `rusqlite`，搜索命令尚未使用 FTS 或其他持久化索引。对应位置为 `src-tauri/src/commands/llmchat_search.rs:485-512` 与 `:647-676`。

历史核验已经在约 2,150 会话、约 150 MiB 的隔离语料上确认：尾部单命中和无命中都需要约 4.6 秒并读取所有文件；SQLite FTS5 trigram 是首选候选，但 1--2 字符检索、写入/删除/导入同步、损坏重建和端到端 WebView 渲染仍未收口。完整基准和候选比较保留在 [既有 KI-008](./known-issues-verification-checklist.md#ki-008跨会话搜索缺少索引)。

**核验后动作：** 将原 KI-008 作为本条唯一实施入口，避免重复建立搜索索引计划。

### AIO-I-002：媒体任务控制设置未进入运行时

**结论：已关闭（代码已实现，真实 Provider 场景待验收）。**

`MediaGeneratorSettings` 的 `maxConcurrentTasks` 与 `autoCleanCompleted` 现在通过 `mediaGenStore` 的设置 watcher 同步到全局任务运行时。`useMediaGenerationManager.executeGeneration()` 不再直接启动请求，而是进入模块级队列；只有获得并发槽位后才创建 `AbortController` 和发送远程请求，因此工作区、任务列表和重试共用同一上限。设置变化会唤醒队列，最大值仍按设置页的 1--10 范围归一化。

任务完成后，任务池在 `autoCleanCompleted` 开启时按固定的 5 分钟生命周期延迟移除；关闭设置会取消待执行的清理计时器。应用重启时，持久化任务中遗留的 `pending` / `processing` 会明确恢复为 `error`，并写入“应用重启，生成中断/排队任务未恢复”，避免出现永久占用任务槽位的假运行状态。取消操作同时覆盖排队任务和已启动任务，前者不会发送请求，后者通过 `AbortController` 进入 `cancelled`。

**核验范围：** 静态代码已覆盖设置联动、并发调度、自动清理、重启恢复和取消分支；仍需在真实 Provider 下确认远程请求数量、计费取消语义、窗口关闭和强退时序。

### AIO-I-003：LLM 凭据以普通配置对象持久化

**结论：已确认，设计风险。**

`useLlmProfiles` 将带有 `apiKeys` 的完整 Profile 交给通用配置管理器保存到 `llm-service/profiles.json`：`src/composables/useLlmProfiles.ts:46-51, 62-93, 162-200`。通用 `ConfigManager` 对 JSON 配置直接 `JSON.stringify` 后写文件（`src/utils/configManager.ts:322-345`）；当前链路没有把 Profile API Key 转交到平台密钥库的代码。渠道导出对包含密钥采用默认关闭和显式警告，这是额外的人工保护，不能改变本地 Profile 文件本身的存储方式（`src/views/Settings/llm-service/components/LlmProfileExportDialog.vue:156-203`）。

这不等于任意其他账户一定能读取该文件：真实用户目录 ACL、系统备份、同步盘、崩溃转储和受支持平台范围均未在本轮实测。因此本条标为设计风险，而非已证实的信息泄露事故。

**核验后动作：** 在安全设计中决定「只依赖操作系统用户边界」还是「接入系统凭据库」；无论哪种，都需要记录备份/迁移/导出处理和不可用时的明确降级行为。

### AIO-I-004：content-deduplicator 的 fuzzy 契约未实现

**结论：已确认，未修复。**

前端类型和预设继续暴露 `matchType: "fuzzy"`、`minSimilarity` 等字段（`src/tools/content-deduplicator/types.ts`、`config/presets.ts`）。Rust 扫描逻辑按原文/规范化哈希聚组，构造结果时 `similarity` 恒为 `1.0`，`match_type` 只能是 `exact` 或 `normalized`，`diff_summary` 固定为 `None`（`src-tauri/src/commands/content_deduplicator.rs:745-790, 859-885`）。

这会使 UI、预设或 API 使用者误以为阈值影响扫描结果。若只提供哈希去重，应让参数和展示与实际能力对齐；若需要近似查重，则需要单独设计候选召回、阈值、误报处理与大文件资源边界。

### AIO-I-005：regex-applier 的 Agent 接口尚未完成场景定义

**结论：待产品设计，非已确认 defect 或能力缺口。**

`RegexApplierService` 已提供 `getFormattedTextResult()` 与 `getFormattedFileResult()`（`src/tools/regex-applier/regex-applier.registry.ts:223-260`），但同一个服务的 `getMetadata()` 返回的 `methods` 是空数组，并留有「待重新设计 agent 专用接口」注释（`:268-274`）。这只能证明这些内部/界面辅助格式化方法尚未被注册进 Agent 工具目录；不能据此推导 Agent 理应直接调用它们，或产品已经承诺相应能力。

是否需要接口，应先从 Agent 任务而不是人工工作台流程出发决定。例如，Agent 可以协助生成、解释、校验和维护正则规则；而对确定的批量替换，Agent 通常也可以自行编写并执行受控脚本，不一定需要复用面向人工 UI 的快捷方法。若后续确认要让 Agent 对文本或文件执行替换，还需单独定义作用域、预览/确认、文件权限、回滚、批量资源限制，以及稳定的参数和返回契约。

本条暂不按「实现存在、Agent 不可用」立项，也不预设必须暴露现有格式化方法；保留为 Agent 使用场景与接口设计的决策输入。

### AIO-I-006：结构化单会话导出不可往返

**结论：已关闭。**

桌面端批量管理会话的导入入口现在同时接受 ZIP 批量备份和单会话 `.json`。`sessionImportExportService` 定义了版本化 `aiohub-chat-session` 备份（schema `1.0.0`），导出完整 `index + detail`、完整消息树、根节点和活动叶节点；同一解析入口继续兼容历史 Raw JSON（`{ index, detail }`）与 ZIP 备份。导入前会拒绝缺少会话 ID、节点表、根节点、活动叶节点，或根/活动节点未出现在节点表中的文件，并继续使用 `keep / overwrite / skip` 冲突策略。

Markdown 和面向阅读的普通 JSON 仍为只读导出格式，不作为导入契约，因为它们不能可靠恢复完整的会话树。导入仅恢复会话数据并保留附件、智能体和模型等既有引用 ID；不会导入、执行、创建或重绑定 Agent、Profile、Provider 配置。

### AIO-I-007：media-generator 的 Agent 文档已过时

**结论：文档失真。**

`src/tools/media-generator/ARCHITECTURE.md:420` 仍表示 `generateMedia(prompt, type)` 只是废弃系统留下的未实现占位。当前 registry 已在 `getMetadata()` 中调用 `buildAgentMethods(visibleModels)` 并绑定相应 handler（`src/tools/media-generator/media-generator.registry.ts:217-221`）；该工厂会为可见模型创建 `generate_<model>` 方法（`src/tools/media-generator/services/buildAgentMethods.ts:766-813`）。

应删除或显著限定旧方法的描述，避免读者把「固定泛化入口不存在」误解成「Agent 无法触发媒体生成」。

### AIO-I-008：content-deduplicator 文档中的忽略规则结论已过时

**结论：文档失真。**

`src/tools/content-deduplicator/ARCHITECTURE.md:193-195` 仍称 `OverrideBuilder` 未绑定到 `WalkBuilder`，自定义 `ignorePatterns` 无效。当前 `collect_files()` 已构建 override，并通过 `builder.overrides(overrides)` 应用到 walker（`src-tauri/src/commands/content_deduplicator.rs:277-310`）。

本条不再作为功能缺陷立项。需要更新文档，并以有效模式、无效模式、目录/文件匹配各至少一例覆盖当前行为。

## 4. 已关闭的早期问题与剩余验收

下列问题均已有修复提交进入当前基线；`git merge-base --is-ancestor <commit> HEAD` 已确认相关提交均为当前 `HEAD` 的祖先。不要按修复前描述重复立项：

| 历史 ID | 事项                                                  | 当前状态                      | 已进入基线的修复提交 | 仍需保留的验证                                       |
| ------- | ----------------------------------------------------- | ----------------------------- | -------------------- | ---------------------------------------------------- |
| KI-001  | VCP `internal_request_file` 绕过文件安全策略和审批    | 已关闭，待真实 VCP/Tauri 验收 | `5e768a94e`          | 外部节点对路径、规则、大小、审批与断线的端到端验证。 |
| KI-002  | data-filter 通过 `new Function` 执行 Agent 自定义条件 | 已关闭                        | `1910c2e0f`          | 保留安全回归测试。                                   |
| KI-003  | Agent 可修改自身审批配置                              | 已关闭                        | `f5e834e3c`          | 受信任 UI 独立确认与审计的运行态回归。               |
| KI-004  | 启动时不修复残留 `generating` 节点                    | 已关闭，待真实数据根验收      | `5b5c55207`          | 强退/损坏数据/多会话恢复。                           |
| KI-005  | 所有 API Key 不可用时回退首 Key                       | 已关闭                        | `54b528984`          | 非标准 Provider 错误分类仍需观察。                   |
| KI-006  | 工具审批等待和生命周期清理                            | 已关闭                        | `f5d26d36a`          | 断线、窗口关闭、取消和显式协议超时。                 |
| KI-007  | 未闭合 VCP 请求块停止后续扫描 / 合并后续块            | 已关闭，待真实模型输出验收    | `143b8e76e`          | 流式坏块恢复的视觉和协议兼容性。                     |

Azure Adapter 缺失、VCP Bridge 不能方法级禁用以及「参数错误会累计熔断」也已经在先前清单中标记为过时或部分修复，不应再次计入未修复问题。

## 5. 不应直接立项为 defect 的能力边界

以下来自调查笔记，当前只作为产品决策或专项设计输入：

- 移动端、插件安装/分发链路尚未统一调查或真机验证；它们是覆盖范围不足，不是已证实故障。
- VCP 多节点断线竞争、审批超时和并发，以及媒体生成、网页蒸馏、AI Git 信息等依赖真实外部服务的端到端行为，仍缺少统一黑盒验证。
- web-canvas 的审批候选层不跨重启恢复、并发写入没有 revision/CRDT/冲突合并、预览 CSP 不是断网沙箱。这些是已声明的架构取舍；若要改变，需要独立威胁模型和协作语义设计。
- 结构化 Prompt Cache、插件注册自定义消息渲染器、媒体生成后台定时触发、翻译术语表和批量文件翻译在调查范围内未发现已实现主链。是否补齐应进入相应产品/工具计划，而非按回归缺陷排期。

## 6. 运行态验收队列

静态检查无法关闭以下风险；它们应在具备凭据、外部节点或真机条件时分别记录可复现结果：

1. **桌面 Tauri / WebView：** 会话搜索结果首批渲染、排序与取消；多窗口同步、恢复和窗口关闭；消息渲染器的键盘/无障碍/视觉表现。
2. **外部模型与渠道：** Azure、代理/TLS/HTTP 选项、非标准 Provider 错误分类、全部 Key 不可用、媒体生成计费失败与取消。
3. **VCP：** 文件传输安全规则、方法级禁用、审批等待、断线清理、坏请求块恢复和多节点并发。
4. **数据恢复：** 会话原子写在强退、损坏、双实例及导入冲突下的恢复；媒体任务/资产恢复。
5. **平台范围：** 移动端文件权限、配置保存、模型探测、导入导出和真实设备网络行为。

## 7. 本轮代码改动与验证

本轮已实现 AIO-I-002 的运行时闭环：全局并发队列、设置联动、完成任务延迟清理、重启状态恢复和排队/运行中取消。已执行 `bun run build:tsc`、相关文件 Prettier 检查和 `git diff --check`；真实 Provider 的计费、远程取消和强退恢复仍属于第 6 节运行态验收队列。
