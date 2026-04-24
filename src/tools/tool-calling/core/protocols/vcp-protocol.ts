import { createModuleLogger } from "@/utils/logger";
import type { MethodMetadata, MethodParameter } from "@/services/types";
import type { ParsedToolRequest, ToolExecutionResult } from "../../types";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./base";

const logger = createModuleLogger("tool-calling/vcp-protocol");

const TOOL_REQUEST_START = "<<<[TOOL_REQUEST]>>>";
const TOOL_REQUEST_END = "<<<[END_TOOL_REQUEST]>>>";
const TOOL_REQUEST_ESCAPE_START = "<<<[TOOL_REQUEST_ESCAPE]>>>";
const TOOL_REQUEST_ESCAPE_END = "<<<[END_TOOL_REQUEST_ESCAPE]>>>";
export const TOOL_DEFINITION_START = "<<<[TOOL_DEFINITION]>>>";
export const TOOL_DEFINITION_END = "<<<[END_TOOL_DEFINITION]>>>";

// 复用 Tokenizer 中 VCP 模式的语义，但在此创建非 sticky 的专用实例。
// 允许冒号后有可选空格
// 变体优先级: ESCAPE > exp > 标准
const RE_VCP_ARG_ESCAPE = /([a-zA-Z0-9_-]+):\s*「始ESCAPE」([\s\S]*?)「末ESCAPE」/g;
const RE_VCP_ARG_EXP = /([a-zA-Z0-9_-]+):\s*「始exp」([\s\S]*?)「末exp」/g;
const RE_VCP_ARG = /([a-zA-Z0-9_-]+):\s*「始」([\s\S]*?)「末」/g;
const RE_VCP_PENDING = /([a-zA-Z0-9_-]+):\s*「始(?:ESCAPE|exp)?」([\s\S]*)$/;
const RE_LINE_BREAKS = /\r\n/g;

function normalizeLineBreaks(text: string): string {
  return text.replace(RE_LINE_BREAKS, "\n");
}

function sanitizeValue(value: string): string {
  let val = normalizeLineBreaks(value ?? "");
  // 如果值看起来像是被 JSON 转义过的（例如包含 \\），尝试处理它
  // 常见于 LLM 习惯性地对路径中的反斜杠进行双写
  if (val.includes("\\\\")) {
    try {
      // 简单粗暴但有效：如果它能被 JSON.parse 还原（加上引号），说明确实是转义过的
      // 否则回退到简单的替换
      if (val.startsWith('"') && val.endsWith('"')) {
        return JSON.parse(val);
      }
      return val.replace(/\\\\/g, "\\");
    } catch (e) {
      return val.replace(/\\\\/g, "\\");
    }
  }
  return val;
}

function buildArgBlock(key: string, value: string): string {
  return `${key}:「始」${sanitizeValue(value)}「末」`;
}

function pickCommandName(method: MethodMetadata): string {
  return method.protocolConfig?.vcpCommand?.trim() || method.name;
}

function buildParamDescription(param: MethodParameter): string {
  const parts: string[] = [];
  const typeStr = param.type || "any";
  const requiredStr = param.required !== false ? "必填" : "可选";

  parts.push(`(${typeStr}, ${requiredStr})`);

  if (param.required === false && param.defaultValue !== undefined) {
    parts.push(`默认值: ${param.defaultValue}`);
  }

  if (param.description) {
    parts.push(param.description);
  }
  return parts.join(" ");
}

export function buildMethodDescription(method: MethodMetadata, toolId: string): string {
  const command = pickCommandName(method);

  const lines: string[] = [];

  // VCP 协议支持 tool_name 和 command 分离，无论是本地还是分布式都使用相同格式
  lines.push(buildArgBlock("tool_name", toolId));
  lines.push(buildArgBlock("command", command));

  // 每个参数展开为独立的 VCP 字段行，而非 JSON 序列化
  for (const param of method.parameters) {
    lines.push(buildArgBlock(param.name, buildParamDescription(param)));
  }

  return lines.join("\n");
}

