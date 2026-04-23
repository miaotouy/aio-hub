# 模型元数据系统架构

> **状态**: Stable  
> **最后更新**: 2026-04-23  

---

## 1. 模块概览

模型元数据系统负责为 LLM 模型/服务商动态配置附加属性，包括图标、分组、能力开关、分词器、上下文长度、媒体生成参数约束等。它是一套基于**规则匹配**的属性注入机制：通过预先定义匹配规则，在运行时根据模型 ID 或 Provider 自动查找并应用对应属性，而无需为每个模型单独配置。

### 核心特性

- **规则匹配**：支持 Provider / 精确模型 / 前缀 / 正则四种匹配模式
- **优先级合并**：多条规则同时命中时，按优先级从低到高 `merge()`，高优先级属性覆盖低优先级
- **独占规则**：`exclusive: true` 可截断优先级更低的所有匹配，实现"完全覆盖"语义
- **持久化**：用户自定义规则保存至 AppData，应用重启后保留
- **旧版迁移**：自动检测并迁移 `localStorage` 中的 v1 格式数据

### 文件清单

| 文件                                                                                                                                                             | 职责                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`src/types/model-metadata.ts`](../../src/types/model-metadata.ts)                                                                                               | 全部 TypeScript 类型定义                           |
| [`src/config/model-metadata-presets.ts`](../../src/config/model-metadata-presets.ts)                                                                             | 出厂默认规则数据（只读，纯数据）                   |
| [`src/config/model-metadata.ts`](../../src/config/model-metadata.ts)                                                                                             | 匹配引擎纯函数 + 图标路径处理                      |
| [`src/config/preset-icons.ts`](../../src/config/preset-icons.ts)                                                                                                 | 预设图标清单（`PRESET_ICONS` / `AVAILABLE_ICONS`） |
| [`src/stores/modelMetadataStore.ts`](../../src/stores/modelMetadataStore.ts)                                                                                     | Pinia Store，全局唯一真理源                        |
| [`src/composables/useModelMetadata.ts`](../../src/composables/useModelMetadata.ts)                                                                               | Store 的薄包装，供 Vue 组件使用                    |
| [`src/views/Settings/model-metadata/ModelMetadataSettings.vue`](../../src/views/Settings/model-metadata/ModelMetadataSettings.vue)                               | 设置页主视图                                       |
| [`src/views/Settings/model-metadata/components/ModelMetadataConfigEditor.vue`](../../src/views/Settings/model-metadata/components/ModelMetadataConfigEditor.vue) | 规则编辑对话框                                     |
| [`src/views/Settings/model-metadata/components/MediaGenParamsEditor.vue`](../../src/views/Settings/model-metadata/components/MediaGenParamsEditor.vue)           | 媒体生成参数可视化编辑器                           |
| [`src/views/Settings/model-metadata/components/OptionListEditor.vue`](../../src/views/Settings/model-metadata/components/OptionListEditor.vue)                   | 通用 `{label, value}[]` 编辑组件                   |

---

## 2. 数据层

### 2.1 类型体系

核心类型定义在 [`src/types/model-metadata.ts`](../../src/types/model-metadata.ts)。

#### `ModelMetadataRule`

单条匹配规则的完整结构：

```typescript
interface ModelMetadataRule {
  id: string; // 唯一标识（内置规则为固定 ID，用户新建规则为 custom-{timestamp}-{random}）
  matchType: MetadataMatchType; // 匹配类型
  matchValue: string; // 匹配值（字符串或正则表达式）
  properties: ModelMetadataProperties; // 匹配成功时注入的属性
  priority?: number; // 优先级（数字越大越高，默认 0）
  enabled?: boolean; // 是否启用（默认 true）
  useRegex?: boolean; // 是否使用正则匹配（仅 model / modelPrefix 有效）
  exclusive?: boolean; // 独占规则（见§3.3）
  description?: string; // 备注
  createdAt?: string; // 创建时间（ISO 8601）
}
```

#### `MetadataMatchType`

| 值            | 含义                              | 匹配目标                       | 支持正则 |
| ------------- | --------------------------------- | ------------------------------ | -------- |
| `provider`    | Provider 精确匹配（大小写不敏感） | 调用方传入的 `provider` 参数   | ❌       |
| `model`       | 模型 ID 精确匹配                  | 完整 `modelId`                 | ✅       |
| `modelPrefix` | 模型 ID 包含匹配（不区分大小写）  | `modelId.includes(matchValue)` | ✅       |
| `modelGroup`  | ⚠️ 已废弃，不再使用               | —                              | —        |

