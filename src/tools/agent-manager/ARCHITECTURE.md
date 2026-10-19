# Agent Manager（智能体大厅）：架构与数据契约

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/llm-chat`（编排与参数类型）、`src/tools/st-worldbook-manager`（世界书导入）、`src/tools/sub-agent`（子智能体配置与内置释出）、`src/tools/knowledge-base`（Knowledge 访问权限）
> 相关架构：[模型参数系统](../llm-chat/docs/architecture/model-parameter-system.md) | [工具审批仲裁](../../../docs/architecture/tool-approval-arbitration.md)
> 组件明细：[components/README.md](./components/README.md)

---

## 1. 模块定位与边界

`agent-manager` 是智能体（`ChatAgent`）实体的唯一属主模块，负责智能体的全生命周期：创建、编辑、复制、删除、导入导出、私有资产管理，以及把配置暴露给 LLM 的工具调用接口。`llm-chat`、`sub-agent` 等模块消费 Agent 数据，但不直接写盘；所有持久化路径由本模块的存储层收口。

- **注册入口**：[agent-manager.registry.ts](./agent-manager.registry.ts) 声明 `id: "agent-manager"` 的 UI 工具（路由 `/agent-manager`，组件 `AgentManager.vue`）。`getMetadata()` 返回空方法列表——对外能力由 `agentManagementService` 以独立 `agentCallable` 方法形式注册（见第 7 节），注册文件本身不承载方法。
- **数据契约属主**：`types/agent.ts`（`ChatAgent`、`SubAgentConfig`、`AgentAsset` 等）与 `types/agentImportExport.ts`（`ExportableAgent`、`AgentExportFile`、`ParsedAgentImportBundle` 等）。`store` 重新导出导入导出类型以保持向后兼容。
- **存储根**：`getAppConfigDir()` 返回的应用数据根目录下的 `agent-manager/`，不直接调用 `appDataDir()`。

## 2. 分层结构

```
AgentManager.vue            主页面：列表、搜索、分类过滤、一键开聊
├── stores/agentStore.ts    Pinia（llmChatAgent）：状态中心 + 编排导入导出
│   ├── services/*          导入导出、迁移、资产、Agent 管理方法（纯业务）
│   └── composables/storage/useAgentStorage.ts   存储层（唯一写盘收口）
└── components/
    ├── management/         生命周期对话框（创建/编辑/升级/迷你列表）
    ├── agent-editor/       核心编辑器：agentEditConfig.ts 页签表 + sections/
    ├── parameters/         模型参数与上下文参数编辑器
    ├── assets/             资产管理器与预设消息编辑
    ├── editors/            专项编辑器（预设消息、Recall 占位符、模型匹配）
    └── selectors/          快速切换、变量、宏选择器
```

职责边界：

- **Store**（[agentStore.ts](./stores/agentStore.ts)）：内存状态 `agents: ChatAgent[]`、按需加载详情（`loadAgentDetails` 以 `parameters !== undefined` 判定详情已加载）、创建时黑名单展开可选字段并补齐默认配置块（`subAgentConfig`、`toolCallConfig`、`recallConfig`、`extensionConfig` 等）。创建/更新/复制时统一剥离遗留字段 `knowledgeBaseConfig` / `knowledgeConfig` / `knowledgeSettings` 并归一 `knowledgeAccess`。
- **Services**：无状态纯函数为主，导入导出经 Store 入口（`exportAgents` / `preflightImportAgents` / `confirmImportAgents`）调用。
- **Storage**（[useAgentStorage.ts](./composables/storage/useAgentStorage.ts)）：文件读写、索引管理、迁移触发、保存校验。业务代码不得绕过它直接写 `agent-manager/` 目录。

## 3. 持久化

### 3.1 物理布局

```
{appConfigDir}/agent-manager/
├── agents-index.json        # 索引：AgentIndexItem[]（仅展示元数据，版本 1.1.0）
└── agents/
    └── {agentId}/
        ├── agent.json       # 完整 ChatAgent 配置（缩进 2 的 JSON）
        ├── avatar-*.png     # 头像（icon 字段存相对文件名）
        └── assets/…         # 私有资产（assets 字段存相对路径）
```

索引由 `createConfigManager`（`moduleName: "agent-manager"`，500ms 防抖）管理；`syncIndex()` 扫描 `agents/` 目录与索引比对，新目录自动加载补录，已删除的从索引移除。

### 3.2 写入契约

- **严格校验**：`validateAgent()` 要求 `parameters` / `presetMessages` / `greetings` / `toolCallConfig` / `extensionConfig` 等详情字段非 `undefined`，否则拒绝写盘——防止「仅有索引数据的半加载对象」覆盖完整文件。`saveAgents` 批量保存时同样过滤无详情项。
- **序列化清洗**：写盘前剥离默认上下文压缩提示词（`stripDefaultContextCompressionPromptsFromParameters`）；`icon` 若指向自身 `appdata://agent-manager/agents/{id}/` 前缀则归一为相对文件名。
- **跳过无效写入**：内容与磁盘一致时跳过（`persistAgent` 强制写入除外）。
- **删除**：`delete_directory_in_app_data` 将整个智能体目录移入回收站，再更新索引。
- **复制**：`duplicateAgent` 先通过 `copy_directory_in_app_data` 物理复制整个智能体目录（含头像与资产），失败则中断流程，不产生半成品。

### 3.3 全量加载

`loadAgents()`（经 `loadAgentsState`）读取索引后并行加载所有 `agent.json`，返回 `agents` 与 `indexedCount`。当索引为空且目录无数据时创建默认智能体；详情暂时不可读时保留磁盘索引而不是清空，读取异常时保留内存状态——避免把临时故障误判为纯净安装。

## 4. 导入导出

### 4.1 导出（agentExportService）

导出文件契约：`{ version: 1, type: "AIO_Agent_Export", agents: ExportableAgent[] }`，格式 JSON 或 YAML。`ExportableAgent` 通过黑名单剥离 `id` / `profileId` / `createdAt` / `lastUsedAt` 等本地专属字段（批量 file 模式还剥离 `userProfileId` 之外的运行时字段），并清理预设消息的运行时元数据（`lastCalcHash`、`contentTokens`）。

四种 `exportType`：

| 类型 | 行为 |
| --- | --- |
| `zip`（默认） | 打包为 `{baseName}.agent.zip`；含资产时写入 `assets/`，头像在智能体根目录 |
| `folder` | 用户选择目录后按同名结构落盘 |
| `file` | 单文件导出；批量时自动退化为逐个分离导出（支持 `separateFolders`） |
| `png` | zip 转 Base64 后以 `{ version: 1, type: "AIO_Agent_Bundle", compressed: true, data }` 经 `embedDataIntoPng` 以 `aiob` 键内嵌到预览图 PNG 元数据 |

- **资产重定位**：`processAssetsRecursively` 遍历配置中的字符串字段，私有相对路径资产读出二进制并改写为包内相对路径（`icon` / `avatarHistory` 置于根目录，其余入 `assets/`）；`appdata://`、绝对路径、网络地址视为非私有资产，原样保留。
- **世界书捆绑**：`includeWorldbooks` 时按 `worldbookIds` 从 `st-worldbook-manager` 读取内容，`embedWorldbooks` 决定内嵌到 `bundledWorldbooks[].content` 还是写为 `worldbooks/{name}.{format}` 文件并记录 `fileName`。

### 4.2 导入（agentImportService，两段式）

1. **预检** `preflightImportAgents` / `preflightParsedAgentImportBundle`：解析输入并产出 `AgentImportPreflightResult`——显示名冲突自动编号、模型匹配（不在当前 Profile 的模型列入 `unmatchedModels`）、世界书查重、来源元信息与模型推荐。
2. **提交** `confirmImportAgents` → `commitImportAgents`：对每个智能体执行 `sanitizeImportedAgent`（默认字段强补全 + `migrateAgent`），写入资产文件，导入/覆盖世界书，最终经 `createAgent(customId?)` 建实体。

支持的输入来源（`source: "aio" | "silly-tavern" | "vcp-chat"`）：

- **AIO 包**：`.agent.zip` / `.agent.json` / `.agent.yaml` / 内嵌 `aiob` 数据的 `.agent.png`（`parsePngMetadata` 读取后解压）；
- **SillyTavern 角色卡**：`isCharacterCard` / `parseCharacterCard`（含卡内嵌世界书）；
- **VCP Chat 配置**：[vcpChatAgentImportService.ts](./services/vcpChatAgentImportService.ts) 扫描 VCP 智能体目录，转换系统提示词（original/preset/modular 三模式）、参数、stripRegexes，并按 VCP 主机同源优先给出模型推荐（`vcp-host` / `exact-model` / `fallback`）。

另有文本导入通道：`agentManagementService.import_agent_from_text` 接受 YAML/JSON 文本（自动识别 `AIO_Agent_Export` 包裹）。

## 5. 资产与跨域迁移

### 5.1 私有资产与 agent-asset:// 协议

[agentAssetUtils.ts](./utils/agentAssetUtils.ts) 提供资产路径的统一解析：

- **目录构造唯一入口**：`getAgentStorageSubdirectory(agentId, sub?)` 返回 `agent-manager/agents/{id}` 相对子目录，所有直接读写智能体私有文件的调用（含 Rust command 的 `subdirectory` 参数）都必须经它构造，避免存储根重构后出现硬编码遗漏。
- **`agent-asset://{group}/{id}.{ext}`**：消息内容中的资产引用协议。`resolveAgentAssetUrlSync` 依赖 `initAgentAssetCache()` 预热的 appData 路径缓存做同步解析；匹配优先级为 group+id 精确 → group+文件名 → 仅 id → 仅文件名 → 同 group 内模糊匹配（Levenshtein 相似度，阈值 0.7）。
- **缺失占位**：无法解析的引用渲染为带文件名的紫黑棋盘占位卡片（`createMissingImagePlaceholder`），保留原始 URL 供排查。
- **头像路径解析**：`resolveAgentAvatarPath` 将旧前缀 `appdata://llm-chat/agents/` 动态重定向到 `appdata://agent-manager/agents/`，纯文件名（疑似内置文件名）自动拼接智能体目录。

### 5.2 内置预设资产导入

`agentAssetService.ensurePresetAssetsImported()` 扫描 `icon` 与 `assets` 中以 `/agent-presets/`（兼容旧 `/agent-icons/`）开头的内置路径，fetch 二进制后经 `save_uploaded_file` 落盘到智能体私有目录，并把配置改写为相对路径。该入口由 `agentStore.ensurePresetAssetsImported` 暴露，是 `sub-agent` 内置基线子智能体释出流程（`SubAgentBaselineService`）的资产落地环节。

### 5.3 迁移链

存储层在每次索引/单文件读写前调用 `ensureAgentDataMigrated()`，通过 `runVersionedDataMigration`（迁移 ID `agent-manager`，版本 `cross-module-v2`）执行幂等的跨模块迁移：

1. **llm-chat → agent-manager**：从旧位置 `llm-chat/agents` 与 `llm-chat/agents.migrated.bak` 两个来源向 `agent-manager/agents` 补充迁移——`repairInvalidEntityConfigs` 修复损坏的 `agent.json`、`mergeMissingDirectoryTree` 补齐缺失目录树（忽略 `.migration_in_progress` 标记）、`verifyDirectorySubset` 校验完整性；原数据保留，迁移完成后发通知。
2. **v1 单文件 → v2 目录**：`runMigration()` 将 `agents/` 下遗留的 `{id}.json` 平文件迁为 `{id}/agent.json` 目录结构，头像一并复制，旧文件移入回收站。
3. **加载期自愈**（`loadAgent` 内）：强制同步 `agent.id` 与目录名；Windows 盘符 / `file://` 绝对路径头像复制进私有目录并改写为相对文件名；`avatarHistory` 缺失时扫描目录图片重建；分类旧字符串按枚举/中文标签/遗留映射归一；最后执行 `migrateAgent()`（[agentMigrationService.ts](./services/agentMigrationService.ts)）补齐 `extensionConfig` 等缺失配置块并升级 Recall 配置到版本 4 结构。

### 5.4 资产短描述

资产管理工具栏提供「描述生成」，可补全当前列表或所选资产的空描述，也可显式重新生成；资产编辑弹窗支持生成、修改后保存。批量结果写入智能体编辑草稿，沿用智能体保存流程。

- **配置**：`agentAssetDescriptionSettings.ts` 使用 `createConfigManager` 在 `agent-manager/asset-description.json` 保存全局描述提示词。设置弹窗展示各类型的模型来源，可直接打开现有转写服务配置。
- **模型继承**：由转写共享的 `resolveTranscriptionModelIdentifier()` 解析「该类型模型 → 转写默认模型」。每次操作读取配置并固定本批次的绑定和提示词。资产描述使用独立请求及提示词，候选选择与回退由统一渠道执行层负责。
- **内容输入**：静态图片从原图等比缩放至长边 1024 像素内并遵守模型尺寸限制，使用完整画面；GIF、动态 WebP 和 APNG 保留原始文件、尺寸与动画帧发送，默认交由模型处理，格式或尺寸限制沿用请求错误反馈。音频、视频发送原始媒体内容，音频仅有 ASR 能力时提示配置音频理解模型。文件支持 PDF、DOCX、PPTX、XLSX 与 UTF-8 文本；Office 文件提取正文，纯图文档可能需要转换为 PDF。PDF 优先原生文档输入，否则最多抽样 12 页文本，无可提取文字且模型支持视觉时分析前 4 页预览。长文本使用首尾节选。
- **资源与输出**：每文件上限 32 MiB，批量并发 2。输出清理思考内容和多余空白，空结果、拒绝结果和超过 120 字的结果作为失败处理；默认提示词要求 60 字内。
- **写入边界**：生成期间资产被移除、改名或描述被修改时跳过旧结果；取消、关闭资产管理、切换智能体时中止任务并丢弃迟到响应。失败项可查看原因并单独重试，成功项保留。
## 6. 模型与上下文配置

智能体编辑器（`EditAgentDialog` / `AgentEditor`）的页签表由 [agentEditConfig.ts](./components/agent-editor/agentEditConfig.ts) 集中定义（提交 `36cd567e2`，2026-10-11）：

- **「模型参数」页签**（`id: "model"`）：模型选择（`ModelConfigSection`，聊天侧边栏与设置页复用同一控件）+ `modelParameterSearchItems`，分组为基础/高级/Gemini 安全设置/特殊功能/自定义参数；
- **「上下文」页签**（`id: "context"`）：`contextParameterSearchItems`，覆盖上下文管理（`maxContextTokens`、截断保留字符数）、上下文压缩、上下文后处理、图片压缩四组。

两页共用 `ModelParametersEditor` 与同一份深拷贝 `parameters` 草稿，跨页保留启用列表与嵌套配置；搜索按模型能力过滤并展开定位分组。

- **解析层**：[useAgentModelContext.ts](./composables/useAgentModelContext.ts) 依据**目标智能体**的 `profileId` / `modelId`（而非当前聊天选择）解析所属 Profile、模型、渠道类型（OpenAI 兼容渠道中的 Gemini 模型识别为 `gemini` 以保留专属参数）与 `tokenLimits.contextLength` 上限。
- **可见性规则**：[parameterEditorConfig.ts](./components/parameters/parameterEditorConfig.ts) 集中参数分组、搜索元数据与可见性判定（思考开关按 `thinkingConfigType` 区分 switch/budget/effort，安全设置按 `safetySettings` 支持或 Gemini 家族判定）。

> 参数按模型家族适配的「规则列表」方案目前仍是构想记录，未排期实施，见[模型参数适配规则草案](./docs/Plan/agent-model-parameter-rules-draft.md)；现行实现仍是单一 `parameters` 对象 + 请求前能力过滤。

## 7. Agent 工具调用接口

[agentManagementService.ts](./services/agentManagementService.ts) 提供路径式（field path）配置操作方法，供 LLM 经工具调用管理智能体（读取/导出面向 Agent 输出 YAML，底层存储保持 JSON）：

| 方法 | 能力 |
| --- | --- |
| `list_agents` / `search_agents` | 摘要列表与关键词搜索（支持 `category:` / `tag:` 过滤） |
| `read_agent_config` / `export_agent_as_text` | 按 section 或全量读取，剥离系统字段与默认压缩提示词 |
| `set_agent_field` | 路径式写入，支持 `array[0]` 与 `array[id=xxx]` 定位、值类型自动推断、缺失中间节点创建 |
| `find_replace_in_presets` | 预设消息内容查找替换（支持正则） |
| `add_preset_message` / `delete_preset_message` / `move_preset_message` | 预设消息增删与按 `before:/after:` 语法移动（保护 `chat_history` 锚点） |
| `import_agent_from_text` | YAML/JSON 文本创建智能体 |

安全边界：

- 字段黑名单 `id` / `createdAt` / `lastUsedAt` / `avatarHistory` 禁止修改；
- `toolCallConfig` 及其子路径被标记为安全敏感路径（`getAgentFieldSecurityPolicy` 返回 `approve`），修改需一次**不可被当前自动批准配置绕过**的本地独立确认，以阻断静默提权链；策略归属见[工具审批仲裁架构](../../../docs/architecture/tool-approval-arbitration.md)。

## 8. 相关文档

- [components/README.md](./components/README.md)：组件目录结构与入口说明
- [模型参数适配规则草案](./docs/Plan/agent-model-parameter-rules-draft.md)：未实施的按模型家族参数规则构想
- [模型参数系统](../llm-chat/docs/architecture/model-parameter-system.md)：llm-chat 侧参数体系与请求前过滤
- [Sub-Agent 架构](../sub-agent/ARCHITECTURE.md)：`subAgentConfig` 的消费方与内置基线释出（复用本模块的 `ensurePresetAssetsImported`）
