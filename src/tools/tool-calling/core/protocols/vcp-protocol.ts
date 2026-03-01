import { createModuleLogger } from "@/utils/logger";
import type { MethodMetadata, MethodParameter } from "@/services/types";
import type { ParsedToolRequest, ToolExecutionResult } from "../../types";
import type { ToolCallingProtocol, ToolDefinitionInput } from "./base";

const logger = createModuleLogger("tool-calling/vcp-protocol");

const TOOL_REQUEST_START = "<<<[TOOL_REQUEST]>>>";
const TOOL_REQUEST_END = "<<<[END_TOOL_REQUEST]>>>";
export const TOOL_DEFINITION_START = "<<<[TOOL_DEFINITION]>>>";
export const TOOL_DEFINITION_END = "<<<[END_TOOL_DEFINITION]>>>";

// 复用 Tokenizer 中 VCP 模式的语义，但在此创建非 sticky 的专用实例。
// 允许冒号后有可选空格
const RE_VCP_ARG = /([a-zA-Z0-9_-]+):\s*「始」([\s\S]*?)「末」/g;
const RE_VCP_PENDING = /([a-zA-Z0-9_-]+):\s*「始」([\s\S]*)$/;
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

export function buildMethodDescription(
  method: MethodMetadata,
  toolId: string,
  options?: { isVcpChannel?: boolean }
): string {
  const command = pickCommandName(method);

  // 统一转换：将所有连字符转为下划线，符合 VCP 协议习惯
  const normalizedToolId = toolId.replace(/-/g, "_");
  const methodName = method.name.replace(/-/g, "_");

  const lines: string[] = [];

  // 如果是 VCP 渠道（分布式），使用扁平化的 toolId_methodName 格式作为 tool_name
  if (options?.isVcpChannel) {
    lines.push(buildArgBlock("tool_name", `${normalizedToolId}_${methodName}`));
  } else {
    lines.push(buildArgBlock("tool_name", normalizedToolId));
  }

  lines.push(buildArgBlock("command", command));

  // 每个参数展开为独立的 VCP 字段行，而非 JSON 序列化
  for (const param of method.parameters) {
    lines.push(buildArgBlock(param.name, buildParamDescription(param)));
  }

  return lines.join("\n");
}

function parseSingleToolRequest(rawBlock: string, requestIndex: number): ParsedToolRequest[] {
  const content = rawBlock.slice(TOOL_REQUEST_START.length, rawBlock.length - TOOL_REQUEST_END.length);

  const allParams: Record<string, string> = {};
  const errors: string[] = [];

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

  const rawToolId = allParams.tool_name?.trim();
  if (!rawToolId) {
    errors.push("缺少关键字段: tool_name");
  }

  // 逆向转换 toolId: directory_tree -> directory-tree
  // 因为在提示词生成时我们将连字符转为了下划线以兼容 VCP 协议
  const toolId = rawToolId?.replace(/_/g, "-");

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
    const finalToolName = toolId ? (command ? `${toolId}_${command}` : toolId) : "unknown_tool";
    const args = { ...commonArgs };
    delete args.command;

    return [
      {
        requestId: baseRequestId,
        toolName: finalToolName,
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
    const command = groupArgs.command?.trim() || commonArgs.command?.trim();
    const finalToolName = toolId ? (command ? `${toolId}_${command}` : toolId) : "unknown_tool";

    const mergedArgs = { ...commonArgs, ...groupArgs };
    delete mergedArgs.command;

    return {
      requestId: `${baseRequestId}_${index}`,
      toolName: finalToolName,
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

  public generateToolDefinitions(input: ToolDefinitionInput[], options?: { isVcpChannel?: boolean }): string {
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
        const body = buildMethodDescription(method, tool.toolId, options);

        const block = [
          `指令描述：${description}`,
          "",
          TOOL_DEFINITION_START,
          body,
          TOOL_DEFINITION_END,
        ].join("\n");

        methodBlocks.push(block);
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
      "4. **转义说明**：如果内容本身包含「始」或「末」，请使用转义格式（如「始exp」和「末exp」）。",
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
    // 这样可以在一次遍历中自动跳过代码块内容，且不需要创建大字符串副本，内存效率更高
    const scanner = /(?:^|\n) {0,3}```[\s\S]*?(?:\n {0,3}```|$)|`[^`\n\r]+`|(<<<\[TOOL_REQUEST\]>>>)/g;

    let match: RegExpExecArray | null;
    while ((match = scanner.exec(text)) !== null) {
      // 只有当捕获组 1 匹配到时，才说明找到了不在代码块内的工具标记
      if (match[1]) {
        const blockStart = match.index + (match[0].startsWith("\n") ? 1 : 0);
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

        // 更新正则指针，跳过已处理的工具块
        scanner.lastIndex = blockEnd + TOOL_REQUEST_END.length;
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
    // 转换 toolId: directory-tree -> directory_tree 以符合协议规范
    const normalizedToolId = toolId.replace(/-/g, "_");
    lines.push(buildArgBlock("tool_name", normalizedToolId) + ",");
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
