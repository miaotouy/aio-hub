import type { RouteRecordRaw } from "vue-router";
import type { ToolRegistry } from "@/types/tool";
import { createModuleLogger } from "./logger";

const logger = createModuleLogger("utils/toolManager");

/**
 * 工具管理器
 * 负责内置工具的扫描注册以及未来插件化工具的动态接入
 */
class ToolManager {
  private static instance: ToolManager;
  private tools: Map<string, ToolRegistry> = new Map();

  private constructor() {
    this.scanBuiltinTools();
  }

  public static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  /**
   * 扫描内置工具目录
   */
  private scanBuiltinTools() {
    try {
      // 扫描所有 tools 目录下的 registry.ts
      const toolModules = import.meta.glob("../tools/*/registry.ts", { eager: true });
      
      Object.entries(toolModules).forEach(([path, mod]: [string, any]) => {
        const registry = mod.default as ToolRegistry;
        if (registry && registry.id) {
          this.registerTool(registry);
        } else {
          logger.warn(`工具注册失败: 路径 ${path} 未导出有效的 registry 对象`);
        }
      });
      
      logger.info(`已扫描并注册 ${this.tools.size} 个内置工具`);
    } catch (error) {
      logger.error("扫描内置工具时发生错误", error as Error);
    }
  }

  /**
   * 手动注册工具 (可用于插件系统)
   */
  public registerTool(registry: ToolRegistry) {
    if (this.tools.has(registry.id)) {
      logger.warn(`工具 ID 冲突: ${registry.id}, 将覆盖旧配置`);
    }
    this.tools.set(registry.id, registry);
  }

  /**
   * 获取所有已注册的工具
   */
  public getRegisteredTools(): ToolRegistry[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有工具的路由配置
   */
  public getToolRoutes(): RouteRecordRaw[] {
    return Array.from(this.tools.values())
      .map((tool) => tool.route)
      .filter((route): route is RouteRecordRaw => !!route);
  }

  /**
   * 根据 ID 获取工具
   */
  public getToolById(id: string): ToolRegistry | undefined {
    return this.tools.get(id);
  }
}

export const toolManager = ToolManager.getInstance();