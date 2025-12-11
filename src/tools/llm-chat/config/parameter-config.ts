import type { LlmParameters } from "../types";
import type { LlmParameterSupport, ModelCapabilities } from "@/types/llm-profiles";

/**
 * 所有支持发送给 LLM 的参数键列表（白名单）
 * 用于过滤掉内部状态字段（如 enabledParameters, contextManagement 等）
 */
export const ALL_LLM_PARAMETER_KEYS = [
  // 基础采样参数
  "temperature",
  "maxTokens",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "seed",
  "stop",
  // 高级参数
  "n",
  "logprobs",
  "topLogprobs",
  "maxCompletionTokens",
  "logitBias",
  "store",
  "user",
  "serviceTier",
  // 响应格式
  "responseFormat",
  // 工具调用
  "tools",
  "toolChoice",
  "parallelToolCalls",
  // 多模态输出
  "modalities",
  "audio",
  "prediction",
  // 特殊功能
  "webSearchOptions",
  "streamOptions",
  "metadata",
  "stopSequences",
  "claudeMetadata",
  // 思考能力相关
  "thinkingEnabled",
  "thinkingBudget",
  "reasoningEffort",
  "includeThoughts",
  // Gemini 特有参数
  "safetySettings",
] as const;

export type ParameterType = "slider" | "switch" | "select" | "number" | "text";

export interface ParameterConfig {
  key: keyof LlmParameters;
  label: string;
  type: ParameterType;
  description: string;
  group: "basic" | "advanced" | "special";
  supportedKey: keyof LlmParameterSupport; // 用于判断是否显示

  // Slider/Number specific
  min?: number;
  max?: number;
  step?: number;
  precision?: number;

  // Select specific
  options?: { label: string; value: any }[];

  // Default value for reset
  defaultValue?: any;

  // Transform functions (optional)
  format?: (val: any) => any;
  parse?: (val: any) => any;

  // Placeholder for text/number input
  placeholder?: string;

  // Suggestions for number/slider input
  suggestions?: { label: string; value: number }[];
}

export const parameterConfigs: ParameterConfig[] = [
  // --- Basic Parameters ---
  {
    key: "temperature",
    label: "Temperature",
    type: "slider",
    description: "控制输出的随机性（0-2）。值越高，输出越随机；值越低，输出越确定。",
    group: "basic",
    supportedKey: "temperature",
    min: 0,
    max: 2,
    step: 0.01,
    precision: 2,
    defaultValue: 1,
  },
  {
    key: "maxTokens",
    label: "Max Tokens",
    type: "slider",
    description: "单次响应的最大 token 数量。",
    group: "basic",
    supportedKey: "maxTokens",
    min: 0,
    // max will be dynamic based on model context limit
    step: 256,
    defaultValue: 4096,
    suggestions: [
      { label: "4K", value: 4096 },
      { label: "8K", value: 8192 },
      { label: "16K", value: 16384 },
      { label: "32K", value: 32768 },
      { label: "64K", value: 65536 },
      { label: "128K", value: 131072 },
    ],
  },
  {
    key: "topP",
    label: "Top P",
    type: "slider",
    description: "核采样概率（0-1）。控制候选词的多样性。",
    group: "basic",
    supportedKey: "topP",
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
    defaultValue: 1,
  },
  {
    key: "topK",
    label: "Top K",
    type: "slider",
    description: "保留概率最高的 K 个候选词。",
    group: "basic",
    supportedKey: "topK",
    min: 1,
    max: 100,
    step: 1,
    defaultValue: 40,
  },
  {
    key: "frequencyPenalty",
    label: "Frequency Penalty",
    type: "slider",
    description: "降低重复词汇的出现频率（-2.0 到 2.0）。",
    group: "basic",
    supportedKey: "frequencyPenalty",
    min: -2,
    max: 2,
    step: 0.01,
    precision: 2,
    defaultValue: 0,
  },
  {
    key: "presencePenalty",
    label: "Presence Penalty",
    type: "slider",
    description: "鼓励模型谈论新话题（-2.0 到 2.0）。",
    group: "basic",
    supportedKey: "presencePenalty",
    min: -2,
    max: 2,
    step: 0.01,
    precision: 2,
    defaultValue: 0,
  },

  // --- Advanced Parameters ---
  {
    key: "seed",
    label: "Seed",
    type: "number",
    description: "随机种子，用于确定性采样。设置相同的种子可以获得相同的输出。",
    group: "advanced",
    supportedKey: "seed",
    placeholder: "随机",
    defaultValue: undefined,
  },
  {
    key: "stop",
    label: "Stop Sequences",
    type: "text",
    description: "停止序列，模型遇到这些文本时会停止生成。",
    group: "advanced",
    supportedKey: "stop",
    placeholder: "用逗号分隔多个序列",
    defaultValue: undefined,
    // format array to string for display
    format: (val: string[] | string | undefined) => {
      if (Array.isArray(val)) return val.join(", ");
      return val || "";
    },
    // parse string back to array
    parse: (val: string) => val ? val.split(",").map(s => s.trim()) : undefined
  },
  {
    key: "maxCompletionTokens",
    label: "Max Completion Tokens",
    type: "slider",
    description: "补全中可生成的最大标记数。优先级高于 Max Tokens。",
    group: "advanced",
    supportedKey: "maxCompletionTokens",
    min: 1,
    max: 128000,
    step: 64,
    placeholder: "默认",
    defaultValue: undefined,
  },
  {
    key: "logprobs",
    label: "Logprobs",
    type: "switch",
    description: "是否返回 logprobs（对数概率）。",
    group: "advanced",
    supportedKey: "logprobs",
    defaultValue: false,
  },
  {
    key: "topLogprobs",
    label: "Top Logprobs",
    type: "slider",
    description: "返回的 top logprobs 数量（0-20）。",
    group: "advanced",
    supportedKey: "topLogprobs",
    min: 0,
    max: 20,
    step: 1,
    defaultValue: 0,
  },

  // --- Special Features ---
  // 思考能力相关参数：
  // - 所有思考相关参数都使用 supportedKey: "thinking"，由 Provider 层面控制是否显示整个区域
  // - 具体显示哪个控件由 Model 的 capabilities.thinkingConfigType 决定
  {
    key: "thinkingEnabled",
    label: "启用思考",
    type: "switch",
    description: "启用模型的思考/推理能力。",
    group: "special",
    supportedKey: "thinking",
    defaultValue: false,
  },
  {
    key: "thinkingBudget",
    label: "思考预算",
    type: "slider",
    description: "为思考过程分配的 Token 预算。",
    group: "special",
    supportedKey: "thinking", // 使用 thinking，由 thinkingConfigType 决定是否显示
    min: 1000,
    max: 32000,
    step: 1000,
    defaultValue: 8000,
  },
  {
    key: "reasoningEffort",
    label: "推理等级",
    type: "select",
    description: "设置模型的推理/思考等级。",
    group: "special",
    supportedKey: "thinking", // 使用 thinking，由 thinkingConfigType 决定是否显示
    defaultValue: "",
    options: [], // 选项将由 ModelParametersEditor 动态提供
  },
  {
    key: "includeThoughts",
    label: "包含思考摘要",
    type: "switch",
    description: "是否在响应中包含思考摘要（Gemini）。启用后，模型会返回思考过程。",
    group: "special",
    supportedKey: "thinkingConfig", // 使用 thinkingConfig，因为这是 Gemini 特有的配置
    defaultValue: false,
  },
];

