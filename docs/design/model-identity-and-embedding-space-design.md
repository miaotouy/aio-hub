# 模型身份与 Embedding 空间设计

- **状态**：调查与设计补全，待实施
- **创建日期**：2026-07-18
- **适用范围**：桌面端与移动端渠道模型配置、模型发现、模型元数据、Embedding 调用、Embedding 测试场、Knowledge 语义索引
- **明确不包含**：容灾组、自动跨渠道重试、负载均衡、渠道健康调度

## 1. 问题与目标

AIO Hub 当前使用 `profileId:modelId` 表示一个可调用模型。这个值能精确定位渠道和请求参数，但不能回答“不同渠道中的两个条目是否代表同一个模型产品”。Knowledge 又把它直接作为向量分区键，导致同一个 Embedding 模型经不同渠道提供时无法复用已有向量。

本设计解决两个问题：

1. 为渠道内模型增加独立、稳定、可由用户确认的实际模型身份。
2. 为 Knowledge 建立比模型产品身份更严格的 Embedding 空间身份。

设计完成后仍由用户显式选择调用渠道。系统只识别和展示等价关系，不自动选择备用渠道。

## 2. 现状调查

### 2.1 渠道是持久化和调用边界

桌面端通过 `useLlmProfiles()` 将 `LlmProfile[]` 保存到 `llm-service/profiles.json`；移动端有独立的 `llmProfiles` Store 和 `llm_profiles.json`。两端的基本结构相同：

```text
LlmProfile
  id                 渠道实例 UUID
  type               API 协议/适配器类型
  baseUrl, apiKeys   连接配置
  models[]           该渠道可调用的模型条目
```

`profile.type` 表示 API 格式或适配器类型，不等于模型开发商。大量聚合渠道使用 `openai-compatible`，Azure、Vertex AI 等托管渠道也不能据此判断实际模型归属。

### 2.2 `LlmModelInfo.id` 是路由模型 ID

`LlmModelInfo.id` 会原样进入 API 请求。例如同一个模型可能在不同渠道分别暴露为：

```text
text-embedding-3-small
openai/text-embedding-3-small
azure-embedding-production
```

这些值是渠道路由参数，不是跨渠道身份。

当前模型选择器拼接 `${profile.id}:${model.id}`，`modelIdUtils` 按第一个冒号拆分。这个组合值可以继续用于 UI 选中值和显式路由，但不能再命名或使用为“模型身份”。

### 2.3 现有 `model.provider` 不能复用

`LlmModelInfo.provider` 当前主要用于图标、分组和模型元数据匹配，其数据来源不统一：

- OpenAI 风格模型列表可能写入 API 返回的 `owned_by`。
- Claude、Gemini、Cohere 等解析器写入协议提供商。
- SiliconFlow 适配会写入 `siliconflow`。
- DeepInfra、ModelScope、Azure 预设中的模型通常写入托管平台，而不是原始模型开发商。

因此 `provider + model.id` 不能作为真实模型身份，也不应改变 `provider` 的既有语义来承担该职责。

### 2.4 模型写入入口不止一个

模型条目可能来自：

1. 渠道预设的 `defaultModels`。
2. Provider `/models` 接口发现。
3. 配置导入。
4. 用户手工添加或编辑。
5. 用户点击“应用预设”或批量应用模型元数据。

当前 API 拉取只追加渠道中尚不存在的 `model.id`，不会刷新覆盖已有条目；模型编辑和 Profile 规范化会保留未知字段。这允许身份字段渐进加入，但五个写入入口必须使用同一套身份解析规则。

### 2.5 元数据规则不能作为运行时身份真源

模型元数据规则适合在创建、导入、刷新和应用预设时给模型对象填充属性。规则本身可被用户修改，且包含前缀、正则和多规则合并，不适合在 Knowledge 查询时实时决定严格相等关系。

模型身份一旦写入 `LlmModelInfo`，运行时必须只读取模型对象上的快照。规则变化不得让既有模型或既有向量静默改变身份。

### 2.6 Knowledge 当前混合了路由和向量空间

当前 Knowledge：

- 用 `profileId:modelId` 写入 `chunk_vectors.model_id`。
- 在 library manifest 的 `embedding_model_id` 中保存同一个值。
- 查询时解析这个值找到 Profile，并只搜索相同 `model_id` 的向量。

这避免了未知模型互相污染，但也把渠道变化错误地当成了向量空间变化。

### 2.7 现有两类探测能力的边界

