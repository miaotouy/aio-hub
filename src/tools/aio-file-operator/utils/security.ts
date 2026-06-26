/**
 * 路径安全校验工具
 * 用于防止 AI 通过路径穿越攻击访问用户敏感文件
 */
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("AioFileOperator/Security");

/**
 * 标准化路径：将路径转换为绝对路径，并处理 `..`、`.`、斜杠方向等
 */
function normalizePath(path: string): string {
  // 替换反斜杠为正斜杠
  let normalized = path.replace(/\\/g, "/");

  // 处理相对路径
  if (!normalized.startsWith("/") && !normalized.match(/^[A-Za-z]:\//)) {
    // 相对路径，需要转换为绝对路径
    // 这里我们使用 path.resolve 来处理
    // 但由于我们在浏览器环境，使用一个简单的实现
    normalized = resolveRelativePath(normalized);
  }

  // 处理 .. 和 . 路径穿越
  const parts = normalized.split("/");
  const result: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      }
    } else if (part !== "." && part !== "") {
      result.push(part);
    }
  }

  // 保留盘符（Windows）
  const driveMatch = normalized.match(/^([A-Za-z]:)/);
  if (driveMatch) {
    return driveMatch[1] + "/" + result.slice(1).join("/");
  }

  return "/" + result.join("/");
}

/**
 * 简单的相对路径解析（浏览器环境）
 */
function resolveRelativePath(path: string): string {
  // 如果是 Windows 绝对路径（如 C:/xxx），直接返回
  if (path.match(/^[A-Za-z]:\//)) {
    return path;
  }
  // 如果是 Unix 绝对路径，直接返回
  if (path.startsWith("/")) {
    return path;
  }
  // 相对路径，我们无法确定当前工作目录，直接返回
  // 实际使用时，调用方应传入绝对路径
  return path;
}

/**
 * 获取用户主目录路径
 * 在 Tauri 环境下，通过 document_dir 等获取
 */
export function getUserHomeDir(): string {
  // 在 Tauri 环境下，通过环境变量获取
  // 注意：这里只是一个 fallback，实际路径由 Rust 侧提供
  return process.env.USERPROFILE || process.env.HOME || "";
}

/**
 * 校验目标路径是否在允许的目录列表中
 * @param targetPath 目标路径（绝对路径）
 * @param allowedDirectories 允许的目录列表
 * @returns 如果路径安全返回 true，否则抛出错误
 */
export function validatePath(
  targetPath: string,
  allowedDirectories: string[]
): boolean {
  const normalizedTarget = normalizePath(targetPath);

  // 检查是否在允许的目录列表中
  for (const dir of allowedDirectories) {
    const normalizedDir = normalizePath(dir);
    if (normalizedTarget.startsWith(normalizedDir)) {
      return true;
    }
  }

  logger.warn("路径安全校验失败", {
    targetPath,
    normalizedTarget,
    allowedDirectories,
  });

  throw new Error(
    `路径安全校验失败：不允许访问 "${targetPath}"。请确保路径在允许的沙箱目录中。`
  );
}

/**
 * 校验文件大小是否在限制范围内
 * @param size 文件大小（字节）
 * @param maxSize 最大允许大小（字节）
 * @returns 如果安全返回 true，否则抛出错误
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  if (size > maxSize) {
    throw new Error(
      `文件大小超过限制：${(size / 1024 / 1024).toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(2)}MB`
    );
  }
  return true;
}
