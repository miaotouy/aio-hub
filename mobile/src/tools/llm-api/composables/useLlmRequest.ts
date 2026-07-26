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
import { LlmApiError, TimeoutError } from "../core/common";
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

export function isRetryableLlmRequestError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof DOMException && error.name === "AbortError")
    return false;
  if (error instanceof LlmApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

function normalizeMaxRetries(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(cleanupAndResolve, delayMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason || new DOMException("Aborted", "AbortError"));
    };

    function cleanupAndResolve() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
    const requestOptions: LlmRequestOptions = { ...options };
    // 默认开启流式，除非显式指定为 false
    if (requestOptions.stream === undefined) {
      requestOptions.stream = true;
    }

    // 默认超时设为 5 分钟 (适配长思考模型)
    if (requestOptions.timeout === undefined) {
      requestOptions.timeout = 300000;
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

    const originalOnStream = requestOptions.onStream;
    const originalOnReasoningStream = requestOptions.onReasoningStream;
    let receivedStreamContent = false;
    if (originalOnStream) {
      requestOptions.onStream = (chunk) => {
        if (chunk) receivedStreamContent = true;
        originalOnStream(chunk);
      };
    }
    if (originalOnReasoningStream) {
      requestOptions.onReasoningStream = (chunk) => {
        if (chunk) receivedStreamContent = true;
        originalOnReasoningStream(chunk);
      };
    }

    const maxRetries = normalizeMaxRetries(requestOptions.maxRetries);
    let attempt = 0;
    isSending.value = true;

    try {
      while (true) {
        const pickedKey = keyManager.pickKey(originalProfile);
        const profile = {
          ...originalProfile,
          apiKeys: pickedKey ? [pickedKey] : [],
        };
        const adapterOptions: LlmRequestOptions = {
          ...requestOptions,
          relaxIdCerts: profile.relaxIdCerts ?? requestOptions.relaxIdCerts,
          http1Only: profile.http1Only ?? requestOptions.http1Only,
        };

        logger.info("开始发送 LLM 请求", {
          modelId: adapterOptions.modelId,
          profile: profile.name,
          attempt: attempt + 1,
          keyUsed: pickedKey ? `${pickedKey.substring(0, 8)}...` : "none",
        });

        try {
          const result = await executeAdapter(profile, adapterOptions);
          if (pickedKey) {
            keyManager.reportSuccess(originalProfile.id, pickedKey);
          }
          logger.debug("LLM 请求完成", {
            isStream: result.isStream,
            attempt: attempt + 1,
          });
          return result;
        } catch (err: unknown) {
          if (pickedKey) {
            keyManager.reportFailure(originalProfile.id, pickedKey, err);
          }

          const canRetry =
            attempt < maxRetries &&
            !receivedStreamContent &&
            isRetryableLlmRequestError(err);
          if (!canRetry) {
            errorHandler.handle(err, {
              showToUser: false,
              context: { modelId: requestOptions.modelId },
            });
            throw err;
          }

          attempt += 1;
          const delayMs = Math.min(300 * 2 ** (attempt - 1), 2000);
          logger.info("LLM 请求失败，将重试", {
            modelId: requestOptions.modelId,
            attempt,
            maxRetries,
            delayMs,
          });
          await waitForRetry(delayMs, requestOptions.signal);
        }
      }
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
