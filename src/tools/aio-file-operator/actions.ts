/**
 * aio-file-operator 核心业务逻辑
 * 封装底层的 Tauri 命令调用、文档解析逻辑和换行符安全替换
 */
import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import { validatePath, validateFileSize } from "./utils/security";
import { createLineEndingHelper } from "./utils/lineEnding";
import { DEFAULT_CONFIG } from "./config";
import type {
  FileEntry,
  FileOperationResult,
  OperationLogEntry,
  AioFileOperatorConfig,
} from "./types";

const errorHandler = createModuleErrorHandler("AioFileOperator/Actions");

export const configManager = createConfigManager<AioFileOperatorConfig>({
  moduleName: "aio-file-operator",
  fileName: "config.json",
  createDefault: () => DEFAULT_CONFIG,
});

export const logManager = createConfigManager<{ logs: OperationLogEntry[] }>({
  moduleName: "aio-file-operator",
  fileName: "audit-logs.json",
  createDefault: () => ({ logs: [] }),
});

/** 操作日志列表 */
const operationLogs: OperationLogEntry[] = [];

/** 当前配置 */
let currentConfig: AioFileOperatorConfig = { ...DEFAULT_CONFIG };

const initPromise = (async () => {
  try {
    currentConfig = await configManager.load();
    const loadedLogs = await logManager.load();
    operationLogs.push(...(loadedLogs.logs || []));
  } catch (e) {
    errorHandler.handle(e as Error, {
      userMessage: "初始化 AioFileOperator 存储失败",
      showToUser: false,
    });
  }
})();

export async function ensureInitialized() {
  await initPromise;
}

/**
 * 设置配置
 */
export async function setConfig(
  config: Partial<AioFileOperatorConfig>
): Promise<void> {
  await ensureInitialized();
  currentConfig = { ...currentConfig, ...config };
  await configManager.save(currentConfig);
}

/**
 * 获取当前配置
 */
export async function getConfig(): Promise<AioFileOperatorConfig> {
  await ensureInitialized();
  return { ...currentConfig };
}

/**
 * 获取操作日志
 */
export async function getOperationLogs(): Promise<OperationLogEntry[]> {
  await ensureInitialized();
  return [...operationLogs];
}

/**
 * 清空日志
 */
export async function clearLogs(): Promise<void> {
  await ensureInitialized();
  operationLogs.length = 0;
  await logManager.save({ logs: [] });
}

/**
 * 记录操作日志
 */
function recordLog(
  method: string,
  params: Record<string, any>,
  result: FileOperationResult
): void {
  if (!currentConfig.enableAuditLog) return;

  operationLogs.push({
    timestamp: Date.now(),
    method,
    params,
    result,
  });

  // 只保留最近 100 条日志
  if (operationLogs.length > 100) {
    operationLogs.shift();
  }

  // 异步保存日志（防抖）
  logManager.saveDebounced({ logs: operationLogs });
}

/**
 * 构建错误结果并记录日志
 */
function buildErrorResult(
  method: string,
  params: Record<string, any>,
  error: any,
  defaultMessage: string
): FileOperationResult {
  const message = error?.message || defaultMessage;
  const result: FileOperationResult = { success: false, message };
  recordLog(method, params, result);
  errorHandler.error(error, defaultMessage, params);
  return result;
}

/**
 * 读取文件内容
 * 支持普通文本、Word (.docx)、PDF (.pdf)
 */
