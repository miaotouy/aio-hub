# 移动端智能体管理器架构

> 状态：基础角色配置能力已落地并进入维护；非当前移动端主施工线，不以桌面 Agent 完全对齐为目标。

## 模块职责

`agent-manager` 负责智能体配置、模型绑定和本地持久化，不依赖聊天运行时。`llm-chat` 单向依赖本模块，通过会话的 `displayAgentId` 读取智能体配置。

## 数据与存储

```text
{appConfigDir}/agent-manager/
├── agents-index.json
└── agents/
    └── {agentId}/
        ├── agent.json
        ├── avatar-xxx.png   # 私有头像，icon 保存为相对文件名
        └── assets/          # 随包二进制资产，AgentAsset.path 为相对 Agent 目录路径
```

- `agents-index.json` 保存列表所需元数据；每个 `agent.json` 保存完整 `ChatAgent`。
- Store 当前全量加载详情，磁盘结构保留未来按需加载能力。
- 索引损坏时扫描智能体目录恢复有效条目；缺失或损坏的单项会从索引清理。
- 编辑器以完整对象为基础覆盖受支持字段，未知高级字段和未编辑的预设消息原样保留。
- `useAgentStorage` 通过 Tauri plugin-fs 提供私有资产能力：`getAgentDir` / `getAgentAssetsDir`、`saveAgentAsset` / `readAgentAsset`（任意相对路径 Uint8Array）、`saveAgentAvatar`（写 Agent 根目录）、`listAgentAssets`（递归列出 `assets/`）。相对路径经 `sanitizeRelativePath` 去除 `..`，避免逃逸 Agent 目录。
- `deleteAgent` 递归删除 `agents/{id}/`，私有头像与资产随 Agent 一并清理。

背景、预设消息附件和 `assets[]` 属于 Agent 私有资源，使用 Agent 内稳定 Handle 与相对路径，随 Agent 一起复制、导入、导出和删除。导入 PNG 角色卡时，当前会把小于 3 MiB 的原卡片保存为 `avatarDataUrl`，用于角色大厅和聊天选择器的即时预览；AIO PNG 包内的头像文件同样会落盘。AIO/ST 导入包内的头像、`assets/` 与 `worldbooks/` 已由导入器提取并落盘：头像写入 `agents/{id}/{filename}` 并把 `icon` 回写为相对文件名，资产写入 `agents/{id}/assets/` 并回写为 `AgentAsset`（`id/filename/path/type/mimeType/size`），包内世界书复用 `worldbookStore.importFromSillyTavern` 落库并把新 id 追加到 `worldbookIds`。这些资源不进入全局 `asset_manager.db`，也不受全局资产按月份回收、批量转写或清理策略影响。用户从全局资产添加资源时执行内容复制，复制后两侧不共享 ID 或生命周期。

私有资产的文件落盘与导入回写已落地；`presetAttachments` 的运行时解析与进 vision 已由 `llm-chat` 的 `preset-attachment-processor` 接通（见下方「私有资产运行时消费边界」）。`assetGroups` 已从占位 `unknown[]` 转为结构化分组元数据 `AgentAssetGroup`（`id` / `displayName` / `description` / `icon` / `sortOrder`，索引签名无损保留桌面端其余字段），`AgentAsset.group` 指向分组 `id` 完成归类；导入器用 `normalizeAgentAssetGroups` 归一化并保留合法字段，旧数据中的非对象或缺 `id` 项被安全丢弃而不崩溃。`llm-chat` 的 `{{assets}}` 宏会列出 `agent.assets` 并支持 `{{assets::group}}` / `{{assets::default}}` 过滤，但移动端没有 `agent-asset://` 资源 resolver，宏只输出可读文本与 Handle 标识，不产生可解析引用。分组语义见 [`mobile-character-card-parity-plan.md`](../../../docs/plan/mobile-character-card-parity-plan.md) 批次 4 与 [`mobile-attachment-support-plan.md`](../../../docs/plan/mobile-attachment-support-plan.md) 附件 3。全局可回收资产契约见 [`mobile-asset-manager-design.md`](../../../docs/plan/mobile-asset-manager-design.md)。桌面端预设附件使用 Agent Handle 的既有语义见 [LLM Chat 架构](../../../../src/tools/llm-chat/ARCHITECTURE.md) 的预设消息多模态附件记录。

