# 模型元数据编辑器现代化改造 + mediaGenParams 可视化编辑

**状态**: Draft
**作者**: 咕咕
**日期**: 2026-04-23
**关联模块**: `model-metadata`, `media-generator`
**前置依赖**: `media-generator-parameter-rules-system-v2.md` (P1~P4 已完成)

---

## 0. 背景与问题

### 0.1 两个编辑器的现状对比

项目中存在两个模型相关的编辑器，但功能差距巨大：

| 维度               | `ModelEditDialog`（LLM 服务设置）            | `ModelMetadataConfigEditor`（元数据设置）                    |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| **位置**           | `src/views/Settings/llm-service/components/` | `src/views/Settings/model-metadata/components/`              |
| **用途**           | 编辑渠道内单个模型的完整信息                 | 编辑全局元数据匹配规则                                       |
| **UI 框架**        | Element Plus（el-form, el-input 等）         | 原生 HTML（input, select, button）                           |
| **基础信息**       | ✅ ID、名称、分组、描述、图标                | ✅ matchType、matchValue、useRegex、图标、优先级、分组、描述 |
| **能力开关**       | ✅ 完整的 capabilities 网格（20+ 项）        | ❌ 无                                                        |
| **思考配置**       | ✅ configType + effort 等级                  | ❌ 无                                                        |
| **Token 限制**     | ✅ 上下文窗口 + 输出限制（含预设快捷值）     | ❌ 无                                                        |
| **价格信息**       | ✅ 输入/输出/请求/图像价格                   | ❌ 无                                                        |
| **自定义参数**     | ✅ JSON 代码编辑器                           | ❌ 无                                                        |
| **后处理规则**     | ✅ PostProcessingPanel                       | ❌ 无                                                        |
| **预设应用**       | ✅ 根据模型 ID 自动填充                      | ❌ 无                                                        |
| **mediaGenParams** | ❌ 无                                        | ❌ 无                                                        |
| **对话框尺寸**     | 75% 宽 × 75vh 高                             | 800px 宽 × 90vh 高                                           |

### 0.2 核心问题

1. **元数据编辑器严重落后**：`ModelMetadataConfigEditor` 本质上还是早期的"图标规则编辑器"，`ModelMetadataProperties` 接口上已经定义了 `capabilities`、`contextLength`、`pricing`、`features`、`mediaGenParams` 等大量字段，但编辑器完全不支持编辑这些属性
2. **能力开关是 mediaGenParams 的门控**：`imageGeneration` 能力开关决定了模型是否出现在媒体生成器的模型列表中，应作为 mediaGenParams 编辑区域的前置条件
3. **UI 风格不统一**：元数据编辑器使用原生 HTML 表单，与项目整体的 Element Plus 风格不一致

---

## 1. 改造目标

### 1.1 本次范围

将 `ModelMetadataConfigEditor` 升级为功能完整的元数据规则编辑器，重点：

1. **UI 统一**：从原生 HTML 迁移到 Element Plus 组件
2. **能力编辑**：复用 `MODEL_CAPABILITIES` 配置，添加 capabilities 网格开关
3. **mediaGenParams 可视化编辑**：当 `imageGeneration` 能力开启时，展示参数规则编辑面板
4. **扩展属性编辑**：支持 `contextLength`、`tokenizer`、`pricing` 等常用属性
5. **JSON 兜底**：提供原始 JSON 编辑器作为高级编辑模式

### 1.2 不在本次范围

- ❌ 修改 `ModelEditDialog`（它已经足够完善）
- ❌ 两个编辑器的合并（它们的职责不同：一个编辑具体模型实例，一个编辑全局匹配规则）
- ❌ Gemini Image Adapter 实现

---

## 2. 架构设计

### 2.1 编辑器整体结构

改造后的 `ModelMetadataConfigEditor` 将采用**分区折叠**布局，使用 `el-form` + `el-divider` + 可折叠区域：

