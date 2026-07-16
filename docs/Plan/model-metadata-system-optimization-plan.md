# 模型元数据系统分层、同步与模型物化优化计划

> 状态：待实施
>
> 计划日期：2026-07-16
>
> 影响范围：桌面端与移动端模型元数据核心、模型配置持久化、LLM 渠道模型管理、Token 计算、请求路由判断、媒体生成参数和相关设置 UI

## 1. 背景

AIO Hub 当前模型元数据系统已经具备规则匹配、优先级合并、独占规则、覆盖分析、导入导出和媒体生成参数编辑能力，但内置规则、用户修改和模型对象之间缺少明确的生命周期边界：

- `metadata-rules.json` 保存完整规则数组，无法区分当前内置基线、用户对内置规则的修改和用户新增规则。
- “合并最新配置”只按规则 ID 增加缺失规则，同 ID 内置规则的修正无法进入已有配置。
- 全局规则既用于模型创建/导入时补全，又被部分运行时代码直接读取，导致用户已保存模型可能随规则变化隐式改变。
- `contextLength`、`pricing`、`tokenizer` 等元数据字段与 `LlmModelInfo` 的结构或消费方式没有统一映射。
- 桌面端和移动端分别维护匹配、合并、类型和持久化实现；移动端通过类型断言复用桌面预设，字段能力已经发生漂移。
- `modelPrefix` 的实际语义是包含匹配，`modelGroup` 已废弃但仍存在于类型和 UI。
- 当前使用 `lodash.merge()` 合并属性，数组按索引递归合并，不符合选项列表和推荐用途通常需要整体替换的语义。

参考 `new-api` 的模型同步交互后，本计划吸收其“先预览差异、再按字段确认、允许保留本地值”的治理方式，但不照搬其单条模型目录记录和服务端计费结构。AIO 继续保留多规则合并与本地模型对象能力，并将其改造成可审计、可迁移、不会隐式改变运行时行为的分层系统。

## 2. 调查基线

### 2.1 当前数据与调用链

当前桌面端数据流为：

```text
内置 DEFAULT_METADATA_RULES
          |
          v
metadata-rules.json 中的完整 rules[]
          |
          +--> 设置页规则管理与覆盖分析
          +--> 模型添加/导入/批量应用时补全模型对象
          +--> 部分运行时代码通过 getActiveModelProperties() 实时读取
```

当前移动端复用桌面内置预设，但自行维护：

- `ModelMetadataProperties` / `ModelMetadataRule` 类型；
- `testRuleMatch()` / `getMatchedModelProperties()` 合并实现；
- `metadata-rules.json` 读写与 CRUD；
- 图标路径处理。

移动端类型尚未覆盖桌面端完整的 `mediaGenParams` 和价格字段，且通过 `as unknown as ModelMetadataRule[]` 绕过了类型检查，因此不能继续把两端实现视为等价。

### 2.2 必须保持的现有能力

- Provider、模型名称与正则规则的匹配能力。
- 多规则优先级合并和 `exclusive` 截断能力。
- 用户自定义规则、禁用规则、导入导出和重置能力。
- 模型元数据覆盖分析、规则合并链和未覆盖模型快速建规则。
- 从 API 获取模型、手动添加、配置导入和批量应用预设。
- 模型自身配置优先于预设；显式用户值不得被后台更新静默覆盖。
- `media-generator` 运行时只读取模型对象自身的 `mediaGenParams`。
- 配置文件继续通过 `createConfigManager` 管理，不引入独立数据库。

## 3. 目标与非目标

### 3.1 目标

1. 将内置目录、用户覆盖和用户自定义规则分层管理。
2. 支持内置规则升级的新增、修改、删除和字段级冲突预览。
3. 通过三方比较区分“上游变化”“用户变化”和“真正冲突”。
4. 明确所有元数据属性到 `LlmModelInfo` 的写入映射和运行时读取边界。
5. 为模型记录元数据来源、应用版本和受管理字段，支持安全刷新。
6. 统一桌面和移动端的类型、匹配、合并、校验、差异与迁移核心。
7. 修正匹配类型命名、数组合并、同优先级顺序和继承字段清除语义。
8. 为导入、持久化和内置目录建立完整结构校验及可恢复错误处理。
9. 保持现有模型、规则和媒体生成配置无损迁移。

