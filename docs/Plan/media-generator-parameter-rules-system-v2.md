# 媒体生成器参数规则系统 — 优化施工计划 v2

**状态**: Implementing
**作者**: 咕咕
**日期**: 2026-04-23
**基于**: `media-generator-parameter-rules-system.md` (RFC) + 附录 API 文档对比分析
**关联模块**: `media-generator`, `model-metadata`, `llm-apis/adapters`

---

## 0. 施工策略总览

基于附录 API 文档的对比分析，本次施工分两条线并行推进：

| 线路                            | 范围                                                                                   | 本期是否实施            |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| **A 线**：OpenAI 兼容接口的模型 | DALL-E 3, GPT Image 1/1.5/1-mini/2, FLUX, Kolors, SD 3.5, Qwen Image, xAI grok-imagine | ✅ 全量实施             |
| **B 线**：Gemini 专属接口       | gemini-\*-image-preview, gemini-2.5-flash-image                                        | 🔷 规则先上，适配器延期 |

**xAI 特殊情况**：`grok-imagine-image` 走 `/v1/images/generations`（OpenAI 兼容），但参数是 `aspect_ratio`（字符串比例）+ `resolution`（`"1k"/"2k"`）而非 `widthxheight` 格式的 `size`。本期在类型定义中新增 `aspectRatio` + `resolution` 字段支持，适配层的参数映射随 UI 一起上。

---

## 1. 核心发现与修正（相对于 RFC 的变化）

### 1.1 `gpt-image-2` 的 `background` 行为修正

RFC 中写的是 `background: { supported: false }`，**这是错误的**。

OpenAI 官方文档说明：

> `gpt-image-2` doesn't currently support transparent backgrounds. Requests with `background: "transparent"` aren't supported.

正确行为：`opaque` 和 `auto` 仍然有效，只有 `transparent` 不支持。

**正确配置**：

```typescript
background: {
  supported: true,
  options: [
    { label: "不透明", value: "opaque" },
    { label: "自动", value: "auto" },
    // 不包含 transparent
  ],
}
```

### 1.2 `gpt-image-2` size 预设补全

RFC 缺少官方文档列出的 `2048x1152`（2K横屏）和 `2160x3840`（4K竖屏）。

### 1.3 缺失的 GPT Image 变体

需新增：`gpt-image-1.5`、`gpt-image-1-mini` 的规则（参数支持范围与 `gpt-image-1` 相同）。

### 1.4 xAI 新增 `aspectRatio` + `resolution` 字段

xAI 不使用 `size`（`widthxheight`格式），而是：

- `aspect_ratio`：`"1:1"` / `"16:9"` / `"19.5:9"` / `"auto"` 等
- `resolution`：`"1k"` / `"2k"`（注意必须小写 k）

需在 `MediaGenParamRules` 类型中新增这两个字段。

### 1.5 Gemini 接口完全不同（本期不实施适配器）

Gemini 图像生成走 `generateContent` 接口，参数格式为 `imageConfig.aspectRatio` + `imageConfig.imageSize`（`"1K"/"2K"/"4K"`，**大写K**）。

本期：写好规则数据（供未来使用），不实施适配器。

---

## 2. 类型定义修改（`src/types/model-metadata.ts`）

在现有 `ModelMetadataProperties` 接口中新增 `mediaGenParams` 字段，并定义 `MediaGenParamRules` 接口。

### 2.1 新增 `MediaGenParamRules` 接口

