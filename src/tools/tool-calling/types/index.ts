import type { ToolCallConfig as AgentToolCallConfig } from "@/tools/llm-chat/types/agent";

export interface ParsedToolRequest {
  requestId: string;
  /** 工具 ID (例如: tool-calling) */
  toolId: string;
  /** 方法名稱 (例如: testAsyncTask) */
  methodName: string;
  /** 原始工具名稱 (可能為扁平化格式，用於向下兼容) */
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

export type ToolApprovalResult = "approved" | "rejected" | "silent_cancelled";

export type ToolCallStatus = "executing" | "completed" | "error";

export type ToolCallConfig = AgentToolCallConfig;
