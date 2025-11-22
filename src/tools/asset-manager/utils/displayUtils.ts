import type { AssetOrigin, AssetType } from "@/types/asset-management";
import { useToolsStore } from "@/stores/tools";

/**
 * 获取资产类型的显示标签
 */
export const getTypeLabel = (type: AssetType): string => {
  const labels: Record<AssetType, string> = {
    image: "图片",
    video: "视频",
    audio: "音频",
    document: "文档",
    other: "其他",
  };
  return labels[type] || type;
};

/**
 * 获取来源方式的显示标签
 */
export const getOriginLabel = (type: string): string => {
  const labels: Record<string, string> = {
    local: "本地",
    clipboard: "剪贴板",
    network: "网络",
  };
  return labels[type] || type;
};

/**
 * 获取来源模块的显示标签
 * 尝试从 tools store 中查找匹配的工具名称
 */
export const getSourceModuleLabel = (module: string): string => {
  const toolsStore = useToolsStore();
  
  // tool.path 通常是 '/module-name' 格式，而 module 是 'module-name'
  const tool = toolsStore.tools.find((t) => t.path === `/${module}` || t.path === module);
  if (tool) {
    return tool.name;
  }

  // 后备硬编码映射（用于未在 tools store 中注册的模块或特殊模块）
  const fallbackLabels: Record<string, string> = {
    "asset-manager": "资产库",
    "llm-chat": "LLM 聊天",
    "smart-ocr": "智能 OCR",
    "unknown": "未知模块"
  };
  
  if (fallbackLabels[module]) {
    return fallbackLabels[module];
  }

  // 将 kebab-case 转换为友好的标题
  return module
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * 获取资产来源的完整显示文本
 * 格式: "模块名 · 来源方式" 或 "来源方式"
 */
export const getOriginDisplayText = (origin: AssetOrigin): string => {
  const typeLabel = getOriginLabel(origin.type);

  if (!origin.sourceModule || origin.sourceModule === "asset-manager" || origin.sourceModule === "unknown") {
    return typeLabel;
  }

  const moduleLabel = getSourceModuleLabel(origin.sourceModule);
  return `${moduleLabel} · ${typeLabel}`;
};