```typescript
/**
 * 媒体生成参数规则配置
 * 描述一个模型支持哪些生成参数，以及各参数的约束。
 *
 * 字段含义：
 * - 字段缺失（undefined）= 不限制，透传用户输入
 * - supported: false = 明确不支持，发送请求时剔除该参数
 * - supported: true = 支持，根据 options/min/max 约束
 */
export interface MediaGenParamRules {
  // ========== 尺寸控制 ==========

  /**
   * 标准尺寸控制（widthxheight 格式，如 "1024x1024"）
   * 用于 OpenAI / SiliconFlow 等接口的 `size` 参数
   */
  size?: {
    /**
     * 尺寸模式
     * - 'preset': 只能从预设列表中选择（如 DALL-E 3、FLUX）
     * - 'free': 自由输入宽高，但有约束条件（如 GPT Image 2）
     */
    mode: "preset" | "free";
    /** 预设尺寸选项（在 UI 中展示为快捷选项） */
    presets?: Array<{ label: string; value: string }>;
    /** 自由模式约束（mode=free 时生效） */
    constraints?: {
      maxWidth?: number;
      maxHeight?: number;
      /** 宽高必须是此值的整数倍（如 GPT Image 2 要求 16px） */
      stepSize?: number;
      /** 长边:短边 最大比例（如 GPT Image 2 为 3） */
      maxAspectRatio?: number;
      minPixels?: number;
      maxPixels?: number;
    };
    default?: string;
  };

  /**
   * 宽高比 + 分辨率模式（xAI grok-imagine 等使用此模式）
   * 对应接口参数：`aspect_ratio` + `resolution`
   */
  aspectRatioMode?: {
    /** 可选的宽高比列表 */
    ratios: Array<{ label: string; value: string }>;
    /** 可选的分辨率列表 */
    resolutions?: Array<{ label: string; value: string }>;
    defaultRatio?: string;
    defaultResolution?: string;
  };

  /**
   * Gemini 图像配置模式（aspectRatio + imageSize）
   * 对应 Gemini generateContent 接口的 imageConfig 参数
   * 注意：imageSize 值为 "512" / "1K" / "2K" / "4K"（大写K）
   *
   * @future 此字段规则可先定义，适配器延期实施
   */
  geminiImageConfig?: {
    aspectRatios: Array<{ label: string; value: string }>;
    imageSizes?: Array<{ label: string; value: string }>;
    defaultAspectRatio?: string;
    defaultImageSize?: string;
  };

  // ========== 质量 ==========

  quality?:
    | {
        supported: true;
        options: Array<{ label: string; value: string }>;
        default?: string;
      }
    | { supported: false };

  // ========== 风格 ==========

  style?:
    | {
        supported: true;
        options: Array<{ label: string; value: string }>;
        default?: string;
      }
    | { supported: false };

  // ========== 负向提示词 ==========

  negativePrompt?: {
    supported: boolean;
  };

  // ========== 随机种子 ==========

  seed?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  // ========== 迭代步数 ==========

  steps?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  // ========== 引导系数 ==========

  guidanceScale?: {
    supported: boolean;
    min?: number;
    max?: number;
    step?: number;
    default?: number;
  };

  // ========== 背景透明度 ==========

  background?: {
    supported: boolean;
    /** 支持 transparent 时才包含该选项 */
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 输入保真度 ==========

  inputFidelity?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 内容审核 ==========

  moderation?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 输出格式 ==========

  outputFormat?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
    default?: string;
  };

  // ========== 输出压缩 ==========

  outputCompression?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  // ========== 批量生成 ==========

  batchSize?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  // ========== 流式部分图片 ==========

  partialImages?: {
    supported: boolean;
    min?: number;
    max?: number;
  };
}
```

### 2.2 在 `ModelMetadataProperties` 中添加字段

在现有接口的 `[key: string]: unknown` 之前插入：

```typescript
/** 媒体生成参数规则（仅对图像/视频生成类模型有效） */
mediaGenParams?: MediaGenParamRules;
```

---

## 3. 预设规则数据（`src/config/model-metadata-presets.ts`）

在文件末尾、`];` 之前追加以下规则块（优先级 40，高于现有图标/能力规则）。

### 3.1 OpenAI DALL-E 3

```typescript
{
  id: "media-params-dall-e-3",
  matchType: "modelPrefix",
  matchValue: "dall-e-3",
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "横屏 (1792×1024)", value: "1792x1024" },
          { label: "竖屏 (1024×1792)", value: "1024x1792" },
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
```

### 3.2 OpenAI GPT Image 1（含 1.5、1-mini）

> 三个型号的参数支持范围相同，使用 `modelPrefix` 一次覆盖。

```typescript
{
  id: "media-params-gpt-image-1",
  matchType: "modelPrefix",
  matchValue: "gpt-image-1",
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "横屏 (1536×1024)", value: "1536x1024" },
          { label: "竖屏 (1024×1536)", value: "1024x1536" },
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
      outputFormat: {
        supported: true,
        options: [
          { label: "PNG", value: "png" },
          { label: "JPEG (更快)", value: "jpeg" },
          { label: "WebP", value: "webp" },
        ],
        default: "png",
      },
      outputCompression: { supported: true, min: 0, max: 100 },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      inputFidelity: { supported: false },
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
      partialImages: { supported: true, min: 0, max: 3 },
    },
  },
  priority: 40,
  enabled: true,
  description: "GPT Image 1 系列生成参数规则（含 1.5 / 1-mini）",
},
```

