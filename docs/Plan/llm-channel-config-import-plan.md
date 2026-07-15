# LLM 渠道多格式配置导入与创建交互改造计划

> 状态：已实施
>
> 编制日期：2026-07-15
>
> 影响范围：桌面端 LLM 渠道设置、配置解析工具及相关测试

## 1. 背景

当前桌面端 LLM 渠道创建弹窗以渠道预设为主体，并在标题区域提供“从 curl 导入”按钮。点击后会再打开一层 `CurlImportDialog`，由 `parseCurlCommand()` 解析单条 curl 命令，再把单个解析结果写入渠道编辑表单。

现有方案存在以下限制：

- 预设创建和配置导入不是同级入口，导入需要打开第二层对话框。
- 导入能力与 curl 格式绑定，无法覆盖 Claude Code、Gemini CLI、Codex、Grok CLI、OpenCode 等常见客户端配置。
- 解析结果只能表达一个渠道和一个模型，无法表达 OpenCode 多 provider 或 Antigravity 双协议配置。
- Codex 的 `config.toml` 与 `auth.json` 分离，现有单文本、单结果契约无法安全关联地址与密钥。
- 当前 curl 解析、表单填充和 UI 预览紧密耦合，继续追加格式会形成条件分支堆积。

本计划将渠道创建弹窗改造成两个同级创建区域，并建立可扩展的多格式配置解析层。

## 2. 调研基线

### 2.1. AIO Hub 当前实现

- `src/views/Settings/llm-service/components/CreateProfileDialog.vue`
  - 展示渠道预设。
  - 通过按钮打开 `CurlImportDialog`。
  - 对外发出 `create-from-preset`、`create-from-blank` 和 `create-from-curl` 事件。
- `src/views/Settings/llm-service/components/CurlImportDialog.vue`
  - 提供单个 curl 文本框、实时解析和单结果预览。
- `src/utils/parseCurlCommand.ts`
  - 使用正则提取 URL、Header、Body、模型和 API Key。
  - 返回 `ParsedCurlResult` 单结果。
- `src/views/Settings/llm-service/LlmServiceSettings.vue`
  - `applyCurlResult()` 把解析结果写入当前 `editForm`。
  - 创建导入会先调用 `createNewProfile()`，该函数会立即保存一个空白渠道，然后再覆盖字段。

项目已依赖 `smol-toml`，JSON 可使用原生结构化解析，因此 TOML 和 JSON 不需要自行实现语法解析器。

### 2.2. Sub2API 配置样本

本次调研基于 `Wei-Shaw/sub2api` 的 `d515c3045ce838976ebedab87846aaaf893dbbf6` 提交，主要参考 `frontend/src/components/keys/UseKeyModal.vue`。

| 平台        | 客户端配置             | 主要字段                                                                       |
| ----------- | ---------------------- | ------------------------------------------------------------------------------ |
| Anthropic   | Claude Code 环境变量   | `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`                                   |
| Anthropic   | Claude `settings.json` | `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_AUTH_TOKEN`                           |
| OpenAI      | Codex `config.toml`    | `model_provider`、`model_providers.*.base_url`、`wire_api`                     |
| OpenAI      | Codex `auth.json`      | `OPENAI_API_KEY`                                                               |
| OpenAI      | Codex WebSocket        | `supports_websockets`、`responses_websockets_v2`                               |
| Gemini      | Gemini CLI 环境变量    | `GOOGLE_GEMINI_BASE_URL`、`GEMINI_API_KEY`、`GEMINI_MODEL`                     |
| Grok        | Grok CLI `config.toml` | `model.*.base_url`、`api_key`、`api_backend = "responses"`                     |
| 多平台      | OpenCode JSON          | `provider.*.options.baseURL`、`provider.*.options.apiKey`、`provider.*.models` |
| Antigravity | Claude/Gemini 配置     | `/antigravity/v1` 或 `/antigravity/v1beta` 路径                                |

Sub2API 使用 LGPL-3.0。本项目只依据公开配置格式重新实现解析规则，不复制其组件源码。

