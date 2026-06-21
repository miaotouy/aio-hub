/**
 * Sidecar 插件适配器
 *
 * 将 Sidecar 插件包装成符合 ToolRegistry 接口的代理对象
 * 支持一次性模式和常驻模式（Resident Mode）
 */

import type { ServiceMetadata } from "./types";
import type { PluginProxy, PluginManifest, PlatformKey } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";
import { pluginManager } from "./plugin-manager";
import { pluginEnvironmentService } from "./plugin-environment.service";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const logger = createModuleLogger("services/sidecar-plugin-adapter");
const errorHandler = createModuleErrorHandler(
  "services/sidecar-plugin-adapter"
);

/**
 * Sidecar 输出事件（一次性模式）
 */
interface SidecarOutputEvent {
  plugin_id: string;
  event_type: string;
  data: string;
}

/**
 * 常驻 Sidecar 事件（常驻模式）
 */
interface SidecarResidentEvent {
  plugin_id: string;
  event_type: string;
  event_name: string | null;
  data: string;
}

/**
 * Sidecar 执行请求（一次性模式）
 */
interface SidecarExecuteRequest {
  plugin_id: string;
  install_path: string;
  executable_path: string;
  args: string[];
  input?: string;
  dev_mode: boolean;
}

/**
 * Sidecar 插件适配器类
 *
 * 根据 manifest 中 sidecar.resident 的值自动选择：
 * - 一次性模式：每次调用 spawn 新进程（默认）
 * - 常驻模式：保持长连接，通过 JSON-RPC 通信
 */