> `modelPrefix` 的非正则模式使用 `includes()` 而非 `startsWith()`，可兼容 `user/model-name` 格式的 HuggingFace 风格 ID。

#### `ModelMetadataProperties`

开放式属性包，当前已定义的字段：

| 字段             | 类型                 | 用途                                                                |
| ---------------- | -------------------- | ------------------------------------------------------------------- |
| `icon`           | `string`             | 图标路径（相对路径或绝对路径）                                      |
| `group`          | `string`             | 在模型选择器中显示的分组名称                                        |
| `capabilities`   | `ModelCapabilities`  | 模型能力开关（视觉/思考/工具调用/图像生成等）                       |
| `tokenizer`      | `string`             | 分词器名称（`tiktoken`/`llama`/`huggingface`），供 Token 计算器使用 |
| `contextLength`  | `number`             | 上下文窗口长度（token 数）                                          |
| `mediaGenParams` | `MediaGenParamRules` | 媒体生成参数约束（见§2.3）                                          |
| `pricing`        | `object`             | 输入/输出价格（每百万 token，含单位和备注）                         |
| `description`    | `string`             | 模型描述                                                            |
| `recommendedFor` | `string[]`           | 推荐用途标签                                                        |
| `[key: string]`  | `unknown`            | 任意扩展字段                                                        |

#### `ModelMetadataStore`

持久化存储格式：

```typescript
interface ModelMetadataStore {
  version: string; // 当前为 "2.0.0"
  rules: ModelMetadataRule[];
  updatedAt?: string;
}
```

### 2.2 Pinia Store

[`src/stores/modelMetadataStore.ts`](../../src/stores/modelMetadataStore.ts) 是**全局唯一真理源**。

**持久化**：通过 `createConfigManager` 将数据存储到 `AppData/model-metadata/metadata-rules.json`。

**旧版数据迁移**（v1 → v2）：`loadRules()` 在加载时会检查 `localStorage` 中是否存在 `model-icon-configs` key。若存在，则自动将旧格式（`configs[]`，含 `iconPath`、`groupName` 等字段）映射为新的 `rules[]` 格式，迁移完成后删除 `localStorage` 中的旧数据。

**暴露的 API**：

```typescript
// 状态
rules: ModelMetadataRule[]     // 响应式规则列表
isLoaded: boolean
enabledCount: number           // 启用规则数（computed）
presetIcons: PresetIconInfo[]  // 预设图标列表（来自 preset-icons.ts）

// CRUD
loadRules()
saveRules()
addRule(rule)      // 自动生成 id 和 createdAt
updateRule(id, updates)
deleteRule(id)
toggleRule(id)     // 切换 enabled 状态

// 批量操作
resetToDefaults()         // 清除用户配置，回到出厂默认
mergeWithDefaults()       // 保留用户规则，补充内置中缺失的规则，返回 {added, updated}

// 查询
getMatchedRule(modelId, provider?)  // 返回第一条匹配的规则（仅用于调试/测试模式）
```

**非 Vue 代码访问入口**（模块级函数，Store 未初始化时降级到默认规则）：

```typescript
// src/stores/modelMetadataStore.ts
export function getActiveRules(): ModelMetadataRule[];
```

### 2.3 媒体生成参数规则（`MediaGenParamRules`）

`MediaGenParamRules` 是 `ModelMetadataProperties.mediaGenParams` 的类型，用于描述一个图像/视频生成模型支持的参数约束。

**字段语义约定**：

| 状态                       | 含义                              | 数据格式           |
| -------------------------- | --------------------------------- | ------------------ |
| 字段缺失（`undefined`）    | 不限制，透传用户输入              | —                  |
| `{ supported: false }`     | 明确不支持，发送请求时剔除此参数  | —                  |
| `{ supported: true, ... }` | 支持，附带 options/min/max 等约束 | 各参数有具体子结构 |

**尺寸控制**（三种互斥模式）：

