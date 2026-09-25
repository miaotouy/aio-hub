# 移动端角色卡与 AIO 导入包运行时对齐计划

> **文档状态**: 批次 1–3 已完成（2026-09-25），本文档记录施工队列与剩余待办；批次 4 与「明确不做」为边界
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
| `.agent.zip` | ✅ 已补齐 | 解包读取 `*.agent.json` / `*.agent.yaml`；包内 `assets/`、世界书等资源暂不消费，通过 warnings 告知 |
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
| 正则 request 阶段（发送前） | ✅ | `core/pipeline/processors/regex-processor.ts:105-211` | 实现等价 |
| 正则 render 阶段（显示前） | ❌ | 无 render 阶段 | `src/tools/llm-chat/components/message/MessageContent.vue:363-388` |
| 正则配置源 | 🟡 仅 agent 级单一来源 | `regex-processor.ts:157` | `src/.../regex-processor.ts:113-120`（多源合并） |
| ST regex_scripts 导入转换 | ✅ 已补齐 | 导入器转换为 `regexConfig.presets`，request 阶段生效 | `src/.../services/sillyTavernParser.ts:307-343` |
| 多开场白 + `defaultGreetingId` | ✅ | `services/greetingService.ts:51-99`、`stores/llmChatStore.ts:128-140` | 实现等价（桌面另有 live greeting 生命周期） |
| `displayPresetCount` | ✅ 已补齐 | `injection-assembler.ts`（先过滤后截断，无历史锚点时不生效） | `src/.../utils/chatPathUtils.ts:61-125` |
| LlmParameters 标准字段 + contextManagement | ✅ | `composables/useChatExecutor.ts:306-319`、`token-limiter.ts:124-131` | 实现等价 |
| `parameters.custom` 透传 | ❌ 仅 6 个标准字段 | `useChatExecutor.ts:306-319` | `src/.../config/parameter-config.ts:441-480` |
| 世界书最小闭环（constant / scanDepth / 关键词 / 3 位置 / order） | ✅ | `core/pipeline/processors/worldbook-injector.ts:48-83`、`useChatExecutor.ts:215-216` | 桌面为 ST 完整语义 |
| ST 世界书导入（内嵌 `character_book` 或独立 JSON） | ✅ 已补齐 | 导入器提取 + `worldbookStore.importFromSillyTavern` 落库 + `worldbookIds` 回写；世界书页支持独立 JSON 导入 | `src/tools/st-worldbook-manager/services/worldbookImportService.ts:40-138` |
| 世界书高级语义（selective/keysecondary、递归、probability/sticky/cooldown、组竞争、8 位置+role、`worldbookSettings` 覆盖、三源合并） | ❌ 移动端模型有意精简 | `llm-chat/types/worldbook.ts:1-39` | `src/.../worldbook-processor.ts` |
| Agent 私有资产（`assets/assetGroups/presetAttachments`）运行时解析 | ❌ 类型占位，装配不解析、不进 vision | `agent-manager/types/agent.ts:89-95` | `src/.../core/context-utils/preset-attachment-resolver.ts:89-130` |
| knowledgeAccess / Recall | ❌ 类型占位（符合边界，不做） | `agent-manager/types/agent.ts:94-95` | — |

## 3. 技术选型（已落地）

- **`js-yaml`**：解析 `.agent.yaml`，与桌面端导出口径一致。
- **`fflate`**：解包 `.agent.png` / `.agent.zip` 内嵌 ZIP（纯 TS、体积小，适合移动端）。

未自研 ZIP / YAML 实现，未引入重复依赖。

## 4. 施工队列

### 批次 1：导入器全格式（agent-manager）

范围：`useAgentImporter.ts`、`AgentList.vue`、`useAgentImporter.test.ts`、`mobile/package.json`。