## 3. 目标与非目标

### 3.1. 目标

1. 将渠道创建弹窗改为“渠道预设”和“粘贴导入”两个同级区域。
2. 粘贴导入区域提供“自动检测、cURL、环境变量、JSON、TOML”格式 Tab，默认选择自动检测。
3. 建立与 UI 解耦的多格式解析入口，允许返回一个或多个候选渠道。
4. 复用现有 curl 能力，并补充 Claude Code、Gemini CLI、Codex、Grok CLI 和 OpenCode 配置解析。
5. 在写入配置前展示可检查的候选渠道、识别来源、警告及缺失字段。
6. 创建态支持选择一个或多个候选；编辑态复用同一解析面板，但只允许选择一个候选覆盖当前渠道。
7. 保留渠道创建后的现有编辑、模型元数据补全、连接测试和自动保存能力。

### 3.2. 非目标

- 不读取用户主目录中的 Claude、Codex、Grok 或 OpenCode 配置文件；首期只处理用户主动粘贴或选择的内容。
- 不执行粘贴的 shell、PowerShell、JavaScript 或 curl 命令。
- 不根据导入配置自动发起网络请求或探测模型。
- 不把 OpenCode 的所有客户端专有参数无条件映射进 `LlmProfile.options`。
- 不修改移动端 LLM 渠道创建交互；解析核心保持纯 TypeScript，以便后续按需复用。
- 不在本阶段引入新的模型元数据运行时兜底逻辑。

## 4. 交互方案

### 4.1. 创建弹窗一级切换

`CreateProfileDialog` 顶部增加稳定尺寸的分段控制：

- `渠道预设`
- `粘贴导入`

默认选择 `渠道预设`，保留现有预设分类、预设网格和“从空白创建”操作。移除预设区域中的“从 curl 导入”按钮，不再从创建弹窗打开第二层导入对话框。

切换创建方式时保留当前粘贴内容和解析结果，关闭整个创建弹窗时再统一清理临时状态。重新打开弹窗时回到 `渠道预设` 和 `自动检测`，避免上次导入内容意外残留。

### 4.2. 粘贴导入格式 Tab

粘贴导入区域提供以下 Tab：

| Tab      | 行为                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 自动检测 | 运行全部已注册检测器，综合结构特征和解析结果评分                             |
| cURL     | 仅运行 curl 解析器，保留现有多行续行符支持                                   |
| 环境变量 | 解析 Unix `export`、Windows CMD `set`、PowerShell `$env:` 和普通 dotenv 赋值 |
| JSON     | 解析 OpenCode、Claude settings、Codex auth 等 JSON 结构                      |
| TOML     | 解析 Codex 和 Grok CLI TOML 结构                                             |

手动选择格式只限定解析器，不改变最终渠道类型。手动格式解析失败时显示该格式的具体错误，不再回退到其他格式。

### 4.3. 输入区域

首期输入区域包含：

- 一个等宽字体多行文本框。
- 粘贴图标按钮。
- 选择配置文件按钮，支持一次选择多个文本配置文件。
- 已选文件的紧凑列表，可单独移除。
- 清空按钮。

文本框内容作为一个匿名输入文档，选择的每个文件作为独立命名文档。解析核心统一接收 `documents[]`，以便通过 `config.toml`、`auth.json` 等文件名安全配对。不得通过读取本机默认配置目录隐式收集密钥。

自动检测模式也支持把 `config.toml` 与 `auth.json` 前后粘贴到同一个文本框。实现会识别直接拼接的完整 JSON 根对象，或按 `config.toml` / `auth.json` 标题和 Markdown 代码围栏拆成仅存在于本次解析会话的虚拟文档；手动格式模式不执行跨格式拆分。

解析使用短防抖，目标为 200 至 300ms。输入为空时不展示错误。

### 4.4. 解析结果预览

解析成功后展示候选渠道列表。每个候选至少展示：

