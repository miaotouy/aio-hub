/**
 * 通用 LLM 请求中间件
 * 支持文本和视觉模型的统一调用
 */

import { useLlmProfiles } from "./useLlmProfiles";
import { useLlmKeyManager } from "./useLlmKeyManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { LlmRequestOptions, LlmResponse } from "../llm-apis/common";
import { TimeoutError } from "../llm-apis/common";
import { callOpenAiCompatibleApi } from "../llm-apis/openai-compatible";
import { callOpenAiResponsesApi } from "../llm-apis/openai-responses";
import { callGeminiApi } from "../llm-apis/gemini";
import { callClaudeApi } from "../llm-apis/claude";
import { callCohereApi } from "../llm-apis/cohere";
import { callVertexAiApi } from "../llm-apis/vertexai";
import { filterParametersByCapabilities } from "../llm-apis/request-builder";
import type { LlmProfile } from "../types/llm-profiles";

const logger = createModuleLogger("LlmRequest");
const errorHandler = createModuleErrorHandler("LlmRequest");

export function useLlmRequest() {
  const { getProfileById } = useLlmProfiles();
  const { pickKey, reportSuccess, reportFailure } = useLlmKeyManager();

  /**
   * 发送 LLM 请求
   */
  const sendRequest = async (options: LlmRequestOptions): Promise<LlmResponse> => {
    let selectedApiKey: string | undefined;

    try {
      logger.info("发送 LLM 请求", {
        profileId: options.profileId,
        modelId: options.modelId,
        messageCount: options.messages.length,
      });

      // 获取配置
      const profile: LlmProfile | undefined = getProfileById(options.profileId);
      if (!profile) {
        const error = new Error(`未找到配置 ID: ${options.profileId}`);
        errorHandler.error(error, "配置不存在", { context: { profileId: options.profileId } });
        throw error;
      }
      // 检查配置是否启用
      if (!profile.enabled) {
        const error = new Error(`配置 "${profile.name}" 未启用`);
        errorHandler.error(error, "配置未启用", {
          context: {
            profileId: options.profileId,
            profileName: profile.name,
          }
        });
        throw error;
      }

      // 验证模型
      const model = profile.models.find((m) => m.id === options.modelId);
      if (!model) {
        const error = new Error(`未找到模型 ID: ${options.modelId}`);
        errorHandler.error(error, "模型不存在", {
          context: {
            profileId: options.profileId,
            modelId: options.modelId,
            availableModels: profile.models.map((m) => m.id),
          }
        });
        throw error;
      }

      logger.debug("开始调用 API", {
        providerType: profile.type,
        modelId: options.modelId,
      });

      // 获取当前轮询且可用的 API Key
      selectedApiKey = pickKey(profile);

      // 构造临时 Profile 对象，注入选中的 Key
      // 如果没有获取到 Key（例如 Profile 没配置 Key），则保持原样，让下游报错
      const effectiveProfile: LlmProfile = {
        ...profile,
        // 覆盖 apiKeys 为选中的单个 Key，确保下游 Provider 只看到这一个
        apiKeys: selectedApiKey ? [selectedApiKey] : (profile.apiKeys || []),
      };

      // 根据 Provider 和 Model 能力智能过滤参数
      let filteredOptions = filterParametersByCapabilities(options, effectiveProfile, model) as LlmRequestOptions;
      
      // 确保 signal 被透传，filterParametersByCapabilities 可能会漏掉它
      if (options.signal) {
        filteredOptions.signal = options.signal;
      }

      // 合并模型的自定义参数
      // customParameters 的优先级低于用户在 options 中明确设置的参数
      if (model.customParameters) {
        filteredOptions = {
          ...model.customParameters,
          ...filteredOptions,
        };
      }

      logger.debug("参数过滤完成", {
        originalParams: Object.keys(options).length,
        filteredParams: Object.keys(filteredOptions).length,
      });

      // 根据提供商类型调用对应的 API
      let response: LlmResponse;
      switch (effectiveProfile.type) {
        case "openai":
          response = await callOpenAiCompatibleApi(effectiveProfile, filteredOptions);
          break;
        case "openai-responses":
          response = await callOpenAiResponsesApi(effectiveProfile, filteredOptions);
          break;
        case "gemini":
          response = await callGeminiApi(effectiveProfile, filteredOptions);
          break;
        case "claude":
          response = await callClaudeApi(effectiveProfile, filteredOptions);
          break;
        case "cohere":
          response = await callCohereApi(effectiveProfile, filteredOptions);
          break;
        case "vertexai":
          response = await callVertexAiApi(effectiveProfile, filteredOptions);
          break;
        default:
          const error = new Error(`不支持的提供商类型: ${effectiveProfile.type}`);
          errorHandler.error(error, "不支持的提供商类型", { context: { providerType: effectiveProfile.type } });
          throw error;
      }

      logger.info("LLM 请求成功", {
        profileId: options.profileId,
        modelId: options.modelId,
        contentLength: response.content.length,
        usage: response.usage,
      });

      // 报告成功，重置错误状态
      if (selectedApiKey) {
        reportSuccess(options.profileId, selectedApiKey);
      }

      return response;
    } catch (error) {
      // TimeoutError 是请求超时
      if (error instanceof TimeoutError) {
        logger.warn("LLM 请求超时", {
          profileId: options.profileId,
          modelId: options.modelId,
          timeout: options.timeout,
        });
        errorHandler.warn(error, "请求超时，请检查网络连接或增加超时时间", {
          context: {
            profileId: options.profileId,
            modelId: options.modelId,
            timeout: options.timeout,
          }
        });
      }
      // AbortError 是用户主动取消，不应该记录为错误
      else if (error instanceof Error && error.name === 'AbortError') {
        logger.info("LLM 请求已取消", {
          profileId: options.profileId,
          modelId: options.modelId,
        });
      } else {
        // 报告失败，累加错误计数
        if (selectedApiKey) {
          reportFailure(options.profileId, selectedApiKey, error);
        }

        errorHandler.error(error, "LLM 请求失败", {
          context: {
            profileId: options.profileId,
            modelId: options.modelId,
          }
        });
      }
      throw error;
    }
  };

  return {
    sendRequest,
  };
}