export async function readFile(path: string): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    // 检查文件元数据
    const metadata = await invoke<{
      size: number;
      isFile: boolean;
      isDir: boolean;
      modified: number | null;
      created: number | null;
    }>("get_file_metadata", { path });

    if (!metadata.isFile) {
      throw new Error(`路径不是文件: ${path}`);
    }

    // 大文件保护
    validateFileSize(metadata.size, currentConfig.maxFileSize);

    // 根据扩展名选择解析方式
    const ext = path.split(".").pop()?.toLowerCase() || "";

    // 旧版 Office 格式前置转换
    if (["doc", "ppt", "xls"].includes(ext)) {
      const convertedPath = await invoke<string | null>(
        "convert_legacy_document",
        { path }
      );
      if (convertedPath) {
        // 递归读取转换后的现代格式文件
        const convertedResult = await readFile(convertedPath);
        return {
          success: convertedResult.success,
          message: convertedResult.success
            ? `成功读取并转换旧版文件: ${path}`
            : `读取转换后的文件失败: ${convertedPath}`,
          data: convertedResult.data,
        };
      } else {
        throw new Error(`转换旧版文件失败: ${path}`);
      }
    }

    let content: string;

    switch (ext) {
      case "docx": {
        // Word 文档：使用项目已有的 parseDocx 解析（支持图片占位符、Markdown 转换）
        const arrayBuffer = await invoke<number[]>("read_file_binary", {
          path,
        });
        const { parseDocx } = await import("@/utils/docxParser");
        const parseResult = await parseDocx(new Uint8Array(arrayBuffer).buffer);
        content = parseResult.text;
        break;
      }
      case "pptx": {
        // PowerPoint 文档：使用项目已有的 parsePptx 解析
        const arrayBuffer = await invoke<number[]>("read_file_binary", {
          path,
        });
        const { parsePptx } = await import("@/utils/zipDocumentParser");
        const parseResult = await parsePptx(new Uint8Array(arrayBuffer).buffer);
        content = parseResult.text;
        break;
      }
      case "xlsx": {
        // Excel 文档：使用项目已有的 parseXlsx 解析
        const arrayBuffer = await invoke<number[]>("read_file_binary", {
          path,
        });
        const { parseXlsx } = await import("@/utils/zipDocumentParser");
        const parseResult = await parseXlsx(new Uint8Array(arrayBuffer).buffer);
        content = parseResult.text;
        break;
      }
      case "pdf": {
        // PDF 文档：使用 pdfjs-dist 逐页提取
        const arrayBuffer = await invoke<number[]>("read_file_binary", {
          path,
        });
        const pdfjsLib = await import("pdfjs-dist");
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          pages.push(pageText);
        }
        content = pages.join("\n--- 分页 ---\n");
        break;
      }
      case "csv": {
        // CSV 文件：直接按文本读取
        content = await invoke<string>("read_text_file_force", { path });
        break;
      }
      default: {
        // 普通文本文件
        content = await invoke<string>("read_text_file_force", { path });
        break;
      }
    }

    const result: FileOperationResult = {
      success: true,
      message: `成功读取文件: ${path}`,
      data: { content, size: metadata.size },
    };

    recordLog("readFile", { path }, result);
    return result;
  } catch (error: any) {
    return buildErrorResult("readFile", { path }, error, "读取文件失败");
  }
}

/**
 * 写入文件（安全写入，支持覆盖策略）
 */
export async function writeFile(
  path: string,
  content: string,
  allowOverwrite?: boolean
): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    // 检查文件是否已存在，如果存在则根据策略决定是否覆盖
    const exists = await invoke<boolean>("path_exists", { path });
    let finalPath = path;
    let isOverwritten = false;

    if (exists) {
      const policy = currentConfig.overwritePolicy || "follow";
      const shouldOverwrite =
        policy === "always" || (policy === "follow" && allowOverwrite === true);

      if (!shouldOverwrite) {
        const lastDot = path.lastIndexOf(".");
        const base = lastDot > 0 ? path.substring(0, lastDot) : path;
        const ext = lastDot > 0 ? path.substring(lastDot) : "";
        let counter = 1;
        while (await invoke<boolean>("path_exists", { path: finalPath })) {
          finalPath = `${base}(${counter})${ext}`;
          counter++;
        }
      } else {
        isOverwritten = true;
      }
    }

    // 确保父目录存在
    const parentDir = finalPath.substring(0, finalPath.lastIndexOf("/"));
    if (parentDir) {
      await invoke("create_dir_force", { path: parentDir });
    }

    // 写入文件
    await invoke("write_text_file_force", { path: finalPath, content });

    const result: FileOperationResult = {
      success: true,
      message: isOverwritten
        ? `文件已存在，已覆盖写入: ${finalPath}`
        : exists && finalPath !== path
          ? `文件已存在，已保存为: ${finalPath}`
          : `成功写入文件: ${finalPath}`,
      data: { path: finalPath },
    };

    recordLog(
      "writeFile",
      { path, contentLength: content.length, allowOverwrite },
      result
    );
    return result;
  } catch (error: any) {
    return buildErrorResult(
      "writeFile",
      { path, allowOverwrite },
      error,
      "写入文件失败"
    );
  }
}

/**
 * 追加内容到文件
 */
export async function appendFile(
  path: string,
  content: string
): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    await invoke("append_file_force", {
      path,
      content: new TextEncoder().encode(content),
    });

    const result: FileOperationResult = {
      success: true,
      message: `成功追加内容到文件: ${path}`,
    };

    recordLog("appendFile", { path, contentLength: content.length }, result);
    return result;
  } catch (error: any) {
    return buildErrorResult("appendFile", { path }, error, "追加文件失败");
  }
}