## 私有资产运行时消费边界

`llm-chat` 通过 `core/context-utils/preset-attachment-resolver.ts` 与 `core/pipeline/processors/preset-attachment-processor.ts` 消费 Agent 私有附件，边界如下：

- **引用来源**：预设消息的 `presetAttachments`（`{ assetId, description }`，`assetId` 是 `AgentAsset.id` Handle）；开局消息的 `greetings[].attachments`（桌面导出的 `Asset` 快照，通常带 `path`，经归一化后不把全局 UUID 当作 Handle）。
- **解析方式**：优先按 `assetId` 匹配 `agent.assets`，其次按 `path`（含多 Agent 子文件夹前缀的双向后缀匹配），再按文件名；都未命中但存在相对路径时按路径直接尝试读取。引用/字节缺失只记录 warning，不静默丢弃。
- **读取**：运行时通过 `useAgentStorage.readAgentAsset(agentId, relativePath)` 与 Tauri `plugin-fs` 直接从 `agents/{id}/` 读取字节，**不经过**全局 `asset_manager.db`，不登记全局 usage，也不转换成全局 `assetId`。
- **消费**：图片以纯 JS（`btoa` + `Uint8Array`）编码为内联 base64 进入 vision；文本文档以内联 `<attachment_text>` 块回退；音频/视频/其它二进制降级为文本描述并 warning。这些内容不写入聊天持久化数据，只在请求构建期存在于 `ProcessableMessage.content`。
- **无附件**：无 `presetAttachments` / 开局附件的会话行为完全不变。

## 依赖与数据流

```text
AgentList / AgentDetail
  -> agentStore
  -> useAgentStorage
  -> Tauri plugin-fs

AgentList（导入包）
  -> useAgentImporter.parseFile
     提取配置 + agentAvatars + privateAssets + importedWorldbooks
  -> agentStore.createAgent 取得 agentId
  -> useAgentStorage.saveAgentAvatar / saveAgentAsset 落盘
  -> agentStore.updateAgent 回写 icon / assets / worldbookIds

AgentList --route query(agentId)--> ChatHome
  -> llmChatStore.createSession(name, agentId)
  -> instantiateAgentGreetings materializes greeting branches
  -> LlmChatView updates session displayAgentId when switching
  -> useChatExecutor reads agentStore and snapshots Agent metadata
  -> agent-preset-loader injects preset messages
  -> useLlmRequest uses the agent profile/model/parameters
```

预设编辑器通过 `mobile/src/utils/tokenCounting.ts` 批量调用 Rust `count_tokens_batch`，以 500ms 防抖更新启用消息的 `o200k` 估算。禁用消息、禁用消息组和过期异步结果不会进入总数；IPC 异常时只退回字符估算。

`agent-manager` 发起对话时只传递路由参数，不 import `llm-chat`，从而避免循环依赖。

## 当前边界

