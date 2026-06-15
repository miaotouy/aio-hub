# VCPChat Agent 导入施工计划

## 目标

在 llm-chat 现有智能体导入流程中增加 VCPChat 角色配置导入能力，将 VCPChat 的 `AppData/Agents/<agentId>/config.json` 转换为 AIO Hub 的 Agent 配置。

本阶段只导入角色信息，不导入会话消息。

主要交互应是：

1. 用户选择 VCPChat 根目录（例如 `E:\rc20\vcp\VCPChat`）。
2. AIO Hub 扫描 `<VCPChatRoot>/AppData/Agents/` 下的角色目录。
3. 展示可导入 Agent 列表，支持搜索、全选、反选、单选/多选。
4. 用户确认选择后进入统一导入预检弹窗，继续处理模型推荐、资源数量、命名冲突和最终导入。

直接导入单个 `config.json` 只作为兼容入口，不作为主流程。VCPChat 当前未发现“导出单个 Agent 为 zip”的正式格式，因此本阶段不支持 VCPChat zip 导入，避免把用户手动打包目录或整体备份包误固化成导入契约。

## 明确范围

### 本阶段导入

- VCPChat Agent 配置：`AppData/Agents/<agentId>/config.json`
- Agent 头像：优先同目录下 `avatar.png`、`avatar.jpg`、`avatar.jpeg`、`avatar.gif`、`avatar.webp`；兼容读取 `AppData/avatarimage/<agentName>.*`
- Agent 正则规则：同目录下 `regex_rules.json`
- 角色提示词、模型名、采样参数、上下文上限、工具调用配置推荐

### 本阶段不导入

- `AppData/UserData/<agentId>/topics/<topicId>/history.json`
- VCPChat `topics` 中的会话消息、主题列表、历史树
- 群聊、论坛、任务模块、VCP 插件运行日志

`topics` 只作为 VCPChat 配置中的运行态线索保留在调研结论中，不映射为 AIO Agent 核心字段。

## VCPChat 存储结构结论

VCPChat 的角色定义和聊天数据分离：

- 角色定义：`E:\rc20\vcp\VCPChat\AppData\Agents\<vcpAgentId>\config.json`
- 角色头像：`E:\rc20\vcp\VCPChat\AppData\Agents\<vcpAgentId>\avatar.*`
- 角色头像同步副本：`E:\rc20\vcp\VCPChat\AppData\avatarimage\<agentName>.*`
- 角色正则：`E:\rc20\vcp\VCPChat\AppData\Agents\<vcpAgentId>\regex_rules.json`
- 会话历史：`E:\rc20\vcp\VCPChat\AppData\UserData\<vcpAgentId>\topics\<topicId>\history.json`

因此导入 Agent 时只读取 `Agents` 目录下的定义文件；`UserData/topics/history.json` 后续如果要做，也应设计成独立的会话迁移流程。

VCPChat 当前保存头像时会先写入 Agent 目录下的 `avatar<ext>`，并额外同步一份到 `AppData/avatarimage/<agentName><ext>`；运行时的 Agent 列表读取逻辑仍优先从 Agent 目录查找 `avatar.*`。AIO 导入时应按以下优先级寻找头像：

1. `AppData/Agents/<agentId>/avatar.png|jpg|jpeg|gif|webp`
2. `AppData/avatarimage/<agentName>.png|jpg|jpeg|gif|webp`
3. 无头像则使用 AIO 默认头像逻辑

如果两处都存在，以 Agent 目录头像为准，避免 Agent 改名后集中目录旧文件误匹配。

### 实测目录结论

已用 `E:\rc20\vcp\VCPChat` 对齐过实际结构：

