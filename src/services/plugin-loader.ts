/**
 * 插件加载器
 * 
 * 负责从文件系统加载插件，支持开发模式和生产模式
 */

import { path } from '@tauri-apps/api';
import { readTextFile, readDir, exists } from '@tauri-apps/plugin-fs';
import type { PluginManifest, PluginLoadOptions, PluginLoadResult, JsPluginExport } from './plugin-types';
import { createJsPluginProxy } from './js-plugin-adapter';
import type { JsPluginAdapter } from './js-plugin-adapter';
import { createModuleLogger } from '@/utils/logger';
import { pluginConfigService } from './plugin-config.service';

const logger = createModuleLogger('services/plugin-loader');

/**
 * 插件加载器类
 */
export class PluginLoader {
  private devMode: boolean;
  private devPluginsDir: string;
  private prodPluginsDir: string | null = null;

  constructor(options: PluginLoadOptions) {
    this.devMode = options.devMode;
    this.devPluginsDir = options.devPluginsDir || '/plugins';
    this.prodPluginsDir = options.prodPluginsDir || null;

    logger.info('插件加载器初始化', {
      devMode: this.devMode,
      devPluginsDir: this.devPluginsDir,
      prodPluginsDir: this.prodPluginsDir,
    });
  }

  /**
   * 加载所有插件
   */
  async loadAll(): Promise<PluginLoadResult> {
    logger.info('开始加载所有插件');

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    // 开发模式：同时加载开发和生产插件
    if (this.devMode) {
      const devResult = await this.loadDevPlugins();
      const prodResult = await this.loadProdPlugins();
      
      result.plugins.push(...devResult.plugins, ...prodResult.plugins);
      result.failed.push(...devResult.failed, ...prodResult.failed);
      
      logger.info('开发模式：同时加载开发和生产插件', {
        devPlugins: devResult.plugins.length,
        prodPlugins: prodResult.plugins.length,
        total: result.plugins.length,
        failed: result.failed.length,
      });
    } else {
      // 生产模式：仅加载生产插件
      return await this.loadProdPlugins();
    }

    return result;
  }