/**
 * 安全删除文件（移入回收站）
 */
export async function deleteFile(path: string): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    await invoke("delete_file_to_trash", { filePath: path });

    const result: FileOperationResult = {
      success: true,
      message: `文件已移入回收站: ${path}`,
    };

    recordLog("deleteFile", { path }, result);
    return result;
  } catch (error: any) {
    return buildErrorResult("deleteFile", { path }, error, "删除文件失败");
  }
}

/**
 * 列出目录内容
 */
export async function listDirectory(
  path: string
): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    const fileNames = await invoke<string[]>("list_directory", { path });

    // 获取每个文件的详细信息
    const entries: FileEntry[] = [];
    for (const name of fileNames) {
      const fullPath = `${path}/${name}`;
      try {
        const metadata = await invoke<{
          size: number;
          isFile: boolean;
          isDir: boolean;
          modified: number | null;
          created: number | null;
        }>("get_file_metadata", { path: fullPath });
        entries.push({
          name,
          path: fullPath,
          size: metadata.size,
          isDirectory: metadata.isDir,
          modified: metadata.modified,
          created: metadata.created,
        });
      } catch {
        // 如果获取元数据失败，跳过该文件
        entries.push({
          name,
          path: fullPath,
          size: 0,
          isDirectory: false,
          modified: null,
          created: null,
        });
      }
    }

    const result: FileOperationResult = {
      success: true,
      message: `成功列出目录: ${path}（${entries.length} 个条目）`,
      data: { entries },
    };

    recordLog("listDirectory", { path }, result);
    return result;
  } catch (error: any) {
    return buildErrorResult("listDirectory", { path }, error, "列出目录失败");
  }
}

/**
 * 应用 Search/Replace Diff
 * 直接复用 web-canvas 的 applySearchReplaceDiff 算法
 */
export async function applyDiff(
  path: string,
  search: string,
  replace: string,
  startLine?: number
): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    // 读取原始文件内容
    const originalContent = await invoke<string>("read_text_file_force", {
      path,
    });

    // 创建换行符辅助工具
    const lineHelper = createLineEndingHelper(originalContent);

    // 归一化换行符
    const normalizedContent = lineHelper.normalize(originalContent);
    const normalizedSearch = lineHelper.normalize(search);
    const normalizedReplace = lineHelper.normalize(replace);

    // 直接复用 web-canvas 的 Diff 引擎
    const { applySearchReplaceDiff } = await import("../web-canvas/utils/diff");
    const diffResult = applySearchReplaceDiff(
      normalizedContent,
      normalizedSearch,
      normalizedReplace,
      {
        startLine,
      }
    );

    // 还原换行符
    const finalContent = lineHelper.restore(diffResult.content);

    // 写入文件
    await invoke("write_text_file_force", { path, content: finalContent });

    const result: FileOperationResult = {
      success: true,
      message: `成功应用 Diff 到文件: ${path}（策略: ${diffResult.strategy}，行 ${diffResult.matchRange[0]}-${diffResult.matchRange[1]}）`,
      data: {
        strategy: diffResult.strategy,
        confidence: diffResult.confidence,
        matchRange: diffResult.matchRange,
        warnings: diffResult.warnings,
      },
    };

    recordLog(
      "applyDiff",
      {
        path,
        searchLength: search.length,
        replaceLength: replace.length,
        startLine,
      },
      result
    );
    return result;
  } catch (error: any) {
    return buildErrorResult(
      "applyDiff",
      {
        path,
        searchLength: search.length,
        replaceLength: replace.length,
        startLine,
      },
      error,
      "应用 Diff 失败"
    );
  }
}

/**
 * 创建目录
 */
export async function createDirectory(
  path: string
): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    await invoke("create_dir_force", { path });

    const result: FileOperationResult = {
      success: true,
      message: `成功创建目录: ${path}`,
    };

    recordLog("createDirectory", { path }, result);
    return result;
  } catch (error: any) {
    return buildErrorResult("createDirectory", { path }, error, "创建目录失败");
  }
}

/**
 * 检查路径是否存在
 */
export async function pathExists(path: string): Promise<FileOperationResult> {
  try {
    await ensureInitialized();
    validatePath(path, currentConfig);

    const exists = await invoke<boolean>("path_exists", { path });

    const result: FileOperationResult = {
      success: true,
      message: exists ? `路径存在: ${path}` : `路径不存在: ${path}`,
      data: { exists },
    };

    return result;
  } catch (error: any) {
    return buildErrorResult("pathExists", { path }, error, "检查路径失败");
  }
}
