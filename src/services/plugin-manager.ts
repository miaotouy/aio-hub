/**
 * 插件管理服务
 * 
 * 提供插件的加载、卸载等运行时管理功能
 */

import { serviceRegistry } from './registry';
import { createPluginLoader, PluginLoader } from './plugin-loader';
import type { PluginProxy } from './plugin-types';
import { useToolsStore } from '@/stores/tools';
import type { ToolConfig } from '@/config/tools';
import { markRaw } from 'vue';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/plugin-manager');

/**
 * 为插件创建组件加载函数
 * 由于插件位于外部目录，需要特殊处理
 */
function createPluginComponentLoader(pluginPath: string, componentFile: string) {
  return async () => {
    // TODO: 实现动态加载外部插件组件的逻辑
    // 这需要使用 Tauri 的 convertFileSrc API 或其他方案
    logger.warn(`插件组件动态加载暂未实现: ${pluginPath}/${componentFile}`);
    throw new Error('插件UI组件加载功能尚未实现');
  };
}

/**
 * 从插件代理注册UI到工具store
 */
function registerPluginUi(plugin: PluginProxy): void {
  const { manifest, installPath } = plugin;
  
  if (!manifest.ui) {
    return; // 没有UI配置，跳过
  }

  const toolsStore = useToolsStore();
  
  // 构造 ToolConfig 对象
  const toolConfig: ToolConfig = {
    name: manifest.ui.displayName || manifest.name,
    path: `/plugin-${manifest.id}`,
    icon: markRaw({
      // 临时使用一个占位图标，后续可以支持自定义图标
      template: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>',
    }),
    component: createPluginComponentLoader(installPath, manifest.ui.component),
    description: manifest.description,
    category: '插件工具',
  };

  toolsStore.addTool(toolConfig);
  
  logger.info(`插件UI已注册: ${manifest.id}`, {
    name: toolConfig.name,
    path: toolConfig.path,
  });
}

/**
 * 从工具store移除插件UI
 */
function unregisterPluginUi(pluginId: string): void {
  const toolsStore = useToolsStore();
  const toolPath = `/plugin-${pluginId}`;
  
  toolsStore.removeTool(toolPath);
  
  logger.info(`插件UI已移除: ${pluginId}`, { path: toolPath });
}

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
      
      // 注册插件UI
      result.plugins.forEach(plugin => {
        try {
          registerPluginUi(plugin);
        } catch (error) {
          logger.error(`注册插件UI失败: ${plugin.manifest.id}`, error);
        }
      });
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

    // 1. 移除插件UI
    try {
      unregisterPluginUi(pluginId);
    } catch (error) {
      logger.error(`移除插件UI失败: ${pluginId}`, error);
    }

    // 2. 从服务注册表注销
    const unregistered = await serviceRegistry.unregister(pluginId);
    if (!unregistered) {
      logger.warn(`插件 ${pluginId} 未在服务注册表中找到`);
    }

    // 3. 删除插件文件到回收站
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

  /**
   * 从 ZIP 文件安装插件
   * @param zipPath ZIP 文件路径
   * @returns 安装结果
   */
  async installPluginFromZip(zipPath: string): Promise<{
    pluginId: string;
    pluginName: string;
    version: string;
    installPath: string;
  }> {
    logger.info(`开始从 ZIP 文件安装插件: ${zipPath}`);

    try {
      // 调用后端命令安装插件
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{
        pluginId: string;
        pluginName: string;
        version: string;
        installPath: string;
      }>('install_plugin_from_zip', { zipPath });

      logger.info(`插件安装成功`, result);

      // 重新加载插件
      if (this.loader) {
        const loadResult = await this.loader.loadAll();
        
        // 注册新加载的插件
        if (loadResult.plugins.length > 0) {
          await serviceRegistry.register(...loadResult.plugins);
          
          // 注册插件UI
          loadResult.plugins.forEach(plugin => {
            try {
              registerPluginUi(plugin);
            } catch (error) {
              logger.error(`注册插件UI失败: ${plugin.manifest.id}`, error);
            }
          });
        }
      }

      return result;
    } catch (error) {
      logger.error(`从 ZIP 安装插件失败`, error);
      throw error;
    }
  }
}

// 导出单例实例
export const pluginManager = new PluginManager();