### 3.3 OpenAI GPT Image 2

> 注意：`background` 支持 `opaque`/`auto`，但**不支持** `transparent`。

```typescript
{
  id: "media-params-gpt-image-2",
  matchType: "modelPrefix",
  matchValue: "gpt-image-2",
  properties: {
    mediaGenParams: {
      size: {
        mode: "free",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "3:2 (1536×1024)", value: "1536x1024" },
          { label: "2:3 (1024×1536)", value: "1024x1536" },
          { label: "2K 方形 (2048×2048)", value: "2048x2048" },
          { label: "2K 横屏 (2048×1152)", value: "2048x1152" },
          { label: "4K 横屏 (3840×2160)", value: "3840x2160" },
          { label: "4K 竖屏 (2160×3840)", value: "2160x3840" },
          { label: "Auto", value: "auto" },
        ],
        constraints: {
          maxWidth: 3840,
          maxHeight: 3840,
          stepSize: 16,
          maxAspectRatio: 3,
          minPixels: 655360,
          maxPixels: 8294400,
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
      // gpt-image-2 不支持 transparent，但支持 opaque/auto
      background: {
        supported: true,
        options: [
          { label: "不透明", value: "opaque" },
          { label: "自动", value: "auto" },
        ],
      },
      // gpt-image-2 始终以 high fidelity 处理输入，API 不允许修改
      inputFidelity: { supported: false },
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
      outputCompression: { supported: true, min: 0, max: 100 },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
      partialImages: { supported: true, min: 0, max: 3 },
    },
  },
  priority: 41, // 高于 gpt-image-1，确保 gpt-image-2 优先匹配
  enabled: true,
  description: "GPT Image 2 生成参数规则（background 仅支持 opaque/auto，不含 transparent）",
},
```

### 3.4 FLUX 系列（SiliconFlow 等 OpenAI 兼容代理）

```typescript
{
  id: "media-params-flux",
  matchType: "modelPrefix",
  matchValue: "flux",
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "横屏 (1792×1024)", value: "1792x1024" },
          { label: "竖屏 (1024×1792)", value: "1024x1792" },
          { label: "宽横屏 (2048×1024)", value: "2048x1024" },
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
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
    },
  },
  priority: 40,
  enabled: true,
  description: "FLUX 系列生成参数规则（SiliconFlow 等）",
},
```

### 3.5 Kolors（SiliconFlow）

```typescript
{
  id: "media-params-kolors",
  matchType: "modelPrefix",
  matchValue: "kolors",
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "3:4 (960×1280)", value: "960x1280" },
          { label: "3:4 (768×1024)", value: "768x1024" },
          { label: "1:2 (720×1440)", value: "720x1440" },
          { label: "9:16 (720×1280)", value: "720x1280" },
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
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
    },
  },
  priority: 40,
  enabled: true,
  description: "Kolors 生成参数规则（SiliconFlow）",
},
```

### 3.6 Stable Diffusion 3.5（SiliconFlow）

```typescript
{
  id: "media-params-sd3",
  matchType: "modelPrefix",
  matchValue: "sd3|stable-diffusion-3|stabilityai/stable-diffusion-3",
  useRegex: true,
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "16:9 (1360×768)", value: "1360x768" },
          { label: "9:16 (768×1360)", value: "768x1360" },
          { label: "4:3 (1152×896)", value: "1152x896" },
          { label: "3:4 (896×1152)", value: "896x1152" },
        ],
        default: "1024x1024",
      },
      negativePrompt: { supported: true },
      seed: { supported: true, min: -1 },
      steps: { supported: true, min: 1, max: 50, default: 28 },
      guidanceScale: { supported: true, min: 1, max: 20, step: 0.5, default: 7 },
      quality: { supported: false },
      style: { supported: false },
      background: { supported: false },
      batchSize: { supported: true, min: 1, max: 4, default: 1 },
    },
  },
  priority: 40,
  enabled: true,
  description: "Stable Diffusion 3.x 生成参数规则",
},
```

