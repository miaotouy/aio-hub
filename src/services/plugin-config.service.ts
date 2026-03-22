/**
 * 插件配置服务
 *
 * 统一管理所有插件的配置，提供配置的加载、保存、迁移功能
 */

import { createConfigManager, type ConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { PluginManifest, SettingsSchema, SettingsProperty, PluginSettingsAPI } from "./plugin-types";

const logger = createModuleLogger("PluginConfigService");
const errorHandler = createModuleErrorHandler("PluginConfigService");

/**
 * 插件配置项
 */
interface PluginConfig {
  /** 配置版本 */
  version: string;
  /** 配置数据 */
  [key: string]: any;
}

/**
 * 插件配置管理器映射
 */
class PluginConfigService {
  private configManagers = new Map<string, ConfigManager<PluginConfig>>();
  private schemas = new Map<string, SettingsSchema>();

  /**
   * 初始化插件配置
   * @param manifest 插件清单
   * @param customId 可选的自定义 ID（例如开发模式下带 -dev 后缀的 ID）
   */
  async initPluginConfig(manifest: PluginManifest, customId?: string): Promise<void> {
    const id = customId || manifest.id;
    const { settingsSchema } = manifest;

    // 如果插件没有配置模式，则跳过
    if (!settingsSchema) {
      logger.debug(`插件 ${id} 没有配置模式，跳过初始化`, { pluginId: id });
      return;
    }

    logger.info(`初始化插件配置`, { pluginId: id, schemaVersion: settingsSchema.version });

    // 保存配置模式
    this.schemas.set(id, settingsSchema);

    // 创建默认配置
    const createDefault = (): PluginConfig => {
      const config: PluginConfig = {
        version: settingsSchema.version,
      };

      // 从 schema 中提取默认值
      for (const [key, property] of Object.entries(settingsSchema.properties)) {
        // 兼容新旧格式
        if ("defaultValue" in property) {
          // SettingItem 格式
          config[key] = property.defaultValue;
        } else if ("default" in property) {
          // SettingsProperty 格式
          config[key] = (property as SettingsProperty).default;
        }
      }

      return config;
    };

    // 创建配置管理器
    const configManager = createConfigManager<PluginConfig>({
      moduleName: `plugins-config/${id}`,
      fileName: "config.json",
      version: settingsSchema.version,
      createDefault,
      mergeConfig: (defaultConfig, loadedConfig) => {
        // 自定义合并逻辑：保留用户数据，添加新字段，移除旧字段
        const merged: PluginConfig = { ...defaultConfig };

        // 只保留在新 schema 中存在的配置项
        for (const key of Object.keys(settingsSchema.properties)) {
          if (key in loadedConfig) {
            merged[key] = loadedConfig[key];
          }
        }

        // 确保版本号是最新的
        merged.version = settingsSchema.version;

        // 检查是否发生了迁移
        const oldVersion = loadedConfig.version;
        if (oldVersion && oldVersion !== settingsSchema.version) {
          logger.info(`配置已迁移`, {
            pluginId: id,
            oldVersion,
            newVersion: settingsSchema.version,
          });
        }

        return merged;
      },
    });

    // 保存配置管理器
    this.configManagers.set(id, configManager);

    // 加载配置（这会触发迁移逻辑）
    await configManager.load();

    logger.info(`插件配置初始化完成`, { pluginId: id });
  }

  /**
   * 获取插件的单个配置值
   * @param pluginId 插件 ID
   * @param key 配置键
   */
  async getValue<T = any>(pluginId: string, key: string): Promise<T | undefined> {
    const manager = this.configManagers.get(pluginId);
    if (!manager) {
      logger.warn(`插件配置管理器不存在`, { pluginId });
      return undefined;
    }

    const config = await manager.load();
    return config[key] as T;
  }

  /**
   * 设置插件的单个配置值
   * @param pluginId 插件 ID
   * @param key 配置键
   * @param value 配置值
   */
  async setValue(pluginId: string, key: string, value: any): Promise<void> {
    const manager = this.configManagers.get(pluginId);
    if (!manager) {
      const err = new Error(`插件 ${pluginId} 的配置管理器不存在`);
      errorHandler.error(err, `插件配置管理器不存在`, { context: { pluginId } });
      throw err;
    }

    const schema = this.schemas.get(pluginId);
    if (!schema) {
      const err = new Error(`插件 ${pluginId} 的配置模式不存在`);
      errorHandler.error(err, `插件配置模式不存在`, { context: { pluginId } });
      throw err;
    }

    // 验证配置键是否存在
    if (!(key in schema.properties)) {
      const err = new Error(`配置键 ${key} 不存在于插件 ${pluginId} 的配置模式中`);
      errorHandler.error(err, `配置键不存在`, { context: { pluginId, key } });
      throw err;
    }

    // 验证值类型（仅对旧格式的 SettingsProperty 进行类型检查）
    const property = schema.properties[key];
    if ("type" in property) {
      // SettingsProperty 格式，进行类型检查
      const oldProp = property as SettingsProperty;
      const valueType = typeof value;
      if (valueType !== oldProp.type) {
        const err = new Error(`配置值类型不匹配：期望 ${oldProp.type}，实际 ${valueType}`);
        errorHandler.error(err, `配置值类型不匹配`, {
          context: {
            pluginId,
            key,
            expectedType: oldProp.type,
            actualType: valueType,
          },
        });
        throw err;
      }
    }
    // SettingItem 格式不进行严格的类型检查，因为它更灵活

    // 更新配置
    await manager.update({ [key]: value });
    logger.debug(`配置已更新`, { pluginId, key });
  }

  /**
   * 获取插件的所有配置
   * @param pluginId 插件 ID
   */
  async getAll(pluginId: string): Promise<Record<string, any> | undefined> {
    const manager = this.configManagers.get(pluginId);
    if (!manager) {
      logger.warn(`插件配置管理器不存在`, { pluginId });
      return undefined;
    }

    const config = await manager.load();
    // 移除 version 字段，只返回配置数据
    const { version, ...settings } = config;
    return settings;
  }

  /**
   * 获取插件的配置模式
   * @param pluginId 插件 ID
   */
  getSchema(pluginId: string): SettingsSchema | undefined {
    return this.schemas.get(pluginId);
  }

  /**
   * 移除插件的配置
   * @param pluginId 插件 ID
   */
  removePluginConfig(pluginId: string): void {
    this.configManagers.delete(pluginId);
    this.schemas.delete(pluginId);
    logger.info(`已移除插件配置`, { pluginId });
  }

  /**
   * 创建插件上下文中使用的配置 API
   * @param pluginId 插件 ID
   */
  createPluginSettingsAPI(pluginId: string): PluginSettingsAPI {
    // 在开发模式下，如果请求的是原始 ID 且不带 -dev 后缀，优先尝试寻找对应的 -dev 配置
    // 这解决了插件代码内部硬编码 ID 导致开发版与生产版配置冲突的问题
    let targetPluginId = pluginId;
    if (import.meta.env.DEV && !pluginId.endsWith("-dev")) {
      const devPluginId = `${pluginId}-dev`;
      if (this.configManagers.has(devPluginId)) {
        targetPluginId = devPluginId;
        logger.debug(`配置 API 重定向: ${pluginId} -> ${devPluginId}`);
      }
    }

    return {
      /**
       * 获取单个配置值
       */
      get: async <T = any>(key: string): Promise<T | undefined> => {
        return this.getValue<T>(targetPluginId, key);
      },
      /**
       * 获取所有配置
       */
      getAll: async (): Promise<Record<string, any> | undefined> => {
        return this.getAll(targetPluginId);
      },

      /**
       * 设置单个配置值
       */
      set: async (key: string, value: any): Promise<void> => {
        return this.setValue(targetPluginId, key, value);
      },
    };
  }
}

// 导出单例
export const pluginConfigService = new PluginConfigService();
