# 移动端角色卡与 AIO 导入包运行时对齐计划

> **文档状态**: 批次 1–3 已完成（2026-09-25）；批次 1.7 私有资产落盘、批次 4 正则 render/多源合并、Agent 私有预设/开局附件运行时、`parameters.custom` 透传、世界书高级语义（selective/probability/位置+role）均已完成（2026-09-26）；世界书递归扫描执行已完成（2026-10-02）；本文档记录施工队列与剩余待办；批次 4 其余项与「明确不做」为边界
> **涉及模块**: `mobile/src/tools/agent-manager/`（导入器与 Agent 数据）、`mobile/src/tools/llm-chat/`（世界书、宏、正则、预设装配运行时）
> **关联文档**: [`mobile-agent-manager-plan.md`](./mobile-agent-manager-plan.md)、[`mobile-development-checklist.md`](./mobile-development-checklist.md)、桌面端参照 [`src/tools/agent-manager/`](../../../src/tools/agent-manager/) 与 [`src/tools/llm-chat/`](../../../src/tools/llm-chat/)

## 1. 背景与盘点结论

移动端角色卡导入最初以 SillyTavern（ST）为主，AI 施工报告摘要也主要覆盖 ST 路径。本次盘点确认两件事：

1. **AIO PC 导出包只部分支持**：PC 端四种导出形式（`src/tools/agent-manager/services/agentExportService.ts`）中，移动端只接住了单文件 JSON。
2. **运行器缺口不止导入**：移动端已有一套自研轻量管线，核心对话链路基本可用，但世界书导入链路、ST 正则转换、时间宏、`displayPresetCount` 等直接影响角色卡效果的环节存在明确缺口。

本计划把「导入全格式 + 运行时补齐」整理为可施工批次。批次 1–3 为当前队列；批次 4 与「明确不做」为边界记录。

## 2. 现状支持矩阵（2026-09-25 代码盘点）

### 2.1 导入侧（`mobile/src/tools/agent-manager/composables/useAgentImporter.ts`）

| PC 导出形式 | 移动端现状 | 说明 |
| --- | --- | --- |
| `.agent.json`（`AIO_Agent_Export` JSON） | ✅ | 含批量 `agents[]`；`AgentList.vue` 回退匹配 profile/model、重名加后缀 |
| `.agent.yaml` | ✅ 已补齐 | `js-yaml` 解析后走同一 `parseImportPayload` |
| `.agent.png`（`aiob` tEXt chunk 内嵌 `AIO_Agent_Bundle` ZIP） | ✅ 已补齐 | `fflate.unzipSync` 解包；与 ST `ccv3`/`chara` 并存时 ST 卡优先 |
| `.agent.zip` | ✅ | 解包读取全部 `*.agent.json` / `*.agent.yaml`；包内头像、`assets/`、`worldbooks/` 已提取并落盘（2026-09-26），仅对真正未消费资源 warnings |
| 目录包（folder） | ❌ 不做 | 移动端无目录选择语义 |
| ST JSON / PNG（V2 `chara`、V3 `ccv3`） | ✅ | — |

### 2.2 运行时（`mobile/src/tools/llm-chat/`）

