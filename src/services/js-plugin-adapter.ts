/**
 * JavaScript 插件适配器
 *
 * 将 JS 插件包装成符合 ToolRegistry 接口的代理对象
 */

import type { ServiceMetadata } from "./types";
import type { PluginProxy, PluginManifest, JsPluginExport } from "./plugin-types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";

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
  public readonly devMode: boolean;
  public enabled: boolean = false;

  private pluginExport: JsPluginExport | null = null;

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
   * 启用插件 - 加载插件模块
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      logger.warn(`插件 ${this.id} 已经启用`);
      return;
    }

    logger.info(`启用 JS 插件: ${this.id}`);
    this.enabled = true;
    // 注意：activate 钩子在加载时调用，而不是启用时
  }

  /**
   * 禁用插件 - 卸载插件模块
   */
  async disable(): Promise<void> {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用 JS 插件: ${this.id}`);

    // 调用 deactivate 钩子
    if (this.pluginExport && typeof this.pluginExport.deactivate === "function") {
      try {
        logger.info(`调用插件 ${this.id} 的 deactivate 钩子`);
        await this.pluginExport.deactivate();
      } catch (error) {
        errorHandler.error(error, `插件 ${this.id} 的 deactivate 钩子执行失败`);
      }
    }

    this.pluginExport = null;
    this.enabled = false;
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
   // 优先使用 manifest 中定义的 methods，以支持旧版插件
   if (this.manifest.methods && this.manifest.methods.length > 0) {
     return {
       methods: this.manifest.methods,
     };
   }

   // 如果 manifest 中没有定义 methods，则从导出对象动态生成
   if (!this.pluginExport) {
     return { methods: [] };
   }

   const dynamicMethods = Object.keys(this.pluginExport)
     .filter(
       (key) =>
         typeof (this.pluginExport as any)[key] === "function" &&
         key !== "activate" &&
         key !== "deactivate"
     )
     .map((key) => ({
       name: key,
       description: `动态发现的方法: ${key}`, // 无法动态获取描述，提供一个默认值
       parameters: [], // 无法动态获取参数
       returnType: 'any', // 无法动态获取返回类型
     }));

   return {
     methods: dynamicMethods,
   };
  }

  /**
   * 动态方法调用代理
   *
   * 使用 Proxy 来拦截所有方法调用，转发到插件的实际实现
   * @internal 此方法通过 Proxy 动态调用
   */
  public callPluginMethod(methodName: string, params: any): any {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    if (!this.pluginExport) {
      throw new Error(`插件 ${this.id} 未正确加载`);
    }

    const method = this.pluginExport[methodName];
    if (typeof method !== "function") {
      throw new Error(`插件 ${this.id} 不存在方法: ${methodName}`);
    }

    logger.debug(`调用插件方法: ${this.id}.${methodName}`, { params });

    try {
      // 创建插件上下文，注入配置 API
      const context = {
        settings: pluginConfigService.createPluginSettingsAPI(this.manifest.id),
      };

      // 将 context 注入到参数中
      return method({ ...params, context });
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
      // 如果是适配器自己的属性或方法，直接返回
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // 否则，返回一个函数，该函数会调用插件的对应方法
      const propStr = String(prop);

      // 如果 manifest 中还定义了 methods，优先作为判断依据
      if (target.manifest.methods && target.manifest.methods.length > 0) {
        const hasMethod = target.manifest.methods.some((m) => m.name === propStr);
        if (!hasMethod) {
          // 如果 manifest.methods 存在但找不到方法，则认为方法不存在
          return undefined;
        }
      } else {
        // 如果 manifest.methods 不存在，则只要是导出对象的属性（且不是 activate/deactivate），就认为是可调用方法
        if (!(propStr in (target as any).pluginExport) || propStr === 'activate' || propStr === 'deactivate') {
          return undefined;
        }
      }

      // 返回一个函数，调用插件的实际方法
      return (params: any) => {
        return target.callPluginMethod(propStr, params);
      };
    },
  }) as PluginProxy;
}
