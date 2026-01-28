import { ref } from "vue";
import { v4 as uuidv4 } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useAssetManager } from "@/composables/useAssetManager";
import { useModelMetadata } from "@/composables/useModelMetadata";
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
  const { importAssetFromBytes, importAssetFromPath, getAssetBasePath } = useAssetManager();
  const { getMatchedProperties } = useModelMetadata();
  const isGenerating = ref(false);

  /**
   * 创建并启动媒体生成任务
   */
  const startGeneration = async (
    options: MediaGenerationOptions & { contextMessageIds?: string[]; includeContext?: boolean },
    type: MediaTaskType
  ) => {
    const taskId = uuidv4();

    // 1. 能力感知：检查模型是否支持迭代微调
    const modelProps = getMatchedProperties(options.modelId);
    const supportsIterative = modelProps?.iterativeRefinement === true;

    // 决定是否包含上下文 (优先使用传入的，其次基于能力)
    const shouldIncludeContext = options.includeContext ?? supportsIterative;

    const task: MediaTask = {
      id: taskId,
      type,
      status: "pending",
      input: {
        prompt: options.prompt || "",
        negativePrompt: options.negativePrompt,
        modelId: options.modelId,
        profileId: options.profileId,
        params: { ...options },
        referenceAssetIds: options.inputAttachments?.map((a) => a.url).filter(Boolean) as string[],
        contextMessageIds: options.contextMessageIds,
        includeContext: shouldIncludeContext,
      },
      progress: 0,
      createdAt: Date.now(),
    };

    mediaStore.addTask(task);
    isGenerating.value = true;

    try {
      mediaStore.updateTaskStatus(taskId, "processing", { statusText: "正在请求生成..." });

      // 构造多轮会话上下文
      let finalOptions = { ...options };

      // 如果开启了上下文包含，或者手动选择了上下文消息
      if (
        shouldIncludeContext ||
        (options.contextMessageIds && options.contextMessageIds.length > 0)
      ) {
        let contextMessages: MediaMessage[] = [];

        if (shouldIncludeContext) {
          // 自动提取当前路径上的所有消息 (排除当前正在生成的任务节点本身)
          // mediaStore.messages 已经包含了当前路径，最后一个通常是刚添加的任务节点
          contextMessages = mediaStore.messages.filter(
            (m) => m.id !== taskId && m.role !== "system"
          );
        } else if (options.contextMessageIds && options.contextMessageIds.length > 0) {
          // 仅包含选中的消息
          contextMessages = mediaStore.messages.filter((m) =>
            options.contextMessageIds?.includes(m.id)
          );
        }

        if (contextMessages.length > 0) {
          // 映射为 LlmRequest 所需的消息格式
          const messages = contextMessages.map((m) => ({
            role: m.role,
            content: m.content,
            // 如果是助手的生成结果，把生成的资产作为上下文 (VLM 逻辑)
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

          logger.info("构造多轮生成上下文", { messageCount: messages.length });
        }
      }

      // 调用 LLM 请求
      const response = await sendRequest(finalOptions);

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
      logger.error("媒体生成失败", error, { taskId });
      mediaStore.updateTaskStatus(taskId, "error", {
        error: error.message || String(error),
        statusText: "生成失败",
      });
      errorHandler.error(error, "媒体生成失败");
    } finally {
      isGenerating.value = false;
    }
  };

  /**
   * 处理响应中的资产并导入系统
   */
  const handleResponseAssets = async (
    taskId: string,
    response: LlmResponse,
    type: MediaTaskType
  ) => {
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
            if (typeof mediaItem.b64_json === "string") {
              const binaryString = atob(mediaItem.b64_json);
              const uint8Array = new Uint8Array(binaryString.length);
              for (let j = 0; j < binaryString.length; j++) {
                uint8Array[j] = binaryString.charCodeAt(j);
              }
              bytes = uint8Array.buffer;
            } else {
              bytes = mediaItem.b64_json;
            }
          } else if (mediaItem.url) {
            bytes = await fetchAsArrayBuffer(mediaItem.url);
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
      mediaStore.updateTaskStatus(taskId, "processing", {
        resultAssetIds: resultAssets.map((a) => a.id),
        resultAssets: resultAssets,
        // 姐姐，为了兼容旧代码渲染，暂时保留单数引用，但标记为迁移中
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
   * 将 URL 转换为 ArrayBuffer
   */
  async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    // 处理 tauri 协议或本地路径
    if (url.startsWith("appdata://") || url.startsWith("file://") || url.startsWith("/")) {
      // 假设后端有读取文件的命令，或者我们可以通过 fetch(convertFileSrc(url))
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
  };
}
