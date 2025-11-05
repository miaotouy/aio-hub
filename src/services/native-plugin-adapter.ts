/**
 * 原生插件适配器
 *
 * 将原生插件包装成符合 ToolService 接口的代理对象
 */

import type { ServiceMetadata } from "./types";
import type { PluginProxy, PluginManifest, PlatformKey } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { pluginConfigService } from "./plugin-config.service";
import { invoke } from "@tauri-apps/api/core";
import { path } from "@tauri-apps/api";

const logger = createModuleLogger("services/native-plugin-adapter");

/**
 * 原生插件适配器类
 *
 * 将一个原生插件包装成 ToolService 接口
 */
export class NativePluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly manifest: PluginManifest;
  public readonly installPath: string;
  public readonly devMode: boolean;
  public enabled: boolean = false;

  constructor(manifest: PluginManifest, installPath: string, devMode: boolean = false) {
    this.manifest = manifest;
    this.installPath = installPath;
    // 开发模式下为 ID 添加后缀，避免与生产版本冲突
    this.id = devMode ? `${manifest.id}-dev` : manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;
    this.devMode = devMode;

    logger.debug(`创建原生插件适配器: ${this.id}`, { devMode, installPath });
  }

  /**
   * 启用插件 - 加载动态库
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      logger.warn(`插件 ${this.id} 已经启用`);
      return;
    }

    logger.info(`启用原生插件: ${this.id}`);

    try {
      // 获取库文件路径
      const libraryPath = await this.getLibraryPath();
      
      // 调用后端加载动态库
      await invoke('load_native_plugin', {
        pluginId: this.manifest.id,
        libraryPath,
      });
      
      this.enabled = true;
      logger.info(`原生插件 ${this.id} 启用成功`);
    } catch (error) {
      logger.error(`启用原生插件失败: ${this.id}`, error);
      throw error;
    }
  }

  /**
   * 禁用插件 - 卸载动态库
   */
  disable(): void {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用原生插件: ${this.id}`);
    
    try {
      // 调用后端卸载动态库
      invoke('unload_native_plugin', { pluginId: this.manifest.id });
      this.enabled = false;
      logger.info(`原生插件 ${this.id} 禁用成功`);
    } catch (error) {
      logger.error(`禁用原生插件失败: ${this.id}`, error);
      // 即使卸载失败，也标记为禁用
      this.enabled = false;
    }
  }

  /**
   * 获取当前平台的库文件路径
   */
  private async getLibraryPath(): Promise<string> {
    if (!this.manifest.native) {
      throw new Error(`插件 ${this.id} 缺少 native 配置`);
    }

    // 获取当前平台标识
    const platform = this.getCurrentPlatform();
    const libraryFile = this.manifest.native.library[platform];

    if (!libraryFile) {
      throw new Error(`插件 ${this.id} 不支持当前平台: ${platform}`);
    }

    // 构建完整的库文件路径
    return await path.join(this.installPath, libraryFile);
  }

  /**
   * 获取当前平台标识
   */
  private getCurrentPlatform(): PlatformKey {
    const platform = window.navigator.platform.toLowerCase();
    const arch = navigator.userAgent.includes("x64") ? "x64" : "arm64";

    if (platform.includes("win")) {
      return `win32-${arch}` as PlatformKey;
    } else if (platform.includes("mac")) {
      return `darwin-${arch}` as PlatformKey;
    } else if (platform.includes("linux")) {
      return `linux-${arch}` as PlatformKey;
    }

    throw new Error(`不支持的平台: ${platform}`);
  }

  /**
   * 初始化方法 (ToolService 接口)
   */
  async initialize(): Promise<void> {
    logger.debug(`初始化插件: ${this.id}`);
    // 原生插件通常不需要特殊的初始化逻辑
  }

  /**
   * 销毁方法 (ToolService 接口)
   */
  dispose(): void {
    this.disable();
    logger.debug(`销毁插件: ${this.id}`);
  }

  /**
   * 获取服务元数据 (ToolService 接口)
   */
  getMetadata(): ServiceMetadata {
    return {
      methods: this.manifest.methods,
    };
  }

  /**
   * 执行原生插件方法
   */
  private async executeNative(methodName: string, params: any): Promise<any> {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    logger.info(`执行原生方法: ${this.id}.${methodName}`, { params });

    try {
      // 获取配置
      const settings = pluginConfigService.createPluginSettingsAPI(this.manifest.id);

      // 准备输入数据
      const inputData = {
        method: methodName,
        params,
        settings: settings.getAll(),
      };

      // 调用后端命令
      const result = await invoke<string>('call_native_plugin_method', {
        pluginId: this.manifest.id,
        methodName,
        payload: JSON.stringify(inputData),
      });

      // 尝试解析为 JSON，如果失败则返回原始字符串
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    } catch (error) {
      logger.error(`原生方法调用失败: ${this.id}.${methodName}`, error);
      throw error;
    }
  }

  /**
   * 动态方法调用代理
   *
   * @internal 此方法通过 Proxy 动态调用
   */
  // @ts-expect-error - 此方法通过 Proxy 动态调用
  private callPluginMethod(methodName: string, params: any): any {
    return this.executeNative(methodName, params);
  }
}

/**
 * 创建原生插件代理
 *
 * 使用 Proxy 动态拦截方法调用
 *
 * @param manifest - 插件清单
 * @param installPath - 插件安装路径
 * @param devMode - 是否为开发模式插件
 * @returns 插件代理对象
 */
export function createNativePluginProxy(
  manifest: PluginManifest,
  installPath: string,
  devMode: boolean = false
): PluginProxy {
  const adapter = new NativePluginAdapter(manifest, installPath, devMode);

  // 使用 Proxy 拦截所有属性访问
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      // 如果是适配器自己的属性或方法，直接返回
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // 否则，返回一个函数，该函数会调用插件的对应方法
      const propStr = String(prop);

      // 检查是否是 manifest 中声明的方法
      const hasMethod = target.manifest.methods.some((m) => m.name === propStr);
      if (!hasMethod) {
        return undefined;
      }

      // 返回一个函数，调用插件的实际方法
      return (params: any) => {
        return (target as any).callPluginMethod(propStr, params);
      };
    },
  }) as PluginProxy;
}