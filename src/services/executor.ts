/**
 * 统一服务执行器
 * 提供标准化的服务调用接口，实现关注点分离
 */

import { toolRegistryManager } from './registry';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';

const logger = createModuleLogger('services/executor');
const errorHandler = createModuleErrorHandler('services/executor');

// ==================== 类型定义 ====================

/**
 * 描述一个完整的工具调用请求
 */
export interface ToolCall<TParams = Record<string, any>> {
  /** 服务 ID，例如 'regex-applier' */
  service: string;
  /** 要调用的方法名 */
  method: string;
  /** 传递给方法的参数 */
  params: TParams;
}

/**
 * 标准化的服务返回结果
 */
export type ServiceResult<TData = any, TError = Error> =
  | { success: true; data: TData }
  | { success: false; error: TError };

// ==================== 核心执行器 ====================

/**
 * 统一执行器函数
 * 
 * 通过标准化的 ToolCall 对象调用服务方法，并返回标准化的结果。
 * 
 * @param call - 工具调用描述对象
 * @returns Promise<ServiceResult<TData>> - 标准化的执行结果
 * 
 * @example
 * ```typescript
 * const result = await execute({
 *   service: 'regex-applier',
 *   method: 'processText',
 *   params: { text: 'hello', presetIds: ['preset-1'] }
 * });
 * 
 * if (result.success) {
 *   console.log('Success:', result.data);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export async function execute<TData = any>(
  call: ToolCall
): Promise<ServiceResult<TData>> {
  const { service: serviceId, method, params } = call;

  logger.info('执行服务调用', {
    serviceId,
    method,
    paramsKeys: Object.keys(params || {}),
  });

  try {
    // 1. 查找工具实例
    // 开发模式下，如果找不到原始 ID 的工具，自动尝试 -dev 后缀
    let toolInstance;
    try {
      toolInstance = toolRegistryManager.getRegistry(serviceId);
    } catch (error) {
      // 在开发模式下，尝试添加 -dev 后缀
      if (import.meta.env.DEV) {
        const devServiceId = `${serviceId}-dev`;
        logger.debug(`工具 "${serviceId}" 未找到，尝试开发模式 ID: ${devServiceId}`);
        try {
          toolInstance = toolRegistryManager.getRegistry(devServiceId);
          logger.info(`使用开发模式工具: ${devServiceId}`);
        } catch {
          // 仍然找不到，抛出原始错误
          throw error;
        }
      } else {
        throw error;
      }
    }
    
    if (!toolInstance) {
      throw new Error(`工具未找到: ${serviceId}`);
    }

    // 2. 验证方法是否存在
    if (typeof (toolInstance as Record<string, any>)[method] !== 'function') {
      throw new Error(`方法不存在: ${serviceId}.${method}`);
    }

    // 3. 执行方法调用
    const result = await (toolInstance as Record<string, any>)[method](params);

    logger.info('服务调用成功', {
      serviceId,
      method,
      resultType: typeof result,
    });

    // 4. 返回成功结果
    return { success: true, data: result } as ServiceResult<TData>;
  } catch (error) {
    // 记录错误到统一错误处理系统
    errorHandler.handle(error, {
      level: ErrorLevel.ERROR,
      userMessage: `服务调用失败: ${serviceId}.${method}`,
      context: { serviceId, method, params },
    });

    // 返回失败结果
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    } as ServiceResult<TData>;
  }
}

/**
 * 批量执行多个服务调用
 * 
 * @param calls - 工具调用数组
 * @returns Promise<ServiceResult<TData>[]> - 所有调用的结果数组
 * 
 * @example
 * ```typescript
 * const results = await executeMany([
 *   { service: 'json-formatter', method: 'formatJson', params: { json: '{}' } },
 *   { service: 'code-formatter', method: 'formatCode', params: { code: 'x=1' } }
 * ]);
 * ```
 */
export async function executeMany<TData = any>(
  calls: ToolCall[]
): Promise<ServiceResult<TData>[]> {
  logger.info('批量执行服务调用', { count: calls.length });
  
  return Promise.all(calls.map((call) => execute<TData>(call)));
}