/**
 * 预设图标配置
 * 
 * 这个文件定义了所有可用的预设图标信息。
 * 图标按分类组织，用于在 UI 中展示可选的预设图标。
 */

import type { PresetIconInfo } from "../types/model-metadata";
import { MANUAL_PRESET_ICONS, USER_ADDED_ICONS } from "./preset-icons-data";

// 获取库中的所有图标名
// 使用 alias @lobe-icons 替代相对路径，更健壮
const lobeIcons = import.meta.glob("@lobe-icons/*.svg", {
  eager: true,
  query: "?raw",
});

// 获取本地自定义图标名
// 使用 ?url 显式告知 Vite 我们只需要这些资源的 URL 路径，避免 "cannot be imported" 警告
const localIcons = import.meta.glob("../../public/model-icons/*.{svg,png,jpg,webp}", {
  eager: true,
  query: "?url",
});

export const LOBE_ICONS_MAP = Object.entries(lobeIcons).reduce((acc, [path, content]) => {
  const name = path.split("/").pop()!;
  const svgContent = (content as any).default;
  // 同时支持纯文件名和带路径的完整名作为 Key
  acc[name] = svgContent;
  acc[`/model-icons/${name}`] = svgContent;
  return acc;
}, {} as Record<string, string>);

export const LOCAL_ICONS_MAP = Object.entries(localIcons).reduce((acc, [path, _content]) => {
  const name = path.split("/").pop()!;
  const publicPath = `/model-icons/${name}`;
  // 同时支持纯文件名和带路径的完整名作为 Key
  acc[name] = publicPath;
  acc[publicPath] = publicPath;
  return acc;
}, {} as Record<string, string>);

/**
 * 所有可用图标的列表（动态生成）
 */
export const AVAILABLE_ICONS = [
  ...new Set([
    ...Object.keys(LOBE_ICONS_MAP),
    ...Object.keys(LOCAL_ICONS_MAP),
  ]),
].sort();

/**
 * 自动生成其他图标列表
 * 过滤掉已经在手动列表中存在的图标
 */
const manualPaths = new Set([
  ...MANUAL_PRESET_ICONS.map((i) => i.path),
  ...USER_ADDED_ICONS.map((i) => i.path),
]);

const autoIcons: PresetIconInfo[] = AVAILABLE_ICONS.filter(
  (path) => !manualPaths.has(path)
).map((path) => {
  // 简单的名称处理
  // 1. 移除扩展名
  let name = path.replace(/\.[^/.]+$/, "");

  // 2. 将连字符替换为空格，保留完整语义以区分不同变体（如 color, text）
  name = name.replace(/-/g, " ");

  // 3. 每个单词首字母大写 (Title Case)
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());

  // 4. 特殊处理：将常见的 Color, Text 等词加上括号，使其更像变体说明（可选，视审美而定，这里选择直接展示更清晰）
  // 例如: "Openai Color" vs "Openai"

  return {
    name: name,
    path: path,
    suggestedFor: [],
    category: "未分类图标", // 统一归类到新分类
  };
});

/**
 * 规范化预设图标路径，确保都带有 /model-icons/ 前缀
 */
function ensureModelIconPrefix(icons: PresetIconInfo[]): PresetIconInfo[] {
  const PRESET_PREFIX = "/model-icons/";
  return icons.map((icon) => ({
    ...icon,
    path: icon.path.startsWith("/") ? icon.path : `${PRESET_PREFIX}${icon.path}`,
  }));
}

/**
 * 最终导出的预设图标列表（包含手动精选、用户自建和自动生成的）
 */
export const PRESET_ICONS: PresetIconInfo[] = ensureModelIconPrefix([
  ...MANUAL_PRESET_ICONS,
  ...USER_ADDED_ICONS,
  ...autoIcons,
]);