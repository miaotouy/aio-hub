// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 通用配置管理基类
 * 提供配置文件的持久化、加载和保存功能
 *
 * 环境自适应：
 * - Tauri 环境：使用 invoke / writeTextFile 进行真实的文件系统读写
 * - 非 Tauri 环境（Vitest / Bun 脚本）：自动降级为内存存储模式，不依赖任何 Tauri API
 */

import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getAppConfigDir } from "./appPath";
import * as yaml from "js-yaml";
import { createModuleLogger } from "./logger";
import { createModuleErrorHandler } from "./errorHandler";

const logger = createModuleLogger("ConfigManager");
const errorHandler = createModuleErrorHandler("ConfigManager");

// 检测是否处于 Tauri 运行时环境
const isTauri =
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

// 非 Tauri 环境下的全局内存存储（跨实例共享，模拟文件系统）
const memoryStore = new Map<string, string>();

/** 生成内存存储的虚拟 key */
function memoryKey(moduleName: string, fileName: string): string {
  return `${moduleName}/${fileName}`;
}

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

  /** 缓存：配置文件完整路径（首次计算后不再通过 IPC 获取） */
  private _cachedConfigPath: string | null = null;
  /** 缓存：模块目录是否已确认存在（避免每次 save 都 IPC 检查） */
  private _dirEnsured = false;

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

      timeoutId = setTimeout(() => {
        try {
          // 彻底异步化：不 await save，防止后端 IO 阻塞导致 IPC 队列堆积
          this.save(config).catch((error) => {
            errorHandler.handle(error as Error, {
              userMessage: `防抖保存执行失败`,
              context: { moduleName: this.moduleName },
              showToUser: false,
            });
          });
          logger.debug(`已触发防抖保存`, {
            moduleName: this.moduleName,
            delay,
          });
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
   * 获取配置文件的完整路径（带缓存，避免重复 IPC）
   */
  async getConfigPath(): Promise<string> {
    if (this._cachedConfigPath) {
      return this._cachedConfigPath;
    }
    // 非 Tauri 环境：返回虚拟路径
    if (!isTauri) {
      const virtualPath = memoryKey(this.moduleName, this.fileName);
      this._cachedConfigPath = virtualPath;
      return virtualPath;
    }
    try {
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, this.moduleName);
      const configPath = await join(moduleDir, this.fileName);
      this._cachedConfigPath = configPath;
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
   * 确保模块目录存在（首次检查后缓存结果，后续跳过）
   */
  async ensureModuleDir(): Promise<void> {
    if (this._dirEnsured) {
      return;
    }
    // 非 Tauri 环境：无需创建目录
    if (!isTauri) {
      this._dirEnsured = true;
      return;
    }
    try {
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, this.moduleName);

      const isExists = await invoke<boolean>("path_exists", {
        path: moduleDir,
      });
      if (!isExists) {
        logger.info(`创建模块目录: ${moduleDir}`, {
          moduleName: this.moduleName,
        });
        await invoke("create_dir_force", { path: moduleDir });
      }
      this._dirEnsured = true;
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

      // 非 Tauri 环境：从内存存储读取
      if (!isTauri) {
        const key = memoryKey(this.moduleName, this.fileName);
        const stored = memoryStore.get(key);
        if (stored === undefined) {
          // 首次访问，创建默认配置并存入内存
          const defaultConfig = this.createDefault();
          memoryStore.set(key, JSON.stringify(defaultConfig));
          logger.debug(`[Memory] 配置不存在，创建默认配置`, {
            moduleName: this.moduleName,
          });
          return defaultConfig;
        }
        const loadedConfig = JSON.parse(stored) as Partial<T>;
        const defaultConfig = this.createDefault();
        let mergedConfig: T;
        if (this.mergeConfig) {
          mergedConfig = this.mergeConfig(defaultConfig, loadedConfig);
        } else {
          mergedConfig = {
            ...defaultConfig,
            ...loadedConfig,
            version: this.version,
          } as T;
        }
        logger.debug(`[Memory] 配置加载成功`, { moduleName: this.moduleName });
        return mergedConfig;
      }

      // Tauri 环境：从文件系统读取
      const isExists = await invoke<boolean>("path_exists", {
        path: configPath,
      });
      if (!isExists) {
        // 配置文件不存在，创建默认配置
        logger.info(`配置文件不存在，创建默认配置`, {
          moduleName: this.moduleName,
          configPath,
        });
        const defaultConfig = this.createDefault();
        await this.save(defaultConfig);
        return defaultConfig;
      }

      const content = await invoke<string>("read_text_file_force", {
        path: configPath,
      });
      let loadedConfig: Partial<T> = {};

      switch (this.fileType) {
        case "json":
          loadedConfig = JSON.parse(content);
          break;
        case "yaml":
          loadedConfig = yaml.load(content) as Partial<T>;
          break;
        case "jsonl":
          const lines = content
            .split("\n")
            .filter((line) => line.trim() !== "");
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

      // 非 Tauri 环境：写入内存存储
      if (!isTauri) {
        const key = memoryKey(this.moduleName, this.fileName);
        memoryStore.set(key, JSON.stringify(configWithVersion));
        logger.debug(`[Memory] 配置保存成功`, { moduleName: this.moduleName });
        return;
      }

      // Tauri 环境：写入文件系统
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

      // 使用 plugin-fs.writeTextFile 直传字符串，避免 Uint8Array→IPC JSON 数字数组的膨胀开销
      const invokeStart = performance.now();
      await writeTextFile(configPath, content);
      const invokeEnd = performance.now();
      if (invokeEnd - invokeStart > 300) {
        logger.warn(
          `[Perf] writeTextFile 耗时过长: ${(invokeEnd - invokeStart).toFixed(2)}ms`,
          {
            moduleName: this.moduleName,
            path: configPath,
            contentLength: content.length,
          }
        );
      }

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
