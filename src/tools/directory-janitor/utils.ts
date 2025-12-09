import { homeDir } from "@tauri-apps/api/path";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("tools/directory-janitor/utils");

/**
 * 格式化字节数
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * 格式化时间（显示多久之前）
 */
export const formatAge = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - timestamp;
  const ageDays = Math.floor(ageSeconds / 86400);

  if (ageDays === 0) {
    const ageHours = Math.floor(ageSeconds / 3600);
    return ageHours === 0 ? "刚刚" : `${ageHours} 小时前`;
  } else if (ageDays < 30) {
    return `${ageDays} 天前`;
  } else if (ageDays < 365) {
    return `${Math.floor(ageDays / 30)} 个月前`;
  } else {
    return `${Math.floor(ageDays / 365)} 年前`;
  }
};

/**
 * 格式化当前路径显示
 */
export const formatCurrentPath = (path: string | undefined): string => {
  if (!path || path.length <= 50) return path || "";
  return "..." + path.substring(path.length - 47);
};

/**
 * 解析路径中的环境变量
 * 支持 Windows 环境变量格式：%VAR%
 * 支持 Unix 环境变量格式：$VAR 或 ${VAR}
 */
export const resolveEnvPath = async (path: string): Promise<string> => {
  if (!path) return path;

  let resolvedPath = path;

  // Windows 环境变量替换
  if (resolvedPath.includes("%")) {
    try {
      const home = await homeDir();
      const homePath = home?.replace(/[/\\]$/, "") || "";

      // %AppData% -> C:/Users/xxx/AppData/Roaming
      // 注意：不能使用 appDataDir()，因为它返回应用自己的目录
      if (resolvedPath.includes("%AppData%")) {
        const appDataPath = `${homePath}/AppData/Roaming`;
        resolvedPath = resolvedPath.replace(/%AppData%/gi, appDataPath);
      }

      // %LocalAppData% -> C:/Users/xxx/AppData/Local
      if (resolvedPath.includes("%LocalAppData%")) {
        const localAppDataPath = `${homePath}/AppData/Local`;
        resolvedPath = resolvedPath.replace(/%LocalAppData%/gi, localAppDataPath);
      }

      // %UserProfile% 或 %HOME% -> 用户主目录
      if (resolvedPath.includes("%UserProfile%") || resolvedPath.includes("%HOME%")) {
        resolvedPath = resolvedPath.replace(/%UserProfile%/gi, homePath);
        resolvedPath = resolvedPath.replace(/%HOME%/gi, homePath);
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: "解析环境变量失败", showToUser: false });
    }
  }

  // Unix 环境变量替换（$HOME, ${HOME}）
  if (resolvedPath.includes("$")) {
    try {
      if (resolvedPath.includes("$HOME") || resolvedPath.includes("${HOME}")) {
        const home = await homeDir();
        const homePath = home?.replace(/[/\\]$/, "") || "";
        resolvedPath = resolvedPath.replace(/\$HOME/g, homePath);
        resolvedPath = resolvedPath.replace(/\$\{HOME\}/g, homePath);
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: "解析环境变量失败", showToUser: false });
    }
  }

  // 规范化路径分隔符为正斜杠
  resolvedPath = resolvedPath.replace(/\\/g, "/");

  return resolvedPath;
};