import type { MessageRole } from './common';

/**
 * Chat 正则管道类型定义
 *
 * 实现对消息内容的动态清洗、格式转换和角色扮演增强
 * @see design/chat-regex-pipeline.md
 */

// 重导出 MessageRole 类型 (避免类型冲突)
export type { MessageRole } from './common';

// === 宏替换模式 ===
export type SubstitutionMode = 'NONE' | 'RAW' | 'ESCAPED';

/**
 * 单条正则规则 (聊天场景扩展)
 * 最小执行单元，相比 regex-applier 的基础 RegexRule 增加了聊天场景特有配置
 */
export interface ChatRegexRule {
  id: string;
  enabled: boolean;
  name?: string;

  // === 核心：正则配置 ===
  /** 正则表达式 (命名与 regex-applier 保持一致) */
  regex: string;
  /** 替换内容 */
  replacement: string;
  /** 正则标志，默认 'gm' */
  flags?: string;

  // === 聊天场景特有配置 ===
  /** 应用阶段 */
  applyTo: {
    /** 是否应用于渲染层 */
    render: boolean;
    /** 是否应用于请求层 */
    request: boolean;
  };
  /** 目标消息角色 */
  targetRoles: MessageRole[];
  /** 消息深度范围 (0=最新消息) */
  depthRange?: {
    min?: number;
    max?: number;
  };

  // === 宏替换模式 (兼容 SillyTavern) ===
  /** 默认 'NONE' */
  substitutionMode?: SubstitutionMode;
  /** 从捕获组中移除的字符串列表 (后处理) */
  trimStrings?: string[];

  // === 排序与调试 ===
  /** 组内排序 */
  order?: number;
  /** 测试用例 */
  testInput?: string;
}

/**
 * 正则预设 (规则组)
 * 规则的容器，与 regex-applier 的 RegexPreset 概念一致
 */
export interface ChatRegexPreset {
  id: string;
  /** 预设名称 (如 "Markdown清洗", "猫娘口癖") */
  name: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
  /** 预设级开关 (关闭后内部所有规则失效) */
  enabled: boolean;
  /** 规则列表 */
  rules: ChatRegexRule[];
  /** 预设间排序 */
  order?: number;
}

/**
 * 配置根对象
 * 用于 Global、Agent、User 三层配置
 */
export interface ChatRegexConfig {
  presets: ChatRegexPreset[];
}

// === 工厂函数 ===

/**
 * 创建默认的空配置
 */
export function createDefaultChatRegexConfig(): ChatRegexConfig {
  return {
    presets: [],
  };
}

/**
 * 创建新的规则预设
 */
export function createChatRegexPreset(
  name: string,
  partial?: Partial<ChatRegexPreset>,
): ChatRegexPreset {
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    rules: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

/**
 * 创建新的正则规则
 */
export function createChatRegexRule(partial?: Partial<ChatRegexRule>): ChatRegexRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    regex: '',
    replacement: '',
    flags: 'gm',
    applyTo: {
      render: true,
      request: false,
    },
    targetRoles: ['system', 'user', 'assistant'],
    substitutionMode: 'NONE',
    ...partial,
  };
}