### 3.7 Qwen Image（通义千问图像系列）

```typescript
{
  id: "media-params-qwen-image",
  matchType: "modelPrefix",
  matchValue: "qwen-image|Qwen/Qwen",
  useRegex: true,
  properties: {
    mediaGenParams: {
      size: {
        mode: "preset",
        presets: [
          { label: "1:1 (1024×1024)", value: "1024x1024" },
          { label: "16:9 (1344×768)", value: "1344x768" },
          { label: "9:16 (768×1344)", value: "768x1344" },
          { label: "4:3 (1152×864)", value: "1152x864" },
          { label: "3:4 (864×1152)", value: "864x1152" },
          { label: "3:2 (1280×854)", value: "1280x854" },
          { label: "2:3 (854×1280)", value: "854x1280" },
        ],
        default: "1024x1024",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      quality: { supported: false },
      style: { supported: false },
      background: { supported: false },
      batchSize: { supported: false }, // Qwen Image 不支持批量
    },
  },
  priority: 40,
  enabled: true,
  description: "Qwen Image 系列生成参数规则（qwen-image-2.0 / max / plus）",
},
```

### 3.8 xAI grok-imagine-image

> 使用 `aspectRatioMode` 字段（宽高比+分辨率模式），而非 `size`。

```typescript
{
  id: "media-params-grok-imagine",
  matchType: "modelPrefix",
  matchValue: "grok-.*image|grok-imagine",
  useRegex: true,
  properties: {
    mediaGenParams: {
      // xAI 使用 aspect_ratio + resolution，不使用 size（widthxheight 格式）
      aspectRatioMode: {
        ratios: [
          { label: "1:1", value: "1:1" },
          { label: "16:9 (横屏)", value: "16:9" },
          { label: "9:16 (竖屏)", value: "9:16" },
          { label: "4:3", value: "4:3" },
          { label: "3:4", value: "3:4" },
          { label: "3:2", value: "3:2" },
          { label: "2:3", value: "2:3" },
          { label: "2:1", value: "2:1" },
          { label: "1:2", value: "1:2" },
          { label: "21:9 (超宽)", value: "21:9" },
          { label: "9:21", value: "9:21" },
          { label: "Auto（模型自选）", value: "auto" },
        ],
        resolutions: [
          { label: "1K（默认）", value: "1k" },
          { label: "2K（高分辨率）", value: "2k" },
        ],
        defaultRatio: "1:1",
        defaultResolution: "1k",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      quality: { supported: false },
      style: { supported: false },
      background: { supported: false },
      batchSize: { supported: true, min: 1, max: 10, default: 1 },
    },
  },
  priority: 40,
  enabled: true,
  description: "xAI grok-imagine-image 生成参数规则（使用 aspect_ratio + resolution）",
},
```

### 3.9 Gemini 图像模型（规则先上，适配器延期）

> 这些规则目前不会对 ParameterPanel 产生任何影响，因为 Gemini 图像生成走 `generateContent` 接口（非当前 `callOpenAiImageApi` 路径）。待 Gemini Image Adapter 实现后，UI 层可直接读取此规则。

