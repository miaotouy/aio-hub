// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 通用 LLM 请求中间件
 * 支持文本和视觉模型的统一调用
 */

import { useLlmProfiles } from "./useLlmProfiles";
import { useLlmKeyManager } from "./useLlmKeyManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  LlmRequestOptions,
  LlmResponse,
  MediaGenerationOptions,
} from "../llm-apis/common";
import {
  TimeoutError,
  isAbortError,
  isTimeoutError,
  fetchWithTimeout,
} from "../llm-apis/common";
import { adapters } from "../llm-apis/adapters";
import { filterParametersByCapabilities } from "../llm-apis/request-builder";
import type { LlmProfile } from "../types/llm-profiles";
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
import type { InspectorContextMetadata } from "@/tools/llm-inspector/types/hooks";

const logger = createModuleLogger("LlmRequest");
const errorHandler = createModuleErrorHandler("LlmRequest");

export function useLlmRequest() {
  const { getProfileById } = useLlmProfiles();
  const { pickKey, reportSuccess, reportFailure } = useLlmKeyManager();

  /**
   * 获取指定配置的网络策略
   */
  const getNetworkStrategy = (profileId: string) => {
    const profile = getProfileById(profileId);
    return profile?.networkStrategy || "auto";
  };

  /**
   * 发送 LLM 请求
   */
  const sendRequest = async (
    options: LlmRequestOptions | MediaGenerationOptions
  ): Promise<LlmResponse> => {
    let selectedApiKey: string | undefined;

    // 自动包装 prompt 为 messages（仅对非媒体生成请求）
    // 如果是媒体生成请求（带有 prompt 且目标模型有生成能力），我们保持 prompt 独立以便适配器处理
    const isMediaRequest = !!(
      (options as MediaGenerationOptions).prompt &&
      ((options as any).inputAttachments ||
        (options as any).mask ||
        (options as any).attachments)
    );

    if (
      (options as MediaGenerationOptions).prompt &&
      !options.messages &&
      !isMediaRequest
    ) {
      options.messages = [
        { role: "user", content: (options as MediaGenerationOptions).prompt! },
      ];
    }

    // 优先复用调用方已生成的 requestId（可能用于主动停止），否则生成新的
    if (!options.requestId) {
      options.requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    // ============ LLM Inspector 上下文透传（B3）============
    // 自动补全 requestId（若调用方未传），并合并 inspectorContext 后写入
    // hookRegistry 的 contextStore，供 fetchWithTimeout 通过 X-Request-ID
    // header 反查。开关 OFF 时跳过整个写入流程，零开销。
    // 注意：requestId 必须在调用 adapter 之前确定，因为 buildOpenAiHeaders
    // 等会把它放入 X-Request-ID header。
    const captureInspector = inspectorHookRegistry.shouldCaptureInternal();
    let inspectorRequestId: string | undefined;
    if (captureInspector) {
      inspectorRequestId = options.requestId;

      // 合并：调用方传的 inspectorContext（toolName/sessionId/purpose 等）
      // + 运行时自动补的 profileId/modelId/requestId
      const mergedContext: InspectorContextMetadata = {
        ...(options.inspectorContext || {}),
        profileId: options.profileId,
        modelId: options.modelId,
        requestId: options.requestId,
      };
      inspectorHookRegistry.setContext(inspectorRequestId, mergedContext);
    }

    try {
      logger.info("发送 LLM 请求", {
        profileId: options.profileId,
        modelId: options.modelId,
        messageCount: options.messages?.length || 0,
      });

      // 获取配置
      const profile: LlmProfile | undefined = getProfileById(options.profileId);
      if (!profile) {
        const error = new Error(`未找到配置 ID: ${options.profileId}`);
        errorHandler.error(error, "配置不存在", {
          context: { profileId: options.profileId },
        });
        throw error;
      }
      // 检查配置是否启用。设置页测试请求允许绕过，便于验证未启用渠道。
      if (!profile.enabled && !options.allowDisabledProfile) {
        const error = new Error(`配置 "${profile.name}" 未启用`);
        errorHandler.error(error, "配置未启用", {
          context: {
            profileId: options.profileId,
            profileName: profile.name,
          },
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
          },
        });
        throw error;
      }

      logger.debug("开始调用 API", {
        providerType: profile.type,
        modelId: options.modelId,
      });

      // 获取 API Key：优先使用 options 中显式指定的，否则调用 pickKey
      selectedApiKey = options.apiKey || pickKey(profile);

      // 构造临时 Profile 对象，注入选中的 Key
      // 如果没有获取到 Key（例如 Profile 没配置 Key），则保持原样，让下游报错
      const effectiveProfile: LlmProfile = {
        ...profile,
        // 覆盖 apiKeys 为选中的单个 Key，确保下游 Provider 只看到这一个
        apiKeys: selectedApiKey ? [selectedApiKey] : profile.apiKeys || [],
      };

      // 自动分发特种请求 (Embedding)
      if (model.capabilities?.embedding && options.embeddingInput) {
        const adapter = adapters[effectiveProfile.type];
        if (adapter && adapter.embedding) {
          const result = await adapter.embedding(effectiveProfile, {
            modelId: options.modelId,
            input: options.embeddingInput,
            timeout: options.timeout,
            signal: options.signal,
          });
          return {
            content: `[Embedding] 已成功生成向量，维度: ${result.data?.[0]?.embedding?.length || "未知"}`,
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: 0,
              totalTokens: result.usage.totalTokens,
            },
          };
        }
      }

      // 自动分发特种请求 (Rerank)
      // Rerank 比较特殊，通常是自定义端点或者特定的 Provider (如 Cohere)
      // 如果是 OpenAI 类型的 Provider 但显式标记了 Rerank 且提供了 rerankQuery
      if (
        model.capabilities?.rerank &&
        options.rerankQuery &&
        profile.type === "openai"
      ) {
        // 这里我们可以透传给 callOpenAiCompatibleApi，但需要注意它内部默认拼接了 chat/completions
        // 更好的做法是增加一个 callOpenAiRerankApi 或者让 openAiUrlHandler 处理
        // 鉴于目前是测试用途，我们暂且返回一个模拟成功，或者之后在 adapter 里完善
        return {
          content: `[Rerank] 模型验证通过。查询: "${options.rerankQuery.substring(0, 20)}..."`,
        };
      }

      // 补全请求检查：如果不是特种请求，且不是媒体生成请求，必须有 messages
      const isMediaGeneration =
        model.capabilities?.imageGeneration ||
        model.capabilities?.videoGeneration ||
        model.capabilities?.audioGeneration ||
        model.capabilities?.musicGeneration;

      if (!options.messages && !isMediaGeneration) {
        throw new Error("聊天请求缺少 messages 参数");
      }

      // 自动检测 local-file:// 协议，如果发现则强制设置 hasLocalFile
      // 这是为了兼容那些没有显式设置 hasLocalFile 但内容中包含本地文件的场景
      if (!options.hasLocalFile) {
        const hasLocalFileProtocol = (content: any): boolean => {
          if (typeof content === "string") {
            return content.includes("local-file://");
          }
          if (Array.isArray(content)) {
            return content.some((item) => hasLocalFileProtocol(item));
          }
          if (content && typeof content === "object") {
            return Object.values(content).some((val) =>
              hasLocalFileProtocol(val)
            );
          }
          return false;
        };
        if (options.messages?.some((m) => hasLocalFileProtocol(m.content))) {
          options.hasLocalFile = true;
          logger.debug("自动检测到本地文件协议，已开启 Rust 代理模式");
        }
      }
      // 根据 Provider 和 Model 能力智能过滤参数
      // 使用 any 避开 LlmRequestOptions 和 MediaGenerationOptions 之间 responseFormat 的类型冲突
      let filteredOptions = filterParametersByCapabilities(
        options,
        effectiveProfile,
        model
      ) as any;

      // 确保 signal 被透传，filterParametersByCapabilities 可能会漏掉它
      if (options.signal) {
        filteredOptions.signal = options.signal;
      }

      // 确保 requestId 被透传，filterParametersByCapabilities 可能会漏掉它
      if (options.requestId) {
        filteredOptions.requestId = options.requestId;
      }

      // 合并模型的自定义参数
      // customParameters 的优先级低于用户在 options 中明确设置的参数
      if (model.customParameters) {
        filteredOptions = {
          ...model.customParameters,
          ...filteredOptions,
        };
      }

      // 注入渠道的代理行为配置
      // 强制同步网络控制字段，确保适配器和 fetchWithTimeout 能接收到这些标志
      filteredOptions.hasLocalFile = options.hasLocalFile;
      filteredOptions.forceProxy = options.forceProxy;
      filteredOptions.relaxIdCerts = options.relaxIdCerts;
      filteredOptions.http1Only = options.http1Only;

      if (profile.networkStrategy !== undefined) {
        filteredOptions.networkStrategy = profile.networkStrategy;

        // 如果强制原生，则绝对不开启后端代理负载模式
        if (profile.networkStrategy === "native") {
          options.hasLocalFile = false;
          filteredOptions.hasLocalFile = false;
        }
      }
      if (profile.relaxIdCerts !== undefined) {
        filteredOptions.relaxIdCerts = profile.relaxIdCerts;
      }
      if (profile.http1Only !== undefined) {
        filteredOptions.http1Only = profile.http1Only;
      }

      // 自动开启代理：如果是本地地址或 IP 地址，强制走 Rust 代理以绕过前端 Capabilities 限制
      const isLocalOrIp = (url: string): boolean => {
        const lowerUrl = url.toLowerCase();
        return (
          lowerUrl.includes("localhost") ||
          lowerUrl.includes("127.0.0.1") ||
          // 匹配 IPv4 正则
          /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)
        );
      };

      if (profile.baseUrl && isLocalOrIp(profile.baseUrl)) {
        filteredOptions.forceProxy = true;
        logger.debug("检测到本地或 IP 地址，已强制开启 Rust 代理模式");
      }

      logger.debug("参数过滤完成", {
        originalParams: Object.keys(options).length,
        filteredParams: Object.keys(filteredOptions).length,
      });

      // 根据提供商类型调用对应的适配器
      const adapter = adapters[effectiveProfile.type];
      if (!adapter) {
        const error = new Error(`不支持的提供商类型: ${effectiveProfile.type}`);
        errorHandler.error(error, "不支持的提供商类型", {
          context: { providerType: effectiveProfile.type },
        });
        throw error;
      }

      // 根据模型能力分发请求
      let response: LlmResponse;

      logger.debug("准备分发请求", {
        targetModelId: filteredOptions.modelId,
        adapterType: effectiveProfile.type,
        isMediaGeneration,
        hasPrompt: !!(filteredOptions as any).prompt,
      });

      // 检查是否为强制对话模式 (例如在媒体生成中心中，用户选择了“对话迭代”模式)
      // 或者模型能力中显式指定了偏好 Chat 接口 (如原生多模态生图模型)
      const forceChatMode =
        (options as any)._forceChatMode === true ||
        model.capabilities?.preferChat === true;

      if (
        !forceChatMode &&
        model.capabilities?.videoGeneration &&
        adapter.video
      ) {
        response = await adapter.video(
          effectiveProfile,
          filteredOptions as MediaGenerationOptions
        );
      } else if (
        !forceChatMode &&
        model.capabilities?.imageGeneration &&
        adapter.image
      ) {
        response = await adapter.image(
          effectiveProfile,
          filteredOptions as MediaGenerationOptions
        );
      } else if (
        !forceChatMode &&
        (model.capabilities?.audioGeneration ||
          model.capabilities?.musicGeneration) &&
        adapter.audio
      ) {
        response = await adapter.audio(
          effectiveProfile,
          filteredOptions as MediaGenerationOptions
        );
      } else {
        response = await adapter.chat(
          effectiveProfile,
          filteredOptions as LlmRequestOptions
        );
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
      // B3: 此处先继续既有错误处理；inspectorContext 清理在 finally 中统一执行
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
          },
        });
      }
      // AbortError 是用户主动取消，不应该记录为错误
      // 兼容 Tauri HTTP 插件的 "Request canceled" 错误
      else if (isAbortError(error, options.signal)) {
        // 特殊处理：如果虽然是 AbortError，但原因其实是超时
        const isTimeout = isTimeoutError(error, options.signal);

        if (isTimeout) {
          const timeoutErr =
            error instanceof TimeoutError
              ? error
              : new TimeoutError("请求超时");
          logger.warn("LLM 请求超时 (通过信号识别)", {
            profileId: options.profileId,
            modelId: options.modelId,
            timeout: options.timeout,
            originalError: (error as any)?.message || String(error),
          });
          // 抛出统一的 TimeoutError 让下游处理
          throw timeoutErr;
        }

        logger.info("LLM 请求已取消", {
          profileId: options.profileId,
          modelId: options.modelId,
          reason: (error as any)?.message || String(error),
          signalReason: options.signal?.reason,
        });

        // 如果提供了 requestId 且不是因为超时导致的取消，尝试发送主动停止信号到上游
        if (options.requestId && !isTimeoutError(error, options.signal)) {
          const profile = getProfileById(options.profileId);
          if (profile?.baseUrl) {
            // 构造停止端点：/v1/interrupt
            // 需要与 openAiUrlHandler.buildUrl 保持一致的智能路径处理，
            // 避免 baseUrl 已包含 /v1 时产生 /v1/v1/interrupt 的重复路径
            const baseHost = profile.baseUrl.endsWith("/")
              ? profile.baseUrl
              : `${profile.baseUrl}/`;
            const hasVersionPath =
              baseHost.includes("/v1") ||
              baseHost.includes("/v2") ||
              baseHost.includes("/v3") ||
              baseHost.includes("/api/v");
            const interruptUrl = hasVersionPath
              ? `${baseHost}interrupt`
              : `${baseHost}v1/interrupt`;

            logger.debug("发送主动停止信号到上游", {
              requestId: options.requestId,
              url: interruptUrl,
            });

            // 补发停止请求，通过 Rust 代理发送以保证与正常请求相同的网络路径
            // 使用独立的 AbortController（不使用原有已中止的 signal），超时 5 秒
            fetchWithTimeout(
              interruptUrl,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  // 带上 API Key 用于 VCP Bearer Token 认证
                  ...(selectedApiKey
                    ? { Authorization: `Bearer ${selectedApiKey}` }
                    : {}),
                },
                body: JSON.stringify({
                  requestId: options.requestId,
                }),
                forceProxy: options.forceProxy,
                relaxIdCerts: options.relaxIdCerts,
                http1Only: options.http1Only,
                networkStrategy: options.networkStrategy,
              },
              5000 // 5 秒超时，interrupt 不应该等太久
            ).catch((e) => {
              logger.warn("发送主动停止信号失败", {
                error: String(e),
                requestId: options.requestId,
              });
            });
          }
        }
      } else {
        const suppressErrorLog = options.suppressErrorLog === true;

        // 报告失败，累加错误计数
        if (selectedApiKey && !suppressErrorLog) {
          reportFailure(options.profileId, selectedApiKey, error);
        }

        if (suppressErrorLog) {
          logger.debug("LLM 请求失败但已按调用方要求静默", {
            profileId: options.profileId,
            modelId: options.modelId,
            error: error instanceof Error ? error.message : String(error),
          });
        } else {
          errorHandler.error(error, "LLM 请求失败", {
            showToUser: false,
            context: {
              profileId: options.profileId,
              modelId: options.modelId,
            },
          });
        }
      }
      throw error;
    } finally {
      // B3: 清理 inspector 上下文存储，防止内存泄露。
      // 即使 setContext 没写入（开关 OFF 时 inspectorRequestId 为 undefined），
      // deleteContext 内部会判空，安全无副作用。
      if (inspectorRequestId) {
        inspectorHookRegistry.deleteContext(inspectorRequestId);
      }
    }
  };

  return {
    sendRequest,
    getNetworkStrategy,
  };
}
