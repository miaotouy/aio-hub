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
 * Sidecar 插件适配器
 *
 * 将 Sidecar 插件包装成符合 ToolRegistry 接口的代理对象
 * 支持一次性模式和常驻模式（Resident Mode）
 */

import type { ServiceMetadata } from "./types";
import type { PluginProxy, PluginManifest } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";
import { pluginManager } from "./plugin-manager";
import { pluginEnvironmentService } from "./plugin-environment.service";
import { invoke } from "@/platform/native/core";
import { listen, type UnlistenFn } from "@/platform/native/events";
import { getCurrentPlatform } from "./plugin-loader";
import {
  createSidecarHostContext,
  requiresStrictPluginCompatibility,
} from "./plugin-api-version";

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
  generation_id?: string;
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
  private residentGeneration: string | null = null;
  private pendingResidentEvents: SidecarResidentEvent[] = [];
  /** 常驻模式自定义事件回调 */
  private residentEventCallbacks: Map<string, Array<(data: any) => void>> =
    new Map();
  /** 常驻模式通用事件回调（对应 onSidecarEvent） */
  private sidecarEventCallbacks: Set<(eventName: string, data: any) => void> =
    new Set();
  private residentRecoveryPromise: Promise<void> | null = null;

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

    // 解析插件安装目录作为工作目录
    const installPath = this.resolveInstallPath();

    try {
      // 先订阅，再启动；启动代次返回前的事件暂存后按代次投递。
      this.residentGeneration = null;
      this.pendingResidentEvents = [];
      this.residentEventUnlisten = await listen<SidecarResidentEvent>(
        "sidecar-resident-event",
        (event) => this.receiveResidentEvent(event.payload)
      );
      this.residentGeneration = null;
      this.residentGeneration = await invoke<string>("sidecar_spawn_resident", {
        pluginId: this.manifest.id,
        executablePath,
        args,
        installPath,
      });
      processSpawned = true;
      this.flushResidentEvents();

      // 如果声明了 startupMethod，自动执行启动初始化
      if (this.manifest.sidecar?.startupMethod) {
        const startupMethod = this.manifest.sidecar.startupMethod;
        const startupParams = this.manifest.sidecar.startupParams || {};

        logger.info(
          `执行常驻插件启动检查/初始化: ${this.id}.${startupMethod}`,
          {
            startupParams,
          }
        );

        try {
          const startupResult = await this.executeSidecarResident(
            startupMethod,
            this.buildStartupParams(startupParams),
            false
          );
          logger.info(`常驻插件启动检查/初始化完成: ${this.id}`, {
            result: startupResult,
          });
        } catch (error) {
          errorHandler.error(error, `常驻插件启动检查/初始化失败: ${this.id}`, {
            context: { startupMethod },
          });
          throw error;
        }
      }
    } catch (error) {
      logger.error(`常驻插件启动流程异常: ${this.id}`, error);

      this.residentEventUnlisten?.();
      this.residentEventUnlisten = null;
      this.residentGeneration = null;
      this.pendingResidentEvents = [];
      if (processSpawned) {
        logger.info(`启动流程失败，正在清理已启动的常驻进程: ${this.id}`);
        try {
          await invoke("sidecar_kill_resident", {
            pluginId: this.manifest.id,
          });
          this.residentGeneration = null;
        } catch (killError) {
          logger.warn(`清理常驻进程失败: ${this.id}`, { killError });
        }
      }

      throw error;
    }
  }

  private receiveResidentEvent(data: SidecarResidentEvent): void {
    if (data.plugin_id !== this.manifest.id) return;
    if (!this.residentGeneration) {
      if (this.pendingResidentEvents.length < 100)
        this.pendingResidentEvents.push(data);
      return;
    }
    if (data.generation_id && data.generation_id !== this.residentGeneration)
      return;
    logger.debug(`收到常驻 Sidecar 事件: ${data.event_type}`, {
      eventName: data.event_name,
      data: data.data,
    });
    if (data.event_type !== "event" || !data.event_name) return;
    let payload: unknown = data.data;
    try {
      const parsed = JSON.parse(data.data);
      payload =
        parsed && Object.prototype.hasOwnProperty.call(parsed, "data")
          ? parsed.data
          : parsed;
    } catch {
      /* A legacy sidecar may emit plain text. */
    }
    const callbacks = [...this.sidecarEventCallbacks].map(
      (callback) => () => callback(data.event_name!, payload)
    );
    callbacks.push(
      ...(this.residentEventCallbacks.get(data.event_name) ?? []).map(
        (callback) => () => callback(payload)
      )
    );
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        logger.warn("Sidecar 事件回调失败", {
          error,
          eventName: data.event_name,
        });
      }
    }
  }
  private flushResidentEvents(): void {
    for (const data of this.pendingResidentEvents.splice(0))
      this.receiveResidentEvent(data);
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
    // 先更新内存态，使并发中的超时恢复无法在禁用流程之后重新拉起进程。
    this.enabled = false;

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
      this.residentGeneration = null;
    }

    // 清空处理器
    this.pendingResidentEvents = [];
    this.residentEventCallbacks.clear();
    this.sidecarEventCallbacks.clear();

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

    const platform = getCurrentPlatform();
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
   * 解析插件安装目录的路径（用作 sidecar 进程的工作目录）
   */
  private resolveInstallPath(): string {
    const basePath = this.installPath;

    if (this.devMode) {
      // 开发模式：去掉可能的前导 /plugins/ 前缀
      return basePath.replace(/^\/plugins\//, "plugins/");
    } else {
      return basePath;
    }
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
    params: any,
    recoverOnTimeout: boolean = true
  ): Promise<any> {
    let resultJson: string;

    try {
      resultJson = await invoke<string>("sidecar_send_command", {
        pluginId: this.manifest.id,
        method: methodName,
        params: params || {},
      });
    } catch (error) {
      if (recoverOnTimeout && this.isResidentRecoverable(error)) {
        logger.warn(`常驻插件连接失效，正在恢复进程: ${this.id}`, {
          methodName,
        });
        await this.recoverResidentProcess();
      }
      throw error;
    }

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

  private isResidentRecoverable(error: unknown): boolean {
    return /命令执行超时|Sidecar 进程已退出|常驻进程未启动|当前窗口尚未启动/.test(
      String(error)
    );
  }

  private buildStartupParams(
    params: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      ...params,
      hostContext: createSidecarHostContext(),
    };
  }

  private async recoverResidentProcess(): Promise<void> {
    if (this.residentRecoveryPromise) {
      return this.residentRecoveryPromise;
    }

    this.residentRecoveryPromise = this.restartResidentProcess().finally(() => {
      this.residentRecoveryPromise = null;
    });
    return this.residentRecoveryPromise;
  }

  private async restartResidentProcess(): Promise<void> {
    try {
      await invoke("sidecar_kill_resident", {
        pluginId: this.manifest.id,
      });
    } catch (error) {
      logger.warn(`超时恢复时停止旧进程失败: ${this.id}`, { error });
    }

    if (!this.enabled) {
      logger.info(`插件已禁用，跳过常驻进程恢复: ${this.id}`);
      return;
    }

    this.residentGeneration = await invoke<string>("sidecar_spawn_resident", {
      pluginId: this.manifest.id,
      executablePath: this.getExecutablePath(),
      args: this.manifest.sidecar?.args || [],
      installPath: this.resolveInstallPath(),
    });

    this.flushResidentEvents();
    if (!this.enabled) {
      await invoke("sidecar_kill_resident", {
        pluginId: this.manifest.id,
      });
      logger.info(`插件在恢复期间被禁用，已停止新进程: ${this.id}`);
      return;
    }

    const startupMethod = this.manifest.sidecar?.startupMethod;
    if (startupMethod) {
      await this.executeSidecarResident(
        startupMethod,
        this.buildStartupParams(this.manifest.sidecar?.startupParams || {}),
        false
      );
    }

    logger.info(`常驻插件进程已恢复: ${this.id}`);
  }

  public async restartSidecar(): Promise<void> {
    if (!this.isResident) {
      throw new Error(`插件 ${this.id} 不是常驻 Sidecar`);
    }
    await this.recoverResidentProcess();
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
      ...(requiresStrictPluginCompatibility(this.manifest.host?.apiVersion)
        ? { hostContext: createSidecarHostContext() }
        : {}),
    };

    const request: SidecarExecuteRequest = {
      plugin_id: this.manifest.id,
      install_path: this.installPath,
      executable_path: executablePath,
      args,
      input: JSON.stringify(inputData),
      dev_mode: this.devMode,
    };

    const result = await invoke<string>("execute_sidecar", { request });
    let response: { type?: string; data?: unknown };
    try {
      response = JSON.parse(result);
    } catch {
      throw new Error("Sidecar 返回了无效的 JSON 结果");
    }
    if (response?.type === "error") {
      const detail =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      throw new Error(detail || "Sidecar 执行失败");
    }
    if (response?.type !== "result")
      throw new Error("Sidecar 响应缺少结果类型");
    return response.data;
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