- [x] 1.1 新增 `js-yaml`、`fflate` 依赖。
- [x] 1.2 `parseFile` 支持 `.agent.yaml`：`yaml.load` 后走既有 `parseImportPayload`。
- [x] 1.3 PNG 分支扩展：识别 `aiob` chunk → 解析 `AIO_Agent_Bundle`（`{ version, type, compressed, data }`）→ base64 解码 → `fflate.unzipSync` → 读取包内 `*.agent.json` / `*.agent.yaml` 配置文件 → 走 `parseImportPayload`。`ccv3`/`chara` 与 `aiob` 并存时 ST 卡优先（与现行为一致）。压缩 flag 目前恒为 `true`（ZIP base64），按字段预留 uncompressed 处理。
- [x] 1.4 支持 `.agent.zip` 直接导入：解包读取配置文件（桌面端 `agentImportService.ts:491-523` 同路径）。包内 `assets/`、世界书文件本阶段不解包消费，避免静默丢数据：解析结果需携带「包内有未消费资源」的提示信息，由调用方透出 warning。
- [x] 1.5 `AgentList.vue` 失败提示细化：按错误原因（不支持的格式 / 无有效 Agent / 无可用模型）区分提示，替换现在统一吞掉的 `catch`。
- [x] 1.6 补 AIO 导入包单测：`.agent.json` 现有路径回归 + `.agent.yaml` + `aiob` PNG + `.agent.zip`（含包内 YAML 配置），以及 ST 卡与 AIO PNG 并存时的优先级。

### 批次 2：世界书导入转换 + ST 正则导入（agent-manager + llm-chat）

范围：`useAgentImporter.ts`、`llm-chat/stores/worldbookStore.ts`（新增导入方法）、世界书页导入入口、相关测试。

- [x] 2.1 worldbookStore 新增导入方法：接收 ST 世界书结构，做字段映射到 `MobileWorldbook`（position 三值映射：`before_char`→`before_history`、`after_char`→`after_character`、`at_depth`/`an_*` 等高级位置→就近降级并在条目上记录原始值），重名判重沿用现有 `WORLDBOOK_NAME_DUPLICATE` 策略。
- [x] 2.2 导入器把 ST 卡内嵌 `character_book`（含 V2 `data.character_book` 与 V3 `extensions.character_book`）转换为上述导入调用，并把返回的世界书 ID 写入 Agent `worldbookIds`，同时清理 `extensionConfig.characterBook` 存档（转换为完成即不再双份保留）。
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

- 正则 render（显示前）阶段与多配置源合并（agent / 全局 / 档案级）。
- 世界书高级语义（selective/keysecondary、递归扫描、probability/sticky/cooldown、组竞争、8 位置 + role、`worldbookSettings` 覆盖与三源绑定合并）——涉及 `MobileWorldbook` 模型扩展，需先立数据结构设计。
- Agent 私有资产与 `presetAttachments` 运行时（依赖私有资产目录落地，见 `mobile-agent-manager-plan.md` 后续增强项）。
- `parameters.custom` 自定义参数透传与按模型能力过滤。

### 明确不做

- knowledgeAccess / Recall / Knowledge 宏（保持类型占位，产品未定）。
- 工具宏 `{{tools}}/{{tool_usage}}/{{tool_context}}`（移动端无工具调用编排）。
- greeting live 重建机制（移动端创建时一次性固化，宏延迟到请求时渲染，行为已文档化）。

## 5. 验证口径

- 每批次：`bun run check:frontend` + `bun run test:run`（只跑相关用例）；收尾统一 `bun run build`。
- 真实运行态走查：依次导入 `.agent.json` / `.agent.yaml` / `.agent.png`（AIO 与 ST 各一）/ `.agent.zip`、带内嵌世界书与 regex 的 ST 卡，确认预设、世界书注入、正则、时间宏在会话中生效。
- 后置平台验证（不阻塞施工）：Android 真机 SAF 文件选择路径导入、大 ZIP 包内存占用。
- 施工完成后将稳定边界回写 `mobile/src/tools/agent-manager/ARCHITECTURE.md` 与 `mobile/src/tools/llm-chat/ARCHITECTURE.md`，本文档转入已完成批次记录。
