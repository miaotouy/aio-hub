/**
 * 移动端通用配置管理
 * 基于 @tauri-apps/plugin-store 实现，提供与桌面端一致的 API 体验
 */

import { load as loadStore, Store } from "@tauri-apps/plugin-store";
import { defaultsDeep } from "lodash-es";
import { createModuleLogger } from "./logger";
import { createModuleErrorHandler } from "./errorHandler";
import { getModuleDir } from "./appPath";
import { join } from "@tauri-apps/api/path";

const logger = createModuleLogger("ConfigManager");
const errorHandler = createModuleErrorHandler("ConfigManager");

/**
 * 配置管理器的选项
 */
export interface ConfigManagerOptions<T> {
  /** 模块标识，将用于生成文件名 */
  moduleName: string;
  /** 配置文件名，默认为 moduleName.json */
  fileName?: string;
  /** 配置版本号 */
  version?: string;
  /** 创建默认配置的函数 */
  createDefault: () => T;
  /** 合并配置的自定义逻辑（可选） */
  mergeConfig?: (defaultConfig: T, loadedConfig: Partial<T>) => T;
  /** 防抖保存的延迟时间（毫秒） */
  debounceDelay?: number;
}

/**
 * 通用配置管理器类 (移动端适配版)
 */
export class ConfigManager<T extends Record<string, any>> {
  private moduleName: string;
  private fileName: string;
  private version: string;
  private createDefault: () => T;
  private mergeConfig?: (defaultConfig: T, loadedConfig: Partial<T>) => T;
  private storePromise: Promise<Store> | null = null;

  /**
   * 防抖保存配置
   */
  public saveDebounced: (config: T) => void;

  constructor(options: ConfigManagerOptions<T>) {
    this.moduleName = options.moduleName;
    this.fileName = options.fileName || `${this.moduleName.replace(/[/\\?%*:|"<>]/g, "_")}.json`;
    this.version = options.version || "1.0.0";
    this.createDefault = options.createDefault;
    this.mergeConfig = options.mergeConfig;

    const delay = options.debounceDelay ?? 500;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    this.saveDebounced = (config: T) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          await this.save(config);
          logger.debug(`防抖保存完成`, { moduleName: this.moduleName, delay });
        } catch (error) {
          errorHandler.handle(error as Error, {
            userMessage: `防抖保存失败`,
            context: { moduleName: this.moduleName },
            showToUser: false,
          });
        }
      }, delay);
    };
  }

  /**
   * 获取或初始化 Store 实例
   */
  private async getStore(): Promise<Store> {
    if (!this.storePromise) {
      // Tauri V2 plugin-store 需要 defaults 属性
      this.storePromise = loadStore(this.fileName, { autoSave: true, defaults: {} });
    }
    return this.storePromise;
  }

  /**
   * 加载配置
   */
  async load(): Promise<T> {
    try {
      const store = await this.getStore();
      const saved = await store.get<T>("config");
      const defaultConfig = this.createDefault();

      let mergedConfig: T;
      if (saved) {
        if (this.mergeConfig) {
          mergedConfig = this.mergeConfig(defaultConfig, saved);
        } else {
          // 默认使用 lodash 的 defaultsDeep 进行深合并，确保嵌套字段也能被正确初始化
          mergedConfig = defaultsDeep({}, saved, defaultConfig);
        }
        // 确保版本号更新
        (mergedConfig as any).version = this.version;
      } else {
        logger.info(`配置文件不存在，使用默认配置`, { moduleName: this.moduleName });
        mergedConfig = { ...defaultConfig };
        (mergedConfig as any).version = this.version;
        await this.save(mergedConfig);
      }

      logger.debug(`配置加载成功`, { moduleName: this.moduleName });
      return mergedConfig;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `加载配置失败`,
        context: { moduleName: this.moduleName, fileName: this.fileName },
        showToUser: false,
      });
      return this.createDefault();
    }
  }

  /**
   * 保存配置
   */
  async save(config: T): Promise<void> {
    try {
      const store = await this.getStore();
      const configWithVersion = {
        ...config,
        version: this.version,
      };
      await store.set("config", configWithVersion);
      // plugin-store 在 autoSave: true 时会自动持久化，但我们可以手动触发一次确保安全
      await store.save();
      logger.info(`配置保存成功`, { moduleName: this.moduleName });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `保存配置失败`,
        context: { moduleName: this.moduleName },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 更新配置的部分字段
   */
  async update(updates: Partial<T>): Promise<T> {
    try {
      const current = await this.load();
      const updated = defaultsDeep({}, updates, current);
      await this.save(updated);
      return updated;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `更新配置失败`,
        context: { moduleName: this.moduleName },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 重置配置为默认值
   */
  async reset(): Promise<T> {
    const defaultConfig = this.createDefault();
    await this.save(defaultConfig);
    return defaultConfig;
  }

  /**
   * 获取模块目录路径
   */
  async getModuleDir(): Promise<string> {
    return await getModuleDir(this.moduleName);
  }

  /**
   * 获取模块内文件的完整路径
   */
  async getFilePath(fileName: string): Promise<string> {
    const moduleDir = await this.getModuleDir();
    return await join(moduleDir, fileName);
  }
}

/**
 * 创建配置管理器的工厂函数
 */
export function createConfigManager<T extends Record<string, any>>(
  options: ConfigManagerOptions<T>
): ConfigManager<T> {
  return new ConfigManager(options);
}