- 根目录下存在标准 `AppData/Agents/`。
- 当前样本中共有 4 个 Agent 目录，每个目录都有 `config.json`。
- 当前样本存在 `config.json.backup`，导入扫描应忽略备份文件，只读取 `config.json`。
- 当前样本只有 1 个 Agent 目录带 `avatar.png`，同时 `AppData/avatarimage/咕咕.png` 存在集中头像副本；导入层需要同时扫描 Agent 目录头像和集中头像目录。
- 当前样本没有 `regex_rules.json`；但 VCPChat 源码会从同目录 `regex_rules.json` 读取正则并注入 `config.stripRegexes`，所以导入层仍需同时支持外置正则文件和内联 `stripRegexes`。
- 当前样本字段集合包括 `name`、`systemPrompt`、`model`、`temperature`、`contextTokenLimit`、`maxOutputTokens`、`topics`、`streamOutput`、`originalSystemPrompt`、`promptMode`、`presetSystemPrompt`、`advancedSystemPrompt`、若干样式和 TTS 字段。
- 当前样本未出现 `top_p` / `top_k`，但 VCPChat UI 和请求构造代码支持这两个字段，导入映射需要保留。

### 根目录判定

用户选择的目录按以下顺序识别：

1. 若目录本身存在 `AppData/Agents/`，视为 VCPChat 根目录。
2. 若目录本身就是 `Agents/`，视为角色目录集合，记录其父级上下文但不强制要求存在 `AppData/`。
3. 若目录下存在若干子目录且子目录中有 `config.json`，允许作为手动选择的角色集合目录，但 UI 要提示“未检测到标准 VCPChat 根目录”。
4. 其他情况提示未找到 VCPChat Agent 配置，不进入导入预检。

扫描时只遍历 `Agents` 的第一层子目录，避免误扫 `UserData/topics` 或插件缓存。

### 扫描结果

扫描阶段不要立刻转换成 AIO Agent，而是先生成轻量索引，供选择列表使用：

```ts
interface VcpChatAgentScanItem {
  vcpAgentId: string;
  dirPath: string;
  configPath: string;
  name: string;
  model?: string;
  avatarPath?: string;
  avatarSource?: "agent-dir" | "avatarimage";
  hasRegexRules: boolean;
  promptMode?: "original" | "preset" | "modular";
  updatedAt?: string;
  warnings: string[];
}
```

列表中至少展示名称、原始目录 ID、模型、头像状态、正则状态和告警。`config.json` 解析失败的目录不应静默丢弃，应作为不可选项展示或汇总到扫描结果提示中。

## AIO Hub 目标结构

AIO Hub 的 Agent 核心结构在 `src/tools/llm-chat/types/agent.ts`：

- 提示词：`presetMessages`
- 模型绑定：`profileId` + `modelId`
- 参数：`parameters`
- 正则：`regexConfig`
- 工具调用：`toolCallConfig`
- 头像/资产：导入阶段先放入 `assets/*`，提交时迁移到 Agent 目录

本次实现应复用现有最终导入链路，但不要把 VCPChat 的目录扫描和格式转换直接塞进现有文件导入解析函数。

- 解析入口：`src/tools/llm-chat/services/agentImportService.ts`
- 确认弹窗：`src/tools/llm-chat/components/export/ImportAgentDialog.vue`
- 侧栏入口：`src/tools/llm-chat/components/sidebar/AgentsSidebar.vue`

新增目录扫描链路：

- 目录选择入口：`AgentsSidebar.vue` 的“更多”菜单新增“从 VCPChat 导入...”
- 目录选择 API：优先使用 `@tauri-apps/plugin-dialog` 的目录选择能力
- 文件读取 API：优先使用项目已有 `@tauri-apps/plugin-fs` 的 `readDir` / `readTextFile` / `readFile`，或复用已有 Rust command `read_file_binary` / `list_directory`；只有实测权限或返回信息不足时，再补充最小 Rust command
- 扫描/转换服务：新增 `vcpChatAgentImportService.ts`，VCPChat 相关的根目录识别、目录扫描、字段转换、头像/正则读取都放在这里
- 通用预检入口：在 `agentImportService.ts` 增加“已解析导入包”进入预检的函数，让 VCPChat adapter 输出的结果复用名称冲突、模型检查、世界书检查和最终提交
- 选择弹窗：新增 `VcpChatAgentImportDialog.vue`，负责扫描状态、列表选择和进入预检

目录扫描得到的多选结果最终应复用通用预检和 `commitImportAgents` 的资产落盘逻辑，避免另建一套提交路径。

### 导入服务边界

