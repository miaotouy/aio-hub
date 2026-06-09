/**
 * VCP 日志内容格式化器
 *
 * 尝试解析 `[模块名] JSON` 格式的消息内容，
 * 将其格式化为可读的 Markdown / YAML 风格文本。
 */

/** 解析结果 */
export interface ParsedStructuredContent {
  /** 方括号中的模块名 */
  moduleName: string;
  /** JSON 中的 status 字段 */
  status?: string;
  /** 从 result.content[].text 提取并拼合的纯文本 */
  textContent?: string;
  /** 完整的格式化文本（用于通知详情 / LogCard 展示） */
  formatted: string;
  /** 格式化的标题行（模块名 + 状态） */
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
 * 尝试从 content 字符串中解析 `[ModuleName] { json }` 格式。
 * 解析失败返回 `null`。
 */
export function tryParseStructuredContent(
  content: string
): ParsedStructuredContent | null {
  if (!content) return null;

  // 匹配 [模块名] 后面跟 JSON 对象
  // 模块名允许字母、数字、中文、下划线、连字符、空格
  const match = content.match(/^\s*\[([^\]]+)\]\s*(\{[\s\S]*\})\s*$/);
  if (!match) return null;

  const moduleName = match[1].trim();
  const jsonStr = match[2];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const status = typeof parsed.status === "string" ? parsed.status : undefined;

  // 尝试提取 result.content[].text（MCP / OpenAI 风格）
  const textContent = extractTextContent(parsed);

  // 构建标题行
  const statusIcon = status ? STATUS_ICONS[status] || `[${status}]` : "";
  const headline = statusIcon
    ? `${moduleName} · ${statusIcon} ${status}`
    : moduleName;

  // 构建格式化正文
  const bodyParts: string[] = [];

  if (textContent) {
    bodyParts.push(textContent);
  } else {
    // 没有可提取的文本内容，将 JSON 格式化成 YAML 风格
    const yamlBody = jsonToYamlLike(parsed, ["status"]);
    if (yamlBody) {
      bodyParts.push(yamlBody);
    }
  }

  const formatted =
    bodyParts.length > 0
      ? `${headline}\n───\n${bodyParts.join("\n")}`
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
 * @param skipKeys 要跳过的顶层键（如已在标题行展示的 status）
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
        // 简单数组：一行展示
        lines.push(`${pad}${key}: ${value.join(", ")}`);
      } else {
        // 复杂数组：每项一行
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
