import {
  executeChannelRequest,
  resolveChannelReplayTarget,
  type LlmOperation,
} from "@aiohub/llm-core";
import { validateVirtualChatTools } from "@/utils/llm-virtual-profile";
import { resolveChannelToolHandling } from "@/tools/llm-chat/core/tool-calling/channel-tool-handling";
import { useVcpStore } from "@/tools/vcp-connector/stores/vcpConnectorStore";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  LlmRequestOptions,
  MediaGenerationOptions,
  LlmResponse,
} from "@/llm-apis/common";

export function getRequestOperation(
  options: LlmRequestOptions | MediaGenerationOptions,
  profile?: LlmProfile
): LlmOperation {
  const model = profile?.models.find((m) => m.id === options.modelId);
  if (options.embeddingInput !== undefined) return "embedding";
  if (options.rerankQuery !== undefined) return "rerank";
  if (profile?.type === "virtual" && model?.virtualBindings?.chat)
    return "chat";
  if (
    (options as LlmRequestOptions & { _forceChatMode?: boolean })
      ._forceChatMode ||
    model?.capabilities?.preferChat
  )
    return "chat";
  const c = model?.capabilities;
  return c?.videoGeneration
    ? "video"
    : c?.imageGeneration
      ? "image"
      : c?.musicGeneration
        ? "music"
        : c?.audioGeneration
          ? "audio"
          : "chat";
}

export function getRequestCapabilities(
  options: LlmRequestOptions | MediaGenerationOptions
): string[] {
  const required = new Set<string>();
  if (options.tools?.length) required.add("toolUse");
  if (
    typeof options.responseFormat === "object" &&
    options.responseFormat.type !== "text"
  )
    required.add("jsonOutput");
  if (options.thinkingEnabled) required.add("thinking");
  if (options.webSearchEnabled) required.add("webSearch");
  for (const message of options.messages ?? []) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === "image") required.add("vision");
      if (part.type === "audio") required.add("audio");
      if (part.type === "video") required.add("video");
      if (part.type === "document") required.add("document");
    }
  }
  return [...required];
}

export async function sendChannelRequest(
  options: LlmRequestOptions | MediaGenerationOptions,
  getProfiles: () => LlmProfile[],
  sendPhysical: (
    options: LlmRequestOptions | MediaGenerationOptions
  ) => Promise<LlmResponse>
): Promise<LlmResponse> {
  const profile = getProfiles().find((p) => p.id === options.profileId);
  if (!profile || profile.type !== "virtual") return sendPhysical(options);
  if (options.apiKey)
    throw new Error("虚拟渠道使用各成员自身的密钥，请在成员渠道中配置");
  const operation = getRequestOperation(options, profile);
  if (
    !["chat", "embedding"].includes(operation) ||
    options.transcriptionInput ||
    options.rerankQuery !== undefined
  )
    throw new Error("该用途的虚拟渠道执行尚未开放，请选择对应的物理渠道");
  if (operation === "chat") {
    const wsUrl = useVcpStore().config.wsUrl;
    validateVirtualChatTools(
      profile,
      options.modelId,
      getProfiles(),
      (member) => resolveChannelToolHandling(member, wsUrl).handling
    );
  }
  const pinnedTarget = resolveChannelReplayTarget(
    (options.messages ?? []).flatMap(
      (message) => message.reasoningArtifacts ?? []
    ),
    profile.models.find((model) => model.id === options.modelId)
      ?.virtualBindings?.[operation]?.length ?? 0
  );
  const logicalRequestId = options.requestId ?? crypto.randomUUID();
  const result = await executeChannelRequest({
    pinnedTarget,
    profile,
    modelId: options.modelId,
    operation,
    getProfiles,
    signal: options.signal,
    timeoutMs: options.timeout,
    allowDisabledProfile: options.allowDisabledProfile,
    requiredCapabilities: getRequestCapabilities(options),
    execute: ({
      profile: member,
      model,
      signal,
      timeoutMs,
      markOutput,
      attempt,
    }) => {
      const active = () => !signal.aborted;
      return sendPhysical({
        ...options,
        _forceChatMode: operation === "chat",
        requestId: logicalRequestId + ":channel:" + attempt,
        profileId: member.id,
        modelId: model.id,
        signal,
        timeout: timeoutMs,
        // Authentication and network policy always belong to the selected member.
        apiKey: undefined,
        forceProxy: undefined,
        relaxIdCerts: undefined,
        http1Only: undefined,
        networkStrategy: undefined,
        inspectorContext: {
          ...options.inspectorContext,
          logicalProfileId: options.profileId,
          logicalModelId: options.modelId,
          logicalRequestId,
          channelAttempt: attempt,
        },
        transportObserver: {
          ...options.transportObserver,
          onResponseChunk: (event) => {
            if (active()) {
              markOutput();
              options.transportObserver?.onResponseChunk?.(event);
            }
          },
        },
        onStream: (chunk) => {
          if (active() && chunk) {
            markOutput();
            options.onStream?.(chunk);
          }
        },
        onReasoningStream: (chunk) => {
          if (active() && chunk) {
            markOutput();
            options.onReasoningStream?.(chunk);
          }
        },
        onResponseChunk: options.onResponseChunk
          ? (chunk) => {
              if (active()) {
                if (chunk.content || chunk.reasoningContent) markOutput();
                options.onResponseChunk?.(chunk);
              }
            }
          : undefined,
        onPartialImage: (image, index) => {
          if (active()) {
            markOutput();
            options.onPartialImage?.(image, index);
          }
        },
        // A submitted asynchronous job stays on its physical channel.
        onMediaProgress: (progress) => {
          if (active()) {
            markOutput();
            options.onMediaProgress?.(progress);
          }
        },
      });
    },
  });
  return {
    ...result.response,
    reasoningArtifacts: result.response.reasoningArtifacts?.map((artifact) => ({
      ...artifact,
      channelTarget: result.execution.actual,
    })),
    channelExecution: result.execution,
  };
}
