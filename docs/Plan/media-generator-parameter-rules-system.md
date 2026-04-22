# 媒体生成器参数规则系统 — 架构调查与改进方案

**状态**: RFC (征求意见稿)
**作者**: 咕咕
**日期**: 2026-04-23
**关联模块**: `media-generator`, `model-metadata`, `llm-apis/adapters`

---

## 1. 问题诊断

### 1.1 核心痛点：参数不匹配导致 400 错误

当前 [`ParameterPanel.vue`](src/tools/media-generator/components/ParameterPanel.vue) 使用**硬编码字符串匹配**来判断各模型支持哪些参数：

```typescript
// ParameterPanel.vue:137-174 — 全是硬编码判断
const supportsQuality = computed(() => {
  return provider === "openai" && (modelId.includes("dall-e-3") || modelId.includes("gpt-image") ...);
});
const supportsTransparency = computed(() => {
  return modelId.includes("gpt-image") || modelId.includes("gpt-5");
});
const supportsSteps = computed(() => {
  return provider === "openai" && baseUrl.includes("siliconflow");
});
```

而 [`callOpenAiImageApi`](src/llm-apis/adapters/openai/image.ts:60-81) 则**盲目透传所有参数**到请求体：

```typescript
body = {
  model: modelId,
  prompt, negative_prompt, n, size, quality, style,
  seed, guidance_scale, num_inference_steps,
  background, input_fidelity, partial_images, ...
};
```

**后果**：不同模型对参数的支持差异极大，发送不支持的参数时 API 直接返回 400。

### 1.2 问题模型矩阵（已知冲突）

| 参数                  | DALL-E 3      | GPT Image 2           | Flux     | SD 3.5   | Kolors  | Qwen-Image |
| --------------------- | ------------- | --------------------- | -------- | -------- | ------- | ---------- |
| `size`                | 固定3种       | 任意(约束)            | 固定几种 | 固定几种 | 固定5种 | 固定7种    |
| `quality`             | standard/hd   | low/medium/high/auto  | ❌       | ❌       | ❌      | ❌         |
| `style`               | vivid/natural | ❌                    | ❌       | ❌       | ❌      | ❌         |
| `negative_prompt`     | ❌            | ❌                    | ✅       | ✅       | ✅      | ❌         |
| `background`          | ❌            | ❌(不支持transparent) | ❌       | ❌       | ❌      | ❌         |
| `input_fidelity`      | ❌            | ❌(自动high)          | ❌       | ❌       | ❌      | ❌         |
| `seed`                | ❌            | ❌                    | ✅       | ✅       | ✅      | ❌         |
| `guidance_scale`      | ❌            | ❌                    | ✅       | ✅       | ❌      | ❌         |
| `num_inference_steps` | ❌            | ❌                    | ✅       | ✅       | ❌      | ❌         |
| `n` (批量)            | ✅(1)         | ✅                    | ✅       | ✅       | ✅      | ❌         |
| `moderation`          | ❌            | auto/low              | ❌       | ❌       | ❌      | ❌         |

### 1.3 当前架构中的相关设施

项目已有一套成熟的 **模型元数据匹配系统**（[`ModelMetadataProperties`](src/types/model-metadata.ts:19-78)），通过规则优先级 + 合并策略为模型挂载各种属性。但目前该系统仅覆盖：

- 图标 (`icon`)、分组 (`group`)、分词器 (`tokenizer`)
- 能力标签 (`capabilities`) — 如 `imageGeneration`, `iterativeRefinement`
- 上下文长度、价格等元信息

**缺失的关键部分**：没有描述"该模型支持哪些生成参数、每个参数的有效值域/默认值"的结构化配置。

另外，[`request-builder.ts`](src/llm-apis/request-builder.ts) 中已有 [`filterParametersByCapabilities()`](src/llm-apis/request-builder.ts:570-837) 函数用于 LLM Chat 的参数过滤，但它只处理对话类参数，不覆盖媒体生成参数。

---

## 2. 设计方案：基于元数据的媒体生成参数规则系统

### 2.1 设计原则

1. **声明式配置，非命令式逻辑**：用数据描述模型能力，而非用 `if/else` 判断
2. **与现有元数据系统无缝集成**：扩展 `ModelMetadataProperties`，复用规则匹配引擎
3. **双重保障**：UI 层动态屏蔽 + API 层自动剔除，确保不会发送不支持的参数
4. **渐进覆盖**：内置常见模型规则，允许用户通过元数据设置界面自定义扩展

### 2.2 新增类型定义

在 [`src/types/model-metadata.ts`](src/types/model-metadata.ts) 中扩展 `ModelMetadataProperties`：

```typescript
/**
 * 媒体生成参数规则配置
 * 描述一个模型支持哪些生成参数，以及各参数的约束
 */
export interface MediaGenParamRules {
  // ========== 图片生成参数 ==========

  /** 尺寸控制模式 */
  size?: {
    /**
     * 尺寸模式
     * - 'preset': 只能从预设列表中选择（如 DALL-E 3）
     * - 'free': 自由输入宽高，但有约束条件（如 GPT Image 2）
     * - 'aspectRatio': 使用宽高比而非精确像素（如某些 Gemini 模型）
     */
    mode: "preset" | "free" | "aspectRatio";
    /** 预设尺寸选项 (mode=preset 或 作为快捷入口) */
    presets?: Array<{ label: string; value: string }>;
    /** 自由模式约束 (mode=free) */
    constraints?: {
      minWidth?: number;
      maxWidth?: number;
      minHeight?: number;
      maxHeight?: number;
      /** 宽高必须是此值的整数倍 (如 GPT Image 2 要求 16px) */
      stepSize?: number;
      /** 最大长边与短边比例 (如 GPT Image 2 为 3:1) */
      maxAspectRatio?: number;
      /** 最小总像素数 */
      minPixels?: number;
      /** 最大总像素数 */
      maxPixels?: number;
    };
    /** 宽高比选项 (mode=aspectRatio) */
    aspectRatios?: Array<{ label: string; value: string }>;
    /** 默认值 */
    default?: string;
  };

  /** 质量级别 */
  quality?: {
    supported: true;
    options: Array<{ label: string; value: string }>;
    default?: string;
  };

  /** 风格控制 */
  style?: {
    supported: true;
    options: Array<{ label: string; value: string }>;
    default?: string;
  };

  /** 负向提示词 */
  negativePrompt?: {
    supported: boolean;
  };

  /** 随机种子 */
  seed?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  /** 迭代步数 (Inference Steps) */
  steps?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  /** 引导系数 (CFG / Guidance Scale) */
  guidanceScale?: {
    supported: boolean;
    min?: number;
    max?: number;
    step?: number;
    default?: number;
  };

  /** 背景透明度控制 */
  background?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  /** 输入保真度 (Input Fidelity) */
  inputFidelity?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  /** 审核级别 (Moderation) */
  moderation?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  /** 输出格式 */
  outputFormat?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
    default?: string;
  };

  /** 输出压缩 */
  outputCompression?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  /** 批量生成数量 (n) */
  batchSize?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  /** 流式部分图片 */
  partialImages?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  // ========== 视频生成参数 ==========

  /** 视频时长 (秒) */
  duration?: {
    supported: boolean;
    options?: number[];
    default?: number;
  };

  // ========== 通用扩展 ==========

  /**
   * 自定义参数（模型特有的非标准参数）
   * key 为参数名，value 描述其类型和约束
   */
  customParams?: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "select";
      label: string;
      options?: Array<{ label: string; value: string | number }>;
      min?: number;
      max?: number;
      step?: number;
      default?: any;
    }
  >;
}
```

然后在 `ModelMetadataProperties` 中添加一个可选字段：

```typescript
export interface ModelMetadataProperties {
  // ... 现有字段 ...

  /** 媒体生成参数规则（仅对生成类模型有效） */
  mediaGenParams?: MediaGenParamRules;
}
```

### 2.3 预设规则示例

在 [`src/config/model-metadata-presets.ts`](src/config/model-metadata-presets.ts) 中追加规则：

```typescript
// GPT Image 2 参数规则
{
  id: "media-params-gpt-image-2",
  matchType: "modelPrefix",
  matchValue: "gpt-image-2",
  properties: {
    mediaGenParams: {
      size: {
        mode: 'free',
        presets: [
          { label: "1:1 (1024x1024)", value: "1024x1024" },
          { label: "3:2 (1536x1024)", value: "1536x1024" },
          { label: "2:3 (1024x1536)", value: "1024x1536" },
          { label: "2K (2048x2048)", value: "2048x2048" },
          { label: "4K 横屏 (3840x2160)", value: "3840x2160" },
          { label: "Auto", value: "auto" },
        ],
        constraints: {
          maxWidth: 3840, maxHeight: 3840,
          stepSize: 16,
          maxAspectRatio: 3,
          minPixels: 655360,   // ~810x810
          maxPixels: 8294400,  // ~2880x2880
        },
        default: "auto",
      },
      quality: {
        supported: true,
        options: [
          { label: "低质量 (Low)", value: "low" },
          { label: "中等 (Medium)", value: "medium" },
          { label: "高质量 (High)", value: "high" },
          { label: "自动 (Auto)", value: "auto" },
        ],
        default: "auto",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      background: {
        supported: false, // gpt-image-2 不支持 transparent
      },
      inputFidelity: {
        supported: false, // gpt-image-2 自动 high，不允许修改
      },
      moderation: {
        supported: true,
        options: [
          { label: "自动 (Auto)", value: "auto" },
          { label: "宽松 (Low)", value: "low" },
        ],
      },
      outputFormat: {
        supported: true,
        options: [
          { label: "PNG", value: "png" },
          { label: "JPEG (更快)", value: "jpeg" },
          { label: "WebP", value: "webp" },
        ],
        default: "png",
      },
      outputCompression: {
        supported: true,
        min: 0, max: 100,
      },
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
      partialImages: { supported: true, min: 0, max: 3 },
    },
  },
  priority: 40,
  enabled: true,
  description: "GPT Image 2 生成参数规则",
},

// GPT Image 1 / 1.5 / 1-mini
{
  id: "media-params-gpt-image-1",
  matchType: "modelPrefix",
  matchValue: "gpt-image-1",
  properties: {
    mediaGenParams: {
      size: {
        mode: 'preset',
        presets: [
          { label: "1:1 (1024x1024)", value: "1024x1024" },
          { label: "横屏 (1536x1024)", value: "1536x1024" },
          { label: "竖屏 (1024x1536)", value: "1024x1536" },
          { label: "Auto", value: "auto" },
        ],
        default: "auto",
      },
      quality: {
        supported: true,
        options: [
          { label: "低质量 (Low)", value: "low" },
          { label: "中等 (Medium)", value: "medium" },
          { label: "高质量 (High)", value: "high" },
          { label: "自动 (Auto)", value: "auto" },
        ],
        default: "auto",
      },
      background: {
        supported: true,
        options: [
          { label: "不透明", value: "opaque" },
          { label: "透明 (PNG/WebP)", value: "transparent" },
          { label: "自动", value: "auto" },
        ],
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
    },
  },
  priority: 40,
  enabled: true,
  description: "GPT Image 1 系列生成参数规则",
},

// DALL-E 3
{
  id: "media-params-dall-e-3",
  matchType: "modelPrefix",
  matchValue: "dall-e-3",
  properties: {
    mediaGenParams: {
      size: {
        mode: 'preset',
        presets: [
          { label: "1:1 (1024x1024)", value: "1024x1024" },
          { label: "横屏 (1792x1024)", value: "1792x1024" },
          { label: "竖屏 (1024x1792)", value: "1024x1792" },
        ],
        default: "1024x1024",
      },
      quality: {
        supported: true,
        options: [
          { label: "标准 (Standard)", value: "standard" },
          { label: "高清 (HD)", value: "hd" },
        ],
        default: "standard",
      },
      style: {
        supported: true,
        options: [
          { label: "生动 (Vivid)", value: "vivid" },
          { label: "自然 (Natural)", value: "natural" },
        ],
        default: "vivid",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      background: { supported: false },
      inputFidelity: { supported: false },
      batchSize: { supported: false }, // DALL-E 3 不支持 n>1
    },
  },
  priority: 40,
  enabled: true,
  description: "DALL-E 3 生成参数规则",
},

// Flux 系列 (SiliconFlow 等)
{
  id: "media-params-flux",
  matchType: "modelPrefix",
  matchValue: "flux",
  properties: {
    mediaGenParams: {
      size: {
        mode: 'preset',
        presets: [
          { label: "1:1 (1024x1024)", value: "1024x1024" },
          { label: "横屏 (1792x1024)", value: "1792x1024" },
          { label: "竖屏 (1024x1792)", value: "1024x1792" },
        ],
        default: "1024x1024",
      },
      negativePrompt: { supported: true },
      seed: { supported: true, min: -1 },
      steps: { supported: true, min: 1, max: 50, default: 20 },
      guidanceScale: { supported: true, min: 1, max: 20, step: 0.5, default: 7.5 },
      quality: { supported: false },
      style: { supported: false },
      background: { supported: false },
      inputFidelity: { supported: false },
    },
  },
  priority: 40,
  enabled: true,
  description: "FLUX 系列生成参数规则",
},

// Kolors (SiliconFlow)
{
  id: "media-params-kolors",
  matchType: "modelPrefix",
  matchValue: "kolors",
  properties: {
    mediaGenParams: {
      size: {
        mode: 'preset',
        presets: [
          { label: "1:1 (1024x1024)", value: "1024x1024" },
          { label: "3:4 (960x1280)", value: "960x1280" },
          { label: "3:4 (768x1024)", value: "768x1024" },
          { label: "1:2 (720x1440)", value: "720x1440" },
          { label: "9:16 (720x1280)", value: "720x1280" },
        ],
        default: "1024x1024",
      },
      negativePrompt: { supported: true },
      seed: { supported: true, min: -1 },
      steps: { supported: true, min: 1, max: 100, default: 25 },
      guidanceScale: { supported: true, min: 1, max: 20, step: 0.5, default: 5 },
      quality: { supported: false },
      style: { supported: false },
      background: { supported: false },
    },
  },
  priority: 40,
  enabled: true,
  description: "Kolors 生成参数规则",
},
```

### 2.4 架构改造层次

改造分为 **三层**，形成完整的防护链：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: UI 层 (ParameterPanel.vue)                │
│  ● 根据 mediaGenParams 动态渲染/隐藏参数控件        │
│  ● 约束输入值域（min/max/options）                   │
│  ● 显示模型专属的预设选项                            │
└───────────────────────┬─────────────────────────────┘
                        │ 用户提交
┌───────────────────────▼─────────────────────────────┐
│  Layer 2: 请求构建层 (useMediaGenerationManager)    │
│  ● 读取 mediaGenParams 规则                         │
│  ● 自动剔除模型不支持的参数（supported: false）     │
│  ● 对 free 模式的 size 做合规性校验                  │
│  ● 替换 quality/style 的值为模型支持的格式           │
└───────────────────────┬─────────────────────────────┘
                        │ 清洁的参数
┌───────────────────────▼─────────────────────────────┐
│  Layer 3: API 适配层 (adapters/openai/image.ts)     │
│  ● 最终兜底：删除所有 undefined/null 值的字段       │
│  ● 已有的 response_format 兼容逻辑保留              │
└─────────────────────────────────────────────────────┘
```

### 2.5 核心 Composable: `useMediaGenParamRules`

新建 `src/tools/media-generator/composables/useMediaGenParamRules.ts`：

```typescript
/**
 * 媒体生成参数规则 Composable
 *
 * 从模型元数据中读取 mediaGenParams 规则，
 * 提供给 ParameterPanel 用于动态渲染，
 * 以及给 Manager 用于请求前清洁。
 */
export function useMediaGenParamRules() {
  const { getMatchedProperties } = useModelMetadata();

  /**
   * 获取指定模型的生成参数规则
   */
  function getParamRules(modelId: string, provider?: string): MediaGenParamRules | undefined {
    const props = getMatchedProperties(modelId, provider);
    return props?.mediaGenParams;
  }

  /**
   * 根据规则清洁请求参数
   * 删除模型不支持的参数，修正超出范围的值
   */
  function sanitizeParams(params: Record<string, any>, rules: MediaGenParamRules): Record<string, any> {
    const clean = { ...params };

    // 如果不支持 negativePrompt，删除之
    if (rules.negativePrompt?.supported === false) {
      delete clean.negative_prompt;
      delete clean.negativePrompt;
    }

    // 如果不支持 quality，删除
    if (!rules.quality?.supported) {
      delete clean.quality;
    } else if (rules.quality.options) {
      // 如果值不在合法选项中，使用默认值
      const validValues = rules.quality.options.map((o) => o.value);
      if (!validValues.includes(clean.quality)) {
        clean.quality = rules.quality.default || validValues[0];
      }
    }

    // ... 对每个参数依次处理 ...
    // seed, style, steps, guidanceScale, background, inputFidelity 等

    // 处理 size
    if (rules.size) {
      if (rules.size.mode === "preset" && rules.size.presets) {
        const validSizes = rules.size.presets.map((p) => p.value);
        if (!validSizes.includes(clean.size)) {
          clean.size = rules.size.default || validSizes[0];
        }
      } else if (rules.size.mode === "free" && rules.size.constraints) {
        // 校验并修正 size 值
        clean.size = validateFreeSize(clean.size, rules.size.constraints);
      }
    }

    return clean;
  }

  return { getParamRules, sanitizeParams };
}
```

### 2.6 ParameterPanel 改造思路

将 [`ParameterPanel.vue`](src/tools/media-generator/components/ParameterPanel.vue) 中所有硬编码的 `supportsXxx` computed 替换为规则驱动：

```typescript
// 改造前（硬编码）
const supportsQuality = computed(() => {
  return provider === "openai" && modelId.includes("dall-e-3");
});

// 改造后（规则驱动）
const paramRules = computed(() => {
  if (!selectedModelInfo.value) return undefined;
  return getParamRules(selectedModelInfo.value.modelId, selectedModelInfo.value.provider);
});

const supportsQuality = computed(() => paramRules.value?.quality?.supported === true);
const qualityOptions = computed(() => paramRules.value?.quality?.options || []);
const supportsStyle = computed(() => paramRules.value?.style?.supported === true);
const supportsNegativePrompt = computed(() => paramRules.value?.negativePrompt?.supported !== false);
const supportsSteps = computed(() => paramRules.value?.steps?.supported === true);
const supportsCfg = computed(() => paramRules.value?.guidanceScale?.supported === true);
const supportsTransparency = computed(() => paramRules.value?.background?.supported === true);

// 分辨率选项也从规则中读取
const sizeOptions = computed(() => {
  return (
    paramRules.value?.size?.presets || [
      { label: "1:1 (1024x1024)", value: "1024x1024" }, // 兜底默认
    ]
  );
});

// 分辨率输入模式
const sizeMode = computed(() => paramRules.value?.size?.mode || "preset");
```

### 2.7 请求构建层改造

在 [`useMediaGenerationManager.ts`](src/tools/media-generator/composables/useMediaGenerationManager.ts) 的 `startGeneration` 中插入清洁步骤：

```typescript
// 在构造 finalOptions 之后、调用 sendRequest 之前
const rules = getParamRules(options.modelId, selectedProfile?.type);
if (rules) {
  finalOptions = {
    ...finalOptions,
    ...sanitizeParams(finalOptions, rules),
  };
}
```

### 2.8 API 适配层改造

在 [`callOpenAiImageApi`](src/llm-apis/adapters/openai/image.ts) 中：

- 在序列化 body 之前，添加一个 `removeUndefined()` 清洁步骤
- 确保 `undefined` 和显式设置为 `false` 的参数不被发送

```typescript
// 构建 body 对象后
const rawBody = {
  model: modelId,
  prompt,
  negative_prompt: options.negativePrompt,
  quality,
  style,
  // ...
};

