import { ref } from "vue";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { callOpenAiCompatibleApi } from "../core/adapters/openai-compatible";
import type { LlmRequestOptions } from "../types/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm/useLlmRequest");
const errorHandler = createModuleErrorHandler("llm/useLlmRequest");

export function useLlmRequest() {
  const store = useLlmProfilesStore();
  const isSending = ref(false);

  /**
   * 发送 LLM 请求
   * @param options 请求选项
   * @param profileId 可选，指定使用的 Profile ID，不传则使用当前选中的
   */
  async function sendRequest(options: LlmRequestOptions, profileId?: string) {
    if (!store.isLoaded) await store.init();

    const profile = profileId 
      ? store.profiles.find(p => p.id === profileId)
      : store.selectedProfile;

    if (!profile) {
      const err = new Error("未找到可用的 LLM 配置");
      errorHandler.error(err, "请先在设置中配置 LLM 渠道");
      throw err;
    }

    isSending.value = true;
    logger.info("开始发送 LLM 请求", { modelId: options.modelId, profile: profile.name });

    try {
      // 目前主要支持 OpenAI 兼容格式，后续根据 profile.type 分发到不同适配器
      let result;
      switch (profile.type) {
        case "openai":
        case "openai-responses":
          result = await callOpenAiCompatibleApi(profile, options);
          break;
        default:
          // 暂时回退到 OpenAI 兼容模式（很多 Provider 都是兼容的）
          result = await callOpenAiCompatibleApi(profile, options);
      }

      logger.debug("LLM 请求完成", { isStream: result.isStream });
      return result;
    } catch (err) {
      errorHandler.error(err, "LLM 请求失败");
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