| 能力 | 现状 | 关键证据 | 桌面端参照 |
| --- | --- | --- | --- |
| 预设注入 depth / advanced_depth / anchor / order | ✅ | `core/pipeline/processors/injection-assembler.ts:50-188` | 实现等价 |
| modelMatch、消息组启用 | ✅ | `utils/modelMatch.ts:32-77`、`injection-assembler.ts:37-41` | 实现等价 |
| 宏 `{{char}}/{{user}}/{{persona}}` + 会话变量 | ✅ | `core/pipeline/processors/macros-renderer.ts:228-293` | 实现等价 |
| 时间宏 `{{time}}` 等 | ✅ 已补齐 | `macros-renderer.ts`（含 `virtualTimeConfig` 虚拟时间） | `src/tools/llm-chat/macro-engine/macros/datetime.ts:747-760` |
| 工具宏 `{{tools}}` 等 | ❌ 不做 | — | `src/tools/llm-chat/macro-engine/macros/tools.ts` |
| 正则 request 阶段（发送前） | ✅ | `core/pipeline/processors/regex-processor.ts`、`utils/chatRegex.ts` | 实现等价 |
| 正则 render 阶段（显示前） | ✅ 已补齐 | `components/MessageContent.vue`（`displayedContent`）、`ChatMessage.vue`（Message-Bound 解析）、`utils/chatRegex.ts` | 语义对齐 `src/.../components/message/MessageContent.vue` |
| 正则配置源 | 🟡 agent 级已合并，全局/档案级无载体 | `ChatMessage.vue`（`mergeRegexConfigs(全局源, Agent 源)`）、`regex-processor.ts` | 桌面为 Global/Agent/User 三源；移动端全局/档案源恒空，见批次 4 |
| ST regex_scripts 导入转换 | ✅ 已补齐 | 导入器转换为 `regexConfig.presets`，`markdownOnly→render`、`promptOnly→request` | `src/.../services/sillyTavernParser.ts:307-343` |
| 多开场白 + `defaultGreetingId` | ✅ | `services/greetingService.ts:51-99`、`stores/llmChatStore.ts:128-140` | 实现等价（桌面另有 live greeting 生命周期） |
| `displayPresetCount` | ✅ 已补齐 | `injection-assembler.ts`（先过滤后截断，无历史锚点时不生效） | `src/.../utils/chatPathUtils.ts:61-125` |
| LlmParameters 标准字段 + contextManagement | ✅ | `composables/useChatExecutor.ts:306-319`、`token-limiter.ts:124-131` | 实现等价 |
| `parameters.custom` 透传 | ✅ 已补齐 | `useChatExecutor.ts:306-329` 传入 `custom`；共享 `llm-api/core/adapters/openai-compatible.ts` 的 `toOpenAiCompatibleCoreRequest` 解包合并 | `src/.../config/parameter-config.ts:441-480` |
| 世界书最小闭环（constant / scanDepth / 关键词 / 3 位置 / order） | ✅ | `core/pipeline/processors/worldbook-injector.ts:48-83`、`useChatExecutor.ts:215-216` | 桌面为 ST 完整语义 |
| ST 世界书导入（内嵌 `character_book` 或独立 JSON） | ✅ 已补齐 | 导入器提取 + `worldbookStore.importFromSillyTavern` 落库 + `worldbookIds` 回写；世界书页支持独立 JSON 导入 | `src/tools/st-worldbook-manager/services/worldbookImportService.ts:40-138` |
| 世界书高级语义（selective/keysecondary、递归、probability/sticky/cooldown、组竞争、8 位置+role、`worldbookSettings` 覆盖、三源合并） | 🟡 selective / probability / 位置+role 与导入映射已落地（2026-09-26，见 4.1）；递归扫描执行已落地（2026-10-02，见 4.1）；组竞争、sticky/cooldown、三源合并为显式后续项 | `llm-chat/types/worldbook.ts`、`worldbook-injector.ts`、`worldbookStore.ts` | `src/.../worldbook-processor.ts` |
| Agent 私有资产目录（头像、`assets/`、`worldbooks/` 提取落盘与回写） | ✅ | `useAgentStorage.ts`（私有资产 API）、`useAgentImporter.ts`（提取）、`AgentList.vue`（落盘回写） | `src/tools/agent-manager/services/agentExportService.ts` |
| `presetAttachments` 运行时解析与进 vision | ✅ 已补齐（2026-09-26） | `core/context-utils/preset-attachment-resolver.ts`、`core/pipeline/processors/preset-attachment-processor.ts`（图片内联 vision、文本内联回退、其它降级 warning） | `src/.../core/context-utils/preset-attachment-resolver.ts:89-130` |
| `assetGroups` 分组语义与宏注入 | ✅ 已补齐（2026-09-26） | `agent-manager/types/agent.ts`、`llm-chat/core/pipeline/processors/macros-renderer.ts` | `AssetGroup` + `AgentAsset.group` 已对齐（移动端不引入 `agent-asset://`） |
| knowledgeAccess / Recall | ❌ 类型占位（符合边界，不做） | `agent-manager/types/agent.ts:94-95` | — |

## 3. 技术选型（已落地）