// 清除所有 undefined/null 值，防止序列化后变成 "null" 字符串
const cleanBody = Object.fromEntries(Object.entries(rawBody).filter(([_, v]) => v !== undefined && v !== null));

body = await asyncJsonStringify(cleanBody);
```

---

## 3. 兼容性与降级策略

### 3.1 未配置规则的模型

当 `mediaGenParams` 为 `undefined`（即该模型未配置任何规则）时：

- **UI 层**：展示所有参数控件（保持当前行为，向下兼容）
- **请求层**：不做任何参数过滤（保持当前行为）
- **API 层**：仅做 `removeUndefined` 清洁

这确保了对于用户自定义的、我们未预设规则的模型，不会产生回归。

### 3.2 规则合并策略

利用现有的元数据优先级合并机制（[`getMatchedModelProperties`](src/config/model-metadata.ts:95-127) 中的 `merge` 逻辑），用户可以：

- **覆盖内置规则**：创建更高优先级的自定义规则
- **局部修改**：如只修改某个模型的 `size.presets`，其他参数规则继承基础规则

### 3.3 与 `capabilities` 的关系

`mediaGenParams` 与 `capabilities` 是互补关系，不是替代：

- `capabilities.imageGeneration = true` → 声明"这个模型**能**生成图片"
- `mediaGenParams.quality.supported = true` → 声明"这个模型的图片生成**支持** quality 参数"

---

## 4. 实施计划

### Phase 1: 类型定义与核心 Composable

1. 在 `src/types/model-metadata.ts` 中新增 `MediaGenParamRules` 接口
2. 在 `ModelMetadataProperties` 中添加 `mediaGenParams` 字段
3. 新建 `src/tools/media-generator/composables/useMediaGenParamRules.ts`

### Phase 2: 预设规则

4. 在 `src/config/model-metadata-presets.ts` 中为主流模型添加参数规则
   - OpenAI: DALL-E 3, GPT Image 1/1.5/2
   - SiliconFlow: Flux, Kolors, Qwen-Image, SD 3.5
   - Google: Gemini Image
   - xAI: Grok Image
   - 其他: Midjourney, Stable Diffusion

### Phase 3: UI 改造

5. 重构 `ParameterPanel.vue`，消除所有硬编码判断
6. 实现 `free` 模式的尺寸输入约束（实时校验）

### Phase 4: 请求管线改造

7. 在 `useMediaGenerationManager.ts` 中集成参数清洁
8. 在 `callOpenAiImageApi` 中添加 `removeUndefined` 兜底

### Phase 5: 用户自定义支持（可选）

9. 在模型元数据设置界面中，允许用户编辑 `mediaGenParams` 规则

---

## 5. 风险评估

| 风险                           | 影响 | 缓解措施                                                      |
| ------------------------------ | ---- | ------------------------------------------------------------- |
| 规则未覆盖的模型参数被误删     | 中   | 仅在 `supported: false` 时显式删除，`undefined` 表示不限制    |
| 规则数据结构膨胀               | 低   | `mediaGenParams` 采用可选字段，未设置的参数不占空间           |
| 用户自定义规则覆盖导致功能异常 | 低   | 利用优先级合并机制，内置规则优先级 40，用户规则默认 50 可覆盖 |
| 新模型发布后规则滞后           | 中   | 未配置规则时降级为全部参数透传，不影响功能                    |

---

## 6. 总结

当前的媒体生成器存在**参数适配层的结构性缺陷**：UI 的参数展示和 API 的参数发送都依赖硬编码的字符串匹配，既不可维护也容易导致 400 错误。

本方案通过在已有的模型元数据系统中新增 `mediaGenParams` 字段，实现了：

1. **声明式配置**：每个模型的参数支持情况用数据描述，一目了然
2. **三层防护**：UI 屏蔽 → 请求清洁 → API 兜底
3. **无缝集成**：复用现有的规则匹配引擎和优先级合并策略
4. **向下兼容**：未配置规则的模型保持现有行为



附录

---

#### Model Capabilities

# Image Generation

Generate images from text prompts, edit existing images with natural language, or iteratively refine images through multi-turn conversations. The API supports batch generation of multiple images, and control over aspect ratio and resolution.

## Quick Start

Generate an image with a single API call:

```python customLanguage="pythonXAI"
import xai_sdk

client = xai_sdk.Client()

response = client.image.sample(
    prompt="A collage of London landmarks in a stenciled street‑art style",
    model="grok-imagine-image",
)

print(response.url)
```

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "A collage of London landmarks in a stenciled street‑art style"
  }'
```

```python customLanguage="pythonOpenAISDK"
from openai import OpenAI

client = OpenAI(
    base_url="https://api.x.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.images.generate(
    model="grok-imagine-image",
    prompt="A collage of London landmarks in a stenciled street‑art style",
)

print(response.data[0].url)
```

```javascript customLanguage="javascriptOpenAISDK"
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: "A collage of London landmarks in a stenciled street‑art style",
});

console.log(response.data[0].url);
```

```javascript customLanguage="javascriptAISDK"
import { xai } from "@ai-sdk/xai";
import { generateImage } from "ai";

const { image } = await generateImage({
    model: xai.image("grok-imagine-image"),
    prompt: "A collage of London landmarks in a stenciled street‑art style",
});

console.log(image.base64);
```

Images are returned as URLs by default. URLs are temporary, so download or process promptly. You can also request [base64 output](#base64-output) for embedding images directly.

## Image Editing

Edit an existing image by providing a source image along with your prompt. The model understands the image content and applies your requested changes.

The OpenAI SDK's `images.edit()` method is not supported for image editing because it uses `multipart/form-data`, while the xAI API requires `application/json`. Use the xAI SDK, Vercel AI SDK, or direct HTTP requests instead.

With the xAI SDK, use the same `sample()` method — just add the `image_url` parameter:

```python customLanguage="pythonXAI"
import base64
import xai_sdk

client = xai_sdk.Client()

# Load image from file and encode as base64
with open("photo.png", "rb") as f:
    image_data = base64.b64encode(f.read()).decode("utf-8")

response = client.image.sample(
    prompt="Render this as a pencil sketch with detailed shading",
    model="grok-imagine-image",
    image_url=f"data:image/png;base64,{image_data}",
)

print(response.url)
```

```bash
# Using a public URL as the source image
curl -X POST https://api.x.ai/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "Render this as a pencil sketch with detailed shading",
    "image": {
      "url": "https://docs.x.ai/assets/api-examples/images/style-realistic.png",
      "type": "image_url"
    }
  }'
```

```javascript customLanguage="javascriptAISDK"
import { xai } from "@ai-sdk/xai";
import { generateImage } from "ai";
import fs from "fs";

// Load image and encode as base64
const imageBuffer = fs.readFileSync("photo.png");
const base64Image = imageBuffer.toString("base64");

const { image } = await generateImage({
    model: xai.image("grok-imagine-image"),
    prompt: "Render this as a pencil sketch with detailed shading",
    providerOptions: {
        xai: {
            image: `data:image/png;base64,${base64Image}`,
        },
    },
});

console.log(image.base64);
```

You can provide the source image as:

* A **public URL** pointing to an image
* A **base64-encoded data URI** (e.g., `data:image/jpeg;base64,...`)

## Editing with Multiple Images

You can add up to 5 images for editing. You can specify the images in the order they are sent in the request. By default, the aspect ratio of the output image follows the first input image. You can override this by setting the `aspect_ratio` parameter to a specific ratio (e.g., `"1:1"`, `"16:9"`).

## Multi-Turn Editing

Chain multiple edits together by using each output as the input for the next. This enables iterative refinement — start with a base image and progressively add details, adjust styles, or make corrections.

## Style Transfer

The `grok-imagine-image` model excels across a wide range of visual styles — from ultra-realistic photography to anime, oil paintings, pencil sketches, and beyond. Transform existing images by simply describing the desired aesthetic in your prompt.

## Concurrent Requests

When you need to generate multiple images with **different prompts** — such as applying various style transfers to the same source image, or generating unrelated images in parallel — use `AsyncClient` with `asyncio.gather` to fire requests concurrently. This is significantly faster than issuing them one at a time.

If you want multiple variations from the **same prompt**, use [`sample_batch()` with the `n` parameter](#multiple-images) instead. That generates all images in a single request and is the most efficient approach for same-prompt generation.

```python customLanguage="pythonXAI"
import asyncio
import xai_sdk

async def generate_concurrently():
    client = xai_sdk.AsyncClient()

    source_image = "https://docs.x.ai/assets/api-examples/images/style-realistic.png"

    # Each request uses a different prompt
    prompts = [
        "Render this image as an oil painting in the style of impressionism",
        "Render this image as a pencil sketch with detailed shading",
        "Render this image as pop art with bold colors and halftone dots",
        "Render this image as a watercolor painting with soft edges",
    ]

    # Fire all requests concurrently
    tasks = [
        client.image.sample(
            prompt=prompt,
            model="grok-imagine-image",
            image_url=source_image,
        )
        for prompt in prompts
    ]

    results = await asyncio.gather(*tasks)

    for prompt, result in zip(prompts, results):
        print(f"{prompt}: {result.url}")

asyncio.run(generate_concurrently())
```

## Configuration

### Multiple Images

Generate multiple images in a single request using the `sample_batch()` method and the `n` parameter. This returns a list of `ImageResponse` objects.

```python customLanguage="pythonXAI"
import xai_sdk

client = xai_sdk.Client()

responses = client.image.sample_batch(
    prompt="A futuristic city skyline at night",
    model="grok-imagine-image",
    n=4,
)

for i, image in enumerate(responses):
    print(f"Variation {i + 1}: {image.url}")
```

```python customLanguage="pythonOpenAISDK"
from openai import OpenAI

client = OpenAI(
    base_url="https://api.x.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.images.generate(
    model="grok-imagine-image",
    prompt="A futuristic city skyline at night",
    n=4,
)

for i, image in enumerate(response.data):
    print(f"Variation {i + 1}: {image.url}")
```

```javascript customLanguage="javascriptOpenAISDK"
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: "A futuristic city skyline at night",
    n: 4,
});

response.data.forEach((image, i) => {
    console.log(`Variation ${i + 1}: ${image.url}`);
});

```

```javascript customLanguage="javascriptAISDK"
import { xai } from "@ai-sdk/xai";
import { generateImage } from "ai";

const { images } = await generateImage({
    model: xai.image("grok-imagine-image"),
    prompt: "A futuristic city skyline at night",
    n: 4,
});

images.forEach((image, i) => {
    console.log(`Variation ${i + 1}: ${image.base64.slice(0, 50)}...`);
});

```

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "A futuristic city skyline at night",
    "n": 4
  }'
```

### Aspect Ratio

Control image dimensions with the `aspect_ratio` parameter. This works for image generation and image editing with multiple images.
For image editing with single image, the output aspect ratio respects the input image's aspect ratio.

| Ratio | Use case |
|-------|----------|
| `1:1` | Social media, thumbnails |
| `16:9` / `9:16` | Widescreen, mobile, stories |
| `4:3` / `3:4` | Presentations, portraits |
| `3:2` / `2:3` | Photography |
| `2:1` / `1:2` | Banners, headers |
| `19.5:9` / `9:19.5` | Modern smartphone displays |
| `20:9` / `9:20` | Ultra-wide displays |
| `auto` | Model auto-selects the best ratio for the prompt |

```python customLanguage="pythonXAI"
import xai_sdk

client = xai_sdk.Client()

response = client.image.sample(
    prompt="Mountain landscape at sunrise",
    model="grok-imagine-image",
    aspect_ratio="16:9",
)

print(response.url)
```

```python customLanguage="pythonOpenAISDK"
from openai import OpenAI

client = OpenAI(
    base_url="https://api.x.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.images.generate(
    model="grok-imagine-image",
    prompt="Mountain landscape at sunrise",
    extra_body={"aspect_ratio": "16:9"},
)

print(response.data[0].url)
```

```javascript customLanguage="javascriptOpenAISDK"
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: "Mountain landscape at sunrise",
    // @ts-expect-error — xAI-specific parameter
    aspect_ratio: "16:9",
});

console.log(response.data[0].url);
```

```javascript customLanguage="javascriptAISDK"
import { xai } from "@ai-sdk/xai";
import { generateImage } from "ai";

const { image } = await generateImage({
    model: xai.image("grok-imagine-image"),
    prompt: "Mountain landscape at sunrise",
    aspectRatio: "16:9",
});

console.log(image.base64);
```

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "Mountain landscape at sunrise",
    "aspect_ratio": "16:9"
  }'
```

### Resolution

You can specify different resolutions of the output image. Currently supported image resolutions are:

* 1k
* 2k

```python customLanguage="pythonXAI"
import xai_sdk

client = xai_sdk.Client()

response = client.image.sample(
    prompt="An astronaut performing EVA in LEO.",
    model="grok-imagine-image",
    resolution="2k"
)

print(response.url)
```

```python customLanguage="pythonOpenAISDK"
from openai import OpenAI

client = OpenAI(
    base_url="https://api.x.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.images.generate(
    model="grok-imagine-image",
    prompt="An astronaut performing EVA in LEO.",
    extra_body={"resolution": "2k"},
)

print(response.data[0].url)
```

```javascript customLanguage="javascriptOpenAISDK"
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: "An astronaut performing EVA in LEO.",
    // @ts-expect-error — xAI-specific parameter
    resolution: "2k",
});

console.log(response.data[0].url);
```

```bash
curl -X POST https://api.x.ai/v1/images/generations \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $XAI_API_KEY" \
-d '{
    "model": "grok-imagine-image",
    "prompt": "An astronaut performing EVA in LEO.",
    "resolution": "2k"
}'
```

### Base64 Output

For embedding images directly without downloading, request base64:

```python customLanguage="pythonXAI"
import xai_sdk

client = xai_sdk.Client()

response = client.image.sample(
    prompt="A serene Japanese garden",
    model="grok-imagine-image",
    image_format="base64",
)

# Save to file
with open("garden.jpg", "wb") as f:
    f.write(response.image)
```

```python customLanguage="pythonOpenAISDK"
import base64
from openai import OpenAI

client = OpenAI(
    base_url="https://api.x.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.images.generate(
    model="grok-imagine-image",
    prompt="A serene Japanese garden",
    response_format="b64_json",
)

# Save to file
image_bytes = base64.b64decode(response.data[0].b64_json)
with open("garden.jpg", "wb") as f:
    f.write(image_bytes)
```

```javascript customLanguage="javascriptOpenAISDK"
import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
});

const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: "A serene Japanese garden",
    response_format: "b64_json",
});

// Save to file
const imageBuffer = Buffer.from(response.data[0].b64_json, "base64");
fs.writeFileSync("garden.jpg", imageBuffer);
```

```javascript customLanguage="javascriptAISDK"
import { xai } from "@ai-sdk/xai";
import { generateImage } from "ai";
import fs from "fs";

const { image } = await generateImage({
    model: xai.image("grok-imagine-image"),
    prompt: "A serene Japanese garden",
});

// Save to file (AI SDK returns base64 by default)
const imageBuffer = Buffer.from(image.base64, "base64");
fs.writeFileSync("garden.jpg", imageBuffer);
```

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "A serene Japanese garden",
    "response_format": "b64_json"
  }'
```

### Response Details

The xAI SDK exposes additional metadata on the response object beyond the image URL or base64 data.

**Moderation** — Check whether the generated image passed content moderation:

```python customLanguage="pythonXAI"
if response.respect_moderation:
    print(response.url)
else:
    print("Image filtered by moderation")
```

**Model** — Get the actual model used (resolving any aliases):

```python customLanguage="pythonXAI"
print(f"Model: {response.model}")
```

## Pricing

Image generation uses flat per-image pricing rather than token-based pricing like text models. Each generated image incurs a fixed fee regardless of prompt length.

For image editing, you are charged for both the input image and the generated output image.

For full pricing details on the `grok-imagine-image` model, see the [model page](/developers/models/grok-imagine-image).

## Limitations

* **Maximum images per request:** 10
* **URL expiration:** Generated URLs are temporary
* **Content moderation:** Images are subject to content policy review

## Related

* [Models](/developers/models) — Available image models
* [Video Generation](/developers/model-capabilities/video/generation) — Animate generated images
* [API Reference](/developers/rest-api-reference) — Full endpoint documentation
* [Imagine API Landing Page](https://x.ai/api/imagine) — Showcase of the Imagine API in action


---

# Image generation

## Overview

The OpenAI API lets you generate and edit images from text prompts using GPT Image models, including our latest, `gpt-image-2`. You can access image generation capabilities through two APIs:

### Image API

Starting with `gpt-image-1` and later models, the [Image API](https://developers.openai.com/api/docs/api-reference/images) provides two endpoints, each with distinct capabilities:

- **Generations**: [Generate images](#generate-images) from scratch based on a text prompt
- **Edits**: [Modify existing images](#edit-images) using a new prompt, either partially or entirely

The Image API also includes a variations endpoint for models that support it, such as DALL·E 2.

### Responses API

The [Responses API](https://developers.openai.com/api/docs/api-reference/responses/create#responses-create-tools) allows you to generate images as part of conversations or multi-step flows. It supports image generation as a [built-in tool](https://developers.openai.com/api/docs/guides/tools?api-mode=responses), and accepts image inputs and outputs within context.

Compared to the Image API, it adds:

- **Multi-turn editing**: Iteratively make high fidelity edits to images with prompting
- **Flexible inputs**: Accept image [File](https://developers.openai.com/api/docs/api-reference/files) IDs as input images, not just bytes

The Responses API image generation tool uses its own GPT Image model selection. For details on mainline models that support calling this tool, refer to the [supported models](#supported-models) below.

### Choosing the right API

- If you only need to generate or edit a single image from one prompt, the Image API is your best choice.
- If you want to build conversational, editable image experiences with GPT Image, go with the Responses API.

Both APIs let you [customize output](#customize-image-output) by adjusting quality, size, format, and compression. Transparent backgrounds depend on model support.

This guide focuses on GPT Image.

To ensure these models are used responsibly, you may need to complete the [API
  Organization
  Verification](https://help.openai.com/en/articles/10910291-api-organization-verification)
  from your [developer
  console](https://platform.openai.com/settings/organization/general) before
  using GPT Image models, including `gpt-image-2`, `gpt-image-1.5`,
  `gpt-image-1`, and `gpt-image-1-mini`.

<div
  className="not-prose"
  style={{ float: "right", margin: "10px 0 10px 10px" }}
>
  <img src="https://cdn.openai.com/API/docs/images/mug.png"
    alt="A beige coffee mug on a wooden table"
    style={{ height: "180px", width: "auto", borderRadius: "8px" }}
  />
</div>

## Generate Images

You can use the [image generation endpoint](https://developers.openai.com/api/docs/api-reference/images/create) to create images based on text prompts, or the [image generation tool](https://developers.openai.com/api/docs/guides/tools?api-mode=responses) in the Responses API to generate images as part of a conversation.

To learn more about customizing the output (size, quality, format, compression), refer to the [customize image output](#customize-image-output) section below.

You can set the `n` parameter to generate multiple images at once in a single request (by default, the API returns a single image).



<div data-content-switcher-pane data-value="responses">
    <div class="hidden">Responses API</div>
    Generate an image

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
    model: "gpt-5.4",
    input: "Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools: [{type: "image_generation"}],
});

// Save the image to a file
const imageData = response.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData.length > 0) {
  const imageBase64 = imageData[0];
  const fs = await import("fs");
  fs.writeFileSync("otter.png", Buffer.from(imageBase64, "base64"));
}
```

