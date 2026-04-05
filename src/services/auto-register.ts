import { toolRegistryManager } from "./registry";
import type { ToolRegistryItem } from "./types";
import { pluginManager } from "./plugin-manager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useToolsStore } from "@/stores/tools";

const logger = createModuleLogger("services/auto-register");
const errorHandler = createModuleErrorHandler("services/auto-register");

import type { ToolConfig } from "./types";

// 定义模块导出的类型，支持单例类、数组或工厂
type ServiceModule = {
  default?: any; // 可以是类、数组或工厂实例
  toolConfig?: ToolConfig;
};

// 检查是否为分离窗口
const isDetached = () => {
  return (
    window.location.pathname.startsWith("/detached-window/") ||
    window.location.pathname.startsWith("/detached-component/")
  );
};

/**
 * 自动发现并注册所有工具
 *
 * 此函数会扫描 src/tools 目录下所有以 .registry.ts 结尾的文件，
 * 动态导入它们，实例化默认导出的注册类，并注册到工具注册表中。
 *
 * 优化：支持分阶段加载。在分离窗口模式下，可优先加载指定工具。
 *
 * @param priorityToolId - 可选的优先级工具 ID。如果提供，将首先加载该工具。
 * @returns Promise，返回一个函数 `loadRemaining`，调用该函数可继续异步加载剩余工具和插件。
 */
export async function autoRegisterServices(priorityToolId?: string): Promise<() => Promise<void>> {
  logger.info("开始自动扫描和注册服务", { priorityToolId });

  try {
    // 使用 Vite 的 import.meta.glob 匹配 src/tools/ 目录下所有以 .registry.ts 结尾的文件
    const serviceModules = import.meta.glob<ServiceModule>("../tools/**/*.registry.ts");

    const modulePaths = Object.keys(serviceModules);
    logger.info(`发现 ${modulePaths.length} 个服务模块文件`, { paths: modulePaths });

    const toolsStore = useToolsStore();
    const remainingPaths: string[] = [...modulePaths];
    const failedModules: Array<{ path: string; error: any }> = [];

    /**
     * 加载并注册单个工具模块
     */
    async function loadAndRegisterModule(path: string, isRemainingPhase = false) {
      // 在分离窗口的 loadRemaining 阶段，先检查 runMode
      if (isRemainingPhase && isDetached()) {
        const module = await serviceModules[path]();
        const runMode = module.toolConfig?.runMode || (module.default as any)?.runMode || "main-only";

        if (runMode === "main-only") {
          logger.debug(`跳过主窗口专用工具: ${path}`);
          return;
        }
      }

      const module = await serviceModules[path]();
      const registerItems: ToolRegistryItem[] = [];

      // 1. 处理 UI 工具配置 (ToolConfig)
      if (module.toolConfig) {
        toolsStore.addTool(module.toolConfig);
      }

      // 2. 处理服务注册 (ToolRegistryItem)
      const exported = module.default;
      if (exported) {
        if (Array.isArray(exported)) {
          for (const item of exported) {
            if (typeof item === "function") {
              registerItems.push(new (item as any)());
            } else {
              registerItems.push(item);
            }
          }
        } else if (typeof exported === "function") {
          const instance = new (exported as any)();
          registerItems.push(instance);
        } else if (typeof exported === "object") {
          registerItems.push(exported);
        }
      }

      // 立即注册该模块的工具项
      if (registerItems.length > 0) {
        await toolRegistryManager.register(...registerItems);
      }
    }

    // 如果有优先级工具，先加载它
    if (priorityToolId) {
      const priorityPath = modulePaths.find(
        (p) => p.includes(`/${priorityToolId}/`) || p.endsWith(`${priorityToolId}.registry.ts`),
      );

      if (priorityPath) {
        logger.info(`正在优先加载工具: ${priorityToolId}`, { path: priorityPath });
        try {
          await loadAndRegisterModule(priorityPath);
          // 从剩余路径中移除已加载的优先级路径
          const index = remainingPaths.indexOf(priorityPath);
          if (index !== -1) remainingPaths.splice(index, 1);
        } catch (error) {
          errorHandler.error(error, "优先加载工具模块失败", { context: { path: priorityPath } });
          failedModules.push({ path: priorityPath, error });
        }
      }
    }

    /**
     * 继续加载剩余工具和插件的函数
     */
    const loadRemaining = async () => {
      logger.info("开始加载剩余工具和插件...");
      const startTime = Date.now();

      // 1. 加载剩余工具
      for (const path of remainingPaths) {
        try {
          await loadAndRegisterModule(path, true);
        } catch (error) {
          errorHandler.error(error, "加载工具模块失败", { context: { path } });
          failedModules.push({ path, error });
        }
      }

      // 2. 加载插件
      try {
        await pluginManager.initialize();
        await pluginManager.loadAllPlugins();
        const loadedPlugins = pluginManager.getInstalledPlugins();
        logger.info(`已加载 ${loadedPlugins.length} 个插件`);
      } catch (error) {
        errorHandler.error(error, "插件加载过程中发生错误");
      }

      // 3. 完成初始化
      toolsStore.initializeOrder();
      toolsStore.setReady();

      const totalTools = toolRegistryManager.getAllToolIds().length;
      logger.info("所有服务和插件加载完成", {
        耗时: `${Date.now() - startTime}ms`,
        总计工具: totalTools,
        失败: failedModules.length,
      });
    };

    // 如果没有优先级工具，或者只有优先级工具（这不太可能），则立即完成第一阶段
    if (!priorityToolId || remainingPaths.length === 0) {
      // 在这种情况下，我们可能希望在返回前完成所有加载，
      // 或者返回一个立即执行剩余加载的函数。
      // 为了保持一致性，如果不是分离窗口（没有 priorityToolId），我们在这里完成所有加载。
      if (!priorityToolId) {
        await loadRemaining();
        return async () => {}; // 返回空函数
      }
    }

    return loadRemaining;
  } catch (error) {
    errorHandler.error(error, "自动注册服务过程中发生严重错误");
    throw error;
  }
}
