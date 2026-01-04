/**
 * 通用配置管理基类
 * 提供配置文件的持久化、加载和保存功能
 */

import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "./appPath";
import * as yaml from "js-yaml";
import { createModuleLogger } from "./logger";
import { createModuleErrorHandler } from "./errorHandler";

const logger = createModuleLogger("ConfigManager");
const errorHandler = createModuleErrorHandler("ConfigManager");

export type FileType = "json" | "yaml" | "jsonl";

/**
 * 配置管理器的选项
 */
export interface ConfigManagerOptions<T> {
  /** 模块目录名 */
  moduleName: string;
  /**
   * 配置文件名。如果未提供，则默认为 `config.[fileType]`。
   * 例如 `config.json`, `config.yaml`
   */
  fileName?: string;
  /** 文件类型 */
  fileType?: FileType;
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
 * 通用配置管理器类
 */
export class ConfigManager<T extends Record<string, any>> {
  private moduleName: string;
  private fileName: string;
  private fileType: FileType;
  private version: string;
  private createDefault: () => T;
  private mergeConfig?: (defaultConfig: T, loadedConfig: Partial<T>) => T;

  /**
   * 防抖保存配置。
   * @param config - 要保存的配置对象。
   */
  public saveDebounced: (config: T) => void;

  constructor(options: ConfigManagerOptions<T>) {
    this.moduleName = options.moduleName;
    this.fileType = options.fileType || "json";
    this.fileName = options.fileName || `config.${this.fileType}`;
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
   * 获取配置文件的完整路径
   */
  async getConfigPath(): Promise<string> {
    try {
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, this.moduleName);
      const configPath = await join(moduleDir, this.fileName);
      // 只在错误时输出，正常情况不需要日志
      return configPath;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `获取配置路径失败`,
        context: {
          moduleName: this.moduleName,
          fileName: this.fileName,
        },
        showToUser: false,
      });
      throw new Error(
        `获取配置路径失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 确保模块目录存在
   */
  async ensureModuleDir(): Promise<void> {
    try {
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, this.moduleName);

      const isExists = await invoke<boolean>("path_exists", { path: moduleDir });
      if (!isExists) {
        logger.info(`创建模块目录: ${moduleDir}`, { moduleName: this.moduleName });
        await invoke("create_dir_force", { path: moduleDir });
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `创建模块目录失败`,
        context: { moduleName: this.moduleName },
        showToUser: false,
      });
      throw new Error(
        `创建模块目录失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 加载配置
   */
  async load(): Promise<T> {
    try {
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();

      const isExists = await invoke<boolean>("path_exists", { path: configPath });
      if (!isExists) {
        // 配置文件不存在，创建默认配置
        logger.info(`配置文件不存在，创建默认配置`, { moduleName: this.moduleName, configPath });
        const defaultConfig = this.createDefault();
        await this.save(defaultConfig);
        return defaultConfig;
      }

      const content = await invoke<string>("read_text_file_force", { path: configPath });
      let loadedConfig: Partial<T> = {};

      switch (this.fileType) {
        case "json":
          loadedConfig = JSON.parse(content);
          break;
        case "yaml":
          loadedConfig = yaml.load(content) as Partial<T>;
          break;
        case "jsonl":
          const lines = content.split("\n").filter((line) => line.trim() !== "");
          const objects = lines.map((line) => JSON.parse(line));
          loadedConfig = Object.assign({}, ...objects);
          break;
        default:
          throw new Error(`不支持的文件类型: ${this.fileType}`);
      }

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
          version: this.version,
        } as T;
      }

      logger.debug(`配置加载成功`, { moduleName: this.moduleName });
      return mergedConfig;
    } catch (error: any) {
      errorHandler.handle(error as Error, {
        userMessage: `加载配置失败`,
        context: {
          moduleName: this.moduleName,
          fileName: this.fileName,
          errorMessage: error?.message,
        },
        showToUser: false,
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
      await this.ensureModuleDir();
      const configPath = await this.getConfigPath();

      // 确保版本号正确
      const configWithVersion = {
        ...config,
        version: this.version,
      };

      let content = "";
      switch (this.fileType) {
        case "json":
          content = JSON.stringify(configWithVersion, null, 2);
          break;
        case "yaml":
          content = yaml.dump(configWithVersion);
          break;
        case "jsonl":
          // 对于jsonl，通常是每行一个完整的json对象，这里简化为只保存最新的配置状态
          content = JSON.stringify(configWithVersion);
          break;
        default:
          throw new Error(`不支持的文件类型: ${this.fileType}`);
      }
      // 使用 Rust 后端命令强制写入，绕过前端 Scope 限制
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(content);
      await invoke("write_file_force", {
        path: configPath,
        content: Array.from(uint8Array)
      });

      // 保存成功时输出简洁日志
      logger.info(`配置保存成功`, { moduleName: this.moduleName });
    } catch (error: any) {
      errorHandler.handle(error as Error, {
        userMessage: `保存配置失败`,
        context: {
          moduleName: this.moduleName,
          errorMessage: error?.message,
        },
        showToUser: false,
      });
      throw new Error(`保存配置失败: ${error?.message || String(error)}`);
    }
  }

  /**
   * 更新配置的部分字段
   */
  async update(updates: Partial<T>): Promise<T> {
    try {
      const config = await this.load();
      const newConfig = { ...config, ...updates };
      await this.save(newConfig);

      // save() 已经会输出日志，这里不需要重复
      return newConfig;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: `更新配置失败`,
        context: { moduleName: this.moduleName },
        showToUser: false,
      });
      throw error;
    }
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