现有 `agentImportService.ts` 已经承担普通文件、zip、yaml、png bundle、SillyTavern 角色卡、世界书查重、资产迁移和最终提交。VCPChat 是目录型来源导入，包含根目录识别、多文件关联、批量扫描、不可选项展示和来源推荐，复杂度与普通文件解析不同。

因此本阶段按以下边界拆分：

- `vcpChatAgentImportService.ts`
  - 只处理 VCPChat 来源数据。
  - 提供 `scanVcpChatAgents(rootPath)`。
  - 提供 `convertVcpChatAgentsToImportBundle(items)`。
  - 不直接写入 AIO Agent，不调用 `agentStore.createAgent`。
- `agentImportService.ts`
  - 保留 `preflightImportAgents(files, context)` 作为普通文件入口。
  - 新增 `preflightParsedAgentImportBundle(bundle, context)` 或同等命名函数。
  - 将名称冲突、模型不匹配、世界书冲突、资产桶合并等通用逻辑下沉到共享 helper。
  - 不内联 VCPChat 目录扫描和字段映射细节。
- `commitImportAgents(params)`
  - 继续作为唯一最终持久化入口。
  - VCPChat 不新增独立提交路径。

建议新增统一数据结构：

```ts
interface ParsedAgentImportBundle {
  agents: ExportableAgent[];
  assets: Record<string, Record<string, ArrayBuffer>>;
  bundledWorldbooks?: Record<string, BundledWorldbook[]>;
  embeddedWorldbooks?: Record<string, STWorldbook>;
  sourceMeta?: Record<string, AgentImportSourceMeta>;
  modelRecommendations?: Record<string, AgentImportModelRecommendation>;
}

interface AgentImportSourceMeta {
  source: "aio" | "silly-tavern" | "vcp-chat";
  sourceLabel?: string;
  originalId?: string;
  originalPath?: string;
  warnings?: string[];
}

interface AgentImportModelRecommendation {
  profileId?: string;
  modelId?: string;
  reason: "vcp-host" | "exact-model" | "fallback";
  note?: string;
}
```

`AgentImportPreflightResult` 可追加 `sourceMeta` 和 `modelRecommendations`，供预检弹窗展示来源和推荐理由。

## 字段映射

### 基础字段

| VCPChat             | AIO Hub                                         | 说明                           |
| ------------------- | ----------------------------------------------- | ------------------------------ |
| `name`              | `name` / `displayName`                          | 作为 Agent 名称                |
| `model`             | `modelId`                                       | 导入预检阶段再推荐 `profileId` |
| `temperature`       | `parameters.temperature`                        | 数值有效时写入                 |
| `maxOutputTokens`   | `parameters.maxTokens`                          | 数值有效时写入                 |
| `top_p`             | `parameters.topP`                               | 数值有效时写入                 |
| `top_k`             | `parameters.topK`                               | 数值有效时写入                 |
| `contextTokenLimit` | `parameters.contextManagement.maxContextTokens` | 同时启用上下文限制             |

### 提示词解析

VCPChat 有三种提示词模式：

- `original`：使用 `originalSystemPrompt || systemPrompt`
- `preset`：使用 `presetSystemPrompt`
- `modular`：读取 `advancedSystemPrompt.blocks`，过滤 `disabled`，按顺序拼接；`newline` 块输出换行，带 `variants` 的块使用 `selectedVariant`
- 兼容旧/异常数据：当 `promptMode === "modular"` 且 `advancedSystemPrompt` 是字符串时，直接使用该字符串；当 `promptMode` 缺失时按 `original` 处理

导入到 AIO 时生成一条启用的 system `presetMessages` 节点。

### 正则规则

VCPChat `regex_rules.json` 或 `stripRegexes` 映射到 AIO `regexConfig.presets[0].rules`：

- `title` / `id` -> `name`
- `findPattern` -> `regex`
- `replaceWith` -> `replacement`
- `applyToFrontend` -> `applyTo.render`
- `applyToContext` -> `applyTo.request`
- `applyToRoles` -> `targetRoles`
- `minDepth` / `maxDepth` -> `depthRange`

### VCP 工具调用配置

从 VCPChat 导入的 Agent 默认生成 VCP 协议工具配置：

