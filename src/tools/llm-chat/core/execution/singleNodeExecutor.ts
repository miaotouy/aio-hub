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

import type {
  LlmRequestOptions,
  LlmResponse,
} from "../../../../llm-apis/common";
import type { LlmProfile } from "../../../../types/llm-profiles";
import type { Asset } from "../../../../types/asset-management";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
  LlmParameters,
} from "../../types";
import type { ChatSettings } from "../../types/settings";
import type { PipelineContext } from "../../types/pipeline";
import type { SnapshotRecorderContext } from "../../services/requestSnapshotRecorder";
import type {
  SingleNodeExecuteParams,
  SingleNodeExecuteResult,
  CreateNodeConfig,
} from "./types";
import { normalizeContinuationSettings } from "../../../../llm-apis/continuation";
import { VcpStreamSegmenter } from "../tool-calling/vcp-stream-segmenter";
import { resolveMessageDisplayStatus } from "../../utils/messageStatus";
import {
  DEFAULT_RETRY_STATUS_CODES,
  isRetryableStatusCodeFromConfig,
} from "../../utils/retryStatusCodes";
import {
  freezeSnapshotSources,
  createSnapshotPipelineTrace,
} from "../../services/requestSnapshotProjection";
import { waitForExecutionDelay } from "./waitForExecutionDelay";

/** Host services for the production single-request execution path. */
export interface SingleNodeExecutionPorts {
  getSettings(): ChatSettings;
  getSessionIndex(sessionId: string): ChatSessionIndex | undefined;
  getProfileById(profileId: string): LlmProfile | undefined;
  buildEffectiveParameters(parameters: LlmParameters): Record<string, any>;
  getAvailableAnchors(): unknown[];
  loadWorldbooks(ids: string[]): Promise<unknown[] | undefined>;
  ensureTranscriptions(
    assets: Asset[],
    modelId: string,
    profileId: string,
    forceAssetIds?: Set<string>
  ): Promise<Map<string, Asset>>;
  executePipeline(context: PipelineContext): Promise<unknown>;
  /** Keep the host's existing channel selection, fallback and request capture. */
  sendRequest(options: LlmRequestOptions): Promise<LlmResponse>;
  handleStreamUpdate(
    session: ChatSessionDetail,
    nodeId: string,
    chunk: string,
    isReasoning: boolean
  ): void;
  completeStreamSegment(session: ChatSessionDetail, nodeId: string): void;
  validateAndFixUsage(
    response: any,
    modelId: string,
    messages: SingleNodeExecuteResult["messagesForRequest"]
  ): Promise<void>;
  finalizeNode(
    session: ChatSessionDetail,
    nodeId: string,
    response: any,
    agentId: string
  ): Promise<void>;
  checkAndCompress(
    index: ChatSessionIndex,
    session: ChatSessionDetail
  ): Promise<unknown>;
  isAbortError(error: unknown, signal?: AbortSignal): boolean;
  nodes: {
    createNode(config: CreateNodeConfig): ChatMessageNode;
    addNodeToSession(session: ChatSessionDetail, node: ChatMessageNode): void;
    reparentSubtree(
      session: ChatSessionDetail,
      childId: string,
      parentId: string
    ): unknown;
    getNodePath(session: ChatSessionDetail, nodeId: string): ChatMessageNode[];
    updateActiveLeaf(session: ChatSessionDetail, nodeId: string): void;
  };
  snapshots: {
    loadSettings(): Promise<{ enabled: boolean; saveTextPreview: boolean }>;
    prepare(sessionId: string): Promise<number>;
    reportError(error: unknown): void;
    createRecorder(context: SnapshotRecorderContext): {
      capture: NonNullable<LlmRequestOptions["requestCapture"]>;
      supplement(response: LlmResponse): void;
    };
  };
  logger: {
    info(message: string, ...details: unknown[]): void;
    warn(message: string, ...details: unknown[]): void;
  };
}

