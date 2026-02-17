import type { ToolCallingProtocol } from "./protocols/base";
import type { ParsedToolRequest } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("tool-calling/parser");
const errorHandler = createModuleErrorHandler("tool-calling/parser");

/**
 * 从完整的 assistant 回复文本中解析工具调用请求
 */
export function parseToolRequests(
  fullText: string,
  protocol: ToolCallingProtocol,
): ParsedToolRequest[] {
  if (!fullText) {
    return [];
  }

  try {
    const requests = protocol.parseToolRequests(fullText);
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