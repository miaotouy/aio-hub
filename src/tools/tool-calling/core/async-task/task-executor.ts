/**
 * 异步任务执行器
 *
 * 负责执行异步任务，注入 AsyncTaskContext
 */

import { toolRegistryManager } from "@/services/registry";
import type { AsyncTaskContext } from "./types";
import type { ServiceMetadata } from "@/services/types";
import { parseToolTarget } from "../utils/tool-parser";

export class TaskExecutor {
  /**
   * 执行异步任务
   */
  async execute(toolName: string, args: Record<string, unknown>, context: AsyncTaskContext): Promise<string> {
    const target = parseToolTarget(toolName);
    if (!target) {
      throw new Error(`无效的工具名称格式: ${toolName}`);
    }

    if (!toolRegistryManager.hasTool(target.toolId)) {
      throw new Error(`工具不存在: ${target.toolId}`);
    }

    const toolInstance = toolRegistryManager.getRegistry(target.toolId) as unknown as Record<string, unknown>;
    const method = toolInstance[target.methodName];

    if (typeof method !== "function") {
      throw new Error(`方法不存在: ${target.toolId}.${target.methodName}`);
    }

    // 验证方法是否支持异步调用
    const metadata = this.getMethodMetadata(toolInstance, target.methodName);
    if (!metadata?.agentCallable) {
      throw new Error(`方法不可调用: ${target.toolId}.${target.methodName}`);
    }

    // 注入 AsyncTaskContext 到参数中
    const argsWithContext = {
      ...args,
      __asyncContext: context,
    };

    try {
      const result = await (method as Function).call(toolInstance, argsWithContext);
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
