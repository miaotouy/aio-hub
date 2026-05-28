/**
 * 媒体生成参数规则
 *
 * 定义各图像/视频生成模型的尺寸、质量、风格等参数预设。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const mediaGenParamsRules: ModelMetadataRule[] = [
  // === OpenAI DALL-E 3 ===
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
    priority: 15,
    enabled: true,
    description: "DALL-E 3 生成参数规则",
  },

  // === OpenAI GPT Image 1（含 1.5、1-mini） ===
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
            { label: "16:9 (1344×768)", value: "1344x768" },
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
        outputCompression: { supported: true, min: 0, max: 100, default: 0 },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        style: { supported: false },
        inputFidelity: { supported: false },
        moderation: {
          supported: true,
          options: [
            { label: "自动 (Auto)", value: "auto" },
            { label: "宽松 (Low)", value: "low" },
          ],
          default: "auto",
        },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
        partialImages: { supported: true, min: 0, max: 3, default: 0 },
      },
    },
    priority: 15,
    enabled: true,
    description: "GPT Image 1 系列生成参数规则（含 1.5 / 1-mini）",
  },

  // === OpenAI GPT Image 2 ===
  {
    id: "media-params-gpt-image-2",
    matchType: "modelPrefix",
    matchValue: "gpt-image-2",
    properties: {
      capabilities: {
        vision: true,
      },
      mediaGenParams: {
        size: {
          mode: "free",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "9:16 (768×1344)", value: "768x1344" },
            { label: "3:2 (1536×1024)", value: "1536x1024" },
            { label: "2:3 (1024×1536)", value: "1024x1536" },
            { label: "2K 方形 (2048×2048)", value: "2048x2048" },
            { label: "2K 横屏 (2048×1152)", value: "2048x1152" },
            { label: "4K 横屏 (3840×2160)", value: "3840x2160" },
            { label: "4K 竖屏 (2160×3840)", value: "2160×3840" },
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
        background: {
          supported: true,
          options: [
            { label: "不透明", value: "opaque" },
            { label: "自动", value: "auto" },
          ],
        },
        inputFidelity: { supported: false },
        moderation: {
          supported: true,
          options: [
            { label: "自动 (Auto)", value: "auto" },
            { label: "宽松 (Low)", value: "low" },
          ],
          default: "auto",
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
        outputCompression: { supported: true, min: 0, max: 100, default: 0 },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        style: { supported: false },
        guidanceScale: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
        partialImages: { supported: true, min: 0, max: 3, default: 0 },
      },
    },
    priority: 16, // 高于 gpt-image-1，确保 gpt-image-2 优先匹配
    enabled: true,
    description:
      "GPT Image 2 生成参数规则（background 仅支持 opaque/auto，不含 transparent）",
  },

  // === FLUX 系列（SiliconFlow 等 OpenAI 兼容代理） ===
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
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "横屏 (1792×1024)", value: "1792x1024" },
            { label: "竖屏 (1024×1792)", value: "1024x1792" },
            { label: "宽横屏 (2048×1024)", value: "2048x1024" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: -1 },
        steps: { supported: true, min: 1, max: 50, default: 20 },
        guidanceScale: {
          supported: true,
          min: 1,
          max: 20,
          step: 0.5,
          default: 7.5,
        },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        inputFidelity: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "FLUX 系列生成参数规则（SiliconFlow 等）",
  },

  // === Kolors（SiliconFlow） ===
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
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "3:2 (1216×832)", value: "1216x832" },
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
        guidanceScale: {
          supported: true,
          min: 1,
          max: 20,
          step: 0.5,
          default: 5,
        },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Kolors 生成参数规则（SiliconFlow）",
  },

  // === Stable Diffusion 3.5（SiliconFlow） ===
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
        guidanceScale: {
          supported: true,
          min: 1,
          max: 20,
          step: 0.5,
          default: 7,
        },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Stable Diffusion 3.x 生成参数规则",
  },

  // === Qwen Image（通义千问图像系列） ===
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
    priority: 15,
    enabled: true,
    description: "Qwen Image 系列生成参数规则（qwen-image-2.0 / max / plus）",
  },

  // === xAI grok-imagine-image ===
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
    priority: 15,
    enabled: true,
    description:
      "xAI grok-imagine-image 生成参数规则（使用 aspect_ratio + resolution）",
  },

  // === Gemini 图像模型 ===
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
    priority: 15,
    enabled: true,
    description:
      "Gemini 2.5 Flash Image 参数规则（@future: 需要 Gemini Image Adapter）",
  },
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
    priority: 15,
    enabled: true,
    description:
      "Gemini 3 Pro Image 参数规则（@future: 需要 Gemini Image Adapter）",
  },
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
    priority: 15,
    enabled: true,
    description:
      "Gemini 3.1 Flash Image 参数规则（@future: 需要 Gemini Image Adapter）",
  },
];