- 是否选中。
- 建议渠道名称。
- 推断的渠道类型。
- Base URL。
- 掩码后的 API Key 状态。
- 模型数量或模型 ID 摘要。
- 识别来源和置信度。
- 候选级警告。

行为约束：

- 单候选默认选中。
- 多候选由用户勾选；不得静默丢弃额外 provider。
- 缺少 Base URL 的候选不可导入。
- 缺少 API Key 的候选允许导入，但必须明确提示导入后补充。
- 检测结果置信度低或协议存在歧义时，渠道类型允许在预览中手动修正。
- 已存在相同 `providerType + normalizedBaseUrl` 的渠道时给出重复警告，不自动覆盖。
- 原始密钥不得出现在错误文本、日志或候选摘要中。

创建态允许勾选多个候选并批量创建；编辑态使用单选，确认后覆盖当前渠道的可映射字段。编辑态不得清空解析结果中未提供的现有 Key、模型或自定义 Header，除非界面提供并由用户明确开启“清空未提供字段”。

### 4.5. 响应式布局

- 宽屏下输入区与结果区可以左右分栏。
- 窄屏和较窄设置容器下改为上下排列。
- 分段控制、格式 Tab、输入工具栏和确认按钮必须保持稳定高度，解析状态变化不得引起主要控件跳动。
- 候选名称、URL 和模型 ID 使用换行或省略展示，不得溢出容器。

## 5. 解析核心设计

### 5.1. 建议目录

```text
src/utils/llm-config-import/
├── index.ts
├── types.ts
├── detector.ts
├── normalize.ts
├── parsers/
│   ├── curl.ts
│   ├── env.ts
│   ├── json.ts
│   └── toml.ts
└── __tests__/
    └── fixtures/
```

`parseCurlCommand.ts` 首期可以保留，由 `parsers/curl.ts` 适配到统一结果；完成差分测试后再决定是否把通用 URL、Key 和占位符逻辑迁入共享模块。

### 5.2. 统一接口草案

```ts
export type LlmConfigImportFormat = "auto" | "curl" | "env" | "json" | "toml";

export interface LlmConfigImportDocument {
  id: string;
  name?: string;
  content: string;
}

export interface ParsedLlmProfileDraft {
  id: string;
  suggestedName: string;
  providerType: ProviderType;
  baseUrl: string;
  apiKeys: string[];
  models: Array<{ id: string; name?: string }>;
  customHeaders?: Record<string, string>;
  customEndpoints?: LlmProfile["customEndpoints"];
  options?: Record<string, unknown>;
  sourceKind: string;
  sourceDocumentIds: string[];
  confidence: "high" | "medium" | "low";
  warnings: LlmConfigImportDiagnostic[];
}

export interface LlmConfigImportResult {
  detectedFormat: Exclude<LlmConfigImportFormat, "auto"> | null;
  profiles: ParsedLlmProfileDraft[];
  diagnostics: LlmConfigImportDiagnostic[];
}

export function parseLlmChannelConfig(
  documents: LlmConfigImportDocument[],
  format?: LlmConfigImportFormat
): LlmConfigImportResult;
```

解析器必须是纯函数，不访问 Pinia、Vue、剪贴板、文件系统、网络或持久化配置。

### 5.3. 自动检测策略

自动检测不能简单采用“第一个语法解析成功”的策略。JSON、TOML 和环境变量解析器应分别返回结构命中分数，检测器再综合选择。

建议优先识别强特征：

1. `curl` 命令前缀以及 `-H`、`--data` 等参数。
2. JSON 中的 `provider.*.options.baseURL`、`env.ANTHROPIC_BASE_URL`、`OPENAI_API_KEY`。
3. TOML 中的 `model_providers.*`、`wire_api`、`api_backend`、`[model.*]`。
4. 环境变量中的已知 Base URL 与 Key 变量组合。
5. 只有 URL 或 Key、没有协议特征的输入不得以高置信度生成渠道。

如果多个解析器都得到有效结果：