- `enabled: true`
- `protocol: "vcp"`
- `convertToolRoleToUser: true`
- `autoInjectIfMacroMissing: false`

这与 AIO 现有 VCP 渠道提示一致：VCP 渠道由后端接管工具调用，本地解析不重复执行。

## VCP 渠道推荐策略

用户导入 VCPChat Agent 时，模型选择应优先推荐 VCP 渠道。

参考 `src/tools/llm-chat/components/message-input/MiniToolCallingSettings.vue` 和 `src/tools/llm-chat/composables/useIsVcpChannel.ts`：

- 使用 `isSameHost(profile.baseUrl, vcpStore.config.wsUrl)`
- `localhost`、`127.0.0.1`、`::1` 视为同一回环地址
- 协议可不同，如 `http` 与 `ws`
- 显式端口必须一致

推荐顺序：

1. 优先找启用的、与 VCP `wsUrl` 同 host/port 的 LLM Profile
2. 若该 profile 内存在 VCPChat `model`，使用该模型
3. 若 VCP profile 存在但模型名不在该 profile 中，仍推荐该 profile，并默认选该 profile 第一个模型，让用户在预检弹窗里调整
4. 若无 VCP profile，再回落到现有模型匹配逻辑

## 输入格式支持

第一阶段主路径支持：

- 选择 VCPChat 根目录：扫描 `AppData/Agents/<agentId>/config.json`
- 在扫描列表中选择一个或多个 Agent 后批量导入
- 自动读取每个选中 Agent 的头像（Agent 目录优先，`AppData/avatarimage` 兜底）与同目录 `regex_rules.json`

兼容路径支持：

- 直接导入 VCPChat `config.json`
- 拖拽 `.json`

VCPChat 未发现官方 Agent zip 导出格式。浏览器 File API 无法从单个 `config.json` 自动读取同级头像，所以裸 JSON 导入只导入配置；需要头像和正则时使用目录导入。

Tauri 目录导入不受浏览器 File API 的同级文件限制，应优先作为推荐入口。

## 导入交互设计

### 入口

`AgentsSidebar.vue` 的“更多”菜单建议拆分为：

- 导入智能体...
- 从 VCPChat 导入...
- 导入酒馆角色卡...
- 从剪贴板导入

点击“从 VCPChat 导入...”后：

1. 打开目录选择器，标题为“选择 VCPChat 根目录”。
2. 默认不假设路径；如果后续做最近路径记忆，只存储用户最后一次成功选择的目录。
3. 用户取消时不报错。
4. 选择后立即扫描并打开 `VcpChatAgentImportDialog.vue`。

### 扫描选择弹窗

弹窗应包含：

- 顶部摘要：根目录、扫描到的 Agent 总数、可导入数量、异常数量。
- 搜索框：按名称、`vcpAgentId`、模型过滤。
- 批量操作：全选可导入项、反选当前筛选结果、清空选择。
- Agent 列表：每行包含头像缩略图、名称、目录 ID、模型、提示词模式、是否包含正则、是否包含头像、告警。
- 底部操作：取消、重新选择目录、导入选中项。

交互约束：

- 解析失败或缺少 `name` 的项默认不可选；如果可以从目录名兜底名称，则允许导入但显示告警。
- 默认全选可导入项，方便批量迁移。
- 点击“导入选中项”后，把选中项转换为现有 `AgentImportPreflightResult`，再打开 `ImportAgentDialog.vue`。
- `ImportAgentDialog.vue` 继续负责最终模型确认和提交，不在扫描弹窗里重复实现模型选择器。

### 多选导入的数据桥接

目录导入需要把每个选中 Agent 的资源按临时 Agent ID 隔离，并通过统一 `ParsedAgentImportBundle` 交给通用预检入口：

```ts
{
  agents: ExportableAgent[];
  assets: Record<tempAgentId, Record<"assets/avatar.png" | string, ArrayBuffer>>;
  sourceMeta: Record<tempAgentId, AgentImportSourceMeta>;
  modelRecommendations: Record<tempAgentId, AgentImportModelRecommendation>;
}
```

转换阶段为每个 VCPChat Agent 创建独立临时 ID，并只把该目录下的头像和正则资产放入对应桶。不能把一个目录扫描中读取到的资源共享给所有 Agent。

