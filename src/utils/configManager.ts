/**
 * 通用配置管理基类
 * 提供配置文件的持久化、加载和保存功能
 */

import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { createModuleLogger } from './logger';

const logger = createModuleLogger('ConfigManager');

/**
 * 配置管理器的选项
 */
export interface ConfigManagerOptions<T> {
  /** 模块目录名 */
  moduleName: string;
  /** 配置文件名 */
  fileName?: string;
  /** 配置版本号 */
  version?: string;
  /** 创建默认配置的函数 */
  createDefault: () => T;
  /** 合并配置的自定义逻辑（可选） */
  mergeConfig?: (defaultConfig: T, loadedConfig: Partial<T>) => T;
}

/**
 * 通用配置管理器类
 */
export class ConfigManager<T extends Record<string, any>> {
  private moduleName: string;
  private fileName: string;
  private version: string;
  private createDefault: () => T;
  private mergeConfig?: (defaultConfig: T, loadedConfig: Partial<T>) => T;
  
  constructor(options: ConfigManagerOptions<T>) {
    this.moduleName = options.moduleName;
    this.fileName = options.fileName || 'config.json';
    this.version = options.version || '1.0.0';
    this.createDefault = options.createDefault;
    this.mergeConfig = options.mergeConfig;
  }
  
  /**
   * 获取配置文件的完整路径
   */
  async getConfigPath(): Promise<string> {
    try {
      const appDir = await appDataDir();
      const moduleDir = await join(appDir, this.moduleName);
      const configPath = await join(moduleDir, this.fileName);
      logger.debug(`获取配置路径: ${configPath}`, { moduleName: this.moduleName, fileName: this.fileName });
      return configPath;
    } catch (error) {
      logger.error(`获取配置路径失败`, error, { moduleName: this.moduleName, fileName: this.fileName });
      throw new Error(`获取配置路径失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 确保模块目录存在
   */
  async ensureModuleDir(): Promise<void> {
    try {
      const appDir = await appDataDir();
      const moduleDir = await join(appDir, this.moduleName);
      
      if (!await exists(moduleDir)) {
        logger.info(`创建模块目录: ${moduleDir}`, { moduleName: this.moduleName });
        await mkdir(moduleDir, { recursive: true });
      }
    } catch (error) {
      logger.error(`创建模块目录失败`, error, { moduleName: this.moduleName });
      throw new Error(`创建模块目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 加载配置
   */
  async load(): Promise<T> {
    try {
      logger.debug(`开始加载配置`, { moduleName: this.moduleName, fileName: this.fileName });
      
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();
      
      if (!await exists(configPath)) {
        // 配置文件不存在，创建默认配置
        logger.info(`配置文件不存在，创建默认配置`, { configPath });
        const defaultConfig = this.createDefault();
        await this.save(defaultConfig);
        return defaultConfig;
      }
      
      const content = await readTextFile(configPath);
      logger.debug(`读取配置文件成功`, { configPath, contentLength: content.length });
      
      const loadedConfig: Partial<T> = JSON.parse(content);
      
      // 确保配置结构完整，补充缺失的字段
      const defaultConfig = this.createDefault();
      
      // 使用自定义合并逻辑或默认的浅合并
      let mergedConfig: T;
      if (this.mergeConfig) {
        mergedConfig = this.mergeConfig(defaultConfig, loadedConfig);
      } else {
        // 默认的浅合并，确保版本号总是更新
        mergedConfig = {
          ...defaultConfig,
          ...loadedConfig,
          version: this.version
        } as T;
      }
      
      logger.info(`配置加载成功`, { moduleName: this.moduleName });
      return mergedConfig;
    } catch (error: any) {
      logger.error(`加载配置失败`, error, {
        moduleName: this.moduleName,
        fileName: this.fileName,
        errorMessage: error?.message
      });
      
      // 加载失败时返回默认配置
      logger.warn(`使用默认配置`, { moduleName: this.moduleName });
      return this.createDefault();
    }
  }
  
  /**
   * 保存配置
   */
  async save(config: T): Promise<void> {
    try {
      logger.debug(`开始保存配置`, { moduleName: this.moduleName });
      
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();
      
      // 确保版本号正确
      const configWithVersion = {
        ...config,
        version: this.version
      };
      
      const jsonContent = JSON.stringify(configWithVersion, null, 2);
      await writeTextFile(configPath, jsonContent);
      
      logger.info(`配置保存成功`, {
        moduleName: this.moduleName,
        configPath,
        contentLength: jsonContent.length
      });
    } catch (error: any) {
      logger.error(`保存配置失败`, error, {
        moduleName: this.moduleName,
        errorMessage: error?.message
      });
      throw new Error(`保存配置失败: ${error?.message || String(error)}`);
    }
  }
  
  /**
   * 更新配置的部分字段
   */
  async update(updates: Partial<T>): Promise<T> {
    try {
      logger.debug(`更新配置`, { moduleName: this.moduleName, updates });
      
      const config = await this.load();
      const newConfig = { ...config, ...updates };
      await this.save(newConfig);
      
      logger.info(`配置更新成功`, { moduleName: this.moduleName });
      return newConfig;
    } catch (error) {
      logger.error(`更新配置失败`, error, { moduleName: this.moduleName });
      throw error;
    }
  }
  
  /**
   * 创建防抖保存函数
   */
  createDebouncedSave(delay: number = 500): (config: T) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return (config: T) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          await this.save(config);
          logger.debug(`防抖保存完成`, { moduleName: this.moduleName, delay });
        } catch (error) {
          logger.error(`防抖保存失败`, error, { moduleName: this.moduleName });
        }
      }, delay);
    };
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