| 字段                | 对应模式                                   | 适用接口                                          |
| ------------------- | ------------------------------------------ | ------------------------------------------------- |
| `size`              | 标准尺寸（`widthxheight` 格式）            | OpenAI / SiliconFlow 的 `size` 参数               |
| `aspectRatioMode`   | 宽高比 + 分辨率分离                        | xAI grok-imagine 的 `aspect_ratio` + `resolution` |
| `geminiImageConfig` | Gemini 专属（`aspectRatio` + `imageSize`） | Gemini `generateContent` 的 `imageConfig`         |

`size.mode` 有两个子选项：

- `preset`：只能从预设列表选择（DALL-E 3、FLUX 等）
- `free`：自由输入宽高，通过 `constraints` 设置最大宽高/步长/最大比例等限制

**其他可配置参数**：`quality`、`style`、`negativePrompt`、`seed`、`steps`、`guidanceScale`、`background`、`outputFormat`、`outputCompression`、`batchSize`、`moderation`、`partialImages`。

---

## 3. 匹配引擎

### 3.1 入口函数

匹配引擎的核心纯函数在 [`src/config/model-metadata.ts`](../../src/config/model-metadata.ts)。

**主线程 Vue 组件**（通过 `useModelMetadata` composable）：

```typescript
// 内部调用，已注入当前 store.rules
getMatchedProperties(modelId, provider?) → ModelMetadataProperties | undefined
getModelProperty(model, propertyKey, defaultValue?) → value | undefined
getModelGroup(model) → string
getModelIcon(model) → string | null
```

**主线程非 Vue 代码**（`request-builder`、`preview-builder`、`tokenCalculator.registry` 等）：

```typescript
import { getActiveModelProperties } from "@/config/model-metadata";
// 内部自动调用 getActiveRules()，走 Pinia Store
const props = getActiveModelProperties(modelId, provider);
```

**Worker 线程**（[`tokenCalculatorEngine.ts`](../../src/tools/token-calculator/core/tokenCalculatorEngine.ts)）：Worker 中维护了一份独立的匹配函数实现，直接使用 `DEFAULT_METADATA_RULES`。这是**可接受的降级**：用户几乎不会修改分词器映射规则，且 Worker 无法直接访问 Pinia Store。

### 3.2 优先级合并算法

```
getMatchedModelProperties(rules, modelId, provider):

1. 过滤 enabled !== false 的规则
2. 按 priority 降序排序
3. 调用 testRuleMatch() 逐条测试，收集所有命中规则
4. 如果命中列表为空 → 返回 undefined
5. 在命中列表中找优先级最高的 exclusive=true 规则（highestExclusiveRule）
6. 若存在 → 截断优先级低于 highestExclusiveRule 的所有命中
7. 将剩余命中规则从低优先级到高优先级排列
8. 使用 lodash merge() 逐层合并各规则的 properties
9. 返回最终合并结果
```

**合并语义**：高优先级规则的属性**覆盖**低优先级规则的同名属性；不同属性的设置**叠加**（同一模型可以同时从 Provider 规则继承图标、从 modelPrefix 规则继承能力开关）。

### 3.3 `exclusive` 独占规则

```
场景：
  规则 A（priority=100, exclusive=true）: provider=openai → icon=openai.svg
  规则 B（priority=50）: modelPrefix=gpt → group=GPT 系列
  规则 C（priority=10）: provider=openai → tokenizer=tiktoken

查询 modelId="gpt-4o", provider="openai"：
  命中规则：A、B、C
  A 是最高优先级的 exclusive 规则 → 截断 priority<100 的规则（B 和 C 被丢弃）
  最终只合并 A 的 properties
```

`exclusive` 的典型用途：为某个特定模型定义完全独立的配置，不希望被更低优先级的通配规则"污染"。

### 3.4 `testRuleMatch` 匹配逻辑细节

```typescript
// provider 匹配（大小写不敏感，无正则）
case "provider":
  matched = provider?.toLowerCase() === rule.matchValue.toLowerCase()

// model 精确匹配（支持正则）
case "model":
  matched = useRegex ? regex.test(modelId) : modelId === matchValue

// modelPrefix 包含匹配（支持正则；非正则模式用 includes 而非 startsWith）
case "modelPrefix":
  matched = useRegex ? regex.test(modelId) : modelId.toLowerCase().includes(matchValue.toLowerCase())

// modelGroup 已废弃，始终返回 false
case "modelGroup":
  matched = false
```

---

## 4. 图标路径处理

### 4.1 两套来源，有优先级