- **`js-yaml`**：解析 `.agent.yaml`，与桌面端导出口径一致。
- **`fflate`**：解包 `.agent.png` / `.agent.zip` 内嵌 ZIP（纯 TS、体积小，适合移动端）。

未自研 ZIP / YAML 实现，未引入重复依赖。

## 4. 施工队列

### 批次 1：导入器全格式（agent-manager）

范围：`useAgentImporter.ts`、`AgentList.vue`、`useAgentStorage.ts`、`types/agent.ts`、相关测试、`mobile/package.json`。

- [x] 1.1 新增 `js-yaml`、`fflate` 依赖。
- [x] 1.2 `parseFile` 支持 `.agent.yaml`：`yaml.load` 后走既有 `parseImportPayload`。
- [x] 1.3 PNG 分支扩展：识别 `aiob` chunk → 解析 `AIO_Agent_Bundle`（`{ version, type, compressed, data }`）→ base64 解码 → `fflate.unzipSync` → 读取包内 `*.agent.json` / `*.agent.yaml` 配置文件 → 走 `parseImportPayload`。`ccv3`/`chara` 与 `aiob` 并存时 ST 卡优先（与现行为一致）。压缩 flag 目前恒为 `true`（ZIP base64），按字段预留 uncompressed 处理。
- [x] 1.4 支持 `.agent.zip` 直接导入：解包读取配置文件（桌面端 `agentImportService.ts:491-523` 同路径）。包内 `assets/`、世界书文件本阶段不解包消费，避免静默丢数据：解析结果需携带「包内有未消费资源」的提示信息，由调用方透出 warning。
- [x] 1.5 `AgentList.vue` 失败提示细化：按错误原因（不支持的格式 / 无有效 Agent / 无可用模型）区分提示，替换现在统一吞掉的 `catch`。
- [x] 1.6 补 AIO 导入包单测：`.agent.json` 现有路径回归 + `.agent.yaml` + `aiob` PNG + `.agent.zip`（含包内 YAML 配置），以及 ST 卡与 AIO PNG 并存时的优先级。
- [x] 1.7（2026-09-26）解包消费包内私有资源：`useAgentStorage.ts` 新增 `agents/{id}/` 私有资产目录 API（保存/读取二进制、写头像、递归列出）；`useAgentImporter.ts` 提取包内头像、`assets/` 与 `worldbooks/`，按 `agentIndex` 关联并支持批量多 Agent 子文件夹；`AgentList.vue` 在 `createAgent` 取得 id 后落盘并回写 `icon`/`assets`/`worldbookIds`。warnings 只覆盖真正未消费资源。

### 批次 2：世界书导入转换 + ST 正则导入（agent-manager + llm-chat）

范围：`useAgentImporter.ts`、`llm-chat/stores/worldbookStore.ts`（新增导入方法）、世界书页导入入口、相关测试。

- [x] 2.1 worldbookStore 新增导入方法：接收 ST 世界书结构，做字段映射到 `MobileWorldbook`（position 三值映射：`before_char`→`before_history`、`after_char`→`after_character`、`at_depth`/`an_*` 等高级位置→就近降级并在条目上记录原始值），重名判重沿用现有 `WORLDBOOK_NAME_DUPLICATE` 策略。
- [x] 2.2 导入器把 ST 卡内嵌 `character_book`（对齐桌面端标准路径 `data.character_book`）转换为上述导入调用，并把返回的世界书 ID 写入 Agent `worldbookIds`，同时清理 `extensionConfig.characterBook` 存档（转换为完成即不再双份保留）。
- [x] 2.3 ST 世界书独立 JSON 文件导入入口：世界书页新增导入按钮，复用 2.1 的转换。
- [x] 2.4 ST `regex_scripts` → `ChatRegexConfig` 转换：参照桌面 `sillyTavernParser.ts:307-343`，在导入器内生成 `agent.regexConfig.presets`，使移动端 `regex-processor`（request 阶段已可用）直接生效；转换成功的条目从 `extensionConfig.regexScripts` 移除，避免双份。
- [x] 2.5 不可表达字段策略：递归扫描、probability/sticky/cooldown、组竞争等移动端模型无对应字段，转换时丢弃并在导入结果中汇总告知（一次性 warning），不静默丢失。
- [x] 2.6 测试：`worldbookStore.test.ts` 扩展导入映射用例（位置降级、判重、worldbookIds 回写）；导入器测试覆盖内嵌书与 regex_scripts 转换。

