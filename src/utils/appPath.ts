import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { createModuleLogger } from "./logger";

const logger = createModuleLogger("AppPath");

let cachedConfigDir: string | null = null;

/**
 * 获取应用配置目录 (AppData)
 * 
 * 这是一个支持便携模式的路径获取函数。
 * 它会优先尝试通过后端命令获取路径，如果失败则回退到 Tauri 默认的 appDataDir()。
 */
export async function getAppConfigDir(): Promise<string> {
  if (cachedConfigDir) {
    return cachedConfigDir;
  }

  try {
    // 尝试调用后端命令获取支持便携模式的路径
    const configDir = await invoke<string>("get_app_config_dir");
    cachedConfigDir = configDir;
    logger.debug("已通过后端获取应用配置目录", { path: configDir });
    return configDir;
  } catch (error) {
    logger.warn("通过后端获取应用配置目录失败，将使用默认路径", error);
    const defaultDir = await appDataDir();
    cachedConfigDir = defaultDir;
    return defaultDir;
  }
}