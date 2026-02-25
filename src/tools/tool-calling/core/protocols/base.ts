import type { MethodMetadata } from "@/services/types";
import type { ParsedToolRequest, ToolExecutionResult } from "../../types";

export interface ToolDefinitionInput {
  toolId: string;
  toolName: string;
  methods: MethodMetadata[];
}

export interface ToolCallingProtocol {
  readonly id: string;
  generateToolDefinitions(input: ToolDefinitionInput[]): string;
  generateUsageInstructions(): string;
  parseToolRequests(finalText: string): ParsedToolRequest[];
  formatToolResults(results: ToolExecutionResult[]): string;
}