```
┌─────────────────────────────────────────┐
│  编辑配置 / 添加配置                      │
├─────────────────────────────────────────┤
│  ── 匹配规则 ──                          │
│  [匹配类型] [匹配值] [√ 正则]            │
│  [优先级] [分组名称]                      │
│  [描述]                                  │
│  [√ 启用]                                │
├─────────────────────────────────────────┤
│  ── 图标 ──                              │
│  [图标路径] [选择文件] [选择预设]          │
│  [图标预览]                              │
├─────────────────────────────────────────┤
│  ▸ 模型能力 (可折叠)                      │
│  ┌──────────────────────────────────┐    │
│  │ [视觉] [思考] [联网] [工具] ...   │    │
│  │ [图像生成] [视频生成] [音频生成]   │    │
│  │ ...20+ 能力开关                   │    │
│  └──────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ▸ 媒体生成参数规则 (条件显示)             │
│  (仅当 imageGeneration=true 时展示)       │
│  ┌──────────────────────────────────┐    │
│  │ [尺寸模式选择: preset/free/...]   │    │
│  │ [预设列表编辑]                    │    │
│  │ [质量/风格/背景 等参数开关]        │    │
│  │ [高级参数: seed/steps/cfg 等]     │    │
│  └──────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ▸ 扩展属性 (可折叠)                      │
│  [上下文长度] [分词器] [描述]              │
├─────────────────────────────────────────┤
│  ▸ 高级: JSON 编辑 (可折叠)               │
│  ┌──────────────────────────────────┐    │
│  │ RichCodeEditor (JSON)             │    │
│  └──────────────────────────────────┘    │
├─────────────────────────────────────────┤
│                    [取消]  [保存]         │
└─────────────────────────────────────────┘
```

### 2.2 能力开关与 mediaGenParams 的联动

```
imageGeneration 能力开关 ──┬── OFF ──→ mediaGenParams 编辑区域隐藏
                          └── ON  ──→ mediaGenParams 编辑区域展示
                                      ├── 尺寸模式选择器
                                      ├── 参数支持开关组
                                      └── 各参数的细节配置
```

同理，`videoGeneration` 和 `audioGeneration` 能力开关未来也可以各自门控对应的参数规则编辑区域（本期暂不实现视频/音频的参数规则）。

### 2.3 对话框尺寸调整

当前 800px 宽度不足以容纳新增的内容。改为响应式：

- **宽度**：`min(90%, 1000px)`
- **高度**：`85vh`

---

## 3. mediaGenParams 可视化编辑面板设计

### 3.1 尺寸模式选择器

三种互斥模式通过 `el-radio-group` 切换：

```
○ 标准尺寸 (size)        → 展示 mode 选择 + presets 编辑 + constraints 编辑
○ 宽高比模式 (xAI)       → 展示 ratios 编辑 + resolutions 编辑
○ Gemini 模式 (gemini)   → 展示 aspectRatios 编辑 + imageSizes 编辑
○ 不配置尺寸             → 不设置任何尺寸相关字段
```

选择后，未选中模式的字段自动清除（设为 undefined）。

### 3.2 参数支持开关组

每个参数（quality、style、negativePrompt、seed、steps、guidanceScale、background 等）提供三态选择：

```
┌─────────────────────────────────────────────┐
│  质量 (quality)      ○ 不限制  ○ 支持  ○ 不支持  │
│  风格 (style)        ○ 不限制  ○ 支持  ○ 不支持  │
│  负向提示词           ○ 不限制  ○ 支持  ○ 不支持  │
│  种子 (seed)         ○ 不限制  ○ 支持  ○ 不支持  │
│  迭代步数 (steps)    ○ 不限制  ○ 支持  ○ 不支持  │
│  引导系数 (cfg)      ○ 不限制  ○ 支持  ○ 不支持  │
│  背景透明度           ○ 不限制  ○ 支持  ○ 不支持  │
│  输出格式             ○ 不限制  ○ 支持  ○ 不支持  │
│  输出压缩             ○ 不限制  ○ 支持  ○ 不支持  │
│  批量生成 (n)        ○ 不限制  ○ 支持  ○ 不支持  │
│  ...                                          │
└─────────────────────────────────────────────┘
```

