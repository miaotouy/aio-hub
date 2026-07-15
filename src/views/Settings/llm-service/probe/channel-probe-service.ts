import {
  classifyProbeError,
  executeRerankRequest,
  rerankAdapter,
  resolveProbePlan,
  validateProbeResponse,
  type ChannelProbeResult,
  type ProbePlan,
  type TransportObserver,
} from "@aiohub/llm-core";
import { adapters, type LlmAdapter } from "@/llm-apis/adapters";
import type {
  LlmRequestOptions,
  LlmResponse,
  MediaGenerationOptions,
} from "@/llm-apis/common";
import type { EmbeddingResponse } from "@/llm-apis/embedding-types";
import { fetchModelsFromApi } from "@/llm-apis/model-fetcher";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
import { resolveCustomHeaders } from "../config/customHeadersPresets";
import type { BatchProbeRequest, ChannelProbeRequest } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CONCURRENCY = 8;

export interface ChannelProbeServiceDependencies {
  adapters?: Record<string, LlmAdapter>;
  fetchModels?: typeof fetchModelsFromApi;
  now?: () => number;
  monotonicNow?: () => number;
}

export function createChannelProbeService(
  dependencies: ChannelProbeServiceDependencies = {}
) {
  const adapterMap = dependencies.adapters ?? adapters;
  const fetchModels = dependencies.fetchModels ?? fetchModelsFromApi;
  const now = dependencies.now ?? Date.now;
  const monotonicNow =
    dependencies.monotonicNow ??
    (() =>
      typeof performance === "undefined" ? Date.now() : performance.now());

  async function probe(
    request: ChannelProbeRequest
  ): Promise<ChannelProbeResult> {
    const startedAt = monotonicNow();
    const profile = cloneProfile(request.profile);
    const requestId = `probe-${profile.id}-${now()}-${Math.random().toString(36).slice(2)}`;
    let firstByteMs: number | undefined;
    const observer: TransportObserver = {
      onResponseStart: () => {
        firstByteMs ??= Math.max(0, monotonicNow() - startedAt);
      },
    };

    if (request.signal?.aborted) {
      return failureResult(request, startedAt, {
        category: "cancelled",
        phase: "prepare",
        message: "检查已取消",
      });
    }

    if (inspectorHookRegistry.shouldCaptureInternal()) {
      inspectorHookRegistry.setContext(requestId, {
        toolName: "settings-llm-service",
        purpose: "system-probe",
        profileId: profile.id,
        modelId: request.modelId,
        requestId,
        probeKind: request.kind,
        probeCapability: request.capability,
      });
    }

    try {
      if (request.kind === "model-list") {
        const result = await fetchModels(profile, {
          apiKey: request.apiKey,
          requestId,
          timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          signal: request.signal,
          observer,
          silent: true,
        });
        return successResult(request, startedAt, firstByteMs, {
          responsePreview: `返回 ${result.models.length} 个模型`,
        });
      }

      const model = requireModel(profile, request.modelId);
      const plan = resolveProbePlan(model, {
        capability: request.capability,
        stream: request.stream,
      });
      if (!plan.supported) {
        return failureResult(request, startedAt, {
          category: "unsupported-capability",
          phase: "prepare",
          message: `${capabilityLabel(plan.capability)}不支持自动检查`,
          capability: plan.capability,
        });
      }
      if (plan.requiresExplicitConsent && !request.allowCostlyMedia) {
        return failureResult(request, startedAt, {
          category: "configuration",
          phase: "prepare",
          message: "图片和音频检查会产生真实调用费用，需显式确认",
          capability: plan.capability,
        });
      }

      const effectiveProfile = withExplicitKey(profile, request.apiKey);
      const adapter = adapterMap[effectiveProfile.type];
      if (!adapter) {
        throw new Error(`不支持的提供商类型: ${effectiveProfile.type}`);
      }

      const execution = await executePlan({
        adapter,
        model,
        plan,
        profile: effectiveProfile,
        request,
        requestId,
        observer,
      });
      const validation = validateProbeResponse(execution.validation);
      if (!validation.valid) {
        return failureResult(request, startedAt, {
          category: "provider",
          phase: "semantic-validation",
          message: validation.errorMessage ?? "响应语义校验失败",
          capability: plan.capability,
          firstByteMs,
        });
      }
      return successResult(request, startedAt, firstByteMs, {
        capability: plan.capability,
        responsePreview: validation.preview,
        usage: execution.response?.usage,
      });
    } catch (error) {
      const classified = classifyProbeError(error, request.signal);
      return failureResult(request, startedAt, {
        ...classified,
        firstByteMs,
        capability: request.capability,
      });
    } finally {
      inspectorHookRegistry.deleteContext(requestId);
    }
  }

  async function probeBatch(
    request: BatchProbeRequest
  ): Promise<ChannelProbeResult[]> {
    const profile = cloneProfile(request.profile);
    const modelIds = [...request.modelIds];
    const results = new Array<ChannelProbeResult>(modelIds.length);
    const concurrency = Math.max(
      1,
      Math.min(MAX_CONCURRENCY, request.concurrency ?? 3, modelIds.length || 1)
    );
    let nextIndex = 0;
    let completed = 0;

    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= modelIds.length) return;
        const modelId = modelIds[index];
        const result = await probe({
          kind: "batch-model",
          profile,
          modelId,
          stream: request.stream,
          timeoutMs: request.timeoutMs,
          signal: request.signal,
          allowCostlyMedia: request.allowCostlyMedia,
        });
        results[index] = result;
        completed += 1;
        request.onResult?.(result, completed, modelIds.length);
        if (request.signal?.aborted) return;
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    for (let index = 0; index < modelIds.length; index += 1) {
      results[index] ??= cancelledResult(modelIds[index], now());
    }
    return results;
  }

  return { probe, probeBatch };

  function successResult(
    request: ChannelProbeRequest,
    startedAt: number,
    firstByteMs: number | undefined,
    values: Partial<ChannelProbeResult>
  ): ChannelProbeResult {
    return {
      success: true,
      kind: request.kind,
      modelId: request.modelId,
      phase: "semantic-validation",
      totalMs: Math.max(0, monotonicNow() - startedAt),
      firstByteMs,
      testedAt: now(),
      ...values,
    };
  }

  function failureResult(
    request: ChannelProbeRequest,
    startedAt: number,
    values: {
      category: ChannelProbeResult["category"];
      phase: ChannelProbeResult["phase"];
      message: string;
      detail?: string;
      status?: number;
      firstByteMs?: number;
      capability?: ChannelProbeResult["capability"];
    }
  ): ChannelProbeResult {
    return {
      success: false,
      kind: request.kind,
      capability: values.capability,
      modelId: request.modelId,
      phase: values.phase,
      category: values.category,
      status: values.status,
      totalMs: Math.max(0, monotonicNow() - startedAt),
      firstByteMs: values.firstByteMs,
      errorMessage: values.message,
      errorDetail: values.detail ?? values.message,
      testedAt: now(),
    };
  }
}

