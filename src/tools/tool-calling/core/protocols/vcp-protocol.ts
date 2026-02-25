import { createModuleLogger } from "@/utils/logger";
import type { MethodMetadata, MethodParameter } from "@/services/types";
import type { ParsedToolRequest, ToolExecutionResult } from "../../types";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./base";

const logger = createModuleLogger("tool-calling/vcp-protocol");

const TOOL_REQUEST_START = "<<<[TOOL_REQUEST]>>>";
const TOOL_REQUEST_END = "<<<[END_TOOL_REQUEST]>>>";
export const TOOL_DEFINITION_START = "<<<[TOOL_DEFINITION]>>>";
export const TOOL_DEFINITION_END = "<<<[END_TOOL_DEFINITION]>>>";
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

function buildParamDescription(param: MethodParameter): string {
  const parts: string[] = [`类型：${param.type}`];
  if (param.required !== false) {
    parts.push("必填");
  } else {
    parts.push("可选");
    if (param.defaultValue !== undefined) {
      parts.push(`默认值：${param.defaultValue}`);
    }
  }
  if (param.description) {
    parts.push(param.description);
  }
  return parts.join("，");
}

export function buildMethodDescription(method: MethodMetadata): string {
  const command = pickCommandName(method);

  const lines = [buildArgBlock("command", command)];

  // 每个参数展开为独立的 VCP 字段行，而非 JSON 序列化
  for (const param of method.parameters) {
    lines.push(buildArgBlock(param.name, buildParamDescription(param)));
  }

  return lines.join("\n");
}

function parseSingleToolRequest(rawBlock: string, requestIndex: number): ParsedToolRequest[] {
  const content = rawBlock.slice(TOOL_REQUEST_START.length, rawBlock.length - TOOL_REQUEST_END.length);

  const allParams: Record<string, string> = {};

  RE_VCP_ARG.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastMatchEnd = 0;

  while ((match = RE_VCP_ARG.exec(content)) !== null) {
    const key = match[1];
    const value = sanitizeValue(match[2]);
    allParams[key] = value;
    lastMatchEnd = RE_VCP_ARG.lastIndex;
  }

  const remaining = content.slice(lastMatchEnd).trim();
  if (remaining) {
    const pendingMatch = remaining.match(RE_VCP_PENDING);
    if (pendingMatch) {
      const key = pendingMatch[1];
      const value = sanitizeValue(pendingMatch[2]);
      if (!(key in allParams)) {
        allParams[key] = value;
      }
    }
  }

  const toolId = allParams.tool_name?.trim();
  if (!toolId) {
    logger.warn("跳过无 tool_name 的 TOOL_REQUEST 块", { requestIndex, rawBlock });
    return [];
  }

  const baseRequestId = allParams.request_id?.trim() || `req_${requestIndex + 1}`;

  // 识别分组参数 (keyN)
  const commonArgs: Record<string, string> = {};
  const indexedGroups: Record<string, Record<string, string>> = {};
  const RE_INDEXED_KEY = /^(.+?)(\d+)$/;

  for (const [key, value] of Object.entries(allParams)) {
    if (key === "tool_name" || key === "request_id") continue;

    const idxMatch = key.match(RE_INDEXED_KEY);
    if (idxMatch) {
      const baseKey = idxMatch[1];
      const index = idxMatch[2];
      if (!indexedGroups[index]) indexedGroups[index] = {};
      indexedGroups[index][baseKey] = value;
    } else {
      commonArgs[key] = value;
    }
  }

  const indices = Object.keys(indexedGroups).sort((a, b) => Number(a) - Number(b));

  // 如果没有索引参数，按单条处理
  if (indices.length === 0) {
    const command = commonArgs.command?.trim();
    const finalToolName = command ? `${toolId}_${command}` : toolId;
    const args = { ...commonArgs };
    delete args.command;

    return [
      {
        requestId: baseRequestId,
        toolName: finalToolName,
        rawBlock,
        args,
      },
    ];
  }

  // 批量拆分处理
  return indices.map((index) => {
    const groupArgs = indexedGroups[index];
    const command = groupArgs.command?.trim() || commonArgs.command?.trim();
    const finalToolName = command ? `${toolId}_${command}` : toolId;

    const mergedArgs = { ...commonArgs, ...groupArgs };
    delete mergedArgs.command;

    return {
      requestId: `${baseRequestId}_${index}`,
      toolName: finalToolName,
      rawBlock,
      args: mergedArgs,
    };
  });
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

        const toolName = tool.toolName;
        const description = method.description?.trim() || "无描述";
        const body = buildMethodDescription(method);

        const block = [
          `工具名：${toolName}`,
          `工具描述：${description}`,
          TOOL_DEFINITION_START,
          body,
          TOOL_DEFINITION_END,
        ].join("\n");

        blocks.push(block);
      }
    }

    return blocks.join("\n\n");
  }

  public generateUsageInstructions(): string {
    return [
      "## 工具调用格式 (VCP 协议)",
      "当你需要调用工具时，请严格按照以下格式输出。你可以选择单次调用或批量调用格式。",
      "",
      "### 1. 单次调用格式",
      TOOL_REQUEST_START,
      "tool_name:「始」工具名「末」,",
      "command:「始」指令名「末」,",
      "参数名:「始」参数值「末」",
      TOOL_REQUEST_END,
      "",
      "### 2. 相同工具批量调用格式 (支持在同一个块内执行多个指令)",
      TOOL_REQUEST_START,
      "tool_name:「始」工具名「末」,",
      "command1:「始」第一个指令「末」,",
      "参数A1:「始」值「末」,",
      "command2:「始」第二个指令「末」,",
      "参数A2:「始」值「末」",
      TOOL_REQUEST_END,
      "",
      "### 3. 注意事项",
      "1. **围栏原则**：所有参数值必须被 :「始」和 「末」 完整包裹。",
      "2. **工具名**：必须提供正确的 tool_name。",
      "3. **指令名**：如果工具包含多个方法，必须通过 command 参数指定。批量调用时使用 command1, command2...",
      "4. **转义说明**：如果内容本身包含「始」或「末」，请使用转义格式（如「始exp」和「末exp」）。",
    ].join("\n");
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
      const parsedList = parseSingleToolRequest(rawBlock, requestIndex);
      requests.push(...parsedList);

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
