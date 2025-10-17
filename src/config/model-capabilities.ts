/**
 * 模型能力配置
 *
 * 定义了所有可用的模型能力及其展示信息，包括：
 * - UI 展示标签和描述
 * - 图标组件引用（Element Plus Icons）
 * - 图标颜色和样式
 */

import { markRaw, type Component } from 'vue';
import {
  View,
  Search,
  Tools,
  Document,
  Cpu,
  MagicStick,
  FolderOpened,
} from '@element-plus/icons-vue';

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
  {
    key: "vision",
    label: "视觉",
    description: "支持图像输入 (Vision Language Model)",
    icon: markRaw(View),
    color: "#409eff",
    className: "vision",
  },
  {
    key: "thinking",
    label: "思考",
    description: "启用模型的'思考'模式 (例如 Google Gemini, Anthropic Claude)",
    icon: markRaw(Cpu),
    color: "#9c27b0",
    className: "thinking",
  },
  {
    key: "reasoning",
    label: "推理",
    description: "启用模型的'推理'模式 (例如 OpenAI o-series 模型的 reasoning 参数)",
    icon: markRaw(MagicStick),
    color: "#ff6b9d",
    className: "reasoning",
  },
  {
    key: "webSearch",
    label: "联网",
    description: "支持实时联网搜索获取最新信息",
    icon: markRaw(Search),
    color: "#67c23a",
    className: "web-search",
  },
  {
    key: "toolUse",
    label: "工具",
    description: "支持 Function Calling / Tool Use",
    icon: markRaw(Tools),
    color: "#e6a23c",
    className: "tool-use",
  },
  {
    key: "codeExecution",
    label: "代码",
    description: "支持代码解释器执行代码",
    icon: markRaw(Document),
    color: "#f56c6c",
    className: "code-exec",
  },
  {
    key: "fileSearch",
    label: "文件",
    description: "支持文件搜索和分析功能",
    icon: markRaw(FolderOpened),
    color: "#909399",
    className: "file-search",
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