```typescript
// Gemini 2.5 Flash Image (Nano Banana)
{
  id: "media-params-gemini-2.5-flash-image",
  matchType: "modelPrefix",
  matchValue: "gemini-2.5-flash-image",
  properties: {
    mediaGenParams: {
      geminiImageConfig: {
        aspectRatios: [
          { label: "1:1", value: "1:1" },
          { label: "16:9 (横屏)", value: "16:9" },
          { label: "9:16 (竖屏)", value: "9:16" },
          { label: "4:3", value: "4:3" },
          { label: "3:4", value: "3:4" },
          { label: "3:2", value: "3:2" },
          { label: "2:3", value: "2:3" },
          { label: "4:5", value: "4:5" },
          { label: "5:4", value: "5:4" },
          { label: "21:9", value: "21:9" },
        ],
        // 2.5 Flash Image 仅支持 1024px（无 imageSize 参数）
        defaultAspectRatio: "1:1",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      quality: { supported: false },
      batchSize: { supported: false },
    },
  },
  priority: 40,
  enabled: true,
  description: "Gemini 2.5 Flash Image 参数规则（@future: 需要 Gemini Image Adapter）",
},

// Gemini 3 Pro Image (Nano Banana Pro)
{
  id: "media-params-gemini-3-pro-image",
  matchType: "modelPrefix",
  matchValue: "gemini-3-pro-image",
  properties: {
    mediaGenParams: {
      geminiImageConfig: {
        aspectRatios: [
          { label: "1:1", value: "1:1" },
          { label: "16:9 (横屏)", value: "16:9" },
          { label: "9:16 (竖屏)", value: "9:16" },
          { label: "4:3", value: "4:3" },
          { label: "3:4", value: "3:4" },
          { label: "3:2", value: "3:2" },
          { label: "2:3", value: "2:3" },
          { label: "4:5", value: "4:5" },
          { label: "5:4", value: "5:4" },
          { label: "21:9", value: "21:9" },
        ],
        imageSizes: [
          { label: "1K（默认）", value: "1K" },
          { label: "2K", value: "2K" },
          { label: "4K（旗舰）", value: "4K" },
        ],
        defaultAspectRatio: "1:1",
        defaultImageSize: "1K",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      quality: { supported: false },
      batchSize: { supported: false },
    },
  },
  priority: 40,
  enabled: true,
  description: "Gemini 3 Pro Image 参数规则（@future: 需要 Gemini Image Adapter）",
},

// Gemini 3.1 Flash Image (Nano Banana 2)
{
  id: "media-params-gemini-3.1-flash-image",
  matchType: "modelPrefix",
  matchValue: "gemini-3.1-flash-image",
  properties: {
    mediaGenParams: {
      geminiImageConfig: {
        aspectRatios: [
          { label: "1:1", value: "1:1" },
          { label: "16:9 (横屏)", value: "16:9" },
          { label: "9:16 (竖屏)", value: "9:16" },
          { label: "4:3", value: "4:3" },
          { label: "3:4", value: "3:4" },
          { label: "3:2", value: "3:2" },
          { label: "2:3", value: "2:3" },
          { label: "4:5", value: "4:5" },
          { label: "5:4", value: "5:4" },
          { label: "21:9 (超宽)", value: "21:9" },
          { label: "1:4 (窄竖)", value: "1:4" },
          { label: "4:1 (宽横)", value: "4:1" },
          { label: "1:8", value: "1:8" },
          { label: "8:1", value: "8:1" },
        ],
        imageSizes: [
          { label: "512（0.5K）", value: "512" },
          { label: "1K（默认）", value: "1K" },
          { label: "2K", value: "2K" },
          { label: "4K（最高）", value: "4K" },
        ],
        defaultAspectRatio: "1:1",
        defaultImageSize: "1K",
      },
      negativePrompt: { supported: false },
      seed: { supported: false },
      steps: { supported: false },
      guidanceScale: { supported: false },
      quality: { supported: false },
      batchSize: { supported: false },
    },
  },
  priority: 41,
  enabled: true,
  description: "Gemini 3.1 Flash Image 参数规则（@future: 需要 Gemini Image Adapter）",
},
```

---

## 4. 核心 Composable（`src/tools/media-generator/composables/useMediaGenParamRules.ts`）

