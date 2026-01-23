import { ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useMediaGenStore } from '../stores/mediaGenStore';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useAssetManager } from '@/composables/useAssetManager';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import type { MediaTask, MediaTaskType } from '../types';
import type { MediaGenerationOptions, LlmResponse } from '@/llm-apis/common';

const logger = createModuleLogger('media-generator/manager');
const errorHandler = createModuleErrorHandler('media-generator/manager');

export function useMediaGenerationManager() {
  const mediaStore = useMediaGenStore();
  const { sendRequest } = useLlmRequest();
  const { importAssetFromBytes, importAssetFromPath } = useAssetManager();
  const isGenerating = ref(false);

  /**
   * 创建并启动媒体生成任务
   */
  const startGeneration = async (options: MediaGenerationOptions, type: MediaTaskType) => {
    const taskId = uuidv4();
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
      },
      progress: 0,
      createdAt: Date.now(),
    };

    mediaStore.addTask(task);
    isGenerating.value = true;

    try {
      mediaStore.updateTaskStatus(taskId, 'processing', { statusText: '正在请求生成...' });
      
      // 调用 LLM 请求
      const response = await sendRequest(options);
      
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
    // 1. 提取资产数据
    let assetPromise: Promise<any> | null = null;

    if (type === 'image' && response.images?.[0]) {
      const img = response.images[0];
      if (img.b64_json) {
        // 处理 Base64
        const base64Data = typeof img.b64_json === 'string' 
          ? img.b64_json 
          : Buffer.from(img.b64_json).toString('base64');
        
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        assetPromise = importAssetFromBytes(bytes, `generated-${taskId}.png`, {
          sourceModule: 'media-generator',
          origin: {
            type: 'generated',
            source: response.revisedPrompt || taskId,
            sourceModule: 'media-generator'
          }
        });
      } else if (img.url) {
        // 如果是 URL 且是本地文件协议
        if (img.url.startsWith('file://') || img.url.startsWith('/')) {
           assetPromise = importAssetFromPath(img.url, { sourceModule: 'media-generator' });
        }
      }
    } else if (type === 'video' && response.videos?.[0]) {
      const video = response.videos[0];
      if (video.url) {
        assetPromise = importAssetFromPath(video.url, { sourceModule: 'media-generator' });
      }
    }

    if (assetPromise) {
      const asset = await assetPromise;
      mediaStore.updateTaskStatus(taskId, 'processing', { 
        resultAssetId: asset.id,
        resultAsset: asset
      });

      // 2. 补全衍生数据 (Prompt 等)
      // TODO: 调用后端 update_asset_derived_data
      logger.info('资产已关联到任务', { taskId, assetId: asset.id });
    }
  };

  return {
    isGenerating,
    startGeneration
  };
}