- **已支持**：基础 CRUD、搜索与分类筛选、模型绑定、会话绑定、聊天内 Agent 切换、开局消息实例化、预设注入，以及完整预设消息编辑器体系（多轮消息、消息组、注入策略、模型匹配、触摸排序、批量管理、Rust o200k Token 估算、AIO/SillyTavern 导入、AIO 导入包的头像/私有资产/世界书落盘回写与预设导入导出）。Agent 详情页还可编辑当前移动端请求层实际传递的 `temperature`、`maxTokens`、`topP`、频率/存在惩罚、停止序列，以及 Token limiter 的上下文预算和截断保留字符；留空时不覆盖渠道或模型默认值。切换只更新会话 `displayAgentId`；既有消息不被改写，后续助手消息会固化 Agent 身份和模型/渠道快照。绑定 Agent 的新会话会将有效开局消息固化为根节点下的兄弟分支并优先使用 `defaultGreetingId`；旧字符串开局消息兼容读取；开局消息的私有附件引用随节点 metadata 保留并在请求期解析。分类采用与桌面端一致的 `AgentCategory` 枚举；历史 `custom` 在加载时归一化为 `other`，未知未来值仍保留在完整 Agent 对象中。
- **私有资产管理（2026-10-03）**：Agent 详情页内嵌 `AgentAssetsSection`，提供分组过滤（含未分组）、多选文件添加（即选即落盘 `saveAgentAsset`，记录 `{id, filename, path, type, mimeType?, size?}`，id 用文件基名作宏 Handle、冲突追加序号）、描述与分组编辑、删除（`deleteAgentAsset` 仅允许 `assets/` 前缀，确认框提示预设/开局消息残留引用，页面级联清理 `presetAttachments` 与 `greetings[].attachments`）。图片缩略图与展开预览使用 `readAgentAsset` → Blob URL 并按时回收；`assetGroups` 分组元数据的新建/改名/删除 UI 仍后置。
- **详情页编辑补齐（2026-10-07）**：新增 `AgentGreetingsSection`（开局消息列表、新增/编辑/删除/设为默认，随整体 `save()` 落库）与 `AgentRegexSection`（只读展示 `regexConfig.presets` 与规则，支持整体启用/禁用，脚本型规则标记为移动端跳过）；基本信息区新增分类下拉与标签输入（分类选项复用 `AgentCategory` 枚举，标签为逗号分隔数组）。`save()`/删除补 try/catch，失败以 `feedback` 提示。
- **后续可选增强**：`assetGroups` 分组管理 UI（新建/改名/删除分组），以及工具调用、Knowledge/Recall、媒体/压缩等桌面高级参数继续独立设计；当前 PNG 角色卡的头像预览、导入包头像/资产/世界书落盘、卡片文本导入、`{{assets}}` 分组宏与私有资产增删改查已经可直接使用。移动端如需这些能力，应按自身产品和平台约束独立设计，不默认复制桌面实现。用户档案已由 `llm-chat` 的基础档案管理页和上下文注入支持；私有资产消费仍不得以全局 `assetId` 代替 Handle 或相对路径。

## 6. PC 角色卡导入与立即开聊

2026-09-25 起，角色大厅的导入入口直接面向 PC 端常见的 SillyTavern 角色卡：

- 支持 JSON 角色卡、PNG V2 的 `chara` 元数据和 PNG V3 的 `ccv3` 元数据；PNG 元数据可来自 `tEXt`、`iTXt` 或压缩文本块。
- V2/V3 的 `data` 结构统一归一化，保留系统提示、描述、性格、场景、示例对话、历史后置指令、深度提示和多开场白。
- 常见角色宏会转成移动端请求管线使用的 `{{char}}`、`{{user}}`、`{{persona}}` 等形式；原始角色书、正则脚本和创作者信息暂存在 `extensionConfig`，不会因为导入而丢失。
- **AIO 导出包（2026-10-07 补齐）**：桌面 `embedWorldbooks=true` 时 `bundledWorldbooks[].content` 内嵌世界书，移动端导入器 `postProcessAioAgent` 解析后复用 `importedWorldbooks` 通道落库并回写 `worldbookIds`；`fileName` 外链模式由包内 `worldbooks/` 目录解析，不双份落库。AIO `regexConfig` 中脚本型规则（`replacementType: "script"`）在移动端静默跳过，导入时汇总 warning；VCP Chat 的 `config.json` 被识别后跳过并明确提示「暂不支持」，不再误当 AIO Agent 导入。
- PNG 小于 3 MiB 时会保留一个受控的 data URL 作为角色头像，详情页、角色大厅、聊天顶部和切换面板统一展示；大文件仍可正常读取卡片文本。
- 导入后由当前可用模型 Profile 自动补齐模型绑定，角色可从导入结果直接进入新会话。文件错误会在导入反馈中显示文件名和首个可行动原因。

卡片导入只写入 Agent 配置，不把系统路径写进会话；聊天消息继续只保存 Agent/模型快照与消息内容。
