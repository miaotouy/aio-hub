/**
 * 国际其他模型前缀匹配规则
 *
 * 包括 xAI (Grok)、Meta (Llama)、Mistral、Cohere、AI21、Microsoft (Phi)、
 * Stability AI、BAAI、Black Forest Labs (FLUX) 等。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const internationalModelRules: ModelMetadataRule[] = [
  // === xAI 系列模型 ===
  {
    id: "model-prefix-grok",
    matchType: "modelPrefix",
    matchValue: "grok-",
    properties: {
      icon: `/model-icons/grok.svg`,
      group: "xAI",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Grok 系列模型图标",
  },
  {
    id: "model-prefix-imagine",
    matchType: "modelPrefix",
    matchValue: "imagine-",
    properties: {
      icon: `/model-icons/xai.svg`,
      group: "xAI",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "xAI Imagine 系列模型图标",
  },
  {
    id: "model-grok-image",
    matchType: "modelPrefix",
    matchValue: "grok-.*image",
    useRegex: true,
    properties: {
      icon: `/model-icons/grok.svg`,
      group: "xAI",
      capabilities: {
        imageGeneration: true,
      },
      description: "Grok 图像生成与编辑模型",
    },
    priority: 30,
    enabled: true,
    description: "模型正则 grok-.*image 元数据规则",
  },

  // === Meta 系列模型 ===
  {
    id: "model-prefix-llama3_2",
    matchType: "modelPrefix",
    matchValue: "llama-?3[._-]?2",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "Llama 3.2 系列模型",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 llama-?3[._-]?2 元数据规则",
  },
  {
    id: "model-prefix-llama",
    matchType: "modelPrefix",
    matchValue: "(?<!o)llama[1-9-]",
    useRegex: true,
    properties: {
      icon: `/model-icons/meta-color.svg`,
      group: "Meta",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
      description: "Llama 系列模型",
    },
    priority: 20,
    enabled: true,
    description: "模型正则 (?<!o)llama[1-9-] 元数据规则",
  },

  // === Mistral 系列模型 ===
  {
    id: "model-prefix-mistral",
    matchType: "modelPrefix",
    matchValue: "mistral-",
    properties: {
      icon: `/model-icons/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Mistral 系列模型图标",
  },
  {
    id: "model-prefix-mixtral",
    matchType: "modelPrefix",
    matchValue: "mixtral-",
    properties: {
      icon: `/model-icons/mistral-color.svg`,
      group: "Mistral",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Mixtral 系列模型图标",
  },

  // === Cohere 系列模型 ===
  {
    id: "model-prefix-command",
    matchType: "modelPrefix",
    matchValue: "command-",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Command 系列模型图标",
  },
  {
    id: "model-prefix-aya",
    matchType: "modelPrefix",
    matchValue: "aya-",
    properties: {
      icon: `/model-icons/cohere-color.svg`,
      group: "Cohere",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Aya 系列模型图标",
  },

  // === AI21 系列模型 ===
  {
    id: "model-prefix-jamba",
    matchType: "modelPrefix",
    matchValue: "jamba-",
    properties: {
      icon: `/model-icons/aionlabs-color.svg`,
      group: "AI21",
      tokenizer: "llama3_2",
      defaultPostProcessingRules: [
        "convert-system-to-user",
        "merge-consecutive-roles",
      ],
    },
    priority: 20,
    enabled: true,
    description: "Jamba 系列模型图标",
  },

  // === Microsoft 系列模型 ===
  {
    id: "model-prefix-microsoft",
    matchType: "modelPrefix",
    matchValue: "microsoft",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
    },
    priority: 15,
    enabled: true,
    description: "Microsoft 系列模型（通过 ID 匹配）",
  },
  {
    id: "model-prefix-phi",
    matchType: "modelPrefix",
    matchValue: "phi-",
    properties: {
      icon: `/model-icons/microsoft-color.svg`,
      group: "Microsoft",
      tokenizer: "gpt4",
    },
    priority: 20,
    enabled: true,
    description: "Phi 系列模型图标",
  },

  // === Stability AI 系列模型 ===
  {
    id: "model-prefix-stable-diffusion",
    matchType: "modelPrefix",
    matchValue: "stable-diffusion",
    properties: {
      icon: `/model-icons/stability-color.svg`,
      group: "Stability AI",
    },
    priority: 20,
    enabled: true,
    description: "Stable Diffusion 系列模型图标",
  },

  // === BAAI 系列模型 ===
  {
    id: "model-prefix-bge",
    matchType: "modelPrefix",
    matchValue: "bge-",
    properties: {
      icon: `/model-icons/baai.svg`,
      group: "BAAI",
    },
    priority: 20,
    enabled: true,
    description: "BAAI BGE 系列模型图标",
  },

  // === Black Forest Labs 系列模型 ===
  {
    id: "model-prefix-flux",
    matchType: "modelPrefix",
    matchValue: "flux",
    properties: {
      icon: `/model-icons/flux.svg`,
      group: "Black Forest Labs",
    },
    priority: 20,
    enabled: true,
    description: "FLUX 系列模型图标",
  },
];
