import { ref } from "vue";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { useLlmKeyManager } from "./useLlmKeyManager";
import { callOpenAiCompatibleApi } from "../core/adapters/openai-compatible";
import { callOpenAiResponsesApi } from "../core/adapters/openai-responses";
import { callClaudeApi } from "../core/adapters/claude";
import { callGeminiApi } from "../core/adapters/gemini";
import { callCohereApi } from "../core/adapters/cohere";
import { callVertexAiApi } from "../core/adapters/vertexai";
import type { LlmProfile } from "../types";
import type { LlmRequestOptions, LlmResponse } from "../types/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-api/useLlmRequest");
const errorHandler = createModuleErrorHandler("llm-api/useLlmRequest");

type LlmRequestStore = {
  isLoaded: boolean;
  init(): Promise<void>;
  profiles: LlmProfile[];
  selectedProfile: LlmProfile | null | undefined;
};

type LlmRequestKeyManager = {
  pickKey(profile: LlmProfile): string | undefined;
  reportSuccess(profileId: string, key: string): void;
  reportFailure(profileId: string, key: string, error: unknown): void;
};

type LlmRequestLogger = Pick<
  ReturnType<typeof createModuleLogger>,
  "info" | "debug"
>;

type LlmRequestErrorHandler = Pick<
  ReturnType<typeof createModuleErrorHandler>,
  "error" | "handle"
>;

export interface LlmRequestDependencies {
  store: LlmRequestStore;
  keyManager: LlmRequestKeyManager;
  executeAdapter(
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse>;
  logger: LlmRequestLogger;
  errorHandler: LlmRequestErrorHandler;
}

async function executeProviderAdapter(
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> {
  switch (profile.type) {
    case "openai":
      return callOpenAiCompatibleApi(profile, options);
    case "openai-responses":
      return callOpenAiResponsesApi(profile, options);
    case "claude":
      return callClaudeApi(profile, options);
    case "gemini":
      return callGeminiApi(profile, options);
    case "cohere":
      return callCohereApi(profile, options);
    case "vertexai":
      return callVertexAiApi(profile, options);
    default:
      return callOpenAiCompatibleApi(profile, options);
  }
}

export function createLlmRequest(dependencies: LlmRequestDependencies) {
  const { store, keyManager, executeAdapter, logger, errorHandler } =
    dependencies;
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
      const result = await executeAdapter(profile, options);

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

export function useLlmRequest() {
  return createLlmRequest({
    store: useLlmProfilesStore(),
    keyManager: useLlmKeyManager(),
    executeAdapter: executeProviderAdapter,
    logger,
    errorHandler,
  });
}