### 批次 3：运行时小改高收益（llm-chat）

范围：`macros-renderer.ts`、`injection-assembler.ts`（或其调用的 chatPathUtils 对应实现）、测试。

- [x] 3.1 时间宏：在 `macros-renderer.ts` default 分支前补 `{{time}}/{{date}}/{{isotime}}/{{datetime}}` 解析；支持 `agent.virtualTimeConfig`（虚拟时间基准与 `timeScale` 推进），语义对齐桌面 `datetime.ts:747-760`。
- [x] 3.2 `displayPresetCount` 接线：预设装配路径中按 Agent 该字段截取前 N 条启用消息（桌面语义见 `chatPathUtils.ts:61-125`），未设置时保持现行为。
- [x] 3.3 测试：时间宏（固定时钟 / 虚拟时间）、`displayPresetCount` 截取与默认行为。

### 批次 4（后置，独立排期，不阻塞本计划验收）

- [x] 正则 render（显示前）阶段（2026-09-26）：`MessageContent` 显示前应用 `applyTo.render` 规则，`ChatMessage` 以 `metadata.agentId` 做 Message-Bound 解析，深度由 `MessageList` 传入；解析/排序/应用复用 `utils/chatRegex.ts`，与 request 阶段语义一致；ST `markdownOnly` 导入转换为 `render: true`，旧配置缺 render 字段按 false 安全降级。
- [x] 多配置源合并函数（2026-09-26）：`mergeRegexConfigs(...sources)` 按参数顺序（对齐桌面 global → agent → profile）拼接，`collectStageRules` 统一按预设 `priority`、规则 `order` 排序，同权重保持来源顺序。**移动端全局/档案级 `regexConfig` 无存储与 UI 载体，调用时全局源恒空**；后续接入时无需改动合并与应用函数，只需补齐设置模型与 UI。
- 正则 render 后续项（2026-10-02 完成前两项）：思考内容（`reasoningContent`）的 render 正则已落地——`MessageContent` 用同一套 `renderRules` 生成 `displayedReasoningContent`，无规则时短路；render 规则的宏预处理已落地——`chatRegex.ts` 新增纯函数 `preprocessRegexRuleMacros`（`substitutionMode` RAW/ESCAPED/NONE，作用于 `regex` 与 `trimStrings`），render 侧由 `ChatMessage` 解析 `{{user}}`/`{{char}}` 值经 `regexMacros` prop 传入，request 侧由 `regex-processor` 用 `agentConfig`/`userProfile` 接入；`trimStrings` 捕获组后处理在 `applyRegexRules` 内实现；ST 导入器已真实转换 `substituteRegex`/`trimStrings`，不再只发「未迁移」warning。**仍后置**：render 规则的编辑 UI 与调试预览。
- 世界书高级语义（selective/keysecondary、递归扫描、probability/sticky/cooldown、组竞争、8 位置 + role、`worldbookSettings` 覆盖与三源绑定合并）——涉及 `MobileWorldbook` 模型扩展，需先立数据结构设计。见下方「4.1 世界书高级语义字段设计」，本轮已落地 selective / probability / 位置+role / 导入映射；递归扫描执行已于 2026-10-02 落地（见 4.1）；组竞争、sticky/cooldown、三源合并仍是显式后续项。
- [x] Agent 私有 `presetAttachments` 与开局消息附件运行时解析与进 vision（已完成，2026-09-26）：`core/context-utils/preset-attachment-resolver.ts` + `core/pipeline/processors/preset-attachment-processor.ts`（priority 850）从 `agents/{id}/` 私有目录读取字节，图片以纯 JS 内联 base64 进 vision、文本文档内联 `<attachment_text>` 回退、音频/视频/其它二进制降级为文本描述并 warning；`injection-assembler` 把 `presetAttachments` 归一化为 `_privateAttachments`，`session-loader` 读取开局节点 `metadata.privateAttachments`，`greetingService` 固化时保留引用；不接入全局 `asset_manager.db`，无附件时不改变现有行为。
- [x] Agent 私有 `assetGroups` 的分组语义与宏注入（已完成，2026-09-26）：`assetGroups` 从 `unknown[]` 占位转为 `AgentAssetGroup`（`id`/`displayName`/`description`/`icon`/`sortOrder`，索引签名无损保留），`AgentAsset.group` 归类；导入器 `normalizeAgentAssetGroups` 归一化并保留合法字段，旧 `unknown[]` 数据不崩溃；`macros-renderer` 的 `{{assets}}` 纳入 `agent.assets` 并支持 `{{assets::group}}` / `{{assets::default}}` 过滤，全局附件摘要与输出顺序保持不变。移动端不引入桌面 `agent-asset://` 资源协议（无对应 resolver），私有资产只输出可读文本与 Handle 标识。私有音视频进入请求、Agent 资产管理 UI 仍后置。
- [x] `parameters.custom` 自定义参数透传（已完成，2026-09-26）：`useChatExecutor` 透传，共享 `toOpenAiCompatibleCoreRequest` 按桌面 `buildEffectiveParameters` 语义解包（包裹结构 `enabled` 为真才合并、旧扁平整体合并），允许覆盖标准字段但保护 `messages` / `stream`；「按模型能力过滤」仍待独立排期。

