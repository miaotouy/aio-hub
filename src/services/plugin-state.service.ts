/**
 * 插件状态服务
 * 
 * 管理插件的启用/禁用状态持久化
 */

import { createConfigManager, type ConfigManager } from '@/utils/configManager';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('PluginStateService');

/**
 * 插件状态配置
 */
interface PluginStatesConfig {
  /** 配置版本 */
  version: string;
  /** 插件启用状态映射 (插件ID -> 是否启用) */
  enabledStates: Record<string, boolean>;
}

/**
 * 插件状态服务类
 */
class PluginStateService {
  private configManager: ConfigManager<PluginStatesConfig>;
  private initialized = false;

  constructor() {
    // 创建配置管理器
    this.configManager = createConfigManager<PluginStatesConfig>({
      moduleName: 'plugin-manager',
      fileName: 'plugin-states.json',
      version: '1.0.0',
      createDefault: () => ({
        version: '1.0.0',
        enabledStates: {},
      }),
    });

    logger.debug('插件状态服务已创建');
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('插件状态服务已初始化');
      return;
    }

    logger.info('初始化插件状态服务');
    
    // 加载配置（如果文件不存在会自动创建）
    await this.configManager.load();
    
    this.initialized = true;
    logger.info('插件状态服务初始化完成');
  }

  /**
   * 获取插件的启用状态
   * @param pluginId 插件 ID
   * @returns 启用状态，如果未设置则返回 true（默认启用）
   */
  async isEnabled(pluginId: string): Promise<boolean> {
    const config = await this.configManager.load();
    
    // 如果没有记录，默认为启用
    if (!(pluginId in config.enabledStates)) {
      logger.debug(`插件 ${pluginId} 无启用状态记录，默认为启用`);
      return true;
    }
    
    const enabled = config.enabledStates[pluginId];
    logger.debug(`获取插件启用状态`, { pluginId, enabled });
    return enabled;
  }

  /**
   * 设置插件的启用状态
   * @param pluginId 插件 ID
   * @param enabled 是否启用
   */
  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    logger.info(`设置插件启用状态`, { pluginId, enabled });
    
    const config = await this.configManager.load();
    config.enabledStates[pluginId] = enabled;
    await this.configManager.save(config);
    
    logger.info(`插件启用状态已保存`, { pluginId, enabled });
  }

  /**
   * 批量设置多个插件的启用状态
   * @param states 插件 ID -> 启用状态的映射
   */
  async setBatch(states: Record<string, boolean>): Promise<void> {
    logger.info(`批量设置插件启用状态`, { count: Object.keys(states).length });
    
    const config = await this.configManager.load();
    Object.assign(config.enabledStates, states);
    await this.configManager.save(config);
    
    logger.info(`批量设置完成`);
  }

  /**
   * 移除插件的启用状态记录
   * @param pluginId 插件 ID
   */
  async remove(pluginId: string): Promise<void> {
    logger.info(`移除插件启用状态记录`, { pluginId });
    
    const config = await this.configManager.load();
    delete config.enabledStates[pluginId];
    await this.configManager.save(config);
    
    logger.info(`插件启用状态记录已移除`, { pluginId });
  }

  /**
   * 获取所有插件的启用状态
   */
  async getAllStates(): Promise<Record<string, boolean>> {
    const config = await this.configManager.load();
    return { ...config.enabledStates };
  }
}

// 导出单例
export const pluginStateService = new PluginStateService();