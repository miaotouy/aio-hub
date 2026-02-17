import type { ToolCallingProtocol } from "./protocols/base";
import type {
  ToolCallConfig,
  ToolCallCycleResult,
  ParsedToolRequest,
  ToolExecutionResult,
} from "../types";
import { parseToolRequests } from "./parser";
import { executeToolRequests } from "./executor";

export interface ToolCallEngineOptions {
  protocol: ToolCallingProtocol;
  config: ToolCallConfig;
  onBeforeExecute?: (request: ParsedToolRequest) => Promise<boolean>;
}

/**
 * 将执行结果格式化为可注入上下文的文本
 */
export function formatResultsForContext(
  results: ToolExecutionResult[],
  protocol: ToolCallingProtocol,
): string {
  return protocol.formatToolResults(results);
}

/**
 * 执行一个完整的工具调用周期：解析 -> 执行 -> 格式化结果
 */
export async function processToolCallCycle(
  assistantText: string,
  options: ToolCallEngineOptions,
): Promise<ToolCallCycleResult> {
  const parsedRequests = parseToolRequests(assistantText, options.protocol);
  if (parsedRequests.length === 0) {
    return {
      hasToolRequests: false,
      parsedRequests: [],
      executionResults: [],
    };
  }

  const executionResults = await executeToolRequests(parsedRequests, {
    config: options.config,
    onBeforeExecute: options.onBeforeExecute,
  });

  return {
    hasToolRequests: true,
    parsedRequests,
    executionResults,
  };
}