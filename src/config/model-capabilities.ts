/**
 * 模型能力配置
 *
 * 定义了所有可用的模型能力及其展示信息，包括：
 * - UI 展示标签和描述
 * - 图标组件引用（Lucide Icons）
 * - 图标颜色和样式
 */

import { markRaw, type Component } from 'vue';
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
  PencilLine,
  RefreshCw,
} from 'lucide-vue-next';

/**
 * 能力配置项
 */
export interface CapabilityConfig {
  /** 能力键名（对应 LlmModelInfo.capabilities 中的字段） */
  key: keyof NonNullable<import('../types/llm-profiles').LlmModelInfo['capabilities']>;
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
  // --- 核心与热门能力 ---
  {
    key: "vision",
    label: "视觉",
    description: "支持图像输入 (Vision Language Model)",
    icon: markRaw(Eye),
    color: "#0ea5e9", // Sky 500 - 清澈的视觉
    className: "vision",
  },
  {
    key: "thinking",
    label: "思考",
    description: "启用模型的'思考'或'推理'模式，以进行更复杂的分析和推理。",
    icon: markRaw(BrainCircuit),
    color: "#a855f7", // Purple 500 - 智慧与神秘
    className: "thinking",
  },
  {
    key: "webSearch",
    label: "联网",
    description: "支持实时联网搜索获取最新信息",
    icon: markRaw(Globe),
    color: "#10b981", // Emerald 500 - 畅通的网络
    className: "web-search",
  },
  {
    key: "toolUse",
    label: "工具",
    description: "支持 Function Calling / Tool Use",
    icon: markRaw(Blocks),
    color: "#f97316", // Orange 500 - 实用的工具箱
    className: "tool-use",
  },
  {
    key: "codeExecution",
    label: "代码",
    description: "支持代码解释器执行代码",
    icon: markRaw(Terminal),
    color: "#3b82f6", // Blue 50 - 科技与代码
    className: "code-exec",
  },

  // --- 生成式能力 ---
  {
    key: "imageGeneration",
    label: "图像生成",
    description: "支持文本到图像的生成",
    icon: markRaw(Image),
    color: "#f43f5e", // Rose 500 - 艺术创作
    className: "image-gen",
  },
  {
    key: "videoGeneration",
    label: "视频生成",
    description: "支持文本到视频的生成",
    icon: markRaw(Video),
    color: "#8b5cf6", // Violet 500 - 动态影像
    className: "video-gen",
  },
  {
    key: "musicGeneration",
    label: "音乐生成",
    description: "支持文本到音乐的生成",
    icon: markRaw(Music),
    color: "#d946ef", // Fuchsia 500 - 律动的旋律
    className: "music-gen",
  },

  // --- 交互与迭代能力 ---
  {
    key: "mediaEditing",
    label: "媒体编辑",
    description: "支持以现有媒体为参考进行编辑、变体生成或局部重绘 (Image-to-Image)",
    icon: markRaw(PencilLine),
    color: "#ec4899", // Pink 500
    className: "media-editing",
  },
  {
    key: "iterativeRefinement",
    label: "迭代微调",
    description: "支持通过多轮对话持续优化生成结果 (Conversational Generation)",
    icon: markRaw(RefreshCw),
    color: "#22c55e", // Green 500
    className: "iterative-refinement",
  },

  // --- 多模态输入与处理 ---
  {
    key: "audio",
    label: "音频",
    description: "支持音频输入或输出",
    icon: markRaw(Mic),
    color: "#06b6d4", // Cyan 500 - 清晰的声波
    className: "audio",
  },
  {
    key: "video",
    label: "视频",
    description: "支持视频输入",
    icon: markRaw(Video),
    color: "#8b5cf6", // Violet 500 - 动态影像
    className: "video",
  },
  {
    key: "document",
    label: "文档",
    description: "支持原生文档格式处理 (如 PDF)",
    icon: markRaw(FileText),
    color: "#ef4444", // Red 500 - 致敬 PDF 图标
    className: "document",
  },

  // --- 高级代理与特定功能 ---
  {
    key: "computerUse",
    label: "计算机",
    description: "支持模拟用户操作计算机 (Computer Use)",
    icon: markRaw(Monitor),
    color: "#6366f1", // Indigo 500 - 智能控制
    className: "computer-use",
  },
  {
    key: "fileSearch",
    label: "文件",
    description: "支持文件搜索和分析功能",
    icon: markRaw(FileSearch),
    color: "#eab308", // Yellow 500 - 经典的文件夹色
    className: "file-search",
  },
  {
    key: "jsonOutput",
    label: "JSON",
    description: "支持强制输出 JSON 对象格式",
    icon: markRaw(Braces),
    color: "#f59e0b", // Amber 500 - 结构化数据的颜色
    className: "json-output",
  },

  // --- 开发者特性 ---
  {
    key: "fim",
    label: "FIM",
    description: "支持 Fill In the Middle 补全，用于代码补全等场景",
    icon: markRaw(Code2),
    color: "#2c55e", // Green 500 - 代码补全的绿色
    className: "fim",
  },
  {
    key: "prefixCompletion",
    label: "续写",
    description: "支持对话前缀续写，可从指定前缀继续生成",
    icon: markRaw(MessageSquareMore),
    color: "#0891b2", // Cyan 600 - 延续的流动感
    className: "prefix-completion",
  },

  // --- 底层技术能力 ---
  {
    key: "embedding",
    label: "嵌入",
    description: "支持生成文本嵌入向量 (Embedding)",
    icon: markRaw(Layers),
    color: "#64748b", // Slate 500 - 稳重的底层数据
    className: "embedding",
  },
  {
    key: "rerank",
    label: "重排",
    description: "支持对文档或结果进行重排序 (Rerank)",
    icon: markRaw(ListOrdered),
    color: "#14b8a6", // Teal 500 - 有序整理
    className: "rerank",
  },
] as const;

/**
 * 根据能力键获取配置信息
 * @param key 能力键
 * @returns 能力配置或 undefined
 */
export function getCapabilityConfig(
  key: string
): CapabilityConfig | undefined {
  return MODEL_CAPABILITIES.find((c) => c.key === key);
}

/**
 * 获取所有能力的键列表
 * @returns 能力键数组
 */
export function getAllCapabilityKeys(): string[] {
  return MODEL_CAPABILITIES.map((c) => c.key);
}