```
getModelIconPath(rules, modelId, provider):

1. 规则匹配：getMatchedModelProperties() → properties.icon
   → 若存在且非空，直接返回

2. 动态回退（规则未配置图标时）：
   候选列表 = [provider, modelId, modelId 按 [-_/] 拆分的各部分]
   去重后逐个在 AVAILABLE_ICONS 中查找：
     /model-icons/{candidate}-color.svg  （优先 color 版本）
     /model-icons/{candidate}.svg
   → 返回第一个存在的路径，全部未命中则返回 undefined
```

### 4.2 显示路径转换

[`getDisplayIconPath(iconPath)`](../../src/composables/useModelMetadata.ts)：

| 输入                                                            | 处理               | 输出                            |
| --------------------------------------------------------------- | ------------------ | ------------------------------- |
| Windows 绝对路径（`C:\...\icon.png`）                           | `convertFileSrc()` | `https://asset.localhost/...`   |
| Unix 绝对路径（`/home/user/icon.svg`，非 `/model-icons/` 前缀） | `convertFileSrc()` | `https://asset.localhost/...`   |
| 相对路径 / `/model-icons/...` 前缀路径                          | 直接返回           | `/model-icons/openai-color.svg` |

本地文件路径（通过 Tauri Dialog 选择）会被 `convertFileSrc()` 转换为 `tauri://localhost` 协议 URL，确保 Webview 可以跨域访问。

### 4.3 路径规范化

[`normalizeIconPath(iconPath)`](../../src/config/model-metadata.ts)：若输入是纯文件名（不含 `/` 和 `\`），则尝试补全 `/model-icons/` 前缀并检查是否在 `AVAILABLE_ICONS` 中存在。主要用于旧版数据迁移。

---

## 5. Composable API

[`useModelMetadata()`](../../src/composables/useModelMetadata.ts) 是 `useModelMetadataStore` 的薄包装，供 Vue 组件使用。主要附加价值：

1. 将 Store 的原始 `rules` 包装为响应式 `computed`
2. 提供 `getMatchedProperties()`、`getModelProperty()`、`getModelGroup()`、`getModelIcon()` 等高级查询方法（内部自动注入当前 Store rules）
3. 提供 `exportRules()` / `importRules()` 的序列化/反序列化实现
4. 暴露 `getDisplayIconPath()`、`validateIconPath()` 工具函数

返回的所有 Store 操作方法（`addRule`、`updateRule` 等）直接透传，无额外包装。

---

## 6. UI 层

### 6.1 `ModelMetadataSettings.vue` — 主视图

设置页的主视图，路径 [`src/views/Settings/model-metadata/ModelMetadataSettings.vue`](../../src/views/Settings/model-metadata/ModelMetadataSettings.vue)。

**功能分区**：

| 区域         | 功能                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 头部统计栏   | 总配置数 / 启用数 / 当前显示数                                                                       |
| 操作按钮     | 查看预设 / 导入 / 导出 / 合并最新配置 / 重置为默认 / 添加配置                                        |
| 工具栏       | 搜索 / 排序（priority/type/name/createdAt）/ 状态筛选（all/enabled/disabled）/ 视图切换（网格/列表） |
| 测试模式面板 | 输入模型 ID + Provider，实时展示匹配结果（见§6.2）                                                   |
| 规则卡片列表 | 分页展示（12/24/48/96 条/页），每条支持启用/禁用/编辑/删除                                           |

**搜索范围**：`matchValue`、`matchType`、`description`、`properties.group`。

**导入/导出格式**（JSON）：

```json
{
  "version": "2.0.0",
  "rules": [...],
  "updatedAt": "2026-04-23T00:00:00.000Z"
}
```

### 6.2 测试模式

工具栏提供一个开关进入测试模式。进入后：

- 搜索框替换为"模型 ID"和"Provider"两个输入框
- 页面出现**匹配测试结果面板**，实时展示：
  - 匹配状态（已匹配 ✓ / 未匹配 ✗）
  - 命中规则的详情（matchType/matchValue/priority/图标路径/图标预览/分组）
  - 未命中时：调试提示 + 候选规则列表（按优先级排序，最多 10 条）

候选规则筛选逻辑：`matchValue` 包含搜索词、或搜索词包含 `matchValue`、或 provider 类型规则与 provider 输入相关。

### 6.3 `ModelMetadataConfigEditor.vue` — 规则编辑对话框

尺寸：`width="min(90%, 1000px)"` / `height="85vh"`，使用 `BaseDialog` 封装。

**表单布局（分区折叠）**：

```
[匹配规则区] — el-divider，常驻
  matchType / matchValue / useRegex（checkbox）/ priority / group / enabled / description