/**
 * 判断参数是否被目标模型支持
 * 复用 ModelParametersEditor.vue 中的 shouldShowParameter 逻辑
 */
export function isParameterSupportedByModel(
  key: keyof LlmParameters,
  supportedParameters: LlmParameterSupport,
  capabilities?: ModelCapabilities
): boolean {
  const config = parameterConfigs.find((c) => c.key === key);
  if (!config) {
    // 对于不在配置列表中的参数（如 custom, contextManagement 等），保留
    return true;
  }

  // 对于思考相关的参数，直接根据模型自身 capabilities 判断
  if (config.supportedKey === "thinking") {
    const thinkingType = capabilities?.thinkingConfigType ?? "none";
    switch (key) {
      case "thinkingEnabled":
        return thinkingType === "switch" || thinkingType === "budget";
      case "thinkingBudget":
        return thinkingType === "budget";
      case "reasoningEffort":
        return thinkingType === "effort";
      default:
        return false;
    }
  }

  // 对于 includeThoughts，需要检查 thinkingConfig 支持
  if (key === "includeThoughts") {
    // 只有支持 thinkingConfig 的 provider 才显示此参数
    return supportedParameters.thinkingConfig === true;
  }

  // 对于其他参数，检查 provider 是否支持
  return supportedParameters[config.supportedKey] === true;
}

/**
 * 过滤参数，只保留目标模型支持的参数
 * 用于 @ 切换模型重新生成等场景
 *
 * @param parameters 原始参数
 * @param supportedParameters 目标 provider 支持的参数
 * @param capabilities 目标模型的能力
 * @returns 过滤后的参数
 */
export function filterParametersForModel(
  parameters: LlmParameters,
  supportedParameters: LlmParameterSupport,
  capabilities?: ModelCapabilities
): LlmParameters {
  const filteredParams: LlmParameters = {};

  // 遍历原始参数
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined) continue;

    // 特殊处理的字段，始终保留
    if (
      key === "custom" ||
      key === "enabledParameters" ||
      key === "contextManagement" ||
      key === "contextPostProcessing"
    ) {
      (filteredParams as any)[key] = value;
      continue;
    }

    // 检查参数是否被目标模型支持
    if (isParameterSupportedByModel(key as keyof LlmParameters, supportedParameters, capabilities)) {
      (filteredParams as any)[key] = value;
    }
  }

  // 更新 enabledParameters 列表，只保留支持的参数
  if (filteredParams.enabledParameters) {
    filteredParams.enabledParameters = filteredParams.enabledParameters.filter((paramKey) =>
      isParameterSupportedByModel(paramKey as keyof LlmParameters, supportedParameters, capabilities)
    );
  }

  return filteredParams;
}