```typescript
import { useModelMetadata } from "@/composables/useModelMetadata";
import type { MediaGenParamRules } from "@/types/model-metadata";

/**
 * 媒体生成参数规则 Composable
 *
 * 从模型元数据中读取 mediaGenParams 规则，提供给：
 * - ParameterPanel：动态渲染/隐藏控件
 * - useMediaGenerationManager：请求前清洁参数
 */
export function useMediaGenParamRules() {
  const { getMatchedProperties } = useModelMetadata();

  /**
   * 获取指定模型的生成参数规则
   */
  function getParamRules(modelId: string, provider?: string): MediaGenParamRules | undefined {
    const props = getMatchedProperties(modelId, provider);
    return props?.mediaGenParams as MediaGenParamRules | undefined;
  }

  /**
   * 判断模型是否使用 aspectRatioMode（xAI 等）而非标准 size 参数
   */
  function usesAspectRatioMode(rules: MediaGenParamRules): boolean {
    return !!rules.aspectRatioMode && !rules.size;
  }

  /**
   * 判断模型是否使用 geminiImageConfig（Gemini 图像生成接口）
   */
  function usesGeminiImageConfig(rules: MediaGenParamRules): boolean {
    return !!rules.geminiImageConfig;
  }

  /**
   * 根据规则清洁请求参数（剔除不支持的参数，修正超出范围的值）
   *
   * 注意：只处理 OpenAI 兼容接口的参数。
   * Gemini 接口参数清洁应在专用 Adapter 中处理。
   */
  function sanitizeParams(params: Record<string, any>, rules: MediaGenParamRules): Record<string, any> {
    const clean = { ...params };

    // negative_prompt
    if (rules.negativePrompt?.supported === false) {
      delete clean.negative_prompt;
      delete clean.negativePrompt;
    }

    // quality
    if (rules.quality !== undefined) {
      if (!rules.quality.supported) {
        delete clean.quality;
      } else if ("options" in rules.quality && rules.quality.options) {
        const validValues = rules.quality.options.map((o) => o.value);
        if (!validValues.includes(clean.quality)) {
          clean.quality = rules.quality.default || validValues[0];
        }
      }
    }

    // style
    if (rules.style !== undefined) {
      if (!rules.style.supported) {
        delete clean.style;
      } else if ("options" in rules.style && rules.style.options) {
        const validValues = rules.style.options.map((o) => o.value);
        if (!validValues.includes(clean.style)) {
          clean.style = rules.style.default || validValues[0];
        }
      }
    }

    // seed
    if (rules.seed?.supported === false) {
      delete clean.seed;
    }

    // steps / num_inference_steps
    if (rules.steps?.supported === false) {
      delete clean.num_inference_steps;
    }

    // guidanceScale / guidance_scale
    if (rules.guidanceScale?.supported === false) {
      delete clean.guidance_scale;
    }

    // background
    if (rules.background !== undefined) {
      if (!rules.background.supported) {
        delete clean.background;
      } else if (rules.background.options) {
        const validValues = rules.background.options.map((o) => o.value);
        if (clean.background && !validValues.includes(clean.background)) {
          // 用户选了不支持的值（如 transparent），重置为第一个有效选项
          clean.background = validValues[0];
        }
      }
    }

    // inputFidelity
    if (rules.inputFidelity?.supported === false) {
      delete clean.input_fidelity;
    }

    // moderation
    if (rules.moderation?.supported === false) {
      delete clean.moderation;
    }

    // outputFormat
    if (rules.outputFormat?.supported === false) {
      delete clean.output_format;
    }

    // outputCompression
    if (rules.outputCompression?.supported === false) {
      delete clean.output_compression;
    }

    // batchSize / n
    if (rules.batchSize?.supported === false) {
      clean.n = 1; // 强制为 1
    } else if (rules.batchSize) {
      const { min = 1, max = 10 } = rules.batchSize;
      if (clean.n !== undefined) {
        clean.n = Math.min(Math.max(Number(clean.n) || 1, min), max);
      }
    }

    // partialImages
    if (rules.partialImages?.supported === false) {
      delete clean.partial_images;
    }

    // size（preset 模式校验）
    if (rules.size?.mode === "preset" && rules.size.presets) {
      const validSizes = rules.size.presets.map((p) => p.value);
      if (clean.size && !validSizes.includes(clean.size)) {
        clean.size = rules.size.default || validSizes[0];
      }
    }

    // free size 模式不在这里校验（UI 层实时验证）

    return clean;
  }

  /**
   * 构建 xAI aspect_ratio + resolution 参数
   * 将 UI 状态映射为 xAI API 所需的格式
   */
  function buildXaiSizeParams(aspectRatio: string, resolution: string): { aspect_ratio: string; resolution: string } {
    return {
      aspect_ratio: aspectRatio,
      resolution: resolution.toLowerCase(), // xAI 要求小写 k
    };
  }

  return {
    getParamRules,
    sanitizeParams,
    usesAspectRatioMode,
    usesGeminiImageConfig,
    buildXaiSizeParams,
  };
}
```

---

## 5. ParameterPanel 改造方案（`src/tools/media-generator/components/ParameterPanel.vue`）

### 5.1 替换硬编码判断

将所有 `supportsXxx` computed 替换为规则驱动：