interface ExecutePlanOptions {
  adapter: LlmAdapter;
  model: LlmModelInfo;
  plan: ProbePlan;
  profile: LlmProfile;
  request: ChannelProbeRequest;
  requestId: string;
  observer: TransportObserver;
}

async function executePlan(options: ExecutePlanOptions) {
  const { adapter, model, plan, profile, request, requestId, observer } =
    options;
  const baseOptions = {
    ...(model.customParameters ?? {}),
    profileId: profile.id,
    modelId: model.id,
    apiKey: request.apiKey,
    timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: request.signal,
    requestId,
    allowDisabledProfile: true,
    suppressErrorLog: true,
    transportObserver: observer,
    networkStrategy: profile.networkStrategy,
    relaxIdCerts: profile.relaxIdCerts,
    http1Only: profile.http1Only,
  };

  switch (plan.capability) {
    case "chat": {
      let streamDeltaReceived = false;
      const response = await adapter.chat(profile, {
        ...baseOptions,
        messages: [{ role: "user", content: plan.chat!.prompt }],
        maxTokens: plan.chat!.maxTokens,
        stream: plan.stream,
        onStream: (chunk) => {
          if (chunk.length > 0) streamDeltaReceived = true;
        },
      } as LlmRequestOptions);
      return {
        response,
        validation: {
          capability: plan.capability,
          stream: plan.stream,
          streamDeltaReceived,
          response,
        },
      };
    }
    case "embedding": {
      if (!adapter.embedding)
        throw new Error("当前 Provider Adapter 不支持嵌入能力");
      const embedding = await adapter.embedding(profile, {
        ...baseOptions,
        input: plan.embedding!.input,
      });
      return {
        response: embeddingToResponse(embedding),
        validation: { capability: plan.capability, embedding },
      };
    }
    case "rerank": {
      const rerank = await executeRerankRequest({
        adapter: rerankAdapter,
        profile: {
          provider: profile.type,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKeys[0],
          headers: resolveCustomHeaders(profile.customHeaders),
          endpoints: profile.customEndpoints,
          options:
            profile.options as import("@aiohub/llm-core").ProviderProfile["options"],
        },
        request: {
          model: model.id,
          query: plan.rerank!.query,
          documents: plan.rerank!.documents,
          requestId,
        },
        transport: desktopLlmTransport,
        transportOptions: {
          requestId,
          signal: request.signal,
          timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          observer,
          network: {
            strategy: profile.networkStrategy,
            relaxInvalidCerts: profile.relaxIdCerts,
            http1Only: profile.http1Only,
          },
        },
      });
      return {
        response: {
          content: `返回 ${rerank.results.length} 条排序结果`,
          usage: rerank.usage?.totalTokens
            ? {
                promptTokens: rerank.usage.totalTokens,
                completionTokens: 0,
                totalTokens: rerank.usage.totalTokens,
              }
            : undefined,
        } satisfies LlmResponse,
        validation: {
          capability: plan.capability,
          rerank,
          rerankDocumentCount: plan.rerank!.documents.length,
        },
      };
    }
    case "image": {
      if (!adapter.image)
        throw new Error("当前 Provider Adapter 不支持图片生成能力");
      const response = await adapter.image(profile, {
        ...baseOptions,
        prompt: plan.media!.prompt,
        size: "1024x1024",
        n: 1,
      } as MediaGenerationOptions);
      return {
        response,
        validation: { capability: plan.capability, response },
      };
    }
    case "audio": {
      if (!adapter.audio)
        throw new Error("当前 Provider Adapter 不支持音频生成能力");
      const response = await adapter.audio(profile, {
        ...baseOptions,
        prompt: plan.media!.prompt,
        audioConfig: { voice: "alloy", responseFormat: "mp3" },
      } as MediaGenerationOptions);
      return {
        response,
        validation: { capability: plan.capability, response },
      };
    }
    case "video":
    case "music":
      throw new Error("该能力不支持自动检查");
  }
}

