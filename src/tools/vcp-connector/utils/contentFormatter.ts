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

/**
 * VCP 日志内容格式化器
 *
 * 接收原始 vcp_log 消息中的 content 字段（纯 JSON 字符串或普通文本），
 * 进行智能解析和定制化 Markdown 渲染。
 *
 * 支持场景：
 * - DailyNote：日记归档通知，提取 message + folder/fileName/MaidName
 * - AgentDream：梦境记录，提取主消息 + dreamLog 中的 insightContent 和参考日记
 * - 通用 JSON：使用通用的 YAML 风格转换，或提取 result/content/message 字段
 */

/** 解析结果 */
export interface ParsedStructuredContent {
  /** 模块名（优先使用外部传入的 toolName） */
  moduleName: string;
  /** JSON 中的 status 字段，或外部传入的 status */
  status?: string;
  /** 提取出的纯文本概要（用于浮动提示等简短场景） */
  textContent?: string;
  /** 完整的格式化文本（用于通知详情 / LogCard 展示） */
  formatted: string;
  /** 格式化的标题行（模块名 + 状态图标） */
  headline: string;
  /** 原始解析出的 JSON 对象 */
  raw: Record<string, unknown>;
}

const STATUS_ICONS: Record<string, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  pending: "⏳",
  running: "🔄",
};

/**
 * 尝试从 content 字符串中智能解析结构化数据。
 * 能够从任何包含前缀（如 "[ServerFileOperator] 执行错误: "）的文本中，
 * 自动提取出 JSON 部分并进行解析。
 * 解析失败返回 `null`。
 *
 * @param content 原始 content 字符串
 * @param defaultModuleName 当 JSON 中没有模块标识时的默认模块名（如外部 toolName）
 */
export function tryParseStructuredContent(
  content: string,
  defaultModuleName?: string
): ParsedStructuredContent | null {
  if (!content) return null;

  let moduleName = defaultModuleName || "VCP";
  const trimmed = content.trim();

  // 1. 尝试提取中括号中的模块名，例如 "[ServerFileOperator] 执行错误: { ... }"
  const moduleMatch = trimmed.match(/^\s*\[([^\]]+)\]/);
  if (moduleMatch) {
    moduleName = moduleMatch[1].trim();
  }

  // 2. 寻找第一个 '{' 和最后一个 '}'，提取出 JSON 字符串
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null; // 没有 JSON 结构，是纯文本
  }

  const jsonStr = trimmed.slice(firstBrace, lastBrace + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null; // 提取出的部分不是合法的 JSON
  }

  // 3. 提取前缀文本（如果有的话，比如 "执行错误: "）
  let prefixText = trimmed.slice(0, firstBrace).trim();
  // 去掉中括号模块名，例如从 "[ServerFileOperator] 执行错误: " 变成 "执行错误: "
  if (moduleMatch) {
    prefixText = prefixText.slice(moduleMatch[0].length).trim();
  }
  // 去掉末尾的冒号
  if (prefixText.endsWith(":")) {
    prefixText = prefixText.slice(0, -1).trim();
  }
  if (prefixText.endsWith("：")) {
    prefixText = prefixText.slice(0, -1).trim();
  }

  const status = typeof parsed.status === "string" ? parsed.status : undefined;
  const statusIcon = status ? STATUS_ICONS[status] || `[${status}]` : "";
  const headline = statusIcon
    ? `${moduleName} · ${statusIcon} ${status}`
    : moduleName;

  // 4. 针对不同工具进行定制化 Markdown 渲染
  const { textContent, formattedBody } = renderStructuredJson(
    moduleName,
    parsed,
    prefixText
  );

  const formatted = formattedBody
    ? `${headline}\n${"─".repeat(40)}\n${formattedBody}`
    : headline;

  return {
    moduleName,
    status,
    textContent: textContent || undefined,
    formatted,
    headline,
    raw: parsed,
  };
}

/**
 * 根据模块名和 JSON 内容，渲染为定制化的 Markdown 文本。
 * 返回提取的纯文本概要和格式化后的正文。
 */