### 3.2 非目标

- 首期不直接连接 `new-api` 或第三方远程元数据仓库。
- 首期不实现在线自动下载、签名校验和后台静默更新。
- 不把模型计费改造成 `new-api` 的服务端 Ratio/Price Map。
- 不让实时全局规则重新穿透覆盖已保存模型的 `mediaGenParams` 或其他请求参数。
- 不在本计划中重构 Provider Adapter、网络 Transport 或模型列表协议。
- 不在移动端新增完整的桌面级元数据管理页面；移动端先完成核心和持久化兼容。

## 4. 推荐架构

### 4.1 三层模型

```text
┌──────────────────────────────────────────────────────┐
│ Metadata Catalog                                     │
│ AIO 随版本发布的只读规则目录，带 sourceId/revision   │
└──────────────────────────┬───────────────────────────┘
                           │ 三方比较
┌──────────────────────────▼───────────────────────────┐
│ User Rule State                                      │
│ 已接受目录快照 + 内置规则覆盖 + 屏蔽项 + 自定义规则 │
└──────────────────────────┬───────────────────────────┘
                           │ 编译有效规则
┌──────────────────────────▼───────────────────────────┐
│ Model Materialization                                │
│ 在创建/导入/刷新/批量应用时写入 LlmModelInfo        │
└──────────────────────────┬───────────────────────────┘
                           │ 运行时只读模型对象
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        LLM 请求       Token 计算      Media Generator
```

各层职责必须保持单向：

- Catalog 只描述 AIO 提供的默认知识，不直接改变模型对象。
- User Rule State 决定设置页和下一次物化使用的有效规则。
- Materialization 是规则进入具体模型对象的唯一业务入口。
- 运行时消费者读取模型对象或 Provider 配置，不实时合并全局规则。

### 4.2 共享纯核心

新增独立 workspace 包 `packages/model-metadata-core/`，避免继续把桌面 `src/` 当成移动端共享包。该包只包含纯 TypeScript：

```text
packages/model-metadata-core/src/
├── types.ts                 # 通用规则、目录、存储、差异和诊断类型
├── schema.ts                # 持久化/导入/目录结构校验
├── matcher.ts               # 规范化匹配和稳定排序
├── merge.ts                 # 明确的对象/数组/unset 合并语义
├── compiler.ts              # Catalog + 覆盖 + 自定义规则 -> 有效规则
├── diff.ts                  # base/local/incoming 三方差异
├── migration.ts             # v2 -> v3 纯迁移
├── fingerprint.ts           # 稳定序列化与规则/目录指纹
└── index.ts
```

桌面和移动端保留各自的 Pinia/Composable、ConfigManager、日志、错误提示和 UI。平台代码不得在共享核心中出现。

## 5. 数据契约

### 5.1 规范化匹配类型

v3 不再使用含义模糊的 `modelPrefix + useRegex` 组合，改为显式类型：

```typescript
type MetadataMatchType =
  | "provider"
  | "modelExact"
  | "modelPrefix"
  | "modelContains"
  | "modelRegex";
```

迁移规则：

| v2 | v3 | 迁移目的 |
| --- | --- | --- |
| `provider` | `provider` | 保持大小写不敏感精确匹配 |
| `model`, `useRegex=false` | `modelExact` | 保持精确匹配 |
| `model`, `useRegex=true` | `modelRegex` | 保持正则行为 |
| `modelPrefix`, `useRegex=false` | `modelContains` | 保持当前实际 `includes()` 行为，不制造静默回归 |
| `modelPrefix`, `useRegex=true` | `modelRegex` | 保持正则行为 |
| `modelGroup` | 阻塞迁移诊断 | 当前类型不生效，要求用户转换或删除 |

新增真正的 `modelPrefix` 后只执行 `startsWith()`。匹配默认统一为大小写不敏感；如确有区分大小写需求，后续增加显式 `caseSensitive`，不依赖不同类型的隐式差异。

