import { useDownloadStore } from "@/stores/downloadStore";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { sanitizeFilename } from "@/utils/fileUtils";
import { writeTextFile, writeFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join, dirname } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { emit } from "@tauri-apps/api/event";
import { customMessage } from "@/utils/customMessage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DOWNLOAD_EVENTS, type DownloadCompletedPayload } from "@/types/download";

const logger = createModuleLogger("useFileDownload");
const errorHandler = createModuleErrorHandler("useFileDownload");

export interface DownloadOptions {
  /** 下载内容 */
  content: string | Blob | Uint8Array;
  /** 文件名 */
  filename: string;
  /** 下载模式：auto (静默下载到下载目录) | manual (另存为对话框) */
  mode?: "auto" | "manual";
  /** 内容类型：text (文本) | binary (二进制) */
  type?: "text" | "binary";
  /** 是否在下载前检查文件是否存在并自动重命名（仅 auto 模式） */
  autoRename?: boolean;
}

/**
 * 核心下载逻辑 Composable
 */
export function useFileDownload() {
  const downloadStore = useDownloadStore();
  const appSettingsStore = useAppSettingsStore();

  /**
   * 获取不冲突的文件名
   */
  const getUniquePath = async (dir: string, filename: string): Promise<string> => {
    let targetPath = await join(dir, filename);
    if (!(await exists(targetPath))) {
      return targetPath;
    }

    const dotIndex = filename.lastIndexOf(".");
    const name = dotIndex !== -1 ? filename.substring(0, dotIndex) : filename;
    const ext = dotIndex !== -1 ? filename.substring(dotIndex) : "";

    let counter = 1;
    while (true) {
      const newFilename = `${name} (${counter})${ext}`;
      targetPath = await join(dir, newFilename);
      if (!(await exists(targetPath))) {
        return targetPath;
      }
      counter++;
      if (counter > 1000) break; // 防止死循环
    }
    return targetPath;
  };

  /**
   * 下载文件
   */
  const downloadFile = async (options: DownloadOptions) => {
    const { content, filename: rawFilename, mode = "auto", type: forcedType, autoRename = true } = options;

    const filename = sanitizeFilename(rawFilename);
    let finalPath = "";
    let isCancelled = false;

    try {
      const downloadSettings = appSettingsStore.settings.download;
      const effectiveMode = downloadSettings?.alwaysAskSavePath ? "manual" : mode;

      // 1. 确定保存路径
      if (effectiveMode === "manual") {
        const selectedPath = await save({
          defaultPath: filename,
        });
        if (!selectedPath) {
          isCancelled = true;
          return null;
        }
        finalPath = selectedPath;
      } else {
        const baseDir = downloadSettings?.defaultDownloadPath || (await downloadDir());
        if (autoRename) {
          finalPath = await getUniquePath(baseDir, filename);
        } else {
          finalPath = await join(baseDir, filename);
        }
      }

      // 2. 确保目录存在
      const parentDir = await dirname(finalPath);
      if (parentDir && !(await exists(parentDir))) {
        await mkdir(parentDir, { recursive: true });
      }

      // 3. 准备内容和类型
      let data: string | Uint8Array;
      let type: "text" | "binary" = forcedType || "text";

      if (content instanceof Blob) {
        data = new Uint8Array(await content.arrayBuffer());
        type = "binary";
      } else if (content instanceof Uint8Array) {
        data = content;
        type = "binary";
      } else {
        data = content;
        // 如果没有强制指定类型，且内容是字符串，默认为 text
        type = forcedType || "text";
      }

      // 3. 记录初始状态到 Store
      const record = await downloadStore.addDownload({
        filename: filename,
        filepath: finalPath,
        size: data instanceof Uint8Array ? data.length : new TextEncoder().encode(data).length,
        status: "pending",
      });

      // 4. 执行写入
      try {
        if (type === "text") {
          await writeTextFile(finalPath, data as string);
        } else {
          await writeFile(finalPath, data as Uint8Array);
        }

        // 5. 更新 Store 状态
        await downloadStore.updateStatus(record.id, "success");

        // 6. 发出全局事件（替代原来的 notification.success）
        const payload: DownloadCompletedPayload = {
          id: record.id,
          filename: filename,
          filepath: finalPath,
          size: record.size,
          status: "success",
          timestamp: Date.now(),
          sourceWindow: await getCurrentWindow().label,
        };

        await emit(DOWNLOAD_EVENTS.COMPLETED, payload);

        // 7. 根据设置显示通知
        if (downloadSettings?.showNotification) {
          customMessage.success(`文件下载成功: ${filename}`);
        }

        // 8. 根据设置自动打开文件夹
        if (downloadSettings?.openFolderAfterDownload) {
          await openDownloadFolder(finalPath);
        }

        logger.info("文件下载成功", { filename, path: finalPath });
        return finalPath;
      } catch (writeError) {
        await downloadStore.updateStatus(record.id, "failed", (writeError as Error).message);
        throw writeError;
      }
    } catch (error) {
      if (isCancelled) return null;

      errorHandler.error(error as Error, "下载文件失败", { filename, mode });
      return null;
    }
  };

  /**
   * 打开文件所在文件夹并选中
   */
  const openDownloadFolder = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "无法打开文件夹",
        context: { path },
      });
    }
  };

  return {
    downloadFile,
    openDownloadFolder,
  };
}