渠道设置的 `channel-probe-service` 已支持 embedding capability probe，但当前计划只发送单个 `"hi"`，校验条件是至少返回一个非空、全为有限数值的向量，结果摘要只包含实际维度。它能证明 route 当时可调用，不能比较两个 route，也不包含重复噪声、任务类型或检索互换证据。

`embedding-playground` 已有多模型竞技场、单模型检索模拟、原始向量调试和余弦/点积/距离计算。多模型竞技场当前分别计算每个模型内部的相似度排行，没有计算 A 的 query 对 B 的 document vectors；检索模拟也只使用单 route。现有缓存为 `Map<ModelCombo, Map<TextContent, EmbeddingVector>>`，没有把维度、query/document task type 或 encoding 纳入键。这些能力可复用，但不能直接把现有“多模型结果相近”解释为空间可混用。

## 3. 核心概念

### 3.1 路由引用 `ModelRouteRef`

```ts
interface ModelRouteRef {
  profileId: string;
  modelId: string;
}
```

它回答“向哪个渠道发送哪个模型 ID”。现有 `profileId:modelId` 是它的字符串编码，建议新代码内部优先使用结构体，只在 UI 值和旧配置边界编码为字符串。

### 3.2 模型身份 `ModelIdentity`

```ts
type ModelIdentitySource = "builtin" | "provider" | "user";

interface ModelIdentity {
  canonicalId: string;
  revision?: string;
  source: ModelIdentitySource;
}
```

`canonicalId` 使用 `<developer>/<model>`：

```text
openai/text-embedding-3-small
google/gemini-embedding-001
baai/bge-m3
qwen/text-embedding-v4
```

`developer` 指原始模型开发商，不是 API 托管商、代理商或协议格式。`revision` 只在服务明确提供固定版本时填写，不能把不可信的更新时间当版本。

推荐把完整对象作为 `LlmModelInfo.modelIdentity?: ModelIdentity` 持久化，而不是只增加裸字符串。来源和版本是后续审计、修正与兼容判断所必需的上下文。

### 3.3 Embedding 空间描述 `EmbeddingSpaceDescriptor`

同一个模型产品也可能因为输出维度、任务类型或编码方式不同而产生不可复用向量。Knowledge 不能只比较 `canonicalId`。

```ts
interface EmbeddingSpaceDescriptorV1 {
  schemaVersion: 1;
  model: {
    canonicalId: string;
    revision?: string;
  };
  dimensions: number;
  queryTaskType?: EmbeddingTaskType;
  documentTaskType?: EmbeddingTaskType;
  encodingFormat: EmbeddingEncodingFormat;
  similarity: "cosine";
  adapterContractVersion: number;
}
```

`spaceId` 由规范化后的 descriptor 生成：

```text
spaceId = "emb:v1:" + sha256(stableJson(descriptor))
```

数据库必须同时保存 descriptor JSON，不能只保存不可解释的哈希。

`dimensions` 使用首批实际响应向量的维度完成最终确认。`queryTaskType` 和 `documentTaskType` 分开记录，因为 Gemini/Cohere 的检索查询与文档可以使用不同任务类型，但两者共同定义一个可检索空间。

`adapterContractVersion` 用于覆盖适配器新增前缀、标题拼接或其他会改变向量输入的行为。仅修改 HTTP 实现而不改变语义时不递增。

### 3.4 模型身份不承载“效果等价”

`canonicalId` 表示同一个模型产品，不是效果等级。两个不同产品即使维度相同、检索指标接近或在有限样本上 Top-K 相似，也必须保留不同 canonical ID。

若通过厂商声明或向量几何验证确认不同产品的 Embedding 空间可互操作，应在空间层增加显式、带证据的兼容关系，例如 `VerifiedEmbeddingSpaceAlias`，而不是把一个模型的 canonical ID 改写成另一个。第 11 节定义探针、证据和交互；首期可以先产出报告并供用户确认，Knowledge 消费空间别名放在身份与空间迁移完成后的独立阶段。

## 4. 不变量

实现必须遵守以下约束：

1. `profileId:modelId` 只表示路由，不表示模型产品或向量空间。
2. `model.id` 始终保持渠道 API 所需原值。
3. `model.provider` 保持现有展示与元数据匹配用途，不参与严格身份比较。
4. 只有非空、格式合法的 `modelIdentity.canonicalId` 才能参与跨渠道归并。
5. 没有模型身份时保持隔离，不按名称、维度或能力猜测相等。
6. 模型产品身份相等不自动推出 Embedding 空间相等。
7. `spaceId` 相等表示声明的模型与请求契约相同，不等于黑盒输出已经通过探针验证；Knowledge 跨 route 复用时必须展示“声明兼容”或“已验证兼容”的可信级别并由用户明确确认。
8. 不同 `spaceId` 未来只有在存在用户确认且未失效的兼容证据时才能通过空间别名复用。
9. 模型元数据和内置规则只在写入模型对象时提供建议或默认值，运行时不反查规则。
10. 当前阶段不根据身份自动切换渠道，不实现容灾组。