[图标设置区] — el-divider，常驻
  图标路径输入 + [选择文件（Tauri Dialog）] + [选择预设] + 实时预览

[模型能力] — el-collapse-item，默认展开
  复用 MODEL_CAPABILITIES 配置，渲染能力开关网格（20+ 项）
  注：编辑的是元数据预设默认值，实际生效以渠道设置为准

[媒体生成参数规则] — el-collapse-item，条件显示
  仅当 capabilities.imageGeneration === true 时出现
  → 嵌套 MediaGenParamsEditor 组件

[扩展属性] — el-collapse-item，默认折叠
  contextLength / tokenizer / recommendedFor / description

[高级：原始 JSON 编辑] — el-collapse-item，默认折叠
  RichCodeEditor（language=json）双向同步 properties 对象
  JSON 语法错误时标红不更新表单
```

**`useRegex` 的可用性**：仅 `model` 和 `modelPrefix` 类型的规则可以启用正则，`provider` 和 `modelGroup` 类型禁用（`canUseRegex` computed）。

**保存前清理**（`cleanProperties()`）：移除全为 `false` 的 capabilities 对象、空字符串的 icon/group/tokenizer、空数组的 recommendedFor。

**本地文件选择**：调用 `@tauri-apps/plugin-dialog` 的 `open()`，过滤 `png/jpg/jpeg/svg/webp/ico` 格式。

### 6.4 `MediaGenParamsEditor.vue` — 媒体参数编辑

接受 `v-model: MediaGenParamRules | undefined`，内部维护本地状态，通过 `watch` 双向同步。

**尺寸模式**（Radio Group，四选一）：

| 选项            | 展示的子表单                                                           | 数据写入字段        |
| --------------- | ---------------------------------------------------------------------- | ------------------- |
| 不配置          | —                                                                      | 清除所有尺寸字段    |
| 标准尺寸 (size) | mode 选择 + 预设列表（OptionListEditor）+ 默认值选择器 + free 模式约束 | `size`              |
| 宽高比 (xAI)    | 宽高比列表 + 分辨率列表（OptionListEditor）                            | `aspectRatioMode`   |
| Gemini 模式     | 宽高比列表 + 尺寸等级列表（OptionListEditor）                          | `geminiImageConfig` |

切换尺寸模式时，自动清除其他模式的字段（`watch(sizeMode, ...)`）。

**参数支持三态**（Radio Button Group：不限 / 支持 / 不支持）：

可配置参数（`supportableParams` 数组定义）：

| 参数 key         | 标签        | 类型    | "支持"时的子表单              |
| ---------------- | ----------- | ------- | ----------------------------- |
| `quality`        | 质量        | options | OptionListEditor + 默认值选择 |
| `style`          | 风格        | options | 同上                          |
| `background`     | 背景/透明度 | options | 同上                          |
| `outputFormat`   | 输出格式    | options | 同上                          |
| `moderation`     | 内容审核    | options | 同上                          |
| `negativePrompt` | 负向提示词  | boolean | 无（启用即可）                |
| `seed`           | 随机种子    | number  | min / max 输入                |
| `steps`          | 迭代步数    | number  | min / max / default           |
| `guidanceScale`  | 引导系数    | number  | 同上                          |
| `batchSize`      | 批量生成    | number  | 同上                          |

状态变化时：`unlimited` → 删除该字段；`unsupported` → `{ supported: false }`；`supported` → 按类型初始化 `{ supported: true, options: [] }` 或 `{ supported: true }`。

### 6.5 `OptionListEditor.vue` — 通用选项列表编辑器

接受 `v-model: Array<{label: string; value: string}>`，提供添加/删除操作。

特殊行为：`value` 输入框失焦（`blur`）时，若 `label` 为空则自动使用 `value` 填充 label，减少重复输入。

---

## 7. 数据流总图

```
 model-metadata-presets.ts
 （纯数据，出厂默认，只读）
          │
          │ 初始化/重置
          ▼
 modelMetadataStore (Pinia)          ← 全局唯一真理源 ★
 metadata-rules.json (AppData 持久化)
          │
          ├── Vue 组件
          │     └── useModelMetadata()（薄包装 Composable）
          │           └── ModelMetadataSettings.vue
          │               ModelMetadataConfigEditor.vue
          │               MediaGenParamsEditor.vue
          │               OptionListEditor.vue
          │
          └── 非 Vue 主线程代码
                └── getActiveModelProperties()（config/model-metadata.ts）
                      └── getActiveRules()（stores/modelMetadataStore.ts）
                            │
                            ├── request-builder.ts（模型家族路由判断）
                            ├── preview-builder.ts（vision token 计算）
                            ├── useTokenCalculatorState.ts（分词器匹配）
                            └── tokenCalculator.registry.ts（跨模块服务）

 model-metadata-presets.ts ─────────→ tokenCalculatorEngine.ts（Worker，降级可接受）
