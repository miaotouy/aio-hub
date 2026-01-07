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
 * 最终导出的预设图标列表
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  ...MANUAL_PRESET_ICONS,
  ...USER_ADDED_ICONS,
] as unknown as PresetIconInfo[];