## 5. Canonical ID 规范

### 5.1 格式

`canonicalId` 是面向机器比较的稳定键，不承担显示名称职责：

```text
<developer-slug>/<model-slug>
```

规范化规则：

- 去除首尾空白。
- 将反斜杠转换为正斜杠。
- developer 和 model slug 转为小写。
- 必须且只能有一个分隔斜杠。
- 两段仅允许 ASCII 字母、数字、点、下划线和连字符。
- 禁止包含 Profile ID、Base URL、部署名或 API Key 相关信息。
- 固定修订号写入 `revision`，不拼进 `canonicalId`。

模型显示仍使用 `model.name`，所以规范化不会降低 UI 可读性。

### 5.2 同名模型

不同开发商下同名模型保持不同身份：

```text
vendor-a/embedding-v1 != vendor-b/embedding-v1
```

同一开发商在不同渠道中使用不同路由 ID，可以映射到同一身份：

```text
route A: text-embedding-3-small         -> openai/text-embedding-3-small
route B: openai/text-embedding-3-small  -> openai/text-embedding-3-small
route C: azure-embedding-production     -> openai/text-embedding-3-small
```

## 6. 身份解析与写入

### 6.1 解析结果分为事实和建议

```ts
interface ModelIdentitySuggestion {
  identity: ModelIdentity;
  confidence: "exact" | "suggested";
  evidence: string;
}
```

`ModelIdentitySuggestion` 是模型发现和编辑 UI 的临时数据，不等于已经持久化的身份。只有以下操作能写入 `model.modelIdentity`：

- 内置精确映射，`source = "builtin"`。
- 用户接受 Provider 建议，`source = "provider"`。
- 用户手工填写或修改，`source = "user"`。

### 6.2 优先级和覆盖规则

1. 已存在的 `source = "user"` 永不被自动覆盖。
2. 已存在的合法身份默认不被模型刷新覆盖。
3. 内置精确映射只能填充空身份；显式“重新应用身份预设”时才允许用户确认覆盖。
4. Provider 返回的 `owned_by`、publisher 或命名空间默认只生成建议。
5. `profile.type`、`baseUrl`、`model.provider`、模型显示名称和能力标签不得单独生成确定身份。
6. 前缀和正则模型元数据规则不得直接声明多个模型共享同一个固定 canonical ID。

### 6.3 内置身份目录与元数据预设的关系

身份相等具有比图标和能力更高的风险，不能把 `modelIdentity` 当作普通 `ModelMetadataProperties` 交给当前的前缀、正则、多规则合并链。身份预设属于模型元数据目录的一部分，但必须使用独立、只允许精确匹配的规则类型。

建议在 `@aiohub/llm-core` 中增加纯 TypeScript 的身份模块：

```text
packages/llm-core/src/model-identity/
  types.ts
  canonical-id.ts
  builtin-presets.ts
  resolver.ts
```

共享 Core 只提供纯类型、规范化、校验和内置精确预设，不读取 Vue、Pinia、Profile Store 或用户设置。桌面和移动 Facade 负责把建议写入各自的 `LlmModelInfo`。桌面元数据聚合入口将其独立导出为 `DEFAULT_MODEL_IDENTITY_PRESETS`，移动端从同一个 Core 导入，不能复制第二份列表。

```ts
interface ModelIdentityPresetRule {
  id: string;
  routeModelId: string;
  identity: Pick<ModelIdentity, "canonicalId" | "revision">;
  qualifiers?: {
    declaredOwners?: string[];
    routeNamespaces?: string[];
  };
  evidence: {
    kind: "vendor-doc" | "provider-catalog" | "maintainer-verified";
    reference: string;
    note?: string;
  };
}
```

约束如下：

- `routeModelId` 只能做大小写策略明确的完整值匹配，不支持 `modelPrefix`、正则或包含匹配。
- `qualifiers` 只能缩小匹配范围，不能单独产生身份。`profile.type`、Base URL 和现有 `model.provider` 不进入确定匹配条件。
- 自定义部署名（例如 Azure deployment name）没有可验证的内置精确映射时，只能生成建议或由用户填写。
- 每条内置规则必须带可审计证据；同一个 route ID 若出现冲突规则，目录构建直接失败，不能按优先级覆盖。
- 通用元数据规则仍负责图标、分组、能力和参数；Knowledge 等运行时消费者不得调用 `getActiveModelProperties()` 或身份预设解析器重新推导身份。

