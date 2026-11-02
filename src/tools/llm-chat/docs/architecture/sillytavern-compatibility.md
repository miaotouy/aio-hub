# SillyTavern 兼容性 (SillyTavern Compatibility)

为了利用社区丰富的角色资源，系统实现了对部分 SillyTavern 格式配置的导入兼容。

## 1. 角色卡导入

支持解析 V2/V3 格式的角色卡（.json/.png），自动映射字段：

- `description`, `personality`, `scenario`, `first_mes` → 预设消息
- `depth_prompt` → 深度注入消息
- `avatar` → 智能体图标

## 2. 预设文件导入 (`prompt_order` → `injectionStrategy`)

解析器位于 [`services/sillyTavernParser.ts`](../../services/sillyTavernParser.ts)，入口为 [`parsePromptFile()`](../../services/sillyTavernParser.ts:338) + 类型守卫 [`isPromptFile()`](../../services/sillyTavernParser.ts:483)。

### 2.1 支持格式

当前实现只解析 **JSON 对象**（要求同时存在 `prompts: SillyTavernPrompt[]` 与 `prompt_order: PromptOrderItem[]` 两个数组字段），**不直接支持 YAML**——若用户传入 YAML 需在上游手动转换。

### 2.2 `prompt_order` 切分策略

以 `identifier === "chatHistory"` 为分界线 → `preHistoryOrder` 写入 `systemPrompts`、`postHistoryOrder` 写入 `injectionPrompts`；未出现在任何 `prompt_order` 项中的 `prompts` 被收集到 `unorderedPrompts` 并**默认禁用**（`isEnabled: false`），供用户在导入对话框中按需勾选。

### 2.3 位置到 `InjectionStrategy` 的映射表

由 `convertInjectionStrategy()` 实现。2026-10-29 对照 SillyTavern release 分支 `public/scripts/PromptManager.js`：`RELATIVE = 0`、`ABSOLUTE = 1`，默认深度为 `4`、默认顺序为 `100`。前置、后置和未排序消息共用转换规则。

| PromptManager 字段 | 映射结果 |
| --- | --- |
| `injection_position: 0` 或缺省 | 按 `prompt_order` 排列，忽略残留的深度字段 |
| `injection_position: 1` | `{ type: "depth", depth: injection_depth ?? 4, order: injection_order ?? 100 }`，保留深度 `0` 和顺序 `0` |
| 其它编号，包括 `2`、`4` | 按列表顺序导入并记录未知位置警告 |

旧代码的 `2` / `4` 分支缺少 PromptManager 格式依据。另一套世界书枚举 `world_info_position` 中 `2` 为 ANTop、`4` 为 atDepth，和预设位置字段分别解释。已保存的 AIO Hub 预设沿用其策略；本次变更应用于后续导入。生成类型触发条件 `injection_trigger` 另行处理。

### 2.4 字段降级与跳过策略

- **`marker: true` 节点全部跳过**：ST 用于标识 `chatHistory` / `worldInfoBefore` / `worldInfoAfter` / `personaDescription` / `charDescription` 等占位锚点的虚拟 prompt 不映射为消息（其中 `chatHistory` 已作为分界标识被消费）。
- **空内容跳过**：`prompt.content?.trim()` 为空的节点直接忽略。
- **`prompt_order` 缺失时的回退**：未提供 `characterId` 时优先取 `prompt_order` 数组**最后一条**作为生效配置（"通常是当前激活的"），完全没有 `prompt_order` 时 `parsePromptFile` 返回全空结果并记录 `warn` 日志。
- **角色 (`role`) 缺省 → `"system"`**；`enabled: false` 的项被映射为 `isEnabled: false`，保留结构但默认关闭。

### 2.5 额外提取

从根对象 `pick` 出 `temperature` / `top_p` / `top_k` / `top_a` / `min_p` / `repetition_penalty` / `presence_penalty` / `frequency_penalty` / `max_tokens` 作为模型参数返回，便于一并写入新 Agent 的 `parameters`。

### 2.6 `stPromptName` 元数据关联（导入溯源）

所有由 ST 解析产生的预设消息节点都会通过 [`createPresetMessage()`](../../services/sillyTavernParser.ts:538) 在 `metadata.stPromptName` 写入对应 prompt 的 `name`，用于：

1. **UI 展示**：[`STPresetImportDialog.vue`](../../../agent-manager/components/assets/STPresetImportDialog.vue:141) 在导入预览中显示原始 ST 名称作为副标题；
2. **角色卡 → Agent 迁移识别**：[`agentMigrationService`](../../../agent-manager/services/agentMigrationService.ts:220) 把 `stPromptName === "First Message"` 或匹配 `^Alternate Greeting\b` 的预设消息识别并迁移为独立的 `greetings` 列表，避免它们污染上下文装配链。
