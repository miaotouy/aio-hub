import { ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { useMediaGenStore } from '../stores/mediaGenStore';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useAssetManager } from '@/composables/useAssetManager';
import { useModelMetadata } from '@/composables/useModelMetadata';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { embedMetadata } from '@/utils/mediaMetadataManager';
import type { MediaTask, MediaTaskType, MediaMessage } from '../types';
import type { MediaGenerationOptions, LlmResponse } from '@/llm-apis/common';

const logger = createModuleLogger('media-generator/manager');
const errorHandler = createModuleErrorHandler('media-generator/manager');

export function useMediaGenerationManager() {
  const mediaStore = useMediaGenStore();
  const { sendRequest } = useLlmRequest();
  const { importAssetFromBytes, importAssetFromPath, getAssetBasePath } = useAssetManager();
  const { getMatchedProperties } = useModelMetadata();
  const isGenerating = ref(false);

  /**
   * 创建并启动媒体生成任务
   */
  const startGeneration = async (options: MediaGenerationOptions & { contextMessageIds?: string[], includeContext?: boolean }, type: MediaTaskType) => {
    const taskId = uuidv4();
    
    // 1. 能力感知：检查模型是否支持迭代微调
    const modelProps = getMatchedProperties(options.modelId);
    const supportsIterative = modelProps?.iterativeRefinement === true;
    
    // 决定是否包含上下文 (优先使用传入的，其次基于能力)
    const shouldIncludeContext = options.includeContext ?? supportsIterative;

    const task: MediaTask = {
      id: taskId,
      type,
      status: 'pending',
      input: {
        prompt: options.prompt || '',
        negativePrompt: options.negativePrompt,
        modelId: options.modelId,
        profileId: options.profileId,
        params: { ...options },
        referenceAssetIds: options.inputAttachments?.map(a => a.url).filter(Boolean) as string[],
        contextMessageIds: options.contextMessageIds,
        includeContext: shouldIncludeContext,
      },
      progress: 0,
      createdAt: Date.now(),
    };

    mediaStore.addTask(task);
    isGenerating.value = true;

    try {
      mediaStore.updateTaskStatus(taskId, 'processing', { statusText: '正在请求生成...' });

      // 构造多轮会话上下文
      let finalOptions = { ...options };
      
      // 如果开启了上下文包含，或者手动选择了上下文消息
      if (shouldIncludeContext || (options.contextMessageIds && options.contextMessageIds.length > 0)) {
        let contextMessages: MediaMessage[] = [];
        
        if (shouldIncludeContext) {
          // 自动提取当前路径上的所有消息 (排除当前正在生成的任务节点本身)
          // mediaStore.messages 已经包含了当前路径，最后一个通常是刚添加的任务节点
          contextMessages = mediaStore.messages.filter(m => m.id !== taskId && m.role !== 'system');
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
            attachments: m.attachments || (m.metadata?.taskSnapshot?.resultAsset ? [m.metadata.taskSnapshot.resultAsset] : undefined),
          }));

          finalOptions = {
            ...finalOptions,
            messages: messages as any,
          };
          
          logger.info('构造多轮生成上下文', { messageCount: messages.length });
        }
      }

      // 调用 LLM 请求
      const response = await sendRequest(finalOptions);

      mediaStore.updateTaskStatus(taskId, 'processing', {
        statusText: '生成成功，正在入库资产...',
        progress: 90
      });

      // 处理结果并入库
      await handleResponseAssets(taskId, response, type);

      mediaStore.updateTaskStatus(taskId, 'completed', {
        statusText: '生成完成',
        progress: 100
      });

    } catch (error: any) {
      logger.error('媒体生成失败', error, { taskId });
      mediaStore.updateTaskStatus(taskId, 'error', {
        error: error.message || String(error),
        statusText: '生成失败'
      });
      errorHandler.error(error, '媒体生成失败');
    } finally {
      isGenerating.value = false;
    }
  };

  /**
   * 处理响应中的资产并导入系统
   */
  const handleResponseAssets = async (taskId: string, response: LlmResponse, type: MediaTaskType) => {
    const task = mediaStore.getTask(taskId);
    if (!task) return;

    // 1. 提取资产数据
    let assetPromise: Promise<any> | null = null;
    let bytes: ArrayBuffer | null = null;
    let mimeType = 'image/png';
    let extension = 'png';

    // 确定元数据
    const metadata = {
      prompt: task.input.prompt,
      negativePrompt: task.input.negativePrompt,
      modelId: task.input.modelId,
      params: task.input.params,
      revisedPrompt: response.revisedPrompt,
      seed: response.seed,
      genType: type,
      version: '1.0.0'
    };

    try {
      if (type === 'image' && response.images?.[0]) {
        const img = response.images[0];
        mimeType = 'image/png';
        extension = 'png';

        if (img.b64_json) {
          if (typeof img.b64_json === 'string') {
            const binaryString = atob(img.b64_json);
            const uint8Array = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              uint8Array[i] = binaryString.charCodeAt(i);
            }
            bytes = uint8Array.buffer;
          } else {
            bytes = img.b64_json;
          }
        } else if (img.url) {
          bytes = await fetchAsArrayBuffer(img.url);
        }
      } else if (type === 'video' && response.videos?.[0]) {
        const video = response.videos[0];
        mimeType = 'video/mp4';
        extension = 'mp4';
        if (video.url) {
          bytes = await fetchAsArrayBuffer(video.url);
        }
      } else if (type === 'audio' && response.audios?.[0]) {
        const audio = response.audios[0];
        mimeType = 'audio/mpeg';
        extension = 'mp3';
        if (audio.url) {
          bytes = await fetchAsArrayBuffer(audio.url);
        }
      }

      // 嵌入元数据并导入
      if (bytes) {
        try {
          bytes = await embedMetadata(bytes, mimeType, metadata);
          logger.info(`已将生成参数嵌入 ${type}`, { taskId });
        } catch (e) {
          logger.warn('嵌入元数据失败，继续原始导入', e);
        }

        assetPromise = importAssetFromBytes(bytes, `generated-${taskId}.${extension}`, {
          sourceModule: 'media-generator',
          origin: {
            type: 'generated',
            source: response.revisedPrompt || taskId,
            sourceModule: 'media-generator'
          }
        });
      }
    } catch (error) {
      logger.error('获取或处理资产数据失败', error);
      // 如果处理失败，尝试退回到路径导入（如果是本地路径）
      if (type === 'video' && response.videos?.[0]?.url) {
        assetPromise = importAssetFromPath(response.videos[0].url, {
          sourceModule: 'media-generator',
          origin: {
            type: 'generated',
            source: response.revisedPrompt || taskId,
            sourceModule: 'media-generator'
          }
        });
      }
    }

    if (assetPromise) {
      const asset = await assetPromise;
      mediaStore.updateTaskStatus(taskId, 'processing', {
        resultAssetId: asset.id,
        resultAsset: asset
      });

      // 2. 补全衍生数据 (Prompt 等)
      try {
        const basePath = await getAssetBasePath();
        const derivedRelativePath = `.derived/generation/${asset.id}.json`;
        const fullDerivedPath = `${basePath}/${derivedRelativePath}`;

        // 写入衍生数据文件
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(JSON.stringify(metadata, null, 2));
        
        await invoke('write_file_force', {
          path: fullDerivedPath,
          content: Array.from(contentBytes) // 转换为普通数组以确保 Tauri 序列化兼容性
        });

        // 更新资产元数据
        await invoke('update_asset_derived_data', {
          assetId: asset.id,
          key: 'generation',
          data: {
            path: derivedRelativePath,
            updatedAt: new Date().toISOString(),
            provider: 'media-generator'
          }
        });

        logger.info('衍生数据已持久化', { assetId: asset.id });
      } catch (e) {
        logger.warn('持久化衍生数据失败', e);
      }

      logger.info('资产已关联到任务', { taskId, assetId: asset.id });
    }
  };

  /**
   * 将 URL 转换为 ArrayBuffer
   */
  async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
    // 处理 tauri 协议或本地路径
    if (url.startsWith('appdata://') || url.startsWith('file://') || url.startsWith('/')) {
      // 假设后端有读取文件的命令，或者我们可以通过 fetch(convertFileSrc(url))
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      const response = await fetch(convertFileSrc(url));
      return await response.arrayBuffer();
    }
    
    // 处理远程 URL
    const response = await fetch(url);
    return await response.arrayBuffer();
  }

  return {
    isGenerating,
    startGeneration
  };
}