### 6.4 在元数据目录中增加身份预设的步骤

1. 在共享 Core 定义 `ModelIdentity`、`ModelIdentityPresetRule`、校验结果和建议结果；桌面与移动 `LlmModelInfo` 增加 `modelIdentity?: ModelIdentity`。
2. 新建 `builtin-presets.ts` 作为唯一数据源，并从桌面模型元数据聚合入口独立导出 `DEFAULT_MODEL_IDENTITY_PRESETS`。不要把它追加进 `DEFAULT_METADATA_RULES` 的普通合并数组。
3. 先为能从官方模型 ID 精确确认的条目建规则，例如 `text-embedding-3-small`、`openai/text-embedding-3-small` 分别映射到 `openai/text-embedding-3-small`；每个路由别名一条规则，共享 canonical ID。
4. 对 `gemini-embedding-001`、`text-embedding-v4` 等现有精确元数据规则补对应身份预设；现有 `capability-embedding`、`model-prefix-bge`、`model-prefix-text-embedding` 等宽泛规则只能继续补能力和展示信息，不得携带身份。
5. 目录加载时执行 schema 校验、canonical ID 规范化、重复 ID 检查、同 route 冲突检查和证据字段检查。校验失败应使该身份目录构建失败并给出诊断，不能静默丢弃后继续归并。
6. 在统一的模型物化入口增加字段映射：仅当模型身份为空时把 exact builtin 写为 `source = "builtin"`；Provider 证据写成待确认建议；用户输入写为 `source = "user"`。
7. 渠道预设、API 模型发现、配置导入、手工添加、应用预设、批量应用和刷新新增模型都调用同一物化入口。刷新已有模型默认不改身份；“重新应用身份预设”必须显示旧值、新值、证据和影响范围并二次确认。
8. 模型元数据设置页可查看、搜索和诊断身份预设，但通用规则编辑器不能把前缀/正则规则切换成身份规则。用户自定义身份优先在模型编辑器完成，避免一条全局规则批量误标。
9. 为共享 Core 增加精确别名、限定条件、冲突目录、非法 canonical ID、用户值不覆盖和桌面/移动一致性测试；再补模型发现、应用预设和刷新链路的集成测试。

这套步骤应与 `docs/Plan/model-metadata-system-optimization-plan.md` 的统一物化入口一起实施。当前 `ModelEditDialog.vue`、移动端 `ModelEditorPopup.vue` 和模型发现弹窗仍各自拼接字段，直接在其中追加身份赋值会继续扩大分叉。

### 6.5 各写入入口

| 入口          | 身份行为                                                                |
| ------------- | ----------------------------------------------------------------------- |
| 渠道预设      | `defaultModels` 可直接携带 builtin 身份                                 |
| API 模型发现  | 共享解析器保留 `declaredOwner` 等证据，Facade 生成建议                  |
| 配置导入      | AIO 完整配置保留身份；通用 JSON/ENV/TOML 不根据 route model ID 强推身份 |
| 手工添加/编辑 | 模型编辑器提供“模型身份”输入，保存时设为 user                           |
| 应用模型预设  | 仅为空身份填充 exact builtin；覆盖必须二次确认                          |
| 刷新模型列表  | 不覆盖现有模型身份；只处理新加入条目                                    |

模型列表共享 DTO 应新增独立的 `declaredOwner?: string`，而不是继续把所有来源压进 `ProviderModelInfo.provider`。旧 `provider` 字段暂时保留，避免图标和现有元数据匹配回归。

## 7. 共享查询 API

身份能力应由统一服务暴露，下游不要各自解析字段：

```ts
normalizeCanonicalModelId(value: string): string | null;
validateModelIdentity(identity: ModelIdentity): ValidationResult;
getModelIdentity(model: LlmModelInfo): ModelIdentity | null;
getRouteRef(profileId: string, modelId: string): ModelRouteRef;
listRoutesByCanonicalId(
  profiles: LlmProfile[],
  canonicalId: string
): Array<{ route: ModelRouteRef; profile: LlmProfile; model: LlmModelInfo }>;
buildEmbeddingSpaceDescriptor(input: EmbeddingSpaceInput): EmbeddingSpaceDescriptorV1;
getEmbeddingSpaceId(descriptor: EmbeddingSpaceDescriptorV1): string;
```