- 选择结构特征更强、必要字段更完整的结果。
- 分数接近时保留低置信度并提示用户手动选择格式。
- 不合并来自互不关联文档的 Key 和 Base URL。

### 5.4. 格式解析规则

#### cURL

- 复用现有 URL、Header、Body、模型和自定义 Header 提取行为。
- 支持 Unix、CMD 和 PowerShell 多行续行符。
- 识别 `Authorization: Bearer`、`x-api-key` 和 Gemini 常见 Key Header。
- 保留非标准端点，但不要把标准 `/messages`、`/responses` 或 `/chat/completions` 重复拼入 Base URL。

#### 环境变量

- 支持 `export KEY=value`、`set KEY=value`、`$env:KEY=value` 和 `KEY=value`。
- 处理单引号、双引号和无引号值，不执行变量展开。
- Claude：`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`。
- Gemini：`GOOGLE_GEMINI_BASE_URL` + `GEMINI_API_KEY`，可读取 `GEMINI_MODEL`。
- OpenAI：`OPENAI_BASE_URL` 或兼容别名 + `OPENAI_API_KEY`。
- 过滤 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 等客户端行为变量，不写入渠道自定义 Header。

#### JSON

- 使用 `JSON.parse()`，不使用字符串截取模拟 JSON 解析。
- OpenCode：遍历 `provider`，每个包含可用 `options.baseURL` 的 provider 生成独立候选。
- Claude settings：读取 `env` 下的 Anthropic 字段。
- Codex auth：读取 `OPENAI_API_KEY`，作为可与唯一 Codex TOML 候选配对的凭据文档。
- OpenCode `models` 只导入模型 ID 和可用名称，能力、限制和媒体参数仍通过 AIO 模型元数据流程补全。
- 未明确映射的客户端专有字段保留为诊断信息，不直接写入 `LlmProfile.options`。

#### TOML

- 使用 `smol-toml` 结构化解析。
- Codex：读取顶层 `model`、`review_model`、`model_provider` 及对应 `model_providers.*`。
- `wire_api = "responses"` 映射为 `openai-responses`。
- Grok：读取 `[model.*]` 下的 `model`、`base_url`、`api_key` 和 `api_backend`。
- `api_backend = "responses"` 映射为 `openai-responses`，不能仅因模型名包含 Grok 就机械映射成 AIO 的 `xai`。
- WebSocket 标记作为来源信息和警告保留；AIO 当前没有对应渠道开关时不得伪造支持项。

### 5.5. 多文档关联

多文档配对遵循显式、保守原则：

- 同批输入中只有一个 Codex TOML 候选和一个 `auth.json` 时允许自动配对。
- 文件名为 `config.toml`、`auth.json`、`settings.json`、`opencode.json` 时提高对应结构置信度，但文件名不能替代内容校验。
- 存在多个可能的 Codex provider 或多个 Auth Key 时不自动交叉配对，生成警告并要求用户选择。
- 一个 OpenCode JSON 内的每个 provider 独立生成候选，不共享 Key，除非配置结构明确引用同一值。
- 文档之间的关联信息只存在于本次解析会话，不持久化原始文件内容。

## 6. 渠道类型与 URL 映射

### 6.1. 类型映射

| 配置特征                                  | AIO ProviderType                | 说明                                 |
| ----------------------------------------- | ------------------------------- | ------------------------------------ |
| Anthropic 环境变量或 OpenCode `anthropic` | `claude`                        | 使用 Anthropic Messages 适配器       |
| Gemini 环境变量或 OpenCode `gemini`       | `gemini`                        | 使用 Gemini 原生适配器               |
| Codex `wire_api = "responses"`            | `openai-responses`              | 明确为 Responses API                 |
| Grok `api_backend = "responses"`          | `openai-responses`              | 不能映射为 Chat Completions 型 `xai` |
| OpenCode `grok` + `@ai-sdk/openai`        | 默认低置信度 `openai-responses` | 允许用户在预览中修正                 |
| 普通 OpenCode `openai`                    | 根据强特征推断，否则低置信度    | 不应仅凭 provider 名强制选择协议     |
| Antigravity Claude                        | `claude`                        | 保留 `/antigravity` 路径前缀         |
| Antigravity Gemini                        | `gemini`                        | 保留 `/antigravity` 路径前缀         |