/** 从错误对象中提取数字 HTTP 状态码，非数字枚举值（如 INVALID_ARGUMENT）返回 undefined */
function readErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidates = [
    (error as any).code,
    (error as any).status,
    (error as any).statusCode,
    (error as any).httpStatus,
    (error as any).response?.status,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Executes one model turn without owning a window or reactive store. */
export async function executeSingleNode(
  params: SingleNodeExecuteParams,
  ports: SingleNodeExecutionPorts
): Promise<SingleNodeExecuteResult> {
  const logger = ports.logger;
  const {
    session,
    assistantNode,
    currentPathToUserNode,
    isContinuation,
    agentConfig,
    executionAgent,
    effectiveUserProfile,
    abortController,
  } = params;

  const throwIfCancelled = () => abortController.signal.throwIfAborted();
  throwIfCancelled();
  const continuationSettings = normalizeContinuationSettings(
    ports.getSettings().continuation
  );
  if (isContinuation) {
    assistantNode.metadata ??= {};
    assistantNode.metadata.continuationDeduplicate =
      continuationSettings.deduplicate;
  }

  const snapshotSettings = await ports.snapshots.loadSettings();
  throwIfCancelled();
  let snapshotEpoch: number | undefined;
  if (snapshotSettings.enabled) {
    try {
      snapshotEpoch = await ports.snapshots.prepare(session.id);
    } catch (error) {
      ports.snapshots.reportError(error);
    }
  }
  throwIfCancelled();
  const snapshotPreview = snapshotSettings.saveTextPreview;
  const snapshotTrace =
    snapshotEpoch !== undefined ? createSnapshotPipelineTrace() : undefined;

  // 1. 准备参数
  const effectiveParams = ports.buildEffectiveParameters(
    agentConfig.parameters
  );

  // 保存参数快照到节点元数据
  assistantNode.metadata = {
    ...assistantNode.metadata,
    requestParameters: {
      ...effectiveParams,
      toolCallingEnabled: executionAgent.toolCallConfig?.enabled ?? false,
    },
  };
  if (session.nodes && session.nodes[assistantNode.id]) {
    session.nodes[assistantNode.id].metadata = assistantNode.metadata;
  }

  // 2. 构建 Pipeline 上下文
  logger.info("开始执行上下文构建管道...");

  const profile = ports.getProfileById(agentConfig.profileId);
  const model = profile?.models.find((m) => m.id === agentConfig.modelId);
  const capabilities = model?.capabilities || {};
  const sessionIndex = ports.getSessionIndex(session.id);

  const pipelineContext: PipelineContext = {
    signal: abortController.signal,
    messages: [],
    index: sessionIndex as ChatSessionIndex,
    detail: session,
    userProfile: effectiveUserProfile || undefined,
    agentConfig: executionAgent,
    settings: ports.getSettings(),
    capabilities,
    isVcpTextChannel: params.splitVcpResponses,
    timestamp: Date.now(),
    sharedData: new Map<string, any>(),
    logs: [],
    traceProcessor: snapshotTrace?.trace,
  };

  // 将额外信息放入 sharedData
  if (model) pipelineContext.sharedData.set("model", model);
  if (profile) pipelineContext.sharedData.set("profile", profile);

  // 填充额外数据
  pipelineContext.sharedData.set("pathToUserNode", currentPathToUserNode);
  pipelineContext.sharedData.set(
    "transcriptionConfig",
    ports.getSettings().transcription
  );

  // 获取锚点定义
  pipelineContext.sharedData.set(
    "anchorDefinitions",
    ports.getAvailableAnchors()
  );

  // 预加载世界书
  const allWorldbookIds = Array.from(
    new Set([
      ...(ports.getSettings().worldbookIds || []),
      ...(effectiveUserProfile?.worldbookIds || []),
      ...(executionAgent.worldbookIds || []),
    ])
  );

  if (allWorldbookIds.length > 0) {
    const loadedWorldbooks = await ports.loadWorldbooks(allWorldbookIds);
    throwIfCancelled();
    pipelineContext.sharedData.set("loadedWorldbooks", loadedWorldbooks);
  }

  // 处理转写任务预处理
  const allAttachments = currentPathToUserNode.flatMap(
    (node) => node.attachments || []
  );

  if (allAttachments.length > 0) {
    try {
      const forceAssetIds = new Set<string>();
      const config = ports.getSettings().transcription;

      if (
        config.enabled &&
        config.strategy === "smart" &&
        config.forceTranscriptionAfter > 0
      ) {
        for (let i = 0; i < currentPathToUserNode.length; i++) {
          const node = currentPathToUserNode[i];
          const nodeDepth = currentPathToUserNode.length - 1 - i;

          if (nodeDepth >= config.forceTranscriptionAfter && node.attachments) {
            for (const asset of node.attachments) {
              if (
                asset.type === "image" ||
                asset.type === "audio" ||
                asset.type === "video"
              ) {
                forceAssetIds.add(asset.id);
              }
            }
          }
        }
      }

      const updatedAssetsMap = await ports.ensureTranscriptions(
        allAttachments,
        agentConfig.modelId,
        agentConfig.profileId,
        forceAssetIds.size > 0 ? forceAssetIds : undefined
      );
      throwIfCancelled();
      pipelineContext.sharedData.set("updatedAssetsMap", updatedAssetsMap);
    } catch (error) {
      throwIfCancelled();
      logger.warn("等待转写任务完成时出错或超时", error);
      const fallbackMap = new Map<string, Asset>();
      for (const asset of allAttachments) {
        fallbackMap.set(asset.id, asset);
      }
      pipelineContext.sharedData.set("updatedAssetsMap", fallbackMap);
    }
  }

  // 3. 执行上下文管道
  throwIfCancelled();
  await ports.executePipeline(pipelineContext);
  throwIfCancelled();
  const messages = pipelineContext.messages;

  const snapshotSources =
    snapshotEpoch !== undefined
      ? freezeSnapshotSources(
          messages,
          pipelineContext.sharedData.get("snapshotMacroExecutions"),
          snapshotPreview
        )
      : undefined;

  // 4. 发送请求：标记实际续写节点，保留其后的上下文注入顺序。
  let continuationIndex = isContinuation
    ? messages.findIndex(
        (msg) => msg.role === "assistant" && msg.sourceId === assistantNode.id
      )
    : -1;
  if (
    isContinuation &&
    typeof assistantNode.metadata?.continuationPrefix === "string" &&
    continuationIndex < 0 &&
    messages[messages.length - 1]?.role === "assistant"
  ) {
    continuationIndex = messages.length - 1;
  }
  const messagesForRequest = messages.map((msg, index) => {
    return {
      role: msg.role as any,
      ...(snapshotSources
        ? { sourceKeys: snapshotSources.messageKeys[index] }
        : {}),
      content: msg.content,
      reasoningContent: msg.reasoningContent,
      reasoningArtifacts: msg.reasoningArtifacts,
      prefix: index === continuationIndex ? true : undefined,
    };
  });

  const maxRetries = ports.getSettings().requestSettings.maxRetries;
  const retryInterval = ports.getSettings().requestSettings.retryInterval;
  const retryMode = ports.getSettings().requestSettings.retryMode;

  let hasReceivedStreamData = false;
  let response: any = null;
  const splitVcpResponses =
    params.splitVcpResponses &&
    ports.getSettings().uiPreferences.splitVcpResponses &&
    ports.getSettings().uiPreferences.isStreaming;
  const segmenter = splitVcpResponses ? new VcpStreamSegmenter() : undefined;
  const segmentNodes = new Map<number, ChatMessageNode>();
  let hasResponseChunks = false;
  let activeStreamNode = session.nodes[assistantNode.id] ?? assistantNode;
  let nextAssistantStartTime: number | undefined;

  const onResponseChunk: NonNullable<LlmRequestOptions["onResponseChunk"]> = (
    chunk
  ) => {
    if (!segmenter) return;
    hasResponseChunks = true;
    const receivedAt = Date.now();
    // Tool-end/separator marks the earliest observable start of the next
    // model round. Older servers only expose the last tool result chunk.
    if (/^chatcmpl-(?:vcp-end-|VCP-separator-)/.test(chunk.responseId ?? "")) {
      nextAssistantStartTime = receivedAt;
    }
    const update = segmenter.push(chunk);
    if (!update) return;
    const { segment, contentDelta, reasoningDelta } = update;
    let node = segmentNodes.get(segment.index);
    if (!node) {
      if (segment.index === 0) {
        node = session.nodes[assistantNode.id] ?? assistantNode;
        node.role = segment.kind;
      } else {
        ports.completeStreamSegment(session, activeStreamNode.id);
        const original = assistantNode.metadata;
        node = ports.nodes.createNode({
          role: segment.kind,
          content: "",
          parentId: activeStreamNode.id,
          status: "waiting",
          metadata: {
            agentId: original?.agentId,
            profileId: original?.profileId,
            modelId: original?.modelId,
            profileName: original?.profileName,
            modelName: original?.modelName,
            modelIcon: original?.modelIcon,
            providerType: original?.providerType,
            requestParameters: original?.requestParameters,
            ...(segment.kind === "assistant"
              ? {
                  requestStartTime:
                    nextAssistantStartTime ??
                    activeStreamNode.metadata?.requestEndTime ??
                    receivedAt,
                }
              : {}),
          },
        });
        // Insert each phase before queued follow-ups so their paths keep
        // depending on the active request as its generation marker advances.
        // Chained mode stores the queue marker on the user's assistant child.
        const queuedChildren = activeStreamNode.childrenIds.filter((id) => {
          const child = session.nodes[id];
          if (!child) return false;
          return (
            resolveMessageDisplayStatus(child) === "queued" ||
            (child.role === "user" &&
              child.childrenIds.some((childId) => {
                const reply = session.nodes[childId];
                return reply && resolveMessageDisplayStatus(reply) === "queued";
              }))
          );
        });
        const selectedChildId = activeStreamNode.lastSelectedChildId;
        ports.nodes.addNodeToSession(session, node);
        // Cache the session proxy so metadata replacements notify stream consumers.
        node = session.nodes[node.id];
        for (const childId of queuedChildren) {
          ports.nodes.reparentSubtree(session, childId, node.id);
        }
        if (selectedChildId && queuedChildren.includes(selectedChildId)) {
          activeStreamNode.lastSelectedChildId = node.id;
          node.lastSelectedChildId = selectedChildId;
        }

        const responseNodeId = node.id;
        if (session.activeLeafId === activeStreamNode.id) {
          ports.nodes.updateActiveLeaf(session, responseNodeId);
        } else if (
          ports.nodes
            .getNodePath(session, session.activeLeafId)
            .some((ancestor) => ancestor.id === responseNodeId)
        ) {
          // Keep the queued leaf selected and refresh its reparented path.
          ports.nodes.updateActiveLeaf(session, session.activeLeafId);
        }
      }
      segmentNodes.set(segment.index, node);
      activeStreamNode = node;
      params.onResponseNode?.(node);
    }
    node.metadata = {
      ...node.metadata,
      vcpResponse: {
        requestId: assistantNode.id,
        kind: segment.kind,
        responseId: segment.responseId,
        finishReason: segment.finishReason,
        toolStatus: segment.toolStatus,
        contextReplay: { ...segment.contextReplay },
      },
      ...(segment.usage ? { usage: segment.usage } : {}),
      ...(segment.finishReason && !node.metadata?.requestEndTime
        ? { requestEndTime: Date.now() }
        : {}),
      ...(segment.toolCalls
        ? {
            toolCalls: segment.toolCalls.map((call, index) => ({
              ...call,
              requestId: `${assistantNode.id}:vcp:${segment.index}:${index}`,
              resultMetadata: { source: "vcp-upstream" },
            })),
          }
        : {}),
    };
    if (contentDelta || reasoningDelta) {
      hasReceivedStreamData = true;
      if (segment.kind === "tool") {
        nextAssistantStartTime = receivedAt;
      } else {
        node.metadata.requestStartTime ??= receivedAt;
        node.metadata.firstTokenTime ??= receivedAt;
        nextAssistantStartTime = undefined;
      }
    }
    if (contentDelta)
      ports.handleStreamUpdate(session, node.id, contentDelta, false);
    if (reasoningDelta)
      ports.handleStreamUpdate(session, node.id, reasoningDelta, true);
  };

  const snapshotRecorder =
    snapshotSources && snapshotEpoch !== undefined
      ? ports.snapshots.createRecorder({
          sessionId: session.id,
          requestId: assistantNode.id,
          triggerNodeId:
            currentPathToUserNode[currentPathToUserNode.length - 1]?.id,
          logicalProfileId: agentConfig.profileId,
          logicalModelId: agentConfig.modelId,
          sources: snapshotSources.sources,
          transformations: snapshotTrace?.finish(),
          epoch: snapshotEpoch,
          saveTextPreview: snapshotPreview,
          assistantNodeIds: () => [
            ...new Set([
              assistantNode.id,
              ...[...segmentNodes.values()].map((node) => node.id),
            ]),
          ],
        })
      : undefined;

  let activeAttempt: number | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const canUpdate = () =>
      activeAttempt === attempt && !abortController.signal.aborted;
    try {
      throwIfCancelled();
      activeAttempt = attempt;
      response = await ports.sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        requestId: assistantNode.id,
        messages: messagesForRequest,
        inspectorContext: {
          toolName: "llm-chat",
          sessionId: session.id,
          purpose: "chat",
        },
        ...effectiveParams,
        continuation: isContinuation ? continuationSettings : undefined,
        requestCapture: snapshotRecorder?.capture,
        ...(splitVcpResponses
          ? {
              streamOptions: {
                ...effectiveParams.streamOptions,
                includeUsage: true,
              },
              onResponseChunk: (chunk) => {
                if (canUpdate()) onResponseChunk(chunk);
              },
            }
          : {}),
        stream: ports.getSettings().uiPreferences.isStreaming,
        signal: abortController.signal,
        timeout: ports.getSettings().requestSettings.timeout,
        onStream: ports.getSettings().uiPreferences.isStreaming
          ? (chunk: string) => {
              if (!canUpdate() || hasResponseChunks) return;
              hasReceivedStreamData = true;
              ports.handleStreamUpdate(session, assistantNode.id, chunk, false);
            }
          : undefined,
        onReasoningStream: ports.getSettings().uiPreferences.isStreaming
          ? (chunk: string) => {
              if (!canUpdate() || hasResponseChunks) return;
              hasReceivedStreamData = true;
              ports.handleStreamUpdate(session, assistantNode.id, chunk, true);
            }
          : undefined,
        onPartialImage: ports.getSettings().uiPreferences.isStreaming
          ? (base64: string, index: number) => {
              if (!canUpdate()) return;
              // 这是流式预览图，我们存入元数据供 UI 渲染，避免污染正文
              if (!session.nodes || !session.nodes[activeStreamNode.id]) return;
              const node = session.nodes[activeStreamNode.id];
              if (!node.metadata) node.metadata = {};
              const previews = [...(node.metadata.partialImagePreviews || [])];
              previews[index] = base64;
              node.metadata.partialImagePreviews = previews;
            }
          : undefined,
      });
      activeAttempt = undefined;
      throwIfCancelled();
      break;
    } catch (error) {
      activeAttempt = undefined;
      const isAbort = ports.isAbortError(error, abortController.signal);
      // 检查 error 对象是否为 400 错误或 INVALID_ARGUMENT，避免重试
      const isBadRequest =
        error &&
        typeof error === "object" &&
        (("code" in error && (error as any).code === 400) ||
          ("status" in error && (error as any).status === "INVALID_ARGUMENT"));

      // 识别 429 (限流) 错误
      const isRateLimit =
        error &&
        typeof error === "object" &&
        (("code" in error && (error as any).code === 429) ||
          ("status" in error && (error as any).status === 429) ||
          (error instanceof Error &&
            /429|too many requests|rate limit/i.test(error.message)));

      // 自动重试状态码白名单：有明确状态码且未命中白名单时不再重试
      // （2xx / 504 / 524 始终排除）；无状态码的超时/网络错误不受限。
      const statusCode = readErrorStatusCode(error);
      const retryStatusConfig =
        ports.getSettings().requestSettings.retryStatusCodes ??
        DEFAULT_RETRY_STATUS_CODES;
      const statusAllowsRetry =
        statusCode === undefined ||
        isRetryableStatusCodeFromConfig(statusCode, retryStatusConfig);

      const shouldRetry =
        !(
          error &&
          typeof error === "object" &&
          "retryable" in error &&
          error.retryable === false
        ) &&
        !isAbort &&
        !isBadRequest &&
        !hasReceivedStreamData &&
        statusAllowsRetry &&
        attempt < maxRetries;

      if (shouldRetry) {
        let delayTime =
          retryMode === "exponential"
            ? retryInterval * Math.pow(2, attempt)
            : retryInterval;

        // 如果是限流错误，追加 5000ms 惩罚性等待
        if (isRateLimit) {
          delayTime += 5000;
          logger.warn(
            `⚠️ 遭遇 429 限流，将进行惩罚性等待 ${delayTime}ms 后重试...`,
            { attempt: attempt + 1, error }
          );
        } else {
          logger.info(`请求失败，准备进行第 ${attempt + 1} 次重试...`, {
            delayTime,
            error,
          });
        }

        await waitForExecutionDelay(delayTime, abortController.signal);
        continue;
      }
      if (
        !statusAllowsRetry &&
        statusCode !== undefined &&
        !isAbort &&
        !isBadRequest
      ) {
        logger.info(`状态码 ${statusCode} 不在自动重试号段内，跳过重试`, {
          attempt,
          statusCode,
        });
      }
      // Flush through the handler that owns the stream buffers before the
      // orchestrator records the error through its separate handler instance.
      const interruptedNodes = segmentNodes.size
        ? segmentNodes.values()
        : [assistantNode];
      for (const node of interruptedNodes) {
        ports.completeStreamSegment(session, node.id);
      }
      throw error;
    }
  }

  try {
    if (response) {
      if (segmenter?.segments.length) {
        const priorMessages = [...messagesForRequest];
        const lastAssistant = [...segmenter.segments]
          .reverse()
          .find((segment) => segment.kind === "assistant");
        for (const segment of segmenter.segments) {
          const node = segmentNodes.get(segment.index)!;
          if (segment.kind === "tool") {
            ports.completeStreamSegment(session, node.id);
          } else {
            const segmentResponse = {
              ...response,
              content: segment.content,
              reasoningContent: segment.reasoningContent,
              reasoningArtifacts:
                segment === lastAssistant
                  ? response.reasoningArtifacts
                  : undefined,
              usage: segment.usage,
              finishReason: segment.finishReason,
              images: segment === lastAssistant ? response.images : undefined,
              toolCalls: undefined,
            };
            await ports.validateAndFixUsage(
              segmentResponse,
              agentConfig.modelId,
              priorMessages as any
            );
            throwIfCancelled();
            await ports.finalizeNode(
              session,
              node.id,
              segmentResponse,
              executionAgent.id
            );
          }
          priorMessages.push({
            role: segment.kind === "tool" ? "user" : "assistant",
            content: segment.content,
            reasoningContent: segment.reasoningContent,
            reasoningArtifacts: undefined,
            prefix: undefined,
          });
        }
      } else {
        await ports.validateAndFixUsage(
          response,
          agentConfig.modelId,
          messagesForRequest as any
        );
        throwIfCancelled();
        await ports.finalizeNode(
          session,
          assistantNode.id,
          response,
          executionAgent.id
        );
      }

      throwIfCancelled();
      snapshotRecorder?.supplement(response);

      try {
        const sessionIndex = ports.getSessionIndex(session.id);
        if (sessionIndex) {
          // 摘要任务独立于本次流式回复收尾；下一次请求在编排层等待。
          void ports.checkAndCompress(sessionIndex, session).catch((error) => {
            logger.warn("自动上下文压缩执行失败", error);
          });
        }
      } catch (error) {
        logger.warn("自动上下文压缩执行失败", error);
      }
    }
  } catch (error) {
    for (const node of segmentNodes.size
      ? segmentNodes.values()
      : [assistantNode]) {
      ports.completeStreamSegment(session, node.id);
    }
    throw error;
  }

  return {
    response,
    messagesForRequest,
  };
}
