# 模型元数据系统分层、同步与模型物化优化计划

> 状态：施工中（批次 1～4 已完成；批次 5 的共享核心、移动端物化和文档已完成；移动端目录管理 UI 与真实运行态验收待后续收口）
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
  "provider" | "modelExact" | "modelPrefix" | "modelContains" | "modelRegex";
```

迁移规则：

| v2                              | v3              | 迁移目的                                       |
| ------------------------------- | --------------- | ---------------------------------------------- |
| `provider`                      | `provider`      | 保持大小写不敏感精确匹配                       |
| `model`, `useRegex=false`       | `modelExact`    | 保持精确匹配                                   |
| `model`, `useRegex=true`        | `modelRegex`    | 保持正则行为                                   |
| `modelPrefix`, `useRegex=false` | `modelContains` | 保持当前实际 `includes()` 行为，不制造静默回归 |
| `modelPrefix`, `useRegex=true`  | `modelRegex`    | 保持正则行为                                   |
| `modelGroup`                    | 阻塞迁移诊断    | 当前类型不生效，要求用户转换或删除             |

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

| 条件                                                         | 结果                   |
| ------------------------------------------------------------ | ---------------------- |
| `incoming == base`                                           | 上游未改，不产生更新   |
| `local == base` 且 `incoming != base`                        | 纯上游更新，可直接接受 |
| `local == incoming`                                          | 已一致，无冲突         |
| `local != base` 且 `incoming == base`                        | 纯用户修改，继续保留   |
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

| 元数据字段            | 模型对象目标                       | 默认策略                                             |
| --------------------- | ---------------------------------- | ---------------------------------------------------- |
| `icon`                | `model.icon`                       | `fillMissing`，用户编辑后脱离管理                    |
| `group`               | `model.group`                      | `fillMissing`，用户编辑后脱离管理                    |
| `description`         | `model.description`                | `fillMissing`                                        |
| `capabilities`        | `model.capabilities`               | 对能力键逐项填充，显式模型值优先                     |
| `contextLength`       | `model.tokenLimits.contextLength`  | 显式映射，不再保留两套读取路径                       |
| `tokenizer`           | 新增 `model.tokenizerProfileId`    | 写入模型后供 Token 计算器使用                        |
| `mediaGenParams`      | `model.mediaGenParams`             | 深拷贝快照，运行时只读模型对象                       |
| `pricing`             | 规范化后的模型价格结构             | 首期只在契约统一后接入，不做字符串猜测               |
| `recommendedFor`      | 新增同名模型展示字段或保留目录展示 | 在阶段 1 冻结用途后再启用                            |
| `version/releaseDate` | 模型展示元数据                     | 只影响展示，不参与请求                               |
| `apiEndpoint`         | 不直接物化                         | 自定义端点仍归属 Profile，不允许模型目录改写网络目标 |
| `features`            | 迁移到 `capabilities` 或删除       | 不长期保留重复能力体系                               |

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

#### 8.1.1 规则列表分层、折叠与自适应布局

- 默认只展示用户额外新增的自定义规则；内置规则不与自定义规则平铺混排。
- 内置规则按稳定的业务分类分层展示，分类节点可独立展开/折叠；首次进入时保持收起，用户可按需展开后再查看或编辑具体规则。
- 保留“全部规则”和来源筛选入口，便于维护人员检索内置规则；进入内置规则时必须持续显示其来源与“编辑将创建本地覆盖”的提示，避免用户误以为正在直接修改默认值。
- 紧凑工具栏不得假定所有控件只占一行：宽度不足时按优先级换行或收纳次要筛选项，主动作“添加规则”始终可见且不被挤压。
- 下拉选择器不应以“最少展示 12 项”等固定策略撑开页面；选项较多时限制浮层高度并内部滚动，控件宽度随可用视口自适应，已选状态使用摘要显示，避免下拉列表过长或遮挡关键操作。
- 折叠、展开、筛选和窄屏布局必须保持键盘可达性、清晰的数量提示和稳定的焦点，不得因切换状态导致列表跳动或误触编辑动作。

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
- 审查桌面现有匹配与覆盖分析测试，只将仍代表 v3 目标契约的用例迁移为共享核心契约测试。
- 对桌面、移动端接线增加少量共享契约用例，以明确的 v3 预期结果为判定基准，不以两套旧实现彼此相等作为正确性依据。

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
- 对筛选、选择、冲突处理和写入确认等高风险状态转换补充必要的组件测试；宽窄屏布局、信息层级和长选项操作体验改由真实 Tauri 运行态走查，不用 DOM 或快照断言代替可用性验收。

完成标准：用户可以明确知道哪些内置字段变化、哪些值由自己修改、哪些模型会被刷新，并可在写入前逐项确认。

### 批次 5：移动端收口与文档同步

- 移动端切换到共享类型、匹配、合并、迁移和目录差异核心。
- 删除移动端 `as unknown as ModelMetadataRule[]` 和重复算法。
- 对齐移动端模型物化字段；没有对应功能的字段仍需类型兼容并安全保留。
- 更新模型元数据架构文档、设置架构和用户指南。
- 记录真实 Tauri 桌面与移动端迁移、配置恢复和任务式交互验收结果；无法覆盖的平台应明确记录环境限制，不用浏览器模拟结果冒充真实运行态。

完成标准：两端对同一目录和用户状态得到完全一致的有效规则及物化结果，不再维护第二套匹配算法。

## 11. 验证策略

验证分为纯逻辑自动测试、工程检查与真实运行态验收三层。三者回答的问题不同：自动测试防止稳定业务契约回归，类型检查和生产构建发现工程集成错误，真实运行态验收判断界面是否清楚、可操作和好用。不得用其中一层冒充另一层。

### 11.1 共享核心自动测试

以下规则具有确定输入输出，属于优先自动化范围：

- 五种匹配类型、大小写、无效正则和空匹配值。
- 同优先级特异性与规则 ID 稳定排序。
- `exclusive` 截断边界。
- 对象递归合并、数组整体替换、`false/0/空字符串` 保留。
- `unsetPaths` 清除和原型污染路径拒绝。
- Catalog revision/fingerprint 一致性和重复 ID。

### 11.2 三方差异自动测试

- 纯上游更新、纯本地更新、相同修改和真正冲突。
- 新增规则接受/拒绝。
- 上游删除规则的删除/转自定义选择。
- 数组、嵌套能力和媒体参数字段作为稳定路径比较。
- 部分字段接受后 override 正确压缩。

### 11.3 迁移与数据安全自动测试

- 当前 v2 默认规则完整迁移。
- 用户修改内置规则、自定义规则、删除内置规则和禁用规则。
- `modelPrefix` 保持旧包含语义并迁移为 `modelContains`。
- `modelGroup`、重复 ID、损坏 JSON 和非法图标路径诊断。
- 迁移失败不覆盖原文件，修复后可重试。

### 11.4 模型物化自动测试

- `manual/fillMissing/followSource` 三种模式。
- 模型显式值优先，受管理字段刷新，用户编辑后脱离管理。
- `contextLength -> tokenLimits.contextLength` 和 tokenizer/API family 映射。
- `mediaGenParams` 深拷贝且规则后续变化不影响模型快照。
- API 获取、配置导入、手动应用和批量应用结果一致。

### 11.5 UI 逻辑与集成自动测试边界

只对错误代价高、状态组合复杂且能够稳定断言的行为补测试：

- 更新统计、筛选结果、字段选择与未决冲突之间的状态转换。
- “恢复内置规则”只删除 override，不误删规则或模型数据。
- v2/v3 导入的解析、阻塞诊断与确认前不落盘。
- 模型刷新部分失败时，成功/失败渠道和持久化结果一致。

不为静态展示、样式类名、DOM 层级、具体文案或当前组件拆分补测试。已有测试只有在断言仍代表目标用户契约时才迁移；不得通过复刻实现分支让测试与实现自证正确。

### 11.6 真实运行态 UI 验收

批次 4、5 在真实 Tauri 目标运行态中按用户任务走查并记录结果，重点确认：

- 首次进入能直接找到自定义规则，并能理解内置规则、自定义规则和本地覆盖的区别。
- 用户能完成“查看目录更新 -> 处理冲突 -> 应用目录 -> 预览并刷新模型”，且不会误以为目录更新已经改写模型。
- 宽屏、窄屏和移动端不存在关键文本溢出、控件重叠、主动作消失、焦点丢失或切换时明显跳动。
- 长选项下拉菜单不会无限撑开或遮挡关键操作，滚动、摘要和键盘操作可用。
- 失败与部分成功提示能让用户判断哪些数据已经保存、下一步如何恢复。

这些项目用于评价实际可用性，不要求为每一项编写组件测试或 E2E。普通浏览器只可辅助检查明确具有 browser fallback 的纯前端外观，不能作为 Tauri 运行态验收结论。

### 11.7 测试选择与命令

- 不按实施批次设置 Vitest 数量配额。仅当存在明确业务契约、历史回归、数据安全风险或复杂状态转换时新增测试，并在用例中体现要防止的具体失败。
- 每个批次运行受影响范围的现有检查和定向测试；无相关自动测试的展示性 UI 改动，不为凑数新建测试。
- 前端改动完成时仍须执行对应类型检查和 Vite 生产构建。最终至少执行：

```text
bun run lint
bun run check:frontend
bun run check:mobile:frontend
bun run build
bun run --cwd mobile build
```

共享核心建立后增加定向脚本 `test:model-metadata-core`，并在涉及共享核心、迁移、差异或物化逻辑的批次运行。若实际改动触及现有 LLM Core 或平台测试范围，再补充运行对应的 `test:llm-core`、桌面定向 Vitest 或移动端定向 Vitest；不再默认以全仓 `test:run` 代替风险相关验证。

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
13. 规则管理默认视图聚焦用户新增规则；内置规则可按分类折叠、检索和安全编辑，不与自定义规则平铺混淆。
14. 在窄宽度和长选项场景下，工具栏、下拉菜单和主动作保持可操作，不出现无限拉长、遮挡、溢出或布局跳动。
15. 共享核心、迁移、差异和物化等高风险契约的定向测试通过，桌面/移动类型检查和两端生产构建通过，真实运行态 UI 任务走查已记录且不存在阻塞性可用性问题。

## 13. 风险与应对

| 风险                           | 影响                        | 应对                                                        |
| ------------------------------ | --------------------------- | ----------------------------------------------------------- |
| v2 无旧内置版本信息            | 旧默认与用户修改无法区分    | 按用户修改保守保留，首次更新显示来源不确定                  |
| 运行时读取迁移遗漏             | 规则更新仍可能隐式改变行为  | 建立消费矩阵和 `getActiveModelProperties` 调用清零检查      |
| 共享核心范围过大               | 拖入平台 UI 或 Profile 依赖 | 核心只接收普通对象和纯数据契约，平台接线留在应用层          |
| 模型对象新增状态增加配置体积   | Profile 文件增大            | 只记录有意义的 managedPaths、规则 ID 和指纹，不保存完整规则 |
| 定价字段单位不统一             | 显示或计算错误              | 先冻结规范化价格契约，再启用物化；禁止字符串猜测            |
| 目录更新与模型刷新被误认为一步 | 用户以为规则更新立即生效    | UI 明确拆成“更新目录”和“刷新模型”两个阶段                   |
| 移动端字段能力落后             | 导入或保存时丢字段          | 先共享 Schema 和透传未知安全字段，再逐步补齐编辑能力        |
| 正则和大量规则影响覆盖分析性能 | 设置页卡顿                  | 编译规则、缓存正则和模型匹配结果，性能测试覆盖 500+ 规则    |

## 14. 施工约束

- 每个批次完成后将实际偏差、验证命令和结果回写本计划。
- 批次 1、2 不得顺手改变现有模型运行行为；行为迁移集中在批次 3。
- 新旧实现只允许在单个批次内作为差分验证过渡，批次验收时删除已替代实现。
- 不允许为兼容旧调用长期保留第二套匹配、合并或物化逻辑。
- 任何会改变已保存模型请求参数的迁移都必须经过预览或一次性明确迁移，不得在后台启动任务中静默执行。
- 架构文档当前关于媒体生成实时读取规则的描述已经与实际约束不一致，实施批次 3 后必须同步修正。

## 15. 施工记录

### 2026-08-24：批次 1 完成，批次 2 核心落地

已完成：

- 新增 `packages/model-metadata-core/`，提供纯 TypeScript 的 v3 类型、规则/Store Schema 校验、稳定序列化与目录指纹、五种规范化匹配、稳定排序、`exclusive` 边界、对象递归合并、数组整体替换、`unsetPaths` 与危险路径拒绝、有效规则编译、v2→v3 迁移和内置目录三方差异。
- 桌面端和移动端改为使用共享核心进行规则匹配与属性合并；移动端不再使用 `as unknown as ModelMetadataRule[]`，也不再保留独立的 `lodash.merge()` 匹配实现。
- 预设源文件保留旧数据写法，但只在聚合入口一次性转换为 v3 规则；应用和持久化层只消费规范化后的规则，因此旧 `modelPrefix` 的包含语义会被转换为 `modelContains`，不会静默改变已有目录行为。
- 桌面端 v3 Store 已支持 `sourceSnapshot`、内置覆盖、屏蔽内置规则和自定义规则；加载旧 `metadata-rules.json` 时通过迁移器转换并校验，保存前阻止危险路径、非法正则和重复规则等阻塞诊断。移动端持久化同时升级为兼容的 v3 结构。
- 设置编辑器移除了 `useRegex` / `modelGroup` 新建入口，改为显式的 exact、prefix、contains、regex 匹配类型；Token Calculator 的 Worker 侧规则解析改为调用共享核心。

本批次的明确偏差与后续项：

- 尚未进入批次 3 的模型物化：`LlmModelInfo.metadataBinding`、`tokenizerProfileId`、`apiFamily`、统一 `materializeModelMetadata()` 以及运行时消费者清零仍待实施。本次未主动改写已保存模型参数。
- 设置页目前保留原有“合并内置配置”入口的兼容 Facade；它遇到冲突时不会自动应用更新。批次 4 将把该入口替换为字段级目录更新预览、显式冲突选择和模型刷新预览。
- 本次没有将普通浏览器构建当作 Tauri 运行态验收；批次 4/5 完成 UI 流程后，仍需按第 11.6 节在真实桌面与移动目标运行态走查。

验证结果：

```text
bun run check:model-metadata-core                         # 通过
bun run test:model-metadata-core                          # 通过，6 项共享核心契约测试
bunx vitest --run src/config/__tests__/model-metadata.test.ts \
  src/views/Settings/model-metadata/utils/__tests__/coverageAnalysis.test.ts
                                                           # 通过，8 项既有契约测试
