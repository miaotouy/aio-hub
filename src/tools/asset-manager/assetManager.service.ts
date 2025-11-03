import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { assetManagerEngine } from '@/composables/useAssetManager';

const logger = createModuleLogger('services/asset-manager');

/**
 * AssetManager 服务
 *
 * 将 assetManagerEngine 的功能封装为可跨模块调用的服务。
 * 工具本身的 UI 应直接使用 useAssetManager composable。
 */
class AssetManagerService implements ToolService {
  public readonly id = 'asset-manager';
  public readonly name = '资产管理器';
  public readonly description = '管理应用内导入的所有资产，如图片、文档等。';

  constructor() {
    logger.info('AssetManagerService 实例化');
  }

  /**
   * 暴露 assetManagerEngine 的所有方法
   */
  public readonly engine = assetManagerEngine;

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'getAssetBasePath',
          description: '获取资产存储根目录',
          parameters: [],
          returnType: 'Promise<string>',
        },
        {
          name: 'importAssetFromPath',
          description: '从文件路径导入资产',
          parameters: [
            { name: 'originalPath', type: 'string', required: true },
            { name: 'options', type: 'AssetImportOptions', required: false },
          ],
          returnType: 'Promise<Asset>',
        },
        {
          name: 'getAssetBinary',
          description: '获取资产的二进制数据',
          parameters: [{ name: 'relativePath', type: 'string', required: true }],
          returnType: 'Promise<ArrayBuffer>',
        },
      ],
    };
  }
}

// 导出类供自动注册系统使用
export default AssetManagerService;

// 同时导出单例实例供直接使用
export const assetManagerService = new AssetManagerService();