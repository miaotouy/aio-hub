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

import type { ToolCallConfig as AgentToolCallConfig } from "@/tools/agent-manager/types/agent";

export interface ParsedToolRequest {
  requestId: string;
  /** 工具 ID (例如: tool-calling) */
  toolId: string;
  /** 方法名称 (例如: testAsyncTask) */
  methodName: string;
  /** 方法显示名称 (例如: 测试异步任务) */
  methodDisplayName?: string;
  /** 原始工具名称 (可能为扁平化格式，用于向下兼容) */
  toolName: string;
  rawBlock: string;
  args: Record<string, string>;
  validation?: {
    isValid: boolean;
    reason?: string;
    errors?: string[];
  };
}

export interface ToolExecutionResult {
  requestId: string;
  toolName: string;
  status: "success" | "error" | "denied";
  result: string;
  durationMs: number;
}

export interface ToolCallCycleResult {
  parsedRequests: ParsedToolRequest[];
  executionResults: ToolExecutionResult[];
  hasToolRequests: boolean;
}

export type ToolApprovalResult = "approved" | "rejected";

export type ToolCallStatus = "executing" | "completed" | "error";

export type ToolCallConfig = AgentToolCallConfig;

export interface ToolSecurityPolicyResult {
  status: "allow" | "approve" | "block";
  message?: string;
}
