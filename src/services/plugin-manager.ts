/**
 * 插件管理服务
 * 
 * 提供插件的加载、卸载等运行时管理功能
 */

import { serviceRegistry } from './registry';
import { createPluginLoader, PluginLoader } from './plugin-loader';
import type { PluginProxy } from './plugin-types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/plugin-manager');

/**
 * 插件管理器类
 */
class PluginManager {
  private loader: PluginLoader | null = null;
  private initialized = false;

  /**
   * 初始化插件管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('插件管理器已初始化');
      return;
    }

    logger.info('初始化插件管理器');
    this.loader = await createPluginLoader();
    this.initialized = true;
  }

  /**
   * 加载所有插件
   */
  async loadAllPlugins(): Promise<void> {
    if (!this.loader) {
      throw new Error('插件管理器未初始化');
    }

    const result = await this.loader.loadAll();
    
    // 注册加载成功的插件到服务注册表
    if (result.plugins.length > 0) {
      await serviceRegistry.register(...result.plugins);
    }

    if (result.failed.length > 0) {
      logger.warn(`${result.failed.length} 个插件加载失败`, {
        failed: result.failed.map(f => ({ id: f.id, error: f.error.message }))
      });
    }
  }

  /**
   * 卸载插件
   * @param pluginId 插件 ID
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    if (!this.loader) {
      throw new Error('插件管理器未初始化');
    }

    logger.info(`开始卸载插件: ${pluginId}`);

    // 1. 从服务注册表注销
    const unregistered = await serviceRegistry.unregister(pluginId);
    if (!unregistered) {
      logger.warn(`插件 ${pluginId} 未在服务注册表中找到`);
    }

    // 2. 删除插件文件到回收站
    await this.loader.uninstall(pluginId);

    logger.info(`插件 ${pluginId} 卸载完成`);
  }

  /**
   * 获取所有已安装的插件
   */
  getInstalledPlugins(): PluginProxy[] {
    const allServices = serviceRegistry.getAllServices();
    
    // 过滤出插件（检查是否有 manifest 属性）
    return allServices.filter((service): service is PluginProxy => 
      'manifest' in service && 'enabled' in service
    );
  }

  /**
   * 检查插件是否已安装
   */
  isPluginInstalled(pluginId: string): boolean {
    return serviceRegistry.hasService(pluginId);
  }

  /**
   * 获取插件信息
   * @param pluginId 插件 ID
   * @returns 插件代理对象，如果不存在则返回 undefined
   */
  getPlugin(pluginId: string): PluginProxy | undefined {
    try {
      const service = serviceRegistry.getService(pluginId);
      if ('manifest' in service && 'enabled' in service) {
        return service as PluginProxy;
      }
    } catch {
      // 服务不存在
    }
    return undefined;
  }
}

// 导出单例实例
export const pluginManager = new PluginManager();