- **不限制**（默认）：字段设为 `undefined`，透传用户输入
- **支持**：字段设为 `{ supported: true, ... }`，展开详细配置
- **不支持**：字段设为 `{ supported: false }`

### 3.3 "支持"状态的详细配置

当选择"支持"时，根据参数类型展开不同的子表单：

#### 3.3.1 带 options 的参数（quality、style、background、moderation、outputFormat）

```
┌─────────────────────────────────────────┐
│  质量 (quality)    [● 支持]              │
│  ┌─────────────────────────────────┐    │
│  │ 选项列表:                        │    │
│  │ [标签: 标准] [值: standard] [×]  │    │
│  │ [标签: 高清] [值: hd]       [×]  │    │
│  │         [+ 添加选项]             │    │
│  │ 默认值: [standard ▾]            │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

使用动态表格或 tag-input 风格编辑 `{label, value}` 数组。

#### 3.3.2 带 min/max 的数值参数（seed、steps、guidanceScale、batchSize 等）

```
┌─────────────────────────────────────────┐
│  迭代步数 (steps)  [● 支持]              │
│  ┌─────────────────────────────────┐    │
│  │ 最小值: [1  ]  最大值: [100]     │    │
│  │ 默认值: [28 ]  步长:   [1  ]     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

#### 3.3.3 简单 boolean 参数（negativePrompt）

选择"支持"即可，无额外配置。

#### 3.3.4 尺寸 preset 列表编辑

```
┌──────────────────────────────────────────┐
│  预设尺寸列表:                             │
│  ┌────────────────────────────────────┐  │
│  │ [标签: 1:1 (1024×1024)] [值: 1024x1024] [×] │
│  │ [标签: 横屏]           [值: 1792x1024] [×] │
│  │ [标签: 竖屏]           [值: 1024x1792] [×] │
│  │              [+ 添加预设]                │
│  └────────────────────────────────────┘  │
│  默认值: [1024x1024 ▾]                    │
│                                          │
│  □ 自由输入模式 (free)                     │
│  ┌────────────────────────────────────┐  │
│  │ 最大宽度: [3840]  最大高度: [3840]  │  │
│  │ 步长: [16]  最大比例: [3]           │  │
│  │ 最小像素: [655360]  最大像素: [8294400] │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 3.4 JSON 兜底编辑器

在 mediaGenParams 区域底部，提供一个可折叠的 JSON 编辑器：

```
▸ 高级: 直接编辑 JSON
  ┌──────────────────────────────────┐
  │ {                                │
  │   "size": {                      │
  │     "mode": "preset",            │
  │     "presets": [...]             │
  │   },                             │
  │   "quality": {                   │
  │     "supported": true,           │
  │     "options": [...]             │
  │   }                              │
  │ }                                │
  └──────────────────────────────────┘
  ⚠️ JSON 编辑会覆盖上方表单的配置
```

- JSON 编辑器与表单之间是**双向同步**的：
  - 修改表单 → 自动更新 JSON
  - 修改 JSON → 如果合法则自动更新表单
- 当 JSON 语法错误时，显示错误提示，不更新表单

---

## 4. 能力编辑面板设计

### 4.1 复用 MODEL_CAPABILITIES 配置

直接复用 `src/config/model-capabilities.ts` 中的 `MODEL_CAPABILITIES` 数组，渲染与 `ModelEditDialog` 相同风格的能力网格：

```typescript
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";

