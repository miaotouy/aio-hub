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

import { ref, computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { findLastIndex } from "lodash-es";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useMediaTaskManager } from "./useMediaTaskManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useAssetManager } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useMediaGenParamRules } from "./useMediaGenParamRules";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";
import { DEFAULT_MEDIA_TIMEOUT, fetchWithTimeout } from "@/llm-apis/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { embedMetadata } from "@/utils/mediaMetadataManager";
import { writeStandardMediaMetadata } from "@/utils/standardMediaMetadataWriter";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import {
  inferMediaAttachmentType,
  stripAudioDataUrl,
} from "./mediaAttachmentUtils";
import type {
  MediaMetadataWriteSettings,
  MediaTask,
  MediaTaskType,
  MediaMessage,
} from "../types";
import type {
  MediaGenerationOptions,
  LlmMessage,
  LlmMessageContent,
  LlmResponse,
} from "@/llm-apis/common";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("media-generator/manager");
const errorHandler = createModuleErrorHandler("media-generator/manager");

export function useMediaGenerationManager() {
  const taskManager = useMediaTaskManager();
  const userProfileStore = useUserProfileStore();
  const { sendRequest } = useLlmRequest();
  const {
    importAssetFromBytes,
    importAssetFromPath,
    getAssetBasePath,
    getAssetBinary,
  } = useAssetManager();
  const { profiles: allProfiles } = useLlmProfiles();
  const {
    getModelParamRules,
    sanitizeParams,
    usesAspectRatioMode,
    buildXaiSizeParams,
  } = useMediaGenParamRules();
  const isGenerating = ref(false);
  // 使用 Map 管理多个任务的 AbortController
  const abortControllers = ref<Map<string, AbortController>>(new Map());

  const resolveModelSelection = (
    profileId: string | undefined,
    modelId: string | undefined
  ): { profile?: LlmProfile; model?: LlmModelInfo } => {
    const profile = allProfiles.value.find((p) => p.id === profileId);
    const model = profile?.models.find((m) => m.id === modelId);
    return { profile, model };
  };

  const supportsConversationalGeneration = (
    profile: LlmProfile | undefined,
    model: LlmModelInfo | undefined
  ): boolean => {
    return (
      profile?.type === "openai-responses" ||
      model?.capabilities?.preferChat === true
    );
  };

  const supportsReferenceInput = (
    task: MediaTask,
    model: LlmModelInfo | undefined
  ): boolean => {
    if (task.type !== "image" && task.type !== "video") return false;
    return (
      model?.capabilities?.vision === true ||
      model?.capabilities?.imageGeneration === true ||
      model?.capabilities?.videoGeneration === true ||
      model?.capabilities?.iterativeRefinement === true
    );
  };

  const getMessageResultAssets = (message: MediaMessage): Asset[] => {
    const taskId =
      message.metadata?.taskId ||
      message.metadata?.taskSnapshot?.id ||
      message.id;
    const liveTask = taskId ? taskManager.getTask(taskId) : undefined;
    const snapshot = message.metadata?.taskSnapshot;

    const assets = liveTask?.resultAssets?.length
      ? liveTask.resultAssets
      : liveTask?.resultAsset
        ? [liveTask.resultAsset]
        : snapshot?.resultAssets?.length
          ? snapshot.resultAssets
          : snapshot?.resultAsset
            ? [snapshot.resultAsset]
            : [];

    return dedupeAssets(assets);
  };

  const dedupeAssets = <T extends { id?: string; path?: string; url?: string }>(
    assets: T[]
  ): T[] => {
    const seen = new Set<string>();
    return assets.filter((asset) => {
      const key =
        asset.id ||
        asset.path ||
        asset.url ||
        JSON.stringify(asset).slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getMessageVisualAssets = (message: MediaMessage): Asset[] => {
    const assets = [...(message.attachments || [])];
    if (message.role === "assistant") {
      assets.push(...getMessageResultAssets(message));
    }
    return dedupeAssets(assets).filter((asset) =>
      asset.mimeType?.startsWith("image/")
    );
  };

  const collectSingleTurnReferenceAssets = (
    contextMessages: MediaMessage[],
    task: MediaTask
  ): Asset[] => {
    const { model } = resolveModelSelection(
      task.input.profileId,
      task.input.modelId
    );
    if (!supportsReferenceInput(task, model)) return [];

    const isManualContext =
      task.input.contextMessageIds && task.input.contextMessageIds.length > 0;

    if (isManualContext) {
      return dedupeAssets(
        contextMessages
          .filter((m) => task.input.contextMessageIds?.includes(m.id))
          .flatMap((m) => getMessageVisualAssets(m))
      );
    }

    // 如果用户关闭了参考上一轮，绝对不自动带入
    if (!task.input.includeContext) return [];

    const lastUserIndex = findLastIndex(
      contextMessages,
      (m: MediaMessage) => m.role === "user"
    );
    if (lastUserIndex <= 0) return [];

    const prevAssistant = contextMessages[lastUserIndex - 1];
    if (prevAssistant?.role !== "assistant") return [];
    return getMessageResultAssets(prevAssistant).filter((asset) =>
      asset.mimeType?.startsWith("image/")
    );
  };

  const assetToInputAttachment = (
    asset: Asset
  ): NonNullable<MediaGenerationOptions["inputAttachments"]>[number] | null => {
    if (
      asset.type !== "image" &&
      asset.type !== "video" &&
      asset.type !== "audio"
    ) {
      return null;
    }
    return {
      id: asset.id,
      name: asset.name,
      path: asset.path,
      mimeType: asset.mimeType,
      size: asset.size,
      type: asset.type,
      role: "reference",
    };
  };

  const mergeInputAttachments = (
    base: MediaGenerationOptions["inputAttachments"] | undefined,
    additions: MediaGenerationOptions["inputAttachments"] | undefined
  ): MediaGenerationOptions["inputAttachments"] | undefined => {
    const merged = [...(base || []), ...(additions || [])];
    if (merged.length === 0) return undefined;
    return dedupeAssets(merged);
  };

  const assetToImageContent = async (
    asset: Asset
  ): Promise<LlmMessageContent | null> => {
    if (!asset.mimeType?.startsWith("image/")) return null;
    if (asset.inlineData?.base64) {
      return {
        type: "image",
        imageBase64: `data:${asset.inlineData.mimeType || asset.mimeType};base64,${
          asset.inlineData.base64
        }`,
      };
    }
    if (!asset.path) return null;

    try {
      const buffer = await getAssetBinary(asset.path);
      const base64 = await convertArrayBufferToBase64(buffer);
      return {
        type: "image",
        imageBase64: `data:${asset.mimeType || "image/png"};base64,${base64}`,
      };
    } catch (error) {
      logger.warn("构造多轮上下文图片失败", {
        assetId: asset.id,
        error: String(error),
      });
      return null;
    }
  };

  const buildLlmMessagesFromContext = async (
    context: MediaMessage[]
  ): Promise<LlmMessage[]> => {
    return Promise.all(
      context.map(async (m) => {
        const contentParts: LlmMessageContent[] = [];
        if (m.content) {
          contentParts.push({ type: "text", text: m.content });
        }

        const imageParts = await Promise.all(
          getMessageVisualAssets(m).map((asset) => assetToImageContent(asset))
        );
        contentParts.push(
          ...(imageParts.filter(Boolean) as LlmMessageContent[])
        );

        return {
          role: m.role === "assistant" ? "assistant" : "user",
          content:
            contentParts.length === 1 && contentParts[0].type === "text"
              ? contentParts[0].text
              : contentParts,
        };
      })
    );
  };

  const buildPromptMessage = (
    prompt: string,
    attachments?: MediaGenerationOptions["inputAttachments"]
  ): LlmMessage => {
    const contentParts: LlmMessageContent[] = [];
    if (prompt) {
      contentParts.push({ type: "text", text: prompt });
    }

    attachments?.forEach((attachment) => {
      if (attachment.type !== "image" || !attachment.b64) return;
      contentParts.push({
        type: "image",
        imageBase64: attachment.b64,
      });
    });

    return {
      role: "user",
      content:
        contentParts.length === 1 && contentParts[0].type === "text"
          ? contentParts[0].text
          : contentParts.length > 0
            ? contentParts
            : prompt,
    };
  };

  /**
   * 中止特定任务
   */
  const abortTask = (taskId: string) => {
    const controller = abortControllers.value.get(taskId);
    if (controller) {
      controller.abort();
      abortControllers.value.delete(taskId);
      logger.info("中止了生成任务", { taskId });

      if (abortControllers.value.size === 0) {
        isGenerating.value = false;
      }
    }
  };

  /**
   * 中止所有任务
   */
  const abortAll = () => {
    if (abortControllers.value.size === 0) return;

    for (const [taskId, controller] of abortControllers.value.entries()) {
      controller.abort();
      logger.info("中止了生成任务(批量)", { taskId });
    }
    abortControllers.value.clear();
    isGenerating.value = false;
    logger.info("用户中止了所有生成任务");
  };

  /**
   * 中止生成 (兼容旧接口，中止最近一个或全部)
   */
  const abort = () => {
    abortAll();
  };

  /**
   * 应用上下文规则（裁剪逻辑）
   */
  const applyContextRules = (
    contextMessages: MediaMessage[],
    task: MediaTask
  ): MediaMessage[] => {
    let finalContext = [...contextMessages];
    const shouldIncludeContext = task.input.includeContext;
    const isManualContext =
      task.input.contextMessageIds && task.input.contextMessageIds.length > 0;

    if (isManualContext) {
      finalContext = finalContext.filter((m) =>
        task.input.contextMessageIds?.includes(m.id)
      );
    } else if (!shouldIncludeContext) {
      const lastUserIndex = findLastIndex(
        finalContext,
        (m: MediaMessage) => m.role === "user"
      );
      if (lastUserIndex !== -1) {
        finalContext = [finalContext[lastUserIndex]];
      }
    }
    return finalContext;
  };

  /**
   * 执行媒体生成任务 (核心逻辑)
   * @param task 要执行的任务
   * @param contextMessages 可选的上下文消息列表 (会话模式传入)
   * @param config 可选的请求配置 (超时、重试等)
   */
  const executeGeneration = async (
    task: MediaTask,
    contextMessages?: MediaMessage[],
    config?: {
      timeout?: number;
      maxRetries?: number;
      autoIncludeLastResult?: boolean;
      metadataWrite?: MediaMetadataWriteSettings;
    }
  ) => {
    const taskId = task.id;
    const options = task.input.params as any;
    const type = task.type;

    isGenerating.value = true;
    const controller = new AbortController();
    abortControllers.value.set(taskId, controller);

    try {
      if (
        task.input.params.inputAttachments &&
        (task.input.params.inputAttachments as any[]).length > 0
      ) {
        taskManager.updateTaskStatus(taskId, "processing", {
          statusText: "正在处理附件...",
        });
      } else {
        taskManager.updateTaskStatus(taskId, "processing", {
          statusText: "正在准备生成...",
        });
      }

      // 构造多轮会话上下文
      const requestTimeout = config?.timeout ?? DEFAULT_MEDIA_TIMEOUT;
      const maxRetries = config?.maxRetries ?? 0;
      const { profile: selectedProfile, model: selectedModel } =
        resolveModelSelection(task.input.profileId, task.input.modelId);
      validateMiniMaxTwoStepCover(selectedProfile, task.input.params);
      const canUseConversationContext = supportsConversationalGeneration(
        selectedProfile,
        selectedModel
      );

      let filteredContext: MediaMessage[] = [];
      let finalContext: MediaMessage[] = [];
      if (contextMessages && contextMessages.length > 0) {
        filteredContext = contextMessages.filter(
          (m: MediaMessage) => m.id !== taskId && m.role !== "system"
        );

        if (canUseConversationContext) {
          finalContext = applyContextRules(filteredContext, task);
        } else if (task.input.includeContext) {
          logger.debug("当前生成端点不支持多轮上下文，已降级为单轮请求", {
            profileType: selectedProfile?.type,
            modelId: selectedModel?.id,
          });
        }
      }

      const singleTurnReferenceAttachments = canUseConversationContext
        ? undefined
        : (collectSingleTurnReferenceAssets(filteredContext, task)
            .map((asset) => assetToInputAttachment(asset))
            .filter(Boolean) as MediaGenerationOptions["inputAttachments"]);

      // 处理参考图：将本地 Asset (含 path) 转换为 Base64
      let processedAttachments = mergeInputAttachments(
        task.input.params.inputAttachments,
        singleTurnReferenceAttachments
      );
      if (processedAttachments && (processedAttachments as any[]).length > 0) {
        const maxDim = selectedModel?.capabilities?.maxImageDimension;

        processedAttachments = await Promise.all(
          (processedAttachments as any[]).map(async (att: any) => {
            if (att.path && !att.b64) {
              try {
                let buffer = await getAssetBinary(att.path);
                const attachmentType = inferMediaAttachmentType(att);

                if (attachmentType === "audio") {
                  const base64 = await convertArrayBufferToBase64(buffer);
                  return {
                    ...att,
                    path: undefined,
                    b64: base64,
                  };
                }

                // 模型安全约束缩放
                if (maxDim && maxDim > 0) {
                  try {
                    const dims = await getImageDimensions(buffer);
                    if (dims.width > maxDim || dims.height > maxDim) {
                      buffer = await resizeImage(buffer, {
                        maxWidth: maxDim,
                        maxHeight: maxDim,
                      });
                      logger.debug("媒体生成参考图已缩放", {
                        assetId: att.id,
                        maxDim,
                      });
                    }
                  } catch (e) {
                    logger.warn("参考图缩放失败", e);
                  }
                }

                const base64 = await convertArrayBufferToBase64(buffer);
                const mimeType = att.mimeType || "image/png";
                return {
                  ...att,
                  path: undefined,
                  type: attachmentType,
                  b64: `data:${mimeType};base64,${base64}`,
                };
              } catch (e) {
                logger.error("读取参考附件失败", e, { path: att.path });
                return att;
              }
            }
            return att;
          })
        );
      }

      const minimaxAudioBase64 = extractMinimaxCoverAudioBase64(
        selectedProfile,
        finalMusicMode(task.input.params),
        task.input.params,
        processedAttachments
      );

      let finalOptions = {
        timeout: requestTimeout,
        maxRetries: maxRetries,
        ...options,
        inputAttachments: processedAttachments,
        ...(minimaxAudioBase64 ? { audio_base64: minimaxAudioBase64 } : {}),
        prompt: task.input.params.prompt, // 使用 task 中的 prompt
      };

      if (
        (finalOptions as any).duration !== undefined &&
        (finalOptions as any).durationSeconds === undefined
      ) {
        (finalOptions as any).durationSeconds = Number(
          (finalOptions as any).duration
        );
      }
      if (
        (finalOptions as any).cfgScale !== undefined &&
        (finalOptions as any).guidanceScale === undefined
      ) {
        (finalOptions as any).guidanceScale = Number(
          (finalOptions as any).cfgScale
        );
      }
      if (
        (finalOptions as any).steps !== undefined &&
        (finalOptions as any).numInferenceSteps === undefined
      ) {
        (finalOptions as any).numInferenceSteps = Number(
          (finalOptions as any).steps
        );
      }

      // 应用参数规则清洁
      const rules = getModelParamRules(selectedModel);
      if (rules) {
        if (usesAspectRatioMode(rules)) {
          const ext = finalOptions as any;
          const xaiParams = buildXaiSizeParams(
            ext.aspectRatio || rules.aspectRatioMode?.defaultRatio || "1:1",
            ext.resolution || rules.aspectRatioMode?.defaultResolution
          );
          finalOptions = { ...finalOptions, ...xaiParams };
          delete (finalOptions as any).size;
        }
        finalOptions = sanitizeParams(finalOptions, rules) as any;
      }

      if (canUseConversationContext) {
        const messages =
          finalContext.length > 0
            ? await buildLlmMessagesFromContext(finalContext)
            : [
                buildPromptMessage(
                  task.input.params.prompt,
                  processedAttachments
                ),
              ];

        finalOptions = {
          ...finalOptions,
          messages: messages as any,
        };
      }

      if (selectedProfile?.type === "openai-responses") {
        (finalOptions as any).onPartialImage = (
          base64: string,
          index: number
        ) => {
          const currentTask = taskManager.getTask(taskId);
          const previews = [...(currentTask?.previewUrls || [])];
          previews[index] = base64;
          taskManager.updateTaskStatus(taskId, "processing", {
            statusText: `正在生成预览图 ${index + 1}...`,
            previewUrls: previews,
          });
        };
      }

      taskManager.updateTaskStatus(taskId, "processing", {
        statusText: "正在生成中...",
        progress: 30,
      });

      const response = await sendRequest({
        ...finalOptions,
        inspectorContext: {
          toolName: "media-generator",
          sessionId: taskId,
          purpose: "media-gen",
        },
        signal: controller.signal,
      });

      taskManager.updateTaskStatus(taskId, "processing", {
        statusText: "生成成功，正在入库资产...",
        progress: 90,
      });

      await handleResponseAssets(taskId, response, type, config?.metadataWrite);

      taskManager.updateTaskStatus(taskId, "completed", {
        statusText: "生成完成",
        progress: 100,
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        taskManager.updateTaskStatus(taskId, "error", {
          error: "已中止",
          statusText: "任务已中止",
        });
        return;
      }
      taskManager.updateTaskStatus(taskId, "error", {
        error: error.message || String(error),
        statusText: "生成失败",
      });
      errorHandler.handle(error, {
        userMessage: "媒体生成失败",
        showToUser: false,
      });
    } finally {
      abortControllers.value.delete(taskId);
      if (abortControllers.value.size === 0) {
        isGenerating.value = false;
      }
    }
  };

  /**
   * 构造任务对象 (纯函数，无副作用)
   */
  const buildTask = (
    options: MediaGenerationOptions & {
      contextMessageIds?: string[];
      includeContext?: boolean;
    },
    type: MediaTaskType
  ): MediaTask => {
    const taskId = uuidv4();
    const { profile, model } = resolveModelSelection(
      options.profileId,
      options.modelId
    );
    const shouldIncludeContext =
      options.includeContext ??
      model?.capabilities?.iterativeRefinement ??
      supportsConversationalGeneration(profile, model);

    const finalPrompt = options.prompt || "";

    return {
      id: taskId,
      type,
      status: "pending",
      input: {
        prompt: options.prompt || "",
        negativePrompt: options.negativePrompt,
        modelId: options.modelId,
        profileId: options.profileId,
        params: {
          ...options,
          ...options.params,
          prompt: finalPrompt,
        },
        referenceAssetIds: (options.inputAttachments as any[])
          ?.map((a) => a.path || a.url)
          .filter(Boolean) as string[],
        contextMessageIds: options.contextMessageIds,
        includeContext: shouldIncludeContext,
      },
      progress: 0,
      createdAt: Date.now(),
    };
  };

  /**
   * 直接通过 Task 启动生成 (重试/外部调用专用)
   */
  const startGenerationWithTask = async (
    task: MediaTask,
    contextMessages?: MediaMessage[],
    config?: {
      timeout?: number;
      maxRetries?: number;
      autoIncludeLastResult?: boolean;
      metadataWrite?: MediaMetadataWriteSettings;
    }
  ) => {
    await executeGeneration(task, contextMessages, config);
  };

  /**
   * 处理响应中的资产并导入系统
   */
  const handleResponseAssets = async (
    taskId: string,
    response: LlmResponse,
    type: MediaTaskType,
    metadataWrite?: MediaMetadataWriteSettings
  ) => {
    const task = taskManager.getTask(taskId);
    if (!task) return;

    // 1. 提取所有资产数据
    const resultAssets: any[] = [];
    type ResponseAssetType = "image" | "video" | "audio";
    const responseItems: Array<{ item: any; type: ResponseAssetType }> = [
      ...(response.images || []).map((item) => ({
        item,
        type: "image" as const,
      })),
      ...(response.videos || []).map((item) => ({
        item,
        type: "video" as const,
      })),
      ...(response.audios || []).map((item) => ({
        item,
        type: "audio" as const,
      })),
    ];

    if (responseItems.length === 0) {
      logger.warn("响应中没有媒体资产", {
        taskId,
        contentPreview: response.content?.slice(0, 300),
        hasImages: !!response.images?.length,
        hasVideos: !!response.videos?.length,
        hasAudios: !!response.audios?.length,
      });
      throw new Error(
        response.content
          ? `响应中没有媒体资产：${response.content.slice(0, 120)}`
          : "响应中没有媒体资产"
      );
    }

    // 确定元数据
    const baseMetadata = {
      prompt: task.input.prompt,
      negativePrompt: task.input.negativePrompt,
      modelId: task.input.modelId,
      params: task.input.params,
      revisedPrompt: response.revisedPrompt,
      seed: response.seed,
      genType: type,
      version: "1.0.0",
    };

    for (let i = 0; i < responseItems.length; i++) {
      const { item, type: itemType } = responseItems[i];
      let bytes: ArrayBuffer | null = null;
      let mimeType = "image/png";
      let extension = "png";

      try {
        const mediaItem = item as any;
        if (itemType === "image") {
          mimeType = "image/png";
          extension = "png";
          if (mediaItem.b64_json) {
            bytes = decodeBase64ToArrayBuffer(mediaItem.b64_json);
          } else if (mediaItem.url) {
            // 某些代理商会在 url 字段里返回内嵌的 data:image/... Base64 数据
            const dataUrlMatch = parseDataUrl(mediaItem.url);
            if (dataUrlMatch) {
              // 从 Data URL 中提取 MIME 和 Base64，直接解码，不走 fetch
              if (dataUrlMatch.mimeType) mimeType = dataUrlMatch.mimeType;
              extension = mimeTypeToExtension(mimeType, "png");
              bytes = decodeBase64ToArrayBuffer(dataUrlMatch.base64);
            } else {
              bytes = await fetchAsArrayBuffer(mediaItem.url);
            }
          }
        } else if (itemType === "video") {
          mimeType = "video/mp4";
          extension = "mp4";
          if (mediaItem.b64_json) {
            bytes = decodeBase64ToArrayBuffer(mediaItem.b64_json);
          } else if (mediaItem.url) {
            const dataUrlMatch = parseDataUrl(mediaItem.url);
            if (dataUrlMatch) {
              if (dataUrlMatch.mimeType) mimeType = dataUrlMatch.mimeType;
              extension = mimeTypeToExtension(mimeType, "mp4");
              bytes = decodeBase64ToArrayBuffer(dataUrlMatch.base64);
            } else {
              bytes = await fetchAsArrayBuffer(mediaItem.url);
            }
          }
        } else if (itemType === "audio") {
          const audioFormat = String(mediaItem.format || "mp3").toLowerCase();
          mimeType = audioFormatToMimeType(audioFormat);
          extension = mimeTypeToExtension(mimeType, audioFormat || "mp3");
          if (mediaItem.b64_json) {
            bytes = decodeBase64ToArrayBuffer(mediaItem.b64_json);
          } else if (mediaItem.url) {
            const dataUrlMatch = parseDataUrl(mediaItem.url);
            if (dataUrlMatch) {
              if (dataUrlMatch.mimeType) mimeType = dataUrlMatch.mimeType;
              extension = mimeTypeToExtension(mimeType, extension);
              bytes = decodeBase64ToArrayBuffer(dataUrlMatch.base64);
            } else {
              bytes = await fetchAsArrayBuffer(mediaItem.url);
            }
          }
        }

        let asset;
        if (bytes) {
          if (itemType === "audio" && metadataWrite?.enabled) {
            try {
              bytes = await writeStandardMediaMetadata(
                bytes,
                mimeType,
                buildStandardAudioMetadata({
                  task,
                  response,
                  itemIndex: i,
                  settings: metadataWrite,
                })
              );
            } catch (e) {
              logger.warn("写入标准音频元数据失败，已继续入库", e);
            }
          }

          // 嵌入 AIO 生成参数元数据
          try {
            bytes = await embedMetadata(bytes, mimeType, {
              ...baseMetadata,
              itemIndex: i,
            });
          } catch (e) {
            logger.warn("嵌入元数据失败", e);
          }

          asset = await importAssetFromBytes(
            bytes,
            `generated-${taskId}-${i}.${extension}`,
            {
              sourceModule: "media-generator",
              origin: {
                type: "generated",
                source: response.revisedPrompt || taskId,
                sourceModule: "media-generator",
              },
            }
          );
        } else if (
          item.url &&
          (item.url.startsWith("file://") ||
            item.url.startsWith("/") ||
            item.url.startsWith("appdata://"))
        ) {
          // 如果是本地路径且无法获取 bytes，尝试直接导入
          asset = await importAssetFromPath(item.url, {
            sourceModule: "media-generator",
            origin: {
              type: "generated",
              source: response.revisedPrompt || taskId,
              sourceModule: "media-generator",
            },
          });
        }

        if (asset) {
          resultAssets.push(asset);
          // 持久化衍生数据
          await persistDerivedData(asset, { ...baseMetadata, itemIndex: i });
        }
      } catch (error) {
        logger.error(`处理第 ${i} 个资产失败`, error);
      }
    }

    if (resultAssets.length > 0) {
      taskManager.updateTaskStatus(taskId, "processing", {
        resultAssetIds: resultAssets.map((a) => a.id),
        resultAssets: resultAssets,
        // 为了兼容旧代码渲染，暂时保留单数引用，但标记为迁移中
        resultAssetId: resultAssets[0].id,
        resultAsset: resultAssets[0],
      });
      logger.info("所有资产已关联到任务", {
        taskId,
        count: resultAssets.length,
      });
    } else {
      throw new Error("生成已返回媒体结果，但所有媒体文件入库失败");
    }
  };

  /**
   * 持久化资产衍生数据
   */
  async function persistDerivedData(asset: any, metadata: any) {
    try {
      const basePath = await getAssetBasePath();
      const dateStr = new Date().toISOString().split("T")[0];
      const derivedRelPath = `derived/media-generator/${dateStr}/${asset.id}.json`;

      const fullPath = `${basePath}/${derivedRelPath}`.replace(/\\/g, "/");
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

      await mkdir(dirPath, { recursive: true });
      await writeTextFile(fullPath, JSON.stringify(metadata, null, 2));

      await invoke("update_asset_derived_data", {
        assetId: asset.id,
        key: "generation",
        data: {
          path: derivedRelPath,
          updatedAt: new Date().toISOString(),
          provider: "media-generator",
        },
      });
    } catch (e) {
      logger.warn("持久化衍生数据失败", e);
    }
  }

  /**
   * 将 Base64 字符串（纯 Base64 或 ArrayBuffer）解码为 ArrayBuffer
   */
  function decodeBase64ToArrayBuffer(input: string | ArrayBuffer): ArrayBuffer {
    if (typeof input !== "string") return input;
    const dataUrlResult = parseDataUrl(input);
    const base64 = dataUrlResult ? dataUrlResult.base64 : input;
    const binaryString = atob(base64);
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
    return uint8Array.buffer;
  }

  /**
   * 解析 Data URL，提取 MIME 类型和 Base64 数据
   * @returns 解析结果，非 Data URL 返回 null
   */
  function parseDataUrl(
    url: string
  ): { mimeType: string; base64: string } | null {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2] };
  }

  /**
   * 根据 MIME 类型推导文件扩展名
   */
  function mimeTypeToExtension(mime: string, fallback: string): string {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "video/mp4": "mp4",
      "video/mpeg": "mpeg",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "video/x-msvideo": "avi",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/opus": "opus",
      "audio/aac": "aac",
    };
    return map[mime] || fallback;
  }

  function audioFormatToMimeType(format: string): string {
    const map: Record<string, string> = {
      mp3: "audio/mpeg",
      mpeg: "audio/mpeg",
      wav: "audio/wav",
      opus: "audio/opus",
      aac: "audio/aac",
      pcm16: "audio/wav",
    };
    return map[format] || "audio/mpeg";
  }

  function finalMusicMode(params: Record<string, any>): string {
    const modelId = String(params.modelId || "");
    if (modelId.startsWith("music-cover")) return "cover";
    if (params.minimax_music_mode === "instrumental") return "instrumental";
    if (params.minimax_music_mode === "song") return "song";
    if (params.is_instrumental) return "instrumental";
    return "song";
  }

  function buildStandardAudioMetadata(options: {
    task: MediaTask;
    response: LlmResponse;
    itemIndex: number;
    settings: MediaMetadataWriteSettings;
  }) {
    const { task, response, itemIndex, settings } = options;
    const userProfile = userProfileStore.globalProfile;
    const authorName =
      settings.includeUserAsAuthor === true
        ? userProfile?.displayName?.trim() || userProfile?.name?.trim()
        : undefined;
    const title =
      String(task.input.params.title || "").trim() ||
      createPromptTitle(task.input.prompt) ||
      `AIO Hub 生成音频 ${itemIndex + 1}`;
    const commentParts: string[] = [];

    if (settings.includePromptComment && task.input.prompt.trim()) {
      commentParts.push(`Prompt: ${truncateText(task.input.prompt, 800)}`);
    }
    if (settings.includeModelInfo) {
      commentParts.push(`Model: ${task.input.modelId}`);
      commentParts.push(`Profile: ${task.input.profileId}`);
      commentParts.push(`Task: ${task.id}`);
      if (response.seed !== undefined) {
        commentParts.push(`Seed: ${String(response.seed)}`);
      }
      if (response.revisedPrompt) {
        commentParts.push(
          `Revised prompt: ${truncateText(response.revisedPrompt, 500)}`
        );
      }
    }

    return {
      title,
      artist: authorName,
      album: "AIO Hub Media Generator",
      genre: task.type === "music" ? "AI Music" : "AI Speech",
      comment: commentParts.join("\n"),
      software: "AIO Hub",
      date: new Date().toISOString().slice(0, 10),
    };
  }

  function createPromptTitle(prompt: string): string {
    return truncateText(prompt.replace(/\s+/g, " ").trim(), 80);
  }

  function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  }

  function extractMinimaxCoverAudioBase64(
    profile: LlmProfile | undefined,
    musicMode: string,
    params: Record<string, any>,
    attachments: any[] | undefined
  ): string | undefined {
    if (profile?.type !== "minimax-music" || musicMode !== "cover") {
      return undefined;
    }
    if (params.cover_reference_mode === "feature") {
      return undefined;
    }

    const audioAttachments = (attachments || []).filter(
      (att) => inferMediaAttachmentType(att) === "audio"
    );
    if (audioAttachments.length > 1) {
      throw new Error("MiniMax 翻唱一次只支持一个参考音频附件");
    }

    const audio = audioAttachments[0];
    if (!audio?.b64) return undefined;
    return stripAudioDataUrl(String(audio.b64));
  }

  function validateMiniMaxTwoStepCover(
    profile: LlmProfile | undefined,
    params: Record<string, any>
  ): void {
    if (
      profile?.type !== "minimax-music" ||
      finalMusicMode(params) !== "cover" ||
      params.cover_workflow !== "two_step"
    ) {
      return;
    }

    if (!params.cover_feature_id) {
      throw new Error("两步翻唱需要先预处理参考音频");
    }
    if (!String(params.lyrics || "").trim()) {
      throw new Error("两步翻唱需要保留或填写歌词");
    }
    if (isMinimaxCoverPreprocessExpired(params.cover_preprocess_result)) {
      throw new Error("预处理结果已过期，请重新预处理参考音频");
    }
    params.cover_reference_mode = "feature";
  }

  function isMinimaxCoverPreprocessExpired(result: any): boolean {
    if (!result?.expiresAt) return true;
    return Date.now() > new Date(result.expiresAt).getTime();
  }

  /**
   * 将 URL 转换为 ArrayBuffer
   */
  async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    // 处理内嵌的 Data URL（兜底，避免 CSP 拦截）
    const dataUrlResult = parseDataUrl(url);
    if (dataUrlResult) {
      return decodeBase64ToArrayBuffer(dataUrlResult.base64);
    }

    // 处理 tauri 协议或本地路径
    if (
      url.startsWith("appdata://") ||
      url.startsWith("file://") ||
      url.startsWith("/")
    ) {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const response = await fetch(convertFileSrc(url));
      if (!response.ok) {
        throw new Error(
          `读取本地媒体失败：${response.status} ${response.statusText}`
        );
      }
      return await response.arrayBuffer();
    }

    const remoteUrl = normalizeRemoteMediaUrl(url);
    let response: Response;

    try {
      // 处理远程 URL。走 Tauri HTTP 插件，绕开 WebView CORS 限制。
      response = await tauriFetch(remoteUrl, {
        method: "GET",
        connectTimeout: 30000,
      });
    } catch (error) {
      logger.warn("Tauri HTTP 下载远程媒体失败，改用代理下载", {
        error: String(error),
        url: summarizeUrlForLog(remoteUrl),
      });
      response = await fetchWithTimeout(
        remoteUrl,
        {
          method: "GET",
          headers: { Accept: "*/*" },
          forceProxy: true,
          relaxIdCerts: true,
          http1Only: true,
        },
        DEFAULT_MEDIA_TIMEOUT
      );
    }

    if (!response.ok) {
      throw new Error(
        `下载远程媒体失败：${response.status} ${response.statusText}`
      );
    }
    return await response.arrayBuffer();
  }

  return {
    isGenerating,
    activeTaskCount: computed(() => abortControllers.value.size),
    buildTask,
    executeGeneration,
    startGenerationWithTask,
    abort,
    abortTask,
    abortAll,
  };
}

function normalizeRemoteMediaUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return encodeURI(url);
  }
}

function summarizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 120);
  }
}