#### 4.1 世界书高级语义字段设计（本轮施工）

**目标**：让含高级世界书的 ST / PC AIO 角色卡在移动端尽量正确运行，同时保持旧数据与旧字段语义不变。模型仍存储纯文本世界书，不引入向量、自动化或工具链。

**新增字段（`MobileWorldbookEntry`）**

| 字段 | 类型 | 语义 | ST 映射 |
| --- | --- | --- | --- |
| `selective` | `boolean?` | 启用次要关键词选择性逻辑 | `selective` |
| `secondaryKeys` | `string[]?` | 次要关键词 | `keysecondary` |
| `selectiveLogic` | `"and_any"｜"not_all"｜"not_any"｜"and_all"?` | 次要关键词逻辑，缺省 `and_any` | `selectiveLogic` 0/1/2/3 → 对应值 |
| `probability` | `number?` | 触发概率，**统一 0-100**（对齐 ST，不做 0-1 存储） | `probability` |
| `useProbability` | `boolean?` | 是否启用概率，缺省 `false` | `useProbability` |
| `role` | `"system"｜"user"｜"assistant"?` | 注入消息角色，缺省 `system` | `role` 0/1/2 |
| `stPosition` | `number?` | ST 原始位置枚举 0-7，仅记录用于无损回写 | `position`（数字） |
| `excludeRecursion` / `preventRecursion` / `delayUntilRecursion` / `delayUntilRecursionLevel` | `boolean?/number?` | 递归语义字段，**先无损保存**，运行时递归为后续项 | 同名 |
| `raw` | `Record<string, unknown>?` | 原始 ST 条目，未知字段无损保留 | 整个条目 |
| `[key: string]: unknown` | — | 未知字段无损保留（含 `group`/`groupWeight`/`vectorized`/`automationId` 等） | — |

**位置语义**：`WorldbookEntryPosition` 从三值扩展为 ST 可表达子集 `before_character｜after_character｜before_history｜after_history｜depth｜outlet`。旧值三个全部保留；旧数据无需迁移。ST 8 位置映射：

| ST 位置 | 移动端有效位置 | 是否无损 |
| --- | --- | --- |
| 0 `before_char` | `before_character` | ✅ |
| 1 `after_char` | `after_character` | ✅ |
| 2 `before_an` | `before_history` | ⚠ 降级并 warning |
| 3 `after_an` | `after_history` | ⚠ 降级并 warning |
| 4 `depth` | `depth` | ✅ |
| 5 `before_em` | `before_history` | ⚠ 降级并 warning |
| 6 `after_em` | `after_history` | ⚠ 降级并 warning |
| 7 `outlet` | `outlet`（不注入消息，仅保留在激活列表） | ⚠ warning |

AN / EM 区分在移动端管线中没有独立锚点，因此 2/3/5/6 合并到最近锚点并汇总 warning；`stPosition` 保留原始值，未来若增加锚点可无损迁移。

