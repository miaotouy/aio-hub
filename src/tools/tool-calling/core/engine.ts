// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ToolCallingProtocol } from "./protocols/base";
import type {
  ToolCallConfig,
  ToolCallCycleResult,
  ParsedToolRequest,
  ToolExecutionResult,
  ToolApprovalResult,
  ToolCallStatus,
} from "../types";
import { parseToolRequests } from "./parser";
import { executeToolRequests } from "./executor";
import { validateToolRequest } from "./validator";

export interface ToolCallEngineOptions {
  protocol: ToolCallingProtocol;
  config: ToolCallConfig;
  onBeforeExecute?: (
    request: ParsedToolRequest
  ) => Promise<ToolApprovalResult | boolean>;
  onStatusChange?: (requestId: string, status: ToolCallStatus) => void;
}

/**
 * 将执行结果格式化为可注入上下文的文本
 */
export function formatResultsForContext(
  results: ToolExecutionResult[],
  protocol: ToolCallingProtocol
): string {
  return protocol.formatToolResults(results);
}

/**
 * 执行一个完整的工具调用周期：解析 -> 执行 -> 格式化结果
 */
export async function processToolCallCycle(
  assistantText: string,
  options: ToolCallEngineOptions
): Promise<ToolCallCycleResult> {
  const parsedRequests = parseToolRequests(assistantText, options.protocol).map(
    validateToolRequest
  );
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
    onStatusChange: options.onStatusChange,
  });

  return {
    hasToolRequests: true,
    parsedRequests,
    executionResults,
  };
}
