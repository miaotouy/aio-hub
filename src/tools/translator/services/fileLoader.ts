import { readFile } from "@tauri-apps/plugin-fs";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { detectMimeTypeFromBuffer, isTextFile } from "@/utils/fileTypeDetector";
import { smartDecode } from "@/utils/encoding";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";

const logger = createModuleLogger("tools/translator/file-loader");
const errorHandler = createModuleErrorHandler("tools/translator/file-loader");

/** 加载成功的文件信息 */
export interface LoadedFile {
  /** 文件绝对路径 */
  path: string;
  /** 文件名（含扩展名） */
  fileName: string;
  /** 解码后的文本内容 */
  content: string;
  /** 检测到的 MIME 类型 */
  mimeType: string;
  /** 文件原始字节大小 */
  byteSize: number;
}

/** 加载选项 */
export interface LoadFileOptions {
  /**
   * 字符数超过此值时调 onLargeFileConfirm 询问；
   * 不传则跳过大文件确认。
   */
  largeFileCharThreshold?: number;
  /**
   * 大文件二次确认回调。
   * 返回 false 表示用户取消加载。
   */
  onLargeFileConfirm?: (info: {
    fileName: string;
    charCount: number;
  }) => Promise<boolean>;
}

/** 常见文本扩展名（仅用于文件对话框的快速过滤分组） */
const COMMON_TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "htm",
  "csv",
  "tsv",
  "log",
  "ini",
  "conf",
  "cfg",
  "env",
  "srt",
  "vtt",
  "ass",
  "ssa",
  "lrc",
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "kt",
  "swift",
  "php",
  "lua",
  "sh",
  "bash",
  "ps1",
  "sql",
  "css",
  "scss",
  "less",
  "vue",
];

/** 从路径提取文件名（兼容正反斜杠） */
function getFileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/**
 * 翻译工作台的文件加载器。
 *
 * 职责：
 * - 用项目级 [`detectMimeTypeFromBuffer`](src/utils/fileTypeDetector.ts) + [`isTextFile`](src/utils/fileTypeDetector.ts) 判定是否文本；
 * - 用 [`smartDecode`](src/utils/encoding.ts) 处理 UTF-8 / GBK / UTF-16 等编码；
 * - 二进制文件直接拒绝并提示；
 * - 大文件通过回调让 UI 层决定是否继续。
 *
 * 注意：本工厂函数 **不依赖** Pinia store / 响应式状态 / 生命周期，
 * 是纯 IO 服务（位于 `services/`），调用方负责处理 UI 副作用。
 * 保留 `useXxx` 命名是为了让组件调用方风格统一；内部实现里没有任何
 * `ref` / `onXxx` 钩子。
 */
export function useTranslatorFileLoader() {
  /**
   * 从指定路径加载文件为文本。
   *
   * @returns 成功返回 LoadedFile；失败或被用户取消返回 null（已自行给用户反馈）
   */
  async function loadTextFromPath(
    filePath: string,
    options: LoadFileOptions = {}
  ): Promise<LoadedFile | null> {
    const fileName = getFileNameFromPath(filePath);

    // 1. 读取文件内容
    const buffer = await errorHandler.wrapAsync(
      async () => readFile(filePath),
      {
        userMessage: "读取文件失败，请确认文件存在且可访问",
        context: { filePath },
      }
    );
    if (buffer === null) return null;

    // 2. 检测 MIME + 是否文本
    const mimeType = await detectMimeTypeFromBuffer(buffer, fileName);
    const isText = isTextFile(fileName, mimeType);

    if (!isText) {
      logger.info("拒绝非文本文件", { fileName, mimeType });
      customMessage.warning(
        `「${fileName}」不是文本文件（${mimeType}），无法作为翻译输入`
      );
      return null;
    }

    // 3. 解码为字符串
    let content: string;
    try {
      content = smartDecode(buffer);
    } catch (error) {
      errorHandler.error(error, `「${fileName}」无法解码为有效文本`, {
        fileName,
        mimeType,
      });
      return null;
    }

    if (content.length === 0) {
      customMessage.warning(`「${fileName}」是空文件`);
      return null;
    }

    // 4. 大文件二次确认
    const threshold = options.largeFileCharThreshold;
    if (
      threshold !== undefined &&
      content.length > threshold &&
      options.onLargeFileConfirm
    ) {
      const confirmed = await options.onLargeFileConfirm({
        fileName,
        charCount: content.length,
      });
      if (!confirmed) return null;
    }

    logger.info("文件加载成功", {
      fileName,
      mimeType,
      byteSize: buffer.length,
      charCount: content.length,
    });

    return {
      path: filePath,
      fileName,
      content,
      mimeType,
      byteSize: buffer.length,
    };
  }

  /**
   * 弹出系统文件选择对话框，选中后加载为文本。
   *
   * 对话框带「常见文本文件」和「所有文件」两组过滤器，
   * 默认显示「常见文本文件」，姐姐可手动切到「所有文件」选任意路径。
   */
  async function pickAndLoad(
    options: LoadFileOptions = {}
  ): Promise<LoadedFile | null> {
    const filePath = await errorHandler.wrapAsync(
      async () => {
        const result = await openDialog({
          multiple: false,
          directory: false,
          filters: [
            { name: "常见文本文件", extensions: COMMON_TEXT_EXTENSIONS },
            { name: "所有文件", extensions: ["*"] },
          ],
        });
        if (!result) return null;
        if (typeof result === "string") return result;
        if (Array.isArray(result)) return result[0] ?? null;
        const maybeObj = result as unknown as { path?: string };
        return maybeObj.path ?? null;
      },
      { userMessage: "打开文件失败" }
    );
    if (!filePath) return null;
    return loadTextFromPath(filePath, options);
  }

  return {
    loadTextFromPath,
    pickAndLoad,
  };
}
