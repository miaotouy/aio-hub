/**
 * 异步任务执行器
 *
 * 负责执行异步任务，通过第二参数注入统一的 ToolContext
 */

import { toolRegistryManager } from "@/services/registry";
import type { AsyncTaskContext } from "./types";
import type { ServiceMetadata, ToolContext } from "@/services/types";
export class TaskExecutor {
  /**
   * 执行异步任务
   */
  async execute(
    toolId: string,
    methodName: string,
    args: Record<string, unknown>,
    context: AsyncTaskContext
  ): Promise<string> {
    if (!toolRegistryManager.hasTool(toolId)) {
      throw new Error(`工具不存在: ${toolId}`);
    }

    const toolInstance = toolRegistryManager.getRegistry(toolId) as unknown as Record<string, unknown>;
    const method = toolInstance[methodName];

    if (typeof method !== "function") {
      throw new Error(`方法不存在: ${toolId}.${methodName}`);
    }

    // 验证方法是否支持异步调用
    const metadata = this.getMethodMetadata(toolInstance, methodName);
    if (!metadata?.agentCallable) {
      throw new Error(`方法不可调用: ${toolId}.${methodName}`);
    }
    // 构造统一的 ToolContext，通过第二参数传递
    const toolContext: ToolContext = {
      isAsync: true,
      taskId: context.taskId,
      signal: context.signal,
      reportStatus: (message: string, progress?: number) => {
        context.reportProgress(progress ?? 0, message);
      },
    };

    try {
      const result = await (method as (args: Record<string, unknown>, context?: ToolContext) => unknown).call(
        toolInstance,
        args,
        toolContext
      );
      return typeof result === "string" ? result : JSON.stringify(result ?? null);
    } catch (error) {
      if (context.signal.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }
      throw error;
    }
  }

  private getMethodMetadata(
    toolInstance: Record<string, unknown>,
    methodName: string
  ): { agentCallable?: boolean } | null {
    const getMetadata = toolInstance.getMetadata as (() => ServiceMetadata) | undefined;
    if (typeof getMetadata !== "function") {
      return null;
    }
    const metadata = getMetadata();
    return metadata?.methods?.find((m) => m.name === methodName) || null;
  }
}
