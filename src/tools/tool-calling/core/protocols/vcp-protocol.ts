import { createModuleLogger } from "@/utils/logger";
import type { MethodMetadata } from "@/services/types";
import type { ParsedToolRequest, ToolExecutionResult } from "../../types";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./base";

const logger = createModuleLogger("tool-calling/vcp-protocol");

const TOOL_REQUEST_START = "<<<[TOOL_REQUEST]>>>";
const TOOL_REQUEST_END = "<<<[END_TOOL_REQUEST]>>>";
const TOOL_DEFINITION_START = "<<<[TOOL_DEFINITION]>>>";
const TOOL_DEFINITION_END = "<<<[END_TOOL_DEFINITION]>>>";
const TOOL_RESULT_START = "<<<[TOOL_RESULT]>>>";
const TOOL_RESULT_END = "<<<[END_TOOL_RESULT]>>>";

// 复用 Tokenizer 中 VCP 模式的语义，但在此创建非 sticky 的专用实例。
const RE_VCP_ARG = /([a-zA-Z0-9_-]+):「始」([\s\S]*?)「末」/g;
const RE_VCP_PENDING = /([a-zA-Z0-9_-]+):「始」([\s\S]*)$/;
const RE_LINE_BREAKS = /\r\n/g;

function normalizeLineBreaks(text: string): string {
  return text.replace(RE_LINE_BREAKS, "\n");
}

function sanitizeValue(value: string): string {
  return normalizeLineBreaks(value ?? "");
}

function buildArgBlock(key: string, value: string): string {
  return `${key}:「始」${sanitizeValue(value)}「末」`;
}

function pickCommandName(method: MethodMetadata): string {
  return method.protocolConfig?.vcpCommand?.trim() || method.name;
}

function buildMethodDescription(toolName: string, method: MethodMetadata): string {
  const command = pickCommandName(method);
  const description = method.description?.trim() || "无描述";
  const parameters = method.parameters.map((param) => ({
    name: param.name,
    type: param.type,
    required: param.required ?? true,
    description: param.description || "",
    defaultValue: param.defaultValue,
    properties: param.properties,
  }));
  const example = method.example?.trim() || `${toolName}.${command}()`;

  return [
    buildArgBlock("tool_name", toolName),
    buildArgBlock("command", command),
    buildArgBlock("description", description),
    buildArgBlock("parameters", JSON.stringify(parameters, null, 2)),
    buildArgBlock("example", example),
  ].join("\n");
}

function parseSingleToolRequest(rawBlock: string, requestIndex: number): ParsedToolRequest | null {
  const content = rawBlock.slice(TOOL_REQUEST_START.length, rawBlock.length - TOOL_REQUEST_END.length);

  const args: Record<string, string> = {};
  let toolName = "";

  RE_VCP_ARG.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastMatchEnd = 0;

  while ((match = RE_VCP_ARG.exec(content)) !== null) {
    const key = match[1];
    const value = sanitizeValue(match[2]);
    if (key === "tool_name") {
      toolName = value;
    } else {
      args[key] = value; // 重复参数后值覆盖前值
    }
    lastMatchEnd = RE_VCP_ARG.lastIndex;
  }

  const remaining = content.slice(lastMatchEnd).trim();
  if (remaining) {
    const pendingMatch = remaining.match(RE_VCP_PENDING);
    if (pendingMatch) {
      const key = pendingMatch[1];
      const value = sanitizeValue(pendingMatch[2]);
      if (key === "tool_name" && !toolName) {
        toolName = value;
      } else if (key !== "tool_name" && !(key in args)) {
        args[key] = value;
      }
    }
  }

  if (!toolName) {
    logger.warn("跳过无 tool_name 的 TOOL_REQUEST 块", { requestIndex, rawBlock });
    return null;
  }

  const requestId = args.request_id?.trim() || `req_${requestIndex + 1}`;
  delete args.request_id;

  return {
    requestId,
    toolName,
    rawBlock,
    args,
  };
}

export class VcpToolCallingProtocol implements ToolCallingProtocol {
  public readonly id = "vcp";

  public generateToolDefinitions(input: ToolDefinitionInput[]): string {
    const blocks: string[] = [];

    for (const tool of input) {
      for (const method of tool.methods) {
        if (!method.agentCallable) {
          continue;
        }

        const body = buildMethodDescription(tool.toolName, method);
        blocks.push(`${TOOL_DEFINITION_START}\n${body}\n${TOOL_DEFINITION_END}`);
      }
    }

    return blocks.join("\n\n");
  }

  public parseToolRequests(finalText: string): ParsedToolRequest[] {
    if (!finalText) {
      return [];
    }

    const text = normalizeLineBreaks(finalText);
    const requests: ParsedToolRequest[] = [];
    let searchStart = 0;
    let requestIndex = 0;

    while (true) {
      const blockStart = text.indexOf(TOOL_REQUEST_START, searchStart);
      if (blockStart === -1) {
        break;
      }

      const contentStart = blockStart + TOOL_REQUEST_START.length;
      const blockEnd = text.indexOf(TOOL_REQUEST_END, contentStart);

      if (blockEnd === -1) {
        logger.warn("发现未闭合的 TOOL_REQUEST 块，已丢弃", {
          blockStart,
          preview: text.slice(blockStart, Math.min(blockStart + 200, text.length)),
        });
        break;
      }

      const rawBlock = text.slice(blockStart, blockEnd + TOOL_REQUEST_END.length);
      const parsed = parseSingleToolRequest(rawBlock, requestIndex);
      if (parsed) {
        requests.push(parsed);
      }

      searchStart = blockEnd + TOOL_REQUEST_END.length;
      requestIndex += 1;
    }

    return requests;
  }

  public formatToolResults(results: ToolExecutionResult[]): string {
    const blocks = results.map((result) => {
      const body = [
        buildArgBlock("request_id", result.requestId),
        buildArgBlock("tool_name", result.toolName),
        buildArgBlock("status", result.status),
        buildArgBlock("duration_ms", String(result.durationMs)),
        buildArgBlock("result", result.result),
      ].join("\n");

      return `${TOOL_RESULT_START}\n${body}\n${TOOL_RESULT_END}`;
    });

    return blocks.join("\n\n");
  }
}