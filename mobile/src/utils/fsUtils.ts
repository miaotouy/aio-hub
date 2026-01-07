/**
 * 移动端文件系统操作工具
 * 封装 @tauri-apps/plugin-fs，提供更便捷的 API
 */

import { 
  exists, 
  mkdir, 
  remove, 
  readTextFile, 
  writeTextFile, 
  readDir,
  BaseDirectory 
} from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "./logger";
import { createModuleErrorHandler } from "./errorHandler";

const logger = createModuleLogger("FsUtils");
const errorHandler = createModuleErrorHandler("FsUtils");

/**
 * 确保目录存在（递归创建）
 */
export async function ensureDir(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<void> {
  try {
    if (!(await exists(path, { baseDir }))) {
      await mkdir(path, { recursive: true, baseDir });
      logger.debug(`创建目录: ${path}`);
    }
  } catch (error) {
    errorHandler.handle(error as Error, { 
      userMessage: "创建目录失败", 
      context: { path },
      showToUser: false 
    });
    throw error;
  }
}

/**
 * 安全写入文本文件（自动创建目录）
 */
export async function safeWriteTextFile(
  path: string, 
  contents: string, 
  baseDir: BaseDirectory = BaseDirectory.AppData
): Promise<void> {
  try {
    // 提取父目录
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      const parentDir = path.substring(0, lastSlash);
      await ensureDir(parentDir, baseDir);
    }
    
    await writeTextFile(path, contents, { baseDir });
    logger.debug(`文件写入成功: ${path}`);
  } catch (error) {
    errorHandler.handle(error as Error, { 
      userMessage: "写入文件失败", 
      context: { path },
      showToUser: false 
    });
    throw error;
  }
}

/**
 * 安全读取文本文件
 */
export async function safeReadTextFile(
  path: string, 
  baseDir: BaseDirectory = BaseDirectory.AppData
): Promise<string | null> {
  try {
    if (await exists(path, { baseDir })) {
      return await readTextFile(path, { baseDir });
    }
    return null;
  } catch (error) {
    errorHandler.handle(error as Error, { 
      userMessage: "读取文件失败", 
      context: { path },
      showToUser: false 
    });
    return null;
  }
}

/**
 * 删除文件或目录
 */
export async function safeRemove(
  path: string, 
  recursive: boolean = true,
  baseDir: BaseDirectory = BaseDirectory.AppData
): Promise<void> {
  try {
    if (await exists(path, { baseDir })) {
      await remove(path, { recursive, baseDir });
      logger.info(`删除成功: ${path}`);
    }
  } catch (error) {
    errorHandler.handle(error as Error, { 
      userMessage: "删除失败", 
      context: { path },
      showToUser: false 
    });
    throw error;
  }
}

/**
 * 扫描目录下的子项
 */
export async function safeReadDir(
  path: string,
  baseDir: BaseDirectory = BaseDirectory.AppData
) {
  try {
    if (await exists(path, { baseDir })) {
      return await readDir(path, { baseDir });
    }
    return [];
  } catch (error) {
    errorHandler.handle(error as Error, { 
      userMessage: "读取目录失败", 
      context: { path },
      showToUser: false 
    });
    return [];
  }
}