import type { PresetIconInfo } from "../types/model-metadata";

/**
 * 手动维护的精选图标列表
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  {
    name: "OpenAI",
    path: "openai.svg",
    suggestedFor: ["openai", "gpt", "chatgpt"],
    category: "国际 AI",
  },
  {
    name: "Claude (彩色)",
    path: "claude-color.svg",
    suggestedFor: ["claude"],
    category: "国际 AI",
  },
  {
    name: "Gemini (彩色)",
    path: "gemini-color.svg",
    suggestedFor: ["gemini"],
    category: "国际 AI",
  },
  {
    name: "DeepSeek (彩色)",
    path: "deepseek-color.svg",
    suggestedFor: ["deepseek"],
    category: "国内 AI",
  },
  {
    name: "通义千问 (彩色)",
    path: "qwen-color.svg",
    suggestedFor: ["qwen", "tongyi"],
    category: "国内 AI",
  },
];