  /**
   * 加载开发模式下的插件（从项目源码加载）
   */
  private async loadDevPlugins(): Promise<PluginLoadResult> {
    logger.info('开发模式：从源码目录加载插件', { dir: this.devPluginsDir });

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    try {
      // 使用 Vite 的 import.meta.glob 扫描插件目录
      const pluginModules = import.meta.glob<{
        default: JsPluginExport;
        manifest: PluginManifest;
      }>('/plugins/*/index.ts', { eager: false });

      const manifestModules = import.meta.glob<{
        default: PluginManifest;
      }>('/plugins/*/manifest.json', { eager: false });

      const pluginPaths = Object.keys(pluginModules);
      logger.info(`发现 ${pluginPaths.length} 个开发插件`, { paths: pluginPaths });

      // 加载每个插件
      for (const pluginPath of pluginPaths) {
        const pluginId = this.extractPluginIdFromPath(pluginPath);
        const manifestPath = pluginPath.replace('/index.ts', '/manifest.json');

        try {
          // 加载 manifest
          const manifestModule = await manifestModules[manifestPath]();
          const manifest = manifestModule.default;

          if (manifest.type !== 'javascript') {
            logger.warn(`开发模式下跳过非 JS 插件: ${pluginId}`);
            continue;
          }

          // 开发模式下的安装路径
          const devInstallPath = pluginPath.replace('/index.ts', '');

          // 创建插件代理（标记为开发模式）
          const proxy = createJsPluginProxy(manifest, devInstallPath, true);

          // 加载插件模块
          const pluginModule = await pluginModules[pluginPath]();
          const pluginExport = pluginModule.default;

          // 设置插件导出对象
          (proxy as unknown as JsPluginAdapter).setPluginExport(pluginExport);

          // 启用插件
          await proxy.enable();

          // 初始化插件配置
          try {
            await pluginConfigService.initPluginConfig(manifest);
          } catch (error) {
            logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
            // 配置初始化失败不应阻止插件加载
          }

          logger.info(`成功加载开发插件: ${manifest.id}`, {
            name: manifest.name,
            version: manifest.version,
            devMode: true,
          });

          // 将插件代理添加到结果列表
          result.plugins.push(proxy);
        } catch (error) {
          logger.error(`加载开发插件失败: ${pluginId}`, error);
          result.failed.push({
            id: pluginId,
            path: pluginPath,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      logger.error('加载开发插件过程中发生错误', error);
    }

    logger.info('开发插件加载完成', {
      loaded: result.plugins.length,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产模式下的插件（从安装目录加载）
   */
  private async loadProdPlugins(): Promise<PluginLoadResult> {
    logger.info('从安装目录加载插件', { dir: this.prodPluginsDir });

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    if (!this.prodPluginsDir) {
      logger.warn('未配置生产插件目录，跳过加载');
      return result;
    }

    try {
      // 检查插件目录是否存在
      const dirExists = await exists(this.prodPluginsDir);
      if (!dirExists) {
        logger.warn('插件目录不存在，跳过加载', { dir: this.prodPluginsDir });
        return result;
      }

      // 读取插件目录
      const entries = await readDir(this.prodPluginsDir);

      // 遍历每个插件目录
      for (const entry of entries) {
        if (!entry.isDirectory) continue;

        const pluginId = entry.name;
        const pluginPath = await path.join(this.prodPluginsDir, pluginId);

        try {
          // 读取 manifest.json
          const manifestPath = await path.join(pluginPath, 'manifest.json');
          const manifestExists = await exists(manifestPath);

          if (!manifestExists) {
            logger.warn(`插件目录缺少 manifest.json: ${pluginId}`);
            continue;
          }

          const manifestContent = await readTextFile(manifestPath);
          const manifest: PluginManifest = JSON.parse(manifestContent);

          // 目前只支持 JS 插件
          if (manifest.type !== 'javascript') {
            logger.info(`跳过 Sidecar 插件（暂未实现）: ${pluginId}`);
            continue;
          }

          // 加载 JS 插件
          const proxy = await this.loadProdJsPlugin(manifest, pluginPath);
          if (proxy) {
            result.plugins.push(proxy);
          }
        } catch (error) {
          logger.error(`加载生产插件失败: ${pluginId}`, error);
          result.failed.push({
            id: pluginId,
            path: pluginPath,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      logger.error('加载生产插件过程中发生错误', error);
    }

    logger.info('生产插件加载完成', {
      loaded: result.plugins.length,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产环境下的 JS 插件
   */
  private async loadProdJsPlugin(manifest: PluginManifest, pluginPath: string): Promise<import('./plugin-types').PluginProxy | null> {
    if (!manifest.main) {
      throw new Error('JS 插件缺少 main 字段');
    }

    try {
      // 读取插件 JS 文件内容
      const entryPath = await path.join(pluginPath, manifest.main);
      const jsContent = await readTextFile(entryPath);

      // 创建插件代理（标记为生产模式）
      const proxy = createJsPluginProxy(manifest, pluginPath, false);

      // 使用 Function 构造器在隔离作用域中执行插件代码
      // 注意：这不是完全的沙箱，仅用于简单的插件执行
      const pluginFactory = new Function('exports', jsContent + '\nreturn exports.default || exports;');
      const exports = {};
      const pluginExport = pluginFactory(exports);

      if (!pluginExport || typeof pluginExport !== 'object') {
        throw new Error('插件未正确导出对象');
      }

      // 设置插件导出对象
      (proxy as unknown as JsPluginAdapter).setPluginExport(pluginExport);

      // 启用插件
      await proxy.enable();

      // 初始化插件配置
      try {
        await pluginConfigService.initPluginConfig(manifest);
      } catch (error) {
        logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
        // 配置初始化失败不应阻止插件加载
      }

      logger.info(`成功加载生产插件: ${manifest.id}`, {
        name: manifest.name,
        version: manifest.version,
        devMode: false,
      });

      return proxy;
    } catch (error) {
      logger.error(`加载生产插件失败: ${manifest.id}`, error);
      throw error;
    }
  }

  /**
   * 从文件路径中提取插件 ID
   */
  private extractPluginIdFromPath(pluginPath: string): string {
    // 例如: /plugins/my-plugin/index.ts -> my-plugin
    const match = pluginPath.match(/\/plugins\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }

  /**
   * 卸载插件
   * @param pluginId 要卸载的插件 ID（可能包含 -dev 后缀）
   * @returns 卸载是否成功
   */
  async uninstall(pluginId: string): Promise<boolean> {
    logger.info(`开始卸载插件: ${pluginId}`);

    // 如果是开发模式插件（ID 以 -dev 结尾），不允许卸载
    if (pluginId.endsWith('-dev')) {
      logger.warn('开发模式插件无法卸载');
      throw new Error('开发模式插件无法卸载，请手动删除源码目录中的插件文件夹');
    }

    try {
      // 导入 Tauri API
      const { invoke } = await import('@tauri-apps/api/core');
      
      // 调用后端命令删除插件目录到回收站
      await invoke('uninstall_plugin', { pluginId });
      
      logger.info(`插件 ${pluginId} 已移入回收站`);
      return true;
    } catch (error) {
      logger.error(`卸载插件失败: ${pluginId}`, error);
      throw error;
    }
  }
}

/**
 * 创建插件加载器实例
 */
export async function createPluginLoader(): Promise<PluginLoader> {
  const devMode = import.meta.env.DEV;
  
  // 无论开发模式还是生产模式，都配置生产插件目录
  // 开发模式下也可能需要测试生产插件的加载
  const appDataDir = await path.appDataDir();
  const prodPluginsDir = await path.join(appDataDir, 'plugins');

  return new PluginLoader({
    devMode,
    devPluginsDir: '/plugins',
    prodPluginsDir,
  });
}