bun run check:frontend                                    # 通过
bun run check:mobile:frontend                             # 通过
bun run build:vite                                        # 通过（存在既有第三方 externalize / chunk-size 警告）
bun run --cwd mobile build                                # 通过
```

### 2026-08-24：批次 3 完成，模型元数据物化与运行时边界收紧

已完成：

- 新增 `materializeModelMetadata()` 作为桌面端规则结果写入模型对象的唯一入口，并为 `LlmModelInfo` 增加 `metadataBinding`、`tokenizerProfileId` 与 `apiFamily`。物化会把分组、图标、说明、Tokenizer、上下文窗口、能力与 API 家族写入模型快照；`mediaGenParams` 在首次应用后深拷贝为模型自有配置。
- 明确三种绑定模式：`manual` 不改写模型；`fillMissing` 仅补缺失字段；`followSource` 仅刷新仍位于 `managedPaths` 的字段。模型编辑保存时会移除用户实际修改字段的受管路径，避免后续刷新覆盖用户值。
- 手动添加、预设渠道创建、渠道导入、从 API 确认添加、手动应用预设和批量应用预设均统一走物化入口。各 Provider 的模型列表解析保留 API 明确返回的数据，不再提前以默认目录补充分组或能力，避免阻止活动目录在确认写入时生效。
- 请求家族判断、Token 计算、上下文预估、模型选择能力过滤、模型图标/分组显示与媒体生成诊断改为读取已保存的模型字段。Token Worker 新增显式 `tokenizerProfileId` 传递；ID-only 的旧调用只可使用 Tokenizer 规则或 profile 模式匹配，不再读取全局模型元数据目录。
- 删除桌面端 `getActiveModelProperties()` 和运行时元数据规则兜底。ID-only 的历史展示场景仅使用静态内置图标名回退，不读取可变规则目录。`media-generator` 架构说明及其计划入口已符合“运行时只读取模型自身 `mediaGenParams`”约束，无需再改写。
- 新增物化回归测试，覆盖缺失字段补全、`followSource` 受管字段刷新、`manual` 不改写、媒体参数快照以及用户编辑字段脱离管理。

本批次的明确偏差与后续项：

- 未自动迁移或后台改写已有模型；按照第 9.2 节，旧模型保持既有字段且不写入新的 binding 状态，用户需显式执行“应用预设”或后续批次的刷新预览。
- 批次 4 仍负责目录更新差异、字段冲突选择与跨 Profile 模型刷新预览；本批次的批量应用保持现有立即写入交互，不替代该确认流程。
- 移动端已具备 v3 Store/类型兼容，但模型物化 UI 和运行时消费收口仍按批次 5 实施。未以浏览器构建替代 Tauri / 移动真实运行态验收。

验证结果：

```text
bun run check:frontend                                    # 通过
bun run check:mobile:frontend                             # 通过
bunx vitest --run src/utils/__tests__/modelMetadataMaterialization.test.ts \
  src/config/__tests__/model-metadata.test.ts \
  src/views/Settings/model-metadata/utils/__tests__/coverageAnalysis.test.ts \
  src/tools/token-calculator/core/__tests__/tokenCalculatorEngine.test.ts
                                                           # 通过，19 项契约测试
