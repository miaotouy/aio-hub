import {
  classifyProbeError,
  cohereEmbeddingAdapter,
  executeEmbeddingRequest,
  executeRerankRequest,
  executeSyncMediaRequest,
  geminiEmbeddingAdapter,
  geminiImageAdapter,
  openAiAudioAdapter,
  openAiEmbeddingAdapter,
  openAiImageAdapter,
  rerankAdapter,
  resolveProbePlan,
  siliconFlowImageAdapter,
  validateProbeResponse,
  vertexEmbeddingAdapter,
  type ChannelProbeResult,
  type ProbePlan,
  type ProbeValidationInput,
  type ProviderProfile,
  type TransportObserver,
} from "@aiohub/llm-core";
import type { LlmModelInfo, LlmProfile } from "../types";
import type { LlmRequestOptions, LlmResponse } from "../types/common";
import { callClaudeApi } from "../core/adapters/claude";
import { callCohereApi } from "../core/adapters/cohere";
import { callGeminiApi } from "../core/adapters/gemini";
import { callOpenAiCompatibleApi } from "../core/adapters/openai-compatible";
import { callOpenAiResponsesApi } from "../core/adapters/openai-responses";
import { callVertexAiApi } from "../core/adapters/vertexai";
import { mobileLlmTransport } from "../core/transports/mobile";
import type { BatchProbeRequest, ChannelProbeRequest } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CONCURRENCY = 4;

type ChatExecutor = (
  profile: LlmProfile,
  options: LlmRequestOptions
) => Promise<LlmResponse>;

interface ProbeExecution {
  response?: LlmResponse;
  validation: ProbeValidationInput;
}

export interface ChannelProbeServiceDependencies {
  executeChat?: ChatExecutor;
  executePlan?: (options: ExecutePlanOptions) => Promise<ProbeExecution>;
  now?: () => number;
  monotonicNow?: () => number;
}