export class SidecarPluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly manifest: PluginManifest;
  public readonly installPath: string;
  public iconUrl?: string;
  public readonly devMode: boolean;
  public enabled: boolean = false;

  /** 是否为常驻模式 */
  public readonly isResident: boolean;

  private unlisten: UnlistenFn | null = null;
  private residentEventUnlisten: UnlistenFn | null = null;
  private eventHandlers: Map<string, (event: SidecarOutputEvent) => void> =
    new Map();
  /** 常驻模式自定义事件回调 */
  private residentEventCallbacks: Map<string, Array<(data: any) => void>> =
    new Map();
  /** 常驻模式通用事件回调（对应 onSidecarEvent） */
  private sidecarEventCallbacks: Set<(eventName: string, data: any) => void> =
    new Set();

  constructor(
    manifest: PluginManifest,
    installPath: string,
    devMode: boolean = false
  ) {
    this.manifest = manifest;
    this.installPath = installPath;
    // 开发模式下为 ID 添加后缀，避免与生产版本冲突
    this.id = devMode ? `${manifest.id}-dev` : manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;
    this.devMode = devMode;

    // 判断是否为常驻模式
    this.isResident = manifest.sidecar?.resident === true;

    logger.debug(`创建 Sidecar 插件适配器: ${this.id}`, {
      devMode,
      installPath,
      isResident: this.isResident,
    });
  }

  /**
   * 启用插件
   *
   * - 一次性模式：监听 sidecar-output 事件
   * - 常驻模式：启动常驻进程 + 监听 sidecar-resident-event
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      logger.warn(`插件 ${this.id} 已经启用`);
      return;
    }

    logger.info(
      `启用 Sidecar 插件: ${this.id} (${
        this.isResident ? "常驻模式" : "一次性模式"
      })`
    );

    if (this.isResident) {
      await this.enableResident();
    } else {
      await this.enableOneshot();
    }

    this.enabled = true;
    await pluginManager.updateRuntimeState(this.id, true);
  }

  /**
   * 一次性模式启用
   */
  private async enableOneshot(): Promise<void> {
    this.unlisten = await listen<SidecarOutputEvent>(
      "sidecar-output",
      (event) => {
        const data = event.payload;

        if (data.plugin_id === this.manifest.id) {
          logger.debug(`收到 Sidecar 输出事件: ${data.event_type}`, {
            data: data.data,
          });

          const handler = this.eventHandlers.get(data.event_type);
          if (handler) {
            handler(data);
          }
        }
      }
    );
  }

  /**
   * 常驻模式启用：启动进程 + 监听事件
   */
  private async enableResident(): Promise<void> {
    const executablePath = this.getExecutablePath();
    const args = this.manifest.sidecar?.args || [];

    let processSpawned = false;

    try {
      // 启动常驻进程
      await invoke("sidecar_spawn_resident", {
        pluginId: this.manifest.id,
        executablePath,
        args,
      });
      processSpawned = true;

      // 监听常驻 Sidecar 事件
      this.residentEventUnlisten = await listen<SidecarResidentEvent>(
        "sidecar-resident-event",
        (event) => {
          const data = event.payload;

          // 只处理本插件的事件
          if (data.plugin_id === this.manifest.id) {
            logger.debug(`收到常驻 Sidecar 事件: ${data.event_type}`, {
              eventName: data.event_name,
              data: data.data,
            });

            // 如果是主动推送的 event 类型，触发回调
            if (data.event_type === "event" && data.event_name) {
              // 触发通用的 onSidecarEvent 回调
              this.sidecarEventCallbacks.forEach((cb) => {
                try {
                  const parsed = JSON.parse(data.data);
                  cb(data.event_name!, parsed.data || parsed);
                } catch {
                  cb(data.event_name!, data.data);
                }
              });

              // 触发按名称分类的回调
              const eventCallbacks = this.residentEventCallbacks.get(
                data.event_name
              );
              if (eventCallbacks) {
                eventCallbacks.forEach((cb) => {
                  try {
                    const parsed = JSON.parse(data.data);
                    cb(parsed.data || parsed);
                  } catch {
                    cb(data.data);
                  }
                });
              }
            }

            // 如果是 progress/result/error 类型，映射回 handlers
            if (
              data.event_type === "progress" ||
              data.event_type === "result" ||
              data.event_type === "error"
            ) {
              const wrappedEvent: SidecarOutputEvent = {
                plugin_id: data.plugin_id,
                event_type: data.event_type,
                data: data.data,
              };
              const handler = this.eventHandlers.get(data.event_type);
              if (handler) {
                handler(wrappedEvent);
              }
            }
          }
        }
      );

      // 如果声明了 startupMethod，自动执行启动初始化
      if (this.manifest.sidecar?.startupMethod) {
        const startupMethod = this.manifest.sidecar.startupMethod;
        const startupParams = this.manifest.sidecar.startupParams || {};

        logger.info(`执行常驻插件启动方法: ${this.id}.${startupMethod}`);

        try {
          const startupResult = await this.executeSidecarResident(
            startupMethod,
            startupParams
          );
          logger.info(`常驻插件初始化完成: ${this.id}`, {
            result: startupResult,
          });
        } catch (error) {
          errorHandler.error(error, `常驻插件初始化失败: ${this.id}`, {
            context: { startupMethod },
          });
          throw error;
        }
      }
    } catch (error) {
      logger.error(`常驻插件启动流程异常: ${this.id}`, error);

      // 如果进程已经启动，但后续步骤（如监听或初始化方法）失败了，必须立刻清理进程，防止残留
      if (processSpawned) {
        logger.info(`启动流程失败，正在清理已启动的常驻进程: ${this.id}`);
        try {
          if (this.residentEventUnlisten) {
            this.residentEventUnlisten();
            this.residentEventUnlisten = null;
          }
          await invoke("sidecar_kill_resident", {
            pluginId: this.manifest.id,
          });
        } catch (killError) {
          logger.warn(`清理常驻进程失败: ${this.id}`, { killError });
        }
      }

      throw error;
    }
  }

  /**
   * 禁用插件
   *
   * - 一次性模式：移除事件监听
   * - 常驻模式：停止进程 + 移除事件监听
   */
  async disable(): Promise<void> {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用 Sidecar 插件: ${this.id}`);

    // 移除一次性模式的事件监听
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }

    // 移除常驻模式的事件监听
    if (this.residentEventUnlisten) {
      this.residentEventUnlisten();
      this.residentEventUnlisten = null;
    }

    // 如果是常驻模式，请求停止进程
    if (this.isResident) {
      try {
        await invoke("sidecar_kill_resident", {
          pluginId: this.manifest.id,
        });
        logger.info(`常驻进程已停止: ${this.id}`);
      } catch (error) {
        errorHandler.error(error, `停止常驻进程失败: ${this.id}`);
      }
    }

    // 清空处理器
    this.eventHandlers.clear();
    this.residentEventCallbacks.clear();
    this.sidecarEventCallbacks.clear();

    this.enabled = false;
    await pluginManager.updateRuntimeState(this.id, false);
  }

  /**
   * 初始化方法 (ToolRegistry 接口)
   */
  async initialize(): Promise<void> {
    logger.debug(`初始化插件: ${this.id}`);
  }

  /**
   * 销毁方法 (ToolRegistry 接口)
   */
  async dispose(): Promise<void> {
    await this.disable();
    logger.debug(`销毁插件: ${this.id}`);
  }

  /**
   * 获取服务元数据 (ToolRegistry 接口)
   */
  getMetadata(): ServiceMetadata {
    return {
      methods: this.manifest.methods ?? [],
    };
  }

  /**
   * 获取当前平台的可执行文件路径
   */
  private getExecutablePath(): string {
    if (!this.manifest.sidecar) {
      throw new Error(`插件 ${this.id} 缺少 sidecar 配置`);
    }

    const platform = this.getCurrentPlatform();
    const executablePath = this.manifest.sidecar.executable[platform];

    if (!executablePath) {
      throw new Error(`插件 ${this.id} 不支持当前平台: ${platform}`);
    }

    return this.resolveExecutableFullPath(executablePath);
  }

  /**
   * 解析可执行文件的完整路径
   *
   * 在开发模式下，executable 是相对于项目根目录的路径。
   * 在生产模式下，executable 是相对于插件安装目录的路径。
   */
  private resolveExecutableFullPath(executablePath: string): string {
    // 如果已经是绝对路径，直接返回
    if (/^[a-zA-Z]:[\\/]/.test(executablePath)) {
      return executablePath;
    }

    if (this.devMode) {
      // 开发模式：相对于插件源码目录
      const basePath = this.installPath;
      const cleanBase = basePath.replace(/^\/plugins\//, "plugins/");
      return `${cleanBase}/${executablePath}`;
    } else {
      // 生产模式：相对于插件安装目录
      return `${this.installPath}/${executablePath}`;
    }
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
   *
   * 自动判断常驻/一次性模式
   */
  private async executeSidecar(methodName: string, params: any): Promise<any> {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    logger.info(`执行 Sidecar 方法: ${this.id}.${methodName}`, {
      params,
      mode: this.isResident ? "常驻" : "一次性",
    });

    if (this.isResident) {
      return this.executeSidecarResident(methodName, params);
    } else {
      return this.executeSidecarOneshot(methodName, params);
    }
  }

  /**
   * 常驻模式：通过 JSON-RPC 发送命令并等待结果
   */
  private async executeSidecarResident(
    methodName: string,
    params: any
  ): Promise<any> {
    const resultJson = await invoke<string>("sidecar_send_command", {
      pluginId: this.manifest.id,
      method: methodName,
      params: params || {},
    });

    try {
      const response = JSON.parse(resultJson);
      const type = response.type;

      if (type === "error") {
        const errorMsg = response.data || "未知错误";
        throw new Error(errorMsg);
      }

      return response.data ?? response;
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.warn("常驻模式响应非 JSON 格式，直接返回原始字符串");
        return resultJson;
      }
      throw error;
    }
  }

  /**
   * 一次性模式：spawn 进程执行
   */
  private async executeSidecarOneshot(
    methodName: string,
    params: any
  ): Promise<any> {
    const executablePath = this.getExecutablePath();
    const settings = pluginConfigService.createPluginSettingsAPI(this.id);
    const args = this.manifest.sidecar?.args || [];

    const inputData = {
      method: methodName,
      params,
      settings: await settings.getAll(),
      environment: pluginEnvironmentService.get(),
    };

    const request: SidecarExecuteRequest = {
      plugin_id: this.manifest.id,
      install_path: this.installPath,
      executable_path: executablePath,
      args,
      input: JSON.stringify(inputData),
      dev_mode: this.devMode,
    };

    return new Promise((resolve, reject) => {
      let hasResult = false;

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
          logger.info(`方法执行成功: ${methodName}`, {
            result: data.data,
          });

          this.eventHandlers.delete("progress");
          this.eventHandlers.delete("result");
          this.eventHandlers.delete("error");

          resolve(data.data);
        } catch (error) {
          errorHandler.error(error, "解析结果数据失败", {
            context: { data: event.data },
          });
          reject(new Error(`解析结果失败: ${error}`));
        }
      };

      const customErrorHandler = (event: SidecarOutputEvent) => {
        if (hasResult) return;
        hasResult = true;

        errorHandler.error(new Error(event.data), "方法执行失败", {
          context: { methodName },
        });

        this.eventHandlers.delete("progress");
        this.eventHandlers.delete("result");
        this.eventHandlers.delete("error");

        reject(new Error(event.data));
      };

      this.eventHandlers.set("progress", progressHandler);
      this.eventHandlers.set("result", resultHandler);
      this.eventHandlers.set("error", customErrorHandler);

      invoke<string>("execute_sidecar", { request })
        .then((result) => {
          if (!hasResult) {
            try {
              const data = JSON.parse(result);
              if (data.type === "result") {
                hasResult = true;

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

            this.eventHandlers.delete("progress");
            this.eventHandlers.delete("result");
            this.eventHandlers.delete("error");

            errorHandler.error(error, "调用后端命令失败", {
              context: { methodName },
            });
            reject(error);
          }
        });
    });
  }

  /**
   * 监听常驻 Sidecar 主动推送事件
   *
   * @param eventName 事件名称（如 "status"、"forward_result"）
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  public onSidecarEvent(
    eventName: string,
    callback: (data: any) => void
  ): () => void {
    if (!this.isResident) {
      logger.warn(`插件 ${this.id} 不是常驻模式，onSidecarEvent 不会触发`);
      return () => {};
    }

    const existingCallbacks = this.residentEventCallbacks.get(eventName) || [];
    existingCallbacks.push(callback);
    this.residentEventCallbacks.set(eventName, existingCallbacks);

    return () => {
      const callbacks = this.residentEventCallbacks.get(eventName) || [];
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) {
        callbacks.splice(idx, 1);
        if (callbacks.length === 0) {
          this.residentEventCallbacks.delete(eventName);
        }
      }
    };
  }

  /**
   * 注册通用 Sidecar 事件监听器（所有主动推送事件都会触发）
   *
   * @param callback 回调函数 (eventName, data) => void
   * @returns 取消监听的函数
   */
  public onAnySidecarEvent(
    callback: (eventName: string, data: any) => void
  ): () => void {
    this.sidecarEventCallbacks.add(callback);

    return () => {
      this.sidecarEventCallbacks.delete(callback);
    };
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
      const hasMethod = target.manifest.methods?.some(
        (m) => m.name === propStr
      );
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
