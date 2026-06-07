import { ref, computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { findLastIndex } from "lodash-es";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { useMediaTaskManager } from "./useMediaTaskManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useAssetManager } from "@/composables/useAssetManager";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useMediaGenParamRules } from "./useMediaGenParamRules";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";
import { DEFAULT_MEDIA_TIMEOUT } from "@/llm-apis/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { embedMetadata } from "@/utils/mediaMetadataManager";
import type { MediaTask, MediaTaskType, MediaMessage } from "../types";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";

const logger = createModuleLogger("media-generator/manager");
const errorHandler = createModuleErrorHandler("media-generator/manager");

export function useMediaGenerationManager() {
  const taskManager = useMediaTaskManager();
  const { sendRequest } = useLlmRequest();
  const {
    importAssetFromBytes,
    importAssetFromPath,
    getAssetBasePath,
    getAssetBinary,
  } = useAssetManager();
  const { getMatchedProperties } = useModelMetadata();
  const { profiles: allProfiles } = useLlmProfiles();
  const {
    getParamRules,
    getModelParamRules,
    sanitizeParams,
    usesAspectRatioMode,
    buildXaiSizeParams,
  } = useMediaGenParamRules();
  const isGenerating = ref(false);
  // 使用 Map 管理多个任务的 AbortController
  const abortControllers = ref<Map<string, AbortController>>(new Map());

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
    task: MediaTask,
    autoIncludeLastResult: boolean = false
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
        const lastUser = finalContext[lastUserIndex];
        const modelProps = getMatchedProperties(task.input.modelId);
        const hasVisualInput = modelProps?.visualInput === true;

        if (autoIncludeLastResult && hasVisualInput && lastUserIndex > 0) {
          const prevAssistant = finalContext[lastUserIndex - 1];
          if (prevAssistant.role === "assistant") {
            const resultAsset =
              prevAssistant.metadata?.taskSnapshot?.resultAsset;
            if (resultAsset) {
              const augmentedUser = {
                ...lastUser,
                attachments: [...(lastUser.attachments || []), resultAsset],
              };
              finalContext = [augmentedUser];
            } else {
              finalContext = [lastUser];
            }
          } else {
            finalContext = [lastUser];
          }
        } else {
          finalContext = [lastUser];
        }
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

      // 处理参考图：将本地 Asset (含 path) 转换为 Base64
      let processedAttachments = task.input.params.inputAttachments;
      if (processedAttachments && (processedAttachments as any[]).length > 0) {
        const profile = allProfiles.value.find(
          (p) => p.id === task.input.profileId
        );
        const model = profile?.models.find((m) => m.id === task.input.modelId);
        const maxDim = model?.capabilities?.maxImageDimension;

        processedAttachments = await Promise.all(
          (processedAttachments as any[]).map(async (att: any) => {
            if (att.path && !att.b64) {
              try {
                let buffer = await getAssetBinary(att.path);

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
                  b64: `data:${mimeType};base64,${base64}`,
                };
              } catch (e) {
                logger.error("读取参考图失败", e, { path: att.path });
                return att;
              }
            }
            return att;
          })
        );
      }

      let finalOptions = {
        timeout: requestTimeout,
        maxRetries: maxRetries,
        ...options,
        inputAttachments: processedAttachments,
        prompt: task.input.params.prompt, // 使用 task 中的 prompt
      };

      // 应用参数规则清洁
      const selectedProfile = allProfiles.value.find(
        (p) => p.id === task.input.profileId
      );
      const selectedModel = selectedProfile?.models.find(
        (m) => m.id === task.input.modelId
      );
      const rules = selectedModel
        ? getModelParamRules(selectedModel, selectedProfile?.type)
        : getParamRules(task.input.modelId, selectedProfile?.type);
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

      // 构造多轮会话上下文
      let finalContext: MediaMessage[] = [];
      if (contextMessages && contextMessages.length > 0) {
        const filteredContext = contextMessages.filter(
          (m: MediaMessage) => m.id !== taskId && m.role !== "system"
        );
        finalContext = applyContextRules(
          filteredContext,
          task,
          config?.autoIncludeLastResult
        );
      }

      if (finalContext.length > 0) {
        const messages = finalContext.map((m) => ({
          role: m.role,
          content: m.content,
          attachments:
            m.attachments ||
            (m.metadata?.taskSnapshot?.resultAsset
              ? [m.metadata.taskSnapshot.resultAsset]
              : undefined),
        }));

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

      await handleResponseAssets(taskId, response, type);

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
    type: MediaTaskType,
    translatedPrompt?: string
  ): MediaTask => {
    const taskId = uuidv4();
    const modelProps = getMatchedProperties(options.modelId);
    const supportsIterative = modelProps?.iterativeRefinement === true;
    const shouldIncludeContext = options.includeContext ?? supportsIterative;

    const finalPrompt = translatedPrompt || options.prompt || "";

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
  const startGenerationWithTask = async (task: MediaTask) => {
    await executeGeneration(task);
  };

  /**
   * 处理响应中的资产并导入系统
   */
  const handleResponseAssets = async (
    taskId: string,
    response: LlmResponse,
    type: MediaTaskType
  ) => {
    const task = taskManager.getTask(taskId);
    if (!task) return;

    // 1. 提取所有资产数据
    const resultAssets: any[] = [];
    const responseItems = [
      ...(response.images || []).map((item) => ({
        item,
        type: "image" as MediaTaskType,
      })),
      ...(response.videos || []).map((item) => ({
        item,
        type: "video" as MediaTaskType,
      })),
      ...(response.audios || []).map((item) => ({
        item,
        type: "audio" as MediaTaskType,
      })),
    ];

    if (responseItems.length === 0) {
      logger.warn("响应中没有媒体资产", { taskId });
      return;
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
          if (item.url) {
            bytes = await fetchAsArrayBuffer(item.url);
          }
        } else if (itemType === "audio") {
          mimeType = "audio/mpeg";
          extension = "mp3";
          if (mediaItem.url) {
            bytes = await fetchAsArrayBuffer(mediaItem.url);
          }
        }

        let asset;
        if (bytes) {
          // 嵌入元数据
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
    const binaryString = atob(input);
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
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
    };
    return map[mime] || fallback;
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
      return await response.arrayBuffer();
    }

    // 处理远程 URL
    const response = await fetch(url);
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
