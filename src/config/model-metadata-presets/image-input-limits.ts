/**
 * 图片输入尺寸限制预设规则
 *
 * 定义各模型系列对输入图片的最大尺寸限制。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const imageInputLimitRules: ModelMetadataRule[] = [
  {
    id: "max-image-dim-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen3|qwq-|qvq-",
    useRegex: true,
    properties: {
      capabilities: {
        maxImageDimension: 2048,
      },
    },
    priority: 20,
    enabled: true,
    description: "Qwen 系列模型图片输入尺寸限制 2048×2048",
  },
  {
    id: "max-image-dim-openai-vision",
    matchType: "modelPrefix",
    matchValue: "gpt-4o|gpt-4\\.1|gpt-5|o[134]",
    useRegex: true,
    properties: {
      capabilities: {
        maxImageDimension: 2048,
      },
    },
    priority: 20,
    enabled: true,
    description: "OpenAI 视觉模型图片输入尺寸限制 2048×2048",
  },
  {
    id: "max-image-dim-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    properties: {
      capabilities: {
        maxImageDimension: 8000,
      },
    },
    priority: 20,
    enabled: true,
    description: "Claude 系列模型图片输入尺寸限制 8000px",
  },
  {
    id: "max-image-dim-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    properties: {
      capabilities: {
        maxImageDimension: 8192,
      },
    },
    priority: 20,
    enabled: true,
    description: "Gemini 系列模型图片输入尺寸限制 8192px",
  },
];
