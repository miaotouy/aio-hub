import { ref } from "vue";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { useLlmKeyManager } from "./useLlmKeyManager";
import { callOpenAiCompatibleApi } from "../core/adapters/openai-compatible";
import { callOpenAiResponsesApi } from "../core/adapters/openai-responses";
import { callClaudeApi } from "../core/adapters/claude";
import { callGeminiApi } from "../core/adapters/gemini";
import { callCohereApi } from "../core/adapters/cohere";
import { callVertexAiApi } from "../core/adapters/vertexai";
import type { LlmRequestOptions } from "../types/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-api/useLlmRequest");
const errorHandler = createModuleErrorHandler("llm-api/useLlmRequest");
export function useLlmRequest() {
  const store = useLlmProfilesStore();
  const keyManager = useLlmKeyManager();
  const isSending = ref(false);

  /**
   * 发送 LLM 请求
   * @param options 请求选项
   * @param profileId 可选，指定使用的 Profile ID，不传则使用当前选中的
   */
  async function sendRequest(options: LlmRequestOptions, profileId?: string) {
    // 默认开启流式，除非显式指定为 false
    if (options.stream === undefined) {
      options.stream = true;
    }

    // 默认超时设为 5 分钟 (适配长思考模型)
    if (options.timeout === undefined) {
      options.timeout = 300000;
    }

    if (!store.isLoaded) await store.init();

    const originalProfile = profileId
      ? store.profiles.find((p) => p.id === profileId)
      : store.selectedProfile;

    if (!originalProfile) {
      const err = new Error("未找到可用的 LLM 配置");
      errorHandler.error(err, "请先在设置中配置 LLM 渠道");
      throw err;
    }

    // 通过 KeyManager 选择一个可用的 Key (轮询 + 熔断过滤)
    const pickedKey = keyManager.pickKey(originalProfile);

    // 克隆 Profile 并注入选中的单个 Key，以保持适配器接口兼容
    const profile = {
      ...originalProfile,
      apiKeys: pickedKey ? [pickedKey] : [],
    };

    // 注入代理行为配置
    if (profile.relaxIdCerts !== undefined) {
      options.relaxIdCerts = profile.relaxIdCerts;
    }
    if (profile.http1Only !== undefined) {
      options.http1Only = profile.http1Only;
    }

    isSending.value = true;
    logger.info("开始发送 LLM 请求", {
      modelId: options.modelId,
      profile: profile.name,
      keyUsed: pickedKey ? `${pickedKey.substring(0, 8)}...` : "none",
    });

    try {
      let result;
      switch (profile.type) {
        case "openai":
          result = await callOpenAiCompatibleApi(profile, options);
          break;
        case "openai-responses":
          result = await callOpenAiResponsesApi(profile, options);
          break;
        case "claude":
          result = await callClaudeApi(profile, options);
          break;
        case "gemini":
          result = await callGeminiApi(profile, options);
          break;
        case "cohere":
          result = await callCohereApi(profile, options);
          break;
        case "vertexai":
          result = await callVertexAiApi(profile, options);
          break;
        default:
          // 暂时回退到 OpenAI 兼容模式（很多 Provider 都是兼容的）
          result = await callOpenAiCompatibleApi(profile, options);
      }

      // 请求成功，上报状态
      if (pickedKey) {
        keyManager.reportSuccess(originalProfile.id, pickedKey);
      }

      logger.debug("LLM 请求完成", { isStream: result.isStream });
      return result;
    } catch (err: any) {
      // 请求失败，上报状态以便触发熔断
      if (pickedKey) {
        keyManager.reportFailure(originalProfile.id, pickedKey, err);
      }

      // 静默处理：记录日志并触发熔断，但不弹出全局提示，交给业务层处理
      errorHandler.handle(err, {
        showToUser: false,
        context: { modelId: options.modelId },
      });
      throw err;
    } finally {
      isSending.value = false;
    }
  }

  return {
    sendRequest,
    isSending,
  };
}