bun run test:model-metadata-core                           # 通过，6 项共享核心契约测试
bun run lint                                              # 通过（3 条既有 no-useless-spread 警告）
bun run build:vite                                        # 通过（既有第三方 externalize / eval / chunk-size 警告）
bun run --cwd mobile build                                # 通过（既有 eval / chunk-size 警告）
git diff --check                                          # 通过
```

### 2026-08-24：批次 4 完成，目录更新与模型刷新预览

已完成：

- 共享核心新增 `applyBuiltinCatalogUpdate()`：以接受后的入站 Catalog Snapshot 为新基线，支持规则新增、上游更新、删除、保留删除规则为自定义规则，并要求冲突字段逐项明确选择“保留本地”或“采用上游”。未选择的冲突字段会阻止写入；未冲突的本地字段继续形成明确 override。
- 桌面端 Store 以显式 `applyCatalogUpdate()` 取代旧 `mergeWithDefaults()` 快捷合并；目录预览只展示待处理规则，不再把无变化或纯本地规则混入更新清单。
- 设置页新增“查看目录更新”预览，展示规则状态及字段级 current/local/incoming 差异，支持冲突字段逐项决策和已删除规则的“随目录删除 / 保留为自定义规则”。目录更新仍不会自动改写模型。
- 新增“刷新模型配置”预览：扫描 `followSource` 模型、列出受管字段的实际变更，允许按模型勾选确认；保存时按 Profile 分组并报告已保存与失败渠道。
- 规则卡片显示内置、内置已修改或自定义来源；内置覆盖可一键恢复为当前内置规则。导入流程改为“选择文件 -> 解析/迁移/诊断预览 -> 确认写入”，阻塞诊断不允许确认导入。
- 共享核心补充目录更新测试，覆盖字段级冲突保留、本地 override 压缩、删除规则转自定义和未决冲突阻止写入。

本批次的明确偏差与后续项：

- 本批次完成桌面端设置逻辑与生产构建验证，但尚未将普通浏览器结果视为真实 Tauri UI 验收；第 5 批仍需按第 11.6 节记录桌面与移动目标运行态走查。
- 移动端的目录更新预览、模型刷新预览、来源/恢复和导入确认 UI 仍待批次 5 对齐；移动端现有 v3 读写继续保持兼容。

验证结果：

```text
bun run check:model-metadata-core                         # 通过
bun run test:model-metadata-core                          # 通过，8 项共享核心契约测试
bun run check:frontend                                    # 通过
bun run check:mobile:frontend                             # 通过
bunx vitest --run src/utils/__tests__/modelMetadataMaterialization.test.ts \
  src/config/__tests__/model-metadata.test.ts \
  src/views/Settings/model-metadata/utils/__tests__/coverageAnalysis.test.ts \
  src/tools/token-calculator/core/__tests__/tokenCalculatorEngine.test.ts
                                                           # 通过，19 项定向测试