```typescript
import { useMediaGenParamRules } from "../composables/useMediaGenParamRules";

const { getParamRules, usesAspectRatioMode } = useMediaGenParamRules();

// 从当前选中模型获取规则
const paramRules = computed(() => {
  if (!selectedModelInfo.value) return undefined;
  return getParamRules(selectedModelInfo.value.modelId, selectedModelInfo.value.provider);
});

// 尺寸模式判断
const sizeMode = computed(() => {
  const rules = paramRules.value;
  if (!rules) return "preset"; // 无规则时保持现有行为
  if (usesAspectRatioMode(rules)) return "aspectRatio"; // xAI
  return rules.size?.mode || "preset";
});

const sizeOptions = computed(
  () => paramRules.value?.size?.presets || [{ label: "1:1 (1024×1024)", value: "1024x1024" }],
);

// xAI 宽高比选项
const aspectRatioOptions = computed(() => paramRules.value?.aspectRatioMode?.ratios || []);
const resolutionOptions = computed(() => paramRules.value?.aspectRatioMode?.resolutions || []);
const freeConstraints = computed(() => paramRules.value?.size?.constraints);

// 各参数支持情况
const supportsQuality = computed(
  () => paramRules.value?.quality !== undefined && (paramRules.value.quality as any).supported !== false,
);
const qualityOptions = computed(() => (paramRules.value?.quality as any)?.options || []);
const supportsStyle = computed(
  () => paramRules.value?.style !== undefined && (paramRules.value.style as any).supported !== false,
);
const styleOptions = computed(() => (paramRules.value?.style as any)?.options || []);
const supportsNegativePrompt = computed(() => paramRules.value?.negativePrompt?.supported !== false);
const supportsSeed = computed(() => paramRules.value?.seed?.supported !== false);
const supportsSteps = computed(() => paramRules.value?.steps?.supported === true);
const supportsCfg = computed(() => paramRules.value?.guidanceScale?.supported === true);
const supportsBackground = computed(() => paramRules.value?.background?.supported !== false);
const backgroundOptions = computed(() => paramRules.value?.background?.options || []);
const supportsModeration = computed(() => paramRules.value?.moderation?.supported === true);
const moderationOptions = computed(() => paramRules.value?.moderation?.options || []);
const supportsOutputFormat = computed(() => paramRules.value?.outputFormat?.supported !== false);
const outputFormatOptions = computed(() => paramRules.value?.outputFormat?.options || []);
const supportsOutputCompression = computed(() => paramRules.value?.outputCompression?.supported !== false);
const maxBatchSize = computed(() => paramRules.value?.batchSize?.max || 4);
const supportsBatch = computed(() => paramRules.value?.batchSize?.supported !== false);
```

### 5.2 free 尺寸模式的实时校验

```typescript
// 仅在 free 模式下触发校验
const sizeValidationError = computed(() => {
  if (sizeMode.value !== "free" || !freeConstraints.value) return null;
  const c = freeConstraints.value;
  const [w, h] = (localSize.value || "").split("x").map(Number);
  if (!w || !h) return null;

  if (c.maxWidth && w > c.maxWidth) return `宽度不能超过 ${c.maxWidth}px`;
  if (c.maxHeight && h > c.maxHeight) return `高度不能超过 ${c.maxHeight}px`;
  if (c.stepSize && (w % c.stepSize !== 0 || h % c.stepSize !== 0)) return `宽高必须是 ${c.stepSize}px 的整数倍`;
  if (c.maxAspectRatio) {
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > c.maxAspectRatio) return `长边:短边 不能超过 ${c.maxAspectRatio}:1`;
  }
  if (c.minPixels && w * h < c.minPixels) return `总像素数不能小于 ${c.minPixels.toLocaleString()}`;
  if (c.maxPixels && w * h > c.maxPixels) return `总像素数不能超过 ${c.maxPixels.toLocaleString()}`;
  return null;
});
```

---

## 6. 请求管线改造

### 6.1 在 `useMediaGenerationManager.ts` 中集成参数清洁

在构造请求选项后、调用 API 前插入：