`listRoutesByCanonicalId` 只用于展示、人工选择和诊断，不执行自动路由。

## 8. Knowledge 改造目标

### 8.1 数据模型

目标 schema 将“当前空间”和“当前调用渠道”分开：

```sql
CREATE TABLE embedding_spaces(
  id TEXT PRIMARY KEY,
  descriptor_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE chunk_vectors(
  chunk_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chunk_id, space_id)
);
```

library manifest 增加：

```text
active_embedding_space_id   当前检索空间
embedding_route_key         用户当前明确选择的 profileId:modelId
```

空间 descriptor 应随 library 文件保存，使向量资产可解释；manifest 只保存当前选择和列表所需摘要。

### 8.2 建库流程

```text
用户选择 route
  -> 读取 route 对应模型对象的 modelIdentity
  -> 生成待确认 Embedding descriptor
  -> 调用文档 Embedding
  -> 用首批响应确认实际 dimensions
  -> 生成最终 spaceId
  -> 写入 embedding_spaces 和 chunk_vectors
  -> 更新 active space 与显式 route
```

模型没有 canonical identity 时仍允许建库，但生成只属于该 route 的隔离身份，例如 descriptor 中使用不可跨渠道归并的 legacy route identity。不能用裸模型名回退。

### 8.3 查询流程

查询时：

1. 从 library 读取 active descriptor 和显式 route。
2. 确认 route 仍存在、启用且模型 identity 与 descriptor 匹配。
3. 按 descriptor 中保存的维度、query task type 和 encoding format 生成查询向量。
4. 使用 `spaceId` 限定向量候选。

不得从当前元数据规则重新计算空间，也不得只按查询向量长度筛选。

### 8.4 手工切换渠道

当前阶段不自动切换。用户选择另一个 Embedding route 时：

- 生成的 descriptor 与 active descriptor 完全相同：标记为“声明同空间”。用户明确确认后只更新 `embedding_route_key`，已有向量和覆盖率不变；若已有 route 兼容报告则额外显示“已验证”。
- canonical model 相同但 descriptor 不同：明确显示差异，按新空间处理。
- canonical model 不同或任一方身份未知：按新空间处理。
- 当前 route 已删除或禁用：语义检索标记为“模型渠道不可用”，提示用户手工选择兼容渠道。

### 8.5 多资料库查询

多个 library 使用相同 `spaceId` 且使用同一个有效 query route 时可共享一次 query embedding。若 route 不同，只有存在已确认且有效的 route compatibility 时才能选择其中一个 route 共享；仅“声明同空间”但未验证时仍按 route 分组生成。使用不同空间时必须按 space 分组；只有存在有效空间 alias 时才能跨 space 复用，不能拿一个未经验证的查询向量搜索所有库。

## 9. 旧数据迁移

旧 `chunk_vectors.model_id` 中保存的值可能是裸 `modelId`，也可能是 `profileId:modelId`。迁移不得仅凭字符串名称自动合并。

建议迁移步骤：

1. 新 schema 将每个旧模型键映射为独立的 `legacy-route` 空间。
2. 保留原键作为 descriptor 的迁移证据和首选 route。
3. 若对应渠道模型仍存在且已配置 canonical identity，UI 可提示用户“将旧索引声明为此模型空间”。
4. 用户确认后只重标记空间，无需重新计算向量；未确认则继续隔离。
5. 无法解析或找不到渠道的旧索引仍可保留，但语义查询前必须重新选择可调用 route。

迁移必须可重复执行，并对空间表、向量数、active space 和覆盖率做事务级校验。

## 10. UI 设计

### 10.1 模型编辑器

在基本信息区域增加“模型身份”：

```text
模型身份  [ openai/text-embedding-3-small ]
来源      用户配置 / 内置识别 / 渠道声明
```

交互要求：

- 可搜索已有 developer 和 canonical ID，也允许高级手工输入。
- 输入失焦和保存时规范化并校验。
- 修改已有身份时说明它可能影响向量复用判断。
- 不用可编辑的 `model.provider` 冒充开发商。
- identity 为空是合法状态，显示“未识别”，不自动用渠道类型补全。

### 10.2 模型发现弹窗

新模型条目可展示身份建议及证据。`suggested` 级别默认不勾选身份确认；`exact` builtin 可以随模型一同写入。

### 10.3 Knowledge 语义索引弹窗

同时显示：

- 当前向量空间的 canonical model、revision、维度和任务配置。
- 当前调用渠道。
- 所选渠道是“同空间，仅切换调用渠道”还是“新空间，需要构建”。

## 11. Embedding 空间兼容探针

