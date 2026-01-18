/**
 * 预设图标配置 (移动端 - 复用桌面端配置)
 */

import type { PresetIconInfo } from "../types/model-metadata";
import { MANUAL_PRESET_ICONS, USER_ADDED_ICONS } from "@shared/config/preset-icons-data";

/**
 * 所有可用图标的路径列表
 */
export const AVAILABLE_ICONS = [
  ...new Set([
    ...MANUAL_PRESET_ICONS.map(i => i.path),
    ...USER_ADDED_ICONS.map(i => i.path),
  ]),
].sort();

/**
 * 规范化预设图标路径，确保都带有 /model-icons/ 前缀
 */
function ensureModelIconPrefix(icons: any[]): PresetIconInfo[] {
  const PRESET_PREFIX = "/model-icons/";
  return icons.map((icon) => ({
    ...icon,
    path: icon.path.startsWith("/") ? icon.path : `${PRESET_PREFIX}${icon.path}`,
  })) as unknown as PresetIconInfo[];
}

/**
 * 最终导出的预设图标列表
 */
export const PRESET_ICONS: PresetIconInfo[] = ensureModelIconPrefix([
  ...MANUAL_PRESET_ICONS,
  ...USER_ADDED_ICONS,
]);