// 在 localConfig.properties 中初始化 capabilities
if (!localConfig.value.properties) localConfig.value.properties = {};
if (!localConfig.value.properties.capabilities) localConfig.value.properties.capabilities = {};
```

### 4.2 UI 布局

采用与 `ModelEditDialog` 一致的 `.capabilities-grid` 网格布局：

```
┌──────────────────────────────────────────────┐
│  ── 模型能力 ──                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 👁 视觉│ │ 🧠 思考│ │ 🌐 联网│ │ 🧩 工具 │        │
│  │ [  ○ ]│ │ [  ○ ]│ │ [  ○ ]│ │ [  ○ ]│        │
│  └──────┘ └──────┘ └──────┘ └──────┘        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 🖼 生图│ │ 🎬 生视│ │ 🎵 生音│ │ 🎤 语音 │        │
│  │ [  ● ]│ │ [  ○ ]│ │ [  ○ ]│ │ [  ○ ]│        │
│  └──────┘ └──────┘ └──────┘ └──────┘        │
│  ... (更多能力)                               │
│                                              │
│  ⓘ 注：这里编辑的是元数据预设中的默认能力。      │
│     模型实例的能力以渠道设置中的配置为准。        │
└──────────────────────────────────────────────┘
```

### 4.3 与 mediaGenParams 的联动

```typescript
const showMediaGenParams = computed(() => {
  return localConfig.value?.properties?.capabilities?.imageGeneration === true;
});
```

当 `imageGeneration` 开关从 ON 切换为 OFF 时，**不自动清除** `mediaGenParams` 数据（避免误操作丢失配置），而是隐藏编辑区域并在保存时添加提示。

---

## 5. 扩展属性编辑面板

在能力和 mediaGenParams 之后，添加一个可折叠的"扩展属性"区域：

```
▸ 扩展属性
  ┌──────────────────────────────────────────┐
  │  上下文长度:  [          ] tokens          │
  │  分词器:      [tiktoken ▾]                │
  │  模型描述:    [                     ]      │
  │  推荐用途:    [对话] [代码生成] [+ 添加]    │
  └──────────────────────────────────────────┘
