import { markRaw } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import type { ToolRegistry, ServiceMetadata, ToolConfig } from '@/services/types';
import type { AssetSidecarAction, Asset } from '@/types/asset-management';
import { createModuleLogger } from '@/utils/logger';

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
          // 只有来源是媒体生成中心且包含生成元数据的资产才显示
          return asset.origins.some(o => o.sourceModule === 'media-generator') && 
                 !!asset.metadata?.derived?.['generation'];
        },
        handler: async (asset: Asset) => {
          logger.info('查看生成参数', { assetId: asset.id });
          // TODO: 弹出查看对话框
        },
        order: 100
      },
      {
        id: 'media-generator:remix',
        label: '二次创作 (Remix)',
        icon: markRaw(Sparkles),
        isVisible: (asset: Asset) => {
          // 只要是图片或视频，无论来源，理论上都可以尝试 Remix
          return asset.type === 'image' || asset.type === 'video';
        },
        handler: async (asset: Asset) => {
          logger.info('开始二次创作', { assetId: asset.id });
          // TODO: 跳转到媒体生成中心并填充参数
        },
        order: 110
      }
    ];
  }
}