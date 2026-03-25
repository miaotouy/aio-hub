import type { ToolRegistry, ToolRegistryFactory, ToolRegistryItem } from "./types";
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
  private factories = new Map<string, ToolRegistryFactory>();
  private factoryToolIds = new Map<string, string[]>(); // factoryId -> toolIds[]
  private initialized = false;
  private changeListeners: (() => void)[] = [];

  /**
   * 订阅注册表变更
   */
  public subscribe(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.changeListeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        logger.error("Error in registry change listener", e);
      }
    });
  }

  /**
   * 注册一个或多个工具项（可以是 ToolRegistry 实例或 ToolRegistryFactory）。
   * @param items 要注册的工具或工厂。
   */
  public async register(...items: ToolRegistryItem[]): Promise<void> {
    logger.debug(`开始处理 ${items.length} 个注册项`);

    for (const item of items) {
      if (this.isFactory(item)) {
        await this.registerFactory(item);
      } else {
        await this.registerSingle(item);
      }
    }

    this.initialized = true;
    logger.debug("工具注册表处理完成", {
      totalTools: this.registries.size,
    });
    this.notifyListeners();
  }

  private isFactory(item: ToolRegistryItem): item is ToolRegistryFactory {
    return "factoryId" in item && typeof (item as any).createRegistries === "function";
  }

  private async registerSingle(tool: ToolRegistry): Promise<void> {
    try {
      if (this.registries.has(tool.id)) {
        // 如果已经初始化过了（热重载场景），我们允许覆盖，但输出警告
        if (this.initialized) {
          logger.warn(`工具 "${tool.id}" 已被注册，热重载覆盖`);
        } else {
          // 初始加载阶段发现重复 ID，抛出异常以防静默覆盖
          throw new Error(`工具 ID 冲突: "${tool.id}" 已经被注册。请确保工具 ID 唯一。`);
        }
      }

      if (tool.initialize) {
        await tool.initialize();
        logger.debug(`工具 "${tool.id}" 初始化完成`);
      }

      this.registries.set(tool.id, tool);
      logger.debug(`工具 "${tool.id}" 注册成功`);
    } catch (error) {
      errorHandler.error(error, "工具注册失败", { context: { toolId: tool.id } });
      throw error;
    }
  }

  private async registerFactory(factory: ToolRegistryFactory): Promise<void> {
    const factoryId = factory.factoryId;
    logger.debug(`开始通过工厂注册工具: ${factoryId}`);

    try {
      const registries = await factory.createRegistries();
      const toolIds: string[] = [];

      for (const registry of registries) {
        await this.registerSingle(registry);
        toolIds.push(registry.id);
      }

      this.factories.set(factoryId, factory);
      this.factoryToolIds.set(factoryId, toolIds);
      logger.info(`工厂 "${factoryId}" 注册完成，生成了 ${registries.length} 个工具`);
    } catch (error) {
      errorHandler.error(error, "工厂注册失败", { context: { factoryId } });
      throw error;
    }
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
      // 如果工具已经不存在，可能是被并发注销了，静默返回即可
      logger.debug(`尝试注销不存在的工具: ${id} (可能已由工厂注销)`);
      return false;
    }

    try {
      // 如果工具有清理方法，先执行清理
      if (tool.dispose) {
        await tool.dispose();
        logger.debug(`工具 "${id}" 已清理`);
      }

      this.registries.delete(id);

      // 如果这个 ID 属于某个工厂，也需要从 factoryToolIds 中移除
      // 注意：如果是从 unregisterFactory 调用的，factoryToolIds 会在 unregisterFactory 结尾统一处理
      // 这里的逻辑主要针对手动调用 unregister(id) 的场景
      for (const [factoryId, ids] of this.factoryToolIds.entries()) {
        const index = ids.indexOf(id);
        if (index !== -1) {
          ids.splice(index, 1);
          if (ids.length === 0) {
            this.factoryToolIds.delete(factoryId);
            this.factories.delete(factoryId);
          }
          break;
        }
      }

      logger.info(`工具 "${id}" 已注销`);
      this.notifyListeners();
      return true;
    } catch (error) {
      errorHandler.error(error, "注销工具时出错", { context: { toolId: id } });
      throw error;
    }
  }

  /**
   * 检查工厂是否已注册
   */
  public hasFactory(factoryId: string): boolean {
    return this.factories.has(factoryId);
  }

  /**
   * 注销工厂及其产生的所有工具
   * @param factoryId 工厂 ID
   */
  public async unregisterFactory(factoryId: string): Promise<boolean> {
    const toolIds = this.factoryToolIds.get(factoryId) || [];

    // 如果工厂根本不存在
    if (!this.factories.has(factoryId)) {
      logger.debug(`尝试注销不存在的工厂: ${factoryId}`);
      return false;
    }

    logger.info(`开始注销工厂 "${factoryId}" 及其 ${toolIds.length} 个工具`);

    // 必须创建一个副本，因为 unregister 会修改原数组
    const idsToUnregister = [...toolIds];

    // 先清理 factoryToolIds 状态，防止 unregister 内部重复处理
    this.factoryToolIds.delete(factoryId);
    this.factories.delete(factoryId);

    for (const id of idsToUnregister) {
      await this.unregister(id);
    }
    return true;
  }

  /**
   * 清理所有工具并重置注册表
   */
  public async dispose(): Promise<void> {
    logger.info("开始清理所有工具");

    // 1. 清理所有工具实例
    for (const [id, tool] of this.registries.entries()) {
      try {
        if (tool.dispose) {
          await tool.dispose();
          logger.debug(`工具 "${id}" 已清理`);
        }
      } catch (error) {
        errorHandler.error(error, "清理工具时出错", { context: { toolId: id } });
      }
    }

    // 2. 清理所有工厂（如果工厂有 dispose 逻辑）
    for (const [id, factory] of this.factories.entries()) {
      try {
        if ((factory as any).dispose) {
          await (factory as any).dispose();
          logger.debug(`工厂 "${id}" 已清理`);
        }
      } catch (error) {
        errorHandler.error(error, "清理工厂时出错", { context: { factoryId: id } });
      }
    }

    this.registries.clear();
    this.factories.clear();
    this.factoryToolIds.clear();
    this.initialized = false;
    logger.info("所有工具已清理完成");
  }
}

// 导出单例实例
export const toolRegistryManager = new ToolRegistryManager();
