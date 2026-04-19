import type { LlmModelInfo } from "@/types/llm-profiles";
import { parseOpenAiModelsResponse } from "../openai/utils";

/**
 * 解析硅基流动风格的模型列表响应
 * 硅基流动的响应在标准 OpenAI 格式基础上增加了价格范围、上下文范围等字段
 */
export function parseSiliconFlowModelsResponse(data: any): LlmModelInfo[] {
  // 首先尝试使用标准的 OpenAI 解析逻辑作为基础
  const models = parseOpenAiModelsResponse(data);

  // 如果响应中包含硅基流动的增强字段，则进行补充解析
  if (data.data && Array.isArray(data.data)) {
    for (const modelData of data.data) {
      const model = models.find((m) => m.id === modelData.id);
      if (!model) continue;

      // 1. 解析价格范围
      if (modelData.price) {
        model.pricing = {
          ...model.pricing,
          inputPriceRange: modelData.price.input_price_range,
          outputPriceRange: modelData.price.output_price_range,
        };

        // 如果没有标准定价，尝试用范围的最小值填充
        if (!model.pricing.prompt && modelData.price.input_price_range) {
          model.pricing.prompt = String(modelData.price.input_price_range[0]);
        }
        if (!model.pricing.completion && modelData.price.output_price_range) {
          model.pricing.completion = String(modelData.price.output_price_range[0]);
        }
      }

      // 2. 解析上下文范围
      if (modelData.context_length_range) {
        model.tokenLimits = {
          ...model.tokenLimits,
          contextLengthRange: modelData.context_length_range,
        };

        // 如果没有标准上下文长度，尝试用范围的最大值填充
        if (!model.tokenLimits.contextLength && modelData.context_length_range) {
          model.tokenLimits.contextLength = modelData.context_length_range[1];
        }
      }

      // 3. 处理模型类型
      if (modelData.model_type) {
        model.architecture = {
          ...model.architecture,
          modality: modelData.model_type,
        };
        
        // 如果是 VLM 类型，自动开启 vision 能力
        if (modelData.model_type === 'vlm') {
          model.capabilities = {
            ...model.capabilities,
            vision: true
          };
        }
      }
      
      // 4. 设置提供商信息
      model.provider = "siliconflow";
    }
  }

  return models;
}