### 预检弹窗优化

现有 `ImportAgentDialog.vue` 继续作为最终确认入口，但需要从“简单确认列表”升级为适合批量导入的确认面板。VCPChat 不在扫描弹窗里重复实现模型选择器，而是把推荐信息传给预检弹窗展示和初始化。

建议优化项：

- 列表紧凑化：每个 Agent 用一行或可展开行展示名称、来源、模型状态、资源数量、正则/世界书状态，不再只依赖大块 `ElDescriptions`。
- 来源展示：显示 `VCPChat`、原始目录 ID、原始路径提示，便于用户确认迁移来源。
- 问题筛选：支持“仅显示问题项”，包括模型不匹配、名称冲突、资源读取告警、世界书冲突。
- 批量模型操作：支持将某个 profile/model 应用到全部或当前筛选项。
- 推荐理由：如果命中 VCP profile，显示“已按 VCP 连接推荐”；如果只是模型名精确匹配，显示“按模型名匹配”；如果回退默认模型，明确标注。
- 资产摘要：显示头像、正则、随包资源数量，不在预检弹窗展开 VCPChat 扫描细节。
- 世界书选项保留：继续复用现有随包/内嵌世界书导入选择。

模型初始化优先级调整为：

1. 如果 `modelRecommendations[tempAgentId]` 存在且 profile/model 可用，优先使用推荐值。
2. 否则按现有模型 ID 精确匹配逻辑处理。
3. 仍找不到时回退到第一个可用 profile/model，并保留问题状态供用户确认。

### 侧栏入口收敛

`AgentsSidebar.vue` 当前已经包含普通文件、拖拽、剪贴板、酒馆卡、导出和世界书入口。新增 VCPChat 后建议同步抽出导入流程 composable，降低侧栏组件负担。

建议新增：

- `src/tools/llm-chat/composables/agent/useAgentImportFlow.ts`

职责：

- 管理普通导入、酒馆卡导入、剪贴板导入、VCPChat 导入的 loading 和 dialog 状态。
- 封装 `preflightImportAgents` / `preflightParsedAgentImportBundle` 调用。
- 封装 `confirmImportAgents`。
- `AgentsSidebar.vue` 只保留菜单点击和弹窗挂载。

## 施工步骤

1. 增加通用 `ParsedAgentImportBundle` 类型、`sourceMeta`、`modelRecommendations`，并扩展 `AgentImportPreflightResult`。
2. 在 `agentImportService.ts` 增加“已解析导入包”预检入口：
   - 保留 `preflightImportAgents(files, context)` 作为文件入口。
   - 新增 `preflightParsedAgentImportBundle(bundle, context)` 或同等命名函数。
   - 抽出名称冲突、模型不匹配、世界书冲突等共享 helper。
3. 新增 `vcpChatAgentImportService.ts`：
   - 定义 VCPChat config 类型和识别逻辑。
   - 实现 `config.json` -> `ExportableAgent` 转换函数。
   - 实现 VCPChat 正则、提示词、参数、工具调用配置映射。
4. 增加 VCPChat 目录扫描能力：
   - 识别用户选择的是根目录、`Agents` 目录还是手动角色集合目录。
   - 只扫描第一层 Agent 目录。
   - 读取 `config.json`、Agent 目录头像、`AppData/avatarimage` 集中头像候选和 `regex_rules.json` 元信息。
   - 优先使用 `@tauri-apps/plugin-fs` 和已有文件 command；仅在实测不足时新增 Rust command。
5. 新增 `VcpChatAgentImportDialog.vue`：
   - 展示扫描结果。
   - 支持搜索、全选、反选、清空、单选/多选。
   - 默认选中所有可导入 Agent。
6. 在 `AgentsSidebar.vue` 增加“从 VCPChat 导入...”入口，使用 Tauri 目录选择器。
7. 可选但推荐：抽出 `useAgentImportFlow.ts`，收敛侧栏导入相关状态和动作。
8. 将用户选中的扫描项批量转换为 `ParsedAgentImportBundle`，进入通用预检入口，再复用 `ImportAgentDialog.vue`。
9. 优化 `ImportAgentDialog.vue`：
   - 支持来源信息展示。
   - 支持推荐 profile/model 初始化。
   - 支持问题项筛选和批量模型应用。
   - 保留现有世界书导入选项。
