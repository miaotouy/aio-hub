// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 图片生成参数预设规则
 *
 * 定义各图像生成模型的尺寸、质量、风格等参数预设。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const imageGenParamsRules: ModelMetadataRule[] = [
  // === OpenAI DALL-E 3 ===  已过时
  {
    id: "media-params-dall-e-3",
    matchType: "modelPrefix",
    matchValue: "dall-e-3",
    properties: {
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
        imageGeneration: true,
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

  // === Agnes Image ===
  {
    id: "media-params-agnes-image",
    matchType: "modelPrefix",
    matchValue: "agnes-image-",
    properties: {
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [{ label: "1:1 (1024×1024)", value: "1024x1024" }],
          default: "1024x1024",
        },
        quality: { supported: false },
        style: { supported: false },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        background: { supported: false },
        inputFidelity: { supported: false },
        moderation: { supported: false },
        outputFormat: {
          supported: true,
          options: [
            { label: "URL", value: "url" },
            { label: "Base64", value: "b64_json" },
          ],
          default: "url",
        },
        outputCompression: { supported: false },
        batchSize: { supported: false },
        partialImages: { supported: false },
      },
    },
    priority: 26,
    enabled: true,
    description:
      "Agnes Image 系列参数规则（OpenAI 兼容 Images API，不支持 style/quality 等 DALL-E 参数）",
  },

  // === Microsoft MAI Image 2 / 2e ===
  {
    id: "media-params-mai-image",
    matchType: "modelPrefix",
    matchValue: "mai-image",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "free",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "4:3 (1024×768)", value: "1024x768" },
            { label: "3:4 (768×1024)", value: "768x1024" },
            { label: "16:9 (1365×768)", value: "1365x768" },
            { label: "9:16 (768×1365)", value: "768x1365" },
          ],
          constraints: {
            maxPixels: 1048576,
          },
          default: "1024x1024",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        outputFormat: { supported: false }, // 固定 PNG 输出
        batchSize: { supported: false }, // 单次返回一张 PNG
      },
    },
    priority: 15,
    enabled: true,
    description: "Microsoft MAI Image 2 参数规则",
  },

  // === Google Imagen 3 / 4 ===
  {
    id: "media-params-imagen",
    matchType: "modelPrefix",
    matchValue: "imagen-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
          ],
          resolutions: [
            { label: "1K（标准）", value: "1K" },
            { label: "2K（高分辨率）", value: "2K" },
          ],
          defaultRatio: "1:1",
          defaultResolution: "1K",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Google Imagen 系列参数规则",
  },

  // === Ideogram 3 / 4 ===
  {
    id: "media-params-ideogram",
    matchType: "modelPrefix",
    matchValue: "ideogram-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
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
          ],
          defaultRatio: "1:1",
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: 0, max: 2147483647 },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: {
          supported: true,
          options: [
            { label: "不透明", value: "opaque" },
            { label: "透明", value: "transparent" },
          ],
        },
        batchSize: { supported: true, min: 1, max: 8, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Ideogram 3/4 参数规则",
  },

  // === Recraft V3 / V4 ===
  {
    id: "media-params-recraft",
    matchType: "modelPrefix",
    matchValue: "recraft-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "1024×1024", value: "1024x1024" },
            { label: "1365×1024", value: "1365x1024" },
            { label: "1024×1365", value: "1024x1365" },
            { label: "1536×1024", value: "1536x1024" },
            { label: "1024×1536", value: "1024x1536" },
            { label: "1820×1024", value: "1820x1024" },
            { label: "1024×1820", value: "1024x1820" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        outputFormat: {
          supported: true,
          options: [
            { label: "URL", value: "url" },
            { label: "Base64", value: "b64_json" },
          ],
          default: "url",
        },
        batchSize: { supported: true, min: 1, max: 6, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Recraft 图像生成参数规则",
  },

  // === Luma Photon / Uni ===
  {
    id: "media-params-luma-image",
    matchType: "modelPrefix",
    matchValue: "photon|uni-",
    useRegex: true,
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "3:2", value: "3:2" },
            { label: "2:3", value: "2:3" },
            { label: "3:1", value: "3:1" },
            { label: "1:3", value: "1:3" },
            { label: "21:9", value: "21:9" },
            { label: "9:21", value: "9:21" },
          ],
          defaultRatio: "16:9",
        },
        quality: { supported: false },
        style: {
          supported: true,
          options: [
            { label: "自动 (Auto)", value: "auto" },
            { label: "漫画 (Manga)", value: "manga" },
          ],
          default: "auto",
        },
        outputFormat: {
          supported: true,
          options: [
            { label: "JPEG", value: "jpeg" },
            { label: "PNG", value: "png" },
          ],
          default: "jpeg",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Luma Photon / Uni 图像生成参数规则",
  },

  // === Pruna P-Image ===
  {
    id: "media-params-pruna-p-image",
    matchType: "modelPrefix",
    matchValue: "p-image",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "3:2", value: "3:2" },
            { label: "2:3", value: "2:3" },
            { label: "自定义", value: "custom" },
          ],
          defaultRatio: "16:9",
        },
        size: {
          mode: "free",
          constraints: {
            maxWidth: 1440,
            maxHeight: 1440,
            stepSize: 16,
          },
        },
        negativePrompt: { supported: false },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Pruna P-Image 参数规则",
  },

  // === ByteDance Seedream ===
  {
    id: "media-params-seedream",
    matchType: "modelPrefix",
    matchValue: "seedream-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "1:1 (2048×2048)", value: "2048x2048" },
            { label: "16:9 (2560×1440)", value: "2560x1440" },
            { label: "9:16 (1440×2560)", value: "1440x2560" },
            { label: "4:3 (2304×1728)", value: "2304x1728" },
            { label: "3:4 (1728×2304)", value: "1728x2304" },
            { label: "2048×2048", value: "2048x2048" },
            { label: "4096×4096", value: "4096x4096" },
          ],
          default: "2048x2048",
        },
        quality: {
          supported: true,
          options: [
            { label: "标准", value: "standard" },
            { label: "高清", value: "hd" },
            { label: "2K", value: "2K" },
            { label: "4K", value: "4K" },
          ],
          default: "standard",
        },
        negativePrompt: { supported: false },
        seed: { supported: true, min: 1 },
        steps: { supported: false },
        guidanceScale: { supported: true, min: 1, max: 10, step: 0.5 },
        style: { supported: false },
        background: { supported: false },
        outputFormat: {
          supported: true,
          options: [
            { label: "URL", value: "url" },
            { label: "Base64", value: "b64_json" },
          ],
          default: "url",
        },
        batchSize: { supported: true, min: 1, max: 15, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "ByteDance Seedream 系列参数规则",
  },

  // === Tencent Hunyuan Image ===
  {
    id: "media-params-hunyuan-image",
    matchType: "modelPrefix",
    matchValue: "hunyuan-image",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "方形 HD (1024×1024)", value: "1024x1024" },
            { label: "横屏 4:3 (1152×896)", value: "1152x896" },
            { label: "横屏 16:9 (1344×768)", value: "1344x768" },
            { label: "竖屏 4:3 (896×1152)", value: "896x1152" },
            { label: "竖屏 16:9 (768×1344)", value: "768x1344" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: 0, max: 2147483647 },
        steps: { supported: true, min: 1, max: 50, default: 28 },
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
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Tencent Hunyuan Image 参数规则",
  },

  // === Tongyi-MAI Z-Image / 造相 ===
  {
    id: "media-params-z-image",
    matchType: "modelPrefix",
    matchValue: "z[-_\\s]?image|造相\\s*Z",
    useRegex: true,
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "9:16 (768×1344)", value: "768x1344" },
            { label: "4:3 (1152×896)", value: "1152x896" },
            { label: "3:4 (896×1152)", value: "896x1152" },
            { label: "3:2 (1216×832)", value: "1216x832" },
            { label: "2:3 (832×1216)", value: "832x1216" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: -1 },
        steps: { supported: true, min: 1, max: 50, default: 8 },
        guidanceScale: {
          supported: true,
          min: 0,
          max: 20,
          step: 0.5,
          default: 0,
        },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: true, min: 1, max: 4, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "造相 Z-Image / Z-Image-Turbo 生成参数规则",
  },

  // === Z.AI GLM-Image ===
  {
    id: "media-params-glm-image",
    matchType: "modelPrefix",
    matchValue: "glm-image",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "free",
          presets: [
            { label: "1:1 (1280×1280)", value: "1280x1280" },
            { label: "3:2 (1568×1056)", value: "1568x1056" },
            { label: "2:3 (1056×1568)", value: "1056x1568" },
            { label: "4:3 (1472×1088)", value: "1472x1088" },
            { label: "3:4 (1088×1472)", value: "1088x1472" },
            { label: "16:9 (1728×960)", value: "1728x960" },
            { label: "9:16 (960×1728)", value: "960x1728" },
          ],
          constraints: {
            maxWidth: 2048,
            maxHeight: 2048,
            stepSize: 32,
            maxPixels: 4194304,
          },
          default: "1280x1280",
        },
        quality: {
          supported: true,
          options: [
            { label: "高清 (HD)", value: "hd" },
            { label: "标准 (Standard)", value: "standard" },
          ],
          default: "hd",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Z.AI GLM-Image 参数规则",
  },

  // === Reve Image ===
  {
    id: "media-params-reve-image",
    matchType: "modelPrefix",
    matchValue: "reve-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "3:2", value: "3:2" },
            { label: "2:3", value: "2:3" },
          ],
          defaultRatio: "1:1",
        },
        outputFormat: {
          supported: true,
          options: [
            { label: "PNG", value: "png" },
            { label: "JPEG", value: "jpeg" },
            { label: "WebP", value: "webp" },
          ],
          default: "png",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Reve Image 参数规则",
  },

  // === Krea Image ===
  {
    id: "media-params-krea-image",
    matchType: "modelPrefix",
    matchValue: "krea-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "3:2", value: "3:2" },
            { label: "2:3", value: "2:3" },
          ],
          defaultRatio: "1:1",
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Krea 图像生成参数规则",
  },

  // === HiDream ===
  {
    id: "media-params-hidream",
    matchType: "modelPrefix",
    matchValue: "hidream",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "9:16 (768×1344)", value: "768x1344" },
            { label: "4:3 (1152×896)", value: "1152x896" },
            { label: "3:4 (896×1152)", value: "896x1152" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: true },
        steps: { supported: true, min: 1, max: 50, default: 28 },
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
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "HiDream 图像生成参数规则",
  },

  // === Leonardo AI Lucid ===
  {
    id: "media-params-leonardo-lucid",
    matchType: "modelPrefix",
    matchValue: "lucid-",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "free",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "9:16 (768×1344)", value: "768x1344" },
            { label: "4:3 (1152×896)", value: "1152x896" },
            { label: "3:4 (896×1152)", value: "896x1152" },
          ],
          constraints: {
            maxWidth: 1536,
            maxHeight: 1536,
            stepSize: 8,
          },
          default: "1024x1024",
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: 0, max: 2147483647 },
        steps: { supported: true, min: 1, max: 60, default: 30 },
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
        batchSize: { supported: true, min: 1, max: 8, default: 1 },
      },
    },
    priority: 15,
    enabled: true,
    description: "Leonardo AI Lucid 参数规则",
  },

  // === Runway Gen Image ===
  {
    id: "media-params-runway-gen-image",
    matchType: "modelPrefix",
    matchValue: "runway-gen",
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "1:1", value: "1:1" },
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
          ],
          defaultRatio: "16:9",
        },
        negativePrompt: { supported: false },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "Runway Gen 图像参数规则",
  },

  // === NVIDIA Cosmos Text-to-Image ===
  {
    id: "media-params-nvidia-cosmos-image",
    matchType: "modelPrefix",
    matchValue: "cosmos\\d.*text2image",
    useRegex: true,
    properties: {
      capabilities: { imageGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "1:1 (1024×1024)", value: "1024x1024" },
            { label: "16:9 (1344×768)", value: "1344x768" },
            { label: "9:16 (768×1344)", value: "768x1344" },
          ],
          default: "1024x1024",
        },
        negativePrompt: { supported: false },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        background: { supported: false },
        batchSize: { supported: false },
      },
    },
    priority: 15,
    enabled: true,
    description: "NVIDIA Cosmos Text-to-Image 参数规则",
  },

  // === FLUX 系列（SiliconFlow 等 OpenAI 兼容代理） ===
  {
    id: "media-params-flux",
    matchType: "modelPrefix",
    matchValue: "flux",
    properties: {
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
    matchValue: "gemini-3-pro-image|nano-banana-pro",
    useRegex: true,
    properties: {
      capabilities: { imageGeneration: true },
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
      capabilities: { imageGeneration: true },
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
