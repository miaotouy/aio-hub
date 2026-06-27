import type { ToolCallConfig as AgentToolCallConfig } from "@/tools/llm-chat/types/agent";

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