### 11.1 探针回答的问题

探针需要严格区分三件事：

1. **调用可用**：某个 route 能返回数量、维度和数值合法的向量。现有渠道检查已经覆盖这一层。
2. **数值等价**：两个 route 对相同输入、相同请求契约产生的向量在各自重复误差范围内一致。这是判断“背后很可能是同一模型与同一处理链”的强证据，但不能单独证明开发商身份。
3. **余弦可混用**：A 生成的文档向量可由 B 生成的查询向量检索，反向也成立，且相对各自原生检索的分数和排序漂移在策略阈值内。这才是 Knowledge 使用余弦检索时关心的直接互操作性。

“维度相同”“相同文本的相似度较高”或“Top-K 看起来相近”都不能单独得出可混用结论。不同坐标基底中的两个优质模型可能有相似检索效果，但 A 的 query 不能搜索 B 的 documents。

### 11.2 探针请求契约

每次比较必须冻结以下契约，报告不能只记录两个模型名：

```ts
interface EmbeddingProbeContractV1 {
  schemaVersion: 1;
  routeA: ModelRouteRef;
  routeB: ModelRouteRef;
  dimensions: number;
  queryTaskType?: EmbeddingTaskType;
  documentTaskType?: EmbeddingTaskType;
  encodingFormat: EmbeddingEncodingFormat;
  similarity: "cosine";
  adapterContractVersion: number;
  dataset: {
    id: string;
    version: string;
    contentHash: string;
  };
  repetitions: number;
  policyVersion: string;
}
```

两个 route 的实际维度、任务类型支持和适配器输入语义不一致时，结果直接为 `incompatible` 或 `inconclusive`，不得通过截断、补零或离线降维强行比较。

### 11.3 分层探测方法

#### A. 预检与自噪声

- 对每个 route 使用相同的内置哨兵文本至少重复两轮，得到 `A1/A2` 和 `B1/B2`。
- 校验向量数量、实际维度、有限数值、零向量、范数分布和重复响应稳定性。
- 分别计算 `A1-A2`、`B1-B2` 的同文本余弦漂移与归一化 L2，作为 route 自身的数值噪声基线。
- 任一路由重复结果明显不稳定时停止严格判定，返回 `inconclusive`，避免把服务漂移误认为渠道差异。

#### B. 坐标一致性

对哨兵集中每个相同文本比较 `A1[i]` 与 `B1[i]`，记录：

- 同文本跨 route cosine 的最小值、P01、P50 和 P95。
- `1 - cosine` 漂移分布与归一化 L2。
- 坐标差的最大绝对值和均方误差，仅作为诊断；Knowledge 使用 cosine 时不要求两个 route 的向量范数完全相同。
- 同文本配对是否显著优于错位文本配对，防止常量向量、塌缩输出或数据顺序错误造成假阳性。

#### C. 双向检索互换

使用包含中英文、短长文本、近义/反义、专名、数字、Unicode 和无关负样本的版本化数据集，分别生成：

```text
DA = route A 的 document vectors
QA = route A 的 query vectors
DB = route B 的 document vectors
QB = route B 的 query vectors

原生基线：QA × DA、QB × DB
交叉检索：QA × DB、QB × DA
```

比较两个方向的完整分数矩阵、Top-K overlap、Spearman 排序相关、nDCG 差值、阈值两侧翻转数和 score RMSE。只做 `QA × QB` 或比较各模型自己的 Top-K，不能证明文档向量可跨 route 复用。

内置快速集建议至少 16 条哨兵文本；严格兼容集建议不少于 32 条文档、12 条查询并重复两轮。用户自定义语料可以补充领域证据，但不能替代内置集，也不应默认持久化原文。

### 11.4 判定策略

```ts
type EmbeddingCompatibilityVerdict =
  | "numerically-equivalent"
  | "cosine-compatible"
  | "incompatible"
  | "inconclusive";
```

- `numerically-equivalent`：跨 route 坐标漂移与各自重复噪声同量级，并通过双向检索。
- `cosine-compatible`：坐标不是逐值等价，但归一化方向和双向余弦检索通过严格阈值。该结论只适用于报告中的 descriptor 与 `similarity = "cosine"`。
- `incompatible`：维度/契约硬冲突、坐标一致性失败或任一方向交叉检索失败。
- `inconclusive`：样本不足、路由不稳定、限流、部分任务类型不支持或请求未完整执行。