```

---

## 8. 与其他模块的集成点

| 消费模块                                                                                                                                       | 使用方式                                           | 用途                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| [`src/llm-apis/request-builder.ts`](../../src/llm-apis/request-builder.ts)                                                                     | `getActiveModelProperties()`                       | 判断模型家族（Claude/Gemini/OpenAI）以选择正确的请求构建器     |
| [`src/tools/llm-chat/core/context-utils/preview-builder.ts`](../../src/tools/llm-chat/core/context-utils/preview-builder.ts)                   | `getActiveModelProperties()`                       | 判断模型是否支持视觉，用于 vision token 计算                   |
| [`src/tools/token-calculator/composables/useTokenCalculatorState.ts`](../../src/tools/token-calculator/composables/useTokenCalculatorState.ts) | `getActiveModelProperties()`                       | 匹配 `tokenizer` 字段选择计算策略                              |
| [`src/tools/token-calculator/tokenCalculator.registry.ts`](../../src/tools/token-calculator/tokenCalculator.registry.ts)                       | `getActiveModelProperties()`                       | 提供跨模块 Token 计算服务时匹配分词器                          |
| [`src/views/Settings/llm-service/components/ModelEditDialog.vue`](../../src/views/Settings/llm-service/components/ModelEditDialog.vue)         | `useModelMetadata().getMatchedProperties()`        | "应用预设"按钮：根据模型 ID 自动填充 capabilities、icon 等属性 |
| [`src/tools/media-generator/`](../../src/tools/media-generator/)                                                                               | `getActiveModelProperties()` 读取 `mediaGenParams` | 渲染图像生成 UI 时根据元数据约束显示参数控件                   |

---

## 9. 扩展指南

### 9.1 添加新的 `ModelMetadataProperties` 字段

1. 在 [`src/types/model-metadata.ts`](../../src/types/model-metadata.ts) 的 `ModelMetadataProperties` 接口中添加字段定义和 JSDoc 注释
2. 在 [`src/views/Settings/model-metadata/components/ModelMetadataConfigEditor.vue`](../../src/views/Settings/model-metadata/components/ModelMetadataConfigEditor.vue) 的"扩展属性"折叠区中添加对应表单控件
3. 在 `cleanProperties()` 中处理新字段的清理逻辑（避免存储无意义的空值）
4. 在消费方通过 `getActiveModelProperties()` 或 `useModelMetadata().getModelProperty()` 读取新字段

### 9.2 添加新的 `MediaGenParamRules` 参数

1. 在 [`src/types/model-metadata.ts`](../../src/types/model-metadata.ts) 的 `MediaGenParamRules` 接口中添加字段
2. 在 [`src/views/Settings/model-metadata/components/MediaGenParamsEditor.vue`](../../src/views/Settings/model-metadata/components/MediaGenParamsEditor.vue) 的 `supportableParams` 数组中注册新参数（含 `key`、`label`、`type`）
3. 在媒体生成器的参数构建逻辑中读取并应用新约束

### 9.3 添加新的预设内置规则

在 [`src/config/model-metadata-presets.ts`](../../src/config/model-metadata-presets.ts) 的 `DEFAULT_METADATA_RULES` 数组中添加新规则对象。注意：

- `id` 必须全局唯一且稳定（用于 `mergeWithDefaults()` 的去重判断）
- 新规则在用户已有自定义配置时，需要用户手动点击"合并最新配置"才会生效
