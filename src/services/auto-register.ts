import { serviceRegistry } from './registry';
import type { ToolService } from './types';
import { createPluginLoader } from './plugin-loader';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/auto-register');

// 定义模块导出的类型，期望是一个可以 new 的类
type ServiceModule = {
  default: new () => ToolService;
};

/**
 * 自动发现并注册所有工具服务
 * 
 * 此函数会扫描 src/tools 目录下所有以 .service.ts 结尾的文件，
 * 动态导入它们，实例化默认导出的服务类，并注册到服务注册表中。
 * 
 * 约定：
 * - 服务文件必须以 .service.ts 结尾
 * - 服务文件必须默认导出一个实现了 ToolService 接口的类
 * 
 * @returns Promise，在所有服务注册完成后 resolve
 */
export async function autoRegisterServices(): Promise<void> {
  logger.info('开始自动扫描和注册服务');

  try {
    // 使用 Vite 的 import.meta.glob 匹配 src/tools/ 目录下所有以 .service.ts 结尾的文件
    const serviceModules = import.meta.glob<ServiceModule>('../tools/**/*.service.ts');

    const modulePaths = Object.keys(serviceModules);
    logger.info(`发现 ${modulePaths.length} 个服务模块文件`, { paths: modulePaths });

    if (modulePaths.length === 0) {
      logger.warn('未发现任何服务模块，请确保服务文件以 .service.ts 结尾');
      return;
    }

    const instances: ToolService[] = [];
    const failedModules: Array<{ path: string; error: any }> = [];

    // 动态导入并实例化所有服务
    for (const path in serviceModules) {
      try {
        logger.debug(`正在加载服务模块: ${path}`);
        const module = await serviceModules[path]();
        const ServiceClass = module.default;

        if (!ServiceClass) {
          throw new Error('模块未导出默认类');
        }

        if (typeof ServiceClass !== 'function') {
          throw new Error('默认导出不是一个可实例化的类');
        }

        const instance = new ServiceClass();

        // 验证实例是否实现了 ToolService 接口
        if (!instance.id) {
          throw new Error('服务实例缺少必需的 id 属性');
        }

        instances.push(instance);
        logger.debug(`成功加载服务: ${instance.id}`, {
          path,
          name: instance.name,
          description: instance.description
        });
      } catch (error) {
        logger.error(`加载服务模块失败: ${path}`, error);
        failedModules.push({ path, error });
      }
    }

    // 批量注册所有成功加载的服务
    if (instances.length > 0) {
      await serviceRegistry.register(...instances);
      logger.info(`自动注册完成，成功注册 ${instances.length} 个服务`);
    }

    // 报告失败的模块
    if (failedModules.length > 0) {
      logger.warn(`有 ${failedModules.length} 个服务模块加载失败`, {
        failed: failedModules.map(m => m.path)
      });
    }

    // 加载插件
    logger.info('开始加载插件');
    try {
      const pluginLoader = await createPluginLoader();
      const pluginResult = await pluginLoader.loadAll();

      logger.info('插件加载完成', {
        loaded: pluginResult.loaded,
        failed: pluginResult.failed.length,
      });

      if (pluginResult.failed.length > 0) {
        logger.warn('部分插件加载失败', {
          failed: pluginResult.failed.map(f => ({
            id: f.id,
            error: f.error.message,
          })),
        });
      }
    } catch (error) {
      logger.error('插件加载过程中发生错误', error);
      // 插件加载失败不应阻止应用启动
    }

    // 输出注册摘要
    const registeredServices = serviceRegistry.getAllServices();
    logger.info('服务注册摘要', {
      总数: registeredServices.length,
      服务列表: registeredServices.map(s => ({
        id: s.id,
        name: s.name || '(未命名)',
        description: s.description || '(无描述)'
      }))
    });

  } catch (error) {
    logger.error('自动注册服务过程中发生严重错误', error);
    throw error;
  }
}