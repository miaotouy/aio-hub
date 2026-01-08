/**
 * 模型能力配置
 *
 * 定义了所有可用的模型能力及其展示信息，包括：
 * - UI 展示标签和描述
 * - 图标组件引用（Lucide Icons）
 * - 图标颜色和样式
 */

import { markRaw, type Component } from "vue";
import {
  Eye,
  BrainCircuit,
  Globe,
  Blocks,
  Terminal,
  FileSearch,
  Image,
  Mic,
  Video,
  Music,
  Layers,
  ListOrdered,
  Monitor,
  FileText,
  Code2,
  MessageSquareMore,
  Braces,
} from "lucide-vue-next";
import type { ModelCapabilities } from "../types/common";

/**
 * 能力配置项
 */
export interface CapabilityConfig {
  /** 能力键名（对应 LlmModelInfo.capabilities 中的字段） */
  key: keyof ModelCapabilities;
  /** 显示标签 */
  label: string;
  /** 能力描述 */
  description: string;
  /** 图标组件（markRaw 包裹的 Vue 组件） */
  icon?: Component;
  /** 图标颜色（CSS 颜色值） */
  color?: string;
  /** CSS 类名（用于自定义样式） */
  className?: string;
}

/**
 * 所有可用的模型能力配置
 *
 * 这些配置用于：
 * 1. UI 中展示能力选项（如模型编辑对话框）
 * 2. 模型列表中显示能力图标和提示
 * 3. 提供能力的统一说明文本
 * 4. 确保能力定义与类型系统保持同步
 */
export const MODEL_CAPABILITIES: readonly CapabilityConfig[] = [
  {
    key: "vision",
    label: "视觉",
    description: "支持图像输入 (Vision Language Model)",
    icon: markRaw(Eye),
    color: "#0ea5e9",
    className: "vision",
  },
  {
    key: "thinking",
    label: "思考",
    description: "启用模型的'思考'或'推理'模式，以进行更复杂的分析和推理。",
    icon: markRaw(BrainCircuit),
    color: "#a855f7",
    className: "thinking",
  },
  {
    key: "webSearch",
    label: "联网",
    description: "支持实时联网搜索获取最新信息",
    icon: markRaw(Globe),
    color: "#10b981",
    className: "web-search",
  },
  {
    key: "toolUse",
    label: "工具",
    description: "支持 Function Calling / Tool Use",
    icon: markRaw(Blocks),
    color: "#f97316",
    className: "tool-use",
  },
  {
    key: "codeExecution",
    label: "代码",
    description: "支持代码解释器执行代码",
    icon: markRaw(Terminal),
    color: "#3b82f6",
    className: "code-exec",
  },
  {
    key: "imageGeneration",
    label: "图像生成",
    description: "支持文本到图像的生成",
    icon: markRaw(Image),
    color: "#f43f5e",
    className: "image-gen",
  },
  {
    key: "videoGeneration",
    label: "视频生成",
    description: "支持文本到视频的生成",
    icon: markRaw(Video),
    color: "#8b5cf6",
    className: "video-gen",
  },
  {
    key: "musicGeneration",
    label: "音乐生成",
    description: "支持文本到音乐的生成",
    icon: markRaw(Music),
    color: "#d946ef",
    className: "music-gen",
  },
  {
    key: "audio",
    label: "音频",
    description: "支持音频输入或输出",
    icon: markRaw(Mic),
    color: "#06b6d4",
    className: "audio",
  },
  {
    key: "video",
    label: "视频",
    description: "支持视频输入",
    icon: markRaw(Video),
    color: "#8b5cf6",
    className: "video",
  },
  {
    key: "document",
    label: "文档",
    description: "支持原生文档格式处理 (如 PDF)",
    icon: markRaw(FileText),
    color: "#ef4444",
    className: "document",
  },
  {
    key: "computerUse",
    label: "计算机",
    description: "支持模拟用户操作计算机 (Computer Use)",
    icon: markRaw(Monitor),
    color: "#6366f1",
    className: "computer-use",
  },
  {
    key: "fileSearch",
    label: "文件",
    description: "支持文件搜索和分析功能",
    icon: markRaw(FileSearch),
    color: "#eab308",
    className: "file-search",
  },
  {
    key: "jsonOutput",
    label: "JSON",
    description: "支持强制输出 JSON 对象格式",
    icon: markRaw(Braces),
    color: "#f59e0b",
    className: "json-output",
  },
  {
    key: "fim",
    label: "FIM",
    description: "支持 Fill In The Middle 补全，用于代码补全等场景",
    icon: markRaw(Code2),
    color: "#22c55e",
    className: "fim",
  },
  {
    key: "prefixCompletion",
    label: "续写",
    description: "支持对话前缀续写，可从指定前缀继续生成",
    icon: markRaw(MessageSquareMore),
    color: "#0891b2",
    className: "prefix-completion",
  },
  {
    key: "embedding",
    label: "嵌入",
    description: "支持生成文本嵌入向量 (Embedding)",
    icon: markRaw(Layers),
    color: "#64748b",
    className: "embedding",
  },
  {
    key: "rerank",
    label: "重排",
    description: "支持对文档或结果进行重排序 (Rerank)",
    icon: markRaw(ListOrdered),
    color: "#14b8a6",
    className: "rerank",
  },
] as const;

/**
 * 根据能力键获取配置信息
 * @param key 能力键
 * @returns 能力配置或 undefined
 */
export function getCapabilityConfig(key: string): CapabilityConfig | undefined {
  return MODEL_CAPABILITIES.find((c) => c.key === key);
}

/**
 * 获取所有能力的键列表
 * @returns 能力键数组
 */
export function getAllCapabilityKeys(): (keyof ModelCapabilities)[] {
  return MODEL_CAPABILITIES.map((c) => c.key);
}