### 6.2. URL 规范化

- 去除首尾空白和无语义的末尾 `/`。
- 保留显式的 `/v1`、`/v1beta`、`/antigravity` 以及其他代理路径前缀。
- 只在输入是完整请求端点时剥离末端资源路径，例如 `/messages`、`/responses`、`/chat/completions`。
- 不把包含 `/v1` 字符串但并非版本段的路径误判为已版本化。
- URL 规范化结果必须与 `buildLlmApiUrl()` 的自动补全行为做契约测试，避免产生重复 `/v1/v1` 或丢失代理前缀。
- 无法用 `URL` 解析的值不得静默降级为可导入候选。

## 7. 应用集成

### 7.1. 组件调整

建议新增：

- `ConfigImportPanel.vue`：格式 Tab、输入文档、解析状态和候选预览。
- `ConfigImportDialog.vue`：仅作为编辑页面复用面板的对话框外壳。

建议修改：

- `CreateProfileDialog.vue`
  - 内嵌 `ConfigImportPanel`。
  - 将 `create-from-curl` 改为 `create-from-config`。
  - 移除嵌套 `CurlImportDialog`。
- `LlmServiceSettings.vue`
  - 用通用 `applyImportedProfileDraft()` 取代 `applyCurlResult()`。
  - 创建态接收一个或多个选中候选。
  - 编辑态继续保留 Base URL 旁的导入入口，但改用 `ConfigImportDialog`。
- `CurlImportDialog.vue`
  - 新面板完成创建态和编辑态接线后删除，避免长期保留两套导入 UI。

### 7.2. 创建写入顺序

现有 `createNewProfile()` 会立即保存空白渠道。配置导入不应先持久化空白项再覆盖，建议增加专用创建入口：

```ts
createProfilesFromImport(drafts: ParsedLlmProfileDraft[]): LlmProfile[]
```

该入口应：

1. 先在内存中完成字段映射和校验。
2. 为每个候选生成独立 ID。
3. 使用现有模型预设与 `getMatchedProperties()` 补全模型展示信息和能力。
4. 不从实时模型元数据规则补写运行时参数。
5. 校验全部可选候选后再逐个调用现有 `saveProfile()`。
6. 选择第一个新建渠道进入编辑状态，并给出批量创建结果提示。

单个候选失败不应导致其他候选被静默跳过。若当前持久化层不支持事务，创建前必须完成全部同步校验，并在保存异常时报告已完成与失败项。

### 7.3. 字段覆盖规则

创建态：

- 导入结果作为新渠道初始值。
- 未提供 Key 时使用空数组。
- 模型按 ID 去重后应用现有元数据补全。
- 自定义 Header 和端点只写入解析器明确识别出的字段。

编辑态：

- 名称、类型、Base URL 采用选中候选值。
- Key、模型、自定义 Header 和端点仅在候选提供对应字段时更新。
- 不默认删除现有字段。
- 覆盖前在预览中显示将修改的字段，不直接保存原始配置文本。

## 8. 安全与隐私约束

- 所有解析在本地完成，不上传原始配置。
- 不执行导入内容中的任何命令、脚本、变量替换或 URL。
- UI 中只显示掩码 Key，剪贴板输入框之外不再次显示完整密钥。
- logger、错误处理器和测试快照不得包含完整 Key 或原始配置全文。
- 解析异常只报告格式、位置和字段名，不拼接敏感值。
- 占位符 Key 不写入 `apiKeys`，包括 `${API_KEY}`、`YOUR_API_KEY`、`sk-xxxx` 等形式。
- 同一文档出现多个冲突 Key 时不自行选择，生成阻塞性诊断。

## 9. 测试计划

### 9.1. 解析器单元测试

