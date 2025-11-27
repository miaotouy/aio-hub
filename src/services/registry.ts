import type { ToolRegistry } from "./types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("services/registry");
const errorHandler = createModuleErrorHandler("services/registry");

/**
 * 工具注册管理器
 *
 * 管理所有工具的生命周期、注册、获取和注销。
 * 替代旧的 ServiceRegistry，明确其作为“注册表”而非“业务服务”的职责。
 */
class ToolRegistryManager {
  private registries = new Map<string, ToolRegistry>();
  private initialized = false;

  /**
   * 注册一个或多个工具。
   * @param tools 要注册的工具实例。
   */
  public async register(...tools: ToolRegistry[]): Promise<void> {
    logger.debug(`开始注册 ${tools.length} 个工具`);

    for (const tool of tools) {
      try {
        if (this.registries.has(tool.id)) {
          logger.warn(`工具 "${tool.id}" 已被注册，将进行覆盖`);
        }

        // 如果工具有初始化方法，先执行初始化
        if (tool.initialize) {
          await tool.initialize();
          logger.debug(`工具 "${tool.id}" 初始化完成`);
        }

        this.registries.set(tool.id, tool);
        logger.debug(`工具 "${tool.id}" 注册成功`);
      } catch (error) {
        errorHandler.error(error, '工具注册失败', { context: { toolId: tool.id } });
        throw error;
      }
    }

    this.initialized = true;
    logger.debug("工具注册表处理完成", {
      totalTools: this.registries.size,
    });
  }

  /**
   * 根据 ID 获取一个已注册的工具。
   * @param id 工具的唯一标识符。
   * @returns 工具的实例。
   * @throws 如果工具未注册，则抛出错误。
   */
  public getRegistry<T extends ToolRegistry>(id: string): T {
    const tool = this.registries.get(id);
    if (!tool) {
      const availableTools = Array.from(this.registries.keys()).join(", ");
      throw new Error(`工具 "${id}" 尚未注册。可用的工具: ${availableTools || "无"}`);
    }
    return tool as T;
  }
  
  /**
   * 检查工具是否已注册
   * @param id 工具的唯一标识符
   * @returns 如果工具已注册则返回 true
   */
  public hasTool(id: string): boolean {
    return this.registries.has(id);
  }

  /**
   * 获取所有已注册的工具。
   */
  public getAllTools(): ToolRegistry[] {
    return Array.from(this.registries.values());
  }

  /**
   * 获取所有已注册的工具 ID。
   */
  public getAllToolIds(): string[] {
    return Array.from(this.registries.keys());
  }

  /**
   * 检查注册表是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 注销单个工具
   * @param id 要注销的工具 ID
   * @returns 如果工具存在并成功注销则返回 true
   */
  public async unregister(id: string): Promise<boolean> {
    const tool = this.registries.get(id);
    if (!tool) {
      logger.warn(`尝试注销不存在的工具: ${id}`);
      return false;
    }

    try {
      // 如果工具有清理方法，先执行清理
      if (tool.dispose) {
        await tool.dispose();
        logger.debug(`工具 "${id}" 已清理`);
      }

      this.registries.delete(id);
      logger.info(`工具 "${id}" 已注销`);
      return true;
    } catch (error) {
      errorHandler.error(error, '注销工具时出错', { context: { toolId: id } });
      throw error;
    }
  }

  /**
   * 清理所有工具并重置注册表
   */
  public async dispose(): Promise<void> {
    logger.info("开始清理所有工具");

    for (const [id, tool] of this.registries.entries()) {
      try {
        if (tool.dispose) {
          tool.dispose();
          logger.debug(`工具 "${id}" 已清理`);
        }
      } catch (error) {
        errorHandler.error(error, '清理工具时出错', { context: { toolId: id } });
      }
    }

    this.registries.clear();
    this.initialized = false;
    logger.info("所有工具已清理完成");
  }
}

// 导出单例实例
export const toolRegistryManager = new ToolRegistryManager();