初始策略可以采用保守门槛，例如同文本跨 route cosine P01 不低于 `0.9999`、漂移 P95 不高于 `max(1e-4, 10 × selfNoiseP95)`，双向分数排序 Spearman 不低于 `0.999`、Top-K overlap 不低于 `0.98`。这些值是版本化工程策略，不是数学证明；上线前必须用“同模型不同渠道”正样本和“同维度不同模型”负样本校准。策略升级只影响新报告，不能静默重解释旧报告。

探针不能仅凭黑盒数值把两个模型写成同一 canonical identity。只有厂商/目录证据也声明为同一产品时，`numerically-equivalent` 才可作为用户接受身份建议的附加证据。不同产品即使得到 `cosine-compatible`，也保留不同 canonical ID，并通过空间兼容关系表达。

### 11.5 报告与空间别名

```ts
interface EmbeddingCompatibilityReportV1 {
  id: string;
  contract: EmbeddingProbeContractV1;
  descriptorA: EmbeddingSpaceDescriptorV1;
  descriptorB: EmbeddingSpaceDescriptorV1;
  selfNoise: { routeA: ProbeNoiseMetrics; routeB: ProbeNoiseMetrics };
  coordinateMetrics: ProbeCoordinateMetrics;
  retrievalMetrics: ProbeRetrievalMetrics;
  verdict: EmbeddingCompatibilityVerdict;
  completedAt: string;
  appVersion: string;
}

interface VerifiedEmbeddingSpaceAlias {
  fromSpaceId: string;
  toSpaceId: string;
  similarity: "cosine";
  reportId: string;
  acceptedBy: "user";
  acceptedAt: string;
}

interface VerifiedEmbeddingRouteCompatibility {
  spaceId: string;
  routeA: ModelRouteRef;
  routeB: ModelRouteRef;
  reportId: string;
  acceptedBy: "user";
  acceptedAt: string;
}
```

报告不得保存 API Key、请求头或 Base URL 中的凭据。内置数据集只保存版本和哈希；自定义语料默认只保存内容哈希与统计摘要。任一 descriptor、route 模型、维度、任务类型、编码、适配器契约或数据集版本变化都会使旧结论失效，必须重新探测。

同一个 `spaceId` 下的两个 route 通过探针后写 `VerifiedEmbeddingRouteCompatibility`，用于把“声明同空间”提升为“已验证同空间”。不同 `spaceId` 的兼容关系默认是有方向记录、双向验证后成对写入；只有用户明确接受后才生成 alias。删除报告、模型身份变化或 descriptor 变化时，route compatibility 与 alias 都进入失效状态而不是继续被 Knowledge 使用。

### 11.6 交互归属

完整交互放在 **Embedding 测试场**，新增“空间兼容探针”模式，而不是塞进渠道检查弹窗：

- 测试场已经有多 route 选择、批量 Embedding、向量数学、原始响应和检索模拟，适合展示证据矩阵与双向结果。
- 新模式选择基准 route 和候选 route，先显示调用次数、预计 token/费用和将使用的任务契约，再由用户启动。
- 结果分为“契约”“数值一致性”“双向检索”“结论”四个视图；允许导出脱敏 JSON 报告，并在满足条件时提供“接受身份建议”或“登记为余弦兼容空间”动作。
- 当前 `useEmbeddingCache` 只按 `model combo + text` 缓存，未包含 `dimensions`、`taskType`、`encodingFormat` 和适配器契约。探针接入前必须把缓存键升级为 `route + descriptor fingerprint + input hash`，并区分 query/document，禁止复用现有错误粒度的缓存。

**渠道设置**继续负责低成本健康检查，并提供上下文入口：

- 模型行展示最近一次兼容结论、报告时间和是否已失效。
- “与另一路由比较”跳转到测试场并预选当前 route，不在渠道弹窗内复制数据集、矩阵和阈值 UI。
- 现有 embedding probe 仍只表示“该 route 可以返回合法向量”，响应摘要可增加实际维度和任务类型，但不得显示“等价”或“可混用”。

**Knowledge**只消费结果：切换模型时先比较 descriptor；完全相同则显示“声明同空间”，有 route compatibility 报告时提升为“已验证同空间”；存在已接受且有效的 alias 时标注“经探针验证可复用”，其余情况提示重建或跳转测试场。任何跨 route 复用都由用户明确确认，Knowledge 不在索引弹窗内静默发起多轮探针。

### 11.7 与现有测试场能力的差距

现有多模型竞技场比较的是各模型内部的 `anchor → candidates` 分数和排行，阈值校准也是按各自分布做百分位映射；这适合效果评估，但不能证明坐标互通。现有检索模拟只运行单 route，原始调试只运行单输入。实施兼容探针仍需新增：