```

这些字段直接映射到 `ModelMetadataProperties` 的已有属性。

---

## 6. 文件改动清单

| 文件                                                                         | 变更类型 | 说明                                                                                    |
| ---------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `src/views/Settings/model-metadata/components/ModelMetadataConfigEditor.vue` | **重构** | 从原生 HTML 迁移到 Element Plus，添加能力网格、mediaGenParams 编辑、扩展属性、JSON 兜底 |
| `src/views/Settings/model-metadata/components/MediaGenParamsEditor.vue`      | **新建** | mediaGenParams 可视化编辑子组件，可独立测试                                             |
| `src/views/Settings/model-metadata/components/OptionListEditor.vue`          | **新建** | 通用的 `{label, value}[]` 数组编辑子组件，供 mediaGenParams 中多处复用                  |
| `src/views/Settings/model-metadata/ModelMetadataSettings.vue`                | **微调** | 对话框尺寸调整，移除 `handleSave` 中对 `properties.icon` 的强制校验（改为可选）         |

### 6.1 组件拆分策略

为避免单文件过大，将 mediaGenParams 编辑独立为子组件：

```
ModelMetadataConfigEditor.vue  (主编辑器，约 400 行)
├── MediaGenParamsEditor.vue   (mediaGenParams 编辑面板，约 500 行)
│   └── OptionListEditor.vue   (label/value 数组编辑器，约 150 行)
```

---

## 7. 数据流设计

### 7.1 表单数据结构

编辑器内部维护一个 `localConfig` 响应式对象，结构遵循 `ModelMetadataRule`：

```typescript
const localConfig = ref<Partial<ModelMetadataRule>>({
  matchType: "modelPrefix",
  matchValue: "",
  properties: {
    icon: "",
    group: "",
    capabilities: {}, // 新增
    contextLength: undefined, // 新增
    tokenizer: undefined, // 新增
    mediaGenParams: undefined, // 新增
  },
  priority: 10,
  enabled: true,
  description: "",
});
```

### 7.2 mediaGenParams 的双向绑定

`MediaGenParamsEditor` 通过 `v-model` 绑定 `localConfig.properties.mediaGenParams`：

```vue
<MediaGenParamsEditor v-if="showMediaGenParams" v-model="localConfig.properties!.mediaGenParams" />
```

### 7.3 保存前清理

保存时移除值为 `undefined` 或空对象的属性，避免存储冗余数据：

```typescript
function cleanProperties(props: ModelMetadataProperties): ModelMetadataProperties {
  const cleaned = { ...props };

  // 移除空的 capabilities
  if (cleaned.capabilities && Object.keys(cleaned.capabilities).length === 0) {
    delete cleaned.capabilities;
  }

  // 移除 undefined 的 mediaGenParams
  if (cleaned.mediaGenParams === undefined) {
    delete cleaned.mediaGenParams;
  }

  // 移除空字符串
  if (!cleaned.icon) delete cleaned.icon;
  if (!cleaned.group) delete cleaned.group;
  if (!cleaned.tokenizer) delete cleaned.tokenizer;

  return cleaned;
}
```

---

## 8. 验证规则调整

### 8.1 现有问题

当前 `ModelMetadataSettings.vue` 的 [`handleSave()`](src/views/Settings/model-metadata/ModelMetadataSettings.vue:514) 强制要求 `properties.icon` 必填：

```typescript
if (!config.matchValue || !config.properties?.icon) {
  alert("请填写匹配值和图标路径");
  return;
}
```

这对 mediaGenParams 规则来说不合理——一个纯粹用于定义生成参数的规则可能不需要设置图标。

### 8.2 修改方案

改为只校验 `matchValue`（必填），`icon` 改为可选：

```typescript
if (!config.matchValue) {
  customMessage.warning("请填写匹配值");
  return;
}
```

同时在 `ModelMetadataConfigEditor` 内部也同步修改校验逻辑。

---

## 9. 实施阶段

| 阶段 | 任务                                            | 估时 | 依赖   |
| ---- | ----------------------------------------------- | ---- | ------ |
| P1   | UI 迁移：将原生 HTML 表单替换为 Element Plus    | 小   | 无     |
| P2   | 能力编辑网格：复用 MODEL_CAPABILITIES           | 小   | P1     |
| P3   | OptionListEditor 通用组件                       | 小   | P1     |
| P4   | MediaGenParamsEditor 子组件                     | 中   | P3     |
| P5   | 联动逻辑：imageGeneration ↔ mediaGenParams 显隐 | 小   | P2, P4 |
| P6   | 扩展属性编辑区域                                | 小   | P1     |
| P7   | JSON 兜底编辑器                                 | 小   | P4     |
| P8   | 验证规则调整 + 保存前清理                       | 小   | P1     |

建议执行顺序：P1 → P8 → P2 → P3 → P6 → P4 → P5 → P7

---

## 10. 风险与注意事项

| 风险                                     | 影响 | 缓解                                                                   |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------- |
| 编辑器重构导致现有配置丢失               | 中   | 重构只涉及 UI 层，数据结构 (`ModelMetadataRule`) 不变，持久化不受影响  |
| mediaGenParams JSON 双向同步导致数据冲突 | 低   | JSON 修改时先解析验证，失败则只标红不更新；表单修改时无条件同步到 JSON |
| 能力开关与 mediaGenParams 的联动误操作   | 低   | 关闭 imageGeneration 时不清除数据，只隐藏 UI；保存时检查一致性         |
| OptionListEditor 中空值/重复值           | 低   | value 字段做唯一性校验，label 为空时自动用 value 填充                  |
| 对话框内容过多导致滚动体验差             | 中   | 使用可折叠区域（el-collapse），默认只展开"匹配规则"和"图标"，其余折叠  |
