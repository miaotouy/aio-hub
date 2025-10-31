/**
 * JavaScript 插件适配器
 * 
 * 将 JS 插件包装成符合 ToolService 接口的代理对象
 */

import type { ServiceMetadata } from './types';
import type { PluginProxy, PluginManifest, JsPluginExport } from './plugin-types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/js-plugin-adapter');

/**
 * JS 插件适配器类
 * 
 * 将一个 JS 插件模块包装成 ToolService 接口
 */
export class JsPluginAdapter implements PluginProxy {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly manifest: PluginManifest;
  public enabled: boolean = false;

  private pluginExport: JsPluginExport | null = null;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;
    this.id = manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;

    logger.debug(`创建 JS 插件适配器: ${this.id}`);
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
  }

  /**
   * 禁用插件 - 卸载插件模块
   */
  disable(): void {
    if (!this.enabled) {
      logger.warn(`插件 ${this.id} 已经禁用`);
      return;
    }

    logger.info(`禁用 JS 插件: ${this.id}`);
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
   * 初始化方法 (ToolService 接口)
   */
  async initialize(): Promise<void> {
    logger.debug(`初始化插件: ${this.id}`);
    // JS 插件通常不需要特殊的初始化逻辑
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
   * 动态方法调用代理
   *
   * 使用 Proxy 来拦截所有方法调用，转发到插件的实际实现
   * @internal 此方法通过 Proxy 动态调用，TypeScript 无法检测到使用
   */
  // @ts-expect-error - 此方法通过 Proxy 动态调用
  private callPluginMethod(methodName: string, params: any): any {
    if (!this.enabled) {
      throw new Error(`插件 ${this.id} 未启用`);
    }

    if (!this.pluginExport) {
      throw new Error(`插件 ${this.id} 未正确加载`);
    }

    const method = this.pluginExport[methodName];
    if (typeof method !== 'function') {
      throw new Error(`插件 ${this.id} 不存在方法: ${methodName}`);
    }

    logger.debug(`调用插件方法: ${this.id}.${methodName}`, { params });

    try {
      return method(params);
    } catch (error) {
      logger.error(`插件方法调用失败: ${this.id}.${methodName}`, error);
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
 * @returns 插件代理对象
 */
export function createJsPluginProxy(manifest: PluginManifest): PluginProxy {
  const adapter = new JsPluginAdapter(manifest);

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
      const hasMethod = target.manifest.methods.some(m => m.name === propStr);
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