```python
from openai import OpenAI
import base64

client = OpenAI() 

response = client.responses.create(
    model="gpt-5.4",
    input="Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools=[{"type": "image_generation"}],
)

# Save the image to a file
image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]
    
if image_data:
    image_base64 = image_data[0]
    with open("otter.png", "wb") as f:
        f.write(base64.b64decode(image_base64))
```

  </div>
  <div data-content-switcher-pane data-value="image" hidden>
    <div class="hidden">Image API</div>
    Generate an image

```javascript
import OpenAI from "openai";
import fs from "fs";
const openai = new OpenAI();

const prompt = \`
A children's book drawing of a veterinarian using a stethoscope to 
listen to the heartbeat of a baby otter.
\`;

const result = await openai.images.generate({
    model: "gpt-image-2",
    prompt,
});

// Save the image to a file
const image_base64 = result.data[0].b64_json;
const image_bytes = Buffer.from(image_base64, "base64");
fs.writeFileSync("otter.png", image_bytes);
```

```python
from openai import OpenAI
import base64
client = OpenAI()

prompt = """
A children's book drawing of a veterinarian using a stethoscope to 
listen to the heartbeat of a baby otter.
"""

result = client.images.generate(
    model="gpt-image-2",
    prompt=prompt
)

image_base64 = result.data[0].b64_json
image_bytes = base64.b64decode(image_base64)

# Save the image to a file
with open("otter.png", "wb") as f:
    f.write(image_bytes)
```

```bash
curl -X POST "https://api.openai.com/v1/images/generations" \\
    -H "Authorization: Bearer $OPENAI_API_KEY" \\
    -H "Content-type: application/json" \\
    -d '{
        "model": "gpt-image-2",
        "prompt": "A childrens book drawing of a veterinarian using a stethoscope to listen to the heartbeat of a baby otter."
    }' | jq -r '.data[0].b64_json' | base64 --decode > otter.png
```

  </div>



### Multi-turn image generation

With the Responses API, you can build multi-turn conversations involving image generation either by providing image generation calls outputs within context (you can also just use the image ID), or by using the [`previous_response_id` parameter](https://developers.openai.com/api/docs/guides/conversation-state?api-mode=responses#openai-apis-for-conversation-state).
This lets you iterate on images across multiple turns—refining prompts, applying new instructions, and evolving the visual output as the conversation progresses.

With the Responses API image generation tool, supported tool models can choose whether to generate a new image or edit one already in the conversation. The optional `action` parameter controls this behavior: keep `action: "auto"` to let the model decide, set `action: "generate"` to always create a new image, or set `action: "edit"` to force editing when an image is in context.

Force image creation with action

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
    model: "gpt-5.4",
    input: "Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools: [{type: "image_generation", action: "generate"}],
});

// Save the image to a file
const imageData = response.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData.length > 0) {
  const imageBase64 = imageData[0];
  const fs = await import("fs");
  fs.writeFileSync("otter.png", Buffer.from(imageBase64, "base64"));
}
```

```python
from openai import OpenAI
import base64

client = OpenAI() 

response = client.responses.create(
    model="gpt-5.4",
    input="Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools=[{"type": "image_generation", "action": "generate"}],
)

# Save the image to a file
image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]
    
if image_data:
    image_base64 = image_data[0]
    with open("otter.png", "wb") as f:
        f.write(base64.b64decode(image_base64))
```


If you force `edit` without providing an image in context, the call will return an error. Leave `action` at `auto` to have the model decide when to generate or edit.



<div data-content-switcher-pane data-value="responseid">
    <div class="hidden">Using previous response ID</div>
    Multi-turn image generation

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
  model: "gpt-5.4",
  input:
    "Generate an image of gray tabby cat hugging an otter with an orange scarf",
  tools: [{ type: "image_generation" }],
});

const imageData = response.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData.length > 0) {
  const imageBase64 = imageData[0];
  const fs = await import("fs");
  fs.writeFileSync("cat_and_otter.png", Buffer.from(imageBase64, "base64"));
}

// Follow up

const response_fwup = await openai.responses.create({
  model: "gpt-5.4",
  previous_response_id: response.id,
  input: "Now make it look realistic",
  tools: [{ type: "image_generation" }],
});

const imageData_fwup = response_fwup.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData_fwup.length > 0) {
  const imageBase64 = imageData_fwup[0];
  const fs = await import("fs");
  fs.writeFileSync(
    "cat_and_otter_realistic.png",
    Buffer.from(imageBase64, "base64")
  );
}
```

```python
from openai import OpenAI
import base64

client = OpenAI()

response = client.responses.create(
    model="gpt-5.4",
    input="Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools=[{"type": "image_generation"}],
)

image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]

if image_data:
    image_base64 = image_data[0]

    with open("cat_and_otter.png", "wb") as f:
        f.write(base64.b64decode(image_base64))


# Follow up

response_fwup = client.responses.create(
    model="gpt-5.4",
    previous_response_id=response.id,
    input="Now make it look realistic",
    tools=[{"type": "image_generation"}],
)

image_data_fwup = [
    output.result
    for output in response_fwup.output
    if output.type == "image_generation_call"
]

if image_data_fwup:
    image_base64 = image_data_fwup[0]
    with open("cat_and_otter_realistic.png", "wb") as f:
        f.write(base64.b64decode(image_base64))
```

  </div>
  <div data-content-switcher-pane data-value="imageid" hidden>
    <div class="hidden">Using image ID</div>
    Multi-turn image generation

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
  model: "gpt-5.4",
  input:
    "Generate an image of gray tabby cat hugging an otter with an orange scarf",
  tools: [{ type: "image_generation" }],
});

const imageGenerationCalls = response.output.filter(
  (output) => output.type === "image_generation_call"
);

const imageData = imageGenerationCalls.map((output) => output.result);

if (imageData.length > 0) {
  const imageBase64 = imageData[0];
  const fs = await import("fs");
  fs.writeFileSync("cat_and_otter.png", Buffer.from(imageBase64, "base64"));
}

// Follow up

const response_fwup = await openai.responses.create({
  model: "gpt-5.4",
  input: [
    {
      role: "user",
      content: [{ type: "input_text", text: "Now make it look realistic" }],
    },
    {
      type: "image_generation_call",
      id: imageGenerationCalls[0].id,
    },
  ],
  tools: [{ type: "image_generation" }],
});

const imageData_fwup = response_fwup.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData_fwup.length > 0) {
  const imageBase64 = imageData_fwup[0];
  const fs = await import("fs");
  fs.writeFileSync(
    "cat_and_otter_realistic.png",
    Buffer.from(imageBase64, "base64")
  );
}
```

```python
import openai
import base64

response = openai.responses.create(
    model="gpt-5.4",
    input="Generate an image of gray tabby cat hugging an otter with an orange scarf",
    tools=[{"type": "image_generation"}],
)

image_generation_calls = [
    output
    for output in response.output
    if output.type == "image_generation_call"
]

image_data = [output.result for output in image_generation_calls]

if image_data:
    image_base64 = image_data[0]

    with open("cat_and_otter.png", "wb") as f:
        f.write(base64.b64decode(image_base64))


# Follow up

response_fwup = openai.responses.create(
    model="gpt-5.4",
    input=[
        {
            "role": "user",
            "content": [{"type": "input_text", "text": "Now make it look realistic"}],
        },
        {
            "type": "image_generation_call",
            "id": image_generation_calls[0].id,
        },
    ],
    tools=[{"type": "image_generation"}],
)

image_data_fwup = [
    output.result
    for output in response_fwup.output
    if output.type == "image_generation_call"
]

if image_data_fwup:
    image_base64 = image_data_fwup[0]
    with open("cat_and_otter_realistic.png", "wb") as f:
        f.write(base64.b64decode(image_base64))
```

  </div>



#### Result

<div className="not-prose">
  <table style={{ width: "100%" }}>
    <tbody>
      <tr>
        <td style={{ verticalAlign: "top", padding: "0 16px 16px 0" }}>
          "Generate an image of gray tabby cat hugging an otter with an orange
          scarf"
        </td>
        <td
          style={{
            textAlign: "right",
            verticalAlign: "top",
            paddingBottom: "16px",
          }}
        >
          <img src="https://cdn.openai.com/API/docs/images/cat_and_otter.png"
            alt="A cat and an otter"
            style={{ width: "200px", borderRadius: "8px" }}
          />
        </td>
      </tr>
      <tr>
        <td style={{ verticalAlign: "top", padding: "0 16px 0 0" }}>
          "Now make it look realistic"
        </td>
        <td style={{ textAlign: "right", verticalAlign: "top" }}>
          <img src="https://cdn.openai.com/API/docs/images/cat_and_otter_realistic.png"
            alt="A cat and an otter"
            style={{ width: "200px", borderRadius: "8px" }}
          />
        </td>
      </tr>
    </tbody>
  </table>
</div>

### Streaming

The Responses API and Image API support streaming image generation. You can stream partial images as the APIs generate them, providing a more interactive experience.

You can adjust the `partial_images` parameter to receive 0-3 partial images.

- If you set `partial_images` to 0, you will only receive the final image.
- For values larger than zero, you may not receive the full number of partial images you requested if the full image is generated more quickly.



<div data-content-switcher-pane data-value="responses">
    <div class="hidden">Responses API</div>
    Stream an image

```javascript
import OpenAI from "openai";
import fs from "fs";
const openai = new OpenAI();

const stream = await openai.responses.create({
  model: "gpt-5.4",
  input:
    "Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape",
  stream: true,
  tools: [{ type: "image_generation", partial_images: 2 }],
});