function renderStructuredJson(
  moduleName: string,
  obj: Record<string, any>,
  prefixText?: string
): { textContent: string; formattedBody: string } {
  let textContent = "";
  const bodyParts: string[] = [];

  // 如果有前缀文本（如 "执行错误"），先加进去
  if (prefixText) {
    bodyParts.push(`**提示**: ${prefixText}`);
    bodyParts.push("");
  }

  const lowerModule = moduleName.toLowerCase();

  // ── 场景 A：DailyNote 日记归档 ──
  if (
    (lowerModule === "dailynote" || lowerModule === "daily_note") &&
    obj.message
  ) {
    textContent = obj.message;
    bodyParts.push(`> ${obj.message}`);
    bodyParts.push("");
    if (obj.folder) bodyParts.push(`- **归档文件夹**: \`${obj.folder}\``);
    if (obj.fileName) bodyParts.push(`- **归档文件名**: \`${obj.fileName}\``);
    if (obj.MaidName) bodyParts.push(`- **记录人**: ${obj.MaidName}`);
  }
  // ── 场景 B：AgentDream 梦境记录 ──
  else if (
    lowerModule === "agentdream" ||
    lowerModule === "agent_dream" ||
    obj.dreamLog
  ) {
    // 提取主要通知消息
    const mainMsg = extractTextContent(obj) || "";
    textContent = mainMsg;

    if (mainMsg) {
      bodyParts.push(`> ${mainMsg.replace(/\n/g, "\n> ")}`);
      bodyParts.push("");
    }

    // 提取 dreamLog 中的精华内容
    const dreamLog = obj.dreamLog;
    if (dreamLog && typeof dreamLog === "object") {
      if (dreamLog.dreamId)
        bodyParts.push(`**梦境 ID**: \`${dreamLog.dreamId}\``);
      if (dreamLog.agentName)
        bodyParts.push(`**记录者**: ${dreamLog.agentName}`);
      bodyParts.push("");

      if (Array.isArray(dreamLog.operations)) {
        for (const op of dreamLog.operations) {
          if (op.type === "insight" && op.insightContent) {
            // 直接还原 Markdown 格式的梦感悟正文
            bodyParts.push(op.insightContent);
            bodyParts.push("");
          }

          // 提取参考日记
          if (
            Array.isArray(op.referenceDiaries) &&
            op.referenceDiaries.length > 0
          ) {
            bodyParts.push("**📚 参考日记**");
            op.referenceDiaries.forEach((diary: string) => {
              const fileName = decodeURIComponent(
                diary.split(/[/\\]/).pop() || diary
              );
              bodyParts.push(`- 📄 ${fileName}`);
            });
            bodyParts.push("");
          }

          if (op.suggestedMaid)
            bodyParts.push(`**建议记录人**: ${op.suggestedMaid}`);
        }
      }
    }
  }
  // ── 场景 C：通用 JSON 降级处理 ──
  else {
    textContent = extractTextContent(obj) || "";

    // 如果 JSON 里有 message 字段，且 extractTextContent 没拿到（可能是纯 object 无 result）
    if (!textContent && typeof obj.message === "string") {
      textContent = obj.message;
    }

    if (textContent) {
      bodyParts.push(textContent);
    }

    // 把其余尚未展示的顶层字段转成 YAML 风格
    const skipKeys = ["status", "message", "text", "result", "content"];
    const yamlBody = jsonToYamlLike(obj, skipKeys);
    if (yamlBody) {
      if (bodyParts.length > 0) bodyParts.push("");
      bodyParts.push(yamlBody);
    }
  }

  return {
    textContent: textContent.trim(),
    formattedBody: bodyParts.join("\n").trim(),
  };
}

/**
 * 从 MCP / OpenAI 风格的 JSON 中提取文本内容。
 *
 * 支持的结构：
 * - `{ result: { content: [{ type: "text", text: "..." }] } }`
 * - `{ result: { content: [{ text: "..." }] } }`
 * - `{ content: [{ type: "text", text: "..." }] }`
 * - `{ result: "直接字符串" }`
 * - `{ message: "直接字符串" }`
 * - `{ text: "直接字符串" }`
 */
function extractTextContent(obj: Record<string, unknown>): string | null {
  // 尝试 result.content 数组
  const result = obj.result as Record<string, unknown> | undefined;
  const contentSource = result?.content ?? obj.content;

  if (Array.isArray(contentSource)) {
    const texts = contentSource
      .filter(
        (item: any) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      )
      .map((item: any) => item.text as string);

    if (texts.length > 0) {
      return texts.join("\n\n");
    }
  }

  // 尝试 result 为直接字符串
  if (typeof result === "string") return result;

  // 尝试 message / text 字段
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.text === "string") return obj.text;

  return null;
}

/**
 * 将 JSON 对象转为 YAML 风格的可读文本（浅层，不递归太深）。
 * @param obj 要格式化的对象
 * @param skipKeys 要跳过的顶层键（如已在别处展示的）
 * @param indent 当前缩进层级
 * @param maxDepth 最大递归深度
 */
function jsonToYamlLike(
  obj: Record<string, unknown>,
  skipKeys: string[] = [],
  indent = 0,
  maxDepth = 3
): string {
  if (maxDepth <= 0) return JSON.stringify(obj);

  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.includes(key)) continue;

    if (value === null || value === undefined) {
      lines.push(`${pad}${key}: ~`);
    } else if (typeof value === "string") {
      // 多行字符串用缩进块展示
      if (value.includes("\n")) {
        lines.push(`${pad}${key}:`);
        for (const line of value.split("\n")) {
          lines.push(`${pad}  ${line}`);
        }
      } else {
        lines.push(`${pad}${key}: ${value}`);
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${pad}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else if (
        value.every((v) => typeof v === "string" || typeof v === "number")
      ) {
        lines.push(`${pad}${key}: ${value.join(", ")}`);
      } else {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            lines.push(`${pad}  -`);
            const sub = jsonToYamlLike(
              item as Record<string, unknown>,
              [],
              indent + 2,
              maxDepth - 1
            );
            if (sub) lines.push(sub);
          } else {
            lines.push(`${pad}  - ${String(item)}`);
          }
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${pad}${key}:`);
      const sub = jsonToYamlLike(
        value as Record<string, unknown>,
        [],
        indent + 1,
        maxDepth - 1
      );
      if (sub) lines.push(sub);
    }
  }

  return lines.join("\n");
}
