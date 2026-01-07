/**
 * 移动端路径管理工具
 */
import { appDataDir, join } from "@tauri-apps/api/path";

/**
 * 获取应用数据目录根路径
 */
export async function getAppConfigDir(): Promise<string> {
  return await appDataDir();
}

/**
 * 获取模块目录路径
 * @param moduleName 模块名称
 */
export async function getModuleDir(moduleName: string): Promise<string> {
  const baseDir = await getAppConfigDir();
  return await join(baseDir, moduleName);
}