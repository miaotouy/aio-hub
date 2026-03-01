import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readTextFile } from "@tauri-apps/plugin-fs";

const logger = createModuleLogger("tools/json-formatter/logic");
const errorHandler = createModuleErrorHandler("tools/json-formatter/logic");

/**
 * JSON 格式化选项
 */
export interface FormatOptions {
  /** 展开层级深度（1-10） */
  expandDepth?: number;
  /** 每层缩进空格数 */
  indentSize?: number;
}

/**
 * JSON 格式化结果
 */
export interface FormatResult {
  /** 格式化后的 JSON 字符串 */
  formatted: string;
  /** 解析后的 JSON 对象 */
  parsed: any;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * JSON 解析结果
 */
export interface ParseResult {
  /** 解析后的对象 */
  data: any;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 文件读取结果
 */
export interface FileReadResult {
  /** 文件内容 */
  content: string;
  /** 文件名 */
  fileName: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 解析 JSON 字符串
 * @param text JSON 字符串
 * @returns 解析结果
 */
export function parseJson(text: string): ParseResult {
  logger.debug("开始解析 JSON", { textLength: text.length });

  if (!text.trim()) {
    return {
      data: null,
      success: false,
      error: "JSON 字符串为空",
    };
  }

  try {
    const parsed = JSON.parse(text);
    logger.info("JSON 解析成功", { type: typeof parsed });
    return {
      data: parsed,
      success: true,
    };
  } catch (error: any) {
    const errorMessage = `JSON 解析错误: ${error.message}`;
    errorHandler.error(error, "JSON 解析失败");
    return {
      data: null,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 自定义 JSON 序列化器，根据展开层级控制格式
 */
export function customJsonStringify(
  obj: any,
  expandDepth: number,
  indentSize: number = 2,
  currentDepth: number = 0
): string {
  if (obj === null) return "null";
  if (typeof obj === "undefined") return "undefined";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  const indent = " ".repeat(indentSize).repeat(currentDepth);
  const nextIndent = " ".repeat(indentSize).repeat(currentDepth + 1);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";

    if (currentDepth >= expandDepth) {
      const compactItems = obj.map((item) => {
        if (typeof item === "object" && item !== null) {
          return JSON.stringify(item);
        }
        return customJsonStringify(item, expandDepth, indentSize, currentDepth + 1);
      });
      return `[${compactItems.join(", ")}]`;
    }

    const items = obj.map(
      (item) => nextIndent + customJsonStringify(item, expandDepth, indentSize, currentDepth + 1)
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";

    if (currentDepth >= expandDepth) {
      return JSON.stringify(obj);
    }

    const items = keys.map((key) => {
      const value = customJsonStringify(obj[key], expandDepth, indentSize, currentDepth + 1);
      return `${nextIndent}${JSON.stringify(key)}: ${value}`;
    });
    return `{\n${items.join(",\n")}\n${indent}}`;
  }

  return String(obj);
}

/**
 * 格式化 JSON 字符串
 * @param text JSON 字符串
 * @param options 格式化选项
 * @returns 格式化结果
 */
export function formatJson(text: string, options: FormatOptions = {}): FormatResult {
  const { expandDepth = 3, indentSize = 2 } = options;

  logger.debug("开始格式化 JSON", {
    textLength: text.length,
    expandDepth,
    indentSize,
  });

  const parseResult = parseJson(text);
  if (!parseResult.success) {
    return {
      formatted: "",
      parsed: null,
      success: false,
      error: parseResult.error,
    };
  }

  try {
    const formatted = customJsonStringify(parseResult.data, expandDepth, indentSize, 0);

    logger.info("JSON 格式化成功", {
      inputLength: text.length,
      outputLength: formatted.length,
    });

    return {
      formatted,
      parsed: parseResult.data,
      success: true,
    };
  } catch (error: any) {
    const errorMessage = `格式化失败: ${error.message}`;
    errorHandler.error(error, "JSON 格式化失败");
    return {
      formatted: "",
      parsed: parseResult.data,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 读取文件内容
 * @param file 文件对象
 * @returns 文件读取结果的 Promise
 */
export async function readFile(file: File): Promise<FileReadResult> {
  logger.debug("开始读取文件", {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  if (
    file.type !== "application/json" &&
    !file.name.endsWith(".json") &&
    !file.name.endsWith(".txt")
  ) {
    const error = "仅支持 JSON 或文本文件";
    logger.warn("文件类型不支持", { fileName: file.name, fileType: file.type });
    return {
      content: "",
      fileName: file.name,
      success: false,
      error,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      logger.info("文件读取成功", {
        fileName: file.name,
        contentLength: content.length,
      });
      resolve({
        content,
        fileName: file.name,
        success: true,
      });
    };

    reader.onerror = (e) => {
      const error = `读取文件失败: ${e.target?.error?.message || "未知错误"}`;
      errorHandler.error(e.target?.error || new Error("Unknown error"), "文件读取失败", {
        context: { fileName: file.name },
      });
      resolve({
        content: "",
        fileName: file.name,
        success: false,
        error,
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Agent 专用：从文件或文本格式化 JSON
 *
 * 支持通过 text 直接传入 JSON 文本，或通过 filePath 指定文件路径自动读取。
 * 两者至少提供一个，优先使用 filePath。
 *
 * @param args 扁平化参数对象
 * @returns 格式化结果
 */
export async function formatJsonAgent(args: Record<string, string>): Promise<FormatResult> {
  const { text, filePath } = args;
  const expandDepth = args.expandDepth ? Number(args.expandDepth) : 3;
  const indentSize = args.indentSize ? Number(args.indentSize) : 2;

  let jsonText = text;

  // 如果提供了文件路径，优先从文件读取
  if (filePath) {
    logger.info("从文件路径读取 JSON", { filePath });
    const content = await errorHandler.wrapAsync(
      () => readTextFile(filePath),
      { userMessage: `读取文件失败: ${filePath}`, showToUser: false },
    );
    if (content === null) {
      return {
        formatted: "",
        parsed: null,
        success: false,
        error: `无法读取文件: ${filePath}`,
      };
    }
    jsonText = content;
  }

  if (!jsonText) {
    return {
      formatted: "",
      parsed: null,
      success: false,
      error: "必须提供 text 或 filePath 参数",
    };
  }

  return formatJson(jsonText, { expandDepth, indentSize });
}
/**
 * 格式化格式化结果为文本（Agent 专用）
 */
export function formatForAgent(result: FormatResult): string {
  if (!result.success) {
    return `❌ JSON 格式化失败：${result.error || "未知错误"}`;
  }
  return result.formatted;
}
