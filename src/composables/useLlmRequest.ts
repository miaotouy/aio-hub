/**
 * 通用 LLM 请求中间件
 * 支持文本和视觉模型的统一调用
 */

import { useLlmProfiles } from "./useLlmProfiles";
import { createModuleLogger } from "@utils/logger";
import type { LlmRequestOptions, LlmResponse } from "../llm-apis/common";
import { callOpenAiCompatibleApi } from "../llm-apis/openai-compatible";
import { callOpenAiResponsesApi } from "../llm-apis/openai-responses";
import { callGeminiApi } from "../llm-apis/gemini";
import { callClaudeApi } from "../llm-apis/claude";
import { callCohereApi } from "../llm-apis/cohere";
import { callVertexAiApi } from "../llm-apis/vertexai";
import type { LlmProfile } from "../types/llm-profiles";

const logger = createModuleLogger("LlmRequest");

export function useLlmRequest() {
  const { getProfileById } = useLlmProfiles();

  /**
   * 发送 LLM 请求
   */
  const sendRequest = async (options: LlmRequestOptions): Promise<LlmResponse> => {
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
        logger.error("配置不存在", error, { profileId: options.profileId });
        throw error;
      }

      // 检查配置是否启用
      if (!profile.enabled) {
        const error = new Error(`配置 "${profile.name}" 未启用`);
        logger.error("配置未启用", error, {
          profileId: options.profileId,
          profileName: profile.name,
        });
        throw error;
      }

      // 验证模型
      const model = profile.models.find((m) => m.id === options.modelId);
      if (!model) {
        const error = new Error(`未找到模型 ID: ${options.modelId}`);
        logger.error("模型不存在", error, {
          profileId: options.profileId,
          modelId: options.modelId,
          availableModels: profile.models.map((m) => m.id),
        });
        throw error;
      }

      logger.debug("开始调用 API", {
        providerType: profile.type,
        modelId: options.modelId,
      });

      // 根据提供商类型调用对应的 API
      let response: LlmResponse;
      switch (profile.type) {
        case "openai":
          response = await callOpenAiCompatibleApi(profile, options);
          break;
        case "openai-responses":
          response = await callOpenAiResponsesApi(profile, options);
          break;
        case "gemini":
          response = await callGeminiApi(profile, options);
          break;
        case "claude":
          response = await callClaudeApi(profile, options);
          break;
        case "cohere":
          response = await callCohereApi(profile, options);
          break;
        case "vertexai":
          response = await callVertexAiApi(profile, options);
          break;
        default:
          const error = new Error(`不支持的提供商类型: ${profile.type}`);
          logger.error("不支持的提供商类型", error, { providerType: profile.type });
          throw error;
      }

      logger.info("LLM 请求成功", {
        profileId: options.profileId,
        modelId: options.modelId,
        contentLength: response.content.length,
        usage: response.usage,
      });

      return response;
    } catch (error) {
      logger.error("LLM 请求失败", error, {
        profileId: options.profileId,
        modelId: options.modelId,
      });
      throw error;
    }
  };

  return {
    sendRequest,
  };
}