至少覆盖：

- 现有 curl 单行与三种多行续行格式。
- Bearer、`x-api-key`、Gemini Key Header 和占位符。
- Claude Code 的 Unix、CMD、PowerShell 和 `settings.json`。
- Gemini CLI 的三种环境变量格式及 `GEMINI_MODEL`。
- Codex `config.toml` + `auth.json` 单独输入与成对输入。
- Codex WebSocket 配置不影响 Responses 类型识别。
- Grok TOML 的 `api_backend = "responses"` 映射。
- OpenCode 单 provider、多 provider、Antigravity 双 provider。
- `/v1`、`/v1beta`、`/antigravity`、自定义代理前缀和末端请求路径规范化。
- JSON/TOML 语法正确但结构无关时不产生候选。
- 自动检测冲突、低置信度和手动格式失败诊断。
- 多文件歧义时不错误配对 Key。
- 错误和诊断输出不泄露 Key。

### 9.2. 组件测试

- 创建弹窗默认进入渠道预设。
- 切换到粘贴导入时默认选择自动检测。
- 五个格式 Tab 正确约束解析模式。
- 切换一级创建方式时保留会话输入，关闭重开后清理。
- 单候选默认选中，多候选可选择且不会丢失。
- 缺 Base URL、缺 Key、重复渠道和低置信度状态正确显示。
- 编辑态只能选择一个候选，且未提供字段不会被清空。
- 宽屏和窄屏结构均无控件重叠或文本溢出。

### 9.3. 集成与回归

- 从预设和空白创建行为保持不变。
- curl 样本导入结果与改造前一致。
- 导入模型继续经过 AIO 模型元数据补全。
- 批量创建后渠道列表、选中项和持久化结果一致。
- 编辑态导入不会创建额外空白渠道。

实施完成后至少运行：

```text
bun run test:run
bun run check:frontend
bun run build
```

若全量测试耗时过长，可先运行相关 Vitest 文件，但最终确认前仍需运行桌面端 Vite 生产构建。

## 10. 实施阶段

### 阶段 1：冻结契约与样本

- 将现有 curl 行为转成固定测试样本。
- 增加 Sub2API 各种配置的脱敏 fixture。
- 定义统一输入文档、候选渠道和诊断类型。
- 明确 URL 规范化与渠道类型映射的预期结果。

完成标准：接口类型和 fixture 通过评审，尚未改动现有 UI 行为。

### 阶段 2：解析核心

- 实现格式检测器、规范化工具和四类解析器。
- 适配现有 curl 解析器。
- 实现多文档配对、占位符过滤和敏感信息保护。
- 完成解析器单元测试。

完成标准：所有目标样本可由纯函数解析，自动检测与手动格式结果一致或给出明确诊断。

### 阶段 3：创建弹窗交互

- 增加一级分段切换。
- 实现 `ConfigImportPanel` 的格式 Tab、输入区和候选预览。
- 接入粘贴与多文件选择。
- 完成响应式布局和组件测试。

完成标准：创建弹窗内不再嵌套打开 curl 对话框，所有导入操作在同一区域完成。

### 阶段 4：创建与编辑接线

- 增加导入专用 Profile 创建入口。
- 接入单候选与多候选创建。
- 将编辑页 curl 按钮迁移到通用配置导入对话框。
- 删除旧 `CurlImportDialog` 及 `create-from-curl` 事件链。
- 完成字段覆盖和重复渠道提示。

完成标准：创建与编辑共用同一解析核心和预览面板，不存在长期双实现。

### 阶段 5：验收与文档同步

- 运行相关单测、全量前端类型检查和 Vite 构建。
- 检查桌面宽屏与窄屏布局。
- 更新设置架构或用户说明中已过时的 curl 专用描述。
- 将实际实施偏差和最终验证结果回写本计划。

## 11. 验收标准