- 同一批输入的跨 route 原始向量配对与重复运行。
- query/document 两种 task type 的隔离缓存。
- 四个原生/交叉分数矩阵和双向指标。
- 版本化数据集、判定策略、报告持久化与失效判断。
- 从渠道设置和 Knowledge 带 route 上下文跳转的入口。

## 12. 分阶段实施

### 阶段 A：身份基础，不改变请求行为

- 在共享 Core 增加 identity 类型、规范化和精确别名解析。
- 在桌面和移动 `LlmModelInfo` 增加 `modelIdentity`。
- 修改模型预设、API 发现 DTO、导入和编辑 UI。
- 保持所有下游继续使用显式 `profileId:modelId` 请求。

### 阶段 B：共享查询与审计

- 增加统一 identity 查询服务。
- 在渠道设置中显示同 canonical ID 的其他 route，仅用于审计和人工选择。
- 增加重复、冲突、非法 canonical ID 检查。

### 阶段 C：Knowledge 空间迁移

- 引入 `embedding_spaces`、`space_id` 和独立 route 字段。
- 实施 legacy 隔离迁移。
- 按 descriptor 固化文档和查询 Embedding 参数。
- 支持同空间手工换渠道而不重建。

### 阶段 D：兼容探针与显式空间别名

- 先升级 Embedding 测试场缓存键和版本化数据集。
- 实现自噪声、坐标一致性和双向检索探针，持久化脱敏报告。
- 渠道设置增加跳转入口和报告摘要，现有健康探针语义保持不变。
- 首期报告只辅助人工判断；在正负样本校准和 Knowledge 空间迁移稳定后，再启用用户确认的 `VerifiedEmbeddingSpaceAlias`。

容灾组和自动重试不属于以上阶段，后续只能建立在稳定身份与空间契约之上单独设计。

## 13. 测试与验收

### 13.1 身份测试

- canonical ID 规范化、非法格式和大小写行为。
- 不同 developer 下同名模型不相等。
- 不同 route ID 可映射到同一 canonical ID。
- `model.provider` 和 `profile.type` 不会单独产生确定身份。
- 用户身份不会被刷新、导入补全或应用预设静默覆盖。
- 桌面和移动对同一输入得到相同规范化结果。

### 13.2 空间测试

- 同 identity、同 revision、同实际维度和同任务契约得到相同 `spaceId`。
- 维度、revision、query/document task type、encoding 或 adapter contract 任一不同都会得到不同空间。
- 只比较向量长度不能通过兼容判断。
- descriptor JSON 稳定序列化，字段顺序不影响哈希。

### 13.3 兼容探针测试

- 同一模型同一参数的两个稳定 route 能通过正样本策略，不同维度立即失败。
- 相同维度但不同模型、随机向量、常量向量和错序响应不能产生假阳性。
- route 自身重复漂移超限、样本不足、单方向请求失败和限流均返回 `inconclusive`。
- query/document task type 不同的模型必须执行四矩阵双向验证，不能退化成单一语义相似任务。
- 缓存严格隔离 route、维度、task type、encoding、adapter contract 和数据集版本。
- 策略版本变化不修改旧报告；descriptor 或 route 变化会使 alias 失效。
- 同 `spaceId` 但未运行探针只能显示“声明同空间”，不能显示“已验证兼容”。

### 13.4 Knowledge 测试

- 同空间手工切换 route 不改变向量数和覆盖率。
- 不同空间切换不会读取旧空间向量。
- route 删除后向量仍保留，选择兼容 route 后恢复查询。
- legacy 裸 model ID 和组合 ID 均隔离迁移，不自动合并。
- 多 library 同空间且同 route 时只生成一次 query embedding；同空间不同 route 未验证时仍分别生成。
- 未确认、已失效或只完成渠道健康检查的探针结果不能触发向量复用。

## 14. 最终决策

1. 模型实际身份配置在渠道的 `LlmModelInfo` 上，因为这里是用户可编辑且随 route 持久化的事实源。
2. 身份的规范化、精确别名和查询 API 放入共享 Core，使桌面、移动和下游使用同一语义。
3. `profileId:modelId` 保留为路由键，不再承担模型身份。
4. `model.provider` 不迁移为 developer 字段。
5. Knowledge 使用独立的 Embedding space descriptor 和 `spaceId`，不能只使用 canonical model ID。
6. 完整空间兼容探针放在 Embedding 测试场；渠道页只做健康检查、展示摘要和跳转，Knowledge 只消费用户确认的有效结论。
7. 当前阶段只支持识别、展示和手工换渠道，不实现容灾组或自动重试。
