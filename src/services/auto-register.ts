import { serviceRegistry } from "./registry";
import type { ToolService } from "./types";
import { pluginManager } from "./plugin-manager";
import { createModuleLogger } from "@/utils/logger";
import { useToolsStore } from "@/stores/tools";

const logger = createModuleLogger("services/auto-register");

// 定义模块导出的类型，期望是一个可以 new 的类
type ServiceModule = {
  default: new () => ToolService;
};

/**
 * 自动发现并注册所有工具服务
 *
 * 此函数会扫描 src/tools 目录下所有以 .registry.ts 结尾的文件，
 * 动态导入它们，实例化默认导出的服务类，并注册到服务注册表中。
 *
 * 约定：
 * - 工具注册表文件必须以 .registry.ts 结尾
 * - 文件必须默认导出一个实现了 ToolService 接口的类
 *
 * @returns Promise，在所有服务注册完成后 resolve
 */
export async function autoRegisterServices(): Promise<void> {
  logger.info("开始自动扫描和注册服务");

  try {
    // 使用 Vite 的 import.meta.glob 匹配 src/tools/ 目录下所有以 .registry.ts 结尾的文件
    const serviceModules = import.meta.glob<ServiceModule>("../tools/**/*.registry.ts");

    const modulePaths = Object.keys(serviceModules);
    logger.info(`发现 ${modulePaths.length} 个服务模块文件`, { paths: modulePaths });

    if (modulePaths.length === 0) {
      logger.debug("未发现任何工具注册表模块，请确保文件以 .registry.ts 结尾");
      return;
    }

    const instances: ToolService[] = [];
    const failedModules: Array<{ path: string; error: any }> = [];

    // 动态导入并实例化所有服务
    for (const path in serviceModules) {
      try {
        // logger.debug(`正在加载服务模块: ${path}`);
        const module = await serviceModules[path]();
        const ServiceClass = module.default;

        if (!ServiceClass) {
          throw new Error("模块未导出默认类");
        }

        if (typeof ServiceClass !== "function") {
          throw new Error("默认导出不是一个可实例化的类");
        }

        const instance = new ServiceClass();

        // 验证实例是否实现了 ToolService 接口
        if (!instance.id) {
          throw new Error("服务实例缺少必需的 id 属性");
        }

        instances.push(instance);
      } catch (error) {
        logger.error(`加载服务模块失败: ${path}`, error);
        failedModules.push({ path, error });
      }
    }

    // 批量注册所有成功加载的服务
    if (instances.length > 0) {
      await serviceRegistry.register(...instances);
    }

    // 输出服务注册摘要（合并成功和失败）
    logger.info("服务自动注册完成", {
      总计: modulePaths.length,
      成功: instances.length,
      失败: failedModules.length,
      成功列表: instances.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
      })),
      ...(failedModules.length > 0 && {
        失败列表: failedModules.map((m) => ({
          路径: m.path,
          错误: m.error?.message || String(m.error),
        })),
      }),
    });

    // 加载插件
    logger.info("开始加载插件");
    try {
      await pluginManager.initialize();
      await pluginManager.loadAllPlugins();

      const loadedPlugins = pluginManager.getInstalledPlugins();
      logger.info(`已加载 ${loadedPlugins.length} 个插件`);
    } catch (error) {
      logger.error("插件加载过程中发生错误", error);
      // 插件加载失败不应阻止应用启动
    }

    // 所有工具和服务加载完成后，标记 tools store 为就绪状态
    // 这对于分离窗口正确加载插件至关重要
    const toolsStore = useToolsStore();
    toolsStore.initializeOrder(); // 初始化工具顺序
    toolsStore.setReady();
    logger.info("Tools store 已标记为就绪状态");
  } catch (error) {
    logger.error("自动注册服务过程中发生严重错误", error);
    throw error;
  }
}