bun run lint                                              # 通过（既有 no-useless-spread 警告）
bun run build:vite                                        # 通过（既有第三方 externalize / eval / chunk-size 警告）
bun run --cwd mobile build                                # 通过（既有 eval / chunk-size 警告）
git diff --check                                          # 通过
```

### 2026-08-24：批次 5（第一部分）完成，共享物化与移动端接线

已完成：

- 将 `materializeModelMetadata()` 与“用户编辑后脱离 followSource 受管字段”的逻辑迁入 `packages/model-metadata-core`，桌面端保留薄 Facade，移动端直接调用同一实现；共享核心新增模型物化契约测试。
- 移动端 `useModelMetadata()` 改为 v3 分层 Store Facade：复用共享的匹配、规则编译、迁移、校验、三方目录差异、字段级目录更新和导入诊断逻辑，删除本地规则数组反推 Store 的重复算法及空实现的 `mergeWithDefaults()`。
- 移动端模型物化字段与桌面对齐：补充 `mediaGenParams` 类型，并在渠道预设创建、API 获取模型、手动新增模型和显式应用预设时写入模型快照；编辑 followSource 模型时会将用户改动字段移出 `managedPaths`。
- 移动端模型列表、选择器、获取模型预览和请求家族判断不再为已保存模型回退读取全局元数据规则；模型获取只返回服务端发现数据，随后由明确的模型写入入口物化。
- 更新模型元数据架构、桌面设置指南和移动端 LLM API 指南，说明 v3 来源、目录更新与“目录不自动改写模型”的边界。

明确保留的后续项：

- 移动端当前没有独立的模型元数据管理页面，因此桌面端已有的“目录更新 / 字段冲突选择 / 模型刷新预览 / 导入确认”交互尚未在移动端呈现；共享 Facade 已暴露所需 `catalogDiffs`、`applyCatalogUpdate()`、`inspectImport()` 和 `materializeModel()`，后续可在移动端按任务式界面接入。
- 当前环境未执行真实 Tauri 桌面窗口或 Android/iOS 设备/模拟器走查，不能把类型检查与 Vite 构建当作第 11.6 节的真实运行态验收。后续需在目标平台完成“目录更新 -> 刷新模型 -> 部分保存失败”任务走查并记录结果。

验证结果：

```text
bun run check:model-metadata-core                         # 通过
bun run test:model-metadata-core                          # 通过，9 项共享核心契约测试
bunx vitest --run src/utils/__tests__/modelMetadataMaterialization.test.ts \
  src/config/__tests__/model-metadata.test.ts             # 通过，11 项定向测试
bun run check:frontend                                    # 通过
bun run check:mobile:frontend                             # 通过
bun run --cwd mobile build                                # 通过（既有 eval / chunk-size 警告）
git diff --check                                          # 通过
```