export function createChannelProbeService(
  dependencies: ChannelProbeServiceDependencies = {}
) {
  const now = dependencies.now ?? Date.now;
  const monotonicNow =
    dependencies.monotonicNow ??
    (() =>
      typeof performance === "undefined" ? Date.now() : performance.now());
  const runPlan = dependencies.executePlan ?? executePlan;

  async function probe(
    request: ChannelProbeRequest
  ): Promise<ChannelProbeResult> {
    const startedAt = monotonicNow();
    const profile = cloneProfile(request.profile);
    const requestId = `mobile-probe-${profile.id}-${now()}-${Math.random().toString(36).slice(2)}`;
    let firstByteMs: number | undefined;
    let status: number | undefined;
    const observer: TransportObserver = {
      onResponseStart: (event) => {
        firstByteMs ??= Math.max(0, monotonicNow() - startedAt);
        status = event.status;
      },
    };

    if (request.signal?.aborted) {
      return failureResult(request, startedAt, {
        category: "cancelled",
        phase: "prepare",
        message: "检查已取消",
      });
    }

    try {
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
      const execution = await runPlan({
        model,
        plan,
        profile: effectiveProfile,
        request,
        requestId,
        observer,
        executeChat: dependencies.executeChat,
      });
      const validation = validateProbeResponse(execution.validation);
      if (!validation.valid) {
        return failureResult(request, startedAt, {
          category: "provider",
          phase: "semantic-validation",
          message: validation.errorMessage ?? "响应语义校验失败",
          capability: plan.capability,
          firstByteMs,
          status,
        });
      }
      return successResult(request, startedAt, firstByteMs, {
        capability: plan.capability,
        status,
        responsePreview: validation.preview,
        usage: execution.response?.usage,
      });
    } catch (error) {
      const classified = classifyProbeError(error, request.signal);
      return failureResult(request, startedAt, {
        ...classified,
        status: classified.status ?? status,
        firstByteMs,
        capability: request.capability,
      });
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
      while (!request.signal?.aborted) {
        const index = nextIndex++;
        if (index >= modelIds.length) return;
        request.onStart?.(modelIds[index], index, modelIds.length);
        const result = await probe({
          kind: "batch-model",
          profile,
          modelId: modelIds[index],
          stream: request.stream,
          timeoutMs: request.timeoutMs,
          signal: request.signal,
          allowCostlyMedia: request.allowCostlyMedia,
        });
        results[index] = result;
        completed += 1;
        request.onResult?.(result, completed, modelIds.length);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    for (let index = 0; index < modelIds.length; index += 1) {
      results[index] ??= cancelledResult(modelIds[index], now());
    }
    return results;
  }

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

  return { probe, probeBatch };
}

interface ExecutePlanOptions {
  model: LlmModelInfo;
  plan: ProbePlan;
  profile: LlmProfile;
  request: ChannelProbeRequest;
  requestId: string;
  observer: TransportObserver;
  executeChat?: ChatExecutor;
}

async function executePlan(
  options: ExecutePlanOptions
): Promise<ProbeExecution> {
  const { model, plan, profile, request, requestId, observer } = options;
  const timeout = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  switch (plan.capability) {
    case "chat": {
      let streamDeltaReceived = false;
      const executeChat =
        options.executeChat ?? resolveChatExecutor(profile.type);
      const response = await executeChat(profile, {
        ...(model.customParameters ?? {}),
        profileId: profile.id,
        modelId: model.id,
        messages: [{ role: "user", content: plan.chat!.prompt }],
        maxTokens: plan.chat!.maxTokens,
        stream: plan.stream,
        timeout,
        signal: request.signal,
        requestId,
        transportObserver: observer,
        relaxIdCerts: profile.relaxIdCerts,
        http1Only: profile.http1Only,
        onStream: (chunk: string) => {
          if (chunk.length > 0) streamDeltaReceived = true;
        },
      });
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
      const embedding = await executeEmbeddingRequest({
        adapter: resolveEmbeddingAdapter(profile.type),
        profile: toProviderProfile(profile),
        request: {
          model: model.id,
          input: plan.embedding!.input,
          requestId,
        },
        transport: mobileLlmTransport,
        transportOptions: transportOptions(
          profile,
          request,
          requestId,
          observer
        ),
      });
      return {
        response: {
          content: `向量维度 ${embedding.data[0]?.embedding.length ?? 0}`,
          usage: {
            promptTokens: embedding.usage.promptTokens,
            completionTokens: 0,
            totalTokens: embedding.usage.totalTokens,
          },
        },
        validation: { capability: plan.capability, embedding },
      };
    }
    case "rerank": {
      const rerank = await executeRerankRequest({
        adapter: rerankAdapter,
        profile: toProviderProfile(profile),
        request: {
          model: model.id,
          query: plan.rerank!.query,
          documents: plan.rerank!.documents,
          requestId,
        },
        transport: mobileLlmTransport,
        transportOptions: transportOptions(
          profile,
          request,
          requestId,
          observer
        ),
      });
      const totalTokens = rerank.usage?.totalTokens ?? 0;
      return {
        response: {
          content: `返回 ${rerank.results.length} 条排序结果`,
          usage: totalTokens
            ? { promptTokens: totalTokens, completionTokens: 0, totalTokens }
            : undefined,
        },
        validation: {
          capability: plan.capability,
          rerank,
          rerankDocumentCount: plan.rerank!.documents.length,
        },
      };
    }
    case "image":
    case "audio": {
      const media = await executeSyncMediaRequest({
        adapter:
          plan.capability === "audio"
            ? openAiAudioAdapter
            : resolveImageAdapter(profile.type),
        profile: toProviderProfile(profile),
        request: {
          kind: plan.capability,
          model: model.id,
          prompt: plan.media!.prompt,
          count: 1,
          size: "1024x1024",
          audio: { voice: "alloy", format: "mp3" },
        },
        transport: mobileLlmTransport,
        transportOptions: transportOptions(
          profile,
          request,
          requestId,
          observer
        ),
      });
      const validationResponse =
        plan.capability === "image"
          ? {
              images: media.assets.map((asset) =>
                asset.kind === "remote-url"
                  ? { url: asset.url }
                  : asset.kind === "inline-base64"
                    ? { b64_json: asset.data }
                    : {}
              ),
            }
          : {
              audioData:
                (media.binary
                  ? (media.binary.slice().buffer as ArrayBuffer)
                  : undefined) ??
                (media.assets[0]?.kind === "inline-base64"
                  ? media.assets[0].data
                  : undefined),
            };
      return {
        response: { content: media.content },
        validation: {
          capability: plan.capability,
          response: validationResponse,
        },
      };
    }
    case "video":
    case "music":
      throw new Error("该能力不支持自动检查");
  }
}

function resolveChatExecutor(provider: string): ChatExecutor {
  switch (provider) {
    case "openai-responses":
      return callOpenAiResponsesApi;
    case "claude":
      return callClaudeApi;
    case "gemini":
      return callGeminiApi;
    case "cohere":
      return callCohereApi;
    case "vertexai":
      return callVertexAiApi;
    default:
      return callOpenAiCompatibleApi;
  }
}

function resolveEmbeddingAdapter(provider: string) {
  switch (provider) {
    case "gemini":
      return geminiEmbeddingAdapter;
    case "cohere":
      return cohereEmbeddingAdapter;
    case "vertexai":
      return vertexEmbeddingAdapter;
    default:
      return openAiEmbeddingAdapter;
  }
}

function resolveImageAdapter(provider: string) {
  if (provider === "gemini") return geminiImageAdapter;
  if (provider === "siliconflow") return siliconFlowImageAdapter;
  return openAiImageAdapter;
}

function transportOptions(
  profile: LlmProfile,
  request: ChannelProbeRequest,
  requestId: string,
  observer: TransportObserver
) {
  return {
    requestId,
    timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: request.signal,
    observer,
    network: {
      strategy: profile.networkStrategy,
      relaxInvalidCerts: profile.relaxIdCerts,
      http1Only: profile.http1Only,
    },
  };
}

function toProviderProfile(profile: LlmProfile): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKeys[0],
    headers: profile.customHeaders,
    endpoints: profile.customEndpoints,
    options: profile.options,
  };
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
    errorMessage: "未执行",
    errorDetail: "检查在执行前已停止",
    testedAt,
  };
}

function capabilityLabel(capability: string): string {
  return { video: "视频", music: "音乐" }[capability] ?? capability;
}
