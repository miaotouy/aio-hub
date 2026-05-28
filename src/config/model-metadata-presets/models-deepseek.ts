/**
 * DeepSeek 系列模型前缀匹配规则
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const deepseekModelRules: ModelMetadataRule[] = [
  {
    id: "model-deepseek-v4-pro",
    matchType: "model",
    matchValue: "deepseek-v4-pro",
    properties: {
      contextLength: 1024000,
      maxOutputTokens: 384000,
      pricing: {
        input: 12.0,
        output: 24.0,
        cacheHitInput: 1.0,
      },
      description: "DeepSeek V4 Pro 模型详情",
    },
    priority: 30,
    enabled: true,
    description: "模型 deepseek-v4-pro 元数据规则",
  },
  {
    id: "model-deepseek-v4-flash",
    matchType: "model",
    matchValue: "deepseek-v4-flash",
    properties: {
      contextLength: 1024000,
      maxOutputTokens: 384000,
      pricing: {
        input: 1.0,
        output: 2.0,
        cacheHitInput: 0.2,
      },
      description: "DeepSeek V4 Flash 模型详情",
    },
    priority: 30,
    enabled: true,
    description: "模型 deepseek-v4-flash 元数据规则",
  },
  {
    id: "model-deepseek-deprecated",
    matchType: "model",
    matchValue: "deepseek-chat|deepseek-reasoner",
    properties: {
      deprecated: true,
    },
    priority: 30,
    enabled: true,
    description: "标注已废弃的旧版 DeepSeek 模型名",
  },
  {
    id: "model-prefix-deepseek",
    matchType: "modelPrefix",
    matchValue: "deepseek-",
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      group: "DeepSeek",
      tokenizer: "deepseek_v3", // DeepSeek 系列使用专用分词器
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["high", "max"],
        fim: true, // DeepSeek 支持 FIM 补全（通过 /beta 端点）
        prefixCompletion: true, // DeepSeek 支持对话前缀续写（通过 /beta 端点）
        jsonOutput: true, // DeepSeek 支持 JSON 输出模式
        toolUse: true,
      },
      description: "DeepSeek 系列模型（支持推理、FIM、续写和 JSON 输出）",
    },
    priority: 25, // 提升优先级
    enabled: true,
    description: "模型前缀 deepseek- 元数据规则",
  },
];
