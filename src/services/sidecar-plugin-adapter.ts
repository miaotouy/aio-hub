/**
 * Sidecar 插件适配器
 *
 * 将 Sidecar 插件包装成符合 ToolService 接口的代理对象
 */

import type { ServiceMetadata } from "./types";
import type { PluginProxy, PluginManifest, PlatformKey } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const logger = createModuleLogger("services/sidecar-plugin-adapter");
const errorHandler = createModuleErrorHandler("services/sidecar-plugin-adapter");

/**
 * Sidecar 输出事件
 */
interface SidecarOutputEvent {
  plugin_id: string;
  event_type: string;
  data: string;
}

/**
 * Sidecar 执行请求
 */
interface SidecarExecuteRequest {
  plugin_id: string;
  executable_path: string;
  args: string[];
  input?: string;
  dev_mode: boolean;
}

/**
 * Sidecar 插件适配器类
 *
 * 将一个 Sidecar 插件包装成 ToolService 接口
 */
export class SidecarPluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly manifest: PluginManifest;
  public readonly installPath: string;
  public readonly devMode: boolean;
  public enabled: boolean = false;

  private unlisten: UnlistenFn | null = null;
  private eventHandlers: Map<string, (event: SidecarOutputEvent) => void> = new Map();

  constructor(manifest: PluginManifest, installPath: string, devMode: boolean = false) {
    this.manifest = manifest;
    this.installPath = installPath;
    // 开发模式下为 ID 添加后缀，避免与生产版本冲突
    this.id = devMode ? `${manifest.id}-dev` : manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;
    this.devMode = devMode;

    logger.debug(`创建 Sidecar 插件适配器: ${this.id}`, { devMode, installPath });
  }

  /**
   * 启用插件 - 设置事件监听
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      logger.warn(`插件 ${this.id} 已经启用`);
      return;
    }

    logger.info(`启用 Sidecar 插件: ${this.id}`);

    // 监听 Sidecar 输出事件
    this.unlisten = await listen<SidecarOutputEvent>("sidecar-output", (event) => {
      const data = event.payload;
      
      // 只处理本插件的事件
      if (data.plugin_id === this.manifest.id) {
        logger.debug(`收到 Sidecar 输出事件: ${data.event_type}`, { data: data.data });
        
        // 触发对应的事件处理器
        const handler = this.eventHandlers.get(data.event_type);
        if (handler) {
          handler(data);
        }
      }
    });

    this.enabled = true;
  }

  /**
   * 禁用插件 - 移除事件监听
   */
  disable(): void {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用 Sidecar 插件: ${this.id}`);

    // 移除事件监听
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    // 清空事件处理器
    this.eventHandlers.clear();

    this.enabled = false;
  }

  /**
   * 初始化方法 (ToolService 接口)
   */
  async initialize(): Promise<void> {
    logger.debug(`初始化插件: ${this.id}`);
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
   * 获取当前平台的可执行文件路径
   */
  private getExecutablePath(): string {
    if (!this.manifest.sidecar) {
      throw new Error(`插件 ${this.id} 缺少 sidecar 配置`);
    }

    // 获取当前平台标识
    const platform = this.getCurrentPlatform();
    const executablePath = this.manifest.sidecar.executable[platform];

    if (!executablePath) {
      throw new Error(`插件 ${this.id} 不支持当前平台: ${platform}`);
    }

    return executablePath;
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
   * 执行 Sidecar 插件方法
   */
  private async executeSidecar(methodName: string, params: any): Promise<any> {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    logger.info(`执行 Sidecar 方法: ${this.id}.${methodName}`, { params });

    // 获取可执行文件路径
    const executablePath = this.getExecutablePath();

    // 获取配置
    const settings = pluginConfigService.createPluginSettingsAPI(this.manifest.id);

    // 准备输入数据
    const inputData = {
      method: methodName,
      params,
      settings: settings.getAll(),
    };

    // 准备命令行参数
    const args = this.manifest.sidecar?.args || [];

    // 构建执行请求
    const request: SidecarExecuteRequest = {
      plugin_id: this.manifest.id,
      executable_path: executablePath,
      args,
      input: JSON.stringify(inputData),
      dev_mode: this.devMode,
    };

    // 返回一个 Promise，监听事件并解析结果
    return new Promise((resolve, reject) => {
      let hasResult = false;

      // 注册临时事件处理器
      const progressHandler = (event: SidecarOutputEvent) => {
        try {
          const data = JSON.parse(event.data);
          logger.debug(`进度更新: ${data.message || data.percent}%`);
        } catch (error) {
          logger.warn("解析进度数据失败", { error, data: event.data });
        }
      };

      const resultHandler = (event: SidecarOutputEvent) => {
        if (hasResult) return;
        hasResult = true;

        try {
          const data = JSON.parse(event.data);
          logger.info(`方法执行成功: ${methodName}`, { result: data.data });
          
          // 清理临时处理器
          this.eventHandlers.delete("progress");
          this.eventHandlers.delete("result");
          this.eventHandlers.delete("error");
          
          resolve(data.data);
        } catch (error) {
          errorHandler.error(error, "解析结果数据失败", { context: { data: event.data } });
          reject(new Error(`解析结果失败: ${error}`));
        }
      };

      const customErrorHandler = (event: SidecarOutputEvent) => {
        if (hasResult) return;
        hasResult = true;

        errorHandler.error(new Error(event.data), '方法执行失败', { context: { methodName } });
        
        // 清理临时处理器
        this.eventHandlers.delete("progress");
        this.eventHandlers.delete("result");
        this.eventHandlers.delete("error");
        
        reject(new Error(event.data));
      };
 
      // 注册临时处理器
      this.eventHandlers.set("progress", progressHandler);
      this.eventHandlers.set("result", resultHandler);
      this.eventHandlers.set("error", customErrorHandler);

      // 调用后端命令
      invoke<string>("execute_sidecar", { request })
        .then((result) => {
          // 如果后端直接返回了结果（而不是通过事件）
          if (!hasResult) {
            try {
              const data = JSON.parse(result);
              if (data.type === "result") {
                hasResult = true;
                
                // 清理临时处理器
                this.eventHandlers.delete("progress");
                this.eventHandlers.delete("result");
                this.eventHandlers.delete("error");
                
                resolve(data.data);
              }
            } catch (error) {
              logger.warn("解析后端返回结果失败", { error, result });
            }
          }
        })
        .catch((error) => {
          if (!hasResult) {
            hasResult = true;
            
            // 清理临时处理器
            this.eventHandlers.delete("progress");
            this.eventHandlers.delete("result");
            this.eventHandlers.delete("error");
            
            errorHandler.error(error, '调用后端命令失败', { context: { methodName } });
            reject(error);
          }
        });
    });
  }

  /**
   * 动态方法调用代理
   *
   * @internal 此方法通过 Proxy 动态调用
   */
  public callPluginMethod(methodName: string, params: any): any {
    return this.executeSidecar(methodName, params);
  }
}

/**
 * 创建 Sidecar 插件代理
 *
 * 使用 Proxy 动态拦截方法调用
 *
 * @param manifest - 插件清单
 * @param installPath - 插件安装路径
 * @param devMode - 是否为开发模式插件
 * @returns 插件代理对象
 */
export function createSidecarPluginProxy(
  manifest: PluginManifest,
  installPath: string,
  devMode: boolean = false
): PluginProxy {
  const adapter = new SidecarPluginAdapter(manifest, installPath, devMode);

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
        return target.callPluginMethod(propStr, params);
      };
    },
  }) as PluginProxy;
}