### 5.2 规则结构

```typescript
interface ModelMetadataRule<TProperties = ModelMetadataProperties> {
  id: string;
  matchType: MetadataMatchType;
  matchValue: string;
  properties: TProperties;
  unsetPaths?: string[];
  priority?: number;
  enabled?: boolean;
  exclusive?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

`unsetPaths` 用于显式清除低优先级规则继承的字段，例如 `capabilities.vision` 或 `recommendedFor`。不使用 `undefined` 表达删除，因为 JSON 持久化会丢失 `undefined`；不把业务字段的 `null` 混用为删除标记。

### 5.3 目录快照

```typescript
interface MetadataCatalogSnapshot {
  schemaVersion: "3.0.0";
  sourceId: "aiohub-builtin";
  revision: string;
  generatedAt: string;
  rules: ModelMetadataRule[];
  fingerprint: string;
}
```

- `revision` 是随规则目录变更显式更新的可读版本，例如 `2026.07.16.1`。
- `fingerprint` 由稳定序列化后的目录生成，用于检测遗漏的 revision 更新。
- CI/测试要求目录内容变化时 revision 必须变化，规则 ID 必须唯一。

### 5.4 v3 持久化格式

```typescript
interface ModelMetadataStoreV3 {
  version: "3.0.0";
  sourceSnapshot: MetadataCatalogSnapshot;
  builtinOverrides: Record<string, ModelMetadataRule>;
  suppressedBuiltinRuleIds: string[];
  customRules: ModelMetadataRule[];
  updatedAt: string;
}
```

说明：

- `sourceSnapshot` 是用户最后接受的内置目录基线，不直接引用当前应用内置目录。
- `builtinOverrides` 保存用户修改后的完整内置规则；完整对象便于三方比较和恢复，不采用难以审查的隐式深层 Patch。
- `suppressedBuiltinRuleIds` 表示用户删除或明确屏蔽的内置规则。
- `customRules` 只保存用户新增规则，ID 继续使用 `custom-*` 前缀。
- 有效规则由 `sourceSnapshot.rules` 应用覆盖和屏蔽后，再追加 `customRules` 编译得到。

当前约 327 条规则已经被 v2 配置完整保存，因此 v3 保存一份目录快照不会显著放大现有配置体积。

### 5.5 模型物化状态

在 `LlmModelInfo` 增加可选状态：

```typescript
interface ModelMetadataBinding {
  mode: "manual" | "fillMissing" | "followSource";
  sourceId?: string;
  sourceRevision?: string;
  appliedRuleIds?: string[];
  managedPaths?: string[];
  appliedAt?: string;
  fingerprint?: string;
}
```

- `manual`：只保留当前模型值，不参与后续批量刷新。
- `fillMissing`：刷新时只补空字段，不覆盖已有值。
- `followSource`：只更新 `managedPaths` 中仍由元数据管理的字段。
- 用户手动编辑某个已管理字段后，该路径从 `managedPaths` 移除。
- `mediaGenParams` 默认在首次应用后转为用户可编辑快照；除非用户显式选择该字段重新跟随，否则刷新不得覆盖。

## 6. 确定性匹配与合并语义

### 6.1 稳定顺序

命中规则从低到高按以下顺序合并：

1. `priority` 升序；
2. 同优先级按匹配特异性：`provider < modelContains < modelPrefix < modelRegex < modelExact`；
3. 同优先级、同特异性按规则 ID 升序，保证跨平台稳定。

`exclusive` 继续截断优先级更低的规则；同优先级规则不被截断。覆盖分析和实际编译必须调用同一个共享函数，禁止维护第二套规则链实现。

### 6.2 属性合并

- 普通对象递归合并。
- 标量由高优先级值覆盖。
- `false`、`0` 和空字符串是显式值，不得当成缺失。
- 数组整体替换，不按索引合并。
- `unsetPaths` 在应用该规则属性后执行，删除对应继承路径。
- 禁止原地修改规则对象；合并结果必须是新对象。
- 不允许 `__proto__`、`constructor`、`prototype` 等危险路径进入属性或 `unsetPaths`。

### 6.3 三方差异

对每个内置规则使用：

```text
base     = sourceSnapshot 中用户上次接受的规则
local    = builtinOverrides[id] ?? base
incoming = 当前应用内置目录中的规则
```

字段判定：

| 条件 | 结果 |
| --- | --- |
| `incoming == base` | 上游未改，不产生更新 |
| `local == base` 且 `incoming != base` | 纯上游更新，可直接接受 |
| `local == incoming` | 已一致，无冲突 |
| `local != base` 且 `incoming == base` | 纯用户修改，继续保留 |
| `local != base` 且 `incoming != base` 且 `local != incoming` | 字段冲突，需要用户选择 |

数组作为单一字段比较。规则新增、删除、重命名和匹配条件变化分别显示，不通过模糊匹配猜测规则 ID 迁移。

同步完成后：

1. `sourceSnapshot` 更新为 incoming 目录；
2. 用户选择保留的本地差异重新压缩到 `builtinOverrides`；
3. 与新基线完全一致的 override 自动删除；
4. 被删除但用户选择保留的上游规则转换为 `customRules`；
5. 被用户拒绝的新规则加入 `suppressedBuiltinRuleIds`。

## 7. 属性写入与运行时边界

### 7.1 统一物化入口

新增纯函数：

```typescript
materializeModelMetadata(model, properties, options): {
  model: LlmModelInfo;
  changes: ModelMetadataFieldChange[];
  binding: ModelMetadataBinding;
  diagnostics: ModelMetadataDiagnostic[];
}
```

所有模型创建、API 获取、配置导入、手动“应用预设”和批量刷新必须调用该入口。现有各组件自行拼接 `group/icon/capabilities/mediaGenParams` 的代码逐步删除。

### 7.2 字段映射

| 元数据字段 | 模型对象目标 | 默认策略 |
| --- | --- | --- |
| `icon` | `model.icon` | `fillMissing`，用户编辑后脱离管理 |
| `group` | `model.group` | `fillMissing`，用户编辑后脱离管理 |
| `description` | `model.description` | `fillMissing` |
| `capabilities` | `model.capabilities` | 对能力键逐项填充，显式模型值优先 |
| `contextLength` | `model.tokenLimits.contextLength` | 显式映射，不再保留两套读取路径 |
| `tokenizer` | 新增 `model.tokenizerProfileId` | 写入模型后供 Token 计算器使用 |
| `mediaGenParams` | `model.mediaGenParams` | 深拷贝快照，运行时只读模型对象 |
| `pricing` | 规范化后的模型价格结构 | 首期只在契约统一后接入，不做字符串猜测 |
| `recommendedFor` | 新增同名模型展示字段或保留目录展示 | 在阶段 1 冻结用途后再启用 |
| `version/releaseDate` | 模型展示元数据 | 只影响展示，不参与请求 |
| `apiEndpoint` | 不直接物化 | 自定义端点仍归属 Profile，不允许模型目录改写网络目标 |
| `features` | 迁移到 `capabilities` 或删除 | 不长期保留重复能力体系 |

### 7.3 运行时消费者整改

- `media-generator`：保持只读 `model.mediaGenParams`。
- Token 计算器：调用方传入 `model.tokenizerProfileId` 和模型能力快照；Worker 不再自行读取默认元数据规则。
- 上下文/视觉 Token 估算：读取具体模型的 `capabilities` 和 `tokenLimits`。
- 请求构建：不再使用展示用 `group` 判断模型协议家族；增加显式 `model.apiFamily`，缺失时由 Profile Provider 类型推断。
- 图标和分组展示：具体模型存在时读取模型字段；未知临时模型可使用独立的只读预览解析，但不得把结果当成已保存配置。
- 覆盖分析和设置测试模式：允许直接读取有效规则，因为其职责就是分析规则，而非执行业务请求。

## 8. 更新与交互设计

### 8.1 设置页信息架构

主页面保留紧凑工具栏和规则列表，新增以下状态：

- 当前已应用目录版本。
- 可用目录版本。
- 新增、修改、删除、冲突数量。
- “查看更新”主动作；无更新时禁用或显示“已是最新”。

现有“合并最新配置”替换为“查看目录更新”，不得再直接执行无预览合并。

### 8.2 更新预览对话框

采用可搜索、可筛选的表格，不使用卡片嵌套。一级按规则显示：

- 状态：新增、上游更新、本地修改、冲突、上游删除。
- 规则 ID、匹配方式、匹配值、优先级。
- 受影响的已配置模型数量。
- 展开后按字段显示 Base、本地值、新目录值和选择结果。

批量动作：

- 接受全部无冲突更新。
- 对当前筛选结果接受上游或保留本地。
- 清除选择。
- 应用所选更新。

存在未决冲突时可以只应用已决项，其余继续保留旧目录基线，不允许静默选择上游。

### 8.3 模型刷新预览

目录更新只更新规则状态，不立即改写 Profile 模型。应用目录更新后单独提供“刷新模型配置”步骤：

1. 扫描全部 Profile 模型；
2. 依据 `ModelMetadataBinding.mode` 生成字段变更；
3. 按渠道、模型和字段展示预览；
4. 用户确认后一次性更新内存对象；
5. 通过现有 Profile 持久化入口逐个保存并报告成功/失败项。

无事务支持时，保存前完成全部同步校验；失败报告必须列出已保存与未保存渠道，不能只显示笼统错误。

### 8.4 规则编辑器

- 使用明确的匹配方式菜单，移除 `useRegex` 和 `modelGroup`。
- 显示规则来源：内置、内置已修改、自定义。
- 编辑内置规则时明确提示会创建本地覆盖。
- 支持查看和编辑 `unsetPaths`，普通表单操作优先，原始 JSON 作为高级入口。
- 保存前执行共享 Schema 校验、正则编译、危险路径检查和重复 ID 检查。
- 内置规则提供“恢复此规则”动作，删除对应 override，而不是复制当前内置值。

### 8.5 导入导出

- v3 导出默认包含当前 sourceSnapshot、overrides、suppressed IDs 和 customRules，保证可完整恢复。
- 另提供“仅导出自定义内容”，便于跨设备分享用户规则。
- 导入必须先解析为候选状态，展示版本、规则数量、重复项、无效项和覆盖范围。
- v2 文件只通过迁移器导入，不直接赋值给 Store。
- 导入不允许覆盖当前配置文件，必须在内存中完成校验和预览后再保存。

## 9. v2 到 v3 迁移

### 9.1 基本策略

迁移以“不丢用户值、不猜测用户意图”为第一原则：

1. 完整备份原 `metadata-rules.json`，由 ConfigManager 迁移机制保留可恢复副本。
2. 校验 v2 规则并转换匹配类型。
3. 按 ID 与当前内置目录比较。
4. 完全一致的内置规则进入 `sourceSnapshot`，不产生 override。
5. 同 ID 但内容不同的规则保守地写入 `builtinOverrides`。
6. `custom-*` 或内置目录不存在的规则进入 `customRules`。
7. 内置目录存在但 v2 文件缺失的规则进入 `suppressedBuiltinRuleIds`，避免升级时突然恢复。
8. `modelGroup`、无效正则、重复 ID 和非法属性生成诊断；阻塞项保留原文件并停止替换。

由于 v2 没有记录用户最初使用的内置版本，同 ID 差异无法可靠区分“旧内置值”和“用户修改”。首轮迁移必须按用户修改保留，并在更新预览中标记为“历史来源不确定”，不能自动覆盖。

### 9.2 模型对象迁移

- 现有模型默认绑定模式设为 `manual`，避免升级后自动覆盖。
- 已有 `mediaGenParams` 一律视为模型自身配置。
- 缺失元数据的模型只在用户执行批量应用或显式刷新时补全。
- 若后续希望跟随目录，用户可在模型编辑页或批量刷新预览中切换模式。

## 10. 实施批次

### 批次 1：冻结契约与共享核心

- 建立 `packages/model-metadata-core`。
- 定义 v3 类型、Schema、稳定序列化和目录指纹。
- 实现规范化匹配类型、稳定排序、数组替换和 `unsetPaths`。
- 将桌面现有匹配与覆盖分析测试转为共享核心契约测试。
- 增加移动端与桌面端对同一规则集的差分测试。

完成标准：共享核心可以独立输入规则和模型标识，得到稳定规则链、属性结果和诊断；桌面/移动尚未切换持久化行为。

### 批次 2：v3 Store、迁移与目录差异

- 为内置预设增加目录 revision 和 fingerprint。
- 实现 v2 -> v3 迁移、有效规则编译和 v3 持久化。
- 实现 base/local/incoming 三方差异与冲突解析纯函数。
- 桌面 Store 切换到 v3，保留旧 Composable 查询 API 的过渡 Facade。
- 增加损坏配置回退、迁移备份和错误诊断测试。

完成标准：现有配置无损迁移，内置规则新增、修改、删除和用户冲突均能被纯逻辑准确识别；暂不改模型对象。

### 批次 3：模型物化与运行时边界

- 实现 `materializeModelMetadata()` 和字段变更契约。
- 为 `LlmModelInfo` 增加 `metadataBinding`、`tokenizerProfileId` 和 `apiFamily`。
- 统一手动添加、API 获取、配置导入和批量应用入口。
- 迁移 Token 计算、请求家族判断、上下文估算、图标与分组消费方。
- 保持媒体生成参数只从模型对象读取，并补充回归测试。
- 删除各组件重复的元数据拼接代码和运行时全局规则兜底。

完成标准：除设置分析、目录预览和模型写入流程外，业务运行时不再调用全局元数据规则获取模型参数。

### 批次 4：目录更新与模型刷新 UI

- 将“合并最新配置”替换为更新状态和预览入口。
- 实现规则级/字段级差异表、筛选、批量选择和冲突处理。
- 实现目录更新后的模型刷新预览。
- 改造规则编辑器的来源、覆盖、恢复、匹配类型和校验交互。
- 改造导入流程为解析、诊断、预览、确认四步。
- 为宽屏和窄屏补充稳定布局及组件测试。

完成标准：用户可以明确知道哪些内置字段变化、哪些值由自己修改、哪些模型会被刷新，并可在写入前逐项确认。

### 批次 5：移动端收口与文档同步

- 移动端切换到共享类型、匹配、合并、迁移和目录差异核心。
- 删除移动端 `as unknown as ModelMetadataRule[]` 和重复算法。
- 对齐移动端模型物化字段；没有对应功能的字段仍需类型兼容并安全保留。
- 更新模型元数据架构文档、设置架构和用户指南。
- 记录真实 Tauri 桌面与移动端迁移、配置恢复和交互验收结果。

完成标准：两端对同一目录和用户状态得到完全一致的有效规则及物化结果，不再维护第二套匹配算法。

## 11. 测试策略

### 11.1 共享核心

- 五种匹配类型、大小写、无效正则和空匹配值。
- 同优先级特异性与规则 ID 稳定排序。
- `exclusive` 截断边界。
- 对象递归合并、数组整体替换、`false/0/空字符串` 保留。
- `unsetPaths` 清除和原型污染路径拒绝。
- Catalog revision/fingerprint 一致性和重复 ID。

### 11.2 三方差异

- 纯上游更新、纯本地更新、相同修改和真正冲突。
- 新增规则接受/拒绝。
- 上游删除规则的删除/转自定义选择。
- 数组、嵌套能力和媒体参数字段作为稳定路径比较。
- 部分字段接受后 override 正确压缩。

### 11.3 迁移

- 当前 v2 默认规则完整迁移。
- 用户修改内置规则、自定义规则、删除内置规则和禁用规则。
- `modelPrefix` 保持旧包含语义并迁移为 `modelContains`。
- `modelGroup`、重复 ID、损坏 JSON 和非法图标路径诊断。
- 迁移失败不覆盖原文件，修复后可重试。

### 11.4 模型物化

- `manual/fillMissing/followSource` 三种模式。
- 模型显式值优先，受管理字段刷新，用户编辑后脱离管理。
- `contextLength -> tokenLimits.contextLength` 和 tokenizer/API family 映射。
- `mediaGenParams` 深拷贝且规则后续变化不影响模型快照。
- API 获取、配置导入、手动应用和批量应用结果一致。

### 11.5 UI 与集成

- 更新统计、筛选、字段选择和未决冲突状态。
- 规则恢复只删除 override。
- v2/v3 导入预览和阻塞诊断。
- 模型刷新失败时正确报告成功/失败渠道。
- 桌面宽屏、窄屏和移动端无文本溢出、控件重叠或状态跳动。

每个批次至少运行相关 Vitest；最终验收执行：

```text
bun run lint
bun run test:run
bun run test:llm-core
bun run --cwd mobile test:run
bun run check:frontend
bun run check:mobile:frontend
bun run build
bun run --cwd mobile build
```

若新增独立 workspace 脚本，应增加 `test:model-metadata-core` 并接入根检查脚本。桌面和移动端生产构建均应执行，不能以普通浏览器代替真实 Tauri 运行态验收。

## 12. 验收标准

1. 内置目录、内置覆盖、屏蔽项和自定义规则可以被明确区分和独立恢复。
2. 同 ID 内置规则发生变化时，设置页能展示字段级差异，而不是只统计新增规则。
3. 无冲突更新可以批量接受；冲突字段不会被静默覆盖。
4. 匹配与合并结果在桌面、移动端、覆盖分析和实际物化中一致。
5. 数组不再按索引合并，规则继承字段可以通过 `unsetPaths` 显式清除。
6. v2 配置迁移后，用户自定义、禁用、删除和媒体参数均不丢失。
7. `modelPrefix` 具备真实前缀语义，旧配置的包含行为迁移后不变，`modelGroup` 不再出现在新建 UI。
8. 模型创建、导入、刷新和批量应用共用同一物化入口。
9. 业务运行时不从全局元数据规则补写或覆盖模型请求参数。
10. `media-generator` 只读取模型对象自身 `mediaGenParams`，规则更新不会隐式改变已配置模型。
11. Tokenizer、上下文长度和模型协议家族不再依赖展示分组或未物化规则。
12. 导入和持久化数据经过完整 Schema 校验，损坏文件不会覆盖有效配置。
13. 相关单测、桌面/移动类型检查和两端生产构建通过。

## 13. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| v2 无旧内置版本信息 | 旧默认与用户修改无法区分 | 按用户修改保守保留，首次更新显示来源不确定 |
| 运行时读取迁移遗漏 | 规则更新仍可能隐式改变行为 | 建立消费矩阵和 `getActiveModelProperties` 调用清零检查 |
| 共享核心范围过大 | 拖入平台 UI 或 Profile 依赖 | 核心只接收普通对象和纯数据契约，平台接线留在应用层 |
| 模型对象新增状态增加配置体积 | Profile 文件增大 | 只记录有意义的 managedPaths、规则 ID 和指纹，不保存完整规则 |
| 定价字段单位不统一 | 显示或计算错误 | 先冻结规范化价格契约，再启用物化；禁止字符串猜测 |
| 目录更新与模型刷新被误认为一步 | 用户以为规则更新立即生效 | UI 明确拆成“更新目录”和“刷新模型”两个阶段 |
| 移动端字段能力落后 | 导入或保存时丢字段 | 先共享 Schema 和透传未知安全字段，再逐步补齐编辑能力 |
| 正则和大量规则影响覆盖分析性能 | 设置页卡顿 | 编译规则、缓存正则和模型匹配结果，性能测试覆盖 500+ 规则 |

## 14. 施工约束

- 每个批次完成后将实际偏差、验证命令和结果回写本计划。
- 批次 1、2 不得顺手改变现有模型运行行为；行为迁移集中在批次 3。
- 新旧实现只允许在单个批次内作为差分验证过渡，批次验收时删除已替代实现。
- 不允许为兼容旧调用长期保留第二套匹配、合并或物化逻辑。
- 任何会改变已保存模型请求参数的迁移都必须经过预览或一次性明确迁移，不得在后台启动任务中静默执行。
- 架构文档当前关于媒体生成实时读取规则的描述已经与实际约束不一致，实施批次 3 后必须同步修正。
