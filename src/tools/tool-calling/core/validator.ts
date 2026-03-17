import { toolRegistryManager } from "@/services/registry";
import type { ParsedToolRequest } from "../types";

/**
 * 对解析后的工具请求进行运行时验证（工具/方法是否存在、是否可调用）
 */
export function validateToolRequest(request: ParsedToolRequest): ParsedToolRequest {
  // 解析层已标记为无效时直接透传，不再叠加 registry 层的噪音错误
  if (request.validation && !request.validation.isValid) {
    return request;
  }

  const errors: string[] = [];

  // 1. 检查工具是否存在
  if (!toolRegistryManager.hasTool(request.toolId)) {
    errors.push(`工具 "${request.toolId}" 不存在`);
  } else {
    // 2. 获取工具实例并检查方法
    let toolInstance: any;
    try {
      toolInstance = toolRegistryManager.getRegistry(request.toolId);
    } catch (e) {
      errors.push(`无法获取工具 "${request.toolId}" 的实例`);
    }

    if (toolInstance) {
      const method = toolInstance[request.methodName];
      if (typeof method !== "function") {
        errors.push(`方法 "${request.methodName}" 在工具 "${request.toolId}" 中不存在`);
      } else {
        // 3. 检查元数据（是否标记为 agentCallable）
        const metadata = typeof toolInstance.getMetadata === "function" ? toolInstance.getMetadata() : undefined;
        const methodMeta = metadata?.methods?.find((m: any) => m.name === request.methodName);

        if (methodMeta && methodMeta.agentCallable === false) {
          errors.push(`方法 "${request.methodName}" 不允许被智能体直接调用`);
        }
      }
    }
  }

  // 验证通过，直接返回原对象
  if (errors.length === 0) {
    return request;
  }

  return {
    ...request,
    validation: {
      isValid: false,
      reason: errors.join("; "),
      errors,
    },
  };
}