function parseSingleToolRequest(rawBlock: string, content: string, requestIndex: number): ParsedToolRequest[] {
  const allParams: Record<string, string> = {};
  const errors: string[] = [];

  // 第一步：优先解析 ESCAPE/exp 变体（内容可含标准 VCP 字符，必须先处理）
  const matchedRanges: Array<[number, number]> = [];

  const parseEscapeVariant = (regex: RegExp) => {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      const value = sanitizeValue(match[2]);
      matchedRanges.push([match.index, regex.lastIndex]);
      allParams[key] = value;
    }
  };

  parseEscapeVariant(RE_VCP_ARG_ESCAPE);
  parseEscapeVariant(RE_VCP_ARG_EXP);

  // 第二步：屏蔽已匹配区域，解析标准参数
  matchedRanges.sort((a, b) => a[0] - b[0]);
  let maskedContent = content;
  for (let ri = matchedRanges.length - 1; ri >= 0; ri--) {
    const [start, end] = matchedRanges[ri];
    maskedContent = maskedContent.slice(0, start) + " ".repeat(end - start) + maskedContent.slice(end);
  }

  RE_VCP_ARG.lastIndex = 0;
  let lastMatchEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = RE_VCP_ARG.exec(maskedContent)) !== null) {
    const key = match[1];
    // 从原始 content 中提取真实值
    const realValueMatch = content
      .slice(match.index, RE_VCP_ARG.lastIndex)
      .match(/([a-zA-Z0-9_-]+):\s*「始」([\s\S]*?)「末」/);
    const value = realValueMatch ? sanitizeValue(realValueMatch[2]) : sanitizeValue(match[2]);

    if (!(key in allParams)) {
      allParams[key] = value;
    }
    lastMatchEnd = RE_VCP_ARG.lastIndex;
  }

  const remaining = maskedContent.slice(lastMatchEnd).trim();
  if (remaining) {
    // 检查是否有未闭合的标签
    const pendingMatch = remaining.match(RE_VCP_PENDING);
    if (pendingMatch) {
      const key = pendingMatch[1];
      const value = sanitizeValue(pendingMatch[2]);
      if (!(key in allParams)) {
        allParams[key] = value;
        errors.push(`参数 "${key}" 未正确闭合（缺少「末」）`);
      }
    } else if (remaining.length > 0 && !remaining.startsWith(",")) {
      // 如果剩下的部分既不是合法的参数也不是逗号，可能是格式错误
      errors.push(`发现无法解析的文本内容: "${remaining.slice(0, 20)}..."`);
    }
  }

  const toolId = allParams.tool_name?.trim();
  const command = allParams.command?.trim();

  if (!toolId) {
    errors.push("缺少关键字段: tool_name");
  }

  // 检查是否存在索引化的 command (command1, command2, ...)
  const hasIndexedCommands = Object.keys(allParams).some((key) => /^command\d+$/.test(key));

  if (!command && !hasIndexedCommands) {
    errors.push("缺少关键字段: command");
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
    // VCP 协议支持 tool_name 和 command 分离
    const args = { ...commonArgs };
    const finalToolId = toolId || "unknown_tool";
    const finalMethodName = command || "unknown_command";
    const flatToolName = `${finalToolId}_${finalMethodName}`;

    return [
      {
        requestId: baseRequestId,
        toolId: finalToolId,
        methodName: finalMethodName,
        toolName: flatToolName,
        rawBlock,
        args,
        validation: {
          isValid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
        },
      },
    ];
  }

  // 批量拆分处理
  return indices.map((index) => {
    const groupArgs = indexedGroups[index];
    const finalToolId = toolId || "unknown_tool";
    const finalMethodName = groupArgs.command?.trim() || command || "unknown_command";
    const flatToolName = `${finalToolId}_${finalMethodName}`;

    const mergedArgs = { ...commonArgs, ...groupArgs };

    return {
      requestId: `${baseRequestId}_${index}`,
      toolId: finalToolId,
      methodName: finalMethodName,
      toolName: flatToolName,
      rawBlock,
      args: mergedArgs,
      validation: {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  });
}

export class VcpToolCallingProtocol implements ToolCallingProtocol {
  public readonly id = "vcp";

  public generateToolDefinitions(input: ToolDefinitionInput[]): string {
    const sections: string[] = [];

    for (const tool of input) {
      const toolName = tool.toolName;
      const toolDescription = tool.toolDescription?.trim();
      const toolMethods = tool.methods.filter((m) => m.agentCallable);

      if (toolMethods.length === 0) {
        continue;
      }

      const header = [`工具显示名称：${toolName}`];
      if (toolDescription) {
        header.push(`工具模块描述：${toolDescription}`);
      }

      const methodBlocks: string[] = [];
      for (const method of toolMethods) {
        const description = method.description?.trim() || "无描述";
        const example = method.example?.trim();
        const body = buildMethodDescription(method, tool.toolId);

        const blockLines = [`指令描述：${description}`];
        if (example) {
          blockLines.push(`指令示例：${example}`);
        }
        blockLines.push("", TOOL_DEFINITION_START, body, TOOL_DEFINITION_END);

        methodBlocks.push(blockLines.join("\n"));
      }

      const toolSection = [...header, "", ...methodBlocks].join("\n\n");

      sections.push(toolSection);
    }

    return sections.join("\n\n---\n\n");
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
      "4. **内容保护 (重要)**：",
      "   - 如果参数值本身包含 VCP 协议字符（如「始」、「末」），**必须**使用转义围栏：`参数:「始ESCAPE」内容「末ESCAPE」`。",
      "   - 如果需要在一个工具调用中嵌套另一个完整的 VCP 块，**必须**使用块级转义围栏：`<<<[TOOL_REQUEST_ESCAPE]>>> ... <<<[END_TOOL_REQUEST_ESCAPE]>>>`。",
    ].join("\n");
  }

  public parseToolRequests(finalText: string): ParsedToolRequest[] {
    if (!finalText) {
      return [];
    }

    const text = normalizeLineBreaks(finalText);
    const requests: ParsedToolRequest[] = [];
    let requestIndex = 0;

    // 使用复合正则：匹配代码块、行内代码，或者捕获工具请求标记
    // 捕获组 1: 标准请求, 捕获组 2: 转义请求
    const scanner =
      /(?:^|\n) {0,3}```[\s\S]*?(?:\n {0,3}```|$)|`[^`\n\r]+`|(<<<\[TOOL_REQUEST\]>>>)|(<<<\[TOOL_REQUEST_ESCAPE\]>>>)/g;

    let match: RegExpExecArray | null;
    while ((match = scanner.exec(text)) !== null) {
      const isEscape = !!match[2];
      const foundMarker = match[1] || match[2];

      if (foundMarker) {
        const startMarker = isEscape ? TOOL_REQUEST_ESCAPE_START : TOOL_REQUEST_START;
        const endMarker = isEscape ? TOOL_REQUEST_ESCAPE_END : TOOL_REQUEST_END;

        const blockStart = match.index + (match[0].startsWith("\n") ? 1 : 0);
        const contentStart = blockStart + startMarker.length;
        const blockEnd = text.indexOf(endMarker, contentStart);

        if (blockEnd === -1) {
          logger.warn(`发现未闭合的 ${startMarker} 块，已丢弃`, {
            blockStart,
            preview: text.slice(blockStart, Math.min(blockStart + 200, text.length)),
          });
          break;
        }

        const rawBlock = text.slice(blockStart, blockEnd + endMarker.length);
        const content = text.slice(contentStart, blockEnd);
        const parsedList = parseSingleToolRequest(rawBlock, content, requestIndex);
        requests.push(...parsedList);

        // 更新正则指针，跳过已处理的工具块
        scanner.lastIndex = blockEnd + endMarker.length;
        requestIndex += 1;
      }
    }

    return requests;
  }

  public formatToolResults(results: ToolExecutionResult[]): string {
    if (results.length === 0) return "";

    const lines = [`[[AIO工具调用结果信息汇总:`];

    results.forEach((result, index) => {
      const statusIcon = result.status === "success" ? "✅ SUCCESS" : "❌ ERROR";
      lines.push(`### 结果 ${index + 1}`);
      lines.push(`- 工具名称: ${result.toolName}`);
      lines.push(`- 执行状态: ${statusIcon}`);
      lines.push(`- 返回内容: ${result.result}`);
      if (index < results.length - 1) {
        lines.push(""); // 多个结果之间空一行
      }
    });

    lines.push(`AIO工具调用结果结束]]`);

    return lines.join("\n");
  }

  /**
   * 生成单个 VCP 工具请求块
   */
  public formatToolRequest(toolId: string, command: string, args: Record<string, any>): string {
    const lines = [TOOL_REQUEST_START];
    lines.push(buildArgBlock("tool_name", toolId) + ",");
    lines.push(buildArgBlock("command", command) + ",");

    const argKeys = Object.keys(args);
    argKeys.forEach((key, index) => {
      const value = args[key];
      const valStr = typeof value === "object" ? JSON.stringify(value) : String(value);
      const suffix = index === argKeys.length - 1 ? "" : ",";
      lines.push(buildArgBlock(key, valStr) + suffix);
    });

    lines.push(TOOL_REQUEST_END);
    return lines.join("\n");
  }
}
