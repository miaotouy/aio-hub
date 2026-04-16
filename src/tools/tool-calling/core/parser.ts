import type { ToolCallingProtocol } from "./protocols/base";
import type { ParsedToolRequest } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";

const logger = createModuleLogger("tool-calling/parser");
const errorHandler = createModuleErrorHandler("tool-calling/parser");

/**
 * 从完整的 assistant 回复文本中解析工具调用请求
 */
export function parseToolRequests(fullText: string, protocol: ToolCallingProtocol): ParsedToolRequest[] {
  if (!fullText) {
    return [];
  }

  try {
    const requests = protocol.parseToolRequests(fullText);

    // 补充 displayName 等元数据
    for (const req of requests) {
      try {
        if (toolRegistryManager.hasTool(req.toolId)) {
          const registry = toolRegistryManager.getRegistry(req.toolId);
          if (registry.getMetadata) {
            const metadata = registry.getMetadata();
            const method = metadata.methods?.find((m) => m.name === req.methodName);
            if (method?.displayName) {
              req.methodDisplayName = method.displayName;
            }
          }
        }
      } catch (e) {
        // 忽略元数据查找错误，不影响核心流程
        logger.warn("查找工具显示名称失败", { toolId: req.toolId, methodName: req.methodName });
      }
    }

    logger.debug("工具请求解析完成", {
      protocol: protocol.id,
      requestCount: requests.length,
    });
    return requests;
  } catch (error) {
    errorHandler.error(error, "工具请求解析失败，已回退为空结果", {
      protocol: protocol.id,
      inputLength: fullText.length,
    });
    return [];
  }
}