**匹配语义**（`worldbook-injector.ts`）
1. 主关键词命中（`constant` 跳过关键词）。
2. `selective && secondaryKeys.length > 0` 时按 `selectiveLogic` 判定次要关键词：`and_any` 命中数 > 0；`and_all` 命中数 = 全部；`not_any` 命中数 = 0；`not_all` 命中数 < 全部。
3. `useProbability && 0 < probability < 100` 时按 `probability` 百分比随机激活；随机源可在调用层注入，测试使用确定性种子。`probability <= 0` 恒不激活，`>= 100` 或未启用恒激活。
4. `depth` 计算继续基于**注入前 session history 锚点**（见 `mobile-pc-parity-construction-review.md` 4.6），不回退为按注入后索引计算。
5. 位置注入：`before_character` 在角色 system 预设前、`before_history` 在历史前、`after_character` 在角色 system 预设后、`after_history` 在首条历史后、`depth` 按深度、`outlet` 不注入消息但计入激活列表。

**世界书设置（`worldbookSettings`）**：新增 `MobileWorldbookSettings`，可挂在 `MobileWorldbook.settings`（书级）或既有 `ChatAgent.worldbookSettings`（Agent 级，`unknown`）。运行时消费 `defaultScanDepth`（扫描深度兜底，优先级 `entry.scanDepth > 书级 > Agent 级 > 8`）与递归开关（`recursive` 未定义视为开启、`disableRecursion` 强制单轮、`maxRecursionSteps` 限轮次并另有 20 轮硬上限）；`recursive` / `disableRecursion` / `maxRecursionSteps` 已参与 2026-10-02 落地的递归扫描执行，全局默认世界书与 Agent 绑定世界书的三源（全局/档案/Agent）合并仍是后续项。

**递归扫描执行（2026-10-02 落地）**：`worldbook-injector` 从单轮匹配升级为 `INITIAL → RECURSION → DONE` 多轮扫描。首轮语义与旧版完全一致；新激活且未 `preventRecursion` 的条目内容进入递归缓冲（以 `\x01` 分隔拼接进下一轮扫描文本，避免跨段关键词误匹配）；`excludeRecursion` 条目不被递归激活、`preventRecursion` 条目内容不外溢但仍可被递归激活（对齐 ST/桌面端）；`delayUntilRecursion` 条目按 `delayUntilRecursionLevel` 分层在递归轮参与；书级或 Agent 级设置可整体关闭递归。全部 14 个既有用例回归通过并新增 7 个递归用例。

**向后兼容**
- 旧条目只含原字段时行为完全不变；新字段全部可选。
- `upsertEntry` 编辑时以既有条目为基底合并，UI 未暴露的高级字段与 `raw` 不会被编辑动作清空。
- 导入仍有 warning 汇总，不静默丢失；`raw` 与 `[key: string]` 保证未知字段可回写。

**本轮显式后续项（未实现，勿误标完成）**
- 组竞争（`group` / `groupWeight` / `groupOverride`）与 sticky / cooldown / delay。
- 全局默认世界书与 Agent 绑定世界书的三源合并。
- AN / EM 独立锚点与 Outlet 宏提取。

（递归扫描执行已于 2026-10-02 完成，见上文「递归扫描执行」。）

### 明确不做

- knowledgeAccess / Recall / Knowledge 宏（保持类型占位，产品未定）。
- 工具宏 `{{tools}}/{{tool_usage}}/{{tool_context}}`（移动端无工具调用编排）。
- greeting live 重建机制（移动端创建时一次性固化，宏延迟到请求时渲染，行为已文档化）。

## 5. 验证口径

- 每批次：`bun run check:frontend` + `bun run test:run`（只跑相关用例）；收尾统一 `bun run build`。
- 真实运行态走查：依次导入 `.agent.json` / `.agent.yaml` / `.agent.png`（AIO 与 ST 各一）/ `.agent.zip`、带内嵌世界书与 regex 的 ST 卡，确认预设、世界书注入、正则、时间宏在会话中生效。
- 后置平台验证（不阻塞施工）：Android 真机 SAF 文件选择路径导入、大 ZIP 包内存占用。
- 施工完成后将稳定边界回写 `mobile/src/tools/agent-manager/ARCHITECTURE.md` 与 `mobile/src/tools/llm-chat/ARCHITECTURE.md`，本文档转入已完成批次记录。
