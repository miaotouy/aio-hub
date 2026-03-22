/**
 * JavaScript 插件适配器
 *
 * 将 JS 插件包装成符合 ToolRegistry 接口的代理对象
 */

import type { ServiceMetadata, ToolContext } from "./types";
import type { PluginProxy, PluginManifest, JsPluginExport } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";
import { pluginManager } from "./plugin-manager";

const logger = createModuleLogger("services/js-plugin-adapter");
const errorHandler = createModuleErrorHandler("services/js-plugin-adapter");

/**
 * JS 插件适配器类
 *
 * 将一个 JS 插件模块包装成 ToolRegistry 接口
 */
export class JsPluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly manifest: PluginManifest;
  public readonly installPath: string;
  public iconUrl?: string;
  public readonly devMode: boolean;
  public enabled: boolean = false;

  public pluginExport: JsPluginExport | null = null;

  constructor(manifest: PluginManifest, installPath: string, devMode: boolean = false) {
    this.manifest = manifest;
    this.installPath = installPath;
    // 开发模式下为 ID 添加后缀，避免与生产版本冲突
    this.id = devMode ? `${manifest.id}-dev` : manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;
    this.devMode = devMode;

    logger.debug(`创建 JS 插件适配器: ${this.id}`, { devMode, installPath });
  }

  /**
   * 启用插件 - 激活插件并设置状态
   */
  async enable(context: any): Promise<void> {
    if (this.enabled) {
      logger.warn(`插件 ${this.id} 已经启用`);
      return;
    }

    if (!context) {
      logger.error(`启用插件 ${this.id} 时未提供 context，这可能会导致插件初始化失败`);
    }

    logger.info(`启用 JS 插件: ${this.id}`);

    // 1. 调用 activate 钩子
    if (this.pluginExport && typeof this.pluginExport.activate === "function") {
      try {
        logger.info(`调用插件 ${this.id} 的 activate 钩子`);
        await this.pluginExport.activate(context);
      } catch (error) {
        errorHandler.error(error, `插件 ${this.id} 的 activate 钩子执行失败`);
        // 如果激活失败，我们依然标记为启用吗？通常不应该。
        // 但为了容错，目前仅记录错误。
      }
    }

    // 2. 更新状态
    this.enabled = true;
    pluginManager.updateRuntimeState(this.id, true);
  }

  /**
   * 禁用插件 - 停用插件并清理导出对象
   */
  async disable(): Promise<void> {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用 JS 插件: ${this.id}`);

    // 1. 调用 deactivate 钩子
    if (this.pluginExport && typeof this.pluginExport.deactivate === "function") {
      try {
        logger.info(`调用插件 ${this.id} 的 deactivate 钩子`);
        await this.pluginExport.deactivate();
      } catch (error) {
        errorHandler.error(error, `插件 ${this.id} 的 deactivate 钩子执行失败`);
      }
    }

    // 2. 清理状态
    // 注意：如果是开发模式，我们可能保留 pluginExport 以便热更新
    // 但为了确保“卸载完全”，我们还是清理它，由 loader 重新设置
    this.pluginExport = null;
    this.enabled = false;
    pluginManager.updateRuntimeState(this.id, false);
  }
  /**
   * 设置插件导出对象
   * @internal 由插件加载器调用
   */
  setPluginExport(pluginExport: JsPluginExport): void {
    this.pluginExport = pluginExport;
    logger.debug(`插件 ${this.id} 的导出对象已设置`);
  }

  /**
   * 初始化方法 (ToolRegistry 接口)
   */
  async initialize(): Promise<void> {
    logger.debug(`初始化插件: ${this.id}`);
    // JS 插件通常不需要特殊的初始化逻辑
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
    // 1. 优先使用插件导出的 getMetadata()
    if (this.pluginExport && typeof this.pluginExport.getMetadata === "function") {
      try {
        return this.pluginExport.getMetadata();
      } catch (error) {
        logger.warn(`调用插件 ${this.id} 的 getMetadata 失败，回退到 manifest`, { error });
      }
    }

    // 2. 其次使用 manifest 中定义的 methods
    if (this.manifest.methods && this.manifest.methods.length > 0) {
      // 合并 manifest 中定义的方法和导出对象中实际存在的方法
      const manifestMethods = this.manifest.methods;
      const metadata: ServiceMetadata = {
        methods: [...manifestMethods],
      };

      // 如果有导出对象，检查是否还有额外导出的方法未在 manifest 中定义
      if (this.pluginExport) {
        const existingMethodNames = new Set(manifestMethods.map((m) => m.name));
        const extraMethods = Object.keys(this.pluginExport)
          .filter(
            (key) =>
              typeof (this.pluginExport as any)[key] === "function" &&
              !existingMethodNames.has(key) &&
              key !== "activate" &&
              key !== "deactivate" &&
              key !== "getMetadata"
          )
          .map((key) => ({
            name: key,
            description: `插件导出的方法: ${key}`,
            parameters: [],
            returnType: "any",
          }));

        metadata.methods.push(...extraMethods);
      }

      return metadata;
    }

    // 3. 最后从导出对象动态生成（兜底）
    if (!this.pluginExport) {
      return { methods: [] };
    }

    const dynamicMethods = Object.keys(this.pluginExport)
      .filter(
        (key) =>
          typeof (this.pluginExport as any)[key] === "function" &&
          key !== "activate" &&
          key !== "deactivate" &&
          key !== "getMetadata"
      )
      .map((key) => ({
        name: key,
        description: `动态发现的方法: ${key}`,
        parameters: [],
        returnType: "any",
      }));

    return {
      methods: dynamicMethods,
    };
  }

  /**
   * 动态方法调用代理
   *
   * 使用 Proxy 来拦截所有方法调用,转发到插件的实际实现
   * @internal 此方法通过 Proxy 动态调用
   */
  public callPluginMethod(methodName: string, params: any, toolContext?: ToolContext): any {
    if (!this.enabled || !this.pluginExport) {
      const status = !this.enabled ? "已禁用" : "未正确加载";
      const err = new Error(`无法调用方法 ${methodName}: 插件 ${this.id} ${status}`);
      logger.warn(err.message);
      throw err;
    }

    const method = this.pluginExport[methodName];
    if (typeof method !== "function") {
      throw new Error(`插件 ${this.id} 不存在方法: ${methodName}`);
    }

    logger.debug(`调用插件方法: ${this.id}.${methodName}`, { params });

    try {
      // 这里的 params 应该是纯粹的业务参数
      // 插件应该在 activate 时保存自己的 context，而不是依赖这里注入
      return method(params, toolContext);
    } catch (error) {
      errorHandler.error(error, '插件方法调用失败', { context: { pluginId: this.id, methodName } });
      throw error;
    }
  }
}

/**
 * 创建插件代理
 *
 * 使用 Proxy 动态拦截方法调用，使得插件适配器可以响应任意方法
 *
 * @param manifest - 插件清单
 * @param devMode - 是否为开发模式插件
 * @returns 插件代理对象
 */
export function createJsPluginProxy(
  manifest: PluginManifest,
  installPath: string,
  devMode: boolean = false
): PluginProxy {
  const adapter = new JsPluginAdapter(manifest, installPath, devMode);

  // 使用 Proxy 拦截所有属性访问
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const propStr = String(prop);

      // 1. 如果是适配器自己的属性或方法，直接返回
      // 注意：由于 pluginExport 也是 public 的，所以会在这里直接返回
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // 2. 排除生命周期钩子和元数据方法
      if (propStr === 'activate' || propStr === 'deactivate' || propStr === 'getMetadata') {
        return undefined;
      }

      // 3. 检查是否为有效方法（manifest 声明 或 动态导出）
      const hasMethodInManifest = target.manifest.methods?.some((m) => m.name === propStr);
      const hasMethodInExport = target.pluginExport && typeof (target.pluginExport as any)[propStr] === 'function';

      if (hasMethodInManifest || hasMethodInExport) {
        // 返回一个函数，调用插件的实际方法
        return (params: any, toolContext?: ToolContext) => {
          return target.callPluginMethod(propStr, params, toolContext);
        };
      }

      return undefined;
    },
  }) as PluginProxy;
}