1. 用户打开添加渠道弹窗后，可以在“渠道预设”和“粘贴导入”间直接切换，不产生第二层创建对话框。
2. 粘贴导入默认使用自动检测，并可手动切换 cURL、环境变量、JSON、TOML。
3. 调研范围内的 Claude Code、Gemini CLI、Codex、Grok CLI 和 OpenCode 配置均可生成正确候选。
4. OpenCode 多 provider 不被压缩成单个渠道，Codex 分离文件不会错误配对。
5. Responses、Claude、Gemini 和 Antigravity 路径映射与 AIO 请求适配器一致。
6. 解析失败、缺失 Key、类型歧义和重复渠道均有可操作反馈。
7. 导入过程不执行配置内容、不发起网络请求、不在日志中暴露密钥。
8. 现有预设创建、空白创建和 curl 导入结果无行为回归。
9. 相关单元测试、前端类型检查和桌面端 Vite 生产构建通过。

## 12. 风险与待施工验证项

- OpenCode `provider.openai` 本身不总能证明使用 Chat Completions 还是 Responses；缺乏强特征时必须保留低置信度和人工修正入口。
- 当前 Profile 创建函数会立即保存空白项，批量导入前需要先收束创建顺序，避免产生半成品渠道。
- 多文件选择依赖 Tauri/WebView 文件输入实际行为，需要在真实桌面窗口验证；普通浏览器只能验证纯前端布局和解析逻辑。
- `buildLlmApiUrl()` 当前通过字符串包含判断版本路径，导入更多带前缀 URL 后应以契约测试确认是否需要同步增强，但不要在本任务中顺手重构无关 URL 行为。
- 从 OpenCode 导入模型时只接受稳定字段；客户端专有模型限制与 AIO 元数据不一致时，以 AIO 模型对象和现有元数据流程为准。

## 13. 实施结果

> 完成日期：2026-07-15

已完成：

- 新增 `src/utils/llm-config-import/` 纯 TypeScript 解析层，包含统一契约、自动检测、URL/Key 规范化、cURL/环境变量/JSON/TOML 解析器和 Codex 多文档保守配对；支持从同一输入框拆分直接拼接或带文件名标题的 `config.toml` + `auth.json`。
- `CreateProfileDialog` 已改为“渠道预设/粘贴导入”同级入口；新增 `ConfigImportPanel` 和编辑态 `ConfigImportDialog`，支持剪贴板、多文件、候选预览、类型修正、重复提示和创建态多选/编辑态单选。
- 新增导入专用批量创建路径。所有候选先完成同步映射和校验，再逐个等待 `saveProfile()`；保存失败会报告完成/失败数量并清理失败候选的内存项。
- 编辑态只覆盖候选明确提供的 Key、模型、自定义 Header、端点和 options，未提供字段保持不变。
- 删除旧 `CurlImportDialog`、`create-from-curl` 和 `applyCurlResult()` 事件链；现有 `parseCurlCommand.ts` 作为统一 cURL 解析器的底层适配继续保留。
- 用户指南和设置架构说明已同步更新。

与原计划的微小偏差：

- 脱敏样本直接内联在 Vitest 用例中，没有单独建立 fixtures 目录，便于在单文件中同时审查输入与断言。
- UI 使用项目已有 `el-segmented` 表达创建方式和格式模式，符合稳定尺寸要求，不另行引入 Tabs 组件。

自动验证结果：

- `bun run lint`：通过；仅有 `src/utils/mermaidFixer.ts` 中 4 条既有不可达代码警告，与本次改动无关。
- `bun run test:run`：通过，75 个测试文件、505 个测试全部成功。
- `bun run check:frontend`：通过。
- `bun run build`：通过，TypeScript 检查与 Vite 生产构建成功；保留仓库既有依赖外部化、无效动态导入和大 chunk 警告。

仍需人工确认：

- 多文件选择依赖真实 Tauri/WebView 文件对话框，本轮未在交互式桌面窗口中人工选择文件。
- 宽屏/窄屏响应式规则和组件状态已通过代码与组件测试检查，最终视觉观感仍建议在真实 Tauri 窗口中各确认一次。
