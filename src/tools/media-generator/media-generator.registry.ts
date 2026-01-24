import { markRaw } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import type { ToolRegistry, ServiceMetadata, ToolConfig } from '@/services/types';
import type { AssetSidecarAction, Asset } from '@/types/asset-management';
import { createModuleLogger } from '@/utils/logger';
import { extractMetadata } from '@/utils/mediaMetadataManager';
import { invoke } from '@tauri-apps/api/core';
import { useGenerationInfoViewer } from './composables/useGenerationInfoViewer';

const logger = createModuleLogger('media-generator/registry');

/**
 * 媒体生成中心 UI 配置
 */
export const toolConfig: ToolConfig = {
  name: '媒体生成中心',
  path: '/media-generator',
  icon: markRaw(Sparkles),
  component: () => import('./views/MediaGeneratorView.vue'),
  description: '一站式媒体生成工作站，支持图片、视频和音频生成。',
  category: 'AI 创作'
};

/**
 * 媒体生成中心工具注册
 */
export default class MediaGeneratorRegistry implements ToolRegistry {
  readonly id = 'media-generator';
  readonly name = '媒体生成中心';
  readonly description = '一站式媒体生成工作站，支持图片、视频和音频生成。';

  // 工具元数据
  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: 'generateMedia',
          description: '根据提示词生成媒体内容',
          parameters: [
            { name: 'prompt', type: 'string', description: '生成提示词', required: true },
            { name: 'type', type: 'string', description: '媒体类型 (image/video/audio)', required: true }
          ],
          returnType: 'Promise<MediaTask>'
        }
      ]
    };
  }

  /**
   * 注册资产附属操作
   * 允许在资产管理器中查看生成参数或进行二次创作
   */
  getAssetSidecarActions(): AssetSidecarAction[] {
    return [
      {
        id: 'media-generator:view-info',
        label: '查看生成参数',
        icon: markRaw(Sparkles),
        isVisible: (asset: Asset) => {
          // 只要是本模块生成的资产，或者包含衍生数据的资产
          const hasGenerationData = !!asset.metadata?.derived?.['generation'];
          const isGenerated = asset.origins.some(o => o.sourceModule === 'media-generator');
          return hasGenerationData || isGenerated;
        },
        handler: async (asset: Asset) => {
          logger.info('查看生成参数', { assetId: asset.id });

          let generationData = asset.metadata?.derived?.['generation'] as any;

          // 如果没有衍生数据，尝试从文件读取
          if (!generationData) {
            try {
              const bytes = await invoke<number[]>('get_asset_binary', { relativePath: asset.path });
              let mimeType = asset.mimeType;
              if (!mimeType) {
                if (asset.type === 'image') mimeType = 'image/png';
                else if (asset.type === 'video') mimeType = 'video/mp4';
                else if (asset.type === 'audio') mimeType = 'audio/mpeg';
              }
              generationData = await extractMetadata(new Uint8Array(bytes).buffer, mimeType || 'application/octet-stream');
              if (generationData) {
                logger.info('从文件内嵌元数据中提取到生成参数');
              }
            } catch (e) {
              logger.warn('从文件提取元数据失败', e);
            }
          }

          if (!generationData) {
            // 如果还是没有，提示用户
            const { customMessage } = await import('@/utils/customMessage');
            customMessage.warning('未找到生成参数信息');
            return;
          }

          // 弹出全局查看对话框
          const { show } = useGenerationInfoViewer();
          show(asset, generationData);
        },
        order: 100
      }
    ];
  }
}