10. 放宽侧栏普通文件导入选择器，允许直接选择普通 `.json` 作为 VCPChat `config.json`。
11. 明确不增加 VCPChat zip 导入入口；AIO 自身 `.agent.zip` 导入继续走原有格式。
12. 运行 `bun run build:tsc` 做前端类型验证。

## 验收标准

- 用户可以从“更多 -> 从 VCPChat 导入...”选择 VCPChat 根目录。
- 选择根目录后可以扫描 `AppData/Agents` 并展示 Agent 列表。
- 扫描列表支持搜索、全选、反选、清空、单选和多选。
- 用户可以只导入选中的部分 Agent。
- VCPChat `config.json` 可以被识别为可导入 Agent。
- 导入后的角色提示词出现在 AIO `presetMessages` 中。
- VCPChat 模型参数落入 AIO `parameters`。
- VCPChat 正则规则进入 AIO `regexConfig`。
- 目录导入中的 `avatar.*` 被作为导入资产迁移。
- VCP channel profile 存在时，预检弹窗默认选中 VCP profile。
- 预检弹窗能展示导入来源、推荐理由、资源摘要，并能筛选问题项。
- 批量导入时可以对当前导入项批量应用 profile/model。
- 不读取、不写入、不迁移 VCPChat `UserData/topics/history.json`。
- 扫描失败、单个 Agent 解析失败、无可导入项、用户取消目录选择都有明确提示，不产生半导入状态。
- VCPChat 扫描和转换逻辑不内联到 `agentImportService.ts` 的普通文件解析分支。
- VCPChat 最终提交仍通过统一 `commitImportAgents` 完成，不新增平行持久化路径。

## 施工记录

### 2026-06-15 实施记录

- 已新增 `ParsedAgentImportBundle`、来源元信息和模型推荐类型，并在 `agentImportService.ts` 中新增 `preflightParsedAgentImportBundle()`，普通文件导入和 VCPChat 目录导入都复用同一预检与 `commitImportAgents()` 提交流程。
- 已新增 `vcpChatAgentImportService.ts`，集中处理 VCPChat 根目录识别、第一层 Agent 扫描、提示词/参数/正则/头像映射和 VCP profile 推荐；未新增 Rust command，当前 `@tauri-apps/plugin-fs` 足够完成目录读取。
- 已新增 `VcpChatAgentImportDialog.vue`，支持扫描结果摘要、搜索、全选当前、反选当前、清空、单选/多选，并默认选中可导入项。
- 已在 `AgentsSidebar.vue` 的“更多”菜单加入“从 VCPChat 导入...”，并放宽普通导入文件选择器，允许选择 `.json` 作为 VCPChat 裸配置兼容入口；AIO 自身 `.agent.zip` 导入保持原路径。
- 已增强 `ImportAgentDialog.vue`，支持展示来源、来源告警、资源数量、模型推荐理由、仅显示问题项，以及把模型选择批量应用到当前筛选列表。
- 与计划差异：暂未抽出 `useAgentImportFlow.ts`。本次先保持侧栏局部接入，避免在同一阶段重排普通导入、酒馆卡、剪贴板、导出和世界书入口的大量状态；后续如果继续扩展导入源，再单独收敛 composable。
- 与计划差异：早期实现中曾加入 zip 探测，识别包内第一个 `config.json`，并读取同目录 `avatar.*` / `regex_rules.json`。复核 VCPChat 后确认这不是 VCPChat 官方 Agent 导出格式，更接近用户手动打包单 Agent 目录或 VCPChat 整体备份包片段；现已移除该过度兼容分支。
- 与计划差异：裸 `config.json` 导入会保留来源告警，明确无法通过浏览器 File API 自动读取同级头像和 `regex_rules.json`；需要完整资源时应使用目录导入。
- 已运行 `bun run build:tsc`，前端类型检查通过。尚未启动真实 Tauri 窗口做 WebView 运行态验证。