```typescript
import { useMediaGenParamRules } from "./useMediaGenParamRules";

const { getParamRules, sanitizeParams, usesAspectRatioMode, buildXaiSizeParams } = useMediaGenParamRules();

// ... 在 startGeneration 内，构建 finalOptions 后：

const rules = getParamRules(options.modelId, selectedProfile?.type);
if (rules) {
  // 处理 xAI 的特殊参数映射
  if (usesAspectRatioMode(rules)) {
    const xaiParams = buildXaiSizeParams(
      finalOptions.aspectRatio || rules.aspectRatioMode?.defaultRatio || "1:1",
      finalOptions.resolution || rules.aspectRatioMode?.defaultResolution || "1k",
    );
    finalOptions = { ...finalOptions, ...xaiParams };
    delete finalOptions.size; // 移除 size，改用 aspect_ratio
  }
  // 通用参数清洁
  finalOptions = { ...finalOptions, ...sanitizeParams(finalOptions, rules) };
}
```

### 6.2 在 `callOpenAiImageApi` 中添加 undefined 兜底

在序列化 body 之前（第60行附近），将所有显式 `undefined`/`null` 的字段过滤：

```typescript
// 构建原始 body 对象（不变）
const rawBody = {
  model: modelId,
  prompt: prompt || "",
  negative_prompt: options.negativePrompt,
  n,
  size,
  quality,
  style,
  response_format: responseFormat === "url" ? undefined : responseFormat,
  seed: options.seed,
  guidance_scale: options.guidanceScale,
  num_inference_steps: options.numInferenceSteps,
  user: options.user,
  background: ext.background,
  input_fidelity: ext.inputFidelity,
  partial_images: ext.partialImages,
  output_compression: ext.outputCompression,
  moderation: ext.moderation,
  // xAI 参数
  aspect_ratio: ext.aspect_ratio,
  resolution: ext.resolution,
};

// 移除所有 undefined/null 值，避免发送 "null" 字符串
const cleanBody = Object.fromEntries(Object.entries(rawBody).filter(([_, v]) => v !== undefined && v !== null));

body = await asyncJsonStringify(cleanBody);
```

---

## 7. 实施阶段与顺序

| 阶段 | 任务            | 文件                                                                 | 影响范围   | 依赖   |
| ---- | --------------- | -------------------------------------------------------------------- | ---------- | ------ |
| P1   | 类型定义        | `src/types/model-metadata.ts`                                        | 类型系统   | 无     |
| P2   | 预设规则        | `src/config/model-metadata-presets.ts`                               | 数据层     | P1     |
| P3   | 核心 Composable | `src/tools/media-generator/composables/useMediaGenParamRules.ts`     | 新建文件   | P1     |
| P4   | API 层兜底      | `src/llm-apis/adapters/openai/image.ts`                              | 低风险修改 | P1     |
| P5   | 请求管线        | `src/tools/media-generator/composables/useMediaGenerationManager.ts` | 请求流程   | P3, P4 |
| P6   | UI 改造         | `src/tools/media-generator/components/ParameterPanel.vue`            | 用户界面   | P3, P5 |

**延期（不在本期范围）**：

- Gemini Image Adapter（`src/llm-apis/adapters/gemini/image.ts`）
- 模型元数据设置界面中的 `mediaGenParams` 可视化编辑

---

## 8. 风险说明

| 风险                                      | 影响       | 缓解措施                                                                                               |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 未配置规则的模型被误影响                  | 低         | `paramRules` 为 `undefined` 时，所有控件保持原样；`sanitizeParams` 在 `rules` 存在时才执行             |
| xAI `aspect_ratio` 参数格式错误           | 中         | `resolution` 强制 `.toLowerCase()` 处理，xAI 要求小写 k                                                |
| `gpt-image-2` background 值修正           | 低         | 仅对已有 `transparent` 值的情况修正为 `opaque`，其他不变                                               |
| Gemini 规则上线后 ParameterPanel 展示异常 | 低         | `usesGeminiImageConfig()` 返回 `true` 时 ParameterPanel 暂不渲染（同无规则时的降级行为），待适配器实现 |
| presets 文件过长                          | 无功能影响 | 纯数据追加，不影响运行时                                                                               |

---

## 9. 本期不做的事（边界说明）

- ❌ Gemini 图像生成 Adapter（接口路径、响应格式完全不同，需单独 RFC）
- ❌ OpenAI Responses API 的 `tools: [{ type: "image_generation" }]` 路径（对话式图像生成）
- ❌ 模型元数据设置界面的 `mediaGenParams` 可视化编辑入口
- ❌ 视频生成模型（Sora/Kling/Veo 等）的参数规则（另立计划）
