import type { ToolService } from './types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('services/registry');

/**
 * 服务注册表
 * 
 * 使用服务定位器（Service Locator）模式来管理所有工具服务的生命周期。
 * 提供统一的服务注册、获取和管理能力。
 */
class ServiceRegistry {
  private services = new Map<string, ToolService>();
  private initialized = false;

  /**
   * 注册一个或多个服务实例。
   * @param serviceInstances 要注册的服务实例。
   */
  public async register(...serviceInstances: ToolService[]): Promise<void> {
    logger.info(`开始注册 ${serviceInstances.length} 个服务`);

    for (const instance of serviceInstances) {
      try {
        if (this.services.has(instance.id)) {
          logger.warn(`服务 "${instance.id}" 已被注册，将进行覆盖`);
        }

        // 如果服务有初始化方法，先执行初始化
        if (instance.initialize) {
          await instance.initialize();
          logger.debug(`服务 "${instance.id}" 初始化完成`);
        }

        this.services.set(instance.id, instance);
        logger.info(`服务 "${instance.id}" 注册成功`, {
          name: instance.name,
          description: instance.description
        });
      } catch (error) {
        logger.error(`服务 "${instance.id}" 注册失败`, error);
        throw error;
      }
    }

    this.initialized = true;
    logger.info('所有服务注册完成', {
      totalServices: this.services.size,
      serviceIds: Array.from(this.services.keys())
    });
  }

  /**
   * 根据 ID 获取一个已注册的服务。
   * @param id 服务的唯一标识符。
   * @returns 服务的实例。
   * @throws 如果服务未注册，则抛出错误。
   */
  public getService<T extends ToolService>(id: string): T {
    const service = this.services.get(id);
    if (!service) {
      const availableServices = Array.from(this.services.keys()).join(', ');
      throw new Error(
        `服务 "${id}" 尚未注册。可用的服务: ${availableServices || '无'}`
      );
    }
    return service as T;
  }

  /**
   * 检查服务是否已注册
   * @param id 服务的唯一标识符
   * @returns 如果服务已注册则返回 true
   */
  public hasService(id: string): boolean {
    return this.services.has(id);
  }

  /**
   * 获取所有已注册的服务。
   */
  public getAllServices(): ToolService[] {
    return Array.from(this.services.values());
  }

  /**
   * 获取所有已注册的服务 ID。
   */
  public getAllServiceIds(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * 检查注册表是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 清理所有服务并重置注册表
   */
  public async dispose(): Promise<void> {
    logger.info('开始清理所有服务');

    for (const [id, service] of this.services.entries()) {
      try {
        if (service.dispose) {
          service.dispose();
          logger.debug(`服务 "${id}" 已清理`);
        }
      } catch (error) {
        logger.error(`清理服务 "${id}" 时出错`, error);
      }
    }

    this.services.clear();
    this.initialized = false;
    logger.info('所有服务已清理完成');
  }
}

// 导出单例实例
export const serviceRegistry = new ServiceRegistry();