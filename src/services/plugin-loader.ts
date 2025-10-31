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
    
    if (!this.devMode && options.prodPluginsDir) {
      this.prodPluginsDir = options.prodPluginsDir;
    }

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

    if (this.devMode) {
      return await this.loadDevPlugins();
    } else {
      return await this.loadProdPlugins();
    }
  }

  /**
   * 加载开发模式下的插件（从项目源码加载）
   */
  private async loadDevPlugins(): Promise<PluginLoadResult> {
    logger.info('开发模式：从源码目录加载插件', { dir: this.devPluginsDir });

    const result: PluginLoadResult = {
      loaded: 0,
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

          // 创建插件代理
          const proxy = createJsPluginProxy(manifest);

          // 加载插件模块
          const pluginModule = await pluginModules[pluginPath]();
          const pluginExport = pluginModule.default;

          // 设置插件导出对象
          (proxy as JsPluginAdapter).setPluginExport(pluginExport);

          // 启用插件
          await proxy.enable();

          logger.info(`成功加载开发插件: ${manifest.id}`, {
            name: manifest.name,
            version: manifest.version,
          });

          result.loaded++;
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
      loaded: result.loaded,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产模式下的插件（从安装目录加载）
   */
  private async loadProdPlugins(): Promise<PluginLoadResult> {
    logger.info('生产模式：从安装目录加载插件', { dir: this.prodPluginsDir });

    const result: PluginLoadResult = {
      loaded: 0,
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
          await this.loadProdJsPlugin(manifest, pluginPath);

          result.loaded++;
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
      loaded: result.loaded,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产环境下的 JS 插件
   */
  private async loadProdJsPlugin(manifest: PluginManifest, pluginPath: string): Promise<void> {
    if (!manifest.main) {
      throw new Error('JS 插件缺少 main 字段');
    }

    // 构建插件入口文件路径
    const entryPath = await path.join(pluginPath, manifest.main);

    // 动态导入插件模块
    // 注意：这里需要使用完整的文件路径，但在生产环境中可能需要特殊处理
    // 因为 Vite 的 import() 在构建后有限制
    logger.warn('生产环境下的 JS 插件动态加载需要进一步实现', {
      entryPath,
      pluginId: manifest.id,
    });

    // TODO: 实现生产环境下的插件加载
    // 可能需要：
    // 1. 在构建时将插件打包为独立的 bundle
    // 2. 使用 <script> 标签动态加载
    // 3. 或者使用 Web Worker / iframe 沙箱

    // 创建插件代理（当实现加载逻辑后，需要设置 pluginExport 并启用）
    // const proxy = createJsPluginProxy(manifest);
    // (proxy as JsPluginAdapter).setPluginExport(pluginExport);
    // await proxy.enable();

    logger.info(`跳过生产插件加载（待实现）: ${manifest.id}`, {
      name: manifest.name,
      version: manifest.version,
    });
  }

  /**
   * 从文件路径中提取插件 ID
   */
  private extractPluginIdFromPath(pluginPath: string): string {
    // 例如: /plugins/my-plugin/index.ts -> my-plugin
    const match = pluginPath.match(/\/plugins\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }
}

/**
 * 创建插件加载器实例
 */
export async function createPluginLoader(): Promise<PluginLoader> {
  const devMode = import.meta.env.DEV;
  
  let prodPluginsDir: string | undefined;
  if (!devMode) {
    // 生产模式下，插件安装在 appDataDir/plugins/
    const appDataDir = await path.appDataDir();
    prodPluginsDir = await path.join(appDataDir, 'plugins');
  }

  return new PluginLoader({
    devMode,
    devPluginsDir: '/plugins',
    prodPluginsDir,
  });
}