for await (const event of stream) {
  if (event.type === "response.image_generation_call.partial_image") {
    const idx = event.partial_image_index;
    const imageBase64 = event.partial_image_b64;
    const imageBuffer = Buffer.from(imageBase64, "base64");
    fs.writeFileSync(\`river\${idx}.png\`, imageBuffer);
  }
}
```

```python
from openai import OpenAI
import base64

client = OpenAI()

stream = client.responses.create(
    model="gpt-5.4",
    input="Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape",
    stream=True,
    tools=[{"type": "image_generation", "partial_images": 2}],
)

for event in stream:
    if event.type == "response.image_generation_call.partial_image":
        idx = event.partial_image_index
        image_base64 = event.partial_image_b64
        image_bytes = base64.b64decode(image_base64)
        with open(f"river{idx}.png", "wb") as f:
            f.write(image_bytes)
```

  </div>
  <div data-content-switcher-pane data-value="image" hidden>
    <div class="hidden">Image API</div>
    Stream an image

```javascript
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI();

const prompt =
  "Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape";
const stream = await openai.images.generate({
  prompt: prompt,
  model: "gpt-image-2",
  stream: true,
  partial_images: 2,
});

for await (const event of stream) {
  if (event.type === "image_generation.partial_image") {
    const idx = event.partial_image_index;
    const imageBase64 = event.b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");
    fs.writeFileSync(\`river\${idx}.png\`, imageBuffer);
  }
}
```

```python
from openai import OpenAI
import base64

client = OpenAI()

stream = client.images.generate(
    prompt="Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape",
    model="gpt-image-2",
    stream=True,
    partial_images=2,
)

for event in stream:
    if event.type == "image_generation.partial_image":
        idx = event.partial_image_index
        image_base64 = event.b64_json
        image_bytes = base64.b64decode(image_base64)
        with open(f"river{idx}.png", "wb") as f:
            f.write(image_bytes)
```

  </div>



#### Result

<div className="images-examples">

| Partial 1                                                                                                                       | Partial 2                                                                                                                       | Final image                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/imgen1p5-streaming1.png" alt="1st partial" /> | <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/imgen1p5-streaming2.png" alt="2nd partial" /> | <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/imgen1p5-streaming3.png" alt="3rd partial" /> |

</div>

<div className="images-edit-prompt body-small">
  Prompt: Draw a gorgeous image of a river made of white owl feathers, snaking
  its way through a serene winter landscape
</div>

### Revised prompt

When using the image generation tool in the Responses API, the mainline model (for example, `gpt-5.4`) will automatically revise your prompt for improved performance.

You can access the revised prompt in the `revised_prompt` field of the image generation call:

Revised prompt response

```json
{
  "id": "ig_123",
  "type": "image_generation_call",
  "status": "completed",
  "revised_prompt": "A gray tabby cat hugging an otter. The otter is wearing an orange scarf. Both animals are cute and friendly, depicted in a warm, heartwarming style.",
  "result": "..."
}
```


## Edit Images

The [image edits](https://developers.openai.com/api/docs/api-reference/images/createEdit) endpoint lets you:

- Edit existing images
- Generate new images using other images as a reference
- Edit parts of an image by uploading an image and mask that identifies the areas to replace

### Create a new image using image references

You can use one or more images as a reference to generate a new image.

In this example, we'll use 4 input images to generate a new image of a gift basket containing the items in the reference images.

<div data-content-switcher-pane data-value="responses">
    <div class="hidden">Responses API</div>
    </div>
  <div data-content-switcher-pane data-value="image" hidden>
    <div class="hidden">Image API</div>
    Edit an image

```python
import base64
from openai import OpenAI
client = OpenAI()

prompt = """
Generate a photorealistic image of a gift basket on a white background 
labeled 'Relax & Unwind' with a ribbon and handwriting-like font, 
containing all the items in the reference pictures.
"""

result = client.images.edit(
    model="gpt-image-2",
    image=[
        open("body-lotion.png", "rb"),
        open("bath-bomb.png", "rb"),
        open("incense-kit.png", "rb"),
        open("soap.png", "rb"),
    ],
    prompt=prompt
)

image_base64 = result.data[0].b64_json
image_bytes = base64.b64decode(image_base64)

# Save the image to a file
with open("gift-basket.png", "wb") as f:
    f.write(image_bytes)
```

```javascript
import fs from "fs";
import OpenAI, { toFile } from "openai";

const client = new OpenAI();

const prompt = \`
Generate a photorealistic image of a gift basket on a white background 
labeled 'Relax & Unwind' with a ribbon and handwriting-like font, 
containing all the items in the reference pictures.
\`;

const imageFiles = [
    "bath-bomb.png",
    "body-lotion.png",
    "incense-kit.png",
    "soap.png",
];

const images = await Promise.all(
    imageFiles.map(async (file) =>
        await toFile(fs.createReadStream(file), null, {
            type: "image/png",
        })
    ),
);

const response = await client.images.edit({
    model: "gpt-image-2",
    image: images,
    prompt,
});

// Save the image to a file
const image_base64 = response.data[0].b64_json;
const image_bytes = Buffer.from(image_base64, "base64");
fs.writeFileSync("basket.png", image_bytes);
```

```bash
curl -s -D >(grep -i x-request-id >&2) \\
  -o >(jq -r '.data[0].b64_json' | base64 --decode > gift-basket.png) \\
  -X POST "https://api.openai.com/v1/images/edits" \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -F "model=gpt-image-2" \\
  -F "image[]=@body-lotion.png" \\
  -F "image[]=@bath-bomb.png" \\
  -F "image[]=@incense-kit.png" \\
  -F "image[]=@soap.png" \\
  -F 'prompt=Generate a photorealistic image of a gift basket on a white background labeled "Relax & Unwind" with a ribbon and handwriting-like font, containing all the items in the reference pictures'
```

  </div>



### Edit an image using a mask

You can provide a mask to indicate which part of the image should be edited.

When using a mask with GPT Image, additional instructions are sent to the model to help guide the editing process accordingly.

Masking with GPT Image is entirely prompt-based. The model uses the mask as
  guidance, but may not follow its exact shape with complete precision.

If you provide multiple input images, the mask will be applied to the first image.



<div data-content-switcher-pane data-value="responses">
    <div class="hidden">Responses API</div>
    Edit an image with a mask

```python
from openai import OpenAI
client = OpenAI()

fileId = create_file("sunlit_lounge.png")
maskId = create_file("mask.png")

response = client.responses.create(
    model="gpt-5.4",
    input=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "generate an image of the same sunlit indoor lounge area with a pool but the pool should contain a flamingo",
                },
                {
                    "type": "input_image",
                    "file_id": fileId,
                }
            ],
        },
    ],
    tools=[
        {
            "type": "image_generation",
            "quality": "high",
            "input_image_mask": {
                "file_id": maskId,
            }
        },
    ],
)

image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]

if image_data:
    image_base64 = image_data[0]
    with open("lounge.png", "wb") as f:
        f.write(base64.b64decode(image_base64))
```

```javascript
import OpenAI from "openai";
const openai = new OpenAI();

const fileId = await createFile("sunlit_lounge.png");
const maskId = await createFile("mask.png");

const response = await openai.responses.create({
  model: "gpt-5.4",
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "generate an image of the same sunlit indoor lounge area with a pool but the pool should contain a flamingo",
        },
        {
          type: "input_image",
          file_id: fileId,
        }
      ],
    },
  ],
  tools: [
    {
      type: "image_generation",
      quality: "high",
      input_image_mask: {
        file_id: maskId,
      }
    },
  ],
});

const imageData = response.output
  .filter((output) => output.type === "image_generation_call")
  .map((output) => output.result);

if (imageData.length > 0) {
  const imageBase64 = imageData[0];
  const fs = await import("fs");
  fs.writeFileSync("lounge.png", Buffer.from(imageBase64, "base64"));
}
```

  </div>
  <div data-content-switcher-pane data-value="image" hidden>
    <div class="hidden">Image API</div>
    Edit an image with a mask

```python
from openai import OpenAI
client = OpenAI()

result = client.images.edit(
    model="gpt-image-2",
    image=open("sunlit_lounge.png", "rb"),
    mask=open("mask.png", "rb"),
    prompt="A sunlit indoor lounge area with a pool containing a flamingo"
)

image_base64 = result.data[0].b64_json
image_bytes = base64.b64decode(image_base64)

# Save the image to a file
with open("composition.png", "wb") as f:
    f.write(image_bytes)
```

```javascript
import fs from "fs";
import OpenAI, { toFile } from "openai";

const client = new OpenAI();

const rsp = await client.images.edit({
    model: "gpt-image-2",
    image: await toFile(fs.createReadStream("sunlit_lounge.png"), null, {
        type: "image/png",
    }),
    mask: await toFile(fs.createReadStream("mask.png"), null, {
        type: "image/png",
    }),
    prompt: "A sunlit indoor lounge area with a pool containing a flamingo",
});

// Save the image to a file
const image_base64 = rsp.data[0].b64_json;
const image_bytes = Buffer.from(image_base64, "base64");
fs.writeFileSync("lounge.png", image_bytes);
```

```bash
curl -s -D >(grep -i x-request-id >&2) \\
  -o >(jq -r '.data[0].b64_json' | base64 --decode > lounge.png) \\
  -X POST "https://api.openai.com/v1/images/edits" \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -F "model=gpt-image-2" \\
  -F "mask=@mask.png" \\
  -F "image[]=@sunlit_lounge.png" \\
  -F 'prompt=A sunlit indoor lounge area with a pool containing a flamingo'
```

  </div>



<div className="images-examples">

| Image                                                                                                                                 | Mask                                                                                                                            | Output                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/sunlit_lounge.png" alt="A pink room with a pool" /> | <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/mask.png" alt="A mask in part of the pool" /> | <img className="images-example-image" src="https://cdn.openai.com/API/docs/images/sunlit_lounge_result.png" alt="The original pool with an inflatable flamigo replacing the mask" /> |

</div>

<div className="images-edit-prompt body-small">
  Prompt: a sunlit indoor lounge area with a pool containing a flamingo
</div>

#### Mask requirements

The image to edit and mask must be of the same format and size (less than 50MB in size).

The mask image must also contain an alpha channel. If you're using an image editing tool to create the mask, make sure to save the mask with an alpha channel.

You can modify a black and white image programmatically to add an alpha channel.

Add an alpha channel to a black and white mask

```python
from PIL import Image
from io import BytesIO

# 1. Load your black & white mask as a grayscale image
mask = Image.open(img_path_mask).convert("L")

# 2. Convert it to RGBA so it has space for an alpha channel
mask_rgba = mask.convert("RGBA")

# 3. Then use the mask itself to fill that alpha channel
mask_rgba.putalpha(mask)

# 4. Convert the mask into bytes
buf = BytesIO()
mask_rgba.save(buf, format="PNG")
mask_bytes = buf.getvalue()

# 5. Save the resulting file
img_path_mask_alpha = "mask_alpha.png"
with open(img_path_mask_alpha, "wb") as f:
    f.write(mask_bytes)
```


### Image input fidelity

The `input_fidelity` parameter controls how strongly a model preserves details from input images during edits and reference-image workflows. For `gpt-image-2`, omit this parameter; the API doesn't allow changing it because the model processes every image input at high fidelity automatically.

Because `gpt-image-2` always processes image inputs at high fidelity, image
  input tokens can be higher for edit requests that include reference images. To
  understand the cost implications, refer to the [vision
  costs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses#calculating-costs)
  section.

## Customize Image Output

You can configure the following output options:

- **Size**: Image dimensions (for example, `1024x1024`, `1024x1536`)
- **Quality**: Rendering quality (for example, `low`, `medium`, `high`)
- **Format**: File output format
- **Compression**: Compression level (0-100%) for JPEG and WebP formats
- **Background**: Opaque or automatic

`size`, `quality`, and `background` support the `auto` option, where the model will automatically select the best option based on the prompt.

`gpt-image-2` doesn't currently support transparent backgrounds. Requests with
  `background: "transparent"` aren't supported for this model.

### Size and quality options

`gpt-image-2` accepts any resolution in the `size` parameter when it satisfies the constraints below. Square images are typically fastest to generate.

<table>
  <tbody>
    <tr>
      <td>Popular sizes</td>
      <td>
        <ul>
          <li>
            <code>1024x1024</code> (square)
          </li>
          <li>
            <code>1536x1024</code> (landscape)
          </li>
          <li>
            <code>1024x1536</code> (portrait)
          </li>
          <li>
            <code>2048x2048</code> (2K square)
          </li>
          <li>
            <code>2048x1152</code> (2K landscape)
          </li>
          <li>
            <code>3840x2160</code> (4K landscape)
          </li>
          <li>
            <code>2160x3840</code> (4K portrait)
          </li>
          <li>
            <code>auto</code> (default)
          </li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>Size constraints</td>
      <td>
        <ul>
          <li>
            Maximum edge length must be less than or equal to{" "}
            <code>3840px</code>
          </li>
          <li>
            Both edges must be multiples of <code>16px</code>
          </li>
          <li>
            Long edge to short edge ratio must not exceed <code>3:1</code>
          </li>
          <li>
            Total pixels must be at least <code>655,360</code> and no more than{" "}
            <code>8,294,400</code>
          </li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>Quality options</td>
      <td>
        <ul>
          <li>
            <code>low</code>
          </li>
          <li>
            <code>medium</code>
          </li>
          <li>
            <code>high</code>
          </li>
          <li>
            <code>auto</code> (default)
          </li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

Use `quality: "low"` for fast drafts, thumbnails, and quick iterations. It is
  the fastest option and works well for many common use cases before you move to
  `medium` or `high` for final assets.

Outputs that contain more than `2560x1440` (`3,686,400`) total pixels,
  typically referred to as 2K, are considered experimental.

### Output format

The Image API returns base64-encoded image data.
The default format is `png`, but you can also request `jpeg` or `webp`.

If using `jpeg` or `webp`, you can also specify the `output_compression` parameter to control the compression level (0-100%). For example, `output_compression=50` will compress the image by 50%.

Using `jpeg` is faster than `png`, so you should prioritize this format if
  latency is a concern.

## Limitations

GPT Image models (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`) are powerful and versatile image generation models, but they still have some limitations to be aware of:

- **Latency:** Complex prompts may take up to 2 minutes to process.
- **Text Rendering:** Although significantly improved, the model can still struggle with precise text placement and clarity.
- **Consistency:** While capable of producing consistent imagery, the model may occasionally struggle to maintain visual consistency for recurring characters or brand elements across multiple generations.
- **Composition Control:** Despite improved instruction following, the model may have difficulty placing elements precisely in structured or layout-sensitive compositions.

### Content Moderation

All prompts and generated images are filtered in accordance with our [content policy](https://openai.com/policies/usage-policies/).

For image generation using GPT Image models (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`), you can control moderation strictness with the `moderation` parameter. This parameter supports two values:

- `auto` (default): Standard filtering that seeks to limit creating certain categories of potentially age-inappropriate content.
- `low`: Less restrictive filtering.

### Supported models

When using image generation in the Responses API, `gpt-5` and newer models should support the image generation tool. [Check the model detail page for your model](https://developers.openai.com/api/docs/models) to confirm if your desired model can use the image generation tool.

## Cost and latency

### `gpt-image-2` output tokens

For `gpt-image-2`, use the calculator to estimate output tokens from the requested `quality` and `size`:

### Models prior to `gpt-image-2`

GPT Image models prior to `gpt-image-2` generate images by first producing specialized image tokens. Both latency and eventual cost are proportional to the number of tokens required to render an image—larger image sizes and higher quality settings result in more tokens.

The number of tokens generated depends on image dimensions and quality:

| Quality | Square (1024×1024) | Portrait (1024×1536) | Landscape (1536×1024) |
| ------- | ------------------ | -------------------- | --------------------- |
| Low     | 272 tokens         | 408 tokens           | 400 tokens            |
| Medium  | 1056 tokens        | 1584 tokens          | 1568 tokens           |
| High    | 4160 tokens        | 6240 tokens          | 6208 tokens           |

Note that you will also need to account for [input tokens](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses#calculating-costs): text tokens for the prompt and image tokens for the input images if editing images.
Because `gpt-image-2` always processes image inputs at high fidelity, edit requests that include reference images can use more input tokens.

Refer to the [pricing page](https://developers.openai.com/api/docs/pricing#image-generation) for current
text and image token prices, and use the [Calculating costs](#calculating-costs)
section below to estimate request costs.

The final cost is the sum of:

- input text tokens
- input image tokens if using the edits endpoint
- image output tokens

### Calculating costs

Use the pricing calculator below to estimate request costs for GPT Image models.
`gpt-image-2` supports thousands of valid resolutions; the table below lists the
same sizes used for previous GPT Image models for comparison. For GPT Image 1.5,
GPT Image 1, and GPT Image 1 Mini, the legacy per-image output pricing table is
also listed below. You should still account for text and image input tokens when
estimating the total cost of a request.

A larger non-square resolution can sometimes produce fewer output tokens than
  a smaller or square resolution at the same quality setting.

<table
  style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}
>
  <thead>
    <tr>
      <th style={{ textAlign: "left", padding: "8px", width: "28%" }}>Model</th>
      <th style={{ textAlign: "left", padding: "8px", width: "14%" }}>
        Quality
      </th>
      <th style={{ padding: "8px", width: "19.33%" }}>1024 x 1024</th>
      <th style={{ padding: "8px", width: "19.33%" }}>1024 x 1536</th>
      <th style={{ padding: "8px", width: "19.34%" }}>1536 x 1024</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowSpan="3" style={{ padding: "8px", width: "28%" }}>
        GPT Image 2
        <br />
        <span style={{ fontSize: "0.875em" }}>Additional sizes available</span>
      </td>
      <td style={{ padding: "8px" }}>Low</td>
      <td style={{ padding: "8px" }}>$0.006</td>
      <td style={{ padding: "8px" }}>$0.005</td>
      <td style={{ padding: "8px" }}>$0.005</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>Medium</td>
      <td style={{ padding: "8px" }}>$0.053</td>
      <td style={{ padding: "8px" }}>$0.041</td>
      <td style={{ padding: "8px" }}>$0.041</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>High</td>
      <td style={{ padding: "8px" }}>$0.211</td>
      <td style={{ padding: "8px" }}>$0.165</td>
      <td style={{ padding: "8px" }}>$0.165</td>
    </tr>

    <tr>
      <td rowSpan="3" style={{ padding: "8px", width: "28%" }}>
        GPT Image 1.5
      </td>
      <td style={{ padding: "8px" }}>Low</td>
      <td style={{ padding: "8px" }}>$0.009</td>
      <td style={{ padding: "8px" }}>$0.013</td>
      <td style={{ padding: "8px" }}>$0.013</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>Medium</td>
      <td style={{ padding: "8px" }}>$0.034</td>
      <td style={{ padding: "8px" }}>$0.05</td>
      <td style={{ padding: "8px" }}>$0.05</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>High</td>
      <td style={{ padding: "8px" }}>$0.133</td>
      <td style={{ padding: "8px" }}>$0.2</td>
      <td style={{ padding: "8px" }}>$0.2</td>
    </tr>

    <tr>
      <td rowSpan="3" style={{ padding: "8px", width: "28%" }}>
        GPT Image 1
      </td>
      <td style={{ padding: "8px" }}>Low</td>
      <td style={{ padding: "8px" }}>$0.011</td>
      <td style={{ padding: "8px" }}>$0.016</td>
      <td style={{ padding: "8px" }}>$0.016</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>Medium</td>
      <td style={{ padding: "8px" }}>$0.042</td>
      <td style={{ padding: "8px" }}>$0.063</td>
      <td style={{ padding: "8px" }}>$0.063</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>High</td>
      <td style={{ padding: "8px" }}>$0.167</td>
      <td style={{ padding: "8px" }}>$0.25</td>
      <td style={{ padding: "8px" }}>$0.25</td>
    </tr>

    <tr>
      <td rowSpan="3" style={{ padding: "8px", width: "28%" }}>
        GPT Image 1 Mini
      </td>
      <td style={{ padding: "8px" }}>Low</td>
      <td style={{ padding: "8px" }}>$0.005</td>
      <td style={{ padding: "8px" }}>$0.006</td>
      <td style={{ padding: "8px" }}>$0.006</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>Medium</td>
      <td style={{ padding: "8px" }}>$0.011</td>
      <td style={{ padding: "8px" }}>$0.015</td>
      <td style={{ padding: "8px" }}>$0.015</td>
    </tr>
    <tr>
      <td style={{ padding: "8px" }}>High</td>
      <td style={{ padding: "8px" }}>$0.036</td>
      <td style={{ padding: "8px" }}>$0.052</td>
      <td style={{ padding: "8px" }}>$0.052</td>
    </tr>

  </tbody>
</table>

### Partial images cost

If you want to [stream image generation](#streaming) using the `partial_images` parameter, each partial image will incur an additional 100 image output tokens.

---

# Nano Banana image generation

Prompt to prototype fully-functional, UI-complete apps, and see Nano Banana 2 integrated with real-world tools, data, and the Gemini ecosystem. All before writing a single line of code.

- [Try a Nano Banana 2 app](https://aistudio.google.com/apps/bundled/pet_passport)
- Or build your own from prompts:
- ![magazine](https://storage.googleapis.com/generativeai-downloads/images/magazine-2.jpg) ![london](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/05-output.jpg) ![restore](https://storage.googleapis.com/generativeai-downloads/images/quetzal.png) ![banana](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/06-output.jpg) ![cafe](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/02-a-photo-of-an-everyday-scene-at-a-busy-cafe-servin.jpg) ![article](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/10-use-search-to-find-how-the-gemini-3-flash-launch-h.jpg) ![dog](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/01-an-icon-representing-a-cute-dog-the-background-is-.jpg) ![isometric](https://storage.googleapis.com/generativeai-downloads/images/isometric-pool.jpg)
- ![magazine](https://storage.googleapis.com/generativeai-downloads/images/magazine-2.jpg) Generated by Nano Banana 2 **Prompt:** "A photo of a glossy magazine cover, the minimal blue cover has the large bold words Nano Banana. The text is in a serif font and fills the view. No other text. In front of the text there is a portrait of a person in a sleek and minimal dress. She is playfully holding the number 2, which is the focal point.   
  Put the issue number and "Feb 2026" date in the corner along with a barcode. The magazine is on a shelf against an orange plastered wall, within a designer store." Create [professional product shots](https://ai.google.dev/gemini-api/docs/image-generation#4_product_mockups_commercial_photography) in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing)
- ![london](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/05-output.jpg) Generated by Nano Banana Pro **Prompt:** "Present a clear, 45° top-down isometric miniature 3D cartoon scene of London, featuring its most iconic landmarks and architectural elements. Use soft, refined textures with realistic PBR materials and gentle, lifelike lighting and shadows. Integrate the current weather conditions directly into the city environment to create an immersive atmospheric mood. Use a clean, minimalistic composition with a soft, solid-colored background. At the top-center, place the title "London" in large bold text, a prominent weather icon beneath it, then the date (small text) and temperature (medium text). All text must be centered with consistent spacing, and may subtly overlap the tops of the buildings." Learn more about [search grounding](https://ai.google.dev/gemini-api/docs/image-generation#use-with-grounding) and try it in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing,search_grounding)
- ![quetzal](https://storage.googleapis.com/generativeai-downloads/images/quetzal.png) Generated by Nano Banana 2 **Prompt:** "Use image search to find accurate images of a resplendent quetzal bird. Create a beautiful 3:2 wallpaper of this bird, with a natural top to bottom gradient and minimal composition." Use Google [Image Search](https://ai.google.dev/gemini-api/docs/image-generation#image-search) grounding with Nano Banana 2. Try it in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing,search_grounding)
- ![banana](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/06.jpg) Generated by Nano Banana Pro **Prompt:** "Put this logo on a high-end ad for a banana scented perfume. The logo is perfectly integrated into the bottle." Try Nano Banana's [high fidelity detail preservation](https://ai.google.dev/gemini-api/docs/image-generation#5_high-fidelity_detail_preservation) in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing)
- ![cafe](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/02-a-photo-of-an-everyday-scene-at-a-busy-cafe-servin.jpg) Generated by Nano Banana Pro **Prompt:** "A photo of an everyday scene at a busy cafe serving breakfast. In the foreground is an anime man with blue hair, one of the people is a pencil sketch, another is a claymation person" Experiment with different [artistic styles](https://ai.google.dev/gemini-api/docs/image-generation#3_style_transfer) with Nano Banana in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing)
- ![article](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/10-use-search-to-find-how-the-gemini-3-flash-launch-h.jpg) Generated by Nano Banana Pro **Prompt:** "Use search to find how the Gemini 3 Flash launch has been received. Use this information to write a short article about it (with headings). Return a photo of the article as it appeared in a design focused glossy magazine. It is a photo of a single folded over page, showing the article about Gemini 3 Flash. One hero photo. Headline in serif." Generate [accurate text](https://ai.google.dev/gemini-api/docs/image-generation#3_accurate_text_in_images) from [search](https://ai.google.dev/gemini-api/docs/image-generation#use-with-grounding). Try Nano Banana in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing,search_grounding)
- ![dog](https://storage.googleapis.com/generativeai-downloads/images/Nano%20Banana%20Pro%20outputs%20for%20docs/01-an-icon-representing-a-cute-dog-the-background-is-.jpg) Generated by Nano Banana Pro **Prompt:** "An icon representing a cute dog. The background is white. Make the icons in a colorful and tactile 3D style. No text." Create [icons, stickers, and assets](https://ai.google.dev/gemini-api/docs/image-generation#2_stylized_illustrations_stickers) with Nano Banana in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing,search_grounding)
- ![isometric](https://storage.googleapis.com/generativeai-downloads/images/isometric-pool.jpg) Generated by Nano Banana 2 **Prompt:** "Make a photo that is perfectly isometric. It is not a miniature, it is a captured photo that just happened to be perfectly isometric. It is a photo of a beautiful modern garden. There's a large 2 shaped pool and the words: Nano Banana 2." Try [photorealistic image generation](https://ai.google.dev/gemini-api/docs/image-generation#1_photorealistic_scenes) in [AI Studio](https://aistudio.google.com/apps?features=chat_based_image_editing)

**Nano Banana** is the name for Gemini's native image generation capabilities.
Gemini can generate and process images conversationally
with text, images, or a combination of both. This lets you create, edit, and
iterate on visuals with unprecedented control.

Nano Banana refers to three distinct models available in the Gemini API:

- **Nano Banana 2** : The [Gemini 3.1 Flash Image Preview](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image-preview) model (`gemini-3.1-flash-image-preview`). This model serves as the high-efficiency counterpart to Gemini 3 Pro Image, optimized for speed and high-volume developer use cases.
- **Nano Banana Pro** : The [Gemini 3 Pro Image Preview](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image-preview) model (`gemini-3-pro-image-preview`). This model is designed for professional asset production, utilizing advanced reasoning ("Thinking") to follow complex instructions and render high-fidelity text.
- **Nano Banana** : The [Gemini 2.5 Flash Image](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image) model (`gemini-2.5-flash-image`). This model is designed for speed and efficiency, optimized for high-volume, low-latency tasks.

All generated images include a [SynthID watermark](https://ai.google.dev/responsible/docs/safeguards/synthid).

## Image generation (text-to-image)

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    prompt = ("Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme")
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[prompt],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("generated_image.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("gemini-native-image.png", buffer);
          console.log("Image saved as gemini-native-image.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          genai.Text("Create a picture of a nano banana dish in a " +
                     " fancy restaurant with a Gemini theme"),
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "gemini_generated_image.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class TextToImage {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme",
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("_01_generated_image.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
          ]
        }]
      }'

## Image editing (text-and-image-to-image)

**Reminder** : Make sure you have the necessary rights to any images you upload.
Don't generate content that infringe on others' rights, including videos or
images that deceive, harass, or harm. Your use of this generative AI service is
subject to our [Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).

Provide an image and use text prompts to add, remove, or modify elements,
change the style, or adjust the color grading.

The following example demonstrates uploading `base64` encoded images.
For multiple images, larger payloads, and supported MIME types, check the [Image
understanding](https://ai.google.dev/gemini-api/docs/image-understanding) page.

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    prompt = (
        "Create a picture of my cat eating a nano-banana in a "
        "fancy restaurant under the Gemini constellation",
    )

    image = Image.open("/path/to/cat_image.png")

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[prompt, image],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("generated_image.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "path/to/cat_image.png";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        { text: "Create a picture of my cat eating a nano-banana in a" +
                "fancy restaurant under the Gemini constellation" },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("gemini-native-image.png", buffer);
          console.log("Image saved as gemini-native-image.png");
        }
      }
    }

    main();

### Go

    package main

    import (
     "context"
     "fmt"
     "log"
     "os"
     "google.golang.org/genai"
    )

    func main() {

     ctx := context.Background()
     client, err := genai.NewClient(ctx, nil)
     if err != nil {
         log.Fatal(err)
     }

     imagePath := "/path/to/cat_image.png"
     imgData, _ := os.ReadFile(imagePath)

     parts := []*genai.Part{
       genai.NewPartFromText("Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation"),
       &genai.Part{
         InlineData: &genai.Blob{
           MIMEType: "image/png",
           Data:     imgData,
         },
       },
     }

     contents := []*genai.Content{
       genai.NewContentFromParts(parts, genai.RoleUser),
     }

     result, _ := client.Models.GenerateContent(
         ctx,
         "gemini-3.1-flash-image-preview",
         contents,
     )

     for _, part := range result.Candidates[0].Content.Parts {
         if part.Text != "" {
             fmt.Println(part.Text)
         } else if part.InlineData != nil {
             imageBytes := part.InlineData.Data
             outputFilename := "gemini_generated_image.png"
             _ = os.WriteFile(outputFilename, imageBytes, 0644)
         }
     }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class TextAndImageToImage {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromText("""
                      Create a picture of my cat eating a nano-banana in
                      a fancy restaurant under the Gemini constellation
                      """),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("src/main/resources/cat.jpg")),
                      "image/jpeg")),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("gemini_generated_image.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {\"text\": \"'Create a picture of my cat eating a nano-banana in a fancy restaurant under the Gemini constellation\"},
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/jpeg\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                }
            ]
          }]
        }"

### Multi-turn image editing

Keep generating and editing images conversationally. Chat or multi-turn
conversation is the recommended way to iterate on images. The following
example shows a prompt to generate an infographic about photosynthesis.

### Python

    from google import genai
    from google.genai import types

    client = genai.Client()

    chat = client.chats.create(
        model="gemini-3.1-flash-image-preview",
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            tools=[{"google_search": {}}]
        )
    )

    message = "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."

    response = chat.send_message(message)

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("photosynthesis.png")

### Javascript

    import { GoogleGenAI } from "@google/genai";

    const ai = new GoogleGenAI({});

    async function main() {
      const chat = ai.chats.create({
        model: "gemini-3.1-flash-image-preview",
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          tools: [{googleSearch: {}}],
        },
      });
    }

    await main();

    const message = "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."

    let response = await chat.sendMessage({message});

    for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("photosynthesis.png", buffer);
          console.log("Image saved as photosynthesis.png");
        }
    }

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
        defer client.Close()

        model := client.GenerativeModel("gemini-3.1-flash-image-preview")
        model.GenerationConfig = &pb.GenerationConfig{
            ResponseModalities: []pb.ResponseModality{genai.Text, genai.Image},
        }
        chat := model.StartChat()

        message := "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."

        resp, err := chat.SendMessage(ctx, genai.Text(message))
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range resp.Candidates[0].Content.Parts {
            if txt, ok := part.(genai.Text); ok {
                fmt.Printf("%s", string(txt))
            } else if img, ok := part.(genai.ImageData); ok {
                err := os.WriteFile("photosynthesis.png", img.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
            }
        }
    }

### Java

    import com.google.genai.Chat;
    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.GoogleSearch;
    import com.google.genai.types.ImageConfig;
    import com.google.genai.types.Part;
    import com.google.genai.types.RetrievalConfig;
    import com.google.genai.types.Tool;
    import com.google.genai.types.ToolConfig;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class MultiturnImageEditing {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {

          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .tools(Tool.builder()
                  .googleSearch(GoogleSearch.builder().build())
                  .build())
              .build();

          Chat chat = client.chats.create("gemini-3.1-flash-image-preview", config);

          GenerateContentResponse response = chat.sendMessage("""
              Create a vibrant infographic that explains photosynthesis
              as if it were a recipe for a plant's favorite food.
              Show the "ingredients" (sunlight, water, CO2)
              and the "finished dish" (sugar/energy).
              The style should be like a page from a colorful
              kids' cookbook, suitable for a 4th grader.
              """);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("photosynthesis.png"), blob.data().get());
              }
            }
          }
          // ...
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "role": "user",
          "parts": [
            {"text": "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plants favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids cookbook, suitable for a 4th grader."}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["TEXT", "IMAGE"]
        }
      }'

![AI-generated infographic about photosynthesis](https://ai.google.dev/static/gemini-api/docs/images/infographic-eng.png) AI-generated infographic about photosynthesis

You can then use the same chat to change the language on the graphic to Spanish.

### Python

    message = "Update this infographic to be in Spanish. Do not change any other elements of the image."
    aspect_ratio = "16:9" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
    resolution = "2K" # "512", "1K", "2K", "4K"

    response = chat.send_message(message,
        config=types.GenerateContentConfig(
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=resolution
            ),
        ))

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("photosynthesis_spanish.png")

### Javascript

    const message = 'Update this infographic to be in Spanish. Do not change any other elements of the image.';
    const aspectRatio = '16:9';
    const resolution = '2K';

    let response = await chat.sendMessage({
      message,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: resolution,
        },
        tools: [{googleSearch: {}}],
      },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("photosynthesis2.png", buffer);
          console.log("Image saved as photosynthesis2.png");
        }
    }

### Go

    message = "Update this infographic to be in Spanish. Do not change any other elements of the image."
    aspect_ratio = "16:9" // "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
    resolution = "2K"     // "512", "1K", "2K", "4K"

    model.GenerationConfig.ImageConfig = &pb.ImageConfig{
        AspectRatio: aspect_ratio,
        ImageSize:   resolution,
    }

    resp, err = chat.SendMessage(ctx, genai.Text(message))
    if err != nil {
        log.Fatal(err)
    }

    for _, part := range resp.Candidates[0].Content.Parts {
        if txt, ok := part.(genai.Text); ok {
            fmt.Printf("%s", string(txt))
        } else if img, ok := part.(genai.ImageData); ok {
            err := os.WriteFile("photosynthesis_spanish.png", img.Data, 0644)
            if err != nil {
                log.Fatal(err)
            }
        }
    }

### Java

    String aspectRatio = "16:9"; // "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
    String resolution = "2K"; // "512", "1K", "2K", "4K"

    config = GenerateContentConfig.builder()
        .responseModalities("TEXT", "IMAGE")
        .imageConfig(ImageConfig.builder()
            .aspectRatio(aspectRatio)
            .imageSize(resolution)
            .build())
        .build();

    response = chat.sendMessage(
        "Update this infographic to be in Spanish. " + 
        "Do not change any other elements of the image.",
        config);

    for (Part part : response.parts()) {
      if (part.text().isPresent()) {
        System.out.println(part.text().get());
      } else if (part.inlineData().isPresent()) {
        var blob = part.inlineData().get();
        if (blob.data().isPresent()) {
          Files.write(Paths.get("photosynthesis_spanish.png"), blob.data().get());
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{
        "contents": [
          {
            "role": "user",
            "parts": [{"text": "Create a vibrant infographic that explains photosynthesis..."}]
          },
          {
            "role": "model",
            "parts": [{"inline_data": {"mime_type": "image/png", "data": "<PREVIOUS_IMAGE_DATA>"}}]
          },
          {
            "role": "user",
            "parts": [{"text": "Update this infographic to be in Spanish. Do not change any other elements of the image."}]
          }
        ],
        "tools": [{"google_search": {}}],
        "generationConfig": {
          "responseModalities": ["TEXT", "IMAGE"],
          "imageConfig": {
            "aspectRatio": "16:9",
            "imageSize": "2K"
          }
        }
      }'

![AI-generated infographic of photosynthesis in Spanish](https://ai.google.dev/static/gemini-api/docs/images/infographic-spanish.png) AI-generated infographic of photosynthesis in Spanish

## New with Gemini 3 Image models

Gemini 3 offers state-of-the-art image generation and editing models. Gemini 3.1
Flash Image is optimized for speed and high-volume use-cases, and Gemini 3
Pro Image is optimized for professional asset production.
Designed to tackle the most challenging workflows through advanced reasoning,
they excel at complex, multi-turn creation and modification tasks.

- **High-resolution output** : Built-in generation capabilities for 1K, 2K, and 4K visuals.
  - **Gemini 3.1 Flash Image** adds the smaller 512 (0.5K) resolution.
- **Advanced text rendering**: Capable of generating legible, stylized text for infographics, menus, diagrams, and marketing assets.
- **Grounding with Google Search** : The model can use Google Search as a tool to verify facts and generate imagery based on real-time data (e.g., current weather maps, stock charts, recent events).
  - **Gemini 3.1 Flash Image** adds the integration of Grounding with Google Search for Images alongside Web Search.
- **Thinking mode**: The model utilizes a "thinking" process to reason through complex prompts. It generates interim "thought images" (visible in the backend but not charged) to refine the composition before producing the final high-quality output.
- **Up to 14 reference images**: You can now mix up to 14 reference images to produce the final image.
- **New aspect ratios** : Gemini 3.1 Flash Image Preview adds 1:4, 4:1, 1:8, and 8:1 [aspect ratios](https://ai.google.dev/gemini-api/docs/image-generation#aspect_ratios_and_image_size).

### Use up to 14 reference images

Gemini 3 image models let you to mix up to 14 reference images. These 14 images
can include the following:

| Gemini 3.1 Flash Image Preview | Gemini 3 Pro Image Preview |
|---|---|
| Up to 10 images of objects with high-fidelity to include in the final image | Up to 6 images of objects with high-fidelity to include in the final image |
| Up to 4 images of characters to maintain character consistency | Up to 5 images of characters to maintain character consistency |

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    prompt = "An office group photo of these people, they are making funny faces."
    aspect_ratio = "5:4" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
    resolution = "2K" # "512", "1K", "2K", "4K"

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[
            prompt,
            Image.open('person1.png'),
            Image.open('person2.png'),
            Image.open('person3.png'),
            Image.open('person4.png'),
            Image.open('person5.png'),
        ],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=resolution
            ),
        )
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("office.png")

### Javascript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
          'An office group photo of these people, they are making funny faces.';
      const aspectRatio = '5:4';
      const resolution = '2K';

    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageFile1,
        },
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageFile2,
        },
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageFile3,
        },
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageFile4,
        },
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageFile5,
        },
      }
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: contents,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution,
          },
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("image.png", buffer);
          console.log("Image saved as image.png");
        }
      }

    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
        defer client.Close()

        model := client.GenerativeModel("gemini-3.1-flash-image-preview")
        model.GenerationConfig = &pb.GenerationConfig{
            ResponseModalities: []pb.ResponseModality{genai.Text, genai.Image},
            ImageConfig: &pb.ImageConfig{
                AspectRatio: "5:4",
                ImageSize:   "2K",
            },
        }

        img1, err := os.ReadFile("person1.png")
        if err != nil { log.Fatal(err) }
        img2, err := os.ReadFile("person2.png")
        if err != nil { log.Fatal(err) }
        img3, err := os.ReadFile("person3.png")
        if err != nil { log.Fatal(err) }
        img4, err := os.ReadFile("person4.png")
        if err != nil { log.Fatal(err) }
        img5, err := os.ReadFile("person5.png")
        if err != nil { log.Fatal(err) }

        parts := []genai.Part{
            genai.Text("An office group photo of these people, they are making funny faces."),
            genai.ImageData{MIMEType: "image/png", Data: img1},
            genai.ImageData{MIMEType: "image/png", Data: img2},
            genai.ImageData{MIMEType: "image/png", Data: img3},
            genai.ImageData{MIMEType: "image/png", Data: img4},
            genai.ImageData{MIMEType: "image/png", Data: img5},
        }

        resp, err := model.GenerateContent(ctx, parts...)
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range resp.Candidates[0].Content.Parts {
            if txt, ok := part.(genai.Text); ok {
                fmt.Printf("%s", string(txt))
            } else if img, ok := part.(genai.ImageData); ok {
                err := os.WriteFile("office.png", img.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.ImageConfig;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class GroupPhoto {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("5:4")
                  .imageSize("2K")
                  .build())
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromText("An office group photo of these people, they are making funny faces."),
                  Part.fromBytes(Files.readAllBytes(Path.of("person1.png")), "image/png"),
                  Part.fromBytes(Files.readAllBytes(Path.of("person2.png")), "image/png"),
                  Part.fromBytes(Files.readAllBytes(Path.of("person3.png")), "image/png"),
                  Part.fromBytes(Files.readAllBytes(Path.of("person4.png")), "image/png"),
                  Part.fromBytes(Files.readAllBytes(Path.of("person5.png")), "image/png")
              ), config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("office.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {\"text\": \"An office group photo of these people, they are making funny faces.\"},
                {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_1>\"}},
                {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_2>\"}},
                {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_3>\"}},
                {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_4>\"}},
                {\"inline_data\": {\"mime_type\":\"image/png\", \"data\": \"<BASE64_DATA_IMG_5>\"}}
            ]
          }],
          \"generationConfig\": {
            \"responseModalities\": [\"TEXT\", \"IMAGE\"],
            \"imageConfig\": {
              \"aspectRatio\": \"5:4\",
              \"imageSize\": \"2K\"
            }
          }
        }"

![AI-generated office group photo](https://ai.google.dev/static/gemini-api/docs/images/office-group-photo.jpeg) AI-generated office group photo

### Grounding with Google Search

Use the [Google Search tool](https://ai.google.dev/gemini-api/docs/google-search) to generate images
based on real-time information, such as weather forecasts, stock charts, or
recent events.

Note that when using Grounding with Google Search with image generation,
image-based search results are not passed to the generation model and are
excluded from the response (see [Grounding with Google Search for images](https://ai.google.dev/gemini-api/docs/image-generation#image-search))

### Python

    from google import genai
    prompt = "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day"
    aspect_ratio = "16:9" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=['Text', 'Image'],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
            ),
            tools=[{"google_search": {}}]
        )
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("weather.png")

### Javascript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt = 'Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day';
      const aspectRatio = '16:9';
      const resolution = '2K';

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution,
          },
        tools: [{ googleSearch: {} }]
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("image.png", buffer);
          console.log("Image saved as image.png");
        }
      }

    }

    main();

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.GoogleSearch;
    import com.google.genai.types.ImageConfig;
    import com.google.genai.types.Part;
    import com.google.genai.types.Tool;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class SearchGrounding {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("16:9")
                  .build())
              .tools(Tool.builder()
                  .googleSearch(GoogleSearch.builder().build())
                  .build())
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview", """
                  Visualize the current weather forecast for the next 5 days
                  in San Francisco as a clean, modern weather chart.
                  Add a visual on what I should wear each day
                  """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("weather.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{"parts": [{"text": "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day"}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
          "responseModalities": ["TEXT", "IMAGE"],
          "imageConfig": {"aspectRatio": "16:9"}
        }
      }'

![AI-generated five day weather chart for San Francisco](https://ai.google.dev/static/gemini-api/docs/images/weather-forecast.png) AI-generated five day weather chart for San Francisco

The response includes `groundingMetadata` which contains the following required
fields:

- **`searchEntryPoint`**: Contains the HTML and CSS to render the required search suggestions.
- **`groundingChunks`**: Returns the top 3 web sources used to ground the generated image

### Grounding with Google Search for Images (3.1 Flash)

> [!NOTE]
> **Note:** This feature is only available for the Gemini 3.1 Flash Image model.

Grounding with Google Search for images allows models to use web images retrieved via
Google Search as visual context for image generation. Image Search is a
new search type within the existing Grounding with Google Search tool,
functioning alongside standard [Web Search](https://ai.google.dev/gemini-api/docs/image-generation#use-with-grounding).

To enable Image Search, configure the `googleSearch` tool in your API request
and specify `imageSearch` within the `searchTypes` object. Image Search can be
used independently or together with Web Search.

Note that Grounding with Google Search for images can't be used to search for people.

### Python

    from google import genai
    prompt = "A detailed painting of a Timareta butterfly resting on a flower"

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            tools=[
                types.Tool(google_search=types.GoogleSearch(
                    search_types=types.SearchTypes(
                        web_search=types.WebSearch(),
                        image_search=types.ImageSearch()
                    )
                ))
            ]
        )
    )

    # Display grounding sources if available
    if response.candidates and response.candidates[0].grounding_metadata and response.candidates[0].grounding_metadata.search_entry_point:
        display(HTML(response.candidates[0].grounding_metadata.search_entry_point.rendered_content))

### JavaScript

    import { GoogleGenAI } from "@google/genai";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt = "A detailed painting of a Timareta butterfly resting on a flower";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
        config: {
          responseModalities: ["IMAGE"],
          tools: [
            {
              googleSearch: {
                searchTypes: {
                  webSearch: {},
                  imageSearch: {}
                }
              }
            }
          ]
        }
      });

      // Display grounding sources if available
      if (response.candidates && response.candidates[0].groundingMetadata && response.candidates[0].groundingMetadata.searchEntryPoint) {
          console.log(response.candidates[0].groundingMetadata.searchEntryPoint.renderedContent);
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"

      "google.golang.org/genai"
      pb "google.golang.org/genai/schema"
    )

    func main() {
      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
        log.Fatal(err)
      }
      defer client.Close()

      model := client.GenerativeModel("gemini-3.1-flash-image-preview")
      model.Tools = []*pb.Tool{
        {
          GoogleSearch: &pb.GoogleSearch{
            SearchTypes: &pb.SearchTypes{
              WebSearch:   &pb.WebSearch{},
              ImageSearch: &pb.ImageSearch{},
            },
          },
        },
      }
      model.GenerationConfig = &pb.GenerationConfig{
        ResponseModalities: []pb.ResponseModality{genai.Image},
      }

      prompt := "A detailed painting of a Timareta butterfly resting on a flower"
      resp, err := model.GenerateContent(ctx, genai.Text(prompt))
      if err != nil {
        log.Fatal(err)
      }

      if resp.Candidates[0].GroundingMetadata != nil && resp.Candidates[0].GroundingMetadata.SearchEntryPoint != nil {
        fmt.Println(resp.Candidates[0].GroundingMetadata.SearchEntryPoint.RenderedContent)
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{"parts": [{"text": "A detailed painting of a Timareta butterfly resting on a flower"}]}],
        "tools": [{"google_search": {"searchTypes": {"webSearch": {}, "imageSearch": {}}}}],
        "generationConfig": {
          "responseModalities": ["IMAGE"]
        }
      }'

**Display requirements**

When you use Image Search within Grounding with Google Search, you must comply
with the following conditions:

- **Source attribution**: You must provide a link to the webpage containing the source image (the "containing page," not the image file itself) in a manner that the user will recognize as a link.
- **Direct navigation**: If you also choose to display the source images, you must provide a direct, single-click path from the source images to its containing source webpage. Any other implementation that delays or abstracts the end user's access to the source webpage, including but not limited to any multi-click path or the use of an intermediate image viewer, is not permitted.

**Response**

For grounded responses using image search, the API provides clear attribution
and metadata to link its output to verified sources. Key fields in the
`groundingMetadata` object include:

- **`imageSearchQueries`**: The specific queries used by the model for visual context (image search).
- **`groundingChunks`**: Contains source information for retrieved results.
  For image sources, these will be returned as redirect URLs using a new image
  chunk type. This chunk includes:

  - **`uri`**: The web page URL for attribution (the landing page).
  - **`image_uri`**: The direct image URL.
- **`groundingSupports`**: Provides specific mappings that link the generated
  content to its relevant citation source in the chunks.

- **`searchEntryPoint`**: Includes the "Google Search" chip containing
  compliant HTML and CSS to render Search Suggestions.

### Generate images up to 4K resolution

Gemini 3 image models generate 1K images by default but can also output 2K,
4K, and 512 (0.5K) (Gemini 3.1 Flash Image only) images. To generate higher
resolution assets, specify the `image_size` in the `generation_config`.

You must use an uppercase 'K' (e.g. 1K, 2K, 4K). The `512` value does not use a 'K' suffix. Lowercase
parameters (e.g., 1k) will be rejected.

### Python

    from google import genai
    from google.genai import types

    prompt = "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
    aspect_ratio = "1:1" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"
    resolution = "1K" # "512", "1K", "2K", "4K"

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=resolution
            ),
        )
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("butterfly.png")

### Javascript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
          'Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English.';
      const aspectRatio = '1:1';
      const resolution = '1K';

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution,
          },
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("image.png", buffer);
          console.log("Image saved as image.png");
        }
      }

    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
        defer client.Close()

        model := client.GenerativeModel("gemini-3.1-flash-image-preview")
        model.GenerationConfig = &pb.GenerationConfig{
            ResponseModalities: []pb.ResponseModality{genai.Text, genai.Image},
            ImageConfig: &pb.ImageConfig{
                AspectRatio: "1:1",
                ImageSize:   "1K",
            },
        }

        prompt := "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        resp, err := model.GenerateContent(ctx, genai.Text(prompt))
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range resp.Candidates[0].Content.Parts {
            if txt, ok := part.(genai.Text); ok {
                fmt.Printf("%s", string(txt))
            } else if img, ok := part.(genai.ImageData); ok {
                err := os.WriteFile("butterfly.png", img.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.GoogleSearch;
    import com.google.genai.types.ImageConfig;
    import com.google.genai.types.Part;
    import com.google.genai.types.Tool;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class HiRes {
        public static void main(String[] args) throws IOException {

          try (Client client = new Client()) {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseModalities("TEXT", "IMAGE")
                .imageConfig(ImageConfig.builder()
                    .aspectRatio("16:9")
                    .imageSize("4K")
                    .build())
                .build();

            GenerateContentResponse response = client.models.generateContent(
                "gemini-3.1-flash-image-preview", """
                  Da Vinci style anatomical sketch of a dissected Monarch butterfly.
                  Detailed drawings of the head, wings, and legs on textured
                  parchment with notes in English.
                  """,
                config);

            for (Part part : response.parts()) {
              if (part.text().isPresent()) {
                System.out.println(part.text().get());
              } else if (part.inlineData().isPresent()) {
                var blob = part.inlineData().get();
                if (blob.data().isPresent()) {
                  Files.write(Paths.get("butterfly.png"), blob.data().get());
                }
              }
            }
          }
        }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{"parts": [{"text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
          "responseModalities": ["TEXT", "IMAGE"],
          "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"}
        }
      }'

The following is an example image generated from this prompt:
![AI-generated Da Vinci style anatomical sketch of a dissected Monarch butterfly.](https://ai.google.dev/static/gemini-api/docs/images/gemini3-4k-image.png) AI-generated Da Vinci style anatomical sketch of a dissected Monarch butterfly.

### Thinking Process

Gemini 3 image models are thinking models that use a reasoning
process ("Thinking") for complex prompts. This feature is enabled by default and
cannot be disabled in the API. To learn more about the thinking process, see
the [Gemini Thinking](https://ai.google.dev/gemini-api/docs/thinking) guide.

The model generates up to two interim images to test composition and logic. The
last image within Thinking is also the final rendered image.

You can check the thoughts that lead to the final image being produced.

### Python

    for part in response.parts:
        if part.thought:
            if part.text:
                print(part.text)
            elif image:= part.as_image():
                image.show()

### Javascript

    for (const part of response.candidates[0].content.parts) {
      if (part.thought) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, 'base64');
          fs.writeFileSync('image.png', buffer);
          console.log('Image saved as image.png');
        }
      }
    }

#### Controlling thinking levels

With Gemini 3.1 Flash Image, you can control the amount of thinking the model
uses to balance quality and latency. The default `thinkingLevel` is `minimal`,
and the supported levels are `minimal` and `high`. Setting the
`thinkingLevel` to `minimal` provides the lowest latency responses. Note that
minimal thinking does not mean the model uses no thinking at all.

You can add the `includeThoughts` boolean to determine whether the model's
generated thoughts are returned in the response, or remain hidden.

### Python

    from google import genai

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="A futuristic city built inside a giant glass bottle floating in space",
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            thinking_config=types.ThinkingConfig(
                thinking_level="High",
                include_thoughts=True
            ),
        )
    )

    for part in response.parts:
        if part.thought: # Skip outputting thoughts
          continue
        if part.text:
          display(Markdown(part.text))
        elif image:= part.as_image():
          image.show()

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: "A futuristic city built inside a giant glass bottle floating in space",
        config: {
          responseModalities: ["IMAGE"],
          thinkingConfig: {
            thinkingLevel: "High",
            includeThoughts: true
          },
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.thought) { // Skip outputting thoughts
          continue;
        }
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("image.png", buffer);
          console.log("Image saved as image.png");
        }
      }
    }
    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
        pb "google.golang.org/genai/schema"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
        defer client.Close()

        model := client.GenerativeModel("gemini-3.1-flash-image-preview")
        model.GenerationConfig = &pb.GenerationConfig{
            ResponseModalities: []pb.ResponseModality{genai.Image},
            ThinkingConfig: &pb.ThinkingConfig{
                ThinkingLevel:   "High",
                IncludeThoughts: true,
            },
        }

        prompt := "A futuristic city built inside a giant glass bottle floating in space"
        resp, err := model.GenerateContent(ctx, genai.Text(prompt))
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range resp.Candidates[0].Content.Parts {
            if part.Thought { // Skip outputting thoughts
                continue
            }
            if txt, ok := part.(genai.Text); ok {
                fmt.Printf("%s", string(txt))
            } else if img, ok := part.(genai.ImageData); ok {
                err := os.WriteFile("image.png", img.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
            }
        }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{"parts": [{"text": "A futuristic city built inside a giant glass bottle floating in space"}]}],
        "generationConfig": {
          "responseModalities": ["IMAGE"],
          "thinkingConfig": {
            "thinkingLevel": "High",
            "includeThoughts": true
          }
        }
      }'

Note that thinking tokens are billed regardless of whether `includeThoughts` is
set to `true` or `false`, as the [thinking process](https://ai.google.dev/gemini-api/docs/image-generation#thinking-process) always
happens by default whether you view the process or not.

#### Thought Signatures

Thought signatures are encrypted representations of the
model's internal thought process and are used to preserve reasoning context
across multi-turn interactions. All responses include a `thought_signature`
field. As a general rule, if you receive a thought signature in a model
response, you should pass it back exactly as received when sending the
conversation history in the next turn. Failure to circulate thought signatures
may cause the response to fail. Check the [thought signature](https://ai.google.dev/gemini-api/docs/thought-signatures)
documentation for more explanations of signatures overall.

> [!NOTE]
> **Note:** If you use the official [Google Gen AI SDKs](https://ai.google.dev/gemini-api/docs/libraries) and use the chat feature (or append the full model response object directly to history), **thought signatures are handled automatically**. You do not need to manually extract or manage them, or change your code.

Here is how thought signatures work:

- All `inline_data` parts with image `mimetype` which are part of the response should have signature.
- If there are some text parts at the beginning (before any image) right after the thoughts, the first text part should also have a signature.
- If `inline_data` parts with image `mimetype` are part of thoughts, they won't have signatures.

The following code shows an example of where thought signatures are included:

    [
      {
        "inline_data": {
          "data": "<base64_image_data_0>",
          "mime_type": "image/png"
        },
        "thought": true // Thoughts don't have signatures
      },
      {
        "inline_data": {
          "data": "<base64_image_data_1>",
          "mime_type": "image/png"
        },
        "thought": true // Thoughts don't have signatures
      },
      {
        "inline_data": {
          "data": "<base64_image_data_2>",
          "mime_type": "image/png"
        },
        "thought": true // Thoughts don't have signatures
      },
      {
        "text": "Here is a step-by-step guide to baking macarons, presented in three separate images.\n\n### Step 1: Piping the Batter\n\nThe first step after making your macaron batter is to pipe it onto a baking sheet. This requires a steady hand to create uniform circles.\n\n",
        "thought_signature": "<Signature_A>" // The first non-thought part always has a signature
      },
      {
        "inline_data": {
          "data": "<base64_image_data_3>",
          "mime_type": "image/png"
        },
        "thought_signature": "<Signature_B>" // All image parts have a signatures
      },
      {
        "text": "\n\n### Step 2: Baking and Developing Feet\n\nOnce piped, the macarons are baked in the oven. A key sign of a successful bake is the development of \"feet\"---the ruffled edge at the base of each macaron shell.\n\n"
        // Follow-up text parts don't have signatures
      },
      {
        "inline_data": {
          "data": "<base64_image_data_4>",
          "mime_type": "image/png"
        },
        "thought_signature": "<Signature_C>" // All image parts have a signatures
      },
      {
        "text": "\n\n### Step 3: Assembling the Macaron\n\nThe final step is to pair the cooled macaron shells by size and sandwich them together with your desired filling, creating the classic macaron dessert.\n\n"
      },
      {
        "inline_data": {
          "data": "<base64_image_data_5>",
          "mime_type": "image/png"
        },
        "thought_signature": "<Signature_D>" // All image parts have a signatures
      }
    ]

## Other image generation modes

Gemini supports other image interaction modes based on prompt structure and
context, including:

- **Text to image(s) and text (interleaved):** Outputs images with related text.
  - Example prompt: "Generate an illustrated recipe for a paella."
- **Image(s) and text to image(s) and text (interleaved)** : Uses input images and text to create new related images and text.
  - Example prompt: (With an image of a furnished room) "What other color sofas would work in my space? can you update the image?"

## Generate images in batch

If you need to generate a lot of images, you can use the
[Batch API](https://ai.google.dev/gemini-api/docs/batch-api). You get higher
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) in exchange for a turnaround of up
to 24 hours.

Check the [Batch API image generation documentation](https://ai.google.dev/gemini-api/docs/batch-api#image-generation) and the [cookbook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Batch_mode.ipynb)
for Batch API image examples and code.

## Prompting guide and strategies

Mastering image generation starts with one fundamental principle:
> **Describe the scene, don't just list keywords.**
> The model's core strength is its deep language understanding. A narrative,
> descriptive paragraph will almost always produce a better, more coherent image
> than a list of disconnected words.

### Prompts for generating images

The following strategies will help you create effective prompts to
generate exactly the images you're looking for.

#### 1. Photorealistic scenes

For realistic images, use photography terms. Mention camera angles, lens types,
lighting, and fine details to guide the model toward a photorealistic result.

### Template

    A photorealistic [shot type] of [subject], [action or expression], set in
    [environment]. The scene is illuminated by [lighting description], creating
    a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
    [key textures and details]. The image should be in a [aspect ratio] format.

### Prompt

    A photorealistic close-up portrait of an elderly Japanese ceramicist with
    deep, sun-etched wrinkles and a warm, knowing smile. He is carefully
    inspecting a freshly glazed tea bowl. The setting is his rustic,
    sun-drenched workshop. The scene is illuminated by soft, golden hour light
    streaming through a window, highlighting the fine texture of the clay.
    Captured with an 85mm portrait lens, resulting in a soft, blurred background
    (bokeh). The overall mood is serene and masterful. Vertical portrait
    orientation.

### Python

    from google import genai
    from google.genai import types

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop with pottery wheels and shelves of clay pots in the background. The scene is illuminated by soft, golden hour light streaming through a window, highlighting the fine texture of the clay and the fabric of his apron. Captured with an 85mm portrait lens, resulting in a soft, blurred background (bokeh). The overall mood is serene and masterful.",
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("photorealistic_example.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop with pottery wheels and shelves of clay pots in the background. The scene is illuminated by soft, golden hour light streaming through a window, highlighting the fine texture of the clay and the fabric of his apron. Captured with an 85mm portrait lens, resulting in a soft, blurred background (bokeh). The overall mood is serene and masterful.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("photorealistic_example.png", buffer);
          console.log("Image saved as photorealistic_example.png");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            genai.Text("A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop with pottery wheels and shelves of clay pots in the background. The scene is illuminated by soft, golden hour light streaming through a window, highlighting the fine texture of the clay and the fabric of his apron. Captured with an 85mm portrait lens, resulting in a soft, blurred background (bokeh). The overall mood is serene and masterful."),
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "photorealistic_example.png"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class PhotorealisticScene {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              """
              A photorealistic close-up portrait of an elderly Japanese ceramicist
              with deep, sun-etched wrinkles and a warm, knowing smile. He is
              carefully inspecting a freshly glazed tea bowl. The setting is his
              rustic, sun-drenched workshop with pottery wheels and shelves of
              clay pots in the background. The scene is illuminated by soft,
              golden hour light streaming through a window, highlighting the
              fine texture of the clay and the fabric of his apron. Captured
              with an 85mm portrait lens, resulting in a soft, blurred
              background (bokeh). The overall mood is serene and masterful.
              """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("photorealistic_example.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop with pottery wheels and shelves of clay pots in the background. The scene is illuminated by soft, golden hour light streaming through a window, highlighting the fine texture of the clay and the fabric of his apron. Captured with an 85mm portrait lens, resulting in a soft, blurred background (bokeh). The overall mood is serene and masterful."}
          ]
        }]
      }'

![A photorealistic close-up portrait of an elderly Japanese ceramicist...](https://ai.google.dev/static/gemini-api/docs/images/photorealistic_example.png) A photorealistic close-up portrait of an elderly Japanese ceramicist...

#### 2. Stylized illustrations \& stickers

To create stickers, icons, or assets, be explicit about the style and request a
white background.

> [!NOTE]
> **Note:** The model does not support generating a transparent background.

### Template

    A [style] sticker of a [subject], featuring [key characteristics] and a
    [color palette]. The design should have [line style] and [shading style].
    The background must be white.

### Prompt

    A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's
    munching on a green bamboo leaf. The design features bold, clean outlines,
    simple cel-shading, and a vibrant color palette. The background must be white.

### Python

    from google import genai
    from google.genai import types

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's munching on a green bamboo leaf. The design features bold, clean outlines, simple cel-shading, and a vibrant color palette. The background must be white.",
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("red_panda_sticker.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's munching on a green bamboo leaf. The design features bold, clean outlines, simple cel-shading, and a vibrant color palette. The background must be white.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("red_panda_sticker.png", buffer);
          console.log("Image saved as red_panda_sticker.png");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            genai.Text("A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's munching on a green bamboo leaf. The design features bold, clean outlines, simple cel-shading, and a vibrant color palette. The background must be white."),
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "red_panda_sticker.png"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class StylizedIllustration {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              """
              A kawaii-style sticker of a happy red panda wearing a tiny bamboo
              hat. It's munching on a green bamboo leaf. The design features
              bold, clean outlines, simple cel-shading, and a vibrant color
              palette. The background must be white.
              """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("red_panda_sticker.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It is munching on a green bamboo leaf. The design features bold, clean outlines, simple cel-shading, and a vibrant color palette. The background must be white."}
          ]
        }]
      }'

![A kawaii-style sticker of a happy red...](https://ai.google.dev/static/gemini-api/docs/images/red_panda_sticker.png) A kawaii-style sticker of a happy red panda...

#### 3. Accurate text in images

Gemini excels at rendering text. Be clear about the text, the font style
(descriptively), and the overall design. Use Gemini 3 Pro Image Preview for
professional asset production.

### Template

    Create a [image type] for [brand/concept] with the text "[text to render]"
    in a [font style]. The design should be [style description], with a
    [color scheme].

### Prompt

    Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way.

### Python

    from google import genai
    from google.genai import types    

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way.",
        config=types.GenerateContentConfig(
            image_config=types.ImageConfig(
                aspect_ratio="1:1",
            )
        )
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("logo_example.jpg")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("logo_example.jpg", buffer);
          console.log("Image saved as logo_example.jpg");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            genai.Text("Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way."),
            &genai.GenerateContentConfig{
                ImageConfig: &genai.ImageConfig{
                  AspectRatio: "1:1",
                },
            },
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "logo_example.jpg"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;
    import com.google.genai.types.ImageConfig;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class AccurateTextInImages {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("1:1")
                  .build())
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              """
              Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way.
              """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("logo_example.jpg"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a modern, minimalist logo for a coffee shop called The Daily Grind. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way."}
          ]
        }],
        "generationConfig": {
          "imageConfig": {
            "aspectRatio": "1:1"
          }
        }
      }'

![Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'...](https://ai.google.dev/static/gemini-api/docs/images/logo_example.jpg) Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'...

#### 4. Product mockups \& commercial photography

Perfect for creating clean, professional product shots for ecommerce,
advertising, or branding.

### Template

    A high-resolution, studio-lit product photograph of a [product description]
    on a [background surface/description]. The lighting is a [lighting setup,
    e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
    a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
    focus on [key detail]. [Aspect ratio].

### Prompt

    A high-resolution, studio-lit product photograph of a minimalist ceramic
    coffee mug in matte black, presented on a polished concrete surface. The
    lighting is a three-point softbox setup designed to create soft, diffused
    highlights and eliminate harsh shadows. The camera angle is a slightly
    elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with
    sharp focus on the steam rising from the coffee. Square image.

### Python

    from google import genai
    from google.genai import types

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug in matte black, presented on a polished concrete surface. The lighting is a three-point softbox setup designed to create soft, diffused highlights and eliminate harsh shadows. The camera angle is a slightly elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with sharp focus on the steam rising from the coffee. Square image.",
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("product_mockup.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug in matte black, presented on a polished concrete surface. The lighting is a three-point softbox setup designed to create soft, diffused highlights and eliminate harsh shadows. The camera angle is a slightly elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with sharp focus on the steam rising from the coffee. Square image.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("product_mockup.png", buffer);
          console.log("Image saved as product_mockup.png");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            genai.Text("A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug in matte black, presented on a polished concrete surface. The lighting is a three-point softbox setup designed to create soft, diffused highlights and eliminate harsh shadows. The camera angle is a slightly elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with sharp focus on the steam rising from the coffee. Square image."),
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "product_mockup.png"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class ProductMockup {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              """
              A high-resolution, studio-lit product photograph of a minimalist
              ceramic coffee mug in matte black, presented on a polished
              concrete surface. The lighting is a three-point softbox setup
              designed to create soft, diffused highlights and eliminate harsh
              shadows. The camera angle is a slightly elevated 45-degree shot
              to showcase its clean lines. Ultra-realistic, with sharp focus
              on the steam rising from the coffee. Square image.
              """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("product_mockup.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug in matte black, presented on a polished concrete surface. The lighting is a three-point softbox setup designed to create soft, diffused highlights and eliminate harsh shadows. The camera angle is a slightly elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with sharp focus on the steam rising from the coffee. Square image."}
          ]
        }]
      }'

![A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug...](https://ai.google.dev/static/gemini-api/docs/images/product_mockup.png) A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug...

#### 5. Minimalist \& negative space design

Excellent for creating backgrounds for websites, presentations, or marketing
materials where text will be overlaid.

### Template

    A minimalist composition featuring a single [subject] positioned in the
    [bottom-right/top-left/etc.] of the frame. The background is a vast, empty
    [color] canvas, creating significant negative space. Soft, subtle lighting.
    [Aspect ratio].

### Prompt

    A minimalist composition featuring a single, delicate red maple leaf
    positioned in the bottom-right of the frame. The background is a vast, empty
    off-white canvas, creating significant negative space for text. Soft,
    diffused lighting from the top left. Square image.

### Python

    from google import genai
    from google.genai import types    

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents="A minimalist composition featuring a single, delicate red maple leaf positioned in the bottom-right of the frame. The background is a vast, empty off-white canvas, creating significant negative space for text. Soft, diffused lighting from the top left. Square image.",
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("minimalist_design.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt =
        "A minimalist composition featuring a single, delicate red maple leaf positioned in the bottom-right of the frame. The background is a vast, empty off-white canvas, creating significant negative space for text. Soft, diffused lighting from the top left. Square image.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("minimalist_design.png", buffer);
          console.log("Image saved as minimalist_design.png");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            genai.Text("A minimalist composition featuring a single, delicate red maple leaf positioned in the bottom-right of the frame. The background is a vast, empty off-white canvas, creating significant negative space for text. Soft, diffused lighting from the top left. Square image."),
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "minimalist_design.png"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class MinimalistDesign {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              """
              A minimalist composition featuring a single, delicate red maple
              leaf positioned in the bottom-right of the frame. The background
              is a vast, empty off-white canvas, creating significant negative
              space for text. Soft, diffused lighting from the top left.
              Square image.
              """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("minimalist_design.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "A minimalist composition featuring a single, delicate red maple leaf positioned in the bottom-right of the frame. The background is a vast, empty off-white canvas, creating significant negative space for text. Soft, diffused lighting from the top left. Square image."}
          ]
        }]
      }'

![A minimalist composition featuring a single, delicate red maple leaf...](https://ai.google.dev/static/gemini-api/docs/images/minimalist_design.png) A minimalist composition featuring a single, delicate red maple leaf...

#### 6. Sequential art (Comic panel / Storyboard)

Builds on character consistency and scene description to create panels for
visual storytelling. For accuracy with text and storytelling ability, these
prompts work best with Gemini 3 Pro and Gemini 3.1 Flash Image Preview.

### Template

    Make a 3 panel comic in a [style]. Put the character in a [type of scene].

### Prompt

    Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene.

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    image_input = Image.open('/path/to/your/man_in_white_glasses.jpg')
    text_input = "Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene."

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[text_input, image_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("comic_panel.jpg")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/man_in_white_glasses.jpg";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        {text: "Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene."},
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("comic_panel.jpg", buffer);
          console.log("Image saved as comic_panel.jpg");
        }
      }
    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"
        "google.golang.org/genai"
    )

    func main() {

        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }

        imagePath := "/path/to/your/man_in_white_glasses.jpg"
        imgData, _ := os.ReadFile(imagePath)

        parts := []*genai.Part{
          genai.NewPartFromText("Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene."),
          &genai.Part{
            InlineData: &genai.Blob{
              MIMEType: "image/jpeg",
              Data:     imgData,
            },
          },
        }

        contents := []*genai.Content{
          genai.NewContentFromParts(parts, genai.RoleUser),
        }

        result, _ := client.Models.GenerateContent(
            ctx,
            "gemini-3.1-flash-image-preview",
            contents,
        )

        for _, part := range result.Candidates[0].Content.Parts {
            if part.Text != "" {
                fmt.Println(part.Text)
            } else if part.InlineData != nil {
                imageBytes := part.InlineData.Data
                outputFilename := "comic_panel.jpg"
                _ = os.WriteFile(outputFilename, imageBytes, 0644)
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class ComicPanel {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromText("""
                      Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene.
                      """),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/man_in_white_glasses.jpg")),
                      "image/jpeg")),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("comic_panel.jpg"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene."},
            {"inline_data": {"mime_type": "image/jpeg", "data": "<BASE64_IMAGE_DATA>"}}
          ]
        }]
      }'

|---|---|
| Input | Output |
| ![Man in white glasses](https://ai.google.dev/static/gemini-api/docs/images/man_in_white_glasses.jpg) Input image | ![Make a 3 panel comic in a gritty, noir art style...](https://ai.google.dev/static/gemini-api/docs/images/comic_panel.jpg) Make a 3 panel comic in a gritty, noir art style... |

#### 7. Grounding with Google Search

Use Google Search to generate images based on recent or real-time information.
This is useful for news, weather, and other time-sensitive topics.

### Prompt

    Make a simple but stylish graphic of last night's Arsenal game in the Champion's League

### Python

    from google import genai
    from google.genai import types
    prompt = "Make a simple but stylish graphic of last night's Arsenal game in the Champion's League"
    aspect_ratio = "16:9" # "1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"

    client = genai.Client()

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=['Text', 'Image'],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
            ),
            tools=[{"google_search": {}}]
        )
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif image:= part.as_image():
            image.save("football-score.jpg")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const prompt = "Make a simple but stylish graphic of last night's Arsenal game in the Champion's League";

      const aspectRatio = '16:9';
      const resolution = '2K';

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution,
          },
          tools: [{"google_search": {}}],
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("football-score.jpg", buffer);
          console.log("Image saved as football-score.jpg");
        }
      }

    }

    main();

### Go

    package main

    import (
        "context"
        "fmt"
        "log"
        "os"

        "google.golang.org/genai"
        pb "google.golang.org/genai/schema"
    )

    func main() {
        ctx := context.Background()
        client, err := genai.NewClient(ctx, nil)
        if err != nil {
            log.Fatal(err)
        }
        defer client.Close()

        model := client.GenerativeModel("gemini-3.1-flash-image-preview")
        model.Tools = []*pb.Tool{
            pb.NewGoogleSearchTool(),
        }
        model.GenerationConfig = &pb.GenerationConfig{
            ResponseModalities: []pb.ResponseModality{genai.Text, genai.Image},
            ImageConfig: &pb.ImageConfig{
                AspectRatio: "16:9",
            },
        }

        prompt := "Make a simple but stylish graphic of last night's Arsenal game in the Champion's League"
        resp, err := model.GenerateContent(ctx, genai.Text(prompt))
        if err != nil {
            log.Fatal(err)
        }

        for _, part := range resp.Candidates[0].Content.Parts {
            if txt, ok := part.(genai.Text); ok {
                fmt.Printf("%s", string(txt))
            } else if img, ok := part.(genai.ImageData); ok {
                err := os.WriteFile("football-score.jpg", img.Data, 0644)
                if err != nil {
                    log.Fatal(err)
                }
            }
        }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.GoogleSearch;
    import com.google.genai.types.ImageConfig;
    import com.google.genai.types.Part;
    import com.google.genai.types.Tool;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Paths;

    public class SearchGrounding {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .imageConfig(ImageConfig.builder()
                  .aspectRatio("16:9")
                  .build())
              .tools(Tool.builder()
                  .googleSearch(GoogleSearch.builder().build())
                  .build())
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview", """
                  Make a simple but stylish graphic of last night's Arsenal game in the Champion's League
                  """,
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("football-score.jpg"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{"parts": [{"text": "Make a simple but stylish graphic of last nights Arsenal game in the Champions League"}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
          "responseModalities": ["TEXT", "IMAGE"],
          "imageConfig": {"aspectRatio": "16:9"}
        }
      }'

![AI-generated graphic of an Arsenal football score](https://ai.google.dev/static/gemini-api/docs/images/football-score.jpg) AI-generated graphic of an Arsenal football score

### Prompts for editing images

These examples show how to provide images alongside your text prompts for
editing, composition, and style transfer.

#### 1. Adding and removing elements

Provide an image and describe your change. The model will match the original
image's style, lighting, and perspective.

### Template

    Using the provided image of [subject], please [add/remove/modify] [element]
    to/from the scene. Ensure the change is [description of how the change should
    integrate].

### Prompt

    "Using the provided image of my cat, please add a small, knitted wizard hat
    on its head. Make it look like it's sitting comfortably and matches the soft
    lighting of the photo."

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    # Base image prompt: "A photorealistic picture of a fluffy ginger cat sitting on a wooden floor, looking directly at the camera. Soft, natural light from a window."
    image_input = Image.open('/path/to/your/cat_photo.png')
    text_input = """Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off."""

    # Generate an image from a text prompt
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[text_input, image_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("cat_with_hat.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/cat_photo.png";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        { text: "Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off." },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("cat_with_hat.png", buffer);
          console.log("Image saved as cat_with_hat.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imagePath := "/path/to/your/cat_photo.png"
      imgData, _ := os.ReadFile(imagePath)

      parts := []*genai.Part{
        genai.NewPartFromText("Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off."),
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData,
          },
        },
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "cat_with_hat.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class AddRemoveElements {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromText("""
                      Using the provided image of my cat, please add a small,
                      knitted wizard hat on its head. Make it look like it's
                      sitting comfortably and not falling off.
                      """),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/cat_photo.png")),
                      "image/png")),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("cat_with_hat.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {\"text\": \"Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off.\"},
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                }
            ]
          }]
        }"

|---|---|
| Input | Output |
| :cat: A photorealistic picture of a fluffy ginger cat... | ![Using the provided image of my cat, please add a small, knitted wizard hat...](https://ai.google.dev/static/gemini-api/docs/images/cat_with_hat.png) Using the provided image of my cat, please add a small, knitted wizard hat... |

#### 2. Inpainting (Semantic masking)

Conversationally define a "mask" to edit a specific part of an image while
leaving the rest untouched.

### Template

    Using the provided image, change only the [specific element] to [new
    element/description]. Keep everything else in the image exactly the same,
    preserving the original style, lighting, and composition.

### Prompt

    "Using the provided image of a living room, change only the blue sofa to be
    a vintage, brown leather chesterfield sofa. Keep the rest of the room,
    including the pillows on the sofa and the lighting, unchanged."

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    # Base image prompt: "A wide shot of a modern, well-lit living room with a prominent blue sofa in the center. A coffee table is in front of it and a large window is in the background."
    living_room_image = Image.open('/path/to/your/living_room.png')
    text_input = """Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows on the sofa and the lighting, unchanged."""

    # Generate an image from a text prompt
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[living_room_image, text_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("living_room_edited.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/living_room.png";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
        { text: "Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows on the sofa and the lighting, unchanged." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("living_room_edited.png", buffer);
          console.log("Image saved as living_room_edited.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imagePath := "/path/to/your/living_room.png"
      imgData, _ := os.ReadFile(imagePath)

      parts := []*genai.Part{
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData,
          },
        },
        genai.NewPartFromText("Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows on the sofa and the lighting, unchanged."),
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "living_room_edited.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class Inpainting {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/living_room.png")),
                      "image/png"),
                  Part.fromText("""
                      Using the provided image of a living room, change
                      only the blue sofa to be a vintage, brown leather
                      chesterfield sofa. Keep the rest of the room,
                      including the pillows on the sofa and the lighting,
                      unchanged.
                      """)),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("living_room_edited.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                },
                {\"text\": \"Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows on the sofa and the lighting, unchanged.\"}
            ]
          }]
        }"

|---|---|
| Input | Output |
| ![A wide shot of a modern, well-lit living room...](https://ai.google.dev/static/gemini-api/docs/images/living_room.png) A wide shot of a modern, well-lit living room... | ![Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa...](https://ai.google.dev/static/gemini-api/docs/images/living_room_edited.png) Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa... |

#### 3. Style transfer

Provide an image and ask the model to recreate its content in a different
artistic style.

### Template

    Transform the provided photograph of [subject] into the artistic style of [artist/art style]. Preserve the original composition but render it with [description of stylistic elements].

### Prompt

    "Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows."

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    # Base image prompt: "A photorealistic, high-resolution photograph of a busy city street in New York at night, with bright neon signs, yellow taxis, and tall skyscrapers."
    city_image = Image.open('/path/to/your/city.png')
    text_input = """Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows."""

    # Generate an image from a text prompt
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[city_image, text_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("city_style_transfer.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/city.png";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
        { text: "Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("city_style_transfer.png", buffer);
          console.log("Image saved as city_style_transfer.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imagePath := "/path/to/your/city.png"
      imgData, _ := os.ReadFile(imagePath)

      parts := []*genai.Part{
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData,
          },
        },
        genai.NewPartFromText("Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows."),
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "city_style_transfer.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class StyleTransfer {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/city.png")),
                      "image/png"),
                  Part.fromText("""
                      Transform the provided photograph of a modern city
                      street at night into the artistic style of
                      Vincent van Gogh's 'Starry Night'. Preserve the
                      original composition of buildings and cars, but
                      render all elements with swirling, impasto
                      brushstrokes and a dramatic palette of deep blues
                      and bright yellows.
                      """)),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("city_style_transfer.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                },
                {\"text\": \"Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows.\"}
            ]
          }]
        }"

|---|---|
| Input | Output |
| ![A photorealistic, high-resolution photograph of a busy city street...](https://ai.google.dev/static/gemini-api/docs/images/city.png) A photorealistic, high-resolution photograph of a busy city street... | ![Transform the provided photograph of a modern city street at night...](https://ai.google.dev/static/gemini-api/docs/images/city_style_transfer.png) Transform the provided photograph of a modern city street at night... |

#### 4. Advanced composition: Combining multiple images

Provide multiple images as context to create a new, composite scene. This is
perfect for product mockups or creative collages.

### Template

    Create a new image by combining the elements from the provided images. Take
    the [element from image 1] and place it with/on the [element from image 2].
    The final image should be a [description of the final scene].

### Prompt

    "Create a professional e-commerce fashion photo. Take the blue floral dress
    from the first image and let the woman from the second image wear it.
    Generate a realistic, full-body shot of the woman wearing the dress, with
    the lighting and shadows adjusted to match the outdoor environment."

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    # Base image prompts:
    # 1. Dress: "A professionally shot photo of a blue floral summer dress on a plain white background, ghost mannequin style."
    # 2. Model: "Full-body shot of a woman with her hair in a bun, smiling, standing against a neutral grey studio background."
    dress_image = Image.open('/path/to/your/dress.png')
    model_image = Image.open('/path/to/your/model.png')

    text_input = """Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot of the woman wearing the dress, with the lighting and shadows adjusted to match the outdoor environment."""

    # Generate an image from a text prompt
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[dress_image, model_image, text_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("fashion_ecommerce_shot.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath1 = "/path/to/your/dress.png";
      const imageData1 = fs.readFileSync(imagePath1);
      const base64Image1 = imageData1.toString("base64");
      const imagePath2 = "/path/to/your/model.png";
      const imageData2 = fs.readFileSync(imagePath2);
      const base64Image2 = imageData2.toString("base64");

      const prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image1,
          },
        },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image2,
          },
        },
        { text: "Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot of the woman wearing the dress, with the lighting and shadows adjusted to match the outdoor environment." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("fashion_ecommerce_shot.png", buffer);
          console.log("Image saved as fashion_ecommerce_shot.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imgData1, _ := os.ReadFile("/path/to/your/dress.png")
      imgData2, _ := os.ReadFile("/path/to/your/model.png")

      parts := []*genai.Part{
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData1,
          },
        },
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData2,
          },
        },
        genai.NewPartFromText("Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot of the woman wearing the dress, with the lighting and shadows adjusted to match the outdoor environment."),
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "fashion_ecommerce_shot.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class AdvancedComposition {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/dress.png")),
                      "image/png"),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/model.png")),
                      "image/png"),
                  Part.fromText("""
                      Create a professional e-commerce fashion photo.
                      Take the blue floral dress from the first image and
                      let the woman from the second image wear it. Generate
                      a realistic, full-body shot of the woman wearing the
                      dress, with the lighting and shadows adjusted to
                      match the outdoor environment.
                      """)),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("fashion_ecommerce_shot.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA_1>\"
                  }
                },
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA_2>\"
                  }
                },
                {\"text\": \"Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot of the woman wearing the dress, with the lighting and shadows adjusted to match the outdoor environment.\"}
            ]
          }]
        }"

|---|---|---|
| Input 1 | Input 2 | Output |
| :dress: A professionally shot photo of a blue floral summer dress... | ![Full-body shot of a woman with her hair in a bun...](https://ai.google.dev/static/gemini-api/docs/images/model.png) Full-body shot of a woman with her hair in a bun... | ![Create a professional e-commerce fashion photo...](https://ai.google.dev/static/gemini-api/docs/images/fashion_ecommerce_shot.png) Create a professional e-commerce fashion photo... |

#### 5. High-fidelity detail preservation

To ensure critical details (like a face or logo) are preserved during an edit,
describe them in great detail along with your edit request.

### Template

    Using the provided images, place [element from image 2] onto [element from
    image 1]. Ensure that the features of [element from image 1] remain
    completely unchanged. The added element should [description of how the
    element should integrate].

### Prompt

    "Take the first image of the woman with brown hair, blue eyes, and a neutral
    expression. Add the logo from the second image onto her black t-shirt.
    Ensure the woman's face and features remain completely unchanged. The logo
    should look like it's naturally printed on the fabric, following the folds
    of the shirt."

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    # Base image prompts:
    # 1. Woman: "A professional headshot of a woman with brown hair and blue eyes, wearing a plain black t-shirt, against a neutral studio background."
    # 2. Logo: "A simple, modern logo with the letters 'G' and 'A' in a white circle."
    woman_image = Image.open('/path/to/your/woman.png')
    logo_image = Image.open('/path/to/your/logo.png')
    text_input = """Take the first image of the woman with brown hair, blue eyes, and a neutral expression. Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look like it's naturally printed on the fabric, following the folds of the shirt."""

    # Generate an image from a text prompt
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[woman_image, logo_image, text_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("woman_with_logo.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath1 = "/path/to/your/woman.png";
      const imageData1 = fs.readFileSync(imagePath1);
      const base64Image1 = imageData1.toString("base64");
      const imagePath2 = "/path/to/your/logo.png";
      const imageData2 = fs.readFileSync(imagePath2);
      const base64Image2 = imageData2.toString("base64");

      const prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image1,
          },
        },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image2,
          },
        },
        { text: "Take the first image of the woman with brown hair, blue eyes, and a neutral expression. Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look like it's naturally printed on the fabric, following the folds of the shirt." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("woman_with_logo.png", buffer);
          console.log("Image saved as woman_with_logo.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imgData1, _ := os.ReadFile("/path/to/your/woman.png")
      imgData2, _ := os.ReadFile("/path/to/your/logo.png")

      parts := []*genai.Part{
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData1,
          },
        },
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData2,
          },
        },
        genai.NewPartFromText("Take the first image of the woman with brown hair, blue eyes, and a neutral expression. Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look like it's naturally printed on the fabric, following the folds of the shirt."),
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "woman_with_logo.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class HighFidelity {
      public static void main(String[] args) throws IOException {

        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/woman.png")),
                      "image/png"),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/logo.png")),
                      "image/png"),
                  Part.fromText("""
                      Take the first image of the woman with brown hair,
                      blue eyes, and a neutral expression. Add the logo
                      from the second image onto her black t-shirt.
                      Ensure the woman's face and features remain
                      completely unchanged. The logo should look like
                      it's naturally printed on the fabric, following
                      the folds of the shirt.
                      """)),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("woman_with_logo.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA_1>\"
                  }
                },
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA_2>\"
                  }
                },
                {\"text\": \"Take the first image of the woman with brown hair, blue eyes, and a neutral expression. Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look like it's naturally printed on the fabric, following the folds of the shirt.\"}
            ]
          }]
        }"

