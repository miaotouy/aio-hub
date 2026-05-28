/**
 * Anthropic (Claude) 系列模型前缀匹配规则
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const anthropicModelRules: ModelMetadataRule[] = [
  {
    id: "model-prefix-claude-4",
    matchType: "modelPrefix",
    matchValue: "claude-(?:sonnet|opus)-4",
    useRegex: true,
    properties: {
      icon: `/model-icons/claude-color.svg`,
      group: "Claude 4",
      tokenizer: "claude",
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        document: true,
      },
      description:
        "Claude 4 系列模型（Sonnet 4 / Opus 4，原生支持视觉与深度思考）",
    },
    priority: 25,
    enabled: true,
    description: "模型正则 claude-(?:sonnet|opus)-4 元数据规则",
  },
  {
    id: "model-prefix-claude-3-7",
    matchType: "modelPrefix",
    matchValue: "claude-3-7",
    properties: {
      icon: `/model-icons/claude-color.svg`,
      group: "Claude 3.7",
      tokenizer: "claude",
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        document: true,
      },
      deprecated: true,
      retirementDate: "2026-02-19",
      description: "Claude 3.7 系列模型（已退役）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 claude-3-7 元数据规则",
  },
  {
    id: "model-prefix-claude-3-5",
    matchType: "modelPrefix",
    matchValue: "claude-3-5",
    properties: {
      icon: `/model-icons/claude-color.svg`,
      group: "Claude 3.5",
      tokenizer: "claude",
      capabilities: {
        vision: true,
        toolUse: true,
        document: true,
      },
      deprecated: true,
      retirementDate: "2026-02-19",
      description: "Claude 3.5 系列模型（已退役）",
    },
    priority: 25,
    enabled: true,
    description: "模型前缀 claude-3-5 元数据规则",
  },
  {
    id: "model-prefix-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    properties: {
      icon: `/model-icons/claude-color.svg`,
      group: "Claude",
      tokenizer: "claude", // Claude 系列使用专用分词器
      capabilities: {
        vision: true,
        thinking: true,
        toolUse: true,
        document: true, // 支持 PDF 文档（通过 document 类型 + base64）
        visionTokenCost: {
          calculationMethod: "claude_3",
          parameters: {
            costPerImage: 1000, // 预估值，实际由 API 返回
          },
        },
        documentTokenCost: {
          calculationMethod: "dynamic", // Claude API 会返回实际 token 消耗
        },
      },
      description: "Claude 系列模型（支持视觉、思考模式、工具调用和文档处理）",
    },
    priority: 20,
    enabled: true,
    description: "模型前缀 claude- 元数据规则",
  },
];