function requireModel(profile: LlmProfile, modelId?: string): LlmModelInfo {
  const model = profile.models.find((item) => item.id === modelId);
  if (!model) throw new Error(`未找到模型 ID: ${modelId ?? ""}`);
  return model;
}

function withExplicitKey(profile: LlmProfile, apiKey?: string): LlmProfile {
  return { ...profile, apiKeys: apiKey ? [apiKey] : [...profile.apiKeys] };
}

function cloneProfile(profile: LlmProfile): LlmProfile {
  return JSON.parse(JSON.stringify(profile));
}

function embeddingToResponse(response: EmbeddingResponse): LlmResponse {
  return {
    content: `向量维度 ${response.data[0]?.embedding.length ?? 0}`,
    usage: {
      promptTokens: response.usage.promptTokens,
      completionTokens: 0,
      totalTokens: response.usage.totalTokens,
    },
  };
}

function cancelledResult(
  modelId: string,
  testedAt: number
): ChannelProbeResult {
  return {
    success: false,
    kind: "batch-model",
    modelId,
    phase: "prepare",
    category: "cancelled",
    totalMs: 0,
    errorMessage: "检查已取消",
    errorDetail: "检查已取消",
    testedAt,
  };
}

function capabilityLabel(capability: string): string {
  return { video: "视频", music: "音乐" }[capability] ?? capability;
}
