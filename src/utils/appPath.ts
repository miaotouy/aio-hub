import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
// 注意：此文件不能导入 logger.ts，因为 logger.ts 依赖本文件（会造成循环依赖导致 TDZ 错误）
// 使用 console.log/warn 代替

let cachedConfigDir: string | null = null;
// Promise 缓存：防止并发调用时多次触发后端请求
let pendingPromise: Promise<string> | null = null;

/**
 * 获取应用配置目录 (AppData)
 *
 * 这是一个支持便携模式的路径获取函数。
 * 它会优先尝试通过后端命令获取路径，如果失败则回退到 Tauri 默认的 appDataDir()。
 * 使用 Promise 缓存确保并发调用只触发一次后端请求。
 */
export async function getAppConfigDir(): Promise<string> {
  if (cachedConfigDir) {
    return cachedConfigDir;
  }
  if (pendingPromise) {
    return pendingPromise;
  }

  pendingPromise = (async () => {
    try {
      const configDir = await invoke<string>("get_app_config_dir");
      cachedConfigDir = configDir;
      console.debug("[AppPath] 已通过后端获取应用配置目录", { path: configDir });
      return configDir;
    } catch (error) {
      console.warn("[AppPath] 通过后端获取应用配置目录失败，将使用默认路径", error);
      const defaultDir = await appDataDir();
      cachedConfigDir = defaultDir;
      return defaultDir;
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}