|---|---|---|
| Input 1 | Input 2 | Output |
| :woman: A professional headshot of a woman with brown hair and blue eyes... | ![A simple, modern logo with the letters 'G' and 'A'...](https://ai.google.dev/static/gemini-api/docs/images/logo.png) A simple, modern logo with the letters 'G' and 'A'... | ![Take the first image of the woman with brown hair, blue eyes, and a neutral expression...](https://ai.google.dev/static/gemini-api/docs/images/woman_with_logo.png) Take the first image of the woman with brown hair, blue eyes, and a neutral expression... |

#### 6. Bring something to life

Upload a rough sketch or drawing and ask the model to refine it into a finished image.

### Template

    Turn this rough [medium] sketch of a [subject] into a [style description]
    photo. Keep the [specific features] from the sketch but add [new details/materials].

### Prompt

    "Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting."

### Python

    from google import genai
    from PIL import Image

    client = genai.Client()

    # Base image prompt: "A rough pencil sketch of a flat sports car on white paper."
    sketch_image = Image.open('/path/to/your/car_sketch.png')
    text_input = """Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting."""

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[sketch_image, text_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("car_photo.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/car_sketch.png";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
        { text: "Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("car_photo.png", buffer);
          console.log("Image saved as car_photo.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imgData, _ := os.ReadFile("/path/to/your/car_sketch.png")

      parts := []*genai.Part{
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/png",
            Data:     imgData,
          },
        },
        genai.NewPartFromText("Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting."),
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "car_photo.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class BringToLife {
      public static void main(String[] args) throws IOException {
        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/car_sketch.png")),
                      "image/png"),
                  Part.fromText("""
                      Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting.
                      """)),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("car_photo.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/png\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                },
                {\"text\": \"Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting.\"}
            ]
          }]
        }"

|---|---|
| Input | Output |
| ![Sketch of a car](https://ai.google.dev/static/gemini-api/docs/images/car-sketch.jpg) Rough sketch of a car | ![Output showing the final concept car](https://ai.google.dev/static/gemini-api/docs/images/car-photo.jpg) Polished photo of a car |

#### 7. Character consistency: 360 view

You can generate 360-degree views of a character by iteratively prompting for
different angles. For best results, include previously generated images in
subsequent prompts to maintain consistency. For complex poses, include a
reference image of the desired pose.

### Template

    A studio portrait of [person] against [background], [looking forward/in profile looking right/etc.]

### Prompt

    A studio portrait of this man against white, in profile looking right

### Python

    from google import genai
    from google.genai import types
    from PIL import Image

    client = genai.Client()

    image_input = Image.open('/path/to/your/man_in_white_glasses.jpg')
    text_input = """A studio portrait of this man against white, in profile looking right"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[text_input, image_input],
    )

    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            image.save("man_right_profile.png")

### JavaScript

    import { GoogleGenAI } from "@google/genai";
    import * as fs from "node:fs";

    async function main() {

      const ai = new GoogleGenAI({});

      const imagePath = "/path/to/your/man_in_white_glasses.jpg";
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString("base64");

      const prompt = [
        { text: "A studio portrait of this man against white, in profile looking right" },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync("man_right_profile.png", buffer);
          console.log("Image saved as man_right_profile.png");
        }
      }
    }

    main();

### Go

    package main

    import (
      "context"
      "fmt"
      "log"
      "os"
      "google.golang.org/genai"
    )

    func main() {

      ctx := context.Background()
      client, err := genai.NewClient(ctx, nil)
      if err != nil {
          log.Fatal(err)
      }

      imagePath := "/path/to/your/man_in_white_glasses.jpg"
      imgData, _ := os.ReadFile(imagePath)

      parts := []*genai.Part{
        genai.NewPartFromText("A studio portrait of this man against white, in profile looking right"),
        &genai.Part{
          InlineData: &genai.Blob{
            MIMEType: "image/jpeg",
            Data:     imgData,
          },
        },
      }

      contents := []*genai.Content{
        genai.NewContentFromParts(parts, genai.RoleUser),
      }

      result, _ := client.Models.GenerateContent(
          ctx,
          "gemini-3.1-flash-image-preview",
          contents,
      )

      for _, part := range result.Candidates[0].Content.Parts {
          if part.Text != "" {
              fmt.Println(part.Text)
          } else if part.InlineData != nil {
              imageBytes := part.InlineData.Data
              outputFilename := "man_right_profile.png"
              _ = os.WriteFile(outputFilename, imageBytes, 0644)
          }
      }
    }

### Java

    import com.google.genai.Client;
    import com.google.genai.types.Content;
    import com.google.genai.types.GenerateContentConfig;
    import com.google.genai.types.GenerateContentResponse;
    import com.google.genai.types.Part;

    import java.io.IOException;
    import java.nio.file.Files;
    import java.nio.file.Path;
    import java.nio.file.Paths;

    public class CharacterConsistency {
      public static void main(String[] args) throws IOException {
        try (Client client = new Client()) {
          GenerateContentConfig config = GenerateContentConfig.builder()
              .responseModalities("TEXT", "IMAGE")
              .build();

          GenerateContentResponse response = client.models.generateContent(
              "gemini-3.1-flash-image-preview",
              Content.fromParts(
                  Part.fromText("""
                      A studio portrait of this man against white, in profile looking right
                      """),
                  Part.fromBytes(
                      Files.readAllBytes(
                          Path.of("/path/to/your/man_in_white_glasses.jpg")),
                      "image/jpeg")),
              config);

          for (Part part : response.parts()) {
            if (part.text().isPresent()) {
              System.out.println(part.text().get());
            } else if (part.inlineData().isPresent()) {
              var blob = part.inlineData().get();
              if (blob.data().isPresent()) {
                Files.write(Paths.get("man_right_profile.png"), blob.data().get());
              }
            }
          }
        }
      }
    }

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "{
          \"contents\": [{
            \"parts\":[
                {\"text\": \"A studio portrait of this man against white, in profile looking right\"},
                {
                  \"inline_data\": {
                    \"mime_type\":\"image/jpeg\",
                    \"data\": \"<BASE64_IMAGE_DATA>\"
                  }
                }
            ]
          }]
        }"

|---|---|---|
| Input | Output 1 | Output 2 |
| ![Original input of a man in white glasses](https://ai.google.dev/static/gemini-api/docs/images/man_in_white_glasses.jpg) Original image | ![Output of a man in white glasses looking right](https://ai.google.dev/static/gemini-api/docs/images/man_in_white_glasses_looking_right.jpg) Man in white glasses looking right | ![Output of a man in white glasses looking forward](https://ai.google.dev/static/gemini-api/docs/images/man_in_white_glasses_looking_forward.jpg) Man in white glasses looking forward |

### Best Practices

To elevate your results from good to great, incorporate these professional
strategies into your workflow.

- **Be Hyper-Specific:** The more detail you provide, the more control you have. Instead of "fantasy armor," describe it: "ornate elven plate armor, etched with silver leaf patterns, with a high collar and pauldrons shaped like falcon wings."
- **Provide Context and Intent:** Explain the *purpose* of the image. The model's understanding of context will influence the final output. For example, "Create a logo for a high-end, minimalist skincare brand" will yield better results than just "Create a logo."
- **Iterate and Refine:** Don't expect a perfect image on the first try. Use the conversational nature of the model to make small changes. Follow up with prompts like, "That's great, but can you make the lighting a bit warmer?" or "Keep everything the same, but change the character's expression to be more serious."
- **Use Step-by-Step Instructions:** For complex scenes with many elements, break your prompt into steps. "First, create a background of a serene, misty forest at dawn. Then, in the foreground, add a moss-covered ancient stone altar. Finally, place a single, glowing sword on top of the altar."
- **Use "Semantic Negative Prompts":** Instead of saying "no cars," describe the desired scene positively: "an empty, deserted street with no signs of traffic."
- **Control the Camera:** Use photographic and cinematic language to control the composition. Terms like `wide-angle shot`, `macro shot`, `low-angle
  perspective`.

## Limitations

- For best performance, use the following languages: EN, ar-EG, de-DE, es-MX, fr-FR, hi-IN, id-ID, it-IT, ja-JP, ko-KR, pt-BR, ru-RU, ua-UA, vi-VN, zh-CN.
- Image generation does not support audio or video inputs.
- The model won't always follow the exact number of image outputs that the user explicitly asks for.
- `gemini-2.5-flash-image` works best with up to 3 images as input, while `gemini-3-pro-image-preview` supports 5 images with high fidelity, and up to 14 images in total. `gemini-3.1-flash-image-preview` supports character resemblance of up to 4 characters and the fidelity of up to 10 objects in a single workflow.
- When generating text for an image, Gemini works best if you first generate the text and then ask for an image with the text.
- `gemini-3.1-flash-image-preview` Grounding with Google Search does not support using real-world images of people from web search at this time.
- All generated images include a [SynthID watermark](https://ai.google.dev/responsible/docs/safeguards/synthid).

## Optional configurations

You can optionally configure the response modalities and aspect ratio of the
model's output in the `config` field of `generate_content` calls.

### Output types

The model defaults to returning text and image responses
(i.e. `response_modalities=['Text', 'Image']`).
You can configure the response to return only images without text using
`response_modalities=['Image']`.

### Python

    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=['Image']
        )
    )

### JavaScript

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
        config: {
            responseModalities: ['Image']
        }
      });

### Go

    result, _ := client.Models.GenerateContent(
        ctx,
        "gemini-3.1-flash-image-preview",
        genai.Text("Create a picture of a nano banana dish in a " +
                    " fancy restaurant with a Gemini theme"),
        &genai.GenerateContentConfig{
            ResponseModalities: "Image",
        },
      )

### Java

    response = client.models.generateContent(
        "gemini-3.1-flash-image-preview",
        prompt,
        GenerateContentConfig.builder()
            .responseModalities("IMAGE")
            .build());

### REST

    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
          ]
        }],
        "generationConfig": {
          "responseModalities": ["Image"]
        }
      }'

### Aspect ratios and image size

The model defaults to matching the output image size to that of your input
image, or otherwise generates 1:1 squares.
You can control the aspect ratio of the output image using the `aspect_ratio`
field under `image_config` in the response request, shown here:

### Python

    # For gemini-2.5-flash-image
    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[prompt],
        config=types.GenerateContentConfig(
            image_config=types.ImageConfig(
                aspect_ratio="16:9",
            )
        )
    )

    # For gemini-3.1-flash-image-preview and gemini-3-pro-image-preview
    response = client.models.generate_content(
        model="gemini-3.1-flash-image-preview",
        contents=[prompt],
        config=types.GenerateContentConfig(
            image_config=types.ImageConfig(
                aspect_ratio="16:9",
                image_size="2K",
            )
        )
    )

### JavaScript

    // For gemini-2.5-flash-image
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        }
      });

    // For gemini-3.1-flash-image-preview and gemini-3-pro-image-preview
    const response_gemini3 = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "2K",
          },
        }
      });

### Go

    // For gemini-2.5-flash-image
    result, _ := client.Models.GenerateContent(
        ctx,
        "gemini-2.5-flash-image",
        genai.Text("Create a picture of a nano banana dish in a " +
                    " fancy restaurant with a Gemini theme"),
        &genai.GenerateContentConfig{
            ImageConfig: &genai.ImageConfig{
              AspectRatio: "16:9",
            },
        }
      )

    // For gemini-3.1-flash-image-preview and gemini-3-pro-image-preview
    result_gemini3, _ := client.Models.GenerateContent(
        ctx,
        "gemini-3.1-flash-image-preview",
        genai.Text("Create a picture of a nano banana dish in a " +
                    " fancy restaurant with a Gemini theme"),
        &genai.GenerateContentConfig{
            ImageConfig: &genai.ImageConfig{
              AspectRatio: "16:9",
              ImageSize: "2K",
            },
        }
      )

### Java

    // For gemini-2.5-flash-image
    response = client.models.generateContent(
        "gemini-2.5-flash-image",
        prompt,
        GenerateContentConfig.builder()
            .imageConfig(ImageConfig.builder()
                .aspectRatio("16:9")
                .build())
            .build());

    // For gemini-3.1-flash-image-preview and gemini-3-pro-image-preview
    response_gemini3 = client.models.generateContent(
        "gemini-3.1-flash-image-preview",
        prompt,
        GenerateContentConfig.builder()
            .imageConfig(ImageConfig.builder()
                .aspectRatio("16:9")
                .imageSize("2K")
                .build())
            .build());

### REST

    # For gemini-2.5-flash-image
    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
          ]
        }],
        "generationConfig": {
          "imageConfig": {
            "aspectRatio": "16:9"
          }
        }
      }'

    # For gemini-3-pro-image-preview
    curl -s -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" \
      -H 'Content-Type: application/json' \
      -d '{
        "contents": [{
          "parts": [
            {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
          ]
        }],
        "generationConfig": {
          "imageConfig": {
            "aspectRatio": "16:9",
            "imageSize": "2K"
          }
        }
      }'

The different ratios available and the size of the image generated are listed in
the following tables:

### 3.1 Flash Image Preview

| Aspect ratio | 512 resolution | 0.5K tokens | 1K resolution | 1K tokens | 2K resolution | 2K tokens | 4K resolution | 4K tokens |
|---|---|---|---|---|---|---|---|---|
| **1:1** | 512x512 | 747 | 1024x1024 | 1120 | 2048x2048 | 1680 | 4096x4096 | 2520 |
| **1:4** | 256x1024 | 747 | 512x2048 | 1120 | 1024x4096 | 1680 | 2048x8192 | 2520 |
| **1:8** | 192x1536 | 747 | 384x3072 | 1120 | 768x6144 | 1680 | 1536x12288 | 2520 |
| **2:3** | 424x632 | 747 | 848x1264 | 1120 | 1696x2528 | 1680 | 3392x5056 | 2520 |
| **3:2** | 632x424 | 747 | 1264x848 | 1120 | 2528x1696 | 1680 | 5056x3392 | 2520 |
| **3:4** | 448x600 | 747 | 896x1200 | 1120 | 1792x2400 | 1680 | 3584x4800 | 2520 |
| **4:1** | 1024x256 | 747 | 2048x512 | 1120 | 4096x1024 | 1680 | 8192x2048 | 2520 |
| **4:3** | 600x448 | 747 | 1200x896 | 1120 | 2400x1792 | 1680 | 4800x3584 | 2520 |
| **4:5** | 464x576 | 747 | 928x1152 | 1120 | 1856x2304 | 1680 | 3712x4608 | 2520 |
| **5:4** | 576x464 | 747 | 1152x928 | 1120 | 2304x1856 | 1680 | 4608x3712 | 2520 |
| **8:1** | 1536x192 | 747 | 3072x384 | 1120 | 6144x768 | 1680 | 12288x1536 | 2520 |
| **9:16** | 384x688 | 747 | 768x1376 | 1120 | 1536x2752 | 1680 | 3072x5504 | 2520 |
| **16:9** | 688x384 | 747 | 1376x768 | 1120 | 2752x1536 | 1680 | 5504x3072 | 2520 |
| **21:9** | 792x168 | 747 | 1584x672 | 1120 | 3168x1344 | 1680 | 6336x2688 | 2520 |

### 3 Pro Image Preview

| Aspect ratio | 1K resolution | 1K tokens | 2K resolution | 2K tokens | 4K resolution | 4K tokens |
|---|---|---|---|---|---|---|
| **1:1** | 1024x1024 | 1120 | 2048x2048 | 1120 | 4096x4096 | 2000 |
| **2:3** | 848x1264 | 1120 | 1696x2528 | 1120 | 3392x5056 | 2000 |
| **3:2** | 1264x848 | 1120 | 2528x1696 | 1120 | 5056x3392 | 2000 |
| **3:4** | 896x1200 | 1120 | 1792x2400 | 1120 | 3584x4800 | 2000 |
| **4:3** | 1200x896 | 1120 | 2400x1792 | 1120 | 4800x3584 | 2000 |
| **4:5** | 928x1152 | 1120 | 1856x2304 | 1120 | 3712x4608 | 2000 |
| **5:4** | 1152x928 | 1120 | 2304x1856 | 1120 | 4608x3712 | 2000 |
| **9:16** | 768x1376 | 1120 | 1536x2752 | 1120 | 3072x5504 | 2000 |
| **16:9** | 1376x768 | 1120 | 2752x1536 | 1120 | 5504x3072 | 2000 |
| **21:9** | 1584x672 | 1120 | 3168x1344 | 1120 | 6336x2688 | 2000 |

### Gemini 2.5 Flash Image

| Aspect ratio | Resolution | Tokens |
|---|---|---|
| 1:1 | 1024x1024 | 1290 |
| 2:3 | 832x1248 | 1290 |
| 3:2 | 1248x832 | 1290 |
| 3:4 | 864x1184 | 1290 |
| 4:3 | 1184x864 | 1290 |
| 4:5 | 896x1152 | 1290 |
| 5:4 | 1152x896 | 1290 |
| 9:16 | 768x1344 | 1290 |
| 16:9 | 1344x768 | 1290 |
| 21:9 | 1536x672 | 1290 |

## Model selection

Choose the model best suited for your specific use case.

- **Gemini 3.1 Flash Image Preview (Nano Banana 2 Preview)** should be your
  go-to image generation model, as the best all around performance and
  intelligence to cost and latency balance. Check the model [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image-preview) and [capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image-preview) page for more
  details.

- **Gemini 3 Pro Image Preview (Nano Banana Pro Preview)** is designed for
  professional asset production and complex instructions. This model features
  real-world grounding using Google Search, a default "Thinking" process that
  refines composition prior to generation, and can generate images of up to 4K
  resolutions. Check the model [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3-pro-image-preview) and [capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image-preview) page for more
  details.

- **Gemini 2.5 Flash Image (Nano Banana)** is designed for speed and
  efficiency. This model is optimized for high-volume, low-latency tasks and
  generates images at 1024px resolution. Check the model [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-image) and
  [capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image) page for more
  details.

### When to use Imagen

In addition to using Gemini's built-in image generation capabilities, you can
also access [Imagen](https://ai.google.dev/gemini-api/docs/imagen), our specialized image generation
model, through the Gemini API.

Imagen 4 should be your go-to model when starting to generate images
with Imagen. Choose Imagen 4 Ultra for advanced
use-cases or when you need the best image quality (note that can only generate
one image at a time).

## What's next

- Find more examples and code samples in the [cookbook guide](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_Started_Nano_Banana.ipynb).
- Check out the [Veo guide](https://ai.google.dev/gemini-api/docs/video) to learn how to generate videos with the Gemini API.
- To learn more about Gemini models, see [Gemini models](https://ai.google.dev/gemini-api/docs/models/gemini).
