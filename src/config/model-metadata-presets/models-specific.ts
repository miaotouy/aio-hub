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
 * 特定模型匹配规则 (优先级 30+)
 *
 * 包括 DALL-E、Whisper、TTS、Codex、Sora、Kling、Veo、Midjourney、
 * FLUX、Stable Diffusion、Luma、Suno 等专用模型。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const specificModelRules: ModelMetadataRule[] = [
  // === OpenAI 专用模型 ===
  {
    id: "model-dall-e",
    matchType: "modelPrefix",
    matchValue: "dall-e",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      capabilities: {
        imageGeneration: true,
        vision: true,
        iterativeRefinement: false, // DALL-E 原生 API 不支持多轮对话上下文
      },
      description: "DALL·E 图像生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 dall-e 元数据规则",
  },
  {
    id: "model-whisper",
    matchType: "modelPrefix",
    matchValue: "whisper",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      description: "Whisper 语音识别模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 whisper 元数据规则",
  },
  {
    id: "model-tts",
    matchType: "modelPrefix",
    matchValue: "tts-",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      capabilities: {
        audioGeneration: true,
      },
      description: "TTS 文本转语音模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 tts- 元数据规则",
  },
  {
    id: "model-openai-tts-mini",
    matchType: "modelPrefix",
    matchValue: "gpt-4o-mini-tts",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      capabilities: {
        audioGeneration: true,
      },
      description: "GPT-4o mini TTS 语音生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 gpt-4o-mini-tts 元数据规则",
  },
  {
    id: "model-text-moderation",
    matchType: "modelPrefix",
    matchValue: "text-moderation|omni-moderation",
    useRegex: true,
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      description: "内容审核模型",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 text-moderation|omni-moderation 元数据规则",
  },
  {
    id: "model-codex",
    matchType: "modelPrefix",
    matchValue: "codex|gpt-5.*codex",
    useRegex: true,
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI Codex",
      tokenizer: "gpt4o",
      capabilities: {
        toolUse: true,
      },
      description: "Codex 代码模型系列（包括 GPT-5 Codex 变体）",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 codex|gpt-5.*codex 元数据规则",
  },
  {
    id: "model-babbage",
    matchType: "modelPrefix",
    matchValue: "babbage",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
    description: "Babbage 系列模型（已弃用）",
  },
  {
    id: "model-davinci",
    matchType: "modelPrefix",
    matchValue: "davinci",
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
    },
    priority: 10,
    enabled: true,
    description: "Davinci 系列模型（已弃用）",
  },

  // === OpenAI GPT Image 图像生成 ===
  {
    id: "model-gpt-image-specific",
    matchType: "modelPrefix",
    matchValue: "gpt-image-|chatgpt-image-",
    useRegex: true,
    properties: {
      icon: `/model-icons/openai.svg`,
      group: "OpenAI",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description:
        "GPT Image 系列图像生成模型（支持编辑与参考图迭代；多轮上下文需走 Responses/Chat 类路由）",
    },
    priority: 35,
    enabled: true,
    description: "模型正则 gpt-image-|chatgpt-image- 元数据规则",
  },

  // === OpenAI Sora 视频生成 ===
  {
    id: "model-sora",
    matchType: "modelPrefix",
    matchValue: "sora",
    properties: {
      icon: `/model-icons/sora-color.svg`,
      group: "OpenAI",
      capabilities: {
        videoGeneration: true,
        iterativeRefinement: false,
      },
      description: "Sora 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 sora 元数据规则",
  },

  // === 快手可灵视频生成 ===
  {
    id: "model-kling",
    matchType: "modelPrefix",
    matchValue: "kling",
    properties: {
      icon: `/model-icons/kling-color.svg`,
      group: "Kwai",
      capabilities: {
        videoGeneration: true,
        iterativeRefinement: false,
      },
    },
    priority: 30,
    enabled: true,
    description: "可灵视频生成模型图标",
  },

  // === Google Veo 视频生成 ===
  {
    id: "model-veo",
    matchType: "modelPrefix",
    matchValue: "veo",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini",
      capabilities: {
        videoGeneration: true,
      },
      description: "Veo 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 veo 元数据规则",
  },

  // === Google Nano Banana (Gemini 2.5 Flash Image) ===
  {
    id: "model-gemini-image-nano",
    matchType: "modelPrefix",
    matchValue: "gemini-2.5-flash-image",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description: "Gemini 2.5 Flash Image (Nano Banana)",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 gemini-2.5-flash-image 元数据规则",
  },

  // === Google Gemini 3 Pro Image ===
  {
    id: "model-gemini-image-pro",
    matchType: "modelPrefix",
    matchValue: "gemini-3-pro-image",
    properties: {
      icon: `/model-icons/gemini-color.svg`,
      group: "Gemini",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description: "Gemini 3 Pro Image (Professional Asset Production)",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 gemini-3-pro-image 元数据规则",
  },
  {
    id: "model-imagen",
    matchType: "modelPrefix",
    matchValue: "imagen-",
    properties: {
      icon: `/model-icons/google-color.svg`,
      group: "Google Imagen",
      capabilities: {
        imageGeneration: true,
      },
      description: "Google Imagen 系列图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 imagen- 元数据规则",
  },
  {
    id: "model-mai-image",
    matchType: "modelPrefix",
    matchValue: "mai-image",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft AI",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Microsoft AI MAI Image 系列图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 mai-image 元数据规则",
  },

  // === 硅基流动 Qwen Image Edit ===
  {
    id: "model-qwen-image-edit",
    matchType: "modelPrefix",
    matchValue: "Qwen/Qwen-Image-Edit",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description: "Qwen Image Edit 图像编辑模型（支持迭代修改）",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 Qwen/Qwen-Image-Edit 元数据规则",
  },

  // === Suno 音乐生成 ===
  {
    id: "model-suno",
    matchType: "modelPrefix",
    matchValue: "suno",
    properties: {
      icon: `/model-icons/suno.svg`,
      group: "Suno (NewAPI)",
      capabilities: {
        musicGeneration: true,
      },
    },
    priority: 30,
    enabled: true,
    description: "Suno 音乐生成模型图标",
  },

  // === Midjourney 系列模型 ===
  {
    id: "model-midjourney",
    matchType: "modelPrefix",
    matchValue: "midjourney|mj",
    useRegex: true,
    properties: {
      icon: `/model-icons/midjourney.svg`,
      group: "Midjourney",
      capabilities: {
        imageGeneration: true,
        vision: true,
        iterativeRefinement: true,
      },
      description: "Midjourney 系列模型（支持迭代微调）",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 midjourney|mj 元数据规则",
  },

  // === FLUX 系列 (Black Forest Labs) ===
  {
    id: "model-flux-specific",
    matchType: "modelPrefix",
    matchValue: "flux",
    properties: {
      icon: `/model-icons/flux.svg`,
      group: "Black Forest Labs",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: false,
      },
      description: "FLUX 系列图像生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 flux 元数据规则",
  },

  // === Stable Diffusion 系列 ===
  {
    id: "model-stable-diffusion-specific",
    matchType: "modelPrefix",
    matchValue: "stable-diffusion|sdxl|sd3",
    useRegex: true,
    properties: {
      icon: `/model-icons/stability-color.svg`,
      group: "Stability AI",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description: "Stable Diffusion 系列图像生成模型（支持迭代修改）",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 stable-diffusion|sdxl|sd3 元数据规则",
  },

  // === Luma Dream Machine ===
  {
    id: "model-luma-dream-machine",
    matchType: "modelPrefix",
    matchValue: "luma-dream-machine",
    properties: {
      icon: `/model-icons/luma.svg`,
      group: "Luma AI",
      capabilities: {
        videoGeneration: true,
      },
      description: "Luma Dream Machine 视频生成模型",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 luma-dream-machine 元数据规则",
  },
  {
    id: "model-luma-image",
    matchType: "modelPrefix",
    matchValue: "uni-|photon",
    useRegex: true,
    properties: {
      icon: `/model-icons/luma-color.svg`,
      group: "Luma AI",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Luma AI 图像生成模型（Uni / Photon 系列）",
    },
    priority: 35,
    enabled: true,
    description: "模型正则 uni-|photon 元数据规则",
  },

  // === 其他图像生成榜单模型 ===
  {
    id: "model-reve-image",
    matchType: "modelPrefix",
    matchValue: "reve-",
    properties: {
      icon: `/model-icons/reve.svg`,
      group: "Reve",
      capabilities: {
        imageGeneration: true,
        vision: true,
        iterativeRefinement: true,
      },
      description: "Reve 图像生成模型系列",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 reve- 元数据规则",
  },
  {
    id: "model-ideogram",
    matchType: "modelPrefix",
    matchValue: "ideogram-",
    properties: {
      icon: `/model-icons/ideogram.svg`,
      group: "Ideogram",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Ideogram 图像生成模型系列",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 ideogram- 元数据规则",
  },
  {
    id: "model-recraft",
    matchType: "modelPrefix",
    matchValue: "recraft-",
    properties: {
      icon: `/model-icons/recraft.svg`,
      group: "Recraft",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Recraft 图像生成模型系列",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 recraft- 元数据规则",
  },
  {
    id: "model-krea",
    matchType: "modelPrefix",
    matchValue: "krea-",
    properties: {
      icon: `/model-icons/krea.svg`,
      group: "Krea",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Krea 图像生成模型系列",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 krea- 元数据规则",
  },
  {
    id: "model-bytedance-image",
    matchType: "modelPrefix",
    matchValue: "seedream-|bagel",
    useRegex: true,
    properties: {
      icon: `/model-icons/bytedance-color.svg`,
      group: "ByteDance",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "字节跳动 Seedream / BAGEL 图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型正则 seedream-|bagel 元数据规则",
  },
  {
    id: "model-runway-image",
    matchType: "modelPrefix",
    matchValue: "runway-gen",
    properties: {
      icon: `/model-icons/runway.svg`,
      group: "Runway",
      capabilities: {
        imageGeneration: true,
        videoGeneration: true,
        vision: true,
      },
      description: "Runway Gen 系列媒体生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 runway-gen 元数据规则",
  },
  {
    id: "model-pruna-image",
    matchType: "modelPrefix",
    matchValue: "p-image",
    properties: {
      icon: `/model-icons/prunaai-color.svg`,
      group: "Pruna",
      capabilities: {
        imageGeneration: true,
      },
      description: "Pruna P-Image 图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 p-image 元数据规则",
  },
  {
    id: "model-hidream-image",
    matchType: "modelPrefix",
    matchValue: "hidream",
    properties: {
      group: "HiDream",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "HiDream 图像生成模型系列",
    },
    priority: 36,
    enabled: true,
    exclusive: true,
    description: "模型前缀 hidream 元数据规则",
  },
  {
    id: "model-leonardo-lucid",
    matchType: "modelPrefix",
    matchValue: "lucid-",
    properties: {
      group: "Leonardo AI",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "Leonardo AI Lucid 图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 lucid- 元数据规则",
  },
  {
    id: "model-nvidia-cosmos-image",
    matchType: "modelPrefix",
    matchValue: "cosmos\\d.*text2image",
    useRegex: true,
    properties: {
      icon: `/model-icons/nvidia-color.svg`,
      group: "NVIDIA",
      capabilities: {
        imageGeneration: true,
      },
      description: "NVIDIA Cosmos Text-to-Image 系列模型",
    },
    priority: 35,
    enabled: true,
    description: "模型正则 cosmos\\d.*text2image 元数据规则",
  },
  {
    id: "model-hunyuan-image",
    matchType: "modelPrefix",
    matchValue: "hunyuan-image",
    properties: {
      icon: `/model-icons/hunyuan-color.svg`,
      group: "Tencent",
      capabilities: {
        imageGeneration: true,
        vision: true,
      },
      description: "腾讯混元图像生成模型系列",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 hunyuan-image 元数据规则",
  },

  // === 通义千问 Qwen Image Edit 官方图片编辑系列 ===
  {
    id: "model-qwen-image-edit-official",
    matchType: "modelPrefix",
    matchValue: "qwen-image-edit",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: true,
      },
      description:
        "Qwen Image Edit 官方图片编辑系列（qwen-image-edit-max / qwen-image-edit-plus，支持迭代修改）",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 qwen-image-edit 元数据规则",
  },

  // === 通义千问 Qwen Image 官方图片生成系列 ===
  {
    id: "model-qwen-image-official",
    matchType: "modelPrefix",
    matchValue: "qwen-image",
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Qwen",
      capabilities: {
        imageGeneration: true,
      },
      description:
        "Qwen Image 官方图片生成系列（qwen-image-2.0 / qwen-image-max / qwen-image-plus）",
    },
    priority: 30,
    enabled: true,
    description: "模型前缀 qwen-image 元数据规则",
  },

  // === 造相 Z-Image 图像生成系列 ===
  {
    id: "model-z-image",
    matchType: "modelPrefix",
    matchValue: "z[-_\\s]?image|造相\\s*Z",
    useRegex: true,
    properties: {
      icon: `/model-icons/qwen-color.svg`,
      group: "Z-Image",
      capabilities: {
        imageGeneration: true,
        iterativeRefinement: false,
      },
      description:
        "造相 Z-Image 图像生成系列（Tongyi-MAI 开源文生图模型家族，含 Z-Image-Turbo）",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 z[-_\\s]?image|造相\\s*Z 元数据规则",
  },
  {
    id: "model-glm-image-zai",
    matchType: "modelPrefix",
    matchValue: "glm-image",
    properties: {
      icon: `/model-icons/zai.svg`,
      group: "Z AI",
      capabilities: {
        imageGeneration: true,
      },
      description: "Z.AI GLM-Image 图像生成模型",
    },
    priority: 35,
    enabled: true,
    description: "模型前缀 glm-image 元数据规则",
  },
];
