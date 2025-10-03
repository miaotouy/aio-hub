/**
 * 通用配置管理基类
 * 提供配置文件的持久化、加载和保存功能
 */

import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

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
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, this.moduleName);
    return join(moduleDir, this.fileName);
  }
  
  /**
   * 确保模块目录存在
   */
  async ensureModuleDir(): Promise<void> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, this.moduleName);
    
    if (!await exists(moduleDir)) {
      await mkdir(moduleDir, { recursive: true });
    }
  }
  
  /**
   * 加载配置
   */
  async load(): Promise<T> {
    try {
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();
      
      if (!await exists(configPath)) {
        // 配置文件不存在，创建默认配置
        const defaultConfig = this.createDefault();
        await this.save(defaultConfig);
        return defaultConfig;
      }
      
      const content = await readTextFile(configPath);
      const loadedConfig: Partial<T> = JSON.parse(content);
      
      // 确保配置结构完整，补充缺失的字段
      const defaultConfig = this.createDefault();
      
      // 使用自定义合并逻辑或默认的浅合并
      if (this.mergeConfig) {
        return this.mergeConfig(defaultConfig, loadedConfig);
      } else {
        // 默认的浅合并，确保版本号总是更新
        return {
          ...defaultConfig,
          ...loadedConfig,
          version: this.version
        } as T;
      }
    } catch (error: any) {
      console.error(`加载${this.moduleName}配置失败:`, error);
      // 加载失败时返回默认配置
      return this.createDefault();
    }
  }
  
  /**
   * 保存配置
   */
  async save(config: T): Promise<void> {
    try {
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();
      
      // 确保版本号正确
      const configWithVersion = {
        ...config,
        version: this.version
      };
      
      await writeTextFile(configPath, JSON.stringify(configWithVersion, null, 2));
    } catch (error: any) {
      console.error(`保存${this.moduleName}配置失败:`, error);
      throw new Error(`保存配置失败: ${error.message}`);
    }
  }
  
  /**
   * 更新配置的部分字段
   */
  async update(updates: Partial<T>): Promise<T> {
    const config = await this.load();
    const newConfig = { ...config, ...updates };
    await this.save(newConfig);
    return newConfig;
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
        } catch (error) {
          console.error(`自动保存${this.moduleName}配置失败:`, error);
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