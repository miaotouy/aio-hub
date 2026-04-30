import { ref } from "vue";
import { v4 as uuidv4 } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useAssetManager } from "@/composables/useAssetManager";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useMediaGenParamRules } from "./useMediaGenParamRules";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { DEFAULT_MEDIA_TIMEOUT } from "@/llm-apis/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { embedMetadata } from "@/utils/mediaMetadataManager";
import type { MediaTask, MediaTaskType, MediaMessage } from "../types";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";

const logger = createModuleLogger("media-generator/manager");
const errorHandler = createModuleErrorHandler("media-generator/manager");

export function useMediaGenerationManager() {
  const mediaStore = useMediaGenStore();
  const { sendRequest } = useLlmRequest();
  const { importAssetFromBytes, importAssetFromPath, getAssetBasePath, getAssetBinary } = useAssetManager();
  const { getMatchedProperties } = useModelMetadata();
  const { profiles: allProfiles } = useLlmProfiles();
  const { getParamRules, sanitizeParams, usesAspectRatioMode, buildXaiSizeParams } = useMediaGenParamRules();
  const isGenerating = ref(false);
  const abortController = ref<AbortController | null>(null);

  /**
   * 中止生成
   */
  const abort = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
      isGenerating.value = false;
      logger.info("用户中止了生成任务");
    }
  };

  /**
   * 创建并启动媒体生成任务
   */
  const startGeneration = async (
    options: MediaGenerationOptions & { contextMessageIds?: string[]; includeContext?: boolean },
    type: MediaTaskType,
  ) => {
    const taskId = uuidv4();

    // 1. 能力感知：检查模型是否支持迭代微调
    const modelProps = getMatchedProperties(options.modelId);
    const supportsIterative = modelProps?.iterativeRefinement === true;

    // 决定是否包含上下文 (优先使用传入的，其次基于能力)
    const shouldIncludeContext = options.includeContext ?? supportsIterative;

    // 2. 翻译拦截 (实验性)
    let finalPrompt = options.prompt || "";
    let translatedPrompt: string | undefined;

    if (mediaStore.settings.translation.enabled && finalPrompt) {
      mediaStore.updateTaskStatus(taskId, "processing", { statusText: "正在翻译提示词..." });
      translatedPrompt = await mediaStore.translatePrompt(finalPrompt);
      if (translatedPrompt && translatedPrompt !== finalPrompt) {
        finalPrompt = translatedPrompt;
      }
    }

    const task: MediaTask = {
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
          ...options.params, // 透传参数优先级更高，覆盖顶层同名字段
        },
        referenceAssetIds: (options.inputAttachments as any[])?.map((a) => a.path || a.url).filter(Boolean) as string[],
        contextMessageIds: options.contextMessageIds,
        includeContext: shouldIncludeContext,
      },
      progress: 0,
      createdAt: Date.now(),
    };

    mediaStore.addTask(task);

    // 记录翻译结果到消息节点
    if (translatedPrompt) {
      const node = mediaStore.nodes[taskId];
      if (node && node.metadata) {
        node.metadata.translatedContent = translatedPrompt;
      }
    }

    isGenerating.value = true;
    abortController.value = new AbortController();

    try {
      if (options.inputAttachments && options.inputAttachments.length > 0) {
        mediaStore.updateTaskStatus(taskId, "processing", { statusText: "正在处理附件..." });
      } else {
        mediaStore.updateTaskStatus(taskId, "processing", { statusText: "正在准备生成..." });
      }

      // 构造多轮会话上下文
      // 注入超时配置，优先使用用户设置，兜底使用媒体专用默认值
      const requestTimeout = mediaStore.settings.requestSettings?.timeout ?? DEFAULT_MEDIA_TIMEOUT;
      const maxRetries = mediaStore.settings.requestSettings?.maxRetries ?? 0;

      // 处理参考图：将本地 Asset (含 path) 转换为 Base64
      let processedAttachments = options.inputAttachments;
      if (options.inputAttachments && options.inputAttachments.length > 0) {
        processedAttachments = await Promise.all(
          options.inputAttachments.map(async (att: any) => {
            // 如果有 path 且没有 b64，则读取文件
            if (att.path && !att.b64) {
              try {
                const buffer = await getAssetBinary(att.path);
                const base64 = await convertArrayBufferToBase64(buffer);
                const mimeType = att.mimeType || "image/png";
                return {
                  ...att,
                  path: undefined, // 移除 path
                  b64: `data:${mimeType};base64,${base64}`,
                };
              } catch (e) {
                logger.error("读取参考图失败", e, { path: att.path });
                return att;
              }
            }
            return att;
          }),
        );
      }

      let finalOptions = {
        timeout: requestTimeout,
        maxRetries: maxRetries,
        ...options,
        inputAttachments: processedAttachments,
        prompt: finalPrompt,
      };

      // 应用参数规则清洁 (OpenAI 兼容接口)
      const selectedProfile = allProfiles.value.find((p) => p.id === options.profileId);
      const rules = getParamRules(options.modelId, selectedProfile?.type);
      if (rules) {
        // 处理 xAI 的特殊参数映射
        if (usesAspectRatioMode(rules)) {
          const ext = finalOptions as any;
          const xaiParams = buildXaiSizeParams(
            ext.aspectRatio || rules.aspectRatioMode?.defaultRatio || "1:1",
            ext.resolution || rules.aspectRatioMode?.defaultResolution || "1k",
          );
          finalOptions = { ...finalOptions, ...xaiParams };
          delete (finalOptions as any).size; // 移除 size，改用 aspect_ratio
        }
        // 通用参数清洁
        finalOptions = sanitizeParams(finalOptions, rules) as any;
      }

      // 如果开启了上下文包含，或者手动选择了上下文消息
      if (shouldIncludeContext || (options.contextMessageIds && options.contextMessageIds.length > 0)) {
        let contextMessages: MediaMessage[] = [];

        if (shouldIncludeContext) {
          // 自动提取当前路径上的所有消息 (排除当前正在生成的任务节点本身)
          // mediaStore.messages 已经包含了当前路径，最后一个通常是刚添加的任务节点
          contextMessages = mediaStore.messages.filter((m: MediaMessage) => m.id !== taskId && m.role !== "system");
        } else if (options.contextMessageIds && options.contextMessageIds.length > 0) {
          // 仅包含选中的消息
          contextMessages = mediaStore.messages.filter((m: MediaMessage) => options.contextMessageIds?.includes(m.id));
        }

        if (contextMessages.length > 0) {
          // 映射为 LlmRequest 所需的消息格式
          const messages = contextMessages.map((m) => ({
            role: m.role,
            content: m.content,
            // 如果是助手的生成结果，把生成的资产作为上下文 (VLM 逻辑)
            attachments:
              m.attachments ||
              (m.metadata?.taskSnapshot?.resultAsset ? [m.metadata.taskSnapshot.resultAsset] : undefined),
          }));

          finalOptions = {
            ...finalOptions,
            messages: messages as any,
          };

          logger.info("构造多轮生成上下文", { messageCount: messages.length });
        }
      }

      // 为 openai-responses 渠道注入流式预览图回调（gpt-image-2 partial_image 特性）
      if (selectedProfile?.type === "openai-responses") {
        (finalOptions as any).onPartialImage = (base64: string, index: number) => {
          const currentTask = mediaStore.getTask(taskId);
          const previews = [...(currentTask?.previewUrls || [])];
          previews[index] = base64;
          mediaStore.updateTaskStatus(taskId, "processing", {
            statusText: `正在生成预览图 ${index + 1}...`,
            previewUrls: previews,
          });
        };
      }

      // 调用 LLM 请求
      const response = await sendRequest({
        ...finalOptions,
        signal: abortController.value?.signal,
      });

      mediaStore.updateTaskStatus(taskId, "processing", {
        statusText: "生成成功，正在入库资产...",
        progress: 90,
      });

      // 处理结果并入库
      await handleResponseAssets(taskId, response, type);

      mediaStore.updateTaskStatus(taskId, "completed", {
        statusText: "生成完成",
        progress: 100,
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        mediaStore.updateTaskStatus(taskId, "error", {
          error: "已中止",
          statusText: "任务已中止",
        });
        return;
      }
      // 仅在非中止错误时记录业务异常
      // 底层 useLlmRequest 已经记录过详细的 API 错误日志，此处仅更新任务状态
      mediaStore.updateTaskStatus(taskId, "error", {
        error: error.message || String(error),
        statusText: "生成失败",
      });

      // 如果错误尚未被处理（可能不是来自 useLlmRequest），则进行静默处理以记录日志
      errorHandler.handle(error, {
        userMessage: "媒体生成失败",
        showToUser: false,
      });
    } finally {
      isGenerating.value = false;
      abortController.value = null;
    }
  };

  /**
   * 处理响应中的资产并导入系统
   */
  const handleResponseAssets = async (taskId: string, response: LlmResponse, type: MediaTaskType) => {
    const task = mediaStore.getTask(taskId);
    if (!task) return;

    // 1. 提取所有资产数据
    const resultAssets: any[] = [];
    const responseItems = [
      ...(response.images || []).map((item) => ({ item, type: "image" as MediaTaskType })),
      ...(response.videos || []).map((item) => ({ item, type: "video" as MediaTaskType })),
      ...(response.audios || []).map((item) => ({ item, type: "audio" as MediaTaskType })),
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
            bytes = await embedMetadata(bytes, mimeType, { ...baseMetadata, itemIndex: i });
          } catch (e) {
            logger.warn("嵌入元数据失败", e);
          }

          asset = await importAssetFromBytes(bytes, `generated-${taskId}-${i}.${extension}`, {
            sourceModule: "media-generator",
            origin: {
              type: "generated",
              source: response.revisedPrompt || taskId,
              sourceModule: "media-generator",
            },
          });
        } else if (
          item.url &&
          (item.url.startsWith("file://") || item.url.startsWith("/") || item.url.startsWith("appdata://"))
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
      mediaStore.updateTaskStatus(taskId, "processing", {
        resultAssetIds: resultAssets.map((a) => a.id),
        resultAssets: resultAssets,
        // 为了兼容旧代码渲染，暂时保留单数引用，但标记为迁移中
        resultAssetId: resultAssets[0].id,
        resultAsset: resultAssets[0],
      });
      logger.info("所有资产已关联到任务", { taskId, count: resultAssets.length });
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
  function parseDataUrl(url: string): { mimeType: string; base64: string } | null {
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
    if (url.startsWith("appdata://") || url.startsWith("file://") || url.startsWith("/")) {
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
    startGeneration,
    abort,
  };
}
